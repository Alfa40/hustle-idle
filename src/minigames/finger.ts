import type { Game } from '../game';
import { toast } from '../sim/bus';
import { OverlayRun } from './overlay';
import { starsFor } from './jobs';

/**
 * Motori dei minigiochi col dito di Ristorazione e ospitalità (riquadro nella zona libera, vedi OverlayRun):
 *   TraceRun  segui un disegno col dito (tagli dell'aiuto cuoco, latte art, sac à poche)
 *   RhythmRun tocca a tempo quando il segno arriva sul cerchio, tieni premuto per i segni lunghi
 *   DragRun   trascina ogni cosa al suo posto (buffet, impiattamento, decorazioni, tavoli, camere)
 *   PourRun   tieni premuto per versare e lascia alla tacca (cocktail, vino, cioccolato)
 *   StackRun  lascia cadere i piani che dondolano ben centrati (torte nuziali)
 * Gli errori si possono fare: alla fine la qualità decide le stelle (insieme al tempo) e quindi la paga.
 */

/** Stelle dalla qualità (0–1) e dal tempo rimasto: vale la peggiore delle due. */
export function qualityStars(q: number, run: { timeLeft: number; timeTotal: number; starCap: number }) {
  const qs = q >= 0.85 ? 3 : q >= 0.62 ? 2 : 1;
  return Math.max(1, Math.min(qs, run.starCap, starsFor(run.timeLeft, run.timeTotal)));
}

type Pt = [number, number];
const C = {
  ink: '#3a2f55',
  good: '#35c46a',
  warn: '#ffc21a',
  bad: '#e5484d',
  paper: '#fff8ec',
};

/** Base dei minigiochi su canvas: misure, dito (in coordinate del canvas) e disegno a ogni fotogramma. */
abstract class CanvasRun extends OverlayRun {
  protected cv: HTMLCanvasElement;
  protected g: CanvasRenderingContext2D;
  protected w = 300;
  protected h = 400;
  protected finger: { x: number; y: number } | null = null;

  constructor(game: Game, title: string, cls: string) {
    super(game, title, cls);
    this.root.innerHTML = '<canvas></canvas>';
    this.cv = this.root.querySelector('canvas')!;
    this.g = this.cv.getContext('2d')!;
    const pos = (e: PointerEvent) => {
      const r = this.cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    this.cv.addEventListener('pointerdown', (e) => {
      this.cv.setPointerCapture?.(e.pointerId);
      this.finger = pos(e);
      this.down(this.finger.x, this.finger.y);
    });
    this.cv.addEventListener('pointermove', (e) => {
      if (!this.finger) return;
      this.finger = pos(e);
      this.move(this.finger.x, this.finger.y);
    });
    const up = () => {
      if (!this.finger) return;
      this.finger = null;
      this.up();
    };
    this.cv.addEventListener('pointerup', up);
    this.cv.addEventListener('pointercancel', up);
  }

  protected resized(w: number, h: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.cv.width = w * dpr;
    this.cv.height = h * dpr;
    this.cv.style.width = `${w}px`;
    this.cv.style.height = `${h}px`;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  protected down(_x: number, _y: number) {}
  protected move(_x: number, _y: number) {}
  protected up() {}

  /** Testo centrato. */
  protected text(t: string, x: number, y: number, size: number, color = C.ink, weight = 600) {
    const g = this.g;
    g.fillStyle = color;
    g.font = `${weight} ${Math.round(size)}px Fredoka, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // mai più largo del riquadro (si stringe un po' invece di uscire)
    g.fillText(t, x, y, this.w - 16);
  }

  /** Riquadro quadrato più grande che sta sotto la riga del titolo (per i disegni). */
  protected square(top = 54, bottom = 16) {
    const s = Math.min(this.w - 24, this.h - top - bottom);
    return { x: (this.w - s) / 2, y: top + (this.h - top - bottom - s) / 2, s };
  }
}

// ======================================================================================
// Segui il disegno
// ======================================================================================

export interface TraceItem {
  name: string;
  /** cosa c'è sotto il disegno (ingrediente, tazza, dolce) */
  back: 'board' | 'cup' | 'cake' | 'eclair';
  /** emoji grande in mezzo (l'ingrediente da tagliare) */
  icon?: string;
  /** i tratti da seguire, in coordinate 0–1 del riquadro */
  paths: Pt[][];
  /** colore del segno lasciato dal dito */
  ink: string;
  /** dopo il disegno: scegli la ciotola giusta (aiuto cuoco) */
  bowl?: { right: string; options: string[] };
}

/** Punti lungo un tratto, uno ogni `step` (in coordinate 0–1). */
function resample(path: Pt[], step = 0.02) {
  const out: Pt[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  out.push(path[path.length - 1]);
  return out;
}

export class TraceRun extends CanvasRun {
  protected phaseList: { name: string; icon: string; tip: string }[];
  private items: TraceItem[];
  private idx = 0;
  private samples: { p: Pt; hit: boolean }[][] = [];
  private stroke: Pt[] = [];
  private strokes: Pt[][] = [];
  private inside = 0;
  private total = 0;
  private quality: number[] = [];
  private choosing = false;
  private flash = 0;
  /** quanto lontano dal tratto vale ancora (in frazione del riquadro): più stretto ai livelli alti */
  private tol: number;

  constructor(game: Game, title: string, items: TraceItem[], opts: { tol: number; time: number; tip: string; icon: string; phase: string }) {
    super(game, title, 'ovl-trace');
    this.items = items;
    this.tol = opts.tol;
    this.phaseList = [{ name: opts.phase, icon: opts.icon, tip: opts.tip }];
    this.setTime(opts.time);
    this.load();
  }

  private load() {
    this.samples = this.items[this.idx].paths.map((p) => resample(p).map((q) => ({ p: q, hit: false })));
    this.strokes = [];
    this.stroke = [];
    this.inside = 0;
    this.total = 0;
    this.choosing = false;
  }

  private cover() {
    const all = this.samples.flat();
    return all.filter((x) => x.hit).length / Math.max(1, all.length);
  }

  protected down(x: number, y: number) {
    if (this.choosing) {
      this.pickBowl(x, y);
      return;
    }
    this.stroke = [];
    this.move(x, y);
  }

  protected move(x: number, y: number) {
    if (this.choosing) return;
    const sq = this.square(70, 20);
    const p: Pt = [(x - sq.x) / sq.s, (y - sq.y) / sq.s];
    this.stroke.push(p);
    // vicino al disegno? (e i punti del disegno vicini al dito si "accendono")
    let near = false;
    for (const path of this.samples) {
      for (const sm of path) {
        const d = Math.hypot(sm.p[0] - p[0], sm.p[1] - p[1]);
        if (d < this.tol) {
          sm.hit = true;
          near = true;
        } else if (d < this.tol * 1.6) near = true;
      }
    }
    this.total++;
    if (near) this.inside++;
  }

  protected up() {
    if (this.choosing) return;
    if (this.stroke.length) this.strokes.push(this.stroke);
    this.stroke = [];
    if (this.cover() >= 0.9) this.itemDone();
  }

  private itemDone() {
    const acc = this.total ? this.inside / this.total : 0;
    const q = Math.min(1, 0.55 * this.cover() + 0.45 * acc);
    this.quality.push(q);
    this.flash = 0.8;
    if (this.items[this.idx].bowl) {
      this.choosing = true;
      return;
    }
    this.next();
  }

  private bowlRects() {
    const it = this.items[this.idx];
    const n = it.bowl!.options.length;
    const bw = Math.min(90, (this.w - 40) / n);
    return it.bowl!.options.map((o, i) => ({ o, x: this.w / 2 + (i - (n - 1) / 2) * (bw + 10) - bw / 2, y: this.h - bw - 24, s: bw }));
  }

  private pickBowl(x: number, y: number) {
    const r = this.bowlRects().find((b) => x > b.x && x < b.x + b.s && y > b.y && y < b.y + b.s);
    if (!r) return;
    const it = this.items[this.idx];
    // ciotola sbagliata: si può, ma il piatto vale meno
    if (r.o !== it.bowl!.right) {
      this.quality[this.quality.length - 1] *= 0.5;
      toast(`${r.o}: non era la ciotola giusta`, 'bad');
    }
    this.next();
  }

  private next() {
    this.idx++;
    if (this.idx >= this.items.length) {
      const q = this.quality.reduce((a, b) => a + b, 0) / this.quality.length;
      this.finish(qualityStars(q, this));
      return;
    }
    this.load();
  }

  protected step(dt: number) {
    this.flash = Math.max(0, this.flash - dt);
    this.draw();
  }

  private draw() {
    const g = this.g;
    const { w, h } = this;
    g.fillStyle = C.paper;
    g.fillRect(0, 0, w, h);
    const it = this.items[this.idx];
    if (!it) return;
    this.text(`${it.name}  ${this.idx + 1}/${this.items.length}`, w / 2, 26, 20);
    const sq = this.square(70, 20);
    const P = (p: Pt) => [sq.x + p[0] * sq.s, sq.y + p[1] * sq.s] as const;
    // sfondo: tagliere, tazza, torta
    g.save();
    if (it.back === 'board') {
      g.fillStyle = '#d9a46a';
      g.beginPath();
      g.roundRect(sq.x + sq.s * 0.06, sq.y + sq.s * 0.1, sq.s * 0.88, sq.s * 0.8, 18);
      g.fill();
    } else if (it.back === 'cup') {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(sq.x + sq.s / 2, sq.y + sq.s / 2, sq.s * 0.48, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c69c6d';
      g.beginPath();
      g.arc(sq.x + sq.s / 2, sq.y + sq.s / 2, sq.s * 0.42, 0, Math.PI * 2);
      g.fill();
    } else if (it.back === 'cake') {
      g.fillStyle = '#f7c6d9';
      g.beginPath();
      g.arc(sq.x + sq.s / 2, sq.y + sq.s / 2, sq.s * 0.44, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = '#b5793d';
      g.beginPath();
      g.roundRect(sq.x + sq.s * 0.08, sq.y + sq.s * 0.36, sq.s * 0.84, sq.s * 0.28, sq.s * 0.14);
      g.fill();
    }
    if (it.icon) {
      g.font = `${Math.round(sq.s * 0.5)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(it.icon, sq.x + sq.s / 2, sq.y + sq.s / 2);
    }
    g.restore();
    // il disegno da seguire: tratteggiato, i pezzi già fatti diventano pieni
    g.lineCap = 'round';
    for (const path of this.samples) {
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, ay] = P(path[i].p);
        const [bx, by] = P(path[i + 1].p);
        g.strokeStyle = path[i].hit ? 'rgba(53,196,106,.9)' : 'rgba(58,47,85,.45)';
        g.lineWidth = path[i].hit ? 5 : 3;
        g.setLineDash(path[i].hit ? [] : [6, 6]);
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
      }
    }
    g.setLineDash([]);
    // il segno del dito
    g.strokeStyle = it.ink;
    g.lineWidth = Math.max(5, sq.s * 0.025);
    for (const s of [...this.strokes, this.stroke]) {
      if (s.length < 2) continue;
      g.beginPath();
      s.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
      g.stroke();
    }
    const cov = this.cover();
    g.fillStyle = 'rgba(0,0,0,.12)';
    g.fillRect(20, h - 14, w - 40, 6);
    g.fillStyle = C.good;
    g.fillRect(20, h - 14, (w - 40) * Math.min(1, cov / 0.9), 6);
    if (this.choosing) {
      g.fillStyle = 'rgba(255,248,236,.92)';
      g.fillRect(0, h * 0.55, w, h * 0.45);
      this.text('In quale ciotola va?', w / 2, h - Math.min(90, (w - 40) / 3) - 50, 18);
      for (const b of this.bowlRects()) {
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.roundRect(b.x, b.y, b.s, b.s, 14);
        g.fill();
        g.strokeStyle = C.ink;
        g.lineWidth = 2;
        g.stroke();
        this.text(b.o, b.x + b.s / 2, b.y + b.s / 2, b.s * 0.5);
      }
    }
    if (this.flash > 0) this.text('✨', w / 2, h / 2, 70);
  }

  protected statusExtra() {
    return ` · ${Math.min(this.idx + 1, this.items.length)}/${this.items.length}`;
  }
}

// Disegni pronti (coordinate 0–1)
const circle = (cx: number, cy: number, r: number, n = 28, a0 = 0, a1 = Math.PI * 2): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(a0 + ((a1 - a0) * i) / n) * r, cy + Math.sin(a0 + ((a1 - a0) * i) / n) * r]);
export const SHAPES = {
  heart: (): Pt[] => Array.from({ length: 41 }, (_, i) => {
    const t = (i / 40) * Math.PI * 2;
    return [0.5 + 0.022 * 16 * Math.sin(t) ** 3, 0.47 - 0.022 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
  }),
  leaf: (): Pt[][] => [[[0.5, 0.18], [0.5, 0.84]], ...[0.28, 0.4, 0.52, 0.64].map((y): Pt[] => [[0.32, y + 0.06], [0.5, y], [0.68, y + 0.06]])],
  swan: (): Pt[][] => [[...circle(0.42, 0.62, 0.16, 18, Math.PI, Math.PI * 2.2)], [[0.56, 0.58], [0.62, 0.42], [0.6, 0.3], [0.54, 0.26], [0.5, 0.3]]],
  spiral: (): Pt[] => Array.from({ length: 50 }, (_, i) => {
    const t = (i / 49) * Math.PI * 4;
    const r = 0.36 - (i / 49) * 0.3;
    return [0.5 + Math.cos(t) * r, 0.5 + Math.sin(t) * r];
  }),
  zigzag: (): Pt[] => Array.from({ length: 9 }, (_, i) => [0.14 + i * 0.09, i % 2 ? 0.44 : 0.56]),
  ring: (): Pt[] => circle(0.5, 0.5, 0.32, 36),
  /** tagli dritti su un ingrediente: `n` linee verticali */
  cuts: (n: number): Pt[][] => Array.from({ length: n }, (_, i) => [[0.3 + (i * 0.4) / Math.max(1, n - 1), 0.2], [0.3 + (i * 0.4) / Math.max(1, n - 1), 0.8]] as Pt[]),
};

// ======================================================================================
// A ritmo
// ======================================================================================

export interface Note {
  /** secondi dall'inizio della sezione */
  t: number;
  /** durata (segni lunghi da tenere premuti) */
  dur?: number;
}

export class RhythmRun extends CanvasRun {
  protected phaseList: { name: string; icon: string; tip: string }[];
  private sections: { name: string; icon: string; notes: Note[] }[];
  private sec = 0;
  private t = -1.5;
  private speed: number;
  private judged = new Set<Note>();
  private holding: Note | null = null;
  private holdOk = 0;
  private hits = 0;
  private miss = 0;
  private total = 0;
  private fx: { text: string; t: number }[] = [];
  private icon: string;
  private ended = false;

  constructor(game: Game, title: string, sections: { name: string; icon: string; notes: Note[] }[], opts: { speed: number; icon: string; tip: string }) {
    super(game, title, 'ovl-rhythm');
    this.sections = sections;
    this.speed = opts.speed;
    this.icon = opts.icon;
    this.phaseList = sections.map((s) => ({ name: s.name, icon: s.icon, tip: opts.tip }));
    this.total = sections.reduce((a, s) => a + s.notes.length, 0);
    const len = sections.reduce((a, s) => a + Math.max(...s.notes.map((n) => n.t + (n.dur ?? 0))) + 3, 0);
    this.setTime(len + 25);
  }

  /** Il cerchio dove arrivano i segni (in basso) e da dove partono. */
  private lane() {
    return { x: this.w / 2, y0: 60, y1: this.h - 90 };
  }

  private yOf(n: Note) {
    const L = this.lane();
    return L.y1 - (n.t - this.t) * this.speed;
  }

  protected down() {
    const notes = this.sections[this.sec]?.notes ?? [];
    // il segno più vicino al cerchio, se è nella finestra
    let best: Note | null = null;
    let bd = Infinity;
    for (const n of notes) {
      if (this.judged.has(n)) continue;
      const d = Math.abs(n.t - this.t);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (!best || bd > 0.32) {
      this.fx.push({ text: '…', t: 0.4 });
      return;
    }
    if (best.dur) {
      this.holding = best;
      this.holdOk = 0;
      return;
    }
    this.judge(best, bd < 0.14 ? 1 : 0.6);
  }

  protected up() {
    const n = this.holding;
    if (!n) return;
    this.holding = null;
    // tenuto abbastanza (fino alla fine del segno lungo)?
    this.judge(n, this.holdOk >= (n.dur ?? 0) * 0.8 ? 1 : this.holdOk >= (n.dur ?? 0) * 0.4 ? 0.6 : 0);
  }

  private judge(n: Note, v: number) {
    this.judged.add(n);
    this.hits += v;
    if (!v) this.miss++;
    this.fx.push({ text: v >= 1 ? 'Perfetto!' : v > 0 ? 'Bene' : 'Mancato', t: 0.6 });
  }

  protected step(dt: number) {
    if (this.ended) return;
    if (!this.frozen) this.t += dt;
    if (this.holding) this.holdOk += dt;
    const s = this.sections[this.sec];
    if (s) {
      for (const n of s.notes) {
        if (!this.judged.has(n) && n !== this.holding && this.t - n.t > 0.35) this.judge(n, 0);
      }
      const end = Math.max(...s.notes.map((n) => n.t + (n.dur ?? 0))) + 1.2;
      if (this.t > end && !this.holding) {
        this.sec++;
        this.t = -1.5;
        this.judged.clear();
        this.phaseIdx = Math.min(this.sec, this.sections.length - 1);
        if (this.sec >= this.sections.length) {
          this.ended = true;
          this.finish(qualityStars(this.hits / Math.max(1, this.total), this));
          return;
        }
      }
    }
    for (const f of this.fx) f.t -= dt;
    this.fx = this.fx.filter((f) => f.t > 0);
    this.draw();
  }

  private draw() {
    const g = this.g;
    const { w, h } = this;
    g.fillStyle = '#2b2440';
    g.fillRect(0, 0, w, h);
    const s = this.sections[this.sec];
    if (!s) return;
    this.text(`${s.icon} ${s.name}`, w / 2, 26, 20, '#fff');
    const L = this.lane();
    g.strokeStyle = 'rgba(255,255,255,.25)';
    g.lineWidth = 46;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(L.x, L.y0);
    g.lineTo(L.x, L.y1);
    g.stroke();
    // il cerchio del tempo giusto
    g.strokeStyle = this.holding ? C.good : '#fff';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(L.x, L.y1, 30, 0, Math.PI * 2);
    g.stroke();
    for (const n of s.notes) {
      if (this.judged.has(n) && n !== this.holding) continue;
      const y = this.yOf(n);
      if (n.dur) {
        const y2 = y - n.dur * this.speed;
        g.strokeStyle = C.warn;
        g.lineWidth = 22;
        g.beginPath();
        g.moveTo(L.x, Math.min(L.y1, y));
        g.lineTo(L.x, Math.max(L.y0, y2));
        g.stroke();
      }
      if (y < L.y0 - 30 || y > L.y1 + 40) continue;
      g.fillStyle = n.dur ? C.warn : '#ff8a3d';
      g.beginPath();
      g.arc(L.x, y, 22, 0, Math.PI * 2);
      g.fill();
      this.text(n.dur ? '🔥' : this.icon, L.x, y, 22);
    }
    const f = this.fx[this.fx.length - 1];
    if (f) this.text(f.text, w / 2, L.y1 - 70, 24, f.text === 'Mancato' || f.text === '…' ? C.bad : C.good, 700);
    this.text(this.holding ? '✊ Tieni premuto!' : '👆 Tocca quando il segno è sul cerchio', w / 2, h - 30, 15, '#fff');
  }

  protected statusExtra() {
    return ` · 🎯 ${Math.round((this.hits / Math.max(1, this.total)) * 100)}%`;
  }
}

/** Segni a ritmo per una sezione: `n` tocchi ogni `gap` secondi, con qualche segno lungo. */
export function beats(n: number, gap: number, holds = 0, start = 0.5): Note[] {
  const out: Note[] = [];
  let t = start;
  for (let i = 0; i < n; i++) {
    const hold = holds > 0 && i % Math.max(2, Math.floor(n / holds)) === Math.floor(n / holds) - 1;
    out.push(hold ? { t, dur: 1 } : { t });
    t += hold ? gap + 1 : gap * (i % 4 === 3 ? 1.5 : 1);
  }
  return out;
}

// ======================================================================================
// Trascina al posto giusto
// ======================================================================================

export interface DragSlot {
  id: string;
  /** posizione nel tavolo/piatto (0–1) e grandezza (frazione della larghezza) */
  x: number;
  y: number;
  size?: number;
  /** cosa c'è scritto sul posto (tavolo per 4, camera 12 vista mare…) */
  label?: string;
}

export interface DragItem {
  id: string;
  icon: string;
  /** scritta sotto (es. "4 persone · finestra") */
  label?: string;
  /** il posto giusto per lui? (più posti possono andare bene) */
  ok: (slot: DragSlot) => boolean;
}

/**
 * Trascina ogni cosa su un posto. Si può mettere anche dove non va: quando tutto è sistemato si tocca
 * "Fatto" e la qualità (quanti al posto giusto) decide le stelle. `ref`: lo schema o la foto da copiare
 * (in alto, piccola). `cook`: prima una cottura da fermare sul verde (chef).
 */
export class DragRun extends OverlayRun {
  protected phaseList: { name: string; icon: string; tip: string }[];
  private slots: DragSlot[];
  private items: DragItem[];
  private where = new Map<string, string>();
  private board!: HTMLDivElement;
  private tray!: HTMLDivElement;
  private doneBtn!: HTMLButtonElement;
  private drag: { it: DragItem; el: HTMLElement; dx: number; dy: number; pid: number } | null = null;
  private els = new Map<string, HTMLElement>();
  private cook: { label: string; rounds: number; done: number; pos: number; dir: number; score: number[]; speed: number } | null = null;

  constructor(game: Game, title: string, opts: {
    slots: DragSlot[]; items: DragItem[]; board: 'table' | 'plate' | 'cake' | 'floor' | 'rooms'; ref?: string; time: number;
    phase: string; icon: string; tip: string; cook?: { label: string; rounds: number; speed: number };
  }) {
    super(game, title, 'ovl-drag');
    this.slots = opts.slots;
    this.items = opts.items.sort(() => Math.random() - 0.5);
    this.phaseList = [
      ...(opts.cook ? [{ name: opts.cook.label, icon: '🔥', tip: 'La barra corre avanti e indietro: <b>tocca</b> quando è sul <b>verde</b> per fermare la cottura' }] : []),
      { name: opts.phase, icon: opts.icon, tip: opts.tip },
    ];
    this.setTime(opts.time);
    this.root.innerHTML = `${opts.ref ? `<div class="dg-ref">${opts.ref}</div>` : ''}<div class="dg-board dg-${opts.board}"></div><div class="dg-tray"></div>
      <button class="btn good full dg-done" disabled>✅ Fatto</button><div class="dg-cook" hidden><div class="dg-cook-l"></div><div class="dg-bar"><i class="dg-green"></i><b class="dg-cur"></b></div><button class="btn good dg-stop">🔥 Ferma la cottura</button></div>`;
    this.board = this.root.querySelector('.dg-board')!;
    // spazio da lasciare sotto il piatto: vassoio e pulsante, più la foto se c'è
    this.root.style.setProperty('--refh', opts.ref ? '96px' : '0px');
    this.tray = this.root.querySelector('.dg-tray')!;
    this.doneBtn = this.root.querySelector('.dg-done')!;
    this.doneBtn.addEventListener('click', () => this.done2());
    for (const s of this.slots) {
      const el = document.createElement('div');
      el.className = 'dg-slot';
      el.dataset.slot = s.id;
      el.style.left = `${s.x * 100}%`;
      el.style.top = `${s.y * 100}%`;
      el.style.setProperty('--sz', String(s.size ?? 0.18));
      el.innerHTML = s.label ? `<small>${s.label}</small>` : '';
      this.board.appendChild(el);
    }
    for (const it of this.items) {
      const el = document.createElement('div');
      el.className = 'dg-item';
      el.innerHTML = `<span>${it.icon}</span>${it.label ? `<small>${it.label}</small>` : ''}`;
      el.addEventListener('pointerdown', (e) => this.down(e, it));
      this.els.set(it.id, el);
      this.tray.appendChild(el);
    }
    this.root.addEventListener('pointermove', (e) => this.move(e));
    this.root.addEventListener('pointerup', (e) => this.up(e));
    this.root.addEventListener('pointercancel', (e) => this.up(e));
    if (opts.cook) {
      this.cook = { label: opts.cook.label, rounds: opts.cook.rounds, done: 0, pos: 0, dir: 1, score: [], speed: opts.cook.speed };
      const ck = this.root.querySelector('.dg-cook') as HTMLElement;
      ck.hidden = false;
      (this.root.querySelector('.dg-cook-l') as HTMLElement).textContent = `${opts.cook.label} 1/${opts.cook.rounds}`;
      this.root.querySelector('.dg-stop')!.addEventListener('click', () => this.stopCook());
    }
  }

  protected resized() {}

  private stopCook() {
    const c = this.cook;
    if (!c) return;
    // verde in mezzo (0,42–0,58): più vicino al centro, meglio
    const d = Math.abs(c.pos - 0.5);
    c.score.push(d < 0.08 ? 1 : d < 0.18 ? 0.6 : 0.2);
    toast(d < 0.08 ? '🔥 Cottura perfetta' : d < 0.18 ? '🔥 Quasi giusta' : d < 0.3 ? '🥩 Troppo cruda o troppo cotta' : '💥 Rovinata', d < 0.18 ? 'good' : 'bad');
    c.done++;
    if (c.done >= c.rounds) {
      (this.root.querySelector('.dg-cook') as HTMLElement).hidden = true;
      this.phaseIdx = 1;
      return;
    }
    (this.root.querySelector('.dg-cook-l') as HTMLElement).textContent = `${c.label} ${c.done + 1}/${c.rounds}`;
    c.pos = 0;
  }

  private down(e: PointerEvent, it: DragItem) {
    if (this.drag || (this.cook && this.cook.done < this.cook.rounds)) return;
    e.preventDefault();
    const el = this.els.get(it.id)!;
    const r = el.getBoundingClientRect();
    this.drag = { it, el, dx: e.clientX - r.left, dy: e.clientY - r.top, pid: e.pointerId };
    document.body.appendChild(el);
    el.classList.add('dragging');
    el.style.left = `${r.left}px`;
    el.style.top = `${r.top}px`;
  }

  private move(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    d.el.style.left = `${e.clientX - d.dx}px`;
    d.el.style.top = `${e.clientY - d.dy}px`;
  }

  private up(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    this.drag = null;
    d.el.classList.remove('dragging');
    d.el.style.left = d.el.style.top = '';
    // sul posto sotto il dito (libero, o scambio con chi c'era)
    const slotEl = [...this.board.querySelectorAll<HTMLElement>('.dg-slot')].find((s) => {
      const r = s.getBoundingClientRect();
      return e.clientX > r.left - 8 && e.clientX < r.right + 8 && e.clientY > r.top - 8 && e.clientY < r.bottom + 8;
    });
    if (slotEl) {
      const sid = slotEl.dataset.slot!;
      const other = [...this.where].find(([, s]) => s === sid)?.[0];
      if (other && other !== d.it.id) {
        this.where.delete(other);
        this.tray.appendChild(this.els.get(other)!);
      }
      this.where.set(d.it.id, sid);
      slotEl.appendChild(d.el);
    } else {
      this.where.delete(d.it.id);
      this.tray.appendChild(d.el);
    }
    this.doneBtn.disabled = this.where.size < Math.min(this.items.length, this.slots.length);
  }

  private done2() {
    if (this.doneBtn.disabled) return;
    let ok = 0;
    for (const it of this.items) {
      const s = this.slots.find((x) => x.id === this.where.get(it.id));
      if (s && it.ok(s)) ok++;
    }
    let q = ok / this.items.length;
    if (this.cook) q = q * 0.6 + (this.cook.score.reduce((a, b) => a + b, 0) / this.cook.score.length) * 0.4;
    const wrong = this.items.length - ok;
    if (wrong) toast(`📋 ${wrong} ${wrong === 1 ? 'al posto sbagliato' : 'al posto sbagliato'}`, 'bad');
    this.finish(qualityStars(q, this));
  }

  protected step(dt: number) {
    const c = this.cook;
    if (c && c.done < c.rounds && !this.frozen) {
      c.pos += c.dir * dt * c.speed;
      if (c.pos > 1) {
        c.pos = 1;
        c.dir = -1;
      } else if (c.pos < 0) {
        c.pos = 0;
        c.dir = 1;
      }
      (this.root.querySelector('.dg-cur') as HTMLElement).style.left = `${c.pos * 100}%`;
    }
  }

  protected statusExtra() {
    return this.cook && this.cook.done < this.cook.rounds ? ` · ${this.cook.done}/${this.cook.rounds}` : ` · ${this.where.size}/${this.items.length}`;
  }
}

// ======================================================================================
// Versa fino alla tacca
// ======================================================================================

export interface PourStep {
  name: string;
  icon: string;
  color: string;
  /** livello da raggiungere (0–1 del bicchiere) e quanto si può sbagliare */
  to: number;
  tol: number;
  /** velocità di riempimento (frazione al secondo) */
  rate: number;
  /** prima di versare: scegli tra queste bottiglie (sommelier) */
  choice?: { right: string; options: { id: string; icon: string; label: string }[]; prompt: string };
  /** prima di versare: tieni la temperatura nel verde (cioccolato) per questi secondi */
  temper?: number;
  /** recipiente nuovo da questo passo (il bicchiere si svuota) */
  fresh?: boolean;
  vessel: 'glass' | 'wine' | 'mold';
}

export class PourRun extends CanvasRun {
  protected phaseList: { name: string; icon: string; tip: string }[];
  private steps: PourStep[];
  private i = 0;
  private fill = 0;
  private base = 0;
  private pouring = false;
  private scores: number[] = [];
  private choosing = false;
  private temp = 0.3;
  private tempOk = 0;
  private flash = '';
  private flashT = 0;
  private picked = '';

  constructor(game: Game, title: string, steps: PourStep[], opts: { time: number; tip: string; icon: string; phase: string }) {
    super(game, title, 'ovl-pour');
    this.steps = steps;
    this.phaseList = [{ name: opts.phase, icon: opts.icon, tip: opts.tip }];
    this.setTime(opts.time);
    this.enter();
  }

  private get cur() {
    return this.steps[this.i];
  }

  private enter() {
    const s = this.cur;
    if (!s) return;
    if (s.fresh) {
      this.fill = 0;
      this.base = 0;
    } else this.base = this.fill;
    this.choosing = !!s.choice;
    this.temp = 0.3;
    this.tempOk = 0;
  }

  private optRects() {
    const o = this.cur.choice!.options;
    const cols = 2;
    const bw = (this.w - 36) / cols;
    return o.map((x, k) => ({ x: 12 + (k % cols) * (bw + 12), y: 90 + Math.floor(k / cols) * 74, w: bw, h: 64, o: x }));
  }

  protected down(x: number, y: number) {
    const s = this.cur;
    if (!s) return;
    if (this.choosing) {
      const r = this.optRects().find((b) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
      if (!r) return;
      this.picked = r.o.id;
      this.choosing = false;
      return;
    }
    this.pouring = true;
  }

  protected up() {
    const s = this.cur;
    if (!s || this.choosing) return;
    this.pouring = false;
    if (s.temper && this.tempOk < s.temper) return;
    if (this.fill - this.base < 0.02) return;
    // quanto vicino alla tacca
    const err = Math.abs(this.fill - s.to);
    let sc = err <= s.tol ? 1 : err <= s.tol * 2.5 ? 0.6 : 0.2;
    if (s.choice && this.picked !== s.choice.right) {
      sc *= 0.4;
      toast('🍷 Non era il vino adatto a questo piatto', 'bad');
    }
    this.scores.push(sc);
    this.flash = sc >= 1 ? 'Perfetto!' : sc > 0.5 ? 'Quasi' : this.fill > s.to ? 'Troppo!' : 'Troppo poco';
    this.flashT = 0.8;
    this.i++;
    if (this.i >= this.steps.length) {
      const q = this.scores.reduce((a, b) => a + b, 0) / this.scores.length;
      this.finish(qualityStars(q, this));
      return;
    }
    this.enter();
  }

  protected step(dt: number) {
    const s = this.cur;
    this.flashT = Math.max(0, this.flashT - dt);
    if (s && !this.choosing && !this.frozen) {
      if (s.temper && this.tempOk < s.temper) {
        // tenendo premuto si scalda, lasciando si raffredda: resta nel verde abbastanza a lungo
        this.temp += (this.finger ? 0.35 : -0.25) * dt;
        this.temp = Math.max(0, Math.min(1, this.temp));
        if (this.temp > 0.45 && this.temp < 0.62) this.tempOk += dt;
        if (this.tempOk >= s.temper) toast('🌡️ Temperatura giusta: ora versa!', 'good');
      } else if (this.pouring) {
        this.fill = Math.min(1.08, this.fill + s.rate * dt);
      }
    }
    this.draw();
  }

  private draw() {
    const g = this.g;
    const { w, h } = this;
    g.fillStyle = C.paper;
    g.fillRect(0, 0, w, h);
    const s = this.cur;
    if (!s) return;
    this.text(`${s.icon} ${s.name}`, w / 2, 26, 20);
    if (this.choosing) {
      this.text(s.choice!.prompt, w / 2, 62, 16);
      for (const b of this.optRects()) {
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.roundRect(b.x, b.y, b.w, b.h, 12);
        g.fill();
        g.strokeStyle = C.ink;
        g.lineWidth = 2;
        g.stroke();
        this.text(b.o.icon, b.x + 26, b.y + b.h / 2, 26);
        g.textAlign = 'left';
        this.text(b.o.label, b.x + 52 + (b.w - 60) / 2, b.y + b.h / 2, 13);
      }
      return;
    }
    // recipiente: bicchiere, calice o stampo, con la tacca
    const vw = Math.min(w * 0.5, 180);
    const vh = Math.min(h * 0.55, 300);
    const vx = (w - vw) / 2;
    const vy = h * 0.22;
    g.strokeStyle = C.ink;
    g.lineWidth = 4;
    g.fillStyle = 'rgba(255,255,255,.7)';
    g.beginPath();
    if (s.vessel === 'wine') g.roundRect(vx, vy, vw, vh * 0.7, [10, 10, vw / 2, vw / 2]);
    else g.roundRect(vx, vy, vw, vh, 12);
    g.fill();
    g.stroke();
    const H = s.vessel === 'wine' ? vh * 0.7 : vh;
    const lv = Math.min(1, this.fill);
    g.fillStyle = s.color;
    g.fillRect(vx + 4, vy + H - H * lv, vw - 8, H * lv - 2);
    // tacca
    const ty = vy + H - H * s.to;
    g.strokeStyle = C.bad;
    g.setLineDash([8, 6]);
    g.beginPath();
    g.moveTo(vx - 14, ty);
    g.lineTo(vx + vw + 14, ty);
    g.stroke();
    g.setLineDash([]);
    if (this.fill > 1) this.text('💦 Trabocca!', w / 2, vy - 16, 18, C.bad, 700);
    if (s.temper && this.tempOk < s.temper) {
      // termometro
      const tx = vx + vw + 30;
      g.fillStyle = 'rgba(0,0,0,.12)';
      g.fillRect(tx, vy, 18, vh);
      g.fillStyle = 'rgba(53,196,106,.5)';
      g.fillRect(tx, vy + vh * (1 - 0.62), 18, vh * 0.17);
      g.fillStyle = C.bad;
      g.fillRect(tx - 6, vy + vh * (1 - this.temp) - 3, 30, 6);
      this.text(`🌡️ ${Math.round((this.tempOk / s.temper) * 100)}%`, w / 2, h - 50, 18);
      this.text(this.finger ? '🔥 Scalda…' : '✊ Tieni premuto per scaldare, lascia per raffreddare', w / 2, h - 24, 14);
    } else this.text(this.pouring ? '🫗 Versa… lascia alla tacca' : '✊ Tieni premuto per versare', w / 2, h - 24, 15);
    if (this.flashT > 0) this.text(this.flash, w / 2, vy + H / 2, 28, this.flash === 'Perfetto!' ? C.good : C.bad, 700);
  }

  protected statusExtra() {
    return ` · ${Math.min(this.i + 1, this.steps.length)}/${this.steps.length}`;
  }
}

// ======================================================================================
// Impila i piani che dondolano
// ======================================================================================

export class StackRun extends CanvasRun {
  protected phaseList = [{ name: 'Impila i piani della torta', icon: '💒', tip: 'Il piano dondola appeso: <b>tocca</b> quando è proprio sopra quello di sotto per lasciarlo cadere. Più è centrato, meglio è' }];
  private tiers: { w: number; off: number }[] = [];
  private n: number;
  private swing = 0;
  private speed: number;
  private dropping: { y: number; off: number; v: number } | null = null;
  private scores: number[] = [];

  constructor(game: Game, title: string, opts: { tiers: number; speed: number; time: number }) {
    super(game, title, 'ovl-stack');
    this.n = opts.tiers;
    this.speed = opts.speed;
    this.setTime(opts.time);
  }

  private tierW(i: number) {
    return Math.min(this.w * 0.7, 240) * (1 - i * 0.22);
  }

  /** quanto dondola: mai fuori dal riquadro (il piano resta tutto visibile) */
  private get offNow() {
    const amp = Math.max(20, (this.w - this.tierW(this.tiers.length)) / 2 - 8);
    return Math.sin(this.swing) * amp;
  }

  protected down() {
    if (this.dropping || this.tiers.length >= this.n) return;
    this.dropping = { y: 70, off: this.offNow, v: 0 };
  }

  protected step(dt: number) {
    if (!this.frozen) this.swing += dt * this.speed * (1 + this.tiers.length * 0.25);
    const d = this.dropping;
    if (d) {
      d.v += 900 * dt;
      d.y += d.v * dt;
      const i = this.tiers.length;
      const stackTop = this.h - 70 - this.tiers.reduce((a) => a + 44, 0);
      if (d.y >= stackTop - 44) {
        const below = this.tiers[i - 1]?.off ?? 0;
        const err = Math.abs(d.off - below) / (this.tierW(i) / 2);
        this.scores.push(err < 0.12 ? 1 : err < 0.3 ? 0.7 : err < 0.6 ? 0.35 : 0);
        toast(err < 0.12 ? '💒 Perfettamente centrato!' : err < 0.3 ? 'Un po\' storto' : err < 0.6 ? '😬 Molto storto' : '💥 Il piano è scivolato', err < 0.3 ? 'good' : 'bad');
        this.tiers.push({ w: this.tierW(i), off: err < 0.6 ? d.off : below });
        this.dropping = null;
        if (this.tiers.length >= this.n) {
          const q = this.scores.reduce((a, b) => a + b, 0) / this.scores.length;
          setTimeout(() => this.finish(qualityStars(q, this)), 700);
        }
      }
    }
    this.draw();
  }

  private draw() {
    const g = this.g;
    const { w, h } = this;
    g.fillStyle = '#fdeef4';
    g.fillRect(0, 0, w, h);
    this.text(`Piano ${Math.min(this.tiers.length + 1, this.n)}/${this.n}`, w / 2, 26, 20);
    const cx = w / 2;
    // vassoio
    g.fillStyle = '#c0c4cc';
    g.fillRect(cx - w * 0.38, h - 70, w * 0.76, 10);
    let y = h - 70;
    const tier = (tw: number, x: number, yy: number) => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.roundRect(x - tw / 2, yy - 44, tw, 44, 8);
      g.fill();
      g.strokeStyle = '#f2a7c3';
      g.lineWidth = 4;
      g.stroke();
      g.fillStyle = '#f7c6d9';
      g.fillRect(x - tw / 2 + 4, yy - 22, tw - 8, 6);
    };
    for (const t of this.tiers) {
      tier(t.w, cx + t.off, y);
      y -= 44;
    }
    const i = this.tiers.length;
    if (i < this.n) {
      const d = this.dropping;
      const off = d ? d.off : this.offNow;
      const yy = d ? d.y + 44 : 114;
      if (!d) {
        g.strokeStyle = '#666';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx, 40);
        g.lineTo(cx + off, yy - 44);
        g.stroke();
      }
      tier(this.tierW(i), cx + off, yy);
      // guida: dove dovrebbe cadere
      g.strokeStyle = 'rgba(53,196,106,.6)';
      g.setLineDash([6, 6]);
      g.beginPath();
      const below = this.tiers[i - 1]?.off ?? 0;
      g.moveTo(cx + below, 60);
      g.lineTo(cx + below, y);
      g.stroke();
      g.setLineDash([]);
    }
    this.text('👆 Tocca quando il piano è sopra la linea verde', w / 2, h - 24, 14);
  }

  protected resized(w: number, h: number) {
    super.resized(w, h);
  }

  protected statusExtra() {
    return ` · ${this.tiers.length}/${this.n}`;
  }
}
