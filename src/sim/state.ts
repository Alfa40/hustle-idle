import { START_MONEY, TIME } from '../config/balance';
import type { BusinessType, Role, UpgradeId } from '../config/business';
import type { JobType } from '../config/jobs';
import type { ProductId } from '../config/products';
import { EVENT_BY_ID, type WeatherId } from '../config/events';
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
}

export interface JobOffer {
  id: number;
  type: JobType;
  /** indice dello slot sulla mappa dove sta l'NPC */
  slot: number;
  level: number;
  pay: number;
}

export interface Mission {
  id: string;
  text: string;
  kind: 'jobs' | 'jobType' | 'stars3' | 'served' | 'earn';
  jobType?: JobType;
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
}

const SAVE_KEY = 'hustleidle.save.v1';

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
    demandRand: { panini: 1, hotdog: 1, tacos: 1, gelati: 1 },
    candidatesDay: -1,
    candidates: [],
    empSeq: 1,
    todayEarned: 0,
    player: { x: NaN, z: NaN },
    totalEarned: 0,
    tutorialDone: false,
  };
}

export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (s.version !== 1) return null;
    const st = { ...newState(), ...s };
    // eventi di versioni vecchie che non esistono più
    st.events = st.events.filter((e) => EVENT_BY_ID[e.defId]);
    return st;
  } catch {
    return null;
  }
}

export function saveState(s: GameState) {
  s.lastSeen = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* spazio pieno o modalità privata: si continua senza salvare */
  }
}

export function wipeSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* niente */
  }
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
