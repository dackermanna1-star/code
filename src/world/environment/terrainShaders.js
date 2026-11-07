import { GEO_GLSL, AIRPORT_FLAT, DEP_TOWN, DEP_LAKE, ARR_CITY } from '../geo.js';
import { SKY_COMMON_GLSL } from './sky.js';

// =============================================================================
// Terrain shaders: height bake, clipmap vertex shader, land-cover + water
// fragment shader with physically based aerial perspective.
// =============================================================================

const f1 = (v) => Number(v).toFixed(1);

/** Bake pass: one texel per lattice vertex of a level -> (height, water, mountain belt, 1). */
export const BAKE_FRAG = /* glsl */`
precision highp float;
${GEO_GLSL}
uniform vec2 uBakeOrigin;   // world xz of lattice (0,0) of the level (exact multiple of the cell size)
uniform float uBakeScale;   // cell size (m)
uniform float uBlockX0;     // first texel column of the level block
uniform float uApron;
void main() {
  vec2 p = floor(gl_FragCoord.xy);
  vec2 ij = vec2(p.x - uBlockX0 - uApron, p.y - uApron);
  vec2 w = uBakeOrigin + ij * uBakeScale;
  float h = geoHeight(w);
  float wm = geoWater(w);
  float belt = geoSstep(0.15, 0.55, geoFbm(w / 60000.0 + vec2(3.3, -1.1), 3) + 0.25);
  gl_FragColor = vec4(h, wm, belt, 1.0);
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
uniform highp sampler2D uHeights;
uniform vec2 uLevelBase[NL];
uniform int uMinLevel;
uniform float uS0;
uniform vec3 uCamPos;        // camera relative to the reference point (x, altitude MSL, z)
uniform float uFlat;         // 1 = flatten water vertices to sea level (water pass)
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vData;
flat varying int vLevel;

vec4 hf(ivec2 t) { return texelFetch(uHeights, t, 0); }

void main() {
  int L = uMinLevel + gl_InstanceID;
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
  vView = pos - uCamPos;
  vData = vec3(d.g, d.b, alpha);
  vLevel = L;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;
}

export function terrainFragmentShader(cfg) {
  return /* glsl */`
precision highp float;
precision highp int;
#define NL ${cfg.levels}
#define HALF ${f1(cfg.half)}
${SKY_COMMON_GLSL}
${GEO_GLSL}
uniform vec2 uLevelBase[NL];
uniform int uMinLevel;
uniform float uS0;
uniform vec3 uCamPos;
uniform vec2 uRefWorld;       // world xz of the reference point (float32, for large-scale masks)
uniform vec2 uRefMod;         // reference point modulo 16384 m (precise detail coordinates)
uniform vec2 uAnchor;         // (ref - refMod) / 1024 : integer section offset
uniform float uTime;
uniform vec3 uSkyIrrUp;       // sky irradiance on an up-facing surface at sea level
uniform vec3 uSkyIrrDown;     // irradiance on a down-facing surface (ground bounce)
uniform vec3 uMoonIrr;        // moon irradiance (normal incidence)
uniform float uDetail;        // quality detail 0..3
uniform sampler2D tNoise;
uniform sampler2D tWaves;
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
varying vec3 vData;
flat varying int vLevel;

#define PI 3.14159265359
const vec3 MEAN_GRASS = vec3(0.1269, 0.1612, 0.0343);
const vec3 MEAN_DIRT = vec3(0.2029, 0.1441, 0.0854);
const vec3 MEAN_ROCK = vec3(0.084, 0.0784, 0.0656);
const vec3 MEAN_SAND = vec3(0.3331, 0.2588, 0.1562);
const vec3 MEAN_MEADOW = vec3(0.3305, 0.3061, 0.1113);

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec4 noiseT(vec2 uv) { return texture2D(tNoise, uv) * 2.0 - 1.0; }
float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
// anti-aliased band mask: distance d from a line of width w, pixel footprint pw
float lineAA(float d, float w, float pw) {
  float ww = max(w, pw);
  return (1.0 - sstep(ww * 0.5 - pw * 0.5, ww * 0.5 + pw * 0.5, d)) * min(1.0, w / pw);
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// --------------------------------------------------------------------------- farmland
const vec3 C_CORN = vec3(0.040, 0.088, 0.022);
const vec3 C_SOY = vec3(0.060, 0.118, 0.030);
const vec3 C_ALFALFA = vec3(0.052, 0.108, 0.034);
const vec3 C_WHEAT = vec3(0.290, 0.225, 0.095);
const vec3 C_STUBBLE = vec3(0.330, 0.285, 0.175);
const vec3 C_SOIL = vec3(0.135, 0.092, 0.056);
const vec3 C_SOILD = vec3(0.080, 0.058, 0.038);
const vec3 C_PASTURE = vec3(0.085, 0.112, 0.042);
const vec3 C_HAY = vec3(0.185, 0.165, 0.078);
const vec3 C_HEDGE = vec3(0.022, 0.040, 0.016);
const vec3 C_ROAD = vec3(0.17, 0.155, 0.135);
const vec3 C_DRYGRASS = vec3(0.255, 0.198, 0.088);

// crop albedo + row style for a field id
vec3 cropColor(float r, float region, out float rows, out float soilKind) {
  rows = 0.0; soilKind = 0.0;
  // region 0 = humid farmland (departure / en-route), 1 = dry Mediterranean (arrival)
  if (region > 0.5) {
    if (r < 0.30) { rows = 0.0; return C_DRYGRASS * (0.9 + 0.25 * fract(r * 37.0)); }
    if (r < 0.45) { rows = 0.7; return C_SOY * 1.05; }                     // irrigated
    if (r < 0.58) { rows = 1.5; return mix(C_HEDGE, C_PASTURE, 0.6); }    // orchards / vineyards
    if (r < 0.72) { soilKind = 1.0; return C_STUBBLE; }
    if (r < 0.85) { soilKind = 1.0; return C_SOIL * 1.25; }
    return C_HAY;
  }
  if (r < 0.20) { rows = 0.76; return C_CORN; }
  if (r < 0.36) { rows = 0.76; return C_SOY; }
  if (r < 0.50) { return C_WHEAT * (0.92 + 0.16 * fract(r * 53.0)); }
  if (r < 0.58) { soilKind = 1.0; return C_STUBBLE; }
  if (r < 0.66) { rows = 1.1; soilKind = 1.0; return C_SOIL; }
  if (r < 0.71) { rows = 1.1; soilKind = 1.0; return C_SOILD; }
  if (r < 0.83) { return C_PASTURE; }
  if (r < 0.92) { return C_ALFALFA; }
  return C_HAY;
}

vec3 farmland(vec2 wm, float pw, float region, float nearF, inout float soilMix) {
  vec4 nM = noiseT(wm / 16384.0);
  vec4 nK = noiseT(wm / 2048.0);
  vec2 warp = nM.xy * 55.0 + nK.zw * 7.0 * region;
  vec2 fp = wm + warp;
  vec2 secF = fp / 1024.0;
  vec2 secI = floor(secF);
  vec2 sf = secF - secI;
  vec2 sid = secI + uAnchor;
  float hs = hash12(sid * 1.37 + 0.11);
  vec2 ff; vec2 fsz; vec2 fid; float pivot = 0.0; vec2 pc = sf - 0.5;
  if (hs < 0.26) {
    vec2 q = floor(sf * 2.0); ff = fract(sf * 2.0); fsz = vec2(512.0); fid = sid * 4.0 + q;
  } else if (hs < 0.48) {
    float n = 2.0 + floor(hash12(sid + 3.1) * 5.0);
    float q = floor(sf.x * n); ff = vec2(fract(sf.x * n), sf.y); fsz = vec2(1024.0 / n, 1024.0); fid = sid * 8.0 + vec2(q, 7.0);
  } else if (hs < 0.68) {
    float n = 2.0 + floor(hash12(sid + 5.7) * 5.0);
    float q = floor(sf.y * n); ff = vec2(sf.x, fract(sf.y * n)); fsz = vec2(1024.0, 1024.0 / n); fid = sid * 8.0 + vec2(5.0, q);
  } else if (hs < 0.80 && region < 0.5) {
    pivot = 1.0; ff = sf; fsz = vec2(1024.0); fid = sid * 3.0;
  } else {
    // irregular: split at a random x, then each half at a random z
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
  // centre pivot irrigation: green disc, dry corners, wheel tracks
  if (pivot > 0.5) {
    float rr = length(pc) * 1024.0;
    float inside = 1.0 - sstep(498.0 - pw, 498.0 + pw, rr);
    float rc = hash12(sid + 2.2);
    vec3 disc = rc < 0.5 ? C_CORN * 1.15 : (rc < 0.75 ? C_ALFALFA : C_WHEAT);
    float track = lineAA(abs(fract(rr / 54.0 + 0.5) - 0.5) * 54.0, 2.5, pw) * inside;
    col = mix(mix(C_DRYGRASS * 0.8, C_SOIL, hash12(sid + 7.0)), disc, inside);
    col = mix(col, C_SOIL * 0.9, track * 0.6);
    rows = 0.0; soilK = (1.0 - inside) * 0.5;
  }
  // within-field variation (soil moisture, growth)
  float var = nK.x * 0.5 + nK.y * 0.35 + noiseT(wm / 256.0).x * 0.25 * nearF;
  col *= 0.86 + 0.22 * var;
  // crop rows / furrows along the longer field side
  vec2 fm = ff * fsz;
  if (rows > 0.0) {
    float coord = (fsz.x > fsz.y) ? fm.y : fm.x;
    float rowAmp = 1.0 - sstep(rows * 0.3, rows * 0.7, pw);
    float rw = abs(fract(coord / rows) - 0.5) * 2.0;
    col = mix(col, soilK > 0.5 ? col * 0.65 : mix(col, C_SOIL, 0.55), rowAmp * sstep(0.35, 0.9, rw) * 0.8);
  } else if (rnd >= 0.36 && rnd < 0.50 && region < 0.5) {
    // wheat: tram lines every 24 m
    float coord = (fsz.x > fsz.y) ? fm.y : fm.x;
    float tl = lineAA(abs(fract(coord / 24.0) - 0.5) * 24.0, 0.6, pw);
    col = mix(col, col * 0.7, tl * 0.7);
  }
  soilMix = max(soilMix, soilK);
  // field margins: grass strip / hedgerow / track
  float e = min(min(fm.x, fsz.x - fm.x), min(fm.y, fsz.y - fm.y));
  float hedgeP = hash12(fid + 11.0);
  float marginW = 2.0 + 3.0 * hash12(fid + 4.4);
  col = mix(col, C_PASTURE * 0.95, lineAA(e, marginW * 2.0, pw) * 0.8);
  if (hedgeP < 0.45 + 0.3 * region) {
    float clump = 0.6 + 0.4 * noiseT(wm / 128.0).w;
    col = mix(col, C_HEDGE * (0.8 + 0.4 * clump), lineAA(e, 6.0 * clump, pw) * 0.95);
  }
  // section roads (gravel / paved) on the section boundaries
  float es = min(min(sf.x, 1.0 - sf.x), min(sf.y, 1.0 - sf.y)) * 1024.0;
  float roadP = hash12(floor(secF + 0.5) + 17.0);
  float roadW = roadP < 0.3 ? 7.0 : 4.5;
  col = mix(col, roadP < 0.3 ? C_ROAD * 0.55 : C_ROAD, lineAA(es, roadW, pw) * (region > 0.5 ? 0.5 : 0.85));
  return col;
}

// --------------------------------------------------------------------------- forests / natural cover
vec3 forestColor(vec2 wm, float pw, float h, float region, float conifer) {
  vec4 nA = noiseT(wm / 256.0);
  vec4 nB = noiseT(wm / 64.0);
  vec3 dec = mix(vec3(0.030, 0.055, 0.020), vec3(0.042, 0.068, 0.024), nA.z * 0.5 + 0.5);
  vec3 con = mix(vec3(0.016, 0.030, 0.014), vec3(0.026, 0.040, 0.018), nA.z * 0.5 + 0.5);
  vec3 oak = mix(vec3(0.034, 0.042, 0.020), vec3(0.050, 0.055, 0.026), nA.y * 0.5 + 0.5);
  vec3 c = mix(dec, con, conifer);
  c = mix(c, oak, region);
  // crowns: bright tops, dark gaps (fades out once smaller than a pixel)
  float crown = nA.w * 0.6 + nB.z * 0.4;
  float cAmp = 1.0 - sstep(1.5, 6.0, pw);
  c *= 1.0 + crown * 0.45 * cAmp;
  return c;
}

vec3 rockColor(vec2 wm, float nearF, out vec3 nrm) {
  vec4 nA = noiseT(wm / 2048.0);
  vec3 base = mix(vec3(0.115, 0.105, 0.092), vec3(0.15, 0.14, 0.125), nA.x * 0.5 + 0.5);
  base = mix(base, vec3(0.13, 0.10, 0.075), sstep(0.2, 0.7, nA.w) * 0.5);   // iron-stained strata
  nrm = vec3(0.0, 0.0, 1.0);
  if (nearF > 0.001) {
    vec3 t = texture2D(tRock, wm / 16.0).rgb;
    base *= mix(vec3(1.0), t / MEAN_ROCK, nearF);
    nrm = texture2D(tRockN, wm / 16.0).xyz * 2.0 - 1.0;
  }
  return base;
}

// --------------------------------------------------------------------------- land
vec3 landAlbedo(vec2 wa, vec2 wm, float h, vec3 N, float dist, float pw, float belt, inout vec3 dn, inout float dnK) {
  vec2 dD = wa - uGeoDep, dA = wa - uGeoArr;
  float lenD = length(dD), lenA = length(dA);
  float depPlain = 1.0 - sstep(9000.0, 30000.0, lenD);
  float arrRegion = 1.0 - sstep(16000.0, 60000.0, lenA);
  float slope = 1.0 - N.y;
  vec4 nM = noiseT(wm / 16384.0);
  vec4 nK = noiseT(wm / 2048.0);
  vec4 nF = noiseT(wm / 256.0);
  // absolute-world, very large scale variation (breaks the 16 km noise period from cruise)
  float big = geoVnoise(wa / 37000.0 + vec2(1.7, 9.2)) * 0.6 + geoVnoise(wa / 11000.0 - vec2(4.1, 0.3)) * 0.4;
  float nearF = 1.0 - sstep(120.0, 700.0, dist);
  float soilMix = 0.0;

  // ---- base: farmland vs natural cover
  float flatness = 1.0 - sstep(0.035, 0.14, slope + nK.x * 0.02);
  float lowland = 1.0 - sstep(450.0, 900.0, h + nM.y * 150.0);
  float agri = flatness * lowland * (1.0 - belt * 0.85) * sstep(-0.35, 0.25, big + nM.x * 0.4 + 0.15);
  agri = max(agri, depPlain * flatness * 0.97);
  float region = arrRegion;    // 0 humid, 1 dry Mediterranean
  vec3 col = farmland(wm, pw, region, nearF, soilMix);

  // natural cover: grass/scrub/forest depending on elevation, slope, region
  float forestN = nM.z * 0.45 + nK.y * 0.35 + nF.x * 0.12 + big * 0.25;
  float forestP = sstep(0.0, 0.2, forestN + slope * 1.8 + belt * 0.35 - 0.05 - depPlain * 0.35 - region * 0.25);
  forestP *= 1.0 - sstep(1650.0, 2000.0, h + nK.z * 140.0);         // tree line
  float conifer = sstep(500.0, 1100.0, h + nK.w * 200.0);
  vec3 grassNat = mix(vec3(0.072, 0.098, 0.038), C_DRYGRASS * 0.95, sstep(-0.2, 0.5, region * 1.2 + nK.w * 0.3 - 0.2 + sstep(900.0, 1500.0, h) * 0.3));
  grassNat *= 0.85 + 0.25 * (nF.y * 0.5 + 0.5);
  vec3 forest = forestColor(wm, pw, h, region, conifer);
  vec3 natural = mix(grassNat, forest, forestP);
  // isolated trees / shrubs in dry grassland (dark specks)
  float shrub = sstep(0.55, 0.75, noiseT(wm / 128.0).w + nF.z * 0.3) * (1.0 - sstep(1.0, 4.0, pw)) * (0.3 + 0.7 * region);
  natural = mix(natural, forest * 0.9, shrub * (1.0 - forestP));
  col = mix(natural, col, agri);

  // ---- mountains: alpine meadow, scree, rock, snow
  vec3 rN;
  vec3 rock = rockColor(wm, nearF, rN);
  float alpine = sstep(1700.0, 2100.0, h + nK.z * 160.0);
  col = mix(col, mix(vec3(0.10, 0.11, 0.06), vec3(0.14, 0.13, 0.10), nF.x * 0.5 + 0.5), alpine * (1.0 - agri));
  float rockP = sstep(0.32, 0.55, slope + nK.y * 0.08) + sstep(2050.0, 2500.0, h + nK.x * 200.0) * 0.8;
  rockP = clamp(rockP, 0.0, 1.0) * (1.0 - agri * 0.9);
  col = mix(col, rock, rockP);
  float southFace = clamp(N.z * 3.0, -1.0, 1.0);
  float snow = sstep(2150.0, 2450.0, h + nK.x * 220.0 + nF.y * 40.0 - southFace * 180.0) * (1.0 - sstep(0.5, 0.75, slope));
  col = mix(col, vec3(0.78, 0.80, 0.84) * (0.92 + 0.08 * nF.z), snow);

  // ---- arrival coast: beach sand
  float lx = dA.x, lz = dA.y;
  if (abs(lz) < 95000.0 && lx > -150000.0 && lx < 4000.0) {
    float shore = geoCoastX(lz) + 120.0 * geoVnoise(vec2(lz / 300.0, 3.7));
    float landD = lx - shore;
    float sandW = 70.0 + 45.0 * nK.x + 25.0 * nF.w;
    float beach = 1.0 - sstep(sandW * 0.8, sandW, landD);
    vec3 sand = vec3(0.40, 0.335, 0.225) * (0.94 + 0.1 * nF.x);
    if (nearF > 0.0) sand *= mix(vec3(1.0), texture2D(tSand, wm / 8.0).rgb / MEAN_SAND, nearF);
    sand = mix(sand * 0.62, sand, sstep(-12.0, 18.0, landD));        // wet sand at the waterline
    col = mix(col, sand, beach);
    // dune grass / scrub band behind the beach
    col = mix(col, mix(C_DRYGRASS, vec3(0.06, 0.07, 0.035), sstep(0.0, 0.6, nF.z)), (1.0 - beach) * (1.0 - sstep(sandW, sandW + 160.0, landD)) * 0.6);
  }

  // ---- towns & city ground (buildings come from the city module)
  float town = 1.0 - sstep(0.7, 1.05, length(dD - vec2(${f1(DEP_TOWN.x)}, ${f1(DEP_TOWN.z)})) / ${f1(DEP_TOWN.radius)} + nK.x * 0.12);
  float city = sstep(${f1(ARR_CITY.xMin)}, ${f1(ARR_CITY.xMin + 800)}, dA.x + nK.y * 300.0) * (1.0 - sstep(${f1(ARR_CITY.xMax - 1500)}, ${f1(ARR_CITY.xMax)}, dA.x + nK.z * 400.0))
    * sstep(${f1(ARR_CITY.zMin)}, ${f1(ARR_CITY.zMin + 1500)}, dA.y + nK.w * 400.0) * (1.0 - sstep(${f1(ARR_CITY.zMax - 600)}, ${f1(ARR_CITY.zMax)}, dA.y + nK.x * 300.0));
  float urb = max(town, city);
  if (urb > 0.001) {
    vec2 bp = wm / 128.0;
    vec2 bi = floor(bp + uAnchor * 8.0), bf = fract(bp);
    float hb = hash12(bi + 3.3);
    vec3 lot = hb < 0.35 ? vec3(0.15, 0.145, 0.138) : (hb < 0.6 ? vec3(0.085, 0.085, 0.09) : (hb < 0.85 ? vec3(0.055, 0.085, 0.035) : vec3(0.11, 0.10, 0.085)));
    lot *= 0.85 + 0.3 * (nF.z * 0.5 + 0.5);
    float street = lineAA(min(min(bf.x, 1.0 - bf.x), min(bf.y, 1.0 - bf.y)) * 128.0, 14.0, pw);
    vec3 ug = mix(lot, vec3(0.07, 0.068, 0.066), street);
    // greener residential edge, denser grey core
    ug = mix(ug, mix(ug, vec3(0.05, 0.08, 0.035), 0.45), sstep(0.3, 0.9, 1.0 - urb + nF.y * 0.2));
    col = mix(col, ug, urb * 0.92);
    soilMix *= 1.0 - urb;
  }

  // ---- airports: mown grass between the pavement (pavement itself is drawn by the airport module)
  float apt = 0.0;
  for (int k = 0; k < 2; k++) {
    vec2 a = k == 0 ? dD : dA;
    float fx = max(max(${f1(AIRPORT_FLAT.xMin)} - a.x, 0.0), a.x - ${f1(AIRPORT_FLAT.xMax)});
    float fz = max(max(${f1(AIRPORT_FLAT.zMin)} - a.y, 0.0), a.y - ${f1(AIRPORT_FLAT.zMax)});
    apt = max(apt, 1.0 - sstep(60.0, 260.0, length(vec2(fx, fz)) + nK.x * 60.0));
  }
  if (apt > 0.001) {
    vec3 g = vec3(0.075, 0.108, 0.032) * (0.9 + 0.2 * (nK.y * 0.5 + 0.5));
    g = mix(g, vec3(0.16, 0.15, 0.07), sstep(0.25, 0.8, nK.w * 0.6 + nF.z * 0.5) * 0.45);   // dry patches
    // mowing stripes parallel to the runway
    float stripe = sign(sin(wm.y * PI / 9.0)) * (1.0 - sstep(1.5, 5.0, pw));
    g *= 1.0 + 0.055 * stripe;
    col = mix(col, g, apt);
    soilMix *= 1.0 - apt;
  }

  // ---- near-field texture detail (normalised so the macro colour is preserved)
  if (nearF > 0.001) {
    vec3 tg = (texture2D(tGrass, wm / 4.0).rgb * 0.6 + texture2D(tGrass, wm.yx / 16.0).rgb * 0.4) / MEAN_GRASS;
    vec3 tm = texture2D(tMeadow, wm / 8.0).rgb / MEAN_MEADOW;
    vec3 td = (texture2D(tDirt, wm / 4.0).rgb * 0.65 + texture2D(tDirt, wm.yx / 16.0).rgb * 0.35) / MEAN_DIRT;
    float dryish = sstep(0.12, 0.25, lum(col)) * (1.0 - soilMix);
    vec3 tex = mix(mix(tg, tm, dryish * 0.7), td, soilMix);
    tex = mix(tex, vec3(1.0), rockP);
    col *= mix(vec3(1.0), clamp(tex, 0.2, 3.0), nearF);
    vec3 ng = texture2D(tGrassN, wm / 4.0).xyz * 2.0 - 1.0;
    vec3 nd = texture2D(tDirtN, wm / 4.0).xyz * 2.0 - 1.0;
    dn = mix(mix(ng, nd, soilMix), rN, rockP);
    dnK = nearF;
  }
  return col;
}

// --------------------------------------------------------------------------- water
float shoreDistance(vec2 w, out float shelf) {
  shelf = 0.04;
  vec2 a = w - uGeoArr;
  float sd = -1e6;
  if (abs(a.y) < 95000.0 && a.x > -150000.0 && a.x < 6000.0) {
    float shore = geoCoastX(a.y) + 120.0 * geoVnoise(vec2(a.y / 300.0, 3.7));
    sd = shore - a.x;
    shelf = 0.022;
  }
  vec2 dl = (w - uGeoDep - vec2(${f1(DEP_LAKE.x)}, ${f1(DEP_LAKE.z)})) / vec2(${f1(DEP_LAKE.rx)}, ${f1(DEP_LAKE.rz)});
  float r = length(dl) + 0.12 * geoVnoise((w - uGeoDep) / 700.0);
  float sdl = (1.0 - r) * ${f1(Math.min(DEP_LAKE.rx, DEP_LAKE.rz))};
  if (sdl > sd) { sd = sdl; shelf = 0.045; }
  float ln = geoVnoise(w / 23000.0 + vec2(5.1, -2.7));
  float sde = (ln - 0.64) / 0.04 * 350.0;
  if (sde > sd) { sd = sde; shelf = 0.05; }
  return sd;
}

vec3 waveNormal(vec2 p, float pw, out float sig2) {
  float t = uTime;
  vec2 n0 = texture2D(tWaves, p / 512.0 + t * vec2(0.0011, 0.0007)).rg * 2.0 - 1.0;
  vec2 n1 = texture2D(tWaves, p / 64.0 + t * vec2(0.0062, 0.0041)).rg * 2.0 - 1.0;
  vec2 n2 = texture2D(tWaves, p.yx / 16.0 + t * vec2(-0.0135, 0.0102)).rg * 2.0 - 1.0;
  vec2 n3 = texture2D(tWaves, p / 4.0 + t * vec2(0.031, -0.026)).rg * 2.0 - 1.0;
  float f1v = 1.0 - sstep(2.0, 14.0, pw);
  float f2v = 1.0 - sstep(0.5, 3.5, pw);
  float f3v = 1.0 - sstep(0.12, 0.9, pw);
  vec2 s = n0 * 0.035 + n1 * 0.075 * f1v + n2.yx * 0.075 * f2v + n3 * 0.06 * f3v;
  // unresolved slope variance (Cox-Munk ~ 5 m/s wind) goes into the glitter lobe
  sig2 = 0.0045 + 0.026 * (1.0 - 0.25 * f1v - 0.35 * f2v - 0.25 * f3v);
  return normalize(vec3(-s.x, 1.0, -s.y));
}

float fresnelW(float c) { float m = 1.0 - clamp(c, 0.0, 1.0); return 0.02 + 0.98 * m * m * m * m * m; }

vec3 shadeWater(vec3 dir, float dist, out float surfDist) {
  bool g = atmRayHitsGround(uAtmCamR, uAtmCamH, dir.y);
  float tS = g ? atmRayEnd(uAtmCamR, uAtmCamH, dir.y, true) * 1000.0 : dist;
  tS = min(tS, dist);
  surfDist = tS;
  vec3 Ps = uCamPos + dir * tS;
  vec2 sMod = uRefMod + Ps.xz;
  vec2 sAbs = uRefWorld + Ps.xz;
  vec2 fwP = fwidth(Ps.xz);
  float pwS = max(max(fwP.x, fwP.y), 0.002);
  float shelf;
  float sd = shoreDistance(sAbs, shelf);
  float sig2;
  vec3 n = waveNormal(sMod, pwS, sig2);
  // calmer, flatter water in the lee of the shore / lakes
  vec3 V = -dir;
  float nv = max(dot(n, V), 1e-3);
  float F = fresnelW(nv);
  // sky reflection
  vec3 R = reflect(dir, n);
  R.y = max(R.y, 0.003);
  R = normalize(R);
  vec3 sky = atmSkyView(R) + atmNightSky(R);
  // sun & moon glitter (Beckmann lobe)
  vec3 sunE = uAtmSunIllum * atmSunTransmittance(0.0, uAtmSunDir.y);
  vec3 Hs = normalize(uAtmSunDir + V);
  float nh = max(dot(n, Hs), 1e-3);
  float nh2 = nh * nh;
  float D = exp(-(1.0 - nh2) / (nh2 * sig2)) / (PI * sig2 * nh2 * nh2);
  float Fs = fresnelW(dot(Hs, V));
  float G = min(1.0, 2.0 * nh * min(nv, max(dot(n, uAtmSunDir), 0.0)) / max(dot(V, Hs), 1e-3));
  vec3 glitter = sunE * Fs * D * G / (4.0 * nv) * step(0.0, uAtmSunDir.y + 0.02);
  vec3 Hm = normalize(uAtmMoonDir + V);
  float nhm = max(dot(n, Hm), 1e-3);
  float Dm = exp(-(1.0 - nhm * nhm) / (nhm * nhm * sig2)) / (PI * sig2 * nhm * nhm * nhm * nhm);
  glitter += uMoonIrr * fresnelW(dot(Hm, V)) * Dm / (4.0 * nv) * step(0.0, uAtmMoonDir.y);
  // water body: irradiance entering the water
  vec3 Ein = sunE * max(uAtmSunDir.y, 0.0) + uSkyIrrUp + uMoonIrr * max(uAtmMoonDir.y, 0.0);
  float depth = clamp(max(sd, 0.0) * shelf, 0.0, 40.0);
  float cosR = sqrt(1.0 - (1.0 - nv * nv) / 1.77);                    // refracted view angle
  float path = depth * (1.0 + 1.0 / max(cosR, 0.2));
  vec3 absorb = vec3(0.40, 0.065, 0.032);
  vec3 att = exp(-absorb * path);
  vec3 deep = Ein * vec3(0.0016, 0.0072, 0.0118);                       // open-water upwelling (blue)
  vec3 bedAlb = mix(vec3(0.36, 0.31, 0.21), vec3(0.10, 0.09, 0.06), sstep(0.03, 0.05, shelf));  // sand vs lake mud
  vec3 bed = bedAlb * Ein / PI;
  vec3 under = mix(deep, bed * att + deep * (1.0 - att) * 1.25, sstep(40.0, 2.0, depth));
  under = mix(under, under * vec3(0.8, 1.05, 0.95), sstep(0.04, 0.05, shelf) * 0.5);   // greener lakes
  vec3 col = under * (1.0 - F) + sky * F + glitter;
  // shore foam: breaking-wave bands moving towards the beach
  float fw = shelf < 0.03 ? 22.0 : 4.0;
  float bands = sstep(0.55, 0.95, sin((sd * 0.32 + uTime * 0.9) + texture2D(tNoise, sMod / 256.0).x * 6.0) * 0.5 + 0.5);
  float foam = (1.0 - sstep(0.0, fw, sd)) * mix(0.35, 1.0, bands) * (1.0 - sstep(2.0, 12.0, pwS));
  foam += (1.0 - sstep(0.0, fw * 0.25, sd)) * 0.5;
  foam *= 0.6 + 0.4 * texture2D(tWaves, sMod / 8.0 + uTime * 0.02).a;
  col = mix(col, Ein * 0.72 / PI, clamp(foam, 0.0, 1.0) * 0.85);
  return col;
}

void main() {
  // hole where the next finer level is drawn
  if (vLevel > uMinLevel) {
    float sIn = uS0 * exp2(float(vLevel - 1));
    vec2 q = vLocal.xz - uLevelBase[vLevel - 1];
    float ext = HALF * 2.0 * sIn;
    float eps = 0.01 * sIn;
    if (q.x > eps && q.y > eps && q.x < ext - eps && q.y < ext - eps) discard;
  }
  float dist = length(vView);
  vec3 dir = vView / max(dist, 1e-3);
  vec2 wa = uRefWorld + vLocal.xz;
  vec2 wm = uRefMod + vLocal.xz;
  vec2 fw = fwidth(vLocal.xz);
  float pw = max(max(fw.x, fw.y), 0.002);
  float h = vLocal.y;
  vec3 N = normalize(vNormal);
  vec3 col;
  float shadeDist = dist;
  if (vData.x > 0.003 && h < 0.0) {
    col = shadeWater(dir, dist, shadeDist);
  } else {
    vec3 dn = vec3(0.0, 0.0, 1.0);
    float dnK = 0.0;
    vec3 alb = landAlbedo(wa, wm, h, N, dist, pw, vData.y, dn, dnK);
    vec3 Nd = N;
    if (dnK > 0.001) Nd = normalize(N + vec3(dn.x, 0.0, dn.y) * 0.9 * dnK);
    vec3 sunE = uAtmSunIllum * atmSunTransmittance(max(h, 0.0) * 0.001, uAtmSunDir.y);
    float ndl = dot(Nd, uAtmSunDir);
    // vegetation: slight wrap (sub-surface scattering through leaves)
    float diff = max(0.0, ndl * 0.88 + 0.12) * sstep(-0.12, 0.05, dot(N, uAtmSunDir));
    vec3 E = sunE * diff + mix(uSkyIrrDown, uSkyIrrUp, Nd.y * 0.5 + 0.5) + uMoonIrr * max(0.0, dot(Nd, uAtmMoonDir));
    col = alb / PI * E;
  }
  col = atmAerial(col, dir, shadeDist * 0.001, atmNightSky(dir));
  gl_FragColor = vec4(col, 1.0);
}`;
}
