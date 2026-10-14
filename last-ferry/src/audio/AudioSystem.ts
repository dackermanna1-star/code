// Last Ferry audio: 100% procedural Web Audio (no files).
//
// Graph
//   voice: buffer → gain → stereo pan ─┬→ game bus ─ pause gate ─ slow-mo LP ─┐
//                                      └→ reverb send → convolver ────────────┤
//   ambience → duck → pause gate → level ──────────────────────────────────── sfx volume ─┐
//   ui voices ─────────────────────────────────────────────────────────────────────────────┤
//   music → duck → music volume ───────────────────────────────────────────────────────── master → comp → soft clip → out
//
// One-shot sounds are baked on demand from recipes (sounds.ts → bake.ts) into
// AudioBuffers and cached; prewarm() bakes them ahead of time in idle slices.
// Continuous sounds (outboard engine, fire bed, gas hiss), the ambience and
// the adaptive music are live node graphs driven by update(dt).
import type { WeaponId, ZombieKind } from '../config/ids';
import type { WorldView } from '../core/api';
import type { EventBus } from '../core/events';
import { Ambience } from './Ambience';
import { bake } from './bake';
import { FireBed, GasHiss, OutboardEngine, panOf, type EngineState } from './loops';
import { Music, type MusicCue, type MusicState } from './Music';
import { GROUP_LIMITS, SOUNDS, SOUND_NAMES, type Bus, type SoundDef } from './sounds';

export interface PlayOpts {
  /** World x (−25…25) for stereo pan. */
  x?: number;
  /** Linear volume multiplier (1 = the sound's mix level). */
  volume?: number;
  /** Playback-rate multiplier (pitch and speed). */
  pitch?: number;
  /** Start this many seconds from now. */
  delay?: number;
  /** Force a baked variant (default: random, never the same twice running). */
  variant?: number;
  /** Override the sound's bus. */
  bus?: Bus;
}

export interface VoiceHandle {
  readonly name: string;
  /** Fade out and stop (seconds). */
  stop(fade?: number): void;
}

/** Where things are, for panning and continuous sounds (all optional). */
export interface AudioGetters {
  /** The world (positions, burning things, gas, the hunter's weapon …), polled by update(). */
  world?: () => WorldView | null | undefined;
  zombieX?: (id: number) => number | undefined;
  corpseX?: (id: number) => number | undefined;
  playerX?: (id: number) => number | undefined;
}

interface Voice {
  name: string;
  group: string;
  priority: number;
  level: number;
  start: number;
  end: number;
  src: AudioBufferSourceNode;
  gain: GainNode;
  rate: number;
  ui: boolean;
  done: boolean;
}

export const MAX_VOICES = 40;
const DEFAULT_LIMIT = 4;
/** Music sits under the effects: its bus is trimmed by this at full volume. */
const MUSIC_TRIM = 0.42;
/** Peak level the master soft-clipper allows. */
const CEILING = 0.97;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const hash = (n: number) => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

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

/**
 * Soft-clip curve for a WaveShaper fed at half level: curve index u ∈ [-1, 1]
 * stands for an input of 2u. Linear to 0.75, then a smooth knee that never
 * exceeds CEILING (inputs beyond ±2 hold at the ceiling).
 */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 4096;
  const c = new Float32Array(n);
  const knee = 0.75;
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (CEILING - knee) * Math.tanh((a - knee) / (CEILING - knee));
    c[i] = Math.sign(x) * y;
  }
  return c;
}

/** Stereo impulse response: a short, bright early reflection off the hull plus an open-air tail. */
function makeImpulse(ctx: BaseAudioContext, seconds = 1.8): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const b = ctx.createBuffer(2, n, sr);
  let seed = 1234567;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296 * 2 - 1;
  };
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const decay = Math.exp(-t / 0.42);
      // Darken over time (air absorption).
      const k = 0.25 + 0.6 * Math.min(1, t / 1.2);
      lp = lp * k + rnd() * (1 - k);
      d[i] = lp * decay * (t < 0.008 ? t / 0.008 : 1);
    }
    // Early reflections: the ferry's hull and the pier pilings.
    for (const [t, g] of [[0.021 + c * 0.004, 0.5], [0.047 - c * 0.006, 0.35], [0.083 + c * 0.009, 0.25]] as const) {
      const j = Math.floor(t * sr);
      for (let i = 0; i < 40 && j + i < n; i++) d[j + i] += rnd() * g * (1 - i / 40);
    }
  }
  return b;
}

export class AudioSystem {
  readonly ctx: BaseAudioContext | null;
  /** Ambience (live), null without Web Audio. */
  readonly ambience: Ambience | null = null;
  /** Adaptive music (live), null without Web Audio. */
  readonly music: Music | null = null;
  /** The outboard's engine (live). */
  readonly engine: OutboardEngine | null = null;
  readonly fire: FireBed | null = null;
  readonly gasHiss: GasHiss | null = null;
  /** Compute the music intensity from the bound world in update() (else use setMusicState). */
  autoMusic = true;
  /** Debug counters. */
  readonly stats = { played: 0, stolen: 0, dropped: 0, peakVoices: 0, baked: 0, bakeMs: 0 };
  /** Debug hook: every voice started (`at` = context time). */
  onPlay: ((name: string, at: number, opts: PlayOpts) => void) | null = null;

  private master!: GainNode;
  private sfxVol!: GainNode;
  private musicVol!: GainNode;
  private musicDuck!: GainNode;
  private gameBus!: GainNode;
  private gameGate!: GainNode;
  private slowLp!: BiquadFilterNode;
  private uiBus!: GainNode;
  private ambIn!: GainNode;
  private ambDuck!: GainNode;
  private ambGate!: GainNode;
  private verbIn!: GainNode;
  private readonly cache = new Map<string, Array<AudioBuffer | undefined>>();
  private readonly lastVariant = new Map<string, number>();
  private voices: Voice[] = [];
  private paused = false;
  private rateScale = 1;
  private slowUntil = 0;
  private readonly cooldowns = new Map<string, number>();
  private unbind: (() => void) | null = null;
  private getters: AudioGetters = {};
  private prewarmPromise: Promise<void> | null = null;
  private lastUpdate = 0;
  private autoTimer: ReturnType<typeof setInterval> | null = null;
  private crackleAcc = 0;
  private shotgunBullets = new Map<number, number>();
  private outboardShots = 0;
  private lastShotAt = -100;
  private boardMilestone = 0;
  private favourReady = false;
  private musicManualUntil = 0;
  private wantAmbience = false;
  private wantMusic = false;
  /** A realtime AudioContext (not an OfflineAudioContext). */
  private readonly realtime: boolean;

  constructor(opts: { context?: BaseAudioContext } = {}) {
    this.ctx = opts.context ?? createContext();
    const ctx = this.ctx;
    this.realtime = !!ctx && !('startRendering' in ctx);
    if (!ctx) return;

    // Bus compressor (gentle, little automatic make-up gain), then a soft
    // clipper as a safety ceiling: the output never exceeds CEILING.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -9;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    const half = ctx.createGain();
    half.gain.value = 0.5;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = 'none';
    comp.connect(half).connect(clip).connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const rumble = ctx.createBiquadFilter();
    rumble.type = 'highpass';
    rumble.frequency.value = 32;
    rumble.Q.value = 0.6;
    this.master.connect(rumble).connect(comp);
    this.sfxVol = ctx.createGain();
    this.sfxVol.connect(this.master);
    this.musicVol = ctx.createGain();
    this.musicVol.gain.value = 0.7 * MUSIC_TRIM;
    this.musicVol.connect(this.master);
    this.musicDuck = ctx.createGain();
    this.musicDuck.connect(this.musicVol);

    this.slowLp = ctx.createBiquadFilter();
    this.slowLp.type = 'lowpass';
    this.slowLp.frequency.value = 20000;
    this.slowLp.Q.value = 0.9;
    this.slowLp.connect(this.sfxVol);
    this.gameGate = ctx.createGain();
    this.gameGate.connect(this.slowLp);
    this.gameBus = ctx.createGain();
    this.gameBus.connect(this.gameGate);
    this.uiBus = ctx.createGain();
    this.uiBus.connect(this.sfxVol);

    const verb = ctx.createConvolver();
    verb.buffer = makeImpulse(ctx);
    verb.normalize = true;
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.55;
    this.verbIn.connect(verb).connect(this.gameGate);

    this.ambGate = ctx.createGain();
    const ambLevel = ctx.createGain();
    ambLevel.gain.value = 0.32;
    this.ambGate.connect(ambLevel).connect(this.sfxVol);
    this.ambDuck = ctx.createGain();
    this.ambDuck.connect(this.ambGate);
    this.ambIn = ctx.createGain();
    this.ambIn.connect(this.ambDuck);

    const self = this as { -readonly [K in keyof AudioSystem]: AudioSystem[K] };
    self.ambience = new Ambience(ctx, this.ambIn, (n, o) => this.play(n, { ...o, bus: 'amb' }));
    self.music = new Music(ctx, this.musicDuck, (n, o) => this.play(n, { ...o, bus: 'music' }));
    self.engine = new OutboardEngine(ctx, this.gameBus);
    self.fire = new FireBed(ctx, this.gameBus);
    self.gasHiss = new GasHiss(ctx, this.gameBus);
  }

  // ------------------------------------------------------------- control

  /** Resume the context on a user gesture (call from any input handler). */
  unlock(): void {
    const ctx = this.ctx as AudioContext | null;
    if (!ctx || typeof ctx.resume !== 'function') return;
    if (ctx.state !== 'running') ctx.resume().catch(() => undefined);
  }

  /** True once the context is running (sounds are audible). */
  get unlocked(): boolean {
    return (this.ctx as AudioContext | null)?.state === 'running';
  }

  /** Volumes 0..1 (options). Ambience follows the effects volume. */
  setVolumes(master: number, sfx: number, music: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(clamp(master, 0, 1), t, 0.02);
    this.sfxVol.gain.setTargetAtTime(clamp(sfx, 0, 1), t, 0.02);
    this.musicVol.gain.setTargetAtTime(clamp(music, 0, 1) * MUSIC_TRIM, t, 0.02);
  }

  /** Pause menu: game sounds and ambience stop, music dips, UI sounds keep working. */
  setPaused(p: boolean): void {
    const ctx = this.ctx;
    if (!ctx || p === this.paused) return;
    this.paused = p;
    const t = ctx.currentTime;
    this.gameGate.gain.setTargetAtTime(p ? 0 : 1, t, 0.03);
    this.ambGate.gain.setTargetAtTime(p ? 0.15 : 1, t, 0.2);
    this.musicDuck.gain.setTargetAtTime(p ? 0.4 : 1, t, 0.2);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  startAmbience(): void {
    this.wantAmbience = true;
    this.ambience?.start();
    this.ensureAutoTick();
  }

  stopAmbience(): void {
    this.wantAmbience = false;
    this.ambience?.stop();
  }

  startMusic(): void {
    this.wantMusic = true;
    this.music?.start();
    this.ensureAutoTick();
  }

  stopMusic(fade = 1.5): void {
    this.wantMusic = false;
    this.music?.stop(fade);
  }

  /** Adaptive music: intensity 0..1, boss phase, chapter (key). Overrides autoMusic for ~2 s. */
  setMusicState(s: Partial<MusicState>): void {
    this.music?.setState(s);
    if (s.intensity !== undefined && this.ctx) this.musicManualUntil = this.ctx.currentTime + 2;
  }

  /** One-off music cues: 'boss' (brass stinger), 'gameover', 'victory', 'chapter', 'title', 'play'. */
  musicCue(c: MusicCue): void {
    this.music?.cue(c);
  }

  /**
   * Convenience for the app: 'title' = ambience + a quiet music bed that
   * ignores the attract game; 'game' = ambience + adaptive music driven by
   * the bound world (autoMusic).
   */
  setMode(mode: 'title' | 'game'): void {
    this.startAmbience();
    this.startMusic();
    if (mode === 'title') {
      this.autoMusic = false;
      this.musicCue('title');
    } else {
      this.autoMusic = true;
      this.musicCue('play');
    }
  }

  /** Menu sounds (Screens.onUiSound). */
  ui(s: 'move' | 'select' | 'back' | 'toggle' | 'open' | 'deny'): void {
    this.play(`ui_${s}`);
  }

  /**
   * Bake every sound ahead of time in idle slices (call during loading or on
   * the title). Resolves when done; `onProgress(done, total)` reports.
   */
  prewarm(onProgress?: (done: number, total: number) => void, sliceMs = 10): Promise<void> {
    if (this.prewarmPromise) return this.prewarmPromise;
    const ctx = this.ctx;
    const jobs: Array<[string, number]> = [];
    // Most urgent first: weapons and the commonest gore/voices, then the rest.
    const first = ['revolver_fire', 'revolver_cock', 'hit_flesh', 'bodyfall', 'groan', 'coin', 'ui_move', 'ui_select', 'ui_back', 'mus_heart', 'mus_heart2'];
    const order = [...first, ...SOUND_NAMES.filter((n) => !first.includes(n))];
    for (const name of order) {
      const v = SOUNDS[name].variants ?? 1;
      for (let i = 0; i < v; i++) jobs.push([name, i]);
    }
    const total = jobs.length;
    if (!ctx) {
      onProgress?.(total, total);
      return (this.prewarmPromise = Promise.resolve());
    }
    let done = 0;
    this.prewarmPromise = new Promise<void>((resolve) => {
      const run = () => {
        const t0 = performance.now();
        while (done < total && performance.now() - t0 < sliceMs) {
          const [n, v] = jobs[done++];
          this.buffer(n, v);
        }
        onProgress?.(done, total);
        if (done >= total) resolve();
        else setTimeout(run, 0);
      };
      run();
    });
    return this.prewarmPromise;
  }

  /** Bake (and cache) one variant now. */
  buffer(name: string, variant = 0): AudioBuffer | null {
    const ctx = this.ctx;
    const def = SOUNDS[name];
    if (!ctx || !def) return null;
    const n = Math.max(1, def.variants ?? 1);
    const v = ((variant % n) + n) % n;
    let list = this.cache.get(name);
    if (!list) {
      list = new Array(n);
      this.cache.set(name, list);
    }
    const hit = list[v];
    if (hit) return hit;
    const b = bake(name, v, ctx.sampleRate);
    if (!b) return null;
    const ab = ctx.createBuffer(b.channels.length, b.channels[0].length, b.sr);
    b.channels.forEach((c, i) => ab.copyToChannel(c, i));
    list[v] = ab;
    this.stats.baked++;
    this.stats.bakeMs += b.ms;
    return ab;
  }

  // ------------------------------------------------------------- playback

  /** Play a sound by name. Returns a handle (or null when dropped / unknown / muted by pause). */
  play(name: string, o: PlayOpts = {}): VoiceHandle | null {
    const ctx = this.ctx;
    const def: SoundDef | undefined = SOUNDS[name];
    if (!ctx || !def) return null;
    const bus = o.bus ?? def.bus ?? 'sfx';
    const ui = bus === 'ui' || bus === 'music';
    if (this.paused && bus === 'sfx') return null;
    // Before unlock() the clock is frozen: queued voices would all fire at once later.
    if (this.realtime && (ctx as AudioContext).state !== 'running') return null;
    const n = Math.max(1, def.variants ?? 1);
    let v = o.variant;
    if (v === undefined) {
      v = Math.floor(Math.random() * n);
      if (n > 1 && v === this.lastVariant.get(name)) v = (v + 1 + Math.floor(Math.random() * (n - 1))) % n;
    }
    this.lastVariant.set(name, v);
    const buf = this.buffer(name, v);
    if (!buf) return null;

    const now = ctx.currentTime;
    const when = now + Math.max(0, o.delay ?? 0);
    const group = def.group ?? name;
    const priority = def.priority ?? 2;
    this.prune(now);
    // Per-sound and per-group limits: the oldest instance makes room.
    if (!this.makeRoom((x) => x.name === name, def.limit ?? DEFAULT_LIMIT, priority)) return null;
    if (def.group && !this.makeRoom((x) => x.group === group, GROUP_LIMITS[group] ?? 6, priority)) return null;
    if (this.voices.length >= MAX_VOICES) {
      let victim: Voice | null = null;
      for (const x of this.voices) {
        if (x.priority > priority) continue;
        if (!victim || x.priority < victim.priority || (x.priority === victim.priority && x.start < victim.start)) victim = x;
      }
      if (!victim) {
        this.stats.dropped++;
        return null;
      }
      this.kill(victim, 0.015);
      this.stats.stolen++;
    }

    const spread = def.spread ?? 0.04;
    const slow = bus === 'sfx' ? this.rateScale : 1;
    const rate = clamp((o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * spread) * slow, 0.25, 4);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    const x = o.x;
    const edge = x === undefined ? 1 : 1 - 0.25 * clamp((Math.abs(x) - 14) / 12, 0, 1);
    const level = (def.gain ?? 0.5) * (o.volume ?? 1) * edge;
    g.gain.value = level;
    src.connect(g);
    let tail: AudioNode = g;
    if (x !== undefined && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = panOf(x);
      tail = g.connect(p);
    }
    const dest = bus === 'ui' ? this.uiBus : bus === 'music' ? this.musicDuck : bus === 'amb' ? this.ambIn : this.gameBus;
    tail.connect(dest);
    if (def.verb && bus !== 'ui') {
      const s = ctx.createGain();
      s.gain.value = def.verb;
      tail.connect(s).connect(this.verbIn);
    }
    src.start(when);
    const dur = buf.duration / rate;
    const voice: Voice = { name, group, priority, level, start: when, end: when + dur, src, gain: g, rate, ui, done: false };
    src.onended = () => {
      voice.done = true;
      try {
        tail.disconnect();
      } catch {
        /* gone */
      }
    };
    this.voices.push(voice);
    this.stats.played++;
    this.stats.peakVoices = Math.max(this.stats.peakVoices, this.voices.length);
    this.onPlay?.(name, when, o);
    return {
      name,
      stop: (fade = 0.06) => this.kill(voice, fade),
    };
  }

  /** Voices currently playing (debug). */
  get activeVoices(): number {
    if (this.ctx) this.prune(this.ctx.currentTime);
    return this.voices.length;
  }

  voiceStats(): { total: number; byName: Record<string, number> } {
    const byName: Record<string, number> = {};
    if (this.ctx) this.prune(this.ctx.currentTime);
    for (const v of this.voices) byName[v.name] = (byName[v.name] ?? 0) + 1;
    return { total: this.voices.length, byName };
  }

  private prune(now: number): void {
    if (this.voices.length === 0) return;
    this.voices = this.voices.filter((v) => !v.done && v.end > now);
  }

  /** Keep at most `limit - 1` voices matching `pred` (stealing the oldest), so a new one fits. */
  private makeRoom(pred: (v: Voice) => boolean, limit: number, priority: number): boolean {
    let match = this.voices.filter(pred);
    while (match.length >= limit) {
      const oldest = match.reduce((a, b) => (b.start < a.start ? b : a));
      if (oldest.priority > priority + 1) {
        this.stats.dropped++;
        return false;
      }
      this.kill(oldest, 0.02);
      this.stats.stolen++;
      match = match.filter((v) => v !== oldest);
    }
    return true;
  }

  private kill(v: Voice, fade: number): void {
    const ctx = this.ctx;
    if (!ctx || v.done) return;
    v.done = true;
    const t = Math.max(ctx.currentTime, v.start);
    try {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(v.gain.gain.value, t);
      v.gain.gain.linearRampToValueAtTime(0, t + fade);
      v.src.stop(t + fade + 0.01);
    } catch {
      /* already stopped */
    }
    this.voices = this.voices.filter((x) => x !== v);
  }

  /** Rate-limit helper: true when `key` has not fired in the last `sec`. */
  private cool(key: string, sec: number): boolean {
    const now = this.ctx?.currentTime ?? 0;
    const last = this.cooldowns.get(key);
    if (last !== undefined && now - last < sec) return false;
    this.cooldowns.set(key, now);
    return true;
  }

  /** Duck the ambience (and optionally music) under a loud event. */
  private duck(amount: number, seconds: number, music = false): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const a = this.ambDuck.gain;
    a.cancelScheduledValues(t);
    a.setTargetAtTime(1 - amount, t, 0.01);
    a.setTargetAtTime(1, t + seconds, 0.4);
    if (music) {
      const m = this.musicDuck.gain;
      if (this.paused) return;
      m.cancelScheduledValues(t);
      m.setTargetAtTime(1 - amount * 0.7, t, 0.02);
      m.setTargetAtTime(1, t + seconds, 0.6);
    }
  }

  /** Slow motion: dull and pitch down game sounds for `seconds` (scale 0.25–1). */
  slowmo(scale: number, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = clamp(scale, 0.2, 1);
    this.rateScale = 0.55 + 0.45 * s;
    this.slowUntil = t + seconds;
    this.slowLp.frequency.cancelScheduledValues(t);
    this.slowLp.frequency.setTargetAtTime(700 + 2600 * s, t, 0.04);
    this.slowLp.frequency.setTargetAtTime(20000, t + seconds, 0.25);
    for (const v of this.voices) {
      if (v.ui) continue;
      v.src.playbackRate.cancelScheduledValues(t);
      v.src.playbackRate.setTargetAtTime(v.rate * this.rateScale, t, 0.05);
      v.src.playbackRate.setTargetAtTime(v.rate, t + seconds, 0.2);
    }
  }

  // ------------------------------------------------------------ continuous

  /**
   * Per-frame update (dt in real seconds): music and ambience scheduling,
   * the outboard engine RPM, fire crackle, gas hiss, shotgun shell inserts
   * and the automatic music intensity — all read from the bound world.
   */
  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.lastUpdate = performance.now();
    const now = ctx.currentTime;
    if (this.slowUntil && now > this.slowUntil) {
      this.slowUntil = 0;
      this.rateScale = 1;
    }
    this.ambience?.tick();
    this.music?.tick(dt);
    const w = this.getters.world?.() ?? null;
    if (!w) return;
    this.ambience?.setTimeOfDay(w.timeOfDay);

    // Hunter: outboard engine RPM, shotgun shells going in.
    const p = w.players[0];
    if (p && this.engine) {
      const wp = p.weapon;
      if (wp.id === 'outboard' && p.state !== 'dead') this.engine.update(wp.spin, p.x);
      else if (this.engine.state !== 'off' && this.engine.state !== 'stop') this.engine.setState('stop');
    }
    for (const pl of w.players) {
      const wp = pl.weapon;
      const prev = this.shotgunBullets.get(pl.id);
      if (wp.id === 'shotgun' && wp.state === 'reload' && prev !== undefined && wp.bullets > prev) this.play('shotgun_shell_in', { x: pl.x });
      this.shotgunBullets.set(pl.id, wp.id === 'shotgun' ? wp.bullets : -1);
    }

    // Fire: burning zombies, bodies and fire patches.
    let burning = 0;
    let bx = 0;
    const xs: number[] = [];
    for (const z of w.zombies) if (!z.removed && z.burning > 0) { burning++; bx += z.x; xs.push(z.x); }
    for (const c of w.corpses) if (!c.removed && c.burning > 0 && !c.ash) { burning++; bx += c.x; xs.push(c.x); }
    for (const f of w.fires) { burning += 1.5; bx += f.x * 1.5; xs.push(f.x); }
    this.fire?.set(burning, burning > 0 ? bx / burning : 0);
    if (burning > 0 && !this.paused) {
      this.crackleAcc += dt * Math.min(36, 3 + 6 * burning);
      while (this.crackleAcc >= 1) {
        this.crackleAcc -= 1;
        this.play('crackle', { x: xs[Math.floor(Math.random() * xs.length)], volume: 0.5 + Math.random() * 0.5, delay: Math.random() * dt });
      }
    } else this.crackleAcc = 0;

    // Gas.
    let gx = 0;
    for (const g of w.gas) gx += g.x;
    this.gasHiss?.set(w.gas.length, w.gas.length ? gx / w.gas.length : 0);

    // Music intensity: boarding progress + how many are on the pier + how close they are.
    if (this.autoMusic && this.music && now > this.musicManualUntil) {
      let n = 0;
      let near = 0;
      for (const z of w.zombies) {
        if (z.removed || z.dead) continue;
        if (z.x > -24) n++;
        if (z.x > 8) near = Math.max(near, clamp((z.x - 8) / 12, 0, 1));
      }
      const board = w.passengers > 0 ? w.boarded / w.passengers : 0;
      const phaseBoss = w.phase === 'boss';
      const intensity = w.phase === 'playing' || phaseBoss ? clamp(0.12 + 0.38 * board + Math.min(0.32, n * 0.022) + 0.25 * near, 0, 1) : 0.08;
      this.music.setState({ intensity, boss: phaseBoss, chapter: w.chapter });
    }
  }

  /** Keep ambience/music scheduling alive when nobody calls update() (title, previews). */
  private ensureAutoTick(): void {
    if (this.autoTimer || typeof setInterval === 'undefined' || !(this.ctx && 'resume' in this.ctx)) return;
    let last = performance.now();
    this.autoTimer = setInterval(() => {
      const now = performance.now();
      if (now - this.lastUpdate > 250) {
        this.ambience?.tick();
        this.music?.tick((now - last) / 1000);
      }
      last = now;
      if (!this.wantAmbience && !this.wantMusic && this.autoTimer) {
        clearInterval(this.autoTimer);
        this.autoTimer = null;
      }
    }, 100);
  }

  // ------------------------------------------------------------ bindings

  /**
   * Map every relevant game event to sound. Returns an unsubscribe function
   * (a previous binding is removed first).
   */
  bind(events: EventBus, getters: AudioGetters = {}): () => void {
    this.unbind?.();
    this.getters = getters;
    // A new world: silence anything continuous left over from the last one.
    this.engine?.setState('off');
    this.fire?.set(0, 0);
    this.gasHiss?.set(0, 0);
    this.shotgunBullets.clear();
    this.boardMilestone = 0;
    this.favourReady = false;
    const offs: Array<() => void> = [];
    const on: EventBus['on'] = (name, fn) => {
      const off = events.on(name, fn);
      offs.push(off);
      return off;
    };
    const world = () => getters.world?.() ?? null;
    const zombie = (id: number) => world()?.zombies.find((z) => z.id === id);
    const zx = (id: number | null | undefined, fb?: number) =>
      id === null || id === undefined ? fb : (getters.zombieX?.(id) ?? zombie(id)?.x ?? fb);
    const cx = (id: number | null | undefined, fb?: number) =>
      id === null || id === undefined ? fb : (getters.corpseX?.(id) ?? world()?.corpses.find((c) => c.id === id)?.x ?? fb);
    const px = (id: number) => getters.playerX?.(id) ?? world()?.players.find((p) => p.id === id)?.x ?? 10;
    /** Per-look voice: a stable pitch for each zombie's appearance seed. */
    const lookPitch = (id: number, kind: ZombieKind) => {
      const z = zombie(id);
      const h = hash(z?.look ?? id);
      const base = kind === 'bigdave' ? 0.92 : kind === 'jogger' ? 1.05 : 0.86;
      return base + h * 0.28;
    };
    const groanName = (kind: ZombieKind, risen: boolean, burning: boolean): string =>
      burning ? 'scream_burn' : risen ? 'crawler_gurgle' : kind === 'jogger' ? 'groan_jogger' : kind === 'bloater' ? 'groan_bloater' : kind === 'riot' ? 'groan_riot' : kind === 'bigdave' ? 'groan_dave' : 'groan';

    // ---- flow
    on('chapterSplash', (e) => {
      this.play('bell', { x: 18, volume: 0.9 });
      this.music?.setState({ chapter: e.num, boss: false });
      this.musicCue('chapter');
      this.musicCue('play');
    });
    on('chapterStart', (e) => this.music?.setState({ chapter: e.num, boss: false }));
    on('bossSpawn', (e) => {
      this.musicCue('boss');
      this.duck(0.5, 2.5);
      if (e.num === 1) {
        this.play('groan_dave', { x: -20, volume: 1.2, pitch: 0.95, delay: 0.5 });
        this.play('belch', { x: -20, volume: 0.8, delay: 2.2 });
      } else if (e.num === 2) {
        // The Marathon: a starting pistol and the crowd at the finish line.
        this.play('revolver_fire', { x: -22, volume: 0.6, pitch: 1.3, delay: 0.6 });
        this.play('cheer', { x: 20, volume: 0.35, delay: 0.9 });
      } else {
        // The Riot Squad bangs its shields.
        for (let i = 0; i < 6; i++) this.play('plate_hit', { x: -20, volume: 0.6 + i * 0.06, pitch: 0.8, delay: 0.5 + i * (i < 3 ? 0.5 : 0.25) });
      }
    });
    on('chapterComplete', () => {
      this.play('cheer', { x: 21, volume: 0.9, delay: 0.3 });
      this.music?.setState({ boss: false });
    });
    on('boarding', (e) => {
      if (this.cool('board', 0.2)) this.play('boarding_step', { x: 22.5, volume: 0.7 });
      const m = e.total > 0 ? Math.floor((e.boarded / e.total) * 4) : 0;
      if (m > this.boardMilestone && m < 4) this.play('cheer', { x: 22, volume: 0.25 });
      this.boardMilestone = m;
    });
    on('gameOver', (e) => {
      this.musicCue('gameover');
      this.engine?.setState('stop');
      if (e.reason === 'gangway') {
        this.play('distant_scream', { x: 21, volume: 4, pitch: 1.1, bus: 'sfx' });
        this.play('groan', { x: 21, volume: 1.2, delay: 0.2 });
      }
    });
    on('victory', () => {
      this.play('horn', { x: 18, volume: 1 });
      this.play('cheer', { x: 20, volume: 1, delay: 0.8 });
      this.play('gulls_flee', { x: 0, delay: 0.4 });
      this.musicCue('victory');
      this.engine?.setState('stop');
    });

    // ---- zombies
    on('spawn', (e) => {
      if (e.kind === 'bigdave' && e.boss) return;
      if (!e.risen && e.kind === 'jogger' && this.cool('jogspawn', 1.5)) this.play('groan_jogger', { x: zx(e.zombieId, -24), volume: 0.6, pitch: lookPitch(e.zombieId, e.kind) });
    });
    on('groan', (e) => {
      // A crowd of moans turns to mush: keep them sparse (bosses always get through).
      if (e.kind !== 'bigdave' && !this.cool('groan', 0.28)) return;
      const z = zombie(e.zombieId);
      const name = groanName(e.kind, !!z?.risen, (z?.burning ?? 0) > 0);
      const crowd = this.voiceStats().byName[name] ?? 0;
      this.play(name, { x: e.x, volume: e.kind === 'bigdave' ? 1.1 : (0.6 + Math.random() * 0.3) / (1 + crowd * 0.25), pitch: lookPitch(e.zombieId, e.kind) * (1 + (Math.random() - 0.5) * 0.04) });
    });
    on('hit', (e) => {
      const x = e.point.x;
      if (e.part === 'plate') {
        if (this.cool(`plate${e.zombieId}`, 0.05)) this.play('plate_hit', { x });
        return;
      }
      if (e.part === 'stretcher') {
        if (this.cool('stretcher', 0.08)) this.play('kick', { x, volume: 0.5, pitch: 1.4 });
        return;
      }
      if (!e.bullet || e.weapon === 'harpoon') return;
      if (!this.cool(`hit${e.zombieId}`, 0.04)) return;
      if (e.weapon === 'nailgun') {
        this.play('nail_impact', { x });
        this.play('hit_flesh', { x, volume: 0.5 });
        return;
      }
      if (e.part === 'head') {
        this.play('hit_flesh', { x, pitch: 1.2 });
        if (Math.random() < 0.4) this.play('bone_crunch', { x, volume: 0.5 });
      } else {
        this.play('hit_flesh', { x, volume: e.part === 'legs' ? 0.8 : 1, pitch: e.part === 'legs' ? 0.9 : 1 });
      }
    });
    on('plateOff', (e) => this.play('plate_off', { x: e.point.x }));
    on('ricochet', (e) => {
      if (this.cool('ric', 0.06)) this.play('ricochet', { x: e.point.x });
    });
    on('zombieDeath', (e) => {
      const x = cx(e.corpseId, e.point.x) ?? e.point.x;
      const big = e.boss || e.kind === 'bigdave';
      const fall = (delay: number, vol = 1) => this.play('bodyfall', { x, delay, volume: vol * (big ? 1.4 : 1), pitch: big ? 0.6 : e.kind === 'bloater' ? 0.8 : 1 });
      switch (e.deathKind) {
        case 'down':
          fall(0.35 + Math.random() * 0.25);
          break;
        case 'headshot':
          this.play('hit_head', { x: e.point.x });
          if (Math.random() < 0.6) this.play('splat', { x: e.point.x, volume: 0.6, delay: 0.05 });
          fall(0.4 + Math.random() * 0.2);
          break;
        case 'headoff':
          this.play('headoff', { x: e.point.x });
          fall(0.45 + Math.random() * 0.2);
          break;
        case 'gib':
          this.play('gib', { x: e.point.x, volume: big ? 1.3 : 1 });
          break;
        case 'burn':
          this.play('sizzle', { x, volume: 0.8 });
          fall(0.3, 0.7);
          break;
        case 'pop':
          this.play('bloater_pop', { x: e.point.x, volume: big ? 1.4 : 1, pitch: big ? 0.75 : 1 });
          if (big) this.play('gib', { x: e.point.x, volume: 1.2, delay: 0.05 });
          break;
        case 'harpoon':
          break;
        case 'stomp':
          this.play('stomp_kill', { x });
          break;
        case 'drown':
          this.play('splash', { x, delay: 0.3 });
          break;
      }
      if (big) {
        this.duck(0.6, 2, true);
        this.play('cheer', { x: 20, volume: 0.9, delay: 1.6 });
      }
    });
    on('trip', (e) => this.play('trip', { x: zx(e.zombieId) }));
    on('belch', (e) => {
      this.play('belch', { x: e.x });
      this.duck(0.4, 1.2);
    });
    on('enrage', (e) => {
      this.play('enrage', { x: zx(e.zombieId, -10) });
      this.duck(0.5, 1.5, true);
    });
    on('stretcherDrop', (e) => this.play('stretcher_drop', { x: e.x }));
    on('grab', (e) => {
      this.play('grab', { x: zx(e.zombieId, px(e.playerId)), pitch: lookPitch(e.zombieId, 'shambler') * 1.1 });
    });

    // ---- corpses
    on('corpseTwitch', (e) => {
      if (this.cool(`tw${e.corpseId}`, 1)) this.play('twitch', { x: cx(e.corpseId) });
    });
    on('corpseRise', (e) => this.play('rise', { x: cx(e.corpseId, zx(e.zombieId)), pitch: lookPitch(e.zombieId, 'shambler') * 1.05 }));
    on('corpsePermanent', (e) => {
      if (e.reason === 'nailed') {
        const x = cx(e.corpseId);
        this.play('bone_crunch', { x, volume: 0.6 });
        this.play('nail_impact', { x, pitch: 0.85 });
      }
    });
    on('corpseGone', (e) => {
      const x = cx(e.corpseId);
      if (e.reason === 'ash') this.play('ash', { x });
      else if (e.reason === 'sea') this.play('splash', { x, volume: 0.9 });
    });
    on('nail', (e) => {
      if (e.corpseId !== null && this.cool(`nail${e.corpseId}`, 0.05)) this.play('nail_impact', { x: e.point.x, volume: 0.8 });
    });

    // ---- fire & gas
    on('ignite', (e) => {
      if (this.cool('ignite', 0.12)) this.play('ignite', { x: e.x, volume: e.zombieId !== null ? 1 : 0.7 });
      if (e.zombieId !== null && this.cool('burnscream', 0.35)) {
        const z = zombie(e.zombieId);
        this.play('scream_burn', { x: e.x, pitch: lookPitch(e.zombieId, z?.kind ?? 'shambler') * 1.1, delay: 0.1 });
      }
    });
    on('extinguish', (e) => {
      const x = e.zombieId !== null ? zx(e.zombieId) : cx(e.corpseId);
      if (this.cool('ext', 0.2)) this.play('sizzle', { x, volume: 0.5 });
    });
    on('fireZone', (e) => {
      if (this.cool('firezone', 0.3)) this.play('flare_burn', { x: e.x, volume: 0.8 });
    });
    on('gas', (e) => this.play('gas_release', { x: e.x }));
    on('explosion', (e) => {
      const v = clamp(e.radius / 3, 0.6, 1.4);
      if (e.kind === 'cannon') this.play('cannon_explosion', { x: e.x, volume: v });
      else if (e.kind === 'gas') this.play('gas_explosion', { x: e.x, volume: v });
      else if (this.cool('crates', 0.8)) this.play('crate_crash', { x: e.x, volume: v });
      this.duck(0.7, 1.5, true);
    });

    // ---- hunter
    on('shot', (e) => {
      const x = e.muzzle.x;
      this.fireShot(e.weapon, x);
    });
    on('harpoon', (e) => {
      this.play('harpoon_reel', { x: e.from.x, delay: 0.12, volume: clamp(0.5 + e.reel * 0.25, 0.4, 1), pitch: 1 + e.skewered.length * 0.03 });
      e.skewered.forEach((id, i) => this.play('harpoon_skewer', { x: zx(id, e.to.x), delay: 0.02 + i * 0.035, volume: 1 - i * 0.08 }));
    });
    on('projectile', (e) => {
      if (e.kind === 'shell') this.play('shell_whistle', { x: e.x });
    });
    on('projectileEnd', (e) => {
      if (this.cool('flareend', 0.2)) this.play('flare_burn', { x: e.x });
    });
    on('reloadStart', (e) => {
      const x = px(e.playerId);
      const name: Record<WeaponId, string> = {
        revolver: 'revolver_reload_start',
        nailgun: 'nail_reload',
        shotgun: 'shotgun_shell_in',
        flare: 'flare_reload',
        harpoon: 'harpoon_reload',
        outboard: 'outboard_reload',
      };
      this.play(name[e.weapon], { x });
    });
    on('reloadEnd', (e) => {
      const x = px(e.playerId);
      if (e.weapon === 'revolver') this.play('revolver_reload_end', { x });
      else if (e.weapon === 'shotgun') this.play('shotgun_pump', { x, volume: 0.9 });
    });
    on('emptyClick', (e) => {
      if (this.cool('empty', 0.12)) this.play('empty_click', { x: px(e.playerId) });
    });
    on('weaponSwitch', (e) => this.play('weapon_switch', { x: px(e.playerId) }));
    on('buy', (e) => this.play('buy', { x: px(e.playerId) }));
    on('engine', (e) => {
      const st: EngineState = e.state;
      if (st === 'pull') this.play('outboard_pull', { x: px(e.playerId) });
      if (st === 'stop' && this.engine && this.engine.state !== 'off' && this.engine.state !== 'stop') this.play('outboard_stop', { x: px(e.playerId) });
      this.engine?.setState(st);
    });
    on('jump', (e) => this.play('jump', { x: px(e.playerId) }));
    on('stomp', (e) => {
      if (!e.killed) this.play('stomp', { x: e.x });
      else this.play('stomp', { x: e.x, volume: 0.6 });
    });
    on('kick', (e) => this.play('kick', { x: zx(e.zombieId, px(e.playerId)) }));
    on('playerHurt', (e) => {
      const x = px(e.playerId);
      if (e.source === 'gas') {
        if (this.cool('cough', 1.1)) this.play('player_cough', { x });
      } else if (this.cool('hurt', 0.38)) {
        this.play('player_hurt', { x });
        if (e.source === 'fire' && this.cool('hurtfire', 0.6)) this.play('sizzle', { x, volume: 0.5 });
      }
    });
    on('playerDeath', (e) => {
      this.play('player_death', { x: px(e.playerId) });
      this.engine?.setState('stop');
    });
    on('money', (e) => {
      if (e.reason === 'nice') this.play('coin_big', { x: e.x });
      else if (e.reason === 'tidy') this.play('tidy', { x: e.x });
      else if (this.cool(`coin-${e.reason}`, 0.06)) this.play('coin', { x: e.x, volume: e.reason === 'headshot' ? 0.9 : 0.7, pitch: e.reason === 'headshot' ? 1.19 : 1 });
    });
    on('niceShot', (e) => this.play(e.n >= 6 ? 'sting_massacre' : 'sting_nice', { pitch: e.n >= 6 ? 1 : 1 + Math.min(3, e.n - 3) * 0.06 }));
    on('headshotStreak', (e) => this.play('sting_headshot', { pitch: 1 + Math.min(8, Math.max(0, e.n - 1)) * 0.0595 }));

    // ---- the pier
    on('horn', () => {
      this.play('horn', { x: 21 });
      this.play('gulls_flee', { x: -4, delay: 0.25 });
      this.play('cheer', { x: 21, volume: 0.8, delay: 1.4 });
      this.duck(0.8, 4, true);
    });
    on('crane', (e) => {
      if (e.state === 'falling') this.play('crane_snap', { x: e.x });
      else if (e.state === 'down' && this.cool('crates', 0.8)) this.play('crate_crash', { x: e.x });
    });
    on('favour', (e) => {
      if (e.ready && !this.favourReady) this.play('bell', { x: 20, volume: 0.8 });
      this.favourReady = e.ready;
    });
    on('cannonStrike', (e) => {
      for (let i = 0; i < Math.max(1, Math.min(3, e.targets.length || 3)); i++) this.play('cannon_fire', { x: 23, delay: i * 0.35 });
      this.duck(0.6, 2.5, true);
    });
    on('slowmo', (e) => this.slowmo(e.scale, e.seconds));

    const off = () => {
      for (const f of offs) f();
      offs.length = 0;
      if (this.unbind === off) this.unbind = null;
    };
    this.unbind = off;
    return off;
  }

  /** The sound of one trigger pull (also used by previews). */
  fireShot(weapon: WeaponId, x: number): void {
    const now = this.ctx?.currentTime ?? 0;
    // The first shot after a lull sends the gulls on the railings flapping off.
    if (now - this.lastShotAt > 8) this.play('gulls_flee', { x: -4 + Math.random() * 8, volume: 0.45, delay: 0.12 });
    this.lastShotAt = now;
    switch (weapon) {
      case 'revolver':
        this.play('revolver_fire', { x });
        this.play('revolver_cock', { x, delay: 0.2 });
        this.duck(0.5, 0.3);
        break;
      case 'nailgun':
        this.play('nail_fire', { x });
        break;
      case 'shotgun':
        this.play('shotgun_fire', { x });
        this.play('shotgun_pump', { x, delay: 0.3 });
        this.play('shell_drop', { x: x + 0.5, delay: 0.62 });
        this.duck(0.6, 0.5, true);
        break;
      case 'flare':
        this.play('flare_fire', { x });
        break;
      case 'harpoon':
        this.play('harpoon_fire', { x });
        this.duck(0.5, 0.4);
        break;
      case 'outboard':
        this.engine?.shot();
        this.outboardShots++;
        if (this.outboardShots % 2 === 0) this.play('outboard_shot', { x, volume: 0.9 });
        if (this.outboardShots % 5 === 0) this.play('brass_drop', { x: x + 0.6, delay: 0.35 + Math.random() * 0.2 });
        this.duck(0.35, 0.25);
        break;
    }
  }
}
