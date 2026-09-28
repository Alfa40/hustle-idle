import * as THREE from 'three';
import { gltf, Instancer, placeMatrix } from '../assets';
import { CITY_MAP, LOTS, TILE, zoneAt, type ZoneId } from '../config/map';

export type Dir = 'N' | 'E' | 'S' | 'W';
export const DIR_VEC: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
/** rotazione Y che porta il fronte dei modelli Kenney (+Z) verso la direzione */
export const DIR_ROT: Record<Dir, number> = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 };

export interface Box {
  minX: number; maxX: number; minZ: number; maxZ: number;
}

export interface Slot {
  /** punto dove sta l'NPC / la porta, lato strada */
  pos: THREE.Vector3;
  dir: Dir;
  center: THREE.Vector3;
  zone: ZoneId;
}

export interface LotSlot extends Slot {
  id: string;
}

const ROAD_PIECES: { path: string; conn: Dir[] }[] = [
  { path: 'roads/road-crossroad.glb', conn: ['N', 'E', 'S', 'W'] },
  { path: 'roads/road-intersection.glb', conn: ['W', 'E', 'S'] },
  { path: 'roads/road-straight.glb', conn: ['E', 'W'] },
  { path: 'roads/road-bend.glb', conn: ['W', 'S'] },
  { path: 'roads/road-end.glb', conn: ['E'] },
];
/** un passo di rotazione di +90° gira E→N, N→W, W→S, S→E */
const ROT_STEP: Record<Dir, Dir> = { E: 'N', N: 'W', W: 'S', S: 'E' };

const HOUSES = ['a', 'b', 'c', 'd', 'g', 'h', 'k', 'm', 'o', 'r'].map((k) => `suburban/building-type-${k}.glb`);
const SHOPS = ['a', 'b', 'c', 'd', 'f', 'g', 'h'].map((k) => `commercial/building-${k}.glb`);
const TALL = ['commercial/building-l.glb', 'commercial/building-skyscraper-a.glb', 'commercial/building-skyscraper-b.glb'];
const TREES = ['suburban/tree-large.glb', 'suburban/tree-small.glb'];

export const CITY_ASSETS = [
  ...ROAD_PIECES.map((p) => p.path), 'roads/tile-low.glb', 'roads/light-square.glb',
  ...HOUSES, ...SHOPS, ...TALL, ...TREES,
  'commercial/detail-awning-wide.glb', 'commercial/detail-parasol-a.glb', 'suburban/planter.glb',
];

// piccolo generatore deterministico: la città è sempre uguale
let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rpick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];

export class City {
  group = new THREE.Group();
  colliders: Box[] = [];
  gardens: Slot[] = [];
  shops: Slot[] = [];
  restaurants: Slot[] = [];
  homes: Slot[] = [];
  lots: LotSlot[] = [];
  board!: Slot;
  roadTiles: THREE.Vector3[] = [];
  readonly cols = CITY_MAP[0].length;
  readonly rows = CITY_MAP.length;
  readonly halfW = (this.cols * TILE) / 2;
  readonly halfH = (this.rows * TILE) / 2;

  constructor() {
    seed = 12345;
    this.build();
  }

  at(c: number, r: number) {
    return CITY_MAP[r]?.[c] ?? ' ';
  }

  center(c: number, r: number) {
    return new THREE.Vector3((c - (this.cols - 1) / 2) * TILE, 0, (r - (this.rows - 1) / 2) * TILE);
  }

  private roadDir(c: number, r: number): Dir {
    for (const d of ['S', 'N', 'E', 'W'] as Dir[]) {
      const [dx, dz] = DIR_VEC[d];
      if (this.at(c + dx, r + dz) === '#') return d;
    }
    return 'S';
  }

  private build() {
    const inst = new Instancer();
    const shadowInst = new Instancer();

    // prato sotto tutto
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.cols * TILE + 80, this.rows * TILE + 80),
      new THREE.MeshLambertMaterial({ color: 0x86c06c }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.group.add(ground);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = this.at(c, r);
        const p = this.center(c, r);
        const zone = zoneAt(c, r);
        if (ch === '#') {
          this.placeRoad(inst, c, r, p);
          continue;
        }
        const dir = this.roadDir(c, r);
        const [dx, dz] = DIR_VEC[dir];
        const rot = DIR_ROT[dir];
        const paved = 'pMbBR123'.includes(ch) || (ch === '.' && zone === 'centro');
        if (paved) inst.add('roads/tile-low.glb', placeMatrix(p.x, p.z, 0, TILE, 0.001));

        const front = (d: number) => new THREE.Vector3(p.x + dx * d, 0, p.z + dz * d);
        switch (ch) {
          case 'h':
          case 'H': {
            const path = rpick(HOUSES);
            const w = this.modelSize(path).x;
            const sc = Math.min(3.6, 5.2 / w);
            this.placeBuilding(shadowInst, path, front(-0.7), rot, sc);
            const slot = { pos: front(2.1), dir, center: p.clone(), zone };
            if (ch === 'H') this.homes.push(slot);
            else this.gardens.push(slot);
            break;
          }
          case 'b':
          case 'R': {
            const path = rpick(SHOPS);
            this.placeBuilding(shadowInst, path, front(-0.35), rot, 5.2);
            const slot = { pos: front(2.6), dir, center: p.clone(), zone };
            if (ch === 'R') {
              this.restaurants.push(slot);
              inst.add('commercial/detail-parasol-a.glb', placeMatrix(front(2.2).x + dz * 1.6, front(2.2).z - dx * 1.6, rot, 5));
              inst.add('commercial/detail-parasol-a.glb', placeMatrix(front(2.2).x - dz * 1.6, front(2.2).z + dx * 1.6, rot, 5));
            } else this.shops.push(slot);
            break;
          }
          case 'B': {
            this.placeBuilding(shadowInst, rpick(TALL), front(-0.2), rot, 4.1);
            break;
          }
          case 't': {
            const n = 2 + Math.floor(rnd() * 3);
            for (let i = 0; i < n; i++) {
              const x = p.x + (rnd() - 0.5) * TILE * 0.75;
              const z = p.z + (rnd() - 0.5) * TILE * 0.75;
              const s = 5 + rnd() * 2.5;
              shadowInst.add(rpick(TREES), placeMatrix(x, z, rnd() * 6.28, s));
              this.colliders.push({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35 });
            }
            break;
          }
          case 'M': {
            this.board = { pos: p.clone(), dir, center: p.clone(), zone };
            break;
          }
          case 'p': {
            if (rnd() < 0.5) inst.add('suburban/planter.glb', placeMatrix(p.x - dx * 2.2, p.z - dz * 2.2, rot, 4));
            break;
          }
          default: {
            const lot = LOTS.find((l) => l.char === ch);
            if (lot) this.lots.push({ id: lot.id, pos: front(1.2), dir, center: p.clone(), zone });
          }
        }
      }
    }
    inst.build(this.group);
    shadowInst.build(this.group, { castShadow: true });
  }

  private sizes = new Map<string, THREE.Vector3>();
  private modelSize(path: string) {
    let s = this.sizes.get(path);
    if (!s) {
      s = new THREE.Box3().setFromObject(gltf(path).scene).getSize(new THREE.Vector3());
      this.sizes.set(path, s);
    }
    return s;
  }

  private placeBuilding(inst: Instancer, path: string, pos: THREE.Vector3, rot: number, scale: number) {
    inst.add(path, placeMatrix(pos.x, pos.z, rot, scale));
    const box = new THREE.Box3().setFromObject(gltf(path).scene);
    const m = placeMatrix(pos.x, pos.z, rot, scale);
    box.applyMatrix4(m);
    const pad = 0.1;
    this.colliders.push({ minX: box.min.x + pad, maxX: box.max.x - pad, minZ: box.min.z + pad, maxZ: box.max.z - pad });
  }

  private placeRoad(inst: Instancer, c: number, r: number, p: THREE.Vector3) {
    this.roadTiles.push(p.clone());
    const want = (['N', 'E', 'S', 'W'] as Dir[]).filter((d) => {
      const [dx, dz] = DIR_VEC[d];
      const n = this.at(c + dx, r + dz);
      // i bordi della mappa contano come strada che continua
      return n === '#' || n === ' ';
    });
    const key = (a: Dir[]) => [...a].sort().join('');
    for (const piece of ROAD_PIECES) {
      let conn = piece.conn;
      for (let k = 0; k < 4; k++) {
        if (key(conn) === key(want)) {
          inst.add(piece.path, placeMatrix(p.x, p.z, (k * Math.PI) / 2, TILE));
          if (piece.path.endsWith('straight.glb') && (c + r) % 2 === 0) this.placeLamp(inst, p, k);
          return;
        }
        conn = conn.map((d) => ROT_STEP[d]);
      }
    }
    inst.add('roads/road-crossroad.glb', placeMatrix(p.x, p.z, 0, TILE));
  }

  private placeLamp(inst: Instancer, p: THREE.Vector3, k: number) {
    // strada lungo X se k pari: lampione sul marciapiede sud, braccio verso la strada
    const off = TILE * 0.43;
    if (k % 2 === 0) inst.add('roads/light-square.glb', placeMatrix(p.x, p.z + off, 0, TILE));
    else inst.add('roads/light-square.glb', placeMatrix(p.x + off, p.z, -Math.PI / 2, TILE));
  }

  /** Spinge un cerchio fuori dagli ostacoli. */
  collide(pos: THREE.Vector3, radius: number) {
    for (const b of this.colliders) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // centro dentro il box: esci dal lato più vicino
        const left = pos.x - b.minX, right = b.maxX - pos.x, top = pos.z - b.minZ, bottom = b.maxZ - pos.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = b.minX - radius;
        else if (m === right) pos.x = b.maxX + radius;
        else if (m === top) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      }
    }
    pos.x = Math.max(-this.halfW, Math.min(this.halfW, pos.x));
    pos.z = Math.max(-this.halfH, Math.min(this.halfH, pos.z));
  }
}
