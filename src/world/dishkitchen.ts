import * as THREE from 'three';
import { model } from '../assets';
import { JOB } from '../config/balance';
import type { Game } from '../game';
import type { RunGuide, Task } from '../minigames/jobs';
import { toast } from '../sim/bus';
import type { Character } from './character';
import { GuideLine } from './guideline';
import { Particles } from './particles';
import { arrow, label, plateStack, ring } from './props';
import { updateCutWalls, type CutWall } from './viewcam';
import { frameRoom, layout, type Occluder } from '../ui/layout';

/** Interfaccia sopra la cucina: la stanza si inquadra nello spazio libero. */
const KITCHEN_UI = () =>
  [{ sel: '.jobbar', dock: layout.panelDock }, { sel: '.tut-bubble', dock: layout.panelDock }, { sel: '.toasts', dock: layout.panelDock }, { sel: '.hud-right .hud-btns', dock: 'right' }, { sel: '.hud-right .minimap' }] as Occluder[];

export const KITCHEN_ASSETS = ['furniture/kitchenSink.glb', 'furniture/kitchenStove.glb', 'furniture/kitchenFridge.glb', 'furniture/kitchenCabinet.glb', 'furniture/kitchenCabinetDrawer.glb'];

const LEFT = 0;
const W = 8;
const BACK = -2.4;
/** cucina più profonda: attorno al carrello dei piatti si passa sia davanti sia dietro */
const FRONT = 3.4;
const FURN = 2.3;

export interface IndoorHooks {
  status(timeLeft: number, timeTotal: number, text: string): void;
  done(stars: number): void;
  /** il tutorial ferma il tempo */
  frozen(): boolean;
}

interface Step {
  task: Task;
  stack: number;
}

/**
 * Lavapiatti nella cucina di un ristorante, dopo la chiusura: niente clienti, solo i piatti.
 * Per ogni pila di piatti sporchi: prendila dal carrello → lavala al lavello → appoggiala sullo scolapiatti.
 */
export class DishKitchen {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.3, 120);
  readonly width = W;
  private player!: Character;
  private blocks: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  private walls: CutWall[] = [];
  private fx = new Particles();
  private line = new GuideLine(0xffffff, 0.24);
  private ringObj = ring(0x35c46a, 0.75);
  private arrowObj = arrow(0x35c46a);
  private door = new THREE.Vector3(0.9, 0, 2.9);
  private sink = new THREE.Vector3(1.6, 0, -1.3);
  private rack = new THREE.Vector3(6.6, 0, -1.3);
  private trolley = new THREE.Vector3(4.0, 0, 1.3);
  private stacks: THREE.Object3D[] = [];
  private clean: THREE.Object3D[] = [];
  private water!: THREE.Mesh;
  private steps: Step[] = [];
  private idx = 0;
  private timeLeft: number;
  private timeTotal: number;
  private ended = false;
  private camX = 0;
  private view: { d: number; pitch: number; z: number; follow: { min: number; max: number } | null } = { d: 10, pitch: 1, z: 0, follow: null };
  private offLayout: (() => void) | null = null;
  private heldSprite: THREE.Sprite | null = null;

  constructor(private game: Game, level: number, private hooks: IndoorHooks) {
    const n = Math.min(5, 2 + Math.floor(level / 2));
    this.build(n);
    const sp = 1 + 0.04 * level;
    for (let i = 0; i < n; i++) {
      const tpos = this.stackPos(i);
      this.steps.push(
        { stack: i, task: { pos: tpos, kind: 'tap', label: 'Prendi i piatti sporchi', icon: '🍽️' } },
        { stack: i, task: { pos: this.sink.clone().add(new THREE.Vector3(0, 0, 0.95)), kind: 'hold', sec: 1.6 / sp, label: 'Lava i piatti', icon: '🫧' } },
        { stack: i, task: { pos: this.rack.clone().add(new THREE.Vector3(0, 0, 0.95)), kind: 'tap', label: 'Appoggia sullo scolapiatti', icon: '✨' } },
      );
    }
    // in prima persona ci si gira e ci si avvicina: un po' più di tempo
    this.timeTotal = this.timeLeft = (n * 12 + 10) * Math.max(0.75, 1 - level * 0.02);
  }

  private stackPos(i: number) {
    return this.trolley.clone().add(new THREE.Vector3(-0.9 + (i % 3) * 0.9, 0, 0.95));
  }

  // ---------------- costruzione ----------------

  private lastFurn: THREE.Object3D | null = null;
  /** lavello (i due mobili insieme) e scolapiatti: pulsano quando l'azione è lì */
  private sinkObj = new THREE.Group();
  private rackObj: THREE.Object3D | null = null;

  private furniture(path: string, x: number, z: number, rot = 0, scale = FURN) {
    const o = model(path, scale);
    o.rotation.y = rot;
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    o.position.set(x - c.x, 0.05, z - c.z);
    this.scene.add(o);
    this.lastFurn = o;
    const size = box.getSize(new THREE.Vector3());
    this.blocks.push({ minX: x - size.x / 2, maxX: x + size.x / 2, minZ: z - size.z / 2, maxZ: z + size.z / 2 });
    return size;
  }

  private build(n: number) {
    const s = this.scene;
    s.background = new THREE.Color(0x1d2433);
    // ristorante chiuso: luce più calda e un po' più bassa
    s.add(new THREE.HemisphereLight(0xfff1d6, 0x5a4a3a, 1.35));
    const sun = new THREE.DirectionalLight(0xffe7c2, 1.0);
    sun.position.set(W / 2 - 2, 9, 6);
    sun.target.position.set(W / 2, 0, 0);
    s.add(sun, sun.target, this.fx.group, this.line.mesh, this.ringObj, this.arrowObj);
    this.arrowObj.scale.setScalar(0.6);
    // pavimento a piastrelle
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? '#e9e4da' : '#c9d3dc';
      g.fillRect(x * 32, y * 32, 32, 32);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(W / 1.2, (FRONT - BACK) / 1.2);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, FRONT - BACK), new THREE.MeshLambertMaterial({ map: tex }));
    floor.position.set(W / 2, 0, (BACK + FRONT) / 2);
    s.add(floor);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xdfe8ee });
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, 2.4, 0.15), wallMat);
    back.position.set(W / 2, 1.2, BACK - 0.08);
    s.add(back);
    this.walls.push({ obj: back, at: back.position.clone(), out: new THREE.Vector3(0, 0, -1) });
    // piastrelle bianche dietro i fornelli
    const tiles = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, 0.9), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    tiles.position.set(W / 2, 1.35, BACK + 0.01);
    s.add(tiles);
    for (const x of [LEFT, LEFT + W]) {
      // pareti piene: in prima persona la cucina è una stanza chiusa
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, FRONT - BACK), wallMat);
      side.position.set(x, 1.2, (BACK + FRONT) / 2);
      s.add(side);
      this.walls.push({ obj: side, at: side.position.clone(), out: new THREE.Vector3(x === LEFT ? -1 : 1, 0, 0) });
    }
    const front = new THREE.Mesh(new THREE.BoxGeometry(W - 1.8, 2.4, 0.15), wallMat);
    front.position.set(1.8 + (W - 1.8) / 2, 1.2, FRONT);
    // soffitto con due lampade
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, FRONT - BACK), new THREE.MeshLambertMaterial({ color: 0xf2efe8 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(W / 2, 2.4, (BACK + FRONT) / 2);
    s.add(ceil);
    for (const lx of [W * 0.3, W * 0.7]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
      lamp.position.set(lx, 2.37, (BACK + FRONT) / 2);
      s.add(lamp);
    }
    s.add(front);
    this.walls.push({ obj: front, at: front.position.clone(), out: new THREE.Vector3(0, 0, 1) });
    // cucina del ristorante: fornelli e frigo spenti lungo la parete di fondo
    this.furniture('furniture/kitchenStove.glb', 3.4, BACK + 0.55);
    this.furniture('furniture/kitchenStove.glb', 4.5, BACK + 0.55);
    this.furniture('furniture/kitchenCabinetDrawer.glb', 5.5, BACK + 0.55);
    this.furniture('furniture/kitchenFridge.glb', W - 0.5, 0.2, -Math.PI / 2);
    // lavello grande (a sinistra) con l'acqua
    this.furniture('furniture/kitchenSink.glb', this.sink.x - 0.55, this.sink.z);
    const sinkA = this.lastFurn!;
    this.furniture('furniture/kitchenSink.glb', this.sink.x + 0.55, this.sink.z);
    this.sinkObj.add(sinkA, this.lastFurn!);
    s.add(this.sinkObj);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.55), new THREE.MeshLambertMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.75 }));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(this.sink.x, 1.0, this.sink.z + 0.05);
    s.add(this.water);
    // scolapiatti (a destra): mensola con le griglie
    const rack = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0xb0bec5 });
    for (const y of [0.85, 1.35]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.55), steel);
      sh.position.y = y;
      rack.add(sh);
      for (let k = 0; k < 9; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.5), steel);
        bar.position.set(-0.72 + k * 0.18, y + 0.12, 0);
        rack.add(bar);
      }
    }
    for (const x of [-0.78, 0.78]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.5, 0.05), steel);
      leg.position.set(x, 0.75, 0);
      rack.add(leg);
    }
    rack.position.copy(this.rack);
    this.rackObj = rack;
    s.add(rack);
    this.blocks.push({ minX: this.rack.x - 0.8, maxX: this.rack.x + 0.8, minZ: this.rack.z - 0.3, maxZ: this.rack.z + 0.3 });
    // carrello con le pile di piatti sporchi (e qualche pentola)
    const cart = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.06, 0.8), steel);
    top.position.y = 0.85;
    const low = top.clone();
    low.position.y = 0.3;
    cart.add(top, low);
    for (const x of [-1.35, 1.35]) for (const z of [-0.35, 0.35]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.85, 0.05), steel);
      leg.position.set(x, 0.43, z);
      cart.add(leg);
    }
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.25, 14), new THREE.MeshLambertMaterial({ color: 0x78909c }));
    pot.position.set(0.9, 0.45, 0);
    cart.add(pot);
    cart.position.copy(this.trolley);
    s.add(cart);
    this.blocks.push({ minX: this.trolley.x - 1.45, maxX: this.trolley.x + 1.45, minZ: this.trolley.z - 0.45, maxZ: this.trolley.z + 0.45 });
    for (let i = 0; i < n; i++) {
      const st = plateStack(6, true);
      // sporco di sugo su ogni piatto
      st.scale.setScalar(1.25);
      st.position.set(this.trolley.x - 0.9 + (i % 3) * 0.9, 0.9 + Math.floor(i / 3) * 0.0, this.trolley.z + (i >= 3 ? -0.2 : 0.15));
      s.add(st);
      this.stacks.push(st);
      const cl = plateStack(6, false);
      cl.rotation.z = Math.PI / 2.3;
      cl.position.set(this.rack.x - 0.6 + (i % 4) * 0.4, i < 4 ? 0.95 : 1.45, this.rack.z);
      cl.visible = false;
      s.add(cl);
      this.clean.push(cl);
    }
    // porta e cartello "chiuso"
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.9), new THREE.MeshLambertMaterial({ color: 0x4cd07d }));
    mat.position.set(this.door.x, 0.06, this.door.z);
    s.add(mat);
    const closed = label('🔒 Ristorante chiuso · cucina', { bg: '#5b4bb7', scale: 0.45 });
    closed.position.set(W / 2, 2.8, BACK);
    s.add(closed);
    const tag = (t: string, v: THREE.Vector3, y: number) => {
      const l = label(t, { scale: 0.32 });
      l.position.set(v.x, y, v.z);
      s.add(l);
    };
    tag('🫧 Lavello', this.sink, 2.0);
    tag('✨ Scolapiatti', this.rack, 2.0);
    tag('🍽️ Piatti sporchi', this.trolley, 1.6);
  }

  // ---------------- entrata/uscita ----------------

  /** prima persona: si gioca con gli occhi del personaggio */
  readonly firstPerson = true;
  private yaw = 0;
  private pitch = -0.3;
  private lookIdle = 99;
  private bob = 0;

  enter(player: Character) {
    this.player = player;
    player.root.position.copy(this.door).add(new THREE.Vector3(0.6, 0, -0.5));
    player.root.rotation.y = Math.PI;
    this.scene.add(player.root);
    // prima persona: niente corpo, sguardo verso il carrello dei piatti, trascinare a destra gira lo sguardo
    player.body.visible = false;
    this.game.input.lookMode = true;
    this.game.input.cancel();
    this.yaw = Math.atan2(this.trolley.x - player.root.position.x, -(this.trolley.z - player.root.position.z));
    this.camera.fov = 72;
    this.camera.near = 0.15;
    this.resize();
    requestAnimationFrame(() => {
      this.offLayout = layout.on(() => this.resize());
    });
    toast('🍽️ Il ristorante ha chiuso: lava tutti i piatti sporchi', 'info');
  }

  exit() {
    this.player.body.visible = true;
    this.game.input.lookMode = false;
    this.offLayout?.();
    this.offLayout = null;
    this.camera.clearViewOffset();
    this.setHeld(null);
    this.player.hold();
    this.scene.remove(this.player.root);
  }

  private resize = () => {
    if (this.firstPerson) {
      // in prima persona la vista occupa tutto lo schermo; il centro sta nella zona libera dai riquadri
      const free = layout.freeRect(KITCHEN_UI());
      const { w, h } = layout.info;
      this.camera.aspect = w / h;
      this.camera.setViewOffset(w, h, -(free.x + free.w / 2 - w / 2), -(free.y + free.h / 2 - h / 2), w, h);
      this.camera.updateProjectionMatrix();
      return;
    }
    const free = layout.freeRect(KITCHEN_UI());
    const tall = free.w < free.h;
    const pitch = THREE.MathUtils.degToRad(tall ? 60 : 56);
    const f = frameRoom(this.camera, free, { x0: LEFT, x1: LEFT + W, z0: BACK, z1: FRONT, wall: 2.4 }, pitch);
    this.view = { d: f.d, pitch, z: f.z, follow: f.follow };
    this.placeCamera(true);
  };

  private placeCamera(snap = false, dt = 0) {
    if (this.firstPerson) {
      this.placeEyes(dt);
      return;
    }
    const v = this.view;
    const want = !v.follow ? W / 2 : THREE.MathUtils.clamp(this.player?.root.position.x ?? W / 2, v.follow.min, v.follow.max);
    this.camX = snap ? want : this.camX + (want - this.camX) * 0.08;
    this.game.view.place(this.camera, new THREE.Vector3(this.camX, 0, v.z), v.d, v.pitch, this.player?.root.position);
    updateCutWalls(this.walls, this.camera);
  }

  /**
   * Occhi del personaggio: sguardo col dito nella metà destra; se non lo tocchi, la testa si gira
   * da sola verso il prossimo punto (carrello, lavello, scolapiatti). Leggero ondeggiare camminando.
   */
  private placeEyes(dt: number) {
    const input = this.game.input;
    const l = input.consumeLook();
    if (l.x || l.y) this.lookIdle = 0;
    else this.lookIdle += dt;
    this.yaw += l.x * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch - l.y * 0.004, -1.0, 0.35);
    const p = this.player.root.position;
    // si guarda l'oggetto da usare (pila di piatti, lavello, scolapiatti), non il punto a terra
    const st = this.step;
    const t = !st ? null : this.idx % 3 === 0 ? this.stacks[st.stack].position : this.idx % 3 === 1 ? this.sink : this.rack;
    if (t && this.lookIdle > 1.2) {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      let dy = Math.atan2(t.x - p.x, -(t.z - p.z)) - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const k = Math.min(1, dt * 2.2);
      if (d > 0.3) this.yaw += dy * k;
      const wantPitch = THREE.MathUtils.clamp(-Math.atan2(0.6, Math.max(d, 0.5) + 0.3), -0.75, -0.1);
      this.pitch += (wantPitch - this.pitch) * k;
    }
    const moving = Math.hypot(input.vector.x, input.vector.y) > 0.1;
    this.bob += moving ? dt * 9 : 0;
    const bob = moving ? Math.sin(this.bob) * 0.03 : 0;
    // occhi un po' indietro rispetto alla testa, ma mai dentro un muro
    let back = 0.3;
    while (back > 0 && (Math.abs(p.x - Math.sin(this.yaw) * back - W / 2) > W / 2 - 0.2 || p.z + Math.cos(this.yaw) * back > FRONT - 0.15 || p.z + Math.cos(this.yaw) * back < BACK + 0.15)) back -= 0.05;
    this.camera.position.set(p.x - Math.sin(this.yaw) * Math.max(0, back), 1.6 + bob, p.z + Math.cos(this.yaw) * Math.max(0, back));
    this.camera.rotation.set(this.pitch, -this.yaw, 0, 'YXZ');
    this.player.root.rotation.y = Math.PI - this.yaw;
    this.player.body.visible = false;
    if (this.player.held) this.player.held.visible = false;
    if (this.heldSprite) this.heldSprite.visible = false;
    // scritte nella cucina: più piccole, e sparite quando sono troppo vicine agli occhi
    const wp = new THREE.Vector3();
    this.scene.traverse((o) => {
      const sp = o as THREE.Sprite;
      if (!sp.isSprite) return;
      sp.userData.baseScale ??= sp.scale.clone();
      sp.scale.copy(sp.userData.baseScale).multiplyScalar(0.5);
      sp.getWorldPosition(wp);
      sp.material.transparent = true;
      sp.material.opacity = wp.distanceTo(this.camera.position) < 1.6 ? 0 : 1;
    });
  }

  // ---------------- gioco ----------------

  private get step(): Step | null {
    return this.steps[this.idx] ?? null;
  }

  /** Per il tutorial: fase (pila di piatti), punto da raggiungere, se ci sei vicino. */
  guide(): RunGuide | null {
    const st = this.step;
    if (!st) return null;
    const p = this.player.root.position;
    const near = Math.hypot(p.x - st.task.pos.x, p.z - st.task.pos.z) < 1.3;
    return {
      phase: st.stack, phases: this.steps.length / 3, phaseName: `Pila ${st.stack + 1}: prendi, lava, appoggia`, phaseIcon: '🍽️',
      left: 3 - (this.idx % 3), task: st.task, near, inZone: true, arrived: true,
    };
  }

  private stars() {
    const f = this.timeLeft / this.timeTotal;
    return f >= JOB.STAR3 ? 3 : f >= JOB.STAR2 ? 2 : 1;
  }

  private finish(stars: number) {
    if (this.ended) return;
    this.ended = true;
    this.hooks.done(stars);
  }

  private setHeld(text: string | null, obj?: THREE.Object3D) {
    if (this.heldSprite) this.player.root.remove(this.heldSprite);
    this.heldSprite = null;
    this.player.hold(obj);
    if (!text) return;
    this.heldSprite = label(text, { bg: '#ffffff', fg: '#3a2f55', scale: 0.45 });
    this.heldSprite.position.y = 2.3;
    this.player.root.add(this.heldSprite);
  }

  private collide(p: THREE.Vector3) {
    p.x = THREE.MathUtils.clamp(p.x, LEFT + 0.35, LEFT + W - 0.35);
    p.z = THREE.MathUtils.clamp(p.z, BACK + 0.35, FRONT - 0.3);
    for (const b of this.blocks) {
      if (p.x < b.minX - 0.3 || p.x > b.maxX + 0.3 || p.z < b.minZ - 0.3 || p.z > b.maxZ + 0.3) continue;
      const pushes = [b.minX - 0.3 - p.x, b.maxX + 0.3 - p.x, b.minZ - 0.3 - p.z, b.maxZ + 0.3 - p.z];
      const i = pushes.map(Math.abs).indexOf(Math.min(...pushes.map(Math.abs)));
      if (i < 2) p.x += pushes[i];
      else p.z += pushes[i];
    }
  }

  update(dt: number) {
    if (this.ended) return;
    if (!this.hooks.frozen()) this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      toast('⏰ Tempo scaduto: i piatti non sono finiti', 'bad');
      this.finish(0);
      return;
    }
    const st = this.step;
    const total = this.steps.length / 3;
    const doneStacks = Math.floor(this.idx / 3);
    this.hooks.status(this.timeLeft, this.timeTotal, st ? `Pile lavate ${doneStacks}/${total} · ${st.task.icon} ${st.task.label}` : 'Finito!');
    // movimento (solo joystick)
    const input = this.game.input;
    input.consumeTap();
    // joystick in prima persona: "su" = avanti, dove guardi
    const iv = input.vector;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const v = { x: cy * iv.x - sy * iv.y, y: sy * iv.x + cy * iv.y };
    const p = this.player.root.position;
    const len = Math.hypot(v.x, v.y);
    if (len > 0.05) {
      p.x += v.x * 4 * dt;
      p.z += v.y * 4 * dt;
      this.collide(p);
      this.player.faceTowards(p.x + v.x, p.z + v.y, dt);
      this.player.play(this.player.held ? 'holding-both' : 'walk');
    } else if (this.player.currentName === 'walk' || this.player.currentName === 'holding-both') this.player.play('idle');
    // obiettivo: anello, freccia e linea
    const target = st?.task.pos ?? null;
    this.arrowObj.visible = !!target;
    // cerchio a terra solo per le azioni veloci (prendi, appoggia), non per lavare (tieni premuto)
    this.ringObj.visible = !!target && st?.task.kind === 'tap';
    if (target) {
      this.ringObj.position.copy(target).setY(0.08);
      this.arrowObj.position.set(target.x, 1.85 + Math.sin(performance.now() / 220) * 0.12, target.z - 0.9);
    }
    this.line.update(dt, p, target, 0.6);
    this.placeCamera(false, dt);
    this.fx.update(dt);
    // acqua del lavello che si muove un po'
    this.water.position.y = 1.0 + Math.sin(performance.now() / 300) * 0.01;
    const pr = this.interact(dt);
    this.game.ui.setAction(pr && { ...pr, headY: this.heldSprite ? 3.0 : 2.6 });
  }

  private interact(dt: number): { label: string; icon: string; progress?: number; at?: THREE.Vector3; obj?: THREE.Object3D; stand?: THREE.Vector3 } | null {
    const input = this.game.input;
    const st = this.step;
    if (!st) return null;
    const t = st.task;
    const p = this.player.root.position;
    if (Math.hypot(p.x - t.pos.x, p.z - t.pos.z) > 1.3) {
      input.consumeAction();
      return null;
    }
    if (t.kind === 'hold') {
      if (input.actionHeld) {
        t.progress = (t.progress ?? 0) + dt / (t.sec ?? 1.4);
        this.player.faceTowards(this.sink.x, this.sink.z, dt);
        this.player.play('interact-right', 0.1, 1.6);
        if (Math.random() < dt * 14) this.fx.emit('bubble', this.sink.clone().setY(1.1).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, 0)), 1);
        if (t.progress >= 1) this.next();
      }
      return { label: `Tieni premuto: ${t.label}`, icon: t.icon, progress: t.progress ?? 0, at: this.sink.clone().setY(1.0), obj: this.sinkObj, stand: t.pos };
    }
    if (input.consumeAction()) this.next();
    // anello sull'oggetto: la pila di piatti sul carrello o lo scolapiatti
    const at = this.idx % 3 === 0 ? this.stacks[st.stack].position.clone().setY(1.0) : this.rack.clone().setY(1.1);
    // l'anello verde a terra è il punto dove stare: si può toccare anche lì
    return { label: t.label, icon: t.icon, at, obj: this.idx % 3 === 0 ? this.stacks[st.stack] : this.rackObj ?? undefined, stand: t.pos };
  }

  private next() {
    const st = this.step!;
    const i = st.stack;
    const k = this.idx % 3;
    if (k === 0) {
      this.stacks[i].visible = false;
      const held = plateStack(5, true);
      held.position.set(0, 0, 0.1);
      this.setHeld('🍽️ Piatti sporchi', held);
      this.player.once('pick-up', 'idle');
    } else if (k === 1) {
      const held = plateStack(5, false);
      held.position.set(0, 0, 0.1);
      this.setHeld('✨ Piatti puliti', held);
      this.fx.emit('bubble', this.sink.clone().setY(1.2), 10);
      this.player.play('idle');
    } else {
      this.clean[i].visible = true;
      this.setHeld(null);
      this.fx.emit('spark', this.rack.clone().setY(1.2), 10);
      this.player.once('interact-right');
    }
    this.idx++;
    if (!this.step) {
      toast('✨ Tutti i piatti sono puliti!', 'good');
      this.finish(this.stars());
    }
  }
}
