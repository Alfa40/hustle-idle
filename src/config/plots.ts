import type { ZoneId } from './map';

/**
 * Terreni edificabili: quando i posti in vendita finiscono, si compra un terreno, si fanno i lavori per
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
  rifiuti: { name: 'Sgombera i rifiuti', icon: '🗑️', issue: 'Rifiuti abbandonati', cost: 900, hours: 6 },
  alberi: { name: 'Taglia alberi e radici', icon: '🌳', issue: 'Alberi e radici', cost: 1600, hours: 10 },
  dislivello: { name: 'Livella il terreno', icon: '📐', issue: 'Terreno in pendenza', cost: 2600, hours: 14 },
  acqua: { name: "Drena l'acqua", icon: '💧', issue: 'Terreno fangoso', cost: 3200, hours: 18 },
  rocce: { name: 'Scava le rocce', icon: '🚜', issue: 'Rocce nel terreno', cost: 3800, hours: 20 },
  rudere: { name: 'Demolisci il rudere', icon: '🧱', issue: 'Vecchio rudere', cost: 4500, hours: 24 },
  bonifica: { name: 'Bonifica il terreno', icon: '🧪', issue: 'Terreno inquinato', cost: 7000, hours: 36 },
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
}

export const SIZES: Record<SizeId, SizeDef> = {
  piccolo: { name: 'Palazzina', icon: '🏪', shops: 3, cost: 24000, days: 2 },
  medio: { name: 'Palazzo', icon: '🏢', shops: 6, cost: 60000, days: 4 },
  grande: { name: 'Grattacielo', icon: '🏙️', shops: 10, cost: 125000, days: 7 },
};

/** costruire e sistemare costa di più dove c'è più passaggio */
export const ZONE_COST: Record<ZoneId, number> = { periferia: 1, residenziale: 1.5, centro: 2.4 };
/** spese del palazzo al mese per ogni negozio aperto dentro (al posto dell'affitto) */
export const FLOOR_RENT: Record<ZoneId, number> = { periferia: 110, residenziale: 210, centro: 480 };
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
  { id: 'terreno1', char: '!', name: 'Terreno in via dei Gelsi', price: 6000, works: ['rifiuti', 'alberi'] },
  { id: 'terreno2', char: '@', name: 'Terreno vicino al fiume', price: 5500, works: ['acqua', 'alberi'] },
  { id: 'terreno3', char: '$', name: 'Terreno della vecchia fabbrica', price: 7000, works: ['rudere', 'bonifica'] },
  { id: 'terreno4', char: '%', name: 'Terreno in collina', price: 6500, works: ['dislivello', 'rocce'] },
  { id: 'terreno5', char: '&', name: 'Terreno in via Garibaldi', price: 14000, works: ['rudere', 'rifiuti'] },
  { id: 'terreno6', char: '*', name: 'Terreno dietro al teatro', price: 15000, works: ['alberi', 'dislivello'] },
  { id: 'terreno7', char: '+', name: 'Terreno in piazza Cavour', price: 16000, works: ['acqua', 'rocce', 'rifiuti'] },
  { id: 'terreno8', char: '=', name: 'Terreno in corso Italia', price: 38000, works: ['rudere'] },
  { id: 'terreno9', char: '~', name: 'Terreno vicino al municipio', price: 42000, works: ['rifiuti', 'dislivello'] },
];

export const plotDef = (id: string) => PLOTS.find((p) => p.id === id);

/** id del negozio al piano `n` (1…) del palazzo sul terreno */
export const floorLotId = (plotId: string, n: number) => `${plotId}-p${n}`;

/** terreno e piano di un negozio nel palazzo (null se il lotto è uno normale) */
export function parseFloorLot(lotId: string): { plot: string; floor: number } | null {
  const m = /^(terreno\d+)-p(\d+)$/.exec(lotId);
  return m ? { plot: m[1], floor: +m[2] } : null;
}
