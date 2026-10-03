/**
 * Blood decals: a fixed pool of lit, projected quads (one instanced draw in the forward pass,
 * depth tested against the opaque scene) lying on block surfaces. Splats appear at once, pools
 * grow over several seconds, everything fades out after ~60 s. The pool is a ring buffer
 * (`capacity`, default 200): the oldest decal is recycled first.
 *
 * Shape, growth, drying and fading are computed in the shader from the per-instance birth time,
 * so nothing is re-uploaded except the instance that was just added.
 */
import * as THREE from 'three';
import { GLSL_COMMON } from '../../render/shaders/common';
import { GLSL_PARTICLE_SHADOW } from '../../render/particles/shaders';

export const DECAL_LIFE = 60;
export const DECAL_FADE = 14;

export const enum DecalKind {
  Splat = 0,
  Streak = 1,
  Pool = 2,
}

export interface DecalInit {
  x: number; y: number; z: number;
  /** Surface normal (unit). */
  nx: number; ny: number; nz: number;
  /** Full width in blocks. */
  size: number;
  color: [number, number, number];
  kind?: DecalKind;
  /** Rotation about the normal (rad); for streaks it is the streak direction. */
  rot?: number;
  /** Seconds to reach full size (pools). */
  grow?: number;
  /** Packed world light (sky<<12 | r<<8 | g<<4 | b). */
  light?: number;
}

const VERT = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_COMMON}
${GLSL_PARTICLE_SHADOW}
in vec3 position;
in vec4 a_pos;   // xyz centre, w size
in vec4 a_nrm;   // xyz normal, w rotation
in vec4 a_col;   // rgb colour, a kind
in vec4 a_time;  // birth, grow seconds, aspect, light (packed)
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 u_cameraPos;
uniform vec3 u_lightColor;
uniform float u_skyLightScale;
uniform vec3 u_dimAmbient;
uniform float u_minAmbient;
uniform float u_time;
uniform float u_life;
uniform float u_fadeLen;
out vec2 v_uv;
out vec4 v_col;
out vec3 v_sun;
out float v_sky;
out vec3 v_blk;
out vec3 v_N;
out float v_age;
out float v_grow;
out float v_seed;
flat out float v_kind;
void main() {
  float age = u_time - a_time.x;
  float alive = step(0.0, age) * step(age, u_life);
  vec3 N = normalize(a_nrm.xyz);
  vec3 T0 = abs(N.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 T = normalize(cross(N, T0));
  vec3 B = cross(N, T);
  float cr = cos(a_nrm.w), sr = sin(a_nrm.w);
  vec3 R = T * cr + B * sr;
  vec3 U = -T * sr + B * cr;
  float grow = a_time.y > 0.0 ? clamp(age / a_time.y, 0.0, 1.0) : 1.0;
  grow = 1.0 - pow(1.0 - grow, 3.0);
  float kind = a_col.a;
  float h = a_pos.w * 0.5 * (kind > 1.5 ? mix(0.25, 1.0, grow) : mix(0.8, 1.0, min(1.0, age * 6.0)));
  vec2 c = position.xy;
  vec3 wp = a_pos.xyz + N * 0.011 + (R * c.x * (kind > 0.5 && kind < 1.5 ? h * a_time.z : h) + U * c.y * h) * alive;
  vec3 rel = wp - u_cameraPos;
  vec4 vp = vec4(mat3(viewMatrix) * rel, 1.0);
  gl_Position = projectionMatrix * vp;
  v_uv = c;
  v_col = vec4(a_col.rgb, 1.0);
  v_N = N;
  v_age = age;
  v_grow = grow;
  v_kind = kind;
  v_seed = fract(sin(dot(a_pos.xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  int L = int(a_time.w + 0.5);
  float sky = float((L >> 12) & 15) / 15.0;
  vec3 blk = vec3(float((L >> 8) & 15), float((L >> 4) & 15), float(L & 15)) / 15.0;
  v_sky = sky * sky * u_skyLightScale * u_skyLightScale;
  float sh = 0.0;
  if (dot(u_lightColor, u_lightColor) > 1e-8) {
    sh = particleShadow(wp - u_cameraPos) * smoothstep(0.05, 0.4, sky);
  }
  v_sun = u_lightColor * sh;
  v_blk = blockLightRadiance(blk) + u_dimAmbient + vec3(u_minAmbient);
}
`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_COMMON}
uniform vec3 u_lightDir;
uniform vec3 u_sh[9];
uniform float u_life;
uniform float u_fadeLen;
in vec2 v_uv;
in vec4 v_col;
in vec3 v_sun;
in float v_sky;
in vec3 v_blk;
in vec3 v_N;
in float v_age;
in float v_grow;
in float v_seed;
flat in float v_kind;
out vec4 o;
void main() {
  vec2 p = v_uv;
  float n = vnoise(p * 3.0 + v_seed * 31.0) * 0.6 + vnoise(p * 7.0 + v_seed * 17.0) * 0.4;
  float r = length(p);
  float a;
  if (v_kind < 0.5) {
    // splat: irregular blob plus satellite droplets
    float edge = 0.5 + (n - 0.5) * 0.55;
    a = smoothstep(edge, edge - 0.12, r);
    vec2 q = p * 2.0;
    float sat = 0.0;
    for (int i = 0; i < 4; i++) {
      float ang = hash12(vec2(float(i), v_seed)) * 6.2831;
      float dist = 0.55 + hash12(vec2(float(i) + 7.0, v_seed)) * 0.4;
      float rad = 0.04 + hash12(vec2(float(i) + 3.0, v_seed)) * 0.07;
      sat = max(sat, smoothstep(rad, rad * 0.5, length(p - vec2(cos(ang), sin(ang)) * dist)));
    }
    a = max(a, sat);
  } else if (v_kind < 1.5) {
    // streak along +x: tapering spray / drip trail
    float ax = (p.x * 0.5 + 0.5);
    float w = mix(0.55, 0.12, ax) * (0.7 + 0.5 * n);
    a = smoothstep(w, w * 0.4, abs(p.y)) * smoothstep(1.0, 0.7, abs(p.x));
  } else {
    // pool: smooth lobed puddle
    float edge = 0.78 + (n - 0.5) * 0.4 + 0.08 * sin(atan(p.y, p.x) * 3.0 + v_seed * 20.0);
    a = smoothstep(edge, edge - 0.08, r);
  }
  if (a < 0.01) discard;
  // drying: bright wet red -> dark brown; fading at the end of life
  float dry = smoothstep(2.0, 40.0, v_age);
  vec3 wet = v_col.rgb;
  vec3 dried = wet * vec3(0.55, 0.5, 0.45) + vec3(0.012, 0.004, 0.0);
  vec3 albedo = mix(wet, dried, dry);
  float fade = 1.0 - smoothstep(u_life - u_fadeLen, u_life, v_age);
  float alpha = a * fade * mix(0.92, 0.8, dry);
  vec3 N = normalize(v_N);
  float NoL = max(dot(N, u_lightDir), 0.0);
  vec3 lit = v_sun * NoL / PI + shIrradiance(N, u_sh) * v_sky / PI + v_blk;
  // wet gloss highlight
  float gloss = (1.0 - dry) * pow(clamp(n, 0.0, 1.0), 4.0) * 0.5;
  vec3 col = albedo * lit + (v_sun * 0.08 + shIrradiance(N, u_sh) * v_sky * 0.04) * gloss;
  o = vec4(col * alpha, alpha);
}
`;

const _rot = new THREE.Quaternion();

export class BloodDecals {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  count = 0;
  private cursor = 0;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aNrm: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;
  private readonly aTime: THREE.InstancedBufferAttribute;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly births: Float32Array;
  /** Decal clock (seconds, paused with the game). */
  time = 0;

  constructor(shared: Record<string, THREE.IUniform>, capacity = 200) {
    this.capacity = capacity;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aPos = mk(); this.aNrm = mk(); this.aCol = mk(); this.aTime = mk();
    // unused slots: birth far in the future => alive = 0 (collapsed quad)
    for (let i = 0; i < capacity; i++) this.aTime.setXYZW(i, 1e9, 0, 1, 0);
    this.births = new Float32Array(capacity).fill(-1e9);
    g.setAttribute('a_pos', this.aPos);
    g.setAttribute('a_nrm', this.aNrm);
    g.setAttribute('a_col', this.aCol);
    g.setAttribute('a_time', this.aTime);
    g.instanceCount = capacity;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.uniforms = {
      ...shared,
      u_time: { value: 0 },
      u_life: { value: DECAL_LIFE },
      u_fadeLen: { value: DECAL_FADE },
    };
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    void _rot;
  }

  /** Add a decal, recycling the oldest one when full. Returns its slot. */
  add(d: DecalInit): number {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
    const kind = d.kind ?? DecalKind.Splat;
    this.aPos.setXYZW(i, d.x, d.y, d.z, d.size);
    this.aNrm.setXYZW(i, d.nx, d.ny, d.nz, d.rot ?? Math.random() * Math.PI * 2);
    this.aCol.setXYZW(i, d.color[0], d.color[1], d.color[2], kind);
    this.aTime.setXYZW(i, this.time, d.grow ?? 0, kind === DecalKind.Streak ? 2.2 : 1, d.light ?? 15 << 12);
    this.births[i] = this.time;
    this.aPos.needsUpdate = this.aNrm.needsUpdate = this.aCol.needsUpdate = this.aTime.needsUpdate = true;
    return i;
  }

  /** Number of decals younger than `DECAL_LIFE`. */
  get live(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if (this.time - this.births[i] < DECAL_LIFE) n++;
    return n;
  }

  update(dt: number) {
    this.time += dt;
    this.uniforms.u_time.value = this.time;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) this.aTime.setXYZW(i, 1e9, 0, 1, 0);
    this.births.fill(-1e9);
    this.count = 0;
    this.aTime.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
