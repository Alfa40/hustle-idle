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
