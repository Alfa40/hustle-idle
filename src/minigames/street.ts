import * as THREE from 'three';
import { gltf, Instancer, placeMatrix } from '../assets';
import { BUILDING_MODELS, HOUSE_MODELS, TREE_MODELS, type Slot } from '../world/city';
import type { Box } from './arena';

/**
 * Scena separata delle consegne e dei giornali: una via del quartiere con le case una dopo l'altra
 * sui due lati, la cassetta della posta davanti a ogni casa e, all'inizio, il negozio dei pacchi
 * o l'edicola. Le case sono quelle vere attorno al posto dove si è accettato il lavoretto.
 * La via è lunga quanto serve per le consegne da fare (poche consegne = via corta).
 */
export const STREET_ORIGIN = new THREE.Vector3(0, 0, 3600);

/** metà larghezza della strada, marciapiede, fronte delle case (dal centro della strada) */
const ROAD = 3.5;
const WALK = 2.4;
const FRONT = ROAD + WALK + 3.2;
/** distanza tra una casa e l'altra */
const GAP = 10;

export interface StreetHouse {
  /** lato della via: -1 a nord (guarda +z), +1 a sud (guarda -z) */
  side: -1 | 1;
  x: number;
  /** cassetta della posta e punto davanti dove ci si ferma */
  box: THREE.Vector3;
  stand: THREE.Vector3;
  /** rotazione della cassetta (verso la strada) */
  rot: number;
  /** davanti alla porta di casa (dove si lasciano i pacchi) */
  door: THREE.Vector3;
}

export class Street {
  group = new THREE.Group();
  bounds: Box;
  blocks: Box[] = [];
  entry: THREE.Vector3;
  /** negozio dei pacchi / edicola: posizione, bancone (dove ci si ferma) e rotazione */
  shop: THREE.Vector3;
  counter: THREE.Vector3;
  houses: StreetHouse[] = [];

  /**
   * `stops`: quante consegne. `slot` e `placed`: per usare le case vere del quartiere.
   */
  constructor(stops: number, slot?: Slot, placed?: { path: string; m: THREE.Matrix4 }[]) {
    const S = STREET_ORIGIN;
    const g = this.group;
    // case per lato: abbastanza per le consegne, con un po' di scelta
    const perSide = Math.max(2, Math.ceil(stops / 2) + 1);
    const len = perSide * GAP;
    this.bounds = { minX: S.x - 15, maxX: S.x + len - 2, minZ: S.z - FRONT + 0.4, maxZ: S.z + FRONT - 0.4 };

    // prato, strada con la riga in mezzo, marciapiedi (la via continua oltre: la nebbia la sfuma)
    const plane = (w: number, d: number, color: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      g.add(m);
    };
    plane(900, 900, 0x6fae4f, S.x, -0.02, S.z);
    plane(900, ROAD * 2, 0x4e5566, S.x, 0.004, S.z);
    for (let x = -300; x < 300; x += 6) plane(3, 0.18, 0xe8e8e8, S.x + x, 0.008, S.z);
    for (const sd of [-1, 1]) plane(900, WALK, 0xb8bfd6, S.x, 0.01, S.z + sd * (ROAD + WALK / 2));

    // le case vere del quartiere attorno al lavoretto (le più vicine), altrimenti a caso
    const near = this.nearbyModels(slot, placed);
    const pickHouse = (i: number) => near.houses[i % Math.max(1, near.houses.length)] ?? HOUSE_MODELS[i % HOUSE_MODELS.length];
    const pickBig = (i: number) => near.big[i % Math.max(1, near.big.length)] ?? BUILDING_MODELS[(i * 7) % BUILDING_MODELS.length];
    const inst = new Instancer();
    let hi = 0;
    // case lungo la via: quelle del lavoro e, oltre, altre fino all'orizzonte
    for (let k = -4; k < perSide + 4; k++) {
      for (const side of [-1, 1] as const) {
        const x = S.x + k * GAP + (side > 0 ? GAP / 2 : 0);
        const path = pickHouse(hi++);
        const size = new THREE.Box3().setFromObject(gltf(path).scene).getSize(new THREE.Vector3());
        const sc = 7 / size.x;
        const d = size.z * sc;
        const zc = S.z + side * (FRONT + d / 2);
        inst.add(path, placeMatrix(x, zc, side < 0 ? 0 : Math.PI, sc));
        if (k >= 0 && k < perSide) {
          this.blocks.push({ minX: x - 3.5, maxX: x + 3.5, minZ: zc - d / 2, maxZ: zc + d / 2 });
          // cassetta della posta accanto al vialetto, sul bordo del giardino verso il marciapiede
          const bx = x + 1.9;
          const bz = S.z + side * (ROAD + WALK + 0.35);
          this.houses.push({
            side, x, box: new THREE.Vector3(bx, 0, bz), stand: new THREE.Vector3(bx, 0, S.z + side * (ROAD + WALK - 0.55)),
            rot: side < 0 ? 0 : Math.PI, door: new THREE.Vector3(x, 0, S.z + side * (FRONT - 0.7)),
          });
          // vialetto dal marciapiede alla porta
          const path = new THREE.Mesh(new THREE.PlaneGeometry(1.4, FRONT - ROAD - WALK), new THREE.MeshLambertMaterial({ color: 0xd7c9a8 }));
          path.rotation.x = -Math.PI / 2;
          path.position.set(x, 0.012, S.z + side * (ROAD + WALK + (FRONT - ROAD - WALK) / 2));
          g.add(path);
        }
        // alberi tra una casa e l'altra
        if (k % 2 === 0) inst.add(TREE_MODELS[(hi + k) & 1], placeMatrix(x + GAP / 2 - 0.5, S.z + side * (FRONT + 1), Math.random() * 6, 3.4));
        // dietro le case: palazzi e negozi del quartiere (lo skyline)
        if (k % 2 === 0) {
          const bp = pickBig(hi);
          const bs = new THREE.Box3().setFromObject(gltf(bp).scene).getSize(new THREE.Vector3());
          const bsc = 9 / Math.max(bs.x, bs.z);
          inst.add(bp, placeMatrix(x, S.z + side * (FRONT + 18), side < 0 ? 0 : Math.PI, bsc));
        }
      }
    }
    // lampioni lungo il marciapiede
    for (let x = -20; x < len + 30; x += 16) for (const sd of [-1, 1]) inst.add('roads/light-square.glb', placeMatrix(S.x + x + (sd > 0 ? 8 : 0), S.z + sd * (ROAD + 0.3), sd < 0 ? Math.PI : 0, 8));
    inst.build(g, { castShadow: true });

    // negozio dei pacchi / edicola all'inizio della via, sul marciapiede nord
    this.shop = new THREE.Vector3(S.x - 9, 0, S.z - (ROAD + WALK + 0.9));
    this.counter = new THREE.Vector3(S.x - 9, 0, S.z - (ROAD + 0.8));
    this.blocks.push({ minX: this.shop.x - 1.3, maxX: this.shop.x + 1.3, minZ: this.shop.z - 1.3, maxZ: this.shop.z + 0.6 });
    this.entry = new THREE.Vector3(S.x - 9, 0, S.z - 0.5);
  }

  /** Modelli delle case e degli altri edifici più vicini al posto del lavoretto, nella città vera. */
  private nearbyModels(slot?: Slot, placed?: { path: string; m: THREE.Matrix4 }[]) {
    const out = { houses: [] as string[], big: [] as string[] };
    if (!slot || !placed) return out;
    const items = placed
      .map((it) => ({ path: it.path, d: Math.hypot(it.m.elements[12] - slot.center.x, it.m.elements[14] - slot.center.z) }))
      .filter((it) => it.d < 120)
      .sort((a, b) => a.d - b.d);
    for (const it of items) {
      if (HOUSE_MODELS.includes(it.path)) out.houses.push(it.path);
      else if (BUILDING_MODELS.includes(it.path)) out.big.push(it.path);
    }
    return out;
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

/** Quante consegne secondo il livello: poche all'inizio (via corta), di più salendo. */
export function routeStops(level: number, mode: 'package' | 'flyer') {
  return mode === 'package' ? Math.min(6, 2 + Math.floor(level / 2)) : Math.min(10, 3 + Math.floor(level * 0.8));
}
