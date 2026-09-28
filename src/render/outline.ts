import * as THREE from 'three';

/**
 * Contorni in stile cartoon: la scena si disegna in una texture con la sua
 * profondità, poi un unico passaggio a tutto schermo scurisce i pixel dove la
 * profondità cambia di colpo (bordi degli oggetti). Costa un solo disegno in più
 * di un rettangolo: leggero anche sul telefono.
 */
export class OutlineRenderer {
  private target: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private qScene = new THREE.Scene();
  private qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private size = new THREE.Vector2();

  constructor(private renderer: THREE.WebGLRenderer) {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
      samples: 0,
      type: THREE.HalfFloatType,
    });
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        texel: { value: new THREE.Vector2() },
        near: { value: 0.3 },
        far: { value: 400 },
        ink: { value: new THREE.Color(0x2a2140) },
        strength: { value: 0.85 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform vec2 texel;
        uniform float near;
        uniform float far;
        uniform vec3 ink;
        uniform float strength;
        varying vec2 vUv;
        float lin(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          return perspectiveDepthToViewZ(d, near, far) * -1.0;
        }
        void main() {
          vec4 col = texture2D(tColor, vUv);
          float c = lin(vUv);
          float dx = texel.x * 1.6;
          float dy = texel.y * 1.6;
          float l = lin(vUv - vec2(dx, 0.0));
          float r = lin(vUv + vec2(dx, 0.0));
          float u = lin(vUv + vec2(0.0, dy));
          float d = lin(vUv - vec2(0.0, dy));
          // bordo: il vicino è molto più lontano (silhouette sopra lo sfondo)
          float diff = max(max(l, r), max(u, d)) - c;
          float edge = smoothstep(0.012, 0.045, diff / max(c, 0.5));
          // niente contorni sul cielo lontanissimo
          edge *= step(c, far * 0.97);
          gl_FragColor = vec4(mix(col.rgb, ink, edge * strength), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.qScene.add(this.quad);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer.getDrawingBufferSize(this.size);
    if (this.target.width !== this.size.x || this.target.height !== this.size.y) {
      this.target.setSize(this.size.x, this.size.y);
    }
    this.mat.uniforms.texel.value.set(1 / this.size.x, 1 / this.size.y);
    this.mat.uniforms.near.value = camera.near;
    this.mat.uniforms.far.value = camera.far;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.qScene, this.qCam);
  }
}
