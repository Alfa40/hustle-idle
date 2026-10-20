// Punto di partenza delle anteprime: ogni proposta può avere il suo file src/anteprime/<numero>.json (lo scrive
// Claude insieme alla modifica) che dice dove far partire "Gioca subito", così si prova subito la parte cambiata:
//   { "cosa": "Prova la nuova velocità", "veicolo": "utilitaria" }          → in città, già in macchina
//   { "cosa": "Clienti più lenti", "lavoretto": "bar", "gradino": 1 }       → dentro il lavoretto (gradino da 1)
//   { "cosa": "Nuovo bancone", "attivita": "foodtruck" }                    → attività già comprata, dentro
//   { "cosa": "Tocca il tasto Proponi", "tester": true }                    → come su un telefono tester (senza invio)
// Nel gioco vero non si usa mai (solo con previewPr). Senza file: partita nuova normale.
import { BUSINESS_TYPES, bizType, type BusinessType } from './config/business';
import { careerLine } from './config/careers';
import { hasInterior } from './config/recipes';
import { VEHICLES, type VehicleId } from './config/vehicles';
import type { Game } from './game';
import { previewPr } from './preview';
import { toast } from './sim/bus';
import { bizAtLot, buyLot, isOpenHour, lotPrice } from './sim/economy';

export interface PreviewStart {
  /** cosa provare, in poche parole (compare all'avvio) */
  cosa?: string;
  /** parte in città già sopra questo veicolo */
  veicolo?: VehicleId;
  /** parte dentro questo lavoretto (id della linea in src/config/careers.ts) */
  lavoretto?: string;
  /** gradino della linea, da 1 (default 1) */
  gradino?: number;
  /** parte dentro questa attività, già comprata */
  attivita?: BusinessType;
  /** soldi in tasca all'inizio */
  soldi?: number;
  /** come un telefono tester: tasto e scheda "Proponi" (nelle anteprime la proposta non si invia) */
  tester?: boolean;
}

const files = import.meta.glob<PreviewStart>('./anteprime/*.json', { eager: true, import: 'default' });

/** punto di partenza dell'anteprima aperta, o null (gioco vero o anteprima senza file) */
export const previewStart: PreviewStart | null = previewPr === null ? null : files[`./anteprime/${previewPr}.json`] ?? null;

/** Porta la partita appena creata nel punto indicato dal file dell'anteprima. */
export function applyPreviewStart(game: Game, p: PreviewStart) {
  const s = game.state;
  if (p.soldi) s.money = Math.max(s.money, p.soldi);
  if (p.attivita && p.attivita in BUSINESS_TYPES) {
    const type = p.attivita;
    const lot = game.city.lots.find((l) => l.kind === bizType(type).lot && !bizAtLot(s, l.id));
    if (lot) {
      s.money += lotPrice(lot.id, type);
      const b = buyLot(s, lot.id, type);
      if (b) {
        if (!isOpenHour(s)) game.sleep();
        const kind = bizType(type).kind;
        if (kind === 'craft' || kind === 'service' || !hasInterior(type)) game.ui.openBusiness(b.id, kind === 'craft' ? 'lavori' : 'ordini');
        else game.enterBusiness(lot.id);
      }
    }
  } else if (p.lavoretto && careerLine(p.lavoretto)) {
    const max = careerLine(p.lavoretto)!.ladder.length;
    game.ui.playJobNow(p.lavoretto, Math.min(max, Math.max(1, p.gradino ?? 1)) - 1);
  } else if (p.veicolo && p.veicolo in VEHICLES) {
    if (!s.vehicles.includes(p.veicolo)) s.vehicles.push(p.veicolo);
    game.mount(p.veicolo);
  }
  game.save();
  if (p.cosa) toast(p.cosa, 'info');
}
