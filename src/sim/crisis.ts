import { CRISIS } from '../config/balance';
import { bizType } from '../config/business';
import { bus, toast } from './bus';
import { lotDef } from './economy';
import { addNews } from './news';
import { day, dayOfMonth, euro, type Business, type GameState } from './state';
import { TIME } from '../config/balance';
import { totalFame } from './progress';

/**
 * Attività in crisi e fallimento, bancarotta del giocatore (GDD §"Crisi"). A fine mese ogni attività chiude in
 * guadagno o in perdita (`Business.lastProfit`, lo calcola payMonth): 1 mese in perdita → in crisi (avviso, fama),
 * 2 di fila → fallisce e chiude da sola. Un mese in guadagno riporta tutto a zero.
 * Giocatore: chi **inizia un mese col conto sotto zero** (dopo i pagamenti di fine mese) e non torna sopra zero
 * prima della fine di quel mese va in **bancarotta**: la partita è persa (`GameState.bankrupt`).
 */

/** stato di un'attività per i mesi di fila in perdita (al secondo fallisce) */
export type BizHealth = 'ok' | 'crisi';

export const bizHealth = (b: Business): BizHealth => ((b.redMonths ?? 0) >= 1 ? 'crisi' : 'ok');

export const HEALTH_TAG: Record<BizHealth, string> = { ok: '', crisi: '🟠 In crisi' };

export { addNews };

const bizName = (b: Business) => `${bizType(b.type).icon} ${bizType(b.type).name} in ${lotDef(b.lotId).name}`;

/** fama tolta ai settori dell'attività (una parte, es. 0.1 = 10%) */
function hitFame(s: GameState, b: Business, share: number) {
  for (const k of bizType(b.type).skills) s.fame[k] *= 1 - share;
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

/** Fine mese (dopo payMonth): mesi in perdita, crisi e fallimenti. */
export function monthEnd(s: GameState) {
  for (const b of [...s.businesses]) {
    const red = (b.lastProfit ?? 0) < 0 ? (b.redMonths ?? 0) + 1 : 0;
    b.redMonths = red;
    if (!red) continue;
    const loss = euro(-(b.lastProfit ?? 0));
    if (red >= CRISIS.FAIL_MONTHS) fail(s, b);
    else {
      hitFame(s, b, CRISIS.CRISIS_FAME);
      addNews(s, { icon: '🟠', kind: 'bad', text: `${bizName(b)} è in crisi: mese in perdita (−${loss}). Se anche questo mese chiude in perdita, fallisce`, biz: b.id, cat: 'attivita', go: `report:${b.id}`, todo: 'crisis' });
    }
  }
}

/** giorni che mancano alla fine del mese (il mese si chiude all'inizio del giorno 1 del mese dopo) */
const daysToMonthEnd = (s: GameState) => TIME.DAYS_PER_MONTH - dayOfMonth(day(s)) + 1;

/**
 * Inizio del mese, prima dei pagamenti: chi aveva iniziato il mese scorso in debito e non è rientrato va in
 * bancarotta. Restituisce true se la partita è persa.
 */
export function monthStart(s: GameState) {
  if (s.debtFrom !== undefined && s.money < 0) {
    goBankrupt(s);
    return true;
  }
  return false;
}

/** Dopo i pagamenti di fine mese: se il conto è sotto zero, il mese inizia in debito (va ripagato entro fine mese). */
export function afterPayments(s: GameState) {
  if (s.money >= 0) return;
  s.debtFrom = day(s);
  s.negWarn = 0;
  addNews(s, { icon: '📮', kind: 'bad', text: `Inizi il mese in debito (${euro(s.money)}): torna sopra zero entro fine mese o è bancarotta e perdi la partita`, cat: 'soldi', go: 'agency:resoconti', todo: 'debt' });
  toast(`📮 Sei in debito: rientra entro fine mese o perdi la partita`, 'bad');
}

/** Ogni giorno: rientrato dal debito? avvisi quando mancano 10, 5 e 1 giorni. */
export function checkDebt(s: GameState) {
  if (s.debtFrom === undefined) return;
  if (s.money >= 0) {
    s.debtFrom = undefined;
    s.negWarn = 0;
    addNews(s, { icon: '✅', kind: 'good', text: 'Debito saldato: niente più rischio di bancarotta', cat: 'soldi' });
    return;
  }
  const left = daysToMonthEnd(s);
  const warns = CRISIS.DEBT_WARN_LEFT;
  const i = s.negWarn ?? 0;
  if (i < warns.length && left <= warns[i]) {
    s.negWarn = i + 1;
    addNews(s, { icon: '📮', kind: 'bad', text: `Ancora in debito (${euro(s.money)}): ${left === 1 ? 'ultimo giorno' : `${left} giorni`} per tornare sopra zero, poi è bancarotta`, cat: 'soldi', go: 'agency:resoconti', todo: 'debt' });
    toast(`📮 Debito: ${left === 1 ? 'ultimo giorno' : `${left} giorni`} per rientrare`, 'bad');
  }
}

/** Bancarotta: la partita è persa (resta il riepilogo; si ricomincia da capo). */
function goBankrupt(s: GameState) {
  s.bankrupt = { day: day(s), money: Math.round(s.money), businesses: s.businesses.length, fame: Math.round(totalFame(s)), earned: Math.round(s.totalEarned) };
  addNews(s, { icon: '💀', kind: 'bad', text: `Bancarotta: hai finito il mese ancora in debito (${euro(s.money)}). La partita è persa`, cat: 'soldi' });
  bus.emit('bankrupt');
}
