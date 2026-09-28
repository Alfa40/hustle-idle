import type { ProductId } from './products';
import type { ZoneId } from './map';

export interface EventDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** mesi in cui può capitare (0 = gennaio) */
  months: number[];
  minDays: number;
  maxDays: number;
  product?: Partial<Record<ProductId, number>>;
  all?: number;
  zone?: Partial<Record<ZoneId, number>>;
}

const ALL_YEAR = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export const EVENTS: EventDef[] = [
  {
    id: 'caldo', name: 'Ondata di caldo', icon: '🔥', desc: 'Gelati alle stelle, hot dog un po\' su.',
    months: [5, 6, 7], minDays: 2, maxDays: 4, product: { gelati: 2, hotdog: 1.1, panini: 0.9 },
  },
  {
    id: 'pioggia', name: 'Settimana di pioggia', icon: '🌧️', desc: 'Meno gente in giro, nessuno vuole gelati.',
    months: [2, 3, 9, 10], minDays: 2, maxDays: 4, all: 0.8, product: { gelati: 0.4, panini: 1.15 },
  },
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
    id: 'mercato', name: 'Mercatino rionale', icon: '🧺', desc: 'Più passaggio in periferia.',
    months: ALL_YEAR, minDays: 1, maxDays: 2, zone: { periferia: 1.6, residenziale: 1.3 },
  },
  {
    id: 'freddo', name: 'Gelata', icon: '❄️', desc: 'Fa freddissimo: panini caldi sì, gelati no.',
    months: [0, 1, 11], minDays: 2, maxDays: 4, all: 0.85, product: { gelati: 0.3, panini: 1.3, hotdog: 1.2 },
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

export const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];
