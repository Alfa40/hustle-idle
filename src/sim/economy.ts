import { BUSINESS, FAME } from '../config/balance';
import {
  bizType, FIRST_NAMES, LAST_NAMES, roleName, UPGRADES,
  type BusinessType, type Role, type UpgradeId,
} from '../config/business';
import { hourFactor, ROLES } from '../config/business';
import { VEHICLES } from '../config/vehicles';
import { extraRoom, hasInterior, productLevel } from '../config/recipes';
import { BUSINESS_TYPES } from '../config/business';
import { LOTS, ZONES, type ZoneId } from '../config/map';
import { PRODUCTS, type ProductId } from '../config/products';
import { toast } from './bus';
import { activeToday, effectMultiplier } from './effects';
import { addFame, addMoney } from './progress';
import {
  day, emptyLedger, euro, hourOf, monthIndex, pick, playStats, rand, randInt,
  type Business, type Employee, type GameState,
} from './state';

export const CHAR_MODELS = [
  'character-female-a', 'character-female-b', 'character-female-c', 'character-female-d',
  'character-male-b', 'character-male-c', 'character-male-d', 'character-male-e',
];

// ---------------- lotti ----------------

/** Zona di ogni lotto, calcolata dalla mappa all'avvio. */
export const lotZone: Record<string, ZoneId> = {};

export const lotDef = (id: string) => LOTS.find((l) => l.id === id)!;
export const bizAtLot = (s: GameState, lotId: string) => s.businesses.find((b) => b.lotId === lotId);

// ---------------- domanda ----------------

export function eventMultiplier(s: GameState, pid: ProductId, zone: ZoneId) {
  return effectMultiplier(activeToday(s), pid, zone);
}

/** Domanda "di mercato" di un prodotto in una zona (senza bonus dell'attività). */
export function marketDemand(s: GameState, pid: ProductId, zone: ZoneId) {
  const p = PRODUCTS[pid];
  return p.baseDemand * p.season[monthIndex(day(s))] * s.demandRand[pid] * eventMultiplier(s, pid, zone) * ZONES[zone].demand;
}

export function fameMultiplier(s: GameState, type: BusinessType) {
  const skills = bizType(type).skills;
  const f = skills.reduce((a, k) => a + s.fame[k], 0) / skills.length;
  return 1 + f / (f + FAME.K);
}

export const upg = (b: Business, id: UpgradeId) => b.upgrades[id] ?? 0;

export function upgradeMultiplier(b: Business) {
  return (1 + 0.15 * upg(b, 'look')) * (1 + 0.1 * upg(b, 'marketing'));
}

/** Clienti per ora di gioco per un prodotto di un'attività. */
export function productDemand(s: GameState, b: Business, pid: ProductId) {
  return marketDemand(s, pid, lotZone[b.lotId]) * fameMultiplier(s, b.type) * upgradeMultiplier(b);
}

export function totalDemand(s: GameState, b: Business) {
  return b.products.reduce((a, p) => a + productDemand(s, b, p), 0);
}

/** Clienti all'ora adesso: la media del giorno per l'andamento della giornata (ore di punta). */
export const demandNow = (s: GameState, b: Business) => totalDemand(s, b) * hourFactor(b.type, hourOf(s));

/** Conta un cliente servito o perso nell'ora attuale (statistiche ora per ora del mese). */
function noteHour(s: GameState, b: Business, served: boolean) {
  const h = Math.floor(hourOf(s));
  b.hourly ??= { served: Array(24).fill(0), lost: Array(24).fill(0) };
  if (b.hourly.lastDay !== day(s)) {
    b.hourly.lastDay = day(s);
    b.hourly.days = (b.hourly.days ?? 0) + 1;
  }
  if (served) b.hourly.served[h]++;
  else b.hourly.lost[h]++;
}

/** Giorni registrati ora per ora (oggi conta per la parte di giornata già passata). */
export function hourlyDays(s: GameState, b: Business) {
  const hd = b.hourly;
  if (!hd?.days) return 0;
  const open = BUSINESS.CLOSE_HOUR - BUSINESS.OPEN_HOUR;
  const todayPart = hd.lastDay === day(s) ? Math.min(1, Math.max(0.05, (hourOf(s) - BUSINESS.OPEN_HOUR) / open)) : 1;
  return hd.days - 1 + todayPart;
}

/** Ci sono abbastanza dati ora per ora per usarli (almeno mezza giornata e una ventina di clienti). */
export function hasHourly(s: GameState, b: Business) {
  const hd = b.hourly;
  if (!hd) return false;
  const tot = hd.served.reduce((a, x) => a + x, 0) + hd.lost.reduce((a, x) => a + x, 0);
  return hourlyDays(s, b) >= 0.5 && tot >= 20;
}

/**
 * Clienti all'ora nelle ore di punta: UN solo numero, usato ovunque (resoconto, personale, consigli).
 * Con i dati veri del mese è l'ora più piena in media (clienti arrivati: serviti + persi);
 * se i dati sono ancora pochi è la domanda attesa nell'ora più piena (la più alta vista nel mese).
 */
export function peakRate(s: GameState, b: Business) {
  if (hasHourly(s, b)) {
    const d = hourlyDays(s, b);
    let best = 0;
    for (let h = BUSINESS.OPEN_HOUR; h < BUSINESS.CLOSE_HOUR; h++) best = Math.max(best, (b.hourly!.served[h] + b.hourly!.lost[h]) / d);
    return best;
  }
  let f = 0;
  for (let h = BUSINESS.OPEN_HOUR; h < BUSINESS.CLOSE_HOUR; h++) f = Math.max(f, hourFactor(b.type, h));
  return Math.max(b.month.peak ?? 0, totalDemand(s, b) * f);
}

export function isOpenHour(s: GameState) {
  const h = hourOf(s);
  return h >= BUSINESS.OPEN_HOUR && h < BUSINESS.CLOSE_HOUR;
}

// ---------------- personale ----------------

export const hasManager = (b: Business) => b.staff.some((e) => e.role === 'manager');

/** Laboratorio dell'artigiano: lavori su richiesta fatti solo dal giocatore (niente clienti né staff). */
export const isCraft = (b: Business | BusinessType) => bizType(typeof b === 'string' ? b : b.type).kind === 'craft';

export function isAutonomous(b: Business) {
  if (isCraft(b)) return false;
  return hasManager(b) && bizType(b.type).roles.every((r) => b.staff.some((e) => e.role === r));
}

/** Clienti/ora che un dipendente riesce a gestire. */
export function employeeRate(e: Employee, b: Business) {
  let r = (2 + e.speed * 0.6) * (1 + 0.1 * (e.level - 1));
  if (e.role === 'cucina') r *= 1 + 0.15 * upg(b, 'attrezzatura');
  if (hasManager(b)) r *= 1.1;
  return r * bizType(b.type).rateMul;
}

export function roleCapacity(b: Business, role: Role) {
  return b.staff.filter((e) => e.role === role).reduce((a, e) => a + employeeRate(e, b), 0);
}

export function autoCapacity(b: Business) {
  return Math.min(...bizType(b.type).roles.map((r) => roleCapacity(b, r)));
}

export function makeCandidate(s: GameState, role: Role): Employee {
  const level = Math.random() < 0.15 ? 2 : 1;
  const stat = () => Math.min(10, randInt(2, 6) + (level - 1) * 2);
  const e: Employee = {
    id: s.empSeq++,
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    role, level, xp: 0,
    speed: stat(), skill: stat(), kindness: stat(),
    salary: 0,
    model: pick(CHAR_MODELS),
    hiredDay: 0,
  };
  e.salary = salaryFor(e);
  return e;
}

export function salaryFor(e: Employee) {
  const base = ROLES[e.role].baseSalary;
  return Math.round((base * (1 + (e.speed + e.skill + e.kindness - 12) * 0.04) * (1 + 0.15 * (e.level - 1))) / 10) * 10;
}

export function refreshCandidates(s: GameState) {
  s.candidates = [];
  for (const r of ['cucina', 'cucina', 'cucina', 'cucina', 'cassa', 'cassa', 'cassa', 'manager', 'sala', 'magazzino'] as Role[]) s.candidates.push(makeCandidate(s, r));
  s.candidatesDay = day(s);
}

export function hire(s: GameState, b: Business, candId: number) {
  const i = s.candidates.findIndex((c) => c.id === candId);
  if (i < 0) return;
  const e = s.candidates.splice(i, 1)[0];
  if (e.role === 'manager' && hasManager(b)) {
    toast('Questa attività ha già un manager', 'bad');
    s.candidates.splice(i, 0, e);
    return;
  }
  e.hiredDay = day(s);
  b.staff.push(e);
  toast(`${e.name} assunto come ${roleName(b.type, e.role).toLowerCase()}`, 'good');
  resetBizStats(s, b, `assunto ${e.name} (${roleName(b.type, e.role).toLowerCase()})`);
}

export function fire(s: GameState, b: Business, empId: number) {
  const e = b.staff.find((x) => x.id === empId);
  if (!e) return;
  // liquidazione: stipendio maturato del mese
  const owed = proratedSalary(s, e);
  b.staff = b.staff.filter((x) => x.id !== empId);
  if (owed > 0) addMoney(s, -owed, `liquidazione ${e.name}`);
  resetBizStats(s, b, `licenziato ${e.name}`);
}

/** Stipendio maturato dall'assunzione o dall'ultimo pagamento (hiredDay si azzera a fine mese). */
function proratedSalary(s: GameState, e: Employee) {
  const worked = Math.min(30, Math.max(0, day(s) - e.hiredDay));
  return Math.round((e.salary * worked) / 30);
}

export function employeeGainXp(e: Employee, amount: number) {
  e.xp += amount;
  const need = 40 * e.level * e.level;
  if (e.xp >= need && e.level < 10) {
    e.xp -= need;
    e.level++;
    const stats = ['speed', 'skill', 'kindness'] as const;
    const st = pick(stats);
    e[st] = Math.min(10, e[st] + 1);
    e.salary = salaryFor(e);
    toast(`${e.name} è salito al livello ${e.level}`, 'good');
  }
}

// ---------------- attività ----------------

export function stockCap(b: Business) {
  return BUSINESS.BASE_STOCK_CAP + 40 * upg(b, 'frigo');
}

export function menuSlots(b: Business) {
  return 1 + upg(b, 'menu');
}

/** Prezzo totale: lotto + attrezzatura iniziale dell'attività. */
export const lotPrice = (lotId: string, type: BusinessType) => lotDef(lotId).price + bizType(type).setupCost;

/** Tipi di attività che si possono aprire in un lotto. */
export const typesForLot = (lotId: string) =>
  (Object.keys(BUSINESS_TYPES) as BusinessType[]).filter((t) => bizType(t).lot === lotDef(lotId).kind);

export function buyLot(s: GameState, lotId: string, type: BusinessType) {
  const lot = lotDef(lotId);
  const price = lotPrice(lotId, type);
  if (bizAtLot(s, lotId) || s.money < price || bizType(type).lot !== lot.kind) return null;
  const b: Business = {
    id: 'biz' + lotId,
    type, lotId,
    products: bizType(type).products.slice(0, 1),
    stock: {},
    upgrades: {},
    staff: [],
    autoRestock: true,
    today: emptyLedger(),
    yesterday: emptyLedger(),
    month: emptyLedger(),
    totalRevenue: 0,
    boughtFor: price,
    statsFrom: s.minutes,
    orders: [],
  };
  playStats(s).bizOpened++;
  addMoney(s, -price);
  s.businesses.push(b);
  // una scorta iniziale per partire subito
  if (b.products[0]) buyStock(s, b, b.products[0], 20, true);
  toast(`Hai aperto: ${bizType(type).icon} ${bizType(type).name} in ${lot.name}!`, 'good');
  return b;
}

export function buyStock(s: GameState, b: Business, pid: ProductId, qty: number, free = false) {
  const have = b.stock[pid] ?? 0;
  const room = stockCap(b) - have;
  const cost = PRODUCTS[pid].cost;
  let n = Math.min(qty, room);
  if (!free) n = Math.min(n, Math.floor(Math.max(0, s.money) / cost));
  if (n <= 0) return 0;
  b.stock[pid] = have + n;
  if (!free) {
    addMoney(s, -n * cost);
    b.today.costs += n * cost;
    b.month.costs += n * cost;
  }
  return n;
}

export function buyUpgrade(s: GameState, b: Business, id: UpgradeId) {
  const lvl = upg(b, id);
  const def = UPGRADES[id];
  const cost = def.cost(lvl);
  if (lvl >= def.max || s.money < cost) return false;
  // i locali hanno pareti limitate: niente postazioni nuove se non c'è posto
  if ((id === 'fuochi' || id === 'banco') && hasInterior(b.type) &&
    extraRoom(b.type, Math.min(2, upg(b, 'ampliamento')), upg(b, 'fuochi'), upg(b, 'banco')) <= 0) {
    toast(`📏 Non c'è spazio sul muro: amplia prima ${b.type === 'foodtruck' ? 'il furgone' : 'il locale'}`, 'bad');
    return false;
  }
  addMoney(s, -cost);
  b.upgrades[id] = lvl + 1;
  toast(`${def.name} livello ${lvl + 1}`, 'good');
  // cambia quanti clienti arrivano o quanti se ne servono: clienti persi e ore di punta si ricalcolano da
  // adesso. L'ampliamento da solo no: dà solo più spazio, l'attività lavora come prima finché non ci metti
  // attrezzatura o prodotti nuovi (e quelli azzerano)
  if (id !== 'ampliamento') resetBizStats(s, b, `${def.name} livello ${lvl + 1}`);
  return true;
}

/**
 * Azzera le statistiche del resoconto legate ai clienti persi e alle ore di punta (serviti, persi e
 * motivi, ore di punta, ora per ora): si ricalcolano da adesso. Si fa a ogni cambio che sposta la domanda
 * o quanti clienti l'attività riesce a servire: migliorie, personale assunto o licenziato, prodotti in
 * vendita. Soldi e incassi non cambiano.
 */
export function resetBizStats(s: GameState, b: Business, why: string) {
  for (const l of [b.month, b.today]) {
    l.served = 0;
    l.lost = 0;
    l.lostStaff = 0;
    l.lostStock = 0;
    l.lostQueue = 0;
    l.peak = 0;
  }
  b.hourly = undefined;
  b.statsFrom = s.minutes;
  b.statsRev0 = b.month.revenue;
  b.statsWhy = why;
}

/** Registra una vendita (sia manuale sia automatica). */
export function recordSale(s: GameState, b: Business, pid: ProductId, manual: boolean, tipMult = 1, efficiency = 1) {
  const amount = PRODUCTS[pid].price * tipMult * efficiency;
  b.stock[pid] = Math.max(0, (b.stock[pid] ?? 0) - 1);
  b.today.revenue += amount;
  b.today.served++;
  noteHour(s, b, true);
  b.month.revenue += amount;
  b.month.served++;
  b.totalRevenue += amount;
  addMoney(s, amount);
  for (const k of bizType(b.type).skills) addFame(s, k, manual ? FAME.PER_MANUAL_SALE : FAME.PER_AUTO_SALE);
  return amount;
}

/** Perché un cliente se n'è andato (per gli avvisi dei resoconti). */
export type LostWhy = 'staff' | 'stock' | 'queue';

export function lostCustomer(b: Business, why?: LostWhy, s?: GameState) {
  b.today.lost++;
  b.month.lost++;
  if (s) noteHour(s, b, false);
  if (!why) return;
  const k = why === 'staff' ? 'lostStaff' : why === 'stock' ? 'lostStock' : 'lostQueue';
  b.today[k] = (b.today[k] ?? 0) + 1;
  b.month[k] = (b.month[k] ?? 0) + 1;
}

/** Ricorda la domanda più alta (le ore di punta): il personale va calcolato su quella, non su oggi. */
export function notePeak(b: Business, demand: number) {
  b.today.peak = Math.max(b.today.peak ?? 0, demand);
  b.month.peak = Math.max(b.month.peak ?? 0, demand);
}

/** Sceglie il prodotto di un nuovo cliente in base alla domanda. */
export function pickProduct(s: GameState, b: Business): ProductId {
  const w = b.products.map((p) => productDemand(s, b, p));
  let r = Math.random() * w.reduce((a, x) => a + x, 0);
  for (let i = 0; i < w.length; i++) if ((r -= w[i]) <= 0) return b.products[i];
  return b.products[0];
}

// ---- simulazione automatica (giocatore assente) ----

const acc = new Map<string, number>();

/**
 * Fa lavorare un'attività autonoma per `minutes` minuti di gioco.
 * `efficiency` < 1 per il guadagno offline.
 */
export function autoSim(s: GameState, b: Business, minutes: number, efficiency = 1) {
  // laboratorio: si guadagna solo coi lavori fatti a mano
  if (isCraft(b)) return;
  if (bizType(b.type).kind === 'service' && !isAutonomous(b)) {
    serviceOrders(s, b, minutes);
    return;
  }
  if (!isAutonomous(b) || !isOpenHour(s)) return;
  const now = demandNow(s, b);
  notePeak(b, now);
  const rate = Math.min(now, autoCapacity(b));
  const lostRate = Math.max(0, now - rate);
  let a = (acc.get(b.id) ?? 0) + (rate * minutes) / 60;
  let lostAcc = (acc.get(b.id + 'l') ?? 0) + (lostRate * minutes) / 60;
  const kindness = b.staff.filter((e) => e.role === 'cassa').reduce((x, e) => x + e.kindness, 0) /
    Math.max(1, b.staff.filter((e) => e.role === 'cassa').length);
  while (a >= 1) {
    a -= 1;
    const pid = pickProduct(s, b);
    if ((b.stock[pid] ?? 0) <= 0) {
      if (b.autoRestock) restock(s, b);
      if ((b.stock[pid] ?? 0) <= 0) {
        lostCustomer(b, 'stock', s);
        continue;
      }
    }
    recordSale(s, b, pid, false, 1 + kindness * 0.01, efficiency);
    for (const e of b.staff) employeeGainXp(e, 1);
  }
  while (lostAcc >= 1) {
    lostAcc -= 1;
    lostCustomer(b, 'staff', s);
  }
  acc.set(b.id, a);
  acc.set(b.id + 'l', lostAcc);
  if (b.autoRestock) restock(s, b, 0.25);
}

export const MAX_ORDERS = 4;

/** Attività di servizio senza staff completo: arrivano ordini che esegue il titolare. */
function serviceOrders(s: GameState, b: Business, minutes: number) {
  b.orders ??= [];
  for (const o of b.orders.filter((x) => x.expires < s.minutes)) {
    lostCustomer(b, 'staff', s);
    b.orders = b.orders.filter((x) => x !== o);
  }
  if (!isOpenHour(s)) return;
  notePeak(b, demandNow(s, b));
  let a = (acc.get(b.id) ?? 0) + (demandNow(s, b) * minutes) / 60;
  while (a >= 1) {
    a -= 1;
    if (b.orders.length >= MAX_ORDERS) {
      lostCustomer(b, 'staff', s);
      continue;
    }
    b.orders.push({ id: s.orderSeq++, pid: pickProduct(s, b), expires: s.minutes + 20 * 60, house: randInt(0, 999) });
  }
  acc.set(b.id, a);
}

/** Il titolare ha eseguito un ordine di persona. */
export function completeOrder(s: GameState, b: Business, orderId: number, stars: number) {
  const o = b.orders.find((x) => x.id === orderId);
  if (!o) return 0;
  b.orders = b.orders.filter((x) => x !== o);
  if (stars <= 0) {
    lostCustomer(b);
    return 0;
  }
  return recordSale(s, b, o.pid, true, 0.75 + stars * 0.15);
}

/** Il manager riordina quando un prodotto scende sotto la soglia. */
export function restock(s: GameState, b: Business, threshold = 0) {
  if (!hasManager(b) && !b.staff.some((e) => e.role === 'magazzino')) return;
  const cap = stockCap(b);
  for (const p of b.products) {
    if ((b.stock[p] ?? 0) <= cap * threshold) buyStock(s, b, p, cap);
  }
}

// ---- fine mese ----

export function monthlyCosts(s: GameState, b: Business) {
  const lot = lotDef(b.lotId);
  const salaries = b.staff.reduce((a, e) => a + proratedSalary(s, e), 0);
  return { rent: lot.rent, utilities: BUSINESS.UTILITIES_MONTH, salaries };
}

export const vehiclesMonthly = (s: GameState) => s.vehicles.reduce((a, v) => a + VEHICLES[v].monthly, 0);

export function payMonth(s: GameState) {
  let total = vehiclesMonthly(s);
  for (const b of s.businesses) {
    const c = monthlyCosts(s, b);
    const sum = c.rent + c.utilities + c.salaries;
    total += sum;
    b.month = emptyLedger();
    b.hourly = undefined;
    b.statsRev0 = 0;
    for (const e of b.staff) e.hiredDay = day(s);
  }
  if (total > 0) {
    addMoney(s, -total);
    toast(`Fine mese: pagati ${euro(total)} tra affitti, bollette, stipendi e assicurazioni`, s.money < 0 ? 'bad' : 'info');
  }
}

export function estimateMonthlyProfit(s: GameState, b: Business) {
  if (isCraft(b) || !b.products.length) return -monthlyCosts(s, b).rent - monthlyCosts(s, b).utilities;
  const perHour = isAutonomous(b) ? Math.min(totalDemand(s, b), autoCapacity(b)) : 0;
  const avgMargin = b.products.reduce((a, p) => a + PRODUCTS[p].price - PRODUCTS[p].cost, 0) / b.products.length;
  const hours = (BUSINESS.CLOSE_HOUR - BUSINESS.OPEN_HOUR) * 30;
  const c = monthlyCosts(s, b);
  const fullSalaries = b.staff.reduce((a, e) => a + e.salary, 0);
  return perHour * hours * avgMargin - c.rent - c.utilities - fullSalaries;
}

/** Stima per l'agenzia: clienti/ora del prodotto migliore e incasso al mese con lo staff base. */
export function estimateLot(s: GameState, lotId: string, type: BusinessType) {
  const zone = lotZone[lotId];
  const def = bizType(type);
  const fm = fameMultiplier(s, type);
  const best = def.products
    .filter((p) => productLevel(type, p) === 0)
    .map((p) => ({ p, d: marketDemand(s, p, zone) * fm }))
    .sort((a, b) => b.d * (PRODUCTS[b.p].price - PRODUCTS[b.p].cost) - a.d * (PRODUCTS[a.p].price - PRODUCTS[a.p].cost))[0];
  const hours = (BUSINESS.CLOSE_HOUR - BUSINESS.OPEN_HOUR) * 30;
  const margin = PRODUCTS[best.p].price - PRODUCTS[best.p].cost;
  // staff base: un dipendente per reparto a velocità media
  const cap = (2 + 4 * 0.6) * 1.1 * def.rateMul;
  const perHour = Math.min(best.d, cap);
  const staff = def.roles.reduce((a, r) => a + ROLES[r].baseSalary, 0) + ROLES.manager.baseSalary;
  return {
    best: best.p,
    demand: best.d,
    revenue: perHour * hours * PRODUCTS[best.p].price,
    profit: perHour * hours * margin - lotDef(lotId).rent - BUSINESS.UTILITIES_MONTH - staff,
  };
}

export const randDemand = () => rand(0.7, 1.3);

/**
 * Avvisi per i resoconti, per aiutare a gestire bene ogni attività: perché si perdono clienti e cosa
 * fare (assumere nel reparto giusto, riordinare, ingrandire il magazzino) e, solo se non se ne perdono,
 * i dipendenti di troppo. Il personale si misura sulle ore di punta del mese, non sulla domanda di adesso.
 */
export interface StaffWarning {
  kind: 'short' | 'stock' | 'excess' | 'info';
  text: string;
  /** dove si sistema: scheda dell'attività (personale, magazzino, migliorie) */
  tab?: 'personale' | 'magazzino' | 'migliorie';
}

/** Clienti all'ora scritti sempre allo stesso modo in resoconti e consigli (es. "5,1" o "17"). */
export const fmtRate = (x: number) => (x >= 10 ? String(Math.round(x)) : x.toFixed(1).replace('.', ','));

export function staffWarnings(s: GameState, b: Business): StaffWarning[] {
  const def = bizType(b.type);
  if (def.kind === 'craft' || !def.roles.length) return [];
  const out: StaffWarning[] = [];
  const name = (r: Role) => (def.roleNames[r] ?? ROLES[r].name).toLowerCase();
  // plurale del ruolo (cuoco → cuochi, cassiere → cassieri, addetto pulizie → addetti alle pulizie)
  const plural = (r: Role) => {
    const n = name(r);
    if (n.startsWith('addetto')) return 'addetti alle pulizie';
    return n.replace(/co$/, 'chi').replace(/io$/, 'i').replace(/[aeo]$/, 'i');
  };
  const m = b.month;
  const lost = m.lost;
  const share = lost / Math.max(1, m.served + lost);
  const pct = `${Math.round(share * 100)}%`;
  // ore di punta: lo stesso numero del resoconto (peakRate)
  const peak = peakRate(s, b);
  const missing = def.roles.filter((r) => !b.staff.some((e) => e.role === r));
  const known = (m.lostStaff ?? 0) + (m.lostStock ?? 0) + (m.lostQueue ?? 0);
  // clienti persi prima che il gioco registrasse il motivo (partite di prima dell'aggiornamento)
  const unknown = Math.max(0, lost - known);
  const caps = def.roles.map((r) => ({ r, c: roleCapacity(b, r), n: b.staff.filter((e) => e.role === r).length })).sort((x, y) => x.c - y.c);
  // reparti che non reggono le ore di punta, e quanti in più ne servono (10% di margine)
  const hires = caps
    .map((x) => ({ ...x, need: Math.ceil((peak * 1.1 - x.c) / Math.max(0.5, x.n ? x.c / x.n : 2.5)) }))
    // solo i reparti che davvero non reggono le ore di punta (il margine serve a dire quanti assumere)
    .filter((x) => x.n > 0 && x.c < peak && x.need > 0);
  const staffLost = m.lostStaff ?? 0;
  if (b.staff.length && missing.length && (lost >= 3 || !hasManager(b))) {
    out.push({ kind: 'short', text: `Persi ${lost} clienti questo mese (${pct}): manca il reparto ${missing.map(name).join(' e ')}. Assumi almeno un ${missing.map(name).join(' e un ')}`, tab: 'personale' });
  } else if (b.staff.length && hires.length) {
    const list = hires.map((x) => `${x.need} ${x.need === 1 ? name(x.r) : plural(x.r)}`).join(' e ');
    const slow = hires[0];
    out.push({ kind: 'short', text: `${staffLost ? `Persi ${staffLost} clienti questo mese perché il personale non basta. ` : ''}Nelle ore di punta arrivano circa ${fmtRate(peak)} clienti all'ora, ma i ${plural(slow.r)} ne servono ${fmtRate(slow.c)}: assumi circa ${list} in più`, tab: 'personale' });
  } else if (unknown >= 3 && b.staff.length) {
    out.push({ kind: 'info', text: `Persi ${unknown} clienti prima che il gioco registrasse il motivo. Con il personale di adesso le ore di punta (circa ${fmtRate(peak)} clienti all'ora) sono coperte: dai prossimi giorni il resoconto ti dirà se se ne perdono ancora e perché` });
  }
  if (b.staff.length && !hasManager(b) && !missing.length) {
    out.push({ kind: 'short', text: 'Senza manager l\'attività non lavora da sola quando non ci sei: i clienti si perdono. Assumi un manager' });
  }
  // prodotti finiti
  const stockLost = m.lostStock ?? 0;
  if (stockLost >= 3) {
    const tip = !b.autoRestock ? 'attiva il riordino automatico nel Magazzino'
      : !hasManager(b) && !b.staff.some((e) => e.role === 'magazzino') ? 'assumi un manager (o un magazziniere) che riordini da solo'
        : 'compra la miglioria del frigo per tenere più scorte';
    out.push({ kind: 'stock', text: `Persi ${stockLost} clienti perché i prodotti erano finiti: ${tip}`, tab: tip.includes('frigo') ? 'migliorie' : tip.includes('assumi') ? 'personale' : 'magazzino' });
  }
  // fila troppo lunga mentre lavoravi tu
  const queueLost = m.lostQueue ?? 0;
  if (queueLost >= 5) out.push({ kind: 'short', text: `Persi ${queueLost} clienti in fila mentre lavoravi nel locale: con un dipendente in più in cucina o alla cassa la fila scorre` });
  // dipendenti di troppo: solo se non si perdono clienti e misurando sulle ore di punta (con margine)
  const knownShare = known / Math.max(1, m.served + lost);
  if (!out.some((w) => w.kind !== 'info') && !missing.length && knownShare < 0.03 && unknown < 3 && peak > 0) {
    let extra = 0;
    let salary = 0;
    for (const r of def.roles) {
      const staff = b.staff.filter((e) => e.role === r).sort((x, y) => employeeRate(y, b) - employeeRate(x, b));
      let cap = 0;
      for (const e of staff) {
        if (cap >= peak * 1.3) {
          extra++;
          salary += e.salary;
        } else cap += employeeRate(e, b);
      }
    }
    if (extra > 0) out.push({ kind: 'excess', text: `Costi alti: ${extra} ${extra === 1 ? 'dipendente' : 'dipendenti'} di troppo anche nelle ore di punta (${euro(salary)} di stipendi al mese che si potrebbero risparmiare)` });
  }
  return out;
}
