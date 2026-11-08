// =============================================================================
// ROAD MATERIALS — physically based (MeshStandardMaterial + shader patches) so
// sun, sky PMREM, shadows, fog and the HDR pipeline all apply. Patches add:
//   * road-space texturing (uv = (lat, v) metres): anti-tiled aggregate detail,
//     macro mottling, wheel-track polish, lane-centre oil, sealed cracks, patch
//     repairs, ravelling, concrete slabs & joints, rumble strips, ragged edges
//   * analytic extra lights in the BUS-LOCAL frame (the outside scene's "world"
//     space is bus-local because worldRoot carries the inverse bus pose):
//       - our coach's low / high beams (with retroreflection on paint, signs,
//         delineators and cat's eyes — the classic night look)
//       - street-light and tunnel-light rows (periodic along s: 2 rows per vertex,
//         nearest 4 luminaires each) incl. specular glints on wet asphalt
//   * `indoor` occlusion (tunnels): sun / sky / env lighting faded out
//   * wetness: darker albedo, low roughness, puddles in the wheel ruts
//   * distance-proportional depth pull so the road wins against coarse terrain LODs
// =============================================================================
import * as THREE from 'three';

export const SODIUM = [1.0, 0.56, 0.18];
export const LED = [0.92, 0.95, 1.0];

const COMMON_VERT_PARS = /* glsl */`
attribute vec3 aRoad;   // lat (m, + right of travel), v (m along, periodic), height above the road surface
attribute vec2 aMisc;   // indoor (0..1), flag
attribute vec4 aLampA;  // lamp row A: spacing, phaseV, lat, signed mounting height (+ LED / - sodium)
attribute vec4 aLampB;
attribute vec3 aTan;    // road forward tangent (world orientation)
varying vec3 vRoad;
varying vec2 vMisc;
varying vec4 vLampA;
varying vec4 vLampB;
varying vec3 vBusPos;
varying vec3 vBusNrm;
varying vec3 vBusTan;
uniform float uPull;
`;
const COMMON_VERT_MAIN = /* glsl */`
  vRoad = aRoad; vMisc = aMisc; vLampA = aLampA; vLampB = aLampB;
  {
    vec4 bp = modelMatrix * vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      bp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
    #endif
    vBusPos = bp.xyz;
    vBusNrm = normalize(mat3(modelMatrix) * objectNormal);
    vec3 tn = length(aTan) > 0.1 ? aTan : vec3(0.0, 0.0, -1.0);
    vBusTan = normalize(mat3(modelMatrix) * tn);
  }
`;
const PULL_VERT = /* glsl */`
  {
    float dd = length(mvPosition.xyz);
    float pull = uPull * max(0.0, dd - 70.0);
    mvPosition.xyz *= max(0.2, (dd - pull) / max(dd, 1e-3));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const COMMON_FRAG_PARS = /* glsl */`
varying vec3 vRoad;
varying vec2 vMisc;
varying vec4 vLampA;
varying vec4 vLampB;
varying vec3 vBusPos;
varying vec3 vBusNrm;
varying vec3 vBusTan;
uniform vec4 uHead;      // low, high, retro gain, lamp intensity scale
uniform float uLampsOn;  // street lights on (0..1)
uniform float uTunnelLamps;
uniform float uWet;
uniform float uTime;
uniform vec3 uBusUp;     // world up in bus-local space
const vec3 SODIUM_C = vec3(${SODIUM.join(', ')});
const vec3 LED_C = vec3(${LED.join(', ')});

// coach headlamps (bus-local): left / right, beam along -Z
float headBeam(vec3 d, float side) {
  // d = unit vector from the lamp towards the point (bus-local)
  float ah = atan(d.x, -d.z);            // + right
  float av = asin(clamp(d.y, -1.0, 1.0));
  if (d.z > 0.0) return 0.0;
  // low beam: sharp cut-off at -0.6 deg, kick-up to the right (right-hand traffic)
  float cut = -0.010 + (ah > 0.02 ? min(0.035, (ah - 0.02) * 0.6) : 0.0);
  float low = exp(-pow(ah / 0.42, 2.0)) * (0.35 + 0.65 * exp(-pow((av + 0.022) / 0.035, 2.0))) * smoothstep(0.006, -0.004, av - cut);
  low += 0.06 * exp(-pow(ah / 0.9, 2.0)) * smoothstep(0.0, -0.1, av);     // foreground spill
  float high = exp(-pow(ah / 0.16, 2.0) - pow(av / 0.05, 2.0)) * 2.2 + exp(-pow(ah / 0.5, 2.0) - pow((av + 0.01) / 0.09, 2.0)) * 0.6;
  return low * uHead.x + high * uHead.y;
}
void addLight(vec3 Lp, float I, vec3 col, vec3 P, vec3 N, vec3 V, float rough, inout vec3 Ed, inout vec3 Es) {
  vec3 d = Lp - P;
  float r2 = max(dot(d, d), 0.25);
  vec3 L = d * inversesqrt(r2);
  float ndl = max(dot(N, L), 0.0);
  vec3 E = col * (I * ndl / r2);
  Ed += E;
  vec3 H = normalize(L + V);
  float a = max(rough * rough, 0.002);
  float ndh = max(dot(N, H), 0.0);
  float a2 = a * a;
  float dn = ndh * ndh * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * dn * dn);
  Es += E * min(D, 400.0) * 0.06 * 0.25;
}
void lampRow(vec4 row, vec3 P, vec3 N, vec3 V, float rough, vec3 up, vec3 right, vec3 fwd, float on, inout vec3 Ed, inout vec3 Es) {
  float sp = row.x;
  if (sp < 0.5 || on < 0.001) return;
  float h = abs(row.w);
  vec3 col = row.w < 0.0 ? SODIUM_C : LED_C;
  float I0 = (row.w < 0.0 ? 22.0 : 26.0) * (h > 6.0 ? h * h / 64.0 : 1.0) * on;
  float k0 = floor((vRoad.y - row.y) / sp);
  for (int j = -1; j <= 2; j++) {
    float sL = row.y + (k0 + float(j)) * sp;
    vec3 Lp = P + right * (row.z - vRoad.x) + up * (h - vRoad.z) + fwd * (sL - vRoad.y);
    vec3 dl = normalize(Lp - P);
    float cosN = dot(dl, up);                    // 1 = lamp straight above
    float I = I0 * smoothstep(0.12, 0.45, cosN) * (0.55 + 0.45 * cosN);
    addLight(Lp, I, col, P, N, V, rough, Ed, Es);
  }
}
// extra irradiance (diffuse) and specular radiance from headlamps + lamp rows
void roadLights(vec3 N, float rough, out vec3 Ed, out vec3 Es, out float headE) {
  Ed = vec3(0.0); Es = vec3(0.0); headE = 0.0;
  vec3 P = vBusPos;
  vec3 V = normalize(cameraPosition - P);
  if (uHead.x + uHead.y > 0.001) {
    for (int k = 0; k < 2; k++) {
      vec3 Lp = vec3(k == 0 ? -0.86 : 0.86, -0.72, -6.55);
      vec3 d = P - Lp;
      float r2 = max(dot(d, d), 0.3);
      vec3 dn = d * inversesqrt(r2);
      float I = 260.0 * headBeam(dn, float(k)) * uHead.w;
      float E = I * max(dot(N, -dn), 0.0) / r2;
      headE += I / r2;
      vec3 col = vec3(1.0, 0.97, 0.92);
      Ed += col * E;
      vec3 H = normalize(-dn + V);
      float a = max(rough * rough, 0.002);
      float ndh = max(dot(N, H), 0.0);
      float dd = ndh * ndh * (a * a - 1.0) + 1.0;
      Es += col * E * min(a * a / (3.14159 * dd * dd), 400.0) * 0.015;
    }
  }
  vec3 up = normalize(uBusUp);
  vec3 fwd = normalize(vBusTan - up * dot(vBusTan, up));
  vec3 right = normalize(cross(fwd, up));
  float inT = vMisc.x;
  lampRow(vLampA, P, N, V, rough, up, right, fwd, mix(uLampsOn, uTunnelLamps, step(0.5, inT)), Ed, Es);
  lampRow(vLampB, P, N, V, rough, up, right, fwd, mix(uLampsOn, uTunnelLamps, step(0.5, inT)), Ed, Es);
}
`;

// lights injection: fade the standard (sun / sky / env) lighting indoors, add ours
const LIGHTS_INJECT = /* glsl */`
#include <lights_fragment_end>
{
  float outdoor = 1.0 - clamp(vMisc.x, 0.0, 1.0);
  reflectedLight.directDiffuse *= outdoor;
  reflectedLight.directSpecular *= outdoor;
  reflectedLight.indirectDiffuse *= mix(0.02, 1.0, outdoor);
  vec3 Ed, Es; float headE;
  roadLights(normalize(vBusNrm), roughnessFactor, Ed, Es, headE);
  reflectedLight.directDiffuse += Ed * BRDF_Lambert(diffuseColor.rgb);
  reflectedLight.directSpecular += Es;
  gHeadE = headE;
}
`;
const INDIRECT_SPEC_INDOOR = /* glsl */`
#include <aomap_fragment>
reflectedLight.indirectSpecular *= mix(0.03, 1.0, 1.0 - clamp(vMisc.x, 0.0, 1.0));
`;

// ----------------------------------------------------------------------------- road surface
const ASPHALT_PARS = /* glsl */`
attribute vec4 aLane;   // median half width, lane width, lanes, carriageway edge
attribute vec4 aSurf;   // kind (0 asphalt, 1 concrete lanes), paved edge, age 0..1, flags (1 rumble, 2 ragged edge)
varying vec4 vLane;
varying vec4 vSurf;
`;
const ASPHALT_FRAG_PARS = /* glsl */`
varying vec4 vLane;
varying vec4 vSurf;
uniform sampler2D tAsC;
uniform sampler2D tAsN;
uniform sampler2D tAsR;
uniform sampler2D tMacro;
uniform sampler2D tNoiseR;
uniform sampler2D tCracks;
float gHeadE = 0.0;
vec3 gAlb; float gRough; vec3 gN; float gPuddle;
float rh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void roadSurface() {
  float lat = vRoad.x, v = vRoad.y, alat = abs(lat);
  vec2 p = vec2(lat, v);
  float med = vLane.x, lw = max(vLane.y, 2.5), nl = vLane.z, edge = vLane.w;
  float pave = vSurf.y, age = vSurf.z, flags = vSurf.w;
  bool concrete = vSurf.x > 0.5 && alat < edge + 0.02;
  // ---- detail (anti-tiled) ----
  vec2 uvA = p / 1.55;
  vec2 uvB = vec2(p.x * 0.8 - p.y * 0.6, p.x * 0.6 + p.y * 0.8) / 2.25 + 0.37;
  float wB = smoothstep(0.35, 0.65, texture2D(tNoiseR, p / 31.0).r);
  vec3 cA = texture2D(tAsC, uvA).rgb, cB = texture2D(tAsC, uvB).rgb;
  vec3 det = mix(cA, cB, wB);
  vec3 nA = texture2D(tAsN, uvA).xyz * 2.0 - 1.0, nB0 = texture2D(tAsN, uvB).xyz * 2.0 - 1.0;
  vec3 nB = vec3(0.8 * nB0.x + 0.6 * nB0.y, -0.6 * nB0.x + 0.8 * nB0.y, nB0.z);
  vec3 nrm = normalize(mix(nA, nB, wB));
  float rDet = mix(texture2D(tAsR, uvA).r, texture2D(tAsR, uvB).r, wB);
  // ---- macro variation ----
  vec4 n1 = texture2D(tNoiseR, p / 173.0);
  vec4 n2 = texture2D(tNoiseR, p / 23.0);
  float macro = texture2D(tMacro, p / 8.7).r - 0.5;
  float tone = 1.0 + macro * 0.5 + (n1.g - 0.5) * 0.28 + (n2.b - 0.5) * 0.10;
  // ---- lanes: wheel tracks & oil strip ----
  float xl = (alat - med) / lw;
  float inLane = step(0.0, xl) * step(xl, nl);
  float f = fract(xl);
  float wt = exp(-pow((abs(f - 0.5) - 0.255) * lw / 0.36, 2.0)) * inLane;
  float oil = exp(-pow((f - 0.5) * lw / 0.3, 2.0)) * inLane * (0.55 + 0.45 * smoothstep(0.3, 0.7, n2.r));
  float shoulder = smoothstep(edge, edge + 0.3, alat);
  vec3 alb; float rough;
  vec4 ck = texture2D(tCracks, p / 7.6);
  vec4 ck2 = texture2D(tCracks, vec2(p.y, -p.x) / 9.3 + 0.21);
  if (concrete) {
    // jointed concrete pavement: 4.5 m slabs, joints at lane lines
    float slabL = 4.5;
    float js = v / slabL;
    float sid = floor(js);
    float lid = floor(xl + 0.0001);
    float slabTone = 1.0 + (rh(vec2(sid, lid + sign(lat) * 7.0)) - 0.5) * 0.12;
    alb = det * vec3(0.98, 0.97, 0.94) * 0.86 * slabTone * (1.0 + macro * 0.25);
    float fw = max(fwidth(v), 0.002);
    float jt = abs(fract(js + 0.5) - 0.5) * slabL;
    float jl = abs(fract(xl + 0.5) - 0.5) * lw;
    float spall = texture2D(tNoiseR, p * 1.7).a;
    float joint = 1.0 - smoothstep(0.006, 0.012 + fw + spall * 0.012, jt);
    float jointL = (1.0 - smoothstep(0.006, 0.014 + fwidth(lat) + spall * 0.01, jl)) * step(0.3, xl) * step(xl, nl - 0.3);
    float jj = max(joint, jointL);
    alb *= 1.0 - 0.75 * jj;
    alb *= 1.0 - 0.22 * wt - 0.18 * oil;      // tyre rubber / drips
    rough = 0.82 - 0.12 * wt + rDet * 0.1;
    // corner cracks on old slabs
    alb *= 1.0 - 0.5 * ck.r * smoothstep(0.65, 0.8, rh(vec2(sid * 3.1, lid))) ;
    nrm.xy *= 0.7;
    nrm.y += jj * 0.4;
  } else {
    alb = det * vec3(0.95, 0.95, 0.96) * 0.43 * tone;
    // aggregate contrast flattened in the polished wheel paths
    alb = mix(alb, vec3(dot(alb, vec3(0.333))) * 0.97, wt * 0.45);
    alb *= 1.0 - 0.10 * wt - 0.28 * oil;
    alb *= 1.0 + 0.10 * shoulder * (0.5 + n2.g);
    rough = clamp(rDet * 0.25 + 0.72 - 0.16 * wt - 0.06 * oil + 0.05 * shoulder, 0.3, 1.0);
    nrm.xy *= 1.0 - 0.5 * wt;
    // cracks (age-dependent, in sections)
    float sect = smoothstep(0.42, 0.72, n1.b + age * 0.35 - 0.2);
    float crack = max(ck.r, ck2.r * 0.7) * sect * age;
    alb *= 1.0 - 0.65 * crack;
    nrm.xy += vec2(dFdx(crack), dFdy(crack)) * 0.0;
    // tar-sealed cracks & joints (overbanding): dark, shiny
    float sealSect = smoothstep(0.5, 0.75, n1.a + age * 0.3);
    float seal = max(ck.g * sealSect, 0.0) * age;
    // longitudinal construction joint along the crown / lane lines, sealed
    float jl = min(abs(lat + 0.05 * sin(v * 0.21)), abs(abs(lat) - (med + lw * floor(xl + 0.5))) + 10.0 * step(nl, 1.5));
    seal = max(seal, (1.0 - smoothstep(0.035, 0.07, jl)) * smoothstep(0.35, 0.6, n1.r) * step(med, 0.3) * age * 1.4);
    // patch repairs (newer, darker asphalt with sealed edges) mostly in the wheel paths
    vec2 cell = floor(vec2((lat + 40.0) / 2.6, v / 17.0));
    float ph = rh(cell);
    vec2 cf = fract(vec2((lat + 40.0) / 2.6, v / 17.0));
    float patchOn = step(ph, 0.07 * age + 0.015) * inLane;
    vec2 lo = vec2(0.08 + 0.25 * rh(cell + 3.1), 0.1 + 0.4 * rh(cell + 5.3));
    vec2 hi = vec2(0.6 + 0.35 * rh(cell + 7.7), 0.5 + 0.45 * rh(cell + 9.9));
    vec2 inP = step(lo, cf) * step(cf, hi);
    float pin = inP.x * inP.y * patchOn;
    vec2 dE = min(cf - lo, hi - cf) * vec2(2.6, 17.0);
    float pedge = pin * (1.0 - smoothstep(0.02, 0.06, min(dE.x, dE.y)));
    alb = mix(alb, alb * vec3(0.66, 0.66, 0.68), pin);
    rough = mix(rough, 0.78, pin);
    seal = max(seal, pedge);
    alb = mix(alb, vec3(0.018, 0.018, 0.02), clamp(seal, 0.0, 1.0) * 0.92);
    rough = mix(rough, 0.32, clamp(seal, 0.0, 1.0));
    nrm = normalize(mix(nrm, vec3(0.0, 0.0, 1.0), clamp(seal, 0.0, 1.0)));
    // ravelling (aggregate loss): lighter, rougher blotches
    float rav = ck.b * age * (1.0 - inLane * 0.5);
    alb *= 1.0 + rav * 0.25;
    // rumble strip on the highway hard shoulder
    if (flags > 0.5 && flags < 1.5) {
      float band = step(edge + 0.2, alat) * step(alat, edge + 0.55);
      float g = fract(v / 0.32);
      float groove = band * smoothstep(0.0, 0.15, g) * smoothstep(0.55, 0.4, g);
      alb *= 1.0 - 0.3 * groove;
      nrm.y += band * (g < 0.3 ? 0.6 : (g < 0.5 ? -0.6 : 0.0));
    }
    // dust & debris along the edge
    float edgeDust = smoothstep(pave - 0.6, pave, alat);
    alb = mix(alb, alb * vec3(1.25, 1.2, 1.1), edgeDust * 0.6 * n2.a);
  }
  // ---- wetness: darker, glossy, puddles in the ruts and low spots ----
  float wet = clamp(uWet, 0.0, 1.0);
  float pud = smoothstep(0.62, 0.7, ck.a * 0.85 + wt * 0.22 + n2.r * 0.12 + wet * 0.1) * wet;
  alb *= mix(1.0, 0.58, wet);
  alb *= mix(1.0, 0.7, pud);
  rough = mix(rough, mix(0.22, 0.12, wt), wet * 0.92);
  rough = mix(rough, 0.035, pud);
  nrm = normalize(mix(nrm, vec3(0.0, 0.0, 1.0), max(pud, wet * 0.5)));
  gAlb = alb; gRough = rough; gN = nrm; gPuddle = pud;
}
`;

// ----------------------------------------------------------------------------- material factory
export class RoadMaterials {
  constructor(app) {
    this.app = app;
    const A = app.assets;
    const base = 'assets/bus/road';
    const tex = (p, srgb, opts = {}) => A.texture(`${base}/${p}`, { srgb, ...opts });
    this.tex = {
      asC: tex('asphalt/color.jpg', true), asN: tex('asphalt/normal.jpg', false), asR: tex('asphalt/roughness.jpg', false),
      macro: tex('macro/color.jpg', false), noise: tex('noise.png', false), cracks: tex('cracks.png', false), wear: tex('paintwear.png', false),
      grC: tex('gravel/color.jpg', true), grN: tex('gravel/normal.jpg', false),
      gsC: tex('grass/color.jpg', true), gsN: tex('grass/normal.jpg', false),
      coC: tex('concrete/color.jpg', true), coN: tex('concrete/normal.jpg', false), coR: tex('concrete/roughness.jpg', false),
      rkC: tex('rock/color.jpg', true), rkN: tex('rock/normal.jpg', false),
      bkC: tex('bark/color.jpg', true), bkN: tex('bark/normal.jpg', false),
      bfC: tex('bark-fir/color.jpg', true), bfN: tex('bark-fir/normal.jpg', false),
      lfB: tex('leaves-broad.png', true, { flipY: true }), lfC: tex('leaves-conifer.png', true), lfP: tex('leaves-palm.png', true),
    };
    for (const k of ['lfB', 'lfC', 'lfP']) { this.tex[k].wrapS = this.tex[k].wrapT = THREE.ClampToEdgeWrapping; }
    this.U = {
      uHead: { value: new THREE.Vector4(0, 0, 1, 1) },
      uLampsOn: { value: 0 },
      uTunnelLamps: { value: 1 },
      uWet: { value: 0 },
      uTime: { value: 0 },
      uPull: { value: 0.0025 },
      uBusUp: { value: new THREE.Vector3(0, 1, 0) },
      uNight: { value: 0 },
    };
    this.list = [];
    this.asphalt = this._asphalt();
    this.asphaltTunnel = this.asphalt;   // same material; tunnel meshes use renderOrder
    this.paint = this._paint();
    this.verge = this._verge();
    this.concrete = this._std('concrete', { map: this.tex.coC, normalMap: this.tex.coN, roughnessMap: this.tex.coR, roughness: 1, color: 0xffffff, vertexColors: true, normalScale: new THREE.Vector2(0.6, 0.6) }, { pavers: true });
    this.metal = this._std('metal', { color: 0xffffff, metalness: 0.85, roughness: 0.42, vertexColors: true });
    this.painted = this._std('painted', { color: 0xffffff, metalness: 0.0, roughness: 0.62, vertexColors: true });
    this.rock = this._std('rock', { map: this.tex.rkC, normalMap: this.tex.rkN, roughness: 0.92, color: 0xd8d2c8, vertexColors: true });
    this.wood = this._std('wood', { map: this.tex.bkC, normalMap: this.tex.bkN, roughness: 0.9, color: 0xffffff, vertexColors: true });
    this.glow = this._glow();
  }

  /** Shared patch: common varyings, lights, indoor, depth pull. */
  _patch(mat, name, { pull = true, extraVertPars = '', extraVertMain = '', fragPars = '', mapCode = null, roughCode = null, normalCode = null, emissiveCode = '', alphaCode = '' } = {}) {
    const U = this.U;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, mat.userData.uniforms || {});
      sh.vertexShader = COMMON_VERT_PARS + extraVertPars + sh.vertexShader
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${COMMON_VERT_MAIN}\n${extraVertMain}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${pull ? PULL_VERT : ''}`);
      let fs = sh.fragmentShader;
      fs = COMMON_FRAG_PARS + (fragPars.includes('float gHeadE') ? '' : 'float gHeadE = 0.0;\n') + fragPars + fs;
      if (mapCode) fs = fs.replace('#include <map_fragment>', mapCode);
      if (roughCode) fs = fs.replace('#include <roughnessmap_fragment>', roughCode);
      if (normalCode) fs = fs.replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', normalCode);
      fs = fs.replace('#include <lights_fragment_end>', LIGHTS_INJECT);
      fs = fs.replace('#include <aomap_fragment>', INDIRECT_SPEC_INDOOR);
      if (alphaCode) fs = fs.replace('#include <alphatest_fragment>', `${alphaCode}\n#include <alphatest_fragment>`);
      if (emissiveCode) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emissiveCode}`);
      sh.fragmentShader = fs;
    };
    mat.customProgramCacheKey = () => `road.${name}`;
    mat.name = `road.${name}`;
    this.list.push(mat);
    return mat;
  }

  _asphalt() {
    const t = this.tex;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, normalMap: t.asN, normalScale: new THREE.Vector2(0.9, 0.9) });
    mat.userData.uniforms = { tAsC: { value: t.asC }, tAsN: { value: t.asN }, tAsR: { value: t.asR }, tMacro: { value: t.macro }, tNoiseR: { value: t.noise }, tCracks: { value: t.cracks } };
    return this._patch(mat, 'asphalt', {
      extraVertPars: ASPHALT_PARS, extraVertMain: 'vLane = aLane; vSurf = aSurf;',
      fragPars: ASPHALT_FRAG_PARS,
      mapCode: /* glsl */`
        roadSurface();
        diffuseColor.rgb *= gAlb;
        // ragged rural pavement edge (the gravel verge shows through)
        if (vSurf.w > 1.5) {
          float e = abs(vRoad.x) - (vSurf.y - 0.28);
          if (e > 0.0) { float nz = texture2D(tNoiseR, vRoad.xy * vec2(1.3, 0.9)).a * 0.75 + texture2D(tNoiseR, vRoad.xy / 7.0).g * 0.35; if (nz < e / 0.28) discard; }
        }`,
      roughCode: 'float roughnessFactor = gRough;',
      normalCode: 'vec3 mapN = gN;',
    });
  }

  _paint() {
    const t = this.tex;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    mat.userData.uniforms = { tWear: { value: t.wear }, tGlyph: { value: null }, tNoiseR: { value: t.noise } };
    this.paintGlyph = mat.userData.uniforms.tGlyph;
    return this._patch(mat, 'paint', {
      extraVertPars: 'attribute vec4 aPaint; varying vec4 vPaint; attribute vec4 aLane; varying vec4 vLane;',
      extraVertMain: 'vPaint = aPaint; vLane = aLane; vPUv = uv;',
      fragPars: /* glsl */`
        varying vec4 vPaint; varying vec4 vLane;
        uniform sampler2D tWear; uniform sampler2D tGlyph; uniform sampler2D tNoiseR;
        float gPA = 1.0; float gRetro = 0.0;
        varying vec2 vPUv;`,
      mapCode: /* glsl */`
        {
          // vPaint: x = colour (0 white, 1 yellow), y = wear 0..1, z = glyph (0 none, else atlas cell+1), w = width (m)
          vec2 p = vRoad.xy;
          vec4 wr = texture2D(tWear, vec2(p.x * 0.37 + vPUv.x * 0.05, p.y / 2.7));
          vec4 wr2 = texture2D(tWear, p * vec2(1.9, 0.53));
          float lw = max(vLane.y, 2.5);
          float xl = (abs(p.x) - vLane.x) / lw, f = fract(xl);
          float wt = exp(-pow((abs(f - 0.5) - 0.255) * lw / 0.3, 2.0)) * step(0.0, xl) * step(xl, vLane.z);
          float wear = vPaint.y;
          float a = 1.0 - smoothstep(0.32, 0.75, wr.r * wear * 1.3 + wt * wear * 0.9 + (wr2.g - 0.5) * 0.55 * (0.3 + wear));
          // soft, slightly irregular edges
          float wpx = fwidth(vPUv.x);
          float e = min(vPUv.x, 1.0 - vPUv.x);
          a *= smoothstep(0.0, max(wpx * 1.2, 0.02), e + (wr2.b - 0.5) * 0.04);
          if (vPaint.z > 0.5) {
            float cell = vPaint.z - 1.0;
            vec2 g = vec2((mod(cell, 4.0) + vPUv.x) / 4.0, (floor(cell / 4.0) + vPUv.y) / 4.0);
            a = texture2D(tGlyph, g).r * (1.0 - smoothstep(0.3, 0.8, wr.r * wear * 1.3 + (wr2.g - 0.5) * 0.4));
          }
          vec3 pc = vPaint.x > 0.5 ? vec3(0.78, 0.52, 0.08) : vec3(0.78, 0.78, 0.76);
          pc *= 0.9 + 0.1 * wr.g;
          pc *= mix(1.0, 0.75, clamp(uWet, 0.0, 1.0));
          diffuseColor.rgb *= pc;
          diffuseColor.a *= a;
          gPA = a;
        }`,
      roughCode: 'float roughnessFactor = mix(0.55, 0.2, clamp(uWet, 0.0, 1.0));',
      emissiveCode: /* glsl */`
        // glass-bead retroreflection under our headlamps (viewer ~ beside the lamps)
        totalEmissiveRadiance += vec3(1.0, 0.98, 0.94) * 0.0;`,
    });
  }

  _verge() {
    const t = this.tex;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, normalMap: t.grN, normalScale: new THREE.Vector2(0.8, 0.8) });
    mat.userData.uniforms = { tGrC: { value: t.grC }, tGrN: { value: t.grN }, tGsC: { value: t.gsC }, tGsN: { value: t.gsN }, tNoiseR: { value: t.noise } };
    return this._patch(mat, 'verge', {
      extraVertPars: 'attribute vec4 aVerge; varying vec4 vVerge;',
      extraVertMain: 'vVerge = aVerge;',
      fragPars: /* glsl */`
        varying vec4 vVerge;
        uniform sampler2D tGrC; uniform sampler2D tGrN; uniform sampler2D tGsC; uniform sampler2D tGsN; uniform sampler2D tNoiseR;
        vec3 gN; float gRough;`,
      mapCode: /* glsl */`
        {
          // vVerge: x = grass weight, y = alpha (fade into the terrain), z = dirt weight, w = tint (0 lush .. 1 dry)
          vec2 p = vRoad.xy;
          vec4 nz = texture2D(tNoiseR, p / 5.3);
          vec4 nz2 = texture2D(tNoiseR, p / 41.0);
          float g = clamp(vVerge.x + (nz.r - 0.5) * 0.9 + (nz2.g - 0.5) * 0.4, 0.0, 1.0);
          g = smoothstep(0.3, 0.7, g);
          vec3 gr = texture2D(tGrC, p / 1.3).rgb * vec3(0.78, 0.76, 0.72);
          vec3 gs = texture2D(tGsC, p / 1.9).rgb;
          vec3 dry = gs * vec3(1.35, 1.12, 0.62);
          gs = mix(gs * vec3(0.92, 1.0, 0.85), dry, clamp(vVerge.w + (nz2.b - 0.5) * 0.5, 0.0, 1.0));
          gs *= 0.8 + 0.4 * nz.g;
          vec3 dirt = gr * vec3(0.72, 0.62, 0.5);
          vec3 c = mix(gr, gs, g);
          c = mix(c, dirt, clamp(vVerge.z * (0.5 + nz.b), 0.0, 1.0));
          c *= mix(1.0, 0.62, clamp(uWet, 0.0, 1.0));
          diffuseColor.rgb *= c;
          vec3 n1 = texture2D(tGrN, p / 1.3).xyz * 2.0 - 1.0, n2 = texture2D(tGsN, p / 1.9).xyz * 2.0 - 1.0;
          gN = normalize(mix(n1, n2, g));
          gRough = mix(0.9, 0.95, g) - uWet * 0.3;
          // dissolve into the terrain at the outer edge (world-space clumps)
          float clump = texture2D(tNoiseR, p * 0.45).a * 0.6 + nz.g * 0.4;
          if (vVerge.y < 0.999 && clump > vVerge.y) discard;
        }`,
      roughCode: 'float roughnessFactor = gRough;',
      normalCode: 'vec3 mapN = gN;',
    });
  }

  _std(name, params, { pavers = false } = {}) {
    const mat = new THREE.MeshStandardMaterial(params);
    const t = this.tex;
    mat.userData.uniforms = { tNoiseR: { value: t.noise } };
    return this._patch(mat, name, {
      pull: false,
      fragPars: 'uniform sampler2D tNoiseR;',
      mapCode: /* glsl */`
        #include <map_fragment>
        {
          vec4 nz = texture2D(tNoiseR, vRoad.xy / 13.0 + vMisc.yy * 0.37);
          diffuseColor.rgb *= 0.86 + 0.28 * nz.g;
          ${pavers ? `
          if (vMisc.y > 0.5 && vMisc.y < 1.5) {
            // sidewalk slabs 0.5 x 0.5 m (running bond) with dark joints
            vec2 q = vec2(vRoad.x, vRoad.y) / 0.5;
            q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
            vec2 fq = abs(fract(q) - 0.5);
            float j = smoothstep(0.47, 0.49, max(fq.x, fq.y));
            float st = fract(sin(dot(floor(q), vec2(12.9898, 78.233))) * 43758.5453);
            diffuseColor.rgb *= (0.92 + 0.14 * st) * (1.0 - 0.45 * j);
          }` : ''}
          diffuseColor.rgb *= mix(1.0, 0.65, clamp(uWet, 0.0, 1.0) * step(0.2, vBusNrm.y + 0.6));
        }`,
    });
  }

  _glow() {
    // self-luminous (lamps: colour alpha = 1, scaled by lamps-on) and retroreflective
    // (alpha = 0.5: delineators, cat's eyes, chevrons, sign borders) elements
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: true });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.U);
      sh.vertexShader = COMMON_VERT_PARS + sh.vertexShader
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nvec3 objectNormal = normal;\n${COMMON_VERT_MAIN}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${PULL_VERT}`);
      sh.fragmentShader = COMMON_FRAG_PARS + sh.fragmentShader.replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        {
          float kind = vColor.a;
          vec3 base = vColor.rgb;
          if (kind > 0.75) {
            // lamp: day -> dim lens, night -> bright
            float on = mix(uLampsOn, uTunnelLamps, step(0.5, vMisc.x));
            diffuseColor.rgb = base * (0.02 + on * 1.0);
          } else if (kind > 0.25) {
            // retroreflector: daylight diffuse colour + headlamp return
            vec3 Ed, Es; float headE;
            roadLights(normalize(vBusNrm), 0.5, Ed, Es, headE);
            float facing = max(dot(normalize(vBusNrm), normalize(cameraPosition - vBusPos)), 0.0);
            float sky = (1.0 - clamp(vMisc.x, 0.0, 1.0));
            diffuseColor.rgb = base * (0.25 * uNight < 1.0 ? (0.35 * (1.0 - uNight) * sky + 0.004) : 0.004) + base * headE * facing * uHead.z * 0.9;
          } else {
            diffuseColor.rgb = base;
          }
          diffuseColor.a = 1.0;
        }`);
    };
    mat.customProgramCacheKey = () => 'road.glow';
    mat.name = 'road.glow';
    this.list.push(mat);
    return mat;
  }
}
