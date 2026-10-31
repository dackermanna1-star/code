import * as THREE from 'three';
import { PRESETS, QualityPreset, Settings } from '../core/settings';

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const PREFILTER_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + 0.5, 0.0, 1.0);
  soft = soft * soft * 0.5;
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(min(c * contrib, vec3(30.0)), 1.0);
}
`;

const DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}
`;

const UP_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tPrev;
uniform vec2 uTexel;
uniform float uMix;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 0.0)).rgb * 2.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 0.0)).rgb * 2.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(0.0, -1.0)).rgb * 2.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(0.0, 1.0)).rgb * 2.0;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c /= 12.0;
  gl_FragColor = vec4(texture2D(tPrev, vUv).rgb + c * uMix, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uExposure;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uChroma;
uniform float uDesat;
uniform float uRed;
uniform float uFlash;
uniform float uFade;
uniform vec2 uRes;
varying vec2 vUv;

vec3 aces(vec3 x) {
  const float a = 2.51; const float b = 0.03; const float c = 2.43; const float d = 0.59; const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec2 uv = vUv;
  vec2 dc = uv - 0.5;
  vec3 col;
  if (uChroma > 0.001) {
    vec2 off = dc * uChroma * 0.012;
    col.r = texture2D(tScene, uv + off).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv - off).b;
  } else {
    col = texture2D(tScene, uv).rgb;
  }
  col += texture2D(tBloom, uv).rgb * uBloom;
  col *= uExposure;
  col = aces(col);
  // grade: slight teal shadows / warm highlights, contrast
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 shadowTint = vec3(0.92, 1.0, 1.06);
  vec3 highTint = vec3(1.06, 1.0, 0.92);
  col *= mix(shadowTint, highTint, smoothstep(0.1, 0.7, lum));
  col = mix(vec3(lum), col, 1.08 - uDesat);
  col = (col - 0.5) * 1.06 + 0.5;
  // damage / low health red
  col = mix(col, col * vec3(1.25, 0.45, 0.42), uRed);
  // vignette
  float v = smoothstep(0.85, 0.2, length(dc * vec2(1.15, 1.0)));
  col *= mix(1.0, v, uVignette + uRed * 0.4);
  col = clamp(col, 0.0, 1.0);
  col = toSRGB(col);
  // grain (in display space)
  float g = hash(uv * uRes + fract(uTime) * 91.7) - 0.5;
  col += g * uGrain;
  col = mix(col, vec3(1.0), uFlash);
  col *= 1.0 - uFade;
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface PostFx {
  chroma: number;
  desat: number;
  red: number;
  flash: number;
  fade: number;
  exposure: number;
}

export class Renderer {
  gl: THREE.WebGLRenderer;
  preset: QualityPreset;
  private sceneRT!: THREE.WebGLRenderTarget;
  private bloomRTs: THREE.WebGLRenderTarget[] = [];
  private bloomUpRTs: THREE.WebGLRenderTarget[] = [];
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private prefilterMat: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private blackTex: THREE.DataTexture;
  width = 1;
  height = 1;
  dynScale = 1;
  private frameTimes: number[] = [];
  private lastAdjust = 0;
  fx: PostFx = { chroma: 0, desat: 0, red: 0, flash: 0, fade: 0, exposure: 1.25 };
  hdr = true;
  onResize: (() => void) | null = null;

  constructor(public container: HTMLElement, public settings: Settings) {
    this.preset = PRESETS[settings.quality];
    this.gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false, stencil: false });
    this.gl.setClearColor(0x000000, 1);
    this.gl.shadowMap.enabled = settings.shadows;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping;
    this.gl.autoClear = true;
    container.appendChild(this.gl.domElement);
    // HDR targets need float color buffers; fall back to 8-bit targets where unsupported
    this.hdr = this.gl.extensions.has('EXT_color_buffer_float') || this.gl.extensions.has('EXT_color_buffer_half_float');
    this.blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.blackTex.needsUpdate = true;
    const geo = new THREE.PlaneGeometry(2, 2);
    this.prefilterMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: PREFILTER_FRAG, uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.0 } }, depthTest: false, depthWrite: false });
    this.downMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: DOWN_FRAG, uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false });
    this.upMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: UP_FRAG, uniforms: { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } }, depthTest: false, depthWrite: false });
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.6 }, uExposure: { value: 1.0 }, uVignette: { value: 0.55 }, uGrain: { value: 0.035 },
        uTime: { value: 0 }, uChroma: { value: 0 }, uDesat: { value: 0 }, uRed: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(geo, this.compMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  applySettings(s: Settings) {
    this.settings = s;
    this.preset = PRESETS[s.quality];
    this.gl.shadowMap.enabled = s.shadows;
    this.resize();
  }

  get pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio) * this.preset.renderScale * this.settings.renderScale * this.dynScale;
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.gl.setPixelRatio(1);
    this.gl.setSize(w, h, true);
    const pr = this.pixelRatio;
    const rw = Math.max(64, Math.round(w * pr));
    const rh = Math.max(64, Math.round(h * pr));
    this.width = rw;
    this.height = rh;
    this.sceneRT?.dispose();
    const rtType = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.sceneRT = new THREE.WebGLRenderTarget(rw, rh, {
      type: rtType,
      samples: this.preset.msaa,
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    for (const r of this.bloomRTs) r.dispose();
    for (const r of this.bloomUpRTs) r.dispose();
    this.bloomRTs = [];
    this.bloomUpRTs = [];
    let bw = Math.max(1, rw >> 1), bh = Math.max(1, rh >> 1);
    for (let i = 0; i < 5; i++) {
      const opts = { type: rtType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
      this.bloomRTs.push(new THREE.WebGLRenderTarget(bw, bh, opts));
      this.bloomUpRTs.push(new THREE.WebGLRenderTarget(bw, bh, opts));
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
    }
    this.compMat.uniforms.uRes.value.set(w, h);
    this.onResize?.();
  }

  private blit(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.gl.setRenderTarget(target);
    this.gl.render(this.quadScene, this.quadCam);
  }

  /** Draw stats of the main scene pass (not post passes). */
  sceneStats = { calls: 0, triangles: 0 };

  render(scene: THREE.Scene, camera: THREE.Camera, time: number) {
    const gl = this.gl;
    gl.setRenderTarget(this.sceneRT);
    gl.clear();
    gl.info.autoReset = false;
    gl.info.reset();
    gl.render(scene, camera);
    this.sceneStats.calls = gl.info.render.calls;
    this.sceneStats.triangles = gl.info.render.triangles;
    gl.info.autoReset = true;
    const useBloom = this.settings.bloom && this.preset.bloom;
    let bloomTex: THREE.Texture = this.blackTex;
    if (useBloom) {
      // prefilter
      this.prefilterMat.uniforms.tSrc.value = this.sceneRT.texture;
      this.prefilterMat.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
      this.blit(this.prefilterMat, this.bloomRTs[0]);
      for (let i = 1; i < this.bloomRTs.length; i++) {
        const src = this.bloomRTs[i - 1];
        this.downMat.uniforms.tSrc.value = src.texture;
        this.downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.blit(this.downMat, this.bloomRTs[i]);
      }
      // upsample chain
      let prev = this.bloomRTs[this.bloomRTs.length - 1];
      for (let i = this.bloomRTs.length - 2; i >= 0; i--) {
        this.upMat.uniforms.tSrc.value = prev.texture;
        this.upMat.uniforms.tPrev.value = this.bloomRTs[i].texture;
        this.upMat.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
        this.upMat.uniforms.uMix.value = 0.9;
        this.blit(this.upMat, this.bloomUpRTs[i]);
        prev = this.bloomUpRTs[i];
      }
      bloomTex = prev.texture;
    }
    const u = this.compMat.uniforms;
    u.tScene.value = this.sceneRT.texture;
    u.tBloom.value = bloomTex;
    u.uBloom.value = useBloom ? 0.55 : 0;
    u.uTime.value = time;
    u.uGrain.value = this.settings.filmGrain ? 0.035 : 0;
    u.uChroma.value = this.settings.motionFx ? this.fx.chroma : 0;
    u.uDesat.value = this.fx.desat;
    u.uRed.value = this.fx.red;
    u.uFlash.value = this.fx.flash;
    u.uFade.value = this.fx.fade;
    u.uExposure.value = this.fx.exposure;
    this.blit(this.compMat, null);
  }

  /** Feed frame time (ms) for dynamic resolution. */
  trackFrame(ms: number, now: number) {
    if (!this.settings.dynamicResolution) {
      if (this.dynScale !== 1) {
        this.dynScale = 1;
        this.resize();
      }
      return;
    }
    this.frameTimes.push(ms);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    if (now - this.lastAdjust < 1.5 || this.frameTimes.length < 60) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    let next = this.dynScale;
    if (p75 > 19.5) next = Math.max(0.6, this.dynScale - 0.1);
    else if (p75 < 13 && this.dynScale < 1) next = Math.min(1, this.dynScale + 0.05);
    if (Math.abs(next - this.dynScale) > 1e-3) {
      this.dynScale = next;
      this.lastAdjust = now;
      this.frameTimes.length = 0;
      this.resize();
    }
  }
}
