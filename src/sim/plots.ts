import { OWN_CREW_DISCOUNT, plotDef, SIZES, WORKS, ZONE_COST, type SizeId, type WorkId } from '../config/plots';
import { bizType } from '../config/business';
import { LOTS } from '../config/map';
import { bizAtLot, lotZone } from './economy';
import type { GameState, PlotState } from './state';

/**
 * Terreni e palazzi (config/plots.ts). Tutto si ricava dai minuti di gioco: un lavoro è finito quando
 * `s.minutes` supera la sua fine, il palazzo quando supera `buildEnd` (vale anche offline, niente da aggiornare).
 */

/** a che punto è il terreno: in vendita → lavori da fare → pronto per costruire → cantiere → palazzo finito */
export type PlotStage = 'sale' | 'works' | 'ready' | 'building' | 'built';

export const plotState = (s: GameState, id: string): PlotState | undefined => s.plots?.[id];

/** la zona del terreno (la mette la città: è quella dei suoi piani) */
export const plotZone = (id: string) => lotZone[`${id}-p1`] ?? 'periferia';

export function workStatus(s: GameState, id: string, w: WorkId): 'todo' | 'doing' | 'done' {
  const end = plotState(s, id)?.works[w];
  return end === undefined ? 'todo' : s.minutes >= end ? 'done' : 'doing';
}

/** il lavoro in corso sul terreno (uno alla volta) */
export const workDoing = (s: GameState, id: string) => plotDef(id)?.works.find((w) => workStatus(s, id, w) === 'doing') ?? null;

export function plotStage(s: GameState, id: string): PlotStage {
  const ps = plotState(s, id);
  const def = plotDef(id);
  if (!ps || !def) return 'sale';
  if (ps.size && ps.buildEnd !== undefined) return s.minutes >= ps.buildEnd ? 'built' : 'building';
  return def.works.every((w) => workStatus(s, id, w) === 'done') ? 'ready' : 'works';
}

/** hai un'impresa che sa fare i lavori del terreno (costruzioni o ristrutturazioni): costano la metà */
export const ownCrew = (s: GameState) => s.businesses.some((b) => {
  const sec = bizType(b.type).sector;
  return sec === 'manualita' || sec === 'artigianato';
});

export const workCost = (s: GameState, id: string, w: WorkId) =>
  Math.round((WORKS[w].cost * ZONE_COST[plotZone(id)] * (ownCrew(s) ? OWN_CREW_DISCOUNT : 1)) / 10) * 10;

export const buildCost = (id: string, size: SizeId) => Math.round((SIZES[size].cost * ZONE_COST[plotZone(id)]) / 100) * 100;

/** negozi della città ancora liberi: i terreni si comprano solo quando sono tutti tuoi (ultima spiaggia) */
export const shopsLeft = (s: GameState) => LOTS.filter((l) => l.kind === 'shop' && !bizAtLot(s, l.id)).length;
export const plotsOpen = (s: GameState) => shopsLeft(s) === 0;

export function buyPlot(s: GameState, id: string) {
  const def = plotDef(id);
  if (!def || plotState(s, id) || s.money < def.price || !plotsOpen(s)) return false;
  s.money -= def.price;
  (s.plots ??= {})[id] = { works: {} };
  return true;
}

export function startWork(s: GameState, id: string, w: WorkId) {
  const ps = plotState(s, id);
  const cost = workCost(s, id, w);
  if (!ps || workStatus(s, id, w) !== 'todo' || workDoing(s, id) || s.money < cost) return false;
  s.money -= cost;
  ps.works[w] = s.minutes + WORKS[w].hours * 60;
  return true;
}

export function startBuild(s: GameState, id: string, size: SizeId) {
  const ps = plotState(s, id);
  const cost = buildCost(id, size);
  if (!ps || plotStage(s, id) !== 'ready' || s.money < cost) return false;
  s.money -= cost;
  ps.size = size;
  ps.buildEnd = s.minutes + SIZES[size].days * 1440;
  return true;
}

/** quanto manca (minuti) alla fine del lavoro o del cantiere in corso */
export function plotLeft(s: GameState, id: string) {
  const ps = plotState(s, id);
  if (!ps) return 0;
  if (ps.buildEnd !== undefined) return Math.max(0, ps.buildEnd - s.minutes);
  const w = workDoing(s, id);
  return w ? Math.max(0, ps.works[w]! - s.minutes) : 0;
}

/** "3 h 20 min" / "2 g 4 h" */
export function leftText(min: number) {
  const m = Math.ceil(min);
  if (m >= 1440) return `${Math.floor(m / 1440)} g ${Math.floor((m % 1440) / 60)} h`;
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${m} min`;
}

/** firma dello stato di tutti i terreni: se cambia, la città li ridisegna (lavoro finito, palazzo pronto…) */
export const plotsSignature = (s: GameState) =>
  Object.keys(s.plots ?? {}).map((id) => `${id}:${plotStage(s, id)}:${workDoing(s, id) ?? ''}:${Object.keys(s.plots![id].works).length}:${floorsUp(s, id)}`).join('|');

/** cantiere: quanti piani sono già su (il palazzo cresce in città mentre passano i giorni) */
export function floorsUp(s: GameState, id: string) {
  const ps = plotState(s, id);
  if (!ps?.size || ps.buildEnd === undefined) return 0;
  const z = SIZES[ps.size];
  return Math.max(1, Math.round(z.shops * Math.min(1, 1 - plotLeft(s, id) / (z.days * 1440))));
}
