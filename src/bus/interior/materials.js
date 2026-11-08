// Shared interior materials. Every lit interior material understands the
// per-vertex `bake` attribute (geom.js) plus a set of shared uniforms driven by
// lighting.js, giving a light-map-like look at zero per-light cost:
//   * uWashA  ceiling-cove LED wash (indirect light strips, warm white / night blue)
//   * uWashB  rack-edge down-light wash (warm white)
//   * uWashF  floor LED glow (aisle step lights)
//   * analytic DAYLIGHT through the side-window band (form factor of an infinite strip,
//     modulated per window by curtains / pillars through a small data texture) and the windscreen
//   * analytic TUNNEL lamps sweeping past the windows (light only reaches surfaces that see a
//     tunnel lamp *through* the window band - a cheap exact visibility test)
// All of it is multiplied by the baked ambient occlusion.
import * as THREE from 'three';
import { L } from './layout.js';

export const SHARED = {
  uWashA: { value: new THREE.Color(0, 0, 0) },
  uWashB: { value: new THREE.Color(0, 0, 0) },
  uWashF: { value: new THREE.Color(0, 0, 0) },
  uDay: { value: new THREE.Color(0, 0, 0) },
  uDayFront: { value: new THREE.Color(0, 0, 0) },
  uOpen: { value: null },                       // DataTexture 128 x 2 (left/right openness along z)
  uTun: { value: new THREE.Vector4(0, 0, 0, 0) },  // rgb, phase
  uTunP: { value: new THREE.Vector4(11, 1, 1, 0) }, // spacing, left weight, right weight, -
  uAoDirect: { value: 0.5 },
  uSunLocal: { value: new THREE.Vector3(0, 1, 0) },
  uSunHaze: { value: new THREE.Color(0, 0, 0) },
  uTime: { value: 0 },
};

// openness texture (curtains, pillars): 128 texels along z in [-6.6, 6.6], row 0 = left, row 1 = right
export function createOpenTexture() {
  const W = 128, data = new Uint8Array(W * 2 * 4).fill(255);
  const t = new THREE.DataTexture(data, W, 2, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  SHARED.uOpen.value = t;
  return t;
}

const GLSL_PARS_V = /* glsl */`
attribute vec4 bake;
varying vec4 vBake;
varying vec3 vCabinPos;
varying vec3 vCabinN;
`;
const GLSL_BEGIN_V = /* glsl */`
vBake = bake;
{
  vec4 cp = vec4(transformed, 1.0);
  vec3 cn = objectNormal;
  #ifdef USE_INSTANCING
    cp = instanceMatrix * cp;
    cn = mat3(instanceMatrix) * cn;
  #endif
  vCabinPos = (modelMatrix * cp).xyz;
  vCabinN = mat3(modelMatrix) * cn;
}
`;
const GLSL_PARS_F = /* glsl */`
varying vec4 vBake;
varying vec3 vCabinPos;
varying vec3 vCabinN;
uniform vec3 uWashA;
uniform vec3 uWashB;
uniform vec3 uWashF;
uniform vec3 uDay;
uniform vec3 uDayFront;
uniform sampler2D uOpen;
uniform vec4 uTun;
uniform vec4 uTunP;
uniform float uAoDirect;
float coachHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float coachNoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(coachHash(i), coachHash(i + vec2(1, 0)), u.x), mix(coachHash(i + vec2(0, 1)), coachHash(i + vec2(1, 1)), u.x), u.y); }
// view factor of the side-window band (infinite strip along z) for side s
float coachBand(float s, vec3 p, vec3 n) {
  float dx = (s * ${L.glassX.toFixed(3)} - p.x) * s;
  if (dx < 0.004) return 0.0;
  float t1 = atan(${L.sillY.toFixed(3)} - p.y, dx), t2 = atan(${(L.rackY - 0.01).toFixed(3)} - p.y, dx);
  vec2 nn = vec2(n.x * s, n.y);
  float nl = length(nn);
  if (nl < 1e-3) return 0.0;
  float tn = atan(nn.y, nn.x);
  float lo = max(t1, tn - 1.5707), hi = min(t2, tn + 1.5707);
  if (hi <= lo) return 0.0;
  return 0.5 * (sin(hi - tn) - sin(lo - tn)) * nl;
}
vec3 coachDaylight(vec3 p, vec3 n) {
  float zt = clamp((p.z + 6.6) / 13.2, 0.0, 1.0);
  float oL = texture2D(uOpen, vec2(zt, 0.25)).r;
  float oR = texture2D(uOpen, vec2(zt, 0.75)).r;
  float e = coachBand(-1.0, p, n) * oL + coachBand(1.0, p, n) * oR;
  // windscreen: big glass at the front
  float fz = p.z + 6.3;
  float ef = max(-n.z, 0.0) * 0.55 + max(n.y, 0.0) * 0.12 * step(p.z, -4.4);
  ef *= 1.0 / (1.0 + fz * fz * 0.11);
  return uDay * e + uDayFront * ef;
}
vec3 coachTunnel(vec3 p, vec3 n) {
  if (uTun.r + uTun.g + uTun.b < 1e-5) return vec3(0.0);
  float sp = uTunP.x;
  float acc = 0.0;
  float k0 = floor((p.z - uTun.w) / sp);
  for (int side = 0; side < 2; side++) {
    float s = side == 0 ? -1.0 : 1.0;
    float w = side == 0 ? uTunP.y : uTunP.z;
    for (int k = 0; k < 3; k++) {
      float lz = uTun.w + (k0 + float(k) - 0.5) * sp;
      vec3 Lv = vec3(s * 3.6, 3.1, lz) - p;
      float t = (s * ${L.glassX.toFixed(3)} - p.x) / Lv.x;
      if (t <= 0.0 || t >= 1.0) continue;
      float yc = p.y + Lv.y * t;
      float vis = smoothstep(${(L.sillY - 0.02).toFixed(3)}, ${(L.sillY + 0.05).toFixed(3)}, yc) * (1.0 - smoothstep(${(L.rackY - 0.08).toFixed(3)}, ${(L.rackY + 0.01).toFixed(3)}, yc));
      float d2 = dot(Lv, Lv);
      acc += w * vis * max(dot(n, Lv * inversesqrt(d2)), 0.0) / d2;
    }
  }
  return uTun.rgb * acc;
}
`;
const GLSL_APPLY = /* glsl */`
{
  vec3 cN = normalize(vCabinN);
  float bao = vBake.z;
  vec3 bakeL = uWashA * vBake.x + uWashB * vBake.y + uWashF * vBake.w;
  vec3 natural = coachDaylight(vCabinPos, cN) * mix(0.55, 1.0, bao) + coachTunnel(vCabinPos, cN);
  reflectedLight.indirectDiffuse = (reflectedLight.indirectDiffuse + (bakeL + natural) * material.diffuseColor) * bao;
  reflectedLight.directDiffuse *= mix(1.0, bao, uAoDirect);
  reflectedLight.indirectSpecular *= mix(0.3, 1.0, bao);
}
`;

/** Patch a MeshStandardMaterial (or Physical) so it uses the bake attribute + interior GI. */
export function bakeMaterial(mat, opts = {}) {
  const key = 'busInt' + (opts.shaderKey || '');
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, {
      uWashA: SHARED.uWashA, uWashB: SHARED.uWashB, uWashF: SHARED.uWashF, uDay: SHARED.uDay, uDayFront: SHARED.uDayFront,
      uOpen: SHARED.uOpen, uTun: SHARED.uTun, uTunP: SHARED.uTunP, uAoDirect: SHARED.uAoDirect,
    }, opts.uniforms || {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_PARS_V + (opts.extraVertPars || ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + GLSL_BEGIN_V + (opts.extraVert || ''));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_PARS_F + (opts.extraFragPars || ''))
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + (opts.preBake || '') + GLSL_APPLY + (opts.extraFrag || ''));
    if (opts.replace) for (const [a, b] of opts.replace) shader.fragmentShader = shader.fragmentShader.replace(a, b);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** MeshStandardMaterial whose instanceColor is EMISSIVE (diffuse stays the base colour). */
export function emissiveInstanced(params, key) {
  const m = new THREE.MeshStandardMaterial(params);
  bakeMaterial(m, {
    shaderKey: 'emInst' + key,
    replace: [['#include <color_fragment>', ''], ['#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor;\n#endif']],
  });
  return m;
}

export function createMaterials(app, tex) {
  const A = app.assets;
  const P = (folder, repeat, maps = ['color', 'normal', 'roughness']) => A.pbr(folder, { repeat, maps });
  // uv = metres everywhere; repeat = 1 / tile size (unique repeat keys keep these textures private)
  const wood = P('assets/bus/interior/floor-wood', [1 / 2.4, 1 / 2.4], ['color', 'normal', 'roughness']);
  const carpet = P('assets/bus/interior/carpet', [1 / 0.45, 1 / 0.45]);
  const felt = P('assets/bus/interior/felt', [1 / 0.5, 1 / 0.5]);
  const head = P('assets/bus/interior/headliner', [1 / 0.6, 1 / 0.6]);
  const curtain = P('assets/bus/interior/curtain', [1, 1]);
  const rubber = P('assets/bus/interior/rubber', [1 / 0.6, 1 / 0.6]);
  const plastic = P('assets/textures/cabin-plastic', [1 / 0.35, 1 / 0.351]);
  const metal = P('assets/textures/cabin-metal', [1 / 0.3, 1 / 0.301]);
  const std = (params, key, opts = {}) => { const m = bakeMaterial(new THREE.MeshStandardMaterial(params), { shaderKey: opts.shaderKey || '', ...opts }); m.name = 'bus-int-' + key; return m; };

  const M = {};
  // ---------------------------------------------------------------- floors
  const floorFrag = /* glsl */`
uniform sampler2D uFloorAO;
uniform vec4 uFloorAORect;   // x0, z0, 1/w, 1/d
`;
  const floorAo = /* glsl */`
  {
    vec2 fuv = vec2((vCabinPos.x - uFloorAORect.x) * uFloorAORect.z, (vCabinPos.z - uFloorAORect.y) * uFloorAORect.w);
    float fao = texture2D(uFloorAO, fuv).r;
    reflectedLight.indirectDiffuse *= fao;
    reflectedLight.directDiffuse *= mix(1.0, fao, 0.55);
  }
`;
  const floorU = { uFloorAO: { value: tex.floorAO }, uFloorAORect: { value: tex.floorAORect } };
  // grey-oak vinyl planks (planks run along the coach) with traffic wear, grit and scuffs
  M.floor = std({
    color: new THREE.Color(1.05, 1.05, 1.08), map: wood.map, normalMap: wood.normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
    roughnessMap: wood.roughnessMap, roughness: 1.0, metalness: 0, envMapIntensity: 0.55,
  }, 'floor', {
    shaderKey: 'floor', uniforms: floorU, extraFragPars: floorFrag, preBake: floorAo,
    replace: [['#include <map_fragment>', /* glsl */`#include <map_fragment>
      {
        vec2 fp = vCabinPos.xz;
        float ax = abs(fp.x);
        float traffic = 1.0 - smoothstep(0.18, 0.62, ax);
        float n1 = coachNoise(fp * vec2(2.6, 0.55)) * 0.6 + coachNoise(fp * 9.0) * 0.4;
        // dull, slightly lighter wear path + grey grit along the walls and under seats
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * vec3(1.03, 1.0, 0.96), traffic * 0.25 * (0.6 + 0.4 * n1));
        float grit = smoothstep(0.55, 0.95, coachNoise(fp * vec2(5.0, 1.3) + 3.1)) * (0.35 + 0.65 * smoothstep(0.95, 1.18, ax));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.19, 0.18), grit * 0.35);
      }`],
    ['#include <roughnessmap_fragment>', /* glsl */`#include <roughnessmap_fragment>
      {
        float ax = abs(vCabinPos.x);
        roughnessFactor = mix(roughnessFactor, 0.78, (1.0 - smoothstep(0.18, 0.6, ax)) * 0.55);
      }`]],
  });
  // aisle runner: anthracite tufted carpet with a teal fleck pattern, bound edges, crushed centre
  M.runner = std({
    color: new THREE.Color(0.30, 0.32, 0.35), map: carpet.map, normalMap: carpet.normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: carpet.roughnessMap, roughness: 1.0, envMapIntensity: 0.12,
  }, 'runner', {
    shaderKey: 'runner', uniforms: { ...floorU, uRunnerPat: { value: tex.runner } }, extraFragPars: floorFrag + 'uniform sampler2D uRunnerPat;\n', preBake: floorAo,
    replace: [['#include <map_fragment>', /* glsl */`#include <map_fragment>
      {
        vec4 pat = texture2D(uRunnerPat, vec2(vCabinPos.x / ${(2 * L.runnerX).toFixed(3)} + 0.5, vCabinPos.z / 0.9));
        diffuseColor.rgb *= pat.rgb * 2.0;
        float crush = (1.0 - smoothstep(0.03, 0.16, abs(vCabinPos.x))) * (0.6 + 0.4 * coachNoise(vCabinPos.xz * vec2(4.0, 0.8)));
        diffuseColor.rgb *= 1.0 + crush * 0.16;
        float dirt = smoothstep(0.6, 0.95, coachNoise(vCabinPos.xz * vec2(3.0, 0.9) + 11.0));
        diffuseColor.rgb *= 1.0 - dirt * 0.18;
      }`]],
  });
  // safety rubber flooring (stairs, front platform, toilet)
  M.rubber = std({
    color: new THREE.Color(1.15, 1.15, 1.2), map: rubber.map, normalMap: rubber.normalMap, normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: rubber.roughnessMap, roughness: 1.0, envMapIntensity: 0.3,
  }, 'rubber', { shaderKey: 'rubber', uniforms: floorU, extraFragPars: floorFrag, preBake: floorAo });

  // ---------------------------------------------------------------- linings
  // needle-felt wall covering (anthracite), also partitions and the rack floor
  M.felt = std({
    color: new THREE.Color(0.34, 0.355, 0.375), map: felt.map, normalMap: felt.normalMap, normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: felt.roughnessMap, roughness: 1.0, envMapIntensity: 0.08,
  }, 'felt', { shaderKey: 'felt' });
  M.feltLight = std({
    color: new THREE.Color(0.62, 0.62, 0.62), map: felt.map, normalMap: felt.normalMap, normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 1.0, envMapIntensity: 0.08,
  }, 'feltLight', { shaderKey: 'felt' });
  // headliner fabric (ceiling)
  M.headliner = std({
    color: new THREE.Color(1.62, 1.6, 1.55), map: head.map, normalMap: head.normalMap, normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: head.roughnessMap, roughness: 1.0, envMapIntensity: 0.1,
  }, 'headliner', { shaderKey: 'head' });
  // light-grey moulded ABS (racks, pillars, sills, PSU strips, ceiling trims) with stipple + wipe marks
  const plasticParams = (c, r = 0.62) => ({ color: new THREE.Color(c), map: tex.plasticMottle, normalMap: plastic.normalMap, normalScale: new THREE.Vector2(0.18, 0.18), roughnessMap: plastic.roughnessMap, roughness: r / 0.62, envMapIntensity: 0.55 });
  M.plastic = std(plasticParams('#d4d4cf', 0.6), 'plastic', { shaderKey: 'pl' });
  M.plasticMid = std(plasticParams('#a3a5a4', 0.55), 'plasticMid', { shaderKey: 'pl' });
  M.plasticDark = std(plasticParams('#3a3d40', 0.5), 'plasticDark', { shaderKey: 'pl' });
  M.plasticBlack = std({ color: new THREE.Color('#141516'), roughness: 0.55, normalMap: plastic.normalMap, normalScale: new THREE.Vector2(0.15, 0.15), envMapIntensity: 0.5 }, 'plasticBlack', { shaderKey: 'pl2' });
  // painted / vertex-coloured small parts (yellow nosing, red covers, stickers' backs ...)
  M.paint = std({ color: new THREE.Color(1, 1, 1), vertexColors: true, roughness: 0.48, envMapIntensity: 0.55, normalMap: plastic.normalMap, normalScale: new THREE.Vector2(0.08, 0.08) }, 'paint', { shaderKey: 'paint' });
  // metals
  M.alu = std({ color: new THREE.Color('#c6c9cc'), map: metal.map, normalMap: metal.normalMap, normalScale: new THREE.Vector2(0.4, 0.4), roughnessMap: metal.roughnessMap, roughness: 0.75, metalness: 1.0, envMapIntensity: 1.0 }, 'alu', { shaderKey: 'alu' });
  M.chrome = std({ color: new THREE.Color('#e0e3e6'), roughness: 0.2, metalness: 1.0, envMapIntensity: 1.2 }, 'chrome', { shaderKey: 'chr' });
  M.steel = std({ color: new THREE.Color('#b9bcbf'), roughness: 0.38, metalness: 1.0, envMapIntensity: 1.0, normalMap: metal.normalMap, normalScale: new THREE.Vector2(0.2, 0.2) }, 'steel', { shaderKey: 'st' });
  M.rubberBlack = std({ color: new THREE.Color('#0b0b0c'), roughness: 0.85, envMapIntensity: 0.25 }, 'rubberBlack', { shaderKey: 'rb' });
  // fabrics
  M.curtain = std({
    color: new THREE.Color(0.30, 0.47, 0.52), map: curtain.map, normalMap: curtain.normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: curtain.roughnessMap, roughness: 1.0, side: THREE.DoubleSide, envMapIntensity: 0.08,
  }, 'curtain', {
    shaderKey: 'curtain', uniforms: { uCurtainPat: { value: tex.curtainPattern } }, extraFragPars: 'uniform sampler2D uCurtainPat;\n',
    replace: [['#include <map_fragment>', /* glsl */`#include <map_fragment>
      diffuseColor.rgb *= texture2D(uCurtainPat, vec2(vMapUv.x * 0.25, vMapUv.y * 0.5)).rgb * 2.0;
      // sun shining through the fabric from outside (translucency)
      `]],
  });
  // atlas of labels / stickers / signs (lit, decal)
  M.decal = std({ color: new THREE.Color(1, 1, 1), map: tex.atlas, roughness: 0.5, envMapIntensity: 0.4, transparent: true, alphaTest: 0.02, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false }, 'decal', { shaderKey: 'decal' });
  M.psuFace = std({ color: new THREE.Color(1, 1, 1), map: tex.psu, roughness: 0.5, normalMap: plastic.normalMap, normalScale: new THREE.Vector2(0.1, 0.1), envMapIntensity: 0.5 }, 'psuFace', { shaderKey: 'psu' });
  M.grille = std({ color: new THREE.Color(1, 1, 1), map: tex.grille, roughness: 0.5, metalness: 0.0, envMapIntensity: 0.5 }, 'grille', { shaderKey: 'grille' });
  M.screenOff = new THREE.MeshStandardMaterial({ color: new THREE.Color('#050607'), roughness: 0.12, metalness: 0.0, envMapIntensity: 1.0 });
  M.screenOff.name = 'bus-int-screenOff';
  M.toiletWhite = std({ color: new THREE.Color('#eef0ee'), roughness: 0.25, envMapIntensity: 0.9 }, 'toiletWhite', { shaderKey: 'tw' });
  M.mirror = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.85, 0.87, 0.88), roughness: 0.04, metalness: 1.0, envMapIntensity: 1.0 });
  M.mirror.name = 'bus-int-mirror';

  // ---------------------------------------------------------------- emissive
  M.ledStrip = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });   // indirect cove LEDs (seen edge-on)
  M.ledStrip.name = 'bus-int-led-cove';
  M.ledDown = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });    // opal down-light diffusers under the rack edge
  M.ledDown.name = 'bus-int-led-down';
  M.ledFloor = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });   // aisle step lights
  M.ledFloor.name = 'bus-int-led-floor';
  M.lens = emissiveInstanced({ color: new THREE.Color('#e8e8e4'), roughness: 0.25, envMapIntensity: 0.6 }, 'lens');
  M.signs = new THREE.MeshBasicMaterial({ map: tex.signs, color: new THREE.Color(1, 1, 1), transparent: false });
  M.signs.name = 'bus-int-signs';

  // ---------------------------------------------------------------- glass
  M.glassSide = glassMaterial({ alpha: 0.30, tint: [0.02, 0.026, 0.026], key: 'side' });
  M.glassWind = glassMaterial({ alpha: 0.10, tint: [0.02, 0.025, 0.025], key: 'wind', band: true });
  M.glassDoor = glassMaterial({ alpha: 0.26, tint: [0.02, 0.026, 0.026], key: 'door' });
  M.glassSmoke = glassMaterial({ alpha: 0.58, tint: [0.012, 0.013, 0.014], key: 'smoke', rough: 0.12 });
  M.glassClear = glassMaterial({ alpha: 0.08, tint: [0.03, 0.035, 0.035], key: 'clear' });
  M.glassFrosted = new THREE.MeshStandardMaterial({ color: new THREE.Color('#dfe6e6'), roughness: 0.9, transparent: true, opacity: 0.92, emissive: new THREE.Color(0, 0, 0) });
  M.glassFrosted.name = 'bus-int-glass-frosted';
  M.frit = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.006, 0.006, 0.007), map: null, alphaMap: tex.frit, transparent: true, depthWrite: false, side: THREE.FrontSide });
  M.frit.name = 'bus-int-frit';

  // shadow-only light blocker
  M.blocker = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, colorWrite: false, depthWrite: false });
  M.blocker.shadowSide = THREE.DoubleSide;
  M.blocker.name = 'bus-int-blocker';
  return M;
}

/**
 * Transparent glazing: output = reflection (premultiplied) + outside x (1 - alpha).
 * Sun-lit haze on the glass when the sun shines through it. Optional green-grey
 * tint band at the top of the windscreen.
 */
export function glassMaterial({ alpha = 0.3, tint = [0.02, 0.025, 0.025], key = 'g', band = false, rough = 0.05 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tint[0], tint[1], tint[2]), roughness: rough, metalness: 0.0, transparent: true, opacity: alpha,
    depthWrite: false, envMapIntensity: 1.0, side: THREE.DoubleSide,
  });
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  m.premultipliedAlpha = false;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSunLocal = SHARED.uSunLocal;
    shader.uniforms.uSunHaze = SHARED.uSunHaze;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGN; varying vec2 vGUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGN = mat3(modelMatrix) * objectNormal; vGUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGN; varying vec2 vGUv; uniform vec3 uSunLocal; uniform vec3 uSunHaze;')
      .replace('#include <opaque_fragment>', `
        float sunIn = abs(dot(normalize(vGN), uSunLocal));
        vec3 haze = uSunHaze * sunIn * 0.06;
        float a = opacity;
        ${band ? 'float tb = smoothstep(0.80, 0.93, vGUv.y); a = mix(a, 0.62, tb); outgoingLight += vec3(0.0, 0.008, 0.012) * tb;' : ''}
        gl_FragColor = vec4(outgoingLight + haze, a);
      `);
  };
  m.customProgramCacheKey = () => 'busGlass' + key;
  m.name = 'bus-int-glass-' + key;
  return m;
}
