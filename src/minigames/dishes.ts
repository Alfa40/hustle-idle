interface Spot {
  x: number;
  y: number;
  r: number;
  dirt: number;
  color: string;
}

/** Minigioco lavapiatti: strofina col dito le macchie finché il piatto è pulito. */
export class DishGame {
  done = 0;
  private el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private spots: Spot[] = [];
  private size = 300;
  private raf = 0;
  private last: { x: number; y: number } | null = null;
  private slide = 0;
  private dead = false;
  private bubbles: { x: number; y: number; r: number; life: number }[] = [];

  constructor(public total: number, private spotsPerPlate: number, private onDone: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'overlay-game';
    this.cv = document.createElement('canvas');
    this.el.appendChild(this.cv);
    document.body.appendChild(this.el);
    this.g = this.cv.getContext('2d')!;
    this.resize();
    this.newPlate();
    this.cv.addEventListener('pointerdown', (e) => {
      this.cv.setPointerCapture(e.pointerId);
      this.last = this.local(e);
    });
    this.cv.addEventListener('pointermove', (e) => {
      if (!this.last) return;
      const p = this.local(e);
      this.scrub(this.last, p);
      this.last = p;
    });
    const end = () => (this.last = null);
    this.cv.addEventListener('pointerup', end);
    this.cv.addEventListener('pointercancel', end);
    window.addEventListener('resize', this.resize);
    const loop = () => {
      this.draw();
      if (!this.dead) this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  private resize = () => {
    const s = Math.min(window.innerWidth - 40, window.innerHeight - 200, 420);
    this.size = Math.max(220, s);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = this.size * dpr;
    this.cv.height = this.size * dpr;
    this.cv.style.width = this.cv.style.height = this.size + 'px';
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private local(e: PointerEvent) {
    const r = this.cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  private newPlate() {
    const colors = ['#8d6e3f', '#a0522d', '#c0392b', '#7a8c2e', '#6d4c41'];
    this.spots = [];
    for (let i = 0; i < this.spotsPerPlate; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 0.3;
      this.spots.push({
        x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d, r: 0.05 + Math.random() * 0.05, dirt: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  private scrub(a: { x: number; y: number }, b: { x: number; y: number }) {
    if (this.slide > 0) return;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (const s of this.spots) {
      if (s.dirt <= 0) continue;
      const d = Math.hypot(b.x - s.x, b.y - s.y);
      if (d < s.r + 0.06) {
        s.dirt -= len * 3.2;
        if (Math.random() < 0.5) this.bubbles.push({ x: b.x, y: b.y, r: 0.01 + Math.random() * 0.02, life: 1 });
      }
    }
    if (this.spots.every((s) => s.dirt <= 0)) {
      this.done++;
      this.slide = 1;
    }
  }

  private draw() {
    const g = this.g;
    const S = this.size;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#5fa8d3';
    g.fillRect(0, 0, S, S);
    // acqua
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.ellipse(S * ((i * 0.37) % 1), S * ((i * 0.53 + performance.now() / 9000) % 1), S * 0.12, S * 0.03, 0, 0, 7);
      g.fill();
    }
    let ox = 0;
    if (this.slide > 0) {
      this.slide -= 0.06;
      ox = (1 - this.slide) * S * 1.2;
      if (this.slide <= 0) {
        this.slide = 0;
        if (this.done >= this.total) {
          this.onDone();
          return;
        }
        this.newPlate();
      }
    }
    g.save();
    g.translate(ox, 0);
    g.fillStyle = '#f7f7f2';
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.42, 0, 7);
    g.fill();
    g.strokeStyle = '#d9d9cf';
    g.lineWidth = S * 0.02;
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.3, 0, 7);
    g.stroke();
    for (const s of this.spots) {
      if (s.dirt <= 0) continue;
      g.globalAlpha = Math.min(1, s.dirt);
      g.fillStyle = s.color;
      g.beginPath();
      g.arc(s.x * S, s.y * S, s.r * S, 0, 7);
      g.fill();
    }
    g.globalAlpha = 1;
    g.restore();
    for (const b of this.bubbles) {
      b.life -= 0.03;
      b.y -= 0.002;
      g.strokeStyle = `rgba(255,255,255,${b.life})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(b.x * S, b.y * S, b.r * S, 0, 7);
      g.stroke();
    }
    this.bubbles = this.bubbles.filter((b) => b.life > 0);
    g.fillStyle = '#fff';
    g.font = `600 ${Math.round(S * 0.06)}px Fredoka, system-ui`;
    g.textAlign = 'center';
    g.fillText(`Strofina! Piatto ${Math.min(this.done + 1, this.total)}/${this.total}`, S / 2, S * 0.07);
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.el.remove();
  }
}
