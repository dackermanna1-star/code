/**
 * Weather presentation: rain streaks / snowflakes around the camera (occluded by roofs and
 * trees through a top-down rain heightmap), rain splashes and ripples on surfaces near the
 * camera, wind, and `game.weather.wetness` (0..1, rises while it rains on the camera's biome,
 * dries slowly afterwards; consumed by the renderer for wet-surface shading).
 *
 * Intensity comes from `game.weather.rain` (driven by Game.tickWeather).
 */
import type { Game } from './game';
import type { GameSystem } from './systems';
import type { World } from '../world/world';
import * as THREE from 'three';
import { RainHeightmap, PrecipRenderer, Precip, HM_WATER, HM_LAVA } from '../render/particles/precip';
import { PT } from '../render/particles/defs';
import type { FxSystem } from './fxGlue';

const rnd = Math.random;

export class WeatherSystem implements GameSystem {
  readonly name = 'weather';
  readonly heightmap = new RainHeightmap();
  private precip: PrecipRenderer | null = null;
  private scene = new THREE.Scene();
  private game!: Game;
  private unsub: (() => void) | null = null;
  private splashAcc = 0;
  private time = 0;

  init(game: Game) {
    this.game = game;
    const r = game.renderer;
    try {
      this.precip = new PrecipRenderer(this.heightmap, r.lightUniforms, r.terrainUniforms, game.settings.quality === 'low' ? 5000 : 9000);
      this.scene.add(this.precip.mesh);
      const ex = game.renderExtras as any;
      // draw precipitation before the particle scene (smoke in front of rain composites correctly)
      (ex.forward ??= []).unshift(this.scene);
    } catch (e) {
      console.warn('weather: GPU init failed', e);
    }
    
  }

  onWorldChange(_game: Game, world: World) {
    this.unsub?.();
    // keep the heightmap exact under block edits
    this.unsub = world.events.on('blockChanged', ({ x, z }) => this.heightmap.writeColumn(world, x, z));
    this.heightmap.update(world, this.game?.cameraCtl.camera.position.x ?? 0, this.game?.cameraCtl.camera.position.z ?? 0, this.heightmap.size);
  }

  /** Precipitation type and whether the point is exposed (above the rain heightmap). */
  precipitationAt(x: number, y: number, z: number): Precip {
    if (!this.heightmap.exposed(x, y, z)) return Precip.None;
    return (this.heightmap.flags(Math.floor(x), Math.floor(z)) & 3) as Precip;
  }

  update(game: Game, dt: number) {
    const cam = game.cameraCtl.camera.position;
    const w = game.weather;
    const over = game.dimension === 'overworld';
    const rain = over ? w.rain : 0;
    this.time += dt;
    if (over) this.heightmap.update(game.world, cam.x, cam.z, 8);
    // wind grows with storms; shared with wind-coupled particles
    const fx = game.systems.find((s) => s.name === 'fx') as FxSystem | undefined;
    const wind = 0.4 + rain * 2.2 + w.thunder * 2;
    const wa = this.time * 0.02;
    if (fx?.sys) fx.sys.wind.set(Math.cos(wa) * wind, 0, Math.sin(wa) * wind * 0.6 + 0.2);
    if (this.precip) {
      (this.precip.uniforms.u_wind.value as THREE.Vector2).set(Math.cos(wa) * wind * 0.8, Math.sin(wa) * wind * 0.5);
      this.precip.update(cam, this.time, rain, game.renderer.linearDepthTexture);
    }
    // wetness: rain over the camera's column (snow and deserts stay dry)
    const ptype = over ? this.heightmap.flags(Math.floor(cam.x), Math.floor(cam.z)) & 3 : 0;
    const target = ptype === Precip.Rain ? rain : 0;
    const cur = w.wetness ?? 0;
    w.wetness = cur + (target - cur) * (1 - Math.exp(-dt / (target > cur ? 25 : 120)));
    // splashes on surfaces near the camera
    if (rain > 0.02 && game.particles && !game.paused) this.splashes(game, dt, rain);
  }

  private splashes(game: Game, dt: number, rain: number) {
    const cam = game.cameraCtl.camera.position;
    const sys = (game.systems.find((s) => s.name === 'fx') as FxSystem | undefined)?.sys;
    if (!sys) return;
    this.splashAcc += dt * rain * 260 * sys.density;
    let n = Math.floor(this.splashAcc);
    this.splashAcc -= n;
    n = Math.min(n, 40);
    for (let k = 0; k < n; k++) {
      const r = Math.sqrt(rnd()) * 14;
      const a = rnd() * Math.PI * 2;
      const x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
      const bx = Math.floor(x), bz = Math.floor(z);
      const fl = this.heightmap.flags(bx, bz);
      if ((fl & 3) !== Precip.Rain) continue;
      const h = this.heightmap.height(bx, bz);
      if (h <= 0 || Math.abs(h - cam.y) > 16) continue;
      if (fl & HM_LAVA) {
        if (rnd() < 0.2) sys.spawn(PT.steam, x, h + 0.05, z, 0, 0.6, 0);
        continue;
      }
      if (fl & HM_WATER) {
        const i = sys.spawn(PT.ripple, x, h - 0.1, z);
        if (i >= 0) sys.lp.size[i] *= 0.35;
        if (rnd() < 0.3) sys.spawn(PT.rain_splash, x, h + 0.02, z, (rnd() - 0.5) * 0.6, 1.2 + rnd(), (rnd() - 0.5) * 0.6);
        continue;
      }
      const m = 1 + Math.floor(rnd() * 3);
      for (let j = 0; j < m; j++) sys.spawn(PT.rain_splash, x, h + 0.04, z, (rnd() - 0.5) * 1.2, 1.4 + rnd() * 1.4, (rnd() - 0.5) * 1.2);
    }
  }

  dispose() {
    this.unsub?.();
    this.precip?.dispose();
    this.heightmap.dispose();
  }
}
