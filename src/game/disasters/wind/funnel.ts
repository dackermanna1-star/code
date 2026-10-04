/**
 * Tornado visuals rendered in the forward HDR pass:
 *
 *  - the funnel: a raymarched density volume inside a proxy box. Condensation funnel (thin at
 *    the ground, widening into the cloud, lowered from the cloud during formation, roping out
 *    at the end), plus the churning debris cloud at the ground. Noise is sampled in a frame that
 *    rotates with the vortex and twists with height (helical striations), and scrolls upward.
 *  - the wall cloud: a wide, slowly rotating, lowered cloud deck above the funnel with a dark
 *    green-gray underside.
 *  - lightning bolts: jagged emissive ribbons with branches (additive, HDR so they bloom).
 *
 * Both volumes stop at the scene depth (linear depth texture) so terrain intersections are soft,
 * apply the atmosphere's aerial perspective and output premultiplied alpha.
 */
import * as THREE from 'three';
import { GLSL_COMMON } from '../../../render/shaders/common';
import type { NoiseVolume } from './noiseTex';

const VERT = /* glsl */ `
precision highp float;
in vec3 position;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
out vec3 v_world;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  v_world = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

function fragment(atmo: string, cloud: boolean): string {
  return /* glsl */ `
precision highp float;
precision highp sampler3D;
${GLSL_COMMON}
${atmo}
uniform sampler3D u_noise;
uniform sampler2D u_linDepth;
uniform vec2 u_resolution;
uniform vec3 u_cameraPos;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_sh[9];
uniform float u_frame;
uniform vec3 u_base;
uniform vec3 u_boxMin;
uniform vec3 u_boxMax;
uniform vec4 u_shape;  // H, rBase, rTop, rope
uniform vec4 u_bend;   // tiltX, tiltZ, wob, time
uniform vec4 u_misc;   // s1, s2, reach, fade
uniform vec4 u_dust;   // dust rgb, debris amount
uniform vec4 u_cond;   // condensation rgb, spin phase
uniform vec4 u_cloud;  // radius, storm, flash, -
in vec3 v_world;
out vec4 o;

#define T_ u_bend.w
#define SPIN u_cond.w

vec2 axisOff(float u) {
  u = clamp(u, 0.0, 1.0);
  float lean = pow(u, 1.3);
  float bell = 4.0 * u * (1.0 - u);
  return vec2(u_bend.x * lean + u_bend.z * bell * sin(T_ * 0.9 + u * 5.0 + u_misc.x),
              u_bend.y * lean + u_bend.z * bell * cos(T_ * 0.75 + u * 4.2 + u_misc.y));
}
float fRadius(float u) {
  u = clamp(u, 0.0, 1.0);
  return (u_shape.y + (u_shape.z - u_shape.y) * pow(u, 2.8)) * (1.0 - 0.62 * u_shape.w);
}
float nz(vec3 p) { return texture(u_noise, p).r; }
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

bool boxHit(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 inv = 1.0 / rd;
  vec3 a = (u_boxMin - ro) * inv, b = (u_boxMax - ro) * inv;
  vec3 lo = min(a, b), hi = max(a, b);
  t0 = max(max(lo.x, lo.y), lo.z);
  t1 = min(min(hi.x, hi.y), hi.z);
  return t1 > max(t0, 0.0);
}

#if ${cloud ? 1 : 0}
// ------------------------------------------------------------------ wall cloud
// p relative to the cloud base centre. Returns density, writes the height fraction in the deck.
float density(vec3 p, out float hf) {
  float Rw = u_cloud.x;
  float r = length(p.xz);
  hf = 0.0;
  if (r > Rw) return 0.0;
  float rn = r / Rw;
  vec2 q = rot2(SPIN * 0.1) * p.xz;
  float n = nz(vec3(q * 0.011, p.y * 0.02) + vec3(0.0, 0.0, T_ * 0.004)) * 0.62 + nz(vec3(q * 0.037, p.y * 0.06 - T_ * 0.02) + 0.5) * 0.38;
  // lowered, rotating wall cloud around the funnel, flat shelf further out
  float wall = 1.0 - smoothstep(0.08, 0.38, rn);
  float bottom = -2.0 - wall * 9.0 + rn * rn * 8.0 + (n - 0.5) * 7.0;
  float top = 18.0 - rn * 7.0 + n * 6.0;
  float d = smoothstep(bottom, bottom + 3.5, p.y) * smoothstep(top, top - 5.0, p.y);
  d *= smoothstep(1.0, 0.72 - 0.25 * n, rn);
  hf = clamp((p.y - bottom) / max(1.0, top - bottom), 0.0, 1.0);
  return d * (0.25 + 1.1 * n) * u_cloud.y * 0.22;
}
#define STEPS 36
#else
// ------------------------------------------------------------------ funnel + debris cloud
// p relative to the funnel base. x = condensation density, y = debris density, z = r/R, w = side light
vec4 density(vec3 p) {
  float H = u_shape.x;
  float u = p.y / H;
  if (u < -0.03 || u > 1.06) return vec4(0.0);
  vec2 q = p.xz - axisOff(u);
  float r = length(q);
  float R = fRadius(u);
  float Rd = u_shape.y * 2.4 + max(p.y, 0.0) * 0.6 + 2.0;
  float lim = p.y < 18.0 ? max(R * 1.45, Rd * 1.3) : R * 1.45;
  if (r > lim) return vec4(0.0);
  // rotating, twisting frame (faster spin near the core)
  float ang = SPIN * (1.0 + 0.6 / (1.0 + r * 0.3)) + u * 3.0;
  vec2 rq = rot2(ang) * q;
  float n1 = nz(vec3(rq.x * 0.045, p.y * 0.012 - T_ * 0.06, rq.y * 0.045));
  float n2 = nz(vec3(rq.x * 0.13, p.y * 0.045 - T_ * 0.32, rq.y * 0.13) + 0.37);
  float n = n1 * 0.6 + n2 * 0.4;
  // condensation funnel lowering from the cloud with a ragged lower end
  float bottom = H * (1.0 - u_misc.z) + (n - 0.5) * 10.0;
  float vis = smoothstep(bottom - 2.0, bottom + 5.0, p.y);
  float edge = R * (0.74 + 0.5 * n);
  float cond = smoothstep(edge, edge * 0.7, r) * vis * (0.75 + 0.5 * n2);
  // tattered outer sheath: wisps in the shear zone
  cond += smoothstep(R * 1.45, R * 0.95, r) * smoothstep(0.55, 0.85, n2) * vis * 0.3;
  // debris cloud: dense churning skirt hugging the ground, hollower centre
  float deb = 0.0;
  if (p.y < 22.0) {
    float hd = max(p.y, 0.0);
    float dn = nz(vec3(rq.x * 0.075, p.y * 0.06 - T_ * 0.55, rq.y * 0.075) + 0.71);
    float Rdd = Rd * (0.6 + 0.7 * dn);
    deb = exp(-hd / 6.0) * smoothstep(Rdd, Rdd * 0.25, r) * (0.3 + dn * 1.4);
    deb *= mix(0.5, 1.0, smoothstep(0.0, R * 1.3, r));
    deb *= u_dust.w;
  }
  vec2 L = normalize(u_lightDir.xz + vec2(1e-4));
  float side = dot(q / max(r, 1e-3), L);
  return vec4(cond * 2.2, deb * 1.1, r / max(R, 0.5), side);
}
#define STEPS 48
#endif

void main() {
  vec3 ro = u_cameraPos;
  vec3 rd = normalize(v_world - u_cameraPos);
  float t0, t1;
  if (!boxHit(ro, rd, t0, t1)) discard;
  t0 = max(t0, 0.0);
  float scene = texture(u_linDepth, gl_FragCoord.xy / u_resolution).r;
  t1 = min(t1, scene);
  if (t1 <= t0) discard;
  float dt = (t1 - t0) / float(STEPS);
  float j = ignT(gl_FragCoord.xy, u_frame);
  vec3 col = vec3(0.0);
  float T = 1.0, tw = 0.0, ww = 0.0;
  vec3 skyUp = shIrradiance(vec3(0.0, 1.0, 0.0), u_sh) / PI;
  vec3 skyDown = shIrradiance(vec3(0.0, -1.0, 0.0), u_sh) / PI;
  vec3 sun = u_lightColor / PI;
  float cosL = dot(rd, u_lightDir);
  float ph = 0.6 + 1.6 * pow(max(cosL, 0.0), 6.0);
  for (int i = 0; i < STEPS; i++) {
    float t = t0 + (float(i) + j) * dt;
    vec3 p = ro + rd * t - u_base;
#if ${cloud ? 1 : 0}
    float hf;
    float sig = density(p, hf);
    if (sig < 1e-3) continue;
    vec3 alb = vec3(0.30, 0.345, 0.31);
    vec3 S = alb * (mix(skyDown * 1.4, skyUp, hf * hf) * mix(0.35, 1.0, hf) + sun * hf * hf * hf * 0.5 * ph);
    S += vec3(0.75, 0.8, 1.0) * u_cloud.z * (1.0 - hf * 0.5);
#else
    vec4 d = density(p);
    float sig = d.x + d.y;
    if (sig < 1e-3) continue;
    float dustF = clamp(d.y / sig + exp(-max(p.y, 0.0) / 14.0) * 0.45, 0.0, 1.0);
    vec3 alb = mix(u_cond.rgb, u_dust.rgb, dustF);
    float occl = mix(0.3, 1.0, smoothstep(0.1, 1.1, d.z));
    float lit = smoothstep(-0.5, 0.9, d.w) * smoothstep(0.2, 0.9, d.z);
    vec3 S = alb * ((skyUp * 0.7 + skyDown * 0.35) * occl + sun * lit * 0.25 * ph);
    S += vec3(0.75, 0.8, 1.0) * u_cloud.z * occl * 0.6;
#endif
    float a = 1.0 - exp(-sig * dt);
    col += T * a * S;
    tw += T * a * t;
    ww += T * a;
    T *= 1.0 - a;
    if (T < 0.015) break;
  }
  float A = (1.0 - T) * u_misc.w;
  if (A < 0.002) discard;
  col *= u_misc.w;
  float fd = ww > 1e-4 ? tw / ww : t0;
  vec3 f0 = atmo_applyFog(vec3(0.0), rd, fd);
  vec3 f1 = atmo_applyFog(vec3(1.0), rd, fd);
  col = col * clamp(f1 - f0, 0.0, 1.0) + f0 * A;
  o = vec4(col, A);
}
`;
}

export interface VolumeUniforms {
  u_base: THREE.IUniform<THREE.Vector3>;
  u_boxMin: THREE.IUniform<THREE.Vector3>;
  u_boxMax: THREE.IUniform<THREE.Vector3>;
  u_shape: THREE.IUniform<THREE.Vector4>;
  u_bend: THREE.IUniform<THREE.Vector4>;
  u_misc: THREE.IUniform<THREE.Vector4>;
  u_dust: THREE.IUniform<THREE.Vector4>;
  u_cond: THREE.IUniform<THREE.Vector4>;
  u_cloud: THREE.IUniform<THREE.Vector4>;
}

/** What the volumes need from the renderer (satisfied by `Renderer`). */
export interface VolumeRendererLike {
  readonly lightUniforms: Record<string, THREE.IUniform>;
  readonly terrainUniforms: Record<string, THREE.IUniform>;
  readonly atmosphere: { glsl: string; uniforms: Record<string, THREE.IUniform> };
}

/** One raymarched volume (funnel or wall cloud) drawn through a proxy box. */
export class StormVolume {
  readonly mesh: THREE.Mesh;
  readonly u: VolumeUniforms;
  private mat: THREE.RawShaderMaterial;
  constructor(r: VolumeRendererLike, noise: NoiseVolume, cloud: boolean, shared?: VolumeUniforms) {
    const lu = r.lightUniforms;
    const v3 = () => ({ value: new THREE.Vector3() });
    const v4 = () => ({ value: new THREE.Vector4() });
    this.u = {
      u_base: v3(), u_boxMin: v3(), u_boxMax: v3(),
      u_shape: shared?.u_shape ?? v4(), u_bend: shared?.u_bend ?? v4(), u_misc: v4(),
      u_dust: shared?.u_dust ?? v4(), u_cond: shared?.u_cond ?? v4(), u_cloud: shared?.u_cloud ?? v4(),
    };
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: fragment(r.atmosphere.glsl, cloud),
      uniforms: {
        ...r.atmosphere.uniforms,
        ...this.u,
        u_noise: { value: noise.texture },
        u_linDepth: lu.u_linDepth,
        u_resolution: r.terrainUniforms.u_resolution,
        u_cameraPos: lu.u_cameraPos,
        u_lightDir: lu.u_lightDir,
        u_lightColor: lu.u_lightColor,
        u_sh: lu.u_sh,
        u_frame: lu.u_frame,
      },
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.mat);
    this.mesh.frustumCulled = false;
    // wall cloud first (behind), funnel over it; both before the particle billboards
    this.mesh.renderOrder = cloud ? 4 : 5;
  }

  /** Place the proxy box (world space). */
  setBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    this.u.u_boxMin.value.set(x0, y0, z0);
    this.u.u_boxMax.value.set(x1, y1, z1);
    this.mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.mesh.scale.set(x1 - x0 + 0.5, y1 - y0 + 0.5, z1 - z0 + 0.5);
    this.mesh.updateMatrixWorld();
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

// ------------------------------------------------------------------------------- lightning
const BOLT_VERT = /* glsl */ `
precision highp float;
in vec3 position;
in vec4 a_side; // x: side (-1/1), y: width, z: brightness, w: -
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
in vec3 a_dir;
out float v_s;
out float v_b;
void main() {
  vec3 w = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 toCam = normalize(cameraPosition - w);
  vec3 side = normalize(cross(a_dir, toCam) + vec3(1e-5));
  w += side * a_side.x * a_side.y;
  v_s = a_side.x;
  v_b = a_side.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
`;
const BOLT_FRAG = /* glsl */ `
precision highp float;
uniform float u_int;
in float v_s;
in float v_b;
out vec4 o;
void main() {
  float core = exp(-v_s * v_s * 6.0);
  vec3 c = mix(vec3(0.55, 0.6, 1.0), vec3(1.0), core) * core * v_b * u_int;
  o = vec4(c, 0.0);
}
`;

/** A cloud-to-ground lightning bolt: jagged main channel + branches as camera-facing ribbons. */
export class Bolt {
  readonly mesh: THREE.Mesh;
  private mat: THREE.RawShaderMaterial;
  age = 0;
  readonly life = 0.45;
  constructor(x: number, yTop: number, z: number, yGround: number, rnd: () => number) {
    const pos: number[] = [], dir: number[] = [], side: number[] = [], idx: number[] = [];
    const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, br: number) => {
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const l = Math.hypot(dx, dy, dz) || 1;
      const b = pos.length / 3;
      for (const [px, py, pz, s] of [[ax, ay, az, -1], [ax, ay, az, 1], [bx, by, bz, -1], [bx, by, bz, 1]] as const) {
        pos.push(px, py, pz);
        dir.push(dx / l, dy / l, dz / l);
        side.push(s, w, br, 0);
      }
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    };
    const channel = (sx: number, sy: number, sz: number, ey: number, w: number, br: number, depth: number) => {
      let px = sx, py = sy, pz = sz;
      while (py > ey) {
        const step = 1.5 + rnd() * 3;
        const nx = px + (rnd() - 0.5) * step * 1.3, ny = Math.max(ey, py - step), nz = pz + (rnd() - 0.5) * step * 1.3;
        seg(px, py, pz, nx, ny, nz, w, br);
        if (depth < 2 && rnd() < 0.09) channel(nx, ny, nz, Math.max(ey, ny - 8 - rnd() * 18), w * 0.55, br * 0.5, depth + 1);
        px = nx; py = ny; pz = nz;
      }
    };
    channel(x, yTop, z, yGround, 0.35, 1, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('a_dir', new THREE.Float32BufferAttribute(dir, 3));
    g.setAttribute('a_side', new THREE.Float32BufferAttribute(side, 4));
    g.setIndex(idx);
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BOLT_VERT, fragmentShader: BOLT_FRAG,
      uniforms: { u_int: { value: 60 }, cameraPosition: { value: new THREE.Vector3() } },
      depthTest: true, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
  }

  /** Returns false once finished. Flickers (re-strokes) during its life. */
  update(dt: number, cam: THREE.Vector3): boolean {
    this.age += dt;
    const k = this.age / this.life;
    const flicker = k < 0.15 ? 1 : k < 0.3 ? 0.25 : k < 0.45 ? 0.9 : Math.max(0, 1 - (k - 0.45) / 0.55) * 0.6;
    this.mat.uniforms.u_int.value = 60 * flicker;
    (this.mat.uniforms.cameraPosition.value as THREE.Vector3).copy(cam);
    return this.age < this.life;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
