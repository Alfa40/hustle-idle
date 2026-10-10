import * as THREE from 'three';
import { model } from '../assets';
import { JOB } from '../config/balance';
import type { Game } from '../game';
import type { Slot } from '../world/city';
import { WS } from '../config/map';
import type { ParticleKind } from '../world/particles';
import { arrow, boxProp, bush, cone, cylProp, label, leafPile, ring, trimmedBush } from '../world/props';
import type { Arena, FenceSide } from './arena';
import { layout } from '../ui/layout';
import { routeStops, type Street, type StreetHouse } from './street';
import { TREE_MODELS } from '../world/city';
import { cutBranch, overgrownHedge, overgrownTree, woodChipper, bigPlanter, flowerBed, hoseReel, newsstand, paintKit, parcelShop, patioSet, postbox, ragBucket, roundShrub, slide, soapSprayer, tarpFor, toolbox, wheelieBin } from '../world/jobprops';

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
  /** punti ancora da toccare direttamente sull'oggetto (macchie sull'auto) */
  aims?: THREE.Vector3[];
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
  /**
   * Si fa toccando direttamente questo punto sull'oggetto (es. una macchia sull'auto): tenendo il
   * dito sopra (o passandoci sopra) avanza. `pos` è il punto vero, anche in alto.
   */
  aim?: THREE.Object3D;
  /** si fa solo a piedi (es. imbucare il giornale, lasciare il pacco): sul veicolo bisogna scendere */
  onFoot?: boolean;
}

/** grandezza degli indicatori sopra gli obiettivi dei lavoretti (3 = il triplo di prima) */
const MARKER_SIZE = 3;
/** spazio tra la parte più alta dell'oggetto e il fondo dell'indicatore (m) */
const MARKER_GAP = 0.15;

/** La cima vera di un oggetto: solo le sue mesh visibili, al vertice (niente scritte, insegne-sprite o box larghi). */
function meshTop(root: THREE.Object3D) {
  let top = 0;
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (o as unknown as THREE.Sprite).isSprite) return;
    box.setFromObject(m, true);
    if (Number.isFinite(box.max.y)) top = Math.max(top, box.max.y);
  });
  return top;
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
  /** punto dove stare scelto per ogni oggetto: non si sposta più */
  private stands = new Map<Task, THREE.Vector3>();

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
    // il cerchio a terra serve solo per le azioni veloci ("tocca"): per quelle da tenere premute no
    r.visible = !!t && t.kind === 'tap';
    if (!t || t.kind !== 'tap') return;
    const sp = this.standPt;
    // il punto si decide una volta sola per ogni oggetto (dal lato da cui arrivi) e poi resta fermo
    const fixed = this.stands.get(t);
    if (fixed) sp.copy(fixed);
    else if (t.markerAt) sp.copy(t.pos);
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
    if (!fixed) this.stands.set(t, sp.clone());
    r.position.set(sp.x, 0.12, sp.z);
    // vicino abbastanza: il cerchio diventa verde e pulsa
    const mat = r.material as THREE.MeshBasicMaterial;
    mat.color.setHex(this.nearOk ? 0x35c46a : 0xffd21a);
    const k = this.nearOk ? 1 + 0.12 * Math.sin(performance.now() / 140) : 1;
    r.scale.set(k, k, k);
  }

  /** Il punto non ha oggetti che si accendono da soli (es. i lati dell'auto): pulsa l'oggetto indicato. */
  /** Le parti da toccare per fare il punto: quelle che pulsano, o l'oggetto del punto. */
  private hitObjs(t: Task) {
    const g = this.glows.get(t);
    return g?.meshes.length ? g.meshes.map((x) => x.m) : t.obj ? [t.obj] : [];
  }

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
      if (t.aim) continue; // i punti sull'oggetto si vedono già (macchie): niente indicatori sopra
      // indicatore grande (si vede bene anche da lontano), appena sopra l'oggetto più alto lì vicino
      // (mai sovrapposto a cassette, giochi…): vicino a ciò che indica, non in cielo
      const m = label(t.icon, { bg: '#ffffff', fg: '#000', scale: 0.45 * MARKER_SIZE });
      const mp = t.markerAt ?? t.pos;
      this.placeMarker(m, t);
      m.position.set(mp.x, m.userData.baseY, mp.z);
      this.game.scene.add(m);
      this.markers.set(t, m);
    }
  }

  /** Mette l'indicatore 15 cm sopra la parte più alta dell'oggetto (rifatto se l'oggetto arriva dopo, es. l'edicola). */
  private placeMarker(m: THREE.Object3D, t: Task) {
    const top = this.markerY({ pos: t.markerAt ?? t.pos, obj: t.obj } as Task);
    m.userData.top = top;
    // in prima persona l'indicatore è rimpicciolito: il fondo resta comunque 15 cm sopra l'oggetto (vedi update)
    m.userData.baseY = top + MARKER_GAP + m.scale.y / 2;
    m.userData.hasObj = !!t.obj;
  }

  /** Altezza della cima degli oggetti di scena entro 1,1 m dal punto (l'indicatore va appena sopra). */
  private markerY(t: Task) {
    let top = 0;
    for (const o of this.objs) {
      if ((o as THREE.Sprite).isSprite || o.userData.noGlow || !o.visible) continue;
      if (Math.hypot(o.position.x - t.pos.x, o.position.z - t.pos.z) > 1.1) continue;
      top = Math.max(top, meshTop(o));
    }
    // l'oggetto indicato (edicola, negozio, auto…): sopra la sua parte più alta, anche se il suo centro è lontano
    if (t.obj?.visible) top = Math.max(top, meshTop(t.obj));
    return top;
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
      // i punti da toccare sull'oggetto si raggiungono anche da più lontano (basta vederli)
      near: this.nearTask?.aim ? Math.hypot(this.nearTask.pos.x - p.x, this.nearTask.pos.z - p.z) < 4.5 : this.nearOk,
      inZone: !this.zone || inZone(this.zone, p, 1.2),
      arrived: !this.zone || this.wasInZone,
      aims: this.tasks.filter((t) => t.aim && !t.done).map((t) => t.pos),
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
      if (!m.userData.hasObj && t.obj) this.placeMarker(m, t);
      // il fondo dell'indicatore 15 cm sopra la cima dell'oggetto (con la grandezza di adesso), ondeggia solo verso l'alto
      m.position.y = (m.userData.top ?? 1) + MARKER_GAP + m.scale.y / 2 + (Math.sin(t0 + t.pos.x) + 1) * 0.04;
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
    const aimed = pend.filter((t) => t.aim);
    if (aimed.length) {
      this.updateAim(dt, aimed, near);
      return;
    }
    this.game.input.onActionClaim = null;
    // consegne: col veicolo ci si avvicina, ma per consegnare bisogna scendere
    if (near && near.onFoot && this.game.riding && nd <= this.reach()) {
      this.game.prompt = { label: 'Scendi dal veicolo per consegnare', icon: '🛵' };
      return;
    }
    if (!near || nd > this.reach()) {
      this.game.prompt = null;
      if (this.game.player.currentName === 'interact-right' && !this.game.input.actionHeld) this.game.player.play('idle');
      return;
    }
    // l'anello da toccare sta sull'oggetto (a metà altezza, sotto l'indicatore)
    const mk = this.markers.get(near);
    const mp = near.markerAt ?? near.pos;
    const at = new THREE.Vector3(mp.x, Math.min(1.6, Math.max(0.5, (mk?.userData.top ?? 1.55) * 0.55)), mp.z);
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
      this.game.prompt = { label: `Tieni premuto: ${near.label}`, icon: near.icon, progress: near.progress ?? 0, at, obj: this.ownGlow(near), stand: this.standPt, hit: this.hitObjs(near) };
    } else {
      this.game.prompt = { label: near.label, icon: near.icon, at, obj: this.ownGlow(near), stand: this.standPt, hit: this.hitObjs(near) };
    }
  }

  onAction() {
    const p = this.game.player.root.position;
    const t = this.pending().find((x) => x.kind === 'tap' && Math.hypot(x.pos.x - p.x, x.pos.z - p.z) < this.reach());
    if (!t || (t.onFoot && this.game.riding)) return;
    if (!this.game.riding) this.game.player.once('interact-right');
    this.complete(t);
  }

  private fxT = 0;
  /** icona di ciò che si tiene in mano (in prima persona l'oggetto non si vede) */
  private heldIcon = '';

  private ray = new THREE.Raycaster();

  /** Il punto da toccare sotto il dito (entro 5 m), se c'è. */
  private aimHit(x: number, y: number, list: Task[]) {
    const cam = this.game.activeCamera;
    const { w, h } = layout.info;
    this.ray.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), cam);
    this.ray.far = 5;
    const hits = this.ray.intersectObjects(list.map((t) => t.aim!), false);
    return hits.length ? list.find((t) => t.aim === hits[0].object) ?? null : null;
  }

  /**
   * Punti da toccare sull'oggetto: il dito nella metà delle azioni, se è su un punto, lo lavora
   * (tenendolo fermo o passandoci sopra); altrove gira lo sguardo come sempre.
   */
  private updateAim(dt: number, list: Task[], near: Task | null) {
    const inp = this.game.input;
    const p = this.game.player.root.position;
    inp.onActionClaim = (x, y) => !!this.aimHit(x, y, list);
    const close = near && Math.hypot(near.pos.x - p.x, near.pos.z - p.z) < 4.5;
    const hit = inp.actionHeld && inp.actionPos ? this.aimHit(inp.actionPos.x, inp.actionPos.y, list) : null;
    if (hit) {
      hit.progress = (hit.progress ?? 0) + dt / (hit.sec ?? 0.6);
      this.fxT -= dt;
      if (hit.fx && this.fxT <= 0) {
        this.fxT = 0.08;
        this.game.fx.emit(hit.fx, hit.pos.clone(), 2, hit.fxColor);
      }
      hit.onProgress?.(Math.min(1, hit.progress));
      this.game.player.play('interact-right', 0.1, 1.6);
      if (hit.progress >= 1) this.complete(hit);
    } else if (this.game.player.currentName === 'interact-right' && !inp.actionHeld) this.game.player.play('idle');
    const t = hit ?? near;
    this.game.prompt = close && t ? { label: t.label, icon: t.icon, progress: hit?.progress ?? 0, at: t.pos.clone(), obj: t.obj } : null;
  }

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
    this.game.input.onActionClaim = null;
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
 * davanti alla casa, ai lati del vialetto. Sull'auto ci sono macchie di sporco in punti sempre diversi
 * (fianchi, muso, coda, tetto): si toccano direttamente col dito sull'auto. Fasi: spruzzino →
 * insapona ogni macchia → canna dell'acqua → sciacqua → straccio → asciuga.
 */
export function carWashArenaJob(game: Game, level: number, arena: Arena, title: string) {
  const n = carWashCars(level);
  const E = arena.entry;
  const zc = arena.house.maxZ + 2.7;
  const xs = [-3.7, 3.7, -9.6].slice(0, n);
  const models = ['cars/sedan.glb', 'cars/hatchback-sports.glb', 'cars/suv-luxury.glb'];
  const cars = xs.map((x) => new THREE.Vector3(E.x + x, 0, zc));
  const sprayer = new THREE.Vector3(arena.house.minX - 1.3, 0, arena.house.maxZ - 0.6);
  const rags = new THREE.Vector3(arena.house.minX - 1.3, 0, arena.house.maxZ - 2.0);
  const reel = new THREE.Vector3(arena.house.maxX + 1.3, 0, arena.house.maxZ - 0.6);
  const sp = 1 + 0.04 * level;
  const perCar = Math.min(10, 5 + Math.floor(level / 2));
  let run: PhasedRun;
  const carObjs: THREE.Object3D[] = [];
  // macchie: punto sulla carrozzeria, verso fuori, e cosa si vede (sporco → schiuma → gocce → niente)
  type Spot = { pos: THREE.Vector3; normal: THREE.Vector3; car: number; aim: THREE.Mesh; dirt: THREE.Object3D; foam?: THREE.Object3D; drops?: THREE.Object3D; arc?: THREE.Mesh };
  const spots: Spot[] = [];
  const decal = (color: number, r: number, k: number, spread: number) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.92 });
    for (let j = 0; j < k; j++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r * (0.6 + Math.random() * 0.6), 8, 6), mat);
      m.scale.z = 0.35;
      m.position.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, 0);
      g.add(m);
    }
    return g;
  };
  const place = (o: THREE.Object3D, s: Spot) => {
    // niente bagliore su macchie, schiuma e anello (prima di aggiungerli alla scena)
    o.userData.noGlow = true;
    const out = run.prop(o, s.pos.clone().addScaledVector(s.normal, 0.02), 0, 1);
    out.lookAt(s.pos.clone().addScaledVector(s.normal, 1));
    return out;
  };
  // macchia lavorata a metà: un anello giallo attorno mostra quanto manca (la macchia resta finché non è finita)
  const arcMat = new THREE.MeshBasicMaterial({ color: 0xffd21a, side: THREE.DoubleSide, depthTest: false, transparent: true });
  const showArc = (s: Spot, p: number) => {
    if (s.arc) s.arc.geometry.dispose();
    else {
      s.arc = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.31, 28), arcMat);
      s.arc.renderOrder = 6;
      place(s.arc, s);
    }
    s.arc.geometry = new THREE.RingGeometry(0.24, 0.31, 28, 1, Math.PI / 2, -Math.PI * 2 * Math.min(1, p));
    s.arc.visible = p > 0 && p < 1;
  };
  const stage = (verb: string, icon: string, fx: ParticleKind, color: number | undefined, sec: number, done: (s: Spot) => void) =>
    () => spots.map((s) => ({
      pos: s.pos, kind: 'hold' as const, sec, label: `${verb}${n > 1 ? ` (auto ${s.car + 1})` : ''}`, icon, fx, fxColor: color, aim: s.aim, obj: carObjs[s.car],
      onProgress: (p: number) => showArc(s, p),
      onDone: () => {
        if (s.arc) s.arc.visible = false;
        done(s);
      },
    }));
  const phases: Phase[] = [
    { name: 'Prendi lo spruzzino del sapone', icon: '🧴', tasks: () => [{ pos: sprayer, kind: 'tap', label: 'Prendi lo spruzzino', icon: '🧴', onDone: () => hold(game, cylProp(0.12, 0.35, 0xff6fae)) }] },
    {
      name: n > 1 ? 'Insapona le macchie sulle auto' : "Insapona le macchie sull'auto", icon: '🫧',
      tasks: stage('Insapona la macchia', '🫧', 'bubble', undefined, 0.55 / sp, (s) => {
        s.dirt.visible = false;
        s.foam = place(decal(0xffffff, 0.12, 7, 0.32), s);
      }),
    },
    { name: "Prendi la canna dell'acqua", icon: '🚿', tasks: () => [{ pos: reel, kind: 'tap', label: 'Prendi la canna', icon: '🚿', onDone: () => hold(game, cylProp(0.05, 0.6, 0x43a047)) }] },
    {
      name: 'Sciacqua via la schiuma', icon: '💦',
      tasks: stage('Sciacqua', '💦', 'bubble', 0x6ec6ff, 0.5 / sp, (s) => {
        if (s.foam) s.foam.visible = false;
        s.drops = place(decal(0x8fd3ff, 0.05, 6, 0.3), s);
      }),
    },
    { name: 'Prendi lo straccio', icon: '🧽', tasks: () => [{ pos: rags, kind: 'tap', label: 'Prendi lo straccio', icon: '🧽', onDone: () => hold(game, boxProp(0.25, 0.06, 0.3, 0xffc21a)) }] },
    {
      name: n > 1 ? 'Asciuga le auto' : "Asciuga l'auto", icon: '✨',
      tasks: stage('Asciuga', '✨', 'spark', undefined, 0.45 / sp, (s) => {
        if (s.drops) s.drops.visible = false;
      }),
    },
  ];
  run = new PhasedRun(game, level, title, phases, { time: 24 + n * (18 + perCar * 4) });
  const ray = new THREE.Raycaster();
  cars.forEach((c, ci) => {
    const car = run.prop(model(models[ci % models.length], 1), c, Math.PI / 2, 1);
    car.userData.noGlow = true;
    car.userData.solid = true;
    carObjs.push(car);
    car.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(car);
    const sz = b.getSize(new THREE.Vector3());
    // macchie sparse sulla carrozzeria: fianchi, muso, coda e tetto
    for (let k = 0, tries = 0; k < perCar && tries < 200; k++, tries++) {
      const r = Math.random();
      const pos = new THREE.Vector3();
      const nrm = new THREE.Vector3();
      const yy = b.min.y + sz.y * (0.3 + Math.random() * 0.35);
      if (r < 0.36 || r >= 0.9) {
        // fianchi (più spesso quello verso la strada e quello verso la casa)
        const sd = r < 0.18 || r >= 0.95 ? 1 : -1;
        pos.set(b.min.x + sz.x * (0.15 + Math.random() * 0.7), yy, sd > 0 ? b.max.z : b.min.z);
        nrm.set(0, 0, sd);
      } else if (r < 0.5) {
        pos.set(b.max.x, yy, b.min.z + sz.z * (0.25 + Math.random() * 0.5));
        nrm.set(1, 0, 0);
      } else if (r < 0.64) {
        pos.set(b.min.x, yy, b.min.z + sz.z * (0.25 + Math.random() * 0.5));
        nrm.set(-1, 0, 0);
      } else {
        // sopra: cofano e tetto
        pos.set(b.min.x + sz.x * (0.2 + Math.random() * 0.6), b.max.y - 0.05, b.min.z + sz.z * (0.3 + Math.random() * 0.4));
        nrm.set(0, 1, 0);
      }
      // la macchia va sulla carrozzeria vera (non sul riquadro attorno all'auto): un raggio da fuori
      // verso l'auto trova la superficie; se non la trova (o è troppo storta) si sceglie un altro punto
      ray.set(pos.clone().addScaledVector(nrm, 1.5), nrm.clone().negate());
      ray.far = 1.5 + Math.max(sz.x, sz.z) / 2;
      const hit = ray.intersectObject(car, true)[0];
      const fn = hit?.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null;
      if (!hit || !fn || fn.dot(nrm) < 0.35 || hit.point.y < b.min.y + 0.25) {
        k--;
        continue;
      }
      pos.copy(hit.point);
      nrm.copy(fn);
      if (spots.some((s) => s.pos.distanceTo(pos) < 0.5)) {
        k--;
        continue;
      }
      // zona da toccare (invisibile, un po' più grande della macchia)
      const aim = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      aim.userData.noGlow = true;
      run.prop(aim, pos, 0, 1);
      const s: Spot = { pos, normal: nrm, car: ci, aim, dirt: new THREE.Group() };
      s.dirt = place(decal(0x6d4c2f, 0.11, 6, 0.3), s);
      spots.push(s);
    }
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
 * Potatura (giardinaggio dal Liv. 10 di manualità): nello stesso giardino, siepi lungo la recinzione
 * con le punte cresciute troppo e alberi con i rami in eccesso. Le punte e i rami si tagliano tenendo il
 * dito direttamente su di loro (come le macchie dell'auto). Fasi: cesoie → regola le siepi → taglia i
 * rami → raccogli i rami caduti → portali alla cippatrice. Più livello = più siepi, alberi e rami.
 */
export function pruneArenaJob(game: Game, level: number, arena: Arena, title: string) {
  const k = Math.max(0, level - 8);
  const totalTufts = Math.min(12, 4 + Math.round(k));
  const totalBranches = Math.min(9, 3 + Math.round(k * 0.6));
  const box = arena.entry.clone().add(new THREE.Vector3(-2.2, 0, -0.6));
  const chipper = new THREE.Vector3(arena.house.minX - 1.3, 0, arena.house.maxZ - 0.9);
  // siepi lungo i lati della recinzione (non davanti al cancello), dentro il giardino
  const sides = arena.fence.filter((f) => f.side === 'left' || f.side === 'right').concat(arena.fence.filter((f) => f.side === 'back'));
  const nH = Math.max(1, Math.min(sides.length, Math.ceil(totalTufts / 3)));
  const chosen = sides.filter((f) => arena.free(f.inner, 0.3)).sort(() => Math.random() - 0.5).slice(0, nH);
  const perHedge = Math.ceil(totalTufts / Math.max(1, chosen.length));
  const nT = Math.min(3, 1 + Math.floor(k / 4));
  const treeAt = arena.scatter(nT, 3.6, 1.8, [box, chipper, arena.entry, ...chosen.map((f) => f.inner)]);
  const perTree = Math.ceil(totalBranches / Math.max(1, treeAt.length));
  let run: PhasedRun;
  // punto da toccare: una sfera invisibile un po' più grande della punta o del ciuffo
  const aimAt = (pos: THREE.Vector3, r: number) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    m.userData.noGlow = true;
    run.prop(m, pos, 0, 1);
    return m;
  };
  type Cut = { pos: THREE.Vector3; aim?: THREE.Mesh; obj: THREE.Object3D; part: THREE.Object3D };
  const tufts: Cut[] = [];
  const branches: Cut[] = [];
  const piles: { pos: THREE.Vector3; obj: THREE.Object3D }[] = [];
  const sp = 1 + 0.04 * level;
  const phases: Phase[] = [
    {
      name: 'Prendi le cesoie', icon: '🧰',
      tasks: () => [{ pos: box, kind: 'tap', label: 'Prendi le cesoie da potatura', icon: '🧰', onDone: () => hold(game, boxProp(0.12, 0.06, 0.45, 0xd94f4f)) }],
    },
    {
      name: 'Regola le siepi', icon: '✂️',
      tasks: () => tufts.map((t) => ({
        pos: t.pos, kind: 'hold' as const, sec: 0.7 / sp, label: 'Taglia la punta della siepe', icon: '✂️', fx: 'leaf' as const, aim: t.aim, obj: t.obj,
        onProgress: (p: number) => t.part.scale.multiplyScalar(1 - 0.04 * p),
        onDone: () => (t.part.visible = false),
      })),
    },
    {
      name: 'Taglia i rami in eccesso', icon: '🪚',
      tasks: () => branches.map((b, i) => ({
        pos: b.pos, kind: 'hold' as const, sec: 0.9 / sp, label: 'Taglia il ramo', icon: '🪚', fx: 'leaf' as const, aim: b.aim, obj: b.obj,
        onProgress: (p: number) => (b.part.rotation.x = Math.sin(performance.now() / 40) * 0.05 * p),
        onDone: () => {
          b.part.visible = false;
          // il ramo cade a terra sotto la punta
          const at = new THREE.Vector3(b.pos.x, 0, b.pos.z);
          piles.push({ pos: at, obj: run.prop(cutBranch(), at, (i * 1.7) % 6, 1) });
        },
      })),
    },
    {
      name: 'Raccogli i rami tagliati', icon: '🌿',
      tasks: () => piles.map((pl) => ({
        pos: pl.pos, kind: 'tap' as const, label: 'Raccogli il ramo', icon: '🌿', fx: 'leaf' as const,
        onDone: () => {
          pl.obj.visible = false;
          hold(game, cylProp(0.2, 0.5, 0x5fb848));
        },
      })),
    },
    { name: 'Porta i rami alla cippatrice', icon: '🪵', tasks: () => [{ pos: chipper, kind: 'tap', label: 'Butta i rami nella cippatrice', icon: '🪵', fx: 'leaf', onDone: () => hold(game) }] },
  ];
  run = new PhasedRun(game, level, title, phases, { time: totalTufts * 4 + totalBranches * 6 + 40 });
  run.prop(toolbox(), box, 0, 1);
  run.prop(woodChipper(), chipper, Math.PI / 2, 1).userData.solid = true;
  for (const f of chosen) {
    const inward = new THREE.Vector3(f.inner.x - f.pos.x, 0, f.inner.z - f.pos.z).normalize();
    const h = overgrownHedge(Math.max(1.6, f.len - 0.4), perHedge);
    const o = run.prop(h.obj, f.inner.clone().addScaledVector(inward, -0.15), Math.atan2(inward.x, inward.z), 1);
    o.userData.solid = true;
    o.updateMatrixWorld(true);
    for (const t of h.tufts) {
      if (tufts.length >= totalTufts) {
        t.visible = false;
        continue;
      }
      const pos = t.getWorldPosition(new THREE.Vector3());
      tufts.push({ pos, aim: aimAt(pos, 0.42), obj: o, part: t });
    }
  }
  for (const at of treeAt) {
    const tr = overgrownTree(perTree);
    const o = run.prop(tr.obj, at, Math.random() * 6, 1);
    o.updateMatrixWorld(true);
    // solo il tronco blocca il passaggio (sotto la chioma si cammina)
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    trunk.userData.solid = true;
    trunk.userData.noGlow = true;
    run.prop(trunk, at.clone().setY(0.75), 0, 1);
    for (const b of tr.branches) {
      if (branches.length >= totalBranches) {
        b.group.visible = false;
        continue;
      }
      const pos = b.tip.clone().applyMatrix4(o.matrixWorld);
      branches.push({ pos, aim: aimAt(pos, 0.45), obj: o, part: b.group });
    }
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
  // indirizzi distanti tra loro (mai una cassetta dopo l'altra): almeno ~2 case di distanza
  const pool = [...street.houses];
  const stops: StreetHouse[] = [];
  for (let minGap = 14; stops.length < n && minGap > 4; minGap -= 3) {
    for (const h of [...pool].sort(() => Math.random() - 0.5)) {
      if (stops.length >= n) break;
      if (stops.includes(h) || stops.some((o) => Math.abs(o.x - h.x) < minGap)) continue;
      stops.push(h);
    }
  }
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
  // il negozio / l'edicola: si tocca lui per ritirare e per firmare
  let shopObj: THREE.Object3D | undefined;
  const phases: Phase[] = [
    {
      name: flyer ? "Prendi i giornali all'edicola" : 'Ritira i pacchi al negozio', icon: flyer ? '📰' : '📦',
      tasks: () => [{ pos: counter, markerAt: counterMark, kind: 'tap', label: flyer ? 'Prendi i giornali' : 'Ritira i pacchi', icon: flyer ? '📰' : '📦', get obj() { return shopObj; }, onDone: () => hold(game, flyer ? papers() : box()) }],
    },
    {
      name: flyer ? 'Imbuca un giornale in ogni cassetta' : 'Consegna a ogni indirizzo', icon: flyer ? '📬' : '🏠',
      // giornali: nella cassetta della posta sul marciapiede; pacchi: fino alla porta di casa
      tasks: () => stops.map((h) => (flyer
        ? { pos: h.stand, markerAt: h.box, kind: 'tap' as const, label: 'Imbuca il giornale', icon: '📬', onFoot: true }
        : { pos: h.door, kind: 'tap' as const, label: 'Lascia il pacco alla porta', icon: '📦', onFoot: true, onDone: () => { run.prop(model('furniture/cardboardBoxClosed.glb', 2.2), h.door.clone().add(new THREE.Vector3(0.7, 0, h.side * 0.1)), 0, 1).userData.noGlow = true; } })),
    },
    {
      name: flyer ? "Torna all'edicola per la ricevuta" : 'Torna al negozio per la ricevuta', icon: '🧾',
      tasks: () => [{ pos: counter, markerAt: counterMark, kind: 'tap', label: 'Firma la ricevuta', icon: '🧾', get obj() { return shopObj; }, onDone: () => hold(game) }],
    },
  ];
  // tempo: andata e ritorno lungo la via fino all'ultima casa, più un attimo per ogni cassetta
  // (per i pacchi anche il vialetto fino alla porta e ritorno)
  const far = Math.max(...stops.map((h) => h.x)) - counter.x;
  const run: PhasedRun = new PhasedRun(game, level, title, phases, { time: ((far * 2) / 4) * 1.5 + n * (flyer ? 3 : 6) + 12 });
  shopObj = run.prop(flyer ? newsstand() : parcelShop(), street.shop, 0, 1);
  shopObj.userData.noGlow = true;
  // giornali: cassette blu agli indirizzi da servire; pacchi: zerbino davanti alla porta
  for (const h of stops) {
    if (flyer) run.prop(postbox(0x2d6cdb), h.box, h.rot, 1);
    else {
      const mat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.7), new THREE.MeshLambertMaterial({ color: 0xffc21a }));
      run.prop(mat, h.door.clone().setY(0.02), 0, 1);
    }
  }
  return run;
}


// ---------------- lavori dentro una scena a parte (lavori su richiesta del laboratorio) ----------------

/**
 * Lavoro che si fa tutto in una scena separata (es. un lavoro su richiesta del laboratorio dell'artigiano):
 * tempo e stato li aggiorna la scena; qui c'è solo ciò che serve alla barra del lavoro.
 */
export class IndoorRun extends BaseRun {
  indoorGuide: (() => RunGuide | null) | null = null;

  constructor(game: Game, title: string) {
    super(game, 1);
    this.title = title;
  }

  update() {}

  guide(): RunGuide | null {
    return this.indoorGuide?.() ?? null;
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
