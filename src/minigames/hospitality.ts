import type { Game } from '../game';
import { rungOf, rungProgress } from '../config/careers';
import type { JobOffer } from '../sim/state';
import type { Slot } from '../world/city';
import type { JobRun } from './jobs';
import { beats, DragRun, PourRun, RhythmRun, SHAPES, StackRun, TraceRun, type DragItem, type DragSlot, type PourStep, type TraceItem } from './finger';
import { barJob, conciergeJob, cookLineJob, facchinoJob, gardenPartyJob, housekeepingJob, ovenJob, restaurantJob, suiteJob } from './hospitality3d';

/**
 * Lavoretti di Ristorazione e ospitalità (tabella in CARRIERE.md): Cucina, Sala, Ospitalità, Bar, Forno e
 * pasticceria. Quelli col dito usano i motori di minigames/finger.ts, quelli in 3D minigames/hospitality3d.ts.
 * Quanto cresce dentro un gradino lo dice `rungProgress` (0 → 1 nei 9 livelli).
 */

const pickN = <T>(a: T[], n: number) => [...a].sort(() => Math.random() - 0.5).slice(0, n);

// ---------------- Cucina ----------------

/** Aiuto cuoco: tagli lungo le linee, poi la ciotola giusta. */
function prepCook(game: Game, t: number, title: string) {
  const ingr = pickN([{ i: '🥕', n: 'Carota' }, { i: '🧅', n: 'Cipolla' }, { i: '🥒', n: 'Cetriolo' }, { i: '🍅', n: 'Pomodoro' }, { i: '🫑', n: 'Peperone' }, { i: '🍆', n: 'Melanzana' }], t < 0.5 ? 3 : 4);
  const items: TraceItem[] = ingr.map((x) => ({
    name: `Taglia: ${x.n}`, back: 'board', icon: x.i, paths: SHAPES.cuts(t < 0.4 ? 2 : 3), ink: '#ffffff',
    bowl: { right: x.i, options: pickN([x.i, ...pickN(ingr.filter((y) => y !== x).map((y) => y.i), 2)], 3) },
  }));
  return new TraceRun(game, title, items, {
    tol: 0.065 - 0.02 * t, time: 40 + items.length * 22, icon: '🔪', phase: 'Taglia gli ingredienti',
    tip: '<b>Trascina il dito</b> lungo le linee tratteggiate per tagliare (più sei preciso, meglio è), poi tocca la <b>ciotola</b> con lo stesso ingrediente',
  });
}

/** Cuoco dal vivo: tre piatti a ritmo, col flambé. */
function liveCook(game: Game, t: number, title: string) {
  const gap = 0.78 - 0.22 * t;
  const dishes = pickN([['Pasta saltata', '🍝'], ['Gamberi flambé', '🍤'], ['Wok di verdure', '🥘'], ['Crêpe Suzette', '🥞']], 3);
  return new RhythmRun(game, title, dishes.map(([n, i]) => ({ name: n, icon: i, notes: beats(9, gap, 1) })), {
    speed: 220 + 80 * t, icon: '🍳', tip: '<b>Tocca</b> quando il segno arriva sul <b>cerchio</b> per saltare la padella; i segni gialli 🔥 sono il <b>flambé</b>: tieni premuto finché finiscono',
  });
}

const PLATE_POS: [number, number][] = [[0.5, 0.32], [0.3, 0.5], [0.7, 0.5], [0.5, 0.68], [0.36, 0.33], [0.64, 0.67]];
/** Il piatto o la torta da copiare: icone nelle loro posizioni, in piccolo. */
function photo(kind: 'plate' | 'cake', parts: { icon: string; pos: [number, number] }[]) {
  const bg = kind === 'plate' ? 'background:#fff;border:3px solid #ddd' : 'background:#f7c6d9;border:3px solid #f2a7c3';
  return `<div class="dg-photo" style="${bg}">${parts.map((p) => `<span style="left:${p.pos[0] * 100}%;top:${p.pos[1] * 100}%">${p.icon}</span>`).join('')}</div><div class="dg-ref-l">📷 Come nella foto</div>`;
}

/** Disposizione uguale alla foto: un posto per ogni elemento, l'elemento giusto per ogni posto. */
function copyPhoto(game: Game, title: string, kind: 'plate' | 'cake', icons: string[], opts: { time: number; phase: string; icon: string; tip: string; cook?: { label: string; rounds: number; speed: number } }) {
  const pos = pickN(PLATE_POS, icons.length);
  const parts = icons.map((icon, k) => ({ icon, pos: pos[k] }));
  const slots: DragSlot[] = parts.map((p, k) => ({ id: 's' + k, x: p.pos[0], y: p.pos[1], size: 0.2 }));
  const items: DragItem[] = parts.map((p, k) => ({ id: 'i' + k, icon: p.icon, ok: (s) => parts[+s.id.slice(1)].icon === p.icon }));
  return new DragRun(game, title, { slots, items, board: kind, ref: photo(kind, parts), ...opts });
}

function chef(game: Game, t: number, title: string) {
  const n = Math.round(4 + 2 * t);
  return copyPhoto(game, title, 'plate', pickN(['🥩', '🥔', '🥕', '🌿', '🍅', '🧅', '🍋', '🫛'], n), {
    time: 60 + n * 14, phase: 'Impiatta come nella foto', icon: '🍽️',
    tip: 'Trascina ogni elemento nel cerchio dove sta nella <b>foto</b> in alto. Quando hai finito tocca <b>Fatto</b>',
    cook: { label: 'Cottura della carne', rounds: t < 0.5 ? 1 : 2, speed: 0.9 + 0.6 * t },
  });
}

// ---------------- Sala ----------------

function catering(game: Game, t: number, title: string) {
  const n = Math.round(6 + 3 * t);
  const grid: [number, number][] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) grid.push([0.2 + c * 0.3, 0.2 + r * 0.3]);
  const pos = pickN(grid, n);
  const food = pickN(['🥗', '🍤', '🧀', '🍰', '🥖', '🍇', '🍣', '🥟', '🍢'], n);
  const parts = food.map((icon, k) => ({ icon, pos: pos[k] }));
  const ref = `<div class="dg-photo dg-schema">${parts.map((p) => `<span style="left:${p.pos[0] * 100}%;top:${p.pos[1] * 100}%">${p.icon}</span>`).join('')}</div><div class="dg-ref-l">📋 Schema del buffet</div>`;
  return new DragRun(game, title, {
    slots: parts.map((p, k) => ({ id: 's' + k, x: p.pos[0], y: p.pos[1], size: 0.22 })),
    items: parts.map((p, k) => ({ id: 'i' + k, icon: p.icon, ok: (s) => parts[+s.id.slice(1)].icon === p.icon })),
    board: 'table', ref, time: 35 + n * 10, phase: 'Prepara il buffet', icon: '🍱',
    tip: 'Trascina ogni vassoio al suo posto sul tavolo, <b>uguale allo schema</b> in alto. Poi <b>Fatto</b>',
  });
}

/** Maître: tavoli con posti e caratteristiche, gruppi che chiedono; c'è sempre una sistemazione perfetta. */
function maitre(game: Game, t: number, title: string) {
  const n = Math.round(4 + 2 * t);
  const feats = [{ k: 'win', i: '🪟', n: 'finestra' }, { k: 'quiet', i: '🤫', n: 'tranquillo' }];
  const seats = [2, 2, 4, 4, 6, 6, 4, 2];
  const tables = Array.from({ length: n + 1 }, (_, i) => ({ id: 't' + i, seats: seats[i % seats.length], feat: Math.random() < 0.5 ? feats[Math.floor(Math.random() * 2)] : null }));
  const groups = pickN(tables, n).map((tb, i) => ({ id: 'g' + i, size: Math.max(1, tb.seats - (Math.random() < 0.5 ? 1 : 0)), wish: tb.feat && Math.random() < 0.7 ? tb.feat : null }));
  const pos: [number, number][] = [[0.18, 0.2], [0.5, 0.2], [0.82, 0.2], [0.18, 0.52], [0.5, 0.52], [0.82, 0.52], [0.18, 0.84], [0.5, 0.84], [0.82, 0.84]];
  return new DragRun(game, title, {
    slots: tables.map((tb, i) => ({ id: tb.id, x: pos[i][0], y: pos[i][1], size: 0.24, label: `🪑${tb.seats}${tb.feat ? ' ' + tb.feat.i : ''}` })),
    items: groups.map((gr) => ({
      id: gr.id, icon: '👥', label: `${gr.size} pers.${gr.wish ? ' ' + gr.wish.i : ''}`,
      ok: (s) => {
        const tb = tables.find((x) => x.id === s.id)!;
        return tb.seats >= gr.size && tb.seats - gr.size <= 2 && (!gr.wish || tb.feat?.k === gr.wish.k);
      },
    })),
    board: 'floor', time: 40 + n * 14, phase: 'Fai sedere i gruppi', icon: '🎩',
    tip: 'Trascina ogni gruppo su un tavolo con <b>abbastanza posti</b> (senza sprecarne troppi) e, se lo chiede, vicino alla <b>finestra 🪟</b> o <b>tranquillo 🤫</b>',
  });
}

function gala(game: Game, t: number, title: string) {
  const gap = 0.8 - 0.25 * t;
  return new RhythmRun(game, title, [['Antipasto', '🥂'], ['Primo', '🍝'], ['Dolce', '🍰']].map(([n, i]) => ({ name: n, icon: i, notes: beats(8, gap, 0) })), {
    speed: 220 + 80 * t, icon: '🍽️', tip: 'Tutti i camerieri servono insieme: <b>tocca</b> quando il segno arriva sul <b>cerchio</b>',
  });
}

// ---------------- Ospitalità ----------------

/** Receptionist: camere con letti, vista e piano; ogni ospite chiede qualcosa e c'è sempre una camera giusta. */
function reception(game: Game, t: number, title: string) {
  const n = Math.round(4 + 2 * t);
  const rooms = Array.from({ length: n + 2 }, (_, i) => ({
    id: 'r' + i, num: 101 + i + Math.floor(i / 3) * 97, bed: Math.random() < 0.5 ? '🛏️' : '🛏️🛏️', view: Math.random() < 0.5 ? '🌊' : '🏙️', high: Math.random() < 0.5,
  }));
  const guests = pickN(rooms, n).map((r, i) => {
    // chiede 2 cose (3 ai livelli alti) tra quelle della camera
    const asks = pickN(['bed', 'view', 'high'], t < 0.5 ? 2 : 3);
    return { id: 'g' + i, r, asks };
  });
  const pos = (i: number): [number, number] => [0.18 + (i % 3) * 0.32, 0.18 + Math.floor(i / 3) * 0.3];
  const ask = (g: (typeof guests)[number]) => g.asks.map((a) => (a === 'bed' ? g.r.bed : a === 'view' ? g.r.view : g.r.high ? '⬆️' : '⬇️')).join(' ');
  return new DragRun(game, title, {
    slots: rooms.map((r, i) => ({ id: r.id, x: pos(i)[0], y: pos(i)[1], size: 0.26, label: `${r.num} ${r.bed} ${r.view} ${r.high ? '⬆️' : '⬇️'}` })),
    items: guests.map((g) => ({
      id: g.id, icon: '🧳', label: ask(g),
      ok: (s) => {
        const r = rooms.find((x) => x.id === s.id)!;
        return g.asks.every((a) => (a === 'bed' ? r.bed === g.r.bed : a === 'view' ? r.view === g.r.view : r.high === g.r.high));
      },
    })),
    board: 'rooms', time: 40 + n * 15, phase: 'Dai le camere agli ospiti', icon: '🗝️',
    tip: 'Ogni ospite chiede qualcosa: <b>🛏️</b> letto matrimoniale o <b>🛏️🛏️</b> due letti, vista <b>🌊 mare</b> o <b>🏙️ città</b>, piano <b>⬆️ alto</b> o <b>⬇️ basso</b>. Trascinalo su una camera che ha tutto',
  });
}

// ---------------- Bar ----------------

function latteArt(game: Game, t: number, title: string) {
  const pool: { name: string; paths: () => [number, number][][] }[] = [
    { name: 'Cuore', paths: () => [SHAPES.heart()] },
    { name: 'Foglia', paths: () => SHAPES.leaf() },
    { name: 'Cigno', paths: () => SHAPES.swan() },
  ];
  const n = t < 0.5 ? 2 : 3;
  const pick = t < 0.3 ? [pool[0], pool[1]] : pickN(pool, n);
  return new TraceRun(game, title, pick.slice(0, n).map((p) => ({ name: p.name, back: 'cup', paths: p.paths(), ink: '#fffaf0' })), {
    tol: 0.06 - 0.015 * t, time: 30 + n * 22, icon: '🎨', phase: 'Disegna sulla schiuma',
    tip: 'Col dito <b>segui il disegno</b> sulla schiuma del cappuccino: più sei preciso, più è bello',
  });
}

function barman(game: Game, t: number, title: string) {
  const recipes: { n: string; i: string; parts: [string, string, number][] }[] = [
    { n: 'Mojito', i: '🍹', parts: [['Rum', '#f3e6c4', 0.3], ['Soda', '#dff6ff', 0.75], ['Lime', '#b9e86b', 0.85]] },
    { n: 'Spritz', i: '🥂', parts: [['Aperitivo', '#ff7a3d', 0.35], ['Prosecco', '#ffe9a8', 0.8]] },
    { n: 'Cuba libre', i: '🥃', parts: [['Rum', '#f3e6c4', 0.3], ['Cola', '#5a2c12', 0.85]] },
    { n: 'Piña colada', i: '🍍', parts: [['Rum', '#f3e6c4', 0.25], ['Ananas', '#ffe066', 0.65], ['Cocco', '#ffffff', 0.85]] },
  ];
  const steps: PourStep[] = [];
  for (const r of pickN(recipes, t < 0.5 ? 2 : 3)) {
    r.parts.forEach(([name, color, to], k) => steps.push({ name: `${r.i} ${r.n}: ${name}`, icon: '🍾', color, to, tol: 0.05 - 0.015 * t, rate: 0.32 + 0.12 * t, fresh: k === 0, vessel: 'glass' }));
  }
  return new PourRun(game, title, steps, {
    time: 30 + steps.length * 12, icon: '🍸', phase: 'Prepara i cocktail',
    tip: '<b>Tieni premuto</b> per versare e <b>lascia</b> quando arrivi alla <b>tacca rossa</b>, un ingrediente alla volta',
  });
}

function flair(game: Game, t: number, title: string) {
  const gap = 0.75 - 0.25 * t;
  return new RhythmRun(game, title, [['Lancio', '🍾'], ['Doppio giro', '🤹'], ['Gran finale', '🍸']].map(([n, i]) => ({ name: n, icon: i, notes: beats(8, gap, 1) })), {
    speed: 230 + 90 * t, icon: '🍾', tip: '<b>Tocca</b> a tempo per lanciare e riprendere la bottiglia; i segni gialli si <b>tengono premuti</b>',
  });
}

function sommelier(game: Game, t: number, title: string) {
  const wines = [
    { id: 'rosso', icon: '🍷', label: 'Rosso corposo', color: '#7a1e2c' },
    { id: 'bianco', icon: '🥂', label: 'Bianco fresco', color: '#f6e7a4' },
    { id: 'bolle', icon: '🍾', label: 'Bollicine', color: '#fff1c4' },
    { id: 'dolce', icon: '🍯', label: 'Vino dolce', color: '#e8a33c' },
  ];
  const dishes = [
    { n: 'Bistecca', i: '🥩', w: 'rosso' }, { n: 'Pesce al forno', i: '🐟', w: 'bianco' }, { n: 'Antipasto di festa', i: '🦐', w: 'bolle' },
    { n: 'Torta al cioccolato', i: '🍰', w: 'dolce' }, { n: 'Formaggi stagionati', i: '🧀', w: 'rosso' },
  ];
  const steps: PourStep[] = pickN(dishes, 3).map((d) => {
    const right = wines.find((x) => x.id === d.w)!;
    return {
      name: `${d.i} ${d.n}`, icon: '🍷', color: right.color, to: 0.42, tol: 0.06 - 0.02 * t, rate: 0.3 + 0.1 * t, fresh: true, vessel: 'wine',
      choice: { right: d.w, prompt: 'Quale vino con questo piatto?', options: wines.map((w) => ({ id: w.id, icon: w.icon, label: w.label })) },
    };
  });
  return new PourRun(game, title, steps, {
    time: 40 + steps.length * 20, icon: '🍷', phase: 'Abbina e versa il vino',
    tip: 'Scegli il <b>vino adatto</b> al piatto (carne → rosso, pesce → bianco, festa → bollicine, dolce → vino dolce), poi <b>tieni premuto</b> e lascia alla <b>tacca</b>',
  });
}

// ---------------- Forno e pasticceria ----------------

function pastry(game: Game, t: number, title: string) {
  const pool: TraceItem[] = [
    { name: 'Crostata', back: 'cake', paths: [SHAPES.spiral()], ink: '#ffffff' },
    { name: 'Bignè', back: 'eclair', paths: [SHAPES.zigzag()], ink: '#5a2c12' },
    { name: 'Torta alla panna', back: 'cake', paths: [SHAPES.ring()], ink: '#ffffff' },
    { name: 'Cuore di fragola', back: 'cake', paths: [SHAPES.heart()], ink: '#e5484d' },
  ];
  const n = t < 0.5 ? 3 : 4;
  return new TraceRun(game, title, pickN(pool, n), {
    tol: 0.06 - 0.015 * t, time: 30 + n * 18, icon: '🧁', phase: 'Decora i dolci',
    tip: 'Con la <b>sac à poche</b>: trascina il dito <b>seguendo il disegno</b> sul dolce',
  });
}

function cakeOrder(game: Game, t: number, title: string) {
  const n = Math.round(4 + 2 * t);
  return copyPhoto(game, title, 'cake', pickN(['🍓', '🫐', '🍒', '🌸', '🕯️', '🍫', '🍋', '🥝'], n), {
    time: 40 + n * 12, phase: 'Decora come nella foto', icon: '🎂',
    tip: 'Trascina ogni decorazione nel cerchio dove sta nella <b>foto</b> in alto, poi <b>Fatto</b>',
  });
}

function weddingCake(game: Game, t: number, title: string) {
  return new StackRun(game, title, { tiers: 3, speed: 1.6 + 1.2 * t, time: 70 });
}

function chocolate(game: Game, t: number, title: string) {
  const molds = t < 0.5 ? 2 : 3;
  const steps: PourStep[] = Array.from({ length: molds }, (_, k) => ({
    name: `Stampo ${k + 1}`, icon: '🍫', color: '#5a2c12', to: 0.7, tol: 0.06 - 0.02 * t, rate: 0.35, fresh: true, vessel: 'mold',
    temper: k === 0 ? 4 + 2 * t : undefined,
  }));
  return new PourRun(game, title, steps, {
    time: 45 + molds * 15, icon: '🍫', phase: 'Tempera e versa il cioccolato',
    tip: 'Prima la <b>temperatura</b>: tieni premuto per scaldare e lascia per raffreddare, tienila nel <b>verde</b>. Poi versa negli stampi fino alla <b>tacca</b>',
  });
}

// ---------------- avvio ----------------

/** Avvia il lavoretto di Ristorazione e ospitalità giusto per linea e gradino (null se non è di qui). */
export function startHospitalityJob(game: Game, offer: JobOffer, slot: Slot, title: string): JobRun | null {
  const lv = offer.level;
  const r = rungOf(offer.type, lv);
  const t = rungProgress(offer.type, lv);
  const placed = game.city.placed;
  switch (offer.type) {
    case 'piatti':
      return [null, () => prepCook(game, t, title), () => cookLineJob(game, lv, slot, placed, title), () => liveCook(game, t, title), () => chef(game, t, title)][r]?.() ?? null;
    case 'festa':
      return [() => gardenPartyJob(game, lv, slot, placed, title), () => catering(game, t, title), () => restaurantJob(game, lv, slot, placed, title), () => maitre(game, t, title), () => gala(game, t, title)][r]();
    case 'hotel':
      return [() => facchinoJob(game, lv, slot, placed, title), () => housekeepingJob(game, lv, slot, placed, title), () => reception(game, t, title), () => conciergeJob(game, lv, slot, placed, title), () => suiteJob(game, lv, slot, placed, title)][r]();
    case 'bar':
      return [() => barJob(game, lv, slot, placed, title), () => latteArt(game, t, title), () => barman(game, t, title), () => flair(game, t, title), () => sommelier(game, t, title)][r]();
    case 'forno':
      return [() => ovenJob(game, lv, slot, placed, title), () => pastry(game, t, title), () => cakeOrder(game, t, title), () => weddingCake(game, t, title), () => chocolate(game, t, title)][r]();
  }
  return null;
}
