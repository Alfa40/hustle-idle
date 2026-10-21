import * as THREE from 'three';
import type { Game } from '../game';
import type { JobRun, RunGuide } from '../minigames/jobs';
import type { Guide } from './guide';
import type { Station } from '../minigames/station';
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
    'Il <b>tosaerba</b> rosso è vicino al cancello: prendilo',
    "Taglia ogni <b>ciuffo d'erba alta</b>: gira attorno alle <b>aiuole fiorite</b>",
    'Lascia il tosaerba e prendi il <b>rastrello</b>',
    'Raccogli ogni <b>mucchio di foglie</b>',
    'Svuota il sacco nel <b>bidone verde</b>',
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
  /** passi già mostrati con la guida a schermo scuro (una volta per fase) */
  private coachGo = false;
  private coachPhase = -1;
  private coachAim = -1;
  /** tipi di compito (icona) e minigiochi col dito già spiegati in questo lavoretto */
  private coachTasks = new Set<string>();
  private coachNearKeys = new Set<string>();
  private coachStations = new Set<string>();
  private nearTry = 0;
  private stationSeen: Station | null = null;
  private stationAt = 0;
  /** quando è partito (i comandi si spiegano appena la scena è pronta, prima dei passi) */
  private coachAt = 0;

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
    this.coachGo = false;
    this.coachAt = performance.now();
    this.coachPhase = this.coachAim = -1;
    this.coachTasks.clear();
    this.coachNearKeys.clear();
    this.coachStations.clear();
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
    // guida a schermo scuro: comandi, poi ogni fase e il primo gesto di ogni fase (il fumetto aspetta)
    const gd = this.game.ui?.guide;
    if (gd && (gd.active || this.coach(g, gd))) {
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

  /**
   * Passi obbligatori a schermo scuro (src/ui/guide.ts), una frase alla volta: la prima volta i comandi, poi a ogni
   * fase cosa fare (con l'oggetto acceso se si vede) e, arrivati davanti all'oggetto, dove toccare o tenere premuto.
   * Ritorna true se ha fatto partire un passo.
   */
  private coach(g: RunGuide, gd: Guide) {
    if (performance.now() - this.coachAt < 700) return false;
    const body = document.body.classList;
    const inp = this.game.input;
    const zone = (k: 'move' | 'look') => () => {
      const z = inp.fpZones()[k];
      return new DOMRect(z.x, z.y, z.w, z.h);
    };
    if (body.contains('fp-controls') && !gd.isSeen('job:controls')) {
      gd.show({ steps: [
        { rect: zone('move'), say: '🕹️ Trascina qui per camminare' },
        { rect: zone('look'), say: '👀 Trascina qui per guardarti attorno' },
        { at: '.jobbar', say: '📋 Qui vedi cosa fare e il tempo' },
        { at: '#j-pause', say: '⏸️ Pausa, o per rinunciare' },
      ] }, 'job:controls');
      return true;
    }
    if (body.contains('pedal-drive') && !gd.isSeen('job:pedals')) {
      gd.show({ steps: [
        { at: '.pd-gas', say: '⚡ Tieni premuto per accelerare' },
        { at: '.pd-brake', say: '🛑 Freno: tienilo per fermarti' },
        { at: '.pd-right', say: '↔️ Le frecce per girare' },
        { at: '.jobbar', say: '📋 Qui vedi cosa fare e il tempo' },
      ] }, 'job:pedals');
      return true;
    }
    // minigioco col dito aperto (impastatrice, forma…): i suoi passi, una volta per tipo
    const st = (this.run as { station?: Station | null } | null)?.station;
    if (st && !st.closed) {
      const name = st.constructor.name;
      if (this.coachStations.has(name)) return false;
      // un attimo per far arrivare la camera sulla postazione (la vasca dell'impastatrice), poi i passi
      if (this.stationSeen !== st) {
        this.stationSeen = st;
        this.stationAt = performance.now();
      }
      if (performance.now() - this.stationAt < 700) return false;
      const steps = st.guideSteps();
      if (!steps.length) return false;
      this.coachStations.add(name);
      gd.show({ steps });
      return true;
    }
    if (!g.arrived) {
      if (this.coachGo) return false;
      this.coachGo = true;
      gd.show({ steps: [{ say: '🚶 Prima vai alla zona di lavoro: segui la freccia' }] });
      return true;
    }
    const taskKey = g.task ? g.task.icon || g.task.label : '';
    if (g.phase !== this.coachPhase) {
      this.coachPhase = g.phase;
      if (taskKey) this.coachTasks.add(taskKey);
      // il nome della fase dice tutto il compito ("Taglia i cespugli"), il punto è solo il primo da fare
      const line = g.phaseName ? `${g.phaseIcon ? `${g.phaseIcon} ` : ''}${g.phaseName}` : `${g.task?.icon ? `${g.task.icon} ` : ''}${g.task?.label ?? ''}`;
      const obj = g.task?.obj ?? g.task?.hitObj;
      const rect = g.task ? this.screenRect(g.task.pos, obj) : null;
      const where = rect ? { rect: () => this.screenRect(g.task!.pos, obj) } : {};
      gd.show({ steps: [{ ...where, say: `🎓 Passo ${g.phase + 1} di ${g.phases}: ${line}` }] });
      return true;
    }
    // compito di un tipo nuovo dentro la stessa fase (farina → impastatrice → banco…): cosa fare ora
    if (g.task && taskKey && !this.coachTasks.has(taskKey)) {
      this.coachTasks.add(taskKey);
      const t = g.task;
      const obj = t.obj ?? t.hitObj;
      const where = this.screenRect(t.pos, obj) ? { rect: () => this.screenRect(t.pos, obj) } : {};
      gd.show({ steps: [{ ...where, say: `👉 Ora: ${t.icon ? `${t.icon} ` : ''}${t.label}` }] });
      return true;
    }
    if (g.task?.aim && g.near && this.coachAim !== g.phase) {
      const p = this.visibleAim(g.aims ?? []);
      if (!p) return false;
      this.coachAim = g.phase;
      const box = () => {
        const v = p.clone().project(this.game.activeCamera);
        const x = ((v.x + 1) / 2) * innerWidth;
        const y = ((1 - v.y) / 2) * innerHeight;
        return new DOMRect(x - 40, y - 40, 80, 80);
      };
      gd.show({ steps: [{ rect: box, say: `👆 Tieni il dito ${AIM_WHAT[this.type!]?.[g.phase] ?? 'sul punto acceso'}`, tap: true }] });
      return true;
    }
    if (g.task && !g.task.aim && g.near && !this.coachNearKeys.has(taskKey) && body.contains('act-ready')) {
      const fp = body.contains('fp-controls');
      const el = document.querySelector<HTMLElement>(fp ? '.action:not(.act-stand)' : '.act-zone');
      if (!el) return false;
      const hold = g.task.kind === 'hold';
      // la zona da toccare è un po' più grande dell'oggetto: si accende un punto che tocca davvero l'oggetto
      // si cerca il punto al massimo 3 volte al secondo (sono molti raggi)
      const now = performance.now();
      if (now - this.nearTry < 330) return false;
      this.nearTry = now;
      const er = el.getBoundingClientRect();
      const spot = fp ? this.hitSpot(er) : null;
      // in prima persona senza un punto buono (oggetto non ancora davanti): si riprova tra poco
      if (fp && !spot) return false;
      if (!fp && er.width < 3) return false;
      const rect = spot ? () => spot : () => el.getBoundingClientRect();
      this.coachNearKeys.add(taskKey);
      gd.show({ steps: [{ rect, say: hold ? '✊ Tieni premuto qui' : '👆 Tocca qui', tap: true }] });
      return true;
    }
    return false;
  }

  /** Dentro la zona da toccare, il punto più al centro che colpisce l'oggetto vero: un riquadro da dito attorno. */
  private hitSpot(r: DOMRect): DOMRect | null {
    const ui = this.game.ui;
    if (!ui || !r.width) return null;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best: [number, number] | null = null;
    let bd = Infinity;
    const N = 9;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = r.left + ((i + 0.5) / N) * r.width;
      const y = r.top + ((j + 0.5) / N) * r.height;
      const d = Math.hypot(x - cx, y - cy);
      // niente punti sotto i pulsanti o i riquadri del gioco (il tocco andrebbe a loro)
      const top = document.elementFromPoint(x, y);
      const free = !!top && (top.tagName === 'CANVAS' || top.classList.contains('action') || top.classList.contains('act-ring'));
      if (d < bd && free && ui.actionHit(x, y)) {
        bd = d;
        best = [x, y];
      }
    }
    if (!best) return null;
    const s = Math.min(90, r.width, r.height);
    return new DOMRect(best[0] - s / 2, best[1] - s / 2, s, s);
  }

  /** Riquadro sullo schermo dell'oggetto (o di un punto); null se non si vede. */
  private screenRect(pos: THREE.Vector3, obj?: THREE.Object3D): DOMRect | null {
    const cam = this.game.activeCamera;
    cam.updateMatrixWorld();
    const pts: THREE.Vector3[] = [];
    if (obj && obj.visible !== false) {
      const b = new THREE.Box3().setFromObject(obj);
      if (Number.isFinite(b.min.x)) for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(new THREE.Vector3(x, y, z));
    }
    if (!pts.length) pts.push(pos.clone().setY(pos.y + 0.4));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      const v = p.project(cam);
      if (v.z > 1) return null;
      const x = ((v.x + 1) / 2) * innerWidth;
      const y = ((1 - v.y) / 2) * innerHeight;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    // oggetto troppo grande sullo schermo (gruppo con tutta la postazione): si accende solo il punto da usare
    if (x1 - x0 > innerWidth * 0.45 || y1 - y0 > innerHeight * 0.35) {
      const v = pos.clone().setY(pos.y + 0.6).project(cam);
      if (v.z > 1) return null;
      x0 = x1 = ((v.x + 1) / 2) * innerWidth;
      y0 = y1 = ((1 - v.y) / 2) * innerHeight;
    }
    // almeno grande come un dito, e dentro lo schermo
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const w = Math.max(110, x1 - x0);
    const h = Math.max(110, y1 - y0);
    if (cx < 0 || cx > innerWidth || cy < 0 || cy > innerHeight) return null;
    return new DOMRect(cx - w / 2, cy - h / 2, w, h);
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
