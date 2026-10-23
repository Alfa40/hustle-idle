import * as THREE from 'three';
import { TILE, WS } from '../config/map';
import type { WorkId } from '../config/plots';
import { logoPlate, type Logo } from '../logo';
import { fillTextIco } from '../ui/icons';
import { canvasTexture } from './props';

/**
 * Terreni edificabili in città (config/plots.ts): terra con quello che c'è da sistemare (rifiuti, alberi,
 * rudere, acqua, rocce, barili), il cantiere con la gru, e il palazzo finito con un negozio per piano.
 * Tutto nel sistema del terreno: +Z è il fronte verso la strada (il gioco lo gira con DIR_ROT).
 */

const lamb = (c: number) => new THREE.MeshLambertMaterial({ color: c });
const box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lamb(c));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  return m;
};
/** numeri sempre uguali per lo stesso terreno (i rifiuti non si spostano a ogni ridisegno) */
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** mezzo lato del terreno (m) */
export const PLOT_HALF = TILE * 0.44;
/** mezzo lato del palazzo (m) */
export const TOWER_HALF = 2.4 * WS;
/** altezza di un piano */
export const FLOOR_H = 2.3 * WS;

/** cartello sul terreno: titolo e una riga (es. prezzo, "lavori in corso") */
export function plotSign(title: string, line: string, color = '#e8590c') {
  const g = new THREE.Group();
  g.add(box(0.1, 1.4, 0.1, 0xdddddd, 0, 0, 0));
  const tex = canvasTexture(256, 128, (c) => {
    c.fillStyle = color;
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#fff';
    c.font = '700 36px Fredoka, system-ui, sans-serif';
    c.textAlign = 'center';
    fillTextIco(c, title, 128, 50);
    c.font = '600 30px Fredoka, system-ui, sans-serif';
    fillTextIco(c, line, 128, 98);
  });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 0.06), new THREE.MeshLambertMaterial({ map: tex }));
  panel.position.y = 1.55;
  panel.castShadow = true;
  g.add(panel);
  return g;
}

function tree(r: () => number) {
  const g = new THREE.Group();
  const h = 1.2 + r() * 0.8;
  g.add(box(0.25, h, 0.25, 0x7a4e2d, 0, 0, 0));
  const top = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + r() * 0.4, 0), new THREE.MeshLambertMaterial({ color: 0x4f9a3a, flatShading: true }));
  top.position.y = h + 0.5;
  top.castShadow = true;
  g.add(top);
  return g;
}

/** quello che c'è da sistemare sul terreno, sparso nel suo quadrato */
function issue(w: WorkId, r: () => number) {
  const g = new THREE.Group();
  const H = PLOT_HALF * 0.75;
  const at = () => [(r() * 2 - 1) * H, (r() * 2 - 1) * H] as const;
  if (w === 'rifiuti') {
    for (let i = 0; i < 9; i++) {
      const [x, z] = at();
      const bag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + r() * 0.15, 0), new THREE.MeshLambertMaterial({ color: i % 3 ? 0x2d3436 : 0x3c7a3c, flatShading: true }));
      bag.scale.y = 0.75;
      bag.position.set(x, 0.2, z);
      bag.castShadow = true;
      g.add(bag);
    }
    const [x, z] = at();
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.13, 8, 16), lamb(0x222222));
    tyre.rotation.x = Math.PI / 2;
    tyre.position.set(x, 0.13, z);
    g.add(tyre);
  } else if (w === 'alberi') {
    for (let i = 0; i < 4; i++) {
      const t = tree(r);
      const [x, z] = at();
      t.position.set(x, 0, z);
      g.add(t);
    }
    for (let i = 0; i < 3; i++) {
      const [x, z] = at();
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 0.35, 8), lamb(0x8a5a35));
      stump.position.set(x, 0.17, z);
      g.add(stump);
    }
  } else if (w === 'rudere') {
    // muri rotti a L, mattoni per terra
    const c = 0x9e9e9e;
    g.add(box(4.2, 1.8, 0.35, c, -0.3, 0, -1.6), box(1.6, 1.1, 0.35, c, 1.5, 1.8, -1.6), box(0.35, 1.4, 3, c, -2.2, 0, -0.2), box(0.35, 0.6, 1.2, c, -2.2, 1.4, -1.2));
    for (let i = 0; i < 10; i++) {
      const [x, z] = at();
      const b = box(0.4, 0.2, 0.25, 0xb5653d, x, 0, z);
      b.rotation.y = r() * 3;
      g.add(b);
    }
  } else if (w === 'dislivello') {
    const mound = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8d6a45, flatShading: true }));
    mound.scale.set(1, 0.45, 0.8);
    mound.position.set(-0.6, 0, -0.8);
    g.add(mound);
  } else if (w === 'acqua') {
    for (let i = 0; i < 4; i++) {
      const [x, z] = at();
      const pool = new THREE.Mesh(new THREE.CircleGeometry(0.8 + r() * 0.8, 18), new THREE.MeshLambertMaterial({ color: 0x4a90c2, transparent: true, opacity: 0.85 }));
      pool.rotation.x = -Math.PI / 2;
      pool.scale.y = 0.7;
      pool.position.set(x, 0.05 + i * 0.002, z);
      g.add(pool);
    }
  } else if (w === 'rocce') {
    for (let i = 0; i < 7; i++) {
      const [x, z] = at();
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + r() * 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x8c8c8c, flatShading: true }));
      rock.scale.y = 0.6;
      rock.position.set(x, 0.15, z);
      rock.rotation.y = r() * 3;
      rock.castShadow = true;
      g.add(rock);
    }
  } else if (w === 'bonifica') {
    // barili gialli e una chiazza verde
    for (let i = 0; i < 6; i++) {
      const [x, z] = at();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.85, 12), lamb(i % 2 ? 0xf1c40f : 0x7f8c2d));
      barrel.position.set(x, 0.42, z);
      barrel.castShadow = true;
      g.add(barrel);
    }
    const spill = new THREE.Mesh(new THREE.CircleGeometry(1.4, 18), new THREE.MeshLambertMaterial({ color: 0x9acd32, transparent: true, opacity: 0.7 }));
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(0.8, 0.05, 0.4);
    g.add(spill);
  }
  return g;
}

/** ruspa gialla: si vede dove si lavora */
function digger() {
  const g = new THREE.Group();
  g.add(box(1.4, 0.35, 2, 0x333333, 0, 0, 0), box(1.3, 0.8, 1.2, 0xf4b400, 0, 0.35, -0.2), box(0.9, 0.6, 0.7, 0x9fd3f0, 0, 1.15, -0.3));
  const arm = box(0.2, 0.2, 1.8, 0xf4b400, 0, 0.9, 1.1);
  arm.rotation.x = 0.35;
  g.add(arm);
  g.add(box(0.7, 0.4, 0.4, 0x666666, 0, 0.25, 1.95));
  return g;
}

function cone(x: number, z: number) {
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 10), lamb(0xff7a1a));
  c.position.set(x, 0.28, z);
  return c;
}

export interface FloorView {
  /** attività al piano (null = libero) */
  color?: string;
  icon?: string;
  name?: string;
}

export interface PlotViewOpts {
  seed: string;
  stage: 'sale' | 'works' | 'ready' | 'building' | 'built';
  /** lavori ancora da fare (si vede il problema) e quello in corso */
  todo: WorkId[];
  doing: WorkId | null;
  price?: string;
  /** cantiere: piani previsti e quanto è avanti (0–1) */
  floors?: number;
  progress?: number;
  /** palazzo: un elemento per piano, dal basso */
  shops?: FloorView[];
  logo?: Logo | null;
}

/** insegna dipinta sulla facciata di un piano: icona e nome dell'attività (o "Libero") */
function floorPlate(f: FloorView, w: number) {
  const tex = canvasTexture(512, 96, (c) => {
    c.fillStyle = f.color ?? '#cfd8dc';
    c.fillRect(0, 0, 512, 96);
    c.fillStyle = f.name ? '#fff' : '#546e7a';
    c.font = '700 46px Fredoka, system-ui, sans-serif';
    c.textAlign = 'center';
    fillTextIco(c, f.name ? `${f.icon ?? ''} ${f.name}` : 'Libero', 256, 64);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, w * (96 / 512)), new THREE.MeshLambertMaterial({ map: tex }));
}

/** palazzo finito: un piano per negozio, insegna e finestre sul fronte, logo in cima */
function tower(shops: FloorView[], logo: Logo | null | undefined) {
  const g = new THREE.Group();
  const W = TOWER_HALF * 2;
  const n = shops.length;
  const big = n >= 8;
  const wallC = big ? 0x9fb3c8 : n >= 5 ? 0xe9dcc6 : 0xf3e2d0;
  const winMat = new THREE.MeshBasicMaterial({ color: 0x33415a });
  shops.forEach((f, i) => {
    const y = i * FLOOR_H;
    g.add(box(W, FLOOR_H - 0.04, W, wallC, 0, y, 0));
    // fascia col colore dell'attività tra un piano e l'altro
    g.add(box(W + 0.08, 0.16, W + 0.08, f.color ? new THREE.Color(f.color).getHex() : 0xb0bec5, 0, y + FLOOR_H - 0.16, 0));
    const plate = floorPlate(f, W * 0.6);
    plate.position.set(0, y + FLOOR_H * 0.72, TOWER_HALF + 0.02);
    g.add(plate);
    // finestre (al piano terra: vetrina)
    if (i === 0) {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.8, FLOOR_H * 0.45), new THREE.MeshBasicMaterial({ color: 0x8fc3e6 }));
      glass.position.set(0, FLOOR_H * 0.28, TOWER_HALF + 0.02);
      g.add(glass);
    } else {
      for (const x of [-0.32, 0, 0.32]) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.2, FLOOR_H * 0.32), winMat);
        win.position.set(x * W, y + FLOOR_H * 0.3, TOWER_HALF + 0.02);
        g.add(win);
      }
    }
    // finestre sui lati
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.7, FLOOR_H * 0.35), winMat);
      side.rotation.y = (s * Math.PI) / 2;
      side.position.set(s * (TOWER_HALF + 0.02), y + FLOOR_H * 0.45, 0);
      g.add(side);
    }
  });
  const top = n * FLOOR_H;
  g.add(box(W + 0.2, 0.25, W + 0.2, 0x78909c, 0, top, 0));
  if (big) g.add(box(0.15, 2.4, 0.15, 0xdddddd, W * 0.3, top + 0.25, -W * 0.3));
  if (logo) {
    const lg = logoPlate(logo, 1.6 * WS);
    lg.position.set(0, top + 1.0 * WS, TOWER_HALF * 0.6);
    g.add(lg);
  }
  return g;
}

/** cantiere: impalcature fino a dove si è arrivati e la gru */
function site(floors: number, progress: number) {
  const g = new THREE.Group();
  const W = TOWER_HALF * 2;
  const built = Math.max(1, Math.round(floors * progress));
  for (let i = 0; i < built; i++) {
    g.add(box(W * 0.94, FLOOR_H - 0.3, W * 0.94, 0xbdbdbd, 0, i * FLOOR_H, 0));
    g.add(box(W + 0.3, 0.12, W + 0.3, 0x8d6e63, 0, i * FLOOR_H + FLOOR_H - 0.3, 0));
  }
  // impalcatura: pali agli angoli
  const hh = built * FLOOR_H;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.12, hh, 0.12, 0xff9800, x * (TOWER_HALF + 0.2), 0, z * (TOWER_HALF + 0.2)));
  // gru: più alta del palazzo finito
  const mastH = floors * FLOOR_H + 3;
  g.add(box(0.5, mastH, 0.5, 0xf4b400, -TOWER_HALF - 1.2, 0, -TOWER_HALF + 0.5));
  g.add(box(0.35, 0.35, 9, 0xf4b400, -TOWER_HALF - 1.2, mastH, 1.5));
  g.add(box(0.8, 0.8, 1.2, 0x555555, -TOWER_HALF - 1.2, mastH - 0.8, -3.2));
  return g;
}

/** Tutto il terreno, nel suo sistema (+Z verso la strada). */
export function buildPlotView(o: PlotViewOpts) {
  const g = new THREE.Group();
  const r = rng(o.seed);
  const S = PLOT_HALF * 2;
  // terra (sistemata: più chiara e liscia)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(S, S), lamb(o.stage === 'sale' || o.stage === 'works' ? 0x9c7a52 : 0xb89b74));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.03;
  ground.receiveShadow = true;
  g.add(ground);
  if (o.stage === 'sale' || o.stage === 'works') {
    for (const w of o.todo) g.add(issue(w, rng(o.seed + w)));
  }
  if (o.stage === 'built') {
    g.add(tower(o.shops ?? [], o.logo));
    return g;
  }
  if (o.stage === 'building') {
    g.add(site(o.floors ?? 3, o.progress ?? 0));
  }
  // recinzione bassa sui lati e dietro (il fronte resta aperto per entrare)
  const fenceC = o.stage === 'sale' ? 0xd7ccc8 : 0xff7a1a;
  g.add(box(S, 0.5, 0.08, fenceC, 0, 0, -PLOT_HALF), box(0.08, 0.5, S, fenceC, -PLOT_HALF, 0, 0), box(0.08, 0.5, S, fenceC, PLOT_HALF, 0, 0));
  if (o.doing) {
    const d = digger();
    d.position.set(PLOT_HALF * 0.35, 0, PLOT_HALF * 0.2);
    d.rotation.y = -0.6 + r() * 0.3;
    g.add(d);
    for (const x of [-1.6, -0.6, 0.6, 1.6]) g.add(cone(x, PLOT_HALF - 0.4));
  }
  if (o.stage === 'ready') {
    // picchetti agli angoli del palazzo da costruire
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.1, 0.6, 0.1, 0xe53935, x * TOWER_HALF, 0, z * TOWER_HALF));
  }
  return g;
}
