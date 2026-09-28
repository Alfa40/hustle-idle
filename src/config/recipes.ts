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
}

export interface Layout {
  /** larghezza della stanza per ogni livello di ampliamento */
  width: [number, number, number];
  wall: number;
  floor: number;
  stations: StationDef[];
  /** fasi di ogni prodotto (id delle postazioni) e livello che lo sblocca */
  recipes: Partial<Record<ProductId, { steps: string[]; level: number }>>;
}

/** Profondità comune: fondo a z=-2.2, bancone clienti a z=1.75. */
export const BACK_Z = -1.85;
export const ISLAND_Z = -0.2;
export const COUNTER_Z = 1.75;

const common = (level: number): StationDef[] => [
  { id: 'imballo', kind: 'hold', name: 'Imballaggio', icon: '🥡', verb: 'Imballa', model: 'furniture/kitchenCabinet.glb', x: 0, z: ISLAND_Z, level, sec: 1 },
];

export const LAYOUTS: Record<'foodtruck' | 'panificio' | 'artigianato', Layout> = {
  foodtruck: {
    width: [7.5, 10, 12.5],
    wall: 0xe8590c,
    floor: 0xe8e2d4,
    stations: [
      { id: 'frigo', kind: 'source', name: 'Frigo', icon: '🧊', verb: 'Prendi', model: 'furniture/kitchenFridge.glb', x: -2.6, z: BACK_Z, level: 0 },
      { id: 'piastra', kind: 'timed', name: 'Piastra', icon: '🔥', verb: 'Cuoci', model: 'furniture/kitchenStove.glb', x: -1, z: BACK_Z, level: 0, sec: 3.2, slots: 2 },
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
  },
  panificio: {
    width: [7.5, 10, 12.5],
    wall: 0xd4a373,
    floor: 0xf3e6d0,
    stations: [
      { id: 'dispensa', kind: 'source', name: 'Dispensa', icon: '🌾', verb: 'Prendi', model: 'furniture/bookcaseOpen.glb', x: -2.6, z: BACK_Z, level: 0 },
      { id: 'impastatrice', kind: 'hold', name: 'Impastatrice', icon: '🥣', verb: 'Impasta', model: 'furniture/kitchenCabinetDrawer.glb', x: -1, z: BACK_Z, level: 0, sec: 1.4 },
      { id: 'forno', kind: 'timed', name: 'Forno', icon: '🔥', verb: 'Inforna', model: 'furniture/kitchenStove.glb', x: 0.8, z: BACK_Z, level: 0, sec: 4, slots: 3 },
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
  },
  artigianato: {
    width: [7.5, 10, 12.5],
    wall: 0x6d9dc5,
    floor: 0xe9e4da,
    stations: [
      { id: 'argilla', kind: 'source', name: 'Argilla', icon: '🟤', verb: 'Prendi', model: 'furniture/bookcaseOpen.glb', x: -2.6, z: BACK_Z, level: 0 },
      { id: 'tornio', kind: 'hold', name: 'Tornio', icon: '🏺', verb: 'Modella', model: 'furniture/desk.glb', x: -1, z: BACK_Z, level: 0, sec: 1.8 },
      { id: 'fornace', kind: 'timed', name: 'Fornace', icon: '🔥', verb: 'Cuoci', model: 'furniture/kitchenStove.glb', x: 0.8, z: BACK_Z, level: 0, sec: 5, slots: 2 },
      { id: 'pittura', kind: 'hold', name: 'Banco pittura', icon: '🎨', verb: 'Dipingi', model: 'furniture/desk.glb', x: -1.6, z: ISLAND_Z, level: 0, sec: 1.6 },
      { id: 'cestino', kind: 'bin', name: 'Cestino', icon: '🗑️', verb: 'Butta', model: 'furniture/kitchenSink.glb', x: 2.6, z: BACK_Z, level: 0 },
      { id: 'vetrina', kind: 'counter', name: 'Vetrina', icon: '🛍️', verb: 'Vendi', model: '', x: 0, z: COUNTER_Z, level: 0 },
      { id: 'passe', kind: 'pass', name: 'Ripiano pronti', icon: '🧺', verb: 'Prendi', model: '', x: 2.2, z: COUNTER_Z, level: 0 },
      // ampliamento 1: falegnameria
      { id: 'legno', kind: 'source', name: 'Legno', icon: '🪵', verb: 'Prendi', model: 'furniture/bookcaseOpen.glb', x: 4.2, z: BACK_Z, level: 1 },
      { id: 'sega', kind: 'hold', name: 'Sega', icon: '🪚', verb: 'Taglia', model: 'furniture/desk.glb', x: 3.4, z: ISLAND_Z, level: 1, sec: 1.6 },
      ...common(1),
      // ampliamento 2: oreficeria
      { id: 'metalli', kind: 'source', name: 'Metalli', icon: '🪙', verb: 'Prendi', model: 'furniture/bookcaseOpen.glb', x: 5.6, z: BACK_Z, level: 2 },
      { id: 'orafo', kind: 'hold', name: 'Banco orafo', icon: '💍', verb: 'Lavora', model: 'furniture/desk.glb', x: 5, z: ISLAND_Z, level: 2, sec: 2 },
    ],
    recipes: {
      vasi: { steps: ['argilla', 'tornio', 'fornace', 'pittura'], level: 0 },
      sedie: { steps: ['legno', 'sega', 'pittura'], level: 1 },
      gioielli: { steps: ['metalli', 'orafo', 'fornace'], level: 2 },
    },
  },
};

export const hasInterior = (t: BusinessType): t is keyof typeof LAYOUTS => t in LAYOUTS;

/** Livello richiesto da un prodotto (0 se non ha ricetta, es. i servizi). */
export function productLevel(t: BusinessType, pid: ProductId) {
  return hasInterior(t) ? LAYOUTS[t].recipes[pid]?.level ?? 0 : 0;
}

export const EXPANSION_NAMES = ['Base', 'Ampliato', 'Grande'];
