import type { ProductId } from './products';
import type { SkillId } from './skills';

export type Role = 'cucina' | 'cassa' | 'manager' | 'sala' | 'magazzino';

export const ROLES: Record<Role, { name: string; icon: string; baseSalary: number }> = {
  cucina: { name: 'Cuoco', icon: '👨‍🍳', baseSalary: 380 },
  cassa: { name: 'Cassiere', icon: '💁', baseSalary: 330 },
  manager: { name: 'Manager', icon: '👔', baseSalary: 700 },
  sala: { name: 'Cameriere', icon: '🤵', baseSalary: 320 },
  magazzino: { name: 'Magazziniere', icon: '📦', baseSalary: 310 },
};

/** Ruoli facoltativi delle attività con interno e ampliamento che li rende utili. */
export const EXTRA_ROLES: { role: Role; level: number; desc: string }[] = [
  { role: 'magazzino', level: 1, desc: 'Organizza le scorte in magazzino e riordina da solo, anche senza manager.' },
  { role: 'sala', level: 2, desc: 'Porta il cibo ai tavoli della sala: clienti più contenti e mance più alte.' },
];

export type UpgradeId = 'ampliamento' | 'fuochi' | 'banco' | 'ripiano' | 'attrezzatura' | 'look' | 'menu' | 'frigo' | 'marketing';

export interface UpgradeDef {
  name: string;
  icon: string;
  desc: string;
  max: number;
  cost: (lvl: number) => number;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  ampliamento: {
    name: 'Ampliamento del locale', icon: '🏗️', desc: 'Più spazio, nuove postazioni di lavoro e nuovi prodotti da vendere.', max: 2,
    cost: (l) => [3500, 12000][l] ?? Infinity,
  },
  fuochi: {
    name: 'Fuochi e forni extra', icon: '🔥', desc: 'Un fornello/forno in più nel locale: si cuociono più cose insieme.', max: 3,
    cost: (l) => [900, 2200, 5000][l] ?? Infinity,
  },
  banco: {
    name: 'Banco di lavoro extra', icon: '🧑‍🍳', desc: 'Un banco di lavoro in più: tu e i dipendenti lavorate in parallelo.', max: 2,
    cost: (l) => [700, 1800][l] ?? Infinity,
  },
  ripiano: {
    name: 'Ripiano pronti più grande', icon: '🍽️', desc: '+2 posti per i prodotti pronti.', max: 3,
    cost: (l) => [400, 1000, 2400][l] ?? Infinity,
  },
  attrezzatura: {
    name: 'Attrezzatura professionale', icon: '⚡', desc: 'Si lavora più in fretta (+15% per livello). Le postazioni diventano lucide e dorate.', max: 8,
    cost: (l) => Math.round(400 * 1.8 ** l),
  },
  look: {
    name: 'Look e insegna', icon: '✨', desc: 'Attira più clienti (+15% di domanda per livello). Piante, luci e un pavimento più bello.', max: 8,
    cost: (l) => Math.round(500 * 1.9 ** l),
  },
  menu: {
    name: 'Più prodotti', icon: '📋', desc: 'Un prodotto (o servizio) in più in vendita, scritto sulla lavagna del menù.', max: 2,
    cost: (l) => [800, 2400][l] ?? Infinity,
  },
  frigo: {
    name: 'Magazzino più grande', icon: '🧊', desc: '+40 posti in magazzino. Più scatoloni di scorte nel locale.', max: 6,
    cost: (l) => Math.round(300 * 1.7 ** l),
  },
  marketing: {
    name: 'Pubblicità', icon: '📣', desc: '+10% di domanda per livello. Manifesti alle pareti e insegna.', max: 6,
    cost: (l) => Math.round(650 * 2 ** l),
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

export interface BusinessTypeDef {
  name: string;
  icon: string;
  desc: string;
  /** truck/shop: clienti al bancone · service: ordini da eseguire in giro per la città */
  kind: 'truck' | 'shop' | 'service';
  /** su che tipo di lotto si può aprire */
  lot: 'truck' | 'shop';
  /** attrezzatura iniziale, da aggiungere al prezzo del lotto */
  setupCost: number;
  products: ProductId[];
  roles: Exclude<Role, 'manager' | 'sala' | 'magazzino'>[];
  /** nome dei ruoli per questa attività */
  roleNames: Partial<Record<Role, string>>;
  /** esperienze che fanno salire la domanda e che guadagni lavorando di persona */
  skills: SkillId[];
  /** clienti/ora gestiti da un dipendente rispetto al food truck */
  rateMul: number;
  /** interni: colore delle pareti e nomi delle postazioni */
  wall?: number;
  stations?: { stock: string; work: string; counter: string };
  /** colore dell'insegna */
  color: string;
}

export const BUSINESS_TYPES = {
  foodtruck: {
    name: 'Food truck', icon: '🚚', desc: 'Cibo di strada: economico da aprire, si lavora al bancone.',
    kind: 'truck', lot: 'truck', setupCost: 0, products: ['panini', 'hotdog', 'tacos', 'gelati'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Cuoco', cassa: 'Cassiere' }, skills: ['cucina', 'clientela'],
    rateMul: 1, wall: 0xe8590c, color: '#e8590c',
    stations: { stock: '🧊 Frigo', work: '🔥 Piastra', counter: '🪟 Servi qui' },
  },
  panificio: {
    name: 'Panificio', icon: '🥖', desc: 'Pane e dolci: tanti clienti, prodotti economici.',
    kind: 'shop', lot: 'shop', setupCost: 2500, products: ['pane', 'cornetti', 'pizza', 'torte'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Fornaio', cassa: 'Commesso' }, skills: ['cucina', 'clientela'],
    rateMul: 1.1, wall: 0xd4a373, color: '#b5793d',
    stations: { stock: '🌾 Dispensa', work: '🔥 Forno', counter: '🧁 Bancone' },
  },
  artigianato: {
    name: 'Laboratorio artigiano', icon: '🎨', desc: 'Pochi clienti ma pezzi di valore.',
    kind: 'shop', lot: 'shop', setupCost: 3500, products: ['vasi', 'sedie', 'gioielli'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Artigiano', cassa: 'Commesso' }, skills: ['artigianato', 'clientela'],
    rateMul: 0.3, wall: 0x6d9dc5, color: '#3d7ab8',
    stations: { stock: '🪵 Materiali', work: '🔨 Banco da lavoro', counter: '🛍️ Vetrina' },
  },
  pulizie: {
    name: 'Impresa di pulizie', icon: '🧽', desc: 'Servizi a domicilio: esegui gli ordini nelle case.',
    kind: 'service', lot: 'shop', setupCost: 2000, products: ['pulizia_casa', 'pulizia_uffici', 'vetri'],
    roles: ['cucina'], roleNames: { cucina: 'Addetto pulizie' }, skills: ['manualita', 'clientela'],
    rateMul: 0.12, color: '#2d9cdb',
  },
  traslochi: {
    name: 'Ditta traslochi', icon: '🚛', desc: 'Lavori grossi e ben pagati, serve un furgone.',
    kind: 'service', lot: 'shop', setupCost: 7000, products: ['trasloco_piccolo', 'trasloco_grande', 'sgombero'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Facchino', cassa: 'Autista' }, skills: ['logistica', 'manualita'],
    rateMul: 0.08, color: '#6a3cb0',
  },
} satisfies Record<string, BusinessTypeDef>;

export type BusinessType = keyof typeof BUSINESS_TYPES;
export const BUSINESS_TYPE_IDS = Object.keys(BUSINESS_TYPES) as BusinessType[];
export const bizType = (t: BusinessType): BusinessTypeDef => BUSINESS_TYPES[t];
export const roleName = (t: BusinessType, r: Role) => bizType(t).roleNames[r] ?? ROLES[r].name;

export const FIRST_NAMES = [
  'Luca', 'Giulia', 'Marco', 'Sara', 'Paolo', 'Chiara', 'Andrea', 'Elena', 'Davide', 'Marta',
  'Simone', 'Anna', 'Matteo', 'Laura', 'Fabio', 'Irene', 'Giorgio', 'Silvia', 'Enzo', 'Rita',
];
export const LAST_NAMES = [
  'Rossi', 'Bianchi', 'Esposito', 'Russo', 'Ferrari', 'Romano', 'Gallo', 'Costa', 'Fontana',
  'Conti', 'Ricci', 'Greco', 'Bruno', 'Marino', 'Rinaldi', 'Moretti',
];
