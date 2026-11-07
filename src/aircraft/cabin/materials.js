// Shared cabin materials. Every lit cabin material understands the per-vertex
// `bake` attribute (see geom.js) and a set of shared uniforms driven by the
// lighting controller, giving a light-map-like "GI" look (LED cove wash on the
// ceiling, sidewall wash, ambient occlusion in corners/reveals/bins) that can
// change colour smoothly with the mood-lighting mode at zero per-light cost.
import * as THREE from 'three';

export const SHARED = {
  uCeilWash: { value: new THREE.Color(0.6, 0.6, 0.6) },
  uSideWash: { value: new THREE.Color(0.4, 0.4, 0.4) },
  uGlow: { value: new THREE.Color(1, 1, 1) },
  uAoDirect: { value: 0.55 },          // how much baked AO also darkens direct (fake-GI) lights
  uSunLocal: { value: new THREE.Vector3(0, 1, 0) },
  uSunHaze: { value: new THREE.Color(0, 0, 0) },
  uTime: { value: 0 },
};

const BAKE_VERT_PARS = /* glsl */`
attribute vec4 bake;
varying vec4 vBake;
varying vec3 vCabinPos;
`;
const BAKE_FRAG_PARS = /* glsl */`
varying vec4 vBake;
varying vec3 vCabinPos;
uniform vec3 uCeilWash;
uniform vec3 uSideWash;
uniform vec3 uGlow;
uniform float uAoDirect;
`;
const BAKE_APPLY = /* glsl */`
{
  vec3 bakeL = uCeilWash * vBake.x + uSideWash * vBake.y;
  float bao = vBake.z;
  reflectedLight.indirectDiffuse = (reflectedLight.indirectDiffuse + bakeL * material.diffuseColor) * bao;
  reflectedLight.directDiffuse *= mix(1.0, bao, uAoDirect);
  reflectedLight.indirectSpecular *= mix(0.35, 1.0, bao);
  totalEmissiveRadiance += uGlow * vBake.w * material.diffuseColor;
}
`;

/**
 * Patch a MeshStandardMaterial so it uses the bake attribute.
 * opts.extraFragPars / extraFrag (inserted after the bake), extraVert, key.
 */
export function bakeMaterial(mat, opts = {}) {
  // share programs between materials whose injected code is identical
  const key = 'cabinBake' + (opts.shaderKey || '');
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    Object.assign(shader.uniforms, {
      uCeilWash: SHARED.uCeilWash, uSideWash: SHARED.uSideWash, uGlow: SHARED.uGlow, uAoDirect: SHARED.uAoDirect,
    }, opts.uniforms || {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + BAKE_VERT_PARS + (opts.extraVertPars || ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = bake;\nvCabinPos = position;\n' + (opts.extraVert || ''));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + BAKE_FRAG_PARS + (opts.extraFragPars || ''))
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + (opts.preBake || '') + BAKE_APPLY + (opts.extraFrag || ''));
    if (opts.replace) for (const [a, b] of opts.replace) shader.fragmentShader = shader.fragmentShader.replace(a, b);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

function std(params, opts) { return bakeMaterial(new THREE.MeshStandardMaterial(params), opts); }

export function createMaterials(app, tex) {
  const A = app.assets;
  const T = (folder, repeat, maps = ['color', 'normal', 'roughness']) => A.pbr(`assets/textures/${folder}`, { repeat, maps });
  const plastic = T('cabin-plastic', [4, 4]);
  const plasticFine = T('cabin-plastic', [7, 7]);
  const metal = T('cabin-metal', [2, 2]);
  const fabric = T('cabin-fabric', [3, 3]);
  const carpet = T('cabin-carpet', [1, 1], ['color', 'normal', 'roughness', 'ao']);
  const vinyl = T('cabin-vinyl', [1, 1]);

  const M = {};
  // --- sculpted lining (ceiling, upper sidewall, bins, bulkheads) ---------------
  M.lining = std({
    color: new THREE.Color('#efede9'), map: plastic.map, normalMap: plastic.normalMap, normalScale: new THREE.Vector2(0.22, 0.22),
    roughnessMap: plastic.roughnessMap, roughness: 1.0, metalness: 0.0, envMapIntensity: 0.6,
  }, { key: 'lining' });
  M.lining.name = 'cabin-lining';
  // sidewall panels: canvas map with panel seams/scuffs + stipple normal
  M.sidewall = std({
    color: new THREE.Color('#f1efea'), map: tex.sidewall, normalMap: plasticFine.normalMap, normalScale: new THREE.Vector2(0.25, 0.25),
    roughnessMap: plasticFine.roughnessMap, roughness: 1.0, envMapIntensity: 0.6,
  }, { key: 'sidewall' });
  M.ceiling = std({
    color: new THREE.Color('#f4f3f0'), map: tex.ceiling, normalMap: plastic.normalMap, normalScale: new THREE.Vector2(0.12, 0.12),
    roughness: 0.72, envMapIntensity: 0.4,
  }, { key: 'ceiling' });
  M.bin = std({
    color: new THREE.Color('#eeece8'), map: plastic.map, normalMap: plastic.normalMap, normalScale: new THREE.Vector2(0.18, 0.18),
    roughnessMap: plastic.roughnessMap, roughness: 0.85, envMapIntensity: 0.75,
  }, { key: 'bin' });
  M.binInterior = std({
    color: new THREE.Color('#9a9ea5'), normalMap: fabric.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.95, envMapIntensity: 0.2,
  }, { key: 'binin' });
  M.dado = std({
    color: new THREE.Color('#9a9da2'), map: tex.dado, normalMap: plasticFine.normalMap, normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.78, envMapIntensity: 0.35,
  }, { key: 'dado' });
  M.greyPlastic = std({ color: new THREE.Color('#c9cbce'), normalMap: plasticFine.normalMap, normalScale: new THREE.Vector2(0.2, 0.2), roughness: 0.55 }, { key: 'grey' });
  M.darkPlastic = std({ color: new THREE.Color('#2e3135'), roughness: 0.5, envMapIntensity: 0.6 }, { key: 'dark' });
  M.red = std({ color: new THREE.Color('#b3141c'), roughness: 0.45, envMapIntensity: 0.6 }, { key: 'red' });
  M.black = std({ color: new THREE.Color('#0d0e10'), roughness: 0.8, envMapIntensity: 0.2 }, { key: 'black' });
  M.housing = std({ color: new THREE.Color('#55595f'), roughness: 0.9, envMapIntensity: 0.15 }, { key: 'housing' });
  M.metal = std({
    color: new THREE.Color('#d2d5d9'), map: metal.map, normalMap: metal.normalMap, roughnessMap: metal.roughnessMap,
    roughness: 0.55, metalness: 1.0, envMapIntensity: 1.0,
  }, { key: 'metal' });
  M.chrome = std({ color: new THREE.Color('#e4e6ea'), roughness: 0.22, metalness: 1.0, envMapIntensity: 1.1 }, { key: 'chrome' });
  M.psu = std({
    color: new THREE.Color('#ffffff'), map: tex.psu, normalMap: plasticFine.normalMap, normalScale: new THREE.Vector2(0.15, 0.15),
    roughness: 0.6, envMapIntensity: 0.6,
  }, { key: 'psu' });
  M.placard = std({ color: new THREE.Color('#ffffff'), map: tex.placards, roughness: 0.5, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, { key: 'placard' });
  M.bulkhead = std({
    color: new THREE.Color('#ffffff'), map: tex.bulkhead, normalMap: plastic.normalMap, normalScale: new THREE.Vector2(0.15, 0.15),
    roughness: 0.8, envMapIntensity: 0.4,
  }, { key: 'bulkhead' });
  M.shade = std({
    color: new THREE.Color('#ebe8e1'), map: tex.shade, normalMap: plasticFine.normalMap, normalScale: new THREE.Vector2(0.2, 0.2),
    roughness: 0.62, envMapIntensity: 0.45,
  }, { key: 'shade' });
  M.curtain = std({
    color: new THREE.Color(1.7, 1.75, 1.9), map: fabric.map, normalMap: fabric.normalMap, roughnessMap: fabric.roughnessMap,
    roughness: 1.0, side: THREE.DoubleSide, envMapIntensity: 0.15,
  }, { key: 'curtain' });
  M.luggage = std({ color: new THREE.Color('#ffffff'), roughness: 0.55, envMapIntensity: 0.5 }, { key: 'lug' });
  M.luggageSoft = std({ color: new THREE.Color('#ffffff'), normalMap: fabric.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.9, envMapIntensity: 0.2 }, { key: 'lugsoft' });

  // --- floors ------------------------------------------------------------------
  const floorFrag = /* glsl */`
uniform sampler2D uFloorAO;
uniform vec4 uFloorAORect;   // x0, z0, 1/w, 1/d
float cabinHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cabinNoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cabinHash(i), cabinHash(i + vec2(1, 0)), u.x), mix(cabinHash(i + vec2(0, 1)), cabinHash(i + vec2(1, 1)), u.x), u.y); }
`;
  const floorAoSample = /* glsl */`
  vec2 fuv = vec2((vCabinPos.x - uFloorAORect.x) * uFloorAORect.z, (vCabinPos.z - uFloorAORect.y) * uFloorAORect.w);
  float fao = texture2D(uFloorAO, fuv).r;
  reflectedLight.indirectDiffuse *= fao;
  reflectedLight.directDiffuse *= mix(1.0, fao, 0.75);
`;
  const floorUniforms = { uFloorAO: { value: tex.floorAO }, uFloorAORect: { value: tex.floorAORect } };
  M.carpet = std({
    color: new THREE.Color(2.1, 2.1, 2.2), map: carpet.map, normalMap: carpet.normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: carpet.roughnessMap, roughness: 1.0, aoMap: carpet.aoMap, aoMapIntensity: 0.6, envMapIntensity: 0.15,
  }, {
    key: 'carpet', shaderKey: 'carpet', uniforms: floorUniforms, extraFragPars: floorFrag,
    // aisle wear: crushed, slightly lighter and less saturated fibres + traffic dirt
    replace: [['#include <map_fragment>', /* glsl */`#include <map_fragment>
      {
        float ax = abs(vCabinPos.x);
        float aisle = 1.0 - smoothstep(0.16, 0.34, ax);
        float n = cabinNoise(vCabinPos.xz * vec2(3.0, 0.7)) * 0.6 + cabinNoise(vCabinPos.xz * 11.0) * 0.4;
        float wear = aisle * (0.55 + 0.45 * n);
        float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l) * vec3(1.02, 1.0, 0.97), wear * 0.35);
        diffuseColor.rgb *= 1.0 + wear * 0.18;
        float dirt = smoothstep(0.55, 0.9, cabinNoise(vCabinPos.xz * vec2(1.3, 0.45) + 7.0)) * (0.4 + aisle * 0.6);
        diffuseColor.rgb *= 1.0 - dirt * 0.22;
      }`]],
    preBake: floorAoSample,
  });
  M.carpet.aoMap.channel = 0;
  M.vinyl = std({
    color: new THREE.Color('#ffffff'), map: vinyl.map, normalMap: vinyl.normalMap, normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: vinyl.roughnessMap, roughness: 1.0, envMapIntensity: 0.55,
  }, { key: 'vinyl', shaderKey: 'floor', uniforms: floorUniforms, extraFragPars: floorFrag, preBake: floorAoSample });
  M.floorRed = std({ color: new THREE.Color('#9c1018'), emissive: new THREE.Color('#ff2020'), emissiveIntensity: 0.05, roughness: 0.4 }, { key: 'floorred' });
  M.glowStrip = std({ color: new THREE.Color('#8f9488'), emissive: new THREE.Color('#7fae6a'), emissiveIntensity: 0.05, roughness: 0.6 }, { key: 'glowstrip' });

  // --- unlit / emissive -----------------------------------------------------------
  M.led = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 2), toneMapped: false });
  M.led.name = 'cabin-led-cove';
  M.ledSide = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 2), toneMapped: false });
  M.lens = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });           // instanceColor drives brightness
  M.signBelt = new THREE.MeshBasicMaterial({ map: tex.signBelt, color: new THREE.Color(1, 1, 1), toneMapped: false });
  M.signSmoke = new THREE.MeshBasicMaterial({ map: tex.signSmoke, color: new THREE.Color(1, 1, 1), toneMapped: false });
  M.exitSign = new THREE.MeshBasicMaterial({ map: tex.exitSign, color: new THREE.Color(1, 1, 1), toneMapped: false });
  M.blocker = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  M.blocker.shadowSide = THREE.DoubleSide;

  // --- window panes: additive reflections + slight attenuation of the outside -----------
  M.paneInner = paneMaterial(tex.paneInner, 0.07, 0.10, 'inner');
  M.paneOuter = paneMaterial(null, 0.05, 0.04, 'outer');

  for (const [k, m] of Object.entries(M)) { if (!m.name) m.name = 'cabin-' + k; }
  return M;
}

/**
 * Transparent acrylic pane. Output = reflection/haze (premultiplied) + outside × (1 - alpha).
 * Scratch/haze texture (r = scratches, g = breather hole mask) lights up when the sun hits the pane.
 */
function paneMaterial(scratchTex, alpha, tintStrength, key) {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.02, 0.025, 0.025), roughness: 0.06, metalness: 0.0, transparent: true, opacity: alpha,
    depthWrite: false, envMapIntensity: 1.0,
  });
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  m.premultipliedAlpha = false;
  m.userData.scratch = scratchTex;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSunLocal = SHARED.uSunLocal;
    shader.uniforms.uSunHaze = SHARED.uSunHaze;
    shader.uniforms.uScratch = { value: scratchTex };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaneN; varying vec2 vPaneUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaneN = normal; vPaneUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPaneN; varying vec2 vPaneUv; uniform vec3 uSunLocal; uniform vec3 uSunHaze; uniform sampler2D uScratch;`)
      .replace('#include <opaque_fragment>', `
        float sc = 0.0, hole = 0.0;
        ${scratchTex ? 'vec4 st = texture2D(uScratch, vPaneUv); sc = st.r; hole = st.g;' : ''}
        // pane normal points into the cabin; sun from outside lights the scratches / haze
        float sunIn = max(0.0, dot(-normalize(vPaneN), uSunLocal));
        vec3 haze = uSunHaze * sunIn * (0.08 + sc * 1.6);
        float a = clamp(opacity + hole * 0.75 + sc * 0.04, 0.0, 1.0);
        gl_FragColor = vec4(outgoingLight + haze + vec3(${tintStrength.toFixed(3)} * 0.0), a);
      `);
  };
  m.customProgramCacheKey = () => 'cabinPane' + key;
  m.name = 'cabin-pane-' + key;
  return m;
}
