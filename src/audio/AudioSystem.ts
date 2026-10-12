// Web Audio playback of the original Seal Hunter sounds.
//
// Graph:  voice (source → gain → stereo pan) → game bus / ui bus ─┐
//         ambience → duck → ambience gate → ambience volume ──────┼→ master → compressor → limiter → out
// The game bus and ambience gate close while paused; the ui bus stays open
// for menu sounds. Gunshots duck the ambience so they always cut through.
import { SPAWN_X } from '../config/constants';
import { ENEMIES } from '../config/enemies';
import { WEAPONS, type WeaponId } from '../config/weapons';
import type { EventBus } from '../core/Events';
import { Ambience } from './Ambience';
import { SOUND_FILES } from './manifest';
import { embeddedBytes } from '../core/embedded';
import {
  ENEMY_SOUNDS,
  RULES,
  SFX,
  WEAPON_SOUNDS,
  fireSchedule,
  groupMembers,
  groupOf,
  groupPrefix,
  isGroup,
  laughFor,
  reloadSchedule,
  type ScheduledSound,
  type SoundRef,
} from './soundMap';

export interface PlayOpts {
  /** World x for stereo pan, -20..20. */
  x?: number;
  /** World depth; only used with a first-person listener (defaults to the listener's z). */
  z?: number;
  volume?: number;
  /** Playback rate (pitch). Defaults to a small random variation for game sounds. */
  rate?: number;
}

interface VoiceOpts extends PlayOpts {
  /** Start this many seconds from now. */
  delay?: number;
  priority?: number;
  /** Stop playing instances of the same file first (pygame play_sound(snd, True)). */
  restart?: boolean;
  /** Stop playing instances of the same group first (one laugh at a time). */
  restartGroup?: boolean;
  loop?: boolean;
}

interface Voice {
  name: string;
  group: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode | null;
  level: number;
  start: number;
  end: number;
  priority: number;
  loop: boolean;
  ui: boolean;
  done: boolean;
}

export interface WeaponTickState {
  playerId: number;
  id: WeaponId;
  state: 'idle' | 'fire' | 'reload';
  ticks: number;
  fireTicks: number;
  reloadTicks: number;
  firingHeld: boolean;
  x: number;
}

interface WeaponTrack {
  id: WeaponId;
  state: WeaponTickState['state'];
  ticks: number;
  /** Highest tick whose scheduled sounds were handled in the current phase. */
  done: number;
  reloadTicks: number;
  spinning: boolean;
  idleRun: number;
  lastFireTicks: number;
}

export const MAX_PER_NAME = 4;
export const MAX_VOICES = 48;
const DEFAULT_GROUP_LIMIT = 6;
const GROUP_LIMITS: Record<string, number> = {
  'weapons/sshell': 4,
  'weapons/shell': 4,
  'weapons/shshell': 4,
  'weapons/3/bounce': 3,
  'misc/genhit': 5,
  'misc/headshot': 4,
  'misc/gib': 4,
  'misc/meat': 3,
  'padda/ric': 3,
  'brunsal/hit': 2,
  'isbjorn/hit': 2,
  'valross/hit': 2,
  'aktivist/hit': 3,
  'pingvin/quack': 4,
  'player/laugh': 1,
};
const PITCH_VARIATION = 0.04;
/** Ambience bus level relative to the gunfire. */
const AMBIENCE_LEVEL = 0.16;
const TICK_SEC = 1 / 50;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Mix level per file (the port played everything at volume 0.5). */
function baseGain(name: string): number {
  if (name === 'ui/saying') return 0.3;
  if (name.startsWith('ui/')) return 0.45;
  if (name === 'weapons/3/explosion') return 0.72;
  if (/^weapons\/\d+\/fire\d$/.test(name)) return 0.6;
  if (/^weapons\/s?h?shell/.test(name)) return 0.42;
  if (name.startsWith('weapons/3/bounce')) return 0.45;
  if (name.startsWith('weapons/')) return 0.5;
  if (name.startsWith('misc/genhit') || name.startsWith('misc/headshot')) return 0.45;
  if (name.startsWith('misc/gib')) return 0.55;
  if (name.startsWith('player/')) return 0.55;
  return 0.5;
}

/** Who wins when the global voice budget is full (higher keeps playing). */
function priorityOf(name: string): number {
  if (name.startsWith('ui/')) return 5;
  if (/^weapons\/\d+\/fire\d$/.test(name) || name === 'weapons/3/explosion') return 4;
  if (name.startsWith('player/')) return 3;
  if (/^weapons\/s?h?shell/.test(name) || name.startsWith('weapons/3/bounce')) return 1;
  return 2;
}

/** Slight volume drop toward the screen edges. */
const edgeGain = (x: number) => 1 - 0.2 * clamp((Math.abs(x) - 10) / 12, 0, 1);

type Ctx = BaseAudioContext;

function createContext(): AudioContext | null {
  const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const C = w.AudioContext ?? w.webkitAudioContext;
  if (!C) return null;
  try {
    return new C({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
}

function defaultBaseUrl(): string {
  try {
    return `${import.meta.env.BASE_URL ?? './'}audio/`;
  } catch {
    return 'audio/';
  }
}

export class AudioSystem {
  readonly ctx: Ctx | null;
  private readonly baseUrl: string;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly known = new Set(SOUND_FILES);
  private readonly failed: string[] = [];
  private readonly warned = new Set<string>();
  private readonly groups = new Map<string, string[]>();
  private readonly lastPick = new Map<string, string>();
  private voices: Voice[] = [];
  private listener: { x: number; z: number; yaw: number } | null = null;
  private zOf: ((enemyId: number) => number | undefined) | null = null;
  private readonly loops = new Map<string, Voice>();
  private readonly tracks = new Map<number, WeaponTrack>();
  private loadPromise: Promise<void> | null = null;
  private loaded = false;
  private paused = false;

  private master!: GainNode;
  private sfxVol!: GainNode;
  private gameBus!: GainNode;
  private uiBus!: GainNode;
  private ambVol!: GainNode;
  private ambGate!: GainNode;
  private ambDuck!: GainNode;
  private ambience: Ambience | null = null;
  private ambienceWanted = false;
  private ambienceEnabled = true;
  private duckUntil = 0;

  // Event-binding state.
  private levelNum = 1;
  private readonly cooldowns = new Map<string, number>();
  private readonly lastPain = new Map<number, number>();
  private readonly pendingByEnemy = new Map<number, Voice[]>();
  private readonly tickDamage = new Map<number, number>();
  private readonly recentDead = new Set<number>();
  private readonly deferred: (() => void)[] = [];
  private flushQueued = false;

  /** Debug counters. */
  readonly stats = { played: 0, stolen: 0, dropped: 0, peakVoices: 0 };
  /** Debug hook: called for every voice started (`at` = context start time). */
  onPlay: ((name: string, at: number) => void) | null = null;

  constructor(opts: { context?: BaseAudioContext; baseUrl?: string } = {}) {
    this.baseUrl = opts.baseUrl ?? defaultBaseUrl();
    this.ctx = opts.context ?? createContext();
    const ctx = this.ctx;
    if (!ctx) return;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    comp.connect(limiter).connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.connect(comp);
    this.sfxVol = ctx.createGain();
    this.sfxVol.connect(this.master);
    this.gameBus = ctx.createGain();
    this.gameBus.connect(this.sfxVol);
    this.uiBus = ctx.createGain();
    this.uiBus.connect(this.sfxVol);
    this.ambVol = ctx.createGain();
    this.ambVol.gain.value = AMBIENCE_LEVEL;
    this.ambVol.connect(this.master);
    this.ambGate = ctx.createGain();
    this.ambGate.connect(this.ambVol);
    this.ambDuck = ctx.createGain();
    this.ambDuck.connect(this.ambGate);
    this.ambience = new Ambience(ctx, this.ambDuck);
  }

  // ------------------------------------------------------------- loading

  /** Fetch + decode all sounds (parallel, tolerant of individual failures). */
  load(onProgress?: (done: number, total: number) => void): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    const total = SOUND_FILES.length;
    const ctx = this.ctx;
    if (!ctx) {
      onProgress?.(total, total);
      this.loaded = true;
      return (this.loadPromise = Promise.resolve());
    }
    let done = 0;
    const one = async (name: string) => {
      try {
        let data = embeddedBytes(`audio/${name}.wav`);
        if (!data) {
          const res = await fetch(`${this.baseUrl}${name}.wav`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          data = await res.arrayBuffer();
        }
        const buf = await new Promise<AudioBuffer>((resolve, reject) => {
          const p = ctx.decodeAudioData(data, resolve, reject);
          if (p && typeof p.then === 'function') p.then(resolve, reject);
        });
        this.buffers.set(name, buf);
      } catch (err) {
        this.failed.push(name);
        this.warnOnce(name, `[audio] could not load "${name}": ${(err as Error)?.message ?? err}`);
      } finally {
        done++;
        onProgress?.(done, total);
      }
    };
    this.loadPromise = Promise.all(SOUND_FILES.map(one)).then(() => {
      this.loaded = true;
      this.groups.clear();
    });
    return this.loadPromise;
  }

  /** Number of decoded sounds. */
  get loadedCount(): number {
    return this.buffers.size;
  }
  get totalCount(): number {
    return SOUND_FILES.length;
  }
  get failedSounds(): readonly string[] {
    return this.failed;
  }
  get soundNames(): readonly string[] {
    return SOUND_FILES;
  }
  /** One-shot voices plus loops currently allocated. */
  get activeVoices(): number {
    if (this.ctx) this.prune(this.ctx.currentTime);
    return this.voices.length + this.loops.size;
  }
  get activeLoops(): number {
    return this.loops.size;
  }
  /** Voice counts by file and by group (debug). */
  voiceStats(): { total: number; loops: number; byName: Record<string, number>; byGroup: Record<string, number> } {
    const byName: Record<string, number> = {};
    const byGroup: Record<string, number> = {};
    if (this.ctx) this.prune(this.ctx.currentTime);
    for (const v of this.voices) {
      byName[v.name] = (byName[v.name] ?? 0) + 1;
      byGroup[v.group] = (byGroup[v.group] ?? 0) + 1;
    }
    return { total: this.voices.length + this.loops.size, loops: this.loops.size, byName, byGroup };
  }

  // ------------------------------------------------------------- control

  /** Resume the AudioContext on the first user gesture. */
  unlock(): void {
    const ctx = this.ctx as AudioContext | null;
    if (!ctx || typeof ctx.resume !== 'function') return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  setVolumes(master: number, sfx: number, ambience: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.master.gain.setTargetAtTime(clamp(master, 0, 1), now, 0.015);
    this.sfxVol.gain.setTargetAtTime(clamp(sfx, 0, 1), now, 0.015);
    this.ambienceEnabled = ambience;
    if (!ambience) this.ambience?.stop(0.4);
    else if (this.ambienceWanted && !this.paused) this.ambience?.start(1);
  }

  /** Synthesised arctic ambience: filtered-noise wind with slow gusts + faint water lapping. */
  startAmbience(): void {
    this.ambienceWanted = true;
    if (this.ambienceEnabled) this.ambience?.start();
  }

  stopAmbience(): void {
    this.ambienceWanted = false;
    this.ambience?.stop();
  }

  /** Pause menu: silence game sounds and ambience; ui/* sounds keep playing. */
  suspend(): void {
    const ctx = this.ctx;
    if (!ctx || this.paused) return;
    this.paused = true;
    const now = ctx.currentTime;
    this.gameBus.gain.setTargetAtTime(0, now, 0.02);
    this.ambGate.gain.setTargetAtTime(0, now, 0.08);
  }

  resume(): void {
    const ctx = this.ctx;
    if (!ctx || !this.paused) return;
    this.paused = false;
    const now = ctx.currentTime;
    this.gameBus.gain.setTargetAtTime(1, now, 0.02);
    this.ambGate.gain.setTargetAtTime(1, now, 0.25);
  }

  // ------------------------------------------------------------- playback

  /**
   * First person: pan by direction relative to the view heading (left of the
   * view -> left ear) instead of by world x. null = classic panning.
   */
  setListener(l: { x: number; z: number; yaw: number } | null): void {
    if (!l) {
      this.listener = null;
      return;
    }
    const cur = this.listener ?? (this.listener = { x: 0, z: 0, yaw: 0 });
    cur.x = l.x;
    cur.z = l.z;
    cur.yaw = l.yaw;
  }

  /** Stereo pan and level factor for a world position. */
  private panFor(x: number, z: number | undefined): [number, number] {
    const l = this.listener;
    if (!l) return [clamp(x / 22, -1, 1), edgeGain(x)];
    const dx = x - l.x;
    const dz = (z ?? l.z) - l.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) return [0, 1];
    // right of the view = (-sin yaw, -cos yaw) (config/firstPerson.ts rightDir)
    const side = (dx * -Math.sin(l.yaw) + dz * -Math.cos(l.yaw)) / d;
    return [clamp(side * 0.85, -1, 1), 1 - 0.3 * clamp((d - 8) / 30, 0, 1)];
  }

  play(name: string, opts?: PlayOpts): void {
    this.voice(name, opts ?? {});
  }

  /** Random pick among sounds named prefix + digits ('misc/gib' → gib1..gib7), never the same twice running. */
  playRandom(prefix: string, opts?: PlayOpts): void {
    const name = this.pick(prefix);
    if (name) this.voice(name, opts ?? {});
  }

  startLoop(key: string, name: string, opts: PlayOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const cur = this.loops.get(key);
    if (cur && cur.name === name) {
      const now = ctx.currentTime;
      if (opts.x !== undefined && cur.pan) cur.pan.pan.setTargetAtTime(this.panFor(opts.x, opts.z)[0], now, 0.03);
      if (opts.volume !== undefined) {
        const lvl = baseGain(name) * opts.volume * (opts.x !== undefined ? this.panFor(opts.x, opts.z)[1] : 1);
        if (Math.abs(lvl - cur.level) > 1e-3) {
          cur.level = lvl;
          cur.gain.gain.setTargetAtTime(lvl, now, 0.03);
        }
      }
      return;
    }
    if (cur) this.stopLoop(key, 30);
    const v = this.voice(name, { ...opts, loop: true, rate: opts.rate ?? 1 });
    if (v) this.loops.set(key, v);
  }

  stopLoop(key: string, fadeMs = 80): void {
    const v = this.loops.get(key);
    if (!v) return;
    this.loops.delete(key);
    this.kill(v, fadeMs / 1000);
  }

  /** Play a fixed name or a random group reference ('misc/gib*'). */
  playRef(ref: SoundRef, opts: PlayOpts = {}): void {
    this.ref(ref, opts);
  }

  private ref(ref: SoundRef, o: VoiceOpts): Voice | null {
    if (isGroup(ref)) {
      const name = this.pick(groupPrefix(ref));
      return name ? this.voice(name, o) : null;
    }
    return this.voice(ref, o);
  }

  private pick(prefix: string): string | null {
    let members = this.groups.get(prefix);
    if (!members) {
      members = groupMembers(prefix, this.loaded ? this.buffers.keys() : SOUND_FILES);
      if (this.loaded) this.groups.set(prefix, members);
    }
    if (!members.length) {
      this.warnOnce(`group:${prefix}`, `[audio] no sounds match "${prefix}<n>"`);
      return null;
    }
    const last = this.lastPick.get(prefix);
    let name = members[Math.floor(Math.random() * members.length)];
    if (members.length > 1 && name === last) {
      const i = members.indexOf(name);
      name = members[(i + 1 + Math.floor(Math.random() * (members.length - 1))) % members.length];
    }
    this.lastPick.set(prefix, name);
    return name;
  }

  private warnOnce(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(msg);
  }

  private voice(name: string, o: VoiceOpts): Voice | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const buf = this.buffers.get(name);
    if (!buf) {
      if (!this.known.has(name)) this.warnOnce(name, `[audio] unknown sound "${name}"`);
      else if (this.loaded) this.warnOnce(name, `[audio] sound "${name}" is not loaded`);
      return null;
    }
    const ui = name.startsWith('ui/');
    if (this.paused && !ui) return null;
    const now = ctx.currentTime;
    const when = now + Math.max(0, o.delay ?? 0);
    const group = groupOf(name);
    const priority = o.priority ?? priorityOf(name);
    const loop = !!o.loop;
    this.prune(now);

    if (!loop) {
      if (o.restart) this.killWhere((v) => v.name === name);
      if (o.restartGroup) this.killWhere((v) => v.group === group);
      this.limit((v) => v.name === name, MAX_PER_NAME);
      this.limit((v) => v.group === group, GROUP_LIMITS[group] ?? DEFAULT_GROUP_LIMIT);
      if (this.voices.length >= MAX_VOICES) {
        // Steal the least important voice: lowest priority, then quietest, then oldest.
        let victim: Voice | null = null;
        for (const v of this.voices) {
          if (v.priority > priority) continue;
          if (
            !victim ||
            v.priority < victim.priority ||
            (v.priority === victim.priority && (v.level < victim.level - 1e-3 || (Math.abs(v.level - victim.level) <= 1e-3 && v.start < victim.start)))
          ) {
            victim = v;
          }
        }
        if (!victim) {
          this.stats.dropped++;
          return null;
        }
        this.kill(victim, 0.012);
        this.stats.stolen++;
      }
    }

    let level = baseGain(name) * (o.volume ?? 1);
    // Flam guard: identical-group sounds starting together (shotgun pellets) don't stack at full level.
    let together = 0;
    for (const v of this.voices) if (v.group === group && Math.abs(v.start - when) < 0.02) together++;
    if (together) level *= Math.pow(0.72, Math.min(together, 3));
    let pan = 0;
    if (o.x !== undefined && Number.isFinite(o.x)) {
      const [pn, g] = this.panFor(o.x, o.z);
      pan = pn;
      level *= g;
    }
    const rate = o.rate ?? (ui ? 1 : 1 + (Math.random() * 2 - 1) * PITCH_VARIATION);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    if (loop) {
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(level, when + 0.012);
    } else {
      gain.gain.value = level;
    }
    src.connect(gain);
    let tail: AudioNode = gain;
    let panner: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function' && (pan !== 0 || loop)) {
      panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      tail = panner;
    }
    tail.connect(ui ? this.uiBus : this.gameBus);
    const v: Voice = {
      name,
      group,
      src,
      gain,
      pan: panner,
      level,
      start: when,
      end: loop ? Infinity : when + buf.duration / rate,
      priority,
      loop,
      ui,
      done: false,
    };
    src.onended = () => this.release(v);
    src.start(when);
    if (!loop) this.voices.push(v);
    this.stats.played++;
    this.onPlay?.(name, when);
    const n = this.voices.length + this.loops.size + (loop ? 1 : 0);
    if (n > this.stats.peakVoices) this.stats.peakVoices = n;
    return v;
  }

  /** Keep at most `max - 1` matching voices so a new one fits; steals the oldest. */
  private limit(match: (v: Voice) => boolean, max: number): void {
    let n = 0;
    for (const v of this.voices) if (match(v)) n++;
    while (n >= max) {
      let oldest: Voice | null = null;
      for (const v of this.voices) if (match(v) && (!oldest || v.start < oldest.start)) oldest = v;
      if (!oldest) break;
      this.kill(oldest, 0.015);
      this.stats.stolen++;
      n--;
    }
  }

  private killWhere(match: (v: Voice) => boolean): void {
    for (const v of this.voices.slice()) if (match(v)) this.kill(v, 0.02);
  }

  private kill(v: Voice, fade: number): void {
    if (v.done) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const g = v.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(v.start > now ? 0 : g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
    try {
      v.src.stop(Math.max(now + fade + 0.005, v.start));
    } catch {
      /* not started or already stopped */
    }
    this.release(v, fade);
  }

  /** Drop a voice from the books and disconnect it once its fade is over. */
  private release(v: Voice, fade = 0): void {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    if (v.done) return;
    v.done = true;
    const tail = v.pan ?? v.gain;
    setTimeout(() => {
      try {
        tail.disconnect();
      } catch {
        /* ignore */
      }
    }, fade * 1000 + 60);
  }

  /** Forget finished voices even if 'ended' hasn't been delivered yet (suspended context). */
  private prune(now: number): void {
    if (!this.voices.length) return;
    let n = 0;
    for (const v of this.voices) if (v.end > now - 0.05) this.voices[n++] = v;
    this.voices.length = n;
  }

  private duckAmbience(depth = 0.45): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambience?.running) return;
    const now = ctx.currentTime;
    const g = this.ambDuck.gain;
    if (now < this.duckUntil - 0.1) {
      this.duckUntil = now + 0.25;
      return;
    }
    this.duckUntil = now + 0.25;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(depth, now, 0.015);
    g.setTargetAtTime(1, now + 0.25, 0.5);
  }

  /** True once per `ms` for `key` (dedupes events that describe the same moment). */
  private once(key: string, ms: number): boolean {
    const t = performance.now();
    const last = this.cooldowns.get(key);
    if (last !== undefined && t - last < ms) return false;
    this.cooldowns.set(key, t);
    return true;
  }

  private defer(fn: () => void): void {
    this.deferred.push(fn);
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      const fns = this.deferred.splice(0);
      for (const f of fns) f();
      this.recentDead.clear();
      this.tickDamage.clear();
    });
  }

  private pain(enemyId: number, ref: SoundRef | undefined, x: number | undefined): void {
    if (!ref) return;
    const now = performance.now();
    const last = this.lastPain.get(enemyId);
    if (last !== undefined && now - last < 120) return;
    this.lastPain.set(enemyId, now);
    this.ref(ref, { x, z: this.zOf?.(enemyId) });
  }

  // ------------------------------------------------------------- events

  /**
   * Wire logic events to sounds as the original did. Returns an unsubscribe function.
   * `opts.shellEject`: time shell landings from 'shellEject' (off by default because
   * the renderer's debris physics plays each casing bounce itself).
   */
  bindGameEvents(
    bus: EventBus,
    getX: (enemyId: number) => number | undefined,
    getPlayerX: (playerId: number) => number,
    opts: { shellEject?: boolean; getZ?: (enemyId: number) => number | undefined } = {},
  ): () => void {
    const offs: (() => void)[] = [];
    const ex = (id: number, fallback?: number) => getX(id) ?? fallback;
    const ez = (id: number) => opts.getZ?.(id);
    this.zOf = opts.getZ ?? null;

    offs.push(
      bus.on('shot', (e) => {
        this.ref(WEAPON_SOUNDS[e.weapon].fire, { x: e.muzzle.x });
        this.duckAmbience();
      }),

      bus.on('hit', (e) => {
        const es = ENEMY_SOUNDS[e.type];
        if (e.bullet && e.part !== 'shell') {
          const ref = e.part === 'head' ? SFX.headshot : es.bodyHit && e.part !== 'cub' ? es.bodyHit : SFX.genhit;
          this.ref(ref, { x: e.point.x, z: e.point.z });
        }
        if (es.painOnHitAbove !== undefined && e.damage > es.painOnHitAbove) {
          this.pain(e.enemyId, es.pain, e.point.x);
        }
        if (e.type === 'seal') {
          // Bruns cries when one tick's damage exceeds half its starting life and it survives.
          const first = !this.tickDamage.has(e.enemyId);
          this.tickDamage.set(e.enemyId, (this.tickDamage.get(e.enemyId) ?? 0) + e.damage);
          if (first) {
            const id = e.enemyId;
            const x = e.point.x;
            this.defer(() => {
              const dmg = this.tickDamage.get(id) ?? 0;
              const [base, per] = ENEMIES.seal.life;
              const life = base + per * this.levelNum;
              if (dmg > life * RULES.sealPainFraction && !this.recentDead.has(id)) this.pain(id, es.pain, ex(id, x));
            });
          }
        }
      }),

      bus.on('ricochet', (e) => this.ref(SFX.ricochet, { x: e.point.x, z: e.point.z })),

      bus.on('enemyDeath', (e) => {
        this.recentDead.add(e.enemyId);
        this.defer(() => {});
        this.cancelPending(e.enemyId);
        this.lastPain.delete(e.enemyId);
        const x = e.point.x;
        const z = e.point.z;
        const es = ENEMY_SOUNDS[e.type];
        switch (e.kind) {
          case 'gib':
            this.ref(SFX.gib, { x, z });
            return;
          case 'stomp':
            this.ref(SFX.meat, { x, z });
            return;
          case 'kick':
            if (this.once('kick', 150)) this.ref(SFX.kick, { x, z });
            break;
        }
        if (es.death) this.ref(es.death, { x, z });
      }),

      bus.on('enemySpawn', (e) => {
        const es = ENEMY_SOUNDS[e.type];
        if (!es.spawn) return;
        const x = ex(e.enemyId, SPAWN_X)!;
        if (es.spawnTicks) {
          for (const [a, b] of es.spawnTicks) {
            const ticks = a + Math.floor(Math.random() * (b - a + 1));
            this.ref(es.spawn, { x, z: ez(e.enemyId), delay: ticks * TICK_SEC });
          }
        } else {
          this.ref(es.spawn, { x, z: ez(e.enemyId) });
        }
      }),

      bus.on('enemyPain', (e) => this.pain(e.enemyId, ENEMY_SOUNDS[e.type].pain, ex(e.enemyId))),

      bus.on('cubShotOut', (e) => {
        const id = e.enemyId;
        // Spout + panic only when the activist survives the bullet (the death comes at the end of the tick).
        this.defer(() => {
          if (this.recentDead.has(id)) return;
          const x = ex(id, e.point.x);
          this.ref(SFX.spout, { x });
          const panic = this.ref(SFX.panic, { x, delay: RULES.panicDelayTicks * TICK_SEC });
          if (panic) this.addPending(id, panic);
        });
      }),

      bus.on('explosion', (e) => {
        this.ref(SFX.explosion, { x: e.pos.x, z: e.pos.z });
        this.duckAmbience(0.3);
      }),

      bus.on('grenadeBounce', (e) => {
        // strength: normalised 0..1, or an impact speed in m/s.
        const s = e.strength > 1.5 ? e.strength / 6 : e.strength;
        this.ref(SFX.grenadeBounce, { x: e.pos.x, z: e.pos.z, volume: clamp(0.3 + 0.7 * s, 0.3, 1) });
      }),

      bus.on('shellEject', (e) => {
        const ref = WEAPON_SOUNDS[e.weapon].shell;
        if (!ref || !opts.shellEject) return;
        const x = getPlayerX(e.playerId) + 0.4;
        const rapid = WEAPONS[e.weapon].fireTicks <= 5 || e.weapon === 'minigun';
        const n = Math.min(6, Math.max(1, e.count));
        for (let i = 0; i < n; i++) {
          // Brass lands ~0.25-0.4 s after ejection, with a quieter second bounce.
          const t = 0.24 + Math.random() * 0.14 + i * 0.035;
          this.ref(ref, { x, delay: t, volume: 0.9 });
          if (!rapid) this.ref(ref, { x, delay: t + 0.1 + Math.random() * 0.08, volume: 0.4 });
        }
      }),

      bus.on('buy', (e) => {
        const x = getPlayerX(e.playerId);
        this.ref(SFX.buy, { x });
        if (e.weapon === 'awp') this.ref(SFX.awpBuyLaugh, { x, restartGroup: true });
      }),

      bus.on('weaponSwitch', (e) => this.ref(SFX.weaponSwitch, { x: getPlayerX(e.playerId) })),

      bus.on('niceShot', (e) => {
        if (!(e.n > 0)) return;
        this.ref(laughFor(e.n), { x: getPlayerX(e.playerId), restartGroup: true });
      }),

      bus.on('playerHurt', (e) => {
        if (e.damage > RULES.screamHitDamage) this.ref(SFX.screamHit, { x: getPlayerX(e.playerId), restart: true });
      }),

      bus.on('playerJump', (e) => this.ref(SFX.jump, { x: getPlayerX(e.playerId) })),

      bus.on('playerKick', (e) => {
        if (this.once('kick', 150)) this.ref(SFX.kick, { x: getPlayerX(e.playerId) });
      }),

      bus.on('playerDeath', (e) => {
        this.once('screamDeath', 0);
        this.ref(SFX.screamDeath, { x: getPlayerX(e.playerId), restart: true });
      }),

      bus.on('walrusCharge', (e) => this.ref(SFX.walrusCharge, { x: ex(e.enemyId), z: ez(e.enemyId) })),
      bus.on('walrusRush', (e) => this.ref(SFX.walrusRush, { x: ex(e.enemyId), z: ez(e.enemyId), volume: 0.85 })),
      bus.on('walrusDevour', (e) => this.ref(SFX.walrusDevour, { x: ex(e.enemyId, getPlayerX(e.playerId)) })),
      bus.on('turtleHide', (e) => this.ref(SFX.turtleHide, { x: ex(e.enemyId), z: ez(e.enemyId), volume: 0.35, rate: 0.72 })),

      bus.on('levelSplash', (e) => {
        this.levelNum = Math.max(1, e.num);
        this.ref(SFX.saying, { volume: 0.6 });
      }),
      bus.on('levelStart', (e) => {
        this.levelNum = Math.max(1, e.num);
      }),

      bus.on('gameOver', (e) => {
        // The hunter's death scream, unless playerDeath already screamed.
        if (e.reason === 'dead' && this.once('screamDeath', 3000)) this.ref(SFX.screamDeath, {});
      }),
    );

    return () => {
      for (const off of offs) off();
    };
  }

  private addPending(enemyId: number, v: Voice): void {
    const list = this.pendingByEnemy.get(enemyId) ?? [];
    list.push(v);
    this.pendingByEnemy.set(enemyId, list);
    // Forget it once it has started.
    setTimeout(() => {
      const l = this.pendingByEnemy.get(enemyId);
      if (!l) return;
      const i = l.indexOf(v);
      if (i >= 0) l.splice(i, 1);
      if (!l.length) this.pendingByEnemy.delete(enemyId);
    }, Math.max(0, (v.start - (this.ctx?.currentTime ?? 0)) * 1000) + 50);
  }

  /** A creature that died cancels its cries that haven't started yet. */
  private cancelPending(enemyId: number): void {
    const list = this.pendingByEnemy.get(enemyId);
    if (!list) return;
    this.pendingByEnemy.delete(enemyId);
    const now = this.ctx?.currentTime ?? 0;
    for (const v of list) if (v.start > now) this.kill(v, 0.01);
  }

  // ------------------------------------------------------------- weapons

  /**
   * Called every logic tick for each player's active weapon. Reload sounds,
   * shotgun/launcher inserts, vintage hammers and the minigun spin follow the
   * weapon state exactly as weapons.py timed them.
   */
  weaponTick(w: WeaponTickState): void {
    if (!this.ctx) return;
    let t = this.tracks.get(w.playerId);
    if (!t || t.id !== w.id) {
      if (t) this.spinDown(t, w.playerId, w.x, false);
      t = {
        id: w.id,
        state: w.state,
        ticks: w.ticks,
        // A weapon seen mid-phase (just switched to) doesn't replay earlier sounds.
        done: w.ticks <= 1 ? -1 : w.ticks,
        reloadTicks: w.reloadTicks,
        spinning: false,
        idleRun: 0,
        lastFireTicks: w.fireTicks,
      };
      this.tracks.set(w.playerId, t);
    } else if (w.state !== t.state || w.ticks < t.ticks) {
      // Phase change. A reload that ran to the end flushes its last sounds
      // (the logic may switch to idle on the very tick the reload completes).
      if (t.state === 'reload' && t.ticks >= t.reloadTicks - 2) {
        this.runSchedule(reloadSchedule(t.id, t.reloadTicks), t.done, t.reloadTicks, w.x);
      }
      t.state = w.state;
      t.done = -1;
    }
    t.ticks = w.ticks;
    t.reloadTicks = w.reloadTicks;

    if (w.state === 'reload') {
      t.done = this.runSchedule(reloadSchedule(w.id, w.reloadTicks), t.done, w.ticks, w.x);
    } else if (w.state === 'fire') {
      t.done = this.runSchedule(fireSchedule(w.id), t.done, w.ticks, w.x);
    } else {
      t.done = Math.max(t.done, w.ticks);
    }

    const spin = WEAPON_SOUNDS[w.id].spin;
    if (!spin) return;
    if (w.state === 'fire') {
      t.spinning = true;
      t.idleRun = 0;
      t.lastFireTicks = w.fireTicks;
      for (const l of spin.loops) {
        const key = this.spinKey(w.playerId, l.name);
        // Layers join as the interval shrinks and keep going until the spin stops (idempotent; follows x).
        if (w.fireTicks <= l.atFireTicks || this.loops.has(key)) this.startLoop(key, l.name, { x: w.x, volume: 1 });
      }
    } else if (t.spinning) {
      t.idleRun++;
      // Between rounds the logic may report idle for a tick while the trigger is held.
      if (w.state === 'reload' || !w.firingHeld || t.idleRun >= 3) this.spinDown(t, w.playerId, w.x, true);
    }
  }

  private spinKey(playerId: number, name: string): string {
    return `spin:${playerId}:${name}`;
  }

  private spinDown(t: WeaponTrack, playerId: number, x: number, windDown: boolean): void {
    const spin = WEAPON_SOUNDS[t.id].spin;
    if (!spin) return;
    for (const l of spin.loops) this.stopLoop(this.spinKey(playerId, l.name), 60);
    if (windDown && t.spinning && t.lastFireTicks <= spin.winddownAtFireTicks) this.ref(spin.winddown, { x });
    t.spinning = false;
    t.idleRun = 0;
  }

  /** Play every scheduled sound with tick in (from, to]; returns the new high-water mark. */
  private runSchedule(list: ScheduledSound[], from: number, to: number, x: number): number {
    for (const s of list) {
      if (s.tick > from && s.tick <= to) this.ref(s.name, { x, restart: s.restart });
    }
    return Math.max(from, to);
  }
}
