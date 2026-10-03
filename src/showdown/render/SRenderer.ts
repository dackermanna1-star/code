import * as THREE from 'three';

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

function fullscreenTriangle() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
}

/**
 * Post state gameplay pokes every frame. The first block matches the Blood
 * Road renderer so the Gojo/Sukuna effect modules work unchanged.
 */
export interface SPost {
  exposure: number;
  saturation: number;
  contrast: number;
  tint: THREE.Color;
  lift: THREE.Color;
  vignette: number;
  damage: number;
  flash: number;
  flashColor: THREE.Color;
  aberration: number;
  bloomStrength: number;
  bloomThreshold: number;
  grain: number;
  heal: number;
  bloomBoost: number;
  /** Two-tone inverted impact frame (0..1). */
  impact: number;
  impactColor: THREE.Color;
  lenses: Float32Array;
  lensMode: Float32Array;
  lensRing: Float32Array;
  scope: number;
  // ---- showdown additions
  /** Ink outline strength (0..1). */
  edges: number;
  /** Black-and-white manga rendering: ink, screentone and paper (0..1). */
  manga: number;
  /** Concentration / speed lines (0..1). */
  speed: number;
  /** 0 = radial lines converging on speedFocus, 1 = parallel lines along speedDir. */
  speedMode: number;
  speedFocus: THREE.Vector2;
  speedDir: THREE.Vector2;
  /** 0 = black ink lines, 1 = white streaks. */
  speedWhite: number;
  /** Radial zoom blur toward speedFocus (0..1). */
  zoomBlur: number;
  /** Cinematic bars (0..1). */
  letterbox: number;
  /** Screen cut in two along a line: progress 0..1 (halves slide apart). */
  slice: number;
  sliceAngle: number;
  sliceOffset: number;
  /** Fade to black / white (0..1, sign picks white when negative). */
  fade: number;
  /** Second scene shown on the far side of a diagonal split (domain clash). */
  split: number;
  splitAngle: number;
  splitPos: number;
  /** A world plane drawn as a thin line wherever it meets geometry (and across the sky). */
  cutLine: number;
  /** plane normal (xyz) and offset (w): dot(n, p) = w */
  cutPlane: THREE.Vector4;
  cutColor: THREE.Color;
  /** Line width in pixels. */
  cutWidth: number;
}

function clonePost(p: SPost): SPost {
  const o: any = {};
  for (const [k, v] of Object.entries(p)) o[k] = typeof v === 'number' ? v : v instanceof Float32Array ? v.slice() : (v as any).clone();
  return o as SPost;
}

export interface SRendererOpts {
  samples?: number;
  scale?: number;
  maxPixels?: number;
}

/**
 * The Showdown's renderer: full resolution with MSAA, HDR bloom and an anime
 * composite (ink edges from depth, manga screentone mode, speed lines, impact
 * frames, letterbox and a screen slice).
 */
export class SRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly post: SPost = {
    exposure: 1.0,
    saturation: 1.0,
    contrast: 1.0,
    tint: new THREE.Color(1, 1, 1),
    lift: new THREE.Color(0, 0, 0),
    vignette: 0.28,
    damage: 0,
    flash: 0,
    flashColor: new THREE.Color(1, 0.96, 0.9),
    aberration: 0,
    bloomStrength: 0.5,
    bloomThreshold: 1.25,
    grain: 0.02,
    heal: 0,
    bloomBoost: 0,
    impact: 0,
    impactColor: new THREE.Color(0.75, 0.55, 1),
    lenses: new Float32Array(16),
    lensMode: new Float32Array(4),
    lensRing: new Float32Array(4),
    scope: 0,
    edges: 1,
    manga: 0,
    speed: 0,
    speedMode: 0,
    speedFocus: new THREE.Vector2(0.5, 0.5),
    speedDir: new THREE.Vector2(1, 0),
    speedWhite: 0,
    zoomBlur: 0,
    letterbox: 0,
    slice: 0,
    sliceAngle: 0.5,
    sliceOffset: 0,
    fade: 0,
    split: 0,
    splitAngle: 1.1,
    splitPos: 0,
    cutLine: 0,
    cutPlane: new THREE.Vector4(0, 1, 0, 0),
    cutColor: new THREE.Color(1, 0.1, 0.1),
    cutWidth: 2,
  };
  private readonly defaults: SPost = clonePost(this.post);
  width = 1;
  height = 1;
  internalW = 1;
  internalH = 1;
  scale: number;
  samples: number;
  maxPixels: number;
  near = 0.1;
  far = 5000;
  /** Scene drawn behind the split line when post.split > 0. */
  splitScene: { scene: THREE.Scene; camera: THREE.Camera } | null = null;
  private sceneRT: THREE.WebGLRenderTarget;
  private splitRT: THREE.WebGLRenderTarget | null = null;
  private bloomMips: THREE.WebGLRenderTarget[] = [];
  private fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fsScene = new THREE.Scene();
  private fsMesh: THREE.Mesh;
  private prefilterMat: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private compositeMat: THREE.ShaderMaterial;
  private time = 0;
  onResize: ((w: number, h: number) => void) | null = null;

  constructor(readonly canvas: HTMLCanvasElement, o: SRendererOpts = {}) {
    this.samples = o.samples ?? 4;
    this.scale = o.scale ?? 1;
    this.maxPixels = o.maxPixels ?? 2560 * 1440;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.info.autoReset = false;

    this.sceneRT = this.makeSceneRT();
    for (let i = 0; i < 6; i++) {
      this.bloomMips.push(
        new THREE.WebGLRenderTarget(4, 4, {
          type: THREE.HalfFloatType,
          format: THREE.RGBAFormat,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          generateMipmaps: false,
        }),
      );
    }
    this.prefilterMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold;
        varying vec2 vUv;
        vec3 samp(vec2 o){ return texture2D(tSrc, vUv + o * texel).rgb; }
        void main(){
          vec3 c = samp(vec2(-1.0,-1.0)) + samp(vec2(1.0,-1.0)) + samp(vec2(-1.0,1.0)) + samp(vec2(1.0,1.0));
          c *= 0.25;
          float br = max(c.r, max(c.g, c.b));
          float knee = threshold * 0.5;
          float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
          soft = soft * soft / (4.0 * knee + 1e-4);
          float contrib = max(soft, br - threshold) / max(br, 1e-4);
          c = min(c * contrib, vec3(60.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
      uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 } },
      depthTest: false,
      depthWrite: false,
    });
    this.downMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform vec2 texel;
        varying vec2 vUv;
        void main(){
          vec3 a = texture2D(tSrc, vUv + texel * vec2(-1.0,-1.0)).rgb;
          vec3 b = texture2D(tSrc, vUv + texel * vec2( 1.0,-1.0)).rgb;
          vec3 c = texture2D(tSrc, vUv + texel * vec2(-1.0, 1.0)).rgb;
          vec3 d = texture2D(tSrc, vUv + texel * vec2( 1.0, 1.0)).rgb;
          vec3 e = texture2D(tSrc, vUv).rgb;
          gl_FragColor = vec4((a + b + c + d) * 0.125 + e * 0.5, 1.0);
        }`,
      uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });
    this.upMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform vec2 texel; uniform float weight;
        varying vec2 vUv;
        void main(){
          vec3 s = vec3(0.0);
          s += texture2D(tSrc, vUv + texel * vec2(-1.0,-1.0)).rgb;
          s += texture2D(tSrc, vUv + texel * vec2( 0.0,-1.0)).rgb * 2.0;
          s += texture2D(tSrc, vUv + texel * vec2( 1.0,-1.0)).rgb;
          s += texture2D(tSrc, vUv + texel * vec2(-1.0, 0.0)).rgb * 2.0;
          s += texture2D(tSrc, vUv).rgb * 4.0;
          s += texture2D(tSrc, vUv + texel * vec2( 1.0, 0.0)).rgb * 2.0;
          s += texture2D(tSrc, vUv + texel * vec2(-1.0, 1.0)).rgb;
          s += texture2D(tSrc, vUv + texel * vec2( 0.0, 1.0)).rgb * 2.0;
          s += texture2D(tSrc, vUv + texel * vec2( 1.0, 1.0)).rgb;
          gl_FragColor = vec4(s / 16.0 * weight, 1.0);
        }`,
      uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, weight: { value: 1 } },
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: COMPOSITE,
      uniforms: {
        tScene: { value: null },
        tScene2: { value: null },
        tDepth: { value: null },
        tBloom: { value: null },
        internalRes: { value: new THREE.Vector2() },
        outRes: { value: new THREE.Vector2() },
        nearFar: { value: new THREE.Vector2(0.1, 5000) },
        exposure: { value: 1 },
        saturation: { value: 1 },
        contrast: { value: 1 },
        vignette: { value: 0.3 },
        damage: { value: 0 },
        flash: { value: 0 },
        flashColor: { value: new THREE.Color(1, 1, 1) },
        aberration: { value: 0 },
        bloomStrength: { value: 0.5 },
        grain: { value: 0.03 },
        time: { value: 0 },
        heal: { value: 0 },
        tint: { value: new THREE.Color(1, 1, 1) },
        lift: { value: new THREE.Color(0, 0, 0) },
        lensA: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
        lensB: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
        impact: { value: 0 },
        impactColor: { value: new THREE.Color(0.75, 0.55, 1) },
        edges: { value: 1 },
        manga: { value: 0 },
        speed: { value: 0 },
        speedMode: { value: 0 },
        speedFocus: { value: new THREE.Vector2(0.5, 0.5) },
        speedDir: { value: new THREE.Vector2(1, 0) },
        speedWhite: { value: 0 },
        zoomBlur: { value: 0 },
        letterbox: { value: 0 },
        slice: { value: 0 },
        sliceAngle: { value: 0 },
        sliceOffset: { value: 0 },
        fade: { value: 0 },
        split: { value: 0 },
        splitAngle: { value: 0 },
        splitPos: { value: 0 },
        pxScale: { value: 1 },
        cutLine: { value: 0 },
        cutPlane: { value: new THREE.Vector4() },
        cutColor: { value: new THREE.Color() },
        cutWidth: { value: 2 },
        projInv: { value: new THREE.Matrix4() },
        camWorld: { value: new THREE.Matrix4() },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.fsMesh = new THREE.Mesh(fullscreenTriangle(), this.compositeMat);
    this.fsMesh.frustumCulled = false;
    this.fsScene.add(this.fsMesh);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private makeSceneRT() {
    const depthTexture = new THREE.DepthTexture(4, 4, THREE.FloatType);
    return new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      depthTexture,
      samples: this.samples,
      generateMipmaps: false,
    });
  }

  /** Every post value back to how it started (between fights). */
  resetPost() {
    const d = this.defaults as any;
    const p = this.post as any;
    for (const k of Object.keys(d)) {
      const v = d[k];
      if (typeof v === 'number') p[k] = v;
      else if (v && typeof v.copy === 'function') p[k].copy(v);
      else if (v instanceof Float32Array) p[k].set(v);
    }
    this.splitScene = null;
  }

  setQuality(scale: number, samples: number) {
    this.scale = scale;
    if (samples !== this.samples) {
      this.samples = samples;
      this.sceneRT.dispose();
      this.sceneRT = this.makeSceneRT();
      this.splitRT?.dispose();
      this.splitRT = null;
    }
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.width = w;
    this.height = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let k = dpr * this.scale;
    if (w * h * k * k > this.maxPixels) k = Math.sqrt(this.maxPixels / (w * h));
    this.renderer.setPixelRatio(Math.min(dpr, Math.max(k, 1)));
    this.renderer.setSize(w, h, false);
    this.internalW = Math.max(64, Math.round(w * k));
    this.internalH = Math.max(36, Math.round(h * k));
    this.sceneRT.setSize(this.internalW, this.internalH);
    this.splitRT?.setSize(this.internalW, this.internalH);
    let bw = Math.max(2, this.internalW >> 1);
    let bh = Math.max(2, this.internalH >> 1);
    for (const m of this.bloomMips) {
      m.setSize(bw, bh);
      bw = Math.max(2, bw >> 1);
      bh = Math.max(2, bh >> 1);
    }
    this.onResize?.(w, h);
  }

  private blit(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, clear = true) {
    this.fsMesh.material = mat;
    this.renderer.setRenderTarget(target);
    if (clear) this.renderer.clear(true, false, false);
    this.renderer.render(this.fsScene, this.fsCam);
  }

  /** World, then the first-person layer over it (depth cleared), then bloom and the composite. */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, vmScene: THREE.Scene | null, vmCamera: THREE.Camera | null, dt: number) {
    this.time += dt;
    const r = this.renderer;
    const p = this.post;
    r.info.reset();
    this.near = camera.near;
    this.far = camera.far;
    if (p.split > 0.001 && this.splitScene) {
      if (!this.splitRT) {
        this.splitRT = new THREE.WebGLRenderTarget(this.internalW, this.internalH, {
          type: THREE.HalfFloatType,
          format: THREE.RGBAFormat,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: true,
          samples: Math.min(this.samples, 2),
          generateMipmaps: false,
        });
      }
      r.setRenderTarget(this.splitRT);
      r.setClearColor(0x000000, 1);
      r.clear(true, true, false);
      r.render(this.splitScene.scene, this.splitScene.camera);
    }
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, camera);
    if (vmScene && vmCamera) {
      r.clearDepth();
      r.render(vmScene, vmCamera);
    }

    // bloom chain
    const pre = this.prefilterMat;
    pre.uniforms.tSrc.value = this.sceneRT.texture;
    pre.uniforms.texel.value.set(1 / this.internalW, 1 / this.internalH);
    pre.uniforms.threshold.value = p.bloomThreshold;
    this.blit(pre, this.bloomMips[0]);
    for (let i = 1; i < this.bloomMips.length; i++) {
      const src = this.bloomMips[i - 1];
      this.downMat.uniforms.tSrc.value = src.texture;
      this.downMat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
      this.blit(this.downMat, this.bloomMips[i]);
    }
    for (let i = this.bloomMips.length - 1; i > 0; i--) {
      const src = this.bloomMips[i];
      this.upMat.uniforms.tSrc.value = src.texture;
      this.upMat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
      this.upMat.uniforms.weight.value = 1.0;
      this.blit(this.upMat, this.bloomMips[i - 1], false);
    }

    const u = this.compositeMat.uniforms;
    u.tScene.value = this.sceneRT.texture;
    u.tScene2.value = this.splitRT && p.split > 0.001 ? this.splitRT.texture : this.sceneRT.texture;
    u.tDepth.value = this.sceneRT.depthTexture;
    u.tBloom.value = this.bloomMips[0].texture;
    u.internalRes.value.set(this.internalW, this.internalH);
    u.outRes.value.set(this.width, this.height);
    u.nearFar.value.set(camera.near, camera.far);
    u.exposure.value = p.exposure;
    u.saturation.value = p.saturation;
    u.contrast.value = p.contrast;
    u.vignette.value = p.vignette;
    u.damage.value = p.damage;
    u.flash.value = p.flash;
    (u.flashColor.value as THREE.Color).copy(p.flashColor);
    u.aberration.value = p.aberration;
    u.bloomStrength.value = p.bloomStrength + p.bloomBoost;
    for (let i = 0; i < 4; i++) {
      (u.lensA.value[i] as THREE.Vector4).set(p.lenses[i * 4], p.lenses[i * 4 + 1], p.lenses[i * 4 + 2], p.lenses[i * 4 + 3]);
      (u.lensB.value[i] as THREE.Vector4).set(p.lensMode[i], p.lensRing[i], 0, 0);
    }
    u.impact.value = p.impact;
    (u.impactColor.value as THREE.Color).copy(p.impactColor);
    u.grain.value = p.grain;
    u.time.value = this.time;
    u.heal.value = p.heal;
    (u.tint.value as THREE.Color).copy(p.tint);
    (u.lift.value as THREE.Color).copy(p.lift);
    u.edges.value = p.edges;
    u.manga.value = p.manga;
    u.speed.value = p.speed;
    u.speedMode.value = p.speedMode;
    (u.speedFocus.value as THREE.Vector2).copy(p.speedFocus);
    (u.speedDir.value as THREE.Vector2).copy(p.speedDir).normalize();
    u.speedWhite.value = p.speedWhite;
    u.zoomBlur.value = p.zoomBlur;
    u.letterbox.value = p.letterbox;
    u.slice.value = p.slice;
    u.sliceAngle.value = p.sliceAngle;
    u.sliceOffset.value = p.sliceOffset;
    u.fade.value = p.fade;
    u.split.value = this.splitRT ? p.split : 0;
    u.splitAngle.value = p.splitAngle;
    u.splitPos.value = p.splitPos;
    u.pxScale.value = Math.max(1, this.internalH / 1080);
    u.cutLine.value = p.cutLine;
    if (p.cutLine > 0.001) {
      (u.cutPlane.value as THREE.Vector4).copy(p.cutPlane);
      (u.cutColor.value as THREE.Color).copy(p.cutColor);
      u.cutWidth.value = p.cutWidth * (this.internalH / Math.max(1, this.height));
      (u.projInv.value as THREE.Matrix4).copy((camera as THREE.PerspectiveCamera).projectionMatrixInverse);
      (u.camWorld.value as THREE.Matrix4).copy(camera.matrixWorld);
    }
    r.setRenderTarget(null);
    r.clear(true, true, false);
    this.fsMesh.material = this.compositeMat;
    r.render(this.fsScene, this.fsCam);
  }

  /** Reads back the last frame's view depth (meters) at a uv; for camera collision helpers. */
  get depthTexture() {
    return this.sceneRT.depthTexture;
  }
}

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tScene2; uniform sampler2D tDepth; uniform sampler2D tBloom;
uniform vec2 internalRes; uniform vec2 outRes; uniform vec2 nearFar;
uniform float exposure, saturation, contrast, vignette, damage, flash, aberration, bloomStrength, grain, time, heal;
uniform vec3 tint; uniform vec3 lift; uniform vec3 flashColor;
uniform vec4 lensA[4]; uniform vec4 lensB[4];
uniform float impact; uniform vec3 impactColor;
uniform float edges, manga, speed, speedMode, speedWhite, zoomBlur, letterbox, slice, sliceAngle, sliceOffset, fade;
uniform float split, splitAngle, splitPos, pxScale;
uniform vec2 speedFocus, speedDir;
uniform float cutLine, cutWidth; uniform vec4 cutPlane; uniform vec3 cutColor; uniform mat4 projInv, camWorld;
varying vec2 vUv;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash1(float n){ return fract(sin(n * 12.9898) * 43758.5453); }

vec2 lensUV(vec2 uv, float k){
  vec2 asp = vec2(outRes.x / outRes.y, 1.0);
  for (int i = 0; i < 4; i++) {
    vec4 A = lensA[i];
    if (A.w == 0.0) continue;
    vec4 B = lensB[i];
    vec2 d = (uv - A.xy) * asp;
    float r = length(d);
    if (B.x < 0.5) {
      float E = A.z;
      float e2 = E * E;
      float w = smoothstep(E * 0.55, E * 1.15, r) * (1.0 - smoothstep(E * 5.0, E * 9.0, r));
      vec2 beta = d * (1.0 - A.w * k * e2 / max(r * r, e2 * 0.55));
      uv = A.xy + mix(d, beta, w) / asp;
    } else {
      float x = (r - B.y) / max(A.z, 1e-4);
      float off = A.w * k * x * exp(-x * x) * A.z;
      uv += (r > 1e-5 ? d / r : vec2(0.0)) * off / asp;
    }
  }
  return uv;
}

vec3 aces(vec3 x){
  const float a = 2.51; const float b = 0.03; const float c = 2.43; const float d = 0.59; const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c){
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
// 1 / view depth: affine across any plane in screen space, so its Laplacian only fires on edges
float invZ(vec2 uv){
  float d = texture2D(tDepth, uv).r;
  float n = nearFar.x; float f = nearFar.y;
  return (f - d * (f - n)) / (n * f);
}
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 sceneAt(vec2 uv, bool second){
  return second ? texture2D(tScene2, uv).rgb : texture2D(tScene, uv).rgb;
}

// concentration lines (radial) or flow lines (parallel), redrawn 12 times a second like hand-inked frames
float speedLines(vec2 uv){
  vec2 asp = vec2(outRes.x / outRes.y, 1.0);
  float frame = floor(time * 12.0);
  if (speedMode < 0.5) {
    vec2 d = (uv - speedFocus) * asp;
    float r = length(d);
    float a = atan(d.y, d.x) / 6.2831853 + 0.5;
    float n = a * 260.0;
    float id = floor(n);
    float h = hash1(id * 1.37 + frame * 7.13);
    float h2 = hash1(id * 3.11 + frame * 1.91);
    float r0 = mix(0.22, 0.62, h2) * (1.25 - speed * 0.45);
    float along = clamp((r - r0) / 0.5, 0.0, 1.0);
    float w = abs(fract(n) - 0.5) * 2.0;
    float thick = mix(0.12, 0.85, h) * along;
    float line = 1.0 - smoothstep(thick - 0.12, thick + 0.12, w);
    return line * step(0.28, h) * smoothstep(r0, r0 + 0.08, r);
  }
  vec2 dir = speedDir;
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 p = (uv - 0.5) * asp;
  float across = dot(p, perp) * 140.0;
  float id = floor(across);
  float h = hash1(id * 2.17 + frame * 5.3);
  float h2 = hash1(id * 7.31 + frame * 0.71);
  float s = dot(p, dir) + h2 * 3.0 - frame * 0.21;
  float seg = fract(s * mix(0.35, 0.9, h));
  float len = mix(0.25, 0.7, h2);
  float on = step(seg, len) * step(0.45, h);
  float w = abs(fract(across) - 0.5) * 2.0;
  float line = 1.0 - smoothstep(0.25, 0.6, w);
  // keep the middle of the frame readable
  float edge = smoothstep(0.08, 0.42, abs(dot(p, perp)));
  return line * on * edge;
}

// manga screentone: paper, two halftone densities and solid ink
vec3 mangaTone(vec3 col, vec2 px){
  float l = pow(clamp(luma(col), 0.0, 1.0), 0.4545);
  vec3 paper = vec3(0.955, 0.945, 0.915);
  vec3 ink = vec3(0.045, 0.04, 0.05);
  float P = 5.5 * pxScale;
  vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * px / P;
  vec2 f = fract(q) - 0.5;
  float dd = length(f);
  float aa = 0.7 / P;
  // tone darkness 0..1 from luminance, banded so flats read like applied screentone sheets
  float t = 1.0 - l;
  float band = t < 0.42 ? 0.0 : (t < 0.6 ? 0.26 : (t < 0.78 ? 0.48 : 1.0));
  float bandSoft = mix(band, t, 0.18);
  float r = sqrt(bandSoft / 3.14159) * 1.05;
  float dots = 1.0 - smoothstep(r - aa, r + aa, dd);
  if (bandSoft > 0.9) dots = 1.0;
  if (bandSoft < 0.05) dots = 0.0;
  // fine hatching in the darkest midtones
  float hatch = step(0.5, bandSoft) * step(bandSoft, 0.9) * (1.0 - smoothstep(0.06, 0.16, abs(fract((px.x + px.y) / (4.0 * pxScale)) - 0.5))) * 0.35;
  return mix(paper, ink, clamp(dots + hatch, 0.0, 1.0));
}

// distance to a world plane in line widths, traced across everything it passes through and on to the horizon
float cutDist(vec2 uv){
  float d = texture2D(tDepth, uv).r;
  vec4 v = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 vp = v.xyz / v.w;
  vec3 camPos = (camWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 wp = (camWorld * vec4(vp, 1.0)).xyz;
  vec3 ray = normalize(wp - camPos);
  // radians per internal pixel
  vec4 v2 = projInv * vec4(0.0, 2.0 / internalRes.y, -1.0, 1.0);
  vec4 v1 = projInv * vec4(0.0, 0.0, -1.0, 1.0);
  float pa = abs(v2.y / v2.z - v1.y / v1.z);
  float w = cutWidth * pa;
  // the sky: the plane's vanishing line
  if (d >= 0.99999) return abs(dot(cutPlane.xyz, ray)) / w;
  float s = dot(cutPlane.xyz, wp) - cutPlane.w;
  return abs(s) / max(length(wp - camPos) * w, 1e-4);
}

void main(){
  vec2 uv = vUv;
  vec2 asp = vec2(outRes.x / outRes.y, 1.0);

  // screen slice: the frame is cut along a line and the halves slide apart
  float sliceSide = 0.0;
  float sliceDist = 1.0;
  if (slice > 0.0001) {
    vec2 n = vec2(cos(sliceAngle), sin(sliceAngle));
    vec2 p = (uv - 0.5) * asp;
    float s = dot(p, n) - sliceOffset;
    sliceSide = s >= 0.0 ? 1.0 : -1.0;
    sliceDist = abs(s);
    vec2 t = vec2(-n.y, n.x);
    float k = smoothstep(0.0, 1.0, slice);
    uv += (t * sliceSide * k * 0.05 + n * sliceSide * k * 0.035) / asp;
  }

  bool second = false;
  if (split > 0.001) {
    vec2 n = vec2(cos(splitAngle), sin(splitAngle));
    second = dot((uv - 0.5) * asp, n) > splitPos;
  }

  bool lensing = lensA[0].w != 0.0 || lensA[1].w != 0.0 || lensA[2].w != 0.0 || lensA[3].w != 0.0;
  vec3 col;
  vec2 uvG = uv;
  if (lensing) {
    vec2 uR = lensUV(uv, 1.08); uvG = lensUV(uv, 1.0); vec2 uB = lensUV(uv, 0.92);
    if (aberration > 0.001) { vec2 off = (uv - 0.5) * aberration * 0.02; uR += off; uB -= off; }
    col.r = sceneAt(uR, second).r;
    col.g = sceneAt(uvG, second).g;
    col.b = sceneAt(uB, second).b;
  } else if (aberration > 0.001) {
    vec2 off = (uv - 0.5) * aberration * 0.02;
    col.r = sceneAt(uv + off, second).r;
    col.g = sceneAt(uv, second).g;
    col.b = sceneAt(uv - off, second).b;
  } else {
    col = sceneAt(uv, second);
  }
  if (zoomBlur > 0.001) {
    vec2 d = (uvG - speedFocus);
    vec3 acc = col;
    for (int i = 1; i < 8; i++) {
      float k = float(i) / 7.0;
      acc += sceneAt(uvG - d * k * zoomBlur * 0.12, second);
    }
    col = acc / 8.0;
  }

  // ink edges from the depth Laplacian
  float ink = 0.0;
  if (edges > 0.001 && !second) {
    vec2 px = 1.0 / internalRes;
    float o = max(1.0, floor(pxScale + 0.25));
    vec2 c = (floor(uvG * internalRes) + 0.5) * px;
    float uC = invZ(c);
    float uL = invZ(c - vec2(px.x * o, 0.0));
    float uR = invZ(c + vec2(px.x * o, 0.0));
    float uD = invZ(c - vec2(0.0, px.y * o));
    float uU = invZ(c + vec2(0.0, px.y * o));
    float lap = (uL + uR - 2.0 * uC) + (uU + uD - 2.0 * uC);
    float rel = lap / max(uC, 1e-6);
    float zC = 1.0 / max(uC, 1e-6);
    // the near side of a silhouette carries the full line, the far side a lighter one
    float near = smoothstep(0.035, 0.12, -rel);
    float far = smoothstep(0.06, 0.25, rel) * mix(0.4, 1.0, smoothstep(0.25, 0.6, rel));
    ink = max(near, far);
    // lines thin out with distance and vanish into the haze
    ink *= 1.0 - smoothstep(180.0, 900.0, zC);
    // the sky has no depth
    if (uC < 1.0 / (nearFar.y * 0.98)) ink *= 0.0;
    ink *= edges;
  }

  vec3 bloom = texture2D(tBloom, uvG).rgb;
  col += bloom * bloomStrength;
  col *= exposure;
  col = aces(col);
  col = col * tint + lift * (1.0 - col);
  float l = luma(col);
  col = mix(vec3(l), col, saturation);
  col = (col - 0.5) * contrast + 0.5;
  col = clamp(col, 0.0, 1.0);

  // ink lines: coloured ink (a darker version of what's under it) in colour, black in manga
  vec3 inked = mix(col * col * 0.22, vec3(0.03, 0.025, 0.035), 0.55);
  col = mix(col, inked, ink * (1.0 - manga));

  if (manga > 0.001) {
    vec2 fp = uvG * outRes;
    vec3 m = mangaTone(col, fp);
    // brightness edges ink the glowing effects too
    vec2 e = 1.5 / outRes;
    float lx = luma(sceneAt(uvG + vec2(e.x, 0.0), second)) - luma(sceneAt(uvG - vec2(e.x, 0.0), second));
    float ly = luma(sceneAt(uvG + vec2(0.0, e.y), second)) - luma(sceneAt(uvG - vec2(0.0, e.y), second));
    float le = smoothstep(0.25, 0.6, length(vec2(lx, ly)) / (0.2 + l));
    m = mix(m, vec3(0.04), max(ink, le * 0.85));
    col = mix(col, m, manga);
  }

  if (speed > 0.001) {
    float sl = speedLines(uv) * speed;
    vec3 lc = mix(vec3(0.02), vec3(1.0), speedWhite);
    col = mix(col, lc, clamp(sl, 0.0, 1.0) * (speedWhite > 0.5 ? 0.85 : 0.92));
  }

  if (cutLine > 0.001 && !second) {
    // a bright core between two ink edges, like a cut drawn across the panel
    float s = cutDist(uvG);
    float core = exp(-s * s);
    float rim = max(exp(-s * s / 6.0) - core, 0.0);
    float glow = exp(-s * s / 60.0);
    float lum = luma(cutColor);
    col = mix(col, vec3(0.02, 0.015, 0.02), clamp(rim * cutLine * 1.6, 0.0, 1.0));
    col = mix(col, cutColor, clamp(core * cutLine * 1.2, 0.0, 1.0));
    col += cutColor * glow * cutLine * 0.25 * smoothstep(0.3, 0.9, lum + 0.4);
  }

  col += flashColor * flash;
  if (impact > 0.001) {
    float il = luma(col);
    vec3 imp = mix(impactColor * 1.1, vec3(0.02, 0.012, 0.03), smoothstep(0.3, 0.52, il));
    col = mix(col, imp, clamp(impact, 0.0, 1.0));
  }
  vec2 vd = (uv - 0.5) * asp;
  float r = length(vd);
  col *= 1.0 - vignette * smoothstep(0.4, 1.1, r);
  if (damage > 0.001) {
    float edge = smoothstep(0.25, 0.95, r);
    col = mix(col, col * vec3(1.0, 0.4, 0.35), damage * 0.3);
    col = mix(col, vec3(0.5, 0.0, 0.02), damage * edge * 0.8);
  }
  if (heal > 0.001) {
    float edge = smoothstep(0.35, 1.0, r);
    col = mix(col, vec3(0.75, 1.0, 0.95), heal * edge * 0.3);
  }
  float n = hash(floor(vUv * outRes) + fract(time * 13.7) * 91.0) - 0.5;
  col += n * (grain + 0.004);

  if (slice > 0.0001) {
    // white-hot seam, then the gap between the halves
    float k = smoothstep(0.0, 1.0, slice);
    float gap = k * 0.02;
    float seam = exp(-pow(sliceDist / (0.004 + gap * 0.4), 2.0)) * (1.0 - k * 0.6);
    col = mix(col, vec3(1.0, 0.98, 0.95), clamp(seam * 1.5, 0.0, 1.0));
    if (sliceDist < gap) col = vec3(0.0);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
  }
  if (split > 0.001) {
    // the split is a panel gutter: paper between two ink rules
    vec2 sn = vec2(cos(splitAngle), sin(splitAngle));
    float dpx = abs(dot((vUv - 0.5) * asp, sn) - splitPos) * outRes.y;
    float px1 = max(1.0, outRes.y / 1080.0);
    float gw = 4.0 * px1;
    float bw = 2.5 * px1;
    vec3 gut = dpx < gw ? vec3(0.96, 0.95, 0.92) : vec3(0.02);
    float m = 1.0 - smoothstep(gw + bw - 0.75, gw + bw + 0.75, dpx);
    col = mix(col, gut, m * clamp(split, 0.0, 1.0));
  }
  if (letterbox > 0.001) {
    float bar = 0.5 - letterbox * 0.115;
    if (abs(vUv.y - 0.5) > bar) col = vec3(0.0);
  }
  if (fade > 0.0) col = mix(col, vec3(0.0), clamp(fade, 0.0, 1.0));
  else if (fade < 0.0) col = mix(col, vec3(1.0), clamp(-fade, 0.0, 1.0));
  gl_FragColor = vec4(toSRGB(col), 1.0);
}`;
