import * as THREE from 'three';
import { gltf, model } from '../assets';
import { HOUSE_MODELS, TREE_MODELS } from '../world/city';
import { fencePillar, fenceSegment } from '../world/jobprops';

/**
 * Scena separata di un minigioco (lavoretto): un lotto grande con la casa del cliente al centro,
 * il giardino tutto attorno e il muretto sul confine. Sta lontanissima dalla città (la nebbia la
 * nasconde), così si riusano personaggio, luci, cielo e la logica dei lavoretti, ma si vede solo questo.
 */
export const ARENA_ORIGIN = new THREE.Vector3(0, 0, 3200);

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Lotto: larghezza (x) e profondità (z) in metri; la casa sta un po' indietro rispetto al centro. */
const LOT_W = 26;
const LOT_D = 22;
/** misure della casa (x, z) */
const HOUSE_W = 8;

export type FenceSide = 'front' | 'left' | 'right' | 'back';

export interface ArenaOpts {
  /** tratti del muretto lungo il confine, uno per lato (davanti diviso dal cancello) */
  fence?: boolean;
}

export class Arena {
  group = new THREE.Group();
  /** confine interno del lotto (il personaggio non esce) */
  bounds: Box;
  /** ingombro della casa e degli ostacoli fissi */
  blocks: Box[] = [];
  /** cancello: si entra da qui, guardando la casa */
  entry: THREE.Vector3;
  /** casa del cliente (per la camera e per non mettere oggetti lì) */
  house: Box;
  /** porta di casa: il vialetto dal cancello alla porta resta libero */
  door: THREE.Vector3;
  /** tratti del muretto (per l'imbianchino): centro, rotazione, lunghezza, punto all'interno */
  fence: { side: FenceSide; pos: THREE.Vector3; rot: number; len: number; inner: THREE.Vector3; obj: THREE.Object3D; body: THREE.Mesh }[] = [];

  constructor(opts: ArenaOpts = {}) {
    const O = ARENA_ORIGIN;
    const g = this.group;
    this.bounds = { minX: O.x - LOT_W / 2 + 0.45, maxX: O.x + LOT_W / 2 - 0.45, minZ: O.z - LOT_D / 2 + 0.45, maxZ: O.z + LOT_D / 2 - 0.45 };
    // prato tutto attorno e prato del giardino (un po' più vivo)
    // prato fino all'orizzonte (la nebbia lo sfuma): niente bordo scuro in lontananza
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: 0x6fae4f }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(O.x, -0.02, O.z);
    ground.receiveShadow = true;
    g.add(ground);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(LOT_W, LOT_D), new THREE.MeshLambertMaterial({ color: 0x7cc35a }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(O.x, 0, O.z);
    lawn.receiveShadow = true;
    g.add(lawn);
    // strada e marciapiede davanti al lotto
    const road = new THREE.Mesh(new THREE.PlaneGeometry(900, 8), new THREE.MeshLambertMaterial({ color: 0x4e5566 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(O.x, 0.005, O.z + LOT_D / 2 + 6.5);
    g.add(road);
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(900, 2.4), new THREE.MeshLambertMaterial({ color: 0xb8bfd6 }));
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(O.x, 0.01, O.z + LOT_D / 2 + 1.3);
    g.add(walk);

    // casa del cliente, un po' indietro: davanti il giardino più grande, ma c'è spazio anche dietro e ai lati
    const path = HOUSE_MODELS[Math.floor(Math.random() * HOUSE_MODELS.length)];
    const size = new THREE.Box3().setFromObject(gltf(path).scene).getSize(new THREE.Vector3());
    const sc = HOUSE_W / size.x;
    const house = model(path, sc);
    const hz = O.z - 3.2;
    house.position.set(O.x, 0, hz);
    house.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.add(house);
    const hd = size.z * sc;
    this.house = { minX: O.x - HOUSE_W / 2, maxX: O.x + HOUSE_W / 2, minZ: hz - hd / 2, maxZ: hz + hd / 2 };
    this.blocks.push(this.house);
    this.door = new THREE.Vector3(O.x, 0, this.house.maxZ + 0.6);
    // vialetto dal cancello alla porta
    const pathMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, O.z + LOT_D / 2 - this.house.maxZ), new THREE.MeshLambertMaterial({ color: 0xd7c9a8 }));
    pathMesh.rotation.x = -Math.PI / 2;
    pathMesh.position.set(O.x, 0.012, (this.house.maxZ + O.z + LOT_D / 2) / 2);
    g.add(pathMesh);
    this.entry = new THREE.Vector3(O.x, 0, O.z + LOT_D / 2 - 1.2);

    // muretto sul confine (con il cancello davanti), pilastri agli angoli
    if (opts.fence !== false) this.buildFence();

    // vicinato fuori dal lotto: case e alberi, solo per l'atmosfera
    for (const sx of [-1, 1]) {
      const p2 = HOUSE_MODELS[Math.floor(Math.random() * HOUSE_MODELS.length)];
      const s2 = new THREE.Box3().setFromObject(gltf(p2).scene).getSize(new THREE.Vector3());
      const n = model(p2, 7 / s2.x);
      n.position.set(O.x + sx * (LOT_W / 2 + 7), 0, O.z - 2);
      g.add(n);
    }
    const trees = [[-1, -1], [1, -1], [-1, 0.2], [1, 0.3], [0, -1.15], [-0.4, -1.2], [0.5, -1.25]];
    for (const [tx, tz] of trees) {
      const t = model(TREE_MODELS[Math.floor(Math.random() * TREE_MODELS.length)], 3.2);
      t.position.set(O.x + tx * (LOT_W / 2 + 3 + Math.random() * 3), 0, O.z + tz * (LOT_D / 2 + 3 + Math.random() * 2));
      g.add(t);
    }
  }

  private buildFence() {
    const O = ARENA_ORIGIN;
    const hw = LOT_W / 2;
    const hd = LOT_D / 2;
    const gate = 1.2; // metà larghezza del cancello
    const add = (side: FenceSide, x: number, z: number, rot: number, len: number, inX: number, inZ: number) => {
      const { obj, body } = fenceSegment(len);
      obj.position.set(x, 0, z);
      obj.rotation.y = rot;
      this.group.add(obj);
      this.fence.push({ side, pos: new THREE.Vector3(x, 0, z), rot, len, inner: new THREE.Vector3(x + inX, 0, z + inZ), obj, body });
    };
    // tratti di circa 3 m: davanti (due parti, il cancello in mezzo), dietro e sui lati
    const split = (a: number, b: number, fn: (mid: number, len: number) => void) => {
      const n = Math.max(1, Math.round((b - a) / 3));
      const l = (b - a) / n;
      for (let i = 0; i < n; i++) fn(a + l * (i + 0.5), l - 0.06);
    };
    split(O.x - hw, O.x - gate, (m, l) => add('front', m, O.z + hd, 0, l, 0, -0.8));
    split(O.x + gate, O.x + hw, (m, l) => add('front', m, O.z + hd, 0, l, 0, -0.8));
    split(O.z - hd, O.z + hd, (m, l) => add('left', O.x - hw, m, Math.PI / 2, l, 0.8, 0));
    split(O.z - hd, O.z + hd, (m, l) => add('right', O.x + hw, m, Math.PI / 2, l, -0.8, 0));
    split(O.x - hw, O.x + hw, (m, l) => add('back', m, O.z - hd, 0, l, 0, 0.8));
    for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [-gate, hd], [gate, hd]]) {
      const p = fencePillar();
      p.position.set(O.x + x, 0, O.z + z);
      this.group.add(p);
    }
  }

  /** Il punto è libero (dentro il lotto, fuori dalla casa e dagli ostacoli, con un margine). */
  free(p: THREE.Vector3, pad = 0.6) {
    const b = this.bounds;
    if (p.x < b.minX + pad || p.x > b.maxX - pad || p.z < b.minZ + pad || p.z > b.maxZ - pad) return false;
    // il vialetto dal cancello alla porta resta libero
    if (Math.abs(p.x - this.door.x) < 1.3 && p.z > this.house.maxZ - 0.2) return false;
    return !this.blocks.some((k) => p.x > k.minX - pad && p.x < k.maxX + pad && p.z > k.minZ - pad && p.z < k.maxZ + pad);
  }

  /**
   * Punti casuali e ben distanziati nel giardino (davanti, dietro e ai lati della casa):
   * ogni partita il giardino è diverso.
   */
  scatter(n: number, minDist: number, pad = 0.9, avoid: THREE.Vector3[] = []) {
    const b = this.bounds;
    const out: THREE.Vector3[] = [];
    for (let k = 0; k < 600 && out.length < n; k++) {
      const p = new THREE.Vector3(b.minX + Math.random() * (b.maxX - b.minX), 0, b.minZ + Math.random() * (b.maxZ - b.minZ));
      if (!this.free(p, pad)) continue;
      if ([...out, ...avoid].some((q) => q.distanceTo(p) < minDist)) continue;
      out.push(p);
    }
    return out;
  }

  /** Spinge il personaggio fuori dalla casa e dentro il confine. */
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

  /** Per la camera in prima persona: dentro un muro della casa? */
  blocked(x: number, z: number) {
    return this.blocks.some((k) => x > k.minX - 0.15 && x < k.maxX + 0.15 && z > k.minZ - 0.15 && z < k.maxZ + 0.15);
  }
}
