import * as THREE from 'three';

/**
 * LayoutManager: UNICO punto che sa com'è fatto lo schermo (vedi LAYOUT.md).
 *
 * - orientamento (verticale/orizzontale), misure reali, tipo di schermo (piccolo/telefono/tablet)
 * - safe area (notch, isola dinamica, barra Home): lette dal CSS env() e aggiornate quando si ruota
 * - scala dell'interfaccia in base al lato corto (variabile CSS --u, pulsanti mai sotto 44 px)
 * - avvisa tutte le schermate a ogni cambio, con debounce (un aggiornamento subito, uno a rotazione finita)
 * - "zona libera": la parte di schermo non coperta dall'interfaccia, dove le camere centrano la scena
 *
 * Le schermate NON ascoltano più `resize` per conto loro: usano `layout.on(...)`.
 */

export type Orientation = 'portrait' | 'landscape';
export type DeviceClass = 'small' | 'phone' | 'tablet';

export interface Safe {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutInfo {
  w: number;
  h: number;
  orientation: Orientation;
  short: number;
  long: number;
  device: DeviceClass;
  /** scala dell'interfaccia (1 = telefono di riferimento 390 px di lato corto) */
  scale: number;
  safe: Safe;
}

export type Dock = 'top' | 'bottom' | 'left' | 'right';
/** Elemento d'interfaccia che copre la scena, con il lato a cui è attaccato. */
export interface Occluder {
  sel: string;
  dock?: Dock;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Lato corto di riferimento (iPhone 12–15). */
const REF_SHORT = 390;
const DEBOUNCE_MS = 140;

type Listener = (info: LayoutInfo, prev: LayoutInfo | null) => void;

class LayoutManager {
  info!: LayoutInfo;
  private listeners = new Set<Listener>();
  private probe: HTMLDivElement | null = null;
  private timer = 0;
  /** safe area finte per la modalità prova (?safe=top,right,bottom,left) */
  private fakeSafe: Safe | null = null;

  constructor() {
    this.measure();
    const kick = () => this.schedule();
    window.addEventListener('resize', kick);
    window.addEventListener('orientationchange', kick);
    window.visualViewport?.addEventListener('resize', kick);
  }

  /** Un aggiornamento subito (niente scena deformata) e uno a rotazione finita (misure stabili). */
  private schedule() {
    if (!this.timer) this.update();
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      this.update();
    }, DEBOUNCE_MS);
  }

  /** Modalità prova (debug.html): ?safe=top,right,bottom,left simula notch e barra Home. */
  private readFakeSafe() {
    const q = new URLSearchParams(location.search).get('safe');
    if (!q) return;
    const [top, right, bottom, left] = q.split(',').map((n) => +n || 0);
    this.fakeSafe = { top, right, bottom, left };
    const r = document.documentElement.style;
    // in prova le variabili usate da tutto il CSS seguono la safe area finta (come env() su un telefono vero)
    const land = window.innerWidth > window.innerHeight;
    r.setProperty('--sat', `${Math.max(top, land ? 10 : 34)}px`);
    r.setProperty('--sar', `${Math.max(right, land ? 36 : 10)}px`);
    r.setProperty('--sab', `${Math.max(bottom, land ? 10 : 12)}px`);
    r.setProperty('--sal', `${Math.max(left, land ? 36 : 10)}px`);
  }

  private readSafe(): Safe {
    this.readFakeSafe();
    if (this.fakeSafe) return this.fakeSafe;
    if (!this.probe) {
      this.probe = document.createElement('div');
      this.probe.style.cssText =
        'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      document.body.appendChild(this.probe);
    }
    const s = getComputedStyle(this.probe);
    return { top: parseFloat(s.paddingTop) || 0, right: parseFloat(s.paddingRight) || 0, bottom: parseFloat(s.paddingBottom) || 0, left: parseFloat(s.paddingLeft) || 0 };
  }

  private measure(): LayoutInfo {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const short = Math.min(w, h);
    const long = Math.max(w, h);
    const device: DeviceClass = short >= 600 ? 'tablet' : short < 375 ? 'small' : 'phone';
    const scale = THREE.MathUtils.clamp(short / REF_SHORT, 0.86, 1.35);
    const info: LayoutInfo = { w, h, orientation: w > h ? 'landscape' : 'portrait', short, long, device, scale, safe: this.readSafe() };
    this.info = info;
    // classi e variabili per il CSS
    const b = document.body.classList;
    b.toggle('is-portrait', info.orientation === 'portrait');
    b.toggle('is-landscape', info.orientation === 'landscape');
    for (const d of ['small', 'phone', 'tablet']) b.toggle(`dev-${d}`, d === device);
    b.toggle('is-short', h < 480);
    document.documentElement.style.setProperty('--u', scale.toFixed(3));
    return info;
  }

  update() {
    const prev = this.info;
    const next = this.measure();
    const same = prev && prev.w === next.w && prev.h === next.h &&
      prev.safe.top === next.safe.top && prev.safe.left === next.safe.left && prev.safe.right === next.safe.right && prev.safe.bottom === next.safe.bottom;
    if (same) return;
    for (const fn of this.listeners) fn(next, prev ?? null);
  }

  /** Ascolta i cambi di layout (subito chiamata una volta, se `now`). Restituisce la funzione per smettere. */
  on(fn: Listener, now = true) {
    this.listeners.add(fn);
    if (now) fn(this.info, null);
    return () => this.listeners.delete(fn);
  }

  get portrait() {
    return this.info.orientation === 'portrait';
  }

  /**
   * Zona libera per la scena: lo schermo meno la safe area e meno gli elementi d'interfaccia indicati.
   * Ogni elemento toglie un lato: quello dichiarato (`dock`), oppure quello che fa perdere meno spazio.
   */
  freeRect(items: (string | Occluder)[]): Rect {
    const { w, h, safe } = this.info;
    let x0 = safe.left;
    let y0 = safe.top;
    let x1 = w - safe.right;
    let y1 = h - safe.bottom;
    for (const it of items) {
      const { sel, dock } = typeof it === 'string' ? { sel: it, dock: undefined } : it;
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        // spazio perso per ogni lato che si potrebbe tagliare
        const cuts = {
          top: (x1 - x0) * Math.max(0, r.bottom + 4 - y0),
          bottom: (x1 - x0) * Math.max(0, y1 - (r.top - 4)),
          left: (y1 - y0) * Math.max(0, r.right + 4 - x0),
          right: (y1 - y0) * Math.max(0, x1 - (r.left - 4)),
        };
        const side = dock ?? (Object.entries(cuts).sort((a, b) => a[1] - b[1])[0][0] as Dock);
        if (side === 'top') y0 = Math.max(y0, r.bottom + 4);
        else if (side === 'bottom') y1 = Math.min(y1, r.top - 4);
        else if (side === 'left') x0 = Math.max(x0, r.right + 4);
        else x1 = Math.min(x1, r.left - 4);
      }
    }
    // mai meno di metà schermo: meglio una scena un po' coperta che minuscola
    if (x1 - x0 < w * 0.45) {
      const c = (x0 + x1) / 2;
      x0 = Math.max(0, c - w * 0.225);
      x1 = Math.min(w, c + w * 0.225);
    }
    if (y1 - y0 < h * 0.45) {
      const c = (y0 + y1) / 2;
      y0 = Math.max(0, c - h * 0.225);
      y1 = Math.min(h, c + h * 0.225);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
}

export const layout = new LayoutManager();

/**
 * Inquadra una stanza (cucina, casa del cliente) nella zona libera dello schermo, senza deformarla:
 * la camera si sposta (setViewOffset) e si allontana quanto serve perché la stanza ci stia.
 * Restituisce la distanza da usare.
 */
export function fitRoom(camera: THREE.PerspectiveCamera, free: Rect, halfWidth: number, minDist: number) {
  const { w, h } = layout.info;
  camera.aspect = w / h;
  camera.fov = 50;
  // offset: il centro della scena va al centro della zona libera
  const dx = free.x + free.w / 2 - w / 2;
  const dy = free.y + free.h / 2 - h / 2;
  camera.setViewOffset(w, h, -dx, -dy, w, h);
  camera.updateProjectionMatrix();
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  // la stanza deve stare nella larghezza libera; la distanza minima scala con l'altezza libera
  const byWidth = halfWidth / Math.tan(hfov / 2) / (free.w / w);
  const byHeight = minDist / (free.h / h);
  return Math.max(byWidth, byHeight);
}
