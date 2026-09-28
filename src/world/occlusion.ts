import * as THREE from 'three';

const OPACITY = 0.3;

/** Materiale trasparente corrispondente (uno per ogni materiale originale). */
const ghostMats = new Map<THREE.Material, THREE.Material>();
function ghost(m: THREE.Material): THREE.Material {
  let g = ghostMats.get(m);
  if (!g) {
    g = m.clone();
    g.transparent = true;
    g.opacity = OPACITY;
    // scrive la profondità: si vede solo la superficie davanti, così le facce
    // interne dell'edificio non si sommano rendendolo di nuovo opaco
    g.depthWrite = true;
    ghostMats.set(m, g);
  }
  return g;
}
const ghostOf = (m: THREE.Material | THREE.Material[]) => (Array.isArray(m) ? m.map(ghost) : ghost(m));

interface Faded {
  restore: () => void;
  seen: number;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Rende trasparenti (30%) gli oggetti che si trovano fra la camera e ciò che
 * il giocatore deve vedere; tornano normali appena smettono di coprire.
 */
export class Occluder {
  private ray = new THREE.Raycaster();
  private faded = new Map<string, Faded>();
  private tick = 0;
  private scene: THREE.Scene | null = null;

  update(scene: THREE.Scene, camera: THREE.Camera, targets: THREE.Vector3[], exclude: THREE.Object3D[]) {
    if (scene !== this.scene) {
      this.clear();
      this.scene = scene;
    }
    this.tick++;
    const skip = new Set<THREE.Object3D>();
    for (const e of exclude) e.traverse((o) => skip.add(o));
    const from = camera.position;
    for (const t of targets) {
      const dir = t.clone().sub(from);
      const dist = dir.length();
      if (dist < 0.5) continue;
      this.ray.set(from, dir.normalize());
      this.ray.near = 0.2;
      this.ray.far = dist - 0.4;
      this.ray.camera = camera;
      const hits = this.ray.intersectObjects(scene.children, true);
      for (const h of hits) {
        const o = h.object as THREE.Mesh;
        // il "fantasma" di un oggetto già trasparente: continua a coprire, resta trasparente
        const k = o.userData.occKey as string | undefined;
        if (k) {
          const f = this.faded.get(k);
          if (f) f.seen = this.tick;
          continue;
        }
        if (!o.isMesh || skip.has(o) || !o.visible) continue;
        if ((o as unknown as THREE.Sprite).isSprite) continue;
        const mat = o.material as THREE.Material;
        if (!mat || (mat as THREE.MeshBasicMaterial).transparent) continue;
        const inst = o as THREE.InstancedMesh;
        if (inst.isInstancedMesh && h.instanceId !== undefined) this.fadeInstance(scene, inst, h.instanceId);
        else this.fadeObject(scene, o);
      }
    }
    // ciò che non copre più torna normale
    for (const [k, f] of this.faded) {
      if (f.seen !== this.tick) {
        f.restore();
        this.faded.delete(k);
      }
    }
  }

  /** Una copia di un palazzo/albero instanziato: si nasconde e al suo posto va un fantasma. */
  private fadeInstance(scene: THREE.Scene, inst: THREE.InstancedMesh, id: number) {
    const key = inst.uuid + ':' + id;
    const f = this.faded.get(key);
    if (f) {
      f.seen = this.tick;
      return;
    }
    const m = new THREE.Matrix4();
    inst.getMatrixAt(id, m);
    // le parti dello stesso edificio (tetto, muri…) sono InstancedMesh gemelle con lo stesso indice
    const twins = (inst.parent?.children ?? []).filter(
      (c) => (c as THREE.InstancedMesh).isInstancedMesh && (c as THREE.InstancedMesh).count > id && sameMatrix(c as THREE.InstancedMesh, id, m, inst),
    ) as THREE.InstancedMesh[];
    const ghosts: THREE.Mesh[] = [];
    const saved: { im: THREE.InstancedMesh; m: THREE.Matrix4 }[] = [];
    for (const im of twins.length ? twins : [inst]) {
      const mm = new THREE.Matrix4();
      im.getMatrixAt(id, mm);
      const g = new THREE.Mesh(im.geometry, ghostOf(im.material));
      g.matrixAutoUpdate = false;
      g.matrix.multiplyMatrices(im.matrixWorld, mm);
      g.renderOrder = 5;
      g.userData.occKey = key;
      scene.add(g);
      ghosts.push(g);
      saved.push({ im, m: mm });
      im.setMatrixAt(id, ZERO);
      im.instanceMatrix.needsUpdate = true;
    }
    this.faded.set(key, {
      seen: this.tick,
      restore: () => {
        for (const g of ghosts) scene.remove(g);
        for (const s of saved) {
          s.im.setMatrixAt(id, s.m);
          s.im.instanceMatrix.needsUpdate = true;
        }
      },
    });
  }

  /** Un oggetto normale (mobile, cespuglio, cartello…): si schiarisce tutto il modello. */
  private fadeObject(scene: THREE.Scene, mesh: THREE.Object3D) {
    let root = mesh;
    while (root.parent && root.parent !== scene) root = root.parent;
    const key = root.uuid;
    const f = this.faded.get(key);
    if (f) {
      f.seen = this.tick;
      return;
    }
    const saved: { m: THREE.Mesh; mat: THREE.Material | THREE.Material[] }[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as unknown as THREE.Sprite).isSprite) return;
      saved.push({ m, mat: m.material });
      m.material = ghostOf(m.material);
      m.userData.occKey = key;
    });
    this.faded.set(key, {
      seen: this.tick,
      restore: () => {
        for (const s of saved) {
          s.m.material = s.mat;
          delete s.m.userData.occKey;
        }
      },
    });
  }

  clear() {
    for (const f of this.faded.values()) f.restore();
    this.faded.clear();
  }
}

/** Due InstancedMesh dello stesso modello hanno la stessa posizione per lo stesso indice. */
function sameMatrix(im: THREE.InstancedMesh, id: number, ref: THREE.Matrix4, src: THREE.InstancedMesh) {
  if (im === src) return true;
  const m = new THREE.Matrix4();
  im.getMatrixAt(id, m);
  const a = new THREE.Vector3().setFromMatrixPosition(m);
  const b = new THREE.Vector3().setFromMatrixPosition(ref);
  return a.distanceToSquared(b) < 1e-4 && im.count === src.count;
}
