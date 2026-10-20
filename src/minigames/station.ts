import type { Game } from '../game';
import { layout } from '../ui/layout';
import { fillTextIco } from '../ui/icons';

/**
 * Minigioco col dito dentro un lavoretto in 3D (impastare, dare la forma…): toccando la postazione si apre un
 * riquadro nella zona libera dello schermo, come i minigiochi col dito (vedi overlay.ts). Finché è aperto
 * joystick e pulsante azione spariscono e il resto dello schermo non si tocca; il tempo del lavoretto scorre.
 * Finito, il riquadro si chiude e `onEnd` riceve la qualità (0–1).
 */
export abstract class Station {
  protected root: HTMLDivElement;
  private back: HTMLDivElement;
  protected cv: HTMLCanvasElement;
  protected g: CanvasRenderingContext2D;
  protected w = 300;
  protected h = 400;
  protected finger: { x: number; y: number } | null = null;
  private offLayout: () => void;
  private timer = 0;
  closed = false;

  constructor(private onEnd: (q: number) => void) {
    // tutto lo schermo sotto il riquadro: i tocchi fuori non arrivano al gioco
    this.back = document.createElement('div');
    this.back.className = 'st-back';
    document.body.appendChild(this.back);
    this.root = document.createElement('div');
    this.root.className = 'ovl ovl-station';
    this.root.innerHTML = '<canvas></canvas>';
    document.body.appendChild(this.root);
    document.body.classList.add('overlay-job');
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
    this.offLayout = layout.on(() => this.place(), false);
    requestAnimationFrame(() => this.place());
    this.timer = window.setInterval(() => this.place(), 250);
  }

  /** Il riquadro occupa la zona libera dai riquadri in alto e dalla colonna dei pulsanti. */
  private place() {
    const dock = layout.panelDock;
    const r = layout.freeRect([{ sel: '.jobbar.on', dock }, { sel: '.tut-bubble', dock }, { sel: '.hud-right .hud-btns', dock: 'right' }]);
    const s = this.root.style;
    s.left = `${r.x + 6}px`;
    s.top = `${r.y + 4}px`;
    const w = Math.max(140, Math.round(r.w - 12));
    const h = Math.max(160, Math.round(r.h - 10));
    s.width = `${w}px`;
    s.height = `${h}px`;
    if (w === this.w && h === this.h && this.cv.width) return;
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
  /** un fotogramma: logica e disegno */
  abstract step(dt: number): void;

  /** Fine del minigioco: si chiude e dice com'è andata. */
  end(q: number) {
    if (this.closed) return;
    this.close();
    this.onEnd(Math.max(0, Math.min(1, q)));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    this.offLayout();
    this.root.remove();
    this.back.remove();
    document.body.classList.remove('overlay-job');
  }

  protected text(t: string, x: number, y: number, size: number, color = '#3a2f55', weight = 600) {
    const g = this.g;
    g.fillStyle = color;
    g.font = `${weight} ${Math.round(size)}px Fredoka, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fillTextIco(g, t, x, y, this.w - 16);
  }

  /** Riquadro quadrato più grande che sta tra il titolo e la barra in fondo. */
  protected square(top = 64, bottom = 30) {
    const s = Math.min(this.w - 24, this.h - top - bottom);
    return { x: (this.w - s) / 2, y: top + (this.h - top - bottom - s) / 2, s };
  }

  protected bar(k: number, color = '#35c46a') {
    const g = this.g;
    g.fillStyle = 'rgba(0,0,0,.12)';
    g.fillRect(20, this.h - 18, this.w - 40, 8);
    g.fillStyle = color;
    g.fillRect(20, this.h - 18, (this.w - 40) * Math.min(1, k), 8);
  }
}

// ======================================================================================
// Impastare: il dito avanti e indietro sull'impasto, a ritmo
// ======================================================================================

/**
 * Impasta col dito: trascina avanti e indietro sull'impasto (ogni passata lunga è una piega). Le palline di
 * farina spariscono e l'impasto diventa liscio. Se ti fermi troppo l'impasto resta grumoso (vale meno).
 */
export class KneadStation extends Station {
  private folds = 0;
  private dir = 0;
  private startX = 0;
  private lastX = 0;
  private idle = 0;
  private started = false;
  private pauses = 0;
  private squish = 0;
  private lumps: { x: number; y: number; r: number }[];

  constructor(private need: number, onEnd: (q: number) => void) {
    super(onEnd);
    this.lumps = Array.from({ length: need }, () => {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * 0.28;
      return { x: 0.5 + Math.cos(a) * d * 1.3, y: 0.55 + Math.sin(a) * d * 0.7, r: 0.025 + Math.random() * 0.02 };
    });
  }

  protected down(x: number) {
    this.startX = this.lastX = x;
    this.dir = 0;
  }

  protected move(x: number) {
    const dx = x - this.lastX;
    if (Math.abs(dx) < 2) return;
    const d = Math.sign(dx);
    // cambio di verso: se la passata era lunga abbastanza conta come una piega
    if (this.dir && d !== this.dir) {
      if (Math.abs(this.lastX - this.startX) > this.w * 0.28) this.fold();
      this.startX = this.lastX;
    }
    this.dir = d;
    this.lastX = x;
    this.squish = Math.max(-1, Math.min(1, (x - this.w / 2) / (this.w * 0.35)));
  }

  protected up() {
    if (Math.abs(this.lastX - this.startX) > this.w * 0.28) this.fold();
    this.startX = this.lastX;
  }

  private fold() {
    // una pausa lunga tra due pieghe: l'impasto si rapprende un po'
    if (this.started && this.idle > 1.3) this.pauses++;
    this.started = true;
    this.idle = 0;
    this.folds++;
    this.lumps.pop();
    if (this.folds >= this.need) this.end(Math.max(0.3, 1 - 0.15 * this.pauses));
  }

  step(dt: number) {
    this.idle += dt;
    if (!this.finger) this.squish *= Math.max(0, 1 - dt * 6);
    const g = this.g;
    const { w, h } = this;
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text('🌀 Impasta', w / 2, 24, 20);
    this.text('trascina il dito avanti e indietro, senza fermarti', w / 2, 48, 13, '#7a6f8f', 500);
    const sq = this.square(70, 34);
    // piano di lavoro e impasto (si schiaccia dalla parte del dito)
    g.fillStyle = '#d9a46a';
    g.beginPath();
    g.roundRect(sq.x, sq.y + sq.s * 0.15, sq.s, sq.s * 0.8, 18);
    g.fill();
    const smooth = this.folds / this.need;
    const cx = sq.x + sq.s * (0.5 + this.squish * 0.08);
    const cy = sq.y + sq.s * 0.55;
    g.fillStyle = smooth > 0.99 ? '#f8ecd2' : '#efe0bf';
    g.beginPath();
    g.ellipse(cx, cy, sq.s * (0.34 + Math.abs(this.squish) * 0.06), sq.s * (0.24 - Math.abs(this.squish) * 0.03), 0, 0, Math.PI * 2);
    g.fill();
    // palline di farina ancora da lavorare
    g.fillStyle = '#d8c39a';
    for (const l of this.lumps) {
      g.beginPath();
      g.arc(sq.x + (l.x + this.squish * 0.08) * sq.s, sq.y + l.y * sq.s, l.r * sq.s, 0, Math.PI * 2);
      g.fill();
    }
    // frecce che ricordano il gesto
    if (this.folds < 2) this.text('⬅️   ➡️', w / 2, sq.y + sq.s * 0.92, 22);
    if (this.started && this.idle > 1.3) this.text('Non fermarti!', w / 2, sq.y + sq.s * 0.25, 18, '#e5484d');
    this.text(`${this.folds}/${this.need} pieghe`, w / 2, h - 34, 14, '#7a6f8f', 500);
    this.bar(smooth);
  }
}

// ======================================================================================
// Dare la forma: segui la sagoma col dito
// ======================================================================================

type Pt = [number, number];

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

const ring = (cx: number, cy: number, rx: number, ry: number, n = 32): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry]);

/** Sagome da seguire (coordinate 0–1): pagnotta tonda, filone allungato avanti e indietro, cornetto arrotolato. */
export const SHAPE_PATHS: Record<string, { hint: string; paths: Pt[][] }> = {
  pagnotta: { hint: 'gira il dito tutto intorno: una palla tonda', paths: [ring(0.5, 0.52, 0.3, 0.3)] },
  filone: { hint: 'allunga l\'impasto: avanti e indietro lungo la riga', paths: [[[0.1, 0.46], [0.9, 0.46]], [[0.9, 0.58], [0.1, 0.58]]] },
  cornetti: { hint: 'segui il triangolo, poi arrotola dalla base alla punta', paths: [[[0.15, 0.25], [0.85, 0.25], [0.5, 0.85], [0.15, 0.25]], [[0.5, 0.3], [0.5, 0.78]]] },
};

/** Dai la forma: segui la sagoma tratteggiata; si accende dove passi. Precisione e copertura fanno la qualità. */
export class ShapeStation extends Station {
  private samples: { p: Pt; hit: boolean }[][];
  private stroke: Pt[] = [];
  private strokes: Pt[][] = [];
  private inside = 0;
  private total = 0;

  constructor(private name: string, private icon: string, private shape: { hint: string; paths: Pt[][] }, private tol: number, onEnd: (q: number) => void) {
    super(onEnd);
    this.samples = shape.paths.map((p) => resample(p).map((q) => ({ p: q, hit: false })));
  }

  private cover() {
    const all = this.samples.flat();
    return all.filter((x) => x.hit).length / Math.max(1, all.length);
  }

  protected down(x: number, y: number) {
    this.stroke = [];
    this.move(x, y);
  }

  protected move(x: number, y: number) {
    const sq = this.square(70, 34);
    const p: Pt = [(x - sq.x) / sq.s, (y - sq.y) / sq.s];
    // il dito veloce salta dei punti: si riempie il tratto tra l'ultimo punto e questo
    const last = this.stroke[this.stroke.length - 1];
    if (last) {
      const n = Math.min(40, Math.floor(Math.hypot(p[0] - last[0], p[1] - last[1]) / (this.tol / 2)));
      for (let k = 1; k <= n; k++) this.touch([last[0] + ((p[0] - last[0]) * k) / (n + 1), last[1] + ((p[1] - last[1]) * k) / (n + 1)]);
    }
    this.stroke.push(p);
    this.touch(p);
  }

  private touch(p: Pt) {
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
    if (this.stroke.length) this.strokes.push(this.stroke);
    this.stroke = [];
    // tutta la sagoma, e ogni tratto quasi tutto (il cornetto va anche arrotolato)
    if (this.cover() >= 0.9 && this.samples.every((path) => path.filter((x) => x.hit).length / path.length >= 0.8)) {
      const acc = this.total ? this.inside / this.total : 0;
      this.end(Math.min(1, 0.55 * this.cover() + 0.45 * acc));
    }
  }

  step() {
    const g = this.g;
    const { w, h } = this;
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text(`👐 Forma: ${this.icon} ${this.name}`, w / 2, 24, 20);
    this.text(this.shape.hint, w / 2, 48, 13, '#7a6f8f', 500);
    const sq = this.square(70, 34);
    const P = (p: Pt) => [sq.x + p[0] * sq.s, sq.y + p[1] * sq.s] as const;
    g.fillStyle = '#d9a46a';
    g.beginPath();
    g.roundRect(sq.x, sq.y + sq.s * 0.08, sq.s, sq.s * 0.86, 18);
    g.fill();
    // impasto steso sotto la sagoma
    g.fillStyle = 'rgba(248,236,210,.75)';
    g.beginPath();
    g.ellipse(sq.x + sq.s / 2, sq.y + sq.s * 0.52, sq.s * 0.4, sq.s * 0.36, 0, 0, Math.PI * 2);
    g.fill();
    g.lineCap = 'round';
    for (const path of this.samples) {
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, ay] = P(path[i].p);
        const [bx, by] = P(path[i + 1].p);
        g.strokeStyle = path[i].hit ? 'rgba(53,196,106,.95)' : 'rgba(58,47,85,.5)';
        g.lineWidth = path[i].hit ? 6 : 3;
        g.setLineDash(path[i].hit ? [] : [6, 6]);
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
      }
      // dove si parte
      const [sx, sy] = P(path[0].p);
      g.setLineDash([]);
      g.fillStyle = '#ffc21a';
      g.beginPath();
      g.arc(sx, sy, 7, 0, Math.PI * 2);
      g.fill();
    }
    g.setLineDash([]);
    g.strokeStyle = '#b5793d';
    g.lineWidth = Math.max(5, sq.s * 0.025);
    for (const s of [...this.strokes, this.stroke]) {
      if (s.length < 2) continue;
      g.beginPath();
      s.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
      g.stroke();
    }
    this.bar(this.cover() / 0.9);
  }
}

// ======================================================================================
// Tagliare: prendi il coltello e muovilo su e giù sulle linee
// ======================================================================================

/** Ingredienti da tagliare: come si disegnano sul tagliere (lunghi o tondi) e di che colore sono. */
export const VEGGIES = {
  carota: { icon: '🥕', name: 'carota', long: true, color: '#f08a24', in: '#f7b25c' },
  cetriolo: { icon: '🥒', name: 'cetriolo', long: true, color: '#3f8f3a', in: '#cfe8a4' },
  melanzana: { icon: '🍆', name: 'melanzana', long: true, color: '#5b2a6e', in: '#efe3c0' },
  cipolla: { icon: '🧅', name: 'cipolla', long: false, color: '#b8457a', in: '#f3d3e4' },
  pomodoro: { icon: '🍅', name: 'pomodoro', long: false, color: '#e0402f', in: '#f58a6c' },
  peperone: { icon: '🫑', name: 'peperone', long: false, color: '#3aa040', in: '#d9f0b8' },
} as const;
export type Veggie = keyof typeof VEGGIES;

/**
 * Tagliare: il coltello è appoggiato sul tagliere; lo prendi col dito (si alza in verticale e segue il dito)
 * e lo muovi su e giù sopra una linea tratteggiata: a ogni passata la lama scende un po' nell'ingrediente,
 * dopo `strokes` passate la fetta si stacca. Le passate vicino alla linea valgono di più; quelle fuori da
 * ogni linea lasciano un taglio storto (vale meno). Finite le linee, `onEnd` riceve la qualità.
 */
export class CutStation extends Station {
  private v: (typeof VEGGIES)[Veggie];
  /** linee (0–1 lungo l'ingrediente), quante passate hanno avuto e lo spostamento della fetta a destra */
  private lines: { u: number; n: number; shift: number }[];
  private knife = { x: 0.82, y: 0.86, held: false, up: false, ox: 0, oy: 0 };
  private dir = 0;
  private lastY = 0;
  private turnY = 0;
  /** fin dove è arrivata la lama (in alto e in basso) nella passata in corso */
  private sweep = { top: 9, bot: -9, x0: 9, x1: -9 };
  private accs: number[] = [];
  private misses: number[] = [];
  private crumbs: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private flash = 0;
  private bob = 0;
  private finished = -1;

  constructor(veg: Veggie, nLines: number, private strokes: number, private tol: number, onEnd: (q: number) => void) {
    super(onEnd);
    this.v = VEGGIES[veg];
    this.lines = Array.from({ length: nLines }, (_, i) => ({ u: (i + 1) / (nLines + 1), n: 0, shift: 0 }));
  }

  /** Dove sta l'ingrediente nel riquadro (coordinate 0–1 del quadrato). */
  private shape() {
    return this.v.long ? { x0: 0.16, x1: 0.84, y0: 0.4, y1: 0.58 } : { x0: 0.28, x1: 0.72, y0: 0.27, y1: 0.71 };
  }

  private sq() {
    return this.square(70, 34);
  }

  /** Dove sta adesso la linea `i` (0–1): le fette staccate si allargano un po' e le linee si spostano con loro. */
  private lineX(i: number) {
    const s = this.shape();
    const tot = this.lines.reduce((a, l) => a + l.shift, 0);
    let off = -tot / 2;
    for (let j = 0; j < i; j++) off += this.lines[j].shift;
    return s.x0 + (s.x1 - s.x0) * this.lines[i].u + off;
  }

  /** Lama in verticale: il dito tiene il manico, la lama va in su (coordinate 0–1). */
  private blade() {
    const s = this.shape();
    const len = Math.max(0.3, (s.y1 - s.y0) * 1.15);
    return { x: this.knife.x, top: this.knife.y - len, bot: this.knife.y };
  }

  protected down(x: number, y: number) {
    const sq = this.sq();
    const p = [(x - sq.x) / sq.s, (y - sq.y) / sq.s];
    const k = this.knife;
    // si prende toccando il coltello (lama o manico), con un po' di margine per il dito
    const b = this.blade();
    const onKnife = k.up
      ? Math.abs(p[0] - k.x) < 0.09 && p[1] > b.top - 0.05 && p[1] < k.y + 0.2
      : Math.abs(p[1] - k.y) < 0.09 && p[0] > k.x - 0.45 && p[0] < k.x + 0.2;
    if (!onKnife) return;
    if (!k.up) {
      // si alza in verticale: il dito tiene il manico
      k.up = true;
      k.y = p[1] - 0.06;
      k.x = p[0];
    }
    k.held = true;
    k.ox = k.x - p[0];
    k.oy = k.y - p[1];
    this.lastY = this.turnY = k.y;
    this.dir = 0;
    this.resetSweep();
  }

  private resetSweep() {
    const b = this.blade();
    this.sweep = { top: b.top, bot: b.bot, x0: b.x, x1: b.x };
  }

  protected move(x: number, y: number) {
    const k = this.knife;
    if (!k.held) return;
    const sq = this.sq();
    k.x = Math.max(0.04, Math.min(0.96, (x - sq.x) / sq.s + k.ox));
    k.y = Math.max(0.3, Math.min(1.05, (y - sq.y) / sq.s + k.oy));
    this.sweep.x0 = Math.min(this.sweep.x0, k.x);
    this.sweep.x1 = Math.max(this.sweep.x1, k.x);
    const dy = k.y - this.lastY;
    if (Math.abs(dy) < 0.006) return;
    const d = Math.sign(dy);
    // cambio di verso: la passata (su o giù) è finita
    if (this.dir && d !== this.dir) {
      this.stroke(Math.abs(this.lastY - this.turnY));
      this.turnY = this.lastY;
      this.resetSweep();
    }
    this.dir = d;
    this.lastY = k.y;
    const b = this.blade();
    this.sweep.top = Math.min(this.sweep.top, b.top);
    this.sweep.bot = Math.max(this.sweep.bot, b.bot);
  }

  protected up() {
    if (this.knife.held) this.stroke(Math.abs(this.lastY - this.turnY));
    this.turnY = this.lastY;
    this.resetSweep();
    this.knife.held = false;
  }

  /** Una passata della lama: taglia la linea sotto la lama (se c'è) o lascia un taglio storto. */
  private stroke(len: number) {
    if (len < 0.08 || this.finished >= 0) return;
    // andata molto di lato: il coltello si sta spostando verso un'altra linea, non taglia
    if (this.sweep.x1 - this.sweep.x0 > Math.max(0.045, this.tol * 1.2)) return;
    const s = this.shape();
    // la lama a metà della passata
    const b = { ...this.blade(), x: (this.sweep.x0 + this.sweep.x1) / 2 };
    // nella passata la lama deve attraversare l'ingrediente, non restare sopra o sotto
    const cover = Math.min(this.sweep.bot, s.y1) - Math.max(this.sweep.top, s.y0);
    if (cover < (s.y1 - s.y0) * 0.5) return;
    if (b.x < s.x0 - 0.06 || b.x > s.x1 + 0.06) return;
    let best: (typeof this.lines)[number] | null = null;
    let bd = Infinity;
    for (const [i, l] of this.lines.entries()) {
      if (l.n >= this.strokes) continue;
      const d = Math.abs(this.lineX(i) - b.x);
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    const tol = this.tol;
    // ancora sopra una linea già tagliata: niente di male, non conta
    if (this.lines.some((l, i) => l.n >= this.strokes && Math.abs(this.lineX(i) - b.x) < tol) && !(best && bd < tol)) return;
    if (best && bd < tol) {
      best.n++;
      this.accs.push(1 - 0.6 * (bd / tol));
      this.bob = 1;
      for (let i = 0; i < 5; i++) this.crumbs.push({ x: b.x, y: s.y0 + (s.y1 - s.y0) * (best.n / this.strokes), vx: (Math.random() - 0.5) * 0.3, vy: -Math.random() * 0.25, life: 0.6 });
      if (this.lines.every((l) => l.n >= this.strokes)) this.finished = 0;
      return;
    }
    // fuori dalle linee: un taglio storto (ogni punto solo una volta)
    if (best && !this.misses.some((m) => Math.abs(m - b.x) < tol)) this.misses.push(b.x);
    this.flash = 1.2;
  }

  /** Il contorno dell'ingrediente (solo il percorso). */
  private body(x: number, y: number, w: number, h: number) {
    const g = this.g;
    if (this.v.name === 'carota') {
      g.moveTo(x, y + h * 0.1);
      g.quadraticCurveTo(x + w * 0.55, y, x + w, y + h * 0.42);
      g.lineTo(x + w, y + h * 0.58);
      g.quadraticCurveTo(x + w * 0.55, y + h, x, y + h * 0.9);
      g.closePath();
    } else if (this.v.long) g.roundRect(x, y, w, h, h / 2);
    else g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  }

  /** Disegna l'ingrediente intero nel rettangolo (x, y, w, h) in pixel. */
  private veggie(x: number, y: number, w: number, h: number) {
    const g = this.g;
    const v = this.v;
    g.fillStyle = v.color;
    g.beginPath();
    this.body(x, y, w, h);
    g.fill();
    // riflesso e dettagli
    g.fillStyle = 'rgba(255,255,255,.22)';
    g.beginPath();
    if (v.long) g.roundRect(x + w * 0.08, y + h * 0.18, w * 0.7, h * 0.16, h * 0.08);
    else g.ellipse(x + w * 0.36, y + h * 0.3, w * 0.14, h * 0.08, -0.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = v.name === 'cipolla' ? '#d9b07a' : '#2f8a3a';
    if (v.name === 'carota') {
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.ellipse(x - h * 0.3, y + h * (0.3 + i * 0.2), h * 0.4, h * 0.1, (i - 1) * 0.5, 0, Math.PI * 2);
        g.fill();
      }
    } else if (v.name === 'melanzana') {
      g.beginPath();
      g.roundRect(x - h * 0.15, y + h * 0.15, h * 0.45, h * 0.7, h * 0.15);
      g.fill();
    } else if (!v.long) {
      g.beginPath();
      g.ellipse(x + w / 2, y + h * 0.03, w * 0.08, h * 0.05, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  step(dt: number) {
    const g = this.g;
    const { w, h } = this;
    const sq = this.sq();
    const P = (u: number, v: number) => [sq.x + u * sq.s, sq.y + v * sq.s] as const;
    const s = this.shape();
    const k = this.knife;
    this.flash = Math.max(0, this.flash - dt);
    this.bob = Math.max(0, this.bob - dt * 5);
    for (const l of this.lines) l.shift += ((l.n >= this.strokes ? 0.022 : 0) - l.shift) * Math.min(1, dt * 10);
    if (this.finished >= 0) {
      this.finished += dt;
      if (this.finished > 0.7) {
        const acc = this.accs.reduce((a, b) => a + b, 0) / Math.max(1, this.accs.length);
        this.end(Math.max(0.2, acc - 0.08 * this.misses.length));
        return;
      }
    }
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text(`🔪 Taglia: ${this.v.icon} ${this.v.name}`, w / 2, 24, 20);
    this.text(k.up ? 'muovi il coltello su e giù sopra ogni linea' : 'prendi il coltello col dito', w / 2, 48, 13, '#7a6f8f', 500);
    // tagliere
    const [bx, by] = P(0.04, 0.12);
    g.fillStyle = '#e9c48f';
    g.beginPath();
    g.roundRect(bx, by, sq.s * 0.92, sq.s * 0.84, 18);
    g.fill();
    g.fillStyle = '#dcb27a';
    g.beginPath();
    g.roundRect(bx + 8, by + 8, sq.s * 0.92 - 16, sq.s * 0.84 - 16, 14);
    g.fill();
    // fette: ogni pezzo tra due linee si sposta di quanto si sono staccate le linee alla sua sinistra
    const xs = (u: number) => s.x0 + (s.x1 - s.x0) * u;
    const tot = this.lines.reduce((a, l) => a + l.shift, 0);
    const [x0, y0] = P(s.x0, s.y0);
    const iw = (s.x1 - s.x0) * sq.s;
    const ih = (s.y1 - s.y0) * sq.s;
    const cuts = [-1, ...this.lines.map((l) => xs(l.u)), 2];
    let off = -tot / 2;
    for (let i = 0; i < cuts.length - 1; i++) {
      if (i > 0) off += this.lines[i - 1].shift;
      g.save();
      g.translate(off * sq.s, 0);
      g.beginPath();
      g.rect(sq.x + cuts[i] * sq.s, 0, (cuts[i + 1] - cuts[i]) * sq.s, h);
      g.clip();
      this.veggie(x0, y0, iw, ih);
      // la faccia tagliata (colore dell'interno) sui lati staccati della fetta
      g.beginPath();
      this.body(x0, y0, iw, ih);
      g.clip();
      g.fillStyle = this.v.in;
      if (i > 0 && this.lines[i - 1].n >= this.strokes) g.fillRect(sq.x + cuts[i] * sq.s, y0, 4, ih);
      if (i < this.lines.length && this.lines[i].n >= this.strokes) g.fillRect(sq.x + cuts[i + 1] * sq.s - 4, y0, 4, ih);
      g.restore();
    }
    // linee da tagliare: tratteggiate; il taglio scende passata dopo passata
    off = -tot / 2;
    const b = this.blade();
    this.lines.forEach((l, i) => {
      off += i ? this.lines[i - 1].shift : 0;
      const cx = sq.x + (xs(l.u) + off) * sq.s;
      if (l.n >= this.strokes) return;
      const near = k.up && Math.abs(b.x - this.lineX(i)) < this.tol;
      g.strokeStyle = near ? '#ffc21a' : 'rgba(255,255,255,.95)';
      g.lineWidth = near ? 4 : 3;
      g.setLineDash([7, 6]);
      g.beginPath();
      g.moveTo(cx, y0 - 14);
      g.lineTo(cx, y0 + ih + 14);
      g.stroke();
      g.setLineDash([]);
      if (l.n) {
        g.strokeStyle = 'rgba(40,20,20,.65)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(cx, y0);
        g.lineTo(cx, y0 + ih * (l.n / this.strokes));
        g.stroke();
      }
    });
    // tagli storti
    g.strokeStyle = 'rgba(120,30,30,.6)';
    g.lineWidth = 2;
    for (const m of this.misses) {
      const cx = sq.x + m * sq.s;
      g.beginPath();
      g.moveTo(cx - 4, y0 + ih * 0.2);
      g.lineTo(cx + 4, y0 + ih * 0.8);
      g.stroke();
    }
    // briciole
    g.fillStyle = this.v.in;
    this.crumbs = this.crumbs.filter((c) => (c.life -= dt) > 0);
    for (const c of this.crumbs) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += dt * 0.8;
      const [px, py] = P(c.x, c.y);
      g.beginPath();
      g.arc(px, py, 3, 0, Math.PI * 2);
      g.fill();
    }
    this.drawKnife();
    if (!k.up) {
      // manina che dice di prendere il coltello
      const [hx, hy] = P(k.x, k.y);
      const pulse = 1 + 0.15 * Math.sin(performance.now() / 160);
      g.strokeStyle = '#ffc21a';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(hx, hy, 26 * pulse, 0, Math.PI * 2);
      g.stroke();
      this.text('👆', hx + 10, hy + 26, 26);
    } else if (this.lines.every((l) => !l.n) && !k.held) this.text('↕️', sq.x + b.x * sq.s + 30, sq.y + ((b.top + b.bot) / 2) * sq.s, 26);
    if (this.flash > 0) this.text('Sulla linea!', w / 2, sq.y + sq.s * 0.2, 18, '#e5484d');
    const doneN = this.lines.reduce((a, l) => a + Math.min(l.n, this.strokes), 0);
    this.text(`${this.lines.filter((l) => l.n >= this.strokes).length}/${this.lines.length} tagli`, w / 2, h - 34, 14, '#7a6f8f', 500);
    this.bar(doneN / (this.lines.length * this.strokes));
  }

  private drawKnife() {
    const g = this.g;
    const sq = this.sq();
    const k = this.knife;
    g.save();
    if (!k.up) {
      // appoggiato sul tagliere, in orizzontale: manico a destra
      g.translate(sq.x + k.x * sq.s, sq.y + k.y * sq.s);
      g.rotate(-Math.PI / 2);
    } else {
      // in verticale, il dito sul manico; dondola un po' a ogni passata
      g.translate(sq.x + k.x * sq.s, sq.y + k.y * sq.s);
      g.rotate(this.bob * 0.06);
    }
    const s = sq.s;
    const len = (this.blade().bot - this.blade().top) * s;
    const bw = s * 0.07;
    // ombra
    if (!k.up) {
      g.fillStyle = 'rgba(0,0,0,.15)';
      g.beginPath();
      g.roundRect(-bw / 2 + 3, -len + 4, bw, len + s * 0.15, 6);
      g.fill();
    }
    // lama: il filo sta sulla linea (x = 0), il dorso a destra
    const grad = g.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    grad.addColorStop(0, '#f4f6f8');
    grad.addColorStop(0.5, '#c9d0d8');
    grad.addColorStop(1, '#9aa4ae');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-bw * 0.15, 0);
    g.lineTo(-bw * 0.15, -len * 0.82);
    g.quadraticCurveTo(-bw * 0.1, -len, bw * 0.15, -len);
    g.lineTo(bw * 0.85, -len * 0.75);
    g.lineTo(bw * 0.85, 0);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(60,70,80,.5)';
    g.lineWidth = 1.5;
    g.stroke();
    // filo
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-bw * 0.12, -2);
    g.lineTo(-bw * 0.12, -len * 0.8);
    g.stroke();
    // manico con i rivetti
    g.fillStyle = '#6b3d1f';
    g.beginPath();
    g.roundRect(-bw * 0.2, -2, bw * 1.1, s * 0.16, 6);
    g.fill();
    g.fillStyle = '#d9c9a8';
    for (const f of [0.35, 0.7]) {
      g.beginPath();
      g.arc(bw * 0.35, s * 0.16 * f, 2.5, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}

/** Il gioco ha un minigioco aperto? (per chi deve sapere che i tocchi sono suoi) */
export function stationOpen(game: Game) {
  return !!(game.run as { station?: Station | null } | null)?.station;
}

// ======================================================================================
// Impastatrice: acqua, lievito e sale al momento giusto e nella quantità giusta (panettiere)
// ======================================================================================

export type MixIng = 'acqua' | 'lievito' | 'sale';
export const MIX_INGS: Record<MixIng, { icon: string; name: string; unit: string; color: string }> = {
  acqua: { icon: '💧', name: 'Acqua', unit: 'ml', color: '#2d9cdb' },
  lievito: { icon: '🫧', name: 'Lievito', unit: 'g', color: '#8e5bd6' },
  sale: { icon: '🧂', name: 'Sale', unit: 'g', color: '#66708a' },
};
const MIX_ORDER: MixIng[] = ['acqua', 'lievito', 'sale'];

/** Cosa succede nella ciotola (in 3D, vista dall'alto): la vasca gira, cadono gli ingredienti, l'impasto si forma. */
export interface MixerView {
  /** ogni fotogramma: avanzamento dell'impasto (0–1), quanto è bagnato (0–1+), ingrediente che sta cadendo */
  frame(dt: number, p: number, wet: number, pouring: MixIng | null): void;
}

/**
 * L'impastatrice gira da sola per `dur` secondi (la barra in alto, con le finestre di ogni ingrediente: prima
 * l'acqua, poi il lievito, per ultimo il sale). Tieni premuto il tasto di un ingrediente per versarlo: il numero
 * sale finché tieni il dito, lascia quando arrivi alla quantità della ricetta. Versare fuori dalla sua finestra o
 * sbagliare la quantità abbassa la qualità; un ingrediente mai messo la fa crollare. Il riquadro è trasparente in
 * mezzo: si vede la ciotola vera, dall'alto.
 */
export class MixerStation extends Station {
  private p = 0;
  private amt: Record<MixIng, number> = { acqua: 0, lievito: 0, sale: 0 };
  /** quanto è stato versato fuori dalla sua finestra (0–1 della quantità giusta) */
  private off: Record<MixIng, number> = { acqua: 0, lievito: 0, sale: 0 };
  private pouring: MixIng | null = null;
  private msg = '';
  private msgT = 0;
  private tail = 0;
  /** com'è andata, una riga per il messaggio finale */
  verdict = '';
  private btns: Record<MixIng, { x: number; y: number; w: number; h: number }> = {} as never;

  constructor(
    private o: { title: string; recipe: Record<MixIng, number>; dur: number; win: Record<MixIng, [number, number]>; tol: number; rate: Record<MixIng, number>; view: MixerView },
    onEnd: (q: number) => void,
  ) {
    super(onEnd);
    this.root.classList.add('ovl-clear');
  }

  /** spazio trasparente tra la ricetta in alto e i tasti in basso (coordinate dello schermo): lì si vede la vasca */
  viewRect() {
    const r = this.cv.getBoundingClientRect();
    const b = this.btns.acqua;
    if (!r.width || !b) return null;
    const top = r.top + 6 + 104 + 6;
    const bottom = r.top + b.y - 6;
    return { x: r.left, y: top, w: r.width, h: Math.max(40, bottom - top) };
  }

  private hit(x: number, y: number): MixIng | null {
    for (const k of MIX_ORDER) {
      const b = this.btns[k];
      if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return k;
    }
    return null;
  }

  protected down(x: number, y: number) {
    this.pouring = this.p < 1 ? this.hit(x, y) : null;
    if (!this.pouring) return;
    const [a, b] = this.o.win[this.pouring];
    if (this.p < a) this.say(`Troppo presto per ${MIX_INGS[this.pouring].name.toLowerCase()}!`);
    else if (this.p > b) this.say(`Troppo tardi per ${MIX_INGS[this.pouring].name.toLowerCase()}!`);
  }
  protected move(x: number, y: number) {
    // il dito scivola fuori dal tasto: si smette di versare
    if (this.pouring && this.hit(x, y) !== this.pouring) this.pouring = null;
  }
  protected up() {
    this.pouring = null;
  }

  private say(t: string) {
    this.msg = t;
    this.msgT = 1.6;
  }

  /** qualità di un ingrediente: quantità (perfetta dentro la tolleranza) × momento giusto */
  private score(k: MixIng) {
    const want = this.o.recipe[k];
    if (this.amt[k] <= 0) return 0;
    const err = Math.abs(this.amt[k] - want) / want;
    const qty = err <= this.o.tol ? 1 : Math.max(0, 1 - (err - this.o.tol) / 0.35);
    const time = 1 - 0.6 * Math.min(1, this.off[k]);
    return qty * time;
  }

  private finish() {
    const qs = MIX_ORDER.map((k) => this.score(k));
    const q = qs.reduce((a, b) => a + b, 0) / qs.length;
    const missing = MIX_ORDER.filter((k) => this.amt[k] <= 0);
    const bad = MIX_ORDER.filter((k) => this.amt[k] > 0 && Math.abs(this.amt[k] - this.o.recipe[k]) / this.o.recipe[k] > this.o.tol);
    const late = MIX_ORDER.filter((k) => this.off[k] > 0.15);
    this.verdict = missing.length
      ? `Manca ${missing.map((k) => MIX_INGS[k].icon + ' ' + MIX_INGS[k].name.toLowerCase()).join(' e ')}: impasto rovinato`
      : bad.length
        ? `Quantità sbagliata: ${bad.map((k) => MIX_INGS[k].icon + ' ' + MIX_INGS[k].name.toLowerCase()).join(', ')}`
        : late.length
          ? `Al momento sbagliato: ${late.map((k) => MIX_INGS[k].icon + ' ' + MIX_INGS[k].name.toLowerCase()).join(', ')}`
          : '';
    this.end(q);
  }

  step(dt: number) {
    const o = this.o;
    if (this.p < 1) {
      this.p = Math.min(1, this.p + dt / o.dur);
      if (this.pouring) {
        const k = this.pouring;
        const add = o.rate[k] * dt;
        this.amt[k] += add;
        const [a, b] = o.win[k];
        if (this.p < a || this.p > b) this.off[k] += add / o.recipe[k];
      }
      // finestra passata senza l'ingrediente: avviso (si può ancora mettere, in ritardo)
      for (const k of MIX_ORDER) if (this.amt[k] <= 0 && this.p > o.win[k][1] && this.p - dt / o.dur <= o.win[k][1]) this.say(`${MIX_INGS[k].icon} Hai dimenticato ${MIX_INGS[k].name.toLowerCase()}!`);
    } else {
      this.pouring = null;
      this.tail += dt;
      if (this.tail > 0.7) return this.finish();
    }
    this.msgT -= dt;
    o.view.frame(dt, this.p, this.amt.acqua / o.recipe.acqua, this.pouring);
    this.draw();
  }

  private draw() {
    const g = this.g;
    const { w, h } = this;
    const o = this.o;
    g.clearRect(0, 0, w, h);
    // in alto: titolo, ricetta e barra del tempo con le finestre
    const topH = 104;
    g.fillStyle = 'rgba(255,248,236,.94)';
    g.beginPath();
    g.roundRect(6, 6, w - 12, topH, 14);
    g.fill();
    this.text(o.title, w / 2, 22, 16);
    this.text(MIX_ORDER.map((k) => `${MIX_INGS[k].icon} ${o.recipe[k]} ${MIX_INGS[k].unit}`).join('   '), w / 2, 46, 15, '#3a2f55', 700);
    const bx = 18;
    const bw = w - 36;
    const by = 64;
    g.fillStyle = 'rgba(58,47,85,.12)';
    g.beginPath();
    g.roundRect(bx, by, bw, 18, 9);
    g.fill();
    for (const k of MIX_ORDER) {
      const [a, b] = o.win[k];
      g.fillStyle = MIX_INGS[k].color;
      g.globalAlpha = this.amt[k] > 0 ? 0.45 : 0.85;
      g.beginPath();
      g.roundRect(bx + a * bw, by, (b - a) * bw, 18, 6);
      g.fill();
      g.globalAlpha = 1;
      this.text(MIX_INGS[k].icon, bx + ((a + b) / 2) * bw, by + 9, 13);
    }
    // cursore
    const cx = bx + this.p * bw;
    g.fillStyle = '#3a2f55';
    g.fillRect(cx - 2, by - 5, 4, 28);
    const line = this.msgT > 0 ? this.msg : this.p >= 1 ? 'Impasto pronto!' : this.hint();
    this.text(line, w / 2, 96, 13, this.msgT > 0 ? '#e5484d' : '#7a6f8f', 600);
    // in basso: i tre tasti, da tenere premuti
    const gap = 8;
    const bh = Math.min(96, Math.max(76, h * 0.17));
    const bwid = (w - 12 - gap * 2) / 3;
    const y0 = h - bh - 6;
    MIX_ORDER.forEach((k, i) => {
      const x = 6 + i * (bwid + gap);
      this.btns[k] = { x, y: y0, w: bwid, h: bh };
      const [a, b] = o.win[k];
      const now = this.p >= a && this.p <= b;
      const on = this.pouring === k;
      g.fillStyle = on ? MIX_INGS[k].color : now ? '#ffffff' : 'rgba(255,248,236,.9)';
      g.beginPath();
      g.roundRect(x, y0, bwid, bh, 14);
      g.fill();
      g.lineWidth = now ? 4 : 2;
      g.strokeStyle = now ? MIX_INGS[k].color : 'rgba(58,47,85,.25)';
      g.stroke();
      const ink = on ? '#ffffff' : '#3a2f55';
      this.text(`${MIX_INGS[k].icon} ${MIX_INGS[k].name}`, x + bwid / 2, y0 + 18, 14, ink, 700);
      // quantità versata e indicatore con la tacca della ricetta
      const want = o.recipe[k];
      const val = Math.round(this.amt[k]);
      this.text(`${val} / ${want} ${MIX_INGS[k].unit}`, x + bwid / 2, y0 + 40, 13, ink, 600);
      const gx = x + 10;
      const gw = bwid - 20;
      const gy = y0 + 54;
      const max = want * 1.5;
      g.fillStyle = on ? 'rgba(255,255,255,.35)' : 'rgba(58,47,85,.12)';
      g.fillRect(gx, gy, gw, 10);
      // fascia giusta
      g.fillStyle = 'rgba(53,196,106,.55)';
      g.fillRect(gx + ((want * (1 - o.tol)) / max) * gw, gy, ((want * 2 * o.tol) / max) * gw, 10);
      const err = Math.abs(this.amt[k] - want) / want;
      g.fillStyle = this.amt[k] <= 0 ? 'transparent' : err <= o.tol ? '#1f9a4c' : this.amt[k] > want ? '#e5484d' : (on ? '#ffffff' : MIX_INGS[k].color);
      g.fillRect(gx, gy, Math.min(1, this.amt[k] / max) * gw, 10);
      g.fillStyle = '#3a2f55';
      g.fillRect(gx + (want / max) * gw - 1, gy - 3, 2, 16);
      if (bh > 80) this.text(now ? 'ORA!' : this.p < a ? 'non ancora' : 'passato', x + bwid / 2, y0 + bh - 12, 11, on ? '#ffffff' : now ? MIX_INGS[k].color : '#9a90ad', 600);
    });
  }

  private hint() {
    const k = MIX_ORDER.find((x) => this.p >= this.o.win[x][0] && this.p <= this.o.win[x][1]);
    if (k) return `Ora: ${MIX_INGS[k].icon} ${MIX_INGS[k].name.toLowerCase()}, tieni premuto e lascia sul numero giusto`;
    const nxt = MIX_ORDER.find((x) => this.p < this.o.win[x][0]);
    return nxt ? `Aspetta: tra poco ${MIX_INGS[nxt].icon} ${MIX_INGS[nxt].name.toLowerCase()}` : 'Lascia girare l\'impasto';
  }
}
