export type ProductId = 'panini' | 'hotdog' | 'tacos' | 'gelati';

export interface Product {
  name: string;
  icon: string;
  model: string;
  /** costo materia prima per porzione */
  cost: number;
  price: number;
  /** clienti per ora di gioco con moltiplicatori a 1 */
  baseDemand: number;
  /** moltiplicatore per mese (0 = gennaio) */
  season: number[];
}

export const PRODUCTS: Record<ProductId, Product> = {
  panini: {
    name: 'Panini', icon: '🥪', model: 'food/sandwich.glb', cost: 1.5, price: 5, baseDemand: 1.2,
    season: [1.1, 1.1, 1, 1, 1, 0.95, 0.9, 0.9, 1, 1, 1.1, 1.1],
  },
  hotdog: {
    name: 'Hot dog', icon: '🌭', model: 'food/hot-dog.glb', cost: 1, price: 4, baseDemand: 1.3,
    season: [0.9, 0.9, 1, 1, 1.1, 1.2, 1.2, 1.2, 1.1, 1, 0.9, 0.9],
  },
  tacos: {
    name: 'Tacos', icon: '🌮', model: 'food/taco.glb', cost: 2, price: 6.5, baseDemand: 0.9,
    season: [1, 1, 1, 1, 1.05, 1.1, 1.1, 1.1, 1.05, 1, 1, 1],
  },
  gelati: {
    name: 'Gelati', icon: '🍦', model: 'food/ice-cream.glb', cost: 0.8, price: 3.5, baseDemand: 1.6,
    season: [0.25, 0.3, 0.5, 0.8, 1.2, 1.7, 2, 1.9, 1.2, 0.7, 0.35, 0.25],
  },
};

export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];
