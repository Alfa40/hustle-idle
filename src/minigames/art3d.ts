import * as THREE from 'three';
import type { Game } from '../game';
import { rungProgress } from '../config/careers';
import { CHAR_MODELS } from '../sim/economy';
import type { JobOffer } from '../sim/state';
import { toast } from '../sim/bus';
import type { Slot } from '../world/city';
import { Character } from '../world/character';
import { label } from '../world/props';
import { Room } from './room';
import { PhasedRun, type JobRun, type Phase, type Task } from './jobs';
import { crate } from './warehouse';
import { ScrewStation, WipeStation } from './handstations';
import { ButtonStation, CoverStation, PhotoStation, TileStation, TraceStation } from './artstations';

/**
 * Lavoretti di Arte, design e ristrutturazione, gradino di base delle linee nuove (tabella in CARRIERE.md):
 * - 🪚 Piccola falegnameria: prendi l'asse, tagliala sulla linea, carteggia, vernicia, appendi la mensola;
 * - 🧱 Posare le piastrelle: stendi la colla, posa le piastrelle come nel disegno, puliscile;
 * - 📷 Foto alle feste: fotografa ogni gruppo di invitati (dentro la cornice, quando sorridono);
 * - 🧵 Riparazioni sartoriali: per ogni capo cuci l'orlo sulla linea, attacca il bottone, appendilo.
 * La pittura (Dipingere la recinzione) è il lavoretto vecchio dell'imbianchino (jobs.ts).
 * Come in Costruzione e manualità: terza persona, fasi, minigiochi col dito e tutorial passo passo; gli errori
 * si possono fare e contano alla fine (stelle massime dalla qualità dei minigiochi).
 */

type Placed = { path: string; m: THREE.Matrix4 }[];
const hold = (game: Game, obj?: THREE.Object3D) => game.player.hold(obj);
const lamb = (c: number) => new THREE.MeshLambertMaterial({ color: c });

function part(g: THREE.Group, geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, lamb(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

/** Stelle massime dalla qualità media dei minigiochi col dito (1 = tutto perfetto). */
function capFrom(qs: number[]) {
  if (!qs.length) return 3;
  const q = qs.reduce((a, b) => a + b, 0) / qs.length;
  return q >= 0.85 ? 3 : q >= 0.6 ? 2 : 1;
}

/**
 * Un passo con un minigioco col dito: si tocca la postazione, si apre il minigioco e alla fine la fase finisce
 * (la qualità va nelle stelle massime). `after` sistema la scena (es. l'asse diventa verniciata).
 */
function stationTask(run: () => PhasedRun, qs: number[], t: Omit<Task, 'kind' | 'onDone' | 'enabled' | 'repeat'>, open: (done: (q: number) => void) => void, after?: () => void): Task {
  let busy = false;
  return {
    ...t, kind: 'tap', repeat: true, own: true,
    enabled: () => !busy,
    onDone: () => {
      busy = true;
      open((q) => {
        qs.push(q);
        run().starCap = capFrom(qs);
        after?.();
        run().finishPhase();
      });
    },
  };
}

// ======================================================================================
// Oggetti di scena
// ======================================================================================

const WOOD = 0xd9a46a;

/** Le assi appoggiate al muro (da dove si prende quella da lavorare). */
function boardRack() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = part(g, new THREE.BoxGeometry(0.22, 1.5, 0.04), [WOOD, 0xc98f55, 0xe3b783, 0xb9804a][i], -0.36 + i * 0.24, 0.72, 0);
    b.rotation.x = -0.18;
  }
  return g;
}

function plankMesh(color = WOOD, len = 0.9) {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(len, 0.04, 0.22), color, 0, 0.02, 0);
  return g;
}

function bucketMesh(color: number) {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.17, 0.14, 0.3, 14), color, 0, 0.15, 0);
  part(g, new THREE.CylinderGeometry(0.15, 0.15, 0.02, 14), 0xf2efe6, 0, 0.3, 0);
  return g;
}

function tileStack() {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) part(g, new THREE.BoxGeometry(0.3, 0.025, 0.3), i % 2 ? 0x2d9cdb : 0xf4f1ea, 0, 0.013 + i * 0.027, 0);
  return g;
}

function cameraMesh() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.22, 0.14, 0.1), 0x3a2f55, 0, 0.07, 0);
  const lens = part(g, new THREE.CylinderGeometry(0.045, 0.05, 0.08, 14), 0x66708a, 0, 0.07, 0.08);
  lens.rotation.x = Math.PI / 2;
  part(g, new THREE.BoxGeometry(0.05, 0.03, 0.04), 0xe5484d, 0.07, 0.15, 0);
  return g;
}

/** Un capo da riparare: maglietta, pantaloni o gonna (forme semplici). */
type Garment = { name: string; the: string; fixed: string; color: number };
const GARMENTS: Garment[] = [
  { name: 'maglietta', the: 'la maglietta', fixed: 'Maglietta riparata', color: 0x2d9cdb },
  { name: 'pantaloni', the: 'i pantaloni', fixed: 'Pantaloni riparati', color: 0x3a4f8a },
  { name: 'camicia', the: 'la camicia', fixed: 'Camicia riparata', color: 0xff9ec4 },
];

function garmentMesh(gm: Garment, flat = true) {
  const g = new THREE.Group();
  if (flat) {
    part(g, new THREE.BoxGeometry(0.42, 0.04, 0.36), gm.color, 0, 0.02, 0);
    part(g, new THREE.BoxGeometry(0.62, 0.035, 0.14), gm.color, 0, 0.02, -0.11);
  } else {
    // appeso alla stampella
    part(g, new THREE.BoxGeometry(0.4, 0.5, 0.04), gm.color, 0, -0.3, 0);
    part(g, new THREE.BoxGeometry(0.44, 0.03, 0.03), 0x8a5a33, 0, -0.04, 0);
  }
  return g;
}

function sewingMachine() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.5, 0.08, 0.24), 0xf4f1ea, 0, 0.04, 0);
  part(g, new THREE.BoxGeometry(0.1, 0.26, 0.18), 0xf4f1ea, 0.18, 0.2, 0);
  part(g, new THREE.BoxGeometry(0.42, 0.08, 0.16), 0xf4f1ea, 0.0, 0.32, 0);
  part(g, new THREE.BoxGeometry(0.03, 0.12, 0.03), 0x9aa6b1, -0.18, 0.22, 0);
  part(g, new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10), 0xe5484d, 0.05, 0.4, 0);
  return g;
}

function npc(run: PhasedRun, at: THREE.Vector3, k: number, face = 0) {
  const c = new Character(CHAR_MODELS[k % CHAR_MODELS.length]);
  run.prop(c.root, at.clone(), face, 1).userData.noGlow = true;
  return c;
}

// ======================================================================================
// 🪚 Piccola falegnameria
// ======================================================================================

/**
 * Una mensola in falegnameria: prendi un'asse dalla rastrelliera, al banco tagliala seguendo la linea (sega),
 * carteggia i punti ruvidi, verniciala tutta col pennello, poi appendila al muro avvitando le viti. Salendo: due
 * tagli, più punti ruvidi, pennello più piccolo, tre viti.
 */
export function carpentryJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('falegnameria', lineLevel);
  const cuts = t < 0.5 ? 1 : 2;
  const rough = Math.round(3 + 2 * t);
  const brush = 0.12 - 0.04 * t;
  const screws = t < 0.6 ? 2 : 3;
  const room = game.enterArena(new Room({ w: 7, d: 5.5, floor: 0xc9a77c, wall: 0xf3eadb, sign: '🪚 Falegnameria', slot, placed }));
  let run: PhasedRun;
  const R = () => run;
  const qs: number[] = [];
  const rackAt = room.at(-2.8, -2.3);
  const bench = room.furn('table', 0, -2.1, 0);
  const benchAt = room.near(0, -2.1, 0, 0.9);
  const wallAt = room.at(2.6, -2.55);
  let rack: THREE.Object3D;
  let plank: THREE.Object3D | null = null;
  let mark: THREE.Object3D;
  const onBench = (color: number) => {
    if (plank) plank.visible = false;
    plank = run.prop(plankMesh(color), room.at(0, -2.1).setY(bench.top + 0.01), 0, 1);
  };
  const phases: Phase[] = [
    {
      name: "Prendi l'asse", icon: '🪵',
      tip: "Prendi un'<b>asse</b> dalla rastrelliera",
      tasks: () => [{ pos: rackAt.clone().add(new THREE.Vector3(0, 0, 0.8)), kind: 'tap', label: "Prendi l'asse", icon: '🪵', own: true, obj: rack, onDone: () => hold(game, plankMesh(WOOD, 0.5)) }],
    },
    {
      name: "Taglia l'asse", icon: '🪚',
      tip: 'Al <b>banco</b>: segui la linea con la sega',
      tasks: () => [stationTask(R, qs, { pos: benchAt, label: "Taglia l'asse", icon: '🪚', obj: bench.obj }, (done) => {
        hold(game);
        onBench(WOOD);
        run.openStation(new TraceStation("Taglia l'asse", 'sega', cuts, 0.045 - 0.012 * t, done));
      })],
    },
    {
      name: 'Carteggia', icon: '🪵',
      tip: 'Togli i punti <b>ruvidi</b> con la carta vetrata',
      tasks: () => [stationTask(R, qs, { pos: benchAt, label: 'Carteggia l\'asse', icon: '🪵', obj: bench.obj }, (done) => {
        run.openStation(new WipeStation("Carteggia l'asse", 'ruvido', rough, 5 - 2 * t, done));
      }, () => onBench(0xe8c89a))],
    },
    {
      name: 'Vernicia', icon: '🖌️',
      tip: "Passa la <b>vernice</b> su tutta l'asse",
      tasks: () => [stationTask(R, qs, { pos: benchAt, label: "Vernicia l'asse", icon: '🖌️', obj: bench.obj }, (done) => {
        run.openStation(new CoverStation("Vernicia l'asse", 'vernice', brush, done));
      }, () => onBench(0xa0522d))],
    },
    {
      name: 'Prendi la mensola', icon: '🪵',
      tip: 'La vernice è asciutta: prendi la <b>mensola</b>',
      tasks: () => [{ pos: benchAt, kind: 'tap', label: 'Prendi la mensola', icon: '🪵', own: true, obj: bench.obj, onDone: () => {
        if (plank) plank.visible = false;
        hold(game, plankMesh(0xa0522d, 0.5));
      } }],
    },
    {
      name: 'Appendi la mensola', icon: '🔧',
      tip: 'Appendila al <b>muro</b>, dove c\'è il segno: avvita le viti',
      tasks: () => [stationTask(R, qs, { pos: wallAt.clone().add(new THREE.Vector3(0, 0, 0.8)), label: 'Appendi la mensola', icon: '🔧', obj: mark }, (done) => {
        hold(game);
        run.openStation(new ScrewStation('Appendi la mensola', screws, 2, done));
      }, () => {
        mark.visible = false;
        run.prop(plankMesh(0xa0522d), wallAt.clone().setY(1.25).add(new THREE.Vector3(0, 0, 0.12)), 0, 1);
        toast('🪵 Mensola appesa!', 'good');
      })],
    },
  ];
  run = new PhasedRun(game, 1, title, phases, { time: Math.min(290, 150 + cuts * 20 + rough * 6) });
  rack = run.prop(boardRack(), rackAt, 0, 1);
  // il segno sul muro: dove va la mensola
  const m = new THREE.Group();
  const sh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.02), new THREE.MeshLambertMaterial({ color: 0xffc21a }));
  sh.position.y = 1.25;
  m.add(sh);
  mark = run.prop(m, wallAt, 0, 1);
  room.furn('bookcaseOpen', -1.4, -2.3, 0);
  room.furn('desk', 2.6, 1.6, Math.PI);
  return run;
}

// ======================================================================================
// 🧱 Posare le piastrelle
// ======================================================================================

/**
 * Pavimento del bagno del cliente: prendi il secchio, stendi la colla su tutto il riquadro, prendi le piastrelle e
 * posale come nel disegno (scegli il colore e tocca il posto), infine puliscile. Salendo: griglia più grande, tre
 * colori, spatola più piccola, più macchie da pulire.
 */
export function tilingJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('ristrutturazione', lineLevel);
  const size = t < 0.5 ? 3 : 4;
  const colors = t < 0.6 ? 2 : 3;
  const room = game.enterArena(new Room({ w: 7, d: 5.5, floor: 0x9a948a, wall: 0xe6f0f5, sign: '🛁 Bagno del cliente', slot, placed }));
  let run: PhasedRun;
  const R = () => run;
  const qs: number[] = [];
  room.furn('bathroomSink', -2.6, -2.4, 0);
  room.furn('trashcan', 3.0, -2.4, 0);
  // il riquadro del pavimento da rifare
  const floorAt = room.at(0.2, -0.8);
  const area = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.02, 2), lamb(0x7e786e));
  base.position.y = 0.012;
  area.add(base);
  const border = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.015, 2.1), lamb(0xffc21a));
  border.position.y = 0.006;
  area.add(border);
  const floorStand = floorAt.clone().add(new THREE.Vector3(0, 0, 1.5));
  const bucketAt = room.at(-2.8, 1.6);
  const boxAt = room.at(2.8, 1.6);
  let bucket: THREE.Object3D;
  let box: THREE.Object3D;
  let areaObj: THREE.Object3D;
  let tiles: TileStation | null = null;
  const phases: Phase[] = [
    {
      name: 'Prendi la colla', icon: '🪣',
      tip: 'Prendi il <b>secchio della colla</b>',
      tasks: () => [{ pos: bucketAt.clone().add(new THREE.Vector3(0.7, 0, 0)), kind: 'tap', label: 'Prendi la colla', icon: '🪣', own: true, obj: bucket, onDone: () => {
        bucket.visible = false;
        hold(game, bucketMesh(0xe0e0e0));
      } }],
    },
    {
      name: 'Stendi la colla', icon: '🪣',
      tip: 'Stendi la <b>colla</b> su tutto il riquadro giallo',
      tasks: () => [stationTask(R, qs, { pos: floorStand, label: 'Stendi la colla', icon: '🪣', obj: areaObj }, (done) => {
        hold(game);
        run.openStation(new CoverStation('Stendi la colla', 'colla', 0.13 - 0.03 * t, done));
      }, () => ((base.material as THREE.MeshLambertMaterial).color.set(0xe8e2d4)))],
    },
    {
      name: 'Prendi le piastrelle', icon: '🧱',
      tip: 'Prendi le <b>piastrelle</b> dalla scatola',
      tasks: () => [{ pos: boxAt.clone().add(new THREE.Vector3(-0.7, 0, 0)), kind: 'tap', label: 'Prendi le piastrelle', icon: '🧱', own: true, obj: box, onDone: () => hold(game, tileStack()) }],
    },
    {
      name: 'Posa le piastrelle', icon: '🧱',
      tip: 'Posale <b>come nel disegno</b> del cliente',
      tasks: () => [stationTask(R, qs, { pos: floorStand, label: 'Posa le piastrelle', icon: '🧱', obj: areaObj }, (done) => {
        hold(game);
        tiles = new TileStation(size, size, colors, done);
        run.openStation(tiles);
      }, () => {
        // il pavimento nella scena: le piastrelle come le hai posate
        const r = tiles!.result();
        const c = 1.9 / r.cols;
        r.put.forEach((k, i) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(c - 0.03, 0.02, c - 0.03), lamb(new THREE.Color(r.colors[k]).getHex()));
          m.position.set(-0.95 + (i % r.cols + 0.5) * c, 0.03, -0.95 + (Math.floor(i / r.cols) + 0.5) * c);
          areaObj.add(m);
        });
      })],
    },
    {
      name: 'Pulisci le piastrelle', icon: '🧽',
      tip: 'Togli la <b>colla</b> rimasta sulle piastrelle',
      tasks: () => [stationTask(R, qs, { pos: floorStand, label: 'Pulisci le piastrelle', icon: '🧽', obj: areaObj }, (done) => {
        run.openStation(new WipeStation('Pulisci le piastrelle', 'piastrelle', 3 + Math.round(2 * t), 5 - 2 * t, done));
      }, () => toast('✨ Pavimento nuovo!', 'good'))],
    },
  ];
  run = new PhasedRun(game, 1, title, phases, { time: Math.min(290, 140 + size * size * 5) });
  areaObj = run.prop(area, floorAt, 0, 1);
  bucket = run.prop(bucketMesh(0xe0e0e0), bucketAt, 0, 1);
  box = run.prop(crate(0.6, 0x2d9cdb, 0xffffff), boxAt, 0, 1);
  return run;
}

// ======================================================================================
// 📷 Foto alle feste
// ======================================================================================

/**
 * Festa in giardino: prendi la macchina fotografica, fotografa ogni gruppo di invitati (il gruppo dentro la
 * cornice, scatta quando sorridono), poi mostra le foto a chi ha organizzato. Salendo: più gruppi e più persone,
 * si muovono di più, il sorriso dura meno, due foto per gruppo.
 */
export function photoJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('foto', lineLevel);
  const groups = t < 0.5 ? 2 : 3;
  const size = t < 0.3 ? 2 : t < 0.7 ? 3 : 4;
  const shots = t < 0.6 ? 1 : 2;
  const room = game.enterArena(new Room({ w: 9, d: 7, floor: 0x8fc96b, wall: 0xfff2d6, sign: '🎉 Festa', slot, placed }));
  let run: PhasedRun;
  const qs: number[] = [];
  const done = new Set<number>();
  let busy = false;
  const camAt = room.at(-3.6, 2.2);
  const camTable = room.furn('sideTable', -3.6, 2.2, 0);
  room.furn('tableCloth', 0, -2.8, 0);
  room.furn('tableRound', 3.4, 1.2, 0);
  let camObj: THREE.Object3D;
  let host: THREE.Object3D;
  const spots = [room.at(-2.6, -1.2), room.at(1.0, -0.4), room.at(2.6, -2.4)].slice(0, groups);
  const groupObjs: THREE.Object3D[] = [];
  const phases: Phase[] = [
    {
      name: 'Prendi la macchina fotografica', icon: '📷',
      tip: 'La <b>macchina fotografica</b> è sul tavolino vicino all\'ingresso',
      tasks: () => [{ pos: camAt.clone().add(new THREE.Vector3(0.7, 0, 0)), kind: 'tap', label: 'Prendi la macchina fotografica', icon: '📷', own: true, obj: camObj, onDone: () => {
        camObj.visible = false;
        hold(game, cameraMesh());
      } }],
    },
    {
      name: 'Fotografa i gruppi', icon: '📷', count: () => [done.size, groups],
      tip: 'Davanti a ogni <b>gruppo</b>: inquadra e scatta quando sorridono',
      tasks: () => spots.map((s, i): Task => ({
        pos: s.clone().add(new THREE.Vector3(0, 0, 1.6)), kind: 'tap', repeat: true, own: true, label: `Fotografa il gruppo ${i + 1}`, icon: '📷', obj: groupObjs[i],
        enabled: () => !done.has(i) && !busy,
        onDone: () => {
          busy = true;
          run.openStation(new PhotoStation(`Gruppo ${i + 1}`, shots, 0.7 + 0.8 * t, 0.07 + 0.15 * t, 1.8 - 0.8 * t, size, (q) => {
            busy = false;
            done.add(i);
            qs.push(q);
            run.starCap = capFrom(qs);
            if (done.size >= groups) {
              hold(game);
              run.finishPhase();
            }
          }));
        },
      })),
    },
    {
      name: 'Mostra le foto', icon: '🖼️',
      tip: 'Mostra le foto a chi ha organizzato la festa',
      tasks: () => [{ pos: room.near(3.4, 2.6, -0.9, 0), kind: 'tap', quiet: true, label: 'Mostra le foto', icon: '🖼️', own: true, obj: host, onDone: () => toast('🖼️ Che belle foto!', 'good') }],
    },
  ];
  run = new PhasedRun(game, 1, title, phases, { time: Math.min(290, 60 + groups * shots * 30) });
  camObj = run.prop(cameraMesh(), camAt.clone().setY(camTable.top + 0.01), 0, 1);
  spots.forEach((s, i) => {
    // il gruppo: persone vicine che chiacchierano, girate verso chi arriva
    const g = new THREE.Group();
    run.prop(g, s, 0, 1);
    groupObjs.push(g);
    for (let k = 0; k < size; k++) {
      const c = npc(run, s.clone().add(new THREE.Vector3((k - (size - 1) / 2) * 0.7, 0, 0)), i * 3 + k, 0);
      c.root.userData.noGlow = false;
      g.attach(c.root);
    }
    const tag = label(`📷 ${i + 1}`, { bg: '#ffffff', fg: '#3a2f55', scale: 0.6 });
    tag.position.set(0, 2.4, 0);
    tag.userData.noGlow = true;
    g.add(tag);
  });
  host = run.finisher(room.at(3.4, 2.6), -Math.PI / 2, '🖼️ Fammi vedere le foto!', 2);
  return run;
}

// ======================================================================================
// 🧵 Riparazioni sartoriali
// ======================================================================================

/**
 * Sartoria: per ogni capo della cesta cuci l'orlo alla macchina seguendo la linea, attacca il bottone (i buchi
 * nell'ordine acceso) e appendilo alla stampella. Salendo: due capi, due righe di cucito, due giri e due bottoni.
 */
export function tailorJob(game: Game, lineLevel: number, slot: Slot, placed: Placed, title: string) {
  const t = rungProgress('moda', lineLevel);
  const items = GARMENTS.slice(0, t < 0.5 ? 1 : 2);
  const lines = t < 0.4 ? 1 : 2;
  const reps = t < 0.7 ? 1 : 2;
  const buttons = t < 0.8 ? 1 : 2;
  const room = game.enterArena(new Room({ w: 7, d: 5.5, floor: 0xd7c4a3, wall: 0xf7e8ee, sign: '🧵 Sartoria', slot, placed }));
  let run: PhasedRun;
  const R = () => run;
  const qs: number[] = [];
  const basketAt = room.at(-2.8, 1.4);
  const machine = room.furn('table', -0.6, -2.2, 0);
  const machineAt = room.near(-0.6, -2.2, 0, 0.9);
  const desk = room.furn('desk', 2.0, -2.2, 0);
  const deskAt = room.near(2.0, -2.2, 0, 0.9);
  const rack = room.furn('coatRackStanding', 2.9, 1.4, 0);
  const rackAt = room.near(2.9, 1.4, -0.8, 0);
  let basket: THREE.Object3D;
  const hung: number[] = [];
  const phases: Phase[] = [];
  items.forEach((gm, i) => {
    const n = items.length > 1 ? `Capo ${i + 1}: ` : '';
    phases.push(
      {
        name: `${n}prendi ${gm.the}`, icon: '👕',
        tip: 'Prendi il <b>capo</b> dalla cesta',
        tasks: () => [{ pos: basketAt.clone().add(new THREE.Vector3(0.7, 0, 0)), kind: 'tap', label: `Prendi: ${gm.name}`, icon: '👕', own: true, obj: basket, onDone: () => hold(game, garmentMesh(gm)) }],
      },
      {
        name: `${n}cuci l'orlo`, icon: '🧵',
        tip: "Alla <b>macchina da cucire</b>: segui la linea dell'orlo",
        tasks: () => [stationTask(R, qs, { pos: machineAt, label: "Cuci l'orlo", icon: '🧵', obj: machine.obj }, (done) => {
          run.openStation(new TraceStation(`Orlo: ${gm.name}`, 'cucito', lines, 0.05 - 0.015 * t, done));
        })],
      },
      {
        name: `${n}attacca il bottone`, icon: '🧵',
        tip: 'Al tavolo: cuci il <b>bottone</b>',
        tasks: () => [stationTask(R, qs, { pos: deskAt, label: 'Attacca il bottone', icon: '🧵', obj: desk.obj }, (done) => {
          run.openStation(new ButtonStation(reps, buttons, done));
        })],
      },
      {
        name: `${n}appendi il capo`, icon: '👕',
        tip: 'Appendi il capo alla <b>stampella</b>',
        tasks: () => [{ pos: rackAt, kind: 'tap', label: 'Appendi il capo', icon: '👕', own: true, obj: rack.obj, onDone: () => {
          hold(game);
          hung.push(i);
          const o = run.prop(garmentMesh(gm, false), room.at(2.9, 1.4).setY(rack.top - 0.1), 0, 1);
          o.position.x += (hung.length - 1) * 0.12 - 0.05;
          toast(`👕 ${gm.fixed}!`, 'good');
        } }],
      },
    );
  });
  run = new PhasedRun(game, 1, title, phases, { time: Math.min(290, 40 + items.length * (50 + lines * 20 + reps * buttons * 15)) });
  const b = crate(0.7, 0xc98a4b, 0xffffff);
  items.forEach((gm, i) => {
    const m = garmentMesh(gm);
    m.position.y = 0.72 + i * 0.05;
    b.add(m);
  });
  basket = run.prop(b, basketAt, 0, 1);
  run.prop(sewingMachine(), room.at(-0.6, -2.2).setY(machine.top + 0.01), 0, 1);
  return run;
}

// ---------------- avvio ----------------

/** Avvia il lavoretto di Arte, design e ristrutturazione giusto per la linea (null se non è di qui). */
export function startArtJob(game: Game, offer: JobOffer, slot: Slot, title: string): JobRun | null {
  const lv = offer.level;
  const placed = game.city.placed;
  switch (offer.type) {
    case 'falegnameria':
      return carpentryJob(game, lv, slot, placed, title);
    case 'ristrutturazione':
      return tilingJob(game, lv, slot, placed, title);
    case 'foto':
      return photoJob(game, lv, slot, placed, title);
    case 'moda':
      return tailorJob(game, lv, slot, placed, title);
  }
  return null;
}
