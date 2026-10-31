/**
 * GODLINE audio engine — 100% procedural WebAudio (no sample files).
 *
 * Signal flow
 *   voice ─┬─> panner ─> sfxBus ─> sfxFilter (slow-mo lowpass) ─┐
 *          └─> per-voice reverb send ─> reverb (generated IR) ──┤
 *   music pieces ─> sidechain ─> duck ─> silence ─┐             ├─> preMaster ─> glue compressor
 *   stingers ─────────────────────────────────────┴─> musicLP ──┘      ─> limiter ─> master gain ─> soft clip ─> out
 *
 * Every public method is safe to call at any time: before a user gesture (the context is created
 * suspended and resumes on `resume()`), with no WebAudio at all (silent no-ops), or with an
 * OfflineAudioContext (for tests / rendering).
 */
import type { IAudioEngine, LoopHandle, LoopId, MusicStinger, SfxId, SfxParams } from './types';
import { LOOPS, type LoopController, type LoopCtx } from './loops';
import { MusicSystem, type Mood } from './music';
import { LOW_PRIORITY, NO_VARIATION, SFX, SIDECHAIN_TRIGGERS } from './sfx';
import { Voice, clampFreq, makeImpulseResponse, makeNoiseBank, softClipCurve, type NoiseBank, type Sc } from './synth';

const MAX_VOICES = 40;
const DEDUPE_MS = 20;
/** Overall SFX voice gain (headroom for layering). */
const SFX_GAIN = 0.8;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number): number => clamp(Number.isFinite(v) ? v : 0, 0, 1);
const nowMs = (): number => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

interface Graph {
  sfxBus: GainNode;
  sfxFilter: BiquadFilterNode;
  preMaster: GainNode;
  reverbIn: GainNode;
  master: GainNode;
}

/** Handle returned for loops when audio is unavailable. */
class NullLoop implements LoopHandle {
  active = true;
  setIntensity(): void {}
  setPan(): void {}
  stop(): void {
    this.active = false;
  }
}

class LoopVoice implements LoopHandle {
  private _active = true;

  constructor(
    private ctx: BaseAudioContext,
    private fader: GainNode,
    private panner: StereoPannerNode | null,
    private send: GainNode,
    private sources: AudioScheduledSourceNode[],
    private ctl: LoopController,
    private level: number,
    private onDone: (h: LoopVoice) => void,
  ) {}

  get active(): boolean {
    return this._active;
  }

  setIntensity(v: number): void {
    if (!this._active) return;
    try {
      this.ctl.set(clamp01(v), this.ctx.currentTime, 0.08);
    } catch {
      /* ignore */
    }
  }

  setPan(p: number): void {
    if (!this._active || !this.panner) return;
    try {
      this.panner.pan.setTargetAtTime(clamp(Number.isFinite(p) ? p : 0, -1, 1), this.ctx.currentTime, 0.05);
    } catch {
      /* ignore */
    }
  }

  /** Fade-in helper used at creation. */
  start(now: number): void {
    this.fader.gain.setValueAtTime(0, now);
    this.fader.gain.linearRampToValueAtTime(this.level, now + 0.3);
  }

  stop(fadeSeconds = 0.4): void {
    if (!this._active) return;
    this._active = false;
    try {
      const now = this.ctx.currentTime;
      const fade = Math.max(0.02, Number.isFinite(fadeSeconds) ? fadeSeconds : 0.4);
      const g = this.fader.gain;
      const anyG = g as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
      if (typeof anyG.cancelAndHoldAtTime === 'function') anyG.cancelAndHoldAtTime(now);
      else {
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
      }
      g.linearRampToValueAtTime(0, now + fade);
      let remaining = this.sources.length;
      const cleanup = () => {
        try {
          this.fader.disconnect();
          this.panner?.disconnect();
          this.send.disconnect();
        } catch {
          /* ignore */
        }
      };
      for (const s of this.sources) {
        s.onended = () => {
          try {
            s.disconnect();
          } catch {
            /* ignore */
          }
          if (--remaining <= 0) cleanup();
        };
        try {
          s.stop(now + fade + 0.05);
        } catch {
          remaining--;
        }
      }
      if (remaining <= 0) cleanup();
    } catch {
      /* ignore */
    }
    this.onDone(this);
  }
}

export class AudioEngine implements IAudioEngine {
  private ctx: BaseAudioContext | null = null;
  private graph: Graph | null = null;
  private nb: NoiseBank | null = null;
  private music: MusicSystem | null = null;
  private unsupported = false;
  private offline = false;
  private voices: Voice[] = [];
  private loops = new Set<LoopVoice>();
  private lastPlay = new Map<SfxId, number>();
  private slowmo = 0;
  private appliedSlowmo = -1;
  private volume = 0.9;
  private _muted = false;

  constructor(ctx?: BaseAudioContext) {
    if (ctx) {
      this.ctx = ctx;
      try {
        this.build();
      } catch {
        this.unsupported = true;
      }
    }
  }

  /* ------------------------------------------------------------ setup */

  private ensure(): boolean {
    if (this.unsupported) return false;
    if (this.ctx && this.graph) return true;
    try {
      if (!this.ctx) {
        const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
        const AC = g.AudioContext ?? g.webkitAudioContext;
        if (!AC) {
          this.unsupported = true;
          return false;
        }
        this.ctx = new AC({ latencyHint: 'interactive' });
      }
      this.build();
      return true;
    } catch {
      this.unsupported = true;
      return false;
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    const nb = makeNoiseBank(ctx);

    const sfxBus = ctx.createGain();
    const sfxFilter = ctx.createBiquadFilter();
    sfxFilter.type = 'lowpass';
    sfxFilter.frequency.value = clampFreq(ctx, 18000);
    sfxFilter.Q.value = 0.7;
    const preMaster = ctx.createGain();
    preMaster.gain.value = 0.9;

    // Reverb: highpassed send -> generated IR -> return.
    const reverbIn = ctx.createGain();
    const revHp = ctx.createBiquadFilter();
    revHp.type = 'highpass';
    revHp.frequency.value = 170;
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulseResponse(ctx, 2.2);
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.6;
    reverbIn.connect(revHp);
    revHp.connect(convolver);
    convolver.connect(reverbOut);
    reverbOut.connect(preMaster);

    sfxBus.connect(sfxFilter);
    sfxFilter.connect(preMaster);

    // Glue compressor -> limiter -> master volume -> soft clipper.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.09;
    const master = ctx.createGain();
    master.gain.value = this._muted ? 0 : this.volume;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    preMaster.connect(comp);
    comp.connect(limiter);
    limiter.connect(master);
    master.connect(clip);
    clip.connect(ctx.destination);

    this.nb = nb;
    this.graph = { sfxBus, sfxFilter, preMaster, reverbIn, master };
    this.music = new MusicSystem(ctx, nb, this.offline, preMaster, reverbIn);
  }

  /* ------------------------------------------------------------ state */

  get ready(): boolean {
    if (!this.ctx || !this.graph) return false;
    if (this.offline) return true;
    return (this.ctx as AudioContext).state === 'running';
  }

  get muted(): boolean {
    return this._muted;
  }

  /** The underlying context (null until first use). Useful for tests. */
  get context(): BaseAudioContext | null {
    return this.ctx;
  }

  async resume(): Promise<void> {
    if (!this.ensure()) return;
    try {
      const ctx = this.ctx as AudioContext;
      if (!this.offline && ctx.state !== 'running' && typeof ctx.resume === 'function') await ctx.resume();
    } catch {
      /* autoplay policy may still block; keep trying on later gestures */
    }
  }

  setMasterVolume(v: number): void {
    this.volume = clamp01(v);
    if (!this.ctx || !this.graph || this._muted) return;
    try {
      this.graph.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    } catch {
      /* ignore */
    }
  }

  setMuted(m: boolean): void {
    this._muted = !!m;
    if (!this.ctx || !this.graph) return;
    try {
      this.graph.master.gain.setTargetAtTime(this._muted ? 0 : this.volume, this.ctx.currentTime, 0.04);
    } catch {
      /* ignore */
    }
  }

  setSlowmo(amount: number): void {
    const a = clamp01(amount);
    this.slowmo = a;
    if (!this.ctx || !this.graph) return;
    // Called every frame: only touch automation when the value meaningfully changes.
    if (Math.abs(a - this.appliedSlowmo) < 0.01 && !(a === 0 && this.appliedSlowmo !== 0)) return;
    this.appliedSlowmo = a;
    try {
      const now = this.ctx.currentTime;
      const f = 18000 * Math.pow(900 / 18000, a);
      this.graph.sfxFilter.frequency.setTargetAtTime(clampFreq(this.ctx, f), now, 0.06);
      this.graph.sfxFilter.Q.setTargetAtTime(0.7 + a * 1.6, now, 0.06);
      this.music?.setSlowmo(a);
    } catch {
      /* ignore */
    }
  }

  /* ------------------------------------------------------------ sfx */

  play(id: SfxId, params: SfxParams = {}): void {
    try {
      if (!this.ensure()) return;
      const recipe = SFX[id];
      if (!recipe) return;
      const ctx = this.ctx!;
      const g = this.graph!;

      // Merge near-simultaneous duplicates (e.g. two hits resolved in the same frame).
      const ms = nowMs();
      const last = this.lastPlay.get(id);
      if (last !== undefined && ms - last < DEDUPE_MS) return;
      this.lastPlay.set(id, ms);

      // Voice budget.
      if (this.voices.length >= MAX_VOICES) this.voices = this.voices.filter((v) => !v.isFinished);
      if (this.voices.length >= MAX_VOICES) {
        if (LOW_PRIORITY.has(id)) return;
        const victim = this.voices.shift();
        victim?.steal();
      } else if (this.voices.length >= MAX_VOICES - 6 && LOW_PRIORITY.has(id)) {
        return;
      }

      const i = clamp01(params.intensity ?? 0.5);
      const variation = NO_VARIATION.has(id) ? 1 : 1 + (Math.random() * 2 - 1) * 0.04;
      const slowPitch = 1 - 0.3 * this.slowmo;
      const p = clamp((Number.isFinite(params.pitch) ? (params.pitch as number) : 1) * variation * slowPitch, 0.25, 4);
      const st = 1 + 0.35 * this.slowmo;
      const t = ctx.currentTime + 0.004;
      const pan = Number.isFinite(params.pan) ? (params.pan as number) : 0;
      const v = new Voice(ctx, g.sfxBus, g.reverbIn, pan, id, t);
      const vol = clamp(Number.isFinite(params.volume) ? (params.volume as number) : 1, 0, 4);
      v.input.gain.value = vol * SFX_GAIN;
      v.onFinished = (fin) => {
        const k = this.voices.indexOf(fin);
        if (k >= 0) this.voices.splice(k, 1);
      };
      const sc: Sc = {
        ctx,
        t,
        out: v.input,
        p,
        i,
        st,
        aspect: params.aspect,
        v,
        nb: this.nb!,
        rev: (level: number) => {
          v.send.gain.value = clamp01(level);
        },
      };
      recipe(sc);
      if (v.sourceCount === 0) v.finish();
      else this.voices.push(v);

      if (i > 0.8 && SIDECHAIN_TRIGGERS.has(id)) this.music?.sidechainDip(0.55);
    } catch {
      /* never throw from play() */
    }
  }

  /* ------------------------------------------------------------ loops */

  loop(id: LoopId, params: SfxParams = {}): LoopHandle {
    try {
      if (!this.ensure()) return new NullLoop();
      const factory = LOOPS[id];
      if (!factory) return new NullLoop();
      const ctx = this.ctx!;
      const g = this.graph!;
      const now = ctx.currentTime;
      const fader = ctx.createGain();
      fader.gain.value = 0;
      const send = ctx.createGain();
      let panner: StereoPannerNode | null = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.value = clamp(Number.isFinite(params.pan) ? (params.pan as number) : 0, -1, 1);
        fader.connect(panner);
        panner.connect(g.sfxBus);
        panner.connect(send);
      } else {
        fader.connect(g.sfxBus);
        fader.connect(send);
      }
      send.connect(g.reverbIn);
      const sources: AudioScheduledSourceNode[] = [];
      const L: LoopCtx = { ctx, out: fader, nb: this.nb!, aspect: params.aspect, now, sources };
      const ctl = factory(L);
      send.gain.value = ctl.reverb;
      const vol = clamp(Number.isFinite(params.volume) ? (params.volume as number) : 1, 0, 4);
      ctl.set(clamp01(params.intensity ?? 0.5), now, 0.02);
      const h = new LoopVoice(ctx, fader, panner, send, sources, ctl, ctl.level * vol * SFX_GAIN, (done) => this.loops.delete(done));
      h.start(now);
      this.loops.add(h);
      return h;
    } catch {
      return new NullLoop();
    }
  }

  stopAllLoops(fadeSeconds = 0.5): void {
    for (const h of [...this.loops]) h.stop(fadeSeconds);
  }

  /* ------------------------------------------------------------ music */

  startMusic(seed: number, mood?: Mood): void {
    try {
      if (!this.ensure()) return;
      this.music!.start(Number.isFinite(seed) ? seed >>> 0 : 0, mood);
    } catch {
      /* ignore */
    }
  }

  setMusicIntensity(v: number): void {
    try {
      if (!this.ensure()) return;
      this.music!.setIntensity(clamp01(v));
    } catch {
      /* ignore */
    }
  }

  musicStinger(kind: MusicStinger): void {
    try {
      if (!this.ensure()) return;
      this.music!.stinger(kind);
    } catch {
      /* ignore */
    }
  }

  musicSilence(seconds: number): void {
    try {
      if (!this.ensure()) return;
      this.music!.silenceFor(Math.max(0, Number.isFinite(seconds) ? seconds : 0));
    } catch {
      /* ignore */
    }
  }

  duckMusic(amount: number, seconds: number): void {
    try {
      if (!this.ensure()) return;
      this.music!.duckFor(clamp01(amount), Math.max(0, Number.isFinite(seconds) ? seconds : 0));
    } catch {
      /* ignore */
    }
  }

  stopMusic(fadeSeconds = 1.5): void {
    try {
      if (!this.ctx || !this.music) return;
      this.music.stop(fadeSeconds);
    } catch {
      /* ignore */
    }
  }

  /**
   * Extra (not in IAudioEngine): schedule the music `seconds` ahead of the current context time.
   * Needed for OfflineAudioContext rendering, where the real-time scheduler does not run.
   */
  pumpMusic(seconds: number): void {
    try {
      if (!this.ctx || !this.music) return;
      this.music.pump(this.ctx.currentTime + Math.max(0, seconds));
    } catch {
      /* ignore */
    }
  }

  /** Extra: number of live SFX voices (diagnostics). */
  get activeVoices(): number {
    return this.voices.length;
  }
}

export default AudioEngine;
