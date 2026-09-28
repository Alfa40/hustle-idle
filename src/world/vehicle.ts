import * as THREE from 'three';
import { gltf, model } from '../assets';
import { VEHICLES, type VehicleId } from '../config/vehicles';

const mat = (color: number) => new THREE.MeshLambertMaterial({ color });

function wheel(r: number, w: number) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), mat(0x2b2b33));
  m.rotation.z = Math.PI / 2;
  m.castShadow = true;
  return m;
}

/** Monopattino: pedana, piantone e manubrio. Il fronte è +Z come i modelli Kenney. */
function kickScooter() {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.95), mat(0x2d9cdb));
  deck.position.y = 0.12;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 8), mat(0x3a3a44));
  stem.position.set(0, 0.62, 0.42);
  stem.rotation.x = -0.12;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), mat(0x3a3a44));
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.13, 0.48);
  const w1 = wheel(0.09, 0.06);
  w1.position.set(0, 0.09, 0.42);
  const w2 = wheel(0.09, 0.06);
  w2.position.set(0, 0.09, -0.4);
  g.add(deck, stem, bar, w1, w2);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** Scooter stile vespa. */
function vespa() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 1.25), mat(0xff8a3d));
  body.position.set(0, 0.42, -0.1);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.6), mat(0x3a2f55));
  seat.position.set(0, 0.7, -0.25);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.14), mat(0xff8a3d));
  shield.position.set(0, 0.62, 0.5);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.1), mat(0xdddddd));
  bar.position.set(0, 1.05, 0.55);
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.05), mat(0xffe066));
  light.position.set(0, 0.95, 0.6);
  const w1 = wheel(0.2, 0.12);
  w1.position.set(0, 0.2, 0.55);
  const w2 = wheel(0.2, 0.12);
  w2.position.set(0, 0.2, -0.55);
  g.add(body, seat, shield, bar, light, w1, w2);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export const VEHICLE_ASSETS = Object.values(VEHICLES).flatMap((v) => (v.model ? [v.model] : []));

const carScale = new Map<string, number>();

/** Modello 3D di un veicolo, pronto da agganciare al personaggio. */
export function vehicleModel(id: VehicleId): THREE.Object3D {
  const def = VEHICLES[id];
  if (def.kind === 'kick') return kickScooter();
  if (def.kind === 'scooter') return vespa();
  let sc = carScale.get(def.model!);
  if (!sc) {
    const size = new THREE.Box3().setFromObject(gltf(def.model!).scene).getSize(new THREE.Vector3());
    sc = 4 / size.z; // circa 4 metri di lunghezza
    carScale.set(def.model!, sc);
  }
  return model(def.model!, sc);
}

/** Altezza a cui sta il personaggio e animazione da usare in sella. */
export function riderPose(id: VehicleId) {
  const k = VEHICLES[id].kind;
  if (k === 'kick') return { y: 0.15, anim: 'idle', hidden: false };
  if (k === 'scooter') return { y: 0.28, anim: 'drive', hidden: false };
  return { y: 0, anim: 'idle', hidden: true };
}
