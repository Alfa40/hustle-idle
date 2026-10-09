import { JOB } from '../config/balance';
import { GLAZES, VASE_IDS, VASES, type VaseShape } from '../world/ceramics';
import { addFame, addMoney, addXp, skillLevel } from './progress';
import { day, playStats, type Business, type GameState, type SpecialOrder } from './state';

/**
 * Lavori su richiesta del laboratorio dell'artigiano: ogni giorno 3 lavori fatti a mano dal giocatore
 * in prima persona (mai dai dipendenti: il laboratorio non ne ha), pagati più dei lavoretti.
 * Il primo tipo di lavoro sono i vasi in ceramica: salendo di livello in artigianato le forme sono più
 * difficili (e pagate meglio). Migliorando il laboratorio arriveranno nuovi tipi di lavoro.
 */
export const SPECIALS_PER_DAY = 3;

/** Tipi di lavoro del laboratorio: i prossimi si sbloccheranno migliorando il laboratorio. */
export const CRAFT_JOBS: { id: string; icon: string; name: string; desc: string; ready: boolean }[] = [
  { id: 'vaso', icon: '🏺', name: 'Vasi in ceramica', desc: 'Al tornio: modella, essicca, dipingi, incarta.', ready: true },
  { id: 'next1', icon: '🪑', name: 'Nuovo lavoro', desc: 'Si sbloccherà migliorando il laboratorio.', ready: false },
  { id: 'next2', icon: '💍', name: 'Nuovo lavoro', desc: 'Si sbloccherà migliorando il laboratorio.', ready: false },
];

export function specialOrders(s: GameState, b: Business): SpecialOrder[] {
  if (b.type !== 'artigianato') return [];
  const d = day(s);
  if (b.specialsDay !== d || !b.specials) {
    const lv = skillLevel(s, 'artigianato');
    const shapes = VASE_IDS.filter((v) => VASES[v].minLevel <= lv);
    // più esperienza = forme più difficili più spesso (le facili restano, sempre meno)
    const weight = (v: VaseShape) => 1 + Math.max(0, lv - VASES[v].minLevel) * 0.25 * VASES[v].diff;
    const pick = () => {
      let r = Math.random() * shapes.reduce((a, v) => a + weight(v), 0);
      for (const v of shapes) if ((r -= weight(v)) <= 0) return v;
      return shapes[shapes.length - 1];
    };
    b.specialsDay = d;
    b.specials = Array.from({ length: SPECIALS_PER_DAY }, (_, i) => {
      const shape = pick();
      const glaze = GLAZES[Math.floor(Math.random() * GLAZES.length)].color;
      const reward = Math.round(((80 + 60 * VASES[shape].diff) * (1 + 0.08 * lv)) / 5) * 5;
      return { id: d * 10 + i, shape, glaze, reward };
    });
  }
  return b.specials;
}

/** Tempo per un lavoro su richiesta (s): più lungo per le forme difficili. */
export const specialTime = (o: SpecialOrder) => 100 + VASES[o.shape].diff * 20;

/**
 * Stelle: forma (quanto somiglia alla foto) e tempo. La forma conta di più: un vaso storto
 * non vale 3 stelle anche se fatto in fretta.
 */
export function specialStars(quality: number, timeLeft: number, timeTotal: number) {
  const f = timeLeft / timeTotal;
  if (quality >= 0.92 && f >= JOB.STAR3 * 0.8) return 3;
  if (quality >= 0.84 && f >= JOB.STAR2 * 0.8) return 2;
  return 1;
}

/** Fine di un lavoro su richiesta: soldi nell'incasso del laboratorio, esperienza e fama di artigianato. */
export function completeSpecial(s: GameState, b: Business, o: SpecialOrder, stars: number) {
  o.done = true;
  if (stars <= 0) {
    addFame(s, 'artigianato', -1);
    return { pay: 0, xp: 0 };
  }
  const pay = Math.round(o.reward * JOB.STAR_PAY[stars] / JOB.STAR_PAY[2]);
  b.today.revenue += pay;
  b.month.revenue += pay;
  b.totalRevenue += pay;
  addMoney(s, pay);
  const xp = Math.round((18 + 10 * VASES[o.shape].diff) * (0.6 + stars * 0.25));
  addXp(s, 'artigianato', xp);
  addFame(s, 'artigianato', 0.6 * stars);
  playStats(s).orders++;
  return { pay, xp };
}
