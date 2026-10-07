import * as THREE from 'three';
import type { JobType } from '../config/jobs';
import type { Game } from '../game';
import type { JobRun } from '../minigames/jobs';
import { toast } from '../sim/bus';
import { actSide } from '../settings';

/**
 * Tutorial contestuale dei lavoretti: la prima volta che fai un lavoretto (o quando lo scegli
 * nella scheda), un fumetto sopra il punto da raggiungere spiega cosa fare in quella fase,
 * e una manina sull'oggetto da usare mostra il gesto (tocca / tieni premuto). Il tempo è fermo.
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
    'Ritira i <b>pacchi</b> al <b>negozio dei pacchi</b> (insegna rossa)',
    'Porta un pacco a ogni <b>cassetta gialla</b>: segui le frecce, l\'ordine lo scegli tu. Con un veicolo fai prima!',
    'Hai consegnato tutto: torna al negozio a <b>firmare la ricevuta</b>',
  ],
  volantini: [
    'Prendi i <b>giornali</b> all\'<b>edicola</b> (il chiosco verde)',
    'Imbuca un giornale in ogni <b>cassetta blu</b> segnata: sono vicine, corri!',
    'Torna all\'edicola per la <b>ricevuta</b>',
  ],
  lavaggio: [
    'Prendi lo <b>spruzzino del sapone</b> (la tanica rosa)',
    'Sull\'auto ci sono <b>macchie di sporco</b>: insaponale tutte (anche sul muso, sulla coda e sul tetto: girale attorno)',
    'Prendi la <b>canna dell\'acqua</b> dall\'avvolgitubo verde',
    '<b>Sciacqua</b> via la schiuma da ogni punto',
    'Prendi lo <b>straccio</b> dal secchio blu',
    '<b>Asciuga</b> le gocce finché l\'auto brilla',
  ],
  imbianchino: [
    'Prima proteggi il giardino: copri ogni cosa (cespugli, aiuole, giochi…) con un <b>telone</b>',
    'Prendi la <b>vernice</b> (i barattoli vicino al cancello)',
    '<b>Dipingi</b> ogni tratto del muretto di recinzione',
    'Lavoro finito: <b>togli i teloni</b>',
  ],
  piatti: null,
};

/** Per il lavapiatti: cosa vuol dire ogni punto (prendi → lava → appoggia, per ogni tavolo). */
const PIATTI: Record<string, string> = {
  'Entra in cucina': 'Vai al <b>ristorante</b> (ha chiuso) ed <b>entra in cucina</b>',
  'Prendi i piatti sporchi': 'Prendi una pila di <b>piatti sporchi</b> dal carrello',
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
    document.body.classList.remove('tut-pointing');
    this.key = '';
  }

  update() {
    const run = this.run;
    const g = run?.guide?.();
    if (!run || !g || !this.type || this.game.ui?.isOpen) {
      this.bubble.style.display = 'none';
      this.hand.style.display = 'none';
      document.body.classList.remove('tut-pointing');
      return;
    }
    // lavapiatti: in cucina le "fasi" sono le pile di piatti
    const word = g.phaseName.startsWith('Pila') ? 'Pila' : 'Fase';
    const head = `<div class="tut-head">🎓 ${word} ${g.phase + 1} di ${g.phases}${g.left > 1 ? ` · ${g.left} da fare` : ''}</div>`;
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
    } else if (g.task?.aim) {
      // punti da toccare direttamente sull'oggetto (macchie sull'auto)
      body = tip;
      foot = '👆 <b>Tocca col dito le macchie</b> sull\'auto e tienilo lì (puoi anche passarci sopra) finché spariscono';
      anchor = g.task.pos;
    } else if (g.task) {
      body = tip;
      gesture = g.task.kind;
      foot = gesture === 'hold' ? `✊ <b>Tieni il dito sulla metà ${actSide()}</b> dello schermo finché il cerchio si riempie` : `👆 <b>Tocca la metà ${actSide()}</b> dello schermo`;
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

  /** Manina sull'oggetto da usare (l'anello che lampeggia): tocca o tieni premuto. */
  private placeHand(gesture: 'tap' | 'hold' | null) {
    placeTutHand(this.hand, gesture);
  }
}


/**
 * Manina grande del tutorial sull'oggetto da usare: il dito tocca il centro dell'anello che
 * lampeggia (la scritta dell'anello passa sopra, così la manina non la copre).
 */
export function placeTutHand(hand: HTMLElement, gesture: 'tap' | 'hold' | null) {
  // la manina indica l'area delle azioni (la metà dello schermo senza joystick), quando c'è un'azione
  const act = document.querySelector('.act-zone') as HTMLElement | null;
  const show = !!gesture && !!act && document.body.classList.contains('act-ready');
  document.body.classList.toggle('tut-pointing', show);
  if (!show) {
    hand.style.display = 'none';
    return;
  }
  const r = act!.getBoundingClientRect();
  const size = hand.offsetHeight || 70;
  hand.style.display = '';
  // la punta del dito (in alto, un po' a sinistra del disegno) sul centro dell'anello
  // nella parte bassa dell'area, dove arriva il pollice
  hand.style.left = `${r.left + r.width / 2 - size * 0.42}px`;
  hand.style.top = `${r.top + r.height * 0.72 - size * 0.06}px`;
  hand.className = `tut-hand ${gesture}`;
  hand.textContent = gesture === 'hold' ? '✊' : '👆';
}
