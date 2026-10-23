import * as THREE from 'three';
import { FullscreenPass, makeFullscreenMaterial } from './fullscreen.js';
import { U } from './uniforms.js';

// Bloom after Jimenez (CoD: Advanced Warfare): 13-tap downsamples (Karis average on the
// first) and 3x3 tent upsamples accumulated back up the chain.

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uKaris;
varying vec2 vUv;
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 karis(vec3 c) { return c / (1.0 + lum(c)); }
void main() {
  vec2 t = uTexel;
  vec3 a = texture2D(tSrc, vUv + t * vec2(-2.0, 2.0)).rgb;
  vec3 b = texture2D(tSrc, vUv + t * vec2(0.0, 2.0)).rgb;
  vec3 c = texture2D(tSrc, vUv + t * vec2(2.0, 2.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + t * vec2(-2.0, 0.0)).rgb;
  vec3 e = texture2D(tSrc, vUv).rgb;
  vec3 f = texture2D(tSrc, vUv + t * vec2(2.0, 0.0)).rgb;
  vec3 g = texture2D(tSrc, vUv + t * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture2D(tSrc, vUv + t * vec2(0.0, -2.0)).rgb;
  vec3 i = texture2D(tSrc, vUv + t * vec2(2.0, -2.0)).rgb;
  vec3 j = texture2D(tSrc, vUv + t * vec2(-1.0, 1.0)).rgb;
  vec3 k = texture2D(tSrc, vUv + t * vec2(1.0, 1.0)).rgb;
  vec3 l = texture2D(tSrc, vUv + t * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture2D(tSrc, vUv + t * vec2(1.0, -1.0)).rgb;
  vec3 res;
  if (uKaris > 0.5) {
    // Weighted by 1/(1+luma) per group: suppresses single-pixel fireflies (sun glints).
    vec3 g0 = (a + b + d + e) * 0.25;
    vec3 g1 = (b + c + e + f) * 0.25;
    vec3 g2 = (d + e + g + h) * 0.25;
    vec3 g3 = (e + f + h + i) * 0.25;
    vec3 g4 = (j + k + l + m) * 0.25;
    float w0 = 0.125 / (1.0 + lum(g0));
    float w1 = 0.125 / (1.0 + lum(g1));
    float w2 = 0.125 / (1.0 + lum(g2));
    float w3 = 0.125 / (1.0 + lum(g3));
    float w4 = 0.5 / (1.0 + lum(g4));
    res = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
    res = min(res, vec3(2000.0));
  } else {
    res = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(res, 1.0);
}
`;

const UP_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += (texture2D(tSrc, vUv + vec2(-t.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(t.x, 0.0)).rgb +
        texture2D(tSrc, vUv + vec2(0.0, -t.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, t.y)).rgb) * 2.0;
  s += texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb + texture2D(tSrc, vUv + vec2(t.x, -t.y)).rgb +
       texture2D(tSrc, vUv + vec2(-t.x, t.y)).rgb + texture2D(tSrc, vUv + vec2(t.x, t.y)).rgb;
  gl_FragColor = vec4(s / 16.0, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uBloomNorm;
uniform float uTime;
uniform float uHeat;
uniform float uStorm;
uniform float uLogFar;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec2 uResolution;
uniform float uVignette;
uniform float uGrain;
uniform float uNightGrade;
uniform float uWarmth;
uniform float uSaturation;
varying vec2 vUv;

float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 v) {
  const mat3 inMat = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                          0.0784335999999992, 0.878468636469772, 0.0784336,
                          0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const mat3 outMat = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                           -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                           -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  const float minEv = -12.47393;
  const float maxEv = 4.026069;
  v = inMat * v;
  v = clamp(log2(max(v, vec3(1e-10))), minEv, maxEv);
  v = (v - minEv) / (maxEv - minEv);
  v = agxContrast(v);
  // Look: a touch more punch and saturation than default AgX.
  float luma = dot(v, vec3(0.2126, 0.7152, 0.0722));
  v = pow(max(v, vec3(0.0)), vec3(1.12));
  v = luma + uSaturation * (v - luma);
  return outMat * v;
}

void main() {
  vec2 uv = vUv;
  // Heat shimmer: distant ground and the horizon wobble in rising hot air.
  if (uHeat > 0.001) {
    float d = texture2D(tDepth, uv).r;
    float w = exp2(d * uLogFar) - 1.0;
    vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    vec3 dir = normalize((uCamWorld * vec4(vp.xyz / vp.w, 0.0)).xyz);
    float nearHorizon = 1.0 - smoothstep(0.0, 0.1, abs(dir.y + 0.004));
    float far = smoothstep(60.0, 700.0, w);
    float amt = uHeat * nearHorizon * far * (1.0 - uStorm);
    if (amt > 0.0) {
      vec2 q = vec2(uv.x * uResolution.x / uResolution.y, uv.y) * vec2(38.0, 70.0);
      vec2 n = vec2(vn(q + vec2(0.0, -uTime * 3.1)), vn(q * 1.3 + vec2(7.3, -uTime * 4.3))) - 0.5;
      uv += n * amt * vec2(0.003, 0.0055);
    }
  }
  vec3 col = texture2D(tScene, uv).rgb;
  vec3 bloom = texture2D(tBloom, uv).rgb * uBloomNorm;
  col = mix(col, bloom, uBloom);

  // Grade in scene-linear: warm the light, keep shadows a little cool.
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(vec3(1.0), vec3(1.0 + 0.06 * uWarmth, 1.0 + 0.01 * uWarmth, 1.0 - 0.07 * uWarmth), smoothstep(0.02, 0.6, l));
  // Night: desaturate and shift toward blue (scotopic vision).
  vec3 scot = vec3(0.55, 0.68, 1.0) * l;
  col = mix(col, scot, uNightGrade * 0.7);

  col = agx(col);

  vec2 vc = vUv - 0.5;
  col *= 1.0 - uVignette * dot(vc, vc) * 1.6;
  float g = h12(vUv * uResolution + fract(uTime * 13.37) * 400.0) - 0.5;
  col += g * uGrain;
  // Triangular dither before 8-bit quantisation: no banding in the sky gradients.
  float dith = (h12(gl_FragCoord.xy + 0.37) + h12(gl_FragCoord.xy * 1.31 + 11.1) - 1.0) / 255.0;
  col = clamp(col + dith, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// FXAA 3.11 (quality preset 12-ish), on display-referred colour with luma in alpha.
const FXAA_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 uv = vUv;
  vec3 rgbM = texture2D(tSrc, uv).rgb;
  float lM = luma(rgbM);
  float lN = luma(texture2D(tSrc, uv + vec2(0.0, uTexel.y)).rgb);
  float lS = luma(texture2D(tSrc, uv - vec2(0.0, uTexel.y)).rgb);
  float lE = luma(texture2D(tSrc, uv + vec2(uTexel.x, 0.0)).rgb);
  float lW = luma(texture2D(tSrc, uv - vec2(uTexel.x, 0.0)).rgb);
  float lMin = min(lM, min(min(lN, lS), min(lE, lW)));
  float lMax = max(lM, max(max(lN, lS), max(lE, lW)));
  float range = lMax - lMin;
  if (range < max(0.0312, lMax * 0.125)) {
    gl_FragColor = vec4(rgbM, 1.0);
    return;
  }
  float lNW = luma(texture2D(tSrc, uv + vec2(-uTexel.x, uTexel.y)).rgb);
  float lNE = luma(texture2D(tSrc, uv + uTexel).rgb);
  float lSW = luma(texture2D(tSrc, uv - uTexel).rgb);
  float lSE = luma(texture2D(tSrc, uv + vec2(uTexel.x, -uTexel.y)).rgb);
  float edgeH = abs(lNW + lNE - 2.0 * lN) + 2.0 * abs(lW + lE - 2.0 * lM) + abs(lSW + lSE - 2.0 * lS);
  float edgeV = abs(lNW + lSW - 2.0 * lW) + 2.0 * abs(lN + lS - 2.0 * lM) + abs(lNE + lSE - 2.0 * lE);
  bool horz = edgeH >= edgeV;
  float l1 = horz ? lS : lW;
  float l2 = horz ? lN : lE;
  float g1 = abs(l1 - lM);
  float g2 = abs(l2 - lM);
  float stepLen = horz ? uTexel.y : uTexel.x;
  float lLocal;
  float gScaled;
  if (g1 >= g2) {
    stepLen = -stepLen;
    lLocal = 0.5 * (l1 + lM);
    gScaled = 0.25 * g1;
  } else {
    lLocal = 0.5 * (l2 + lM);
    gScaled = 0.25 * g2;
  }
  vec2 cur = uv;
  if (horz) cur.y += stepLen * 0.5; else cur.x += stepLen * 0.5;
  vec2 off = horz ? vec2(uTexel.x, 0.0) : vec2(0.0, uTexel.y);
  vec2 p1 = cur - off;
  vec2 p2 = cur + off;
  float e1 = luma(texture2D(tSrc, p1).rgb) - lLocal;
  float e2 = luma(texture2D(tSrc, p2).rgb) - lLocal;
  bool r1 = abs(e1) >= gScaled;
  bool r2 = abs(e2) >= gScaled;
  for (int i = 0; i < 10; i++) {
    if (r1 && r2) break;
    float q = i < 3 ? 1.0 : (i < 6 ? 2.0 : 4.0);
    if (!r1) { p1 -= off * q; e1 = luma(texture2D(tSrc, p1).rgb) - lLocal; r1 = abs(e1) >= gScaled; }
    if (!r2) { p2 += off * q; e2 = luma(texture2D(tSrc, p2).rgb) - lLocal; r2 = abs(e2) >= gScaled; }
  }
  float d1 = horz ? uv.x - p1.x : uv.y - p1.y;
  float d2 = horz ? p2.x - uv.x : p2.y - uv.y;
  bool dir1 = d1 < d2;
  float dmin = min(d1, d2);
  float len = d1 + d2;
  float pixOff = -dmin / len + 0.5;
  bool lMSmaller = lM < lLocal;
  bool correct = ((dir1 ? e1 : e2) < 0.0) != lMSmaller;
  float finalOff = correct ? pixOff : 0.0;
  float lAvg = (1.0 / 12.0) * (2.0 * (lN + lS + lE + lW) + lNW + lNE + lSW + lSE);
  float sub = clamp(abs(lAvg - lM) / range, 0.0, 1.0);
  sub = (-2.0 * sub + 3.0) * sub * sub;
  finalOff = max(finalOff, sub * sub * 0.75);
  vec2 fuv = uv;
  if (horz) fuv.y += finalOff * stepLen; else fuv.x += finalOff * stepLen;
  gl_FragColor = vec4(texture2D(tSrc, fuv).rgb, 1.0);
}
`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.pass = new FullscreenPass(null);
    this.bloomLevels = 6;
    this.bloomChain = [];
    this.downMat = makeFullscreenMaterial(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uKaris: { value: 0 } });
    this.upMat = makeFullscreenMaterial(UP_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } });
    this.upMat.blending = THREE.AdditiveBlending;
    this.upMat.transparent = true;
    this.compositeMat = makeFullscreenMaterial(COMPOSITE_FRAG, {
      tScene: { value: null },
      tDepth: { value: null },
      tBloom: { value: null },
      uBloom: { value: 0.045 },
      uBloomNorm: { value: 1 / 6 },
      uTime: U.uTime,
      uHeat: { value: 0 },
      uStorm: U.uStorm,
      uLogFar: { value: Math.log2(40001) },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uVignette: { value: 0.22 },
      uGrain: { value: 0.012 },
      uNightGrade: { value: 0 },
      uWarmth: { value: 0.6 },
      uSaturation: { value: 1.18 },
    });
    this.fxaaMat = makeFullscreenMaterial(FXAA_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.ldrRT = null;
    this.useFXAA = false;
    this.bloomEnabled = true;
    this.bloomStrength = 0.05;
    this.heatHaze = true;
  }

  setSize(sceneW, sceneH, outW, outH, { fxaa, bloomLevels }) {
    for (const rt of this.bloomChain) rt.dispose();
    this.bloomChain = [];
    this.bloomLevels = bloomLevels;
    let w = Math.max(1, sceneW >> 1);
    let h = Math.max(1, sceneH >> 1);
    for (let i = 0; i < bloomLevels; i++) {
      const rt = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        depthBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
      rt.texture.colorSpace = THREE.NoColorSpace;
      this.bloomChain.push(rt);
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
    }
    this.useFXAA = fxaa;
    if (this.ldrRT) this.ldrRT.dispose();
    this.ldrRT = fxaa
      ? new THREE.WebGLRenderTarget(outW, outH, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })
      : null;
    this.compositeMat.uniforms.uResolution.value.set(outW, outH);
    this.fxaaMat.uniforms.uTexel.value.set(1 / outW, 1 / outH);
  }

  render(sceneRT, camera) {
    const r = this.renderer;
    const chain = this.bloomChain;
    if (this.bloomEnabled && chain.length) {
      let src = sceneRT.texture;
      let sw = sceneRT.width;
      let sh = sceneRT.height;
      this.pass.material = this.downMat;
      for (let i = 0; i < chain.length; i++) {
        this.downMat.uniforms.tSrc.value = src;
        this.downMat.uniforms.uTexel.value.set(1 / sw, 1 / sh);
        this.downMat.uniforms.uKaris.value = i === 0 ? 1 : 0;
        this.pass.render(r, chain[i]);
        src = chain[i].texture;
        sw = chain[i].width;
        sh = chain[i].height;
      }
      this.pass.material = this.upMat;
      for (let i = chain.length - 1; i > 0; i--) {
        this.upMat.uniforms.tSrc.value = chain[i].texture;
        this.upMat.uniforms.uTexel.value.set(1 / chain[i].width, 1 / chain[i].height);
        this.pass.render(r, chain[i - 1]);
      }
    }
    const cu = this.compositeMat.uniforms;
    cu.tScene.value = sceneRT.texture;
    cu.tDepth.value = sceneRT.depthTexture;
    cu.tBloom.value = chain.length ? chain[0].texture : sceneRT.texture;
    cu.uBloom.value = this.bloomEnabled && chain.length ? this.bloomStrength : 0;
    cu.uBloomNorm.value = 1 / Math.max(1, chain.length);
    cu.uHeat.value = this.heatHaze ? U.uHeat.value : 0;
    cu.uInvProj.value.copy(camera.projectionMatrixInverse);
    cu.uCamWorld.value.copy(camera.matrixWorld);
    this.pass.material = this.compositeMat;
    if (this.useFXAA) {
      this.pass.render(r, this.ldrRT);
      this.fxaaMat.uniforms.tSrc.value = this.ldrRT.texture;
      this.pass.material = this.fxaaMat;
      this.pass.render(r, null);
    } else {
      this.pass.render(r, null);
    }
  }
}
