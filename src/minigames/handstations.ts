import { Station } from './station';

/**
 * Minigiochi col dito dei lavoretti di Costruzione e manualità (src/minigames/manual3d.ts):
 * - WipeStation: strofina col panno la polvere o gli aloni su un mobile o uno specchio;
 * - ScrewStation: avvita le viti girando il dito in tondo, come le lancette;
 * - PipeStation: gira i pezzi di tubo finché l'acqua arriva al rubinetto.
 * Come gli altri (station.ts): si aprono toccando la postazione e alla fine dicono com'è andata (0–1).
 */

type Pt = { x: number; y: number };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ======================================================================================
// Panno: strofina via la polvere (mobili) o gli aloni (specchio)
// ======================================================================================

export class WipeStation extends Station {
  private spots: { x: number; y: number; r: number; a: number }[] = [];
  private cloth: Pt | null = null;
  private last: Pt | null = null;
  private doneT = 0;

  /**
   * `kind`: 'polvere' (piano di legno con la polvere grigia) o 'specchio' (vetro con gli aloni).
   * `n` macchie; `tough`: quanto toglie ogni passata (più basso = più ostinate).
   */
  constructor(private name: string, private kind: 'polvere' | 'specchio', n: number, private tough: number, onEnd: (q: number) => void) {
    super(onEnd);
    for (let i = 0; i < n * 30 && this.spots.length < n; i++) {
      const x = 0.14 + Math.random() * 0.72;
      const y = 0.16 + Math.random() * 0.68;
      if (this.spots.some((s) => Math.hypot(s.x - x, s.y - y) < 0.2)) continue;
      this.spots.push({ x, y, r: 0.07 + Math.random() * 0.05, a: 1 });
    }
  }

  private sq() {
    return this.square(70, 34);
  }

  guideSteps() {
    const s = this.sq();
    const first = this.spots.find((p) => p.a > 0);
    const spot = first ? () => this.screen(s.x + (first.x - first.r) * s.s, s.y + (first.y - first.r) * s.s, first.r * 2 * s.s, first.r * 2 * s.s) : () => this.screen(s.x, s.y, s.s, s.s);
    return [
      { rect: () => this.screen(s.x, s.y, s.s, s.s), say: this.kind === 'specchio' ? '🧽 Lo specchio ha degli aloni' : '🧽 Sul mobile c\'è la polvere' },
      { rect: spot, say: '👆 Strofina col dito sulle macchie finché spariscono' },
    ];
  }

  private rel(x: number, y: number): Pt {
    const s = this.sq();
    return { x: (x - s.x) / s.s, y: (y - s.y) / s.s };
  }

  protected down(x: number, y: number) {
    this.cloth = this.last = this.rel(x, y);
  }

  protected move(x: number, y: number) {
    const p = this.rel(x, y);
    const d = this.last ? Math.hypot(p.x - this.last.x, p.y - this.last.y) : 0;
    this.cloth = this.last = p;
    for (const s of this.spots) if (s.a > 0 && Math.hypot(s.x - p.x, s.y - p.y) < s.r + 0.06) s.a = Math.max(0, s.a - d * this.tough);
  }

  protected up() {
    this.cloth = this.last = null;
  }

  step(dt: number) {
    const g = this.g;
    const { w, h } = this;
    const sq = this.sq();
    const S = sq.s;
    const left = this.spots.filter((s) => s.a > 0).length;
    if (!left) {
      this.doneT += dt;
      if (this.doneT > 0.6) {
        this.end(1);
        return;
      }
    }
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text(`🧽 ${this.name}`, w / 2, 24, 20);
    this.text(left ? 'strofina col dito sulle macchie' : 'pulito!', w / 2, 48, 13, '#7a6f8f', 500);
    // la superficie: legno del mobile o vetro dello specchio con la cornice
    g.save();
    g.beginPath();
    g.roundRect(sq.x, sq.y, S, S, 16);
    if (this.kind === 'specchio') {
      g.fillStyle = '#c8a46a';
      g.fill();
      g.beginPath();
      g.roundRect(sq.x + 10, sq.y + 10, S - 20, S - 20, 10);
      const gr = g.createLinearGradient(sq.x, sq.y, sq.x + S, sq.y + S);
      gr.addColorStop(0, '#dff3ff');
      gr.addColorStop(1, '#a9d4ee');
      g.fillStyle = gr;
      g.fill();
      // riflesso
      g.strokeStyle = 'rgba(255,255,255,.7)';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(sq.x + S * 0.2, sq.y + S * 0.75);
      g.lineTo(sq.x + S * 0.45, sq.y + S * 0.25);
      g.stroke();
    } else {
      g.fillStyle = '#b8834f';
      g.fill();
      g.strokeStyle = 'rgba(90,50,20,.18)';
      g.lineWidth = 2;
      for (let k = 1; k < 8; k++) {
        g.beginPath();
        g.moveTo(sq.x + 8, sq.y + (S * k) / 8);
        g.lineTo(sq.x + S - 8, sq.y + (S * k) / 8 + Math.sin(k) * 4);
        g.stroke();
      }
    }
    g.restore();
    // macchie: polvere grigia o aloni bianchi; strofinando si rimpiccioliscono (restano ben visibili finché non sono finite)
    for (const s of this.spots) {
      if (s.a <= 0) continue;
      const cx = sq.x + s.x * S;
      const cy = sq.y + s.y * S;
      const rad = s.r * S * (0.2 + 0.8 * s.a);
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const c = this.kind === 'specchio' ? '255,255,255' : '120,115,110';
      gr.addColorStop(0, `rgba(${c},0.85)`);
      gr.addColorStop(0.7, `rgba(${c},0.6)`);
      gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, cy, rad, 0, Math.PI * 2);
      g.fill();
    }
    // il panno sotto il dito
    if (this.cloth) {
      const cx = sq.x + this.cloth.x * S;
      const cy = sq.y + this.cloth.y * S;
      g.fillStyle = '#ffd43b';
      g.beginPath();
      g.roundRect(cx - 26, cy - 18, 52, 36, 8);
      g.fill();
      g.strokeStyle = '#e8a90c';
      g.lineWidth = 2;
      g.stroke();
    }
    const tot = this.spots.length || 1;
    this.text(`${tot - left}/${tot} pulite`, w / 2, h - 34, 14, '#7a6f8f', 500);
    this.bar((tot - left) / tot);
  }
}

// ======================================================================================
// Avvitare: il dito gira in tondo attorno alla vite (in senso orario)
// ======================================================================================

export class ScrewStation extends Station {
  private cur = 0;
  /** giri fatti sulla vite di adesso (in radianti; al contrario si svita) */
  private turned = 0;
  private lastAng: number | null = null;
  private wrongWay = 0;
  private doneT = 0;
  private readonly need: number;

  /** `n` viti; `turns` giri per vita (sale col livello). */
  constructor(private name: string, private n: number, turns: number, onEnd: (q: number) => void) {
    super(onEnd);
    this.need = turns * Math.PI * 2;
  }

  private sq() {
    return this.square(70, 34);
  }

  /** dove sta la vite i (frazioni del riquadro) */
  private spot(i: number): Pt {
    const cols = Math.min(this.n, 3);
    const row = Math.floor(i / cols);
    const rows = Math.ceil(this.n / cols);
    const inRow = Math.min(cols, this.n - row * cols);
    return { x: (i % cols + 1) / (inRow + 1), y: rows === 1 ? 0.55 : 0.35 + row * 0.4 };
  }

  guideSteps() {
    const s = this.sq();
    const p = this.spot(this.cur);
    const r = s.s * 0.22;
    return [
      { rect: () => this.screen(s.x + p.x * s.s - r, s.y + p.y * s.s - r, r * 2, r * 2), say: '🔧 Questa è la vite da avvitare' },
      { rect: () => this.screen(s.x + p.x * s.s - r, s.y + p.y * s.s - r, r * 2, r * 2), say: '👆 Gira il dito in tondo attorno alla vite, come le lancette dell\'orologio' },
    ];
  }

  private center() {
    const s = this.sq();
    const p = this.spot(this.cur);
    return { x: s.x + p.x * s.s, y: s.y + p.y * s.s };
  }

  protected down(x: number, y: number) {
    const c = this.center();
    this.lastAng = Math.atan2(y - c.y, x - c.x);
  }

  protected move(x: number, y: number) {
    if (this.cur >= this.n) return;
    const c = this.center();
    // troppo vicino al centro l'angolo salta: non conta
    if (Math.hypot(x - c.x, y - c.y) < 12) return;
    const a = Math.atan2(y - c.y, x - c.x);
    if (this.lastAng !== null) {
      let d = a - this.lastAng;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      // sullo schermo l'asse y va in giù: d > 0 è il verso delle lancette
      this.turned = clamp(this.turned + d, 0, this.need);
      if (d < -0.05) this.wrongWay = 1;
      else if (d > 0.05) this.wrongWay = Math.max(0, this.wrongWay - 0.1);
      if (this.turned >= this.need) {
        this.cur++;
        this.turned = 0;
        this.lastAng = null;
        return;
      }
    }
    this.lastAng = a;
  }

  protected up() {
    this.lastAng = null;
  }

  step(dt: number) {
    const g = this.g;
    const { w, h } = this;
    const sq = this.sq();
    const S = sq.s;
    if (this.cur >= this.n) {
      this.doneT += dt;
      if (this.doneT > 0.5) {
        this.end(1);
        return;
      }
    }
    this.wrongWay = Math.max(0, this.wrongWay - dt * 0.6);
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text(`🔧 ${this.name}`, w / 2, 24, 20);
    this.text(this.cur >= this.n ? 'fatto!' : this.wrongWay > 0.3 ? 'al contrario si svita: gira come le lancette 🔄' : 'gira il dito attorno alla vite 🔄', w / 2, 48, 13, this.wrongWay > 0.3 ? '#e5484d' : '#7a6f8f', 500);
    // la tavola del mobile
    g.fillStyle = '#e3c08f';
    g.beginPath();
    g.roundRect(sq.x, sq.y + S * 0.12, S, S * 0.76, 14);
    g.fill();
    g.strokeStyle = 'rgba(120,80,30,.25)';
    g.lineWidth = 2;
    g.stroke();
    for (let i = 0; i < this.n; i++) {
      const p = this.spot(i);
      const cx = sq.x + p.x * S;
      const cy = sq.y + p.y * S;
      const done = i < this.cur;
      const now = i === this.cur;
      const k = now ? this.turned / this.need : done ? 1 : 0;
      // cerchio da seguire col dito attorno alla vite di adesso
      if (now) {
        const r = S * 0.19;
        g.strokeStyle = 'rgba(91,141,239,.35)';
        g.lineWidth = 10;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = '#5b8def';
        g.beginPath();
        g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ((this.turned % (Math.PI * 2)) / (Math.PI * 2)));
        g.stroke();
        // freccia del verso giusto
        const ax = cx + r;
        g.fillStyle = '#5b8def';
        g.beginPath();
        g.moveTo(ax - 9, cy - 6);
        g.lineTo(ax + 9, cy - 6);
        g.lineTo(ax, cy + 8);
        g.fill();
      }
      // la vite: più si avvita più si abbassa (diventa più piccola) e gira la croce
      const vr = S * (0.085 - 0.02 * k);
      g.fillStyle = done ? '#9aa6b1' : '#c9d0d8';
      g.beginPath();
      g.arc(cx, cy, vr, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#6b7783';
      g.lineWidth = 3;
      const rot = now ? this.turned : done ? 0.6 : 0;
      for (const o of [0, Math.PI / 2]) {
        g.beginPath();
        g.moveTo(cx + Math.cos(rot + o) * vr * 0.7, cy + Math.sin(rot + o) * vr * 0.7);
        g.lineTo(cx - Math.cos(rot + o) * vr * 0.7, cy - Math.sin(rot + o) * vr * 0.7);
        g.stroke();
      }
    }
    this.text(`${Math.min(this.cur, this.n)}/${this.n} viti`, w / 2, h - 34, 14, '#7a6f8f', 500);
    this.bar((this.cur + (this.cur < this.n ? this.turned / this.need : 0)) / this.n);
  }
}

// ======================================================================================
// Tubi: gira i pezzi finché l'acqua passa dal tubo d'ingresso al rubinetto
// ======================================================================================

/** lati aperti di un pezzo: 0 su, 1 destra, 2 giù, 3 sinistra */
type Piece = 'dritto' | 'curva';
const OPEN: Record<Piece, number[]> = { dritto: [1, 3], curva: [0, 1] };
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export class PipeStation extends Station {
  private cells: { p: Piece; rot: number }[] = [];
  private taps = 0;
  private minTaps = 0;
  private wet = new Set<number>();
  private doneT = -1;
  /** per ogni pezzo del percorso, i giri che lo collegano (servono anche alle prove automatiche) */
  readonly good = new Map<number, number[]>();

  /** `cols` × `rows` pezzi; l'acqua entra a sinistra nella riga `inRow` ed esce a destra nella riga `outRow`. */
  constructor(private cols: number, private rows: number, onEnd: (q: number) => void, private inRow = Math.floor(Math.random() * rows), private outRow = Math.floor(Math.random() * rows)) {
    super(onEnd);
    // un percorso a caso da sinistra a destra (avanti, su e giù senza ripassare): i suoi pezzi lo formano
    const path = this.walk();
    const want = new Map<number, number[]>();
    for (let i = 0; i < path.length; i++) {
      const [x, y] = path[i];
      const prev = i === 0 ? [x - 1, y] : path[i - 1];
      const next = i === path.length - 1 ? [x + 1, y] : path[i + 1];
      const dir = (a: number[], b: number[]) => DX.findIndex((dx, k) => dx === b[0] - a[0] && DY[k] === b[1] - a[1]);
      want.set(y * cols + x, [dir([x, y], prev), dir([x, y], next)]);
    }
    for (let i = 0; i < cols * rows; i++) {
      const sides = want.get(i);
      const p: Piece = sides ? ((sides[0] + 2) % 4 === sides[1] ? 'dritto' : 'curva') : Math.random() < 0.5 ? 'dritto' : 'curva';
      // girata a caso (contano i tocchi in più rispetto ai giri che servivano davvero)
      const rot = Math.floor(Math.random() * 4);
      this.cells.push({ p, rot });
      if (sides) {
        const good = [0, 1, 2, 3].filter((r) => this.sides({ p, rot: r }).sort().join() === [...sides].sort().join());
        this.good.set(i, good);
        this.minTaps += Math.min(...good.map((r) => (r - rot + 4) % 4));
      }
    }
    this.flow();
    // già collegato per caso: si gira un pezzo del percorso
    if (this.connected()) {
      const k = [...want.keys()][0];
      this.cells[k].rot = (this.cells[k].rot + 1) % 4;
      this.minTaps += 3;
      this.flow();
    }
  }

  private walk() {
    for (let tries = 0; tries < 200; tries++) {
      const path: number[][] = [[0, this.inRow]];
      const seen = new Set([`0,${this.inRow}`]);
      let ok = true;
      while (true) {
        const [x, y] = path[path.length - 1];
        if (x === this.cols - 1 && y === this.outRow) break;
        const opts: number[][] = [];
        if (x < this.cols - 1) opts.push([x + 1, y], [x + 1, y]);
        if (y > 0) opts.push([x, y - 1]);
        if (y < this.rows - 1) opts.push([x, y + 1]);
        const free = opts.filter(([a, b]) => !seen.has(`${a},${b}`));
        if (!free.length) {
          ok = false;
          break;
        }
        // nell'ultima colonna si va dritti verso l'uscita
        const n = x === this.cols - 1 ? free.find(([, b]) => Math.sign(b - y) === Math.sign(this.outRow - y)) : free[Math.floor(Math.random() * free.length)];
        if (!n) {
          ok = false;
          break;
        }
        path.push(n);
        seen.add(`${n[0]},${n[1]}`);
        if (path.length > this.cols * this.rows) {
          ok = false;
          break;
        }
      }
      if (ok) return path;
    }
    // non trovato (rarissimo): dritto nella riga d'ingresso, con l'uscita lì
    this.outRow = this.inRow;
    return Array.from({ length: this.cols }, (_, x) => [x, this.inRow]);
  }

  private sides(c: { p: Piece; rot: number }) {
    return OPEN[c.p].map((s) => (s + c.rot) % 4);
  }

  /** l'acqua dall'ingresso: quali pezzi bagna */
  private flow() {
    this.wet.clear();
    let x = 0;
    let y = this.inRow;
    let from = 3;
    for (let k = 0; k < this.cols * this.rows; k++) {
      if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) break;
      const i = y * this.cols + x;
      const s = this.sides(this.cells[i]);
      if (!s.includes(from) || this.wet.has(i)) break;
      this.wet.add(i);
      const out = s.find((v) => v !== from)!;
      if (x === this.cols - 1 && y === this.outRow && out === 1) {
        this.wet.add(-1);
        break;
      }
      x += DX[out];
      y += DY[out];
      from = (out + 2) % 4;
    }
  }

  private connected() {
    return this.wet.has(-1);
  }

  private grid() {
    const top = 64;
    const bottom = 34;
    const side = 34;
    const cs = Math.min((this.w - side * 2) / this.cols, (this.h - top - bottom) / this.rows);
    const gw = cs * this.cols;
    const gh = cs * this.rows;
    return { x: (this.w - gw) / 2, y: top + (this.h - top - bottom - gh) / 2, cs, gw, gh };
  }

  guideSteps() {
    const gr = this.grid();
    return [
      { rect: () => this.screen(gr.x - 34, gr.y + this.inRow * gr.cs, 34, gr.cs), say: '💧 L\'acqua arriva da qui' },
      { rect: () => this.screen(gr.x + gr.gw, gr.y + this.outRow * gr.cs, 34, gr.cs), say: '🚿 Deve arrivare al rubinetto, qui' },
      { rect: () => this.screen(gr.x, gr.y, gr.gw, gr.gh), say: '👆 Tocca un tubo per girarlo: collegali tutti' },
    ];
  }

  protected down(x: number, y: number) {
    if (this.doneT >= 0) return;
    const gr = this.grid();
    const cx = Math.floor((x - gr.x) / gr.cs);
    const cy = Math.floor((y - gr.y) / gr.cs);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return;
    const c = this.cells[cy * this.cols + cx];
    c.rot = (c.rot + 1) % 4;
    this.taps++;
    this.flow();
    if (this.connected()) this.doneT = 0;
  }

  step(dt: number) {
    const g = this.g;
    const { w, h } = this;
    const gr = this.grid();
    if (this.doneT >= 0) {
      this.doneT += dt;
      if (this.doneT > 1) {
        // i tocchi in più tolgono qualcosa (mai sotto metà)
        this.end(clamp(1 - Math.max(0, this.taps - this.minTaps) * 0.03, 0.5, 1));
        return;
      }
    }
    g.fillStyle = '#fff8ec';
    g.fillRect(0, 0, w, h);
    this.text('💧 Collega i tubi', w / 2, 24, 20);
    this.text(this.connected() ? 'l\'acqua arriva al rubinetto!' : 'tocca i tubi per girarli: l\'acqua deve arrivare al rubinetto', w / 2, 48, 13, '#7a6f8f', 500);
    // parete piastrellata
    g.fillStyle = '#e6eef3';
    g.fillRect(gr.x, gr.y, gr.gw, gr.gh);
    const cs = gr.cs;
    for (let i = 0; i < this.cells.length; i++) {
      const cx = gr.x + (i % this.cols) * cs;
      const cy = gr.y + Math.floor(i / this.cols) * cs;
      g.strokeStyle = 'rgba(0,0,0,.08)';
      g.lineWidth = 1;
      g.strokeRect(cx, cy, cs, cs);
      const wet = this.wet.has(i);
      const s = this.sides(this.cells[i]);
      const mx = cx + cs / 2;
      const my = cy + cs / 2;
      for (const [col, lw] of [[wet ? '#2f7fd8' : '#8c96a0', cs * 0.32], [wet ? '#6fc3ff' : '#c9d0d8', cs * 0.2]] as const) {
        g.strokeStyle = col;
        g.lineWidth = lw;
        g.lineCap = 'butt';
        if (this.cells[i].p === 'dritto') {
          g.beginPath();
          g.moveTo(mx + DX[s[0]] * cs / 2, my + DY[s[0]] * cs / 2);
          g.lineTo(mx + DX[s[1]] * cs / 2, my + DY[s[1]] * cs / 2);
          g.stroke();
        } else {
          // curva: quarto di cerchio attorno all'angolo tra i due lati aperti
          const ax = cx + (s.includes(1) ? cs : 0);
          const ay = cy + (s.includes(0) ? 0 : cs);
          const a1 = Math.atan2(0, s.includes(1) ? -1 : 1);
          const a2 = Math.atan2(s.includes(0) ? 1 : -1, 0);
          let d = a2 - a1;
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          g.beginPath();
          g.arc(ax, ay, cs / 2, a1, a2, d < 0);
          g.stroke();
        }
      }
      // giunto al centro (solo sui tubi dritti: la curva non passa dal centro)
      if (this.cells[i].p === 'dritto') {
        g.fillStyle = wet ? '#2f7fd8' : '#7a848e';
        g.beginPath();
        g.arc(mx, my, cs * 0.09, 0, Math.PI * 2);
        g.fill();
      }
    }
    // tubo d'ingresso (a sinistra) e rubinetto (a destra)
    const iy = gr.y + (this.inRow + 0.5) * cs;
    const oy = gr.y + (this.outRow + 0.5) * cs;
    g.fillStyle = '#2f7fd8';
    g.fillRect(gr.x - 30, iy - cs * 0.16, 30, cs * 0.32);
    this.text('💧', gr.x - 18, iy - cs * 0.42, 16);
    g.fillStyle = this.connected() ? '#2f7fd8' : '#8c96a0';
    g.fillRect(gr.x + gr.gw, oy - cs * 0.16, 16, cs * 0.32);
    g.fillStyle = '#c9d0d8';
    g.beginPath();
    g.roundRect(gr.x + gr.gw + 12, oy - cs * 0.3, 18, cs * 0.6, 5);
    g.fill();
    if (this.connected()) {
      g.fillStyle = '#6fc3ff';
      g.fillRect(gr.x + gr.gw + 18, oy + cs * 0.3, 6, cs * 0.5 * Math.min(1, this.doneT * 2));
    }
    this.text(`${this.taps} giri`, w / 2, h - 34, 14, '#7a6f8f', 500);
    this.bar(this.connected() ? 1 : (this.wet.size / Math.max(1, this.cols)) * 0.5);
  }
}
