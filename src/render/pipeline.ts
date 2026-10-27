/**
 * Frame pipeline:
 *   1. scene → HDR target (half float) with float depth texture (log depth)
 *   2. atmosphere composite passes, farthest planet first (ping-pong)
 *   3. overlay scene (transparent effects; manual depth test vs depth texture)
 *   4. auto exposure: log-luminance → mip chain → temporal adaptation (1×1)
 *   5. bloom: 13-tap downsample chain + tent upsample chain
 *   6. composite: exposure, bloom, AgX tone mapping, vignette, dither → screen
 */
import * as THREE from 'three';
import { FullscreenPass, FS_VERT, hdrTarget } from './fullscreen';

export interface PipelineSettings {
  renderScale: number;
  bloomStrength: number;
  exposureComp: number; // EV
  autoExposure: boolean;
  manualExposure: number;
  minExposure: number;
  maxExposure: number;
  adaptSpeed: number;
  vignette: number;
  fxaa: boolean;
}

export const defaultPipelineSettings: PipelineSettings = {
  renderScale: 1,
  bloomStrength: 0.012,
  exposureComp: 0,
  autoExposure: true,
  manualExposure: 2,
  minExposure: 0.0005,
  maxExposure: 2e7,
  adaptSpeed: 1.6,
  vignette: 0.18,
  fxaa: true,
};

const LUM_FRAG = /* glsl */ `
// Log-luminance of "non-black" pixels (above −10 stops at the current exposure),
// so black space around a planet is ignored while small bright sources (a star
// disc) barely move a log average. Stored in scene units (log2) – half-float safe.
uniform sampler2D tColor;
uniform sampler2D tAdapt;
varying vec2 vUv;
void main() {
  float e = max(texture(tAdapt, vec2(0.5)).r, 1e-4);
  vec3 c = vec3(0.0);
  vec2 px = vec2(1.0 / 64.0);
  for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++)
    c += texture(tColor, vUv + (vec2(x, y) - 0.5) * px * 0.5).rgb;
  c *= 0.25;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec2 d = vUv - 0.5;
  float w = exp(-dot(d, d) * 3.0);
  float lit = l * e > 1e-3 ? 1.0 : 0.0;
  gl_FragColor = vec4(log2(max(l, 1e-12)) * lit * w, lit * w, w, 1.0);
}
`;

const ADAPT_FRAG = /* glsl */ `
uniform sampler2D tLum;
uniform sampler2D tPrev;
uniform float uDt, uSpeed, uMin, uMax, uComp, uInit, uManual, uAuto;
varying vec2 vUv;
void main() {
  vec3 s = textureLod(tLum, vec2(0.5), 6.0).rgb;
  float prev = texture(tPrev, vec2(0.5)).r;
  float litW = s.g / max(s.b, 1e-6);
  float avgLog = s.r / max(s.g, 1e-9);
  float avg = exp2(avgLog);
  // nothing lit at all → open up fully (dark adaptation)
  float target = litW < 1e-4 ? uMax : 0.14 / max(avg, 1e-14);
  target = clamp(target, uMin, uMax) * exp2(uComp);
  if (uAuto < 0.5) target = uManual * exp2(uComp);
  float e;
  if (uInit > 0.5 || prev <= 0.0) e = target;
  else {
    // adapt in log space; quicker toward darker (glare protection)
    float k = 1.0 - exp(-uDt * uSpeed * (target < prev ? 2.5 : 1.0));
    e = exp2(mix(log2(prev), log2(target), k));
  }
  gl_FragColor = vec4(e, avg, litW, 1.0);
}
`;

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uFirst;
varying vec2 vUv;
vec3 s(vec2 o) { return texture(tSrc, vUv + o * uTexel).rgb; }
vec3 karis(vec3 c) { return c / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)) * 0.02); }
void main() {
  vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
  vec3 d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
  vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
  vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
  vec3 r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  if (uFirst > 0.5) r = karis(r);
  gl_FragColor = vec4(min(r, vec3(6e4)), 1.0);
}
`;

const UP_FRAG = /* glsl */ `
uniform sampler2D tSrc;   // lower (smaller) level being upsampled
uniform sampler2D tBase;  // current level downsample result
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * uRadius;
  vec3 c = texture(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture(tSrc, vUv + vec2(0, o.y)).rgb * 2.0 + texture(tSrc, vUv + o).rgb
         + texture(tSrc, vUv + vec2(-o.x, 0)).rgb * 2.0 + texture(tSrc, vUv).rgb * 4.0 + texture(tSrc, vUv + vec2(o.x, 0)).rgb * 2.0
         + texture(tSrc, vUv - o).rgb + texture(tSrc, vUv + vec2(0, -o.y)).rgb * 2.0 + texture(tSrc, vUv + vec2(o.x, -o.y)).rgb;
  gl_FragColor = vec4(texture(tBase, vUv).rgb + c / 16.0, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tBloom;
uniform sampler2D tAdapt;
uniform float uBloom;
uniform float uVignette;
uniform vec2 uTexel;
uniform float uFxaa;
uniform float uTime;
varying vec2 vUv;

// AgX (Troy Sobotka) – polynomial approximation (Benjamin Wrensch)
vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x, x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 c) {
  const mat3 m = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                      0.0784335999999992, 0.878468636469772, 0.0784336,
                      0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const float mn = -12.47393, mx = 4.026069;
  c = m * c;
  c = clamp(log2(max(c, vec3(1e-10))), mn, mx);
  c = (c - mn) / (mx - mn);
  return agxContrast(c);
}
vec3 agxEotf(vec3 c) {
  const mat3 mi = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                       -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                       -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  c = mi * c;
  return pow(max(c, vec3(0.0)), vec3(2.2)); // to linear
}
vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 hdr(vec2 uv) {
  float e = texture(tAdapt, vec2(0.5)).r;
  vec3 c = texture(tColor, uv).rgb + texture(tBloom, uv).rgb * uBloom;
  return c * e;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 tonemapped(vec2 uv) { return agxEotf(agx(hdr(uv))); }

void main() {
  vec3 col;
  if (uFxaa > 0.5) {
    // FXAA 3.11-lite on tone-mapped values
    vec3 cM = tonemapped(vUv);
    vec3 cNW = tonemapped(vUv + vec2(-1, 1) * uTexel), cNE = tonemapped(vUv + vec2(1, 1) * uTexel);
    vec3 cSW = tonemapped(vUv + vec2(-1, -1) * uTexel), cSE = tonemapped(vUv + vec2(1, -1) * uTexel);
    float lM = luma(cM), lNW = luma(cNW), lNE = luma(cNE), lSW = luma(cSW), lSE = luma(cSE);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    if (lMax - lMin < max(0.0312, lMax * 0.125)) col = cM;
    else {
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
      float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
      dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
      vec3 a = 0.5 * (tonemapped(vUv + dir * (1.0/3.0 - 0.5)) + tonemapped(vUv + dir * (2.0/3.0 - 0.5)));
      vec3 b = a * 0.5 + 0.25 * (tonemapped(vUv + dir * -0.5) + tonemapped(vUv + dir * 0.5));
      float lB = luma(b);
      col = (lB < lMin || lB > lMax) ? a : b;
    }
  } else col = tonemapped(vUv);
  vec2 d = vUv - 0.5;
  col *= 1.0 - uVignette * dot(d, d) * 2.0;
  col = toSRGB(col);
  // triangular dither against banding
  float n = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
  float n2 = fract(sin(dot(gl_FragCoord.xy + uTime * 1.3, vec2(39.3468, 11.135))) * 24634.6345);
  col += (n + n2 - 1.0) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

const COPY_FRAG = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() { gl_FragColor = texture(tSrc, vUv); }
`;

export interface CompositePass {
  /** Shade a full-screen pass reading tColor/tDepth. Implementations set their own uniforms. */
  material: THREE.ShaderMaterial;
}

export class RenderPipeline {
  readonly fs: FullscreenPass;
  sceneRT!: THREE.WebGLRenderTarget;
  private pingRT!: THREE.WebGLRenderTarget;
  private pongRT!: THREE.WebGLRenderTarget;
  private bloomDown: THREE.WebGLRenderTarget[] = [];
  private bloomUp: THREE.WebGLRenderTarget[] = [];
  private lumRT: THREE.WebGLRenderTarget;
  private adaptRT: THREE.WebGLRenderTarget[];
  private adaptIdx = 0;
  private initExposure = true;
  private lumMat: THREE.ShaderMaterial;
  private adaptMat: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private copyMat: THREE.ShaderMaterial;
  width = 1;
  height = 1;
  settings: PipelineSettings = { ...defaultPipelineSettings };
  /** The texture holding the current HDR image after composite passes. */
  currentTarget!: THREE.WebGLRenderTarget;
  time = 0;

  constructor(readonly renderer: THREE.WebGLRenderer) {
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.lumMat = mk(LUM_FRAG, { tColor: { value: null }, tAdapt: { value: null } });
    this.adaptMat = mk(ADAPT_FRAG, {
      tLum: { value: null }, tPrev: { value: null }, uDt: { value: 0 }, uSpeed: { value: 1 }, uMin: { value: 0.1 }, uMax: { value: 100 },
      uComp: { value: 0 }, uInit: { value: 1 }, uManual: { value: 1 }, uAuto: { value: 1 },
    });
    this.downMat = mk(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
    this.upMat = mk(UP_FRAG, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } });
    this.compMat = mk(COMPOSITE_FRAG, {
      tColor: { value: null }, tBloom: { value: null }, tAdapt: { value: null }, uBloom: { value: 0.05 }, uVignette: { value: 0.2 },
      uTexel: { value: new THREE.Vector2() }, uFxaa: { value: 1 }, uTime: { value: 0 },
    });
    this.copyMat = mk(COPY_FRAG, { tSrc: { value: null } });
    this.fs = new FullscreenPass(this.copyMat);
    this.lumRT = hdrTarget(64, 64, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.adaptRT = [hdrTarget(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }),
      hdrTarget(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })];
    this.setSize(1, 1);
  }

  setSize(cssW: number, cssH: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(cssW * dpr * this.settings.renderScale));
    const h = Math.max(1, Math.floor(cssH * dpr * this.settings.renderScale));
    if (w === this.width && h === this.height && this.sceneRT) return;
    this.width = w;
    this.height = h;
    this.sceneRT?.dispose();
    this.pingRT?.dispose();
    this.pongRT?.dispose();
    for (const t of this.bloomDown) t.dispose();
    for (const t of this.bloomUp) t.dispose();
    const depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType);
    depthTexture.format = THREE.DepthFormat;
    this.sceneRT = hdrTarget(w, h, { depthBuffer: true, depthTexture });
    this.pingRT = hdrTarget(w, h);
    this.pongRT = hdrTarget(w, h);
    this.bloomDown = [];
    this.bloomUp = [];
    let bw = w, bh = h;
    for (let i = 0; i < 7; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      this.bloomDown.push(hdrTarget(bw, bh));
      this.bloomUp.push(hdrTarget(bw, bh));
    }
    this.renderer.setSize(cssW, cssH, false);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
  }

  get depthTexture(): THREE.DepthTexture {
    return this.sceneRT.depthTexture as THREE.DepthTexture;
  }

  resetExposure() {
    this.initExposure = true;
  }

  /** Render the main scene into the HDR target. */
  beginFrame(scene: THREE.Scene, camera: THREE.Camera) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    r.render(scene, camera);
    this.currentTarget = this.sceneRT;
  }

  /** Apply a full-screen composite pass that reads tColor/tDepth. */
  composite(material: THREE.ShaderMaterial) {
    material.uniforms.tColor.value = this.currentTarget.texture;
    if (material.uniforms.tDepth) material.uniforms.tDepth.value = this.depthTexture;
    const out = this.currentTarget === this.pingRT ? this.pongRT : this.pingRT;
    this.fs.render(this.renderer, out, material);
    this.currentTarget = out;
  }

  /** Render an overlay scene on top of the current image (no hardware depth; effects test depth manually). */
  overlay(scene: THREE.Scene, camera: THREE.Camera) {
    const r = this.renderer;
    if (this.currentTarget === this.sceneRT) {
      // keep the depth texture readable: move the image to a ping target first
      this.copyMat.uniforms.tSrc.value = this.sceneRT.texture;
      this.fs.render(r, this.pingRT, this.copyMat);
      this.currentTarget = this.pingRT;
    }
    r.setRenderTarget(this.currentTarget);
    const ac = r.autoClear;
    r.autoClear = false;
    r.render(scene, camera);
    r.autoClear = ac;
  }

  endFrame(dt: number) {
    const r = this.renderer;
    const s = this.settings;
    this.time += dt;
    const src = this.currentTarget.texture;
    // exposure
    const prev = this.adaptRT[this.adaptIdx];
    this.lumMat.uniforms.tColor.value = src;
    this.lumMat.uniforms.tAdapt.value = prev.texture;
    this.fs.render(r, this.lumRT, this.lumMat);
    this.adaptIdx ^= 1;
    const next = this.adaptRT[this.adaptIdx];
    const au = this.adaptMat.uniforms;
    au.tLum.value = this.lumRT.texture;
    au.tPrev.value = prev.texture;
    au.uDt.value = Math.min(dt, 0.25);
    au.uSpeed.value = s.adaptSpeed;
    au.uMin.value = s.minExposure;
    au.uMax.value = s.maxExposure;
    au.uComp.value = s.exposureComp;
    au.uInit.value = this.initExposure ? 1 : 0;
    au.uManual.value = s.manualExposure;
    au.uAuto.value = s.autoExposure ? 1 : 0;
    this.fs.render(r, next, this.adaptMat);
    this.initExposure = false;
    // bloom
    let input = src;
    let iw = this.width, ih = this.height;
    for (let i = 0; i < this.bloomDown.length; i++) {
      const t = this.bloomDown[i];
      this.downMat.uniforms.tSrc.value = input;
      this.downMat.uniforms.uTexel.value.set(1 / iw, 1 / ih);
      this.downMat.uniforms.uFirst.value = i === 0 ? 1 : 0;
      this.fs.render(r, t, this.downMat);
      input = t.texture;
      iw = t.width; ih = t.height;
    }
    let up = this.bloomDown[this.bloomDown.length - 1].texture;
    for (let i = this.bloomDown.length - 2; i >= 0; i--) {
      const t = this.bloomUp[i];
      this.upMat.uniforms.tSrc.value = up;
      this.upMat.uniforms.tBase.value = this.bloomDown[i].texture;
      this.upMat.uniforms.uTexel.value.set(1 / t.width, 1 / t.height);
      this.upMat.uniforms.uRadius.value = 1.0;
      this.fs.render(r, t, this.upMat);
      up = t.texture;
    }
    // composite to screen
    const cu = this.compMat.uniforms;
    cu.tColor.value = src;
    cu.tBloom.value = up;
    cu.tAdapt.value = next.texture;
    cu.uBloom.value = s.bloomStrength;
    cu.uVignette.value = s.vignette;
    cu.uTexel.value.set(1 / this.width, 1 / this.height);
    cu.uFxaa.value = s.fxaa ? 1 : 0;
    cu.uTime.value = this.time % 100;
    this.fs.render(r, null, this.compMat);
  }

  /** The 1×1 adapted-exposure texture (r = exposure multiplier, g = average luminance). */
  get exposureTexture(): THREE.Texture {
    return this.adaptRT[this.adaptIdx].texture;
  }
}
