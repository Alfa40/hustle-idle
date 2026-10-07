import * as THREE from 'three';
import { model } from '../assets';
import { JOB } from '../config/balance';
import type { Game } from '../game';
import type { Slot } from '../world/city';
import { WS } from '../config/map';
import type { ParticleKind } from '../world/particles';
import { arrow, boxProp, bush, cone, cylProp, label, leafPile, ring, trimmedBush } from '../world/props';
import type { Arena, FenceSide } from './arena';
import { routeStops, type Street, type StreetHouse } from './street';
import { TREE_MODELS } from '../world/city';
import { bigPlanter, flowerBed, hoseReel, newsstand, paintKit, parcelShop, patioSet, postbox, ragBucket, roundShrub, slide, soapSprayer, tarpFor, toolbox, wheelieBin } from '../world/jobprops';

export interface JobRun {
  title: string;
  status: string;
  timeLeft: number;
  timeTotal: number;
  /** dove andare adesso (per freccette e mappa) */
  target?: THREE.Vector3;
  /** tutorial in corso: il tempo è fermo */
  frozen?: boolean;
  /** cosa sta succedendo, per il tutorial contestuale */
  guide?(): RunGuide | null;
  update(dt: number): void;
  onAction?(): void;
  /** spinge il personaggio fuori dagli oggetti grandi del lavoretto */
  collide?(p: THREE.Vector3, r?: number): void;
  dispose(): void;
}

/** Stato del lavoretto per il tutorial: fase, punto da raggiungere, se ci sei vicino. */
export interface RunGuide {
  phase: number;
  phases: number;
  phaseName: string;
  phaseIcon: string;
  /** punti ancora da fare in questa fase */
  left: number;
  task: Task | null;
  near: boolean;
  /** dentro la zona di lavoro (true se il lavoretto non ha una zona) */
  inZone: boolean;
  /** è già entrato almeno una volta nella zona */
  arrived: boolean;
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
  frozen = false;
  protected objs: THREE.Object3D[] = [];
  constructor(protected game: Game, protected level: number) {}

  protected add(o: THREE.Object3D) {
    this.game.scene.add(o);
    this.objs.push(o);
    return o;
  }

  /** ingombro a terra degli oggetti solidi (calcolato una volta: non si spostano) */
  private solidBoxes = new Map<THREE.Object3D, THREE.Box3>();

  protected solidBox(o: THREE.Object3D) {
    let b = this.solidBoxes.get(o);
    if (!b) {
      o.updateMatrixWorld(true);
      b = new THREE.Box3().setFromObject(o);
      // un filo più stretto dell'oggetto: non ci si incastra sugli spigoli
      b.expandByVector(new THREE.Vector3(-0.08, 0, -0.08));
      this.solidBoxes.set(o, b);
    }
    return b;
  }

  /**
   * Gli oggetti grandi (`userData.solid`: auto, tavoli, cespugli, muretti, edicola…) non si
   * attraversano: il personaggio viene spinto fuori. Quelli piccoli (foglie, cassette della
   * posta, barattoli…) restano attraversabili.
   */
  collide(p: THREE.Vector3, r = 0.35) {
    for (const o of this.objs) {
      if (!o.userData.solid || !o.visible || !o.parent) continue;
      const b = this.solidBox(o);
      if (p.x < b.min.x - r || p.x > b.max.x + r || p.z < b.min.z - r || p.z > b.max.z + r) continue;
      const pushes = [b.min.x - r - p.x, b.max.x + r - p.x, b.min.z - r - p.z, b.max.z + r - p.z];
      const i = pushes.map(Math.abs).indexOf(Math.min(...pushes.map(Math.abs)));
      if (i < 2) p.x += pushes[i];
      else p.z += pushes[i];
    }
  }

  protected tick(dt: number) {
    // durante il tutorial il tempo non scorre
    if (this.frozen) return true;
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

// ---------------- lavoretti a fasi in una zona di lavoro ----------------

/** Scala degli oggetti di scena dei lavoretti (più piccoli = vista più pulita). */
const PROP_SCALE = 0.65;

/** Rettangolo orientato: `dir` verso la strada, `side` di lato. */
export interface Zone {
  center: THREE.Vector3;
  dir: THREE.Vector3;
  side: THREE.Vector3;
  halfF: number;
  halfR: number;
}

function zonePoint(z: Zone, f: number, r: number) {
  return z.center.clone().addScaledVector(z.dir, f).addScaledVector(z.side, r);
}

function inZone(z: Zone, p: THREE.Vector3, pad = 0) {
  const v = p.clone().sub(z.center);
  return Math.abs(v.dot(z.dir)) <= z.halfF + pad && Math.abs(v.dot(z.side)) <= z.halfR + pad;
}

/** Un'azione da fare in un punto: tocco singolo o tieni premuto. */
export interface Task {
  pos: THREE.Vector3;
  kind: 'tap' | 'hold';
  /** secondi da tenere premuto */
  sec?: number;
  label: string;
  icon: string;
  onDone?: () => void;
  /** particelle mentre si lavora (foglie, bolle, vernice…) */
  fx?: ParticleKind;
  fxColor?: number;
  /** durante il "tieni premuto" (0–1), per animare l'oggetto */
  onProgress?: (p: number) => void;
  done?: boolean;
  progress?: number;
  /** dove mettere l'indicatore se sopra il punto coprirebbe un oggetto grande (edicola, negozio…) */
  markerAt?: THREE.Vector3;
  /** oggetto da far pulsare quando sei vicino, se il punto non ha oggetti che si accendono (es. l'auto) */
  obj?: THREE.Object3D;
}

export interface Phase {
  name: string;
  icon: string;
  /** crea le attività quando la fase inizia (così possono dipendere da quelle prima) */
  tasks: () => Task[];
  /** true = le attività vanno fatte nell'ordine dato (es. prendi → lava → appoggia) */
  ordered?: boolean;
}

/**
 * Lavoretto strutturato: una zona di lavoro delimitata (se serve) e una
 * sequenza di fasi; ogni fase ha punti da toccare o da tenere premuti.
 */
export class PhasedRun extends BaseRun {
  private phases: Phase[];
  private idx = -1;
  private tasks: Task[] = [];
  private markers = new Map<Task, THREE.Sprite>();
  private zone: Zone | null;
  private outTimer = 0;
  private wasInZone = false;

  constructor(game: Game, level: number, title: string, phases: Phase[], opts: { zone?: Zone; time: number; keep?: THREE.Vector3 }) {
    super(game, level);
    this.title = title;
    this.phases = phases;
    this.zone = opts.zone ?? null;
    // con la città più grande nella zona di lavoro si cammina un po' di più
    this.timeTotal = this.timeLeft = opts.time * (opts.zone ? 1 + (WS - 1) * 0.5 : 1) * Math.max(0.75, 1 - level * 0.02);
    if (this.zone) {
      this.drawZone(this.zone);
      // niente palazzi o alberi davanti alla zona di lavoro
      const z = this.zone;
      const halfW = Math.abs(z.side.x) * z.halfR + Math.abs(z.dir.x) * z.halfF;
      game.city.clearView(z.center, halfW, opts.keep);
    }
    this.nextPhase();
  }

  /** Rettangolo a terra con i coni agli angoli e lungo i lati: la zona dove si lavora. */
  private drawZone(z: Zone) {
    const c = zonePoint(z, 0, 0);
    const rot = Math.atan2(z.side.x, z.side.z);
    const w = z.halfR * 2;
    const d = z.halfF * 2;
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ color: 0xffc21a, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    fill.rotation.set(-Math.PI / 2, 0, rot - Math.PI / 2);
    fill.position.set(c.x, 0.035, c.z);
    fill.userData.noGlow = true;
    this.add(fill);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)),
      new THREE.LineBasicMaterial({ color: 0xff8a3d }),
    );
    edge.rotation.copy(fill.rotation);
    edge.position.set(c.x, 0.05, c.z);
    edge.userData.noGlow = true;
    this.add(edge);
    const pts: [number, number][] = [];
    for (const f of [-1, 1]) for (const r of [-1, 0, 1]) pts.push([f * z.halfF, r * z.halfR]);
    pts.push([0, -z.halfR], [0, z.halfR]);
    for (const [f, r] of pts) {
      const k = this.add(cone());
      k.userData.noGlow = true;
      k.position.copy(zonePoint(z, f, r));
      k.scale.setScalar(0.6);
    }
    const sign = label('🚧 Zona di lavoro', { bg: '#ff8a3d', scale: 0.45 });
    sign.position.set(c.x, 3.2, c.z);
    this.add(sign);
  }

  /**
   * Aggiunge un oggetto di scena che sparisce a fine lavoro.
   * Gli oggetti dei lavoretti sono rimpiccioliti (`scale`) per non riempire la vista.
   */
  prop(o: THREE.Object3D, pos: THREE.Vector3, rotY = 0, scale = PROP_SCALE) {
    o.position.copy(pos);
    o.rotation.y = rotY;
    o.scale.multiplyScalar(scale);
    const r = this.add(o);
    for (const t of this.tasks) this.glowObj(t, o);
    return r;
  }

  /** oggetti di scena che brillano per ogni punto da fare, con i materiali originali */
  private glows = new Map<Task, { meshes: { m: THREE.Mesh; orig: THREE.Material | THREE.Material[] }[] }>();

  /** Fa brillare gli oggetti vicini a un punto da fare (cassetta, cespuglio, muretto…). */
  private addGlow(t: Task) {
    if (!this.glows.has(t)) this.glows.set(t, { meshes: [] });
    for (const o of this.objs) this.glowObj(t, o);
  }

  /** Accende un oggetto di scena se è vicino al punto da fare (anche se aggiunto dopo l'inizio della fase). */
  private glowObj(t: Task, o: THREE.Object3D) {
    const g = this.glows.get(t);
    if (!g || (o as THREE.Sprite).isSprite || o.userData.noGlow) return;
    if (Math.hypot(o.position.x - t.pos.x, o.position.z - t.pos.z) > 1.05) return;
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh || (m as unknown as THREE.Sprite).isSprite || g.meshes.some((x) => x.m === m)) return;
      const orig = m.material;
      // nessuna luce esterna: il colore dell'oggetto stesso si accende
      const glowMat = (mat: THREE.Material) => {
        const c2 = mat.clone() as THREE.MeshLambertMaterial;
        // un colore già saturo (rosso pieno) non può diventare "più rosso": si schiarisce verso il bianco
        c2.emissive = (c2.color ? c2.color.clone() : new THREE.Color(0xffffff)).lerp(WHITE, 0.25);
        if (c2.map) c2.emissiveMap = c2.map;
        c2.emissiveIntensity = 0;
        return c2;
      };
      m.material = Array.isArray(orig) ? orig.map(glowMat) : glowMat(orig);
      g.meshes.push({ m, orig });
    });
  }

  private removeGlow(t: Task) {
    const g = this.glows.get(t);
    if (!g) return;
    for (const { m, orig } of g.meshes) m.material = orig;
    this.glows.delete(t);
  }

  /** cerchio a terra dove stare per il prossimo punto da fare */
  private standRing: THREE.Mesh | null = null;
  private standPt = new THREE.Vector3();

  /**
   * Punto dove stare: davanti all'oggetto, dalla parte del giocatore, appena fuori dal suo ingombro
   * (per il bancone dell'edicola e del negozio è il punto stesso). Lì si disegna il cerchio a terra.
   */
  private placeStand(t: Task | null, p: THREE.Vector3) {
    if (!this.standRing) {
      this.standRing = this.add(ring(0xffd21a, 0.55)) as THREE.Mesh;
      this.standRing.userData.noGlow = true;
    }
    const r = this.standRing;
    r.visible = !!t;
    if (!t) return;
    const sp = this.standPt;
    if (t.markerAt) sp.copy(t.pos);
    else {
      // quanto è grande l'oggetto (se è solido ci si ferma appena fuori)
      let rad = 0.45;
      for (const o of this.objs) {
        if (!o.userData.solid || !o.visible || Math.hypot(o.position.x - t.pos.x, o.position.z - t.pos.z) > 1.1) continue;
        const b = this.solidBox(o);
        rad = Math.max(rad, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / 2);
      }
      const dx = p.x - t.pos.x;
      const dz = p.z - t.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      sp.set(t.pos.x + (dx / len) * (rad + 0.55), 0, t.pos.z + (dz / len) * (rad + 0.55));
      // mai dentro un altro oggetto o un edificio
      this.collide(sp, 0.3);
      if (this.game.arena) this.game.arena.collide(sp, 0.3);
      else this.game.city.collide(sp, 0.3);
    }
    r.position.set(sp.x, 0.12, sp.z);
    // vicino abbastanza: il cerchio diventa verde e pulsa
    const mat = r.material as THREE.MeshBasicMaterial;
    mat.color.setHex(this.nearOk ? 0x35c46a : 0xffd21a);
    const k = this.nearOk ? 1 + 0.12 * Math.sin(performance.now() / 140) : 1;
    r.scale.set(k, k, k);
  }

  /** Il punto non ha oggetti che si accendono da soli (es. i lati dell'auto): pulsa l'oggetto indicato. */
  private ownGlow(t: Task) {
    return this.glows.get(t)?.meshes.length ? undefined : t.obj;
  }

  /** Luce che pulsa sugli oggetti ancora da usare (solo quelli attivi adesso). */
  private pulseGlows() {
    const pend = new Set(this.pending());
    // colore più chiaro e vivo che pulsa piano sugli oggetti ancora da usare; quello che puoi usare
    // adesso (sei abbastanza vicino) pulsa forte e più in fretta: è lì che si tocca
    const now = performance.now();
    const soft = 0.05 + 0.3 * (0.5 + 0.5 * Math.sin(now / 260));
    const strong = 0.2 + 0.75 * (0.5 + 0.5 * Math.sin(now / 140));
    for (const [t, g] of this.glows) {
      const on = pend.has(t) && !t.done;
      const k = !on ? 0 : t === this.nearTask && this.nearOk ? strong : soft;
      for (const { m } of g.meshes) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) (mat as THREE.MeshLambertMaterial).emissiveIntensity = k;
      }
    }
  }

  private nextPhase() {
    for (const m of this.markers.values()) this.game.scene.remove(m);
    this.markers.clear();
    for (const t of [...this.glows.keys()]) this.removeGlow(t);
    this.idx++;
    if (this.idx >= this.phases.length) {
      this.done();
      return;
    }
    this.tasks = this.phases[this.idx].tasks();
    for (const t of this.tasks) {
      this.addGlow(t);
      const m = label(t.icon, { bg: '#ffffff', fg: '#000', scale: 0.45 });
      // l'indicatore sta sopra l'oggetto più alto lì vicino (mai sovrapposto a cassette, giochi…)
      const mp = t.markerAt ?? t.pos;
      m.userData.baseY = this.markerY({ ...t, pos: mp });
      m.position.set(mp.x, m.userData.baseY, mp.z);
      this.game.scene.add(m);
      this.markers.set(t, m);
    }
  }

  /** Altezza dell'indicatore: sopra gli oggetti di scena entro 1,1 m dal punto. */
  private markerY(t: Task) {
    let top = 0;
    const box = new THREE.Box3();
    for (const o of this.objs) {
      if ((o as THREE.Sprite).isSprite || o.userData.noGlow || !o.visible) continue;
      if (Math.hypot(o.position.x - t.pos.x, o.position.z - t.pos.z) > 1.1) continue;
      box.setFromObject(o);
      if (Number.isFinite(box.max.y)) top = Math.max(top, box.max.y);
    }
    return Math.max(2.3, top + 0.75);
  }

  private pending() {
    const p = this.tasks.filter((t) => !t.done);
    return this.phases[this.idx]?.ordered ? p.slice(0, 1) : p;
  }

  private reach() {
    return this.game.riding ? 3 : 1.6;
  }

  private nearTask: Task | null = null;
  private nearOk = false;

  guide(): RunGuide | null {
    const ph = this.phases[this.idx];
    if (!ph) return null;
    const p = this.game.player.root.position;
    return {
      phase: this.idx,
      phases: this.phases.length,
      phaseName: ph.name,
      phaseIcon: ph.icon,
      left: this.tasks.filter((t) => !t.done).length,
      task: this.nearTask,
      near: this.nearOk,
      inZone: !this.zone || inZone(this.zone, p, 1.2),
      arrived: !this.zone || this.wasInZone,
    };
  }

  update(dt: number) {
    if (!this.tick(dt)) return;
    const ph = this.phases[this.idx];
    if (!ph) return;
    const p = this.game.player.root.position;
    const pend = this.pending();
    this.pulseGlows();
    // freccette sopra i punti ancora da fare (solo quelli attivi)
    const t0 = performance.now() / 250;
    for (const [t, m] of this.markers) {
      m.visible = !t.done && pend.includes(t);
      m.position.y = (m.userData.baseY ?? 2.3) + Math.sin(t0 + t.pos.x) * 0.12;
    }
    let near: Task | null = null;
    let nd = Infinity;
    for (const t of pend) {
      const d = Math.hypot(t.pos.x - p.x, t.pos.z - p.z);
      if (d < nd) {
        nd = d;
        near = t;
      }
    }
    this.target = near?.pos;
    this.nearTask = near;
    this.nearOk = !!near && nd <= this.reach();
    this.placeStand(near, p);
    const done = this.tasks.filter((t) => t.done).length;
    let status = `Fase ${this.idx + 1}/${this.phases.length} · ${ph.icon} ${ph.name}${this.tasks.length > 1 ? ` ${done}/${this.tasks.length}` : ''}`;
    // prima di arrivare: si dice dove andare; poi l'avviso resta accanto alla fase, senza nasconderla
    if (this.zone && !inZone(this.zone, p, 1.2)) {
      this.outTimer += dt;
      status = this.wasInZone ? `⚠️ Rientra nella zona · ${status}` : '🚶 Vai alla zona di lavoro: segui le frecce';
    } else {
      this.outTimer = 0;
      this.wasInZone = true;
    }
    this.status = status + (this.heldIcon && this.game.player.held ? ` · in mano ${this.heldIcon}` : '');
    if (!near || nd > this.reach()) {
      this.game.prompt = null;
      if (this.game.player.currentName === 'interact-right' && !this.game.input.actionHeld) this.game.player.play('idle');
      return;
    }
    // l'anello da toccare sta sull'oggetto (a metà altezza, sotto l'indicatore)
    const mk = this.markers.get(near);
    const mp = near.markerAt ?? near.pos;
    const at = new THREE.Vector3(mp.x, Math.min(1.6, Math.max(0.5, ((mk?.userData.baseY ?? 2.3) - 0.75) * 0.55)), mp.z);
    if (near.kind === 'hold') {
      if (this.game.input.actionHeld) {
        near.progress = (near.progress ?? 0) + dt / (near.sec ?? 1.2);
        this.fxT -= dt;
        if (near.fx && this.fxT <= 0) {
          this.fxT = 0.09;
          this.game.fx.emit(near.fx, near.pos.clone().setY(0.7), 2, near.fxColor);
        }
        near.onProgress?.(Math.min(1, near.progress));
        this.game.player.faceTowards(near.pos.x, near.pos.z, dt);
        this.game.player.play('interact-right', 0.1, 1.6);
        if (near.progress >= 1) this.complete(near);
      } else if (this.game.player.currentName === 'interact-right') this.game.player.play('idle');
      this.game.prompt = { label: `Tieni premuto: ${near.label}`, icon: near.icon, progress: near.progress ?? 0, at, obj: this.ownGlow(near), stand: this.standPt };
    } else {
      this.game.prompt = { label: near.label, icon: near.icon, at, obj: this.ownGlow(near), stand: this.standPt };
    }
  }

  onAction() {
    const p = this.game.player.root.position;
    const t = this.pending().find((x) => x.kind === 'tap' && Math.hypot(x.pos.x - p.x, x.pos.z - p.z) < this.reach());
    if (!t) return;
    if (!this.game.riding) this.game.player.once('interact-right');
    this.complete(t);
  }

  private fxT = 0;
  /** icona di ciò che si tiene in mano (in prima persona l'oggetto non si vede) */
  private heldIcon = '';

  private complete(t: Task) {
    t.done = true;
    this.removeGlow(t);
    this.game.fx.emit(t.fx ?? 'spark', t.pos.clone().setY(0.8), t.fx ? 8 : 5, t.fxColor);
    this.game.player.play('idle');
    t.onDone?.();
    this.heldIcon = this.game.player.held ? t.icon : '';
    const m = this.markers.get(t);
    if (m) m.visible = false;
    if (this.tasks.every((x) => x.done)) this.nextPhase();
  }

  dispose() {
    for (const m of this.markers.values()) this.game.scene.remove(m);
    for (const t of [...this.glows.keys()]) this.removeGlow(t);
    if (this.zone) this.game.city.restoreView();
    super.dispose();
    this.game.player.hold();
  }
}

// ---------------- i lavoretti ----------------


const WHITE = new THREE.Color(0xffffff);
const hold = (game: Game, obj?: THREE.Object3D) => game.player.hold(obj);

/** Lavaggio auto come minigioco: quante auto secondo il livello (1, poi 2, poi 3). */
export function carWashCars(level: number) {
  return level < 3.5 ? 1 : level < 6 ? 2 : 3;
}

/** Lotto per il lavaggio: largo quanto serve per le auto parcheggiate davanti alla casa, mai di più. */
export function carWashLot(level: number) {
  return { w: carWashCars(level) === 3 ? 25 : 14, d: 15 };
}

/**
 * Lavaggio auto come minigioco (scena separata, prima persona): le auto sono parcheggiate nel cortile
 * davanti alla casa, ai lati del vialetto. Fasi: spruzzino → sapone su ogni lato di ogni auto →
 * canna dell'acqua e giro di risciacquo → straccio e asciugatura.
 */
export function carWashArenaJob(game: Game, level: number, arena: Arena, title: string) {
  const n = carWashCars(level);
  const E = arena.entry;
  const zc = arena.house.maxZ + 2.7;
  const xs = [-3.7, 3.7, -9.6].slice(0, n);
  const models = ['cars/sedan.glb', 'cars/hatchback-sports.glb', 'cars/suv-luxury.glb'];
  const cars = xs.map((x) => new THREE.Vector3(E.x + x, 0, zc));
  // i 4 lati di ogni auto nell'ordine del giro: muso, lato strada, coda, lato casa
  const sidesOf = (c: THREE.Vector3) => [c.clone().add(new THREE.Vector3(2.15, 0, 0)), c.clone().add(new THREE.Vector3(0, 0, 1.0)), c.clone().add(new THREE.Vector3(-2.15, 0, 0)), c.clone().add(new THREE.Vector3(0, 0, -1.0))];
  const all = cars.flatMap((c, ci) => sidesOf(c).map((pos, i) => ({ pos, i, ci, car: c })));
  const sideNames = ['il muso', 'il lato strada', 'la coda', 'il lato casa'];
  const onSide = ['sul muso', 'sul lato strada', 'sulla coda', 'sul lato casa'];
  const who = (ci: number) => (n > 1 ? ` (auto ${ci + 1})` : '');
  // attrezzi ai lati della casa (fuori dal giro delle auto e dal vialetto)
  const sprayer = new THREE.Vector3(arena.house.minX - 1.3, 0, arena.house.maxZ - 0.6);
  const rags = new THREE.Vector3(arena.house.minX - 1.3, 0, arena.house.maxZ - 2.0);
  const reel = new THREE.Vector3(arena.house.maxX + 1.3, 0, arena.house.maxZ - 0.6);
  let run: PhasedRun;
  const carObjs: THREE.Object3D[] = [];
  const foams: THREE.Object3D[] = [];
  const drops: THREE.Object3D[] = [];
  const sp = 1 + 0.04 * level;
  // schiuma o gocce su un lato dell'auto (tra il punto e il centro dell'auto)
  const blob = (k: number, s: { pos: THREE.Vector3; i: number; car: THREE.Vector3 }, color: number, r0: number, r1: number) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.9 });
    for (let j = 0; j < k; j++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r0 + Math.random() * r1, 8, 6), mat);
      m.position.set((Math.random() - 0.5) * (s.i % 2 ? 1.6 : 0.7), 0.45 + Math.random() * 0.7, (Math.random() - 0.5) * (s.i % 2 ? 0.4 : 1.2));
      g.add(m);
    }
    return run.prop(g, s.pos.clone().lerp(s.car, 0.62), s.i % 2 ? 0 : Math.PI / 2, 1);
  };
  const phases: Phase[] = [
    { name: 'Prendi lo spruzzino del sapone', icon: '🧴', tasks: () => [{ pos: sprayer, kind: 'tap', label: 'Prendi lo spruzzino', icon: '🧴', onDone: () => hold(game, cylProp(0.12, 0.35, 0xff6fae)) }] },
    {
      name: n > 1 ? 'Spruzza il sapone su tutte le auto' : "Spruzza il sapone su tutta l'auto", icon: '🫧',
      tasks: () => all.map((s, k) => ({
        pos: s.pos, kind: 'hold' as const, sec: 1.1 / sp, label: `Spruzza ${onSide[s.i]}${who(s.ci)}`, icon: '🫧', fx: 'bubble' as const, obj: carObjs[s.ci],
        onDone: () => { foams[k] = blob(12, s, 0xffffff, 0.14, 0.1); },
      })),
    },
    { name: "Prendi la canna dell'acqua", icon: '🚿', tasks: () => [{ pos: reel, kind: 'tap', label: 'Prendi la canna', icon: '🚿', onDone: () => hold(game, cylProp(0.05, 0.6, 0x43a047)) }] },
    {
      name: 'Fai il giro e risciacqua', icon: '💦', ordered: true,
      tasks: () => all.map((s, k) => ({
        pos: s.pos, kind: 'hold' as const, sec: 1 / sp, label: `Risciacqua ${sideNames[s.i]}${who(s.ci)}`, icon: '💦', fx: 'bubble' as const, fxColor: 0x6ec6ff, obj: carObjs[s.ci],
        onProgress: (p: number) => foams[k]?.scale.setScalar(Math.max(0.05, 1 - p)),
        onDone: () => {
          if (foams[k]) foams[k].visible = false;
          drops[k] = blob(10, s, 0x8fd3ff, 0.045, 0);
        },
      })),
    },
    { name: 'Prendi lo straccio', icon: '🧽', tasks: () => [{ pos: rags, kind: 'tap', label: 'Prendi lo straccio', icon: '🧽', onDone: () => hold(game, boxProp(0.25, 0.06, 0.3, 0xffc21a)) }] },
    {
      name: n > 1 ? 'Asciuga tutte le auto' : "Asciuga tutta l'auto", icon: '✨',
      tasks: () => all.map((s, k) => ({
        pos: s.pos, kind: 'hold' as const, sec: 0.9 / sp, label: `Asciuga ${sideNames[s.i]}${who(s.ci)}`, icon: '✨', fx: 'spark' as const, obj: carObjs[s.ci],
        onProgress: (p: number) => drops[k]?.scale.setScalar(Math.max(0.05, 1 - p)),
        onDone: () => { if (drops[k]) drops[k].visible = false; },
      })),
    },
  ];
  run = new PhasedRun(game, level, title, phases, { time: 24 + n * 42 });
  cars.forEach((c, ci) => {
    const car = run.prop(model(models[ci % models.length], 1), c, Math.PI / 2, 1);
    car.userData.noGlow = true;
    car.userData.solid = true;
    carObjs.push(car);
  });
  run.prop(soapSprayer(), sprayer, Math.PI / 2, 1);
  run.prop(hoseReel(), reel, -Math.PI / 2, 1);
  run.prop(ragBucket(), rags, Math.PI / 2, 1);
  return run;
}

/**
 * Imbianchino come minigioco (scena separata, prima persona): il muretto è sul confine del lotto.
 * Quanto se ne dipinge dipende dal livello: al Liv. 1 solo il davanti, poi anche un lato, tutti e due,
 * e infine anche il retro. Anche le cose da coprire con i teloni aumentano col livello.
 * Fasi: copri tutto → prendi la vernice → dipingi ogni tratto → togli i teloni.
 */
export function paintArenaJob(game: Game, level: number, arena: Arena, title: string) {
  const colors = [0xff8a3d, 0x2d9cdb, 0x35c46a, 0x8e5bd6, 0xffc21a, 0xe84393];
  const col = colors[Math.floor(Math.random() * colors.length)];
  const sides: FenceSide[] = level < 2.5 ? ['front'] : level < 4 ? ['front', 'left'] : level < 5.5 ? ['front', 'left', 'right'] : ['front', 'left', 'right', 'back'];
  const toPaint = arena.fence.filter((f) => sides.includes(f.side));
  // il colore resta anche quando l'oggetto smette di pulsare: si colora sempre il materiale originale
  const mats = toPaint.map((f) => f.body.material as THREE.MeshLambertMaterial);
  const cans = arena.entry.clone().add(new THREE.Vector3(2.2, 0, -0.6));
  // cose del giardino da coprire: lontane dal muretto (resta un corridoio libero per dipingere)
  const nItems = Math.min(10, 2 + Math.floor(level));
  const kinds = [roundShrub, flowerBed, slide, patioSet, bigPlanter];
  const spots = arena.scatter(nItems, 2.4, 1.6, [cans, arena.entry]);
  const items = spots.map((pos) => {
    const k = kinds[Math.floor(Math.random() * kinds.length)];
    const obj = k();
    obj.userData.solid = k !== flowerBed;
    obj.rotation.y = Math.random() * Math.PI * 2;
    obj.position.copy(pos);
    obj.updateMatrixWorld(true);
    const tarp = tarpFor(obj);
    tarp.visible = false;
    return { pos, obj, tarp };
  });
  const dropTarp = (t: THREE.Object3D) => {
    t.visible = true;
    const start = performance.now();
    const anim = () => {
      const k = Math.min(1, (performance.now() - start) / 350);
      t.position.y = 1.2 * (1 - k) * (1 - k);
      t.scale.y = 0.4 + 0.6 * k;
      if (k < 1) requestAnimationFrame(anim);
    };
    anim();
  };
  const gray = new THREE.Color(0x9e9e9e);
  const paint = new THREE.Color(col);
  const phases: Phase[] = [
    {
      name: 'Copri il giardino con i teloni', icon: '🛡️',
      tasks: () => items.map((it) => ({ pos: it.pos, kind: 'tap' as const, label: 'Copri con il telone', icon: '🛡️', onDone: () => dropTarp(it.tarp) })),
    },
    { name: 'Prendi la vernice', icon: '🪣', tasks: () => [{ pos: cans, kind: 'tap', label: 'Prendi la vernice', icon: '🪣', onDone: () => hold(game, cylProp(0.16, 0.25, col)) }] },
    {
      name: 'Dipingi ogni tratto del muretto', icon: '🖌️',
      tasks: () => toPaint.map((f, i) => ({
        pos: f.inner, kind: 'hold' as const, sec: 1.3 / (1 + 0.04 * level), label: 'Dipingi', icon: '🖌️', fx: 'paint' as const, fxColor: col, obj: f.obj,
        onProgress: (p: number) => {
          mats[i].color.lerpColors(gray, paint, p);
          // anche il materiale "acceso" mentre pulsa
          const cur = f.body.material as THREE.MeshLambertMaterial;
          if (cur !== mats[i]) cur.color.copy(mats[i].color);
        },
      })),
    },
    {
      name: 'Togli i teloni', icon: '🧹',
      tasks: () => items.map((it) => ({ pos: it.pos, kind: 'tap' as const, label: 'Togli il telone', icon: '🧹', onDone: () => { it.tarp.visible = false; hold(game); } })),
    },
  ];
  const run = new PhasedRun(game, level, title, phases, { time: toPaint.length * 5 + nItems * 7 + 30 });
  for (const it of items) {
    run.prop(it.obj, it.pos, it.obj.rotation.y, 1);
    run.prop(it.tarp, it.pos.clone(), 0, 1);
  }
  run.prop(paintKit(col), cans, 0, 1);
  return run;
}

/**
 * Giardinaggio come minigioco (scena separata, prima persona): un giardino grande attorno alla casa,
 * cespugli e ostacoli in numero e posizioni sempre diversi. Fasi: tosasiepi → taglia ogni cespuglio →
 * raccogli le foglie → svuota il sacco nel bidone.
 */
export function gardenArenaJob(game: Game, level: number, arena: Arena, title: string) {
  const n = Math.min(14, 5 + Math.round(level));
  const box = arena.entry.clone().add(new THREE.Vector3(-2.2, 0, -0.6));
  const bin = new THREE.Vector3(arena.house.minX - 1.1, 0, arena.house.maxZ - 0.8);
  // ostacoli del giardino: alberelli, vasi grandi, tavolino (solidi) e aiuole (basse, si attraversano)
  // anche gli ostacoli crescono col livello (giardino piccolo all'inizio)
  const deco = arena.scatter(Math.min(6, 2 + Math.floor(level / 2)), 2.6, 1.2, [box, bin, arena.entry]);
  const spots = arena.scatter(n, 1.9, 1.0, [box, bin, arena.entry, ...deco]);
  let run: PhasedRun;
  const bushes: THREE.Object3D[] = [];
  const piles: THREE.Vector3[] = [];
  const phases: Phase[] = [
    {
      name: 'Prendi il tosasiepi', icon: '🧰',
      tasks: () => [{ pos: box, kind: 'tap', label: 'Prendi il tosasiepi', icon: '🧰', onDone: () => hold(game, boxProp(0.5, 0.15, 0.15, 0xff5d73)) }],
    },
    {
      name: 'Taglia i cespugli', icon: '✂️',
      tasks: () => spots.map((pos, i) => ({
        pos, kind: 'hold' as const, sec: 1.1 / (1 + 0.04 * level), label: 'Taglia', icon: '✂️', fx: 'leaf' as const,
        onProgress: (p: number) => {
          bushes[i].rotation.y += 0.3;
          bushes[i].scale.setScalar(1.2 * (1 - p * 0.35));
        },
        onDone: () => {
          bushes[i].visible = false;
          run.prop(trimmedBush(), pos, 0, 1.2).userData.solid = true;
          const lp = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, 0.9));
          piles.push(lp);
          run.prop(leafPile(), lp, 0, 1.2).name = 'pile' + (piles.length - 1);
        },
      })),
    },
    {
      name: 'Raccogli le foglie', icon: '🍂',
      tasks: () => piles.map((pos, i) => ({
        pos, kind: 'tap' as const, label: 'Raccogli le foglie', icon: '🍂', fx: 'leaf' as const,
        onDone: () => {
          const o = game.scene.getObjectByName('pile' + i);
          if (o) o.visible = false;
          hold(game, cylProp(0.25, 0.45, 0x2e7d32));
        },
      })),
    },
    { name: 'Svuota il sacco nel bidone', icon: '🗑️', tasks: () => [{ pos: bin, kind: 'tap', label: 'Svuota nel bidone', icon: '🗑️', onDone: () => hold(game) }] },
  ];
  run = new PhasedRun(game, level, title, phases, { time: n * 6 + 30 });
  run.prop(toolbox(), box, 0, 1);
  run.prop(wheelieBin(), bin, 0, 1).userData.solid = true;
  for (const pos of spots) {
    const b = run.prop(bush(), pos, Math.random() * 6, 1.2);
    b.userData.solid = true;
    bushes.push(b);
  }
  // niente siepi tonde tra gli ostacoli: si confonderebbero con i cespugli da tagliare
  const kinds = [() => model(TREE_MODELS[1], 2.2), bigPlanter, patioSet, flowerBed];
  for (const pos of deco) {
    const k = kinds[Math.floor(Math.random() * kinds.length)];
    const o = run.prop(k(), pos, Math.random() * Math.PI * 2, 1);
    o.userData.noGlow = true;
    o.userData.solid = k !== flowerBed;
  }
  return run;
}

/**
 * Consegne e giornali come minigioco (scena separata, prima persona): una via del quartiere con le
 * case sui due lati. Ritira all'inizio della via (negozio dei pacchi o edicola) → consegna a ogni
 * cassetta segnata, in qualsiasi ordine → torna per la ricevuta. Più consegne = via più lunga.
 */
export function routeStreetJob(game: Game, level: number, street: Street, title: string, mode: 'package' | 'flyer') {
  const flyer = mode === 'flyer';
  const n = routeStops(level, mode);
  const pool = [...street.houses];
  const stops: StreetHouse[] = [];
  while (stops.length < n && pool.length) stops.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  const box = () => {
    const b = model('furniture/cardboardBoxClosed.glb', 2.2);
    b.position.x = -0.23;
    return b;
  };
  // pila di giornali piegati (quella che si porta in mano)
  const papers = () => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.26), new THREE.MeshLambertMaterial({ color: i % 2 ? 0xf5f0e1 : 0xffffff }));
      p.position.y = i * 0.06;
      p.rotation.y = (i - 1.5) * 0.08;
      g.add(p);
    }
    return g;
  };
  const counter = street.counter;
  const counterMark = street.counter.clone().add(new THREE.Vector3(1.6, 0, 0));
  const phases: Phase[] = [
    {
      name: flyer ? "Prendi i giornali all'edicola" : 'Ritira i pacchi al negozio', icon: flyer ? '📰' : '📦',
      tasks: () => [{ pos: counter, markerAt: counterMark, kind: 'tap', label: flyer ? 'Prendi i giornali' : 'Ritira i pacchi', icon: flyer ? '📰' : '📦', onDone: () => hold(game, flyer ? papers() : box()) }],
    },
    {
      name: flyer ? 'Imbuca un giornale in ogni cassetta' : 'Consegna a ogni indirizzo', icon: flyer ? '📬' : '🏠',
      tasks: () => stops.map((h) => ({ pos: h.stand, markerAt: h.box, kind: 'tap' as const, label: flyer ? 'Imbuca il giornale' : 'Consegna il pacco', icon: flyer ? '📬' : '📦' })),
    },
    {
      name: flyer ? "Torna all'edicola per la ricevuta" : 'Torna al negozio per la ricevuta', icon: '🧾',
      tasks: () => [{ pos: counter, markerAt: counterMark, kind: 'tap', label: 'Firma la ricevuta', icon: '🧾', onDone: () => hold(game) }],
    },
  ];
  // tempo: andata e ritorno lungo la via fino all'ultima casa, più un attimo per ogni cassetta
  const far = Math.max(...stops.map((h) => h.x)) - counter.x;
  const run = new PhasedRun(game, level, title, phases, { time: ((far * 2) / 4) * 1.5 + n * 3 + 12 });
  run.prop(flyer ? newsstand() : parcelShop(), street.shop, 0, 1).userData.noGlow = true;
  // cassette della posta: blu per i giornali, gialle per i pacchi (solo agli indirizzi da servire)
  for (const h of stops) run.prop(postbox(flyer ? 0x2d6cdb : 0xffc21a), h.box, h.rot, 1);
  return run;
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

  /** dentro (casa del cliente o cucina): il tutorial chiede a questa scena cosa fare */
  indoorGuide: (() => RunGuide | null) | null = null;

  constructor(game: Game, level: number, private dest: Slot, title: string, private onEnter: () => void, private where = 'dal cliente', private enterLabel = 'Entra in casa') {
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
    this.status = `Vai ${this.where} · ${Math.round(d)} m`;
    this.game.prompt = d < this.reach() ? { label: this.enterLabel, icon: '🚪', at: this.dest.pos.clone().setY(1.2) } : null;
  }

  guide(): RunGuide | null {
    if (this.inside) return this.indoorGuide?.() ?? null;
    const p = this.game.player.root.position;
    const near = Math.hypot(this.dest.pos.x - p.x, this.dest.pos.z - p.z) < this.reach();
    return {
      phase: 0, phases: 1, phaseName: this.enterLabel, phaseIcon: '🚪', left: 1,
      task: { pos: this.dest.pos, kind: 'tap', label: this.enterLabel, icon: '🚪' }, near, inZone: true, arrived: true,
    };
  }

  onAction() {
    const p = this.game.player.root.position;
    if (this.inside || Math.hypot(this.dest.pos.x - p.x, this.dest.pos.z - p.z) > this.reach()) return;
    this.inside = true;
    this.game.prompt = null;
    this.onEnter();
  }
}
