import { randomLogo, safeLogo, type Logo } from '../logo';
import { START_MONEY, TIME } from '../config/balance';
import type { BusinessType, Role, UpgradeId } from '../config/business';
import type { JobType } from '../config/jobs';
import { PRODUCT_IDS, type ProductId } from '../config/products';
import type { VehicleId } from '../config/vehicles';
import { EVENT_BY_ID, type WeatherId } from '../config/events';
import { productLevel } from '../config/recipes';
import { WS } from '../config/map';
import { BUSINESS_TYPES } from '../config/business';
import { SKILL_IDS, type SkillId } from '../config/skills';

export interface Employee {
  id: number;
  name: string;
  role: Role;
  level: number;
  xp: number;
  /** 1–10 */
  speed: number;
  skill: number;
  kindness: number;
  salary: number;
  model: string;
  hiredDay: number;
}

export interface Ledger {
  revenue: number;
  costs: number;
  served: number;
  lost: number;
}

export interface Business {
  id: string;
  type: BusinessType;
  lotId: string;
  products: ProductId[];
  stock: Partial<Record<ProductId, number>>;
  upgrades: Partial<Record<UpgradeId, number>>;
  staff: Employee[];
  autoRestock: boolean;
  today: Ledger;
  yesterday: Ledger;
  month: Ledger;
  totalRevenue: number;
  boughtFor: number;
  /** solo per le attività di servizio: ordini in attesa */
  orders: ServiceOrder[];
}

export interface ServiceOrder {
  id: number;
  pid: ProductId;
  /** minuto di gioco in cui scade */
  expires: number;
  /** indirizzo (indice delle case) */
  house: number;
}

export interface JobOffer {
  id: number;
  type: JobType;
  /** indice dello slot sulla mappa dove sta l'NPC */
  slot: number;
  level: number;
  pay: number;
}

export interface PlayStats {
  /** lavoretti completati (almeno una stella), di cui con 3 stelle, e per tipo */
  jobs: number;
  jobs3: number;
  jobsByType: Partial<Record<JobType, number>>;
  /** lavoretti falliti (tempo scaduto) */
  jobsFailed: number;
  /** clienti serviti di persona nelle attività e ordini a domicilio eseguiti */
  served: number;
  orders: number;
  /** attività aperte e attività fallite (chiuse in perdita) */
  bizOpened: number;
  bizFailed: number;
  missions: number;
  /** secondi giocati (gioco aperto) */
  playSec: number;
  /** giorno in cui è cominciata la partita */
  startDay: number;
  /** il massimo guadagnato in un giorno */
  bestDay: number;
}

export function playStats(s: GameState): PlayStats {
  return (s.stats ??= {
    jobs: 0, jobs3: 0, jobsByType: {}, jobsFailed: 0, served: 0, orders: 0, bizOpened: s.businesses.length, bizFailed: 0,
    missions: 0, playSec: 0, startDay: day(s), bestDay: 0,
  });
}

export interface Mission {
  id: string;
  text: string;
  kind: 'jobs' | 'jobType' | 'stars3' | 'served' | 'earn' | 'variety';
  jobType?: JobType;
  /** missione della settimana (più lunga, premio più alto) */
  weekly?: boolean;
  /** 'variety': tipi di lavoretto già fatti questa settimana */
  types?: JobType[];
  target: number;
  progress: number;
  reward: number;
  fameSkill: SkillId;
  fame: number;
  claimed: boolean;
}

export interface CalEvent {
  id: string;
  defId: string;
  startDay: number;
  endDay: number;
}

export interface GameState {
  version: 1;
  money: number;
  /** minuti di gioco dall'inizio (giorno 0 alle 00:00) */
  minutes: number;
  lastSeen: number;
  xp: Record<SkillId, number>;
  fame: Record<SkillId, number>;
  businesses: Business[];
  jobs: JobOffer[];
  jobSeq: number;
  missionsDay: number;
  missions: Mission[];
  /** statistiche della partita (schermata Profilo → Statistiche) */
  stats?: PlayStats;
  /** missioni della settimana e settimana (giorno / 7) in cui sono state create */
  weekly?: Mission[];
  weeklyWeek?: number;
  /** versione delle regole delle missioni settimanali */
  weeklyVer?: number;
  /** guadagnato questa settimana (senza i premi delle missioni) */
  weekEarned?: number;
  events: CalEvent[];
  /** meteo reale per giorno (solo i prossimi giorni) */
  weather: Record<number, WeatherId>;
  eventSeq: number;
  demandDay: number;
  demandRand: Record<ProductId, number>;
  candidatesDay: number;
  candidates: Employee[];
  empSeq: number;
  todayEarned: number;
  player: { x: number; z: number };
  totalEarned: number;
  tutorialDone: boolean;
  vehicles: VehicleId[];
  /** veicolo su cui si è ora (null = a piedi) */
  riding: VehicleId | null;
  /** scala del mondo con cui è stata salvata la posizione del giocatore */
  ws?: number;
  /** lavoretti di cui è stato completato il tutorial */
  jobTutorials?: JobType[];
  /** tipi di attività (con interno) di cui si è già visto il tutorial della cucina */
  bizTutorials?: BusinessType[];
  /** ultimo veicolo usato (il pulsante Sali fa salire su questo) */
  lastRide?: VehicleId;
  orderSeq: number;
  /** nome della partita scelto dal giocatore */
  saveName: string;
  /** logo delle attività di questa partita */
  logo: Logo;
  /** il giocatore ha scelto nome e logo (finché no, glielo si chiede a ogni avvio) */
  logoChosen?: boolean;
  /** aspetto del personaggio: stile (modello), stili comprati, accessori comprati e indossati */
  style: { model: string; owned: string[]; accOwned: string[]; acc: string[] };
  /** case comprate all'agenzia immobiliare (indice nella lista delle case in vendita) */
  houses: { i: number; rent: boolean; price: number }[];
  /** dove vivi: -1 = la casa di partenza, altrimenti l'indice di una casa comprata */
  homeIdx: number;
}

// ---- salvataggi a slot ----

export const SLOT_COUNT = 3;
const OLD_KEY = 'hustleidle.save.v1';
const slotKey = (n: number) => `hustleidle.slot.${n}`;
const LAST_KEY = 'hustleidle.lastSlot';

/** Slot della partita in corso (1–3). */
export let currentSlot = 1;
export const setCurrentSlot = (n: number) => (currentSlot = n);

/** Si parte il 1° maggio, anno 1, alle 8:00 */
export const START_DAY = 4 * TIME.DAYS_PER_MONTH;

export function newState(): GameState {
  const zero = () => Object.fromEntries(SKILL_IDS.map((s) => [s, 0])) as Record<SkillId, number>;
  return {
    version: 1,
    money: START_MONEY,
    minutes: START_DAY * 1440 + TIME.START_HOUR * 60,
    lastSeen: Date.now(),
    xp: zero(),
    fame: zero(),
    businesses: [],
    jobs: [],
    jobSeq: 1,
    missionsDay: -1,
    missions: [],
    events: [],
    weather: {},
    eventSeq: 1,
    demandDay: -1,
    demandRand: Object.fromEntries(PRODUCT_IDS.map((p) => [p, 1])) as Record<ProductId, number>,
    candidatesDay: -1,
    candidates: [],
    empSeq: 1,
    todayEarned: 0,
    player: { x: NaN, z: NaN },
    totalEarned: 0,
    tutorialDone: false,
    vehicles: [],
    riding: null,
    orderSeq: 1,
    saveName: 'La mia partita',
    logo: randomLogo(),
    style: { model: 'character-male-a', owned: ['character-male-a'], accOwned: [], acc: [] },
    houses: [],
    homeIdx: -1,
  };
}

/** Le partite della prima versione (un solo salvataggio) finiscono nello slot 1. */
function migrateOldSave() {
  try {
    const old = localStorage.getItem(OLD_KEY);
    if (old && !localStorage.getItem(slotKey(1))) {
      localStorage.setItem(slotKey(1), old);
      localStorage.setItem(LAST_KEY, '1');
    }
    if (old) localStorage.removeItem(OLD_KEY);
  } catch {
    /* niente */
  }
}

function parse(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as GameState;
    if (s.version !== 1) return null;
    const st = { ...newState(), ...s };
    // eventi di versioni vecchie che non esistono più
    st.events = st.events.filter((e) => EVENT_BY_ID[e.defId]);
    // nuove esperienze, prodotti e campi aggiunti dopo
    for (const k of SKILL_IDS) {
      st.xp[k] ??= 0;
      st.fame[k] ??= 0;
    }
    for (const p of PRODUCT_IDS) st.demandRand[p] ??= 1;
    st.logo = safeLogo(s.logo) ?? randomLogo();
    // città ingrandita: la posizione salvata si riporta nella nuova scala
    if ((s.ws ?? 1) !== WS && Number.isFinite(st.player.x)) {
      const k = WS / (s.ws ?? 1);
      st.player = { x: st.player.x * k, z: st.player.z * k };
    }
    st.ws = WS;
    st.style = { ...newState().style, ...(s.style ?? {}) };
    st.houses ??= [];
    for (const h of st.houses) h.price ??= 12000;
    if (!st.houses.some((h) => h.i === st.homeIdx)) st.homeIdx = -1;
    for (const b of st.businesses) {
      b.orders ??= [];
      // prodotti che ora richiedono un ampliamento: tolti dalla vendita
      const lvl = b.upgrades.ampliamento ?? 0;
      const ok = b.products.filter((p) => productLevel(b.type, p) <= lvl);
      b.products = ok.length ? ok : [BUSINESS_TYPES[b.type].products[0]];
    }
    return st;
  } catch {
    return null;
  }
}

export function loadState(slot = currentSlot): GameState | null {
  migrateOldSave();
  try {
    return parse(localStorage.getItem(slotKey(slot)));
  } catch {
    return null;
  }
}

export function saveState(s: GameState, slot = currentSlot) {
  s.lastSeen = Date.now();
  try {
    localStorage.setItem(slotKey(slot), JSON.stringify(s));
    localStorage.setItem(LAST_KEY, String(slot));
  } catch {
    /* spazio pieno o modalità privata: si continua senza salvare */
  }
}

export function wipeSave(slot = currentSlot) {
  try {
    localStorage.removeItem(slotKey(slot));
    if (localStorage.getItem(LAST_KEY) === String(slot)) localStorage.removeItem(LAST_KEY);
  } catch {
    /* niente */
  }
}

export function lastSlot(): number | null {
  migrateOldSave();
  try {
    const n = Number(localStorage.getItem(LAST_KEY));
    return n >= 1 && n <= SLOT_COUNT && localStorage.getItem(slotKey(n)) ? n : null;
  } catch {
    return null;
  }
}

/** Tutti gli slot (null = vuoto), per la schermata iniziale. */
export function listSlots(): (GameState | null)[] {
  migrateOldSave();
  return Array.from({ length: SLOT_COUNT }, (_, i) => loadState(i + 1));
}

export function emptyLedger(): Ledger {
  return { revenue: 0, costs: 0, served: 0, lost: 0 };
}

// ---- tempo ----
export const day = (s: GameState) => Math.floor(s.minutes / 1440);
export const hourOf = (s: GameState) => (s.minutes % 1440) / 60;
export const monthIndex = (d: number) => Math.floor(d / TIME.DAYS_PER_MONTH) % 12;
export const dayOfMonth = (d: number) => (d % TIME.DAYS_PER_MONTH) + 1;
export const yearOf = (d: number) => Math.floor(d / (TIME.DAYS_PER_MONTH * 12)) + 1;

// ---- casualità ----
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const euro = (n: number) =>
  (n < 0 ? '-€' : '€') + Math.abs(Math.round(n)).toLocaleString('it-IT');
