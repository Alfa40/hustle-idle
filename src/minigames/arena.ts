import * as THREE from 'three';
import { gltf, Instancer, model } from '../assets';
import { TILE } from '../config/map';
import { DIR_ROT, DIR_VEC, HOUSE_MODELS, TREE_MODELS, type Slot } from '../world/city';
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

/**
 * Grandezza del lotto secondo la difficoltà: piccolo all'inizio (poche cose da fare, ci si sposta poco),
 * più grande salendo di livello insieme alla quantità di lavoro. Liv. 1: 16×13,5 m (meno di metà del
 * lotto grande), Liv. 6: 23×19,5 m, massimo 28×24 m.
 */
export function lotSize(level: number) {
  const k = Math.max(0, level - 1);
  return { w: Math.min(28, 16 + 1.4 * k), d: Math.min(24, 13.5 + 1.2 * k) };
}

export type FenceSide = 'front' | 'left' | 'right' | 'back';

export interface ArenaOpts {
  /** tratti del muretto lungo il confine, uno per lato (davanti diviso dal cancello) */
  fence?: boolean;
  /** difficoltà del lavoretto: decide la grandezza del lotto (vedi lotSize) */
  level?: number;
  /** grandezza del lotto decisa dal lavoretto (es. quante auto da lavare), al posto di lotSize */
  size?: { w: number; d: number };
  /** casa della città dove si è accettato il lavoretto, e tutto ciò che la città ha piazzato:
   *  fuori dal lotto si ricostruisce il quartiere vero (stessa casa, stesse vie e palazzi) */
  slot?: Slot;
  placed?: { path: string; m: THREE.Matrix4 }[];
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
    const { w: LOT_W, d: LOT_D } = opts.size ?? lotSize(opts.level ?? 1);
    this.lotW = LOT_W;
    this.lotD = LOT_D;
    // la casa in proporzione al lotto: resta giardino davanti, dietro e ai lati
    const HOUSE_W = Math.min(8, LOT_W * 0.38);
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
    const real = !!(opts.slot && opts.placed);
    // strada e marciapiede davanti al lotto (solo se non c'è il quartiere vero)
    const road = new THREE.Mesh(new THREE.PlaneGeometry(900, 8), new THREE.MeshLambertMaterial({ color: 0x4e5566 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(O.x, 0.005, O.z + LOT_D / 2 + 6.5);
    if (!real) g.add(road);
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(900, 2.4), new THREE.MeshLambertMaterial({ color: 0xb8bfd6 }));
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(O.x, 0.01, O.z + LOT_D / 2 + 1.3);
    if (!real) g.add(walk);

    // casa del cliente, un po' indietro: davanti il giardino più grande, ma c'è spazio anche dietro e ai lati
    const path = opts.slot?.house ?? HOUSE_MODELS[Math.floor(Math.random() * HOUSE_MODELS.length)];
    const size = new THREE.Box3().setFromObject(gltf(path).scene).getSize(new THREE.Vector3());
    const sc = HOUSE_W / size.x;
    const house = model(path, sc);
    const hz = O.z - LOT_D * 0.15;
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

    if (real) {
      this.buildNeighborhood(opts.slot!, opts.placed!);
      return;
    }
    // senza la città: un vicinato generico (case e alberi)
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

  private lotW = 0;
  private lotD = 0;

  /**
   * Il quartiere vero attorno alla casa del lavoretto: ogni casa, palazzo, albero, strada e lampione
   * della città entro 90 m, girato in modo che la casa guardi il cancello. Il lotto del minigioco è più
   * grande della tessera vera, quindi tutto ciò che sta attorno si allontana quanto serve e le strade
   * e i marciapiedi accanto al lotto si allungano: nessun buco e niente che entra nel giardino.
   */
  private buildNeighborhood(slot: Slot, placed: { path: string; m: THREE.Matrix4 }[]) {
    const O = ARENA_ORIGIN;
    const T = TILE;
    const [dx, dz] = DIR_VEC[slot.dir];
    const c = slot.center;
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -DIR_ROT[slot.dir]);
    // dentro la tessera si allarga, fuori si sposta: continuo e senza buchi
    const stretch = (u: number, half: number, nh: number) => (Math.abs(u) <= half ? (u * nh) / half : u + Math.sign(u) * (nh - half));
    const inst = new Instancer();
    const flat = new Instancer();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (const it of placed) {
      const ox = it.m.elements[12] - c.x;
      const oz = it.m.elements[14] - c.z;
      // coordinate rispetto alla casa: f verso la strada, r di lato
      const f = ox * dx + oz * dz;
      const r = ox * dz - oz * dx;
      if (Math.hypot(f, r) > 90) continue;
      // la tessera del lotto (casa vera, pavimento): nel minigioco c'è già il giardino
      if (Math.abs(r) < T / 2 - 0.01 && Math.abs(f) < T / 2 - 0.01) continue;
      it.m.decompose(p, q, s);
      const rq = turn.clone().multiply(q);
      const at = new THREE.Vector3(O.x + stretch(r, T / 2, this.lotW / 2), p.y, O.z + stretch(f, T / 2, this.lotD / 2));
      const isFlat = it.path.startsWith('roads/') && !it.path.includes('light');
      if (!isFlat) {
        // un lampione davanti al cancello si sposta di lato (non copre l'ingresso né la vista)
        if (it.path.includes('light') && Math.abs(at.x - O.x) < 2.5 && at.z > O.z) at.x = O.x + (at.x >= O.x ? 3 : -3);
        inst.add(it.path, new THREE.Matrix4().compose(at, rq, s));
        continue;
      }
      // strade e marciapiedi nella fascia del lotto si allungano fino a toccare quelli vicini
      const sx = Math.abs(r) <= T / 2 ? this.lotW / T : 1;
      const sz = Math.abs(f) <= T / 2 ? this.lotD / T : 1;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(), rq, s);
      m.premultiply(new THREE.Matrix4().makeScale(sx, 1, sz));
      m.setPosition(at);
      flat.add(it.path, m);
    }
    inst.build(this.group, { castShadow: true });
    flat.build(this.group);
  }

  private buildFence() {
    const O = ARENA_ORIGIN;
    const hw = this.lotW / 2;
    const hd = this.lotD / 2;
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
