import * as THREE from 'three';

/**
 * World materials: MeshLambert (per-fragment, unshadowed) patched with
 *   - an atmospheric fog in world space shared by every world material and the sky: distance haze
 *     (smoothstep like THREE.Fog with near 0, so it matches the zombies' standard fog), a ground
 *     mist layer (exponential in height, integrated along the view ray) and a warm glow toward the
 *     sun / moon, so the haze and the sky's horizon are the same colour in every direction;
 *   - optional wind sway (a `sway` vertex attribute: 0 at the root, ~1 at the tips);
 *   - optional scaling of the sun's direct light (interiors, baked shadows);
 *   - rain wetness (darker albedo).
 * All of them share the uniform objects in WORLD, so the time of day updates one place.
 */

export const WORLD = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
  uWindAmp: { value: 0.35 },
  uFogColor: { value: new THREE.Color(0x6a5a6e) },
  uFogSunColor: { value: new THREE.Color(0xd08850) },
  uFogSunDir: { value: new THREE.Vector3(-1, 0.05, 0).normalize() },
  uFogParams: { value: new THREE.Vector4(620, 1, 0.012, 6) }, // far, max, mist density, mist height
  uFogGlow: { value: 5 },
  uFlash: { value: 0 },
  uRain: { value: 0 },
  uNight: { value: 0 },
  uDirInterior: { value: 0.22 },
};

export const FOG_PARS = /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform vec3 uFogSunDir;
uniform vec4 uFogParams;
uniform float uFogGlow;
uniform float uFlash;
vec3 worldFogColor(vec3 dir) {
  float glow = pow(max(dot(dir, uFogSunDir), 0.0), uFogGlow);
  return mix(uFogColor, uFogSunColor, glow) + uFlash * vec3(0.32, 0.36, 0.48);
}
float worldFogAmount(vec3 wp, out vec3 dir) {
  vec3 v = wp - cameraPosition;
  float d = length(v);
  dir = v / max(d, 1e-4);
  float base = smoothstep(0.0, uFogParams.x, d) * uFogParams.y;
  float H = uFogParams.w;
  float y0 = max(cameraPosition.y, 0.0), y1 = max(wp.y, -2.0);
  float dy = y1 - y0;
  float e0 = exp(-y0 / H), e1 = exp(-y1 / H);
  float od = abs(dy) > 0.05 ? d * H * (e0 - e1) / dy : d * e0;
  float mist = 1.0 - exp(-uFogParams.z * od);
  return 1.0 - (1.0 - base) * (1.0 - mist);
}
vec3 applyWorldFog(vec3 col, vec3 wp) {
  vec3 dir;
  float f = worldFogAmount(wp, dir);
  return mix(col, worldFogColor(dir), f);
}
`;

const SWAY_GLSL = /* glsl */ `
#ifdef WORLD_SWAY
{
  float ph = uTime * 1.9 + dot(wPos.xz, vec2(0.21, 0.17));
  float gust = 0.55 + 0.45 * sin(uTime * 0.37 + wPos.x * 0.013 + wPos.z * 0.011);
  vec2 off = uWindDir * (0.5 + 0.5 * sin(ph)) * gust + vec2(sin(ph * 1.7 + 1.3), cos(ph * 1.3)) * 0.22;
  wPos.xz += off * sway * uWindAmp;
  wPos.y -= dot(off, off) * sway * uWindAmp * 0.12;
}
#endif
`;

const PROJECT_GLSL = /* glsl */ `
vec4 wPos = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  wPos = instanceMatrix * wPos;
#endif
wPos = modelMatrix * wPos;
${SWAY_GLSL}
vWorldPos = wPos.xyz;
vec4 mvPosition = viewMatrix * wPos;
gl_Position = projectionMatrix * mvPosition;
`;

/**
 * Patch a built-in lit material (Lambert / Phong / Standard) or a ShaderMaterial built from
 * THREE.ShaderLib with world fog etc. opts: { sway, wet (0..1 darkening in rain), dirMul (GLSL
 * float expression scaling the directional lights), interior (dirMul = uDirInterior),
 * fragPars, vertPars, mapFrag (replaces map_fragment), colorFrag (after color_fragment),
 * emissiveFrag (after emissivemap_fragment), outFrag (before the fog), key }
 */
export function patchWorld(mat, opts = {}) {
  // (wetness is a per-material uniform so materials that differ only in it share one program)
  const key = ['world', opts.sway ? 's' : '', opts.wet ? 'w' : '', opts.interior ? 'i' : '', opts.dirMul ?? '', opts.indirectMul ?? '', opts.key ?? ''].join('|');
  const wet = { value: opts.wet ?? 0 };
  mat.userData.wet = wet;
  mat.fog = false;
  mat.onBeforeCompile = (shader) => {
    for (const k of Object.keys(WORLD)) shader.uniforms[k] = WORLD[k];
    shader.uniforms.uWet = wet;
    if (opts.uniforms) Object.assign(shader.uniforms, opts.uniforms);
    let vs = shader.vertexShader, fs = shader.fragmentShader;
    vs = vs.replace('#include <common>', `#include <common>
varying vec3 vWorldPos;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindAmp;
${opts.sway ? '#define WORLD_SWAY\nattribute float sway;' : ''}
${opts.vertPars ?? ''}`);
    vs = vs.replace('#include <project_vertex>', PROJECT_GLSL + (opts.vertMain ?? ''));
    fs = fs.replace('#include <common>', `#include <common>
varying vec3 vWorldPos;
uniform float uRain;
uniform float uNight;
uniform float uTime;
uniform float uDirInterior;
uniform float uWet;
${FOG_PARS}
${opts.fragPars ?? ''}`);
    if (opts.mapFrag) fs = fs.replace('#include <map_fragment>', opts.mapFrag);
    let after = opts.colorFrag ?? '';
    if (opts.wet) after += `\n diffuseColor.rgb *= 1.0 - uRain * uWet;`;
    if (after) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${after}`);
    if (opts.emissiveFrag) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${opts.emissiveFrag}`);
    const indirect = opts.interior ? '0.62' : opts.indirectMul;
    if (indirect) fs = fs.replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n irradiance *= ${indirect};`);
    if (opts.beginVertex) vs = vs.replace('#include <begin_vertex>', opts.beginVertex);
    if (opts.beginNormal) vs = vs.replace('#include <beginnormal_vertex>', opts.beginNormal);
    const dirMul = opts.interior ? 'uDirInterior' : opts.dirMul;
    if (dirMul) {
      fs = fs.replace('getDirectionalLightInfo( directionalLight, directLight );', `getDirectionalLightInfo( directionalLight, directLight );\n directLight.color *= ${dirMul};`);
    }
    fs = fs.replace('#include <fog_fragment>', `${opts.outFrag ?? ''}\n gl_FragColor.rgb = applyWorldFog(gl_FragColor.rgb, vWorldPos);`);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** A world Lambert material. params: MeshLambertMaterial params (map, color, alphaTest, side...). */
export function lambert(params = {}, opts = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, ...params });
  return patchWorld(m, opts);
}

/**
 * An unlit world material (glows, lamps, emissive windows, decals): colour x map x vertex colour x
 * `intensity` uniform, fogged; blending: 'add' | 'alpha' | 'none'. Night-only things pass
 * `nightOnly` (intensity follows uNight).
 */
export function unlit(params = {}) {
  const uniforms = {
    map: { value: params.map ?? null },
    uColor: { value: new THREE.Color(params.color ?? 0xffffff) },
    uIntensity: { value: params.intensity ?? 1 },
    uFogK: { value: params.fogK ?? 1 },
  };
  for (const k of Object.keys(WORLD)) uniforms[k] = WORLD[k];
  const add = params.blending === 'add';
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        #ifdef USE_COLOR
          vColor = color;
        #else
          vColor = vec3(1.0);
        #endif
        #ifdef USE_INSTANCING_COLOR
          vColor *= instanceColor;
        #endif
        vUv = uv;
        vec4 wPos = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wPos = instanceMatrix * wPos;
        #endif
        wPos = modelMatrix * wPos;
        vWorldPos = wPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * wPos;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uFogK;
      uniform float uNight;
      uniform float uTime;
      varying vec3 vColor;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      ${FOG_PARS}
      void main() {
        vec4 t = ${params.map ? 'texture2D(map, vUv)' : 'vec4(1.0)'};
        ${params.alphaTest ? `if (t.a < ${params.alphaTest.toFixed(3)}) discard;` : ''}
        float k = uIntensity ${params.nightOnly ? '* uNight' : ''};
        ${params.flicker ? 'k *= 0.82 + 0.18 * sin(uTime * 23.0 + vWorldPos.x * 3.1) * sin(uTime * 7.3 + vWorldPos.z);' : ''}
        vec3 c = uColor * vColor * t.rgb * k;
        vec3 dir;
        float f = worldFogAmount(vWorldPos, dir) * uFogK;
        ${add ? 'c *= 1.0 - f; gl_FragColor = vec4(c, 1.0);' : 'c = mix(c, worldFogColor(dir), f); gl_FragColor = vec4(c, t.a);'}
      }`,
    vertexColors: params.vertexColors ?? true,
    transparent: params.blending === 'add' || params.blending === 'alpha',
    depthWrite: params.depthWrite ?? !(params.blending === 'add' || params.blending === 'alpha'),
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: params.side ?? THREE.FrontSide,
    toneMapped: false,
  });
  if (params.polygonOffset) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -4;
  }
  return mat;
}
