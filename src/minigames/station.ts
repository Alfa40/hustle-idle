import type { Game } from '../game';
import { layout } from '../ui/layout';

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
    g.fillText(t, x, y, this.w - 16);
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

/** Il gioco ha un minigioco aperto? (per chi deve sapere che i tocchi sono suoi) */
export function stationOpen(game: Game) {
  return !!(game.run as { station?: Station | null } | null)?.station;
}
