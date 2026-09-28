import * as THREE from 'three';
import { model, preload } from './assets';
import { JOB, TIME } from './config/balance';
import { JOBS, JOB_TYPES, type JobType } from './config/jobs';
import { LOTS } from './config/map';
import { PRODUCTS, type ProductId } from './config/products';
import { Input } from './input';
import { CAMERA_MULT, onSettings, QUALITY_PIXEL_RATIO, settings } from './settings';
import { ensureWeather } from './sim/effects';
import { bus, toast } from './sim/bus';
import { advance, applyOffline, genMissions, missionProgress, updateEvents, type OfflineReport } from './sim/calendar';
import { bizAtLot, CHAR_MODELS, lotZone, refreshCandidates } from './sim/economy';
import { addFame, addMoney, addXp, skillLevel } from './sim/progress';
import {
  day, hourOf, loadState, newState, pick, rand, saveState, setCurrentSlot,
  type GameState, type JobOffer,
} from './sim/state';
import { Character, charPath } from './world/character';
import { City, CITY_ASSETS, DIR_ROT, DIR_VEC, type Slot } from './world/city';
import { board, exclamation, label, playerDot, ring, saleSign } from './world/props';
import { TruckInterior, INTERIOR_ASSETS } from './world/interior';
import { RouteRun, ScrubRun, SpotRun, VisitRun, type JobRun } from './minigames/jobs';
import { ClientHouse, HOUSE_ASSETS } from './world/clienthouse';
import { bizType } from './config/business';
import { VEHICLES, WALK_SPEED, type VehicleId } from './config/vehicles';
import { riderPose, vehicleModel, VEHICLE_ASSETS } from './world/vehicle';
import { completeOrder, lotPrice, typesForLot } from './sim/economy';
import { ZONES } from './config/map';
import { SKILLS } from './config/skills';
import type { Business, ServiceOrder } from './sim/state';
import type { UI } from './ui/ui';

export interface Interactable {
  pos: THREE.Vector3;
  radius: number;
  label: string;
  icon: string;
  action: () => void;
  enabled?: () => boolean;
}

export type MarkerCat = 'jobs' | 'mine' | 'forsale' | 'places' | 'target';

export interface MapMarker {
  /** identificativo stabile (per selezione e segnaposto) */
  id: string;
  x: number;
  z: number;
  icon: string;
  color: string;
  label: string;
  /** sottotitolo nella scheda */
  sub?: string;
  kind: 'job' | 'target' | 'waypoint' | 'lot' | 'biz' | 'board' | 'home' | 'dealer' | 'agency';
  cat: MarkerCat;
  /** parole in più per la ricerca */
  keywords?: string;
  /** metri dal giocatore */
  dist: number;
}

export interface Waypoint {
  id: string;
  x: number;
  z: number;
  icon: string;
  label: string;
}

export interface ActionPrompt {
  label: string;
  icon: string;
  progress?: number;
}

interface JobNpc {
  offer: JobOffer;
  char: Character;
  marker: THREE.Sprite;
  inter: Interactable;
}

interface TruckSite {
  lotId: string;
  slot: Slot;
  group: THREE.Group;
  inter: Interactable;
  built: boolean;
}

const PLAYER_MODEL = 'character-male-a';

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.5, 400);
  sun = new THREE.DirectionalLight(0xffffff, 2.2);
  hemi = new THREE.HemisphereLight(0xdfefff, 0x5a6e4a, 1.25);
  input: Input;
  ui!: UI;
  state!: GameState;
  city!: City;
  player!: Character;
  interior: TruckInterior | null = null;
  /** casa del cliente in cui si sta facendo un servizio (pulizie, trasloco) */
  house: ClientHouse | null = null;
  private houseDoor = new THREE.Vector3();
  playerMarker?: THREE.Sprite;

  interactables: Interactable[] = [];
  npcs = new Map<number, JobNpc>();
  trucks = new Map<string, TruckSite>();
  run: JobRun | null = null;
  runOffer: JobOffer | null = null;
  /** ordine di un'attività di servizio che il giocatore sta eseguendo */
  runOrder: { bizId: string; order: ServiceOrder } | null = null;
  private rideObj: THREE.Object3D | null = null;
  moveTarget: THREE.Vector3 | null = null;
  /** il minigioco in corso può sostituire il pulsante azione */
  prompt: ActionPrompt | null = null;
  private nextJobSpawn = 3;
  private saveTimer = 0;
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  paused = false;
  /** title = schermata iniziale (città sullo sfondo), play = partita */
  mode: 'title' | 'play' = 'title';
  /** la mappa a tutto schermo copre il mondo: niente rendering 3D */
  renderPaused = false;
  offlineReport: OfflineReport | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    this.applySettings();
    onSettings(() => this.applySettings());
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.input = new Input(canvas);

    this.scene.background = new THREE.Color(0x9fd3f0);
    this.scene.fog = new THREE.Fog(0x9fd3f0, 60, 150);
    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -24;
    sc.right = sc.top = 24;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Qualità grafica e ombre dalle impostazioni. */
  applySettings() {
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, QUALITY_PIXEL_RATIO[settings.quality]));
    this.sun.castShadow = settings.shadows;
    this.sun.shadow.mapSize.setScalar(settings.quality === 'alta' ? 1024 : 512);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.resize();
  }

  async init(onProgress: (f: number) => void) {
    const chars = [PLAYER_MODEL, ...CHAR_MODELS].map(charPath);
    const assets = [
      ...CITY_ASSETS, ...INTERIOR_ASSETS, ...HOUSE_ASSETS, ...chars, 'cars/van.glb', 'cars/delivery.glb', ...VEHICLE_ASSETS,
      'commercial/detail-awning-wide.glb', ...Object.values(PRODUCTS).flatMap((p) => (p.model ? [p.model] : [])),
      'furniture/cardboardBoxClosed.glb',
    ];
    await preload([...new Set(assets)], onProgress);

    this.city = new City();
    this.scene.add(this.city.group);
    for (const l of this.city.lots) lotZone[l.id] = l.zone;

    // bacheca, casa, concessionaria e agenzia non dipendono dalla partita
    this.setupPlaces();
  }

  /** Avvia la partita di uno slot: nuova (con nome) oppure caricata. */
  begin(slot: number, newName?: string) {
    setCurrentSlot(slot);
    const saved = newName === undefined ? loadState(slot) : null;
    this.state = saved ?? newState();
    if (newName !== undefined) this.state.saveName = newName.trim() || `Partita ${slot}`;
    if (!saved) {
      updateEvents(this.state, false);
      genMissions(this.state);
      refreshCandidates(this.state);
    } else {
      this.offlineReport = applyOffline(this.state, Date.now() - this.state.lastSeen);
    }
    ensureWeather(this.state);
    if (this.state.missionsDay !== day(this.state)) genMissions(this.state);
    if (this.state.candidatesDay !== day(this.state)) refreshCandidates(this.state);

    for (const lot of this.city.lots) this.setupLot(lot.id);
    this.spawnPlayer();
    this.mode = 'play';
    this.snapCamera();
    bus.on('newday', () => this.ui?.refresh());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.save());
    this.save();
  }

  private setupPlaces() {
    // bacheca
    const b = this.city.board;
    const bg = board();
    bg.position.copy(b.pos);
    bg.rotation.y = DIR_ROT[b.dir];
    this.scene.add(bg);
    this.city.colliders.push({ minX: b.pos.x - 1.1, maxX: b.pos.x + 1.1, minZ: b.pos.z - 0.25, maxZ: b.pos.z + 0.25 });
    this.addInteractable({
      pos: this.frontOf(b, 1.1), radius: 1.8, label: 'Bacheca', icon: '📋',
      action: () => this.ui.openMissions(),
    });

    // casa del giocatore
    const home = this.city.homes[0];
    const homeLabel = label('🏠 Casa tua', { bg: '#35c46a', scale: 0.5 });
    homeLabel.position.set(home.pos.x, 3.2, home.pos.z);
    this.scene.add(homeLabel);
    this.addInteractable({
      pos: home.pos, radius: 1.8, label: 'Casa', icon: '🏠',
      action: () => this.ui.openHome(),
    });

    // concessionaria e agenzia affari
    const dealer = this.city.dealer;
    const dl = label('🛵 Concessionaria', { bg: '#2d9cdb', scale: 0.6 });
    dl.position.set(dealer.center.x, 7.8, dealer.center.z);
    this.scene.add(dl);
    // due auto in esposizione davanti
    ['utilitaria', 'berlina'].forEach((v, i) => {
      const car = vehicleModel(v as VehicleId);
      const [dx, dz] = DIR_VEC[dealer.dir];
      car.position.set(dealer.pos.x + dz * (i ? 2.4 : -2.4) + dx * 0.4, 0, dealer.pos.z + dx * (i ? 2.4 : -2.4) + dz * 0.4);
      car.rotation.y = DIR_ROT[dealer.dir] + (i ? 0.5 : -0.5);
      car.scale.multiplyScalar(0.85);
      this.scene.add(car);
      this.city.colliders.push({ minX: car.position.x - 1, maxX: car.position.x + 1, minZ: car.position.z - 1, maxZ: car.position.z + 1 });
    });
    this.addInteractable({
      pos: dealer.pos, radius: 2, label: 'Concessionaria', icon: '🛵', action: () => this.ui.openDealer(),
    });
    const ag = this.city.agency;
    const al = label('🏢 Agenzia affari', { bg: '#8e5bd6', scale: 0.6 });
    al.position.set(ag.center.x, 11, ag.center.z);
    this.scene.add(al);
    this.addInteractable({
      pos: ag.pos, radius: 2, label: 'Agenzia affari', icon: '🏢', action: () => this.ui.openAgency('compra', true),
    });
  }

  private spawnPlayer() {
    const home = this.city.homes[0];

    // giocatore
    this.player = new Character(PLAYER_MODEL);
    const p = this.state.player;
    if (Number.isFinite(p.x)) this.player.root.position.set(p.x, 0, p.z);
    else this.player.root.position.copy(home.pos).add(new THREE.Vector3(...this.dirVec(home, 1.2)));
    this.scene.add(this.player.root);
    // indicatore sempre visibile, anche dietro gli edifici
    const pm = playerDot();
    pm.position.y = 2.05;
    this.player.root.add(pm);
    this.playerMarker = pm;
    this.applyRide();

    // NPC dei lavori già offerti
    this.state.jobs = this.state.jobs.filter((j) => this.slotsFor(j.type)[j.slot]);
    for (const j of this.state.jobs) this.spawnNpc(j);

  }

  // ---------------- utilità ----------------

  dirVec(slot: Slot, d: number): [number, number, number] {
    const [dx, dz] = DIR_VEC[slot.dir];
    return [dx * d, 0, dz * d];
  }

  frontOf(slot: Slot, d: number) {
    return slot.pos.clone().add(new THREE.Vector3(...this.dirVec(slot, d)));
  }

  addInteractable(i: Interactable) {
    this.interactables.push(i);
    return i;
  }

  removeInteractable(i: Interactable) {
    this.interactables = this.interactables.filter((x) => x !== i);
  }

  private slotCache = new Map<JobType, Slot[]>();
  /** Solo i posti con il fronte verso la camera (non a nord), così non restano nascosti dietro gli edifici. */
  slotsFor(type: JobType): Slot[] {
    let list = this.slotCache.get(type);
    if (!list) {
      const where = JOBS[type].where;
      const all = where === 'house' ? this.city.gardens : where === 'shop' ? this.city.shops : this.city.restaurants;
      list = all.filter((sl) => sl.dir !== 'N');
      if (!list.length) list = all;
      this.slotCache.set(type, list);
    }
    return list;
  }

  /** Case dove si possono consegnare i pacchi (fronte visibile). */
  get deliveryHouses() {
    return this.slotsFor('giardino');
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------------- lotti e food truck ----------------

  setupLot(lotId: string) {
    const old = this.trucks.get(lotId);
    if (old) {
      this.scene.remove(old.group);
      this.removeInteractable(old.inter);
    }
    const slot = this.city.lots.find((l) => l.id === lotId)!;
    const lot = LOTS.find((l) => l.id === lotId)!;
    const biz = bizAtLot(this.state, lotId);
    const g = new THREE.Group();
    g.position.copy(slot.center);
    this.scene.add(g);
    let inter: Interactable;
    const [dx, , dz] = this.dirVec(slot, 1);
    if (!biz) {
      const d = slot.kind === 'truck' ? 1.8 : 2.9;
      const sign = saleSign('€' + lot.price.toLocaleString('it-IT'));
      sign.position.set(dx * d + dz * 1.2, 0, dz * d + dx * 1.2);
      sign.rotation.y = DIR_ROT[slot.dir];
      g.add(sign);
      const r = ring(0xff5d5d, slot.kind === 'truck' ? 2.2 : 1.4);
      r.position.set(dx * (d - 0.4), 0.05, dz * (d - 0.4));
      g.add(r);
      inter = this.addInteractable({
        pos: slot.center.clone().add(new THREE.Vector3(dx * d, 0, dz * d)), radius: 2.4,
        label: slot.kind === 'truck' ? 'Posteggio in vendita' : 'Locale in vendita', icon: '🏷️',
        action: () => this.ui.openLot(lotId),
      });
    } else if (slot.kind === 'truck') {
      // furgone con il lato di servizio (+X locale) verso la strada
      const van = model('cars/van.glb', 1.55);
      van.rotation.y = DIR_ROT[slot.dir] - Math.PI / 2;
      g.add(van);
      const awn = model('commercial/detail-awning-wide.glb', 4.2);
      const side = new THREE.Group();
      side.rotation.y = DIR_ROT[slot.dir];
      side.add(awn);
      awn.position.z = 0.75;
      awn.position.y = 0.3;
      g.add(side);
      const icons = biz.products.map((p) => PRODUCTS[p].icon).join(' ');
      const sign = label(`🚚 ${icons}`, { bg: '#e8590c', scale: 0.55 });
      sign.position.y = 2.9;
      g.add(sign);
      // collisione del furgone (lungo il lato perpendicolare alla strada)
      const hw = dx !== 0 ? 1.3 : 2.3;
      const hd = dz !== 0 ? 1.3 : 2.3;
      this.city.colliders = this.city.colliders.filter((c) => (c as { lot?: string }).lot !== lotId);
      this.city.colliders.push(Object.assign({ minX: slot.center.x - hw, maxX: slot.center.x + hw, minZ: slot.center.z - hd, maxZ: slot.center.z + hd }, { lot: lotId }));
      inter = this.addInteractable({
        pos: slot.center.clone().add(new THREE.Vector3(dx * 2.3, 0, dz * 2.3)), radius: 2,
        label: 'Entra nel food truck', icon: '🚪', action: () => this.enterBusiness(lotId),
      });
    } else {
      // negozio in un edificio: insegna colorata sopra l'ingresso
      const def = bizType(biz.type);
      const icons = biz.products.map((p) => PRODUCTS[p].icon).join('');
      const sign = label(`${def.icon} ${def.name} ${icons}`, { bg: def.color, scale: 0.6 });
      sign.position.set(dx * 2.2, 4.2, dz * 2.2);
      g.add(sign);
      const mat = ring(new THREE.Color(def.color).getHex(), 1.1);
      mat.position.set(dx * 2.8, 0.05, dz * 2.8);
      g.add(mat);
      const service = def.kind === 'service';
      inter = this.addInteractable({
        pos: slot.pos, radius: 2.2,
        label: service ? `Ufficio ${def.name.toLowerCase()}` : `Entra: ${def.name}`, icon: service ? '📋' : '🚪',
        action: () => (service ? this.ui.openBusiness(biz.id, 'ordini') : this.enterBusiness(lotId)),
      });
    }
    this.trucks.set(lotId, { lotId, slot, group: g, inter, built: !!biz });
  }

  enterBusiness(lotId: string) {
    const biz = bizAtLot(this.state, lotId);
    if (!biz || this.run) {
      if (this.run) toast('Finisci prima il lavoro in corso', 'bad');
      return;
    }
    this.dismount();
    this.scene.remove(this.player.root);
    this.interior = new TruckInterior(this, biz);
    this.interior.enter(this.player);
    this.moveTarget = null;
    this.ui.refresh();
  }

  exitTruck() {
    if (!this.interior) return;
    const lotId = this.interior.biz.lotId;
    this.interior.exit();
    this.interior = null;
    const site = this.trucks.get(lotId)!;
    this.player.root.position.copy(site.inter.pos);
    this.player.root.rotation.y = DIR_ROT[site.slot.dir];
    this.city.collide(this.player.root.position, 0.4);
    this.scene.add(this.player.root);
    this.player.play('idle');
    this.ui.refresh();
  }

  // ---------------- lavori ----------------

  offerPay(type: JobType, level: number) {
    const def = JOBS[type];
    const f = this.state.fame[def.skill];
    return Math.round(def.basePay * (1 + 0.18 * (level - 1)) * (1 + f / (f + 60)));
  }

  private spawnOffer() {
    const s = this.state;
    const key = (sl: Slot) => `${sl.pos.x},${sl.pos.z}`;
    const inUse = new Set(s.jobs.map((j) => key(this.slotsFor(j.type)[j.slot])));
    const types = JOB_TYPES.filter((t) => !s.jobs.some((j) => j.type === t) || s.jobs.length >= JOB_TYPES.length);
    const type = pick(types.length ? types : JOB_TYPES);
    const slots = this.slotsFor(type);
    const free = slots.map((_, i) => i).filter((i) => !inUse.has(key(slots[i])));
    if (!free.length) return;
    // preferisci posti non troppo lontani dal giocatore
    const pp = this.player.root.position;
    free.sort((a, b) => slots[a].pos.distanceTo(pp) - slots[b].pos.distanceTo(pp));
    const slot = free[Math.min(free.length - 1, Math.floor(Math.random() * Math.min(5, free.length)))];
    const level = skillLevel(s, JOBS[type].skill);
    const offer: JobOffer = { id: s.jobSeq++, type, slot, level, pay: this.offerPay(type, level) };
    s.jobs.push(offer);
    this.spawnNpc(offer);
  }

  private spawnNpc(offer: JobOffer) {
    const slot = this.slotsFor(offer.type)[offer.slot];
    const char = new Character(CHAR_MODELS[offer.id % CHAR_MODELS.length]);
    char.root.position.copy(slot.pos);
    char.root.rotation.y = DIR_ROT[slot.dir];
    this.scene.add(char.root);
    const marker = exclamation();
    marker.position.y = 2.1;
    char.root.add(marker);
    const def = JOBS[offer.type];
    const inter = this.addInteractable({
      pos: slot.pos, radius: 1.9, label: def.name, icon: def.icon,
      action: () => this.ui.openJobOffer(offer),
      enabled: () => !this.run,
    });
    this.npcs.set(offer.id, { offer, char, marker, inter });
  }

  removeNpc(offerId: number) {
    const n = this.npcs.get(offerId);
    if (!n) return;
    this.scene.remove(n.char.root);
    this.removeInteractable(n.inter);
    this.npcs.delete(offerId);
    this.state.jobs = this.state.jobs.filter((j) => j.id !== offerId);
  }

  startJob(offer: JobOffer) {
    if (this.run) return;
    const npc = this.npcs.get(offer.id);
    if (npc) npc.marker.visible = false;
    this.runOffer = offer;
    const slot = this.slotsFor(offer.type)[offer.slot];
    const def = JOBS[offer.type];
    if (!def.vehicleOk) this.dismount();
    const title = `${def.icon} ${def.name}`;
    const lv = offer.level;
    switch (offer.type) {
      case 'giardino': this.run = new SpotRun(this, lv, slot, { kind: 'bush', title }); break;
      case 'consegna': this.run = new RouteRun(this, lv, slot, { mode: 'package', title }); break;
      case 'volantini': this.run = new RouteRun(this, lv, slot, { mode: 'flyer', title }); break;
      case 'piatti': this.run = new ScrubRun(this, lv, 'plate', title); break;
      case 'lavaggio': this.run = new ScrubRun(this, lv, 'car', title); break;
      case 'imbianchino': this.run = new ScrubRun(this, lv, 'wall', title); break;
    }
    this.ui.jobBar(true);
  }

  /** Il titolare esegue di persona un ordine della sua impresa di servizi. */
  startOrder(biz: Business, order: ServiceOrder) {
    if (this.run) {
      toast('Finisci prima il lavoro in corso', 'bad');
      return;
    }
    if ((biz.stock[order.pid] ?? 0) <= 0) {
      toast('Magazzino vuoto: compra i materiali per questo servizio', 'bad');
      return;
    }
    if (this.interior) this.exitTruck();
    const houses = this.deliveryHouses;
    const slot = houses[order.house % houses.length];
    const def = bizType(biz.type);
    const lv = skillLevel(this.state, def.skills[0]);
    const pr = PRODUCTS[order.pid];
    const title = `${pr.icon} ${pr.name}`;
    this.runOrder = { bizId: biz.id, order };
    const run = new VisitRun(this, lv, slot, title, () => this.enterHouse(order.pid, lv, slot.pos, run));
    this.run = run;
    this.ui.jobBar(true);
    toast(`📍 Vai all'indirizzo segnato: ${pr.name}`, 'info');
  }

  /** Entra nella casa del cliente: il lavoro vero si fa lì dentro, in 3D. */
  private enterHouse(pid: ProductId, level: number, door: THREE.Vector3, run: VisitRun) {
    this.dismount();
    this.moveTarget = null;
    this.houseDoor.copy(door);
    this.scene.remove(this.player.root);
    this.house = new ClientHouse(this, pid, level, {
      status: (left, total, text) => {
        run.timeLeft = left;
        run.timeTotal = total;
        run.status = text;
      },
      done: (stars) => this.finishJob(stars),
    });
    this.house.enter(this.player);
    run.target = undefined;
  }

  private exitHouse() {
    if (!this.house) return;
    this.house.exit();
    this.house = null;
    this.player.root.position.copy(this.houseDoor);
    this.scene.add(this.player.root);
    this.player.play('idle');
    this.snapCamera();
  }

  cancelJob() {
    if (!this.run) return;
    this.finishJob(0);
  }

  /** stelle 0 = fallito */
  finishJob(stars: number) {
    const s = this.state;
    this.exitHouse();
    this.run?.dispose();
    this.run = null;
    this.prompt = null;
    this.ui.jobBar(false);
    if (this.runOrder) {
      this.finishOrder(stars);
      return;
    }
    const offer = this.runOffer!;
    this.runOffer = null;
    const def = JOBS[offer.type];
    let pay = 0;
    let xp = 0;
    let fame = 0;
    if (stars > 0) {
      pay = Math.round(offer.pay * JOB.STAR_PAY[stars]);
      xp = Math.round(def.xp * (1 + 0.1 * offer.level) * (0.6 + stars * 0.25));
      fame = def.fame * (stars / 2);
      addMoney(s, pay);
      addXp(s, def.skill, xp);
      addFame(s, def.skill, fame);
      missionProgress(s, 'jobs');
      missionProgress(s, 'jobType', { jobType: offer.type });
      if (stars === 3) missionProgress(s, 'stars3');
    } else {
      fame = -1;
      addFame(s, def.skill, fame);
    }
    this.removeNpc(offer.id);
    this.nextJobSpawn = Math.min(this.nextJobSpawn, rand(JOB.RESPAWN_MIN_SEC, JOB.RESPAWN_MAX_SEC));
    this.player.hold();
    this.player.play('idle');
    this.ui.openJobResult(offer, stars, pay, xp, fame);
    this.save();
  }

  private finishOrder(stars: number) {
    const s = this.state;
    const { bizId, order } = this.runOrder!;
    this.runOrder = null;
    const biz = s.businesses.find((b) => b.id === bizId);
    this.player.hold();
    this.player.play('idle');
    if (!biz) return;
    const earned = completeOrder(s, biz, order.id, stars);
    const def = bizType(biz.type);
    const xp = stars ? Math.round(PRODUCTS[order.pid].price / 6 + 8) : 0;
    if (stars) {
      for (const k of def.skills) addXp(s, k, Math.round(xp / def.skills.length));
      missionProgress(s, 'served');
    } else addFame(s, def.skills[0], -1);
    this.ui.openOrderResult(biz, order, stars, earned, xp);
    this.save();
  }

  // ---------------- mappa e indicatori ----------------

  /** segnaposto scelto dalla mappa: le freccette guidano fin lì */
  waypoint: Waypoint | null = null;

  setWaypoint(m: MapMarker | null) {
    this.waypoint = m ? { id: m.id, x: m.x, z: m.z, icon: m.icon, label: m.label } : null;
  }

  mapMarkers(): MapMarker[] {
    const p = this.player.root.position;
    const out: MapMarker[] = [];
    const add = (pos: { x: number; z: number }, m: Omit<MapMarker, 'x' | 'z' | 'dist'>) =>
      out.push({ ...m, x: pos.x, z: pos.z, dist: Math.hypot(pos.x - p.x, pos.z - p.z) });
    add(this.city.board.pos, { id: 'board', icon: '📋', color: '#8e5bd6', label: 'Bacheca missioni', kind: 'board', cat: 'places', keywords: 'missioni piazza' });
    add(this.city.homes[0].pos, { id: 'home', icon: '🏠', color: '#2fb36b', label: 'Casa tua', kind: 'home', cat: 'places', keywords: 'dormire teletrasporto' });
    add(this.city.dealer.pos, { id: 'dealer', icon: '🛵', color: '#2d9cdb', label: 'Concessionaria', kind: 'dealer', cat: 'places', keywords: 'veicoli auto scooter monopattino macchina' });
    add(this.city.agency.pos, { id: 'agency', icon: '🏢', color: '#8e5bd6', label: 'Agenzia affari', kind: 'agency', cat: 'places', keywords: 'comprare attività lotti resoconti' });
    for (const lot of this.city.lots) {
      const def = LOTS.find((l) => l.id === lot.id)!;
      const biz = bizAtLot(this.state, lot.id);
      const zone = ZONES[lot.zone].name;
      if (biz) {
        const bt = bizType(biz.type);
        const prods = biz.products.map((x) => PRODUCTS[x].name).join(' ');
        add(lot.center, {
          id: 'lot:' + lot.id, icon: bt.icon, color: bt.color, label: `${bt.name} · ${def.name}`, sub: `La tua attività · ${zone}`,
          kind: 'biz', cat: 'mine', keywords: `${prods} mia mie`,
        });
      } else {
        const types = typesForLot(lot.id).map((t) => bizType(t).name).join(' ');
        add(lot.center, {
          id: 'lot:' + lot.id, icon: '🏷️', color: '#ff5d73', label: `${def.kind === 'truck' ? 'Posteggio' : 'Locale'} in vendita · ${def.name}`,
          sub: `${zone} · da €${Math.min(...typesForLot(lot.id).map((t) => lotPrice(lot.id, t))).toLocaleString('it-IT')}`,
          kind: 'lot', cat: 'forsale', keywords: `${types} vendita comprare lotto`,
        });
      }
    }
    if (this.run?.target) add(this.run.target, { id: 'target', icon: '🎯', color: '#ff3b5c', label: 'Obiettivo del lavoro', kind: 'target', cat: 'target' });
    else if (!this.run) {
      for (const n of this.npcs.values()) {
        const d = JOBS[n.offer.type];
        add(n.char.root.position, {
          id: 'job:' + n.offer.id, icon: d.icon, color: '#ffc21a', label: d.name, sub: `Lavoretto · €${n.offer.pay} · liv. ${n.offer.level}`,
          kind: 'job', cat: 'jobs', keywords: `lavoro lavoretto ${SKILLS[d.skill].name}`,
        });
      }
    }
    const w = this.waypoint;
    if (w) add(w, { id: 'waypoint', icon: '📍', color: '#ff3b5c', label: `Segnaposto: ${w.label}`, kind: 'waypoint', cat: 'target' });
    return out;
  }

  /** Il segnaposto sparisce quando lo raggiungi (o se il lavoro non c'è più). */
  private updateWaypoint() {
    const w = this.waypoint;
    if (!w) return;
    if (w.id.startsWith('job:') && !this.npcs.has(+w.id.slice(4))) {
      this.waypoint = null;
      return;
    }
    const p = this.player.root.position;
    if (Math.hypot(w.x - p.x, w.z - p.z) < 4) {
      this.waypoint = null;
      toast(`📍 Sei arrivato: ${w.label}`, 'good');
    }
  }

  // ---------------- veicoli ----------------

  get riding(): VehicleId | null {
    return this.state.riding;
  }

  /** Aggancia al personaggio il modello del veicolo in uso (o lo toglie). */
  private applyRide() {
    if (this.rideObj) this.player.root.remove(this.rideObj);
    this.rideObj = null;
    const id = this.state.riding;
    this.player.body.visible = true;
    this.player.body.position.y = 0;
    if (this.playerMarker) this.playerMarker.position.y = 2.05;
    if (!id) {
      this.player.play('idle');
      return;
    }
    this.rideObj = vehicleModel(id);
    this.player.root.add(this.rideObj);
    const pose = riderPose(id);
    this.player.body.position.y = pose.y;
    this.player.body.visible = !pose.hidden;
    this.player.play(pose.anim);
    if (this.playerMarker && pose.hidden) this.playerMarker.position.y = 2.6;
  }

  mount(id: VehicleId) {
    if (!this.state.vehicles.includes(id) || this.interior || this.house) return;
    if (this.run && !this.runOrder && !(this.runOffer && JOBS[this.runOffer.type].vehicleOk)) {
      toast('Per questo lavoro devi stare a piedi', 'bad');
      return;
    }
    this.state.riding = id;
    this.applyRide();
    toast(`${VEHICLES[id].icon} In sella: ${VEHICLES[id].name}`, 'info');
  }

  dismount() {
    if (!this.state.riding) return;
    this.state.riding = null;
    this.applyRide();
  }

  /** Pulsante veicolo: sali sull'ultimo mezzo o scendi. */
  toggleRide() {
    const s = this.state;
    if (s.riding) {
      this.dismount();
      return;
    }
    if (!s.vehicles.length) {
      toast('Non hai veicoli: passa dalla 🛵 concessionaria', 'info');
      return;
    }
    if (s.vehicles.length === 1) this.mount(s.vehicles[0]);
    else this.ui.openGarage();
  }

  // ---------------- casa ----------------

  goHome() {
    if (this.run) {
      toast('Non puoi teletrasportarti durante un lavoro', 'bad');
      return;
    }
    if (this.interior) this.exitTruck();
    const home = this.city.homes[0];
    this.player.root.position.copy(this.frontOf(home, 0.8));
    this.player.root.rotation.y = DIR_ROT[home.dir];
    this.moveTarget = null;
    this.snapCamera();
  }

  sleep() {
    const s = this.state;
    const h = hourOf(s);
    const minutes = ((24 - h + 7) % 24) * 60;
    if (minutes < 60) return;
    advance(s, minutes);
    toast('😴 Hai dormito fino alle 7:00', 'info');
    this.ui.refresh();
  }

  // ---------------- ciclo principale ----------------

  start() {
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private titleAngle = 0.6;
  /** Schermata iniziale: la camera gira lentamente sopra il centro città. */
  private titleFrame(dt: number) {
    this.titleAngle += dt * 0.06;
    const r = 70;
    this.camera.position.set(Math.sin(this.titleAngle) * r, 48, Math.cos(this.titleAngle) * r);
    this.camera.lookAt(0, 0, 0);
    this.sun.target.position.set(0, 0, 0);
    this.sun.position.set(-14, 30, 12);
    this.updateLighting(11);
    if (!this.renderPaused) this.renderer.render(this.scene, this.camera);
  }

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.mode === 'title') {
      this.titleFrame(dt);
      return;
    }
    const s = this.state;

    // il tempo del gioco scorre sempre (è un idle), anche con i pannelli aperti
    advance(s, dt * TIME.GAME_MIN_PER_SEC);

    if (!this.paused) {
      if (this.interior) {
        this.interior.update(dt);
      } else if (this.house) {
        this.house.update(dt);
      } else {
        this.updatePlayer(dt);
        this.updateWaypoint();
        this.updateJobs(dt);
        this.updateInteract();
        this.updateCamera(dt);
      }
    } else {
      this.input.consumeTap();
    }
    for (const n of this.npcs.values()) {
      n.char.update(dt);
      n.marker.position.y = 2.1 + Math.sin(performance.now() / 300) * 0.08;
    }
    this.player.update(dt);
    this.updateLighting();

    this.saveTimer += dt;
    if (this.saveTimer > 10) this.save();

    this.ui.update(dt);
    if (this.renderPaused) return;
    if (this.interior) this.renderer.render(this.interior.scene, this.interior.camera);
    else if (this.house) this.renderer.render(this.house.scene, this.house.camera);
    else this.renderer.render(this.scene, this.camera);
  }

  private updatePlayer(dt: number) {
    const v = this.input.vector;
    const tap = this.input.consumeTap();
    if (tap) this.handleTap(tap.x, tap.y);
    const p = this.player.root.position;
    let mx = v.x;
    let mz = v.y;
    if (Math.hypot(mx, mz) > 0.05) {
      this.moveTarget = null;
    } else if (this.moveTarget) {
      const dx = this.moveTarget.x - p.x;
      const dz = this.moveTarget.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25) this.moveTarget = null;
      else {
        mx = dx / d;
        mz = dz / d;
      }
    }
    const len = Math.hypot(mx, mz);
    if (len > 0.05) {
      const ride = this.state.riding ? VEHICLES[this.state.riding] : null;
      const speed = (ride ? ride.speed : WALK_SPEED) * Math.min(1, len);
      const before = p.clone();
      p.x += mx * speed * dt;
      p.z += mz * speed * dt;
      this.city.collide(p, ride ? ride.radius : 0.38);
      // bloccato contro un muro mentre va verso un punto: rinuncia
      if (this.moveTarget && before.distanceTo(p) < speed * dt * 0.2) this.moveTarget = null;
      this.player.faceTowards(p.x + mx, p.z + mz, dt, ride?.kind === 'car' ? 7 : 12);
      if (ride) this.player.play(riderPose(this.state.riding!).anim);
      else if (!this.prompt?.progress) this.player.play(len > 0.6 ? 'sprint' : 'walk', 0.15, len > 0.6 ? 0.85 : 1);
    } else if (this.player.currentName === 'walk' || this.player.currentName === 'sprint') {
      this.player.play('idle');
    }
    this.state.player.x = p.x;
    this.state.player.z = p.z;
  }

  private handleTap(x: number, y: number) {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      this.moveTarget = hit;
      const r = ring(0xffffff, 0.5);
      r.position.set(hit.x, 0.06, hit.z);
      this.scene.add(r);
      setTimeout(() => this.scene.remove(r), 400);
    }
  }

  private updateJobs(dt: number) {
    const s = this.state;
    if (this.run) {
      this.run.update(dt);
      return;
    }
    this.nextJobSpawn -= dt;
    if (this.nextJobSpawn <= 0 && s.jobs.length < JOB.MAX_ACTIVE) {
      this.spawnOffer();
      this.nextJobSpawn = rand(JOB.RESPAWN_MIN_SEC, JOB.RESPAWN_MAX_SEC);
    }
    // gli NPC guardano il giocatore quando è vicino
    for (const n of this.npcs.values()) {
      const d = n.char.root.position.distanceTo(this.player.root.position);
      if (d < 6) n.char.faceTowards(this.player.root.position.x, this.player.root.position.z, dt, 4);
    }
  }

  private updateInteract() {
    if (this.run) {
      this.ui.setAction(this.prompt);
      if (this.prompt && this.input.consumeAction()) this.run.onAction?.();
      return;
    }
    const p = this.player.root.position;
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const i of this.interactables) {
      if (i.enabled && !i.enabled()) continue;
      const d = Math.hypot(i.pos.x - p.x, i.pos.z - p.z);
      if (d < i.radius && d < bd) {
        best = i;
        bd = d;
      }
    }
    this.ui.setAction(best ? { label: best.label, icon: best.icon } : null);
    if (best && this.input.consumeAction()) {
      this.moveTarget = null;
      best.action();
    }
  }

  private camDist() {
    return (this.camera.aspect < 1 ? 33 : 25) * CAMERA_MULT[settings.camera];
  }

  private camTarget = new THREE.Vector3();
  private updateCamera(dt: number) {
    const p = this.player.root.position;
    this.camTarget.lerp(p, Math.min(1, dt * 6));
    this.placeCamera();
  }

  snapCamera() {
    this.camTarget.copy(this.player.root.position);
    this.placeCamera();
  }

  private placeCamera() {
    const pitch = THREE.MathUtils.degToRad(58);
    const d = this.camDist();
    const t = this.camTarget;
    this.camera.position.set(t.x, t.y + Math.sin(pitch) * d, t.z + Math.cos(pitch) * d);
    this.camera.lookAt(t.x, t.y + 0.6, t.z);
    // ombre solo attorno al giocatore
    this.sun.target.position.copy(t);
    this.sun.position.copy(t).add(new THREE.Vector3(-14, 30, 12));
  }

  private updateLighting(fixedHour?: number) {
    const h = fixedHour ?? hourOf(this.state);
    // luce del giorno: piena 8-18, tramonto, notte blu
    const dayF = THREE.MathUtils.clamp(1 - Math.abs(h - 13) / 8.5, 0, 1);
    const k = THREE.MathUtils.smoothstep(dayF, 0, 0.35);
    this.sun.intensity = 0.35 + 1.9 * k;
    this.hemi.intensity = 0.6 + 0.7 * k;
    const sky = new THREE.Color(0x1b2745).lerp(new THREE.Color(0x9fd3f0), k);
    if (h > 17 && h < 20.5) sky.lerp(new THREE.Color(0xf29a5c), 0.35 * (1 - Math.abs(h - 18.7) / 1.8));
    (this.scene.background as THREE.Color).copy(sky);
    this.scene.fog!.color.copy(sky);
  }

  resetting = false;
  save() {
    this.saveTimer = 0;
    if (this.resetting || this.mode !== 'play') return;
    saveState(this.state);
  }

  private hiddenAt = 0;
  private onVisibility() {
    if (this.mode !== 'play') return;
    if (document.hidden) {
      this.save();
      this.hiddenAt = Date.now();
      this.input.cancel();
    } else if (this.hiddenAt) {
      const rep = applyOffline(this.state, Date.now() - this.hiddenAt);
      this.hiddenAt = 0;
      this.clock.getDelta();
      if (rep) this.ui.openOffline(rep);
    }
  }
}
