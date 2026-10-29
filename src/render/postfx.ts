// Post-processing: HDR default pipeline (ACES tone mapping tuned for golden hour, bloom on
// HDR emissive, FXAA, subtle grain / vignette / chromatic aberration), SSAO2 at metre
// scale (quality gated), an optional PS2 output mode (≈448-line internal resolution with
// nearest-neighbour upscaling, 15-bit colour + 4×4 Bayer dithering, faint interlace),
// trauma-based camera shake and full-screen flashes, and the quality resolution scale.
//
// Pass order on the camera: [SSAO2 …] → [bloom, image processing, FXAA] → composite (grain,
// chromatic aberration, PS2, flash). Grain and aberration live in the composite pass rather
// than as two more full-resolution half-float pipeline passes; the 16-sample SSAO pass renders
// at half resolution (Babylon hard-codes it to full size; its first blur halves it anyway, and
// the full-resolution bilateral blur upsamples with depth awareness).
// The DefaultRenderingPipeline re-appends its post-processes whenever it rebuilds, so the
// composite pass is moved back to the end from the pipeline's onBuildObservable.

import {
  Constants,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  SSAO2RenderingPipeline,
  type Camera,
  type Engine,
  type Observer,
  type PostProcess,
  type Scene,
} from "@babylonjs/core";
import type { QualityPreset, Settings } from "../core/settings.ts";
import type { Vec3 } from "../geom/vec.ts";
import type { IPostFX } from "./contracts.ts";
import { FlashModel, ShakeModel } from "./env/shake.ts";
import { createCompositePass, type CompositeState } from "./env/compositePass.ts";

export interface PostTuning {
  exposure: number;
  contrast: number;
  bloomThreshold: number;
  bloomWeight: number;
  bloomKernel: number;
  bloomScale: number;
  vignetteWeight: number;
  grainIntensity: number;
  chromaticAberration: number;
  ssaoRadius: number;
  ssaoStrength: number;
  /** Target internal height of PS2 mode (PS2 games rendered 448 interlaced lines). */
  ps2Lines: number;
  ps2Interlace: number;
}

export const DEFAULT_POST_TUNING: PostTuning = {
  exposure: 1.3,
  contrast: 1.12,
  bloomThreshold: 0.95,
  bloomWeight: 0.32,
  bloomKernel: 72,
  bloomScale: 0.5,
  vignetteWeight: 1.6,
  grainIntensity: 3,
  chromaticAberration: 5,
  ssaoRadius: 0.55,
  ssaoStrength: 1.15,
  ps2Lines: 448,
  ps2Interlace: 0.07,
};

export class PostFX implements IPostFX {
  readonly scene: Scene;
  readonly camera: Camera;
  readonly settings: Settings;
  readonly tuning: PostTuning;
  pipeline: DefaultRenderingPipeline | null = null;
  ssao: SSAO2RenderingPipeline | null = null;

  private readonly engine: Engine;
  private readonly shakeModel = new ShakeModel();
  private readonly flashModel = new FlashModel();
  private readonly shakeOut: { pos: Vec3; rot: Vec3 };
  private readonly composite: PostProcess;
  private readonly compositeState: CompositeState;
  private buildObserver: Observer<DefaultRenderingPipeline> | null = null;
  private resizeObserver: Observer<unknown> | null = null;
  private quality: QualityPreset;
  private ps2: boolean;
  private readonly baseScaling: number;
  private canvasStyleBackup: string | null = null;
  private disposed = false;

  constructor(scene: Scene, camera: Camera, settings: Settings, tuning: Partial<PostTuning> = {}) {
    this.scene = scene;
    this.camera = camera;
    this.settings = settings;
    this.tuning = { ...DEFAULT_POST_TUNING, ...tuning };
    this.engine = scene.getEngine() as Engine;
    this.baseScaling = this.engine.getHardwareScalingLevel() || 1;
    this.quality = settings.quality;
    this.ps2 = !!settings.data.ps2Mode;
    this.shakeOut = { pos: this.shakeModel.pos, rot: this.shakeModel.rot };
    this.compositeState = {
      ps2: this.ps2,
      levels: 31,
      interlace: this.tuning.ps2Interlace,
      flashR: 1,
      flashG: 1,
      flashB: 1,
      flashA: 0,
      grain: 0,
      grainAnimated: true,
      aberration: 0,
      aberrationRadial: 1.2,
    };

    this.configureImageProcessing();
    this.buildStack();
    // The composite pass is created after the pipelines so it starts last.
    this.composite = createCompositePass(camera, this.engine, this.compositeState);
    this.applyScaling();
    this.resizeObserver = this.engine.onResizeObservable.add(() => {
      if (this.ps2) this.applyScaling();
    }) as Observer<unknown>;
  }

  // ------------------------------------------------------------------ IPostFX

  setPS2(on: boolean): void {
    if (this.ps2 === on) return;
    this.ps2 = on;
    this.compositeState.ps2 = on;
    this.configureImageProcessing();
    this.configurePipeline();
    this.applyScaling();
  }

  applyQuality(q: QualityPreset): void {
    const rebuild = q.ssao !== this.quality.ssao;
    this.quality = q;
    if (rebuild) this.buildStack();
    else this.configurePipeline();
    this.applyScaling();
  }

  shake(trauma: number): void {
    this.shakeModel.add(trauma);
  }

  getShake(): { pos: Vec3; rot: Vec3 } {
    return this.shakeOut;
  }

  flash(intensity: number, color = 0xffffff): void {
    this.flashModel.trigger(intensity, color);
  }

  update(dt: number): void {
    const scale = this.settings.data.cameraShake;
    this.shakeModel.update(dt, typeof scale === "number" ? scale : 1);
    this.flashModel.update(dt);
    const s = this.compositeState;
    s.flashA = this.flashModel.alpha;
    s.flashR = this.flashModel.color.x;
    s.flashG = this.flashModel.color.y;
    s.flashB = this.flashModel.color.z;
  }

  // ------------------------------------------------------------------ extras

  get ps2Mode(): boolean {
    return this.ps2;
  }

  /** Current hardware scaling level (render px = CSS px / level). */
  get scalingLevel(): number {
    return this.engine.getHardwareScalingLevel();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.resizeObserver) this.engine.onResizeObservable.remove(this.resizeObserver as never);
    this.ssao?.dispose();
    this.pipeline?.dispose();
    this.composite.dispose(this.camera);
    this.setCanvasPixelated(false);
    this.engine.setHardwareScalingLevel(this.baseScaling);
  }

  // ------------------------------------------------------------------ internals

  private configureImageProcessing(): void {
    const ip = this.scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = this.tuning.exposure;
    ip.contrast = this.tuning.contrast;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = this.tuning.vignetteWeight;
    ip.vignetteStretch = 0.15;
    ip.vignetteCameraFov = this.camera.fov || 1.3;
    ip.vignetteColor.set(0.02, 0.012, 0.008, 0);
    ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
    // Fine noise dither against sky banding; PS2 mode uses its own ordered dither.
    ip.ditheringEnabled = !this.ps2;
    ip.ditheringIntensity = 1.0 / 255.0;
  }

  /** (Re)create SSAO2 (first in the chain) and the default pipeline. */
  private buildStack(): void {
    if (this.buildObserver && this.pipeline) this.pipeline.onBuildObservable.remove(this.buildObserver);
    this.buildObserver = null;
    this.ssao?.dispose();
    this.ssao = null;
    this.pipeline?.dispose();
    this.pipeline = null;

    const q = this.quality;
    if (q.ssao && SSAO2RenderingPipeline.IsSupported) {
      // HALF_FLOAT keeps the HDR scene colour intact for bloom/tone mapping downstream.
      const ssao = new SSAO2RenderingPipeline("envSSAO", this.scene, { ssaoRatio: q.resolutionScale >= 1 ? 0.5 : 0.75, blurRatio: 1 }, [this.camera], false, Constants.TEXTURETYPE_HALF_FLOAT);
      ssao.radius = this.tuning.ssaoRadius;
      ssao.totalStrength = this.tuning.ssaoStrength;
      ssao.base = 0.12;
      ssao.samples = 16;
      ssao.maxZ = 40; // interiors only: the far city is untouched
      ssao.minZAspect = 0.5;
      ssao.epsilon = 0.03;
      ssao.expensiveBlur = true;
      ssao.bilateralSamples = 16;
      ssao.bilateralSoften = 0.08;
      ssao.bilateralTolerance = 0.002;
      halveSSAOPass(ssao);
      this.ssao = ssao;
    }

    const p = new DefaultRenderingPipeline("envPost", true, this.scene, [this.camera], false);
    this.pipeline = p;
    this.buildObserver = p.onBuildObservable.add(() => this.keepCompositeLast());
    this.configurePipeline();
    // A rebuilt stack (quality change) must keep the composite pass at the end.
    this.keepCompositeLast();
  }

  private configurePipeline(): void {
    const p = this.pipeline;
    if (!p) return;
    const q = this.quality;
    const t = this.tuning;
    p.samples = 1;
    p.imageProcessingEnabled = true;
    p.bloomEnabled = q.bloom;
    p.bloomThreshold = t.bloomThreshold;
    p.bloomWeight = this.ps2 ? t.bloomWeight * 0.8 : t.bloomWeight;
    p.bloomKernel = t.bloomKernel;
    p.bloomScale = t.bloomScale;
    p.fxaaEnabled = q.fxaa && !this.ps2;
    // grain + chromatic aberration are applied by the composite pass (two passes fewer)
    p.grainEnabled = false;
    p.chromaticAberrationEnabled = false;
    const cs = this.compositeState;
    cs.grain = this.ps2 ? 0 : Math.max(0, t.grainIntensity);
    cs.grainAnimated = true;
    cs.aberration = this.ps2 ? 0 : Math.max(0, t.chromaticAberration);
    cs.aberrationRadial = 1.2;
    p.sharpenEnabled = false;
    p.depthOfFieldEnabled = false;
    p.prepare();
  }

  /** Move the composite pass to the end of the camera's chain (pipelines append on rebuild). */
  private keepCompositeLast(): void {
    const pp = this.composite as PostProcess | undefined;
    if (!pp) return; // constructor: composite not created yet (it is attached last anyway)
    const list = this.camera._postProcesses;
    let last = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]) {
        last = i;
        break;
      }
    }
    if (last >= 0 && list[last] === pp) return;
    this.camera.detachPostProcess(pp);
    this.camera.attachPostProcess(pp);
  }

  private applyScaling(): void {
    const scale = Math.max(0.25, Math.min(2, this.quality.resolutionScale || 1));
    let level = this.baseScaling / scale;
    if (this.ps2) {
      const canvas = this.engine.getRenderingCanvas();
      const cssH = canvas ? canvas.clientHeight || canvas.height : 0;
      if (cssH > 0) level = Math.max(this.baseScaling, cssH / this.tuning.ps2Lines);
    }
    if (Math.abs(this.engine.getHardwareScalingLevel() - level) > 1e-4) this.engine.setHardwareScalingLevel(level);
    this.setCanvasPixelated(this.ps2);
  }

  private setCanvasPixelated(on: boolean): void {
    const canvas = this.engine.getRenderingCanvas();
    if (!canvas || !canvas.style) return;
    if (on) {
      if (this.canvasStyleBackup === null) this.canvasStyleBackup = canvas.style.imageRendering || "";
      canvas.style.imageRendering = "pixelated";
    } else if (this.canvasStyleBackup !== null) {
      canvas.style.imageRendering = this.canvasStyleBackup;
      this.canvasStyleBackup = null;
    }
  }
}

/**
 * Render SSAO2's sampling pass at half resolution. Babylon 9 creates it at ratio 1.0 whatever
 * `ssaoRatio` says, while its horizontal blur already runs at `ssaoRatio` (0.5) and the vertical
 * bilateral blur upsamples to full size against full-resolution depth, so the full-size AO was
 * mostly averaged away: a quarter of the fragments for practically the same occlusion.
 */
function halveSSAOPass(ssao: SSAO2RenderingPipeline): void {
  const pp = (ssao as unknown as { _ssaoPostProcess?: { _options?: unknown } })._ssaoPostProcess;
  if (pp && typeof pp._options === "number") pp._options = 0.5;
}
