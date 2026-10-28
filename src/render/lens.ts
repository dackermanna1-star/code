/**
 * Camera effects on the HDR image, before exposure and bloom, so bright
 * highlights blur into bokeh discs and streaks the way a real lens renders
 * them.
 *
 * Depth of field: a thin lens on a full-frame sensor (36 × 24 mm), whose
 * focal length follows the field of view, stopped down to an f-number. The
 * circle of confusion is c = f² / (N (z_f − f)) · |z − z_f| / z. Autofocus
 * tracks the centre of the frame, smoothed over time in a 1×1 target, or the
 * focus distance can be set by hand. A 64-tap golden-angle gather lets
 * foreground blur spread over sharp pixels behind it, but not the reverse.
 *
 * Motion blur: the camera's movement relative to the body it is anchored to
 * (so the ground you stand on stays sharp while you turn), found by
 * reprojecting each pixel's depth into the previous frame. The streak is the
 * motion during an exposure of `shutter` seconds.
 */
import * as THREE from 'three';
import { FS_VERT, hdrTarget } from './fullscreen';
import type { RenderPipeline } from './pipeline';

const DEPTH_GLSL = /* glsl */ `
uniform sampler2D tDepth;
uniform float uFar;
// view-space depth (m) of a pixel; 1e30 for the sky
float viewZ(vec2 uv) {
  float d = texture(tDepth, uv).r;
  return d >= 0.99999 ? 1e30 : exp2(d * log2(uFar + 1.0)) - 1.0;
}
`;

const FOCUS_FRAG = /* glsl */ `
${DEPTH_GLSL}
uniform sampler2D tPrev;
uniform float uDt;
varying vec2 vUv;
void main() {
  // nearest of five taps around the centre: focus on the subject, not past its edge
  float z = 1e7;
  for (int i = 0; i < 5; i++) {
    vec2 o = i == 0 ? vec2(0.0) : vec2(i == 1 ? 1.0 : i == 2 ? -1.0 : 0.0, i == 3 ? 1.0 : i == 4 ? -1.0 : 0.0) * 0.015;
    z = min(z, viewZ(vec2(0.5) + o));
  }
  float prev = texture(tPrev, vec2(0.5)).r;
  float f = prev <= 0.0 ? z : exp2(mix(log2(prev), log2(z), 1.0 - exp(-uDt * 5.0)));
  gl_FragColor = vec4(f, 0.0, 0.0, 1.0);
}
`;

const DOF_FRAG = /* glsl */ `
${DEPTH_GLSL}
uniform sampler2D tColor;
uniform sampler2D tFocus;
uniform vec2 uTexel;
uniform float uFocal;    // focal length (m)
uniform float uFNumber;
uniform float uManual;   // manual focus distance (m), or ≤ 0 for autofocus
uniform float uPxPerM;   // sensor metres → pixels
uniform float uMaxCoC;   // px
varying vec2 vUv;
float zf;
float cocOf(float z) {
  float k = uFocal * uFocal / (uFNumber * max(zf - uFocal, 1e-4));
  return min(uMaxCoC, k * abs(z - zf) / max(z, 1e-3) * uPxPerM);
}
void main() {
  zf = uManual > 0.0 ? uManual : texture(tFocus, vec2(0.5)).r;
  vec3 c = texture(tColor, vUv).rgb;
  float z0 = viewZ(vUv);
  float s0 = cocOf(z0);
  vec3 acc = c;
  float tot = 1.0;
  for (int i = 0; i < 64; i++) {
    float r = uMaxCoC * sqrt((float(i) + 0.5) / 64.0);
    float a = float(i) * 2.39996323;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
    float sz = viewZ(uv);
    float ss = cocOf(sz);
    if (sz > z0) ss = min(ss, s0 * 2.0); // background never bleeds over a sharper subject
    float m = smoothstep(r - 0.5, r + 0.5, ss);
    acc += mix(acc / tot, texture(tColor, uv).rgb, m);
    tot += 1.0;
  }
  gl_FragColor = vec4(acc / tot, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
${DEPTH_GLSL}
uniform sampler2D tColor;
uniform mat4 uInvProj;
uniform mat4 uReproj;    // current view space → previous clip space
uniform float uScale;    // shutter time / frame time
uniform float uMaxPx;
uniform vec2 uTexel;
uniform float uFrame;
varying vec2 vUv;
void main() {
  vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 vdir = normalize(vp.xyz / vp.w);
  float z = viewZ(vUv);
  // the sky reprojects by rotation only
  vec4 prev = z > 1e29 ? uReproj * vec4(vdir, 0.0) : uReproj * vec4(vdir * (z / max(-vdir.z, 1e-6)), 1.0);
  vec3 c = texture(tColor, vUv).rgb;
  if (prev.w <= 1e-6) { gl_FragColor = vec4(c, 1.0); return; }
  vec2 v = (vUv - (prev.xy / prev.w * 0.5 + 0.5)) * uScale;
  float lpx = length(v / uTexel);
  if (lpx < 0.5) { gl_FragColor = vec4(c, 1.0); return; }
  if (lpx > uMaxPx) v *= uMaxPx / lpx;
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uFrame * 5.588238, vec2(0.06711056, 0.00583715))));
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 12; i++) acc += texture(tColor, vUv + v * ((float(i) + j) / 12.0 - 0.5)).rgb;
  gl_FragColor = vec4(acc / 12.0, 1.0);
}
`;

export interface LensSettings {
  /** 'off', 'auto' (focus on the centre of the frame) or 'manual' */
  dof: 'off' | 'auto' | 'manual';
  fNumber: number;
  /** manual focus distance (m) */
  focusDistance: number;
  /** exposure as a fraction of 1/24 s: 0.5 = 180° shutter at 24 fps, 0 = off */
  motionBlur: number;
}

/** Thin-lens circle of confusion (m on the sensor) for a subject at z when focused at zf. */
export function circleOfConfusion(focal: number, fNumber: number, zf: number, z: number) {
  return ((focal * focal) / (fNumber * Math.max(zf - focal, 1e-4))) * (Math.abs(z - zf) / z);
}

/** Focal length (m) of a full-frame lens with this vertical field of view. */
export const focalLength = (fovDeg: number) => 0.012 / Math.tan((fovDeg * Math.PI) / 360);

export class LensEffects {
  settings: LensSettings = { dof: 'off', fNumber: 2.8, focusDistance: 10, motionBlur: 0 };
  private focusRT = [hdrTarget(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }),
    hdrTarget(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })];
  private focusIdx = 0;
  private focusMat: THREE.ShaderMaterial;
  readonly dofMat: THREE.ShaderMaterial;
  readonly blurMat: THREE.ShaderMaterial;
  /** previous camera pose relative to its anchor (body-fixed), for motion blur */
  private prev: { key: string; pos: THREE.Vector3; q: THREE.Quaternion } | null = null;
  private frame = 0;

  constructor() {
    const mk = (frag: string, u: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms: { tDepth: { value: null }, uFar: { value: 1e27 }, ...u }, depthTest: false, depthWrite: false });
    this.focusMat = mk(FOCUS_FRAG, { tPrev: { value: null }, uDt: { value: 0 } });
    this.dofMat = mk(DOF_FRAG, {
      tColor: { value: null }, tFocus: { value: null }, uTexel: { value: new THREE.Vector2() }, uFocal: { value: 0.02 }, uFNumber: { value: 2.8 },
      uManual: { value: 0 }, uPxPerM: { value: 1 }, uMaxCoC: { value: 24 },
    });
    this.blurMat = mk(BLUR_FRAG, {
      tColor: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uReproj: { value: new THREE.Matrix4() }, uScale: { value: 0 },
      uMaxPx: { value: 40 }, uTexel: { value: new THREE.Vector2() }, uFrame: { value: 0 },
    });
  }

  /**
   * Apply the enabled effects to the pipeline's current HDR image.
   * anchor: the camera pose in the frame it moves in (body-fixed position
   * and orientation, keyed by body), and toWorld maps that frame to the
   * current camera-relative world (position of the frame origin, rotation).
   */
  apply(p: RenderPipeline, cam: THREE.PerspectiveCamera, dt: number, fovDeg: number,
    anchor: { key: string; pos: THREE.Vector3; q: THREE.Quaternion; origin: THREE.Vector3; rot: THREE.Quaternion }) {
    const s = this.settings;
    this.frame++;
    const far = cam.far;
    const w = p.width, h = p.height;
    // motion blur: where was this pixel a frame ago (relative to the anchor)?
    const prev = this.prev;
    this.prev = { key: anchor.key, pos: anchor.pos.clone(), q: anchor.q.clone() };
    if (s.motionBlur > 0 && prev && prev.key === anchor.key && dt > 0) {
      const prevPosW = prev.pos.clone().applyQuaternion(anchor.rot).add(anchor.origin);
      const prevQW = anchor.rot.clone().multiply(prev.q);
      if (prevPosW.length() < 1e7) {
        const prevView = new THREE.Matrix4().compose(prevPosW, prevQW, new THREE.Vector3(1, 1, 1)).invert();
        const curCam = new THREE.Matrix4().makeRotationFromQuaternion(cam.quaternion);
        const u = this.blurMat.uniforms;
        (u.uReproj.value as THREE.Matrix4).multiplyMatrices(cam.projectionMatrix, prevView).multiply(curCam);
        (u.uInvProj.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
        u.uScale.value = Math.min(2, (s.motionBlur / 24) / dt);
        u.uFar.value = far;
        (u.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
        u.uFrame.value = this.frame % 64;
        p.composite(this.blurMat);
      }
    }
    if (s.dof !== 'off') {
      const fu = this.focusMat.uniforms;
      fu.tDepth.value = p.depthTexture;
      fu.uFar.value = far;
      fu.tPrev.value = this.focusRT[this.focusIdx].texture;
      fu.uDt.value = Math.min(dt, 0.25);
      this.focusIdx ^= 1;
      p.fs.render(p.renderer, this.focusRT[this.focusIdx], this.focusMat);
      const u = this.dofMat.uniforms;
      u.tFocus.value = this.focusRT[this.focusIdx].texture;
      u.uFar.value = far;
      u.uFocal.value = focalLength(fovDeg);
      u.uFNumber.value = s.fNumber;
      u.uManual.value = s.dof === 'manual' ? s.focusDistance : 0;
      u.uPxPerM.value = h / 0.024;
      u.uMaxCoC.value = Math.max(6, Math.min(48, h / 30));
      (u.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
      p.composite(this.dofMat);
    }
  }

  dispose() {
    for (const t of this.focusRT) t.dispose();
    this.focusMat.dispose();
    this.dofMat.dispose();
    this.blurMat.dispose();
  }
}
