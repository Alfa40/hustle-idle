import * as THREE from 'three';
import { gltf, skinned } from '../assets';

export const CHAR_HEIGHT = 1.45;
const heights = new Map<string, number>();

export const charPath = (name: string) => `chars/${name}.glb`;

/** Personaggio Kenney animato (idle, walk, sprint, pick-up, interact…). */
export class Character {
  root = new THREE.Group();
  body: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;
  currentName = '';
  /** oggetto tenuto in mano (pacco, piatto…) */
  held?: THREE.Object3D;

  constructor(name: string) {
    const path = charPath(name);
    const { root, clips } = skinned(path);
    this.body = root;
    let h = heights.get(path);
    if (!h) {
      // i SkinnedMesh non danno un box affidabile a riposo: misuriamo lo scheletro
      const box = new THREE.Box3().setFromObject(gltf(path).scene, true);
      h = box.getSize(new THREE.Vector3()).y || 1;
      heights.set(path, h);
    }
    root.scale.setScalar(CHAR_HEIGHT / h);
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    this.root.add(root);
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c));
    this.play('idle');
  }

  play(name: string, fade = 0.18, timeScale = 1) {
    const a = this.actions.get(name);
    if (!a) return;
    a.timeScale = timeScale;
    if (this.current === a) return;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = a;
    this.currentName = name;
  }

  /** animazione una tantum, poi torna a `then` */
  once(name: string, then = 'idle') {
    const a = this.actions.get(name);
    if (!a) return;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    this.current?.fadeOut(0.1);
    a.reset().fadeIn(0.1).play();
    this.current = a;
    this.currentName = name;
    const onDone = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== a) return;
      this.mixer.removeEventListener('finished', onDone);
      if (this.current === a) {
        this.current = undefined;
        this.play(then, 0.15);
      }
    };
    this.mixer.addEventListener('finished', onDone);
  }

  hold(obj?: THREE.Object3D) {
    if (this.held) this.root.remove(this.held);
    this.held = obj;
    if (obj) {
      obj.position.set(0, CHAR_HEIGHT * 0.52, 0.42);
      this.root.add(obj);
    }
  }

  faceTowards(x: number, z: number, dt: number, speed = 12) {
    const target = Math.atan2(x - this.root.position.x, z - this.root.position.z);
    let d = target - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * speed);
  }

  update(dt: number) {
    this.mixer.update(dt);
  }
}
