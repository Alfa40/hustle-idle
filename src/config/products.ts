export type ProductId =
  // food truck
  | 'panini' | 'hotdog' | 'tacos' | 'gelati'
  // panificio
  | 'pane' | 'cornetti' | 'pizza' | 'torte'
  // impresa di pulizie (servizi)
  | 'pulizia_casa' | 'pulizia_uffici' | 'vetri'
  // ditta traslochi (servizi)
  | 'trasloco_piccolo' | 'trasloco_grande' | 'sgombero'
  // trasporti e logistica: le altre attività (servizi, vedi config/business.ts)
  | 'consegna_quartiere' | 'consegna_pasti' | 'consegna_citta' | 'pacchi_giornata' | 'consegna_urgente' | 'contratto_corriere'
  | 'ritiro_pacchi' | 'spedizione' | 'imballaggio' | 'armadietto'
  | 'pianoforte' | 'opere_arte' | 'trasloco_ufficio'
  | 'custodia_box' | 'stoccaggio' | 'preparazione_ordini' | 'smistamento'
  | 'carico_camion' | 'carico_fresco' | 'trasporto_eccezionale'
  | 'corsa_navetta' | 'corsa_vip' | 'matrimonio' | 'giro_turistico' | 'linea_urbana'
  // ristorazione e ospitalità: le attività evolute e il B&B (automatiche, vedi config/business.ts)
  | 'primi' | 'secondi' | 'cena_ristorante' | 'vini' | 'degustazione' | 'vini_pregiati'
  | 'caffe' | 'colazioni' | 'cocktail' | 'aperitivi' | 'serate' | 'feste_private'
  | 'buffet' | 'aperitivi_aziende' | 'banchetto_nozze' | 'cene_aziendali' | 'eventi_citta' | 'concerti'
  | 'pasticcini' | 'semifreddi' | 'torte_compleanno' | 'torte_nuziali' | 'praline' | 'cioccolato_regalo'
  | 'colazione_forno' | 'pane_ingrosso' | 'forniture_locali'
  | 'camere_bnb' | 'camere_famiglia' | 'camere_hotel' | 'mezza_pensione' | 'suite' | 'congressi'
  | 'soggiorno_resort' | 'spa' | 'posto_letto' | 'camere_private' | 'appartamenti' | 'soggiorni_lavoro'
  // costruzione e manualità: le attività automatiche (vedi config/business.ts)
  | 'prati' | 'siepi' | 'giardini_nuovi' | 'potature' | 'parchi_comune' | 'aiuole_citta' | 'giardini_ville' | 'giardini_resort'
  | 'piante' | 'fiori' | 'attrezzi_giardino' | 'arredo_giardino'
  | 'uffici_grandi' | 'vetri_palazzi' | 'ospedali' | 'laboratori' | 'pulizia_concerti' | 'pulizia_fiere'
  | 'montaggi' | 'riparazioni' | 'soppalchi' | 'muri' | 'case_nuove' | 'palazzine' | 'palazzi_alti' | 'ponti'
  | 'impianti_idraulici' | 'impianti_elettrici' | 'caldaie' | 'condizionatori' | 'pannelli_solari' | 'domotica';

export interface Product {
  name: string;
  icon: string;
  /**
   * Servizi di Trasporti e logistica: il lavoretto che si gioca quando il titolare esegue l'ordine di persona
   * (linea e gradino, vedi config/careers.ts). Senza: casa del cliente (pulizie, traslochi).
   */
  job?: { line: 'consegna' | 'magazzino' | 'autista'; rung: number };
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

export const PRODUCTS = {
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
} as Record<ProductId, Product>;

// ---- trasporti e logistica: servizi delle attività (prezzi più alti salendo nell'albero) ----
const SUMMER = [0.9, 0.9, 1, 1, 1.1, 1.2, 1.3, 1.2, 1.1, 1, 0.9, 0.9];
const WINTER = [1.2, 1.1, 1, 1, 0.95, 0.9, 0.85, 0.85, 1, 1, 1.1, 1.3];
const svc = (name: string, icon: string, cost: number, price: number, baseDemand: number, line: 'consegna' | 'magazzino' | 'autista', rung: number, season = FLAT): Product =>
  ({ name, icon, cost, price, baseDemand, season, job: { line, rung } });
Object.assign(PRODUCTS, {
  consegna_quartiere: svc('Consegne nel quartiere', '🚲', 2, 38, 0.2, 'consegna', 0),
  consegna_pasti: svc('Pasti a domicilio', '🍱', 2, 32, 0.24, 'consegna', 0, WINTER),
  consegna_citta: svc('Consegne in città', '🛵', 4, 85, 0.18, 'consegna', 0),
  pacchi_giornata: svc('Pacchi in giornata', '📦', 8, 160, 0.16, 'consegna', 0, WINTER),
  consegna_urgente: svc('Consegne urgenti', '⚡', 10, 230, 0.1, 'consegna', 0),
  contratto_corriere: svc('Contratti con le aziende', '🌍', 30, 520, 0.12, 'consegna', 0),
  ritiro_pacchi: svc('Ritiro pacchi', '📮', 3, 70, 0.2, 'magazzino', 0, WINTER),
  spedizione: svc('Spedizioni', '✉️', 5, 110, 0.14, 'magazzino', 3),
  imballaggio: svc('Imballaggio e spedizione', '📦', 12, 240, 0.14, 'magazzino', 3, WINTER),
  armadietto: svc('Armadietti in città', '🗄️', 25, 480, 0.15, 'magazzino', 0),
  pianoforte: svc('Trasporto pianoforti', '🎹', 40, 620, 0.04, 'consegna', 3),
  opere_arte: svc("Opere d'arte", '🖼️', 35, 540, 0.05, 'consegna', 3),
  trasloco_ufficio: svc("Trasloco d'ufficio", '🏢', 90, 1300, 0.04, 'consegna', 4, SUMMER),
  custodia_box: svc('Custodia nei box', '🏬', 10, 180, 0.12, 'magazzino', 0),
  stoccaggio: svc('Stoccaggio merci', '🏭', 30, 450, 0.1, 'magazzino', 1),
  preparazione_ordini: svc('Preparazione ordini', '📋', 25, 380, 0.12, 'magazzino', 2, WINTER),
  smistamento: svc('Smistamento per la città', '🔀', 70, 1100, 0.09, 'magazzino', 4),
  carico_camion: svc('Trasporto merci', '🚚', 25, 360, 0.11, 'magazzino', 1),
  carico_fresco: svc('Trasporto refrigerato', '❄️', 45, 720, 0.09, 'magazzino', 1, SUMMER),
  trasporto_eccezionale: svc('Trasporti eccezionali', '🚛', 120, 1900, 0.04, 'magazzino', 1),
  corsa_navetta: svc('Corse in navetta', '🚐', 4, 60, 0.22, 'autista', 0),
  corsa_vip: svc('Corse con conducente', '🚕', 15, 260, 0.13, 'autista', 3),
  matrimonio: svc('Matrimoni ed eventi', '🎩', 60, 900, 0.05, 'autista', 4, SUMMER),
  giro_turistico: svc('Giri turistici', '🚌', 15, 240, 0.14, 'autista', 2, SUMMER),
  linea_urbana: svc('Linee urbane', '🚏', 40, 560, 0.1, 'autista', 1),
} satisfies Partial<Record<ProductId, Product>>);

// ---- ristorazione e ospitalità: prodotti delle attività automatiche (prezzi più alti salendo nell'albero) ----
const EVENING = [1, 1, 1, 1, 1.05, 1.15, 1.25, 1.2, 1.05, 1, 0.95, 1.1];
const WEDDINGS = [0.3, 0.4, 0.7, 1, 1.4, 1.7, 1.6, 1.2, 1.5, 1, 0.5, 0.7];
const XMAS = [0.9, 1.3, 1, 1.4, 0.9, 0.7, 0.6, 0.6, 0.9, 1, 1.2, 2];
const food = (name: string, icon: string, cost: number, price: number, baseDemand: number, season = FLAT): Product => ({ name, icon, cost, price, baseDemand, season });
Object.assign(PRODUCTS, {
  primi: food('Primi piatti', '🍝', 3, 13, 1.51),
  secondi: food('Secondi piatti', '🥩', 5, 17, 1.01),
  cena_ristorante: food('Cene al ristorante', '🍽️', 9, 32, 2.03, EVENING),
  vini: food('Vini della casa', '🍷', 5, 18, 1.35, EVENING),
  degustazione: food('Menù degustazione', '🍽️', 30, 110, 1.16, EVENING),
  vini_pregiati: food('Vini pregiati', '🍾', 15, 60, 0.873, EVENING),
  caffe: food('Caffè', '☕', 0.3, 1.6, 9.26, WINTER),
  colazioni: food('Colazioni', '🥐', 1.2, 4.5, 3.62),
  cocktail: food('Cocktail', '🍸', 2, 9, 5.9, SUMMER),
  aperitivi: food('Aperitivi', '🥂', 3.5, 12, 2.94, SUMMER),
  serate: food('Serate con musica', '🎤', 4, 25, 3.36, EVENING),
  feste_private: food('Feste private', '🎉', 12, 45, 1.68, EVENING),
  buffet: food('Buffet per feste', '🍱', 90, 260, 0.0852, SUMMER),
  aperitivi_aziende: food('Aperitivi aziendali', '🥂', 50, 150, 0.0852),
  banchetto_nozze: food('Banchetti di nozze', '💍', 750, 2200, 0.0121, WEDDINGS),
  cene_aziendali: food('Cene aziendali', '🍽️', 400, 1200, 0.0241, XMAS),
  eventi_citta: food('Grandi eventi in città', '🏛️', 2000, 6000, 0.0106, SUMMER),
  concerti: food('Concerti e festival', '🎸', 1100, 3500, 0.0159, SUMMER),
  pasticcini: food('Pasticcini', '🧁', 0.6, 2.5, 6.23, XMAS),
  semifreddi: food('Semifreddi', '🍨', 1.4, 5.5, 2.22, SUMMER),
  torte_compleanno: food('Torte per le feste', '🎂', 28, 110, 0.214),
  torte_nuziali: food('Torte nuziali', '🍰', 80, 320, 0.0571, WEDDINGS),
  praline: food('Scatole di praline', '🍫', 7, 28, 2, XMAS),
  cioccolato_regalo: food('Cioccolato da regalo', '🎁', 15, 60, 1, XMAS),
  colazione_forno: food('Colazioni al forno', '🥐', 1.3, 5, 3.58),
  pane_ingrosso: food('Pane per i negozi', '🍞', 35, 140, 0.213),
  forniture_locali: food('Forniture per i locali', '🥖', 60, 220, 0.142),
  camere_bnb: food('Camere', '🛏️', 15, 75, 0.15, SUMMER),
  camere_famiglia: food('Camere per famiglie', '🧸', 22, 110, 0.0706, SUMMER),
  camere_hotel: food('Camere d\'albergo', '🏨', 25, 130, 0.113, SUMMER),
  mezza_pensione: food('Mezza pensione', '🍽️', 40, 170, 0.0753, SUMMER),
  suite: food('Suite', '🛎️', 60, 320, 0.0898, SUMMER),
  congressi: food('Sale per congressi', '🤝', 80, 380, 0.0718, WINTER),
  soggiorno_resort: food('Soggiorni di lusso', '🏰', 180, 900, 0.0599, SUMMER),
  spa: food('Pacchetti spa', '🧴', 90, 480, 0.0998, WINTER),
  posto_letto: food('Posti letto', '🎒', 6, 32, 0.412, SUMMER),
  camere_private: food('Camere private', '🛏️', 10, 55, 0.206, SUMMER),
  appartamenti: food('Appartamenti', '🏢', 40, 210, 0.139, SUMMER),
  soggiorni_lavoro: food('Soggiorni di lavoro', '💼', 50, 260, 0.0992, WINTER),
} satisfies Partial<Record<ProductId, Product>>);

// ---- costruzione e manualità: servizi delle attività automatiche. Stessi numeri delle attività di Ospitalità allo
// stesso gradino (base come il B&B, 1ª come l'hotel o l'ostello, 2ª come l'hotel 4 stelle o il residence, 3ª come il
// resort): così guadagnano come gli altri settori (base ~€5 mila al mese, 1ª ~€11 mila, 2ª ~€25 mila, 3ª ~€50 mila) ----
const SPRING = [0.6, 0.7, 1.2, 1.5, 1.5, 1.3, 1.1, 0.9, 1.1, 1, 0.7, 0.6];
const BUILD = [0.8, 0.85, 1, 1.1, 1.15, 1.15, 1.1, 0.9, 1.1, 1.05, 0.9, 0.8];
Object.assign(PRODUCTS, {
  prati: food('Prati tagliati', '🌿', 15, 75, 0.15, SPRING),
  siepi: food('Siepi e cespugli', '✂️', 22, 110, 0.0706, SPRING),
  giardini_nuovi: food('Giardini nuovi', '🌱', 25, 130, 0.113, SPRING),
  potature: food('Potature', '🌳', 40, 170, 0.0753, SPRING),
  parchi_comune: food('Parchi del comune', '🏞️', 60, 320, 0.0898, SPRING),
  aiuole_citta: food('Aiuole della città', '🌷', 80, 380, 0.0718, SPRING),
  giardini_ville: food('Giardini delle ville', '🏛️', 180, 900, 0.0599, SPRING),
  giardini_resort: food('Giardini di hotel e resort', '🌴', 90, 480, 0.0998, SPRING),
  piante: food('Piante', '🪴', 6, 32, 0.412, SPRING),
  fiori: food('Fiori', '🌷', 10, 55, 0.206, SPRING),
  attrezzi_giardino: food('Attrezzi da giardino', '🧰', 40, 210, 0.139, SPRING),
  arredo_giardino: food('Arredo da giardino', '🪑', 50, 260, 0.0992, SUMMER),
  uffici_grandi: food('Pulizia di grandi uffici', '🏢', 25, 130, 0.113),
  vetri_palazzi: food('Vetri dei palazzi', '🪟', 40, 170, 0.0753),
  ospedali: food('Sanificazione ospedali', '🏥', 60, 320, 0.0898, WINTER),
  laboratori: food('Sanificazione laboratori', '🧪', 80, 380, 0.0718),
  pulizia_concerti: food('Pulizia dopo i concerti', '🎪', 25, 130, 0.113, SUMMER),
  pulizia_fiere: food('Pulizia di fiere e stadi', '🏟️', 40, 170, 0.0753),
  montaggi: food('Montaggio mobili', '🔧', 15, 75, 0.15),
  riparazioni: food('Riparazioni in casa', '🛠️', 22, 110, 0.0706),
  soppalchi: food('Soppalchi e scale', '🪜', 25, 130, 0.113, BUILD),
  muri: food('Muri e tramezzi', '🧱', 40, 170, 0.0753, BUILD),
  case_nuove: food('Case nuove', '🏠', 60, 320, 0.0898, BUILD),
  palazzine: food('Palazzine', '🏘️', 80, 380, 0.0718, BUILD),
  palazzi_alti: food('Palazzi alti', '🏙️', 180, 900, 0.0599, BUILD),
  ponti: food('Ponti e grandi opere', '🌉', 90, 480, 0.0998, BUILD),
  impianti_idraulici: food('Impianti idraulici', '💧', 25, 130, 0.113),
  impianti_elettrici: food('Impianti elettrici', '⚡', 40, 170, 0.0753),
  caldaie: food('Caldaie e termosifoni', '🔥', 40, 210, 0.139, WINTER),
  condizionatori: food('Condizionatori', '❄️', 50, 260, 0.0992, SUMMER),
  pannelli_solari: food('Pannelli solari', '☀️', 180, 900, 0.0599, SUMMER),
  domotica: food('Casa intelligente', '💡', 90, 480, 0.0998),
} satisfies Partial<Record<ProductId, Product>>);

export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];
