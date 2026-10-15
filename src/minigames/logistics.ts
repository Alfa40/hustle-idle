import * as THREE from 'three';
import { model } from '../assets';
import type { Game } from '../game';
import { rungOf, rungProgress } from '../config/careers';
import type { JobOffer } from '../sim/state';
import type { Slot } from '../world/city';
import { toast } from '../sim/bus';
import { label } from '../world/props';
import { bigPlanter, patioSet, roundShrub } from '../world/jobprops';
import { Character } from '../world/character';
import { CHAR_MODELS } from '../sim/economy';
import { Arena } from './arena';
import { PhasedRun, type JobRun, type Phase, type Task } from './jobs';
import { driveJob } from './drive';
import { PaintingsRun, PianoLiftRun, SortingRun, VanPuzzleRun } from './overlay';
import { crate, forklift, pallet, SHELF_COLORS, trolley, Warehouse, workBench, type Shelf } from './warehouse';

/**
 * Lavoretti di Trasporti e logistica (linea Magazzino e parte della linea Consegne): tutti "con le mani"
 * e sotto i 5 minuti. Quanto cresce il lavoro dentro un gradino lo decide `rungProgress` (0 → 1 nei
 * 9 livelli del gradino), come nella colonna "Cosa sale" di CARRIERE.md.
 */

const hold = (game: Game, obj?: THREE.Object3D) => game.player.hold(obj);

/**
 * Urti col mezzo o col carico: se spingi il joystick ma non ti muovi quasi per niente, hai urtato qualcosa.
 * Ogni urto (uno al secondo al massimo) chiama `onBump`.
 */
function bumpTracker(game: Game, onBump: () => void) {
  const last = new THREE.Vector3().copy(game.player.root.position);
  let cool = 0;
  let stuck = 0;
  return (dt: number) => {
    const p = game.player.root.position;
    const moved = p.distanceTo(last);
    last.copy(p);
    cool = Math.max(0, cool - dt);
    const v = game.input.vector;
    const push = Math.hypot(v.x, v.y);
    const speed = game.jobRide?.speed ?? 5;
    const exp = push * speed * dt;
    if (push > 0.45 && exp > 0.01 && moved < exp * 0.3) stuck += dt;
    else stuck = 0;
    if (stuck > 0.12 && !cool) {
      cool = 1.2;
      stuck = 0;
      onBump();
    }
  };
}

/** Lastrina che si accende su un ripiano: il posto dove appoggiare la scatola. */
function shelfSpot(color: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.5), new THREE.MeshLambertMaterial({ color }));
  return m;
}

// ---------------- Magazziniere (Magazzino, gradino 1) ----------------

/**
 * Magazziniere: le scatole scaricate dal camion stanno davanti alla banchina. Si prende una scatola
 * (le pesanti tenendo premuto, e si cammina più piano) e si appoggia sullo scaffale giusto: per colore
 * fino al Liv. 4, per codice dal Liv. 5. Le pesanti vanno sul ripiano in basso, le leggere in alto.
 * Lo scaffale sbagliato costa secondi. Alla fine si firma la bolla al camion.
 */
export function shelvingJob(game: Game, lineLevel: number, wh: Warehouse, title: string) {
  const t = rungProgress('magazzino', lineLevel);
  const n = Math.round(6 + 4 * t);
  const codes = lineLevel >= 5;
  const nHeavy = t < 0.2 ? 0 : t < 0.6 ? 1 : 2;
  const O = wh.truck.rear;
  // scatole a terra davanti al camion, in due file
  const spots: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const row = i % 2;
    const col = Math.floor(i / 2);
    spots.push(new THREE.Vector3(O.x - 2.6 + col * 1.3 - (row ? 0.65 : 0), 0, O.z - 1.6 - row * 1.3));
  }
  type Item = { pos: THREE.Vector3; shelf: Shelf; heavy: boolean; top: boolean; obj?: THREE.Object3D };
  const items: Item[] = spots.map((pos, i) => {
    const shelf = wh.shelves[(i * 7 + Math.floor(Math.random() * 3)) % wh.shelves.length];
    const heavy = i < nHeavy;
    return { pos, shelf, heavy, top: !heavy };
  });
  items.sort(() => Math.random() - 0.5);
  let carrying: Item | null = null;
  const tagOf = (shelf: Shelf, top: boolean) => (codes ? `${shelf.code}${top ? 2 : 1}` : `${shelf.color.icon}${top ? '⬆️' : '⬇️'}`);
  let run: PhasedRun;
  // le lastrine sui ripiani: in basso a sinistra, in alto a destra
  const spotAt = (s: Shelf, top: boolean) => s.pos.clone().addScaledVector(s.front, 0.25).addScaledVector(s.side, top ? 0.65 : -0.65);
  const placeTasks = (it: Item): Task[] => {
    const g = `place${items.indexOf(it)}`;
    const out: Task[] = [];
    for (const s of wh.shelves) {
      for (const top of [false, true]) {
        const ok = s === it.shelf && top === it.top;
        out.push({
          pos: spotAt(s, top), kind: 'tap', label: `Appoggia sul ripiano ${top ? 'in alto' : 'in basso'}`, icon: top ? '⬆️' : '⬇️', markerText: tagOf(s, top),
          group: g, decoy: !ok, wrongText: it.heavy && top ? '❌ Le scatole pesanti vanno in basso' : '❌ Scaffale sbagliato: guarda il colore e la freccia',
          onDone: () => {
            carrying = null;
            run.speedMul = 1;
            hold(game);
            const c = run.prop(crate(0.5, 0xc8935a, codes ? 0x777777 : s.color.hex), spotAt(s, top).setY(s.boards[top ? 2 : 0]), Math.random() * 0.4, 1);
            c.userData.noGlow = true;
          },
        });
      }
    }
    return out;
  };
  const phases: Phase[] = [
    {
      name: 'Sistema le scatole sugli scaffali', icon: '📦', count: () => [items.filter((x) => x.obj && !x.obj.visible && x !== carrying).length, n],
      tip: codes
        ? 'Prendi una scatola e appoggiala sul ripiano col suo <b>codice</b> (la lettera è lo scaffale, <b>1 = in basso, 2 = in alto</b>). Le pesanti si sollevano tenendo premuto'
        : 'Prendi una scatola e appoggiala sullo scaffale del suo <b>colore</b>: la freccia dice il ripiano (<b>⬇️ in basso</b> per le pesanti, <b>⬆️ in alto</b> per le leggere)',
      tasks: () => items.map((it) => ({
        pos: it.pos, kind: it.heavy ? 'hold' as const : 'tap' as const, sec: 1.2, label: it.heavy ? 'Solleva la scatola pesante' : 'Prendi la scatola', icon: it.heavy ? '🏋️' : '📦',
        markerText: tagOf(it.shelf, it.top), enabled: () => !carrying, obj: it.obj,
        onDone: () => {
          carrying = it;
          if (it.obj) it.obj.visible = false;
          hold(game, crate(it.heavy ? 0.6 : 0.45, 0xc8935a, codes ? 0x777777 : it.shelf.color.hex));
          run.speedMul = it.heavy ? 0.6 : 1;
        },
        then: () => placeTasks(it),
      })),
    },
    {
      name: 'Firma la bolla al camion', icon: '🧾',
      tasks: () => [{ pos: O.clone().add(new THREE.Vector3(1.6, 0, -0.6)), kind: 'tap', label: 'Firma la bolla di consegna', icon: '🧾', obj: wh.truck.obj }],
    },
  ];
  run = new PhasedRun(game, 1, title, phases, { time: 30 + n * 15 + nHeavy * 5 });
  for (const it of items) {
    it.obj = run.prop(crate(it.heavy ? 0.75 : 0.55, it.heavy ? 0x9c6b3e : 0xc8935a, codes ? 0x777777 : it.shelf.color.hex), it.pos, Math.random() * 0.5, 1);
    it.obj.userData.solid = false;
    const tg = label(codes ? tagOf(it.shelf, it.top) : it.heavy ? '🏋️' : '📦', { bg: '#ffffff', fg: '#222', scale: 0.3 });
    tg.position.set(0, it.heavy ? 1.0 : 0.8, 0);
    it.obj.add(tg);
  }
  // le lastrine colorate dove si appoggia (si accendono quando sono da usare)
  for (const s of wh.shelves) {
    for (const top of [false, true]) {
      const pl = run.prop(shelfSpot(codes ? 0xdddddd : s.color.hex), spotAt(s, top).setY(s.boards[top ? 2 : 0] + 0.01), 0, 1);
      pl.userData.solid = false;
    }
  }
  run.extraStatus = () => (carrying ? `➡️ ${tagOf(carrying.shelf, carrying.top)}` : '');
  return run;
}

// ---------------- Carrellista (Magazzino, gradino 2) ----------------

/**
 * Carrellista: si sale sul muletto e si caricano i bancali sul camion. Davanti al bancale si tiene
 * premuto per alzare le forche (più è alto, più ci vuole), poi lo si porta al camion e si tiene premuto
 * per abbassarlo. Gli urti contro scaffali e muri rovinano il carico (meno stelle). Più livello: più
 * bancali, ripiani più alti e corsie più strette.
 */
export function forkliftJob(game: Game, lineLevel: number, wh: Warehouse, title: string) {
  const t = rungProgress('magazzino', lineLevel);
  const n = t < 0.5 ? 3 : 4;
  const parkAt = wh.entry.clone().add(new THREE.Vector3(-3.2, 0, 0));
  const lift = forklift();
  const forks = lift.userData.forks as THREE.Object3D;
  // bancali sugli scaffali (alcuni in alto, salendo di livello)
  type Pal = { shelf: Shelf; level: number; obj?: THREE.Object3D; pos: THREE.Vector3 };
  const shelves = [...wh.shelves].sort(() => Math.random() - 0.5).slice(0, n);
  const pals: Pal[] = shelves.map((s, i) => {
    const lv = t < 0.3 ? 0 : Math.min(s.boards.length - 1, i % (t < 0.7 ? 2 : 3));
    return { shelf: s, level: lv, pos: s.pos.clone().addScaledVector(s.front, 0.3) };
  });
  let carrying: Pal | null = null;
  let loaded = 0;
  let bumps = 0;
  let run: PhasedRun;
  const bump = bumpTracker(game, () => {
    if (!game.jobRide) return;
    bumps++;
    run.starCap = bumps >= 6 ? 1 : bumps >= 3 ? 2 : 3;
    toast(bumps >= 3 ? `💥 Urto! (${bumps}) Il carico si rovina: massimo ${run.starCap} stelle` : `💥 Urto! Guida più piano (${bumps})`, 'bad');
  });
  const slotPos = (i: number) => wh.truck.rear.clone().add(new THREE.Vector3(0, wh.truck.bedY, 0.9 + i * 1.25));
  const unloadTask = (p: Pal): Task => ({
    pos: wh.truck.rear.clone().add(new THREE.Vector3(0, 0, -0.4)), kind: 'hold', sec: 1.2, label: 'Abbassa il bancale nel camion', icon: '⬇️', obj: wh.truck.obj,
    onProgress: (k) => (forks.position.y = 0.12 + (wh.truck.bedY + 0.05) * (1 - k * 0.2)),
    onDone: () => {
      const o = p.obj!;
      forks.remove(o);
      o.position.copy(slotPos(loaded));
      o.rotation.y = 0;
      run.prop(o, o.position.clone(), 0, 1).userData.noGlow = true;
      loaded++;
      carrying = null;
      forks.position.y = 0.12;
    },
  });
  const phases: Phase[] = [
    {
      name: 'Sali sul muletto', icon: '🚜', tip: 'Il <b>muletto</b> giallo ti aspetta vicino all\'ingresso: sali',
      tasks: () => [{
        pos: parkAt, kind: 'tap', label: 'Sali sul muletto', icon: '🚜', obj: lift,
        onDone: () => {
          run.objsRemove(lift);
          lift.position.set(0, 0, 0);
          lift.rotation.set(0, 0, 0);
          lift.scale.setScalar(1);
          game.setJobRide({ obj: lift, speed: 4.6, radius: 0.85, fpHide: [lift.userData.body], showDriver: true, driverY: 0.55 });
        },
      }],
    },
    {
      name: 'Carica i bancali sul camion', icon: '🚛', count: () => [loaded, n],
      tip: 'Porta il muletto davanti a un <b>bancale</b> e <b>tieni premuto</b> per alzare le forche. Poi vai al <b>camion</b> e tieni premuto per abbassarlo. <b>Non urtare</b> scaffali e muri!',
      tasks: () => pals.map((p) => ({
        pos: p.pos, kind: 'hold' as const, sec: 1 + p.level * 0.5, label: p.level ? 'Alza le forche fino al bancale' : 'Infila le forche sotto il bancale', icon: '⬆️', enabled: () => !carrying, obj: p.obj,
        onProgress: (k: number) => (forks.position.y = 0.12 + (p.shelf.boards[p.level] - 0.12) * k),
        onDone: () => {
          carrying = p;
          const o = p.obj!;
          run.objsRemove(o);
          o.position.set(0, 0.05, 1.35);
          o.rotation.set(0, 0, 0);
          forks.add(o);
          // il bancale si porta basso
          forks.position.y = 0.35;
        },
        then: () => [unloadTask(p)],
      })),
    },
    {
      name: 'Parcheggia il muletto', icon: '🅿️',
      tasks: () => [{ pos: parkAt, kind: 'tap', label: 'Scendi dal muletto', icon: '🅿️', onDone: () => game.setJobRide(null) }],
    },
  ];
  run = new PhasedRun(game, 1, title, phases, { time: 45 + n * 32 });
  run.prop(lift, parkAt, Math.PI, 1);
  for (const p of pals) {
    p.obj = run.prop(pallet([0xc8935a, 0x2d6cdb, 0x2fb36b, 0xe5484d][pals.indexOf(p) % 4]), p.shelf.pos.clone().setY(p.shelf.boards[p.level]).addScaledVector(p.shelf.front, 0.05), 0, 1);
  }
  run.onTick = (dt) => bump(dt);
  run.extraStatus = () => (bumps ? `💥 ${bumps} urti` : '');
  return run;
}

// ---------------- Preparatore ordini (Magazzino, gradino 3) ----------------

/** Articoli sugli scaffali: alcuni si somigliano (il bello è non confonderli). */
const ARTICLES = ['👟', '🥾', '🎧', '📻', '⌚', '⏰', '🧸', '🪀', '📚', '📓', '☕', '🍵', '🧴', '🧼', '🎮', '🕹️', '💡', '🔦', '🧢', '👒', '🧤', '🧦', '🔧', '🔨'];

/**
 * Preparatore ordini: si prende il carrello e si cercano sugli scaffali gli articoli della lista (sono
 * tanti e alcuni si somigliano: quello sbagliato costa secondi). Niente frecce: gli articoli si cercano
 * leggendo le icone sugli scaffali. Poi si porta il carrello al banco delle spedizioni.
 */
export function pickingJob(game: Game, lineLevel: number, wh: Warehouse, title: string) {
  const t = rungProgress('magazzino', lineLevel);
  const n = t < 0.5 ? 5 : 6;
  const perShelf = 3;
  const slots = wh.shelves.length * perShelf;
  const pool = [...ARTICLES].sort(() => Math.random() - 0.5).slice(0, Math.min(ARTICLES.length, slots));
  // nella lista ci sono articoli che hanno un "gemello" simile in magazzino (dal livello medio)
  const order = pool.slice(0, n);
  const got = new Set<string>();
  const cartAt = wh.corner.clone();
  const bench = wh.corner.clone().add(new THREE.Vector3(-3.4, 0, 0));
  let hasCart = false;
  type Art = { icon: string; pos: THREE.Vector3; shelf: Shelf; y: number };
  const arts: Art[] = [];
  pool.forEach((icon, i) => {
    const s = wh.shelves[Math.floor(i / perShelf) % wh.shelves.length];
    const k = i % perShelf;
    arts.push({ icon, shelf: s, y: s.boards[1], pos: s.pos.clone().addScaledVector(s.front, 0.3).addScaledVector(s.side, (k - 1) * 0.8) });
  });
  arts.sort(() => Math.random() - 0.5);
  let run: PhasedRun;
  const phases: Phase[] = [
    {
      name: 'Prendi il carrello', icon: '🛒', tip: 'Prendi il <b>carrello</b> vicino all\'ingresso',
      tasks: () => [{ pos: cartAt, kind: 'tap', label: 'Prendi il carrello', icon: '🛒', onDone: () => { hasCart = true; hold(game, crate(0.4, 0x2d6cdb)); run.speedMul = 0.9; } }],
    },
    {
      name: `Prendi gli articoli della lista`, icon: '📋', count: () => [got.size, n],
      tip: `Cerca sugli scaffali gli articoli della lista <b>${order.join(' ')}</b> e prendili. Attento a quelli <b>simili</b>: se sbagli perdi tempo. Niente frecce: guarda le icone sugli scaffali`,
      tasks: () => arts.map((a) => {
        const ok = order.includes(a.icon);
        return {
          pos: a.pos, kind: 'tap' as const, label: `Prendi ${a.icon}`, icon: a.icon, quiet: true, decoy: !ok, wrongText: `❌ ${a.icon} non è nella lista`, enabled: () => hasCart,
          onDone: () => {
            got.add(a.icon);
            const o = game.scene.getObjectByName('art' + a.icon);
            if (o) o.visible = false;
          },
        };
      }),
    },
    {
      name: 'Porta il carrello al banco spedizioni', icon: '📦',
      tasks: () => [{ pos: bench, kind: 'tap', label: 'Consegna l\'ordine', icon: '📦', onDone: () => { hold(game); run.speedMul = 1; } }],
    },
  ];
  run = new PhasedRun(game, 1, title, phases, { time: 40 + n * 16 + wh.shelves.length * 2 });
  run.prop(trolley(), cartAt, Math.PI, 1).userData.solid = true;
  run.prop(workBench(2.4), bench, 0, 1).userData.solid = true;
  for (const a of arts) {
    const c = run.prop(crate(0.42, 0xd9b48a), a.pos.clone().setY(a.y), 0, 1);
    c.name = 'art' + a.icon;
    c.userData.solid = false;
    const tg = label(a.icon, { bg: '#ffffff', scale: 0.42 });
    tg.position.set(0, 0.6, 0.1);
    c.add(tg);
  }
  run.extraStatus = () => `📋 ${order.map((x) => (got.has(x) ? '✅' : x)).join(' ')}`;
  return run;
}

// ---------------- Addetto spedizioni (Magazzino, gradino 4) ----------------

const SIZES = [
  { id: 'S', name: 'piccola', size: 0.4 },
  { id: 'M', name: 'media', size: 0.6 },
  { id: 'L', name: 'grande', size: 0.8 },
];

/**
 * Addetto spedizioni: per ogni oggetto scegli la scatola della misura giusta (S, M, L), metti riempitivo e
 * nastro (tieni premuto) e attacca l'etichetta. Poi carica i pacchi nel furgone dall'ultimo al primo:
 * il numero è l'ordine di consegna, chi riceve per primo va messo per ultimo (vicino alle porte).
 */
export function shippingJob(game: Game, lineLevel: number, wh: Warehouse, title: string) {
  const t = rungProgress('magazzino', lineLevel);
  const n = t < 0.4 ? 2 : 3;
  const C = wh.corner.clone().add(new THREE.Vector3(-3, 0, -2.5));
  const arrivals = C.clone().add(new THREE.Vector3(-3.2, 0, 0));
  const bench = C.clone();
  const printer = C.clone().add(new THREE.Vector3(1.9, 0, 0));
  const ready = C.clone().add(new THREE.Vector3(0, 0, -2.6));
  const boxesAt = SIZES.map((_, i) => C.clone().add(new THREE.Vector3(-2.2 + i * 1.1, 0, 1.9)));
  const shapes = ['🧸', '🏺', '📚', '🎸', '💻', '🪴'];
  type Parcel = { num: number; size: (typeof SIZES)[number]; icon: string; pos: THREE.Vector3; obj?: THREE.Object3D; packed?: THREE.Object3D };
  const parcels: Parcel[] = [];
  for (let i = 0; i < n; i++) {
    parcels.push({ num: i + 1, size: SIZES[Math.floor(Math.random() * 3)], icon: shapes[(i + Math.floor(Math.random() * 6)) % shapes.length], pos: arrivals.clone().add(new THREE.Vector3((i - (n - 1) / 2) * 0.9, 0, 0)) });
  }
  let busy: Parcel | null = null;
  let packedN = 0;
  let loadedN = 0;
  let run: PhasedRun;
  const chain = (p: Parcel): Task[] => {
    const g = 'box' + p.num;
    return SIZES.map((sz, i) => ({
      pos: boxesAt[i], kind: 'tap' as const, label: `Scatola ${sz.name} (${sz.id})`, icon: '📦', markerText: sz.id, group: g, decoy: sz !== p.size,
      wrongText: `❌ Scatola ${sz.name}: ${p.icon} ci sta ${SIZES.indexOf(p.size) > i ? 'stretto' : 'largo'}`,
      then: () => [{
        pos: bench, kind: 'hold' as const, sec: 2, label: 'Riempitivo e nastro', icon: '🫧', fx: 'bubble' as const,
        then: () => [{
          pos: printer, kind: 'tap' as const, label: "Attacca l'etichetta", icon: '🏷️',
          onDone: () => {
            hold(game);
            busy = null;
            const o = run.prop(crate(p.size.size, 0xc8935a, 0xffffff), ready.clone().add(new THREE.Vector3((packedN - (n - 1) / 2) * 1.0, 0, 0)), 0, 1);
            o.userData.solid = false;
            const tg = label(`${p.num}`, { bg: '#2d6cdb', scale: 0.4 });
            tg.position.y = p.size.size + 0.3;
            o.add(tg);
            p.packed = o;
            packedN++;
          },
        }],
      }],
    }));
  };
  // carico: prima il numero più alto (ultima consegna), poi a scendere
  const loadStep = (): Task[] => {
    const left = parcels.filter((p) => p.packed?.visible);
    if (!left.length) return [];
    const want = Math.max(...left.map((p) => p.num));
    const g = 'load' + want;
    return left.map((p) => ({
      pos: p.packed!.position.clone(), kind: 'tap' as const, label: `Prendi il pacco ${p.num}`, icon: '📦', markerText: String(p.num), group: g, decoy: p.num !== want,
      wrongText: `❌ Prima il pacco ${want}: va caricato per primo chi riceve per ultimo`,
      onDone: () => {
        p.packed!.visible = false;
        hold(game, crate(p.size.size * 0.8, 0xc8935a, 0xffffff));
      },
      then: () => [{
        pos: wh.truck.rear.clone().add(new THREE.Vector3(0, 0, -0.4)), kind: 'tap' as const, label: `Carica il pacco ${p.num}`, icon: '🚐', obj: wh.truck.obj,
        onDone: () => {
          hold(game);
          loadedN++;
        },
        then: loadStep,
      }],
    }));
  };
  const phases: Phase[] = [
    {
      name: 'Imballa i pacchi', icon: '📦', count: () => [packedN, n],
      tip: 'Prendi un oggetto, scegli la scatola della <b>misura giusta</b> (S, M o L), poi al banco <b>riempitivo e nastro</b> (tieni premuto) e attacca l\'<b>etichetta</b>',
      tasks: () => parcels.map((p) => ({
        pos: p.pos, kind: 'tap' as const, label: `Prendi ${p.icon} (misura ${p.size.id})`, icon: p.icon, markerText: `${p.icon}${p.size.id}`, enabled: () => !busy,
        onDone: () => {
          busy = p;
          p.obj!.visible = false;
          hold(game, crate(p.size.size * 0.7, 0xeeeeee));
        },
        then: () => chain(p),
      })),
    },
    {
      name: "Carica dall'ultimo al primo", icon: '🚐', count: () => [loadedN, n],
      tip: 'Il numero è l\'<b>ordine di consegna</b>: carica prima il numero <b>più alto</b> e per ultimo il <b>1</b> (così è vicino alle porte quando arriva il suo turno)',
      tasks: loadStep,
    },
  ];
  run = new PhasedRun(game, 1, title, phases, { time: 35 + n * 42 });
  run.prop(workBench(2.6), arrivals, 0, 1).userData.solid = true;
  run.prop(workBench(2.2), bench, 0, 1).userData.solid = true;
  run.prop(workBench(2.6), ready, 0, 1).userData.solid = true;
  const pr = run.prop(crate(0.45, 0x33333d), printer.clone().setY(0), 0, 1);
  pr.userData.solid = true;
  SIZES.forEach((sz, i) => {
    const st = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const c = crate(sz.size, 0xc8935a);
      c.position.y = k * sz.size * 0.82;
      c.scale.y = 0.4;
      st.add(c);
    }
    run.prop(st, boxesAt[i], 0, 1);
  });
  for (const p of parcels) {
    // l'oggetto da spedire: grande quanto la sua misura
    const o = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(p.size.size * 0.42, 10, 8), new THREE.MeshLambertMaterial({ color: [0xe5484d, 0x2fb36b, 0x8e5bd6][p.num % 3] }));
    b.position.y = 0.95 + p.size.size * 0.42;
    o.add(b);
    const tg = label(`${p.icon} ${p.num}`, { bg: '#ffffff', fg: '#222', scale: 0.35 });
    tg.position.y = 1.4 + p.size.size;
    o.add(tg);
    p.obj = run.prop(o, p.pos, 0, 1);
  }
    return run;
}

/** Il modello del furgone delle consegne (per scene che lo usano). */
export const deliveryVan = () => model('cars/delivery.glb', 1.3);
export { SHELF_COLORS };

// ---------------- avvio dei lavoretti di Trasporti e logistica ----------------


/**
 * Avvia il lavoretto giusto per la linea e il gradino dell'offerta (Magazzino; le altre linee dei trasporti
 * si aggiungono qui). Restituisce null se quel gradino non è di questo file.
 */
export function startLogisticsJob(game: Game, offer: JobOffer, slot: Slot, title: string): JobRun | null {
  const lv = offer.level;
  const r = rungOf(offer.type, lv);
  const t = rungProgress(offer.type, lv);
  const placed = game.city.placed;
  if (offer.type === 'consegna') {
    switch (r) {
      case 1: return furnitureJob(game, lv, game.enterArena(new Arena({ level: 4 + 3 * t, slot, placed })), title);
      case 2: return new VanPuzzleRun(game, lv, title);
      case 3: return Math.random() < 0.5 ? new PianoLiftRun(game, lv, title) : new PaintingsRun(game, lv, title);
      case 4: return officeMoveJob(game, lv, game.enterArena(new Arena({ level: 7 + 3 * t, slot, placed, fence: true })), title);
    }
  }
  if (offer.type === 'magazzino' && r === 4) return new SortingRun(game, lv, title);
  if (offer.type === 'autista') return driveJob(game, lv, slot, title);
  if (offer.type === 'magazzino') {
    switch (r) {
      case 0: return shelvingJob(game, lv, game.enterArena(new Warehouse({ rows: 1, perRow: t < 0.4 ? 3 : 4, slot, placed })), title);
      case 1: return forkliftJob(game, lv, game.enterArena(new Warehouse({ rows: 2, perRow: 3, tall: t >= 0.3, aisle: 4.4 - 1.1 * t, slot, placed })), title);
      case 2: return pickingJob(game, lv, game.enterArena(new Warehouse({ rows: 2, perRow: t < 0.5 ? 3 : 4, slot, placed })), title);
      case 3: return shippingJob(game, lv, game.enterArena(new Warehouse({ rows: 1, perRow: 3, flatbed: false, slot, placed })), title);
    }
  }
  return null;
}

// ---------------- Trasporto mobili (Consegne, gradino 2) ----------------

const FURNI = [
  { path: 'furniture/loungeSofa.glb', name: 'divano', icon: '🛋️', room: 'soggiorno' },
  { path: 'furniture/bookcaseClosedWide.glb', name: 'libreria', icon: '📚', room: 'camera' },
  { path: 'furniture/kitchenFridge.glb', name: 'frigorifero', icon: '🧊', room: 'cucina' },
  { path: 'furniture/desk.glb', name: 'scrivania', icon: '🖥️', room: 'camera' },
];
const ROOMS = [{ id: 'cucina', icon: '🍳' }, { id: 'soggiorno', icon: '🛋️' }, { id: 'camera', icon: '🛏️' }];

/** Gradini davanti alla porta di casa (il carrello non li sale senza rampa). */
function porchSteps() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16 * (3 - i), 0.42), new THREE.MeshLambertMaterial({ color: 0xbfb6a8 }));
    s.position.set(0, 0.08 * (3 - i), -0.42 * i);
    s.castShadow = s.receiveShadow = true;
    g.add(s);
  }
  return g;
}

/**
 * Trasporto mobili: si carica il mobile sul carrello al furgone, si mette la rampa sui gradini, si spinge
 * il mobile fino alla porta senza urtare niente (ogni urto lo rovina: meno stelle), si gira per farlo passare
 * dalla porta e lo si lascia nella stanza giusta (la finestra della stanza scritta sul mobile). Dal livello
 * medio del gradino i mobili sono due.
 */
export function furnitureJob(game: Game, lineLevel: number, arena: Arena, title: string) {
  const t = rungProgress('consegna', lineLevel);
  const n = t < 0.5 ? 1 : 2;
  const pieces = [...FURNI].sort(() => Math.random() - 0.5).slice(0, n);
  // il furgone di lato, accanto alla casa: dal cancello si vedono il furgone, il giardino e la porta
  const van = new THREE.Vector3(arena.house.maxX + 3, 0, arena.house.maxZ + 1.5);
  const door = arena.door.clone();
  const stepsAt = door.clone().add(new THREE.Vector3(0, 0, 0.9));
  const rampAt = stepsAt.clone().add(new THREE.Vector3(0, 0, 0.9));
  const windows = ROOMS.map((r, i) => ({ ...r, pos: new THREE.Vector3(arena.house.minX + 1 + i * ((arena.house.maxX - arena.house.minX - 2) / 2), 0, arena.house.maxZ + 0.4) }));
  let damage = 0;
  let carrying = false;
  let ramp = false;
  let run: PhasedRun;
  let vanObj: THREE.Object3D | undefined;
  const bump = bumpTracker(game, () => {
    if (!carrying) return;
    damage = Math.min(100, damage + 15);
    run.starCap = damage >= 75 ? 1 : damage >= 45 ? 2 : 3;
    toast(`💥 Urto! Il mobile si rovina (${damage}%)`, 'bad');
  });
  const phases: Phase[] = [];
  pieces.forEach((f, i) => {
    phases.push({
      name: `Carica ${f.name === 'scrivania' || f.name === 'libreria' ? 'la' : 'il'} ${f.name} sul carrello`, icon: '🚚',
      tip: `Al <b>furgone</b> c'è ${f.icon} da portare in casa: caricalo sul carrello`,
      tasks: () => [{
        pos: van, kind: 'tap', label: `Carica ${f.icon} sul carrello`, icon: f.icon, get obj() { return vanObj; },
        onDone: () => {
          carrying = true;
          run.speedMul = 0.55;
          run.noVehicle = true;
          const m = model(f.path, 0.7);
          hold(game, m);
        },
      }],
    });
    if (!i) {
      phases.push({
        name: 'Metti la rampa sui gradini', icon: '🪜', tip: 'Davanti alla porta ci sono i <b>gradini</b>: metti la <b>rampa</b> per farci salire il carrello',
        tasks: () => [{ pos: rampAt, kind: 'tap', label: 'Metti la rampa', icon: '🪜', onDone: () => { ramp = true; rampObj.visible = true; } }],
      });
    }
    phases.push({
      name: 'Gira il mobile per passare dalla porta', icon: '🔄',
      tip: 'Spingi il carrello fino alla <b>porta</b> senza urtare niente, poi <b>tieni premuto</b> per girare il mobile e farlo passare',
      tasks: () => [{ pos: door, kind: 'hold', sec: 1.8, label: 'Gira il mobile', icon: '🔄', enabled: () => ramp }],
    });
    phases.push({
      name: `Porta ${f.icon} in ${f.room}`, icon: '🏠',
      tip: `Il mobile va in <b>${f.room}</b>: tocca la finestra con l'icona di quella stanza (le altre sono sbagliate)`,
      tasks: () => windows.map((w) => ({
        pos: w.pos, kind: 'tap' as const, label: `In ${w.id}`, icon: w.icon, markerText: `${w.icon} ${w.id}`, decoy: w.id !== f.room, wrongText: `❌ ${f.icon} non va in ${w.id}`,
        group: 'room' + i,
        onDone: () => {
          carrying = false;
          run.speedMul = 1;
          run.noVehicle = false;
          hold(game);
        },
      })),
    });
  });
  run = new PhasedRun(game, 1, title, phases, { time: 40 + n * 55 });
  vanObj = run.prop(model('cars/delivery.glb', 1.3), van, Math.PI, 1);
  vanObj.userData.solid = true;
  run.prop(porchSteps(), stepsAt, 0, 1).userData.noGlow = true;
  const rampObj = run.prop(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 1.5), new THREE.MeshLambertMaterial({ color: 0x9aa0aa })), rampAt.clone().setY(0.18), 0, 1);
  rampObj.rotation.x = 0.28;
  rampObj.visible = false;
  rampObj.userData.noGlow = true;
  // ostacoli del giardino sulla strada del carrello
  const obst = arena.scatter(Math.round(3 + 3 * t), 2.6, 1.4, [arena.entry, van, rampAt, door]);
  for (const p of obst) {
    const o = run.prop([bigPlanter, roundShrub, patioSet][Math.floor(Math.random() * 3)](), p, Math.random() * 6, 1);
    o.userData.solid = true;
    o.userData.noGlow = true;
  }
  for (const w of windows) {
    const fr = run.prop(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.08), new THREE.MeshLambertMaterial({ color: 0x8fd3ff })), w.pos.clone().setY(1.5), 0, 1);
    fr.userData.solid = false;
  }
  run.onTick = (dt) => bump(dt);
  run.extraStatus = () => (damage ? `💥 danni ${damage}%` : '');
  return run;
}

// ---------------- Traslochi d'azienda (Consegne, gradino 5) ----------------

/**
 * Trasloco di un ufficio: gli oggetti delle stanze sono pronti davanti all'edificio. Si chiamano gli
 * aiutanti (2–3), che portano da soli al camion gli oggetti normali; tu porti gli altri, e quelli speciali
 * li fai solo tu: il server va prima staccato (tieni premuto), l'acquario si porta piano (correndo si rovescia).
 */
export function officeMoveJob(game: Game, lineLevel: number, arena: Arena, title: string) {
  const t = rungProgress('consegna', lineLevel);
  const rooms = t < 0.5 ? 2 : 3;
  const nHelp = t < 0.5 ? 2 : 3;
  // il camion di lato, accanto alla casa (non davanti al cancello): il retro verso il giardino
  const truck = new THREE.Vector3(arena.house.minX - 3.4, 0, arena.house.maxZ - 1.2);
  const dropAt = truck.clone().add(new THREE.Vector3(0, 0, 3.6));
  type Thing = { pos: THREE.Vector3; icon: string; name: string; kind: 'box' | 'server' | 'aquarium'; obj?: THREE.Object3D; task?: Task; claimed?: boolean; byHelper?: boolean };
  const things: Thing[] = [];
  const kinds = [{ icon: '📦', name: 'scatolone' }, { icon: '🪑', name: 'sedia' }, { icon: '🖥️', name: 'computer' }, { icon: '🗄️', name: 'cassettiera' }];
  for (let r = 0; r < rooms; r++) {
    const cx = arena.house.minX + 1.2 + r * ((arena.house.maxX - arena.house.minX - 2.4) / Math.max(1, rooms - 1));
    for (let i = 0; i < 3; i++) {
      const k = kinds[(r * 3 + i) % kinds.length];
      things.push({ pos: new THREE.Vector3(cx + (i - 1) * 0.9, 0, arena.house.maxZ + 1.4 + (i % 2) * 0.8), icon: k.icon, name: k.name, kind: 'box' });
    }
  }
  // gli oggetti speciali li porti solo tu
  things[0].kind = 'server';
  things[0].icon = '🗄️';
  things[0].name = 'server';
  if (rooms >= 2) {
    const a = things[things.length - 1];
    a.kind = 'aquarium';
    a.icon = '🐠';
    a.name = 'acquario';
  }
  let carrying: Thing | null = null;
  let loaded = 0;
  let spills = 0;
  let run: PhasedRun;
  let truckObj: THREE.Object3D | undefined;
  type Helper = { char: Character; thing: Thing | null; stage: 'go' | 'carry' | 'idle' };
  const helpers: Helper[] = [];
  const loadTask = (th: Thing): Task => ({
    pos: dropAt, kind: 'tap', label: `Carica ${th.icon} sul camion`, icon: '🚛', get obj() { return truckObj; },
    onDone: () => {
      carrying = null;
      loaded++;
      run.speedMul = 1;
      hold(game);
    },
  });
  const phases: Phase[] = [
    {
      name: 'Chiama gli aiutanti', icon: '📣', tip: 'Vai al <b>camion</b> e chiama gli <b>aiutanti</b>: porteranno da soli gli oggetti normali',
      tasks: () => [{
        pos: dropAt, kind: 'tap', label: 'Chiama gli aiutanti', icon: '📣',
        onDone: () => {
          for (let i = 0; i < nHelp; i++) {
            const c = new Character(CHAR_MODELS[(i * 3 + 1) % CHAR_MODELS.length]);
            c.root.position.copy(dropAt).add(new THREE.Vector3(i * 0.8, 0, 1));
            run.prop(c.root, c.root.position.clone(), 0, 1).userData.noGlow = true;
            helpers.push({ char: c, thing: null, stage: 'idle' });
          }
        },
      }],
    },
    {
      name: 'Svuota l\'ufficio', icon: '🏢', count: () => [loaded, things.length],
      tip: 'Porta gli oggetti al <b>camion</b> insieme agli aiutanti. Il <b>server</b> va staccato prima (tieni premuto), l\'<b>acquario</b> si porta piano: senza correre!',
      tasks: () => things.map((th) => {
        const tk: Task = {
          pos: th.pos, kind: th.kind === 'server' ? 'hold' : 'tap', sec: 2, label: th.kind === 'server' ? 'Stacca il server e prendilo' : `Prendi ${th.icon} ${th.name}`, icon: th.icon,
          enabled: () => !carrying && !th.claimed,
          onDone: () => {
            if (th.obj) th.obj.visible = false;
            if (th.byHelper) return;
            carrying = th;
            run.speedMul = th.kind === 'aquarium' ? 0.7 : 0.85;
            hold(game, crate(0.4, th.kind === 'aquarium' ? 0x8fd3ff : 0xc8935a));
          },
          then: () => (th.byHelper ? [] : [loadTask(th)]),
        };
        th.task = tk;
        return tk;
      }),
    },
  ];
  run = new PhasedRun(game, 1, title, phases, { time: 50 + things.length * 13 });
  truckObj = run.prop(model('cars/truck.glb', 2), truck, Math.PI, 1);
  truckObj.userData.solid = true;
  truckObj.userData.noGlow = true;
  for (const th of things) {
    const o = run.prop(crate(th.kind === 'box' ? 0.55 : 0.7, th.kind === 'aquarium' ? 0x8fd3ff : th.kind === 'server' ? 0x33333d : 0xc8935a), th.pos, 0, 1);
    const tg = label(th.icon, { bg: '#ffffff', scale: 0.4 });
    tg.position.y = 1.1;
    o.add(tg);
    th.obj = o;
  }
  run.onTick = (dt) => {
    // acquario: correndo l'acqua si rovescia
    if (carrying?.kind === 'aquarium') {
      const v = game.input.vector;
      if (Math.hypot(v.x, v.y) > 0.75) {
        spills += dt;
        if (spills > 1.5 && run.starCap > 2) {
          run.starCap = 2;
          toast('💦 L\'acqua dell\'acquario si è rovesciata: massimo 2 stelle', 'bad');
        }
      }
    }
    // aiutanti: prendono un oggetto normale libero, lo portano al camion, ripetono
    for (const h of helpers) {
      h.char.update(dt);
      const p = h.char.root.position;
      if (h.stage === 'idle') {
        const free = things.filter((x) => x.kind === 'box' && !x.claimed && !x.task?.done && x !== carrying).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0];
        if (!free) continue;
        free.claimed = true;
        h.thing = free;
        h.stage = 'go';
        h.char.play('walk');
      }
      const goal = h.stage === 'go' ? h.thing!.pos : dropAt;
      const d = Math.hypot(goal.x - p.x, goal.z - p.z);
      if (d > 0.7) {
        const sp = 2.4 * dt;
        p.x += ((goal.x - p.x) / d) * Math.min(sp, d);
        p.z += ((goal.z - p.z) / d) * Math.min(sp, d);
        h.char.faceTowards(goal.x, goal.z, dt, 8);
        continue;
      }
      const th = h.thing!;
      if (h.stage === 'go') {
        if (th.obj) th.obj.visible = false;
        h.char.hold(crate(0.4));
        h.stage = 'carry';
      } else {
        h.char.hold();
        th.byHelper = true;
        if (th.task && !th.task.done) run.completeTask(th.task);
        loaded++;
        h.stage = 'idle';
        h.thing = null;
        h.char.play('idle');
      }
    }
  };
  run.extraStatus = () => (helpers.length ? `👷 ${helpers.length} aiutanti` : '');
  return run;
}
