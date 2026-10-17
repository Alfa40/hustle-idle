import { Station } from './station';

/**
 * Minigiochi col dito della cucina (si aprono toccando una postazione, vedi Station): la piastra degli
 * hamburger e il bancone dove si compone il panino come sulla comanda, con la salsa a zig-zag.
 */

type Pt = { x: number; y: number };

/** Qualità di una cottura: crudo prima di 1, perfetto tra 1 e 1,4, poi bruciato. */
export const cookQuality = (k: number) => (k < 0.8 ? 0.2 : k < 1 ? 0.6 : k <= 1.4 ? 1 : k <= 1.7 ? 0.5 : 0.1);

/** Colore della carne: cruda (rosa) → cotta (marrone) → bruciata (nera). */
function meatColor(k: number) {
  const mix = (a: number[], b: number[], f: number) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, f))));
  const raw = [214, 92, 110];
  const cooked = [132, 74, 44];
  const burnt = [40, 26, 20];
  const c = k < 1 ? mix(raw, cooked, k) : k <= 1.4 ? cooked : mix(cooked, burnt, (k - 1.4) / 0.5);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const inRect = (p: Pt, x0: number, y0: number, x1: number, y1: number) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;

// ======================================================================================
// Piastra: trascina la carne, girala, toglila quando è cotta
// ======================================================================================

/**
 * Piastra vista dall'alto: la carne cruda è nel vassoio; la trascini sulla piastra e cuoce il lato di sotto
 * (la barra sopra dice quanto: verde = pronto). Toccandola la giri; quando anche l'altro lato è verde la
 * trascini sul panino nel piatto. Toglierla cruda o lasciarla bruciare si può, ma conta alla fine.
 */
export class GrillStation extends Station {
  private p: Pt = { x: 0.8, y: 0.82 };
  private where: 'tray' | 'grill' | 'hand' = 'tray';
  /** cottura dei due lati: `side` è quello sulla piastra */
  private k = [0, 0];
  private side = 0;
  private flip = 0;
  private grab: Pt | null = null;
  private moved = 0;
  private from: 'tray' | 'grill' = 'tray';
  private sizzle: { x: number; y: number; life: number; smoke: boolean }[] = [];
  private finished = -1;

  constructor(private cookT: number, onEnd: (q: number) => void) {
    super(onEnd);
  }

  private sq() {
    return this.square(70, 34);
  }

  private rel(x: number, y: number): Pt {
    const s = this.sq();
    return { x: (x - s.x) / s.s, y: (y - s.y) / s.s };
  }

  protected down(x: number, y: number) {
    if (this.finished >= 0) return;
    const q = this.rel(x, y);
    // la carne si prende col dito (un po' di margine)
    if (Math.hypot(q.x - this.p.x, q.y - this.p.y) > 0.15) return;
    this.grab = { x: this.p.x - q.x, y: this.p.y - q.y };
    this.from = this.where === 'hand' ? 'grill' : this.where;
    this.where = 'hand';
    this.moved = 0;
  }

  protected move(x: number, y: number) {
    if (!this.grab) return;
    const q = this.rel(x, y);
    const n = { x: Math.max(0.05, Math.min(0.95, q.x + this.grab.x)), y: Math.max(0.05, Math.min(0.97, q.y + this.grab.y)) };
    this.moved += Math.hypot(n.x - this.p.x, n.y - this.p.y);
    this.p = n;
  }

  protected up() {
    if (!this.grab) return;
    this.grab = null;
    // un tocco sulla carne in cottura: si gira
    if (this.from === 'grill' && this.moved < 0.03) {
      this.where = 'grill';
      this.side = 1 - this.side;
      this.flip = 1;
      return;
    }
    if (inRect(this.p, 0.06, 0.15, 0.6, 0.75)) {
      this.where = 'grill';
      return;
    }
    // sul panino: fatto (anche se è cruda: si paga alla fine)
    if (this.from === 'grill' && Math.hypot(this.p.x - 0.8, this.p.y - 0.42) < 0.17) {
      this.p = { x: 0.8, y: 0.42 };
      this.where = 'tray';
      this.finished = 0;
      return;
    }
    // altrove: torna dov'era
    if (this.from === 'tray') this.p = { x: 0.8, y: 0.82 };
    else this.p = { x: Math.max(0.16, Math.min(0.5, this.p.x)), y: Math.max(0.25, Math.min(0.65, this.p.y)) };
    this.where = this.from;
  }

  step(dt: number) {
    const g = this.g;
    const { w, h } = this;
    const sq = this.sq();
    const P = (u: number, v: number) => [sq.x + u * sq.s, sq.y + v * sq.s] as const;
    const S = sq.s;
    if (this.where === 'grill' && this.finished < 0) {
      this.k[this.side] += dt / this.cookT;
      const kk = this.k[this.side];
      if (Math.random() < dt * (kk > 1.4 ? 10 : 18)) this.sizzle.push({ x: this.p.x + (Math.random() - 0.5) * 0.2, y: this.p.y + (Math.random() - 0.5) * 0.12, life: 0.7, smoke: kk > 1.4 });
    }
    this.flip = Math.max(0, this.flip - dt * 4);
    if (this.finished >= 0) {
      this.finished += dt;
      if (this.finished > 0.6) {
        this.end((cookQuality(this.k[0]) + cookQuality(this.k[1])) / 2);
        return;
      }
    }
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text('🔥 Piastra', w / 2, 24, 20);
    const kd = this.k[this.side];
    const flips = this.k[1 - this.side] >= 1;
    const hint =
      this.where === 'tray' && this.finished < 0 ? 'trascina la carne sulla piastra'
      : kd < 1 ? 'aspetta che la barra diventi verde'
      : kd <= 1.4 && !flips ? 'verde! tocca la carne per girarla'
      : kd <= 1.4 ? 'cotta! trascinala sul panino'
      : 'si brucia! toglila subito';
    this.text(hint, w / 2, 48, 13, kd > 1.4 ? '#e5484d' : '#7a6f8f', 500);
    // piastra con le righe
    const [gx, gy] = P(0.06, 0.15);
    g.fillStyle = '#3b3f46';
    g.beginPath();
    g.roundRect(gx, gy, 0.54 * S, 0.6 * S, 12);
    g.fill();
    g.strokeStyle = '#52575f';
    g.lineWidth = 3;
    for (let i = 1; i < 8; i++) {
      g.beginPath();
      g.moveTo(gx + 8, gy + (i * 0.6 * S) / 8);
      g.lineTo(gx + 0.54 * S - 8, gy + (i * 0.6 * S) / 8);
      g.stroke();
    }
    // piatto col panino aperto
    const [px, py] = P(0.8, 0.42);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(px, py, 0.16 * S, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#e3ddd2';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#e7a956';
    g.beginPath();
    g.arc(px, py, 0.12 * S, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f3cf8e';
    g.beginPath();
    g.arc(px, py, 0.1 * S, 0, Math.PI * 2);
    g.fill();
    this.text('🍞 panino', px, py + 0.2 * S, 12, '#7a6f8f', 600);
    // vassoio della carne cruda
    const [tx, ty] = P(0.66, 0.7);
    g.fillStyle = '#c9d0d8';
    g.beginPath();
    g.roundRect(tx, ty, 0.28 * S, 0.24 * S, 10);
    g.fill();
    // sfrigolio e fumo
    this.sizzle = this.sizzle.filter((s) => (s.life -= dt) > 0);
    for (const s of this.sizzle) {
      s.y -= dt * (s.smoke ? 0.12 : 0.05);
      const [sx, sy] = P(s.x, s.y);
      g.fillStyle = s.smoke ? `rgba(60,60,60,${s.life * 0.5})` : `rgba(255,255,255,${s.life})`;
      g.beginPath();
      g.arc(sx, sy, s.smoke ? 9 : 2.5, 0, Math.PI * 2);
      g.fill();
    }
    // la carne: si vede il lato di sopra; girandola si schiaccia un attimo
    const [cx, cy] = P(this.p.x, this.p.y);
    const up = this.k[1 - this.side];
    const r = 0.1 * S;
    g.save();
    g.translate(cx, cy);
    g.scale(1, 1 - 0.7 * Math.sin(this.flip * Math.PI));
    if (this.where === 'hand') g.scale(1.08, 1.08);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath();
    g.ellipse(3, 5, r, r * 0.92, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = meatColor(up);
    g.beginPath();
    g.ellipse(0, 0, r, r * 0.92, 0, 0, Math.PI * 2);
    g.fill();
    // il bordo fa vedere com'è il lato di sotto
    g.strokeStyle = meatColor(kd);
    g.lineWidth = 4;
    g.stroke();
    // segni della griglia sul lato già cotto
    if (up >= 0.8) {
      g.strokeStyle = 'rgba(30,15,10,.55)';
      g.lineWidth = 3;
      for (const o of [-0.4, 0, 0.4]) {
        g.beginPath();
        g.moveTo(-r * 0.7, o * r - r * 0.25);
        g.lineTo(r * 0.7, o * r + r * 0.25);
        g.stroke();
      }
    }
    g.restore();
    // barra di cottura del lato di sotto, sopra la carne
    if (this.where !== 'tray' || this.finished >= 0) {
      const bw = 0.26 * S;
      const bx = cx - bw / 2;
      const by = cy - r - 22;
      g.fillStyle = 'rgba(255,255,255,.95)';
      g.beginPath();
      g.roundRect(bx - 4, by - 4, bw + 8, 16, 8);
      g.fill();
      g.fillStyle = '#ddd';
      g.fillRect(bx, by, bw, 8);
      g.fillStyle = 'rgba(53,196,106,.5)';
      g.fillRect(bx + (bw * 1) / 1.9, by, (bw * 0.4) / 1.9, 8);
      g.fillStyle = kd < 1 ? '#ffc21a' : kd <= 1.4 ? '#35c46a' : '#e5484d';
      g.fillRect(bx, by, Math.min(bw, (bw * kd) / 1.9), 8);
    }
    if (this.where === 'tray' && this.finished < 0) {
      const pulse = 1 + 0.15 * Math.sin(performance.now() / 160);
      g.strokeStyle = '#ffc21a';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy, r * 1.25 * pulse, 0, Math.PI * 2);
      g.stroke();
    }
    this.text(`lato 1 ${this.word(this.k[0])} · lato 2 ${this.word(this.k[1])}`, w / 2, h - 34, 13, '#7a6f8f', 500);
    this.bar(Math.min(1, (Math.min(1, this.k[0]) + Math.min(1, this.k[1])) / 2));
  }

  private word(k: number) {
    return k < 0.05 ? '⬜' : k < 1 ? '🟨' : k <= 1.4 ? '✅' : '🔥';
  }
}

// ======================================================================================
// Bancone: componi il panino come sulla comanda, salsa a zig-zag
// ======================================================================================

/** Cosa si può mettere nel panino: icona, nome, colore e spessore dello strato (frazione del riquadro). */
export const TOPPINGS = {
  insalata: { icon: '🥬', name: 'insalata', color: '#5cb85c', h: 0.035 },
  pomodoro: { icon: '🍅', name: 'pomodoro', color: '#e0402f', h: 0.03 },
  formaggio: { icon: '🧀', name: 'formaggio', color: '#f5c542', h: 0.022 },
  cipolla: { icon: '🧅', name: 'cipolla', color: '#c16a9a', h: 0.025 },
  bacon: { icon: '🥓', name: 'bacon', color: '#b5523b', h: 0.025 },
  cetriolini: { icon: '🥒', name: 'cetriolini', color: '#6c9a3c', h: 0.022 },
} as const;
export type Topping = keyof typeof TOPPINGS;
export const SAUCES = {
  ketchup: { icon: '🍅', name: 'ketchup', color: '#d7261e' },
  maionese: { icon: '🥚', name: 'maionese', color: '#f7ecc0' },
  senape: { icon: '🌭', name: 'senape', color: '#e8b80c' },
} as const;
export type Sauce = keyof typeof SAUCES;
/** Un passo della comanda: un ingrediente, una salsa o il panino sopra. */
export type Step = { t: 'top'; k: Topping } | { t: 'sauce'; k: Sauce } | { t: 'bun' };

const stepIcon = (s: Step) => (s.t === 'top' ? TOPPINGS[s.k].icon : s.t === 'sauce' ? '🧴' : '🍞');
const stepName = (s: Step) => (s.t === 'top' ? TOPPINGS[s.k].name : s.t === 'sauce' ? SAUCES[s.k].name : 'panino sopra');
const same = (a: Step, b: Step) => a.t === b.t && (a.t === 'bun' || (a as { k: string }).k === (b as { k: string }).k);

/**
 * Componi il panino: lo scontrino dice cosa mettere e in che ordine. Tocchi le vaschette in basso e
 * l'ingrediente cade sul panino; per la salsa prendi la bottiglia e passala a zig-zag sopra il panino (deve
 * coprirlo da un lato all'altro, senza sporcare fuori). L'ingrediente sbagliato si può mettere, ma conta.
 */
export class BurgerStation extends Station {
  private layers: { s: Step; drop: number; sauce?: Pt[] }[] = [];
  private idx = 0;
  private marks: boolean[] = [];
  private bottle: { k: Sauce; x: number; y: number; ox: number; oy: number } | null = null;
  private cols = new Set<number>();
  private spill = 0;
  private sauceQ: number[] = [];
  private finished = -1;
  private readonly tops: Topping[];

  constructor(private steps: Step[], private pattyQ: number, onEnd: (q: number) => void) {
    super(onEnd);
    this.tops = Object.keys(TOPPINGS) as Topping[];
  }

  private sq() {
    return this.square(70, 34);
  }

  /** vaschette in basso: gli ingredienti e il panino sopra */
  private trays() {
    const items: Step[] = [...this.tops.map((k): Step => ({ t: 'top', k })), { t: 'bun' }];
    const n = items.length;
    return items.map((s, i) => ({ s, x0: 0.02 + (i * 0.96) / n, x1: 0.02 + ((i + 1) * 0.96) / n - 0.012, y0: 0.84, y1: 0.99 }));
  }

  /** bottiglie delle salse, sotto lo scontrino */
  private bottles() {
    return (Object.keys(SAUCES) as Sauce[]).map((k, i) => ({ k, x: 0.69 + i * 0.12, y: 0.62 }));
  }

  /** altezza della cima del panino (0–1) */
  private topY() {
    let y = 0.74 - 0.05 - 0.06;
    for (const l of this.layers) y -= l.s.t === 'top' ? TOPPINGS[l.s.k].h : l.s.t === 'bun' ? 0.1 : 0;
    return y;
  }

  private rel(x: number, y: number): Pt {
    const s = this.sq();
    return { x: (x - s.x) / s.s, y: (y - s.y) / s.s };
  }

  private add(s: Step) {
    const want = this.steps[this.idx];
    this.marks.push(!!want && same(want, s));
    this.idx++;
    if (this.idx >= this.steps.length) this.finished = 0;
  }

  /** salsa che si sta mettendo (si può ripassare con la stessa bottiglia finché non copre il panino) */
  private open: { layer: { s: Step; drop: number; sauce?: Pt[] }; k: Sauce } | null = null;

  /** la salsa iniziata conta come fatta, com'è venuta */
  private commitSauce() {
    if (!this.open) return;
    const cover = this.cols.size / 10;
    this.sauceQ.push(Math.max(0.3, Math.min(1, cover / 0.9) - Math.min(0.4, this.spill * 0.01)));
    this.add(this.open.layer.s);
    this.open = null;
  }

  protected down(x: number, y: number) {
    if (this.finished >= 0 || this.idx >= this.steps.length) return;
    const p = this.rel(x, y);
    // una bottiglia: si prende e si porta sul panino
    for (const b of this.bottles()) {
      if (Math.abs(p.x - b.x) < 0.06 && Math.abs(p.y - b.y) < 0.12) {
        this.bottle = { k: b.k, x: b.x, y: b.y, ox: b.x - p.x, oy: b.y - p.y };
        if (this.open && this.open.k !== b.k) this.commitSauce();
        if (this.idx >= this.steps.length) return;
        if (!this.open) {
          const layer = { s: { t: 'sauce', k: b.k } as Step, drop: 0, sauce: [] as Pt[] };
          this.layers.push(layer);
          this.open = { layer, k: b.k };
          this.cols.clear();
          this.spill = 0;
        }
        return;
      }
    }
    for (const t of this.trays()) {
      if (inRect(p, t.x0, t.y0 - 0.02, t.x1, t.y1 + 0.02)) {
        this.commitSauce();
        if (this.idx >= this.steps.length) return;
        this.layers.push({ s: t.s, drop: 1 });
        this.add(t.s);
        return;
      }
    }
  }

  protected move(x: number, y: number) {
    const b = this.bottle;
    if (!b || !this.open) return;
    const p = this.rel(x, y);
    b.x = p.x + b.ox;
    b.y = p.y + b.oy;
    // la salsa esce dal beccuccio, sotto la bottiglia
    const tip = { x: b.x, y: b.y + 0.12 };
    const top = this.topY();
    if (Math.abs(tip.y - top) < 0.07 && tip.x > 0.08 && tip.x < 0.58) {
      this.open.layer.sauce!.push({ x: tip.x, y: top + (tip.y - top) * 0.6 });
      this.cols.add(Math.floor(((tip.x - 0.08) / 0.5) * 10));
    } else if (tip.y > top - 0.07 && tip.y < 0.8 && (tip.x < 0.06 || tip.x > 0.6)) this.spill++;
  }

  protected up() {
    if (!this.bottle) return;
    this.bottle = null;
    const o = this.open;
    if (!o) return;
    if (!o.layer.sauce!.length) {
      // non è uscita salsa: niente fatto
      this.layers.splice(this.layers.indexOf(o.layer), 1);
      this.open = null;
      return;
    }
    if (this.cols.size / 10 >= 0.7) this.commitSauce();
  }

  step(dt: number) {
    const g = this.g;
    const { w, h } = this;
    const sq = this.sq();
    const S = sq.s;
    const P = (u: number, v: number) => [sq.x + u * S, sq.y + v * S] as const;
    if (this.finished >= 0) {
      this.finished += dt;
      if (this.finished > 0.7) {
        const ok = this.marks.filter(Boolean).length / Math.max(1, this.steps.length);
        const sq2 = this.sauceQ.length ? this.sauceQ.reduce((a, b) => a + b, 0) / this.sauceQ.length : 1;
        this.end(0.15 + 0.85 * ok * (0.7 + 0.3 * sq2) * (0.6 + 0.4 * this.pattyQ));
        return;
      }
    }
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text('🍔 Componi il panino', w / 2, 24, 20);
    const want = this.steps[this.idx];
    this.text(!want ? 'pronto!' : want.t === 'sauce' ? `prendi la bottiglia: ${SAUCES[want.k].name}, passala a zig-zag` : 'tocca la vaschetta giusta, come sullo scontrino', w / 2, 48, 13, '#7a6f8f', 500);
    // tagliere
    const [bx, by] = P(0.02, 0.08);
    g.fillStyle = '#efe6d6';
    g.beginPath();
    g.roundRect(bx, by, 0.6 * S, 0.72 * S, 16);
    g.fill();
    // panino: dal basso verso l'alto
    const cx = 0.33;
    const half = 0.25;
    let y = 0.74;
    const slab = (hh: number, color: string, round = 0.3, ww = half) => {
      const [x0, y0] = P(cx - ww, y - hh);
      g.fillStyle = color;
      g.beginPath();
      g.roundRect(x0, y0, ww * 2 * S, hh * S, hh * S * round);
      g.fill();
    };
    // fondo del panino e carne
    slab(0.05, '#e7a956', 0.4);
    y -= 0.05;
    slab(0.06, meatColor(this.pattyQ >= 0.85 ? 1.2 : this.pattyQ >= 0.5 ? 0.9 : 1.6), 0.45, half * 1.02);
    y -= 0.06;
    for (const l of this.layers) {
      l.drop = Math.max(0, l.drop - dt * 5);
      const off = l.drop * 0.25;
      y -= off;
      if (l.s.t === 'top') {
        const tp = TOPPINGS[l.s.k];
        const hh = tp.h;
        if (l.s.k === 'insalata') {
          // foglia ondulata, un po' più larga
          const [x0, y0] = P(cx - half * 1.08, y - hh);
          g.fillStyle = tp.color;
          g.beginPath();
          g.moveTo(x0, y0 + hh * S);
          for (let i = 0; i <= 12; i++) g.lineTo(x0 + (i / 12) * half * 2.16 * S, y0 + (i % 2 ? hh * S * 1.4 : 0));
          g.lineTo(x0 + half * 2.16 * S, y0 + hh * S);
          g.closePath();
          g.fill();
        } else if (l.s.k === 'pomodoro' || l.s.k === 'cetriolini' || l.s.k === 'cipolla') {
          // fette tonde una accanto all'altra
          const n = 4;
          for (let i = 0; i < n; i++) {
            const [ex, ey] = P(cx - half + ((i + 0.5) * half * 2) / n, y - hh / 2);
            g.fillStyle = tp.color;
            g.beginPath();
            g.ellipse(ex, ey, (half / n) * S * 1.05, (hh / 2) * S * 1.1, 0, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = 'rgba(255,255,255,.35)';
            g.beginPath();
            g.ellipse(ex, ey, (half / n) * S * 0.55, (hh / 2) * S * 0.45, 0, 0, Math.PI * 2);
            g.fill();
          }
        } else if (l.s.k === 'formaggio') {
          slab(hh, tp.color, 0.1, half * 1.04);
          // gocce di formaggio che colano
          g.fillStyle = tp.color;
          for (const u of [-0.8, 0.85]) {
            const [dx, dy] = P(cx + u * half, y);
            g.beginPath();
            g.moveTo(dx - 6, dy - 1);
            g.lineTo(dx + 6, dy - 1);
            g.lineTo(dx, dy + 12);
            g.fill();
          }
        } else slab(hh, tp.color, 0.5, half * 1.05);
        y -= hh;
      } else if (l.s.t === 'bun') {
        // panino sopra con i semi di sesamo
        const [x0, y0] = P(cx - half, y - 0.1);
        g.fillStyle = '#e39a45';
        g.beginPath();
        g.moveTo(x0, y0 + 0.1 * S);
        g.quadraticCurveTo(x0, y0 - 0.02 * S, x0 + half * S, y0 - 0.02 * S);
        g.quadraticCurveTo(x0 + half * 2 * S, y0 - 0.02 * S, x0 + half * 2 * S, y0 + 0.1 * S);
        g.closePath();
        g.fill();
        g.fillStyle = '#fbeed0';
        for (let i = 0; i < 9; i++) {
          g.beginPath();
          g.ellipse(x0 + (0.15 + (i % 5) * 0.17 + (i >= 5 ? 0.08 : 0)) * half * 2 * S * 0.82 + half * 0.15 * S, y0 + (i >= 5 ? 0.05 : 0.025) * S, 3, 1.6, 0.3, 0, Math.PI * 2);
          g.fill();
        }
        y -= 0.1;
      } else if (l.sauce) {
        // salsa: la riga dove è passata la bottiglia
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        l.sauce.forEach((p, i) => {
          const [sx, sy] = P(p.x, p.y);
          if (i) g.lineTo(sx, sy);
          else g.moveTo(sx, sy);
        });
        // bordo scuro sotto, così si vede anche la maionese
        g.strokeStyle = 'rgba(60,40,30,.35)';
        g.lineWidth = Math.max(4, S * 0.018) + 3;
        g.stroke();
        g.strokeStyle = SAUCES[l.s.k].color;
        g.lineWidth = Math.max(4, S * 0.018);
        g.stroke();
      }
      y += off;
    }
    // scontrino
    const [rx, ry] = P(0.64, 0.08);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(rx, ry, 0.34 * S, 0.42 * S, 8);
    g.fill();
    g.strokeStyle = '#e3ddd2';
    g.lineWidth = 2;
    g.stroke();
    this.text('🧾 COMANDA', rx + 0.17 * S, ry + 14, 12, '#3a2f55', 700);
    const rowH = Math.min(0.06, 0.34 / this.steps.length);
    this.steps.forEach((s, i) => {
      const yy = ry + 0.06 * S + (i + 0.5) * rowH * S;
      if (i === this.idx) {
        g.fillStyle = '#fff1bf';
        g.fillRect(rx + 3, yy - (rowH * S) / 2, 0.34 * S - 6, rowH * S);
      }
      const mark = i < this.marks.length ? (this.marks[i] ? '✅' : '❌') : '';
      g.fillStyle = '#3a2f55';
      g.font = `600 ${Math.round(Math.min(13, rowH * S * 0.6))}px Fredoka, system-ui, sans-serif`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(`${stepIcon(s)} ${s.t === 'sauce' ? SAUCES[s.k].name : stepName(s)} ${mark}`, rx + 6, yy, 0.34 * S - 10);
    });
    // bottiglie delle salse
    this.bottles().forEach((b, i) => {
      const held = this.bottle?.k === b.k ? this.bottle : null;
      this.drawBottle(held ? held.x : b.x, held ? held.y : b.y, b.k, !!held);
      // nomi su due righe, sennò si toccano
      if (!held) this.text(SAUCES[b.k].name, sq.x + b.x * S, sq.y + (b.y + (i % 2 ? 0.2 : 0.14)) * S, 11, '#3a2f55', 600);
    });
    // vaschette
    for (const t of this.trays()) {
      const [x0, y0] = P(t.x0, t.y0);
      const hot = want && same(want, t.s);
      g.fillStyle = '#c9d0d8';
      g.beginPath();
      g.roundRect(x0, y0, (t.x1 - t.x0) * S, (t.y1 - t.y0) * S, 8);
      g.fill();
      g.fillStyle = t.s.t === 'top' ? TOPPINGS[t.s.k].color : '#e39a45';
      g.globalAlpha = 0.35;
      g.beginPath();
      g.roundRect(x0 + 4, y0 + 4, (t.x1 - t.x0) * S - 8, (t.y1 - t.y0) * S - 8, 6);
      g.fill();
      g.globalAlpha = 1;
      void hot;
      this.text(stepIcon(t.s), x0 + ((t.x1 - t.x0) * S) / 2, y0 + ((t.y1 - t.y0) * S) / 2, Math.min(26, (t.x1 - t.x0) * S * 0.55));
    }
    this.text(`${this.idx}/${this.steps.length}`, w / 2, h - 34, 14, '#7a6f8f', 500);
    this.bar(this.idx / this.steps.length);
  }

  private drawBottle(u: number, v: number, k: Sauce, held: boolean) {
    const g = this.g;
    const sq = this.sq();
    const S = sq.s;
    const [x, y] = [sq.x + u * S, sq.y + v * S];
    g.save();
    g.translate(x, y);
    // presa: a testa in giù col beccuccio verso il panino
    if (held) g.rotate(Math.PI);
    g.fillStyle = SAUCES[k].color;
    g.strokeStyle = 'rgba(0,0,0,.25)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.roundRect(-0.035 * S, -0.06 * S, 0.07 * S, 0.14 * S, 8);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(-0.02 * S, -0.06 * S);
    g.lineTo(0.02 * S, -0.06 * S);
    g.lineTo(0.006 * S, -0.11 * S);
    g.lineTo(-0.006 * S, -0.11 * S);
    g.closePath();
    g.fill();
    g.restore();
  }
}

// ======================================================================================
// Lavello: spugna insaponata sullo sporco, poi sotto l'acqua
// ======================================================================================

/** Stoviglie da lavare: nome, dove vanno ad asciugare e quanto sono grandi nel lavello (metà larghezza/altezza). */
export const DISHWARE = {
  piano: { name: 'piatto piano', rack: 'piatti', hx: 0.3, hy: 0.3 },
  fondo: { name: 'piatto fondo', rack: 'piatti', hx: 0.28, hy: 0.28 },
  bicchiere: { name: 'bicchiere', rack: 'bicchieri', hx: 0.11, hy: 0.2 },
  posate: { name: 'posate', rack: 'posate', hx: 0.17, hy: 0.24 },
  vaschetta: { name: 'vaschetta', rack: 'piatti', hx: 0.27, hy: 0.19 },
  vassoio: { name: 'vassoio', rack: 'piatti', hx: 0.36, hy: 0.24 },
} as const;
export type Dish = keyof typeof DISHWARE;
export type Rack = (typeof DISHWARE)[Dish]['rack'];

/**
 * Lavare una stoviglia al lavello (vista dall'alto): prendi la spugna e bagnala nel sapone, strofina ogni
 * macchia finché sparisce (la spugna si consuma: quando è asciutta non pulisce, va rimessa nel sapone),
 * poi trascina la stoviglia sotto l'acqua del rubinetto finché non resta più schiuma.
 */
export class WashStation extends Station {
  private d: (typeof DISHWARE)[Dish];
  private at: Pt = { x: 0.5, y: 0.62 };
  private dirt: { x: number; y: number; r: number; a: number; c: string }[];
  /** schiuma su una griglia sopra la stoviglia (coordinate relative al centro) */
  private foam: number[];
  private readonly G = 16;
  private sponge: Pt = { x: 0.86, y: 0.5 };
  private soap = 0;
  private held: 'sponge' | 'dish' | null = null;
  private off: Pt = { x: 0, y: 0 };
  private stage: 'scrub' | 'rinse' | 'done' = 'scrub';
  private doneT = 0;
  private bubbles: { x: number; y: number; life: number }[] = [];

  constructor(private kind: Dish, spots: number, private tough: number, onEnd: (q: number) => void) {
    super(onEnd);
    this.d = DISHWARE[kind];
    const cols = ['#8a5a2b', '#b5432f', '#6b4a2a', '#c98a2b'];
    this.dirt = [];
    for (let i = 0; i < spots * 20 && this.dirt.length < spots; i++) {
      const u = (Math.random() * 2 - 1) * 0.8;
      const v = (Math.random() * 2 - 1) * 0.8;
      if (!this.inside(u, v)) continue;
      if (this.dirt.some((o) => Math.hypot(o.x - u * this.d.hx, o.y - v * this.d.hy) < 0.08)) continue;
      this.dirt.push({ x: u * this.d.hx, y: v * this.d.hy, r: 0.035 + Math.random() * 0.03, a: 1, c: cols[i % cols.length] });
    }
    this.foam = new Array(this.G * this.G).fill(0);
  }

  /** (u, v) in -1…1 dentro la sagoma della stoviglia? */
  private inside(u: number, v: number) {
    switch (this.kind) {
      case 'piano':
      case 'fondo':
        return u * u + v * v <= 1;
      case 'bicchiere':
        return Math.abs(u) <= 0.75 + 0.25 * ((v + 1) / 2) && Math.abs(v) <= 1;
      case 'posate':
        return [-0.62, 0, 0.62].some((c) => Math.abs(u - c) < 0.2) && Math.abs(v) <= 1;
      default:
        return Math.abs(u) <= 1 && Math.abs(v) <= 1;
    }
  }

  private sq() {
    return this.square(70, 34);
  }

  private rel(x: number, y: number): Pt {
    const s = this.sq();
    return { x: (x - s.x) / s.s, y: (y - s.y) / s.s };
  }

  /** cella della griglia della schiuma → punto (relativo al centro della stoviglia) */
  private cell(i: number) {
    const gx = i % this.G;
    const gy = Math.floor(i / this.G);
    const u = ((gx + 0.5) / this.G) * 2 - 1;
    const v = ((gy + 0.5) / this.G) * 2 - 1;
    return { u, v, x: u * this.d.hx, y: v * this.d.hy };
  }

  private overDish(p: Pt) {
    const u = (p.x - this.at.x) / this.d.hx;
    const v = (p.y - this.at.y) / this.d.hy;
    return Math.abs(u) <= 1.1 && Math.abs(v) <= 1.1;
  }

  protected down(x: number, y: number) {
    if (this.stage === 'done') return;
    const p = this.rel(x, y);
    if (this.stage === 'scrub' && Math.abs(p.x - this.sponge.x) < 0.1 && Math.abs(p.y - this.sponge.y) < 0.08) {
      this.held = 'sponge';
      this.off = { x: this.sponge.x - p.x, y: this.sponge.y - p.y };
    } else if (this.stage === 'rinse' && this.overDish(p)) {
      this.held = 'dish';
      this.off = { x: this.at.x - p.x, y: this.at.y - p.y };
    }
  }

  protected move(x: number, y: number) {
    const p = this.rel(x, y);
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    if (this.held === 'sponge') {
      const n = { x: clamp(p.x + this.off.x, 0.05, 0.95), y: clamp(p.y + this.off.y, 0.08, 0.97) };
      const dist = Math.hypot(n.x - this.sponge.x, n.y - this.sponge.y);
      this.sponge = n;
      // strofinare: toglie lo sporco sotto la spugna solo se c'è sapone, e lascia schiuma
      if (this.soap > 0 && this.overDish(n)) {
        const lx = n.x - this.at.x;
        const ly = n.y - this.at.y;
        for (const s of this.dirt) if (s.a > 0 && Math.hypot(s.x - lx, s.y - ly) < s.r + 0.05) s.a = Math.max(0, s.a - dist * this.tough);
        for (let i = 0; i < this.foam.length; i++) {
          const c = this.cell(i);
          if (this.inside(c.u, c.v) && Math.hypot(c.x - lx, c.y - ly) < 0.065) this.foam[i] = 1;
        }
        this.soap = Math.max(0, this.soap - dist * 0.35);
        if (this.dirt.every((s) => s.a <= 0)) {
          this.stage = 'rinse';
          this.held = null;
          this.sponge = { x: 0.86, y: 0.5 };
        }
      }
    } else if (this.held === 'dish') {
      // si può spingere anche mezza fuori dal lavello: ogni punto deve poter passare sotto l'acqua
      this.at = { x: clamp(p.x + this.off.x, 0.02, 0.98), y: clamp(p.y + this.off.y, 0.0, 0.98) };
    }
  }

  protected up() {
    if (this.held === 'sponge') {
      // la spugna lasciata resta dov'è (sul bordo del lavello se è fuori)
      this.sponge = { x: Math.max(0.08, Math.min(0.92, this.sponge.x)), y: Math.max(0.1, Math.min(0.95, this.sponge.y)) };
    }
    this.held = null;
  }

  /** dove arriva l'acqua del rubinetto */
  private readonly hit: Pt = { x: 0.5, y: 0.3 };
  private readonly soapAt: Pt = { x: 0.86, y: 0.82 };

  step(dt: number) {
    const g = this.g;
    const { w, h } = this;
    const sq = this.sq();
    const S = sq.s;
    const P = (u: number, v: number) => [sq.x + u * S, sq.y + v * S] as const;
    // spugna nel sapone: si inzuppa
    if (this.held === 'sponge' && Math.hypot(this.sponge.x - this.soapAt.x, this.sponge.y - this.soapAt.y) < 0.09) {
      this.soap = Math.min(1, this.soap + dt * 1.6);
      if (Math.random() < dt * 20) this.bubbles.push({ x: this.sponge.x + (Math.random() - 0.5) * 0.1, y: this.sponge.y, life: 0.8 });
    }
    // acqua: toglie la schiuma dove cade
    if (this.stage === 'rinse') {
      const lx = this.hit.x - this.at.x;
      const ly = this.hit.y - this.at.y;
      for (let i = 0; i < this.foam.length; i++) {
        if (this.foam[i] <= 0) continue;
        const c = this.cell(i);
        if (Math.hypot(c.x - lx, c.y - ly) < 0.12) this.foam[i] = Math.max(0, this.foam[i] - dt * 5);
      }
      if (this.foam.every((f) => f <= 0.05)) {
        this.stage = 'done';
        this.held = null;
      }
    }
    if (this.stage === 'done') {
      this.doneT += dt;
      if (this.doneT > 0.7) {
        this.end(1);
        return;
      }
    }
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text(`Lava: ${this.d.name}`, w / 2, 24, 20);
    const dirtLeft = this.dirt.some((s) => s.a > 0);
    const hint =
      this.stage === 'done' ? 'pulito!'
      : this.stage === 'rinse' ? "sciacqua: trascina sotto l'acqua finché sparisce la schiuma"
      : this.soap <= 0 ? 'bagna la spugna nel sapone'
      : dirtLeft ? 'strofina le macchie con la spugna' : '';
    this.text(hint, w / 2, 48, 13, this.stage === 'scrub' && this.soap <= 0 && this.held === 'sponge' ? '#e5484d' : '#7a6f8f', 500);
    // vasca del lavello in acciaio
    const [bx, by] = P(0.02, 0.06);
    const grad = g.createLinearGradient(bx, by, bx, by + 0.9 * S);
    grad.addColorStop(0, '#c7d0d8');
    grad.addColorStop(1, '#9aa6b1');
    g.fillStyle = grad;
    g.beginPath();
    g.roundRect(bx, by, 0.96 * S, 0.92 * S, 22);
    g.fill();
    g.fillStyle = '#7e8a95';
    const [dx, dy] = P(0.5, 0.86);
    g.beginPath();
    g.arc(dx, dy, 0.03 * S, 0, Math.PI * 2);
    g.fill();
    // rubinetto
    const [fx, fy] = P(0.5, 0.06);
    g.fillStyle = '#d9dee3';
    g.strokeStyle = '#7e8a95';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(fx - 0.035 * S, fy - 6, 0.07 * S, 0.17 * S, 8);
    g.fill();
    g.stroke();
    // la stoviglia
    this.drawDish();
    // acqua che scende
    if (this.stage !== 'scrub') {
      const [hx, hy] = P(this.hit.x, this.hit.y);
      const wg = g.createLinearGradient(hx - 0.035 * S, 0, hx + 0.035 * S, 0);
      wg.addColorStop(0, 'rgba(110,180,250,.55)');
      wg.addColorStop(0.5, 'rgba(210,235,255,.95)');
      wg.addColorStop(1, 'rgba(110,180,250,.55)');
      g.fillStyle = wg;
      g.fillRect(hx - 0.035 * S, fy + 0.15 * S, 0.07 * S, hy - fy - 0.15 * S);
      g.fillStyle = 'rgba(160,215,255,.45)';
      g.beginPath();
      g.arc(hx, hy, 0.1 * S, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(160,215,255,.9)';
      g.lineWidth = 3;
      const t = performance.now() / 120;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(hx, hy, (0.03 + ((t + k) % 3) * 0.025) * S, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // piattino del sapone e spugna
    const [sx, sy] = P(this.soapAt.x, this.soapAt.y);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(sx, sy, 0.09 * S, 0.06 * S, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5fb8f0';
    g.beginPath();
    g.ellipse(sx, sy, 0.07 * S, 0.045 * S, 0, 0, Math.PI * 2);
    g.fill();
    this.text('sapone', sx, sy + 0.09 * S, 11, '#3a2f55', 600);
    if (this.stage === 'scrub') this.drawSponge();
    // bolle
    this.bubbles = this.bubbles.filter((b) => (b.life -= dt) > 0);
    g.strokeStyle = 'rgba(255,255,255,.9)';
    g.lineWidth = 1.5;
    for (const b of this.bubbles) {
      b.y -= dt * 0.08;
      const [px, py] = P(b.x, b.y);
      g.beginPath();
      g.arc(px, py, 4 + (1 - b.life) * 4, 0, Math.PI * 2);
      g.stroke();
    }
    // la manina dove toccare all'inizio
    if (!this.held && (this.stage === 'rinse' || (this.stage === 'scrub' && this.soap <= 0))) {
      const [px, py] = this.stage === 'rinse' ? P(this.at.x, this.at.y) : P(this.sponge.x, this.sponge.y);
      const pulse = 1 + 0.15 * Math.sin(performance.now() / 160);
      g.strokeStyle = '#ffc21a';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(px, py, 0.08 * S * pulse, 0, Math.PI * 2);
      g.stroke();
    }
    // sapone sulla spugna e quanto è pulita
    const clean = this.dirt.length ? this.dirt.reduce((a, s) => a + (1 - s.a), 0) / this.dirt.length : 1;
    const foamLeft = this.foam.filter((f) => f > 0.05).length / Math.max(1, this.foam.filter((_, i) => this.inside(this.cell(i).u, this.cell(i).v)).length);
    this.text(this.stage === 'scrub' ? `sapone ${'●'.repeat(Math.ceil(this.soap * 5))}${'○'.repeat(5 - Math.ceil(this.soap * 5))}` : 'risciacquo', w / 2, h - 34, 14, '#7a6f8f', 600);
    this.bar(this.stage === 'scrub' ? clean * 0.7 : 0.7 + 0.3 * (1 - Math.min(1, foamLeft * 3)));
  }

  private drawSponge() {
    const g = this.g;
    const sq = this.sq();
    const S = sq.s;
    const [x, y] = [sq.x + this.sponge.x * S, sq.y + this.sponge.y * S];
    g.save();
    g.translate(x, y);
    if (this.held === 'sponge') g.rotate(Math.sin(performance.now() / 70) * 0.08);
    g.fillStyle = '#f5d33b';
    g.beginPath();
    g.roundRect(-0.075 * S, -0.045 * S, 0.15 * S, 0.09 * S, 8);
    g.fill();
    g.fillStyle = '#3f9a4a';
    g.beginPath();
    g.roundRect(-0.075 * S, -0.045 * S, 0.15 * S, 0.03 * S, [8, 8, 0, 0]);
    g.fill();
    // schiuma sulla spugna insaponata
    if (this.soap > 0) {
      g.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < Math.ceil(this.soap * 6); i++) {
        g.beginPath();
        g.arc((-0.06 + i * 0.024) * S, (0.03 + (i % 2) * 0.012) * S, 0.016 * S, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  private drawDish() {
    const g = this.g;
    const sq = this.sq();
    const S = sq.s;
    const cx = sq.x + this.at.x * S;
    const cy = sq.y + this.at.y * S;
    const hx = this.d.hx * S;
    const hy = this.d.hy * S;
    g.save();
    g.translate(cx, cy);
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.beginPath();
    g.ellipse(4, 6, hx, hy, 0, 0, Math.PI * 2);
    if (this.kind !== 'posate' && this.kind !== 'bicchiere') g.fill();
    const white = '#fbfbf8';
    const rim = '#e1e4e8';
    switch (this.kind) {
      case 'piano':
      case 'fondo': {
        g.fillStyle = white;
        g.beginPath();
        g.arc(0, 0, hx, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = rim;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(0, 0, hx * (this.kind === 'fondo' ? 0.68 : 0.72), 0, Math.PI * 2);
        g.stroke();
        if (this.kind === 'fondo') {
          g.fillStyle = '#eef0f2';
          g.beginPath();
          g.arc(0, 0, hx * 0.66, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'bicchiere': {
        // di lato: vetro azzurrino un po' trasparente, più largo in alto
        g.fillStyle = 'rgba(200,230,250,.85)';
        g.strokeStyle = '#8fb8d6';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(-hx, -hy);
        g.lineTo(hx, -hy);
        g.lineTo(hx * 0.75, hy);
        g.lineTo(-hx * 0.75, hy);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,.6)';
        g.fillRect(-hx * 0.6, -hy * 0.8, hx * 0.18, hy * 1.5);
        break;
      }
      case 'posate': {
        g.fillStyle = '#c9d0d8';
        g.strokeStyle = '#8b96a1';
        g.lineWidth = 1.5;
        const piece = (x: number, top: 'fork' | 'spoon' | 'knife') => {
          const pw = hx * 0.28;
          g.beginPath();
          g.roundRect(x - pw / 2, -hy * 0.1, pw, hy * 1.1, pw / 2);
          g.fill();
          g.stroke();
          g.beginPath();
          if (top === 'spoon') g.ellipse(x, -hy * 0.55, pw * 1.1, hy * 0.45, 0, 0, Math.PI * 2);
          else if (top === 'knife') g.roundRect(x - pw * 0.6, -hy, pw * 1.2, hy * 0.95, [pw, pw, 2, 2]);
          else g.roundRect(x - pw * 0.9, -hy * 0.95, pw * 1.8, hy * 0.85, 4);
          g.fill();
          g.stroke();
          if (top === 'fork') {
            g.fillStyle = '#9aa6b1';
            for (const k of [-0.45, 0, 0.45]) g.fillRect(x + k * pw - 1, -hy * 0.95, 2, hy * 0.5);
            g.fillStyle = '#c9d0d8';
          }
        };
        piece(-hx * 0.62, 'fork');
        piece(0, 'spoon');
        piece(hx * 0.62, 'knife');
        break;
      }
      default: {
        // vaschetta (bordo alto) e vassoio (con le maniglie)
        g.fillStyle = this.kind === 'vassoio' ? '#d8c3a5' : white;
        g.beginPath();
        g.roundRect(-hx, -hy, hx * 2, hy * 2, this.kind === 'vassoio' ? 14 : 18);
        g.fill();
        g.strokeStyle = this.kind === 'vassoio' ? '#b89a72' : rim;
        g.lineWidth = this.kind === 'vassoio' ? 4 : 6;
        g.beginPath();
        g.roundRect(-hx * 0.86, -hy * 0.8, hx * 1.72, hy * 1.6, 12);
        g.stroke();
        if (this.kind === 'vassoio') {
          g.fillStyle = '#b89a72';
          for (const sd of [-1, 1]) {
            g.beginPath();
            g.roundRect(sd * hx - (sd > 0 ? 0 : 10), -hy * 0.25, 10, hy * 0.5, 4);
            g.fill();
          }
        }
      }
    }
    // sporco: sbiadisce mentre lo strofini
    for (const s of this.dirt) {
      if (s.a <= 0) continue;
      g.globalAlpha = 0.25 + 0.75 * s.a;
      g.fillStyle = s.c;
      g.beginPath();
      g.ellipse(s.x * S, s.y * S, s.r * S, s.r * S * 0.8, s.x * 7, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(s.x * S + s.r * S * 0.7, s.y * S - s.r * S * 0.5, s.r * S * 0.4, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // schiuma
    // bolle di grandezze diverse, spostate un po' a caso (sempre uguali per la stessa cella)
    const cellW = ((this.d.hx * 2) / this.G) * S;
    for (let i = 0; i < this.foam.length; i++) {
      const f = this.foam[i];
      if (f <= 0.05) continue;
      const c = this.cell(i);
      const j1 = Math.sin(i * 12.9898) * 0.5;
      const j2 = Math.sin(i * 78.233) * 0.5;
      const r = cellW * (0.55 + 0.45 * Math.abs(Math.sin(i * 3.7))) * (0.6 + 0.4 * f);
      const x = c.x * S + j1 * cellW;
      const y = c.y * S + j2 * cellW;
      g.fillStyle = `rgba(255,255,255,${0.9 * f})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `rgba(170,200,230,${0.6 * f})`;
      g.lineWidth = 1;
      g.stroke();
    }
    // brilla quando è pulita
    if (this.stage === 'done') {
      g.fillStyle = 'rgba(255,255,255,.9)';
      for (const [a, b] of [[-0.5, -0.4], [0.4, -0.2], [0.1, 0.5]]) {
        const x = a * hx;
        const y = b * hy;
        g.beginPath();
        g.moveTo(x, y - 9);
        g.lineTo(x + 3, y);
        g.lineTo(x, y + 9);
        g.lineTo(x - 3, y);
        g.closePath();
        g.fill();
      }
    }
    g.restore();
  }
}
