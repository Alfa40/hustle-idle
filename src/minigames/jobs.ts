import * as THREE from 'three';
import { model } from '../assets';
import { JOB } from '../config/balance';
import type { Game } from '../game';
import { DIR_VEC, type Slot } from '../world/city';
import { WS } from '../config/map';
import type { ParticleKind } from '../world/particles';
import { arrow, boxProp, bush, cone, cylProp, label, leafPile, ring, trimmedBush } from '../world/props';
import { bigPlanter, fencePillar, fenceSegment, flowerBed, hoseReel, newsstand, paintKit, parcelShop, patioSet, postbox, ragBucket, roundShrub, slide, soapSprayer, tarpFor, toolbox, wheelieBin } from '../world/jobprops';

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

  /** Luce che pulsa sugli oggetti ancora da usare (solo quelli attivi adesso). */
  private pulseGlows() {
    const pend = new Set(this.pending());
    // colore più chiaro e vivo che pulsa
    const k = 0.1 + 0.5 * (0.5 + 0.5 * Math.sin(performance.now() / 200));
    for (const [t, g] of this.glows) {
      const on = pend.has(t) && !t.done;
      for (const { m } of g.meshes) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) (mat as THREE.MeshLambertMaterial).emissiveIntensity = on ? k : 0;
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
      this.game.prompt = { label: `Tieni premuto: ${near.label}`, icon: near.icon, progress: near.progress ?? 0, at };
    } else {
      this.game.prompt = { label: near.label, icon: near.icon, at };
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

/** Sistema di riferimento davanti a un edificio: `f` verso la strada, `r` di lato. */
function frame(slot: Slot) {
  const [dx, dz] = DIR_VEC[slot.dir];
  // f e r sono in "metri di tessera": si allargano con la scala del mondo (WS)
  return (base: THREE.Vector3, f: number, r: number) => new THREE.Vector3(base.x + (dx * f + dz * r) * WS, 0, base.z + (dz * f - dx * r) * WS);
}

/**
 * Distanza (verso la strada) del fronte dell'edificio di questa tessera:
 * il cortile di lavoro inizia lì, così nessun punto finisce sotto al tetto.
 */
function frontEdge(game: Game, slot: Slot) {
  const [dx, dz] = DIR_VEC[slot.dir];
  let best = 0.6;
  for (const b of game.city.colliders) {
    const inside = slot.center.x > b.minX - 0.5 && slot.center.x < b.maxX + 0.5 && slot.center.z > b.minZ - 0.5 && slot.center.z < b.maxZ + 0.5;
    if (!inside) continue;
    for (const x of [b.minX, b.maxX]) for (const z of [b.minZ, b.maxZ]) best = Math.max(best, (x - slot.center.x) * dx + (z - slot.center.z) * dz);
  }
  return Math.min(best / WS, 2.2);
}

/** Zona rettangolare davanti a un edificio: da `f0` a `f1` verso la strada, da -`r` a +`r` di lato. */
function zoneFor(slot: Slot, base: THREE.Vector3, f0: number, f1: number, r: number): Zone {
  const [dx, dz] = DIR_VEC[slot.dir];
  const fm = ((f0 + f1) / 2) * WS;
  return {
    center: new THREE.Vector3(base.x + dx * fm, 0, base.z + dz * fm),
    dir: new THREE.Vector3(dx, 0, dz),
    side: new THREE.Vector3(dz, 0, -dx),
    halfF: ((f1 - f0) / 2) * WS,
    halfR: r * WS,
  };
}

const WHITE = new THREE.Color(0xffffff);
const hold = (game: Game, obj?: THREE.Object3D) => game.player.hold(obj);

/** Giardinaggio: attrezzi → taglia i cespugli → raccogli le foglie → svuota nel bidone. */
export function gardenJob(game: Game, level: number, slot: Slot, title: string) {
  const at = frame(slot);
  const f0 = frontEdge(game, slot) + 0.3;
  const n = Math.min(8, 3 + Math.floor(level / 2));
  const spots: THREE.Vector3[] = [];
  for (let i = 0; i < 60 && spots.length < n; i++) {
    const v = at(slot.center, f0 + 0.3 + Math.random() * Math.max(0.2, 2.8 - f0 - 0.3), (Math.random() - 0.5) * 3.8);
    if (spots.every((s) => s.distanceTo(v) > 1.15) && v.distanceTo(slot.pos) > 1) spots.push(v);
  }
  let run: PhasedRun;
  const bushes: THREE.Object3D[] = [];
  const piles: THREE.Vector3[] = [];
  const box = at(slot.center, 2.7, 2.6);
  const bin = at(slot.center, 2.7, -2.6);
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
          bushes[i].scale.setScalar(1 - p * 0.35);
        },
        onDone: () => {
          bushes[i].visible = false;
          run.prop(trimmedBush(), pos);
          // le foglie tagliate cadono accanto
          const lp = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8));
          piles.push(lp);
          run.prop(leafPile(), lp).name = 'pile' + (piles.length - 1);
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
    {
      name: 'Svuota il sacco nel bidone', icon: '🗑️',
      tasks: () => [{ pos: bin, kind: 'tap', label: 'Svuota nel bidone', icon: '🗑️', onDone: () => hold(game) }],
    },
  ];
  run = new PhasedRun(game, level, title, phases, { zone: zoneFor(slot, slot.center, f0 - 0.2, 3.1, 2.95), time: n * 5 + 16, keep: slot.center });
  const [gx, gz] = DIR_VEC[slot.dir];
  run.prop(toolbox(), box, Math.atan2(gx, gz), 1);
  run.prop(wheelieBin(), bin, Math.atan2(gx, gz), 1);
  for (const pos of spots) bushes.push(run.prop(bush(), pos));
  return run;
}

/** Consegne e volantini: ritira in negozio → consegna agli indirizzi (in qualsiasi ordine) → torna per la ricevuta. */
export function routeJob(game: Game, level: number, start: Slot, title: string, mode: 'package' | 'flyer') {
  const houses = [...game.deliveryHouses];
  const n = mode === 'package' ? Math.min(4, 2 + Math.floor(level / 3)) : Math.min(8, 4 + Math.floor(level / 2));
  const sorted = houses.filter((h) => h.pos.distanceTo(start.pos) > (mode === 'package' ? 18 : 6) * WS).sort((a, b) => a.pos.distanceTo(start.pos) - b.pos.distanceTo(start.pos));
  const pool = mode === 'package' ? sorted.slice(0, 14) : sorted.slice(0, n + 3);
  const stops: Slot[] = [];
  while (stops.length < n && pool.length) stops.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  let dist = 0;
  let from = start.pos;
  for (const s of stops) {
    dist += Math.abs(s.pos.x - from.x) + Math.abs(s.pos.z - from.z);
    from = s.pos;
  }
  dist += Math.abs(start.pos.x - from.x) + Math.abs(start.pos.z - from.z);
  const flyer = mode === 'flyer';
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
  const face = (s: Slot) => Math.atan2(DIR_VEC[s.dir][0], DIR_VEC[s.dir][1]);
  const at = frame(start);
  // il punto di ritiro è una vera attività sul marciapiede, accanto a chi ti dà il lavoro
  const shopPos = at(start.pos, 0.15, 1.9);
  const counter = at(start.pos, 1.15, 1.9);
  // l'indicatore del ritiro sta accanto al chiosco (sopra coprirebbe l'insegna)
  const counterMark = at(start.pos, 1.0, 0.1);
  // la cassetta di ogni indirizzo sta accanto al vialetto, verso la strada
  const boxes = stops.map((s) => ({ s, pos: frame(s)(s.pos, 0.55, 1.05) }));
  const front = (b: { s: Slot; pos: THREE.Vector3 }) => frame(b.s)(b.pos, 0.55, 0);
  const phases: Phase[] = [
    {
      name: flyer ? 'Prendi i giornali all\'edicola' : 'Ritira i pacchi al negozio', icon: flyer ? '📰' : '📦',
      tasks: () => [{ pos: counter, markerAt: counterMark, kind: 'tap', label: flyer ? 'Prendi i giornali' : 'Ritira i pacchi', icon: flyer ? '📰' : '📦', onDone: () => hold(game, flyer ? papers() : box()) }],
    },
    {
      name: flyer ? 'Imbuca un giornale in ogni cassetta' : 'Consegna a ogni indirizzo', icon: flyer ? '📬' : '🏠',
      tasks: () => boxes.map((b) => ({ pos: front(b), kind: 'tap' as const, label: flyer ? 'Imbuca il giornale' : 'Consegna il pacco', icon: flyer ? '📬' : '📦' })),
    },
    {
      name: flyer ? 'Torna all\'edicola per la ricevuta' : 'Torna al negozio per la ricevuta', icon: '🧾',
      tasks: () => [{ pos: counter, markerAt: counterMark, kind: 'tap', label: 'Firma la ricevuta', icon: '🧾', onDone: () => hold(game) }],
    },
  ];
  const run = new PhasedRun(game, level, title, phases, { time: (dist / 5.2) * (flyer ? 1.35 : 1.45) + 6 + n * 2 });
  run.prop(flyer ? newsstand() : parcelShop(), shopPos, face(start), 1);
  // cassette della posta: blu per i giornali, gialle per i pacchi
  for (const b of boxes) run.prop(postbox(flyer ? 0x2d6cdb : 0xffc21a), b.pos, face(b.s), 1);
  return run;
}

/**
 * Lavaggio auto: prendi lo spruzzino e spruzza il sapone su tutta l'auto (4 lati) →
 * prendi la canna e fai il giro dell'auto sciacquandola (in ordine, tutto attorno) →
 * prendi lo straccio e asciuga ogni lato finché brilla.
 */
export function carWashJob(game: Game, level: number, slot: Slot, title: string) {
  const at = frame(slot);
  const f0 = frontEdge(game, slot) + 0.3;
  const cf = Math.max(2.05, f0 + 0.95);
  const carPos = at(slot.center, cf, 0);
  // i 4 lati, nell'ordine del giro: muso, lato strada, coda, lato casa
  const sides = [at(slot.center, cf, 2.15), at(slot.center, cf + 1.0, 0), at(slot.center, cf, -2.15), at(slot.center, cf - 1.0, 0)];
  const sideNames = ['il muso', 'il lato strada', 'la coda', 'il lato casa'];
  const onSide = ['sul muso', 'sul lato strada', 'sulla coda', 'sul lato casa'];
  const sprayer = at(slot.center, 3.35, 2.8);
  const reel = at(slot.center, 3.35, -2.8);
  const rags = at(slot.center, 3.35, 1.6);
  const [dx, dz] = DIR_VEC[slot.dir];
  const face = Math.atan2(dx, dz);
  let run: PhasedRun;
  const foams: THREE.Object3D[] = [];
  const drops: THREE.Object3D[] = [];
  const sp = 1 + 0.04 * level;
  // schiuma che copre un lato dell'auto (tra il punto e il centro dell'auto)
  const foamAt = (i: number) => {
    const f = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    const mid = sides[i].clone().lerp(carPos, 0.62);
    for (let k = 0; k < 12; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.14 + Math.random() * 0.1, 8, 6), mat);
      m.position.set((Math.random() - 0.5) * (i % 2 ? 1.6 : 0.7), 0.45 + Math.random() * 0.7, (Math.random() - 0.5) * (i % 2 ? 0.4 : 1.2));
      f.add(m);
    }
    return run.prop(f, mid, i % 2 ? face + Math.PI / 2 : face, 1);
  };
  // gocce d'acqua dopo il risciacquo (spariscono asciugando)
  const dropsAt = (i: number) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.8 });
    for (let k = 0; k < 10; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), mat);
      m.position.set((Math.random() - 0.5) * (i % 2 ? 1.6 : 0.7), 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * (i % 2 ? 0.4 : 1.2));
      g.add(m);
    }
    return run.prop(g, sides[i].clone().lerp(carPos, 0.62), i % 2 ? face + Math.PI / 2 : face, 1);
  };
  const phases: Phase[] = [
    { name: 'Prendi lo spruzzino del sapone', icon: '🧴', tasks: () => [{ pos: sprayer, kind: 'tap', label: 'Prendi lo spruzzino', icon: '🧴', onDone: () => hold(game, cylProp(0.12, 0.35, 0xff6fae)) }] },
    {
      name: 'Spruzza il sapone su tutta l\'auto', icon: '🫧',
      tasks: () => sides.map((pos, i) => ({
        pos, kind: 'hold' as const, sec: 1.1 / sp, label: `Spruzza ${onSide[i]}`, icon: '🫧', fx: 'bubble' as const,
        onDone: () => { foams[i] = foamAt(i); },
      })),
    },
    { name: 'Prendi la canna dell\'acqua', icon: '🚿', tasks: () => [{ pos: reel, kind: 'tap', label: 'Prendi la canna', icon: '🚿', onDone: () => hold(game, cylProp(0.05, 0.6, 0x43a047)) }] },
    {
      // giro dell'auto in ordine: si sciacqua tutto attorno
      name: 'Fai il giro e risciacqua', icon: '💦', ordered: true,
      tasks: () => sides.map((pos, i) => ({
        pos, kind: 'hold' as const, sec: 1 / sp, label: `Risciacqua ${sideNames[i]}`, icon: '💦', fx: 'bubble' as const, fxColor: 0x6ec6ff,
        onProgress: (p: number) => foams[i]?.scale.setScalar(Math.max(0.05, 1 - p)),
        onDone: () => {
          if (foams[i]) foams[i].visible = false;
          drops[i] = dropsAt(i);
        },
      })),
    },
    { name: 'Prendi lo straccio', icon: '🧽', tasks: () => [{ pos: rags, kind: 'tap', label: 'Prendi lo straccio', icon: '🧽', onDone: () => hold(game, boxProp(0.25, 0.06, 0.3, 0xffc21a)) }] },
    {
      name: 'Asciuga tutta l\'auto', icon: '✨',
      tasks: () => sides.map((pos, i) => ({
        pos, kind: 'hold' as const, sec: 0.9 / sp, label: `Asciuga ${sideNames[i]}`, icon: '✨', fx: 'spark' as const,
        onProgress: (p: number) => drops[i]?.scale.setScalar(Math.max(0.05, 1 - p)),
        onDone: () => { if (drops[i]) drops[i].visible = false; },
      })),
    },
  ];
  run = new PhasedRun(game, level, title, phases, { zone: zoneFor(slot, slot.center, f0 - 0.2, Math.max(3.7, cf + 1.6), 3.2), time: 44, keep: slot.center });
  const car = model('cars/sedan.glb', 1);
  // l'auto è parcheggiata di traverso, parallela alla casa
  run.prop(car, carPos, Math.atan2(dz, -dx), 1).userData.noGlow = true;
  run.prop(soapSprayer(), sprayer, face, 1);
  run.prop(hoseReel(), reel, face, 1);
  run.prop(ragBucket(), rags, face, 1);
  return run;
}

/**
 * Imbianchino: il muretto è la recinzione del giardino davanti alla casa (lì c'è spazio:
 * dietro la casa arriva quasi al confine). Nel giardino ci sono cespugli, aiuole, giochi,
 * tavolino… Prima si copre tutto con teloni su misura, poi si prende la vernice, si dipinge
 * ogni tratto del muretto e alla fine si tolgono i teloni.
 */
export function paintJob(game: Game, level: number, slot: Slot, title: string) {
  const at = frame(slot);
  const f0 = Math.max(1.15, frontEdge(game, slot) + 0.15);
  const FENCE = 2.85; // confine del lotto, verso il marciapiede
  const SIDE = 2.85;
  const colors = [0xff8a3d, 0x2d9cdb, 0x35c46a, 0x8e5bd6, 0xffc21a, 0xe84393];
  const col = colors[Math.floor(Math.random() * colors.length)];
  const [dx, dz] = DIR_VEC[slot.dir];
  const along = Math.atan2(dx, dz); // ruota un oggetto "di fronte alla strada"
  let run: PhasedRun;
  // ---- recinzione: davanti (con il cancello in mezzo) e sui due lati
  const segs: { pos: THREE.Vector3; rot: number; len: number; inner: THREE.Vector3 }[] = [];
  for (const sgn of [-1, 1]) {
    for (const r of [0.55 + 0.6, 0.55 + 1.75]) {
      // davanti: due tratti per parte, tra il cancello (|r| < 0.55) e l'angolo
      segs.push({ pos: at(slot.center, FENCE, sgn * r), rot: along, len: 1.12, inner: at(slot.center, FENCE - 0.75, sgn * r) });
    }
  }
  const sideLen = FENCE - f0;
  const sideSegs = sideLen > 1.3 ? 2 : 1;
  for (const sgn of [-1, 1]) {
    for (let k = 0; k < sideSegs; k++) {
      const f = f0 + (sideLen * (k + 0.5)) / sideSegs;
      segs.push({ pos: at(slot.center, f, sgn * SIDE), rot: along + Math.PI / 2, len: sideLen / sideSegs - 0.05, inner: at(slot.center, f, sgn * (SIDE - 0.75)) });
    }
  }
  // tratti da dipingere: il davanti sempre, i lati dai livelli più alti
  const paintN = Math.min(segs.length, 4 + Math.floor(level / 2) * 2);
  const toPaint = segs.slice(0, paintN);
  // ---- cose in giardino (si coprono tutte): sempre qualcosa di diverso
  const kinds = [roundShrub, flowerBed, slide, patioSet, bigPlanter, flowerBed];
  const nItems = Math.min(4, 2 + Math.floor(level / 3));
  const fMid = f0 + (FENCE - 0.5 - f0) * 0.5;
  const spots = [at(slot.center, fMid, -1.85), at(slot.center, fMid, 1.85), at(slot.center, fMid, -1.0), at(slot.center, fMid, 1.0)];
  const pool = [...kinds].sort(() => Math.random() - 0.5);
  // le cose del giardino si creano subito (la prima fase le deve già conoscere); in scena dopo
  const items: { pos: THREE.Vector3; obj: THREE.Object3D; tarp: THREE.Object3D }[] = [];
  for (let i = 0; i < nItems; i++) {
    const obj = pool[i % pool.length]();
    obj.rotation.y = along;
    obj.position.copy(spots[i]);
    obj.updateMatrixWorld(true);
    const tarp = tarpFor(obj);
    tarp.visible = false;
    items.push({ pos: spots[i], obj, tarp });
  }
  const cans = at(slot.center, FENCE - 0.55, 0);
  const phases: Phase[] = [
    {
      name: 'Copri il giardino con i teloni', icon: '🛡️',
      tasks: () => items.map((it) => ({
        pos: it.pos, kind: 'tap' as const, label: 'Copri con il telone', icon: '🛡️',
        onDone: () => dropTarp(it.tarp),
      })),
    },
    { name: 'Prendi la vernice', icon: '🪣', tasks: () => [{ pos: cans, kind: 'tap', label: 'Prendi la vernice', icon: '🪣', onDone: () => hold(game, cylProp(0.16, 0.25, col)) }] },
    {
      name: 'Dipingi ogni tratto del muretto', icon: '🖌️',
      tasks: () => toPaint.map((sg, i) => ({
        pos: sg.inner, kind: 'hold' as const, sec: 1.3 / (1 + 0.04 * level), label: 'Dipingi', icon: '🖌️', fx: 'paint' as const, fxColor: col,
        onProgress: (p: number) => (bodies[i].material as THREE.MeshLambertMaterial).color.lerpColors(new THREE.Color(0x9e9e9e), new THREE.Color(col), p),
      })),
    },
    {
      name: 'Togli i teloni', icon: '🧹',
      tasks: () => items.map((it) => ({ pos: it.pos, kind: 'tap' as const, label: 'Togli il telone', icon: '🧹', onDone: () => { it.tarp.visible = false; hold(game); } })),
    },
  ];
  run = new PhasedRun(game, level, title, phases, { zone: zoneFor(slot, slot.center, f0 - 0.2, FENCE + 0.35, SIDE + 0.25), time: paintN * 4 + nItems * 6 + 18, keep: slot.center });
  // il telone cala dall'alto sull'oggetto
  const dropTarp = (t: THREE.Object3D) => {
    t.visible = true;
    const start = performance.now();
    const y0 = 1.2;
    const anim = () => {
      const k = Math.min(1, (performance.now() - start) / 350);
      t.position.y = y0 * (1 - k) * (1 - k);
      t.scale.y = 0.4 + 0.6 * k;
      if (k < 1) requestAnimationFrame(anim);
    };
    anim();
  };
  const bodies: THREE.Mesh[] = [];
  segs.forEach((sg, i) => {
    const { obj, body } = fenceSegment(sg.len * WS);
    run.prop(obj, sg.pos, sg.rot, 1);
    if (i < paintN) bodies.push(body);
  });
  // pilastri: agli angoli e ai lati del cancello
  for (const r of [-SIDE, -0.55, 0.55, SIDE]) run.prop(fencePillar(), at(slot.center, FENCE, r), along, 1).userData.noGlow = true;
  for (const it of items) {
    run.prop(it.obj, it.pos, along, 1);
    run.prop(it.tarp, it.pos.clone(), 0, 1);
  }
  run.prop(paintKit(col), cans, along, 1);
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
