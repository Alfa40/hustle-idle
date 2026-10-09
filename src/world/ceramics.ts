import * as THREE from 'three';

/**
 * Ceramiche fatte a mano (senza modelli 3D esterni): vasi, ciotole e tazze costruiti col tornio
 * (`LatheGeometry`, un profilo che gira attorno all'asse). Servono ai prodotti del negozio di
 * lavori su richiesta del laboratorio dell'artigiano, dove il vaso si modella davvero al tornio.
 */

/** Quante "fasce" ha un vaso da modellare (dal fondo alla bocca) e quanto è alto (m). */
export const RINGS = 10;
export const VASE_H = 0.44;
/** raggio del pane d'argilla appena messo sul tornio (un cilindro medio: in certi punti si stringe, in altri si allarga) */
export const LUMP_R = 0.12;
/** raggio massimo e minimo che si può dare al vaso */
export const MAX_R = 0.22;
export const MIN_R = 0.035;

export const CLAY = 0xb5764f;
const CLAY_COL = new THREE.Color(0xb5764f);

export type VaseShape = 'panciuto' | 'anfora' | 'slanciato' | 'bottiglia';

export interface VaseDef {
  name: string;
  icon: string;
  /** raggio di ogni fascia, dal fondo alla bocca (m) */
  profile: number[];
  /** quanto è difficile (1 facile … 4 difficile): ricompensa e tempo */
  diff: number;
  /** livello di artigianato da cui compare */
  minLevel: number;
}

export const VASES: Record<VaseShape, VaseDef> = {
  panciuto: { name: 'Vaso panciuto', icon: '🏺', profile: [0.09, 0.13, 0.16, 0.17, 0.17, 0.16, 0.14, 0.11, 0.09, 0.095], diff: 1, minLevel: 0 },
  anfora: { name: 'Anfora', icon: '🏺', profile: [0.075, 0.11, 0.145, 0.16, 0.15, 0.12, 0.085, 0.06, 0.065, 0.09], diff: 2, minLevel: 0 },
  slanciato: { name: 'Vaso slanciato', icon: '🏺', profile: [0.07, 0.075, 0.085, 0.095, 0.1, 0.095, 0.085, 0.075, 0.08, 0.105], diff: 3, minLevel: 2 },
  bottiglia: { name: 'Bottiglia', icon: '🍶', profile: [0.11, 0.14, 0.15, 0.148, 0.13, 0.09, 0.055, 0.045, 0.045, 0.065], diff: 4, minLevel: 4 },
};
export const VASE_IDS = Object.keys(VASES) as VaseShape[];

/** Colori degli smalti per i lavori su richiesta (nome per la scheda). */
export const GLAZES: { color: number; name: string }[] = [
  { color: 0x2d6cdb, name: 'blu cobalto' },
  { color: 0x2fae5e, name: 'verde salvia' },
  { color: 0xe8b03a, name: 'giallo ocra' },
  { color: 0xd9534f, name: 'rosso corallo' },
  { color: 0x8e5bd6, name: 'viola' },
  { color: 0xf3efe6, name: 'bianco latte' },
];

/**
 * Punti del profilo per la LatheGeometry: fondo, fianco esterno (le fasce), bordo della bocca e poi
 * la parete interna, che segue la stessa forma un po' più dentro fino al fondo. Così l'interno non
 * esce mai dal vaso (niente anello in cima quando il collo è stretto) e dall'alto si vede che è vuoto.
 */
function lathePoints(profile: number[], h: number) {
  const T = 0.014;
  const n = profile.length;
  const y = (i: number) => (i / (n - 1)) * h;
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  for (let i = 0; i < n; i++) pts.push(new THREE.Vector2(Math.max(0.01, profile[i]), y(i)));
  // dentro: dalla bocca verso il basso, sempre `T` più stretto dell'esterno
  for (let i = n - 1; i >= 1; i--) pts.push(new THREE.Vector2(Math.max(0.004, profile[i] - T), Math.max(T, y(i) - (i === n - 1 ? 0.004 : 0))));
  pts.push(new THREE.Vector2(0, T));
  return pts;
}

/**
 * Geometria di un vaso dal profilo; con `paint` (quanto è dipinta ogni fascia, 0…1) i vertici
 * prendono il colore dello smalto dove è dipinto, quello dell'argilla altrove.
 */
export function vaseGeometry(profile: number[], h = VASE_H, paint?: number[], glaze?: number, segments = 28) {
  const pts = lathePoints(profile, h);
  const g = new THREE.LatheGeometry(pts, segments);
  if (paint && glaze !== undefined) {
    const gc = new THREE.Color(glaze);
    const colors = new Float32Array(g.attributes.position.count * 3);
    const n = profile.length;
    const per = pts.length;
    const c = new THREE.Color();
    for (let v = 0; v < g.attributes.position.count; v++) {
      const j = v % per;
      // j = 0 fondo, 1…n fasce esterne, poi le stesse fasce all'interno (dalla bocca in giù)
      const ring = j <= n ? THREE.MathUtils.clamp(j - 1, 0, n - 1) : THREE.MathUtils.clamp(2 * n - j, 0, n - 1);
      c.copy(CLAY_COL).lerp(gc, THREE.MathUtils.clamp(paint[ring], 0, 1));
      colors[v * 3] = c.r;
      colors[v * 3 + 1] = c.g;
      colors[v * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  g.computeVertexNormals();
  return g;
}

/** Vaso pronto (per il negozio, la scheda degli ordini o il ripiano). */
export function vaseMesh(profile: number[], color: number, h = VASE_H) {
  const m = new THREE.Mesh(vaseGeometry(profile, h), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  m.castShadow = true;
  return m;
}

/** Pacco del vaso incartato: carta kraft e un nastro. */
export function wrappedVase() {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.46, 10), new THREE.MeshLambertMaterial({ color: 0xd8b98a, flatShading: true }));
  paper.position.y = 0.23;
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.14, 10), new THREE.MeshLambertMaterial({ color: 0xd8b98a, flatShading: true }));
  top.position.y = 0.53;
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.015, 6, 20), new THREE.MeshLambertMaterial({ color: 0xd94f4f }));
  ribbon.rotation.x = Math.PI / 2;
  ribbon.position.y = 0.42;
  const bow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd94f4f }));
  bow.position.y = 0.62;
  g.add(paper, top, ribbon, bow);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

/**
 * Ceramiche pronte ('proc:vaso', 'proc:ciotola', 'proc:tazza'), alte `size` metri.
 */
export function ceramicProduct(kind: string, size: number): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === 'ciotola') {
    // ciotola larga e bassa, smaltata dentro
    const outer = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.09, 0), new THREE.Vector2(0.16, 0.06), new THREE.Vector2(0.2, 0.13), new THREE.Vector2(0.185, 0.13), new THREE.Vector2(0.15, 0.07), new THREE.Vector2(0, 0.04)], 24);
    const m = new THREE.Mesh(outer, new THREE.MeshLambertMaterial({ color: 0x2fae5e, side: THREE.DoubleSide }));
    g.add(m);
  } else if (kind === 'tazza') {
    const body = new THREE.Mesh(vaseGeometry([0.1, 0.105, 0.11, 0.112, 0.115], 0.22), new THREE.MeshLambertMaterial({ color: 0xf3efe6, side: THREE.DoubleSide }));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.114, 0.113, 0.05, 20, 1, true), new THREE.MeshLambertMaterial({ color: 0xd9534f }));
    band.position.y = 0.13;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 8, 16, Math.PI * 1.3), new THREE.MeshLambertMaterial({ color: 0xf3efe6 }));
    handle.rotation.z = -Math.PI * 0.65;
    handle.position.set(0.13, 0.11, 0);
    g.add(body, band, handle);
  } else {
    const body = vaseMesh(VASES.anfora.profile, 0xc87b4f);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.158, 0.06, 24, 1, true), new THREE.MeshLambertMaterial({ color: 0x2d6cdb }));
    band.position.y = VASE_H * 0.36;
    g.add(body, band);
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  const box = new THREE.Box3().setFromObject(g);
  const s = box.getSize(new THREE.Vector3());
  g.scale.setScalar(size / Math.max(s.x, s.y, s.z));
  return g;
}

/** Disegno del vaso (sagoma) per la scheda degli ordini e la foto in alto a destra: un SVG. */
export function vaseSvg(profile: number[], color: number, opts: { w?: number; h?: number; current?: number[] } = {}) {
  const W = opts.w ?? 80;
  const H = opts.h ?? 96;
  const sx = (W / 2 - 4) / MAX_R;
  const sy = (H - 8) / VASE_H;
  const n = profile.length;
  const side = (p: number[], dir: 1 | -1) => p.map((r, i) => `${(W / 2 + dir * r * sx).toFixed(1)},${(H - 4 - (i / (n - 1)) * VASE_H * sy).toFixed(1)}`);
  const shape = (p: number[]) => [...side(p, 1), ...side(p, -1).reverse()].join(' ');
  const hex = '#' + color.toString(16).padStart(6, '0');
  const cur = opts.current ? `<polygon points="${shape(opts.current)}" fill="none" stroke="#5a3a22" stroke-width="2" stroke-dasharray="4 3"/>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><ellipse cx="${W / 2}" cy="${H - 3}" rx="${W / 2.6}" ry="3" fill="rgba(0,0,0,.15)"/><polygon points="${shape(profile)}" fill="${hex}" stroke="#3a2f55" stroke-width="1.5"/>${cur}</svg>`;
}
