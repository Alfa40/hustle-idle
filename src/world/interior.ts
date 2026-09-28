import * as THREE from 'three';
import { model } from '../assets';
import { BUSINESS } from '../config/balance';
import { PRODUCTS, type ProductId } from '../config/products';
import type { Game } from '../game';
import { toast } from '../sim/bus';
import { missionProgress } from '../sim/calendar';
import {
  employeeGainXp, employeeRate, isOpenHour, lostCustomer, pickProduct, recordSale, restock, totalDemand, upg,
} from '../sim/economy';
import { addFame, addXp } from '../sim/progress';
import type { Business, Employee } from '../sim/state';
import { Character } from './character';
import { label } from './props';
import { CHAR_MODELS } from '../sim/economy';

export const INTERIOR_ASSETS = [
  'furniture/kitchenFridge.glb', 'furniture/kitchenStove.glb', 'furniture/kitchenCabinet.glb',
  'furniture/kitchenCabinetDrawer.glb', 'furniture/kitchenSink.glb', 'food/frying-pan.glb',
];

type Stage = 'wait' | 'cooking' | 'ready';

interface Order {
  id: number;
  pid: ProductId;
  stage: Stage;
  /** minuti di gioco di pazienza rimasti */
  patience: number;
  customer: Character;
  bubble: THREE.Sprite;
  by?: 'player' | number;
  progress: number;
}

interface Worker {
  emp: Employee;
  char: Character;
  home: THREE.Vector3;
  order?: Order;
  t: number;
}

const FURN = 2.3; // scala dei mobili Kenney
const W = 7; // larghezza interno
const D = 4.2; // profondità interno

/**
 * L'interno del food truck: il giocatore prende gli ingredienti dal frigo,
 * cucina sulla piastra (tieni premuto) e serve alla finestra.
 * I dipendenti fanno lo stesso da soli nel loro reparto.
 */
export class TruckInterior {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.3, 100);
  private orders: Order[] = [];
  private workers: Worker[] = [];
  private player!: Character;
  private seq = 1;
  private spawnAcc = 0;
  private held: { pid: ProductId; cooked: boolean; obj: THREE.Object3D; order: Order } | null = null;
  private cookHold = 0;
  private stations = {
    fridge: new THREE.Vector3(-2.2, 0, -1.25),
    stove: new THREE.Vector3(0.2, 0, -1.25),
    window: new THREE.Vector3(0.2, 0, 1.0),
    door: new THREE.Vector3(-3.0, 0, 1.0),
  };
  private readyShelf = new THREE.Group();
  private queueBase = new THREE.Vector3(0.2, 0, 2.9);

  constructor(private game: Game, public biz: Business) {
    this.build();
  }

  private build() {
    const s = this.scene;
    s.background = new THREE.Color(0x2a3350);
    s.add(new THREE.HemisphereLight(0xffffff, 0x6a5a4a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-3, 8, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
    s.add(sun);

    // pavimento esterno (marciapiede) e interno
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshLambertMaterial({ color: 0xb9bfd1 }));
    outside.rotation.x = -Math.PI / 2;
    outside.position.y = -0.01;
    outside.receiveShadow = true;
    s.add(outside);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, D), new THREE.MeshLambertMaterial({ color: 0xe8e2d4 }));
    floor.position.set(0, 0.0, -0.3);
    floor.receiveShadow = true;
    s.add(floor);
    // pareti: dietro e ai lati (basse per vedere dentro)
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xe8590c });
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, 2.4, 0.15), wallMat);
    back.position.set(0, 1.2, -2.4);
    s.add(back);
    for (const x of [-W / 2, W / 2]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, D), wallMat);
      side.position.set(x, 0.5, -0.3);
      s.add(side);
    }
    // bancone della finestra lungo il lato cliente
    const counterMat = new THREE.MeshLambertMaterial({ color: 0xf1f1f1 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(W - 2.2, 1.0, 0.5), counterMat);
    counter.position.set(0.9, 0.5, 1.75);
    counter.castShadow = true;
    s.add(counter);
    const top = new THREE.Mesh(new THREE.BoxGeometry(W - 2.1, 0.08, 0.6), new THREE.MeshLambertMaterial({ color: 0x455a64 }));
    top.position.set(0.9, 1.02, 1.75);
    s.add(top);
    this.readyShelf.position.set(1.6, 1.06, 1.75);
    s.add(this.readyShelf);

    // mobili Kenney
    const put = (path: string, x: number, z: number, rot = 0) => {
      const o = model(path, FURN);
      // i mobili del furniture kit hanno l'origine in un angolo
      o.position.set(x - 0.43 * FURN * 0.5, 0.05, z + 0.45 * FURN * 0.5);
      o.rotation.y = rot;
      s.add(o);
      return o;
    };
    put('furniture/kitchenFridge.glb', this.stations.fridge.x, -2.0);
    put('furniture/kitchenCabinetDrawer.glb', -1.1, -2.0);
    put('furniture/kitchenStove.glb', this.stations.stove.x, -2.0);
    put('furniture/kitchenCabinet.glb', 1.2, -2.0);
    put('furniture/kitchenSink.glb', 2.2, -2.0);
    const pan = model('food/frying-pan.glb', 0.7);
    pan.position.set(this.stations.stove.x + 0.1, 1.08, -1.6);
    s.add(pan);

    // etichette delle postazioni
    const tag = (t: string, v: THREE.Vector3, y: number) => {
      const l = label(t, { scale: 0.32 });
      l.position.set(v.x, y, v.z);
      s.add(l);
    };
    tag('🧊 Frigo', new THREE.Vector3(this.stations.fridge.x, 0, -1.9), 2.55);
    tag('🔥 Piastra', new THREE.Vector3(this.stations.stove.x, 0, -1.9), 1.75);
    tag('🪟 Servi qui', new THREE.Vector3(this.stations.window.x, 0, 1.75), 1.6);
    tag('🚪 Esci', this.stations.door, 1.4);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.9), new THREE.MeshLambertMaterial({ color: 0x4cd07d }));
    door.position.set(this.stations.door.x, 0.06, this.stations.door.z);
    s.add(door);

    // dipendenti
    const cooks = this.biz.staff.filter((e) => e.role === 'cucina');
    const cashiers = this.biz.staff.filter((e) => e.role === 'cassa');
    cooks.forEach((e, i) => this.addWorker(e, new THREE.Vector3(1.3 + i * 0.9, 0, -1.2)));
    cashiers.forEach((e, i) => this.addWorker(e, new THREE.Vector3(1.8 + i * 0.9, 0, 1.1)));
    const mgr = this.biz.staff.find((e) => e.role === 'manager');
    if (mgr) this.addWorker(mgr, new THREE.Vector3(2.9, 0, -0.5));
  }

  private addWorker(emp: Employee, home: THREE.Vector3) {
    const char = new Character(emp.model || CHAR_MODELS[emp.id % CHAR_MODELS.length]);
    char.root.position.copy(home);
    char.root.rotation.y = emp.role === 'cassa' ? 0 : Math.PI;
    const tag = label(emp.name.split(' ')[0], { scale: 0.26 });
    tag.position.y = 1.75;
    char.root.add(tag);
    this.scene.add(char.root);
    this.workers.push({ emp, char, home, t: 0 });
  }

  enter(player: Character) {
    this.player = player;
    player.root.position.copy(this.stations.door).add(new THREE.Vector3(0.9, 0, -0.3));
    player.root.rotation.y = Math.PI;
    this.scene.add(player.root);
    this.biz.__playerInside = true;
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  exit() {
    this.biz.__playerInside = false;
    window.removeEventListener('resize', this.resize);
    this.player.hold();
    this.scene.remove(this.player.root);
  }

  private resize = () => {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = aspect;
    this.camera.fov = 50;
    // distanza tale che tutta la larghezza del furgone (e la coda) stia nello schermo
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(25)) * aspect);
    const d = Math.max(aspect < 1 ? 9 : 10.5, 4.4 / Math.tan(hfov / 2));
    const pitch = THREE.MathUtils.degToRad(aspect < 1 ? 58 : 52);
    const target = new THREE.Vector3(0, 0, aspect < 1 ? 1.4 : 1.3);
    this.camera.position.set(target.x, Math.sin(pitch) * d, target.z + Math.cos(pitch) * d);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
  };

  // ---------------- clienti ----------------

  private available(pid: ProductId) {
    return (this.biz.stock[pid] ?? 0) - this.reservedFor(pid);
  }

  private reservedFor(pid: ProductId) {
    return this.orders.filter((o) => o.pid === pid && o.stage !== 'wait').length;
  }

  private spawnCustomer() {
    if (this.orders.length >= BUSINESS.MAX_QUEUE) {
      lostCustomer(this.biz);
      return;
    }
    const pid = pickProduct(this.game.state, this.biz);
    const customer = new Character(CHAR_MODELS[Math.floor(Math.random() * CHAR_MODELS.length)]);
    customer.root.position.set(this.queueBase.x + 3.5, 0, this.queueBase.z + 5);
    customer.root.rotation.y = Math.PI;
    const bubble = label(PRODUCTS[pid].icon, { bg: '#ffffff', fg: '#000', scale: 0.55 });
    bubble.position.y = 1.9;
    customer.root.add(bubble);
    this.scene.add(customer.root);
    this.orders.push({
      id: this.seq++, pid, stage: 'wait', patience: BUSINESS.CUSTOMER_PATIENCE_MIN, customer, bubble, progress: 0,
    });
  }

  private removeOrder(o: Order, served: boolean) {
    this.orders = this.orders.filter((x) => x !== o);
    const c = o.customer;
    c.root.remove(o.bubble);
    const mood = label(served ? '😋' : '😠', { bg: 'rgba(0,0,0,0)', scale: 0.6 });
    mood.position.y = 1.9;
    c.root.add(mood);
    c.play('walk');
    const start = performance.now();
    const leave = () => {
      const t = (performance.now() - start) / 1000;
      c.root.position.x -= 0.06;
      c.root.rotation.y = -Math.PI / 2;
      c.update(1 / 60);
      if (t < 1.8 && this.scene.children.includes(c.root)) requestAnimationFrame(leave);
      else this.scene.remove(c.root);
    };
    leave();
  }

  private serve(o: Order, manual: boolean, emp?: Employee) {
    const s = this.game.state;
    const frac = o.patience / BUSINESS.CUSTOMER_PATIENCE_MIN;
    const tip = manual ? 1 + 0.3 * frac : 1 + (emp ? emp.kindness * 0.01 : 0);
    const amount = recordSale(s, this.biz, o.pid, manual, tip);
    if (manual) {
      addXp(s, 'clientela', 2);
      missionProgress(s, 'served');
      toast(`+€${amount.toFixed(2).replace('.', ',')} ${PRODUCTS[o.pid].icon}`, 'money');
    }
    this.removeOrder(o, true);
  }

  // ---------------- aggiornamento ----------------

  update(dt: number) {
    const s = this.game.state;
    const gm = dt * (30 * 24 * 60) / 3600; // minuti di gioco in questo frame
    const open = isOpenHour(s);

    if (open) {
      this.spawnAcc += (totalDemand(s, this.biz) * gm) / 60;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawnCustomer();
      }
    }

    // coda e pazienza
    this.orders.forEach((o, i) => {
      const target = new THREE.Vector3(this.queueBase.x + (i % 2) * 0.35, 0, this.queueBase.z + i * 0.95);
      const c = o.customer.root.position;
      const d = c.distanceTo(target);
      if (d > 0.05) {
        c.lerp(target, Math.min(1, (dt * 3) / Math.max(d, 0.001)));
        o.customer.play('walk');
      } else o.customer.play('idle');
      o.customer.root.rotation.y = Math.PI;
      o.customer.update(dt);
      if (o.stage !== 'ready' || o.by === 'player') o.patience -= gm;
      const f = o.patience / BUSINESS.CUSTOMER_PATIENCE_MIN;
      (o.bubble.material as THREE.SpriteMaterial).color.setRGB(1, 0.55 + 0.45 * f, 0.55 + 0.45 * f);
      if (o.patience <= 0) {
        lostCustomer(this.biz);
        addFame(s, 'clientela', -0.2);
        if (this.held?.order === o) this.dropHeld();
        this.removeOrder(o, false);
      }
    });

    this.updateWorkers(dt, gm);
    this.updatePlayer(dt);
    if (this.biz.autoRestock) restock(s, this.biz);
    this.updateShelf();
  }

  private updateWorkers(dt: number, gm: number) {
    const cookMul = 1 + 0.15 * upg(this.biz, 'attrezzatura');
    for (const w of this.workers) {
      w.char.update(dt);
      if (w.emp.role === 'manager') continue;
      if (!w.order) {
        const want: Stage = w.emp.role === 'cucina' ? 'wait' : 'ready';
        const o = this.orders.find((x) => x.stage === want && x.by === undefined && (want === 'ready' || this.available(x.pid) > 0));
        if (o) {
          w.order = o;
          o.by = w.emp.id;
          w.t = 0;
          if (want === 'wait') o.stage = 'cooking';
        } else {
          w.char.play('idle');
          continue;
        }
      }
      const o = w.order;
      if (!this.orders.includes(o)) {
        w.order = undefined;
        continue;
      }
      const rate = employeeRate(w.emp, this.biz); // clienti/ora
      const need = 60 / rate;
      w.t += gm;
      w.char.play('interact-right', 0.15, 1.2);
      if (w.emp.role === 'cucina') {
        o.progress = Math.min(1, w.t / need);
        if (w.t >= need / cookMul) {
          o.stage = 'ready';
          o.by = undefined;
          w.order = undefined;
          employeeGainXp(w.emp, 1);
        }
      } else if (w.t >= need * 0.5) {
        w.order = undefined;
        employeeGainXp(w.emp, 1);
        this.serve(o, false, w.emp);
      }
    }
  }

  private dropHeld() {
    if (!this.held) return;
    this.player.hold();
    this.held = null;
  }

  private near(v: THREE.Vector3, r = 1.2) {
    const p = this.player.root.position;
    return Math.hypot(p.x - v.x, p.z - v.z) < r;
  }

  private updatePlayer(dt: number) {
    const g = this.game;
    const input = g.input;
    const v = input.vector;
    input.consumeTap();
    const p = this.player.root.position;
    const len = Math.hypot(v.x, v.y);
    if (len > 0.05) {
      p.x += v.x * 3.6 * dt;
      p.z += v.y * 3.6 * dt;
      p.x = THREE.MathUtils.clamp(p.x, -W / 2 + 0.4, W / 2 - 0.4);
      p.z = THREE.MathUtils.clamp(p.z, -1.9, 1.25);
      this.player.faceTowards(p.x + v.x, p.z + v.y, dt);
      this.player.play('walk');
    } else if (this.player.currentName === 'walk') this.player.play('idle');

    // quale postazione è vicina?
    let prompt: { label: string; icon: string; progress?: number } | null = null;
    let act: (() => void) | null = null;
    const firstWaiting = this.orders.find((o) => o.stage === 'wait' && o.by === undefined && this.available(o.pid) > 0);

    if (this.near(this.stations.door, 1.0)) {
      prompt = { label: 'Esci', icon: '🚪' };
      act = () => this.game.exitTruck();
    } else if (this.near(this.stations.fridge)) {
      if (!this.held && firstWaiting) {
        prompt = { label: `Prendi ${PRODUCTS[firstWaiting.pid].name}`, icon: '🧊' };
        act = () => {
          firstWaiting.by = 'player';
          firstWaiting.stage = 'cooking';
          const obj = model(PRODUCTS[firstWaiting.pid].model, 1.1);
          this.player.hold(obj);
          this.held = { pid: firstWaiting.pid, cooked: false, obj, order: firstWaiting };
        };
      } else if (!this.held && this.orders.some((o) => o.stage === 'wait' && this.available(o.pid) <= 0)) {
        prompt = { label: 'Magazzino vuoto!', icon: '⚠️' };
        act = () => g.ui.openBusiness(this.biz.id, 'magazzino');
      }
    } else if (this.near(this.stations.stove) && this.held && !this.held.cooked) {
      const need = BUSINESS.PLAYER_COOK_SEC / (1 + 0.15 * upg(this.biz, 'attrezzatura'));
      if (input.actionHeld) {
        this.cookHold += dt / need;
        this.player.play('interact-right', 0.1, 1.5);
        this.player.faceTowards(this.stations.stove.x, -3, dt);
        if (this.cookHold >= 1) {
          this.cookHold = 0;
          this.held.cooked = true;
          this.held.order.stage = 'ready';
          addXp(g.state, 'cucina', 2);
          this.player.play('idle');
        }
      }
      prompt = { label: 'Tieni premuto: cucina', icon: '🔥', progress: this.cookHold };
    } else if (this.near(this.stations.window, 1.5)) {
      if (this.held?.cooked) {
        const o = this.held.order;
        prompt = { label: 'Servi', icon: PRODUCTS[o.pid].icon };
        act = () => {
          this.dropHeld();
          this.player.once('interact-right');
          this.serve(o, true);
        };
      } else if (!this.held) {
        const ready = this.orders.find((o) => o.stage === 'ready' && o.by === undefined);
        if (ready) {
          prompt = { label: 'Servi', icon: PRODUCTS[ready.pid].icon };
          act = () => {
            this.player.once('interact-right');
            this.serve(ready, true);
          };
        }
      }
    }
    if (!input.actionHeld && this.cookHold > 0 && !this.near(this.stations.stove)) this.cookHold = 0;
    g.ui.setAction(prompt);
    if (input.consumeAction() && act) act();
  }

  private updateShelf() {
    // mostra sul bancone i piatti pronti dei cuochi
    const ready = this.orders.filter((o) => o.stage === 'ready' && o.by !== 'player');
    if (this.readyShelf.children.length === ready.length) return;
    this.readyShelf.clear();
    ready.forEach((o, i) => {
      const obj = model(PRODUCTS[o.pid].model, 0.9);
      obj.position.x = i * 0.45;
      this.readyShelf.add(obj);
    });
  }

  /** info per l'HUD */
  get info() {
    return {
      queue: this.orders.length,
      open: isOpenHour(this.game.state),
    };
  }
}
