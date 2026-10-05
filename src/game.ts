import * as THREE from 'three';
import { fetchFriends, ping as pingOnline, submit as submitScore, type FriendEntry } from './sim/leaderboard';
import { logoPlate, logoSprite, type Logo } from './logo';
import { model, preload } from './assets';
import { BUSINESS, JOB, TIME } from './config/balance';
import { JOBS, JOB_TYPES, type JobType } from './config/jobs';
import { LOTS } from './config/map';
import { PRODUCTS, type ProductId } from './config/products';
import { Input } from './input';
import { CAMERA_MULT, onSettings, QUALITY_PIXEL_RATIO, settings } from './settings';
import { ensureWeather } from './sim/effects';
import { bus, toast } from './sim/bus';
import { advance, applyOffline, genMissions, missionProgress, RENT_PER_HOUR, updateEvents, type OfflineReport } from './sim/calendar';
import { bizAtLot, CHAR_MODELS, isOpenHour, lotZone, refreshCandidates } from './sim/economy';
import { addFame, addMoney, addXp, skillLevel } from './sim/progress';
import {
  day, hourOf, loadState, newState, pick, rand, saveState, setCurrentSlot,
  type GameState, type JobOffer,
} from './sim/state';
import { Character, charPath } from './world/character';
import { BUILDING_MODELS, City, CITY_ASSETS, DIR_ROT, DIR_VEC, TREE_MODELS, type Slot } from './world/city';
import { StreetLights, WindowLights } from './world/night';
import { Traffic, TRAFFIC_ASSETS } from './world/traffic';
import { buildLandscape, Clouds, Sky } from './world/scenery';
import { OutlineRenderer } from './render/outline';
import { Particles } from './world/particles';
import { ViewControl } from './world/viewcam';
import { GuideLine } from './world/guideline';
import { Occluder } from './world/occlusion';
import { board, exclamation, label, playerDot, ring, saleSign } from './world/props';
import { TruckInterior, INTERIOR_ASSETS } from './world/interior';
import { carWashJob, dishJob, gardenJob, paintJob, routeJob, VisitRun, type JobRun } from './minigames/jobs';
import { ClientHouse, HOUSE_ASSETS } from './world/clienthouse';
import { BUSINESS_TYPES, bizType, type BusinessType } from './config/business';
import { VEHICLES, WALK_SPEED, type VehicleId } from './config/vehicles';
import { riderPose, vehicleModel, VEHICLE_ASSETS } from './world/vehicle';
import { applyAccessories } from './world/style';
import { JobTutorial } from './ui/jobtutorial';
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
  /** furgoni e piani degli amici sullo stesso posto */
  extra: Interactable[];
  built: boolean;
  /** era aperto quando è stato disegnato */
  open: boolean;
}

/** Attività di un amico su un posto della tua città. */
export interface FriendBiz {
  friend: FriendEntry;
  type: BusinessType;
  lvl: number;
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
  /** rotazione, zoom e inclinazione della camera scelti dal giocatore */
  view = new ViewControl();
  private outline!: OutlineRenderer;
  private sky = new Sky();
  private clouds = new Clouds(260);
  /** particelle del mondo aperto (foglie, bolle, scintille…) */
  fx = new Particles();
  /** linea tratteggiata verso l'obiettivo (lavoretti, ordini, segnaposto) */
  private guide = new GuideLine();
  /** oggetti fra camera e giocatore/obiettivo → trasparenti */
  private occluder = new Occluder();
  private occT = 0;
  private windows!: WindowLights;
  private lamps!: StreetLights;
  private traffic!: Traffic;
  private night = 0;
  /** direzione da cui arriva la luce del sole (cambia con l'ora) */
  private sunDir = new THREE.Vector3(-14, 30, 12).normalize();
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
    for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const)
      window.addEventListener(ev, () => (this.lastInput = performance.now()), { passive: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // colori più naturali: luci forti che non "bruciano" e ombre più ricche
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.outline = new OutlineRenderer(this.renderer);
    this.input = new Input(canvas);
    this.tutorial = new JobTutorial(this);

    this.scene.background = new THREE.Color(0x9fd3f0);
    this.scene.fog = new THREE.Fog(0x9fd3f0, 90, 290);
    this.scene.add(this.sky.mesh, this.clouds.group, this.fx.group, this.guide.mesh);
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
    // con il risparmio batteria meno pixel da disegnare (massimo 1,1)
    this.renderer.setPixelRatio(Math.min(dpr, QUALITY_PIXEL_RATIO[settings.quality], settings.battery ? 1.1 : 9));
    this.sun.castShadow = settings.shadows;
    this.sun.shadow.mapSize.setScalar(settings.quality === 'alta' ? 2048 : settings.quality === 'media' ? 1024 : 512);
    this.renderer.shadowMap.type = settings.quality === 'bassa' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.resize();
  }

  async init(onProgress: (f: number) => void) {
    const chars = [PLAYER_MODEL, ...CHAR_MODELS].map(charPath);
    const assets = [
      ...CITY_ASSETS, ...INTERIOR_ASSETS, ...HOUSE_ASSETS, ...chars, 'cars/van.glb', 'cars/delivery.glb', ...VEHICLE_ASSETS, ...TRAFFIC_ASSETS,
      'commercial/detail-awning-wide.glb', ...Object.values(PRODUCTS).flatMap((p) => (p.model ? [p.model] : [])),
      'furniture/cardboardBoxClosed.glb',
    ];
    await preload([...new Set(assets)], onProgress);

    this.city = new City();
    this.scene.add(this.city.group);
    this.scene.add(buildLandscape(this.city.halfW, TREE_MODELS));
    this.windows = new WindowLights(BUILDING_MODELS);
    this.lamps = new StreetLights(this.city.lampHeads);
    this.scene.add(this.lamps.group);
    this.traffic = new Traffic(this.city, 28, 18, CHAR_MODELS);
    this.scene.add(this.traffic.group);
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
    this.refreshHomes();
    void this.refreshFriends();
    // le attività degli amici (e chi sta giocando) si aggiornano ogni 2 minuti;
    // ogni minuto si dice al server che stai giocando
    setInterval(() => void this.refreshFriends(), 2 * 60_000);
    void pingOnline();
    setInterval(() => void pingOnline(), 60_000);
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

    // casa del giocatore (e case comprate all'agenzia immobiliare)
    this.refreshHomes();

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
    const home = this.homeSlot;

    // giocatore (stile e accessori scelti nel Negozio)
    this.player = new Character(this.state.style.model || PLAYER_MODEL);
    applyAccessories(this.player, this.state.style.acc);
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

  /** Cambia stile o accessori: il personaggio si rifà nello stesso punto. */
  applyStyle() {
    if (!this.player) return;
    const old = this.player;
    const inScene = old.root.parent;
    const next = new Character(this.state.style.model || PLAYER_MODEL);
    applyAccessories(next, this.state.style.acc);
    next.root.position.copy(old.root.position);
    next.root.rotation.y = old.root.rotation.y;
    if (this.playerMarker) {
      old.root.remove(this.playerMarker);
      next.root.add(this.playerMarker);
    }
    inScene?.remove(old.root);
    inScene?.add(next.root);
    this.player = next;
    this.applyRide();
  }

  // ---------------- case ----------------

  /** Case in vendita all'agenzia immobiliare (sempre le stesse: dipendono dalla mappa). */
  private houseCache: Slot[] | null = null;
  get houseSlots(): Slot[] {
    if (!this.houseCache) {
      const all = [...this.city.homes.slice(1), ...this.city.gardens].filter((h) => h.dir !== 'N');
      const seen = new Set<string>();
      this.houseCache = all.filter((h) => {
        const k = `${Math.round(h.pos.x)},${Math.round(h.pos.z)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).slice(0, 10);
    }
    return this.houseCache;
  }

  /** Prezzo di una casa: dipende dalla zona (in centro costa di più). */
  housePrice(i: number) {
    const h = this.houseSlots[i];
    const base = { periferia: 9000, residenziale: 15000, centro: 26000 }[h.zone];
    return Math.round((base * (0.9 + ((i * 37) % 10) / 25)) / 100) * 100;
  }

  /** Affitto all'ora (mentre il gioco è chiuso) di una casa data in affitto. */
  houseRent(i: number) {
    return Math.round(this.housePrice(i) * RENT_PER_HOUR);
  }

  /** La casa dove vivi (il pulsante Casa ti porta qui, e qui dormi). */
  get homeSlot(): Slot {
    const i = this.state?.homeIdx ?? -1;
    return i >= 0 ? this.houseSlots[i] ?? this.city.homes[0] : this.city.homes[0];
  }

  private homeObjs: THREE.Object3D[] = [];
  private homeInter: Interactable | null = null;
  /** Cartelli sopra le case: "Casa tua", "Tua (in affitto)". */
  refreshHomes() {
    for (const o of this.homeObjs) this.scene.remove(o);
    this.homeObjs = [];
    if (this.homeInter) this.removeInteractable(this.homeInter);
    const home = this.homeSlot;
    const tag = label('🏠 Casa tua', { bg: '#35c46a', scale: 0.5 });
    tag.position.set(home.pos.x, 3.2, home.pos.z);
    this.scene.add(tag);
    this.homeObjs.push(tag);
    this.homeInter = this.addInteractable({ pos: home.pos, radius: 1.8, label: 'Casa', icon: '🏠', action: () => this.ui.openHome() });
    for (const h of this.state?.houses ?? []) {
      if (h.i === this.state.homeIdx) continue;
      const sl = this.houseSlots[h.i];
      if (!sl) continue;
      const t = label(h.rent ? '🔑 Tua · in affitto' : '🏡 Tua', { bg: '#8e5bd6', scale: 0.42 });
      t.position.set(sl.pos.x, 3.2, sl.pos.z);
      this.scene.add(t);
      this.homeObjs.push(t);
    }
    // la vecchia casa di partenza resta tua (e resta un posto dove dormire)
    if ((this.state?.homeIdx ?? -1) >= 0) {
      const h0 = this.city.homes[0];
      const t = label('🏡 Casa di prima', { bg: '#8e5bd6', scale: 0.42 });
      t.position.set(h0.pos.x, 3.2, h0.pos.z);
      this.scene.add(t);
      this.homeObjs.push(t);
    }
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

  // ---------------- amici ----------------

  /** amici (te compreso) dall'ultima classifica tra amici */
  friends: FriendEntry[] = [];
  /** attività degli amici per lotto, dalla fama più alta alla più bassa */
  friendBiz = new Map<string, FriendBiz[]>();

  /**
   * Scarica amici, loghi, attività e chi sta giocando. Sullo stesso posto possono stare
   * la tua attività e quelle degli amici: più furgoni affiancati, o un piano per amico sugli edifici.
   */
  async refreshFriends() {
    const d = await fetchFriends();
    if (!d) return;
    this.friends = d.entries;
    const next = new Map<string, FriendBiz[]>();
    for (const f of d.entries) {
      if (f.me) continue;
      for (const b of f.bizs) {
        if (!this.city.lots.some((l) => l.id === b.lot) || !(b.type in BUSINESS_TYPES)) continue;
        if (!typesForLot(b.lot).includes(b.type as BusinessType)) continue;
        const list = next.get(b.lot) ?? [];
        list.push({ friend: f, type: b.type as BusinessType, lvl: b.lvl });
        next.set(b.lot, list);
      }
    }
    for (const list of next.values()) list.sort((a, b) => b.friend.fame - a.friend.fame);
    // si ridisegnano solo i posti che cambiano (amici nuovi, tolti, o che entrano/escono dal gioco)
    const key = (l?: FriendBiz[]) => (l ?? []).map((x) => `${x.friend.code}${x.type}${x.friend.online ? 1 : 0}${JSON.stringify(x.friend.logo)}`).join();
    const changed = [...new Set([...this.friendBiz.keys(), ...next.keys()])].filter((id) => key(this.friendBiz.get(id)) !== key(next.get(id)));
    this.friendBiz = next;
    for (const id of changed) this.setupLot(id);
    this.ui?.refresh();
  }

  /** Altezza del tetto dell'edificio di un locale (per aggiungere i piani degli amici). */
  private roofTop(slot: Slot) {
    const ray = new THREE.Raycaster(new THREE.Vector3(slot.center.x, 80, slot.center.z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(this.city.group.children, true).find((h) => (h.object as THREE.Mesh).isMesh && h.point.y > 1.5);
    return hit ? hit.point.y : 6;
  }

  /** Impronta dell'edificio di un locale (dai muri per le collisioni). */
  private footprint(slot: Slot) {
    const area = (c: { minX: number; maxX: number; minZ: number; maxZ: number }) => (c.maxX - c.minX) * (c.maxZ - c.minZ);
    const b = this.city.colliders
      .filter((c) => slot.center.x > c.minX - 0.5 && slot.center.x < c.maxX + 0.5 && slot.center.z > c.minZ - 0.5 && slot.center.z < c.maxZ + 0.5)
      .sort((a, c) => area(c) - area(a))[0];
    return b ??{ minX: slot.center.x - 2.5, maxX: slot.center.x + 2.5, minZ: slot.center.z - 2.5, maxZ: slot.center.z + 2.5 };
  }

  /**
   * Un furgone con il logo stampato sul fianco verso la strada. Aperto = tendone e bancone;
   * chiuso = serranda abbassata. Sopra: logo e nome.
   */
  private buildVan(slot: Slot, logo: Logo | null, title: string, open: boolean, color: string) {
    const g = new THREE.Group();
    const van = model('cars/van.glb', 1.55);
    van.rotation.y = DIR_ROT[slot.dir] - Math.PI / 2;
    g.add(van);
    const box = new THREE.Box3().setFromObject(van);
    const [dx, , dz] = this.dirVec(slot, 1);
    const reach = dx > 0 ? box.max.x : dx < 0 ? -box.min.x : dz > 0 ? box.max.z : -box.min.z;
    const side = new THREE.Group();
    side.rotation.y = DIR_ROT[slot.dir];
    g.add(side);
    if (open) {
      const awn = model('commercial/detail-awning-wide.glb', 4.2);
      awn.position.z = 0.75;
      awn.position.y = 0.3;
      side.add(awn);
    } else {
      // serranda abbassata sul lato di servizio
      const sh = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 0.05), new THREE.MeshLambertMaterial({ color: 0x8a94a6 }));
      sh.position.set(0, box.max.y * 0.62, reach + 0.03);
      side.add(sh);
    }
    // marchio sul fianco, ben visibile dalla strada
    if (logo) {
      const plate = logoPlate(logo, 0.95);
      plate.position.set(open ? -0.75 : 0.9, box.max.y * 0.5, reach + 0.05);
      side.add(plate);
      // e grande sul tetto: dalla camera dall'alto è la prima cosa che si vede
      const roof = logoPlate(logo, 1.35);
      roof.rotation.x = -Math.PI / 2;
      roof.position.set(0, box.max.y + 0.02, 0);
      side.add(roof);
      const lg = logoSprite(logo, 1.15);
      lg.position.y = box.max.y + 1.55;
      g.add(lg);
    }
    const sign = label(title, { bg: color, scale: 0.5 });
    sign.position.y = box.max.y + 0.75;
    g.add(sign);
    return g;
  }

  /** Piano in più sopra un edificio per l'attività di un amico: luci accese se sta giocando. */
  private buildFloor(slot: Slot, f: FriendBiz, y: number, h: number) {
    const fp = this.footprint(slot);
    const w = fp.maxX - fp.minX - 0.3;
    const d = fp.maxZ - fp.minZ - 0.3;
    const cx = (fp.minX + fp.maxX) / 2 - slot.center.x;
    const cz = (fp.minZ + fp.maxZ) / 2 - slot.center.z;
    const g = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.02, d), new THREE.MeshLambertMaterial({ color: 0xf1ede4 }));
    wall.position.set(cx, y + h / 2, cz);
    wall.castShadow = true;
    g.add(wall);
    // fascia col colore del logo in cima al piano
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.14, d + 0.08), new THREE.MeshLambertMaterial({ color: new THREE.Color(f.friend.logo?.bg ?? '#5b4bb7') }));
    band.position.set(cx, y + h - 0.06, cz);
    // il tetto del piano un filo più in alto della fascia (niente sfarfallio)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.06, d - 0.1), new THREE.MeshLambertMaterial({ color: 0xcfc8b8 }));
    roof.position.set(cx, y + h + 0.03, cz);
    g.add(roof);
    g.add(band);
    // finestre sul fronte: accese (gialle) se l'amico sta giocando, spente altrimenti
    const [dx, , dz] = this.dirVec(slot, 1);
    const half = dx !== 0 ? w / 2 : d / 2;
    const along = dx !== 0 ? d : w;
    const lit = !!f.friend.online;
    const winMat = new THREE.MeshBasicMaterial({ color: lit ? 0xffd966 : 0x33415a, toneMapped: !lit });
    const face = new THREE.Group();
    face.position.set(cx + dx * (half + 0.03), y, cz + dz * (half + 0.03));
    face.rotation.y = DIR_ROT[slot.dir];
    g.add(face);
    const n = Math.max(2, Math.floor(along / 1.1));
    for (let i = 0; i < n; i++) {
      const x = -along / 2 + (i + 0.5) * (along / n);
      if (Math.abs(x) < 0.7) continue; // al centro c'è il logo
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.55, h * 0.45), winMat);
      win.position.set(x, h * 0.5, 0);
      face.add(win);
    }
    if (f.friend.logo) {
      const plate = logoPlate(f.friend.logo, Math.min(0.95, h * 0.85));
      plate.position.set(0, h * 0.48, 0.01);
      face.add(plate);
    }
    const tag = label(`${lit ? '💡' : '💤'} ${f.friend.nickname}`, { bg: '#5b4bb7', scale: 0.42 });
    tag.position.set(cx + dx * (half + 0.4), y + h * 0.5, cz + dz * (half + 0.4));
    g.add(tag);
    return g;
  }

  // ---------------- lotti e food truck ----------------

  setupLot(lotId: string) {
    const old = this.trucks.get(lotId);
    if (old) {
      this.scene.remove(old.group);
      this.removeInteractable(old.inter);
      for (const x of old.extra) this.removeInteractable(x);
    }
    const slot = this.city.lots.find((l) => l.id === lotId)!;
    const lot = LOTS.find((l) => l.id === lotId)!;
    const biz = bizAtLot(this.state, lotId);
    const g = new THREE.Group();
    g.position.copy(slot.center);
    this.scene.add(g);
    let inter: Interactable;
    const extra: Interactable[] = [];
    const [dx, , dz] = this.dirVec(slot, 1);
    // collisioni dei furgoni di questo posto (si rifanno qui sotto)
    this.city.colliders = this.city.colliders.filter((c) => (c as { lot?: string }).lot !== lotId);
    // attività degli amici sullo stesso posto
    const friends = this.friendBiz.get(lotId) ?? [];
    if (slot.kind === 'truck' && friends.length) {
      // furgoni affiancati lungo la strada: il tuo al centro, poi quelli degli amici con più fama
      // ben separati: tra un furgone e l'altro resta un passaggio
      const offsets = biz ? [5.6, -5.6] : [0, 5.6, -5.6];
      friends.slice(0, offsets.length).forEach((f, i) => {
        const def = bizType(f.type);
        const van = this.buildVan(slot, f.friend.logo ?? null, `${f.friend.online ? '🟢' : '💤'} ${f.friend.nickname}`, !!f.friend.online, '#5b4bb7');
        van.position.set(dz * offsets[i], 0, -dx * offsets[i]);
        g.add(van);
        const vx = slot.center.x + dz * offsets[i];
        const vz = slot.center.z - dx * offsets[i];
        const hw = dx !== 0 ? 1.3 : 2.3;
        const hd = dz !== 0 ? 1.3 : 2.3;
        this.city.colliders.push(Object.assign({ minX: vx - hw, maxX: vx + hw, minZ: vz - hd, maxZ: vz + hd }, { lot: lotId }));
        extra.push(this.addInteractable({
          pos: slot.center.clone().add(new THREE.Vector3(dx * 2.3 + dz * offsets[i], 0, dz * 2.3 - dx * offsets[i])), radius: 1.8,
          label: `${def.name} di ${f.friend.nickname}${f.friend.online ? '' : ' (chiuso)'}`, icon: '🤝',
          action: () => this.ui.openFriendBiz(lotId, f.friend.code),
        }));
      });
    } else if (slot.kind === 'shop' && friends.length) {
      // un piano per amico sopra l'edificio: più in alto chi ha più fama
      const top = this.roofTop(slot);
      const h = 1.25;
      [...friends.slice(0, 3)].reverse().forEach((f, i) => {
        g.add(this.buildFloor(slot, f, top + i * h - 0.05, h));
        extra.push(this.addInteractable({
          pos: slot.pos.clone().add(new THREE.Vector3(dz * (1.6 + i * 0.9), 0, -dx * (1.6 + i * 0.9))), radius: 1.2,
          label: `Piano ${i + 1}: ${bizType(f.type).name} di ${f.friend.nickname}`, icon: '🤝',
          action: () => this.ui.openFriendBiz(lotId, f.friend.code),
        }));
      });
    }
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
      // il tuo furgone: lato di servizio verso la strada, aperto solo in orario
      const icons = biz.products.map((p) => PRODUCTS[p].icon).join(' ');
      g.add(this.buildVan(slot, this.state.logo, `🚚 ${icons}`, isOpenHour(this.state), '#e8590c'));
      // collisione del furgone (lungo il lato perpendicolare alla strada)
      const hw = dx !== 0 ? 1.3 : 2.3;
      const hd = dz !== 0 ? 1.3 : 2.3;
      this.city.colliders.push(Object.assign({ minX: slot.center.x - hw, maxX: slot.center.x + hw, minZ: slot.center.z - hd, maxZ: slot.center.z + hd }, { lot: lotId }));
      const game = this;
      inter = this.addInteractable({
        pos: slot.center.clone().add(new THREE.Vector3(dx * 2.3, 0, dz * 2.3)), radius: 2,
        // da chiuso la porta resta chiusa: si torna dopo aver dormito
        get label() {
          return isOpenHour(game.state) ? 'Entra nel food truck' : `Chiuso · apre alle ${BUSINESS.OPEN_HOUR}:00`;
        },
        get icon() {
          return isOpenHour(game.state) ? '🚪' : '🔒';
        },
        action: () => this.enterBusiness(lotId),
      });
    } else {
      // negozio in un edificio: insegna colorata sopra l'ingresso
      const def = bizType(biz.type);
      const icons = biz.products.map((p) => PRODUCTS[p].icon).join('');
      const sign = label(`${def.icon} ${def.name} ${icons}`, { bg: def.color, scale: 0.6 });
      sign.position.set(dx * 2.2, 4.2, dz * 2.2);
      g.add(sign);
      // logo sospeso sopra l'insegna (se sopra ci sono i piani degli amici basta quello sulla facciata)
      if (!friends.length) {
        const lg = logoSprite(this.state.logo, 1.3);
        lg.position.set(dx * 2.2, 5.3, dz * 2.2);
        g.add(lg);
      }
      // marchio sulla facciata, sopra l'ingresso
      const fp = this.footprint(slot);
      const reach = dx > 0 ? fp.maxX - slot.center.x : dx < 0 ? slot.center.x - fp.minX : dz > 0 ? fp.maxZ - slot.center.z : slot.center.z - fp.minZ;
      const plate = logoPlate(this.state.logo, 1.3);
      plate.position.set(dx * (reach + 0.06), 3.25, dz * (reach + 0.06));
      plate.rotation.y = DIR_ROT[slot.dir];
      g.add(plate);
      const mat = ring(new THREE.Color(def.color).getHex(), 1.1);
      mat.position.set(dx * 2.8, 0.05, dz * 2.8);
      g.add(mat);
      const service = def.kind === 'service';
      const game = this;
      inter = this.addInteractable({
        pos: slot.pos, radius: 2.2,
        // l'ufficio delle imprese di servizi è sempre raggiungibile; i locali solo da aperti
        get label() {
          if (service) return `Ufficio ${def.name.toLowerCase()}`;
          return isOpenHour(game.state) ? `Entra: ${def.name}` : `Chiuso · apre alle ${BUSINESS.OPEN_HOUR}:00`;
        },
        get icon() {
          return service ? '📋' : isOpenHour(game.state) ? '🚪' : '🔒';
        },
        action: () => (service ? this.ui.openBusiness(biz.id, 'ordini') : this.enterBusiness(lotId)),
      });
    }
    this.trucks.set(lotId, { lotId, slot, group: g, inter, extra, built: !!biz, open: isOpenHour(this.state) });
  }

  /** All'apertura e alla chiusura i tuoi furgoni alzano o abbassano la serranda. */
  private updateLotsOpen() {
    const open = isOpenHour(this.state);
    for (const t of this.trucks.values()) if (t.built && t.open !== open && LOTS.find((l) => l.id === t.lotId)?.kind === 'truck') this.setupLot(t.lotId);
  }

  enterBusiness(lotId: string) {
    const biz = bizAtLot(this.state, lotId);
    if (!biz || this.run) {
      if (this.run) toast('Finisci prima il lavoro in corso', 'bad');
      return;
    }
    if (!isOpenHour(this.state)) {
      const h = hourOf(this.state);
      toast(h >= 19 || h < 6
        ? `🔒 Chiuso: apre alle ${BUSINESS.OPEN_HOUR}:00. Vai a dormire a casa 🏠 e torna domattina`
        : `🔒 Chiuso: apre alle ${BUSINESS.OPEN_HOUR}:00`, 'bad');
      return;
    }
    this.dismount();
    this.scene.remove(this.player.root);
    this.view.reset();
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
    this.view.reset();
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

  /** tutorial contestuale dei lavoretti */
  tutorial!: JobTutorial;

  startJob(offer: JobOffer, tutorial = false) {
    if (this.run) return;
    // il cliente si fa da parte: la zona di lavoro resta libera
    const npc = this.npcs.get(offer.id);
    if (npc) npc.char.root.visible = false;
    this.runOffer = offer;
    const slot = this.slotsFor(offer.type)[offer.slot];
    const def = JOBS[offer.type];
    if (!def.vehicleOk) this.dismount();
    const title = `${def.icon} ${def.name}`;
    const lv = offer.level;
    switch (offer.type) {
      case 'giardino': this.run = gardenJob(this, lv, slot, title); break;
      case 'consegna': this.run = routeJob(this, lv, slot, title, 'package'); break;
      case 'volantini': this.run = routeJob(this, lv, slot, title, 'flyer'); break;
      case 'piatti': this.run = dishJob(this, lv, slot, title); break;
      case 'lavaggio': this.run = carWashJob(this, lv, slot, title); break;
      case 'imbianchino': this.run = paintJob(this, lv, slot, title); break;
    }
    if (tutorial && this.run) this.tutorial.start(offer.type, this.run);
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
    this.view.reset();
    this.house = new ClientHouse(this, pid, level, {
      status: (left, total, text) => {
        run.timeLeft = left;
        run.timeTotal = total;
        run.status = text;
      },
      done: (stars) => this.finishJob(stars),
    }, this.state.businesses.find((b) => b.id === this.runOrder?.bizId)?.staff ?? []);
    this.house.enter(this.player);
    run.target = undefined;
  }

  private exitHouse() {
    if (!this.house) return;
    this.house.exit();
    this.house = null;
    this.view.reset();
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
    // col tutorial il lavoretto non è pagato (si guadagna solo esperienza)
    const tutorial = this.tutorial.active;
    this.tutorial.finish(stars);
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
      this.fx.emit('spark', this.player.root.position.clone().setY(1.2), 14);
      pay = tutorial ? 0 : Math.round(offer.pay * JOB.STAR_PAY[stars]);
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
    add(this.homeSlot.pos, { id: 'home', icon: '🏠', color: '#2fb36b', label: 'Casa tua', kind: 'home', cat: 'places', keywords: 'dormire teletrasporto' });
    add(this.city.dealer.pos, { id: 'dealer', icon: '🛵', color: '#2d9cdb', label: 'Concessionaria', kind: 'dealer', cat: 'places', keywords: 'veicoli auto scooter monopattino macchina' });
    add(this.city.agency.pos, { id: 'agency', icon: '🏢', color: '#8e5bd6', label: 'Agenzia affari', kind: 'agency', cat: 'places', keywords: 'comprare attività lotti resoconti' });
    for (const lot of this.city.lots) {
      const def = LOTS.find((l) => l.id === lot.id)!;
      const biz = bizAtLot(this.state, lot.id);
      const zone = ZONES[lot.zone].name;
      const fr = this.friendBiz.get(lot.id) ?? [];
      const names = fr.map((x) => x.friend.nickname).join(', ');
      if (biz) {
        const bt = bizType(biz.type);
        const prods = biz.products.map((x) => PRODUCTS[x].name).join(' ');
        add(lot.center, {
          id: 'lot:' + lot.id, icon: bt.icon, color: bt.color, label: `${bt.name} · ${def.name}`, sub: `La tua attività · ${zone}${fr.length ? ` · con ${names}` : ''}`,
          kind: 'biz', cat: 'mine', keywords: `${prods} mia mie ${names}`,
        });
      } else if (fr.length) {
        const bt = bizType(fr[0].type);
        add(lot.center, {
          id: 'lot:' + lot.id, icon: '🤝', color: '#5b4bb7', label: fr.length > 1 ? `Attività di ${names}` : `${bt.name} di ${names}`, sub: `Amici · ${zone} · il posto è libero per te`,
          kind: 'lot', cat: 'forsale', keywords: `amico amici ${names} ${bt.name}`,
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
    this.state.lastRide = id;
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
    // sale subito sull'ultimo veicolo usato (niente finestra: il joystick non si ferma);
    // gli altri veicoli si scelgono dalla concessionaria
    const id = s.lastRide && s.vehicles.includes(s.lastRide) ? s.lastRide : s.vehicles[s.vehicles.length - 1];
    this.mount(id);
  }

  // ---------------- casa ----------------

  goHome() {
    if (this.run) {
      toast('Non puoi teletrasportarti durante un lavoro', 'bad');
      return;
    }
    if (this.interior) this.exitTruck();
    const home = this.homeSlot;
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
    this.sun.position.copy(this.sunDir).multiplyScalar(36);
    this.updateLighting(11);
    this.clouds.update(dt);
    this.traffic.update(dt, new THREE.Vector3(9999, 0, 9999), this.night);
    if (!this.renderPaused) this.draw(this.scene, this.camera);
  }

  /** ultimo tocco/tasto: da fermi, col risparmio batteria, si disegna ancora meno spesso */
  private lastInput = performance.now();
  private lastFrame = 0;

  private frame() {
    // mai più di 60 immagini al secondo (gli schermi a 120 Hz scalderebbero troppo il telefono);
    // col risparmio batteria 30, e 15 dopo 5 secondi senza toccare lo schermo
    const now = performance.now();
    const fps = settings.battery ? (now - this.lastInput > 5000 ? 15 : 30) : 60;
    if (now - this.lastFrame < 1000 / fps - 2) return;
    this.lastFrame = now;
    const dt = Math.min(settings.battery ? 0.1 : 0.05, this.clock.getDelta());
    if (this.mode === 'title') {
      this.titleFrame(dt);
      return;
    }
    const s = this.state;

    // il tempo del gioco scorre sempre (è un idle), anche con i pannelli aperti
    advance(s, dt * TIME.GAME_MIN_PER_SEC);
    this.view.update(dt);

    if (!this.paused) {
      if (this.interior) {
        this.interior.update(dt);
      } else if (this.house) {
        this.house.update(dt);
      } else {
        this.updatePlayer(dt);
        this.updateWaypoint();
        this.updateJobs(dt);
        const goal = this.run?.target ?? (this.waypoint ? new THREE.Vector3(this.waypoint.x, 0, this.waypoint.z) : null);
        this.guide.update(dt, this.player.root.position, goal, this.run ? 1 : 3, this.firstPerson ? 1.6 : 0.45);
        this.updateInteract();
        const fp = this.wantFirstPerson();
        if (fp !== this.firstPerson) this.setFirstPerson(fp);
        if (this.firstPerson) this.updateFirstPerson(dt);
        else this.updateCamera(dt);
        this.applyCamBlend(dt);
      }
    } else {
      this.input.consumeTap();
      this.input.consumeLook();
    }
    for (const n of this.npcs.values()) {
      n.char.update(dt);
      n.marker.position.y = 2.1 + Math.sin(performance.now() / 300) * 0.08;
    }
    this.player.update(dt);
    this.updateLighting();
    this.updateLotsOpen();

    this.saveTimer += dt;
    if (this.saveTimer > 10) this.save();

    this.ui.update(dt);
    if (this.renderPaused) return;
    this.clouds.update(dt);
    this.fx.update(dt);
    this.updateOcclusion(dt);
    if (!this.interior && !this.house) this.traffic.update(dt, this.player.root.position, this.night);
    if (this.interior) this.draw(this.interior.scene, this.interior.camera);
    else if (this.house) this.draw(this.house.scene, this.house.camera);
    else this.draw(this.scene, this.camera);
  }

  // ---------------- prima persona ----------------

  /**
   * Prima persona automatica durante i lavoretti in città (ora disattivata: vedi FP_JOBS).
   * In giro per la città, nelle attività e nelle case dei clienti si resta in terza persona.
   */
  firstPerson = false;
  /** direzione dello sguardo: 0 = nord, positivo verso est */
  fpYaw = 0;
  private fpPitch = -0.35;
  private fpSprites: THREE.Sprite[] = [];
  private fpScan = 0;
  /** secondi dall'ultima volta che il giocatore ha girato lo sguardo col dito */
  private fpIdle = 99;
  private fpBob = 0;
  /** passaggio morbido tra terza e prima persona */
  private camBlend: { pos: THREE.Vector3; quat: THREE.Quaternion; t: number } | null = null;

  /** Camera della scena attiva (città, attività o casa del cliente). */
  get activeCamera() {
    return this.interior?.camera ?? this.house?.camera ?? this.camera;
  }

  /** Prima persona nei lavoretti: disattivata (troppo difficile da telefono), il codice resta per il futuro. */
  static readonly FP_JOBS = false;

  private wantFirstPerson() {
    return Game.FP_JOBS && !!(this.run && this.runOffer) && !this.interior && !this.house;
  }

  setFirstPerson(on: boolean) {
    if (this.firstPerson === on) return;
    // si parte dalla posizione attuale della camera e ci si sposta con dolcezza
    this.camBlend = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), t: 0 };
    this.firstPerson = on;
    this.input.lookMode = on;
    this.input.cancel();
    this.moveTarget = null;
    if (on) {
      // sguardo verso il primo punto da fare (o dove guarda il personaggio)
      const t = this.run?.target;
      const p = this.player.root.position;
      this.fpYaw = t ? Math.atan2(t.x - p.x, -(t.z - p.z)) : Math.PI - this.player.root.rotation.y;
      this.fpPitch = -0.45;
      this.fpIdle = 99;
    }
    this.player.body.visible = !on && !(this.state.riding && riderPose(this.state.riding).hidden);
    if (this.player.held) this.player.held.visible = !on;
    if (this.rideObj) this.rideObj.visible = !on;
    if (this.playerMarker) this.playerMarker.visible = !on;
    // in prima persona non si disegna ciò che è attaccato agli occhi
    this.camera.near = on ? 0.3 : 0.5;
    this.camera.fov = on ? 72 : 35;
    this.camera.updateProjectionMatrix();
    if (!on) {
      for (const sp of this.fpSprites) {
        sp.material.opacity = 1;
        if (sp.userData.baseScale) sp.scale.copy(sp.userData.baseScale);
      }
      this.fpSprites = [];
      this.camTarget.copy(this.player.root.position);
    }
  }

  /**
   * Movimento del joystick nel mondo: in prima persona "su" è avanti
   * nella direzione dello sguardo, in terza persona è il nord.
   */
  moveVector() {
    const v = this.input.vector;
    if (!this.firstPerson) return this.view.toWorld(v);
    const c = Math.cos(this.fpYaw);
    const sn = Math.sin(this.fpYaw);
    // destra = (cos, sin), avanti = (sin, -cos)
    return { x: c * v.x - sn * v.y, y: sn * v.x + c * v.y };
  }

  private updateFirstPerson(dt: number) {
    const l = this.input.consumeLook();
    if (l.x || l.y) this.fpIdle = 0;
    else this.fpIdle += dt;
    this.fpYaw += l.x * 0.005;
    this.fpPitch = THREE.MathUtils.clamp(this.fpPitch - l.y * 0.004, -1.0, 0.35);
    const p = this.player.root.position;
    // se non tocchi lo sguardo, la testa si gira da sola verso il prossimo punto da fare
    const t = this.run?.target;
    if (t && this.fpIdle > 1.2) {
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      const wantYaw = Math.atan2(t.x - p.x, -(t.z - p.z));
      let dy = wantYaw - this.fpYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const k = Math.min(1, dt * 2.2);
      if (d > 0.6) this.fpYaw += dy * k;
      const wantPitch = THREE.MathUtils.clamp(-Math.atan2(1.4, Math.max(d, 0.5) + 0.35), -0.95, -0.15);
      this.fpPitch += (wantPitch - this.fpPitch) * k;
    }
    // leggero ondeggiare camminando
    const moving = Math.hypot(this.input.vector.x, this.input.vector.y) > 0.1;
    this.fpBob += moving ? dt * 9 : 0;
    const bob = moving ? Math.sin(this.fpBob) * 0.035 : 0;
    const cam = this.camera;
    // occhi sopra la testa e un po' indietro: più spazio tra la vista e gli oggetti vicini
    // se dietro la testa c'è un muro la camera si avvicina (mai dentro gli edifici)
    let back = 0.35;
    const inWall = (x: number, z: number) => this.city.colliders.some((c) => x > c.minX - 0.15 && x < c.maxX + 0.15 && z > c.minZ - 0.15 && z < c.maxZ + 0.15);
    while (back > 0 && inWall(p.x - Math.sin(this.fpYaw) * back, p.z + Math.cos(this.fpYaw) * back)) back -= 0.1;
    back = Math.max(0, back);
    // se il muro impedisce di arretrare, la camera sale: la distanza dagli oggetti resta ampia
    const rise = (0.35 - back) * 1.1;
    cam.position.set(p.x - Math.sin(this.fpYaw) * back, p.y + 1.65 + rise + bob, p.z + Math.cos(this.fpYaw) * back);
    cam.rotation.set(this.fpPitch, -this.fpYaw, 0, 'YXZ');
    this.player.root.rotation.y = Math.PI - this.fpYaw;
    this.player.body.visible = false;
    if (this.player.held) this.player.held.visible = false;
    // etichette: più piccole e nascoste se troppo vicine agli occhi
    if (++this.fpScan % 45 === 1) {
      this.fpSprites = [];
      this.scene.traverse((o) => {
        if ((o as THREE.Sprite).isSprite) this.fpSprites.push(o as THREE.Sprite);
      });
    }
    const wp = new THREE.Vector3();
    for (const sp of this.fpSprites) {
      sp.userData.baseScale ??= sp.scale.clone();
      sp.scale.copy(sp.userData.baseScale).multiplyScalar(0.55);
      sp.getWorldPosition(wp);
      sp.material.transparent = true;
      sp.material.opacity = wp.distanceTo(cam.position) < 1.4 ? 0 : 1;
    }
    // ombre attorno al giocatore anche in prima persona
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(this.sunDir, 36);
  }

  /** Passaggio morbido della camera dopo un cambio di visuale. */
  private applyCamBlend(dt: number) {
    const b = this.camBlend;
    if (!b) return;
    b.t += dt / 0.6;
    if (b.t >= 1) {
      this.camBlend = null;
      return;
    }
    const e = 1 - Math.pow(1 - b.t, 3);
    const cam = this.camera;
    cam.position.lerpVectors(b.pos, cam.position, e);
    cam.quaternion.slerpQuaternions(b.quat, cam.quaternion.clone(), e);
  }

  private updatePlayer(dt: number) {
    const v = this.moveVector();
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
      this.traffic.pushOut(p, ride ? ride.radius : 0.38);
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
      this.tutorial.update();
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
    const t = this.camTarget;
    this.view.place(this.camera, t, this.camDist(), THREE.MathUtils.degToRad(58), undefined, 0.6);
    // ombre solo attorno al giocatore
    this.sun.target.position.copy(t);
    this.sun.position.copy(t).addScaledVector(this.sunDir, 36);
  }

  private updateLighting(fixedHour?: number) {
    const h = fixedHour ?? hourOf(this.state);
    // luce del giorno: piena 8-18, tramonto, notte blu
    const dayF = THREE.MathUtils.clamp(1 - Math.abs(h - 13) / 8.5, 0, 1);
    const k = THREE.MathUtils.smoothstep(dayF, 0, 0.35);
    // il sole sorge a est, è alto a mezzogiorno e tramonta a ovest
    const ang = ((h - 6) / 12) * Math.PI;
    const elev = Math.max(0.25, Math.sin(ang));
    this.sunDir.set(Math.cos(ang) * 0.9, elev * 1.6, 0.45).normalize();
    // scena un po' più scura: gli oggetti dei lavoretti che si accendono risaltano di più
    const DIM = 0.82;
    this.sun.intensity = (0.35 + 2.1 * k) * DIM;
    this.hemi.intensity = (0.55 + 0.75 * k) * DIM;
    // tramonto/alba: luce più calda
    const golden = THREE.MathUtils.clamp(1 - Math.min(Math.abs(h - 18.6), Math.abs(h - 6.8)) / 1.6, 0, 1);
    this.sun.color.setRGB(1, 0.96 - 0.2 * golden, 0.9 - 0.35 * golden);
    const top = new THREE.Color(0x0f1a33).lerp(new THREE.Color(0x3d8fd6), k);
    const horizon = new THREE.Color(0x24345a).lerp(new THREE.Color(0xcfeaf7), k).lerp(new THREE.Color(0xf6a25e), 0.55 * golden);
    const sunCol = new THREE.Color(0xfff2c0).lerp(new THREE.Color(0xff9a4a), golden).multiplyScalar(0.3 + 0.7 * k);
    this.sky.set(top, horizon, this.sunDir, sunCol);
    this.clouds.setTint(k);
    // di sera si accendono lampioni e finestre
    const night = 1 - THREE.MathUtils.smoothstep(k, 0.15, 0.75);
    this.night = night;
    this.windows?.set(night);
    this.lamps?.set(night);
    (this.scene.background as THREE.Color).copy(horizon);
    this.scene.fog!.color.copy(horizon);
  }

  /** Ogni 0,12 s: rende trasparente ciò che copre il personaggio (o l'obiettivo in prima persona). */
  private updateOcclusion(dt: number) {
    this.occT += dt;
    if (this.occT < 0.12) return;
    this.occT = 0;
    const scene = this.interior?.scene ?? this.house?.scene ?? this.scene;
    const cam = this.activeCamera;
    cam.updateMatrixWorld();
    const p = this.player.root.position;
    const targets: THREE.Vector3[] = [];
    if (this.firstPerson) {
      const t = this.run?.target;
      if (t) targets.push(new THREE.Vector3(t.x, 0.5, t.z));
    } else {
      targets.push(new THREE.Vector3(p.x, 1, p.z), new THREE.Vector3(p.x, 0.3, p.z));
    }
    this.occluder.update(scene, cam, targets, [this.player.root, this.guide.mesh, this.sky.mesh]);
  }

  /** Disegna una scena, con i contorni se attivi nelle impostazioni. */
  private draw(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    if (scene === this.scene) this.sky.follow(camera);
    // con qualità Bassa niente contorni: sono il passaggio grafico più pesante
    if (settings.outlines && settings.quality !== 'bassa') this.outline.render(scene, camera);
    else this.renderer.render(scene, camera);
  }

  resetting = false;
  save() {
    this.saveTimer = 0;
    if (this.resetting || this.mode !== 'play') return;
    saveState(this.state);
    void submitScore(this.state);
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
