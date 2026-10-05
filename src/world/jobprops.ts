import * as THREE from 'three';

/**
 * Oggetti di scena dei lavoretti, costruiti con forme semplici ma riconoscibili:
 * cassetta degli attrezzi, barattoli di vernice, bidone, giochi da giardino, teloni su misura,
 * edicola, negozio dei pacchi, cassette della posta, spruzzino, avvolgitubo, secchio con stracci.
 * Sono a grandezza "vera" (si piazzano con scala 1): si vedono bene prima di prenderli.
 */

const lamb = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function part(g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, typeof mat === 'number' ? lamb(mat) : mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

const texCache = new Map<string, THREE.Texture>();
/** Insegna con scritta (canvas → texture). */
function signTex(text: string, bg: string, fg = '#ffffff', w = 512, h = 128, font = 70) {
  const key = `${text}|${bg}|${fg}|${w}|${h}|${font}`;
  let t = texCache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = `800 ${font}px Fredoka, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t);
  }
  return t;
}

// ---------------- giardino ----------------

/** Cassetta degli attrezzi rossa con maniglia e coperchio. */
export function toolbox() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.9, 0.42, 0.45), 0xd32f2f, 0, 0.21, 0);
  part(g, new THREE.BoxGeometry(0.94, 0.08, 0.49), 0xb71c1c, 0, 0.46, 0);
  part(g, new THREE.BoxGeometry(0.06, 0.18, 0.06), 0x37474f, -0.25, 0.58, 0);
  part(g, new THREE.BoxGeometry(0.06, 0.18, 0.06), 0x37474f, 0.25, 0.58, 0);
  part(g, new THREE.BoxGeometry(0.56, 0.06, 0.08), 0x37474f, 0, 0.68, 0);
  part(g, new THREE.BoxGeometry(0.12, 0.08, 0.04), 0xffc21a, 0, 0.32, 0.24);
  return g;
}

/** Bidone verde con coperchio e ruote. */
export function wheelieBin() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.7, 1.0, 0.75), 0x2e7d32, 0, 0.55, 0);
  part(g, new THREE.BoxGeometry(0.76, 0.08, 0.82), 0x1b5e20, 0, 1.09, 0.02);
  for (const x of [-0.3, 0.3]) {
    const w = part(g, new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12), 0x212121, x, 0.1, -0.36);
    w.rotation.z = Math.PI / 2;
  }
  part(g, new THREE.BoxGeometry(0.5, 0.05, 0.05), 0x1b5e20, 0, 1.0, -0.42);
  return g;
}

/** Due barattoli di vernice grandi, pennello e vaschetta col rullo. */
export function paintKit(color: number) {
  const g = new THREE.Group();
  const can = (x: number, z: number, c: number) => {
    part(g, new THREE.CylinderGeometry(0.22, 0.22, 0.42, 18), 0xd8dde3, x, 0.21, z);
    part(g, new THREE.CylinderGeometry(0.225, 0.225, 0.16, 18), c, x, 0.24, z);
    part(g, new THREE.CylinderGeometry(0.2, 0.2, 0.02, 18), c, x, 0.43, z);
    const h = part(g, new THREE.TorusGeometry(0.17, 0.012, 6, 18, Math.PI), 0x90a4ae, x, 0.43, z);
    h.rotation.y = Math.PI / 2;
  };
  can(-0.25, 0, color);
  can(0.25, 0.05, 0xffffff);
  const tray = part(g, new THREE.BoxGeometry(0.45, 0.06, 0.32), 0x607d8b, 0, 0.03, 0.42);
  tray.rotation.x = 0.1;
  part(g, new THREE.BoxGeometry(0.4, 0.02, 0.26), color, 0, 0.07, 0.42);
  const roller = part(g, new THREE.CylinderGeometry(0.06, 0.06, 0.3, 12), color, 0, 0.12, 0.45);
  roller.rotation.z = Math.PI / 2;
  part(g, new THREE.BoxGeometry(0.03, 0.03, 0.4), 0x37474f, 0.17, 0.14, 0.62);
  return g;
}

/** Cespuglio rotondo ben fatto (più "pieno" di quello da tagliare). */
export function roundShrub(color = 0x3f8f3a) {
  const g = new THREE.Group();
  const mat = lamb(color);
  for (let i = 0; i < 5; i++) {
    const s = 0.32 + Math.random() * 0.12;
    part(g, new THREE.IcosahedronGeometry(s, 1), mat, (Math.random() - 0.5) * 0.45, 0.35 + Math.random() * 0.25, (Math.random() - 0.5) * 0.45);
  }
  return g;
}

/** Aiuola fiorita con bordo di mattoni. */
export function flowerBed() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(1.3, 0.2, 0.7), 0xa1553a, 0, 0.1, 0);
  part(g, new THREE.BoxGeometry(1.2, 0.06, 0.6), 0x5d4037, 0, 0.21, 0);
  const cols = [0xff4f9a, 0xffc21a, 0xffffff, 0x8e5bd6, 0xff7043];
  for (let i = 0; i < 12; i++) {
    const x = -0.5 + (i % 6) * 0.2;
    const z = i < 6 ? -0.15 : 0.15;
    part(g, new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), 0x2e7d32, x, 0.38, z);
    part(g, new THREE.IcosahedronGeometry(0.075, 0), cols[i % cols.length], x, 0.55, z);
  }
  return g;
}

/** Scivolo per bambini. */
export function slide() {
  const g = new THREE.Group();
  for (const x of [-0.3, 0.3]) {
    part(g, new THREE.BoxGeometry(0.06, 1.2, 0.06), 0x2d9cdb, x, 0.6, -0.5);
    part(g, new THREE.BoxGeometry(0.06, 1.2, 0.06), 0x2d9cdb, x, 0.6, -0.1);
  }
  part(g, new THREE.BoxGeometry(0.66, 0.06, 0.5), 0xffc21a, 0, 1.2, -0.3);
  const ramp = part(g, new THREE.BoxGeometry(0.5, 0.05, 1.3), 0xff5d73, 0, 0.68, 0.45);
  ramp.rotation.x = 0.72;
  for (let i = 0; i < 4; i++) {
    const r = part(g, new THREE.BoxGeometry(0.6, 0.04, 0.06), 0xffffff, 0, 0.25 + i * 0.25, -0.62);
    r.rotation.x = 0;
  }
  return g;
}

/** Tavolino da giardino con due sedie. */
export function patioSet() {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.45, 0.45, 0.05, 18), 0xffffff, 0, 0.72, 0);
  part(g, new THREE.CylinderGeometry(0.04, 0.06, 0.72, 8), 0x9e9e9e, 0, 0.36, 0);
  for (const x of [-0.7, 0.7]) {
    part(g, new THREE.BoxGeometry(0.4, 0.05, 0.4), 0x8d6e63, x, 0.45, 0);
    part(g, new THREE.BoxGeometry(0.05, 0.45, 0.4), 0x8d6e63, x + (x < 0 ? -0.18 : 0.18), 0.7, 0);
    for (const dx of [-0.16, 0.16]) for (const dz of [-0.16, 0.16]) part(g, new THREE.BoxGeometry(0.04, 0.45, 0.04), 0x6d4c41, x + dx, 0.22, dz);
  }
  return g;
}

/** Vaso grande con pianta. */
export function bigPlanter() {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.32, 0.24, 0.5, 14), 0xc96f3b, 0, 0.25, 0);
  const mat = lamb(0x2e7d32);
  for (let i = 0; i < 6; i++) {
    const leaf = part(g, new THREE.ConeGeometry(0.09, 0.7, 5), mat, (Math.random() - 0.5) * 0.25, 0.8, (Math.random() - 0.5) * 0.25);
    leaf.rotation.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
  }
  return g;
}

/**
 * Telone che copre un oggetto, su misura: un telo morbido che si appoggia sull'oggetto
 * (preso dal suo ingombro), con la cima tondeggiante, le pieghe e il bordo che si allarga a terra.
 */
export function tarpFor(obj: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const hx = size.x / 2 + 0.12;
  const hz = size.z / 2 + 0.12;
  const h = size.y + 0.06;
  // semisfera trasformata: pianta quasi quadrata (come l'oggetto), cima appiattita
  const geo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const seed = Math.random() * 10;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = Math.hypot(v.x, v.z);
    const a = Math.atan2(v.z, v.x);
    // da cerchio a "quadrato arrotondato"
    const sq = 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)), 0.001);
    const k = Math.pow(sq, 0.75);
    let x = Math.cos(a) * r * k;
    let z = Math.sin(a) * r * k;
    // cima piatta che scende morbida ai lati, bordo allargato a terra
    const t = v.y; // 0 a terra, 1 in cima
    let y = Math.min(1, t * 1.6) * h;
    const flare = 1 + Math.max(0, 0.35 - t) * 0.45;
    x *= hx * flare;
    z *= hz * flare;
    // pieghe del telo
    const wr = Math.sin(a * 9 + seed) * 0.03 * (1 - t) + Math.sin(x * 6 + z * 5 + seed) * 0.02;
    x += Math.cos(a) * wr;
    z += Math.sin(a) * wr;
    if (t > 0.6) y += Math.sin(x * 4 + seed) * Math.cos(z * 4) * 0.025;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  const tarp = new THREE.Mesh(geo, lamb(0x6fa8dc, { flatShading: true, side: THREE.DoubleSide }));
  tarp.castShadow = true;
  const g = new THREE.Group();
  tarp.position.set(center.x - obj.position.x, 0.02, center.z - obj.position.z);
  g.add(tarp);
  // corda gialla che lo tiene giù
  const rope = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 6, 32), lamb(0xffc21a));
  rope.rotation.x = Math.PI / 2;
  rope.scale.set(hx * 1.08, hz * 1.08, 1);
  rope.position.set(center.x - obj.position.x, h * 0.18, center.z - obj.position.z);
  g.add(rope);
  return g;
}

/** Tratto di recinzione in muratura (muretto basso con copertina). `body` è la parte da dipingere. */
export function fenceSegment(len: number) {
  const g = new THREE.Group();
  const body = part(g, new THREE.BoxGeometry(len, 0.75, 0.22), 0x9e9e9e, 0, 0.375, 0);
  part(g, new THREE.BoxGeometry(len + 0.04, 0.08, 0.3), 0xbdbdbd, 0, 0.79, 0);
  return { obj: g, body };
}

/** Pilastro della recinzione (agli angoli e al cancello). */
export function fencePillar() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.34, 1.0, 0.34), 0xbdbdbd, 0, 0.5, 0);
  part(g, new THREE.BoxGeometry(0.4, 0.08, 0.4), 0x9e9e9e, 0, 1.04, 0);
  return g;
}

// ---------------- lavaggio auto ----------------

/** Spruzzino del sapone (tanica rosa con pompa e lancia). */
export function soapSprayer() {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.2, 0.22, 0.6, 16), 0xff6fae, 0, 0.3, 0);
  part(g, new THREE.CylinderGeometry(0.08, 0.08, 0.12, 10), 0xffffff, 0, 0.66, 0);
  part(g, new THREE.BoxGeometry(0.04, 0.3, 0.04), 0x37474f, 0, 0.85, 0);
  part(g, new THREE.BoxGeometry(0.22, 0.04, 0.04), 0x37474f, 0, 1.0, 0);
  const lance = part(g, new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), 0x37474f, 0.25, 0.5, 0.15);
  lance.rotation.z = 0.5;
  // bolle sul tappo
  for (let i = 0; i < 3; i++) part(g, new THREE.SphereGeometry(0.05, 8, 6), lamb(0xffffff, { transparent: true, opacity: 0.85 }), -0.1 + i * 0.1, 0.62, 0.15);
  return g;
}

/** Avvolgitubo verde con la canna dell'acqua. */
export function hoseReel() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.08, 0.7, 0.5), 0x455a64, -0.25, 0.35, 0);
  part(g, new THREE.BoxGeometry(0.08, 0.7, 0.5), 0x455a64, 0.25, 0.35, 0);
  const drum = part(g, new THREE.CylinderGeometry(0.28, 0.28, 0.42, 18), 0x2e7d32, 0, 0.5, 0);
  drum.rotation.z = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const coil = part(g, new THREE.TorusGeometry(0.29, 0.035, 6, 20), 0x43a047, -0.15 + i * 0.1, 0.5, 0);
    coil.rotation.y = Math.PI / 2;
  }
  const nozzle = part(g, new THREE.CylinderGeometry(0.04, 0.03, 0.25, 8), 0xffc21a, 0.1, 0.12, 0.35);
  nozzle.rotation.x = Math.PI / 2;
  return g;
}

/** Secchio blu pieno di stracci colorati. */
export function ragBucket() {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.26, 0.2, 0.42, 16), 0x2d9cdb, 0, 0.21, 0);
  const cols = [0xffc21a, 0xff5d73, 0xffffff];
  cols.forEach((c, i) => {
    const r = part(g, new THREE.BoxGeometry(0.22, 0.08, 0.3), c, -0.08 + i * 0.08, 0.45 + i * 0.03, (i - 1) * 0.06);
    r.rotation.set(0.3 * i, i, 0.2);
  });
  const h = part(g, new THREE.TorusGeometry(0.22, 0.012, 6, 18, Math.PI), 0x90a4ae, 0, 0.42, 0);
  h.rotation.y = Math.PI / 2;
  return g;
}

// ---------------- consegne ----------------

/** Edicola: chiosco verde con tettoia a strisce, insegna, giornali e riviste in esposizione. */
export function newsstand() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(2.2, 1.1, 1.3), 0x2e7d32, 0, 0.55, -0.2);
  part(g, new THREE.BoxGeometry(2.3, 0.08, 1.45), 0x1b5e20, 0, 1.12, -0.15);
  // vetrina e parete alta
  part(g, new THREE.BoxGeometry(2.2, 1.1, 0.12), 0x2e7d32, 0, 1.7, -0.8);
  for (const x of [-1.05, 1.05]) part(g, new THREE.BoxGeometry(0.1, 1.2, 0.1), 0x1b5e20, x, 1.7, 0.4);
  part(g, new THREE.BoxGeometry(2.4, 0.1, 1.5), 0x1b5e20, 0, 2.3, -0.2);
  // tettoia a strisce
  const stripe = document.createElement('canvas');
  stripe.width = 128;
  stripe.height = 16;
  const sg = stripe.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    sg.fillStyle = i % 2 ? '#ffffff' : '#2e9b4a';
    sg.fillRect(i * 16, 0, 16, 16);
  }
  const st = new THREE.CanvasTexture(stripe);
  st.colorSpace = THREE.SRGBColorSpace;
  const awn = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.06, 0.8), new THREE.MeshLambertMaterial({ map: st }));
  awn.position.set(0, 2.18, 0.75);
  awn.rotation.x = -0.35;
  g.add(awn);
  // insegna
  const s = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.45, 0.08), [lamb(0xffc21a), lamb(0xffc21a), lamb(0xffc21a), lamb(0xffc21a), new THREE.MeshLambertMaterial({ map: signTex('📰 EDICOLA', '#ffc21a', '#1b3d1f') }), lamb(0xffc21a)]);
  s.position.set(0, 2.62, 0.3);
  g.add(s);
  // giornali sul bancone e riviste appese
  const papers = [0xffffff, 0xf5f0e1, 0xffffff];
  papers.forEach((c, i) => part(g, new THREE.BoxGeometry(0.42, 0.14 + i * 0.04, 0.3), c, -0.6 + i * 0.6, 1.2 + (0.07 + i * 0.02), 0.2));
  const mags = [0xff5d73, 0x2d9cdb, 0xffc21a, 0x8e5bd6, 0x35c46a, 0xff8a3d];
  mags.forEach((c, i) => part(g, new THREE.BoxGeometry(0.28, 0.36, 0.02), c, -0.85 + (i % 6) * 0.34, 1.75, -0.72));
  return g;
}

/** Negozio dei pacchi: banco del corriere con scaffale di scatoloni, serranda e insegna. */
export function parcelShop() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(2.4, 2.4, 1.4), 0x6d4c41, 0, 1.2, -0.5);
  // apertura con serranda alzata e bancone
  part(g, new THREE.BoxGeometry(1.8, 1.3, 0.05), 0x3e2723, 0, 1.15, 0.21);
  part(g, new THREE.BoxGeometry(1.9, 0.18, 0.12), 0x9e9e9e, 0, 1.88, 0.24);
  part(g, new THREE.BoxGeometry(2.2, 1.0, 0.6), 0xffc21a, 0, 0.5, 0.5);
  part(g, new THREE.BoxGeometry(2.3, 0.06, 0.7), 0xffe082, 0, 1.03, 0.5);
  // scaffale con scatoloni dietro
  const boxCol = [0xc8a27a, 0xb08850, 0xd7b98e];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) part(g, new THREE.BoxGeometry(0.34, 0.3, 0.3), boxCol[(r + c) % 3], -0.6 + c * 0.4, 0.75 + r * 0.42, 0.12);
  // pacchi sul bancone
  part(g, new THREE.BoxGeometry(0.4, 0.3, 0.34), 0xc8a27a, -0.5, 1.2, 0.5);
  part(g, new THREE.BoxGeometry(0.3, 0.22, 0.28), 0xb08850, 0.4, 1.17, 0.5);
  // insegna
  const s = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.1), [lamb(0xd32f2f), lamb(0xd32f2f), lamb(0xd32f2f), lamb(0xd32f2f), new THREE.MeshLambertMaterial({ map: signTex('📦 PACCHI', '#d32f2f', '#ffffff') }), lamb(0xd32f2f)]);
  s.position.set(0, 2.68, 0.25);
  g.add(s);
  return g;
}

/**
 * Cassetta della posta riconoscibile: palo, cassetta col tetto a volta, busta disegnata sul fianco,
 * fessura e bandierina rossa alzata.
 */
export function postbox(color: number) {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.1, 1.0, 0.1), 0x5b4636, 0, 0.5, 0);
  part(g, new THREE.BoxGeometry(0.42, 0.34, 0.6), color, 0, 1.17, 0);
  const top = part(g, new THREE.CylinderGeometry(0.21, 0.21, 0.6, 16, 1, false, 0, Math.PI), color, 0, 1.34, 0);
  top.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  // sportello e fessura
  part(g, new THREE.BoxGeometry(0.36, 0.36, 0.03), 0xffffff, 0, 1.22, 0.31);
  part(g, new THREE.BoxGeometry(0.22, 0.03, 0.02), 0x212121, 0, 1.3, 0.33);
  // busta sui fianchi
  const env = signTex('✉', '#ffffff', '#d32f2f', 128, 96, 80);
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), new THREE.MeshLambertMaterial({ map: env }));
    m.position.set(sx * 0.215, 1.17, 0.02);
    m.rotation.y = (sx * Math.PI) / 2;
    g.add(m);
  }
  // bandierina alzata
  part(g, new THREE.BoxGeometry(0.03, 0.4, 0.03), 0xe53935, 0.24, 1.42, -0.1);
  part(g, new THREE.BoxGeometry(0.03, 0.14, 0.22), 0xe53935, 0.24, 1.55, 0.01);
  return g;
}
