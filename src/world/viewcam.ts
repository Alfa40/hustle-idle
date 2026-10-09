import * as THREE from 'three';

/**
 * Regolazioni della camera in terza persona scelte dal giocatore:
 * rotazione attorno al punto inquadrato, zoom e inclinazione.
 */
export class ViewControl {
  yaw = 0;
  zoom = 1;
  /** radianti in più (+ = più dall'alto) */
  tilt = 0;
  private spinDir = 0;
  private zoomDir = 0;
  private tiltDir = 0;

  reset() {
    this.yaw = 0;
    this.zoom = 1;
    this.tilt = 0;
  }

  get changed() {
    return Math.abs(this.yaw) > 0.01 || Math.abs(this.zoom - 1) > 0.01 || Math.abs(this.tilt) > 0.01;
  }

  /** pulsanti tenuti premuti: -1, 0, +1 */
  hold(kind: 'spin' | 'zoom' | 'tilt', dir: number) {
    if (kind === 'spin') this.spinDir = dir;
    else if (kind === 'zoom') this.zoomDir = dir;
    else this.tiltDir = dir;
  }

  zoomBy(f: number) {
    this.zoom = THREE.MathUtils.clamp(this.zoom * f, 0.5, 1.6);
  }

  update(dt: number) {
    this.yaw += this.spinDir * dt * 1.8;
    if (this.zoomDir) this.zoomBy(Math.exp(-this.zoomDir * dt * 1.4));
    this.tilt = THREE.MathUtils.clamp(this.tilt + this.tiltDir * dt * 0.8, -0.55, 0.45);
  }

  /**
   * Mette la camera: `target` = punto inquadrato, `dist` e `pitch` = valori di base.
   * Più si fa zoom, più il punto inquadrato si avvicina a `follow` (il giocatore).
   */
  place(cam: THREE.PerspectiveCamera, target: THREE.Vector3, dist: number, pitch: number, follow?: THREE.Vector3, lookY = 0) {
    const t = target.clone();
    if (follow && this.zoom < 1) t.lerp(follow, THREE.MathUtils.clamp((1 - this.zoom) * 1.6, 0, 1));
    const p = THREE.MathUtils.clamp(pitch + this.tilt, 0.35, 1.45);
    const d = dist * this.zoom;
    const horiz = Math.cos(p) * d;
    cam.position.set(t.x + Math.sin(this.yaw) * horiz, t.y + Math.sin(p) * d, t.z + Math.cos(this.yaw) * horiz);
    cam.lookAt(t.x, t.y + lookY, t.z);
  }

  /** Joystick relativo allo schermo: "su" = lontano dalla camera. */
  toWorld(v: { x: number; y: number }) {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return { x: c * v.x + s * v.y, y: -s * v.x + c * v.y };
  }
}

/**
 * Campo visivo in prima persona: largo almeno ~60° anche col telefono in verticale (prima era
 * stretto, tutto sembrava enorme), senza deformare troppo. Restituisce il campo verticale in gradi.
 */
export function firstPersonFov(aspect: number) {
  const wantH = THREE.MathUtils.degToRad(80);
  const v = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(wantH / 2) / Math.max(0.3, aspect)));
  return THREE.MathUtils.clamp(v, 62, 100);
}

/** Parete che sparisce quando la camera la guarda da fuori (così si vede dentro la stanza). */
export interface CutWall {
  obj: THREE.Object3D;
  /** un punto sulla parete e la direzione verso l'esterno */
  at: THREE.Vector3;
  out: THREE.Vector3;
}

export function updateCutWalls(walls: CutWall[], cam: THREE.Camera) {
  const v = new THREE.Vector3();
  for (const w of walls) w.obj.visible = v.copy(cam.position).sub(w.at).dot(w.out) < 0.3;
}

/**
 * Sensibilità della visuale in prima persona (1 = trascinare per tutta la larghezza dello schermo fa
 * mezzo giro). Un po' più alta: si gira lo sguardo con meno strada del dito.
 */
export const LOOK_SENS = 1.3;
