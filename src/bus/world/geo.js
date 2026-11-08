// =============================================================================
// BUS-WORLD GEOGRAPHY — drop-in replacement for src/world/geo.js used by the
// coach road trip (bus.html remaps '../world/geo.js' imports to this file via
// the import map). Same exported API & GLSL function names, so the reused
// environment (terrain/water/land cover) and city modules work unchanged:
//   GEO.terrainHeight / GEO.waterMask / GEO.coastX / GEO.vnoise / GEO.fbm ...
//   GEO_GLSL: geoHeight(vec2), geoWater(vec2), geoCoastX(float), uniforms uGeoDep / uGeoArr
// Additions:
//   GEO.naturalHeight(x, z, dep, arr)  terrain before the road corridor is cut in
//   GEO.landHeight(x, z, dep, arr)     terrainHeight without the final water mix
//   GEO.roadInfluence(x, z)            {ry, d, mode, halfW} from the registered route index
//   setRoadIndex(index)                called by src/bus/world/route.js
//   GEO_UNIFORMS                       extra uniforms the GLSL needs (road field textures)
//   GEO_FEATURES                       { enrouteLakes: false, airports: false }
//
// Layout (world metres, x east, z south). Anchors:
//   dep = (0, 0)        'Cedar Bay': farmland plain, the town at DEP_TOWN, lake to the SE
//   arr = (-60000, 30000) 'Port Solano': coastal city north of the anchor, the
//                       gulf to the WEST (shore ~6.8 km west of the anchor),
//                       a cliff-lined coastal terrace + hills north of the city.
//   Between them (world x ≈ -27 … -46 km) the Hollow Range, a N-S mountain ridge
//   (peaks ~2000 m) with a saddle near z ≈ -14 km where the road crosses.
// The ROAD is cut into the terrain: natural terrain blends to just below the
// road surface near the corridor (embankments / cuttings), except inside
// tunnels and under bridges. The GLSL reads the corridor from two float
// textures rendered by the road module (coarse = whole route, fine = around
// the bus); the JS reads the same data from the route index.
// =============================================================================
import * as THREE from 'three';

export const BUS_ANCHORS = { dep: { x: 0, z: 0 }, arr: { x: -60000, z: 30000 } };
export const GEO_FEATURES = { enrouteLakes: false, airports: false, bus: true };

// Kept for API compatibility with the flight geography (no airports in this world:
// a 1 m rectangle at each anchor, so 'airport' code paths are no-ops).
export const AIRPORT_FLAT = { xMin: -0.5, xMax: 0.5, zMin: -0.5, zMax: 0.5, blend: 1 };
export const DEP_TOWN = { x: 4200, z: -5200, radius: 2200 };
export const DEP_LAKE = { x: 6500, z: 5200, rx: 3400, rz: 2100 };
export const ARR_CITY = { xMin: -6200, xMax: 9000, zMin: -17000, zMax: -2600 };
export const ARR_DOWNTOWN = { x: -3200, z: -9000, radius: 1800 };
export const ARR_PORT = { x: -5600, z: -4200 };
export const SEA_LEVEL = 0;
export const SEABED = -25;
export const RANGE = { centerX: -36000, halfWidth: 9500, passZ: -14200 };
// The Hollow valley: the road climbs it from Ridgefield to the pass, then follows
// the Hollow River valley down to the gulf. [x, z, floor height]. Terrain is
// carved (never raised) to a flat floor of VALLEY_FLOOR half width, blending back
// to natural terrain over VALLEY_FALL metres.
const VALLEY_KEYS = [
  [-25600, -11850, 40], [-29000, -12300, 115], [-31500, -12950, 215], [-33800, -13300, 345],
  [-35500, -13850, 455], [-37300, -14250, 540], [-39500, -14950, 440], [-42500, -15300, 320],
  [-46500, -16250, 200], [-51000, -16950, 120], [-56000, -17450, 62], [-61000, -17850, 26], [-67200, -18050, 2],
];
/** Meandering valley polyline: key points subdivided x3 with deterministic lateral bends. */
export const VALLEY = (() => {
  const out = [];
  for (let i = 0; i < VALLEY_KEYS.length - 1; i++) {
    const a = VALLEY_KEYS[i], b = VALLEY_KEYS[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    const nx = -dz / L, nz = dx / L;
    for (let k = 0; k < 3; k++) {
      const t = k / 3;
      const amp = (k === 0 || i === 4 || i === 5) ? 0 : Math.min(420, L * 0.11) * Math.sin(i * 2.7 + k * 1.9);
      out.push([Math.round(a[0] + dx * t + nx * amp), Math.round(a[1] + dz * t + nz * amp), Math.round((a[2] + (b[2] - a[2]) * t) * 10) / 10]);
    }
  }
  out.push(VALLEY_KEYS[VALLEY_KEYS.length - 1]);
  return out;
})();
export const VALLEY_FLOOR = 260;
export const VALLEY_FALL = 2300;

// ----------------------------------------------------------------------------- JS
function hash2(ix, iz) {
  let h = (Math.imul(ix | 0, 0x8da6b343) ^ Math.imul(iz | 0, 0xd8163841)) >>> 0;
  h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)) >>> 0;
  h = (Math.imul(h ^ (h >>> 12), 0x297a2d39)) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}
function fbm(x, z, oct) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f + i * 31.7, z * f - i * 17.3); f *= 2.03; amp *= 0.5; }
  return s;
}
function ridged(x, z, oct) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(vnoise(x * f + i * 11.1, z * f + i * 7.7)); s += amp * n * n; f *= 2.1; amp *= 0.5; }
  return s;
}
const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Distance to the valley polyline and the interpolated floor height: [d, floor]. */
export function valleyAt(wx, wz) {
  let best = 1e12, fl = 0;
  for (let i = 0; i < VALLEY.length - 1; i++) {
    const a = VALLEY[i], b = VALLEY[i + 1];
    const bx = b[0] - a[0], bz = b[1] - a[1];
    let t = ((wx - a[0]) * bx + (wz - a[1]) * bz) / (bx * bx + bz * bz);
    t = Math.min(1, Math.max(0, t));
    const px = a[0] + bx * t - wx, pz = a[1] + bz * t - wz;
    const d2 = px * px + pz * pz;
    if (d2 < best) { best = d2; fl = a[2] + (b[2] - a[2]) * t; }
  }
  return [Math.sqrt(best), fl];
}

/** Gulf shoreline: arrival-local x of the shore as a function of arrival-local z. */
export function coastX(lz) {
  return -6800 + 900 * Math.sin(lz / 5200 + 1.3) + 450 * Math.sin(lz / 1900 + 0.4) + 160 * Math.sin(lz / 640 + 2.1);
}
/** Smooth version of the shoreline (no 640 m term) used to lay out the coast road. */
export function coastXSmooth(lz) {
  return -6800 + 900 * Math.sin(lz / 5200 + 1.3) + 450 * Math.sin(lz / 1900 + 0.4);
}

/** 1 = water, 0 = land. */
export function waterMask(wx, wz, dep, arr) {
  const lx = wx - arr.x, lz = wz - arr.z;
  let w = 0;
  if (lx > -75000 && lx < 0 && lz > -90000 && lz < 36000) {
    const shore = coastX(lz) + 120 * vnoise(lz / 300, 3.7);
    const inGulf = 1 - sstep(shore - 30, shore + 30, lx);
    const westEdge = sstep(-75000, -66000, lx);
    const lat = sstep(-90000, -82000, lz) * (1 - sstep(26000, 34000, lz));
    w = Math.max(w, inGulf * westEdge * lat);
  }
  const dx = (wx - dep.x - DEP_LAKE.x) / DEP_LAKE.rx, dz = (wz - dep.z - DEP_LAKE.z) / DEP_LAKE.rz;
  const r = Math.sqrt(dx * dx + dz * dz) + 0.12 * vnoise((wx - dep.x) / 700, (wz - dep.z) / 700);
  w = Math.max(w, 1 - sstep(0.97, 1.03, r));
  return w;
}

/** Terrain before the road is cut in (land only; no water mix). */
export function naturalHeight(wx, wz, dep, arr) {
  let h = 60 + fbm(wx / 9000, wz / 9000, 5) * 120 + fbm(wx / 1800, wz / 1800, 3) * 16;
  // Hollow Range
  const xr = RANGE.centerX + 2500 * Math.sin(wz / 8000) + 1200 * Math.sin(wz / 2900 + 1.7);
  const bd = Math.abs(wx - xr) / RANGE.halfWidth;
  const band = 1 - sstep(0.45, 1.0, bd);
  const dzp = (wz - RANGE.passZ) / 4200;
  const saddle = 1 - 0.55 * Math.exp(-dzp * dzp);
  h += band * saddle * (520 + 1500 * ridged(wx / 7000, wz / 7000, 5));
  // carve the Hollow valley (never raises terrain)
  const [vd, vf] = valleyAt(wx, wz);
  if (vd < VALLEY_FLOOR + VALLEY_FALL) {
    const hv = vf + 0.004 * Math.max(0, vd - 40) + (h - vf) * sstep(VALLEY_FLOOR, VALLEY_FLOOR + VALLEY_FALL * (0.75 + 0.5 * vnoise(wx / 4000, wz / 4000)), vd);
    h = Math.min(h, hv);
  }
  // departure farmland plain
  const ddx = wx - dep.x, ddz = wz - dep.z;
  const depPlain = 1 - sstep(10000, 24000, Math.hypot(ddx, ddz));
  h = h * (1 - depPlain) + depPlain * (28 + fbm(wx / 4000, wz / 4000, 4) * 18 + sstep(-6000, -16000, ddz) * 60 * (0.6 + 0.4 * vnoise(wx / 5000, 1.7)));
  // arrival coastal plain + low city
  const adx = wx - arr.x, adz = wz - arr.z;
  const arrPlain = 1 - sstep(12000, 30000, Math.hypot(adx, adz));
  h = h * (1 - arrPlain) + arrPlain * (8 + fbm(wx / 3000, wz / 3000, 4) * 14);
  const inCity = sstep(ARR_CITY.xMin - 1500, ARR_CITY.xMin, adx) * (1 - sstep(ARR_CITY.xMax, ARR_CITY.xMax + 2500, adx)) *
    sstep(ARR_CITY.zMin - 2500, ARR_CITY.zMin, adz) * (1 - sstep(ARR_CITY.zMax, ARR_CITY.zMax + 1500, adz));
  h = h * (1 - inCity) + inCity * (4 + 10 * sstep(-6000, 6000, adx) + 3 * vnoise(wx / 900, wz / 900));
  // coast north of the city: cliff up to a marine terrace (~85 m), hills behind
  const shore = coastX(adz);
  const dS = adx - shore;
  const warp = 2600 * fbm(wx / 11000 + 7.3, wz / 11000 - 2.1, 3);
  const north = sstep(-12000, -19000, adz + warp) * sstep(-92000, -84000, adz);
  if (north > 0 && dS > -400 && dS < 24000) {
    const terrace = 85 * sstep(0, 260, dS) + 10 * vnoise(wx / 700, wz / 700);
    const hills = sstep(1100, 5200, dS) * (230 + 380 * Math.max(0, fbm(wx / 6000, wz / 6000, 4) + 0.25));
    const zone = north * (1 - sstep(13000, 24000, dS + 1.6 * warp));
    h = h * (1 - zone) + zone * (terrace + hills);
  }
  // the river valley also cuts through the coastal hills to the sea
  if (vd < VALLEY_FLOOR + VALLEY_FALL) {
    const hv2 = vf + 0.004 * Math.max(0, vd - 40) + (h - vf) * sstep(VALLEY_FLOOR, VALLEY_FLOOR + VALLEY_FALL, vd);
    h = Math.min(h, hv2);
  }
  // beaches near the city (south part)
  const south = 1 - north;
  if (south > 0 && adx > -75000 && adx < shore + 2500 && adz < 36000) {
    const beach = sstep(shore - 20, shore + 400, adx);
    const hb = h * (0.35 + 0.65 * sstep(shore + 200, shore + 2500, adx)) * beach + (1 - beach) * 0.5;
    h = h * (1 - south) + south * hb;
  }
  return h;
}

// --- road corridor (registered by route.js) ---------------------------------------
let _roadIndex = null;
export function setRoadIndex(index) { _roadIndex = index; }
export function getRoadIndex() { return _roadIndex; }
/** Nearest road data at (x, z): ry = road surface height, d = horizontal distance to the
 *  centreline, mode = 1 carve terrain / 0 tunnel or bridge, halfW = formation half width. */
export function roadInfluence(wx, wz) {
  if (!_roadIndex) return null;
  return _roadIndex.field(wx, wz);
}
/** The blend rule shared by JS and GLSL (keep identical!). */
export function applyRoad(h, rf) {
  if (!rf || rf.d > 1e5) return h;
  const core = rf.halfW + 1.5;
  const fall = Math.min(300, 22 + 1.6 * Math.abs(h - rf.ry));
  const t = sstep(core, core + fall, rf.d);
  const tt = 1 + (t - 1) * rf.mode;
  return (rf.ry - 0.3) * (1 - tt) + h * tt;
}

/** Terrain height without the water mix (includes the road corridor). */
export function landHeight(wx, wz, dep, arr) {
  return applyRoad(naturalHeight(wx, wz, dep, arr), roadInfluence(wx, wz));
}
/** Terrain height (m) at world (wx, wz). Water areas return the seabed. */
export function terrainHeight(wx, wz, dep, arr) {
  const h = landHeight(wx, wz, dep, arr);
  const w = waterMask(wx, wz, dep, arr);
  return w > 0 ? h * (1 - w) + w * SEABED : h;
}

export const GEO = { valleyAt, hash2, vnoise, fbm, ridged, coastX, coastXSmooth, waterMask, terrainHeight, naturalHeight, landHeight, roadInfluence, applyRoad };

// ----------------------------------------------------------------------------- GLSL
// Road-field textures (RGBA float): r = road surface height ry, g = distance to the
// centreline d (cleared to 1e6), b = mode (1 carve, 0 tunnel/bridge), a = half width.
// Rect uniforms: (xMin, zMin, 1/width, 1/depth) in world metres.
const _blank = new THREE.DataTexture(new Float32Array([0, 1e6, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
_blank.needsUpdate = true;
export const GEO_UNIFORMS = {
  uRoadCoarse: { value: _blank },
  uRoadCoarseRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uRoadFine: { value: _blank },
  uRoadFineRect: { value: new THREE.Vector4(0, 0, 1e-9, 1e-9) },
  uRoadReady: { value: 0 },
};

const f1 = (v) => v.toFixed(1);
export const GEO_GLSL = /* glsl */`
uniform vec2 uGeoDep;
uniform vec2 uGeoArr;
uniform sampler2D uRoadCoarse;
uniform vec4 uRoadCoarseRect;
uniform sampler2D uRoadFine;
uniform vec4 uRoadFineRect;
uniform float uRoadReady;
float geoSstep(float a, float b, float v) { float t = clamp((v - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float geoHash2(int ix, int iz) {
  uint h = (uint(ix) * 0x8da6b343u) ^ (uint(iz) * 0xd8163841u);
  h = (h ^ (h >> 15u)) * 0x2c1b3c6du;
  h = (h ^ (h >> 12u)) * 0x297a2d39u;
  h = h ^ (h >> 15u);
  return float(h) / 4294967296.0;
}
float geoVnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  int ix = int(i.x), iz = int(i.y);
  float a = geoHash2(ix, iz), b = geoHash2(ix + 1, iz), c = geoHash2(ix, iz + 1), d = geoHash2(ix + 1, iz + 1);
  return (a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y) * 2.0 - 1.0;
}
float geoFbm(vec2 p, int oct) {
  float s = 0.0, amp = 0.5, f = 1.0;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; s += amp * geoVnoise(p * f + vec2(float(i) * 31.7, -float(i) * 17.3)); f *= 2.03; amp *= 0.5; }
  return s;
}
float geoRidged(vec2 p, int oct) {
  float s = 0.0, amp = 0.5, f = 1.0;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; float n = 1.0 - abs(geoVnoise(p * f + vec2(float(i) * 11.1, float(i) * 7.7))); s += amp * n * n; f *= 2.1; amp *= 0.5; }
  return s;
}
float geoCoastX(float lz) {
  return -6800.0 + 900.0 * sin(lz / 5200.0 + 1.3) + 450.0 * sin(lz / 1900.0 + 0.4) + 160.0 * sin(lz / 640.0 + 2.1);
}
float geoWater(vec2 w) {
  float lx = w.x - uGeoArr.x, lz = w.y - uGeoArr.y;
  float m = 0.0;
  if (lx > -75000.0 && lx < 0.0 && lz > -90000.0 && lz < 36000.0) {
    float shore = geoCoastX(lz) + 120.0 * geoVnoise(vec2(lz / 300.0, 3.7));
    float inGulf = 1.0 - geoSstep(shore - 30.0, shore + 30.0, lx);
    float westEdge = geoSstep(-75000.0, -66000.0, lx);
    float lat = geoSstep(-90000.0, -82000.0, lz) * (1.0 - geoSstep(26000.0, 34000.0, lz));
    m = max(m, inGulf * westEdge * lat);
  }
  vec2 dd = (w - uGeoDep - vec2(${f1(DEP_LAKE.x)}, ${f1(DEP_LAKE.z)})) / vec2(${f1(DEP_LAKE.rx)}, ${f1(DEP_LAKE.rz)});
  float r = length(dd) + 0.12 * geoVnoise((w - uGeoDep) / 700.0);
  m = max(m, 1.0 - geoSstep(0.97, 1.03, r));
  return m;
}
const vec3 GEO_VALLEY[${VALLEY.length}] = vec3[${VALLEY.length}](
  ${VALLEY.map((v) => `vec3(${v[0].toFixed(1)}, ${v[1].toFixed(1)}, ${v[2].toFixed(1)})`).join(',\n  ')});
vec2 geoValley(vec2 w) {
  float best = 1e12, fl = 0.0;
  for (int i = 0; i < ${VALLEY.length - 1}; i++) {
    vec3 a = GEO_VALLEY[i], b = GEO_VALLEY[i + 1];
    vec2 ab = b.xy - a.xy;
    float t = clamp(dot(w - a.xy, ab) / dot(ab, ab), 0.0, 1.0);
    vec2 pd = a.xy + ab * t - w;
    float d2 = dot(pd, pd);
    if (d2 < best) { best = d2; fl = a.z + (b.z - a.z) * t; }
  }
  return vec2(sqrt(best), fl);
}
float geoNatural(vec2 w) {
  float h = 60.0 + geoFbm(w / 9000.0, 5) * 120.0 + geoFbm(w / 1800.0, 3) * 16.0;
  float xr = ${f1(RANGE.centerX)} + 2500.0 * sin(w.y / 8000.0) + 1200.0 * sin(w.y / 2900.0 + 1.7);
  float bd = abs(w.x - xr) / ${f1(RANGE.halfWidth)};
  float band = 1.0 - geoSstep(0.45, 1.0, bd);
  float dzp = (w.y - (${f1(RANGE.passZ)})) / 4200.0;
  float saddle = 1.0 - 0.55 * exp(-dzp * dzp);
  h += band * saddle * (520.0 + 1500.0 * geoRidged(w / 7000.0, 5));
  vec2 vv = geoValley(w);
  if (vv.x < ${f1(VALLEY_FLOOR + VALLEY_FALL)}) {
    float hv = vv.y + 0.004 * max(0.0, vv.x - 40.0) + (h - vv.y) * geoSstep(${f1(VALLEY_FLOOR)}, ${f1(VALLEY_FLOOR)} + ${f1(VALLEY_FALL)} * (0.75 + 0.5 * geoVnoise(w / 4000.0)), vv.x);
    h = min(h, hv);
  }
  vec2 dd = w - uGeoDep;
  float depPlain = 1.0 - geoSstep(10000.0, 24000.0, length(dd));
  h = h * (1.0 - depPlain) + depPlain * (28.0 + geoFbm(w / 4000.0, 4) * 18.0 + geoSstep(-6000.0, -16000.0, dd.y) * 60.0 * (0.6 + 0.4 * geoVnoise(vec2(w.x / 5000.0, 1.7))));
  vec2 ad = w - uGeoArr;
  float arrPlain = 1.0 - geoSstep(12000.0, 30000.0, length(ad));
  h = h * (1.0 - arrPlain) + arrPlain * (8.0 + geoFbm(w / 3000.0, 4) * 14.0);
  float inCity = geoSstep(${f1(ARR_CITY.xMin - 1500)}, ${f1(ARR_CITY.xMin)}, ad.x) * (1.0 - geoSstep(${f1(ARR_CITY.xMax)}, ${f1(ARR_CITY.xMax + 2500)}, ad.x)) *
    geoSstep(${f1(ARR_CITY.zMin - 2500)}, ${f1(ARR_CITY.zMin)}, ad.y) * (1.0 - geoSstep(${f1(ARR_CITY.zMax)}, ${f1(ARR_CITY.zMax + 1500)}, ad.y));
  h = h * (1.0 - inCity) + inCity * (4.0 + 10.0 * geoSstep(-6000.0, 6000.0, ad.x) + 3.0 * geoVnoise(w / 900.0));
  float shore = geoCoastX(ad.y);
  float dS = ad.x - shore;
  float warp = 2600.0 * geoFbm(w / 11000.0 + vec2(7.3, -2.1), 3);
  float north = geoSstep(-12000.0, -19000.0, ad.y + warp) * geoSstep(-92000.0, -84000.0, ad.y);
  if (north > 0.0 && dS > -400.0 && dS < 24000.0) {
    float terrace = 85.0 * geoSstep(0.0, 260.0, dS) + 10.0 * geoVnoise(w / 700.0);
    float hills = geoSstep(1100.0, 5200.0, dS) * (230.0 + 380.0 * max(0.0, geoFbm(w / 6000.0, 4) + 0.25));
    float zone = north * (1.0 - geoSstep(13000.0, 24000.0, dS + 1.6 * warp));
    h = h * (1.0 - zone) + zone * (terrace + hills);
  }
  if (vv.x < ${f1(VALLEY_FLOOR + VALLEY_FALL)}) {
    float hv2 = vv.y + 0.004 * max(0.0, vv.x - 40.0) + (h - vv.y) * geoSstep(${f1(VALLEY_FLOOR)}, ${f1(VALLEY_FLOOR + VALLEY_FALL)}, vv.x);
    h = min(h, hv2);
  }
  float south = 1.0 - north;
  if (south > 0.0 && ad.x > -75000.0 && ad.x < shore + 2500.0 && ad.y < 36000.0) {
    float beach = geoSstep(shore - 20.0, shore + 400.0, ad.x);
    float hb = h * (0.35 + 0.65 * geoSstep(shore + 200.0, shore + 2500.0, ad.x)) * beach + (1.0 - beach) * 0.5;
    h = h * (1.0 - south) + south * hb;
  }
  return h;
}
vec4 busRoadSample(vec2 w) {
  if (uRoadReady < 0.5) return vec4(0.0, 1e6, 0.0, 0.0);
  vec2 uf = (w - uRoadFineRect.xy) * uRoadFineRect.zw;
  if (uf.x > 0.002 && uf.y > 0.002 && uf.x < 0.998 && uf.y < 0.998) return texture(uRoadFine, uf);
  vec2 uc = (w - uRoadCoarseRect.xy) * uRoadCoarseRect.zw;
  if (uc.x < 0.0 || uc.y < 0.0 || uc.x > 1.0 || uc.y > 1.0) return vec4(0.0, 1e6, 0.0, 0.0);
  return texture(uRoadCoarse, uc);
}
float geoApplyRoad(float h, vec4 rf) {
  if (rf.g > 1e5) return h;
  float core = rf.a + 1.5;
  float fall = min(300.0, 22.0 + 1.6 * abs(h - rf.r));
  float t = geoSstep(core, core + fall, rf.g);
  float tt = 1.0 + (t - 1.0) * rf.b;
  return (rf.r - 0.3) * (1.0 - tt) + h * tt;
}
float geoHeight(vec2 w) {
  float h = geoApplyRoad(geoNatural(w), busRoadSample(w));
  float wm = geoWater(w);
  h = mix(h, ${SEABED.toFixed(1)}, wm);
  return h;
}
`;
