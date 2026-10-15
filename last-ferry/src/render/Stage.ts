// Renderer, the fixed 16:9 game frame (letterboxed to the window), the
// gameplay camera, the frame loop and the post-processing chain.
//
// Frame (when post-processing is on):
//   update hooks → preRender hooks (offscreen passes: reflections …)
//   → main HDR target (MSAA, half float): clear, beforeMainRender hooks
//     (the environment draws its backdrop here), clear depth, scene
//   → afterMainRender hooks (still bound to the HDR target)
//   → bloom (threshold + dual-filter mip chain) → composite to the canvas:
//     exposure, ACES filmic, grade (saturation, contrast, split toning),
//     vignette, dither → postRender hooks (overlays on the final image).
// With post-processing off the scene renders straight to the canvas with
// three's ACES tone mapping (same look minus bloom / grade).
//
// The camera is EXACTLY src/config/view.ts (the logic's hit test depends on it);
// only `shakeOffset` moves it.
import * as THREE from 'three';
import { CAMERA_FOV, CAMERA_POS, CAMERA_TARGET, DESIGN_H, DESIGN_W } from '../config/view';

export { DESIGN_H, DESIGN_W };

/** Layer enabled on meshes that should mirror in wet planks / water (characters, corpses, effects). */
export const REFLECT_LAYER = 2;

export type FrameHook = (dt: number, time: number) => void;
export type PostQuality = 'off' | 'low' | 'medium' | 'high';

export interface ProjectedPoint {
  x: number;
  y: number;
  /** True when the point is behind the camera. */
  behind?: boolean;
}

/** Live post-processing parameters (the environment drives most of them from the time of day). */
export interface PostSettings {
  /** Master switch (false = plain render with three's tone mapping). */
  enabled: boolean;
  /** Linear exposure multiplier before tone mapping. */
  exposure: number;
  /** Bloom amount added to the scene (0 = off). */
  bloomStrength: number;
  /** Luminance where bloom starts (linear, pre-exposure) and the soft knee width. */
  bloomThreshold: number;
  bloomKnee: number;
  /** 0..1: how much the wide (low-resolution) bloom levels contribute. */
  bloomRadius: number;
  /** 0..1 vignette darkening at the corners. */
  vignette: number;
  /** 1 = unchanged. */
  saturation: number;
  /** 1 = unchanged (pivots around mid grey, after tone mapping). */
  contrast: number;
  /** Multiplicative tints for the shadows / highlights (split toning, ~1 = neutral). */
  shadowTint: THREE.Color;
  highlightTint: THREE.Color;
  /** Additive lift of the blacks (display space). */
  lift: THREE.Color;
  /** Film grain amount (0..1). */
  grain: number;
  /** Extra full-screen flash added after tone mapping (white-hot cannon / horn flashes), 0..1. */
  flash: number;
  flashColor: THREE.Color;
}

const POST_QUALITY: Record<Exclude<PostQuality, 'off'>, { msaa: number; levels: number; bloomScale: number }> = {
  // Low: no multisampling (the HDR target is the biggest per-pixel cost), a short bloom chain.
  low: { msaa: 0, levels: 4, bloomScale: 0.5 },
  medium: { msaa: 4, levels: 5, bloomScale: 0.5 },
  high: { msaa: 4, levels: 6, bloomScale: 0.5 },
};

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Element sized to the 16:9 frame; canvas and UI layers live inside. */
  readonly view: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  /** Current frame size in CSS px. */
  viewW = DESIGN_W;
  viewH = DESIGN_H;
  /** CSS px per design px. */
  scale = 1;
  pixelRatio = 1;
  maxPixelRatio = 2;
  /**
   * Dynamic resolution: while frames come too slowly and the CPU is not the
   * reason, the render scale (fraction of the pixel ratio) steps down to
   * `minRenderScale`; with headroom it climbs back. See start().
   */
  autoResolution = true;
  minRenderScale = 0.6;
  /** Current render scale (1 = full pixel ratio). */
  renderScale = 1;
  /** True between webglcontextlost and webglcontextrestored (nothing is rendered). */
  contextLost = false;
  /** Camera offset for screen shake / punches (world units, applied every frame). */
  readonly shakeOffset = new THREE.Vector3();
  /**
   * Optional custom main render, called instead of renderer.render(scene, camera)
   * with the main target bound and cleared (so post-processing still applies).
   * It must render into the currently bound target (do not change it).
   */
  renderFn: (() => void) | null = null;
  /** Post-processing parameters (mutable; see PostSettings). */
  readonly post: PostSettings = {
    enabled: true,
    exposure: 1,
    bloomStrength: 0.55,
    bloomThreshold: 1.0,
    bloomKnee: 0.6,
    bloomRadius: 0.75,
    vignette: 0.32,
    saturation: 1.06,
    contrast: 1.04,
    shadowTint: new THREE.Color(1, 1, 1),
    highlightTint: new THREE.Color(1, 1, 1),
    lift: new THREE.Color(0, 0, 0),
    grain: 0.035,
    flash: 0,
    flashColor: new THREE.Color(1, 0.95, 0.85),
  };
  private postQuality: PostQuality = 'high';
  private chain: PostChain | null = null;
  private preRender: FrameHook[] = [];
  private postRender: FrameHook[] = [];
  private beforeMain: FrameHook[] = [];
  private afterMain: FrameHook[] = [];
  private update: FrameHook[] = [];
  private resizeHooks: Array<(w: number, h: number) => void> = [];
  private lostHooks: Array<() => void> = [];
  private restoredHooks: Array<() => void> = [];
  private resizeTimer = 0;
  private lostNote: HTMLDivElement | null = null;
  private lostTimer = 0;
  /** Adaptive resolution state (see adapt). */
  private ad = { ema: 1 / 60, cpu: 0, slow: 0, fast: 0, sinceUp: 99, lockUp: 0 };
  private last = 0;
  private time = 0;
  private running = false;
  private readonly basePos = new THREE.Vector3(CAMERA_POS.x, CAMERA_POS.y, CAMERA_POS.z);
  private readonly clearColor = new THREE.Color(0x05070b);

  constructor(host: HTMLElement, opts: { post?: PostQuality } = {}) {
    this.view = document.createElement('div');
    this.view.id = 'game-view';
    host.appendChild(this.view);
    // With post-processing the scene is multisampled in the HDR target; canvas MSAA would be wasted.
    this.renderer = new THREE.WebGLRenderer({ antialias: (opts.post ?? 'high') === 'off', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    this.view.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, DESIGN_W / DESIGN_H, 5, 3000);
    this.camera.position.copy(this.basePos);
    this.camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);
    this.camera.layers.enable(REFLECT_LAYER);
    this.camera.updateMatrixWorld();

    this.setPostQuality(opts.post ?? 'high');
    // Window resizes are coalesced (a drag would otherwise reallocate every
    // render target on every event); a device-pixel-ratio change (window moved
    // to another monitor) resizes too.
    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.resize(), 120);
    });
    this.watchPixelRatio();
    // Context loss (GPU reset, driver update, too much VRAM): no rendering
    // until it is back, a note on screen, and three restores its state.
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.showLostNote(true);
      for (const h of this.lostHooks) h();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.showLostNote(false);
      this.resize();
      for (const h of this.restoredHooks) h();
    });
    this.resize();
  }

  private watchPixelRatio(): void {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    const on = () => {
      mq.removeEventListener?.('change', on);
      this.resize();
      this.watchPixelRatio();
    };
    mq.addEventListener?.('change', on);
  }

  /** Called when the WebGL context is lost (pause the game, show a note). */
  onContextLost(fn: () => void): void {
    this.lostHooks.push(fn);
  }
  /** Called when the WebGL context is back (GPU contents such as the blood decals were lost). */
  onContextRestored(fn: () => void): void {
    this.restoredHooks.push(fn);
  }

  /** The default 'graphics reset' note (with a reload button if the context does not come back). */
  private showLostNote(on: boolean): void {
    clearTimeout(this.lostTimer);
    if (!on) {
      this.lostNote?.remove();
      this.lostNote = null;
      return;
    }
    if (this.lostNote) return;
    const d = document.createElement('div');
    d.className = 'lf-context-lost';
    d.style.cssText =
      'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:14px 22px;background:rgba(8,10,14,.86);color:#f0d9b5;font:600 15px/1.4 system-ui,sans-serif;border:1px solid rgba(240,217,181,.3);border-radius:6px;z-index:50;text-align:center';
    d.textContent = 'Graphics reset… waiting for the GPU';
    this.view.appendChild(d);
    this.lostNote = d;
    this.lostTimer = window.setTimeout(() => {
      if (!this.contextLost || !this.lostNote) return;
      d.textContent = 'The browser reset the graphics and did not give them back. ';
      const b = document.createElement('button');
      b.textContent = 'Reload';
      b.style.cssText = 'margin-left:8px;font:inherit;padding:2px 12px;cursor:pointer';
      b.onclick = () => location.reload();
      d.appendChild(b);
    }, 5000);
  }

  /**
   * Post-processing quality: 'off' renders straight to the canvas (three's ACES, no
   * bloom/grade; canvas antialiasing only if the Stage was constructed with post 'off').
   * Safe to call any time.
   */
  setPostQuality(q: PostQuality): void {
    this.postQuality = q;
    this.chain?.dispose();
    this.chain = null;
    if (q !== 'off') {
      this.chain = new PostChain(this.renderer, POST_QUALITY[q]);
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.chain.setSize(size.x, size.y);
    }
  }

  get postQualityLevel(): PostQuality {
    return this.postQuality;
  }

  /**
   * The render target the main scene is drawn into this frame (the HDR target
   * when post-processing is on, otherwise null = canvas). Valid inside
   * onBeforeMainRender / onAfterMainRender hooks.
   */
  get mainTarget(): THREE.WebGLRenderTarget | null {
    return this.chain && this.post.enabled ? this.chain.sceneTarget : null;
  }

  resize(): void {
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    const k = Math.min(ww / DESIGN_W, wh / DESIGN_H);
    this.viewW = Math.max(2, Math.floor(DESIGN_W * k));
    this.viewH = Math.max(2, Math.floor(DESIGN_H * k));
    this.scale = this.viewW / DESIGN_W;
    Object.assign(this.view.style, {
      position: 'absolute',
      width: `${this.viewW}px`,
      height: `${this.viewH}px`,
      left: `${Math.floor((ww - this.viewW) / 2)}px`,
      top: `${Math.floor((wh - this.viewH) / 2)}px`,
    });
    clearTimeout(this.resizeTimer);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio) * this.renderScale;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.viewW, this.viewH);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.chain?.setSize(size.x, size.y);
    this.view.style.setProperty('--k', String(this.scale));
    for (const h of this.resizeHooks) h(this.viewW, this.viewH);
  }

  onResize(fn: (w: number, h: number) => void): void {
    this.resizeHooks.push(fn);
    fn(this.viewW, this.viewH);
  }
  /** Every frame, before rendering (game update). */
  onUpdate(fn: FrameHook): void {
    this.update.push(fn);
  }
  /** Before the main render (offscreen passes: reflections, decal painting). */
  onPreRender(fn: FrameHook): void {
    this.preRender.push(fn);
  }
  /** After the final image is on the canvas (overlay passes). */
  onPostRender(fn: FrameHook): void {
    this.postRender.push(fn);
  }
  /**
   * Inside the main target, after it was cleared and before the scene is drawn
   * (backdrop layers). The depth buffer is cleared again before the scene, so a
   * hook may render another scene/camera with depth. Hooks must leave the
   * render target bound (see `mainTarget`).
   */
  onBeforeMainRender(fn: FrameHook): void {
    this.beforeMain.push(fn);
  }
  /** Inside the main target, right after the scene (before bloom / grade). */
  onAfterMainRender(fn: FrameHook): void {
    this.afterMain.push(fn);
  }

  /** Project a world point to CSS px inside the game view. */
  project<T extends ProjectedPoint>(p: THREE.Vector3, out?: T): T {
    const o = (out ?? { x: 0, y: 0 }) as T;
    const v = _v.copy(p).project(this.camera);
    o.x = (v.x * 0.5 + 0.5) * this.viewW;
    o.y = (-v.y * 0.5 + 0.5) * this.viewH;
    o.behind = v.z > 1;
    return o;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const raw = Math.max(0, (now - this.last) / 1000);
      const dt = Math.min(0.1, raw);
      this.last = now;
      const t0 = performance.now();
      this.frame(dt);
      if (this.autoResolution) this.adapt(raw, (performance.now() - t0) / 1000);
    };
    requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
  }

  /**
   * Dynamic resolution. `interval`: seconds since the previous frame, `cpu`:
   * seconds this frame's JS took. Frames slower than ~45 fps for over a second
   * while the JS leaves most of the frame idle (so the GPU is the limit) step
   * the render scale down by 0.1; well above 55 fps for 4 s step it back up by
   * 0.05. A step up that has to be undone within 8 s locks further steps up
   * for 20 s (no see-sawing).
   */
  private adapt(interval: number, cpu: number): void {
    const a = this.ad;
    if (interval > 0.25 || interval <= 0 || this.contextLost) return; // stalls, hidden tab
    a.ema += (interval - a.ema) * 0.08;
    a.cpu += (cpu - a.cpu) * 0.08;
    a.sinceUp += interval;
    a.lockUp = Math.max(0, a.lockUp - interval);
    const gpuBound = a.cpu < a.ema * 0.6;
    if (a.ema > 1 / 45 && gpuBound) {
      a.slow += interval;
      a.fast = 0;
    } else if (a.ema < 1 / 55) {
      a.fast += interval;
      a.slow = 0;
    } else {
      a.slow = Math.max(0, a.slow - interval);
      a.fast = 0;
    }
    let next = this.renderScale;
    if (a.slow > 1.2 && this.renderScale > this.minRenderScale) {
      next = Math.max(this.minRenderScale, Math.round((this.renderScale - 0.1) * 100) / 100);
      if (a.sinceUp < 8) a.lockUp = 20;
    } else if (a.fast > 4 && this.renderScale < 1 && a.lockUp <= 0) {
      next = Math.min(1, Math.round((this.renderScale + 0.05) * 100) / 100);
      a.sinceUp = 0;
    }
    if (next !== this.renderScale) {
      this.renderScale = next;
      a.slow = 0;
      a.fast = 0;
      a.ema = 1 / 60;
      this.resize();
    }
  }

  /** True while frame() runs (update hooks can tell they are inside a frame). */
  get inFrame(): boolean {
    return this.frameDepth > 0;
  }
  private frameDepth = 0;

  /** Advance one frame (tests step this deterministically). */
  frame(dt: number, render = true): void {
    this.frameDepth++;
    try {
      this.time += dt;
      for (const f of this.update) f(dt, this.time);
      if (!render || this.contextLost) return;
      this.camera.position.copy(this.basePos).add(this.shakeOffset);
      this.camera.updateMatrixWorld();
      // One scene matrix update per frame: the reflection and main passes
      // (and the shadow pass inside them) all draw the same poses.
      this.scene.matrixWorldAutoUpdate = true;
      this.scene.updateMatrixWorld();
      this.scene.matrixWorldAutoUpdate = false;
      for (const f of this.preRender) f(dt, this.time);
      this.renderMain(dt);
      for (const f of this.postRender) f(dt, this.time);
    } finally {
      this.scene.matrixWorldAutoUpdate = true;
      this.frameDepth--;
    }
  }

  /** Advance `seconds` without drawing (tests). */
  fastForward(seconds: number, step = 1 / 30): void {
    const n = Math.ceil(seconds / step);
    for (let i = 0; i < n; i++) this.frame(step, i % 10 === 9);
  }

  private renderMain(dt: number): void {
    const r = this.renderer;
    const chain = this.post.enabled ? this.chain : null;
    const target = chain ? chain.sceneTarget : null;
    const prevAuto = r.autoClear;
    r.setRenderTarget(target);
    r.setClearColor(this.clearColor, 1);
    r.clear(true, true, true);
    r.autoClear = false;
    if (this.beforeMain.length) {
      for (const f of this.beforeMain) f(dt, this.time);
      r.setRenderTarget(target);
      r.clearDepth();
    }
    if (this.renderFn) this.renderFn();
    else r.render(this.scene, this.camera);
    for (const f of this.afterMain) f(dt, this.time);
    r.autoClear = prevAuto;
    if (chain) chain.render(this.post, this.time);
  }
}

const _v = new THREE.Vector3();

// --------------------------------------------------------------------------
// Post-processing chain: HDR scene target → bloom mips → composite.

const FS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Threshold (soft knee) + 13-tap downsample of the scene into the first bloom level. */
const PREFILTER_FRAG = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uThreshold, uKnee;
  varying vec2 vUv;
  vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
  vec3 knee(vec3 c) {
    float br = max(c.r, max(c.g, c.b));
    float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-4);
    float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
    return c * contrib;
  }
  void main() {
    vec3 a = tap(vec2(-1.0, -1.0)), b = tap(vec2(1.0, -1.0)), c = tap(vec2(-1.0, 1.0)), d = tap(vec2(1.0, 1.0));
    vec3 e = tap(vec2(-2.0, 0.0)), f = tap(vec2(2.0, 0.0)), g = tap(vec2(0.0, -2.0)), h = tap(vec2(0.0, 2.0));
    vec3 m = tap(vec2(0.0));
    // Karis-weighted groups keep single hot pixels from flickering.
    vec3 g0 = (a + b + c + d) * 0.25;
    vec3 g1 = (e + g + m + a) * 0.25;
    vec3 g2 = (f + g + m + b) * 0.25;
    vec3 g3 = (e + h + m + c) * 0.25;
    vec3 g4 = (f + h + m + d) * 0.25;
    float w0 = 1.0 / (1.0 + dot(g0, vec3(0.2126, 0.7152, 0.0722)));
    float w1 = 1.0 / (1.0 + dot(g1, vec3(0.2126, 0.7152, 0.0722)));
    float w2 = 1.0 / (1.0 + dot(g2, vec3(0.2126, 0.7152, 0.0722)));
    float w3 = 1.0 / (1.0 + dot(g3, vec3(0.2126, 0.7152, 0.0722)));
    float w4 = 1.0 / (1.0 + dot(g4, vec3(0.2126, 0.7152, 0.0722)));
    vec3 col = (g0 * w0 * 0.5 + (g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) * 0.125) / (w0 * 0.5 + (w1 + w2 + w3 + w4) * 0.125);
    gl_FragColor = vec4(knee(min(col, vec3(64.0))), 1.0);
  }
`;

/** Dual-filter downsample. */
const DOWN_FRAG = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
    s += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
    s += texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
    s += texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
    s += texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
    gl_FragColor = vec4(s / 8.0, 1.0);
  }
`;

/** Dual-filter upsample (tent), added onto the larger level. */
const UP_FRAG = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uWeight;
  varying vec2 vUv;
  void main() {
    vec2 t = uTexel;
    vec3 s = texture2D(tSrc, vUv + vec2(-2.0, 0.0) * t).rgb;
    s += texture2D(tSrc, vUv + vec2(2.0, 0.0) * t).rgb;
    s += texture2D(tSrc, vUv + vec2(0.0, -2.0) * t).rgb;
    s += texture2D(tSrc, vUv + vec2(0.0, 2.0) * t).rgb;
    s += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * t).rgb * 2.0;
    s += texture2D(tSrc, vUv + vec2(1.0, -1.0) * t).rgb * 2.0;
    s += texture2D(tSrc, vUv + vec2(-1.0, 1.0) * t).rgb * 2.0;
    s += texture2D(tSrc, vUv + vec2(1.0, 1.0) * t).rgb * 2.0;
    gl_FragColor = vec4(s / 12.0 * uWeight, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D tScene, tBloom;
  uniform vec2 uRes;
  uniform float uExposure, uBloom, uVignette, uSat, uContrast, uGrain, uTime, uFlash;
  uniform vec3 uShadowTint, uHighTint, uLift, uFlashColor;
  varying vec2 vUv;
  vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 aces(vec3 color) {
    const mat3 ACESInputMat = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777));
    const mat3 ACESOutputMat = mat3(
      vec3(1.60475, -0.10208, -0.00327),
      vec3(-0.53108, 1.10813, -0.07276),
      vec3(-0.07367, -0.00605, 1.07602));
    color /= 0.6;
    color = ACESInputMat * color;
    color = RRTAndODTFit(color);
    color = ACESOutputMat * color;
    return clamp(color, 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;
    c += texture2D(tBloom, vUv).rgb * uBloom;
    c *= uExposure;
    c = aces(c);
    // Grade in (linear) display space.
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c *= mix(uShadowTint, uHighTint, smoothstep(0.02, 0.55, l));
    l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = max(mix(vec3(l), c, uSat), 0.0);
    vec3 s = toSRGB(c);
    s = (s - 0.5) * uContrast + 0.5;
    s = s + uLift * (1.0 - s);
    // Vignette (aspect-correct, soft).
    vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float vig = smoothstep(0.45, 1.15, length(q) * 1.08);
    s *= 1.0 - uVignette * vig;
    s += uFlashColor * uFlash;
    // Grain + dither.
    float n = hash(vUv * uRes + fract(uTime * 13.17) * 517.0) - 0.5;
    s += n * (1.0 / 255.0 + uGrain * 0.12 * (1.0 - 0.6 * dot(s, vec3(0.33))));
    gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
  }
`;

class PostChain {
  readonly sceneTarget: THREE.WebGLRenderTarget;
  private levels: THREE.WebGLRenderTarget[] = [];
  private quad: THREE.Mesh;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quadScene = new THREE.Scene();
  private prefilter: THREE.ShaderMaterial;
  private down: THREE.ShaderMaterial;
  private up: THREE.ShaderMaterial;
  private composite: THREE.ShaderMaterial;
  private w = 4;
  private h = 4;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private q: { msaa: number; levels: number; bloomScale: number },
  ) {
    // Float colour buffers are near universal on WebGL2; fall back to 8-bit (no HDR bloom headroom) if missing.
    const ext = renderer.extensions;
    const hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    const type = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.sceneTarget = new THREE.WebGLRenderTarget(4, 4, {
      type,
      depthBuffer: true,
      stencilBuffer: false,
      samples: q.msaa,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    this.sceneTarget.texture.name = 'SceneHDR';
    for (let i = 0; i < q.levels; i++) {
      const t = new THREE.WebGLRenderTarget(4, 4, {
        type,
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      });
      t.texture.name = `Bloom${i}`;
      this.levels.push(t);
    }
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>, blend = false) =>
      new THREE.ShaderMaterial({
        vertexShader: FS_VERT,
        fragmentShader: frag,
        uniforms,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        blending: blend ? THREE.AdditiveBlending : THREE.NoBlending,
        transparent: blend,
      });
    this.prefilter = mk(PREFILTER_FRAG, {
      tSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 1 },
      uKnee: { value: 0.5 },
    });
    this.down = mk(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = mk(UP_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } }, true);
    this.composite = mk(COMPOSITE_FRAG, {
      tScene: { value: this.sceneTarget.texture },
      tBloom: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uExposure: { value: 1 },
      uBloom: { value: 0.5 },
      uVignette: { value: 0.3 },
      uSat: { value: 1 },
      uContrast: { value: 1 },
      uGrain: { value: 0 },
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uShadowTint: { value: new THREE.Color(1, 1, 1) },
      uHighTint: { value: new THREE.Color(1, 1, 1) },
      uLift: { value: new THREE.Color(0, 0, 0) },
      uFlashColor: { value: new THREE.Color(1, 1, 1) },
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(geo, this.composite);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setSize(w: number, h: number): void {
    this.w = Math.max(4, w);
    this.h = Math.max(4, h);
    this.sceneTarget.setSize(this.w, this.h);
    let lw = Math.max(2, Math.round(this.w * this.q.bloomScale));
    let lh = Math.max(2, Math.round(this.h * this.q.bloomScale));
    for (const t of this.levels) {
      t.setSize(lw, lh);
      lw = Math.max(2, lw >> 1);
      lh = Math.max(2, lh >> 1);
    }
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, clear: boolean): void {
    const r = this.renderer;
    this.quad.material = mat;
    r.setRenderTarget(target);
    if (clear) r.clear(true, false, false);
    r.render(this.quadScene, this.cam);
  }

  render(p: PostSettings, time: number): void {
    const r = this.renderer;
    const prevAuto = r.autoClear;
    r.autoClear = false;
    const L = this.levels;
    const bloomOn = p.bloomStrength > 0.001 && L.length > 0;
    if (bloomOn) {
      // Prefilter into level 0.
      const pf = this.prefilter.uniforms;
      pf.tSrc.value = this.sceneTarget.texture;
      pf.uTexel.value.set(1 / this.w, 1 / this.h);
      pf.uThreshold.value = p.bloomThreshold / Math.max(0.05, p.exposure);
      pf.uKnee.value = Math.max(0.01, p.bloomKnee / Math.max(0.05, p.exposure));
      this.pass(this.prefilter, L[0], false);
      // Down chain.
      for (let i = 1; i < L.length; i++) {
        const d = this.down.uniforms;
        d.tSrc.value = L[i - 1].texture;
        d.uTexel.value.set(0.5 / L[i - 1].width, 0.5 / L[i - 1].height);
        this.pass(this.down, L[i], false);
      }
      // Up chain (additive onto the larger level).
      for (let i = L.length - 1; i > 0; i--) {
        const u = this.up.uniforms;
        u.tSrc.value = L[i].texture;
        u.uTexel.value.set(0.5 / L[i].width, 0.5 / L[i].height);
        // Wider levels weigh less when the radius is small.
        u.uWeight.value = Math.pow(Math.max(0.05, p.bloomRadius), (L.length - i) * 0.35);
        this.pass(this.up, L[i - 1], false);
      }
    }
    const c = this.composite.uniforms;
    c.tBloom.value = bloomOn ? L[0].texture : null;
    c.uBloom.value = bloomOn ? p.bloomStrength : 0;
    c.uRes.value.set(this.w, this.h);
    c.uExposure.value = p.exposure;
    c.uVignette.value = p.vignette;
    c.uSat.value = p.saturation;
    c.uContrast.value = p.contrast;
    c.uGrain.value = p.grain;
    c.uTime.value = time;
    c.uFlash.value = p.flash;
    c.uShadowTint.value.copy(p.shadowTint);
    c.uHighTint.value.copy(p.highlightTint);
    c.uLift.value.copy(p.lift);
    c.uFlashColor.value.copy(p.flashColor);
    if (!bloomOn) {
      // A black 1x1 stand-in keeps the program valid.
      c.tBloom.value = BLACK;
    }
    this.pass(this.composite, null, false);
    r.autoClear = prevAuto;
  }

  dispose(): void {
    this.sceneTarget.dispose();
    for (const t of this.levels) t.dispose();
    this.prefilter.dispose();
    this.down.dispose();
    this.up.dispose();
    this.composite.dispose();
    this.quad.geometry.dispose();
  }
}

const BLACK = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
})();
