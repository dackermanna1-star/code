// The lighthouse beam where it matters for play: when one of the two rotating
// beams (see Backdrop) swings toward us, a spotlight sweeps across the deck
// (lighting zombies, planks and water as it passes) and a volumetric-looking
// shaft cuts through the night air from the top left of the frame.
import * as THREE from 'three';

/** Where the beam comes from in gameplay space (off-frame, top left, toward the lighthouse). */
const ORIGIN = new THREE.Vector3(-64, 30, -86);
/** Ground point the sweep is centred on. */
const CENTRE = new THREE.Vector3(0, 0, 0);

const SHAFT_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vAlong;
  varying vec3 vWorld;
  void main() {
    vAlong = uv.y;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const SHAFT_FRAG = /* glsl */ `
  uniform float uLevel, uTime;
  uniform vec3 uColor;
  varying vec3 vN;
  varying vec3 vV;
  varying float vAlong;
  varying vec3 vWorld;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float core = pow(f, 3.0);
    // Drifting mist in the beam.
    float mist = 0.65 + 0.35 * n2(vWorld.xz * 0.12 + vec2(uTime * 0.3, uTime * 0.1)) * n2(vWorld.xy * 0.2 - uTime * 0.2);
    float k = core * mist * (0.55 + 0.45 * (1.0 - vAlong)) * smoothstep(0.0, 0.04, vAlong) * uLevel;
    // Fade out below the deck (the water / deck catch the light instead).
    k *= smoothstep(-1.0, 1.5, vWorld.y);
    gl_FragColor = vec4(uColor * k, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class LighthouseBeam {
  readonly group = new THREE.Group();
  readonly spot: THREE.SpotLight;
  private shaft: THREE.Mesh;
  private shaftMat: THREE.ShaderMaterial;
  private baseYaw: number;
  /** 0..1 how much the beam is on the pier now (for audio / effects). */
  sweep = 0;

  constructor(quality: 'low' | 'medium' | 'high') {
    this.group.name = 'LighthouseBeam';
    this.spot = new THREE.SpotLight(0xfff0d0, 0, 0, 0.075, 0.55, 0);
    this.spot.position.copy(ORIGIN);
    this.spot.castShadow = false;
    this.group.add(this.spot, this.spot.target);
    const toC = CENTRE.clone().sub(ORIGIN);
    this.baseYaw = Math.atan2(toC.x, toC.z);
    const len = toC.length() * 1.12;
    const geo = new THREE.CylinderGeometry(0.6, len * Math.tan(0.07), len, quality === 'low' ? 16 : 28, 1, true);
    // uv.y 0 at the origin → 1 at the far end; built along -y then rotated to +z.
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5 - pos.getY(i) / len);
    geo.translate(0, -len / 2, 0);
    // rotateX(-90°) maps -y to +z: the cone now runs from the origin along +z.
    geo.rotateX(-Math.PI / 2);
    this.shaftMat = new THREE.ShaderMaterial({
      vertexShader: SHAFT_VERT,
      fragmentShader: SHAFT_FRAG,
      uniforms: { uLevel: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.93, 0.78) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.shaft = new THREE.Mesh(geo, this.shaftMat);
    this.shaft.position.copy(ORIGIN);
    this.shaft.frustumCulled = false;
    this.shaft.renderOrder = 16;
    this.group.add(this.shaft);
  }

  /**
   * angle: backdrop lighthouse rotation; yawToCam: backdrop yaw from the lantern
   * to the viewer; level: lighthouse level; night: 0..1 darkness (beam visibility).
   */
  update(dt: number, time: number, angle: number, yawToCam: number, level: number, night: number): void {
    // Beam k faces the viewer when angle + kπ ≡ yawToCam + π. Relative angle of the nearest beam:
    let best = Infinity;
    for (let k = 0; k < 2; k++) {
      let rel = angle + k * Math.PI - (yawToCam + Math.PI);
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      if (Math.abs(rel) < Math.abs(best)) best = rel;
    }
    // Sweep across the pier (slower than the true angular speed: the pier is closer).
    const yaw = this.baseYaw - best * 0.75;
    const toC = CENTRE.clone().sub(ORIGIN);
    const horiz = Math.hypot(toC.x, toC.z);
    const dir = new THREE.Vector3(Math.sin(yaw) * horiz, toC.y, Math.cos(yaw) * horiz).normalize();
    this.spot.target.position.copy(ORIGIN).addScaledVector(dir, 100);
    this.spot.target.updateMatrixWorld();
    const on = Math.max(0, 1 - Math.abs(best) / 0.75);
    this.sweep = on;
    this.spot.intensity = 9 * level * night * on;
    this.shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.shaftMat.uniforms.uLevel.value = 0.17 * level * night * Math.pow(on, 0.8);
    this.shaftMat.uniforms.uTime.value = time;
    this.shaft.visible = this.shaftMat.uniforms.uLevel.value > 0.001;
    void dt;
  }
}
