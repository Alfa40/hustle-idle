import { BUSINESS } from '../config/balance';
import { hourFactor, type BusinessType } from '../config/business';
import { WEATHER, type WeatherId } from '../config/events';
import { ZONES, type ZoneId } from '../config/map';
import { PRODUCTS, type ProductId } from '../config/products';
import { effectMultiplier, FORECAST_DAYS, forecast, sureEvents, weatherOf, type DayHappening } from './effects';
import { day, monthIndex, type GameState } from './state';

/**
 * Mercato di un prodotto: perché la domanda di oggi è quella che è (un fattore per riga) e come andrà nei
 * prossimi giorni. La previsione usa le stesse regole del gioco: la stagione e gli eventi annunciati sono
 * sicuri; il meteo è quello delle previsioni (meno sicure più è lontano); l'andamento del mercato
 * (`demandRand`) torna piano piano verso la normalità con un po' di caso ogni giorno (vedi `newDay`).
 */

export interface DemandFactor {
  icon: string;
  name: string;
  mult: number;
}

/** Fattori della domanda di oggi di un prodotto in una zona (`extra`: fama e migliorie dell'attività). */
export function demandFactors(s: GameState, pid: ProductId, zone: ZoneId, extra: DemandFactor[] = []): DemandFactor[] {
  const p = PRODUCTS[pid];
  const d = day(s);
  const out: DemandFactor[] = [
    { icon: '📅', name: 'Stagione', mult: p.season[monthIndex(d)] },
    { icon: '📈', name: 'Andamento del mercato', mult: s.demandRand[pid] },
  ];
  const w = weatherOf(s, d);
  out.push({ icon: WEATHER[w].icon, name: `Meteo: ${WEATHER[w].name}`, mult: effectMultiplier([{ h: WEATHER[w], kind: 'weather' }], pid, zone) });
  for (const e of sureEvents(s, d)) out.push({ icon: e.h.icon, name: e.h.name, mult: effectMultiplier([e], pid, zone) });
  out.push({ icon: '📍', name: `Zona: ${ZONES[zone].name}`, mult: ZONES[zone].demand }, ...extra);
  return out;
}

/** Clienti all'ora per tutta la giornata, ora per ora → totale del giorno. */
export const perDay = (type: BusinessType, perHour: number) => {
  let t = 0;
  for (let h = BUSINESS.OPEN_HOUR; h < BUSINESS.CLOSE_HOUR; h++) t += perHour * hourFactor(type, h);
  return t;
};

export interface DayForecast {
  day: number;
  /** clienti all'ora: più probabile, minimo e massimo ragionevoli */
  mid: number;
  lo: number;
  hi: number;
  /** quanto è sicura la previsione (1 = oggi, certa) */
  sure: number;
  /** tempo più probabile e sua probabilità */
  weather: { w: WeatherId; p: number };
  events: DayHappening[];
}

const RAND_KEEP = 0.6;
const RAND_MIN = 0.6;
const RAND_MAX = 1.5;
/** metà della forchetta del caso di ogni giorno (randDemand 0,7–1,3, pesato 0,4) */
const RAND_STEP = 0.4 * 0.3;

/** Previsione della domanda (clienti all'ora, media del giorno) per oggi e i prossimi giorni. `mult`: fama e migliorie. */
export function demandForecast(s: GameState, pid: ProductId, zone: ZoneId, mult = 1, days = FORECAST_DAYS): DayForecast[] {
  const p = PRODUCTS[pid];
  const today = day(s);
  const r = s.demandRand[pid];
  const out: DayForecast[] = [];
  for (let k = 0; k <= days; k++) {
    const d = today + k;
    const base = p.baseDemand * p.season[monthIndex(d)] * ZONES[zone].demand * mult;
    const events = sureEvents(s, d);
    const ev = effectMultiplier(events, pid, zone);
    // l'andamento torna verso 1 (×0,6 al giorno) e il caso di ogni giorno allarga la forchetta
    const keep = RAND_KEEP ** k;
    const rMid = 1 + (r - 1) * keep;
    const spread = (RAND_STEP * (1 - keep)) / (1 - RAND_KEEP);
    const clamp = (x: number) => Math.min(RAND_MAX, Math.max(RAND_MIN, x));
    // meteo: media pesata con le probabilità; minimo e massimo tra i tempi abbastanza probabili
    const fc = forecast(s, d);
    const wm = (w: WeatherId) => effectMultiplier([{ h: WEATHER[w], kind: 'weather' }], pid, zone);
    const tot = fc.reduce((a, x) => a + x.p, 0);
    const wMid = fc.reduce((a, x) => a + x.p * wm(x.w), 0) / tot;
    const likely = fc.filter((x) => x.p >= 0.15);
    const ws = (likely.length ? likely : fc).map((x) => wm(x.w));
    const unit = base * ev;
    out.push({
      day: d,
      mid: unit * clamp(rMid) * wMid,
      lo: unit * clamp(rMid - spread) * Math.min(...ws),
      hi: unit * clamp(rMid + spread) * Math.max(...ws),
      sure: k === 0 ? 1 : Math.max(0.3, 1 - 0.13 * k),
      weather: fc[0],
      events,
    });
  }
  return out;
}
