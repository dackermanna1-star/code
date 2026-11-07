// =============================================================================
// City materials. Everything is lit by the standard PBR pipeline (sun light,
// sky PMREM, scene fog) via MeshStandardMaterial + onBeforeCompile, except the
// additive light points (street lights, car lights, warning lights).
//
// Shared uniforms (CITY_U, updated once per frame by index.js):
//   uCamPos  camera position in scene space (aircraft-local frame)
//   uUp      world up in scene space
//   uLights  street / exterior lights on (0..1)
//   uWin     window occupancy at night (0..1)
//   uWinE    radiance of a lit window (scene units)
//   uTime    seconds (wrapped)
//   uPx      pixels per radian (for point sizes)
//   uFogD    exp2 fog density (for the additive points)
//
// All vertex shaders apply the Earth-curvature drop relative to the camera
// (same formula as the terrain) so buildings stay glued to the ground at
// distance.
//
// Facades are procedural: per-vertex `aFac` (metres along / up the facade) and
// `aBld` (style, seed, floor height, bay width) drive analytically box-filtered
// window grids (no moire at distance, converges to the mean), glass with sky
// reflections, mullions, spandrels, shop fronts, and per-window night lighting
// (warm / cool / TV flicker, whole lit office floors).
// =============================================================================
import * as THREE from 'three';

export const CITY_U = {
  uCamPos: { value: new THREE.Vector3() },
  uUp: { value: new THREE.Vector3(0, 1, 0) },
  uLights: { value: 0 },
  uWin: { value: 0 },
  uWinE: { value: 0.5 },
  uTime: { value: 0 },
  uPx: { value: 600 },
  uFogD: { value: 0.00005 },
  uDetail: { value: 1 },
};

export const CURVE_GLSL = /* glsl */`
uniform vec3 uCamPos;
uniform vec3 uUp;
// Earth curvature (R = 6360 km) relative to the camera, as the terrain does.
vec4 cityCurve(vec4 wp) {
  vec3 r = wp.xyz - uCamPos;
  float v = dot(r, uUp);
  float h2 = max(dot(r, r) - v * v, 0.0);
  wp.xyz -= uUp * (h2 / 12720000.0);
  return wp;
}
`;

const HASH_GLSL = /* glsl */`
float cHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float cNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), u.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

// ----------------------------------------------------------------------------- facade
const FACADE_GLSL = /* glsl */`
uniform float uLights;
uniform float uWin;
uniform float uWinE;
uniform float uTime;
varying vec2 vFac;
varying vec4 vBld;
${HASH_GLSL}
// exact box-filtered periodic pulse: coverage of [a,b] (cell units) by a pixel footprint w around x
float pInt(float t, float a, float b) { return floor(t) * (b - a) + clamp(fract(t), a, b) - a; }
float fpulse(float a, float b, float x, float w) {
  w = max(w, 1e-4);
  return clamp((pInt(x + 0.5 * w, a, b) - pInt(x - 0.5 * w, a, b)) / w, 0.0, 1.0);
}
// window light colour for a cell (warm incandescent / LED / cool office / TV)
vec3 winColor(float r, float cool) {
  vec3 warm = vec3(1.0, 0.56, 0.24);
  vec3 neutral = vec3(1.0, 0.78, 0.52);
  vec3 coolc = vec3(0.72, 0.84, 1.0);
  return r < cool ? coolc : (r < cool + 0.45 ? warm : neutral);
}

void cityFacade(inout vec3 alb, inout float rough, inout float metal, inout vec3 emis) {
  int style = int(vBld.x + 0.5);
  float seed = vBld.y;
  vec3 base = alb;
  if (style == 0) {                       // flat roof: membrane / gravel with seams + stains
    vec2 p = vFac;
    float n = cNoise(p / 7.0 + seed) * 0.6 + cNoise(p / 1.7 + seed * 3.1) * 0.4;
    vec2 pw = fwidth(p);
    float seam = fpulse(0.0, 0.06, p.x / 1.8 + seed, pw.x / 1.8);
    alb = base * (0.82 + 0.3 * n) * (1.0 - 0.18 * seam);
    rough = 0.92;
    return;
  }
  if (style == 6 || style == 8 || style == 11) {   // plain concrete / painted steel / lawn
    vec2 p = vFac;
    float n = cNoise(p / 3.0 + seed);
    alb = base * (0.88 + 0.22 * n);
    if (style == 11) { alb = base * (0.75 + 0.45 * cNoise(p / 9.0 + seed) * (0.8 + 0.2 * n)); rough = 0.95; }
    else if (style == 8) { rough = 0.5; metal = 0.3; }
    else rough = 0.85;
    // grime towards the ground
    if (style == 6) alb *= mix(0.78, 1.0, smoothstep(0.0, 3.0, vFac.y));
    return;
  }
  if (style == 13 || style == 14) {       // swimming pool / sheltered water: glossy, underwater light at night
    alb = base * (style == 13 ? (0.85 + 0.15 * cNoise(vFac * 0.7 + seed)) : 1.0);
    rough = style == 13 ? 0.04 : 0.12;
    metal = 0.0;
    if (style == 13) emis += vec3(0.25, 0.75, 0.9) * uLights * step(cHash(vec2(seed, 1.7)), 0.4) * uWinE * 0.6;
    return;
  }
  if (style == 10) {                      // lamp / sign panel (lit at night)
    alb = vec3(0.05);
    emis += base * (0.15 + 3.0 * uLights);
    return;
  }
  if (style == 7) {                       // pitched roof: courses of tiles / shingles
    float v = vFac.y;
    float wv = fwidth(v);
    float course = fpulse(0.0, 0.78, v / 0.32, wv / 0.32);
    float tile = cHash(vec2(floor(vFac.x / 0.35), floor(v / 0.32)) + seed);
    float far = smoothstep(0.2, 0.8, wv / 0.32);
    alb = base * mix(0.72 + 0.32 * course * (0.85 + 0.3 * tile), 0.95, far);
    alb *= 0.9 + 0.2 * cNoise(vFac / 4.0 + seed * 7.0);       // weathering / moss patches
    rough = 0.82;
    return;
  }
  if (style == 12) {                      // shipping container: corrugated steel
    float u = vFac.x, wu = fwidth(u);
    float rib = fpulse(0.0, 0.5, u / 0.28, wu / 0.28);
    alb = base * (0.82 + 0.26 * rib) * (0.85 + 0.25 * cNoise(vFac * vec2(0.6, 1.4) + seed * 13.0));
    rough = 0.6; metal = 0.25;
    return;
  }

  float fh = max(vBld.z, 0.5), bw = max(vBld.w, 0.3);
  vec2 c = vFac / vec2(bw, fh);
  vec2 w = max(fwidth(c), vec2(1e-4));
  vec2 cell = floor(c);
  float far = smoothstep(0.3, 1.0, max(w.x, w.y));
  float rs = cHash(vec2(seed, 7.13));
  float floorId = cell.y;
  float rFloor = cHash(vec2(floorId, seed * 1.37 + 0.5));
  float rCell = cHash(cell + seed * 3.71);
  float rCol = cHash(cell + seed * 5.13 + 11.0);
  float rInt = cHash(cell + seed * 2.31 + 23.0);
  vec2 f = fract(c);

  float gx, gy;            // glass coverage (x, y)
  vec3 glassAlb = vec3(0.13, 0.15, 0.16);
  float glassRough = 0.06 + 0.10 * cHash(cell + seed);
  vec3 wallAlb = base;
  float wallRough = 0.85, wallMetal = 0.0;
  float pLit = uWin * (0.30 + 0.35 * rs);
  float cool = 0.15;
  float litCell, litMean;
  float blank = 0.0;       // cell without a window

  if (style == 1 || style == 9) {
    // curtain wall: vertex colour = glass tint
    float mull = 0.07 / bw;
    gx = fpulse(mull, 1.0 - mull, c.x, w.x);
    gy = fpulse(0.26, 1.0, c.y, w.y);
    glassAlb = base * (0.9 + 0.2 * cHash(cell * 1.7 + seed));
    float spanSel = cHash(vec2(seed, 3.3));
    wallAlb = spanSel < 0.5 ? base * 0.42 : mix(vec3(0.20, 0.21, 0.22), vec3(0.08, 0.075, 0.07), cHash(vec2(seed, 9.1)));
    wallRough = 0.32; wallMetal = 0.7;
    glassRough = 0.03 + 0.07 * cHash(cell + seed * 1.3);
    cool = 0.55;
    // offices: whole floors lit
    litCell = (rFloor < pLit * 1.25 ? step(rCell, 0.9) : step(rCell, 0.07));
    litMean = min(pLit * 1.25, 1.0) * 0.9 + (1.0 - min(pLit * 1.25, 1.0)) * 0.07;
  } else if (style == 2) {
    gx = fpulse(0.24, 0.76, c.x, w.x);
    gy = fpulse(0.30, 0.82, c.y, w.y);
    litCell = step(rCell, pLit);
    litMean = pLit;
    // vertical streaks of grime (fade out when unresolvable)
    float st = cHash(vec2(floor(vFac.x / 1.3), seed));
    wallAlb *= 1.0 - (1.0 - far) * 0.12 * st;
  } else if (style == 3) {
    float mull = 0.05 / bw;
    gx = fpulse(mull, 1.0 - mull, c.x, w.x);
    gy = fpulse(0.36, 0.88, c.y, w.y);
    glassAlb = mix(vec3(0.08, 0.12, 0.13), vec3(0.14, 0.15, 0.17), rs);
    cool = 0.5;
    litCell = (rFloor < pLit * 1.15 ? step(rCell, 0.85) : step(rCell, 0.1));
    litMean = pLit;
  } else if (style == 4) {
    // residential: irregular, some blank cells, balconies implied by a darker band
    blank = step(cHash(vec2(cell.x, seed)), 0.28);
    gx = fpulse(0.30, 0.70, c.x, w.x) * (1.0 - blank * (1.0 - far)) * (1.0 - 0.28 * far);
    gy = fpulse(0.30, 0.76, c.y, w.y);
    glassAlb = vec3(0.06, 0.065, 0.07);
    litCell = step(rCell, pLit * 1.1);
    litMean = pLit * 1.1;
    cool = 0.08;
  } else {
    // industrial: corrugated walls, clerestory strip, roller doors
    float rib = fpulse(0.0, 0.5, vFac.x / 0.3, w.x * bw / 0.3);
    wallAlb *= 0.86 + 0.2 * rib;
    wallRough = 0.55; wallMetal = 0.2;
    gx = fpulse(0.08, 0.92, c.x, w.x);
    gy = fpulse(0.78, 0.9, c.y, w.y) * step(1.0, fh * 2.0);
    float door = step(rCell, 0.35) * (1.0 - step(4.6, vFac.y)) * fpulse(0.2, 0.8, c.x, w.x);
    wallAlb *= 1.0 - 0.45 * door;
    litCell = step(rCell, pLit * 0.4);
    litMean = pLit * 0.4;
    cool = 0.8;
  }

  // ground-floor shop fronts on commercial buildings
  float shop = 0.0;
  if ((style == 2 || style == 3) && rs > 0.35 && vFac.y < fh * 1.15 && vFac.y > 0.0) {
    shop = 1.0;
    gx = fpulse(0.04, 0.96, c.x, w.x);
    gy = (1.0 - smoothstep(fh * 0.92, fh * 0.97, vFac.y)) * smoothstep(0.1, 0.35, vFac.y);
    litCell = step(rCell, 0.45 + 0.4 * uLights);
    litMean = 0.45 + 0.4 * uLights;
    cool = 0.3;
  }

  float g = clamp(gx * gy, 0.0, 1.0);
  // wall: subtle large-scale variation + grime at the base
  wallAlb *= 0.9 + 0.18 * cNoise(vFac / vec2(9.0, 14.0) + seed * 17.0);
  wallAlb *= mix(0.72, 1.0, smoothstep(0.0, 3.5, vFac.y));
  alb = mix(wallAlb, glassAlb, g);
  rough = mix(wallRough, glassRough, g);
  metal = mix(wallMetal, 0.72, g);

  // window lights
  vec3 cellCol = winColor(rCol, cool);
  // TV flicker in a few residential windows
  if (style == 4 && rCol > 0.95) cellCol = vec3(0.45, 0.6, 1.0) * (0.6 + 0.4 * sin(uTime * 7.0 + rInt * 40.0) * sin(uTime * 2.3 + rCell * 9.0));
  float inten = (0.35 + 0.65 * rInt) * (0.8 + 0.35 * fract(c.y));         // ceiling lights: brighter towards the top
  vec3 lit = cellCol * inten * litCell * (1.0 - blank);
  vec3 meanCol = mix(vec3(1.0, 0.68, 0.40), vec3(0.8, 0.86, 1.0), cool * 0.8);
  vec3 litFar = meanCol * 0.68 * litMean;
  float shopBoost = 1.0 + shop * 1.4;
  emis += uWinE * shopBoost * g * mix(lit, litFar, far);
}
`;

/** Building material for merged meshes (aFac / aBld attributes) or for custom-instanced box buildings. */
export function createBuildingMaterial({ instanced = false, name = 'city.buildings' } = {}) {
  const mat = new THREE.MeshStandardMaterial({ name, vertexColors: true, roughness: 0.85, metalness: 0.0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, CITY_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
${CURVE_GLSL}
varying vec2 vFac;
varying vec4 vBld;
${instanced ? `
attribute vec4 iPos;     // x, y, z, rotation about Y
attribute vec4 iSize;    // width (x), wall height, depth (z), roof rise
attribute vec3 iWall;
attribute vec3 iRoof;
attribute vec2 iMisc;    // seed, wallStyle + 16 * roofStyle
attribute vec3 aUAx;
attribute float aPart;
attribute vec3 aOver;
` : `
attribute vec2 aFac;
attribute vec4 aBld;
`}`)
      .replace('#include <beginnormal_vertex>', instanced ? `
float cR = cos(iPos.w), sR = sin(iPos.w);
mat3 cRot = mat3(cR, 0.0, -sR, 0.0, 1.0, 0.0, sR, 0.0, cR);
float isRoof = step(0.5, aPart);
vec3 cSc = vec3(iSize.x, mix(iSize.y, max(iSize.w, 0.05), isRoof), iSize.z);
vec3 objectNormal = cRot * normalize(normal / cSc);
` : '#include <beginnormal_vertex>')
      .replace('#include <begin_vertex>', instanced ? `
vec3 cLp = vec3(position.x * iSize.x, min(position.y, 1.0) * iSize.y + max(position.y - 1.0, 0.0) * iSize.w, position.z * iSize.z);
cLp += aOver * vec3(0.45, 0.45 * iSize.w / max(iSize.z * 0.5, 0.5), 0.45);
vec3 transformed = cRot * cLp + iPos.xyz;
float cStyleW = mod(iMisc.y, 16.0), cStyleR = floor(iMisc.y / 16.0);
float cSt = isRoof > 0.5 ? cStyleR : cStyleW;
vFac = isRoof > 0.5 ? (cStyleR > 6.5 ? vec2(cLp.x * sign(position.z + 1e-3), cLp.y) : (cRot * cLp).xz + iPos.xz) : vec2(dot(cLp, aUAx) + iMisc.x * 13.0, cLp.y);
vBld = vec4(cSt, iMisc.x, cSt > 11.5 ? 2.6 : (cSt > 4.5 ? max(iSize.y, 3.0) : 2.9), cSt > 4.5 ? 6.0 : 3.1);
` : `
#include <begin_vertex>
vFac = aFac;
vBld = aBld;
`)
      .replace('#include <color_vertex>', instanced ? `
vColor = vec4(1.0);
vColor.rgb = step(0.5, aPart) > 0.5 ? iRoof : iWall;
` : '#include <color_vertex>')
      .replace('#include <project_vertex>', `
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = viewMatrix * cityCurve(modelMatrix * mvPosition);
gl_Position = projectionMatrix * mvPosition;
`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FACADE_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 cAlb = diffuseColor.rgb;
  cityFacade(cAlb, roughnessFactor, metalnessFactor, totalEmissiveRadiance);
  diffuseColor.rgb = cAlb;
}`);
  };
  mat.customProgramCacheKey = () => `${name}|${instanced ? 'inst' : 'merged'}`;
  return mat;
}

// ----------------------------------------------------------------------------- trees
/**
 * Custom-instanced vegetation: iPos (x, y, z, scale), iCol (rgb, height stretch).
 * Shrinks to nothing between 7 and 9.5 km (sub-pixel anyway; the terrain carries the colour).
 */
export function createTreeMaterial(name = 'city.trees') {
  const mat = new THREE.MeshStandardMaterial({ name, vertexColors: true, roughness: 0.88, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, CITY_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
${CURVE_GLSL}
attribute vec4 iPos;
attribute vec4 iCol;
attribute float aTrunk;
varying float vTrunk;
`)
      .replace('#include <beginnormal_vertex>', `
float tA = fract(iPos.x * 0.0137 + iPos.z * 0.0291) * 6.2831;
float tC = cos(tA), tS = sin(tA);
mat3 tRot = mat3(tC, 0.0, -tS, 0.0, 1.0, 0.0, tS, 0.0, tC);
vec3 objectNormal = tRot * normalize(normal * vec3(1.0, 1.0 / max(iCol.w, 0.3), 1.0));
`)
      .replace('#include <begin_vertex>', `
vec4 tW = modelMatrix * vec4(iPos.xyz, 1.0);
float tD = length(tW.xyz - uCamPos);
float tFade = 1.0 - smoothstep(7000.0, 9500.0, tD);
vec3 transformed = tRot * (position * vec3(1.0, iCol.w, 1.0)) * iPos.w * tFade + iPos.xyz;
vTrunk = aTrunk;
`)
      .replace('#include <color_vertex>', `
vColor = vec4(1.0);
vColor.rgb = mix(iCol.rgb * (0.55 + 0.5 * smoothstep(-0.2, 1.0, position.y / max(1.0, 1.0))), vec3(0.075, 0.06, 0.045), aTrunk);
`)
      .replace('#include <project_vertex>', `
vec4 mvPosition = viewMatrix * cityCurve(modelMatrix * vec4(transformed, 1.0));
gl_Position = projectionMatrix * mvPosition;
`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vTrunk;`);
  };
  mat.customProgramCacheKey = () => name;
  return mat;
}

// ----------------------------------------------------------------------------- roads
/**
 * Road ribbons: uv.x = lateral metres from the centreline, uv.y = metres along;
 * aRoad = (half width, lanes per direction, type, median half width).
 * type 0 highway, 1 arterial, 2 town street, 3 rail, 4 rural road, 5 pier deck.
 * Lifted towards the camera with distance to beat the coarse terrain LOD.
 */
export function createRoadMaterial(name = 'city.roads') {
  const mat = new THREE.MeshStandardMaterial({ name, roughness: 0.9, metalness: 0, color: 0xffffff });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, CITY_U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
${CURVE_GLSL}
attribute vec4 aRoad;
attribute vec2 aUv;
varying vec4 vRoad;
varying vec2 vRuv;
`)
      .replace('#include <project_vertex>', `
vRoad = aRoad;
vRuv = aUv;
vec4 rW = modelMatrix * vec4(transformed, 1.0);
float rD = length(rW.xyz - uCamPos);
rW.xyz += uUp * (0.05 + rD * 0.00028);
vec4 mvPosition = viewMatrix * cityCurve(rW);
gl_Position = projectionMatrix * mvPosition;
`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uLights;
varying vec4 vRoad;
varying vec2 vRuv;
${HASH_GLSL}
float pInt(float t, float a, float b) { return floor(t) * (b - a) + clamp(fract(t), a, b) - a; }
float fpulse(float a, float b, float x, float w) { w = max(w, 1e-4); return clamp((pInt(x + 0.5 * w, a, b) - pInt(x - 0.5 * w, a, b)) / w, 0.0, 1.0); }
// anti-aliased line of width lw centred at x0 (metres), pixel footprint pw
float aLine(float x, float x0, float lw, float pw) {
  float ww = max(lw, pw);
  return (1.0 - smoothstep(ww * 0.5 - pw * 0.5, ww * 0.5 + pw * 0.5, abs(x - x0))) * min(1.0, lw / pw);
}
`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float x = vRuv.x, y = vRuv.y;
  float hw = vRoad.x, lanes = vRoad.y, type = vRoad.z, med = vRoad.w;
  vec2 fw = fwidth(vRuv);
  float pw = max(max(fw.x, fw.y), 0.01);
  float ax = abs(x);
  float n = cNoise(vec2(x, y) / 6.0) * 0.6 + cNoise(vec2(x, y) / 1.3) * 0.4;
  vec3 asph = vec3(0.055, 0.056, 0.058) * (0.85 + 0.3 * n);
  // tyre polish / oil in the lanes
  vec3 col = asph;
  float paint = 0.0;
  vec3 paintCol = vec3(0.62, 0.62, 0.6);
  float rough = 0.88;
  if (type < 0.5 || type > 0.5 && type < 1.5) {
    float lw = 3.6;
    float cw = med + lanes * lw;                    // carriageway edge
    // median: concrete barrier (highway) or planted strip (arterial)
    if (ax < med) {
      if (type < 0.5) col = mix(vec3(0.22, 0.215, 0.2), col, smoothstep(0.35, 0.6, ax));
      else col = vec3(0.05, 0.075, 0.03) * (0.8 + 0.4 * n);
    }
    // edge lines (solid), lane lines (dashed 3 m / 9 m)
    paint += aLine(ax, cw - 0.3, 0.2, pw);
    paint += aLine(ax, med + 0.35, 0.15, pw) * (type < 0.5 ? 1.0 : 0.0);
    float dash = fpulse(0.0, 0.25, y / 12.0, fw.y / 12.0);
    for (int i = 1; i < 4; i++) {
      if (float(i) >= lanes) break;
      paint += aLine(ax, med + float(i) * lw, 0.15, pw) * dash;
    }
    if (type > 0.5) { paintCol = mix(paintCol, vec3(0.6, 0.45, 0.1), step(ax, med + 0.5)); paint += aLine(ax, med + 0.25, 0.12, pw); }
    // shoulder
    if (ax > cw) col = mix(col, vec3(0.085, 0.082, 0.078) * (0.85 + 0.3 * n), 0.7);
    // wear in the wheel paths
    float lanePos = fract((ax - med) / lw);
    col *= 1.0 - 0.06 * (fpulse(0.2, 0.33, lanePos, fw.x / lw) + fpulse(0.67, 0.8, lanePos, fw.x / lw));
  } else if (type < 2.5) {
    paint += aLine(x, 0.0, 0.12, pw) * fpulse(0.0, 0.4, y / 9.0, fw.y / 9.0);
    paintCol = vec3(0.6, 0.6, 0.58);
  } else if (type < 3.5) {
    // railway: ballast bed, sleepers, two rails
    col = vec3(0.12, 0.105, 0.09) * (0.75 + 0.5 * n);
    float sl = fpulse(0.0, 0.35, y / 0.65, fw.y / 0.65) * step(ax, 1.3);
    col = mix(col, vec3(0.09, 0.075, 0.06), sl * 0.8);
    float rail = aLine(ax, 0.75, 0.08, pw);
    col = mix(col, vec3(0.32, 0.3, 0.29), rail);
    rough = mix(rough, 0.35, rail);
  } else if (type < 4.5) {
    col = asph * 1.25;
    paint += aLine(ax, hw - 0.4, 0.12, pw) * 0.6;
  } else {
    // pier deck: timber boards
    col = vec3(0.16, 0.12, 0.085) * (0.8 + 0.35 * cHash(vec2(floor(y / 0.25), 3.0)));
    col *= 1.0 - 0.3 * fpulse(0.0, 0.08, y / 0.25, fw.y / 0.25);
    rough = 0.8;
  }
  col = mix(col, paintCol, clamp(paint, 0.0, 1.0) * 0.9);
  // street-light pools at night (sodium on arterials / town, LED on highways)
  if (type < 2.5 || type > 4.5) {
    float sp = type < 0.5 ? 50.0 : 36.0;
    float py = fract(y / sp) - 0.5;
    float side = mod(floor(y / sp), 2.0) * 2.0 - 1.0;
    float lx = type < 0.5 ? 0.0 : side * (hw - 1.0);
    float pool = exp(-(py * py * sp * sp) / (2.0 * 9.0 * 9.0)) * exp(-pow(x - lx, 2.0) / (2.0 * 10.0 * 10.0));
    float far = smoothstep(4.0, 30.0, pw);
    pool = mix(pool, 0.32, far);
    vec3 lc = type < 0.5 ? vec3(1.0, 0.86, 0.66) : vec3(1.0, 0.55, 0.2);
    totalEmissiveRadiance += lc * pool * uLights * 0.05;
  }
  diffuseColor.rgb = col;
  roughnessFactor = rough;
}`);
  };
  mat.customProgramCacheKey = () => name;
  return mat;
}

// ----------------------------------------------------------------------------- light points
const POINT_VERT = /* glsl */`
${CURVE_GLSL}
uniform float uLights;
uniform float uTime;
uniform float uPx;
uniform float uFogD;
attribute vec3 aCol;     // HDR colour (radiance of the lamp core)
attribute vec4 aP;       // size (m), blink period (s, 0 = steady), phase, kind (0 street, 1 always, 2 night-only warning)
varying vec3 vCol;
void main() {
  vec4 wp = cityCurve(modelMatrix * vec4(position, 1.0));
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float d = max(-mv.z, 1.0);
  float on = aP.w < 0.5 ? uLights : (aP.w < 1.5 ? 1.0 : max(uLights, 0.0));
  if (aP.y > 0.0) on *= step(fract(uTime / aP.y + aP.z), 0.3);
  float size = aP.x * uPx / d;
  float k = 1.0;
  float minS = 2.2;
  if (size < minS) { k = size * size / (minS * minS); size = minS; }
  float fog = exp(-uFogD * uFogD * d * d);
  vCol = aCol * on * k * fog;
  gl_PointSize = min(size, 48.0);
  if (on * k * fog < 1e-4) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const POINT_FRAG = /* glsl */`
varying vec3 vCol;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float r2 = dot(p, p) * 4.0;
  float a = exp(-r2 * 5.0) + 0.12 * exp(-r2 * 1.2);
  gl_FragColor = vec4(vCol * a, 1.0);
}`;

export function createPointMaterial(name = 'city.points') {
  return new THREE.ShaderMaterial({
    name,
    uniforms: CITY_U,
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
  });
}
