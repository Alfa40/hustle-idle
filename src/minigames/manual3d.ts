import * as THREE from 'three';
import type { Game } from '../game';
import { rungOf, rungProgress } from '../config/careers';
import type { JobOffer } from '../sim/state';
import { toast } from '../sim/bus';
import type { Slot } from '../world/city';
import { label, leafPile, cylProp } from '../world/props';
import { flowerBed, slide, toolbox, wheelieBin } from '../world/jobprops';
import { Arena } from './arena';
import { Room } from './room';
import { PhasedRun, type JobRun, type Phase, type Task } from './jobs';
import { crate } from './warehouse';
import { PipeStation, ScrewStation, WipeStation } from './handstations';

/**
 * Lavoretti di Costruzione e manualità, gradino di base di ogni linea (tabella in CARRIERE.md):
 * - 🌿 Sistemare il giardino: tosaerba sull'erba alta (senza calpestare le aiuole), rastrello, foglie nel bidone;
 * - 🔧 Montaggio mobili: apri la scatola, pezzo giusto del foglio delle istruzioni, avvita col dito;
 * - 🧽 Pulizie di casa: polvere col panno, aspirapolvere, ogni cosa al suo posto, letto;
 * - ⚡ Aiuto idraulico: chiudi l'acqua, collega i tubi, riapri e stringi i raccordi che perdono.
 * Gli errori si possono fare e contano alla fine (stelle massime), come nella Ristorazione.
 */

type Placed = { path: string; m: THREE.Matrix4 }[];
const hold = (game: Game, obj?: THREE.Object3D) => game.player.hold(obj);
const lamb = (c: number) => new THREE.MeshLambertMaterial({ color: c });
const pickN = <T>(a: T[], n: number) => [...a].sort(() => Math.random() - 0.5).slice(0, n);

function part(g: THREE.Group, geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, lamb(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

/** Stelle massime dagli errori lasciati: nessuno 3, uno 2, di più 1. */
const capFor = (wrong: number) => (wrong >= 2 ? 1 : wrong ? 2 : 3);

/** Stelle massime dalla qualità media dei minigiochi col dito (1 = tutto perfetto). */
function capFrom(qs: number[]) {
  if (!qs.length) return 3;
  const q = qs.reduce((a, b) => a + b, 0) / qs.length;
  return q >= 0.85 ? 3 : q >= 0.6 ? 2 : 1;
}

/** Etichetta piccola attaccata a un oggetto (la lettera di un pezzo, cosa contiene una cesta). */
function sticker(o: THREE.Object3D, text: string, y: number, bg = '#ffc21a', scale = 0.32) {
  const s = label(text, { bg, fg: '#3a2f55', scale });
  s.position.y = y;
  s.userData.noGlow = true;
  o.add(s);
  return s;
}

// ======================================================================================
// Oggetti di scena
// ======================================================================================

function mowerMesh() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.5, 0.22, 0.62), 0xe5484d, 0, 0.2, 0);
  part(g, new THREE.BoxGeometry(0.36, 0.12, 0.3), 0x37474f, 0, 0.36, -0.05);
  for (const x of [-0.24, 0.24]) for (const z of [-0.24, 0.24]) {
    const w = part(g, new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12), 0x212121, x, 0.08, z);
    w.rotation.z = Math.PI / 2;
  }
  for (const x of [-0.18, 0.18]) {
    const b = part(g, new THREE.BoxGeometry(0.03, 0.75, 0.03), 0x90a4ae, x, 0.6, 0.42);
    b.rotation.x = -0.5;
  }
  part(g, new THREE.BoxGeometry(0.42, 0.04, 0.04), 0x212121, 0, 0.92, 0.6);
  return g;
}

function rakeMesh() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.04, 1.3, 0.04), 0xa1887f, 0, 0.65, 0);
  part(g, new THREE.BoxGeometry(0.45, 0.05, 0.05), 0x607d8b, 0, 0.04, 0);
  for (let i = 0; i < 7; i++) part(g, new THREE.BoxGeometry(0.02, 0.1, 0.02), 0x607d8b, -0.2 + i * 0.066, -0.02, 0.02);
  return g;
}

/** Ciuffo d'erba alta da tagliare. */
function tallGrass() {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.55, 0.55, 0.03, 16), 0x3f7d2c, 0, 0.015, 0);
  const cols = [0x4f9a3a, 0x5cae45, 0x3f8f3a];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
    const r = Math.sqrt(Math.random()) * 0.45;
    const h = 0.35 + Math.random() * 0.25;
    const b = part(g, new THREE.ConeGeometry(0.05, h, 4), cols[i % 3], Math.cos(a) * r, h / 2, Math.sin(a) * r);
    b.rotation.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
  }
  return g;
}

/** Prato appena tagliato, a strisce. */
function mownPatch() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = part(g, new THREE.BoxGeometry(0.26, 0.02, 1.0), i % 2 ? 0x9ccc65 : 0x8bc34a, -0.39 + i * 0.26, 0.012, 0);
    s.receiveShadow = true;
  }
  g.userData.noGlow = true;
  return g;
}

function vacuumMesh() {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.16, 0.18, 0.3, 14), 0x8e5bd6, 0, 0.15, 0);
  part(g, new THREE.BoxGeometry(0.03, 0.9, 0.03), 0x90a4ae, 0.15, 0.6, 0.15);
  part(g, new THREE.BoxGeometry(0.28, 0.05, 0.1), 0x37474f, 0.15, 0.04, 0.3);
  return g;
}

/** Briciole e terra sul pavimento. */
function crumbs() {
  const g = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const s = 0.03 + Math.random() * 0.04;
    part(g, new THREE.BoxGeometry(s, 0.015, s), i % 3 ? 0x6b4a2a : 0xa1887f, (Math.random() - 0.5) * 0.7, 0.012, (Math.random() - 0.5) * 0.7);
  }
  return g;
}

/** Rubinetto generale dell'acqua sul muro: tubo e volantino rosso (gira chiudendo). */
function valveMesh() {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.05, 0.05, 1.6, 10), 0xb0bec5, 0, 0.8, 0);
  const wheel = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 20), lamb(0xe5484d));
  wheel.add(ring);
  for (const r of [0, Math.PI / 2]) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.03), lamb(0xe5484d));
    spoke.rotation.z = r;
    wheel.add(spoke);
  }
  wheel.position.set(0, 1.0, 0.12);
  g.add(wheel);
  return { g, wheel };
}

/** Gocce che cadono da un raccordo che perde. */
function dripMesh() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) part(g, new THREE.SphereGeometry(0.035, 8, 6), 0x6fc3ff, (i - 1) * 0.06, 0.2 + i * 0.12, 0);
  part(g, new THREE.CylinderGeometry(0.22, 0.22, 0.01, 16), 0x6fc3ff, 0, 0.006, 0);
  g.userData.noGlow = true;
  return g;
}

// ======================================================================================
// 🌿 Sistemare il giardino
// ======================================================================================

/**
 * Giardino del cliente (la casa vera dove si è accettato il lavoro): prendi il tosaerba, taglia ogni ciuffo
 * d'erba alta (tieni premuto), poi il rastrello per le foglie e svuota il sacco nel bidone. Le aiuole fiorite non
 * si calpestano: passarci sopra le rovina (conta alla fine). Salendo: giardino più grande, più erba, più aiuole e
 * i giochi dei bambini in mezzo.
 */
export function lawnJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('giardino', lineLevel);
  const arena = game.enterArena(new Arena({ level: 1 + 5 * t, slot, placed }));
  const nGrass = Math.round(5 + 4 * t);
  const nBeds = t < 0.3 ? 1 : t < 0.7 ? 2 : 3;
  const nToys = t < 0.4 ? 0 : t < 0.8 ? 1 : 2;
  const nLeaves = Math.round(2 + 2 * t);
  const shed = arena.entry.clone().add(new THREE.Vector3(-2.2, 0, -0.6));
  const bin = new THREE.Vector3(arena.house.minX - 1.1, 0, arena.house.maxZ - 0.8);
  const beds = arena.scatter(nBeds, 3, 1.3, [shed, bin, arena.entry]);
  const toys = arena.scatter(nToys, 2.6, 1.2, [shed, bin, arena.entry, ...beds]);
  const grass = arena.scatter(nGrass, 1.9, 0.9, [shed, bin, arena.entry, ...beds, ...toys]);
  const leaves = arena.scatter(nLeaves, 1.8, 0.9, [shed, bin, arena.entry, ...beds, ...toys, ...grass]);
  let run: PhasedRun;
  const tufts: THREE.Object3D[] = [];
  const piles: THREE.Object3D[] = [];
  let mowerObj: THREE.Object3D;
  const bedObjs: { obj: THREE.Object3D; pos: THREE.Vector3; ruined: boolean }[] = [];
  let ruined = 0;
  const phases: Phase[] = [
    {
      name: 'Prendi il tosaerba', icon: '🧰',
      tip: 'Il <b>tosaerba</b> rosso è vicino al cancello: prendilo',
      tasks: () => [{ pos: shed, kind: 'tap', label: 'Prendi il tosaerba', icon: '🧰', own: true, obj: mowerObj, onDone: () => { mowerObj.visible = false; hold(game, mowerMesh()); } }],
    },
    {
      name: "Taglia l'erba alta", icon: '🌿', count: () => [tufts.filter((x) => !x.visible).length, nGrass],
      tip: "Taglia ogni <b>ciuffo d'erba alta</b>: tieni premuto lì sopra. Gira attorno alle <b>aiuole fiorite</b>: se le calpesti si rovinano",
      tasks: () => grass.map((pos, i): Task => ({
        pos, kind: 'hold', sec: 1.0 - 0.25 * t, label: "Taglia l'erba", icon: '🌿', fx: 'leaf', fxColor: 0x5cae45, own: true, obj: tufts[i],
        onProgress: (p) => tufts[i].scale.set(1, Math.max(0.15, 1 - p * 0.85), 1),
        onDone: () => {
          tufts[i].visible = false;
          run.prop(mownPatch(), pos, Math.random() * Math.PI, 1);
        },
      })),
    },
    {
      name: 'Prendi il rastrello', icon: '🧹',
      tip: 'Lascia il tosaerba e prendi il <b>rastrello</b>, vicino al cancello',
      tasks: () => [{ pos: shed, kind: 'tap', label: 'Prendi il rastrello', icon: '🧹', own: true, obj: mowerObj, onDone: () => { mowerObj.visible = true; hold(game, rakeMesh()); } }],
    },
    {
      name: 'Rastrella le foglie', icon: '🍂', count: () => [piles.filter((x) => !x.visible).length, nLeaves],
      tip: 'Raccogli ogni <b>mucchio di foglie</b> nel sacco',
      tasks: () => leaves.map((pos, i): Task => ({
        pos, kind: 'tap', label: 'Raccogli le foglie', icon: '🍂', fx: 'leaf', own: true, obj: piles[i],
        onDone: () => {
          piles[i].visible = false;
          if (piles.every((x) => !x.visible)) hold(game, cylProp(0.25, 0.45, 0x2e7d32));
        },
      })),
    },
    {
      name: 'Svuota il sacco nel bidone', icon: '🗑️',
      tip: 'Butta le foglie nel <b>bidone verde</b> accanto alla casa',
      tasks: () => [{ pos: bin, kind: 'tap', label: 'Svuota nel bidone', icon: '🗑️', onDone: () => hold(game) }],
    },
  ];
  run = new PhasedRun(game, 1, title, phases, { time: Math.min(280, 45 + nGrass * 9 + nLeaves * 6) });
  // il tosaerba (poi il rastrello) appoggiato vicino al cancello, accanto alla cassetta degli attrezzi
  run.prop(toolbox(), shed.clone().add(new THREE.Vector3(-0.8, 0, 0)), 0, 1).userData.noGlow = true;
  mowerObj = run.prop(mowerMesh(), shed, Math.PI, 1);
  run.prop(wheelieBin(), bin, 0, 1).userData.solid = true;
  for (const pos of grass) tufts.push(run.prop(tallGrass(), pos, Math.random() * 6, 1));
  for (const pos of leaves) piles.push(run.prop(leafPile(), pos, 0, 1.2));
  for (const pos of beds) {
    const obj = run.prop(flowerBed(), pos, Math.random() < 0.5 ? 0 : Math.PI / 2, 1.1);
    obj.userData.noGlow = true;
    bedObjs.push({ obj, pos, ruined: false });
  }
  for (const pos of toys) {
    const o = run.prop(slide(), pos, Math.random() * Math.PI * 2, 1);
    o.userData.noGlow = true;
    o.userData.solid = true;
  }
  // aiuole: passarci sopra le rovina (i fiori si piegano), conta alla fine
  run.onTick = () => {
    const p = game.player.root.position;
    for (const b of bedObjs) {
      if (b.ruined) continue;
      const box = new THREE.Box3().setFromObject(b.obj);
      if (p.x < box.min.x - 0.1 || p.x > box.max.x + 0.1 || p.z < box.min.z - 0.1 || p.z > box.max.z + 0.1) continue;
      b.ruined = true;
      ruined++;
      b.obj.scale.y *= 0.4;
      toast('🌷 Hai calpestato un\'aiuola!', 'bad');
      run.starCap = capFor(ruined);
    }
  };
  return run;
}

// ======================================================================================
// 🔧 Montaggio mobili
// ======================================================================================

interface Piece {
  letter: string;
  name: string;
  /** le assi del pezzo nel mobile finito (misure e posto), in metri */
  boards: { w: number; h: number; d: number; x: number; y: number; z: number }[];
  /** il pezzo è di un altro mobile (sta lì per confondere) */
  extra?: boolean;
}

const WOOD = 0xd9b07a;

/** Pezzi di una libreria (larga 0,9 m, alta 1,5 m) e di un comodino; ogni pezzo è un passo del foglio. */
function shelfPieces(back: boolean): Piece[] {
  const W = 0.9, H = 1.5, D = 0.34, T = 0.04;
  return [
    { letter: 'A', name: 'base', boards: [{ w: W, h: T, d: D, x: 0, y: T / 2, z: 0 }] },
    { letter: 'B', name: 'fianchi', boards: [{ w: T, h: H, d: D, x: -W / 2 + T / 2, y: H / 2, z: 0 }, { w: T, h: H, d: D, x: W / 2 - T / 2, y: H / 2, z: 0 }] },
    { letter: 'C', name: 'ripiani', boards: [0.5, 1.0].map((y) => ({ w: W - 2 * T, h: T, d: D - 0.02, x: 0, y, z: 0 })) },
    { letter: 'D', name: 'cima', boards: [{ w: W, h: T, d: D, x: 0, y: H - T / 2, z: 0 }] },
    ...(back ? [{ letter: 'E', name: 'schienale', boards: [{ w: W - 0.02, h: H - 0.02, d: 0.012, x: 0, y: H / 2, z: -D / 2 + 0.006 }] }] : []),
  ];
}

function nightstandPieces(first: string): Piece[] {
  const W = 0.5, H = 0.55, D = 0.4, T = 0.035;
  const L = (k: number) => String.fromCharCode(first.charCodeAt(0) + k);
  return [
    { letter: L(0), name: 'base', boards: [{ w: W, h: T, d: D, x: 0, y: T / 2, z: 0 }] },
    { letter: L(1), name: 'fianchi', boards: [{ w: T, h: H, d: D, x: -W / 2 + T / 2, y: H / 2, z: 0 }, { w: T, h: H, d: D, x: W / 2 - T / 2, y: H / 2, z: 0 }] },
    { letter: L(2), name: 'piano', boards: [{ w: W, h: T, d: D, x: 0, y: H - T / 2, z: 0 }] },
  ];
}

/** Il pezzo come sta per terra (le assi impilate, piatte) con la sua lettera. */
function pieceOnFloor(p: Piece) {
  const g = new THREE.Group();
  p.boards.forEach((b, i) => {
    // per terra: l'asse sdraiata (lato più lungo lungo x, spessore in altezza)
    const dims = [b.w, b.h, b.d].sort((a, c) => c - a);
    part(g, new THREE.BoxGeometry(dims[0], dims[2], dims[1]), WOOD, 0, dims[2] / 2 + i * (dims[2] + 0.005), 0);
  });
  // la lettera grande: si legge anche da qualche passo
  sticker(g, p.letter, 0.4, '#ffc21a', 0.55);
  return g;
}

/** Il pezzo in mano: piccolo (in prima persona non deve coprire la vista), con la sua lettera. */
function inHand(p: Piece) {
  const g = pieceOnFloor(p);
  g.scale.setScalar(0.45);
  return g;
}

/**
 * Montaggio mobili a casa del cliente: apri la scatola, poi segui il foglio delle istruzioni un passo alla
 * volta: prendi il pezzo con la lettera giusta (gli altri pezzi per terra si possono prendere, ma costano
 * secondi), portalo al mobile e avvita le viti girando il dito. Salendo: più viti, lo schienale, i pezzi di un
 * altro mobile per terra e dal Liv. 6 un secondo mobile (il comodino).
 */
export function furnitureJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('montaggio', lineLevel);
  const two = t >= 0.6;
  const screws = t < 0.45 ? 2 : 3;
  const turns = 2 + t;
  // moquette grigio-azzurra: i pezzi di legno per terra si vedono bene
  const room = game.enterArena(new Room({ w: 7, d: 6, floor: 0x8fa3b8, wall: 0xf6efe2, sign: '🏠 Casa del cliente', slot, placed }));
  const shelf = shelfPieces(t >= 0.3);
  const night = two ? nightstandPieces(String.fromCharCode('A'.charCodeAt(0) + shelf.length)) : [];
  // pezzi di un altro mobile (confondono): da metà gradino
  const extras: Piece[] = t >= 0.4 && !two ? [{ letter: 'F', name: 'anta', extra: true, boards: [{ w: 0.4, h: 0.6, d: 0.02, x: 0, y: 0, z: 0 }] }] : [];
  const mobili = [
    { name: 'Libreria', pieces: shelf, at: room.at(-1.6, -2.2), box: room.at(-2.6, 0.6) },
    ...(two ? [{ name: 'Comodino', pieces: night, at: room.at(1.8, -2.2), box: room.at(2.6, 0.6) }] : []),
  ];
  let run: PhasedRun;
  let holding: Piece | null = null;
  let screwing = false;
  const qs: number[] = [];
  const floorObjs = new Map<Piece, THREE.Object3D>();
  // dove stanno i pezzi per terra: una fila davanti a ogni scatola
  const spots: THREE.Vector3[] = [];
  const builds: THREE.Group[] = [];
  const boxObjs: THREE.Object3D[] = [];
  const phases: Phase[] = [];
  mobili.forEach((m, mi) => {
    const pieces = [...m.pieces, ...(mi === 0 ? extras : [])];
    phases.push({
      name: `Apri la scatola: ${m.name.toLowerCase()}`, icon: '📦',
      tip: `Apri la <b>scatola</b> della ${m.name.toLowerCase()}: dentro ci sono i pezzi, ognuno con la sua <b>lettera</b>`,
      tasks: () => [{
        pos: m.box.clone().add(new THREE.Vector3(0, 0, 0.6)), kind: 'tap', label: 'Apri la scatola', icon: '📦', own: true, obj: boxObjs[mi],
        onDone: () => {
          boxObjs[mi].visible = false;
          // i pezzi per terra, mescolati, in fila davanti alla scatola
          pickN(pieces, pieces.length).forEach((p, k) => {
            const pos = m.box.clone().add(new THREE.Vector3((mi === 0 ? 1 : -1) * (k % 3) * 1.0, 0, 1.0 + Math.floor(k / 3) * 1.0));
            spots.push(pos);
            floorObjs.set(p, run.prop(pieceOnFloor(p), pos, 0, 1));
          });
        },
      }],
    });
    m.pieces.forEach((p) => {
      phases.push({
        name: `Pezzo ${p.letter}: ${p.name}`, icon: '🔧',
        tip: `Il foglio dice: <b>pezzo ${p.letter}</b> (${p.name}). Prendilo da terra, portalo al mobile e <b>avvita</b> le viti girando il dito`,
        tasks: () => {
          const onFloor = [...floorObjs.entries()].filter(([q, o]) => o.visible && q !== p);
          const right = floorObjs.get(p)!;
          return [
            {
              // niente indicatore sui pezzi: la lettera sull'etichetta va letta (come i civici)
              pos: right.position.clone(), kind: 'tap', repeat: true, own: true, quiet: true, obj: right, label: `Prendi il pezzo ${p.letter}`, icon: '🔧',
              enabled: () => !holding && right.visible,
              onDone: () => {
                right.visible = false;
                holding = p;
                hold(game, inHand(p));
              },
            },
            // gli altri pezzi per terra: si possono toccare, ma non sono quelli del foglio (costano secondi)
            ...onFloor.map(([q, o]): Task => ({
              pos: o.position.clone(), kind: 'tap', decoy: true, own: true, quiet: true, obj: o, label: `Prendi il pezzo ${q.letter}`, icon: '🔧',
              wrongText: `❌ È il pezzo ${q.letter}: il foglio dice ${p.letter}`, enabled: () => !holding,
            })),
            {
              pos: m.at.clone().add(new THREE.Vector3(0, 0, 0.6)), kind: 'tap', repeat: true, label: `Monta: ${p.name}`, icon: '🔧', own: true, obj: builds[mi],
              enabled: () => holding === p && !screwing,
              onDone: () => {
                screwing = true;
                hold(game);
                const n = p.boards.length > 1 ? screws + 1 : screws;
                run.openStation(new ScrewStation(`Pezzo ${p.letter}: ${p.name}`, n, turns, (q) => {
                  qs.push(q);
                  screwing = false;
                  holding = null;
                  for (const b of p.boards) part(builds[mi], new THREE.BoxGeometry(b.w, b.h, b.d), WOOD, b.x, b.y, b.z);
                  run.starCap = capFrom(qs);
                  run.finishPhase();
                }));
              },
            },
          ];
        },
      });
    });
  });
  run = new PhasedRun(game, 1, title, phases, { time: Math.min(290, 50 + mobili.reduce((a, m) => a + m.pieces.length, 0) * (22 + 4 * screws)) });
  mobili.forEach((m) => {
    const b = new THREE.Group();
    // il posto del mobile: un tappetino segna dove montarlo
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.01, 0.6), lamb(0x5b8def));
    mat.position.y = 0.006;
    b.add(mat);
    builds.push(run.prop(b, m.at, 0, 1) as THREE.Group);
    const box = crate(0.9, 0xc8935a, 0xffffff);
    boxObjs.push(run.prop(box, m.box, 0, 1));
  });
  // un po' di casa attorno: divano, tavolino, pianta
  room.furn('loungeSofa', 0, 2.2, Math.PI);
  room.furn('pottedPlant', 3.0, 2.4, 0);
  void spots;
  return run;
}

// ======================================================================================
// 🧽 Pulizie di casa
// ======================================================================================

type Thing = 'libro' | 'gioco' | 'vestito';
const THINGS: Record<Thing, { name: string; icon: string; place: string; color: number }> = {
  libro: { name: 'il libro', icon: '📚', place: 'nella libreria', color: 0x2d6cdb },
  gioco: { name: 'il giocattolo', icon: '🧸', place: 'nella cesta dei giochi', color: 0xffc21a },
  vestito: { name: 'la maglietta', icon: '👕', place: 'nel cesto della biancheria', color: 0xff5d73 },
};

function thingMesh(k: Thing) {
  const g = new THREE.Group();
  if (k === 'libro') part(g, new THREE.BoxGeometry(0.22, 0.05, 0.3), THINGS[k].color, 0, 0.025, 0);
  else if (k === 'gioco') {
    part(g, new THREE.SphereGeometry(0.12, 10, 8), 0xa1663a, 0, 0.12, 0);
    part(g, new THREE.SphereGeometry(0.08, 10, 8), 0xa1663a, 0, 0.3, 0);
  } else part(g, new THREE.BoxGeometry(0.35, 0.03, 0.3), THINGS[k].color, 0, 0.015, 0);
  return g;
}

/**
 * Pulizie di un appartamento: togli la polvere dai mobili col panno (col dito), passa l'aspirapolvere dove ci sono
 * le briciole, rimetti ogni cosa al suo posto (libri nella libreria, giocattoli nella cesta, vestiti nel cesto
 * della biancheria: il posto sbagliato conta alla fine) e rifai il letto. Salendo: più mobili, più briciole e cose
 * in giro, e lo specchio con gli aloni al posto di un mobile.
 */
export function cleaningJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('pulizie', lineLevel);
  const nDust = t < 0.35 ? 2 : t < 0.7 ? 3 : 4;
  const nCrumbs = Math.round(3 + 3 * t);
  const nThings = t < 0.4 ? 2 : t < 0.75 ? 3 : 4;
  const mirror = t >= 0.4;
  const room = game.enterArena(new Room({ w: 9, d: 6.5, floor: 0xc9a77c, wall: 0xf3ead9, sign: '🏠 Casa del cliente', slot, placed }));
  let run: PhasedRun;
  // i mobili della casa
  const sofa = room.furn('loungeSofa', -2.8, -2.6, 0);
  void sofa;
  const coffee = room.furn('tableCoffee', -2.8, -1.0, 0);
  const tv = room.furn('cabinetTelevision', -4.0 + 0.4, 1.0, Math.PI / 2);
  const shelfF = room.furn('bookcaseOpen', 0.2, -2.9, 0);
  const side = room.furn('sideTable', 2.0, -2.8, 0);
  const bed = room.furn('bedDouble', 3.2, -1.8, 0, 1.2);
  const sink = room.furn('bathroomSink', 4.0, 1.4, -Math.PI / 2);
  const desk = room.furn('desk', 0.4, 2.4, Math.PI);
  const dustables = [
    { obj: coffee.obj, at: room.near(-2.8, -1.0, 0, 0.9), name: 'Tavolino' },
    { obj: shelfF.obj, at: room.near(0.2, -2.9, 0, 0.9), name: 'Libreria' },
    { obj: tv.obj, at: room.near(-3.6, 1.0, 0.9, 0), name: 'Mobile della TV' },
    { obj: side.obj, at: room.near(2.0, -2.8, 0, 0.8), name: 'Comodino' },
    { obj: desk.obj, at: room.near(0.4, 2.4, 0, -0.9), name: 'Scrivania' },
  ];
  const dust = pickN(dustables, mirror ? nDust - 1 : nDust);
  const wipes: { obj: THREE.Object3D; at: THREE.Vector3; name: string; kind: 'polvere' | 'specchio' }[] = dust.map((d) => ({ ...d, kind: 'polvere' }));
  if (mirror) wipes.push({ obj: sink.obj, at: room.near(4.0, 1.4, -0.9, 0), name: 'Specchio', kind: 'specchio' });
  const wiped = new Set<number>();
  let wiping = false;
  // dove si sta per le altre cose da fare: briciole e oggetti in giro restano lontani (se no si accenderebbero e
  // prenderebbero il tocco al posto del mobile)
  const bedAt = room.near(3.2, -1.8, -1.4, 0.6);
  const vacuumAt = room.at(-4.0 + 0.6, 2.6);
  const placeAt: Record<Thing, THREE.Vector3> = { libro: room.near(0.2, -2.9, 0.9, 0.9), gioco: room.at(-1.0, 2.6), vestito: room.at(2.2, 0.2) };
  const busy = [...wipes.map((w) => w.at), bedAt, vacuumAt, ...Object.values(placeAt), placeAt.gioco.clone().add(new THREE.Vector3(0, 0, 0.6)), placeAt.vestito.clone().add(new THREE.Vector3(0, 0, 0.6))];
  const freeSpot = (taken: THREE.Vector3[], gap: number) => {
    for (let k = 0; k < 400; k++) {
      const p = room.at(-3.6 + Math.random() * 7.2, -1.8 + Math.random() * 3.4);
      if (room.blocked(p.x, p.z) || taken.some((q) => q.distanceTo(p) < gap) || busy.some((q) => q.distanceTo(p) < 1.5)) continue;
      return p;
    }
    return null;
  };
  // briciole sul pavimento libero
  const crumbSpots: THREE.Vector3[] = [];
  for (let k = 0; k < nCrumbs; k++) {
    const p = freeSpot(crumbSpots, 1.3);
    if (p) crumbSpots.push(p);
  }
  const crumbObjs: THREE.Object3D[] = [];
  // le cose in giro e i loro posti
  const kinds: Thing[] = Array.from({ length: nThings }, (_, i) => (['libro', 'gioco', 'vestito'] as Thing[])[i % 3]);
  const thingSpots: THREE.Vector3[] = [];
  for (let k = 0; k < nThings; k++) {
    const p = freeSpot([...thingSpots, ...crumbSpots], 1.2);
    if (p) thingSpots.push(p);
  }
  const things = kinds.slice(0, thingSpots.length).map((k, i) => ({ k, at: thingSpots[i], obj: null as unknown as THREE.Object3D, put: false }));
  const places: { k: Thing; at: THREE.Vector3; obj: THREE.Object3D; drop: THREE.Vector3 }[] = [];
  let holding: (typeof things)[number] | null = null;
  let put = 0;
  const misplaced = new Set<(typeof things)[number]>();
  let vacuum: THREE.Object3D;
  const phases: Phase[] = [
    {
      name: 'Togli la polvere', icon: '🧽', count: () => [wiped.size, wipes.length],
      tip: mirror ? 'Strofina col <b>panno</b> la polvere dai mobili e gli aloni dallo <b>specchio</b> del bagno' : 'Strofina col <b>panno</b> la polvere dai mobili che si illuminano',
      tasks: () => wipes.map((w, i): Task => ({
        pos: w.at, kind: 'tap', repeat: true, label: w.kind === 'specchio' ? 'Pulisci lo specchio' : `Spolvera: ${w.name.toLowerCase()}`, icon: '🧽', own: true, obj: w.obj,
        enabled: () => !wiped.has(i) && !wiping,
        onDone: () => {
          wiping = true;
          run.openStation(new WipeStation(w.kind === 'specchio' ? 'Specchio' : w.name, w.kind, Math.round(3 + 2 * t), 6 - 2 * t, () => {
            wiping = false;
            wiped.add(i);
            if (wiped.size >= wipes.length) run.finishPhase();
          }));
        },
      })),
    },
    {
      name: "Passa l'aspirapolvere", icon: '🧹', count: () => [crumbObjs.filter((o) => !o.visible).length, crumbObjs.length],
      tip: "Prendi l'<b>aspirapolvere</b> e passalo sulle <b>briciole</b> per terra: tieni premuto",
      tasks: () => [{
        pos: vacuumAt, kind: 'tap', label: "Prendi l'aspirapolvere", icon: '🧹', own: true, obj: vacuum,
        onDone: () => { vacuum.visible = false; hold(game, vacuumMesh()); },
        then: () => crumbSpots.map((pos, i): Task => ({
          pos, kind: 'hold', sec: 0.8, label: 'Aspira le briciole', icon: '🧹', fx: 'dust', own: true, obj: crumbObjs[i],
          onProgress: (p) => crumbObjs[i].scale.setScalar(Math.max(0.1, 1 - p)),
          onDone: () => {
            crumbObjs[i].visible = false;
            // finito: l'aspirapolvere torna al suo posto
            if (crumbObjs.every((o) => !o.visible)) {
              hold(game);
              vacuum.visible = true;
            }
          },
        })),
      }],
    },
    {
      name: 'Metti in ordine', icon: '🧺', count: () => [put, things.length],
      tip: 'Rimetti ogni cosa al suo posto: i <b>libri</b> nella libreria, i <b>giocattoli</b> nella cesta, i <b>vestiti</b> nel cesto della biancheria',
      tasks: () => [
        ...things.map((th): Task => ({
          pos: th.at, kind: 'tap', repeat: true, own: true, obj: th.obj, label: `Prendi ${THINGS[th.k].name}`, icon: THINGS[th.k].icon,
          enabled: () => !holding && !th.put && th.obj.visible,
          onDone: () => {
            th.obj.visible = false;
            holding = th;
            hold(game, thingMesh(th.k));
          },
        })),
        ...places.map((pl): Task => ({
          pos: pl.at, kind: 'tap', repeat: true, label: `Metti ${THINGS[pl.k].place}`, icon: THINGS[pl.k].icon, own: true, obj: pl.obj,
          enabled: () => !!holding,
          get right() { return holding?.k === pl.k; },
          onDone: () => {
            const th = holding!;
            holding = null;
            hold(game);
            th.put = true;
            put++;
            const o = thingMesh(th.k);
            o.userData.noGlow = true;
            // appoggiato sopra (si vede, e se è nel posto sbagliato si può riprendere)
            const at = pl.drop.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.15));
            const shown = run.prop(o, at, Math.random() * 3, 1);
            // nel posto sbagliato si può riprendere e rimettere giusto (conta solo se resta lì alla fine)
            if (th.k !== pl.k) {
              misplaced.add(th);
              toast(`❌ ${THINGS[th.k].name[0].toUpperCase() + THINGS[th.k].name.slice(1)} va ${THINGS[th.k].place}`, 'bad');
              run.retake(shown, `Riprendi ${THINGS[th.k].name}`, THINGS[th.k].icon, () => !holding && put < things.length, () => {
                shown.visible = false;
                misplaced.delete(th);
                th.put = false;
                put--;
                holding = th;
                hold(game, thingMesh(th.k));
                run.starCap = capFor(misplaced.size);
              });
            }
            run.starCap = capFor(misplaced.size);
            if (put >= things.length) {
              if (misplaced.size) toast(`${misplaced.size === 1 ? 'Una cosa è rimasta' : `${misplaced.size} cose sono rimaste`} nel posto sbagliato`, 'bad');
              run.finishPhase();
            }
          },
        })),
      ],
    },
    {
      name: 'Rifai il letto', icon: '🛏️',
      tip: 'Ultima cosa: <b>rifai il letto</b> (tieni premuto)',
      tasks: () => [{ pos: bedAt, kind: 'hold', sec: 1.6, label: 'Rifai il letto', icon: '🛏️', own: true, obj: bed.obj }],
    },
  ];
  run = new PhasedRun(game, 1, title, phases, { time: Math.min(290, 50 + wipes.length * 22 + crumbSpots.length * 7 + things.length * 14) });
  vacuum = run.prop(vacuumMesh(), vacuumAt, 0, 1);
  for (const pos of crumbSpots) crumbObjs.push(run.prop(crumbs(), pos, Math.random() * 3, 1));
  for (const th of things) th.obj = run.prop(thingMesh(th.k), th.at, Math.random() * 3, 1);
  // i posti: la libreria (già lì), la cesta dei giochi e il cesto della biancheria
  const used = [...new Set(things.map((x) => x.k))];
  for (const k of used) {
    if (k === 'libro') places.push({ k, at: placeAt.libro, obj: shelfF.obj, drop: shelfF.box.getCenter(new THREE.Vector3()).setY(shelfF.top + 0.02) });
    else {
      const at = placeAt[k];
      const c = crate(0.6, k === 'gioco' ? 0xffc21a : 0x8fd3ff);
      c.userData.solid = true;
      sticker(c, THINGS[k].icon, 0.85, '#ffffff');
      const obj = run.prop(c, at, 0, 1);
      places.push({ k, at: at.clone().add(new THREE.Vector3(0, 0, 0.6)), obj, drop: at.clone().setY(new THREE.Box3().setFromObject(obj).max.y + 0.02) });
    }
  }
  return run;
}

// ======================================================================================
// ⚡ Aiuto idraulico
// ======================================================================================

/**
 * Aiuto idraulico: prima chiudi il rubinetto generale dell'acqua, prendi la cassetta, sotto ogni lavandino
 * collega i tubi (girali col dito finché l'acqua arriva al rubinetto), riapri l'acqua e controlla: se un
 * raccordo perde, stringilo. Salendo: griglia dei tubi più grande, un secondo lavandino e le perdite.
 */
export function plumberJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('idraulico', lineLevel);
  const cols = t < 0.4 ? 4 : 5;
  const rows = t < 0.6 ? 3 : 4;
  const two = t >= 0.55;
  const leaks = t < 0.25 ? 0 : t < 0.8 ? 1 : 2;
  const room = game.enterArena(new Room({ w: 7, d: 5.5, tiles: true, sign: '🏠 Casa del cliente', slot, placed }));
  let run: PhasedRun;
  const kitchen = room.furn('kitchenSink', -1.2, -2.3, 0);
  room.furn('kitchenCabinet', -2.4, -2.3, 0);
  room.furn('kitchenStove', 0.0, -2.3, 0);
  const sinks = [{ obj: kitchen.obj, at: room.near(-1.2, -2.3, 0, 0.8), name: 'lavello della cucina' }];
  if (two) {
    const b = room.furn('bathroomSink', 3.0, -0.4, -Math.PI / 2);
    sinks.push({ obj: b.obj, at: room.near(3.0, -0.4, -0.8, 0), name: 'lavandino del bagno' });
  }
  const leaky = new Set(pickN(sinks.map((_, i) => i), Math.min(leaks, sinks.length)));
  const fixed = new Set<number>();
  const checked = new Set<number>();
  let piping = false;
  const qs: number[] = [];
  const valveAt = room.at(-3.2, 1.2);
  const valve = valveMesh();
  let boxObj: THREE.Object3D;
  const boxAt = room.at(-1.0, 1.8);
  const phases: Phase[] = [
    {
      name: "Chiudi l'acqua", icon: '🔴',
      tip: "Prima di toccare i tubi chiudi il <b>rubinetto generale</b> (il volantino rosso sul muro): tieni premuto",
      tasks: () => [{ pos: valveAt.clone().add(new THREE.Vector3(0.7, 0, 0)), kind: 'hold', sec: 1.1, label: "Chiudi l'acqua", icon: '🔴', own: true, obj: valve.g, onProgress: (p) => (valve.wheel.rotation.z = -p * Math.PI * 2) }],
    },
    {
      name: 'Prendi la cassetta', icon: '🧰',
      tip: 'Prendi la <b>cassetta degli attrezzi</b>',
      tasks: () => [{ pos: boxAt, kind: 'tap', label: 'Prendi la cassetta', icon: '🧰', own: true, obj: boxObj, onDone: () => { boxObj.visible = false; hold(game, toolbox()); } }],
    },
    {
      name: 'Collega i tubi', icon: '💧', count: () => [fixed.size, sinks.length],
      tip: sinks.length > 1 ? 'Sotto ogni lavandino <b>collega i tubi</b>: girali finché l\'acqua arriva al rubinetto' : 'Sotto il lavello <b>collega i tubi</b>: girali finché l\'acqua arriva al rubinetto',
      tasks: () => sinks.map((s, i): Task => ({
        pos: s.at, kind: 'tap', repeat: true, label: `Tubi del ${s.name}`, icon: '💧', own: true, obj: s.obj,
        enabled: () => !fixed.has(i) && !piping,
        onDone: () => {
          piping = true;
          run.openStation(new PipeStation(cols, rows, (q) => {
            piping = false;
            fixed.add(i);
            qs.push(q);
            run.starCap = capFrom(qs);
            if (fixed.size >= sinks.length) {
              hold(game);
              run.finishPhase();
            }
          }));
        },
      })),
    },
    {
      name: "Riapri l'acqua", icon: '🔴',
      tip: "Fatto: riapri il <b>rubinetto generale</b>",
      tasks: () => [{ pos: valveAt.clone().add(new THREE.Vector3(0.7, 0, 0)), kind: 'hold', sec: 1.1, label: "Riapri l'acqua", icon: '🔴', own: true, obj: valve.g, onProgress: (p) => (valve.wheel.rotation.z = -Math.PI * 2 + p * Math.PI * 2) }],
    },
    {
      name: 'Controlla che non perda', icon: '🚿', count: () => [checked.size, sinks.length],
      tip: leaks ? 'Apri ogni rubinetto e guarda sotto: se un <b>raccordo perde</b>, stringilo (tieni premuto)' : 'Apri ogni rubinetto e guarda che l\'acqua scenda e non perda niente',
      tasks: () => sinks.map((s, i): Task => ({
        pos: s.at, kind: 'tap', label: `Apri il rubinetto del ${s.name}`, icon: '🚿', own: true, obj: s.obj, fx: 'bubble',
        onDone: () => {
          if (!leaky.has(i)) {
            checked.add(i);
            toast('✅ Nessuna perdita', 'good');
          }
        },
        then: () => {
          if (!leaky.has(i)) return [];
          toast('💧 Il raccordo perde!', 'bad');
          const drip = run.prop(dripMesh(), s.at.clone().add(new THREE.Vector3(0, 0, -0.35)), 0, 1);
          return [{
            pos: s.at, kind: 'hold', sec: 1.3, label: 'Stringi il raccordo', icon: '🔧', own: true, obj: s.obj, fx: 'bubble',
            onDone: () => {
              drip.visible = false;
              checked.add(i);
            },
          }];
        },
      })),
    },
  ];
  run = new PhasedRun(game, 1, title, phases, { time: Math.min(290, 50 + sinks.length * (45 + cols * rows * 2) + leaks * 12) });
  run.prop(valve.g, valveAt, Math.PI / 2, 1);
  boxObj = run.prop(toolbox(), boxAt, 0, 1);
  return run;
}

// ---------------- avvio ----------------

/** Avvia il lavoretto di Costruzione e manualità giusto per linea e gradino (null se non è di qui). */
export function startManualJob(game: Game, offer: JobOffer, slot: Slot, title: string): JobRun | null {
  const lv = offer.level;
  const placed = game.city.placed;
  switch (offer.type) {
    // la potatura (gradino 2) resta quella di prima, in jobs.ts
    case 'giardino':
      return rungOf('giardino', lv) === 0 ? lawnJob(game, lv, slot, placed, title) : null;
    case 'montaggio':
      return furnitureJob(game, lv, slot, placed, title);
    case 'pulizie':
      return cleaningJob(game, lv, slot, placed, title);
    case 'idraulico':
      return plumberJob(game, lv, slot, placed, title);
  }
  return null;
}
