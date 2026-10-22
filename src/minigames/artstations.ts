import { Station } from './station';

/**
 * Minigiochi col dito dei lavoretti di Arte, design e ristrutturazione (src/minigames/art3d.ts):
 * - TraceStation: segui col dito la linea tratteggiata (sega sull'asse, cucito dell'orlo);
 * - CoverStation: copri tutta la superficie col pennello (vernice) o la spatola (colla), senza uscire;
 * - TileStation: posa le piastrelle come nel disegno (scegli il colore, tocca il posto);
 * - PhotoStation: tieni il gruppo nella cornice e scatta quando sorridono;
 * - ButtonStation: cuci il bottone toccando i buchi nell'ordine acceso.
 * Come gli altri (station.ts): si aprono toccando la postazione e alla fine dicono com'è andata (0–1).
 */

type Pt = { x: number; y: number };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Punti a passo costante lungo un tracciato (coordinate 0–1). */
function resample(path: Pt[], step = 0.01) {
  const out: Pt[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(d / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

// ======================================================================================
// Segui la linea: sega (taglio dell'asse) o cucito (orlo della stoffa)
// ======================================================================================

export class TraceStation extends Station {
  private paths: Pt[][];
  private cur = 0;
  /** fin dove si è arrivati lungo la linea di adesso (indice del punto) */
  private idx = 0;
  private on = false;
  private off = 0;
  private offNow = 0;
  private last: Pt | null = null;
  private doneT = 0;

  /**
   * `kind`: 'sega' (linee dritte da tagliare sull'asse) o 'cucito' (orlo ondulato sulla stoffa).
   * `n` linee una dopo l'altra; `tol`: quanto si può uscire (frazione del riquadro).
   */
  constructor(private name: string, private kind: 'sega' | 'cucito', n: number, private tol: number, onEnd: (q: number) => void) {
    super(onEnd);
    this.paths = Array.from({ length: n }, (_, i) => {
      if (kind === 'sega') {
        const x = (i + 1) / (n + 1);
        return resample([{ x: x - 0.04, y: 0.2 }, { x: x + 0.04, y: 0.8 }]);
      }
      // orlo: un'onda da sinistra a destra, ogni riga un po' più in basso
      const y0 = n === 1 ? 0.5 : 0.32 + (i * 0.36) / (n - 1);
      const pts: Pt[] = [];
      for (let k = 0; k <= 16; k++) pts.push({ x: 0.12 + (k / 16) * 0.76, y: y0 + Math.sin(k * 0.8 + i) * 0.06 });
      return resample(pts);
    });
  }

  private sq() {
    return this.square(70, 34);
  }

  guideSteps() {
    const p = this.paths[Math.min(this.cur, this.paths.length - 1)];
    const a = p[0];
    const xs = p.map((q) => q.x);
    const ys = p.map((q) => q.y);
    return [
      { rect: this.sqRect(a.x - 0.07, a.y - 0.07, a.x + 0.07, a.y + 0.07), say: '👆 Metti il dito sul pallino verde' },
      {
        rect: this.sqRect(Math.min(...xs) - 0.05, Math.min(...ys) - 0.05, Math.max(...xs) + 0.05, Math.max(...ys) + 0.05),
        say: this.kind === 'sega' ? '🪚 Segui la linea fino in fondo: la sega taglia' : '🧵 Segui la linea fino in fondo: l\'ago cuce',
      },
      { rect: this.sqRect(0.05, 0.1, 0.95, 0.9), say: '💡 Se esci dalla linea il lavoro viene storto' },
    ];
  }

  private rel(x: number, y: number): Pt {
    const s = this.sq();
    return { x: (x - s.x) / s.s, y: (y - s.y) / s.s };
  }

  protected down(x: number, y: number) {
    this.last = this.rel(x, y);
    const p = this.paths[this.cur];
    // si parte dal punto dove si era arrivati (o dall'inizio)
    if (p && Math.hypot(this.last.x - p[this.idx].x, this.last.y - p[this.idx].y) < this.tol * 2.2) this.on = true;
  }

  protected move(x: number, y: number) {
    const q = this.rel(x, y);
    const d = this.last ? Math.hypot(q.x - this.last.x, q.y - this.last.y) : 0;
    this.last = q;
    const p = this.paths[this.cur];
    if (!this.on || !p) return;
    // il punto più vicino poco più avanti: se il dito è sulla linea si avanza, se no conta come fuori
    let best = -1;
    let bd = Infinity;
    for (let i = this.idx; i < Math.min(p.length, this.idx + 10); i++) {
      const dd = Math.hypot(p[i].x - q.x, p[i].y - q.y);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    if (bd <= this.tol) {
      this.idx = Math.max(this.idx, best);
      this.offNow = Math.max(0, this.offNow - d * 4);
    } else {
      this.off += d;
      this.offNow = Math.min(1, this.offNow + d * 8);
    }
    if (this.idx >= p.length - 1) {
      this.cur++;
      this.idx = 0;
      this.on = false;
    }
  }

  protected up() {
    this.on = false;
    this.last = null;
  }

  step(dt: number) {
    const g = this.g;
    const { w, h } = this;
    const sq = this.sq();
    const S = sq.s;
    const P = (q: Pt) => [sq.x + q.x * S, sq.y + q.y * S] as const;
    const done = this.cur >= this.paths.length;
    if (done) {
      this.doneT += dt;
      if (this.doneT > 0.6) {
        this.end(clamp(1 - this.off * 1.4, 0.3, 1));
        return;
      }
    }
    this.offNow = Math.max(0, this.offNow - dt * 0.8);
    const saw = this.kind === 'sega';
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text(`${saw ? '🪚' : '🧵'} ${this.name}`, w / 2, 24, 20);
    this.text(done ? 'fatto!' : this.offNow > 0.3 ? 'sei fuori dalla linea!' : this.on ? 'continua lungo la linea' : 'metti il dito sul pallino verde', w / 2, 48, 13, this.offNow > 0.3 ? '#e5484d' : '#7a6f8f', 500);
    // il materiale: asse di legno o stoffa
    g.save();
    g.beginPath();
    g.roundRect(sq.x, sq.y + S * 0.12, S, S * 0.76, 14);
    if (saw) {
      g.fillStyle = '#d9a46a';
      g.fill();
      g.clip();
      g.strokeStyle = 'rgba(120,70,30,.25)';
      g.lineWidth = 2;
      for (let k = 0; k < 9; k++) {
        g.beginPath();
        g.moveTo(sq.x, sq.y + S * (0.16 + k * 0.08));
        g.bezierCurveTo(sq.x + S * 0.3, sq.y + S * (0.14 + k * 0.08), sq.x + S * 0.7, sq.y + S * (0.19 + k * 0.08), sq.x + S, sq.y + S * (0.16 + k * 0.08));
        g.stroke();
      }
    } else {
      g.fillStyle = '#6f8fd8';
      g.fill();
      g.clip();
      g.strokeStyle = 'rgba(255,255,255,.12)';
      g.lineWidth = 1;
      for (let k = 0; k < 40; k++) {
        g.beginPath();
        g.moveTo(sq.x + (k / 40) * S, sq.y);
        g.lineTo(sq.x + (k / 40) * S, sq.y + S);
        g.stroke();
      }
    }
    g.restore();
    // le linee: tratteggiate da fare, piene quelle fatte (taglio scuro o punti di cucito)
    this.paths.forEach((p, i) => {
      const upto = i < this.cur ? p.length - 1 : i === this.cur ? this.idx : 0;
      g.setLineDash([8, 7]);
      g.strokeStyle = i === this.cur ? (saw ? '#3a2f55' : '#ffffff') : 'rgba(58,47,85,.35)';
      g.lineWidth = 3;
      g.beginPath();
      p.forEach((q, k) => (k ? g.lineTo(...P(q)) : g.moveTo(...P(q))));
      g.stroke();
      g.setLineDash([]);
      if (upto > 0) {
        g.strokeStyle = saw ? '#4a2f1a' : '#ffd43b';
        g.lineWidth = saw ? 5 : 4;
        if (!saw) g.setLineDash([6, 4]);
        g.beginPath();
        for (let k = 0; k <= upto; k++) (k ? g.lineTo(...P(p[k])) : g.moveTo(...P(p[k])));
        g.stroke();
        g.setLineDash([]);
      }
      // dove mettere il dito (o riprendere)
      if (i === this.cur && !done) {
        const [px, py] = P(p[this.idx]);
        const pulse = 1 + 0.2 * Math.sin(performance.now() / 160);
        g.fillStyle = '#35c46a';
        g.beginPath();
        g.arc(px, py, 9 * (this.on ? 1 : pulse), 0, Math.PI * 2);
        g.fill();
        const [ex, ey] = P(p[p.length - 1]);
        g.strokeStyle = '#e5484d';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(ex, ey, 8, 0, Math.PI * 2);
        g.stroke();
      }
    });
    // lo strumento sotto il dito
    if (this.finger && this.on) {
      const { x, y } = this.finger;
      if (saw) {
        g.fillStyle = '#c9d0d8';
        g.beginPath();
        g.moveTo(x - 6, y - 40);
        g.lineTo(x + 6, y - 40);
        g.lineTo(x + 6, y + 6);
        g.lineTo(x - 6, y + 6);
        g.fill();
        g.fillStyle = '#e5484d';
        g.beginPath();
        g.roundRect(x - 9, y - 62, 18, 24, 5);
        g.fill();
      } else {
        g.strokeStyle = '#9aa6b1';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 8, y - 34);
        g.stroke();
      }
    }
    const tot = this.paths.length;
    this.text(`${Math.min(this.cur, tot)}/${tot} ${saw ? 'tagli' : 'cuciture'}`, w / 2, h - 34, 14, '#7a6f8f', 500);
    const p = this.paths[this.cur];
    this.bar((this.cur + (p ? this.idx / (p.length - 1) : 0)) / tot);
  }
}

// ======================================================================================
// Copri tutto: vernice col pennello o colla con la spatola
// ======================================================================================

export class CoverStation extends Station {
  private readonly G = 18;
  private cells: number[];
  /** dove si può passare (la sagoma da coprire: l'asse o il riquadro del pavimento) */
  private area = { x0: 0.12, y0: 0.22, x1: 0.88, y1: 0.78 };
  private outside = 0;
  private last: Pt | null = null;
  private doneT = 0;

  /** `kind`: 'vernice' (asse di legno da verniciare) o 'colla' (riquadro del pavimento); `brush` raggio del pennello. */
  constructor(private name: string, private kind: 'vernice' | 'colla', private brush: number, onEnd: (q: number) => void) {
    super(onEnd);
    if (kind === 'vernice') this.area = { x0: 0.08, y0: 0.36, x1: 0.92, y1: 0.64 };
    this.cells = new Array(this.G * this.G).fill(0);
  }

  private sq() {
    return this.square(70, 34);
  }

  guideSteps() {
    const a = this.area;
    return [
      { rect: this.sqRect(a.x0, a.y0, a.x1, a.y1), say: this.kind === 'vernice' ? '🖌️ Passa il pennello su tutta l\'asse' : '🪣 Stendi la colla su tutto il riquadro' },
      { rect: this.sqRect(a.x0, a.y0, a.x1, a.y1), say: '💡 Senza uscire dal bordo' },
    ];
  }

  private rel(x: number, y: number): Pt {
    const s = this.sq();
    return { x: (x - s.x) / s.s, y: (y - s.y) / s.s };
  }

  private inArea(p: Pt, m = 0) {
    const a = this.area;
    return p.x >= a.x0 - m && p.x <= a.x1 + m && p.y >= a.y0 - m && p.y <= a.y1 + m;
  }

  private cellPt(i: number): Pt {
    const a = this.area;
    return { x: a.x0 + ((i % this.G) + 0.5) / this.G * (a.x1 - a.x0), y: a.y0 + (Math.floor(i / this.G) + 0.5) / this.G * (a.y1 - a.y0) };
  }

  protected down(x: number, y: number) {
    this.last = this.rel(x, y);
    this.paint(this.last, 0);
  }

  protected move(x: number, y: number) {
    const p = this.rel(x, y);
    const d = this.last ? Math.hypot(p.x - this.last.x, p.y - this.last.y) : 0;
    // tra un punto e l'altro: si colora anche in mezzo (dito veloce)
    const n = Math.max(1, Math.ceil(d / (this.brush * 0.5)));
    for (let k = 1; k <= n; k++) this.paint({ x: this.last!.x + ((p.x - this.last!.x) * k) / n, y: this.last!.y + ((p.y - this.last!.y) * k) / n }, d / n);
    this.last = p;
  }

  protected up() {
    this.last = null;
  }

  private paint(p: Pt, d: number) {
    // fuori dal bordo (con un po' di margine): sbavature
    if (!this.inArea(p, this.brush * 0.6)) this.outside += d;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cellPt(i);
      if (Math.hypot(c.x - p.x, c.y - p.y) < this.brush) this.cells[i] = 1;
    }
  }

  private coverage() {
    return this.cells.reduce((a, b) => a + b, 0) / this.cells.length;
  }

  step(dt: number) {
    const g = this.g;
    const { w, h } = this;
    const sq = this.sq();
    const S = sq.s;
    const cov = this.coverage();
    const done = cov >= 0.96;
    if (done) {
      this.doneT += dt;
      if (this.doneT > 0.5) {
        this.end(clamp(1 - this.outside * 1.2, 0.3, 1));
        return;
      }
    }
    const paint = this.kind === 'vernice';
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text(`${paint ? '🖌️' : '🪣'} ${this.name}`, w / 2, 24, 20);
    this.text(done ? 'fatto!' : paint ? 'passa il pennello su tutta l\'asse' : 'stendi la colla su tutto il riquadro', w / 2, 48, 13, '#7a6f8f', 500);
    const a = this.area;
    const ax = sq.x + a.x0 * S;
    const ay = sq.y + a.y0 * S;
    const aw = (a.x1 - a.x0) * S;
    const ah = (a.y1 - a.y0) * S;
    // attorno: il banco da lavoro o il pavimento grezzo
    g.fillStyle = paint ? '#8d6e63' : '#b0a99f';
    g.beginPath();
    g.roundRect(sq.x, sq.y + S * 0.1, S, S * 0.8, 14);
    g.fill();
    // la sagoma da coprire
    g.fillStyle = paint ? '#e8c89a' : '#cfc8bd';
    g.fillRect(ax, ay, aw, ah);
    g.strokeStyle = '#ffc21a';
    g.setLineDash([8, 6]);
    g.lineWidth = 3;
    g.strokeRect(ax, ay, aw, ah);
    g.setLineDash([]);
    // le parti già coperte
    const cw = aw / this.G;
    const ch = ah / this.G;
    g.fillStyle = paint ? '#a0522d' : '#f2efe6';
    for (let i = 0; i < this.cells.length; i++) {
      if (!this.cells[i]) continue;
      g.fillRect(ax + (i % this.G) * cw - 0.5, ay + Math.floor(i / this.G) * ch - 0.5, cw + 1, ch + 1);
    }
    if (!paint) {
      // righe della spatola dentata sulla colla
      g.strokeStyle = 'rgba(120,110,100,.35)';
      g.lineWidth = 1;
      for (let i = 0; i < this.cells.length; i++) {
        if (!this.cells[i] || i % 2) continue;
        const x = ax + (i % this.G) * cw;
        const y = ay + Math.floor(i / this.G) * ch + ch / 2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + cw, y);
        g.stroke();
      }
    }
    // lo strumento sotto il dito
    if (this.finger) {
      const { x, y } = this.finger;
      const r = this.brush * S;
      g.fillStyle = paint ? 'rgba(160,82,45,.35)' : 'rgba(255,255,255,.4)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = paint ? '#ffc21a' : '#90a4ae';
      g.beginPath();
      g.roundRect(x - r * 0.8, y - r * 1.6, r * 1.6, r * 0.5, 4);
      g.fill();
    }
    this.text(`${Math.round(cov * 100)}% coperto`, w / 2, h - 34, 14, '#7a6f8f', 500);
    this.bar(cov / 0.96);
  }
}

// ======================================================================================
// Piastrelle: scegli il colore e posale come nel disegno
// ======================================================================================

const TILE_COLORS = ['#f4f1ea', '#2d9cdb', '#3a2f55', '#ffc21a'];

export class TileStation extends Station {
  private want: number[];
  private put: (number | null)[];
  private sel = 0;
  private doneT = -1;

  /** griglia `cols` × `rows`; `colors` colori nel disegno (2–3); il motivo cambia col livello */
  constructor(private cols: number, private rows: number, private colors: number, onEnd: (q: number) => void) {
    super(onEnd);
    const kind = Math.floor(Math.random() * (colors > 2 ? 3 : 2));
    this.want = Array.from({ length: cols * rows }, (_, i) => {
      const x = i % cols;
      const y = Math.floor(i / cols);
      const border = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
      if (kind === 0) return (x + y) % 2;
      if (kind === 1) return border ? 1 : 0;
      // tre colori: bordo, scacchi dentro
      return border ? 2 : (x + y) % 2;
    });
    this.put = this.want.map(() => null);
  }

  private sq() {
    return this.square(70, 34);
  }

  /** i colori posati (per rifare il pavimento uguale nella scena) e la tinta di ogni colore */
  result() {
    return { cols: this.cols, rows: this.rows, put: this.put.map((c) => c ?? 0), colors: TILE_COLORS };
  }

  /** riquadri: disegno (in alto a destra), griglia grande, vaschetta dei colori in basso */
  private boxes() {
    const s = this.sq();
    const S = s.s;
    const ref = { x: s.x + S * 0.66, y: s.y, w: S * 0.34, h: S * 0.26 };
    const gh = S * 0.56;
    const cell = Math.min((S * 0.92) / this.cols, gh / this.rows);
    const gw = cell * this.cols;
    const grid = { x: s.x + (S - gw) / 2, y: s.y + S * 0.29, cell, w: gw, h: cell * this.rows };
    const n = this.colors;
    const tw = Math.min(S * 0.2, (S * 0.9) / n);
    const tray = Array.from({ length: n }, (_, i) => ({ x: s.x + S / 2 - (n * tw) / 2 + i * tw + 4, y: s.y + S * 0.88, w: tw - 8, h: S * 0.12 }));
    return { ref, grid, tray };
  }

  guideSteps() {
    const b = this.boxes();
    const t = b.tray;
    return [
      { rect: () => this.screen(b.ref.x, b.ref.y, b.ref.w, b.ref.h), say: '🖼️ Il disegno: come vanno le piastrelle' },
      { rect: () => this.screen(t[0].x, t[0].y, t[t.length - 1].x + t[t.length - 1].w - t[0].x, t[0].h), say: '👆 Scegli il colore' },
      { rect: () => this.screen(b.grid.x, b.grid.y, b.grid.w, b.grid.h), say: '👆 Poi tocca il posto della piastrella' },
    ];
  }

  protected down(x: number, y: number) {
    if (this.doneT >= 0) return;
    const b = this.boxes();
    for (let i = 0; i < b.tray.length; i++) {
      const t = b.tray[i];
      if (x >= t.x && x <= t.x + t.w && y >= t.y - 6 && y <= t.y + t.h + 6) {
        this.sel = i;
        return;
      }
    }
    const gx = Math.floor((x - b.grid.x) / b.grid.cell);
    const gy = Math.floor((y - b.grid.y) / b.grid.cell);
    if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) return;
    this.put[gy * this.cols + gx] = this.sel;
    if (this.put.every((p) => p !== null)) this.doneT = 0;
  }

  step(dt: number) {
    const g = this.g;
    const { w, h } = this;
    const b = this.boxes();
    if (this.doneT >= 0) {
      this.doneT += dt;
      if (this.doneT > 0.7) {
        const ok = this.put.filter((p, i) => p === this.want[i]).length / this.want.length;
        this.end(ok);
        return;
      }
    }
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text('🧱 Posa le piastrelle', w / 2, 24, 20);
    this.text(this.doneT >= 0 ? 'fatto!' : 'scegli il colore e tocca il posto, come nel disegno', w / 2, 48, 13, '#7a6f8f', 500);
    // il disegno del cliente, piccolo
    const rc = Math.min((b.ref.w - 12) / this.cols, (b.ref.h - 20) / this.rows);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#3a2f55';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(b.ref.x, b.ref.y, b.ref.w, b.ref.h, 8);
    g.fill();
    g.stroke();
    const rx = b.ref.x + (b.ref.w - rc * this.cols) / 2;
    const ry = b.ref.y + 14 + (b.ref.h - 18 - rc * this.rows) / 2;
    this.want.forEach((c, i) => {
      g.fillStyle = TILE_COLORS[c];
      g.fillRect(rx + (i % this.cols) * rc, ry + Math.floor(i / this.cols) * rc, rc - 1, rc - 1);
    });
    this.text('disegno', b.ref.x + b.ref.w / 2, b.ref.y + 8, 10, '#7a6f8f', 700);
    // il pavimento con la colla e le piastrelle posate
    const gd = b.grid;
    g.fillStyle = '#d8d2c6';
    g.fillRect(gd.x - 4, gd.y - 4, gd.w + 8, gd.h + 8);
    this.put.forEach((c, i) => {
      const x = gd.x + (i % this.cols) * gd.cell;
      const y = gd.y + Math.floor(i / this.cols) * gd.cell;
      if (c === null) {
        g.strokeStyle = 'rgba(58,47,85,.25)';
        g.setLineDash([4, 4]);
        g.lineWidth = 1.5;
        g.strokeRect(x + 3, y + 3, gd.cell - 6, gd.cell - 6);
        g.setLineDash([]);
        return;
      }
      g.fillStyle = TILE_COLORS[c];
      g.fillRect(x + 2, y + 2, gd.cell - 4, gd.cell - 4);
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.fillRect(x + 4, y + 4, gd.cell - 8, 3);
    });
    // la vaschetta dei colori
    b.tray.forEach((t, i) => {
      g.fillStyle = TILE_COLORS[i];
      g.strokeStyle = i === this.sel ? '#ffc21a' : '#3a2f55';
      g.lineWidth = i === this.sel ? 5 : 2;
      g.beginPath();
      g.roundRect(t.x, t.y, t.w, t.h, 8);
      g.fill();
      g.stroke();
    });
    const n = this.put.filter((p) => p !== null).length;
    this.bar(n / this.put.length);
  }
}

// ======================================================================================
// Foto: tieni il gruppo nella cornice e scatta quando sorridono
// ======================================================================================

export class PhotoStation extends Station {
  /** spostamento della vista (trascinando il dito) e oscillazione del gruppo */
  private view = { x: 0, y: 0 };
  private grab: Pt | null = null;
  private t = Math.random() * 10;
  private shots: number[] = [];
  private flash = 0;
  private msg = '';
  private msgT = 0;
  private people: { dx: number; c: string; phase: number }[];

  /** `need` foto da fare; `speed` quanto in fretta si muovono e `sway` quanto (0–1 del riquadro); `smile` quanto dura il sorriso (s) */
  constructor(private name: string, private need: number, private speed: number, private sway: number, private smile: number, size: number, onEnd: (q: number) => void) {
    super(onEnd);
    const cols = ['#e5484d', '#2d9cdb', '#35c46a', '#8e5bd6', '#ff8a3d'];
    this.people = Array.from({ length: size }, (_, i) => ({ dx: (i - (size - 1) / 2) * 0.13, c: cols[i % cols.length], phase: Math.random() * 6 }));
  }

  private sq() {
    return this.square(70, 34);
  }

  /** centro del gruppo nel riquadro (0–1), con l'oscillazione e lo spostamento della vista */
  private group(): Pt {
    return { x: 0.5 + Math.sin(this.t * this.speed) * this.sway + this.view.x, y: 0.5 + Math.sin(this.t * this.speed * 0.7 + 1) * 0.06 + this.view.y };
  }

  /** sorridono adesso? (un sorriso ogni tanto, che dura `smile` secondi) */
  private smiling() {
    const period = this.smile + 2.2;
    return this.t % period < this.smile;
  }

  private frame() {
    return { x0: 0.28, y0: 0.24, x1: 0.72, y1: 0.7 };
  }

  private shutter() {
    return { x: 0.5, y: 0.88, r: 0.075 };
  }

  guideSteps() {
    const f = this.frame();
    const b = this.shutter();
    return [
      { rect: this.sqRect(f.x0, f.y0, f.x1, f.y1), say: '📷 Il gruppo deve stare dentro la cornice' },
      { rect: this.sqRect(0.05, 0.12, 0.95, 0.78), say: '👆 Trascina il dito per seguirli' },
      { rect: this.sqRect(f.x0, f.y0, f.x1, f.y1), say: '😊 Aspetta che sorridano' },
      { rect: this.sqRect(b.x - b.r - 0.02, b.y - b.r - 0.02, b.x + b.r + 0.02, b.y + b.r + 0.02), say: '👆 Poi tocca qui per scattare' },
    ];
  }

  private rel(x: number, y: number): Pt {
    const s = this.sq();
    return { x: (x - s.x) / s.s, y: (y - s.y) / s.s };
  }

  protected down(x: number, y: number) {
    const p = this.rel(x, y);
    const b = this.shutter();
    if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 0.03) {
      this.shoot();
      return;
    }
    this.grab = p;
  }

  protected move(x: number, y: number) {
    if (!this.grab) return;
    const p = this.rel(x, y);
    // si sposta la vista al contrario del dito (come girare la macchina): il gruppo segue il dito
    this.view.x = clamp(this.view.x + (p.x - this.grab.x), -0.4, 0.4);
    this.view.y = clamp(this.view.y + (p.y - this.grab.y), -0.2, 0.2);
    this.grab = p;
  }

  protected up() {
    this.grab = null;
  }

  private shoot() {
    if (this.shots.length >= this.need) return;
    const f = this.frame();
    const c = this.group();
    const half = (this.people.length - 1) * 0.065 + 0.06;
    const inside = c.x - half >= f.x0 - 0.02 && c.x + half <= f.x1 + 0.02 && c.y > f.y0 + 0.05 && c.y < f.y1 - 0.02;
    const q = (inside ? 0.6 : 0.2) + (this.smiling() ? 0.4 : 0);
    this.shots.push(q);
    this.flash = 1;
    this.msg = q >= 0.95 ? '✨ Bellissima!' : !inside ? 'Qualcuno è fuori dalla cornice' : 'Non sorridevano';
    this.msgT = 1.4;
  }

  step(dt: number) {
    const g = this.g;
    const { w, h } = this;
    const sq = this.sq();
    const S = sq.s;
    const P = (u: number, v: number) => [sq.x + u * S, sq.y + v * S] as const;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.msgT = Math.max(0, this.msgT - dt);
    if (this.shots.length >= this.need && this.flash <= 0 && this.msgT < 0.6) {
      this.end(this.shots.reduce((a, b) => a + b, 0) / this.shots.length);
      return;
    }
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text(`📷 ${this.name}`, w / 2, 24, 20);
    this.text(this.msgT > 0 ? this.msg : 'cornice sul gruppo, scatta quando sorridono', w / 2, 48, 13, this.msgT > 0 && !this.msg.startsWith('✨') ? '#e5484d' : '#7a6f8f', 500);
    // il giardino della festa
    g.save();
    g.beginPath();
    g.roundRect(sq.x, sq.y + S * 0.1, S, S * 0.7, 14);
    g.clip();
    g.fillStyle = '#bfe3ff';
    g.fillRect(sq.x, sq.y, S, S);
    const [, hy] = P(0, 0.62 + this.view.y);
    g.fillStyle = '#8fd07a';
    g.fillRect(sq.x, hy, S, S);
    // festoni
    g.strokeStyle = '#ff9ec4';
    g.lineWidth = 2;
    for (let k = -2; k < 4; k++) {
      const [fx, fy] = P(k * 0.3 + this.view.x, 0.18 + this.view.y);
      g.beginPath();
      g.moveTo(fx, fy);
      g.quadraticCurveTo(fx + S * 0.15, fy + S * 0.06, fx + S * 0.3, fy);
      g.stroke();
    }
    // le persone: corpo, testa, faccia (sorriso o no)
    const c = this.group();
    const happy = this.smiling();
    for (const p of this.people) {
      const bob = Math.sin(this.t * 3 + p.phase) * 0.008;
      const [px, py] = P(c.x + p.dx, c.y + bob);
      g.fillStyle = p.c;
      g.beginPath();
      g.roundRect(px - S * 0.045, py, S * 0.09, S * 0.16, 10);
      g.fill();
      g.fillStyle = '#ffcf9e';
      g.beginPath();
      g.arc(px, py - S * 0.035, S * 0.045, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3a2f55';
      g.beginPath();
      g.arc(px - S * 0.015, py - S * 0.045, 2.2, 0, Math.PI * 2);
      g.arc(px + S * 0.015, py - S * 0.045, 2.2, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#3a2f55';
      g.lineWidth = 2;
      g.beginPath();
      if (happy) g.arc(px, py - S * 0.03, S * 0.018, 0.15 * Math.PI, 0.85 * Math.PI);
      else {
        g.moveTo(px - S * 0.012, py - S * 0.018);
        g.lineTo(px + S * 0.012, py - S * 0.018);
      }
      g.stroke();
    }
    g.restore();
    // la cornice del mirino
    const f = this.frame();
    const [fx0, fy0] = P(f.x0, f.y0);
    const [fx1, fy1] = P(f.x1, f.y1);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4;
    const L = 18;
    for (const [x, y, sx, sy] of [[fx0, fy0, 1, 1], [fx1, fy0, -1, 1], [fx0, fy1, 1, -1], [fx1, fy1, -1, -1]] as const) {
      g.beginPath();
      g.moveTo(x, y + sy * L);
      g.lineTo(x, y);
      g.lineTo(x + sx * L, y);
      g.stroke();
    }
    // il tasto per scattare
    const b = this.shutter();
    const [bx, by] = P(b.x, b.y);
    g.fillStyle = '#e5484d';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(bx, by, b.r * S, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${this.flash * 0.85})`;
      g.fillRect(0, 0, w, h);
    }
    this.text(`${this.shots.length}/${this.need} foto`, w / 2, h - 18, 13, '#7a6f8f', 600);
  }
}

// ======================================================================================
// Bottone: tocca i buchi nell'ordine acceso, per qualche giro
// ======================================================================================

export class ButtonStation extends Station {
  /** ordine dei buchi: diagonale e poi l'altra (0 alto-sinistra, 1 alto-destra, 2 basso-destra, 3 basso-sinistra) */
  private readonly order = [0, 2, 1, 3];
  private step_ = 0;
  private wrong = 0;
  private flashBad = 0;
  private doneT = -1;

  /** `reps` giri dell'ordine completo; `buttons` bottoni uno dopo l'altro */
  constructor(private reps: number, private buttons: number, onEnd: (q: number) => void) {
    super(onEnd);
  }

  private sq() {
    return this.square(70, 34);
  }

  private get total() {
    return this.reps * this.order.length * this.buttons;
  }

  private hole(i: number): Pt {
    const d = 0.08;
    return [{ x: 0.5 - d, y: 0.5 - d }, { x: 0.5 + d, y: 0.5 - d }, { x: 0.5 + d, y: 0.5 + d }, { x: 0.5 - d, y: 0.5 + d }][i];
  }

  private next() {
    return this.order[this.step_ % this.order.length];
  }

  guideSteps() {
    const h = this.hole(this.next());
    return [
      { rect: this.sqRect(0.3, 0.3, 0.7, 0.7), say: '🧵 Cuci il bottone: tocca i buchi in ordine' },
      { rect: this.sqRect(h.x - 0.06, h.y - 0.06, h.x + 0.06, h.y + 0.06), say: '👆 Tocca il buco acceso' },
    ];
  }

  protected down(x: number, y: number) {
    if (this.doneT >= 0) return;
    const s = this.sq();
    const p = { x: (x - s.x) / s.s, y: (y - s.y) / s.s };
    let best = -1;
    let bd = 0.07;
    for (let i = 0; i < 4; i++) {
      const hp = this.hole(i);
      const d = Math.hypot(hp.x - p.x, hp.y - p.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return;
    if (best === this.next()) {
      this.step_++;
      if (this.step_ >= this.total) this.doneT = 0;
    } else {
      this.wrong++;
      this.flashBad = 1;
    }
  }

  step(dt: number) {
    const g = this.g;
    const { w, h } = this;
    const sq = this.sq();
    const S = sq.s;
    const P = (q: Pt) => [sq.x + q.x * S, sq.y + q.y * S] as const;
    this.flashBad = Math.max(0, this.flashBad - dt * 2);
    if (this.doneT >= 0) {
      this.doneT += dt;
      if (this.doneT > 0.6) {
        this.end(clamp(1 - this.wrong * 0.08, 0.3, 1));
        return;
      }
    }
    const perButton = this.reps * this.order.length;
    const btn = Math.min(this.buttons, Math.floor(this.step_ / perButton) + 1);
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text(`🧵 Attacca il bottone${this.buttons > 1 ? ` ${btn}/${this.buttons}` : ''}`, w / 2, 24, 20);
    this.text(this.doneT >= 0 ? 'fatto!' : this.flashBad > 0.3 ? 'buco sbagliato: segui quello acceso' : 'tocca il buco acceso', w / 2, 48, 13, this.flashBad > 0.3 ? '#e5484d' : '#7a6f8f', 500);
    // la stoffa e il bottone
    g.fillStyle = '#f2e6d0';
    g.beginPath();
    g.roundRect(sq.x, sq.y + S * 0.1, S, S * 0.8, 14);
    g.fill();
    const [cx, cy] = P({ x: 0.5, y: 0.5 });
    g.fillStyle = '#8e5bd6';
    g.beginPath();
    g.arc(cx, cy, S * 0.17, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#6c3fb0';
    g.lineWidth = 4;
    g.stroke();
    // il filo già passato (dentro questo bottone)
    const inBtn = this.step_ - (btn - 1) * perButton;
    g.strokeStyle = '#ffd43b';
    g.lineWidth = 3;
    for (let k = 1; k < Math.min(inBtn, perButton) + (this.doneT >= 0 ? 0 : 0); k++) {
      const a = this.hole(this.order[(k - 1) % 4]);
      const b = this.hole(this.order[k % 4]);
      g.beginPath();
      g.moveTo(...P(a));
      g.lineTo(...P(b));
      g.stroke();
    }
    // i buchi: quello da toccare acceso
    for (let i = 0; i < 4; i++) {
      const [hx, hy] = P(this.hole(i));
      const now = this.doneT < 0 && i === this.next();
      g.fillStyle = '#3a2f55';
      g.beginPath();
      g.arc(hx, hy, S * 0.028, 0, Math.PI * 2);
      g.fill();
      if (now) {
        const pulse = 1 + 0.25 * Math.sin(performance.now() / 150);
        g.strokeStyle = '#35c46a';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(hx, hy, S * 0.05 * pulse, 0, Math.PI * 2);
        g.stroke();
      }
    }
    this.text(`${Math.min(this.step_, this.total)}/${this.total} punti`, w / 2, h - 34, 14, '#7a6f8f', 500);
    this.bar(this.step_ / this.total);
  }
}
