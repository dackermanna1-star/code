// Lamp posts (Victorian cast iron, sodium lanterns) with real point lights,
// glowing glass, halo sprites and faint light cones in the night air. Lamps
// switch on one by one at dusk (sodium warm-up: pink-red → orange); two of
// them misbehave (one dying, one buzzing).
//
// Also the shared Glows layer: additive halo sprites (one draw call) for any
// small light source in the scene.
import * as THREE from 'three';
import { PIER } from '../../config/world';
import { GeoBuilder, box, cone, cyl, sphere, torus, type EnvMaterials } from './geo';
import { LAMPS_FAR, LAMPS_NEAR, type Perch } from './Pier';

// ------------------------------------------------------------------ glows

const GLOW_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  uniform float uScale;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  }
`;
const GLOW_FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float g = exp(-r2 * 7.0) * 0.85 + exp(-r2 * 2.2) * 0.25;
    g *= 1.0 - r2;
    gl_FragColor = vec4(vColor * g, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Additive halo sprites. Positions fixed at creation unless moved via setPosition. */
export class Glows {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private base: Array<{ color: THREE.Color; size: number }> = [];
  private mat: THREE.ShaderMaterial;
  private n = 0;

  constructor(private max = 64) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      uniforms: { uScale: { value: 720 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.points.name = 'Glows';
  }

  /** Add a glow; returns its index. `size` is the world diameter (m). */
  add(p: THREE.Vector3, color: THREE.Color, size: number): number {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.base.push({ color: color.clone(), size });
    this.set(i, 1);
    this.points.geometry.setDrawRange(0, this.n);
    return i;
  }

  /** Scale glow i by level k (0 = off). Optional colour override. */
  set(i: number, k: number, color?: THREE.Color): void {
    if (i < 0) return;
    const c = color ?? this.base[i].color;
    this.col[i * 3] = c.r * k;
    this.col[i * 3 + 1] = c.g * k;
    this.col[i * 3 + 2] = c.b * k;
    this.size[i] = this.base[i].size;
    (this.points.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  setPosition(i: number, p: THREE.Vector3): void {
    if (i < 0) return;
    this.pos.set([p.x, p.y, p.z], i * 3);
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  setSize(i: number, size: number): void {
    if (i < 0) return;
    this.size[i] = size;
    (this.points.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Pixel scale: drawing-buffer height × projection factor. */
  setViewport(heightPx: number, fovDeg: number): void {
    this.mat.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
}

// ------------------------------------------------------------------ lamps

const CONE_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vH;
  varying vec3 vCol;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    vH = uv.y;
    #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
    #else
    vCol = vec3(1.0);
    #endif
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const CONE_FRAG = /* glsl */ `
  uniform float uLevel;
  varying vec3 vN;
  varying vec3 vV;
  varying float vH;
  varying vec3 vCol;
  void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float k = pow(f, 3.0) * pow(vH, 1.3) * smoothstep(0.0, 0.25, 1.0 - vH + 0.05);
    gl_FragColor = vec4(vCol * k * uLevel, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export type LampQuality = 'low' | 'medium' | 'high';

interface Lamp {
  x: number;
  z: number;
  head: THREE.Vector3;
  light: THREE.PointLight | null;
  glow: number;
  /** Switch-on threshold on the lamps level. */
  onAt: number;
  /** 0..1 current brightness (warm-up). */
  level: number;
  /** Seconds since switched on (for the sodium warm-up colour). */
  warm: number;
  on: boolean;
  quirk: 'none' | 'dying' | 'buzz';
  /** Near-row bollard lantern. */
  near: boolean;
  /** Halo and light scale (the bollards are smaller lanterns). */
  glowK: number;
  lightK: number;
}

const SODIUM = new THREE.Color(1.0, 0.52, 0.16);
const SODIUM_COLD = new THREE.Color(1.0, 0.22, 0.2);
const GLASS_OFF = new THREE.Color(0.18, 0.16, 0.13);
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _c3 = new THREE.Color();

export class Lamps {
  readonly group = new THREE.Group();
  readonly lamps: Lamp[] = [];
  readonly perches: Perch[] = [];
  private glass: THREE.InstancedMesh;
  private cones: THREE.InstancedMesh;
  private coneMat: THREE.ShaderMaterial;
  /** Lamp light intensity at full level (cd). */
  intensity = 34;

  constructor(mats: EnvMaterials, private glows: Glows, quality: LampQuality) {
    this.group.name = 'Lamps';
    const iron = new GeoBuilder();
    const ironCol = new THREE.Color(0x1d2622);
    const positions: Array<{ x: number; z: number; side: number }> = [
      ...LAMPS_FAR.map((x) => ({ x, z: PIER.minZ + 0.05, side: -1 })),
      ...LAMPS_NEAR.map((x) => ({ x, z: PIER.maxZ - 0.05, side: 1 })),
    ];
    // Far row: tall cast-iron posts behind the action. Near row: low bollard
    // lanterns on the railing posts. At the 36° camera a 4 m near lantern
    // projects onto the middle lanes (it hid the Bosun and the horde); a 1.2 m
    // bollard head lands on the near edge of the deck instead.
    const H = 4.0;
    const HN = 1.15;
    positions.forEach((p, i) => {
      const near = p.side > 0;
      let head: THREE.Vector3;
      if (!near) {
        // Plinth, fluted pole, collar, crossbar, lantern cage and cap.
        iron.add(box(0.34, 0.32, 0.34), ironCol, { p: [p.x, 0.16, p.z] });
        iron.add(cyl(0.11, 0.15, 0.5, 8), ironCol, { p: [p.x, 0.55, p.z] });
        iron.add(cyl(0.065, 0.085, H - 0.8, 8), ironCol, { p: [p.x, 0.8 + (H - 0.8) / 2, p.z] });
        iron.add(torus(0.1, 0.03, 4, 10), ironCol, { p: [p.x, 1.4, p.z], r: [Math.PI / 2, 0, 0] });
        iron.add(box(0.7, 0.05, 0.05), ironCol, { p: [p.x, H - 0.35, p.z] });
        iron.add(cyl(0.12, 0.06, 0.12, 8), ironCol, { p: [p.x, H + 0.0, p.z] });
        // Lantern cage posts.
        for (const [dx, dz] of [
          [-0.17, -0.17],
          [0.17, -0.17],
          [-0.17, 0.17],
          [0.17, 0.17],
        ]) iron.add(box(0.03, 0.5, 0.03), ironCol, { p: [p.x + dx, H + 0.31, p.z + dz] });
        iron.add(cone(0.3, 0.3, 4), ironCol, { p: [p.x, H + 0.71, p.z], r: [0, Math.PI / 4, 0] });
        iron.add(sphere(0.05, 6, 4), ironCol, { p: [p.x, H + 0.9, p.z] });
        head = new THREE.Vector3(p.x, H + 0.32, p.z);
        this.perches.push({ x: p.x, y: H + 0.95, z: p.z, yaw: i * 1.7 });
      } else {
        // Bollard lantern: squat fluted base, short post, a small lantern and cap.
        iron.add(cyl(0.16, 0.2, 0.3, 8), ironCol, { p: [p.x, 0.15, p.z] });
        iron.add(torus(0.15, 0.03, 4, 10), ironCol, { p: [p.x, 0.31, p.z], r: [Math.PI / 2, 0, 0] });
        iron.add(cyl(0.06, 0.08, HN - 0.5, 8), ironCol, { p: [p.x, 0.3 + (HN - 0.5) / 2, p.z] });
        iron.add(cyl(0.1, 0.06, 0.08, 8), ironCol, { p: [p.x, HN - 0.16, p.z] });
        for (const [dx, dz] of [
          [-0.1, -0.1],
          [0.1, -0.1],
          [-0.1, 0.1],
          [0.1, 0.1],
        ]) iron.add(box(0.025, 0.3, 0.025), ironCol, { p: [p.x + dx, HN + 0.03, p.z + dz] });
        iron.add(cone(0.18, 0.18, 4), ironCol, { p: [p.x, HN + 0.27, p.z], r: [0, Math.PI / 4, 0] });
        iron.add(sphere(0.035, 6, 4), ironCol, { p: [p.x, HN + 0.39, p.z] });
        head = new THREE.Vector3(p.x, HN + 0.03, p.z);
        this.perches.push({ x: p.x, y: HN + 0.42, z: p.z, yaw: i * 1.7 });
      }
      // Real lights (see setQuality): all on high, far side only on medium, every other far lamp on low.
      const light = new THREE.PointLight(SODIUM, 0, 11.5, 2);
      // The near lanterns light the deck from a little above and inboard of the glass
      // (a pool of light on the near lanes, not a hot spot at the railing).
      if (near) light.position.set(p.x, HN + 0.9, p.z - 0.8);
      else light.position.copy(head).add(new THREE.Vector3(0, -0.1, -p.side * 0.3));
      light.userData.lampIndex = i;
      light.userData.far = !near;
      this.group.add(light);
      const glow = this.glows.add(head, SODIUM.clone().multiplyScalar(near ? 1.6 : 2.2), near ? 0.95 : 2.2);
      const quirk: Lamp['quirk'] = p.x === -17.5 ? 'dying' : p.x === 3 ? 'buzz' : 'none';
      this.lamps.push({ x: p.x, z: p.z, head, light, glow, onAt: 0.08 + ((i * 0.37) % 1) * 0.4, level: 0, warm: 99, on: false, quirk, near, glowK: near ? 0.75 : 1, lightK: near ? 0.7 : 1 });
    });
    const posts = iron.mesh(mats.metal, 'LampPosts');
    posts.castShadow = true;
    posts.receiveShadow = true;
    this.group.add(posts);

    // Glass (instanced, per-lamp brightness through instance colours).
    const glassGeo = new THREE.BoxGeometry(0.32, 0.46, 0.32);
    this.glass = new THREE.InstancedMesh(glassGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.lamps.length);
    {
      const h = H + 0.1;
      const g = new THREE.CylinderGeometry(0.18, 2.9, h, 24, 1, true);
      // uv.y: 1 at the lantern, 0 on the deck.
      g.translate(0, h / 2, 0);
      this.coneMat = new THREE.ShaderMaterial({
        vertexShader: CONE_VERT,
        fragmentShader: CONE_FRAG,
        uniforms: { uLevel: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      this.cones = new THREE.InstancedMesh(g, this.coneMat, this.lamps.length);
    }
    const m = new THREE.Matrix4();
    const sc = new THREE.Matrix4();
    this.lamps.forEach((l, i) => {
      m.makeTranslation(l.head.x, l.head.y, l.head.z);
      if (l.near) m.multiply(sc.makeScale(0.6, 0.62, 0.6));
      this.glass.setMatrixAt(i, m);
      this.glass.setColorAt(i, _c.setRGB(0.2, 0.2, 0.2));
      m.makeTranslation(l.head.x, 0, l.head.z - Math.sign(l.z) * (l.near ? 0.3 : 0.6));
      if (l.near) m.multiply(sc.makeScale(0.45, (HN + 0.1) / (H + 0.1), 0.45));
      this.cones.setMatrixAt(i, m);
      this.cones.setColorAt(i, _c.setRGB(0, 0, 0));
    });
    this.glass.name = 'LampGlass';
    this.cones.name = 'LampCones';
    this.cones.renderOrder = 15;
    this.cones.frustumCulled = false;
    this.group.add(this.glass, this.cones);
    this.setQuality(quality);
  }

  /**
   * Which lamps are real point lights (the rest keep their glass, halo and
   * cone). Changing the count recompiles the lit shaders once.
   */
  setQuality(quality: LampQuality): void {
    this.lamps.forEach((l, i) => {
      if (!l.light) return;
      const real = quality === 'high' || (quality === 'medium' && !l.near) || (quality === 'low' && !l.near && i % 2 === 0);
      l.light.visible = real;
      // Fewer lamps on low: each one reaches further.
      l.light.distance = quality === 'low' ? 16 : 11.5;
      if (!real) l.light.intensity = 0;
    });
  }

  /**
   * level: time-of-day lamp level 0..1 (switching thresholds);
   * fog: 0..1 how visible the light cones are.
   */
  update(dt: number, time: number, level: number, fog: number): void {
    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i];
      const want = level > l.onAt;
      if (want && !l.on) {
        l.on = true;
        l.warm = dt > 0.5 ? 99 : 0;
      } else if (!want && l.on) l.on = false;
      if (l.on) l.warm += dt;
      // Warm-up: a stutter, then ramp up over ~5 s.
      let target = l.on ? 1 : 0;
      if (l.on && l.warm < 1.2) target = Math.sin(l.warm * 40 + i) > 0.2 ? 0.5 : 0.05;
      else if (l.on && l.warm < 6) target = 0.35 + 0.65 * ((l.warm - 1.2) / 4.8);
      const k = 1 - Math.exp(-dt * 8);
      l.level += (target - l.level) * (dt > 0.5 ? 1 : k);
      let flick = 1;
      if (l.quirk === 'dying') {
        const n = Math.sin(time * 13.1) + Math.sin(time * 7.3 + 1.1) + Math.sin(time * 2.1 + 4.0);
        flick = n > 1.6 ? 0.08 : n > 1.2 ? 0.5 : 1;
        if (Math.sin(time * 0.37) > 0.85) flick *= 0.15 + 0.85 * (Math.sin(time * 61) > 0 ? 1 : 0);
      } else if (l.quirk === 'buzz') {
        flick = 0.9 + 0.1 * Math.sin(time * 100) * Math.sin(time * 3.3);
        if (Math.sin(time * 0.71 + 2.0) > 0.97) flick = 0.3;
      }
      const b = l.level * flick;
      const warmK = Math.min(1, l.warm / 6);
      _c.copy(SODIUM_COLD).lerp(SODIUM, warmK);
      if (l.light && l.light.visible) {
        l.light.color.copy(_c);
        l.light.intensity = this.intensity * b * l.lightK;
      }
      this.glass.setColorAt(i, _c2.copy(GLASS_OFF).lerp(_c3.copy(_c).multiplyScalar(l.near ? 4 : 6), b));
      this.glows.set(l.glow, b * l.glowK, _c2.copy(_c).multiplyScalar(2.0));
      this.cones.setColorAt(i, _c2.copy(_c).multiplyScalar(b * 0.06));
    }
    if (this.glass.instanceColor) this.glass.instanceColor.needsUpdate = true;
    if (this.cones.instanceColor) this.cones.instanceColor.needsUpdate = true;
    this.coneMat.uniforms.uLevel.value = fog;
  }

  /** Switch every lamp straight to its steady state for this lamps level. */
  snap(level: number): void {
    for (const l of this.lamps) {
      l.on = level > l.onAt;
      l.level = l.on ? 1 : 0;
      l.warm = 99;
    }
  }

  /** Brightness (0..1) of the lamp nearest to x on a side (-1 far, +1 near). */
  levelAt(x: number): number {
    let best = 0;
    let bd = Infinity;
    for (const l of this.lamps) {
      const d = Math.abs(l.x - x);
      if (d < bd) {
        bd = d;
        best = l.level;
      }
    }
    return best;
  }
}
