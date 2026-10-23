// Procedural Saharan erg heightfield.
//
// The same function exists twice: in JavaScript (collision, object placement) and in
// GLSL (GPU height atlas). Both use the same integer PCG hash, so the lattice randomness
// is bit-identical and the remaining float32/float64 differences are sub-millimetre.
// Any change to one implementation must be mirrored in the other; tests/heightfield
// compares them on the GPU.
//
// Dune model, largest to smallest:
//  - draa: ridged-noise mega dunes up to ~150 m forming star/linear networks
//  - barchanoid ridges: an asymmetric dune profile (long stoss slope, slip face at the
//    angle of repose) laid out along a warped phase field travelling with the wind
//  - small oblique secondary dunes in patches
//  - gentle interdune undulation
//  - oasis basins (elongated interdune lakes) on a coarse random grid

// Prevailing, dune-forming wind blows toward the south-west (from the NE, like the
// Saharan trade winds), so slip faces face SW. Convention: +X = east, -Z = north.
export const WIND_X = -Math.SQRT1_2;
export const WIND_Z = Math.SQRT1_2;
const PERP_X = WIND_Z;
const PERP_Z = -WIND_X;

// Oases sit on a coarse grid; each cell may hold one basin well inside its borders.
export const OASIS_CELL = 2000;
const OASIS_CHANCE = 0.3;
// Long axis (along the crests) is this much longer than the short axis.
export const OASIS_STRETCH = 1.7;

const OFF = 32768;
const INV24 = 1 / 16777216;
let hx = 0;
let hy = 0;

function pcg(ix, iy) {
  let x = (ix + OFF) >>> 0;
  let y = (iy + OFF) >>> 0;
  x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
  y = (Math.imul(y, 1664525) + 1013904223) >>> 0;
  x = (x + Math.imul(y, 1664525)) >>> 0;
  y = (y + Math.imul(x, 1664525)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;
  x = (x + Math.imul(y, 1664525)) >>> 0;
  y = (y + Math.imul(x, 1664525)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;
  hx = x;
  hy = y;
}

/** Two uniform random numbers in [0,1) for an integer lattice cell. */
export function hash2(ix, iy, out) {
  pcg(ix, iy);
  out[0] = (hx >>> 8) * INV24;
  out[1] = (hy >>> 8) * INV24;
  return out;
}

function corner(ix, iy, fx, fy) {
  pcg(ix, iy);
  return ((hx >>> 8) * INV24 * 2 - 1) * fx + ((hy >>> 8) * INV24 * 2 - 1) * fy;
}

/** 2D gradient noise in about [-0.7, 0.7]. */
export function gnoise(px, py) {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = corner(ix, iy, fx, fy);
  const b = corner(ix + 1, iy, fx - 1, fy);
  const c = corner(ix, iy + 1, fx, fy - 1);
  const d = corner(ix + 1, iy + 1, fx - 1, fy - 1);
  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}

// Gradient noise with analytic derivatives; the derivatives land in noiseDx / noiseDy.
let noiseDx = 0;
let noiseDy = 0;
export function gnoised(px, py) {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1);
  const duy = 30 * fy * fy * (fy * (fy - 2) + 1);
  pcg(ix, iy);
  const gax = (hx >>> 8) * INV24 * 2 - 1;
  const gay = (hy >>> 8) * INV24 * 2 - 1;
  pcg(ix + 1, iy);
  const gbx = (hx >>> 8) * INV24 * 2 - 1;
  const gby = (hy >>> 8) * INV24 * 2 - 1;
  pcg(ix, iy + 1);
  const gcx = (hx >>> 8) * INV24 * 2 - 1;
  const gcy = (hy >>> 8) * INV24 * 2 - 1;
  pcg(ix + 1, iy + 1);
  const gdx = (hx >>> 8) * INV24 * 2 - 1;
  const gdy = (hy >>> 8) * INV24 * 2 - 1;
  const va = gax * fx + gay * fy;
  const vb = gbx * (fx - 1) + gby * fy;
  const vc = gcx * fx + gcy * (fy - 1);
  const vd = gdx * (fx - 1) + gdy * (fy - 1);
  const k = va - vb - vc + vd;
  noiseDx = gax + (gbx - gax) * ux + (gcx - gax) * uy + (gax - gbx - gcx + gdx) * ux * uy + (vb - va + k * uy) * dux;
  noiseDy = gay + (gby - gay) * ux + (gcy - gay) * uy + (gay - gby - gcy + gdy) * ux * uy + (vc - va + k * ux) * duy;
  return va + (vb - va) * ux + (vc - va) * uy + k * ux * uy;
}

/** Analytic derivatives of the last gnoised() call. */
export function lastNoiseDerivatives() {
  return [noiseDx, noiseDy];
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0, e1, v) => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// Cross-section of one dune: a long convex stoss (windward) slope rising over [0,a],
// then a slip face at the angle of repose with a concave toe over [a,1].
function profile(t, a) {
  if (t < a) {
    const s = t / a;
    return s * s * (3 - 2 * s);
  }
  const s = (t - a) / (1 - a);
  const u = 1 - s;
  return u * u * (1 + 0.65 * s);
}

// Barchanoid horn rounding: g = (2fu)^2 is blended near the horn tips into a cubic that
// matches value, slope and curvature. Dune height depends on |grad phase|, so the phase
// must be C2 or every horn line becomes a visible crease.
const HORN = 0.1;
const HORN_C0 = 1 - (4 / 3) * HORN;
const HORN_C2 = 4 - 4 / HORN;
const HORN_C3 = 4 / (3 * HORN * HORN);

function warpX(x, z) {
  return x + 160 * gnoise(x * (1 / 1700) + 11.3, z * (1 / 1700) + 7.1);
}
function warpZ(x, z) {
  return z + 160 * gnoise(x * (1 / 1700) - 3.7, z * (1 / 1700) + 19.4);
}

function draa(qx, qz, x, z) {
  // Ridged noise: crests along the zero set give star / linear mega-dune networks.
  const m = gnoise(qx * (1 / 2300) + 1.3, qz * (1 / 2300) + 8.8);
  let r = 1 - Math.min(1, Math.abs(m) * 2.2);
  r = r * r;
  const peak = clamp01(0.2 + 1.3 * gnoise(qx * (1 / 1400) - 2.7, qz * (1 / 1400) + 5.3));
  const draaH = 150 * clamp01(0.42 + 1.4 * gnoise(x * (1 / 6000) - 4.2, z * (1 / 6000) + 2.9));
  return r * draaH * (0.3 + 0.7 * peak);
}

function baseUndulation(x, z) {
  return 5 * gnoise(x * (1 / 420) + 2.2, z * (1 / 420) - 6.6) + 1.6 * gnoise(x * (1 / 130) - 9.4, z * (1 / 130) + 4.4);
}

const _h = [0, 0];
const oasisCache = new Map();

/**
 * The oasis of a grid cell, or null. Deterministic; cached.
 * Returns { x, z, radius, floor, waterLevel, cx, cz }.
 */
export function getOasis(cx, cz) {
  const key = cx * 100003 + cz;
  let o = oasisCache.get(key);
  if (o !== undefined) return o;
  o = null;
  hash2(cx + 917, cz - 433, _h);
  const always = cx === 0 && cz === 0;
  if (always || _h[0] <= OASIS_CHANCE) {
    const r0 = _h[1];
    hash2(cx - 211, cz + 389, _h);
    o = {
      cx,
      cz,
      x: (cx + 0.3 + 0.4 * _h[0]) * OASIS_CELL,
      z: (cz + 0.3 + 0.4 * _h[1]) * OASIS_CELL,
      radius: 48 + 44 * r0,
      floor: 0,
      waterLevel: 0,
    };
    if (always) {
      o.x = 880;
      o.z = 760;
      o.radius = 70;
    }
    o.floor = draa(warpX(o.x, o.z), warpZ(o.x, o.z), o.x, o.z) + baseUndulation(o.x, o.z) - 2;
    o.waterLevel = o.floor - 1.2;
  }
  if (oasisCache.size > 4096) oasisCache.clear();
  oasisCache.set(key, o);
  return o;
}

/** Elliptical, noise-perturbed distance from an oasis centre (in units of its radius). */
export function oasisDistance(o, x, z) {
  const dx = x - o.x;
  const dz = z - o.z;
  const ea = (dx * PERP_X + dz * PERP_Z) * (1 / OASIS_STRETCH);
  const eb = dx * WIND_X + dz * WIND_Z;
  const d = Math.sqrt(ea * ea + eb * eb) + o.radius * 0.32 * gnoise(dx * (1 / 70) + 5.3, dz * (1 / 70) - 1.9);
  return d / o.radius;
}

// Extra outputs of the last heightAt() call (module state avoids allocation).
// lee: 0..1 slip-face factor. oasisMask: 0..1 inside an oasis basin.
export const terrainInfo = { lee: 0, oasisMask: 0, oasis: null };

export function heightAt(x, z) {
  // Domain warp shared by every dune scale so the patterns stay coherent.
  const qx = warpX(x, z);
  const qz = warpZ(x, z);

  const big = draa(qx, qz, x, z);

  // Transverse / barchanoid ridges travelling with the wind. The profile is laid out in
  // phase units, so its slopes are rescaled by the local phase gradient: slip faces stay
  // at the angle of repose and dune height stays proportional to local spacing.
  const along = qx * WIND_X + qz * WIND_Z;
  const across = qx * PERP_X + qz * PERP_Z;
  const L = 250;
  const n1 = gnoised(across * (1 / 700), along * (1 / 1500));
  const n1a = noiseDy * (1 / 1500);
  const n1c = noiseDx * (1 / 700);
  const n2 = gnoised(across * (1 / 190) + 7.7, along * (1 / 420) + 3.3);
  const n2a = noiseDy * (1 / 420);
  const n2c = noiseDx * (1 / 190);
  // Barchanoid arcs: the crest is pushed downwind toward the horns of each arc.
  const n3 = gnoised(across * (1 / 520) + 4.4, along * (1 / 1200) - 2.2);
  const u = across * (1 / 230) + 0.7 * n3;
  const ua = 0.7 * noiseDy * (1 / 1200);
  const uc = 1 / 230 + 0.7 * noiseDx * (1 / 520);
  const fu = u - Math.floor(u) - 0.5;
  const e = 0.5 - Math.abs(fu);
  let g;
  let dg;
  if (e > HORN) {
    g = 4 * fu * fu;
    dg = 8 * fu;
  } else {
    g = HORN_C0 + HORN_C2 * e * e + HORN_C3 * e * e * e;
    dg = -(2 * HORN_C2 * e + 3 * HORN_C3 * e * e) * (fu < 0 ? -1 : 1);
  }
  const barch = 0.4 * clamp01(0.45 + 1.6 * gnoise(x * (1 / 2400) + 8.1, z * (1 / 2400) - 3.3));
  const phase = along / L + 0.5 * n1 + 0.17 * n2 - barch * g;
  const pa = 1 / L + 0.5 * n1a + 0.17 * n2a - barch * dg * ua;
  const pc = 0.5 * n1c + 0.17 * n2c - barch * dg * uc;
  const grad = Math.max(0.25 / L, Math.sqrt(pa * pa + pc * pc));
  // Height patches are elongated along the crests so dunes end and split naturally.
  const H = Math.min(0.11 / grad, 24 * clamp01(0.42 + 1.7 * gnoise(across * (1 / 900) + 3.1, along * (1 / 380) - 1.7)));
  const leeLen = 2.15 * H + 5;
  const a = Math.min(0.97, Math.max(0.45, 1 - leeLen * grad));
  const t = phase - Math.floor(phase);
  const dunes = H * profile(t, a);
  let lee = t > a ? smoothstep(0, 4, H) * (1 - smoothstep(0.75, 1, (t - a) / (1 - a))) : 0;

  // Small secondary dunes, oblique to the main set and only in patches.
  const along2 = qx * -0.866 + qz * 0.5;
  const across2 = qx * 0.5 + qz * 0.866;
  const L2 = 46;
  const phase2 =
    along2 / L2 +
    0.5 * gnoise(across2 * (1 / 110) + 1.1, along2 * (1 / 160)) +
    0.2 * gnoise(across2 * (1 / 37) - 3.9, along2 * (1 / 61) + 0.7);
  const H2 = 2.6 * clamp01(-0.1 + 2.2 * gnoise(across2 * (1 / 260) - 5.5, along2 * (1 / 140) + 9.1));
  const a2 = Math.min(0.95, Math.max(0.5, 1 - (2.15 * H2 + 1) / L2));
  const t2 = phase2 - Math.floor(phase2);
  const small = H2 * profile(t2, a2);
  if (t2 > a2) lee = Math.max(lee, smoothstep(0.5, 2, H2) * 0.7);

  let h = big + dunes + small + baseUndulation(x, z);

  // Oasis basin: an irregular bowl with a flat vegetated rim, blended into the dunes.
  terrainInfo.oasisMask = 0;
  terrainInfo.oasis = null;
  const o = getOasis(Math.floor(x / OASIS_CELL), Math.floor(z / OASIS_CELL));
  if (o !== null) {
    const k = oasisDistance(o, x, z);
    if (k < 2.6) {
      const d = k * o.radius;
      const bowl = o.floor - 5.5 * (1 - smoothstep(0, 1.05, k)) + 0.11 * Math.max(0, d - o.radius);
      const mask = 1 - smoothstep(1.2, 2.6, k);
      h += (bowl - h) * mask;
      lee *= 1 - mask;
      terrainInfo.oasisMask = 1 - smoothstep(1.0, 1.9, k);
      terrainInfo.oasis = o;
    }
  }

  terrainInfo.lee = lee;
  return h;
}

/** Surface normal by central differences; writes into out (array or {x,y,z}). */
export function normalAt(x, z, out, eps = 0.25) {
  const dx = (heightAt(x + eps, z) - heightAt(x - eps, z)) / (2 * eps);
  const dz = (heightAt(x, z + eps) - heightAt(x, z - eps)) / (2 * eps);
  const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
  out.x = -dx * inv;
  out.y = inv;
  out.z = -dz * inv;
  return out;
}

// ---------------------------------------------------------------------------------
// GLSL mirror. Requires GLSL ES 3.00 (uint arithmetic).
// ---------------------------------------------------------------------------------
export const NOISE_GLSL = /* glsl */ `
uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  return v;
}

// Uniform randoms in [0,1) for an integer lattice cell (same as JS hash2).
vec2 hash2i(ivec2 c) {
  return vec2(pcg2d(uvec2(c + 32768)) >> 8u) * (1.0 / 16777216.0);
}

float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  ivec2 c = ivec2(i);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float va = dot(hash2i(c) * 2.0 - 1.0, f);
  float vb = dot(hash2i(c + ivec2(1, 0)) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float vc = dot(hash2i(c + ivec2(0, 1)) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float vd = dot(hash2i(c + ivec2(1, 1)) * 2.0 - 1.0, f - vec2(1.0));
  float ab = va + (vb - va) * u.x;
  float cd = vc + (vd - vc) * u.x;
  return ab + (cd - ab) * u.y;
}

// value, d/dp.x, d/dp.y
vec3 gnoised(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  ivec2 c = ivec2(i);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  vec2 ga = hash2i(c) * 2.0 - 1.0;
  vec2 gb = hash2i(c + ivec2(1, 0)) * 2.0 - 1.0;
  vec2 gc = hash2i(c + ivec2(0, 1)) * 2.0 - 1.0;
  vec2 gd = hash2i(c + ivec2(1, 1)) * 2.0 - 1.0;
  float va = dot(ga, f);
  float vb = dot(gb, f - vec2(1.0, 0.0));
  float vc = dot(gc, f - vec2(0.0, 1.0));
  float vd = dot(gd, f - vec2(1.0));
  float k = va - vb - vc + vd;
  vec2 d = ga + (gb - ga) * u.x + (gc - ga) * u.y + (ga - gb - gc + gd) * u.x * u.y
         + vec2(vb - va + k * u.y, vc - va + k * u.x) * du;
  return vec3(va + (vb - va) * u.x + (vc - va) * u.y + k * u.x * u.y, d);
}
`;

export const HEIGHTFIELD_GLSL = /* glsl */ `
const float HF_WIND_X = ${WIND_X.toFixed(10)};
const float HF_WIND_Z = ${WIND_Z.toFixed(10)};
const float HF_PERP_X = ${PERP_X.toFixed(10)};
const float HF_PERP_Z = ${PERP_Z.toFixed(10)};
const float HF_OASIS_CELL = ${OASIS_CELL.toFixed(1)};
const float HF_OASIS_CHANCE = ${OASIS_CHANCE.toFixed(4)};
const float HF_OASIS_STRETCH = ${OASIS_STRETCH.toFixed(4)};
const float HF_HORN = ${HORN.toFixed(4)};
const float HF_HORN_C0 = 1.0 - (4.0 / 3.0) * HF_HORN;
const float HF_HORN_C2 = 4.0 - 4.0 / HF_HORN;
const float HF_HORN_C3 = 4.0 / (3.0 * HF_HORN * HF_HORN);

float hfProfile(float t, float a) {
  if (t < a) {
    float s = t / a;
    return s * s * (3.0 - 2.0 * s);
  }
  float s = (t - a) / (1.0 - a);
  float u = 1.0 - s;
  return u * u * (1.0 + 0.65 * s);
}

vec2 hfWarp(vec2 p) {
  return p + 160.0 * vec2(gnoise(p * (1.0 / 1700.0) + vec2(11.3, 7.1)), gnoise(p * (1.0 / 1700.0) + vec2(-3.7, 19.4)));
}

float hfDraa(vec2 q, vec2 p) {
  float m = gnoise(q * (1.0 / 2300.0) + vec2(1.3, 8.8));
  float r = 1.0 - min(1.0, abs(m) * 2.2);
  r = r * r;
  float peak = clamp(0.2 + 1.3 * gnoise(q * (1.0 / 1400.0) + vec2(-2.7, 5.3)), 0.0, 1.0);
  float draaH = 150.0 * clamp(0.42 + 1.4 * gnoise(p * (1.0 / 6000.0) + vec2(-4.2, 2.9)), 0.0, 1.0);
  return r * draaH * (0.3 + 0.7 * peak);
}

float hfBase(vec2 p, float fw) {
  float fine = 1.0 - smoothstep(130.0 * 0.12, 130.0 * 0.3, fw);
  return 5.0 * gnoise(p * (1.0 / 420.0) + vec2(2.2, -6.6)) + 1.6 * fine * gnoise(p * (1.0 / 130.0) + vec2(-9.4, 4.4));
}

// xy = centre, z = radius, w = floor height. Returns false when the cell has no oasis.
bool hfOasis(ivec2 cell, out vec4 o) {
  vec2 h = hash2i(cell + ivec2(917, -433));
  bool always = cell.x == 0 && cell.y == 0;
  o = vec4(0.0);
  if (!always && h.x > HF_OASIS_CHANCE) return false;
  vec2 h2 = hash2i(cell + ivec2(-211, 389));
  o.xy = (vec2(cell) + 0.3 + 0.4 * h2) * HF_OASIS_CELL;
  o.z = 48.0 + 44.0 * h.y;
  if (always) o.xyz = vec3(880.0, 760.0, 70.0);
  o.w = hfDraa(hfWarp(o.xy), o.xy) + hfBase(o.xy, 0.0) - 2.0;
  return true;
}

float hfOasisDistance(vec4 o, vec2 p) {
  vec2 dd = p - o.xy;
  float ea = (dd.x * HF_PERP_X + dd.y * HF_PERP_Z) * (1.0 / HF_OASIS_STRETCH);
  float eb = dd.x * HF_WIND_X + dd.y * HF_WIND_Z;
  float d = sqrt(ea * ea + eb * eb) + o.z * 0.32 * gnoise(dd * (1.0 / 70.0) + vec2(5.3, -1.9));
  return d / o.z;
}

// x = height (m), y = slip-face factor. fw is the filter width (m): components whose
// wavelength approaches it fade to their mean, so coarse clipmap levels are band-limited
// instead of aliasing. fw = 0 matches the JavaScript heightAt() exactly.
vec2 terrainHeightLee(vec2 p, float fw) {
  vec2 q = hfWarp(p);
  float big = hfDraa(q, p);

  float along = q.x * HF_WIND_X + q.y * HF_WIND_Z;
  float across = q.x * HF_PERP_X + q.y * HF_PERP_Z;
  const float L = 250.0;
  vec3 n1 = gnoised(vec2(across * (1.0 / 700.0), along * (1.0 / 1500.0)));
  vec3 n2 = gnoised(vec2(across * (1.0 / 190.0) + 7.7, along * (1.0 / 420.0) + 3.3));
  vec3 n3 = gnoised(vec2(across * (1.0 / 520.0) + 4.4, along * (1.0 / 1200.0) - 2.2));
  float u = across * (1.0 / 230.0) + 0.7 * n3.x;
  float ua = 0.7 * n3.z * (1.0 / 1200.0);
  float uc = 1.0 / 230.0 + 0.7 * n3.y * (1.0 / 520.0);
  float fu = u - floor(u) - 0.5;
  float e = 0.5 - abs(fu);
  float g;
  float dg;
  if (e > HF_HORN) {
    g = 4.0 * fu * fu;
    dg = 8.0 * fu;
  } else {
    g = HF_HORN_C0 + HF_HORN_C2 * e * e + HF_HORN_C3 * e * e * e;
    dg = -(2.0 * HF_HORN_C2 * e + 3.0 * HF_HORN_C3 * e * e) * (fu < 0.0 ? -1.0 : 1.0);
  }
  float barch = 0.4 * clamp(0.45 + 1.6 * gnoise(p * (1.0 / 2400.0) + vec2(8.1, -3.3)), 0.0, 1.0);
  float phase = along / L + 0.5 * n1.x + 0.17 * n2.x - barch * g;
  float pa = 1.0 / L + 0.5 * n1.z * (1.0 / 1500.0) + 0.17 * n2.z * (1.0 / 420.0) - barch * dg * ua;
  float pc = 0.5 * n1.y * (1.0 / 700.0) + 0.17 * n2.y * (1.0 / 190.0) - barch * dg * uc;
  float grad = max(0.25 / L, sqrt(pa * pa + pc * pc));
  float H = min(0.11 / grad, 24.0 * clamp(0.42 + 1.7 * gnoise(vec2(across * (1.0 / 900.0) + 3.1, along * (1.0 / 380.0) - 1.7)), 0.0, 1.0));
  float leeLen = 2.15 * H + 5.0;
  float a = min(0.97, max(0.45, 1.0 - leeLen * grad));
  float t = phase - floor(phase);
  float dunes = H * hfProfile(t, a);
  float lee = t > a ? smoothstep(0.0, 4.0, H) * (1.0 - smoothstep(0.75, 1.0, (t - a) / (1.0 - a))) : 0.0;
  // Band-limit: mean of the profile over one period = 0.5 a + 0.3875 (1 - a).
  float f1 = smoothstep(0.1, 0.28, fw * grad);
  dunes = mix(dunes, H * (0.5 * a + 0.3875 * (1.0 - a)), f1);
  lee *= 1.0 - f1;

  float along2 = q.x * -0.866 + q.y * 0.5;
  float across2 = q.x * 0.5 + q.y * 0.866;
  const float L2 = 46.0;
  float phase2 = along2 / L2
    + 0.5 * gnoise(vec2(across2 * (1.0 / 110.0) + 1.1, along2 * (1.0 / 160.0)))
    + 0.2 * gnoise(vec2(across2 * (1.0 / 37.0) - 3.9, along2 * (1.0 / 61.0) + 0.7));
  float H2 = 2.6 * clamp(-0.1 + 2.2 * gnoise(vec2(across2 * (1.0 / 260.0) - 5.5, along2 * (1.0 / 140.0) + 9.1)), 0.0, 1.0);
  float a2 = min(0.95, max(0.5, 1.0 - (2.15 * H2 + 1.0) / L2));
  float t2 = phase2 - floor(phase2);
  float small = H2 * hfProfile(t2, a2);
  float f2 = smoothstep(L2 * 0.1, L2 * 0.28, fw);
  small = mix(small, H2 * (0.5 * a2 + 0.3875 * (1.0 - a2)), f2);
  if (t2 > a2) lee = max(lee, smoothstep(0.5, 2.0, H2) * 0.7 * (1.0 - f2));

  float h = big + dunes + small + hfBase(p, fw);

  vec4 o;
  if (hfOasis(ivec2(floor(p / HF_OASIS_CELL)), o)) {
    float k = hfOasisDistance(o, p);
    if (k < 2.6) {
      float d = k * o.z;
      float bowl = o.w - 5.5 * (1.0 - smoothstep(0.0, 1.05, k)) + 0.11 * max(0.0, d - o.z);
      float mask = 1.0 - smoothstep(1.2, 2.6, k);
      h += (bowl - h) * mask;
      lee *= 1.0 - mask;
    }
  }
  return vec2(h, lee);
}
`;
