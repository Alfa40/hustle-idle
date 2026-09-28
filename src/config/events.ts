import type { ProductId } from './products';
import type { ZoneId } from './map';

/** Come un evento o il meteo cambia la domanda. */
export interface Effects {
  /** moltiplicatore su tutto */
  all?: number;
  product?: Partial<Record<ProductId, number>>;
  zone?: Partial<Record<ZoneId, number>>;
}

export interface Happening extends Effects {
  id: string;
  name: string;
  icon: string;
  desc: string;
}

// ---------------- eventi casuali (annunciati qualche giorno prima) ----------------

export interface EventDef extends Happening {
  /** mesi in cui può capitare (0 = gennaio) */
  months: number[];
  minDays: number;
  maxDays: number;
}

const ALL_YEAR = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export const EVENTS: EventDef[] = [
  {
    id: 'festa', name: 'Festa del quartiere', icon: '🎉', desc: 'Tutto il cibo di strada va a ruba.',
    months: ALL_YEAR, minDays: 1, maxDays: 2, all: 1.6,
  },
  {
    id: 'streetfood', name: 'Fiera dello street food', icon: '🌮', desc: 'Tacos e hot dog richiestissimi.',
    months: [3, 4, 5, 8, 9], minDays: 2, maxDays: 3, product: { tacos: 1.8, hotdog: 1.5 },
  },
  {
    id: 'concerto', name: 'Concerto in centro', icon: '🎸', desc: 'Il centro si riempie di gente.',
    months: ALL_YEAR, minDays: 1, maxDays: 1, zone: { centro: 1.8 },
  },
  {
    id: 'sagra', name: 'Sagra rionale', icon: '🧺', desc: 'Gente in giro in periferia e nei quartieri.',
    months: [3, 4, 5, 6, 7, 8, 9], minDays: 1, maxDays: 2, zone: { periferia: 1.6, residenziale: 1.3 },
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

// ---------------- feste fisse (sempre nello stesso giorno) ----------------

export interface FixedEvent extends Happening {
  month: number;
  /** giorno del mese (1–30) */
  day: number;
  len: number;
}

export const FIXED_EVENTS: FixedEvent[] = [
  { id: 'capodanno', name: 'Capodanno', icon: '🥂', desc: 'Tutti a riposare: poca gente in giro.', month: 0, day: 1, len: 1, all: 0.7 },
  { id: 'carnevale', name: 'Carnevale', icon: '🎭', desc: 'Sfilate e maschere in centro.', month: 1, day: 14, len: 2, all: 1.2, zone: { centro: 1.4 } },
  { id: 'pasquetta', name: 'Pasquetta', icon: '🧺', desc: 'Picnic nei parchi di periferia.', month: 3, day: 13, len: 1, zone: { periferia: 1.9 } },
  { id: 'liberazione', name: 'Festa della Liberazione', icon: '🇮🇹', desc: 'Giorno di festa, tanta gente fuori.', month: 3, day: 25, len: 1, all: 1.2 },
  { id: 'lavoratori', name: 'Concertone del 1° Maggio', icon: '🎤', desc: 'Concerto gratuito in centro.', month: 4, day: 1, len: 1, zone: { centro: 1.9 }, all: 1.1 },
  { id: 'repubblica', name: 'Festa della Repubblica', icon: '🎆', desc: 'Parata e fuochi in centro.', month: 5, day: 2, len: 1, zone: { centro: 1.5 }, all: 1.1 },
  { id: 'nottebianca', name: 'Notte bianca', icon: '🌃', desc: 'Negozi aperti fino a tardi, centro pienissimo.', month: 6, day: 20, len: 1, zone: { centro: 2 }, all: 1.2 },
  { id: 'ferragosto', name: 'Ferragosto', icon: '🏖️', desc: 'Caldo e vacanza: gelati a ruba.', month: 7, day: 15, len: 1, all: 1.2, product: { gelati: 1.6 } },
  { id: 'halloween', name: 'Halloween', icon: '🎃', desc: 'Feste e dolcetti in tutti i quartieri.', month: 9, day: 30, len: 1, all: 1.25 },
  { id: 'natale', name: 'Mercatini di Natale', icon: '🎄', desc: 'Il centro si riempie di bancarelle.', month: 11, day: 8, len: 16, zone: { centro: 1.4 }, product: { gelati: 0.7 } },
  { id: 'vigilia', name: 'Vigilia di Capodanno', icon: '🎇', desc: 'Festa in piazza fino a mezzanotte.', month: 11, day: 30, len: 1, all: 1.5 },
];

// ---------------- appuntamenti settimanali ----------------

export interface WeeklyEvent extends Happening {
  /** 0 = lunedì … 6 = domenica */
  weekday: number;
}

export const WEEKLY_EVENTS: WeeklyEvent[] = [
  { id: 'mercato', name: 'Mercato del sabato', icon: '🛒', desc: 'Più passaggio in periferia e nei quartieri.', weekday: 5, zone: { periferia: 1.4, residenziale: 1.2 } },
  { id: 'domenica', name: 'Domenica al parco', icon: '🌳', desc: 'Famiglie a passeggio: più clienti ovunque.', weekday: 6, all: 1.15, zone: { periferia: 1.2 } },
];

// ---------------- meteo ----------------

export type WeatherId = 'sole' | 'nuvoloso' | 'pioggia' | 'temporale' | 'caldo' | 'freddo' | 'neve';

export const WEATHER: Record<WeatherId, Happening> = {
  sole: { id: 'sole', name: 'Sole', icon: '☀️', desc: 'Bel tempo.', product: { gelati: 1.1 } },
  nuvoloso: { id: 'nuvoloso', name: 'Nuvoloso', icon: '⛅', desc: 'Un po\' meno gente in giro.', all: 0.95 },
  pioggia: { id: 'pioggia', name: 'Pioggia', icon: '🌧️', desc: 'Meno clienti, nessuno vuole gelati.', all: 0.8, product: { gelati: 0.4, panini: 1.15 } },
  temporale: { id: 'temporale', name: 'Temporale', icon: '⛈️', desc: 'Strade quasi vuote.', all: 0.6, product: { gelati: 0.3 } },
  caldo: { id: 'caldo', name: 'Ondata di caldo', icon: '🔥', desc: 'Gelati alle stelle, panini un po\' giù.', product: { gelati: 2, hotdog: 1.1, panini: 0.9 } },
  freddo: { id: 'freddo', name: 'Gelata', icon: '🥶', desc: 'Si cercano cibi caldi, niente gelati.', all: 0.85, product: { gelati: 0.3, panini: 1.3, hotdog: 1.2 } },
  neve: { id: 'neve', name: 'Neve', icon: '🌨️', desc: 'Città bloccata: pochissimi clienti.', all: 0.6, product: { gelati: 0.2, hotdog: 1.2 } },
};

export const WEATHER_IDS = Object.keys(WEATHER) as WeatherId[];

type Prior = Record<WeatherId, number>;
const WINTER: Prior = { sole: 0.3, nuvoloso: 0.3, pioggia: 0.15, temporale: 0, caldo: 0, freddo: 0.17, neve: 0.08 };
const SPRING: Prior = { sole: 0.42, nuvoloso: 0.25, pioggia: 0.22, temporale: 0.07, caldo: 0.04, freddo: 0, neve: 0 };
const SUMMER: Prior = { sole: 0.5, nuvoloso: 0.12, pioggia: 0.06, temporale: 0.12, caldo: 0.2, freddo: 0, neve: 0 };
const AUTUMN: Prior = { sole: 0.3, nuvoloso: 0.3, pioggia: 0.28, temporale: 0.08, caldo: 0.02, freddo: 0.02, neve: 0 };

/** Probabilità di ogni tempo per mese (0 = gennaio). */
export const WEATHER_PRIOR: Prior[] = [
  WINTER, WINTER, SPRING, SPRING, SPRING, SUMMER, SUMMER, SUMMER, AUTUMN, AUTUMN, AUTUMN, WINTER,
];

export const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

export const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
