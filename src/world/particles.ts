import * as THREE from 'three';

export type ParticleKind = 'leaf' | 'bubble' | 'smoke' | 'dust' | 'paint' | 'spark';

interface P {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  max: number;
  grow: number;
  spin: number;
}

const textures = new Map<string, THREE.Texture>();

function tex(kind: ParticleKind) {
  let t = textures.get(kind);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  if (kind === 'leaf') {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(32, 32, 26, 13, 0.6, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'bubble') {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(32, 32, 24, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(22, 22, 6, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'spark') {
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? 10 : 30;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.fill();
  } else {
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  textures.set(kind, t);
  return t;
}

const COLORS: Record<ParticleKind, number[]> = {
  leaf: [0x6fbf4a, 0x4e9a35, 0x9ccc65, 0xb5893e],
  bubble: [0xffffff, 0xd7f0ff],
  smoke: [0xdddddd, 0xbdbdbd],
  dust: [0xc8b89a, 0xa89f91],
  paint: [0xffffff],
  spark: [0xffe066, 0xffffff],
};

/** Piccolo sistema di particelle a sprite, uno per ogni scena. */
export class Particles {
  group = new THREE.Group();
  private list: P[] = [];
  private pool: THREE.Sprite[] = [];

  emit(kind: ParticleKind, at: THREE.Vector3, n = 4, color?: number) {
    for (let i = 0; i < n; i++) {
      if (this.list.length > 160) return;
      const s = this.pool.pop() ?? new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      const m = s.material;
      m.map = tex(kind);
      const cols = COLORS[kind];
      m.color.setHex(color ?? cols[Math.floor(Math.random() * cols.length)]);
      m.opacity = kind === 'smoke' || kind === 'dust' ? 0.55 : 1;
      m.needsUpdate = true;
      s.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.2, (Math.random() - 0.5) * 0.4));
      const size = kind === 'smoke' || kind === 'dust' ? 0.35 : kind === 'bubble' ? 0.26 + Math.random() * 0.18 : 0.22;
      s.scale.setScalar(size);
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.4, 0, (Math.random() - 0.5) * 1.4);
      if (kind === 'leaf') v.y = 1.5 + Math.random();
      else if (kind === 'bubble') v.set(v.x * 0.4, 0.6 + Math.random() * 0.6, v.z * 0.4);
      else if (kind === 'smoke') v.set(v.x * 0.15, 0.8 + Math.random() * 0.4, v.z * 0.15);
      else if (kind === 'dust') v.set(v.x * 0.5, 0.3 + Math.random() * 0.4, v.z * 0.5);
      else if (kind === 'paint') v.y = 1 + Math.random();
      else v.y = 2 + Math.random();
      const max = kind === 'smoke' ? 1.6 : kind === 'bubble' ? 1.3 : 0.9;
      this.group.add(s);
      this.list.push({ sprite: s, vel: v, life: max, max, grow: kind === 'smoke' || kind === 'dust' ? 1.2 : 0, spin: (Math.random() - 0.5) * 6 });
    }
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.sprite);
        this.pool.push(p.sprite);
        this.list.splice(i, 1);
        continue;
      }
      const gravity = p.grow ? 0 : p.sprite.material.map === textures.get('bubble') ? -0.3 : 4;
      p.vel.y -= gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      if (p.sprite.position.y < 0.05) {
        p.sprite.position.y = 0.05;
        p.vel.set(0, 0, 0);
      }
      p.sprite.material.rotation += p.spin * dt;
      if (p.grow) p.sprite.scale.multiplyScalar(1 + p.grow * dt);
      const f = p.life / p.max;
      p.sprite.material.opacity = Math.min(p.sprite.material.opacity, f < 0.4 ? f / 0.4 : 1);
    }
  }
}
