// World module entry: authored island layout, generated terrain (worker), physics, CDLOD terrain rendering,
// sky/time/weather environment, render pipeline (lighting, shadows, post), debug helpers.
import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import { debugState, registerDebug } from '../core/Debug';
import { Priority } from '../core/Engine';
import { installRender } from '../render';
import { buildLayout } from './layout/MapData';
import { generateTerrainAsync } from './terrain/generateAsync';
import { World } from './World';
import { createTerrainColliders } from './terrain/TerrainPhysics';
import { createTerrainGpuData } from './terrain/gpuData';
import { TerrainRenderer } from './terrain/TerrainRenderer';
import { layerScales, type TerrainUniforms } from './terrain/TerrainMaterial';
import { bakeLayerArrays, resolveLayerSources } from './terrain/TerrainTextures';
import { createNoiseTexture, createWaterNormalTexture } from './env/noiseTexture';
import { Water } from './water/Water';
import { RoadMeshes } from './roads/RoadMeshes';
import { Bridges } from './roads/Bridges';
import { buildMapCanvas } from './map/MapImage';
import { Rain } from './env/Rain';
import { Environment } from './env/Environment';
import { FlyCamera } from './debug/FlyCamera';
import { installDebugTools } from './debug/debugTools';

export { World } from './World';
export type { Environment } from './env/Environment';

/** Handle to the world's runtime pieces (for sandboxes/tools; other modules should use ctx.world/ctx.environment). */
export interface WorldRuntime {
  world: World;
  environment: Environment;
  terrain: TerrainRenderer;
  water: Water;
  fly: FlyCamera;
  timings: Record<string, number>;
}

let runtime: WorldRuntime | null = null;
export function getWorldRuntime(): WorldRuntime | null {
  return runtime;
}

export async function installWorld(ctx: GameContext): Promise<void> {
  const timings: Record<string, number> = {};
  let t0 = performance.now();
  const lap = (k: string) => {
    const now = performance.now();
    timings[k] = Math.round(now - t0);
    t0 = now;
  };
  const pipeline = installRender(ctx);
  const renderer = ctx.engine.renderer;
  const g = ctx.settings.data.graphics;

  // 1) layout + terrain generation (worker) — texture sets resolve in parallel
  const layout = buildLayout();
  lap('layout');
  const sourcesPromise = resolveLayerSources(ctx.assets).catch(() => []);
  const terrain = await generateTerrainAsync(layout);
  lap('terrainGen');
  layout.lots.forEach((l, i) => (l.groundY = terrain.lotGround[i]));
  layout.bridges.forEach((b, i) => (b.deckY = terrain.bridgeDeck[i]));
  layout.ponds.forEach((p, i) => (p.level = terrain.pondLevel[i]));
  const world = new World(layout, terrain);
  for (const p of layout.props) p.y = world.getHeight(p.x, p.z) + p.y;
  for (const v of layout.vehicleSpawns) v.y = v.kind === 'water' ? world.waterLevelAt(v.x, v.z) : world.getHeight(v.x, v.z) + 0.4;
  ctx.world = world;

  // 2) physics
  if (ctx.physics.ready) createTerrainColliders(ctx.physics, world);
  lap('physics');

  // 3) environment (sky, fog, IBL, sun/moon)
  const noise = createNoiseTexture(256, 7);
  const env = new Environment(ctx.scene, renderer, pipeline.lighting, noise);
  ctx.environment = env;
  lap('environment');

  // 4) terrain rendering
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const gpu = createTerrainGpuData(terrain, aniso);
  const sources = await sourcesPromise;
  const texSize = Number(ctx.flags.get('texres')) || (g.textureQuality >= 2 ? 1024 : 512);
  const arrays = bakeLayerArrays(renderer, texSize, sources, aniso);
  console.log('[world] terrain layers:', arrays.sources.map((s, i) => `${i}:${s ?? 'procedural'}`).join(' '));
  const uniforms: TerrainUniforms = {
    tHeight: { value: gpu.height },
    tTerrainNormal: { value: gpu.normal },
    tSplatA: { value: gpu.splatA },
    tSplatB: { value: gpu.splatB },
    tLayerAlbedo: { value: arrays.albedo.texture },
    tLayerNormal: { value: arrays.normal.texture },
    tMacro: { value: noise },
    uCamPos: { value: new THREE.Vector3() },
    uMorph: { value: [] },
    uLayerScale: { value: layerScales() },
    uWetness: { value: 0 },
    uCloudShadow: { value: 0.55 },
    uCloudOffset: { value: new THREE.Vector2() },
    uCloudCover: { value: 0.3 },
    uSunDirW: { value: new THREE.Vector3(0, 1, 0) },
    uDetailStrength: { value: 1 },
  };
  const terrainR = new TerrainRenderer(terrain.heights, uniforms);
  ctx.scene.add(terrainR.mesh);
  lap('terrainGpu');

  // 5) water
  const water = new Water(world, gpu.water, createWaterNormalTexture(256, 11), noise);
  water.addTo(ctx.scene);
  lap('waterMesh');

  // 6) roads, concrete pads, bridges
  const roadUniforms = { tNoise: { value: noise as THREE.Texture }, uWetness: { value: 0 } };
  const roads = new RoadMeshes(world, roadUniforms);
  ctx.scene.add(roads.mesh);
  const bridges = new Bridges(world, ctx.physics.ready ? ctx.physics : null, noise);
  ctx.scene.add(bridges.group);
  lap('roadMesh');

  // 7) rain + map image
  const rain = new Rain();
  ctx.scene.add(rain.mesh);
  world.mapCanvas = buildMapCanvas(world);
  lap('mapImage');

  // 8) per-frame systems
  const fly = new FlyCamera(ctx.camera, ctx.engine.canvas);
  const applyQuality = () => {
    const gs = ctx.settings.data.graphics;
    const detail = { low: 0.65, medium: 0.85, high: 1, ultra: 1.3, custom: 1 }[gs.preset] ?? 1;
    terrainR.setDetail(gs.preset === 'custom' ? (gs.viewDistance > 2500 ? 1.3 : gs.viewDistance < 1000 ? 0.7 : 1) : detail);
    terrainR.shadowKeepDistance = gs.shadowQuality > 0 ? gs.shadowDistance : 0;
  };
  applyQuality();
  ctx.events.on('settings:changed', applyQuality);
  const cloudOffset = new THREE.Vector2();
  ctx.engine.addSystem({
    name: 'world',
    priority: Priority.World,
    update: (dt) => {
      try {
        env.underwater = water.isUnderwater(ctx.camera.position);
        env.update(dt);
        const p = env.params;
        water.update(dt, ctx.camera, p.rain, p.wind);
        rain.quality = [0.35, 0.7, 1][ctx.settings.data.graphics.effectsQuality] ?? 1;
        rain.update(dt, ctx.camera, p.rain, p.wind, 1 - env.night * 0.85, env.underwater);
        uniforms.uWetness.value = p.wetness;
        roadUniforms.uWetness.value = p.wetness;
        uniforms.uCloudCover.value = p.cloudCover;
        uniforms.uCloudShadow.value = Math.min(0.7, 0.25 + p.cloudCover * 0.5) * (1 - env.night);
        cloudOffset.copy(env.sky.uniforms.uWind.value).multiplyScalar(env.sky.uniforms.uCloudTime.value);
        uniforms.uCloudOffset.value.copy(cloudOffset);
        uniforms.uSunDirW.value.copy(env.sunDirection);
        pipeline.envExposure = env.exposure;
      } catch (e) {
        logOnce('world.update', e);
      }
    },
    lateUpdate: (dt) => {
      try {
        if (debugState.freeCam) fly.update(dt);
        const cam = ctx.camera;
        // far plane follows the view distance setting (wider from altitude so the island stays visible from the plane)
        const vd = ctx.settings.data.graphics.viewDistance;
        const far = Math.min(9000, Math.max(800, vd * (1 + Math.max(0, cam.position.y - 50) / 350)));
        if (Math.abs(cam.far - far) > 1) {
          cam.far = far;
          cam.updateProjectionMatrix();
        }
        terrainR.update(cam);
        const sh = pipeline.lighting.shadow;
        terrainR.setShadowCascades(
          [0, 1, 2, 3].map((i) => sh.getCamera(i)),
          [1, 2, 3, 4].map((i) => (sh.cascadeSplits[Math.min(i, sh.activeCascades)] ?? sh.maxDistance) + 40),
        );
      } catch (e) {
        logOnce('world.lateUpdate', e);
      }
    },
  });
  if (ctx.flags.has('flycam')) {
    fly.enabled = true;
    debugState.freeCam = true;
  }
  installDebugTools(ctx, world, env, fly);
  registerDebug('terrainDebug', (mode: number) => {
    const m = terrainR.mesh.material as THREE.MeshStandardMaterial;
    if (mode) m.defines = { ...(m.defines ?? {}), TERRAIN_DEBUG: mode };
    else if (m.defines) delete m.defines.TERRAIN_DEBUG;
    m.needsUpdate = true;
    return mode;
  });
  env.setTimeOfDay(Number(ctx.flags.get('time') ?? env.timeOfDay));
  const wf = ctx.flags.get('weather');
  if (wf) env.setWeather(wf as never);
  env.refreshEnvMap(true);
  lap('systems');
  runtime = { world, environment: env, terrain: terrainR, water, fly, timings: { ...terrain.timings, ...timings } };
  console.log('[world] installed', JSON.stringify(runtime.timings));
}

const logged = new Set<string>();
function logOnce(key: string, e: unknown): void {
  if (logged.has(key)) return;
  logged.add(key);
  console.error(`[world] ${key} failed`, e);
}
