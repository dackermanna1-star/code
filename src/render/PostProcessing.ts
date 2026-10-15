// Post-processing: pmndrs `postprocessing` EffectComposer (three r186 is inside its peer range >=0.168 <0.187)
// with N8AO SSAO, bloom, ACES filmic tone mapping, a filmic grade (natural, slightly desaturated, warm sun / cool shadows),
// vignette, SMAA/FXAA and an optional ADS depth of field. Everything is driven by the graphics settings and can be
// toggled live; with post-processing off, three's built-in ACES tone mapping is used.
import * as THREE from 'three';
import {
  BloomEffect,
  DepthOfFieldEffect,
  Effect,
  EffectComposer,
  EffectPass,
  FXAAEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { GameContext } from '../core/GameContext';
import type { GraphicsSettings } from '../core/Settings';

const gradeFragment = /* glsl */ `
uniform float saturation;
uniform float contrast;
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float warmth;
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
  vec3 c = max( inputColor.rgb, 0.0 );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = mix( vec3( l ), c, saturation );
  c *= mix( shadowTint, highlightTint, smoothstep( 0.03, 0.55, l ) );
  c *= vec3( 1.0 + warmth * 0.04, 1.0, 1.0 - warmth * 0.05 );
  vec3 p = pow( c, vec3( 1.0 / 2.2 ) );
  p = ( p - 0.5 ) * contrast + 0.5;
  outputColor = vec4( pow( max( p, 0.0 ), vec3( 2.2 ) ), inputColor.a );
}
`;

/** Filmic color grade applied after tone mapping. */
export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', gradeFragment, {
      uniforms: new Map<string, THREE.Uniform>([
        ['saturation', new THREE.Uniform(0.9)],
        ['contrast', new THREE.Uniform(1.06)],
        ['shadowTint', new THREE.Uniform(new THREE.Vector3(0.97, 0.995, 1.04))],
        ['highlightTint', new THREE.Uniform(new THREE.Vector3(1.03, 1.0, 0.96))],
        ['warmth', new THREE.Uniform(0.5)],
      ]),
    });
  }
}

export class PostProcessing {
  readonly composer: EffectComposer;
  readonly renderPass: RenderPass;
  readonly aoPass: N8AOPostPass;
  readonly bloom: BloomEffect;
  readonly toneMapping: ToneMappingEffect;
  readonly grade: GradeEffect;
  readonly vignette: VignetteEffect;
  readonly dof: DepthOfFieldEffect;
  readonly dofPass: EffectPass;
  readonly mainPass: EffectPass;
  private aaPass: EffectPass | null = null;
  private aaMode: GraphicsSettings['antialias'] | null = null;
  enabled = true;
  private dofAllowed = true;
  private manualFocus: number | null = null;
  private dofAmount = 0;
  private focusTimer = 0;
  private focusDist = 50;

  constructor(
    private readonly ctx: GameContext,
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.aoPass = new N8AOPostPass(scene, camera, size.x, size.y);
    const c = this.aoPass.configuration;
    c.aoRadius = 2.2;
    c.distanceFalloff = 1.0;
    c.intensity = 2.4;
    c.aoSamples = 12;
    c.denoiseSamples = 6;
    c.denoiseRadius = 10;
    c.halfRes = true;
    c.gammaCorrection = false;
    // Water/roads are transparent but write or sit on depth; skip N8AO's extra transparency scene pass.
    c.transparencyAware = false;
    this.composer.addPass(this.aoPass);
    this.dof = new DepthOfFieldEffect(camera, { worldFocusDistance: 50, worldFocusRange: 30, bokehScale: 2.5, resolutionScale: 0.5 });
    this.dofPass = new EffectPass(camera, this.dof);
    this.dofPass.enabled = false;
    this.composer.addPass(this.dofPass);
    this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.35, intensity: 0.32, radius: 0.72 });
    this.toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.grade = new GradeEffect();
    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
    this.mainPass = new EffectPass(camera, this.bloom, this.toneMapping, this.grade, this.vignette);
    this.composer.addPass(this.mainPass);
    ctx.engine.onResize(() => this.resize());
    this.resize();
  }

  resize(): void {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(s.x / this.renderer.getPixelRatio(), s.y / this.renderer.getPixelRatio(), false);
  }

  applySettings(g: GraphicsSettings): void {
    this.enabled = g.postProcessing;
    this.aoPass.enabled = g.ssao;
    this.aoPass.configuration.halfRes = g.preset !== 'ultra';
    this.bloom.intensity = g.bloom ? 0.32 : 0;
    this.dofAllowed = g.effectsQuality > 0;
    this.setAA(g.antialias);
  }

  private setAA(mode: GraphicsSettings['antialias']): void {
    if (mode === this.aaMode) return;
    this.aaMode = mode;
    if (this.aaPass) {
      this.composer.removePass(this.aaPass);
      this.aaPass.dispose();
      this.aaPass = null;
    }
    const cam = this.renderPass.mainCamera;
    if (mode === 'smaa') this.aaPass = new EffectPass(cam, new SMAAEffect({ preset: SMAAPreset.HIGH }));
    else if (mode === 'fxaa') this.aaPass = new EffectPass(cam, new FXAAEffect());
    if (this.aaPass) this.composer.addPass(this.aaPass);
  }

  /** Manual DOF focus (meters) for ADS; null = automatic from ctx.cameraRig.adsBlend. */
  setManualFocus(d: number | null): void {
    this.manualFocus = d;
  }

  private updateDof(camera: THREE.PerspectiveCamera, dt: number): void {
    const rig = this.ctx.cameraRig as { adsBlend?: number } | undefined;
    const ads = this.manualFocus !== null ? 1 : rig?.adsBlend ?? 0;
    this.dofAmount += (ads - this.dofAmount) * Math.min(1, dt * 8);
    const on = this.dofAllowed && this.dofAmount > 0.05;
    this.dofPass.enabled = on;
    if (!on) return;
    this.focusTimer -= dt;
    if (this.manualFocus !== null) this.focusDist = this.manualFocus;
    else if (this.focusTimer <= 0 && this.ctx.physics?.ready) {
      this.focusTimer = 0.1;
      const dir = camera.getWorldDirection(new THREE.Vector3());
      const hit = this.ctx.physics.raycast(camera.position, dir, 1500);
      this.focusDist = hit ? Math.max(2, hit.distance) : 400;
    }
    this.dof.cocMaterial.worldFocusDistance = this.focusDist;
    this.dof.cocMaterial.worldFocusRange = Math.max(8, this.focusDist * 0.8);
    this.dof.bokehScale = 2.5 * this.dofAmount;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, dt: number, exposure: number): void {
    const bright = this.ctx.settings.data.graphics.brightness ?? 1;
    renderer.toneMappingExposure = exposure * bright;
    if (!this.enabled) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    renderer.toneMapping = THREE.NoToneMapping;
    if (this.renderPass.mainCamera !== camera) {
      this.renderPass.mainCamera = camera;
      this.composer.setMainCamera(camera);
    }
    this.updateDof(camera, dt);
    this.composer.render(dt);
  }
}
