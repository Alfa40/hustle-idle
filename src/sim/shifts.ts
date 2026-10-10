import { BUSINESS } from '../config/balance';
import { bizType, hourFactor, type Role } from '../config/business';
import type { Business, Employee } from './state';

/**
 * Turni: le attività sono aperte dalle 8 alle 22 (14 ore) e ogni dipendente lavora al massimo 8 ore.
 * Il manager organizza i turni di ogni reparto: prima copre tutte le ore di apertura, poi mette più
 * persone nelle ore di punta e meno nelle ore morte. In ogni ora lavora solo chi è di turno.
 */
export const SHIFT_HOURS = 8;
const OPEN = BUSINESS.OPEN_HOUR;
const CLOSE = BUSINESS.CLOSE_HOUR;

/** Andamento atteso dei clienti ora per ora (indice = ora) per una domanda media `perHour`. */
export function demandCurve(type: Business['type'], perHour: number) {
  const out = Array(24).fill(0);
  for (let h = OPEN; h < CLOSE; h++) out[h] = perHour * hourFactor(type, h);
  return out;
}

export interface Shift {
  emp: Employee;
  start: number;
  end: number;
}

/**
 * Turni di un reparto: a ogni dipendente (dal più veloce) l'orario di 8 ore che serve di più. Conta
 * molto coprire le ore ancora scoperte, poi le ore in cui i clienti superano chi è già di turno.
 */
export function planRole(emps: Employee[], rate: (e: Employee) => number, demand: number[]) {
  const cap = Array(24).fill(0);
  const out: Shift[] = [];
  const list = [...emps].sort((a, b) => rate(b) - rate(a));
  // prima si copre tutta la giornata (dall'apertura alla chiusura) con turni distanziati, se le persone
  // bastano: es. 14 ore → 8–16 e 14–22; poi gli altri vanno dove servono di più (ore di punta)
  const span = CLOSE - OPEN;
  const need = Math.ceil(span / SHIFT_HOURS);
  if (list.length >= need && need > 1) {
    for (let i = 0; i < need; i++) {
      const e = list.shift()!;
      const start = Math.round(OPEN + (i * (span - SHIFT_HOURS)) / (need - 1));
      for (let h = start; h < start + SHIFT_HOURS; h++) cap[h] += rate(e);
      out.push({ emp: e, start, end: start + SHIFT_HOURS });
    }
  }
  for (const e of list) {
    const r = rate(e);
    let best = OPEN;
    let bestScore = -1;
    for (let s = OPEN; s <= CLOSE - SHIFT_HOURS; s++) {
      let score = 0;
      for (let h = s; h < s + SHIFT_HOURS; h++) {
        if (cap[h] === 0) score += 1000;
        score += Math.min(r, Math.max(0, demand[h] * 1.1 - cap[h]));
        // a parità (personale in più), il turno va dove arrivano più clienti
        score += demand[h] * 0.01;
      }
      if (score > bestScore + 1e-6) {
        bestScore = score;
        best = s;
      }
    }
    for (let h = best; h < best + SHIFT_HOURS; h++) cap[h] += r;
    out.push({ emp: e, start: best, end: best + SHIFT_HOURS });
  }
  return { shifts: out, cap };
}

/** Turni di tutta l'attività (tutti i reparti, compresi manager e ruoli extra) e capacità ora per ora. */
export function planShifts(b: Business, rate: (e: Employee) => number, demand: number[]) {
  const roles = [...new Set(b.staff.map((e) => e.role))] as Role[];
  const byRole = new Map<Role, { shifts: Shift[]; cap: number[] }>();
  for (const r of roles) byRole.set(r, planRole(b.staff.filter((e) => e.role === r), rate, demand));
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
