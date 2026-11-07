// =============================================================================
// Moving traffic (cars, trucks, buses, trains) — fully animated on the GPU.
//
// Every road / rail centreline is resampled into one row of a float texture
// (x, y, z per sample, local region coordinates). Each vehicle is one instance
// with (path row, path length, sample spacing, start offset, speed, lateral
// lane offset, size, colour). The vertex shader computes the distance along the
// path from the time uniform, samples the texture at the front and back of the
// vehicle (so long trains follow curves), and orients the body. Head- and
// tail-lights are an instanced POINTS draw sharing the same attributes.
// Two draw calls per region, no per-frame CPU work.
// =============================================================================
import * as THREE from 'three';
import { CITY_U, CURVE_GLSL } from './materials.js';

const TEX_W = 1024;

const TRAFFIC_GLSL = /* glsl */`
uniform highp sampler2D uPath;
attribute vec4 vA;   // row, length, ds, s0
attribute vec4 vB;   // speed (signed), lateral offset (right of travel), length, width
attribute vec4 vC;   // r, g, b, height
attribute float vK;  // kind: 0 car, 1 truck, 2 bus, 3 locomotive, 4 wagon
vec3 cityPathAt(float row, float s, float ds) {
  float fi = clamp(s / ds, 0.0, float(${TEX_W - 1}) - 0.001);
  int i0 = int(fi);
  float t = fi - float(i0);
  vec4 a = texelFetch(uPath, ivec2(i0, int(row + 0.5)), 0);
  vec4 b = texelFetch(uPath, ivec2(i0 + 1, int(row + 0.5)), 0);
  return mix(a.xyz, b.xyz, t);
}
// P = centre on the road surface, F = forward (travel), R = right, fade = 0 near path ends
void cityVehicle(out vec3 P, out vec3 F, out vec3 R, out float fade) {
  float L = vA.y;
  float s = mod(vA.w + vB.x * uTime, L);
  float hl = vB.z * 0.5;
  vec3 pf = cityPathAt(vA.x, clamp(s + hl, 0.0, L), vA.z);
  vec3 pb = cityPathAt(vA.x, clamp(s - hl, 0.0, L), vA.z);
  F = pf - pb;
  F = length(F) > 1e-3 ? normalize(F) : vec3(1.0, 0.0, 0.0);
  if (vB.x < 0.0) F = -F;
  R = normalize(vec3(-F.z, 0.0, F.x) + vec3(1e-5, 0.0, 0.0));
  P = 0.5 * (pf + pb) + R * vB.y;
  fade = smoothstep(0.0, 90.0, s) * smoothstep(0.0, 90.0, L - s);
}
`;

const BODY_VERT_HEAD = /* glsl */`
${CURVE_GLSL}
uniform float uTime;
${TRAFFIC_GLSL}
attribute float aGlass;
varying float vGlass;
`;

const LIGHT_VERT = /* glsl */`
${CURVE_GLSL}
uniform float uLights;
uniform float uTime;
uniform float uPx;
uniform float uFogD;
${TRAFFIC_GLSL}
varying vec3 vCol;
void main() {
  vec3 P, F, R; float fade;
  cityVehicle(P, F, R, fade);
  float front = position.z;                 // +0.5 front, -0.5 rear
  vec3 lp = P + F * (front * vB.z * 0.96) + vec3(0.0, 0.75 + (vK > 2.5 ? 2.2 : 0.0), 0.0);
  vec4 wp = cityCurve(modelMatrix * vec4(lp, 1.0));
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float d = max(-mv.z, 1.0);
  vec3 toCam = normalize(uCamPos - wp.xyz);
  vec3 Fw = normalize(mat3(modelMatrix) * F);
  float facing = dot(Fw, toCam);
  vec3 col;
  if (front > 0.0) {
    float k = 0.25 + 0.75 * pow(max(facing, 0.0), 2.0);
    col = vec3(1.0, 0.9, 0.72) * 70.0 * k;
    if (vK > 3.5) col = vec3(0.0);
  } else {
    float k = 0.3 + 0.7 * pow(max(-facing, 0.0), 2.0);
    col = vec3(1.0, 0.04, 0.015) * 26.0 * k;
    if (vK > 2.5 && vK < 3.5) col = vec3(0.0);
    if (vK > 3.5) col = vec3(1.0, 0.04, 0.015) * 6.0 * k * step(0.97, fract(vA.w * 0.0137));
  }
  float size = (vK < 0.5 ? 1.3 : 2.0) * uPx / d;
  float k = 1.0;
  if (size < 2.0) { k = size * size / 4.0; size = 2.0; }
  float fog = exp(-uFogD * uFogD * d * d);
  vCol = col * uLights * k * fog * fade;
  gl_PointSize = min(size, 32.0);
  if (dot(vCol, vec3(1.0)) < 1e-4) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const LIGHT_FRAG = /* glsl */`
varying vec3 vCol;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float r2 = dot(p, p) * 4.0;
  gl_FragColor = vec4(vCol * (exp(-r2 * 5.0) + 0.1 * exp(-r2 * 1.3)), 1.0);
}`;

/** Unit vehicle: body 0..0.55 h, cabin / glasshouse above; +z forward; size 1x1x1. */
function unitVehicle() {
  const P = [], N = [], G = [], I = [];
  const box = (x0, x1, y0, y1, z0, z1, glass) => {
    const faces = [
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
    ];
    for (const f of faces) {
      const k = P.length / 3;
      for (let i = 0; i < 4; i++) { P.push(...f[i]); N.push(...f[4]); G.push(f[4][1] > 0.5 && glass ? 0.6 : glass); }
      I.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
  };
  box(-0.5, 0.5, 0.12, 0.55, -0.5, 0.5, 0);
  box(-0.44, 0.44, 0.55, 1.0, -0.32, 0.22, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aGlass', new THREE.Float32BufferAttribute(G, 1));
  g.setIndex(I);
  return g;
}
let _unitVehicle = null;

export const CAR_COLORS = ['#e9e9e7', '#1b1c1e', '#9a9da1', '#5d6166', '#24324e', '#7c1a17', '#c8c8c3', '#34383d', '#2a4a3c', '#b8a98a', '#3b5f8c', '#8f8f8f', '#f2f2ef', '#0f1012']
  .map((h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; });

export class Traffic {
  constructor(name) {
    this.name = name;
    this.rows = [];        // Float32Array(TEX_W * 4) per path
    this.lengths = [];
    this.ds = [];
    this.n = 0;
    this.cap = 1024;
    this.A = new Float32Array(this.cap * 4); this.B = new Float32Array(this.cap * 4); this.C = new Float32Array(this.cap * 4); this.K = new Float32Array(this.cap);
  }
  /** pts: array of {x, y, z} (dense polyline, local coords). Returns the row index. */
  addPath(pts) {
    let L = 0;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); cum.push(L); }
    const n = Math.min(TEX_W, Math.max(2, Math.ceil(L / 6) + 1));
    const ds = L / (n - 1);
    const row = new Float32Array(TEX_W * 4);
    let j = 0;
    for (let k = 0; k < TEX_W; k++) {
      const s = Math.min(L, k * ds);
      while (j < pts.length - 2 && cum[j + 1] < s) j++;
      const t = Math.min(1, Math.max(0, (s - cum[j]) / Math.max(1e-6, cum[j + 1] - cum[j])));
      const a = pts[j], b = pts[j + 1];
      row[k * 4] = a.x + (b.x - a.x) * t; row[k * 4 + 1] = a.y + (b.y - a.y) * t; row[k * 4 + 2] = a.z + (b.z - a.z) * t; row[k * 4 + 3] = s;
    }
    this.rows.push(row); this.lengths.push(L); this.ds.push(ds);
    return this.rows.length - 1;
  }
  _grow() {
    this.cap *= 2;
    for (const k of ['A', 'B', 'C']) { const a = new Float32Array(this.cap * 4); a.set(this[k]); this[k] = a; }
    const kk = new Float32Array(this.cap); kk.set(this.K); this.K = kk;
  }
  addVehicle(row, s0, speed, lateral, length, width, height, color, kind = 0) {
    if (this.n >= this.cap) this._grow();
    const i = this.n++;
    this.A.set([row, this.lengths[row], this.ds[row], s0], i * 4);
    this.B.set([speed, lateral, length, width], i * 4);
    this.C.set([color[0], color[1], color[2], height], i * 4);
    this.K[i] = kind;
  }
  /**
   * Populate a path with lanes of traffic. lanes: [{lateral, dir: +1|-1, speed, spacing}]
   * (lateral = metres to the right of the TRAVEL direction).
   */
  populate(row, lanes, rnd, { truckShare = 0.12, busShare = 0.02 } = {}) {
    const L = this.lengths[row];
    for (const ln of lanes) {
      const sp = ln.spacing;
      const count = Math.floor(L / sp);
      const speed = ln.speed * (0.93 + 0.14 * rnd());
      for (let k = 0; k < count; k++) {
        if (rnd() < 0.18) continue;                      // gaps in the flow
        const s0 = (k + 0.3 * rnd()) * sp;
        const r = rnd();
        let len = 4.5, wid = 1.82, hei = 1.48, kind = 0, col = CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)];
        if (r < truckShare) { len = 16.5; wid = 2.5; hei = 3.9; kind = 1; col = rnd() < 0.6 ? [0.8, 0.8, 0.78] : CAR_COLORS[Math.floor(rnd() * 6)]; }
        else if (r < truckShare + busShare) { len = 12; wid = 2.55; hei = 3.2; kind = 2; col = [0.75, 0.72, 0.62]; }
        else if (r < truckShare + busShare + 0.18) { len = 4.9; wid = 1.95; hei = 1.8; }   // SUVs
        this.addVehicle(row, s0, speed * ln.dir, ln.lateral, len, wid, hei, col, kind);
      }
    }
  }
  /** A train: loco + wagons, all with the same speed. */
  addTrain(row, s0, speed, wagons, rnd, lateral = 0) {
    const locoLen = 22, wagLen = 17.5, gap = 1.2;
    let s = s0;
    const dir = Math.sign(speed) || 1;
    const loco = [0.55, 0.12, 0.08];
    this.addVehicle(row, s, speed, lateral, locoLen, 3.0, 4.6, loco, 3);
    for (let i = 0; i < wagons; i++) {
      s -= dir * (i === 0 ? locoLen / 2 + wagLen / 2 + gap : wagLen + gap);
      const r = rnd();
      const col = r < 0.4 ? [0.28, 0.12, 0.07] : (r < 0.6 ? [0.62, 0.6, 0.55] : (r < 0.8 ? [0.12, 0.13, 0.15] : [0.35, 0.3, 0.2]));
      this.addVehicle(row, s, speed, lateral, wagLen, 3.0, 4.0, col, 4);
    }
  }

  build() {
    if (this.n === 0 || this.rows.length === 0) return null;
    const H = this.rows.length;
    const data = new Float32Array(TEX_W * H * 4);
    for (let r = 0; r < H; r++) data.set(this.rows[r], r * TEX_W * 4);
    const tex = new THREE.DataTexture(data, TEX_W, H, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.texture = tex;
    const uPath = { value: tex };
    const inst = (g) => {
      g.setAttribute('vA', new THREE.InstancedBufferAttribute(this.A.slice(0, this.n * 4), 4));
      g.setAttribute('vB', new THREE.InstancedBufferAttribute(this.B.slice(0, this.n * 4), 4));
      g.setAttribute('vC', new THREE.InstancedBufferAttribute(this.C.slice(0, this.n * 4), 4));
      g.setAttribute('vK', new THREE.InstancedBufferAttribute(this.K.slice(0, this.n), 1));
      g.instanceCount = this.n;
    };
    // --- bodies
    if (!_unitVehicle) _unitVehicle = unitVehicle();
    const bg = new THREE.InstancedBufferGeometry();
    for (const [k, a] of Object.entries(_unitVehicle.attributes)) bg.setAttribute(k, a);
    bg.setIndex(_unitVehicle.index);
    inst(bg);
    const bodyMat = new THREE.MeshStandardMaterial({ name: `${this.name}.vehicles`, vertexColors: true, roughness: 0.35, metalness: 0.45 });
    bodyMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, CITY_U, { uPath });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${BODY_VERT_HEAD}`)
        .replace('#include <beginnormal_vertex>', `
vec3 vhP, vhF, vhR; float vhFade;
cityVehicle(vhP, vhF, vhR, vhFade);
vec3 vhU = normalize(cross(vhR, vhF));
vec3 objectNormal = normalize(vhR * normal.x + vhU * normal.y + vhF * normal.z);
`)
        .replace('#include <begin_vertex>', `
vec3 vhS = vec3(vB.w, vC.w, vB.z) * vhFade;
// trucks / trains: no separate glasshouse, the body is the full height
vec3 vhPos = position;
if (vK > 0.5) { vhPos.y = position.y < 0.6 ? (position.y < 0.2 ? 0.12 : 0.92) : 1.0; if (aGlass > 0.5) vhPos.z = position.z > 0.0 ? 0.5 : 0.3; }
vec3 transformed = vhP + vhR * (vhPos.x * vhS.x) + vhU * (vhPos.y * vhS.y) + vhF * (vhPos.z * vhS.z);
vGlass = vK > 0.5 ? (vK < 2.5 && aGlass > 0.5 && position.z > 0.0 ? 0.7 : 0.0) : aGlass;
`)
        .replace('#include <color_vertex>', `
vColor = vec4(1.0);
vColor.rgb = mix(vC.rgb, vec3(0.02, 0.025, 0.03), vGlass);
`)
        .replace('#include <project_vertex>', `
vec4 vhW = modelMatrix * vec4(transformed, 1.0);
float vhD = length(vhW.xyz - uCamPos);
vec4 mvPosition = viewMatrix * cityCurve(vhW);
gl_Position = projectionMatrix * mvPosition;
if (vhD > 6000.0 || vhFade < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlass;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.08, vGlass);');
    };
    bodyMat.customProgramCacheKey = () => 'city.vehicles';
    const bodies = new THREE.Mesh(bg, bodyMat);
    bodies.name = `${this.name}.vehicles`;
    bodies.frustumCulled = false;
    bodies.matrixAutoUpdate = false;
    // --- lights
    const lg = new THREE.InstancedBufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.5, 0, 0, -0.5], 3));
    inst(lg);
    const lightMat = new THREE.ShaderMaterial({
      name: `${this.name}.vehicleLights`,
      uniforms: { ...CITY_U, uPath },
      vertexShader: LIGHT_VERT, fragmentShader: LIGHT_FRAG,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
    });
    const lights = new THREE.Points(lg, lightMat);
    lights.name = `${this.name}.vehicleLights`;
    lights.frustumCulled = false;
    lights.matrixAutoUpdate = false;
    lights.renderOrder = 5;
    return { bodies, lights, count: this.n };
  }
  dispose() { this.texture?.dispose(); }
}
