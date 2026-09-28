// Mappa della città a tessere. Ogni tessera è TILE metri.
//   #  strada (la forma si calcola dai vicini)
//   .  prato / cortile
//   h  casa (periferia/residenziale)     H  casa del giocatore
//   b  negozio / palazzo basso            B  palazzo alto
//   R  ristorante (lavoro lavapiatti)     M  bacheca missioni
//   t  alberi / parco                     p  piazza pavimentata
//   V  concessionaria veicoli             A  agenzia affari
//   1–5  lotti per food truck             6–9, 0  negozi in vendita

export const TILE = 6;

export const CITY_MAP = [
  '#################',
  '#bBb#bRb#BbB#bBb#',
  '#b.b#pMp#b.b#b.b#',
  '#b7b#p3p#bRb#6Ab#',
  '#################',
  '#hhh#hhh#hhh#bbb#',
  '#hth#hth#hth#b.b#',
  '#hhh#p2p#h8h#bVb#',
  '#################',
  '#hhh#hHh#t4t#hhh#',
  '#hth#hth#ttt#hth#',
  '#h9h#hhh#ttt#hhh#',
  '#################',
  '#hhh#p1p#hhh#t5t#',
  '#h.h#ttt#h.h#ttt#',
  '#h0h#ttt#hhh#ttt#',
  '#################',
];

export type ZoneId = 'centro' | 'residenziale' | 'periferia';

export const ZONES: Record<ZoneId, { name: string; demand: number; color: string }> = {
  centro: { name: 'Centro', demand: 1.8, color: '#f0b429' },
  residenziale: { name: 'Residenziale', demand: 1.3, color: '#7cc47f' },
  periferia: { name: 'Periferia', demand: 1.0, color: '#8fb3ff' },
};

export function zoneAt(_col: number, row: number): ZoneId {
  if (row <= 4) return 'centro';
  if (row <= 11) return 'residenziale';
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
  { id: 'lot5', char: '5', kind: 'truck', name: 'Giardini est', price: 1100, rent: 130 },
  { id: 'lot2', char: '2', kind: 'truck', name: 'Largo residenziale', price: 2200, rent: 280 },
  { id: 'lot4', char: '4', kind: 'truck', name: 'Parco centrale', price: 2600, rent: 300 },
  { id: 'lot3', char: '3', kind: 'truck', name: 'Piazza del centro', price: 5500, rent: 650 },
  { id: 'lot0', char: '0', kind: 'shop', name: 'Bottega di periferia', price: 4000, rent: 250 },
  { id: 'lot9', char: '9', kind: 'shop', name: 'Negozio in via dei Pini', price: 7500, rent: 450 },
  { id: 'lot8', char: '8', kind: 'shop', name: 'Locale sul viale', price: 8500, rent: 500 },
  { id: 'lot7', char: '7', kind: 'shop', name: 'Negozio in corso Roma', price: 16000, rent: 1100 },
  { id: 'lot6', char: '6', kind: 'shop', name: 'Vetrina in centro', price: 20000, rent: 1300 },
];
