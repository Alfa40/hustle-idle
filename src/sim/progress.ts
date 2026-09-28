import { LEVEL } from '../config/balance';
import { SKILLS, SKILL_IDS, type SkillId } from '../config/skills';
import { bus, toast } from './bus';
import { euro, type GameState } from './state';

export function addMoney(s: GameState, amount: number, reason?: string) {
  s.money += amount;
  if (amount > 0) {
    s.todayEarned += amount;
    s.totalEarned += amount;
    for (const m of s.missions) if (m.kind === 'earn' && !m.claimed) m.progress = Math.min(m.target, s.todayEarned);
  }
  if (reason) toast(`${amount >= 0 ? '+' : ''}${euro(amount)} ${reason}`, amount >= 0 ? 'money' : 'bad');
  bus.emit('money');
}

export function skillLevel(s: GameState, skill: SkillId) {
  return LEVEL.levelFromXp(s.xp[skill]);
}

export function addXp(s: GameState, skill: SkillId, amount: number) {
  const before = skillLevel(s, skill);
  s.xp[skill] += amount;
  const after = skillLevel(s, skill);
  if (after > before) {
    toast(`${SKILLS[skill].icon} ${SKILLS[skill].name} livello ${after}!`, 'good');
    bus.emit('levelup', skill);
  }
  bus.emit('stats');
}

export function addFame(s: GameState, skill: SkillId, amount: number) {
  s.fame[skill] = Math.max(0, s.fame[skill] + amount);
  bus.emit('stats');
}

export const totalFame = (s: GameState) => SKILL_IDS.reduce((a, k) => a + s.fame[k], 0);
export const totalLevel = (s: GameState) => SKILL_IDS.reduce((a, k) => a + skillLevel(s, k), 0);

/** Rango complessivo del giocatore mostrato nel profilo. */
export function rank(s: GameState) {
  const f = totalFame(s);
  const ranks = [
    [0, 'Squattrinato'], [15, 'Tuttofare'], [50, 'Lavoratore stimato'], [120, 'Piccolo imprenditore'],
    [300, 'Imprenditore'], [700, 'Uomo d\'affari'], [1500, 'Magnate'],
  ] as const;
  let r: string = ranks[0][1];
  for (const [min, name] of ranks) if (f >= min) r = name;
  return r;
}
