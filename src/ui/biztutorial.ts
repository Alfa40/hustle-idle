import type { BusinessType } from '../config/business';
import { bizType } from '../config/business';
import type { StationDef, StationKind } from '../config/recipes';
import type { Game } from '../game';
import { placeTutHand } from './jobtutorial';
import { moveSide } from '../settings';

/**
 * Tutorial contestuale della cucina: la prima volta che entri in un tipo di attività
 * (food truck, panificio) un fumetto ti guida nel primo ordine, postazione
 * per postazione, poi spiega ripiano, calore e dipendenti. Il tempo è fermo ed è solo
 * una prova; è obbligatorio (non si salta) e, visto una volta, non si ripropone per le altre attività dello stesso tipo.
 */

export interface TutStep {
  /** intro → play (il primo ordine) → tips → go (si apre davvero) */
  stage: 'intro' | 'play' | 'tips' | 'go';
  /** il prodotto dell'ordine, al singolare con l'icona ("🥪 Panino") */
  one: string;
  counter: StationDef;
  /** cosa fare alla prossima postazione */
  status: 'get' | 'put' | 'wait' | 'take' | 'work' | 'serve' | 'pass' | 'bin' | 'idle';
  station: StationDef | null;
  /** il giocatore è già lì (sull'oggetto compare l'anello da toccare) */
  near: boolean;
}

/** Pallino del colore della fase (gli stessi dei tappetini). */
const DOT: Partial<Record<StationKind, string>> = { source: '🔵', timed: '🟠', hold: '🟣', counter: '🟢' };

/** I consigli dopo il primo cliente e prima di aprire: uno per volta. */
const TIPS: { stage: 'tips' | 'go'; head: string; line: string; long: string }[] = [
  { stage: 'tips', head: '🎉 Cliente servito!', line: '🍽️ Senza clienti prepara in anticipo: metti sul ripiano dei pronti', long: 'Quando non ci sono clienti puoi <b>preparare in anticipo</b> e appoggiare i prodotti sul <b>ripiano dei pronti</b>: dal bancone li servi subito.' },
  { stage: 'tips', head: '🌡️ Caldo e freddo', line: '🌡️ Un prodotto resta caldo 45 s, poi va nel 🗑️ cestino', long: 'Un prodotto pronto resta caldo <b>45 secondi</b>, poi è ❄️ freddo e va buttato nel 🗑️ <b>cestino</b>.' },
  { stage: 'go', head: '👥 Fatti aiutare', line: '👥 Assumi personale: Attività → resoconto → Personale', long: 'Assumi <b>dipendenti</b> (Attività → Le mie → tocca l\'attività → 👥 Personale accanto ai turni): i cuochi preparano, i cassieri servono. Con un <b>manager</b> l\'attività lavora anche senza di te. In ⬆️ <b>Migliorie</b> puoi provare fuochi e banchi con <b>👁️ Prova</b> prima di comprarli.' },
];

export class KitchenTutorial {
  private el: HTMLDivElement;
  private hand: HTMLDivElement;
  /** manina che mostra come camminare */
  private walk: HTMLDivElement;
  private key = '';
  /** spiegazione lunga aperta col "?" */
  private open = false;
  private stepKey = '';
  /** consiglio di adesso (dentro le fasi tips/go) */
  private tip = 0;
  private stage: TutStep['stage'] = 'intro';
  private still = 0;
  private last = 0;

  constructor(
    private game: Game,
    private type: BusinessType,
    /** riquadro "in mano": il fumetto sta subito sotto */
    private anchor: () => HTMLElement | null,
    onAction: (a: 'next' | 'skip') => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'tut-bubble tut-mini biz-tut';
    this.el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-t]')?.getAttribute('data-t');
      if (a === 'more') {
        this.open = !this.open;
        this.key = '';
        return;
      }
      if (a === 'next' && (this.stage === 'tips' || this.stage === 'go')) {
        // i consigli uno alla volta: si passa alla fase dopo solo dopo l'ultimo della fase
        const cur = TIPS[this.tip];
        const nxt = TIPS[this.tip + 1];
        if (cur && nxt && nxt.stage === cur.stage) {
          this.tip++;
          this.key = '';
          return;
        }
        if (cur) this.tip++;
      }
      if (a === 'next' || a === 'skip') onAction(a);
    });
    this.hand = document.createElement('div');
    this.hand.className = 'tut-hand';
    this.hand.style.display = 'none';
    this.walk = document.createElement('div');
    this.walk.className = 'tut-hand tut-walk';
    this.walk.textContent = '👆';
    this.walk.style.display = 'none';
    document.body.classList.remove('tut-pointing');
    document.body.append(this.el, this.hand, this.walk);
  }

  remove() {
    this.el.remove();
    this.hand.remove();
    this.walk.remove();
    document.body.classList.remove('tut-pointing');
  }

  update(t: TutStep) {
    if (this.game.ui?.isOpen) {
      this.el.style.display = 'none';
      this.hand.style.display = 'none';
      this.walk.style.display = 'none';
      document.body.classList.remove('tut-pointing');
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    this.el.style.display = '';
    this.stage = t.stage;
    const def = bizType(this.type);
    const prod = t.one;
    const st = t.station;
    const at = st ? `${st.icon} ${st.name}` : '';
    const dot = st ? `${DOT[st.kind] ?? ''} ` : '';
    let line = '';
    let long = '';
    let btn = '';
    let gesture: 'tap' | 'hold' | null = null;
    if (t.stage === 'intro') {
      line = `🎓 ${def.name}: prepariamo il primo ordine, ${prod}`;
      long = 'Ogni prodotto passa da più <b>postazioni</b>: il colore del tappetino dice cosa si fa lì (🔵 prendi, 🟠 cuoci, 🟣 prepara, 🟢 servi). Il tempo è fermo: è solo una prova.';
      btn = '<button class="btn sm good" data-t="next">Iniziamo ▶</button>';
    } else if (t.stage === 'play') {
      // un passo alla volta, col pallino del colore della postazione
      switch (t.status) {
        case 'get':
          line = `${dot}Prendi: ${at}`;
          long = 'Le postazioni <b>🔵 blu</b> servono a <b>prendere</b> gli ingredienti.';
          break;
        case 'put':
          line = `${dot}Metti a cuocere: ${at}`;
          long = 'Le postazioni <b>🟠 arancioni</b> cuociono: puoi metterci più prodotti insieme.';
          break;
        case 'wait':
          line = `⏳ Cuoce: aspetta che la barra diventi verde`;
          long = 'Guarda la <b>barra</b> sopra la postazione: quando è <b>verde</b> è pronto; se lo lasci troppo diventa rossa e <b>brucia</b> (nella prova no).';
          break;
        case 'take':
          line = `✅ Pronto! Toglilo: ${at}`;
          break;
        case 'work':
          line = `${dot}${st?.verb ?? 'Prepara'}: ${at}`;
          long = 'Le postazioni <b>🟣 viola</b> si usano <b>tenendo premuto</b> finché il cerchio si riempie.';
          break;
        case 'serve':
          line = `${DOT.counter} Servi: ${t.counter.icon} ${t.counter.name}`;
          long = `${prod} è pronto: portalo al cliente al bancone (<b>🟢 verde</b>).`;
          break;
        case 'bin':
          line = `🗑️ Butta: ${at}`;
          break;
        case 'pass':
          line = `🍽️ Sul ripiano dei pronti: ${at}`;
          break;
        default:
          line = '⏳ Un momento…';
      }
      if (t.near && t.status !== 'wait') gesture = t.status === 'work' ? 'hold' : 'tap';
    } else {
      // consigli: uno per volta
      const tip = TIPS[Math.min(this.tip, TIPS.length - 1)];
      line = tip.line;
      long = tip.long;
      btn = `<button class="btn sm good" data-t="next">${t.stage === 'go' && !TIPS[this.tip + 1] ? 'Inizia a lavorare ✅' : 'Avanti ▶'}</button>`;
    }
    const step = `${t.stage}|${line}`;
    if (step !== this.stepKey) {
      this.stepKey = step;
      this.open = false;
    }
    // obbligatorio: niente "Salta"
    const skip = '';
    const more = long ? `<button class="tut-more" data-t="more" aria-label="Spiegazione">${this.open ? '✕' : '?'}</button>` : '';
    const html = `<div class="tut-row"><span class="tut-line">${line}</span>${more}</div>` +
      (this.open ? `<div class="tut-long">${long}</div>` : '') +
      (btn || skip ? `<div class="tut-btns">${skip}${btn}</div>` : '');
    if (html !== this.key) {
      this.key = html;
      this.el.innerHTML = html;
    }
    this.place();
    this.placeHand(gesture);
    // lontano dalla postazione e fermo: la manina mostra come camminare
    const moving = Math.hypot(this.game.input.vector.x, this.game.input.vector.y) > 0.1;
    const far = t.stage === 'play' && !t.near && t.status !== 'wait';
    this.still = far && !moving ? this.still + dt : 0;
    this.placeWalk(this.still > 1.5);
  }

  /** Manina nella metà dello schermo per camminare: trascina verso dove vuoi andare. */
  private placeWalk(on: boolean) {
    if (!on) {
      this.walk.style.display = 'none';
      return;
    }
    const left = moveSide() === 'sinistra';
    this.walk.style.display = '';
    this.walk.style.left = `${innerWidth * (left ? 0.22 : 0.78) - 28}px`;
    this.walk.style.top = `${innerHeight * 0.74}px`;
  }

  /** Subito sotto il riquadro "in mano", largo uguale. */
  private place() {
    const a = this.anchor();
    if (!a) return;
    const r = a.getBoundingClientRect();
    this.el.style.left = `${r.left}px`;
    this.el.style.top = `${r.bottom + 6}px`;
    this.el.style.maxWidth = `${r.width}px`;
  }

  /** Manina sull'oggetto da usare (l'anello che lampeggia): tocca o tieni premuto. */
  private placeHand(gesture: 'tap' | 'hold' | null) {
    placeTutHand(this.hand, gesture);
  }
}
