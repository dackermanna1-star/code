import * as THREE from 'three';
import { U } from './engine/uniforms.js';
import { World } from './world/world.js';
import { Footprints } from './world/footprints.js';
import { OasisManager } from './world/oases.js';
import { Vegetation } from './world/vegetation/vegetation.js';
import { ShadowCascades } from './world/shadows.js';
import { Weather } from './world/weather.js';
import { SandParticles } from './world/particles.js';
import { Input } from './player/input.js';
import { Player } from './player/player.js';
import { BodyProxy } from './player/body.js';

export const SPAWN = { x: 984, z: 555, yaw: 207 };

export class Game {
  constructor({ pipeline, settings, quality, presetName, canvas }) {
    this.pipeline = pipeline;
    this.settings = settings;
    this.quality = quality;
    this.presetName = presetName;
    const renderer = pipeline.renderer;

    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 1, 0.1, 40000);
    this.world = new World(pipeline, quality);
    this.scene = this.world.scene;

    this.footprints = quality.footprints ? new Footprints(renderer, { size: quality.clipSize >= 384 ? 1024 : 512, extent: 32 }) : null;
    this.oases = new OasisManager(this.world.atmosphere, this.world.atlas, quality);
    this.scene.add(this.oases.group);
    this.vegetation = new Vegetation(this.world.atmosphere, this.world.atlas, quality);
    this.scene.add(this.vegetation.group);
    this.shadows = quality.objectShadows ? new ShadowCascades(renderer, { size: quality.shadowMapSize }) : null;
    this.weather = new Weather();
    this.weather.setMode(settings.get('weather'), true);
    this.particles = new SandParticles(this.world.atmosphere, this.world.atlas, quality);
    this.scene.add(this.particles.group);

    this.input = new Input(canvas);
    this.player = new Player(this.camera, this.input);
    this.player.setPosition(SPAWN.x, SPAWN.z, SPAWN.yaw, -4);
    this.body = new BodyProxy();
    this.scene.add(this.body.root);
    this.player.on('step', (e) => {
      this.footprints?.addStep(e);
      if (e.water < 0.05) this.particles.kick(e.x, this.player.feet.y, e.z, e.heading, e.speed, e.running ? 10 : 5);
    });
    this.player.on('land', (e) => {
      this.footprints?.addLanding(e.x, e.z, e.heading, e.impact);
      if (e.water < 0.05) this.particles.kick(e.x, this.player.feet.y, e.z, e.heading, 0, Math.min(40, 12 + e.impact * 6));
    });

    this.timeSpeed = settings.get('timeSpeed');
    this.running = false;
    this.paused = false;
    this.frameListeners = new Set();
    this.stats = { fps: 0, frameMs: 0 };
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this.frames = 0;
    this.rawDt = 0.016;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.pipeline.resize();
    const s = this.pipeline.size;
    this.camera.aspect = s.cssW / s.cssH;
    this.camera.updateProjectionMatrix();
  }

  onFrame(fn) {
    this.frameListeners.add(fn);
  }

  /** Advance the simulation by dt seconds and render. */
  step(dt) {
    const settings = this.settings;
    this.input.update();
    if (!this.paused) {
      const scrub = this.input.timeAxis();
      if (scrub !== 0) {
        this.world.setTimeOfDay(this.world.timeOfDay + scrub * dt * 1.5);
      }
      this.player.update(dt, {
        sensitivity: settings.get('sensitivity'),
        invertY: settings.get('invertY'),
        headBob: settings.get('headBob'),
        fov: settings.get('fov'),
      });
    }
    this.camera.updateMatrixWorld();
    const simDt = this.paused ? 0 : dt;
    this.weather.update(simDt, { sunElevation: Math.asin(this.world.sunDir.y), timeOfDay: this.world.timeOfDay });
    this.world.update(simDt, this.camera, { timeSpeed: this.timeSpeed, instantExposure: this.frames < 3 });
    this.particles.update(this.weather);
    this.oases.update(this.player.feet);
    this.vegetation.update(this.player.feet, this.oases.active, this.frames < 2 ? 400 : 4);
    this.player.colliders = this.vegetation.trunks;
    this.footprints?.update(simDt, this.player.feet, U.uWindSpeed.value, U.uStorm.value);
    if (this.shadows) {
      // A caster can shade the cascade from as far away as its shadow is long.
      const L = U.uLightDir.value;
      const reach = Math.min(500, 15 / Math.max(0.03, L.y / Math.max(1e-3, Math.hypot(L.x, L.z))));
      this.body.update(this.player);
      const casters = this.debugNoBody ? this.vegetation.casters() : [...this.vegetation.casters(), ...this.body.parts];
      this.body.root.visible = !this.debugNoBody && !this.player.photoMode;
      this.shadows.update(this.scene, this.player.feet, L, casters, (i, radius) => {
        this.vegetation.setShadowRange(radius * 1.45 + reach, i === 0 ? radius * 1.45 + reach * 0.15 : 0);
      });
      this.vegetation.setShadowRange(Infinity);
    }
    for (const fn of this.frameListeners) fn(dt);
    this.pipeline.render(this.scene, this.camera);
    this.frames++;
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const raw = (now - last) / 1000;
      last = now;
      this.rawDt = raw;
      const dt = Math.min(0.1, Math.max(0, raw));
      this._fpsAccum += raw;
      this._fpsFrames++;
      if (this._fpsAccum > 0.5) {
        this.stats.fps = this._fpsFrames / this._fpsAccum;
        this.stats.frameMs = (this._fpsAccum / this._fpsFrames) * 1000;
        this._fpsAccum = 0;
        this._fpsFrames = 0;
      }
      this.step(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
