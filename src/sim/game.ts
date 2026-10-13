import { CHUNK_SIZE, MOVE_DT, PROTOCOL_VERSION, TICK_DT } from '../shared/constants';
import type { WorldConfig } from '../shared/config';
import { mulberry32, seedFromString } from '../shared/math';
import { encodeChunkFrame, type C2S, type EntSnap, type S2C } from '../shared/net/protocol';
import { chunkKey, rleEncode, type Chunk } from '../shared/world/chunk';
import { DEFAULT_MOVE, fallDamage, isStuck, stepMovement, type MoveInput } from '../shared/sim/movement';
import { makeStack, addToAny } from '../shared/sim/inventory';
import { newVitals } from '../shared/sim/vitals';
import { dayPhase } from '../shared/sim/time';
import type { Link } from './link';
import { log } from './log';
import { Player } from './player';
import type { SaveBundle, WorldStorage } from './storage';
import { SimWorld } from './world';
import { Entities } from './systems/entities';
import { Gather } from './systems/gather';
import { Building } from './systems/building';
import { Tiles } from './systems/tiles';
import { Combat } from './systems/combat';
import { Survival } from './systems/survival';
import { Crafting } from './systems/crafting';
import { Commands } from './systems/commands';
import { Wildlife } from './systems/wildlife';
import { InventoryOps } from './systems/inventoryops';

/**
 * The authoritative simulation ("integrated server"). Owns all game state,
 * runs at a fixed 20 Hz, validates every request coming from the UI and
 * replicates results through a Link. In singleplayer it lives in a Web
 * Worker; tests drive it directly in Node.
 */
export class Game {
  readonly world: SimWorld;
  readonly players = new Map<number, Player>();
  readonly entities: Entities;
  readonly gather: Gather;
  readonly building: Building;
  readonly tiles: Tiles;
  readonly combat: Combat;
  readonly survival: Survival;
  readonly crafting: Crafting;
  readonly commands: Commands;
  readonly wildlife: Wildlife;
  readonly invOps: InventoryOps;
  readonly seed: number;
  readonly rng: () => number;
  /** World clock in seconds (drives day/night), persisted. */
  time = 0;
  /** Simulated seconds since this session started (monotonic, pauses with the game). */
  now = 0;
  tickCount = 0;
  weather = 0;
  paused = false;
  private weatherTarget = 0;
  private nextId = 1;
  private lastSave = Date.now();
  private saving: Promise<void> | null = null;
  private queuedSave: Promise<void> | null = null;
  private chunkFrameCache = new Map<number, { rev: number; frame: Uint8Array }>();
  private streamOffsets: Array<[number, number]> = [];
  private savedPlayer: { id: number; name: string; save: ReturnType<Player['toSave']> } | null = null;
  perf = { tickMs: 0, maxTickMs: 0, saveMs: 0, snapshots: 0 };
  private tickTimes: number[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly config: WorldConfig, readonly storage: WorldStorage) {
    const stored = storage.getMeta('seed');
    this.seed = stored !== undefined ? Number(stored) : /^-?\d+$/.test(config.seed) ? Number(config.seed) >>> 0 : seedFromString(config.seed);
    this.rng = mulberry32(this.seed ^ (Date.now() & 0xffffff));
    this.world = new SimWorld(this.seed, storage, config.genBudgetMs);
    this.entities = new Entities(this);
    this.tiles = new Tiles(this);
    this.building = new Building(this);
    this.combat = new Combat(this);
    this.gather = new Gather(this);
    this.survival = new Survival(this);
    this.crafting = new Crafting(this);
    this.commands = new Commands(this);
    this.wildlife = new Wildlife(this);
    this.invOps = new InventoryOps(this);
    this.world.onFreshChunk = (c) => this.tiles.onFreshChunk(c);
    const r = config.viewDistance;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dz * dz <= r * r + r) this.streamOffsets.push([dx, dz]);
    this.streamOffsets.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
    this.load();
  }

  allocId() {
    return this.nextId++;
  }

  // ------------------------------------------------------------------ persistence
  private load() {
    this.time = Number(this.storage.getMeta('time') ?? 0) || this.config.dayLengthMin * 60 * 0.05;
    this.nextId = Number(this.storage.getMeta('nextId') ?? 1) || 1;
    const objs = this.storage.loadObjects();
    for (const o of objs) {
      try {
        const data = JSON.parse(o.data);
        if (o.kind === 'piece') this.building.loadPiece(o.id, data);
        else if (o.kind === 'tile') this.tiles.loadTile(data);
        else if (o.kind === 'corpse') this.entities.loadCorpse(o.id, data);
        else if (o.kind === 'player') this.savedPlayer = { id: o.id, name: data.name, save: data.save };
        this.nextId = Math.max(this.nextId, o.id + 1);
      } catch (e) {
        // A damaged record must not take the whole world down: skip it and say so.
        log.error('Skipped unreadable save record', { id: o.id, kind: o.kind, error: String(e) });
      }
    }
    this.building.rebuildAll();
    this.tiles.relinkTotems();
    log.info('World loaded', { seed: this.seed, objects: objs.length, pieces: this.building.pieces.size, tiles: this.tiles.tiles.size });
  }

  /**
   * Snapshot all state and persist it atomically. If a save is already in
   * flight, a new snapshot is queued to run after it (never coalesced into
   * the older snapshot, which would silently drop the latest changes).
   */
  save(reason = 'autosave'): Promise<void> {
    if (this.saving) {
      if (!this.queuedSave) {
        this.queuedSave = this.saving.then(() => {
          this.queuedSave = null;
          return this.save(reason);
        });
      }
      return this.queuedSave;
    }
    const t0 = performance.now();
    const dirty = this.world.dirtyChunks();
    const chunks = dirty.map((c) => this.world.encodeForSave(c));
    const bundle: SaveBundle = {
      meta: { time: String(this.time), nextId: String(this.nextId), seed: String(this.seed), schema: '1', config: JSON.stringify(this.config), savedAt: new Date().toISOString() },
      chunks,
      objects: [],
    };
    for (const p of this.players.values()) bundle.objects.push({ id: p.id, kind: 'player', data: JSON.stringify({ name: p.name, save: p.toSave() }) });
    for (const o of this.building.saveObjects()) bundle.objects.push(o);
    for (const o of this.tiles.saveObjects()) bundle.objects.push(o);
    for (const o of this.entities.saveObjects()) bundle.objects.push(o);
    this.saving = this.storage
      .save(bundle)
      .then(() => {
        this.world.markSaved(chunks);
        this.perf.saveMs = performance.now() - t0;
        log.info('World saved', { reason, ms: Math.round(this.perf.saveMs), chunks: chunks.length, objects: bundle.objects.length });
        for (const p of this.players.values()) p.link?.send({ t: 'saved', ms: Math.round(this.perf.saveMs) });
      })
      .catch((e) => {
        log.error('Save failed — previous save is intact', { error: String(e) });
        for (const p of this.players.values()) this.msg(p, 'Save failed! Your previous save is intact. ' + String(e), 'error');
      })
      .finally(() => {
        this.saving = null;
      });
    return this.saving;
  }

  // ------------------------------------------------------------------ session
  /** Attach the local player. Restores their saved state, or spawns them on a beach. */
  join(link: Link, rawName: string): Player {
    const name = String(rawName || 'Survivor').replace(/[^A-Za-z0-9_ ]/g, '').trim().slice(0, 16) || 'Survivor';
    let p: Player;
    if (this.savedPlayer) {
      p = new Player(this.savedPlayer.id, this.savedPlayer.name || name, 0, 0, 0);
      p.load(this.savedPlayer.save);
      this.savedPlayer = null;
    } else {
      const spawn = this.world.gen.findBeachSpawn(this.rng, 600);
      p = new Player(this.allocId(), name, spawn.x, spawn.y, spawn.z);
      this.giveStartItems(p);
      log.info('New character', { name, x: Math.round(spawn.x), z: Math.round(spawn.z) });
    }
    p.link = link;
    p.ready = false;
    this.players.set(p.id, p);
    if (p.alive) this.entities.add(p);
    link.send({
      t: 'welcome', id: p.id, name: p.name, seed: this.seed, time: this.time,
      rules: { dayLengthMin: this.config.dayLengthMin, nightFraction: this.config.nightFraction, viewDistance: this.config.viewDistance, cheats: this.config.cheats },
      pos: [p.x, p.y, p.z],
    });
    const pois = this.world.gen.pois.poisNear(p.x, p.z, 2500).map((q) => ({ name: q.def.name, x: q.cx, z: q.cz, tier: q.def.tier }));
    link.send({ t: 'map', pois });
    link.send({ t: 'bps', list: [...p.blueprints] });
    link.send({ t: 'time', time: this.time, weather: this.weather });
    if (!p.alive) this.sendDeath(p);
    return p;
  }

  giveStartItems(p: Player) {
    for (const [id, n] of this.config.startItems) {
      try {
        addToAny(p.inv.pickupOrder(id), makeStack(id, n));
      } catch (e) {
        log.warn('Bad start item in config', { id, error: String(e) });
      }
    }
  }

  /** Entry point for every request from the UI. Never trusts its contents. */
  handle(p: Player, m: C2S) {
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    try {
      this.dispatch(p, m);
    } catch (e) {
      log.warn('Error handling request', { t: m.t, error: String(e), stack: (e as Error).stack?.split('\n').slice(0, 4).join(' | ') });
    }
  }

  private dispatch(p: Player, m: C2S) {
    switch (m.t) {
      case 'in':
        if (!Array.isArray(m.cmds) || m.cmds.length > 30) return;
        for (const c of m.cmds) if (c && typeof c.seq === 'number' && p.inputQueue.length < 90) p.inputQueue.push(sanitizeInput(c));
        return;
      case 'ping':
        p.link?.send({ t: 'pong', ct: Number(m.ct) || 0, st: Date.now() });
        return;
      case 'pause':
        this.paused = !!m.on;
        if (this.paused) void this.save('pause');
        return;
      case 'save':
        void this.save('manual');
        return;
      case 'chat':
        this.commands.chat(p, String(m.text ?? ''));
        return;
      case 'respawn':
        this.respawn(p, typeof m.bag === 'number' ? m.bag : undefined);
        return;
    }
    if (!p.alive || !p.ready || this.paused) return;
    const yaw = 'yaw' in m ? finite(m.yaw) : 0;
    const pitch = 'pitch' in m ? Math.max(-1.6, Math.min(1.6, finite(m.pitch))) : 0;
    switch (m.t) {
      case 'select':
        if (Number.isInteger(m.slot) && m.slot >= 0 && m.slot < 6) {
          p.sel = m.slot;
          p.pendingUse = null;
          p.pendingReload = null;
          p.reloadUntil = 0;
          p.ver++;
        }
        return;
      case 'swing': return this.gather.swing(p, yaw, pitch);
      case 'fire': return this.combat.fire(p, yaw, pitch);
      case 'reload': return this.combat.reload(p);
      case 'throw': return this.combat.throwExplosive(p, yaw, pitch);
      case 'interact': return this.tiles.interact(p, yaw, pitch);
      case 'drink': return this.survival.drink(p, yaw, pitch);
      case 'place': return this.tiles.placeHeld(p, yaw, pitch);
      case 'build': return this.building.requestBuild(p, String(m.piece), yaw, pitch, Math.floor(Number(m.rot)) || 0, m.tier);
      case 'buildpreview': return this.building.preview(p, String(m.piece), yaw, pitch, Math.floor(Number(m.rot)) || 0);
      case 'hammer': return this.building.hammer(p, m.mode, yaw, pitch, m.tier);
      case 'inspect': return this.building.inspect(p, yaw, pitch);
      case 'consume': return this.survival.useHeld(p);
      case 'inv': return this.invOps.handle(p, m);
      case 'craft': return this.crafting.request(p, String(m.id), Math.floor(Number(m.qty)) || 1);
      case 'cancelCraft': return this.crafting.cancel(p, Math.floor(Number(m.idx)));
      case 'close':
        p.loot = null;
        return;
      case 'research': return this.tiles.research(p);
      case 'lock': return this.tiles.lockOp(p, m.op, m.code);
      case 'totem': return this.tiles.totemOp(p, m.op);
      case 'toggle': return this.tiles.toggle(p);
    }
  }

  // ------------------------------------------------------------------ simulation
  /** Start the fixed-rate loop (drift-corrected, drops time when overloaded). */
  start() {
    let last = performance.now();
    let acc = 0;
    const loop = () => {
      const nowMs = performance.now();
      acc += (nowMs - last) / 1000;
      last = nowMs;
      let steps = 0;
      while (acc >= TICK_DT && steps < 5) {
        this.tick();
        acc -= TICK_DT;
        steps++;
      }
      if (acc > TICK_DT * 5) acc = 0;
      this.timer = setTimeout(loop, Math.max(1, (TICK_DT - acc) * 1000));
    };
    this.timer = setTimeout(loop, TICK_DT * 1000);
    this.lastSave = Date.now();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  tick() {
    const t0 = performance.now();
    const dt = TICK_DT;
    this.world.beginTick();
    if (!this.paused) {
      this.now += dt;
      this.time += dt;
      this.tickCount++;
      for (const p of this.players.values()) {
        this.processInputs(p, dt);
        p.recordHistory(this.now);
      }
      this.survival.tick(dt);
      this.crafting.tick(dt);
      this.tiles.tick(dt);
      this.combat.tick(dt);
      this.entities.tick(dt);
      this.wildlife.tick(dt);
      this.building.tick(dt);
      this.tickWeather(dt);
    }
    this.streamChunks();
    this.flushBlocks();
    if (!this.paused) {
      this.sendSnapshots();
      this.replicate();
      if (this.tickCount % 20 === 0) for (const p of this.players.values()) p.link?.send({ t: 'time', time: this.time, weather: this.weather });
      if (this.tickCount % 100 === 0) this.gather.cleanup();
      if (this.tickCount % 200 === 0) {
        const keep = new Set<number>();
        for (const p of this.players.values()) for (const k of p.sentChunks) keep.add(k);
        this.world.unloadIdle(60_000, keep);
        for (const k of this.chunkFrameCache.keys()) if (!this.world.chunks.has(k)) this.chunkFrameCache.delete(k);
      }
      if (Date.now() - this.lastSave > this.config.saveIntervalSec * 1000) {
        this.lastSave = Date.now();
        void this.save();
      }
    }
    const ms = performance.now() - t0;
    this.tickTimes.push(ms);
    if (this.tickTimes.length > 200) this.tickTimes.shift();
    this.perf.tickMs = this.tickTimes.reduce((a, b) => a + b, 0) / this.tickTimes.length;
    this.perf.maxTickMs = Math.max(...this.tickTimes);
  }

  private processInputs(p: Player, dt: number) {
    p.moveBudget = Math.min(p.moveBudget + dt, 0.25);
    if (!p.ready) {
      // Wait until the 3x3 chunks around the player exist and were sent.
      const cx = Math.floor(p.x / CHUNK_SIZE), cz = Math.floor(p.z / CHUNK_SIZE);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const k = chunkKey(cx + dx, cz + dz);
        if (!this.world.chunks.has(k) || !p.sentChunks.has(k)) {
          p.inputQueue.length = 0;
          return;
        }
      }
      if (isStuck(this.world, p.move)) this.unstick(p);
      p.ready = true;
      p.spawnedAt = this.now;
      p.link?.send({ t: 'spawned', pos: [p.x, p.y, p.z] });
    }
    let n = 0;
    while (p.inputQueue.length && p.moveBudget >= MOVE_DT - 1e-9 && n < 20) {
      const cmd = p.inputQueue.shift()!;
      if (cmd.seq <= p.lastSeq) continue;
      p.lastSeq = cmd.seq;
      p.moveBudget -= MOVE_DT;
      n++;
      if (!p.alive) continue;
      if (p.vitals.hyd <= 0) cmd.sprint = false;
      p.yaw = cmd.yaw;
      p.pitch = cmd.pitch;
      const ev = stepMovement(p.move, cmd, this.world, MOVE_DT, DEFAULT_MOVE);
      if (ev.landedSpeed > 0) {
        const dmg = fallDamage(ev.landedSpeed);
        if (dmg > 0) {
          this.combat.damagePlayer(p, dmg, 'fall', null);
          if (this.rng() < 0.4) p.vitals.bleed += 5;
        }
      }
      if (cmd.sprint && ev.groundDist > 0) this.survival.exert(p, ev.groundDist);
    }
    // Commands beyond what real time allows are discarded, keeping simulation speed honest.
    if (p.inputQueue.length > 45) p.inputQueue.splice(0, p.inputQueue.length - 45);
    if (p.y < -20) this.combat.damagePlayer(p, 1000, 'fall', null);
  }

  unstick(p: Player) {
    for (let i = 0; i < 128 && isStuck(this.world, p.move); i++) p.move.y += 1;
    p.move.vy = 0;
  }

  private streamChunks() {
    for (const p of this.players.values()) {
      const link = p.link;
      if (!link || link.closed) continue;
      const pcx = Math.floor(p.x / CHUNK_SIZE), pcz = Math.floor(p.z / CHUNK_SIZE);
      let sent = 0;
      for (const [dx, dz] of this.streamOffsets) {
        const cx = pcx + dx, cz = pcz + dz;
        const key = chunkKey(cx, cz);
        if (p.sentChunks.has(key)) {
          this.world.lastNeeded.set(key, Date.now());
          continue;
        }
        if (link.buffered > 2_000_000 || sent >= 12) break;
        if (!this.world.request(cx, cz)) break; // generation budget used up this tick
        link.sendBin(this.chunkFrame(this.world.getChunk(cx, cz)!));
        p.sentChunks.add(key);
        sent++;
      }
      const r = this.config.viewDistance + 2;
      const unload: Array<[number, number]> = [];
      for (const key of p.sentChunks) {
        const cx = Math.floor(key / 65536) - 32768, cz = (key % 65536) - 32768;
        if (Math.abs(cx - pcx) > r || Math.abs(cz - pcz) > r) {
          p.sentChunks.delete(key);
          unload.push([cx, cz]);
        }
      }
      if (unload.length) link.send({ t: 'unload', keys: unload });
    }
  }

  private chunkFrame(c: Chunk): Uint8Array {
    const cached = this.chunkFrameCache.get(c.key);
    if (cached && cached.rev === c.rev) return cached.frame;
    const frame = encodeChunkFrame(c.cx, c.cz, c.rev, rleEncode(c.blocks));
    this.chunkFrameCache.set(c.key, { rev: c.rev, frame });
    return frame;
  }

  private flushBlocks() {
    if (!this.world.pending.size) return;
    for (const p of this.players.values()) {
      if (!p.link) continue;
      const list: Array<[number, number, number, number]> = [];
      for (const [key, changes] of this.world.pending) if (p.sentChunks.has(key)) list.push(...changes);
      if (list.length) p.link.send({ t: 'blocks', list });
    }
    this.world.pending.clear();
  }

  private sendSnapshots() {
    const range = this.config.entityRange;
    for (const p of this.players.values()) {
      if (!p.link) continue;
      const ents: EntSnap[] = [];
      const seen = new Set<number>();
      for (const e of this.entities.near(p.x, p.z, range)) {
        if (e.id === p.id) continue;
        seen.add(e.id);
        if (e.dynamic || p.known.get(e.id) !== e.ver) {
          ents.push(e.snap());
          p.known.set(e.id, e.ver);
        }
      }
      const gone: number[] = [];
      for (const id of p.known.keys()) if (!seen.has(id)) gone.push(id);
      for (const id of gone) p.known.delete(id);
      const m = p.move;
      const flags = (m.onGround ? 1 : 0) | (m.inWater ? 2 : 0) | (m.crouching ? 4 : 0);
      p.link.send({ t: 'snap', st: Date.now(), ack: p.lastSeq, me: [m.x, m.y, m.z, m.vx, m.vy, m.vz, flags], ents, gone: gone.length ? gone : undefined });
      this.perf.snapshots++;
    }
  }

  private replicate() {
    for (const p of this.players.values()) {
      if (!p.link) continue;
      this.invOps.replicate(p);
      if (this.tickCount % 5 === 0) this.survival.replicate(p);
      this.crafting.replicate(p);
    }
  }

  private tickWeather(dt: number) {
    if (this.tickCount % (20 * 60) === 0) this.weatherTarget = this.rng() < 0.3 ? 0.4 + this.rng() * 0.6 : 0;
    this.weather += Math.sign(this.weatherTarget - this.weather) * Math.min(Math.abs(this.weatherTarget - this.weather), dt * 0.01);
  }

  isNight() {
    return dayPhase(this.time, this.config.dayLengthMin) >= 1 - this.config.nightFraction;
  }

  // ------------------------------------------------------------------ death & respawn
  sendDeath(p: Player) {
    const bags = this.tiles.bagsOf(p.name).map((b) => ({
      id: b.id, name: b.label, pos: [b.x, b.y, b.z] as [number, number, number],
      cooldown: Math.max(0, Math.ceil(b.readyAt - this.now)),
    }));
    p.link?.send({ t: 'died', by: p.killedBy, pos: [p.x, p.y, p.z], bags });
  }

  respawn(p: Player, bagId?: number) {
    if (p.alive) return;
    let pos: { x: number; y: number; z: number } | null = null;
    if (bagId !== undefined) {
      const bag = this.tiles.bagsOf(p.name).find((b) => b.id === bagId);
      if (!bag) return this.msg(p, 'That sleeping bag no longer exists', 'error');
      if (bag.readyAt > this.now) return this.msg(p, `Sleeping bag on cooldown (${Math.ceil(bag.readyAt - this.now)}s)`, 'error');
      this.tiles.useBag(p, bag);
      pos = { x: bag.x + 0.5, y: bag.y, z: bag.z + 0.5 };
    }
    if (!pos) pos = this.world.gen.findBeachSpawn(this.rng, 900);
    this.world.ensureSyncAt(pos.x, pos.z);
    p.move.x = pos.x; p.move.y = pos.y; p.move.z = pos.z;
    p.move.vx = p.move.vy = p.move.vz = 0;
    p.alive = true;
    p.vitals = newVitals();
    p.inv.clear();
    p.craftQueue = [];
    this.giveStartItems(p);
    p.sel = 0;
    p.loot = null;
    p.ready = false;
    p.history = [];
    p.ver++;
    this.entities.add(p);
    log.info('Player respawned', { name: p.name, bag: bagId ?? null });
  }

  msg(p: Player, text: string, kind: Extract<S2C, { t: 'msg' }>['kind'] = 'info') {
    p.link?.send({ t: 'msg', text, kind });
  }

  /** Sound/visual effect event to players within `radius`. */
  fx(k: string, x: number, y: number, z: number, radius: number, extra: { a?: number; b?: number; s?: string } = {}, except?: Player) {
    for (const p of this.players.values()) {
      if (!p.link || p === except) continue;
      if (Math.hypot(p.x - x, p.z - z) > radius) continue;
      p.link.send({ t: 'fx', k, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, z: Math.round(z * 100) / 100, ...extra });
    }
  }

  statusText(): string {
    return [
      `tick: avg ${this.perf.tickMs.toFixed(2)} ms, max ${this.perf.maxTickMs.toFixed(2)} ms (budget ${(TICK_DT * 1000).toFixed(0)} ms)`,
      `chunks loaded ${this.world.chunks.size} (generated ${this.world.stats.generated}, from save ${this.world.stats.fromSave}, avg gen ${(this.world.stats.genMs / Math.max(1, this.world.stats.generated)).toFixed(1)} ms)`,
      `entities ${this.entities.count()}, pieces ${this.building.pieces.size}, deployables ${this.tiles.tiles.size}, animals ${this.wildlife.animals.size}`,
      `last save ${this.perf.saveMs.toFixed(1)} ms · world time ${Math.floor(this.time)} s · weather ${this.weather.toFixed(2)}`,
    ].join('\n');
  }

  /** Save and stop (closing the world). */
  async shutdown() {
    this.stop();
    await this.save('quit');
  }
}

/** Protocol version check for the UI <-> simulation boundary. */
export const SIM_PROTOCOL = PROTOCOL_VERSION;

function finite(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeInput(c: MoveInput): MoveInput {
  return {
    seq: Math.floor(finite(c.seq)),
    f: Math.max(-1, Math.min(1, finite(c.f))),
    s: Math.max(-1, Math.min(1, finite(c.s))),
    jump: !!c.jump,
    sprint: !!c.sprint,
    crouch: !!c.crouch,
    yaw: finite(c.yaw),
    pitch: Math.max(-1.6, Math.min(1.6, finite(c.pitch))),
  };
}
