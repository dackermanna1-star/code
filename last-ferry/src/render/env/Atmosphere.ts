// Air: embers blown over the pier from the burning town (stronger at night),
// and low sea-fog wisps that roll in across the water after dark.
import * as THREE from 'three';
import { mulberry32 } from './noise';
import { SoftSprites } from './Sprites';

const EMBER_VERT = /* glsl */ `
  attribute vec4 aSeed; // phase, speed, size, hue
  uniform float uTime, uScale, uLevel;
  varying float vA;
  varying float vHue;
  void main() {
    float life = 9.0 / aSeed.y;
    float t = mod(uTime + aSeed.x * life, life) / life; // 0..1
    vec3 p = position;
    // Blown from the left (town) to the right, rising and swirling.
    p.x += t * 70.0 * aSeed.y * 0.6;
    p.y += t * (4.0 + 6.0 * aSeed.w) + sin(uTime * 1.7 + aSeed.x * 30.0) * 0.4;
    p.z += sin(uTime * 0.9 + aSeed.x * 17.0) * 1.2;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float flick = 0.55 + 0.45 * sin(uTime * (8.0 + aSeed.w * 10.0) + aSeed.x * 50.0);
    vA = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.6, t) * flick * uLevel;
    vHue = aSeed.w;
    gl_PointSize = max(1.5, aSeed.z * uScale / max(0.1, -mv.z));
  }
`;
const EMBER_FRAG = /* glsl */ `
  varying float vA;
  varying float vHue;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float g = exp(-r2 * 4.0);
    vec3 c = mix(vec3(4.0, 1.1, 0.2), vec3(5.0, 2.6, 0.7), vHue);
    gl_FragColor = vec4(c * g * vA, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Atmosphere {
  readonly group = new THREE.Group();
  private emberMat: THREE.ShaderMaterial;
  private fog = new SoftSprites(48, new THREE.Color(0.1, 0.12, 0.18), 1.1, true);
  private wisps: Array<{ x: number; y: number; z: number; size: number; speed: number; seed: number }> = [];

  constructor(embers: number) {
    this.group.name = 'Atmosphere';
    const rnd = mulberry32(606);
    {
      const pos = new Float32Array(embers * 3);
      const seed = new Float32Array(embers * 4);
      for (let i = 0; i < embers; i++) {
        pos.set([-48 + rnd() * 30, -1 + rnd() * 9, -22 + rnd() * 34], i * 3);
        seed.set([rnd(), 0.6 + rnd() * 0.8, 0.05 + rnd() * 0.07, rnd()], i * 4);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
      this.emberMat = new THREE.ShaderMaterial({
        vertexShader: EMBER_VERT,
        fragmentShader: EMBER_FRAG,
        uniforms: { uTime: { value: 0 }, uScale: { value: 1600 }, uLevel: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(g, this.emberMat);
      pts.frustumCulled = false;
      pts.renderOrder = 22;
      this.group.add(pts);
    }
    {
      const n = 40;
      for (let i = 0; i < n; i++) {
        const near = rnd() < 0.55;
        this.wisps.push({
          x: -60 + rnd() * 120,
          y: -2.35 + rnd() * 0.5,
          z: near ? 7.5 + rnd() * 8 : -9 - rnd() * 8,
          size: 8 + rnd() * 9,
          speed: 0.4 + rnd() * 0.7,
          seed: rnd(),
        });
      }
      this.fog.mesh.renderOrder = -2;
      this.group.add(this.fog.mesh);
    }
  }

  setViewport(heightPx: number, fovDeg: number): void {
    const s = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.emberMat.uniforms.uScale.value = s;
  }

  /** night: 0..1 darkness; fire: town fire level. */
  update(dt: number, time: number, night: number, fire: number, fogColor?: THREE.Color): void {
    this.emberMat.uniforms.uTime.value = time;
    this.emberMat.uniforms.uLevel.value = (0.25 + 0.75 * night) * fire;
    // Sea fog: drifts slowly to the right, thickening after dark.
    const level = 0.05 + 0.95 * night;
    if (fogColor) (this.fog.material.uniforms.uColor.value as THREE.Color).copy(fogColor).multiplyScalar(3.2).addScalar(0.015);
    this.fog.begin();
    for (const w of this.wisps) {
      const x = ((w.x + time * w.speed + 60) % 120 + 120) % 120 - 60;
      const edge = Math.min(1, (60 - Math.abs(x)) / 15);
      const breathe = 0.6 + 0.4 * Math.sin(time * 0.15 + w.seed * 20);
      this.fog.push(x, w.y, w.z, w.size, level * edge * breathe * 0.7, w.seed);
    }
    this.fog.end();
    void dt;
  }
}
