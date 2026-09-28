import { CITY_MAP, LOTS, TILE } from '../config/map';
import type { Game, MapMarker } from '../game';
import { bizType } from '../config/business';

/** Colori della mappa per ogni tipo di tessera. */
const TILE_COLORS: Record<string, string> = {
  '#': '#6b7390',
  '.': '#9be07a',
  h: '#ffd66b',
  H: '#4fd08a',
  b: '#b3bde0',
  B: '#9aa6d6',
  R: '#ff9f6e',
  t: '#5cc46a',
  p: '#eef0fb',
  M: '#eef0fb',
};

const PX = 24; // pixel per tessera nell'immagine di base
let base: HTMLCanvasElement | null = null;

/** Immagine della città disegnata una volta sola. */
function baseMap() {
  if (base) return base;
  const rows = CITY_MAP.length;
  const cols = CITY_MAP[0].length;
  const c = document.createElement('canvas');
  c.width = cols * PX;
  c.height = rows * PX;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9be07a';
  g.fillRect(0, 0, c.width, c.height);
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const ch = CITY_MAP[r][col];
      const x = col * PX;
      const y = r * PX;
      const lot = LOTS.some((l) => l.char === ch);
      g.fillStyle = lot ? '#eef0fb' : TILE_COLORS[ch] ?? '#9be07a';
      g.fillRect(x, y, PX, PX);
      if (ch === '#') {
        // linea di mezzeria
        g.fillStyle = 'rgba(255,255,255,0.35)';
        const road = (dc: number, dr: number) => CITY_MAP[r + dr]?.[col + dc] === '#';
        if (road(-1, 0) || road(1, 0)) g.fillRect(x, y + PX / 2 - 1, PX, 2);
        if (road(0, -1) || road(0, 1)) g.fillRect(x + PX / 2 - 1, y, 2, PX);
      } else if ('hHbBR'.includes(ch)) {
        // edificio con bordo arrotondato
        g.fillStyle = TILE_COLORS[ch];
        g.strokeStyle = 'rgba(40,40,70,0.35)';
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(x + 4, y + 4, PX - 8, PX - 8, 4);
        g.fillStyle = '#9be07a';
        g.fillRect(x, y, PX, PX);
        if ('bBR'.includes(ch)) {
          g.fillStyle = '#eef0fb';
          g.fillRect(x, y, PX, PX);
        }
        g.fillStyle = TILE_COLORS[ch];
        g.fill();
        g.stroke();
      } else if (ch === 't') {
        g.fillStyle = '#9be07a';
        g.fillRect(x, y, PX, PX);
        g.fillStyle = '#3fae57';
        for (const [dx, dy] of [[7, 8], [16, 6], [11, 16], [18, 17]]) {
          g.beginPath();
          g.arc(x + dx, y + dy, 4.5, 0, 7);
          g.fill();
        }
      }
    }
  }
  base = c;
  return c;
}

export interface MapView {
  /** centro della vista in coordinate mondo */
  cx: number;
  cz: number;
  /** metri visibili sul lato più corto */
  span: number;
  full: boolean;
}

/** Disegna la mappa (o una sua parte) con giocatore e segnaposti. */
export function drawMap(g: CanvasRenderingContext2D, w: number, h: number, game: Game, view: MapView) {
  const cols = CITY_MAP[0].length;
  const rows = CITY_MAP.length;
  const scale = Math.min(w, h) / view.span; // pixel per metro
  // mondo → schermo
  const sx = (x: number) => w / 2 + (x - view.cx) * scale;
  const sy = (z: number) => h / 2 + (z - view.cz) * scale;
  g.fillStyle = '#7fc86a';
  g.fillRect(0, 0, w, h);
  const worldW = cols * TILE;
  const worldH = rows * TILE;
  g.imageSmoothingEnabled = true;
  g.drawImage(baseMap(), sx(-worldW / 2), sy(-worldH / 2), worldW * scale, worldH * scale);

  const markers = game.mapMarkers();
  const emoji = Math.max(14, Math.min(26, scale * 4.2));
  const pad = emoji * 0.75;
  for (const m of markers) {
    let x = sx(m.x);
    let y = sy(m.z);
    const outside = x < pad || x > w - pad || y < pad || y > h - pad;
    if (outside) {
      if (!view.full && (m.kind === 'job' || m.kind === 'target')) {
        // sulla minimappa i lavori fuori vista restano sul bordo
        x = Math.max(pad, Math.min(w - pad, x));
        y = Math.max(pad, Math.min(h - pad, y));
      } else continue;
    }
    pin(g, x, y, m, emoji, outside);
  }

  // giocatore: freccia nella direzione in cui guarda
  const p = game.player.root.position;
  const px = sx(p.x);
  const py = sy(p.z);
  const a = game.player.root.rotation.y;
  const r = Math.max(7, emoji * 0.45);
  g.save();
  g.translate(px, py);
  g.rotate(-a + Math.PI);
  g.fillStyle = '#2d7ff9';
  g.strokeStyle = '#fff';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, -r * 1.3);
  g.lineTo(r, r);
  g.lineTo(0, r * 0.45);
  g.lineTo(-r, r);
  g.closePath();
  g.stroke();
  g.fill();
  g.restore();
}

function pin(g: CanvasRenderingContext2D, x: number, y: number, m: MapMarker, size: number, faded: boolean) {
  const r = size * 0.72;
  g.globalAlpha = faded ? 0.8 : 1;
  g.fillStyle = m.color;
  g.strokeStyle = '#fff';
  g.lineWidth = Math.max(2, size * 0.14);
  g.beginPath();
  g.arc(x, y, r, 0, 7);
  g.fill();
  g.stroke();
  g.font = `${size * 0.95}px system-ui, "Apple Color Emoji", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(m.icon, x, y + size * 0.05);
  g.globalAlpha = 1;
}

/** Minimappa nell'HUD, centrata sul giocatore. */
export class Minimap {
  el: HTMLButtonElement;
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private t = 0;

  constructor(private game: Game, onOpen: () => void) {
    this.el = document.createElement('button');
    this.el.className = 'minimap';
    this.el.setAttribute('aria-label', 'Apri la mappa');
    this.cv = document.createElement('canvas');
    this.el.appendChild(this.cv);
    const lbl = document.createElement('span');
    lbl.className = 'minimap-lbl';
    lbl.textContent = '🗺️ Mappa';
    this.el.appendChild(lbl);
    this.g = this.cv.getContext('2d')!;
    this.el.addEventListener('click', onOpen);
  }

  update(dt: number) {
    this.t += dt;
    if (this.t < 0.1) return;
    this.t = 0;
    const size = this.el.clientWidth || 104;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.cv.width !== size * dpr) {
      this.cv.width = this.cv.height = size * dpr;
      this.cv.style.width = this.cv.style.height = size + 'px';
    }
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.game.interior) {
      this.g.fillStyle = '#ffe9c7';
      this.g.fillRect(0, 0, size, size);
      this.g.font = `${size * 0.36}px system-ui`;
      this.g.textAlign = 'center';
      this.g.textBaseline = 'middle';
      this.g.fillText(bizType(this.game.interior.biz.type).icon, size / 2, size / 2);
      return;
    }
    const p = this.game.player.root.position;
    drawMap(this.g, size, size, this.game, { cx: p.x, cz: p.z, span: 62, full: false });
  }
}
