// Punto di partenza delle anteprime: ogni proposta ha il suo file src/anteprime/<numero>.json (lo scrive Claude insieme
// alla modifica) che mette il giocatore subito nella situazione della modifica, senza dover giocare per arrivarci:
//   { "cosa": "Prova la nuova velocità", "veicolo": "utilitaria" }                 → in città, già in macchina
//   { "cosa": "Clienti più lenti", "lavoretto": "bar", "gradino": 1 }              → dentro il lavoretto (gradino da 1)
//   { "cosa": "Nuovo bancone", "attivita": "foodtruck" }                           → attività già comprata, dentro
//   { "cosa": "Vendi l'attività", "attivita": "foodtruck", "scheda": "panoramica" } → attività comprata, sua finestra
//   { "cosa": "Nuova auto", "soldi": 50000, "apri": "concessionaria" }             → una finestra del gioco già aperta
//   { "cosa": "Assicurazione", "sfida": "blackjack", "trucco": "asso-banco" }      → seduto al tavolo di prova
//   { "cosa": "Rilancio", "sfida": "poker", "bot": 2 }                             → poker contro 2 bot
//   { "cosa": "Tocca il tasto Proponi", "tester": true }                          → come su un telefono tester (senza invio)
// "possiede" dà in più attività e veicoli già comprati; "soldi" i soldi in tasca. Il link "Gioca l'anteprima" delle
// app (?subito) apre direttamente qui, senza menu. Nel gioco vero non si usa mai (solo con previewPr).
import { BUSINESS_TYPES, bizType, upgOf, upgradeIdsFor, type BusinessType } from './config/business';
import { careerLine } from './config/careers';
import { hasInterior } from './config/recipes';
import { VEHICLES, type VehicleId } from './config/vehicles';
import type { Game } from './game';
import { previewPr } from './preview';
import { toast } from './sim/bus';
import { bizAtLot, buyLot, hasCashUpgrade, isOpenHour, lotPrice, typesForLot } from './sim/economy';
import { currentSlot } from './sim/state';
import { BJ_MAX_BUY_X, BlackjackTable, type BjState } from './ui/blackjack';
import { casino, MAX_BUY_BB, pokerName, PokerTable, STAKES, type CasinoGame, type PkState } from './ui/poker';

/** finestre del gioco che l'anteprima può aprire subito */
const SCREENS = {
  negozio: (g: Game) => g.ui.openShop(),
  concessionaria: (g: Game) => g.ui.openDealer(),
  garage: (g: Game) => g.ui.openGarage(),
  immobiliare: (g: Game) => g.ui.openRealEstate(),
  agenzia: (g: Game) => g.ui.openAgency(),
  stile: (g: Game) => g.ui.openStyle(),
  attivita: (g: Game) => g.ui.openBusinessList(),
  profilo: (g: Game) => g.ui.openProfile(),
  abilita: (g: Game) => g.ui.openSkills(),
  statistiche: (g: Game) => g.ui.openStats(),
  mappa: (g: Game) => g.ui.openMap(),
  missioni: (g: Game) => g.ui.openMissions(),
  calendario: (g: Game) => g.ui.openCalendar(),
  classifica: (g: Game) => g.ui.openLeaderboard(),
  amici: (g: Game) => g.ui.openFriends(),
  casa: (g: Game) => g.ui.openHome(),
  logo: (g: Game) => g.ui.openLogoEditor(),
  opzioni: (g: Game) => g.ui.openSettings(),
  sfide: (g: Game) => g.ui.openMulti(),
} as const;
export type PreviewScreen = keyof typeof SCREENS;

export interface PreviewStart {
  /** cosa provare, in poche parole (compare all'avvio) */
  cosa?: string;
  /** soldi in tasca all'inizio (almeno questi) */
  soldi?: number;
  /** attività e veicoli già posseduti (es. per provare a venderli o usarli) */
  possiede?: { attivita?: BusinessType[]; veicoli?: VehicleId[] };
  /** parte in città già sopra questo veicolo */
  veicolo?: VehicleId;
  /** parte dentro questo lavoretto (id della linea in src/config/careers.ts) */
  lavoretto?: string;
  /** gradino della linea, da 1 (default 1) */
  gradino?: number;
  /** attività già comprata: si entra dentro, o con "scheda" si apre la sua finestra su quella scheda */
  attivita?: BusinessType;
  /** con "attivita": scheda della sua finestra (es. "panoramica", "migliorie", "ordini", "lavori") */
  scheda?: string;
  /** con "attivita": migliorie al massimo, un sacco di soldi e tutti gli altri locali già comprati (nessun locale libero) */
  tuttoPieno?: boolean;
  /** apre subito questa finestra del gioco */
  apri?: PreviewScreen;
  /** seduto subito a un tavolo di prova del casinò (fiches finte; nel poker contro i bot) */
  sfida?: 'poker' | 'blackjack';
  /** poker: quanti bot al tavolo, da 1 a 3 (default 1) */
  bot?: number;
  /** tavolo truccato per vedere subito la regola nuova: "asso-banco" = nel blackjack il banco mostra sempre un asso */
  trucco?: 'asso-banco';
  /** come un telefono tester: tasto e scheda "Proponi" (nelle anteprime la proposta non si invia) */
  tester?: boolean;
}

const files = import.meta.glob<PreviewStart>('./anteprime/*.json', { eager: true, import: 'default' });

/** punto di partenza dell'anteprima aperta, o null (gioco vero o anteprima senza file) */
export const previewStart: PreviewStart | null = previewPr === null ? null : files[`./anteprime/${previewPr}.json`] ?? null;

/** link "Gioca l'anteprima" delle app (?subito): si salta il menu e si parte già dalla parte cambiata */
export const previewNow = previewPr !== null && new URLSearchParams(location.search).has('subito');

/** compra un'attività su un posto libero (soldi dati apposta) */
function giveBusiness(game: Game, type: BusinessType, lotId?: string) {
  const s = game.state;
  const lot = game.city.lots.find((l) => (lotId ? l.id === lotId : l.kind === bizType(type).lot) && !bizAtLot(s, l.id));
  if (!lot) return null;
  s.money += lotPrice(lot.id, type);
  return buyLot(s, lot.id, type);
}

/** seduto a un tavolo di prova (fiches finte, i soldi portati tornano uscendo) */
async function sitAtTable(game: Game, p: PreviewStart) {
  const kind: CasinoGame = p.sfida === 'poker' ? 'poker' : 'bj';
  const buy = STAKES[0][1] * (kind === 'bj' ? BJ_MAX_BUY_X / 2 : MAX_BUY_BB);
  // le fiches si comprano con soldi dati apposta: in tasca restano quelli di partenza (o "soldi")
  game.state.money = Math.max(game.state.money, p.soldi ?? 0) + buy;
  toast('Mi siedo al tavolo di prova…', 'info');
  try {
    // ripartendo, il tavolo di prova di prima si lascia (un tavolo alla volta)
    for (const g of ['poker', 'bj'] as const) {
      const w = await casino<{ code: string | null }>(g, 'where', {}, 60000);
      if (w.code) await casino(g, 'leave', { code: w.code }, 20000);
    }
    const j = await casino<{ code: string; bought: number; state: PkState | BjState }>(kind, 'create', {
      nickname: pokerName(game), slot: currentSlot, stake: 0, buy, fame: 0, bots: p.bot ?? 1, trucco: p.trucco,
    });
    game.state.money -= j.bought;
    game.save();
    game.ui.close();
    if (kind === 'bj') new BlackjackTable(game, j.code, j.state as BjState, j.bought, () => {}).open();
    else new PokerTable(game, j.code, j.state as PkState, j.bought, () => {}).open();
    if (p.cosa) toast(p.cosa, 'info');
  } catch (e) {
    toast(`Tavolo di prova non pronto: ${(e as Error).message}`, 'bad');
    game.ui.openCasino(kind);
  }
}

/** Porta la partita appena creata nella situazione indicata dal file dell'anteprima. */
export function applyPreviewStart(game: Game, p: PreviewStart) {
  const s = game.state;
  if (p.soldi) s.money = Math.max(s.money, p.soldi);
  for (const v of p.possiede?.veicoli ?? []) if (v in VEHICLES && !s.vehicles.includes(v)) s.vehicles.push(v);
  for (const t of p.possiede?.attivita ?? []) if (t in BUSINESS_TYPES) giveBusiness(game, t);
  if (p.sfida) void sitAtTable(game, p);
  else if (p.attivita && p.attivita in BUSINESS_TYPES) {
    const type = p.attivita;
    const b = giveBusiness(game, type);
    if (b && p.tuttoPieno) {
      // migliorie al massimo e tutti gli altri locali già comprati: niente locale libero per evolvere
      for (const id of upgradeIdsFor(type, hasInterior(type), hasCashUpgrade(type))) b.upgrades[id] = upgOf(type, id).max;
      for (const lot of game.city.lots) {
        const t = typesForLot(lot.id)[0];
        if (t && !bizAtLot(s, lot.id)) giveBusiness(game, t, lot.id);
      }
      s.money = Math.max(s.money, 1_000_000);
    }
    if (b) {
      const kind = bizType(type).kind;
      if (p.scheda) game.ui.openBusiness(b.id, p.scheda);
      else {
        if (!isOpenHour(s)) game.sleep();
        if (kind === 'craft' || kind === 'service' || !hasInterior(type)) game.ui.openBusiness(b.id, kind === 'craft' ? 'lavori' : 'ordini');
        else game.enterBusiness(b.lotId);
      }
    }
  } else if (p.lavoretto && careerLine(p.lavoretto)) {
    const max = careerLine(p.lavoretto)!.ladder.length;
    game.ui.playJobNow(p.lavoretto, Math.min(max, Math.max(1, p.gradino ?? 1)) - 1);
  } else if (p.veicolo && p.veicolo in VEHICLES) {
    if (!s.vehicles.includes(p.veicolo)) s.vehicles.push(p.veicolo);
    game.mount(p.veicolo);
  }
  if (p.apri && p.apri in SCREENS && !p.sfida) SCREENS[p.apri](game);
  game.save();
  // al tavolo il messaggio arriva quando ci si è seduti
  if (p.cosa && !p.sfida) toast(p.cosa, 'info');
}
