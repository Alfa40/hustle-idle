import * as THREE from 'three';
import { model } from '../assets';
import { JOB } from '../config/balance';
import type { Game } from '../game';
import type { JobOffer } from '../sim/state';
import { DIR_VEC, type Slot } from '../world/city';
import { arrow, bush, ring, trimmedBush } from '../world/props';
import { DishGame } from './dishes';

export interface JobRun {
  title: string;
  status: string;
  timeLeft: number;
  timeTotal: number;
  update(dt: number): void;
  onAction?(): void;
  dispose(): void;
}

export function starsFor(timeLeft: number, total: number) {
  const f = timeLeft / total;
  if (f >= JOB.STAR3) return 3;
  if (f >= JOB.STAR2) return 2;
  return 1;
}

abstract class BaseRun implements JobRun {
  title = '';
  status = '';
  timeLeft = 0;
  timeTotal = 0;
  protected objs: THREE.Object3D[] = [];
  constructor(protected game: Game, protected offer: JobOffer) {}

  protected add(o: THREE.Object3D) {
    this.game.scene.add(o);
    this.objs.push(o);
    return o;
  }

  protected tick(dt: number) {
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.game.finishJob(0);
      return false;
    }
    return true;
  }

  abstract update(dt: number): void;

  dispose() {
    for (const o of this.objs) this.game.scene.remove(o);
    this.objs = [];
  }
}

// ---------------- giardinaggio ----------------

interface Bush {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  cut: number;
  done: boolean;
}

export class GardenRun extends BaseRun {
  private bushes: Bush[] = [];
  private cutTime: number;

  constructor(game: Game, offer: JobOffer, slot: Slot) {
    super(game, offer);
    const lvl = offer.level;
    const n = Math.min(9, 3 + Math.floor(lvl / 2));
    this.cutTime = 1.1 / (1 + 0.04 * lvl);
    this.timeTotal = this.timeLeft = n * Math.max(3.6, 5.2 - lvl * 0.12) + 7;
    this.title = '🌿 Giardinaggio';
    const [dx, dz] = DIR_VEC[slot.dir];
    // cespugli nel cortile davanti e ai lati della casa
    const spots: THREE.Vector3[] = [];
    for (let i = 0; i < 40 && spots.length < n; i++) {
      const across = (Math.random() - 0.5) * 5;
      const depth = 0.9 + Math.random() * 1.7;
      const v = new THREE.Vector3(slot.center.x + dx * depth + dz * across, 0, slot.center.z + dz * depth + dx * across);
      if (spots.every((s) => s.distanceTo(v) > 1.25) && v.distanceTo(slot.pos) > 1) spots.push(v);
    }
    for (const pos of spots) {
      const obj = this.add(bush());
      obj.position.copy(pos);
      this.bushes.push({ obj, pos, cut: 0, done: false });
    }
  }

  update(dt: number) {
    if (!this.tick(dt)) return;
    const p = this.game.player.root.position;
    let near: Bush | null = null;
    let nd = 1.6;
    for (const b of this.bushes) {
      if (b.done) continue;
      const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z);
      if (d < nd) {
        nd = d;
        near = b;
      }
    }
    const left = this.bushes.filter((b) => !b.done).length;
    this.status = `Cespugli: ${this.bushes.length - left}/${this.bushes.length}`;
    if (!near) {
      this.game.prompt = null;
      return;
    }
    const input = this.game.input;
    if (input.actionHeld) {
      near.cut += dt / this.cutTime;
      this.game.player.faceTowards(near.pos.x, near.pos.z, dt);
      this.game.player.play('interact-right', 0.1, 1.6);
      near.obj.rotation.y += dt * 8;
      near.obj.scale.setScalar(1 - near.cut * 0.35);
      if (near.cut >= 1) {
        near.done = true;
        this.game.scene.remove(near.obj);
        const t = this.add(trimmedBush());
        t.position.copy(near.pos);
        this.game.player.play('idle');
        if (this.bushes.every((b) => b.done)) {
          this.game.finishJob(starsFor(this.timeLeft, this.timeTotal));
          return;
        }
      }
    } else if (this.game.player.currentName === 'interact-right') {
      this.game.player.play('idle');
    }
    this.game.prompt = { label: 'Tieni premuto', icon: '✂️', progress: near.cut };
  }
}

// ---------------- consegne ----------------

export class DeliveryRun extends BaseRun {
  private targets: Slot[] = [];
  private idx = 0;
  private marker: THREE.Object3D;
  private ringObj: THREE.Object3D;
  private guide: THREE.Object3D;
  private box: THREE.Object3D;

  constructor(game: Game, offer: JobOffer, slot: Slot) {
    super(game, offer);
    const n = Math.min(3, 1 + Math.floor(offer.level / 3));
    const houses = [...game.deliveryHouses];
    let from = slot.pos;
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const cands = houses.filter((h) => h.pos.distanceTo(from) > 22 && h.pos.distanceTo(from) < 60 && !this.targets.includes(h));
      const t = cands[Math.floor(Math.random() * cands.length)] ?? houses[0];
      dist += Math.abs(t.pos.x - from.x) + Math.abs(t.pos.z - from.z);
      this.targets.push(t);
      from = t.pos;
    }
    this.timeTotal = this.timeLeft = (dist / 5.2) * Math.max(1.35, 1.9 - offer.level * 0.04) + 5 * n;
    this.title = '📦 Consegna';
    this.box = model('furniture/cardboardBoxClosed.glb', 2.2);
    this.box.position.x = -0.23;
    game.player.hold(this.box);
    this.marker = this.add(arrow());
    this.ringObj = this.add(ring(0xffcc1a, 1.4));
    this.guide = this.add(arrow(0xffffff));
    this.guide.scale.set(0.6, 0.6, 0.6);
    this.placeMarker();
  }

  private get target() {
    return this.targets[this.idx];
  }

  private placeMarker() {
    const t = this.target;
    this.ringObj.position.set(t.pos.x, 0.05, t.pos.z);
    this.marker.position.set(t.pos.x, 3, t.pos.z);
  }

  update(dt: number) {
    if (!this.tick(dt)) return;
    const t = this.target;
    const p = this.game.player.root.position;
    this.marker.position.y = 3 + Math.sin(performance.now() / 250) * 0.3;
    this.marker.rotation.y += dt * 2;
    // freccia guida attorno al giocatore
    const ang = Math.atan2(t.pos.x - p.x, t.pos.z - p.z);
    this.guide.position.set(p.x + Math.sin(ang) * 1.6, 0.4, p.z + Math.cos(ang) * 1.6);
    // il cono punta verso -Y: con ordine YXZ, -90° su X lo porta verso +Z, poi Y lo gira
    this.guide.rotation.order = 'YXZ';
    this.guide.rotation.set(-Math.PI / 2, ang, 0);
    const d = Math.hypot(t.pos.x - p.x, t.pos.z - p.z);
    this.guide.visible = d > 4;
    this.status = `Pacchi: ${this.idx}/${this.targets.length} · ${Math.round(d)} m`;
    this.game.prompt = d < 1.8 ? { label: 'Consegna', icon: '📦' } : null;
  }

  onAction() {
    const t = this.target;
    const p = this.game.player.root.position;
    if (Math.hypot(t.pos.x - p.x, t.pos.z - p.z) > 1.8) return;
    this.idx++;
    this.game.player.once('interact-right');
    if (this.idx >= this.targets.length) {
      this.game.finishJob(starsFor(this.timeLeft, this.timeTotal));
      return;
    }
    this.placeMarker();
  }

  dispose() {
    super.dispose();
    this.game.player.hold();
  }
}

// ---------------- lavapiatti ----------------

export class DishRun extends BaseRun {
  private dish: DishGame;

  constructor(game: Game, offer: JobOffer) {
    super(game, offer);
    const plates = Math.min(8, 3 + Math.floor(offer.level / 2));
    const spots = Math.min(9, 4 + Math.floor(offer.level / 3));
    this.timeTotal = this.timeLeft = plates * Math.max(3.4, 4.8 - offer.level * 0.1) + 3;
    this.title = '🍽️ Lavapiatti';
    this.dish = new DishGame(plates, spots, () => this.game.finishJob(starsFor(this.timeLeft, this.timeTotal)));
    game.input.enabled = false;
  }

  update(dt: number) {
    if (!this.tick(dt)) return;
    this.status = `Piatti: ${this.dish.done}/${this.dish.total}`;
    this.game.prompt = null;
  }

  dispose() {
    super.dispose();
    this.dish.destroy();
    this.game.input.enabled = true;
  }
}
