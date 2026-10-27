/**
 * Black holes: gravitational lensing and accretion disks.
 *
 * Near the hole each pixel's light ray is traced backwards along a
 * Schwarzschild null geodesic (in units of the Schwarzschild radius rs,
 * d²x/dλ² = −(3/2)·h²·x / r⁵), which produces the shadow, the photon ring
 * and the Einstein ring. The disk is geometrically thin, with a
 * Novikov–Thorne temperature profile, relativistic Doppler beaming and
 * gravitational redshift. Escaping rays sample the already-rendered scene
 * at the deflected direction (screen-space lensing); further out the
 * weak-field deflection α = 2·rs/b is applied analytically.
 */
import * as THREE from 'three';
import type { Body } from '../astro/body';
import { blackbodyRGB } from '../astro/stellar';
import { visualRadiance } from '../astro/photometry';
import { FS_VERT } from './fullscreen';
import { PRE_EXPOSURE_TEX, PRE_EXPOSURE_GLSL } from './exposure';
import type { FrameContext } from './planetrenderer';
import { NOISE_GLSL } from './shaders/noise.glsl';

export interface AccretionDisk {
  inner: number;      // rs
  outer: number;      // rs
  tempInner: number;  // K
  brightness: number; // scales emission (radiatively inefficient flows ≪ 1)
  tilt?: THREE.Quaternion;
}

/** Temperature → visual RGB radiance lookup (log T from 10³ to 10⁸ K). */
let lut: THREE.DataTexture | null = null;
function blackbodyLUT(): THREE.DataTexture {
  if (lut) return lut;
  const N = 256;
  const data = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const T = 1e3 * Math.pow(1e5, i / (N - 1));
    const c = blackbodyRGB(Math.min(T, 40000));
    const L = visualRadiance(T);
    data[i * 4] = c[0] * L;
    data[i * 4 + 1] = c[1] * L;
    data[i * 4 + 2] = c[2] * L;
    data[i * 4 + 3] = 1;
  }
  lut = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat, THREE.FloatType);
  lut.minFilter = lut.magFilter = THREE.LinearFilter;
  lut.needsUpdate = true;
  return lut;
}

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tBB;
uniform mat4 uInvProj;
uniform mat4 uProj;
uniform mat3 uViewToWorld;
uniform mat3 uWorldToView;
uniform vec3 uCam;        // camera position relative to the hole, in rs
uniform float uRs;
uniform float uFar;
uniform vec3 uN;          // disk normal (world)
uniform float uDiskIn, uDiskOut, uDiskT, uDiskB;
uniform float uTime;
uniform float uMarchR;    // rs: full geodesic integration inside this radius
${PRE_EXPOSURE_GLSL}
${NOISE_GLSL}
varying vec2 vUv;

vec3 bb(float T) {
  float x = clamp(log(max(T, 1000.0) / 1000.0) / log(1e5), 0.0, 1.0);
  return texture(tBB, vec2(x * (255.0 / 256.0) + 0.5 / 256.0, 0.5)).rgb;
}

// background along a world direction: sample the rendered scene where that direction lands
vec3 background(vec3 dirW, out float ok) {
  vec3 dv = uWorldToView * dirW;
  ok = 0.0;
  if (dv.z > -1e-4) return vec3(0.0);
  vec4 c = uProj * vec4(dv, 1.0);
  vec2 uv = c.xy / c.w * 0.5 + 0.5;
  vec2 e = min(uv, 1.0 - uv);
  ok = clamp(min(e.x, e.y) * 40.0 + 1.0, 0.0, 1.0);
  return texture(tColor, clamp(uv, 0.001, 0.999)).rgb;
}

vec3 diskEmission(vec3 pc, vec3 rayDir, out float opacity) {
  float r = length(pc);
  opacity = 0.0;
  if (r < uDiskIn || r > uDiskOut) return vec3(0.0);
  // Novikov–Thorne-like profile, zero torque at the inner edge
  float T = uDiskT * pow(r / uDiskIn, -0.75) * pow(max(1.0 - sqrt(uDiskIn / r), 1e-4), 0.25) * 1.9;
  // orbital velocity (Schwarzschild circular orbit, c = 1, rs = 1)
  float beta = clamp(sqrt(0.5 / max(r - 1.0, 0.05)), 0.0, 0.99);
  vec3 phi = normalize(cross(uN, pc));
  float gamma = inversesqrt(1.0 - beta * beta);
  // photon travels toward the camera: −rayDir
  float cosT = dot(phi, -rayDir);
  float D = 1.0 / (gamma * (1.0 - beta * cosT));
  float g = D * sqrt(max(1.0 - 1.0 / r, 1e-4));
  // turbulent structure sheared by differential rotation (angles in the disk plane)
  vec3 e1 = normalize(cross(uN, abs(uN.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 e2 = cross(uN, e1);
  float omega = beta / r;
  float a = atan(dot(pc, e2), dot(pc, e1)) - uTime * omega * 0.05;
  // streaks along orbits: slow variation in angle, fast in radius
  vec3 q = vec3(cos(a) * 3.0, sin(a) * 3.0, r * 1.6);
  float n = gnoise(q) * 0.5 + gnoise(q * vec3(2.0, 2.0, 2.7) + 4.1) * 0.25 + 0.5;
  float edge = smoothstep(uDiskIn, uDiskIn * 1.15, r) * smoothstep(uDiskOut, uDiskOut * 0.7, r);
  opacity = clamp(edge * (0.55 + 0.6 * n), 0.0, 0.97);
  // I_ν/ν³ is invariant, so a blackbody at T is observed as a blackbody at g·T
  return bb(T * g) * uDiskB * (0.6 + 0.8 * n);
}

void main() {
  vec3 scene = texture(tColor, vUv).rgb;
  vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 vdir = normalize(vp.xyz / vp.w);
  vec3 rd = normalize(uViewToWorld * vdir);
  vec3 ro = uCam;
  float r0 = length(ro);
  // foreground objects (closer than the lensing region) are not lensed
  float depth = texture(tDepth, vUv).r;
  if (depth < 0.99999) {
    float w = exp2(depth * log2(uFar + 1.0)) - 1.0;
    float tScene = w / max(-vdir.z, 1e-6) / uRs;
    if (tScene < r0 - uMarchR) { gl_FragColor = vec4(scene, 1.0); return; }
  }
  float tc = -dot(ro, rd);           // closest approach along the straight ray
  vec3 pc = ro + rd * max(tc, 0.0);
  float b = length(cross(ro, rd));   // impact parameter (rs)
  if (b > uMarchR || (tc < 0.0 && r0 > uMarchR)) {
    // weak field: rotate toward the hole by α = 2/b (only if the ray passes it)
    if (tc <= 0.0) { gl_FragColor = vec4(scene, 1.0); return; }
    float alpha = 2.0 / b;
    if (alpha < 2e-5) { gl_FragColor = vec4(scene, 1.0); return; }
    vec3 toward = normalize(-pc);
    vec3 dir = normalize(rd + toward * tan(alpha));
    float ok;
    vec3 bg = background(dir, ok);
    gl_FragColor = vec4(mix(scene, bg, ok), 1.0);
    return;
  }
  // strong field: integrate the geodesic from the march sphere
  vec3 p = ro, v = rd;
  if (r0 > uMarchR) {
    float t = tc - sqrt(max(uMarchR * uMarchR - b * b, 0.0));
    p = ro + rd * t;
  }
  vec3 hv = cross(p, v);
  float h2 = dot(hv, hv);
  vec3 L = vec3(0.0);
  float Tr = 1.0;
  bool captured = false;
  for (int i = 0; i < 220; i++) {
    float r = length(p);
    if (r < 1.0) { captured = true; break; }
    if (r > uMarchR * 1.02 && dot(p, v) > 0.0) break;
    float dt = clamp(0.06 * r * r / (r + 2.0), 0.01, 1.5);
    vec3 pPrev = p;
    vec3 acc = -1.5 * h2 * p / pow(r, 5.0);
    v += acc * dt;
    p += v * dt;
    if (uDiskB > 0.0) {
      float y0 = dot(pPrev, uN), y1 = dot(p, uN);
      if (y0 * y1 < 0.0) {
        vec3 hit = mix(pPrev, p, y0 / (y0 - y1));
        float op;
        vec3 e = diskEmission(hit, normalize(v), op);
        L += Tr * e * op;
        Tr *= 1.0 - op;
        if (Tr < 0.01) break;
      }
    }
  }
  vec3 bg = vec3(0.0);
  if (!captured) {
    float ok;
    bg = background(normalize(v), ok) * ok;
  }
  gl_FragColor = vec4(min(L * uPreExposure + Tr * bg, vec3(6e4)), 1.0);
}
`;

export class BlackHoleRenderer {
  readonly material: THREE.ShaderMaterial;
  visible = false;
  private q = new THREE.Quaternion();

  constructor(readonly body: Body, readonly disk: AccretionDisk | null) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: FRAG,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, tBB: { value: blackbodyLUT() },
        uInvProj: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() },
        uViewToWorld: { value: new THREE.Matrix3() }, uWorldToView: { value: new THREE.Matrix3() },
        uCam: { value: new THREE.Vector3() }, uRs: { value: body.radius }, uFar: { value: 1e27 },
        uN: { value: new THREE.Vector3(0, 1, 0) },
        uDiskIn: { value: disk?.inner ?? 3 }, uDiskOut: { value: disk?.outer ?? 20 }, uDiskT: { value: disk?.tempInner ?? 1e6 },
        uDiskB: { value: disk ? disk.brightness : 0 }, uTime: { value: 0 },
        uMarchR: { value: Math.max(30, (disk?.outer ?? 0) * 1.4) },
        tPreExposure: PRE_EXPOSURE_TEX,
      },
      depthTest: false,
      depthWrite: false,
    });
    void PRE_EXPOSURE_GLSL;
  }

  /** rel: hole relative to the camera (m); rot: body orientation (disk normal = body +Y). */
  update(ctx: FrameContext, rel: THREE.Vector3, rot: THREE.Quaternion) {
    const u = this.material.uniforms;
    const rs = this.body.radius;
    const d = rel.length();
    // visible when the lensing region (or the deflection of background light) is at least ~1 px
    // visible while the Einstein radius √(2rs/d) (or the disk) spans at least ~half a pixel
    const marchR = u.uMarchR.value as number;
    const strongPx = (marchR * rs) / d / ctx.pixelAngle;
    this.visible = strongPx > 0.5 || Math.sqrt((2 * rs) / Math.max(d, 1)) > ctx.pixelAngle * 0.5;
    if (!this.visible) return;
    u.uCam.value.copy(rel).multiplyScalar(-1 / rs);
    u.uInvProj.value.copy(ctx.camera.projectionMatrixInverse);
    u.uProj.value.copy(ctx.camera.projectionMatrix);
    const m4 = new THREE.Matrix4().makeRotationFromQuaternion(ctx.camQuat);
    u.uViewToWorld.value.setFromMatrix4(m4);
    u.uWorldToView.value.setFromMatrix4(m4.invert());
    u.uFar.value = ctx.camera.far;
    this.q.copy(rot);
    if (this.disk?.tilt) this.q.multiply(this.disk.tilt);
    u.uN.value.set(0, 1, 0).applyQuaternion(this.q);
    u.uTime.value = ctx.time % 1e6;
  }

  dispose() {
    this.material.dispose();
  }
}
