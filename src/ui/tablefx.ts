/**
 * Cose in comune ai tavoli del casinò (poker e blackjack):
 * - `DealQueue`: le carte arrivano una alla volta, come da un mazziere vero (DEAL_MS tra una carta e l'altra; il server
 *   aspetta lo stesso tempo prima di far partire turni e mano dopo).
 * - fiches per puntare: ogni tocco su una fiche la aggiunge alla puntata (`chipsHtml`, `chipStackHtml`).
 */
import { euro } from '../sim/state';

/** tempo tra una carta e l'altra (uguale a DEAL_MS sul server) */
export const DEAL_MS = 450;
/** quanto dura l'animazione della carta che arriva */
const ANIM_MS = 400;
/** dopo l'ultima carta: un attimo per guardarla prima di mostrare com'è andata (vinto, perso, sballato) */
const SETTLE_MS = ANIM_MS + 650;

export class DealQueue {
  /** carte già sul tavolo: chiave → quando è arrivata (0 = c'era già, senza animazione) */
  private shown = new Map<string, number>();
  private queue: string[] = [];
  private timer = 0;
  private lastAt = 0;
  private settleTimer = 0;

  constructor(private onStep: () => void) {}

  /**
   * Le carte che ci sono adesso sul tavolo, nell'ordine in cui il mazziere le dà. Quelle nuove entrano in coda e
   * arrivano una alla volta; `instant` (prima volta che si vede il tavolo) le mette tutte subito.
   */
  sync(keys: string[], instant = false) {
    const cur = new Set(keys);
    for (const k of [...this.shown.keys()]) if (!cur.has(k)) this.shown.delete(k);
    this.queue = this.queue.filter((k) => cur.has(k));
    for (const k of keys) if (!this.shown.has(k) && !this.queue.includes(k)) this.queue.push(k);
    if (instant) {
      for (const k of this.queue) this.shown.set(k, 0);
      this.queue = [];
    }
    this.pump();
  }

  private pump() {
    if (this.timer || !this.queue.length) return;
    const step = () => {
      this.timer = 0;
      const k = this.queue.shift();
      if (k) {
        this.lastAt = performance.now();
        this.shown.set(k, this.lastAt);
      }
      this.onStep();
      this.pump();
      // ultima carta data: quando la si è vista si ridisegna (compare il risultato)
      if (!this.queue.length) this.settleTimer = window.setTimeout(this.onStep, SETTLE_MS + 20);
    };
    this.timer = window.setTimeout(step, Math.max(0, this.lastAt + DEAL_MS - performance.now()));
  }

  /** la carta è già arrivata sul tavolo */
  has(k: string) {
    return this.shown.has(k);
  }

  /** il mazziere sta ancora dando carte */
  get busy() {
    return this.queue.length > 0;
  }

  /** carte date e ultima carta già vista: si può mostrare il risultato della mano */
  get settled() {
    return !this.busy && performance.now() - this.lastAt >= SETTLE_MS;
  }

  /** da quanti ms è arrivata (per l'animazione); -1 se c'era già o non è ancora arrivata */
  age(k: string) {
    const t = this.shown.get(k);
    if (!t) return -1;
    const a = performance.now() - t;
    return a < ANIM_MS ? a : -1;
  }

  stop() {
    clearTimeout(this.settleTimer);
    clearTimeout(this.timer);
    this.timer = 0;
  }
}

// ---------------- fiches ----------------

/** tagli delle fiches del tavolo: 1, 5, 25, 100, 500 volte l'unità (puntata minima o grande buio), fino al massimo */
export function chipValues(unit: number, max: number) {
  const v = [1, 5, 25, 100, 500].map((x) => x * unit).filter((x) => x <= max);
  return v.length ? v : [unit];
}

/** cifra corta da scrivere sulla fiche (20, 1K, 2,5M…) */
export function chipLabel(n: number) {
  const f = (x: number, s: string) => `${(Math.round(x * 10) / 10).toLocaleString('it-IT')}${s}`;
  if (n >= 1e9) return f(n / 1e9, 'B');
  if (n >= 1e6) return f(n / 1e6, 'M');
  if (n >= 1e3) return f(n / 1e3, 'K');
  return String(n);
}

const CHIP_COLORS = ['#f4f1ea', '#e8463c', '#2fa866', '#3a2f55', '#8e5bd6'];
const chipColor = (v: number, unit: number) => CHIP_COLORS[Math.max(0, [1, 5, 25, 100, 500].indexOf(Math.round(v / unit)))] ?? CHIP_COLORS[0];

/** una fiche (cerchio con il bordo a tacche e la cifra) */
export function chipFace(v: number, unit: number, size: 'sm' | 'lg' = 'lg', label = true) {
  const c = chipColor(v, unit);
  const light = c === CHIP_COLORS[0];
  return `<span class="tchip ${size}" style="--cc:${c};--ct:${light ? '#3a2f55' : '#fff'}">${label ? `<b>${chipLabel(v)}</b>` : ''}</span>`;
}

/** le fiches da toccare: `data-p="chip:<valore>"`; quelle che non ci stanno più (oltre il massimo) sono spente */
export function chipsHtml(unit: number, max: number, left: number, disabled = false) {
  return `<div class="tchips">${chipValues(unit, max).map((v) => `<button class="tchip-btn" data-p="chip:${v}" ${disabled || v > left ? 'disabled' : ''} aria-label="Fiche da ${euro(v)}">${chipFace(v, unit)}</button>`).join('')}</div>`;
}

/** la pila delle fiches puntate (le ultime toccate, una sopra l'altra) con la cifra */
export function chipStackHtml(stack: number[], unit: number, total: number) {
  if (!total) return '<div class="tstack empty"><span>Tocca le fiches per puntare</span></div>';
  const show = stack.slice(-4);
  return `<div class="tstack"><div class="tstack-pile">${show.map((v, i) => `<i style="bottom:${i * 4}px">${chipFace(v, unit, 'sm', i === show.length - 1)}</i>`).join('')}</div><b>${euro(total)}</b></div>`;
}
