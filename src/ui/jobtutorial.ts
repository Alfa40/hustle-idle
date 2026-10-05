import * as THREE from 'three';
import type { JobType } from '../config/jobs';
import type { Game } from '../game';
import type { JobRun } from '../minigames/jobs';
import { toast } from '../sim/bus';

/**
 * Tutorial contestuale dei lavoretti: la prima volta che fai un lavoretto (o quando lo scegli
 * nella scheda), un fumetto sopra il punto da raggiungere spiega cosa fare in quella fase,
 * e una manina sul pulsante giallo mostra il gesto (tocca / tieni premuto). Il tempo è fermo.
 */

/** Cosa fare in ogni fase, con il perché (null = si usa il punto da fare, es. lavapiatti). */
const TIPS: Record<JobType, string[] | null> = {
  giardino: [
    'Ti serve il <b>tosasiepi</b>: è nella <b>cassetta rossa</b>',
    'Taglia tutti i <b>cespugli</b> che si illuminano',
    'Le foglie tagliate sono cadute a terra: <b>raccogli ogni mucchio</b>',
    'Svuota il sacco di foglie nel <b>bidone verde</b>',
  ],
  consegna: [
    'Carica i <b>pacchi</b> dalla pila davanti al negozio',
    'Porta un pacco a ogni <b>cassetta gialla</b>: segui le frecce, l\'ordine lo scegli tu. Con un veicolo fai prima!',
    'Hai consegnato tutto: torna in negozio a <b>firmare la ricevuta</b>',
  ],
  volantini: [
    'Prendi i <b>volantini</b> dall\'espositore giallo',
    'Imbuca un volantino in ogni <b>cassetta blu</b> segnata: sono vicine, corri!',
    'Torna in negozio per la <b>ricevuta</b>',
  ],
  lavaggio: [
    'Prendi il <b>secchio</b> con la spugna',
    '<b>Insapona</b> tutti e 4 i lati dell\'auto',
    'Prendi la <b>canna dell\'acqua</b>',
    '<b>Risciacqua</b> tutti e 4 i lati',
  ],
  imbianchino: [
    'Prima proteggi le piante: <b>coprile con i teli</b>',
    'Prendi il <b>barattolo di vernice</b>',
    '<b>Dipingi</b> ogni tratto del muretto',
    'Lavoro finito: <b>togli i teli</b> dalle piante',
  ],
  piatti: null,
};

/** Per il lavapiatti: cosa vuol dire ogni punto (prendi → lava → appoggia, per ogni tavolo). */
const PIATTI: Record<string, string> = {
  'Prendi i piatti sporchi': 'Prendi i <b>piatti sporchi</b> dal tavolo',
  'Lava i piatti': 'Lavali al <b>lavello</b>',
  'Appoggia sullo scolapiatti': 'Appoggiali sullo <b>scolapiatti</b> ad asciugare',
};

export class JobTutorial {
  private type: JobType | null = null;
  private run: JobRun | null = null;
  private bubble: HTMLDivElement;
  private hand: HTMLDivElement;
  private key = '';

  constructor(private game: Game) {
    this.bubble = document.createElement('div');
    this.bubble.className = 'tut-bubble';
    this.hand = document.createElement('div');
    this.hand.className = 'tut-hand';
    document.body.append(this.bubble, this.hand);
    this.hide();
  }

  get active() {
    return !!this.run;
  }

  /** Il tutorial di questo lavoretto è già stato completato in questa partita. */
  isDone(type: JobType) {
    return (this.game.state.jobTutorials ?? []).includes(type);
  }

  start(type: JobType, run: JobRun) {
    this.type = type;
    this.run = run;
    run.frozen = true;
    this.key = '';
    toast('🎓 Tutorial: segui i fumetti, il tempo è fermo', 'info');
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
    this.key = '';
  }

  update() {
    const run = this.run;
    const g = run?.guide?.();
    if (!run || !g || !this.type || this.game.ui?.isOpen) {
      this.bubble.style.display = 'none';
      this.hand.style.display = 'none';
      return;
    }
    const head = `<div class="tut-head">🎓 Fase ${g.phase + 1} di ${g.phases}${g.left > 1 ? ` · ${g.left} da fare` : ''}</div>`;
    let body: string;
    let foot = '';
    let anchor: THREE.Vector3 | null = null;
    let gesture: 'tap' | 'hold' | null = null;
    const tips = TIPS[this.type];
    const tip = tips?.[g.phase] ?? (g.task ? PIATTI[g.task.label] ?? g.task.label : g.phaseName);
    if (!g.arrived) {
      body = '🚶 Segui le <b>frecce bianche</b> a terra fino alla <b>zona di lavoro</b> (quella con i coni)';
    } else if (!g.inZone) {
      body = '⚠️ Sei uscito dalla zona di lavoro: <b>torna dentro i coni</b>';
    } else if (g.task && !g.near) {
      body = tip;
      foot = '🚶 Avvicinati all\'oggetto che si illumina';
      anchor = g.task.pos;
    } else if (g.task) {
      body = tip;
      gesture = g.task.kind;
      foot = gesture === 'hold' ? '✊ <b>Tieni premuto</b> il pulsante giallo finché la barra è piena' : '👆 <b>Tocca</b> il pulsante giallo';
      anchor = g.task.pos;
    } else {
      body = tip;
    }
    const html = head + `<div class="tut-body">${body}</div>` + (foot ? `<div class="tut-foot">${foot}</div>` : '');
    if (html !== this.key) {
      this.key = html;
      this.bubble.innerHTML = html;
    }
    this.bubble.style.display = '';
    this.place(anchor);
    this.placeHand(gesture);
  }

  /** Il fumetto sta subito sotto il riquadro del lavoretto (in alto a sinistra), largo uguale. */
  private place(_anchor: THREE.Vector3 | null) {
    const bar = document.querySelector('.jobbar') as HTMLElement | null;
    const b = this.bubble;
    if (!bar) return;
    const r = bar.getBoundingClientRect();
    b.style.left = `${r.left}px`;
    b.style.top = `${r.bottom + 6}px`;
    b.style.width = `${r.width}px`;
  }

  /** Manina che mostra il gesto sopra il pulsante giallo. */
  private placeHand(gesture: 'tap' | 'hold' | null) {
    const act = document.querySelector('.action') as HTMLElement | null;
    if (!gesture || !act || getComputedStyle(act).display === 'none') {
      this.hand.style.display = 'none';
      return;
    }
    const r = act.getBoundingClientRect();
    this.hand.style.display = '';
    // sul bordo in basso a destra del pulsante: la scritta resta leggibile e non copre Sali/Scendi
    this.hand.style.left = `${r.right - r.width * 0.32}px`;
    this.hand.style.top = `${r.top + r.height * 0.6}px`;
    this.hand.className = `tut-hand ${gesture}`;
    this.hand.textContent = gesture === 'hold' ? '✊' : '👆';
  }
}
