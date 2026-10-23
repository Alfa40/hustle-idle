/** Impostazioni del gioco: valgono per tutte le partite e restano sul dispositivo. */
export interface Settings {
  quality: 'alta' | 'media' | 'bassa';
  shadows: boolean;
  camera: 'vicina' | 'normale' | 'lontana';
  pointers: boolean;
  minimap: boolean;
  outlines: boolean;
  /** risparmio batteria: 30 fotogrammi al secondo (15 da fermo) e meno pixel */
  battery: boolean;
  /** ordine dei pulsanti a destra (dall'alto) */
  hudOrder: HudKey[];
  /** pulsanti spostati nel menu a tendina ☰ */
  hudMenu: HudKey[];
  /** joystick a destra e azioni toccando a sinistra (per i mancini) */
  swapControls: boolean;
  /** sensibilità della visuale (×, 1 = normale): quanto gira la camera trascinando il dito (lavoretti, tornio) */
  lookSens: number;
}

/** Metà dello schermo delle azioni (per i testi dei tutorial): l'altra è del joystick. */
export const actSide = () => (settings.swapControls ? 'sinistra' : 'destra');
export const moveSide = () => (settings.swapControls ? 'destra' : 'sinistra');

export const HUD_KEYS = ['biz', 'missions', 'news', 'profile', 'home', 'shop', 'multi', 'settings', 'camera'] as const;
export type HudKey = (typeof HUD_KEYS)[number];
export const HUD_NAMES: Record<HudKey, string> = {
  biz: '🏢 Attività', missions: '📋 Missioni', news: '📰 Notizie', profile: '👤 Profilo', home: '🏠 Casa', shop: '🛍️ Negozio', multi: '🎮 Multigiocatore', settings: '⚙️ Opzioni', camera: '🎥 Camera',
};

const KEY = 'hustleidle.settings';

/** Limiti del cursore della sensibilità della visuale (× rispetto al normale). */
export const LOOK_MIN = 0.3;
export const LOOK_MAX = 2.5;

const DEFAULTS: Settings = { quality: 'alta', shadows: true, camera: 'normale', pointers: true, minimap: true, outlines: true, battery: false, hudOrder: [...HUD_KEYS], hudMenu: [], swapControls: false, lookSens: 1 };

export const settings: Settings = { ...DEFAULTS };

try {
  const raw = localStorage.getItem(KEY);
  if (raw) Object.assign(settings, JSON.parse(raw));
  // pulsanti nuovi (o nomi sconosciuti) sistemati: ogni pulsante compare una volta sola
  const known = (k: unknown): k is HudKey => (HUD_KEYS as readonly unknown[]).includes(k);
  const order = (Array.isArray(settings.hudOrder) ? settings.hudOrder : []).filter(known);
  // un pulsante nuovo va al suo posto (subito dopo quello che lo precede nell'ordine predefinito), non in fondo
  const merged = [...new Set(order)];
  HUD_KEYS.forEach((k, i) => {
    if (merged.includes(k)) return;
    const prev = HUD_KEYS.slice(0, i).reverse().find((x) => merged.includes(x));
    merged.splice(prev ? merged.indexOf(prev) + 1 : 0, 0, k);
  });
  settings.hudOrder = merged;
  // sensibilità: un numero tra i limiti del cursore (le vecchie scelte a tasti tornano al normale)
  const ls = Number(settings.lookSens);
  settings.lookSens = Number.isFinite(ls) ? Math.max(LOOK_MIN, Math.min(LOOK_MAX, ls)) : 1;
  settings.hudMenu = [...new Set((Array.isArray(settings.hudMenu) ? settings.hudMenu : []).filter(known))];
} catch {
  /* si usano i valori predefiniti */
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function onSettings(fn: Listener) {
  listeners.add(fn);
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* niente */
  }
  listeners.forEach((fn) => fn());
}

/** Rapporto pixel massimo per ogni qualità (meno pixel = telefono più fresco). */
export const QUALITY_PIXEL_RATIO: Record<Settings['quality'], number> = { alta: 1.6, media: 1.25, bassa: 1 };
export const CAMERA_MULT: Record<Settings['camera'], number> = { vicina: 0.78, normale: 1, lontana: 1.28 };


export const SETTING_OPTIONS = {
  quality: [['alta', 'Alta'], ['media', 'Media'], ['bassa', 'Bassa']],
  camera: [['vicina', 'Vicina'], ['normale', 'Normale'], ['lontana', 'Lontana']],
} as const;
