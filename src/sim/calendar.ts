import { TIME } from '../config/balance';
import { EVENTS, WEATHER } from '../config/events';
import { ensureWeather, sureEvents, weatherOf } from './effects';
import { JOBS, JOB_TYPES } from '../config/jobs';
import { PRODUCT_IDS } from '../config/products';
import { SKILL_IDS } from '../config/skills';
import { bus, toast } from './bus';
import { autoSim, payMonth, randDemand, refreshCandidates } from './economy';
import { totalFame, totalLevel } from './progress';
import {
  day, dayOfMonth, emptyLedger, monthIndex, pick, randInt,
  type GameState, type Mission,
} from './state';

/** Avanza il tempo di gioco gestendo i cambi di giorno. */
export function advance(s: GameState, minutes: number, efficiency = 1, online = true) {
  // a passi di massimo 10 minuti così i cambi di ora/giorno sono precisi
  while (minutes > 0) {
    const step = Math.min(minutes, 10);
    const before = day(s);
    s.minutes += step;
    minutes -= step;
    for (const b of s.businesses) if (!online || !b.__playerInside) autoSim(s, b, step, efficiency);
    if (day(s) !== before) newDay(s, online);
  }
}

declare module './state' {
  interface Business {
    /** non salvato: il giocatore è dentro e gestisce lui la coda */
    __playerInside?: boolean;
  }
}

export function newDay(s: GameState, online = true) {
  const d = day(s);
  for (const b of s.businesses) {
    b.yesterday = b.today;
    b.today = emptyLedger();
  }
  s.todayEarned = 0;
  // domanda del giorno: cammino casuale morbido
  for (const p of PRODUCT_IDS) {
    s.demandRand[p] = Math.min(1.5, Math.max(0.6, s.demandRand[p] * 0.6 + randDemand() * 0.4));
  }
  s.demandDay = d;
  updateEvents(s, online);
  genMissions(s);
  refreshCandidates(s);
  if (dayOfMonth(d) === 1) payMonth(s);
  bus.emit('newday');
}

// ---------------- eventi ----------------

export function updateEvents(s: GameState, announce = true) {
  const d = day(s);
  s.events = s.events.filter((e) => e.endDay >= d);
  ensureWeather(s);
  if (announce) {
    for (const { h, kind } of sureEvents(s, d)) if (kind !== 'weekly') toast(`${h.icon} Oggi: ${h.name}`, 'info');
    const w = weatherOf(s, d);
    if (w !== 'sole' && w !== 'nuvoloso') toast(`${WEATHER[w].icon} Oggi: ${WEATHER[w].name}. ${WEATHER[w].desc}`, 'info');
  }
  const upcoming = s.events.filter((e) => e.startDay > d).length;
  if (upcoming < 2 && Math.random() < 0.5) {
    const start = d + randInt(2, 5);
    const m = monthIndex(start);
    const pool = EVENTS.filter((e) => e.months.includes(m) && !s.events.some((x) => x.defId === e.id));
    if (pool.length) {
      const def = pick(pool);
      const len = randInt(def.minDays, def.maxDays);
      s.events.push({ id: 'ev' + s.eventSeq++, defId: def.id, startDay: start, endDay: start + len - 1 });
      if (announce) toast(`📅 In arrivo: ${def.icon} ${def.name}`, 'info');
    }
  }
}

// ---------------- missioni giornaliere ----------------

export function genMissions(s: GameState) {
  const scale = 1 + totalFame(s) / 60 + (totalLevel(s) - 4) * 0.12;
  const list: Mission[] = [];
  const owns = s.businesses.length > 0;
  const kinds: Mission['kind'][] = ['jobs', 'jobType', 'stars3', owns ? 'served' : 'jobType', 'earn'];
  const chosen = new Set<string>();
  while (list.length < 3) {
    const kind = pick(kinds);
    const jt = pick(JOB_TYPES);
    const key = kind === 'jobType' ? kind + jt : kind;
    if (chosen.has(key)) continue;
    chosen.add(key);
    const skill = kind === 'jobType' ? JOBS[jt].skill : kind === 'served' ? 'clientela' : pick(SKILL_IDS);
    let m: Omit<Mission, 'id' | 'progress' | 'claimed' | 'fameSkill' | 'fame'>;
    switch (kind) {
      case 'jobs': {
        const n = randInt(3, 5);
        m = { kind, text: `Completa ${n} lavoretti`, target: n, reward: 45 * n * scale };
        break;
      }
      case 'jobType': {
        const n = randInt(2, 3);
        m = { kind, jobType: jt, text: `${JOBS[jt].icon} ${n} lavori: ${JOBS[jt].name.toLowerCase()}`, target: n, reward: 50 * n * scale };
        break;
      }
      case 'stars3': {
        const n = randInt(1, 3);
        m = { kind, text: `⭐ Ottieni 3 stelle in ${n} lavor${n > 1 ? 'i' : 'o'}`, target: n, reward: 70 * n * scale };
        break;
      }
      case 'served': {
        const n = randInt(8, 16);
        m = { kind, text: `🍔 Servi ${n} clienti di persona`, target: n, reward: 12 * n * scale };
        break;
      }
      default: {
        const n = Math.round((150 * scale) / 10) * 10;
        m = { kind: 'earn', text: `💶 Guadagna €${n} oggi`, target: n, reward: n * 0.4 };
      }
    }
    list.push({ ...m, id: `m${day(s)}_${list.length}`, reward: Math.round(m.reward), progress: 0, claimed: false, fameSkill: skill, fame: 2 + scale });
  }
  s.missions = list;
  s.missionsDay = day(s);
}

export function missionProgress(s: GameState, kind: Mission['kind'], opts: { jobType?: string; amount?: number } = {}) {
  let changed = false;
  for (const m of s.missions) {
    if (m.claimed || m.kind !== kind || m.progress >= m.target) continue;
    if (kind === 'jobType' && m.jobType !== opts.jobType) continue;
    m.progress = Math.min(m.target, m.progress + (opts.amount ?? 1));
    if (m.progress >= m.target) toast(`✅ Missione completata: ${m.text}`, 'good');
    changed = true;
  }
  if (changed) bus.emit('missions');
}

// ---------------- offline ----------------

export interface OfflineReport {
  realHours: number;
  gameMinutes: number;
  revenue: number;
  net: number;
  /** affitti delle case date in affitto (solo mentre il gioco è chiuso) */
  rent: number;
}

/** Affitto di una casa all'ora (reale) mentre il gioco è chiuso. */
export const RENT_PER_HOUR = 0.0015;
/** Oltre 48 ore di assenza l'affitto non cresce più. */
export const RENT_MAX_HOURS = 48;
/** Per affittare servono almeno 2 case, contando quella di partenza (una dove vivere, l'altra da affittare). */
export const canRent = (s: GameState) => s.houses.length + 1 >= 2;

/**
 * Tempo passato con il gioco chiuso: il tempo di gioco scorre 100 volte più
 * lento e il guadagno è ridotto a fasce (80% → 50% → 20%).
 */
export function applyOffline(s: GameState, realMs: number): OfflineReport | null {
  if (realMs < 60_000) return null;
  const moneyBefore = s.money;
  const revBefore = s.businesses.reduce((a, b) => a + b.totalRevenue, 0);
  let remainingH = realMs / 3_600_000;
  let gameMin = 0;
  const rate = TIME.GAME_MIN_PER_SEC / TIME.OFFLINE_SLOWDOWN;
  for (const tier of TIME.OFFLINE_TIERS) {
    if (remainingH <= 0) break;
    const h = Math.min(remainingH, tier.hours);
    remainingH -= h;
    // limite di sicurezza: al massimo un anno di gioco
    const minutes = Math.min(h * 3600 * rate, 360 * 1440 - gameMin);
    if (minutes <= 0) break;
    advance(s, minutes, tier.eff, false);
    gameMin += minutes;
  }
  // affitti: guadagnano solo mentre sei offline, in base alle ore reali
  const hours = Math.min(realMs / 3_600_000, RENT_MAX_HOURS);
  const rent = canRent(s) ? Math.round(s.houses.filter((h) => h.rent).reduce((a, h) => a + h.price * RENT_PER_HOUR, 0) * hours) : 0;
  if (rent > 0) s.money += rent;
  return {
    rent,
    realHours: realMs / 3_600_000,
    gameMinutes: gameMin,
    revenue: s.businesses.reduce((a, b) => a + b.totalRevenue, 0) - revBefore,
    net: s.money - moneyBefore,
  };
}
