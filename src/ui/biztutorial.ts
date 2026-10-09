import type { BusinessType } from '../config/business';
import { bizType } from '../config/business';
import type { StationDef, StationKind } from '../config/recipes';
import type { Game } from '../game';
import { placeTutHand } from './jobtutorial';
import { actSide, moveSide } from '../settings';

/**
 * Tutorial contestuale della cucina: la prima volta che entri in un tipo di attività
 * (food truck, panificio) un fumetto ti guida nel primo ordine, postazione
 * per postazione, poi spiega ripiano, calore e dipendenti. Il tempo è fermo ed è solo
 * una prova; visto una volta, non si ripropone per le altre attività dello stesso tipo.
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

/** Colore e nome della fase di ogni tipo di postazione (gli stessi dei tappetini). */
const PHASE: Partial<Record<StationKind, string>> = {
  source: '<b style="color:#2d9cdb">🔵 blu</b>',
  timed: '<b style="color:#f06a0f">🟠 arancione</b>',
  hold: '<b style="color:#8e5bd6">🟣 viola</b>',
  counter: '<b style="color:#2fae5e">🟢 verde</b>',
};

export class KitchenTutorial {
  private el: HTMLDivElement;
  private hand: HTMLDivElement;
  private key = '';

  constructor(
    private game: Game,
    private type: BusinessType,
    /** riquadro "in mano": il fumetto sta subito sotto */
    private anchor: () => HTMLElement | null,
    onAction: (a: 'next' | 'skip') => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'tut-bubble biz-tut';
    this.el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-t]')?.getAttribute('data-t');
      if (a === 'next' || a === 'skip') onAction(a);
    });
    this.hand = document.createElement('div');
    this.hand.className = 'tut-hand';
    this.hand.style.display = 'none';
    document.body.classList.remove('tut-pointing');
    document.body.append(this.el, this.hand);
  }

  remove() {
    this.el.remove();
    this.hand.remove();
    document.body.classList.remove('tut-pointing');
  }

  update(t: TutStep) {
    if (this.game.ui?.isOpen) {
      this.el.style.display = 'none';
      this.hand.style.display = 'none';
      document.body.classList.remove('tut-pointing');
      return;
    }
    this.el.style.display = '';
    const def = bizType(this.type);
    const prod = t.one;
    const st = t.station;
    const at = st ? `<b>${st.icon} ${st.name}</b>` : '';
    const skip = '<button class="tut-skip" data-t="skip">Salta</button>';
    let head = '';
    let body = '';
    let foot = '';
    let btn = '';
    let gesture: 'tap' | 'hold' | null = null;
    if (t.stage === 'intro') {
      head = `🎓 Benvenuto nel tuo ${def.name}!`;
      body = `Il primo cliente ha ordinato: <b>${prod}</b>. Lo prepariamo insieme!<br>
        Ogni prodotto passa da più <b>postazioni</b>, e il colore del tappetino dice cosa si fa lì:
        <div class="tut-legend"><span>🔵 Prendi</span><span>🟠 Cuoci</span><span>🟣 Prepara</span><span>🟢 Servi</span></div>`;
      foot = '⏸️ Il tempo è fermo: è solo una prova, prenditi il tempo che vuoi';
      btn = '<button class="btn sm good" data-t="next">Iniziamo ▶</button>';
    } else if (t.stage === 'play') {
      head = `🎓 Il primo ordine · ${prod}`;
      switch (t.status) {
        case 'get':
          body = `Prendi gli ingredienti: ${at}. Le postazioni ${PHASE.source} servono a <b>prendere</b>`;
          break;
        case 'put':
          body = `Metti a cuocere: ${at} (${PHASE.timed}). Puoi metterci più prodotti insieme`;
          break;
        case 'wait':
          body = `Sta cuocendo (${at}): guarda la <b>barra</b> sopra. Quando diventa <b>verde</b> è pronto; di solito, se lo lasci troppo, diventa rossa e <b>brucia</b> (nella prova no)`;
          break;
        case 'take':
          body = `✅ È pronto! <b>Toglilo dal fuoco</b>: ${at}`;
          break;
        case 'work':
          body = `Ora <b>${st?.verb.toLowerCase()}</b>: ${at} (${PHASE.hold}): qui si lavora <b>tenendo premuto</b>`;
          break;
        case 'serve':
          body = `${prod} pronto! Portalo al cliente: <b>${t.counter.icon} ${t.counter.name}</b> (${PHASE.counter})`;
          break;
        case 'bin':
          body = `Butta quello che hai in mano: ${at}`;
          break;
        case 'pass':
          body = `Usa il ripiano dei pronti: ${at}`;
          break;
        default:
          body = 'Un momento…';
      }
      if (t.status === 'wait') foot = '⏳ Aspetta qui vicino';
      else if (!t.near) foot = `🚶 Trascina il dito nella metà ${moveSide()} dello schermo per muoverti e segui l'<b>anello colorato</b>`;
      else if (t.status === 'work') {
        gesture = 'hold';
        foot = `✊ <b>Tieni il dito sulla metà ${actSide()}</b> dello schermo finché il cerchio si riempie`;
      } else {
        gesture = 'tap';
        foot = `👆 <b>Tocca la metà ${actSide()}</b> dello schermo`;
      }
    } else if (t.stage === 'tips') {
      head = '🎉 Cliente servito!';
      body = `Due cose da sapere:
        <ul><li>🍽️ Quando non ci sono clienti puoi <b>preparare in anticipo</b> e appoggiare i prodotti sul <b>ripiano dei pronti</b>: dal bancone li servi subito.</li>
        <li>🌡️ Un prodotto pronto resta caldo <b>45 secondi</b>, poi è ❄️ freddo e va buttato nel 🗑️ <b>cestino</b>.</li></ul>`;
      btn = '<button class="btn sm good" data-t="next">Avanti ▶</button>';
    } else {
      head = '👥 Fatti aiutare';
      body = `<ul><li>Assumi <b>dipendenti</b> (pulsante Attività → 👥 Personale): i cuochi preparano, i cassieri servono. Con un <b>manager</b> l'attività lavora anche senza di te.</li>
        <li>In ⬆️ <b>Migliorie</b> puoi provare fuochi, banchi e ampliamenti con <b>👁️ Prova</b> prima di comprarli.</li></ul>
        Ora si apre davvero: servi i clienti prima che perdano la pazienza!`;
      btn = '<button class="btn sm good" data-t="next">Inizia a lavorare ✅</button>';
    }
    const html = `<div class="tut-head"><span>${head}</span>${t.stage === 'go' ? '' : skip}</div><div class="tut-body">${body}</div>` +
      (foot ? `<div class="tut-foot">${foot}</div>` : '') + (btn ? `<div class="tut-btns">${btn}</div>` : '');
    if (html !== this.key) {
      this.key = html;
      this.el.innerHTML = html;
    }
    this.place();
    this.placeHand(gesture);
  }

  /** Subito sotto il riquadro "in mano", largo uguale. */
  private place() {
    const a = this.anchor();
    if (!a) return;
    const r = a.getBoundingClientRect();
    this.el.style.left = `${r.left}px`;
    this.el.style.top = `${r.bottom + 6}px`;
    this.el.style.width = `${r.width}px`;
  }

  /** Manina sull'oggetto da usare (l'anello che lampeggia): tocca o tieni premuto. */
  private placeHand(gesture: 'tap' | 'hold' | null) {
    placeTutHand(this.hand, gesture);
  }
}
