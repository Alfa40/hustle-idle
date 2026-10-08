import { JOB } from '../config/balance';
import { GLAZES, VASE_IDS, VASES } from '../world/ceramics';
import { addFame, addMoney, addXp, skillLevel } from './progress';
import { day, playStats, type Business, type GameState, type SpecialOrder } from './state';

/**
 * Ordini speciali del negozio di ceramiche: ogni giorno 3 vasi su commissione, ben pagati, da
 * modellare a mano al tornio (in prima persona). Li fa solo il giocatore, mai i dipendenti.
 * Le forme più difficili compaiono salendo di livello in artigianato.
 */
export const SPECIALS_PER_DAY = 3;

export function specialOrders(s: GameState, b: Business): SpecialOrder[] {
  if (b.type !== 'artigianato') return [];
  const d = day(s);
  if (b.specialsDay !== d || !b.specials) {
    const lv = skillLevel(s, 'artigianato');
    const shapes = VASE_IDS.filter((v) => VASES[v].minLevel <= lv);
    b.specialsDay = d;
    b.specials = Array.from({ length: SPECIALS_PER_DAY }, (_, i) => {
      const shape = shapes[(Math.floor(Math.random() * shapes.length) + i) % shapes.length];
      const glaze = GLAZES[Math.floor(Math.random() * GLAZES.length)].color;
      const reward = Math.round(((80 + 60 * VASES[shape].diff) * (1 + 0.06 * lv)) / 5) * 5;
      return { id: d * 10 + i, shape, glaze, reward };
    });
  }
  return b.specials;
}

/** Tempo per un ordine speciale (s): più lungo per le forme difficili. */
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

/** Fine di un ordine speciale: soldi nell'incasso del negozio, esperienza e fama di artigianato. */
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
