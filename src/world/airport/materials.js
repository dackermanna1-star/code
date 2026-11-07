// =============================================================================
// Shared materials of the airport module.
//
// Pavement materials are MeshStandardMaterials patched with onBeforeCompile:
// they receive the airport-local position (vAP) and paint markings, rubber,
// slab joints, stains, grooves and the apron floodlight pools procedurally,
// so one opaque pavement layer carries everything (no decal z-fighting).
// =============================================================================
import * as THREE from 'three';
import { RUNWAY } from '../layout.js';
import { noiseTexture } from './util.js';

export const MAX_FLOODS = 24;
export const MAX_OPENINGS = 16;

/** Uniforms shared by every patched airport material (one object per airport for per-airport data). */
export function createShared(app) {
  const noise = noiseTexture(256, 11);
  noise.anisotropy = 4;
  const shared = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uNoise: { value: noise },
    uFloodCol: { value: new THREE.Color(1.0, 0.78, 0.52) },
    uResY: { value: 1080 },
  };
  const tex = (name, repeat) => app.assets.pbr(`assets/textures/${name}`, { repeat, maps: ['color', 'normal', 'roughness'] });
  const asphalt = tex('airport-asphalt', [1, 1]);
  const concrete = tex('airport-concrete', [1, 1]);
  return { shared, asphalt, concrete, noise };
}

// --------------------------------------------------------------------------- GLSL
const COMMON = /* glsl */`
uniform float uTime;
uniform float uNight;
uniform sampler2D uNoise;
uniform vec4 uFlood[${MAX_FLOODS}];
uniform vec3 uFloodCol;
varying vec3 vAP;
varying vec3 vTX;
float cov1(float x, float fw, float lo, float hi) {
  fw = max(fw, 1e-4);
  return clamp((min(x + 0.5 * fw, hi) - max(x - 0.5 * fw, lo)) / fw, 0.0, 1.0);
}
float covBox(vec2 p, vec2 fw, vec2 lo, vec2 hi) { return cov1(p.x, fw.x, lo.x, hi.x) * cov1(p.y, fw.y, lo.y, hi.y); }
float perF(float x, float P, float a, float w) { float k = floor((x - a) / P); float r = x - a - k * P; return k * w + min(r, w); }
float covPer(float x, float fw, float P, float a, float w) {
  fw = max(fw, 1e-4);
  return clamp((perF(x + 0.5 * fw, P, a, w) - perF(x - 0.5 * fw, P, a, w)) / fw, 0.0, 1.0);
}
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec4 nz(vec2 p) { return texture2D(uNoise, p); }
// apron floodlights (analytic pools of light on the pavement)
vec3 floodLight(vec3 p) {
  vec3 e = vec3(0.0);
  if (uNight < 0.01) return e;
  for (int i = 0; i < ${MAX_FLOODS}; i++) {
    vec4 f = uFlood[i];
    if (f.w <= 0.0) continue;
    vec3 L = f.xyz - p;
    float d2 = dot(L, L);
    float cosT = L.y * inversesqrt(d2);
    e += f.w * cosT * cosT * cosT / d2;
  }
  return e * uFloodCol * uNight;
}
`;

const VERT_DECL = /* glsl */`varying vec3 vAP;\nvarying vec3 vTX;\n`;
const VERT_BODY = /* glsl */`vAP = position;\nvTX = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));\n`;

function patch(mat, key, uniforms, { fragDecl = '', colorCode = '', roughCode = '', normalCode = '', emissiveCode = '' }) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}\n${fragDecl}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\nvec2 fwAP = vec2(fwidth(vAP.x), fwidth(vAP.z));\nfloat paintA = 0.0; float rubberA = 0.0; float wetA = 0.0; float groove = 0.0;\n${colorCode}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${roughCode}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${normalCode}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * floodLight(vAP) * 0.3183;\n${emissiveCode}`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/**
 * Runway (with shoulders + blast pads) material.  Markings to ICAO Annex 14 for a
 * 45 m precision-instrument runway: threshold piano keys, designators, centreline,
 * aiming point, touchdown-zone marks, edge lines, blast pad chevrons; grooves and
 * rubber deposits in the touchdown zones.
 */
export function runwayMaterial(ctx, airport, digitsTex) {
  const { shared, asphalt } = ctx;
  const u = {
    ...shared,
    uDigits: { value: digitsTex },
    uOpen: { value: airport.openings },
  };
  const m = new THREE.MeshStandardMaterial({ name: 'airport-runway', ...asphalt, roughness: 1, metalness: 0, envMapIntensity: 0.6 });
  return patch(m, 'apt-runway', u, {
    fragDecl: /* glsl */`
uniform sampler2D uDigits;
uniform vec3 uOpen[${MAX_OPENINGS}];
const float X0 = ${RUNWAY.x0.toFixed(1)};
const float X1 = ${RUNWAY.x1.toFixed(1)};
`,
    colorCode: /* glsl */`
{
  vec3 p = vAP;
  float ax = p.x;
  bool west = ax < 0.0;
  float t = west ? ax - X0 : X1 - ax;            // distance from the nearest threshold
  float y = west ? p.z : -p.z;                   // lateral, to the right of the landing direction
  float ay = abs(y);
  float fwt = fwAP.x, fwy = fwAP.y;
  float onRwy = cov1(ay, fwy, -1.0, 22.5) * cov1(t, fwt, 0.0, 9999.0);
  // --- base asphalt: tint + macro variation + repair patches
  vec4 n1 = nz(p.xz / 260.0), n2 = nz(p.xz / 37.0 + 0.3);
  float macro = 0.86 + 0.22 * (n1.r - 0.5) + 0.12 * (n2.g - 0.5);
  vec3 base = diffuseColor.rgb * vec3(0.56, 0.57, 0.6) * macro;
  // shoulders: older, lighter, no grooves (except where a taxiway enters)
  float sh = cov1(ay, fwy, 22.5, 99.0);
  float open = 0.0;
  for (int i = 0; i < ${MAX_OPENINGS}; i++) {
    vec3 o = uOpen[i];
    if (o.z == 0.0) continue;
    if (sign(p.z) == o.z) open = max(open, cov1(p.x, fwt, o.x, o.y));
  }
  sh *= 1.0 - open;
  base = mix(base, diffuseColor.rgb * vec3(0.66, 0.66, 0.66) * (0.9 + 0.2 * n2.b), sh);
  // blast pad beyond the thresholds
  float pad = 1.0 - cov1(t, fwt, 0.0, 9999.0);
  base = mix(base, diffuseColor.rgb * vec3(0.62, 0.61, 0.6) * (0.85 + 0.25 * n1.g), pad);
  // --- markings (white)
  float w = 0.0;
  w = max(w, cov1(ay, fwy, 21.6, 22.5) * cov1(t, fwt, 0.0, 9999.0));                                  // edge lines
  w = max(w, cov1(t, fwt, 6.0, 36.0) * covPer(ay, fwy, 3.6, 1.8, 1.8) * cov1(ay, fwy, 1.8, 21.6));   // threshold piano keys
  if (t > 46.0 && t < 59.0 && ay < 7.0) {                                                           // designator
    vec2 duv = vec2((y + 6.0) / 12.0, (t - 48.0) / 9.0);
    if (duv.y > 0.0 && duv.y < 1.0 && duv.x > 0.0 && duv.x < 1.0) {
      duv.x = duv.x * 0.5 + (west ? 0.0 : 0.5);
      w = max(w, texture2D(uDigits, duv).r);
    }
  }
  w = max(w, covPer(ax, fwt, 50.0, 10.0, 30.0) * cov1(abs(p.z), fwy, 0.0, 0.45) * cov1(t, fwt, 66.0, 9999.0));  // centreline
  w = max(w, cov1(t, fwt, 277.5, 322.5) * cov1(ay, fwy, 9.0, 16.5));                                     // aiming point
  // touchdown zone: stripes 22.5 m long, 1.8 m wide, 1.5 m apart
  float tz = 0.0;
  tz = max(tz, cov1(t, fwt, 150.0, 172.5) * covPer(ay - 9.0, fwy, 3.3, 0.0, 1.8) * cov1(ay, fwy, 9.0, 18.9));
  tz = max(tz, cov1(t, fwt, 450.0, 472.5) * covPer(ay - 9.0, fwy, 3.3, 0.0, 1.8) * cov1(ay, fwy, 9.0, 15.6));
  tz = max(tz, cov1(t, fwt, 600.0, 622.5) * covPer(ay - 9.0, fwy, 3.3, 0.0, 1.8) * cov1(ay, fwy, 9.0, 15.6));
  tz = max(tz, cov1(t, fwt, 750.0, 772.5) * cov1(ay, fwy, 9.0, 10.8));
  tz = max(tz, cov1(t, fwt, 900.0, 922.5) * cov1(ay, fwy, 9.0, 10.8));
  w = max(w, tz);
  w *= onRwy;
  // paint wear (aircraft wheels, weather)
  float wear = 0.82 + 0.18 * smoothstep(0.25, 0.6, nz(p.xz / vec2(9.0, 2.1)).a);
  w *= wear;
  // blast pad chevrons (yellow)
  float chev = covPer(-t + ay * 0.9, max(fwt, fwy) * 1.3, 30.0, 0.0, 1.0) * pad * cov1(t, fwt, -58.0, -1.0) * cov1(ay, fwy, 0.0, 21.0);
  // --- rubber deposits in the touchdown zones (streaky along the wheel tracks)
  float zone = smoothstep(60.0, 220.0, t) * (1.0 - smoothstep(700.0, 1300.0, t));
  float tracks = exp(-pow((ay - 2.9) / 2.6, 2.0)) + 0.55 * exp(-pow(ay / 1.4, 2.0)) + 0.25 * exp(-pow((ay - 6.5) / 3.0, 2.0));
  float streak = nz(vec2(p.x / 140.0, p.z / 1.7)).r * 0.7 + nz(vec2(p.x / 31.0, p.z / 0.9)).g * 0.6;
  rubberA = clamp(zone * tracks * smoothstep(0.35, 0.95, streak) * 1.25, 0.0, 0.92) * onRwy;
  rubberA += onRwy * 0.10 * exp(-pow(ay / 4.0, 2.0)) * (0.6 + 0.4 * n2.r);    // general traffic darkening on the centre
  // grooves slightly darken the surface where present
  groove = onRwy * (1.0 - smoothstep(0.004, 0.03, fwt));
  base *= 1.0 - 0.06 * onRwy;
  vec3 col = mix(base, vec3(0.62, 0.63, 0.64) * (0.92 + 0.1 * n2.a), w);
  col = mix(col, vec3(0.62, 0.42, 0.06), chev * 0.85);
  col = mix(col, vec3(0.018, 0.018, 0.02), rubberA);
  // centreline / touchdown light fixtures (flush-mounted discs)
  float fxl = covPer(ax, fwt, 15.0, 7.2, 0.6) * cov1(p.z, fwy, 0.3, 0.9) * cov1(t, fwt, 0.0, 9999.0);
  col = mix(col, vec3(0.08), fxl * 0.8);
  diffuseColor.rgb = col;
  paintA = max(w, chev);
}
`,
    roughCode: /* glsl */`
roughnessFactor = clamp(roughnessFactor * 0.9 + 0.08, 0.45, 1.0);
roughnessFactor = mix(roughnessFactor, 0.62, paintA);
roughnessFactor = mix(roughnessFactor, 0.55, rubberA * 0.7);
`,
    normalCode: /* glsl */`
if (groove > 0.01) {
  // transverse grooves (38 mm pitch) – a fine anisotropic ripple in the normal
  float g = sin(vAP.x * 165.3);
  normal = normalize(normal + normalize(vTX) * g * 0.22 * groove * (1.0 - paintA * 0.7));
}
`,
  });
}

/** Asphalt taxiways (+ shoulders) with crack sealing and macro variation. */
export function taxiwayMaterial(ctx) {
  const { shared, asphalt } = ctx;
  const m = new THREE.MeshStandardMaterial({ name: 'airport-taxiway', ...asphalt, roughness: 1, metalness: 0, envMapIntensity: 0.6 });
  return patch(m, 'apt-taxi', { ...shared }, {
    colorCode: /* glsl */`
{
  vec3 p = vAP;
  vec4 n1 = nz(p.xz / 300.0 + 0.11), n2 = nz(p.xz / 45.0 + 0.7);
  float macro = 0.84 + 0.24 * (n1.g - 0.5) + 0.14 * (n2.r - 0.5);
  vec3 col = diffuseColor.rgb * vec3(0.6, 0.6, 0.62) * macro;
  // sealed cracks (thin dark meandering lines)
  float c = abs(nz(p.xz / 23.0).b - 0.5);
  float fw = max(fwAP.x, fwAP.y);
  float crack = (1.0 - smoothstep(0.0022, 0.0022 + fw * 0.06, c)) * (1.0 - smoothstep(0.05, 0.25, fw)) * smoothstep(0.45, 0.7, nz(p.xz / 61.0 + 0.5).g);
  col = mix(col, vec3(0.025), crack * 0.55);
  // patch repairs: darker rectangles
  vec2 cell = floor(p.xz / vec2(17.0, 11.0));
  float h = hash12(cell);
  vec2 f = fract(p.xz / vec2(17.0, 11.0));
  float patchA = step(0.86, h) * step(0.15, f.x) * step(f.x, 0.75) * step(0.2, f.y) * step(f.y, 0.85);
  col = mix(col, col * 0.62, patchA);
  // traffic polish / darkening along the centreline
  diffuseColor.rgb = col;
  rubberA = crack;
}
`,
    roughCode: /* glsl */`roughnessFactor = clamp(roughnessFactor * 0.9 + 0.1, 0.5, 1.0); roughnessFactor = mix(roughnessFactor, 0.45, rubberA);`,
  });
}

/**
 * Apron concrete: 5 m slabs with sealed joints, per-slab tone, stains, tyre
 * marks and the stand markings (periodic stand cell canvas texture).
 */
export function apronMaterial(ctx, airport, standTex) {
  const { shared, concrete } = ctx;
  const u = {
    ...shared,
    uStand: { value: standTex },
    uStandRange: { value: new THREE.Vector4(airport.standX0, airport.standX1, airport.standZ0, airport.standZ1) },
    uStandPitch: { value: 50 },
    uGateZ: { value: airport.gateZ },
  };
  const m = new THREE.MeshStandardMaterial({ name: 'airport-apron', ...concrete, roughness: 1, metalness: 0, envMapIntensity: 0.7 });
  return patch(m, 'apt-apron', u, {
    fragDecl: /* glsl */`
uniform sampler2D uStand;
uniform vec4 uStandRange;
uniform float uStandPitch;
uniform float uGateZ;
`,
    colorCode: /* glsl */`
{
  vec3 p = vAP;
  vec4 n1 = nz(p.xz / 210.0 + 0.4), n2 = nz(p.xz / 29.0 + 0.2), n3 = nz(p.xz / 6.0);
  vec2 slab = floor(p.xz / 5.0);
  float h = hash12(slab), h2 = hash12(slab + 17.0);
  float tone = 0.9 + 0.12 * (h - 0.5) + 0.2 * (n1.r - 0.5) + 0.08 * (n2.g - 0.5);
  vec3 col = diffuseColor.rgb * vec3(0.47, 0.465, 0.45) * tone;
  if (h2 > 0.93) col *= vec3(0.93, 0.95, 1.0);                        // replaced slabs (cooler, fresher)
  // joints: 5 m grid of dark sealant
  vec2 jf = fwAP;
  float jx = covPer(p.x + 0.02, jf.x * 1.2 + 0.001, 5.0, 0.0, 0.025);
  float jz = covPer(p.z + 0.02, jf.y * 1.2 + 0.001, 5.0, 0.0, 0.025);
  float joint = max(jx, jz) * (1.0 - smoothstep(0.05, 0.4, max(jf.x, jf.y)));
  col = mix(col, vec3(0.05, 0.05, 0.05), joint * 0.8);
  // stands (periodic cell): stains, tyre marks, markings
  float inStand = step(uStandRange.x, p.x) * step(p.x, uStandRange.y);
  float sx = p.x - uStandRange.x;
  float lx = mod(sx, uStandPitch) - 0.5 * uStandPitch;               // lateral offset from the stand centreline
  float lz = p.z - uGateZ;                                           // + = towards the tail (south)
  // oil / hydraulic stains under the nose gear, engines and APU
  float st = 0.0;
  st += exp(-dot(vec2(lx, lz + 15.6), vec2(lx, lz + 15.6)) / 3.5);
  st += 0.8 * exp(-(pow(abs(lx) - 4.9, 2.0) + pow(lz + 4.5, 2.0)) / 5.0);
  st += 0.6 * exp(-(pow(abs(lx) - 2.9, 2.0) + pow(lz - 2.1, 2.0)) / 3.0);
  st += 0.5 * exp(-(lx * lx + pow(lz - 17.0, 2.0)) / 6.0);
  float blot = smoothstep(0.35, 0.75, n3.r * 0.6 + n2.b * 0.6);
  float stain = clamp(st * blot * 1.4, 0.0, 0.85) * inStand;
  // tyre marks along the lead-in line (nose wheel + main gear tracks)
  float tm = exp(-lx * lx / 0.08) * 0.5 + exp(-pow(abs(lx) - 2.86, 2.0) / 0.25);
  tm *= smoothstep(55.0, 0.0, lz) * smoothstep(-18.0, -12.0, lz) * smoothstep(0.3, 0.8, nz(vec2(p.x / 0.8, p.z / 25.0)).g);
  float tyre = clamp(tm * 0.5, 0.0, 0.5) * inStand;
  col = mix(col, vec3(0.035, 0.032, 0.03), stain * 0.75);
  col = mix(col, vec3(0.05), tyre);
  // general grime near the stands / under the bridges
  col *= 1.0 - 0.12 * inStand * smoothstep(-40.0, -15.0, lz) * (1.0 - smoothstep(25.0, 40.0, lz)) * n2.a;
  // painted stand markings
  vec4 mk = vec4(0.0);
  if (inStand > 0.5 && p.z >= uStandRange.z && p.z <= uStandRange.w) {
    vec2 suv = vec2(fract(sx / uStandPitch), (p.z - uStandRange.z) / (uStandRange.w - uStandRange.z));
    mk = texture2D(uStand, vec2(suv.x, 1.0 - suv.y));
  }
  float wear = 0.75 + 0.25 * smoothstep(0.2, 0.6, n3.g);
  col = mix(col, mk.rgb, mk.a * wear);
  diffuseColor.rgb = col;
  paintA = mk.a;
  wetA = stain;
}
`,
    roughCode: /* glsl */`
roughnessFactor = clamp(roughnessFactor * 0.85 + 0.12, 0.5, 1.0);
roughnessFactor = mix(roughnessFactor, 0.6, paintA);
roughnessFactor = mix(roughnessFactor, 0.32, wetA);
`,
  });
}

/** Generic concrete pads (hangar aprons, service areas) – joints, tone variation. */
export function padMaterial(ctx) {
  const { shared, concrete } = ctx;
  const m = new THREE.MeshStandardMaterial({ name: 'airport-pad', ...concrete, roughness: 1, metalness: 0, envMapIntensity: 0.7 });
  return patch(m, 'apt-pad', { ...shared }, {
    colorCode: /* glsl */`
{
  vec3 p = vAP;
  vec4 n1 = nz(p.xz / 160.0 + 0.8), n2 = nz(p.xz / 21.0);
  vec2 slab = floor(p.xz / 6.0);
  float tone = 0.88 + 0.1 * (hash12(slab) - 0.5) + 0.2 * (n1.b - 0.5);
  vec3 col = diffuseColor.rgb * vec3(0.46, 0.455, 0.45) * tone;
  float jx = covPer(p.x, fwAP.x * 1.2 + 0.001, 6.0, 0.0, 0.03);
  float jz = covPer(p.z, fwAP.y * 1.2 + 0.001, 6.0, 0.0, 0.03);
  col = mix(col, vec3(0.06), max(jx, jz) * 0.7 * (1.0 - smoothstep(0.05, 0.4, max(fwAP.x, fwAP.y))));
  col *= 0.9 + 0.12 * n2.r;
  diffuseColor.rgb = col;
}
`,
    roughCode: 'roughnessFactor = clamp(roughnessFactor * 0.85 + 0.12, 0.5, 1.0);',
  });
}

/**
 * Line-marking decals (strips along polylines).  Attributes:
 *   aSide  (vec2) lateral unit vector (x, z) of the strip
 *   aLine  (vec4) u-sign (±1), v (metres along), half-width of the painted pattern, type
 *   color  (vec3) paint colour
 * Types: 0 solid, 1 double (2 x 0.15 with 0.15 gap), 2 dashed (1 m / 1 m), 3 solid + black outline,
 *        4 dashed (3 m / 3 m), 5 white service-road dash
 * The strip widens with distance so thin lines fade out instead of aliasing.
 */
export function decalMaterial(ctx) {
  const { shared } = ctx;
  const m = new THREE.MeshStandardMaterial({ name: 'airport-paint', vertexColors: true, roughness: 0.62, metalness: 0, transparent: true, depthWrite: false, envMapIntensity: 0.5 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 aSide; attribute vec4 aLine; uniform float uResY;
varying vec3 vAP; varying vec3 vTX; varying vec2 vUV; varying float vType; varying float vHW;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 mv0 = modelViewMatrix * vec4(position, 1.0);
  float dist = length(mv0.xyz);
  float pix = dist * 2.0 / (projectionMatrix[1][1] * uResY);
  float hw = max(aLine.z + 0.12, 1.6 * pix);
  transformed.xz += aSide * hw * aLine.x;
  vUV = vec2(hw * aLine.x, aLine.y);
  vType = aLine.w; vHW = aLine.z;
  vAP = transformed;
  vTX = vec3(1.0, 0.0, 0.0);
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}\nvarying vec2 vUV; varying float vType; varying float vHW;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float u = vUV.x, v = vUV.y;
  float fu = max(fwidth(u), 1e-4), fv = max(fwidth(v), 1e-4);
  float a = 0.0; float black = 0.0;
  int ty = int(vType + 0.5);
  if (ty == 1) a = max(cov1(u, fu, -0.225, -0.075), cov1(u, fu, 0.075, 0.225));
  else a = cov1(u, fu, -vHW, vHW);
  if (ty == 2) a *= covPer(v, fv, 2.0, 0.0, 1.0);
  if (ty == 4) a *= covPer(v, fv, 6.0, 0.0, 3.0);
  if (ty == 5) a *= covPer(v, fv, 9.0, 0.0, 3.0);
  if (ty == 3) black = cov1(u, fu, -vHW - 0.1, vHW + 0.1) * (1.0 - a);
  float wear = 0.78 + 0.22 * smoothstep(0.25, 0.6, texture2D(uNoise, vAP.xz / vec2(7.0, 5.0)).a);
  diffuseColor.rgb = mix(vec3(0.03), diffuseColor.rgb, a / max(a + black, 1e-4));
  diffuseColor.a = (a * wear + black * 0.85);
  if (diffuseColor.a < 0.004) discard;
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * floodLight(vAP) * 0.3183;`);
  };
  m.customProgramCacheKey = () => 'apt-decal';
  return m;
}

// --------------------------------------------------------------------------- buildings
/**
 * Curtain-wall glass with a parallax interior ("interior mapping"): the view ray
 * is traced into a virtual hall behind the facade (floor, ceiling with light
 * panels, back wall with shop fronts / gate signage, columns, seat rows and
 * people silhouettes).  The standard material provides the sky reflection.
 *   params: { floorY, ceilY, depth, mullion: [uPitch, vPitch], level, warm }
 */
export function glassMaterial(ctx, params = {}) {
  const { shared } = ctx;
  const u = {
    ...shared,
    uCamAP: ctx.camAP,
    uRoom: { value: new THREE.Vector4(params.floorY ?? 5, params.ceilY ?? 14, params.depth ?? 26, params.level ?? 1) },
    uMull: { value: new THREE.Vector4(params.mullion?.[0] ?? 1.5, params.mullion?.[1] ?? 3.0, params.mullionY0 ?? 0, params.people ?? 1) },
    uWarm: { value: new THREE.Color(params.warm ?? 0xfff0d8) },
    uGates: { value: params.gates || new THREE.Vector4(0, 0, 0, 0) },
  };
  const m = new THREE.MeshStandardMaterial({ name: 'airport-glass', color: 0x06080a, roughness: 0.05, metalness: 0.0, envMapIntensity: 2.6 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAP;\nvarying vec3 vAN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAP = position; vAN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime; uniform float uNight; uniform sampler2D uNoise;
uniform vec3 uCamAP; uniform vec4 uRoom; uniform vec4 uMull; uniform vec3 uWarm; uniform vec4 uGates;
varying vec3 vAP; varying vec3 vAN;
float gh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gcov(float x, float fw, float lo, float hi) { fw = max(fw, 1e-4); return clamp((min(x + 0.5 * fw, hi) - max(x - 0.5 * fw, lo)) / fw, 0.0, 1.0); }
float gperF(float x, float P, float a, float w) { float k = floor((x - a) / P); float r = x - a - k * P; return k * w + min(r, w); }
float gper(float x, float fw, float P, float a, float w) { fw = max(fw, 1e-4); return clamp((gperF(x + 0.5 * fw, P, a, w) - gperF(x - 0.5 * fw, P, a, w)) / fw, 0.0, 1.0); }
vec3 ceilingAt(vec2 c, float lvl) {
  // linear light bands every 3 m across, 6 m along; coffered panels
  float band = smoothstep(0.42, 0.36, abs(fract(c.x / 3.0) - 0.5)) * smoothstep(0.3, 0.22, abs(fract(c.y / 6.0) - 0.5));
  float lamp = (1.0 - smoothstep(0.03, 0.06, abs(fract(c.x / 3.0) - 0.5))) * step(abs(fract(c.y / 6.0) - 0.5), 0.35);
  return vec3(0.16, 0.16, 0.155) * (0.6 + 0.4 * band) * lvl + uWarm * lamp * 3.0 * lvl;
}
vec3 interior(vec3 ro, vec3 rd, float fwu) {
  float floorY = uRoom.x, ceilY = uRoom.y, D = uRoom.z, lvl = uRoom.w;
  float tB = D / rd.z;
  float tF = rd.y < 0.0 ? (floorY - ro.y) / rd.y : 1e6;
  float tC = rd.y > 0.0 ? (ceilY - ro.y) / rd.y : 1e6;
  float t = min(tB, min(tF, tC));
  vec3 h = ro + rd * t;
  vec3 col;
  if (t == tC) col = ceilingAt(h.xz, lvl);
  else if (t == tF) {
    // polished floor with a blurred reflection of the ceiling lights
    float tm = (ceilY - floorY) / max(-rd.y, 0.05);
    vec2 rc = h.xz + rd.xz * tm;
    float tile = 0.92 + 0.08 * gh(floor(h.xz / 1.2));
    col = vec3(0.07, 0.068, 0.064) * lvl * tile + ceilingAt(rc, lvl) * 0.16 * smoothstep(0.0, 0.4, -rd.y);
  } else {
    // back wall: shop fronts / lounges with signage above
    float seg = floor(h.x / 9.0);
    float r = gh(vec2(seg, 3.1));
    float y = h.y - floorY;
    vec3 shop = mix(vec3(0.9, 0.75, 0.55), vec3(0.55, 0.7, 0.9), step(0.6, r)) * (0.12 + 0.2 * r);
    col = y < 4.0 ? shop * lvl : vec3(0.1, 0.1, 0.1) * lvl;
    float sign = step(4.3, y) * step(y, 5.1) * step(0.25, fract(h.x / 9.0)) * step(fract(h.x / 9.0), 0.75);
    col += sign * mix(vec3(1.0, 0.85, 0.3), vec3(0.3, 0.6, 1.0), step(0.5, gh(vec2(seg, 7.7)))) * 0.9 * lvl;
  }
  // columns (every 18 m, 2.5 m behind the glass)
  float tc = 2.5 / rd.z;
  if (tc < t) {
    vec3 hc = ro + rd * tc;
    float cu = abs(fract(hc.x / 18.0 + 0.25) - 0.5) * 18.0;
    if (cu < 0.45 && hc.y > floorY && hc.y < ceilY) { col = vec3(0.12, 0.12, 0.12) * lvl * (0.7 + 0.3 * smoothstep(0.45, 0.0, cu)); t = tc; }
  }
  // gate lounge: seat rows and people silhouettes on two planes
  for (int k = 0; k < 3; k++) {
    float d = k == 0 ? 1.4 : (k == 1 ? 3.1 : 5.6);
    float tp = d / rd.z;
    if (tp > t) continue;
    vec3 hp = ro + rd * tp;
    float y = hp.y - floorY;
    if (y < 0.0 || y > 2.0) continue;
    float gate = 1.0 - smoothstep(10.0, 22.0, abs(mod(hp.x - uGates.x + 0.5 * uGates.y, uGates.y) - 0.5 * uGates.y));
    if (k == 2 && y < 0.9) {
      float seat = step(0.12, fract(hp.x / 0.6)) * step(0.45, y) * gate;
      if (seat > 0.5) { col = vec3(0.02, 0.025, 0.035) * lvl; t = tp; continue; }
    }
    float slot = floor(hp.x / 0.8 + float(k) * 0.37);
    float rr = gh(vec2(slot, float(k) * 13.0));
    float present = step(rr, (0.08 + 0.32 * gate) * uMull.w);
    float fx = fract(hp.x / 0.8 + float(k) * 0.37) - 0.5;
    float ht = 1.55 + 0.3 * gh(vec2(slot, 5.0 + float(k)));
    float seated = step(0.6, gh(vec2(slot, 9.0))) * step(1.5, float(k));
    ht = mix(ht, 1.25, seated);
    float body = step(abs(fx), 0.27) * step(y, ht - 0.25);
    float head = step(length(vec2(fx * 0.8, y - (ht - 0.13))), 0.12);
    if (present * max(body, head) > 0.5) {
      vec3 cl = vec3(gh(vec2(slot, 1.0)), gh(vec2(slot, 2.0)), gh(vec2(slot, 3.0)));
      col = mix(vec3(0.01), cl * 0.05, 0.6) * lvl;
      t = tp;
    }
  }
  return col;
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec3 gN = normalize(vec3(vAN.x, 0.0, vAN.z));
vec3 gT = vec3(gN.z, 0.0, -gN.x);
float gu = dot(vAP, gT), gv = vAP.y;
vec3 gRd = normalize(vAP - uCamAP);
vec3 rdl = vec3(dot(gRd, gT), gRd.y, max(-dot(gRd, gN), 1e-3));
float fwu = fwidth(gu), fwv = fwidth(gv);
// mullions / transoms
float mull = max(gper(gu, fwu, uMull.x, 0.0, 0.07), gper(gv - uMull.z, fwv, uMull.y, 0.0, 0.1));
vec3 intCol = interior(vec3(gu, gv, 0.0), rdl, fwu);
float cosV = clamp(-dot(gRd, gN), 0.0, 1.0);
float trans = (1.0 - mull) * 0.55 * (1.0 - pow(1.0 - cosV, 4.0));
float intensity = mix(1.0, 1.7, uNight);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.165, 0.17), mull);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.4, mull);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += intCol * trans * intensity;');
  };
  m.customProgramCacheKey = () => 'apt-glass';
  return m;
}

/** Vertex-coloured building materials (shared per airport). */
export function buildingMaterials(ctx) {
  const { concrete, shared } = ctx;
  const corrugated = new THREE.MeshStandardMaterial({ name: 'apt-corrugated', vertexColors: true, roughness: 0.5, metalness: 0.55, envMapIntensity: 0.8 });
  corrugated.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCAP; varying vec3 vCN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCAP = position; vCN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCAP; varying vec3 vCN; uniform sampler2D uNoise;')
      .replace('#include <map_fragment>', `#include <map_fragment>
float cH = abs(vCN.y) < 0.5 ? dot(vCAP.xz, normalize(vec2(-vCN.z, vCN.x))) : vCAP.x;
float cfw = fwidth(cH);
float cWave = sin(cH * 31.4159) * (1.0 - smoothstep(0.02, 0.08, cfw));
vec4 cNz = texture2D(uNoise, vCAP.xz / 40.0 + vCAP.y / 25.0);
diffuseColor.rgb *= 0.9 + 0.18 * (cNz.r - 0.5) - 0.06 * smoothstep(3.0, 0.0, vCAP.y);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 tW = abs(vCN.y) < 0.5 ? normalize(vec3(-vCN.z, 0.0, vCN.x)) : vec3(1.0, 0.0, 0.0);
  normal = normalize(normal + (viewMatrix * vec4(tW, 0.0)).xyz * cWave * 0.35);
}`);
  };
  corrugated.customProgramCacheKey = () => 'apt-corr';
  return {
    concrete: new THREE.MeshStandardMaterial({ name: 'apt-concrete', vertexColors: true, map: concrete.map, normalMap: concrete.normalMap, roughnessMap: concrete.roughnessMap, roughness: 1, metalness: 0 }),
    metal: new THREE.MeshStandardMaterial({ name: 'apt-metal', vertexColors: true, roughness: 0.38, metalness: 0.65, envMapIntensity: 1.0 }),
    paint: new THREE.MeshStandardMaterial({ name: 'apt-paint', vertexColors: true, roughness: 0.55, metalness: 0.0 }),
    dark: new THREE.MeshStandardMaterial({ name: 'apt-dark', vertexColors: true, roughness: 0.85, metalness: 0.0 }),
    corrugated,
    emissive: new THREE.MeshStandardMaterial({ name: 'apt-lamp', vertexColors: true, color: 0x000000, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.4 }),
  };
}
