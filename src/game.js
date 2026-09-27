// Game orchestrator: owns all systems, loads chapters, runs the frame loop.
import * as THREE from 'three';
import { Renderer } from './render/renderer.js';
import { Input } from './core/input.js';
import { LightManager } from './render/lights.js';
import { Particles } from './render/particles.js';
import { Decals } from './render/decals.js';
import { Sky } from './render/sky.js';
import { materials } from './render/materials.js';
import { setTextureSize } from './render/textures.js';
import { Gibs, Shells } from './combat/gore.js';
import { Combat } from './combat/combat.js';
import { Viewmodel } from './combat/viewmodel.js';
import { WEAPONS } from './combat/weaponDefs.js';
import { cloneModel, setWeaponEnv } from './combat/weaponModels.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { InfectedManager } from './entities/infected.js';
import { Survivor } from './entities/survivor.js';
import { PlayerController } from './entities/player.js';
import { CHARACTERS, ORDER } from './entities/characters.js';
import { NullAudio } from './audio/audio.js';
import { DIFFICULTY, QUALITY } from './config.js';
import { Level } from './world/level.js';
import { clamp } from './core/math.js';

export class Game {
  constructor(canvas, settings, hooks = {}) {
    this.canvas = canvas;
    this.settings = settings;
    this.hooks = hooks;
    this.quality = QUALITY[settings.quality] || QUALITY.medium;
    this.difficulty = DIFFICULTY[settings.difficulty] || DIFFICULTY.normal;
    this.time = 0;
    this.frameNo = 0;
    this.paused = false;
    this.uiBlocking = false;
    this.cheats = {};
    this.camPos = new THREE.Vector3();
    this.ambientK = 0.6;
    this.survivors = [];
    this.player = null;
    this.level = null;
    this.state = 'menu';
    setTextureSize(this.quality.texSize);
    materials.anisotropy = this.quality.texSize >= 512 ? 8 : 2;
    this.renderer = new Renderer(canvas, this.quality);
    this.scene = this.renderer.scene;
    this.input = new Input(canvas);
    this.input.sensitivity = settings.sensitivity;
    this.input.invertY = settings.invertY;
    this.lights = new LightManager(this.scene, this.quality.lights);
    this.fx = new Particles(this.scene, this.quality.particles);
    this.decals = new Decals(this.scene, 700);
    this.fx.onBloodHit = (x, y, z, nx, ny, nz, s) => {
      if (Math.random() < 0.6) this.decals.add(x, y, z, nx, ny, nz, 0.15 + Math.random() * 0.35, 4 + Math.floor(Math.random() * 4), { noRoll: Math.abs(ny) < 0.5 });
    };
    this.sky = new Sky(this.scene);
    this.gibs = new Gibs(this);
    this.shells = new Shells(this);
    this.combat = new Combat(this);
    this.infected = new InfectedManager(this);
    this.audio = hooks.audio || new NullAudio();
    this.viewmodel = new Viewmodel(this, this.renderer.camera);
    this.itemModels = { throwableMesh: (type) => { const m = cloneModel(type === 'grenade' ? 'grenade' : type); if (m) m.scale.setScalar(1.2); return m; } };
    // Image-based ambient/reflections (dim) so PBR metals and wet surfaces read.
    const pmrem = new THREE.PMREMGenerator(this.renderer.r);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.08;
    setWeaponEnv(this.envTex, 0.55);
    // Base lighting
    this.hemi = new THREE.HemisphereLight(0x303848, 0x141210, 0.35);
    this.hemi.layers.enable(1);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0x8090b0, 0);
    this.moon.layers.enable(1);
    this.moon.castShadow = this.quality.moonShadow;
    this.moon.shadow.mapSize.set(this.quality.shadowMap * 2, this.quality.shadowMap * 2);
    const sc = this.moon.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
    this.moon.shadow.bias = -0.0006;
    this.moon.shadow.normalBias = 0.04;
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);
    // Player flashlight (shadowed)
    this.flashlight = new THREE.SpotLight(0xfff1dc, 0, 45, 0.42, 0.55, 1.0);
    this.flashlight.castShadow = this.quality.shadows;
    this.flashlight.shadow.mapSize.set(this.quality.shadowMap, this.quality.shadowMap);
    this.flashlight.shadow.camera.near = 0.3;
    this.flashlight.shadow.bias = -0.0004;
    this.flashlight.shadow.normalBias = 0.03;
    this.renderer.camera.add(this.flashlight);
    // Viewmodel-only fill light (layer 1) so hands/guns read in the dark without blowing out
    this.vmLight = new THREE.PointLight(0xfff0dc, 2.0, 4, 0);
    this.vmLight.layers.set(1);
    this.vmLight.position.set(0.3, 0.15, 0.2);
    this.renderer.camera.add(this.vmLight);
    this.flashlight.position.set(0.28, -0.3, 0.3);
    this.flashlight.target.position.set(0.2, -1.2, -10);
    this.renderer.camera.add(this.flashlight.target);
    // Bot flashlights (no shadows)
    this.botLights = [];
    for (let i = 0; i < 3; i++) {
      const L = new THREE.SpotLight(0xfff1dc, 0, 30, 0.45, 0.6, 1.0);
      L.layers.enable(1);
      this.scene.add(L);
      this.scene.add(L.target);
      this.botLights.push(L);
    }
    this.fogColor = new THREE.Color(0x0a0c10);
    this.scene.fog = new THREE.FogExp2(0x0a0c10, 0.03);
    this.scene.background = new THREE.Color(0x05070a);
    this.shakeAmt = 0;
    this.usables = [];
    this.stats = { time: 0 };
    this.fpsAcc = 0; this.fpsN = 0; this.fps = 60;
  }

  weaponDef(type) { return WEAPONS[type]; }
  shake(v) { if (this.ctrl) this.ctrl.addShake(v); }

  // ---------------------------------------------------------- survivors --
  createSurvivors(playerChar) {
    this.survivors = [];
    const order = [playerChar, ...ORDER.filter((c) => c !== playerChar)];
    for (const id of order) {
      const s = new Survivor(this, CHARACTERS[id], { human: id === playerChar });
      this.survivors.push(s);
    }
    this.player = this.survivors[0];
    this.ctrl = new PlayerController(this, this.player);
    for (const s of this.survivors) this.hookSurvivor(s);
    this.hooks.onSurvivorsCreated?.(this);
  }
  hookSurvivor(s) {
    s.onEvent = (e, data) => {
      if (s === this.player) this.viewmodel.event(e, data);
      this.hooks.onSurvivorEvent?.(s, e, data);
    };
    s.muzzlePos = (w) => {
      if (s === this.player && !s.dead) {
        const out = this._mz || (this._mz = new THREE.Vector3());
        const p = this.viewmodel.muzzleWorldPos(out);
        if (p) return p;
      }
      if (s.model && s.model.muzzleWorld) return s.model.muzzleWorld(this._mz2 || (this._mz2 = new THREE.Vector3()));
      const out = this._mz3 || (this._mz3 = new THREE.Vector3());
      s.eye(out);
      const d = s.aimDir(new THREE.Vector3());
      return out.addScaledVector(d, 0.6);
    };
  }

  // ------------------------------------------------------------- levels --
  loadLevel(buildFn, opts = {}) {
    const t0 = performance.now();
    if (this.level) {
      this.level.dispose();
      this.level = null;
    }
    this.infected.clear();
    this.combat.reset();
    this.decals.clear();
    this.fx.clear();
    this.gibs.clear();
    this.shells.clear();
    this.usables = [];
    const level = new Level(this, opts.def || {});
    this.level = level;
    buildFn(level, this);
    level.finalize();
    this.scene.add(level.root);
    this.lights.setVirtual(level.lights);
    this.fx.col = level.col;
    // environment
    const env = level.env;
    this.scene.fog.color.set(env.fog);
    this.scene.fog.density = env.fogDensity;
    this.scene.background = new THREE.Color(env.fog);
    this.hemi.color.set(env.hemiSky);
    this.hemi.groundColor.set(env.hemiGround);
    this.hemi.intensity = env.hemiIntensity;
    this.renderer.r.toneMappingExposure = env.exposure;
    this.scene.environmentIntensity = env.envIntensity ?? 0.08;
    if (env.moon) {
      const m = env.moon;
      this.moon.intensity = m.intensity ?? 0.6;
      this.moon.color.set(m.color ?? 0x8090b0);
      this.moonDir = new THREE.Vector3(...(m.dir || [0.4, 1, 0.3])).normalize();
      this.moon.castShadow = this.quality.moonShadow && m.shadow !== false;
    } else {
      this.moon.intensity = 0;
      this.moon.castShadow = false;
    }
    this.sky.set(env.skyOpts || (env.sky ? { hospitalAz: env.hospitalAz ?? null, rotation: env.skyRotation ?? 0 } : { none: true }));
    this.ambientK = env.ambientK ?? 0.6;
    this.loadMs = performance.now() - t0;
    return level;
  }

  placeSurvivors() {
    const L = this.level;
    this.survivors.forEach((s, i) => {
      const sp = L.survivorStart[i % L.survivorStart.length] || { x: 0, y: 0, z: 0, yaw: 0 };
      s.teleport(sp.x, sp.y, sp.z, sp.yaw ?? 0);
    });
  }

  // ---------------------------------------------------------------- loop --
  frame(dtRaw) {
    let dt = Math.min(0.05, dtRaw);
    this.input.pollGamepad();
    this.fpsAcc += dtRaw; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    const t0 = performance.now();
    if (this.state === 'playing' && !this.paused) {
      this.update(dt);
    } else if (this.level) {
      // keep rendering (menus over the scene)
      this.ctrl?.updateCamera(0);
      this.lights.update(dt, this.renderer.camera);
    }
    const t1 = performance.now();
    this.renderer.render(dt);
    const t2 = performance.now();
    this.perf = this.perf || { upd: 0, ren: 0 };
    this.perf.upd = this.perf.upd * 0.9 + (t1 - t0) * 0.1;
    this.perf.ren = this.perf.ren * 0.9 + (t2 - t1) * 0.1;
    this.input.endFrame();
  }

  // Deterministic fast-forward for automated tests (no rendering).
  advance(seconds, dt = 1 / 60) {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) { this.update(dt); this.input.endFrame(); }
  }

  update(dt) {
    this.time += dt;
    this.frameNo++;
    this.stats.time += dt;
    const L = this.level;
    // player input
    this.ctrl.buildCmd(dt);
    this.hooks.beforeSurvivors?.(dt);
    for (const s of this.survivors) {
      const wasWeapon = s.weapon;
      s.update(dt);
      const w = s.weapon || wasWeapon;
      if (w) {
        const evs = w.consumeEvents();
        for (const e of evs) {
          if (s === this.player) this.viewmodel.event(e);
          this.hooks.onWeaponEvent?.(s, w, e);
        }
      }
    }
    this.separateSurvivors();
    L.update(dt, this.survivors);
    this.hooks.afterSurvivors?.(dt);
    this.infected.update(dt);
    this.combat.update(dt);
    this.hooks.afterInfected?.(dt);
    this.gibs.update(dt);
    this.shells.update(dt);
    this.fx.update(dt);
    this.decals.update(dt);
    // camera + viewmodel
    this.ctrl.updateCamera(dt);
    this.viewmodel.update(dt, this.player, this.ctrl.look);
    this.updateLighting(dt);
    this.sky.update(this.camPos);
    this.hooks.afterUpdate?.(dt);
  }

  separateSurvivors() {
    const S = this.survivors;
    for (let i = 0; i < S.length; i++) {
      const a = S[i];
      if (a.dead) continue;
      for (let j = i + 1; j < S.length; j++) {
        const b = S[j];
        if (b.dead) continue;
        if (Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const rr = 0.62;
        if (d < rr && d > 1e-4) {
          const k = (rr - d) / d * 0.5;
          const ma = a.incapped || a.pinned ? 0 : 1, mb = b.incapped || b.pinned ? 0 : 1;
          const tot = ma + mb || 1;
          a.phys.x -= dx * k * (ma / tot) * 2 * 0.5; a.phys.z -= dz * k * (ma / tot) * 2 * 0.5;
          b.phys.x += dx * k * (mb / tot) * 2 * 0.5; b.phys.z += dz * k * (mb / tot) * 2 * 0.5;
          a.pos.x = a.phys.x; a.pos.z = a.phys.z; b.pos.x = b.phys.x; b.pos.z = b.phys.z;
        }
      }
    }
  }

  updateLighting(dt) {
    const p = this.player;
    const on = p && !p.dead && p.flashlight;
    this.flashlight.intensity = on ? 26 * (p.flashFlicker ?? 1) : 0;
    this.vmLight.intensity = on ? 2.2 : 0.8;
    // bots' flashlights
    let bi = 0;
    for (const s of this.survivors) {
      if (s === this.player) continue;
      const L = this.botLights[bi++];
      if (!L) break;
      if (s.dead || !s.flashlight || s.model?.hidden) { L.intensity = 0; continue; }
      const e = s.eye(new THREE.Vector3());
      const d = s.aimDir(new THREE.Vector3());
      L.position.set(e.x + d.x * 0.3, e.y - 0.25, e.z + d.z * 0.3);
      L.target.position.set(e.x + d.x * 10, e.y + d.y * 10 - 0.5, e.z + d.z * 10);
      L.intensity = 18;
    }
    if (this.moon.intensity > 0 && this.moonDir) {
      const c = this.camPos;
      // snap to texel grid to reduce shimmer
      const sx = Math.round(c.x / 2) * 2, sz = Math.round(c.z / 2) * 2;
      this.moon.target.position.set(sx, c.y, sz);
      this.moon.position.set(sx + this.moonDir.x * 100, c.y + this.moonDir.y * 100, sz + this.moonDir.z * 100);
    }
    this.lights.update(dt, this.renderer.camera);
  }
}
