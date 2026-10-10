import { BUSINESS } from '../config/balance';
import { bizType, hourFactor, ROLES, UPGRADES, type Role } from '../config/business';
import { PRODUCTS } from '../config/products';
import { productLevel } from '../config/recipes';
import {
  estimateMonthlyProfit, eventMultiplier, fmtRate, hasHourly, hourlyDays, lotZone, peakRate as peakRateOf, hasManager, isAutonomous, menuSlots, monthlyCosts, productDemand, roleCapacity, staffWarnings,
  upg,
} from './economy';
import { dayOfMonth, day, type Business, type GameState } from './state';

/**
 * Resoconto completo di un'attività: una giornata media (clienti arrivati, serviti, persi, incasso),
 * l'andamento ora per ora con l'orario di punta, il personale reparto per reparto rispetto alle ore di
 * punta, i costi del mese e i consigli (assumere, licenziare, migliorie, magazzino, prodotti), ognuno con
 * dove andare per farlo. Serve a gestire le attività senza entrare in ognuna a controllare.
 */
export interface Advice {
  kind: 'short' | 'stock' | 'excess' | 'grow' | 'ok' | 'info';
  icon: string;
  text: string;
  /** scheda dell'attività dove si fa (personale, magazzino, migliorie, prodotti) */
  tab?: string;
  label?: string;
}

const TAB_LABEL: Record<string, string> = { personale: '👥 Personale', magazzino: '🧊 Magazzino', migliorie: '⬆️ Migliorie', prodotti: '🍔 Prodotti' };

export interface HourRow {
  h: number;
  /** clienti arrivati in media in quell'ora (serviti + persi) e quanti persi */
  arrived: number;
  lost: number;
}

/** Giornate di apertura (8–22) tra due minuti di gioco, con le frazioni. */
function openDays(from: number, to: number) {
  const open = (BUSINESS.CLOSE_HOUR - BUSINESS.OPEN_HOUR) * 60;
  let tot = 0;
  for (let d = Math.floor(from / 1440); d <= Math.floor(to / 1440); d++) {
    const a = Math.max(from, d * 1440 + BUSINESS.OPEN_HOUR * 60);
    const b = Math.min(to, d * 1440 + BUSINESS.CLOSE_HOUR * 60);
    if (b > a) tot += b - a;
  }
  return tot / open;
}

/**
 * `s`: lo stato per le statistiche (a fine giornata: l'ultimo minuto del giorno appena finito);
 * `ms`: lo stato per la domanda dei prodotti (il giorno nuovo, per i consigli su cosa vendere oggi).
 */
export function bizReport(s: GameState, b: Business, ms: GameState = s) {
  const def = bizType(b.type);
  const m = b.month;
  // giorni di apertura contati: dall'inizio del mese o, se dopo, da quando l'attività è stata aperta
  // (o da quando i resoconti sono stati azzerati); le ore di chiusura non contano
  const monthStart = (day(s) - (dayOfMonth(day(s)) - 1)) * 1440;
  const days = Math.max(0.05, openDays(Math.max(monthStart, b.statsFrom ?? monthStart), s.minutes));
  const arrived = m.served + m.lost;
  const avg = {
    arrived: arrived / days,
    served: m.served / days,
    lost: m.lost / days,
    revenue: Math.max(0, m.revenue - (b.statsFrom && b.statsFrom > (day(s) - (dayOfMonth(day(s)) - 1)) * 1440 ? b.statsRev0 ?? 0 : 0)) / days,
  };
  // ora per ora: dati veri del mese, altrimenti quelli attesi dalla domanda di oggi
  // ora per ora: dati veri (media sui giorni davvero registrati), altrimenti l'andamento atteso
  // scalato in modo che l'ora più piena valga esattamente peakRate (lo stesso numero ovunque)
  const hourly = b.hourly;
  const hasData = hasHourly(s, b);
  const hd = hourlyDays(s, b);
  const peakRate = peakRateOf(s, b);
  let maxF = 0;
  for (let h = BUSINESS.OPEN_HOUR; h < BUSINESS.CLOSE_HOUR; h++) maxF = Math.max(maxF, hourFactor(b.type, h));
  const hours: HourRow[] = [];
  for (let h = BUSINESS.OPEN_HOUR; h < BUSINESS.CLOSE_HOUR; h++) {
    if (hasData) hours.push({ h, arrived: (hourly!.served[h] + hourly!.lost[h]) / hd, lost: hourly!.lost[h] / hd });
    else hours.push({ h, arrived: maxF ? (peakRate * hourFactor(b.type, h)) / maxF : peakRate, lost: 0 });
  }
  const peak = hours.reduce((a, x) => (x.arrived > a.arrived ? x : a), hours[0]);
  // personale reparto per reparto, rispetto alle ore di punta
  const staff = def.roles.map((r: Role) => {
    const list = b.staff.filter((e) => e.role === r);
    const cap = roleCapacity(b, r);
    const per = list.length ? cap / list.length : 2.5;
    const need = Math.max(1, Math.ceil((peakRate * 1.1) / Math.max(0.5, per)));
    const status: 'ok' | 'short' | 'excess' = cap < peakRate ? 'short' : list.length > need ? 'excess' : 'ok';
    return { role: r, name: def.roleNames[r] ?? ROLES[r].name, n: list.length, cap, need, status, salary: list.reduce((a, e) => a + e.salary, 0) };
  });
  const c = monthlyCosts(s, b);
  const salaries = b.staff.reduce((a, e) => a + e.salary, 0);
  const advice: Advice[] = staffWarnings(s, b).map((w) => ({
    kind: w.kind, icon: w.kind === 'short' ? '⚠️' : w.kind === 'stock' ? '📦' : w.kind === 'info' ? 'ℹ️' : '💸', text: w.text,
    tab: w.kind === 'info' ? undefined : w.tab ?? 'personale', label: w.kind === 'info' ? undefined : TAB_LABEL[w.tab ?? 'personale'],
  }));
  const losing = advice.some((a) => a.kind === 'short' || a.kind === 'stock');
  // crescere: posti liberi nel menù, personale che regge più clienti (marketing, aspetto del locale)
  if (def.kind !== 'craft' && def.kind !== 'service') {
    const free = menuSlots(b) - b.products.length;
    if (free > 0) {
      const best = def.products.filter((p) => !b.products.includes(p)).sort((x, y) => productDemand(ms, b, y) - productDemand(ms, b, x))[0];
      if (best) advice.push({ kind: 'grow', icon: '🍔', text: `Hai ${free} ${free === 1 ? 'posto libero' : 'posti liberi'} nel menù: aggiungi ${PRODUCTS[best].icon} ${PRODUCTS[best].name} (il più richiesto che non vendi)`, tab: 'prodotti', label: '🍔 Prodotti' });
    }
  }
  if (!losing && isAutonomous(b)) {
    const slowest = Math.min(...staff.map((x) => x.cap));
    if (slowest > peakRate * 1.4) {
      const id = upg(b, 'marketing') < UPGRADES.marketing.max ? 'marketing' : upg(b, 'look') < UPGRADES.look.max ? 'look' : null;
      if (id) advice.push({ kind: 'grow', icon: '📣', text: `Il personale regge più clienti di quelli che arrivano: con ${UPGRADES[id].name} ne arrivano di più e lo sfrutti meglio`, tab: 'migliorie', label: '⬆️ Migliorie' });
    }
  }
  // domanda di oggi: cosa si vende di più nella zona del negozio (con stagione ed eventi del giorno)
  const zone = lotZone[b.lotId];
  const products = def.products.map((p) => ({
    pid: p,
    demand: productDemand(ms, b, p),
    selling: b.products.includes(p),
    locked: productLevel(b.type, p) > upg(b, 'ampliamento'),
    event: eventMultiplier(ms, p, zone),
  })).sort((x, y) => y.demand - x.demand);
  if (def.kind !== 'craft' && def.kind !== 'service' && products.length) {
    const sold = products.filter((x) => x.selling);
    const worst = sold[sold.length - 1];
    const better = products.find((x) => !x.selling && !x.locked);
    if (worst && better && better.demand > worst.demand * 1.15 && menuSlots(b) <= b.products.length) {
      advice.push({ kind: 'grow', icon: '📈', text: `Oggi ${PRODUCTS[better.pid].icon} ${PRODUCTS[better.pid].name} è più richiesto di ${PRODUCTS[worst.pid].icon} ${PRODUCTS[worst.pid].name} (${fmtRate(better.demand)} contro ${fmtRate(worst.demand)} clienti all'ora): valuta di cambiarlo nel menù`, tab: 'prodotti', label: '🍔 Prodotti' });
    }
    const lockedTop = products[0];
    const bestSold = sold[0];
    if (lockedTop?.locked && bestSold && lockedTop.demand > bestSold.demand * 1.2) {
      advice.push({ kind: 'grow', icon: '🏗️', text: `Il prodotto più richiesto oggi in questa zona è ${PRODUCTS[lockedTop.pid].icon} ${PRODUCTS[lockedTop.pid].name} (${fmtRate(lockedTop.demand)} clienti all'ora), ma serve l'ampliamento del locale per venderlo`, tab: 'migliorie', label: '⬆️ Migliorie' });
    }
    const hot = products.find((x) => x.event > 1.15 && !x.locked);
    if (hot) advice.push({ kind: 'grow', icon: '🎉', text: `Oggi c'è un evento: ${PRODUCTS[hot.pid].icon} ${PRODUCTS[hot.pid].name} è richiesto ${Math.round((hot.event - 1) * 100)}% più del solito${hot.selling ? ' (ce l\'hai: tieni pieno il magazzino)' : ' (non lo vendi: mettilo nel menù)'}`, tab: hot.selling ? 'magazzino' : 'prodotti', label: hot.selling ? '🧊 Magazzino' : '🍔 Prodotti' });
  }
  if (b.staff.length && !hasManager(b) && !advice.some((a) => a.text.includes('manager'))) {
    advice.push({ kind: 'short', icon: '👔', text: 'Senza manager l\'attività lavora solo quando ci sei tu', tab: 'personale', label: '👥 Personale' });
  }
  if (!advice.length) advice.push({ kind: 'ok', icon: '✅', text: 'Tutto in ordine: personale giusto per le ore di punta e magazzino pieno' });
  const monthStart0 = (day(s) - (dayOfMonth(day(s)) - 1)) * 1440;
  const resetNote = b.statsWhy && (b.statsFrom ?? 0) > monthStart0 ? b.statsWhy : null;
  return {
    resetNote, days, avg, hours, hasData, peak, peakRate, staff,
    costs: { rent: c.rent, utilities: c.utilities, salaries },
    profit: isAutonomous(b) ? estimateMonthlyProfit(s, b) : null,
    lostWhy: { staff: m.lostStaff ?? 0, stock: m.lostStock ?? 0, queue: m.lostQueue ?? 0, unknown: Math.max(0, m.lost - (m.lostStaff ?? 0) - (m.lostStock ?? 0) - (m.lostQueue ?? 0)) },
    products,
    advice,
  };
}

export type BizReport = ReturnType<typeof bizReport>;

/**
 * Resoconto di fine giornata: si calcola una volta al giorno, alla chiusura delle attività (22:00), con i
 * dati della giornata appena finita, e resta uguale fino alla chiusura del giorno dopo.
 */
export function snapshotReports(s: GameState) {
  const d = day(s);
  for (const b of s.businesses) {
    if (bizType(b.type).kind === 'craft') continue;
    b.report = { day: d, data: bizReport(s, b) };
  }
}
