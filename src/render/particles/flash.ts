/**
 * Transient light injection ("flash") pass: a full-screen additive pass drawn in the forward
 * stage that re-lights the opaque G-buffer with up to MAX_FLASH point lights (explosions,
 * fireworks) and one sky flash (lightning: sky-light weighted ambient + directional light from
 * the bolt, plus a brightening of sky/cloud pixels). No renderer changes needed: it reads the
 * current frame's G-buffer through the renderer's shared lighting uniforms (g0/g1/g3).
 */
import * as THREE from 'three';
import { GLSL_COMMON } from '../shaders/common';

export const MAX_FLASH = 4;

const VERT = /* glsl */ `
precision highp float;
in vec3 position;
out vec2 v_uv;
void main() { v_uv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
precision highp float;
${GLSL_COMMON}
uniform sampler2D g0;
uniform sampler2D g1;
uniform sampler2D g3;
uniform sampler2D u_linDepth;
uniform mat4 u_flashProjInv;
uniform mat3 u_viewInvRot;
uniform vec4 u_flashPos[${MAX_FLASH}];
uniform vec4 u_flashCol[${MAX_FLASH}];
uniform int u_flashCount;
uniform vec4 u_skyFlash;     // rgb irradiance, w = sky brightening
uniform vec3 u_skyFlashDir;  // direction toward the bolt
in vec2 v_uv;
out vec4 o;
void main() {
  float dist = texture(u_linDepth, v_uv).r;
  vec4 vp = u_flashProjInv * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize(u_viewInvRot * (vp.xyz / vp.w));
  if (dist > 1e5) {
    // sky / clouds lit from inside by the discharge
    float k = 0.12 + 0.88 * pow(max(dot(dir, u_skyFlashDir), 0.0), 5.0);
    o = vec4(u_skyFlash.rgb * u_skyFlash.w * k * smoothstep(-0.1, 0.15, dir.y), 0.0);
    return;
  }
  vec3 P = dir * dist; // camera relative
  vec3 albedo = texture(g0, v_uv).rgb;
  albedo *= albedo;
  vec3 N = normalize(texture(g1, v_uv).xyz);
  float sky = texture(g3, v_uv).r;
  vec3 E = vec3(0.0);
  for (int i = 0; i < ${MAX_FLASH}; i++) {
    if (i >= u_flashCount) break;
    vec3 Lv = u_flashPos[i].xyz - P;
    float d2 = dot(Lv, Lv);
    float R = u_flashPos[i].w;
    float win = clamp(1.0 - d2 * d2 / (R * R * R * R), 0.0, 1.0);
    vec3 L = Lv * inversesqrt(max(d2, 1e-4));
    E += u_flashCol[i].rgb * (max(dot(N, L), 0.0) * 0.8 + 0.2) * win * win / (d2 + 1.0);
  }
  float sv = sky * sky;
  E += u_skyFlash.rgb * sv * (0.35 + 0.65 * max(dot(N, u_skyFlashDir), 0.0)) * (0.6 + 0.4 * max(N.y, 0.0));
  o = vec4(albedo * E / PI, 0.0);
}
`;

interface Flash {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
  intensity: number;
  radius: number;
  age: number;
  duration: number;
}

export class FlashPass {
  readonly mesh: THREE.Mesh;
  private flashes: Flash[] = [];
  private uniforms: Record<string, THREE.IUniform>;
  /** Lightning sky flash (set every frame by the weather system). */
  readonly skyFlash = new THREE.Vector4(0, 0, 0, 0);
  readonly skyFlashDir = new THREE.Vector3(0, 1, 0);

  constructor(lightUniforms: Record<string, THREE.IUniform>, linDepth: THREE.IUniform) {
    this.uniforms = {
      g0: lightUniforms.g0, g1: lightUniforms.g1, g3: lightUniforms.g3,
      u_viewInvRot: lightUniforms.u_viewInvRot,
      u_linDepth: linDepth,
      u_flashProjInv: { value: new THREE.Matrix4() },
      u_flashPos: { value: Array.from({ length: MAX_FLASH }, () => new THREE.Vector4()) },
      u_flashCol: { value: Array.from({ length: MAX_FLASH }, () => new THREE.Vector4()) },
      u_flashCount: { value: 0 },
      u_skyFlash: { value: this.skyFlash },
      u_skyFlashDir: { value: this.skyFlashDir },
    };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    this.mesh.visible = false;
  }

  /** Adds a decaying point light (radiant intensity in HDR units, ~ irradiance x d²). */
  add(x: number, y: number, z: number, r: number, g: number, b: number, intensity: number, duration: number, radius: number) {
    if (this.flashes.length >= 16) this.flashes.shift();
    this.flashes.push({ x, y, z, r, g, b, intensity, radius, age: 0, duration });
  }

  get active() {
    return this.flashes.length;
  }

  update(dt: number, camera: THREE.Camera & { projectionMatrixInverse: THREE.Matrix4 }) {
    const list = this.flashes;
    for (let i = list.length - 1; i >= 0; i--) if ((list[i].age += dt) >= list[i].duration) list.splice(i, 1);
    // strongest first
    list.sort((a, b) => b.intensity * (1 - a.age / a.duration) - a.intensity * (1 - b.age / b.duration));
    const P = this.uniforms.u_flashPos.value as THREE.Vector4[];
    const C = this.uniforms.u_flashCol.value as THREE.Vector4[];
    const n = Math.min(MAX_FLASH, list.length);
    const cp = camera.position;
    for (let i = 0; i < n; i++) {
      const f = list[i];
      const k = Math.pow(1 - f.age / f.duration, 2) * f.intensity;
      P[i].set(f.x - cp.x, f.y - cp.y, f.z - cp.z, f.radius);
      C[i].set(f.r * k, f.g * k, f.b * k, 0);
    }
    this.uniforms.u_flashCount.value = n;
    (this.uniforms.u_flashProjInv.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    const sky = this.skyFlash.x + this.skyFlash.y + this.skyFlash.z > 1e-4;
    this.mesh.visible = n > 0 || sky;
  }

  clear() {
    this.flashes.length = 0;
    this.skyFlash.set(0, 0, 0, 0);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
