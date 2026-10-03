// The runtime audio engine behind `audio` (see index.ts).
//
// - Nothing touches Web Audio before the first unlock() (a user gesture); every public method is
//   a safe no-op until then, when Web Audio is missing, or for unknown names. Nothing ever throws.
// - Sounds are synthesised lazily by the Bank (workers) and cached as AudioBuffers; the most used
//   ones are queued in the background right after unlock.
// - One-shots get a random pre-rendered variant plus small pitch / gain variation every time, are
//   capped per sound and globally, and same-instant duplicates are merged.
// - Loops can be requested before unlock: the handle is live immediately and starts sounding once
//   the context runs and its layers are rendered.
// - Mochi never talks over herself, and the music ducks a little while she speaks.

import type { Audio, LoopHandle, LoopName, PlayOpts, SfxName, VoicePhrase } from './types';
import { SFX, SFX_NAMES, type SfxSpec } from './sfx';
import { LOOPS, LOOP_NAMES, type LoopSpec } from './loops';
import { VOICE_PHRASES } from './voice';
import { Bank, PRIO_BG, PRIO_IDLE, PRIO_URGENT, type BankStats } from './bank';
import { Mixer, REVERB_SEC, holdAt } from './mixer';
import { MusicPlayer } from './musicPlayer';
import type { RenderJob } from './render';
import { clamp } from './dsp';

/** Material is rendered at (at most) this rate: plenty for these sounds, ~1/3 less CPU and memory. */
export const RENDER_SR = 32000;
const MAX_ONESHOTS = 24;
const MAX_LOOPS = 12;
/** pre-rendered takes per voice phrase (each one is replaced by a fresh take after it is used) */
const VOICE_SLOTS = 2;
/** Sounds queued first after unlock (most frequent interactions). */
const FIRST_SFX: readonly SfxName[] = [
  'tap', 'pickup', 'pop', 'swish', 'drop-soft', 'click', 'knob', 'ui-open', 'ui-close', 'page', 'magic', 'boing',
  'drop-hard', 'drop-squish', 'drop-liquid', 'drop-crunchy', 'chop', 'combine', 'discover', 'sparkle', 'camera',
  'door-open', 'door-close', 'drawer-open', 'drawer-close', 'fridge-open', 'fridge-close', 'shake', 'pour',
];

const VOICE_SET = new Set<string>(VOICE_PHRASES);

function num(v: unknown, lo: number, hi: number, def: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : def;
}
const semis = (st: number) => Math.pow(2, st / 12);
const rand = (a: number, b: number) => a + (b - a) * Math.random();
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function sfxVariants(spec: SfxSpec): number {
  return Math.max(1, spec.variants ?? (spec.dur >= 0.9 ? 2 : 3));
}
const sfxKey = (n: string, v: number) => `sfx:${n}:${v}`;
const layerKey = (n: string, l: number) => `layer:${n}:${l}`;
const eventKey = (n: string, v: number) => `event:${n}:${v}`;
const voiceKey = (p: string, s: number) => `voice:${p}:${s}`;

interface Shot {
  src: AudioBufferSourceNode;
  gain: GainNode;
  extra: AudioNode | null;
  name: string;
  end: number;
  stopped: boolean;
}

const NOOP_HANDLE: LoopHandle = Object.freeze({
  setVolume() {},
  setPitch() {},
  stop() {},
  playing: false,
});

export interface EngineOptions {
  /** use this context instead of creating one on unlock (e.g. an OfflineAudioContext in tests) */
  context?: BaseAudioContext;
  /** render in Web Workers (default: true for live contexts) */
  workers?: boolean;
  reverb?: boolean;
}

export interface EngineDebug {
  supported: boolean;
  state: string;
  sampleRate: number;
  renderRate: number;
  bank: BankStats | null;
  oneShots: number;
  loops: string[];
  music: { running: boolean; bars: number; notes: number };
  sfxEnabled: boolean;
  musicEnabled: boolean;
  reductionDb: number;
  faults: number;
  lastFault: string;
}

export class Engine implements Audio {
  private ctx: BaseAudioContext | null = null;
  private mixer: Mixer | null = null;
  private bank: Bank | null = null;
  private music: MusicPlayer | null = null;
  private readonly supported: boolean;
  private readonly offline: boolean;
  private failed = false;
  private sfxOn = true;
  private musicOn = true;
  private musicWanted = false;
  private masterVol = 1;
  private unlockedAt = -1e9;
  private shots: Shot[] = [];
  private recent = new Map<string, { t: number; n: number }>();
  private lastPick = new Map<string, number>();
  private readonly loops = new Set<LoopInstance>();
  private deferred: { at: number; run: () => void }[] = [];
  private voiceNow: Shot | null = null;
  private voiceToken = 0;
  private voiceSeed = 1;
  private prerendered = false;
  private hiddenSuspended = false;
  /** errors swallowed by the never-throw guards (diagnostics) */
  faults = 0;
  lastFault = '';

  constructor(private readonly opts: EngineOptions = {}) {
    this.offline = !!opts.context;
    let ok = false;
    try {
      const w = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null;
      ok = !!opts.context || !!(w && (w.AudioContext || w.webkitAudioContext));
    } catch {
      ok = false;
    }
    this.supported = ok;
    if (opts.context) {
      try {
        this.setup(opts.context);
      } catch {
        this.failed = true;
      }
    }
  }

  // --------------------------------------------------------------------------------------------
  // Public API

  get ready(): boolean {
    return !!this.ctx && !this.failed && this.isRunning();
  }
  get sfxEnabled(): boolean {
    return this.sfxOn;
  }
  get musicEnabled(): boolean {
    return this.musicOn;
  }

  unlock(): void {
    try {
      if (!this.supported || this.failed) return;
      if (!this.ctx && !this.create()) return;
      if (this.offline) {
        this.onRunning();
        return;
      }
      const ctx = this.ctx as AudioContext;
      this.unlockedAt = nowMs();
      if (ctx.state === 'running') {
        this.onRunning();
        return;
      }
      this.hiddenSuspended = false;
      const p = ctx.resume?.();
      if (p && typeof p.then === 'function') p.then(() => this.onRunning(), () => {});
      // iOS: starting a (silent) buffer inside the gesture fully unlocks output
      try {
        const s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        s.connect(ctx.destination);
        s.start(0);
      } catch {
        /* ignore */
      }
    } catch (e) {
      this.fault(e);
    }
  }

  play(name: SfxName, opts?: PlayOpts): void {
    try {
      if (!this.sfxOn || !this.ctx || this.failed) return;
      const spec = Object.prototype.hasOwnProperty.call(SFX, name) ? SFX[name] : undefined;
      if (!spec) return;
      if (!this.isRunning()) {
        // the context is still resuming from the gesture that triggered this sound
        if (nowMs() - this.unlockedAt < 350) this.defer(() => this.play(name, opts));
        return;
      }
      this.playSfx(name, spec, opts);
    } catch (e) {
      this.fault(e);
    }
  }

  loop(name: LoopName, opts?: { volume?: number; pitch?: number; pan?: number }): LoopHandle {
    try {
      if (!this.supported || this.failed) return NOOP_HANDLE;
      const spec = Object.prototype.hasOwnProperty.call(LOOPS, name) ? LOOPS[name] : undefined;
      if (!spec) return NOOP_HANDLE;
      if (this.loops.size >= MAX_LOOPS) return NOOP_HANDLE;
      const inst = new LoopInstance(this, name, spec, opts);
      this.loops.add(inst);
      if (this.ctx && this.isRunning()) inst.activate();
      return inst;
    } catch (e) {
      this.fault(e);
      return NOOP_HANDLE;
    }
  }

  voice(phrase: VoicePhrase, opts?: { pitch?: number; volume?: number }): void {
    try {
      if (!this.sfxOn || !this.ctx || this.failed || !VOICE_SET.has(phrase)) return;
      if (!this.isRunning()) {
        if (nowMs() - this.unlockedAt < 350) this.defer(() => this.voice(phrase, opts));
        return;
      }
      const bank = this.bank as Bank;
      const ready: number[] = [];
      for (let s = 0; s < VOICE_SLOTS; s++) if (bank.has(voiceKey(phrase, s))) ready.push(s);
      const token = ++this.voiceToken;
      if (!ready.length) {
        const key = voiceKey(phrase, 0);
        const job: RenderJob = { k: 'voice', phrase, seed: this.voiceSeed++ };
        if (!bank.workerMode) {
          const b = bank.renderNow(key, job);
          if (b) this.startVoice(phrase, 0, b, opts);
          return;
        }
        const ctx = this.ctx;
        const t0 = ctx.currentTime;
        bank.request(key, job, PRIO_URGENT, (b) => {
          // still the latest request and not stale -> say it
          if (b && token === this.voiceToken && this.sfxOn && ctx.currentTime - t0 < 0.6) this.startVoice(phrase, 0, b, opts);
        });
        return;
      }
      const s = this.pick(`voice:${phrase}`, ready);
      const b = bank.get(voiceKey(phrase, s));
      if (b) this.startVoice(phrase, s, b, opts);
    } catch (e) {
      this.fault(e);
    }
  }

  setSfxEnabled(on: boolean): void {
    try {
      this.sfxOn = !!on;
      this.mixer?.setSfxEnabled(this.sfxOn);
      if (!this.sfxOn) {
        this.deferred = [];
        for (const s of this.shots) this.fadeStop(s, 0.05);
        if (this.voiceNow) this.fadeStop(this.voiceNow, 0.05);
      }
    } catch (e) {
      this.fault(e);
    }
  }

  setMusicEnabled(on: boolean): void {
    try {
      this.musicOn = !!on;
      this.syncMusic();
    } catch (e) {
      this.fault(e);
    }
  }

  startMusic(): void {
    try {
      this.musicWanted = true;
      this.syncMusic();
    } catch (e) {
      this.fault(e);
    }
  }

  duckMusic(amount: number, seconds: number): void {
    try {
      this.mixer?.duck(num(amount, 0, 1, 0), num(seconds, 0, 60, 0));
    } catch (e) {
      this.fault(e);
    }
  }

  setMasterVolume(v: number): void {
    try {
      this.masterVol = num(v, 0, 1, this.masterVol);
      this.mixer?.setMaster(this.masterVol);
    } catch (e) {
      this.fault(e);
    }
  }

  // --------------------------------------------------------------------------------------------
  // Diagnostics / testing (not part of the public `Audio` interface)

  /** Records an error swallowed by a never-throw guard (and reports it once in dev builds). */
  fault(e: unknown): void {
    this.faults++;
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    if (msg === this.lastFault) return;
    this.lastFault = msg;
    try {
      if (import.meta.env?.DEV) console.warn('[audio] suppressed error:', e);
    } catch {
      /* ignore */
    }
  }

  debug(): EngineDebug {
    const ctx = this.ctx as (BaseAudioContext & { state?: string }) | null;
    return {
      supported: this.supported,
      state: ctx ? String(ctx.state) : 'none',
      sampleRate: ctx?.sampleRate ?? 0,
      renderRate: this.bank?.sr ?? 0,
      bank: this.bank?.stats() ?? null,
      oneShots: this.shots.length,
      loops: [...this.loops].map((l) => `${l.name}:${l.status}`),
      music: { running: !!this.music?.running, bars: this.music?.barsScheduled ?? 0, notes: this.music?.liveNotes ?? 0 },
      sfxEnabled: this.sfxOn,
      musicEnabled: this.musicOn,
      reductionDb: this.mixer?.reduction ?? 0,
      faults: this.faults,
      lastFault: this.lastFault,
    };
  }

  /** Analyser on the master output (created on first call). */
  meter(): AnalyserNode | null {
    try {
      return this.mixer?.meter() ?? null;
    } catch {
      return null;
    }
  }

  /** Offline tests: schedule music synchronously up to context time `t`. */
  scheduleMusicUntil(t: number): void {
    this.music?.scheduleUntil(t);
  }

  // --------------------------------------------------------------------------------------------
  // Internals shared with LoopInstance

  get context(): BaseAudioContext | null {
    return this.ctx;
  }
  get soundBank(): Bank | null {
    return this.bank;
  }
  get mix(): Mixer | null {
    return this.mixer;
  }
  isRunning(): boolean {
    const ctx = this.ctx as (BaseAudioContext & { state?: string }) | null;
    return !!ctx && (this.offline || ctx.state === 'running');
  }
  forgetLoop(l: LoopInstance): void {
    this.loops.delete(l);
  }
  activeCount(name: LoopName): number {
    let n = 0;
    for (const l of this.loops) if (l.name === name && l.status !== 'off') n++;
    return n;
  }

  // --------------------------------------------------------------------------------------------

  private create(): boolean {
    try {
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const AC = w.AudioContext ?? w.webkitAudioContext;
      if (!AC) {
        this.failed = true;
        return false;
      }
      let ctx: AudioContext;
      try {
        ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        ctx = new AC();
      }
      this.setup(ctx);
      try {
        ctx.addEventListener('statechange', () => {
          if (ctx.state === 'running') this.onRunning();
        });
      } catch {
        /* ignore */
      }
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
      return true;
    } catch {
      this.failed = true;
      this.ctx = null;
      return false;
    }
  }

  private setup(ctx: BaseAudioContext): void {
    const mixer = new Mixer(ctx, { master: this.masterVol });
    mixer.connectTo(ctx.destination);
    if (!this.sfxOn) mixer.setSfxEnabled(false);
    const bank = new Bank(ctx, Math.min(RENDER_SR, ctx.sampleRate), this.opts.workers ?? !this.offline, this.offline);
    const music = new MusicPlayer(ctx, mixer.musicIn, bank);
    music.sync = this.offline;
    this.ctx = ctx;
    this.mixer = mixer;
    this.bank = bank;
    this.music = music;
    if (this.opts.reverb !== false)
      bank.requestRaw('ir', { k: 'ir', sr: ctx.sampleRate, dur: REVERB_SEC, seed: 11 }, PRIO_BG, (ir) => {
        if (ir) mixer.attachReverb(ir);
      });
    // control tick: music look-ahead, throttled loop parameters, housekeeping
    if (!this.offline) setInterval(() => this.tick(), 100);
  }

  private onRunning(): void {
    if (!this.isRunning()) return;
    for (const l of this.loops) l.activate();
    this.syncMusic();
    if (this.deferred.length) {
      const now = nowMs();
      const list = this.deferred;
      this.deferred = [];
      for (const d of list) {
        if (now - d.at > 400) continue;
        try {
          d.run();
        } catch (e) {
          this.fault(e);
        }
      }
    }
    if (!this.prerendered && !this.offline) {
      this.prerendered = true;
      this.prerender();
    }
  }

  private onVisibility = (): void => {
    try {
      const ctx = this.ctx as AudioContext | null;
      if (!ctx || this.offline || typeof document === 'undefined') return;
      if (document.hidden) {
        // pause everything (music timing included) while the game is in the background
        if (ctx.state === 'running') {
          this.hiddenSuspended = true;
          ctx.suspend().catch(() => {});
        }
      } else if (this.hiddenSuspended) {
        this.hiddenSuspended = false;
        ctx.resume().then(
          () => this.onRunning(),
          () => {},
        );
      }
    } catch (e) {
      this.fault(e);
    }
  };

  private tick(): void {
    try {
      if (!this.ctx || !this.isRunning()) return;
      this.music?.tick();
      const now = this.ctx.currentTime;
      // safety net for sources whose `ended` event never arrived
      if (this.shots.length) for (const s of this.shots.filter((x) => now > x.end + 1)) this.release(s);
      for (const l of this.loops) l.flush();
    } catch (e) {
      this.fault(e);
    }
  }

  private defer(run: () => void): void {
    if (this.deferred.length < 8) this.deferred.push({ at: nowMs(), run });
  }

  private syncMusic(): void {
    const m = this.music;
    if (!m) return;
    const want = this.musicOn && this.musicWanted;
    if (want && !m.running && this.isRunning()) m.start();
    else if (!want && m.running) m.stop(0.6);
  }

  private prerender(): void {
    const b = this.bank;
    if (!b) return;
    const sfx = (n: SfxName, v: number, prio: number) => b.request(sfxKey(n, v), { k: 'sfx', name: n, v }, prio);
    const voice = (p: VoicePhrase, s: number, prio: number) =>
      b.request(voiceKey(p, s), { k: 'voice', phrase: p, seed: this.voiceSeed++ }, prio);
    for (const n of FIRST_SFX) sfx(n, 0, PRIO_BG);
    voice('hi', 0, PRIO_BG);
    for (const p of VOICE_PHRASES) voice(p, 0, PRIO_BG);
    for (const n of SFX_NAMES) sfx(n, 0, PRIO_BG);
    for (const n of LOOP_NAMES) LOOPS[n].layers.forEach((_, l) => b.request(layerKey(n, l), { k: 'layer', name: n, layer: l }, PRIO_IDLE));
    for (const n of SFX_NAMES) for (let v = 1; v < sfxVariants(SFX[n]); v++) sfx(n, v, PRIO_IDLE);
    for (const p of VOICE_PHRASES) for (let s = 1; s < VOICE_SLOTS; s++) voice(p, s, PRIO_IDLE);
  }

  /** Random choice from `ready`, avoiding the previous pick for this sound when possible. */
  private pick(id: string, ready: number[]): number {
    const last = this.lastPick.get(id);
    let options = ready;
    if (ready.length > 1 && last !== undefined) options = ready.filter((v) => v !== last);
    const v = options[Math.floor(Math.random() * options.length)] ?? ready[0];
    this.lastPick.set(id, v);
    return v;
  }

  private playSfx(name: SfxName, spec: SfxSpec, opts?: PlayOpts): void {
    const bank = this.bank as Bank;
    const ctx = this.ctx as BaseAudioContext;
    const n = sfxVariants(spec);
    const ready: number[] = [];
    for (let v = 0; v < n; v++) {
      if (bank.has(sfxKey(name, v))) ready.push(v);
      else if (!bank.isPending(sfxKey(name, v))) bank.request(sfxKey(name, v), { k: 'sfx', name, v }, PRIO_BG);
    }
    if (!ready.length) {
      const job: RenderJob = { k: 'sfx', name, v: 0 };
      if (!bank.workerMode) {
        const b = bank.renderNow(sfxKey(name, 0), job);
        if (b) this.startShot(name, spec, b, opts);
        return;
      }
      // render it now and play it if it arrives in time (long, "event" sounds may be a bit late)
      const t0 = ctx.currentTime;
      const tolerance = spec.dur >= 0.8 ? 0.6 : 0.15;
      bank.request(sfxKey(name, 0), job, PRIO_URGENT, (b) => {
        if (b && this.sfxOn && ctx.currentTime - t0 <= tolerance) this.startShot(name, spec, b, opts);
      });
      return;
    }
    const v = this.pick(name, ready);
    const b = bank.get(sfxKey(name, v));
    if (b) this.startShot(name, spec, b, opts);
  }

  private startShot(name: SfxName, spec: SfxSpec, buf: AudioBuffer, opts?: PlayOpts): void {
    const ctx = this.ctx as BaseAudioContext;
    const mixer = this.mixer as Mixer;
    const now = ctx.currentTime;
    const when = now + num(opts?.delay, 0, 30, 0);
    // merge same-instant duplicates (two systems reacting to one event): quieter, then dropped
    const rec = this.recent.get(name);
    let dup = 1;
    if (rec && Math.abs(when - rec.t) < 0.035) {
      rec.n++;
      if (rec.n > 3) return;
      dup = rec.n === 2 ? 0.55 : 0.35;
    } else this.recent.set(name, { t: when, n: 1 });
    const pv = spec.pv ?? 0.6;
    const gv = spec.gv ?? 1.5;
    const rate = num(opts?.pitch, 0.25, 4, 1) * semis(rand(-pv, pv));
    const vol = num(opts?.volume, 0, 4, 1) * Math.pow(10, rand(-gv, gv) / 20) * dup;
    if (vol < 1e-4) return;
    const shot = this.makeShot(buf, rate, vol, num(opts?.pan, -1, 1, 0), mixer.sfxIn, name);
    shot.src.start(when);
    shot.end = when + buf.duration / rate;
    this.shots.push(shot);
    this.enforceCaps(name, spec.voices ?? 6);
  }

  private makeShot(buf: AudioBuffer, rate: number, vol: number, pan: number, dest: AudioNode, name: string): Shot {
    const ctx = this.ctx as BaseAudioContext;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (rate !== 1) src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    let extra: AudioNode | null = null;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      gain.connect(p);
      p.connect(dest);
      extra = p;
    } else gain.connect(dest);
    const shot: Shot = { src, gain, extra, name, end: ctx.currentTime + buf.duration / rate, stopped: false };
    src.onended = () => this.release(shot);
    return shot;
  }

  private enforceCaps(name: string, cap: number): void {
    let same = 0;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      if (s.stopped || s.name !== name) continue;
      if (++same > cap) this.fadeStop(s, 0.03);
    }
    let live = 0;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      if (s.stopped) continue;
      if (++live > MAX_ONESHOTS) this.fadeStop(s, 0.03);
    }
  }

  private fadeStop(s: Shot, t: number): void {
    if (s.stopped) return;
    s.stopped = true;
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    try {
      holdAt(s.gain.gain, now);
      s.gain.gain.linearRampToValueAtTime(0, now + t);
      s.src.stop(now + t + 0.01);
    } catch {
      /* already ended */
    }
    s.end = Math.min(s.end, now + t + 0.01);
  }

  private release(s: Shot): void {
    s.stopped = true;
    const i = this.shots.indexOf(s);
    if (i >= 0) this.shots.splice(i, 1);
    if (this.voiceNow === s) this.voiceNow = null;
    try {
      s.gain.disconnect();
      s.extra?.disconnect();
    } catch {
      /* ignore */
    }
  }

  private startVoice(phrase: VoicePhrase, slot: number, buf: AudioBuffer, opts?: { pitch?: number; volume?: number }): void {
    const ctx = this.ctx as BaseAudioContext;
    const mixer = this.mixer as Mixer;
    const bank = this.bank as Bank;
    // Mochi never talks over herself
    if (this.voiceNow) this.fadeStop(this.voiceNow, 0.04);
    const rate = num(opts?.pitch, 0.5, 2, 1) * semis(rand(-0.3, 0.3));
    const vol = num(opts?.volume, 0, 4, 1);
    if (vol < 1e-4) return;
    const shot = this.makeShot(buf, rate, vol, 0, mixer.voiceIn, `voice:${phrase}`);
    const when = ctx.currentTime + 0.004;
    shot.src.start(when);
    shot.end = when + buf.duration / rate;
    this.voiceNow = shot;
    mixer.duck(0.3, buf.duration / rate + 0.15);
    // replace the used take with a brand-new one so Mochi never sounds canned
    const key = voiceKey(phrase, slot);
    bank.drop(key);
    bank.request(key, { k: 'voice', phrase, seed: this.voiceSeed++ }, PRIO_IDLE);
  }
}

// ------------------------------------------------------------------------------------------------

type LoopStatus = 'pending' | 'loading' | 'on' | 'off';

/** A running (or about to run) loop. Implements the public LoopHandle. */
class LoopInstance implements LoopHandle {
  status: LoopStatus = 'pending';
  private vol: number;
  private pitch: number;
  private readonly pan: number;
  private srcs: AudioBufferSourceNode[] = [];
  private fade: GainNode | null = null;
  private volGain: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private evTimer: ReturnType<typeof setTimeout> | null = null;
  private detune = 1;
  private volTc = 0.03;
  private volDirty = false;
  private volAt = -1;
  private volApplied = 0;
  private pitchTc = 0.03;
  private pitchDirty = false;
  private pitchAt = -1;
  private pitchApplied = 1;

  constructor(
    private readonly host: Engine,
    readonly name: LoopName,
    private readonly spec: LoopSpec,
    opts?: { volume?: number; pitch?: number; pan?: number },
  ) {
    this.vol = num(opts?.volume, 0, 4, 1);
    this.pitch = num(opts?.pitch, 0.25, 4, 1);
    this.pan = num(opts?.pan, -1, 1, 0);
  }

  get playing(): boolean {
    return this.status !== 'off';
  }

  setVolume(v: number, rampSeconds?: number): void {
    try {
      this.vol = num(v, 0, 4, this.vol);
      this.volTc = Math.max(0.004, num(rampSeconds, 0, 30, 0.08) / 3);
      this.volDirty = true;
      this.flushVol(false);
    } catch (e) {
      this.host.fault(e);
    }
  }

  setPitch(p: number, rampSeconds?: number): void {
    try {
      this.pitch = num(p, 0.25, 4, this.pitch);
      this.pitchTc = Math.max(0.004, num(rampSeconds, 0, 30, 0.08) / 3);
      this.pitchDirty = true;
      this.flushPitch(false);
    } catch (e) {
      this.host.fault(e);
    }
  }

  stop(fadeSeconds?: number): void {
    try {
      if (this.status === 'off') return;
      this.status = 'off';
      this.host.forgetLoop(this);
      if (this.evTimer !== null) clearTimeout(this.evTimer);
      this.evTimer = null;
      const ctx = this.host.context;
      const fade = this.fade;
      if (!ctx || !fade) return;
      const f = num(fadeSeconds, 0.005, 30, 0.25);
      const now = ctx.currentTime;
      holdAt(fade.gain, now);
      fade.gain.linearRampToValueAtTime(0, now + f);
      const srcs = this.srcs;
      const nodes = this.nodes;
      for (const s of srcs) {
        try {
          s.stop(now + f + 0.02);
        } catch {
          /* ignore */
        }
      }
      const cleanup = () => {
        for (const n of nodes) {
          try {
            n.disconnect();
          } catch {
            /* ignore */
          }
        }
      };
      if (srcs[0]) srcs[0].onended = cleanup;
      else cleanup();
    } catch (e) {
      this.host.fault(e);
    }
  }

  /** Context is running: start loading / playing (no-op unless pending). */
  activate(): void {
    if (this.status !== 'pending') return;
    const bank = this.host.soundBank;
    if (!bank) return;
    this.status = 'loading';
    const n = this.spec.layers.length;
    const bufs: (AudioBuffer | null)[] = new Array(n).fill(null);
    let got = 0;
    for (let i = 0; i < n; i++) {
      bank.request(layerKey(this.name, i), { k: 'layer', name: this.name, layer: i }, PRIO_URGENT, (b) => {
        bufs[i] = b;
        if (++got === n) this.build(bufs);
      });
    }
    const ev = this.spec.events;
    if (ev) for (let v = 0; v < ev.variants; v++) bank.request(eventKey(this.name, v), { k: 'event', name: this.name, v }, PRIO_BG);
  }

  /** Engine tick: apply throttled parameter changes. */
  flush(): void {
    this.flushVol(true);
    this.flushPitch(true);
  }

  private build(bufs: (AudioBuffer | null)[]): void {
    if (this.status !== 'loading') return;
    const ctx = this.host.context;
    const mixer = this.host.mix;
    if (!ctx || !mixer || bufs.some((b) => !b)) {
      this.status = 'on'; // silent but harmless
      return;
    }
    const now = ctx.currentTime;
    const fade = ctx.createGain();
    fade.gain.value = 0;
    const volGain = ctx.createGain();
    volGain.gain.value = this.vol;
    fade.connect(volGain);
    let tail: AudioNode = volGain;
    if (this.pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = this.pan;
      volGain.connect(p);
      tail = p;
      this.nodes.push(p);
    }
    tail.connect(mixer.loopIn);
    this.nodes.push(fade, volGain);
    // a second pan / pot of the same thing: detune + random offsets so the copies never phase
    this.detune = this.host.activeCount(this.name) > 1 ? semis(rand(-0.3, 0.3)) : 1;
    this.spec.layers.forEach((layer, i) => {
      const b = bufs[i] as AudioBuffer;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.loop = true;
      src.playbackRate.value = this.pitch * this.detune;
      let out: AudioNode = src;
      if (layer.pan && typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner();
        p.pan.value = layer.pan;
        src.connect(p);
        out = p;
        this.nodes.push(p);
      }
      out.connect(fade);
      src.start(now + 0.01, Math.random() * b.duration);
      this.srcs.push(src);
      this.nodes.push(src);
    });
    fade.gain.setValueAtTime(0, now + 0.01);
    fade.gain.linearRampToValueAtTime(1, now + 0.16);
    this.fade = fade;
    this.volGain = volGain;
    this.volApplied = this.vol;
    this.pitchApplied = this.pitch;
    this.volDirty = this.pitchDirty = false;
    this.status = 'on';
    this.armEvent();
  }

  private flushVol(force: boolean): void {
    const ctx = this.host.context;
    if (!this.volDirty || !this.volGain || !ctx) return;
    const now = ctx.currentTime;
    // per-frame callers: at most ~30 automation events per second unless the jump is large
    if (!force && now - this.volAt < 0.033 && Math.abs(this.vol - this.volApplied) < 0.08) return;
    this.volGain.gain.setTargetAtTime(this.vol, now, this.volTc);
    this.volApplied = this.vol;
    this.volAt = now;
    this.volDirty = false;
  }

  private flushPitch(force: boolean): void {
    const ctx = this.host.context;
    if (!this.pitchDirty || !this.srcs.length || !ctx) return;
    const now = ctx.currentTime;
    if (!force && now - this.pitchAt < 0.033 && Math.abs(this.pitch - this.pitchApplied) < 0.05) return;
    for (const s of this.srcs) s.playbackRate.setTargetAtTime(this.pitch * this.detune, now, this.pitchTc);
    this.pitchApplied = this.pitch;
    this.pitchAt = now;
    this.pitchDirty = false;
  }

  private armEvent(): void {
    const ev = this.spec.events;
    if (!ev || this.status !== 'on') return;
    const wait = rand(ev.every[0], ev.every[1]);
    this.evTimer = setTimeout(() => {
      this.evTimer = null;
      this.fireEvent();
      this.armEvent();
    }, wait * 1000);
  }

  private fireEvent(): void {
    try {
      const ev = this.spec.events;
      const ctx = this.host.context;
      const bank = this.host.soundBank;
      if (!ev || !ctx || !bank || this.status !== 'on' || !this.fade || !this.host.isRunning()) return;
      const ready: number[] = [];
      for (let v = 0; v < ev.variants; v++) if (bank.has(eventKey(this.name, v))) ready.push(v);
      if (!ready.length) return;
      const b = bank.get(eventKey(this.name, ready[Math.floor(Math.random() * ready.length)]));
      if (!b) return;
      const src = ctx.createBufferSource();
      src.buffer = b;
      const pv = ev.pv ?? 0;
      src.playbackRate.value = this.pitch * semis(rand(-pv, pv));
      let p: StereoPannerNode | null = null;
      if (ev.pan && typeof ctx.createStereoPanner === 'function') {
        p = ctx.createStereoPanner();
        p.pan.value = clamp(rand(-ev.pan, ev.pan), -1, 1);
        src.connect(p);
        p.connect(this.fade);
      } else src.connect(this.fade);
      src.start(ctx.currentTime + 0.01);
      src.onended = () => {
        try {
          src.disconnect();
          p?.disconnect();
        } catch {
          /* ignore */
        }
      };
    } catch (e) {
      this.host.fault(e);
    }
  }
}
