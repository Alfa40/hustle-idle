import * as THREE from 'three';
import { model, preload } from './assets';
import { JOB, TIME } from './config/balance';
import { JOBS, JOB_TYPES, type JobType } from './config/jobs';
import { LOTS } from './config/map';
import { PRODUCTS } from './config/products';
import { Input } from './input';
import { ensureWeather } from './sim/effects';
import { bus, toast } from './sim/bus';
import { advance, applyOffline, genMissions, missionProgress, updateEvents, type OfflineReport } from './sim/calendar';
import { bizAtLot, CHAR_MODELS, lotZone, refreshCandidates } from './sim/economy';
import { addFame, addMoney, addXp, skillLevel } from './sim/progress';
import {
  day, hourOf, loadState, newState, pick, rand, saveState,
  type GameState, type JobOffer,
} from './sim/state';
import { Character, charPath } from './world/character';
import { City, CITY_ASSETS, DIR_ROT, DIR_VEC, type Slot } from './world/city';
import { board, exclamation, label, playerDot, ring, saleSign } from './world/props';
import { TruckInterior, INTERIOR_ASSETS } from './world/interior';
import { DeliveryRun, DishRun, GardenRun, type JobRun } from './minigames/jobs';
import type { UI } from './ui/ui';

export interface Interactable {
  pos: THREE.Vector3;
  radius: number;
  label: string;
  icon: string;
  action: () => void;
  enabled?: () => boolean;
}

export interface MapMarker {
  x: number;
  z: number;
  icon: string;
  color: string;
  label: string;
  kind: 'job' | 'target' | 'lot' | 'biz' | 'board' | 'home';
  /** metri dal giocatore */
  dist: number;
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
const PLAYER_SPEED = 5.2;

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
  playerMarker?: THREE.Sprite;

  interactables: Interactable[] = [];
  npcs = new Map<number, JobNpc>();
  trucks = new Map<string, TruckSite>();
  run: JobRun | null = null;
  runOffer: JobOffer | null = null;
  moveTarget: THREE.Vector3 | null = null;
  /** il minigioco in corso può sostituire il pulsante azione */
  prompt: ActionPrompt | null = null;
  private nextJobSpawn = 3;
  private saveTimer = 0;
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  paused = false;
  offlineReport: OfflineReport | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(dpr, 1.6));
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

  async init(onProgress: (f: number) => void) {
    const chars = [PLAYER_MODEL, ...CHAR_MODELS].map(charPath);
    const assets = [
      ...CITY_ASSETS, ...INTERIOR_ASSETS, ...chars, 'cars/van.glb',
      'commercial/detail-awning-wide.glb', ...Object.values(PRODUCTS).map((p) => p.model),
      'furniture/cardboardBoxClosed.glb',
    ];
    await preload([...new Set(assets)], onProgress);

    this.city = new City();
    this.scene.add(this.city.group);
    for (const l of this.city.lots) lotZone[l.id] = l.zone;

    // stato + tempo offline
    const saved = loadState();
    this.state = saved ?? newState();
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

    for (const lot of this.city.lots) this.setupLot(lot.id);

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

    // NPC dei lavori già offerti
    this.state.jobs = this.state.jobs.filter((j) => this.slotsFor(j.type)[j.slot]);
    for (const j of this.state.jobs) this.spawnNpc(j);

    bus.on('newday', () => this.ui?.refresh());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.save());
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
      const all = type === 'giardino' ? this.city.gardens : type === 'consegna' ? this.city.shops : this.city.restaurants;
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
    if (!biz) {
      const sign = saleSign('€' + lot.price.toLocaleString('it-IT'));
      sign.position.set(...this.dirVec(slot, 1.8));
      sign.rotation.y = DIR_ROT[slot.dir];
      g.add(sign);
      const r = ring(0xff5d5d, 2.2);
      g.add(r);
      inter = this.addInteractable({
        pos: slot.center.clone().add(new THREE.Vector3(...this.dirVec(slot, 1.8))), radius: 2.4,
        label: 'Lotto in vendita', icon: '🏷️', action: () => this.ui.openLot(lotId),
      });
    } else {
      // furgone con il lato di servizio (+X locale) verso la strada
      const van = model('cars/van.glb', 1.55);
      van.rotation.y = DIR_ROT[slot.dir] - Math.PI / 2;
      g.add(van);
      const awn = model('commercial/detail-awning-wide.glb', 4.2);
      awn.position.set(0, 0.55, 0);
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
      const [dx, , dz] = this.dirVec(slot, 1);
      // collisione del furgone (lungo il lato perpendicolare alla strada)
      const hw = dx !== 0 ? 1.3 : 2.3;
      const hd = dz !== 0 ? 1.3 : 2.3;
      this.city.colliders = this.city.colliders.filter((c) => (c as { lot?: string }).lot !== lotId);
      this.city.colliders.push(Object.assign({ minX: slot.center.x - hw, maxX: slot.center.x + hw, minZ: slot.center.z - hd, maxZ: slot.center.z + hd }, { lot: lotId }));
      inter = this.addInteractable({
        pos: slot.center.clone().add(new THREE.Vector3(dx * 2.3, 0, dz * 2.3)), radius: 2,
        label: 'Entra nel food truck', icon: '🚪', action: () => this.enterTruck(lotId),
      });
    }
    this.trucks.set(lotId, { lotId, slot, group: g, inter, built: !!biz });
  }

  enterTruck(lotId: string) {
    const biz = bizAtLot(this.state, lotId);
    if (!biz || this.run) {
      if (this.run) toast('Finisci prima il lavoro in corso', 'bad');
      return;
    }
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
    const inUse = new Set(s.jobs.map((j) => j.type + j.slot));
    const types = JOB_TYPES.filter((t) => !s.jobs.some((j) => j.type === t) || s.jobs.length >= JOB_TYPES.length);
    const type = pick(types.length ? types : JOB_TYPES);
    const slots = this.slotsFor(type);
    const free = slots.map((_, i) => i).filter((i) => !inUse.has(type + i));
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
    if (offer.type === 'giardino') this.run = new GardenRun(this, offer, slot);
    else if (offer.type === 'consegna') this.run = new DeliveryRun(this, offer, slot);
    else this.run = new DishRun(this, offer);
    this.ui.jobBar(true);
  }

  cancelJob() {
    if (!this.run || !this.runOffer) return;
    this.finishJob(0);
  }

  /** stelle 0 = fallito */
  finishJob(stars: number) {
    const s = this.state;
    const offer = this.runOffer!;
    this.run?.dispose();
    this.run = null;
    this.runOffer = null;
    this.prompt = null;
    this.ui.jobBar(false);
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

  // ---------------- mappa e indicatori ----------------

  mapMarkers(): MapMarker[] {
    const p = this.player.root.position;
    const out: MapMarker[] = [];
    const add = (pos: THREE.Vector3, m: Omit<MapMarker, 'x' | 'z' | 'dist'>) =>
      out.push({ ...m, x: pos.x, z: pos.z, dist: Math.hypot(pos.x - p.x, pos.z - p.z) });
    add(this.city.board.pos, { icon: '📋', color: '#8e5bd6', label: 'Bacheca missioni', kind: 'board' });
    add(this.city.homes[0].pos, { icon: '🏠', color: '#2fb36b', label: 'Casa tua', kind: 'home' });
    for (const lot of this.city.lots) {
      const def = LOTS.find((l) => l.id === lot.id)!;
      const biz = bizAtLot(this.state, lot.id);
      if (biz) add(lot.center, { icon: '🚚', color: '#ff8a3d', label: def.name, kind: 'biz' });
      else add(lot.center, { icon: '🏷️', color: '#ff5d73', label: `${def.name} · €${def.price.toLocaleString('it-IT')}`, kind: 'lot' });
    }
    if (this.run?.target) add(this.run.target, { icon: '🎯', color: '#ff3b5c', label: 'Obiettivo del lavoro', kind: 'target' });
    else if (!this.run) {
      for (const n of this.npcs.values()) {
        const d = JOBS[n.offer.type];
        add(n.char.root.position, { icon: d.icon, color: '#ffc21a', label: `${d.name} · €${n.offer.pay}`, kind: 'job' });
      }
    }
    return out;
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
    this.snapCamera();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const s = this.state;

    // il tempo del gioco scorre sempre (è un idle), anche con i pannelli aperti
    advance(s, dt * TIME.GAME_MIN_PER_SEC);

    if (!this.paused) {
      if (this.interior) {
        this.interior.update(dt);
      } else {
        this.updatePlayer(dt);
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
    if (this.interior) this.renderer.render(this.interior.scene, this.interior.camera);
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
      const speed = PLAYER_SPEED * Math.min(1, len);
      const before = p.clone();
      p.x += mx * speed * dt;
      p.z += mz * speed * dt;
      this.city.collide(p, 0.38);
      // bloccato contro un muro mentre va verso un punto: rinuncia
      if (this.moveTarget && before.distanceTo(p) < speed * dt * 0.2) this.moveTarget = null;
      this.player.faceTowards(p.x + mx, p.z + mz, dt);
      if (!this.prompt?.progress) this.player.play(len > 0.6 ? 'sprint' : 'walk', 0.15, len > 0.6 ? 0.85 : 1);
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
    return this.camera.aspect < 1 ? 33 : 25;
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

  private updateLighting() {
    const h = hourOf(this.state);
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
    if (this.resetting) return;
    saveState(this.state);
  }

  private hiddenAt = 0;
  private onVisibility() {
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
