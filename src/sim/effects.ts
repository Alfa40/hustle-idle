import {
  EVENT_BY_ID, FIXED_EVENTS, WEATHER, WEATHER_IDS, WEATHER_PRIOR, WEEKLY_EVENTS,
  type Happening, type WeatherId,
} from '../config/events';
import type { ZoneId } from '../config/map';
import { PRODUCTS, type ProductId } from '../config/products';
import { day, dayOfMonth, monthIndex, type GameState } from './state';

export type HappeningKind = 'fixed' | 'weekly' | 'event' | 'weather';

export interface DayHappening {
  h: Happening;
  kind: HappeningKind;
}

export const weekday = (d: number) => d % 7;

/** Giorni di previsione del meteo */
export const FORECAST_DAYS = 7;

// ---------------- meteo ----------------

function sample(prior: Record<WeatherId, number>): WeatherId {
  let r = Math.random() * WEATHER_IDS.reduce((a, w) => a + prior[w], 0);
  for (const w of WEATHER_IDS) if ((r -= prior[w]) <= 0) return w;
  return 'sole';
}

/**
 * Genera il meteo "vero" dei prossimi giorni. Il tempo tende a durare
 * qualche giorno (le ondate di caldo non finiscono in un pomeriggio).
 */
export function ensureWeather(s: GameState) {
  const today = day(s);
  for (const k of Object.keys(s.weather)) if (+k < today - 1) delete s.weather[+k];
  for (let d = today; d <= today + FORECAST_DAYS + 2; d++) {
    if (s.weather[d]) continue;
    const prior = WEATHER_PRIOR[monthIndex(d)];
    const prev = s.weather[d - 1];
    s.weather[d] = prev && prior[prev] > 0 && Math.random() < 0.55 ? prev : sample(prior);
  }
}

export function weatherOf(s: GameState, d: number): WeatherId {
  return s.weather[d] ?? 'sole';
}

/**
 * Previsione per un giorno futuro: più è lontano, meno è sicura.
 * Oggi è certa al 100%.
 */
export function forecast(s: GameState, d: number): { w: WeatherId; p: number }[] {
  const k = d - day(s);
  const truth = weatherOf(s, d);
  if (k <= 0) return [{ w: truth, p: 1 }];
  const acc = Math.max(0.3, 1 - 0.13 * k);
  const prior = WEATHER_PRIOR[monthIndex(d)];
  return WEATHER_IDS.map((w) => ({ w, p: acc * (w === truth ? 1 : 0) + (1 - acc) * prior[w] }))
    .filter((x) => x.p >= 0.05)
    .sort((a, b) => b.p - a.p);
}

// ---------------- eventi del giorno ----------------

/** Eventi sicuri di un giorno (feste fisse, settimanali, eventi annunciati). */
export function sureEvents(s: GameState, d: number): DayHappening[] {
  const out: DayHappening[] = [];
  const m = monthIndex(d);
  const dm = dayOfMonth(d);
  for (const f of FIXED_EVENTS) if (f.month === m && dm >= f.day && dm < f.day + f.len) out.push({ h: f, kind: 'fixed' });
  for (const w of WEEKLY_EVENTS) if (w.weekday === weekday(d)) out.push({ h: w, kind: 'weekly' });
  for (const e of s.events) {
    const def = EVENT_BY_ID[e.defId];
    if (def && d >= e.startDay && d <= e.endDay) out.push({ h: def, kind: 'event' });
  }
  return out;
}

/** Tutto quello che influenza la domanda oggi (eventi + meteo reale). */
export function activeToday(s: GameState): DayHappening[] {
  const d = day(s);
  return [...sureEvents(s, d), { h: WEATHER[weatherOf(s, d)], kind: 'weather' }];
}

export function effectMultiplier(list: DayHappening[], pid: ProductId, zone: ZoneId) {
  let m = 1;
  for (const { h } of list) {
    m *= h.all ?? 1;
    m *= h.product?.[pid] ?? 1;
    m *= h.zone?.[zone] ?? 1;
  }
  return m;
}

/** Descrizione breve degli effetti, es. "🍦 ×2 · 🥪 ×0,9". */
export function effectText(h: Happening) {
  const f = (v: number) => '×' + (Math.round(v * 100) / 100).toString().replace('.', ',');
  const parts: string[] = [];
  if (h.all && h.all !== 1) parts.push(`tutti ${f(h.all)}`);
  for (const [p, v] of Object.entries(h.product ?? {})) parts.push(`${PRODUCTS[p as ProductId].icon} ${f(v!)}`);
  const zn: Record<string, string> = { centro: 'centro', residenziale: 'quartieri', periferia: 'periferia' };
  for (const [z, v] of Object.entries(h.zone ?? {})) parts.push(`📍${zn[z]} ${f(v!)}`);
  return parts.join(' · ');
}
