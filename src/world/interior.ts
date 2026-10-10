import * as THREE from 'three';
import { model } from '../assets';
import { BUSINESS, TIME } from '../config/balance';
import { bizType } from '../config/business';
import { PRODUCTS, type ProductId } from '../config/products';
import { COUNTER_Z, kitchenLayout, LAYOUTS, type Layout, type StationDef } from '../config/recipes';
import type { Game } from '../game';
import { toast } from '../sim/bus';
import { missionProgress } from '../sim/calendar';
import {
  CHAR_MODELS, employeeGainXp, employeeRate, demandNow, empStat, isOpenHour, lostCustomer, notePeak, onShift, pickProduct, recordSale, restock, totalDemand, upg,
} from '../sim/economy';
import { addFame, addXp, skillLevel } from '../sim/progress';
import { hourOf, playStats, type Business, type Employee } from '../sim/state';
import { Character, CHAR_HEIGHT } from './character';
import { arrow, boxProp, label, productObject, ring } from './props';
import { GuideLine } from './guideline';
import { Particles } from './particles';
import { updateCutWalls, type CutWall } from './viewcam';
import { frameRoom, layout, type Occluder } from '../ui/layout';
import { buildSurroundings } from './surroundings';
import { KitchenTutorial, type TutStep } from '../ui/biztutorial';

/** Interfaccia sopra la cucina: il riquadro "in mano" (toglie il lato che fa perdere meno spazio) e i pulsanti a destra. */
const INTERIOR_UI = () =>
  [{ sel: '.preview-bar', dock: 'top' }, { sel: '.hand-badge' }, { sel: '.biz-tut' }, { sel: '.hud-right .hud-btns', dock: 'right' }, { sel: '.hud-right .minimap' }] as Occluder[];

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
/** Cotture e lavorazioni un po' più lente. */
const SLOW = 1.3;
/** Secondi in cui un prodotto pronto resta caldo: poi va buttato. */
const WARM_SEC = 45;

/** Un prodotto in lavorazione: `step` è la prossima fase da fare. */
interface Item {
  pid: ProductId;
  step: number;
  /** ordine da asporto: in più c'è la fase di imballaggio */
  takeaway: boolean;
  /** secondi di calore rimasti (solo quando è pronto) */
  warm?: number;
}

interface OrderLine {
  pid: ProductId;
  done: boolean;
}

interface Customer {
  lines: OrderLine[];
  /** cliente seduto al tavolo in sala (locale grande) */
  table?: THREE.Vector3;
  takeaway: boolean;
  patience: number;
  maxPatience: number;
  char: Character;
  bubble: THREE.Sprite;
  bubbleKey: string;
  paid: number;
  /** il cliente del tutorial: aspetta senza fretta */
  tut?: boolean;
}

/** Anteprima di una miglioria o di un dipendente: copia del locale, niente guadagni né spese. */
export interface PreviewOpts {
  /** cosa si sta provando, es. "🔥 Fuochi e forni extra · Liv. 2" */
  what: string;
  /** testo del pulsante per comprare, es. "Compra · €900" o "Assumi · €380/mese" */
  buyLabel: string;
  /** null se si può comprare, altrimenti il motivo */
  blocked: () => string | null;
  /** compra davvero; true se è andata */
  buy: () => boolean;
}

export interface InteriorOpts {
  preview?: PreviewOpts;
  /** tutorial della prima volta in questo tipo di attività */
  tutorial?: boolean;
}

/** In anteprima arriva un cliente ogni tot secondi, a qualsiasi ora: si prova la cucina sotto pressione. */
const PREVIEW_SPAWN_SEC = 7;

interface Slot {
  item: Item | null;
  p: number;
  /** dipendente che sta venendo a toglierlo dal fuoco */
  claim?: Worker;
  /** cuoco che l'ha messo sul fuoco (lo toglie lui) */
  owner?: Worker;
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
  /** mobile della postazione (pulsa quando è lì l'azione) */
  obj?: THREE.Object3D;
}

/** Cosa sta facendo un cuoco: andare a una postazione e lavorarci. */
interface Job {
  act: 'rescue' | 'start' | 'work' | 'cook' | 'pass' | 'bin' | 'fetch' | 'serve' | 'table' | 'stock';
  target?: Station;
  /** punti da raggiungere a piedi (se diversi dalla postazione) */
  path?: THREE.Vector3[];
  slot?: Slot;
  customer?: Customer;
  t: number;
}

interface Worker {
  emp: Employee;
  char: Character;
  home: THREE.Vector3;
  job?: Job;
  /** prodotto che ha in mano */
  item?: Item;
  sprite?: THREE.Sprite;
  pause: number;
}

const barGeo = new THREE.PlaneGeometry(0.7, 0.1);
const COLORS = { cook: 0xffc21a, ready: 0x35c46a, burnt: 0xff5d73 };

type Prompt = { label: string; icon: string; progress?: number; at?: THREE.Vector3; stand?: THREE.Vector3 } | null;

/**
 * Le fasi del lavoro, ognuna col suo colore: tappetino davanti alla postazione,
 * etichetta, freccia a terra e prodotto in mano hanno lo stesso colore.
 */
const PHASE: Record<StationDef['kind'], { name: string; color: number; css: string }> = {
  source: { name: 'Prendi', color: 0x2d9cdb, css: '#2d9cdb' },
  timed: { name: 'Cuoci', color: 0xff7a1a, css: '#f06a0f' },
  hold: { name: 'Prepara', color: 0x8e5bd6, css: '#8e5bd6' },
  counter: { name: 'Servi', color: 0x35c46a, css: '#2fae5e' },
  pass: { name: 'Ripiano', color: 0x35c46a, css: '#2fae5e' },
  bin: { name: 'Butta', color: 0x8a8aa0, css: '#77778f' },
};
/** Nome al singolare e se è femminile (per "cucinata", "dipinta"…). */
const SINGULAR: Partial<Record<ProductId, [string, boolean]>> = {
  panini: ['Panino', false], hotdog: ['Hot dog', false], tacos: ['Taco', false], gelati: ['Gelato', false],
  pane: ['Pane', false], cornetti: ['Cornetto', false], pizza: ['Pizza', true], torte: ['Torta', true],
};
/** Cosa è diventato il prodotto dopo una postazione (maschile) e cosa si fa alla prossima. */
const DONE: Record<string, string> = {
  piastra: 'cucinato', forno: 'sfornato', fornace: 'cotto', banco: 'assemblato', tagliere: 'tagliato', imballo: 'imballato',
  impastatrice: 'impastato', tavolo: 'formato', farcitura: 'farcito', decorazione: 'decorato',
  tornio: 'modellato', pittura: 'dipinto', smalto: 'smaltato', decoro: 'decorato',
};
const TODO: Record<string, string> = {
  piastra: 'cucinare', forno: 'infornare', fornace: 'cuocere in fornace', banco: 'assemblare', tagliere: 'tagliare', imballo: 'imballare',
  impastatrice: 'impastare', tavolo: 'formare', farcitura: 'farcire', decorazione: 'decorare',
  tornio: 'modellare', pittura: 'dipingere', smalto: 'smaltare', decoro: 'decorare',
};
/** Esperienza nel campo → quanti prodotti si portano insieme (1 all'inizio, fino a 4). */
export const HAND_LEVELS = [1, 3, 6, 10];

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
  /** prodotti in mano (più di uno con l'esperienza) */
  private hand: Item[] = [];
  private heldSprite: THREE.Sprite | null = null;
  private handKey = '';
  private spawnAcc = 0;
  private queueBase: THREE.Vector3;
  private door: THREE.Vector3;
  private uiT = 0;
  private walls: CutWall[] = [];
  private fx = new Particles();
  private smokeT = 0;
  private earned = 0;
  private served = 0;
  /** alle postazioni di partenza, senza ordini, si prepara in anticipo a rotazione */
  private advanceIdx = 0;

  constructor(private game: Game, public biz: Business, public opts: InteriorOpts = {}) {
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

  /**
   * Fuori dal locale: come nei lavoretti, il quartiere vero attorno al lotto dell'attività (stesse vie,
   * case, palazzi e parchi della città), girato in modo che la strada sia davanti al bancone, dove
   * arrivano i clienti. Il lotto è grande quanto la stanza più lo spazio davanti per la fila (e la sala).
   * Food truck: si lavora dentro il furgone parcheggiato nel parco (ruote e cabina si vedono da fuori);
   * locale: la stanza è dentro il negozio, con il marciapiede davanti.
   */
  private buildOutside() {
    const s = this.scene;
    const truck = this.biz.type === 'foodtruck';
    const x0 = LEFT - 2.2;
    const x1 = LEFT + this.width + 2.2;
    // dietro: il furgone ha un po' di prato, il negozio il resto dell'edificio; davanti la fila (e la sala)
    const z0 = truck ? BACK - 1.2 : BACK - 3.2;
    const z1 = this.level >= 2 ? 6.8 : 5.4;
    const O = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const flat = (w: number, d: number, color: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      s.add(m);
      return m;
    };
    // terreno attorno (sotto il quartiere) e il lotto: prato del parco o marciapiede del negozio
    flat(500, 500, 0x6fae4f, O.x, -0.06, O.z);
    flat(x1 - x0, z1 - z0, truck ? 0x79b85a : 0xc9cbd6, O.x, -0.02, O.z);
    // davanti al bancone: il selciato dove i clienti fanno la fila
    flat(x1 - x0, z1 - COUNTER_Z - 0.3, truck ? 0xcdbf9e : 0xb9bfd1, O.x, -0.012, (COUNTER_Z + 0.3 + z1) / 2);
    const slot = this.game.city.lots.find((l) => l.id === this.biz.lotId);
    if (slot) buildSurroundings(s, slot, this.game.city.placed, O, x1 - x0, z1 - z0, { radius: 80 });
    if (truck) this.truckShell();
    else this.shopShell(x0, x1, z0);
  }

  /**
   * Il negozio visto da fuori: la stanza è dentro l'edificio. Dietro e ai lati della stanza continua il
   * palazzo (muri e tetto), davanti la vetrina dà sul marciapiede. I blocchi sono più alti della parete di
   * fondo ma stanno dietro e di lato: non coprono mai la stanza.
   */
  private shopShell(x0: number, x1: number, z0: number) {
    const s = this.scene;
    const W = this.width;
    const facade = new THREE.MeshLambertMaterial({ color: 0xe8dcc4 });
    const roof = new THREE.MeshLambertMaterial({ color: 0x6f7685 });
    const H = 3.1;
    const block = (ax: number, bx: number, az: number, bz: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(bx - ax, H, bz - az), facade);
      b.position.set((ax + bx) / 2, H / 2, (az + bz) / 2);
      b.castShadow = true;
      const r = new THREE.Mesh(new THREE.BoxGeometry(bx - ax + 0.2, 0.18, bz - az + 0.2), roof);
      r.position.set((ax + bx) / 2, H + 0.09, (az + bz) / 2);
      s.add(b, r);
    };
    const front = COUNTER_Z + 0.35;
    // dietro la parete di fondo
    block(x0, x1, z0, BACK - 0.18);
    // sul tetto: condizionatori e un comignolo (si capisce che è il tetto del palazzo)
    const unit = new THREE.MeshLambertMaterial({ color: 0xdfe3ea });
    for (const [ux, uz, w, h, d] of [[x0 + 1.2, z0 + 0.9, 0.9, 0.5, 0.7], [x1 - 1.6, z0 + 1.2, 1.1, 0.6, 0.8], [(x0 + x1) / 2, z0 + 0.7, 0.4, 0.9, 0.4]]) {
      const u = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), unit);
      u.position.set(ux, H + 0.18 + h / 2, uz);
      u.castShadow = true;
      s.add(u);
    }
    // ai lati della stanza, fino alla vetrina
    block(x0, LEFT - 0.08, BACK - 0.18, front);
    block(LEFT + W + 0.08, x1, BACK - 0.18, front);
    // tenda sopra la vetrina ai lati (non sopra il bancone: non copre niente)
    for (const [ax, bx] of [[x0, LEFT - 0.08], [LEFT + W + 0.08, x1]]) {
      const aw = new THREE.Mesh(new THREE.BoxGeometry(bx - ax, 0.08, 0.7), new THREE.MeshLambertMaterial({ color: new THREE.Color(bizType(this.biz.type).color) }));
      aw.position.set((ax + bx) / 2, 2.3, front + 0.3);
      aw.rotation.x = 0.25;
      s.add(aw);
    }
  }

  /** Il furgone visto da fuori: ruote sotto la carrozzeria e la cabina di guida a destra. */
  private truckShell() {
    const s = this.scene;
    const col = this.layout.wall;
    const W = this.width;
    const tyre = new THREE.MeshLambertMaterial({ color: 0x222831 });
    const rim = new THREE.MeshLambertMaterial({ color: 0xc9ced8 });
    for (const x of [LEFT + 1.3, LEFT + W - 1.3]) {
      for (const z of [BACK - 0.25, COUNTER_Z + 0.32]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 18), tyre);
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.3, z);
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12), rim);
        r.rotation.x = Math.PI / 2;
        r.position.copy(w.position);
        s.add(w, r);
      }
    }
    // cabina: dietro la parete destra, più bassa, con il parabrezza
    const depth = COUNTER_Z - BACK + 0.6;
    const cab = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.7, depth), new THREE.MeshLambertMaterial({ color: col }));
    body.position.y = 0.85;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, depth - 0.4), new THREE.MeshLambertMaterial({ color: 0x9fd3f0 }));
    glass.position.set(0.96, 1.25, 0);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, depth), new THREE.MeshLambertMaterial({ color: 0x9aa3b5 }));
    bumper.position.set(1.0, 0.3, 0);
    cab.add(body, glass, bumper);
    cab.position.set(LEFT + W + 1.05, 0, (BACK + COUNTER_Z) / 2);
    cab.traverse((m) => ((m as THREE.Mesh).castShadow = true));
    s.add(cab);
    for (const z of [BACK - 0.25, COUNTER_Z + 0.32]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 18), tyre);
      w.rotation.x = Math.PI / 2;
      w.position.set(LEFT + W + 1.1, 0.3, z);
      s.add(w);
    }
  }

  private build() {
    const s = this.scene;
    const def = bizType(this.biz.type);
    // fuori: il cielo della città all'ora giusta (aggiornato in update) e la nebbia che sfuma il quartiere
    s.background = new THREE.Color(0x9fd3f0);
    s.fog = new THREE.Fog(0x9fd3f0, 55, 150);
    s.add(new THREE.HemisphereLight(0xffffff, 0x6a5a4a, 1.4));
    s.add(this.fx.group);
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(this.center - 3, 9, 7);
    sun.target.position.set(this.center, 0, 0);
    s.add(sun, sun.target);

    const W = this.width;
    const depth = COUNTER_Z - BACK + 0.3;
    this.buildOutside();
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

    const t = this.biz.type as keyof typeof LAYOUTS;
    const pro = upg(this.biz, 'attrezzatura');
    for (const d of kitchenLayout(t, this.level, upg(this.biz, 'fuochi'), upg(this.biz, 'banco'))) {
      const pos = new THREE.Vector3(d.x, 0, d.z);
      let furn: THREE.Object3D | undefined;
      if (d.model) {
        const o = model(d.model, FURN);
        // i mobili del furniture kit hanno l'origine in un angolo; il gruppo li ruota sulla parete
        o.position.set(-0.43 * FURN * 0.5, 0.05, -0.2 + 0.45 * FURN * 0.5);
        const wrap = new THREE.Group();
        wrap.position.set(d.x, 0, d.z);
        wrap.rotation.y = d.rot ?? 0;
        wrap.add(o);
        // attrezzatura professionale: postazioni di lavoro lucide e dorate
        if (pro > 0 && (d.kind === 'hold' || d.kind === 'timed')) {
          o.traverse((m) => {
            const mesh = m as THREE.Mesh;
            if (!mesh.isMesh) return;
            const mat = (mesh.material as THREE.MeshLambertMaterial).clone();
            mat.emissive = new THREE.Color(0xffb300);
            mat.emissiveIntensity = 0.08 + pro * 0.05;
            mesh.material = mat;
          });
        }
        s.add(wrap);
        furn = wrap;
      }
      const tall = d.model.includes('Fridge') || d.model.includes('bookcase');
      const st: Station = { def: d, pos, slots: [], hold: 0, tagY: d.kind === 'counter' || d.kind === 'pass' ? 1.55 : tall ? 2.5 : 1.7, obj: furn };
      const nSlots = d.kind === 'timed' ? (d.slots ?? 2) : 0;
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
    // ripiano dei pronti: più lungo con il miglioramento
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(this.passMax * 0.45 + 0.2, 0.06, 0.5), new THREE.MeshLambertMaterial({ color: 0xc8a27a }));
    shelf.position.set(this.stationOf('pass')!.pos.x + (this.passMax * 0.45) / 2 - 0.8, 1.09, COUNTER_Z);
    s.add(shelf);
    this.decorate();
    this.buildZones();
    // tappetino colorato davanti a ogni postazione: il colore dice la fase (Prendi, Cuoci, Prepara, Servi)
    for (const st of this.stations) {
      const k = st.def.kind;
      const mat = new THREE.Mesh(
        new THREE.PlaneGeometry(st.def.z > 1 ? 1.3 : 1.0, 0.7),
        new THREE.MeshBasicMaterial({ color: PHASE[k].color, transparent: true, opacity: 0.5, depthWrite: false }),
      );
      mat.rotation.x = -Math.PI / 2;
      if (st.def.z > 1) mat.position.set(st.pos.x, 0.07, FRONT - 0.1);
      else {
        mat.position.copy(st.pos).addScaledVector(this.front(st), 0.95).setY(0.07);
        mat.rotation.z = st.def.rot ?? 0;
      }
      s.add(mat);
    }
    // evidenzia la prossima postazione: anello verde a terra e freccia che rimbalza
    this.nextRing = ring(0x35c46a, 0.75);
    this.nextArrow = arrow(0x35c46a);
    this.nextArrow.scale.setScalar(0.6);
    s.add(this.nextRing, this.nextArrow, this.guide.mesh);

    // dipendenti: i cuochi alle postazioni, i cassieri al bancone
    let wi = 0;
    let ci = 0;
    // chi è al corso di formazione non c'è
    for (const e of this.biz.staff.filter((x) => !x.trainingEnd)) {
      const char = new Character(e.model || CHAR_MODELS[e.id % CHAR_MODELS.length]);
      const tag = label(e.name.split(' ')[0], { scale: 0.2 });
      tag.position.y = 1.75;
      char.root.add(tag);
      if (e.role === 'cassa') {
        char.root.position.set(this.stationOf('pass')!.pos.x + 0.9 + ci++ * 0.8, 0, COUNTER_Z - 0.6);
      } else if (e.role === 'sala') {
        char.root.position.set(this.door.x + 0.6, 0, 1.0);
      } else if (e.role === 'magazzino') {
        char.root.position.set(LEFT + 0.6, 0, -0.6);
      } else if (e.role === 'manager') {
        char.root.position.set(LEFT + this.width - 0.8, 0, 0.6);
        char.root.rotation.y = -Math.PI / 2;
      } else {
        // i cuochi aspettano in fila nel corridoio, pronti ad aiutare
        char.root.position.set(LEFT + 1.8 + (wi++ % 6) * 0.9, 0, 0.75);
        char.root.rotation.y = Math.PI;
      }
      s.add(char.root);
      this.workers.push({ emp: e, char, home: char.root.position.clone(), pause: 0 });
    }
  }

  /** posti a sedere dei tavoli in sala (solo nel locale grande) */
  private seats: { pos: THREE.Vector3; taken: Customer | null }[] = [];
  /** zona magazzino (dal primo ampliamento) */
  private store: THREE.Vector3 | null = null;

  /** Aree del locale: magazzino, cucina, cassa e sala. */
  private buildZones() {
    const s = this.scene;
    const W = this.width;
    const zoneTag = (t: string, x: number, z: number, bg: string) => {
      const l = label(t, { bg, scale: 0.26 });
      l.position.set(x, 0.35, z);
      s.add(l);
    };
    const tint = (x0: number, x1: number, z0: number, z1: number, color: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, 0.065, (z0 + z1) / 2);
      s.add(m);
    };
    tint(LEFT + 0.2, LEFT + W - 0.2, BACK + 0.1, 0.55, 0xff8a3d);
    zoneTag('🍳 Cucina', LEFT + W - 1.3, 0.35, '#ff8a3d');
    tint(LEFT + 1.5, LEFT + W - 0.2, 0.9, COUNTER_Z - 0.3, 0x35c46a);
    zoneTag('💰 Cassa', LEFT + W - 1.1, 1.15, '#35c46a');
    // magazzino: scaffali lungo la parete sinistra
    if (this.level >= 1) {
      this.store = new THREE.Vector3(LEFT + 0.55, 0, -0.9);
      const shelf = model('furniture/bookcaseOpen.glb', FURN);
      shelf.rotation.y = Math.PI / 2;
      shelf.position.set(LEFT + 0.12, 0.05, -0.45);
      s.add(shelf);
      zoneTag('📦 Magazzino', LEFT + 0.7, -0.2, '#8e5bd6');
    }
    // sala con tavoli davanti al bancone (locale grande)
    if (this.level >= 2) {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const x = LEFT + W - 1.6 - i * 2.2;
        const z = 5.3;
        const table = new THREE.Group();
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 16), new THREE.MeshLambertMaterial({ color: 0xffffff }));
        top.position.y = 0.75;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.75, 8), new THREE.MeshLambertMaterial({ color: 0x455a64 }));
        leg.position.y = 0.37;
        table.add(top, leg);
        table.position.set(x, 0, z);
        s.add(table);
        this.seats.push({ pos: new THREE.Vector3(x, 0, z + 0.75), taken: null });
      }
      zoneTag('🍽️ Sala', LEFT + W - 1.6, 6.4, '#2d9cdb');
    }
  }

  /** Dettagli visibili dei miglioramenti: piante, manifesti, scorte, menù. */
  private decorate() {
    const s = this.scene;
    const W = this.width;
    // look e insegna: piante lungo le pareti e pavimento più caldo
    const look = upg(this.biz, 'look');
    for (let i = 0; i < Math.min(look, 8); i++) {
      const g = new THREE.Group();
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 10), new THREE.MeshLambertMaterial({ color: 0xc1693c }));
      pot.position.y = 0.15;
      const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), new THREE.MeshLambertMaterial({ color: 0x3fae57, flatShading: true }));
      leaves.position.y = 0.5;
      g.add(pot, leaves);
      const left = i % 2 === 0;
      g.position.set(left ? LEFT + 0.3 : LEFT + W - 0.3, 0, -1.6 + Math.floor(i / 2) * 0.75);
      s.add(g);
    }
    if (look > 0) {
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.6, 1.2), new THREE.MeshLambertMaterial({ color: 0xd9534f }));
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(this.center, 0.06, 0.55);
      s.add(rug);
    }
    // pubblicità: manifesti sulla parete di fondo
    const ads = ['📣 PROMO!', '⭐ I migliori!', '🔥 Novità', '💯 Top', '🎉 Offerta', '❤️ Da provare'];
    for (let i = 0; i < Math.min(upg(this.biz, 'marketing'), ads.length); i++) {
      const l = label(ads[i], { bg: '#ff5d73', scale: 0.32 });
      l.position.set(LEFT + 0.9 + i * 1.3, 2.35, BACK + 0.05);
      s.add(l);
    }
    // magazzino più grande: scatoloni di scorte vicino al frigo/dispensa
    const src = this.stationOf('source')!;
    for (let i = 0; i < upg(this.biz, 'frigo') * 2; i++) {
      const b = boxProp(0.45, 0.35, 0.45, 0xc8a27a);
      b.position.set(src.pos.x - 0.95, 0.05 + Math.floor(i / 2) * 0.36, src.pos.z + (i % 2) * 0.5 - 0.1);
      s.add(b);
    }
    // lavagna del menù con i prodotti in vendita
    const menu = label(`📋 Menù: ${this.biz.products.map((p) => PRODUCTS[p].icon).join(' ')}`, { bg: '#2e3b2f', scale: 0.34 });
    menu.position.set(LEFT + W - 1.6, 2.35, BACK + 0.05);
    s.add(menu);
  }

  private tag(t: string, v: THREE.Vector3, y: number, bg?: string) {
    const l = label(t, { scale: 0.38, bg, fg: bg ? '#fff' : undefined });
    l.position.set(v.x, y, v.z);
    this.scene.add(l);
    return l;
  }

  // ---------------- guida ----------------

  /** Capienza: in mano si porta un prodotto alla volta. */
  /** Quanti prodotti si portano in mano: cresce col livello nel campo dell'attività. */
  get handMax() {
    const lvl = skillLevel(this.game.state, bizType(this.biz.type).skills[0]);
    return HAND_LEVELS.filter((l) => lvl >= l).length;
  }
  /** posti sul ripiano dei pronti (+2 per livello del miglioramento) */
  get passMax() {
    return 4 + 2 * upg(this.biz, 'ripiano');
  }
  private guideEl: HTMLDivElement | null = null;
  /** riquadro sotto la guida: cosa hai in mano, per nome */
  private handEl: HTMLDivElement | null = null;
  private handHtml = '';
  private guideKey = '';
  private nextRing!: THREE.Mesh;
  private nextArrow!: THREE.Object3D;
  private guide = new GuideLine(0xffffff, 0.24);

  /** Postazione dove andare adesso. */
  private nextStation(): Station | null {
    const hand = this.hand;
    if (hand.length) {
      if (hand.some((x) => this.cold(x))) return this.stationOf('bin') ?? null;
      const raw = hand.find((x) => !this.finished(x));
      if (raw) return this.bestStation(this.recipe(raw)[raw.step], this.player.root.position);
      return hand.some((x) => this.deliverable(x)) ? this.stationOf('counter') ?? null : this.stationOf('pass') ?? null;
    }
    // qualcosa è pronto sul fuoco? prima si ritira
    const ready = this.stations.find((s) => s.slots.some((sl) => sl.item && sl.p >= 1));
    if (ready) return ready;
    if (this.pass.some((p) => this.deliverable(p))) return this.stationOf('counter') ?? null;
    if (this.pass.some((p) => this.cold(p))) return this.stationOf('pass') ?? null;
    const need = this.needed()[0];
    if (need) return this.bestStation(this.layout.recipes[need.pid]?.steps[0] ?? '', this.player.root.position);
    return null;
  }

  /**
   * Tra le postazioni con lo stesso ruolo (es. due piastre) sceglie la più comoda:
   * con un posto libero, non occupata da un dipendente, la più vicina.
   */
  private bestStation(id: string, from: THREE.Vector3, by?: Worker): Station | null {
    const list = this.stations.filter((s) => s.def.id === id);
    const busy = (st: Station) => this.workers.some((w) => w !== by && w.job?.target === st && w.job.act === 'work');
    const score = (st: Station) => {
      let v = st.pos.distanceTo(from);
      if (st.def.kind === 'timed' && !st.slots.some((sl) => !sl.item)) v += 50;
      if (busy(st)) v += 20;
      return v;
    };
    return list.sort((a, b) => score(a) - score(b))[0] ?? null;
  }

  /**
   * Etichetta della postazione: quanti prodotti ci sono in lavorazione lì
   * (in mano a te o ai cuochi e diretti qui, sul fuoco, pronti da servire).
   * Il nome completo e il verbo solo sulla prossima postazione.
   */
  private stationLabel(st: Station, hot: boolean) {
    const d = st.def;
    const carried = [...this.hand, ...this.workers.flatMap((w) => (w.item ? [w.item] : []))];
    const headed = carried.filter((x) => !this.finished(x) && this.recipe(x)[x.step] === d.id).length;
    let count = '';
    if (d.kind === 'timed') {
      const on = st.slots.filter((x) => x.item).length;
      const done = st.slots.filter((x) => x.item && x.p >= 1).length;
      count = ` ${on}/${st.slots.length}${done ? ` ✅${done}` : ''}${headed ? ` +${headed}` : ''}`;
    } else if (d.kind === 'hold') count = headed ? ` ${headed}` : '';
    else if (d.kind === 'source') {
      const n = this.needed().filter((x) => this.layout.recipes[x.pid]?.steps[0] === d.id).length;
      count = n ? ` ${n}` : '';
    } else if (d.kind === 'counter') {
      const n = [...this.hand, ...this.pass].filter((x) => this.finished(x) && this.deliverable(x)).length;
      count = n ? ` ${n}` : '';
    } else if (d.kind === 'pass') count = ` ${this.pass.length}/${this.passMax}`;
    return hot ? `👉 ${d.icon} ${d.verb}${count}` : `${d.icon}${count}`;
  }

  private updateTags() {
    const next = this.nextStation();
    for (const st of this.stations) {
      const hot = st === next;
      const key = this.stationLabel(st, hot);
      if (key === st.tagKey) continue;
      st.tagKey = key;
      if (st.tag) this.scene.remove(st.tag);
      st.tag = this.tag(key, st.pos, st.tagY, PHASE[st.def.kind].css);
      if (hot) st.tag.scale.multiplyScalar(1.35);
    }
    this.nextRing.visible = this.nextArrow.visible = !!next;
    if (next) {
      // anello e freccia del colore della fase: lo stesso del prodotto in mano
      const col = PHASE[next.def.kind].color;
      (this.nextRing.material as THREE.MeshBasicMaterial).color.setHex(col);
      this.nextArrow.traverse((o) => ((o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined)?.color?.setHex(col));
      if (next.def.z > 1) this.nextRing.position.set(next.pos.x, 0.08, FRONT - 0.1);
      else this.nextRing.position.copy(next.pos).addScaledVector(this.front(next), 0.95).setY(0.08);
      this.nextArrow.position.set(next.pos.x, 2.35 + Math.sin(performance.now() / 220) * 0.12, next.pos.z);
    }
  }

  /** Riquadro con il percorso del prodotto e le capienze, sempre visibile. */
  private updateGuide() {
    if (!this.guideEl) return;
    const it = this.hand[0] ?? null;
    const onFire = this.stations.filter((s) => s.def.kind === 'timed');
    const s = this.game.state;
    const caps = [
      `💰 €${Math.round(s.money).toLocaleString('it-IT')}`,
      `${isOpenHour(s) ? '🟢 Aperto' : '🔴 Chiuso'} · coda ${this.customers.length}/${BUSINESS.MAX_QUEUE}`,
      // tutti i fuochi/forni insieme: posti occupati sul totale
      ...(onFire.length ? [`${onFire[0].def.icon} ${onFire[0].def.name.replace(/ \d+$/, '')} ${onFire.reduce((a, x) => a + x.slots.filter((y) => y.item).length, 0)}/${onFire.reduce((a, x) => a + x.slots.length, 0)}`] : []),
      ...(this.workers.some((w) => w.emp.role === 'cucina') ? [`👨‍🍳 Cuochi al lavoro ${this.workers.filter((w) => w.emp.role === 'cucina' && w.job).length}/${this.workers.filter((w) => w.emp.role === 'cucina').length}`] : []),
      `${this.stationOf('pass')!.def.icon} Pronti ${this.pass.length}/${this.passMax}`,
    ].map((c) => `<span>${c}</span>`).join('');
    // niente fasi del singolo prodotto qui: con più prodotti in lavorazione
    // sono le etichette delle postazioni a dire quanti ce ne sono e dove
    let title: string;
    const next = this.nextStation();
    if (this.hand.some((x) => this.cold(x))) {
      const c = this.hand.find((x) => this.cold(x))!;
      title = `❄️ ${PRODUCTS[c.pid].name} freddo: buttalo nel 🗑️ cestino`;
    } else if (next?.slots.some((sl) => sl.item && sl.p >= 1) && !this.hand.some((x) => !this.finished(x))) {
      title = `✅ Pronto! Ritira da ${next.def.icon} ${next.def.name}`;
    } else if (it) {
      // la fase la dicono le postazioni (anello, freccia, etichetta): qui solo il calore
      const warm = this.hand.filter((x) => this.finished(x)).map((x) => Math.ceil(x.warm ?? 0));
      title = warm.length ? `🌡️ Caldo ancora ${Math.min(...warm)}s` : '';
    } else if (next?.def.kind === 'counter') {
      title = '🍽️ Un cliente aspetta quello che hai sul ripiano: servilo dal bancone';
    } else if (next?.def.kind === 'pass') {
      title = '❄️ Sul ripiano c\'è un prodotto freddo: prendilo e buttalo';
    } else {
      const need = this.needed();
      title = need.length
        ? `🧾 Da preparare: ${need.slice(0, 5).map((n) => PRODUCTS[n.pid].icon + (n.takeaway ? '🥡' : '')).join(' ')}${need.length > 5 ? ` +${need.length - 5}` : ''}`
        : this.customers.length ? '⏳ Aspetta che la cottura finisca' : '💡 Nessun cliente: prepara in anticipo (resta caldo ' + WARM_SEC + 's)';
    }
    const key = title + caps;
    if (key === this.guideKey) return;
    this.guideKey = key;
    this.guideEl.innerHTML = `${title ? `<div class="gd-title">${title}</div>` : ''}<div class="gd-caps">${caps}</div>`;
    this.placeHandBadge();
  }

  /**
   * Riquadro "in mano": una riga per ogni posto in mano (quanti se ne possono portare);
   * ogni prodotto dice com'è ("Panino cucinato") e cosa gli manca ("da assemblare").
   * Posti vuoti = righe vuote.
   */
  private updateHandBadge() {
    if (!this.handEl) return;
    const rows: string[] = [];
    for (let i = 0; i < this.handMax; i++) {
      const x = this.hand[i];
      if (!x) {
        rows.push('<div class="hb-slot empty"></div>');
        continue;
      }
      const p = PRODUCTS[x.pid];
      const [one, fem] = SINGULAR[x.pid] ?? [p.name, false];
      const g = (w: string) => (fem ? w.replace(/o$/, 'a') : w);
      const steps = this.recipe(x);
      const doneId = x.step > 1 ? steps[x.step - 1] : null;
      const done = doneId ? ` ${g(DONE[doneId] ?? 'lavorato')}` : '';
      let state: string;
      let css: string;
      if (this.cold(x)) {
        state = `${g('freddo')} · da buttare`;
        css = '#2d9cdb';
      } else if (this.finished(x)) {
        state = this.deliverable(x) ? `${g('pronto')} per i clienti` : `${g('pronto')}: mettil${fem ? 'a' : 'o'} sul ripiano`;
        css = PHASE.counter.css;
      } else {
        const next = steps[x.step];
        state = `da ${TODO[next] ?? 'lavorare'}`;
        css = PHASE[this.stationDef(next)!.kind].css;
      }
      rows.push(`<div class="hb-slot"><b>${p.icon} ${one}${done}${x.takeaway ? ' 🥡' : ''}</b><em style="background:${css}">${state}</em></div>`);
    }
    const html = rows.join('');
    if (html === this.handHtml) return;
    this.handHtml = html;
    this.handEl.innerHTML = html;
    this.placeHandBadge();
  }

  /** Il riquadro "in mano" sta subito sotto la guida (la cui altezza cambia). */
  private placeHandBadge() {
    if (!this.handEl) return;
    const above = this.guideEl ?? this.previewEl;
    this.handEl.style.top = above ? `${above.getBoundingClientRect().bottom + 6}px` : 'var(--sat)';
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
    // dentro le attività niente riquadro con soldi e capienze: solo quello con gli oggetti in mano
    // (le capienze stanno sulle etichette delle postazioni)
    this.handEl = document.createElement('div');
    this.handEl.className = 'hand-badge';
    document.body.appendChild(this.handEl);
    this.handHtml = '';
    document.body.classList.add('guide-on');
    if (this.opts.preview) {
      this.buildPreviewBar(this.opts.preview);
      // il primo cliente arriva subito
      this.spawnAcc = 0.9;
    }
    if (this.opts.tutorial) {
      this.tut = new KitchenTutorial(this.game, this.biz.type, () => this.handEl, (a) => this.tutAction(a));
      this.spawnCustomer(this.tutorialProduct());
    }
    // dopo che guida e riquadro "in mano" sono nella pagina (servono per la zona libera)
    requestAnimationFrame(() => {
      this.offLayout = layout.on(() => this.resize());
    });
    this.resize();
  }

  exit() {
    this.biz.__playerInside = false;
    this.guideEl?.remove();
    this.guideEl = null;
    this.handEl?.remove();
    this.handEl = null;
    this.previewEl?.remove();
    this.previewEl = null;
    this.tut?.remove();
    this.tut = null;
    this.camera.clearViewOffset();
    document.body.classList.remove('guide-on');
    this.offLayout?.();
    this.offLayout = null;
    this.hand = [];
    this.renderHand();
    this.scene.remove(this.player.root);
    if (this.opts.preview) {
      if (this.served) toast(`👁️ Prova finita: ${this.served} ordini serviti (incasso di prova €${Math.round(this.earned)}, non guadagnato)`, 'info');
    } else if (this.served) toast(`Turno finito: ${this.served} ordini completati, +€${Math.round(this.earned)}`, 'money');
  }

  /** metà della larghezza inquadrata e distanza della camera */
  private view: { d: number; pitch: number; z: number; follow: { min: number; max: number } | null } = { d: 10, pitch: 1, z: 1.3, follow: null };
  private camX = 0;

  /**
   * Inquadratura della stanza nella zona libera dello schermo (LayoutManager): in verticale
   * sotto i riquadri e a sinistra dei pulsanti, in orizzontale tra il pannello a sinistra e i pulsanti.
   */
  private resize = () => {
    const free = layout.freeRect(INTERIOR_UI());
    this.freeKey = `${Math.round(free.x / 6)},${Math.round(free.y / 6)},${Math.round(free.w / 6)},${Math.round(free.h / 6)}`;
    const tall = free.w < free.h;
    const pitch = THREE.MathUtils.degToRad(tall ? 58 : 55);
    // la stanza, il bancone e la fila dei clienti (nel locale grande anche la sala)
    // la cucina, il bancone e la fila dei clienti (la sala con i tavoli resta fuori: la cucina viene più grande)
    const box = { x0: LEFT, x1: LEFT + this.width, z0: BACK, z1: 3.3, wall: 2.4 };
    const f = frameRoom(this.camera, free, box, pitch);
    this.view = { d: f.d, pitch, z: f.z, follow: f.follow };
    this.placeCamera(true);
  };
  private freeKey = '';
  private offLayout: (() => void) | null = null;

  /** I riquadri cambiano altezza (più righe, più prodotti in mano): se la zona libera cambia, si reinquadra. */
  private refitIfNeeded() {
    const free = layout.freeRect(INTERIOR_UI());
    const k = `${Math.round(free.x / 6)},${Math.round(free.y / 6)},${Math.round(free.w / 6)},${Math.round(free.h / 6)}`;
    if (k !== this.freeKey) this.resize();
  }

  private placeCamera(snap = false) {
    const v = this.view;
    // stanza intera: camera ferma al centro; stanza troppo larga: segue il personaggio
    const want = !v.follow ? this.center : THREE.MathUtils.clamp(this.player?.root.position.x ?? this.center, v.follow.min, v.follow.max);
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

  private cold(it: Item) {
    return this.finished(it) && (it.warm ?? WARM_SEC) <= 0;
  }

  /** Il prodotto è appena diventato pronto: parte il timer del calore. */
  private markReady(it: Item) {
    if (this.finished(it) && it.warm === undefined) it.warm = WARM_SEC;
  }

  /** Prodotti in vendita che si possono preparare qui con il livello attuale. */
  private makeable() {
    return this.biz.products.filter((p) => (this.layout.recipes[p]?.level ?? 99) <= this.level && (this.biz.stock[p] ?? 0) > 0);
  }

  /** `tutorial`: il cliente del tutorial, che ordina un solo prodotto e non ha fretta. */
  private spawnCustomer(tutorial?: ProductId) {
    const ok = this.makeable();
    if (!tutorial && (this.customers.length >= BUSINESS.MAX_QUEUE || !ok.length)) {
      if (!this.sandbox) lostCustomer(this.biz, !ok.length ? 'stock' : 'queue', this.game.state);
      return;
    }
    // ordini più grandi quando il locale cresce
    const n = tutorial ? 1 : 1 + (Math.random() < 0.3 + 0.1 * this.level ? 1 : 0) + (this.level >= 1 && Math.random() < 0.15 ? 1 : 0);
    const lines: OrderLine[] = [];
    for (let i = 0; i < n; i++) {
      let pid = tutorial ?? pickProduct(this.game.state, this.biz);
      if (!tutorial && !ok.includes(pid)) pid = ok[Math.floor(Math.random() * ok.length)];
      lines.push({ pid, done: false });
    }
    const takeaway = !tutorial && this.hasStation('imballo') && Math.random() < 0.3;
    const char = new Character(CHAR_MODELS[Math.floor(Math.random() * CHAR_MODELS.length)]);
    char.root.position.set(this.queueBase.x + 4, 0, this.queueBase.z + 5);
    char.root.rotation.y = Math.PI;
    const bubble = label('…', { bg: '#ffffff', fg: '#000', scale: 0.5 });
    bubble.position.y = 1.95;
    char.root.add(bubble);
    this.scene.add(char.root);
    const max = BUSINESS.CUSTOMER_PATIENCE_MIN * (0.8 + 0.45 * n) * (this.biz.type === 'artigianato' ? 1.6 : 1);
    const c: Customer = { lines, takeaway, patience: max, maxPatience: max, char, bubble, bubbleKey: '', paid: 0, tut: !!tutorial };
    // nel locale grande metà dei clienti (non da asporto) mangia in sala
    const seat = !tutorial && !takeaway && Math.random() < 0.5 ? this.seats.find((x) => !x.taken) : undefined;
    if (seat) {
      seat.taken = c;
      c.table = seat.pos;
    }
    this.customers.push(c);
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
      ...this.hand.filter((x) => !this.cold(x)),
      ...this.pass.filter((x) => !this.cold(x)),
      ...this.stations.flatMap((s) => s.slots.flatMap((sl) => (sl.item ? [sl.item] : []))),
      ...this.workers.flatMap((w) => (w.item && !this.cold(w.item) && !this.pass.includes(w.item) ? [w.item] : [])),
    ];
    for (const it of inWork) {
      const i = pending.findIndex((p) => p.pid === it.pid && p.takeaway === it.takeaway);
      if (i >= 0) pending.splice(i, 1);
    }
    return pending;
  }

  private deliverable(it: Item) {
    if (this.cold(it)) return false;
    return this.customers.some((c) => c.takeaway === it.takeaway && c.lines.some((l) => !l.done && l.pid === it.pid));
  }

  /** Consegna un prodotto finito al primo cliente che lo aspetta. */
  private deliver(it: Item, manual: boolean, emp?: Employee, only?: Customer) {
    for (const c of only ? [only] : this.customers) {
      if (c.takeaway !== it.takeaway) continue;
      const line = c.lines.find((l) => !l.done && l.pid === it.pid);
      if (!line) continue;
      line.done = true;
      const s = this.game.state;
      const frac = Math.max(0, c.patience / c.maxPatience);
      // con un cassiere al bancone i clienti sono serviti meglio: mance più alte;
      // in sala il cameriere porta il cibo al tavolo: mancia ancora più alta
      const cashierBonus = this.workers.filter((w) => w.emp.role === 'cassa').reduce((a, w) => a + empStat(w.emp, 'kindness') * 0.015, 0) +
        (c.table && emp?.role === 'sala' ? 0.2 + empStat(emp, 'kindness') * 0.02 : 0);
      const tip = (manual ? 1 + 0.3 * frac : 1 + (emp ? empStat(emp, 'kindness') * 0.01 : 0)) + cashierBonus;
      // anteprima e tutorial: è solo una prova, niente soldi, scorte, esperienza o fama
      const amount = this.sandbox
        ? PRODUCTS[it.pid].price * tip * (it.takeaway ? 1.1 : 1)
        : recordSale(s, this.biz, it.pid, manual, tip * (it.takeaway ? 1.1 : 1));
      c.paid += amount;
      this.earned += amount;
      if (manual && !this.sandbox) {
        addXp(s, 'clientela', 1);
        missionProgress(s, 'served');
        playStats(s).served++;
      }
      if (c.lines.every((l) => l.done)) {
        this.served++;
        if (manual && this.sandbox) toast(`✅ Ordine completo (prova: €${c.paid.toFixed(2).replace('.', ',')} non incassati)`, 'info');
        else if (manual) {
          addFame(s, 'clientela', 0.1 * c.lines.length);
          toast(`✅ Ordine completo: +€${c.paid.toFixed(2).replace('.', ',')}`, 'money');
        }
        if (c.tut) this.tutServed = true;
        this.removeCustomer(c, true);
      } else this.refreshBubble(c);
      return;
    }
  }

  private removeCustomer(c: Customer, happy: boolean) {
    this.customers = this.customers.filter((x) => x !== c);
    const seat = this.seats.find((x) => x.taken === c);
    if (seat) seat.taken = null;
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

  /**
   * Ciò che il giocatore ha in mano: una pila di prodotti su un vassoio, ognuno
   * del colore della fase in cui deve andare (pronti = prodotto vero, freddi = azzurri),
   * e sopra la testa il conteggio con la prossima postazione di ognuno.
   */
  private renderHand() {
    const hand = this.hand;
    const minWarm = Math.min(...hand.filter((x) => this.finished(x) && !this.cold(x)).map((x) => Math.ceil(x.warm ?? WARM_SEC)));
    const key = hand.map((x) => `${x.pid}${x.step}${this.cold(x)}`).join() + (hand.length ? minWarm : '');
    if (key === this.handKey) return;
    this.handKey = key;
    if (this.heldSprite) this.player.root.remove(this.heldSprite);
    this.heldSprite = null;
    if (!hand.length) {
      this.player.hold(undefined);
      return;
    }
    const tray = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.3), new THREE.MeshLambertMaterial({ color: 0x9c6b3f }));
    tray.add(base);
    hand.forEach((x, i) => {
      let o: THREE.Object3D;
      if (this.finished(x) && !this.cold(x)) {
        o = productObject(PRODUCTS[x.pid].model, 0.24);
      } else {
        const next = this.cold(x) ? null : this.stationDef(this.recipe(x)[x.step]);
        const col = this.cold(x) ? 0xbfe6ff : next ? PHASE[next.kind].color : 0xffffff;
        o = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.13, 0.2), new THREE.MeshLambertMaterial({ color: col }));
        o.position.y = 0.065;
      }
      const slot = new THREE.Group();
      slot.add(o);
      slot.position.y = 0.02 + i * 0.16;
      tray.add(slot);
    });
    this.player.hold(tray);
    // vassoio alto sulla spalla, da cameriere: si vede anche di spalle
    tray.position.set(0.28, CHAR_HEIGHT * 0.98, 0.18);
    const chips = hand.map((x) => {
      const pi = PRODUCTS[x.pid].icon + (x.takeaway ? '🥡' : '');
      if (this.cold(x)) return `${pi}❄️`;
      if (this.finished(x)) return `${pi}✅`;
      return `${pi}→${this.stationDef(this.recipe(x)[x.step])?.icon ?? ''}`;
    });
    const anyCold = hand.some((x) => this.cold(x));
    const warm = Number.isFinite(minWarm) ? ` 🌡️${minWarm}s` : '';
    // uguali raggruppati: "🥪×3→🔥"
    const groups = new Map<string, number>();
    for (const c of chips) groups.set(c, (groups.get(c) ?? 0) + 1);
    const list = [...groups].map(([c, n]) => (n > 1 ? c.replace(/^(\S+?)(→|✅|❄️)/u, `$1×${n}$2`) : c));
    const txt = `✋${hand.length}/${this.handMax} ${list.join(' ')}${warm}`;
    const bg = anyCold ? '#2d9cdb' : hand.every((x) => this.finished(x)) ? '#35c46a' : '#ffffff';
    this.heldSprite = label(txt, { bg, fg: bg === '#ffffff' ? '#3a2f55' : '#fff', scale: 0.5 });
    this.heldSprite.position.y = 2.45;
    this.player.root.add(this.heldSprite);
  }

  // ---------------- aggiornamento ----------------

  private skyT = 99;

  update(dt: number) {
    const s = this.game.state;
    const gm = dt * TIME.GAME_MIN_PER_SEC;
    // il cielo fuori segue l'ora del giorno, come in città
    this.skyT += dt;
    if (this.skyT > 1) {
      this.skyT = 0;
      this.game.updateLighting();
      const sky = this.game.scene.background as THREE.Color;
      (this.scene.background as THREE.Color).copy(sky);
      this.scene.fog?.color.copy(sky);
    }
    // all'ora di chiusura, servito l'ultimo cliente, si esce e la porta resta chiusa fino al mattino
    if (!isOpenHour(s) && !this.customers.length && !this.opts.preview && !this.tut) {
      toast(`🔒 L'attività ha chiuso: riapre alle ${BUSINESS.OPEN_HOUR}:00`, 'info');
      this.game.exitTruck();
      return;
    }
    if (this.tut) {
      // nel tutorial c'è solo il suo cliente
    } else if (this.opts.preview) {
      this.spawnAcc += Math.max(dt / PREVIEW_SPAWN_SEC, (totalDemand(s, this.biz) * gm) / 60);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawnCustomer();
      }
    } else if (isOpenHour(s)) {
      notePeak(this.biz, demandNow(s, this.biz));
      this.spawnAcc += (demandNow(s, this.biz) * gm) / 60;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawnCustomer();
      }
    }
    this.updateCustomers(dt, gm);
    this.updateStations(dt);
    this.coolDown(dt);
    this.updateWorkers(dt, gm);
    this.updatePlayer(dt);
    this.placeCamera();
    if (this.biz.autoRestock && !this.sandbox) restock(s, this.biz);
    this.uiT += dt;
    if (this.uiT > 0.2) {
      this.uiT = 0;
      this.renderPass();
      this.updateGuide();
      this.updateHandBadge();
      this.updatePreviewBar();
      this.placeHandBadge();
      this.refitIfNeeded();
    }
    this.updateTags();
    if (this.tut) this.tut.update(this.tutStep());
    // linea verso la prossima postazione (davanti al mobile, dove ci si ferma)
    const next = this.nextStation();
    this.guide.update(dt, this.player.root.position, next ? this.nextRing.position : null, 0.4);
  }

  /** I prodotti pronti (in mano o sul ripiano) si raffreddano col tempo. */
  private coolDown(dt: number) {
    // nel tutorial il tempo è fermo: i prodotti non si raffreddano
    if (this.tut) return;
    for (const it of [...this.pass, ...this.hand]) {
      if (!this.finished(it) || it.warm === undefined) continue;
      const was = it.warm > 0;
      it.warm -= dt;
      if (was && it.warm <= 0) toast(`❄️ ${PRODUCTS[it.pid].name} si è raffreddato: va buttato`, 'bad');
    }
    // il testo sopra la testa mostra i secondi di calore rimasti
    if (this.hand.length) this.renderHand();
  }

  private updateCustomers(dt: number, gm: number) {
    const queue = this.customers.filter((c) => !c.table);
    this.customers.forEach((c) => {
      // fila a zig-zag davanti al bancone; chi mangia in sala va al tavolo
      const i = queue.indexOf(c);
      const target = c.table ?? new THREE.Vector3(this.queueBase.x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 1.1, 0, this.queueBase.z + (i ? 0.5 : 0));
      const p = c.char.root.position;
      const d = p.distanceTo(target);
      if (d > 0.05) {
        p.lerp(target, Math.min(1, (dt * 3) / Math.max(d, 0.001)));
        c.char.play('walk');
      } else c.char.play('idle');
      c.char.root.rotation.y = Math.PI;
      c.char.update(dt);
      if (!c.tut) c.patience -= gm;
      this.refreshBubble(c);
      const f = Math.max(0, c.patience / c.maxPatience);
      (c.bubble.material as THREE.SpriteMaterial).color.setRGB(1, 0.55 + 0.45 * f, 0.55 + 0.45 * f);
      if (c.patience <= 0) {
        if (!this.sandbox) {
          lostCustomer(this.biz, 'queue', this.game.state);
          addFame(this.game.state, 'clientela', -0.2);
        }
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
        sl.p += (dt * speed) / ((st.def.sec ?? 3) * SLOW);
        // nel tutorial non brucia niente
        if (this.tut) sl.p = Math.min(sl.p, 1.1);
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

  /**
   * Catena di montaggio:
   * - 🍳 cucina: ogni cuoco prende un prodotto che manca e lo segue da zero
   *   (materia prima → fuoco → lo toglie → assembla → ripiano); più cuochi si
   *   dividono gli ordini. Chi resta senza lavoro fa il jolly: salva dal fuoco
   *   ciò che nessuno toglie e butta il cibo freddo.
   * - 💰 cassa: i cassieri prendono dal ripiano, portano al bancone e incassano.
   * - 🍽️ sala: i camerieri portano il cibo ai tavoli.
   * - 📦 magazzino: il magazziniere porta le scorte al frigo.
   */
  private updateWorkers(dt: number, _gm: number) {
    const h = hourOf(this.game.state);
    for (const w of this.workers) {
      // turni: chi non è di turno non c'è (finisce prima quello che ha in mano); nelle anteprime ci sono tutti
      const on = !!this.opts.preview || w.emp.role === 'manager' || onShift(this.game.state, this.biz, w.emp, h);
      if (!on && !w.item && !w.job) {
        // finisce il turno: i prodotti che aveva sul fuoco li prendono gli altri (non restano "suoi" a bruciare)
        if (w.char.root.visible) {
          for (const st of this.stations) for (const sl of st.slots) {
            if (sl.owner === w) sl.owner = undefined;
            if (sl.claim === w) sl.claim = undefined;
          }
        }
        w.char.root.visible = false;
        continue;
      }
      w.char.root.visible = true;
      w.char.update(dt);
      // nel tutorial lavori solo tu: i dipendenti aspettano
      if (this.tut) continue;
      if (w.emp.role === 'cucina') this.updateCook(w, dt);
      else if (w.emp.role === 'cassa' || w.emp.role === 'sala') this.updateServer(w, dt);
      else if (w.emp.role === 'magazzino') this.updateStocker(w, dt);
    }
  }

  private setWorkerItem(w: Worker, it?: Item) {
    w.item = it;
    if (w.sprite) w.char.root.remove(w.sprite);
    w.sprite = undefined;
    if (!it) return;
    w.sprite = label(PRODUCTS[it.pid].icon + (this.finished(it) ? '✅' : ''), { bg: '#ffffff', fg: '#000', scale: 0.32 });
    w.sprite.position.y = 2.05;
    w.char.root.add(w.sprite);
  }

  /** Prossima cosa da fare per un cuoco libero (mani vuote). */
  private nextCookJob(w: Worker): Job | undefined {
    const p = w.char.root.position;
    // 1) i suoi prodotti sul fuoco sono pronti: li toglie lui
    for (const st of this.stations) {
      for (const sl of st.slots) {
        if (sl.item && sl.owner === w && sl.p >= 1 && !sl.claim) {
          sl.claim = w;
          return { act: 'rescue', target: st, slot: sl, t: 0 };
        }
      }
    }
    // 2) prende un nuovo prodotto da preparare (il lavoro si divide tra i cuochi).
    //    Se il giocatore sta lavorando, i cuochi iniziano prodotti nuovi solo quando la coda
    //    è più lunga di quanto lui riesce a portare: il resto lo lasciano a lui e lo aiutano.
    const needs = this.needed();
    const helpOnly = this.playerWorking && needs.length <= this.handMax;
    if (this.pass.length < this.passMax && !helpOnly) {
      const need = needs[this.playerWorking ? this.handMax : 0] ?? needs[needs.length - 1];
      const src = need && this.bestStation(this.layout.recipes[need.pid]?.steps[0] ?? '', p, w);
      if (need && src) {
        this.setWorkerItem(w, { pid: need.pid, step: 0, takeaway: need.takeaway });
        return { act: 'start', target: src, t: 0 };
      }
    }
    // 3) jolly: salva dal fuoco ciò che nessuno toglie. Quelli del giocatore solo quando
    //    stanno per bruciare (prima li lascia a lui); quelli di un cuoco occupato subito.
    for (const st of this.stations) {
      for (const sl of st.slots) {
        const ownerBusy = sl.owner ? !!sl.owner.item || sl.p >= 1.25 : sl.p >= 1 + (BURN - 1) * 0.45;
        if (sl.item && sl.p >= 1.05 && sl.p < BURN && !sl.claim && ownerBusy) {
          sl.claim = w;
          return { act: 'rescue', target: st, slot: sl, t: 0 };
        }
      }
    }
    // 4) jolly: butta il cibo freddo dal ripiano
    if (this.pass.some((x) => this.cold(x))) return { act: 'bin', target: this.stationOf('pass')!, t: 0 };
    return undefined;
  }

  /** Dopo aver preso/lavorato un prodotto: dove portarlo. */
  private continueItem(w: Worker): Job | undefined {
    const it = w.item!;
    if (this.cold(it)) return { act: 'bin', target: this.stationOf('bin')!, t: 0 };
    if (this.finished(it)) return { act: 'pass', target: this.stationOf('pass')!, t: 0 };
    const id = this.recipe(it)[it.step];
    const st = this.bestStation(id, w.char.root.position, w);
    if (!st) return undefined;
    return { act: st.def.kind === 'timed' ? 'cook' : 'work', target: st, t: 0 };
  }

  /** Direzione verso cui guarda una postazione (dove ci si mette per usarla). */
  private front(st: Station) {
    return st.def.rot ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 0, 1);
  }

  private standAt(st: Station) {
    if (st.def.z > 1) return new THREE.Vector3(st.pos.x + 0.35, 0, FRONT - 0.2);
    const f = this.front(st);
    return st.pos.clone().addScaledVector(f, 0.85).add(new THREE.Vector3(f.z * 0.3, 0, -f.x * 0.3));
  }

  /** Cammina verso un punto; true quando è arrivato. */
  private walkTo(w: Worker, target: THREE.Vector3, dt: number) {
    const p = w.char.root.position;
    const d = p.distanceTo(target);
    if (d <= 0.08) return true;
    const speed = Math.max(0.7, employeeRate(w.emp, this.biz) / 4);
    p.addScaledVector(target.clone().sub(p).normalize(), Math.min(d, dt * 3 * speed));
    w.char.faceTowards(target.x, target.z, dt);
    w.char.play(w.item ? 'holding-both' : 'walk');
    return false;
  }

  private goHome(w: Worker, dt: number) {
    if (this.walkTo(w, w.home, dt)) w.char.play('idle');
  }

  private updateCook(w: Worker, dt: number) {
    if (!w.job) w.job = w.item ? this.continueItem(w) : this.nextCookJob(w);
    const job = w.job;
    if (!job) {
      this.goHome(w, dt);
      return;
    }
    // il prodotto da togliere è sparito (l'ha preso il giocatore o un altro)
    if (job.act === 'rescue' && (!job.slot!.item || job.slot!.claim !== w)) {
      if (job.slot!.claim === w) job.slot!.claim = undefined;
      w.job = undefined;
      return;
    }
    const st = job.target!;
    if (!this.walkTo(w, this.standAt(st), dt)) return;
    w.char.faceTowards(st.pos.x, st.pos.z, dt);
    const speed = Math.max(0.7, employeeRate(w.emp, this.biz) / 4);
    const pro = 1 + 0.15 * upg(this.biz, 'attrezzatura');
    switch (job.act) {
      case 'rescue': {
        job.t += dt / 0.5;
        if (job.t < 1) return;
        const sl = job.slot!;
        const it = sl.item!;
        const burnt = sl.p >= BURN;
        sl.item = null;
        sl.claim = sl.owner = undefined;
        sl.bar.visible = sl.fill.visible = false;
        this.fx.emit('spark', st.pos.clone().setY(1.3), 6);
        w.job = undefined;
        if (burnt) return;
        it.step++;
        this.markReady(it);
        this.setWorkerItem(w, it);
        return;
      }
      case 'start': {
        job.t += dt / 0.6;
        if (job.t < 1) return;
        w.item!.step = 1;
        this.setWorkerItem(w, w.item);
        w.job = undefined;
        return;
      }
      case 'work': {
        w.char.play('interact-right', 0.1, 1.3);
        if (Math.random() < dt * 10) this.fx.emit('dust', st.pos.clone().setY(1.1), 1, 0xf5e6c8);
        job.t += (dt * speed * pro) / ((st.def.sec ?? 1) * SLOW);
        if (job.t < 1) return;
        w.item!.step++;
        this.markReady(w.item!);
        this.setWorkerItem(w, w.item);
        employeeGainXp(w.emp, 1);
        w.job = undefined;
        return;
      }
      case 'cook': {
        const free = st.slots.find((sl) => !sl.item);
        if (!free) {
          job.t += dt;
          if (job.t > 1.5) w.job = undefined;
          return;
        }
        free.item = w.item!;
        free.p = 0;
        free.owner = w;
        this.setWorkerItem(w);
        w.job = undefined;
        return;
      }
      case 'pass': {
        if (this.pass.length >= this.passMax) return;
        this.pass.push(w.item!);
        this.setWorkerItem(w);
        employeeGainXp(w.emp, 1);
        w.job = undefined;
        return;
      }
      case 'bin': {
        job.t += dt / 0.4;
        if (job.t < 1) return;
        if (w.item) this.setWorkerItem(w);
        else {
          const i = this.pass.findIndex((x) => this.cold(x));
          if (i >= 0) this.pass.splice(i, 1);
        }
        w.job = undefined;
        return;
      }
    }
  }

  /** Cassieri (al bancone) e camerieri (ai tavoli): prendono dal ripiano e consegnano. */
  private updateServer(w: Worker, dt: number) {
    const waiter = w.emp.role === 'sala';
    const hasWaiter = this.workers.some((x) => x.emp.role === 'sala');
    if (!w.job) {
      // chi aspetta cosa: i camerieri servono i tavoli, i cassieri il bancone (e i tavoli se non c'è cameriere)
      const target = this.pass.find((it) => this.customers.some((c) =>
        (waiter ? !!c.table : !c.table || !hasWaiter) && c.takeaway === it.takeaway && c.lines.some((l) => !l.done && l.pid === it.pid) && !this.cold(it)));
      if (target && !this.workers.some((x) => x !== w && x.job?.act === 'fetch' && x.item === target)) {
        w.job = { act: 'fetch', target: this.stationOf('pass')!, t: 0 };
        w.item = target;
      }
    }
    const job = w.job;
    if (!job) {
      this.goHome(w, dt);
      return;
    }
    if (job.act === 'fetch') {
      const it = w.item!;
      if (!this.pass.includes(it)) {
        // qualcun altro l'ha già preso
        w.item = undefined;
        w.job = undefined;
        return;
      }
      if (!this.walkTo(w, this.standAt(job.target!), dt)) return;
      this.pass.splice(this.pass.indexOf(it), 1);
      this.setWorkerItem(w, it);
      const c = this.customers.find((x) => (waiter ? !!x.table : true) && x.takeaway === it.takeaway && x.lines.some((l) => !l.done && l.pid === it.pid));
      if (waiter && c?.table) {
        // esce dalla porta e va al tavolo
        w.job = { act: 'table', customer: c, path: [this.door.clone(), new THREE.Vector3(this.door.x, 0, 3.6), c.table.clone().add(new THREE.Vector3(0, 0, -0.5))], t: 0 };
      } else w.job = { act: 'serve', target: this.stationOf('counter')!, customer: c, t: 0 };
      return;
    }
    if (job.act === 'serve') {
      if (!this.walkTo(w, this.standAt(job.target!).add(new THREE.Vector3(-0.35, 0, 0)), dt)) return;
      w.char.play('interact-right', 0.1, 1.2);
      job.t += dt / 0.4;
      if (job.t < 1) return;
      const it = w.item!;
      this.setWorkerItem(w);
      this.fx.emit('spark', w.char.root.position.clone().setY(1.4), 8);
      if (this.deliverable(it)) this.deliver(it, false, w.emp);
      employeeGainXp(w.emp, 1);
      w.job = undefined;
      return;
    }
    if (job.act === 'table') {
      const next = job.path![0];
      if (next) {
        if (this.walkTo(w, next, dt)) job.path!.shift();
        return;
      }
      const it = w.item!;
      this.setWorkerItem(w);
      if (job.customer && this.customers.includes(job.customer)) this.deliver(it, false, w.emp, job.customer);
      this.fx.emit('spark', w.char.root.position.clone().setY(1.4), 8);
      employeeGainXp(w.emp, 1);
      // torna dentro dalla porta
      w.job = { act: 'stock', path: [new THREE.Vector3(this.door.x, 0, 3.6), this.door.clone()], t: 0 };
      return;
    }
    if (job.act === 'stock') {
      const next = job.path![0];
      if (next && this.walkTo(w, next, dt)) job.path!.shift();
      if (!job.path!.length) w.job = undefined;
    }
  }

  /** Magazziniere: porta scatoloni dal magazzino al frigo (il riordino lo fa l'economia). */
  private updateStocker(w: Worker, dt: number) {
    const store = this.store ?? w.home;
    const src = this.stationOf('source')!;
    if (!w.job) w.job = { act: 'stock', path: [store.clone(), this.standAt(src)], t: 0 };
    const job = w.job;
    const next = job.path![0];
    if (!next) {
      job.t += dt;
      w.char.play('idle');
      if (job.t > 2) w.job = undefined;
      return;
    }
    if (this.walkTo(w, next, dt)) {
      job.path!.shift();
      if (job.path!.length === 1) {
        const box = boxProp(0.4, 0.3, 0.4, 0xc8a27a);
        box.position.set(0, 0.9, 0.35);
        w.char.root.add(box);
        w.sprite = box as unknown as THREE.Sprite;
      } else if (w.sprite) {
        w.char.root.remove(w.sprite);
        w.sprite = undefined;
      }
    }
  }

  private renderPass() {
    const key = this.pass.map((i) => i.pid + i.takeaway + this.cold(i)).join();
    if (this.passGroup.userData.key === key) return;
    this.passGroup.userData.key = key;
    this.passGroup.clear();
    this.pass.forEach((it, i) => {
      const l = label(PRODUCTS[it.pid].icon + (it.takeaway ? '🥡' : '') + (this.cold(it) ? '❄️' : ''), { bg: this.cold(it) ? 'rgba(160,210,255,0.95)' : 'rgba(255,255,255,0.9)', fg: '#000', scale: 0.32 });
      l.position.set(i * 0.45 - 0.6, 0.25, 0);
      l.userData.cold = this.cold(it);
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
      this.nearSt = null;
      g.ui.setAction({ label: 'Esci', icon: '🚪', at: this.door.clone().setY(0.9) });
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
    this.nearSt = best;
    if (!best) {
      g.ui.setAction(null);
      return;
    }
    const pressed = input.consumeAction();
    if (pressed || input.actionHeld) this.lastPlayerWork = performance.now();
    const pr = this.interact(best, dt, input.actionHeld, pressed);
    // l'anello da toccare sta sul mobile della postazione
    const k = best.def.kind;
    g.ui.setAction(pr && { ...pr, at: best.pos.clone().setY(k === 'counter' || k === 'pass' ? 1.15 : best.tagY > 2 ? 1.3 : 1.0), headY: this.hand.length ? 3.1 : 2.6, obj: best.obj,
      // il tappetino colorato davanti alla postazione: si può toccare anche lì
      stand: best.def.z > 1 ? new THREE.Vector3(best.pos.x, 0, FRONT - 0.1) : best.pos.clone().addScaledVector(this.front(best), 0.95) });
  }

  /** ultima volta (ms) che il giocatore ha lavorato a una postazione */
  private lastPlayerWork = -1e9;

  /**
   * Il giocatore sta lavorando (ha qualcosa in mano o ha usato una postazione da poco):
   * i cuochi lo aiutano invece di prendersi i suoi ordini.
   */
  private get playerWorking() {
    return this.hand.length > 0 || performance.now() - this.lastPlayerWork < 8000;
  }

  /** Cosa succede a una postazione; restituisce il testo del pulsante azione. */
  private interact(st: Station, dt: number, held: boolean, pressed: boolean): Prompt {
    const d = st.def;
    const hand = this.hand;
    const max = this.handMax;
    const full = hand.length >= max;
    const nextOf = (x: Item) => (this.finished(x) ? null : this.recipe(x)[x.step]);
    const count = ` (${hand.length}/${max})`;
    const skill = bizType(this.biz.type).skills[0];
    const took = () => {
      this.renderHand();
      this.player.once('pick-up');
    };
    const wrongHint = (): Prompt => {
      const cold = hand.find((x) => this.cold(x));
      if (cold) return { label: 'Hai un prodotto freddo: buttalo nel cestino', icon: '❄️' };
      const raw = hand.find((x) => nextOf(x));
      if (raw) {
        const nd = this.stationDef(nextOf(raw)!);
        return { label: `Prossima fase: ${nd?.icon} ${nd?.verb} (${nd?.name})`, icon: '👉' };
      }
      return null;
    };
    switch (d.kind) {
      case 'source': {
        if (full) return { label: `Mani piene${count}`, icon: '✋' };
        const need = this.needed().find((n) => this.layout.recipes[n.pid]?.steps[0] === d.id);
        if (need) {
          if (pressed) {
            hand.push({ pid: need.pid, step: 1, takeaway: need.takeaway });
            took();
          }
          return { label: `${d.verb}: ${PRODUCTS[need.pid].name}${need.takeaway ? ' 🥡' : ''}${count}`, icon: d.icon };
        }
        // nessun ordine: si può preparare in anticipo (a rotazione tra i prodotti di qui)
        const here = this.makeable().filter((pid) => this.layout.recipes[pid]?.steps[0] === d.id);
        if (!here.length) return { label: 'Scorte finite o prodotto non in vendita', icon: d.icon };
        const pid = here[this.advanceIdx % here.length];
        if (pressed) {
          this.advanceIdx++;
          hand.push({ pid, step: 1, takeaway: false });
          took();
        }
        return { label: `Prepara in anticipo: ${PRODUCTS[pid].name}${count}`, icon: d.icon };
      }
      case 'hold': {
        // si lavora un prodotto alla volta, tra quelli in mano che vanno qui
        const todo = hand.filter((x) => nextOf(x) === d.id);
        const it = todo[0];
        if (!it) {
          st.hold = 0;
          return wrongHint() ?? { label: d.name, icon: d.icon };
        }
        if (held) {
          st.hold += (dt * (1 + 0.15 * upg(this.biz, 'attrezzatura'))) / ((d.sec ?? 1) * SLOW);
          if (Math.random() < dt * 12) this.fx.emit('dust', st.pos.clone().setY(1.1), 1, 0xf5e6c8);
          this.player.play('interact-right', 0.1, 1.5);
          this.player.faceTowards(st.pos.x, st.pos.z, dt);
          if (st.hold >= 1) {
            st.hold = 0;
            it.step++;
            this.markReady(it);
            if (!this.sandbox) addXp(this.game.state, skill, 1);
            this.renderHand();
            if (todo.length === 1) this.player.play('idle');
          }
        }
        const more = todo.length > 1 ? ` (ancora ${todo.length})` : '';
        return { label: `Tieni premuto: ${d.verb} ${PRODUCTS[it.pid].name}${more}`, icon: d.icon, progress: st.hold };
      }
      case 'timed': {
        // prima si ritira ciò che è pronto (o bruciato)
        const ready = st.slots.find((sl) => sl.item && sl.p >= 1);
        const toPut = hand.filter((x) => nextOf(x) === d.id);
        const free = st.slots.filter((sl) => !sl.item);
        if (ready && (!full || ready.p >= BURN)) {
          const burnt = ready.p >= BURN;
          if (pressed) {
            // si ritira tutto il pronto che entra in mano (i bruciati si buttano)
            for (const sl of st.slots) {
              if (!sl.item || sl.p < 1) continue;
              if (sl.p >= BURN) {
                toast('🔥 Bruciato! Buttato via', 'bad');
              } else {
                if (hand.length >= max) continue;
                const r = sl.item;
                r.step++;
                this.markReady(r);
                hand.push(r);
                if (!this.sandbox) addXp(this.game.state, skill, 2);
              }
              sl.item = null;
              sl.bar.visible = sl.fill.visible = false;
            }
            this.fx.emit('spark', st.pos.clone().setY(1.3), 8);
            took();
          }
          return { label: burnt ? 'Butta (bruciato)' : `Togli: è pronto!${count}`, icon: burnt ? '🔥' : '✅' };
        }
        if (toPut.length) {
          if (!free.length) return { label: `Pieno (${st.slots.length}/${st.slots.length}): aspetta`, icon: d.icon };
          const n = Math.min(free.length, toPut.length);
          if (pressed) {
            // tutti quelli in mano che vanno qui, finché c'è posto
            for (let i = 0; i < n; i++) {
              free[i].item = toPut[i];
              free[i].p = 0;
              hand.splice(hand.indexOf(toPut[i]), 1);
            }
            this.renderHand();
          }
          return { label: `${d.verb}: ${n > 1 ? `${n}× ` : ''}${PRODUCTS[toPut[0].pid].name}`, icon: d.icon };
        }
        if (ready && full) return { label: `È pronto, ma hai le mani piene${count}`, icon: '✋' };
        return wrongHint() ?? { label: st.slots.some((sl) => sl.item) ? 'Sta cuocendo…' : d.name, icon: d.icon };
      }
      case 'counter': {
        const give = hand.filter((x) => this.finished(x) && this.deliverable(x));
        if (give.length) {
          if (pressed) {
            this.fx.emit('spark', st.pos.clone().setY(1.4), 12);
            // si consegna tutto ciò che è stato ordinato (deliverable ricontrollato dopo ogni consegna)
            for (const x of give) {
              if (!this.deliverable(x)) continue;
              this.deliver(x, true);
              hand.splice(hand.indexOf(x), 1);
            }
            this.renderHand();
            this.player.once('interact-right');
          }
          return { label: `${d.verb}${give.length > 1 ? ` ${give.length} prodotti` : ''}`, icon: PRODUCTS[give[0].pid].icon };
        }
        if (hand.some((x) => this.cold(x))) return { label: 'È freddo: buttalo nel cestino', icon: '❄️' };
        if (hand.some((x) => this.finished(x))) return { label: 'Nessuno lo ha ordinato: mettilo sul ripiano', icon: '🍽️' };
        if (hand.length) return wrongHint();
        // a mani vuote: si serve direttamente dal ripiano dei pronti
        const fromPass = this.pass.find((x) => this.deliverable(x));
        if (fromPass) {
          if (pressed) {
            this.pass.splice(this.pass.indexOf(fromPass), 1);
            this.fx.emit('spark', st.pos.clone().setY(1.4), 12);
            this.deliver(fromPass, true);
            this.player.once('interact-right');
          }
          return { label: `Servi dal ripiano ${PRODUCTS[fromPass.pid].icon}`, icon: '🍽️' };
        }
        return { label: 'Clienti', icon: d.icon };
      }
      case 'pass': {
        // appoggia i prodotti pronti (anche preparati in anticipo)
        const put = hand.filter((x) => this.finished(x) && !this.cold(x));
        if (put.length) {
          const room = this.passMax - this.pass.length;
          if (room <= 0) return { label: `Ripiano pieno (${this.passMax}/${this.passMax})`, icon: '🍽️' };
          const n = Math.min(room, put.length);
          if (pressed) {
            for (const x of put.slice(0, n)) {
              this.pass.push(x);
              hand.splice(hand.indexOf(x), 1);
            }
            this.renderHand();
          }
          return { label: `Appoggia ${n > 1 ? `${n} ` : ''}sul ripiano (${this.pass.length}/${this.passMax})`, icon: PRODUCTS[put[0].pid].icon };
        }
        if (!full && this.pass.length) {
          // prende prima quelli freddi (da buttare), poi i più vecchi
          const pick = this.pass.find((x) => this.cold(x)) ?? this.pass[0];
          if (pressed) {
            this.pass.splice(this.pass.indexOf(pick), 1);
            hand.push(pick);
            took();
          }
          return { label: this.cold(pick) ? 'Prendi (freddo) e buttalo' : `Prendi dai pronti${count}`, icon: PRODUCTS[pick.pid].icon };
        }
        return wrongHint() ?? { label: full ? `Mani piene${count}` : 'Ripiano vuoto', icon: d.icon };
      }
      case 'bin': {
        if (!hand.length) return { label: 'Cestino', icon: d.icon };
        // prima i freddi; se non ce ne sono, l'ultimo preso
        const cold = hand.filter((x) => this.cold(x));
        const out = cold.length ? cold : [hand[hand.length - 1]];
        if (pressed) {
          for (const x of out) hand.splice(hand.indexOf(x), 1);
          this.renderHand();
        }
        return { label: cold.length ? `Butta ${cold.length > 1 ? `${cold.length} freddi` : 'il freddo'}` : `Butta ${PRODUCTS[out[0].pid].name}`, icon: d.icon };
      }
    }
  }

  // ---------------- anteprima e tutorial ----------------

  /** Anteprima o tutorial in corso: è solo una prova (niente soldi, scorte, esperienza, fama). */
  private get sandbox() {
    return !!this.opts.preview || !!this.tut;
  }
  private previewEl: HTMLDivElement | null = null;
  private previewHtml = '';
  /** in anteprima si è comprata la miglioria (o assunto il dipendente) */
  bought = false;
  private tut: KitchenTutorial | null = null;
  private tutStage: TutStep['stage'] = 'intro';
  private tutServed = false;
  /** postazione accanto al giocatore (quella del pulsante giallo) */
  private nearSt: Station | null = null;

  get tutorialOn() {
    return !!this.tut;
  }

  private buildPreviewBar(p: PreviewOpts) {
    const el = document.createElement('div');
    el.className = 'preview-bar';
    el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-pv]')?.getAttribute('data-pv');
      if (a === 'exit') this.game.exitTruck();
      else if (a === 'buy' && !p.blocked() && p.buy()) {
        this.bought = true;
        this.game.exitTruck();
      }
    });
    document.body.appendChild(el);
    this.previewEl = el;
    this.previewHtml = '';
    this.updatePreviewBar();
  }

  /** Riquadro in alto dell'anteprima: cosa si prova, quanti ordini serviti, Compra / Esci. */
  private updatePreviewBar() {
    const p = this.opts.preview;
    if (!p || !this.previewEl) return;
    const why = p.blocked();
    const html = `<div class="pv-head"><span class="pv-tag">👁️ PROVA</span> ${p.what}</div>
      <div class="pv-sub">Gratis: non guadagni e non spendi niente${this.served ? ` · ${this.served} ordini serviti` : ''}</div>
      <div class="pv-btns"><button class="btn sm sec" data-pv="exit">✖ Esci</button><button class="btn sm good" data-pv="buy" ${why ? 'disabled' : ''}>${why ?? `✅ ${p.buyLabel}`}</button></div>`;
    if (html === this.previewHtml) return;
    this.previewHtml = html;
    this.previewEl.innerHTML = html;
    this.placeHandBadge();
  }

  /** Prodotto del cliente del tutorial: se c'è, uno che passa dal fuoco e da un banco. */
  private tutorialProduct(): ProductId {
    const ok = this.biz.products.filter((p) => (this.layout.recipes[p]?.level ?? 99) <= this.level);
    const kinds = (p: ProductId) => (this.layout.recipes[p]?.steps ?? []).map((id) => this.stationDef(id)?.kind);
    return ok.find((p) => kinds(p).includes('timed') && kinds(p).includes('hold')) ?? ok.find((p) => kinds(p).includes('timed')) ??
      ok[0] ?? (Object.keys(this.layout.recipes) as ProductId[])[0];
  }

  /** Cosa deve fare adesso il giocatore nel tutorial (lo traduce in testo KitchenTutorial). */
  private tutStep(): TutStep {
    if (this.tutStage === 'play' && this.tutServed) this.tutStage = 'tips';
    const c = this.customers.find((x) => x.tut);
    const pid = c?.lines[0].pid ?? this.tutorialProduct();
    const counter = this.stationOf('counter')!.def;
    const one = `${PRODUCTS[pid].icon} ${(SINGULAR[pid] ?? [PRODUCTS[pid].name])[0]}`;
    const base = { stage: this.tutStage, one, counter, near: false, status: 'idle' as TutStep['status'], station: null as StationDef | null };
    if (this.tutStage !== 'play') return base;
    const next = this.nextStation();
    let st = next;
    let status: TutStep['status'];
    if (!next) {
      st = this.stations.find((s) => s.slots.some((sl) => sl.item)) ?? null;
      status = st ? 'wait' : 'idle';
    } else if (next.def.kind === 'source') status = 'get';
    else if (next.def.kind === 'timed') status = this.hand.some((x) => !this.finished(x) && this.recipe(x)[x.step] === next.def.id) ? 'put' : 'take';
    else if (next.def.kind === 'hold') status = 'work';
    else if (next.def.kind === 'counter') status = 'serve';
    else status = next.def.kind === 'bin' ? 'bin' : 'pass';
    return { ...base, status, station: st?.def ?? null, near: !!st && this.nearSt === st };
  }

  private tutAction(a: 'next' | 'skip') {
    if (a === 'skip' || this.tutStage === 'go') {
      this.finishTutorial();
      return;
    }
    this.tutStage = this.tutStage === 'intro' ? 'play' : this.tutStage === 'tips' ? 'go' : this.tutStage;
  }

  /** Fine del tutorial (o saltato): non si ripropone più per questo tipo di attività, e si apre davvero. */
  private finishTutorial() {
    const s = this.game.state;
    s.bizTutorials = [...new Set([...(s.bizTutorials ?? []), this.biz.type])];
    for (const c of this.customers) c.tut = false;
    this.tut?.remove();
    this.tut = null;
    this.spawnAcc = 0;
    this.game.save();
    toast(isOpenHour(s) ? '🟢 Si apre! Arrivano i clienti' : '🔒 È l\'ora di chiusura: i clienti tornano domattina', 'info');
  }

  /** info per l'HUD */
  get info() {
    return { queue: this.customers.length, open: isOpenHour(this.game.state) };
  }
}
