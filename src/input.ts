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
  actionPressed = false;
  enabled = true;

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
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.actionHeld = false;
    });
  }

  private down(e: PointerEvent) {
    if (!this.enabled) return;
    if (this.lookMode && e.clientX > window.innerWidth / 2) {
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
      return;
    }
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.start = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.dragging = false;
  }

  private moveEv(e: PointerEvent) {
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
    if (e.pointerId === this.lookId) {
      this.lookId = null;
      return;
    }
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    if (!this.dragging && !this.lookMode && performance.now() - this.start.t < 350 && this.enabled) {
      this.tap = { x: e.clientX, y: e.clientY };
    }
    this.dragging = false;
    this.move.x = this.move.y = 0;
    this.stick.classList.remove('on');
    this.knob.style.transform = '';
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

  consumeAction() {
    const a = this.actionPressed;
    this.actionPressed = false;
    return a;
  }

  cancel() {
    this.pointerId = null;
    this.lookId = null;
    this.dragging = false;
    this.move.x = this.move.y = 0;
    this.stick.classList.remove('on');
    this.knob.style.transform = '';
    this.tap = null;
  }
}
