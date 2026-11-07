import { GEO_GLSL, AIRPORT_FLAT, DEP_TOWN, DEP_LAKE, ARR_CITY, SEABED } from '../geo.js';
import { SKY_COMMON_GLSL } from './sky.js';

// =============================================================================
// Terrain shaders: height bake, clipmap vertex shader (incl. per-vertex
// atmosphere terms), land-cover + water fragment shader with physically based
// aerial perspective.
// =============================================================================

const f1 = (v) => Number(v).toFixed(1);

// Land-only variant of geoHeight (same code, minus the final water mix), derived
// from the GEO_GLSL source so it can never drift from the contract.
function makeLandHeightGLSL() {
  const i = GEO_GLSL.indexOf('float geoHeight(vec2 w) {');
  if (i < 0) return '#define geoHeightLand geoHeight\n';
  const fn = GEO_GLSL.slice(i).replace('float geoHeight(vec2 w) {', 'float geoHeightLand(vec2 w) {');
  const stripped = fn.replace(/float wm = geoWater\(w\);\s*h = mix\(h, [-\d.]+, wm\);/, '');
  return stripped === fn ? '#define geoHeightLand geoHeight\n' : stripped;
}

/**
 * Bake pass: one texel per lattice vertex of a level ->
 *   (visual height, visual water mask, mountain-belt factor, curvature).
 * En-route lakes (geo.js) are only kept in lowlands: in hills / mountains they
 * would be sea-level pits with kilometre-high walls.
 */
export const BAKE_FRAG = /* glsl */`
precision highp float;
${GEO_GLSL}
${makeLandHeightGLSL()}
uniform vec2 uBakeOrigin;   // world xz of lattice (0,0) of the level (exact multiple of the cell size)
uniform float uBakeScale;   // cell size (m)
uniform float uBlockX0;     // first texel column of the level block
uniform float uApron;
void main() {
  vec2 p = floor(gl_FragCoord.xy);
  vec2 ij = vec2(p.x - uBlockX0 - uApron, p.y - uApron);
  vec2 w = uBakeOrigin + ij * uBakeScale;
  float hl = geoHeightLand(w);
  float m = geoWater(w);
  float ln = geoVnoise(w / 23000.0 + vec2(5.1, -2.7));
  float wEn = geoSstep(0.62, 0.66, ln) * geoSstep(25000.0, 40000.0, length(w - uGeoDep)) * geoSstep(30000.0, 45000.0, length(w - uGeoArr));
  float keep = 1.0 - geoSstep(140.0, 260.0, hl);
  float wv = (wEn > 0.0 && wEn >= m - 1e-4) ? wEn * keep : m;
  float h = mix(hl, ${SEABED.toFixed(1)}, wv);
  float belt = geoSstep(0.15, 0.55, geoFbm(w / 60000.0 + vec2(3.3, -1.1), 3) + 0.25);
  // world-space curvature at ~350 m scale (+ valley / - ridge), metres of relief per 350 m
  const float CD = 350.0;
  float lap = geoHeightLand(w + vec2(CD, 0.0)) + geoHeightLand(w - vec2(CD, 0.0)) + geoHeightLand(w + vec2(0.0, CD)) + geoHeightLand(w - vec2(0.0, CD)) - 4.0 * hl;
  gl_FragColor = vec4(h, wv, belt, lap * 0.25);
}`;

export const BAKE_VERT = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export function terrainVertexShader(cfg) {
  return /* glsl */`
precision highp float;
precision highp int;
precision highp sampler2D;
#define NL ${cfg.levels}
#define HALF ${f1(cfg.half)}
#define MORPHW ${f1(cfg.morph)}
#define STRIDE ${cfg.stride}
#define APRON ${cfg.apron}
${SKY_COMMON_GLSL}
uniform highp sampler2D uHeights;
uniform vec2 uLevelBase[NL];
uniform float uS0;
uniform vec3 uCamPos;        // camera relative to the reference point (x, altitude MSL, z)
attribute float aLevel;      // per-instance clipmap level
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vView;
centroid varying vec3 vData;
centroid varying float vCurv;         // + valley / - ridge (m of relief at 350 m scale)
centroid varying vec3 vOdd;           // optical depth camera -> vertex
centroid varying vec3 vOdD;           // optical depth camera -> sea level (or top of atmosphere) along the same ray
centroid varying vec3 vNight;         // moonlit / airglow sky towards the vertex
centroid varying vec3 vSunT;          // sun irradiance reaching the vertex (transmittance, Earth shadow)

vec4 hf(ivec2 t) { return texelFetch(uHeights, t, 0); }

void main() {
  int L = int(aLevel + 0.5);
  float s = uS0 * exp2(float(L));
  ivec2 g = ivec2(position.xz + 0.5);
  vec2 local = uLevelBase[L] + vec2(g) * s;
  vec2 dc = local - uCamPos.xz;
  float dCheb = max(abs(dc.x), abs(dc.y)) / s;
  float alpha = (L < NL - 1) ? clamp((dCheb - (HALF - 2.0 - MORPHW)) / MORPHW, 0.0, 1.0) : 0.0;
  ivec2 tb = ivec2(L * STRIDE + APRON, APRON) + g;
  vec4 c = hf(tb);
  vec4 xm = hf(tb + ivec2(-1, 0)), xp = hf(tb + ivec2(1, 0));
  vec4 zm = hf(tb + ivec2(0, -1)), zp = hf(tb + ivec2(0, 1));
  vec4 cc = c;
  bool ox = (g.x & 1) == 1, oz = (g.y & 1) == 1;
  if (ox && oz) cc = 0.5 * (hf(tb + ivec2(-1, -1)) + hf(tb + ivec2(1, 1)));
  else if (ox) cc = 0.5 * (xm + xp);
  else if (oz) cc = 0.5 * (zm + zp);
  vec4 d = mix(c, cc, alpha);
  vec3 nF = normalize(vec3(xm.r - xp.r, 2.0 * s, zm.r - zp.r));
  float x2m = hf(tb + ivec2(-2, 0)).r, x2p = hf(tb + ivec2(2, 0)).r;
  float z2m = hf(tb + ivec2(0, -2)).r, z2p = hf(tb + ivec2(0, 2)).r;
  vec3 nC = normalize(vec3(x2m - x2p, 4.0 * s, z2m - z2p));
  vec3 n = normalize(mix(nF, nC, alpha));
  float h = d.r;
  float drop = dot(dc, dc) / 12720000.0;      // Earth curvature (R = 6360 km) relative to the camera
  vec3 pos = vec3(local.x, h - drop, local.y);
  vLocal = vec3(local.x, h, local.y);
  vNormal = n;
  vec3 V = pos - uCamPos;
  vView = V;
  vData = vec3(d.g, d.b, alpha);
  vCurv = d.a * (1.0 - smoothstep(300.0, 1400.0, s));
  // --- atmosphere (smooth along triangles -> per vertex)
  float dist = length(V);
  vec3 dir = V / max(dist, 1e-3);
  float mu = dir.y;
  bool ground = atmRayHitsGround(uAtmCamR, uAtmCamH, mu);
  float D = atmRayEnd(uAtmCamR, uAtmCamH, mu, ground);
  vOdD = ground ? atmPathOD(uAtmCamR, uAtmCamH, mu, D) : atmOD(uAtmCamR, mu);
  vOdd = atmPathOD(uAtmCamR, uAtmCamH, mu, min(dist * 0.001, D));
  vNight = atmNightSky(dir);
  vSunT = uAtmSunIllum * atmSunTransmittance(max(h, 0.0) * 0.001, uAtmSunDir.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;
}

export function terrainFragmentShader(cfg) {
  return /* glsl */`
precision highp float;
precision highp int;
#define DETAIL ${cfg.detail | 0}
${SKY_COMMON_GLSL}
${GEO_GLSL}
uniform vec3 uCamPos;
uniform vec2 uRefWorld;       // world xz of the reference point (float32, for large-scale masks)
uniform vec2 uRefMod;         // reference point modulo 16384 m (precise detail coordinates)
uniform vec2 uAnchor;         // (ref - refMod) / 1024 : integer section offset
uniform float uTime;
uniform vec3 uSkyIrrUp;       // sky irradiance on an up-facing surface at sea level
uniform vec3 uSkyIrrDown;     // irradiance on a down-facing surface (ground bounce)
uniform vec3 uMoonIrr;        // moon irradiance (normal incidence)
uniform sampler2D tNoise;
uniform sampler2D tWaves;
uniform sampler2D tRelief;
uniform sampler2D tGrass;
uniform sampler2D tGrassN;
uniform sampler2D tDirt;
uniform sampler2D tDirtN;
uniform sampler2D tRock;
uniform sampler2D tRockN;
uniform sampler2D tSand;
uniform sampler2D tMeadow;

varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vView;
centroid varying vec3 vData;
centroid varying float vCurv;
centroid varying vec3 vOdd;
centroid varying vec3 vOdD;
centroid varying vec3 vNight;
centroid varying vec3 vSunT;

#define PI 3.14159265359
const vec3 MEAN_GRASS = vec3(0.1269, 0.1612, 0.0343);
const vec3 MEAN_DIRT = vec3(0.2029, 0.1441, 0.0854);
const vec3 MEAN_ROCK = vec3(0.084, 0.0784, 0.0656);
const vec3 MEAN_SAND = vec3(0.3331, 0.2588, 0.1562);
const vec3 MEAN_MEADOW = vec3(0.3305, 0.3061, 0.1113);

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec4 noiseT(vec2 uv) { return texture2D(tNoise, uv) * 2.0 - 1.0; }
float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
// anti-aliased band: distance d from a line of width w, pixel footprint pw (energy preserving when sub-pixel)
float lineAA(float d, float w, float pw) {
  float ww = max(w, pw);
  return (1.0 - sstep(ww * 0.5 - pw * 0.5, ww * 0.5 + pw * 0.5, d)) * min(1.0, w / pw);
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// --------------------------------------------------------------------------- palette (linear albedo)
const vec3 C_CORN = vec3(0.034, 0.072, 0.021);
const vec3 C_SOY = vec3(0.052, 0.098, 0.029);
const vec3 C_ALFALFA = vec3(0.046, 0.094, 0.032);
const vec3 C_WHEAT = vec3(0.225, 0.180, 0.084);
const vec3 C_STUBBLE = vec3(0.255, 0.222, 0.150);
const vec3 C_SOIL = vec3(0.118, 0.088, 0.056);
const vec3 C_SOILD = vec3(0.082, 0.064, 0.044);
const vec3 C_PASTURE = vec3(0.070, 0.094, 0.040);
const vec3 C_HAY = vec3(0.140, 0.132, 0.068);
const vec3 C_HEDGE = vec3(0.020, 0.036, 0.016);
const vec3 C_ROAD = vec3(0.17, 0.158, 0.14);
const vec3 C_DRYGRASS = vec3(0.235, 0.185, 0.090);
const vec3 C_FARM_MEAN = vec3(0.085, 0.100, 0.046);   // regional average (far field)
const vec3 C_DRY_MEAN = vec3(0.150, 0.130, 0.070);

// crop albedo + row spacing for a field (region 0 humid farmland, 1 dry Mediterranean)
vec3 cropColor(float r, float region, out float rows, out float soilKind) {
  rows = 0.0; soilKind = 0.0;
  if (region > 0.5) {
    if (r < 0.34) return C_DRYGRASS * (0.88 + 0.24 * fract(r * 37.0));
    if (r < 0.46) { rows = 0.8; return C_SOY; }                          // irrigated rows
    if (r < 0.60) { rows = 4.5; return mix(C_HEDGE, C_PASTURE, 0.55); }  // orchards / vineyards
    if (r < 0.74) { soilKind = 1.0; return C_STUBBLE; }
    if (r < 0.86) { soilKind = 1.0; rows = 1.2; return C_SOIL * 1.2; }
    return C_HAY;
  }
  if (r < 0.22) { rows = 0.76; return C_CORN; }
  if (r < 0.40) { rows = 0.76; return C_SOY; }
  if (r < 0.52) return C_WHEAT * (0.9 + 0.2 * fract(r * 53.0));
  if (r < 0.60) { soilKind = 1.0; return C_STUBBLE; }
  if (r < 0.66) { rows = 1.1; soilKind = 1.0; return C_SOIL; }
  if (r < 0.70) { rows = 1.1; soilKind = 1.0; return C_SOILD; }
  if (r < 0.84) return C_PASTURE;
  if (r < 0.93) return C_ALFALFA;
  return C_HAY;
}

// patchwork of fields on a 1024 m section grid (US-style), roads on the section lines
vec3 farmland(vec2 wm, float pw, float region, vec4 nM, vec4 nK, vec4 nF, vec4 nH, inout float soilMix) {
  vec2 warp = nM.xy * 55.0 + nK.zw * (4.0 + 10.0 * region);
  vec2 fp = wm + warp;
  vec2 secF = fp / 1024.0;
  vec2 secI = floor(secF);
  vec2 sf = secF - secI;
  vec2 sid = secI + uAnchor;
  float hs = hash12(sid * 1.37 + 0.11);
  vec2 ff; vec2 fsz; vec2 fid; float pivot = 0.0; vec2 pc = sf - 0.5;
  if (hs < 0.28) {
    vec2 q = floor(sf * 2.0); ff = fract(sf * 2.0); fsz = vec2(512.0); fid = sid * 4.0 + q;
  } else if (hs < 0.50) {
    float n = 2.0 + floor(hash12(sid + 3.1) * 5.0);
    float q = floor(sf.x * n); ff = vec2(fract(sf.x * n), sf.y); fsz = vec2(1024.0 / n, 1024.0); fid = sid * 8.0 + vec2(q, 7.0);
  } else if (hs < 0.72) {
    float n = 2.0 + floor(hash12(sid + 5.7) * 5.0);
    float q = floor(sf.y * n); ff = vec2(sf.x, fract(sf.y * n)); fsz = vec2(1024.0, 1024.0 / n); fid = sid * 8.0 + vec2(5.0, q);
  } else if (hs < 0.78 && region < 0.5) {
    pivot = 1.0; ff = sf; fsz = vec2(1024.0); fid = sid * 3.0;
  } else {
    float sx = 0.25 + 0.5 * hash12(sid + 9.3);
    float side = step(sx, sf.x);
    float sz = 0.25 + 0.5 * hash12(sid + side * 4.0 + 1.9);
    float top = step(sz, sf.y);
    vec2 lo = vec2(side * sx, top * sz), hi = vec2(mix(sx, 1.0, side), mix(sz, 1.0, top));
    ff = (sf - lo) / (hi - lo); fsz = (hi - lo) * 1024.0; fid = sid * 5.0 + vec2(side, top) * 2.0 + 1.0;
  }
  float rnd = hash12(fid + 0.37);
  float rows, soilK;
  vec3 col = cropColor(rnd, region, rows, soilK);
  col *= 0.86 + 0.26 * hash12(fid + 5.1);                              // per-field tone
  if (pivot > 0.5) {
    float rr = length(pc) * 1024.0;
    float inside = 1.0 - sstep(498.0 - pw, 498.0 + pw, rr);
    float rc = hash12(sid + 2.2);
    vec3 disc = rc < 0.5 ? C_CORN * 1.1 : (rc < 0.75 ? C_ALFALFA : C_WHEAT);
    col = mix(mix(C_DRYGRASS * 0.75, C_SOIL, hash12(sid + 7.0)), disc, inside);
#if DETAIL > 0
    float track = lineAA(abs(fract(rr / 54.0 + 0.5) - 0.5) * 54.0, 2.5, pw) * inside;
    col = mix(col, C_SOIL * 0.9, track * 0.5);
#endif
    rows = 0.0; soilK = (1.0 - inside) * 0.5;
  }
  // within-field variation: soil moisture / growth (large) + patches (small)
  col *= 0.84 + 0.18 * nK.x + 0.10 * nK.y + 0.07 * nF.x + 0.05 * nK.w;
  vec2 fm = ff * fsz;
#if DETAIL > 0
  {
    // implement passes (sprayer / harvester widths) give the "corduroy" look from altitude
    float passW = 9.0 + 9.0 * floor(hash12(fid + 8.8) * 3.0);
    float coord = (fsz.x > fsz.y) ? fm.y : fm.x;
    float pass = sstep(-0.3, 0.3, sin(coord * PI / passW)) * 2.0 - 1.0;
    col *= 1.0 + pass * (0.035 + 0.04 * soilK) * (1.0 - sstep(passW * 0.35, passW * 0.9, pw));
  }
#endif
#if DETAIL > 0
  if (rows > 0.0 && pw < rows * 0.7) {
    float coord = (fsz.x > fsz.y) ? fm.y : fm.x;
    float rowAmp = 1.0 - sstep(rows * 0.3, rows * 0.7, pw);
    float rw = abs(fract(coord / rows) - 0.5) * 2.0;
    col = mix(col, soilK > 0.5 ? col * 0.68 : mix(col, C_SOIL, 0.5), rowAmp * sstep(0.35, 0.9, rw) * 0.75);
  }
  if (rnd >= 0.40 && rnd < 0.52 && region < 0.5) {
    float coord = (fsz.x > fsz.y) ? fm.y : fm.x;
    col = mix(col, col * 0.72, lineAA(abs(fract(coord / 24.0) - 0.5) * 24.0, 0.6, pw) * 0.6);   // tram lines
  }
#endif
  soilMix = max(soilMix, soilK);
#if DETAIL > 0
  // margins: grass strip, hedgerows / tree lines on some field edges
  float e = min(min(fm.x, fsz.x - fm.x), min(fm.y, fsz.y - fm.y));
  col = mix(col, C_PASTURE, lineAA(e, (3.0 + 4.0 * hash12(fid + 4.4)) * 2.0, pw) * 0.75);
  if (hash12(fid + 11.0) < 0.40 + 0.3 * region) {
    float clump = 0.55 + 0.45 * nH.w;
    col = mix(col, C_HEDGE * (0.75 + 0.5 * clump), lineAA(e, 7.0 * clump, pw) * 0.9);
  }
#endif
  // section-line roads (gravel, some paved)
  float es = min(min(sf.x, 1.0 - sf.x), min(sf.y, 1.0 - sf.y)) * 1024.0;
  float roadP = hash12(floor(secF + 0.5) + 17.0);
  col = mix(col, roadP < 0.3 ? C_ROAD * 0.5 : C_ROAD * 1.15, lineAA(es, roadP < 0.3 ? 8.0 : 6.0, pw) * (region > 0.5 ? 0.45 : 0.9));
  // farmsteads: tree clumps + yard near some section corners
#if DETAIL > 0
  if (hash12(sid + 23.0) < 0.45) {
    vec2 fc = (sf - (0.05 + 0.12 * vec2(hash12(sid + 21.0), hash12(sid + 22.0)))) * 1024.0;
    float fsd = length(fc * vec2(1.0, 1.25));
    // shelter belt on the windward side + scattered yard trees (irregular, not a ring)
    float belt2 = (1.0 - sstep(8.0, 14.0, abs(fc.x + 38.0))) * (1.0 - sstep(40.0, 70.0, abs(fc.y)));
    float yardTrees = (1.0 - sstep(30.0, 62.0, fsd + nF.x * 22.0)) * sstep(0.05, 0.45, nH.x * 0.6 + nF.y * 0.5);
    float yard = (1.0 - sstep(16.0, 30.0, length(fc - vec2(8.0, 6.0)) + nF.z * 6.0));
    col = mix(col, C_HEDGE * 1.15, clamp(max(belt2, yardTrees), 0.0, 1.0) * 0.95);
    col = mix(col, vec3(0.15, 0.142, 0.128), yard * 0.65 * (1.0 - yardTrees));
  }
#endif
  return col;
}

// --------------------------------------------------------------------------- forests
vec3 forestColor(float pw, float region, float conifer, vec4 nF, vec4 nB) {
  vec3 dec = mix(vec3(0.034, 0.060, 0.022), vec3(0.048, 0.074, 0.027), nF.z * 0.5 + 0.5);
  vec3 con = mix(vec3(0.020, 0.034, 0.016), vec3(0.030, 0.045, 0.021), nF.z * 0.5 + 0.5);
  vec3 oak = mix(vec3(0.030, 0.038, 0.019), vec3(0.046, 0.050, 0.025), nF.y * 0.5 + 0.5);
  vec3 c = mix(mix(dec, con, conifer), oak, region);
#if DETAIL > 0
  float crown = nF.w * 0.6 + nB.z * 0.4;
  c *= 1.0 + crown * 0.5 * (1.0 - sstep(1.5, 6.0, pw));
#endif
  return c;
}

// Distance (m) from the VISUAL shoreline into the water (negative on land). The
// geo.js masks blend the height to the sea bed over a band; the rendered water
// edge is where the blended height crosses 0 (mask ~0.02), hence the offsets.
float shoreDistance(vec2 w, out float shelf) {
  shelf = 0.04;
  vec2 a = w - uGeoArr;
  float sd = -1e6;
  if (abs(a.y) < 95000.0 && a.x > -150000.0 && a.x < 6000.0) {
    float shore = geoCoastX(a.y) + 120.0 * geoVnoise(vec2(a.y / 300.0, 3.7));
    sd = shore - a.x + 26.0;
    shelf = 0.022;
  }
  vec2 dl = (w - uGeoDep - vec2(${f1(DEP_LAKE.x)}, ${f1(DEP_LAKE.z)})) / vec2(${f1(DEP_LAKE.rx)}, ${f1(DEP_LAKE.rz)});
  float r = length(dl) + 0.12 * geoVnoise((w - uGeoDep) / 700.0);
  float sdl = (1.024 - r) * ${f1(Math.min(DEP_LAKE.rx, DEP_LAKE.rz))};
  if (sdl > sd) { sd = sdl; shelf = 0.045; }
  float ln = geoVnoise(w / 23000.0 + vec2(5.1, -2.7));
  float sde = (ln - 0.624) / 0.04 * 350.0;
  if (sde > sd) { sd = sde; shelf = 0.05; }
  return sd;
}

// --------------------------------------------------------------------------- land
vec3 landAlbedo(vec2 wa, vec2 wm, float h, vec3 N, float dist, float pw, float belt, inout vec3 dn, inout float dnK) {
  vec2 dD = wa - uGeoDep, dA = wa - uGeoArr;
  float lenD = length(dD), lenA = length(dA);
  float depPlain = 1.0 - sstep(9000.0, 30000.0, lenD);
  float region = 1.0 - sstep(16000.0, 60000.0, lenA);   // 0 humid farmland, 1 dry Mediterranean (arrival coast)
  float slope = 1.0 - N.y;
  vec4 nM = noiseT(wm / 16384.0);
  vec4 nK = noiseT(wm / 2048.0);
  vec4 nF = noiseT(wm / 256.0);
#if DETAIL > 0
  vec4 nH = noiseT(wm / 128.0);
  vec4 nB = noiseT(wm / 64.0);
#else
  vec4 nH = nF.yzwx, nB = nF.wzyx;
#endif
  vec4 nBig = noiseT(wa / 41000.0 + 0.37);              // absolute, very large scale (breaks the 16 km period)
  float big = nBig.x * 0.65 + nBig.y * 0.35;
#if DETAIL > 0
  float nearF = 1.0 - sstep(120.0, 700.0, dist);
#else
  float nearF = 1.0 - sstep(60.0, 260.0, dist);
#endif
  float soilMix = 0.0;
  float farF = sstep(25.0, 140.0, pw);                  // field pattern no longer resolvable

  // terrain shape: valleys (+) are moister / sheltered and get cleared for farming, ridges (-) stay wooded / bare
  float valley = clamp(vCurv / 25.0, -1.0, 1.0);
  float southFace = clamp(N.z * 3.0, -1.0, 1.0);          // +Z = south: sunny, drier

  // ---- farmland vs natural cover
  float flatness = 1.0 - sstep(0.04, 0.15, slope + nK.x * 0.02 - max(valley, 0.0) * 0.03);
  float lowland = 1.0 - sstep(500.0, 1100.0, h + nM.y * 150.0);
  float agri = flatness * lowland * (1.0 - belt * 0.55) * sstep(-0.45, 0.2, big + nM.x * 0.35 + 0.2 + max(valley, 0.0) * 0.4);
  agri = max(agri, depPlain * flatness * 0.97);
  // no crops right to the water: grass / reeds / trees within ~60-200 m of lakes and the sea
#if DETAIL > 0
  float shelfL;
  float sdL = shoreDistance(wa, shelfL);
  float shoreBuf = sstep(-(60.0 + 140.0 * (nK.x * 0.5 + 0.5)), -15.0, sdL);
#else
  float shoreBuf = sstep(0.0, 0.03, vData.x);
#endif
  agri *= 1.0 - shoreBuf;
  vec3 farmMean = mix(C_FARM_MEAN, C_DRY_MEAN, region) * (0.85 + 0.25 * nK.x + 0.12 * nM.z);
  vec3 col = farmMean;
  if (farF < 0.999 && agri > 0.001) col = mix(farmland(wm, pw, region, nM, nK, nF, nH, soilMix), farmMean, farF);

  // natural cover: meadow / dry grass / forest by climate, elevation, slope, aspect and shape
  float dry = clamp(region * 1.1 + nM.y * 0.25 + southFace * 0.12 * slope * 6.0 - valley * 0.25 + sstep(1200.0, 1800.0, h) * 0.2, 0.0, 1.0);
  vec3 grassNat = mix(vec3(0.058, 0.080, 0.034), C_DRYGRASS * 0.9, sstep(0.2, 0.8, dry));
  grassNat *= 0.84 + 0.12 * nK.z + 0.1 * (nF.y * 0.5 + 0.5) + 0.08 * nM.w;
  grassNat = mix(grassNat, vec3(0.12, 0.11, 0.065), sstep(0.2, 0.8, nK.x * 0.6 + nM.z * 0.5 + southFace * 0.3) * 0.45 * (1.0 - region));
  float fN = nM.x * 0.38 + nM.y * 0.25 + big * 0.3 + nM.z * 0.18 + nK.x * 0.16 + nK.y * 0.12 + nK.w * 0.05;
  float fP = fN + slope * 2.2 + max(-valley, 0.0) * 0.15 - max(valley, 0.0) * 0.3 + belt * 0.1 + sstep(250.0, 900.0, h) * 0.15
           - 0.13 - depPlain * 0.55 - region * 0.4 - dry * 0.25;
  float treeLine = 1.0 - sstep(2050.0, 2350.0, h + nK.z * 120.0 - southFace * 90.0);
  // ragged, patchy edges: open woodland where the coverage is partial
  float forestP = sstep(-0.03, 0.1, fP + (nK.w * 0.5 + nF.x * 0.5) * 0.07) * treeLine;
  forestP *= mix(1.0, 0.55 + 0.45 * sstep(-0.2, 0.3, nK.w + nF.y * 0.4), sstep(0.95, 0.4, forestP));
  float conifer = sstep(500.0, 1100.0, h + nK.w * 150.0);
  vec3 forest = forestColor(pw, region, conifer, nF, nB);
  vec3 natural = mix(grassNat, forest, forestP);
  // isolated trees / shrubs in open grassland (dark specks, close range only)
  float shrub = sstep(0.55, 0.75, nH.w + nF.z * 0.3) * (1.0 - sstep(1.0, 4.0, pw)) * (0.25 + 0.6 * region);
  natural = mix(natural, forest * 0.9, shrub * (1.0 - forestP));
  col = mix(natural, col, agri);

  // riparian tree belts along meandering creeks + woodlots in the farmland
  float creekN = nM.x + 0.18 * nM.w + 0.25 * valley;
  float cw = fwidth(creekN);
  float creek = 1.0 - sstep(0.03 - cw, 0.03 + cw, abs(creekN - 0.1));
  float woodlot = sstep(0.5, 0.58, nM.z * 0.7 + nM.w * 0.3 + nK.y * 0.08) * (1.0 - region * 0.6);
  col = mix(col, forestColor(pw, region, 0.0, nF, nB) * 1.05, max(creek * (0.6 + 0.4 * nK.w), woodlot) * agri * (1.0 - depPlain * 0.3));

  // ---- mountains: alpine meadow, scree, rock (steep / ridges), snow (gullies, north faces)
  vec3 rock = mix(vec3(0.105, 0.098, 0.088), vec3(0.15, 0.14, 0.125), nK.x * 0.5 + 0.5);
  rock = mix(rock, vec3(0.135, 0.105, 0.078), sstep(0.2, 0.7, nM.w) * 0.45);    // iron-stained strata
  float alpine = sstep(1950.0, 2350.0, h + nK.z * 140.0) * (1.0 - agri);
  vec3 alpineCol = mix(vec3(0.095, 0.10, 0.058), vec3(0.14, 0.13, 0.10), sstep(-0.3, 0.6, nK.w + southFace * 0.3));
  col = mix(col, alpineCol, alpine * (1.0 - forestP * 0.5));
  float rockP = sstep(0.13, 0.30, slope + max(-valley, 0.0) * 0.05 + nK.y * 0.04) * (0.55 + 0.45 * sstep(400.0, 1400.0, h));
  rockP = max(rockP, sstep(2150.0, 2500.0, h + nK.x * 150.0 - valley * 120.0) * 0.85);
  rockP *= 1.0 - agri * 0.9;
  col = mix(col, rock, clamp(rockP, 0.0, 1.0));
  // mid-summer at 36 N: only lingering snow fields on high north faces and in gullies
  float snowLine = 2250.0 + nM.y * 120.0 + nK.x * 90.0 + southFace * 260.0 - valley * 200.0;
  float snow = sstep(snowLine, snowLine + 220.0, h + nF.y * 30.0) * (1.0 - sstep(0.30, 0.55, slope));
  snow *= sstep(0.05, 0.45, nK.y * 0.5 + nK.z * 0.3 + valley * 0.6 - southFace * 0.5 + sstep(2450.0, 2700.0, h));
  col = mix(col, vec3(0.74, 0.76, 0.80) * (0.92 + 0.08 * nF.z), snow);

  // ---- arrival coast: beach sand + dune scrub
  float lx = dA.x, lz = dA.y;
  if (abs(lz) < 95000.0 && lx > -150000.0 && lx < 4000.0) {
    float shore = geoCoastX(lz) + 120.0 * geoVnoise(vec2(lz / 300.0, 3.7));
    float landD = lx - shore;
    float sandW = 70.0 + 45.0 * nK.x + 25.0 * nF.w;
    float beach = 1.0 - sstep(sandW * 0.8, sandW, landD);
    vec3 sand = vec3(0.40, 0.335, 0.225) * (0.94 + 0.1 * nF.x);
    sand = mix(sand * 0.6, sand, sstep(-10.0, 16.0, landD));            // wet sand at the waterline
    col = mix(col, mix(C_DRYGRASS, vec3(0.055, 0.065, 0.033), sstep(0.0, 0.6, nF.z)), (1.0 - beach) * (1.0 - sstep(sandW, sandW + 160.0, landD)) * 0.6);
    col = mix(col, sand, beach);
    soilMix *= 1.0 - beach;
    rockP *= 1.0 - beach;
  }

  // ---- towns & city ground (buildings come from the city module)
  float town = 1.0 - sstep(0.7, 1.05, length(dD - vec2(${f1(DEP_TOWN.x)}, ${f1(DEP_TOWN.z)})) / ${f1(DEP_TOWN.radius)} + nK.x * 0.12);
  float city = sstep(${f1(ARR_CITY.xMin)}, ${f1(ARR_CITY.xMin + 800)}, dA.x + nK.y * 300.0) * (1.0 - sstep(${f1(ARR_CITY.xMax - 1500)}, ${f1(ARR_CITY.xMax)}, dA.x + nK.z * 400.0))
    * sstep(${f1(ARR_CITY.zMin)}, ${f1(ARR_CITY.zMin + 1500)}, dA.y + nK.w * 400.0) * (1.0 - sstep(${f1(ARR_CITY.zMax - 600)}, ${f1(ARR_CITY.zMax)}, dA.y + nK.x * 300.0));
  float urb = max(town, city);
  if (urb > 0.001) {
    vec2 bp = wm / 128.0;
    vec2 bi = floor(bp) + uAnchor * 8.0, bf = fract(bp);
    float hb = hash12(bi + 3.3);
    vec3 lot = hb < 0.3 ? vec3(0.13, 0.126, 0.118) : (hb < 0.55 ? vec3(0.085, 0.084, 0.082) : (hb < 0.85 ? vec3(0.05, 0.072, 0.032) : vec3(0.10, 0.095, 0.08)));
    lot *= 0.9 + 0.2 * (nF.z * 0.5 + 0.5);
    lot = mix(lot, vec3(0.08, 0.085, 0.065), sstep(4.0, 30.0, pw));
    float street = lineAA(min(min(bf.x, 1.0 - bf.x), min(bf.y, 1.0 - bf.y)) * 128.0, 14.0, pw);
    vec3 ug = mix(lot, vec3(0.075, 0.073, 0.07), street);
    ug = mix(ug, mix(ug, vec3(0.05, 0.075, 0.035), 0.45), sstep(0.3, 0.9, 1.0 - urb + nF.y * 0.2));
    col = mix(col, ug, urb * 0.92);
    soilMix *= 1.0 - urb;
  }

  // ---- airports: mown grass between the pavement (pavement is drawn by the airport module)
  float apt = 0.0;
  for (int k = 0; k < 2; k++) {
    vec2 a = k == 0 ? dD : dA;
    float fx = max(max(${f1(AIRPORT_FLAT.xMin)} - a.x, 0.0), a.x - ${f1(AIRPORT_FLAT.xMax)});
    float fz = max(max(${f1(AIRPORT_FLAT.zMin)} - a.y, 0.0), a.y - ${f1(AIRPORT_FLAT.zMax)});
    apt = max(apt, 1.0 - sstep(60.0, 260.0, length(vec2(fx, fz)) + nK.x * 60.0));
  }
  if (apt > 0.001) {
    vec3 g = mix(vec3(0.066, 0.088, 0.032), vec3(0.085, 0.096, 0.040), region) * (0.86 + 0.16 * (nK.y * 0.5 + 0.5) + 0.08 * nF.w + 0.06 * nK.x);
    g = mix(g, vec3(0.14, 0.13, 0.068), sstep(0.15, 0.75, nK.w * 0.55 + nF.z * 0.45 + nM.w * 0.3 + region * 0.3) * 0.55);   // dry, yellowed patches
    g = mix(g, vec3(0.042, 0.068, 0.024), sstep(0.45, 0.8, nH.x * 0.6 + nF.y * 0.4) * 0.35);                              // lush / clover
    g = mix(g, vec3(0.12, 0.10, 0.07), sstep(0.72, 0.9, nF.x * 0.6 + nH.z * 0.4) * 0.3 * (1.0 - sstep(1.0, 5.0, pw)));  // bare spots
    // faint gang-mower passes parallel to the runway (soft, slightly irregular)
    float stripe = sstep(-0.35, 0.35, sin(wm.y * PI / 14.0 + nK.x * 1.5)) * 2.0 - 1.0;
    g *= 1.0 + 0.028 * stripe * (1.0 - sstep(2.0, 6.0, pw));
    col = mix(col, g, apt);
    soilMix *= 1.0 - apt;
  }

  // ---- near-field texture detail (normalised so the macro colour is preserved)
  if (nearF > 0.001) {
#if DETAIL > 0
    vec3 tg = (texture2D(tGrass, wm / 4.0).rgb * 0.6 + texture2D(tGrass, wm.yx / 16.0).rgb * 0.4) / MEAN_GRASS;
    vec3 td = (texture2D(tDirt, wm / 4.0).rgb * 0.65 + texture2D(tDirt, wm.yx / 16.0).rgb * 0.35) / MEAN_DIRT;
    vec3 tm = texture2D(tMeadow, wm / 8.0).rgb / MEAN_MEADOW;
#else
    vec3 tg = texture2D(tGrass, wm / 4.0).rgb / MEAN_GRASS;
    vec3 td = texture2D(tDirt, wm / 4.0).rgb / MEAN_DIRT;
    vec3 tm = tg;
#endif
    float dryish = sstep(0.12, 0.25, lum(col)) * (1.0 - soilMix);
    vec3 tex = mix(mix(tg, tm, dryish * 0.7), td, soilMix);
    if (rockP > 0.01) tex = mix(tex, texture2D(tRock, wm / 16.0).rgb / MEAN_ROCK, rockP);
    col *= mix(vec3(1.0), clamp(tex, 0.2, 3.0), nearF);
#if DETAIL > 0
    vec3 ng = texture2D(tGrassN, wm / 4.0).xyz * 2.0 - 1.0;
    vec3 nd = texture2D(tDirtN, wm / 4.0).xyz * 2.0 - 1.0;
    dn = mix(ng, nd, soilMix);
    if (rockP > 0.01) dn = mix(dn, texture2D(tRockN, wm / 16.0).xyz * 2.0 - 1.0, rockP);
    dnK = nearF;
#endif
  }
  return col;
}

// --------------------------------------------------------------------------- water
vec3 waveNormal(vec2 p, float pw, float rough, out float sig2) {
  float t = uTime;
  // several octaves in different directions (swizzles / sign flips keep the 16384 m period exact)
  vec2 a0 = texture2D(tWaves, p / 512.0 + t * vec2(0.0009, 0.0006)).rg * 2.0 - 1.0;
#if DETAIL > 0
  vec2 a1 = texture2D(tWaves, -p.yx / 256.0 + t * vec2(0.0016, -0.0011)).rg * 2.0 - 1.0;
  vec2 b0 = texture2D(tWaves, vec2(-p.y, p.x) / 64.0 + t * vec2(0.0052, 0.0034)).rg * 2.0 - 1.0;
#else
  vec2 a1 = a0.yx, b0 = vec2(0.0);
#endif
  vec2 b1 = texture2D(tWaves, p / 32.0 + t * vec2(-0.0081, 0.0062)).rg * 2.0 - 1.0;
  vec2 c0 = texture2D(tWaves, p.yx / 16.0 + t * vec2(-0.0135, 0.0102)).rg * 2.0 - 1.0;
  float f1v = 1.0 - sstep(1.5, 12.0, pw);
  float f2v = 1.0 - sstep(0.4, 3.0, pw);
#if DETAIL > 0
  vec2 c1 = texture2D(tWaves, p / 4.0 + t * vec2(0.031, -0.026)).rg * 2.0 - 1.0;
  float f3v = 1.0 - sstep(0.1, 0.8, pw);
#else
  vec2 c1 = vec2(0.0); float f3v = 0.0;
#endif
  vec2 s = a0 * 0.016 + vec2(-a1.y, a1.x) * 0.02 + (vec2(b0.y, -b0.x) * 0.045 + b1 * 0.04) * f1v + (c0.yx * 0.055 + c1 * 0.05 * f3v) * f2v;
  s *= rough;
  // unresolved slope variance (Cox-Munk ~ 3-7 m/s wind) feeds the glitter lobe
  sig2 = (0.004 + 0.024 * (1.0 - 0.3 * f1v - 0.35 * f2v - 0.2 * f3v)) * rough * rough;
  return normalize(vec3(-s.x, 1.0, -s.y));
}

float fresnelW(float c) { float m = 1.0 - clamp(c, 0.0, 1.0); return 0.02 + 0.98 * m * m * m * m * m; }

vec3 shadeWater(vec3 dir, float dist, vec3 sky) {
  bool g = atmRayHitsGround(uAtmCamR, uAtmCamH, dir.y);
  float tS = g ? atmRayEnd(uAtmCamR, uAtmCamH, dir.y, true) * 1000.0 : dist;
  tS = min(tS, dist);
  vec3 Ps = uCamPos + dir * tS;
  vec2 sMod = uRefMod + Ps.xz;
  vec2 sAbs = uRefWorld + Ps.xz;
  vec2 fwP = fwidth(Ps.xz);
  float pwS = max(max(fwP.x, fwP.y), 0.002);
  float shelf;
  float sd = shoreDistance(sAbs, shelf);
  float sig2;
  // wind patches: rougher / glassier areas (cat's paws, slicks) seen from the air
  float rough = 0.6 + 0.75 * sstep(-0.55, 0.6, noiseT(sMod / 8192.0).y * 0.7 + noiseT(sMod / 2048.0).x * 0.45);
  rough *= mix(1.0, 0.75, sstep(0.03, 0.05, shelf));             // lakes are calmer
  vec3 n = waveNormal(sMod, pwS, rough, sig2);
  vec3 V = -dir;
  float nv = max(dot(n, V), 1e-3);
  float F = fresnelW(nv);
  // sky reflection (the sky seen from the surface ~ the sky-view LUT above the horizon)
  vec3 R = reflect(dir, n);
  R.y = max(R.y, 0.004);
  R = normalize(R);
  vec3 skyR = atmSkyView(R) + atmNightSky(R);
  // sun & moon glitter (Beckmann lobe around the half vector)
  vec3 sunE = uAtmSunIllum * atmSunTransmittance(0.0, uAtmSunDir.y);
  vec3 Hs = normalize(uAtmSunDir + V);
  float nh = max(dot(n, Hs), 1e-3);
  float nh2 = nh * nh;
  float D = exp(-(1.0 - nh2) / (nh2 * sig2)) / (PI * sig2 * nh2 * nh2);
  float G = min(1.0, 2.0 * nh * min(nv, max(dot(n, uAtmSunDir), 0.0)) / max(dot(V, Hs), 1e-3));
  vec3 glitter = sunE * fresnelW(dot(Hs, V)) * D * G / (4.0 * nv);
  vec3 Hm = normalize(uAtmMoonDir + V);
  float nhm = max(dot(n, Hm), 1e-3);
  float Dm = exp(-(1.0 - nhm * nhm) / (nhm * nhm * sig2)) / (PI * sig2 * nhm * nhm * nhm * nhm);
  glitter += uMoonIrr * fresnelW(dot(Hm, V)) * Dm / (4.0 * nv) * step(0.0, uAtmMoonDir.y);
  // body colour: open-water blue, turquoise over sand shallows, greener lakes
  vec3 Ein = sunE * max(uAtmSunDir.y, 0.0) + uSkyIrrUp + uMoonIrr * max(uAtmMoonDir.y, 0.0);
  float depth = clamp(max(sd, 0.0) * shelf, 0.0, 40.0);
  float cosR = sqrt(1.0 - (1.0 - nv * nv) / 1.77);
  float path = depth * (1.0 + 1.0 / max(cosR, 0.2));
  float lake = sstep(0.03, 0.05, shelf);
  // sea: clear (turquoise over sand); lakes / reservoirs: greener, murkier
  vec3 att = exp(-mix(vec3(0.40, 0.065, 0.032), vec3(0.55, 0.16, 0.19), lake) * path);
  vec3 deep = Ein * mix(vec3(0.0016, 0.0072, 0.0118), vec3(0.0022, 0.0062, 0.0058), lake);
  vec3 bedAlb = mix(vec3(0.36, 0.31, 0.21), vec3(0.10, 0.09, 0.06), lake);
  vec3 bed = bedAlb * Ein / PI;
  vec3 under = mix(deep, bed * att + deep * (1.0 - att) * 1.25, sstep(40.0, 2.0, depth));

  vec3 col = under * (1.0 - F) + skyR * F + glitter;
  // shore foam: breaking-wave bands running up the beach
  float sea = 1.0 - lake;
  float fw = mix(2.5, 24.0, sea);
#if DETAIL > 0
  float bands = sstep(0.55, 0.95, sin(sd * 0.32 + uTime * 0.9 + texture2D(tNoise, sMod / 256.0).x * 6.0) * 0.5 + 0.5);
  float foam = (1.0 - sstep(0.0, fw, sd)) * mix(0.35, 1.0, bands) * (1.0 - sstep(2.0, 12.0, pwS)) * sea;
  foam += (1.0 - sstep(0.0, fw * 0.25, sd)) * mix(0.18, 0.5, sea);
  foam *= 0.6 + 0.4 * texture2D(tWaves, sMod / 8.0 + uTime * 0.02).a;
#else
  float foam = (1.0 - sstep(0.0, fw * 0.4, sd)) * mix(0.15, 0.6, sea);
#endif
  col = mix(col, Ein * mix(0.35, 0.72, sea) / PI, clamp(foam, 0.0, 1.0) * mix(0.5, 0.85, sea));
  return col;
}

void main() {
  float dist = length(vView);
  vec3 dir = vView / max(dist, 1e-3);
  vec2 wa = uRefWorld + vLocal.xz;
  vec2 wm = uRefMod + vLocal.xz;
  vec2 fw = fwidth(vLocal.xz);
  float pw = max(max(fw.x, fw.y), 0.002);
  float h = vLocal.y;
  vec3 N = normalize(vNormal);
  vec3 sky = atmSkyView(dir) + vNight;
  vec3 col;
  if (vData.x > 0.003 && h < 0.0) {
    // water surface lies on the sea-level sphere along this ray (distance D)
    col = shadeWater(dir, dist, sky);
    col = col * exp(-max(vOdD, vec3(0.0))) + sky;
  } else {
    vec3 dn = vec3(0.0, 0.0, 1.0);
    float dnK = 0.0;
    vec3 alb = landAlbedo(wa, wm, h, N, dist, pw, vData.y, dn, dnK);
    vec3 Nd = N;
    // macro relief (gullies / spurs finer than the height field), scaled by ruggedness
    float rug = clamp(vData.y * 0.6 + sstep(0.02, 0.18, 1.0 - N.y) * 0.9 + sstep(120.0, 1100.0, h) * 0.45, 0.0, 1.0);
    if (rug > 0.02) {
      vec4 r1 = texture2D(tRelief, wm / 8192.0);
#if DETAIL > 0
      vec4 r2 = texture2D(tRelief, wm.yx / 2048.0);
#else
      vec4 r2 = r1.gbar;
#endif
      vec2 g = (r1.rg * 2.0 - 1.0) * 0.55 + (r2.gr * 2.0 - 1.0) * 0.35;
      Nd = normalize(Nd + vec3(-g.x, 0.0, -g.y) * rug * 0.75);
      alb *= 0.9 + 0.2 * mix(r1.b, r2.b, 0.4) * rug;       // gully floors darker (shade, moisture), spurs lighter
    }
    if (dnK > 0.001) Nd = normalize(Nd + vec3(dn.x, 0.0, dn.y) * 0.9 * dnK);
    float ndl = dot(Nd, uAtmSunDir);
    // vegetation: slight wrap (light through leaves), terminator softened
    float diff = max(0.0, ndl * 0.88 + 0.12) * sstep(-0.12, 0.05, dot(N, uAtmSunDir));
    vec3 E = vSunT * diff + mix(uSkyIrrDown, uSkyIrrUp, Nd.y * 0.5 + 0.5) + uMoonIrr * max(0.0, dot(Nd, uAtmMoonDir));
    col = alb / PI * E;
    vec3 Td = exp(-max(vOdd, vec3(0.0)));
    vec3 F = clamp((1.0 - Td) / max(1.0 - exp(-max(vOdD, vec3(0.0))), vec3(1e-5)), 0.0, 1.0);
    col = col * Td + sky * F;
  }
  gl_FragColor = vec4(col, 1.0);
}`;
}
