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

/**
 * Dai la forma: il dito deve passare **esattamente sulla linea** della sagoma (la fascia chiara attorno alla linea
 * è tutto il margine che c'è). Dove passi sulla linea si accende di verde; se esci il tuo tratto diventa rosso,
 * compare "Fuori dalla linea!" e la precisione scende. Qualità = precisione (pesa tanto) × quanta sagoma hai
 * coperto: uscire spesso dà una forma storta e meno stelle e paga.
 */
export class ShapeStation extends Station {
  private samples: { p: Pt; hit: boolean }[][];
  private stroke: { p: Pt; ok: boolean }[] = [];
  private strokes: { p: Pt; ok: boolean }[][] = [];
  private inside = 0;
  private total = 0;
  private offT = 0;
  /** com'è andata, una riga per il messaggio finale (vuota se bene) */
  verdict = '';

  constructor(private name: string, private icon: string, private shape: { hint: string; paths: Pt[][] }, private tol: number, onEnd: (q: number) => void) {
    super(onEnd);
    this.samples = shape.paths.map((p) => resample(p).map((q) => ({ p: q, hit: false })));
  }

  private cover() {
    const all = this.samples.flat();
    return all.filter((x) => x.hit).length / Math.max(1, all.length);
  }

  private acc() {
    return this.total ? this.inside / this.total : 1;
  }

  protected down(x: number, y: number) {
    this.stroke = [];
    this.move(x, y);
  }

  protected move(x: number, y: number) {
    const sq = this.square(70, 34);
    const p: Pt = [(x - sq.x) / sq.s, (y - sq.y) / sq.s];
    // il dito veloce salta dei punti: si riempie il tratto tra l'ultimo punto e questo
    const last = this.stroke[this.stroke.length - 1]?.p;
    if (last) {
      const n = Math.min(40, Math.floor(Math.hypot(p[0] - last[0], p[1] - last[1]) / (this.tol / 2)));
      for (let k = 1; k <= n; k++) this.touch([last[0] + ((p[0] - last[0]) * k) / (n + 1), last[1] + ((p[1] - last[1]) * k) / (n + 1)], false);
    }
    this.touch(p, true);
  }

  /** un punto del dito: sulla linea accende la sagoma, fuori conta come errore */
  private touch(p: Pt, keep: boolean) {
    let ok = false;
    for (const path of this.samples) {
      for (const sm of path) {
        if (Math.hypot(sm.p[0] - p[0], sm.p[1] - p[1]) < this.tol) {
          sm.hit = true;
          ok = true;
        }
      }
    }
    this.total++;
    if (ok) this.inside++;
    else {
      if (this.offT <= 0) navigator.vibrate?.(30);
      this.offT = 0.9;
    }
    if (keep || !ok) this.stroke.push({ p, ok });
  }

  protected up() {
    if (this.stroke.length) this.strokes.push(this.stroke);
    this.stroke = [];
    // tutta la sagoma, e ogni tratto quasi tutto (il cornetto va anche arrotolato)
    if (this.cover() >= 0.9 && this.samples.every((path) => path.filter((x) => x.hit).length / path.length >= 0.8)) {
      const acc = this.acc();
      this.verdict = acc < 0.8 ? `Sei uscito dalla linea (precisione ${Math.round(acc * 100)}%): forma storta` : '';
      this.end(Math.min(1, acc ** 1.5 * (0.6 + 0.4 * this.cover())));
    }
  }

  step(dt: number) {
    this.offT -= dt;
    const g = this.g;
    const { w, h } = this;
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text(`👐 Forma: ${this.icon} ${this.name}`, w / 2, 24, 20);
    const off = this.offT > 0;
    this.text(off ? 'Fuori dalla linea! Resta sopra la linea' : this.shape.hint, w / 2, 48, 13, off ? '#e5484d' : '#7a6f8f', off ? 700 : 500);
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
    g.lineJoin = 'round';
    // la fascia dove il dito è "sulla linea": tutto il margine che c'è
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = this.tol * 2 * sq.s;
    for (const path of this.samples) {
      g.beginPath();
      path.forEach((x, i) => (i ? g.lineTo(...P(x.p)) : g.moveTo(...P(x.p))));
      g.stroke();
    }
    for (const path of this.samples) {
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, ay] = P(path[i].p);
        const [bx, by] = P(path[i + 1].p);
        g.strokeStyle = path[i].hit ? 'rgba(53,196,106,.95)' : 'rgba(58,47,85,.6)';
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
    // il tratto del dito: marrone sulla linea, rosso dove sei uscito
    g.lineWidth = Math.max(5, sq.s * 0.025);
    for (const st of [...this.strokes, this.stroke]) {
      for (let i = 1; i < st.length; i++) {
        g.strokeStyle = st[i].ok && st[i - 1].ok ? '#b5793d' : '#e5484d';
        g.beginPath();
        g.moveTo(...P(st[i - 1].p));
        g.lineTo(...P(st[i].p));
        g.stroke();
      }
    }
    // precisione e quanta sagoma manca
    const acc = this.acc();
    this.text(`🎯 Precisione ${Math.round(acc * 100)}%`, w / 2, h - 30, 13, acc >= 0.9 ? '#1f9a4c' : acc >= 0.8 ? '#d97a00' : '#e5484d', 700);
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
 * l'acqua, poi il lievito, per ultimo il sale). In basso, sul ripiano, ci sono la **brocca** dell'acqua, la
 * **manciata di lievito** e la **saliera**: si prendono col dito e si trascinano sopra la vasca. Lì si inclinano e
 * versano (il numero sale finché restano sopra la vasca); si allontanano o si lasciano quando si arriva alla dose
 * della ricetta, e tornano da sole sul ripiano. Mentre versi, accanto all'oggetto c'è un misurino grande con la
 * tacca della ricetta e la fascia verde. Versare fuori dalla sua finestra o sbagliare la quantità abbassa la
 * qualità; un ingrediente mai messo la fa crollare. Il riquadro è trasparente in mezzo: si vede la vasca vera,
 * dall'alto.
 */
export class MixerStation extends Station {
  private p = 0;
  private amt: Record<MixIng, number> = { acqua: 0, lievito: 0, sale: 0 };
  /** quanto è stato versato fuori dalla sua finestra (0–1 della quantità giusta) */
  private off: Record<MixIng, number> = { acqua: 0, lievito: 0, sale: 0 };
  private pouring: MixIng | null = null;
  /** oggetto preso col dito (segue il dito, un po' più in alto perché il dito non lo copra) */
  private drag: MixIng | null = null;
  /** inclinazione di ogni oggetto (0 dritto, 1 versa), morbida */
  private tilt: Record<MixIng, number> = { acqua: 0, lievito: 0, sale: 0 };
  private msg = '';
  private msgT = 0;
  private tail = 0;
  private t = 0;
  /** com'è andata, una riga per il messaggio finale */
  verdict = '';
  private slots: Record<MixIng, { x: number; y: number; w: number; h: number }> = {} as never;

  constructor(
    private o: { title: string; recipe: Record<MixIng, number>; dur: number; win: Record<MixIng, [number, number]>; tol: number; rate: Record<MixIng, number>; view: MixerView },
    onEnd: (q: number) => void,
  ) {
    super(onEnd);
    this.root.classList.add('ovl-clear');
  }

  private static TOP_H = 112;

  /** spazio trasparente tra la ricetta in alto e il ripiano in basso (coordinate dello schermo): lì si vede la vasca */
  viewRect() {
    const r = this.cv.getBoundingClientRect();
    const v = this.bowlArea();
    if (!r.width || !v) return null;
    return { x: r.left, y: r.top + v.top, w: r.width, h: v.bottom - v.top };
  }

  /** zona della vasca nel riquadro (la camera la mette al centro di questo spazio) */
  private bowlArea() {
    const b = this.slots.acqua;
    if (!b) return null;
    const top = 6 + MixerStation.TOP_H + 6;
    const bottom = Math.max(top + 40, b.y - 6);
    const cx = this.w / 2;
    const cy = (top + bottom) / 2;
    return { top, bottom, cx, cy, r: Math.min(this.w, bottom - top) * 0.3 };
  }

  private hit(x: number, y: number): MixIng | null {
    for (const k of MIX_ORDER) {
      const b = this.slots[k];
      if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return k;
    }
    return null;
  }

  /** dove sta l'oggetto preso: sopra il dito */
  private held() {
    const f = this.finger!;
    return { x: f.x, y: f.y - this.objSize() * 1.1 };
  }

  private objSize() {
    const b = this.slots.acqua;
    return b ? Math.min(34, b.h * 0.3, b.w * 0.28) : 30;
  }

  protected down(x: number, y: number) {
    this.drag = this.p < 1 ? this.hit(x, y) : null;
    if (!this.drag) return;
    const [a, b] = this.o.win[this.drag];
    if (this.p < a) this.say(`Troppo presto per ${MIX_INGS[this.drag].name.toLowerCase()}!`);
    else if (this.p > b) this.say(`Troppo tardi per ${MIX_INGS[this.drag].name.toLowerCase()}!`);
  }
  protected up() {
    this.drag = null;
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
    this.t += dt;
    // versa solo se l'oggetto preso è sopra la vasca
    const v = this.bowlArea();
    if (this.drag && this.finger && v) {
      const h = this.held();
      this.pouring = Math.hypot(h.x - v.cx, h.y - v.cy) < v.r * 1.25 ? this.drag : null;
    } else this.pouring = null;
    for (const k of MIX_ORDER) this.tilt[k] += ((this.pouring === k ? 1 : 0) - this.tilt[k]) * Math.min(1, dt * 12);
    if (this.p < 1) {
      this.p = Math.min(1, this.p + dt / o.dur);
      // si versa quando l'oggetto è già inclinato (non appena arriva sopra la vasca)
      if (this.pouring && this.tilt[this.pouring] > 0.6) {
        const k = this.pouring;
        const add = o.rate[k] * dt;
        this.amt[k] += add;
        const [a, b] = o.win[k];
        if (this.p < a || this.p > b) this.off[k] += add / o.recipe[k];
      }
      // finestra passata senza l'ingrediente: avviso (si può ancora mettere, in ritardo)
      for (const k of MIX_ORDER) if (this.amt[k] <= 0 && this.p > o.win[k][1] && this.p - dt / o.dur <= o.win[k][1]) this.say(`${MIX_INGS[k].icon} Hai dimenticato ${MIX_INGS[k].name.toLowerCase()}!`);
    } else {
      this.drag = null;
      this.pouring = null;
      this.tail += dt;
      if (this.tail > 0.7) return this.finish();
    }
    this.msgT -= dt;
    const flowing = this.pouring && this.tilt[this.pouring] > 0.6 ? this.pouring : null;
    o.view.frame(dt, this.p, this.amt.acqua / o.recipe.acqua, flowing);
    this.draw(flowing);
  }

  private now(k: MixIng) {
    const [a, b] = this.o.win[k];
    return this.p >= a && this.p <= b;
  }

  private draw(flowing: MixIng | null) {
    const g = this.g;
    const { w, h } = this;
    const o = this.o;
    g.clearRect(0, 0, w, h);
    // ---- in alto: titolo, ricetta grande e barra del tempo con le finestre
    const topH = MixerStation.TOP_H;
    g.fillStyle = 'rgba(255,248,236,.95)';
    g.beginPath();
    g.roundRect(6, 6, w - 12, topH, 14);
    g.fill();
    this.text(o.title, w / 2, 20, 15);
    // ricetta: tre caselle con dose grande, quella del momento colorata
    const cw = (w - 24 - 12) / 3;
    MIX_ORDER.forEach((k, i) => {
      const x = 12 + i * (cw + 6);
      const on = this.now(k) && this.p < 1;
      const ok = this.amt[k] > 0 && Math.abs(this.amt[k] - o.recipe[k]) / o.recipe[k] <= o.tol;
      g.fillStyle = on ? MIX_INGS[k].color : ok ? 'rgba(53,196,106,.18)' : 'rgba(58,47,85,.07)';
      g.beginPath();
      g.roundRect(x, 32, cw, 30, 9);
      g.fill();
      this.text(`${ok ? '✅' : MIX_INGS[k].icon} ${o.recipe[k]} ${MIX_INGS[k].unit}`, x + cw / 2, 47, 16, on ? '#ffffff' : '#3a2f55', 700);
    });
    const bx = 18;
    const bw = w - 36;
    const by = 70;
    g.fillStyle = 'rgba(58,47,85,.12)';
    g.beginPath();
    g.roundRect(bx, by, bw, 16, 8);
    g.fill();
    for (const k of MIX_ORDER) {
      const [a, b] = o.win[k];
      g.fillStyle = MIX_INGS[k].color;
      g.globalAlpha = this.amt[k] > 0 ? 0.4 : 0.85;
      g.beginPath();
      g.roundRect(bx + a * bw, by, (b - a) * bw, 16, 6);
      g.fill();
      g.globalAlpha = 1;
      this.text(MIX_INGS[k].icon, bx + ((a + b) / 2) * bw, by + 8, 12);
    }
    const cx = bx + this.p * bw;
    g.fillStyle = '#3a2f55';
    g.fillRect(cx - 2, by - 5, 4, 26);
    const line = this.msgT > 0 ? this.msg : this.p >= 1 ? 'Impasto pronto!' : this.hint();
    const nowK = MIX_ORDER.find((k) => this.now(k));
    this.text(line, w / 2, 102, 14, this.msgT > 0 ? '#e5484d' : nowK && this.p < 1 ? MIX_INGS[nowK].color : '#7a6f8f', 700);

    // ---- in basso: il ripiano con brocca, lievito e saliera
    const gap = 8;
    const bh = Math.min(118, Math.max(92, h * 0.2));
    const sw = (w - 12 - gap * 2) / 3;
    const y0 = h - bh - 6;
    const s = this.objSize();
    MIX_ORDER.forEach((k, i) => {
      const x = 6 + i * (sw + gap);
      this.slots[k] = { x, y: y0, w: sw, h: bh };
      const on = this.now(k) && this.p < 1;
      const pulse = on ? 0.5 + 0.5 * Math.sin(this.t * 7) : 0;
      g.fillStyle = on ? '#ffffff' : 'rgba(255,248,236,.9)';
      g.beginPath();
      g.roundRect(x, y0, sw, bh, 14);
      g.fill();
      g.lineWidth = on ? 3 + 2 * pulse : 2;
      g.strokeStyle = on ? MIX_INGS[k].color : 'rgba(58,47,85,.25)';
      g.stroke();
      // l'oggetto sta sul ripiano (o il suo posto vuoto, tratteggiato, se è in mano)
      const ox = x + sw / 2;
      const oy = y0 + 8 + s * 0.85;
      if (this.drag === k) {
        g.setLineDash([5, 4]);
        g.strokeStyle = 'rgba(58,47,85,.3)';
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(ox, oy + s * 0.55, s * 0.7, s * 0.2, 0, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      } else this.drawObj(k, ox, oy - (on ? 3 * pulse : 0), s, 0);
      const want = o.recipe[k];
      this.text(`${Math.round(this.amt[k])} / ${want} ${MIX_INGS[k].unit}`, ox, y0 + bh - 32, 14, '#3a2f55', 700);
      this.gauge(k, x + 10, y0 + bh - 20, sw - 20, 9);
      if (on && !this.drag) this.text('ORA!', x + sw - 20, y0 + 14, 12, MIX_INGS[k].color, 800);
    });

    // ---- la vasca: cerchio tratteggiato dove portare l'oggetto (solo mentre ne hai uno in mano)
    const v = this.bowlArea();
    if (this.drag && v) {
      g.setLineDash([8, 6]);
      g.lineWidth = 3;
      g.strokeStyle = this.pouring ? 'rgba(53,196,106,.9)' : 'rgba(255,255,255,.85)';
      g.beginPath();
      g.arc(v.cx, v.cy, v.r * 1.25, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      if (!this.pouring) this.text('Portalo sopra la vasca', v.cx, v.cy - v.r * 1.25 - 12, 13, '#ffffff', 700);
    }

    // ---- l'oggetto in mano: segue il dito, sopra la vasca si inclina e versa; accanto il misurino grande
    if (this.drag && this.finger) {
      const k = this.drag;
      const hp = this.held();
      const big = s * 1.35;
      this.drawObj(k, hp.x, hp.y, big, this.tilt[k]);
      if (flowing) this.drawFlow(k, hp.x, hp.y, big);
      this.bigGauge(k, hp.x, hp.y, big);
    }
  }

  /** barretta della dose: fascia verde giusta, tacca della ricetta, colore rosso se troppo */
  private gauge(k: MixIng, x: number, y: number, gw: number, gh: number) {
    const g = this.g;
    const o = this.o;
    const want = o.recipe[k];
    const max = want * 1.5;
    g.fillStyle = 'rgba(58,47,85,.12)';
    g.fillRect(x, y, gw, gh);
    g.fillStyle = 'rgba(53,196,106,.55)';
    g.fillRect(x + ((want * (1 - o.tol)) / max) * gw, y, ((want * 2 * o.tol) / max) * gw, gh);
    g.fillStyle = this.doseColor(k);
    g.fillRect(x, y, Math.min(1, this.amt[k] / max) * gw, gh);
    g.fillStyle = '#3a2f55';
    g.fillRect(x + (want / max) * gw - 1, y - 3, 2, gh + 6);
  }

  private doseColor(k: MixIng) {
    const want = this.o.recipe[k];
    const err = Math.abs(this.amt[k] - want) / want;
    return this.amt[k] <= 0 ? 'transparent' : err <= this.o.tol ? '#1f9a4c' : this.amt[k] > want ? '#e5484d' : MIX_INGS[k].color;
  }

  /** misurino grande accanto all'oggetto in mano: numero grosso e colonna con la fascia verde */
  private bigGauge(k: MixIng, x: number, y: number, s: number) {
    const g = this.g;
    const o = this.o;
    const want = o.recipe[k];
    const max = want * 1.5;
    const gw = 26;
    const gh = Math.min(130, Math.max(90, this.h * 0.2));
    // a destra dell'oggetto (si versa verso sinistra), a sinistra solo se a destra non ci sta
    const right = x + s * 0.9 + 8 + gw + 80 < this.w;
    const gx = right ? x + s * 0.9 + 8 : x - s * 0.9 - 8 - gw - 70;
    const gy = Math.max(8, Math.min(this.h - gh - 8, y - gh / 2));
    g.fillStyle = 'rgba(255,248,236,.95)';
    g.beginPath();
    g.roundRect(gx - 6, gy - 6, gw + 82, gh + 12, 12);
    g.fill();
    g.fillStyle = 'rgba(58,47,85,.12)';
    g.beginPath();
    g.roundRect(gx, gy, gw, gh, 6);
    g.fill();
    const yOf = (v: number) => gy + gh - (Math.min(max, v) / max) * gh;
    g.fillStyle = 'rgba(53,196,106,.5)';
    g.fillRect(gx, yOf(want * (1 + o.tol)), gw, yOf(want * (1 - o.tol)) - yOf(want * (1 + o.tol)));
    g.fillStyle = this.doseColor(k);
    g.fillRect(gx + 4, yOf(this.amt[k]), gw - 8, gy + gh - yOf(this.amt[k]));
    g.fillStyle = '#3a2f55';
    g.fillRect(gx - 4, yOf(want) - 1.5, gw + 8, 3);
    const err = Math.abs(this.amt[k] - want) / want;
    const col = this.amt[k] <= 0 ? '#3a2f55' : err <= o.tol ? '#1f9a4c' : this.amt[k] > want ? '#e5484d' : '#3a2f55';
    const tx = gx + gw + 40;
    this.text(`${Math.round(this.amt[k])}`, tx, gy + gh / 2 - 16, 26, col, 800);
    this.text(`di ${want} ${MIX_INGS[k].unit}`, tx, gy + gh / 2 + 8, 12, '#7a6f8f', 700);
    const tag = this.amt[k] <= 0 ? '' : err <= o.tol ? 'Giusto!' : this.amt[k] > want ? 'Troppo!' : 'Ancora…';
    if (tag) this.text(tag, tx, gy + gh / 2 + 28, 13, col, 800);
  }

  /** angolo massimo di ogni oggetto quando versa */
  private static TILT: Record<MixIng, number> = { acqua: 1.25, lievito: 1.4, sale: 2.4 };

  /** l'ingrediente che scende dall'oggetto (dal beccuccio, dai buchi o dalle dita) giù nella vasca */
  private drawFlow(k: MixIng, x: number, y: number, s: number) {
    const g = this.g;
    // punto da cui esce, nell'oggetto dritto, poi girato come l'oggetto
    const loc = k === 'acqua' ? [-s * 0.63, -s * 0.85] : k === 'sale' ? [0, -s * 0.75] : [-s * 0.62, -s * 0.15];
    const a = -this.tilt[k] * MixerStation.TILT[k];
    const sx = x + loc[0] * Math.cos(a) - loc[1] * Math.sin(a);
    const sy = y + loc[0] * Math.sin(a) + loc[1] * Math.cos(a);
    const fall = s * 1.6;
    if (k === 'acqua') {
      g.strokeStyle = 'rgba(110,198,255,.95)';
      g.lineCap = 'round';
      for (const [lw, col] of [[9, 'rgba(255,255,255,.8)'], [6, 'rgba(70,170,240,.95)']] as const) {
        g.lineWidth = lw;
        g.strokeStyle = col;
        g.beginPath();
        g.moveTo(sx, sy);
        g.quadraticCurveTo(sx - 8, sy + fall * 0.4, sx - 4 + Math.sin(this.t * 20) * 1.5, sy + fall);
        g.stroke();
      }
      g.lineCap = 'butt';
      // schizzi dove cade
      g.fillStyle = 'rgba(160,215,255,.9)';
      for (let i = 0; i < 5; i++) {
        const f = (this.t * 3 + i / 5) % 1;
        g.beginPath();
        g.arc(sx - 4 + Math.cos(i * 2.4) * 14 * f, sy + fall - 6 * Math.sin(f * Math.PI), 2.4 * (1 - f) + 0.6, 0, Math.PI * 2);
        g.fill();
      }
      return;
    }
    // granelli di sale o di lievito che cadono
    for (let i = 0; i < 16; i++) {
      const f = (this.t * 2.4 + i / 16) % 1;
      const px = sx + Math.sin(i * 7.3) * (3 + 8 * f);
      const py = sy + fall * f;
      g.fillStyle = k === 'sale' ? '#ffffff' : '#c9a26b';
      g.strokeStyle = 'rgba(58,47,85,.5)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(px, py, k === 'sale' ? 2.2 : 3, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  /** disegna brocca, manciata di lievito o saliera (centro in x,y, grande s); tilt 0–1 = inclinato per versare */
  private drawObj(k: MixIng, x: number, y: number, s: number, tilt: number) {
    const g = this.g;
    const ink = '#3a2f55';
    g.save();
    g.translate(x, y);
    g.rotate(-tilt * MixerStation.TILT[k]);
    g.lineWidth = 2.5;
    g.strokeStyle = ink;
    g.lineJoin = 'round';
    if (k === 'acqua') {
      // brocca di vetro con l'acqua, beccuccio a sinistra, manico a destra
      const wt = s * 0.55;
      const hb = s * 0.75;
      g.beginPath();
      g.moveTo(-wt * 0.8, -hb);
      g.lineTo(wt * 0.8, -hb);
      g.lineTo(wt, hb);
      g.lineTo(-wt, hb);
      g.closePath();
      g.fillStyle = 'rgba(220,240,255,.95)';
      g.fill();
      // acqua dentro (cala versando)
      const lvl = Math.max(0.15, 1 - Math.min(1, this.amt.acqua / (this.o.recipe.acqua * 1.4)));
      const top = hb - 2 * hb * 0.8 * lvl;
      g.beginPath();
      g.moveTo(-wt + (wt * 0.2 * (hb - top)) / (2 * hb), top);
      g.lineTo(wt - (wt * 0.2 * (hb - top)) / (2 * hb), top);
      g.lineTo(wt, hb);
      g.lineTo(-wt, hb);
      g.closePath();
      g.fillStyle = '#6ec6ff';
      g.fill();
      g.beginPath();
      g.moveTo(-wt * 0.8, -hb);
      g.lineTo(wt * 0.8, -hb);
      g.lineTo(wt, hb);
      g.lineTo(-wt, hb);
      g.closePath();
      g.stroke();
      // beccuccio
      g.beginPath();
      g.moveTo(-wt * 0.8, -hb);
      g.lineTo(-wt * 1.15, -hb - s * 0.12);
      g.lineTo(-wt * 0.55, -hb);
      g.stroke();
      // manico
      g.beginPath();
      g.moveTo(wt * 0.85, -hb * 0.6);
      g.quadraticCurveTo(wt * 1.6, -hb * 0.3, wt * 0.95, hb * 0.5);
      g.lineWidth = 4;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,.7)';
      g.fillRect(-wt * 0.55, -hb * 0.6, s * 0.08, hb * 1.2);
    } else if (k === 'sale') {
      // saliera: corpo bianco con fascia blu, tappo grigio coi buchi
      const wt = s * 0.42;
      const hb = s * 0.7;
      g.beginPath();
      g.roundRect(-wt, -hb * 0.45, wt * 2, hb * 1.45, 7);
      g.fillStyle = '#ffffff';
      g.fill();
      g.stroke();
      g.fillStyle = '#2d9cdb';
      g.fillRect(-wt + 1.5, hb * 0.2, wt * 2 - 3, hb * 0.28);
      g.beginPath();
      g.moveTo(-wt * 0.9, -hb * 0.45);
      g.lineTo(-wt * 0.6, -hb);
      g.lineTo(wt * 0.6, -hb);
      g.lineTo(wt * 0.9, -hb * 0.45);
      g.closePath();
      g.fillStyle = '#c4cadb';
      g.fill();
      g.stroke();
      g.fillStyle = ink;
      for (const dx of [-0.25, 0.25]) {
        g.beginPath();
        g.arc(dx * wt * 2, -hb * 0.72, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      // manciata di lievito: mano a coppa vista di lato (dita a sinistra, polso a destra), granelli sopra
      const r = s * 0.62;
      // polso e manica
      g.fillStyle = '#ffcf9e';
      g.beginPath();
      g.roundRect(r * 0.55, -r * 0.05, r * 0.75, r * 0.6, r * 0.2);
      g.fill();
      g.stroke();
      g.fillStyle = '#2d9cdb';
      g.beginPath();
      g.roundRect(r * 1.05, -r * 0.15, r * 0.4, r * 0.8, r * 0.12);
      g.fill();
      g.stroke();
      // palmo a coppa con le dita piegate in su
      g.fillStyle = '#ffcf9e';
      g.beginPath();
      g.moveTo(r * 0.7, 0);
      g.lineTo(-r * 0.55, 0);
      g.quadraticCurveTo(-r * 1.05, -r * 0.05, -r * 1.0, -r * 0.42);
      g.quadraticCurveTo(-r * 0.85, -r * 0.55, -r * 0.72, -r * 0.3);
      g.quadraticCurveTo(-r * 0.6, -r * 0.12, -r * 0.4, -r * 0.12);
      g.lineTo(r * 0.5, -r * 0.12);
      g.quadraticCurveTo(r * 0.75, -r * 0.12, r * 0.8, r * 0.2);
      g.quadraticCurveTo(r * 0.8, r * 0.55, r * 0.4, r * 0.55);
      g.lineTo(-r * 0.6, r * 0.55);
      g.quadraticCurveTo(-r * 1.1, r * 0.5, -r * 1.0, -r * 0.05);
      g.closePath();
      g.fill();
      g.stroke();
      // pieghe delle dita
      g.lineWidth = 1.5;
      for (const yy of [0.18, 0.36]) {
        g.beginPath();
        g.moveTo(-r * 0.95, r * yy);
        g.lineTo(-r * 0.55, r * yy);
        g.stroke();
      }
      // il mucchietto di lievito nel palmo
      g.lineWidth = 2;
      g.fillStyle = '#c9a26b';
      g.beginPath();
      g.moveTo(-r * 0.62, -r * 0.12);
      g.quadraticCurveTo(-r * 0.1, -r * 0.75 * Math.max(0.3, 1 - this.amt.lievito / (this.o.recipe.lievito * 1.5)), r * 0.5, -r * 0.12);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#e8c58f';
      for (const [dx, dy] of [[-0.3, -0.25], [0, -0.33], [0.25, -0.22]]) {
        g.beginPath();
        g.arc(r * dx, r * dy, r * 0.06, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  private hint() {
    if (this.drag) return this.pouring ? 'Versa… allontanalo sul numero giusto' : `Porta ${MIX_INGS[this.drag].name.toLowerCase()} sopra la vasca`;
    const k = MIX_ORDER.find((x) => this.now(x));
    if (k) return `Ora: ${MIX_INGS[k].icon} ${MIX_INGS[k].name.toLowerCase()}! Trascinalo sulla vasca`;
    const nxt = MIX_ORDER.find((x) => this.p < this.o.win[x][0]);
    return nxt ? `Aspetta: tra poco ${MIX_INGS[nxt].icon} ${MIX_INGS[nxt].name.toLowerCase()}` : 'Lascia girare l\'impasto';
  }
}
