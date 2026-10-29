// RenderSystem (src/core/context.ts) implementation: owns the camera, the texture-array world
// material + glass material, island batching, the reflection environment and the screens
// power state, and composes the render-env sub-systems (Lighting, PostFX, Exterior,
// Atmosphere) per src/render/contracts.ts, delegating the RenderSystem methods to them.
//
// Startup: createRender() → camera → lighting → textures (photos/procedural, progress) →
// materials/batcher → procedural interior environment → post-processing → exterior and
// atmosphere → quality/PS2 from settings. After the apartment is built, call
// captureEnvironment() once to replace the procedural environment with a real capture; a
// mains power change re-captures it automatically (the capture bakes the interior lights).
// Exterior/Atmosphere/PostFX failures degrade the look (console warning) instead of aborting
// startup; Lighting is required.

import { UniversalCamera, Vector3, type Engine, type Scene, type Material, type TransformNode, type AbstractMesh, type Light, type Observer } from "@babylonjs/core";
import type { RenderSystem, IslandMeshes } from "../core/context.ts";
import type { Settings, QualityPreset, SettingsData } from "../core/settings.ts";
import type { RenderGeom } from "../geom/meshgen.ts";
import type { Vec3 } from "../geom/vec.ts";
import { Lighting } from "./lighting.ts";
import { PostFX } from "./postfx.ts";
import { Exterior } from "./exterior.ts";
import { Atmosphere } from "./atmosphere.ts";
import type { ILighting, IPostFX, IExterior, IAtmosphere } from "./contracts.ts";
import { loadTextures, type TextureLibrary, type TextureLoadOptions } from "./textures.ts";
import { createWorldMaterial, type WorldMaterialHandle } from "./worldMaterial.ts";
import { createGlassMaterial } from "./glass.ts";
import { IslandBatcher, SurfaceTable, setActiveSurfaceTable } from "./batch.ts";
import { createInteriorEnvironment, EnvironmentCapture } from "./reflections.ts";
import { screenHooks, setScreensPowered } from "./screens.ts";
import { INTERIOR, CEILING_H, ROOMS, SPAWN } from "../world/plan.ts";

const DEG = Math.PI / 180;

export interface CreateRenderOptions {
  engine: Engine;
  scene: Scene;
  settings: Settings;
  onProgress?: (p: number, label: string) => void;
  /** Texture loading overrides (tests: proceduralOnly / custom URLs). */
  textures?: TextureLoadOptions;
  /** Skip building the exterior city/sky (tests). */
  skipExterior?: boolean;
  /** Skip light shafts / dust motes (tests). */
  skipAtmosphere?: boolean;
}

export class Render implements RenderSystem {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly settings: Settings;
  readonly camera: UniversalCamera;
  readonly textures: TextureLibrary;
  readonly world: WorldMaterialHandle;
  readonly glass: WorldMaterialHandle;
  readonly surfaces: SurfaceTable;
  readonly batcher: IslandBatcher;
  // typed by the render-env contracts (contracts.ts), not the concrete classes
  readonly lighting: ILighting;
  readonly postfx: IPostFX;
  readonly exterior: IExterior | null;
  readonly atmosphere: IAtmosphere | null;
  readonly environment: EnvironmentCapture;
  private quality: QualityPreset;
  private powered = true;
  private ps2 = false;
  private recaptureObs: Observer<Scene> | null = null;
  private disposed = false;
  private unsubscribeSettings: (() => void) | null = null;

  constructor(parts: {
    engine: Engine;
    scene: Scene;
    settings: Settings;
    camera: UniversalCamera;
    textures: TextureLibrary;
    world: WorldMaterialHandle;
    glass: WorldMaterialHandle;
    surfaces: SurfaceTable;
    batcher: IslandBatcher;
    lighting: ILighting;
    postfx: IPostFX;
    exterior: IExterior | null;
    atmosphere: IAtmosphere | null;
    environment: EnvironmentCapture;
  }) {
    this.engine = parts.engine;
    this.scene = parts.scene;
    this.settings = parts.settings;
    this.camera = parts.camera;
    this.textures = parts.textures;
    this.world = parts.world;
    this.glass = parts.glass;
    this.surfaces = parts.surfaces;
    this.batcher = parts.batcher;
    this.lighting = parts.lighting;
    this.postfx = parts.postfx;
    this.exterior = parts.exterior;
    this.atmosphere = parts.atmosphere;
    this.environment = parts.environment;
    this.quality = parts.settings.quality;
    const off = parts.settings.onChange((d) => this.onSettings(d)) as unknown;
    this.unsubscribeSettings = typeof off === "function" ? (off as () => void) : null;
  }

  // ---------------------------------------------------------------- RenderSystem

  get worldMaterial(): Material {
    return this.world.material;
  }

  get glassMaterial(): Material {
    return this.glass.material;
  }

  buildIsland(node: TransformNode, geoms: RenderGeom[], prev: IslandMeshes | null, name: string): IslandMeshes {
    return this.batcher.build(node, geoms, prev, name);
  }

  disposeIsland(m: IslandMeshes): void {
    this.batcher.dispose(m);
  }

  setShadowCaster(mesh: AbstractMesh, cast: boolean, large?: boolean): void {
    this.lighting.setShadowCaster(mesh, cast, large);
  }

  addLight(light: Light, roomId: string | null, mains: boolean): void {
    this.lighting.addLight(light, roomId, mains);
  }

  removeLight(light: Light): void {
    this.lighting.removeLight(light);
  }

  /** Mains power: interior lights, mains-powered emissive surfaces and screens. */
  setPower(on: boolean): void {
    if (on === this.powered) return;
    this.powered = on;
    this.lighting.setPower(on);
    this.world.plugin.setPowered(on);
    this.glass.plugin.setPowered(on);
    setScreensPowered(this.scene, on);
    // the captured environment bakes the interior lights into reflections and ambient: once
    // the lights have actually changed (a couple of frames), capture it again
    if (this.environment.lastCapture) this.recaptureAfterFrames(3);
  }

  /** Re-run the last environment capture after `frames` rendered frames (debounced). */
  private recaptureAfterFrames(frames: number): void {
    if (this.recaptureObs) this.scene.onAfterRenderObservable.remove(this.recaptureObs);
    let left = frames;
    this.recaptureObs = this.scene.onAfterRenderObservable.add(() => {
      if (--left > 0) return;
      if (this.recaptureObs) this.scene.onAfterRenderObservable.remove(this.recaptureObs);
      this.recaptureObs = null;
      if (!this.disposed) this.captureEnvironment();
    });
  }

  get isPowered(): boolean {
    return this.powered;
  }

  get ps2Mode(): boolean {
    return this.ps2;
  }

  shake(trauma: number): void {
    this.postfx.shake(trauma);
  }

  getShake(): { pos: Vec3; rot: Vec3 } {
    return this.postfx.getShake();
  }

  flash(intensity: number, color?: number): void {
    this.postfx.flash(intensity, color);
  }

  setPS2Mode(on: boolean): void {
    this.ps2 = on;
    this.postfx.setPS2(on);
    // PS2 look: bilinear texels with a visible mip band
    this.textures.setRetroFiltering(on);
  }

  /**
   * Render the apartment once into the reflection probe (living-room centre, box-projected
   * onto the interior bounds) and make it the environment. Cheap at runtime (render once);
   * the procedural environment stays active until the capture is ready.
   */
  captureEnvironment(): void {
    void this.captureEnvironmentAsync();
  }

  /** As captureEnvironment(), resolving true once the captured environment is active. */
  captureEnvironmentAsync(): Promise<boolean> {
    const living = ROOMS.find((r) => r.id === "living");
    const pos = living ? new Vector3((living.x0 + living.x1) / 2, 1.45, (living.z0 + living.z1) / 2) : new Vector3(6.4, 1.45, 4.4);
    const size = this.quality.shadowMapSize >= 4096 ? 256 : this.quality.shadowMapSize >= 2048 ? 128 : 64;
    // opaque interior + exterior geometry + the sky dome (seen through the windows): no screens
    // (animated), no alpha-blended or additive meshes (glass is nearly invisible anyway; light
    // shafts / dust would bake glow into every reflection), no overlay rendering groups
    const meshes = this.scene.meshes.filter((m) => {
      if (!m.isEnabled() || !m.isVisible || m.getTotalVertices() <= 0 || m.renderingGroupId !== 0) return false;
      if (m.name.startsWith("screen_")) return false;
      const mat = m.material;
      return !mat || !mat.needAlphaBlendingForMesh(m);
    });
    return this.environment.capture({
      position: pos,
      size,
      meshes,
      box: {
        center: new Vector3((INTERIOR.minX + INTERIOR.maxX) / 2, CEILING_H / 2, (INTERIOR.minZ + INTERIOR.maxZ) / 2),
        size: new Vector3(INTERIOR.maxX - INTERIOR.minX, CEILING_H, INTERIOR.maxZ - INTERIOR.minZ),
      },
    });
  }

  applyQuality(q: QualityPreset): void {
    this.quality = q;
    this.lighting.applyQuality(q);
    this.postfx.applyQuality(q);
    this.atmosphere?.setEnabled(q.lightShafts);
    this.textures.setAnisotropy(q.shadowMapSize >= 2048 ? 8 : 4);
  }

  update(dt: number): void {
    if (this.disposed) return;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    this.lighting.update(step);
    this.postfx.update(step);
    this.exterior?.update(step);
    this.atmosphere?.update(step);
  }

  // ---------------------------------------------------------------- extras

  /** Global emissive / IBL tuning knobs (integration). */
  setEnvironmentIntensity(k: number): void {
    this.world.material.environmentIntensity = k;
    this.glass.material.environmentIntensity = k;
  }

  stats(): { islandsBuilt: number; buildMs: number; lastBuildMs: number; layers: { albedo: number; normal: number } } {
    return {
      islandsBuilt: this.batcher.stats.builds,
      buildMs: Math.round(this.batcher.stats.ms * 10) / 10,
      lastBuildMs: Math.round(this.batcher.stats.lastMs * 100) / 100,
      layers: this.textures.layerCounts,
    };
  }

  private onSettings(d: SettingsData): void {
    if (this.disposed) return;
    const fov = (d.fov > 30 && d.fov < 130 ? d.fov : 75) * DEG;
    if (Math.abs(this.camera.fov - fov) > 1e-4) this.camera.fov = fov;
    if (this.ps2 !== !!d.ps2Mode) this.setPS2Mode(!!d.ps2Mode);
    const q = this.settings.quality;
    if (q !== this.quality) this.applyQuality(q);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    if (this.recaptureObs) this.scene.onAfterRenderObservable.remove(this.recaptureObs);
    this.recaptureObs = null;
    this.environment.dispose();
    disposeIfPossible(this.atmosphere);
    disposeIfPossible(this.exterior);
    disposeIfPossible(this.postfx);
    this.batcher.clearPool();
    disposeIfPossible(this.lighting);
    this.world.material.dispose();
    this.glass.material.dispose();
    this.textures.dispose();
    setActiveSurfaceTable(null);
    screenHooks.registerReceiver = undefined;
    screenHooks.unregisterReceiver = undefined;
  }
}

/** Stand-in when PostFX cannot be created: no post effects, shake/flash become no-ops. */
class NullPostFX implements IPostFX {
  private readonly zero = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } };
  setPS2(): void {}
  applyQuality(): void {}
  shake(): void {}
  getShake(): { pos: Vec3; rot: Vec3 } {
    return this.zero;
  }
  flash(): void {}
  update(): void {}
}

/** Sub-systems are only contractually required to implement their interface (contracts.ts). */
function disposeIfPossible(o: unknown): void {
  const d = (o as { dispose?: unknown } | null)?.dispose;
  if (typeof d === "function") d.call(o);
}

/** Optional sub-system construction: a failure degrades the look instead of the whole game. */
function optional<T>(what: string, make: () => T): T | null {
  try {
    return make();
  } catch (e) {
    console.warn(`render: ${what} unavailable (${String((e as Error)?.message ?? e)})`);
    return null;
  }
}

/** Build the whole render stack (async: textures). */
export async function createRender(opts: CreateRenderOptions): Promise<Render> {
  const { engine, scene, settings } = opts;
  const progress = opts.onProgress ?? (() => {});
  progress(0, "Renderer");
  // 1. camera
  const camera = new UniversalCamera("camera", new Vector3(SPAWN.pos.x, SPAWN.pos.y, SPAWN.pos.z), scene);
  camera.minZ = 0.03;
  camera.maxZ = 3000;
  camera.fov = (settings.data.fov > 30 && settings.data.fov < 130 ? settings.data.fov : 75) * DEG;
  camera.inertia = 0;
  camera.rotation.set(SPAWN.pitch, SPAWN.yaw, 0);
  scene.activeCamera = camera;
  // 2. lighting (sun, sky fill, interior light management)
  const lighting = new Lighting(scene, settings);
  // 3. textures
  const textures = await loadTextures(scene, {
    ...opts.textures,
    onProgress: (p, label) => progress(0.05 + p * 0.65, label),
  });
  // 4. materials + batching
  const world = createWorldMaterial(scene, textures);
  const glass = createGlassMaterial(scene, textures);
  const surfaces = new SurfaceTable(textures);
  setActiveSurfaceTable(surfaces);
  const batcher = new IslandBatcher(scene, world.material, glass.material, surfaces, {
    registerReceiver: (m) => lighting.registerReceiver(m),
    unregisterReceiver: (m) => lighting.unregisterReceiver(m),
    setShadowCaster: (m, cast, large) => lighting.setShadowCaster(m, cast, large),
  });
  screenHooks.registerReceiver = (m) => lighting.registerReceiver(m);
  screenHooks.unregisterReceiver = (m) => lighting.unregisterReceiver(m);
  // 5. reflection environment (procedural until captureEnvironment())
  progress(0.72, "Environment");
  const environment = new EnvironmentCapture(scene, createInteriorEnvironment(scene, 64));
  // 6. post-processing
  progress(0.76, "Post-processing");
  const postfx: IPostFX = optional("post-processing", () => new PostFX(scene, camera, settings)) ?? new NullPostFX();
  // 7. exterior + atmosphere
  let exterior: IExterior | null = null;
  if (!opts.skipExterior) {
    progress(0.8, "City");
    exterior = optional("exterior", () => {
      const e = new Exterior(scene, lighting);
      e.build();
      return e;
    });
  }
  let atmosphere: IAtmosphere | null = null;
  if (!opts.skipAtmosphere) {
    progress(0.92, "Atmosphere");
    atmosphere = optional("atmosphere", () => {
      const a = new Atmosphere(scene, lighting);
      a.build();
      return a;
    });
  }
  const render = new Render({ engine, scene, settings, camera, textures, world, glass, surfaces, batcher, lighting, postfx, exterior, atmosphere, environment });
  render.applyQuality(settings.quality);
  if (settings.data.ps2Mode) render.setPS2Mode(true);
  progress(1, "Renderer ready");
  return render;
}
