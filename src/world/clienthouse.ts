import * as THREE from 'three';
import { model } from '../assets';
import { JOB } from '../config/balance';
import { PRODUCTS, type ProductId } from '../config/products';
import type { Game } from '../game';
import { toast } from '../sim/bus';
import type { Character } from './character';
import { label } from './props';
import { Particles } from './particles';
import { updateCutWalls, type CutWall } from './viewcam';

export const HOUSE_ASSETS = [
  'furniture/loungeSofa.glb', 'furniture/bedDouble.glb', 'furniture/tableCoffee.glb', 'furniture/lampRoundFloor.glb',
  'furniture/rugRectangle.glb', 'furniture/televisionModern.glb', 'furniture/cabinetTelevision.glb',
  'furniture/bookcaseClosedWide.glb', 'furniture/pottedPlant.glb', 'furniture/chair.glb', 'furniture/cardboardBoxClosed.glb',
  'furniture/desk.glb',
];

const ROOM_W = 5.6;
const LEFT = 0;
const BACK = -2.3;
const FRONT = 2.1;
const FURN = 2.3;

type Tool = 'spugna' | 'piumino' | 'tergivetro';
const TOOLS: Record<Tool, { icon: string; name: string }> = {
  spugna: { icon: '🧽', name: 'Spugna' },
  piumino: { icon: '🪶', name: 'Piumino' },
  tergivetro: { icon: '🧴', name: 'Tergivetro' },
};

interface Dirt {
  tool: Tool;
  pos: THREE.Vector3;
  obj: THREE.Object3D;
  cut: number;
  done: boolean;
}

/** Oggetto da portare via nel trasloco. */
interface Thing {
  kind: 'box' | 'loose' | 'heavy';
  name: string;
  icon: string;
  pos: THREE.Vector3;
  obj: THREE.Object3D;
  lift: number;
  done: boolean;
  packed: boolean;
}

interface Box2 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Quanto lavoro per ogni servizio. */
const CLEAN_MIX: Partial<Record<ProductId, { rooms: number; spugna: number; piumino: number; tergivetro: number }>> = {
  pulizia_casa: { rooms: 2, spugna: 4, piumino: 3, tergivetro: 2 },
  pulizia_uffici: { rooms: 3, spugna: 5, piumino: 4, tergivetro: 3 },
  vetri: { rooms: 2, spugna: 0, piumino: 1, tergivetro: 5 },
};
const MOVE_MIX: Partial<Record<ProductId, { rooms: number; box: number; loose: number; heavy: number }>> = {
  trasloco_piccolo: { rooms: 2, box: 3, loose: 2, heavy: 1 },
  trasloco_grande: { rooms: 3, box: 5, loose: 3, heavy: 2 },
  sgombero: { rooms: 1, box: 2, loose: 4, heavy: 1 },
};

export interface HouseRunHooks {
  /** aggiorna la barra in alto (tempo e stato) */
  status(timeLeft: number, timeTotal: number, text: string): void;
  done(stars: number): void;
}

/**
 * Casa del cliente per le imprese di servizi, in 3D.
 * Pulizie: prendi l'attrezzo giusto dal carrello e pulisci macchie, polvere e vetri.
 * Traslochi: imballa gli oggetti sparsi, solleva i mobili pesanti, porta tutto al furgone.
 */
export class ClientHouse {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.3, 120);
  readonly width: number;
  private player!: Character;
  private blocks: Box2[] = [];
  private dirts: Dirt[] = [];
  private things: Thing[] = [];
  private tool: Tool | null = null;
  private carrying: Thing | null = null;
  private toolSprite: THREE.Sprite | null = null;
  private cart = new THREE.Vector3(1, 0, 1.3);
  private packTable = new THREE.Vector3(2.6, 0, 1.2);
  private van = new THREE.Vector3(0.8, 0, 1.6);
  private door = new THREE.Vector3(0.8, 0, 1.6);
  private timeLeft: number;
  private timeTotal: number;
  private ended = false;
  private camX = 0;
  private view = { half: 4, d: 10, pitch: 1, z: 0.3 };
  private cleaning: boolean;
  private walls: CutWall[] = [];
  private fx = new Particles();

  constructor(private game: Game, private pid: ProductId, level: number, private hooks: HouseRunHooks) {
    this.cleaning = !!CLEAN_MIX[pid];
    const rooms = (this.cleaning ? CLEAN_MIX[pid]!.rooms : MOVE_MIX[pid]?.rooms) ?? 2;
    this.width = rooms * ROOM_W;
    this.buildRooms(rooms);
    const speed = Math.max(0.7, 1 - level * 0.03);
    if (this.cleaning) {
      const mix = CLEAN_MIX[pid]!;
      this.placeCleaning(mix, rooms);
      const n = mix.spugna + mix.piumino + mix.tergivetro;
      this.timeTotal = (n * 4.2 + rooms * 5 + 8) * speed;
    } else {
      const mix = MOVE_MIX[pid] ?? MOVE_MIX.trasloco_piccolo!;
      this.placeMoving(mix, rooms);
      this.timeTotal = ((mix.box + mix.loose) * 6 + mix.heavy * 9 + rooms * 4 + 8) * speed;
    }
    this.timeLeft = this.timeTotal;
  }

  private get center() {
    return LEFT + this.width / 2;
  }

  // ---------------- costruzione ----------------

  private buildRooms(rooms: number) {
    const s = this.scene;
    s.background = new THREE.Color(0x2a3350);
    s.add(new THREE.HemisphereLight(0xffffff, 0x6a5a4a, 1.7));
    s.add(this.fx.group);
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(this.center - 3, 9, 7);
    sun.target.position.set(this.center, 0, 0);
    s.add(sun, sun.target);
    const W = this.width;
    const D = FRONT - BACK;
    const floors = [0xe8d5b5, 0xd9e6f2, 0xe6dccb];
    const walls = [0xfff3c4, 0xd7f0ff, 0xffe0ec];
    for (let r = 0; r < rooms; r++) {
      const x0 = LEFT + r * ROOM_W;
      const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.1, D), new THREE.MeshLambertMaterial({ color: floors[r % 3] }));
      floor.position.set(x0 + ROOM_W / 2, 0, (BACK + FRONT) / 2);
      s.add(floor);
      const back = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 2.4, 0.15), new THREE.MeshLambertMaterial({ color: walls[r % 3] }));
      back.position.set(x0 + ROOM_W / 2, 1.2, BACK - 0.08);
      s.add(back);
      this.walls.push({ obj: back, at: back.position.clone(), out: new THREE.Vector3(0, 0, -1) });
      // parete interna con passaggio
      if (r > 0) {
        const wallMat = new THREE.MeshLambertMaterial({ color: 0xbfae98 });
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, D - 1.6), wallMat);
        a.position.set(x0, 0.6, BACK + (D - 1.6) / 2);
        s.add(a);
        this.blocks.push({ minX: x0 - 0.15, maxX: x0 + 0.15, minZ: BACK, maxZ: BACK + D - 1.6 });
      }
    }
    const sideMat = new THREE.MeshLambertMaterial({ color: 0xbfae98 });
    for (const x of [LEFT, LEFT + W]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, D), sideMat);
      side.position.set(x, 0.6, (BACK + FRONT) / 2);
      s.add(side);
      this.walls.push({ obj: side, at: side.position.clone(), out: new THREE.Vector3(x === LEFT ? -1 : 1, 0, 0) });
    }
    // parete davanti bassa (si vede dentro) con la porta d'ingresso a sinistra
    const front = new THREE.Mesh(new THREE.BoxGeometry(W - 1.6, 0.5, 0.15), sideMat);
    front.position.set(LEFT + 1.6 + (W - 1.6) / 2, 0.25, FRONT);
    s.add(front);
    this.walls.push({ obj: front, at: front.position.clone(), out: new THREE.Vector3(0, 0, 1) });
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.9), new THREE.MeshLambertMaterial({ color: 0x4cd07d }));
    mat.position.set(this.door.x, 0.06, this.door.z);
    s.add(mat);
    this.tag(this.cleaning ? '🚪 Esci' : '🚚 Furgone / 🚪 Esci', this.door, 0.9);
    const title = label(`${PRODUCTS[this.pid].icon} ${PRODUCTS[this.pid].name}`, { bg: this.cleaning ? '#2d9cdb' : '#6a3cb0', scale: 0.45 });
    title.position.set(this.center, 2.8, BACK);
    s.add(title);
  }

  private tag(t: string, v: THREE.Vector3, y: number, scale = 0.3) {
    const l = label(t, { scale });
    l.position.set(v.x, y, v.z);
    this.scene.add(l);
    return l;
  }

  /** Mette un mobile centrato in (x, z) e ne registra l'ingombro. */
  private furniture(path: string, x: number, z: number, scale = FURN, rot = 0, block = true) {
    const o = model(path, scale);
    o.rotation.y = rot;
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    o.position.set(x - c.x, 0.05, z - c.z);
    this.scene.add(o);
    const size = box.getSize(new THREE.Vector3());
    if (block) this.blocks.push({ minX: x - size.x / 2, maxX: x + size.x / 2, minZ: z - size.z / 2, maxZ: z + size.z / 2 });
    return { obj: o, top: size.y };
  }

  /** Arredamento di base di ogni stanza (soggiorno, camera, studio). */
  private decorate(r: number) {
    const x0 = LEFT + r * ROOM_W;
    const kind = r % 3;
    this.furniture('furniture/rugRectangle.glb', x0 + ROOM_W / 2, 0, 2.2, 0, false);
    if (kind === 0) {
      this.furniture('furniture/loungeSofa.glb', x0 + ROOM_W / 2 + 0.6, BACK + 0.6);
      this.furniture('furniture/tableCoffee.glb', x0 + ROOM_W / 2 + 0.6, -0.4, 2);
      this.furniture('furniture/lampRoundFloor.glb', x0 + ROOM_W - 0.6, BACK + 0.5);
    } else if (kind === 1) {
      this.furniture('furniture/bedDouble.glb', x0 + ROOM_W / 2, BACK + 1.9, 1.9);
      this.furniture('furniture/pottedPlant.glb', x0 + ROOM_W - 0.6, BACK + 0.5);
    } else {
      this.furniture('furniture/desk.glb', x0 + ROOM_W / 2, BACK + 0.7);
      this.furniture('furniture/bookcaseClosedWide.glb', x0 + ROOM_W - 1.2, BACK + 0.4);
    }
  }

  /** Punto libero sul pavimento di una stanza, lontano da mobili e altri punti. */
  private freeSpot(r: number, taken: THREE.Vector3[], zMin = BACK + 0.6, zMax = FRONT - 0.6) {
    const x0 = LEFT + r * ROOM_W;
    for (let i = 0; i < 80; i++) {
      const v = new THREE.Vector3(x0 + 0.6 + Math.random() * (ROOM_W - 1.2), 0, zMin + Math.random() * (zMax - zMin));
      if (v.distanceTo(this.door) < 1.4) continue;
      if (this.blocks.some((b) => v.x > b.minX - 0.3 && v.x < b.maxX + 0.3 && v.z > b.minZ - 0.3 && v.z < b.maxZ + 0.3)) continue;
      if (taken.some((t) => t.distanceTo(v) < 1)) continue;
      return v;
    }
    return new THREE.Vector3(x0 + ROOM_W / 2, 0, 0.8);
  }

  private placeCleaning(mix: { rooms: number; spugna: number; piumino: number; tergivetro: number }, rooms: number) {
    for (let r = 0; r < rooms; r++) this.decorate(r);
    // carrello degli attrezzi vicino all'ingresso
    this.furniture('furniture/cabinetTelevision.glb', this.cart.x + 0.8, this.cart.z - 0.2, 1.8);
    this.tag('🧰 Carrello attrezzi', new THREE.Vector3(this.cart.x + 0.8, 0, this.cart.z - 0.2), 1.25);
    const taken: THREE.Vector3[] = [];
    const add = (tool: Tool, pos: THREE.Vector3, obj: THREE.Object3D) => {
      this.scene.add(obj);
      this.dirts.push({ tool, pos, obj, cut: 0, done: false });
      taken.push(pos);
    };
    for (let i = 0; i < mix.spugna; i++) {
      const p = this.freeSpot(i % rooms, taken);
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.4, 14), new THREE.MeshBasicMaterial({ color: 0x5d4037, transparent: true, opacity: 0.8, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.07;
      g.add(m);
      g.position.copy(p);
      add('spugna', p, g);
    }
    for (let i = 0; i < mix.piumino; i++) {
      // polvere e ragnatele: sui mobili lungo la parete di fondo
      const r = i % rooms;
      const p = new THREE.Vector3(LEFT + r * ROOM_W + 0.7 + Math.random() * (ROOM_W - 1.4), 0, BACK + 1.25);
      const g = new THREE.Group();
      const puff = new THREE.MeshLambertMaterial({ color: 0x9e9e9e, transparent: true, opacity: 0.85 });
      for (let k = 0; k < 4; k++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.16 + Math.random() * 0.1, 8, 6), puff);
        m.position.set((Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 0.3, -0.5 + (Math.random() - 0.5) * 0.3);
        g.add(m);
      }
      const web = label('🕸️', { bg: 'rgba(0,0,0,0)', scale: 0.5 });
      web.position.set(0, 1.7, -0.5);
      g.add(web);
      g.position.copy(p);
      add('piumino', p, g);
    }
    for (let i = 0; i < mix.tergivetro; i++) {
      // finestre appannate sulla parete di fondo
      const r = i % rooms;
      const slot = Math.floor(i / rooms);
      const x = LEFT + r * ROOM_W + 1.1 + slot * 1.6;
      const p = new THREE.Vector3(Math.min(x, LEFT + (r + 1) * ROOM_W - 0.8), 0, BACK + 0.9);
      const g = new THREE.Group();
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), new THREE.MeshLambertMaterial({ color: 0x9fd3f0 }));
      glass.position.set(0, 1.5, -1.0);
      const fog = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
      fog.position.set(0, 1.5, -0.98);
      fog.name = 'fog';
      g.add(glass, fog);
      g.position.copy(p);
      add('tergivetro', p, g);
    }
  }

  private placeMoving(mix: { rooms: number; box: number; loose: number; heavy: number }, rooms: number) {
    for (let r = 0; r < rooms; r++) {
      const x0 = LEFT + r * ROOM_W;
      this.furniture('furniture/rugRectangle.glb', x0 + ROOM_W / 2, 0, 2.2, 0, false);
    }
    // banco per imballare e zona furgone all'ingresso
    this.furniture('furniture/desk.glb', this.packTable.x, this.packTable.z - 0.1, 1.8);
    this.tag('📦 Banco imballaggio', this.packTable, 1.4);
    const taken: THREE.Vector3[] = [];
    const loose = [
      { name: 'Lampada', icon: '💡', path: 'furniture/lampRoundFloor.glb' },
      { name: 'Pianta', icon: '🪴', path: 'furniture/pottedPlant.glb' },
      { name: 'Televisore', icon: '📺', path: 'furniture/televisionModern.glb' },
      { name: 'Sedia', icon: '🪑', path: 'furniture/chair.glb' },
    ];
    const heavy = [
      { name: 'Divano', icon: '🛋️', path: 'furniture/loungeSofa.glb', scale: 2 },
      { name: 'Libreria', icon: '📚', path: 'furniture/bookcaseClosedWide.glb', scale: 2 },
    ];
    const addThing = (kind: Thing['kind'], name: string, icon: string, path: string, r: number, scale: number) => {
      const p = this.freeSpot(r, taken);
      taken.push(p);
      const o = model(path, scale);
      const box = new THREE.Box3().setFromObject(o);
      const c = box.getCenter(new THREE.Vector3());
      const g = new THREE.Group();
      o.position.set(-c.x, 0.05, -c.z);
      g.add(o);
      const tag = label(icon, { bg: kind === 'heavy' ? '#ff8a3d' : kind === 'loose' ? '#ffc21a' : '#ffffff', fg: '#000', scale: 0.4 });
      tag.position.y = box.max.y + 0.5;
      g.add(tag);
      g.position.copy(p);
      this.scene.add(g);
      this.things.push({ kind, name, icon, pos: p, obj: g, lift: 0, done: false, packed: kind !== 'loose' });
    };
    for (let i = 0; i < mix.box; i++) addThing('box', 'Scatolone', '📦', 'furniture/cardboardBoxClosed.glb', (i + 1) % rooms, 3.2);
    for (let i = 0; i < mix.loose; i++) {
      const l = loose[i % loose.length];
      addThing('loose', l.name, l.icon, l.path, i % rooms, FURN);
    }
    for (let i = 0; i < mix.heavy; i++) {
      const hv = heavy[i % heavy.length];
      addThing('heavy', hv.name, hv.icon, hv.path, (rooms - 1 - i + rooms) % rooms, hv.scale);
    }
  }

  // ---------------- entrata/uscita ----------------

  enter(player: Character) {
    this.player = player;
    player.root.position.copy(this.door).add(new THREE.Vector3(0.8, 0, -0.6));
    player.root.rotation.y = Math.PI;
    this.scene.add(player.root);
    this.resize();
    window.addEventListener('resize', this.resize);
    toast(this.cleaning
      ? '🧰 Prendi l\'attrezzo giusto dal carrello e pulisci tutto!'
      : '📦 Imballa gli oggetti sparsi, poi porta tutto al furgone (tappeto verde)', 'info');
  }

  exit() {
    window.removeEventListener('resize', this.resize);
    this.setToolSprite(null);
    this.player.hold();
    this.scene.remove(this.player.root);
  }

  private resize = () => {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = aspect;
    const half = Math.min(this.width / 2 + 0.7, aspect < 1 ? 4.4 : 7.5);
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(25)) * aspect);
    this.view = {
      half,
      d: Math.max(aspect < 1 ? 9.5 : 11.5, half / Math.tan(hfov / 2)),
      pitch: THREE.MathUtils.degToRad(aspect < 1 ? 60 : 56),
      z: aspect < 1 ? 0.2 : 0.5,
    };
    this.camera.updateProjectionMatrix();
    this.placeCamera(true);
  };

  private placeCamera(snap = false) {
    const v = this.view;
    const min = LEFT + v.half - 0.7;
    const max = LEFT + this.width - v.half + 0.7;
    const want = min >= max ? this.center : THREE.MathUtils.clamp(this.player?.root.position.x ?? this.center, min, max);
    this.camX = snap ? want : this.camX + (want - this.camX) * 0.08;
    this.game.view.place(this.camera, new THREE.Vector3(this.camX, 0, v.z), v.d, v.pitch, this.player?.root.position);
    updateCutWalls(this.walls, this.camera);
  }

  // ---------------- aggiornamento ----------------

  private stars() {
    const f = this.timeLeft / this.timeTotal;
    return f >= JOB.STAR3 ? 3 : f >= JOB.STAR2 ? 2 : 1;
  }

  private finish(stars: number) {
    if (this.ended) return;
    this.ended = true;
    this.hooks.done(stars);
  }

  update(dt: number) {
    if (this.ended) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      toast('⏰ Tempo scaduto: il cliente non è soddisfatto', 'bad');
      this.finish(0);
      return;
    }
    const left = this.cleaning ? this.dirts.filter((d) => !d.done).length : this.things.filter((t) => !t.done).length;
    const total = this.cleaning ? this.dirts.length : this.things.length;
    const what = this.cleaning ? 'Sporco pulito' : 'Oggetti nel furgone';
    const hint = this.cleaning
      ? this.tool ? `in mano: ${TOOLS[this.tool].icon}` : 'prendi un attrezzo 🧰'
      : this.carrying ? `in mano: ${this.carrying.icon}` : 'porta tutto al 🚚';
    this.hooks.status(this.timeLeft, this.timeTotal, `${what}: ${total - left}/${total} · ${hint}`);
    this.movePlayer(dt);
    this.placeCamera();
    this.fx.update(dt);
    this.game.ui.setAction(this.cleaning ? this.cleanInteract(dt) : this.moveInteract(dt));
  }

  private collide(p: THREE.Vector3) {
    p.x = THREE.MathUtils.clamp(p.x, LEFT + 0.35, LEFT + this.width - 0.35);
    p.z = THREE.MathUtils.clamp(p.z, BACK + 0.35, FRONT - 0.3);
    for (const b of this.blocks) {
      if (p.x < b.minX - 0.3 || p.x > b.maxX + 0.3 || p.z < b.minZ - 0.3 || p.z > b.maxZ + 0.3) continue;
      const pushes = [b.minX - 0.3 - p.x, b.maxX + 0.3 - p.x, b.minZ - 0.3 - p.z, b.maxZ + 0.3 - p.z];
      const i = pushes.map(Math.abs).indexOf(Math.min(...pushes.map(Math.abs)));
      if (i < 2) p.x += pushes[i];
      else p.z += pushes[i];
    }
  }

  private movePlayer(dt: number) {
    const input = this.game.input;
    const v = this.game.moveVector();
    input.consumeTap();
    const p = this.player.root.position;
    const len = Math.hypot(v.x, v.y);
    // con un mobile pesante si cammina piano
    const speed = this.carrying?.kind === 'heavy' ? 2.2 : 4;
    if (len > 0.05) {
      p.x += v.x * speed * dt;
      p.z += v.y * speed * dt;
      this.collide(p);
      this.player.faceTowards(p.x + v.x, p.z + v.y, dt);
      this.player.play(this.carrying ? 'holding-both' : 'walk');
    } else if (this.player.currentName === 'walk') this.player.play('idle');
  }

  private near(v: THREE.Vector3, r = 1.2) {
    const p = this.player.root.position;
    return Math.hypot(p.x - v.x, p.z - v.z) < r;
  }

  private setToolSprite(text: string | null) {
    if (this.toolSprite) this.player.root.remove(this.toolSprite);
    this.toolSprite = null;
    if (!text) return;
    this.toolSprite = label(text, { bg: '#ffffff', fg: '#3a2f55', scale: 0.5 });
    this.toolSprite.position.y = 2.3;
    this.player.root.add(this.toolSprite);
  }

  // ---- pulizie ----

  private cleanInteract(dt: number): { label: string; icon: string; progress?: number } | null {
    const input = this.game.input;
    if (this.near(this.door, 0.8) && this.dirts.every((d) => d.done)) {
      if (input.consumeAction()) this.finish(this.stars());
      return { label: 'Lavoro finito: esci', icon: '🚪' };
    }
    // carrello: cambia attrezzo (spugna → piumino → tergivetro)
    if (this.near(new THREE.Vector3(this.cart.x + 0.8, 0, this.cart.z), 1.3)) {
      const order: Tool[] = ['spugna', 'piumino', 'tergivetro'];
      const nextTool = order[(order.indexOf(this.tool ?? 'tergivetro') + 1) % 3];
      if (input.consumeAction()) {
        this.tool = nextTool;
        this.setToolSprite(`${TOOLS[nextTool].icon} ${TOOLS[nextTool].name}`);
        this.player.once('pick-up');
      }
      return { label: `Prendi ${TOOLS[nextTool].name}`, icon: TOOLS[nextTool].icon };
    }
    let best: Dirt | null = null;
    let bd = Infinity;
    const p = this.player.root.position;
    for (const d of this.dirts) {
      if (d.done) continue;
      const dist = Math.hypot(p.x - d.pos.x, p.z - d.pos.z);
      if (dist < 1.2 && dist < bd) {
        best = d;
        bd = dist;
      }
    }
    if (!best) {
      input.consumeAction();
      if (this.dirts.every((d) => d.done)) return { label: 'Tutto pulito! Esci dalla porta', icon: '✨' };
      return null;
    }
    if (this.tool !== best.tool) {
      input.consumeAction();
      return { label: `Serve: ${TOOLS[best.tool].icon} ${TOOLS[best.tool].name}`, icon: '🧰' };
    }
    if (input.actionHeld) {
      best.cut += dt / 1.3;
      if (Math.random() < dt * 14) {
        const y = best.tool === 'spugna' ? 0.2 : best.tool === 'piumino' ? 1.4 : 1.5;
        const at = best.pos.clone().setY(y);
        if (best.tool === 'tergivetro') at.z -= 0.9;
        else if (best.tool === 'piumino') at.z -= 0.5;
        this.fx.emit(best.tool === 'piumino' ? 'dust' : 'bubble', at, 1);
      }
      this.player.faceTowards(best.pos.x, best.pos.z - (best.tool === 'spugna' ? 0 : 1), dt);
      this.player.play('interact-right', 0.1, 1.6);
      const k = Math.max(0, 1 - best.cut);
      if (best.tool === 'spugna') best.obj.scale.setScalar(Math.max(0.05, k));
      else if (best.tool === 'piumino') best.obj.children.forEach((c) => c.scale.setScalar(Math.max(0.05, k)));
      else {
        const fog = best.obj.getObjectByName('fog') as THREE.Mesh | undefined;
        if (fog) (fog.material as THREE.MeshBasicMaterial).opacity = 0.8 * k;
      }
      if (best.cut >= 1) {
        best.done = true;
        if (best.tool !== 'tergivetro') this.scene.remove(best.obj);
        this.player.play('idle');
        if (this.dirts.every((d) => d.done)) toast('✨ Tutto pulito! Esci dalla porta per finire', 'good');
      }
    }
    return { label: 'Tieni premuto: pulisci', icon: TOOLS[best.tool].icon, progress: best.cut };
  }

  // ---- traslochi ----

  private moveInteract(dt: number): { label: string; icon: string; progress?: number } | null {
    const input = this.game.input;
    const c = this.carrying;
    // zona furgone all'ingresso
    if (this.near(this.van, 1)) {
      if (c && c.packed) {
        if (input.consumeAction()) {
          c.done = true;
          this.carrying = null;
          this.player.hold();
          this.setToolSprite(null);
          this.player.play('idle');
          if (this.things.every((t) => t.done)) this.finish(this.stars());
        }
        return { label: `Carica ${c.name} sul furgone`, icon: '🚚' };
      }
      if (c && !c.packed) {
        input.consumeAction();
        return { label: 'Prima imballalo al banco 📦', icon: '⚠️' };
      }
    }
    if (this.near(this.packTable, 1.3) && c && !c.packed) {
      if (input.actionHeld) {
        c.lift += dt / 1.2;
        if (Math.random() < dt * 10) this.fx.emit('dust', this.packTable.clone().setY(1), 1);
        this.player.play('interact-right', 0.1, 1.5);
        if (c.lift >= 1) {
          c.packed = true;
          c.lift = 0;
          c.icon = '📦';
          const box = model('furniture/cardboardBoxClosed.glb', 3);
          box.position.set(-0.3, 0, 0.1);
          this.player.hold(box);
          this.setToolSprite(`📦 ${c.name} imballato`);
          this.player.play('idle');
        }
      }
      return { label: 'Tieni premuto: imballa', icon: '📦', progress: c.lift };
    }
    if (c) {
      input.consumeAction();
      return { label: c.packed ? 'Portalo al 🚚 furgone' : 'Portalo al 📦 banco', icon: c.icon };
    }
    // prendi l'oggetto più vicino
    let best: Thing | null = null;
    let bd = Infinity;
    const p = this.player.root.position;
    for (const t of this.things) {
      if (t.done || t === c) continue;
      const dist = Math.hypot(p.x - t.pos.x, p.z - t.pos.z);
      if (dist < 1.5 && dist < bd) {
        best = t;
        bd = dist;
      }
    }
    if (!best) {
      input.consumeAction();
      return null;
    }
    const pick = (t: Thing) => {
      this.carrying = t;
      this.scene.remove(t.obj);
      t.lift = 0;
      const o = t.kind === 'box' ? model('furniture/cardboardBoxClosed.glb', 3) : t.obj.children[0].clone();
      if (t.kind === 'box') o.position.set(-0.3, 0, 0.1);
      else o.position.set(0, 0.2, 0.3);
      this.player.hold(o);
      this.setToolSprite(`${t.icon} ${t.name}`);
    };
    if (best.kind === 'heavy') {
      // i mobili pesanti si sollevano tenendo premuto
      if (input.actionHeld) {
        best.lift += dt / 1.6;
        this.player.play('interact-right', 0.1, 1.2);
        if (best.lift >= 1) pick(best);
      } else best.lift = Math.max(0, best.lift - dt);
      return { label: `Tieni premuto: solleva ${best.name}`, icon: best.icon, progress: best.lift };
    }
    if (input.consumeAction()) {
      pick(best);
      this.player.once('pick-up', 'holding-both');
    }
    return { label: `Prendi ${best.name}`, icon: best.icon };
  }
}
