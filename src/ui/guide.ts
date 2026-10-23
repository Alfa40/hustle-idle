import type { Game } from '../game';

/**
 * Guida obbligatoria (tutorial a passi): lo schermo si scurisce e resta acceso solo il punto di cui si parla,
 * con una manina sopra e una frase corta. Un passo alla volta:
 * - `tap`: il giocatore deve toccare proprio quel punto (il tocco arriva al gioco come sempre);
 * - altrimenti si legge e si tocca "Ok ▶".
 * Non si salta: fuori dal punto acceso il tocco non fa nulla. Se il punto non c'è (finestra cambiata, tasto
 * nascosto) il passo si salta da solo dopo poco, così la guida non blocca mai il gioco.
 * Ogni guida si vede una volta per partita (`state.guides`). Le guide sono in `guides.ts`.
 */

export interface GuideStep {
  /** selettore CSS del punto da accendere (il primo visibile); niente = frase al centro */
  at?: string;
  /** oppure un riquadro calcolato (es. la metà dello schermo per camminare) */
  rect?: () => DOMRect | null;
  /** la frase: corta, una cosa sola */
  say: string;
  /** bisogna toccare il punto per andare avanti */
  tap?: boolean;
  /** il passo c'è solo se vale (si guarda quando tocca a lui) */
  if?: () => boolean;
}

export interface GuideDef {
  steps: GuideStep[];
  /** altre guide che questa spiega già (non si ripropongono) */
  covers?: string[];
  /** la guida parte solo se vale (se no si riprova la volta dopo) */
  when?: () => boolean;
  /** guide di sblocco: partono da sole quando vale (a gioco libero, nessuna finestra aperta) */
  auto?: () => boolean;
  /** a guida finita */
  done?: () => void;
}

/** dopo quanto un punto che non c'è fa saltare il passo: subito dopo un tocco si aspetta che il gioco ridisegni */
const MISSING_SKIP = 120;
const MISSING_AFTER_TAP = 900;
/** margine attorno al punto acceso */
const PAD = 6;

export class Guide {
  private queue: string[] = [];
  private id: string | null = null;
  private steps: GuideStep[] = [];
  private i = 0;
  private el: HTMLDivElement;
  private blocks: HTMLDivElement[] = [];
  private ring: HTMLDivElement;
  private hand: HTMLDivElement;
  private bubble: HTMLDivElement;
  private raf = 0;
  /** da quando il punto del passo di adesso non si trova */
  private missingSince = 0;
  /** il punto è già stato portato in vista (una volta per passo) */
  private scrolled = false;
  private stepKey = '';
  private onDone: (() => void) | null = null;
  /** il passo prima era un tocco (la finestra può star cambiando) */
  private afterTap = false;
  /** passi davvero mostrati (una guida senza nessun passo mostrato non conta come vista) */
  private shown = 0;
  private shownStep = -1;

  constructor(private game: Game, private defs: Record<string, GuideDef>) {
    this.el = document.createElement('div');
    this.el.className = 'gd';
    for (let k = 0; k < 4; k++) {
      const b = document.createElement('div');
      b.className = 'gd-block';
      // il tocco fuori dal punto acceso non arriva al gioco
      for (const t of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchmove', 'touchend', 'wheel'] as const) {
        b.addEventListener(t, (e) => {
          e.stopPropagation();
          if (t !== 'wheel' && t !== 'touchmove') e.preventDefault();
          if (t === 'pointerdown') this.nudge();
        }, { passive: false });
      }
      this.blocks.push(b);
    }
    this.ring = document.createElement('div');
    this.ring.className = 'gd-ring';
    this.hand = document.createElement('div');
    this.hand.className = 'tut-hand tap gd-hand';
    this.hand.textContent = '👆';
    this.bubble = document.createElement('div');
    this.bubble.className = 'gd-bubble';
    this.bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      if ((e.target as HTMLElement).closest('[data-g="ok"]')) this.next();
    });
    for (const t of ['pointerdown', 'touchstart'] as const) this.bubble.addEventListener(t, (e) => e.stopPropagation());
    this.el.append(...this.blocks, this.ring, this.hand, this.bubble);
    // tocco sul punto acceso (passi `tap`): il gioco lo riceve normalmente, la guida va avanti
    window.addEventListener('click', (e) => this.tapped(e), true);
    // nei lavoretti il tocco sull'oggetto parte col dito giù (anche "tieni premuto"): si va avanti subito
    window.addEventListener('pointerdown', (e) => this.pressed(e), true);
  }

  get active() {
    return !!this.id;
  }

  /** la guida in corso (null se nessuna) */
  get current() {
    return this.id;
  }

  private get seen(): string[] {
    return this.game.state.guides ?? (this.game.state.guides = []);
  }

  isSeen(id: string) {
    return this.seen.includes(id);
  }

  has(id: string) {
    return !!this.defs[id];
  }

  /** Prova a far partire una guida (se c'è, vale e non è già stata vista). `onDone` quando è finita. */
  trigger(id: string, onDone?: () => void) {
    const def = this.defs[id];
    if (!def || this.off || this.isSeen(id) || this.id === id || this.queue.includes(id)) return false;
    if (def.when && !def.when()) return false;
    if (this.id) {
      this.queue.push(id);
      return true;
    }
    this.start(id, onDone);
    return true;
  }

  /** Tutte le guide di una cosa: `key` e le sue varianti `key#…`. */
  triggerAll(key: string) {
    for (const id of Object.keys(this.defs)) if (id === key || id.startsWith(`${key}#`)) this.trigger(id);
  }

  /** Guide di sblocco: la prima che vale parte (chiamata quando il gioco è libero). */
  checkUnlocks() {
    if (this.id || this.off) return;
    for (const [id, def] of Object.entries(this.defs)) {
      if (def.auto && !this.isSeen(id) && def.auto()) {
        this.trigger(id);
        return;
      }
    }
  }

  /** Partita vecchia, senza guide: gli sblocchi già raggiunti non si ripropongono. */
  skipReachedUnlocks() {
    if (this.game.state.guides) return;
    const reached = Object.entries(this.defs).filter(([id, d]) => d.auto && id !== 'start' && d.auto()).map(([id]) => id);
    this.game.state.guides = reached;
  }

  /** guide spente (anteprime di una proposta con "Gioca subito") */
  /** il gioco era già fermo per conto suo (finestra o mappa aperta) */
  private pausedBefore() {
    return !!this.game.ui?.isOpen || !!document.querySelector('.mapscreen');
  }

  private get off() {
    return !!this.game.state.guidesOff;
  }

  private oneOff = 0;
  /**
   * Guida fatta al momento (es. il passo di un lavoretto). Con `id` si vede una volta per partita; senza, ogni volta
   * che la si chiede. Se un'altra guida è aperta aspetta il suo turno.
   */
  show(def: GuideDef, id?: string) {
    const key = id ?? `~${++this.oneOff}`;
    if (id && this.isSeen(id)) return;
    this.defs[key] = def;
    this.trigger(key);
  }

  /** Rivede tutte le guide (Opzioni → developer). */
  reset() {
    this.game.state.guides = [];
  }

  private start(id: string, onDone?: () => void) {
    const def = this.defs[id];
    this.id = id;
    this.steps = def.steps;
    this.i = -1;
    this.shown = 0;
    this.shownStep = -1;
    this.afterTap = false;
    this.onDone = onDone ?? null;
    document.body.appendChild(this.el);
    document.body.classList.add('gd-on');
    this.game.input.cancel();
    this.next();
    cancelAnimationFrame(this.raf);
    const loop = () => {
      if (!this.id) return;
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private next(tapped = false) {
    this.afterTap = tapped;
    // il prossimo passo che vale
    do this.i++;
    while (this.i < this.steps.length && this.steps[this.i].if && !this.steps[this.i].if!());
    this.missingSince = 0;
    this.scrolled = false;
    this.stepKey = '';
    if (this.i >= this.steps.length) this.finish();
  }

  private finish() {
    const id = this.id!;
    const def = this.defs[id];
    // nessun passo si è visto (la finestra non era quella giusta): si riproverà la volta dopo
    if (id.startsWith('~')) {
      // guida del momento: non si ricorda
      delete this.defs[id];
      def.done?.();
    } else if (this.shown) {
      this.game.state.guides = [...new Set([...this.seen, id, ...(def.covers ?? [])])];
      def.done?.();
      this.game.save();
    }
    this.id = null;
    this.el.remove();
    document.body.classList.remove('gd-on');
    cancelAnimationFrame(this.raf);
    // il gioco riparte (se non c'è una finestra aperta)
    this.game.paused = this.pausedBefore();
    const done = this.onDone;
    this.onDone = null;
    done?.();
    // la prossima in attesa (se nel frattempo non è già stata spiegata)
    while (this.queue.length) {
      const q = this.queue.shift()!;
      if (!this.isSeen(q)) {
        this.start(q);
        return;
      }
    }
  }

  /** Il punto del passo di adesso (il primo visibile tra quelli del selettore). */
  private target(st: GuideStep): { el: HTMLElement | null; r: DOMRect } | null {
    if (st.rect) {
      const r = st.rect();
      return r ? { el: null, r } : null;
    }
    if (!st.at) return null;
    for (const el of document.querySelectorAll<HTMLElement>(st.at)) {
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden') return { el, r };
    }
    return null;
  }

  private tapped(e: MouseEvent) {
    if (!this.id) return;
    const st = this.steps[this.i];
    if (!st?.tap || !st.at) return;
    const t = this.target(st);
    if (t?.el && t.el.contains(e.target as Node)) {
      // il tocco va al gioco; si passa al passo dopo appena il gioco ha ridisegnato
      setTimeout(() => this.id && this.steps[this.i] === st && this.next(true), 0);
    }
  }

  /** Dito giù dentro il punto acceso di un passo `tap` con un riquadro (oggetto del lavoretto). */
  private pressed(e: PointerEvent) {
    if (!this.id) return;
    const st = this.steps[this.i];
    if (!st?.tap || !st.rect) return;
    const r = st.rect();
    if (!r || e.clientX < r.left - PAD || e.clientX > r.right + PAD || e.clientY < r.top - PAD || e.clientY > r.bottom + PAD) return;
    // subito, prima che il tocco arrivi al gioco: così il gioco è già ripartito e fa l'azione
    this.next(true);
  }

  /** Tocco nel punto sbagliato: la manina e il fumetto saltellano per farsi notare. */
  private nudge() {
    for (const el of [this.bubble, this.hand]) {
      el.classList.remove('gd-nudge');
      void el.offsetWidth;
      el.classList.add('gd-nudge');
    }
  }

  private frame() {
    const st = this.steps[this.i];
    if (!st) return;
    // finché la guida è aperta il gioco resta fermo
    this.game.paused = true;
    const W = innerWidth;
    const H = innerHeight;
    const centered = !st.at && !st.rect;
    let t = centered ? null : this.target(st);
    const now = performance.now();
    if (!centered && !t) {
      // il punto non c'è (ancora): schermo scuro e si aspetta un attimo, poi si salta il passo
      if (!this.missingSince) this.missingSince = now;
      if (now - this.missingSince > (this.afterTap || this.i === 0 ? MISSING_AFTER_TAP : MISSING_SKIP)) {
        this.next();
        return;
      }
      this.layout(null, W, H, st, true);
      return;
    }
    this.missingSince = 0;
    if (this.shownStep !== this.i) {
      this.shownStep = this.i;
      this.shown++;
    }
    // dentro una finestra che scorre: si porta il punto in vista
    if (t?.el && !this.scrolled) {
      this.scrolled = true;
      const r = t.r;
      // coperto da qualcosa che resta fisso (es. il pulsante in fondo alla finestra): si porta al centro anche lui
      // (si salta lo strato della guida, che copre tutto il resto dello schermo)
      const top = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find((x) => !x.closest('.gd, .gd-bubble, .gd-ring') && x !== this.hand);
      const covered = !!top && !t.el.contains(top) && !!top.closest('.modal');
      if (r.top < 60 || r.bottom > H - 20 || r.left < 0 || r.right > W || covered) {
        // anche di lato (schede che scorrono)
        t.el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
        t = this.target(st);
      }
    }
    this.layout(t?.r ?? null, W, H, st, false);
  }

  private layout(r: DOMRect | null, W: number, H: number, st: GuideStep, waiting: boolean) {
    const [top, bottom, left, right] = this.blocks;
    const set = (el: HTMLElement, x: number, y: number, w: number, h: number) => {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.width = `${Math.max(0, w)}px`;
      el.style.height = `${Math.max(0, h)}px`;
    };
    if (!r) {
      // niente punto: tutto lo schermo è scuro
      set(top, 0, 0, W, H);
      set(bottom, 0, 0, 0, 0);
      set(left, 0, 0, 0, 0);
      set(right, 0, 0, 0, 0);
      this.ring.style.display = 'none';
      this.hand.style.display = 'none';
    } else {
      const x0 = Math.max(0, r.left - PAD);
      const y0 = Math.max(0, r.top - PAD);
      const x1 = Math.min(W, r.right + PAD);
      const y1 = Math.min(H, r.bottom + PAD);
      set(top, 0, 0, W, y0);
      set(bottom, 0, y1, W, H - y1);
      set(left, 0, y0, x0, y1 - y0);
      set(right, x1, y0, W - x1, y1 - y0);
      this.ring.style.display = '';
      set(this.ring, x0, y0, x1 - x0, y1 - y0);
      // la manina sul punto: il dito al centro (in basso a destra se il punto è grande)
      // un riquadro grande da guardare: basta il bordo acceso (la manina finirebbe su un pulsante a caso)
      this.hand.style.display = !st.tap && r.height > 90 ? 'none' : '';
      const size = this.hand.offsetHeight || 60;
      // il dito sul bordo basso del punto: la manina non copre quello che c'è scritto
      const big = r.height > H * 0.3;
      const hx = r.left + r.width / 2;
      const hy = big ? r.top + 60 : r.bottom - Math.min(14, r.height * 0.3);
      this.hand.style.left = `${Math.min(W - size * 0.7, hx - size * 0.42)}px`;
      this.hand.style.top = `${Math.min(H - size, hy - size * 0.06)}px`;
      this.hand.classList.toggle('tap', !!st.tap);
      this.hand.classList.toggle('gd-look', !st.tap);
    }
    // il fumetto: sotto il punto se c'è spazio, altrimenti sopra; al centro se non c'è un punto
    const key = `${this.id}|${this.i}|${waiting}`;
    if (key !== this.stepKey) {
      this.stepKey = key;
      const n = this.steps.filter((s) => !s.if || s.if()).length;
      const k = this.steps.slice(0, this.i + 1).filter((s) => !s.if || s.if()).length;
      const last = this.i >= this.steps.length - 1 || this.steps.slice(this.i + 1).every((s) => s.if && !s.if());
      const dots = n > 1 ? `<div class="gd-dots">${Array.from({ length: n }, (_, j) => `<i class="${j < k ? 'on' : ''}"></i>`).join('')}</div>` : '';
      const btn = st.tap ? '<div class="gd-hint">👆 Tocca il punto acceso</div>' : `<button class="btn sm good" data-g="ok">${last ? 'Ho capito' : 'Ok ▶'}</button>`;
      this.bubble.innerHTML = waiting ? '' : `<div class="gd-say">${st.say}</div><div class="gd-foot">${dots}${btn}</div>`;
      this.bubble.style.display = waiting ? 'none' : '';
    }
    if (waiting) return;
    const bw = Math.min(330, W - 24);
    this.bubble.style.width = `${bw}px`;
    const bh = this.bubble.offsetHeight || 90;
    let bx: number;
    let by: number;
    if (!r) {
      bx = (W - bw) / 2;
      by = (H - bh) / 2;
    } else {
      bx = Math.min(W - bw - 12, Math.max(12, r.left + r.width / 2 - bw / 2));
      const handH = (this.hand.offsetHeight || 60) * 0.9;
      const below = r.bottom + PAD + handH + 8;
      const above = r.top - PAD - bh - 12;
      const midY = Math.min(H - bh - 10, Math.max(10, r.top + r.height / 2 - bh / 2));
      if (below + bh < H - 10) by = below;
      else if (above > 10) by = above;
      // niente spazio sopra e sotto (in orizzontale): di fianco al punto, o in basso sopra al punto
      else if (r.right + PAD + bw + 12 < W) [bx, by] = [r.right + PAD + 10, midY];
      else if (r.left - PAD - bw - 12 > 0) [bx, by] = [r.left - PAD - bw - 10, midY];
      else by = H - bh - 10;
    }
    this.bubble.style.left = `${bx}px`;
    this.bubble.style.top = `${by}px`;
  }
}
