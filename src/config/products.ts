export type ProductId =
  // food truck
  | 'panini' | 'hotdog' | 'tacos' | 'gelati'
  // panificio
  | 'pane' | 'cornetti' | 'pizza' | 'torte'
  // negozio di ceramiche
  | 'vasi' | 'ciotole' | 'tazze'
  // impresa di pulizie (servizi)
  | 'pulizia_casa' | 'pulizia_uffici' | 'vetri'
  // ditta traslochi (servizi)
  | 'trasloco_piccolo' | 'trasloco_grande' | 'sgombero';

export interface Product {
  name: string;
  icon: string;
  /** modello 3D tenuto in mano/sul bancone (i servizi non ne hanno) */
  model?: string;
  /** costo materia prima (o materiali/carburante) per porzione o servizio */
  cost: number;
  price: number;
  /** clienti (o ordini) per ora di gioco con moltiplicatori a 1 */
  baseDemand: number;
  /** moltiplicatore per mese (0 = gennaio) */
  season: number[];
}

const FLAT = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

export const PRODUCTS: Record<ProductId, Product> = {
  // ---- food truck ----
  panini: {
    name: 'Panini', icon: '🥪', model: 'food/sandwich.glb', cost: 1.5, price: 6.5, baseDemand: 1.55,
    season: [1.1, 1.1, 1, 1, 1, 0.95, 0.9, 0.9, 1, 1, 1.1, 1.1],
  },
  hotdog: {
    name: 'Hot dog', icon: '🌭', model: 'food/hot-dog.glb', cost: 1, price: 5.5, baseDemand: 1.7,
    season: [0.9, 0.9, 1, 1, 1.1, 1.2, 1.2, 1.2, 1.1, 1, 0.9, 0.9],
  },
  tacos: {
    name: 'Tacos', icon: '🌮', model: 'food/taco.glb', cost: 2, price: 8, baseDemand: 1.2,
    season: [1, 1, 1, 1, 1.05, 1.1, 1.1, 1.1, 1.05, 1, 1, 1],
  },
  gelati: {
    name: 'Gelati', icon: '🍦', model: 'food/ice-cream.glb', cost: 0.8, price: 4.5, baseDemand: 2.1,
    season: [0.25, 0.3, 0.5, 0.8, 1.2, 1.7, 2, 1.9, 1.2, 0.7, 0.35, 0.25],
  },
  // ---- panificio ----
  pane: {
    name: 'Pane', icon: '🍞', model: 'food/bread.glb', cost: 0.4, price: 3.5, baseDemand: 3.2, season: FLAT,
  },
  cornetti: {
    name: 'Cornetti', icon: '🥐', model: 'food/croissant.glb', cost: 0.5, price: 2, baseDemand: 3,
    season: [1.1, 1.1, 1, 1, 1, 0.9, 0.85, 0.85, 1, 1, 1.1, 1.15],
  },
  pizza: {
    name: 'Pizza al taglio', icon: '🍕', model: 'food/pizza.glb', cost: 1, price: 4, baseDemand: 2, season: FLAT,
  },
  torte: {
    name: 'Torte', icon: '🎂', model: 'food/cake.glb', cost: 5, price: 22, baseDemand: 0.45,
    season: [0.9, 1, 1, 1.1, 1.2, 1.1, 0.9, 0.8, 1, 1, 1.1, 1.5],
  },
  // ---- negozio di ceramiche (modelli fatti a mano: 'proc:…', vedi world/ceramics.ts) ----
  vasi: {
    name: 'Vasi decorati', icon: '🏺', model: 'proc:vaso', cost: 6, price: 32, baseDemand: 0.25,
    season: [0.8, 0.8, 1.1, 1.3, 1.3, 1, 0.9, 0.8, 1, 1, 1, 1.2],
  },
  ciotole: {
    name: 'Ciotole smaltate', icon: '🥣', model: 'proc:ciotola', cost: 8, price: 42, baseDemand: 0.18, season: FLAT,
  },
  tazze: {
    name: 'Tazze dipinte', icon: '☕', model: 'proc:tazza', cost: 10, price: 58, baseDemand: 0.15,
    season: [1.2, 1.1, 1, 0.9, 0.9, 0.8, 0.8, 0.8, 1, 1.1, 1.2, 1.6],
  },
  // ---- impresa di pulizie ----
  pulizia_casa: {
    name: 'Pulizia casa', icon: '🧽', cost: 6, price: 65, baseDemand: 0.15,
    season: [0.9, 0.9, 1.3, 1.4, 1.1, 1, 0.9, 0.8, 1, 1, 1, 1.2],
  },
  pulizia_uffici: {
    name: 'Pulizia uffici', icon: '🏢', cost: 10, price: 120, baseDemand: 0.08, season: FLAT,
  },
  vetri: {
    name: 'Lavaggio vetri', icon: '🪟', cost: 3, price: 45, baseDemand: 0.12,
    season: [0.7, 0.8, 1.2, 1.3, 1.2, 1, 1, 0.9, 1.1, 1, 0.8, 0.8],
  },
  // ---- ditta traslochi ----
  trasloco_piccolo: {
    name: 'Trasloco piccolo', icon: '📦', cost: 20, price: 190, baseDemand: 0.06,
    season: [0.8, 0.8, 1, 1, 1.1, 1.2, 1.3, 1.1, 1.3, 1, 0.9, 0.8],
  },
  trasloco_grande: {
    name: 'Trasloco grande', icon: '🚛', cost: 45, price: 460, baseDemand: 0.025,
    season: [0.8, 0.8, 1, 1, 1.1, 1.2, 1.3, 1.1, 1.3, 1, 0.9, 0.8],
  },
  sgombero: {
    name: 'Sgombero cantina', icon: '🗑️', cost: 12, price: 130, baseDemand: 0.05,
    season: [0.8, 0.8, 1.2, 1.3, 1.2, 1, 0.9, 0.9, 1, 1, 0.9, 0.8],
  },
};

export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];
