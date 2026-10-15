import * as THREE from 'three';
import type { Game } from '../game';
import { rungProgress } from '../config/careers';
import { toast } from '../sim/bus';
import { CHAR_MODELS } from '../sim/economy';
import { Character } from '../world/character';
import type { Slot } from '../world/city';
import { canvasTexture, label } from '../world/props';
import { Arena } from './arena';
import { PhasedRun, type Phase, type Task } from './jobs';
import { crate } from './warehouse';
import { Room } from './room';

/**
 * Lavoretti in 3D di Ristorazione e ospitalità (prima persona, in un locale: vedi Room). Le postazioni da usare
 * più volte (frigo, fuochi, forno, macchina del caffè) sono punti `repeat`; gli errori si possono fare e
 * contano alla fine (piatto crudo o bruciato, bevanda sbagliata, valigia alla porta sbagliata…): la qualità
 * media decide le stelle massime, il tempo le altre.
 */

type Placed = { path: string; m: THREE.Matrix4 }[];
const hold = (game: Game, obj?: THREE.Object3D) => game.player.hold(obj);
const pickN = <T>(a: T[], n: number) => [...a].sort(() => Math.random() - 0.5).slice(0, n);

/** Stelle massime dalla qualità media (1 = tutto perfetto). */
function capFrom(qs: number[]) {
  if (!qs.length) return 3;
  const q = qs.reduce((a, b) => a + b, 0) / qs.length;
  return q >= 0.85 ? 3 : q >= 0.6 ? 2 : 1;
}

/** Cartellino fisso sopra una postazione (nome e icona), piccolo: non è un indicatore che salta. */
function tag(run: PhasedRun, text: string, at: THREE.Vector3, y = 2.1, bg = '#ffffff') {
  const s = label(text, { bg, fg: bg === '#ffffff' ? '#3a2f55' : '#fff', scale: 0.62 });
  s.userData.noGlow = true;
  return run.prop(s, at.clone().setY(y), 0, 1);
}

/**
 * Barra di cottura sopra una padella o un forno: si riempie col tempo; verde = pronto, poi rosso = bruciato.
 * Disegnata su un canvas che si aggiorna (niente sprite nuovi a ogni fotogramma).
 */
function cookBar(run: PhasedRun, at: THREE.Vector3) {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 48;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(0.9, 0.27, 1);
  sp.renderOrder = 11;
  sp.userData.noGlow = true;
  run.prop(sp, at.clone(), 0, 1);
  sp.visible = false;
  return {
    sprite: sp,
    /** k = tempo / tempo di cottura (1 = pronto); green fino a 1,4, poi bruciato */
    set(icon: string, k: number) {
      sp.visible = true;
      g.clearRect(0, 0, 160, 48);
      g.fillStyle = 'rgba(255,255,255,.95)';
      g.beginPath();
      g.roundRect(0, 0, 160, 48, 12);
      g.fill();
      g.font = '30px sans-serif';
      g.textBaseline = 'middle';
      g.fillText(icon, 6, 26);
      g.fillStyle = '#ddd';
      g.fillRect(46, 18, 104, 14);
      // zona verde (pronto) tra 1 e 1,4 della barra lunga 1,7
      g.fillStyle = 'rgba(53,196,106,.45)';
      g.fillRect(46 + (104 * 1) / 1.7, 18, (104 * 0.4) / 1.7, 14);
      g.fillStyle = k < 1 ? '#ffc21a' : k <= 1.4 ? '#35c46a' : '#e5484d';
      g.fillRect(46, 18, Math.min(104, (104 * k) / 1.7), 14);
      tex.needsUpdate = true;
    },
    hide() {
      sp.visible = false;
    },
  };
}

/** Qualità di una cottura: crudo prima di 1, perfetto tra 1 e 1,4, poi bruciato. */
const cookQuality = (k: number) => (k < 0.8 ? 0.2 : k < 1 ? 0.6 : k <= 1.4 ? 1 : k <= 1.7 ? 0.5 : 0.1);
const cookWord = (k: number) => (k < 1 ? '🥩 Era ancora crudo' : k <= 1.4 ? '✨ Cottura perfetta' : '🔥 Un po\' bruciato');

/** Fumetto sopra un personaggio (cosa vuole): uno sprite che si può cambiare. */
function bubble(run: PhasedRun, ch: Character, text: string) {
  const s = label(text, { bg: '#ffffff', fg: '#3a2f55', scale: 0.75 });
  s.position.set(0, 2.25, 0);
  s.userData.noGlow = true;
  ch.root.add(s);
  void run;
  return s;
}

function npc(run: PhasedRun, at: THREE.Vector3, k: number, face = 0) {
  const c = new Character(CHAR_MODELS[k % CHAR_MODELS.length]);
  c.root.position.copy(at);
  c.root.rotation.y = face;
  run.prop(c.root, at.clone(), face, 1).userData.noGlow = true;
  return c;
}

// ======================================================================================
// Cucina: cuoco di linea
// ======================================================================================

const DISHES = [
  { icon: '🥩', name: 'bistecca', cook: 7 },
  { icon: '🍳', name: 'frittata', cook: 5 },
  { icon: '🍗', name: 'pollo', cook: 9 },
  { icon: '🐟', name: 'pesce', cook: 6 },
];

/**
 * Cuoco di linea: le comande arrivano una dopo l'altra. Frigo → padella libera → quando la barra è verde la
 * togli (prima è crudo, dopo brucia) → passe. Più padelle cuociono insieme mentre prendi altro dal frigo.
 */
export function cookLineJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('piatti', lineLevel);
  const n = Math.round(3 + 2 * t);
  const nStoves = t < 0.4 ? 2 : 3;
  const room = game.enterArena(new Room({ w: 9, d: 7, tiles: true, sign: '🍳 Cucina', slot, placed }));
  const orders = Array.from({ length: n }, () => DISHES[Math.floor(Math.random() * DISHES.length)]);
  let next = 0;
  let served = 0;
  const qs: number[] = [];
  let holding: { dish: (typeof DISHES)[number]; k: number | null } | null = null;
  let run: PhasedRun;
  const fridge = room.furn('kitchenFridgeLarge', -3.6, -2.9, 0, 1.5);
  const stoves = Array.from({ length: nStoves }, (_, i) => {
    const f = room.furn('kitchenStove', -1.6 + i * 1.3, -3.0, 0);
    return { pos: room.at(-1.6 + i * 1.3, -2.5), obj: f.obj, top: f.top, dish: null as (typeof DISHES)[number] | null, time: 0, bar: null as ReturnType<typeof cookBar> | null };
  });
  const passRow = room.furnRow('kitchenCabinet', -1.7, 0.3, 3.4, false, -Math.PI / 2);
  const pass = passRow[Math.floor(passRow.length / 2)];
  room.furn('kitchenSink', 2.2, -3.0, 0);
  const fridgeAt = room.at(-3.6, -2.2);
  const passAt = room.at(2.7, -0.7);
  const phases: Phase[] = [{
    name: 'Cucina le comande', icon: '🍳', count: () => [served, n],
    tip: 'Prendi dal <b>frigo</b>, metti su un <b>fuoco</b> libero e togli quando la barra è <b>verde</b> (prima è crudo, dopo brucia). Porta il piatto al <b>passe 🛎️</b>. Puoi cuocere più cose insieme',
    tasks: () => [
      {
        pos: fridgeAt, kind: 'tap', repeat: true, quiet: true, label: 'Prendi dal frigo', icon: '🧊', obj: fridge.obj,
        // solo se c'è un fuoco libero: con l'ingrediente in mano e i fuochi pieni resteresti bloccato
        enabled: () => !holding && next < n && stoves.some((x) => !x.dish),
        onDone: () => {
          const d = orders[next++];
          holding = { dish: d, k: null };
          hold(game, crate(0.3, 0xe5a0a0));
          toast(`📝 Comanda: ${d.icon} ${d.name}`, 'info');
        },
      },
      ...stoves.map((st, i): Task => ({
        pos: st.pos, kind: 'tap', repeat: true, quiet: true, label: `Fuoco ${i + 1}`, icon: '🔥', obj: st.obj,
        enabled: () => (!!holding && holding.k === null && !st.dish) || (!holding && !!st.dish),
        onDone: () => {
          if (holding && holding.k === null && !st.dish) {
            // in padella
            st.dish = holding.dish;
            st.time = 0;
            holding = null;
            hold(game);
            return;
          }
          if (!holding && st.dish) {
            // tolto dal fuoco: com'è cotto?
            const k = st.time / st.dish.cook;
            holding = { dish: st.dish, k };
            st.dish = null;
            st.bar?.hide();
            hold(game, crate(0.32, 0xffffff));
            toast(cookWord(k), k >= 1 && k <= 1.4 ? 'good' : 'bad');
          }
        },
      })),
      {
        pos: passAt, kind: 'tap', repeat: true, quiet: true, label: 'Porta il piatto al passe', icon: '🛎️', obj: pass.obj,
        enabled: () => !!holding && holding.k !== null,
        onDone: () => {
          qs.push(cookQuality(holding!.k!));
          holding = null;
          hold(game);
          served++;
          run.starCap = capFrom(qs);
          if (served >= n) run.finishPhase();
        },
      },
    ],
  }];
  run = new PhasedRun(game, 1, title, phases, { time: 40 + n * 22 });
  tag(run, '🧊 Frigo', fridgeAt, 2.9);
  stoves.forEach((st, i) => {
    tag(run, `🔥 ${i + 1}`, st.pos, 1.6);
    st.bar = cookBar(run, st.pos.clone().setY(1.95));
  });
  tag(run, '🛎️ Passe', passAt, 1.7, '#e8590c');
  run.onTick = (dt) => {
    for (const st of stoves) {
      if (!st.dish) continue;
      if (!run.frozen) st.time += dt;
      st.bar!.set(st.dish.icon, st.time / st.dish.cook);
    }
  };
  run.extraStatus = () => (holding ? `in mano ${holding.dish.icon}${holding.k === null ? ' crudo' : ' cotto'}` : next < n ? `📝 prossima: ${orders[next].icon}` : '');
  return run;
}

// ======================================================================================
// Forno: panettiere notturno
// ======================================================================================

/**
 * Panettiere: farina → impastatrice (tieni premuto) → banco (dai la forma, tieni premuto) → forno libero;
 * togli quando è dorato (prima crudo, dopo bruciato) → scaffale. Due forni: mentre uno cuoce, impasti l'altro.
 */
export function ovenJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('forno', lineLevel);
  const n = Math.round(3 + 2 * t);
  const room = game.enterArena(new Room({ w: 9, d: 7, floor: 0xd9b48a, wall: 0xf6e7c8, sign: '🥖 Forno', slot, placed }));
  type Stage = 'flour' | 'dough' | 'shaped' | 'baked';
  let holding: { stage: Stage; k?: number } | null = null;
  let started = 0;
  let done = 0;
  const qs: number[] = [];
  let run: PhasedRun;
  const sack = crate(0.6, 0xf3ead7, 0xe8d3a8);
  const flourAt = room.at(-3.5, -2.3);
  const mixer = room.furn('kitchenCabinet', -1.8, -3.0, 0);
  const mixerAt = room.at(-1.8, -2.4);
  const table = room.furn('table', 0, -0.4, 0);
  const tableAt = room.at(0, 0.3);
  const ovens = [0, 1].map((i) => {
    const f = room.furn('kitchenStove', 1.6 + i * 1.3, -3.0, 0);
    return { pos: room.at(1.6 + i * 1.3, -2.4), obj: f.obj, bread: false, time: 0, cook: 8 - 2 * t, bar: null as ReturnType<typeof cookBar> | null };
  });
  const shelf = room.furn('kitchenCabinet', 3.6, 0.6, -Math.PI / 2);
  const shelfAt = room.at(2.9, 0.6);
  const loafM = () => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 4, 8), new THREE.MeshLambertMaterial({ color: 0xd9a05b }));
    m.rotation.z = Math.PI / 2;
    const g = new THREE.Group();
    g.add(m);
    return g;
  };
  const phases: Phase[] = [{
    name: 'Fai il pane', icon: '🥖', count: () => [done, n],
    tip: 'Prendi la <b>farina</b>, <b>impasta</b> (tieni premuto), dai la <b>forma</b> al banco (tieni premuto) e metti in un <b>forno</b> libero. Togli quando la barra è <b>verde</b> e metti sullo <b>scaffale</b>',
    tasks: () => [
      // solo se c'è un forno libero (col pane in mano e i forni pieni resteresti bloccato)
      { pos: flourAt, kind: 'tap', repeat: true, quiet: true, label: 'Prendi la farina', icon: '🌾', enabled: () => !holding && started < n && ovens.some((x) => !x.bread), onDone: () => { holding = { stage: 'flour' }; started++; hold(game, crate(0.3, 0xf3ead7)); } },
      { pos: mixerAt, kind: 'hold', sec: 1.8, repeat: true, quiet: true, label: 'Impasta', icon: '🌀', obj: mixer.obj, enabled: () => holding?.stage === 'flour', onDone: () => { holding = { stage: 'dough' }; hold(game, crate(0.28, 0xf6e7c8)); } },
      { pos: tableAt, kind: 'hold', sec: 1.2, repeat: true, quiet: true, label: 'Dai la forma al pane', icon: '🥖', obj: table.obj, enabled: () => holding?.stage === 'dough', onDone: () => { holding = { stage: 'shaped' }; hold(game, loafM()); } },
      ...ovens.map((ov, i): Task => ({
        pos: ov.pos, kind: 'tap', repeat: true, quiet: true, label: `Forno ${i + 1}`, icon: '🔥', obj: ov.obj,
        enabled: () => (holding?.stage === 'shaped' && !ov.bread) || (!holding && ov.bread),
        onDone: () => {
          if (holding?.stage === 'shaped' && !ov.bread) {
            ov.bread = true;
            ov.time = 0;
            holding = null;
            hold(game);
          } else if (!holding && ov.bread) {
            const k = ov.time / ov.cook;
            ov.bread = false;
            ov.bar?.hide();
            holding = { stage: 'baked', k };
            hold(game, loafM());
            toast(k < 1 ? '🥖 Ancora crudo dentro' : k <= 1.4 ? '✨ Dorato al punto giusto' : '🔥 Bruciacchiato', k >= 1 && k <= 1.4 ? 'good' : 'bad');
          }
        },
      })),
      {
        pos: shelfAt, kind: 'tap', repeat: true, quiet: true, label: 'Metti sullo scaffale', icon: '🧺', obj: shelf.obj, enabled: () => holding?.stage === 'baked',
        onDone: () => {
          qs.push(cookQuality(holding!.k!));
          holding = null;
          hold(game);
          done++;
          run.starCap = capFrom(qs);
          if (done >= n) run.finishPhase();
        },
      },
    ],
  }];
  run = new PhasedRun(game, 1, title, phases, { time: 40 + n * 26 });
  run.prop(sack, flourAt.clone().add(new THREE.Vector3(0, 0, -0.5)), 0, 1);
  tag(run, '🌾 Farina', flourAt, 1.4);
  tag(run, '🌀 Impastatrice', mixerAt, 1.7);
  tag(run, '🥖 Banco', tableAt, 1.5);
  ovens.forEach((ov, i) => {
    tag(run, `🔥 Forno ${i + 1}`, ov.pos, 1.6);
    ov.bar = cookBar(run, ov.pos.clone().setY(1.95));
  });
  tag(run, '🧺 Scaffale', shelfAt, 1.7);
  run.onTick = (dt) => {
    for (const ov of ovens) {
      if (!ov.bread) continue;
      if (!run.frozen) ov.time += dt;
      ov.bar!.set('🥖', ov.time / ov.cook);
    }
  };
  run.extraStatus = () => (holding ? `in mano ${{ flour: '🌾', dough: '🫓', shaped: '🥖', baked: '🍞' }[holding.stage]}` : '');
  return run;
}

// ======================================================================================
// Bar: barista
// ======================================================================================

const DRINKS = {
  espresso: { icon: '☕', name: 'caffè' },
  cappuccino: { icon: '🥛', name: 'cappuccino' },
  te: { icon: '🍵', name: 'tè' },
} as const;
type Drink = keyof typeof DRINKS;

/**
 * Barista: i clienti in fila al bancone ordinano (fumetto). Tazza → macchina del caffè (tieni premuto) →
 * per il cappuccino il latte montato; per il tè il bollitore. Si serve il primo della fila: la bevanda
 * sbagliata si può dare, ma conta alla fine.
 */
export function barJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('bar', lineLevel);
  const n = Math.round(4 + 3 * t);
  const room = game.enterArena(new Room({ w: 9, d: 7, tiles: true, wall: 0xe9d8c4, sign: '☕ Bar', slot, placed }));
  const kinds: Drink[] = t < 0.3 ? ['espresso', 'cappuccino'] : ['espresso', 'cappuccino', 'te'];
  const orders: Drink[] = Array.from({ length: n }, () => kinds[Math.floor(Math.random() * kinds.length)]);
  let holding: 'cup' | Drink | 'espresso_milk' | null = null;
  let served = 0;
  const qs: number[] = [];
  let run: PhasedRun;
  // bancone in mezzo: dietro (−z) le macchine, davanti (+z) i clienti
  room.furnRow('kitchenBar', -2.75, 1.25, -0.6, true);
  const cupsAt = room.at(-3.4, -2.2);
  const cups = room.furn('kitchenCabinet', -3.4, -3.0, 0);
  const machine = room.furn('kitchenCoffeeMachine', -1.2, -3.0, 0, 3);
  const machineAt = room.at(-1.2, -2.2);
  const milk = room.furn('kitchenBlender', 0.6, -3.0, 0, 3);
  const milkAt = room.at(0.6, -2.2);
  const kettle = room.furn('toaster', 2.2, -3.0, 0, 3);
  const kettleAt = room.at(2.2, -2.2);
  const serveAt = room.at(0, -1.25);
  // la fila: davanti al bancone
  const queue: Character[] = [];
  const bubbles: THREE.Sprite[] = [];
  const phases: Phase[] = [{
    name: 'Servi i clienti in ordine', icon: '☕', count: () => [served, n],
    tip: 'Guarda cosa chiede il <b>primo della fila</b>: prendi una <b>tazza</b>, fai il caffè alla <b>macchina</b> (tieni premuto). Cappuccino: poi il <b>latte montato</b>. Tè: il <b>bollitore</b>. Poi servi al bancone',
    tasks: () => [
      { pos: cupsAt, kind: 'tap', repeat: true, quiet: true, label: 'Prendi una tazza', icon: '☕', obj: cups.obj, enabled: () => !holding && served < n, onDone: () => { holding = 'cup'; hold(game, crate(0.2, 0xffffff)); } },
      { pos: machineAt, kind: 'hold', sec: 1.4, repeat: true, quiet: true, label: 'Fai il caffè', icon: '⚙️', obj: machine.obj, fx: 'bubble', fxColor: 0x6b3e1e, enabled: () => holding === 'cup', onDone: () => { holding = 'espresso'; } },
      { pos: milkAt, kind: 'hold', sec: 1.2, repeat: true, quiet: true, label: 'Monta il latte', icon: '🥛', obj: milk.obj, fx: 'bubble', enabled: () => holding === 'espresso', onDone: () => { holding = 'cappuccino'; } },
      { pos: kettleAt, kind: 'hold', sec: 1.2, repeat: true, quiet: true, label: 'Acqua calda per il tè', icon: '🍵', obj: kettle.obj, fx: 'bubble', enabled: () => holding === 'cup', onDone: () => { holding = 'te'; } },
      {
        pos: serveAt, kind: 'tap', repeat: true, quiet: true, label: 'Servi il cliente', icon: '🙋', enabled: () => holding === 'espresso' || holding === 'cappuccino' || holding === 'te',
        onDone: () => {
          const want = orders[served];
          const ok = holding === want;
          qs.push(ok ? 1 : 0.2);
          toast(ok ? `${DRINKS[want].icon} Grazie!` : `😕 Volevo un ${DRINKS[want].name}…`, ok ? 'good' : 'bad');
          holding = null;
          hold(game);
          queue[served].root.visible = false;
          bubbles[served].visible = false;
          served++;
          run.starCap = capFrom(qs);
          // la fila avanza
          queue.forEach((c, i) => {
            if (i >= served) c.root.position.copy(room.at(-0.2 + (i - served) * 0.75, 0.5));
          });
          if (served >= n) run.finishPhase();
        },
      },
    ],
  }];
  run = new PhasedRun(game, 1, title, phases, { time: 30 + n * 20 });
  orders.forEach((o, i) => {
    const c = npc(run, room.at(-0.2 + i * 0.75, 0.5), i + 2, Math.PI);
    queue.push(c);
    bubbles.push(bubble(run, c, DRINKS[o].icon));
  });
  tag(run, '☕ Tazze', cupsAt, 1.6);
  tag(run, '⚙️ Macchina', machineAt, 1.9);
  tag(run, '🥛 Latte', milkAt, 1.7);
  if (kinds.includes('te')) tag(run, '🍵 Bollitore', kettleAt, 1.6);
  run.onTick = (dt) => queue.forEach((c) => c.update(dt));
  run.extraStatus = () => (holding ? `in mano ${holding === 'cup' ? '🫖 tazza vuota' : DRINKS[holding as Drink]?.icon ?? ''}` : `🙋 vuole ${DRINKS[orders[Math.min(served, n - 1)]].icon}`);
  return run;
}

// ======================================================================================
// Sala: cameriere a una festa (in giardino)
// ======================================================================================

/**
 * Festa in giardino: al buffet prendi il vassoio (3 bicchieri) e porti da bere agli ospiti che alzano la
 * mano. Correndo col vassoio si rovescia un bicchiere (meno stelle).
 */
export function gardenPartyJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('festa', lineLevel);
  const n = Math.round(5 + 3 * t);
  const arena = game.enterArena(new Arena({ level: 3 + 3 * t, slot, placed }));
  const buffet = arena.entry.clone().add(new THREE.Vector3(-3, 0, -2));
  const spots = arena.scatter(n, 2.6, 1.2, [buffet, arena.entry]);
  let glasses = 0;
  let served = 0;
  let spilled = 0;
  let runT = 0;
  let calling: number[] = [];
  let run: PhasedRun;
  const guests: { c: Character; pos: THREE.Vector3; served: boolean; hand?: THREE.Sprite }[] = [];
  const callNext = () => {
    const wait = guests.map((_g, i) => i).filter((i) => !guests[i].served && !calling.includes(i));
    while (wait.length) {
      const i = wait.splice(Math.floor(Math.random() * wait.length), 1)[0];
      calling.push(i);
      guests[i].hand!.visible = true;
    }
  };
  const phases: Phase[] = [{
    name: 'Servi gli ospiti', icon: '🥂', count: () => [served, n],
    tip: 'Al <b>buffet</b> prendi il vassoio coi bicchieri, poi porta da bere agli ospiti con la <b>mano alzata 🙋</b>. <b>Cammina</b>: correndo il vassoio si rovescia',
    tasks: () => [
      { pos: buffet, kind: 'tap', repeat: true, label: 'Prendi il vassoio coi bicchieri', icon: '🍹', enabled: () => glasses === 0 && served < n, onDone: () => { glasses = 3; hold(game, crate(0.4, 0xffffff)); } },
      ...spots.map((pos, i): Task => ({
        pos, kind: 'tap', repeat: true, label: 'Servi da bere', icon: '🥂', quiet: true,
        enabled: () => glasses > 0 && calling.includes(i),
        onDone: () => {
          glasses--;
          if (!glasses) hold(game);
          guests[i].served = true;
          guests[i].hand!.visible = false;
          calling = calling.filter((x) => x !== i);
          served++;
          if (served >= n) run.finishPhase();
          else callNext();
        },
      })),
    ],
  }];
  run = new PhasedRun(game, 1, title, phases, { time: 30 + n * 16 });
  const tableM = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 0.8), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  tableM.position.y = 0.45;
  const tb = new THREE.Group();
  tb.add(tableM);
  for (let i = 0; i < 6; i++) {
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.18, 8), new THREE.MeshLambertMaterial({ color: [0xff8a3d, 0xffc21a, 0xe5484d][i % 3] }));
    gl.position.set(-0.7 + i * 0.28, 0.99, 0);
    tb.add(gl);
  }
  run.prop(tb, buffet.clone().add(new THREE.Vector3(0, 0, -0.9)), 0, 1).userData.solid = true;
  tag(run, '🍹 Buffet', buffet, 2.1, '#e8590c');
  spots.forEach((pos, i) => {
    const c = npc(run, pos, i + 1, Math.random() * 6);
    const h = bubble(run, c, '🙋 da bere!');
    h.visible = false;
    guests.push({ c, pos, served: false, hand: h });
  });
  callNext();
  run.onTick = (dt) => {
    for (const g of guests) g.c.update(dt);
    // correre col vassoio pieno: dopo poco si rovescia un bicchiere
    const v = game.input.vector;
    if (glasses > 0 && Math.hypot(v.x, v.y) > 0.75) {
      runT += dt;
      if (runT > 1.3) {
        runT = 0;
        glasses--;
        spilled++;
        if (!glasses) hold(game);
        run.starCap = spilled >= 3 ? 1 : spilled >= 1 ? 2 : 3;
        toast(`💦 Hai rovesciato un bicchiere (${spilled}): cammina!`, 'bad');
      }
    } else runT = Math.max(0, runT - dt);
  };
  run.extraStatus = () => `🥂 ${glasses} sul vassoio${spilled ? ` · 💦 ${spilled}` : ''}`;
  return run;
}

// ======================================================================================
// Sala: cameriere al ristorante
// ======================================================================================

/**
 * Cameriere al ristorante: per ogni tavolo prendi l'ordinazione, poi al passe arriva il piatto col numero
 * del tavolo: portalo al tavolo giusto. Dopo un po' il tavolo chiede il conto: prendilo alla cassa e portalo.
 */
export function restaurantJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('festa', lineLevel);
  const n = Math.round(2 + 2 * t);
  const room = game.enterArena(new Room({ w: 10, d: 8, floor: 0xb07a45, wall: 0xf3e3d0, sign: '🍽️ Ristorante', slot, placed }));
  type Tb = { pos: THREE.Vector3; num: number; stage: 'order' | 'wait' | 'ready' | 'eat' | 'bill' | 'done'; time: number; dish: string; cust: Character; bub: THREE.Sprite };
  const dishes = ['🍝', '🍕', '🥗', '🍲', '🐟'];
  const qs: number[] = [];
  let holding: { what: 'dish'; table: number } | { what: 'bill' } | null = null;
  let run: PhasedRun;
  const passAt = room.at(0, -3.0);
  room.furnRow('kitchenCabinet', -1, 1, -3.6, true);
  const regAt = room.at(4.0, -3.0);
  room.furn('desk', 4.0, -3.6, 0);
  const tpos: [number, number][] = [[-3, -0.6], [3, -0.6], [-3, 2.2], [3, 2.2]];
  const tables: Tb[] = [];
  const phases: Phase[] = [{
    name: 'Servi i tavoli', icon: '🍽️', count: () => [tables.filter((x) => x.stage === 'done').length, n],
    tip: 'Al tavolo che chiama prendi l\'<b>ordinazione</b>; al <b>passe</b> prendi il piatto col <b>numero del tavolo</b> e portalo lì. Quando chiede il <b>conto 🧾</b>, prendilo alla <b>cassa</b> e portalo',
    tasks: () => [
      ...tables.map((tb): Task => ({
        pos: tb.pos.clone().add(new THREE.Vector3(0, 0, 1.0)), kind: 'tap', repeat: true, quiet: true, label: `Tavolo ${tb.num}`, icon: '🍽️',
        enabled: () => tb.stage === 'order' || (tb.stage === 'wait' && holding?.what === 'dish') || (tb.stage === 'ready' && holding?.what === 'dish') || (tb.stage === 'bill' && holding?.what === 'bill'),
        onDone: () => {
          if (tb.stage === 'order' && !holding) {
            tb.stage = 'wait';
            tb.time = 0;
            tb.bub.visible = false;
            toast(`📝 Tavolo ${tb.num}: ${tb.dish}`, 'info');
            return;
          }
          if (holding?.what === 'dish') {
            // il piatto di un altro tavolo: si può, ma il cliente non è contento
            const right = holding.table === tb.num;
            qs.push(right ? 1 : 0.3);
            if (!right) toast(`😕 Non è il mio piatto (era del tavolo ${holding.table})`, 'bad');
            const other = tables.find((x) => x.num === (holding as { table: number }).table)!;
            if (!right && other.stage !== 'done') other.stage = 'eat';
            holding = null;
            hold(game);
            tb.stage = 'eat';
            tb.time = 0;
            run.starCap = capFrom(qs);
            return;
          }
          if (holding?.what === 'bill' && tb.stage === 'bill') {
            holding = null;
            hold(game);
            tb.stage = 'done';
            tb.bub.visible = false;
            tb.cust.root.visible = false;
            toast(`🧾 Tavolo ${tb.num} ha pagato`, 'good');
            if (tables.every((x) => x.stage === 'done')) run.finishPhase();
          }
        },
      })),
      {
        pos: passAt, kind: 'tap', repeat: true, quiet: true, label: 'Prendi il piatto al passe', icon: '🛎️',
        enabled: () => !holding && tables.some((x) => x.stage === 'ready'),
        onDone: () => {
          // il primo piatto pronto (col numero del suo tavolo)
          const tb = tables.find((x) => x.stage === 'ready')!;
          holding = { what: 'dish', table: tb.num };
          tb.stage = 'wait';
          hold(game, crate(0.3, 0xffffff));
          toast(`🛎️ ${tb.dish} per il tavolo ${tb.num}`, 'info');
        },
      },
      {
        pos: regAt, kind: 'tap', repeat: true, quiet: true, label: 'Prendi il conto alla cassa', icon: '🧾',
        enabled: () => !holding && tables.some((x) => x.stage === 'bill'),
        onDone: () => {
          holding = { what: 'bill' };
          hold(game, crate(0.15, 0xffffff));
        },
      },
    ],
  }];
  // i tavoli prima delle fasi (le fasi li leggono)
  for (let i = 0; i < n; i++) {
    const p = room.at(tpos[i][0], tpos[i][1]);
    tables.push({ pos: p, num: i + 1, stage: 'order', time: 0, dish: dishes[i % dishes.length], cust: null as unknown as Character, bub: null as unknown as THREE.Sprite });
  }
  run = new PhasedRun(game, 1, title, phases, { time: 40 + n * 45 });
  for (const tb of tables) {
    room.furn('table', tpos[tb.num - 1][0], tpos[tb.num - 1][1], 0);
    tb.cust = npc(run, tb.pos.clone().add(new THREE.Vector3(0, 0, -0.9)), tb.num + 3, 0);
    tb.bub = bubble(run, tb.cust, '🙋 ordiniamo');
    tag(run, `${tb.num}`, tb.pos, 1.5, '#2d6cdb');
  }
  tag(run, '🛎️ Passe', passAt, 1.7, '#e8590c');
  tag(run, '🧾 Cassa', regAt, 1.7);
  const passLbl = label('', { scale: 0.4 });
  run.onTick = (dt) => {
    for (const tb of tables) {
      tb.cust.update(dt);
      if (run.frozen) continue;
      tb.time += dt;
      // la cucina prepara (7 s); si mangia (8 s), poi il conto
      if (tb.stage === 'wait' && tb.time > 7 && !(holding?.what === 'dish' && holding.table === tb.num)) {
        tb.stage = 'ready';
      } else if (tb.stage === 'eat' && tb.time > 8) {
        tb.stage = 'bill';
        tb.bub.visible = true;
        (tb.bub.material as THREE.SpriteMaterial).map = canvasTexture(256, 64, (g) => {
          g.fillStyle = '#fff';
          g.fillRect(0, 0, 256, 64);
          g.fillStyle = '#3a2f55';
          g.font = '600 38px Fredoka, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('🧾 il conto!', 128, 34);
        });
      }
    }
    void passLbl;
  };
  run.extraStatus = () => {
    const ready = tables.filter((x) => x.stage === 'ready').map((x) => x.num);
    return [holding?.what === 'dish' ? `in mano piatto del ${holding.table}` : holding ? 'in mano 🧾' : '', ready.length ? `🛎️ pronti: ${ready.join(', ')}` : ''].filter(Boolean).join(' · ');
  };
  return run;
}

// ======================================================================================
// Ospitalità: facchino d'albergo
// ======================================================================================

/**
 * Facchino: alla reception le valigie hanno l'etichetta col numero di camera; portale alle porte giuste lungo
 * il corridoio. La porta sbagliata si può scegliere, ma alla fine conta.
 */
export function facchinoJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('hotel', lineLevel);
  const n = Math.round(4 + 3 * t);
  const doorsPerSide = t < 0.5 ? 4 : 6;
  const D = doorsPerSide * 2.4 + 5;
  const room = game.enterArena(new Room({ w: 6, d: D, floor: 0x8e2a3b, wall: 0xf6efe2, sign: '🛎️ Hotel', slot, placed }));
  const floor = 1 + Math.floor(Math.random() * 3);
  const doors = Array.from({ length: doorsPerSide * 2 }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    const k = Math.floor(i / 2);
    return { num: floor * 100 + 1 + i, pos: room.at(side * 2.5, -D / 2 + 1.6 + k * 2.4), side };
  });
  const bags = pickN(doors, n).map((d, i) => ({ door: d, at: room.at(-1.6 + (i % 4) * 0.8, D / 2 - 2.6 - Math.floor(i / 4) * 0.8), obj: null as THREE.Object3D | null }));
  let holding: (typeof bags)[number] | null = null;
  let wrong = 0;
  let delivered = 0;
  let run: PhasedRun;
  const doorTasks = (b: (typeof bags)[number]): Task[] => doors.map((d) => ({
    pos: d.pos.clone().add(new THREE.Vector3(-d.side * 0.5, 0, 0)), kind: 'tap', quiet: true, label: `Lascia alla porta ${d.num}`, icon: '🚪',
    group: 'bag' + bags.indexOf(b), right: d === b.door,
    onDone: () => {
      if (d !== b.door) wrong++;
      run.starCap = wrong >= 2 ? 1 : wrong ? 2 : 3;
      holding = null;
      hold(game);
      delivered++;
      const v = crate(0.4, 0x2d6cdb);
      run.prop(v, d.pos.clone().add(new THREE.Vector3(-d.side * 0.45, 0, 0.5)), 0, 1).userData.noGlow = true;
    },
  }));
  const phases: Phase[] = [
    {
      name: 'Porta le valigie in camera', icon: '🧳', count: () => [delivered, n],
      tip: 'Prendi una <b>valigia</b> alla reception e leggi il <b>numero sull\'etichetta</b>: portala alla porta con quel numero (i numeri sono sulle porte)',
      tasks: () => bags.map((b): Task => ({
        pos: b.at, kind: 'tap', quiet: true, label: `Prendi la valigia (camera ${b.door.num})`, icon: '🧳', enabled: () => !holding,
        onDone: () => {
          holding = b;
          b.obj!.visible = false;
          hold(game, crate(0.45, 0x2d6cdb));
        },
        then: () => doorTasks(b),
      })),
    },
    {
      name: 'Torna alla reception', icon: '🛎️',
      tasks: () => [{
        pos: room.at(0, D / 2 - 1.6), kind: 'tap', label: 'Suona il campanello: fatto!', icon: '🛎️',
        onDone: () => toast(wrong ? `🛎️ ${wrong} ${wrong === 1 ? 'valigia sbagliata' : 'valigie sbagliate'}: massimo ${run.starCap} stelle` : '🛎️ Tutte le valigie nella camera giusta!', wrong ? 'bad' : 'good'),
      }],
    },
  ];
  run = new PhasedRun(game, 1, title, phases, { time: 30 + n * 22 + doorsPerSide * 4 });
  // porte con il numero, e le valigie con l'etichetta
  for (const d of doors) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 1.0), new THREE.MeshLambertMaterial({ color: 0x8a5a2b }));
    door.position.y = 1.05;
    const g = new THREE.Group();
    g.add(door);
    // la porta si illumina quando ci sei davanti (ed è lei che si tocca)
    run.prop(g, d.pos.clone(), 0, 1);
    tag(run, String(d.num), d.pos.clone().add(new THREE.Vector3(-d.side * 0.1, 0, 0)), 2.45, '#3a2f55');
  }
  // banco della reception di lato, non davanti alla porta
  room.furn('desk', -1.9, D / 2 - 1.6, Math.PI / 2);
  for (const b of bags) {
    const o = crate(0.5, 0x2d6cdb);
    const lb = label(String(b.door.num), { bg: '#ffc21a', fg: '#3a2f55', scale: 0.32 });
    lb.position.y = 0.75;
    o.add(lb);
    b.obj = run.prop(o, b.at, 0, 1);
  }
  run.extraStatus = () => (holding ? `🧳 camera ${holding.door.num}` : '');
  return run;
}

// ======================================================================================
// Ospitalità: cameriera ai piani
// ======================================================================================

/** Cameriera ai piani: per ogni camera letto, asciugamani, cestino e polvere; lenzuola e asciugamani al carrello. */
export function housekeepingJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('hotel', lineLevel);
  const rooms = t < 0.5 ? 2 : 3;
  const W = rooms * 4.4;
  const room = game.enterArena(new Room({ w: W, d: 8, floor: 0xd8c3a5, wall: 0xf6efe2, sign: '🛎️ Hotel', slot, placed }));
  let holding: 'lenzuola' | 'asciugamani' | 'spazzatura' | null = null;
  let run: PhasedRun;
  const cartAt = room.at(W / 2 - 1.3, 2.6);
  const walls: { x: number }[] = [];
  const jobs: Task[] = [];
  for (let r = 0; r < rooms; r++) {
    const cx = -W / 2 + 2.2 + r * 4.4;
    if (r) walls.push({ x: -W / 2 + r * 4.4 });
    // letto in scala vera (circa 2 m): resta il passaggio verso il bagno
    const bed = room.furn('bedDouble', cx - 0.6, -2.7, 0, 1.2);
    const bin = room.furn('trashcan', cx + 1.5, -0.4, 0, 1.3);
    const sink = room.furn('bathroomSink', cx + 1.6, -3.2, 0);
    const side = room.furn('sideTable', cx - 1.7, -0.6, 0);
    jobs.push(
      { pos: room.at(cx - 0.6, -1.2), kind: 'hold', sec: 2, quiet: true, label: 'Rifai il letto', icon: '🛏️', obj: bed.obj, enabled: () => holding === 'lenzuola', onDone: () => { holding = null; hold(game); } },
      { pos: room.at(cx + 1.6, -2.4), kind: 'tap', quiet: true, label: 'Asciugamani puliti', icon: '🧺', obj: sink.obj, enabled: () => holding === 'asciugamani', onDone: () => { holding = null; hold(game); } },
      {
        pos: room.at(cx + 1.5, 0.3), kind: 'tap', quiet: true, label: 'Svuota il cestino', icon: '🗑️', obj: bin.obj, enabled: () => !holding,
        onDone: () => { holding = 'spazzatura'; hold(game, crate(0.3, 0x333333)); },
      },
      { pos: room.at(cx - 1.7, 0.1), kind: 'hold', sec: 1.4, quiet: true, label: 'Togli la polvere', icon: '🧹', obj: side.obj, fx: 'spark' },
    );
  }
  const total = jobs.length;
  const phases: Phase[] = [{
    name: 'Rifai le camere', icon: '🛏️', count: () => [jobs.filter((x) => x.done).length, total],
    tip: 'Al <b>carrello</b> prendi le <b>lenzuola</b> per rifare il letto (tieni premuto) e gli <b>asciugamani</b> per il bagno. <b>Svuota il cestino</b> nel carrello e togli la <b>polvere</b> dai comodini',
    tasks: () => [
      ...jobs,
      // dal carrello: solo ciò che serve ancora (e si può rimettere a posto)
      { pos: cartAt.clone().add(new THREE.Vector3(-0.6, 0, 0)), kind: 'tap', repeat: true, quiet: true, label: 'Prendi le lenzuola', icon: '🛏️', enabled: () => !holding && jobs.some((x) => x.icon === '🛏️' && !x.done), onDone: () => { holding = 'lenzuola'; hold(game, crate(0.35, 0xffffff)); } },
      { pos: cartAt.clone().add(new THREE.Vector3(0.6, 0, 0)), kind: 'tap', repeat: true, quiet: true, label: 'Prendi gli asciugamani', icon: '🧺', enabled: () => !holding && jobs.some((x) => x.icon === '🧺' && !x.done), onDone: () => { holding = 'asciugamani'; hold(game, crate(0.3, 0x8fd3ff)); } },
      { pos: cartAt.clone().add(new THREE.Vector3(0, 0, 0.6)), kind: 'tap', repeat: true, quiet: true, get label() { return holding === 'spazzatura' ? 'Butta nel sacco del carrello' : 'Rimetti nel carrello'; }, icon: '🗑️', enabled: () => !!holding, onDone: () => { holding = null; hold(game); } },
    ],
  }];
  run = new PhasedRun(game, 1, title, phases, { time: 30 + rooms * 55 });
  // muretti tra le camere (dal muro di fondo, con il passaggio sul davanti)
  const zBack = room.sz(-4), zFront = room.sz(1);
  for (const w of walls) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, zFront - zBack), new THREE.MeshLambertMaterial({ color: 0xf1e6d2 }));
    m.position.y = 1.3;
    const g = new THREE.Group();
    g.add(m);
    g.userData.solid = true;
    g.userData.noGlow = true;
    run.prop(g, room.center.clone().add(new THREE.Vector3(room.sx(w.x), 0, (zBack + zFront) / 2)), 0, 1);
  }
  const cart = crate(0.8, 0x8e5bd6, 0xffffff);
  cart.userData.solid = true;
  run.prop(cart, cartAt, 0, 1);
  tag(run, '🧺 Carrello', cartAt, 1.8, '#8e5bd6');
  run.onTick = () => {
    if (jobs.every((x) => x.done) && !holding) run.finishPhase();
  };
  run.extraStatus = () => (holding ? `in mano ${{ lenzuola: '🛏️', asciugamani: '🧺', spazzatura: '🗑️' }[holding]}` : '');
  return run;
}

// ======================================================================================
// Ospitalità: concierge
// ======================================================================================

const REQUESTS = [
  { icon: '☂️', name: 'un ombrello' }, { icon: '🎟️', name: 'i biglietti del teatro' }, { icon: '🗺️', name: 'una mappa' },
  { icon: '🔑', name: 'la chiave nuova' }, { icon: '🔌', name: 'un caricatore' }, { icon: '🧴', name: 'la crema solare' },
];

/**
 * Concierge: nella hall gli ospiti aspettano. Parla con uno (tocca), senti cosa chiede, prendi la cosa giusta
 * dagli scaffali dietro il banco e portagliela. La cosa sbagliata si può dare, ma conta alla fine.
 */
export function conciergeJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('hotel', lineLevel);
  const n = Math.round(4 + 2 * t);
  const room = game.enterArena(new Room({ w: 10, d: 8, floor: 0xe9e1d3, wall: 0xf6efe2, sign: '🛎️ Hall', slot, placed }));
  const reqs = pickN(REQUESTS, n);
  const shelfItems = REQUESTS;
  let busy: number | null = null;
  let holding: string | null = null;
  let doneN = 0;
  const qs: number[] = [];
  let run: PhasedRun;
  // il banco più avanti: dietro resta il passaggio verso gli scaffali
  room.furn('desk', -1, -1.0, 0);
  room.furn('desk', 1, -1.0, 0);
  const guests = reqs.map((r, i) => ({ r, pos: room.at(-3.4 + (i % 3) * 3.4, -0.2 + Math.floor(i / 3) * 1.7), c: null as unknown as Character, b: null as unknown as THREE.Sprite, done: false, asked: false }));
  const itemAt = (k: number) => room.at(-3.75 + k * 1.5, -3.2);
  const phases: Phase[] = [{
    name: 'Aiuta gli ospiti', icon: '🛎️', count: () => [doneN, n],
    tip: 'Parla con un ospite (tocca): ti dice cosa gli serve. Prendi la <b>cosa giusta</b> dagli scaffali dietro il banco e <b>portagliela</b>',
    tasks: () => [
      ...guests.map((g, i): Task => ({
        pos: g.pos.clone().add(new THREE.Vector3(0, 0, -0.9)), kind: 'tap', repeat: true, quiet: true, label: busy === i ? `Dai a ${['lui', 'lei'][i % 2]}` : 'Parla con l\'ospite', icon: '🙋',
        enabled: () => !g.done && (busy === null ? !holding : busy === i && !!holding),
        onDone: () => {
          if (busy === null) {
            busy = i;
            g.asked = true;
            g.b.visible = true;
            toast(`🙋 "Mi serve ${g.r.name}, per favore"`, 'info');
            return;
          }
          const ok = holding === g.r.icon;
          qs.push(ok ? 1 : 0.2);
          if (!ok) toast(`😕 "Non è quello che ho chiesto…"`, 'bad');
          else toast('😊 "Grazie mille!"', 'good');
          run.starCap = capFrom(qs);
          holding = null;
          hold(game);
          g.done = true;
          g.c.root.visible = false;
          g.b.visible = false;
          busy = null;
          doneN++;
          if (doneN >= n) run.finishPhase();
        },
      })),
      ...shelfItems.map((it, k): Task => ({
        pos: itemAt(k), kind: 'tap', repeat: true, quiet: true, label: `Prendi ${it.icon}`, icon: it.icon,
        enabled: () => busy !== null && !holding,
        onDone: () => {
          holding = it.icon;
          hold(game, crate(0.25, 0xffffff));
        },
      })),
    ],
  }];
  run = new PhasedRun(game, 1, title, phases, { time: 30 + n * 24 });
  guests.forEach((g, i) => {
    g.c = npc(run, g.pos, i + 1, Math.PI);
    g.b = bubble(run, g.c, `${g.r.icon} ?`);
    g.b.visible = false;
  });
  shelfItems.forEach((it, k) => {
    const sh = room.furn('kitchenCabinet', -3.75 + k * 1.5, -3.6, 0, 2);
    void sh;
    tag(run, it.icon, itemAt(k), 1.4);
  });
  run.onTick = (dt) => guests.forEach((g) => g.c.update(dt));
  run.extraStatus = () => [busy !== null ? `🙋 vuole ${guests[busy].r.icon}` : '', holding ? `in mano ${holding}` : ''].filter(Boolean).join(' · ');
  return run;
}

// ======================================================================================
// Ospitalità: suite VIP
// ======================================================================================

const VIP_ITEMS = [
  { icon: '🍾', name: 'champagne', twin: '🍷' }, { icon: '🍓', name: 'fragole', twin: '🍒' }, { icon: '🌹', name: 'rose rosse', twin: '🌷' },
  { icon: '🍫', name: 'cioccolatini', twin: '🍪' }, { icon: '🧀', name: 'formaggi', twin: '🥖' }, { icon: '🍣', name: 'sushi', twin: '🍤' },
];

/**
 * Suite VIP: la scheda dell'ospite dice cosa vuole. Prendi ogni cosa dalla dispensa (attento ai "gemelli":
 * vino al posto dello champagne, tulipani al posto delle rose…) e mettila sul carrello, poi in suite:
 * apparecchia, metti i fiori, accendi le candele, apri le tende.
 */
export function suiteJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('hotel', lineLevel);
  const n = Math.round(3 + 2 * t);
  const room = game.enterArena(new Room({ w: 11, d: 8, floor: 0xd8c3a5, wall: 0xfaf3e6, sign: '👑 Suite', slot, placed }));
  const want = pickN(VIP_ITEMS, n);
  const pantry = pickN([...want.map((w) => w.icon), ...want.map((w) => w.twin)], want.length * 2);
  const onCart: string[] = [];
  let holding: string | null = null;
  let run: PhasedRun;
  const cartAt = room.at(-1.5, 1.8);
  // dispensa: fino a 6 sulla parete di fondo, le altre sulla parete di sinistra (mai una sopra l'altra)
  const pantryAt = (k: number) => (k < 6 ? room.at(-4.4 + k * 1.5, -3.2) : room.at(-4.7, -1.4 + (k - 6) * 1.4));
  const phases: Phase[] = [
    {
      name: 'Prepara il carrello', icon: '🛒', count: () => [onCart.length, n],
      tip: `La scheda dell'ospite: <b>${want.map((w) => `${w.icon} ${w.name}`).join(', ')}</b>. Prendi ognuna dalla dispensa (attento a quelle simili!) e mettila sul <b>carrello</b>`,
      tasks: () => [
        ...pantry.map((icon, k): Task => ({
          pos: pantryAt(k), kind: 'tap', repeat: true, quiet: true, label: `Prendi ${icon}`, icon,
          enabled: () => !holding && onCart.length < n,
          onDone: () => {
            holding = icon;
            hold(game, crate(0.25, 0xffffff));
          },
        })),
        {
          pos: cartAt, kind: 'tap', repeat: true, quiet: true, label: 'Metti sul carrello', icon: '🛒', enabled: () => !!holding,
          onDone: () => {
            onCart.push(holding!);
            holding = null;
            hold(game);
            if (onCart.length >= n) run.finishPhase();
          },
        },
      ],
    },
    {
      name: 'Prepara la suite', icon: '👑',
      tip: 'In suite: <b>apparecchia</b> il tavolo (tieni premuto), metti i <b>fiori</b> nel vaso, accendi le <b>candele</b> e apri le <b>tende</b>',
      tasks: () => [
        { pos: room.at(2.4, -0.4), kind: 'hold', sec: 2, label: 'Apparecchia il tavolo', icon: '🍽️' },
        { pos: room.at(4.4, -2.2), kind: 'tap', label: 'Metti i fiori nel vaso', icon: '💐' },
        { pos: room.at(1.0, -2.0), kind: 'tap', label: 'Accendi le candele', icon: '🕯️', fx: 'spark' },
        { pos: room.at(4.6, 1.2), kind: 'hold', sec: 1.4, label: 'Apri le tende', icon: '🪟' },
      ],
    },
  ];
  run = new PhasedRun(game, 1, title, phases, { time: 50 + n * 22 });
  pantry.forEach((icon, k) => {
    const at = pantryAt(k);
    if (k < 6) room.furn('kitchenCabinet', -4.4 + k * 1.5, -3.7, 0, 2);
    else room.furn('kitchenCabinet', -5.2, -1.4 + (k - 6) * 1.4, Math.PI / 2, 2);
    tag(run, icon, at, 1.35);
  });
  const cart = crate(0.7, 0xc0c4cc);
  cart.userData.solid = true;
  run.prop(cart, cartAt.clone().add(new THREE.Vector3(0, 0, 0.6)), 0, 1);
  tag(run, '🛒 Carrello', cartAt, 1.7, '#8e5bd6');
  room.furn('table', 2.4, -1.2, 0);
  room.furn('bedDouble', 3.5, 2.4, Math.PI, 1.2);
  // vaso (per i fiori), candelabro e tende alla finestra: gli oggetti dei punti della suite
  const m = (c: number) => new THREE.MeshLambertMaterial({ color: c });
  const vase = new THREE.Group();
  const vb = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.5, 12), m(0x8fd3ff));
  vb.position.y = 0.95;
  const vt = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), m(0xd9cbb0));
  vt.position.y = 0.35;
  vase.add(vb, vt);
  run.prop(vase, room.at(4.4, -2.9), 0, 1).userData.solid = true;
  const cand = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), m(0xfff3d6));
    c.position.set(-0.12 + i * 0.12, 1.0, 0);
    cand.add(c);
  }
  const ct = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.5), m(0x8a5a2b));
  ct.position.y = 0.42;
  cand.add(ct);
  run.prop(cand, room.at(1.0, -2.6), 0, 1).userData.solid = true;
  const curtain = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 1.8), m(0xc0392b));
  curtain.position.y = 1.2;
  const cg = new THREE.Group();
  cg.add(curtain);
  run.prop(cg, room.at(5.35, 1.2), 0, 1);
  room.furn('loungeSofa', -3.6, 2.6, Math.PI);
  // a fine lavoro: quante cose giuste sul carrello
  const wanted = want.map((w) => w.icon);
  run.onTick = () => {
    if (run.starCap === 3 && onCart.length >= n) {
      const ok = onCart.filter((x) => wanted.includes(x)).length;
      const q = ok / n;
      run.starCap = q >= 0.99 ? 3 : q >= 0.6 ? 2 : 1;
      if (q < 0.99) toast(`📋 Sul carrello ${n - ok} ${n - ok === 1 ? 'cosa sbagliata' : 'cose sbagliate'}`, 'bad');
    }
  };
  run.extraStatus = () => (holding ? `in mano ${holding}` : `📋 ${want.map((w) => (onCart.includes(w.icon) ? '✅' : w.icon)).join(' ')}`);
  return run;
}
