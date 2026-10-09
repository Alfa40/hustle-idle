import type { BusinessType } from './business';
import type { ProductId } from './products';

/**
 * Postazioni dentro le attività:
 *   source  prendi il materiale di partenza (frigo, dispensa, magazzino)
 *   hold    tieni premuto per lavorare (tagliere, impastatrice, tornio…)
 *   timed   metti dentro, aspetta e togli al momento giusto (piastra, forno)
 *   counter consegna al cliente
 *   pass    ripiano dove i dipendenti appoggiano i prodotti pronti
 *   bin     cestino
 */
export type StationKind = 'source' | 'hold' | 'timed' | 'counter' | 'pass' | 'bin';

export interface StationDef {
  id: string;
  kind: StationKind;
  name: string;
  icon: string;
  /** verbo mostrato sul pulsante azione */
  verb: string;
  model: string;
  /** posizione nella stanza (x verso destra, z verso i clienti) */
  x: number;
  z: number;
  /** livello di ampliamento che la sblocca */
  level: number;
  /** secondi per le postazioni "hold" e "timed" */
  sec?: number;
  /** posti per le postazioni "timed" */
  slots?: number;
  /** rotazione del mobile (0 = guarda verso i clienti, -90° = sulla parete destra) */
  rot?: number;
}

export interface Layout {
  /** larghezza della stanza per ogni livello di ampliamento */
  width: [number, number, number];
  wall: number;
  floor: number;
  stations: StationDef[];
  /** fasi di ogni prodotto (id delle postazioni) e livello che lo sblocca */
  recipes: Partial<Record<ProductId, { steps: string[]; level: number }>>;
  /** postazioni che si possono duplicare con i miglioramenti */
  extra: { fuochi: string; banco: string };
}

/** Profondità comune: fondo a z=-2.2, bancone clienti a z=1.75. */
export const BACK_Z = -1.85;
export const ISLAND_Z = -0.2;
export const COUNTER_Z = 1.75;

const common = (level: number): StationDef[] => [
  { id: 'imballo', kind: 'hold', name: 'Imballaggio', icon: '🥡', verb: 'Imballa', model: 'furniture/kitchenCabinet.glb', x: 0, z: ISLAND_Z, level, sec: 1 },
];

export const LAYOUTS: Record<'foodtruck' | 'panificio', Layout> = {
  foodtruck: {
    width: [7.5, 10, 12.5],
    wall: 0xe8590c,
    floor: 0xe8e2d4,
    stations: [
      { id: 'frigo', kind: 'source', name: 'Frigo', icon: '🧊', verb: 'Prendi', model: 'furniture/kitchenFridge.glb', x: -2.6, z: BACK_Z, level: 0 },
      { id: 'piastra', kind: 'timed', name: 'Piastra', icon: '🔥', verb: 'Cuoci', model: 'furniture/kitchenStove.glb', x: -1, z: BACK_Z, level: 0, sec: 4.6, slots: 2 },
      { id: 'banco', kind: 'hold', name: 'Banco assemblaggio', icon: '🥪', verb: 'Assembla', model: 'furniture/kitchenCabinetDrawer.glb', x: 0.8, z: BACK_Z, level: 0, sec: 1.1 },
      { id: 'cestino', kind: 'bin', name: 'Cestino', icon: '🗑️', verb: 'Butta', model: 'furniture/kitchenSink.glb', x: 2.6, z: BACK_Z, level: 0 },
      { id: 'finestra', kind: 'counter', name: 'Finestra clienti', icon: '🪟', verb: 'Servi', model: '', x: 0, z: COUNTER_Z, level: 0 },
      { id: 'passe', kind: 'pass', name: 'Ripiano pronti', icon: '🍽️', verb: 'Prendi', model: '', x: 2.2, z: COUNTER_Z, level: 0 },
      // ampliamento 1: tagliere per i tacos e imballaggio da asporto
      { id: 'tagliere', kind: 'hold', name: 'Tagliere', icon: '🔪', verb: 'Taglia', model: 'furniture/kitchenCabinetDrawer.glb', x: 4.2, z: BACK_Z, level: 1, sec: 1.3 },
      ...common(1),
      // ampliamento 2: gelatiera
      { id: 'gelatiera', kind: 'source', name: 'Gelatiera', icon: '🍨', verb: 'Prendi', model: 'furniture/kitchenFridge.glb', x: 5.6, z: BACK_Z, level: 2 },
    ],
    recipes: {
      panini: { steps: ['frigo', 'piastra', 'banco'], level: 0 },
      hotdog: { steps: ['frigo', 'piastra', 'banco'], level: 0 },
      tacos: { steps: ['frigo', 'piastra', 'tagliere', 'banco'], level: 1 },
      gelati: { steps: ['gelatiera', 'banco'], level: 2 },
    },
    extra: { fuochi: 'piastra', banco: 'banco' },
  },
  panificio: {
    width: [7.5, 10, 12.5],
    wall: 0xd4a373,
    floor: 0xf3e6d0,
    stations: [
      { id: 'dispensa', kind: 'source', name: 'Dispensa', icon: '🌾', verb: 'Prendi', model: 'furniture/bookcaseOpen.glb', x: -2.6, z: BACK_Z, level: 0 },
      { id: 'impastatrice', kind: 'hold', name: 'Impastatrice', icon: '🥣', verb: 'Impasta', model: 'furniture/kitchenCabinetDrawer.glb', x: -1, z: BACK_Z, level: 0, sec: 1.4 },
      { id: 'forno', kind: 'timed', name: 'Forno', icon: '🔥', verb: 'Inforna', model: 'furniture/kitchenStove.glb', x: 0.8, z: BACK_Z, level: 0, sec: 5.8, slots: 3 },
      { id: 'tavolo', kind: 'hold', name: 'Tavolo da lavoro', icon: '🥐', verb: 'Forma', model: 'furniture/desk.glb', x: -1.6, z: ISLAND_Z, level: 0, sec: 1.1 },
      { id: 'cestino', kind: 'bin', name: 'Cestino', icon: '🗑️', verb: 'Butta', model: 'furniture/kitchenSink.glb', x: 2.6, z: BACK_Z, level: 0 },
      { id: 'bancone', kind: 'counter', name: 'Bancone', icon: '🧁', verb: 'Servi', model: '', x: 0, z: COUNTER_Z, level: 0 },
      { id: 'passe', kind: 'pass', name: 'Vetrina pronti', icon: '🍞', verb: 'Prendi', model: '', x: 2.2, z: COUNTER_Z, level: 0 },
      // ampliamento 1: farcitura per la pizza e imballaggio
      { id: 'farcitura', kind: 'hold', name: 'Farcitura', icon: '🍅', verb: 'Farcisci', model: 'furniture/kitchenCabinetDrawer.glb', x: 4.2, z: BACK_Z, level: 1, sec: 1.2 },
      ...common(1),
      // ampliamento 2: decorazione torte
      { id: 'decorazione', kind: 'hold', name: 'Decorazione torte', icon: '🎂', verb: 'Decora', model: 'furniture/desk.glb', x: 5.6, z: BACK_Z, level: 2, sec: 1.8 },
    ],
    recipes: {
      pane: { steps: ['dispensa', 'impastatrice', 'forno'], level: 0 },
      cornetti: { steps: ['dispensa', 'tavolo', 'forno'], level: 0 },
      pizza: { steps: ['dispensa', 'tavolo', 'farcitura', 'forno'], level: 1 },
      torte: { steps: ['dispensa', 'impastatrice', 'forno', 'decorazione'], level: 2 },
    },
    extra: { fuochi: 'forno', banco: 'tavolo' },
  },
};

export const hasInterior = (t: BusinessType): t is keyof typeof LAYOUTS => t in LAYOUTS;

/** Livello richiesto da un prodotto (0 se non ha ricetta, es. i servizi). */
export function productLevel(t: BusinessType, pid: ProductId) {
  return hasInterior(t) ? LAYOUTS[t].recipes[pid]?.level ?? 0 : 0;
}

export const EXPANSION_NAMES = ['Base', 'Ampliato', 'Grande'];

/** Larghezza della stanza e bordo sinistro (uguali per tutte le attività). */
export const ROOM_LEFT = -3.75;
const STEP = 1.1;

/** Posti lungo le pareti: prima il fondo, poi la parete destra (cucina a L). */
function wallSpots(t: keyof typeof LAYOUTS, level: number) {
  const W = LAYOUTS[t].width[level];
  const out: { x: number; z: number; rot: number }[] = [];
  for (let x = ROOM_LEFT + 1.05; x <= ROOM_LEFT + W - 1.0; x += STEP) out.push({ x, z: BACK_Z, rot: 0 });
  const sx = ROOM_LEFT + W - 0.55;
  for (let z = BACK_Z + 1.3; z <= 0.35; z += STEP) out.push({ x: sx, z, rot: -Math.PI / 2 });
  return out;
}

/**
 * Tutte le postazioni di lavoro della cucina, in fila lungo le pareti:
 * i mobili extra (fuochi, banchi) stanno subito accanto a quelli dello stesso tipo.
 * Bancone e ripiano restano al loro posto. Se non c'è abbastanza parete, gli extra non stanno.
 */
export function kitchenLayout(t: keyof typeof LAYOUTS, level: number, fuochi: number, banchi: number): StationDef[] {
  const lay = LAYOUTS[t];
  const fixed = lay.stations.filter((s) => s.level <= level && (s.kind === 'counter' || s.kind === 'pass'));
  const work = lay.stations.filter((s) => s.level <= level && s.kind !== 'counter' && s.kind !== 'pass');
  // ordine lungo il muro: come nel layout, con il cestino in fondo
  const ordered = [...work.filter((s) => s.kind !== 'bin'), ...work.filter((s) => s.kind === 'bin')];
  const spots = wallSpots(t, level);
  // le postazioni base hanno sempre il loro posto: gli extra solo se avanza parete
  let room = spots.length - ordered.length;
  const seq: StationDef[] = [];
  for (const st of ordered) {
    seq.push(st);
    const want = st.id === lay.extra.fuochi ? fuochi : st.id === lay.extra.banco ? banchi : 0;
    const n = Math.max(0, Math.min(want, room));
    room -= n;
    for (let i = 0; i < n; i++) seq.push({ ...st, name: `${st.name} ${i + 2}` });
  }
  const placed = seq.slice(0, spots.length).map((st, i) => ({ ...st, x: spots[i].x, z: spots[i].z, rot: spots[i].rot }));
  return [...placed, ...fixed];
}

/** Quanti mobili extra ci stanno ancora (per i pulsanti dei miglioramenti). */
export function extraRoom(t: keyof typeof LAYOUTS, level: number, fuochi: number, banchi: number) {
  const lay = LAYOUTS[t];
  const base = lay.stations.filter((s) => s.level <= level && s.kind !== 'counter' && s.kind !== 'pass').length;
  return wallSpots(t, level).length - base - fuochi - banchi;
}
