// Blob shadows: a soft dark ellipse on the planks under every zombie and
// falling body, one instanced draw call. Used on low quality, where the horde
// casts no real shadows (the key light's shadow map keeps only the Bosun,
// bosses and the set pieces).
import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute float aAlpha;
  varying vec2 vUv;
  varying float vAlpha;
  #include <fog_pars_vertex>
  void main() {
    vUv = position.xz;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const FRAG = /* glsl */ `
  uniform float uStrength;
  varying vec2 vUv;
  varying float vAlpha;
  #include <fog_pars_fragment>
  void main() {
    float r = length(vUv) * 2.0;
    float a = (1.0 - smoothstep(0.25, 1.0, r)) * uStrength * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }
`;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Blobs {
  readonly mesh: THREE.InstancedMesh;
  private alpha: THREE.InstancedBufferAttribute;
  private n = 0;
  private readonly cap: number;
  /** Off on medium / high (real shadows). */
  enabled = false;
  readonly mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, cap = 256) {
    this.cap = cap;
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aAlpha', this.alpha);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uStrength: { value: 0.42 }, ...THREE.UniformsLib.fog },
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(g, this.mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'BlobShadows';
    scene.add(this.mesh);
  }

  begin(): void {
    this.n = 0;
  }

  /** A blob at (x, z) with radii rx (along x) and rz, opacity k (0..1). */
  push(x: number, z: number, rx: number, rz: number, k = 1): void {
    if (!this.enabled || this.n >= this.cap) return;
    const i = this.n++;
    _m.compose(_p.set(x, 0.02, z), _q.setFromAxisAngle(UP, 0), _s.set(rx * 2, 1, rz * 2));
    this.mesh.setMatrixAt(i, _m);
    this.alpha.setX(i, k);
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.alpha.needsUpdate = true;
    }
  }

  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }
}
