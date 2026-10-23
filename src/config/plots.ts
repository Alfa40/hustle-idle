import type { ZoneId } from './map';

/**
 * Terreni edificabili: l'ultima spiaggia per allargarsi, per chi ha attività tutte redditizie e non vuole
 * venderne. Costano molto e le opzioni più grandi chiedono fama (`ZONE_FAME`, `SizeDef.fame`). Quando i posti in vendita finiscono, si compra un terreno, si fanno i lavori per
 * sistemarlo (dipendono da com'è: rudere, rifiuti, alberi, acqua…) e ci si costruisce un palazzo.
 * Ogni piano del palazzo è un negozio tuo (lotto `shop` con id `<terreno>-p<n>`): più grande il palazzo,
 * più negozi. Lo stato di ogni terreno è in `GameState.plots` (sim/plots.ts).
 */

export type WorkId = 'rifiuti' | 'alberi' | 'rudere' | 'dislivello' | 'acqua' | 'rocce' | 'bonifica';

export interface WorkDef {
  name: string;
  icon: string;
  /** cosa c'è che non va (si vede sul terreno) */
  issue: string;
  cost: number;
  /** ore di gioco */
  hours: number;
}

export const WORKS: Record<WorkId, WorkDef> = {
  rifiuti: { name: 'Sgombera i rifiuti', icon: '🗑️', issue: 'Rifiuti abbandonati', cost: 9000, hours: 6 },
  alberi: { name: 'Taglia alberi e radici', icon: '🌳', issue: 'Alberi e radici', cost: 16000, hours: 10 },
  dislivello: { name: 'Livella il terreno', icon: '📐', issue: 'Terreno in pendenza', cost: 26000, hours: 14 },
  acqua: { name: "Drena l'acqua", icon: '💧', issue: 'Terreno fangoso', cost: 32000, hours: 18 },
  rocce: { name: 'Scava le rocce', icon: '🚜', issue: 'Rocce nel terreno', cost: 38000, hours: 20 },
  rudere: { name: 'Demolisci il rudere', icon: '🧱', issue: 'Vecchio rudere', cost: 45000, hours: 24 },
  bonifica: { name: 'Bonifica il terreno', icon: '🧪', issue: 'Terreno inquinato', cost: 70000, hours: 36 },
};

export type SizeId = 'piccolo' | 'medio' | 'grande';

export interface SizeDef {
  name: string;
  icon: string;
  /** negozi (uno per piano) */
  shops: number;
  cost: number;
  /** giorni di cantiere */
  days: number;
  /** fama totale che serve per costruirlo (0 = nessuna) */
  fame: number;
  /** manutenzione del palazzo al mese (× zona), anche con i piani vuoti */
  upkeep: number;
}

export const SIZES: Record<SizeId, SizeDef> = {
  piccolo: { name: 'Palazzina', icon: '🏪', shops: 3, cost: 450_000, days: 3, fame: 0, upkeep: 4000 },
  medio: { name: 'Palazzo', icon: '🏢', shops: 6, cost: 1_100_000, days: 6, fame: 700, upkeep: 10_000 },
  grande: { name: 'Grattacielo', icon: '🏙️', shops: 10, cost: 2_500_000, days: 10, fame: 1500, upkeep: 25_000 },
};

/** costruire e sistemare costa di più dove c'è più passaggio */
export const ZONE_COST: Record<ZoneId, number> = { periferia: 1, residenziale: 1.5, centro: 2.4 };
/** spese del palazzo al mese per ogni negozio aperto dentro (al posto dell'affitto) */
export const FLOOR_RENT: Record<ZoneId, number> = { periferia: 600, residenziale: 1200, centro: 2500 };
/** fama totale per comprare un terreno in questa zona (in centro solo chi è già famoso) */
export const ZONE_FAME: Record<ZoneId, number> = { periferia: 0, residenziale: 300, centro: 700 };
/** con una tua impresa di costruzioni o ristrutturazioni i lavori del terreno costano la metà */
export const OWN_CREW_DISCOUNT = 0.5;

export interface PlotDef {
  id: string;
  /** carattere nella pianta della città (config/map.ts: SPECIAL) */
  char: string;
  name: string;
  price: number;
  works: WorkId[];
}

export const PLOTS: PlotDef[] = [
  { id: 'terreno1', char: '!', name: 'Terreno in via dei Gelsi', price: 150_000, works: ['rifiuti', 'alberi'] },
  { id: 'terreno2', char: '@', name: 'Terreno vicino al fiume', price: 140_000, works: ['acqua', 'alberi'] },
  { id: 'terreno3', char: '$', name: 'Terreno della vecchia fabbrica', price: 170_000, works: ['rudere', 'bonifica'] },
  { id: 'terreno4', char: '%', name: 'Terreno in collina', price: 160_000, works: ['dislivello', 'rocce'] },
  { id: 'terreno5', char: '&', name: 'Terreno in via Garibaldi', price: 320_000, works: ['rudere', 'rifiuti'] },
  { id: 'terreno6', char: '*', name: 'Terreno dietro al teatro', price: 340_000, works: ['alberi', 'dislivello'] },
  { id: 'terreno7', char: '+', name: 'Terreno in piazza Cavour', price: 360_000, works: ['acqua', 'rocce', 'rifiuti'] },
  { id: 'terreno8', char: '=', name: 'Terreno in corso Italia', price: 750_000, works: ['rudere'] },
  { id: 'terreno9', char: '~', name: 'Terreno vicino al municipio', price: 800_000, works: ['rifiuti', 'dislivello'] },
];

export const plotDef = (id: string) => PLOTS.find((p) => p.id === id);

/** id del negozio al piano `n` (1…) del palazzo sul terreno */
export const floorLotId = (plotId: string, n: number) => `${plotId}-p${n}`;

/** terreno e piano di un negozio nel palazzo (null se il lotto è uno normale) */
export function parseFloorLot(lotId: string): { plot: string; floor: number } | null {
  const m = /^(terreno\d+)-p(\d+)$/.exec(lotId);
  return m ? { plot: m[1], floor: +m[2] } : null;
}
