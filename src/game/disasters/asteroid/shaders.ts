/**
 * Forward-pass materials for the asteroid (rendered into the HDR target after translucents, so
 * outputs are linear radiance; exposure, bloom and TAA happen afterwards).
 *
 *  - rock:     PBR-lit dark rock (GGX + Lambert, sky SH ambient, bump from procedural fbm)
 *              with a heated front and glowing fracture lines that scale with entry heating.
 *  - plasma:   additive shell around the rock: blinding stagnation point, fresnel limb.
 *  - sheath:   additive paraboloid bow shock streaming back into the trail.
 *  - trail:    additive turbulent plasma cone, white-hot to deep red along its length.
 *  - smoke:    premultiplied dark smoke trail around the plasma cone.
 *  - glow:     camera-facing flare so the asteroid reads as a bright point while far away.
 *  - fireball: premultiplied billowing fireball cooling from white heat to sooty smoke.
 *  - shock:    hemispherical shock shell refracting the scene, with a bright condensation rim.
 *  - dustwall: premultiplied ground-hugging dust wall riding the shock front.
 */
import * as THREE from 'three';

export const GLSL_NOISE = /* glsl */ `
float ah13(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float avnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ah13(i), ah13(i + vec3(1, 0, 0)), f.x), mix(ah13(i + vec3(0, 1, 0)), ah13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(ah13(i + vec3(0, 0, 1)), ah13(i + vec3(1, 0, 1)), f.x), mix(ah13(i + vec3(0, 1, 1)), ah13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float afbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * avnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s / 0.9375;
}
// normalised temperature 0..1 -> blackbody-like colour (dark red .. orange .. white .. blue-white)
vec3 ablackbody(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = vec3(1.0, 0.18, 0.02) * smoothstep(0.0, 0.3, t);
  c = mix(c, vec3(1.0, 0.5, 0.12), smoothstep(0.25, 0.55, t));
  c = mix(c, vec3(1.0, 0.86, 0.62), smoothstep(0.5, 0.82, t));
  c = mix(c, vec3(0.86, 0.92, 1.0), smoothstep(0.85, 1.0, t));
  return c;
}
`;

const SH = /* glsl */ `
uniform vec3 u_sh[9];
vec3 shIrradiance(vec3 n) {
  return u_sh[0] * 0.282095 + u_sh[1] * 0.488603 * n.y + u_sh[2] * 0.488603 * n.z + u_sh[3] * 0.488603 * n.x
    + u_sh[4] * 1.092548 * n.x * n.y + u_sh[5] * 1.092548 * n.y * n.z + u_sh[6] * 0.315392 * (3.0 * n.z * n.z - 1.0)
    + u_sh[7] * 1.092548 * n.x * n.z + u_sh[8] * 0.546274 * (n.x * n.x - n.y * n.y);
}
`;

const BASIC_VERT = /* glsl */ `
precision highp float;
in vec3 position;
in vec3 normal;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
out vec3 vN;
out vec3 vW;
out vec3 vL;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vL = position;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ADDITIVE = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor } as const;
const PREMULT = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } as const;

function raw(vertexShader: string, fragmentShader: string, uniforms: Record<string, THREE.IUniform>, extra: Partial<THREE.ShaderMaterialParameters> = {}) {
  return new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader, fragmentShader, uniforms, ...extra });
}

/** Uniforms shared by the asteroid's materials (one object per asteroid). */
export function asteroidUniforms(sh: THREE.IUniform) {
  return {
    u_time: { value: 0 },
    u_sunDir: { value: new THREE.Vector3(0, 1, 0) },
    u_sunCol: { value: new THREE.Color(1, 1, 1) },
    u_sh: sh,
    /** World-space unit direction of motion. */
    u_travel: { value: new THREE.Vector3(0, -1, 0) },
    /** Entry heating 0..1. */
    u_heat: { value: 0 },
    /** Plasma brightness (HDR scale). */
    u_plasma: { value: 1 },
    /** Bump amplitude (world units). */
    u_bump: { value: 0.5 },
  };
}
export type AsteroidUniforms = ReturnType<typeof asteroidUniforms>;

// ------------------------------------------------------------------------------- rock
export function rockMaterial(U: AsteroidUniforms, instanced = false) {
  const vert = /* glsl */ `
precision highp float;
in vec3 position;
in vec3 normal;
in vec3 color;
#ifdef INSTANCED
in mat4 instanceMatrix;
in float a_heat;
#endif
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
out vec3 vN;
out vec3 vW;
out vec3 vL;
out vec3 vC;
out float vHeat;
void main() {
#ifdef INSTANCED
  mat4 m = modelMatrix * instanceMatrix;
  vHeat = a_heat;
#else
  mat4 m = modelMatrix;
  vHeat = 1.0;
#endif
  vec4 w = m * vec4(position, 1.0);
  vW = w.xyz;
  vL = position;
  vC = color;
  vN = normalize(mat3(m) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
  const frag = /* glsl */ `
precision highp float;
${GLSL_NOISE}
${SH}
uniform vec3 cameraPosition;
uniform vec3 u_sunDir;
uniform vec3 u_sunCol;
uniform vec3 u_travel;
uniform float u_heat;
uniform float u_time;
uniform float u_bump;
in vec3 vN;
in vec3 vW;
in vec3 vL;
in vec3 vC;
in float vHeat;
out vec4 o;
const float PI = 3.14159265;
void main() {
  vec3 N = normalize(vN);
  // procedural bump (surface gradient from screen-space derivatives)
  float h = afbm(vL * 7.0) * 0.6 + afbm(vL * 23.0) * 0.4;
  float hb = h * u_bump;
  vec3 dpx = dFdx(vW), dpy = dFdy(vW);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(hb) * r1 + dFdy(hb) * r2);
  vec3 Nb = abs(det) * N - grad;
  if (dot(Nb, Nb) > 1e-20) N = normalize(Nb);
  vec3 V = normalize(cameraPosition - vW);
  vec3 L = normalize(u_sunDir);
  vec3 H = normalize(L + V);
  vec3 albedo = vC * (0.8 + 0.4 * h);
  float NL = max(dot(N, L), 0.0), NV = max(dot(N, V), 1e-3), NH = max(dot(N, H), 0.0);
  float rough = 0.82, a2 = rough * rough * rough * rough;
  float dd = NH * NH * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * dd * dd);
  float k = (rough + 1.0) * (rough + 1.0) / 8.0;
  float G = NL / (NL * (1.0 - k) + k) * NV / (NV * (1.0 - k) + k);
  float F = 0.04 + 0.96 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  vec3 col = (albedo / PI * (1.0 - F) + D * G * F / max(4.0 * NL * NV, 1e-3)) * u_sunCol * NL;
  col += albedo / PI * max(shIrradiance(N), vec3(0.0));
  // entry heating: the leading face glows, fractures bleed light
  float heat = u_heat * vHeat;
  float front = smoothstep(-0.25, 0.95, dot(N, normalize(u_travel)));
  float c = afbm(vL * 4.0 + vec3(0.0, u_time * 0.05, 0.0));
  float ridge = 1.0 - abs(c * 2.0 - 1.0);
  float crack = pow(ridge, 14.0);
  float t = 0.35 + 0.55 * front + 0.1 * c;
  float glow = heat * (front * front * (0.6 + 2.6 * h) + crack * (1.2 + 12.0 * front));
  col += ablackbody(t) * glow;
  o = vec4(col, 1.0);
}
`;
  return raw(vert, frag, U as any, { defines: instanced ? { INSTANCED: 1 } : {}, depthWrite: true, depthTest: true });
}

// ------------------------------------------------------------------------------- plasma shell
export function plasmaMaterial(U: AsteroidUniforms) {
  const frag = /* glsl */ `
precision highp float;
${GLSL_NOISE}
uniform vec3 cameraPosition;
uniform vec3 u_travel;
uniform float u_heat;
uniform float u_plasma;
uniform float u_time;
in vec3 vN;
in vec3 vW;
in vec3 vL;
out vec4 o;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float front = dot(N, normalize(u_travel));
  float fres = 1.0 - abs(dot(N, V));
  float n = afbm(vL * 2.5 - normalize(u_travel) * u_time * 4.0);
  float f = max(front, 0.0);
  // the limb blazes (compressed, ionised air seen edge-on); the face stays see-through to the rock
  float I = pow(fres, 2.2) * smoothstep(-0.5, 0.5, front) * (0.6 + 0.8 * n) * 5.0 + pow(f, 6.0) * (0.3 + 0.5 * n) * 1.2;
  vec3 col = ablackbody(0.7 + 0.3 * f) * I * u_plasma * u_heat;
  o = vec4(col, 0.0);
}
`;
  return raw(BASIC_VERT, frag, U as any, { ...ADDITIVE, transparent: true, depthWrite: false, side: THREE.FrontSide });
}

// ------------------------------------------------------------------------------- bow shock sheath
/** Paraboloid around the rock, local +Y = backwards (up the trail), unit = rock radius. */
export function sheathGeometry(len = 7) {
  const pts: THREE.Vector2[] = [];
  const y0 = -1.45;
  for (let i = 0; i <= 40; i++) {
    const y = y0 + Math.pow(i / 40, 1.6) * (len - y0);
    const r = 1.32 * Math.sqrt(Math.max(0, (y - y0) / 1.0)) + (i === 0 ? 0 : 0.001);
    pts.push(new THREE.Vector2(r, y));
  }
  return new THREE.LatheGeometry(pts, 64);
}

export function sheathMaterial(U: AsteroidUniforms, len = 7) {
  const frag = /* glsl */ `
precision highp float;
${GLSL_NOISE}
uniform vec3 cameraPosition;
uniform float u_heat;
uniform float u_plasma;
uniform float u_time;
in vec3 vN;
in vec3 vW;
in vec3 vL;
out vec4 o;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float v = clamp((vL.y + 1.45) / ${(len + 1.45).toFixed(2)}, 0.0, 1.0);
  float fres = 1.0 - abs(dot(N, V));
  float ang = atan(vL.z, vL.x);
  float streak = afbm(vec3(cos(ang) * 3.0, vL.y * 0.9 - u_time * 9.0, sin(ang) * 3.0));
  float I = (pow(fres, 1.4) * 0.9 + 0.2) * exp(-v * 3.2) * (0.35 + 1.1 * streak) * smoothstep(0.0, 0.04, v);
  vec3 col = ablackbody(0.98 - v * 0.75) * I * u_plasma * u_heat * 2.5;
  o = vec4(col, 0.0);
}
`;
  return raw(BASIC_VERT, frag, U as any, { ...ADDITIVE, transparent: true, depthWrite: false, side: THREE.DoubleSide });
}

// ------------------------------------------------------------------------------- trail
/** Widening cone, local +Y = backwards, unit = rock radius. */
export function trailGeometry(len: number, r0: number, r1: number, segs = 48) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = Math.pow(i / segs, 1.5);
    pts.push(new THREE.Vector2(r0 + (r1 - r0) * Math.sqrt(t), t * len));
  }
  return new THREE.LatheGeometry(pts, 48);
}

export function trailMaterial(U: AsteroidUniforms, len: number) {
  const frag = /* glsl */ `
precision highp float;
${GLSL_NOISE}
uniform vec3 cameraPosition;
uniform float u_heat;
uniform float u_plasma;
uniform float u_time;
uniform vec3 u_travel;
in vec3 vN;
in vec3 vW;
in vec3 vL;
out vec4 o;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float v = clamp(vL.y / ${len.toFixed(1)}, 0.0, 1.0);
  // soft edges seen from the side; seen along the axis the whole cone glows (looking down the trail)
  float along = abs(dot(normalize(u_travel), V));
  float facing = mix(pow(abs(dot(N, V)), 1.6), 1.0, along * along);
  float turb = afbm(vec3(vL.x * 0.45, vL.y * 0.16 - u_time * 7.0, vL.z * 0.45));
  float turb2 = afbm(vec3(vL.x * 1.3, vL.y * 0.5 - u_time * 13.0, vL.z * 1.3));
  float I = pow(1.0 - v, 2.4) * facing * (0.15 + 1.4 * turb * turb + 0.5 * turb2) * smoothstep(0.0, 0.02, v);
  vec3 col = ablackbody(0.9 - v * 0.85 + 0.1 * turb2) * I * u_plasma * u_heat * 1.6;
  o = vec4(col, 0.0);
}
`;
  return raw(BASIC_VERT, frag, U as any, { ...ADDITIVE, transparent: true, depthWrite: false, side: THREE.FrontSide });
}

export function smokeTrailMaterial(U: AsteroidUniforms, len: number) {
  const frag = /* glsl */ `
precision highp float;
${GLSL_NOISE}
${SH}
uniform vec3 cameraPosition;
uniform vec3 u_sunCol;
uniform float u_heat;
uniform float u_time;
uniform vec3 u_travel;
in vec3 vN;
in vec3 vW;
in vec3 vL;
out vec4 o;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float v = clamp(vL.y / ${len.toFixed(1)}, 0.0, 1.0);
  float along = abs(dot(normalize(u_travel), V));
  float facing = mix(abs(dot(N, V)), 0.55, along * along);
  float turb = afbm(vec3(vL.x * 0.22, vL.y * 0.07 - u_time * 1.5, vL.z * 0.22));
  float a = pow(facing, 1.8) * smoothstep(0.04, 0.16, v) * pow(1.0 - v, 0.8) * (0.35 + 0.9 * turb) * 0.8 * clamp(u_heat * 1.5, 0.0, 1.0);
  a = clamp(a, 0.0, 0.92);
  vec3 lit = vec3(0.07, 0.06, 0.055) * (u_sunCol * 0.25 + max(shIrradiance(vec3(0.0, 1.0, 0.0)), vec3(0.0))) / 3.14159;
  // the hot end glows from the plasma inside
  lit += ablackbody(0.6 - v) * 3.0 * pow(1.0 - v, 6.0) * u_heat;
  o = vec4(lit * a, a);
}
`;
  return raw(BASIC_VERT, frag, U as any, { ...PREMULT, transparent: true, depthWrite: false, side: THREE.FrontSide });
}

// ------------------------------------------------------------------------------- glow flare
export function glowMaterial() {
  const vert = /* glsl */ `
precision highp float;
in vec3 position;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 u_center;
uniform float u_size;
out vec2 vUv;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vUv = position.xy;
  vec3 p = u_center + (right * position.x + up * position.y) * u_size;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
  const frag = /* glsl */ `
precision highp float;
uniform float u_intensity;
uniform vec3 u_color;
in vec2 vUv;
out vec4 o;
void main() {
  float r = length(vUv);
  float core = exp(-r * r * 60.0);
  float halo = exp(-r * 7.0) * 0.18 + exp(-r * 18.0) * 0.45;
  float spikes = pow(max(0.0, 1.0 - abs(vUv.x * vUv.y) * 120.0), 8.0) * max(0.0, 1.0 - r) * 0.35;
  float I = (core * 5.0 + halo + spikes) * smoothstep(1.0, 0.6, r);
  o = vec4(u_color * I * u_intensity, 0.0);
}
`;
  return raw(vert, frag, { u_center: { value: new THREE.Vector3() }, u_size: { value: 1 }, u_intensity: { value: 1 }, u_color: { value: new THREE.Color(1, 0.8, 0.6) } }, {
    ...ADDITIVE, transparent: true, depthWrite: false, depthTest: true,
  });
}

// ------------------------------------------------------------------------------- fireball
export function fireballMaterial(sh: THREE.IUniform) {
  const vert = /* glsl */ `
precision highp float;
${GLSL_NOISE}
in vec3 position;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float u_time;
uniform float u_flatten;
out vec3 vN;
out vec3 vW;
out vec3 vL;
void main() {
  vec3 p = position;
  float n = afbm(p * 1.7 + vec3(0.0, -u_time * 0.25, 0.0));
  p *= 0.78 + 0.5 * n;
  p.y = max(p.y, u_flatten);
  vL = position;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * position);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
  const frag = /* glsl */ `
precision highp float;
${GLSL_NOISE}
${SH}
uniform vec3 cameraPosition;
uniform float u_time;
uniform float u_temp;
uniform float u_glow;
uniform float u_alpha;
uniform vec3 u_sunCol;
in vec3 vN;
in vec3 vW;
in vec3 vL;
out vec4 o;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float facing = abs(dot(N, V));
  float n = afbm(vL * 3.2 + vec3(0.0, -u_time * 0.5, 0.0));
  float n2 = afbm(vL * 9.0 + vec3(0.0, -u_time * 0.9, 0.0));
  float temp = u_temp * (0.45 + 0.75 * n + 0.15 * n2) * (0.55 + 0.45 * facing);
  float tc = clamp(temp, 0.0, 1.0);
  vec3 em = ablackbody(tc) * u_glow * tc * tc * (0.6 + 0.8 * n2);
  float a = u_alpha * smoothstep(0.0, 0.45, facing) * (0.7 + 0.3 * n);
  vec3 smoke = vec3(0.05, 0.043, 0.038) * (u_sunCol * max(N.y * 0.5 + 0.5, 0.0) * 0.3 + max(shIrradiance(N), vec3(0.0))) / 3.14159;
  o = vec4(em * a + smoke * a * (1.0 - tc), a);
}
`;
  const U = {
    u_time: { value: 0 }, u_temp: { value: 1 }, u_glow: { value: 60 }, u_alpha: { value: 1 }, u_flatten: { value: -0.1 },
    u_sunCol: { value: new THREE.Color(1, 1, 1) }, u_sh: sh,
  };
  return raw(vert, frag, U, { ...PREMULT, transparent: true, depthWrite: false, side: THREE.DoubleSide });
}

// ------------------------------------------------------------------------------- shock shell
export function shockMaterial(sceneColor: THREE.IUniform, resolution: THREE.IUniform) {
  const frag = /* glsl */ `
precision highp float;
${GLSL_NOISE}
uniform vec3 cameraPosition;
uniform mat4 viewMatrix;
uniform sampler2D u_scene;
uniform vec2 u_resolution;
uniform float u_fade;
uniform float u_distort;
uniform float u_glowI;
uniform float u_time;
in vec3 vN;
in vec3 vW;
in vec3 vL;
out vec4 o;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float f = 1.0 - abs(dot(N, V));
  float rim = pow(f, 3.0);
  float n = afbm(vL * 9.0 + vec3(u_time * 0.7));
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 Nv = mat3(viewMatrix) * N;
  vec2 off = Nv.xy * (rim * 0.7 + 0.15) * u_distort * (0.7 + 0.6 * n);
  vec3 bg = texture(u_scene, clamp(uv + off, vec2(0.001), vec2(0.999))).rgb;
  float a = clamp((rim * 0.85 + 0.12) * u_fade, 0.0, 1.0);
  // condensation (Wilson cloud) and compression heating at the limb
  vec3 glow = vec3(1.0, 0.93, 0.85) * pow(f, 7.0) * u_glowI * (0.6 + 0.8 * n);
  // fade toward the ground so the shell meets the terrain softly
  float g = smoothstep(0.0, 0.08, vL.y);
  o = vec4((bg * a + glow * u_fade) * g, a * g);
}
`;
  const U = {
    u_scene: sceneColor, u_resolution: resolution, u_fade: { value: 1 }, u_distort: { value: 0.04 }, u_glowI: { value: 4 }, u_time: { value: 0 },
  };
  return raw(BASIC_VERT, frag, U, { ...PREMULT, transparent: true, depthWrite: false, side: THREE.FrontSide });
}

// ------------------------------------------------------------------------------- ground dust wall
export function dustWallMaterial(sh: THREE.IUniform) {
  const frag = /* glsl */ `
precision highp float;
${GLSL_NOISE}
${SH}
uniform vec3 cameraPosition;
uniform vec3 u_sunCol;
uniform float u_fade;
uniform float u_hot;
uniform float u_time;
in vec3 vN;
in vec3 vW;
in vec3 vL;
out vec4 o;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float facing = abs(dot(N, V));
  float ang = atan(vL.z, vL.x);
  float n = afbm(vec3(cos(ang) * 14.0, vL.y * 3.0 - u_time * 1.5, sin(ang) * 14.0));
  float h = vL.y; // 0 ground .. 1 top
  float a = pow(1.0 - h, 1.6) * smoothstep(0.0, 0.05, h) * (0.25 + 0.95 * n) * pow(facing, 0.6) * u_fade;
  a = clamp(a, 0.0, 0.9);
  vec3 alb = vec3(0.32, 0.26, 0.2);
  vec3 lit = alb / 3.14159 * (u_sunCol * 0.6 + max(shIrradiance(vec3(0.0, 1.0, 0.0)), vec3(0.0)));
  lit += ablackbody(0.55) * u_hot * pow(1.0 - h, 3.0) * n;
  o = vec4(lit * a, a);
}
`;
  const U = { u_sunCol: { value: new THREE.Color(1, 1, 1) }, u_sh: sh, u_fade: { value: 1 }, u_hot: { value: 0 }, u_time: { value: 0 } };
  return raw(BASIC_VERT, frag, U, { ...PREMULT, transparent: true, depthWrite: false, side: THREE.DoubleSide });
}

/** Open cylinder wall, radius 1, y 0..1. */
export function wallGeometry(segs = 128) {
  const pts = [new THREE.Vector2(1, 0), new THREE.Vector2(1, 0.25), new THREE.Vector2(0.97, 0.6), new THREE.Vector2(0.9, 1)];
  return new THREE.LatheGeometry(pts, segs);
}
