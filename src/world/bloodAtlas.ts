import * as THREE from 'three';
import { NOISE_GLSL } from '../character/material';

export type FaceKind = 'floor' | 'wall' | 'prop';
export interface PaintFace {
  id: number;
  origin: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  n: THREE.Vector3;
  w: number;
  h: number;
  rect: [number, number, number, number];
  kind: FaceKind;
}

/** Splat shape types. */
export const SPLAT = { drop: 0, splash: 1, pool: 2, smear: 3, ao: 4, paint: 5, drip: 6, print: 7, stream: 8 } as const;
export type SplatType = (typeof SPLAT)[keyof typeof SPLAT];

const LOG_STRIDE = 14;
const MAX_QUADS = 2048;

const SPLAT_VERT = /* glsl */ `
attribute vec2 aLocal;
attribute vec4 aParams; // radius, type, seed, intensity
attribute vec3 aDir;    // dir.xy (face space), stretch
varying vec2 vLocal;
varying vec4 vParams;
varying vec3 vDir;
void main() {
  vLocal = aLocal; vParams = aParams; vDir = aDir;
  gl_Position = vec4(position.xy * 2.0 - 1.0, 0.0, 1.0);
}
`;

const SPLAT_FRAG = /* glsl */ `
varying vec2 vLocal;
varying vec4 vParams;
varying vec3 vDir;
${NOISE_GLSL}
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float r = vParams.x;
  int type = int(vParams.y + 0.5);
  float seed = vParams.z;
  float inten = vParams.w;
  vec2 p = vLocal;
  float st = vDir.z;
  vec2 d = length(vDir.xy) > 1e-4 ? normalize(vDir.xy) : vec2(1.0, 0.0);
  if (st > 0.0 && type != 8) {
    float along = dot(p, d);
    vec2 perp = p - d * along;
    // teardrop: compress the leading side less
    float k = along > 0.0 ? 1.0 + st : 1.0 + st * 0.35;
    p = perp + d * (along / k);
  }
  float dist = length(p) / r;
  vec3 q = vec3(p / r * 2.3, seed * 3.7);
  float n = lsFbm(q);
  float amount = 0.0, thick = 0.0, paint = 0.0, ao = 0.0;
  if (type == 0) { // drop
    amount = 1.0 - smoothstep(0.72, 1.0, dist + (n - 0.5) * 0.35);
  } else if (type == 1) { // splash with spikes and satellites
    float ang = atan(p.y, p.x);
    float spikes = pow(lsNoise(vec3(ang * 2.2, seed, 0.0)), 3.0) * 0.9 + pow(lsNoise(vec3(ang * 6.0, seed * 1.3, 1.0)), 4.0) * 0.6;
    float rr = 0.6 + spikes * 0.75;
    amount = 1.0 - smoothstep(rr * 0.85, rr, dist + (n - 0.5) * 0.25);
    // satellites
    vec2 cell = floor(p / r * 4.0);
    vec2 f = fract(p / r * 4.0) - 0.5;
    float hh = h21(cell + seed);
    float sat = (1.0 - smoothstep(0.08, 0.16 + hh * 0.1, length(f + (vec2(h21(cell + 3.1), h21(cell + 7.7)) - 0.5) * 0.5)));
    sat *= step(0.72, hh) * (1.0 - smoothstep(0.9, 1.6, dist));
    amount = max(amount, sat);
    thick = amount * 0.25;
  } else if (type == 2) { // pool: lobed, with viscous fingers reaching out along its edge
    float lobes = lsNoise(vec3(p / r * 1.3, seed * 0.7)) - 0.5;
    float ang = atan(p.y, p.x);
    float fingers = pow(lsNoise(vec3(ang * 2.6, seed * 1.9, 3.0)), 3.0) * 0.5 + pow(lsNoise(vec3(ang * 6.5, seed * 0.37, 5.0)), 4.0) * 0.35;
    // fine, continuous edge detail in atlas pixels (matches across overlapping pools)
    float fine = lsNoise(vec3(gl_FragCoord.xy * 0.21, seed * 0.1)) - 0.5;
    float edge = dist / (1.0 + fingers) + lobes * 0.55 + (n - 0.5) * 0.3 + fine * 0.07;
    amount = 1.0 - smoothstep(0.8, 0.98, edge);
    thick = amount * (0.55 + 0.45 * (1.0 - smoothstep(0.0, 0.9, dist)));
  } else if (type == 3) { // smear streak
    float along = dot(vLocal, d);
    float perp = abs(dot(vLocal, vec2(-d.y, d.x)));
    float len = r * (1.0 + st);
    float w = r * 0.35 * (0.6 + n * 0.8) * (1.0 - smoothstep(0.0, len, abs(along)) * 0.6);
    amount = (1.0 - smoothstep(w * 0.7, w, perp)) * (1.0 - smoothstep(len * 0.7, len, abs(along) + (n - 0.5) * r));
    float streaks = smoothstep(0.35, 0.65, lsNoise(vec3(perp / r * 20.0, along / r * 1.5, seed)));
    amount *= 0.55 + 0.45 * streaks;
  } else if (type == 4) { // ambient occlusion (contact shadow)
    ao = (1.0 - smoothstep(0.0, 1.0, dist)) * 0.9;
  } else if (type == 5) { // paint mask (decals)
    paint = 1.0 - smoothstep(0.85, 1.0, dist);
    paint *= 0.55 + 0.45 * smoothstep(0.3, 0.7, n);
  } else if (type == 6) { // drip running down (vertical faces: -v direction)
    float along = -vLocal.y;
    float perp = abs(vLocal.x + (lsNoise(vec3(along * 6.0 / r, seed, 2.0)) - 0.5) * r * 0.15);
    float len = r * (2.0 + st);
    float w = r * 0.16 * (1.0 - smoothstep(0.0, len, along) * 0.5);
    amount = step(-r * 0.2, along) * (1.0 - smoothstep(w * 0.6, w, perp)) * (1.0 - smoothstep(len * 0.8, len, along));
    float bead = 1.0 - smoothstep(w * 1.1, w * 1.5, length(vec2(perp, along - len * 0.92)));
    amount = max(amount, bead);
  } else if (type == 8) { // rivulet segment: a capsule of width r, half length st * r, along d
    float L = st * r;
    float along = clamp(dot(vLocal, d), -L, L);
    float dd = length(vLocal - d * along);
    float wob = lsNoise(vec3(gl_FragCoord.xy * 0.33, 1.7)) - 0.5;
    float w = r * (1.0 + wob * 0.3);
    amount = 1.0 - smoothstep(w * 0.78, w * 1.05, dd);
    // a wet, raised bead of blood along the middle of the run
    thick = amount * (0.4 + 0.25 * (1.0 - smoothstep(0.0, w * 0.7, dd)));
  } else if (type == 7) { // footprint (shoe shaped), d = toe direction
    vec2 lp = vec2(dot(vLocal, vec2(-d.y, d.x)), dot(vLocal, d));
    float sole = length(vec2(lp.x / (r * 0.38), (lp.y - r * 0.25) / (r * 0.7)));
    float heel = length(vec2(lp.x / (r * 0.32), (lp.y + r * 0.62) / (r * 0.3)));
    float m = 1.0 - smoothstep(0.85, 1.0, min(sole, heel));
    float tread = smoothstep(0.3, 0.6, lsNoise(vec3(lp / r * 9.0, seed)));
    amount = m * (0.45 + 0.55 * tread);
  }
  amount *= inten;
  gl_FragColor = vec4(amount, thick * inten, paint * inten, ao * inten);
}
`;

const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ floor flow
/** The floor drains in the arena dressing: the concrete falls gently towards them. */
const DRAINS: [number, number][] = [[-9.5, 4.5], [8.5, -3.0], [3.0, 8.6]];
function hash2(ix: number, iz: number) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
/**
 * Relative floor height: shallow undulations of poured concrete plus a fall towards the drains.
 * Blood runs down its gradient, so rivulets from nearby bodies find the same channels.
 */
export function floorHeight(x: number, z: number) {
  // broad undulations dominate the slope; finer ripples only bend the runs a little
  let h = 0.55 * vnoise(x * 0.3, z * 0.3) + 0.1 * vnoise(x * 0.9 + 7.1, z * 0.9 + 3.3) + 0.012 * vnoise(x * 3.1 + 1.7, z * 3.1 + 9.2);
  for (const [dx, dz] of DRAINS) h -= 1.9 * Math.exp(-Math.hypot(x - dx, z - dz) / 9);
  return h;
}
/** Downhill direction on the floor (unit, xz). */
export function floorFlow(x: number, z: number, out: { x: number; z: number }) {
  const e = 0.06;
  const gx = (floorHeight(x + e, z) - floorHeight(x - e, z)) / (2 * e);
  const gz = (floorHeight(x, z + e) - floorHeight(x, z - e)) / (2 * e);
  const l = Math.hypot(gx, gz);
  if (l < 1e-6) {
    out.x = 1;
    out.z = 0;
  } else {
    out.x = -gx / l;
    out.z = -gz / l;
  }
  return out;
}
const _f = { x: 0, z: 0 };

interface Pool {
  x: number;
  y: number;
  z: number;
  r: number;
  rMax: number;
  rate: number;
  seed: number;
  delay: number;
  /** Downhill direction and how far the pool leans that way. */
  dx: number;
  dz: number;
  st: number;
  /** Rivulets still to send out once the pool has spread far enough. */
  runs: number;
  /** Radius when last painted (a redraw that changes no texel is skipped). */
  drawnR: number;
}

/** A thin run of blood creeping away from a pool, following the floor. */
interface Rivulet {
  x: number;
  z: number;
  dx: number;
  dz: number;
  /** Remaining run length (m) and the starting amount. */
  vol: number;
  vol0: number;
  w0: number;
  speed: number;
  seed: number;
  delay: number;
  /** Last logged point (a persistent segment is logged every few cm). */
  lx: number;
  lz: number;
  gen: number;
}

export class BloodAtlas {
  rt: THREE.WebGLRenderTarget;
  faces: PaintFace[] = [];
  private shelfX = 0;
  private shelfY = 0;
  private shelfH = 0;
  private addGeo: THREE.BufferGeometry;
  private maxGeo: THREE.BufferGeometry;
  private addMesh: THREE.Mesh;
  private maxMesh: THREE.Mesh;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  private addCount = 0;
  private maxCount = 0;
  /** Persistent log of every splat ever painted (world-space), used to restore after context loss. */
  log = new Float32Array(LOG_STRIDE * 4096);
  logCount = 0;
  pools: Pool[] = [];
  rivulets: Rivulet[] = [];
  /** Floor half extents (rivulets stop at the walls). */
  private halfW: number;
  private halfD: number;
  /** CPU coverage grid (floor), 10cm cells, used for bloody footprints. */
  coverage: Float32Array;
  covW: number;
  covH: number;
  covX0: number;
  covZ0: number;
  totalSplats = 0;
  needsRestore = false;
  /** Renderer used to auto-flush when a batch fills up (no splat is ever dropped). */
  renderer: THREE.WebGLRenderer | null = null;

  constructor(public size: number, floorW: number, floorD: number) {
    this.rt = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    const mk = () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_QUADS * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aLocal', new THREE.BufferAttribute(new Float32Array(MAX_QUADS * 4 * 2), 2).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aParams', new THREE.BufferAttribute(new Float32Array(MAX_QUADS * 4 * 4), 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aDir', new THREE.BufferAttribute(new Float32Array(MAX_QUADS * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const idx = new Uint32Array(MAX_QUADS * 6);
      for (let i = 0; i < MAX_QUADS; i++) {
        idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
      }
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.setDrawRange(0, 0);
      return g;
    };
    this.addGeo = mk();
    this.maxGeo = mk();
    const addMat = new THREE.ShaderMaterial({
      vertexShader: SPLAT_VERT,
      fragmentShader: SPLAT_FRAG,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const maxMat = addMat.clone();
    maxMat.blendEquation = THREE.MaxEquation;
    maxMat.blendEquationAlpha = THREE.MaxEquation;
    this.addMesh = new THREE.Mesh(this.addGeo, addMat);
    this.maxMesh = new THREE.Mesh(this.maxGeo, maxMat);
    this.addMesh.frustumCulled = this.maxMesh.frustumCulled = false;
    this.scene.add(this.addMesh, this.maxMesh);
    this.covW = Math.ceil(floorW / 0.1);
    this.covH = Math.ceil(floorD / 0.1);
    this.covX0 = -floorW / 2;
    this.covZ0 = -floorD / 2;
    this.halfW = floorW / 2 - 0.15;
    this.halfD = floorD / 2 - 0.15;
    this.coverage = new Float32Array(this.covW * this.covH);
  }

  /** Allocate an atlas rect for a face of w x h meters at `density` texels/m. */
  addFace(origin: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, w: number, h: number, kind: FaceKind, density: number): PaintFace {
    const S = this.size;
    let pw = Math.max(4, Math.ceil(w * density));
    let ph = Math.max(4, Math.ceil(h * density));
    if (pw > S) {
      ph = Math.ceil((ph * S) / pw);
      pw = S;
    }
    if (this.shelfX + pw + 2 > S) {
      this.shelfX = 0;
      this.shelfY += this.shelfH + 2;
      this.shelfH = 0;
    }
    if (this.shelfY + ph > S) {
      console.warn('blood atlas full; reducing face resolution');
      pw = Math.max(4, pw >> 1);
      ph = Math.max(4, ph >> 1);
      if (this.shelfY + ph > S) {
        // fallback: share a tiny corner (still persistent, just low-res)
        const f: PaintFace = { id: this.faces.length, origin: origin.clone(), u: u.clone().normalize(), v: v.clone().normalize(), n: new THREE.Vector3().crossVectors(u, v).normalize(), w, h, rect: [0, 0, 4 / S, 4 / S], kind };
        this.faces.push(f);
        return f;
      }
    }
    const rect: [number, number, number, number] = [(this.shelfX + 1) / S, (this.shelfY + 1) / S, (pw - 2) / S, (ph - 2) / S];
    this.shelfX += pw + 2;
    this.shelfH = Math.max(this.shelfH, ph);
    const f: PaintFace = {
      id: this.faces.length,
      origin: origin.clone(),
      u: u.clone().normalize(),
      v: v.clone().normalize(),
      n: new THREE.Vector3().crossVectors(u, v).normalize(),
      w,
      h,
      rect,
      kind,
    };
    this.faces.push(f);
    return f;
  }

  /** UV in atlas for face-local (lu, lv) meters. */
  faceUV(f: PaintFace, lu: number, lv: number): [number, number] {
    return [f.rect[0] + (lu / f.w) * f.rect[2], f.rect[1] + (lv / f.h) * f.rect[3]];
  }

  /**
   * Paint a splat. `normal` (optional) restricts which surfaces receive it (direction the blood travels INTO the surface is -normal).
   * `dir` = travel direction for stretched drops.
   */
  splat(pos: THREE.Vector3, radius: number, type: SplatType, intensity = 1, normal: THREE.Vector3 | null = null, dir: THREE.Vector3 | null = null, stretch = 0, seed = Math.random() * 100, log = true) {
    if (log) this.record(pos, normal, radius, type, seed, intensity, dir, stretch);
    this.emit(pos, radius, type, intensity, normal, dir, stretch, seed, type === SPLAT.pool || type === SPLAT.stream ? 'max' : 'add');
    if (type !== SPLAT.ao && type !== SPLAT.paint) this.markCoverage(pos, type === SPLAT.stream ? radius * (1 + stretch) : radius, intensity);
    this.totalSplats++;
  }

  private markCoverage(pos: THREE.Vector3, r: number, inten: number) {
    if (pos.y > 0.15) return;
    const cx = Math.floor((pos.x - this.covX0) / 0.1), cz = Math.floor((pos.z - this.covZ0) / 0.1);
    const rr = Math.ceil(r / 0.1);
    for (let z = cz - rr; z <= cz + rr; z++) {
      if (z < 0 || z >= this.covH) continue;
      for (let x = cx - rr; x <= cx + rr; x++) {
        if (x < 0 || x >= this.covW) continue;
        const dx = (x + 0.5) * 0.1 + this.covX0 - pos.x, dz = (z + 0.5) * 0.1 + this.covZ0 - pos.z;
        if (dx * dx + dz * dz <= r * r) this.coverage[z * this.covW + x] = Math.min(1, this.coverage[z * this.covW + x] + inten * 0.6);
      }
    }
  }
  coverageAt(x: number, z: number) {
    const cx = Math.floor((x - this.covX0) / 0.1), cz = Math.floor((z - this.covZ0) / 0.1);
    if (cx < 0 || cz < 0 || cx >= this.covW || cz >= this.covH) return 0;
    return this.coverage[cz * this.covW + cx];
  }

  private record(pos: THREE.Vector3, normal: THREE.Vector3 | null, radius: number, type: number, seed: number, intensity: number, dir: THREE.Vector3 | null, stretch: number) {
    if ((this.logCount + 1) * LOG_STRIDE > this.log.length) {
      const n = new Float32Array(this.log.length * 2);
      n.set(this.log);
      this.log = n;
    }
    const o = this.logCount * LOG_STRIDE;
    const L = this.log;
    L[o] = pos.x; L[o + 1] = pos.y; L[o + 2] = pos.z;
    L[o + 3] = normal ? normal.x : 0; L[o + 4] = normal ? normal.y : 0; L[o + 5] = normal ? normal.z : 0;
    L[o + 6] = radius; L[o + 7] = type; L[o + 8] = seed; L[o + 9] = intensity;
    L[o + 10] = dir ? dir.x : 0; L[o + 11] = dir ? dir.y : 0; L[o + 12] = dir ? dir.z : 0; L[o + 13] = stretch;
    this.logCount++;
  }

  private emit(pos: THREE.Vector3, radius: number, type: number, intensity: number, normal: THREE.Vector3 | null, dir: THREE.Vector3 | null, stretch: number, seed: number, mode: 'add' | 'max') {
    const isPool = type === SPLAT.pool;
    // pools: fingers reach ~1.9 r, and the teardrop leans (1 + stretch) times further downhill only
    const reach = type === SPLAT.splash ? 1.7 : type === SPLAT.smear ? 1.0 + stretch : type === SPLAT.drip ? 2.2 + stretch : isPool ? 1.9 : 1.15 + stretch;
    for (const f of this.faces) {
      _p.subVectors(pos, f.origin);
      const pd = _p.dot(f.n);
      const maxPlane = type === SPLAT.ao ? radius * 0.5 : radius * 0.7 + 0.03;
      if (pd < -0.05 || pd > maxPlane) continue;
      if (normal && normal.dot(f.n) < 0.25) continue;
      const lu = _p.dot(f.u), lv = _p.dot(f.v);
      const ext = radius * reach;
      if (lu < -ext || lv < -ext || lu > f.w + ext || lv > f.h + ext) continue;
      const fall = pd > radius * 0.2 ? Math.max(0, 1 - (pd - radius * 0.2) / Math.max(1e-3, maxPlane - radius * 0.2)) : 1;
      if (fall <= 0.01) continue;
      let u0 = lu - ext, u1 = lu + ext, v0 = lv - ext, v1 = lv + ext;
      if (type === SPLAT.drip) v0 = lv - radius * (2.4 + stretch) - 0.02;
      if (isPool && dir && stretch > 0) {
        const lean = ext * stretch;
        const du = dir.dot(f.u), dv = dir.dot(f.v);
        u0 += Math.min(0, du) * lean;
        u1 += Math.max(0, du) * lean;
        v0 += Math.min(0, dv) * lean;
        v1 += Math.max(0, dv) * lean;
      }
      u0 = Math.max(0, u0); v0 = Math.max(0, v0); u1 = Math.min(f.w, u1); v1 = Math.min(f.h, v1);
      if (u1 <= u0 || v1 <= v0) continue;
      let dx = 0, dy = 0;
      if (dir) {
        dx = dir.dot(f.u);
        dy = dir.dot(f.v);
      }
      this.pushQuad(mode, f, u0, v0, u1, v1, lu, lv, radius, type, seed, intensity * fall, dx, dy, stretch);
    }
  }

  private pushQuad(mode: 'add' | 'max', f: PaintFace, u0: number, v0: number, u1: number, v1: number, cu: number, cv: number, r: number, type: number, seed: number, inten: number, dx: number, dy: number, st: number) {
    const geo = mode === 'add' ? this.addGeo : this.maxGeo;
    let count = mode === 'add' ? this.addCount : this.maxCount;
    if (count >= MAX_QUADS) {
      if (this.renderer) {
        this.flush(this.renderer);
        count = 0;
      } else {
        // no renderer yet: mark for a full rebuild from the persistent log
        this.needsRestore = true;
        return;
      }
    }
    const pos = geo.attributes.position.array as Float32Array;
    const loc = geo.attributes.aLocal.array as Float32Array;
    const prm = geo.attributes.aParams.array as Float32Array;
    const dir = geo.attributes.aDir.array as Float32Array;
    const corners: [number, number][] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (let i = 0; i < 4; i++) {
      const [lu, lv] = corners[i];
      const [x, y] = this.faceUV(f, lu, lv);
      const vi = count * 4 + i;
      pos[vi * 3] = x; pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = 0;
      loc[vi * 2] = lu - cu; loc[vi * 2 + 1] = lv - cv;
      prm[vi * 4] = r; prm[vi * 4 + 1] = type; prm[vi * 4 + 2] = seed; prm[vi * 4 + 3] = inten;
      dir[vi * 3] = dx; dir[vi * 3 + 1] = dy; dir[vi * 3 + 2] = st;
    }
    count++;
    if (mode === 'add') this.addCount = count;
    else this.maxCount = count;
  }

  /**
   * Start a pool that grows over time (e.g. under a corpse). It leans downhill, and once it has
   * spread far enough it sends thin runs of blood creeping away along the floor.
   */
  addPool(x: number, z: number, rMax: number, duration: number, delay = 0, runs = -1) {
    floorFlow(x, z, _f);
    const n = runs >= 0 ? runs : rMax > 0.4 ? 2 + Math.floor(Math.random() * 3) : rMax > 0.22 ? 1 + Math.floor(Math.random() * 2) : 0;
    this.pools.push({ x, y: 0.01, z, r: Math.min(0.05, rMax), rMax, rate: rMax / Math.max(0.5, duration), seed: Math.random() * 100, delay, dx: _f.x, dz: _f.z, st: 0.25 + Math.random() * 0.45, runs: n, drawnR: 0 });
    // a couple of offset lobes so pools spread irregularly (blood runs along the floor)
    const lobes = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < lobes; i++) {
      // lobes favour the downhill side
      const a = Math.atan2(_f.z, _f.x) + (Math.random() - 0.5) * 2.4;
      const d = rMax * (0.45 + Math.random() * 0.35);
      const r2 = rMax * (0.4 + Math.random() * 0.3);
      const lx = x + Math.cos(a) * d, lz = z + Math.sin(a) * d;
      floorFlow(lx, lz, _f);
      this.pools.push({ x: lx, y: 0.01, z: lz, r: 0.03, rMax: r2, rate: r2 / Math.max(0.5, duration * 1.3), seed: Math.random() * 100, delay: delay + duration * 0.2, dx: _f.x, dz: _f.z, st: 0.2 + Math.random() * 0.4, runs: 0, drawnR: 0 });
      floorFlow(x, z, _f);
    }
  }

  /**
   * A rivulet: creeps from (x, z) roughly along (dx, dz), bending with the floor, branching now and
   * then, thinning as it runs out over `len` metres, and beading where it stops.
   */
  addRivulet(x: number, z: number, dx: number, dz: number, len: number, width: number, speed: number, delay = 0, gen = 0) {
    const l = Math.hypot(dx, dz) || 1;
    // never thinner than ~2.4 texels of the floor's paint resolution (else it filters away to a stain)
    const floor = this.faces.find((f) => f.kind === 'floor');
    if (floor) width = Math.max(width, (2.4 * floor.w) / (floor.rect[2] * this.size));
    this.rivulets.push({ x, z, dx: dx / l, dz: dz / l, vol: len, vol0: len, w0: width, speed, seed: Math.random() * 100, delay, lx: x, lz: z, gen });
  }

  /** Paint one rivulet segment (a capsule from a to b). */
  private segment(ax: number, az: number, bx: number, bz: number, w: number, seed: number, log: boolean) {
    const len = Math.hypot(bx - ax, bz - az);
    _p.set((ax + bx) / 2, 0.01, (az + bz) / 2);
    if (len < 1e-4) _d.set(1, 0, 0);
    else _d.set((bx - ax) / len, 0, (bz - az) / len);
    this.splat(_p, w, SPLAT.stream, 1, _UP, _d, len / 2 / w, seed, log);
  }

  private poolAcc = 0;
  update(dt: number) {
    // growing pools change slowly: redraw them at ~20 Hz (MAX blending makes skipped frames lossless)
    this.poolAcc += dt;
    if (this.poolAcc < 0.05) return;
    dt = this.poolAcc;
    this.poolAcc = 0;
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const p = this.pools[i];
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      // decelerating growth
      const k = 1 - p.r / p.rMax;
      p.r = Math.min(p.rMax, p.r + p.rate * dt * (0.3 + 1.4 * k));
      _p.set(p.x, p.y, p.z);
      _d.set(p.dx, 0, p.dz);
      const st = p.st * Math.min(1, p.r / (p.rMax * 0.5));
      const done = p.r >= p.rMax * 0.995;
      if (done || p.r - p.drawnR > 0.012) {
        this.emit(_p, p.r, SPLAT.pool, 1, null, _d, st, p.seed, 'max');
        p.drawnR = p.r;
      }
      // spread far enough: blood starts running away from the downhill edge
      if (p.runs > 0 && p.r > p.rMax * 0.8) {
        for (let j = 0; j < p.runs; j++) {
          const base = Math.atan2(p.dz, p.dx);
          const a = base + (Math.random() - 0.5) * 2.0;
          const ca = Math.cos(a), sa = Math.sin(a);
          // leave from the pool's final edge, further out on the downhill side (the pool leans that way)
          const down = Math.max(0, ca * p.dx + sa * p.dz);
          const reach = p.rMax * (0.82 + p.st * down * 0.9);
          const scale = Math.min(1.4, p.rMax / 0.45);
          this.addRivulet(p.x + ca * reach, p.z + sa * reach, ca + p.dx * 0.8, sa + p.dz * 0.8, (0.6 + Math.random() * 1.3) * scale, (0.017 + Math.random() * 0.014) * scale, 0.09 + Math.random() * 0.1, Math.random() * 2.5);
        }
        p.runs = 0;
      }
      if (done) {
        this.record(_p, null, p.rMax, SPLAT.pool, p.seed, 1, _d, st);
        this.markCoverage(_p, p.rMax, 1);
        this.pools.splice(i, 1);
      }
    }
    this.updateRivulets(dt);
  }

  private updateRivulets(dt: number) {
    for (let i = this.rivulets.length - 1; i >= 0; i--) {
      const s = this.rivulets[i];
      if (s.delay > 0) {
        s.delay -= dt;
        continue;
      }
      const k = Math.max(0, s.vol / s.vol0);
      // creeps, slowing as it thins out
      const step = s.speed * (0.3 + 0.7 * k) * dt;
      floorFlow(s.x, s.z, _f);
      // steer gradually towards downhill, bent by a slow, coherent wobble along the run
      const wob = (vnoise(s.x * 2.2 + s.seed, s.z * 2.2 - s.seed) - 0.5) * 0.8;
      const cw = Math.cos(wob), sw = Math.sin(wob);
      const wx = _f.x * cw - _f.z * sw, wz = _f.x * sw + _f.z * cw;
      const turn = 1 - Math.exp(-1.0 * dt);
      let nx = s.dx + (wx - s.dx) * turn;
      let nz = s.dz + (wz - s.dz) * turn;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      s.dx = nx;
      s.dz = nz;
      const ox = s.x, oz = s.z;
      s.x += nx * step;
      s.z += nz * step;
      s.vol -= step;
      const w = s.w0 * (0.42 + 0.58 * Math.sqrt(k));
      // the moving head (smooth growth), plus a persistent segment every few centimetres
      this.segment(ox, oz, s.x, s.z, w, s.seed, false);
      if (Math.hypot(s.x - s.lx, s.z - s.lz) > 0.035) {
        this.segment(s.lx, s.lz, s.x, s.z, w, s.seed, true);
        s.lx = s.x;
        s.lz = s.z;
      }
      // now and then the run splits
      if (s.gen < 2 && s.vol > 0.18 && Math.random() < step * 1.4) {
        const a = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.55);
        const c = Math.cos(a), sn = Math.sin(a);
        this.addRivulet(s.x, s.z, nx * c - nz * sn, nx * sn + nz * c, s.vol * 0.5, w * 0.78, s.speed * 0.9, 0, s.gen + 1);
        s.vol *= 0.72;
      }
      const out = Math.abs(s.x) > this.halfW || Math.abs(s.z) > this.halfD;
      if (s.vol <= 0 || out) {
        // the run ends in a small bead of blood
        if (!out) {
          _p.set(s.x, 0.01, s.z);
          this.splat(_p, w * 1.5, SPLAT.pool, 1, _UP, _d.set(s.dx, 0, s.dz), 0.4, s.seed);
        }
        this.rivulets.splice(i, 1);
      }
    }
  }

  /** Render queued splats into the persistent atlas. */
  flush(renderer: THREE.WebGLRenderer) {
    if (this.needsRestore) {
      this.restore(renderer);
      return;
    }
    if (this.addCount === 0 && this.maxCount === 0) return;
    this.addGeo.setDrawRange(0, this.addCount * 6);
    this.maxGeo.setDrawRange(0, this.maxCount * 6);
    for (const g of [this.addGeo, this.maxGeo]) {
      for (const k of ['position', 'aLocal', 'aParams', 'aDir']) (g.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
    }
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.rt);
    this.addMesh.visible = this.addCount > 0;
    this.maxMesh.visible = this.maxCount > 0;
    renderer.render(this.scene, this.cam);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAuto;
    this.addCount = 0;
    this.maxCount = 0;
  }

  /** Clear and redraw every logged splat (after context loss / atlas re-creation). */
  restore(renderer: THREE.WebGLRenderer) {
    this.needsRestore = false;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(prevTarget);
    const L = this.log;
    const pos = new THREE.Vector3(), n = new THREE.Vector3(), d = new THREE.Vector3();
    for (let i = 0; i < this.logCount; i++) {
      const o = i * LOG_STRIDE;
      pos.set(L[o], L[o + 1], L[o + 2]);
      n.set(L[o + 3], L[o + 4], L[o + 5]);
      d.set(L[o + 10], L[o + 11], L[o + 12]);
      const type = L[o + 7];
      this.emit(pos, L[o + 6], type, L[o + 9], n.lengthSq() > 0 ? n : null, d.lengthSq() > 0 ? d : null, L[o + 13], L[o + 8], type === SPLAT.pool || type === SPLAT.stream ? 'max' : 'add');
      if (this.addCount >= MAX_QUADS - 64 || this.maxCount >= MAX_QUADS - 64) this.flush(renderer);
    }
    this.flush(renderer);
  }

  /** Patch a standard material so it shows the persistent blood/paint/AO from the atlas. */
  patchMaterial(mat: THREE.MeshStandardMaterial, opts: { paintColor?: THREE.Color; dirt?: number } = {}) {
    const atlas = this.rt.texture;
    const paintColor = opts.paintColor ?? new THREE.Color(0.75, 0.72, 0.62);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uBloodAtlas = { value: atlas };
      shader.uniforms.uPaintColor = { value: paintColor };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 bloodUv;\nvarying vec2 vBloodUv;\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBloodUv = bloodUv;\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform sampler2D uBloodAtlas;
uniform vec3 uPaintColor;
varying vec2 vBloodUv;
varying vec3 vWPos;
float lsBlood = 0.0;
float lsThick = 0.0;
${NOISE_GLSL}`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
{
  vec4 b = texture2D(uBloodAtlas, vBloodUv);
  float n = lsNoise(vWPos * 38.0);
  // paint decals
  diffuseColor.rgb = mix(diffuseColor.rgb, uPaintColor * (0.85 + 0.3 * n), clamp(b.b, 0.0, 1.0) * 0.8);
  // contact shadows / grime
  diffuseColor.rgb *= 1.0 - clamp(b.a, 0.0, 1.0) * 0.72;
  float amt = b.r;
  float cov = smoothstep(0.04, 0.24, amt + (n - 0.5) * 0.06);
  float dark = clamp(amt * 0.9 + b.g * 0.9 - 0.25, 0.0, 1.0);
  // thin blood stains the surface (multiplicative), thick blood is its own dark glossy layer
  vec3 stain = diffuseColor.rgb * vec3(0.22, 0.03, 0.028) + vec3(0.018, 0.0, 0.0);
  vec3 thick = mix(vec3(0.075, 0.003, 0.003), vec3(0.022, 0.0, 0.0), dark);
  vec3 bc = mix(stain, thick, smoothstep(0.15, 0.6, amt + b.g * 0.5));
  float rim = cov * (1.0 - smoothstep(0.2, 0.45, amt)) * 0.35;
  bc *= 1.0 - rim;
  diffuseColor.rgb = mix(diffuseColor.rgb, bc, cov);
  lsBlood = cov;
  // only thick, fresh pools are glossy; thin stains soak into the concrete (matte)
  lsThick = clamp(b.g * 1.6 - 0.15, 0.0, 1.0);
}`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, mix(0.85, 0.24, lsThick), lsBlood);`,
        );
    };
    mat.customProgramCacheKey = () => 'ls-blood-surface';
  }
}
