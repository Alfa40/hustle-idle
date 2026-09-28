import * as THREE from 'three';
import { model } from '../assets';
import { JOB } from '../config/balance';
import type { Game } from '../game';
import { DIR_VEC, type Slot } from '../world/city';
import { arrow, bush, ring, trimmedBush } from '../world/props';
import { DishGame, type DishTheme } from './dishes';

export interface JobRun {
  title: string;
  status: string;
  timeLeft: number;
  timeTotal: number;
  /** dove andare adesso (per freccette e mappa) */
  target?: THREE.Vector3;
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
  target?: THREE.Vector3;
  protected objs: THREE.Object3D[] = [];
  constructor(protected game: Game, protected level: number) {}

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

  protected done() {
    this.game.finishJob(starsFor(this.timeLeft, this.timeTotal));
  }

  abstract update(dt: number): void;

  dispose() {
    for (const o of this.objs) this.game.scene.remove(o);
    this.objs = [];
  }
}

// ---------------- taglia / strofina sul posto ----------------

interface Spot {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  cut: number;
  done: boolean;
}

export interface SpotOpts {
  kind: 'bush';
  title: string;
  /** moltiplicatore sul numero di punti */
  amount?: number;
}

/** Giardinaggio: avvicinati e tieni premuto su ogni cespuglio. */
export class SpotRun extends BaseRun {
  private spots: Spot[] = [];
  private cutTime: number;

  constructor(game: Game, level: number, slot: Slot, opts: SpotOpts) {
    super(game, level);
    const n = Math.round(Math.min(9, 3 + Math.floor(level / 2)) * (opts.amount ?? 1));
    this.cutTime = 1.1 / (1 + 0.04 * level);
    this.timeTotal = this.timeLeft = n * Math.max(3.6, 5.2 - level * 0.12) + 7;
    this.title = opts.title;
    const [dx, dz] = DIR_VEC[slot.dir];
    // punti nel cortile davanti e ai lati della casa
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 60 && pts.length < n; i++) {
      const across = (Math.random() - 0.5) * 5;
      const depth = 0.9 + Math.random() * 1.7;
      const v = new THREE.Vector3(slot.center.x + dx * depth + dz * across, 0, slot.center.z + dz * depth + dx * across);
      if (pts.every((s) => s.distanceTo(v) > 1.1) && v.distanceTo(slot.pos) > 0.8) pts.push(v);
    }
    for (const pos of pts) {
      const obj = this.add(bush());
      obj.position.copy(pos);
      this.spots.push({ obj, pos, cut: 0, done: false });
    }
  }

  update(dt: number) {
    if (!this.tick(dt)) return;
    const p = this.game.player.root.position;
    let near: Spot | null = null;
    let nd = 1.6;
    for (const b of this.spots) {
      if (b.done) continue;
      const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z);
      if (d < nd) {
        nd = d;
        near = b;
      }
    }
    const left = this.spots.filter((b) => !b.done).length;
    this.target = this.spots.find((b) => !b.done)?.pos;
    this.status = `Cespugli: ${this.spots.length - left}/${this.spots.length}`;
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
        if (this.spots.every((b) => b.done)) {
          this.done();
          return;
        }
      }
    } else if (this.game.player.currentName === 'interact-right') {
      this.game.player.play('idle');
    }
    this.game.prompt = { label: 'Tieni premuto', icon: '✂️', progress: near.cut };
  }
}

// ---------------- vai da A a B ----------------

export interface RouteOpts {
  mode: 'package' | 'flyer';
  title: string;
}

interface Stop {
  slot: Slot;
  act: 'drop' | 'flyer';
}

/** Consegne e volantinaggio: raggiungi le tappe segnate. */
export class RouteRun extends BaseRun {
  private stops: Stop[] = [];
  private idx = 0;
  private marker: THREE.Object3D;
  private ringObj: THREE.Object3D;
  private guide: THREE.Object3D;

  constructor(game: Game, level: number, start: Slot, private opts: RouteOpts) {
    super(game, level);
    const houses = [...game.deliveryHouses];
    const dist2 = (a: Slot, b: Slot) => Math.abs(a.pos.x - b.pos.x) + Math.abs(a.pos.z - b.pos.z);
    let dist = 0;
    if (opts.mode === 'package') {
      const n = Math.min(3, 1 + Math.floor(level / 3));
      let from = start;
      for (let i = 0; i < n; i++) {
        const cands = houses.filter((h) => h.pos.distanceTo(from.pos) > 22 && h.pos.distanceTo(from.pos) < 60 && !this.stops.some((s) => s.slot === h));
        const t = cands[Math.floor(Math.random() * cands.length)] ?? houses[0];
        dist += dist2(from, t);
        this.stops.push({ slot: t, act: 'drop' });
        from = t;
      }
      this.timeTotal = (dist / 5.2) * Math.max(1.35, 1.9 - level * 0.04) + 5 * n;
    } else if (opts.mode === 'flyer') {
      // tante case vicine, una dopo l'altra
      const n = Math.min(9, 4 + Math.floor(level / 2));
      let from = start;
      for (let i = 0; i < n; i++) {
        const cands = houses.filter((h) => !this.stops.some((s) => s.slot === h) && h !== from)
          .sort((a, b) => a.pos.distanceTo(from.pos) - b.pos.distanceTo(from.pos));
        const t = cands[Math.floor(Math.random() * Math.min(3, cands.length))];
        if (!t) break;
        dist += dist2(from, t);
        this.stops.push({ slot: t, act: 'flyer' });
        from = t;
      }
      this.timeTotal = (dist / 5.2) * Math.max(1.3, 1.75 - level * 0.03) + 2 * n;
    }
    this.timeLeft = this.timeTotal;
    this.title = opts.title;
    if (opts.mode === 'package') this.carry(true);
    this.marker = this.add(arrow());
    this.ringObj = this.add(ring(0xffcc1a, 1.4));
    this.guide = this.add(arrow(0xffffff));
    this.guide.scale.set(0.6, 0.6, 0.6);
    this.placeMarker();
  }

  private carry(on: boolean) {
    if (!on) {
      this.game.player.hold();
      return;
    }
    const box = model('furniture/cardboardBoxClosed.glb', 2.2);
    box.position.x = -0.23;
    this.game.player.hold(box);
  }

  private get stop() {
    return this.stops[this.idx];
  }

  private placeMarker() {
    const t = this.stop.slot;
    this.target = t.pos;
    this.ringObj.position.set(t.pos.x, 0.05, t.pos.z);
    this.marker.position.set(t.pos.x, 3, t.pos.z);
  }

  private label() {
    const a = this.stop.act;
    if (a === 'flyer') return { label: 'Volantino', icon: '📰' };
    return { label: 'Consegna', icon: '📦' };
  }

  update(dt: number) {
    if (!this.tick(dt)) return;
    const t = this.stop.slot;
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
    const m = this.opts.mode;
    this.status = `${m === 'flyer' ? 'Volantini' : 'Pacchi'}: ${this.idx}/${this.stops.length} · ${Math.round(d)} m`;
    const reach = this.game.riding ? 3 : 1.8;
    this.game.prompt = d < reach ? this.label() : null;
  }

  onAction() {
    const t = this.stop.slot;
    const p = this.game.player.root.position;
    if (Math.hypot(t.pos.x - p.x, t.pos.z - p.z) > (this.game.riding ? 3 : 1.8)) return;
    this.idx++;
    if (!this.game.riding) this.game.player.once('interact-right');
    if (this.idx >= this.stops.length) {
      this.done();
      return;
    }
    this.placeMarker();
  }

  dispose() {
    super.dispose();
    this.game.player.hold();
  }
}

// ---------------- strofina sullo schermo ----------------

const THEME_INFO: Record<DishTheme, { what: string }> = {
  plate: { what: 'Piatti' },
  car: { what: 'Parti dell\'auto' },
  wall: { what: 'Pareti' },
};

/** Lavapiatti, lavaggio auto, imbianchino: minigioco a tutto schermo. */
export class ScrubRun extends BaseRun {
  private dish: DishGame;

  constructor(game: Game, level: number, private theme: DishTheme, title: string) {
    super(game, level);
    const rounds = Math.min(8, (theme === 'plate' ? 3 : 2) + Math.floor(level / 2));
    const spots = Math.min(9, 4 + Math.floor(level / 3));
    const per = theme === 'plate' ? 4.8 : 6;
    this.timeTotal = this.timeLeft = rounds * Math.max(3.4, per - level * 0.1) + 3;
    this.title = title;
    this.dish = new DishGame(rounds, spots, theme, () => this.done());
    game.input.enabled = false;
  }

  update(dt: number) {
    if (!this.tick(dt)) return;
    this.status = `${THEME_INFO[this.theme].what}: ${this.dish.done}/${this.dish.total}`;
    this.game.prompt = null;
  }

  dispose() {
    super.dispose();
    this.dish.destroy();
    this.game.input.enabled = true;
  }
}

// ---------------- ordini delle imprese di servizi ----------------

/**
 * Ordine di pulizie o traslochi: si raggiunge la casa del cliente (anche col
 * veicolo), poi il lavoro si fa in 3D dentro la casa (world/clienthouse.ts).
 */
export class VisitRun extends BaseRun {
  private marker: THREE.Object3D;
  private ringObj: THREE.Object3D;
  inside = false;

  constructor(game: Game, level: number, private dest: Slot, title: string, private onEnter: () => void) {
    super(game, level);
    const p = game.player.root.position;
    const dist = Math.abs(dest.pos.x - p.x) + Math.abs(dest.pos.z - p.z);
    this.timeTotal = this.timeLeft = (dist / 5.2) * 2 + 25;
    this.title = title;
    this.target = dest.pos;
    this.marker = this.add(arrow(0x2d9cdb));
    this.marker.position.set(dest.pos.x, 3, dest.pos.z);
    this.ringObj = this.add(ring(0x2d9cdb, 1.6));
    this.ringObj.position.set(dest.pos.x, 0.05, dest.pos.z);
  }

  private reach() {
    return this.game.riding ? 3 : 2;
  }

  update(dt: number) {
    if (this.inside || !this.tick(dt)) return;
    const p = this.game.player.root.position;
    const d = Math.hypot(this.dest.pos.x - p.x, this.dest.pos.z - p.z);
    this.marker.position.y = 3 + Math.sin(performance.now() / 250) * 0.3;
    this.marker.rotation.y += dt * 2;
    this.status = `Vai dal cliente · ${Math.round(d)} m`;
    this.game.prompt = d < this.reach() ? { label: 'Entra in casa', icon: '🚪' } : null;
  }

  onAction() {
    const p = this.game.player.root.position;
    if (this.inside || Math.hypot(this.dest.pos.x - p.x, this.dest.pos.z - p.z) > this.reach()) return;
    this.inside = true;
    this.game.prompt = null;
    this.onEnter();
  }
}
