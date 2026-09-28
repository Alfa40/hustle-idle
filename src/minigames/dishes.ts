interface Spot {
  x: number;
  y: number;
  r: number;
  dirt: number;
  color: string;
}

export type DishTheme = 'plate' | 'car' | 'wall';

/** Area dove compaiono le macchie per ogni tema (frazioni del lato). */
const AREA: Record<DishTheme, { x0: number; x1: number; y0: number; y1: number }> = {
  plate: { x0: 0.22, x1: 0.78, y0: 0.22, y1: 0.78 },
  car: { x0: 0.14, x1: 0.86, y0: 0.4, y1: 0.66 },
  wall: { x0: 0.14, x1: 0.86, y0: 0.18, y1: 0.8 },
};

const COLORS: Record<DishTheme, string[]> = {
  plate: ['#8d6e3f', '#a0522d', '#c0392b', '#7a8c2e', '#6d4c41'],
  car: ['#6d4c41', '#8d6e3f', '#5d4037', '#7b6a58'],
  wall: ['#9e9e9e', '#b0a89a', '#8d8d8d', '#a8a29a'],
};

const HINT: Record<DishTheme, string> = { plate: 'Strofina! Piatto', car: 'Lava! Pezzo', wall: 'Imbianca! Parete' };

/** Minigioco strofina: piatti, auto o pareti da pulire/dipingere col dito. */
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

  private wallColor = '#fff3c4';

  constructor(public total: number, private spotsPerPlate: number, private theme: DishTheme, private onDone: () => void) {
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
    const colors = COLORS[this.theme];
    const a = AREA[this.theme];
    this.spots = [];
    this.wallColor = ['#fff3c4', '#d7f0ff', '#ffe0ec', '#e3f7d4'][Math.floor(Math.random() * 4)];
    for (let i = 0; i < this.spotsPerPlate; i++) {
      let x: number;
      let y: number;
      if (this.theme === 'plate') {
        const ang = Math.random() * Math.PI * 2;
        const d = Math.random() * 0.3;
        x = 0.5 + Math.cos(ang) * d;
        y = 0.5 + Math.sin(ang) * d;
      } else {
        x = a.x0 + Math.random() * (a.x1 - a.x0);
        y = a.y0 + Math.random() * (a.y1 - a.y0);
      }
      const big = this.theme === 'wall' ? 0.03 : 0;
      this.spots.push({ x, y, r: 0.05 + big + Math.random() * 0.05, dirt: 1, color: colors[Math.floor(Math.random() * colors.length)] });
    }
  }

  /** Sfondo e oggetto da pulire per ogni tema. */
  private drawBase(g: CanvasRenderingContext2D, S: number) {
    if (this.theme === 'plate') {
      g.fillStyle = '#f7f7f2';
      g.beginPath();
      g.arc(S / 2, S / 2, S * 0.42, 0, 7);
      g.fill();
      g.strokeStyle = '#d9d9cf';
      g.lineWidth = S * 0.02;
      g.beginPath();
      g.arc(S / 2, S / 2, S * 0.3, 0, 7);
      g.stroke();
    } else if (this.theme === 'car') {
      // carrozzeria
      g.fillStyle = '#ff5d73';
      g.beginPath();
      g.roundRect(S * 0.08, S * 0.4, S * 0.84, S * 0.26, S * 0.06);
      g.fill();
      g.beginPath();
      g.roundRect(S * 0.24, S * 0.24, S * 0.5, S * 0.2, S * 0.06);
      g.fill();
      g.fillStyle = '#bfe6ff';
      g.fillRect(S * 0.29, S * 0.28, S * 0.19, S * 0.13);
      g.fillRect(S * 0.51, S * 0.28, S * 0.19, S * 0.13);
      g.fillStyle = '#3a2f55';
      for (const x of [0.26, 0.74]) {
        g.beginPath();
        g.arc(S * x, S * 0.68, S * 0.08, 0, 7);
        g.fill();
      }
      g.fillStyle = '#c9c9c9';
      for (const x of [0.26, 0.74]) {
        g.beginPath();
        g.arc(S * x, S * 0.68, S * 0.035, 0, 7);
        g.fill();
      }
    } else {
      g.fillStyle = this.wallColor;
      g.fillRect(S * 0.1, S * 0.12, S * 0.8, S * 0.74);
      g.fillStyle = '#a1887f';
      g.fillRect(S * 0.1, S * 0.84, S * 0.8, S * 0.04);
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
    g.fillStyle = this.theme === 'wall' ? '#c8b6a6' : this.theme === 'car' ? '#9fd3f0' : '#5fa8d3';
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
    this.drawBase(g, S);
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
    g.fillText(`${HINT[this.theme]} ${Math.min(this.done + 1, this.total)}/${this.total}`, S / 2, S * 0.07);
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.el.remove();
  }
}
