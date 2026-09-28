import type { ProductId } from './products';
import type { SkillId } from './skills';

export type Role = 'cucina' | 'cassa' | 'manager';

export const ROLES: Record<Role, { name: string; icon: string; baseSalary: number }> = {
  cucina: { name: 'Cuoco', icon: '👨‍🍳', baseSalary: 380 },
  cassa: { name: 'Cassiere', icon: '💁', baseSalary: 330 },
  manager: { name: 'Manager', icon: '👔', baseSalary: 1100 },
};

export type UpgradeId = 'attrezzatura' | 'look' | 'menu' | 'frigo' | 'marketing';

export interface UpgradeDef {
  name: string;
  icon: string;
  desc: string;
  max: number;
  cost: (lvl: number) => number;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  attrezzatura: {
    name: 'Attrezzatura', icon: '🔥', desc: 'Si cucina più in fretta (+15% per livello).', max: 8,
    cost: (l) => Math.round(400 * 1.8 ** l),
  },
  look: {
    name: 'Look e insegna', icon: '✨', desc: 'Attira più clienti (+15% di domanda per livello).', max: 8,
    cost: (l) => Math.round(500 * 1.9 ** l),
  },
  menu: {
    name: 'Menù più grande', icon: '📋', desc: 'Un prodotto in più in vendita.', max: 2,
    cost: (l) => [800, 2400][l] ?? Infinity,
  },
  frigo: {
    name: 'Frigo e magazzino', icon: '🧊', desc: '+40 porzioni di magazzino.', max: 6,
    cost: (l) => Math.round(300 * 1.7 ** l),
  },
  marketing: {
    name: 'Pubblicità', icon: '📣', desc: '+10% di domanda per livello.', max: 6,
    cost: (l) => Math.round(650 * 2 ** l),
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

export interface BusinessTypeDef {
  name: string;
  icon: string;
  products: ProductId[];
  roles: Role[];
  /** esperienze che fanno salire la domanda */
  skills: SkillId[];
}

export const BUSINESS_TYPES = {
  foodtruck: {
    name: 'Food truck', icon: '🚚', products: ['panini', 'hotdog', 'tacos', 'gelati'],
    roles: ['cucina', 'cassa'], skills: ['cucina', 'clientela'],
  },
} satisfies Record<string, BusinessTypeDef>;

export type BusinessType = keyof typeof BUSINESS_TYPES;

export const FIRST_NAMES = [
  'Luca', 'Giulia', 'Marco', 'Sara', 'Paolo', 'Chiara', 'Andrea', 'Elena', 'Davide', 'Marta',
  'Simone', 'Anna', 'Matteo', 'Laura', 'Fabio', 'Irene', 'Giorgio', 'Silvia', 'Enzo', 'Rita',
];
export const LAST_NAMES = [
  'Rossi', 'Bianchi', 'Esposito', 'Russo', 'Ferrari', 'Romano', 'Gallo', 'Costa', 'Fontana',
  'Conti', 'Ricci', 'Greco', 'Bruno', 'Marino', 'Rinaldi', 'Moretti',
];
