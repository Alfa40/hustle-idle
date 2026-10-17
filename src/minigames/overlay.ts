import type { Game } from '../game';
import { rungProgress } from '../config/careers';
import { toast } from '../sim/bus';
import { layout } from '../ui/layout';
import { BaseRun, starsFor, type RunGuide } from './jobs';

/**
 * Minigiochi che si giocano col dito su un "tavolo" disegnato (furgone a incastri, pianoforte sul
 * montacarichi, nastri dello smistamento): un riquadro nella zona libera dello schermo, sotto la barra del
 * lavoretto e accanto alla colonna dei pulsanti (non copre niente dell'interfaccia). Joystick e pulsante
 * azione spariscono finché dura. Sotto resta la città ferma.
 */
export abstract class OverlayRun extends BaseRun {
  protected root: HTMLDivElement;
  private offLayout: () => void;
  /** fase attuale per il tutorial */
  protected phaseIdx = 0;
  protected abstract phaseList: { name: string; icon: string; tip: string }[];

  constructor(game: Game, title: string, cls: string) {
    super(game, 1);
    this.title = title;
    this.root = document.createElement('div');
    this.root.className = `ovl ${cls}`;
    document.body.appendChild(this.root);
    document.body.classList.add('overlay-job');
    this.offLayout = layout.on(() => this.place(), false);
    requestAnimationFrame(() => this.place());
    // a tempo vero (non coi fotogrammi del gioco): la barra del lavoretto entra con un'animazione e il
    // fumetto del tutorial cambia altezza; il riquadro si risistema subito anche sui telefoni lenti
    this.placeTimer = window.setInterval(() => this.place(), 250);
  }

  private placeTimer = 0;

  /** Il riquadro occupa la zona libera dai riquadri in alto e dalla colonna dei pulsanti. */
  protected place() {
    const dock = layout.panelDock;
    const r = layout.freeRect([
      // i messaggi a comparsa (toast) durano pochi secondi: il riquadro non si sposta per loro
      { sel: '.jobbar.on', dock }, { sel: '.tut-bubble', dock },
      { sel: '.hud-right .hud-btns', dock: 'right' },
    ]);
    const s = this.root.style;
    s.left = `${r.x + 6}px`;
    s.top = `${r.y + 4}px`;
    // mai più grande dello spazio libero (anche se è poco): meglio un riquadro piccolo che sopra i pulsanti
    const w = Math.max(140, Math.round(r.w - 12));
    const h = Math.max(160, Math.round(r.h - 10));
    s.width = `${w}px`;
    s.height = `${h}px`;
    // misure per il CSS dei minigiochi (es. il piatto non più alto dello spazio che c'è)
    s.setProperty('--ovw', `${w}px`);
    s.setProperty('--ovh', `${h}px`);
    // si ridisegna solo se la misura cambia davvero
    if (w === this.lastW && h === this.lastH) return;
    this.lastW = w;
    this.lastH = h;
    this.resized(w, h);
  }

  private lastW = 0;
  private lastH = 0;

  /** Il riquadro ha cambiato misura: ridisegna. */
  protected abstract resized(w: number, h: number): void;
  /** Un fotogramma del minigioco (il tempo scorre in `update`). */
  protected abstract step(dt: number): void;

  update(dt: number) {
    if (!this.tick(dt)) return;
    this.step(dt);
    const ph = this.phaseList[this.phaseIdx];
    if (ph && !this.statusLocked) this.status = `${ph.icon} ${ph.name}${this.statusExtra()}`;
  }

  protected statusLocked = false;
  protected statusExtra() {
    return '';
  }

  guide(): RunGuide | null {
    const ph = this.phaseList[this.phaseIdx];
    if (!ph) return null;
    return { phase: this.phaseIdx, phases: this.phaseList.length, phaseName: ph.name, phaseIcon: ph.icon, left: 1, task: null, near: true, inZone: true, arrived: true, tip: ph.tip };
  }

  /** Fine con le stelle date dal minigioco (o dal tempo rimasto, se non le dà). */
  protected finish(stars?: number) {
    const st = stars ?? Math.min(this.starCap, starsFor(this.timeLeft, this.timeTotal));
    this.game.finishJob(Math.max(1, st));
  }

  dispose() {
    window.clearInterval(this.placeTimer);
    this.offLayout();
    this.root.remove();
    document.body.classList.remove('overlay-job');
    super.dispose();
  }
}

// ======================================================================================
// Traslochi: il furgone a incastri
// ======================================================================================

interface Piece {
  id: number;
  w: number;
  h: number;
  icon: string;
  name: string;
  heavy: boolean;
  fragile: boolean;
  /** cella in alto a sinistra nel cassone (null = ancora nel vassoio) */
  at: { x: number; y: number } | null;
  /** un modo sicuro di metterlo (il carico ha sempre una soluzione) */
  sol: { x: number; y: number; w: number; h: number };
  el?: HTMLDivElement;
}

/** Mobili per misura (larghezza × altezza in celle, vista di lato del cassone). */
const FURNITURE: Record<string, { icon: string; name: string }[]> = {
  '1x1': [{ icon: '📦', name: 'scatolone' }, { icon: '🪴', name: 'pianta' }, { icon: '🧳', name: 'valigia' }, { icon: '🎁', name: 'pacco' }],
  '2x1': [{ icon: '🛋️', name: 'divanetto' }, { icon: '🪑', name: 'sedie' }],
  '1x2': [{ icon: '🧊', name: 'frigo' }, { icon: '🚪', name: 'anta' }],
  '3x1': [{ icon: '🛏️', name: 'letto' }, { icon: '🪵', name: 'mensole' }],
  '1x3': [{ icon: '🪜', name: 'scala' }],
  '2x2': [{ icon: '🗄️', name: 'armadio' }, { icon: '📺', name: 'mobile tv' }],
  '3x2': [{ icon: '🛋️', name: 'divano' }],
  '2x3': [{ icon: '🚪', name: 'armadio alto' }],
};
const HEAVY = [{ icon: '🧺', name: 'lavatrice' }, { icon: '🧊', name: 'frigorifero' }, { icon: '🏋️', name: 'pesi' }];
const FRAGILE = [{ icon: '💡', name: 'lampada' }, { icon: '🖼️', name: 'quadro' }, { icon: '🏺', name: 'vaso' }, { icon: '📺', name: 'televisore' }];

/**
 * Taglia il cassone (W×H celle) in `n` rettangoli: il carico ha sempre una soluzione (quella del taglio).
 * I pesanti sono pezzi che toccano il fondo, i fragili pezzi che non hanno niente sopra.
 */
function cutLoad(W: number, H: number, n: number) {
  type R = { x: number; y: number; w: number; h: number };
  let rects: R[] = [{ x: 0, y: 0, w: W, h: H }];
  for (let guard = 0; guard < 200; guard++) {
    const big = rects.filter((r) => r.w > 3 || r.h > 3 || r.w * r.h > 6);
    if (rects.length >= n && !big.length) break;
    // si taglia un pezzo grande (o, se servono più pezzi, uno a caso tra quelli divisibili)
    const pool = big.length ? big : rects.filter((r) => r.w * r.h > 1);
    if (!pool.length) break;
    const r = pool[Math.floor(Math.random() * pool.length)];
    const vertical = r.w > 1 && (r.h === 1 || r.w > r.h || (r.w === r.h && Math.random() < 0.5));
    const cut = vertical ? 1 + Math.floor(Math.random() * (r.w - 1)) : 1 + Math.floor(Math.random() * (r.h - 1));
    const a: R = vertical ? { x: r.x, y: r.y, w: cut, h: r.h } : { x: r.x, y: r.y, w: r.w, h: cut };
    const b: R = vertical ? { x: r.x + cut, y: r.y, w: r.w - cut, h: r.h } : { x: r.x, y: r.y + cut, w: r.w, h: r.h - cut };
    rects = rects.filter((x) => x !== r).concat(a, b);
  }
  return rects;
}

export class VanPuzzleRun extends OverlayRun {
  protected phaseList = [
    { name: 'Carica il furgone', icon: '🚛', tip: '<b>Trascina</b> ogni pezzo nel cassone; <b>toccalo</b> per girarlo. I pesanti 🏋️ vanno <b>sul fondo</b>, sopra i fragili 🔔 <b>non va niente</b>' },
    { name: 'Chiudi il furgone', icon: '🔒', tip: 'Tutto dentro e niente in rosso: tocca <b>Chiudi il furgone</b>' },
  ];
  private W: number;
  private H: number;
  private pieces: Piece[] = [];
  private cell = 40;
  private grid!: HTMLDivElement;
  private tray!: HTMLDivElement;
  private closeBtn!: HTMLButtonElement;
  private drag: { p: Piece; dx: number; dy: number; sx: number; sy: number; moved: boolean; pid: number } | null = null;

  constructor(game: Game, lineLevel: number, title: string) {
    super(game, title, 'ovl-van');
    const t = rungProgress('consegna', lineLevel);
    this.W = t < 0.5 ? 5 : 6;
    this.H = 4;
    const n = Math.round(8 + 4 * t);
    const rects = cutLoad(this.W, this.H, n);
    const bottom = rects.filter((r) => r.y + r.h === this.H);
    const top = rects.filter((r) => r.y === 0 && r.y + r.h !== this.H);
    const heavy = new Set(bottom.sort(() => Math.random() - 0.5).slice(0, t < 0.4 ? 1 : 2));
    const fragile = new Set(top.filter((r) => r.w * r.h <= 2).sort(() => Math.random() - 0.5).slice(0, t < 0.4 ? 1 : 2));
    rects.forEach((r, i) => {
      const key = `${r.w}x${r.h}`;
      const pool = FURNITURE[key] ?? [{ icon: '📦', name: 'scatoloni' }];
      let f = pool[Math.floor(Math.random() * pool.length)];
      if (heavy.has(r)) f = HEAVY[i % HEAVY.length];
      if (fragile.has(r)) f = FRAGILE[i % FRAGILE.length];
      const p: Piece = { id: i, w: r.w, h: r.h, icon: f.icon, name: f.name, heavy: heavy.has(r), fragile: fragile.has(r), at: null, sol: { ...r } };
      // nel vassoio a volte arriva girato
      if (Math.random() < 0.4 && r.w !== r.h) [p.w, p.h] = [p.h, p.w];
      this.pieces.push(p);
    });
    this.pieces.sort(() => Math.random() - 0.5);
    this.setTime(55 + n * 11);
    this.build();
  }

  private build() {
    this.root.innerHTML = `<div class="van-box"><div class="van-grid"></div><div class="van-cab">🚛</div></div>
      <div class="van-legend"><span>🏋️ pesante: sul fondo</span><span>🔔 fragile: niente sopra</span><span>👆 tocca per girare</span></div>
      <div class="van-tray"></div><button class="btn good full van-close" disabled>🔒 Chiudi il furgone</button>`;
    this.grid = this.root.querySelector('.van-grid')!;
    this.tray = this.root.querySelector('.van-tray')!;
    this.closeBtn = this.root.querySelector('.van-close')!;
    this.closeBtn.addEventListener('click', () => this.close());
    for (const p of this.pieces) {
      const el = document.createElement('div');
      el.className = 'van-piece' + (p.heavy ? ' heavy' : '') + (p.fragile ? ' fragile' : '');
      el.innerHTML = `<span class="vp-ico">${p.icon}</span>${p.heavy ? '<i>🏋️</i>' : ''}${p.fragile ? '<i>🔔</i>' : ''}`;
      el.addEventListener('pointerdown', (e) => this.down(e, p));
      p.el = el;
    }
    this.root.addEventListener('pointermove', (e) => this.move(e));
    this.root.addEventListener('pointerup', (e) => this.up(e));
    this.root.addEventListener('pointercancel', (e) => this.up(e));
  }

  protected resized(w: number, h: number) {
    // il cassone in alto (grande quanto si può), il vassoio dei pezzi sotto
    const trayH = Math.max(120, h * 0.3);
    this.cell = Math.floor(Math.min((w - 30) / this.W, (h - trayH - 110) / this.H, 74));
    if (!this.grid) return;
    this.grid.style.width = `${this.cell * this.W}px`;
    this.grid.style.height = `${this.cell * this.H}px`;
    this.grid.style.backgroundSize = `${this.cell}px ${this.cell}px`;
    this.layoutPieces();
    // sugli schermi bassi: si rimpicciolisce il cassone finché tutto (vassoio e pulsante) sta nel riquadro
    for (let k = 0; k < 20 && this.root.scrollHeight > this.root.clientHeight + 1 && this.cell > 18; k++) {
      this.cell -= 2;
      this.grid.style.width = `${this.cell * this.W}px`;
      this.grid.style.height = `${this.cell * this.H}px`;
      this.grid.style.backgroundSize = `${this.cell}px ${this.cell}px`;
      this.layoutPieces();
    }
  }

  /** Mette ogni pezzo al suo posto: nel cassone o in fila nel vassoio (che va a capo). */
  private layoutPieces() {
    const c = this.cell;
    const trayW = this.tray.clientWidth || 300;
    const k = 0.8; // nel vassoio i pezzi sono un po' più piccoli
    let x = 6;
    let y = 6;
    let rowH = 0;
    for (const p of this.pieces) {
      const el = p.el!;
      el.style.fontSize = `${Math.round(c * 0.5)}px`;
      if (p === this.drag?.p) continue;
      if (p.at) {
        if (el.parentElement !== this.grid) this.grid.appendChild(el);
        el.style.left = `${p.at.x * c}px`;
        el.style.top = `${p.at.y * c}px`;
        el.style.width = `${p.w * c}px`;
        el.style.height = `${p.h * c}px`;
        el.style.transform = '';
      } else {
        if (el.parentElement !== this.tray) this.tray.appendChild(el);
        const pw = p.w * c * k;
        const ph = p.h * c * k;
        if (x + pw > trayW - 6) {
          x = 6;
          y += rowH + 8;
          rowH = 0;
        }
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.width = `${pw}px`;
        el.style.height = `${ph}px`;
        el.style.fontSize = `${Math.round(c * 0.5 * k)}px`;
        x += pw + 8;
        rowH = Math.max(rowH, ph);
      }
    }
    // i pezzi nel vassoio stanno in un riquadro che scorre (mai più alto dello spazio: il pulsante resta visibile)
    this.tray.style.setProperty('--tray-h', `${y + rowH + 10}px`);
    this.check();
  }

  private occ(except?: Piece) {
    const o: (Piece | null)[][] = Array.from({ length: this.H }, () => Array(this.W).fill(null));
    for (const p of this.pieces) {
      if (!p.at || p === except) continue;
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) o[p.at.y + y][p.at.x + x] = p;
    }
    return o;
  }

  private fits(p: Piece, x: number, y: number) {
    if (x < 0 || y < 0 || x + p.w > this.W || y + p.h > this.H) return false;
    const o = this.occ(p);
    for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) if (o[y + j][x + i]) return false;
    return true;
  }

  /** Pezzi messi male: pesante non sul fondo, qualcosa sopra un fragile. */
  private problems() {
    const bad = new Set<Piece>();
    const o = this.occ();
    for (const p of this.pieces) {
      if (!p.at) continue;
      if (p.heavy && p.at.y + p.h !== this.H) bad.add(p);
      if (p.fragile && p.at.y > 0) {
        for (let i = 0; i < p.w; i++) {
          const above = o[p.at.y - 1][p.at.x + i];
          if (above) {
            bad.add(p);
            bad.add(above);
          }
        }
      }
    }
    return bad;
  }

  private check() {
    const bad = this.problems();
    for (const p of this.pieces) p.el!.classList.toggle('bad', bad.has(p));
    const all = this.pieces.every((p) => p.at);
    this.closeBtn.disabled = !all || bad.size > 0;
    this.phaseIdx = all && !bad.size ? 1 : 0;
  }

  private down(e: PointerEvent, p: Piece) {
    if (this.drag) return;
    e.preventDefault();
    const el = p.el!;
    const r = el.getBoundingClientRect();
    this.drag = { p, dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false, pid: e.pointerId };
    this.root.setPointerCapture?.(e.pointerId);
  }

  private move(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) return;
    const el = d.p.el!;
    if (!d.moved) {
      d.moved = true;
      // mentre lo trascini ha la grandezza vera (come nel cassone) e il dito lo tiene dal centro
      document.body.appendChild(el);
      el.classList.add('dragging');
      el.style.width = `${d.p.w * this.cell}px`;
      el.style.height = `${d.p.h * this.cell}px`;
      el.style.fontSize = `${Math.round(this.cell * 0.5)}px`;
      d.dx = (d.p.w * this.cell) / 2;
      d.dy = (d.p.h * this.cell) / 2;
    }
    el.style.left = `${e.clientX - d.dx}px`;
    el.style.top = `${e.clientY - d.dy}px`;
  }

  private up(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    this.drag = null;
    const p = d.p;
    const el = p.el!;
    el.classList.remove('dragging');
    if (!d.moved) {
      // tocco: si gira (se nel cassone ci sta ancora, altrimenti torna nel vassoio)
      [p.w, p.h] = [p.h, p.w];
      if (p.at && !this.fits(p, p.at.x, p.at.y)) p.at = null;
      this.layoutPieces();
      return;
    }
    const g = this.grid.getBoundingClientRect();
    const x = Math.round((e.clientX - d.dx - g.left) / this.cell);
    const y = Math.round((e.clientY - d.dy - g.top) / this.cell);
    const inside = e.clientX > g.left - 10 && e.clientX < g.right + 10 && e.clientY > g.top - 10 && e.clientY < g.bottom + 10;
    if (inside && this.fits(p, x, y)) {
      p.at = { x, y };
      const bad = this.problems();
      if (bad.has(p)) toast(p.heavy ? '🏋️ I pesanti vanno sul fondo del cassone' : '🔔 Sopra i fragili non va niente', 'bad');
    } else {
      if (inside) toast('Lì non ci sta: prova a girarlo (toccalo)', 'info');
      p.at = null;
    }
    this.layoutPieces();
  }

  private close() {
    if (this.closeBtn.disabled) return;
    this.finish();
  }

  protected step() {}

  protected statusExtra() {
    return ` · ${this.pieces.filter((p) => p.at).length}/${this.pieces.length}`;
  }
}

// ======================================================================================
// Trasporti delicati: il pianoforte sul montacarichi, oppure i quadri nelle casse
// ======================================================================================

export class PianoLiftRun extends OverlayRun {
  protected phaseList = [
    { name: 'Tieni dritto il pianoforte', icon: '🎹', tip: 'Il pianoforte sale col montacarichi e il vento lo fa dondolare: <b>tieni il dito sullo schermo</b> e spostalo <b>dalla parte opposta</b> a dove pende' },
    { name: 'Spingilo dentro dalla finestra', icon: '🏠', tip: 'Sei alla finestra: <b>tocca</b> per spingerlo dentro' },
  ];
  private cv!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private w = 300;
  private h = 400;
  private angle = 0;
  private vel = 0;
  private rise = 0;
  private riseTime: number;
  private wind: number;
  private finger: number | null = null;
  private hits = 0;
  private t = 0;
  private done2 = false;

  constructor(game: Game, lineLevel: number, title: string) {
    super(game, title, 'ovl-piano');
    const k = rungProgress('consegna', lineLevel);
    this.riseTime = 32 + 18 * k;
    this.wind = 0.8 + 1.1 * k;
    this.setTime(this.riseTime * 1.9 + 15);
    this.root.innerHTML = '<canvas></canvas>';
    this.cv = this.root.querySelector('canvas')!;
    this.ctx = this.cv.getContext('2d')!;
    const pos = (e: PointerEvent) => {
      const r = this.cv.getBoundingClientRect();
      return (e.clientX - r.left) / r.width - 0.5;
    };
    this.cv.addEventListener('pointerdown', (e) => {
      this.finger = pos(e);
      if (this.phaseIdx === 1 && !this.done2) {
        this.done2 = true;
        this.finish();
      }
    });
    this.cv.addEventListener('pointermove', (e) => {
      if (this.finger !== null) this.finger = pos(e);
    });
    const up = () => (this.finger = null);
    this.cv.addEventListener('pointerup', up);
    this.cv.addEventListener('pointercancel', up);
    this.cv.addEventListener('pointerleave', up);
  }

  protected resized(w: number, h: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.cv.width = w * dpr;
    this.cv.height = h * dpr;
    this.cv.style.width = `${w}px`;
    this.cv.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  protected step(dt: number) {
    this.t += dt;
    if (this.phaseIdx === 0 && !this.frozen) {
      // vento a raffiche + il pianoforte tende a cadere dalla parte dove pende
      const gust = Math.sin(this.t * 0.9) * 0.6 + Math.sin(this.t * 2.3 + 1) * 0.4 + Math.sin(this.t * 0.37 + 2) * 0.5;
      const ctrl = this.finger === null ? 0 : -this.finger * 4.2;
      this.vel += (gust * this.wind + this.angle * 1.6 + ctrl) * dt;
      this.vel *= 1 - 1.2 * dt;
      this.angle += this.vel * dt;
      if (Math.abs(this.angle) > 0.45) {
        // sbatte contro il muro: si raddrizza, ma il pianoforte si rovina
        this.hits++;
        this.angle = Math.sign(this.angle) * 0.2;
        this.vel = 0;
        this.starCap = this.hits >= 3 ? 1 : this.hits >= 2 ? 2 : 3;
        this.penalty(4, `💥 Il pianoforte ha sbattuto (${this.hits})${this.hits >= 2 ? `: massimo ${this.starCap} stelle` : ''}`);
      }
      this.rise = Math.min(1, this.rise + dt / this.riseTime);
      if (this.rise >= 1) {
        this.phaseIdx = 1;
        this.angle *= 0.3;
      }
    }
    this.draw();
  }

  private draw() {
    const g = this.ctx;
    const { w, h } = this;
    g.clearRect(0, 0, w, h);
    // cielo e facciata del palazzo
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#8fd0ff');
    sky.addColorStop(1, '#d8f0ff');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    const bx = w * 0.12;
    const bw = w * 0.76;
    g.fillStyle = '#e9b38a';
    g.fillRect(bx, h * 0.06, bw, h);
    g.fillStyle = '#c98f63';
    for (let y = h * 0.1; y < h; y += h * 0.16) for (let x = bx + bw * 0.08; x < bx + bw - 20; x += bw * 0.3) g.fillRect(x, y, bw * 0.16, h * 0.09);
    // la finestra di arrivo, aperta, in alto
    const wy = h * 0.1;
    g.fillStyle = '#3a2f55';
    g.fillRect(w / 2 - bw * 0.2, wy, bw * 0.4, h * 0.13);
    g.fillStyle = '#ffd21a';
    g.font = `${Math.round(h * 0.035)}px Fredoka, sans-serif`;
    g.textAlign = 'center';
    g.fillText('🏠 qui', w / 2, wy + h * 0.08, bw * 0.38);
    // le funi e la piattaforma che sale
    const py = h * 0.88 - (h * 0.88 - (wy + h * 0.17)) * this.rise;
    g.strokeStyle = '#555';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(w / 2 - 40, 0);
    g.lineTo(w / 2 - 40, py);
    g.moveTo(w / 2 + 40, 0);
    g.lineTo(w / 2 + 40, py);
    g.stroke();
    g.save();
    g.translate(w / 2, py);
    g.rotate(this.angle);
    g.fillStyle = '#6b7080';
    g.fillRect(-60, 0, 120, 10);
    g.font = `${Math.round(Math.min(w, h) * 0.2)}px sans-serif`;
    g.textBaseline = 'bottom';
    g.fillText('🎹', 0, 4);
    g.restore();
    // la livella: quanto pende (verde dritto, rosso quasi a sbattere)
    const lv = Math.min(1, Math.abs(this.angle) / 0.45);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(w * 0.2, h - 30, w * 0.6, 14);
    g.fillStyle = lv < 0.5 ? '#35c46a' : lv < 0.8 ? '#ffc21a' : '#e5484d';
    g.fillRect(w / 2 + (this.angle / 0.45) * w * 0.3 - 7, h - 34, 14, 22);
    if (this.finger === null && this.phaseIdx === 0) {
      g.fillStyle = 'rgba(58,47,85,.85)';
      g.font = `600 ${Math.round(h * 0.032)}px Fredoka, sans-serif`;
      g.font = `600 ${Math.round(Math.min(h * 0.032, w / 18))}px Fredoka, sans-serif`;
      g.fillText('👆 Tieni il dito e spostalo', w / 2, h - 58, w - 12);
      g.fillText('dalla parte opposta', w / 2, h - 40, w - 12);
    }
    if (this.phaseIdx === 1) {
      g.fillStyle = 'rgba(53,196,106,.9)';
      g.fillRect(w * 0.15, h * 0.45, w * 0.7, h * 0.1);
      g.fillStyle = '#fff';
      g.font = `700 ${Math.round(h * 0.04)}px Fredoka, sans-serif`;
      g.fillText('👆 Tocca: spingilo dentro', w / 2, h * 0.52, w * 0.66);
    }
  }

  protected statusExtra() {
    return this.phaseIdx === 0 ? ` · ${Math.round(this.rise * 100)}%${this.hits ? ` · 💥 ${this.hits}` : ''}` : '';
  }
}

/** Quadri: avvolgi ognuno nel pluriball (tieni premuto) e trascinalo nella cassa della sua misura, piano. */
export class PaintingsRun extends OverlayRun {
  protected phaseList = [
    { name: 'Imballa i quadri', icon: '🖼️', tip: '<b>Tieni premuto</b> su un quadro per avvolgerlo nel pluriball, poi <b>trascinalo piano</b> nella cassa della sua misura. Se lo trascini veloce si graffia' },
  ];
  private items: { el: HTMLDivElement; size: number; wrap: number; done: boolean }[] = [];
  private crates: HTMLDivElement[] = [];
  private scratches = 0;
  private hold: { i: number; t: number } | null = null;
  private drag: { i: number; dx: number; dy: number; lx: number; ly: number; lt: number; pid: number } | null = null;

  constructor(game: Game, lineLevel: number, title: string) {
    super(game, title, 'ovl-art');
    const k = rungProgress('consegna', lineLevel);
    const n = k < 0.5 ? 3 : 4;
    const sizes = [0.55, 0.7, 0.85, 1].slice(0, n).sort(() => Math.random() - 0.5);
    this.setTime(30 + n * 22);
    this.root.innerHTML = `<div class="art-wall"></div><div class="art-crates"></div>`;
    const wall = this.root.querySelector('.art-wall')!;
    const cr = this.root.querySelector('.art-crates')!;
    const pics = ['🌅', '🌻', '🏔️', '🌊'];
    sizes.forEach((s, i) => {
      const el = document.createElement('div');
      el.className = 'art-pic';
      el.style.setProperty('--s', String(s));
      el.innerHTML = `<span>${pics[i]}</span><b class="art-wrap"></b>`;
      el.addEventListener('pointerdown', (e) => this.down(e, i));
      wall.appendChild(el);
      this.items.push({ el, size: s, wrap: 0, done: false });
    });
    [...sizes].sort((a, b) => a - b).forEach((s) => {
      const c = document.createElement('div');
      c.className = 'art-crate';
      c.style.setProperty('--s', String(s));
      c.dataset.size = String(s);
      cr.appendChild(c);
      this.crates.push(c);
    });
    this.root.addEventListener('pointermove', (e) => this.move(e));
    this.root.addEventListener('pointerup', (e) => this.up(e));
    this.root.addEventListener('pointercancel', (e) => this.up(e));
  }

  protected resized() {}

  private down(e: PointerEvent, i: number) {
    const it = this.items[i];
    if (it.done || this.drag) return;
    e.preventDefault();
    if (it.wrap < 1) {
      this.hold = { i, t: 0 };
      return;
    }
    const r = it.el.getBoundingClientRect();
    this.drag = { i, dx: e.clientX - r.left, dy: e.clientY - r.top, lx: e.clientX, ly: e.clientY, lt: performance.now(), pid: e.pointerId };
    it.el.classList.add('dragging');
    document.body.appendChild(it.el);
    it.el.style.left = `${r.left}px`;
    it.el.style.top = `${r.top}px`;
  }

  private move(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    const it = this.items[d.i];
    const now = performance.now();
    const v = Math.hypot(e.clientX - d.lx, e.clientY - d.ly) / Math.max(1, now - d.lt);
    // troppo veloce: si graffia (al massimo una volta per quadro e trascinamento)
    if (v > 2.2 && !it.el.classList.contains('scratched-now')) {
      it.el.classList.add('scratched-now');
      this.scratches++;
      this.starCap = this.scratches >= 3 ? 1 : this.scratches >= 2 ? 2 : 3;
      this.penalty(3, `💥 Troppo veloce: il quadro si è graffiato (${this.scratches})`);
    }
    d.lx = e.clientX;
    d.ly = e.clientY;
    d.lt = now;
    it.el.style.left = `${e.clientX - d.dx}px`;
    it.el.style.top = `${e.clientY - d.dy}px`;
  }

  private up(e: PointerEvent) {
    this.hold = null;
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    this.drag = null;
    const it = this.items[d.i];
    it.el.classList.remove('dragging', 'scratched-now');
    const hit = this.crates.find((c) => {
      const r = c.getBoundingClientRect();
      return e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom && !c.classList.contains('full');
    });
    if (hit && +hit.dataset.size! === it.size) {
      it.done = true;
      hit.classList.add('full');
      hit.appendChild(it.el);
      it.el.style.left = it.el.style.top = '';
      it.el.classList.add('packed');
      if (this.items.every((x) => x.done)) this.finish();
      return;
    }
    if (hit) this.penalty(4, '❌ Cassa sbagliata: guarda la misura');
    this.root.querySelector('.art-wall')!.appendChild(it.el);
    it.el.style.left = it.el.style.top = '';
  }

  protected step(dt: number) {
    const h = this.hold;
    if (h) {
      const it = this.items[h.i];
      it.wrap = Math.min(1, it.wrap + dt / 1.2);
      (it.el.querySelector('.art-wrap') as HTMLElement).style.opacity = String(it.wrap * 0.85);
      if (it.wrap >= 1) {
        it.el.classList.add('wrapped');
        this.hold = null;
      }
    }
  }

  protected statusExtra() {
    return ` · ${this.items.filter((x) => x.done).length}/${this.items.length}${this.scratches ? ` · 💥 ${this.scratches}` : ''}`;
  }
}

// ======================================================================================
// Centro di smistamento: i nastri e i deviatori
// ======================================================================================

interface Node {
  x: number;
  y: number;
  /** deviatore: figli sinistro e destro; uscita: indice del colore */
  kids?: [Node, Node];
  bin?: number;
  dir: 0 | 1;
}

const BIN_COLORS = ['#e5484d', '#2d6cdb', '#2fb36b', '#ffc21a', '#8e5bd6'];

export class SortingRun extends OverlayRun {
  protected phaseList = [
    { name: 'Smista i pacchi', icon: '🔀', tip: '<b>Tocca i deviatori</b> (le frecce) per mandare ogni pacco al nastro del <b>suo colore</b>. Il turno dura 2 minuti e i nastri accelerano' },
  ];
  private cv!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private w = 300;
  private h = 400;
  private root2!: Node;
  private bins: Node[] = [];
  private switches: Node[] = [];
  private nBins: number;
  private boxes: { color: number; from: Node; to: Node; k: number }[] = [];
  private spawnT = 0;
  private t = 0;
  private ok = 0;
  private wrong = 0;
  private flash: { x: number; y: number; ok: boolean; t: number }[] = [];
  private ended = false;

  constructor(game: Game, lineLevel: number, title: string) {
    super(game, title, 'ovl-sort');
    const k = rungProgress('magazzino', lineLevel);
    this.nBins = 3 + Math.round(2 * k);
    this.setTime(120);
    this.root.innerHTML = '<canvas></canvas>';
    this.cv = this.root.querySelector('canvas')!;
    this.ctx = this.cv.getContext('2d')!;
    this.cv.addEventListener('pointerdown', (e) => {
      const r = this.cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      let best: Node | null = null;
      let bd = 60;
      for (const s of this.switches) {
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      if (best) best.dir = best.dir ? 0 : 1;
    });
  }

  /** Albero dei deviatori: dall'ingresso in alto alle uscite colorate in basso. */
  private buildTree() {
    const { w, h } = this;
    this.bins = [];
    this.switches = [];
    const make = (lo: number, hi: number, depth: number, x0: number, x1: number): Node => {
      if (hi - lo === 1) {
        const n: Node = { x: (x0 + x1) / 2, y: h - 40, bin: lo, dir: 0 };
        this.bins.push(n);
        return n;
      }
      const mid = Math.ceil((lo + hi) / 2);
      const xm = x0 + ((x1 - x0) * (mid - lo)) / (hi - lo);
      const node: Node = { x: (x0 + x1) / 2, y: 70 + depth * (h - 150) / 3, dir: (Math.random() < 0.5 ? 0 : 1) as 0 | 1 };
      node.kids = [make(lo, mid, depth + 1, x0, xm), make(mid, hi, depth + 1, xm, x1)];
      this.switches.push(node);
      return node;
    };
    this.root2 = make(0, this.nBins, 0, 10, w - 10);
  }

  protected resized(w: number, h: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.cv.width = w * dpr;
    this.cv.height = h * dpr;
    this.cv.style.width = `${w}px`;
    this.cv.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // le posizioni dipendono dalla misura: l'albero si rifà (i pacchi in viaggio ripartono dall'alto)
    const dirs = this.switches.map((s) => s.dir);
    this.buildTree();
    this.switches.forEach((s, i) => (s.dir = (dirs[i] ?? s.dir) as 0 | 1));
    this.boxes = [];
  }

  protected step(dt: number) {
    if (this.ended || !this.root2) {
      this.draw();
      return;
    }
    if (!this.frozen) this.t += dt;
    const speedUp = 1 + this.t / 60;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && !this.frozen) {
      this.spawnT = Math.max(0.9, 2.6 / speedUp);
      const top: Node = { x: this.root2.x, y: 14, dir: 0 };
      this.boxes.push({ color: Math.floor(Math.random() * this.nBins), from: top, to: this.root2, k: 0 });
    }
    const sp = 95 * speedUp;
    for (const b of [...this.boxes]) {
      if (this.frozen) break;
      const len = Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) || 1;
      b.k += (sp * dt) / len;
      if (b.k < 1) continue;
      if (b.to.kids) {
        b.from = b.to;
        b.to = b.to.kids[b.to.dir];
        b.k = 0;
      } else {
        const good = b.to.bin === b.color;
        if (good) this.ok++;
        else this.wrong++;
        this.flash.push({ x: b.to.x, y: b.to.y, ok: good, t: 0.6 });
        this.boxes = this.boxes.filter((x) => x !== b);
      }
    }
    for (const f of this.flash) f.t -= dt;
    this.flash = this.flash.filter((f) => f.t > 0);
    // il turno finisce allo scadere del tempo: le stelle dicono quanti pacchi sono andati giusti
    if (this.timeLeft <= 1.2 && !this.ended) {
      this.ended = true;
      const tot = this.ok + this.wrong;
      const acc = tot ? this.ok / tot : 0;
      this.finish(tot < 10 ? 1 : acc >= 0.85 ? 3 : acc >= 0.65 ? 2 : 1);
      return;
    }
    this.draw();
  }

  /** Il tempo che scade non è un fallimento: è la fine del turno. */
  protected tick(dt: number) {
    if (this.frozen) return true;
    this.timeLeft = Math.max(1, this.timeLeft - dt);
    return true;
  }

  private draw() {
    const g = this.ctx;
    const { w, h } = this;
    g.fillStyle = '#c9ccd4';
    g.fillRect(0, 0, w, h);
    if (!this.root2) return;
    // nastri
    const belt = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      g.strokeStyle = '#3a3f4b';
      g.lineWidth = 22;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.strokeStyle = '#596070';
      g.lineWidth = 16;
      g.stroke();
    };
    belt({ x: this.root2.x, y: 10 }, this.root2);
    const walk = (n: Node) => {
      if (!n.kids) return;
      for (const k of n.kids) {
        belt(n, k);
        walk(k);
      }
    };
    walk(this.root2);
    // uscite colorate
    for (const b of this.bins) {
      g.fillStyle = BIN_COLORS[b.bin!];
      g.beginPath();
      g.roundRect(b.x - 28, b.y - 10, 56, 40, 8);
      g.fill();
    }
    // deviatori: un disco con la freccia verso dove mandano
    for (const s of this.switches) {
      const to = s.kids![s.dir];
      const a = Math.atan2(to.y - s.y, to.x - s.x);
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(s.x, s.y, 22, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#ff8a3d';
      g.lineWidth = 4;
      g.stroke();
      g.save();
      g.translate(s.x, s.y);
      g.rotate(a);
      g.fillStyle = '#ff8a3d';
      g.beginPath();
      g.moveTo(15, 0);
      g.lineTo(-6, -10);
      g.lineTo(-6, 10);
      g.closePath();
      g.fill();
      g.restore();
    }
    // pacchi
    for (const b of this.boxes) {
      const x = b.from.x + (b.to.x - b.from.x) * b.k;
      const y = b.from.y + (b.to.y - b.from.y) * b.k;
      g.fillStyle = '#c8935a';
      g.fillRect(x - 12, y - 12, 24, 24);
      g.fillStyle = BIN_COLORS[b.color];
      g.fillRect(x - 12, y - 4, 24, 8);
    }
    for (const f of this.flash) {
      g.font = '28px sans-serif';
      g.textAlign = 'center';
      g.fillText(f.ok ? '✅' : '❌', f.x, f.y - 20 - (0.6 - f.t) * 30);
    }
  }

  protected statusExtra() {
    return ` · ✅ ${this.ok} · ❌ ${this.wrong}`;
  }
}
