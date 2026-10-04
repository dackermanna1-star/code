/**
 * Procedural light utility helicopter model (JetRanger-like proportions, metres, body frame:
 * origin on the ground under the centre of mass, forward = -Z, right = +X, up = +Y).
 *
 * Opaque parts are G-buffer meshes using `createEntityMaterial` (merged per material class with
 * per-face vertex colours: two-tone glossy paint with a cheat line, window frames, intake
 * grilles), so the whole airframe is ~20 draw calls and casts shadows like any entity model:
 *   - fuselage + tail boom: one smooth superellipse loft (nose bubble → cabin → tail cone);
 *     glass areas (wrap-around windscreen, chin windows, door windows) are cut out of the shell
 *     and framed; door seams are thin strips; an inner lining, seats, floor, bulkhead, an
 *     instrument panel with animated needles / horizon / compass card, cyclic, collective, pedals
 *   - engine cowling loft with intake grilles and twin exhaust stacks, mast, swashplate,
 *     4-blade hub, airfoil blades (yellow tips), tail boom drive-shaft cover, horizontal
 *     stabiliser with endplates, swept vertical fin, 2-blade tail rotor and gearbox
 *   - skids with upturned toes and arched cross tubes (moved by the suspension)
 *   - navigation lights (red port / green starboard), white strobes, red beacon, landing light
 *   - a seated pilot (hidden in first person)
 * Forward-pass parts (translucent, `entities.forwardScene`): the canopy glass (fresnel sky / sun
 * reflections), motion-blurred rotor discs that fade in as the blades fade out, light halos.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createEntityMaterial, setEntityLight, ENTITY_SHARED } from '../../render/entityMaterial';
import { GLSL_COMMON } from '../../render/shaders/common';
import { HELI } from './heliPhysics';

// ---------------------------------------------------------------------------------- palette
export const HELI_COLORS = {
  red: 0xa51d18,
  white: 0xe9e5dc,
  stripe: 0x1f2125,
  frame: 0x151619,
  grille: 0x111214,
  metal: 0xb7bbc1,
  darkMetal: 0x404349,
  exhaust: 0x4b4239,
  blade: 0x2a2c30,
  bladeTip: 0xf0bf00,
  lining: 0x55585d,
  headliner: 0x9a9b9d,
  leather: 0x6d4a2c,
  carpet: 0x2b2d30,
  panel: 0x1b1d20,
  suit: 0x56663a,
  glove: 0x1a1a1a,
  helmet: 0xe4e4e0,
  visor: 0x0d1115,
  boot: 0x2a221a,
};

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lin = (hex: number) => new THREE.Color(hex);

// ---------------------------------------------------------------------------------- fuselage profile
const NOSE_Z = -2.05, CAB_Z0 = -0.6, CAB_Z1 = 0.95, TR_Z1 = 2.35, BOOM_Z1 = 6.18;
interface Sec { w: number; top: number; bot: number; nTop: number; nBot: number }

export function boomCenterY(z: number) {
  return 1.47 + 0.15 * clamp((z - TR_Z1) / (BOOM_Z1 - TR_Z1), 0, 1);
}
export function boomRadius(z: number) {
  return 0.4 - 0.25 * clamp((z - TR_Z1) / (BOOM_Z1 - TR_Z1), 0, 1);
}

function fuselageSection(z: number, o: Sec): Sec {
  if (z < CAB_Z0) {
    const c = clamp((CAB_Z0 - z) / (CAB_Z0 - NOSE_Z), 0, 1);
    const s = Math.sqrt(Math.max(0, 1 - c * c));
    o.w = 0.8 * Math.pow(s, 0.72);
    o.top = 1.12 + 0.86 * Math.pow(s, 0.52);
    o.bot = 1.12 - 0.54 * Math.pow(s, 0.62);
    o.nTop = 2.3; o.nBot = 3.0;
  } else if (z <= CAB_Z1) {
    o.w = 0.8; o.top = 1.98; o.bot = 0.58; o.nTop = 2.3; o.nBot = 3.0;
  } else if (z <= TR_Z1) {
    const u = (z - CAB_Z1) / (TR_Z1 - CAB_Z1);
    const hW = sstep(0, 1, u), hB = sstep(0, 0.85, u), hT = sstep(0.2, 1, u);
    o.w = lerp(0.8, 0.4, hW);
    o.top = lerp(1.98, 1.87, hT);
    o.bot = lerp(0.58, 1.07, hB);
    o.nTop = lerp(2.3, 2.0, hW); o.nBot = lerp(3.0, 2.0, hW);
  } else {
    const r = boomRadius(z), yc = boomCenterY(z);
    o.w = r; o.top = yc + r; o.bot = yc - r; o.nTop = 2; o.nBot = 2;
  }
  return o;
}

function cowlSection(z: number, o: Sec): Sec {
  const Z0 = -0.5, Z1 = -0.12, Z2 = 1.5, Z3 = 2.05;
  if (z < Z1) {
    const c = clamp((Z1 - z) / (Z1 - Z0), 0, 1);
    const s = Math.sqrt(Math.max(0, 1 - c * c));
    o.w = 0.44 * Math.pow(s, 0.7); o.top = 2.02 + 0.36 * Math.pow(s, 0.55); o.bot = 1.86;
  } else if (z < Z2) {
    o.w = 0.44; o.top = 2.38; o.bot = 1.86;
  } else {
    const c = clamp((z - Z2) / (Z3 - Z2), 0, 1);
    const s = Math.sqrt(Math.max(0, 1 - c * c));
    o.w = 0.44 * (0.55 + 0.45 * s) * Math.pow(s, 0.3); o.top = 1.98 + 0.4 * Math.pow(s, 0.45); o.bot = 1.86;
  }
  o.nTop = 3.2; o.nBot = 3.2;
  return o;
}

/** Superellipse ring point (θ = 0 right, π/2 top). */
function ringPoint(s: Sec, th: number, out: THREE.Vector3, z: number) {
  const c = Math.cos(th), sn = Math.sin(th);
  const ex = sn >= 0 ? s.nTop : s.nBot;
  const mid = (s.top + s.bot) / 2, hh = (s.top - s.bot) / 2;
  out.set(s.w * Math.sign(c) * Math.pow(Math.abs(c), 2 / ex), mid + hh * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / ex), z);
  return out;
}

interface LoftGrid {
  rings: number;
  segs: number;
  zs: number[];
  P: Float32Array;
  N: Float32Array;
}

function loftGrid(zs: number[], segs: number, section: (z: number, o: Sec) => Sec): LoftGrid {
  const rings = zs.length;
  const P = new Float32Array(rings * segs * 3), N = new Float32Array(rings * segs * 3);
  const s: Sec = { w: 0, top: 0, bot: 0, nTop: 2, nBot: 2 };
  const v = new THREE.Vector3();
  for (let i = 0; i < rings; i++) {
    section(zs[i], s);
    for (let j = 0; j < segs; j++) {
      ringPoint(s, (j / segs) * Math.PI * 2, v, zs[i]);
      P.set([v.x, v.y, v.z], (i * segs + j) * 3);
    }
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  const at = (i: number, j: number, o: THREE.Vector3) => {
    const k = (i * segs + (((j % segs) + segs) % segs)) * 3;
    return o.set(P[k], P[k + 1], P[k + 2]);
  };
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segs; j++) {
      at(i, j + 1, t1); at(i, j - 1, t2); a.subVectors(t1, t2);
      at(Math.min(rings - 1, i + 1), j, t1); at(Math.max(0, i - 1), j, t2); b.subVectors(t1, t2);
      n.crossVectors(a, b);
      if (n.lengthSq() < 1e-12) n.set(0, 0, i < rings / 2 ? -1 : 1);
      n.normalize();
      N.set([n.x, n.y, n.z], (i * segs + j) * 3);
    }
  return { rings, segs, zs, P, N };
}

/** Collects non-indexed triangles with per-face colours (position, normal, uv, color). */
class TriSink {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  tri(P: ArrayLike<number>, N: ArrayLike<number>, ia: number, ib: number, ic: number, c: THREE.Color, flip = false, offset = 0) {
    for (const k of flip ? [ia, ic, ib] : [ia, ib, ic]) {
      const s = flip ? -1 : 1;
      this.pos.push(P[k * 3] + N[k * 3] * offset, P[k * 3 + 1] + N[k * 3 + 1] * offset, P[k * 3 + 2] + N[k * 3 + 2] * offset);
      this.nrm.push(N[k * 3] * s, N[k * 3 + 1] * s, N[k * 3 + 2] * s);
      this.uv.push(0, 0);
      this.col.push(c.r, c.g, c.b);
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

/** Prepare any geometry for merging: non-indexed, position/normal/uv/color only, optional transform. */
function prep(g: THREE.BufferGeometry, color: number | THREE.Color, m?: THREE.Matrix4): THREE.BufferGeometry {
  let geo = g.index ? g.toNonIndexed() : g.clone();
  if (m) geo.applyMatrix4(m);
  for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  const c = color instanceof THREE.Color ? color : lin(color);
  const ca = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  geo.clearGroups();
  if (geo !== g) g.dispose();
  return geo;
}

class Bucket {
  readonly parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: number | THREE.Color, m?: THREE.Matrix4) {
    this.parts.push(prep(g, color, m));
    return this;
  }
  raw(g: THREE.BufferGeometry) {
    this.parts.push(g);
    return this;
  }
  build(): THREE.BufferGeometry {
    const g = this.parts.length === 1 ? this.parts[0] : mergeGeometries(this.parts, false)!;
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const TR = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')), new THREE.Vector3(1, 1, 1));

function tube(points: [number, number, number][], r: number, segs = 24, radial = 10): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  return new THREE.TubeGeometry(curve, segs, r, radial, false);
}

/** Cylinder between two points. */
function rod(a: [number, number, number], b: [number, number, number], r: number, radial = 8): THREE.BufferGeometry {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Capsule between two points. */
function limb(a: [number, number, number], b: [number, number, number], r: number): THREE.BufferGeometry {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len), 4, 10);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Symmetric airfoil extruded along +X (span), leading edge toward -Z, feathering axis at quarter chord. */
function airfoil(span: number, chord: number, thick: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const n = 14;
  const yt = (x: number) => 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos((i / n) * Math.PI)) / 2;
    pts.push([chord * 0.25 - x * chord, yt(x) * chord]);
  }
  for (let i = n - 1; i >= 1; i--) {
    const x = (1 - Math.cos((i / n) * Math.PI)) / 2;
    pts.push([chord * 0.25 - x * chord, -yt(x) * chord]);
  }
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: span, bevelEnabled: false, steps: 1 });
  g.rotateY(Math.PI / 2);
  return g;
}

/** Flat profile (points in body (z, y)) extruded across X with thickness `t`, centred on x = 0. */
function finPlate(pts: [number, number][], t: number, bevel = 0.012): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(-pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(t - bevel * 2) / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

// ---------------------------------------------------------------------------------- textures
function dataTex(size: number, fn: (u: number, v: number, out: number[]) => void): THREE.DataTexture {
  const d = new Uint8Array(size * size * 4);
  const c = [0, 0, 0, 255];
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      c[3] = 255;
      fn((i + 0.5) / size, (j + 0.5) / size, c);
      d.set(c, (j * size + i) * 4);
    }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.colorSpace = THREE.NoColorSpace;
  t.flipY = false;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Needle-gauge dial: 270° scale, major/minor ticks, green arc, red line. */
function dialTexture(): THREE.DataTexture {
  return dataTex(128, (u, v, c) => {
    const x = u * 2 - 1, y = v * 2 - 1;
    const r = Math.hypot(x, y);
    const a = Math.atan2(x, y); // 0 = up, clockwise positive
    let col = [18, 19, 21];
    if (r > 0.92 && r < 0.98) col = [200, 200, 196];
    const inScale = a >= -2.36 && a <= 2.36;
    if (inScale) {
      const t = (a + 2.356) / 4.712;
      const maj = Math.abs(t * 10 - Math.round(t * 10)) * (4.712 / 10) * r;
      const min = Math.abs(t * 50 - Math.round(t * 50)) * (4.712 / 50) * r;
      if (r > 0.66 && r < 0.88 && maj < 0.03) col = [235, 235, 230];
      else if (r > 0.77 && r < 0.88 && min < 0.012) col = [200, 200, 196];
      if (r > 0.58 && r < 0.64 && t > 0.25 && t < 0.78) col = [40, 170, 60];
      if (r > 0.58 && r < 0.9 && Math.abs(t - 0.86) < 0.012) col = [220, 40, 30];
    }
    if (r < 0.08) col = [60, 60, 62];
    c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
  });
}

/** Compass card: 36 ticks, red north marker. */
function compassTexture(): THREE.DataTexture {
  return dataTex(128, (u, v, c) => {
    const x = u * 2 - 1, y = v * 2 - 1;
    const r = Math.hypot(x, y);
    const a = Math.atan2(x, y);
    const t = (a / (Math.PI * 2) + 1) % 1;
    let col = [16, 17, 19];
    const d36 = Math.abs(t * 36 - Math.round(t * 36)) * (Math.PI * 2 / 36) * r;
    const d4 = Math.abs(t * 4 - Math.round(t * 4)) * (Math.PI / 2) * r;
    if (r > 0.7 && r < 0.9 && d36 < 0.02) col = [210, 210, 205];
    if (r > 0.45 && r < 0.9 && d4 < 0.045) col = [240, 240, 235];
    if (r > 0.4 && r < 0.92 && Math.abs(a) < 0.12 * (0.95 - r) * 3) col = [230, 40, 30];
    if (r > 0.94) col = [150, 150, 150];
    c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
  });
}

/** Attitude indicator ball: sky / ground with a horizon line and pitch ladder. */
function horizonTexture(): THREE.DataTexture {
  return dataTex(64, (u, v, c) => {
    const y = v * 2 - 1, x = u * 2 - 1;
    let col = y > 0 ? [52, 120, 205] : [120, 78, 42];
    if (Math.abs(y) < 0.03) col = [245, 245, 240];
    for (const p of [-0.5, -0.25, 0.25, 0.5]) if (Math.abs(y - p) < 0.018 && Math.abs(x) < 0.25) col = [235, 235, 230];
    c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
  });
}

// ---------------------------------------------------------------------------------- forward shaders
const GLASS_VERT = /* glsl */ `
precision highp float;
in vec3 position;
in vec3 normal;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 u_viewInvRot;
out vec3 v_rel;
out vec3 v_wn;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  v_rel = u_viewInvRot * mv.xyz;
  v_wn = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * mv;
}`;

const LIGHTING = /* glsl */ `
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_sh[9];
uniform float u_skyLightScale;
uniform vec4 u_light;
float skyVis() { return u_light.x * u_light.x * u_skyLightScale; }
vec3 diffuseLight(vec3 N) {
  float sun = smoothstep(0.15, 0.6, u_light.x);
  return shIrradiance(N, u_sh) / PI * skyVis() + u_lightColor * max(dot(N, u_lightDir), 0.0) / PI * sun + blockLightRadiance(u_light.yzw);
}
`;

const GLASS_FRAG = /* glsl */ `
precision highp float;
${GLSL_COMMON}
${LIGHTING}
uniform vec3 u_tint;
uniform float u_opacity;
in vec3 v_rel;
in vec3 v_wn;
out vec4 o;
void main() {
  vec3 V = normalize(-v_rel);
  vec3 N = normalize(v_wn);
  if (dot(N, V) < 0.0) N = -N;
  float NoV = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
  vec3 R = reflect(-V, N);
  vec3 env = shIrradiance(normalize(R + vec3(0.0, 0.08, 0.0)), u_sh) / PI * skyVis();
  env *= mix(0.3, 1.0, smoothstep(-0.25, 0.15, R.y));
  float sun = smoothstep(0.15, 0.6, u_light.x);
  float rl = max(dot(R, u_lightDir), 0.0);
  vec3 spec = u_lightColor * (pow(rl, 1400.0) * 40.0 + pow(rl, 90.0) * 0.6) * sun;
  vec3 blk = blockLightRadiance(u_light.yzw);
  vec3 col = (env + blk * 0.25) * F + spec * (0.3 + F);
  col += (1.0 - F) * u_opacity * u_tint * (env * 0.6 + blk * 0.2);
  float a = clamp(F + (1.0 - F) * u_opacity, 0.0, 1.0);
  o = vec4(col, a);
}`;

const DISC_VERT = /* glsl */ `
precision highp float;
in vec3 position;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 u_viewInvRot;
uniform float u_cone;
out vec2 v_p;
out vec3 v_rel;
out vec3 v_wn;
void main() {
  vec3 p = position;
  p.y += length(p.xz) * u_cone;
  v_p = p.xz;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  v_rel = u_viewInvRot * mv.xyz;
  v_wn = mat3(modelMatrix) * vec3(0.0, 1.0, 0.0);
  gl_Position = projectionMatrix * mv;
}`;

const DISC_FRAG = /* glsl */ `
precision highp float;
${GLSL_COMMON}
${LIGHTING}
uniform float u_spin;
uniform float u_blur;
uniform float u_blades;
uniform float u_radius;
uniform float u_inner;
uniform vec3 u_color;
uniform vec3 u_tipColor;
in vec2 v_p;
in vec3 v_rel;
in vec3 v_wn;
out vec4 o;
void main() {
  float r = length(v_p) / u_radius;
  if (r > 1.0 || r < u_inner) discard;
  float a = atan(v_p.y, v_p.x) + u_spin;
  float d = fract(a * u_blades / 6.2831853);
  float trail = exp(-d * 3.2);
  float dens = mix(0.08, 0.34, trail);
  dens *= smoothstep(1.0, 0.965, r) * smoothstep(u_inner, u_inner + 0.08, r);
  float tip = smoothstep(0.9, 0.925, r);
  vec3 alb = mix(u_color, u_tipColor, tip);
  dens *= 1.0 + tip * 0.35;
  // faint concentric banding from blade twist / root doubler
  dens *= 0.9 + 0.1 * sin(r * 40.0);
  float alpha = clamp(u_blur * dens, 0.0, 1.0);
  if (alpha < 0.002) discard;
  vec3 N = normalize(v_wn);
  if (dot(N, -v_rel) < 0.0) N = -N;
  vec3 col = alb * diffuseLight(N);
  o = vec4(col * alpha, alpha);
}`;

const GLOW_VERT = /* glsl */ `
precision highp float;
in vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float u_size;
out vec2 v_q;
void main() {
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float pull = min(0.25, -mv.z * 0.5);
  mv.xyz += normalize(-mv.xyz) * pull;
  mv.xy += position.xy * u_size;
  v_q = position.xy;
  gl_Position = projectionMatrix * mv;
}`;

const GLOW_FRAG = /* glsl */ `
precision highp float;
uniform vec3 u_color;
uniform float u_intensity;
in vec2 v_q;
out vec4 o;
void main() {
  float d = dot(v_q, v_q);
  if (d > 1.0) discard;
  float g = exp(-d * 7.0) * 0.6 + exp(-d * 60.0) * 3.0;
  o = vec4(u_color * g * u_intensity * (1.0 - d), 0.0);
}`;

function lightingUniforms(renderer: any): Record<string, THREE.IUniform> {
  const lu = renderer?.lightUniforms ?? {};
  return {
    u_viewInvRot: ENTITY_SHARED.u_viewInvRot,
    u_lightDir: lu.u_lightDir ?? { value: new THREE.Vector3(0, 1, 0) },
    u_lightColor: lu.u_lightColor ?? { value: new THREE.Color(1, 1, 1) },
    u_sh: lu.u_sh ?? { value: Array.from({ length: 9 }, () => new THREE.Vector3()) },
    u_skyLightScale: lu.u_skyLightScale ?? { value: 1 },
    u_light: { value: new THREE.Vector4(1, 0, 0, 0) },
  };
}

const PREMUL = { transparent: true, depthWrite: false, depthTest: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } as const;

// ---------------------------------------------------------------------------------- geometry
interface HeliGeometry {
  paint: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  metal: THREE.BufferGeometry;
  interior: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  skids: THREE.BufferGeometry;
  hub: THREE.BufferGeometry;
  blade: THREE.BufferGeometry;
  tailHub: THREE.BufferGeometry;
  tailBlade: THREE.BufferGeometry;
  pilot: THREE.BufferGeometry;
  cyclic: THREE.BufferGeometry;
  collective: THREE.BufferGeometry;
  pedal: THREE.BufferGeometry;
  dials: THREE.BufferGeometry;
  dialDisc: THREE.BufferGeometry;
  needle: THREE.BufferGeometry;
  screen: THREE.BufferGeometry;
  lightSphere: THREE.BufferGeometry;
  beacon: THREE.BufferGeometry;
  landing: THREE.BufferGeometry;
  disc: THREE.BufferGeometry;
  tailDisc: THREE.BufferGeometry;
  quad: THREE.BufferGeometry;
}

/** Instrument layout on the panel face (panel-local x, y; pilot side is +x). */
export const GAUGES = {
  airspeed: [0.2, 0.075],
  attitude: [0.38, 0.075],
  altimeter: [0.56, 0.075],
  rpm: [0.2, -0.065],
  heading: [0.38, -0.065],
  vsi: [0.56, -0.065],
} as const;
const GAUGE_R = 0.056;
/** Panel frame: centre (body frame) and tilt (face normal points up-back toward the crew). */
export const PANEL_POS = new THREE.Vector3(0, 1.2, -1.08);
export const PANEL_TILT = -0.38;

export const LIGHTS = {
  navRed: new THREE.Vector3(-1.045, 1.6, 4.06),
  navGreen: new THREE.Vector3(1.045, 1.6, 4.06),
  strobeTail: new THREE.Vector3(0, 1.63, 6.27),
  strobeFin: new THREE.Vector3(0, 2.77, 6.12),
  beacon: new THREE.Vector3(0, 2.4, 1.38),
  landing: new THREE.Vector3(0, 0.83, -1.93),
};

/** First-person eye of the pilot (body frame) and seat geometry. */
export const PILOT_EYE = new THREE.Vector3(0.4, 1.7, -0.34);

let cached: HeliGeometry | null = null;

function buildGeometry(): HeliGeometry {
  if (cached) return cached;
  const C = HELI_COLORS;
  const paint = new Bucket(), trim = new Bucket(), metal = new Bucket(), interior = new Bucket(), skids = new Bucket();
  // ------------------------------------------------------------ fuselage loft
  const zs: number[] = [];
  const NN = 30;
  for (let i = 0; i <= NN; i++) zs.push(CAB_Z0 - (CAB_Z0 - NOSE_Z) * Math.cos(((i / NN) * Math.PI) / 2));
  zs.reverse(); // tip first
  zs[0] = NOSE_Z;
  for (let i = 1; i <= 22; i++) zs.push(CAB_Z0 + ((CAB_Z1 - CAB_Z0) * i) / 22);
  for (let i = 1; i <= 16; i++) zs.push(CAB_Z1 + ((TR_Z1 - CAB_Z1) * i) / 16);
  for (let i = 1; i <= 14; i++) zs.push(TR_Z1 + ((BOOM_Z1 - TR_Z1) * i) / 14);
  // rounded tail cap
  const capR = boomRadius(BOOM_Z1);
  const capZ: number[] = [];
  for (let k = 1; k <= 4; k++) capZ.push(BOOM_Z1 + capR * Math.sin((k / 4) * (Math.PI / 2)) * 0.6);
  const capScale = new Map<number, number>();
  for (let k = 1; k <= 4; k++) { zs.push(capZ[k - 1]); capScale.set(capZ[k - 1], Math.cos((k / 4) * (Math.PI / 2))); }
  const fus = loftGrid(zs, 80, (z, o) => {
    const sc = capScale.get(z);
    if (sc !== undefined) {
      const r = capR * sc, yc = boomCenterY(BOOM_Z1);
      o.w = r; o.top = yc + r; o.bot = yc - r; o.nTop = 2; o.nBot = 2;
      return o;
    }
    return fuselageSection(z, o);
  });
  const { rings, segs, P, N } = fus;
  // face classification: 0 paint, 1 glass, 2 frame
  const cls = new Uint8Array((rings - 1) * segs);
  const ctr = new THREE.Vector3();
  const faceCenter = (i: number, j: number) => {
    const a = (i * segs + j) * 3, b = (i * segs + ((j + 1) % segs)) * 3, c = ((i + 1) * segs + j) * 3, d = ((i + 1) * segs + ((j + 1) % segs)) * 3;
    return ctr.set((P[a] + P[b] + P[c] + P[d]) / 4, (P[a + 1] + P[b + 1] + P[c + 1] + P[d + 1]) / 4, (P[a + 2] + P[b + 2] + P[c + 2] + P[d + 2]) / 4);
  };
  const isGlass = (x: number, y: number, z: number) => {
    const ax = Math.abs(x);
    if (z < -0.68 && y > 1.24 && ax > 0.035) return true; // wrap-around windscreen with centre post
    if (z < -1.02 && z > -1.98 && y > 0.7 && y < 1.06 && ax > 0.09) return true; // chin windows
    if (ax > 0.45 && y > 1.27 && y < 1.86) {
      if (z > -0.52 && z < -0.08) return true; // front door windows
      if (z > 0.08 && z < 0.8) return true; // rear door windows
    }
    return false;
  };
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < segs; j++) {
      const c = faceCenter(i, j);
      cls[i * segs + j] = isGlass(c.x, c.y, c.z) ? 1 : 0;
    }
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < segs; j++) {
      if (cls[i * segs + j] === 1) continue;
      let near = false;
      for (let di = -1; di <= 1 && !near; di++)
        for (let dj = -1; dj <= 1; dj++) {
          const ii = i + di, jj = (j + dj + segs) % segs;
          if (ii < 0 || ii >= rings - 1) continue;
          if (cls[ii * segs + jj] === 1) { near = true; break; }
        }
      if (near) cls[i * segs + j] = 2;
    }
  const shell = new TriSink(), glassSink = new TriSink(), lining = new TriSink();
  const cRed = lin(C.red), cWhite = lin(C.white), cStripe = lin(C.stripe), cFrame = lin(C.frame), cLining = lin(C.lining), cHead = lin(C.headliner);
  const belt = (z: number) => (z < 1.0 ? 1.2 : z < 2.4 ? lerp(1.2, boomCenterY(z), sstep(1.0, 2.4, z)) : boomCenterY(z));
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < segs; j++) {
      const c = faceCenter(i, j);
      const k = cls[i * segs + j];
      const a = i * segs + j, b = i * segs + ((j + 1) % segs), cc = (i + 1) * segs + j, d = (i + 1) * segs + ((j + 1) % segs);
      if (k === 1) {
        glassSink.tri(P, N, a, b, cc, cRed);
        glassSink.tri(P, N, b, d, cc, cRed);
        continue;
      }
      let col: THREE.Color;
      if (k === 2) col = cFrame;
      else {
        const by = belt(c.z);
        col = c.y > by + 0.035 ? cRed : c.y > by - 0.035 ? cStripe : cWhite;
      }
      shell.tri(P, N, a, b, cc, col);
      shell.tri(P, N, b, d, cc, col);
      // inner lining of the cabin (seen through the glass and from the cockpit)
      if (c.z < 0.98 && c.z > NOSE_Z + 0.06) {
        const lc = k === 2 ? cFrame : c.y > 1.78 ? cHead : cLining;
        lining.tri(P, N, a, b, cc, lc, true, -0.03);
        lining.tri(P, N, b, d, cc, lc, true, -0.03);
      }
    }
  paint.raw(shell.geometry());
  interior.raw(lining.geometry());
  const glass = glassSink.geometry();
  glass.deleteAttribute('color');
  glass.computeBoundingSphere();
  // door seams (thin dark strips on the cabin sides) and handles
  const sec: Sec = { w: 0, top: 0, bot: 0, nTop: 2, nBot: 2 };
  const v = new THREE.Vector3();
  const thetaAtY = (s: Sec, y: number, right: boolean) => {
    let lo = right ? -Math.PI / 2 : Math.PI / 2, hi = right ? Math.PI / 2 : (3 * Math.PI) / 2;
    for (let it = 0; it < 30; it++) {
      const m = (lo + hi) / 2;
      ringPoint(s, m, v, 0);
      if ((v.y < y) === right) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  };
  const seamStrip = (z0: number, z1: number, y0: number, y1: number, side: number) => {
    // vertical seam at z0 (=z1) from y0..y1, or horizontal seam at y0 (=y1) from z0..z1
    const pts: THREE.Vector3[] = [];
    const nrm: THREE.Vector3[] = [];
    const steps = 12;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const z = lerp(z0, z1, t), y = lerp(y0, y1, t);
      fuselageSection(z, sec);
      const th = thetaAtY(sec, y, side > 0);
      ringPoint(sec, th, v, z);
      const p = v.clone();
      ringPoint(sec, th + 0.01, v, z);
      const tA = v.clone().sub(p);
      const n = new THREE.Vector3(tA.y, -tA.x, 0).normalize().multiplyScalar(side > 0 ? -1 : 1);
      if (n.x * side < 0) n.negate();
      pts.push(p.addScaledVector(n, 0.004));
      nrm.push(n);
    }
    const pos: number[] = [], nr: number[] = [];
    const w = 0.007;
    for (let s = 0; s < steps; s++) {
      const p0 = pts[s], p1 = pts[s + 1];
      const dir = p1.clone().sub(p0).normalize();
      const off = new THREE.Vector3().crossVectors(nrm[s], dir).normalize().multiplyScalar(w);
      const q = [p0.clone().add(off), p0.clone().sub(off), p1.clone().add(off), p1.clone().sub(off)];
      const tri = (A: THREE.Vector3, B: THREE.Vector3, Cc: THREE.Vector3) => {
        const fn = new THREE.Vector3().crossVectors(B.clone().sub(A), Cc.clone().sub(A));
        const flip = fn.dot(nrm[s]) < 0;
        for (const X of flip ? [A, Cc, B] : [A, B, Cc]) { pos.push(X.x, X.y, X.z); nr.push(nrm[s].x, nrm[s].y, nrm[s].z); }
      };
      tri(q[0], q[1], q[2]);
      tri(q[1], q[3], q[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nr, 3));
    trim.add(g, 0x0c0d0f);
  };
  for (const side of [-1, 1]) {
    // front door: -0.62 .. -0.02, rear door: 0.02 .. 0.88
    for (const [z0, z1] of [[-0.6, -0.02], [0.02, 0.88]]) {
      seamStrip(z0, z0, 0.7, 1.9, side);
      seamStrip(z1, z1, 0.7, 1.9, side);
      seamStrip(z0, z1, 0.7, 0.7, side);
      seamStrip(z0, z1, 1.9, 1.9, side);
      // handle
      trim.add(new RoundedBoxGeometry(0.03, 0.035, 0.14, 2, 0.012), 0x2a2b2e, T(side * 0.805, 1.13, z1 - 0.12));
    }
    // step on the skid cross tube and hinges
    for (const z of [-0.5, -0.1, 0.15, 0.75]) trim.add(new RoundedBoxGeometry(0.03, 0.06, 0.04, 1, 0.01), 0x2a2b2e, T(side * 0.8, 1.55, z));
  }
  // ------------------------------------------------------------ engine cowling, mast, exhausts
  const czs: number[] = [];
  for (let i = 0; i <= 10; i++) czs.push(-0.12 - 0.38 * Math.cos(((i / 10) * Math.PI) / 2));
  czs.reverse();
  for (let i = 1; i <= 16; i++) czs.push(-0.12 + (1.62 * i) / 16);
  for (let i = 1; i <= 8; i++) czs.push(1.5 + 0.55 * Math.sin(((i / 8) * Math.PI) / 2));
  const cowl = loftGrid(czs, 48, cowlSection);
  {
    const sink = new TriSink();
    const cG = lin(C.grille), cDark = lin(0x3a2f2a);
    for (let i = 0; i < cowl.rings - 1; i++)
      for (let j = 0; j < cowl.segs; j++) {
        const a = i * cowl.segs + j, b = i * cowl.segs + ((j + 1) % cowl.segs), c = (i + 1) * cowl.segs + j, d = (i + 1) * cowl.segs + ((j + 1) % cowl.segs);
        const k3 = a * 3;
        const x = cowl.P[k3], y = cowl.P[k3 + 1], z = cowl.P[k3 + 2];
        let col = cRed;
        if (Math.abs(x) > 0.3 && y > 2.04 && y < 2.27 && z > 0.55 && z < 1.2) col = cG; // intake grilles
        else if (z > 1.62 && y > 2.08) col = cDark; // heat-stained exhaust deck
        else if (y < 1.95) col = cWhite;
        sink.tri(cowl.P, cowl.N, a, b, c, col);
        sink.tri(cowl.P, cowl.N, b, d, c, col);
      }
    paint.raw(sink.geometry());
  }
  // grille louvres
  for (const side of [-1, 1]) for (let k = 0; k < 5; k++) trim.add(new THREE.BoxGeometry(0.02, 0.015, 0.6), 0x2c2e31, T(side * 0.445, 2.07 + k * 0.045, 0.875));
  // mast, swashplate (static parts)
  metal.add(new THREE.CylinderGeometry(0.075, 0.085, 0.5, 14), C.darkMetal, T(0, 2.53, 0));
  metal.add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), C.darkMetal, T(0, 2.46, 0));
  metal.add(new THREE.CylinderGeometry(0.12, 0.18, 0.08, 16), C.darkMetal, T(0, 2.4, 0));
  // exhaust stacks
  for (const side of [-1, 1]) {
    metal.add(tube([[side * 0.15, 2.16, 1.5], [side * 0.19, 2.32, 1.7], [side * 0.24, 2.43, 1.9]], 0.068, 16, 12), C.exhaust);
    metal.add(new THREE.CircleGeometry(0.06, 12), 0x0a0a0a, TR(side * 0.235, 2.425, 1.885, -0.75, 0, 0));
    metal.add(new THREE.TorusGeometry(0.068, 0.012, 6, 14), 0x5a514a, TR(side * 0.24, 2.43, 1.9, -0.75 - Math.PI / 2, 0, 0));
  }
  // rotor drive-shaft cover along the top of the boom, tail gearbox
  {
    const pts: [number, number, number][] = [];
    for (let k = 0; k <= 8; k++) {
      const z = 2.05 + (3.65 * k) / 8;
      pts.push([0, boomCenterY(z) + boomRadius(z) + 0.035, z]);
    }
    paint.add(tube(pts, 0.055, 24, 10), C.red);
    metal.add(new THREE.SphereGeometry(0.11, 12, 10), C.darkMetal, T(0, boomCenterY(5.95) + 0.17, 5.95));
    metal.add(new THREE.CylinderGeometry(0.06, 0.07, 0.24, 12), C.darkMetal, TR(-0.14, HELI.tailHub.y, HELI.tailHub.z, 0, 0, Math.PI / 2));
  }
  // horizontal stabiliser + endplates (nav lights sit at their leading edges)
  {
    const y = boomCenterY(4.15);
    const st = airfoil(2.06, 0.4, 0.13);
    st.translate(-1.03, y, 4.12);
    paint.add(st, C.red);
    for (const side of [-1, 1]) {
      const ep = finPlate([[3.98, y - 0.14], [4.06, y + 0.3], [4.3, y + 0.3], [4.36, y - 0.14]], 0.035, 0.008);
      paint.add(ep, C.white, T(side * 1.035, 0, 0));
    }
  }
  // vertical fin (upper + lower) with a tail skid guard
  {
    const up = finPlate([[5.45, 1.72], [5.9, 2.74], [6.22, 2.76], [6.25, 1.72]], 0.075, 0.015);
    paint.add(up, C.red);
    const tipCap = finPlate([[5.83, 2.6], [5.9, 2.74], [6.22, 2.76], [6.235, 2.6]], 0.085, 0.015);
    paint.add(tipCap, C.white);
    const lo = finPlate([[5.62, 1.5], [5.95, 1.0], [6.15, 1.0], [6.22, 1.5]], 0.065, 0.012);
    paint.add(lo, C.white);
    metal.add(tube([[0, 1.06, 5.7], [0, 0.93, 5.95], [0, 0.98, 6.2]], 0.02, 10, 6), C.metal);
  }
  // antennae
  metal.add(rod([0, 1.0, 3.2], [0, 0.72, 3.45], 0.008), C.darkMetal);
  metal.add(rod([0.25, 1.97, -0.4], [0.27, 2.25, -0.3], 0.006), C.darkMetal);
  // ------------------------------------------------------------ skids
  for (const side of [-1, 1]) {
    const x = side * 0.95;
    skids.add(tube([[x, 0.42, -1.95], [x, 0.24, -1.8], [x, 0.09, -1.55], [x, 0.045, -1.25], [x, 0.045, 0.4], [x, 0.045, 1.3], [x, 0.07, 1.45]], 0.045, 48, 10), C.metal);
    skids.add(new THREE.SphereGeometry(0.045, 10, 8), C.metal, T(x, 0.42, -1.95));
    skids.add(new THREE.SphereGeometry(0.045, 10, 8), C.metal, T(x, 0.07, 1.45));
    // skid shoes and a boarding step
    for (const z of [-0.85, 0.72]) skids.add(new RoundedBoxGeometry(0.1, 0.03, 0.22, 1, 0.01), C.darkMetal, T(x, 0.005, z));
    skids.add(new RoundedBoxGeometry(0.22, 0.025, 0.3, 1, 0.01), C.darkMetal, T(side * 0.86, 0.33, -0.4));
  }
  for (const z of [-0.85, 0.72]) {
    skids.add(tube([[-0.95, 0.045, z], [-0.93, 0.3, z], [-0.8, 0.5, z], [-0.55, 0.62, z], [0.55, 0.62, z], [0.8, 0.5, z], [0.93, 0.3, z], [0.95, 0.045, z]], 0.05, 40, 10), C.metal);
    for (const side of [-1, 1]) skids.add(new RoundedBoxGeometry(0.16, 0.06, 0.16, 1, 0.02), C.darkMetal, T(side * 0.5, 0.63, z));
  }
  // ------------------------------------------------------------ interior
  interior.add(new THREE.BoxGeometry(1.3, 0.04, 2.25), C.carpet, T(0, 0.64, -0.2));
  for (const x of [-0.4, 0.4]) {
    interior.add(new RoundedBoxGeometry(0.46, 0.12, 0.46, 2, 0.04), C.leather, T(x, 0.88, -0.38));
    interior.add(new RoundedBoxGeometry(0.46, 0.64, 0.11, 2, 0.04), C.leather, TR(x, 1.24, -0.11, -0.12, 0, 0));
    interior.add(new RoundedBoxGeometry(0.3, 0.2, 0.09, 2, 0.03), C.leather, TR(x, 1.65, -0.06, -0.12, 0, 0));
    interior.add(new THREE.BoxGeometry(0.4, 0.2, 0.36), C.panel, T(x, 0.74, -0.38));
    // seat belts
    interior.add(new THREE.BoxGeometry(0.05, 0.5, 0.012), 0x2a3b4d, TR(x - 0.12, 1.25, -0.175, -0.12, 0, 0));
    interior.add(new THREE.BoxGeometry(0.05, 0.5, 0.012), 0x2a3b4d, TR(x + 0.12, 1.25, -0.175, -0.12, 0, 0));
  }
  interior.add(new RoundedBoxGeometry(1.3, 0.12, 0.44, 2, 0.04), C.leather, T(0, 0.88, 0.58));
  interior.add(new RoundedBoxGeometry(1.3, 0.62, 0.11, 2, 0.04), C.leather, TR(0, 1.24, 0.84, -0.1, 0, 0));
  interior.add(new THREE.BoxGeometry(1.3, 0.2, 0.4), C.panel, T(0, 0.74, 0.58));
  {
    // rear bulkhead shaped like the cabin section
    fuselageSection(0.96, sec);
    const shp = new THREE.Shape();
    for (let k = 0; k <= 48; k++) {
      ringPoint(sec, (k / 48) * Math.PI * 2, v, 0);
      if (k === 0) shp.moveTo(v.x * 0.97, (v.y - 1.28) * 0.97 + 1.28);
      else shp.lineTo(v.x * 0.97, (v.y - 1.28) * 0.97 + 1.28);
    }
    const bh = new THREE.ShapeGeometry(shp, 2);
    bh.rotateY(Math.PI);
    interior.add(bh, C.lining, T(0, 0, 0.95));
  }
  // instrument panel, glareshield, console
  const panelM = new THREE.Matrix4().compose(PANEL_POS, new THREE.Quaternion().setFromEuler(new THREE.Euler(PANEL_TILT, 0, 0)), new THREE.Vector3(1, 1, 1));
  interior.add(new RoundedBoxGeometry(1.24, 0.32, 0.1, 2, 0.02), C.panel, panelM.clone().multiply(T(0, 0, -0.05)));
  interior.add(new RoundedBoxGeometry(1.3, 0.035, 0.34, 2, 0.012), 0x111214, T(0, 1.37, -1.02));
  interior.add(new RoundedBoxGeometry(0.26, 0.42, 0.42, 2, 0.03), C.panel, T(0, 0.86, -0.92));
  // radio stack faces (slightly lighter bezels)
  for (let k = 0; k < 3; k++) interior.add(new THREE.BoxGeometry(0.2, 0.06, 0.01), 0x2e3135, TR(0, 0.98 - k * 0.09, -0.705, -0.15, 0, 0));
  // gauge bezels
  for (const [gx, gy] of Object.values(GAUGES)) interior.add(new THREE.TorusGeometry(GAUGE_R + 0.004, 0.006, 6, 24), 0x3a3c40, panelM.clone().multiply(T(gx, gy, 0.004)));
  // copilot side: blank panel with a few switches
  for (let k = 0; k < 6; k++) interior.add(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6), 0x9a9a9a, panelM.clone().multiply(TR(-0.5 + k * 0.05, -0.09, 0.015, Math.PI / 2, 0, 0)));
  // overhead console and door pockets
  interior.add(new RoundedBoxGeometry(0.3, 0.05, 0.4, 2, 0.02), C.panel, T(0, 1.93, -0.55));
  // ------------------------------------------------------------ dials, screens
  const dials = new Bucket();
  for (const key of ['airspeed', 'altimeter', 'rpm', 'vsi'] as const) {
    const [gx, gy] = GAUGES[key];
    dials.add(new THREE.CircleGeometry(GAUGE_R, 24), 0xffffff, panelM.clone().multiply(T(gx, gy, 0.002)));
  }
  const screen = new Bucket().add(new THREE.PlaneGeometry(0.17, 0.12), 0xffffff, panelM.clone().multiply(T(-0.02, 0.01, 0.003))).build();
  // ------------------------------------------------------------ main rotor hub (spinning) + blade
  const hub = new Bucket();
  hub.add(new THREE.CylinderGeometry(0.24, 0.24, 0.09, 24), C.darkMetal);
  hub.add(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.metal, T(0, 0.04, 0));
  hub.add(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 20), C.darkMetal, T(0, -0.21, 0));
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const m = new THREE.Matrix4().makeRotationY(a);
    hub.add(new RoundedBoxGeometry(0.42, 0.1, 0.15, 2, 0.025), C.metal, m.clone().multiply(T(0.38, 0, 0)));
    hub.add(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8), C.darkMetal, m.clone().multiply(TR(0.3, 0, 0.12, 0, 0, Math.PI / 2)));
    // pitch link from the rotating swashplate up to the grip horn
    hub.add(rod([0.16, -0.2, 0.1], [0.24, -0.02, 0.12], 0.012), C.metal, m);
  }
  const bladeB = new Bucket();
  const bl = airfoil(HELI.rotorRadius - 0.5 - 0.16, 0.27, 0.12);
  bl.translate(0.5, 0, 0);
  bladeB.add(bl, C.blade);
  const tip = airfoil(0.16, 0.27, 0.12);
  tip.translate(HELI.rotorRadius - 0.16, 0, 0);
  bladeB.add(tip, C.bladeTip);
  bladeB.add(new RoundedBoxGeometry(0.35, 0.05, 0.29, 2, 0.015), C.darkMetal, T(0.62, 0, 0.0));
  // ------------------------------------------------------------ tail rotor
  const tailHub = new Bucket();
  tailHub.add(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 12), C.darkMetal, TR(0, 0, 0, 0, 0, Math.PI / 2));
  tailHub.add(new THREE.SphereGeometry(0.05, 10, 8), C.metal, T(-0.05, 0, 0));
  const tbl = new Bucket();
  for (const s of [1, -1]) {
    const b = airfoil(HELI.tailRadius - 0.08, 0.11, 0.12);
    b.translate(0.08, 0, 0);
    const tipG = airfoil(0.07, 0.11, 0.12);
    tipG.translate(HELI.tailRadius - 0.07, 0, 0);
    const m = new THREE.Matrix4().makeRotationX(s > 0 ? 0 : Math.PI).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    tbl.add(b, 0xd8d8d4, m);
    tbl.add(tipG, 0xc0201a, m);
  }
  // ------------------------------------------------------------ controls
  const cyclic = new Bucket()
    .add(new THREE.CylinderGeometry(0.014, 0.018, 0.42, 8), 0x1d1e20, T(0, 0.21, 0))
    .add(new THREE.CapsuleGeometry(0.024, 0.08, 4, 10), 0x111111, TR(0, 0.45, 0.01, 0.25, 0, 0))
    .add(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 12), 0x111111, T(0, 0.02, 0))
    .build();
  const collective = new Bucket()
    .add(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 8), 0x1d1e20, TR(0, 0, -0.25, Math.PI / 2, 0, 0))
    .add(new THREE.CylinderGeometry(0.026, 0.026, 0.13, 10), 0x111111, TR(0, 0, -0.5, Math.PI / 2, 0, 0))
    .build();
  const pedal = new Bucket().add(new RoundedBoxGeometry(0.08, 0.14, 0.03, 1, 0.01), 0x2a2b2e).build();
  // ------------------------------------------------------------ pilot
  const pilot = new Bucket();
  {
    const x = 0.4;
    pilot.add(new THREE.CapsuleGeometry(0.16, 0.3, 4, 12), C.suit, TR(x, 1.24, -0.3, -0.12, 0, 0));
    pilot.add(new THREE.SphereGeometry(0.1, 14, 10), 0xc69c7b, T(x, 1.6, -0.33));
    pilot.add(new THREE.SphereGeometry(0.128, 16, 12), C.helmet, T(x, 1.645, -0.31));
    pilot.add(new THREE.SphereGeometry(0.134, 16, 10, -Math.PI * 0.82, Math.PI * 0.64, Math.PI * 0.4, Math.PI * 0.24), C.visor, T(x, 1.63, -0.32));
    pilot.add(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10), C.suit, T(x, 1.47, -0.32));
    for (const s of [-1, 1]) {
      const hx = x + s * 0.1;
      pilot.add(limb([hx, 0.99, -0.3], [hx, 1.03, -0.74], 0.07), C.suit);
      pilot.add(limb([hx, 1.0, -0.76], [hx * 1 + s * 0.02, 0.73, -1.06], 0.055), C.suit);
      pilot.add(new RoundedBoxGeometry(0.1, 0.09, 0.22, 2, 0.03), C.boot, T(hx + s * 0.02, 0.7, -1.13));
    }
    // right arm to the cyclic, left arm to the collective
    pilot.add(limb([x + 0.19, 1.42, -0.28], [x + 0.17, 1.12, -0.42], 0.05), C.suit);
    pilot.add(limb([x + 0.17, 1.12, -0.42], [x + 0.01, 1.11, -0.74], 0.042), C.suit);
    pilot.add(new THREE.SphereGeometry(0.045, 10, 8), C.glove, T(x, 1.11, -0.77));
    pilot.add(limb([x - 0.19, 1.42, -0.28], [x - 0.24, 1.08, -0.38], 0.05), C.suit);
    pilot.add(limb([x - 0.24, 1.08, -0.38], [x - 0.27, 0.86, -0.66], 0.042), C.suit);
    pilot.add(new THREE.SphereGeometry(0.045, 10, 8), C.glove, T(x - 0.28, 0.85, -0.7));
  }
  // ------------------------------------------------------------ lights, forward discs
  const lightSphere = new THREE.SphereGeometry(0.045, 12, 8);
  const beacon = new THREE.SphereGeometry(0.065, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const landing = new THREE.CircleGeometry(0.07, 16);
  const disc = new THREE.RingGeometry(0.5, HELI.rotorRadius + 0.02, 72, 2).rotateX(-Math.PI / 2);
  const tailDisc = new THREE.RingGeometry(0.06, HELI.tailRadius + 0.01, 32, 1).rotateX(-Math.PI / 2);
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const needle = new Bucket().add(new THREE.BoxGeometry(0.005, 0.05, 0.003), 0xf2f2ee, T(0, 0.02, 0.006)).add(new THREE.CircleGeometry(0.009, 10), 0x202020, T(0, 0, 0.0075)).build();
  const dialDisc = new Bucket().add(new THREE.CircleGeometry(GAUGE_R - 0.004, 24), 0xffffff).build();
  cached = {
    paint: paint.build(), trim: trim.build(), metal: metal.build(), interior: interior.build(), glass,
    skids: skids.build(), hub: hub.build(), blade: bladeB.build(), tailHub: tailHub.build(), tailBlade: tbl.build(),
    pilot: pilot.build(), cyclic, collective, pedal, dials: dials.build(), dialDisc, needle, screen,
    lightSphere, beacon, landing, disc, tailDisc, quad,
  };
  return cached;
}

let textures: { dial: THREE.DataTexture; compass: THREE.DataTexture; horizon: THREE.DataTexture } | null = null;
function getTextures() {
  return (textures ??= { dial: dialTexture(), compass: compassTexture(), horizon: horizonTexture() });
}

// ---------------------------------------------------------------------------------- visual
export interface HeliVisualState {
  /** Interpolated centre of mass (world) and attitude. */
  com: THREE.Vector3;
  quat: THREE.Quaternion;
  dt: number;
  time: number;
  rpm: number;
  n1: number;
  collective: number;
  stickX: number;
  stickY: number;
  /** Rotor disc tilt relative to the mast (rad). */
  discX: number;
  discZ: number;
  pedal: number;
  /** Thrust / weight. */
  load: number;
  compression: readonly number[];
  /** World velocity (m/s). */
  vel: THREE.Vector3;
  powered: boolean;
  piloted: boolean;
  showPilot: boolean;
  /** Packed world light at the helicopter. */
  light: number;
  hurt: number;
  /** Instrument readings. */
  altitude: number;
  airspeed: number;
  vspeed: number;
  heading: number;
  roll: number;
  /** Camera distance (LOD / culling). */
  camDist: number;
}

type Mat = THREE.RawShaderMaterial;

export class HeliVisual {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly forward = new THREE.Group();
  private readonly mats: Mat[] = [];
  private readonly matPaint: Mat;
  private readonly matBlade: Mat;
  private readonly matTailBlade: Mat;
  private readonly matDial: Mat;
  private readonly matCompass: Mat;
  private readonly matHorizon: Mat;
  private readonly matNeedle: Mat;
  private readonly matScreen: Mat;
  private readonly lightMats: Record<keyof typeof LIGHTS, Mat>;
  private readonly glows: { mesh: THREE.Mesh; mat: Mat; anchor: THREE.Object3D; key: keyof typeof LIGHTS }[] = [];
  private readonly glassMat: Mat;
  private readonly discMat: Mat;
  private readonly tailDiscMat: Mat;
  private readonly fwdMeshes: { mesh: THREE.Object3D; anchor: THREE.Object3D }[] = [];
  private readonly skids = new THREE.Group();
  private readonly rotorTilt = new THREE.Group();
  private readonly rotorSpin = new THREE.Group();
  private readonly flaps: THREE.Group[] = [];
  private readonly feathers: THREE.Group[] = [];
  private readonly tailSpin = new THREE.Group();
  private readonly tailBlades: THREE.Mesh;
  private readonly cyclic: THREE.Object3D;
  private readonly collective: THREE.Object3D;
  private readonly pedals: THREE.Object3D[] = [];
  private readonly needles: Record<'airspeed' | 'altimeter' | 'rpm' | 'rpm2' | 'vsi', THREE.Object3D>;
  private readonly compassCard: THREE.Object3D;
  private readonly horizonBall: THREE.Object3D;
  private readonly pilot: THREE.Mesh;
  private rotorAngle = Math.random() * 6;
  private tailAngle = 0;
  private lightVec = new THREE.Vector4();

  constructor(renderer: any) {
    const G = buildGeometry();
    const tex = getTextures();
    const mk = (o: Parameters<typeof createEntityMaterial>[0]) => {
      const m = createEntityMaterial(o);
      this.mats.push(m);
      return m;
    };
    this.matPaint = mk({ vertexColors: true, roughness: 0.2, metalness: 0.05 });
    const matTrim = mk({ vertexColors: true, roughness: 0.55, metalness: 0.1 });
    const matMetal = mk({ vertexColors: true, roughness: 0.32, metalness: 0.85 });
    const matInterior = mk({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide });
    this.matBlade = mk({ vertexColors: true, roughness: 0.42, metalness: 0.1 });
    this.matTailBlade = mk({ vertexColors: true, roughness: 0.4, metalness: 0.1 });
    const matPilot = mk({ vertexColors: true, roughness: 0.65 });
    this.matDial = mk({ map: tex.dial, roughness: 0.25 });
    this.matCompass = mk({ map: tex.compass, roughness: 0.25 });
    this.matHorizon = mk({ map: tex.horizon, roughness: 0.25 });
    this.matNeedle = mk({ vertexColors: true, roughness: 0.4 });
    this.matScreen = mk({ color: 0x0a2a2e, roughness: 0.15 });
    const lm = (c: number) => mk({ color: c, roughness: 0.2 });
    this.lightMats = {
      navRed: lm(0xff2010), navGreen: lm(0x20ff50), strobeTail: lm(0xffffff), strobeFin: lm(0xffffff), beacon: lm(0xff1a0a), landing: lm(0xfff2d8),
    };
    const mesh = (g: THREE.BufferGeometry, m: Mat, parent: THREE.Object3D, name: string) => {
      const o = new THREE.Mesh(g, m);
      o.name = name;
      parent.add(o);
      return o;
    };
    this.root.add(this.body);
    this.body.position.copy(HELI.com).negate();
    mesh(G.paint, this.matPaint, this.body, 'paint');
    mesh(G.trim, matTrim, this.body, 'trim');
    mesh(G.metal, matMetal, this.body, 'metal');
    mesh(G.interior, matInterior, this.body, 'interior');
    this.body.add(this.skids);
    mesh(G.skids, matMetal, this.skids, 'skids');
    // main rotor: hub → tilt (tip-path plane) → spin → per-blade azimuth → flap → feather → blade
    this.rotorTilt.position.copy(HELI.hub);
    this.body.add(this.rotorTilt);
    this.rotorTilt.add(this.rotorSpin);
    mesh(G.hub, matMetal, this.rotorSpin, 'hub');
    for (let k = 0; k < 4; k++) {
      const az = new THREE.Group();
      az.rotation.y = (k * Math.PI) / 2;
      const flap = new THREE.Group();
      flap.position.x = 0.32;
      const fe = new THREE.Group();
      fe.position.x = -0.32;
      flap.add(fe);
      az.add(flap);
      this.rotorSpin.add(az);
      mesh(G.blade, this.matBlade, fe, 'blade' + k);
      this.flaps.push(flap);
      this.feathers.push(fe);
    }
    // tail rotor
    const tailRoot = new THREE.Group();
    tailRoot.position.copy(HELI.tailHub);
    this.body.add(tailRoot);
    tailRoot.add(this.tailSpin);
    mesh(G.tailHub, matMetal, this.tailSpin, 'tailHub');
    this.tailBlades = mesh(G.tailBlade, this.matTailBlade, this.tailSpin, 'tailBlades');
    // controls
    this.cyclic = mesh(G.cyclic, matTrim, this.body, 'cyclic');
    this.cyclic.position.set(0.4, 0.66, -0.78);
    this.collective = mesh(G.collective, matTrim, this.body, 'collective');
    this.collective.position.set(0.12, 0.76, -0.24);
    for (const s of [-1, 1]) {
      const p = mesh(G.pedal, matTrim, this.body, 'pedal');
      p.position.set(0.4 + s * 0.12, 0.74, -1.22);
      p.rotation.x = -0.6;
      this.pedals.push(p);
    }
    // instruments
    const panel = new THREE.Group();
    panel.position.copy(PANEL_POS);
    panel.rotation.x = PANEL_TILT;
    this.body.add(panel);
    const dials = mesh(G.dials, this.matDial, this.body, 'dials');
    void dials;
    mesh(G.screen, this.matScreen, this.body, 'screen');
    const gaugeNode = (key: keyof typeof GAUGES) => {
      const n = new THREE.Group();
      n.position.set(GAUGES[key][0], GAUGES[key][1], 0);
      panel.add(n);
      return n;
    };
    const needle = (key: keyof typeof GAUGES, dx = 0) => {
      const n = mesh(G.needle, this.matNeedle, gaugeNode(key), 'needle:' + key);
      n.position.x = dx;
      return n;
    };
    this.needles = { airspeed: needle('airspeed'), altimeter: needle('altimeter'), rpm: needle('rpm', -0.008), rpm2: needle('rpm', 0.008), vsi: needle('vsi') };
    this.compassCard = mesh(G.dialDisc, this.matCompass, gaugeNode('heading'), 'compass');
    this.compassCard.position.z = 0.003;
    this.horizonBall = mesh(G.dialDisc, this.matHorizon, gaugeNode('attitude'), 'horizon');
    this.horizonBall.position.z = 0.003;
    const fixed = mesh(G.needle, this.matNeedle, gaugeNode('attitude'), 'aircraftSymbol');
    fixed.rotation.z = Math.PI / 2;
    fixed.position.set(0.024, 0, 0.004);
    // pilot
    this.pilot = mesh(G.pilot, matPilot, this.body, 'pilot');
    // lights
    const anchors = {} as Record<keyof typeof LIGHTS, THREE.Object3D>;
    for (const key of Object.keys(LIGHTS) as (keyof typeof LIGHTS)[]) {
      const geo = key === 'beacon' ? G.beacon : key === 'landing' ? G.landing : G.lightSphere;
      const m = mesh(geo, this.lightMats[key], this.body, 'light:' + key);
      m.position.copy(LIGHTS[key]);
      if (key === 'landing') m.rotation.x = 0.35;
      anchors[key] = m;
    }
    // ---- forward pass: glass, rotor discs, light halos
    const lu = lightingUniforms(renderer);
    this.glassMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, side: THREE.DoubleSide, ...PREMUL,
      uniforms: { ...lu, u_light: { value: new THREE.Vector4(1, 0, 0, 0) }, u_tint: { value: new THREE.Color(0.55, 0.62, 0.6) }, u_opacity: { value: 0.16 } },
    });
    const discUniforms = (radius: number, inner: number, blades: number) => ({
      ...lu, u_light: { value: new THREE.Vector4(1, 0, 0, 0) },
      u_spin: { value: 0 }, u_blur: { value: 0 }, u_blades: { value: blades }, u_radius: { value: radius }, u_inner: { value: inner },
      u_cone: { value: 0 }, u_color: { value: lin(HELI_COLORS.blade) }, u_tipColor: { value: lin(blades > 2 ? HELI_COLORS.bladeTip : 0xc0201a) },
    });
    this.discMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: DISC_VERT, fragmentShader: DISC_FRAG, side: THREE.DoubleSide, ...PREMUL, uniforms: discUniforms(HELI.rotorRadius, 0.5 / HELI.rotorRadius, 4) });
    this.tailDiscMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: DISC_VERT, fragmentShader: DISC_FRAG, side: THREE.DoubleSide, ...PREMUL, uniforms: discUniforms(HELI.tailRadius, 0.1, 2) });
    (this.tailDiscMat.uniforms.u_color.value as THREE.Color).copy(lin(0xd0d0cc));
    const fwd = (g: THREE.BufferGeometry, m: Mat, anchor: THREE.Object3D, order: number) => {
      const o = new THREE.Mesh(g, m);
      o.matrixAutoUpdate = false;
      o.frustumCulled = false;
      o.renderOrder = order;
      this.forward.add(o);
      this.fwdMeshes.push({ mesh: o, anchor });
      return o;
    };
    fwd(G.glass, this.glassMat, this.body, 5);
    fwd(G.disc, this.discMat, this.rotorTilt, 6);
    const tailAnchor = new THREE.Object3D();
    tailAnchor.rotation.z = Math.PI / 2;
    tailRoot.add(tailAnchor);
    fwd(G.tailDisc, this.tailDiscMat, tailAnchor, 6);
    const glowCol: Record<keyof typeof LIGHTS, number> = { navRed: 0xff2a10, navGreen: 0x30ff60, strobeTail: 0xffffff, strobeFin: 0xffffff, beacon: 0xff2010, landing: 0xfff0d0 };
    for (const key of Object.keys(LIGHTS) as (keyof typeof LIGHTS)[]) {
      const m = new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
        transparent: true, depthWrite: false, depthTest: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
        uniforms: { u_size: { value: 0.5 }, u_color: { value: lin(glowCol[key]) }, u_intensity: { value: 0 } },
      });
      const o = fwd(G.quad, m, anchors[key], 7);
      this.glows.push({ mesh: o as THREE.Mesh, mat: m, anchor: anchors[key], key });
    }
    this.root.name = 'helicopter';
  }

  /** Per-frame pose + animation. */
  update(s: HeliVisualState) {
    const visible = s.camDist < 320;
    this.root.visible = visible;
    this.forward.visible = visible;
    if (!visible) return;
    this.root.position.copy(s.com);
    this.root.quaternion.copy(s.quat);
    // hurt wobble (Minecraft boat style)
    this.body.rotation.set(0, 0, Math.sin(s.time * 31) * s.hurt * 0.05);
    // lighting / hurt flash
    const L = s.light;
    for (const m of this.mats) {
      setEntityLight(m, L);
      m.uniforms.u_hurt.value = s.hurt * 0.35;
    }
    const lv = this.lightVec.set(((L >>> 12) & 15) / 15, ((L >>> 8) & 15) / 15, ((L >>> 4) & 15) / 15, (L & 15) / 15);
    for (const m of [this.glassMat, this.discMat, this.tailDiscMat]) (m.uniforms.u_light.value as THREE.Vector4).copy(lv);
    // ---- main rotor
    const rpm = s.rpm;
    this.rotorAngle = (this.rotorAngle + rpm * 4.5 * Math.PI * 2 * s.dt) % (Math.PI * 2);
    this.tailAngle = (this.tailAngle + rpm * 24 * Math.PI * 2 * s.dt) % (Math.PI * 2);
    this.rotorSpin.rotation.y = this.rotorAngle;
    const vF = -this._v.copy(s.vel).applyQuaternion(this.invQuat(s.quat)).z; // forward airspeed (body)
    // tip-path plane: cyclic disc tilt plus blow-back with forward speed
    this.rotorTilt.rotation.x = s.discX + clamp(vF, -10, 40) * 0.0012 * Math.min(1, rpm * 1.5);
    this.rotorTilt.rotation.z = s.discZ;
    const droop = -0.028 * (1 - sstep(0.15, 0.6, rpm));
    const cone = droop + 0.05 * clamp(s.load, 0, 2) * sstep(0.3, 0.9, rpm);
    for (let k = 0; k < 4; k++) {
      const az = this.rotorAngle + (k * Math.PI) / 2;
      // 1/rev flapping: advancing side flaps up, retreating down in forward flight
      const flap = cone + Math.sin(az) * clamp(vF, 0, 40) * 0.0009 * sstep(0.2, 0.8, rpm) + Math.sin(az * 2 + s.time * 3) * 0.004 * (1 - sstep(0.4, 0.9, rpm));
      this.flaps[k].rotation.z = flap;
      this.feathers[k].rotation.x = 0.03 + s.collective * 0.2 + Math.cos(az) * s.stickY * 0.05 - Math.sin(az) * s.stickX * 0.05;
    }
    const blur = sstep(0.32, 0.78, rpm);
    this.matBlade.uniforms.u_fade.value = 1 - blur * 0.9;
    this.discMat.uniforms.u_blur.value = blur;
    this.discMat.uniforms.u_spin.value = this.rotorAngle;
    this.discMat.uniforms.u_cone.value = Math.sin(cone);
    const tBlur = sstep(0.12, 0.42, rpm);
    this.tailSpin.rotation.x = this.tailAngle;
    this.tailBlades.rotation.y = 0.05 + s.pedal * 0.22;
    this.matTailBlade.uniforms.u_fade.value = 1 - tBlur * 0.92;
    this.tailDiscMat.uniforms.u_blur.value = tBlur;
    this.tailDiscMat.uniforms.u_spin.value = this.tailAngle;
    // ---- suspension: skids stay on the ground while the body sinks on them
    const c = s.compression;
    const avg = (c[0] + c[1] + c[2] + c[3]) / 4;
    this.skids.position.y = avg;
    this.skids.rotation.z = ((c[1] + c[3]) - (c[0] + c[2])) / 2 / 1.9;
    this.skids.rotation.x = ((c[0] + c[1]) - (c[2] + c[3])) / 2 / 2.25;
    // ---- controls
    this.cyclic.rotation.set(-s.stickY * 0.22, 0, -s.stickX * 0.22);
    this.collective.rotation.x = 0.12 + s.collective * 0.32;
    this.pedals[0].position.z = -1.22 - s.pedal * 0.05;
    this.pedals[1].position.z = -1.22 + s.pedal * 0.05;
    // ---- instruments
    const near = s.camDist < 24;
    if (near) {
      const sweep = (t: number) => -(-2.356 + 4.712 * clamp(t, 0, 1));
      this.needles.airspeed.rotation.z = sweep((s.airspeed * 3.6) / 240);
      this.needles.altimeter.rotation.z = -((s.altitude % 100) / 100) * Math.PI * 2;
      this.needles.rpm.rotation.z = sweep(s.rpm / 1.2);
      this.needles.rpm2.rotation.z = sweep(s.n1 / 1.2);
      this.needles.vsi.rotation.z = -clamp(s.vspeed / 10, -1, 1) * 2.3 - Math.PI / 2;
      this.compassCard.rotation.z = -s.heading;
      this.horizonBall.rotation.z = s.roll;
    }
    const panelOn = s.powered ? 1 : 0;
    this.matDial.uniforms.u_emissive.value = 0.12 * panelOn;
    this.matCompass.uniforms.u_emissive.value = 0.12 * panelOn;
    this.matHorizon.uniforms.u_emissive.value = 0.1 * panelOn;
    this.matNeedle.uniforms.u_emissive.value = 0.35 * panelOn;
    this.matScreen.uniforms.u_emissive.value = 0.9 * panelOn;
    // ---- lights
    const t = s.time;
    const nav = s.powered ? 1 : 0;
    const strobePh = (t % 1.35);
    const strobe = s.powered && (strobePh < 0.045 || (strobePh > 0.16 && strobePh < 0.205)) ? 1 : 0;
    const strobe2 = s.powered && ((t + 0.6) % 1.35) < 0.045 ? 1 : 0;
    const beacon = s.powered ? Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.1)), 8) : 0;
    const land = s.powered && s.piloted ? 1 : 0;
    const lvl: Record<keyof typeof LIGHTS, number> = { navRed: nav, navGreen: nav, strobeTail: strobe, strobeFin: strobe2, beacon, landing: land };
    for (const key of Object.keys(lvl) as (keyof typeof LIGHTS)[]) this.lightMats[key].uniforms.u_emissive.value = 0.15 + 0.85 * lvl[key];
    for (const gw of this.glows) {
      const k = lvl[gw.key];
      const big = gw.key.startsWith('strobe') ? 1 : 0;
      gw.mat.uniforms.u_intensity.value = k * (big ? 26 : gw.key === 'beacon' ? 14 : gw.key === 'landing' ? 9 : 5);
      gw.mat.uniforms.u_size.value = big ? 0.9 + 0.6 * k : gw.key === 'landing' ? 0.55 : 0.4;
      gw.mesh.visible = k > 0.01;
    }
    // ---- pilot
    this.pilot.visible = s.showPilot;
    // ---- sync forward meshes to their anchors
    this.root.updateMatrixWorld(true);
    for (const f of this.fwdMeshes) {
      f.mesh.matrix.copy(f.anchor.matrixWorld);
      f.mesh.matrixWorldNeedsUpdate = true;
    }
  }

  private _qi = new THREE.Quaternion();
  private _v = new THREE.Vector3();
  private invQuat(q: THREE.Quaternion) {
    return this._qi.copy(q).invert();
  }

  dispose() {
    this.root.removeFromParent();
    this.forward.removeFromParent();
    for (const m of this.mats) m.dispose();
    this.glassMat.dispose();
    this.discMat.dispose();
    this.tailDiscMat.dispose();
    for (const g of this.glows) g.mat.dispose();
  }
}
