import { LEVEL } from '../config/balance';
import { SKILLS, SKILL_IDS, type SkillId } from '../config/skills';
import { CAREER_LINES, careerLine, EVOLVE_EVERY } from '../config/careers';
import { bus, toast } from './bus';
import { euro, playStats, type GameState } from './state';

/** `fromMission`: premio di una missione, che non conta per le missioni "Guadagna €…". */
export function addMoney(s: GameState, amount: number, reason?: string, fromMission = false) {
  s.money += amount;
  if (amount > 0 && !fromMission) {
    s.todayEarned += amount;
    const st = playStats(s);
    st.bestDay = Math.max(st.bestDay, s.todayEarned);
    s.weekEarned = (s.weekEarned ?? 0) + amount;
    s.totalEarned += amount;
    for (const m of s.missions) if (m.kind === 'earn' && !m.claimed) m.progress = Math.min(m.target, s.todayEarned);
    for (const m of s.weekly ?? []) if (m.kind === 'earn' && !m.claimed) m.progress = Math.min(m.target, s.weekEarned);
  }
  if (reason) toast(`${amount >= 0 ? '+' : ''}${euro(amount)} ${reason}`, amount >= 0 ? 'money' : 'bad');
  bus.emit('money');
}

/** Esperienza di una linea di lavoro (config/careers.ts). */
export const lineXp = (s: GameState, line: string) => s.jobXp?.[line] ?? 0;
/** Livello di una linea di lavoro: decide la difficoltà e, ogni 10 livelli, l'evoluzione del lavoro. */
export const lineLevel = (s: GameState, line: string) => LEVEL.levelFromXp(lineXp(s, line));

/** Esperienza del settore: la somma di tutte le sue linee di lavoro più il lavoro nelle sue attività. */
export function sectorXp(s: GameState, skill: SkillId) {
  let x = s.xp[skill] ?? 0;
  for (const l of CAREER_LINES) if (l.sector === skill) x += lineXp(s, l.id);
  return x;
}

export function skillLevel(s: GameState, skill: SkillId) {
  return LEVEL.levelFromXp(sectorXp(s, skill));
}

/** `later`: c'è già un altro messaggio (es. il lavoro che si evolve): questo arriva subito dopo. */
function sectorLevelUp(s: GameState, skill: SkillId, before: number, later = false) {
  const after = skillLevel(s, skill);
  if (after > before) {
    const show = () => toast(`${SKILLS[skill].icon} ${SKILLS[skill].name} livello ${after}!`, 'good');
    if (later) setTimeout(show, 3300);
    else show();
    bus.emit('levelup', skill);
  }
}

/** Esperienza del lavoro nelle attività (cucinare, servire, ordini…): conta per il settore. */
export function addXp(s: GameState, skill: SkillId, amount: number) {
  const before = skillLevel(s, skill);
  s.xp[skill] += amount;
  sectorLevelUp(s, skill, before);
  bus.emit('stats');
}

/**
 * Esperienza di un lavoretto: sale la sua linea (e con lei il settore). Ogni 10 livelli la linea si
 * evolve: le persone cominciano a offrire la versione nuova del lavoro.
 */
export function addJobXp(s: GameState, line: string, amount: number) {
  const l = careerLine(line);
  if (!l) return;
  const sector = skillLevel(s, l.sector);
  const before = lineLevel(s, line);
  s.jobXp ??= {};
  s.jobXp[line] = lineXp(s, line) + amount;
  const after = lineLevel(s, line);
  if (after > before) {
    const step = Math.floor(after / EVOLVE_EVERY);
    const next = step > Math.floor(before / EVOLVE_EVERY) ? l.ladder[step] : undefined;
    toast(next ? `${l.icon} ${l.name} livello ${after}: ora ti offrono "${next}"!` : `${l.icon} ${l.name} livello ${after}`, 'good');
  }
  sectorLevelUp(s, l.sector, sector, after > before);
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
