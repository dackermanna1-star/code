/**
 * The Game: owns renderer, input, worlds/dimensions, entities, player, systems, and the
 * fixed-step main loop (20 TPS logic, 60 Hz physics, variable-rate rendering).
 */
import * as THREE from 'three';
import { Renderer, presetSettings, type ViewProvider } from '../render/renderer';
import { Input } from '../core/input';
import { Emitter } from '../core/events';
import { World, SetFlags } from '../world/world';
import { ChunkManager } from '../world/chunkManager';
import type { Chunk } from '../world/chunk';
import { EntityManager, createEntity } from '../entity/manager';
import { Player } from '../entity/player';
import { ItemEntity } from '../entity/itemEntity';
import { Interaction } from './interaction';
import { CameraController } from './camera';
import { loadSettings, saveSettings, type GameSettings } from './settings';
import type { GameSystem } from './systems';
import { sunDirection, moonPhase, skyDarken } from './time';
import { BLOCKS, type DropContext, type DropSpec } from '../world/blocks/registry';
import { behaviorOf } from '../world/blocks/behaviors';
import { stack as mkStack, tryItem, type ItemStack } from './items/registry';
import { generateStubMaterials, StubAtmosphere } from '../render/stubs';
import type { AtmosphereLike } from '../render/types';
import { ENTITY_SHARED } from '../render/entityMaterial';
import type { DimensionId, WorldType } from '../world/gen/generator';
import { BIOMES } from '../world/biomes';
import { TICK_SECONDS, PHYSICS_DT, DAY_LENGTH_TICKS } from '../core/constants';
import { seedFromString } from '../core/rng';
import type { Entity } from '../entity/entity';
import { LodTerrain } from '../render/lodTerrain';

export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard';

export interface WorldInfo {
  id: string;
  name: string;
  seed: number;
  gameMode: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty: Difficulty;
  createdAt: number;
  lastPlayed: number;
  hardcore?: boolean;
  cheats?: boolean;
  /** Never saved (title-screen panorama, test harness). */
  transient?: boolean;
  /** Overworld generator preset (missing = 'default'). */
  worldType?: WorldType;
}

export interface GameEvents {
  [k: string]: any;
}

const optionalModules = import.meta.glob(['../render/materials/generator.ts', '../render/sky/index.ts', '../audio/index.ts']);
async function optional(path: string): Promise<any | null> {
  const f = optionalModules[path];
  if (!f) return null;
  try {
    return await f();
  } catch (e) {
    console.warn('optional module failed', path, e);
    return null;
  }
}

const DEFAULT_GAMERULES: Record<string, any> = { doDaylightCycle: true, doWeatherCycle: true, doMobSpawning: true, keepInventory: false, naturalRegeneration: true, mobGriefing: true, doFireTick: true, randomTickSpeed: 3 };

export class Game {
  readonly renderer: Renderer;
  readonly input: Input;
  readonly events = new Emitter<GameEvents>();
  settings: GameSettings;
  readonly cameraCtl: CameraController;
  readonly interaction: Interaction;
  readonly systems: GameSystem[] = [];
  /** Optional services provided by systems */
  audio: any = null;
  itemModels: any = null;
  ui: any = null;
  particles: any = null;
  /** Gore system (wounds, decals, dismemberment) - filled by GoreSystem. */
  gore: any = null;
  physics: any = null;
  saver: any = null;

  info!: WorldInfo;
  dimension: DimensionId = 'overworld';
  world!: World;
  chunks!: ChunkManager;
  entities!: EntityManager;
  player!: Player;
  difficulty: Difficulty = 'normal';
  gamerules: Record<string, any> = { ...DEFAULT_GAMERULES };

  /** Absolute game ticks and day time (ticks). */
  ticks = 0;
  dayTime = 1000;
  readonly weather = { rain: 0, thunder: 0, raining: false, thundering: false, wetness: 0, rainTime: 12000 + Math.floor(Math.random() * 168000), thunderTime: 12000 + Math.floor(Math.random() * 168000) };
  paused = false;
  running = false;
  realTime = 0;
  private acc = 0;
  private physAcc = 0;
  private lastFrame = 0;
  private raf = 0;
  fps = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  /** True while the initial terrain around the player is loading. */
  loading = true;
  /** Hook for the UI to observe frames */
  onFrame: ((dt: number) => void) | null = null;
  readonly sunDir = new THREE.Vector3();
  readonly moonDir = new THREE.Vector3();
  /** Distant terrain LOD beyond the loaded chunks. */
  readonly lod = new LodTerrain();

  constructor(readonly canvas: HTMLCanvasElement, settings?: GameSettings) {
    this.settings = settings ?? loadSettings();
    this.renderer = new Renderer(canvas, this.settings.quality);
    this.renderer.applySettings({ ...presetSettings(this.settings.quality), renderScale: this.settings.renderScale });
    this.input = new Input(canvas);
    this.input.sensitivity = this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;
    this.cameraCtl = new CameraController(this);
    this.cameraCtl.baseFov = this.settings.fov;
    this.cameraCtl.viewBobbing = this.settings.viewBobbing;
    this.interaction = new Interaction(this);
    this.lod.outerRadius = this.settings.lodDistance;
    window.addEventListener('resize', () => this.renderer.resize(window.innerWidth, window.innerHeight));
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  /** Load GPU materials, atmosphere, audio. */
  async initGraphics(onProgress?: (msg: string, f: number) => void) {
    onProgress?.('Generating materials', 0);
    const matMod = await optional('../render/materials/generator.ts');
    let mats;
    if (matMod?.generateBlockMaterials) {
      try {
        mats = await matMod.generateBlockMaterials(this.renderer.gl, this.settings.textureSize, (f: number) => onProgress?.('Generating materials', f));
      } catch (e) {
        console.error('material generation failed, using fallback', e);
      }
    }
    if (!mats) mats = await generateStubMaterials(this.renderer.gl, 16);
    this.renderer.setMaterials(mats);
    onProgress?.('Building atmosphere', 1);
    const skyMod = await optional('../render/sky/index.ts');
    let atmo: AtmosphereLike;
    try {
      atmo = skyMod?.Atmosphere ? new skyMod.Atmosphere(this.renderer.gl, this.settings.quality) : new StubAtmosphere(this.renderer.gl);
    } catch (e) {
      console.error('atmosphere failed, using fallback', e);
      atmo = new StubAtmosphere(this.renderer.gl);
    }
    this.renderer.setAtmosphere(atmo);
    const audioMod = await optional('../audio/index.ts');
    if (audioMod?.AudioEngine) {
      try {
        this.audio = new audioMod.AudioEngine();
      } catch (e) {
        console.warn('audio unavailable', e);
      }
    }
  }

  addSystem(s: GameSystem) {
    this.systems.push(s);
  }

  async initSystems() {
    for (const s of this.systems) await s.init?.(this);
  }

  // ------------------------------------------------------------------ worlds
  async startWorld(info: WorldInfo, saved?: any) {
    this.info = info;
    this.difficulty = info.difficulty;
    this.ticks = saved?.ticks ?? 0;
    this.dayTime = saved?.dayTime ?? 1000;
    if (saved?.weather) Object.assign(this.weather, saved.weather);
    // reset first: the title-screen panorama world turns mob spawning off
    for (const k of Object.keys(this.gamerules)) delete this.gamerules[k];
    Object.assign(this.gamerules, DEFAULT_GAMERULES, saved?.gamerules ?? {});
    this.player = new Player();
    if (saved?.player) this.player.deserialize(saved.player);
    else this.player.setGameMode(info.gameMode);
    const dim: DimensionId = saved?.dimension ?? 'overworld';
    await this.enterDimension(dim, saved?.player ? this.player.pos.clone() : null);
    for (const s of this.systems) if (saved?.systems?.[s.name] !== undefined) s.load?.(this, saved.systems[s.name]);
  }

  /** Switch to a dimension; `pos` null = find spawn. */
  async enterDimension(dim: DimensionId, pos: THREE.Vector3 | null) {
    if (this.chunks) {
      await this.saver?.saveDimension?.(this);
      this.chunks.dispose();
      this.renderer.chunks.clear();
      this.entities?.clear();
      this.lod.clear();
    }
    this.dimension = dim;
    await this.saver?.enterDimension?.(this, dim);
    this.world = new World(dim, this.info.seed, dim === 'overworld' ? this.info.worldType ?? 'default' : 'default');
    this.world.tick = this.ticks;
    this.entities = new EntityManager(this, this.world);
    this.chunks = new ChunkManager(this.world, this.renderer.chunks, {
      renderDistance: this.settings.renderDistance,
      bevels: this.settings.bevels,
      decorations: this.settings.decorations,
      onChunkReady: (c) => this.onChunkReady(c),
      loadSaved: this.saver?.loadChunk ? (d, cx, cz) => this.saver.loadChunk(this, d, cx, cz) : undefined,
      onUnload: (c) => this.saver?.chunkUnloaded?.(c),
    });
    let p = pos;
    if (!p) {
      if (dim === 'overworld' && this.player.spawnPoint && this.player.spawnDimension === 'overworld') p = this.player.spawnPoint.clone();
      else {
        const s = await this.chunks.findSpawn();
        p = new THREE.Vector3(s.x, s.y, s.z);
        if (typeof s.yaw === 'number') { this.player.yaw = s.yaw; this.player.pitch = -0.08; }
      }
    }
    this.player.setPos(p.x, p.y, p.z);
    this.player.vel.set(0, 0, 0);
    this.entities.add(this.player);
    this.loading = true;
    this.renderer.resetTemporal();
    for (const s of this.systems) s.onWorldChange?.(this, this.world);
    this.events.emit('dimensionChanged', { dimension: dim });
  }

  private onChunkReady(c: Chunk) {
    const pending = c.data.pendingEntities as { type: string; x: number; y: number; z: number; data?: any }[] | undefined;
    if (pending) {
      for (const pe of pending) {
        const e = createEntity(pe.type);
        if (!e) continue;
        e.setPos(pe.x, pe.y, pe.z);
        if (pe.data) Object.assign(e.data, pe.data);
        this.entities.add(e);
      }
      delete c.data.pendingEntities;
    }
    const saved = (c.data.savedEntities as any[] | undefined) ?? this.saver?.takeEntities?.(c.cx, c.cz);
    if (saved) {
      for (const o of saved) {
        const e = createEntity(o.type);
        if (!e) continue;
        e.deserialize(o);
        this.entities.add(e);
      }
      delete c.data.savedEntities;
    }
    this.events.emit('chunkReady', { chunk: c });
  }

  // ------------------------------------------------------------------ loop
  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame(t);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  frame(now: number) {
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (dt > 0.25) dt = 0.25;
    this.realTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    const p = this.player;
    // chunk streaming
    this.chunks.update(p.pos.x, p.pos.z);
    this.lod.enabled = this.settings.lod && this.dimension === 'overworld';
    if (!this.loading) this.lod.update(this.chunks, p.pos.x, p.pos.z, this.realTime);
    if (this.loading) {
      const near = this.chunks.nearReady(2) && this.world.isLoaded(Math.floor(p.pos.x), Math.floor(p.pos.z));
      if (near) {
        this.loading = false;
        this.ensureSafeSpawn();
        this.events.emit('worldReady', {});
      }
    }
    const frozen = this.paused || this.loading;
    if (!frozen) {
      this.handleFrameInput(dt);
      // fixed physics
      this.physAcc += dt;
      let n = 0;
      while (this.physAcc >= PHYSICS_DT && n < 8) {
        this.physAcc -= PHYSICS_DT;
        this.applyPlayerIntent();
        this.entities.physics(PHYSICS_DT);
        for (const s of this.systems) s.physics?.(this, PHYSICS_DT);
        n++;
      }
      if (n === 8) this.physAcc = 0;
      // fixed logic ticks
      this.acc += dt;
      let k = 0;
      while (this.acc >= TICK_SECONDS && k < 5) {
        this.acc -= TICK_SECONDS;
        this.tick();
        k++;
      }
      if (k === 5) this.acc = 0;
    }
    const alpha = Math.min(1, this.physAcc / PHYSICS_DT);
    this.cameraCtl.update(alpha, dt);
    this.interaction.updateTarget();
    this.entities.updateVisuals(alpha, dt);
    for (const s of this.systems) s.update?.(this, dt, alpha);
    // the loading screen covers the view; skipping the scene keeps slow GPUs from starving the
    // chunk/mesh workers (their results are consumed on the main thread)
    if (!this.loading) this.render(dt);
    this.audioListener();
    this.onFrame?.(dt);
    this.input.endFrame();
  }

  private ensureSafeSpawn() {
    const p = this.player;
    // push the player up out of terrain if needed
    for (let i = 0; i < 64; i++) {
      const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
      const y = Math.floor(p.pos.y);
      const a = this.world.getBlock(x, y, z), b = this.world.getBlock(x, y + 1, z);
      const solidA = a && BLOCKS[a >>> 4].solid, solidB = b && BLOCKS[b >>> 4].solid;
      if (!solidA && !solidB) break;
      p.setPos(p.pos.x, y + 1, p.pos.z);
    }
  }

  private handleFrameInput(dt: number) {
    const inp = this.input;
    const p = this.player;
    if (!inp.enabled || !inp.locked) return;
    const [mx, my] = inp.consumeMouse();
    const sens = 0.0022 * (0.3 + this.settings.sensitivity * 1.4) * (inp.isDown('zoom') ? 0.25 : 1);
    const veh = p.vehicle as any;
    if (veh?.onMouse && !p.dead) {
      // seated: the vehicle turns mouse movement into pedals / camera look
      veh.onMouse(-mx * sens, -my * sens * (this.settings.invertY ? -1 : 1));
    } else if (!p.dead && !p.sleeping) {
      p.yaw -= mx * sens;
      p.pitch -= my * sens * (this.settings.invertY ? -1 : 1);
      p.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, p.pitch));
    }
    // hotbar
    const w = inp.consumeWheel();
    if (w) {
      p.inventory.selected = (((p.inventory.selected + w) % 9) + 9) % 9;
      p.inventory.changed();
    }
    for (let i = 1; i <= 9; i++) if (inp.wasPressed(('hotbar' + i) as any)) { p.inventory.selected = i - 1; p.inventory.changed(); }
    if (inp.wasPressed('perspective')) this.cameraCtl.cyclePerspective();
    if (p.vehicle && inp.wasPressed('vehicleView')) {
      const c = this.cameraCtl;
      c.perspective = c.perspective === 'first' ? 'third_back' : 'first';
    }
    // sprint / fly toggles
    if (inp.consumeDoubleTapSprint() && p.food > 6 || inp.isDown('sprint') && inp.isDown('forward') && (p.food > 6 || p.creative)) p.sprinting = true;
    if (inp.consumeDoubleTapJump() && p.mayFly) {
      p.flying = !p.flying;
      if (p.flying) p.vel.y = 0;
    }
    if (inp.wasPressed('drop') && !veh) this.dropHeld(inp.isDown('sprint'));
    if (inp.wasPressed('swapHands')) {
      const inv = p.inventory;
      const a = inv.get(inv.selected), b = inv.get(40);
      inv.set(inv.selected, b);
      inv.set(40, a);
    }
    void dt;
  }

  private applyPlayerIntent() {
    const p = this.player;
    const inp = this.input;
    const active = inp.enabled && !p.dead && !p.sleeping;
    const veh = p.vehicle as any;
    if (veh) {
      // seated: keys fly the vehicle instead of walking
      p.intent.forward = p.intent.strafe = 0;
      p.intent.jump = false;
      p.sneaking = false;
      p.sprinting = false;
      veh.pilotInput?.(inp, active);
      return;
    }
    p.intent.forward = active ? (inp.isDown('forward') ? 1 : 0) - (inp.isDown('back') ? 1 : 0) : 0;
    p.intent.strafe = active ? (inp.isDown('right') ? 1 : 0) - (inp.isDown('left') ? 1 : 0) : 0;
    p.intent.jump = active && inp.isDown('jump');
    p.sneaking = active && inp.isDown('sneak');
    if (p.intent.forward <= 0) p.sprinting = false;
  }

  /** One 20 TPS game tick. */
  tick() {
    this.ticks++;
    if (this.gamerules.doDaylightCycle) this.dayTime = (this.dayTime + 1) % (DAY_LENGTH_TICKS * 1000000);
    this.tickWeather();
    this.world.runTick([this.player.pos], Math.min(8, this.settings.renderDistance));
    this.interaction.tick();
    for (const s of this.systems) s.tick?.(this);
    this.entities.tick();
    this.pickupItems();
    this.input.endTick();
  }

  private tickWeather() {
    const w = this.weather;
    if (this.dimension !== 'overworld') { w.rain = 0; w.thunder = 0; return; }
    if (this.gamerules.doWeatherCycle) {
      if (--w.rainTime <= 0) {
        w.raining = !w.raining;
        w.rainTime = w.raining ? 12000 + Math.floor(Math.random() * 12000) : 12000 + Math.floor(Math.random() * 168000);
      }
      if (--w.thunderTime <= 0) {
        w.thundering = !w.thundering;
        w.thunderTime = w.thundering ? 3600 + Math.floor(Math.random() * 12000) : 12000 + Math.floor(Math.random() * 168000);
      }
    }
    w.rain += ((w.raining ? 1 : 0) - w.rain) * 0.01;
    w.thunder += ((w.raining && w.thundering ? 1 : 0) - w.thunder) * 0.01;
  }

  private pickupItems() {
    const p = this.player;
    if (p.dead || p.spectator) return;
    const box = p.box.grow(1).expand(0, 0.5, 0);
    for (const e of this.entities.query(box, (o) => o.type === 'item')) {
      const it = e as ItemEntity;
      if (it.pickupDelay > 0 || it.collector || it.removed) continue;
      const before = it.stack.count;
      const left = p.inventory.add(it.stack);
      if (left < before) {
        this.events.emit('itemPickup', { player: p, entity: it, stack: it.stack, count: before - left });
        if (left === 0) {
          it.collector = p;
          it.collectTicks = 0;
        } else it.stack.count = left;
      }
    }
  }

  // ------------------------------------------------------------------ rendering
  private render(dt: number) {
    const p = this.player;
    const cam = this.cameraCtl.camera;
    sunDirection(this.dayTime, this.sunDir);
    this.moonDir.copy(this.sunDir).negate();
    ENTITY_SHARED.u_viewInvRot.value.setFromMatrix4(cam.matrixWorld);
    const eye = this.cameraCtl.eyeWorld;
    const biome = BIOMES[this.world.getBiome(Math.floor(eye.x), Math.floor(eye.z))];
    const waterFog = new THREE.Color(biome?.waterFog ?? 0x050533).multiplyScalar(4);
    const camBlock = this.world.getBlock(Math.floor(cam.position.x), Math.floor(cam.position.y), Math.floor(cam.position.z));
    const camDef = BLOCKS[camBlock >>> 4];
    // underwater plants (kelp, seagrass, corals) are waterlogged
    const underwater = (camBlock >>> 4) !== 0 && (camDef.liquid === 1 || /^(kelp|seagrass|sea_pickle)$|_coral(_fan)?$/.test(camDef.name));
    const sky = {
      sunDir: this.sunDir, moonDir: this.moonDir, moonPhase: moonPhase(this.ticks + this.dayTime), time: this.realTime,
      rain: this.weather.rain, thunder: this.weather.thunder, dimension: this.dimension as 'overworld' | 'nether' | 'end',
      cameraPosition: cam.position, renderDistance: this.lod.enabled ? Math.max(this.lod.outerRadius, this.settings.renderDistance * 16) : this.settings.renderDistance * 16,
      biomeFogColor: biome?.fog !== undefined ? new THREE.Color(biome.fog) : undefined,
    };
    const gb: THREE.Scene[] = [this.entities.scene, this.lod.scene];
    const fw: THREE.Scene[] = [this.entities.forwardScene];
    const extra = this.renderExtras;
    if (extra.gbuffer) gb.push(...extra.gbuffer);
    if (extra.forward) fw.push(...extra.forward);
    this.renderer.render({
      camera: cam,
      time: this.realTime,
      dt,
      sky,
      underwater,
      waterFogColor: waterFog,
      wind: this.weather.rain * 0.6 + this.weather.thunder * 0.4,
      wetness: (this.weather as any).wetness ?? this.weather.rain,
      nightVision: extra.nightVision ?? (p.hasEffect('night_vision') ? 1 : 0),
      damage: p.hurtTime > 0 ? p.hurtTime / p.hurtDuration : 0,
      overlay: extra.overlay,
      gbufferScenes: gb,
      shadowScenes: [this.entities.scene, ...(extra.shadow ?? [])],
      forwardScenes: fw,
      hand: extra.hand,
      overlayScene: extra.overlayScene,
      views: extra.views,
    });
  }

  /** Scenes contributed by systems (particles, hand, outlines ...). */
  readonly renderExtras: { nightVision?: number; gbuffer?: THREE.Scene[]; forward?: THREE.Scene[]; shadow?: THREE.Scene[]; hand?: { scene: THREE.Scene; camera: THREE.Camera }; overlayScene?: THREE.Scene; overlay?: THREE.Vector4; views?: ViewProvider } = {};

  private audioListener() {
    if (!this.audio?.setListener) return;
    const cam = this.cameraCtl.camera;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    this.audio.setListener(cam.position, f, u);
  }

  // ------------------------------------------------------------------ world helpers
  /** Daylight factor 0..1 (for spawning / daylight detectors). */
  get skyLightFactor() {
    return skyDarken(this.dayTime, this.weather.rain, this.weather.thunder);
  }
  get isDay() {
    const t = this.dayTime % 24000;
    return t < 12542 || t > 23460;
  }

  /** Remove a block, run hooks and spawn drops. */
  breakBlock(x: number, y: number, z: number, drops: boolean, player?: Player | null, tool?: ItemStack | null) {
    const st = this.world.getBlock(x, y, z);
    if (!st) return;
    const def = BLOCKS[st >>> 4];
    // liquids flow back in via fluid behaviour (onNeighborChange)
    this.world.setBlock(x, y, z, 0, SetFlags.ALL);
    this.events.emit('blockBroken', { x, y, z, state: st, player: player ?? null, tool: tool ?? null });
    if (drops) {
      const items = this.resolveDrops(def.drops, st, tool ?? null, def.silkTouchable);
      for (const s of items) this.dropItem(s, new THREE.Vector3(x + 0.5, y + 0.4, z + 0.5), undefined, 10);
      if (def.xp && !(tool?.ench?.silk_touch)) {
        const [a, b] = def.xp;
        const n = a + Math.floor(Math.random() * (b - a + 1));
        if (n > 0) this.spawnXp(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), n);
      }
    }
    // block entity contents (chests) drop
    const be = this.world.getBlockEntity(x, y, z);
    if (be) {
      if (Array.isArray(be.items)) for (const s of be.items) if (s && s.item) this.dropItem(s, new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), undefined, 10);
      this.world.setBlockEntity(x, y, z, null);
    }
  }

  resolveDrops(spec: DropSpec, state: number, tool: ItemStack | null, silkable: boolean): ItemStack[] {
    const def = BLOCKS[state >>> 4];
    const silk = !!tool?.ench?.silk_touch;
    const fortune = tool?.ench?.fortune ?? 0;
    const out: ItemStack[] = [];
    const add = (name: string, count: number) => {
      const it = tryItem(name);
      if (it && count > 0) out.push(mkStack(it, count));
    };
    if (silk && silkable && def.item) { add(def.item, 1); return out; }
    if (spec === 'none') return out;
    if (spec === 'self') { if (def.item) add(def.item, 1); return out; }
    if (typeof spec === 'string') { add(spec, 1); return out; }
    if (typeof spec === 'function') {
      const ctx: DropContext = { meta: state & 15, rand: Math.random, fortune, silkTouch: silk, toolType: tool?.item.tool?.type ?? 'none' };
      for (const d of spec(ctx)) add(d.item, d.count);
      return out;
    }
    for (const e of spec) {
      if (e.chance !== undefined && Math.random() >= e.chance) continue;
      const min = e.min ?? 1, max = e.max ?? min;
      let n = min + Math.floor(Math.random() * (max - min + 1));
      if (fortune > 0 && e.fortune === 'ore') {
        const r = Math.floor(Math.random() * (fortune + 2)) - 1;
        n *= Math.max(1, r + 1);
      } else if (fortune > 0 && e.fortune === 'uniform') n += Math.floor(Math.random() * (fortune + 1));
      add(e.item, n);
    }
    return out;
  }

  dropItem(s: ItemStack, pos: THREE.Vector3, vel?: THREE.Vector3, pickupDelay = 10): ItemEntity {
    const e = ItemEntity.from(s);
    e.setPos(pos.x, pos.y, pos.z);
    if (vel) e.vel.copy(vel);
    else e.vel.set((Math.random() - 0.5) * 2, 3 + Math.random() * 1.5, (Math.random() - 0.5) * 2);
    e.pickupDelay = pickupDelay;
    this.entities.add(e);
    return e;
  }

  dropHeld(all: boolean) {
    const p = this.player;
    const inv = p.inventory;
    const s = inv.held;
    if (!s) return;
    const n = all ? s.count : 1;
    const drop = { ...s, count: n };
    inv.consumeHeld(n);
    const dir = p.lookDir();
    const pos = p.eyePos.addScaledVector(dir, 0.3).add(new THREE.Vector3(0, -0.3, 0));
    this.dropItem(drop, pos, dir.multiplyScalar(6).add(new THREE.Vector3(0, 2, 0)), 40);
    p.swing();
    this.events.emit('itemDropped', { player: p, stack: drop });
  }

  /** Spawn experience; systems may turn this into XP orbs (event), default gives it directly. */
  spawnXp(pos: THREE.Vector3, amount: number) {
    let handled = false;
    this.events.emit('spawnXp', { pos, amount, handle: () => { handled = true; } });
    if (!handled) this.player.addXp(amount);
  }

  /** Replaces the default respawn logic (beds, respawn anchors, dimension return). */
  respawnHandler: ((game: Game) => Promise<void> | void) | null = null;

  /** Respawn the dead player (death screen "Respawn"). */
  async respawnPlayer() {
    if (this.respawnHandler) return this.respawnHandler(this);
    const sp = this.player.spawnPoint;
    const p = sp ?? this.player.pos;
    this.player.respawn(p.x, p.y + (sp ? 0 : 1), p.z);
    if (!sp) this.chunks.findSpawn().then((s) => this.player.setPos(s.x, s.y, s.z));
  }

  spawn<T extends Entity>(e: T, x: number, y: number, z: number): T {
    e.setPos(x, y, z);
    return this.entities.add(e);
  }

  message(text: string, color = '#fff') {
    this.events.emit('chat', { text, color });
  }

  /** Placeholder used by UI before a world exists */
  static createInfo(name: string, seedText: string, gameMode: WorldInfo['gameMode'], difficulty: Difficulty, worldType: WorldType = 'default'): WorldInfo {
    const seed = seedText.trim() ? seedFromString(seedText) : Math.floor(Math.random() * 2 ** 31);
    return { id: `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, name: name || 'New World', seed, gameMode, difficulty, createdAt: Date.now(), lastPlayed: Date.now(), cheats: true, ...(worldType !== 'default' ? { worldType } : {}) };
  }

  applySettings(s: Partial<GameSettings>) {
    const prev = this.settings;
    this.settings = { ...this.settings, ...s };
    saveSettings(this.settings);
    if (s.quality && s.quality !== prev.quality) this.renderer.applySettings({ ...presetSettings(s.quality), renderScale: this.settings.renderScale });
    if (s.renderScale !== undefined) this.renderer.applySettings({ renderScale: s.renderScale });
    if (s.renderDistance !== undefined && this.chunks) this.chunks.renderDistance = s.renderDistance;
    if (s.fov !== undefined) this.cameraCtl.baseFov = s.fov;
    if (s.viewBobbing !== undefined) this.cameraCtl.viewBobbing = s.viewBobbing;
    if (s.sensitivity !== undefined) this.input.sensitivity = s.sensitivity;
    if ((s.bevels !== undefined && s.bevels !== prev.bevels) || (s.decorations !== undefined && s.decorations !== prev.decorations)) {
      if (this.chunks) {
        this.chunks.bevels = this.settings.bevels;
        this.chunks.decorations = this.settings.decorations;
        this.chunks.remeshAll();
      }
    }
    if (s.brightness !== undefined) this.renderer.lightUniforms.u_minAmbient.value = 0.002 + s.brightness * 0.01;
    if (s.lodDistance !== undefined) this.lod.outerRadius = s.lodDistance;
    this.audio?.setMasterVolume?.(this.settings.masterVolume);
    this.audio?.setCategoryVolume?.('music', this.settings.musicVolume);
  }

  /** Behaviour helper: notify block use hooks for redstone etc. */
  behavior(state: number) {
    return behaviorOf(state >>> 4);
  }
}
