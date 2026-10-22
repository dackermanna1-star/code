// Battlespace audio: a fully procedural, Web Audio battlefield soundscape.
// See README.md in this folder for the API contract and design notes.
import { Ambience } from './ambience.js';
import { loadBank } from './bank.js';
import { BattleBed } from './bed.js';
import { FLYBY_KINDS, FLYBYS, SOUNDS } from './catalog.js';
import { clamp, smoothstep } from './dsp.js';
import { LoopManager } from './loops.js';
import { Mixer } from './mixer.js';
import { Radio } from './radio.js';
import { Listener, MAX_DELAY, SPEED_OF_SOUND, distanceGain } from './spatial.js';
import { MIN_AUDIBLE, VoicePool } from './voices.js';

const DEFAULT_ENV = { wind: 0.3, rain: 0, thunderstorm: false, battleIntensity: 0, nearIntensity: 0, night: false };
const FLYBYS_PER_FRAME = 4;

export class AudioSystem {
  // options: { maxVoices = 48, maxLoops = 8, workers = 3 (synthesis threads, 0 = main thread),
  //            onProgress(fraction), context (inject an AudioContext/OfflineAudioContext; for tests) }
  constructor(options = {}) {
    this.options = { maxVoices: 48, maxLoops: 8, ...options };
    this.ctx = null;
    this._ready = false;
    this._starting = null;
    this.disposed = false;
    this.muted = false;
    this.volume = 1;
    this.voiceRadio = false;
    this.timeScale = 1;
    this.env = { ...DEFAULT_ENV };
    this.listener = new Listener();
    this.sim = { time: 0, timeScale: 1, pitch: 1 };
    this.warned = new Set();
    this.flybyBudget = FLYBYS_PER_FRAME;
    this.synthMs = 0;
    this.suspendTimer = 0;
  }

  get ready() {
    return this._ready;
  }

  // Creates the AudioContext (call from a user gesture) and synthesises every sound.
  start() {
    if (!this._starting) {
      this.disposed = false;
      this._starting = this.boot().catch((err) => {
        this._starting = null;
        throw err;
      });
    }
    return this._starting;
  }

  async boot() {
    const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    const ctx = this.options.context || new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    // Resume synchronously inside the user gesture, before the first await.
    if (!this.offline && ctx.state !== 'running') ctx.resume().catch(() => {});
    const t0 = performance.now();
    const bank = await loadBank(ctx.sampleRate, this.options.onProgress, this.options.workers);
    this.synthMs = performance.now() - t0;
    if (this.disposed) return;
    this.bank = bank;
    this.mixer = new Mixer(ctx, bank.impulse);
    this.voices = new VoicePool(ctx, this.mixer, bank, this.options.maxVoices);
    this.voices.onDuck = (depth, when) => this.mixer.duck(depth, when);
    this.bed = new BattleBed(ctx, this.mixer, bank);
    this.bed.listener = this.listener;
    this.loops = new LoopManager(ctx, this.mixer, bank, this.options.maxLoops);
    this.ambience = new Ambience(ctx, this.mixer, bank);
    this.radioChat = new Radio(ctx, this.mixer, bank);
    this.mixer.setVolume(this.volume);
    this.mixer.setMuted(this.muted);
    this.radioChat.setVolume(this.volume);
    this.radioChat.setSpeech(this.voiceRadio);
    this.applyTimeScale();
    this._ready = true;
    if (this.muted && !this.offline) ctx.suspend().catch(() => {});
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (!this._ready) return;
    this.mixer.setMuted(this.muted);
    clearTimeout(this.suspendTimer);
    if (this.muted) {
      this.voices.stopAll();
      this.loops.stopAll();
      this.radioChat.cancel();
      if (!this.offline) {
        this.suspendTimer = setTimeout(() => {
          if (this.muted && this.ctx) this.ctx.suspend().catch(() => {});
        }, 80);
      }
    } else if (!this.offline) {
      this.ctx.resume().catch(() => {});
    }
  }

  // Linear master gain, 0..1.
  setMasterVolume(v) {
    this.volume = clamp(Number(v) || 0, 0, 1);
    if (!this._ready) return;
    this.mixer.setVolume(this.volume);
    this.radioChat.setVolume(this.volume);
  }

  setVoiceRadio(enabled) {
    this.voiceRadio = !!enabled;
    if (this._ready) this.radioChat.setSpeech(this.voiceRadio);
  }

  // s < 1 slows sound down (lower pitch, softer top end); 0 pauses the sound clock and ducks loops.
  setTimeScale(s) {
    this.timeScale = Math.max(0, Number(s) || 0);
    if (this._ready) this.applyTimeScale();
  }

  applyTimeScale() {
    const s = this.timeScale;
    this.sim.timeScale = s;
    this.sim.pitch = s >= 1 ? 1 : 0.6 + 0.4 * s;
    this.mixer.setTimeScale(s);
    this.loops.setPaused(s <= 0);
  }

  // Per frame. dt in real seconds; listener = { position, forward, up, velocity } (world, metres).
  update(dt, listener) {
    if (listener) this.listener.set(listener);
    if (!this._ready) return;
    const step = clamp(Number(dt) || 0, 0, 0.25);
    this.sim.time += step * this.sim.timeScale;
    this.flybyBudget = FLYBYS_PER_FRAME;
    if (this.muted) return;
    this.voices.update(this.sim, this.listener, this.bed);
    this.bed.update(step, this.sim, this.env, this.listener);
    this.ambience.update(step, this.sim, this.env);
    this.radioChat.update();
  }

  warn(name) {
    if (this.warned.has(name)) return;
    this.warned.add(name);
    console.warn(`[audio] unknown sound "${name}"`);
  }

  play(name, position, opts = {}) {
    if (!this._ready || this.muted) return;
    const def = SOUNDS[name];
    if (!def || def.internal) {
      this.warn(name);
      return;
    }
    const vol = opts.volume ?? 1;
    if (!(vol > 0)) return;
    const spatial = !!(def.spatial && position);
    const ev = {
      def, key: name, spatial, vol, pitch: opts.pitch ?? 1, dur: opts.duration ?? 0,
      due: this.sim.time, loud: def.levelLin * vol, x: 0, y: 0, z: 0,
    };
    if (spatial) {
      const L = this.listener;
      ev.x = position.x || 0;
      ev.y = position.y || 0;
      ev.z = position.z || 0;
      const d = Math.hypot(ev.x - L.px, ev.y - L.py, ev.z - L.pz);
      if (d > def.range) return;
      ev.loud *= distanceGain(def, d);
      // Speed of sound: the flash is seen now, the report arrives d/343 s later.
      ev.due += Math.min(d / SPEED_OF_SOUND, MAX_DELAY * Math.max(this.sim.timeScale, 0.05));
      if (def.bed && d > def.agg) {
        this.bed.add(ev);
        return;
      }
      if (ev.loud < MIN_AUDIBLE) return;
    }
    this.voices.enqueue(ev);
  }

  // A projectile passed `closestPoint` this frame: crack (supersonic) or whizz.
  flyby(kind, closestPoint, speed) {
    if (!this._ready || this.muted || !closestPoint || this.flybyBudget <= 0) return;
    const pair = FLYBY_KINDS[kind];
    if (!pair) {
      this.warn(`flyby:${kind}`);
      return;
    }
    const supersonic = (Number(speed) || 0) > SPEED_OF_SOUND * 1.02;
    const L = this.listener;
    const x = closestPoint.x || 0;
    const y = closestPoint.y || 0;
    const z = closestPoint.z || 0;
    const m = Math.hypot(x - L.px, y - L.py, z - L.pz);
    const keys = [pair[supersonic ? 1 : 0]];
    if (kind === 'rocket' && supersonic) keys.push('heavy_crack');
    for (const key of keys) {
      const def = FLYBYS[key];
      if (m > def.range) continue;
      const g = Math.pow(1 / Math.max(m, 1), def.roll) * (1 - smoothstep(def.range * 0.6, def.range, m));
      this.flybyBudget--;
      this.voices.enqueue({
        def, key: `flyby:${key}`, spatial: true, flyby: true, distGain: g, vol: 1, pitch: 1, dur: 0,
        due: this.sim.time, loud: def.levelLin * g, x, y, z,
      });
    }
  }

  // Every frame: [{ id, kind, position, velocity, intensity }]; the loudest few get loops.
  setLoops(sources) {
    if (!this._ready || this.muted) return;
    this.loops.set(sources, this.listener, this.sim);
  }

  setEnvironment(env = {}) {
    for (const k of Object.keys(DEFAULT_ENV)) if (env[k] !== undefined) this.env[k] = env[k];
  }

  thunder(distance) {
    if (!this._ready || this.muted) return;
    this.ambience.thunder(distance, this.sim);
  }

  radio(text, faction = 0, opts = {}) {
    if (!this._ready || this.muted) return;
    this.radioChat.request(text, faction, opts);
  }

  // Diagnostics for tools and tests.
  stats() {
    if (!this._ready) return { ready: false };
    const now = this.ctx.currentTime;
    const synthesis = { ...this.bank.stats };
    delete synthesis.perKey;
    return {
      ready: true,
      state: this.ctx.state,
      time: now,
      voices: this.voices.activeCount(now),
      maxVoices: this.options.maxVoices,
      pending: this.voices.pending.length,
      voiceStats: { ...this.voices.stats },
      bed: {
        ...this.bed.stats, queue: this.bed.queue.length, rateSmall: this.bed.rateSmall, rateHeavy: this.bed.rateHeavy,
      },
      loops: this.loops.count,
      radio: { ...this.radioChat.stats, queue: this.radioChat.queue.length, busy: !!this.radioChat.current },
      synthesis: { ...synthesis, startMs: this.synthMs },
    };
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.suspendTimer);
    if (this._ready) {
      this.voices.dispose();
      this.bed.dispose();
      this.loops.dispose();
      this.ambience.dispose();
      this.radioChat.dispose();
      this.mixer.dispose();
    }
    if (this.ctx && !this.offline && !this.options.context) this.ctx.close().catch(() => {});
    this._ready = false;
    this._starting = null;
    this.ctx = null;
  }
}
