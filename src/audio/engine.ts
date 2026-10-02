/**
 * AudioEngine — procedural Web Audio engine.
 *
 * Graph:
 *   voice: BufferSource → [low-pass (air absorption / muffle)] → Gain → [HRTF Panner] → category bus
 *                                                                  └→ send Gain → category send bus
 *   world category buses (blocks, hostile, neutral, players, ambient, weather)
 *        → world → environment low-pass (underwater / lava) → env gain → master
 *   send buses → reverb in → { open-air convolver, cave convolver } → environment low-pass
 *   ui → master;  music → { dry, hall convolver } → master
 *   master → glue compressor → limiter → soft clipper → analyser → destination
 *
 * Every public method is safe to call before `init()`, after a failed init, or when Web Audio
 * is unavailable (Node / tests): it degrades to a no-op.
 */
import type { SoundGroup } from '../world/blocks/registry';
import { Ambience, type AmbienceHost, type AmbienceState } from './ambience';
import { SoundBank, type BankStats, type Priority } from './bank';
import { Rand } from './dsp/rand';
import { MusicEngine, type MusicMode } from './music';
import { hasMaterialSounds, type BlockAction } from './recipes/blocks';
import type { Cat, LoopSpec, SoundSpec } from './recipes/types';
import { LOOPS, SOUNDS } from './render';
import type { AudioCategory, LoopHandle, PlayOptions, Vec3Like } from './types';

const MAX_VOICES = 48;
const MAX_ACTIVE_LOOPS = 24;
const MAX_DISTANCE = 48;
const REF_DISTANCE = 2;
/** One-shots farther than this use the cheaper equal-power panner (HRTF convolution per voice is costly; distant localization matters less). */
const HRTF_RANGE = 24;
const PENDING_MAX_AGE = 0.35;
const WORLD_CATS: readonly Cat[] = ['blocks', 'hostile', 'neutral', 'players', 'ambient', 'weather'];
const ALL_CATS: readonly Cat[] = ['music', 'blocks', 'hostile', 'neutral', 'players', 'ambient', 'weather', 'ui'];

/** Sounds rendered right after init (the rest render lazily on first use). */
export const PREWARM_SOUNDS: readonly string[] = [
  'ui.click', 'random.pop', 'random.orb', 'game.player.hurt', 'game.player.attack.strong', 'game.player.attack.weak',
  'game.player.attack.sweep', 'game.player.attack.nodamage', 'game.player.attack.crit', 'random.eat', 'random.drink',
  'random.burp', 'random.bow', 'entity.arrow.hit', 'liquid.splash', 'liquid.swim', 'game.player.hurt.fall.small',
  'random.levelup', 'random.click', 'random.door_open', 'random.door_close', 'random.chest_open', 'random.chest_close',
  'mob.zombie.say', 'mob.zombie.hurt', 'mob.skeleton.say', 'mob.creeper.hurt', 'random.fuse', 'random.explode',
  'mob.spider.say', 'mob.cow.say', 'mob.pig.say', 'mob.sheep.say', 'mob.chicken.say',
];
export const PREWARM_GROUPS: readonly SoundGroup[] = ['grass', 'stone', 'wood', 'gravel', 'sand', 'plant', 'deepslate', 'glass', 'wool'];
const PREWARM_ACTIONS: readonly BlockAction[] = ['step', 'hit', 'break', 'place', 'land'];

interface Graph {
  master: GainNode;
  analyser: AnalyserNode;
  cat: Record<Cat, GainNode>;
  send: Record<Cat, GainNode>;
  env: BiquadFilterNode;
  envGain: GainNode;
  verbSmall: ConvolverNode;
  verbLarge: ConvolverNode;
  verbSmallGain: GainNode;
  verbLargeGain: GainNode;
  musicVerb: ConvolverNode;
}

interface Voice {
  name: string;
  cat: Cat;
  src: AudioBufferSourceNode;
  gain: GainNode;
  filt: BiquadFilterNode | null;
  pan: PannerNode | null;
  send: GainNode | null;
  start: number;
  end: number;
  prio: number;
  px: number;
  py: number;
  pz: number;
  done: boolean;
  listed: boolean;
}

interface LoopNodes {
  src: AudioBufferSourceNode;
  filt: BiquadFilterNode;
  gain: GainNode;
  pan: PannerNode | null;
  send: GainNode | null;
}

interface LoopState {
  name: string;
  spec: LoopSpec;
  pos: { x: number; y: number; z: number } | null;
  vol: number;
  pitch: number;
  muffle: number;
  stopped: boolean;
  nodes: LoopNodes | null;
  appliedGain: number;
  appliedCut: number;
  dist: number;
}

interface PendingPlay {
  name: string;
  spec: SoundSpec;
  opts: PlayOptions;
  t: number;
}

export interface AudioEngineOptions {
  /** Use an existing context (e.g. an OfflineAudioContext in tests). */
  context?: BaseAudioContext;
  /** Synthesize in a Web Worker when available (default true). */
  worker?: boolean;
  /** Seed for variation choice and generative music. */
  seed?: number;
  /** One-shot buffer cache budget in MB (default 64). */
  memoryBudgetMB?: number;
  /** Pre-render the most common sounds during init (default true). */
  prewarm?: boolean;
}

export interface AudioStats {
  state: string;
  ready: boolean;
  sampleRate: number;
  voices: number;
  loops: number;
  activeLoops: number;
  bank: BankStats | null;
  music: ReturnType<MusicEngine['stats']> | null;
  ambience: Record<string, number>;
  /** Per-loop detail (only with `getStats(true)`). */
  loopDetail?: { name: string; dist: number; active: boolean; positional: boolean }[];
}

const NOOP_LOOP: LoopHandle = Object.freeze({
  setPos() {},
  setVolume() {},
  stop() {},
});

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Low-pass cutoff for a muffle amount (0 = open, 1 = behind thick walls / underwater). */
const muffleCut = (m: number): number => 22000 * Math.pow(300 / 22000, m);
/** Gentle air absorption with distance (blocks). */
const airCut = (d: number): number => Math.max(2500, 22000 * Math.exp(-d / 45));
/** Freezes an AudioParam at its current value at time t (so a new ramp starts from there, without jumps). */
function holdParam(p: AudioParam, t: number): void {
  const q = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof q.cancelAndHoldAtTime === 'function') q.cancelAndHoldAtTime(t);
  else {
    const v = p.value;
    p.cancelScheduledValues(t);
    p.setValueAtTime(v, t);
  }
}

export class AudioEngine {
  private ctx: BaseAudioContext | null = null;
  private live = false;
  private _ready = false;
  private initPromise: Promise<void> | null = null;
  private g: Graph | null = null;
  private bank: SoundBank | null = null;
  private music: MusicEngine | null = null;
  private amb: Ambience | null = null;
  private voices: Voice[] = [];
  private loops: LoopState[] = [];
  private pending: PendingPlay[] = [];
  private vol: Record<AudioCategory, number> = { master: 1, music: 1, blocks: 1, hostile: 1, neutral: 1, players: 1, ambient: 1, weather: 1, ui: 1 };
  private lis = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 };
  private rng: Rand;
  private lastVariant = new Map<string, number>();
  private warned = new Set<string>();
  private pendingMusic: MusicMode | null = null;
  private loopTimer = 0;
  private sweepTimer = 0;
  private nyquist = 22050;
  private readonly opts: AudioEngineOptions;
  private readonly seed: number;

  constructor(opts: AudioEngineOptions = {}) {
    this.opts = opts;
    this.seed = (opts.seed ?? (Math.random() * 0x7fffffff) | 0) >>> 0;
    this.rng = new Rand(this.seed ^ 0x51ed);
  }

  /** True once the context is running and the mixing graph is built. */
  get ready(): boolean {
    return this._ready;
  }

  /** The underlying context (null when unavailable). */
  get context(): BaseAudioContext | null {
    return this.ctx;
  }

  // =======================================================================================
  // lifecycle
  // =======================================================================================

  /** Must be called from a user gesture: creates/resumes the AudioContext and pre-renders common sounds in the background. */
  init(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.doInit();
    else void this.resume();
    return this.initPromise;
  }

  /** Resumes a suspended realtime context (call from any later user gesture). */
  async resume(): Promise<void> {
    const c = this.ctx;
    if (c && this.live && c.state !== 'running') {
      try {
        await (c as AudioContext).resume();
      } catch {
        /* needs a gesture */
      }
    }
  }

  private async doInit(): Promise<void> {
    try {
      let ctx: BaseAudioContext | null = this.opts.context ?? null;
      if (!ctx) {
        const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
        const AC = g.AudioContext ?? g.webkitAudioContext;
        if (!AC) {
          console.warn('[audio] Web Audio API unavailable — audio disabled');
          return;
        }
        ctx = new AC({ latencyHint: 'interactive' });
      }
      this.ctx = ctx;
      this.live = typeof AudioContext !== 'undefined' && ctx instanceof AudioContext;
      if (this.live && ctx.state !== 'running') {
        // resume() stays pending until a user gesture — don't let init() hang on it
        const resumed = (ctx as AudioContext).resume().catch(() => undefined);
        await Promise.race([resumed, new Promise((res) => setTimeout(res, 300))]);
      }
      this.nyquist = ctx.sampleRate / 2;
      const g = this.buildGraph(ctx);
      this.g = g;
      const bank = new SoundBank(ctx, {
        useWorker: this.opts.worker !== false,
        budgetBytes: (this.opts.memoryBudgetMB ?? 64) * 1048576,
        maxInflight: 2,
      });
      this.bank = bank;
      bank.request('r:outdoor', 1, (b) => b && this.setIR(g.verbSmall, b));
      bank.request('r:cave', 1, (b) => b && this.setIR(g.verbLarge, b));
      bank.request('r:music', 2, (b) => b && this.setIR(g.musicVerb, b));
      this.music = new MusicEngine(ctx, g.cat.music, bank, this.seed);
      if (this.pendingMusic) this.music.setMode(this.pendingMusic);
      this.amb = new Ambience(this.ambienceHost(), () => this.rng.next());
      if (this.opts.prewarm !== false) {
        this.prewarm(['ui.click', 'random.pop'], 1);
        this.prewarm(PREWARM_SOUNDS, 2);
        const blocks: string[] = [];
        for (const grp of PREWARM_GROUPS) for (const a of PREWARM_ACTIONS) blocks.push(`block.${grp}.${a}`);
        this.prewarm(blocks, 2);
      }
      this._ready = true;
    } catch (e) {
      console.warn('[audio] init failed — audio disabled', e);
      this.teardown();
    }
  }

  private buildGraph(ctx: BaseAudioContext): Graph {
    const G = (v = 1): GainNode => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    const master = G(this.vol.master);
    // DynamicsCompressorNode applies automatic make-up gain (≈ +5 dB for these two stages);
    // the pre-gain compensates so a single full-level sound passes at roughly unity.
    const preGain = G(0.55);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 12;
    comp.ratio.value = 2;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      const a = Math.abs(x);
      curve[i] = Math.sign(x) * (a <= 0.85 ? a : 0.85 + 0.13 * Math.tanh((a - 0.85) / 0.13));
    }
    clip.curve = curve;
    clip.oversample = '2x';
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    master.connect(preGain);
    preGain.connect(comp);
    comp.connect(limiter);
    limiter.connect(clip);
    clip.connect(analyser);
    analyser.connect(ctx.destination);

    const cat = {} as Record<Cat, GainNode>;
    const send = {} as Record<Cat, GainNode>;
    for (const c of ALL_CATS) {
      cat[c] = G(this.vol[c]);
      send[c] = G(this.vol[c]);
    }
    const world = G(1);
    const env = ctx.createBiquadFilter();
    env.type = 'lowpass';
    env.frequency.value = this.hz(22000);
    env.Q.value = 0.6;
    const envGain = G(1);
    world.connect(env);
    env.connect(envGain);
    envGain.connect(master);
    const verbIn = G(1);
    const verbSmall = ctx.createConvolver();
    const verbLarge = ctx.createConvolver();
    verbSmall.normalize = false;
    verbLarge.normalize = false;
    const verbSmallGain = G(0.9);
    const verbLargeGain = G(0);
    verbIn.connect(verbSmall);
    verbIn.connect(verbLarge);
    verbSmall.connect(verbSmallGain);
    verbLarge.connect(verbLargeGain);
    verbSmallGain.connect(env);
    verbLargeGain.connect(env);
    for (const c of WORLD_CATS) {
      cat[c].connect(world);
      send[c].connect(verbIn);
    }
    cat.ui.connect(master);
    const musicDry = G(1);
    const musicSend = G(0.4);
    const musicVerb = ctx.createConvolver();
    musicVerb.normalize = false;
    cat.music.connect(musicDry);
    cat.music.connect(musicSend);
    musicSend.connect(musicVerb);
    musicDry.connect(master);
    musicVerb.connect(master);
    return { master, analyser, cat, send, env, envGain, verbSmall, verbLarge, verbSmallGain, verbLargeGain, musicVerb };
  }

  private setIR(node: ConvolverNode, buf: AudioBuffer): void {
    try {
      node.buffer = buf;
    } catch (e) {
      console.warn('[audio] convolver rejected IR', e);
    }
  }

  /** Releases the context, worker and all nodes (a later `init()` starts afresh). */
  dispose(): void {
    this.teardown();
    this.initPromise = null;
  }

  private teardown(): void {
    try {
      this.music?.dispose();
      this.amb?.dispose();
      for (const l of this.loops) {
        l.stopped = true;
        this.stopLoopNodes(l, 0.05);
      }
      for (const v of this.voices.slice()) this.kill(v, 0.02);
      this.bank?.dispose();
      if (this.live && this.ctx && !this.opts.context) (this.ctx as AudioContext).close().catch(() => undefined);
    } catch {
      /* ignore */
    }
    this.voices = [];
    this.loops = [];
    this.pending = [];
    this.music = null;
    this.amb = null;
    this.bank = null;
    this.g = null;
    this.ctx = null;
    this._ready = false;
  }

  // =======================================================================================
  // volumes & listener
  // =======================================================================================

  setMasterVolume(v: number): void {
    this.vol.master = clamp(v, 0, 1);
    const g = this.g;
    if (g && this.ctx) g.master.gain.setTargetAtTime(this.vol.master, this.ctx.currentTime, 0.03);
  }

  setCategoryVolume(cat: AudioCategory, v: number): void {
    if (cat === 'master') return this.setMasterVolume(v);
    if (!(cat in this.vol)) return;
    this.vol[cat] = clamp(v, 0, 1);
    const g = this.g;
    if (g && this.ctx) {
      const t = this.ctx.currentTime;
      g.cat[cat].gain.setTargetAtTime(this.vol[cat], t, 0.03);
      g.send[cat].gain.setTargetAtTime(this.vol[cat], t, 0.03);
    }
  }

  getCategoryVolume(cat: AudioCategory): number {
    return this.vol[cat] ?? 1;
  }

  setListener(pos: Vec3Like, forward: Vec3Like, up: Vec3Like): void {
    const l = this.lis;
    l.x = pos.x;
    l.y = pos.y;
    l.z = pos.z;
    l.fx = forward.x;
    l.fy = forward.y;
    l.fz = forward.z;
    l.ux = up.x;
    l.uy = up.y;
    l.uz = up.z;
    const c = this.ctx;
    if (!c) return;
    try {
      const L = c.listener;
      if (L.positionX) {
        L.positionX.value = l.x;
        L.positionY.value = l.y;
        L.positionZ.value = l.z;
        L.forwardX.value = l.fx;
        L.forwardY.value = l.fy;
        L.forwardZ.value = l.fz;
        L.upX.value = l.ux;
        L.upY.value = l.uy;
        L.upZ.value = l.uz;
      } else {
        L.setPosition(l.x, l.y, l.z);
        L.setOrientation(l.fx, l.fy, l.fz, l.ux, l.uy, l.uz);
      }
    } catch {
      /* degenerate orientation */
    }
  }

  // =======================================================================================
  // one-shots
  // =======================================================================================

  /** Fire-and-forget one-shot. Unknown names warn once. */
  play(name: string, opts?: PlayOptions): void {
    try {
      this.playInternal(name, opts, 0, 24000);
    } catch (e) {
      this.warnOnce(`play-error:${name}`, `[audio] play(${name}) failed`, e);
    }
  }

  /** Material sound from a block SoundGroup (groups without dedicated sounds fall back to stone). */
  playBlock(group: SoundGroup, action: BlockAction, opts?: PlayOptions): void {
    if (group === 'none') return;
    if (!hasMaterialSounds(group)) {
      this.warnOnce(`group:${group}`, `[audio] no material sounds for SoundGroup '${group}', using 'stone'`);
      this.play(`block.stone.${action}`, opts);
      return;
    }
    this.play(`block.${group}.${action}`, opts);
  }

  private playInternal(name: string, opts: PlayOptions | undefined, delay: number, extraCut: number): void {
    const spec = SOUNDS[name];
    if (!spec) {
      // validated even without Web Audio so typos surface in tests / headless runs
      this.warnOnce(`unknown:${name}`, `[audio] unknown sound '${name}'`);
      return;
    }
    const bank = this.bank;
    if (!this.ctx || !bank || !this.g) return;
    if (this.live && this.ctx.state !== 'running') return;
    const vol = opts?.volume ?? 1;
    if (!(vol > 0)) return;
    const pos = opts?.pos;
    if (pos) {
      const dx = pos.x - this.lis.x;
      const dy = pos.y - this.lis.y;
      const dz = pos.z - this.lis.z;
      const range = MAX_DISTANCE * Math.max(1, vol);
      if (dx * dx + dy * dy + dz * dz > range * range) return;
    }
    const bufs = this.variants(name, spec.n);
    if (bufs.length === 0) {
      // not rendered yet: render urgently and play if it arrives quickly enough.
      // Repeated triggers while waiting coalesce (latest wins) instead of bursting together.
      const o: PlayOptions = { pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : undefined, volume: opts?.volume, pitch: opts?.pitch, muffle: opts?.muffle };
      for (const q of this.pending) {
        if (q.name === name) {
          q.opts = o;
          q.t = this.ctx.currentTime;
          return;
        }
      }
      const p: PendingPlay = { name, spec, opts: o, t: this.ctx.currentTime };
      this.pending.push(p);
      bank.request(`s:${name}#0`, 0, (b) => this.flushPending(p, b, delay, extraCut));
      return;
    }
    this.startVoice(name, spec, bufs, opts, delay, extraCut);
  }

  private flushPending(p: PendingPlay, b: AudioBuffer | null, delay: number, extraCut: number): void {
    const i = this.pending.indexOf(p);
    if (i >= 0) this.pending.splice(i, 1);
    if (!b || !this.ctx) return;
    if (this.ctx.currentTime - p.t > PENDING_MAX_AGE + delay && this.live) return;
    this.startVoice(p.name, p.spec, [b], p.opts, delay, extraCut);
  }

  /** Available variant buffers of a sound; schedules the missing ones. */
  private variants(name: string, n: number): AudioBuffer[] {
    const bank = this.bank!;
    const out: AudioBuffer[] = [];
    for (let v = 0; v < n; v++) {
      const key = `s:${name}#${v}`;
      const b = bank.get(key);
      if (b) out.push(b);
      else if (!bank.isPending(key)) bank.request(key, v === 0 ? 1 : 2);
    }
    return out;
  }

  /** Queues sounds for background rendering. */
  prewarm(names: readonly string[], pri: Priority = 2): void {
    const bank = this.bank;
    if (!bank) return;
    for (const name of names) {
      const spec = SOUNDS[name];
      if (spec) for (let v = 0; v < spec.n; v++) bank.request(`s:${name}#${v}`, v === 0 ? pri : (Math.min(3, pri + 1) as Priority));
      else if (LOOPS[name]) bank.request(`l:${name}`, pri);
    }
  }

  /** Resolves when all queued renders are done (or after `timeoutMs`). */
  whenIdle(timeoutMs = 30000): Promise<void> {
    return this.bank ? this.bank.idle(timeoutMs) : Promise.resolve();
  }

  private startVoice(name: string, spec: SoundSpec, bufs: AudioBuffer[], o: PlayOptions | undefined, delay: number, extraCut: number): void {
    const ctx = this.ctx!;
    const g = this.g!;
    const vol = o?.volume ?? 1;
    const pos = o?.pos;
    const L = this.lis;
    let d = 0;
    if (pos) {
      const dx = pos.x - L.x;
      const dy = pos.y - L.y;
      const dz = pos.z - L.z;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    const vScale = Math.max(1, vol);
    const range = MAX_DISTANCE * vScale;
    if (pos && d > range) return;
    const ref = REF_DISTANCE * vScale;
    const level = (spec.level ?? 1) * Math.min(1, vol);
    const distGain = pos ? ref / (ref + Math.max(0, d - ref)) : 1;
    const edge = pos ? 1 - smoothstep(range * 0.75, range, d) : 1;
    const muffle = clamp(o?.muffle ?? 0, 0, 1);
    const prio = level * distGain * edge * (1 - 0.5 * muffle) * this.vol[spec.cat] * this.vol.master;
    if (prio < 1e-4) return;
    const now = ctx.currentTime;

    // dedupe double triggers + per-sound instance limit
    let same = 0;
    let oldest: Voice | null = null;
    for (const v of this.voices) {
      if (v.name !== name) continue;
      if (now - v.start < 0.015 && (!pos || Math.abs(v.px - pos.x) + Math.abs(v.py - pos.y) + Math.abs(v.pz - pos.z) < 0.5)) return;
      same++;
      if (!oldest || v.start < oldest.start) oldest = v;
    }
    if (oldest && same >= (spec.max ?? 8)) this.kill(oldest, 0.03);
    // global voice limit: steal the quietest / most finished voice, or drop this one
    if (this.voices.length >= MAX_VOICES) {
      let victim: Voice | null = null;
      let vs = Infinity;
      for (const v of this.voices) {
        const rem = clamp((v.end - now) / Math.max(0.01, v.end - v.start), 0, 1);
        const s = v.prio * (0.25 + 0.75 * rem);
        if (s < vs) {
          vs = s;
          victim = v;
        }
      }
      if (!victim || vs > prio) return;
      this.kill(victim, 0.02);
    }

    let idx = 0;
    if (bufs.length > 1) {
      idx = this.rng.int(bufs.length);
      if (idx === this.lastVariant.get(name)) idx = (idx + 1) % bufs.length;
      this.lastVariant.set(name, idx);
    }
    const buf = bufs[idx];
    const pv = spec.pv ?? 0.05;
    const rate = clamp((o?.pitch ?? 1) * (1 + (this.rng.next() * 2 - 1) * pv), 0.1, 8);
    const when = now + 0.003 + delay;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    let head: AudioNode = src;
    let filt: BiquadFilterNode | null = null;
    const cut = Math.min(extraCut, muffle > 0 ? muffleCut(muffle) : 24000, pos ? airCut(d) : 24000);
    if (cut < 18000) {
      filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = this.hz(cut);
      filt.Q.value = 0.6;
      src.connect(filt);
      head = filt;
    }
    const gain = ctx.createGain();
    gain.gain.value = level * edge * (1 - 0.5 * muffle);
    head.connect(gain);
    let pan: PannerNode | null = null;
    if (pos) {
      pan = this.makePanner(pos, ref, d > HRTF_RANGE ? 'equalpower' : 'HRTF');
      gain.connect(pan);
      pan.connect(g.cat[spec.cat]);
    } else gain.connect(g.cat[spec.cat]);
    let send: GainNode | null = null;
    const sendAmt = spec.cat === 'ui' || spec.cat === 'music' ? 0 : spec.send ?? 1;
    if (sendAmt > 0) {
      const sl = sendAmt * 0.5 * (pos ? Math.sqrt(distGain) : 0.6);
      if (sl > 0.002) {
        send = ctx.createGain();
        send.gain.value = sl;
        gain.connect(send);
        send.connect(g.send[spec.cat]);
      }
    }
    const v: Voice = {
      name,
      cat: spec.cat,
      src,
      gain,
      filt,
      pan,
      send,
      start: when,
      end: when + buf.duration / rate,
      prio,
      px: pos?.x ?? 0,
      py: pos?.y ?? 0,
      pz: pos?.z ?? 0,
      done: false,
      listed: true,
    };
    src.onended = () => this.release(v);
    src.start(when);
    this.voices.push(v);
  }

  private makePanner(p: Vec3Like, ref: number, model: PanningModelType = 'HRTF'): PannerNode {
    const ctx = this.ctx!;
    const n = ctx.createPanner();
    n.panningModel = model;
    n.distanceModel = 'inverse';
    n.refDistance = ref;
    n.maxDistance = 10000;
    n.rolloffFactor = 1;
    this.setPannerPos(n, p);
    return n;
  }

  private setPannerPos(n: PannerNode, p: Vec3Like): void {
    if (n.positionX) {
      n.positionX.value = p.x;
      n.positionY.value = p.y;
      n.positionZ.value = p.z;
    } else n.setPosition(p.x, p.y, p.z);
  }

  /** Fades a voice out quickly and frees its slot immediately. */
  private kill(v: Voice, fade: number): void {
    this.unlist(v);
    const c = this.ctx;
    if (!c) return;
    try {
      holdParam(v.gain.gain, c.currentTime);
      v.gain.gain.setTargetAtTime(0, c.currentTime, fade / 3);
      v.src.stop(c.currentTime + fade + 0.01);
      // safety net: a source stopped before its scheduled start may never fire 'ended'
      if (this.live) setTimeout(() => this.release(v), (Math.max(0, v.start - c.currentTime) + fade + 0.5) * 1000);
    } catch {
      this.release(v);
    }
  }

  private unlist(v: Voice): void {
    if (!v.listed) return;
    v.listed = false;
    const i = this.voices.indexOf(v);
    if (i >= 0) {
      this.voices[i] = this.voices[this.voices.length - 1];
      this.voices.pop();
    }
  }

  private release(v: Voice): void {
    this.unlist(v);
    if (v.done) return;
    v.done = true;
    try {
      v.src.disconnect();
      v.filt?.disconnect();
      v.gain.disconnect();
      v.pan?.disconnect();
      v.send?.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  /** Thunder clap: crack + rumble with distance delay (speed of sound) and air absorption. */
  thunder(distance: number): void {
    try {
      if (!this.ctx) return;
      const d = Math.max(0, distance || 0);
      const delay = Math.min(4, d / 343);
      const near = clamp(1 - (d - 30) / 220, 0, 1);
      const far = clamp(0.35 + d / 300, 0, 1);
      const overall = 1 / (1 + d / 300);
      const cut = clamp(18000 * Math.exp(-d / 160), 450, 18000);
      if (near > 0.02) this.playInternal('weather.thunder.near', { volume: near * overall }, delay, cut);
      this.playInternal('weather.thunder.far', { volume: far * overall }, delay + (near > 0.02 ? 0.12 : 0), cut);
    } catch (e) {
      this.warnOnce('thunder-error', '[audio] thunder failed', e);
    }
  }

  // =======================================================================================
  // loops
  // =======================================================================================

  /** Looping (positional when `pos` is given) source. */
  loop(name: string, opts?: PlayOptions): LoopHandle {
    try {
      const spec = LOOPS[name];
      if (!spec) {
        this.warnOnce(`unknown-loop:${name}`, `[audio] unknown loop '${name}'`);
        return NOOP_LOOP;
      }
      const bank = this.bank;
      if (!this.ctx || !bank) return NOOP_LOOP;
      const p = opts?.pos;
      const st: LoopState = {
        name,
        spec,
        pos: p ? { x: p.x, y: p.y, z: p.z } : null,
        vol: opts?.volume ?? 1,
        pitch: opts?.pitch ?? 1,
        muffle: clamp(opts?.muffle ?? 0, 0, 1),
        stopped: false,
        nodes: null,
        appliedGain: -1,
        appliedCut: -1,
        dist: 0,
      };
      this.loops.push(st);
      bank.request(`l:${name}`, 1, () => this.refreshLoop(st));
      return {
        setPos: (q: Vec3Like) => this.loopSetPos(st, q),
        setVolume: (v: number) => this.loopSetVolume(st, v),
        stop: (fade?: number) => this.loopStop(st, fade ?? 0.25),
      };
    } catch (e) {
      this.warnOnce(`loop-error:${name}`, `[audio] loop(${name}) failed`, e);
      return NOOP_LOOP;
    }
  }

  private loopSetPos(st: LoopState, p: Vec3Like): void {
    if (st.stopped) return;
    if (!st.pos) st.pos = { x: p.x, y: p.y, z: p.z };
    else {
      st.pos.x = p.x;
      st.pos.y = p.y;
      st.pos.z = p.z;
    }
    if (st.nodes?.pan) this.setPannerPos(st.nodes.pan, st.pos);
  }

  private loopSetVolume(st: LoopState, v: number): void {
    if (st.stopped) return;
    st.vol = Math.max(0, v);
    this.refreshLoop(st);
  }

  private loopStop(st: LoopState, fade: number): void {
    if (st.stopped) return;
    st.stopped = true;
    this.stopLoopNodes(st, fade);
    const i = this.loops.indexOf(st);
    if (i >= 0) this.loops.splice(i, 1);
  }

  private loopDistance(st: LoopState): number {
    if (!st.pos) return 0;
    const dx = st.pos.x - this.lis.x;
    const dy = st.pos.y - this.lis.y;
    const dz = st.pos.z - this.lis.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private refreshLoop(st: LoopState): void {
    if (st.stopped || !this.ctx || !this.bank) return;
    const buf = this.bank.get(`l:${st.name}`);
    if (!buf) return;
    const d = this.loopDistance(st);
    st.dist = d;
    const range = MAX_DISTANCE * Math.max(1, st.vol);
    const audible = st.vol > 0 && (!st.pos || d < range);
    if (audible && !st.nodes) {
      if (st.pos && this.activeLoopCount() >= MAX_ACTIVE_LOOPS) return;
      this.startLoopNodes(st, buf);
    } else if (st.nodes && (st.vol <= 0 || (st.pos && d > range + 4))) {
      this.stopLoopNodes(st, 0.3);
      return;
    }
    if (st.nodes) this.applyLoopParams(st, d);
  }

  private activeLoopCount(): number {
    let n = 0;
    for (const l of this.loops) if (l.nodes && l.pos) n++;
    return n;
  }

  private startLoopNodes(st: LoopState, buf: AudioBuffer): void {
    const ctx = this.ctx!;
    const g = this.g!;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = st.pitch;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = this.hz(22000);
    filt.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filt);
    filt.connect(gain);
    let pan: PannerNode | null = null;
    const ref = REF_DISTANCE * Math.max(1, st.vol);
    if (st.pos) {
      pan = this.makePanner(st.pos, ref, this.loopDistance(st) > HRTF_RANGE ? 'equalpower' : 'HRTF');
      gain.connect(pan);
      pan.connect(g.cat[st.spec.cat]);
    } else gain.connect(g.cat[st.spec.cat]);
    let send: GainNode | null = null;
    if (st.pos && st.spec.cat !== 'ui' && st.spec.cat !== 'music') {
      send = ctx.createGain();
      send.gain.value = 0;
      gain.connect(send);
      send.connect(g.send[st.spec.cat]);
    }
    src.start(now + 0.005, this.rng.next() * buf.duration);
    st.nodes = { src, filt, gain, pan, send };
    st.appliedGain = -1;
    st.appliedCut = -1;
  }

  private stopLoopNodes(st: LoopState, fade: number): void {
    const n = st.nodes;
    st.nodes = null;
    if (!n || !this.ctx) return;
    const t = this.ctx.currentTime;
    try {
      holdParam(n.gain.gain, t);
      n.gain.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 3));
      n.src.stop(t + fade + 0.05);
    } catch {
      /* not started */
    }
    n.src.onended = () => {
      try {
        n.src.disconnect();
        n.filt.disconnect();
        n.gain.disconnect();
        n.pan?.disconnect();
        n.send?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }

  private applyLoopParams(st: LoopState, d: number): void {
    const n = st.nodes;
    if (!n || !this.ctx) return;
    const t = this.ctx.currentTime;
    const range = MAX_DISTANCE * Math.max(1, st.vol);
    const edge = st.pos ? 1 - smoothstep(range * 0.75, range, d) : 1;
    const gTarget = (st.spec.level ?? 1) * Math.min(1, st.vol) * edge * (1 - 0.5 * st.muffle);
    if (Math.abs(gTarget - st.appliedGain) > 0.004 + st.appliedGain * 0.01) {
      n.gain.gain.setTargetAtTime(gTarget, t, st.appliedGain < 0 ? 0.12 : 0.06);
      if (n.send) {
        const ref = REF_DISTANCE * Math.max(1, st.vol);
        n.send.gain.setTargetAtTime(0.5 * Math.sqrt(ref / (ref + Math.max(0, d - ref))), t, 0.1);
      }
      st.appliedGain = gTarget;
    }
    // HRTF only near the listener (with hysteresis) — distant loops use the cheaper equal-power panner
    if (n.pan) {
      if (n.pan.panningModel === 'HRTF' && d > HRTF_RANGE + 4) n.pan.panningModel = 'equalpower';
      else if (n.pan.panningModel !== 'HRTF' && d < HRTF_RANGE - 4) n.pan.panningModel = 'HRTF';
    }
    const cut = Math.min(st.muffle > 0 ? muffleCut(st.muffle) : 22000, st.pos ? airCut(d) : 22000);
    if (Math.abs(cut - st.appliedCut) > cut * 0.03) {
      n.filt.frequency.setTargetAtTime(this.hz(cut), t, 0.08);
      st.appliedCut = cut;
    }
  }

  private updateLoops(): void {
    for (const st of this.loops) this.refreshLoop(st);
    // Over the active-loop budget: keep the closest ones audible — swap the farthest active
    // loop for a nearer parked one (one swap per tick converges quickly without thrashing).
    if (this.activeLoopCount() < MAX_ACTIVE_LOOPS) return;
    let farActive: LoopState | null = null;
    let nearParked: LoopState | null = null;
    for (const l of this.loops) {
      if (!l.pos || l.stopped) continue;
      if (l.nodes) {
        if (!farActive || l.dist > farActive.dist) farActive = l;
      } else if (l.vol > 0 && l.dist < MAX_DISTANCE * Math.max(1, l.vol) && (!nearParked || l.dist < nearParked.dist)) nearParked = l;
    }
    if (!farActive || !nearParked || nearParked.dist + 2 >= farActive.dist) return;
    const buf = this.bank?.get(`l:${nearParked.name}`);
    if (!buf) return;
    this.stopLoopNodes(farActive, 0.3);
    this.startLoopNodes(nearParked, buf);
    this.applyLoopParams(nearParked, nearParked.dist);
  }

  // =======================================================================================
  // ambience & music
  // =======================================================================================

  private ambienceHost(): AmbienceHost {
    return {
      bed: (name) => this.loop(name, { volume: 0.0001 }),
      oneShot: (name, o) => this.play(name, o),
      thunder: (d) => this.thunder(d),
      setEnv: (cut, gain) => {
        const g = this.g;
        const c = this.ctx;
        if (!g || !c) return;
        g.env.frequency.setTargetAtTime(this.hz(cut), c.currentTime, 0.05);
        g.envGain.gain.setTargetAtTime(gain, c.currentTime, 0.05);
      },
      setReverb: (small, large) => {
        const g = this.g;
        const c = this.ctx;
        if (!g || !c) return;
        g.verbSmallGain.gain.setTargetAtTime(small, c.currentTime, 0.1);
        g.verbLargeGain.gain.setTargetAtTime(large, c.currentTime, 0.1);
      },
      listener: () => this.lis,
    };
  }

  /** Global ambience mixer input — call every frame with the player's situation. */
  setAmbience(a: AmbienceState): void {
    try {
      this.amb?.set(a);
      this.music?.setTimeOfDay(a.timeOfDay);
    } catch (e) {
      this.warnOnce('ambience-error', '[audio] setAmbience failed', e);
    }
  }

  /** Generative background music mood ('off' fades out). */
  setMusicMode(mode: MusicMode): void {
    this.pendingMusic = mode;
    this.music?.setMode(mode);
  }

  /** Debug: skip the silence before the next piece. */
  musicNext(): void {
    this.music?.next();
  }

  // =======================================================================================
  // per-frame housekeeping
  // =======================================================================================

  update(dt: number): void {
    if (!this.ctx) return;
    try {
      const step = dt > 0 && dt < 1 ? dt : 0.016;
      this.bank?.pump(3);
      this.amb?.update(step);
      this.music?.update(step);
      this.loopTimer -= step;
      if (this.loopTimer <= 0) {
        this.loopTimer = 0.1;
        this.updateLoops();
      }
      this.sweepTimer -= step;
      if (this.sweepTimer <= 0) {
        this.sweepTimer = 1;
        const now = this.ctx.currentTime;
        for (let i = this.voices.length - 1; i >= 0; i--) {
          const v = this.voices[i];
          if (v && now > v.end + 1.5) this.release(v);
        }
        for (let i = this.pending.length - 1; i >= 0; i--) if (now - this.pending[i].t > 5) this.pending.splice(i, 1);
      }
    } catch (e) {
      this.warnOnce('update-error', '[audio] update failed', e);
    }
  }

  // =======================================================================================
  // diagnostics
  // =======================================================================================

  getStats(detail = false): AudioStats {
    const s: AudioStats = {
      state: this.ctx ? this.ctx.state : 'unavailable',
      ready: this._ready,
      sampleRate: this.ctx?.sampleRate ?? 0,
      voices: this.voices.length,
      loops: this.loops.length,
      activeLoops: this.loops.filter((l) => l.nodes).length,
      bank: this.bank?.stats() ?? null,
      music: this.music?.stats() ?? null,
      ambience: this.amb?.levels() ?? {},
    };
    if (detail) s.loopDetail = this.loops.map((l) => ({ name: l.name, dist: Math.round(l.dist * 10) / 10, active: !!l.nodes, positional: !!l.pos }));
    return s;
  }

  /** Output analyser (post-limiter) for meters / debug views. */
  getAnalyser(): AnalyserNode | null {
    return this.g?.analyser ?? null;
  }

  /** Bank access for tools (synchronous rendering, cache inspection). */
  getBank(): SoundBank | null {
    return this.bank;
  }

  /** Clamps a filter frequency below Nyquist (avoids AudioParam range warnings on low-rate contexts). */
  private hz(f: number): number {
    return Math.min(f, this.nyquist * 0.98);
  }

  private warnOnce(key: string, msg: string, err?: unknown): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    if (err !== undefined) console.warn(msg, err);
    else console.warn(msg);
  }
}
