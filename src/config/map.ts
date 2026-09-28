// Mappa della città a tessere. Ogni tessera è TILE metri.
//   #  strada (la forma si calcola dai vicini)
//   .  prato / cortile
//   h  casa (periferia/residenziale)     H  casa del giocatore
//   b  negozio / palazzo basso            B  palazzo alto
//   R  ristorante (lavoro lavapiatti)     M  bacheca missioni
//   t  alberi / parco                     p  piazza pavimentata
//   1 2 3  lotti per attività (food truck)

export const TILE = 6;

export const CITY_MAP = [
  '#################',
  '#bBb#bRb#BbB#bBb#',
  '#b.b#pMp#b.b#b.b#',
  '#bbb#p3p#bRb#bbb#',
  '#################',
  '#hhh#hhh#hhh#bbb#',
  '#hth#hth#hth#b.b#',
  '#hhh#p2p#hhh#bbb#',
  '#################',
  '#hhh#hHh#ttt#hhh#',
  '#hth#hth#ttt#hth#',
  '#hhh#hhh#ttt#hhh#',
  '#################',
  '#hhh#p1p#hhh#ttt#',
  '#h.h#ttt#h.h#ttt#',
  '#hhh#ttt#hhh#ttt#',
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
  price: number;
  /** canone mensile del posteggio */
  rent: number;
}

export const LOTS: LotDef[] = [
  { id: 'lot1', char: '1', name: 'Parco di periferia', price: 900, rent: 120 },
  { id: 'lot2', char: '2', name: 'Largo residenziale', price: 2200, rent: 280 },
  { id: 'lot3', char: '3', name: 'Piazza del centro', price: 5500, rent: 650 },
];
