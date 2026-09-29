import * as THREE from 'three';
import { model } from '../assets';
import { JOB } from '../config/balance';
import type { Game } from '../game';
import { DIR_VEC, type Slot } from '../world/city';
import type { ParticleKind } from '../world/particles';
import { arrow, boxProp, bush, cone, cylProp, flyerStand, foam, label, leafPile, mailbox, plateStack, ring, trimmedBush } from '../world/props';

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
    this.timeTotal = this.timeLeft = opts.time * Math.max(0.75, 1 - level * 0.02);
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
    this.banner();
    for (const t of this.tasks) {
      this.addGlow(t);
      const m = label(t.icon, { bg: '#ffffff', fg: '#000', scale: 0.45 });
      m.position.set(t.pos.x, 2.3, t.pos.z);
      this.game.scene.add(m);
      this.markers.set(t, m);
    }
  }

  /**
   * Cartello grande al centro a ogni nuova fase: numero, cosa fare e il gesto
   * (tocca / tieni premuto), così non serve leggere la barra in alto.
   */
  private bannerEl: HTMLDivElement | null = null;
  private banner() {
    const ph = this.phases[this.idx];
    this.bannerEl?.remove();
    const el = document.createElement('div');
    el.className = 'phase-banner';
    const n = this.tasks.length;
    const hold = this.tasks.some((t) => t.kind === 'hold');
    const how = hold ? '✊ Avvicinati e <b>TIENI PREMUTO</b> il pulsante' : '👆 Avvicinati e <b>TOCCA</b> il pulsante';
    const many = n > 1 ? `<br>${ph.ordered ? `${n} passaggi, in ordine` : `${n} punti: quelli colorati che si accendono`}` : '';
    el.innerHTML = `<div class="pb-n">Fase ${this.idx + 1} di ${this.phases.length}</div><div class="pb-icon">${ph.icon}</div><div class="pb-name">${ph.name}</div><div class="pb-how">${how}${many}</div>`;
    document.body.appendChild(el);
    this.bannerEl = el;
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => {
      el.remove();
      if (this.bannerEl === el) this.bannerEl = null;
    }, 3000);
  }

  private pending() {
    const p = this.tasks.filter((t) => !t.done);
    return this.phases[this.idx]?.ordered ? p.slice(0, 1) : p;
  }

  private reach() {
    return this.game.riding ? 3 : 1.6;
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
      m.position.y = 2.3 + Math.sin(t0 + t.pos.x) * 0.12;
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
      this.game.prompt = { label: `Tieni premuto: ${near.label}`, icon: near.icon, progress: near.progress ?? 0 };
    } else {
      this.game.prompt = { label: near.label, icon: near.icon };
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
    this.bannerEl?.remove();
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
  return (base: THREE.Vector3, f: number, r: number) => new THREE.Vector3(base.x + dx * f + dz * r, 0, base.z + dz * f - dx * r);
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
  return Math.min(best, 2.2);
}

/** Zona rettangolare davanti a un edificio: da `f0` a `f1` verso la strada, da -`r` a +`r` di lato. */
function zoneFor(slot: Slot, base: THREE.Vector3, f0: number, f1: number, r: number): Zone {
  const [dx, dz] = DIR_VEC[slot.dir];
  const fm = (f0 + f1) / 2;
  return {
    center: new THREE.Vector3(base.x + dx * fm, 0, base.z + dz * fm),
    dir: new THREE.Vector3(dx, 0, dz),
    side: new THREE.Vector3(dz, 0, -dx),
    halfF: (f1 - f0) / 2,
    halfR: r,
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
  run.prop(boxProp(0.7, 0.45, 0.45, 0xd32f2f), box);
  run.prop(cylProp(0.35, 1, 0x2e7d32), bin);
  for (const pos of spots) bushes.push(run.prop(bush(), pos));
  return run;
}

/** Consegne e volantini: ritira in negozio → consegna agli indirizzi (in qualsiasi ordine) → torna per la ricevuta. */
export function routeJob(game: Game, level: number, start: Slot, title: string, mode: 'package' | 'flyer') {
  const houses = [...game.deliveryHouses];
  const n = mode === 'package' ? Math.min(4, 2 + Math.floor(level / 3)) : Math.min(8, 4 + Math.floor(level / 2));
  const sorted = houses.filter((h) => h.pos.distanceTo(start.pos) > (mode === 'package' ? 18 : 6)).sort((a, b) => a.pos.distanceTo(start.pos) - b.pos.distanceTo(start.pos));
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
  const phases: Phase[] = [
    {
      name: flyer ? 'Prendi i volantini' : 'Carica i pacchi', icon: flyer ? '📰' : '📦',
      tasks: () => [{ pos: start.pos, kind: 'tap', label: flyer ? 'Prendi i volantini' : 'Carica i pacchi', icon: flyer ? '📰' : '📦', onDone: () => hold(game, flyer ? boxProp(0.3, 0.1, 0.4, 0xffffff) : box()) }],
    },
    {
      name: flyer ? 'Imbuca in ogni cassetta' : 'Consegna a ogni indirizzo', icon: flyer ? '📬' : '🏠',
      tasks: () => stops.map((s) => ({ pos: s.pos, kind: 'tap' as const, label: flyer ? 'Imbuca il volantino' : 'Consegna il pacco', icon: flyer ? '📬' : '📦' })),
    },
    {
      name: 'Torna in negozio per la ricevuta', icon: '🧾',
      tasks: () => [{ pos: start.pos, kind: 'tap', label: 'Firma la ricevuta', icon: '🧾', onDone: () => hold(game) }],
    },
  ];
  const run = new PhasedRun(game, level, title, phases, { time: (dist / 5.2) * (flyer ? 1.35 : 1.45) + 6 + n * 2 });
  // al negozio: espositore dei volantini o pila di pacchi, accanto a chi ti dà il lavoro
  const face = (s: Slot) => Math.atan2(DIR_VEC[s.dir][0], DIR_VEC[s.dir][1]);
  const at = frame(start);
  if (flyer) run.prop(flyerStand(), at(start.pos, 0.1, 0.8), face(start), 0.85);
  else {
    const pile = new THREE.Group();
    [[0, 0, 0], [0.42, 0, 0.05], [0.2, 0.4, 0.02]].forEach(([x, y, z]) => {
      const b = box();
      b.position.set(x - 0.2, y, z);
      pile.add(b);
    });
    run.prop(pile, at(start.pos, 0.1, 0.8), face(start), 0.9);
  }
  // a ogni indirizzo una cassetta della posta su palo accanto alla porta
  for (const s of stops) run.prop(mailbox(flyer ? 0x2d9cdb : 0xffc21a), frame(s)(s.pos, 0.1, 0.7), face(s), 0.9);
  return run;
}

/** Lavapiatti: per ogni tavolo prendi i piatti sporchi → lava al lavello → appoggia sullo scolapiatti. */
export function dishJob(game: Game, level: number, slot: Slot, title: string) {
  const at = frame(slot);
  const tables = Math.min(4, 2 + Math.floor(level / 3));
  const sink = at(slot.pos, 0.3, -3.1);
  const rack = at(slot.pos, 0.3, 3.1);
  let run: PhasedRun;
  const tpos: THREE.Vector3[] = [];
  const stacks: THREE.Object3D[] = [];
  const clean: THREE.Object3D[] = [];
  for (let i = 0; i < tables; i++) tpos.push(at(slot.pos, 0.6, (i - (tables - 1) / 2) * 1.45));
  const phases: Phase[] = [];
  for (let i = 0; i < tables; i++) {
    phases.push({
      name: `Tavolo ${i + 1}: raccogli, lava, asciuga`, icon: '🍽️', ordered: true,
      tasks: () => [
        { pos: tpos[i], kind: 'tap', label: 'Prendi i piatti sporchi', icon: '🍽️', onDone: () => { stacks[i].visible = false; hold(game, plateStack(4, true)); } },
        { pos: sink, kind: 'hold', sec: 1.6 / (1 + 0.04 * level), label: 'Lava i piatti', icon: '🫧', fx: 'bubble', onDone: () => hold(game, plateStack(4, false)) },
        { pos: rack, kind: 'tap', label: 'Appoggia sullo scolapiatti', icon: '✨', onDone: () => { hold(game); clean[i].visible = true; } },
      ],
    });
  }
  run = new PhasedRun(game, level, title, phases, { zone: zoneFor(slot, slot.pos, -0.4, 1.4, 3.7), time: tables * 11 + 6, keep: slot.center });
  for (let i = 0; i < tables; i++) {
    run.prop(boxProp(0.7, 0.75, 0.7, 0xffffff), tpos[i]);
    const st = plateStack(4, true);
    st.position.y = 0.76;
    const g = new THREE.Group();
    g.add(st);
    stacks.push(run.prop(g, tpos[i]));
  }
  run.prop(boxProp(1.1, 0.9, 0.7, 0x90a4ae), sink);
  const water = boxProp(0.8, 0.02, 0.45, 0x5fa8d3);
  run.prop(water, sink).position.y = 0.9 * PROP_SCALE;
  run.prop(boxProp(1.1, 1.1, 0.4, 0xbcaaa4), rack);
  for (let i = 0; i < tables; i++) {
    const c = plateStack(4, false);
    const g = new THREE.Group();
    c.position.set(-0.4 + i * 0.25, 1.1, 0);
    c.rotation.z = Math.PI / 2.4;
    g.add(c);
    g.visible = false;
    clean.push(run.prop(g, rack));
  }
  const tag = label('🍽️ Dehors del ristorante', { bg: '#ff9f6e', scale: 0.4 });
  run.prop(tag, at(slot.pos, 0.3, 0), 0, 1).position.y = 2.6;
  return run;
}

/** Lavaggio auto: secchio → insapona i 4 lati → canna dell'acqua → risciacqua i 4 lati. */
export function carWashJob(game: Game, level: number, slot: Slot, title: string) {
  const at = frame(slot);
  const f0 = frontEdge(game, slot) + 0.3;
  const cf = Math.max(2.05, f0 + 0.85);
  const carPos = at(slot.center, cf, 0);
  const sides = [at(slot.center, cf, 2), at(slot.center, cf, -2), at(slot.center, cf + 1.05, 0.7), at(slot.center, cf + 1.05, -0.7)];
  const bucket = at(slot.center, 3.3, 2.7);
  const hose = at(slot.center, 3.3, -2.7);
  let run: PhasedRun;
  const foams: THREE.Object3D[] = [];
  const phases: Phase[] = [
    { name: 'Prendi secchio e spugna', icon: '🪣', tasks: () => [{ pos: bucket, kind: 'tap', label: 'Prendi il secchio', icon: '🪣', onDone: () => hold(game, cylProp(0.2, 0.3, 0x2d9cdb)) }] },
    {
      name: 'Insapona ogni lato', icon: '🧽',
      tasks: () => sides.map((pos, i) => ({
        pos, kind: 'hold' as const, sec: 1.2 / (1 + 0.04 * level), label: 'Insapona', icon: '🧽', fx: 'bubble' as const,
        onDone: () => {
          const f = foam();
          const mid = pos.clone().lerp(carPos, 0.55);
          foams[i] = run.prop(f, mid);
        },
      })),
    },
    { name: 'Prendi la canna dell\'acqua', icon: '🚿', tasks: () => [{ pos: hose, kind: 'tap', label: 'Prendi la canna', icon: '🚿', onDone: () => hold(game, cylProp(0.06, 0.6, 0x35c46a)) }] },
    {
      name: 'Risciacqua ogni lato', icon: '💦',
      tasks: () => sides.map((pos, i) => ({
        pos, kind: 'hold' as const, sec: 1 / (1 + 0.04 * level), label: 'Risciacqua', icon: '💦', fx: 'bubble' as const, fxColor: 0x6ec6ff,
        onProgress: (p: number) => foams[i]?.scale.setScalar(Math.max(0.05, 1 - p)),
        onDone: () => { if (foams[i]) foams[i].visible = false; },
      })),
    },
  ];
  run = new PhasedRun(game, level, title, phases, { zone: zoneFor(slot, slot.center, f0 - 0.2, Math.max(3.6, cf + 1.6), 3.1), time: 30, keep: slot.center });
  const car = model('cars/sedan.glb', 1);
  const [dx, dz] = DIR_VEC[slot.dir];
  // l'auto è parcheggiata di traverso, parallela alla casa
  run.prop(car, carPos, Math.atan2(dz, -dx), 1);
  run.prop(cylProp(0.28, 0.4, 0x607d8b), bucket);
  run.prop(new THREE.Group().add(cylProp(0.35, 0.12, 0x35c46a)), hose);
  return run;
}

/** Imbianchino: copri le piante coi teli → prendi la vernice → dipingi ogni pannello → togli i teli. */
export function paintJob(game: Game, level: number, slot: Slot, title: string) {
  const at = frame(slot);
  const f0 = frontEdge(game, slot) + 0.3;
  const n = Math.min(5, 3 + Math.floor(level / 3));
  const panels: THREE.Mesh[] = [];
  const ppos: THREE.Vector3[] = [];
  const plants = [at(slot.center, Math.max(2.5, f0 + 0.9), 2.6), at(slot.center, Math.max(2.5, f0 + 0.9), -2.6)];
  const cans = at(slot.center, Math.max(2.9, f0 + 1.3), 1.2);
  const colors = [0xff8a3d, 0x2d9cdb, 0x35c46a, 0x8e5bd6, 0xffc21a];
  const col = colors[Math.floor(Math.random() * colors.length)];
  let run: PhasedRun;
  const tarps: THREE.Object3D[] = [];
  for (let i = 0; i < n; i++) ppos.push(at(slot.center, f0 + 0.1, (i - (n - 1) / 2) * 1.02));
  const phases: Phase[] = [
    {
      name: 'Copri le piante con i teli', icon: '🪴',
      tasks: () => plants.map((pos, i) => ({ pos, kind: 'tap' as const, label: 'Copri con il telo', icon: '🪴', onDone: () => { tarps[i].visible = true; } })),
    },
    { name: 'Prendi la vernice', icon: '🪣', tasks: () => [{ pos: cans, kind: 'tap', label: 'Prendi la vernice', icon: '🪣', onDone: () => hold(game, cylProp(0.16, 0.25, col)) }] },
    {
      name: 'Dipingi ogni tratto del muretto', icon: '🖌️',
      tasks: () => ppos.map((pos, i) => ({
        pos: at(pos, 0.8, 0), kind: 'hold' as const, sec: 1.3 / (1 + 0.04 * level), label: 'Dipingi', icon: '🖌️', fx: 'paint' as const, fxColor: col,
        onProgress: (p: number) => (panels[i].material as THREE.MeshLambertMaterial).color.lerpColors(new THREE.Color(0x9e9e9e), new THREE.Color(col), p),
      })),
    },
    {
      name: 'Togli i teli e metti in ordine', icon: '🧹',
      tasks: () => plants.map((pos, i) => ({ pos, kind: 'tap' as const, label: 'Togli il telo', icon: '🧹', onDone: () => { tarps[i].visible = false; hold(game); } })),
    },
  ];
  run = new PhasedRun(game, level, title, phases, { zone: zoneFor(slot, slot.center, f0 - 0.3, Math.max(3.3, f0 + 1.8), 3.2), time: n * 4.5 + 22, keep: slot.center });
  const [dx, dz] = DIR_VEC[slot.dir];
  for (const pos of ppos) {
    // segmento di muretto: spesso abbastanza da vedere il colore anche dall'alto
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.9, 0.5), new THREE.MeshLambertMaterial({ color: 0x9e9e9e }));
    m.position.y = 0.45;
    m.castShadow = true;
    const g = new THREE.Group();
    g.add(m);
    panels.push(m);
    run.prop(g, pos, Math.atan2(dx, dz));
  }
  for (const pos of plants) {
    run.prop(bush(), pos);
    const t = boxProp(1, 0.9, 1, 0xe0e0e0);
    t.visible = false;
    tarps.push(run.prop(t, pos));
  }
  run.prop(cylProp(0.18, 0.3, col), cans);
  run.prop(cylProp(0.18, 0.3, 0xffffff), cans.clone().add(new THREE.Vector3(0.4, 0, 0)));
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
