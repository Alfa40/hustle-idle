/** Impostazioni del gioco: valgono per tutte le partite e restano sul dispositivo. */
export interface Settings {
  quality: 'alta' | 'media' | 'bassa';
  shadows: boolean;
  camera: 'vicina' | 'normale' | 'lontana';
  pointers: boolean;
  minimap: boolean;
  outlines: boolean;
}

const KEY = 'hustleidle.settings';

const DEFAULTS: Settings = { quality: 'alta', shadows: true, camera: 'normale', pointers: true, minimap: true, outlines: true };

export const settings: Settings = { ...DEFAULTS };

try {
  const raw = localStorage.getItem(KEY);
  if (raw) Object.assign(settings, JSON.parse(raw));
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
