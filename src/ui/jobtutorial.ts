import * as THREE from 'three';
import type { Game } from '../game';
import type { JobRun } from '../minigames/jobs';
import { toast } from '../sim/bus';

/**
 * Tutorial contestuale dei lavoretti: la prima volta che fai un lavoretto (o quando lo scegli
 * nella scheda), un fumetto sopra il punto da raggiungere spiega cosa fare in quella fase,
 * e una manina sull'oggetto da usare mostra il gesto (tocca / tieni premuto). Il tempo è fermo.
 */

/** Cosa fare in ogni fase, con il perché (null = si usa il punto da fare, es. lavapiatti). */
/** Chiave: il tipo (versione di base) o `tipo:versione` (es. `giardino:1`, la potatura). */
const TIPS: Record<string, string[] | null> = {
  giardino: [
    'Ti serve il <b>tosasiepi</b>: è nella <b>cassetta rossa</b>',
    'Taglia tutti i <b>cespugli</b> che si illuminano',
    'Le foglie tagliate sono cadute a terra: <b>raccogli ogni mucchio</b>',
    'Svuota il sacco di foglie nel <b>bidone verde</b>',
  ],
  consegna: [
    'Ritira i <b>pacchi</b> al <b>negozio dei pacchi</b> (insegna rossa)',
    'Porta un pacco a ogni <b>civico</b> del riquadro in alto: leggi le <b>targhe blu</b> sulle case e tocca lo <b>zerbino</b> davanti alla porta. L\'ordine lo scegli tu',
    'Hai consegnato tutto: torna al negozio a <b>firmare la ricevuta</b>',
  ],
  volantini: [
    'Prendi i <b>giornali</b> all\'<b>edicola</b> (il chiosco verde)',
    'Imbuca un giornale in ogni <b>cassetta blu</b> lungo la via: sono vicine, corri!',
    'Torna all\'edicola per la <b>ricevuta</b>',
  ],
  lavaggio: [
    'Prendi lo <b>spruzzino del sapone</b> (la tanica rosa)',
    'Sull\'auto ci sono <b>macchie di sporco</b> marroni: insaponale tutte (anche sul muso, sulla coda e sul tetto: girale attorno)',
    'Prendi la <b>canna dell\'acqua</b> dall\'avvolgitubo verde',
    '<b>Sciacqua</b> via la schiuma bianca da ogni punto',
    'Prendi lo <b>straccio</b> dal secchio blu',
    '<b>Asciuga</b> le gocce azzurre finché l\'auto brilla',
  ],
  imbianchino: [
    'Prima proteggi il giardino: copri ogni cosa (cespugli, aiuole, giochi…) con un <b>telone</b>',
    'Prendi la <b>vernice</b> (i barattoli vicino al cancello)',
    '<b>Dipingi</b> ogni tratto del muretto di recinzione',
    'Lavoro finito: <b>togli i teloni</b>',
  ],
  'giardino:1': [
    'Ti servono le <b>cesoie da potatura</b>: sono nella <b>cassetta rossa</b>',
    'Le <b>siepi</b> lungo la recinzione hanno delle <b>punte cresciute troppo</b> (verde chiaro): tagliale tutte',
    'Gli <b>alberi</b> hanno dei <b>rami in eccesso</b> che sporgono: tagliali (alza lo sguardo!)',
    'I rami tagliati sono caduti a terra: <b>raccoglili</b>',
    'Butta i rami nella <b>cippatrice</b> arancione vicino alla casa',
  ],
};

/** Per i punti da toccare direttamente: su cosa tenere il dito, per ogni fase (chiave del lavoretto). */
const AIM_WHAT: Record<string, Record<number, string>> = {
  lavaggio: { 1: 'sulla macchia', 3: 'sulla schiuma', 5: 'sulle gocce' },
  'giardino:1': { 1: 'sulla punta della siepe', 2: 'sul ramo da tagliare' },
};

export class JobTutorial {
  /** chiave del lavoretto (tipo o tipo:versione) */
  private type: string | null = null;
  private run: JobRun | null = null;
  private bubble: HTMLDivElement;
  private hand: HTMLDivElement;
  /** manina che mostra come camminare (nel riquadro del joystick) */
  private walk: HTMLDivElement;
  /** freccia sul bordo dello schermo quando l'obiettivo non si vede */
  private edge: HTMLDivElement;
  /** freccia 3D che rimbalza sopra l'oggetto da raggiungere */
  private arrow: THREE.Sprite;
  private key = '';
  /** spiegazione lunga aperta col "?" (si richiude quando cambia il passo) */
  private open = false;
  private stepKey = '';
  /** secondi da fermo lontano dall'obiettivo (dopo un po' la manina mostra come camminare) */
  private still = 0;
  private last = 0;

  constructor(private game: Game) {
    this.bubble = document.createElement('div');
    this.bubble.className = 'tut-bubble tut-mini';
    this.bubble.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('[data-t="more"]')) return;
      this.open = !this.open;
      this.key = '';
    });
    this.hand = document.createElement('div');
    this.hand.className = 'tut-hand';
    this.walk = document.createElement('div');
    this.walk.className = 'tut-hand tut-walk';
    this.walk.textContent = '👆';
    this.edge = document.createElement('div');
    this.edge.className = 'tut-edge';
    document.body.append(this.bubble, this.hand, this.walk, this.edge);
    this.arrow = new THREE.Sprite(new THREE.SpriteMaterial({ map: arrowTex(), depthTest: false, transparent: true }));
    this.arrow.renderOrder = 12;
    this.arrow.userData.noGlow = true;
    this.arrow.scale.set(0.55, 0.7, 1);
    this.hide();
  }

  get active() {
    return !!this.run;
  }

  /** Il tutorial di questo lavoretto è già stato completato in questa partita. */
  isDone(type: string) {
    return (this.game.state.jobTutorials ?? []).includes(type);
  }

  start(type: string, run: JobRun) {
    this.type = type;
    this.run = run;
    run.frozen = true;
    this.key = '';
    this.open = false;
    toast('🎓 Tutorial: il tempo è fermo', 'info');
  }

  /** Fine del lavoretto: completato = non si ripropone più per questo tipo. */
  finish(stars: number) {
    if (!this.run || !this.type) return;
    if (stars > 0) {
      const s = this.game.state;
      s.jobTutorials = [...new Set([...(s.jobTutorials ?? []), this.type])];
    }
    this.run = null;
    this.type = null;
    this.hide();
  }

  private hide() {
    this.bubble.style.display = 'none';
    this.hand.style.display = 'none';
    this.walk.style.display = 'none';
    this.edge.style.display = 'none';
    this.arrow.removeFromParent();
    document.body.classList.remove('tut-pointing');
    this.key = '';
  }

  update() {
    const run = this.run;
    const g = run?.guide?.();
    if (!run || !g || !this.type || this.game.ui?.isOpen) {
      this.hide();
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    // una cosa alla volta: il passo di adesso in poche parole (il nome del punto da fare)
    const tips = TIPS[this.type];
    const long = g.tip ?? tips?.[g.phase] ?? '';
    let line: string;
    let target: THREE.Vector3 | null = null;
    let obj: THREE.Object3D | undefined;
    let gesture: 'tap' | 'hold' | null = null;
    let aimAt: THREE.Vector3 | null = null;
    let noArrow = false;
    if (!g.arrived) line = '🚶 Vai alla zona di lavoro';
    else if (!g.inZone) line = '⚠️ Torna nella zona di lavoro';
    else if (g.task) {
      line = `${g.task.icon ? `${g.task.icon} ` : ''}${g.task.label}`;
      if (!g.near) {
        target = g.task.pos;
        // i punti col loro indicatore (il cerchio bianco con l'icona) non hanno bisogno della freccia sopra
        noArrow = !g.task.quiet;
        obj = g.task.obj ?? g.task.hitObj;
      } else if (g.task.aim) {
        // punti da toccare direttamente (macchie sull'auto, punte della siepe): il gesto è insolito, si scrive
        aimAt = this.visibleAim(g.aims ?? []);
        line = `👆 Tieni il dito ${AIM_WHAT[this.type]?.[g.phase] ?? 'sul punto che si illumina'}`;
      }
      else gesture = g.task.kind;
    } else line = `${g.phaseIcon ? `${g.phaseIcon} ` : ''}${g.phaseName}`;
    const step = `${g.phase}|${line}`;
    if (step !== this.stepKey) {
      this.stepKey = step;
      this.open = false;
    }
    // davanti all'oggetto basta la manina (e la scritta dell'azione): il fumetto resta piccolo, col "?"
    const near = !!g.task && g.near && !g.task.aim;
    const more = long ? `<button class="tut-more" data-t="more" aria-label="Spiegazione">${this.open ? '✕' : '?'}</button>` : '';
    const html = this.open
      ? `<div class="tut-row"><span class="tut-line">🎓 ${line}</span>${more}</div><div class="tut-long">${long}</div>`
      : `<div class="tut-row"><span class="tut-line">${near ? '🎓' : `🎓 ${line}`}</span>${more}</div>`;
    if (html !== this.key) {
      this.key = html;
      this.bubble.innerHTML = html;
      this.bubble.classList.toggle('tiny', near && !this.open);
    }
    this.bubble.style.display = '';
    this.place();
    this.point(target, obj, noArrow);
    // fermo lontano dall'obiettivo: la manina spinge il joystick in avanti
    const moving = Math.hypot(this.game.input.vector.x, this.game.input.vector.y) > 0.1;
    this.still = target && !moving ? this.still + dt : 0;
    this.placeWalk(!!target && this.still > 1.5);
    if (aimAt) this.placeHandAt(aimAt);
    else if (g.task?.aim) this.hand.style.display = 'none';
    else this.placeHand(gesture);
  }

  /** Freccia che rimbalza sopra l'oggetto da raggiungere; se non si vede, freccia sul bordo dello schermo. */
  private point(target: THREE.Vector3 | null, obj?: THREE.Object3D, noArrow = false) {
    if (!target) {
      this.arrow.removeFromParent();
      this.edge.style.display = 'none';
      return;
    }
    let top = 1.2;
    if (obj?.visible !== false && obj) {
      const b = new THREE.Box3().setFromObject(obj);
      if (Number.isFinite(b.max.y)) top = Math.min(b.max.y, 3.5);
    }
    if (!this.arrow.parent) this.game.scene.add(this.arrow);
    const bob = Math.abs(Math.sin(performance.now() / 260)) * 0.18;
    this.arrow.position.set(target.x, top + 0.5 + bob, target.z);
    const cam = this.game.activeCamera;
    cam.updateMatrixWorld();
    // oggetto alto e vicino (il negozio): la freccia scende finché si vede sotto i riquadri in alto
    for (let i = 0; i < 12; i++) {
      const p = this.arrow.position.clone().project(cam);
      if (p.z > 1 || p.y <= 0.42 || this.arrow.position.y <= target.y + 0.6) break;
      this.arrow.position.y -= 0.3;
    }
    const v = this.arrow.position.clone().project(cam);
    if (noArrow) this.arrow.removeFromParent();
    const behind = v.z > 1;
    const off = behind || Math.abs(v.x) > 0.92;
    if (!off) {
      this.edge.style.display = 'none';
      return;
    }
    // l'obiettivo è di lato o dietro: freccia sul bordo sinistro o destro, verso dove girarsi
    const local = this.arrow.position.clone().applyMatrix4(cam.matrixWorldInverse);
    const right = local.x >= 0;
    const fp = this.game.input.fpZones();
    // a metà altezza, mai sotto il fumetto del tutorial
    const bb = this.bubble.getBoundingClientRect();
    const y = Math.min(innerHeight - 60, Math.max(innerHeight * 0.5, bb.bottom + 44));
    this.edge.style.display = '';
    this.edge.style.left = `${right ? fp.look.x + fp.look.w - 34 : fp.move.x + 34}px`;
    this.edge.style.top = `${y}px`;
    this.edge.style.transform = `translate(-50%, -50%) rotate(${right ? 0 : Math.PI}rad)`;
  }

  /** Manina nel riquadro del joystick: trascina in avanti per camminare. */
  private placeWalk(on: boolean) {
    const fp = document.body.classList.contains('fp-controls');
    if (!on || !fp) {
      this.walk.style.display = 'none';
      return;
    }
    const z = this.game.input.fpZones().move;
    this.walk.style.display = '';
    this.walk.style.left = `${z.x + z.w / 2 - 28}px`;
    this.walk.style.top = `${z.y + z.h * 0.55}px`;
  }

  /** Il punto da toccare più al centro dello schermo tra quelli che si vedono (per la manina). */
  private visibleAim(list: THREE.Vector3[]) {
    const cam = this.game.activeCamera;
    cam.updateMatrixWorld();
    let best: THREE.Vector3 | null = null;
    let bd = Infinity;
    for (const p of list) {
      const v = p.clone().project(cam);
      if (v.z > 1 || Math.abs(v.x) > 0.85 || v.y > 0.7 || v.y < -0.9) continue;
      const d = Math.hypot(v.x, v.y + 0.3);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private placeHandAt(p: THREE.Vector3) {
    const cam = this.game.activeCamera;
    cam.updateMatrixWorld();
    const v = p.clone().project(cam);
    const size = this.hand.offsetHeight || 70;
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) {
      this.hand.style.display = 'none';
      return;
    }
    this.hand.style.display = '';
    this.hand.className = 'tut-hand hold';
    this.hand.textContent = '👆';
    this.hand.style.left = `${((v.x + 1) / 2) * innerWidth - size * 0.42}px`;
    this.hand.style.top = `${((1 - v.y) / 2) * innerHeight - size * 0.06}px`;
  }

  /** Il fumetto sta subito sotto il riquadro del lavoretto (in alto a sinistra). */
  private place() {
    const bar = document.querySelector('.jobbar') as HTMLElement | null;
    const b = this.bubble;
    if (!bar) return;
    const r = bar.getBoundingClientRect();
    b.style.left = `${r.left}px`;
    b.style.top = `${r.bottom + 6}px`;
    b.style.maxWidth = `${r.width}px`;
  }

  /** Manina sull'oggetto da usare (l'anello che lampeggia): tocca o tieni premuto. */
  private placeHand(gesture: 'tap' | 'hold' | null) {
    placeTutHand(this.hand, gesture);
  }
}

let arrowTexture: THREE.Texture | null = null;
/** Freccia viola del tutorial che punta in basso (bordo bianco: si vede su ogni sfondo). */
function arrowTex() {
  if (arrowTexture) return arrowTexture;
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 122;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.moveTo(30, 6);
  g.lineTo(66, 6);
  g.lineTo(66, 58);
  g.lineTo(90, 58);
  g.lineTo(48, 114);
  g.lineTo(6, 58);
  g.lineTo(30, 58);
  g.closePath();
  g.lineJoin = 'round';
  g.lineWidth = 10;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.fillStyle = '#8e5bd6';
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = '#3a2f55';
  g.stroke();
  arrowTexture = new THREE.CanvasTexture(c);
  arrowTexture.colorSpace = THREE.SRGBColorSpace;
  return arrowTexture;
}

/**
 * Manina grande del tutorial sull'oggetto da usare: il dito tocca il centro dell'anello che
 * lampeggia (la scritta dell'anello passa sopra, così la manina non la copre).
 */
export function placeTutHand(hand: HTMLElement, gesture: 'tap' | 'hold' | null) {
  // la manina indica l'area delle azioni (la metà dello schermo senza joystick), quando c'è un'azione
  // in prima persona si tocca l'oggetto stesso: la manina va sulla sua zona da toccare
  const fp = document.body.classList.contains('fp-controls');
  const act = document.querySelector(fp ? '.action:not(.act-stand)' : '.act-zone') as HTMLElement | null;
  const show = !!gesture && !!act && document.body.classList.contains('act-ready');
  document.body.classList.toggle('tut-pointing', show);
  if (!show) {
    hand.style.display = 'none';
    return;
  }
  const r = act!.getBoundingClientRect();
  const size = hand.offsetHeight || 70;
  if (fp) {
    hand.style.display = '';
    hand.style.left = `${r.left + r.width / 2 - size * 0.42}px`;
    hand.style.top = `${r.top + r.height / 2 - size * 0.06}px`;
    hand.className = `tut-hand ${gesture}`;
    hand.textContent = gesture === 'hold' ? '✊' : '👆';
    return;
  }
  hand.style.display = '';
  // la punta del dito (in alto, un po' a sinistra del disegno) sul centro dell'anello
  // nella parte bassa dell'area, dove arriva il pollice
  hand.style.left = `${r.left + r.width / 2 - size * 0.42}px`;
  hand.style.top = `${r.top + r.height * 0.72 - size * 0.06}px`;
  hand.className = `tut-hand ${gesture}`;
  hand.textContent = gesture === 'hold' ? '✊' : '👆';
}
