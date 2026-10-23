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

export type UpgradeId = 'ampliamento' | 'fuochi' | 'banco' | 'ripiano' | 'attrezzatura' | 'cassa' | 'look' | 'menu' | 'frigo' | 'marketing'
  // solo per le attività automatiche (`autoBiz`): nomi e icone dati dal settore (SECTOR_UPG)
  | 'qualita' | 'formazione' | 'sicurezza' | 'fedelta' | 'risparmio';

export interface UpgradeDef {
  name: string;
  icon: string;
  desc: string;
  max: number;
  cost: (lvl: number) => number;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  ampliamento: {
    name: 'Ampliamento del locale', icon: '🏗️', desc: 'Più spazio, nuove postazioni e nuovi prodotti.', max: 2,
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
    name: 'Attrezzatura professionale', icon: '⚡', desc: 'Si prepara più in fretta: +15% per livello.', max: 8,
    cost: (l) => Math.round(400 * 1.8 ** l),
  },
  cassa: {
    name: 'Cassa veloce', icon: '💳', desc: 'I cassieri servono più in fretta: +15% per livello.', max: 8,
    cost: (l) => Math.round((350 * 1.8 ** l) / 10) * 10,
  },
  look: {
    name: 'Look e insegna', icon: '✨', desc: 'Più clienti: +15% di domanda per livello.', max: 8,
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
  // migliorie delle attività automatiche (effetti in sim/economy.ts e sim/troubles.ts)
  qualita: {
    name: 'Qualità', icon: '💎', desc: 'Ogni cliente paga di più: +8% per livello.', max: 5,
    cost: (l) => Math.round((600 * 1.9 ** l) / 10) * 10,
  },
  formazione: {
    name: 'Corsi per il personale', icon: '🎓', desc: 'Personale più svelto (+8% per livello) e meno dimissioni e scioperi (−15% per livello).', max: 5,
    cost: (l) => Math.round((500 * 1.8 ** l) / 10) * 10,
  },
  sicurezza: {
    name: 'Allarme e manutenzione', icon: '🚨', desc: 'Meno guasti e furti: −15% per livello.', max: 4,
    cost: (l) => Math.round((450 * 1.8 ** l) / 10) * 10,
  },
  fedelta: {
    name: 'Clienti fedeli', icon: '🎟️', desc: 'Più fama da ogni cliente servito: +25% per livello.', max: 4,
    cost: (l) => Math.round((700 * 1.9 ** l) / 10) * 10,
  },
  risparmio: {
    name: 'Fornitori all\'ingrosso', icon: '📦', desc: 'Merce e bollette costano meno: −8% per livello (al massimo −60%).', max: 4,
    cost: (l) => Math.round((550 * 1.8 ** l) / 10) * 10,
  },
};

/** migliorie in più delle attività senza interno (tutte tranne food truck e panificio), col nome del loro settore */
export const AUTO_UPGRADES = ['qualita', 'formazione', 'sicurezza', 'fedelta', 'risparmio'] as const;
/** attività con l'interno (cucina): le loro migliorie restano quelle di sempre */
const KITCHEN_TYPES = { foodtruck: 1, panificio: 1 } as const;
const SECTOR_UPG: Record<string, Record<(typeof AUTO_UPGRADES)[number], [string, string]>> = {
  cucina: { qualita: ['Ingredienti di qualità', '🥩'], formazione: ['Corsi di cucina e servizio', '🎓'], sicurezza: ['Allarme e manutenzione', '🚨'], fedelta: ['Tessera fedeltà', '🎟️'], risparmio: ['Fornitori all\'ingrosso', '📦'] },
  logistica: { qualita: ['Servizio puntuale', '⏱️'], formazione: ['Corsi di guida sicura', '🎓'], sicurezza: ['Antifurto e tagliandi ai mezzi', '🔧'], fedelta: ['Clienti abbonati', '🤝'], risparmio: ['Percorsi e ricambi', '🗺️'] },
  manualita: { qualita: ['Lavori a regola d\'arte', '🛠️'], formazione: ['Corsi per gli operai', '🎓'], sicurezza: ['Manutenzione degli attrezzi', '🧰'], fedelta: ['Recensioni dei clienti', '💬'], risparmio: ['Materiali all\'ingrosso', '🧱'] },
  artigianato: { qualita: ['Materiali pregiati', '💎'], formazione: ['Corsi di bottega', '🎓'], sicurezza: ['Allarme del laboratorio', '🚨'], fedelta: ['Portfolio e recensioni', '🖼️'], risparmio: ['Fornitori di fiducia', '🤝'] },
};
/**
 * Livello massimo delle migliorie delle attività senza interno, per gradino (base → più grande): almeno 5 per le
 * base, fino a 15 (e 20 per attrezzatura, look e qualità) per le più grandi. "Più prodotti" resta legato ai prodotti.
 */
const TIER_MAX = [5, 8, 12, 15];
const TIER_MAX_TOP = [5, 9, 14, 20];
const TOP_UPGRADES: UpgradeId[] = ['attrezzatura', 'look', 'qualita'];
/** oltre il 5° livello il prezzo cresce più piano (+30% a livello), se no i livelli alti costerebbero miliardi */
const SOFT_FROM = 5;
const SOFT_GROWTH = 1.3;

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

export interface BusinessTypeDef {
  name: string;
  icon: string;
  desc: string;
  /**
   * truck/shop: clienti al bancone · service: ordini da eseguire in giro per la città ·
   * craft: lavori manuali su richiesta fatti dal giocatore in prima persona (niente clienti né staff)
   */
  kind: 'truck' | 'shop' | 'service' | 'craft';
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
  /** settore (per i settori accesi in config/careers.ts: FOCUS_SECTORS) */
  sector?: SkillId;
  /**
   * Gradino nell'albero delle evoluzioni: 0 = attività base (si compra), 1–3 = si ottiene solo evolvendo.
   * Senza: attività "di prima" (food truck, panificio…), si compra e non si evolve (per ora).
   */
  tier?: number;
  /** in cosa si può evolvere (bivio: se ce n'è più di una, se ne sceglie una); id di BUSINESS_TYPES */
  evolvesTo?: string[];
  /** ristrutturazione per diventare questa attività (si aggiunge al prezzo del locale scelto) */
  evolveCost?: number;
  /** migliorie con il nome e il massimo di questa attività (es. "Bici elettriche" al posto di Attrezzatura) */
  upgrades?: Partial<Record<UpgradeId, { name?: string; icon?: string; desc?: string; max?: number }>>;
  /**
   * Attività automatica (Ristorazione e ospitalità evolute e B&B): niente di persona, parte con un dipendente per
   * reparto e il manager e lavora da sola da subito (`ensureAutoStaff` in sim/economy.ts).
   */
  auto?: boolean;
}

/**
 * Per ora tutte le attività lavorano da sole (decisione dell'utente, 21/10/2026): partono con un dipendente per reparto
 * e il manager, e non si entra più dentro (niente bancone del food truck e del panificio, niente ordini fatti di
 * persona). Il codice del lavoro dentro resta (src/world/interior.ts, biztutorial): rimettendo `false` torna tutto.
 * Il laboratorio dell'artigiano (lavori su richiesta, senza personale) resta com'è.
 */
export const ALL_AUTO = true;
/** l'attività lavora da sola (vedi `auto` e `ALL_AUTO`) */
export const isAutoType = (t: BusinessType) => (ALL_AUTO ? bizType(t).kind !== 'craft' : !!bizType(t).auto);

/** massimo delle migliorie per gradino: attrezzatura, look, pubblicità, magazzino */
const AUTO_MAX = [[3, 3, 2, 2], [4, 4, 3, 3], [5, 5, 4, 3], [6, 6, 5, 4]];

/** Un'attività automatica (vedi `auto`): di Ristorazione e ospitalità, o di un altro settore con `sector`. */
function autoBiz(o: {
  name: string; icon: string; desc: string; products: ProductId[]; staff: [string, string]; color: string; rateMul: number;
  tier: number; evolveCost?: number; evolvesTo?: string[]; setupCost?: number;
  /** altro settore (Costruzione e manualità): servizi ("ordini" al posto di "clienti"), anche su un posteggio */
  sector?: SkillId; lot?: 'shop' | 'truck';
  /** nomi propri delle migliorie: attrezzatura, look, pubblicità, magazzino, più prodotti */
  upg: [[string, string], [string, string], [string, string], [string, string], [string, string]];
}): BusinessTypeDef {
  const m = AUTO_MAX[o.tier];
  const [att, look, mkt, frigo, menu] = o.upg;
  return {
    name: o.name, icon: o.icon, desc: o.desc, kind: o.sector ? 'service' : 'shop', lot: o.lot ?? 'shop', setupCost: o.setupCost ?? 0, products: o.products,
    roles: ['cucina', 'cassa'], roleNames: { cucina: o.staff[0], cassa: o.staff[1] }, skills: [o.sector ?? 'cucina', 'clientela'],
    rateMul: o.rateMul, color: o.color, sector: o.sector ?? 'cucina', tier: o.tier, evolveCost: o.evolveCost, evolvesTo: o.evolvesTo, auto: true,
    upgrades: {
      attrezzatura: { name: att[0], icon: att[1], desc: 'Il personale lavora più in fretta (+15% per livello).', max: m[0] },
      look: { name: look[0], icon: look[1], desc: 'Più clienti (+15% di domanda per livello).', max: m[1] },
      marketing: { name: mkt[0], icon: mkt[1], desc: '+10% di domanda per livello.', max: m[2] },
      frigo: { name: frigo[0], icon: frigo[1], desc: '+40 posti per le scorte.', max: m[3] },
      menu: { name: menu[0], icon: menu[1], desc: 'Un prodotto in più in vendita.' },
    },
  };
}

export const BUSINESS_TYPES = {
  foodtruck: {
    name: 'Food truck', icon: '🚚', desc: 'Cibo di strada: economico da aprire, si lavora al bancone.',
    kind: 'truck', lot: 'truck', setupCost: 0, products: ['panini', 'hotdog', 'tacos', 'gelati'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Cuoco', cassa: 'Cassiere' }, skills: ['cucina', 'clientela'],
    rateMul: 1, wall: 0xe8590c, color: '#e8590c', sector: 'cucina', tier: 0, evolvesTo: ['trattoria', 'bar_caffe', 'catering'],
    stations: { stock: '🧊 Frigo', work: '🔥 Piastra', counter: '🪟 Servi qui' },
  },
  panificio: {
    name: 'Panificio', icon: '🥖', desc: 'Pane e dolci: tanti clienti, prodotti economici.',
    kind: 'shop', lot: 'shop', setupCost: 2500, products: ['pane', 'cornetti', 'pizza', 'torte'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Fornaio', cassa: 'Commesso' }, skills: ['cucina', 'clientela'],
    rateMul: 1.1, wall: 0xd4a373, color: '#b5793d', sector: 'cucina', tier: 0, evolvesTo: ['pasticceria', 'forno_caffe'],
    stations: { stock: '🌾 Dispensa', work: '🔥 Forno', counter: '🧁 Bancone' },
  },
  artigianato: {
    name: "Laboratorio dell'artigiano", icon: '🎨', desc: 'Lavori a mano su richiesta, pagati più dei lavoretti. Si parte dai vasi.',
    kind: 'craft', lot: 'shop', setupCost: 3500, products: [],
    roles: [], roleNames: {}, skills: ['artigianato'],
    rateMul: 0, color: '#c0603a', sector: 'artigianato',
  },
  pulizie: {
    name: 'Impresa di pulizie', icon: '🧽', desc: 'Servizi a domicilio: esegui gli ordini nelle case.',
    kind: 'service', lot: 'shop', setupCost: 2000, products: ['pulizia_casa', 'pulizia_uffici', 'vetri'],
    roles: ['cucina'], roleNames: { cucina: 'Addetto pulizie' }, skills: ['manualita', 'clientela'],
    rateMul: 0.12, color: '#2d9cdb', sector: 'manualita', tier: 0, evolvesTo: ['pulizie_industriali', 'pulizie_eventi'],
    upgrades: { attrezzatura: { name: 'Lavapavimenti e aspiratori', icon: '🧹', max: 3 }, look: { name: 'Divise e furgoncino', icon: '👕', max: 3 }, marketing: { name: 'Volantini e passaparola', max: 2 }, frigo: { name: 'Detersivi di scorta', icon: '🧴', max: 2 }, menu: { name: 'Uffici e vetri', icon: '🏢' } },
  },
  traslochi: {
    name: 'Ditta traslochi', icon: '🚛', desc: 'Lavori grossi e ben pagati, serve un furgone.',
    kind: 'service', lot: 'shop', setupCost: 7000, products: ['trasloco_piccolo', 'trasloco_grande', 'sgombero'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Facchino', cassa: 'Autista' }, skills: ['logistica', 'manualita'],
    rateMul: 0.08, color: '#6a3cb0', sector: 'logistica', tier: 0, evolvesTo: ['trasporti_delicati', 'deposito_mobili', 'autotrasporti'],
    upgrades: { attrezzatura: { name: 'Carrelli e cinghie', icon: '🛒', max: 3 }, look: { name: 'Furgone con la scritta', icon: '🚛', max: 3 }, marketing: { name: 'Volantini e passaparola', max: 2 }, frigo: { name: 'Scatoloni di scorta', icon: '📦', max: 2 } },
  },
  // ---------------- 🚚 Trasporti e logistica: alberi delle evoluzioni (CARRIERE.md) ----------------
  bici: {
    name: 'Consegne in bici', icon: '🚲', desc: 'Consegne nel quartiere coi rider in bici: costa poco, si parte subito.',
    kind: 'service', lot: 'truck', setupCost: 1500, products: ['consegna_quartiere', 'consegna_pasti'],
    roles: ['cucina'], roleNames: { cucina: 'Rider' }, skills: ['logistica'], rateMul: 0.12, color: '#2fb36b', sector: 'logistica',
    tier: 0, evolvesTo: ['consegne_veloci', 'punto_ritiro'],
    upgrades: { attrezzatura: { name: 'Bici elettriche', icon: '⚡', desc: 'I rider consegnano più in fretta (+15% per livello).', max: 3 }, look: { name: 'Borse termiche e divise', icon: '🎒', desc: 'Clienti più contenti e più ordini (+15% per livello).', max: 3 }, marketing: { name: 'App degli ordini', icon: '📱', desc: 'Più ordini dai negozi del quartiere (+10% per livello).', max: 2 }, frigo: { name: 'Rastrelliera più grande', icon: '🚲', desc: '+40 consegne di scorta (borse, nastro, sacchetti).', max: 2 }, menu: { name: 'Zona di consegna più grande', icon: '🗺️', desc: 'Un servizio in più: i pasti a domicilio.' } },
  },
  consegne_veloci: {
    name: 'Consegne veloci', icon: '🛵', desc: 'Scooter in tutta la città: pacchi e pasti, anche dai tuoi locali.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['consegna_citta', 'consegna_pasti'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Rider in scooter', cassa: 'Centralinista' }, skills: ['logistica'], rateMul: 0.12, color: '#2d9cdb', sector: 'logistica',
    tier: 1, evolveCost: 22000, evolvesTo: ['corriere_espresso'],
    upgrades: { attrezzatura: { name: 'Scooter nuovi', icon: '🛵', max: 4 }, look: { name: 'Divise e caschi', icon: '⛑️', max: 4 }, marketing: { name: 'Turni di pranzo e cena', icon: '🕐', max: 3 }, frigo: { name: 'Borse termiche di scorta', icon: '🎒', max: 3 }, menu: { name: 'Zone di consegna', icon: '🗺️' } },
  },
  corriere_espresso: {
    name: 'Corriere espresso', icon: '🚐', desc: 'Furgoni e pacchi consegnati in giornata, anche urgenti.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['pacchi_giornata', 'consegna_urgente'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Autista di furgone', cassa: 'Smistatore' }, skills: ['logistica'], rateMul: 0.1, color: '#ff8a3d', sector: 'logistica',
    tier: 2, evolveCost: 70000, evolvesTo: ['compagnia_corrieri'],
    upgrades: { attrezzatura: { name: 'Furgoni nuovi', icon: '🚐', max: 5 }, look: { name: 'Deposito di smistamento', icon: '🏗️', max: 5 }, marketing: { name: 'Consegne serali', icon: '🌙', max: 4 }, frigo: { name: 'Scatole e buste', icon: '📦', max: 3 }, menu: { name: 'Servizio urgente', icon: '⚡' } },
  },
  compagnia_corrieri: {
    name: 'Compagnia di corrieri', icon: '🌍', desc: 'Contratti con tutta la città: il traguardo delle consegne.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['contratto_corriere', 'pacchi_giornata'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Corriere', cassa: 'Responsabile clienti' }, skills: ['logistica'], rateMul: 0.1, color: '#5b4bb7', sector: 'logistica',
    tier: 3, evolveCost: 200000,
    upgrades: { attrezzatura: { name: 'Flotta di furgoni', icon: '🚐', max: 6 }, look: { name: 'Filiali in città', icon: '🏢', max: 6 }, marketing: { name: 'Servizio aeroporto', icon: '✈️', max: 5 }, frigo: { name: 'Magazzino centrale', icon: '📦', max: 4 }, menu: { name: 'Pacchi in giornata', icon: '📦' } },
  },
  punto_ritiro: {
    name: 'Punto ritiro pacchi', icon: '📮', desc: 'La gente ritira e spedisce i pacchi: tu li tieni in ordine sugli scaffali.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['ritiro_pacchi', 'spedizione'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Magazziniere', cassa: 'Commesso' }, skills: ['logistica', 'clientela'], rateMul: 0.14, color: '#e5484d', sector: 'logistica',
    tier: 1, evolveCost: 20000, evolvesTo: ['centro_spedizioni'],
    upgrades: { attrezzatura: { name: 'Scaffali più grandi', icon: '🗄️', max: 4 }, look: { name: 'Orario prolungato', icon: '🕐', max: 4 }, marketing: { name: 'Insegna e app', icon: '📱', max: 3 }, frigo: { name: 'Etichette e buste', icon: '🏷️', max: 3 }, menu: { name: 'Spedizioni', icon: '✉️' } },
  },
  centro_spedizioni: {
    name: 'Centro spedizioni', icon: '📦', desc: 'Imballa e spedisce per privati e negozi.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['imballaggio', 'ritiro_pacchi'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Imballatore', cassa: 'Commesso' }, skills: ['logistica'], rateMul: 0.12, color: '#c8935a', sector: 'logistica',
    tier: 2, evolveCost: 65000, evolvesTo: ['armadietti'],
    upgrades: { attrezzatura: { name: 'Bilance e nastri', icon: '⚖️', max: 5 }, look: { name: 'Imballaggi speciali', icon: '🫧', max: 5 }, marketing: { name: 'Ritiro a domicilio', icon: '🚐', max: 4 }, frigo: { name: 'Scatole di ogni misura', icon: '📦', max: 3 }, menu: { name: 'Ritiro pacchi', icon: '📮' } },
  },
  armadietti: {
    name: 'Armadietti in città', icon: '🗄️', desc: 'Armadietti per i pacchi in tutta la città: un incasso per ognuno.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['armadietto', 'imballaggio'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Autista', cassa: 'Tecnico' }, skills: ['logistica'], rateMul: 0.1, color: '#2fb3a3', sector: 'logistica',
    tier: 3, evolveCost: 180000,
    upgrades: { attrezzatura: { name: 'Più armadietti', icon: '🗄️', max: 6 }, look: { name: 'Armadietti refrigerati', icon: '❄️', max: 6 }, marketing: { name: 'App con lo sblocco', icon: '📱', max: 5 }, frigo: { name: 'Ricambi', icon: '🔧', max: 4 }, menu: { name: 'Imballaggio', icon: '📦' } },
  },
  trasporti_delicati: {
    name: 'Trasporti delicati', icon: '🎹', desc: "Pianoforti, opere d'arte e antiquariato: pochi ordini, pagati molto.",
    kind: 'service', lot: 'shop', setupCost: 0, products: ['pianoforte', 'opere_arte'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Facchino specializzato', cassa: 'Autista' }, skills: ['logistica'], rateMul: 0.06, color: '#3a2f55', sector: 'logistica',
    tier: 1, evolveCost: 30000, evolvesTo: ['traslochi_azienda'],
    upgrades: { attrezzatura: { name: 'Montacarichi', icon: '🏗️', max: 4 }, look: { name: 'Casse imbottite', icon: '🫧', max: 4 }, marketing: { name: 'Assicurazione sul carico', icon: '🛡️', max: 3 }, frigo: { name: 'Imballaggi di scorta', icon: '📦', max: 3 }, menu: { name: "Opere d'arte", icon: '🖼️' } },
  },
  traslochi_azienda: {
    name: "Traslochi d'azienda", icon: '🏢', desc: 'Uffici e negozi interi, con le squadre di facchini.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['trasloco_ufficio', 'pianoforte'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Facchino', cassa: 'Caposquadra' }, skills: ['logistica'], rateMul: 0.06, color: '#6a3cb0', sector: 'logistica',
    tier: 2, evolveCost: 90000,
    upgrades: { attrezzatura: { name: 'Più squadre', icon: '👷', max: 5 }, look: { name: 'Camion grandi', icon: '🚛', max: 5 }, marketing: { name: 'Lavori di notte', icon: '🌙', max: 4 }, frigo: { name: 'Scatoloni e coperte', icon: '📦', max: 3 }, menu: { name: 'Pianoforti', icon: '🎹' } },
  },
  deposito_mobili: {
    name: 'Deposito mobili', icon: '🏬', desc: 'Custodia dei mobili nei box: un incasso al mese per ogni box.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['custodia_box', 'trasloco_piccolo'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Magazziniere', cassa: 'Autista' }, skills: ['logistica'], rateMul: 0.1, color: '#8a5a2b', sector: 'logistica',
    tier: 1, evolveCost: 25000, evolvesTo: ['deposito_merci'],
    upgrades: { attrezzatura: { name: 'Più box', icon: '🏬', max: 4 }, look: { name: 'Allarme e sorveglianza', icon: '🚨', max: 4 }, marketing: { name: 'Box climatizzati', icon: '❄️', max: 3 }, frigo: { name: 'Lucchetti e coperte', icon: '🔒', max: 3 }, menu: { name: 'Traslochi piccoli', icon: '📦' } },
  },
  deposito_merci: {
    name: 'Deposito merci', icon: '🏭', desc: 'Tiene le merci dei negozi e prepara i loro ordini.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['stoccaggio', 'preparazione_ordini'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Carrellista', cassa: 'Preparatore' }, skills: ['logistica'], rateMul: 0.08, color: '#6b7080', sector: 'logistica',
    tier: 2, evolveCost: 75000, evolvesTo: ['centro_distribuzione'],
    upgrades: { attrezzatura: { name: 'Muletti', icon: '🚜', max: 5 }, look: { name: 'Scaffali alti', icon: '🗄️', max: 5 }, marketing: { name: 'Spazio affittato ad altri', icon: '🤝', max: 4 }, frigo: { name: 'Bancali', icon: '🪵', max: 3 }, menu: { name: 'Preparazione ordini', icon: '📋' } },
  },
  centro_distribuzione: {
    name: 'Centro di distribuzione', icon: '🔀', desc: 'Nastri e smistamento: rifornisce tutta la città.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['smistamento', 'stoccaggio'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Addetto ai nastri', cassa: 'Carrellista' }, skills: ['logistica'], rateMul: 0.08, color: '#ff5d73', sector: 'logistica',
    tier: 3, evolveCost: 220000,
    upgrades: { attrezzatura: { name: 'Nastri trasportatori', icon: '🔀', max: 6 }, look: { name: 'Smistatori automatici', icon: '🤖', max: 6 }, marketing: { name: 'Banchine di carico', icon: '🚛', max: 5 }, frigo: { name: 'Ricambi dei nastri', icon: '🔧', max: 4 }, menu: { name: 'Stoccaggio', icon: '🏭' } },
  },
  autotrasporti: {
    name: 'Autotrasporti', icon: '🚚', desc: 'Camion con contratti fissi con i negozi della città.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['carico_camion'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Camionista', cassa: 'Meccanico' }, skills: ['logistica'], rateMul: 0.08, color: '#2d6cdb', sector: 'logistica',
    tier: 1, evolveCost: 28000, evolvesTo: ['trasporti_refrigerati'],
    upgrades: { attrezzatura: { name: 'Camion nuovi', icon: '🚚', max: 4 }, look: { name: 'Manutenzione dei mezzi', icon: '🔧', max: 4 }, marketing: { name: 'Contratti coi negozi', icon: '🤝', max: 3 }, frigo: { name: 'Gasolio', icon: '⛽', max: 3 } },
  },
  trasporti_refrigerati: {
    name: 'Trasporti refrigerati', icon: '❄️', desc: 'Cibo fresco per ristoranti e supermercati.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['carico_fresco', 'carico_camion'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Camionista', cassa: 'Meccanico' }, skills: ['logistica'], rateMul: 0.08, color: '#2d9cdb', sector: 'logistica',
    tier: 2, evolveCost: 80000, evolvesTo: ['trasporti_eccezionali'],
    upgrades: { attrezzatura: { name: 'Celle frigorifere', icon: '❄️', max: 5 }, look: { name: 'Consegne all\'alba', icon: '🌅', max: 5 }, marketing: { name: 'Contratti coi ristoranti', icon: '🤝', max: 4 }, frigo: { name: 'Gasolio', icon: '⛽', max: 3 }, menu: { name: 'Trasporto merci', icon: '🚚' } },
  },
  trasporti_eccezionali: {
    name: 'Trasporti eccezionali', icon: '🚛', desc: 'Carichi enormi e bisarche per le concessionarie.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['trasporto_eccezionale', 'carico_fresco'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Camionista', cassa: 'Auto di scorta' }, skills: ['logistica'], rateMul: 0.06, color: '#ffc21a', sector: 'logistica',
    tier: 3, evolveCost: 210000,
    upgrades: { attrezzatura: { name: 'Bisarche', icon: '🚛', max: 6 }, look: { name: 'Permessi speciali', icon: '📜', max: 6 }, marketing: { name: 'Auto di scorta', icon: '🚓', max: 5 }, frigo: { name: 'Gasolio', icon: '⛽', max: 4 }, menu: { name: 'Trasporti refrigerati', icon: '❄️' } },
  },
  navetta: {
    name: 'Navetta', icon: '🚐', desc: 'Un pulmino tra hotel, stazione e centro.',
    kind: 'service', lot: 'truck', setupCost: 6000, products: ['corsa_navetta'],
    roles: ['cucina'], roleNames: { cucina: 'Autista' }, skills: ['logistica'], rateMul: 0.12, color: '#2fb36b', sector: 'logistica',
    tier: 0, evolvesTo: ['ncc', 'bus_turistici'],
    upgrades: { attrezzatura: { name: 'Pulmini in più', icon: '🚐', max: 3 }, look: { name: 'Aria condizionata', icon: '❄️', max: 3 }, marketing: { name: 'Fermate in più', icon: '🚏', max: 2 }, frigo: { name: 'Carburante', icon: '⛽', max: 2 } },
  },
  ncc: {
    name: 'Noleggio con conducente', icon: '🚕', desc: 'Corse prenotate per clienti importanti.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['corsa_vip', 'corsa_navetta'],
    roles: ['cucina'], roleNames: { cucina: 'Autista' }, skills: ['logistica', 'clientela'], rateMul: 0.1, color: '#ffc21a', sector: 'logistica',
    tier: 1, evolveCost: 26000, evolvesTo: ['limousine'],
    upgrades: { attrezzatura: { name: 'Auto di lusso', icon: '🚘', max: 4 }, look: { name: 'Autisti in divisa', icon: '🎩', max: 4 }, marketing: { name: 'Prenotazioni dall\'app', icon: '📱', max: 3 }, frigo: { name: 'Carburante', icon: '⛽', max: 3 }, menu: { name: 'Navette', icon: '🚐' } },
  },
  limousine: {
    name: 'Limousine ed eventi', icon: '🎩', desc: 'Matrimoni, prime e ospiti importanti.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['matrimonio', 'corsa_vip'],
    roles: ['cucina'], roleNames: { cucina: 'Autista' }, skills: ['logistica', 'clientela'], rateMul: 0.08, color: '#1c1c22', sector: 'logistica',
    tier: 2, evolveCost: 85000,
    upgrades: { attrezzatura: { name: 'Limousine', icon: '🎩', max: 5 }, look: { name: 'Tappeto rosso', icon: '🟥', max: 5 }, marketing: { name: 'Pacchetti matrimonio', icon: '💍', max: 4 }, frigo: { name: 'Fiori e champagne', icon: '🍾', max: 3 }, menu: { name: 'Corse con conducente', icon: '🚕' } },
  },
  bus_turistici: {
    name: 'Bus turistici', icon: '🚌', desc: "Giri della città per i turisti, di più d'estate.",
    kind: 'service', lot: 'shop', setupCost: 0, products: ['giro_turistico', 'corsa_navetta'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Autista', cassa: 'Guida turistica' }, skills: ['logistica', 'clientela'], rateMul: 0.1, color: '#e5484d', sector: 'logistica',
    tier: 1, evolveCost: 30000, evolvesTo: ['linee_urbane'],
    upgrades: { attrezzatura: { name: 'Bus scoperto', icon: '🚌', max: 4 }, look: { name: 'Giri a tema', icon: '🏛️', max: 4 }, marketing: { name: 'Biglietti online', icon: '🎟️', max: 3 }, frigo: { name: 'Carburante', icon: '⛽', max: 3 }, menu: { name: 'Navette', icon: '🚐' } },
  },
  linee_urbane: {
    name: 'Linee urbane in appalto', icon: '🚏', desc: 'Gli autobus della città: appalti del comune, con penali se fai tardi.',
    kind: 'service', lot: 'shop', setupCost: 0, products: ['linea_urbana', 'giro_turistico'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Autista di autobus', cassa: 'Controllore' }, skills: ['logistica'], rateMul: 0.08, color: '#2d6cdb', sector: 'logistica',
    tier: 2, evolveCost: 90000,
    upgrades: { attrezzatura: { name: 'Autobus nuovi', icon: '🚌', max: 5 }, look: { name: 'Fermate coperte', icon: '🚏', max: 5 }, marketing: { name: 'Più linee', icon: '🗺️', max: 4 }, frigo: { name: 'Carburante', icon: '⛽', max: 3 }, menu: { name: 'Giri turistici', icon: '🚌' } },
  },
  // ---------------- 🍳 Ristorazione e ospitalità: alberi delle evoluzioni (CARRIERE.md), tutte automatiche ----------------
  trattoria: autoBiz({
    name: 'Trattoria', icon: '🍝', desc: 'Primi e secondi della casa, a pranzo e a cena.', products: ['primi', 'secondi'],
    staff: ['Cuoco', 'Cameriere'], color: '#c0392b', rateMul: 1.0116, tier: 1, evolveCost: 24000, evolvesTo: ['ristorante'],
    upg: [['Cucina professionale', '🔥'], ['Tovaglie e arredi', '🪑'], ['Insegna e recensioni', '📣'], ['Dispensa più grande', '🧊'], ['Secondi piatti', '🥩']],
  }),
  ristorante: autoBiz({
    name: 'Ristorante', icon: '🍽️', desc: 'Cene curate e una carta dei vini.', products: ['cena_ristorante', 'vini'],
    staff: ['Cuoco', 'Cameriere'], color: '#8e2b4f', rateMul: 1.6202, tier: 2, evolveCost: 75000, evolvesTo: ['stellato'],
    upg: [['Cucina nuova', '🔥'], ['Sala elegante', '🕯️'], ['Guide e recensioni', '⭐'], ['Cantina e dispensa', '🍷'], ['Carta dei vini', '🍷']],
  }),
  stellato: autoBiz({
    name: 'Ristorante stellato', icon: '⭐', desc: 'Menù degustazione e vini pregiati: il traguardo della cucina.', products: ['degustazione', 'vini_pregiati'],
    staff: ['Chef', 'Maître'], color: '#3a2f55', rateMul: 0.9306, tier: 3, evolveCost: 210000,
    upg: [['Brigata di cucina', '👨‍🍳'], ['Sala di lusso', '💎'], ['Stelle e premi', '🏆'], ['Cantina pregiata', '🍾'], ['Vini pregiati', '🍾']],
  }),
  bar_caffe: autoBiz({
    name: 'Bar caffetteria', icon: '☕', desc: 'Caffè e colazioni dalla mattina presto.', products: ['caffe', 'colazioni'],
    staff: ['Barista', 'Cassiere'], color: '#7a4a2a', rateMul: 4.0317, tier: 1, evolveCost: 22000, evolvesTo: ['cocktail_bar'],
    upg: [['Macchina del caffè', '☕'], ['Tavolini e dehors', '🪑'], ['Insegna', '📣'], ['Scorte di caffè', '📦'], ['Colazioni', '🥐']],
  }),
  cocktail_bar: autoBiz({
    name: 'Cocktail bar', icon: '🍸', desc: 'Cocktail e aperitivi la sera.', products: ['cocktail', 'aperitivi'],
    staff: ['Barman', 'Cameriere'], color: '#2f6f8f', rateMul: 3.7387, tier: 2, evolveCost: 70000, evolvesTo: ['locale_eventi'],
    upg: [['Bancone attrezzato', '🍸'], ['Luci e arredi', '✨'], ['Serate a tema', '📣'], ['Bottiglie di scorta', '🍾'], ['Aperitivi', '🥂']],
  }),
  locale_eventi: autoBiz({
    name: 'Locale per eventi', icon: '🎉', desc: 'Serate con la musica e feste private.', products: ['serate', 'feste_private'],
    staff: ['Barman', 'Addetto alla sala'], color: '#8e5bd6', rateMul: 2.1542, tier: 3, evolveCost: 200000,
    upg: [['Impianto audio', '🎤'], ['Palco e luci', '🎆'], ['Artisti famosi', '🎸'], ['Magazzino bevande', '📦'], ['Feste private', '🎉']],
  }),
  catering: autoBiz({
    name: 'Catering', icon: '🥂', desc: 'Buffet per feste e aperitivi per le aziende.', products: ['buffet', 'aperitivi_aziende'],
    staff: ['Cuoco', 'Cameriere'], color: '#d4a017', rateMul: 0.0687, tier: 1, evolveCost: 26000, evolvesTo: ['banchetti'],
    upg: [['Furgone frigo', '🚐'], ['Vassoi e tovaglie', '🍽️'], ['Passaparola', '📣'], ['Dispensa', '🧊'], ['Aperitivi aziendali', '🥂']],
  }),
  banchetti: autoBiz({
    name: 'Banchetti e matrimoni', icon: '💍', desc: 'Pranzi di nozze e cene aziendali.', products: ['banchetto_nozze', 'cene_aziendali'],
    staff: ['Cuoco', 'Cameriere'], color: '#e48aa8', rateMul: 0.0162, tier: 2, evolveCost: 80000, evolvesTo: ['grandi_eventi'],
    upg: [['Cucina da campo', '🔥'], ['Allestimenti', '💐'], ['Fiere degli sposi', '💒'], ['Dispensa grande', '🧊'], ['Cene aziendali', '🍽️']],
  }),
  grandi_eventi: autoBiz({
    name: 'Grandi eventi', icon: '🏛️', desc: 'Eventi in città, concerti e festival.', products: ['eventi_citta', 'concerti'],
    staff: ['Cuoco', 'Organizzatore'], color: '#2d6cdb', rateMul: 0.0107, tier: 3, evolveCost: 220000,
    upg: [['Squadre di cucina', '👨‍🍳'], ['Palchi e tendoni', '🏗️'], ['Contratti col comune', '📜'], ['Magazzino eventi', '📦'], ['Concerti', '🎸']],
  }),
  pasticceria: autoBiz({
    name: 'Pasticceria', icon: '🧁', desc: 'Pasticcini e semifreddi in vetrina.', products: ['pasticcini', 'semifreddi'],
    staff: ['Pasticcere', 'Commesso'], color: '#e8789a', rateMul: 3.091, tier: 1, evolveCost: 22000, evolvesTo: ['torte_ordinazione'],
    upg: [['Forno e banchi', '🔥'], ['Vetrina', '✨'], ['Insegna', '📣'], ['Dispensa', '🧊'], ['Semifreddi', '🍨']],
  }),
  torte_ordinazione: autoBiz({
    name: 'Torte su ordinazione', icon: '🎂', desc: 'Torte per le feste e torte nuziali.', products: ['torte_compleanno', 'torte_nuziali'],
    staff: ['Pasticcere', 'Commesso'], color: '#c86b98', rateMul: 0.1132, tier: 2, evolveCost: 70000, evolvesTo: ['cioccolateria'],
    upg: [['Laboratorio', '🎂'], ['Sala degustazione', '🪑'], ['Fiere degli sposi', '💒'], ['Dispensa', '🧊'], ['Torte nuziali', '🍰']],
  }),
  cioccolateria: autoBiz({
    name: 'Cioccolateria', icon: '🍫', desc: 'Praline e cioccolato da regalo: il traguardo della pasticceria.', products: ['praline', 'cioccolato_regalo'],
    staff: ['Cioccolatiere', 'Commesso'], color: '#5a3a22', rateMul: 1.0368, tier: 3, evolveCost: 190000,
    upg: [['Temperatrici', '🌡️'], ['Boutique', '💎'], ['Regali aziendali', '🎁'], ['Cella del cioccolato', '🧊'], ['Cioccolato da regalo', '🎁']],
  }),
  forno_caffe: autoBiz({
    name: 'Forno con caffè', icon: '🥐', desc: 'Colazioni appena sfornate e caffè.', products: ['colazione_forno', 'caffe'],
    staff: ['Fornaio', 'Barista'], color: '#c8935a', rateMul: 3.7092, tier: 1, evolveCost: 22000, evolvesTo: ['forno_ingrosso'],
    upg: [['Forno nuovo', '🔥'], ['Tavolini', '🪑'], ['Insegna', '📣'], ['Dispensa', '🌾'], ['Caffè', '☕']],
  }),
  forno_ingrosso: autoBiz({
    name: "Forno all'ingrosso", icon: '🏭', desc: 'Pane per i negozi e forniture per i locali della città.', products: ['pane_ingrosso', 'forniture_locali'],
    staff: ['Fornaio', 'Autista'], color: '#8a5a2b', rateMul: 0.1376, tier: 2, evolveCost: 75000,
    upg: [['Forni industriali', '🔥'], ['Furgoni per le consegne', '🚚'], ['Contratti coi negozi', '🤝'], ['Silos di farina', '🌾'], ['Forniture per i locali', '🥖']],
  }),
  bnb: autoBiz({
    name: 'Bed & breakfast', icon: '🛎️', desc: 'Poche camere con la colazione: lavora da solo col suo personale.', products: ['camere_bnb', 'camere_famiglia'],
    staff: ['Cameriera ai piani', 'Receptionist'], color: '#2fa866', rateMul: 0.095, tier: 0, setupCost: 6000, evolvesTo: ['hotel', 'ostello'],
    upg: [['Letti nuovi', '🛏️'], ['Camere arredate', '🖼️'], ['Siti di prenotazione', '📱'], ['Lenzuola e asciugamani', '🧺'], ['Camere per famiglie', '🧸']],
  }),
  hotel: autoBiz({
    name: 'Hotel', icon: '🏨', desc: 'Più camere e la mezza pensione.', products: ['camere_hotel', 'mezza_pensione'],
    staff: ['Cameriera ai piani', 'Receptionist'], color: '#2d9cdb', rateMul: 0.0789, tier: 1, evolveCost: 30000, evolvesTo: ['hotel4'],
    upg: [['Camere rinnovate', '🛏️'], ['Hall elegante', '🛋️'], ['Agenzie di viaggio', '✈️'], ['Biancheria', '🧺'], ['Mezza pensione', '🍽️']],
  }),
  hotel4: autoBiz({
    name: 'Hotel 4 stelle', icon: '🏨', desc: 'Suite e sale per i congressi.', products: ['suite', 'congressi'],
    staff: ['Cameriera ai piani', 'Receptionist'], color: '#5b4bb7', rateMul: 0.0651, tier: 2, evolveCost: 90000, evolvesTo: ['resort'],
    upg: [['Suite di lusso', '🛎️'], ['Piscina', '🌊'], ['Agenzie e aziende', '✈️'], ['Biancheria', '🧺'], ['Sale per congressi', '🤝']],
  }),
  resort: autoBiz({
    name: 'Resort di lusso', icon: '🏰', desc: 'Soggiorni di lusso e spa: il traguardo dell\'ospitalità.', products: ['soggiorno_resort', 'spa'],
    staff: ['Cameriera ai piani', 'Concierge'], color: '#1c6b5a', rateMul: 0.0616, tier: 3, evolveCost: 220000,
    upg: [['Ville private', '🏡'], ['Giardini e piscine', '🌳'], ['Ospiti famosi', '🤩'], ['Biancheria di lusso', '🧺'], ['Pacchetti spa', '🧴']],
  }),
  ostello: autoBiz({
    name: 'Ostello', icon: '🎒', desc: 'Tanti posti letto a poco prezzo e qualche camera privata.', products: ['posto_letto', 'camere_private'],
    staff: ['Addetto alle pulizie', 'Receptionist'], color: '#ff8a3d', rateMul: 0.2612, tier: 1, evolveCost: 24000, evolvesTo: ['residence'],
    upg: [['Letti a castello', '🛏️'], ['Sala comune', '🛋️'], ['Siti per giovani', '📱'], ['Lenzuola', '🧺'], ['Camere private', '🛏️']],
  }),
  residence: autoBiz({
    name: 'Residence', icon: '🏢', desc: 'Appartamenti per le vacanze e per chi viene in città per lavoro.', products: ['appartamenti', 'soggiorni_lavoro'],
    staff: ['Addetto alle pulizie', 'Receptionist'], color: '#6b7080', rateMul: 0.0959, tier: 2, evolveCost: 80000,
    upg: [['Appartamenti nuovi', '🏢'], ['Portineria', '🛎️'], ['Siti di prenotazione', '📱'], ['Biancheria', '🧺'], ['Soggiorni di lavoro', '💼']],
  }),
  // ---------------- 🔨 Costruzione e manualità: alberi delle evoluzioni (CARRIERE.md), tutte automatiche ----------------
  giardiniere: autoBiz({
    name: 'Giardiniere di quartiere', icon: '🌿', desc: 'Prati e siepi delle case del quartiere: col furgoncino degli attrezzi, su un posteggio.', products: ['prati', 'siepi'],
    staff: ['Giardiniere', 'Aiutante'], color: '#3f9a3a', rateMul: 0.095, tier: 0, setupCost: 4000, sector: 'manualita', lot: 'truck', evolvesTo: ['ditta_giardini', 'vivaio'],
    upg: [['Tosaerba nuovi', '🚜'], ['Furgoncino con la scritta', '🚐'], ['Volantini nelle cassette', '📣'], ['Sacchi e concime', '🧺'], ['Siepi e cespugli', '✂️']],
  }),
  ditta_giardini: autoBiz({
    name: 'Ditta di giardinaggio', icon: '🌳', desc: 'Giardini nuovi e potature.', products: ['giardini_nuovi', 'potature'], sector: 'manualita',
    staff: ['Giardiniere', 'Progettista'], color: '#2e7d32', rateMul: 0.0789, tier: 1, evolveCost: 30000, evolvesTo: ['manutenzione_parchi'],
    upg: [['Attrezzi professionali', '✂️'], ['Progetti a colori', '🌱'], ['Sito e recensioni', '📱'], ['Vivaio di scorta', '🪴'], ['Potature', '🌳']],
  }),
  manutenzione_parchi: autoBiz({
    name: 'Manutenzione parchi', icon: '🏞️', desc: 'Appalti del comune per i parchi e le aiuole della città.', products: ['parchi_comune', 'aiuole_citta'], sector: 'manualita',
    staff: ['Giardiniere', 'Caposquadra'], color: '#4a8f3c', rateMul: 0.0651, tier: 2, evolveCost: 90000, evolvesTo: ['paesaggistica'],
    upg: [['Trattorini e soffiatori', '🚜'], ['Squadre in divisa', '👕'], ['Contratti col comune', '📜'], ['Magazzino attrezzi', '📦'], ['Aiuole della città', '🌷']],
  }),
  paesaggistica: autoBiz({
    name: 'Studio di paesaggistica', icon: '🏛️', desc: 'Giardini delle ville, degli hotel e dei resort: il traguardo del giardinaggio.', products: ['giardini_ville', 'giardini_resort'], sector: 'manualita',
    staff: ['Paesaggista', 'Giardiniere'], color: '#1c6b5a', rateMul: 0.0616, tier: 3, evolveCost: 220000,
    upg: [['Fontane e vialetti', '⛲'], ['Studio elegante', '💎'], ['Clienti famosi', '🤩'], ['Piante rare', '🌴'], ['Giardini dei resort', '🌴']],
  }),
  vivaio: autoBiz({
    name: 'Vivaio', icon: '🪴', desc: 'Piante e fiori, coltivati e venduti.', products: ['piante', 'fiori'], sector: 'manualita',
    staff: ['Vivaista', 'Commesso'], color: '#6ab04c', rateMul: 0.2612, tier: 1, evolveCost: 24000, evolvesTo: ['garden_center'],
    upg: [['Serre', '🌱'], ['Esposizione', '🌷'], ['Insegna', '📣'], ['Vasi e terriccio', '🪴'], ['Fiori', '🌷']],
  }),
  garden_center: autoBiz({
    name: 'Garden center', icon: '🌺', desc: 'Piante, attrezzi e arredo da giardino in un grande negozio.', products: ['attrezzi_giardino', 'arredo_giardino'], sector: 'manualita',
    staff: ['Commesso', 'Vivaista'], color: '#d35d8a', rateMul: 0.0959, tier: 2, evolveCost: 80000,
    upg: [['Scaffali e casse', '🧰'], ['Serra espositiva', '🌺'], ['Volantini e sito', '📱'], ['Magazzino', '📦'], ['Arredo da giardino', '🪑']],
  }),
  pulizie_industriali: autoBiz({
    name: 'Pulizie industriali', icon: '🏢', desc: 'Grandi uffici e vetri dei palazzi.', products: ['uffici_grandi', 'vetri_palazzi'], sector: 'manualita',
    staff: ['Addetto pulizie', 'Caposquadra'], color: '#2d6cdb', rateMul: 0.0789, tier: 1, evolveCost: 30000, evolvesTo: ['sanificazione'],
    upg: [['Lavasciuga', '🧹'], ['Divise e furgoni', '👕'], ['Contratti con le aziende', '🤝'], ['Detersivi', '🧴'], ['Vetri dei palazzi', '🪟']],
  }),
  sanificazione: autoBiz({
    name: 'Sanificazione', icon: '🧪', desc: 'Ospedali e laboratori: pulizia perfetta, zone da non saltare.', products: ['ospedali', 'laboratori'], sector: 'manualita',
    staff: ['Tecnico', 'Caposquadra'], color: '#13a3a3', rateMul: 0.0651, tier: 2, evolveCost: 90000,
    upg: [['Macchine a vapore', '🫧'], ['Tute e protezioni', '🧤'], ['Certificati', '📜'], ['Prodotti speciali', '🧴'], ['Laboratori', '🧪']],
  }),
  pulizie_eventi: autoBiz({
    name: 'Pulizie per eventi', icon: '🎪', desc: 'Concerti, fiere e stadi: si pulisce tutto dopo la festa.', products: ['pulizia_concerti', 'pulizia_fiere'], sector: 'manualita',
    staff: ['Addetto pulizie', 'Caposquadra'], color: '#e8590c', rateMul: 0.0789, tier: 1, evolveCost: 30000,
    upg: [['Spazzatrici', '🧹'], ['Squadre grandi', '👕'], ['Contratti con gli organizzatori', '🤝'], ['Sacchi e bidoni', '🗑️'], ['Fiere e stadi', '🏟️']],
  }),
  tuttofare: autoBiz({
    name: 'Tuttofare', icon: '🔧', desc: 'Montaggi e riparazioni a casa dei clienti: col furgoncino, su un posteggio.', products: ['montaggi', 'riparazioni'],
    staff: ['Tuttofare', 'Aiutante'], color: '#e0a100', rateMul: 0.095, tier: 0, setupCost: 4000, sector: 'manualita', lot: 'truck', evolvesTo: ['costruzioni', 'ditta_impianti'],
    upg: [['Cassetta degli attrezzi', '🧰'], ['Furgoncino con la scritta', '🚐'], ['Volantini nelle cassette', '📣'], ['Viti e ricambi', '🔧'], ['Riparazioni in casa', '🛠️']],
  }),
  costruzioni: autoBiz({
    name: 'Costruzioni', icon: '🧱', desc: 'Soppalchi, scale, muri e case piccole.', products: ['soppalchi', 'muri'], sector: 'manualita',
    staff: ['Muratore', 'Carpentiere'], color: '#b5532f', rateMul: 0.0789, tier: 1, evolveCost: 30000, evolvesTo: ['impresa_edile'],
    upg: [['Betoniera e attrezzi', '🏗️'], ['Furgoni e divise', '👕'], ['Cartelli nei cantieri', '📣'], ['Mattoni e legname', '🧱'], ['Muri e tramezzi', '🧱']],
  }),
  impresa_edile: autoBiz({
    name: 'Impresa edile', icon: '🏗️', desc: 'Case nuove e palazzine.', products: ['case_nuove', 'palazzine'], sector: 'manualita',
    staff: ['Muratore', 'Gruista'], color: '#d4a017', rateMul: 0.0651, tier: 2, evolveCost: 90000, evolvesTo: ['grandi_opere'],
    upg: [['Gru e ponteggi', '🏗️'], ['Squadre di cantiere', '👷'], ['Appalti', '📜'], ['Deposito materiali', '📦'], ['Palazzine', '🏘️']],
  }),
  grandi_opere: autoBiz({
    name: 'Grandi opere', icon: '🌉', desc: 'Palazzi alti, ponti e grandi cantieri: il traguardo della costruzione.', products: ['palazzi_alti', 'ponti'], sector: 'manualita',
    staff: ['Caposquadra', 'Gruista'], color: '#3a2f55', rateMul: 0.0616, tier: 3, evolveCost: 220000,
    upg: [['Gru giganti', '🏗️'], ['Ingegneri', '📐'], ['Appalti del comune', '📜'], ['Acciaio e cemento', '🧱'], ['Ponti', '🌉']],
  }),
  ditta_impianti: autoBiz({
    name: 'Ditta di impianti', icon: '⚡', desc: 'Impianti idraulici ed elettrici nelle case.', products: ['impianti_idraulici', 'impianti_elettrici'], sector: 'manualita',
    staff: ['Idraulico', 'Elettricista'], color: '#2d9cdb', rateMul: 0.0789, tier: 1, evolveCost: 30000, evolvesTo: ['caldaie_clima'],
    upg: [['Attrezzi professionali', '🔧'], ['Furgoni attrezzati', '🚐'], ['Pronto intervento', '📱'], ['Tubi e cavi', '🔌'], ['Impianti elettrici', '⚡']],
  }),
  caldaie_clima: autoBiz({
    name: 'Caldaie e clima', icon: '🔥', desc: 'Caldaie e termosifoni d\'inverno, condizionatori d\'estate.', products: ['caldaie', 'condizionatori'], sector: 'manualita',
    staff: ['Tecnico', 'Installatore'], color: '#e5484d', rateMul: 0.0959, tier: 2, evolveCost: 80000, evolvesTo: ['energia_domotica'],
    upg: [['Strumenti di controllo', '🌡️'], ['Furgoni attrezzati', '🚐'], ['Contratti di manutenzione', '📜'], ['Ricambi', '🔧'], ['Condizionatori', '❄️']],
  }),
  energia_domotica: autoBiz({
    name: 'Energia e casa intelligente', icon: '☀️', desc: 'Pannelli solari e case intelligenti: il traguardo degli impianti.', products: ['pannelli_solari', 'domotica'], sector: 'manualita',
    staff: ['Tecnico', 'Installatore'], color: '#f2a900', rateMul: 0.0616, tier: 3, evolveCost: 220000,
    upg: [['Droni e sensori', '📡'], ['Showroom', '💡'], ['Incentivi', '📜'], ['Pannelli in magazzino', '☀️'], ['Casa intelligente', '💡']],
  }),
  // ---------------- 🎨 Arte, design e ristrutturazione: alberi delle evoluzioni (CARRIERE.md), tutte automatiche ----------------
  pittore: autoBiz({
    name: 'Imbianchino', icon: '🖌️', desc: 'Pareti e recinzioni dipinte: col furgoncino dei colori, su un posteggio.', products: ['tinteggiature', 'recinzioni_dipinte'],
    staff: ['Imbianchino', 'Aiutante'], color: '#e8590c', rateMul: 0.095, tier: 0, setupCost: 4000, sector: 'artigianato', lot: 'truck', evolvesTo: ['ristrutturazioni', 'decorazioni'],
    upg: [['Pennelli e rulli nuovi', '🖌️'], ['Furgoncino con la scritta', '🚐'], ['Volantini nelle cassette', '📣'], ['Secchi di vernice', '🪣'], ['Recinzioni e cancelli', '🏡']],
  }),
  ristrutturazioni: autoBiz({
    name: 'Ristrutturazioni', icon: '🧱', desc: 'Pavimenti, piastrelle e bagni rifatti.', products: ['pavimenti', 'bagni'], sector: 'artigianato',
    staff: ['Piastrellista', 'Muratore'], color: '#b5532f', rateMul: 0.0789, tier: 1, evolveCost: 30000, evolvesTo: ['impresa_ristrutturazioni'],
    upg: [['Tagliapiastrelle', '🧱'], ['Furgoni e divise', '👕'], ['Sito con le foto', '📱'], ['Piastrelle in magazzino', '📦'], ['Bagni', '🛁']],
  }),
  impresa_ristrutturazioni: autoBiz({
    name: 'Impresa di ristrutturazioni', icon: '🏡', desc: 'Case e negozi rifatti da capo.', products: ['case_ristrutturate', 'negozi_rinnovati'], sector: 'artigianato',
    staff: ['Muratore', 'Capocantiere'], color: '#c2410c', rateMul: 0.0651, tier: 2, evolveCost: 90000, evolvesTo: ['ristrutturazioni_lusso'],
    upg: [['Ponteggi e attrezzi', '🏗️'], ['Squadre di cantiere', '👷'], ['Preventivi gratis', '📜'], ['Deposito materiali', '📦'], ['Negozi', '🏪']],
  }),
  ristrutturazioni_lusso: autoBiz({
    name: 'Ristrutturazioni di lusso', icon: '🏰', desc: 'Ville e palazzi storici: il traguardo della ristrutturazione.', products: ['ville_ristrutturate', 'palazzi_storici'], sector: 'artigianato',
    staff: ['Architetto', 'Capocantiere'], color: '#7c3aed', rateMul: 0.0616, tier: 3, evolveCost: 220000,
    upg: [['Materiali pregiati', '💎'], ['Studio elegante', '🏛️'], ['Clienti famosi', '🤩'], ['Marmi e legni rari', '🪵'], ['Palazzi storici', '🏛️']],
  }),
  decorazioni: autoBiz({
    name: 'Decorazioni', icon: '🎨', desc: 'Pareti decorate e murales.', products: ['pareti_decorate', 'murales'], sector: 'artigianato',
    staff: ['Decoratore', 'Pittore'], color: '#d946ef', rateMul: 0.0789, tier: 1, evolveCost: 26000, evolvesTo: ['interior_design'],
    upg: [['Stencil e spatole', '🎨'], ['Bozzetti a colori', '🖼️'], ['Profilo con le foto', '📱'], ['Colori speciali', '🪣'], ['Murales', '🖼️']],
  }),
  interior_design: autoBiz({
    name: 'Studio di interior design', icon: '🛋️', desc: 'Case e locali arredati da capo: il traguardo della decorazione.', products: ['case_arredate', 'locali_arredati'], sector: 'artigianato',
    staff: ['Designer', 'Arredatore'], color: '#0f766e', rateMul: 0.0959, tier: 2, evolveCost: 85000,
    upg: [['Progetti in 3D', '📐'], ['Showroom', '🛋️'], ['Riviste di arredo', '📣'], ['Campionario', '📦'], ['Locali', '🪑']],
  }),
  falegnameria: autoBiz({
    name: 'Falegnameria', icon: '🪚', desc: 'Mensole, piccoli mobili e riparazioni in legno.', products: ['mensole', 'riparazioni_legno'],
    staff: ['Falegname', 'Commesso'], color: '#a16207', rateMul: 0.095, tier: 0, setupCost: 3500, sector: 'artigianato', evolvesTo: ['mobili_misura', 'restauro'],
    upg: [['Seghe e pialle', '🪚'], ['Bottega in ordine', '🪵'], ['Insegna di legno', '📣'], ['Legname in magazzino', '📦'], ['Riparazioni in legno', '🔨']],
  }),
  mobili_misura: autoBiz({
    name: 'Mobili su misura', icon: '🪑', desc: 'Mobili e cucine fatti sulle misure della casa.', products: ['mobili_misura', 'cucine_legno'], sector: 'artigianato',
    staff: ['Falegname', 'Montatore'], color: '#92400e', rateMul: 0.0789, tier: 1, evolveCost: 30000, evolvesTo: ['mobilificio'],
    upg: [['Macchine da taglio', '🪚'], ['Disegni dei mobili', '📐'], ['Sito e recensioni', '📱'], ['Legni scelti', '🪵'], ['Cucine', '🍽️']],
  }),
  mobilificio: autoBiz({
    name: 'Mobilificio', icon: '🏭', desc: 'Arredi per negozi e uffici, tanti pezzi uguali.', products: ['arredi_negozi', 'arredi_uffici'], sector: 'artigianato',
    staff: ['Operaio', 'Montatore'], color: '#78716c', rateMul: 0.0959, tier: 2, evolveCost: 85000, evolvesTo: ['ebanisteria'],
    upg: [['Linea di produzione', '🏭'], ['Camion delle consegne', '🚚'], ['Contratti con le aziende', '🤝'], ['Magazzino', '📦'], ['Uffici', '💼']],
  }),
  ebanisteria: autoBiz({
    name: 'Ebanisteria', icon: '💎', desc: 'Mobili di pregio e intarsi: il traguardo della falegnameria.', products: ['mobili_pregio', 'intarsi'], sector: 'artigianato',
    staff: ['Ebanista', 'Intarsiatore'], color: '#3f2a1d', rateMul: 0.0616, tier: 3, evolveCost: 220000,
    upg: [['Attrezzi a mano antichi', '🪚'], ['Bottega storica', '🏛️'], ['Mostre', '🤩'], ['Legni rari', '🪵'], ['Intarsi', '🎨']],
  }),
  restauro: autoBiz({
    name: 'Restauro', icon: '🖌️', desc: 'Mobili vecchi restaurati, cornici e quadri.', products: ['restauri', 'cornici'], sector: 'artigianato',
    staff: ['Restauratore', 'Commesso'], color: '#b45309', rateMul: 0.0789, tier: 1, evolveCost: 26000, evolvesTo: ['antiquario'],
    upg: [['Pennelli fini e cere', '🖌️'], ['Vetrina', '🖼️'], ['Passaparola', '📣'], ['Vernici antiche', '🪣'], ['Cornici e quadri', '🖼️']],
  }),
  antiquario: autoBiz({
    name: 'Antiquario', icon: '🏺', desc: 'Pezzi antichi da collezione e aste: il traguardo del restauro.', products: ['antiquariato', 'aste'], sector: 'artigianato',
    staff: ['Antiquario', 'Battitore'], color: '#854d0e', rateMul: 0.0651, tier: 2, evolveCost: 90000,
    upg: [['Perizie', '🔎'], ['Sala espositiva', '🏛️'], ['Cataloghi', '📣'], ['Pezzi da collezione', '🏺'], ['Aste', '🔨']],
  }),
  studio_foto: autoBiz({
    name: 'Studio fotografico', icon: '📷', desc: 'Ritratti, foto tessera e foto alle feste.', products: ['ritratti', 'foto_feste'],
    staff: ['Fotografo', 'Commesso'], color: '#2563eb', rateMul: 0.095, tier: 0, setupCost: 3500, sector: 'artigianato', evolvesTo: ['foto_matrimoni', 'sartoria'],
    upg: [['Macchine fotografiche', '📷'], ['Set con le luci', '💡'], ['Foto in vetrina', '📣'], ['Carta e cornici', '🖼️'], ['Foto alle feste', '🎉']],
  }),
  foto_matrimoni: autoBiz({
    name: 'Foto di matrimoni', icon: '💍', desc: 'Matrimoni, album e stampe.', products: ['foto_nozze', 'album'], sector: 'artigianato',
    staff: ['Fotografo', 'Assistente'], color: '#db2777', rateMul: 0.0789, tier: 1, evolveCost: 30000, evolvesTo: ['agenzia_grafica'],
    upg: [['Obiettivi nuovi', '📷'], ['Album di prova', '📸'], ['Fiere degli sposi', '💍'], ['Stampe in magazzino', '📦'], ['Album e stampe', '📸']],
  }),
  agenzia_grafica: autoBiz({
    name: 'Agenzia di grafica', icon: '🖥️', desc: 'Loghi, insegne e pubblicità per i negozi.', products: ['loghi', 'pubblicita'], sector: 'artigianato',
    staff: ['Grafico', 'Fotografo'], color: '#0891b2', rateMul: 0.0959, tier: 2, evolveCost: 85000, evolvesTo: ['studio_creativo'],
    upg: [['Computer potenti', '🖥️'], ['Ufficio moderno', '💼'], ['Clienti in città', '🤝'], ['Stampanti grandi', '🖼️'], ['Pubblicità', '📣']],
  }),
  studio_creativo: autoBiz({
    name: 'Studio creativo', icon: '✨', desc: 'Campagne con foto, grafica e video: il traguardo della fotografia.', products: ['campagne', 'video'], sector: 'artigianato',
    staff: ['Direttore creativo', 'Regista'], color: '#4c1d95', rateMul: 0.0616, tier: 3, evolveCost: 220000,
    upg: [['Telecamere', '🎥'], ['Studio di posa', '💡'], ['Premi', '🏆'], ['Archivio', '📦'], ['Video e spot', '🎥']],
  }),
  sartoria: autoBiz({
    name: 'Sartoria', icon: '🧵', desc: 'Orli, riparazioni e abiti su misura.', products: ['orli', 'abiti_misura'], sector: 'artigianato',
    staff: ['Sarta', 'Commesso'], color: '#be185d', rateMul: 0.0789, tier: 1, evolveCost: 26000, evolvesTo: ['atelier'],
    upg: [['Macchine da cucire', '🧵'], ['Camerini di prova', '👔'], ['Vetrina', '📣'], ['Stoffe e bottoni', '📦'], ['Abiti su misura', '👔']],
  }),
  atelier: autoBiz({
    name: 'Atelier di moda', icon: '👗', desc: 'Abiti da sposa e collezioni.', products: ['abiti_sposa', 'collezioni'], sector: 'artigianato',
    staff: ['Stilista', 'Sarta'], color: '#9d174d', rateMul: 0.0651, tier: 2, evolveCost: 90000, evolvesTo: ['casa_moda'],
    upg: [['Manichini e stoffe', '👗'], ['Salotto per le prove', '🛋️'], ['Riviste di moda', '📣'], ['Tessuti pregiati', '📦'], ['Collezioni', '👗']],
  }),
  casa_moda: autoBiz({
    name: 'Casa di moda', icon: '🛍️', desc: 'Sfilate e boutique: il traguardo della moda.', products: ['sfilate', 'boutique'], sector: 'artigianato',
    staff: ['Stilista', 'Modella'], color: '#111827', rateMul: 0.0616, tier: 3, evolveCost: 220000,
    upg: [['Passerella', '✨'], ['Boutique in centro', '🛍️'], ['Testimonial famosi', '🤩'], ['Collezione in magazzino', '📦'], ['Boutique', '🛍️']],
  }),
} satisfies Record<string, BusinessTypeDef>;

export type BusinessType = keyof typeof BUSINESS_TYPES;

/** Migliorie che hanno senso in questa attività (le attività di servizio non hanno cucina né cassa). */
export function upgradeIdsFor(t: BusinessType, hasInterior: boolean, cash: boolean): UpgradeId[] {
  const kitchenOnly: UpgradeId[] = ['ampliamento', 'fuochi', 'banco', 'ripiano'];
  const def = BUSINESS_TYPES[t] as BusinessTypeDef;
  return UPGRADE_IDS.filter((id) => {
    if (kitchenOnly.includes(id) && !hasInterior) return false;
    if (id === 'cassa' && !cash) return false;
    // "più prodotti" solo se c'è più di un prodotto da mettere
    if (id === 'menu' && def.products.length < 2) return false;
    // le migliorie in più (qualità, corsi, sicurezza, fedeltà, risparmio): tutte le attività senza interno
    if ((AUTO_UPGRADES as readonly string[]).includes(id) && hasInterior) return false;
    return true;
  });
}

/** In cosa si può evolvere questa attività (vuoto: è l'ultima del suo ramo, o non si evolve). */
export const evolvesOf = (t: BusinessType) => ((BUSINESS_TYPES[t] as BusinessTypeDef).evolvesTo ?? []) as BusinessType[];

/** Da quale attività si arriva a questa evolvendo (null per le attività base). */
export function evolvesFrom(t: BusinessType): BusinessType | null {
  for (const k of Object.keys(BUSINESS_TYPES) as BusinessType[]) if (evolvesOf(k).includes(t)) return k;
  return null;
}

/** Gradino nell'albero: costa di più migliorare un'attività più grande. */
const TIER_COST = [1, 3, 8, 20];

/**
 * La miglioria com'è in questa attività: nome, icona, descrizione e massimo propri (se ne ha) e costo che
 * cresce col gradino dell'albero. "Più prodotti" arriva al massimo a tutti i prodotti dell'attività.
 */
export function upgOf(t: BusinessType, id: UpgradeId): UpgradeDef {
  const base = UPGRADES[id];
  const def = BUSINESS_TYPES[t] as BusinessTypeDef;
  // migliorie in più: nome e icona del settore, livello massimo dal gradino (es. "Ingredienti di qualità")
  const sec = (AUTO_UPGRADES as readonly string[]).includes(id) ? SECTOR_UPG[def.sector ?? 'cucina']?.[id as (typeof AUTO_UPGRADES)[number]] : undefined;
  const o = def.upgrades?.[id] ?? (sec ? { name: sec[0], icon: sec[1] } : undefined);
  const k = TIER_COST[def.tier ?? 0] ?? 1;
  // attività senza interno (tutte tranne food truck e panificio): livelli per gradino, prezzi più dolci in alto
  const open = !(t in KITCHEN_TYPES);
  const tier = def.tier ?? 0;
  const max = id === 'menu' ? Math.min(base.max, def.products.length - 1)
    : open ? (TOP_UPGRADES.includes(id) ? TIER_MAX_TOP : TIER_MAX)[tier] ?? 5 : o?.max ?? base.max;
  if (!o && k === 1 && max === base.max && !open) return base;
  const raw = (l: number) => (open && l > SOFT_FROM ? base.cost(SOFT_FROM) * SOFT_GROWTH ** (l - SOFT_FROM) : base.cost(l));
  return { name: o?.name ?? base.name, icon: o?.icon ?? base.icon, desc: o?.desc ?? base.desc, max, cost: (l) => Math.round((raw(l) * k) / 10) * 10 };
}
export const BUSINESS_TYPE_IDS = Object.keys(BUSINESS_TYPES) as BusinessType[];
export const bizType = (t: BusinessType): BusinessTypeDef => BUSINESS_TYPES[t];

/**
 * Gruppi per la lista "Le mie" (un menu a tendina per gruppo). Un'attività sta nel gruppo della sua attività
 * base (radice dell'albero delle evoluzioni); un'attività base nuova senza gruppo qui ne ha uno tutto suo.
 */
export const BIZ_GROUPS: { id: string; name: string; icon?: string; roots: BusinessType[] }[] = [
  { id: 'ristorazione', name: 'Ristorazione', icon: '🍽️', roots: ['foodtruck', 'panificio'] },
  { id: 'ospitalita', name: 'Ospitalità', icon: '🛎️', roots: ['bnb'] },
  { id: 'consegne', name: 'Consegne', roots: ['bici'] },
  { id: 'traslochi', name: 'Traslochi e trasporti', roots: ['traslochi'] },
  { id: 'persone', name: 'Trasporto persone', roots: ['navetta'] },
  { id: 'pulizie', name: 'Pulizie', roots: ['pulizie'] },
  { id: 'giardini', name: 'Giardinaggio', icon: '🌿', roots: ['giardiniere'] },
  { id: 'costruzioni', name: 'Costruzione e impianti', icon: '🔧', roots: ['tuttofare'] },
  { id: 'pittura', name: 'Pittura e ristrutturazioni', icon: '🖌️', roots: ['pittore'] },
  { id: 'falegnameria', name: 'Falegnameria', icon: '🪚', roots: ['falegnameria'] },
  { id: 'foto', name: 'Foto, grafica e moda', icon: '📷', roots: ['studio_foto'] },
  { id: 'artigianato', name: 'Artigianato', roots: ['artigianato'] },
];

/** attività base da cui si arriva a questa (se stessa per le attività base) */
export function bizRoot(t: BusinessType): BusinessType {
  const parent = BUSINESS_TYPE_IDS.find((p) => bizType(p).evolvesTo?.includes(t));
  return parent ? bizRoot(parent) : t;
}

/** gruppo dell'attività per la lista "Le mie": id, nome e icona */
export function bizGroup(t: BusinessType): { id: string; name: string; icon: string } {
  const root = bizRoot(t);
  const g = BIZ_GROUPS.find((x) => x.roots.includes(root));
  return g ? { id: g.id, name: g.name, icon: g.icon ?? bizType(g.roots[0]).icon } : { id: root, name: bizType(root).name, icon: bizType(root).icon };
}
export const roleName = (t: BusinessType, r: Role) => bizType(t).roleNames[r] ?? ROLES[r].name;

export const FIRST_NAMES = [
  'Luca', 'Giulia', 'Marco', 'Sara', 'Paolo', 'Chiara', 'Andrea', 'Elena', 'Davide', 'Marta',
  'Simone', 'Anna', 'Matteo', 'Laura', 'Fabio', 'Irene', 'Giorgio', 'Silvia', 'Enzo', 'Rita',
];
export const LAST_NAMES = [
  'Rossi', 'Bianchi', 'Esposito', 'Russo', 'Ferrari', 'Romano', 'Gallo', 'Costa', 'Fontana',
  'Conti', 'Ricci', 'Greco', 'Bruno', 'Marino', 'Rinaldi', 'Moretti',
];

/**
 * Andamento della giornata: quanti clienti arrivano ora per ora rispetto alla media (ore 8–21).
 * Food truck: pranzo e cena; panificio: colazione e merenda; servizi: mattina. La media del giorno
 * resta 1 (gli incassi totali non cambiano): cambia quando serve il personale (le ore di punta).
 */
const RAW_CURVES: Partial<Record<BusinessType, number[]>> = {
  //            8    9    10   11   12   13   14   15   16   17   18   19   20   21
  foodtruck: [0.4, 0.5, 0.7, 1.1, 1.9, 1.8, 1.0, 0.6, 0.6, 0.8, 1.1, 1.6, 1.5, 0.8],
  panificio: [1.9, 1.7, 1.2, 0.9, 1.0, 0.9, 0.6, 0.7, 1.2, 1.3, 1.0, 0.6, 0.5, 0.4],
  trattoria: [0.3, 0.4, 0.6, 1.1, 2.0, 1.9, 0.9, 0.4, 0.4, 0.6, 1.0, 1.9, 1.9, 1.0],
  ristorante: [0.2, 0.2, 0.3, 0.6, 1.4, 1.4, 0.6, 0.3, 0.3, 0.6, 1.2, 2.2, 2.4, 1.6],
  stellato: [0.1, 0.1, 0.2, 0.4, 1.2, 1.2, 0.4, 0.2, 0.2, 0.5, 1.2, 2.4, 2.8, 2.0],
  bar_caffe: [2.2, 2.0, 1.4, 1.0, 1.0, 1.1, 1.0, 0.8, 0.8, 0.8, 0.7, 0.5, 0.4, 0.3],
  cocktail_bar: [0.1, 0.1, 0.2, 0.3, 0.5, 0.5, 0.4, 0.5, 0.8, 1.4, 2.0, 2.2, 2.4, 2.3],
  locale_eventi: [0.1, 0.1, 0.1, 0.2, 0.3, 0.3, 0.3, 0.4, 0.6, 1.0, 1.6, 2.4, 3.0, 3.2],
  pasticceria: [1.4, 1.5, 1.2, 1.0, 0.9, 0.8, 0.7, 0.9, 1.4, 1.4, 1.1, 0.8, 0.6, 0.4],
  forno_caffe: [2.2, 2.0, 1.4, 1.0, 0.9, 0.8, 0.6, 0.7, 1.1, 1.1, 0.8, 0.5, 0.4, 0.3],
  pulizie: [1.3, 1.5, 1.4, 1.2, 0.9, 0.7, 0.9, 1.0, 1.0, 0.9, 0.8, 0.7, 0.4, 0.3],
  traslochi: [1.4, 1.5, 1.4, 1.2, 0.8, 0.7, 1.0, 1.1, 1.0, 0.8, 0.7, 0.6, 0.5, 0.3],
};

/** Fattore dell'ora per un tipo di attività (fuori orario 0; senza curva 1). */
export function hourFactor(type: BusinessType, hour: number) {
  const c = RAW_CURVES[type];
  const h = Math.floor(hour) - 8;
  if (!c) return 1;
  if (h < 0 || h >= c.length) return 0;
  const avg = c.reduce((a, x) => a + x, 0) / c.length;
  return c[h] / avg;
}
