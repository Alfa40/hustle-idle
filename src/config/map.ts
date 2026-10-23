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

/**
 * Pianta 13×13 degli isolati, da nord (alto) a sud. Il centro è in mezzo.
 * Le 9 righe/colonne interne sono la città originale; attorno un anello di
 * 2 isolati di nuovi quartieri (più vie, case, palazzi, parchi, negozi e ristoranti).
 */
const BLOCK_PLAN = [
  'PhhmhPhThhmhP',
  'hHmcHhmHPhcHh',
  'mHhhPhThPmhHm',
  'hchHmHHmHhPPh',
  'PhPmHTmHmHhcH',
  'hmhHmCcCmHThm',
  'TcTTcCSCcThcP',
  'hmhHmCcCmHhmh',
  'PhhmHTmHPmhHT',
  'mHPHhHTHhHPcm',
  'hchmThhPhhhHh',
  'hHmPhcHmhTmHh',
  'PhhThmhPhhmhP',
];

/** I lotti e i luoghi sono indicati nella pianta originale 9×9: si spostano di 2 isolati. */
const OFF = 2;

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
  // posti nuovi (anche nei quartieri attorno: righe e colonne da −2 a 10)
  [-2, 5, 2, 1, 'a'],
  [4, -2, 2, 1, 'd'],
  [9, 7, 2, 1, 'e'],
  [10, 1, 2, 1, 'f'],
  [6, 10, 2, 1, 'g'],
  [4, 1, 2, 1, 'i'],
  [4, 7, 2, 1, 'l'],
  [6, 3, 2, 1, 'n'],
  [-1, 0, 2, 1, 'o'],
  [0, 10, 2, 1, 'r'],
  [3, -1, 2, 1, 's'],
  [5, 9, 2, 1, 'u'],
  [7, -2, 2, 1, 'v'],
  [9, 5, 2, 1, 'D'],
  [10, 8, 2, 1, 'E'],
  [2, 4, 2, 1, 'F'],
  [2, 6, 2, 1, 'G'],
  [3, 2, 2, 1, 'I'],
  [3, 6, 2, 1, 'J'],
  [5, 2, 2, 1, 'K'],
  [6, 4, 2, 1, 'L'],
  [6, 7, 2, 1, 'N'],
  [4, 2, 2, 0, 'O'],
  [4, 6, 2, 2, 'Q'],
  [3, 5, 2, 2, 'U'],
  [5, 3, 2, 2, 'W'],
  [3, 4, 2, 0, 'X'],
  [5, 4, 2, 2, 'Y'],
  [5, 5, 2, 2, 'Z'],
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
  for (const [br, bc, ir, ic, ch] of SPECIAL) grid[(br + OFF) * 4 + 1 + ir][(bc + OFF) * 4 + 1 + ic] = ch;
  return grid.map((r) => r.join(''));
}

export const CITY_MAP = buildMap();

/** Metà lato (in metri) della città originale 9×9: case comprate e salvataggi si riferiscono a quella. */
export const OLD_HALF = ((9 * 4 + 1) * TILE) / 2;

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
  // la vecchia periferia e i nuovi quartieri esterni
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
  // posti nuovi: più posteggi e negozi in ogni zona, per potersi allargare
  { id: 'lot10', char: 'a', kind: 'truck', name: 'Parco del faro', price: 1050, rent: 125 },
  { id: 'lot11', char: 'd', kind: 'truck', name: 'Parco della stazione', price: 1150, rent: 130 },
  { id: 'lot12', char: 'e', kind: 'truck', name: 'Giardini sud', price: 1250, rent: 135 },
  { id: 'lot13', char: 'f', kind: 'truck', name: 'Parco del fiume', price: 1300, rent: 140 },
  { id: 'lot14', char: 'g', kind: 'truck', name: 'Parco delle rose', price: 1400, rent: 150 },
  { id: 'lot15', char: 'i', kind: 'truck', name: 'Parco del mercato', price: 2300, rent: 280 },
  { id: 'lot16', char: 'l', kind: 'truck', name: 'Largo delle fontane', price: 2500, rent: 290 },
  { id: 'lot17', char: 'n', kind: 'truck', name: 'Giardini del teatro', price: 2800, rent: 310 },
  { id: 'lot18', char: 'o', kind: 'shop', name: 'Bottega in via del Mulino', price: 4200, rent: 255 },
  { id: 'lot19', char: 'r', kind: 'shop', name: 'Bottega del porto', price: 4400, rent: 265 },
  { id: 'lot20', char: 's', kind: 'shop', name: 'Negozio in via dei Campi', price: 4600, rent: 275 },
  { id: 'lot21', char: 'u', kind: 'shop', name: 'Bottega in via Leopardi', price: 4800, rent: 285 },
  { id: 'lot22', char: 'v', kind: 'shop', name: 'Negozio della stazione', price: 5000, rent: 295 },
  { id: 'lot23', char: 'D', kind: 'shop', name: 'Bottega in via del Lago', price: 5100, rent: 300 },
  { id: 'lot24', char: 'E', kind: 'shop', name: 'Negozio in via Pascoli', price: 5200, rent: 305 },
  { id: 'lot25', char: 'F', kind: 'shop', name: 'Locale in via Mazzini', price: 7200, rent: 430 },
  { id: 'lot26', char: 'G', kind: 'shop', name: 'Negozio in via Cavour', price: 7400, rent: 440 },
  { id: 'lot27', char: 'I', kind: 'shop', name: 'Locale in via Petrarca', price: 7700, rent: 455 },
  { id: 'lot28', char: 'J', kind: 'shop', name: 'Negozio in via Colombo', price: 8000, rent: 470 },
  { id: 'lot29', char: 'K', kind: 'shop', name: 'Locale in via Puccini', price: 8200, rent: 485 },
  { id: 'lot30', char: 'L', kind: 'shop', name: 'Negozio in via Vivaldi', price: 8400, rent: 495 },
  { id: 'lot31', char: 'N', kind: 'shop', name: 'Locale in via Galilei', price: 8800, rent: 510 },
  { id: 'lot32', char: 'O', kind: 'shop', name: 'Locale in piazza Navona', price: 9200, rent: 540 },
  { id: 'lot33', char: 'Q', kind: 'shop', name: 'Negozio in piazza Duomo', price: 9500, rent: 560 },
  { id: 'lot34', char: 'U', kind: 'shop', name: 'Vetrina in via Montenapoleone', price: 17000, rent: 1150 },
  { id: 'lot35', char: 'W', kind: 'shop', name: 'Vetrina in galleria', price: 18500, rent: 1220 },
  { id: 'lot36', char: 'X', kind: 'shop', name: 'Negozio in piazza Grande', price: 19500, rent: 1280 },
  { id: 'lot37', char: 'Y', kind: 'shop', name: 'Vetrina sul corso', price: 21000, rent: 1350 },
  { id: 'lot38', char: 'Z', kind: 'shop', name: 'Vetrina in piazza della Borsa', price: 22000, rent: 1400 },
];
