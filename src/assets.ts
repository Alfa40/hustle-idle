import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();
const lambertCache = new Map<THREE.Material, THREE.Material>();

export const BASE = import.meta.env.BASE_URL + 'models/';

/** Lambert costa molto meno di Standard sul telefono e con i colormap Kenney si vede uguale. */
function toLambert(m: THREE.Material): THREE.Material {
  const hit = lambertCache.get(m);
  if (hit) return hit;
  const s = m as THREE.MeshStandardMaterial;
  const l = new THREE.MeshLambertMaterial({
    map: s.map ?? null,
    color: s.color ? s.color.clone() : new THREE.Color(0xffffff),
    transparent: s.transparent,
    opacity: s.opacity,
    side: s.side,
  });
  if (l.map) l.map.anisotropy = 2;
  lambertCache.set(m, l);
  return l;
}

function prepare(gltf: GLTF) {
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toLambert) : toLambert(mesh.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return gltf;
}

export function loadGLTF(path: string): Promise<GLTF> {
  let p = cache.get(path);
  if (!p) {
    p = loader.loadAsync(BASE + path).then(prepare);
    cache.set(path, p);
  }
  return p;
}

const loaded = new Map<string, GLTF>();
export async function preload(paths: string[], onProgress?: (f: number) => void) {
  let done = 0;
  await Promise.all(
    paths.map((p) =>
      loadGLTF(p).then((g) => {
        loaded.set(p, g);
        onProgress?.(++done / paths.length);
      }),
    ),
  );
}

export function gltf(path: string): GLTF {
  const g = loaded.get(path);
  if (!g) throw new Error('asset non precaricato: ' + path);
  return g;
}

/** Copia statica (condivide geometrie e materiali). */
export function model(path: string, scale = 1): THREE.Object3D {
  const o = gltf(path).scene.clone(true);
  o.scale.setScalar(scale);
  return o;
}

/** Copia con scheletro indipendente, per personaggi animati. */
export function skinned(path: string): { root: THREE.Object3D; clips: THREE.AnimationClip[] } {
  const g = gltf(path);
  return { root: SkeletonUtils.clone(g.scene), clips: g.animations };
}

/** Lato (in metri) dei riquadri in cui si divide la città per il disegno. */
const CHUNK = 36;

/**
 * Raggruppa tante copie dello stesso modello in InstancedMesh: una draw call
 * per ogni coppia geometria/materiale, fondamentale per strade e alberi.
 * Le copie sono divise in riquadri così la camera disegna solo quelli vicini.
 */
export class Instancer {
  private items = new Map<string, THREE.Matrix4[]>();
  add(path: string, matrix: THREE.Matrix4) {
    const cx = Math.floor(matrix.elements[12] / CHUNK);
    const cz = Math.floor(matrix.elements[14] / CHUNK);
    const key = `${path}|${cx},${cz}`;
    let arr = this.items.get(key);
    if (!arr) this.items.set(key, (arr = []));
    arr.push(matrix.clone());
  }
  build(parent: THREE.Object3D, opts: { castShadow?: boolean } = {}) {
    for (const [key, mats] of this.items) {
      const scene = gltf(key.split('|')[0]).scene;
      scene.updateMatrixWorld(true);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, mats.length);
        const tmp = new THREE.Matrix4();
        mats.forEach((m, i) => im.setMatrixAt(i, tmp.multiplyMatrices(m, mesh.matrixWorld)));
        im.castShadow = !!opts.castShadow;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        parent.add(im);
      });
    }
    this.items.clear();
  }
}

export function placeMatrix(x: number, z: number, rotY: number, scale: number, y = 0) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    new THREE.Vector3(scale, scale, scale),
  );
}
