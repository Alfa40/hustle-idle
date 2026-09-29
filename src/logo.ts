import * as THREE from 'three';

/**
 * Logo delle attività del giocatore (uno per partita): forma, colore di sfondo,
 * colore del simbolo, un simbolo (emoji) e fino a 3 iniziali.
 * Compare sulle insegne, nel profilo, in classifica e sulla mappa degli amici.
 */
export interface Logo {
  shape: LogoShape;
  bg: string;
  fg: string;
  symbol: string;
  text: string;
  /** foto caricata dal giocatore (JPEG quadrato, data URL): se c'è, riempie la forma al posto del simbolo */
  photo?: string;
}

/** Una foto valida: JPEG in data URL, piccola (il logo è 160×160). */
export const PHOTO_MAX = 40000;
export const isPhoto = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= PHOTO_MAX && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v);

/** Foto dei loghi già decodificate (il disegno su canvas è sincrono). */
const photos = new Map<string, HTMLImageElement>();
const waiting = new Map<string, Promise<void>>();
function photoImage(url: string): HTMLImageElement | null {
  const img = photos.get(url);
  return img && img.complete && img.naturalWidth ? img : null;
}
/** Carica la foto di un logo (se ce l'ha); si risolve quando si può disegnare. */
export function preloadLogo(logo: Logo | null | undefined): Promise<void> {
  const url = logo?.photo;
  if (!url || photoImage(url)) return Promise.resolve();
  let p = waiting.get(url);
  if (!p) {
    p = new Promise<void>((res) => {
      const img = new Image();
      img.onload = img.onerror = () => res();
      img.src = url;
      photos.set(url, img);
    });
    waiting.set(url, p);
  }
  return p;
}

export const LOGO_SHAPES = ['cerchio', 'scudo', 'quadrato', 'stella', 'esagono'] as const;
export type LogoShape = (typeof LOGO_SHAPES)[number];
export const SHAPE_ICON: Record<LogoShape, string> = { cerchio: '⚪', scudo: '🛡️', quadrato: '⬜', stella: '⭐', esagono: '⬡' };

export const LOGO_COLORS = ['#ff5d73', '#ff8a3d', '#ffc21a', '#35c46a', '#1fa38a', '#2d9cdb', '#3d5afe', '#8e5bd6', '#e84393', '#6d4c41', '#37474f', '#ffffff'];
export const LOGO_SYMBOLS = ['🍔', '🥪', '🌭', '🍕', '🥐', '🍞', '🎂', '🍦', '☕', '🧁', '🏺', '🪑', '💍', '🧽', '📦', '🚚', '⭐', '👑', '🔥', '⚡', '🍀', '🌈', '💎', '🚀', '🦁', '🐻', '🦊', '🐧', '🎨', '🛠️'];

export function randomLogo(): Logo {
  const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
  const bg = pick(LOGO_COLORS.slice(0, 10));
  return { shape: pick(LOGO_SHAPES), bg, fg: '#ffffff', symbol: pick(LOGO_SYMBOLS), text: '' };
}

/** Dati arrivati dalla rete o da un salvataggio vecchio: sempre un logo valido. */
export function safeLogo(raw: Partial<Logo> | null | undefined): Logo | null {
  if (!raw || typeof raw !== 'object') return null;
  const hex = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
  return {
    shape: LOGO_SHAPES.includes(raw.shape as LogoShape) ? (raw.shape as LogoShape) : 'cerchio',
    bg: hex(raw.bg, '#ff8a3d'),
    fg: hex(raw.fg, '#ffffff'),
    symbol: typeof raw.symbol === 'string' ? [...raw.symbol].slice(0, 4).join('') : '⭐',
    text: typeof raw.text === 'string' ? raw.text.slice(0, 3) : '',
    ...(isPhoto(raw.photo) ? { photo: raw.photo } : {}),
  };
}

function shapePath(g: CanvasRenderingContext2D, shape: LogoShape, s: number) {
  const c = s / 2;
  const r = s * 0.46;
  g.beginPath();
  switch (shape) {
    case 'cerchio':
      g.arc(c, c, r, 0, Math.PI * 2);
      break;
    case 'quadrato':
      g.roundRect(c - r, c - r, r * 2, r * 2, s * 0.14);
      break;
    case 'scudo':
      g.moveTo(c - r, c - r * 0.95);
      g.lineTo(c + r, c - r * 0.95);
      g.lineTo(c + r, c - r * 0.1);
      g.quadraticCurveTo(c + r, c + r * 0.65, c, c + r);
      g.quadraticCurveTo(c - r, c + r * 0.65, c - r, c - r * 0.1);
      g.closePath();
      break;
    case 'esagono':
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      g.closePath();
      break;
    case 'stella':
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const rr = i % 2 ? r * 0.62 : r;
        g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
      }
      g.closePath();
      break;
  }
}

/**
 * Disegna il logo su un canvas quadrato di lato `s` pixel.
 * `photo` sostituisce la foto salvata (anteprima mentre la si ritocca).
 */
export function drawLogo(g: CanvasRenderingContext2D, logo: Logo, s: number, photo?: CanvasImageSource | null) {
  g.clearRect(0, 0, s, s);
  shapePath(g, logo.shape, s);
  g.fillStyle = logo.bg;
  g.fill();
  const img = photo ?? (logo.photo ? photoImage(logo.photo) : null);
  if (img) {
    // la foto riempie la forma; sopra solo il bordo (e le iniziali, se ci sono)
    g.save();
    shapePath(g, logo.shape, s);
    g.clip();
    g.drawImage(img, 0, 0, s, s);
    g.restore();
    shapePath(g, logo.shape, s);
    g.lineWidth = s * 0.045;
    g.strokeStyle = 'rgba(255,255,255,.95)';
    g.stroke();
    if (logo.text.trim()) {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 ${Math.round(s * 0.17)}px Fredoka, system-ui, sans-serif`;
      g.lineWidth = s * 0.03;
      g.strokeStyle = 'rgba(0,0,0,.6)';
      g.strokeText(logo.text.toUpperCase(), s / 2, s * 0.76);
      g.fillStyle = logo.fg;
      g.fillText(logo.text.toUpperCase(), s / 2, s * 0.76);
    }
    return;
  }
  g.lineWidth = s * 0.045;
  g.strokeStyle = 'rgba(255,255,255,.95)';
  g.stroke();
  g.lineWidth = s * 0.02;
  g.strokeStyle = 'rgba(0,0,0,.25)';
  g.stroke();
  const hasText = !!logo.text.trim();
  const cy = logo.shape === 'scudo' ? s * 0.46 : s / 2;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = logo.fg;
  g.font = `${Math.round(s * (hasText ? 0.34 : 0.44))}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  g.fillText(logo.symbol, s / 2, hasText ? cy - s * 0.09 : cy + s * 0.02);
  if (hasText) {
    g.font = `800 ${Math.round(s * 0.17)}px Fredoka, system-ui, sans-serif`;
    g.fillText(logo.text.toUpperCase(), s / 2, cy + s * 0.2);
  }
}

const urlCache = new Map<string, string>();
/** Immagine del logo (data URL) per l'interfaccia HTML. */
export function logoUrl(logo: Logo | null | undefined, s = 96) {
  if (!logo) return '';
  const key = JSON.stringify(logo) + s;
  let u = urlCache.get(key);
  // foto non ancora decodificata: si disegna senza e non si mette in cache
  if (!u && logo.photo && !photoImage(logo.photo)) {
    void preloadLogo(logo);
    const c = document.createElement('canvas');
    c.width = c.height = s;
    drawLogo(c.getContext('2d')!, { ...logo, photo: undefined }, s);
    return c.toDataURL();
  }
  if (!u) {
    const c = document.createElement('canvas');
    c.width = c.height = s;
    drawLogo(c.getContext('2d')!, logo, s);
    u = c.toDataURL();
    urlCache.set(key, u);
  }
  return u;
}

export const logoImg = (logo: Logo | null | undefined, px = 32, cls = 'logo-img') =>
  logo ? `<img class="${cls}" src="${logoUrl(logo, px * 2)}" width="${px}" height="${px}" alt="">` : '';

/** Logo come sprite 3D (insegne delle attività). */
export function logoSprite(logo: Logo, size = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  drawLogo(c.getContext('2d')!, logo, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // la foto arriva dopo: si ridisegna appena è pronta
  if (logo.photo && !photoImage(logo.photo)) {
    void preloadLogo(logo).then(() => {
      drawLogo(c.getContext('2d')!, logo, 256);
      tex.needsUpdate = true;
    });
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(size, size, 1);
  s.renderOrder = 12;
  return s;
}

// ---------------- foto: ritaglio e ritocco ----------------

export interface PhotoEdit {
  img: HTMLImageElement;
  /** 1 = la foto copre il quadrato; di più = ingrandita */
  zoom: number;
  /** spostamento in frazioni del lato */
  ox: number;
  oy: number;
  /** quarti di giro */
  rot: number;
  bright: number;
  contrast: number;
  sat: number;
  bw: boolean;
}

export const newPhotoEdit = (img: HTMLImageElement): PhotoEdit => ({ img, zoom: 1, ox: 0, oy: 0, rot: 0, bright: 100, contrast: 100, sat: 100, bw: false });

/**
 * La foto ritagliata e ritoccata, su un canvas quadrato di lato `s`.
 * I ritocchi sono fatti a mano sui pixel (vanno su tutti i telefoni, anche senza ctx.filter).
 */
export function renderPhoto(e: PhotoEdit, s: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, s, s);
  const w = e.img.naturalWidth;
  const h = e.img.naturalHeight;
  const k = (s / Math.min(w, h)) * e.zoom;
  g.save();
  g.translate(s / 2 + e.ox * s, s / 2 + e.oy * s);
  g.rotate((e.rot * Math.PI) / 2);
  g.scale(k, k);
  g.drawImage(e.img, -w / 2, -h / 2);
  g.restore();
  if (e.bright !== 100 || e.contrast !== 100 || e.sat !== 100 || e.bw) {
    const d = g.getImageData(0, 0, s, s);
    const px = d.data;
    const b = e.bright / 100;
    const ct = e.contrast / 100;
    const sat = e.bw ? 0 : e.sat / 100;
    for (let i = 0; i < px.length; i += 4) {
      let r = px[i] * b;
      let gr = px[i + 1] * b;
      let bl = px[i + 2] * b;
      r = (r - 128) * ct + 128;
      gr = (gr - 128) * ct + 128;
      bl = (bl - 128) * ct + 128;
      const l = 0.299 * r + 0.587 * gr + 0.114 * bl;
      px[i] = l + (r - l) * sat;
      px[i + 1] = l + (gr - l) * sat;
      px[i + 2] = l + (bl - l) * sat;
    }
    g.putImageData(d, 0, 0);
  }
  return c;
}

/** Foto finale del logo: 160×160 JPEG (sta nel salvataggio e va ai tuoi amici). */
export function photoData(e: PhotoEdit) {
  for (const q of [0.82, 0.7, 0.55]) {
    const url = renderPhoto(e, 160).toDataURL('image/jpeg', q);
    if (url.length <= PHOTO_MAX) return url;
  }
  return renderPhoto(e, 120).toDataURL('image/jpeg', 0.5);
}
