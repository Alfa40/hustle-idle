import { BUSINESS } from '../config/balance';
import { bizType, hourFactor, ROLES, UPGRADES, type Role } from '../config/business';
import { PRODUCTS } from '../config/products';
import { productLevel } from '../config/recipes';
import {
  estimateMonthlyProfit, eventMultiplier, fmtRate, openDays, weekOf, weeklyClose, partialDue, hasHourly, hourlyDays, lotZone, peakRate as peakRateOf, hasManager, isAutonomous, menuSlots, monthlyCosts, productDemand, covers, employeeRate, shiftsFor, staffWarnings,
  upg,
} from './economy';
import { SHIFT_HOURS, shiftText, shortRanges } from './shifts';
import type { Business, GameState } from './state';

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

/**
 * `s`: lo stato per le statistiche (a fine giornata: l'ultimo minuto del giorno appena finito);
 * `ms`: lo stato per la domanda dei prodotti (il giorno nuovo, per i consigli su cosa vendere oggi).
 */
export function bizReport(s: GameState, b: Business, ms: GameState = s) {
  const def = bizType(b.type);
  // la settimana raccolta (7 giornate di apertura): dati solo da quando è iniziata
  const m = weekOf(s, b);
  // giorni di apertura contati: dall'inizio del mese o, se dopo, da quando l'attività è stata aperta
  // (o da quando i resoconti sono stati azzerati); le ore di chiusura non contano
  const days = Math.max(0.05, openDays(m.from, s.minutes));
  const arrived = m.served + m.lost;
  const avg = {
    arrived: arrived / days,
    served: m.served / days,
    lost: m.lost / days,
    revenue: m.revenue / days,
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
  // personale reparto per reparto con i turni da 8 ore organizzati dal manager
  const dem = Array(24).fill(0);
  for (let h = BUSINESS.OPEN_HOUR; h < BUSINESS.CLOSE_HOUR; h++) dem[h] = maxF ? (peakRate * hourFactor(b.type, h)) / maxF : peakRate;
  const cov = covers(b, dem, (e) => employeeRate(e, b), shiftsFor(s, b).plan.byRole);
  const staff = cov.map((x) => ({
    role: x.r as Role,
    name: def.roleNames[x.r] ?? ROLES[x.r].name,
    n: x.n,
    // i turni veri di oggi, organizzati dal manager
    shifts: (shiftsFor(s, b).plan.byRole.get(x.r)?.shifts ?? []).map((sh) => ({ name: sh.emp.name.split(' ')[0], start: sh.start, end: sh.end, text: shiftText(sh) })).sort((p, q) => p.start - q.start),
    short: x.short.ranges,
    need: x.short.hours.length ? x.n + x.hire : x.n - x.excess,
    status: (x.n && x.short.hours.length ? 'short' : x.excess ? 'excess' : 'ok') as 'ok' | 'short' | 'excess',
    cap: Math.max(...x.plan.cap),
    salary: b.staff.filter((e) => e.role === x.r).reduce((a, e) => a + e.salary, 0),
  }));
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
  // dipendenti a vuoto solo in parte del turno (non di troppo): servono più clienti per sfruttarli
  const idle = cov.flatMap((x) => x.idle.map((i) => ({ ...i, r: x.r }))).filter((i) => i.hours.length < SHIFT_HOURS);
  const growId = upg(b, 'marketing') < UPGRADES.marketing.max ? 'marketing' : upg(b, 'look') < UPGRADES.look.max ? 'look' : null;
  if (!losing && isAutonomous(b) && idle.length) {
    const who = idle.slice(0, 3).map((i) => `${i.emp.name.split(' ')[0]} (${(def.roleNames[i.r] ?? ROLES[i.r].name).toLowerCase()}) ${i.hours.length} ${i.hours.length === 1 ? 'ora' : 'ore'} su ${SHIFT_HOURS}, ${shortRanges(hoursCap(i.hours), hoursDem()).ranges.join(', ')}`).join('; ');
    advice.push({ kind: 'grow', icon: '📣', text: `${idle.length === 1 ? 'Un dipendente lavora' : `${idle.length} dipendenti lavorano`} a vuoto per una parte del turno: ${who}${idle.length > 3 ? ' e altri' : ''}. Nelle altre ore servono, quindi non sono di troppo: aumenta la clientela${growId ? ` con ${UPGRADES[growId].name}` : ''} per sfruttarli`, tab: growId ? 'migliorie' : undefined, label: growId ? '⬆️ Migliorie' : undefined });
  } else if (!losing && isAutonomous(b)) {
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
  return {
    days, avg, hours, hasData, peak, peakRate, staff,
    costs: { rent: c.rent, utilities: c.utilities, salaries },
    profit: isAutonomous(b) ? estimateMonthlyProfit(s, b) : null,
    lostWhy: { staff: m.lostStaff ?? 0, stock: m.lostStock ?? 0, queue: m.lostQueue ?? 0, unknown: Math.max(0, m.lost - (m.lostStaff ?? 0) - (m.lostStock ?? 0) - (m.lostQueue ?? 0)) },
    products,
    advice,
  };
}

export type BizReport = ReturnType<typeof bizReport>;

// per scrivere le ore a vuoto come fasce ("8–10, 15–16") con shortRanges: capacità 0 nelle ore date, domanda 1
const hoursCap = (hours: number[]) => Array.from({ length: 24 }, (_, h) => (hours.includes(h) ? 0 : 1));
const hoursDem = () => Array(24).fill(1);

/**
 * Resoconto della settimana: alla chiusura (22:00) di ogni giorno si controlla se la settimana in corso ha
 * 7 giornate di dati; se sì il manager prepara il resoconto (fisso fino al prossimo) e si ricomincia.
 */
/**
 * Resoconti provvisori mancanti (partite di prima dell'aggiornamento, o raccolte già oltre il 2° giorno):
 * si preparano subito invece di aspettare la prossima chiusura.
 */
export function ensurePartials(s: GameState) {
  for (const b of s.businesses) if (!b.partial && partialDue(s, b)) b.partial = { day: Math.floor(s.minutes / 1440), from: b.week!.from, days: openDaysOf(s, b), data: bizReport(s, b) };
}
const openDaysOf = (s: GameState, b: Business) => openDays(b.week!.from, s.minutes);

export function weeklyReports(s: GameState) {
  let made = 0;
  for (const b of s.businesses) if (weeklyClose(s, b, (st, bb) => bizReport(st, bb))) made++;
  return made;
}
