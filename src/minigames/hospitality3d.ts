import * as THREE from 'three';
import type { Game } from '../game';
import { rungProgress } from '../config/careers';
import { toast } from '../sim/bus';
import { CHAR_MODELS } from '../sim/economy';
import { Character } from '../world/character';
import type { Slot } from '../world/city';
import { canvasTexture, label, numberPlate } from '../world/props';
import { Arena } from './arena';
import { PhasedRun, type Chip, type Phase, type Task } from './jobs';
import { crate } from './warehouse';
import { Room } from './room';
import { BurgerStation, DISHWARE, GrillStation, SAUCES, TOPPINGS, WashStation, type Dish, type Rack, type Sauce, type Step, type Topping } from './kitchen';
import { CutStation, MixerStation, SHAPE_PATHS, ShapeStation, VEGGIES, type MixIng, type MixerView, type Veggie } from './station';
import { fillTextIco } from '../ui/icons';

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
// Cucina: lavapiatti
// ======================================================================================

/** Stoviglia in 3D (in mano, sulla pila sporca, ad asciugare): sporca ha le macchie marroni. */
function dishMesh(kind: Dish, dirty: boolean) {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xfbfbf8 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  if (kind === 'piano') add(new THREE.CylinderGeometry(0.15, 0.12, 0.025, 18), white);
  else if (kind === 'fondo') add(new THREE.CylinderGeometry(0.14, 0.08, 0.06, 18), white, 0, 0.02);
  else if (kind === 'bicchiere') add(new THREE.CylinderGeometry(0.045, 0.036, 0.13, 12), new THREE.MeshLambertMaterial({ color: 0xc8e6fa, transparent: true, opacity: 0.75 }), 0, 0.06);
  else if (kind === 'posate') for (const x of [-0.03, 0, 0.03]) add(new THREE.BoxGeometry(0.018, 0.008, 0.2), new THREE.MeshLambertMaterial({ color: 0xc9d0d8 }), x, 0.005);
  else if (kind === 'vaschetta') add(new THREE.BoxGeometry(0.26, 0.07, 0.18), white, 0, 0.03);
  else add(new THREE.BoxGeometry(0.4, 0.025, 0.28), new THREE.MeshLambertMaterial({ color: 0xd8c3a5 }));
  if (dirty && kind !== 'bicchiere' && kind !== 'posate') {
    const dirt = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
    const top = kind === 'fondo' ? 0.051 : kind === 'vaschetta' ? 0.066 : 0.014;
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.005, 10), dirt, 0.03, top, -0.02);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.005, 10), dirt, -0.05, top, 0.04);
  }
  return g;
}

/**
 * Lavapiatti: nella cucina del ristorante chiuso c'è il carrello con la pila delle stoviglie sporche. Una alla
 * volta: prendila → al lavello (col dito: spugna nel sapone, strofina le macchie, sciacqua sotto l'acqua, vedi
 * WashStation) → mettila ad asciugare al posto giusto (scolapiatti, portabicchieri, cestello delle posate). Il
 * posto sbagliato si può scegliere, ma conta alla fine. Salendo arrivano piatti fondi, bicchieri, posate,
 * vaschette e vassoi, e lo sporco è più ostinato.
 */
export function dishJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('piatti', lineLevel);
  const n = Math.round(4 + 3 * t);
  const kinds: Dish[] = ['piano', ...(t >= 0.25 ? ['fondo', 'bicchiere'] as Dish[] : []), ...(t >= 0.55 ? ['posate', 'vaschetta'] as Dish[] : []), ...(t >= 0.8 ? ['vassoio'] as Dish[] : [])];
  // la pila: almeno una di ogni tipo, il resto a caso, mescolata
  const pile: Dish[] = Array.from({ length: n }, (_, i) => kinds[i < kinds.length ? i : Math.floor(Math.random() * kinds.length)]);
  for (let i = pile.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pile[i], pile[j]] = [pile[j], pile[i]];
  }
  const spots = Math.round(2 + 2 * t);
  const tough = 4.5 - 2 * t;
  const racks = [...new Set(kinds.map((k) => DISHWARE[k].rack))] as Rack[];
  const room = game.enterArena(new Room({ w: 8, d: 6, tiles: true, sign: 'Cucina', slot, placed }));
  let holding: { kind: Dish; clean: boolean } | null = null;
  let next = 0;
  let done = 0;
  let wrong = 0;
  let run: PhasedRun;
  // carrello della pila sporca, lavello sul fondo, posti per asciugare sul bancone di destra
  const cart = room.furn('table', -2.6, 0.4, 0);
  const cartAt = room.near(-2.6, 0.4, 0.9, 0);
  const sink = room.furn('kitchenSink', 0, -2.4, 0);
  const sinkAt = room.near(0, -2.4, 0, 0.6);
  const rackNames: Record<Rack, string> = { piatti: 'scolapiatti', bicchieri: 'portabicchieri', posate: 'cestello delle posate' };
  const stations = racks.map((r, k) => {
    const z = -1.2 + k * 1.3;
    const f = room.furn('kitchenCabinet', 3.0, z, -Math.PI / 2);
    // posti ad asciugare: una stoviglia ripresa in mano libera il suo posto
    return { r, obj: f.obj, top: f.top, pos: room.near(3.0, z, -0.7, 0), at: room.at(3.0, z), slots: [] as (THREE.Object3D | null)[] };
  });
  /** stoviglie ad asciugare nel posto sbagliato (si possono riprendere finché non metti l'ultima) */
  const misplaced = new Set<THREE.Object3D>();
  const pileObjs: THREE.Object3D[] = [];
  const phases: Phase[] = [{
    name: 'Lava le stoviglie', icon: '', count: () => [done, n],
    tip: 'Prendi una stoviglia sporca dal <b>carrello</b>, al <b>lavello</b> bagna la <b>spugna nel sapone</b>, strofina via ogni macchia e <b>sciacqua</b> sotto l\'acqua finché non resta schiuma. Poi mettila ad asciugare al posto giusto: piatti, vaschette e vassoi nello <b>scolapiatti</b>, bicchieri nel <b>portabicchieri</b>, posate nel <b>cestello</b>. Posto sbagliato? Tocca la stoviglia per riprenderla, prima di mettere l\'ultima',
    tasks: () => [
      {
        pos: cartAt, kind: 'tap', repeat: true, quiet: true, get label() { return `Prendi dalla pila: ${DISHWARE[pile[Math.min(next, n - 1)]].name}`; }, icon: '', obj: cart.obj,
        enabled: () => !holding && next < n,
        onDone: () => {
          const kind = pile[next];
          pileObjs[next].visible = false;
          next++;
          holding = { kind, clean: false };
          hold(game, dishMesh(kind, true));
        },
      },
      {
        pos: sinkAt, kind: 'tap', repeat: true, quiet: true, get label() { return holding ? `Lava: ${DISHWARE[holding.kind].name}` : 'Lava'; }, icon: '', obj: sink.obj,
        enabled: () => !!holding && !holding.clean,
        onDone: () => {
          const kind = holding!.kind;
          hold(game);
          run.openStation(new WashStation(kind, kind === 'posate' || kind === 'bicchiere' ? Math.max(1, spots - 1) : spots, tough, () => {
            if (!holding) return;
            holding = { kind, clean: true };
            hold(game, dishMesh(kind, false));
          }));
        },
      },
      ...stations.map((st): Task => ({
        pos: st.pos, kind: 'tap', repeat: true, quiet: true, label: `Metti nel ${rackNames[st.r]}`, icon: '', obj: st.obj,
        enabled: () => !!holding?.clean,
        get right() { return !!holding && DISHWARE[holding.kind].rack === st.r; },
        onDone: () => {
          const kind = holding!.kind;
          const ok = DISHWARE[kind].rack === st.r;
          // ad asciugare: piatti in piedi nello scolapiatti, bicchieri a testa in giù, posate dritte nel cestello
          const m = dishMesh(kind, false);
          m.userData.noGlow = true;
          let i = st.slots.indexOf(null);
          if (i < 0) i = st.slots.length;
          st.slots[i] = m;
          const base = st.at.clone().setY(st.top + 0.02);
          if (st.r === 'piatti') {
            m.rotation.x = Math.PI / 2;
            run.prop(m, base.add(new THREE.Vector3(0, 0.15, -0.45 + (i % 7) * 0.13)), Math.PI / 2, 1);
          } else if (st.r === 'bicchieri') {
            m.rotation.x = Math.PI;
            run.prop(m, base.add(new THREE.Vector3(-0.1 + (i % 2) * 0.2, 0.13, -0.3 + Math.floor(i / 2) * 0.15)), 0, 1);
          } else {
            m.rotation.x = Math.PI / 2;
            run.prop(m, base.add(new THREE.Vector3(0, 0.2, -0.04 + (i % 3) * 0.04)), 0, 1);
          }
          holding = null;
          hold(game);
          done++;
          // nel posto sbagliato: si può riprendere in mano e rimettere giusto (conta solo se resta lì alla fine)
          if (!ok) {
            misplaced.add(m);
            run.retake(m, `Riprendi: ${DISHWARE[kind].name}`, '', () => !holding && done < n, () => {
              m.visible = false;
              st.slots[i] = null;
              misplaced.delete(m);
              done--;
              holding = { kind, clean: true };
              hold(game, dishMesh(kind, false));
              wrong = misplaced.size;
              run.starCap = wrong >= 2 ? 1 : wrong ? 2 : 3;
            });
          }
          wrong = misplaced.size;
          run.starCap = wrong >= 2 ? 1 : wrong ? 2 : 3;
          if (done >= n) {
            if (wrong) toast(`${wrong} ${wrong === 1 ? 'stoviglia messa' : 'stoviglie messe'} ad asciugare al posto sbagliato`, 'bad');
            run.finishPhase();
          }
        },
      })),
    ],
  }];
  run = new PhasedRun(game, 1, title, phases, { time: Math.min(290, 40 + n * 24) });
  // la pila sporca sul carrello (la cima è la prossima)
  const y = cart.top + 0.02;
  pile.forEach((k, i) => {
    const m = dishMesh(k, true);
    m.userData.noGlow = true;
    pileObjs[i] = run.prop(m, room.at(-2.6, 0.4).add(new THREE.Vector3(0, y + (pile.length - 1 - i) * 0.07, 0)), (i * 0.7) % 3, 1);
  });
  // spugna e sapone sul bordo del lavello
  const sponge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.08), new THREE.MeshLambertMaterial({ color: 0xf5d33b }));
  const soap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.2, 12), new THREE.MeshLambertMaterial({ color: 0x5fb8f0 }));
  sponge.userData.noGlow = soap.userData.noGlow = true;
  run.prop(sponge, new THREE.Vector3(sink.box.min.x + 0.12, sink.top + 0.025, sink.box.max.z - 0.12), 0.2, 1);
  run.prop(soap, new THREE.Vector3(sink.box.max.x - 0.1, sink.top + 0.1, sink.box.max.z - 0.14), 0, 1);
  // cosa c'è su ogni mobile per asciugare: la griglia dello scolapiatti, il tappetino dei bicchieri, il cestello
  for (const st of stations) {
    const g = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0xc9d0d8 });
    if (st.r === 'piatti') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 1.0), steel);
      g.add(base);
      for (let k = 0; k < 9; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.012), steel);
        bar.position.set(0, 0.08, -0.48 + k * 0.12);
        g.add(bar);
      }
    } else if (st.r === 'bicchieri') {
      const mat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 0.75), new THREE.MeshLambertMaterial({ color: 0x5fb8f0 }));
      g.add(mat);
    } else {
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.22, 14, 1, true), new THREE.MeshLambertMaterial({ color: 0xc9d0d8, side: THREE.DoubleSide }));
      basket.position.y = 0.11;
      g.add(basket);
    }
    g.userData.noGlow = true;
    run.prop(g, st.at.clone().setY(st.top + 0.015), 0, 1);
  }
  return run;
}

// ======================================================================================
// Cucina: aiuto cuoco
// ======================================================================================

/**
 * Aiuto cuoco: il foglio delle preparazioni dice cosa tagliare, uno dopo l'altro. Frigo → tagliere (prendi il
 * coltello col dito e muovilo su e giù sulle linee, vedi CutStation) → la ciotola con lo stesso ingrediente.
 * La ciotola sbagliata si può scegliere, ma conta alla fine (meno stelle e paga).
 */
export function prepCookJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('piatti', lineLevel);
  const n = t < 0.5 ? 3 : 4;
  // tagli più fini ai livelli alti: più linee, più vicine, più precise
  const nLines = t < 0.4 ? 3 : t < 0.8 ? 4 : 5;
  const strokes = 3 + Math.round(t);
  const tol = 0.05 - 0.018 * t;
  const room = game.enterArena(new Room({ w: 9, d: 7, tiles: true, sign: '🔪 Cucina', slot, placed }));
  const kinds = pickN(Object.keys(VEGGIES) as Veggie[], n);
  const orders = pickN(kinds, n);
  let holding: { v: Veggie; cut: boolean; q: number } | null = null;
  const qs: number[] = [];
  let next = 0;
  let done = 0;
  let wrong = 0;
  let run: PhasedRun;
  const fridge = room.furn('kitchenFridgeLarge', -3.6, -2.9, 0, 1.5);
  const fridgeAt = room.near(-3.6, -2.9, 0, 0.7);
  // tagliere di legno sul bancone, col coltello accanto
  const bench = room.furn('kitchenCabinet', -0.6, -3.0, 0);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.4), new THREE.MeshLambertMaterial({ color: 0xd9a86a }));
  const knife = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 0.05), new THREE.MeshLambertMaterial({ color: 0xc9d0d8 }));
  const benchAt = room.near(-0.6, -3.0, 0, 0.6);
  // i fuochi spenti del cuoco, per far vedere che è una cucina
  room.furn('kitchenStove', 1.2, -3.0, 0);
  // ciotole: una per ingrediente, sul bancone lungo la parete di destra
  const bowls = kinds.map((v, k) => {
    const z = -2.0 + k * (4.2 / Math.max(1, n - 1));
    const f = room.furn('kitchenCabinet', 3.6, z, -Math.PI / 2);
    // cosa c'è dentro: uno strato di fette per ingrediente messo (quello sbagliato si può riprendere)
    return { v, obj: f.obj, top: f.top, pos: room.near(3.6, z, -0.7, 0), at: room.at(3.6, z), layers: [] as { v: Veggie; q: number; m: THREE.Mesh }[] };
  });
  const piece = (v: Veggie, cut: boolean) => {
    const c = new THREE.Color(VEGGIES[v].color);
    const g = new THREE.Group();
    if (!cut) {
      const m = new THREE.Mesh(VEGGIES[v].long ? new THREE.CapsuleGeometry(0.06, 0.24, 4, 8) : new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshLambertMaterial({ color: c }));
      if (VEGGIES[v].long) m.rotation.z = Math.PI / 2;
      g.add(m);
    } else {
      // le fette in fila
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 10), new THREE.MeshLambertMaterial({ color: i % 2 ? c : new THREE.Color(VEGGIES[v].in) }));
        m.rotation.z = Math.PI / 2;
        m.position.x = (i - 1.5) * 0.04;
        g.add(m);
      }
    }
    return g;
  };
  const cur = () => orders[Math.min(next, n - 1)];
  // stelle da quello che c'è adesso nelle ciotole: lo strato nella ciotola sbagliata vale poco
  const score = () => {
    qs.length = 0;
    wrong = 0;
    for (const b of bowls) for (const l of b.layers) {
      if (l.v !== b.v) wrong++;
      qs.push(l.v === b.v ? l.q : l.q * 0.3);
    }
    run.starCap = capFrom(qs);
  };
  const phases: Phase[] = [{
    name: 'Prepara le verdure', icon: '🔪', count: () => [done, n],
    tip: 'Segui il <b>foglio delle preparazioni</b>: prendi l\'ingrediente dal <b>frigo</b>, al <b>tagliere</b> prendi il <b>coltello</b> col dito e muovilo <b>su e giù</b> sopra ogni linea finché la fetta si stacca, poi metti le fette nella <b>ciotola</b> con lo stesso ingrediente. Ciotola sbagliata? Tocca le fette per riprenderle, prima di mettere l\'ultimo',
    tasks: () => [
      {
        pos: fridgeAt, kind: 'tap', repeat: true, quiet: true, get label() { return `Prendi dal frigo: ${VEGGIES[cur()].icon} ${VEGGIES[cur()].name}`; }, icon: '🧊', obj: fridge.obj,
        enabled: () => !holding && next < n,
        onDone: () => {
          holding = { v: orders[next++], cut: false, q: 1 };
          hold(game, piece(holding.v, false));
        },
      },
      {
        pos: benchAt, kind: 'tap', repeat: true, quiet: true, get label() { return holding ? `Taglia: ${VEGGIES[holding.v].icon} ${VEGGIES[holding.v].name}` : 'Taglia'; }, icon: '🔪', obj: bench.obj,
        enabled: () => !!holding && !holding.cut,
        onDone: () => {
          const v = holding!.v;
          hold(game);
          run.openStation(new CutStation(v, nLines, strokes, tol, (q) => {
            if (!holding) return;
            holding = { v, cut: true, q };
            hold(game, piece(v, true));
            if (q < 0.7) toast('🔪 Fette un po\' storte: taglia proprio sulle linee', 'bad');
          }));
        },
      },
      ...bowls.map((b): Task => ({
        pos: b.pos, kind: 'tap', repeat: true, quiet: true, label: `Metti nella ciotola ${VEGGIES[b.v].icon}`, icon: VEGGIES[b.v].icon, obj: b.obj,
        enabled: () => !!holding?.cut,
        get right() { return holding?.v === b.v; },
        onDone: () => {
          // la ciotola sbagliata si può scegliere: si può riprendere, altrimenti si paga alla fine
          const v = holding!.v;
          const q = holding!.q;
          // la ciotola si riempie del colore di quello che ci metti (uno strato per ingrediente)
          const m = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.05, 14), new THREE.MeshLambertMaterial({ color: VEGGIES[v].color }));
          m.userData.noGlow = true;
          run.prop(m, b.at.clone().setY(b.top + 0.07 + b.layers.length * 0.03), 0, 1);
          const layer = { v, q, m };
          b.layers.push(layer);
          holding = null;
          hold(game);
          done++;
          if (v !== b.v) {
            run.retake(m, `Riprendi: ${VEGGIES[v].icon} ${VEGGIES[v].name}`, VEGGIES[v].icon, () => !holding && done < n, () => {
              m.visible = false;
              b.layers.splice(b.layers.indexOf(layer), 1);
              done--;
              holding = { v, cut: true, q };
              hold(game, piece(v, true));
              score();
            });
          }
          score();
          if (done >= n) {
            toast(wrong ? `🥣 ${wrong} ${wrong === 1 ? 'ingrediente nella ciotola sbagliata' : 'ingredienti nelle ciotole sbagliate'}` : '🔪 Tutto tagliato: il cuoco può cucinare!', wrong ? 'bad' : 'good');
            run.finishPhase();
          }
        },
      })),
    ],
  }];
  run = new PhasedRun(game, 1, title, phases, { time: Math.min(290, 40 + n * (30 + nLines * 4)) });
  board.userData.noGlow = knife.userData.noGlow = true;
  run.prop(board, room.at(-0.6, -3.0).setY(bench.top + 0.02), 0, 1);
  run.prop(knife, room.at(-0.6, -3.0).add(new THREE.Vector3(0.12, bench.top + 0.05, 0.12)), 0.3, 1);
  for (const b of bowls) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 0.14, 16, 1, true), new THREE.MeshLambertMaterial({ color: 0xf4f1ea, side: THREE.DoubleSide }));
    bowl.userData.noGlow = true;
    run.prop(bowl, b.at.clone().setY(b.top + 0.07), 0, 1);
    tag(run, `🥣 ${VEGGIES[b.v].icon}`, b.pos, 1.6, '#8e5bd6');
  }
  tag(run, '🧊 Frigo', fridgeAt, 2.9);
  tag(run, '🔪 Tagliere', benchAt, 1.6);
  // il foglio delle preparazioni in grande: blu da iniziare, giallo da tagliare, verde tagliata (alla ciotola)
  run.chips = () => orders.map((v, i): Chip => ({ t: VEGGIES[v].icon, s: i < done ? 'done' : i === done && holding ? (holding.cut ? 'ready' : 'prep') : 'todo' }));
  run.extraStatus = () => (holding ? (holding.cut ? 'tagliato: mettilo nella sua ciotola' : 'da tagliare sul tagliere') : '');
  return run;
}

// ======================================================================================
// Cucina: cuoco di linea
// ======================================================================================

/**
 * Cuoco di linea: le comande degli hamburger arrivano una dopo l'altra. Frigo (la carne) → piastra (col dito:
 * sulla piastra, girala quando è verde, sul panino quando è cotta, vedi GrillStation) → bancone (componi il
 * panino come sullo scontrino, salsa a zig-zag, vedi BurgerStation) → passe. Errori permessi: contano alla fine.
 */
export function cookLineJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('piatti', lineLevel);
  const n = Math.round(3 + 2 * t);
  // ai livelli alti: cottura più veloce (finestra del verde più stretta) e panini più ricchi
  const cookT = 5.5 - 1.8 * t;
  const room = game.enterArena(new Room({ w: 9, d: 7, tiles: true, sign: '🍔 Cucina', slot, placed }));
  const tops = Object.keys(TOPPINGS) as Topping[];
  const sauces = Object.keys(SAUCES) as Sauce[];
  const orders = Array.from({ length: n }, (): Step[] => [
    ...pickN(tops, 1 + Math.round(t * 1.5) + (Math.random() < 0.4 ? 1 : 0)).map((k): Step => ({ t: 'top', k })),
    ...pickN(sauces, t > 0.6 && Math.random() < 0.5 ? 2 : 1).map((k): Step => ({ t: 'sauce', k })),
    { t: 'bun' },
  ]);
  type Stage = 'raw' | 'cooked' | 'ready';
  let holding: { stage: Stage; q: number; q2: number } | null = null;
  const qs: number[] = [];
  let next = 0;
  let served = 0;
  let run: PhasedRun;
  const fridge = room.furn('kitchenFridgeLarge', -3.6, -2.9, 0, 1.5);
  const fridgeAt = room.near(-3.6, -2.9, 0, 0.7);
  const stove = room.furn('kitchenStove', -1.4, -3.0, 0);
  const stoveAt = room.near(-1.4, -3.0, 0, 0.6);
  const benchRow = room.furnRow('kitchenCabinet', 0.4, 2.2, -3.0, true);
  const bench = benchRow[Math.floor(benchRow.length / 2)];
  const benchAt = room.near(1.3, -3.0, 0, 0.6);
  const passRow = room.furnRow('kitchenCabinet', -1.7, 0.3, 3.4, false, -Math.PI / 2);
  const pass = passRow[Math.floor(passRow.length / 2)];
  const passAt = room.near(3.4, -0.7, -0.7, 0);
  const patty = (k: number) => new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 14), new THREE.MeshLambertMaterial({ color: k ? 0x84492c : 0xd65c6e }));
  const burger = () => {
    const g = new THREE.Group();
    const layer = (r: number, h: number, c: number, y: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), new THREE.MeshLambertMaterial({ color: c }));
      m.position.y = y;
      g.add(m);
    };
    layer(0.12, 0.04, 0xe7a956, 0);
    layer(0.125, 0.04, 0x84492c, 0.04);
    layer(0.13, 0.015, 0x5cb85c, 0.07);
    layer(0.12, 0.06, 0xe39a45, 0.1);
    return g;
  };
  const cur = () => orders[Math.min(next, n - 1)];
  const phases: Phase[] = [{
    name: 'Prepara le comande', icon: '🍔', count: () => [served, n],
    tip: 'Prendi la <b>carne</b> dal frigo; alla <b>piastra</b> trascinala sulla piastra, <b>toccala per girarla</b> quando la barra è verde e trascinala sul <b>panino</b> quando è cotta. Al <b>bancone</b> componi il panino come sullo <b>scontrino</b> (la salsa a <b>zig-zag</b> con la bottiglia) e portalo al <b>passe 🛎️</b>',
    tasks: () => [
      {
        pos: fridgeAt, kind: 'tap', repeat: true, quiet: true, label: 'Prendi la carne dal frigo', icon: '🥩', obj: fridge.obj,
        enabled: () => !holding && next < n,
        onDone: () => {
          holding = { stage: 'raw', q: 1, q2: 1 };
          hold(game, patty(0));
        },
      },
      {
        pos: stoveAt, kind: 'tap', repeat: true, quiet: true, label: 'Cuoci sulla piastra', icon: '🔥', obj: stove.obj,
        enabled: () => holding?.stage === 'raw',
        onDone: () => {
          hold(game);
          run.openStation(new GrillStation(cookT, (q) => {
            if (!holding) return;
            holding = { stage: 'cooked', q, q2: 1 };
            hold(game, patty(1));
            toast(q >= 0.85 ? '✨ Cottura perfetta' : q >= 0.5 ? '🥩 Cottura così così' : '🔥 Cottura sbagliata', q >= 0.85 ? 'good' : 'bad');
          }));
        },
      },
      {
        pos: benchAt, kind: 'tap', repeat: true, quiet: true, label: 'Componi il panino', icon: '🍔', obj: bench.obj,
        enabled: () => holding?.stage === 'cooked',
        onDone: () => {
          hold(game);
          const q1 = holding!.q;
          run.openStation(new BurgerStation(cur(), q1, (q) => {
            if (!holding) return;
            holding = { stage: 'ready', q: q1, q2: q };
            hold(game, burger());
            if (q < 0.7) toast('🧾 Il panino non è come sullo scontrino', 'bad');
          }));
        },
      },
      {
        pos: passAt, kind: 'tap', repeat: true, quiet: true, label: 'Porta il panino al passe', icon: '🛎️', obj: pass.obj,
        enabled: () => holding?.stage === 'ready',
        onDone: () => {
          qs.push(holding!.q2);
          holding = null;
          hold(game);
          next++;
          served++;
          run.starCap = capFrom(qs);
          if (served >= n) run.finishPhase();
        },
      },
    ],
  }];
  run = new PhasedRun(game, 1, title, phases, { time: Math.min(290, 40 + n * 48) });
  tag(run, '🥩 Frigo', fridgeAt, 2.9);
  tag(run, '🔥 Piastra', stoveAt, 1.6);
  tag(run, '🍔 Bancone', benchAt, 1.6);
  tag(run, '🛎️ Passe', passAt, 1.7, '#e8590c');
  // vaschette degli ingredienti sul bancone
  tops.forEach((k, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.2), new THREE.MeshLambertMaterial({ color: new THREE.Color(TOPPINGS[k].color) }));
    m.userData.noGlow = true;
    run.prop(m, room.at(1.3, -3.0).add(new THREE.Vector3(-0.5 + i * 0.2, bench.top + 0.03, 0.05)), 0, 1);
  });
  // le comande in grande: blu da iniziare, giallo in cottura/da assemblare, verde pronto per il passe
  run.chips = () => orders.map((_, i): Chip => ({ t: '🍔', s: i < served ? 'done' : i === served && holding ? (holding.stage === 'ready' ? 'ready' : 'prep') : 'todo' }));
  // e a che punto è il panino in mano (la comanda si legge sullo scontrino al bancone)
  run.extraStatus = () => (holding ? { raw: 'carne cruda: alla piastra', cooked: 'carne cotta: al bancone', ready: 'panino pronto: al passe' }[holding.stage] : '');
  return run;
}

// ======================================================================================
// Forno: panettiere notturno
// ======================================================================================

/**
 * Impasti del panettiere notturno: icona, nome, se serve il burro (sfoglia), colore dell'impasto e ricetta di base
 * per l'impastatrice (acqua in ml, lievito e sale in grammi; ogni ordine del foglio la cambia un po').
 */
const BREADS = {
  pagnotta: { icon: '🍞', name: 'pagnotta', butter: false, color: 0xe2c08d, recipe: { acqua: 600, lievito: 12, sale: 18 } },
  filone: { icon: '🥖', name: 'filone', butter: false, color: 0xe8cf9f, recipe: { acqua: 540, lievito: 10, sale: 15 } },
  cornetti: { icon: '🥐', name: 'cornetti', butter: true, color: 0xf2d27a, recipe: { acqua: 300, lievito: 20, sale: 8 } },
} as const;
type Bread = keyof typeof BREADS;

/**
 * Impastatrice a spirale in 3D sopra il mobile: vasca d'acciaio che gira, gancio a spirale, l'impasto che da
 * mucchio di farina diventa una palla liscia, e gli ingredienti che cadono dentro mentre si versano.
 */
function mixerModel(run: PhasedRun, at: THREE.Vector3): MixerView & { group: THREE.Group; reset: () => void } {
  const steel = new THREE.MeshLambertMaterial({ color: 0xc9d0d8, side: THREE.DoubleSide });
  const dark = new THREE.MeshLambertMaterial({ color: 0x66708a });
  const g = new THREE.Group();
  // base e vasca (aperta in alto)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.08, 28), dark);
  base.position.y = 0.04;
  g.add(base);
  const bowl = new THREE.Group();
  const pts = [new THREE.Vector2(0, 0.08), new THREE.Vector2(0.3, 0.08), new THREE.Vector2(0.4, 0.16), new THREE.Vector2(0.42, 0.42), new THREE.Vector2(0.44, 0.44)];
  bowl.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 32), steel));
  // segni sul bordo: si vede che la vasca gira
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.04), dark);
    const a = (i / 6) * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.43, 0.445, Math.sin(a) * 0.43);
    m.rotation.y = -a;
    bowl.add(m);
  }
  g.add(bowl);
  // impasto: mucchio di farina all'inizio
  const doughMat = new THREE.MeshLambertMaterial({ color: 0xf3ead7 });
  const dough = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), doughMat);
  dough.position.y = 0.13;
  bowl.add(dough);
  // gancio a spirale, fisso, un po' fuori centro
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 16, Math.PI * 1.4), dark);
  hook.rotation.x = Math.PI / 2;
  hook.position.set(0.1, 0.36, 0);
  g.add(hook);
  g.scale.setScalar(0.78);
  run.prop(g, at.clone(), 0, 1).userData.noGlow = true;
  const drops: { m: THREE.Mesh; v: number }[] = [];
  const colors: Record<MixIng, number> = { acqua: 0x6ec6ff, lievito: 0xc9a26b, sale: 0xffffff };
  const dropGeo = new THREE.SphereGeometry(0.022, 6, 4);
  let spawn = 0;
  const flour = new THREE.Color(0xf3ead7);
  const wetC = new THREE.Color(0xe2c08d);
  const reset = () => {
    dough.scale.set(1, 0.45, 1);
    doughMat.color.copy(flour);
    for (const d of drops) g.remove(d.m);
    drops.length = 0;
  };
  reset();
  return {
    group: g,
    reset,
    frame(dt, p, wet, pouring) {
      // la vasca gira sempre più in fretta, il gancio gira al contrario
      bowl.rotation.y += dt * (2 + 3 * p);
      hook.rotation.z -= dt * 7;
      // l'impasto: più acqua = palla più alta e liscia, più scura (fino a un po' troppo bagnata)
      const w = Math.min(1.3, wet);
      dough.scale.set(1 - 0.12 * Math.min(1, w), 0.45 + 0.4 * Math.min(1, w), 1 - 0.12 * Math.min(1, w));
      doughMat.color.copy(flour).lerp(wetC, Math.min(1, w));
      if (w > 1.1) doughMat.color.offsetHSL(0, 0, 0.06);
      // ingredienti che cadono dentro dall'alto
      if (pouring) {
        spawn += dt * (pouring === 'acqua' ? 40 : 22);
        while (spawn >= 1) {
          spawn--;
          const m = new THREE.Mesh(dropGeo, new THREE.MeshLambertMaterial({ color: colors[pouring] }));
          m.position.set(-0.12 + (Math.random() - 0.5) * 0.08, 0.75, 0.12 + (Math.random() - 0.5) * 0.08);
          g.add(m);
          drops.push({ m, v: 0 });
        }
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.v += 9 * dt;
        d.m.position.y -= d.v * dt;
        if (d.m.position.y < 0.3) {
          g.remove(d.m);
          drops.splice(i, 1);
        }
      }
    },
  };
}

/**
 * Panettiere notturno: si preparano gli impasti per la mattina, niente forno. Il foglio degli ordini dice cosa
 * fare, uno dopo l'altro: farina → nell'impastatrice (la camera va dall'alto sulla vasca: acqua, lievito e sale al
 * momento giusto e nella quantità della ricetta, vedi MixerStation) → per i cornetti il burro dal frigo → banco
 * (dai la forma, tieni premuto) → la cella di lievitazione, sul ripiano del suo tipo. Il ripiano sbagliato si
 * può scegliere, ma conta alla fine (meno stelle e paga).
 */
export function ovenJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('forno', lineLevel);
  const n = Math.round(4 + 3 * t);
  const room = game.enterArena(new Room({ w: 9, d: 7, floor: 0xd9b48a, wall: 0xf6e7c8, sign: '🥖 Forno', slot, placed }));
  const kinds: Bread[] = t < 0.4 ? ['pagnotta', 'filone'] : ['pagnotta', 'filone', 'cornetti'];
  // il foglio della notte: mai due uguali di fila all'inizio, poi a caso
  const orders: Bread[] = Array.from({ length: n }, (_, i) => kinds[i < kinds.length ? i : Math.floor(Math.random() * kinds.length)]);
  for (let i = kinds.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [orders[i], orders[k]] = [orders[k], orders[i]]; }
  type Stage = 'flour' | 'dough' | 'butter' | 'shaped';
  // q: qualità dell'impasto (impastare e forma, col dito)
  let holding: { stage: Stage; b: Bread; q: number; r: Record<MixIng, number> } | null = null;
  const qs: number[] = [];
  // ai livelli alti impastatrice più veloce, finestre più strette, quantità più precise e sagoma più precisa
  const tol = 0.075 - 0.025 * t;
  const mixDur = 15 - 4 * t;
  const mixTol = 0.1 - 0.04 * t;
  // secondi per versare la quantità giusta tenendo premuto (sempre meno della finestra)
  const pourSec = 1.8 - 0.6 * t;
  const winW = 1 - 0.4 * t;
  const win = (c: number, wd: number): [number, number] => [c - (wd * winW) / 2, c + (wd * winW) / 2];
  const mixWin: Record<MixIng, [number, number]> = { acqua: win(0.2, 0.3), lievito: win(0.48, 0.24), sale: win(0.76, 0.24) };
  // ogni ordine del foglio ha la sua ricetta (un po' diversa da quella di base): va letta
  const vary = (v: number, unit: number) => Math.max(unit, Math.round((v * (0.85 + Math.random() * 0.3)) / unit) * unit);
  const recipes = orders.map((b) => {
    const r = BREADS[b].recipe;
    return { acqua: vary(r.acqua, 10), lievito: vary(r.lievito, 1), sale: vary(r.sale, 1) } as Record<MixIng, number>;
  });
  let next = 0;
  let done = 0;
  let wrong = 0;
  let run: PhasedRun;
  const sack = crate(0.6, 0xf3ead7, 0xe8d3a8);
  const flourAt = room.at(-3.5, -2.3);
  const mixer = room.furn('kitchenCabinet', -1.8, -3.0, 0);
  const mixerAt = room.near(-1.8, -3.0, 0, 0.6);
  let mix: ReturnType<typeof mixerModel>;
  const fridge = room.furn('kitchenFridge', 1.0, -3.0, 0);
  const fridgeAt = room.near(1.0, -3.0, 0, 0.7);
  const table = room.furn('table', 0, -0.4, 0);
  const tableAt = room.near(0, -0.4, 0, 0.7);
  // cella di lievitazione: un ripiano per tipo, lungo la parete di destra
  const racks = kinds.map((b, k) => {
    const z = -1.6 + k * 1.4;
    const f = room.furn('kitchenCabinet', 3.6, z, -Math.PI / 2);
    // impasti a lievitare (posti fissi: uno ripreso in mano libera il suo)
    return { b, obj: f.obj, top: f.top, pos: room.near(3.6, z, -0.7, 0), at: room.at(3.6, z), slots: [] as ({ b: Bread; q: number; m: THREE.Object3D } | null)[] };
  });
  // stelle da quello che c'è adesso sui ripiani: l'impasto sul ripiano sbagliato vale poco
  const score = () => {
    qs.length = 0;
    wrong = 0;
    for (const r of racks) for (const x of r.slots) {
      if (!x) continue;
      if (x.b !== r.b) wrong++;
      qs.push(x.b === r.b ? x.q : x.q * 0.3);
    }
    run.starCap = capFrom(qs);
  };
  const doughM = (b: Bread) => {
    const m = new THREE.Mesh(b === 'filone' ? new THREE.CapsuleGeometry(0.09, 0.32, 4, 8) : b === 'cornetti' ? new THREE.TorusGeometry(0.11, 0.05, 6, 10, Math.PI) : new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshLambertMaterial({ color: BREADS[b].color }));
    if (b === 'filone') m.rotation.z = Math.PI / 2;
    const g = new THREE.Group();
    g.add(m);
    return g;
  };
  const cur = () => orders[Math.min(next, n - 1)];
  const phases: Phase[] = [{
    name: 'Prepara gli impasti', icon: '🥖', count: () => [done, n],
    tip: 'Segui il <b>foglio degli ordini</b>: prendi la <b>farina</b> e mettila nell\'<b>impastatrice</b>. Mentre gira, aggiungi <b>acqua</b>, <b>lievito</b> e <b>sale</b> quando arriva il loro momento sulla barra: tieni premuto e lascia sul numero della ricetta. Per i <b>cornetti</b> prendi il <b>burro</b> dal frigo, dai la <b>forma</b> al banco seguendo la sagoma e metti l\'impasto a <b>lievitare</b> sul ripiano del suo tipo. Ripiano sbagliato? Tocca l\'impasto per riprenderlo, prima di mettere l\'ultimo',
    tasks: () => [
      { pos: flourAt, kind: 'tap', repeat: true, quiet: true, label: 'Prendi la farina', icon: '🌾', enabled: () => !holding && next < n, onDone: () => { holding = { stage: 'flour', b: cur(), q: 1, r: recipes[next] }; next++; hold(game, crate(0.3, 0xf3ead7)); } },
      {
        // la farina nell'impastatrice: la camera va dall'alto sulla vasca e si aggiungono acqua, lievito e sale
        pos: mixerAt, kind: 'tap', repeat: true, quiet: true, label: 'Metti la farina nell\'impastatrice', icon: '🌀', obj: mixer.obj, enabled: () => holding?.stage === 'flour',
        onDone: () => {
          const h = holding!;
          hold(game);
          mix.reset();
          mixTag.visible = false;
          const st = new MixerStation({
            title: `🌀 Impastatrice · ${BREADS[h.b].icon} ${BREADS[h.b].name}`,
            recipe: h.r, dur: mixDur, win: mixWin, tol: mixTol,
            // versare la quantità giusta dura `pourSec`: lasciare il dito al momento giusto conta
            rate: Object.fromEntries((Object.keys(mixWin) as MixIng[]).map((k) => [k, h.r[k] / pourSec])) as Record<MixIng, number>,
            view: mix,
          }, (q) => {
            mixTag.visible = true;
            if (!holding) return;
            holding = { stage: 'dough', b: h.b, q, r: h.r };
            hold(game, crate(0.28, 0xf6e7c8));
            if (st.verdict) toast(`🌀 ${st.verdict}`, 'bad');
            else if (q >= 0.85) toast('🌀 Impasto perfetto!', 'good');
          });
          run.openStation(st);
          game.camFocus = { at: mix.group.getWorldPosition(new THREE.Vector3()).setY(mix.group.position.y + 0.25), size: 1.1, rect: () => st.viewRect(), alive: () => !st.closed };
        },
      },
      { pos: fridgeAt, kind: 'tap', repeat: true, quiet: true, label: 'Prendi il burro per la sfoglia', icon: '🧈', obj: fridge.obj, enabled: () => holding?.stage === 'dough' && BREADS[holding.b].butter, onDone: () => { holding = { ...holding!, stage: 'butter' }; } },
      {
        // dare la forma: si segue col dito la sagoma del prodotto
        pos: tableAt, kind: 'tap', repeat: true, quiet: true, get label() { return holding ? `Dai la forma: ${BREADS[holding.b].icon} ${BREADS[holding.b].name}` : 'Dai la forma'; }, icon: '👐', obj: table.obj,
        enabled: () => !!holding && (holding.stage === 'butter' || (holding.stage === 'dough' && !BREADS[holding.b].butter)),
        onDone: () => {
          const b = holding!.b;
          run.openStation(new ShapeStation(BREADS[b].name, BREADS[b].icon, SHAPE_PATHS[b], tol, (q) => {
            if (!holding) return;
            holding = { stage: 'shaped', b, q: (holding.q + q) / 2, r: holding.r };
            hold(game, doughM(b));
            if (q < 0.7) toast(`👐 ${BREADS[b].icon} Forma un po' storta`, 'bad');
          }));
        },
      },
      ...racks.map((r): Task => ({
        pos: r.pos, kind: 'tap', repeat: true, quiet: true, label: `Metti a lievitare: ripiano ${BREADS[r.b].icon}`, icon: BREADS[r.b].icon, obj: r.obj,
        enabled: () => holding?.stage === 'shaped',
        get right() { return holding?.b === r.b; },
        onDone: () => {
          // il ripiano sbagliato si può scegliere: si può riprendere, altrimenti si paga alla fine
          const b = holding!.b;
          const q = holding!.q;
          const d = doughM(b);
          d.userData.noGlow = true;
          let k = r.slots.indexOf(null);
          if (k < 0) k = r.slots.length;
          run.prop(d, r.at.clone().add(new THREE.Vector3(0, r.top + 0.12, -0.5 + (k % 4) * 0.33)), 0, 1);
          r.slots[k] = { b, q, m: d };
          holding = null;
          hold(game);
          done++;
          if (b !== r.b) {
            run.retake(d, `Riprendi: ${BREADS[b].icon} ${BREADS[b].name}`, BREADS[b].icon, () => !holding && done < n, () => {
              d.visible = false;
              r.slots[k] = null;
              done--;
              holding = { stage: 'shaped', b, q, r: recipes[0] };
              hold(game, doughM(b));
              score();
            });
          }
          score();
          if (done >= n) {
            toast(wrong ? `🧺 ${wrong} ${wrong === 1 ? 'impasto sul ripiano sbagliato' : 'impasti sui ripiani sbagliati'}` : '🌙 Tutti gli impasti a lievitare: domattina si inforna!', wrong ? 'bad' : 'good');
            run.finishPhase();
          }
        },
      })),
    ],
  }];
  run = new PhasedRun(game, 1, title, phases, { time: 40 + n * 36 });
  mix = mixerModel(run, room.at(-1.8, -3.0).add(new THREE.Vector3(0, mixer.top, 0)));
  run.prop(sack, flourAt.clone().add(new THREE.Vector3(0, 0, -0.5)), 0, 1);
  tag(run, '🌾 Farina', flourAt, 1.4);
  const mixTag = tag(run, '🌀 Impastatrice', mixerAt, 1.7);
  if (kinds.includes('cornetti')) tag(run, '🧈 Burro', fridgeAt, 2.2);
  tag(run, '👐 Banco', tableAt, 1.5);
  for (const r of racks) tag(run, `${BREADS[r.b].icon} Lievitazione`, r.pos, 1.8, '#8e5bd6');
  // il foglio degli ordini in grande: blu da iniziare, giallo in lavorazione, verde con la forma (a lievitare)
  run.chips = () => orders.map((b, i): Chip => ({ t: BREADS[b].icon, s: i < done ? 'done' : i === done && holding ? (holding.stage === 'shaped' ? 'ready' : 'prep') : 'todo' }));
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
 * La tazza che il barista tiene in mano, diversa per ogni passo: vuota (bianca dentro), caffè (scuro),
 * cappuccino (schiuma bianca alta col cuore di cacao), tè (ambra con la bustina). Così si vede cosa c'è dentro.
 */
function barCup(what: 'cup' | Drink) {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.16, 18, 1, true), white);
  body.material.side = THREE.DoubleSide;
  body.position.y = 0.08;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.08, 18), white);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.002;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 12), white);
  handle.position.set(0.12, 0.08, 0);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.015, 20), white);
  g.add(body, bottom, handle, plate);
  const top = (color: number, y: number) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.105, 18), new THREE.MeshLambertMaterial({ color }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    g.add(m);
    return m;
  };
  if (what === 'espresso') top(0x4a2a12, 0.12);
  if (what === 'cappuccino') {
    // la schiuma sale sopra il bordo, col cuore di cacao
    const foam = new THREE.Mesh(new THREE.SphereGeometry(0.108, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), white);
    foam.scale.y = 0.45;
    foam.position.y = 0.155;
    g.add(foam);
    const heart = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), new THREE.MeshLambertMaterial({ color: 0x8a5a2b }));
    heart.rotation.x = -Math.PI / 2;
    heart.position.y = 0.205;
    g.add(heart);
  }
  if (what === 'te') {
    top(0xc9741a, 0.13);
    const tag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.005), new THREE.MeshLambertMaterial({ color: 0xffc21a }));
    tag.position.set(-0.12, 0.12, 0);
    g.add(tag);
  }
  g.scale.setScalar(1.6);
  return g;
}

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
  const cupsAt = room.near(-3.4, -3.0, 0, 0.8);
  const cups = room.furn('kitchenCabinet', -3.4, -3.0, 0);
  // le macchine sopra i mobili, mai a terra
  const machine = room.furnOn('kitchenCabinet', 'kitchenCoffeeMachine', -1.2, -3.0, 0, 3);
  const machineAt = room.near(-1.2, -3.0, 0, 0.8);
  const milk = room.furnOn('kitchenCabinet', 'kitchenBlender', 0.6, -3.0, 0, 3);
  const milkAt = room.near(0.6, -3.0, 0, 0.8);
  const kettle = room.furnOn('kitchenCabinet', 'toaster', 2.2, -3.0, 0, 3);
  const kettleAt = room.near(2.2, -3.0, 0, 0.8);
  // si serve al centro del bancone: il primo della fila è lì davanti
  const serveAt = room.near(-0.75, -0.6, 0, -0.65);
  const headAt = room.near(-0.75, -0.6, 0, 0.8);
  // la fila: uno dietro l'altro, un po' di sbieco verso sinistra (lontano dalla porta, e si vedono tutti i fumetti)
  const spotAt = (k: number) => headAt.clone().add(new THREE.Vector3(-k * 0.65, 0, k * 0.7));
  const queue: Character[] = [];
  const bubbles: THREE.Sprite[] = [];
  // fumetto: il primo della fila (giallo) dice cosa vuole per esteso, gli altri il numero e la bevanda
  const setBubble = (i: number) => {
    const c = queue[i];
    if (bubbles[i]) c.root.remove(bubbles[i]);
    const first = i === served;
    const s = label(first ? `👉 ${DRINKS[orders[i]].icon} ${DRINKS[orders[i]].name}` : `${i - served + 1}° ${DRINKS[orders[i]].icon}`, { bg: first ? '#ffc21a' : '#ffffff', fg: '#3a2f55', scale: first ? 0.75 : 0.8 });
    // chi è più indietro ha il fumetto più in alto: dal bancone si leggono uno sopra l'altro
    s.position.set(0, 2.25 + (i - served) * 0.45, 0);
    s.userData.noGlow = true;
    c.root.add(s);
    bubbles[i] = s;
  };
  // ogni passo cambia la tazza in mano; quando c'è proprio quello che chiede il primo della fila lo si dice subito
  const fill = (what: 'cup' | Drink) => {
    holding = what;
    hold(game, barCup(what));
    const want = orders[served];
    if (what === want) toast(`✅ ${DRINKS[want].name[0].toUpperCase() + DRINKS[want].name.slice(1)} pronto: servilo al bancone!`, 'good');
  };
  const phases: Phase[] = [{
    name: 'Servi i clienti in ordine', icon: '☕', count: () => [served, n],
    tip: 'Guarda cosa chiede il <b>primo della fila</b>: prendi una <b>tazza</b>, fai il caffè alla <b>macchina</b> (tieni premuto). Cappuccino: poi il <b>latte montato</b>. Tè: il <b>bollitore</b>. Poi servi al bancone',
    tasks: () => [
      { pos: cupsAt, kind: 'tap', repeat: true, quiet: true, label: 'Prendi una tazza', icon: '☕', obj: cups.obj, enabled: () => !holding && served < n, onDone: () => fill('cup') },
      { pos: machineAt, kind: 'hold', sec: 1.4, repeat: true, quiet: true, label: 'Fai il caffè', icon: '⚙️', obj: machine.obj, fx: 'bubble', fxColor: 0x6b3e1e, enabled: () => holding === 'cup', onDone: () => fill('espresso') },
      { pos: milkAt, kind: 'hold', sec: 1.2, repeat: true, quiet: true, label: 'Monta il latte', icon: '🥛', obj: milk.obj, fx: 'bubble', enabled: () => holding === 'espresso', onDone: () => fill('cappuccino') },
      { pos: kettleAt, kind: 'hold', sec: 1.2, repeat: true, quiet: true, label: 'Acqua calda per il tè', icon: '🍵', obj: kettle.obj, fx: 'bubble', enabled: () => holding === 'cup', onDone: () => fill('te') },
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
            if (i < served) return;
            c.root.position.copy(spotAt(i - served));
            setBubble(i);
          });
          if (served >= n) run.finishPhase();
        },
      },
    ],
  }];
  run = new PhasedRun(game, 1, title, phases, { time: 30 + n * 20 });
  orders.forEach((_o, i) => {
    queue.push(npc(run, spotAt(i), i + 2, Math.PI));
    setBubble(i);
  });
  tag(run, '☕ Tazze', cupsAt, 1.6);
  tag(run, '⚙️ Macchina', machineAt, 1.9);
  tag(run, '🥛 Latte', milkAt, 1.7);
  if (kinds.includes('te')) tag(run, '🍵 Bollitore', kettleAt, 1.6);
  run.onTick = (dt) => queue.forEach((c) => c.update(dt));
  // la fila in ordine nella barra: il primo (quello da servire) e i prossimi
  // in grande: l'ordine del primo della fila (col nome) e i prossimi
  // il primo: blu da iniziare, giallo in preparazione, verde quando in mano c'è proprio quello che vuole
  // il primo dice anche a che punto sei: cosa manca, o "pronto" quando è da servire
  const missing = (d: Drink): string => {
    if (!holding || holding === d) return '';
    if (holding === 'cup') return d === 'te' ? 'acqua calda' : 'caffè';
    if (holding === 'espresso' && d === 'cappuccino') return 'latte';
    return 'sbagliato';
  };
  run.chips = () => orders.slice(served, served + 4).map((d, i): Chip => {
    const name = `${DRINKS[d].icon} ${DRINKS[d].name}`;
    if (i) return { t: DRINKS[d].icon, s: 'todo' };
    if (!holding) return { t: name, s: 'todo' };
    if (holding === d) return { t: `✅ ${DRINKS[d].name} pronto`, s: 'ready' };
    return { t: `${name} · ${missing(d) === 'sbagliato' ? 'sbagliato!' : 'manca ' + missing(d)}`, s: 'prep' };
  });
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
  const passAt = room.near(0, -3.6, 0, 0.6);
  room.furnRow('kitchenCabinet', -1, 1, -3.6, true);
  const regAt = room.near(4.0, -3.6, 0, 0.6);
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
          fillTextIco(g, '🧾 il conto!', 128, 34);
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
  let desk: THREE.Object3D | undefined;
  let wrong = 0;
  let delivered = 0;
  const done = new Set<(typeof bags)[number]>();
  let run: PhasedRun;
  const doorTasks = (b: (typeof bags)[number]): Task[] => doors.map((d) => ({
    pos: d.pos.clone().add(new THREE.Vector3(-d.side * 0.5, 0, 0)), kind: 'tap', quiet: true, label: `Lascia alla porta ${d.num}`, icon: '🚪',
    group: 'bag' + bags.indexOf(b), right: d === b.door,
    onDone: () => {
      done.add(b);
      holding = null;
      hold(game);
      delivered++;
      const v = crate(0.4, 0x2d6cdb);
      run.prop(v, d.pos.clone().add(new THREE.Vector3(-d.side * 0.45, 0, 0.5)), 0, 1).userData.noGlow = true;
      // alla porta sbagliata: si può riprendere e portare alla camera giusta (conta solo se resta lì alla fine)
      if (d !== b.door) {
        wrong++;
        run.retake(v, `Riprendi la valigia (camera ${b.door.num})`, '🧳', () => !holding, () => {
          v.visible = false;
          done.delete(b);
          delivered--;
          wrong--;
          run.starCap = wrong >= 2 ? 1 : wrong ? 2 : 3;
          holding = b;
          hold(game, crate(0.45, 0x2d6cdb));
        }, () => doorTasks(b));
      }
      run.starCap = wrong >= 2 ? 1 : wrong ? 2 : 3;
    },
  }));
  const phases: Phase[] = [
    {
      name: 'Porta le valigie in camera', icon: '🧳', count: () => [delivered, n],
      tip: 'Prendi una <b>valigia</b> alla reception e leggi il <b>numero sull\'etichetta</b>: portala alla porta con quel numero (i numeri sono sulle porte). Porta sbagliata? Tocca la valigia per riprenderla',
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
        // la receptionist aspetta accanto al banco con la bolla in mano: si tocca lei
        pos: room.near(-1.9, D / 2 - 1.6, 1.9, 0), kind: 'tap', quiet: true, label: 'Avvisa la reception: fatto!', icon: '🛎️', get obj() { return desk; },
        // con una valigia ripresa in mano prima la si porta in camera
        enabled: () => !holding,
        onDone: () => toast(wrong ? `🛎️ ${wrong} ${wrong === 1 ? 'valigia sbagliata' : 'valigie sbagliate'}: massimo ${run.starCap} stelle` : '🛎️ Tutte le valigie nella camera giusta!', wrong ? 'bad' : 'good'),
      }],
    },
  ];
  run = new PhasedRun(game, 1, title, phases, { time: 30 + n * 22 + doorsPerSide * 4 });
  // davanti al punto, verso la porta d'ingresso, girata verso il corridoio
  desk = run.finisher(room.near(-1.9, D / 2 - 1.6, 1.9, 0.9), Math.PI, '🛎️ Tutto consegnato? Dimmelo qui', 1);
  // porte con il numero, e le valigie con l'etichetta
  for (const d of doors) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 1.0), new THREE.MeshLambertMaterial({ color: 0x8a5a2b }));
    door.position.y = 1.05;
    const g = new THREE.Group();
    g.add(door);
    // la porta si illumina quando ci sei davanti (ed è lei che si tocca)
    run.prop(g, d.pos.clone(), 0, 1);
    // il numero è una targa sulla porta, rivolta al corridoio (non un'etichetta che fluttua)
    run.prop(numberPlate(String(d.num), 0.74, '#3a2f55', '#ffd76a'), d.pos.clone().add(new THREE.Vector3(-d.side * 0.075, 1.62, 0)), d.side < 0 ? Math.PI / 2 : -Math.PI / 2, 1);
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
  // le camere in grande nel riquadro: quella della valigia in mano in giallo, le fatte in verde
  run.chips = () => bags.map((b) => ({ t: `🚪 ${b.door.num}`, s: done.has(b) ? 'done' as const : holding === b ? 'next' as const : 'todo' as const }));
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
      { pos: room.near(cx - 0.6, -2.7, 0, 1.5), kind: 'hold', sec: 2, quiet: true, label: 'Rifai il letto', icon: '🛏️', obj: bed.obj, enabled: () => holding === 'lenzuola', onDone: () => { holding = null; hold(game); } },
      { pos: room.near(cx + 1.6, -3.2, 0, 0.8), kind: 'tap', quiet: true, label: 'Asciugamani puliti', icon: '🧺', obj: sink.obj, enabled: () => holding === 'asciugamani', onDone: () => { holding = null; hold(game); } },
      {
        pos: room.near(cx + 1.5, -0.4, 0, 0.7), kind: 'tap', quiet: true, label: 'Svuota il cestino', icon: '🗑️', obj: bin.obj, enabled: () => !holding,
        onDone: () => { holding = 'spazzatura'; hold(game, crate(0.3, 0x333333)); },
      },
      { pos: room.near(cx - 1.7, -0.6, 0, 0.7), kind: 'hold', sec: 1.4, quiet: true, label: 'Togli la polvere', icon: '🧹', obj: side.obj, fx: 'spark' },
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
  run.extraStatus = () => (holding && game.viewFirstPerson ? `in mano ${{ lenzuola: '🛏️', asciugamani: '🧺', spazzatura: '🗑️' }[holding]}` : '');
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
  const itemAt = (k: number) => room.near(-3.75 + k * 1.5, -3.6, 0, 0.4);
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
  run.extraStatus = () => [busy !== null ? `🙋 vuole ${guests[busy].r.icon}` : '', holding && game.viewFirstPerson ? `in mano ${holding}` : ''].filter(Boolean).join(' · ');
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
  const pantryAt = (k: number) => (k < 6 ? room.near(-4.4 + k * 1.5, -3.7, 0, 0.5) : room.near(-5.2, -1.4 + (k - 6) * 1.4, 0.5, 0));
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
        { pos: room.near(2.4, -1.2, 0, 0.8), kind: 'hold', sec: 2, label: 'Apparecchia il tavolo', icon: '🍽️' },
        { pos: room.near(4.4, -2.9, 0, 0.7), kind: 'tap', label: 'Metti i fiori nel vaso', icon: '💐' },
        { pos: room.near(1.0, -2.6, 0, 0.6), kind: 'tap', label: 'Accendi le candele', icon: '🕯️', fx: 'spark' },
        { pos: room.near(5.35, 1.2, -0.75, 0), kind: 'hold', sec: 1.4, label: 'Apri le tende', icon: '🪟' },
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
  // la lista in grande: già sul carrello, le altre
  run.chips = () => want.map((w) => ({ t: w.icon, s: onCart.includes(w.icon) ? 'done' as const : 'todo' as const }));
  return run;
}
