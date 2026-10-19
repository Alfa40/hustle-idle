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

export type UpgradeId = 'ampliamento' | 'fuochi' | 'banco' | 'ripiano' | 'attrezzatura' | 'cassa' | 'look' | 'menu' | 'frigo' | 'marketing';

export interface UpgradeDef {
  name: string;
  icon: string;
  desc: string;
  max: number;
  cost: (lvl: number) => number;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  ampliamento: {
    name: 'Ampliamento del locale', icon: '🏗️', desc: 'Più spazio sulle pareti (per fuochi e banchi extra), nuove postazioni e nuovi prodotti da vendere.', max: 2,
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
    name: 'Attrezzatura professionale', icon: '⚡', desc: 'Si prepara più in fretta (+15% per livello). Le postazioni di lavoro diventano lucide e dorate.', max: 8,
    cost: (l) => Math.round(400 * 1.8 ** l),
  },
  cassa: {
    name: 'Cassa veloce', icon: '💳', desc: 'Registratore e POS moderni: i cassieri servono e incassano più in fretta (+15% per livello), per stare al passo con la cucina.', max: 8,
    cost: (l) => Math.round((350 * 1.8 ** l) / 10) * 10,
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
}

export const BUSINESS_TYPES = {
  foodtruck: {
    name: 'Food truck', icon: '🚚', desc: 'Cibo di strada: economico da aprire, si lavora al bancone.',
    kind: 'truck', lot: 'truck', setupCost: 0, products: ['panini', 'hotdog', 'tacos', 'gelati'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Cuoco', cassa: 'Cassiere' }, skills: ['cucina', 'clientela'],
    rateMul: 1, wall: 0xe8590c, color: '#e8590c', sector: 'cucina',
    stations: { stock: '🧊 Frigo', work: '🔥 Piastra', counter: '🪟 Servi qui' },
  },
  panificio: {
    name: 'Panificio', icon: '🥖', desc: 'Pane e dolci: tanti clienti, prodotti economici.',
    kind: 'shop', lot: 'shop', setupCost: 2500, products: ['pane', 'cornetti', 'pizza', 'torte'],
    roles: ['cucina', 'cassa'], roleNames: { cucina: 'Fornaio', cassa: 'Commesso' }, skills: ['cucina', 'clientela'],
    rateMul: 1.1, wall: 0xd4a373, color: '#b5793d', sector: 'cucina',
    stations: { stock: '🌾 Dispensa', work: '🔥 Forno', counter: '🧁 Bancone' },
  },
  artigianato: {
    name: "Laboratorio dell'artigiano", icon: '🎨', desc: 'Lavori manuali su richiesta, fatti da te a mano in prima persona: pagano più dei lavoretti. Si parte dai vasi in ceramica; con l\'esperienza arrivano lavori più difficili e pagati meglio.',
    kind: 'craft', lot: 'shop', setupCost: 3500, products: [],
    roles: [], roleNames: {}, skills: ['artigianato'],
    rateMul: 0, color: '#c0603a', sector: 'artigianato',
  },
  pulizie: {
    name: 'Impresa di pulizie', icon: '🧽', desc: 'Servizi a domicilio: esegui gli ordini nelle case.',
    kind: 'service', lot: 'shop', setupCost: 2000, products: ['pulizia_casa', 'pulizia_uffici', 'vetri'],
    roles: ['cucina'], roleNames: { cucina: 'Addetto pulizie' }, skills: ['manualita', 'clientela'],
    rateMul: 0.12, color: '#2d9cdb', sector: 'manualita',
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
  const o = def.upgrades?.[id];
  const k = TIER_COST[def.tier ?? 0] ?? 1;
  const max = id === 'menu' ? Math.min(base.max, def.products.length - 1) : o?.max ?? base.max;
  if (!o && k === 1 && max === base.max) return base;
  return { name: o?.name ?? base.name, icon: o?.icon ?? base.icon, desc: o?.desc ?? base.desc, max, cost: (l) => Math.round((base.cost(l) * k) / 10) * 10 };
}
export const BUSINESS_TYPE_IDS = Object.keys(BUSINESS_TYPES) as BusinessType[];
export const bizType = (t: BusinessType): BusinessTypeDef => BUSINESS_TYPES[t];

/**
 * Gruppi per la lista "Le mie" (un menu a tendina per gruppo). Un'attività sta nel gruppo della sua attività
 * base (radice dell'albero delle evoluzioni); un'attività base nuova senza gruppo qui ne ha uno tutto suo.
 */
export const BIZ_GROUPS: { id: string; name: string; icon?: string; roots: BusinessType[] }[] = [
  { id: 'ristorazione', name: 'Ristorazione', icon: '🍽️', roots: ['foodtruck', 'panificio'] },
  { id: 'consegne', name: 'Consegne', roots: ['bici'] },
  { id: 'traslochi', name: 'Traslochi e trasporti', roots: ['traslochi'] },
  { id: 'persone', name: 'Trasporto persone', roots: ['navetta'] },
  { id: 'pulizie', name: 'Pulizie', roots: ['pulizie'] },
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
