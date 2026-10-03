import * as THREE from 'three';
import { G } from '../core/G';

// ------------------------------------------------------------------ shaders
const NOISE = /* glsl */ `
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
`;

const SURF_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vP = position;
  gl_Position = projectionMatrix * mv;
}`;

const ORB_FRAG = /* glsl */ `
uniform float uTime; uniform float uI; uniform float uSwirl; uniform float uSeed;
uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uRim;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
${NOISE}
void main(){
  float ndv = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  float rim = pow(1.0 - ndv, 2.2);
  float core = pow(ndv, 3.0);
  vec3 p = normalize(vP);
  float t = uTime * uSwirl;
  float ang = atan(p.z, p.x) + t * 2.2 + p.y * 2.6;
  vec3 q = vec3(cos(ang), p.y * 1.7, sin(ang)) * 2.4 + uSeed;
  float n = fbm3(q + vec3(0.0, -t * 0.9, 0.0));
  float bands = pow(abs(sin(ang * 3.0 + n * 6.0)), 5.0);
  vec3 col = uCore * core * (1.6 + 0.7 * n)
    + uMid * (0.3 + 1.0 * n) * (0.55 + 0.45 * ndv)
    + uRim * rim * 2.4
    + uRim * bands * 0.9 * (0.3 + ndv);
  gl_FragColor = vec4(col * uI, 1.0);
}`;

const HALO_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const HALO_FRAG = /* glsl */ `
uniform vec3 uCol; uniform float uI; uniform float uRays; uniform float uTime;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float g = exp(-r * 3.2) * 0.9 + exp(-r * 10.0) * 1.6;
  float a = atan(p.y, p.x);
  float rays = pow(abs(cos(a * 3.0 + uTime * 0.4)), 40.0) * exp(-r * 2.2) * uRays;
  float streak = exp(-abs(p.y) * 46.0) * exp(-abs(p.x) * 2.2) * uRays * 1.6;
  vec3 col = uCol * (g + rays + streak);
  col *= 1.0 - smoothstep(0.75, 1.0, r);
  gl_FragColor = vec4(col * uI, 1.0);
}`;

const SHELL_FRAG = /* glsl */ `
uniform vec3 uCol; uniform float uI; uniform float uTime;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
${NOISE}
void main(){
  float ndv = abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(1.0 - ndv, 3.0);
  float n = n3(normalize(vP) * 6.0 + uTime * 3.0);
  gl_FragColor = vec4(uCol * (rim * (1.2 + n) + 0.04) * uI, 1.0);
}`;

const RING_FRAG = /* glsl */ `
uniform vec3 uCol; uniform float uI; uniform float uW;
varying vec2 vUv;
void main(){
  float r = length(vUv * 2.0 - 1.0);
  float x = (r - 0.9) / uW;
  float ring = exp(-x * x);
  float fill = smoothstep(0.92, 0.0, r) * 0.08;
  gl_FragColor = vec4(uCol * (ring + fill) * uI, 1.0);
}`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uCol; uniform vec3 uCore; uniform float uI; uniform float uTime;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
${NOISE}
void main(){
  float ndv = abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(1.0 - ndv, 2.0);
  float along = vP.y;
  float n = fbm3(vec3(atan(vP.z, vP.x) * 2.0, along * 6.0 - uTime * 9.0, uTime));
  float streak = pow(n, 3.0) * 2.0;
  vec3 col = uCol * (rim * 1.4 + streak * 0.8) + uCore * pow(ndv, 6.0) * 0.6;
  gl_FragColor = vec4(col * uI, 1.0);
}`;

const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false } as const;

export interface OrbStyle {
  core: THREE.ColorRepresentation;
  mid: THREE.ColorRepresentation;
  rim: THREE.ColorRepresentation;
  halo: THREE.ColorRepresentation;
  rays: number;
  swirl: number;
  dark?: boolean;
}
export const ORB_BLUE: OrbStyle = { core: 0x9fe8ff, mid: 0x0d55ff, rim: 0x47b4ff, halo: 0x2a7dff, rays: 0.6, swirl: -1.3, dark: true };
export const ORB_RED: OrbStyle = { core: 0xffe2da, mid: 0xff0a1e, rim: 0xff4430, halo: 0xff1a1a, rays: 1.0, swirl: 1.6 };
export const ORB_PURPLE: OrbStyle = { core: 0xffe6ff, mid: 0x7a12ff, rim: 0xd24dff, halo: 0x9a2cff, rays: 1.2, swirl: 1.1 };

/** A glowing technique orb: swirling energy shell, optional dark singularity core, halo billboard. */
export class Orb {
  readonly group = new THREE.Group();
  private shell: THREE.Mesh;
  private core: THREE.Mesh | null = null;
  private halo: THREE.Mesh;
  private sm: THREE.ShaderMaterial;
  private hm: THREE.ShaderMaterial;
  radius = 0.3;
  intensity = 1;
  haloScale = 3.2;

  constructor(style: OrbStyle) {
    this.sm = new THREE.ShaderMaterial({
      vertexShader: SURF_VERT,
      fragmentShader: ORB_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uI: { value: 1 },
        uSwirl: { value: style.swirl },
        uSeed: { value: Math.random() * 10 },
        uCore: { value: new THREE.Color(style.core).multiplyScalar(2.2) },
        uMid: { value: new THREE.Color(style.mid).multiplyScalar(1.6) },
        uRim: { value: new THREE.Color(style.rim).multiplyScalar(1.8) },
      },
      ...additive,
    });
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), this.sm);
    this.shell.renderOrder = 30;
    this.group.add(this.shell);
    if (style.dark) {
      this.core = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x01020a, fog: false }));
      this.core.renderOrder = 29;
      this.group.add(this.core);
    }
    this.hm = new THREE.ShaderMaterial({
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      uniforms: { uCol: { value: new THREE.Color(style.halo).multiplyScalar(1.5) }, uI: { value: 1 }, uRays: { value: style.rays }, uTime: { value: 0 } },
      ...additive,
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.hm);
    this.halo.renderOrder = 31;
    this.group.add(this.halo);
    this.group.visible = false;
  }

  update(time: number, cam: THREE.Camera) {
    const r = Math.max(0.0001, this.radius);
    this.shell.scale.setScalar(r);
    if (this.core) this.core.scale.setScalar(r * 0.62);
    this.halo.scale.setScalar(r * this.haloScale);
    this.halo.quaternion.copy(cam.quaternion);
    if (this.group.parent) {
      // undo the parent's rotation so the billboard really faces the camera
      const pq = this.group.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.halo.quaternion.premultiply(pq);
    }
    this.sm.uniforms.uTime.value = time;
    this.sm.uniforms.uI.value = this.intensity;
    this.hm.uniforms.uTime.value = time;
    this.hm.uniforms.uI.value = this.intensity * 0.9;
  }
}

// ------------------------------------------------------------------ streak particles
const MAXS = 1600;
/**
 * CPU streak particles: ballistic (with drag) or attracted to a moving center
 * (gravity well with swirl). Rendered as additive boxes stretched along the
 * velocity, never thinner than about a pixel.
 */
export class Streaks {
  private px = new Float32Array(MAXS);
  private py = new Float32Array(MAXS);
  private pz = new Float32Array(MAXS);
  private vx = new Float32Array(MAXS);
  private vy = new Float32Array(MAXS);
  private vz = new Float32Array(MAXS);
  private age = new Float32Array(MAXS);
  private life = new Float32Array(MAXS);
  private size = new Float32Array(MAXS);
  private stretch = new Float32Array(MAXS);
  private col = new Float32Array(MAXS * 3);
  private drag = new Float32Array(MAXS);
  private grav = new Float32Array(MAXS);
  private pull = new Float32Array(MAXS);
  private centers: (THREE.Vector3 | null)[] = new Array(MAXS).fill(null);
  private n = 0;
  private shown = 0;
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private z = new THREE.Vector3(0, 0, 1);

  /** unit: length scale of the scene (1 = world meters; small for the viewmodel). */
  constructor(scene: THREE.Scene, private cam: () => THREE.PerspectiveCamera, private unit = 1) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, ...additive });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAXS);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXS * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 32;
    scene.add(this.mesh);
  }

  /** color in linear HDR (values > 1 bloom). center/pull: attraction toward a moving point. */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, r: number, g: number, b: number, o: { drag?: number; gravity?: number; stretch?: number; center?: THREE.Vector3; pull?: number } = {}) {
    if (this.n >= MAXS) return;
    const i = this.n++;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.age[i] = 0;
    this.life[i] = life;
    this.size[i] = size;
    this.stretch[i] = o.stretch ?? 0.03;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.drag[i] = o.drag ?? 0;
    this.grav[i] = o.gravity ?? 0;
    this.pull[i] = o.pull ?? 0;
    this.centers[i] = o.center ?? null;
  }

  private kill(i: number) {
    const j = --this.n;
    if (i === j) return;
    this.px[i] = this.px[j];
    this.py[i] = this.py[j];
    this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.vz[i] = this.vz[j];
    this.age[i] = this.age[j];
    this.life[i] = this.life[j];
    this.size[i] = this.size[j];
    this.stretch[i] = this.stretch[j];
    this.col[i * 3] = this.col[j * 3];
    this.col[i * 3 + 1] = this.col[j * 3 + 1];
    this.col[i * 3 + 2] = this.col[j * 3 + 2];
    this.drag[i] = this.drag[j];
    this.grav[i] = this.grav[j];
    this.pull[i] = this.pull[j];
    this.centers[i] = this.centers[j];
  }

  clear() {
    this.n = 0;
    this.mesh.count = 0;
  }

  update(dt: number) {
    // nothing alive and nothing on screen: skip the buffer upload
    if (this.n === 0 && this.shown === 0) return;
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.kill(i);
        continue;
      }
      const c = this.centers[i];
      if (c) {
        const dx = c.x - this.px[i];
        const dy = c.y - this.py[i];
        const dz = c.z - this.pz[i];
        const d2 = dx * dx + dy * dy + dz * dz;
        const d = Math.sqrt(d2);
        if (d < 0.12 * this.unit) {
          this.kill(i);
          continue;
        }
        const a = (this.pull[i] / Math.max(0.25 * this.unit * this.unit, d2)) * dt;
        this.vx[i] += (dx / d) * a;
        this.vy[i] += (dy / d) * a;
        this.vz[i] += (dz / d) * a;
      }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= k;
      this.vy[i] = this.vy[i] * k - 9.81 * this.grav[i] * dt;
      this.vz[i] *= k;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
    }
    const cam = this.cam();
    const cp = cam.getWorldPosition(this.v);
    const cx = cp.x;
    const cy = cp.y;
    const cz = cp.z;
    const pxAng = (2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(120, G.renderer?.internalH ?? 540);
    for (let i = 0; i < this.n; i++) {
      this.v.set(this.vx[i], this.vy[i], this.vz[i]);
      const sp = this.v.length();
      if (sp > 1e-4) this.q.setFromUnitVectors(this.z, this.v.multiplyScalar(1 / sp));
      const dist = Math.hypot(this.px[i] - cx, this.py[i] - cy, this.pz[i] - cz);
      const t = Math.max(this.size[i], dist * pxAng * 1.25);
      this.s.set(t, t, Math.max(t, sp * this.stretch[i]));
      this.v.set(this.px[i], this.py[i], this.pz[i]);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      const a = this.age[i] / this.life[i];
      const f = Math.min(1, this.age[i] / 0.05) * (1 - a * a);
      this.c.setRGB(this.col[i * 3] * f, this.col[i * 3 + 1] * f, this.col[i * 3 + 2] * f);
      this.mesh.setColorAt(i, this.c);
    }
    this.mesh.count = this.n;
    this.shown = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ lightning
const MAXL = 900;
/** Jagged pixel lightning, rebuilt every frame. */
export class Arcs {
  readonly lines: THREE.LineSegments;
  private pos = new Float32Array(MAXL * 6);
  private col = new Float32Array(MAXL * 6);
  private n = 0;
  private shown = 0;

  constructor(scene: THREE.Scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, ...additive }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 33;
    scene.add(this.lines);
  }

  begin() {
    this.n = 0;
  }

  /** A crackling bolt from a to b. */
  arc(a: THREE.Vector3, b: THREE.Vector3, r: number, g: number, bl: number, jitter: number, segs = 8) {
    let x0 = a.x;
    let y0 = a.y;
    let z0 = a.z;
    for (let i = 1; i <= segs && this.n < MAXL; i++) {
      const t = i / segs;
      const j = i === segs ? 0 : jitter * Math.sin(t * Math.PI);
      const x1 = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * j;
      const y1 = a.y + (b.y - a.y) * t + (Math.random() - 0.5) * j;
      const z1 = a.z + (b.z - a.z) * t + (Math.random() - 0.5) * j;
      const k = this.n * 6;
      this.pos[k] = x0;
      this.pos[k + 1] = y0;
      this.pos[k + 2] = z0;
      this.pos[k + 3] = x1;
      this.pos[k + 4] = y1;
      this.pos[k + 5] = z1;
      for (let c = 0; c < 2; c++) {
        this.col[k + c * 3] = r;
        this.col[k + c * 3 + 1] = g;
        this.col[k + c * 3 + 2] = bl;
      }
      this.n++;
      x0 = x1;
      y0 = y1;
      z0 = z1;
    }
  }

  end() {
    if (this.n === 0 && this.shown === 0) return;
    this.shown = this.n;
    const g = this.lines.geometry;
    g.setDrawRange(0, this.n * 2);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ------------------------------------------------------------------ shells, rings, beam
interface Pulse {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  t: number;
  dur: number;
  r0: number;
  r1: number;
  i0: number;
  busy: boolean;
}

/** Expanding shockwave spheres and ground rings. */
export class Pulses {
  private shells: Pulse[] = [];
  private rings: Pulse[] = [];

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: SURF_VERT,
        fragmentShader: SHELL_FRAG,
        uniforms: { uCol: { value: new THREE.Color() }, uI: { value: 0 }, uTime: { value: 0 } },
        side: THREE.DoubleSide,
        ...additive,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mat);
      mesh.visible = false;
      mesh.renderOrder = 34;
      scene.add(mesh);
      this.shells.push({ mesh, mat, t: 0, dur: 1, r0: 0, r1: 1, i0: 1, busy: false });
    }
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: HALO_VERT,
        fragmentShader: RING_FRAG,
        uniforms: { uCol: { value: new THREE.Color() }, uI: { value: 0 }, uW: { value: 0.05 } },
        ...additive,
      });
      const g = new THREE.PlaneGeometry(2, 2);
      g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, mat);
      mesh.visible = false;
      mesh.renderOrder = 34;
      scene.add(mesh);
      this.rings.push({ mesh, mat, t: 0, dur: 1, r0: 0, r1: 1, i0: 1, busy: false });
    }
  }

  private take(pool: Pulse[]) {
    return pool.find((p) => !p.busy) ?? pool.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
  }

  shell(x: number, y: number, z: number, r0: number, r1: number, dur: number, color: THREE.ColorRepresentation, intensity: number) {
    const p = this.take(this.shells);
    Object.assign(p, { t: 0, dur, r0, r1, i0: intensity, busy: true });
    p.mesh.position.set(x, y, z);
    (p.mat.uniforms.uCol.value as THREE.Color).set(color);
    p.mesh.visible = true;
  }

  ring(x: number, z: number, r0: number, r1: number, dur: number, color: THREE.ColorRepresentation, intensity: number, width = 0.05) {
    const p = this.take(this.rings);
    Object.assign(p, { t: 0, dur, r0, r1, i0: intensity, busy: true });
    p.mesh.position.set(x, 0.06, z);
    (p.mat.uniforms.uCol.value as THREE.Color).set(color);
    p.mat.uniforms.uW.value = width;
    p.mesh.visible = true;
  }

  update(dt: number, time: number) {
    for (const p of [...this.shells, ...this.rings]) {
      if (!p.busy) continue;
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const e = 1 - Math.pow(1 - k, 3);
      p.mesh.scale.setScalar(p.r0 + (p.r1 - p.r0) * e);
      p.mat.uniforms.uI.value = p.i0 * (1 - k) * (1 - k);
      if (p.mat.uniforms.uTime) p.mat.uniforms.uTime.value = time;
      if (k >= 1) {
        p.busy = false;
        p.mesh.visible = false;
      }
    }
  }

  clear() {
    for (const p of [...this.shells, ...this.rings]) {
      p.busy = false;
      p.mesh.visible = false;
    }
  }
}

/** Glowing tunnel left behind by Hollow Purple. */
export class Beam {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  intensity = 0;
  private up = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SURF_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: { uCol: { value: new THREE.Color(0xa040ff).multiplyScalar(1.4) }, uCore: { value: new THREE.Color(0xffd8ff) }, uI: { value: 0 }, uTime: { value: 0 } },
      side: THREE.DoubleSide,
      ...additive,
    });
    const g = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true);
    g.translate(0, 0.5, 0);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 28;
    scene.add(this.mesh);
  }

  /** Stretch from a to b with radius r. */
  set(a: THREE.Vector3, b: THREE.Vector3, r: number) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    this.mesh.position.copy(a);
    this.mesh.quaternion.setFromUnitVectors(this.up, d.multiplyScalar(1 / Math.max(1e-4, len)));
    this.mesh.scale.set(r, len, r);
  }

  update(time: number) {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uI.value = this.intensity;
    this.mesh.visible = this.intensity > 0.002;
  }
}

// ------------------------------------------------------------------ screen-space helpers
const _p = new THREE.Vector3();
/** Writes a lens for a world-space (or viewmodel-space) point into the post settings. */
export function setLens(slot: number, pos: THREE.Vector3, radius: number, strength: number, cam: THREE.PerspectiveCamera, mode = 0, ringRadius = 0) {
  const post = G.renderer.post;
  const o = slot * 4;
  _p.copy(pos).project(cam);
  const camPos = cam.getWorldPosition(new THREE.Vector3());
  const dist = camPos.distanceTo(pos);
  if (_p.z > 1 || _p.z < -1 || dist < 0.05) {
    post.lenses[o + 3] = 0;
    return;
  }
  const k = 1 / (2 * dist * Math.tan((cam.fov * Math.PI) / 360));
  post.lenses[o] = _p.x * 0.5 + 0.5;
  post.lenses[o + 1] = _p.y * 0.5 + 0.5;
  post.lenses[o + 2] = radius * k;
  post.lenses[o + 3] = strength;
  post.lensMode[slot] = mode;
  post.lensRing[slot] = ringRadius * k;
}

export function clearLenses() {
  const post = G.renderer.post;
  post.lenses.fill(0);
}

/** Once per frame before Gojo and Sukuna update: lenses are re-set by whoever needs them, impact frames cut away. */
export function cursedPostFrame(dt: number) {
  const post = G.renderer.post;
  // impact frames hold for a couple of frames, then cut away
  post.impact = Math.max(0, post.impact - dt * 8);
  post.bloomBoost += (0 - post.bloomBoost) * (1 - Math.exp(-3.5 * dt));
  clearLenses();
}
