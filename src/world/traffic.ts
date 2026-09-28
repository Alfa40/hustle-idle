import * as THREE from 'three';
import { model } from '../assets';
import { Character } from './character';
import type { City } from './city';

const CAR_MODELS = ['cars/sedan.glb', 'cars/hatchback-sports.glb', 'cars/suv-luxury.glb', 'cars/van.glb', 'cars/delivery.glb'];
export const TRAFFIC_ASSETS = CAR_MODELS;

/** Distanza dal centro strada della corsia di destra e del marciapiede. */
const LANE = 1.25;
const WALK = 2.65;
const STEP = 4; // gli incroci sono ogni 4 tessere

interface Car {
  obj: THREE.Object3D;
  from: [number, number];
  to: [number, number];
  t: number;
  speed: number;
  yaw: number;
  lights: THREE.Mesh;
}

interface Walker {
  char: Character;
  /** angoli del giro attorno all'isolato */
  path: THREE.Vector3[];
  seg: number;
  t: number;
  speed: number;
}

/** Auto che girano per le strade tenendo la destra e pedoni sui marciapiedi. */
export class Traffic {
  group = new THREE.Group();
  private cars: Car[] = [];
  private walkers: Walker[] = [];
  private n: number;
  private lightsMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0 });

  constructor(private city: City, carCount: number, walkerCount: number, charModels: string[]) {
    this.n = Math.floor((city.cols - 1) / STEP); // incroci per lato - 1
    for (let i = 0; i < carCount; i++) this.addCar(i);
    for (let i = 0; i < walkerCount; i++) this.addWalker(charModels[i % charModels.length]);
  }

  private node(i: number, j: number) {
    return this.city.center(j * STEP, i * STEP);
  }

  private neighbors([i, j]: [number, number]): [number, number][] {
    const out: [number, number][] = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (a >= 0 && a <= this.n && b >= 0 && b <= this.n) out.push([a, b]);
    }
    return out;
  }

  private addCar(k: number) {
    const path = CAR_MODELS[k % CAR_MODELS.length];
    const obj = model(path, 1.35);
    const lights = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.35), this.lightsMat);
    lights.position.set(0, 0.75, 2.05);
    obj.add(lights);
    const from: [number, number] = [Math.floor(Math.random() * (this.n + 1)), Math.floor(Math.random() * (this.n + 1))];
    const nb = this.neighbors(from);
    const car: Car = { obj, from, to: nb[Math.floor(Math.random() * nb.length)], t: Math.random(), speed: 6 + Math.random() * 2.5, yaw: 0, lights };
    this.group.add(obj);
    this.cars.push(car);
  }

  private addWalker(modelName: string) {
    // giro attorno a un isolato a caso, sul marciapiede
    const bi = Math.floor(Math.random() * this.n);
    const bj = Math.floor(Math.random() * this.n);
    const a = this.node(bi, bj);
    const b = this.node(bi + 1, bj + 1);
    const x0 = a.x + WALK;
    const x1 = b.x - WALK;
    const z0 = a.z + WALK;
    const z1 = b.z - WALK;
    let path = [new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 0, z0), new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x0, 0, z1)];
    if (Math.random() < 0.5) path = path.reverse();
    const char = new Character(modelName);
    char.play('walk', 0, 0.9);
    this.group.add(char.root);
    this.walkers.push({ char, path, seg: Math.floor(Math.random() * 4), t: Math.random(), speed: 1.1 + Math.random() * 0.5 });
  }

  /** Posizione in corsia: centro strada + spostamento a destra della direzione. */
  private lanePos(c: Car, out: THREE.Vector3) {
    const a = this.node(...c.from);
    const b = this.node(...c.to);
    const dx = Math.sign(b.x - a.x);
    const dz = Math.sign(b.z - a.z);
    out.copy(a).lerp(b, c.t);
    out.x += -dz * LANE;
    out.z += dx * LANE;
    return { dx, dz };
  }

  update(dt: number, player: THREE.Vector3, night: number) {
    this.lightsMat.opacity = night;
    const tmp = new THREE.Vector3();
    for (const c of this.cars) {
      const { dx, dz } = this.lanePos(c, tmp);
      // si ferma se davanti c'è il giocatore o un'altra auto nella stessa corsia
      let blocked = false;
      const ahead = (p: THREE.Vector3) => {
        const rx = p.x - tmp.x;
        const rz = p.z - tmp.z;
        const along = rx * dx + rz * dz;
        const side = Math.abs(rx * -dz + rz * dx);
        return along > 0 && along < 5 && side < 1.4;
      };
      if (ahead(player)) blocked = true;
      else {
        for (const o of this.cars) {
          if (o === c) continue;
          if (ahead(o.obj.position)) {
            blocked = true;
            break;
          }
        }
      }
      if (!blocked) {
        const len = this.node(...c.from).distanceTo(this.node(...c.to));
        c.t += (c.speed * dt) / len;
      }
      if (c.t >= 1) {
        // incrocio: prosegue o gira, di rado torna indietro
        const opts = this.neighbors(c.to).filter((nb) => nb[0] !== c.from[0] || nb[1] !== c.from[1]);
        c.from = c.to;
        c.to = opts.length ? opts[Math.floor(Math.random() * opts.length)] : this.neighbors(c.to)[0];
        c.t = 0;
      }
      const d = this.lanePos(c, tmp);
      c.obj.position.copy(tmp);
      const want = Math.atan2(d.dx, d.dz);
      let diff = want - c.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      c.yaw += diff * Math.min(1, dt * 8);
      c.obj.rotation.y = c.yaw;
    }
    for (const w of this.walkers) {
      const a = w.path[w.seg];
      const b = w.path[(w.seg + 1) % 4];
      w.t += (w.speed * dt) / a.distanceTo(b);
      if (w.t >= 1) {
        w.t = 0;
        w.seg = (w.seg + 1) % 4;
      }
      const p = w.char.root.position.copy(a).lerp(b, w.t);
      w.char.root.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      // animazioni solo per i pedoni vicini (risparmio sul telefono)
      if (Math.abs(p.x - player.x) < 45 && Math.abs(p.z - player.z) < 45) w.char.update(dt);
    }
  }

  /** Il giocatore non attraversa le auto. */
  pushOut(pos: THREE.Vector3, radius: number) {
    for (const c of this.cars) {
      const p = c.obj.position;
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const d = Math.hypot(dx, dz);
      const min = radius + 1.1;
      if (d < min && d > 1e-4) {
        pos.x = p.x + (dx / d) * min;
        pos.z = p.z + (dz / d) * min;
      }
    }
  }
}
