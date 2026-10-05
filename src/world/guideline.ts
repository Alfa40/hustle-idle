import * as THREE from 'three';

let dashTex: THREE.CanvasTexture | null = null;

function texture() {
  if (dashTex) return dashTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 16;
  const g = c.getContext('2d')!;
  // un trattino arrotondato con la punta verso la meta
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.roundRect(4, 3, 30, 10, 5);
  g.fill();
  g.beginPath();
  g.moveTo(34, 1);
  g.lineTo(44, 8);
  g.lineTo(34, 15);
  g.closePath();
  g.fill();
  dashTex = new THREE.CanvasTexture(c);
  dashTex.wrapS = THREE.RepeatWrapping;
  dashTex.colorSpace = THREE.SRGBColorSpace;
  return dashTex;
}

const DASH = 0.9; // metri per trattino
/** altezza della linea in città: sopra l'asfalto */
const ROAD_Y = 0.2;

/**
 * Linea tratteggiata semitrasparente sul terreno dal giocatore all'obiettivo,
 * con i trattini che scorrono verso la meta.
 */
export class GuideLine {
  mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private offset = 0;

  constructor(color = 0xffffff, private width = 0.32) {
    this.mat = new THREE.MeshBasicMaterial({
      map: texture().clone(), color, transparent: true, opacity: 0.6, depthWrite: false,
    });
    this.mat.map!.wrapS = THREE.RepeatWrapping;
    this.mat.map!.needsUpdate = true;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    // la striscia parte dall'origine e si allunga verso +X
    geo.translate(0.5, 0, 0);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }

  /** Aggiorna la linea da `from` a `to` (null = nascosta). `stop` = metri lasciati liberi prima della meta. */
  update(dt: number, from: THREE.Vector3, to: THREE.Vector3 | null | undefined, stop = 0.7, start = 0.45) {
    if (!to) {
      this.mesh.visible = false;
      return;
    }
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const full = Math.hypot(dx, dz);
    const len = full - start - stop;
    if (len < 0.4) {
      this.mesh.visible = false;
      return;
    }
    const ux = dx / full;
    const uz = dz / full;
    this.mesh.visible = true;
    this.mesh.position.set(from.x + ux * start, 0.06, from.z + uz * start);
    this.mesh.rotation.y = -Math.atan2(uz, ux);
    this.mesh.scale.set(len, 1, this.width);
    this.offset -= dt * 1.4;
    const map = this.mat.map!;
    map.repeat.set(len / DASH, 1);
    map.offset.x = this.offset;
  }
}

/**
 * Linea tratteggiata che segue un percorso (più tratti dritti): i trattini scorrono verso la meta
 * senza interruzioni agli angoli. Si usa in città per seguire le strade.
 */
export class RouteLine {
  group = new THREE.Group();
  private segs: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  private offset = 0;

  constructor(private color = 0xffffff, private width = 0.32) {
    this.group.renderOrder = 3;
  }

  private seg(i: number) {
    while (this.segs.length <= i) {
      const mat = new THREE.MeshBasicMaterial({ map: texture().clone(), color: this.color, transparent: true, opacity: 0.6, depthWrite: false });
      mat.map!.wrapS = THREE.RepeatWrapping;
      mat.map!.needsUpdate = true;
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0.5, 0, 0);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.segs.push({ mesh, mat });
    }
    return this.segs[i];
  }

  /** Aggiorna il percorso (null = nascosta). `start`/`stop` = metri lasciati liberi all'inizio e alla fine. */
  update(dt: number, pts: THREE.Vector3[] | null, stop = 0.7, start = 0.45) {
    let used = 0;
    if (pts && pts.length >= 2) {
      const total = pts.reduce((a, p, i) => (i ? a + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0);
      this.offset -= dt * 1.4;
      let dist = 0;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const full = Math.hypot(b.x - a.x, b.z - a.z);
        // si taglia l'inizio (vicino al giocatore) e la fine (vicino alla meta)
        const t0 = Math.max(0, start - dist);
        const t1 = Math.min(full, total - stop - dist);
        dist += full;
        if (t1 - t0 < 0.3 || full < 0.01) continue;
        const ux = (b.x - a.x) / full;
        const uz = (b.z - a.z) / full;
        const s = this.seg(used++);
        s.mesh.visible = true;
        // sopra l'asfalto delle strade (il modello della strada ha un po' di spessore)
        s.mesh.position.set(a.x + ux * t0, ROAD_Y, a.z + uz * t0);
        s.mesh.rotation.y = -Math.atan2(uz, ux);
        s.mesh.scale.set(t1 - t0, 1, this.width);
        const map = s.mat.map!;
        map.repeat.set((t1 - t0) / DASH, 1);
        // fase continua lungo tutto il percorso
        map.offset.x = this.offset + (dist - full + t0) / DASH;
      }
    }
    for (let i = used; i < this.segs.length; i++) this.segs[i].mesh.visible = false;
  }
}
