import * as THREE from 'three';

/**
 * The retro frame: the scene is drawn into a small render target (270 / 360 / 480 lines; width from
 * the aspect), then one full-screen pass upscales it to the canvas with nearest-neighbour blocks
 * while grading it (exposure, a soft highlight shoulder, lift / gamma / gain, saturation), adding a
 * faint vignette and quantising every channel to a few bits through a 4x4 Bayer ordered dither.
 *
 * Pixels stay square and even: the block size is a whole number of device pixels (the internal
 * height is snapped so the canvas holds an integer multiple of it; the spare row/column is split
 * between the edges so the centre stays exactly on the crosshair). The canvas itself renders at the
 * device pixel ratio (Retina: 2) so the blocks are crisp, and the cost of the upscale pass is a
 * single texel fetch per pixel.
 *
 * The low-res target is HDR (half float) when the GPU can render to it, so lamps and beams can
 * exceed 1 and roll off in the shoulder; otherwise an sRGB 8-bit target keeps the darks smooth.
 *
 *   const retro = new RetroRenderer(container, { quality: 'medium' });
 *   retro.setSize(innerWidth, innerHeight);
 *   // each frame:
 *   retro.render(scene, camera, false);        // world -> low-res target (no present yet)
 *   retro.renderOverlay(vmScene, vmCamera);    // viewmodel on top (depth cleared), then present
 *   // (or just retro.render(scene, camera) when there is no overlay)
 *
 * A scene may carry a grade in `scene.userData.retroGrade` ({ exposure, lift, gamma, gain,
 * saturation, contrast, vignette }); the level scene keeps it in step with the time of day.
 */

export const QUALITY_HEIGHTS = { low: 270, medium: 360, high: 480 };

const VERT = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec4 uMap;        // x: device px per texel, y: unused, zw: device-px offset of texel (0,0)
uniform vec2 uInternal;   // internal size in texels
uniform vec2 uScreen;     // canvas size in device px
uniform vec3 uLevels;     // quantisation steps per channel (2^bits - 1)
uniform float uDither;    // 0..1
uniform float uVignette;
uniform float uExposure;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSaturation;
uniform float uContrast;

float bayer4(ivec2 p) {
  int x = p.x & 3, y = p.y & 3;
  int i = x + y * 4;
  // 4x4 Bayer matrix, row-major
  int m = i == 0 ? 0 : i == 1 ? 8 : i == 2 ? 2 : i == 3 ? 10 :
          i == 4 ? 12 : i == 5 ? 4 : i == 6 ? 14 : i == 7 ? 6 :
          i == 8 ? 3 : i == 9 ? 11 : i == 10 ? 1 : i == 11 ? 9 :
          i == 12 ? 15 : i == 13 ? 7 : i == 14 ? 13 : 5;
  return (float(m) + 0.5) / 16.0;
}

vec3 shoulder(vec3 c) {
  // linear below the knee, an exponential roll-off above it (never clips harshly)
  const float k = 0.62;
  vec3 over = max(c - k, 0.0);
  return min(c, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}

vec3 toSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 tp = floor((gl_FragCoord.xy + uMap.zw) / uMap.x);
  tp = clamp(tp, vec2(0.0), uInternal - 1.0);
  ivec2 ti = ivec2(tp);
  vec3 c = texelFetch(tScene, ti, 0).rgb;
  c = shoulder(c * uExposure);
  c = toSRGB(c);
  // three-way grade in display space
  c = c * uGain + uLift * (1.0 - c);
  c = pow(max(c, 0.0), 1.0 / uGamma);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5;
  // vignette (on the low-res grid so it dithers with everything else)
  vec2 q = (tp + 0.5) / uInternal - 0.5;
  q.x *= uInternal.x / uInternal.y;
  c *= 1.0 - uVignette * smoothstep(0.25, 1.1, dot(q, q) * 2.2);
  // ordered dither + quantisation
  float b = (bayer4(ti) - 0.5) * uDither;
  c = floor(clamp(c, 0.0, 1.0) * uLevels + 0.5 + b) / uLevels;
  gl_FragColor = vec4(c, 1.0);
}`;

export class RetroRenderer {
  /**
   * @param {HTMLElement|null} canvasParent  element to append the canvas to (or null)
   * @param {object} opts  { quality: 'low'|'medium'|'high', dpr, integerScale = true, maxScopeBoost = 2,
   *                         bits = 5 (or [r, g, b]), dither = 1, vignette = 0.16, canvas, powerPreference }
   */
  constructor(canvasParent, opts = {}) {
    this.opts = opts;
    const renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas, antialias: false, alpha: false, stencil: false, depth: true,
      powerPreference: opts.powerPreference ?? 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
    });
    this.renderer = renderer;
    renderer.autoClear = true;
    renderer.info.autoReset = false; // counted per frame (scene + overlay + present), reset in render()
    renderer.setClearColor(0x000000, 1);
    const cv = renderer.domElement;
    cv.style.display = 'block';
    cv.style.imageRendering = 'pixelated';
    if (canvasParent) canvasParent.appendChild(cv);

    this.dpr = opts.dpr ?? Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    this.integerScale = opts.integerScale ?? true;
    this.maxScopeBoost = Math.max(1, opts.maxScopeBoost ?? 2);
    this.quality = opts.quality ?? 'medium';
    this.scopeBoost = 1;
    this.cssW = 0;
    this.cssH = 0;
    this.internal = { width: 1, height: 1, scale: 1 };

    const hdr = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    this.hdr = hdr && opts.hdr !== false;
    this.target = null;

    const bits = opts.bits ?? 5;
    const b3 = Array.isArray(bits) ? bits : [bits, bits, bits];
    this.uniforms = {
      tScene: { value: null },
      uMap: { value: new THREE.Vector4(1, 0, 0, 0) },
      uInternal: { value: new THREE.Vector2(1, 1) },
      uScreen: { value: new THREE.Vector2(1, 1) },
      uLevels: { value: new THREE.Vector3(2 ** b3[0] - 1, 2 ** b3[1] - 1, 2 ** b3[2] - 1) },
      uDither: { value: opts.dither ?? 1 },
      uVignette: { value: opts.vignette ?? 0.16 },
      uExposure: { value: 1 },
      uLift: { value: new THREE.Vector3(0, 0, 0) },
      uGamma: { value: new THREE.Vector3(1, 1, 1) },
      uGain: { value: new THREE.Vector3(1, 1, 1) },
      uSaturation: { value: 1 },
      uContrast: { value: 1 },
    };
    this.baseVignette = this.uniforms.uVignette.value;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.postQuad = new THREE.Mesh(geo, mat);
    this.postQuad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.postQuad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const w = opts.width ?? (typeof window !== 'undefined' ? window.innerWidth : 960);
    const h = opts.height ?? (typeof window !== 'undefined' ? window.innerHeight : 540);
    this.setSize(w, h);
  }

  /** 'low' | 'medium' | 'high' (internal heights 270 / 360 / 480), or a number of lines. */
  setQuality(level) {
    this.quality = level;
    this._resize();
  }

  /** Canvas size in CSS pixels. */
  setSize(w, h) {
    this.cssW = Math.max(1, w | 0);
    this.cssH = Math.max(1, h | 0);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.cssW, this.cssH);
    this._resize();
  }

  /** Raise the internal resolution while scoped (k = 1 .. maxScopeBoost); no reallocation. */
  setScopeBoost(k) {
    k = Math.min(this.maxScopeBoost, Math.max(1, k || 1));
    if (k === this.scopeBoost) return;
    this.scopeBoost = k;
    this._layout();
  }

  /** Bits per channel (5 = PS-era 15-bit colour) and dither strength. */
  setColorDepth(bits, dither = this.uniforms.uDither.value) {
    const b3 = Array.isArray(bits) ? bits : [bits, bits, bits];
    this.uniforms.uLevels.value.set(2 ** b3[0] - 1, 2 ** b3[1] - 1, 2 ** b3[2] - 1);
    this.uniforms.uDither.value = dither;
  }

  _baseHeight() {
    return typeof this.quality === 'number' ? this.quality : (QUALITY_HEIGHTS[this.quality] ?? QUALITY_HEIGHTS.medium);
  }

  _fit(lines) {
    const W = this.renderer.domElement.width, H = this.renderer.domElement.height;
    if (this.integerScale) {
      const s = Math.max(1, Math.round(H / lines));
      return { s, w: Math.ceil(W / s), h: Math.ceil(H / s), W, H };
    }
    const s = Math.max(1, H / lines);
    return { s, w: Math.max(1, Math.round(W / s)), h: Math.max(1, Math.round(H / s)), W, H };
  }

  _resize() {
    // the target is sized for the largest scope boost, rendering uses a sub-viewport
    const big = this._fit(this._baseHeight() * this.maxScopeBoost);
    const tw = Math.max(big.w, this._fit(this._baseHeight()).w), th = Math.max(big.h, this._fit(this._baseHeight()).h);
    if (!this.target || this.target.width !== tw || this.target.height !== th) {
      if (this.target) this.target.dispose();
      this.target = new THREE.WebGLRenderTarget(tw, th, {
        type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        colorSpace: this.hdr ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace,
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
        depthBuffer: true, stencilBuffer: false,
      });
      this.uniforms.tScene.value = this.target.texture;
    }
    this._layout();
  }

  _layout() {
    const f = this._fit(this._baseHeight() * this.scopeBoost);
    const w = Math.min(f.w, this.target.width), h = Math.min(f.h, this.target.height);
    this.target.viewport.set(0, 0, w, h);
    this.target.scissor.set(0, 0, w, h);
    this.internal.width = w;
    this.internal.height = h;
    this.internal.scale = f.s;
    // centre the image: the spare (w * s - W) device px are split between the two edges
    const ox = Math.floor((w * f.s - f.W) / 2), oy = Math.floor((h * f.s - f.H) / 2);
    this.uniforms.uMap.value.set(f.s, 0, this.integerScale ? ox : 0, this.integerScale ? oy : 0);
    this.uniforms.uInternal.value.set(w, h);
    this.uniforms.uScreen.value.set(f.W, f.H);
  }

  _grade(scene) {
    const g = scene && scene.userData && scene.userData.retroGrade;
    const u = this.uniforms;
    if (!g) return;
    if (g.exposure !== undefined) u.uExposure.value = g.exposure;
    if (g.lift) u.uLift.value.fromArray(g.lift);
    if (g.gamma) u.uGamma.value.fromArray(g.gamma);
    if (g.gain) u.uGain.value.fromArray(g.gain);
    if (g.saturation !== undefined) u.uSaturation.value = g.saturation;
    if (g.contrast !== undefined) u.uContrast.value = g.contrast;
    u.uVignette.value = this.baseVignette * (g.vignette ?? 1);
  }

  /** Draw the scene into the low-res target; then present it (unless present === false). */
  render(scene, camera, present = true) {
    const r = this.renderer;
    r.info.reset();
    this._grade(scene);
    r.setRenderTarget(this.target);
    r.autoClear = true;
    r.render(scene, camera);
    if (present) this.present();
  }

  /** Draw another scene on top into the same target (depth cleared first; no background). */
  renderOverlay(scene, camera, present = true) {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.autoClear = false;
    r.clearDepth();
    r.render(scene, camera);
    r.autoClear = true;
    if (present) this.present();
  }

  /** Upscale + grade + dither the low-res target onto the canvas. */
  present() {
    const r = this.renderer;
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }

  get domElement() {
    return this.renderer.domElement;
  }

  dispose() {
    if (this.target) this.target.dispose();
    this.postQuad.geometry.dispose();
    this.postQuad.material.dispose();
    this.renderer.dispose();
  }
}
