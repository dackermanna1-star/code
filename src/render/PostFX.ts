import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  BrightnessContrastEffect,
  DepthOfFieldEffect,
  Effect,
  EffectAttribute,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Screen-space heat shimmer masked to a rectangle (projected grill area). */
export class HeatHazeEffect extends Effect {
  constructor() {
    super(
      'HeatHazeEffect',
      /* glsl */ `
      uniform float uTime;
      uniform vec4 uRect;
      uniform float uStrength;
      void mainUv(inout vec2 uv) {
        if (uStrength <= 0.0) return;
        vec2 r = (uv - uRect.xy) / max(uRect.zw - uRect.xy, vec2(1e-4));
        float mask = smoothstep(0.0, 0.18, r.x) * smoothstep(1.0, 0.82, r.x) *
                     smoothstep(0.05, 0.45, r.y) * smoothstep(1.25, 0.7, r.y);
        if (mask <= 0.0) return;
        float t = uTime;
        float w1 = sin(uv.y * 160.0 - t * 7.0 + sin(uv.x * 40.0 + t * 1.3) * 2.2);
        float w2 = sin(uv.y * 97.0 - t * 5.1 + uv.x * 23.0);
        float w3 = sin(uv.x * 120.0 + t * 3.7 + uv.y * 30.0);
        uv.x += (w1 * 0.6 + w2 * 0.4) * 0.0011 * uStrength * mask;
        uv.y += w3 * 0.0007 * uStrength * mask;
      }`,
      {
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, THREE.Uniform>([
          ['uTime', new THREE.Uniform(0)],
          ['uRect', new THREE.Uniform(new THREE.Vector4(0, 0, 1, 1))],
          ['uStrength', new THREE.Uniform(0)],
        ]),
      },
    );
  }
  set time(v: number) {
    this.uniforms.get('uTime')!.value = v;
  }
  set strength(v: number) {
    this.uniforms.get('uStrength')!.value = v;
  }
  get rect(): THREE.Vector4 {
    return this.uniforms.get('uRect')!.value as THREE.Vector4;
  }
}

/**
 * Camera motion blur: reprojects each pixel's depth into the previous frame's
 * view and smears along the screen-space velocity. Only camera motion is
 * captured (the game's fast moments are camera moves), so there is no
 * velocity buffer. Its pass is switched on only while the camera moves fast.
 */
export class MotionBlurEffect extends Effect {
  private prevVP = new THREE.Matrix4();
  private currVP = new THREE.Matrix4();
  private hasPrev = false;
  /** blur length as a fraction of the frame's motion (shutter), 0 = off */
  intensity = 0;

  constructor(private cam: THREE.PerspectiveCamera) {
    super(
      'MotionBlurEffect',
      /* glsl */ `
      uniform mat4 uReproject;
      uniform float uStrength;
      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
        vec4 prev = uReproject * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec2 prevUv = prev.xy / prev.w * 0.5 + 0.5;
        vec2 vel = (uv - prevUv) * uStrength;
        float len = length(vel);
        if (len < 0.0008) { outputColor = inputColor; return; }
        vel *= min(1.0, 0.032 / len);
        // 9 taps centred on the pixel, jittered per pixel to hide banding
        float j = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        vec4 acc = inputColor;
        for (int i = 0; i < 8; i++) {
          float t = (float(i) + 0.5 + j * 0.8) / 8.0 - 0.5;
          acc += texture2D(inputBuffer, clamp(uv + vel * t, vec2(0.001), vec2(0.999)));
        }
        outputColor = acc / 9.0;
      }`,
      {
        attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, THREE.Uniform>([
          ['uReproject', new THREE.Uniform(new THREE.Matrix4())],
          ['uStrength', new THREE.Uniform(0)],
        ]),
      },
    );
  }

  /** Track the camera every frame (even while the pass is off). */
  track(): void {
    this.currVP.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse);
    if (!this.hasPrev) this.prevVP.copy(this.currVP);
    const reproj = this.uniforms.get('uReproject')!.value as THREE.Matrix4;
    reproj.copy(this.currVP).invert().premultiply(this.prevVP);
    this.uniforms.get('uStrength')!.value = this.intensity;
    this.prevVP.copy(this.currVP);
    this.hasPrev = true;
  }

  reset(): void {
    this.hasPrev = false;
  }
}

/** Subtle film grain + warm color grade + gentle split toning. */
export class GradeEffect extends Effect {
  constructor() {
    super(
      'GradeEffect',
      /* glsl */ `
      uniform float uTime;
      uniform float uGrain;
      uniform vec3 uShadowTint;
      uniform vec3 uHighlightTint;
      uniform float uFlash;
      uniform vec3 uFlashColor;
      float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c += uShadowTint * (1.0 - smoothstep(0.0, 0.45, l)) * 0.05;
        c += uHighlightTint * smoothstep(0.5, 1.0, l) * 0.04;
        float g = h12(uv * vec2(1920.0, 1080.0) + fract(uTime * 7.13) * 400.0) - 0.5;
        c += g * uGrain * (0.6 + 0.4 * (1.0 - l));
        c = mix(c, uFlashColor, uFlash);
        outputColor = vec4(c, inputColor.a);
      }`,
      {
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, THREE.Uniform>([
          ['uTime', new THREE.Uniform(0)],
          ['uGrain', new THREE.Uniform(0.009)],
          ['uShadowTint', new THREE.Uniform(new THREE.Vector3(0.1, 0.25, 0.45))],
          ['uHighlightTint', new THREE.Uniform(new THREE.Vector3(1.0, 0.7, 0.4))],
          ['uFlash', new THREE.Uniform(0)],
          ['uFlashColor', new THREE.Uniform(new THREE.Vector3(1, 1, 1))],
        ]),
      },
    );
  }
  set time(v: number) {
    this.uniforms.get('uTime')!.value = v;
  }
  set flash(v: number) {
    this.uniforms.get('uFlash')!.value = v;
  }
  setFlashColor(c: THREE.Color) {
    (this.uniforms.get('uFlashColor')!.value as THREE.Vector3).set(c.r, c.g, c.b);
  }
}

export interface PostSettings {
  ao: false | 'Performance' | 'Low' | 'Medium' | 'High';
  aoHalfRes: boolean;
  bloom: boolean;
  smaa: boolean;
  heatHaze: boolean;
  dof: boolean;
  motionBlur: boolean;
}

export class PostFX {
  composer: EffectComposer;
  renderPass: RenderPass;
  ao?: N8AOPostPass;
  bloom: BloomEffect;
  tone: ToneMappingEffect;
  vignette: VignetteEffect;
  heat: HeatHazeEffect;
  grade: GradeEffect;
  hueSat: HueSaturationEffect;
  bc: BrightnessContrastEffect;
  dof: DepthOfFieldEffect;
  smaa: SMAAEffect;
  motion: MotionBlurEffect;
  /** player preference (reduce motion turns it off) */
  motionAllowed = true;
  private motionPass: EffectPass;
  private camPos = new THREE.Vector3();
  private camQuat = new THREE.Quaternion();
  private motionT = 0;
  private heatPass: EffectPass;
  private mainPass: EffectPass;
  private dofPass: EffectPass;
  private smaaPass: EffectPass;
  settings: PostSettings;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    settings: PostSettings,
  ) {
    this.settings = { ...settings };
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.ao = new N8AOPostPass(scene, camera, size.x, size.y);
    this.ao.configuration.aoRadius = 0.45;
    this.ao.configuration.distanceFalloff = 1.0;
    this.ao.configuration.intensity = 2.2;
    this.ao.configuration.color = new THREE.Color(0x1a0f0a);
    this.ao.configuration.gammaCorrection = false;
    // Transparency-aware mode (auto-enabled when any material is transparent)
    // re-renders the whole scene twice more per frame; not worth it here.
    (this.ao as unknown as { autoDetectTransparency: boolean }).autoDetectTransparency = false;
    this.ao.configuration.transparencyAware = false;
    this.composer.addPass(this.ao);

    this.heat = new HeatHazeEffect();
    this.heatPass = new EffectPass(camera, this.heat);
    this.composer.addPass(this.heatPass);

    this.motion = new MotionBlurEffect(camera);
    this.motionPass = new EffectPass(camera, this.motion);
    this.motionPass.enabled = false;
    this.composer.addPass(this.motionPass);

    this.dof = new DepthOfFieldEffect(camera, {
      focusDistance: 1.2,
      focusRange: 0.9,
      bokehScale: 2.6,
      resolutionScale: 0.5,
    });
    this.dofPass = new EffectPass(camera, this.dof);
    this.dofPass.enabled = false;
    this.composer.addPass(this.dofPass);

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0.82,
      luminanceSmoothing: 0.25,
      intensity: 0.55,
      radius: 0.72,
    });
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
    this.grade = new GradeEffect();
    this.hueSat = new HueSaturationEffect({ saturation: 0.06, hue: 0 });
    this.bc = new BrightnessContrastEffect({ brightness: 0.0, contrast: 0.08 });
    this.mainPass = new EffectPass(camera, this.bloom, this.tone, this.hueSat, this.bc, this.vignette, this.grade);
    this.composer.addPass(this.mainPass);

    this.smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
    this.smaaPass = new EffectPass(camera, this.smaa);
    this.composer.addPass(this.smaaPass);

    this.apply(settings);
  }

  apply(s: PostSettings): void {
    this.settings = { ...s };
    if (this.ao) {
      this.ao.enabled = !!s.ao;
      if (s.ao) {
        this.ao.setQualityMode(s.ao);
        this.ao.configuration.halfRes = s.aoHalfRes;
      }
    }
    this.bloom.blendMode.opacity.value = s.bloom ? 1 : 0;
    this.smaaPass.enabled = s.smaa;
    this.heatPass.enabled = s.heatHaze;
    if (!s.dof) this.dofPass.enabled = false;
    this.fixRenderToScreen();
  }

  setDof(on: boolean): void {
    this.dofPass.enabled = on && this.settings.dof;
    this.fixRenderToScreen();
  }

  private fixRenderToScreen(): void {
    // Ensure exactly the last enabled pass renders to screen.
    const passes = this.composer.passes;
    let last = -1;
    for (let i = 0; i < passes.length; i++) if (passes[i].enabled) last = i;
    for (let i = 0; i < passes.length; i++) passes[i].renderToScreen = i === last;
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  render(dt: number): void {
    this.updateMotion(dt);
    this.composer.render(dt);
  }

  /** Enable the blur pass only while the camera is moving fast. */
  private updateMotion(dt: number): void {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const moved = cam.position.distanceTo(this.camPos);
    const turned = 2 * Math.acos(Math.min(1, Math.abs(cam.quaternion.dot(this.camQuat))));
    this.camPos.copy(cam.position);
    this.camQuat.copy(cam.quaternion);
    // rough screen fraction swept per second
    const speed = dt > 0 ? (turned / THREE.MathUtils.degToRad(cam.fov) + moved / 2.5) / dt : 0;
    const want = this.settings.motionBlur && this.motionAllowed && speed > 0.35;
    this.motionT = want ? 0.25 : Math.max(0, this.motionT - dt);
    // shutter: blur covers ~1/120 s of motion regardless of frame rate
    this.motion.intensity = dt > 0 ? clampNum((1 / 120) / dt, 0, 1) * (want ? 1 : this.motionT * 4) : 0;
    this.motion.track();
    const on = this.motionT > 0;
    if (on !== this.motionPass.enabled) {
      this.motionPass.enabled = on;
      this.fixRenderToScreen();
    }
  }
}
