// Game: owns the simulation world, renderer, map, vehicles, effects, audio,
// camera and UI glue, and runs the fixed-step physics + render loop.

import * as THREE from 'three';
import { Renderer, TIMES, type Quality } from '../render/renderer.ts';
import { World } from '../sim/world.ts';
import type { Heightfield } from '../sim/terrain.ts';
import { SURFACES, Surface } from '../sim/surfaces.ts';
import { Vehicle } from '../sim/vehicle/vehicle.ts';
import { VEHICLES, getVehicleDef, type VehicleDef } from '../sim/vehicle/defs.ts';
import { VehicleView } from '../render/vehicleView.ts';
import { Input, type Action } from './input.ts';
import { CameraRig, type CameraMode } from './camera.ts';
import { AudioEngine } from '../audio/audio.ts';
import { Effects } from '../fx/particles.ts';
import { SkidMarks } from '../fx/skidmarks.ts';
import { PropManager, type Prop } from './props.ts';
import { generateTerrain, type RoadPath } from './map/terrainGen.ts';
import { buildTerrainMesh, buildRoadMeshes, buildPadMeshes } from './map/mapRender.ts';
import { buildScenery } from './map/scenery.ts';
import { spawnBuiltins, builtinProps, parkedCars } from './map/populate.ts';
import { ZONES, type Zone } from './map/layout.ts';
import { REGISTRY, type Obstacle, type ObstacleHost } from './obstacles/base.ts';
import { VehicleEntry, AIDriver, type Role } from './vehicles.ts';
import type { RimStyle } from '../render/wheelMesh.ts';
import { mat3FromYaw } from '../sim/math.ts';

export interface Settings {
  quality: Quality;
  physicsHz: number;
  timeOfDay: number;
  fragility: number;
  gravity: number;
  volume: number;
  abs: boolean;
  tc: boolean;
  showFps: boolean;
  steerSpeed: number;
}

export interface Notice {
  text: string;
  kind: 'info' | 'warn' | 'bad';
}

const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  physicsHz: 1500,
  timeOfDay: 2,
  fragility: 1,
  gravity: 1,
  volume: 0.8,
  abs: true,
  tc: true,
  showFps: false,
  steerSpeed: 1,
};

export const TIME_SCALES = [1, 0.5, 0.25, 0.1];

export class Game implements ObstacleHost {
  readonly renderer: Renderer;
  readonly world = new World();
  terrain!: Heightfield;
  roads: RoadPath[] = [];
  readonly input: Input;
  readonly rig: CameraRig;
  readonly audio = new AudioEngine();
  readonly fx = new Effects();
  readonly skids = new SkidMarks();
  props!: PropManager;
  obstacles: Obstacle[] = [];
  vehicles: VehicleEntry[] = [];
  player: VehicleEntry | null = null;
  settings: Settings;
  timeScaleIndex = 0;
  paused = false;
  /** Freeze physics but keep camera/UI. */
  get timeScale(): number {
    return TIME_SCALES[this.timeScaleIndex];
  }
  started = false;
  inMenu = true;
  editorActive = false;
  savedPos: { x: number; y: number; z: number; yaw: number } | null = null;
  readonly notices: Notice[] = [];
  onNotice: (n: Notice) => void = () => {};
  onAction: (a: Action) => void = () => {};
  private acc = 0;
  private last = 0;
  fps = 60;
  physMs = 0;
  frameMs = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private loopSounds: { stop(): void }[] = [];
  currentZone: Zone = ZONES[0];
  private zoneTimer = 0;
  get scene(): THREE.Scene {
    return this.renderer.scene;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.settings = loadSettings();
    this.renderer = new Renderer(canvas);
    this.renderer.setQuality(this.settings.quality);
    this.renderer.setTime(TIMES[this.settings.timeOfDay] ?? TIMES[2]);
    this.renderer.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', () => this.renderer.resize(window.innerWidth, window.innerHeight));
    this.input = new Input(canvas);
    this.rig = new CameraRig(this.renderer.camera);
    this.world.dt = 1 / this.settings.physicsHz;
    this.world.gravity = -9.81 * this.settings.gravity;
    this.scene.add(this.fx.group);
    this.scene.add(this.skids.mesh);
  }

  /** Build the world. Reports progress (0..1) with a label. */
  async load(progress: (p: number, label: string) => void): Promise<void> {
    const step = async (p: number, label: string) => {
      progress(p, label);
      await new Promise((r) => setTimeout(r, 0));
    };
    await step(0.05, 'Shaping terrain');
    const { hf, roads } = generateTerrain();
    this.terrain = hf;
    this.roads = roads;
    this.world.terrain = hf;
    this.fx.terrain = hf;
    await step(0.25, 'Paving roads');
    this.scene.add(buildTerrainMesh(hf));
    this.scene.add(buildRoadMeshes(roads, hf));
    this.scene.add(buildPadMeshes(hf));
    await step(0.4, 'Planting trees');
    const q = this.settings.quality === 'low' ? 0.5 : this.settings.quality === 'medium' ? 0.75 : 1;
    this.scene.add(buildScenery(this.world, hf, roads, q));
    await step(0.55, 'Building obstacles');
    this.obstacles = spawnBuiltins(this);
    this.props = new PropManager(this.world);
    this.scene.add(this.props.group);
    for (const p of builtinProps()) {
      const y = p.y ?? 0;
      const gy = this.world.groundHeight(p.x, p.z, 50);
      this.props.spawn(p.kind, p.x, gy + y + this.propHalfHeight(p.kind), p.z, p.yaw ?? 0);
    }
    await step(0.7, 'Assembling vehicles');
    const stored = storeGet('wf.vehicle');
    const lastId = stored && VEHICLES.some((v) => v.id === stored) ? stored : 'meridian';
    const lastColor = Number(storeGet('wf.color') ?? getVehicleDef(lastId).paint.color) || getVehicleDef(lastId).paint.color;
    this.spawnPlayer(lastId, lastColor, ZONES[0].spawn);
    await step(0.85, 'Parking wrecks');
    for (const pc of parkedCars()) {
      const e = this.spawnVehicle(pc.id, pc.color ?? getVehicleDef(pc.id).paint.color, 'parked', pc.x, pc.z, pc.yaw);
      e.vehicle.body.canSleep = true;
    }
    await step(1, 'Ready');
    this.rig.snap(this.player!.vehicle);
  }

  private propHalfHeight(kind: string): number {
    switch (kind) {
      case 'crate': return 0.56;
      case 'barrel': return 0.46;
      case 'cone': return 0.23;
      case 'block': return 0.71;
      case 'pin': return 0.81;
      case 'tire': return 0.35;
      case 'jerseyProp': return 0.41;
      case 'container': return 1.31;
      case 'beam': return 0.26;
      default: return 0.5;
    }
  }

  // ------------------------------------------------------------------ vehicles

  /** Spawn a car on the ground at (x, z); `nearY` picks the level when structures overhang (see World.spawnHeight). */
  spawnVehicle(id: string, color: number, role: Role, x: number, z: number, yaw: number, nearY?: number): VehicleEntry {
    const def = getVehicleDef(id);
    const v = new Vehicle(def, this.world);
    v.fragility = this.settings.fragility;
    v.abs = this.settings.abs;
    v.tractionControl = this.settings.tc;
    v.body.canSleep = role === 'parked';
    v.headlights = role !== 'parked' && !!TIMES[this.settings.timeOfDay]?.night;
    const view = new VehicleView(v, { color, metalness: def.paint.metalness, roughness: def.paint.roughness, clearcoat: def.paint.clearcoat, stripes: !!def.features.stripes });
    this.scene.add(view.group);
    this.world.addBody(v.body);
    this.world.addController(v);
    const y = nearY === undefined ? this.world.groundHeight(x, z, 80) : this.world.spawnHeight(x, z, nearY);
    v.spawn(x, y + 0.05, z, yaw);
    const e = new VehicleEntry(v, view, role, color);
    this.vehicles.push(e);
    this.attachAudio(e);
    return e;
  }

  private attachAudio(e: VehicleEntry): void {
    if (!this.audio.ready) return;
    if (e.role !== 'parked' && !e.engineVoice) e.engineVoice = this.audio.createEngine(e.def.engine);
    if (!e.noiseVoice) e.noiseVoice = this.audio.createVehicleNoise();
  }

  removeVehicle(e: VehicleEntry): void {
    const i = this.vehicles.indexOf(e);
    if (i < 0) return;
    this.vehicles.splice(i, 1);
    this.world.removeBody(e.vehicle.body);
    this.world.removeController(e.vehicle);
    e.view.dispose();
    e.engineVoice?.dispose();
    e.noiseVoice?.dispose();
    if (this.player === e) this.player = null;
  }

  spawnPlayer(id: string, color: number, at?: [number, number, number]): void {
    let x = 0, z = 10, yaw = Math.PI;
    let nearY: number | undefined;
    if (at) [x, z, yaw] = at;
    else if (this.player) {
      const v = this.player.vehicle;
      x = v.position[0];
      z = v.position[2];
      nearY = v.position[1];
      yaw = Math.atan2(v.forward[0], v.forward[2]);
    }
    if (this.player) this.removeVehicle(this.player);
    const e = this.spawnVehicle(id, color, 'player', x, z, yaw, nearY);
    this.player = e;
    storeSet('wf.vehicle', id);
    storeSet('wf.color', String(color));
    this.rig.snap(e.vehicle);
  }

  spawnAI(id?: string, near?: { x: number; z: number }): VehicleEntry {
    const ids = VEHICLES.map((v) => v.id);
    const vid = id ?? ids[Math.floor(Math.random() * ids.length)];
    const def = getVehicleDef(vid);
    const color = def.colors[Math.floor(Math.random() * def.colors.length)];
    const base = near ?? { x: this.player?.vehicle.position[0] ?? 0, z: this.player?.vehicle.position[2] ?? 0 };
    const a = Math.random() * Math.PI * 2;
    const x = base.x + Math.cos(a) * 25, z = base.z + Math.sin(a) * 25;
    const e = this.spawnVehicle(vid, color, 'ai', x, z, Math.atan2(base.x - x, base.z - z), this.player?.vehicle.position[1]);
    const arena = ZONES.find((zz) => zz.id === 'arena')!;
    const inArena = Math.hypot(base.x - arena.x, base.z - arena.z) < 90;
    e.ai = new AIDriver(new THREE.Vector3(inArena ? arena.x : base.x, 0, inArena ? arena.z : base.z), inArena ? 55 : 120);
    this.notify(`${def.name} joined the fight`, 'info');
    return e;
  }

  startDerby(): void {
    const arena = ZONES.find((z) => z.id === 'arena')!;
    this.teleport(arena);
    for (const e of [...this.vehicles]) if (e.role === 'ai') this.removeVehicle(e);
    for (let i = 0; i < 4; i++) this.spawnAI(undefined, { x: arena.x, z: arena.z + 30 });
  }

  resetPlayer(home = false): void {
    const p = this.player;
    if (!p) return;
    p.view.resetVisuals();
    if (home) {
      const s = this.currentZone.spawn;
      p.vehicle.spawn(s[0], this.world.groundHeight(s[0], s[1], 80) + 0.05, s[1], s[2]);
    } else {
      p.vehicle.resetInPlace();
    }
    p.fire = 0;
    this.rig.snap(p.vehicle);
    this.audio.playUI('beep', 0.25);
  }

  teleport(z: Zone): void {
    const p = this.player;
    if (!p) return;
    p.view.resetVisuals();
    const [x, zz, yaw] = z.spawn;
    p.vehicle.spawn(x, this.world.groundHeight(x, zz, 120) + 0.05, zz, yaw);
    p.fire = 0;
    this.currentZone = z;
    this.rig.snap(p.vehicle);
    this.notify(z.name, 'info');
  }

  savePosition(): void {
    const v = this.player?.vehicle;
    if (!v) return;
    this.savedPos = { x: v.position[0], y: v.position[1], z: v.position[2], yaw: Math.atan2(v.forward[0], v.forward[2]) };
    this.notify('Position saved', 'info');
  }

  loadPosition(): void {
    const p = this.player;
    if (!p || !this.savedPos) {
      this.notify('No saved position (press K to save)', 'warn');
      return;
    }
    p.view.resetVisuals();
    const s = this.savedPos;
    p.vehicle.spawn(s.x, this.world.spawnHeight(s.x, s.z, s.y) + 0.05, s.z, s.yaw);
    p.fire = 0;
    this.rig.snap(p.vehicle);
  }

  notify(text: string, kind: Notice['kind'] = 'info'): void {
    const n = { text, kind };
    this.notices.push(n);
    this.onNotice(n);
  }

  // ------------------------------------------------------------------ settings

  applySettings(s: Partial<Settings>): void {
    const prev = this.settings;
    this.settings = { ...this.settings, ...s };
    saveSettings(this.settings);
    if (s.quality && s.quality !== prev.quality) {
      this.renderer.setQuality(s.quality);
      this.fx.quality = s.quality === 'low' ? 0.5 : s.quality === 'medium' ? 0.75 : 1;
    }
    if (s.timeOfDay !== undefined) this.renderer.setTime(TIMES[s.timeOfDay]);
    if (s.physicsHz) this.world.dt = 1 / s.physicsHz;
    if (s.gravity !== undefined) this.world.gravity = -9.81 * s.gravity;
    if (s.volume !== undefined) this.audio.setVolume(s.volume);
    for (const e of this.vehicles) {
      e.vehicle.abs = this.settings.abs;
      e.vehicle.tractionControl = this.settings.tc;
      if (s.fragility !== undefined) e.vehicle.fragility = this.settings.fragility;
    }
    if (s.timeOfDay !== undefined && s.timeOfDay !== prev.timeOfDay) {
      const night = !!TIMES[s.timeOfDay]?.night;
      for (const e of this.vehicles) e.vehicle.headlights = night;
    }
  }

  /** Called from the first user gesture. */
  enableAudio(): void {
    this.audio.init();
    this.audio.setVolume(this.settings.volume);
    for (const e of this.vehicles) this.attachAudio(e);
    for (const o of this.obstacles) {
      if (o.type === 'grinder') o.rebuild();
    }
  }

  // ------------------------------------------------------------------ ObstacleHost

  spawnProp(kind: string, x: number, y: number, z: number, yaw: number, opts?: { pitch?: number; roll?: number; vx?: number; vy?: number; vz?: number }): unknown {
    if (kind === 'car') {
      const ids = ['meridian', 'pico', 'summit', 'courier'];
      const id = ids[Math.floor(Math.random() * ids.length)];
      const def = getVehicleDef(id);
      const e = this.spawnVehicle(id, 0x5a5550, 'parked', x, z, yaw);
      // lift into the air upside down-ish
      e.vehicle.body.place(mat3FromYaw(yaw), x, y, z);
      e.vehicle.body.canSleep = true;
      void def;
      return e;
    }
    return this.props.spawn(kind, x, y, z, yaw, opts);
  }

  removeProp(handle: unknown): void {
    if (handle instanceof VehicleEntry) this.removeVehicle(handle);
    else if (handle) this.props.remove(handle as Prop);
  }

  sound(name: string, x: number, y: number, z: number, gain = 1): void {
    this.audio.play(name, x, y, z, gain);
  }

  loopSound(name: string): { set(x: number, y: number, z: number, gain: number, rate?: number): void; stop(): void } | null {
    const l = this.audio.createLoop(name === 'grinder' ? 'grinder' : 'motor');
    if (l) this.loopSounds.push(l);
    return l;
  }

  emitSparks(x: number, y: number, z: number, nx: number, ny: number, nz: number, count: number, speed: number): void {
    this.fx.emitSparks(x, y, z, nx, ny, nz, count, speed);
  }

  emitDust(x: number, y: number, z: number, count: number, color?: [number, number, number]): void {
    this.fx.emitDust(x, y, z, count, color);
  }

  // ------------------------------------------------------------------ obstacles (editor)

  addObstacle(type: string, x: number, z: number, yaw: number, params?: Record<string, number>): Obstacle | null {
    const t = REGISTRY.get(type);
    if (!t) return null;
    const p: Record<string, number> = {};
    for (const d of t.params) p[d.key] = params?.[d.key] ?? d.def;
    const o = t.create(this, x, z, yaw, p).init();
    this.obstacles.push(o);
    return o;
  }

  removeObstacle(o: Obstacle): void {
    const i = this.obstacles.indexOf(o);
    if (i >= 0) this.obstacles.splice(i, 1);
    o.dispose();
  }

  // ------------------------------------------------------------------ main loop

  start(): void {
    this.last = performance.now();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      this.frame(now);
    };
    requestAnimationFrame(loop);
  }

  handleActions(): void {
    for (const a of this.input.consume()) {
      switch (a) {
        case 'reset':
          if (!this.inMenu) this.resetPlayer(false);
          break;
        case 'resetHome':
          if (!this.inMenu) this.resetPlayer(true);
          break;
        case 'savePos':
          this.savePosition();
          break;
        case 'loadPos':
          this.loadPosition();
          break;
        case 'camera': {
          const m = this.rig.next();
          this.notify(`Camera: ${cameraLabel(m)}`, 'info');
          break;
        }
        case 'slowmo':
          this.timeScaleIndex = (this.timeScaleIndex + 1) % TIME_SCALES.length;
          this.notify(this.timeScale === 1 ? 'Real time' : `Slow motion ×${this.timeScale}`, 'info');
          break;
        case 'pause':
          this.paused = !this.paused;
          this.notify(this.paused ? 'Physics paused' : 'Physics resumed', 'info');
          break;
        case 'lights':
          if (this.player) {
            this.player.vehicle.headlights = !this.player.vehicle.headlights;
            this.notify(`Headlights ${this.player.vehicle.headlights ? 'on' : 'off'}`, 'info');
          }
          break;
        case 'shiftUp':
          if (this.player && !this.player.vehicle.drivetrain.automatic) this.player.vehicle.drivetrain.shift(this.player.vehicle.drivetrain.gear + 1);
          break;
        case 'shiftDown':
          if (this.player && !this.player.vehicle.drivetrain.automatic) this.player.vehicle.drivetrain.shift(this.player.vehicle.drivetrain.gear - 1);
          break;
        case 'toggleManual':
          if (this.player) {
            const d = this.player.vehicle.drivetrain;
            d.automatic = !d.automatic;
            this.notify(d.automatic ? 'Automatic gearbox' : 'Manual gearbox (E / Q to shift)', 'info');
          }
          break;
        case 'ignition':
          if (this.player) {
            const d = this.player.vehicle.drivetrain;
            if (d.running) {
              d.running = false;
              this.notify('Engine off', 'info');
            } else if (d.start()) this.notify('Engine started', 'info');
            else this.notify('Engine is destroyed', 'bad');
          }
          break;
        case 'horn':
          if (this.player) {
            const p = this.player.vehicle.position;
            this.audio.play('horn', p[0], p[1] + 1, p[2], 0.9, 1, 0.3);
          }
          break;
        case 'spawnProp': {
          const v = this.player?.vehicle;
          if (v) {
            const kinds = ['crate', 'barrel', 'cone', 'tire', 'block'];
            const k = kinds[Math.floor(Math.random() * kinds.length)];
            const x = v.position[0] + v.forward[0] * 12, z = v.position[2] + v.forward[2] * 12;
            this.props.spawn(k, x, this.world.groundHeight(x, z, v.position[1] + 20) + 4, z, Math.random() * 6);
          }
          break;
        }
        case 'freeze':
          if (this.rig.mode === 'free') this.rig.setMode('chase');
          else this.rig.setMode('free');
          this.notify(this.rig.mode === 'free' ? 'Free camera (WASD + mouse, Shift fast)' : 'Chase camera', 'info');
          break;
        default:
          break;
      }
      this.onAction(a);
    }
  }

  private frame(now: number): void {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) dt = 1 / 60;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    const t0 = performance.now();
    this.input.enabled = !this.inMenu && this.rig.mode !== 'free' && !this.editorActive;
    this.input.update(dt);
    this.handleActions();

    // player controls
    const p = this.player;
    if (p) {
      const v = p.vehicle;
      v.input.throttle = this.input.throttle;
      v.input.brake = this.input.brake;
      v.input.steer = this.input.steer;
      v.input.handbrake = this.input.handbrake;
      v.keyboardSteering = !this.input.analogSteering;
    }
    for (const e of this.vehicles) e.ai?.update(dt, e, this.vehicles.filter((o) => o.role !== 'parked'));

    // physics
    const tp = performance.now();
    const simDt = this.paused ? 0 : dt * this.timeScale;
    if (simDt > 0) {
      for (const e of this.vehicles) e.vehicle.frameUpdate(simDt);
      this.acc += simDt;
      const h = this.world.dt;
      let steps = Math.floor(this.acc / h);
      const maxSteps = Math.ceil((1 / 30) / h);
      if (steps > maxSteps) {
        steps = maxSteps;
        this.acc = 0;
      } else this.acc -= steps * h;
      this.world.frameIndex++;
      for (let i = 0; i < steps; i++) this.world.substep();
    }
    this.physMs = this.physMs * 0.9 + (performance.now() - tp) * 0.1;

    // obstacles & props
    const time = this.world.time;
    for (const o of this.obstacles) o.update(simDt, time);
    this.props.update(simDt);

    // vehicle effects, views, audio
    for (const e of [...this.vehicles]) this.updateVehicle(e, dt, simDt);

    // camera
    this.rig.update(dt, p?.vehicle ?? null, this.input, this.world, this.paused);
    this.renderer.setShadowFocus(this.rig.focus);
    this.audio.updateListener(this.renderer.camera);
    this.audio.setWind(p ? Math.hypot(p.vehicle.velocity[0], p.vehicle.velocity[1], p.vehicle.velocity[2]) : 0);

    // effects
    const light = new THREE.Color(1, 1, 1).multiplyScalar(TIMES[this.settings.timeOfDay]?.night ? 0.15 : 0.9);
    this.fx.update(simDt, this.scene.fog as THREE.Fog, light);
    this.updateZone(dt);
    this.renderer.render();
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
    (window as unknown as { __frames: number }).__frames = ((window as unknown as { __frames: number }).__frames ?? 0) + 1;
  }

  private updateZone(dt: number): void {
    this.zoneTimer -= dt;
    if (this.zoneTimer > 0 || !this.player) return;
    this.zoneTimer = 1;
    const v = this.player.vehicle;
    let best = ZONES[0], bd = Infinity;
    for (const z of ZONES) {
      const d = Math.hypot(z.x - v.position[0], z.z - v.position[2]);
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    if (best !== this.currentZone && bd < 140) {
      this.currentZone = best;
      this.notify(`Entering ${best.name}`, 'info');
    }
  }

  private updateVehicle(e: VehicleEntry, dt: number, simDt: number): void {
    const v = e.vehicle;
    const body = v.body;
    if (body.unstable) {
      body.unstable = false;
      if (e.role === 'player') {
        this.notify('Physics recovered: vehicle reset', 'warn');
        this.resetPlayer(false);
      } else {
        this.removeVehicle(e);
      }
      return;
    }
    if (body.min[1] < -100) {
      if (e.role === 'player') this.resetPlayer(true);
      else this.removeVehicle(e);
      return;
    }
    e.view.update();
    const isPlayer = e.role === 'player';
    const pos = v.position;
    // ---- damage events
    for (const ev of v.events) {
      switch (ev.type) {
        case 'glass': {
          const vel = v.velocity;
          if (ev.shattered) {
            this.fx.emitGlass(ev.x, ev.y, ev.z, vel[0], vel[1], vel[2], 50, 0.9);
            this.audio.play('glass', ev.x, ev.y, ev.z, 0.9);
          } else this.audio.play('crunch', ev.x, ev.y, ev.z, 0.5);
          break;
        }
        case 'light':
          this.fx.emitGlass(ev.x, ev.y, ev.z, v.velocity[0], v.velocity[1], v.velocity[2], 14, 0.3);
          this.audio.play('glass', ev.x, ev.y, ev.z, 0.35, 1.6);
          break;
        case 'partDetached': {
          const c = this.partCenter(v, ev.part);
          this.audio.play('tear', c[0], c[1], c[2], 0.9);
          if (isPlayer) this.notify(`${partLabel(ev.part)} torn off`, 'bad');
          break;
        }
        case 'wheelDetached': {
          this.detachWheel(e, ev.wheel);
          if (isPlayer) this.notify(`${wheelLabel(ev.wheel)} wheel ripped off`, 'bad');
          break;
        }
        case 'puncture': {
          const w = v.wheels[ev.wheel];
          this.audio.play('pop', w.center[0], w.center[1], w.center[2], 0.9);
          if (isPlayer) this.notify(`${wheelLabel(ev.wheel)} tire punctured`, 'warn');
          break;
        }
        case 'engineDamaged':
          if (isPlayer && ev.level > 0.3) this.notify(ev.level > 0.75 ? 'Engine critically damaged' : 'Engine damaged', ev.level > 0.75 ? 'bad' : 'warn');
          break;
        case 'engineDead':
          if (isPlayer) this.notify('Engine destroyed', 'bad');
          e.fire = Math.max(e.fire, Math.random() < 0.6 ? 1 : 0);
          break;
        case 'radiator':
          if (isPlayer) this.notify('Radiator punctured: engine overheating', 'warn');
          break;
        case 'shift':
          break;
      }
    }
    v.events.length = 0;

    // ---- impacts
    const now = this.world.time;
    if (body.impactSpeed > 0) {
      const s = body.impactSpeed;
      if (s > 2.5 && now - e.lastCrashSound > 0.12) {
        e.lastCrashSound = now;
        const heavy = s > 8;
        this.audio.play(heavy ? 'crashHeavy' : 'crashLight', body.impactX, body.impactY, body.impactZ, Math.min(1.5, s / (heavy ? 18 : 8)), heavy ? 1 : 1.1, 0.05);
        if (isPlayer) this.rig.addShake(Math.min(1, s / 25));
        if (heavy) {
          const col = new THREE.Color(e.color);
          this.fx.emitDebris(body.impactX, body.impactY, body.impactZ, v.velocity[0], v.velocity[1], v.velocity[2], Math.min(14, Math.floor(s / 2.5)), col, 0.09);
          this.fx.emitDust(body.impactX, body.impactY, body.impactZ, 6, [0.5, 0.5, 0.5], 2, 0.8);
        }
      }
    }
    // keep impact speed for the damage model; vehicle resets it in updateDamage
    if (body.deformEnergy > 1500 && now - e.lastCrunch > 0.2) {
      e.lastCrunch = now;
      this.audio.play('crunch', body.impactX || pos[0], body.impactY || pos[1], body.impactZ || pos[2], Math.min(1, body.deformEnergy / 40000));
    }
    body.deformEnergy = 0;
    body.brokenBeams.length = 0;
    // metal ripped by spikes and shredder teeth
    if (body.tearCount > 0) {
      const col = new THREE.Color(e.color);
      this.fx.emitSparks(body.tearX, body.tearY, body.tearZ, 0, 1, 0, Math.min(10, 2 + body.tearCount * 2), 6);
      this.fx.emitDebris(body.tearX, body.tearY, body.tearZ, v.velocity[0], v.velocity[1], v.velocity[2], Math.min(6, body.tearCount), col, 0.06);
      if (now - e.lastCrunch > 0.15) {
        e.lastCrunch = now;
        this.audio.play('crunch', body.tearX, body.tearY, body.tearZ, Math.min(1, 0.35 + body.tearCount * 0.15));
      }
      body.tearCount = 0;
    }

    // ---- scraping sparks
    let scrape = 0;
    if (body.scrapeCount > 0) {
      scrape = Math.min(1, body.scrapeSpeed / 12) * Math.min(1, body.scrapeCount / 6);
      if (body.scrapeSparks > 0 && simDt > 0) {
        const n = Math.min(12, 1 + Math.floor(body.scrapeSpeed * body.scrapeSparks * 0.02));
        this.fx.emitSparks(body.scrapeX, body.scrapeY + 0.03, body.scrapeZ, body.scrapeNx, body.scrapeNy, body.scrapeNz, n, Math.min(14, body.scrapeSpeed * 0.7), v.velocity[0], v.velocity[1], v.velocity[2]);
      }
    }
    body.scrapeCount = 0;
    body.scrapeSparks = 0;
    body.scrapeSpeed = 0;

    // ---- wheels: smoke, dust, skid marks
    let squeal = 0, gravel = 0;
    const speed = Math.hypot(v.velocity[0], v.velocity[2]);
    for (const w of v.wheels) {
      const key = `${e.id}:${w.index}`;
      if (w.detached || !w.inContact) {
        this.skids.end(key);
        continue;
      }
      const surf = SURFACES[w.surface];
      const cx = w.center[0] - w.cn[0] * w.effRadius, cy = w.center[1] - w.cn[1] * w.effRadius, cz = w.center[2] - w.cn[2] * w.effRadius;
      const slide = w.slide;
      if (surf.skidMarks && slide > 2.5) {
        squeal = Math.max(squeal, Math.min(1, (slide - 2) / 10));
        this.skids.add(key, cx, cy, cz, w.fwd[0], w.fwd[2], w.width * 0.8, Math.min(1, slide / 12));
        if (simDt > 0 && slide > 5 && Math.random() < 0.6 * this.fx.quality) {
          this.fx.emitSmoke(cx, cy + 0.1, cz, w.vel[0] * 0.3, 0.2, w.vel[2] * 0.3, 0.9, 0.85, Math.min(0.5, slide / 30), 2.4);
        }
      } else {
        this.skids.end(key);
      }
      if (surf.dust > 0 && simDt > 0) {
        const wsp = Math.hypot(w.vel[0], w.vel[2]);
        gravel = Math.max(gravel, Math.min(1, wsp / 20) * surf.dust);
        const amount = surf.dust * (wsp / 25 + slide / 8);
        if (Math.random() < amount * 0.8 * this.fx.quality) {
          this.fx.emitDust(cx, cy, cz, 1, surf.dustColor, 1.5 + wsp * 0.05, 0.9 + Math.min(1.5, wsp * 0.04));
        }
      }
      if (w.rimHit > 0.02 && w.flat > 0.5 && surf.sparks && Math.hypot(w.vel[0], w.vel[2]) > 3) {
        this.fx.emitSparks(cx, cy + 0.05, cz, 0, 1, 0, 3, 5);
      }
    }

    // ---- engine smoke / fire
    const d = v.damage;
    e.smokeTimer -= simDt;
    if ((d.engine > 0.25 || d.temperature > 112) && e.smokeTimer <= 0 && simDt > 0) {
      e.smokeTimer = 0.05;
      const ep = v.nodeCenter(v.struct.engineNodes);
      const black = d.engine > 0.6;
      const shade = black ? 0.08 : 0.8;
      this.fx.emitSmoke(ep[0], ep[1] + 0.5, ep[2], v.velocity[0] * 0.2, 0.8, v.velocity[2] * 0.2, black ? 1.2 : 0.8, shade, black ? 0.55 : 0.35, 3);
    }
    if (e.fire > 0 && simDt > 0) {
      const ep = v.nodeCenter(v.struct.engineNodes);
      this.fx.emitFire(ep[0], ep[1] + 0.4, ep[2], 1.2);
      e.fire = Math.max(0, e.fire - simDt * 0.01);
    }

    // ---- audio voices
    const dtn = v.drivetrain;
    const camPos = this.renderer.camera.position;
    const near = Math.hypot(camPos.x - pos[0], camPos.y - pos[1], camPos.z - pos[2]) < 25;
    e.engineVoice?.update(dtn.rpm, dtn.appliedThrottle, dtn.running, dtn.misfire > 0, pos[0], pos[1] + 0.6, pos[2], near);
    e.noiseVoice?.update(squeal, gravel, scrape, speed, pos[0], pos[1] + 0.3, pos[2]);
    void dt;
  }

  private partCenter(v: Vehicle, name: string): [number, number, number] {
    const p = v.body.parts.find((pp) => pp.name === name);
    return p ? v.nodeCenter(p.nodes) : [v.position[0], v.position[1], v.position[2]];
  }

  private detachWheel(e: VehicleEntry, idx: number): void {
    const v = e.vehicle;
    const w = v.wheels[idx];
    const pos = new Float64Array(3), rot = new Float64Array(9);
    v.wheelTransform(idx, pos, rot);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(rot[0], rot[1], rot[2], 0, rot[3], rot[4], rot[5], 0, rot[6], rot[7], rot[8], 0, 0, 0, 0, 1));
    const def = v.def;
    const prop = this.props.spawnWheel(
      def.shape.wheelRadius,
      def.shape.wheelWidth,
      def.features.tireProfile ?? 0.5,
      (def.features.rimStyle ?? 'spoke5') as RimStyle,
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      q,
      new THREE.Vector3(w.vel[0], w.vel[1] + 1.5, w.vel[2]),
      w.omega,
      new THREE.Vector3(w.axle[0], w.axle[1], w.axle[2]),
    );
    prop.body.ignoreBody = v.body;
    prop.body.ignoreUntil = this.world.time + 1.2;
    this.audio.play('tear', pos[0], pos[1], pos[2], 1);
    this.fx.emitSparks(pos[0], pos[1], pos[2], 0, 1, 0, 25, 7);
    this.fx.emitDebris(pos[0], pos[1], pos[2], w.vel[0], w.vel[1], w.vel[2], 8, new THREE.Color(0x333333), 0.08);
  }

  /** Raycast from screen (NDC) into the world: terrain/colliders. */
  pickGround(ndcX: number, ndcY: number): THREE.Vector3 | null {
    const cam = this.renderer.camera;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);
    const o = ray.ray.origin, d = ray.ray.direction;
    const hit = { t: 0, nx: 0, ny: 1, nz: 0, vx: 0, vy: 0, vz: 0, surface: Surface.ASPHALT, collider: null, flags: 0 };
    if (this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 1500, hit)) return new THREE.Vector3(o.x + d.x * hit.t, o.y + d.y * hit.t, o.z + d.z * hit.t);
    return null;
  }

  /** Pick an obstacle under the cursor (render raycast). */
  pickObstacle(ndcX: number, ndcY: number): Obstacle | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.renderer.camera);
    const groups = this.obstacles.map((o) => o.group);
    const hits = ray.intersectObjects(groups, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.obstacle) o = o.parent;
      if (o?.userData.obstacle) return o.userData.obstacle as Obstacle;
    }
    return null;
  }
}

export function cameraLabel(m: CameraMode): string {
  return { chase: 'Chase', orbit: 'Orbit (drag mouse)', driver: 'Driver', hood: 'Hood', cinematic: 'Cinematic', free: 'Free' }[m];
}

function partLabel(name: string): string {
  const map: Record<string, string> = {
    hood: 'Hood',
    trunk: 'Trunk lid',
    bumperF: 'Front bumper',
    bumperR: 'Rear bumper',
    doorFL: 'Front-left door',
    doorFR: 'Front-right door',
    doorRL: 'Rear-left door',
    doorRR: 'Rear-right door',
    engine: 'Engine',
  };
  return map[name] ?? name;
}

function wheelLabel(i: number): string {
  return ['Front-left', 'Front-right', 'Rear-left', 'Rear-right'][i] ?? 'A';
}

// Storage can be missing or throw (private windows, sandboxed frames); the game runs without it.
function storeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function loadSettings(): Settings {
  try {
    const raw = storeGet('wf.settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  // pick a lighter default on small/touch devices
  const mobile = matchMedia('(pointer: coarse)').matches;
  return { ...DEFAULT_SETTINGS, quality: mobile ? 'low' : 'high', physicsHz: mobile ? 1200 : 1500 };
}

function saveSettings(s: Settings): void {
  storeSet('wf.settings', JSON.stringify(s));
}

export { VEHICLES, type VehicleDef };
