import * as THREE from 'three';
import { gltf, Instancer, placeMatrix, setInstanceVisible, type InstanceHandle } from '../assets';
import { CITY_MAP, LOTS, TILE, WS, zoneAt, type ZoneId } from '../config/map';

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
  kind: 'truck' | 'shop';
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

export const TREE_MODELS = TREES;
export const BUILDING_MODELS = [...HOUSES, ...SHOPS, ...TALL];

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
  dealer!: Slot;
  agency!: Slot;
  roadTiles: THREE.Vector3[] = [];
  /** edifici e alberi: si nascondono quando coprono una zona di lavoro */
  private tall: InstanceHandle[] = [];
  /** posizione delle lampade dei lampioni (per le luci notturne) */
  lampHeads: THREE.Vector3[] = [];
  private hidden: InstanceHandle[] = [];
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

  /** Tessera in cui sta un punto. */
  tileOf(p: THREE.Vector3) {
    return { c: Math.round(p.x / TILE + (this.cols - 1) / 2), r: Math.round(p.z / TILE + (this.rows - 1) / 2) };
  }

  isRoad(c: number, r: number) {
    return this.at(c, r) === '#';
  }

  private routeKey = '';
  private routeTiles: { c: number; r: number }[] | null = null;

  /**
   * Strada più breve (sulle tessere di strada) dal giocatore all'obiettivo, come punti da unire:
   * parte dal giocatore, segue il centro delle strade girando agli incroci e finisce sull'obiettivo.
   * null se il giocatore non è su una strada (allora resta solo la freccia).
   */
  route(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    const a = this.tileOf(from);
    if (!this.isRoad(a.c, a.r)) return null;
    // tessera di strada più vicina all'obiettivo
    const g = this.tileOf(to);
    let best: { c: number; r: number } | null = null;
    let bd = Infinity;
    for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) {
      const c = g.c + dc;
      const r = g.r + dr;
      if (!this.isRoad(c, r)) continue;
      const d = this.center(c, r).distanceToSquared(to);
      if (d < bd) {
        bd = d;
        best = { c, r };
      }
    }
    if (!best) return null;
    const key = `${a.c},${a.r}>${best.c},${best.r}`;
    if (key !== this.routeKey) {
      this.routeKey = key;
      this.routeTiles = this.bfs(a, best);
    }
    const tiles = this.routeTiles;
    if (!tiles) return null;
    // stessa tessera: basta un tratto dritto
    if (tiles.length === 1) return [from.clone(), to.clone()];
    const pts = tiles.map((t) => this.center(t.c, t.r));
    // primo e ultimo tratto: si resta sull'asse della strada (niente andata e ritorno al centro della tessera)
    if (pts.length >= 2) {
      const [p0, p1] = pts;
      if (p0.x === p1.x) p0.z = from.z;
      else p0.x = from.x;
      const q0 = pts[pts.length - 1];
      const q1 = pts[pts.length - 2];
      if (q0.x === q1.x) q0.z = THREE.MathUtils.clamp(to.z, Math.min(q0.z, q1.z) - TILE / 2, Math.max(q0.z, q1.z) + TILE / 2);
      else q0.x = THREE.MathUtils.clamp(to.x, Math.min(q0.x, q1.x) - TILE / 2, Math.max(q0.x, q1.x) + TILE / 2);
    }
    // solo gli angoli (i punti in linea retta si tolgono)
    const out = [from.clone()];
    for (let i = 0; i < pts.length; i++) {
      const prev = i ? pts[i - 1] : from;
      const next = pts[i + 1] ?? to;
      const straight = (Math.abs(prev.x - pts[i].x) < 0.01 && Math.abs(next.x - pts[i].x) < 0.01) || (Math.abs(prev.z - pts[i].z) < 0.01 && Math.abs(next.z - pts[i].z) < 0.01);
      if (!straight) out.push(pts[i]);
    }
    out.push(to.clone());
    return out;
  }

  /** Ricerca in ampiezza sulle tessere di strada (4 direzioni): il percorso con meno tessere. */
  private bfs(a: { c: number; r: number }, b: { c: number; r: number }) {
    const W = this.cols;
    const prev = new Int32Array(W * this.rows).fill(-2);
    const start = a.r * W + a.c;
    const goal = b.r * W + b.c;
    prev[start] = -1;
    const q = [start];
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      if (cur === goal) break;
      const c = cur % W;
      const r = (cur - c) / W;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= W || nr >= this.rows || !this.isRoad(nc, nr)) continue;
        const n = nr * W + nc;
        if (prev[n] !== -2) continue;
        prev[n] = cur;
        q.push(n);
      }
    }
    if (prev[goal] === -2) return null;
    const path: { c: number; r: number }[] = [];
    for (let k = goal; k !== -1; k = prev[k]) path.push({ c: k % W, r: Math.floor(k / W) });
    return path.reverse();
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
    // il prato e il paesaggio attorno sono in world/scenery.ts

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
        const paved = 'pMbBRVA'.includes(ch) || LOTS.some((l) => l.char === ch) || (ch === '.' && zone === 'centro');
        if (paved) inst.add('roads/tile-low.glb', placeMatrix(p.x, p.z, 0, TILE, 0.001));

        // distanze dal centro della tessera, in scala con il mondo
        const front = (d: number) => new THREE.Vector3(p.x + dx * d * WS, 0, p.z + dz * d * WS);
        switch (ch) {
          case 'h':
          case 'H': {
            const path = rpick(HOUSES);
            const w = this.modelSize(path).x;
            const sc = Math.min(3.6, 5.2 / w) * WS;
            this.placeBuilding(shadowInst, path, front(-0.7), rot, sc);
            const slot = { pos: front(2.1), dir, center: p.clone(), zone };
            if (ch === 'H') this.homes.push(slot);
            else this.gardens.push(slot);
            break;
          }
          case 'b':
          case 'R': {
            const path = rpick(SHOPS);
            this.placeBuilding(shadowInst, path, front(-0.35), rot, 5.2 * WS);
            const slot = { pos: front(2.6), dir, center: p.clone(), zone };
            if (ch === 'R') {
              this.restaurants.push(slot);
              inst.add('commercial/detail-parasol-a.glb', placeMatrix(front(2.2).x + dz * 1.6 * WS, front(2.2).z - dx * 1.6 * WS, rot, 5 * WS));
              inst.add('commercial/detail-parasol-a.glb', placeMatrix(front(2.2).x - dz * 1.6 * WS, front(2.2).z + dx * 1.6 * WS, rot, 5 * WS));
            } else this.shops.push(slot);
            break;
          }
          case 'B': {
            this.placeBuilding(shadowInst, rpick(TALL), front(-0.2), rot, 4.1 * WS);
            break;
          }
          case 't': {
            const n = 2 + Math.floor(rnd() * 3);
            for (let i = 0; i < n; i++) {
              const x = p.x + (rnd() - 0.5) * TILE * 0.75;
              const z = p.z + (rnd() - 0.5) * TILE * 0.75;
              const s = (5 + rnd() * 2.5) * WS;
              this.tall.push(shadowInst.add(rpick(TREES), placeMatrix(x, z, rnd() * 6.28, s)));
              this.colliders.push({ minX: x - 0.35 * WS, maxX: x + 0.35 * WS, minZ: z - 0.35 * WS, maxZ: z + 0.35 * WS });
            }
            break;
          }
          case 'V':
          case 'A': {
            this.placeBuilding(shadowInst, ch === 'V' ? 'commercial/building-c.glb' : 'commercial/building-l.glb', front(-0.35), rot, (ch === 'V' ? 5.2 : 4.1) * WS);
            const slot = { pos: front(2.6), dir, center: p.clone(), zone };
            if (ch === 'V') this.dealer = slot;
            else this.agency = slot;
            break;
          }
          case 'M': {
            this.board = { pos: p.clone(), dir, center: p.clone(), zone };
            break;
          }
          case 'p': {
            if (rnd() < 0.5) inst.add('suburban/planter.glb', placeMatrix(p.x - dx * 2.2 * WS, p.z - dz * 2.2 * WS, rot, 4 * WS));
            break;
          }
          default: {
            const lot = LOTS.find((l) => l.char === ch);
            if (!lot) break;
            if (lot.kind === 'shop') {
              this.placeBuilding(shadowInst, rpick(SHOPS), front(-0.35), rot, 5.2 * WS);
              this.lots.push({ id: lot.id, kind: 'shop', pos: front(2.6), dir, center: p.clone(), zone });
            } else this.lots.push({ id: lot.id, kind: 'truck', pos: front(1.2), dir, center: p.clone(), zone });
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
    this.tall.push(inst.add(path, placeMatrix(pos.x, pos.z, rot, scale)));
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
    const base = k % 2 === 0 ? new THREE.Vector3(p.x, 0, p.z + off) : new THREE.Vector3(p.x + off, 0, p.z);
    inst.add('roads/light-square.glb', placeMatrix(base.x, base.z, k % 2 === 0 ? 0 : Math.PI / 2, TILE));
    // la lampada sta in cima, sporgente verso il centro della strada
    const toRoad = p.clone().sub(base).normalize();
    this.lampHeads.push(base.clone().addScaledVector(toRoad, 1.15).setY(3.35));
  }

  /**
   * Nasconde edifici e alberi fra la zona di lavoro e la camera (che guarda
   * verso nord): tutto ciò che sta a sud della zona e abbastanza vicino.
   * `keep` è il centro della tessera del lavoro, che resta visibile.
   */
  clearView(center: THREE.Vector3, halfW: number, keep?: THREE.Vector3) {
    this.restoreView();
    for (const h of this.tall) {
      if (keep && Math.hypot(h.x - keep.x, h.z - keep.z) < 2.5) continue;
      if (Math.abs(h.x - center.x) > halfW + 3) continue;
      const dz = h.z - center.z;
      if (dz < 0.5 || dz > 16) continue;
      setInstanceVisible(h, false);
      this.hidden.push(h);
    }
  }

  restoreView() {
    for (const h of this.hidden) setInstanceVisible(h, true);
    this.hidden = [];
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
