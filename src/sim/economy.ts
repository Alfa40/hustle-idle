import { BUSINESS, FAME } from '../config/balance';
import {
  bizType, FIRST_NAMES, LAST_NAMES, roleName, UPGRADES,
  type BusinessType, type Role, type UpgradeId,
} from '../config/business';
import { EXTRA_ROLES, hourFactor, ROLES } from '../config/business';
import { VEHICLES } from '../config/vehicles';
import { extraRoom, hasInterior, productLevel } from '../config/recipes';
import { BUSINESS_TYPES } from '../config/business';
import { LOTS, ZONES, type ZoneId } from '../config/map';
import { PRODUCTS, type ProductId } from '../config/products';
import { toast } from './bus';
import { demandCurve, inShift, planRole, planShifts, shortRanges, SHIFT_HOURS, type Shift } from './shifts';
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
  return Math.max(weekOf(s, b).peak ?? 0, totalDemand(s, b) * f);
}

export function isOpenHour(s: GameState) {
  const h = hourOf(s);
  return h >= BUSINESS.OPEN_HOUR && h < BUSINESS.CLOSE_HOUR;
}

// ---------------- personale ----------------

// ---------------- dipendenti: livello, stelle, formazione ----------------

export const MAX_STARS = 5;
export const MAX_LEVEL = 10;
/** una stella vale un po' più di 10 livelli: la formazione dà un piccolo balzo */
const STAR_UNITS = 11;
const MAX_UNITS = MAX_STARS * STAR_UNITS + MAX_LEVEL;

/**
 * Quanto rende la strada fatta: fino al livello 10 della prima stella come sempre (+10% a livello),
 * poi ogni livello e ogni stella un po' meno (+4%): a 5 stelle e livello 10 circa 4 volte.
 */
export function empMult(e: Employee) {
  const u = (e.stars ?? 0) * STAR_UNITS + e.level;
  return 1 + 0.1 * Math.min(u - 1, 9) + 0.04 * Math.max(0, u - 10);
}

/** Quanta strada ha fatto il dipendente (0 nuovo … 1 a 5 stelle e livello 10). */
export const empProgress = (e: Employee) => Math.min(1, ((e.stars ?? 0) * STAR_UNITS + e.level) / MAX_UNITS);

/**
 * Valore vero di velocità, abilità o cortesia (1–10): parte dal talento e cresce piano con livello e
 * stelle; arriva a 10 solo a 5 stelle e livello 10.
 */
export function empStat(e: Employee, k: 'speed' | 'skill' | 'kindness') {
  const base = Math.min(7, e[k]);
  return base + (10 - base) * empProgress(e);
}

/** chi è in formazione non lavora (né turni né locale) */
export const working = (b: Business) => b.staff.filter((e) => !e.trainingEnd);

/** Durata (giorni) e costo del corso per guadagnare la prossima stella. */
export const trainingDays = (e: Employee) => 2 + (e.stars ?? 0);
export const trainingCost = (e: Employee) => Math.round((ROLES[e.role].baseSalary * (1 + (e.stars ?? 0) * 0.8)) / 10) * 10;
export const canTrain = (e: Employee) => e.level >= MAX_LEVEL && (e.stars ?? 0) < MAX_STARS && !e.trainingEnd;

/** Manda il dipendente al corso di formazione (a livello 10): torna con una stella in più e livello 0. */
export function startTraining(s: GameState, b: Business, e: Employee) {
  if (!canTrain(e)) return false;
  const cost = trainingCost(e);
  if (s.money < cost) {
    toast('Non hai abbastanza soldi per il corso', 'bad');
    return false;
  }
  addMoney(s, -cost, `corso di formazione di ${e.name}`);
  e.trainingEnd = s.minutes + trainingDays(e) * 1440;
  toast(`🎓 ${e.name} è al corso di formazione per ${trainingDays(e)} giorni`, 'info');
  resetBizStats(s, b, `${e.name} in formazione`);
  return true;
}

/** Chi ha finito il corso torna con una stella in più, livello 0 e valori un po' più alti. */
export function finishTrainings(s: GameState) {
  for (const b of s.businesses) {
    for (const e of b.staff) {
      if (!e.trainingEnd || s.minutes < e.trainingEnd) continue;
      e.trainingEnd = undefined;
      e.stars = Math.min(MAX_STARS, (e.stars ?? 0) + 1);
      e.level = 0;
      e.xp = 0;
      e.salary = salaryFor(e);
      toast(`⭐ ${e.name} è tornato dalla formazione: ${'★'.repeat(e.stars)} (livello 0)`, 'good');
      resetBizStats(s, b, `${e.name} tornato dalla formazione`);
    }
  }
}

export const hasManager = (b: Business) => working(b).some((e) => e.role === 'manager');

/** Laboratorio dell'artigiano: lavori su richiesta fatti solo dal giocatore (niente clienti né staff). */
export const isCraft = (b: Business | BusinessType) => bizType(typeof b === 'string' ? b : b.type).kind === 'craft';

export function isAutonomous(b: Business) {
  if (isCraft(b)) return false;
  return hasManager(b) && bizType(b.type).roles.every((r) => working(b).some((e) => e.role === r));
}

/** Clienti/ora che un dipendente riesce a gestire. */
/**
 * Quanto è veloce un reparto rispetto a chi prepara: incassare e servire è più rapido che cucinare (o
 * pulire, portare mobili), quindi un cassiere/commesso/autista regge circa 1,5 volte i clienti di un cuoco.
 */
const ROLE_SPEED: Partial<Record<Role, number>> = { cassa: 1.5 };

/** La miglioria "Cassa veloce" c'è nelle attività con bancone e cassieri (food truck, panificio). */
export const hasCashUpgrade = (t: BusinessType) => hasInterior(t) && (bizType(t).roles as Role[]).includes('cassa');

export function employeeRate(e: Employee, b: Business) {
  // velocità vera e strada fatta (livello e stelle): un dipendente a 5 stelle lavora molto più in fretta
  let r = (2 + empStat(e, 'speed') * 0.6) * empMult(e) * (ROLE_SPEED[e.role] ?? 1);
  // attrezzatura professionale: chi prepara; cassa veloce: cassieri e camerieri. Nelle attività senza
  // bancone (niente cassa veloce, es. traslochi) l'attrezzatura vale per tutti
  if (hasCashUpgrade(b.type)) {
    if (e.role === 'cucina') r *= 1 + 0.15 * upg(b, 'attrezzatura');
    else if (e.role === 'cassa' || e.role === 'sala') r *= 1 + 0.15 * upg(b, 'cassa');
  } else if (e.role !== 'manager') r *= 1 + 0.15 * upg(b, 'attrezzatura');
  if (hasManager(b)) r *= 1.1;
  return r * bizType(b.type).rateMul;
}

export function roleCapacity(b: Business, role: Role) {
  return working(b).filter((e) => e.role === role).reduce((a, e) => a + employeeRate(e, b), 0);
}

// ---------------- turni ----------------

const shiftCache = new WeakMap<Business, { key: string; plan: ReturnType<typeof planShifts>; curve: number[] }>();

/**
 * I turni di oggi organizzati dal manager (dipendenti da 8 ore al massimo, più coperti nelle ore di
 * punta): si rifanno quando cambiano il giorno, il personale o la domanda.
 */
export function shiftsFor(s: GameState, b: Business) {
  const curve = demandCurve(b.type, totalDemand(s, b));
  const key = `${day(s)}|${working(b).map((e) => `${e.id}:${e.level}:${e.stars ?? 0}:${e.speed}`).join(',')}|${upg(b, 'attrezzatura')}:${upg(b, 'cassa')}|${curve.map((x) => x.toFixed(1)).join(',')}`;
  const c = shiftCache.get(b);
  if (c && c.key === key) return c;
  const v = { key, plan: planShifts(b, (e) => employeeRate(e, b), curve), curve };
  shiftCache.set(b, v);
  return v;
}

/** Clienti all'ora che l'attività serve in quell'ora con chi è di turno. */
export const capacityAt = (s: GameState, b: Business, h: number) => shiftsFor(s, b).plan.capAt(Math.floor(h));

/** Il dipendente è di turno a quest'ora? */
export function onShift(s: GameState, b: Business, e: Employee, h = hourOf(s)) {
  const sh = shiftsFor(s, b).plan.byRole.get(e.role)?.shifts.find((x) => x.emp.id === e.id);
  return !!sh && inShift(sh, Math.floor(h));
}

/** Turno di un dipendente (uno o due pezzi, es. 11–15 + 18–22). */
export const shiftOf = (s: GameState, b: Business, e: Employee) => shiftsFor(s, b).plan.byRole.get(e.role)?.shifts.find((x) => x.emp.id === e.id);

export function autoCapacity(b: Business) {
  return Math.min(...bizType(b.type).roles.map((r) => roleCapacity(b, r)));
}

export function makeCandidate(s: GameState, role: Role): Employee {
  const level = Math.random() < 0.15 ? 2 : 1;
  const stat = () => Math.min(7, randInt(2, 6) + (level - 1));
  const e: Employee = {
    id: s.empSeq++,
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    role, level, xp: 0, stars: 0,
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
  // lo stipendio sale come il lavoro che fa: un dipendente a stelle costa di più ma ne vale tanti
  return Math.round((base * (1 + (empStat(e, 'speed') + empStat(e, 'skill') + empStat(e, 'kindness') - 12) * 0.04) * empMult(e)) / 10) * 10;
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

/** Con almeno una stella il dipendente è fidato: si può spostare in un'altra delle tue attività. */
export const canMove = (e: Employee) => (e.stars ?? 0) >= 1 && !e.trainingEnd;

/**
 * Dove si può spostare: le altre attività dove c'è lo stesso lavoro (stesso nome della mansione: un cuoco va
 * in un altro food truck, un fornaio in un altro panificio; manager ovunque se lì manca, magazziniere e
 * cameriere dove l'ampliamento li rende utili).
 */
export function moveTargets(s: GameState, from: Business, e: Employee) {
  const name = roleName(from.type, e.role);
  return s.businesses.filter((b) => {
    if (b.id === from.id) return false;
    if (e.role === 'manager') return bizType(b.type).kind !== 'craft' && !hasManager(b);
    const extra = EXTRA_ROLES.find((x) => x.role === e.role);
    if (extra) return hasInterior(b.type) && upg(b, 'ampliamento') >= extra.level;
    return (bizType(b.type).roles as Role[]).includes(e.role) && roleName(b.type, e.role) === name;
  });
}

/** Sposta un dipendente fidato: tiene stelle, livello e stipendio; le statistiche di entrambe ripartono. */
export function moveEmployee(s: GameState, from: Business, to: Business, empId: number) {
  const e = from.staff.find((x) => x.id === empId);
  if (!e || !canMove(e) || !moveTargets(s, from, e).includes(to)) return false;
  from.staff = from.staff.filter((x) => x !== e);
  to.staff.push(e);
  toast(`↔️ ${e.name} spostato in ${lotDef(to.lotId).name}`, 'good');
  resetBizStats(s, from, `spostato ${e.name} in un'altra attività`);
  resetBizStats(s, to, `arrivato ${e.name} (${roleName(to.type, e.role).toLowerCase()})`);
  return true;
}

/** Stipendio maturato dall'assunzione o dall'ultimo pagamento (hiredDay si azzera a fine mese). */
function proratedSalary(s: GameState, e: Employee) {
  const worked = Math.min(30, Math.max(0, day(s) - e.hiredDay));
  return Math.round((e.salary * worked) / 30);
}

/** Esperienza per il prossimo livello (cresce col livello e con le stelle). */
export const xpForEmpLevel = (e: Employee) => Math.round(30 * Math.max(1, e.level) ** 1.5 * (1 + 0.3 * (e.stars ?? 0)));

export function employeeGainXp(e: Employee, amount: number) {
  if (e.trainingEnd || e.level >= MAX_LEVEL) return;
  e.xp += amount;
  const need = xpForEmpLevel(e);
  if (e.xp >= need) {
    e.xp -= need;
    e.level++;
    e.salary = salaryFor(e);
    toast(e.level >= MAX_LEVEL && (e.stars ?? 0) < MAX_STARS ? `${e.name} è al livello 10: mandalo al corso di formazione per la prossima stella` : `${e.name} è salito al livello ${e.level}`, 'good');
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
    week: { ...emptyLedger(), from: s.minutes },
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
  b.statsWhy = why;
  // la raccolta per il resoconto della settimana riparte da adesso (il resoconto vecchio non vale più)
  b.week = { ...emptyLedger(), from: s.minutes };
  b.report = undefined;
  b.partial = undefined;
}

/** Registra una vendita (sia manuale sia automatica). */
export function recordSale(s: GameState, b: Business, pid: ProductId, manual: boolean, tipMult = 1, efficiency = 1) {
  const amount = PRODUCTS[pid].price * tipMult * efficiency;
  b.stock[pid] = Math.max(0, (b.stock[pid] ?? 0) - 1);
  b.today.revenue += amount;
  b.today.served++;
  const w = weekOf(s, b);
  w.served++;
  w.revenue += amount;
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
  const w = s ? weekOf(s, b) : b.week;
  if (w) w.lost++;
  if (s) noteHour(s, b, false);
  if (!why) return;
  const k = why === 'staff' ? 'lostStaff' : why === 'stock' ? 'lostStock' : 'lostQueue';
  b.today[k] = (b.today[k] ?? 0) + 1;
  b.month[k] = (b.month[k] ?? 0) + 1;
  if (w) w[k] = (w[k] ?? 0) + 1;
}

/** I dati della settimana in corso (per il prossimo resoconto). */
export function weekOf(s: GameState, b: Business) {
  return (b.week ??= { ...emptyLedger(), from: s.minutes });
}

/** Giornate di apertura (8–22) tra due minuti di gioco, con le frazioni. */
export function openDays(from: number, to: number) {
  const open = (BUSINESS.CLOSE_HOUR - BUSINESS.OPEN_HOUR) * 60;
  let tot = 0;
  for (let d = Math.floor(from / 1440); d <= Math.floor(to / 1440); d++) {
    const a = Math.max(from, d * 1440 + BUSINESS.OPEN_HOUR * 60);
    const e = Math.min(to, d * 1440 + BUSINESS.CLOSE_HOUR * 60);
    if (e > a) tot += e - a;
  }
  return tot / open;
}

/** Giornate raccolte per il resoconto della settimana (ne servono REPORT_DAYS). */
export const REPORT_DAYS = 7;
/**
 * Dal terzo giorno, finché non c'è il primo resoconto completo, c'è un resoconto provvisorio: il manager lo
 * prepara alla chiusura del 2° giorno di raccolta (così il 3° giorno si vede già) e lo rifà ogni sera.
 */
export const PARTIAL_DAYS = 3;

/** Giorni di raccolta già chiusi alle 22:00 (il giorno in cui è partita la raccolta conta se è partita prima della chiusura). */
export function closedDays(s: GameState, b: Business) {
  const from = weekOf(s, b).from;
  const close = BUSINESS.CLOSE_HOUR * 60;
  const lastClose = s.minutes % 1440 >= close ? day(s) : day(s) - 1;
  const first = Math.floor(from / 1440) + (from % 1440 >= close ? 1 : 0);
  return Math.max(0, lastClose - first + 1);
}

/** Tra quanti giorni (0 = stasera, 1 = domani sera…) il manager prepara il resoconto provvisorio alla chiusura. */
export function partialIn(s: GameState, b: Business) {
  const from = weekOf(s, b).from;
  const close = BUSINESS.CLOSE_HOUR * 60;
  let at = day(s) * 1440 + close;
  if (s.minutes >= at) at += 1440;
  for (let k = 1; k <= REPORT_DAYS; k++, at += 1440) {
    const first = Math.floor(from / 1440) + (from % 1440 >= close ? 1 : 0);
    if (Math.floor(at / 1440) - first + 1 >= PARTIAL_DAYS - 1 && openDays(from, at) >= 1.5) return Math.floor(at / 1440) - day(s);
  }
  return null;
}

/** Va preparato il resoconto provvisorio? (niente resoconto completo, almeno 2 giorni chiusi e 1,5 giornate di dati) */
export const partialDue = (s: GameState, b: Business) =>
  bizType(b.type).kind !== 'craft' && !b.report && closedDays(s, b) >= PARTIAL_DAYS - 1 && weekDays(s, b) >= 1.5;
export const weekDays = (s: GameState, b: Business) => openDays(weekOf(s, b).from, s.minutes);

/**
 * Alla chiusura (22:00): se la settimana ha 7 giornate di dati il manager prepara il resoconto della
 * settimana e si comincia a raccogliere la prossima. Restituisce true se ha preparato un resoconto.
 */
export function weeklyClose(s: GameState, b: Business, make: (s: GameState, b: Business) => import('./report').BizReport) {
  if (bizType(b.type).kind === 'craft') return false;
  const done = weekDays(s, b);
  if (done < REPORT_DAYS - 0.01) {
    // nessun resoconto completo (prima settimana o dopo un cambio): dal 3° giorno uno provvisorio
    if (partialDue(s, b)) b.partial = { day: day(s), from: weekOf(s, b).from, days: done, data: make(s, b) };
    return false;
  }
  b.report = { day: day(s), from: weekOf(s, b).from, data: make(s, b) };
  b.partial = undefined;
  b.week = { ...emptyLedger(), from: s.minutes };
  b.hourly = undefined;
  return true;
}

/** Ricorda la domanda più alta (le ore di punta): il personale va calcolato su quella, non su oggi. */
export function notePeak(b: Business, demand: number, s?: GameState) {
  b.today.peak = Math.max(b.today.peak ?? 0, demand);
  b.month.peak = Math.max(b.month.peak ?? 0, demand);
  const w = s ? weekOf(s, b) : b.week;
  if (w) w.peak = Math.max(w.peak ?? 0, demand);
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
  notePeak(b, now, s);
  // serve solo chi è di turno in quest'ora
  const rate = Math.min(now, capacityAt(s, b, hourOf(s)));
  const lostRate = Math.max(0, now - rate);
  let a = (acc.get(b.id) ?? 0) + (rate * minutes) / 60;
  let lostAcc = (acc.get(b.id + 'l') ?? 0) + (lostRate * minutes) / 60;
  const kindness = working(b).filter((e) => e.role === 'cassa').reduce((x, e) => x + empStat(e, 'kindness'), 0) /
    Math.max(1, working(b).filter((e) => e.role === 'cassa').length);
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
    // esperienza a chi è di turno (chi lavora quell'ora)
    for (const e of working(b)) if (e.role === 'manager' || onShift(s, b, e)) employeeGainXp(e, 1);
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
  notePeak(b, demandNow(s, b), s);
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
    for (const e of b.staff) e.hiredDay = day(s);
  }
  if (total > 0) {
    addMoney(s, -total);
    toast(`Fine mese: pagati ${euro(total)} tra affitti, bollette, stipendi e assicurazioni`, s.money < 0 ? 'bad' : 'info');
  }
}

export function estimateMonthlyProfit(s: GameState, b: Business) {
  if (isCraft(b) || !b.products.length) return -monthlyCosts(s, b).rent - monthlyCosts(s, b).utilities;
  // clienti serviti in un giorno con i turni: ora per ora, quanti ne regge chi è di turno
  let perDay = 0;
  if (isAutonomous(b)) {
    const { plan, curve } = shiftsFor(s, b);
    for (let h = BUSINESS.OPEN_HOUR; h < BUSINESS.CLOSE_HOUR; h++) perDay += Math.min(curve[h], plan.capAt(h));
  }
  const perHour = perDay / (BUSINESS.CLOSE_HOUR - BUSINESS.OPEN_HOUR);
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
  // staff base: due dipendenti per reparto a velocità media (con i turni da 8 ore coprono tutta la
  // giornata: 8–16 e 14–22), più un manager; clienti serviti ora per ora secondo l'andamento del giorno
  const cap = (2 + 4 * 0.6) * 1.1 * def.rateMul;
  const curve = demandCurve(type, best.d);
  let perDay = 0;
  for (let h = BUSINESS.OPEN_HOUR; h < BUSINESS.CLOSE_HOUR; h++) {
    const on = (h < BUSINESS.OPEN_HOUR + SHIFT_HOURS ? 1 : 0) + (h >= BUSINESS.CLOSE_HOUR - SHIFT_HOURS ? 1 : 0);
    perDay += Math.min(curve[h], cap * on);
  }
  const perHour = perDay / (BUSINESS.CLOSE_HOUR - BUSINESS.OPEN_HOUR);
  const staff = def.roles.reduce((a, r) => a + 2 * ROLES[r].baseSalary, 0) + ROLES.manager.baseSalary;
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

/**
 * Copertura di ogni reparto con i turni: ore scoperte (dove chi è di turno non regge i clienti),
 * quanti dipendenti in più servirebbero per coprirle e quanti si potrebbero togliere senza scoprirne.
 */
export function covers(b: Business, dem: number[], rate: (e: Employee) => number, actual?: Map<string, { cap: number[]; shifts?: Shift[] }>) {
  return bizType(b.type).roles.map((r) => {
    const emps = working(b).filter((e) => e.role === r);
    const avg = emps.length ? emps.reduce((a, e) => a + rate(e), 0) / emps.length : 3;
    const fake = (k: number) => Array.from({ length: k }, (_, i) => ({ ...(emps[0] ?? b.staff[0]), id: -1 - i, role: r }) as Employee);
    const rateOr = (e: Employee) => (e.id < 0 ? avg : rate(e));
    const plan = planRole(emps, rate, dem);
    // ore scoperte con i turni veri di oggi (gli stessi mostrati nel resoconto e nel personale)
    const short = shortRanges(actual?.get(r)?.cap ?? plan.cap, dem);
    let hire = 0;
    if (short.hours.length) {
      for (hire = 1; hire < 10; hire++) if (!shortRanges(planRole([...emps, ...fake(hire)], rateOr, dem).cap, dem).hours.length) break;
    }
    // di troppo è solo chi non serve in nessuna ora del suo turno (tutte le 8 ore): anche senza di lui, in
    // ognuna di quelle ore chi resta regge i clienti con un 15% di margine. Chi serve anche solo nelle ore
    // di punta (e nelle altre è in più) non è di troppo. Si guarda dal più lento, uno alla volta.
    let excess = 0;
    let excessSalary = 0;
    const excessEmps: Employee[] = [];
    const idle: { emp: Employee; hours: number[] }[] = [];
    if (!short.hours.length) {
      const used = actual?.get(r)?.shifts ? (actual.get(r) as { cap: number[]; shifts: Shift[] }) : plan;
      const cap = [...used.cap];
      const sorted = [...used.shifts].sort((x, y) => rate(x.emp) - rate(y.emp));
      for (const sh of sorted) {
        if (excess >= sorted.length - 1) break;
        const er = rate(sh.emp);
        const useless = sh.blocks.every((k) => {
          for (let h = k.start; h < k.end; h++) if (cap[h] - er < dem[h] * 1.15) return false;
          return true;
        });
        if (!useless) continue;
        for (const k of sh.blocks) for (let h = k.start; h < k.end; h++) cap[h] -= er;
        excess++;
        excessSalary += sh.emp.salary;
        excessEmps.push(sh.emp);
      }
      // a vuoto solo in parte del turno: ore in cui, anche senza di lui, chi resta regge i clienti
      for (const sh of sorted) {
        if (excessEmps.includes(sh.emp)) continue;
        const er = rate(sh.emp);
        const hours: number[] = [];
        // (un'ora a vuoto si conta per uno solo: se in due sono in più per la stessa ora, ne basta uno)
        for (const k of sh.blocks)
          for (let h = k.start; h < k.end; h++)
            if (cap[h] - er >= dem[h] * 1.15) {
              hours.push(h);
              cap[h] -= er;
            }
        if (hours.length) idle.push({ emp: sh.emp, hours });
      }
    }
    return { r, n: emps.length, plan, short, hire, excess, excessSalary, excessEmps, idle };
  });
}

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
  const m = weekOf(s, b);
  const lost = m.lost;
  const share = lost / Math.max(1, m.served + lost);
  const pct = `${Math.round(share * 100)}%`;
  // ore di punta: lo stesso numero del resoconto (peakRate)
  const peak = peakRate(s, b);
  const missing = def.roles.filter((r) => !working(b).some((e) => e.role === r));
  const known = (m.lostStaff ?? 0) + (m.lostStock ?? 0) + (m.lostQueue ?? 0);
  // clienti persi prima che il gioco registrasse il motivo (partite di prima dell'aggiornamento)
  const unknown = Math.max(0, lost - known);
  // turni: la domanda ora per ora della settimana (l'ora più piena vale `peak`, come nel resoconto)
  const dem = Array(24).fill(0);
  let maxF = 0;
  for (let h = BUSINESS.OPEN_HOUR; h < BUSINESS.CLOSE_HOUR; h++) maxF = Math.max(maxF, hourFactor(b.type, h));
  for (let h = BUSINESS.OPEN_HOUR; h < BUSINESS.CLOSE_HOUR; h++) dem[h] = maxF ? (peak * hourFactor(b.type, h)) / maxF : peak;
  const rate = (e: Employee) => employeeRate(e, b);
  const cover = covers(b, dem, rate, shiftsFor(s, b).plan.byRole);
  const staffLost = m.lostStaff ?? 0;
  const shortRoles = cover.filter((x) => x.n > 0 && x.short.hours.length);
  if (b.staff.length && missing.length && (lost >= 3 || !hasManager(b))) {
    out.push({ kind: 'short', text: `Persi ${lost} clienti questa settimana (${pct}): manca il reparto ${missing.map(name).join(' e ')}. Assumi almeno un ${missing.map(name).join(' e un ')}`, tab: 'personale' });
  } else if (b.staff.length && shortRoles.length) {
    const list = shortRoles.map((x) => `${x.hire} ${x.hire === 1 ? name(x.r) : plural(x.r)}`).join(' e ');
    const where = shortRoles.map((x) => `i ${plural(x.r)} non bastano ${x.short.ranges.length > 1 ? 'nelle ore' : 'nell\'ora'} ${x.short.ranges.join(', ')}`).join('; ');
    out.push({ kind: 'short', text: `${staffLost ? `Persi ${staffLost} clienti questa settimana perché il personale non basta. ` : ''}Con i turni (massimo ${SHIFT_HOURS} ore a testa, anche divise in due) ${where} (nell'ora di punta arrivano circa ${fmtRate(peak)} clienti). Assumi circa ${list} in più: il manager li mette nei turni dove servono`, tab: 'personale' });
  } else if (unknown >= 3 && b.staff.length) {
    out.push({ kind: 'info', text: `Persi ${unknown} clienti prima che il gioco registrasse il motivo. Con il personale e i turni di adesso tutta la giornata è coperta: dai prossimi giorni il resoconto ti dirà se se ne perdono ancora e perché` });
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
    const extra = cover.reduce((a, x) => a + x.excess, 0);
    const salary = cover.reduce((a, x) => a + x.excessSalary, 0);
    // per mansione, con i nomi: "1 cuoco (Anna) e 2 cassieri (Bruno, Carla)"
    const who = cover.filter((x) => x.excess).map((x) => `${x.excess} ${x.excess === 1 ? name(x.r) : plural(x.r)} (${x.excessEmps.map((e) => e.name.split(' ')[0]).join(', ')})`).join(' e ');
    if (extra > 0) out.push({ kind: 'excess', text: `Costi alti: ${extra === 1 ? 'c\'è' : 'ci sono'} ${who} di troppo: in nessuna ora del ${extra === 1 ? 'suo turno' : 'loro turno'} servono, nemmeno nelle ore di punta (${euro(salary)} di stipendi al mese che si potrebbero risparmiare)`, tab: 'personale' });
  }
  return out;
}
