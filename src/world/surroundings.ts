import * as THREE from 'three';
import { Instancer } from '../assets';
import { TILE } from '../config/map';
import { DIR_ROT, DIR_VEC, type Slot } from './city';

export interface SurroundingsOpts {
  /** fin dove arriva il quartiere (m dalla tessera vera) */
  radius?: number;
  /** per spostare o togliere un oggetto (posizione già nella scena); `false` = non metterlo */
  adjust?: (path: string, at: THREE.Vector3) => boolean | void;
}

/**
 * Il quartiere vero attorno a una tessera della città (casa di un lavoretto, lotto di un'attività),
 * ricostruito in una scena separata attorno a un rettangolo `w`×`d` centrato in `origin`: ogni casa,
 * palazzo, albero, strada e lampione entro `radius` m, girato in modo che il lato strada della tessera
 * guardi verso +z. La tessera vera si allarga fino al rettangolo e tutto ciò che sta attorno si sposta
 * quanto serve; strade e marciapiedi accanto si allungano: nessun buco e niente dentro il rettangolo.
 */
export function buildSurroundings(
  group: THREE.Object3D,
  slot: Slot,
  placed: { path: string; m: THREE.Matrix4 }[],
  origin: THREE.Vector3,
  w: number,
  d: number,
  opts: SurroundingsOpts = {},
) {
  const T = TILE;
  const radius = opts.radius ?? 90;
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
    // coordinate rispetto alla tessera: f verso la strada, r di lato
    const f = ox * dx + oz * dz;
    const r = ox * dz - oz * dx;
    if (Math.hypot(f, r) > radius) continue;
    // la tessera stessa (casa, furgone, negozio, pavimento): nella scena separata c'è già
    if (Math.abs(r) < T / 2 - 0.01 && Math.abs(f) < T / 2 - 0.01) continue;
    it.m.decompose(p, q, s);
    const rq = turn.clone().multiply(q);
    const at = new THREE.Vector3(origin.x + stretch(r, T / 2, w / 2), p.y, origin.z + stretch(f, T / 2, d / 2));
    if (opts.adjust?.(it.path, at) === false) continue;
    const isFlat = it.path.startsWith('roads/') && !it.path.includes('light');
    if (!isFlat) {
      inst.add(it.path, new THREE.Matrix4().compose(at, rq, s));
      continue;
    }
    // strade e marciapiedi nella fascia della tessera si allungano fino a toccare quelli vicini
    const sx = Math.abs(r) <= T / 2 ? w / T : 1;
    const sz = Math.abs(f) <= T / 2 ? d / T : 1;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(), rq, s);
    m.premultiply(new THREE.Matrix4().makeScale(sx, 1, sz));
    m.setPosition(at);
    flat.add(it.path, m);
  }
  inst.build(group, { castShadow: true });
  flat.build(group);
}
