import { CRISIS } from '../config/balance';
import { bizType } from '../config/business';
import { VEHICLES } from '../config/vehicles';
import { bus, toast } from './bus';
import { lotDef, sellValue } from './economy';
import { addNews } from './news';
import { euro, type Business, type GameState } from './state';

/**
 * Attività in crisi e fallimento, pignoramento (GDD §"Crisi"). A fine mese ogni attività chiude in guadagno o in
 * perdita (`Business.lastProfit`, lo calcola payMonth): mesi di fila in perdita → avviso, crisi (dimissioni,
 * fama), debiti (merce più cara, nessuno rimpiazza chi se ne va), fallimento (chiude da sola). Un mese in
 * guadagno riporta tutto a zero. Conto sotto zero per troppo tempo → pignoramento.
 */

/** stato di un'attività per i mesi di fila in perdita */
export type BizHealth = 'ok' | 'perdita' | 'crisi' | 'debiti';

export const bizHealth = (b: Business): BizHealth => {
  const r = b.redMonths ?? 0;
  return r >= 3 ? 'debiti' : r === 2 ? 'crisi' : r === 1 ? 'perdita' : 'ok';
};

export const HEALTH_TAG: Record<BizHealth, string> = { ok: '', perdita: '⚠️ In perdita', crisi: '🟠 In crisi', debiti: '🔴 Debiti' };

export { addNews };

const bizName = (b: Business) => `${bizType(b.type).icon} ${bizType(b.type).name} in ${lotDef(b.lotId).name}`;

/** fama tolta ai settori dell'attività (una parte, es. 0.1 = 10%) */
function hitFame(s: GameState, b: Business, share: number) {
  for (const k of bizType(b.type).skills) s.fame[k] *= 1 - share;
}

/** un dipendente se ne va (mai il manager) */
function quit(b: Business) {
  const list = b.staff.filter((e) => e.role !== 'manager');
  if (!list.length) return null;
  const e = list[Math.floor(Math.random() * list.length)];
  b.staff = b.staff.filter((x) => x !== e);
  return e;
}

/** chiude l'attività fallita: il posto torna libero, attrezzatura e merce perse */
function fail(s: GameState, b: Business) {
  hitFame(s, b, CRISIS.FAIL_FAME);
  s.businesses = s.businesses.filter((x) => x !== b);
  for (const g of s.chainGroups ?? []) g.bizIds = g.bizIds.filter((id) => id !== b.id);
  addNews(s, { icon: '💥', kind: 'bad', text: `${bizName(b)} è fallita dopo ${CRISIS.FAIL_MONTHS} mesi in perdita: chiusa, posto perso`, cat: 'attivita', go: 'agency:mie' });
  toast(`💥 ${bizType(b.type).name} è fallita: chiusa`, 'bad');
  bus.emit('lots', b.lotId);
}

/** Fine mese (dopo payMonth): mesi in perdita, crisi, debiti, fallimenti. */
export function monthEnd(s: GameState) {
  for (const b of [...s.businesses]) {
    const red = (b.lastProfit ?? 0) < 0 ? (b.redMonths ?? 0) + 1 : 0;
    b.redMonths = red;
    if (!red) continue;
    const loss = euro(-(b.lastProfit ?? 0));
    if (red >= CRISIS.FAIL_MONTHS) fail(s, b);
    else if (red === 1) addNews(s, { icon: '⚠️', kind: 'warn', text: `${bizName(b)}: mese in perdita (−${loss}). Altri 3 di fila e fallisce`, biz: b.id, cat: 'attivita', go: `report:${b.id}`, todo: 'crisis' });
    else {
      // crisi e debiti: qualcuno se ne va, la fama cala
      const e = quit(b);
      hitFame(s, b, CRISIS.CRISIS_FAME);
      const who = e ? ` ${e.name.split(' ')[0]} ha lasciato il lavoro.` : '';
      addNews(s, red === 2
        ? { icon: '🟠', kind: 'bad', text: `${bizName(b)} è in crisi (−${loss}).${who} Torna in guadagno o tra 2 mesi fallisce`, biz: b.id, cat: 'attivita', go: `report:${b.id}`, todo: 'crisis' }
        : { icon: '🔴', kind: 'bad', text: `${bizName(b)} ha debiti (−${loss}): merce più cara, nessuno rimpiazza chi se ne va.${who} Ultimo mese`, biz: b.id, cat: 'attivita', go: `report:${b.id}`, todo: 'crisis' });
    }
  }
}

/** Ogni giorno: conto sotto zero da troppo → avvisi, poi pignoramento. */
export function checkDebt(s: GameState) {
  if (s.money >= 0) {
    s.negSince = undefined;
    s.negWarn = 0;
    return;
  }
  s.negSince ??= s.minutes;
  const days = (s.minutes - s.negSince) / 1440;
  const left = Math.ceil(CRISIS.SEIZE_DAYS - days);
  const warns = CRISIS.SEIZE_WARN_AT;
  if ((s.negWarn ?? 0) < warns.length && days >= warns[s.negWarn ?? 0]) {
    s.negWarn = (s.negWarn ?? 0) + 1;
    addNews(s, { icon: '📮', kind: 'bad', text: `Conto sotto zero (${euro(s.money)}): tra ${left} giorni arriva il pignoramento`, cat: 'soldi', go: 'agency:resoconti', todo: 'debt' });
    toast(`📮 Conto sotto zero: pignoramento tra ${left} giorni`, 'bad');
  }
  if (days >= CRISIS.SEIZE_DAYS) seize(s);
}

/** Pignoramento: si vendono veicoli e attività che guadagnano meno, a metà valore, finché il conto torna pari. */
function seize(s: GameState) {
  const sold: string[] = [];
  for (const v of [...s.vehicles]) {
    if (s.money >= 0) break;
    const val = Math.round(VEHICLES[v].price * CRISIS.SEIZE_SHARE);
    s.money += val;
    s.vehicles = s.vehicles.filter((x) => x !== v);
    if (s.riding === v) s.riding = null;
    sold.push(`${VEHICLES[v].icon} ${VEHICLES[v].name} (${euro(val)})`);
  }
  const byProfit = [...s.businesses].sort((a, b) => (a.lastProfit ?? 0) - (b.lastProfit ?? 0));
  for (const b of byProfit) {
    if (s.money >= 0) break;
    const val = Math.round(sellValue(b).total * CRISIS.SEIZE_SHARE);
    s.money += val;
    s.businesses = s.businesses.filter((x) => x !== b);
    for (const g of s.chainGroups ?? []) g.bizIds = g.bizIds.filter((id) => id !== b.id);
    sold.push(`${bizType(b.type).icon} ${bizType(b.type).name} (${euro(val)})`);
    bus.emit('lots', b.lotId);
  }
  for (const k of Object.keys(s.fame) as (keyof typeof s.fame)[]) s.fame[k] *= 1 - CRISIS.SEIZE_FAME;
  s.negSince = s.money < 0 ? s.minutes : undefined;
  s.negWarn = 0;
  addNews(s, { icon: '⚖️', kind: 'bad', text: sold.length ? `Pignoramento: venduti ${sold.join(', ')}` : 'Pignoramento: non c\'era niente da vendere', cat: 'soldi', go: 'agency:resoconti' });
  toast('⚖️ Pignoramento: venduti beni per coprire i debiti', 'bad');
}
