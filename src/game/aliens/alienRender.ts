/**
 * Rendering for the invasion (forward HDR scene, after the deferred lighting):
 *  - `hullMaterial`: lit like the world (sun colour/direction + sky SH ambient from the renderer's
 *    light uniforms), metallic specular, emissive lights from the `glow` attribute, scorch +
 *    flickering fire on damaged ships (per-instance `a_state`), distance haze toward the
 *    atmosphere's fog colour. Instanced (fleets) or single (mothership).
 *  - `BillboardPool`: instanced camera-facing quads for engine glows (kept at least a few pixels
 *    wide so a fleet kilometres away still reads as lights), plasma entry streaks,
 *    bolts, fireballs and smoke.
 */
import * as THREE from 'three';
import type { Renderer } from '../../render/renderer';

const SH_GLSL = /* glsl */ `
vec3 shIrradiance(vec3 n, vec3 sh[9]) {
  return max(vec3(0.0),
    sh[0] * 0.282095 +
    sh[1] * (0.488603 * n.y) + sh[2] * (0.488603 * n.z) + sh[3] * (0.488603 * n.x) +
    sh[4] * (1.092548 * n.x * n.y) + sh[5] * (1.092548 * n.y * n.z) + sh[6] * (0.315392 * (3.0 * n.z * n.z - 1.0)) +
    sh[7] * (1.092548 * n.x * n.z) + sh[8] * (0.546274 * (n.x * n.x - n.y * n.y)));
}`;

const HULL_VERT = /* glsl */ `
in vec3 position;
in vec3 normal;
in vec3 color;
in float glow;
#ifdef INSTANCED
in mat4 instanceMatrix;
in vec4 a_state;
#endif
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
out vec3 v_wpos;
out vec3 v_n;
out vec3 v_col;
out vec3 v_lpos;
out float v_glow;
out vec4 v_state;
void main(){
  mat4 M = modelMatrix;
#ifdef INSTANCED
  M = modelMatrix * instanceMatrix;
  v_state = a_state;
#else
  v_state = vec4(0.0, 1.0, 0.0, 0.0);
#endif
  vec4 wp = M * vec4(position, 1.0);
  v_wpos = wp.xyz;
  v_lpos = position;
  v_n = normalize(mat3(M) * normal);
  v_col = color;
  v_glow = glow;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const HULL_FRAG = /* glsl */ `
precision highp float;
#define PI 3.14159265
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_sh[9];
uniform vec3 u_cameraPos;
uniform vec3 u_fogColor;
uniform float u_fogDist;
uniform float u_glowGain;
uniform float u_time;
in vec3 v_wpos;
in vec3 v_n;
in vec3 v_col;
in vec3 v_lpos;
in float v_glow;
in vec4 v_state;   // x: damage 0..1 (scorch/fire), y: lights 0..1, z: seed, w: wreck (1 = dead hulk)
out vec4 o;
${SH_GLSL}
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
void main(){
  vec3 N = normalize(v_n);
  vec3 V = normalize(u_cameraPos - v_wpos);
  if (dot(N, V) < 0.0) N = -N;
  float dmg = v_state.x;
  vec3 albedo = v_col;
  // scorched, cracked plating on damaged ships
  float scorch = smoothstep(0.35, 0.75, vnoise(v_lpos * 0.6 + v_state.z * 13.0)) * dmg;
  albedo *= 1.0 - 0.85 * scorch;
  vec3 col;
  if (v_glow > 0.0) {
    float flick = v_state.w > 0.5 ? 0.0 : mix(1.0, 0.5 + 0.5 * step(0.5, fract(u_time * 7.0 + v_state.z * 31.0)), dmg);
    col = v_col * v_glow * u_glowGain * v_state.y * flick;
    col += albedo * 0.02;
  } else {
    vec3 L = normalize(u_lightDir);
    float NoL = max(dot(N, L), 0.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 48.0) * 1.6;
    vec3 F0 = mix(vec3(0.05), albedo * 2.2, 0.55);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(N, V), 0.0), 5.0) * 0.25;
    vec3 irr = shIrradiance(N, u_sh);
    col = albedo * (NoL * u_lightColor / PI + irr / PI) + F * spec * u_lightColor * NoL / PI * 0.5;
    // faint rim from the sky
    col += irr / PI * F * 0.6;
  }
  // fire licking out of the damage
  if (dmg > 0.0) {
    float fire = smoothstep(0.62, 0.9, vnoise(v_lpos * 1.3 + vec3(0.0, -u_time * 3.0, 0.0) + v_state.z * 7.0)) * scorch;
    col += vec3(4.0, 1.6, 0.4) * fire * (0.7 + 0.3 * sin(u_time * 23.0 + v_lpos.x)) * 3.0;
  }
  float d = length(u_cameraPos - v_wpos);
  float fog = 1.0 - exp(-d / u_fogDist);
  col = mix(col, u_fogColor, fog * 0.9 * (v_glow > 0.0 ? 0.5 : 1.0));
  o = vec4(col, 1.0);
}`;

export function hullMaterial(r: Renderer, instanced: boolean, glowGain = 6): THREE.RawShaderMaterial {
  const lu = r.lightUniforms;
  const atmo: any = r.atmosphere;
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines: instanced ? { INSTANCED: 1 } : {},
    side: THREE.DoubleSide,
    vertexShader: HULL_VERT,
    fragmentShader: HULL_FRAG,
    uniforms: {
      u_lightDir: lu.u_lightDir,
      u_lightColor: lu.u_lightColor,
      u_sh: lu.u_sh,
      u_cameraPos: lu.u_cameraPos,
      u_fogColor: { value: atmo?.fogColor ?? new THREE.Color(0.5, 0.6, 0.75) },
      u_fogDist: { value: 5200 },
      u_glowGain: { value: glowGain },
      u_time: SHARED_TIME,
    },
  });
}

/** Shared animation clock for all invasion shaders. */
export const SHARED_TIME = { value: 0 };

// ------------------------------------------------------------------------------- billboards
const BB_VERT = /* glsl */ `
in vec3 position;
in vec3 a_pos;
in vec3 a_axis;
in vec2 a_size;
in vec4 a_color;
in vec4 a_param;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 u_cameraPos;
uniform float u_pxAngle;
uniform float u_minPx;
out vec2 v_uv;
out vec4 v_color;
out vec4 v_param;
out float v_dist;
void main(){
  vec3 toCam = u_cameraPos - a_pos;
  float dist = max(length(toCam), 1e-3);
  toCam /= dist;
  vec3 right, up;
  vec2 size = a_size;
  vec4 c = a_color;
  float minW = dist * u_pxAngle * u_minPx;
  if (dot(a_axis, a_axis) > 1e-8) {
    up = normalize(a_axis);
    right = cross(up, toCam);
    float rl = length(right);
    right = rl > 1e-4 ? right / rl : vec3(1.0, 0.0, 0.0);
    if (size.x < minW) { c.rgb *= size.x / minW; size.x = minW; }
  } else {
    right = normalize(cross(abs(toCam.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0), toCam));
    up = cross(toCam, right);
    if (size.x < minW) { c.rgb *= pow(size.x / minW, 0.8); size = vec2(minW); }
  }
  // fire and smoke fade out as the camera gets inside them: a screen full of stacked
  // translucent quads is the most expensive thing the GPU can be asked to draw
  if (a_param.x > 1.5) {
    float near = clamp((dist - size.x * 0.4) / max(size.x, 1.0), 0.0, 1.0);
    c *= near;
    if (near <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  }
  vec3 p = a_pos + right * position.x * size.x + up * position.y * size.y;
  v_uv = position.xy;
  v_color = c;
  v_param = a_param;
  v_dist = dist;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const BB_FRAG = /* glsl */ `
precision highp float;
#define PI 3.14159265
uniform float u_time;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_sh[9];
uniform vec3 u_fogColor;
uniform float u_fogDist;
in vec2 v_uv;
in vec4 v_color;
in vec4 v_param;   // x: kind (0 glow, 1 streak, 2 fire, 3 smoke), y: seed, z: age 0..1
in float v_dist;
out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * noise(p); p = p * 2.1 + 3.7; a *= 0.5; } return s; }
${SH_GLSL}
void main(){
  int kind = int(v_param.x + 0.5);
  float r = length(v_uv);
  if (kind == 0) {
    // light: hot core + soft halo
    float g = exp(-r * r * 9.0) * 0.8 + exp(-r * r * 40.0);
    if (r > 1.0) discard;
    o = vec4(v_color.rgb * g * v_color.a, 0.0);
  } else if (kind == 1) {
    // streak: bright line across, fading toward the tail (uv.y = -1 tail .. 1 head)
    float across = exp(-v_uv.x * v_uv.x * 7.0);
    float along = v_param.y >= 100.0
      ? 1.0 - smoothstep(0.9, 1.0, abs(v_uv.y))   // seed >= 100: a solid beam, full length
      : smoothstep(-1.0, 0.2, v_uv.y) * (1.0 - smoothstep(0.85, 1.0, v_uv.y));
    o = vec4(v_color.rgb * across * along * v_color.a, 0.0);
  } else if (kind == 2) {
    // fireball: noisy ball, white-hot core to orange to dark edge as it ages
    float age = v_param.z;
    float n = fbm(v_uv * 2.2 + v_param.y * 17.0 + vec2(0.0, -age * 2.0));
    float edge = 1.0 - smoothstep(0.35 + 0.45 * n, 1.0, r);
    if (edge <= 0.0) discard;
    float heat = clamp((1.0 - r) * 1.6 * (1.0 - age) + n * 0.3, 0.0, 1.0);
    vec3 c = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.75, 0.3), smoothstep(0.2, 0.6, heat));
    c = mix(c, vec3(1.0, 0.95, 0.85), smoothstep(0.75, 1.0, heat));
    o = vec4(c * edge * v_color.rgb * v_color.a * (1.0 - age * 0.7), 0.0);
  } else {
    // smoke: soft noisy puff (premultiplied alpha)
    float n = fbm(v_uv * 1.8 + v_param.y * 11.0 + vec2(u_time * 0.05, 0.0));
    float a = (1.0 - smoothstep(0.25 + 0.5 * n, 1.0, r)) * v_color.a;
    if (a <= 0.003) discard;
    float fog = 1.0 - exp(-v_dist / u_fogDist);
    // lit like a volume of soot/dust: sun (thinner at the rim) plus sky light, so it reads as
    // grey smoke in daylight and stays dark at night instead of being a flat black cut-out
    vec3 L = normalize(u_lightDir);
    float sun = (0.3 + 0.45 * n + 0.25 * v_uv.y) * clamp(L.y * 3.0 + 0.4, 0.0, 1.0);
    vec3 sky = shIrradiance(vec3(0.0, 1.0, 0.0), u_sh) * 0.6 + shIrradiance(normalize(vec3(L.x, 0.0, L.z) + 1e-4), u_sh) * 0.4;
    vec3 albedo = min(vec3(0.6), v_color.rgb * 2.6) * (0.75 + 0.5 * n);
    vec3 c = mix(albedo * (u_lightColor * sun + sky) / PI, u_fogColor, fog * 0.85);
    o = vec4(c * a, a);
  }
}`;

export const BB_GLOW = 0, BB_STREAK = 1, BB_FIRE = 2, BB_SMOKE = 3;

/** Instanced billboards; fill entries each frame with `push`, then `commit()`. */
export class BillboardPool {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private pos: Float32Array;
  private axis: Float32Array;
  private size: Float32Array;
  private color: Float32Array;
  private param: Float32Array;
  private n = 0;
  readonly mat: THREE.RawShaderMaterial;

  constructor(r: Renderer, readonly capacity: number, alphaBlend: boolean, minPx = 2.2) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new Float32Array(capacity * 3);
    this.axis = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity * 2);
    this.color = new Float32Array(capacity * 4);
    this.param = new Float32Array(capacity * 4);
    g.setAttribute('a_pos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('a_axis', new THREE.InstancedBufferAttribute(this.axis, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('a_size', new THREE.InstancedBufferAttribute(this.size, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('a_color', new THREE.InstancedBufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('a_param', new THREE.InstancedBufferAttribute(this.param, 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.geo = g;
    const atmo: any = r.atmosphere;
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: BB_VERT,
      fragmentShader: BB_FRAG,
      uniforms: {
        u_cameraPos: r.lightUniforms.u_cameraPos,
        u_pxAngle: { value: 0.001 },
        u_minPx: { value: minPx },
        u_time: SHARED_TIME,
        u_lightDir: r.lightUniforms.u_lightDir,
        u_lightColor: r.lightUniforms.u_lightColor,
        u_sh: r.lightUniforms.u_sh,
        u_fogColor: { value: atmo?.fogColor ?? new THREE.Color(0.5, 0.6, 0.75) },
        u_fogDist: { value: 5200 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: alphaBlend ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = alphaBlend ? 30 : 31;
    // per-camera pixel angle (for the minimum on-screen size)
    this.mesh.onBeforeRender = (rr, _s, cam) => {
      const pc = cam as THREE.PerspectiveCamera;
      const rt = rr.getRenderTarget();
      const h = rt ? rt.height : rr.getDrawingBufferSize(_v2).y;
      this.mat.uniforms.u_pxAngle.value = (2 * Math.tan(THREE.MathUtils.degToRad(pc.fov ?? 70) / 2)) / Math.max(1, h);
    };
  }

  begin() {
    this.n = 0;
  }

  /** Add one billboard. `axis` null = camera-facing sprite (size = radius), else a streak (half-length = h). */
  push(x: number, y: number, z: number, w: number, h: number, r: number, g: number, b: number, a: number, kind: number, seed = 0, age = 0, ax = 0, ay = 0, az = 0): boolean {
    if (this.n >= this.capacity) return false;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.axis[i * 3] = ax; this.axis[i * 3 + 1] = ay; this.axis[i * 3 + 2] = az;
    this.size[i * 2] = w; this.size[i * 2 + 1] = h;
    this.color[i * 4] = r; this.color[i * 4 + 1] = g; this.color[i * 4 + 2] = b; this.color[i * 4 + 3] = a;
    this.param[i * 4] = kind; this.param[i * 4 + 1] = seed; this.param[i * 4 + 2] = age;
    return true;
  }

  commit() {
    const g = this.geo;
    g.instanceCount = this.n;
    for (const k of ['a_pos', 'a_axis', 'a_size', 'a_color', 'a_param']) {
      const a = g.attributes[k] as THREE.InstancedBufferAttribute;
      a.needsUpdate = true;
      a.addUpdateRange(0, this.n * a.itemSize);
    }
  }

  get count() {
    return this.n;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
const _v2 = new THREE.Vector2();
