import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  BrightnessContrastEffect,
  DepthOfFieldEffect,
  Effect,
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
    this.composer.addPass(this.ao);

    this.heat = new HeatHazeEffect();
    this.heatPass = new EffectPass(camera, this.heat);
    this.composer.addPass(this.heatPass);

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
    this.composer.render(dt);
  }
}
