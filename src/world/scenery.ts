import * as THREE from 'three';
import { Instancer, placeMatrix } from '../assets';

// generatore deterministico: il paesaggio è sempre uguale
let seed = 777;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/** Cielo a gradiente che segue la camera, con il sole che cambia con l'ora. */
export class Sky {
  mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(0x4fa3e0) },
        horizon: { value: new THREE.Color(0xcfeaf7) },
        sunDir: { value: new THREE.Vector3(0.3, 0.6, 0.4).normalize() },
        sunColor: { value: new THREE.Color(0xfff2c0) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          col += sunColor * (pow(s, 600.0) * 1.5 + pow(s, 12.0) * 0.25);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  set(top: THREE.Color, horizon: THREE.Color, sunDir: THREE.Vector3, sunColor: THREE.Color) {
    this.mat.uniforms.top.value.copy(top);
    this.mat.uniforms.horizon.value.copy(horizon);
    this.mat.uniforms.sunDir.value.copy(sunDir).normalize();
    this.mat.uniforms.sunColor.value.copy(sunColor);
  }

  follow(camera: THREE.Camera) {
    this.mesh.position.copy(camera.position);
  }
}

/** Nuvole low-poly che si spostano lentamente. */
export class Clouds {
  group = new THREE.Group();
  private items: THREE.Object3D[] = [];

  constructor(private extent: number) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa4b8, emissiveIntensity: 0.35, flatShading: true });
    const geo = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(geo, mat);
        const r = 4 + rnd() * 5;
        m.scale.set(r * 1.4, r * 0.7, r);
        m.position.set((k - n / 2) * 6 + rnd() * 3, rnd() * 2, rnd() * 5);
        c.add(m);
      }
      c.position.set((rnd() - 0.5) * extent * 2, 55 + rnd() * 25, (rnd() - 0.5) * extent * 2);
      this.group.add(c);
      this.items.push(c);
    }
  }

  update(dt: number) {
    for (const c of this.items) {
      c.position.x += dt * 1.6;
      if (c.position.x > this.extent) c.position.x = -this.extent;
    }
  }

  setTint(day: number) {
    const m = (this.items[0].children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial;
    m.emissiveIntensity = 0.1 + 0.3 * day;
  }
}

/**
 * Tutto quello che circonda la città: prato con sfumature, anello di boschi,
 * colline e un lago. `half` è mezzo lato della città in metri.
 */
export function buildLandscape(half: number, trees: string[]) {
  seed = 777;
  const g = new THREE.Group();
  const size = half * 2 + 520;

  // terreno con leggere variazioni di colore (colori per vertice, nessuna texture)
  const geo = new THREE.PlaneGeometry(size, size, 60, 60);
  geo.rotateX(-Math.PI / 2);
  const colors: number[] = [];
  const pos = geo.attributes.position;
  const base = new THREE.Color(0x86c06c);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 0.045) * Math.cos(z * 0.038) + Math.sin((x + z) * 0.021) * 0.6;
    c.copy(base).offsetHSL(0.015 * n, 0.04 * n, 0.035 * n);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  g.add(ground);

  // lago a est
  const lake = { x: half + 70, z: -40, r: 38 };
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(lake.r, 40),
    new THREE.MeshLambertMaterial({ color: 0x3f9bd6, emissive: 0x0d3a5c, emissiveIntensity: 0.35 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(lake.x, 0.02, lake.z);
  g.add(water);
  const shore = new THREE.Mesh(new THREE.RingGeometry(lake.r, lake.r + 4, 40), new THREE.MeshLambertMaterial({ color: 0xe9d9a6 }));
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(lake.x, 0.015, lake.z);
  g.add(shore);
  const nearLake = (x: number, z: number, pad: number) => Math.hypot(x - lake.x, z - lake.z) < lake.r + pad;

  // colline basse attorno
  const hillGeo = new THREE.IcosahedronGeometry(1, 1);
  const hillMats = [0x6fae5a, 0x79b964, 0x5f9f50].map((col) => new THREE.MeshLambertMaterial({ color: col, flatShading: true }));
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2;
    const d = half + 90 + rnd() * 150;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (nearLake(x, z, 30)) continue;
    const h = new THREE.Mesh(hillGeo, hillMats[i % 3]);
    const r = 18 + rnd() * 28;
    h.scale.set(r, r * (0.25 + rnd() * 0.3), r * (0.8 + rnd() * 0.4));
    h.position.set(x, -2, z);
    h.rotation.y = rnd() * 6;
    h.receiveShadow = true;
    g.add(h);
  }

  // boschi: fascia di alberi appena fuori città
  const inst = new Instancer();
  for (let i = 0; i < 520; i++) {
    const a = rnd() * Math.PI * 2;
    const d = half + 8 + Math.pow(rnd(), 0.7) * 85;
    // distribuzione quadrata (la città è quadrata)
    const x = Math.max(-1, Math.min(1, Math.cos(a) * 1.4)) * d;
    const z = Math.max(-1, Math.min(1, Math.sin(a) * 1.4)) * d;
    if (Math.abs(x) < half + 5 && Math.abs(z) < half + 5) continue;
    if (nearLake(x, z, 6)) continue;
    inst.add(trees[i % trees.length], placeMatrix(x, z, rnd() * 6.28, 6 + rnd() * 5));
  }
  inst.build(g, { castShadow: false });
  return g;
}
