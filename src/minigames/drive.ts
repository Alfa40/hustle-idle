import * as THREE from 'three';
import { model } from '../assets';
import type { Game, JobRide } from '../game';
import { rungOf, rungProgress } from '../config/careers';
import { toast } from '../sim/bus';
import { CHAR_MODELS } from '../sim/economy';
import { Character } from '../world/character';
import { label, ring } from '../world/props';
import type { Slot } from '../world/city';
import { BaseRun, starsFor, type RunGuide } from './jobs';

/**
 * Lavoretti dell'Autista: si guidano nella città vera (terza persona) con un mezzo da lavoro che accelera e
 * frena piano (JobRide con l'inerzia). Le fermate sono cerchi sulla strada: ci si ferma dentro e si aspetta
 * (passeggeri che salgono, foto…). Ogni gradino aggiunge una cosa: orari e fermate prenotate (autobus),
 * guida dolce (bus turistico), il bicchiere d'acqua e il cliente che cambia idea (autista privato), il corteo
 * da seguire alla giusta distanza (limousine). Sempre sotto i 5 minuti.
 */

const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c });

/** Autobus fatto di blocchi (il fronte è +Z come i modelli Kenney). `open`: bus turistico scoperto. */
function busModel(color: number, open = false) {
  const g = new THREE.Group();
  const L = 7.2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, open ? 1.6 : 2.6, L), mat(color));
  body.position.y = open ? 1.2 : 1.7;
  g.add(body);
  const glass = mat(0x2c3e5a);
  for (const sx of [-1.21, 1.21]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.8, L - 1.4), glass);
    w.position.set(sx, open ? 1.6 : 2.2, -0.3);
    g.add(w);
  }
  const wind = new THREE.Mesh(new THREE.BoxGeometry(2.2, open ? 0.8 : 1.1, 0.05), glass);
  wind.position.set(0, open ? 1.6 : 2.2, L / 2 + 0.01);
  g.add(wind);
  if (open) {
    // piano di sopra scoperto con la ringhiera
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, L), mat(0xffffff));
    deck.position.y = 2.45;
    g.add(deck);
    for (const sx of [-1.15, 1.15]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, L - 0.3), mat(color));
      rail.position.set(sx, 2.75, 0);
      g.add(rail);
    }
  }
  for (const z of [L / 2 - 1.2, -L / 2 + 1.3]) for (const x of [-1.1, 1.1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 14), mat(0x22222a));
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.45, z);
    g.add(w);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** Auto (modello Kenney) lunga circa `len` metri; `stretch` > 1 la allunga (limousine), `tint` la ricolora. */
function carModel(path: string, len: number, stretch = 1, tint?: number) {
  const m = model(path, 1);
  const box = new THREE.Box3().setFromObject(m);
  const sc = len / (box.max.z - box.min.z);
  m.scale.set(sc, sc, sc * stretch);
  if (tint !== undefined) {
    m.traverse((o) => {
      const me = o as THREE.Mesh;
      if (!me.isMesh) return;
      const c = (me.material as THREE.MeshStandardMaterial).clone();
      c.color = new THREE.Color(tint);
      me.material = c;
    });
  }
  m.traverse((o) => (o.castShadow = true));
  return m;
}

interface Stop {
  pos: THREE.Vector3;
  name: string;
  icon: string;
  /** secondi da fermo dentro il cerchio */
  dwell: number;
  /** raggio del cerchio (più piccolo = accostare più preciso) */
  r: number;
  /** autobus: orario di passaggio (secondi dall'inizio della corsa) */
  due?: number;
  /** fermata prenotata 🔔 */
  booked?: boolean;
  /** persone che aspettano (salgono quando ti fermi) */
  people?: Character[];
  /** quante persone scendono */
  drop?: number;
  onDone?: () => void;
  done?: boolean;
  ringObj?: THREE.Object3D;
  tag?: THREE.Object3D;
}

type DriveKind = 'navetta' | 'autobus' | 'turistico' | 'privato' | 'limousine';

const RIDES: Record<DriveKind, { model: () => THREE.Object3D; speed: number; radius: number; accel: number; name: string; on: string }> = {
  navetta: { model: () => carModel('cars/van.glb', 4.8), speed: 11, radius: 1.3, accel: 7, name: 'pulmino', on: 'sul pulmino' },
  autobus: { model: () => busModel(0x2d6cdb), speed: 10, radius: 1.6, accel: 5.5, name: 'autobus', on: "sull'autobus" },
  turistico: { model: () => busModel(0xe5484d, true), speed: 9.5, radius: 1.6, accel: 5.5, name: 'bus scoperto', on: 'sul bus scoperto' },
  privato: { model: () => carModel('cars/suv-luxury.glb', 4.6), speed: 13, radius: 1.2, accel: 7, name: 'auto', on: "sull'auto" },
  limousine: { model: () => carModel('cars/sedan.glb', 4.4, 1.7, 0x1c1c22), speed: 12, radius: 1.4, accel: 6, name: 'limousine', on: 'sulla limousine' },
};

/** peso di ogni mezzo coi pedali (1 = auto): più pesa, più accelera, frena e sterza piano */
const MASS: Record<DriveKind, number> = { privato: 1, limousine: 1.3, navetta: 1.4, autobus: 2, turistico: 2 };

export class DriveRun extends BaseRun {
  private kind: DriveKind;
  private stops: Stop[] = [];
  private idx = -1;
  private boarded = false;
  private carAt: THREE.Vector3;
  private parked: THREE.Object3D;
  private dwellT = 0;
  private clock = 0;
  private late = 0;
  /** gradimento (bus turistico, limousine) o acqua nel bicchiere (autista privato), 0–100 */
  private meter = 100;
  private harshCool = 0;
  private t: number;
  private lead: { obj: THREE.Object3D; path: THREE.Vector3[]; i: number; speed: number; done: boolean } | null = null;
  private corteoOut = 0;
  private changed = false;
  private chars: Character[] = [];
  private lastWait = '';

  constructor(game: Game, kind: DriveKind, lineLevel: number, slot: Slot, title: string) {
    super(game, 1);
    this.kind = kind;
    this.title = title;
    this.t = rungProgress('autista', lineLevel);
    // il mezzo è parcheggiato sulla strada più vicina al cliente
    this.carAt = this.nearRoad(slot.pos);
    this.parked = this.add(RIDES[kind].model());
    this.parked.position.copy(this.carAt);
    const lbl = label(`🔑 ${RIDES[kind].name}`, { bg: '#2d6cdb', scale: 0.5 });
    lbl.position.set(this.carAt.x, 3.6, this.carAt.z);
    this.add(lbl);
    this.parked.userData.tag = lbl;
    this.plan();
    this.parked.rotation.y = this.roadHeading(this.carAt, this.stops[0]?.pos);
    // tempo: strada da fare alla velocità del mezzo, con margine, più le soste (mai oltre i 5 minuti)
    let len = 0;
    let prev = this.carAt;
    for (const s of this.stops) {
      len += Math.abs(s.pos.x - prev.x) + Math.abs(s.pos.z - prev.z);
      prev = s.pos;
    }
    const dwell = this.stops.reduce((a, s) => a + s.dwell, 0);
    this.setTime(20 + (len / RIDES[kind].speed) * 1.8 + dwell * 1.3);
    // orari dell'autobus: in base alla strada, con un po' di margine
    if (kind === 'autobus') {
      let acc = 15;
      let p = this.carAt;
      for (const s of this.stops) {
        acc += ((Math.abs(s.pos.x - p.x) + Math.abs(s.pos.z - p.z)) / RIDES[kind].speed) * 1.35 + s.dwell;
        s.due = Math.round(acc);
        p = s.pos;
      }
    }
    this.target = this.carAt;
  }

  /** Centro della tessera di strada più vicina a un punto. */
  private nearRoad(p: THREE.Vector3) {
    let best = this.game.city.roadTiles[0];
    let bd = Infinity;
    for (const r of this.game.city.roadTiles) {
      const d = r.distanceToSquared(p);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best.clone();
  }

  /**
   * Verso del mezzo parcheggiato: lungo la strada (dove ci sono altri pezzi di strada accanto), girato dalla
   * parte della prima fermata. Così coi pedali si parte dritti, senza il muso contro un palazzo.
   */
  private roadHeading(at: THREE.Vector3, to?: THREE.Vector3) {
    const near = (ax: 'x' | 'z') => this.game.city.roadTiles.filter((r) => {
      const along = Math.abs(ax === 'x' ? r.x - at.x : r.z - at.z);
      const across = Math.abs(ax === 'x' ? r.z - at.z : r.x - at.x);
      return across < 1 && along > 0.5 && along < 14;
    }).length;
    const alongX = near('x') >= near('z');
    const d = to ? (alongX ? to.x - at.x : to.z - at.z) : 1;
    // muso verso +Z = 0, verso +X = π/2
    return alongX ? (d >= 0 ? Math.PI / 2 : -Math.PI / 2) : d >= 0 ? 0 : Math.PI;
  }

  /** Un punto di strada tra `min` e `max` metri (in linea d'aria) da `from`, dentro la città vecchia se si può. */
  private roadAway(from: THREE.Vector3, min: number, max: number, avoid: THREE.Vector3[] = []) {
    const tiles = this.game.city.roadTiles.filter((r) => {
      const d = Math.hypot(r.x - from.x, r.z - from.z);
      return d >= min && d <= max && avoid.every((a) => a.distanceTo(r) > 25);
    });
    const pool = tiles.length ? tiles : this.game.city.roadTiles;
    return pool[Math.floor(Math.random() * pool.length)].clone();
  }

  private plan() {
    const t = this.t;
    const add = (s: Omit<Stop, 'r'> & { r?: number }) => this.stops.push({ r: 3.4 - 1.1 * t, ...s });
    const k = this.kind;
    let p = this.carAt;
    const next = (min: number, max: number) => (p = this.roadAway(p, min, max, [this.carAt, ...this.stops.map((s) => s.pos)]));
    if (k === 'navetta') {
      add({ pos: next(50, 90), name: 'Fermata dell\'hotel', icon: '🚏', dwell: 2.5, people: [] });
      add({ pos: next(90, 150), name: 'Stazione', icon: '🏁', dwell: 2, drop: 2 });
    } else if (k === 'autobus') {
      const n = t < 0.5 ? 3 : 4;
      for (let i = 0; i < n; i++) add({ pos: next(45, 85), name: `Fermata ${i + 1}`, icon: '🚏', dwell: 2.2, booked: Math.random() < 0.6, people: [] });
    } else if (k === 'turistico') {
      const mons = [['Fontana', '⛲'], ['Torre', '🗼'], ['Museo', '🏛️'], ['Castello', '🏰']].sort(() => Math.random() - 0.5);
      const n = t < 0.5 ? 2 : 3;
      for (let i = 0; i < n; i++) add({ pos: next(55, 95), name: mons[i][0], icon: mons[i][1], dwell: 4 });
    } else if (k === 'privato') {
      add({ pos: next(40, 70), name: 'Il cliente', icon: '🧑‍💼', dwell: 2, people: [] });
      add({ pos: next(110, 170), name: 'Destinazione', icon: '🏢', dwell: 1.5 });
    } else {
      add({ pos: next(45, 75), name: 'Casa della sposa', icon: '👰', dwell: 3, people: [] });
      add({ pos: next(110, 160), name: 'Chiesa · tappeto rosso', icon: '🟥', dwell: 2.5, r: 1.9 });
    }
    // persone che aspettano alle fermate (sul marciapiede)
    for (const s of this.stops) {
      if (!s.people) continue;
      const n = this.kind === 'autobus' ? 1 + Math.floor(Math.random() * 2) : this.kind === 'navetta' ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const c = new Character(CHAR_MODELS[(this.chars.length * 3 + 2) % CHAR_MODELS.length]);
        c.root.position.copy(s.pos).add(new THREE.Vector3(2.6 + i * 0.7, 0, 2.6));
        this.add(c.root);
        s.people.push(c);
        this.chars.push(c);
      }
    }
    // cerchi e cartelli delle fermate (si vedono tutti; quella da fare adesso pulsa)
    for (const s of this.stops) {
      s.ringObj = this.add(ring(0xffd21a, s.r));
      s.ringObj.position.set(s.pos.x, 0.3, s.pos.z);
      s.tag = this.add(label(`${s.icon} ${s.booked ? '🔔 ' : ''}${s.name}`, { bg: '#ffffff', fg: '#222', scale: 0.55 }));
      s.tag.position.set(s.pos.x, 4.2, s.pos.z);
    }
    if (this.kind === 'limousine') {
      // l'auto dello sposo, da seguire nel corteo dalla casa della sposa alla chiesa
      const car = carModel('cars/sedan.glb', 4.2, 1, 0xffffff);
      car.position.copy(this.stops[0].pos).add(new THREE.Vector3(0, 0, 0));
      car.visible = false;
      this.add(car);
      this.lead = { obj: car, path: [], i: 0, speed: 6.5 + 2 * t, done: false };
    }
  }

  private get stop() {
    return this.stops[this.idx];
  }

  /** Velocità del mezzo (m/s). */
  private get speed() {
    return this.game.rideVel.length();
  }

  update(dt: number) {
    if (!this.tick(dt)) return;
    this.harshCool = Math.max(0, this.harshCool - dt);
    for (const c of this.chars) c.update(dt);
    const p = this.game.player.root.position;
    if (!this.boarded) {
      const d = Math.hypot(this.carAt.x - p.x, this.carAt.z - p.z);
      this.status = `🔑 Sali ${RIDES[this.kind].on} · ${Math.round(d)} m`;
      this.game.prompt = d < 3.2 ? { label: `Sali ${RIDES[this.kind].on}`, icon: '🔑', at: this.carAt.clone().setY(1.6) } : null;
      return;
    }
    this.game.prompt = null;
    if (!this.frozen) this.clock += dt;
    this.smoothness(dt);
    this.updateLead(dt);
    const s = this.stop;
    if (!s) return;
    this.target = s.pos;
    // la fermata da fare pulsa
    const k = 1 + 0.12 * Math.sin(performance.now() / 150);
    for (const x of this.stops) {
      const on = x === s;
      x.ringObj!.scale.setScalar(on ? k : 1);
      (((x.ringObj as THREE.Mesh).material) as THREE.MeshBasicMaterial).color.setHex(x.done ? 0x9aa0aa : on ? 0x35c46a : 0xffd21a);
      x.ringObj!.visible = !x.done;
      x.tag!.visible = !x.done;
    }
    const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
    let wait = '';
    // nel corteo la chiesa si raggiunge solo dopo l'auto dello sposo
    const corteo = this.kind === 'limousine' && this.idx === 1 && this.lead && !this.lead.done;
    if (d < s.r && !corteo) {
      if (this.speed < 0.7) {
        // autobus in anticipo: si aspetta l'orario prima di ripartire
        const early = s.due !== undefined ? s.due - this.clock : 0;
        if (early > 3) wait = `🕐 In anticipo: riparti tra ${Math.ceil(early)} s`;
        else {
          this.dwellT += dt;
          wait = `${s.people?.length ? '🧍 Salgono' : s.drop ? '🧍 Scendono' : s.icon === '🏛️' || s.icon === '⛲' || s.icon === '🗼' || s.icon === '🏰' ? '📸 Foto' : '⏳'} ${Math.round((this.dwellT / s.dwell) * 100)}%`;
          if (this.dwellT >= s.dwell) this.reach(s);
        }
      } else wait = '🛑 Fermati qui';
    } else this.dwellT = 0;
    const due = s.due !== undefined ? ` · 🕐 ${this.clockText(s.due)}` : '';
    const meter = this.kind === 'turistico' || this.kind === 'limousine' ? ` · 😊 ${Math.round(this.meter)}%` : this.kind === 'privato' ? ` · 🥛 ${Math.round(this.meter)}%` : '';
    this.status = `${s.icon} ${corteo ? 'Segui l\'auto dello sposo' : s.name}${due}${meter}${wait ? ` · ${wait}` : ` · ${Math.round(d)} m`}`;
    if (wait && wait !== this.lastWait && wait.startsWith('🛑')) this.lastWait = wait;
  }

  private clockText(sec: number) {
    const left = Math.round(sec - this.clock);
    return left >= 0 ? `tra ${left} s` : `${-left} s di ritardo`;
  }

  /** Fermata fatta: passeggeri su o giù, ritardi, cosa succede dopo. */
  private reach(s: Stop) {
    s.done = true;
    this.dwellT = 0;
    for (const c of s.people ?? []) c.root.visible = false;
    if (s.drop) {
      for (let i = 0; i < s.drop; i++) {
        const c = new Character(CHAR_MODELS[(i * 5 + 1) % CHAR_MODELS.length]);
        c.root.position.copy(s.pos).add(new THREE.Vector3(2.4 + i * 0.7, 0, -2.4));
        this.add(c.root);
        this.chars.push(c);
      }
    }
    if (s.due !== undefined && this.clock - s.due > 8) {
      this.late++;
      this.starCap = Math.max(1, 3 - this.late);
      toast(`🕐 Fermata in ritardo di ${Math.round(this.clock - s.due)} s: massimo ${this.starCap} stelle`, 'bad');
    } else toast(`${s.icon} ${s.name}: fatto!`, 'good');
    s.onDone?.();
    if (this.kind === 'limousine' && this.idx === 0 && this.lead) {
      // parte il corteo: l'auto dello sposo davanti, verso la chiesa
      const path = this.game.city.route(s.pos.clone().add(new THREE.Vector3(0, 0, 0.1)), this.stops[1].pos) ?? [s.pos.clone(), this.stops[1].pos.clone()];
      this.lead.path = path.map((x) => x.clone());
      this.lead.i = 0;
      this.lead.obj.position.copy(path[0]);
      this.lead.obj.visible = true;
      // parte con 12 m di vantaggio (non ti sta addosso)
      let adv = 12;
      while (adv > 0 && this.lead.i < this.lead.path.length - 1) {
        const a = this.lead.obj.position;
        const b = this.lead.path[this.lead.i + 1];
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d <= adv) {
          a.set(b.x, 0, b.z);
          this.lead.i++;
          adv -= d;
        } else {
          a.x += ((b.x - a.x) / d) * adv;
          a.z += ((b.z - a.z) / d) * adv;
          adv = 0;
        }
      }
      toast('🚗 Il corteo parte: segui l\'auto dello sposo, né troppo vicino né troppo lontano', 'info');
    }
    this.idx++;
    if (this.idx >= this.stops.length) {
      this.end();
      return;
    }
  }

  /** Autista privato: il cliente cambia idea quando sei a metà strada. */
  private maybeChange() {
    if (this.kind !== 'privato' || this.idx !== 1 || this.changed) return;
    const s = this.stops[1];
    const p = this.game.player.root.position;
    const total = this.stops[0].pos.distanceTo(s.pos);
    if (p.distanceTo(s.pos) > total * 0.55) return;
    const nw = this.roadAway(p, 50, 90, [s.pos, this.stops[0].pos]);
    const ns: Stop = { pos: nw, name: 'Nuova destinazione', icon: '🏨', dwell: 1.5, r: s.r };
    ns.ringObj = this.add(ring(0xffd21a, ns.r));
    ns.ringObj.position.set(nw.x, 0.3, nw.z);
    ns.tag = this.add(label(`${ns.icon} ${ns.name}`, { bg: '#ffffff', fg: '#222', scale: 0.55 }));
    ns.tag.position.set(nw.x, 4.2, nw.z);
    s.ringObj!.visible = false;
    s.tag!.visible = false;
    this.stops[1] = ns;
    this.changed = true;
    this.timeLeft = Math.min(300, this.timeLeft + 20);
    toast('🧑‍💼 "Cambio di programma: mi porti all\'hotel!" Nuova destinazione', 'info');
  }

  /** Frenate, scatti e curve brusche: abbassano il gradimento o rovesciano l'acqua. */
  private smoothness(dt: number) {
    this.maybeChange();
    if (this.kind !== 'turistico' && this.kind !== 'privato' && this.kind !== 'limousine') return;
    const ride = this.game.jobRide;
    if (!ride) return;
    // brusco: girare o frenare mentre si va oltre la tacca del tachimetro (bisogna rallentare prima,
    // lasciando l'acceleratore); lasciare i pedali fa rallentare piano e va bene
    const pd = this.game.pedalInput();
    const sp = this.speed;
    const fast = sp > ride.speed * 0.55;
    const harsh = fast && (pd.steer !== 0 || pd.brake);
    const what = pd.brake ? 'Frenata brusca' : 'Curva brusca';
    if (harsh && !this.harshCool) {
      this.harshCool = 1.4;
      const loss = this.kind === 'privato' ? 18 : 12;
      this.meter = Math.max(0, this.meter - loss);
      this.starCap = this.meter < 40 ? 1 : this.meter < 70 ? 2 : 3;
      toast(this.kind === 'privato' ? `💦 ${what}! L'acqua si rovescia (${Math.round(this.meter)}%)` : `😖 ${what}: gradimento ${Math.round(this.meter)}%`, 'bad');
    }
    void dt;
  }

  /** Corteo: l'auto dello sposo avanza; resta dietro tra 4 e 16 m o il gradimento scende. */
  private updateLead(dt: number) {
    const L = this.lead;
    if (!L || L.done || !L.obj.visible || this.idx !== 1) return;
    const p = this.game.player.root.position;
    const dist = Math.hypot(L.obj.position.x - p.x, L.obj.position.z - p.z);
    // aspetta se resti troppo indietro (non scappa via), rallenta se gli stai addosso
    const go = dist < 22 ? L.speed : 0;
    let move = go * dt;
    while (move > 0 && L.i < L.path.length - 1) {
      const a = L.obj.position;
      const b = L.path[L.i + 1];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d <= move) {
        a.set(b.x, 0, b.z);
        L.i++;
        move -= d;
      } else {
        a.x += ((b.x - a.x) / d) * move;
        a.z += ((b.z - a.z) / d) * move;
        L.obj.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        move = 0;
      }
    }
    if (L.i >= L.path.length - 1) {
      L.done = true;
      L.obj.visible = false;
      toast('⛪ Lo sposo è arrivato: fermati sul tappeto rosso', 'info');
      return;
    }
    if (dist < 4 || dist > 16) {
      this.corteoOut += dt;
      if (this.corteoOut > 1.5) {
        this.corteoOut = 0;
        this.meter = Math.max(0, this.meter - 8);
        this.starCap = this.meter < 40 ? 1 : this.meter < 70 ? 2 : 3;
        toast(dist < 4 ? '🚗 Troppo vicino all\'auto dello sposo!' : '🚗 Ti stai staccando dal corteo!', 'bad');
      }
    } else this.corteoOut = 0;
  }

  /**
   * Tachimetro: velocità adesso rispetto alla massima del mezzo. La tacca (dove serve guidare dolce) è la
   * velocità oltre la quale una curva diventa brusca: col tempo si impara quando rallentare prima di girare
   * o di arrivare alla fermata.
   */
  gauge() {
    if (!this.boarded || !this.game.jobRide) return null;
    const max = this.game.jobRide.speed;
    const smooth = this.kind === 'turistico' || this.kind === 'privato' || this.kind === 'limousine';
    return { icon: '🏎️', value: this.speed, max, text: `${Math.round(this.speed * 3.6)} km/h`, mark: smooth ? 0.55 : undefined };
  }

  onAction() {
    if (this.boarded) return;
    const p = this.game.player.root.position;
    if (Math.hypot(this.carAt.x - p.x, this.carAt.z - p.z) > 3.2) return;
    this.boarded = true;
    this.objsRemove(this.parked);
    (this.parked.userData.tag as THREE.Object3D).visible = false;
    const facing = this.parked.rotation.y;
    this.parked.position.set(0, 0, 0);
    this.parked.rotation.set(0, 0, 0);
    const r = RIDES[this.kind];
    const big = this.kind === 'autobus' || this.kind === 'turistico';
    // si guida come in un gioco di auto: pedali a sinistra, frecce a destra (i bus girano più piano)
    const jr: JobRide = { obj: this.parked, speed: r.speed, radius: r.radius, inertia: true, pedals: true, turn: big ? 1.15 : 1.55, accel: r.accel, mass: MASS[this.kind], camZoom: big ? 1.45 : 1.25 };
    p.copy(this.carAt);
    this.game.setJobRide(jr);
    this.game.player.root.rotation.y = facing;
    this.idx = 0;
    this.game.prompt = null;
  }

  private end() {
    this.target = undefined;
    const st = Math.min(this.starCap, starsFor(this.timeLeft, this.timeTotal));
    this.game.finishJob(Math.max(1, st));
  }

  guide(): RunGuide | null {
    const tips: Record<DriveKind, string> = {
      navetta: '<b>Acceleratore</b> e <b>freno</b> in basso a sinistra. <b>Frecce</b> in basso a destra per girare. <b>Fermati dentro</b> il cerchio della fermata. Frena un po\' prima di arrivare. Freno tenuto da fermo = retromarcia',
      autobus: 'Fermati a ogni fermata <b>in orario</b>. In anticipo? Aspetta. In ritardo perdi stelle. 🔔 = prenotata',
      turistico: 'Fermati a ogni monumento per le <b>foto</b>. Guida <b>dolce</b>: le brusche fanno scendere 😊. Oltre la <b>tacca</b> del tachimetro, curve e frenate sono brusche. Rallenta prima di curve e fermate',
      privato: 'Guida <b>dolce</b>: il bicchiere 🥛 non deve rovesciarsi. Il cliente può <b>cambiare meta</b>. Oltre la <b>tacca</b> del tachimetro, curve e frenate sono brusche',
      limousine: 'Prendi la sposa. <b>Segui l\'auto dello sposo</b>, né troppo vicino né lontano. Fermati sul <b>tappeto rosso</b>. Oltre la <b>tacca</b> del tachimetro, curve e frenate sono brusche',
    };
    const p = this.game.player.root.position;
    if (!this.boarded) {
      const near = Math.hypot(this.carAt.x - p.x, this.carAt.z - p.z) < 3.2;
      return { phase: 0, phases: this.stops.length + 1, phaseName: `Sali ${RIDES[this.kind].on}`, phaseIcon: '🔑', left: 1, task: { pos: this.carAt, kind: 'tap', label: 'Sali', icon: '🔑' }, near, inZone: true, arrived: true, tip: `Il <b>${RIDES[this.kind].name}</b> è parcheggiato sulla strada: avvicinati e sali` };
    }
    const s = this.stop;
    if (!s) return null;
    return { phase: this.idx + 1, phases: this.stops.length + 1, phaseName: s.name, phaseIcon: s.icon, left: this.stops.length - this.idx, task: null, near: false, inZone: true, arrived: true, tip: tips[this.kind] };
  }

  dispose() {
    this.game.prompt = null;
    super.dispose();
  }
}

/** Gradino della linea Autista → tipo di guida. */
export function driveJob(game: Game, lineLevel: number, slot: Slot, title: string) {
  const kinds: DriveKind[] = ['navetta', 'autobus', 'turistico', 'privato', 'limousine'];
  return new DriveRun(game, kinds[rungOf('autista', lineLevel)], lineLevel, slot, title);
}
