// Debug/automation helpers registered on window.__game (see core/Debug.ts).
import * as THREE from 'three';
import { debugState, registerDebug } from '../../core/Debug';
import type { GameContext } from '../../core/GameContext';
import type { WeatherKind } from '../../core/types';
import type { Environment } from '../env/Environment';
import type { World } from '../World';
import type { FlyCamera } from './FlyCamera';
import type { TerrainRenderer } from '../terrain/TerrainRenderer';
import type { TerrainTextureArrays } from '../terrain/TerrainTextures';

export interface Viewpoint {
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** Yaw (degrees, our convention: 0 = north/-Z, + = left) looking from (x,z) toward (tx,tz). */
function yawTo(x: number, z: number, tx: number, tz: number): number {
  return (Math.atan2(-(tx - x), -(tz - z)) * 180) / Math.PI;
}

export function buildTour(world: World): Viewpoint[] {
  const L = world.layout;
  const out: Viewpoint[] = [];
  const g = (x: number, z: number) => world.getHeight(x, z);
  const add = (name: string, x: number, z: number, h: number, tx: number, tz: number, pitch: number) =>
    out.push({ name, x, y: g(x, z) + h, z, yaw: yawTo(x, z, tx, tz), pitch });
  for (const loc of L.locations) {
    const a = Math.PI * 0.25;
    add(`${loc.name} (aerial)`, loc.x - Math.cos(a) * loc.radius * 1.6, loc.z + Math.sin(a) * loc.radius * 1.6, loc.radius * 0.9 + 40, loc.x, loc.z, -28);
    add(`${loc.name} (street)`, loc.x + 18, loc.z + 22, 1.7, loc.x - 60, loc.z - 40, -2);
  }
  for (const br of L.bridges) {
    const mx = (br.a.x + br.b.x) / 2, mz = (br.a.z + br.b.z) / 2;
    const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len, nz = dx / len;
    out.push({ name: `${br.kind} bridge ${br.id}`, x: mx + nx * 90, y: br.deckY + 8, z: mz + nz * 90, yaw: yawTo(mx + nx * 90, mz + nz * 90, mx, mz), pitch: -6 });
  }
  add('West beach', 240, 1950, 1.8, 0, 2000, -2);
  add('Quarry rim', 560, 1420, 2, 420, 1500, -12);
  add('Radio tower summit', 2040, 1180, 3, 1380, 1400, -6);
  add('Forest edge north', 1900, 600, 1.7, 2000, 380, 2);
  add('River valley', 1000, 1200, 6, 1080, 1480, -4);
  add('Military island from the channel', 1600, 2430, 8, 1650, 2720, -2);
  out.push({ name: 'Island overview', x: 1536, y: 1900, z: 3900, yaw: 0, pitch: -38 });
  return out;
}

export interface TerrainDebugHandles {
  terrain: TerrainRenderer;
  layers: TerrainTextureArrays;
}

export function installDebugTools(ctx: GameContext, world: World, env: Environment, fly: FlyCamera, t: TerrainDebugHandles): void {
  const cam = ctx.camera;
  registerDebug('teleport', (x: number, z: number, y?: number) => {
    const gy = y ?? world.getHeight(x, z) + 1.0;
    if (ctx.player) {
      ctx.player.teleport(new THREE.Vector3(x, gy, z));
      return { x, y: gy, z, player: true };
    }
    debugState.freeCam = true;
    cam.position.set(x, gy + 1.7, z);
    fly.syncFromCamera();
    return { x, y: gy, z, player: false };
  });
  registerDebug('debugCam', (x: number, y: number | null, z: number, yawDeg = 0, pitchDeg = 0) => {
    debugState.freeCam = true;
    const yy = y === null || y === undefined || Number.isNaN(y) ? world.getHeight(x, z) + 1.7 : y;
    cam.position.set(x, yy, z);
    cam.rotation.set((pitchDeg * Math.PI) / 180, (yawDeg * Math.PI) / 180, 0, 'YXZ');
    cam.updateMatrixWorld();
    fly.syncFromCamera();
    return { x, y: yy, z };
  });
  registerDebug('debugCamOff', () => {
    debugState.freeCam = false;
  });
  registerDebug('flycam', (on = true) => {
    fly.enabled = on;
    if (on) {
      debugState.freeCam = true;
      fly.syncFromCamera();
    }
    return on;
  });
  registerDebug('setTime', (h: number) => {
    env.setTimeOfDay(h);
    env.refreshEnvMap(true);
    return env.timeOfDay;
  });
  registerDebug('setWeather', (w: WeatherKind, seconds = 0) => {
    env.setWeather(w, seconds);
    if (!seconds) env.refreshEnvMap(true);
    return env.weather;
  });
  registerDebug('screenshotTour', () => buildTour(world));
  registerDebug('worldInfo', (x?: number, z?: number) => {
    const px = x ?? cam.position.x, pz = z ?? cam.position.z;
    return {
      x: px,
      z: pz,
      height: world.getHeight(px, pz),
      surface: world.getSurface(px, pz),
      water: world.getWaterHeight(px, pz),
      land: world.isLand(px, pz),
      tree: world.getTreeDensity(px, pz),
      cover: world.getGroundCover(px, pz),
      reservedDist: world.reservedDistance(px, pz),
      location: world.nearestLocation(px, pz)?.name,
      time: env.timeOfDay,
      weather: env.weather,
      visibility: env.visibility,
      fogDistance: env.fogDistance,
    };
  });
  registerDebug('renderStats', () => ({ ...ctx.engine.stats }));
  registerDebug('showTerrainLayers', (on = true, which: 'albedo' | 'normal' = 'albedo') => {
    const old = ctx.camera.getObjectByName('layer-preview');
    if (old) ctx.camera.remove(old);
    if (!on) return false;
    const group = new THREE.Group();
    group.name = 'layer-preview';
    for (let i = 0; i < 9; i++) {
      const m = new THREE.ShaderMaterial({
        uniforms: { tArr: { value: which === 'albedo' ? t.layers.albedo.texture : t.layers.normal.texture }, uLayer: { value: i } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'precision highp sampler2DArray; uniform sampler2DArray tArr; uniform float uLayer; varying vec2 vUv; void main(){ vec4 c = texture(tArr, vec3(vUv * 2.0, uLayer)); gl_FragColor = vec4(c.rgb, 1.0); }',
        depthTest: false,
      });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), m);
      q.position.set(-0.9 + (i % 5) * 0.22, 0.25 - Math.floor(i / 5) * 0.22, -1);
      q.renderOrder = 9999;
      group.add(q);
    }
    ctx.camera.add(group);
    return true;
  });
  registerDebug('terrainDebug', (mode: number) => {
    const m = t.terrain.mesh.material as THREE.MeshStandardMaterial;
    if (mode) m.defines = { ...(m.defines ?? {}), TERRAIN_DEBUG: mode };
    else if (m.defines) delete m.defines.TERRAIN_DEBUG;
    m.needsUpdate = true;
    return mode;
  });
}
