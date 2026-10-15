import * as THREE from 'three';
import { model } from '../assets';
import type { Slot } from '../world/city';
import { buildSurroundings } from '../world/surroundings';
import { label } from '../world/props';
import type { Box } from './arena';

/**
 * Scena separata dei lavoretti al chiuso di Ristorazione e ospitalità (cucina, sala, hotel, bar, forno): un
 * locale senza tetto (si vede il cielo e, oltre i muri, il quartiere vero dove si è accettato il lavoro), con
 * muri bassi, pavimento e mobili Kenney. Grande quanto serve per le cose da fare.
 */
export const ROOM_ORIGIN = new THREE.Vector3(0, 0, 4800);

/** Mobili usati nei locali (da precaricare). */
export const ROOM_ASSETS = [
  'table', 'tableRound', 'tableCloth', 'chairCushion', 'chair', 'kitchenBar', 'kitchenBarEnd', 'stoolBar', 'kitchenCoffeeMachine',
  'kitchenMicrowave', 'kitchenCabinetUpper', 'kitchenCabinet', 'kitchenStove', 'kitchenFridge', 'kitchenFridgeLarge', 'kitchenSink',
  'bedSingle', 'bedDouble', 'bathroomSink', 'trashcan', 'coatRackStanding', 'sideTable', 'lampRoundTable', 'rugRound', 'rugRectangle',
  'plantSmall1', 'pottedPlant', 'books', 'cabinetBedDrawerTable', 'toaster', 'kitchenBlender', 'bench', 'loungeSofa', 'desk',
].map((n) => `furniture/${n}.glb`);

/** Scala dei mobili Kenney (come nella casa del cliente): un bancone arriva a circa 1 m. */
export const FURN = 2.3;

const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c });

export interface RoomOpts {
  w: number;
  d: number;
  /** colore del pavimento e dei muri */
  floor?: number;
  wall?: number;
  /** pavimento a scacchi (cucine, bar) */
  tiles?: boolean;
  /** cartello sopra la porta */
  sign?: string;
  slot?: Slot;
  placed?: { path: string; m: THREE.Matrix4 }[];
}

export class Room {
  group = new THREE.Group();
  bounds: Box;
  blocks: Box[] = [];
  /** dentro, vicino alla porta (sul lato davanti, +z) */
  entry: THREE.Vector3;
  /** centro del pavimento */
  center: THREE.Vector3;
  readonly w: number;
  readonly d: number;

  constructor(opts: RoomOpts) {
    const O = ROOM_ORIGIN;
    const g = this.group;
    const W = (this.w = opts.w);
    const D = (this.d = opts.d);
    this.center = O.clone();
    this.bounds = { minX: O.x - W / 2 + 0.35, maxX: O.x + W / 2 - 0.35, minZ: O.z - D / 2 + 0.35, maxZ: O.z + D / 2 - 0.35 };
    const plane = (w: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, y, z);
      p.receiveShadow = true;
      g.add(p);
      return p;
    };
    plane(900, 900, mat(0x6fae4f), O.x, -0.02, O.z);
    plane(W + 6, D + 8, mat(0x9aa0aa), O.x, -0.01, O.z + 1);
    if (opts.tiles) {
      // scacchi bianchi e grigi
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d')!;
      x.fillStyle = '#f2f2f2';
      x.fillRect(0, 0, 64, 64);
      x.fillStyle = '#b9bcc4';
      x.fillRect(0, 0, 32, 32);
      x.fillRect(32, 32, 32, 32);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(W / 1.2, D / 1.2);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      plane(W, D, new THREE.MeshLambertMaterial({ map: tex }), O.x, 0.01, O.z);
    } else plane(W, D, mat(opts.floor ?? 0xc9a77c), O.x, 0.01, O.z);
    // muri bassi (niente tetto) con la porta davanti in mezzo
    const H = 2.8;
    const wallM = mat(opts.wall ?? 0xf1e6d2);
    const wall = (x: number, z: number, w: number, d: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallM);
      m.position.set(x, H / 2, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      this.blocks.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    };
    const DOOR = 1.8;
    wall(O.x, O.z - D / 2 - 0.15, W + 0.6, 0.3);
    wall(O.x - W / 2 - 0.15, O.z, 0.3, D);
    wall(O.x + W / 2 + 0.15, O.z, 0.3, D);
    const side = (W - DOOR) / 2;
    wall(O.x - DOOR / 2 - side / 2, O.z + D / 2 + 0.15, side, 0.3);
    wall(O.x + DOOR / 2 + side / 2, O.z + D / 2 + 0.15, side, 0.3);
    // battiscopa colorato in cima ai muri
    for (const [x, z, w2, d2] of [[0, -D / 2 - 0.15, W + 0.6, 0.34], [0, D / 2 + 0.15, W + 0.6, 0.34], [-W / 2 - 0.15, 0, 0.34, D], [W / 2 + 0.15, 0, 0.34, D]] as const) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.22, d2), mat(0x8e5bd6));
      b.position.set(O.x + x, H + 0.11, O.z + z);
      g.add(b);
    }
    if (opts.sign) {
      const s = label(opts.sign, { bg: '#e8590c', scale: 0.7 });
      s.position.set(O.x, H + 1.1, O.z + D / 2 + 0.3);
      g.add(s);
    }
    this.entry = new THREE.Vector3(O.x, 0, O.z + D / 2 - 0.9);
    if (opts.slot && opts.placed) buildSurroundings(g, opts.slot, opts.placed, new THREE.Vector3(O.x, 0, O.z + 1), W + 6, D + 8);
  }

  /**
   * Mette un mobile Kenney centrato in (x, z) del locale (coordinate rispetto al centro), girato di `rot`;
   * se `solid` non si attraversa. Restituisce l'oggetto e il suo ingombro.
   */
  furn(path: string, x: number, z: number, rot = 0, scale = FURN, solid = true) {
    const O = ROOM_ORIGIN;
    const inner = model(`furniture/${path}.glb`, scale);
    const box = new THREE.Box3().setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -box.min.y, -c.z);
    const o = new THREE.Group();
    o.add(inner);
    o.position.set(O.x + x, 0, O.z + z);
    o.rotation.y = rot;
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true;
    });
    this.group.add(o);
    o.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(o);
    if (solid) this.blocks.push({ minX: bb.min.x, maxX: bb.max.x, minZ: bb.min.z, maxZ: bb.max.z });
    return { obj: o, top: bb.max.y, box: bb };
  }

  /** Punto del locale (coordinate rispetto al centro). */
  at(x: number, z: number, y = 0) {
    return new THREE.Vector3(ROOM_ORIGIN.x + x, y, ROOM_ORIGIN.z + z);
  }

  collide(p: THREE.Vector3, r = 0.35) {
    const b = this.bounds;
    p.x = THREE.MathUtils.clamp(p.x, b.minX, b.maxX);
    p.z = THREE.MathUtils.clamp(p.z, b.minZ, b.maxZ);
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
}
