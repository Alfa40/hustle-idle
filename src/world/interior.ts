import * as THREE from 'three';
import { model } from '../assets';
import { BUSINESS, TIME } from '../config/balance';
import { bizType } from '../config/business';
import { PRODUCTS, type ProductId } from '../config/products';
import { COUNTER_Z, LAYOUTS, type Layout, type StationDef } from '../config/recipes';
import type { Game } from '../game';
import { toast } from '../sim/bus';
import { missionProgress } from '../sim/calendar';
import {
  CHAR_MODELS, employeeGainXp, employeeRate, isOpenHour, lostCustomer, pickProduct, recordSale, restock, totalDemand, upg,
} from '../sim/economy';
import { addFame, addXp } from '../sim/progress';
import type { Business, Employee } from '../sim/state';
import { Character } from './character';
import { arrow, label, ring } from './props';
import { Particles } from './particles';
import { updateCutWalls, type CutWall } from './viewcam';

export const INTERIOR_ASSETS = [
  'furniture/kitchenFridge.glb', 'furniture/kitchenStove.glb', 'furniture/kitchenCabinet.glb',
  'furniture/kitchenCabinetDrawer.glb', 'furniture/kitchenSink.glb', 'furniture/desk.glb', 'furniture/bookcaseOpen.glb',
];

const FURN = 2.3; // scala dei mobili Kenney
const LEFT = -3.75; // bordo sinistro della stanza (si allarga verso destra)
const BACK = -2.2;
const FRONT = 1.3; // fin dove arriva il giocatore (il bancone è a COUNTER_Z)
/** Oltre questo valore di cottura il prodotto brucia. */
const BURN = 1.6;

/** Un prodotto in lavorazione: `step` è la prossima fase da fare. */
interface Item {
  pid: ProductId;
  step: number;
  /** ordine da asporto: in più c'è la fase di imballaggio */
  takeaway: boolean;
}

interface OrderLine {
  pid: ProductId;
  done: boolean;
}

interface Customer {
  lines: OrderLine[];
  takeaway: boolean;
  patience: number;
  maxPatience: number;
  char: Character;
  bubble: THREE.Sprite;
  bubbleKey: string;
  paid: number;
}

interface Slot {
  item: Item | null;
  p: number;
  bar: THREE.Mesh;
  fill: THREE.Mesh;
}

interface Station {
  def: StationDef;
  pos: THREE.Vector3;
  slots: Slot[];
  hold: number;
  /** etichetta sopra la postazione (si aggiorna con i posti occupati) */
  tag?: THREE.Sprite;
  tagKey?: string;
  tagY: number;
}

interface Worker {
  emp: Employee;
  char: Character;
}

const barGeo = new THREE.PlaneGeometry(0.7, 0.1);
const COLORS = { cook: 0xffc21a, ready: 0x35c46a, burnt: 0xff5d73 };

type Prompt = { label: string; icon: string; progress?: number } | null;

/**
 * Interno 3D di un'attività al bancone. Ogni prodotto passa da più postazioni
 * (vedi config/recipes.ts); i clienti ordinano uno o più prodotti, a volte da asporto.
 * L'ampliamento del locale allarga la stanza e aggiunge postazioni e prodotti.
 */
export class TruckInterior {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.3, 120);
  private layout: Layout;
  private level: number;
  private width: number;
  private stations: Station[] = [];
  private customers: Customer[] = [];
  private workers: Worker[] = [];
  private pass: Item[] = [];
  private passGroup = new THREE.Group();
  private player!: Character;
  private held: Item | null = null;
  private heldSprite: THREE.Sprite | null = null;
  private spawnAcc = 0;
  private cookAcc = 0;
  private serveAcc = 0;
  private queueBase: THREE.Vector3;
  private door: THREE.Vector3;
  private uiT = 0;
  private walls: CutWall[] = [];
  private fx = new Particles();
  private smokeT = 0;
  private earned = 0;
  private served = 0;

  constructor(private game: Game, public biz: Business) {
    this.layout = LAYOUTS[biz.type as keyof typeof LAYOUTS];
    this.level = Math.min(2, upg(biz, 'ampliamento'));
    this.width = this.layout.width[this.level];
    this.door = new THREE.Vector3(LEFT + 0.7, 0, 0.9);
    this.queueBase = new THREE.Vector3(LEFT + this.width / 2, 0, 3);
    this.build();
  }

  private get center() {
    return LEFT + this.width / 2;
  }

  private build() {
    const s = this.scene;
    const def = bizType(this.biz.type);
    s.background = new THREE.Color(0x2a3350);
    s.add(new THREE.HemisphereLight(0xffffff, 0x6a5a4a, 1.6));
    s.add(this.fx.group);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(this.center - 3, 9, 7);
    sun.target.position.set(this.center, 0, 0);
    s.add(sun, sun.target);

    const W = this.width;
    const depth = COUNTER_Z - BACK + 0.3;
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(90, 60), new THREE.MeshLambertMaterial({ color: 0xb9bfd1 }));
    outside.rotation.x = -Math.PI / 2;
    outside.position.y = -0.01;
    s.add(outside);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, depth), new THREE.MeshLambertMaterial({ color: this.layout.floor }));
    floor.position.set(this.center, 0, (BACK + COUNTER_Z) / 2);
    s.add(floor);
    const wallMat = new THREE.MeshLambertMaterial({ color: this.layout.wall });
    const back = new THREE.Mesh(new THREE.BoxGeometry(W, 2.4, 0.15), wallMat);
    back.position.set(this.center, 1.2, BACK - 0.1);
    s.add(back);
    this.walls.push({ obj: back, at: back.position.clone(), out: new THREE.Vector3(0, 0, -1) });
    for (const x of [LEFT, LEFT + W]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, depth), wallMat);
      side.position.set(x, 0.5, (BACK + COUNTER_Z) / 2);
      s.add(side);
      this.walls.push({ obj: side, at: side.position.clone(), out: new THREE.Vector3(x === LEFT ? -1 : 1, 0, 0) });
    }
    // bancone dei clienti (a sinistra resta libera la porta)
    const cx0 = LEFT + 1.5;
    const counter = new THREE.Mesh(new THREE.BoxGeometry(LEFT + W - cx0, 1, 0.5), new THREE.MeshLambertMaterial({ color: 0xf1f1f1 }));
    counter.position.set((cx0 + LEFT + W) / 2, 0.5, COUNTER_Z);
    s.add(counter);
    const top = new THREE.Mesh(new THREE.BoxGeometry(LEFT + W - cx0 + 0.1, 0.08, 0.6), new THREE.MeshLambertMaterial({ color: 0x455a64 }));
    top.position.set((cx0 + LEFT + W) / 2, 1.02, COUNTER_Z);
    s.add(top);
    const doorMat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.9), new THREE.MeshLambertMaterial({ color: 0x4cd07d }));
    doorMat.position.set(this.door.x, 0.06, this.door.z);
    s.add(doorMat);
    this.tag('🚪 Esci', this.door, 1.3);
    const sign = label(`${def.icon} ${def.name}`, { bg: def.color, scale: 0.45 });
    sign.position.set(this.center, 2.75, BACK);
    s.add(sign);

    for (const d of this.layout.stations) {
      if (d.level > this.level) continue;
      const pos = new THREE.Vector3(d.x, 0, d.z);
      if (d.model) {
        const o = model(d.model, FURN);
        // i mobili del furniture kit hanno l'origine in un angolo
        o.position.set(d.x - 0.43 * FURN * 0.5, 0.05, d.z - 0.2 + 0.45 * FURN * 0.5);
        s.add(o);
      }
      const tall = d.model.includes('Fridge') || d.model.includes('bookcase');
      const st: Station = { def: d, pos, slots: [], hold: 0, tagY: d.kind === 'counter' || d.kind === 'pass' ? 1.55 : tall ? 2.5 : 1.7 };
      const nSlots = d.kind === 'timed' ? (d.slots ?? 2) + Math.floor(upg(this.biz, 'attrezzatura') / 3) : 0;
      for (let i = 0; i < nSlots; i++) {
        const bar = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false }));
        const fill = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: COLORS.cook, depthTest: false }));
        bar.position.set(d.x, 2.05 + i * 0.16, d.z + 0.3);
        fill.position.copy(bar.position);
        fill.position.z += 0.01;
        bar.renderOrder = 20;
        fill.renderOrder = 21;
        bar.visible = fill.visible = false;
        s.add(bar, fill);
        st.slots.push({ item: null, p: 0, bar, fill });
      }
      this.stations.push(st);
    }
    this.passGroup.position.set(this.stationOf('pass')!.pos.x, 1.08, COUNTER_Z);
    s.add(this.passGroup);
    // evidenzia la prossima postazione: anello verde a terra e freccia che rimbalza
    this.nextRing = ring(0x35c46a, 0.75);
    this.nextArrow = arrow(0x35c46a);
    this.nextArrow.scale.setScalar(0.6);
    s.add(this.nextRing, this.nextArrow);

    // dipendenti: i cuochi alle postazioni, i cassieri al bancone
    const work = this.stations.filter((x) => x.def.kind === 'hold' || x.def.kind === 'timed');
    let wi = 0;
    for (const e of this.biz.staff) {
      const char = new Character(e.model || CHAR_MODELS[e.id % CHAR_MODELS.length]);
      const tag = label(e.name.split(' ')[0], { scale: 0.2 });
      tag.position.y = 1.75;
      char.root.add(tag);
      if (e.role === 'cassa') {
        char.root.position.set(this.stationOf('pass')!.pos.x + 0.9, 0, COUNTER_Z - 0.6);
      } else if (e.role === 'manager') {
        char.root.position.set(LEFT + this.width - 0.8, 0, 0.6);
        char.root.rotation.y = -Math.PI / 2;
      } else {
        const st = work[wi++ % Math.max(1, work.length)];
        char.root.position.set(st.pos.x + 0.6, 0, st.pos.z + 0.8);
        char.root.rotation.y = Math.PI;
      }
      s.add(char.root);
      this.workers.push({ emp: e, char });
    }
  }

  private tag(t: string, v: THREE.Vector3, y: number, bg?: string) {
    const l = label(t, { scale: 0.3, bg, fg: bg ? '#fff' : undefined });
    l.position.set(v.x, y, v.z);
    this.scene.add(l);
    return l;
  }

  // ---------------- guida ----------------

  /** Capienza: in mano si porta un prodotto alla volta. */
  static readonly HAND_MAX = 1;
  static readonly PASS_MAX = 4;
  private guideEl: HTMLDivElement | null = null;
  private guideKey = '';
  private nextRing!: THREE.Mesh;
  private nextArrow!: THREE.Object3D;

  /** Postazione dove andare adesso. */
  private nextStation(): Station | null {
    const it = this.held;
    if (it) {
      if (this.finished(it)) return this.stationOf('counter') ?? null;
      return this.stations.find((s) => s.def.id === this.recipe(it)[it.step]) ?? null;
    }
    // qualcosa è pronto sul fuoco? prima si ritira
    const ready = this.stations.find((s) => s.slots.some((sl) => sl.item && sl.p >= 1));
    if (ready) return ready;
    if (this.pass.some((p) => this.deliverable(p))) return this.stationOf('pass') ?? null;
    const need = this.needed()[0];
    if (need) return this.stations.find((s) => s.def.id === this.layout.recipes[need.pid]?.steps[0]) ?? null;
    return null;
  }

  /** Solo l'icona (e i posti occupati); il nome completo solo sulla prossima postazione. */
  private stationLabel(st: Station, hot: boolean) {
    const d = st.def;
    const count = d.kind === 'timed' ? ` ${st.slots.filter((x) => x.item).length}/${st.slots.length}`
      : d.kind === 'pass' ? ` ${this.pass.length}/${TruckInterior.PASS_MAX}` : '';
    return hot ? `👉 ${d.icon} ${d.name}${count}` : `${d.icon}${count}`;
  }

  private updateTags() {
    const next = this.nextStation();
    for (const st of this.stations) {
      const hot = st === next;
      const key = this.stationLabel(st, hot);
      if (key === st.tagKey) continue;
      st.tagKey = key;
      if (st.tag) this.scene.remove(st.tag);
      st.tag = this.tag(key, st.pos, st.tagY, hot ? '#35c46a' : undefined);
    }
    this.nextRing.visible = this.nextArrow.visible = !!next;
    if (next) {
      const z = next.def.z > 1 ? FRONT - 0.1 : next.pos.z + 0.95;
      this.nextRing.position.set(next.pos.x, 0.08, z);
      this.nextArrow.position.set(next.pos.x, 2.35 + Math.sin(performance.now() / 220) * 0.12, next.pos.z);
    }
  }

  /** Riquadro con il percorso del prodotto e le capienze, sempre visibile. */
  private updateGuide() {
    if (!this.guideEl) return;
    const it = this.held;
    const onFire = this.stations.filter((s) => s.def.kind === 'timed');
    const caps = [
      `✋ In mano ${it ? 1 : 0}/${TruckInterior.HAND_MAX}`,
      ...onFire.map((s) => `${s.def.icon} ${s.def.name} ${s.slots.filter((x) => x.item).length}/${s.slots.length}`),
      `${this.stationOf('pass')!.def.icon} Pronti ${this.pass.length}/${TruckInterior.PASS_MAX}`,
    ].map((c) => `<span>${c}</span>`).join('');
    let title: string;
    let steps = '';
    const stepChips = (pid: ProductId, takeaway: boolean, at: number) => {
      const ids = [...(this.layout.recipes[pid]?.steps ?? []), ...(takeaway && this.hasStation('imballo') ? ['imballo'] : [])];
      const counter = this.stationOf('counter')!.def;
      return [...ids.map((id) => this.stationDef(id)!), counter]
        .map((d, i) => `<i class="${i < at ? 'ok' : i === at ? 'now' : ''}">${i < at ? '✅' : d.icon} ${d.name}</i>`)
        .join('<b>›</b>');
    };
    const next = this.nextStation();
    if (it) {
      title = `${PRODUCTS[it.pid].icon} ${PRODUCTS[it.pid].name}${it.takeaway ? ' 🥡 da asporto' : ''}`;
      steps = stepChips(it.pid, it.takeaway, it.step);
    } else if (next?.slots.some((sl) => sl.item && sl.p >= 1)) {
      title = `✅ Pronto! Ritira da ${next.def.icon} ${next.def.name}`;
    } else if (next?.def.kind === 'pass') {
      title = '🍽️ C\'è un prodotto pronto: prendilo e servilo';
    } else {
      const need = this.needed()[0];
      title = need ? `Prossimo ordine: ${PRODUCTS[need.pid].icon} ${PRODUCTS[need.pid].name}${need.takeaway ? ' 🥡' : ''}` : this.customers.length ? '⏳ Aspetta che la cottura finisca' : '😴 Nessun cliente: aspetta';
      if (need) steps = stepChips(need.pid, need.takeaway, 0);
    }
    const key = title + steps + caps;
    if (key === this.guideKey) return;
    this.guideKey = key;
    this.guideEl.innerHTML = `<div class="gd-title">${title}</div>${steps ? `<div class="gd-steps">${steps}</div>` : ''}<div class="gd-caps">${caps}</div>`;
  }

  private stationOf(kind: StationDef['kind']) {
    return this.stations.find((s) => s.def.kind === kind);
  }

  private stationDef(id: string) {
    return this.layout.stations.find((s) => s.id === id);
  }

  enter(player: Character) {
    this.player = player;
    player.root.position.copy(this.door).add(new THREE.Vector3(0.9, 0, -0.3));
    player.root.rotation.y = Math.PI;
    this.scene.add(player.root);
    this.biz.__playerInside = true;
    this.guideEl = document.createElement('div');
    this.guideEl.className = 'guide';
    document.body.appendChild(this.guideEl);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  exit() {
    this.biz.__playerInside = false;
    this.guideEl?.remove();
    this.guideEl = null;
    window.removeEventListener('resize', this.resize);
    this.setHeld(null);
    this.scene.remove(this.player.root);
    if (this.served) toast(`Turno finito: ${this.served} ordini completati, +€${Math.round(this.earned)}`, 'money');
  }

  /** metà della larghezza inquadrata e distanza della camera */
  private view = { half: 4, d: 10, pitch: 1, z: 1.3 };
  private camX = 0;

  private resize = () => {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.aspect = aspect;
    this.camera.fov = 50;
    // si inquadra tutta la stanza se ci sta, altrimenti la camera segue il giocatore
    const half = Math.min(this.width / 2 + 0.7, aspect < 1 ? 4.6 : 7.5);
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(25)) * aspect);
    this.view = {
      half,
      d: Math.max(aspect < 1 ? 9 : 11.5, half / Math.tan(hfov / 2)),
      pitch: THREE.MathUtils.degToRad(aspect < 1 ? 58 : 55),
      z: aspect < 1 ? 0.3 : 1,
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

  // ---------------- ordini ----------------

  private recipe(it: Item) {
    const steps = this.layout.recipes[it.pid]?.steps ?? [];
    return it.takeaway && this.hasStation('imballo') ? [...steps, 'imballo'] : steps;
  }

  private hasStation(id: string) {
    return this.stations.some((s) => s.def.id === id);
  }

  private finished(it: Item) {
    return it.step >= this.recipe(it).length;
  }

  /** Prodotti in vendita che si possono preparare qui con il livello attuale. */
  private makeable() {
    return this.biz.products.filter((p) => (this.layout.recipes[p]?.level ?? 99) <= this.level && (this.biz.stock[p] ?? 0) > 0);
  }

  private spawnCustomer() {
    const ok = this.makeable();
    if (this.customers.length >= BUSINESS.MAX_QUEUE || !ok.length) {
      lostCustomer(this.biz);
      return;
    }
    // ordini più grandi quando il locale cresce
    const n = 1 + (Math.random() < 0.3 + 0.1 * this.level ? 1 : 0) + (this.level >= 1 && Math.random() < 0.15 ? 1 : 0);
    const lines: OrderLine[] = [];
    for (let i = 0; i < n; i++) {
      let pid = pickProduct(this.game.state, this.biz);
      if (!ok.includes(pid)) pid = ok[Math.floor(Math.random() * ok.length)];
      lines.push({ pid, done: false });
    }
    const takeaway = this.hasStation('imballo') && Math.random() < 0.3;
    const char = new Character(CHAR_MODELS[Math.floor(Math.random() * CHAR_MODELS.length)]);
    char.root.position.set(this.queueBase.x + 4, 0, this.queueBase.z + 5);
    char.root.rotation.y = Math.PI;
    const bubble = label('…', { bg: '#ffffff', fg: '#000', scale: 0.5 });
    bubble.position.y = 1.95;
    char.root.add(bubble);
    this.scene.add(char.root);
    const max = BUSINESS.CUSTOMER_PATIENCE_MIN * (0.8 + 0.45 * n) * (this.biz.type === 'artigianato' ? 1.6 : 1);
    this.customers.push({ lines, takeaway, patience: max, maxPatience: max, char, bubble, bubbleKey: '', paid: 0 });
  }

  /** Fumetto del cliente: cosa manca ancora (✅ già consegnato, 🥡 da asporto). */
  private refreshBubble(c: Customer) {
    const key = c.lines.map((l) => (l.done ? '✅' : PRODUCTS[l.pid].icon)).join('') + (c.takeaway ? ' 🥡' : '');
    if (key === c.bubbleKey) return;
    c.bubbleKey = key;
    c.char.root.remove(c.bubble);
    c.bubble = label(key, { bg: '#ffffff', fg: '#000', scale: 0.42 });
    c.bubble.position.y = 1.95;
    c.char.root.add(c.bubble);
  }

  /** Prodotti ancora da preparare (non consegnati e non già in lavorazione). */
  private needed(): { pid: ProductId; takeaway: boolean }[] {
    const pending: { pid: ProductId; takeaway: boolean }[] = [];
    for (const c of this.customers) for (const l of c.lines) if (!l.done) pending.push({ pid: l.pid, takeaway: c.takeaway });
    const inWork = [
      ...(this.held ? [this.held] : []),
      ...this.pass,
      ...this.stations.flatMap((s) => s.slots.flatMap((sl) => (sl.item ? [sl.item] : []))),
    ];
    for (const it of inWork) {
      const i = pending.findIndex((p) => p.pid === it.pid && p.takeaway === it.takeaway);
      if (i >= 0) pending.splice(i, 1);
    }
    return pending;
  }

  private deliverable(it: Item) {
    return this.customers.some((c) => c.takeaway === it.takeaway && c.lines.some((l) => !l.done && l.pid === it.pid));
  }

  /** Consegna un prodotto finito al primo cliente che lo aspetta. */
  private deliver(it: Item, manual: boolean, emp?: Employee) {
    for (const c of this.customers) {
      if (c.takeaway !== it.takeaway) continue;
      const line = c.lines.find((l) => !l.done && l.pid === it.pid);
      if (!line) continue;
      line.done = true;
      const s = this.game.state;
      const frac = Math.max(0, c.patience / c.maxPatience);
      const tip = manual ? 1 + 0.3 * frac : 1 + (emp ? emp.kindness * 0.01 : 0);
      const amount = recordSale(s, this.biz, it.pid, manual, tip * (it.takeaway ? 1.1 : 1));
      c.paid += amount;
      this.earned += amount;
      if (manual) {
        addXp(s, 'clientela', 1);
        missionProgress(s, 'served');
      }
      if (c.lines.every((l) => l.done)) {
        this.served++;
        if (manual) {
          addFame(s, 'clientela', 0.1 * c.lines.length);
          toast(`✅ Ordine completo: +€${c.paid.toFixed(2).replace('.', ',')}`, 'money');
        }
        this.removeCustomer(c, true);
      } else this.refreshBubble(c);
      return;
    }
  }

  private removeCustomer(c: Customer, happy: boolean) {
    this.customers = this.customers.filter((x) => x !== c);
    c.char.root.remove(c.bubble);
    const mood = label(happy ? '😋' : '😠', { bg: 'rgba(0,0,0,0)', scale: 0.6 });
    mood.position.y = 1.9;
    c.char.root.add(mood);
    c.char.play('walk');
    const start = performance.now();
    const leave = () => {
      const t = (performance.now() - start) / 1000;
      c.char.root.position.x -= 0.06;
      c.char.root.rotation.y = -Math.PI / 2;
      c.char.update(1 / 60);
      if (t < 1.8 && this.scene.children.includes(c.char.root)) requestAnimationFrame(leave);
      else this.scene.remove(c.char.root);
    };
    leave();
  }

  // ---------------- oggetto in mano ----------------

  private setHeld(it: Item | null) {
    this.held = it;
    if (this.heldSprite) this.player.root.remove(this.heldSprite);
    this.heldSprite = null;
    if (!it) return;
    const steps = this.recipe(it);
    const txt = this.finished(it)
      ? `${PRODUCTS[it.pid].icon}${it.takeaway ? '🥡' : ''} pronto!`
      : `${PRODUCTS[it.pid].icon} ${it.step}/${steps.length} → ${this.stationDef(steps[it.step])?.icon ?? ''}`;
    this.heldSprite = label(txt, { bg: this.finished(it) ? '#35c46a' : '#ffffff', fg: this.finished(it) ? '#fff' : '#3a2f55', scale: 0.45 });
    this.heldSprite.position.y = 2.3;
    this.player.root.add(this.heldSprite);
  }

  // ---------------- aggiornamento ----------------

  update(dt: number) {
    const s = this.game.state;
    const gm = dt * TIME.GAME_MIN_PER_SEC;
    if (isOpenHour(s)) {
      this.spawnAcc += (totalDemand(s, this.biz) * gm) / 60;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawnCustomer();
      }
    }
    this.updateCustomers(dt, gm);
    this.updateStations(dt);
    this.updateWorkers(dt, gm);
    this.updatePlayer(dt);
    this.placeCamera();
    if (this.biz.autoRestock) restock(s, this.biz);
    this.uiT += dt;
    if (this.uiT > 0.2) {
      this.uiT = 0;
      this.renderPass();
      this.updateGuide();
    }
    this.updateTags();
  }

  private updateCustomers(dt: number, gm: number) {
    this.customers.forEach((c, i) => {
      // fila a zig-zag davanti al bancone
      const target = new THREE.Vector3(this.queueBase.x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 1.1, 0, this.queueBase.z + (i ? 0.5 : 0));
      const p = c.char.root.position;
      const d = p.distanceTo(target);
      if (d > 0.05) {
        p.lerp(target, Math.min(1, (dt * 3) / Math.max(d, 0.001)));
        c.char.play('walk');
      } else c.char.play('idle');
      c.char.root.rotation.y = Math.PI;
      c.char.update(dt);
      c.patience -= gm;
      this.refreshBubble(c);
      const f = Math.max(0, c.patience / c.maxPatience);
      (c.bubble.material as THREE.SpriteMaterial).color.setRGB(1, 0.55 + 0.45 * f, 0.55 + 0.45 * f);
      if (c.patience <= 0) {
        lostCustomer(this.biz);
        addFame(this.game.state, 'clientela', -0.2);
        this.removeCustomer(c, false);
      }
    });
  }

  private updateStations(dt: number) {
    const speed = 1 + 0.15 * upg(this.biz, 'attrezzatura');
    this.fx.update(dt);
    this.smokeT -= dt;
    const puff = this.smokeT <= 0;
    if (puff) this.smokeT = 0.35;
    for (const st of this.stations) {
      for (const sl of st.slots) {
        if (!sl.item) continue;
        sl.p += (dt * speed) / (st.def.sec ?? 3);
        const state = sl.p >= BURN ? 'burnt' : sl.p >= 1 ? 'ready' : 'cook';
        // fumo mentre cuoce: grigio scuro se sta bruciando
        if (puff) this.fx.emit('smoke', st.pos.clone().setY(1.2), 1, state === 'burnt' ? 0x444444 : state === 'ready' ? 0xfff3c4 : undefined);
        sl.bar.visible = sl.fill.visible = true;
        (sl.fill.material as THREE.MeshBasicMaterial).color.setHex(COLORS[state]);
        const f = Math.min(1, sl.p / BURN);
        sl.fill.scale.x = Math.max(0.01, f);
        sl.fill.position.x = sl.bar.position.x - 0.35 * (1 - f);
      }
    }
  }

  /** I dipendenti preparano e servono da soli, alla loro velocità. */
  private updateWorkers(dt: number, gm: number) {
    for (const w of this.workers) w.char.update(dt);
    const cooks = this.workers.filter((w) => w.emp.role === 'cucina');
    const cashiers = this.workers.filter((w) => w.emp.role === 'cassa');
    if (cooks.length) {
      const need = this.needed();
      if (need.length && this.pass.length < TruckInterior.PASS_MAX) {
        const rate = cooks.reduce((a, w) => a + employeeRate(w.emp, this.biz), 0);
        this.cookAcc += (rate * gm) / 60;
        for (const w of cooks) w.char.play('interact-right', 0.15, 1.2);
        if (this.cookAcc >= 1) {
          this.cookAcc -= 1;
          const it: Item = { pid: need[0].pid, step: 0, takeaway: need[0].takeaway };
          it.step = this.recipe(it).length;
          this.pass.push(it);
          employeeGainXp(cooks[0].emp, 1);
        }
      } else for (const w of cooks) w.char.play('idle');
    }
    if (cashiers.length && this.pass.some((it) => this.deliverable(it))) {
      const rate = cashiers.reduce((a, w) => a + employeeRate(w.emp, this.biz), 0) * 2;
      this.serveAcc += (rate * gm) / 60;
      if (this.serveAcc >= 1) {
        this.serveAcc -= 1;
        const i = this.pass.findIndex((it) => this.deliverable(it));
        const [it] = this.pass.splice(i, 1);
        this.deliver(it, false, cashiers[0].emp);
        employeeGainXp(cashiers[0].emp, 1);
      }
    }
  }

  private renderPass() {
    const key = this.pass.map((i) => i.pid + i.takeaway).join();
    if (this.passGroup.userData.key === key) return;
    this.passGroup.userData.key = key;
    this.passGroup.clear();
    this.pass.forEach((it, i) => {
      const l = label(PRODUCTS[it.pid].icon + (it.takeaway ? '🥡' : ''), { bg: 'rgba(255,255,255,0.9)', fg: '#000', scale: 0.32 });
      l.position.set(i * 0.45 - 0.6, 0.25, 0);
      this.passGroup.add(l);
    });
  }

  // ---------------- giocatore ----------------

  private collide(p: THREE.Vector3) {
    p.x = THREE.MathUtils.clamp(p.x, LEFT + 0.4, LEFT + this.width - 0.4);
    p.z = THREE.MathUtils.clamp(p.z, BACK + 0.35, FRONT);
    for (const st of this.stations) {
      if (!st.def.model || st.def.z > 0.5) continue;
      // i mobili sono circa 1×1 m: spingi fuori il personaggio
      const dx = p.x - st.pos.x;
      const dz = p.z - st.pos.z;
      if (Math.abs(dx) < 0.85 && Math.abs(dz) < 0.75) {
        if (0.85 - Math.abs(dx) < 0.75 - Math.abs(dz)) p.x = st.pos.x + Math.sign(dx || 1) * 0.85;
        else p.z = st.pos.z + Math.sign(dz || 1) * 0.75;
      }
    }
  }

  private updatePlayer(dt: number) {
    const g = this.game;
    const input = g.input;
    const v = g.moveVector();
    input.consumeTap();
    const p = this.player.root.position;
    const len = Math.hypot(v.x, v.y);
    if (len > 0.05) {
      p.x += v.x * 4 * dt;
      p.z += v.y * 4 * dt;
      this.collide(p);
      this.player.faceTowards(p.x + v.x, p.z + v.y, dt);
      this.player.play('walk');
    } else if (this.player.currentName === 'walk') this.player.play('idle');

    if (Math.hypot(p.x - this.door.x, p.z - this.door.z) < 0.9) {
      g.ui.setAction({ label: 'Esci', icon: '🚪' });
      if (input.consumeAction()) g.exitTruck();
      return;
    }
    // postazione più vicina (quelle sul bancone si raggiungono da un po' più lontano)
    let best: Station | null = null;
    let bd = Infinity;
    for (const st of this.stations) {
      const d = Math.hypot(p.x - st.pos.x, (p.z - st.pos.z) * (st.pos.z > 1 ? 0.6 : 1));
      if (d < 1.25 && d < bd) {
        best = st;
        bd = d;
      }
    }
    for (const st of this.stations) if (st !== best) st.hold = 0;
    if (!best) {
      g.ui.setAction(null);
      return;
    }
    g.ui.setAction(this.interact(best, dt, input.actionHeld, input.consumeAction()));
  }

  /** Cosa succede a una postazione; restituisce il testo del pulsante azione. */
  private interact(st: Station, dt: number, held: boolean, pressed: boolean): Prompt {
    const d = st.def;
    const it = this.held;
    const next = it && !this.finished(it) ? this.recipe(it)[it.step] : null;
    const skill = bizType(this.biz.type).skills[0];
    switch (d.kind) {
      case 'source': {
        if (it) return { label: `Mani piene (${TruckInterior.HAND_MAX}/${TruckInterior.HAND_MAX})`, icon: '✋' };
        const need = this.needed().find((n) => this.layout.recipes[n.pid]?.steps[0] === d.id);
        if (!need) {
          const anyHere = this.makeable().some((pid) => this.layout.recipes[pid]?.steps[0] === d.id);
          return { label: anyHere ? 'Nessun ordine da qui' : 'Scorte finite o prodotto non in vendita', icon: d.icon };
        }
        if (pressed) {
          this.setHeld({ pid: need.pid, step: 1, takeaway: need.takeaway });
          this.player.once('pick-up');
        }
        return { label: `${d.verb}: ${PRODUCTS[need.pid].name}${need.takeaway ? ' 🥡' : ''}`, icon: d.icon };
      }
      case 'hold': {
        if (!it || next !== d.id) {
          st.hold = 0;
          if (it && next) return { label: `Prossima fase: ${this.stationDef(next)?.icon} ${this.stationDef(next)?.name}`, icon: '👉' };
          return { label: d.name, icon: d.icon };
        }
        if (held) {
          st.hold += (dt * (1 + 0.15 * upg(this.biz, 'attrezzatura'))) / (d.sec ?? 1);
          if (Math.random() < dt * 12) this.fx.emit('dust', st.pos.clone().setY(1.1), 1, 0xf5e6c8);
          this.player.play('interact-right', 0.1, 1.5);
          this.player.faceTowards(st.pos.x, st.pos.z - 2, dt);
          if (st.hold >= 1) {
            st.hold = 0;
            it.step++;
            addXp(this.game.state, skill, 1);
            this.setHeld(it);
            this.player.play('idle');
          }
        }
        return { label: `Tieni premuto: ${d.verb}`, icon: d.icon, progress: st.hold };
      }
      case 'timed': {
        // prima si ritira ciò che è pronto (o bruciato)
        const ready = st.slots.find((sl) => sl.item && sl.p >= 1);
        if (!it && ready) {
          const burnt = ready.p >= BURN;
          if (pressed) {
            const r = ready.item!;
            ready.item = null;
            ready.bar.visible = ready.fill.visible = false;
            if (burnt) toast('🔥 Bruciato! Buttato via', 'bad');
            else {
              r.step++;
              this.setHeld(r);
              this.fx.emit('spark', st.pos.clone().setY(1.3), 8);
              addXp(this.game.state, skill, 2);
            }
          }
          return { label: burnt ? 'Butta (bruciato)' : 'Togli: è pronto!', icon: burnt ? '🔥' : '✅' };
        }
        if (it && next === d.id) {
          const free = st.slots.find((sl) => !sl.item);
          if (!free) return { label: `Pieno (${st.slots.length}/${st.slots.length}): aspetta`, icon: d.icon };
          if (pressed) {
            free.item = it;
            free.p = 0;
            this.setHeld(null);
          }
          return { label: `${d.verb}: ${PRODUCTS[it.pid].name}`, icon: d.icon };
        }
        if (it && next) return { label: `Prossima fase: ${this.stationDef(next)?.icon} ${this.stationDef(next)?.name}`, icon: '👉' };
        return { label: st.slots.some((sl) => sl.item) ? 'Sta cuocendo…' : d.name, icon: d.icon };
      }
      case 'counter': {
        if (it && this.finished(it)) {
          if (!this.deliverable(it)) return { label: 'Nessuno lo ha ordinato', icon: '🤷' };
          if (pressed) {
            this.fx.emit('spark', st.pos.clone().setY(1.4), 12);
            this.deliver(it, true);
            this.setHeld(null);
            this.player.once('interact-right');
          }
          return { label: d.verb, icon: PRODUCTS[it.pid].icon };
        }
        if (it && next) return { label: `Non è pronto: vai a ${this.stationDef(next)?.icon}`, icon: '👉' };
        return { label: 'Clienti', icon: d.icon };
      }
      case 'pass': {
        if (!it && this.pass.length) {
          if (pressed) this.setHeld(this.pass.shift()!);
          return { label: 'Prendi dai pronti', icon: PRODUCTS[this.pass[0]?.pid ?? 'panini'].icon };
        }
        return { label: it ? 'Portalo al bancone' : 'Ripiano vuoto', icon: d.icon };
      }
      case 'bin': {
        if (!it) return { label: 'Cestino', icon: d.icon };
        if (pressed) this.setHeld(null);
        return { label: 'Butta via', icon: d.icon };
      }
    }
  }

  /** info per l'HUD */
  get info() {
    return { queue: this.customers.length, open: isOpenHour(this.game.state) };
  }
}
