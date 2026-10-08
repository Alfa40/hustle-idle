import { settings } from './settings';
/**
 * Controlli: joystick virtuale che compare dove si appoggia il dito,
 * tocco breve = vai lì, tastiera (WASD/frecce + E/spazio) su PC.
 */
export class Input {
  /** direzione desiderata sullo schermo, x → destra, y → giù, lunghezza 0–1 */
  move = { x: 0, y: 0 };
  /** ultimo tocco breve (coordinate schermo), da consumare */
  tap: { x: number; y: number } | null = null;
  actionHeld = false;
  /** prima persona: la metà destra dello schermo serve a guardarsi intorno */
  lookMode = false;
  /** spostamento del dito per guardarsi intorno (pixel), da consumare */
  look = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private pressed = false;
  /** tocco nell'area delle azioni (o E/spazio), da consumare: chi lo imposta segna anche quando */
  get actionPressed() {
    return this.pressed;
  }
  set actionPressed(v: boolean) {
    this.pressed = v;
    if (v) this.pressedAt = performance.now();
  }
  enabled = true;
  /** il dito ha appena toccato l'area delle azioni (per il lampo del cerchio) */
  onActionDown: (() => void) | null = null;
  /**
   * Prima persona: il dito tocca qualcosa da "strofinare" (es. l'auto da lavare)? Se sì il tocco
   * non gira lo sguardo: tenendo il dito e trascinando si lavora su quello che c'è sotto.
   */
  onActionClaim: ((x: number, y: number) => boolean) | null = null;
  /** prima persona: c'è un'azione da "tenere premuto" adesso? (se no, il dito fermo non fa niente) */
  holdAvailable: (() => boolean) | null = null;
  /** dove sta il dito nella metà delle azioni (pixel), null se non c'è */
  actionPos: { x: number; y: number } | null = null;
  private actClaimed = false;
  onActionUp: (() => void) | null = null;
  private actionId: number | null = null;

  private keys = new Set<string>();
  private pointerId: number | null = null;
  private start = { x: 0, y: 0, t: 0 };
  private dragging = false;
  private stick: HTMLDivElement;
  private knob: HTMLDivElement;
  private readonly radius = 52;

  constructor(surface: HTMLElement) {
    this.stick = document.createElement('div');
    this.stick.className = 'joy';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.stick.appendChild(this.knob);
    document.body.appendChild(this.stick);

    surface.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.moveEv(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if ((e.code === 'KeyE' || e.code === 'Space') && !e.repeat) {
        this.actionPressed = true;
        this.actionHeld = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE' || e.code === 'Space') this.actionHeld = false;
    });
    // nessun dito sullo schermo: tutto si ferma (anche se il browser ha perso un pointerup)
    // (un attimo dopo: il pointerup normale, se arriva, ha la precedenza e fa il suo lavoro, es. il tocco)
    window.addEventListener('touchend', (e) => {
      if (e.touches.length !== 0) return;
      setTimeout(() => {
        this.releaseStick();
        this.releaseAction();
        this.lookId = null;
      }, 80);
    }, { passive: true });
    window.addEventListener('touchcancel', () => {
      this.releaseStick();
      this.releaseAction();
      this.lookId = null;
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.cancel();
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.actionHeld = false;
    });
  }

  private down(e: PointerEvent) {
    if (!this.enabled) return;
    // il dito tocca direttamente l'oggetto da lavorare (es. una macchia sull'auto), in qualsiasi
    // punto dello schermo: si lavora subito, e trascinare non gira lo sguardo né muove
    if (this.lookMode && this.onActionClaim?.(e.clientX, e.clientY)) {
      // un dito rimasto "appeso" (pointerup perso) non blocca il nuovo tocco
      if (this.actionId !== null) this.releaseAction();
      this.actionId = e.pointerId;
      this.actionPos = { x: e.clientX, y: e.clientY };
      this.actClaimed = true;
      this.actLook = false;
      this.actionHeld = true;
      this.onActionDown?.();
      return;
    }
    // metà dello schermo delle azioni (di solito la destra): toccare o tenere premuto fa l'azione
    const left = e.clientX < window.innerWidth / 2;
    if (left === settings.swapControls) {
      // un dito rimasto "appeso" (pointerup perso) lascia il posto al nuovo tocco
      if (this.actionId !== null) this.releaseAction();
      this.actionId = e.pointerId;
      this.actionPos = { x: e.clientX, y: e.clientY };
      this.actClaimed = false;
      if (this.lookMode) {
        // prima persona: trascinando si gira lo sguardo; un tocco breve o il dito fermo fanno l'azione
        this.actStart = { x: e.clientX, y: e.clientY, t: performance.now() };
        this.lookLast = { x: e.clientX, y: e.clientY };
        this.actLook = false;
        // il dito fermo diventa "tieni premuto" solo se c'è un'azione da tenere premuta adesso
        this.actHoldTimer = window.setTimeout(() => {
          if (this.actionId === e.pointerId && !this.actLook && (this.holdAvailable?.() ?? true)) {
            this.actionHeld = true;
            this.onActionDown?.();
          }
        }, 220);
        return;
      }
      this.actionPressed = true;
      this.actionHeld = true;
      this.onActionDown?.();
      return;
    }
    // l'altra metà: il joystick (un nuovo tocco prende il posto di uno rimasto bloccato)
    if (this.pointerId !== null) this.releaseStick();
    this.pointerId = e.pointerId;
    this.start = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.dragging = false;
  }

  /** prima persona: inizio del tocco nella metà delle azioni, e se è diventato un "guardarsi attorno" */
  private actStart = { x: 0, y: 0, t: 0 };
  private actLook = false;
  private actHoldTimer = 0;

  private moveEv(e: PointerEvent) {
    if (e.pointerId === this.actionId) this.actionPos = { x: e.clientX, y: e.clientY };
    if (e.pointerId === this.actionId && this.actClaimed) return;
    if (e.pointerId === this.actionId && this.lookMode) {
      // basta spostare un po' il dito per guardarsi attorno, anche dopo averlo tenuto fermo
      // (se stava "tenendo premuto" un'azione, la si lascia: muovere vince)
      const moved = Math.hypot(e.clientX - this.actStart.x, e.clientY - this.actStart.y);
      if (!this.actLook && moved > (this.actionHeld ? 18 : 8)) {
        this.actLook = true;
        clearTimeout(this.actHoldTimer);
        if (this.actionHeld) {
          this.actionHeld = false;
          this.onActionUp?.();
        }
        this.lookLast = { x: e.clientX, y: e.clientY };
      }
      if (this.actLook) {
        this.look.x += e.clientX - this.lookLast.x;
        this.look.y += e.clientY - this.lookLast.y;
      }
      this.lookLast = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.pointerId === this.lookId) {
      this.look.x += e.clientX - this.lookLast.x;
      this.look.y += e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.start.x;
    const dy = e.clientY - this.start.y;
    const len = Math.hypot(dx, dy);
    if (!this.dragging && len > 12) {
      this.dragging = true;
      this.stick.style.left = this.start.x + 'px';
      this.stick.style.top = this.start.y + 'px';
      this.stick.classList.add('on');
    }
    if (!this.dragging) return;
    const k = Math.min(1, len / this.radius);
    this.move.x = len > 0 ? (dx / len) * k : 0;
    this.move.y = len > 0 ? (dy / len) * k : 0;
    this.knob.style.transform = `translate(${this.move.x * this.radius}px, ${this.move.y * this.radius}px)`;
  }

  private up(e: PointerEvent) {
    if (e.pointerId === this.actionId) {
      this.actionId = null;
      this.actionPos = null;
      clearTimeout(this.actHoldTimer);
      // prima persona: un tocco breve senza trascinare è un'azione "tocca"
      if (this.lookMode && !this.actClaimed && !this.actLook && !this.actionHeld && performance.now() - this.actStart.t < 400) {
        this.actionPressed = true;
        this.onActionDown?.();
      }
      this.actionHeld = false;
      this.onActionUp?.();
      return;
    }
    if (e.pointerId === this.lookId) {
      this.lookId = null;
      return;
    }
    if (e.pointerId !== this.pointerId) return;
    this.releaseStick();
  }

  private releaseStick() {
    this.pointerId = null;
    // un tocco breve non fa più muovere il personaggio: si usa solo il joystick
    this.dragging = false;
    this.move.x = this.move.y = 0;
    this.stick.classList.remove('on');
    this.knob.style.transform = '';
  }

  private releaseAction() {
    this.actionId = null;
    this.actionPos = null;
    clearTimeout(this.actHoldTimer);
    this.actLook = false;
    this.actClaimed = false;
    if (this.actionHeld) {
      this.actionHeld = false;
      this.onActionUp?.();
    }
  }

  /** Movimento combinato tastiera + joystick. */
  get vector() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = this.move.x;
    let y = this.move.y;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  consumeLook() {
    const l = this.look;
    this.look = { x: 0, y: 0 };
    return l;
  }

  consumeTap() {
    const t = this.tap;
    this.tap = null;
    return t;
  }

  /** quando è stato toccato (ms): un tocco vale solo per un attimo, non resta "in sospeso" */
  private pressedAt = 0;

  consumeAction() {
    const a = this.actionPressed && performance.now() - this.pressedAt < 350;
    this.actionPressed = false;
    return a;
  }

  cancel() {
    if (this.actionId !== null) {
      this.actionId = null;
      this.actionHeld = false;
      this.onActionUp?.();
    }
    this.pointerId = null;
    this.lookId = null;
    this.dragging = false;
    this.move.x = this.move.y = 0;
    this.stick.classList.remove('on');
    this.knob.style.transform = '';
    this.tap = null;
  }
}
