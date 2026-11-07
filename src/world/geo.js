// =============================================================================
// GEOGRAPHY CONTRACT — deterministic terrain height, water mask and region
// zones, implemented IDENTICALLY in JavaScript (GEO.*) and GLSL (GEO_GLSL) so
// the GPU terrain, the CPU (city placement, AGL, ground objects) and the
// airports agree. Integer hashing (uint) is exact in both languages.
//
// Inputs are WORLD coordinates (x east, z south) plus the two region anchors:
//   dep = departure airport origin (x, z)   (app.world.departureOrigin)
//   arr = arrival airport origin (x, z)     (app.world.arrivalOrigin, moves!)
//
// Landmarks (airport-local offsets, x east / z south, metres):
//   Departure: farmland plain; 'Cedar Bay' reservoir lake to the south-east;
//              small town north-east (DEP_TOWN); low hills to the north.
//   Arrival:   ocean gulf to the WEST (coastline ~6.8 km west of the runway
//              centre, i.e. ~5.3 km before the 09 threshold); coastal city to
//              the NORTH (downtown waterfront at ARR_DOWNTOWN), suburbs east;
//              hills / mountains far north-east as a backdrop.
//   En route:  hills, a mountain belt and lakes defined in absolute world coords.
// =============================================================================

export const AIRPORT_FLAT = { xMin: -2600, xMax: 2400, zMin: -1000, zMax: 600, blend: 700 };
export const DEP_TOWN = { x: 4200, z: -5200, radius: 2200 };
export const DEP_LAKE = { x: 6500, z: 5200, rx: 3400, rz: 2100 };
export const ARR_CITY = { xMin: -6200, xMax: 9000, zMin: -17000, zMax: -2600 };   // land zone kept low & flat-ish
export const ARR_DOWNTOWN = { x: -3200, z: -9000, radius: 1800 };
export const ARR_PORT = { x: -5600, z: -4200 };
export const SEA_LEVEL = 0;
export const SEABED = -25;

// ----------------------------------------------------------------------------- JS
function hash2(ix, iz) {
  // PCG-style integer hash of a 2D lattice point -> [0, 1)
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
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1; // [-1, 1]
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

/** Arrival coastline: x (arrival-local) of the shore as a function of arrival-local z. */
export function coastX(lz) {
  return -6800 + 900 * Math.sin(lz / 5200 + 1.3) + 450 * Math.sin(lz / 1900 + 0.4) + 160 * Math.sin(lz / 640 + 2.1);
}

/** 1 = water, 0 = land (smooth over ~60 m at the shore). */
export function waterMask(wx, wz, dep, arr) {
  // arrival gulf
  const lx = wx - arr.x, lz = wz - arr.z;
  let w = 0;
  if (lx > -150000 && lx < 0 && Math.abs(lz) < 95000) {
    const shore = coastX(lz) + 120 * vnoise(lz / 300, 3.7);
    const inGulf = 1 - sstep(shore - 30, shore + 30, lx);
    const westEdge = sstep(-150000, -140000, lx);              // far west shore of the gulf
    const lat = 1 - sstep(80000, 95000, Math.abs(lz));
    w = Math.max(w, inGulf * westEdge * lat);
  }
  // departure reservoir lake
  const dx = (wx - dep.x - DEP_LAKE.x) / DEP_LAKE.rx, dz = (wz - dep.z - DEP_LAKE.z) / DEP_LAKE.rz;
  const r = Math.sqrt(dx * dx + dz * dz) + 0.12 * vnoise((wx - dep.x) / 700, (wz - dep.z) / 700);
  w = Math.max(w, 1 - sstep(0.97, 1.03, r));
  // en-route lakes (absolute world coords), never near the airports
  const ln = vnoise(wx / 23000 + 5.1, wz / 23000 - 2.7);
  const farDep = sstep(25000, 40000, Math.hypot(wx - dep.x, wz - dep.z));
  const farArr = sstep(30000, 45000, Math.hypot(wx - arr.x, wz - arr.z));
  w = Math.max(w, sstep(0.62, 0.66, ln) * farDep * farArr);
  return w;
}

/** Terrain height (m) at world (wx, wz). Water areas return the seabed / lake bed. */
export function terrainHeight(wx, wz, dep, arr) {
  // regional relief
  const hills = fbm(wx / 9000, wz / 9000, 5) * 140 + fbm(wx / 1800, wz / 1800, 3) * 18;
  const belt = sstep(0.15, 0.55, fbm(wx / 60000 + 3.3, wz / 60000 - 1.1, 3) + 0.25);   // mountain belts
  const mountains = ridged(wx / 14000, wz / 14000, 5) * 2600 * belt;
  let h = 60 + hills + mountains;

  // departure region: gentle farmland plain, low hills to the north
  const ddx = wx - dep.x, ddz = wz - dep.z;
  const dDep = Math.hypot(ddx, ddz);
  const depPlain = 1 - sstep(9000, 30000, dDep);
  h = h * (1 - depPlain) + depPlain * (12 + fbm(wx / 4000, wz / 4000, 4) * 22 + sstep(-4000, -16000, ddz) * 90 * (0.6 + 0.4 * vnoise(wx / 5000, 1.7)));

  // arrival region: coastal plain + city, hills to the north-east
  const adx = wx - arr.x, adz = wz - arr.z;
  const dArr = Math.hypot(adx, adz);
  const arrPlain = 1 - sstep(14000, 40000, dArr);
  const backdrop = sstep(-14000, -30000, adz) * sstep(-8000, 6000, adx) * (300 + 500 * Math.max(0, fbm(wx / 7000, wz / 7000, 4)));
  h = h * (1 - arrPlain) + arrPlain * (6 + fbm(wx / 3000, wz / 3000, 4) * 14 + backdrop);
  // keep the city zone low
  const inCity = sstep(ARR_CITY.xMin - 1500, ARR_CITY.xMin, adx) * (1 - sstep(ARR_CITY.xMax, ARR_CITY.xMax + 2500, adx)) *
    sstep(ARR_CITY.zMin - 2500, ARR_CITY.zMin, adz) * (1 - sstep(ARR_CITY.zMax, ARR_CITY.zMax + 1500, adz));
  h = h * (1 - inCity) + inCity * (4 + 10 * sstep(-6000, 6000, adx) + 3 * vnoise(wx / 900, wz / 900));
  // beach: land rises gently from the shore
  const shore = coastX(adz);
  const beach = sstep(shore - 20, shore + 400, adx);
  if (Math.abs(adz) < 95000 && adx > -150000 && adx < shore + 2500) h = h * (0.35 + 0.65 * sstep(shore + 200, shore + 2500, adx)) * beach + (1 - beach) * 0.5;

  // airports: flatten to y = -0.25 (pavement sits at 0..0.05)
  for (const o of [dep, arr]) {
    const ax = wx - o.x, az = wz - o.z, F = AIRPORT_FLAT;
    const fx = Math.max(F.xMin - ax, 0, ax - F.xMax), fz = Math.max(F.zMin - az, 0, az - F.zMax);
    const t = sstep(0, F.blend, Math.hypot(fx, fz));
    h = h * t + (1 - t) * -0.25;
  }

  // water
  const w = waterMask(wx, wz, dep, arr);
  if (w > 0) h = h * (1 - w) + w * SEABED;
  return h;
}

export const GEO = { hash2, vnoise, fbm, ridged, coastX, waterMask, terrainHeight };

// ----------------------------------------------------------------------------- GLSL
// Include in any shader: uniforms uGeoDep (vec2) and uGeoArr (vec2) must be
// provided by the caller (world x/z of the anchors). Functions:
//   float geoHeight(vec2 w), float geoWater(vec2 w), float geoCoastX(float lz)
// For precision, pass world x/z as highp; the noise works on world/scale.
export const GEO_GLSL = /* glsl */`
uniform vec2 uGeoDep;
uniform vec2 uGeoArr;
// smoothstep that (like the JS version) also works with reversed edges
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
  if (lx > -150000.0 && lx < 0.0 && abs(lz) < 95000.0) {
    float shore = geoCoastX(lz) + 120.0 * geoVnoise(vec2(lz / 300.0, 3.7));
    float inGulf = 1.0 - geoSstep(shore - 30.0, shore + 30.0, lx);
    float westEdge = geoSstep(-150000.0, -140000.0, lx);
    float lat = 1.0 - geoSstep(80000.0, 95000.0, abs(lz));
    m = max(m, inGulf * westEdge * lat);
  }
  vec2 dd = (w - uGeoDep - vec2(${DEP_LAKE.x.toFixed(1)}, ${DEP_LAKE.z.toFixed(1)})) / vec2(${DEP_LAKE.rx.toFixed(1)}, ${DEP_LAKE.rz.toFixed(1)});
  float r = length(dd) + 0.12 * geoVnoise((w - uGeoDep) / 700.0);
  m = max(m, 1.0 - geoSstep(0.97, 1.03, r));
  float ln = geoVnoise(w / 23000.0 + vec2(5.1, -2.7));
  float farDep = geoSstep(25000.0, 40000.0, length(w - uGeoDep));
  float farArr = geoSstep(30000.0, 45000.0, length(w - uGeoArr));
  m = max(m, geoSstep(0.62, 0.66, ln) * farDep * farArr);
  return m;
}
float geoHeight(vec2 w) {
  float hills = geoFbm(w / 9000.0, 5) * 140.0 + geoFbm(w / 1800.0, 3) * 18.0;
  float belt = geoSstep(0.15, 0.55, geoFbm(w / 60000.0 + vec2(3.3, -1.1), 3) + 0.25);
  float mountains = geoRidged(w / 14000.0, 5) * 2600.0 * belt;
  float h = 60.0 + hills + mountains;
  vec2 dd = w - uGeoDep;
  float depPlain = 1.0 - geoSstep(9000.0, 30000.0, length(dd));
  h = h * (1.0 - depPlain) + depPlain * (12.0 + geoFbm(w / 4000.0, 4) * 22.0 + geoSstep(-4000.0, -16000.0, dd.y) * 90.0 * (0.6 + 0.4 * geoVnoise(vec2(w.x / 5000.0, 1.7))));
  vec2 ad = w - uGeoArr;
  float arrPlain = 1.0 - geoSstep(14000.0, 40000.0, length(ad));
  float backdrop = geoSstep(-14000.0, -30000.0, ad.y) * geoSstep(-8000.0, 6000.0, ad.x) * (300.0 + 500.0 * max(0.0, geoFbm(w / 7000.0, 4)));
  h = h * (1.0 - arrPlain) + arrPlain * (6.0 + geoFbm(w / 3000.0, 4) * 14.0 + backdrop);
  float inCity = geoSstep(${(ARR_CITY.xMin - 1500).toFixed(1)}, ${ARR_CITY.xMin.toFixed(1)}, ad.x) * (1.0 - geoSstep(${ARR_CITY.xMax.toFixed(1)}, ${(ARR_CITY.xMax + 2500).toFixed(1)}, ad.x)) *
    geoSstep(${(ARR_CITY.zMin - 2500).toFixed(1)}, ${ARR_CITY.zMin.toFixed(1)}, ad.y) * (1.0 - geoSstep(${ARR_CITY.zMax.toFixed(1)}, ${(ARR_CITY.zMax + 1500).toFixed(1)}, ad.y));
  h = h * (1.0 - inCity) + inCity * (4.0 + 10.0 * geoSstep(-6000.0, 6000.0, ad.x) + 3.0 * geoVnoise(w / 900.0));
  float shore = geoCoastX(ad.y);
  float beach = geoSstep(shore - 20.0, shore + 400.0, ad.x);
  if (abs(ad.y) < 95000.0 && ad.x > -150000.0 && ad.x < shore + 2500.0) h = h * (0.35 + 0.65 * geoSstep(shore + 200.0, shore + 2500.0, ad.x)) * beach + (1.0 - beach) * 0.5;
  for (int k = 0; k < 2; k++) {
    vec2 o = k == 0 ? uGeoDep : uGeoArr;
    vec2 a = w - o;
    float fx = max(max(${AIRPORT_FLAT.xMin.toFixed(1)} - a.x, 0.0), a.x - ${AIRPORT_FLAT.xMax.toFixed(1)});
    float fz = max(max(${AIRPORT_FLAT.zMin.toFixed(1)} - a.y, 0.0), a.y - ${AIRPORT_FLAT.zMax.toFixed(1)});
    float t = geoSstep(0.0, ${AIRPORT_FLAT.blend.toFixed(1)}, length(vec2(fx, fz)));
    h = h * t + (1.0 - t) * -0.25;
  }
  float wm = geoWater(w);
  h = mix(h, ${SEABED.toFixed(1)}, wm);
  return h;
}
`;
