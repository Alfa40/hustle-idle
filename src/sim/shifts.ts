import { BUSINESS } from '../config/balance';
import { bizType, hourFactor, type Role } from '../config/business';
import type { Business, Employee } from './state';

/**
 * Turni: le attività sono aperte dalle 8 alle 22 (14 ore) e ogni dipendente lavora al massimo 8 ore,
 * tutte di fila o divise in due pezzi (es. 4 + 4, 6 + 2, con almeno un'ora di pausa in mezzo). Il manager
 * organizza i turni di ogni reparto: prima copre tutte le ore di apertura, poi mette più persone nelle ore
 * di punta e meno nelle ore morte. In ogni ora lavora solo chi è di turno.
 */
export const SHIFT_HOURS = 8;
/** pezzo di turno più corto (ore) */
const MIN_BLOCK = 2;
const OPEN = BUSINESS.OPEN_HOUR;
const CLOSE = BUSINESS.CLOSE_HOUR;

/** Andamento atteso dei clienti ora per ora (indice = ora) per una domanda media `perHour`. */
export function demandCurve(type: Business['type'], perHour: number) {
  const out = Array(24).fill(0);
  for (let h = OPEN; h < CLOSE; h++) out[h] = perHour * hourFactor(type, h);
  return out;
}

export interface Block {
  start: number;
  end: number;
}

export interface Shift {
  emp: Employee;
  /** uno o due pezzi di turno, in ordine */
  blocks: Block[];
  /** inizio del primo pezzo e fine dell'ultimo (per ordinare) */
  start: number;
  end: number;
}

/** "8–16" oppure "11–15 + 18–22" */
export const shiftText = (sh: { blocks: Block[] }) => sh.blocks.map((b) => `${b.start}–${b.end}`).join(' + ');
export const inShift = (sh: { blocks: Block[] }, h: number) => sh.blocks.some((b) => h >= b.start && h < b.end);

/** Tutti i turni possibili: 8 ore di fila, o due pezzi da almeno 2 ore con almeno un'ora di pausa. */
const PLANS: Block[][] = (() => {
  const out: Block[][] = [];
  for (let a = OPEN; a + SHIFT_HOURS <= CLOSE; a++) out.push([{ start: a, end: a + SHIFT_HOURS }]);
  for (let l1 = MIN_BLOCK; l1 <= SHIFT_HOURS - MIN_BLOCK; l1++) {
    const l2 = SHIFT_HOURS - l1;
    for (let a = OPEN; a + l1 < CLOSE; a++)
      for (let c = a + l1 + 1; c + l2 <= CLOSE; c++) out.push([{ start: a, end: a + l1 }, { start: c, end: c + l2 }]);
  }
  return out;
})();

const mkShift = (emp: Employee, blocks: Block[]): Shift => ({ emp, blocks, start: blocks[0].start, end: blocks[blocks.length - 1].end });

/**
 * Turni di un reparto: a ogni dipendente (dal più veloce) le 8 ore che servono di più, di fila o in due
 * pezzi. Conta molto coprire le ore ancora scoperte, poi le ore in cui i clienti superano chi è già di turno.
 */
export function planRole(emps: Employee[], rate: (e: Employee) => number, demand: number[]) {
  const cap = Array(24).fill(0);
  const out: Shift[] = [];
  const add = (e: Employee, blocks: Block[]) => {
    for (const b of blocks) for (let h = b.start; h < b.end; h++) cap[h] += rate(e);
    out.push(mkShift(e, blocks));
  };
  const list = [...emps].sort((a, b) => rate(b) - rate(a));
  // prima si copre tutta la giornata, se le persone bastano: uno dall'apertura per 8 ore, l'altro fino alla
  // chiusura e le ore che gli restano nel momento più pieno della mattina (es. 8–16 e 12–14 + 16–22)
  const span = CLOSE - OPEN;
  if (list.length >= 2 && span > SHIFT_HOURS && span <= 2 * SHIFT_HOURS) {
    const a = list.shift()!;
    add(a, [{ start: OPEN, end: OPEN + SHIFT_HOURS }]);
    const b = list.shift()!;
    const late = { start: OPEN + SHIFT_HOURS, end: CLOSE };
    const extra = SHIFT_HOURS - (CLOSE - late.start);
    if (extra >= MIN_BLOCK) {
      let best = OPEN;
      let bestD = -1;
      for (let st = OPEN; st + extra <= late.start - 1; st++) {
        let d = 0;
        for (let h = st; h < st + extra; h++) d += demand[h];
        if (d > bestD) {
          bestD = d;
          best = st;
        }
      }
      add(b, [{ start: best, end: best + extra }, late]);
    } else add(b, [{ start: CLOSE - SHIFT_HOURS, end: CLOSE }]);
  }
  for (const e of list) {
    const r = rate(e);
    let best = PLANS[0];
    let bestScore = -1;
    for (const plan of PLANS) {
      // a parità si preferisce il turno tutto di fila
      let score = plan.length > 1 ? -0.5 : 0;
      for (const b of plan)
        for (let h = b.start; h < b.end; h++) {
          if (cap[h] === 0) score += 1000;
          score += Math.min(r, Math.max(0, demand[h] * 1.1 - cap[h]));
          // a parità (personale in più), il turno va dove arrivano più clienti
          score += demand[h] * 0.01;
        }
      if (score > bestScore + 1e-6) {
        bestScore = score;
        best = plan;
      }
    }
    add(e, best);
  }
  return { shifts: out, cap };
}

/** Turni di tutta l'attività (tutti i reparti, compresi manager e ruoli extra) e capacità ora per ora. */
export function planShifts(b: Business, rate: (e: Employee) => number, demand: number[]) {
  // chi è al corso di formazione non è nei turni
  const staff = b.staff.filter((e) => !e.trainingEnd);
  const roles = [...new Set(staff.map((e) => e.role))] as Role[];
  const byRole = new Map<Role, { shifts: Shift[]; cap: number[] }>();
  for (const r of roles) byRole.set(r, planRole(staff.filter((e) => e.role === r), rate, demand));
  // capacità dell'attività in un'ora: il reparto più lento tra quelli che servono
  const need = bizType(b.type).roles;
  const capAt = (h: number) => (need.length ? Math.min(...need.map((r) => byRole.get(r)?.cap[h] ?? 0)) : 0);
  return { byRole, capAt };
}

/** Ore (tra apertura e chiusura) in cui la capacità `cap` non regge la domanda, raggruppate (es. "12–14"). */
export function shortRanges(cap: number[], demand: number[], tol = 0.97) {
  const hours: number[] = [];
  for (let h = OPEN; h < CLOSE; h++) if (cap[h] < demand[h] * tol) hours.push(h);
  const ranges: string[] = [];
  for (let i = 0; i < hours.length; i++) {
    let j = i;
    while (j + 1 < hours.length && hours[j + 1] === hours[j] + 1) j++;
    ranges.push(`${hours[i]}–${hours[j] + 1}`);
    i = j;
  }
  return { hours, ranges };
}
