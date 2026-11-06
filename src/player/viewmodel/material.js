// Viewmodel material: vertex-coloured boxes with a procedural per-texel "pixel" pattern (Minecraft entity look),
// lit with the shared world lighting model (LIGHTING_GLSL + globalUniforms).
//
// The viewmodel scene has its own camera sitting at the origin looking down -Z, so viewmodel-scene space ==
// main-camera local space. To light it like the world we transform positions/normals with the main camera's
// world rotation (uniform uVMRot) and position (uCamPos, kept up to date by the renderer).
import * as THREE from 'three';
import { LIGHTING_GLSL, globalUniforms } from '../../render/materials.js';

/** Surface "material" ids (stored per box face in the aFace.z attribute). */
export const M = {
  PLAIN: 0,   // painted / generic: soft noise
  METAL: 1,   // blued / anodised gun metal: fine noise, brushed streaks, worn bright edges
  WOOD: 2,    // wood grain along the long face axis, darker edges
  SKIN: 3,    // subtle
  CLOTH: 4,   // weave + darker seams on the edges
  POLY: 5,    // polymer / plastic: low noise, slightly lighter edges
  PAINT: 6,   // painted metal: edges chipped to bare steel
  STEEL: 7,   // bright steel (blades, stainless): streaks + bright edges
  FLAT: 8,    // exact colours (extruded icons)
  EMIT: 9,    // unlit / glowing (red dots, sight inserts)
  RUBBER: 10, // grippy dark rubber: coarse noise
  GLASS: 11,  // glossy: highlight on the edges + fake specular
  BRASS: 12,  // warm metal, bright edges
  LENS: 13,   // flashlight lens: glows when the flashlight is on
  TAPE: 14,   // duct tape / wraps: banded
};

const VERT = /* glsl */ `
in vec3 aCol;
in vec4 aFace;   // face size in texels (w, h), material id, seed
in vec2 aTex;    // texel coordinates inside the face
out vec3 vCol;
out vec4 vFace;
out vec2 vTex;
out vec3 vViewPos;
out vec3 vViewNormal;
void main() {
  vCol = aCol;
  vFace = aFace;
  vTex = aTex;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
uniform vec2 uEntityLight;   // sky, block 0..1
uniform mat3 uVMRot;         // main camera rotation (view -> world)
uniform float uOpacity;      // < 1 => ordered-dither fade (scope ADS)
uniform float uSelfLight;    // extra light while the flashlight is on
uniform vec4 uMuzzle;        // xyz muzzle position (view space), w intensity
uniform vec4 uTint;          // rgb, amount
in vec3 vCol;
in vec4 vFace;
in vec2 vTex;
in vec3 vViewPos;
in vec3 vViewNormal;
out vec4 fragColor;

float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float bayer4(vec2 fc) {
  ivec2 p = ivec2(mod(fc, 4.0));
  int i = p.x + p.y * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[i] + 0.5) / 16.0;
}

void main() {
  if (uOpacity < 0.999 && uOpacity <= bayer4(gl_FragCoord.xy)) discard;

  int m = int(vFace.z + 0.5);
  float seed = vFace.w;
  vec2 sz = max(vFace.xy, vec2(1.0));
  vec2 t = floor(vTex);
  t = min(t, ceil(sz) - 1.0);
  bool edge = t.x < 0.5 || t.y < 0.5 || t.x > sz.x - 1.5 || t.y > sz.y - 1.5;
  bool longX = vFace.x >= vFace.y;
  float along = longX ? t.x : t.y;
  float across = longX ? t.y : t.x;
  float n = h21(t + seed * 7.31) - 0.5;
  float n2 = h21(t * 1.7 + seed * 3.17 + 11.0);

  vec3 col = vCol;
  float lum = 1.0;
  float spec = 0.0;
  if (m == 0) {
    lum += n * 0.07;
  } else if (m == 1) {
    lum += n * 0.07 + (h21(vec2(across, seed)) - 0.5) * 0.07;
    if (edge && n2 > 0.35) col = mix(col, vec3(0.30, 0.32, 0.36), 0.45);
    spec = 0.35;
  } else if (m == 2) {
    float grain = h21(vec2(across * 1.3, seed)) - 0.5;
    float ring = h21(vec2(floor(along / 3.0), across + seed));
    lum += grain * 0.16 + (ring > 0.86 ? -0.14 : 0.0) + n * 0.05;
    if (edge) lum -= 0.10;
  } else if (m == 3) {
    lum += n * 0.05;
  } else if (m == 4) {
    lum += n * 0.10 + (mod(t.x + t.y, 2.0) - 0.5) * 0.04;
    if (edge) lum -= 0.12;
  } else if (m == 5) {
    lum += n * 0.05;
    if (edge) lum += 0.07;
    spec = 0.12;
  } else if (m == 6) {
    lum += n * 0.07;
    if (edge && n2 > 0.45) col = vec3(0.42, 0.43, 0.45);
    spec = 0.15;
  } else if (m == 7) {
    lum += (h21(vec2(across, seed)) - 0.5) * 0.10 + n * 0.04;
    if (edge) lum += 0.22;
    spec = 0.7;
  } else if (m == 8) {
    // exact colours
  } else if (m == 10) {
    lum += n * 0.16;
    if (edge) lum += 0.05;
  } else if (m == 11) {
    lum += n * 0.04;
    if (edge) lum += 0.28;
    spec = 1.0;
  } else if (m == 12) {
    lum += n * 0.06;
    if (edge) lum += 0.25;
    spec = 0.6;
  } else if (m == 14) {
    lum += (mod(along, 3.0) < 0.5 ? -0.12 : 0.0) + n * 0.06;
  }
  col *= max(lum, 0.0);
  col = mix(col, uTint.rgb, uTint.a);

  vec3 nV = normalize(vViewNormal);
  if (!gl_FrontFacing) nV = -nV;
  vec3 nW = normalize(uVMRot * nV);
  vec3 wp = uCamPos + uVMRot * vViewPos;
  vec3 lit = computeLighting(wp, nW, uEntityLight.x, uEntityLight.y, 1.0);
  // view-space fill: keeps the blocky forms readable under flat ambient light
  lit *= 0.80 + 0.20 * dot(nV, normalize(vec3(0.35, 0.80, 0.50)));
  vec3 V = normalize(-vViewPos);
  float facing = max(dot(nV, V), 0.0);
  lit += vec3(1.0, 0.93, 0.80) * uSelfLight * (0.30 + 0.70 * facing);
  if (uMuzzle.w > 0.0) {
    vec3 L = uMuzzle.xyz - vViewPos;
    float d = length(L);
    float att = clamp(1.0 - d / 0.75, 0.0, 1.0);
    lit += vec3(1.0, 0.62, 0.28) * uMuzzle.w * att * att * (0.35 + 0.65 * max(dot(nV, L / max(d, 1e-4)), 0.0)) * 4.0;
  }
  vec3 outc = col * lit;
  if (spec > 0.0) {
    vec3 K = normalize(vec3(0.3, 0.85, 0.45));
    float s = pow(max(dot(reflect(-V, nV), K), 0.0), 24.0);
    float amb = dot(lit, vec3(0.299, 0.587, 0.114));
    outc += vec3(s * spec * 0.35 * min(amb, 1.5));
  }
  if (m == 9) outc = col * 1.8;
  if (m == 13) outc = mix(outc, col * 2.4, clamp(uFlashOn, 0.0, 1.0));
  fragColor = vec4(outc, 1.0);
}
`;

/** One material shared by every viewmodel mesh (hands, weapons, props). */
export function createViewmodelMaterial() {
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      ...globalUniforms,
      uEntityLight: { value: new THREE.Vector2(1, 0) },
      uVMRot: { value: new THREE.Matrix3() },
      uOpacity: { value: 1 },
      uSelfLight: { value: 0 },
      uMuzzle: { value: new THREE.Vector4(0, 0, 0, 0) },
      uTint: { value: new THREE.Vector4(1, 1, 1, 0) },
    },
    side: THREE.FrontSide,
  });
  mat.isEntityMaterial = true;
  return mat;
}

// ---------------------------------------------------------------------------------------------
// Unlit additive material for muzzle flashes / flames (texture with alpha used as intensity).
const FX_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const FX_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D map;
uniform vec3 uColor;
uniform float uIntensity;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 t = texture(map, vUv);
  if (t.a < 0.02) discard;
  fragColor = vec4(t.rgb * uColor * uIntensity * t.a, 1.0);
}
`;
export function createAdditiveMaterial(map, color = 0xffffff, intensity = 3) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: FX_VERT,
    fragmentShader: FX_FRAG,
    uniforms: {
      map: { value: map },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
