import * as THREE from 'three';
import { model } from '../assets';
import type { Slot } from '../world/city';
import { buildSurroundings } from '../world/surroundings';
import { label } from '../world/props';
import type { Box } from './arena';

/**
 * Scena separata dei lavoretti di magazzino: un capannone senza tetto (si vede il cielo e il quartiere
 * vero attorno, come negli altri minigiochi) con gli scaffali, la banchina di carico sul davanti e il camion
 * parcheggiato col retro verso la banchina. Grande quanto serve: poche cose da fare = capannone piccolo.
 */
/** Modelli dei lavoretti di Trasporti e logistica (da precaricare). */
export const LOGISTICS_ASSETS = ['cars/truck.glb', 'cars/truck-flat.glb', 'cars/taxi.glb', 'cars/box.glb', 'cars/suv.glb', 'cars/delivery.glb', 'cars/van.glb'];

export const WAREHOUSE_ORIGIN = new THREE.Vector3(0, 0, 4400);

const mat = (color: number) => new THREE.MeshLambertMaterial({ color });

/** Colori degli scaffali (al Liv. 1 si sistema per colore, poi per codice). */
export const SHELF_COLORS = [
  { name: 'rosso', hex: 0xe5484d, icon: '🟥' },
  { name: 'blu', hex: 0x2d6cdb, icon: '🟦' },
  { name: 'verde', hex: 0x2fb36b, icon: '🟩' },
  { name: 'giallo', hex: 0xffc21a, icon: '🟨' },
  { name: 'viola', hex: 0x8e5bd6, icon: '🟪' },
];

export interface Shelf {
  /** centro a terra dello scaffale */
  pos: THREE.Vector3;
  /** verso il corridoio (dove si sta per usarlo) */
  front: THREE.Vector3;
  /** lungo lo scaffale */
  side: THREE.Vector3;
  obj: THREE.Object3D;
  /** altezza dei ripiani */
  boards: number[];
  color: (typeof SHELF_COLORS)[number];
  code: string;
}

export interface WarehouseOpts {
  /** quante file di scaffali (2 = piccolo, 4 = grande) */
  rows: number;
  /** scaffali per fila */
  perRow: number;
  /** larghezza del corridoio tra le file (più stretto = più difficile col muletto) */
  aisle?: number;
  /** scaffali alti (4 ripiani) per il muletto */
  tall?: boolean;
  /** camion col cassone aperto (scatole e bancali si vedono) */
  flatbed?: boolean;
  /** larghezza degli scaffali (m) */
  shelfW?: number;
  /** scaffali tutti del loro colore (montanti compresi) e senza cartello col codice: si riconoscono dal colore */
  colorOnly?: boolean;
  slot?: Slot;
  placed?: { path: string; m: THREE.Matrix4 }[];
}

export class Warehouse {
  group = new THREE.Group();
  bounds: Box;
  blocks: Box[] = [];
  entry: THREE.Vector3;
  shelves: Shelf[] = [];
  /** camion alla banchina: centro, retro (dove si carica) e oggetto */
  truck: { pos: THREE.Vector3; rear: THREE.Vector3; obj: THREE.Object3D; bedY: number; bedLen: number; bedW: number };
  /** angolo libero vicino all'ingresso (carrello, banco, attrezzi) */
  corner: THREE.Vector3;
  readonly w: number;
  readonly d: number;

  constructor(opts: WarehouseOpts) {
    const O = WAREHOUSE_ORIGIN;
    const g = this.group;
    const aisle = opts.aisle ?? 3.4;
    const SH_W = opts.shelfW ?? 2.6;
    const SH_D = 0.9;
    // grande quanto serve: le file di scaffali con i corridoi, più lo spazio davanti alla banchina
    this.w = Math.max(16, opts.perRow * (SH_W + 0.6) + 6);
    this.d = opts.rows * (SH_D + aisle) + 7;
    const W = this.w;
    const D = this.d;
    this.bounds = { minX: O.x - W / 2 + 0.4, maxX: O.x + W / 2 - 0.4, minZ: O.z - D / 2 + 0.4, maxZ: O.z + D / 2 - 0.4 };

    // prato attorno (fino all'orizzonte), piazzale e pavimento in cemento con le strisce gialle
    const plane = (w: number, d: number, color: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    plane(900, 900, 0x6fae4f, O.x, -0.02, O.z);
    plane(W + 8, D + 20, 0x8a8f99, O.x, 0, O.z + 6);
    plane(W, D, 0xb9bcc4, O.x, 0.01, O.z);
    for (let x = -W / 2 + 2; x < W / 2 - 1; x += 3) plane(1.4, 0.12, 0xffc21a, O.x + x, 0.02, O.z + D / 2 - 3.2);

    // muri bassi del capannone (niente tetto), con l'apertura della banchina davanti
    const WALL_H = 2.8;
    const wall = (x: number, z: number, w: number, d: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), mat(0xd9d2c3));
      m.position.set(x, WALL_H / 2, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      this.blocks.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    };
    const DOCK = 4.6;
    wall(O.x, O.z - D / 2 - 0.15, W + 0.6, 0.3);
    wall(O.x - W / 2 - 0.15, O.z, 0.3, D);
    wall(O.x + W / 2 + 0.15, O.z, 0.3, D);
    const side = (W - DOCK) / 2;
    wall(O.x - DOCK / 2 - side / 2, O.z + D / 2 + 0.15, side, 0.3);
    wall(O.x + DOCK / 2 + side / 2, O.z + D / 2 + 0.15, side, 0.3);
    // fascia arancione in alto sui muri
    for (const [x, z, w2, d2] of [[0, -D / 2 - 0.15, W + 0.6, 0.34], [0, D / 2 + 0.15, W + 0.6, 0.34], [-W / 2 - 0.15, 0, 0.34, D], [W / 2 + 0.15, 0, 0.34, D]] as const) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.3, d2), mat(0xff8a3d));
      b.position.set(O.x + x, WALL_H + 0.15, O.z + z);
      g.add(b);
    }
    const sign = label('🏭 Magazzino', { bg: '#ff8a3d', scale: 0.7 });
    sign.position.set(O.x, WALL_H + 1.2, O.z + D / 2 + 0.2);
    g.add(sign);

    // camion alla banchina: il retro verso l'apertura (i modelli Kenney guardano +Z: davanti verso fuori)
    const TRUCK_SC = 2.2;
    const truckObj = model(opts.flatbed === false ? 'cars/truck.glb' : 'cars/truck-flat.glb', TRUCK_SC);
    const tLen = 2.74 * TRUCK_SC;
    const tz = O.z + D / 2 + tLen / 2 + 0.3;
    truckObj.position.set(O.x, 0, tz);
    truckObj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.add(truckObj);
    this.blocks.push({ minX: O.x - 0.75 * TRUCK_SC, maxX: O.x + 0.75 * TRUCK_SC, minZ: tz - tLen / 2, maxZ: tz + tLen / 2 });
    this.truck = {
      pos: new THREE.Vector3(O.x, 0, tz), rear: new THREE.Vector3(O.x, 0, tz - tLen / 2), obj: truckObj,
      bedY: 0.62 * TRUCK_SC, bedLen: tLen * 0.55, bedW: 1.3 * TRUCK_SC,
    };

    // scaffali in file, rivolti verso il corridoio davanti (verso la banchina)
    const startZ = O.z - D / 2 + 1.2 + SH_D / 2;
    let k = 0;
    for (let r = 0; r < opts.rows; r++) {
      const z = startZ + r * (SH_D + aisle);
      for (let i = 0; i < opts.perRow; i++) {
        const x = O.x - ((opts.perRow - 1) * (SH_W + 0.6)) / 2 + i * (SH_W + 0.6);
        const color = SHELF_COLORS[k % SHELF_COLORS.length];
        const code = String.fromCharCode(65 + k);
        const rack = shelfRack(SH_W, SH_D, opts.tall ? 4 : 3, color.hex, opts.colorOnly);
        rack.obj.position.set(x, 0, z);
        rack.obj.userData.noGlow = true;
        g.add(rack.obj);
        if (!opts.colorOnly) {
          const tag = label(`${color.icon} ${code}`, { bg: '#ffffff', fg: '#222', scale: 0.4 });
          tag.position.set(x, rack.height + 0.35, z);
          g.add(tag);
        }
        this.blocks.push({ minX: x - SH_W / 2, maxX: x + SH_W / 2, minZ: z - SH_D / 2, maxZ: z + SH_D / 2 });
        this.shelves.push({ pos: new THREE.Vector3(x, 0, z), front: new THREE.Vector3(0, 0, 1), side: new THREE.Vector3(1, 0, 0), obj: rack.obj, boards: rack.boards, color, code });
        k++;
      }
    }
    // si entra dalla porta sul lato destro, a metà: si vedono gli scaffali e la banchina
    this.entry = new THREE.Vector3(O.x + W / 2 - 1.6, 0, O.z + D / 2 - 5.5);
    this.corner = new THREE.Vector3(O.x + W / 2 - 2.2, 0, O.z + D / 2 - 2.2);

    if (opts.slot && opts.placed) {
      buildSurroundings(g, opts.slot, opts.placed, new THREE.Vector3(O.x, 0, O.z + 4), W + 6, D + 22);
    }
  }

  collide(p: THREE.Vector3, r = 0.35) {
    const b = this.bounds;
    // si può uscire dalla banchina fino al camion (il piazzale davanti)
    p.x = THREE.MathUtils.clamp(p.x, b.minX, b.maxX);
    p.z = THREE.MathUtils.clamp(p.z, b.minZ, b.maxZ + 0.2);
    for (const k of this.blocks) {
      if (p.x < k.minX - r || p.x > k.maxX + r || p.z < k.minZ - r || p.z > k.maxZ + r) continue;
      const push = [k.minX - r - p.x, k.maxX + r - p.x, k.minZ - r - p.z, k.maxZ + r - p.z];
      const i = push.map(Math.abs).indexOf(Math.min(...push.map(Math.abs)));
      if (i < 2) p.x += push[i];
      else p.z += push[i];
    }
  }

  blocked(x: number, z: number) {
    return this.blocks.some((k) => x > k.minX - 0.15 && x < k.maxX + 0.15 && z > k.minZ - 0.15 && z < k.maxZ + 0.15);
  }

  /** Punto davanti a uno scaffale (nel corridoio), spostato di `along` metri lungo lo scaffale. */
  frontOf(s: Shelf, along = 0, out = 0.75) {
    return s.pos.clone().addScaledVector(s.front, out).addScaledVector(s.side, along);
  }
}

/** Scaffale metallico: montanti blu, ripiani arancioni, fascia del colore in basso. */
export function shelfRack(w: number, d: number, levels: number, color: number, colored = false) {
  const g = new THREE.Group();
  const H = levels * 0.62 + 0.2;
  // `colored`: montanti del colore dello scaffale, così si riconosce da lontano
  const up = mat(colored ? color : 0x2d4f8a);
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, H, 0.08), up);
    p.position.set(x, H / 2, z);
    p.castShadow = true;
    g.add(p);
  }
  const boards: number[] = [];
  for (let i = 0; i < levels; i++) {
    const y = 0.15 + i * 0.62;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), mat(0xff9f43));
    b.position.y = y;
    b.castShadow = b.receiveShadow = true;
    g.add(b);
    boards.push(y + 0.03);
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.04), mat(color));
  stripe.position.set(0, 0.24, d / 2 + 0.02);
  g.add(stripe);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.04), mat(color));
  top.position.set(0, H - 0.05, d / 2 + 0.02);
  g.add(top);
  return { obj: g, boards, height: H };
}

/** Scatola di cartone (colorata o col nastro del colore dello scaffale). */
export function crate(size: number, color = 0xc8935a, tape?: number) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.8, size), mat(color));
  b.position.y = size * 0.4;
  b.castShadow = true;
  g.add(b);
  if (tape !== undefined) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(size * 1.02, size * 0.18, size * 1.02), mat(tape));
    t.position.y = size * 0.55;
    g.add(t);
  }
  return g;
}

/** Bancale di legno con le scatole sopra. */
export function pallet(load = 0xc8935a) {
  const g = new THREE.Group();
  const wood = mat(0xb07a45);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 1.0), wood);
  base.position.y = 0.07;
  base.castShadow = true;
  g.add(base);
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.45), mat(i % 2 ? load : new THREE.Color(load).multiplyScalar(0.85).getHex()));
    c.position.set(i % 2 ? 0.29 : -0.29, 0.35, i < 2 ? 0.24 : -0.24);
    c.castShadow = true;
    g.add(c);
  }
  const film = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.46, 0.98), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }));
  film.position.y = 0.37;
  g.add(film);
  return g;
}

/**
 * Muletto: carrozzeria gialla, montante e forche davanti (+Z). `forks` sale e scende; in prima persona
 * si vedono solo montante e forche (la carrozzeria resta attorno agli occhi e si nasconde).
 */
export function forklift() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const yellow = mat(0xffc21a);
  const dark = mat(0x33333d);
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 1.6), yellow);
  chassis.position.set(0, 0.55, -0.2);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.4), dark);
  counter.position.set(0, 0.7, -0.95);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.06, 1.0), dark);
  roof.position.set(0, 2.05, -0.25);
  body.add(chassis, counter, roof);
  for (const x of [-0.48, 0.48]) for (const z of [-0.65, 0.2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), dark);
    post.position.set(x, 1.45, z);
    body.add(post);
  }
  for (const [x, z] of [[-0.55, 0.35], [0.55, 0.35], [-0.55, -0.75], [0.55, -0.75]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 12), dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.24, z);
    body.add(w);
  }
  const front = new THREE.Group();
  // montante: in prima persona si nasconde (davanti agli occhi coprirebbe la vista), restano le forche
  const mast = new THREE.Group();
  for (const x of [-0.35, 0.35]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 0.1), dark);
    m.position.set(x, 1.15, 0.7);
    mast.add(m);
  }
  front.add(mast);
  const forks = new THREE.Group();
  for (const x of [-0.3, 0.3]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 1.1), mat(0x9aa0aa));
    f.position.set(x, 0, 1.3);
    forks.add(f);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.05), dark);
  plate.position.set(0, 0.25, 0.75);
  forks.add(plate);
  forks.position.y = 0.12;
  front.add(forks);
  g.add(body, front);
  g.traverse((o) => (o.castShadow = true));
  g.userData.forks = forks;
  g.userData.body = body;
  g.userData.mast = mast;
  return g;
}

/** Carrello della spesa da magazzino (si spinge davanti). */
export function trolley() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 1.0), mat(0x8a94a6));
  base.position.y = 0.3;
  g.add(base);
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.45, 0.95), new THREE.MeshLambertMaterial({ color: 0x2d6cdb, transparent: true, opacity: 0.55 }));
  basket.position.y = 0.58;
  g.add(basket);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), mat(0x33333d));
  handle.position.set(0, 1.0, -0.5);
  g.add(handle);
  for (const [x, z] of [[-0.3, 0.42], [0.3, 0.42], [-0.3, -0.42], [0.3, -0.42]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), mat(0x222222));
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.08, z);
    g.add(w);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** Banco da lavoro con il piano chiaro (imballaggio). */
export function workBench(w = 2.2) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.9), mat(0xe8dcc0));
  top.position.y = 0.9;
  top.castShadow = top.receiveShadow = true;
  g.add(top);
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) for (const z of [-0.35, 0.35]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), mat(0x6b7080));
    l.position.set(x, 0.45, z);
    g.add(l);
  }
  return g;
}
