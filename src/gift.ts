import type { GameState } from './sim/state';
import { LEVEL } from './config/balance';
import { addMoney, sectorXp, skillLevel, totalLevel } from './sim/progress';
import { mainField, needsField } from './sim/fields';
import { bus } from './sim/bus';
import { addNews } from './sim/news';

/**
 * Codice regalo per chi riparte da zero (reset del 24/10/2026): +€100.000, +2000 di fama e il livello del giocatore
 * almeno a 10 (sul campo principale). Vale una volta sola per telefono (localStorage); nel codice c'è solo l'impronta
 * SHA-256 del codice. Si scrive nelle Opzioni → 💾 Partita, dopo aver scelto la carriera.
 */
const GIFT_HASH = '1732ccfe72c759f0db26eb29f160c66ee27b3e961432ef210e2846fbd98d93dc';
const USED_KEY = 'hustle.giftStart';

export const GIFT = { money: 100_000, fame: 2000, level: 10 };

export function giftUsed() {
  try {
    return localStorage.getItem(USED_KEY) === '1';
  } catch {
    return false;
  }
}

async function sha256(t: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type GiftResult = 'ok' | 'bad' | 'used' | 'nofield';

export async function redeemGift(s: GameState, raw: string): Promise<GiftResult> {
  if (giftUsed()) return 'used';
  if ((await sha256(raw.trim().toUpperCase())) !== GIFT_HASH) return 'bad';
  const k = mainField(s);
  if (needsField(s) || !k) return 'nofield';
  addMoney(s, GIFT.money);
  s.fame[k] = (s.fame[k] ?? 0) + GIFT.fame;
  // livello del giocatore (somma dei settori) almeno 10: sale il campo principale
  for (let i = 0; i < 200 && totalLevel(s) < GIFT.level; i++) s.xp[k] = (s.xp[k] ?? 0) + Math.max(1, LEVEL.xpForLevel(skillLevel(s, k) + 1) - sectorXp(s, k) + 1);
  addNews(s, { icon: '🎁', kind: 'good', text: `Codice regalo: +€100.000, +2000 di fama e livello ${totalLevel(s)}` });
  try {
    localStorage.setItem(USED_KEY, '1');
  } catch {
    /* niente */
  }
  bus.emit('stats');
  return 'ok';
}
