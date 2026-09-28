import * as THREE from 'three';
import { gltf } from '../assets';

/**
 * Finestre illuminate: dal colormap di ogni edificio si ricava una mappa che
 * accende solo i pixel "vetro" (azzurri). Di notte l'intensità sale.
 */
export class WindowLights {
  private mats = new Set<THREE.MeshLambertMaterial>();

  constructor(paths: string[]) {
    const maps = new Map<THREE.Texture, THREE.Texture | null>();
    for (const path of paths) {
      gltf(path).scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
        if (!m || !(o as THREE.Mesh).isMesh || !m.map || this.mats.has(m)) return;
        if (!maps.has(m.map)) maps.set(m.map, glassMask(m.map));
        const em = maps.get(m.map);
        if (!em) return;
        m.emissiveMap = em;
        m.emissive = new THREE.Color(0xffc86b);
        m.emissiveIntensity = 0;
        m.needsUpdate = true;
        this.mats.add(m);
      });
    }
  }

  /** 0 = giorno, 1 = notte piena */
  set(night: number) {
    for (const m of this.mats) m.emissiveIntensity = night * 1.1;
  }
}

function glassMask(map: THREE.Texture): THREE.Texture | null {
  const img = map.image as CanvasImageSource & { width: number; height: number };
  if (!img?.width) return null;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  let hits = 0;
  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i];
    const gg = d.data[i + 1];
    const b = d.data[i + 2];
    // vetro: azzurro deciso (103,148,217) o vetro chiaro (208,232,255);
    // i grigio-azzurri dei cornicioni restano spenti
    const glass = (b - r > 80 && b > 180 && gg > r) || (r > 190 && gg > 220 && b > 250);
    if (glass) hits++;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = glass ? 255 : 0;
    d.data[i + 3] = 255;
  }
  if (!hits) return null;
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = map.flipY;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,240,200,1)');
  grd.addColorStop(0.35, 'rgba(255,210,120,0.55)');
  grd.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Lampioni accesi: alone luminoso sulla lampada e cerchio di luce a terra. */
export class StreetLights {
  group = new THREE.Group();
  private glowMat: THREE.PointsMaterial;
  private poolMat: THREE.MeshBasicMaterial;

  constructor(heads: THREE.Vector3[]) {
    const tex = glowTexture();
    const geo = new THREE.BufferGeometry().setFromPoints(heads);
    this.glowMat = new THREE.PointsMaterial({
      size: 2.6, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: true,
    });
    const pts = new THREE.Points(geo, this.glowMat);
    pts.frustumCulled = false;
    this.group.add(pts);
    this.poolMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(5.5, 5.5).rotateX(-Math.PI / 2), this.poolMat, heads.length);
    const m = new THREE.Matrix4();
    heads.forEach((h, i) => pool.setMatrixAt(i, m.makeTranslation(h.x, 0.07, h.z)));
    pool.frustumCulled = false;
    pool.renderOrder = 1;
    this.group.add(pool);
  }

  set(night: number) {
    this.glowMat.opacity = night;
    this.poolMat.opacity = night * 0.9;
    this.group.visible = night > 0.02;
  }
}
