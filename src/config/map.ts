// Mappa della città a tessere. Ogni tessera è TILE metri.
// La città è una griglia di isolati 3×3 separati da strade: la pianta degli
// isolati (BLOCK_PLAN) si trasforma in tessere con i modelli qui sotto.
//
// Tessere:
//   #  strada (la forma si calcola dai vicini)
//   .  prato / cortile
//   h  casa                                H  casa del giocatore
//   b  negozio / palazzo basso            B  palazzo alto
//   R  ristorante (lavoro lavapiatti)     M  bacheca missioni
//   t  alberi / parco                     p  piazza pavimentata
//   V  concessionaria veicoli             A  agenzia affari
//   altri caratteri: lotti in vendita (vedi LOTS)

/**
 * Scala del mondo: case, strade, alberi e distanze sono più grandi di così rispetto
 * al personaggio (che resta della sua misura), per avere più spazio attorno alle cose.
 */
export const WS = 1.35;
export const TILE = 6 * WS;

/**
 * Tipi di isolato:
 *   C commerciale · c commerciale con ristorante · S piazza con bacheca
 *   H case · h case sparse (periferia) · P parco · m case con negozi sulla strada
 *   T parco con piazzola per food truck
 */
const TEMPLATES: Record<string, string[]> = {
  C: ['bBb', 'b.b', 'bbb'],
  c: ['bBb', 'b.b', 'bRb'],
  S: ['ppp', 'pMp', 'ppp'],
  H: ['hhh', 'hth', 'hhh'],
  h: ['hhh', 'h.h', 'hth'],
  P: ['ttt', 'ttt', 'ttt'],
  m: ['hhh', 'hth', 'bbb'],
  T: ['ttt', 't.t', 'ppp'],
};

/** Pianta 9×9 degli isolati, da nord (alto) a sud. Il centro è in mezzo. */
const BLOCK_PLAN = [
  'hhPhThPmh',
  'hHmHHmHhP',
  'PmHTmHmHh',
  'hHmCcCmHT',
  'TPcCSCcPh',
  'hHmCcCmHh',
  'hmHPmHPmh',
  'PHhHTHhHP',
  'hmThhPhhh',
];

/** Posizioni speciali: [riga isolato, colonna isolato, riga interna, colonna interna, carattere]. */
const SPECIAL: [number, number, number, number, string][] = [
  // luoghi
  [3, 3, 2, 1, 'V'],
  [5, 5, 2, 1, 'A'],
  [6, 5, 2, 1, 'H'],
  // posteggi per food truck
  [8, 2, 2, 1, '1'],
  [0, 4, 2, 1, '5'],
  [4, 0, 2, 1, 'x'],
  [3, 8, 2, 1, 'y'],
  [7, 4, 2, 1, '2'],
  [2, 3, 2, 1, '4'],
  [4, 4, 2, 1, '3'],
  // locali per negozi e imprese
  [8, 1, 2, 1, '0'],
  [0, 7, 2, 1, 'z'],
  [1, 2, 2, 1, '9'],
  [2, 1, 2, 1, '8'],
  [6, 1, 2, 1, 'w'],
  [1, 5, 2, 1, 'q'],
  [5, 6, 2, 1, 'k'],
  [3, 3, 2, 0, '7'],
  [3, 5, 2, 0, 'j'],
  [5, 3, 2, 0, '6'],
];

function buildMap() {
  const n = BLOCK_PLAN.length;
  const size = n * 4 + 1;
  const grid: string[][] = [];
  for (let r = 0; r < size; r++) {
    grid.push([]);
    for (let c = 0; c < size; c++) grid[r].push(r % 4 === 0 || c % 4 === 0 ? '#' : '.');
  }
  BLOCK_PLAN.forEach((row, br) =>
    [...row].forEach((k, bc) => {
      TEMPLATES[k].forEach((line, ir) => [...line].forEach((ch, ic) => (grid[br * 4 + 1 + ir][bc * 4 + 1 + ic] = ch)));
    }),
  );
  for (const [br, bc, ir, ic, ch] of SPECIAL) grid[br * 4 + 1 + ir][bc * 4 + 1 + ic] = ch;
  return grid.map((r) => r.join(''));
}

export const CITY_MAP = buildMap();

export type ZoneId = 'centro' | 'residenziale' | 'periferia';

export const ZONES: Record<ZoneId, { name: string; demand: number; color: string }> = {
  centro: { name: 'Centro', demand: 1.8, color: '#f0b429' },
  residenziale: { name: 'Residenziale', demand: 1.3, color: '#7cc47f' },
  periferia: { name: 'Periferia', demand: 1.0, color: '#8fb3ff' },
};

/** Zona in base alla distanza dell'isolato dal centro città. */
export function zoneAt(col: number, row: number): ZoneId {
  const mid = (BLOCK_PLAN.length - 1) / 2;
  const d = Math.max(Math.abs(Math.floor((row - 1) / 4) - mid), Math.abs(Math.floor((col - 1) / 4) - mid));
  if (d <= 1) return 'centro';
  if (d <= 3) return 'residenziale';
  return 'periferia';
}

export interface LotDef {
  id: string;
  char: string;
  name: string;
  /** truck = posteggio all'aperto · shop = locale in un edificio */
  kind: 'truck' | 'shop';
  price: number;
  /** affitto o canone mensile */
  rent: number;
}

export const LOTS: LotDef[] = [
  { id: 'lot1', char: '1', kind: 'truck', name: 'Parco di periferia', price: 900, rent: 120 },
  { id: 'lotb', char: 'x', kind: 'truck', name: 'Parco ovest', price: 1000, rent: 125 },
  { id: 'lot5', char: '5', kind: 'truck', name: 'Giardini nord', price: 1100, rent: 130 },
  { id: 'lotc', char: 'y', kind: 'truck', name: 'Parco est', price: 1200, rent: 140 },
  { id: 'lot2', char: '2', kind: 'truck', name: 'Largo residenziale', price: 2200, rent: 280 },
  { id: 'lot4', char: '4', kind: 'truck', name: 'Parco dei tigli', price: 2600, rent: 300 },
  { id: 'lot3', char: '3', kind: 'truck', name: 'Piazza del centro', price: 5500, rent: 650 },
  { id: 'lot0', char: '0', kind: 'shop', name: 'Bottega di periferia', price: 4000, rent: 250 },
  { id: 'loti', char: 'z', kind: 'shop', name: 'Bottega del borgo', price: 4500, rent: 270 },
  { id: 'lotd', char: 'w', kind: 'shop', name: 'Locale in via Verdi', price: 7000, rent: 420 },
  { id: 'lot9', char: '9', kind: 'shop', name: 'Negozio in via dei Pini', price: 7500, rent: 450 },
  { id: 'lotg', char: 'q', kind: 'shop', name: 'Negozio in via Manzoni', price: 7800, rent: 460 },
  { id: 'lot8', char: '8', kind: 'shop', name: 'Locale sul viale', price: 8500, rent: 500 },
  { id: 'lote', char: 'k', kind: 'shop', name: 'Locale in piazza Garibaldi', price: 9000, rent: 520 },
  { id: 'lot7', char: '7', kind: 'shop', name: 'Negozio in corso Roma', price: 16000, rent: 1100 },
  { id: 'lotf', char: 'j', kind: 'shop', name: 'Vetrina in via Dante', price: 18000, rent: 1200 },
  { id: 'lot6', char: '6', kind: 'shop', name: 'Vetrina in centro', price: 20000, rent: 1300 },
];
