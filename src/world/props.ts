import { gltf, model } from '../assets';
import * as THREE from 'three';

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let exclTex: THREE.Texture | undefined;
/** Il "!" giallo sopra gli NPC che offrono lavoro. */
export function exclamation() {
  exclTex ??= canvasTexture(128, 128, (g) => {
    g.fillStyle = '#ffcc1a';
    g.strokeStyle = '#6b4a00';
    g.lineWidth = 8;
    g.beginPath();
    g.arc(64, 64, 54, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#3a2800';
    g.font = '700 84px Fredoka, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', 64, 70);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: exclTex, depthTest: false }));
  s.scale.setScalar(0.9);
  s.renderOrder = 10;
  return s;
}

/** Etichetta di testo sempre rivolta alla camera. */
export function label(text: string, opts: { bg?: string; fg?: string; scale?: number } = {}) {
  const fontPx = 44;
  const pad = 18;
  const tmp = document.createElement('canvas').getContext('2d')!;
  tmp.font = `600 ${fontPx}px Fredoka, system-ui, sans-serif`;
  const w = Math.ceil(tmp.measureText(text).width) + pad * 2;
  const h = fontPx + pad * 1.4;
  const tex = canvasTexture(w, h, (g) => {
    g.fillStyle = opts.bg ?? '#ffffff';
    const r = h / 2;
    g.beginPath();
    g.roundRect(0, 0, w, h, r);
    g.fill();
    g.fillStyle = opts.fg ?? (opts.bg ? '#fff' : '#3a2f55');
    g.font = `600 ${fontPx}px Fredoka, system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  const sc = opts.scale ?? 0.5;
  s.scale.set((w / h) * sc, sc, 1);
  s.renderOrder = 11;
  return s;
}

/** Anello a terra che segna un obiettivo. */
export function ring(color = 0xffcc1a, radius = 1.1) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.72, radius, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.05;
  m.renderOrder = 2;
  return m;
}

/** Freccia fluttuante che indica dove andare. */
export function arrow(color = 0xffcc1a) {
  const g = new THREE.ConeGeometry(0.35, 0.7, 4);
  g.rotateX(Math.PI);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
  return m;
}

/** Cespuglio incolto da tagliare. */
export function bush() {
  const grp = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a });
  const geo = new THREE.IcosahedronGeometry(0.45, 0);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set((Math.random() - 0.5) * 0.5, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5);
    m.scale.setScalar(0.7 + Math.random() * 0.5);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    m.castShadow = true;
    grp.add(m);
  }
  return grp;
}

/** Cespuglio potato (dopo il taglio). */
export function trimmedBush() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshLambertMaterial({ color: 0x5fb44f }));
  m.position.y = 0.3;
  m.scale.y = 0.8;
  m.castShadow = true;
  return m;
}

/** Bacheca delle missioni in piazza. */
export function board() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a36 });
  for (const x of [-0.9, 0.9]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), wood);
    post.position.set(x, 1.1, 0);
    post.castShadow = true;
    g.add(post);
  }
  const tex = canvasTexture(256, 160, (c) => {
    c.fillStyle = '#c99c62';
    c.fillRect(0, 0, 256, 160);
    const papers = ['#fff8e1', '#e3f2fd', '#fce4ec', '#f1f8e9'];
    for (let i = 0; i < 6; i++) {
      c.fillStyle = papers[i % 4];
      c.save();
      c.translate(30 + (i % 3) * 80, 30 + Math.floor(i / 3) * 70);
      c.rotate((Math.random() - 0.5) * 0.2);
      c.fillRect(0, 0, 60, 52);
      c.fillStyle = '#d33';
      c.beginPath();
      c.arc(30, 5, 4, 0, 7);
      c.fill();
      c.restore();
    }
  });
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 1.3, 0.1),
    [wood, wood, wood, wood, new THREE.MeshLambertMaterial({ map: tex }), wood],
  );
  panel.position.y = 1.55;
  panel.castShadow = true;
  g.add(panel);
  const top = label('📋 BACHECA', { bg: '#8e5bd6', scale: 0.55 });
  top.position.y = 2.65;
  g.add(top);
  return g;
}

/** Cartello "in vendita" per i lotti liberi. */
export function saleSign(text: string) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
  post.position.y = 0.7;
  g.add(post);
  const tex = canvasTexture(256, 128, (c) => {
    c.fillStyle = '#e53935';
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#fff';
    c.font = '700 40px Fredoka, system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('IN VENDITA', 128, 52);
    c.font = '600 34px Fredoka, system-ui, sans-serif';
    c.fillText(text, 128, 100);
  });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.65, 0.06), new THREE.MeshLambertMaterial({ map: tex }));
  panel.position.y = 1.5;
  panel.castShadow = true;
  g.add(panel);
  return g;
}

let dotTex: THREE.Texture | undefined;
/** Pallino sopra la testa del giocatore, visibile anche dietro gli edifici. */
export function playerDot() {
  dotTex ??= canvasTexture(64, 64, (g) => {
    g.fillStyle = '#4cd07d';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(32, 58);
    g.lineTo(8, 16);
    g.lineTo(56, 16);
    g.closePath();
    g.fill();
    g.stroke();
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, depthTest: false, transparent: true }));
  s.scale.setScalar(0.45);
  s.renderOrder = 12;
  return s;
}


const sizeCache = new Map<string, number>();
/**
 * Oggetto 3D di un prodotto (in mano o sul bancone), normalizzato a `size` metri.
 * I prodotti senza modello (es. gioielli) sono costruiti con forme semplici.
 */
export function productObject(modelPath: string | undefined, size: number): THREE.Object3D {
  if (!modelPath) {
    const g = new THREE.Group();
    const gold = new THREE.MeshLambertMaterial({ color: 0xffc21a, emissive: 0x553300 });
    const r = new THREE.Mesh(new THREE.TorusGeometry(size * 0.3, size * 0.07, 8, 20), gold);
    r.rotation.x = Math.PI / 2.5;
    r.position.y = size * 0.3;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(size * 0.12), new THREE.MeshLambertMaterial({ color: 0x5ad1ff, emissive: 0x114466 }));
    gem.position.set(0, size * 0.62, 0);
    g.add(r, gem);
    return g;
  }
  let max = sizeCache.get(modelPath);
  if (!max) {
    const s = new THREE.Box3().setFromObject(gltf(modelPath).scene).getSize(new THREE.Vector3());
    max = Math.max(s.x, s.y, s.z) || 1;
    sizeCache.set(modelPath, max);
  }
  return model(modelPath, size / max);
}
