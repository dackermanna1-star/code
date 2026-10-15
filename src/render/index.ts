// Render pipeline (owned by the World module): lighting + cascaded shadows, global height fog, post-processing,
// quality settings. Installed by installWorld(); other modules import only the helpers exported here.
import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { GraphicsSettings } from '../core/Settings';
import { Lighting } from './Lighting';
import { patchFogChunks } from './fog';
import { PostProcessing } from './PostProcessing';

export { HeightFog, HEIGHT_FOG_GLSL } from './fog';
export type { Lighting } from './Lighting';

export interface RenderPipeline {
  readonly lighting: Lighting;
  readonly post: PostProcessing;
  /** Scene-referred exposure from the environment (night/overcast adaptation). Final = this x brightness. */
  envExposure: number;
  applySettings(g: GraphicsSettings): void;
}

let pipeline: RenderPipeline | null = null;

export function getRenderPipeline(): RenderPipeline | null {
  return pipeline;
}

/**
 * Kept for API compatibility with CSM-based pipelines. Our cascaded sun shadows (three r186 SunLight path)
 * work for every built-in lit material automatically, so nothing needs to be registered. Returns the material.
 */
export function registerShadowMaterial<T extends THREE.Material>(material: T): T {
  return material;
}

/**
 * Optional ADS depth-of-field hook: focus distance in meters (null = off). The pipeline also reads
 * ctx.cameraRig.adsBlend automatically when available.
 */
export function setAdsDepthOfField(focusDistance: number | null): void {
  pipeline?.post.setManualFocus(focusDistance);
}

export function installRender(ctx: GameContext): RenderPipeline {
  if (pipeline) return pipeline;
  patchFogChunks();
  const renderer = ctx.engine.renderer;
  const lighting = new Lighting(ctx.scene, renderer);
  const post = new PostProcessing(ctx, renderer, ctx.scene, ctx.camera);
  const p: RenderPipeline = {
    lighting,
    post,
    envExposure: 1,
    applySettings(g) {
      lighting.applySettings(g);
      post.applySettings(g);
      if (Math.abs(ctx.engine.renderScale - g.renderScale) > 1e-3) ctx.engine.setRenderScale(g.renderScale);
      ctx.engine.maxFps = g.maxFps;
      ctx.assets.textureQuality = g.textureQuality;
    },
  };
  pipeline = p;
  ctx.engine.setRenderFn((r, scene, camera, dt) => post.render(r, scene, camera as THREE.PerspectiveCamera, dt, p.envExposure));
  p.applySettings(ctx.settings.data.graphics);
  ctx.events.on('settings:changed', ({ section }) => {
    if (section === 'graphics' || section === 'all') p.applySettings(ctx.settings.data.graphics);
  });
  return p;
}
