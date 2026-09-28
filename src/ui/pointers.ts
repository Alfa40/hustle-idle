import * as THREE from 'three';
import type { Game, MapMarker } from '../game';

const MAX_POINTERS = 3;

/**
 * Freccette ai bordi dello schermo verso i lavoretti più vicini
 * (o verso l'obiettivo del lavoro in corso) quando sono fuori vista.
 */
export class EdgePointers {
  private els: HTMLDivElement[] = [];
  private v = new THREE.Vector3();
  private insets: Record<string, number> = {};
  private lastW = 0;
  private lastH = 0;

  /** margini letti dal CSS (cambiano con l'orientamento) */
  private readInsets(w: number, h: number) {
    this.lastW = w;
    this.lastH = h;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:var(--ptr-t);bottom:var(--ptr-b);left:var(--ptr-l);right:var(--ptr-r);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const r = probe.getBoundingClientRect();
    this.insets = { '--ptr-t': r.top, '--ptr-l': r.left, '--ptr-b': h - r.bottom, '--ptr-r': w - r.right };
    probe.remove();
  }

  constructor(private game: Game, parent: HTMLElement) {
    for (let i = 0; i < MAX_POINTERS; i++) {
      const el = document.createElement('div');
      el.className = 'edge-ptr';
      el.innerHTML = `<div class="edge-arrow"></div><div class="edge-bubble"><span class="edge-ico"></span><span class="edge-dist"></span></div>`;
      parent.appendChild(el);
      this.els.push(el);
    }
  }

  update() {
    const g = this.game;
    let list: MapMarker[] = [];
    if (!g.interior && !g.paused) {
      const all = g.mapMarkers();
      const target = all.filter((m) => m.kind === 'target');
      list = target.length ? target : all.filter((m) => m.kind === 'job').sort((a, b) => a.dist - b.dist).slice(0, MAX_POINTERS);
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w !== this.lastW || h !== this.lastH) this.readInsets(w, h);
    const inset = (name: string) => this.insets[name] ?? 0;
    // area libera: sotto l'HUD in alto, sopra il pulsante azione, lontano dalla colonna di pulsanti
    const left = inset('--ptr-l') + 30;
    const right = w - inset('--ptr-r') - 30;
    const top = inset('--ptr-t') + 30;
    const bottom = h - inset('--ptr-b') - 30;
    const cx = w / 2;
    const cy = h / 2;

    const placed: { x: number; y: number }[] = [];
    this.els.forEach((el, i) => {
      const m = list[i];
      if (!m) {
        el.style.display = 'none';
        return;
      }
      this.v.set(m.x, 1, m.z).project(g.camera);
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h;
      // già visibile sullo schermo: niente freccia
      if (x > left && x < right && y > top && y < bottom) {
        el.style.display = 'none';
        return;
      }
      // punto sul bordo del rettangolo libero lungo la direzione dal centro
      const dx = x - cx;
      const dy = y - cy;
      const tx = dx > 0 ? (right - cx) / dx : dx < 0 ? (left - cx) / dx : Infinity;
      const ty = dy > 0 ? (bottom - cy) / dy : dy < 0 ? (top - cy) / dy : Infinity;
      const t = Math.min(tx, ty);
      let px = cx + dx * t;
      let py = cy + dy * t;
      // non sovrapporre le bolle: sposta lungo il bordo
      const onSide = px <= left + 1 || px >= right - 1;
      for (let tries = 0; tries < 3 && placed.some((q) => Math.hypot(q.x - px, q.y - py) < 54); tries++) {
        if (onSide) py = Math.min(bottom, Math.max(top, py + 56));
        else px = Math.min(right, Math.max(left, px + 56));
      }
      placed.push({ x: px, y: py });
      el.style.display = 'block';
      el.style.transform = `translate(${px}px, ${py}px)`;
      el.classList.toggle('target', m.kind === 'target');
      el.style.setProperty('--c', m.color);
      (el.querySelector('.edge-arrow') as HTMLElement).style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      (el.querySelector('.edge-ico') as HTMLElement).textContent = m.icon;
      (el.querySelector('.edge-dist') as HTMLElement).textContent = `${Math.round(m.dist)} m`;
    });
  }
}
