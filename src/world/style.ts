import * as THREE from 'three';
import type { Character } from './character';

/**
 * Aspetto del personaggio: il modello (stile) e gli accessori comprati nel Negozio.
 * Gli accessori sono semplici forme agganciate all'osso della testa, così seguono le animazioni.
 */

export interface StyleDef {
  id: string;
  name: string;
  price: number;
}

/** Stili: i personaggi Kenney (il primo è quello di partenza, gratis). */
export const STYLES: StyleDef[] = [
  { id: 'character-male-a', name: 'Classico', price: 0 },
  { id: 'character-male-b', name: 'Sportivo', price: 150 },
  { id: 'character-male-c', name: 'Elegante', price: 250 },
  { id: 'character-male-d', name: 'Casual', price: 250 },
  { id: 'character-male-e', name: 'Avventuriero', price: 400 },
  { id: 'character-female-a', name: 'Solare', price: 150 },
  { id: 'character-female-b', name: 'Creativa', price: 250 },
  { id: 'character-female-c', name: 'Manager', price: 400 },
  { id: 'character-female-d', name: 'Sprint', price: 250 },
];

export type AccSlot = 'testa' | 'occhi' | 'collo' | 'schiena';
export const ACC_SLOT_NAME: Record<AccSlot, string> = { testa: 'Testa', occhi: 'Occhi', collo: 'Collo', schiena: 'Schiena' };

export interface AccessoryDef {
  id: string;
  name: string;
  icon: string;
  price: number;
  slot: AccSlot;
  /** forma in metri, con l'origine alla base della testa (il collo) */
  build: () => THREE.Object3D;
}

const mat = (color: number, metal = false) =>
  new THREE.MeshLambertMaterial({ color, emissive: metal ? new THREE.Color(color).multiplyScalar(0.25) : 0x000000 });
const mesh = (geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, metal = false) => {
  const m = new THREE.Mesh(geo, mat(color, metal));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};
const group = (...o: THREE.Object3D[]) => new THREE.Group().add(...o);

// la testa dei personaggi va da 0 (collo) a circa 0.71 m; la faccia è verso +Z a circa 0.33 m
export const ACCESSORIES: AccessoryDef[] = [
  {
    id: 'cappellino', name: 'Cappellino', icon: '🧢', price: 120, slot: 'testa',
    build: () => {
      const cap = mesh(new THREE.SphereGeometry(0.36, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xe53935, 0, 0.6, 0);
      cap.scale.y = 0.55;
      const visor = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), 0xc62828, 0, 0.61, 0.28);
      return group(cap, visor);
    },
  },
  {
    id: 'cilindro', name: 'Cilindro', icon: '🎩', price: 400, slot: 'testa',
    build: () => group(
      mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 20), 0x212121, 0, 0.7, 0),
      mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 20), 0x212121, 0, 0.88, 0),
      mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.06, 20), 0xc62828, 0, 0.74, 0),
    ),
  },
  {
    id: 'corona', name: 'Corona', icon: '👑', price: 2500, slot: 'testa',
    build: () => {
      const g = group(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 20, 1, true), 0xffc21a, 0, 0.74, 0, true));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(mesh(new THREE.ConeGeometry(0.06, 0.14, 4), 0xffc21a, Math.sin(a) * 0.24, 0.86, Math.cos(a) * 0.24, true));
      }
      return g;
    },
  },
  {
    id: 'occhiali', name: 'Occhiali da sole', icon: '🕶️', price: 180, slot: 'occhi',
    build: () => group(
      mesh(new THREE.BoxGeometry(0.2, 0.11, 0.03), 0x111111, -0.12, 0.33, 0.34),
      mesh(new THREE.BoxGeometry(0.2, 0.11, 0.03), 0x111111, 0.12, 0.33, 0.34),
      mesh(new THREE.BoxGeometry(0.46, 0.03, 0.03), 0x111111, 0, 0.37, 0.34),
    ),
  },
  {
    id: 'occhiali-cuore', name: 'Occhiali a cuore', icon: '😍', price: 220, slot: 'occhi',
    build: () => group(
      mesh(new THREE.BoxGeometry(0.2, 0.13, 0.03), 0xff4f9a, -0.12, 0.33, 0.34),
      mesh(new THREE.BoxGeometry(0.2, 0.13, 0.03), 0xff4f9a, 0.12, 0.33, 0.34),
      mesh(new THREE.BoxGeometry(0.46, 0.03, 0.03), 0xffffff, 0, 0.38, 0.34),
    ),
  },
  {
    id: 'collana', name: 'Collana d\'oro', icon: '📿', price: 250, slot: 'collo',
    build: () => {
      const chain = mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 28), 0xffc21a, 0, -0.02, 0.02, true);
      chain.rotation.x = Math.PI / 2.3;
      const pend = mesh(new THREE.OctahedronGeometry(0.05), 0xffc21a, 0, -0.1, 0.2, true);
      return group(chain, pend);
    },
  },
  {
    id: 'collana-perle', name: 'Collana di perle', icon: '⚪', price: 400, slot: 'collo',
    build: () => {
      const g = new THREE.Group();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), 0xfaf7f0, Math.sin(a) * 0.2, -0.04 - Math.max(0, Math.cos(a)) * 0.05, Math.cos(a) * 0.18));
      }
      return g;
    },
  },
  {
    id: 'sciarpa', name: 'Sciarpa', icon: '🧣', price: 150, slot: 'collo',
    build: () => {
      const s = mesh(new THREE.TorusGeometry(0.2, 0.07, 8, 20), 0x2d9cdb, 0, 0, 0);
      s.rotation.x = Math.PI / 2;
      const tail = mesh(new THREE.BoxGeometry(0.1, 0.28, 0.05), 0x2d9cdb, 0.1, -0.16, 0.2);
      return group(s, tail);
    },
  },
  {
    id: 'zaino', name: 'Zaino', icon: '🎒', price: 300, slot: 'schiena',
    build: () => group(
      mesh(new THREE.BoxGeometry(0.42, 0.44, 0.2), 0xff8a3d, 0, -0.34, -0.3),
      mesh(new THREE.BoxGeometry(0.3, 0.16, 0.06), 0xe8590c, 0, -0.42, -0.42),
    ),
  },
  {
    id: 'mantello', name: 'Mantello da eroe', icon: '🦸', price: 900, slot: 'schiena',
    build: () => {
      const c = mesh(new THREE.BoxGeometry(0.5, 0.7, 0.03), 0x8e5bd6, 0, -0.4, -0.26);
      c.rotation.x = 0.12;
      return group(c);
    },
  },
];

export const accById = (id: string) => ACCESSORIES.find((a) => a.id === id);

/** Mette al personaggio gli accessori indossati (toglie quelli di prima). */
export function applyAccessories(char: Character, ids: string[]) {
  let head: THREE.Object3D | undefined;
  char.body.traverse((o) => {
    if ((o as THREE.Bone).isBone && o.name === 'head') head = o;
  });
  const parent = head ?? char.root;
  for (const old of parent.children.filter((c) => c.userData.accessory)) parent.remove(old);
  // l'osso è scalato insieme al personaggio: gli accessori si costruiscono in metri
  char.root.updateMatrixWorld(true);
  const inv = head ? 1 / head.getWorldScale(new THREE.Vector3()).x * char.root.scale.x : 1;
  for (const id of ids) {
    const def = accById(id);
    if (!def) continue;
    const o = def.build();
    o.userData.accessory = true;
    o.scale.setScalar(inv);
    if (!head) o.position.y = 0.74;
    parent.add(o);
  }
}
