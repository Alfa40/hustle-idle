import * as THREE from 'three';

const WHITE = new THREE.Color(0xffffff);

/**
 * L'oggetto che serve per l'azione disponibile adesso "pulsa": il suo colore si accende e si
 * spegne (luce propria, niente cerchi sullo schermo). Un solo oggetto alla volta; quando cambia
 * si rimettono i materiali originali.
 */
export class PulseGlow {
  private obj: THREE.Object3D | null = null;
  private meshes: { m: THREE.Mesh; orig: THREE.Material | THREE.Material[]; mats: THREE.MeshLambertMaterial[] }[] = [];

  set(o: THREE.Object3D | null | undefined) {
    const next = o ?? null;
    if (next === this.obj) return;
    for (const { m, orig } of this.meshes) m.material = orig;
    this.meshes = [];
    this.obj = next;
    if (!next) return;
    next.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh || (m as unknown as THREE.Sprite).isSprite) return;
      const orig = m.material;
      const mats: THREE.MeshLambertMaterial[] = [];
      const glow = (mat: THREE.Material) => {
        const g = mat.clone() as THREE.MeshLambertMaterial;
        if (!('emissive' in g)) return mat;
        // un colore già saturo non diventa "più colorato": si schiarisce verso il bianco
        g.emissive = (g.color ? g.color.clone() : new THREE.Color(0xffffff)).lerp(WHITE, 0.3);
        if (g.map) g.emissiveMap = g.map;
        mats.push(g);
        return g;
      };
      m.material = Array.isArray(orig) ? orig.map(glow) : glow(orig);
      this.meshes.push({ m, orig, mats });
    });
  }

  /** Intensità che sale e scende (un battito al secondo circa). */
  update() {
    if (!this.obj) return;
    const k = 0.15 + 0.6 * (0.5 + 0.5 * Math.sin(performance.now() / 160));
    for (const { mats } of this.meshes) for (const mat of mats) mat.emissiveIntensity = k;
  }
}
