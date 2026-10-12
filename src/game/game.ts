// GameStateManager + main loop. Owns every subsystem and wires them together.
import * as THREE from 'three';
import { DT, SURFACE_Y } from '../config';
import { Input } from '../core/input';
import { VoxelWorld } from '../world/world';
import { ChunkStreamer } from '../world/streamer';
import { MaterialSimulation } from '../sim/simulation';
import { TerrainDestructionSystem } from '../sim/destruction';
import { ChunkRenderer } from '../render/chunkRenderer';
import { createSharedUniforms, createVoxelMaterials, SharedUniforms, VoxelMaterials } from '../render/voxelMaterial';
import { LightManager } from '../render/lights';
import { Sky } from '../render/sky';
import { ParticleSystem } from '../render/particles';
import { Player } from '../entities/player';
import { biomeAt, depthOf, hmBandOf } from '../world/biomes';
import { Spawn } from '../world/generator';
import { Chunk } from '../world/chunk';

export interface GameOptions {
  seed: number;
  pixelScale: number; // render resolution divisor (2 = chunky Noita-like pixels)
  useWorkers: boolean;
  debug: boolean;
}

export type GameState = 'loading' | 'playing' | 'paused' | 'dead' | 'won';

export class Game {
  readonly opts: GameOptions;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly uniforms: SharedUniforms;
  readonly voxelMats: VoxelMaterials;
  readonly world = new VoxelWorld();
  readonly streamer: ChunkStreamer;
  readonly sim: MaterialSimulation;
  readonly destruction: TerrainDestructionSystem;
  readonly chunks: ChunkRenderer;
  readonly lights = new LightManager();
  readonly sky: Sky;
  readonly particles: ParticleSystem;
  readonly input: Input;
  player: Player;
  state: GameState = 'loading';
  time = 0;
  tickCount = 0;
  private acc = 0;
  private last = 0;
  fps = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  frameMs = 0;
  simMsFrame = 0;
  shake = 0;
  flash = 0;
  /** Hooks for systems registered by later modules. */
  readonly tickHooks: ((dt: number) => void)[] = [];
  readonly frameHooks: ((dt: number) => void)[] = [];
  readonly spawnHandlers: ((s: Spawn, c: Chunk) => void)[] = [];
  private raf = 0;
  readonly look = new THREE.Vector3();
  moveEvents = { footstep: () => {}, jump: () => {}, land: (_v: number) => {} };

  constructor(canvas: HTMLCanvasElement, opts: GameOptions, input: Input) {
    this.opts = opts;
    this.input = input;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.autoClear = true;
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.08, 800);
    this.camera.rotation.order = 'YXZ';
    this.uniforms = createSharedUniforms();
    this.voxelMats = createVoxelMaterials(this.uniforms);
    this.streamer = new ChunkStreamer(this.world, opts.seed, { radiusH: 7, radiusV: 5, useWorkers: opts.useWorkers });
    this.sim = new MaterialSimulation(this.world);
    this.destruction = new TerrainDestructionSystem(this.world, this.sim);
    this.chunks = new ChunkRenderer(this.world, this.voxelMats);
    this.sky = new Sky(opts.seed);
    this.particles = new ParticleSystem(this.world, this.uniforms.uPointScale, this.uniforms);
    this.scene.add(this.sky.mesh);
    this.scene.add(this.chunks.group);
    this.scene.add(this.particles.points);
    this.scene.add(this.particles.glowPoints);
    this.scene.add(this.camera);
    const sp = this.streamer.gen.spawnPoint();
    this.player = new Player(sp.x, sp.y, sp.z);
    this.player.yaw = 0; // facing -z... spawn faces the mountain (+z)
    this.player.yaw = Math.PI;
    this.streamer.onSpawns = (spawns, c) => {
      for (const s of spawns) for (const h of this.spawnHandlers) h(s, c);
    };
    this.destruction.cb.launch = (m, aux, x, y, z, vx, vy, vz) => this.particles.launch(m, aux, x, y, z, vx, vy, vz);
    this.destruction.cb.debris = (m, x, y, z, vx, vy, vz) =>
      this.particles.spawn(x, y, z, vx * 0.5, vy * 0.5, vz * 0.5, this.particles.matColor(m), 0.6 + Math.random() * 0.8, 0.45, 1, false, 1.5);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(1 / this.opts.pixelScale);
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const bufH = h / this.opts.pixelScale;
    this.uniforms.uPointScale.value = bufH / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
  }

  /** Synchronously load the area around the spawn so the first frame is complete. */
  async preload(onProgress: (f: number) => void): Promise<void> {
    const p = this.player.body;
    const rh = 4, rv = 3;
    const pcx = Math.floor(p.x / 16), pcy = Math.floor(p.y / 16), pcz = Math.floor(p.z / 16);
    const list: [number, number, number][] = [];
    for (let dy = -rv; dy <= rv; dy++) for (let dz = -rh; dz <= rh; dz++) for (let dx = -rh; dx <= rh; dx++) list.push([pcx + dx, pcy + dy, pcz + dz]);
    for (let i = 0; i < list.length; i++) {
      this.streamer.loadSync(list[i][0], list[i][1], list[i][2]);
      if (i % 24 === 0) {
        onProgress(i / list.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    // initial meshes near the player
    this.chunks.update(new THREE.Vector3(p.x, p.y, p.z), 1e9);
    onProgress(1);
  }

  start(): void {
    this.state = 'playing';
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.streamer.dispose();
  }

  frame(now: number): void {
    const t0 = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    if (this.state === 'playing') {
      this.player.look(this.input);
      for (const h of this.frameHooks) h(dt);
      this.acc += dt;
      let steps = 0;
      this.simMsFrame = 0;
      while (this.acc >= DT && steps < 4) {
        this.tick();
        this.acc -= DT;
        steps++;
      }
      if (steps === 4) this.acc = 0;
    } else {
      for (const h of this.frameHooks) h(0);
    }
    this.render(dt);
    this.input.endFrame();
    this.frameMs = performance.now() - t0;
  }

  tick(): void {
    this.tickCount++;
    this.time += DT;
    const p = this.player;
    p.update(this.world, this.input, DT, this.moveEvents);
    for (const h of this.tickHooks) h(DT);
    if (this.tickCount % 8 === 0) this.streamer.update(p.body.x, p.body.y, p.body.z, this.opts.useWorkers ? 0 : 6);
    // cellular simulation with a per-frame budget: the world slows down before the frame rate does
    if (this.simMsFrame < 11) {
      this.sim.focusX = p.body.x;
      this.sim.focusY = p.body.y;
      this.sim.focusZ = p.body.z;
      this.sim.step();
      this.simMsFrame += this.sim.stats.tickMs;
    }
    this.particles.update(DT);
  }

  /** Camera pose from player. */
  updateCamera(): void {
    const p = this.player;
    const bobAmt = p.body.onGround ? 0.12 : 0;
    const bx = Math.sin(p.bob) * bobAmt * 0.6;
    const by = Math.abs(Math.cos(p.bob)) * bobAmt - p.landedImpact * 0.6;
    this.camera.position.set(p.body.x, p.eyeY + by, p.body.z);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.camera.rotation.set(p.pitch + sy * 0.02, p.yaw + sx * 0.02, bx * 0.01);
    this.shake *= 0.88;
  }

  render(dt: number): void {
    this.updateCamera();
    const cam = this.camera.position;
    const u = this.uniforms;
    u.uTime.value = this.time;
    // atmosphere from depth / biome
    const depth = depthOf(cam.y);
    const surf = THREE.MathUtils.clamp((cam.y - (SURFACE_Y - 30)) / 40, 0, 1);
    const b = biomeAt(cam.y);
    // ambient: biome tint mixed towards neutral so material colours stay readable
    const amb = new THREE.Color(b ? b.ambient : '#4a3a2e').lerp(new THREE.Color(1, 1, 1), 0.45).multiplyScalar(b ? b.ambientStrength : 0.45);
    const surfaceAmb = new THREE.Color(0.36, 0.3, 0.36);
    u.uAmbient.value.copy(amb).lerp(surfaceAmb, surf);
    if (hmBandOf(cam.y) >= 0) u.uAmbient.value.setRGB(0.62, 0.5, 0.42); // holy mountains are warmly lit sanctuaries
    u.uSkyAmbient.value.setRGB(0.42, 0.33, 0.42);
    u.uSunCol.value.setRGB(0.62, 0.42, 0.4);
    const fog = new THREE.Color(b ? b.fog : '#0a0806');
    u.uFogColor.value.copy(fog).lerp(new THREE.Color(0.3, 0.2, 0.28), surf);
    u.uFogDensity.value = THREE.MathUtils.lerp(b ? b.fogDensity : 0.012, 0.005, surf);
    this.flash *= 0.85;
    u.uFlash.value = this.flash;
    this.sky.update(cam, surf, this.time);
    this.renderer.setClearColor(u.uFogColor.value, 1);
    void depth;
    // lights: player's faint glow + glowing materials + dynamic lights from systems
    const p = this.player;
    this.lights.add(p.body.x, p.eyeY + 1, p.body.z, [1.0, 0.86, 0.7], 64, 0.95);
    this.lights.addEmitters(this.chunks.emitters.values(), cam, 120);
    this.lights.upload(u, cam);
    this.chunks.update(cam, 5);
    if (this.tickCount % 30 === 0) this.chunks.cull(cam);
    this.particles.sync();
    this.renderer.render(this.scene, this.camera);
    void dt;
  }

  /** Camera look direction (unit). */
  lookDir(): THREE.Vector3 {
    this.camera.getWorldDirection(this.look);
    return this.look;
  }
}
