import * as THREE from 'three';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// =============================================================================
// RENDER PIPELINE
//
//  1. OUTSIDE pass:  app.scenes.outside (sky, terrain, airports, clouds, own
//     wing/engines, other traffic) rendered with app.outsideCamera (near 0.25 m,
//     far 450 km, reversed float depth when available) into an HDR target that
//     carries a depth texture.
//  2. OUTSIDE POST passes (registered with pipeline.addOutsidePass): e.g. the
//     volumetric clouds. Each gets the scene colour + depth and may write a new
//     colour target (ping-pong).
//  3. CABIN pass: app.scenes.cabin rendered on top with a cleared depth buffer
//     (skipped in cinematic exterior views). Windows are transparent glass, so
//     the outside image shows through them.
//  4. Auto-exposure (GPU luminance + temporal adaptation), bloom, tone mapping
//     (ACES fitted), vignette, grain, FXAA -> canvas.
//
// Outside pass API:
//   app.pipeline.addOutsidePass({ name, order, enabled: true,
//       render({ renderer, input, output, depthTexture, camera, app, dt, reversedDepth }) => boolean })
//   Return true if you wrote `output` (it then becomes the current colour target).
//   Never sample `input`'s depthTexture while rendering into `input` (feedback loop).
//
// GLSL helper for linear depth: pipeline.depthGLSL (string) defines
//   float linearizeDepth(float d, float near, float far)  // handles reversed depth
// =============================================================================

const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class Pipeline {
  constructor(app) {
    this.app = app;
    this.renderer = app.renderer;
    this.reversedDepth = !!(this.renderer.capabilities.reversedDepthBuffer && app._wantReversedDepth);
    this.outsidePasses = [];
    this.stats = { outsideMs: 0, cabinMs: 0 };
    this.exposureBias = 0;          // EV bias, settable
    this.manualExposure = 1.0;
    this.minExposure = 0.08;
    this.maxExposure = 5.0;
    this.adaptSpeedUp = 1.6;        // getting brighter (eyes adapt to bright quickly)
    this.adaptSpeedDown = 0.9;
    this.bloomStrength = 0.06;
    this.bloomThreshold = 1.2;
    this.renderCabin = true;
    this.renderOutside = true;
    this.clearColor = new THREE.Color(0x000000);

    this.depthGLSL = /* glsl */`
float linearizeDepth(float d, float near, float far) {
  ${this.reversedDepth ? 'return (near * far) / (d * (far - near) + near);' : 'float z = d * 2.0 - 1.0; return (2.0 * near * far) / (far + near - z * (far - near));'}
}`;

    this._fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this._fsMesh = new THREE.Mesh(tri, null);
    this._fsMesh.frustumCulled = false;
    this._fsScene = new THREE.Scene();
    this._fsScene.add(this._fsMesh);

    this._makeMaterials();
    this.setSize(window.innerWidth, window.innerHeight);
  }

  /** Draw a full-screen triangle with `material` into `target` (null = canvas). */
  fullscreen(material, target) {
    this._fsMesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this._fsScene, this._fsCam);
  }

  addOutsidePass(pass) {
    const p = { order: 0, enabled: true, ...pass };
    this.outsidePasses.push(p);
    this.outsidePasses.sort((a, b) => a.order - b.order);
    return p;
  }
  removeOutsidePass(p) { this.outsidePasses = this.outsidePasses.filter((x) => x !== p); }

  _rt(w, h, opts = {}) {
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, ...opts,
    });
  }

  setSize(w, h) {
    const q = this.app.quality;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatioCap) * (this.app.settings.get('resolutionScale') || 1);
    this.width = Math.max(1, Math.floor(w * pr));
    this.height = Math.max(1, Math.floor(h * pr));
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    const W = this.width, H = this.height;
    const samples = q.msaa || 0;
    const dispose = (rt) => rt && rt.dispose();
    dispose(this.rtScene); dispose(this.rtAlt); dispose(this.rtAlt2); dispose(this.rtLdr); dispose(this.rtLum);
    this.rtAlt2 = null;
    this._samples = samples;
    (this.bloomRTs || []).forEach(dispose);

    const depthTexture = new THREE.DepthTexture(W, H, this.reversedDepth ? THREE.FloatType : THREE.UnsignedIntType);
    depthTexture.format = THREE.DepthFormat;
    this.rtScene = this._rt(W, H, { depthBuffer: true, depthTexture, samples });
    this.rtScene.texture.name = 'scene';
    this.rtAlt = this._rt(W, H, { depthBuffer: true, samples });
    this.rtLdr = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rtLum = this._rt(128, 64, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    if (!this.rtAdapt) {
      this.rtAdapt = [this._rt(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }),
        this._rt(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })];
      this._adaptIdx = 0;
      this._adaptPrimed = false;
    }
    // bloom mip chain
    this.bloomRTs = [];
    let bw = Math.max(1, W >> 1), bh = Math.max(1, H >> 1);
    for (let i = 0; i < (q.bloomLevels || 5); i++) {
      this.bloomRTs.push(this._rt(bw, bh));
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    }
    this.fxaaMat.uniforms.resolution.value.set(1 / W, 1 / H);
    this.app.events?.emit('pipeline:resize', { width: W, height: H });
  }

  _alt2() {
    if (!this.rtAlt2) this.rtAlt2 = this._rt(this.width, this.height, { depthBuffer: true, samples: this._samples });
    return this.rtAlt2;
  }

  _makeMaterials() {
    const fs = (fragmentShader, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, ...extra });

    this.lumMat = fs(/* glsl */`
      uniform sampler2D tScene; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        // centre-weighted metering
        vec2 d = (vUv - 0.5) * vec2(1.6, 1.0);
        float w = exp(-dot(d, d) * 3.0) * 0.85 + 0.15;
        gl_FragColor = vec4(log(max(l, 1e-4)) * w, w, 0.0, 1.0);
      }`, { tScene: { value: null } });

    this.adaptMat = fs(/* glsl */`
      uniform sampler2D tLum; uniform sampler2D tPrev; uniform float uDt; uniform float uUp; uniform float uDown; uniform float uPrimed;
      varying vec2 vUv;
      void main() {
        vec2 lw = textureLod(tLum, vec2(0.5), 12.0).rg;
        float avg = exp(lw.r / max(lw.g, 1e-4));
        float prev = texture2D(tPrev, vec2(0.5)).r;
        float speed = avg > prev ? uUp : uDown;
        float a = uPrimed > 0.5 ? (1.0 - exp(-uDt * speed)) : 1.0;
        gl_FragColor = vec4(mix(prev, avg, a), 0.0, 0.0, 1.0);
      }`, { tLum: { value: null }, tPrev: { value: null }, uDt: { value: 0.016 }, uUp: { value: 1.5 }, uDown: { value: 0.9 }, uPrimed: { value: 0 } });

    this.downMat = fs(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uFirst; varying vec2 vUv;
      vec3 prefilter(vec3 c) {
        float br = max(c.r, max(c.g, c.b));
        float knee = uThreshold * 0.5;
        float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
        soft = soft * soft / (4.0 * knee + 1e-4);
        float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
        return c * contrib;
      }
      void main() {
        vec3 a = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
        vec3 b = texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
        vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
        vec3 d = texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
        vec3 e = texture2D(tSrc, vUv).rgb;
        vec3 col = e * 0.5 + (a + b + c + d) * 0.125;
        if (uFirst > 0.5) col = prefilter(min(col, vec3(60000.0)));
        gl_FragColor = vec4(col, 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 }, uFirst: { value: 0 } });

    this.upMat = fs(/* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius; varying vec2 vUv;
      void main() {
        vec2 o = uTexel * uRadius;
        vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
        s += texture2D(tSrc, vUv + vec2(-o.x, 0.0)).rgb * 2.0;
        s += texture2D(tSrc, vUv + vec2( o.x, 0.0)).rgb * 2.0;
        s += texture2D(tSrc, vUv + vec2(0.0, -o.y)).rgb * 2.0;
        s += texture2D(tSrc, vUv + vec2(0.0,  o.y)).rgb * 2.0;
        s += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb;
        s += texture2D(tSrc, vUv + vec2( o.x, -o.y)).rgb;
        s += texture2D(tSrc, vUv + vec2(-o.x,  o.y)).rgb;
        s += texture2D(tSrc, vUv + vec2( o.x,  o.y)).rgb;
        gl_FragColor = vec4(s / 16.0, 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 } },
    { blending: THREE.AdditiveBlending, transparent: true });

    this.compositeMat = fs(/* glsl */`
      uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tAdapt;
      uniform float uAuto; uniform float uManual; uniform float uBias; uniform float uMinE; uniform float uMaxE;
      uniform float uBloom; uniform float uVignette; uniform float uGrain; uniform float uTime;
      uniform vec3 uLift; uniform vec3 uGain; uniform float uSaturation; uniform float uFade;
      varying vec2 vUv;
      vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 acesFitted(vec3 c) {
        const mat3 ACESIn = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
        const mat3 ACESOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
        c = ACESIn * c; c = RRTAndODTFit(c); c = ACESOut * c; return clamp(c, 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 c = texture2D(tScene, vUv).rgb;
        vec3 b = texture2D(tBloom, vUv).rgb;
        float avg = texture2D(tAdapt, vec2(0.5)).r;
        float e = uAuto > 0.5 ? clamp(0.16 / max(avg, 1e-4), uMinE, uMaxE) : uManual;
        c = (c + b * uBloom) * e * exp2(uBias);
        c = acesFitted(c * 1.3);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSaturation);
        c = c * uGain + uLift * (1.0 - c);
        vec2 d = vUv - 0.5;
        c *= mix(1.0, smoothstep(0.85, 0.2, length(d * vec2(1.25, 1.0))), uVignette);
        c = toSRGB(clamp(c, 0.0, 1.0));
        c += (hash(vUv * 1024.0 + fract(uTime) * 61.0) - 0.5) * uGrain;
        c *= (1.0 - uFade);
        gl_FragColor = vec4(c, 1.0);
      }`, {
      tScene: { value: null }, tBloom: { value: null }, tAdapt: { value: null },
      uAuto: { value: 1 }, uManual: { value: 1 }, uBias: { value: 0 }, uMinE: { value: 0.1 }, uMaxE: { value: 4 },
      uBloom: { value: 0.06 }, uVignette: { value: 0.35 }, uGrain: { value: 0.012 }, uTime: { value: 0 },
      uLift: { value: new THREE.Vector3(0.004, 0.004, 0.006) }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uSaturation: { value: 1.04 }, uFade: { value: 0 },
    });

    this.fxaaMat = new THREE.ShaderMaterial({ ...FXAAShader, uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), depthTest: false, depthWrite: false });
    this.fxaaMat.uniforms.resolution.value = new THREE.Vector2(1 / 1024, 1 / 1024);

    this.copyMat = fs(/* glsl */`uniform sampler2D tSrc; varying vec2 vUv; void main() { gl_FragColor = texture2D(tSrc, vUv); }`, { tSrc: { value: null } });
  }

  /** Fade the whole frame to black (0..1) — used for skips / restarts. */
  set fade(v) { this.compositeMat.uniforms.uFade.value = v; }
  get fade() { return this.compositeMat.uniforms.uFade.value; }

  render(dt) {
    const app = this.app, r = this.renderer, s = app.settings;
    r.autoClear = false;
    r.info.autoReset = false;
    r.info.reset();
    const cam = app.camera, ocam = app.outsideCamera;

    // keep the outside camera glued to the main camera (same pose & FOV, different clip range)
    cam.updateMatrixWorld();
    ocam.position.copy(cam.position); ocam.quaternion.copy(cam.quaternion);
    if (ocam.fov !== cam.fov || ocam.aspect !== cam.aspect) { ocam.fov = cam.fov; ocam.aspect = cam.aspect; ocam.updateProjectionMatrix(); }
    ocam.updateMatrixWorld();

    // 1. outside
    r.setRenderTarget(this.rtScene);
    r.setClearColor(this.clearColor, 1);
    r.clear(true, true, true);
    if (this.renderOutside) r.render(app.scenes.outside, ocam);

    // 2. outside post passes (ping-pong between rtAlt / rtAlt2; rtScene keeps the depth texture)
    let cur = this.rtScene, k = 0;
    for (const p of this.outsidePasses) {
      if (!p.enabled) continue;
      const out = k % 2 === 0 ? this.rtAlt : this._alt2();
      let wrote = false;
      try {
        wrote = p.render({ renderer: r, input: cur, output: out, depthTexture: this.rtScene.depthTexture, camera: ocam, app, dt, reversedDepth: this.reversedDepth, pipeline: this });
      } catch (e) {
        console.error(`[pipeline] outside pass "${p.name}" failed; disabling`, e);
        p.enabled = false;
      }
      if (wrote) { cur = out; k++; }
    }
    // the cabin renders into whichever target is current (both have their own depth buffer)
    // 3. cabin
    if (this.renderCabin) {
      r.setRenderTarget(cur);
      r.clearDepth();
      r.render(app.scenes.cabin, cam);
    }
    this.current = cur;

    // 4a. exposure
    const auto = s.get('autoExposure');
    if (auto) {
      this.lumMat.uniforms.tScene.value = cur.texture;
      this.fullscreen(this.lumMat, this.rtLum);
      const prev = this.rtAdapt[this._adaptIdx], next = this.rtAdapt[1 - this._adaptIdx];
      this.adaptMat.uniforms.tLum.value = this.rtLum.texture;
      this.adaptMat.uniforms.tPrev.value = prev.texture;
      this.adaptMat.uniforms.uDt.value = Math.min(dt, 0.1);
      this.adaptMat.uniforms.uUp.value = this.adaptSpeedUp;
      this.adaptMat.uniforms.uDown.value = this.adaptSpeedDown;
      this.adaptMat.uniforms.uPrimed.value = this._adaptPrimed ? 1 : 0;
      this.fullscreen(this.adaptMat, next);
      this._adaptIdx = 1 - this._adaptIdx;
      this._adaptPrimed = true;
    }

    // 4b. bloom
    const useBloom = s.get('bloom') && this.bloomRTs.length > 0;
    if (useBloom) {
      let src = cur.texture, sw = this.width, sh = this.height;
      for (let i = 0; i < this.bloomRTs.length; i++) {
        const t = this.bloomRTs[i];
        this.downMat.uniforms.tSrc.value = src;
        this.downMat.uniforms.uTexel.value.set(1 / sw, 1 / sh);
        this.downMat.uniforms.uFirst.value = i === 0 ? 1 : 0;
        this.downMat.uniforms.uThreshold.value = this.bloomThreshold;
        r.setRenderTarget(t); r.clear(true, false, false);
        this.fullscreen(this.downMat, t);
        src = t.texture; sw = t.width; sh = t.height;
      }
      for (let i = this.bloomRTs.length - 1; i > 0; i--) {
        const src2 = this.bloomRTs[i], dst = this.bloomRTs[i - 1];
        this.upMat.uniforms.tSrc.value = src2.texture;
        this.upMat.uniforms.uTexel.value.set(1 / src2.width, 1 / src2.height);
        this.fullscreen(this.upMat, dst);
      }
    }

    // 4c. composite
    const cu = this.compositeMat.uniforms;
    cu.tScene.value = cur.texture;
    cu.tBloom.value = useBloom ? this.bloomRTs[0].texture : null;
    cu.uBloom.value = useBloom ? this.bloomStrength : 0;
    cu.tAdapt.value = this.rtAdapt[this._adaptIdx].texture;
    cu.uAuto.value = auto ? 1 : 0;
    cu.uManual.value = this.manualExposure;
    cu.uBias.value = this.exposureBias;
    cu.uMinE.value = this.minExposure; cu.uMaxE.value = this.maxExposure;
    cu.uVignette.value = s.get('vignette') ? 0.32 : 0;
    cu.uGrain.value = s.get('filmGrain') ? 0.010 : 0;
    cu.uTime.value = app.time;
    const fxaa = !(this.app.quality.msaa > 0);
    this.fullscreen(this.compositeMat, fxaa ? this.rtLdr : null);
    if (fxaa) {
      this.fxaaMat.uniforms.tDiffuse.value = this.rtLdr.texture;
      this.fullscreen(this.fxaaMat, null);
    }
    r.setRenderTarget(null);
  }
}
