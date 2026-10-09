import * as THREE from 'three';
import type { Game } from '../game';
import type { RunGuide, Task } from '../minigames/jobs';
import { toast } from '../sim/bus';
import type { SpecialOrder } from '../sim/state';
import { specialStars, specialTime } from '../sim/specials';
import type { Character } from './character';
import { CLAY, GLAZES, LUMP_R, MAX_R, MIN_R, RINGS, VASE_H, VASES, vaseGeometry, vaseSvg, wrappedVase } from './ceramics';
import { Particles } from './particles';
import { label, ring } from './props';
import { firstPersonFov } from './viewcam';
import { layout, type Occluder } from '../ui/layout';
import type { IndoorHooks } from './dishkitchen';

/** Interfaccia sopra il laboratorio: il centro della vista sta nella zona libera. */
const STUDIO_UI = () =>
  [{ sel: '.jobbar', dock: layout.panelDock }, { sel: '.hud-right .hud-btns', dock: 'right' }, { sel: '.pottery-card' }] as Occluder[];

const W = 7;
const BACK = -2.4;
const FRONT = 3;

type StepKind = 'tap' | 'hold' | 'shape' | 'dry' | 'paint';
interface Step {
  kind: StepKind;
  label: string;
  icon: string;
  /** dove stare (davanti al mobile) e l'oggetto che pulsa */
  stand: THREE.Vector3;
  obj: () => THREE.Object3D | undefined;
  sec?: number;
  progress?: number;
  onDone?: () => void;
}

/**
 * Lavoro su richiesta del laboratorio dell'artigiano (vaso in ceramica), in prima persona:
 * prendi l'argilla → mettila sul tornio → modella il vaso tenendo il dito dove stringere
 * (la foto del vaso richiesto è in alto a destra) → essiccatoio (5 s) → banco pittura (dipingi
 * tenendo il dito sul vaso) → incarta → ripiano delle consegne. Solo il giocatore, mai i dipendenti.
 */
export class PotteryStudio {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.12, 120);
  readonly firstPerson = true;
  private player!: Character;
  private blocks: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  private fx = new Particles();
  private ringObj = ring(0x35c46a, 0.7);
  private steps: Step[] = [];
  private idx = 0;
  private timeLeft: number;
  private timeTotal: number;
  private ended = false;
  private offLayout: (() => void) | null = null;
  private yaw = 0;
  private pitch = -0.3;
  private lookIdle = 0;
  private bob = 0;
  private ray = new THREE.Raycaster();

  // posti nel laboratorio
  private door = new THREE.Vector3(0.9, 0, 2.6);
  private clayAt = new THREE.Vector3(1.1, 0, BACK + 0.5);
  private wheelAt = new THREE.Vector3(3.5, 0, -0.7);
  private dryAt = new THREE.Vector3(6.1, 0, BACK + 0.45);
  private paintAt = new THREE.Vector3(6.0, 0, 1.0);
  private wrapAt = new THREE.Vector3(3.6, 0, 2.1);
  private shelfAt = new THREE.Vector3(0.75, 0, 1.0);
  private clayBin = new THREE.Group();
  private wheel = new THREE.Group();
  private disc!: THREE.Mesh;
  private dryer = new THREE.Group();
  private paintTable = new THREE.Group();
  private wrapTable = new THREE.Group();
  private shelf = new THREE.Group();

  // il vaso
  private target: number[];
  private glaze: number;
  private radii: number[] = Array(RINGS).fill(LUMP_R);
  private paint: number[] = Array(RINGS).fill(0);
  private vase: THREE.Mesh | null = null;
  private vaseMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  private wrapped: THREE.Object3D | null = null;
  private spin = 0;
  private dryT = 0;
  /** qualità della forma (0…1) quando si è finito di modellare */
  private quality = 0;
  private held = '';
  private card: HTMLDivElement;

  constructor(private game: Game, private order: SpecialOrder, private hooks: IndoorHooks) {
    const def = VASES[order.shape];
    this.target = def.profile;
    this.glaze = order.glaze;
    this.timeTotal = this.timeLeft = specialTime(order);
    this.build();
    this.makeSteps();
    this.card = document.createElement('div');
    this.card.className = 'pottery-card';
    this.card.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-p]')?.getAttribute('data-p');
      if (a === 'ok') this.finishShape();
      if (a === 'redo') this.redoShape();
    });
  }

  private get glazeName() {
    return GLAZES.find((g) => g.color === this.glaze)?.name ?? '';
  }

  // ---------------- costruzione ----------------

  private block(c: THREE.Vector3, w: number, d: number) {
    this.blocks.push({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - d / 2, maxZ: c.z + d / 2 });
  }

  private build() {
    const s = this.scene;
    s.background = new THREE.Color(0x2a2230);
    s.add(new THREE.HemisphereLight(0xfff3e0, 0x6a5040, 1.45));
    const sun = new THREE.DirectionalLight(0xffecd0, 1.0);
    sun.position.set(W / 2 - 2, 9, 6);
    sun.target.position.set(W / 2, 0, 0);
    s.add(sun, sun.target, this.fx.group, this.ringObj);
    const lamb = (color: number) => new THREE.MeshLambertMaterial({ color });
    const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number, parent: THREE.Object3D = s) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lamb(color));
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    // stanza: pavimento in cotto, pareti color sabbia, soffitto con le lampade
    box(W, 0.1, FRONT - BACK, 0xc98f6b, W / 2, -0.05, (BACK + FRONT) / 2);
    box(W, 2.6, 0.15, 0xefe1cc, W / 2, 1.3, BACK - 0.08);
    box(0.15, 2.6, FRONT - BACK, 0xefe1cc, 0, 1.3, (BACK + FRONT) / 2);
    box(0.15, 2.6, FRONT - BACK, 0xefe1cc, W, 1.3, (BACK + FRONT) / 2);
    box(W - 1.8, 2.6, 0.15, 0xefe1cc, 1.8 + (W - 1.8) / 2, 1.3, FRONT);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, FRONT - BACK), lamb(0xf6efe4));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(W / 2, 2.6, (BACK + FRONT) / 2);
    s.add(ceil);
    for (const lx of [W * 0.3, W * 0.7]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
      lamp.position.set(lx, 2.57, 0);
      s.add(lamp);
    }
    // mensole con vasi finiti alle pareti (si capisce che è un laboratorio di ceramica)
    const deco = [0x2d6cdb, 0x2fae5e, 0xe8b03a, 0xd9534f, 0x8e5bd6];
    box(2.4, 0.06, 0.35, 0x8a6a4a, 3.4, 1.7, BACK + 0.12);
    for (let i = 0; i < 5; i++) {
      const v = new THREE.Mesh(vaseGeometry(Object.values(VASES)[i % 4].profile, VASE_H), lamb(deco[i]));
      v.scale.setScalar(0.42);
      v.position.set(2.5 + i * 0.45, 1.73, BACK + 0.12);
      s.add(v);
    }
    // cassa dell'argilla
    box(0.9, 0.6, 0.6, 0x8a6a4a, 0, 0.3, 0, this.clayBin);
    for (let i = 0; i < 4; i++) box(0.24, 0.16, 0.22, CLAY, -0.27 + (i % 2) * 0.3, 0.68, -0.12 + Math.floor(i / 2) * 0.24, this.clayBin);
    this.clayBin.position.copy(this.clayAt);
    s.add(this.clayBin);
    this.block(this.clayAt, 0.9, 0.6);
    // tornio: base, piatto che gira e la vaschetta attorno
    box(0.5, 0.7, 0.5, 0x5f6b7a, 0, 0.35, 0, this.wheel);
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.42, 0.12, 24, 1, true), new THREE.MeshLambertMaterial({ color: 0x7c8794, side: THREE.DoubleSide }));
    tray.position.y = 0.76;
    this.disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 24), lamb(0x9aa5b1));
    this.disc.position.y = 0.74;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.03), lamb(0x5f6b7a));
    mark.position.set(0.12, 0.025, 0);
    this.disc.add(mark);
    this.wheel.add(tray, this.disc);
    this.wheel.position.copy(this.wheelAt);
    s.add(this.wheel);
    this.block(this.wheelAt, 0.9, 0.9);
    // essiccatoio: scaffale con le griglie
    const steel = 0xb0bec5;
    for (const y of [0.8, 1.35]) box(1.4, 0.05, 0.5, steel, 0, y, 0, this.dryer);
    for (const x of [-0.68, 0.68]) box(0.05, 1.5, 0.05, steel, x, 0.75, 0, this.dryer);
    this.dryer.position.copy(this.dryAt);
    s.add(this.dryer);
    this.block(this.dryAt, 1.4, 0.5);
    // banco pittura con i barattoli di smalto
    box(1.2, 0.06, 0.8, 0xd7b98f, 0, 0.8, 0, this.paintTable);
    for (const x of [-0.55, 0.55]) for (const z of [-0.35, 0.35]) box(0.05, 0.8, 0.05, 0x8a6a4a, x, 0.4, z, this.paintTable);
    GLAZES.slice(0, 4).forEach((g, i) => {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), lamb(g.color));
      pot.position.set(-0.45 + i * 0.12, 0.88, 0.28);
      this.paintTable.add(pot);
    });
    this.paintTable.position.copy(this.paintAt);
    s.add(this.paintTable);
    this.block(this.paintAt, 1.2, 0.8);
    // banco per incartare: rotolo di carta kraft e nastro
    box(1.3, 0.06, 0.7, 0xd7b98f, 0, 0.8, 0, this.wrapTable);
    for (const x of [-0.6, 0.6]) for (const z of [-0.3, 0.3]) box(0.05, 0.8, 0.05, 0x8a6a4a, x, 0.4, z, this.wrapTable);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 14), lamb(0xd8b98a));
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, 0.92, -0.15);
    this.wrapTable.add(roll);
    box(0.5, 0.01, 0.4, 0xd8b98a, 0.2, 0.84, 0.12, this.wrapTable);
    this.wrapTable.position.copy(this.wrapAt);
    s.add(this.wrapTable);
    this.block(this.wrapAt, 1.3, 0.7);
    // ripiano delle consegne vicino alla porta
    box(0.6, 0.05, 1.2, 0x8a6a4a, 0, 0.9, 0, this.shelf);
    box(0.6, 0.05, 1.2, 0x8a6a4a, 0, 0.4, 0, this.shelf);
    for (const z of [-0.58, 0.58]) box(0.05, 0.95, 0.05, 0x5d4632, 0, 0.47, z, this.shelf);
    this.shelf.position.copy(this.shelfAt);
    s.add(this.shelf);
    this.block(this.shelfAt, 0.6, 1.2);
    // porta e cartellini
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.8), lamb(0x4cd07d));
    mat.position.set(this.door.x, 0.03, this.door.z);
    s.add(mat);
    const tag = (t: string, v: THREE.Vector3, y: number) => {
      const l = label(t, { scale: 0.3 });
      l.position.set(v.x, y, v.z);
      s.add(l);
    };
    tag('🟤 Argilla', this.clayAt, 1.25);
    tag('🏺 Tornio', this.wheelAt, 1.7);
    tag('🌬️ Essiccatoio', this.dryAt, 1.85);
    tag('🎨 Pittura', this.paintAt, 1.5);
    tag('🎁 Incarto', this.wrapAt, 1.5);
    tag('📦 Consegne', this.shelfAt, 1.5);
  }

  /** davanti a un mobile, verso il centro della stanza */
  private front(c: THREE.Vector3, dz = 0.9, dx = 0) {
    return new THREE.Vector3(c.x + dx, 0, c.z + dz);
  }

  private makeSteps() {
    const vase = () => this.vase ?? undefined;
    this.steps = [
      { kind: 'tap', label: "Prendi l'argilla", icon: '🟤', stand: this.front(this.clayAt), obj: () => this.clayBin, onDone: () => (this.held = '🟤 argilla') },
      { kind: 'tap', label: "Metti l'argilla sul tornio", icon: '🏺', stand: this.front(this.wheelAt, 0.85), obj: () => this.wheel, onDone: () => this.putClay() },
      { kind: 'shape', label: 'Modella: dito verso il centro stringe, verso i lati allarga', icon: '👐', stand: this.front(this.wheelAt, 0.85), obj: vase },
      { kind: 'tap', label: 'Prendi il vaso modellato', icon: '🏺', stand: this.front(this.wheelAt, 0.85), obj: vase, onDone: () => this.pick('🏺 vaso crudo') },
      { kind: 'tap', label: 'Metti il vaso a essiccare', icon: '🌬️', stand: this.front(this.dryAt, 0.85), obj: () => this.dryer, onDone: () => this.place(this.dryAt.clone().setY(0.83)) },
      { kind: 'dry', label: 'Il vaso si sta essiccando…', icon: '⏳', stand: this.front(this.dryAt, 0.85), obj: vase },
      { kind: 'tap', label: 'Prendi il vaso essiccato', icon: '🏺', stand: this.front(this.dryAt, 0.85), obj: vase, onDone: () => this.pick('🏺 vaso essiccato') },
      { kind: 'tap', label: 'Appoggia il vaso sul banco pittura', icon: '🎨', stand: this.front(this.paintAt, -0.85), obj: () => this.paintTable, onDone: () => this.place(this.paintAt.clone().setY(0.83)) },
      { kind: 'paint', label: `Dipingi il vaso di ${this.glazeName}: tieni il dito sul vaso`, icon: '🖌️', stand: this.front(this.paintAt, -0.85), obj: vase },
      { kind: 'tap', label: 'Prendi il vaso dipinto', icon: '🏺', stand: this.front(this.paintAt, -0.85), obj: vase, onDone: () => this.pick('🏺 vaso dipinto') },
      { kind: 'hold', label: 'Incarta il vaso', icon: '🎁', sec: 1.3, stand: this.front(this.wrapAt, -0.8), obj: () => this.wrapTable, onDone: () => this.wrap() },
      { kind: 'tap', label: 'Lascia il pacco sul ripiano consegne', icon: '📦', stand: this.front(this.shelfAt, 0, 0.85), obj: () => this.shelf, onDone: () => this.deliver() },
    ];
  }

  // ---------------- il vaso ----------------

  private refreshVase() {
    if (!this.vase) return;
    this.vase.geometry.dispose();
    const painting = this.idx >= 8;
    this.vase.geometry = vaseGeometry(this.radii, VASE_H, painting ? this.paint : undefined, painting ? this.glaze : undefined);
    this.vaseMat.vertexColors = painting;
    // argilla bagnata (scura) al tornio, più chiara dopo l'essiccatoio
    this.vaseMat.color.set(painting ? 0xffffff : this.idx >= 6 ? 0xd2a07a : CLAY);
    this.vaseMat.needsUpdate = true;
  }

  private putClay() {
    this.held = '';
    this.radii = Array(RINGS).fill(LUMP_R);
    this.vase = new THREE.Mesh(vaseGeometry(this.radii), this.vaseMat);
    this.vase.castShadow = true;
    this.vase.position.copy(this.wheelAt).setY(0.76);
    this.scene.add(this.vase);
    this.refreshVase();
    this.updateCard();
  }

  private pick(what: string) {
    this.held = what;
    if (this.vase) this.vase.visible = false;
  }

  private place(at: THREE.Vector3) {
    this.held = '';
    if (!this.vase) return;
    this.vase.position.copy(at);
    this.vase.rotation.set(0, 0, 0);
    this.vase.visible = true;
    this.refreshVase();
  }

  private wrap() {
    this.held = '🎁 vaso incartato';
    this.wrapped = wrappedVase();
    this.wrapped.position.copy(this.wrapAt).setY(0.83);
    this.wrapped.visible = false;
    this.scene.add(this.wrapped);
    this.fx.emit('spark', this.wrapAt.clone().setY(1.1), 8);
  }

  private deliver() {
    this.held = '';
    if (this.wrapped) {
      this.wrapped.position.copy(this.shelfAt).setY(0.93);
      this.wrapped.visible = true;
    }
    this.fx.emit('spark', this.shelfAt.clone().setY(1.3), 14);
    this.finish(specialStars(this.quality, this.timeLeft, this.timeTotal));
  }

  /** quanto il vaso somiglia alla foto (0…1): ogni fascia conta uguale */
  private shapeQuality() {
    let q = 0;
    for (let i = 0; i < RINGS; i++) q += Math.max(0, 1 - Math.abs(this.radii[i] - this.target[i]) / 0.05);
    return q / RINGS;
  }

  /** Fascia del vaso sotto il dito (numero con la virgola), se il dito è sul vaso. */
  private ringUnder(x: number, y: number) {
    if (!this.vase || !this.vase.visible) return null;
    const { w, h } = layout.info;
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), this.camera);
    this.ray.far = 4;
    const hit = this.ray.intersectObject(this.vase, false)[0];
    if (!hit) return null;
    const local = (hit.point.y - this.vase.position.y) / VASE_H;
    return THREE.MathUtils.clamp(local, 0, 1) * (RINGS - 1);
  }

  /**
   * Al tornio: la fascia all'altezza del dito (numero con la virgola), ovunque sia il dito in larghezza:
   * basta toccare all'altezza della parte da cambiare, non per forza sul bordo del vaso.
   */
  private ringAtHeight(y: number) {
    if (!this.vase || !this.vase.visible) return null;
    const { h } = layout.info;
    this.camera.updateMatrixWorld();
    const v = new THREE.Vector3();
    const sy = (i: number) => {
      v.set(this.vase!.position.x, this.vase!.position.y + (i / (RINGS - 1)) * VASE_H, this.vase!.position.z).project(this.camera);
      return ((1 - v.y) / 2) * h;
    };
    const bottom = sy(0);
    const top = sy(RINGS - 1);
    const margin = (bottom - top) * 0.12;
    if (y > bottom + margin || y < top - margin) return null;
    return THREE.MathUtils.clamp((bottom - y) / (bottom - top), 0, 1) * (RINGS - 1);
  }

  /** dove era il dito al fotogramma prima (per sapere se si avvicina al centro o si allontana) */
  private dragPrev: { x: number; y: number } | null = null;

  /**
   * Il dito che si muove in orizzontale: verso il centro del vaso lo stringe, verso i lati lo allarga,
   * all'altezza dove sta il dito (e un po' sopra e sotto). Il vaso segue il dito come l'argilla vera.
   */
  private shapeDrag(x: number, y: number) {
    const prev = this.dragPrev;
    this.dragPrev = { x, y };
    if (!prev || !this.vase) return false;
    const rf = this.ringAtHeight(y);
    if (rf === null) return false;
    const c = this.vase.position.clone().setY(this.vase.position.y + (rf / (RINGS - 1)) * VASE_H);
    const { w } = layout.info;
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    const a = c.clone().project(this.camera);
    const b = c.clone().addScaledVector(right, 0.1).project(this.camera);
    const cx = ((a.x + 1) / 2) * w;
    const pxPerM = Math.max(1, (Math.abs(b.x - a.x) / 2) * w / 0.1);
    const dr = (Math.abs(x - cx) - Math.abs(prev.x - cx)) / pxPerM;
    if (!dr) return false;
    for (let i = 0; i < RINGS; i++) {
      const wgt = Math.exp(-((i - rf) ** 2) / (2 * 0.7 ** 2));
      this.radii[i] = THREE.MathUtils.clamp(this.radii[i] + dr * 0.9 * wgt, MIN_R, MAX_R);
    }
    return true;
  }

  private paintAt2(rf: number, dt: number) {
    for (let i = 0; i < RINGS; i++) this.paint[i] = Math.min(1, this.paint[i] + 2.4 * dt * Math.exp(-((i - rf) ** 2) / (2 * 0.9 ** 2)));
  }

  private finishShape() {
    const st = this.step;
    if (!st || st.kind !== 'shape') return;
    const q = this.shapeQuality();
    if (q < 0.7) {
      toast('🏺 Non somiglia ancora alla foto: stringi dove l\'argilla è più larga del disegno', 'bad');
      return;
    }
    this.quality = q;
    toast(q >= 0.92 ? '✨ Forma perfetta!' : '👍 Forma riuscita', 'good');
    this.next();
  }

  private redoShape() {
    if (this.step?.kind !== 'shape') return;
    this.radii = Array(RINGS).fill(LUMP_R);
    this.refreshVase();
    toast('♻️ Argilla impastata di nuovo: ricomincia a modellare', 'info');
  }

  // ---------------- scheda con la foto del vaso (in alto a destra) ----------------

  private cardKey = '';

  private updateCard() {
    const st = this.step;
    const shaping = st?.kind === 'shape';
    const q = this.shapeQuality();
    const def = VASES[this.order.shape];
    const shown = this.idx <= 2 ? this.radii : null;
    const html = `<div class="pc-title">📷 ${def.name}</div>
      ${vaseSvg(this.target, this.glaze, { w: 76, h: 84, current: shown ?? undefined })}
      <div class="pc-sub">${shaping ? `Forma <b>${Math.round(q * 100)}%</b>` : this.idx < 2 ? 'Da modellare' : `Smalto ${this.glazeName}`}</div>
      ${shaping ? `<div class="pc-btns"><button class="pc-btn ok" data-p="ok" ${q < 0.7 ? 'disabled' : ''}>✅ Fatto</button><button class="pc-btn" data-p="redo" aria-label="Rifai">♻️</button></div>` : ''}`;
    if (html === this.cardKey) return;
    this.cardKey = html;
    this.card.innerHTML = html;
  }

  // ---------------- entrata/uscita ----------------

  enter(player: Character) {
    this.player = player;
    player.root.position.copy(this.door).add(new THREE.Vector3(0.7, 0, -0.6));
    this.scene.add(player.root);
    player.body.visible = false;
    this.game.input.lookMode = true;
    this.game.input.cancel();
    this.yaw = Math.atan2(this.clayAt.x - player.root.position.x, -(this.clayAt.z - player.root.position.z));
    // la foto del vaso al posto della minimappa
    document.querySelector('.hud-right')?.prepend(this.card);
    document.body.classList.add('pottery-on');
    this.updateCard();
    this.resize();
    requestAnimationFrame(() => {
      this.offLayout = layout.on(() => this.resize());
    });
    toast(`🏺 Lavoro su richiesta: ${VASES[this.order.shape].name} ${this.glazeName}. Inizia dall'argilla`, 'info');
  }

  exit() {
    this.player.body.visible = true;
    this.game.input.lookMode = false;
    this.game.input.onActionClaim = null;
    this.offLayout?.();
    this.offLayout = null;
    this.camera.clearViewOffset();
    this.player.hold();
    this.scene.remove(this.player.root);
    this.card.remove();
    document.body.classList.remove('pottery-on');
    // la scritta dell'ultima azione non resta in città
    this.game.ui.setAction(null);
  }

  private resize = () => {
    const free = layout.freeRect(STUDIO_UI());
    const { w, h } = layout.info;
    this.camera.aspect = w / h;
    this.camera.fov = firstPersonFov(w / h);
    this.camera.setViewOffset(w, h, -(free.x + free.w / 2 - w / 2), -(free.y + free.h / 2 - h / 2), w, h);
    this.camera.updateProjectionMatrix();
  };

  // ---------------- gioco ----------------

  private get step(): Step | null {
    return this.steps[this.idx] ?? null;
  }

  private next() {
    const st = this.step;
    if (!st) return;
    st.onDone?.();
    this.idx++;
    if (this.vase) this.refreshVase();
    this.updateCard();
  }

  /** Per il tutorial e le prove: cosa fare adesso. */
  guide(): RunGuide | null {
    const st = this.step;
    if (!st) return null;
    const p = this.player.root.position;
    const near = Math.hypot(p.x - st.stand.x, p.z - st.stand.z) < 1.3;
    const task: Task = { pos: st.stand, kind: st.kind === 'tap' ? 'tap' : 'hold', label: st.label, icon: st.icon };
    return { phase: this.idx, phases: this.steps.length, phaseName: st.label, phaseIcon: st.icon, left: 1, task, near, inZone: true, arrived: true };
  }

  private finish(stars: number) {
    if (this.ended) return;
    this.ended = true;
    this.hooks.done(stars);
  }

  private collide(p: THREE.Vector3) {
    p.x = THREE.MathUtils.clamp(p.x, 0.35, W - 0.35);
    p.z = THREE.MathUtils.clamp(p.z, BACK + 0.35, FRONT - 0.3);
    for (const b of this.blocks) {
      if (p.x < b.minX - 0.3 || p.x > b.maxX + 0.3 || p.z < b.minZ - 0.3 || p.z > b.maxZ + 0.3) continue;
      const pushes = [b.minX - 0.3 - p.x, b.maxX + 0.3 - p.x, b.minZ - 0.3 - p.z, b.maxZ + 0.3 - p.z];
      const i = pushes.map(Math.abs).indexOf(Math.min(...pushes.map(Math.abs)));
      if (i < 2) p.x += pushes[i];
      else p.z += pushes[i];
    }
  }

  /** dove guardare per il passo attuale (il vaso o il mobile) */
  private lookTarget() {
    const st = this.step;
    if (!st) return null;
    const o = st.obj();
    if (!o) return null;
    const v = new THREE.Vector3();
    new THREE.Box3().setFromObject(o).getCenter(v);
    return v;
  }

  update(dt: number) {
    if (this.ended) return;
    if (!this.hooks.frozen()) this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      toast('⏰ Tempo scaduto: il cliente non ha avuto il suo vaso', 'bad');
      this.finish(0);
      return;
    }
    const st = this.step;
    this.hooks.status(this.timeLeft, this.timeTotal, `${st ? `${st.icon} ${st.label}` : 'Finito!'}${this.held ? ` · in mano ${this.held}` : ''}`);
    const input = this.game.input;
    input.consumeTap();
    // movimento (joystick: "su" = avanti, dove guardi)
    const iv = input.vector;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const v = { x: cy * iv.x - sy * iv.y, y: sy * iv.x + cy * iv.y };
    const p = this.player.root.position;
    // al tornio la visuale è bloccata sul vaso: niente camminare
    const locked = st?.kind === 'shape' && !!this.vase;
    if (!locked && Math.hypot(v.x, v.y) > 0.05) {
      p.x += v.x * 3.6 * dt;
      p.z += v.y * 3.6 * dt;
      this.collide(p);
    }
    // il tornio gira sempre; il vaso gira con lui finché è sopra
    this.spin += dt * 7;
    this.disc.rotation.y = this.spin;
    if (this.vase && this.idx <= 3) this.vase.rotation.y = this.spin;
    if (locked) this.placeShapeCam(dt);
    else this.placeEyes(dt);
    this.fx.update(dt);
    // essiccatoio: 5 s
    if (st?.kind === 'dry') {
      this.dryT += dt;
      st.progress = Math.min(1, this.dryT / 5);
      if (Math.random() < dt * 6) this.fx.emit('smoke', this.dryAt.clone().setY(1.0).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, 0)), 1);
      if (this.dryT >= 5) {
        toast('🌬️ Vaso essiccato: prendilo', 'good');
        this.next();
      }
    }
    this.interact(dt);
    this.uiT += dt;
    if (this.uiT > 0.15) {
      this.uiT = 0;
      this.updateCard();
    }
  }

  private uiT = 0;

  private interact(dt: number) {
    const input = this.game.input;
    const st = this.step;
    const ui = this.game.ui;
    if (!st) {
      ui.setAction(null);
      return;
    }
    const p = this.player.root.position;
    const near = Math.hypot(p.x - st.stand.x, p.z - st.stand.z) < (st.kind === 'shape' || st.kind === 'paint' ? 1.6 : 1.3);
    this.ringObj.visible = st.kind === 'tap' && !near;
    this.ringObj.position.copy(st.stand).setY(0.05);
    // modellare e dipingere: il dito direttamente sul vaso
    const aim = st.kind === 'shape' || st.kind === 'paint';
    input.onActionClaim = aim && near ? (st.kind === 'shape' ? (_x, y) => this.ringAtHeight(y) !== null : (x, y) => this.ringUnder(x, y) !== null) : null;
    const obj = st.obj();
    const at = this.lookTarget() ?? st.stand.clone().setY(1);
    if (!near) {
      input.consumeAction();
      ui.setAction(null);
      return;
    }
    if (aim) {
      if (st.kind === 'shape') {
        // il dito che scorre in orizzontale stringe o allarga il vaso
        if (input.actionHeld && input.actionPos) {
          if (this.shapeDrag(input.actionPos.x, input.actionPos.y)) {
            this.refreshVase();
            const rf = this.ringAtHeight(input.actionPos.y);
            if (rf !== null && Math.random() < 0.35) this.fx.emit('bubble', this.vase!.position.clone().setY(this.vase!.position.y + (rf / (RINGS - 1)) * VASE_H), 1, 0xb5764f);
          }
        } else this.dragPrev = null;
      }
      const rf = st.kind === 'paint' && input.actionHeld && input.actionPos ? this.ringUnder(input.actionPos.x, input.actionPos.y) : null;
      if (rf !== null) {
        this.paintAt2(rf, dt);
        if (Math.random() < dt * 10) this.fx.emit('paint', this.vase!.position.clone().setY(this.vase!.position.y + (rf / (RINGS - 1)) * VASE_H), 1, this.glaze);
        this.refreshVase();
      }
      if (st.kind === 'shape') {
        const q = this.shapeQuality();
        // forma quasi perfetta: si chiude da sola
        if (q >= 0.97 && !input.actionHeld) this.finishShape();
        ui.setAction({ label: st.label, icon: st.icon, progress: q, at, obj });
      } else {
        const done = this.paint.reduce((a, x) => a + x, 0) / RINGS;
        if (this.paint.every((x) => x >= 0.95)) {
          toast('🎨 Vaso dipinto!', 'good');
          this.next();
        }
        ui.setAction({ label: st.label, icon: st.icon, progress: done, at, obj });
      }
      input.consumeAction();
      return;
    }
    if (st.kind === 'dry') {
      input.consumeAction();
      ui.setAction({ label: `${st.label} ${Math.max(0, Math.ceil(5 - this.dryT))} s`, icon: st.icon, progress: st.progress ?? 0, at, obj });
      return;
    }
    if (st.kind === 'hold') {
      if (input.actionHeld) {
        st.progress = (st.progress ?? 0) + dt / (st.sec ?? 1.2);
        if (st.progress >= 1) {
          input.consumeAction();
          this.next();
          return;
        }
      }
      ui.setAction({ label: `Tieni premuto: ${st.label}`, icon: st.icon, progress: st.progress ?? 0, at, obj });
      input.consumeAction();
      return;
    }
    if (input.consumeAction()) {
      this.next();
      return;
    }
    ui.setAction({ label: st.label, icon: st.icon, at, obj, stand: st.stand });
  }

  private lockT = 0;
  /** distanza della camera dal vaso al tornio (segue piano la larghezza del vaso) */
  private camD = 0;
  private camFrom: { pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;

  /**
   * Al tornio: la visuale si blocca e il vaso riempie la zona libera dello schermo (grande e al
   * centro, visto un po' dall'alto per vedere la bocca), così si vede bene dove stringere.
   * Si arriva con un passaggio morbido dalla vista di prima; sguardo e joystick non la spostano.
   */
  private placeShapeCam(dt: number) {
    const input = this.game.input;
    input.consumeLook();
    const cam = this.camera;
    if (this.lockT === 0) this.camFrom = { pos: cam.position.clone(), quat: cam.quaternion.clone() };
    this.lockT = Math.min(1, this.lockT + dt / 0.45);
    const free = layout.freeRect(STUDIO_UI());
    const { w, h } = layout.info;
    // zoom stretto (come un teleobiettivo): il vaso grande e dritto, senza la deformazione della
    // visuale larga della prima persona; finita la forma si torna alla visuale di sempre
    const zoom = THREE.MathUtils.lerp(firstPersonFov(w / h), 30, THREE.MathUtils.smoothstep(this.lockT, 0, 1));
    if (Math.abs(cam.fov - zoom) > 0.01) {
      cam.fov = zoom;
      cam.updateProjectionMatrix();
    }
    const vf = THREE.MathUtils.degToRad(30);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
    // il vaso com'è adesso (non il più largo possibile) riempie quasi tutta la zona libera:
    // ~90% dell'altezza o della larghezza libera; se lo allarghi la camera si allontana piano
    const wide = Math.max(...this.radii) * 2 + 0.05;
    const dH = (VASE_H + 0.06) / (0.9 * (free.h / h) * 2 * Math.tan(vf / 2));
    const dW = wide / (0.9 * (free.w / w) * 2 * Math.tan(hf / 2));
    const fit = Math.max(dH, dW, 0.5);
    this.camD = this.camD ? this.camD + (fit - this.camD) * Math.min(1, dt * 3) : fit;
    const d = this.camD;
    const c = this.vase!.position.clone().setY(this.vase!.position.y + VASE_H / 2);
    // dalla parte dove sta il giocatore (davanti al tornio), appena dall'alto (si vede la bocca)
    const dir = new THREE.Vector3(this.player.root.position.x - c.x, 0, this.player.root.position.z - c.z);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    const tilt = 0.14;
    const want = c.clone().addScaledVector(dir, d * Math.cos(tilt)).setY(c.y + d * Math.sin(tilt));
    const look = new THREE.Matrix4().lookAt(want, c, new THREE.Vector3(0, 1, 0));
    const wantQ = new THREE.Quaternion().setFromRotationMatrix(look);
    const k = THREE.MathUtils.smoothstep(this.lockT, 0, 1);
    if (this.camFrom && k < 1) {
      cam.position.lerpVectors(this.camFrom.pos, want, k);
      cam.quaternion.slerpQuaternions(this.camFrom.quat, wantQ, k);
    } else {
      cam.position.copy(want);
      cam.quaternion.copy(wantQ);
    }
    // a lavoro finito si riparte guardando il vaso
    this.yaw = Math.atan2(c.x - this.player.root.position.x, -(c.z - this.player.root.position.z));
    this.pitch = -0.55;
    this.player.body.visible = false;
    this.scene.traverse((o) => {
      const sp = o as THREE.Sprite;
      if (sp.isSprite) sp.material.opacity = 0;
    });
  }

  /**
   * Occhi del personaggio, come negli altri lavoretti in prima persona: la visuale col dito, e
   * dopo 3 s fermo la testa si gira da sola verso ciò che serve (se non si vede già).
   */
  private placeEyes(dt: number) {
    if (this.lockT > 0) this.resize();
    this.lockT = 0;
    this.camD = 0;
    const input = this.game.input;
    const l = input.consumeLook();
    const busy = l.x || l.y || Math.hypot(input.vector.x, input.vector.y) > 0.05 || input.actionHeld || input.actionPos;
    if (busy) this.lookIdle = 0;
    else this.lookIdle += dt;
    const { w, h } = layout.info;
    this.yaw += l.x * (Math.PI / Math.max(320, w));
    this.pitch = THREE.MathUtils.clamp(this.pitch - l.y * ((Math.PI * 0.55) / Math.max(480, h)), -1.1, 0.35);
    const p = this.player.root.position;
    const t = this.lookTarget();
    if (t && this.lookIdle > 3 && !this.game.onScreen(t, this.camera)) {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      let dy = Math.atan2(t.x - p.x, -(t.z - p.z)) - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const k = Math.min(1, dt * 2.2);
      if (d > 0.3) this.yaw += dy * k;
      const wantPitch = THREE.MathUtils.clamp(-Math.atan2(1.6 - t.y, Math.max(d, 0.5)), -0.9, 0.1);
      this.pitch += (wantPitch - this.pitch) * k;
    }
    const moving = Math.hypot(input.vector.x, input.vector.y) > 0.1;
    this.bob += moving ? dt * 9 : 0;
    const bob = moving ? Math.sin(this.bob) * 0.03 : 0;
    this.camera.position.set(p.x, 1.6 + bob, p.z);
    this.camera.rotation.set(this.pitch, -this.yaw, 0, 'YXZ');
    this.player.root.rotation.y = Math.PI - this.yaw;
    this.player.body.visible = false;
    if (this.player.held) this.player.held.visible = false;
    // cartellini più piccoli e spariti quando sono troppo vicini agli occhi
    const wp = new THREE.Vector3();
    this.scene.traverse((o) => {
      const sp = o as THREE.Sprite;
      if (!sp.isSprite) return;
      sp.userData.baseScale ??= sp.scale.clone();
      sp.scale.copy(sp.userData.baseScale).multiplyScalar(0.5);
      sp.getWorldPosition(wp);
      sp.material.transparent = true;
      sp.material.opacity = wp.distanceTo(this.camera.position) < 1.4 ? 0 : 1;
    });
  }
}
