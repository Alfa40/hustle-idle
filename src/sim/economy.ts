import { BUSINESS, FAME } from '../config/balance';
import {
  bizType, FIRST_NAMES, LAST_NAMES, roleName, UPGRADES,
  type BusinessType, type Role, type UpgradeId,
} from '../config/business';
import { ROLES } from '../config/business';
import { VEHICLES } from '../config/vehicles';
import { BUSINESS_TYPES } from '../config/business';
import { LOTS, ZONES, type ZoneId } from '../config/map';
import { PRODUCTS, type ProductId } from '../config/products';
import { toast } from './bus';
import { activeToday, effectMultiplier } from './effects';
import { addFame, addMoney } from './progress';
import {
  day, emptyLedger, euro, hourOf, monthIndex, pick, rand, randInt,
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

export function isOpenHour(s: GameState) {
  const h = hourOf(s);
  return h >= BUSINESS.OPEN_HOUR && h < BUSINESS.CLOSE_HOUR;
}

// ---------------- personale ----------------

export const hasManager = (b: Business) => b.staff.some((e) => e.role === 'manager');

export function isAutonomous(b: Business) {
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
  for (const r of ['cucina', 'cucina', 'cassa', 'cassa', 'manager'] as Role[]) s.candidates.push(makeCandidate(s, r));
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
}

export function fire(s: GameState, b: Business, empId: number) {
  const e = b.staff.find((x) => x.id === empId);
  if (!e) return;
  // liquidazione: stipendio maturato del mese
  const owed = proratedSalary(s, e);
  b.staff = b.staff.filter((x) => x.id !== empId);
  if (owed > 0) addMoney(s, -owed, `liquidazione ${e.name}`);
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
    products: [bizType(type).products[0]],
    stock: {},
    upgrades: {},
    staff: [],
    autoRestock: true,
    today: emptyLedger(),
    yesterday: emptyLedger(),
    month: emptyLedger(),
    totalRevenue: 0,
    boughtFor: price,
    orders: [],
  };
  addMoney(s, -price);
  s.businesses.push(b);
  // una scorta iniziale per partire subito
  buyStock(s, b, b.products[0], 20, true);
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
  addMoney(s, -cost);
  b.upgrades[id] = lvl + 1;
  toast(`${def.name} livello ${lvl + 1}`, 'good');
  return true;
}

/** Registra una vendita (sia manuale sia automatica). */
export function recordSale(s: GameState, b: Business, pid: ProductId, manual: boolean, tipMult = 1, efficiency = 1) {
  const amount = PRODUCTS[pid].price * tipMult * efficiency;
  b.stock[pid] = Math.max(0, (b.stock[pid] ?? 0) - 1);
  b.today.revenue += amount;
  b.today.served++;
  b.month.revenue += amount;
  b.month.served++;
  b.totalRevenue += amount;
  addMoney(s, amount);
  for (const k of bizType(b.type).skills) addFame(s, k, manual ? FAME.PER_MANUAL_SALE : FAME.PER_AUTO_SALE);
  return amount;
}

export function lostCustomer(b: Business) {
  b.today.lost++;
  b.month.lost++;
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
  if (bizType(b.type).kind === 'service' && !isAutonomous(b)) {
    serviceOrders(s, b, minutes);
    return;
  }
  if (!isAutonomous(b) || !isOpenHour(s)) return;
  const rate = Math.min(totalDemand(s, b), autoCapacity(b));
  const lostRate = Math.max(0, totalDemand(s, b) - rate);
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
        lostCustomer(b);
        continue;
      }
    }
    recordSale(s, b, pid, false, 1 + kindness * 0.01, efficiency);
    for (const e of b.staff) employeeGainXp(e, 1);
  }
  while (lostAcc >= 1) {
    lostAcc -= 1;
    lostCustomer(b);
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
    lostCustomer(b);
    b.orders = b.orders.filter((x) => x !== o);
  }
  if (!isOpenHour(s)) return;
  let a = (acc.get(b.id) ?? 0) + (totalDemand(s, b) * minutes) / 60;
  while (a >= 1) {
    a -= 1;
    if (b.orders.length >= MAX_ORDERS) {
      lostCustomer(b);
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
  if (!hasManager(b)) return;
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
    for (const e of b.staff) e.hiredDay = day(s);
  }
  if (total > 0) {
    addMoney(s, -total);
    toast(`Fine mese: pagati ${euro(total)} tra affitti, bollette, stipendi e assicurazioni`, s.money < 0 ? 'bad' : 'info');
  }
}

export function estimateMonthlyProfit(s: GameState, b: Business) {
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
