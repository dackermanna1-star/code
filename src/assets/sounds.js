// Procedural Counter-Strike 1.6 sound library.
//
// Valve's WAVs can't ship, so every sound is synthesised at load time and
// pre-rendered into AudioBuffers. Recipes (./snd/*) are plain JS and run in a
// small pool of Web Workers (falling back to the main thread); each finished
// mix is then rendered through its own OfflineAudioContext (native master EQ),
// all contexts in parallel. The aim is the 2003 soundscape: punchy, dry,
// saturated, band-limited like 22 kHz samples.
//
//   const bank = await buildSoundBank();       // Map<name, AudioBuffer | AudioBuffer[]>
//   const sfx = new SoundEngine(); await sfx.init();
//   sfx.setListener([x, y, z], yaw, pitch);     // GoldSrc space, degrees
//   sfx.play('ak47', { pos: [x, y, z], channel: 'p3:weapon', attenuation: 'loud' });
//   const wind = sfx.loop('ambience_wind', { volume: 0.6 });

import { DEFS, SOUND_GROUPS, SOUND_NAMES, SOUND_META, synthesize, jobList } from './snd/recipes.js';

export { SOUND_GROUPS, SOUND_NAMES, SOUND_META };

// ------------------------------------------------------------- rendering ---

const now = () => (globalThis.performance ? performance.now() : Date.now());

/** Native pass: DC highpass + 4th-order Butterworth "22 kHz era" lowpass, in an OfflineAudioContext. */
async function renderMaster({ name, sr, channels }) {
  const def = DEFS[name];
  const length = channels[0].length;
  const ctx = new OfflineAudioContext({ numberOfChannels: channels.length, length, sampleRate: sr });
  const buf = new AudioBuffer({ numberOfChannels: channels.length, length, sampleRate: sr });
  channels.forEach((c, i) => buf.copyToChannel(c, i));
  const src = new AudioBufferSourceNode(ctx, { buffer: buf });
  // Web Audio LP/HP Q is in dB: -3.01 dB = 0.707 (Butterworth 2nd order),
  // -5.35 / +2.32 dB = 0.541 / 1.307 (the two halves of a 4th-order Butterworth).
  let node = src;
  const link = (n) => {
    node.connect(n);
    node = n;
  };
  link(new BiquadFilterNode(ctx, { type: 'highpass', frequency: def.hp ?? 28, Q: -3.01 }));
  const lofi = def.lofi ?? 10000;
  if (lofi < sr * 0.45) {
    link(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: lofi, Q: -5.35 }));
    link(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: lofi, Q: 2.32 }));
  }
  node.connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return finalize(out, def, sr);
}

// Keep the number of live OfflineAudioContexts bounded (cheap insurance for
// browsers that give every context its own thread).
const MAX_RENDERS = 32;
let activeRenders = 0;
const renderWaiters = [];
async function renderLimited(r) {
  if (activeRenders >= MAX_RENDERS) await new Promise((resolve) => renderWaiters.push(resolve));
  activeRenders++;
  try {
    return await renderMaster(r);
  } finally {
    activeRenders--;
    const next = renderWaiters.shift();
    if (next) next();
  }
}

const tick = () => new Promise((resolve) => {
  if (typeof MessageChannel === 'undefined') return setTimeout(resolve, 0);
  const ch = new MessageChannel();
  ch.port1.onmessage = () => resolve();
  ch.port2.postMessage(0);
});

/**
 * Synthesise every job. The main thread works through a shared queue (biggest
 * first) while up to `nWorkers` module workers pull small batches from the same
 * queue as soon as they have booted, so workers can only make it faster: on a
 * busy or single-core machine the main thread simply does most of the work.
 */
async function synthAll(jobs, nWorkers, sampleRate, onResult) {
  const queue = jobs.slice();
  const stats = { workers: 0, workerJobs: 0, mainJobs: 0, workerFirstMs: [], jsMs: 0, ctxSetupMs: 0 };
  const t0 = now();
  let inFlight = 0;
  let wake = null;
  const poke = () => {
    if (wake) {
      const w = wake;
      wake = null;
      w();
    }
  };
  const pool = [];
  for (let i = 0; i < nWorkers; i++) {
    let w;
    try {
      w = new Worker(new URL('./snd/worker.js', import.meta.url), { type: 'module' });
    } catch {
      break;
    }
    const st = { w, batch: [], dead: false, timer: 0 };
    const kill = () => {
      if (st.dead) return;
      st.dead = true;
      clearTimeout(st.timer);
      w.terminate();
      queue.unshift(...st.batch); // hand unfinished work back
      inFlight -= st.batch.length;
      st.batch = [];
      poke();
    };
    const feed = () => {
      if (st.dead) return;
      if (!queue.length) return kill();
      st.batch = queue.splice(0, 2);
      inFlight += st.batch.length;
      clearTimeout(st.timer);
      st.timer = setTimeout(kill, 8000);
      w.postMessage({ jobs: st.batch.map(({ name, v }) => ({ name, v })), sampleRate });
    };
    w.onmessage = (e) => {
      const r = e.data;
      if (r.ready) {
        stats.workerFirstMs.push(Math.round(now() - t0));
        return feed();
      }
      if (r.idle) return feed();
      const k = st.batch.findIndex((j) => j.name === r.name && j.v === r.v);
      if (k < 0) return;
      st.batch.splice(k, 1);
      inFlight--;
      if (r.error) {
        console.warn('sound worker:', r.error);
        queue.push({ name: r.name, v: r.v });
      } else {
        stats.workerJobs++;
        onResult(r);
      }
      poke();
    };
    w.onerror = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      kill();
    };
    pool.push(st);
  }
  stats.workers = pool.length;
  // Yield now and then so worker messages (and a loading screen) get through.
  const slice = pool.length ? 12 : 40;
  let lastYield = now();
  for (;;) {
    if (queue.length) {
      const { name, v } = queue.shift();
      const ts = now();
      const r = synthesize(name, v, sampleRate);
      const tr = now();
      onResult(r);
      stats.jsMs += tr - ts;
      stats.ctxSetupMs += now() - tr;
      stats.mainJobs++;
      if (now() - lastYield > slice) {
        await tick();
        lastYield = now();
      }
      continue;
    }
    if (inFlight <= 0) break;
    await new Promise((resolve) => {
      wake = resolve;
    });
  }
  for (const st of pool) {
    clearTimeout(st.timer);
    if (!st.dead) st.w.terminate();
  }
  return stats;
}

/** Loop crossfade, loudness normalisation, silence trim, end fade. */
function finalize(buf, def, sr) {
  const nch = buf.numberOfChannels;
  let chans = [];
  for (let c = 0; c < nch; c++) chans.push(buf.getChannelData(c));
  let n = buf.length;

  if (def.loop) {
    const L = Math.round(def.dur * sr);
    const X = n - L;
    chans = chans.map((d) => {
      const o = d.slice(0, L);
      for (let i = 0; i < X; i++) {
        const a = (i / X) * (Math.PI / 2);
        o[i] = d[i] * Math.sin(a) + d[L + i] * Math.cos(a);
      }
      return o;
    });
    n = L;
  }

  let peak = 0, sum = 0;
  for (const d of chans) {
    for (let i = 0; i < n; i++) {
      const v = d[i];
      sum += v * v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
  }
  const rms = Math.sqrt(sum / (n * nch));
  let scale = 1;
  if (peak > 0) {
    scale = def.rms ? def.rms / rms : (def.peak ?? 0.9) / peak;
    scale = Math.min(scale, 0.98 / peak);
  }

  let end = n;
  if (!def.loop) {
    const thr = Math.max(Math.pow(10, -66 / 20), peak * scale * Math.pow(10, -54 / 20)) / scale;
    let last = 0;
    for (const d of chans) {
      for (let i = n - 1; i > last; i--) {
        if (Math.abs(d[i]) > thr) {
          last = i;
          break;
        }
      }
    }
    end = Math.min(n, last + Math.round(0.006 * sr));
  }
  const out = new AudioBuffer({ numberOfChannels: nch, length: Math.max(1, end), sampleRate: sr });
  const fadeN = def.loop ? 0 : Math.min(end, Math.round(0.006 * sr));
  for (let c = 0; c < nch; c++) {
    const o = new Float32Array(end);
    const d = chans[c];
    for (let i = 0; i < end; i++) o[i] = d[i] * scale;
    for (let i = 0; i < fadeN; i++) o[end - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeN);
    out.copyToChannel(o, c);
  }
  return out;
}

/**
 * Render every sound. Returns Map<name, AudioBuffer | AudioBuffer[]> where
 * arrays hold random variants. The map also carries `buildTime` (ms) and `stats`.
 * opts.workers: helper synthesis workers ('auto': cores-2 (max 4) on 6+ core machines, else 0 = main thread only).
 */
export async function buildSoundBank(sampleRate = 44100, { workers = 'auto' } = {}) {
  const t0 = now();
  const jobs = jobList(sampleRate);
  const renders = [];
  const onResult = (r) => renders.push(renderLimited(r).then((b) => [r.name, r.v, b]));
  // Helpers only pay off with cores to spare (on a 4-core box the audio render
  // threads already compete with the main thread).
  const cores = (globalThis.navigator && navigator.hardwareConcurrency) || 2;
  let nW = workers === 'auto' ? (cores >= 6 ? Math.min(4, cores - 2) : 0) : workers | 0;
  if (typeof Worker === 'undefined') nW = 0;
  const st = await synthAll(jobs, Math.max(0, nW), sampleRate, onResult);
  const tSynth = now();
  const done = await Promise.all(renders);
  const tmp = new Map();
  for (const [name, v, b] of done) {
    if (!tmp.has(name)) tmp.set(name, []);
    tmp.get(name)[v] = b;
  }
  const bank = new Map();
  for (const name of SOUND_NAMES) {
    const def = DEFS[name];
    const arr = tmp.get(def.alias ?? name);
    bank.set(name, arr.length === 1 ? arr[0] : arr);
  }
  bank.buildTime = now() - t0;
  bank.sampleRate = sampleRate;
  st.jsMs = Math.round(st.jsMs);
  st.ctxSetupMs = Math.round(st.ctxSetupMs);
  bank.stats = { ...st, synthMs: Math.round(tSynth - t0), renderTailMs: Math.round(now() - tSynth), buffers: done.length };
  return bank;
}

// ---------------------------------------------------------------- engine ---

// GoldSrc ATTN_* factors: volume = 1 - dist * attn / 1000 (silent at 1000/attn units).
export const ATTENUATION = { none: 0, normal: 0.8, static: 1.25, idle: 2.0, loud: 0.27 };

const NULL_HANDLE = Object.freeze({ stop() {}, setVolume() {}, setPosition() {}, playing: false });

export class SoundEngine {
  constructor() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = new GainNode(this.ctx, { gain: 1 });
    // Safety limiter so a wall of gunfire doesn't hard-clip the output.
    this.limiter = new DynamicsCompressorNode(this.ctx, { threshold: -4, knee: 3, ratio: 12, attack: 0.002, release: 0.15 });
    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);
    this.bank = null;
    this.ready = false;
    this.maxVoices = 48;
    this._voices = new Set();
    this._channels = new Map();
    this._lastVariant = new Map();
    this._warned = new Set();
    this._lis = { pos: [0, 0, 0], f: [1, 0, 0], r: [0, -1, 0], u: [0, 0, 1] };
    this._resuming = false;

    if (typeof window !== 'undefined') {
      const evs = ['pointerdown', 'mousedown', 'keydown', 'touchstart'];
      const kick = () => {
        this.resume();
        for (const e of evs) window.removeEventListener(e, kick, true);
      };
      for (const e of evs) window.addEventListener(e, kick, true);
    }
  }

  async init(sampleRate = 44100, opts) {
    this.bank = await buildSoundBank(sampleRate, opts);
    this.buildTime = this.bank.buildTime;
    this.ready = true;
    return this;
  }

  resume() {
    if (this.ctx.state === 'running') return Promise.resolve();
    this._resuming = true;
    return this.ctx.resume().catch(() => {}).finally(() => {
      this._resuming = false;
    });
  }

  setMasterVolume(v) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(Math.max(0, v), t, 0.02);
  }

  /** GoldSrc space: x east, y north, z up; yaw 0 = +X, CCW; pitch + = looking down. Degrees. */
  setListener(posGS, yawDeg = 0, pitchDeg = 0) {
    const y = (yawDeg * Math.PI) / 180;
    const p = (pitchDeg * Math.PI) / 180;
    const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
    const L = this._lis;
    L.pos = [posGS[0], posGS[1], posGS[2]];
    L.f = [cy * cp, sy * cp, -sp];
    L.r = [sy, -cy, 0];
    L.u = [cy * sp, sy * sp, cp];
    for (const v of this._voices) if (v.panner) this._place(v, false);
  }

  /** One-shot. Returns a handle { stop(fade?), setVolume(v), setPosition(pos), playing }. */
  play(name, { pos = null, volume = 1, pitch = 1, channel = null, attenuation } = {}) {
    // Like GoldSrc, one-shots fired while audio is not running are dropped
    // (otherwise they would all go off at once on the first user gesture),
    // unless a resume() is already under way.
    if (this.ctx.state !== 'running' && !this._resuming) return NULL_HANDLE;
    const buf = this._pick(name);
    if (!buf) return NULL_HANDLE;
    const meta = SOUND_META[name];
    const j = meta.jitter ? 1 + (Math.random() * 2 - 1) * meta.jitter : 1;
    if (channel != null) {
      const prev = this._channels.get(channel);
      if (prev) this._stop(prev, 0.008);
    }
    const v = this._start(buf, { pos, volume, rate: pitch * j, attn: attenuation ?? meta.attn, loop: false });
    if (channel != null) {
      v.channel = channel;
      this._channels.set(channel, v);
    }
    return v.handle;
  }

  /** Looping sound (ambience). Returns { stop(fade?), setVolume(v), setPosition(pos), playing }. */
  loop(name, { pos = null, volume = 1, pitch = 1, attenuation, fadeIn = 0.5, channel = null } = {}) {
    const buf = this._pick(name);
    if (!buf) return NULL_HANDLE;
    if (channel != null) {
      const prev = this._channels.get(channel);
      if (prev) this._stop(prev, 0.05);
    }
    const v = this._start(buf, { pos, volume, rate: pitch, attn: attenuation ?? SOUND_META[name].attn, loop: true, fadeIn });
    if (channel != null) {
      v.channel = channel;
      this._channels.set(channel, v);
    }
    return v.handle;
  }

  stopAll(fade = 0.05) {
    for (const v of [...this._voices]) this._stop(v, fade);
  }

  get activeVoices() {
    return this._voices.size;
  }

  // -- internals

  _pick(name) {
    const e = this.bank && this.bank.get(name);
    if (!e) {
      if (!this._warned.has(name)) {
        this._warned.add(name);
        console.warn(this.bank ? `SoundEngine: unknown sound "${name}"` : `SoundEngine: play("${name}") before init()`);
      }
      return null;
    }
    if (!Array.isArray(e)) return e;
    if (e.length === 1) return e[0];
    let i = Math.floor(Math.random() * e.length);
    if (i === this._lastVariant.get(name)) i = (i + 1 + Math.floor(Math.random() * (e.length - 1))) % e.length;
    this._lastVariant.set(name, i);
    return e[i];
  }

  _start(buf, { pos, volume, rate, attn, loop, fadeIn = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = new AudioBufferSourceNode(ctx, { buffer: buf, playbackRate: rate, loop });
    const gain = new GainNode(ctx, { gain: fadeIn ? 0 : volume });
    if (fadeIn) gain.gain.setTargetAtTime(volume, t, fadeIn / 3);
    src.connect(gain);
    const v = { src, gain, panner: null, lp: null, pos: null, maxDist: 0, volume, loop, ended: false, born: t, channel: null };
    const factor = ATTENUATION[attn] ?? ATTENUATION.normal;
    if (pos && factor > 0) {
      v.pos = [pos[0], pos[1], pos[2]];
      v.maxDist = 1000 / factor;
      v.lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: Math.min(20000, ctx.sampleRate * 0.45), Q: -3 });
      v.panner = new PannerNode(ctx, {
        panningModel: 'equalpower', distanceModel: 'linear', refDistance: 1, maxDistance: v.maxDist,
        rolloffFactor: 1, coneInnerAngle: 360, coneOuterAngle: 360,
      });
      gain.connect(v.lp);
      v.lp.connect(v.panner);
      v.panner.connect(this.master);
      this._place(v, true);
    } else {
      gain.connect(this.master);
    }
    src.onended = () => this._end(v);
    src.start();
    this._voices.add(v);
    v.handle = {
      stop: (fade = loop ? 0.3 : 0.01) => this._stop(v, fade),
      setVolume: (x) => {
        v.volume = x;
        if (!v.ended && !v.stopping) gain.gain.setTargetAtTime(Math.max(0, x), ctx.currentTime, 0.03);
      },
      setPosition: (p) => {
        if (v.panner && p) {
          v.pos = [p[0], p[1], p[2]];
          this._place(v, false);
        }
      },
      get playing() {
        return !v.ended;
      },
    };
    if (this._voices.size > this.maxVoices) {
      let oldest = null;
      for (const o of this._voices) if (!o.loop && !o.stopping && (!oldest || o.born < oldest.born)) oldest = o;
      if (oldest && oldest !== v) this._stop(oldest, 0.01);
    }
    return v;
  }

  /** Convert a GoldSrc world position into the (fixed) Web Audio listener frame. */
  _place(v, immediate) {
    const L = this._lis;
    const d0 = v.pos[0] - L.pos[0], d1 = v.pos[1] - L.pos[1], d2 = v.pos[2] - L.pos[2];
    const x = d0 * L.r[0] + d1 * L.r[1] + d2 * L.r[2];
    const y = d0 * L.u[0] + d1 * L.u[1] + d2 * L.u[2];
    const z = -(d0 * L.f[0] + d1 * L.f[1] + d2 * L.f[2]);
    const p = v.panner;
    const t = this.ctx.currentTime;
    if (p.positionX) {
      if (immediate) {
        p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
      } else {
        p.positionX.setTargetAtTime(x, t, 0.015);
        p.positionY.setTargetAtTime(y, t, 0.015);
        p.positionZ.setTargetAtTime(z, t, 0.015);
      }
    } else {
      p.setPosition(x, y, z);
    }
    // Air absorption: distant sounds lose their top end (20 kHz -> ~3.5 kHz at max range).
    const frac = Math.min(1, Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2) / v.maxDist);
    const fc = Math.min(20000, this.ctx.sampleRate * 0.45) * Math.pow(0.18, frac);
    if (immediate) v.lp.frequency.value = fc;
    else v.lp.frequency.setTargetAtTime(fc, t, 0.03);
  }

  _stop(v, fade = 0.01) {
    if (v.ended || v.stopping) return;
    v.stopping = true;
    const t = this.ctx.currentTime;
    const g = v.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fade);
    try {
      v.src.stop(t + fade + 0.005);
    } catch {
      this._end(v);
    }
    if (v.channel != null && this._channels.get(v.channel) === v) this._channels.delete(v.channel);
  }

  _end(v) {
    if (v.ended) return;
    v.ended = true;
    this._voices.delete(v);
    if (v.channel != null && this._channels.get(v.channel) === v) this._channels.delete(v.channel);
    try {
      v.src.disconnect();
      v.gain.disconnect();
      if (v.lp) v.lp.disconnect();
      if (v.panner) v.panner.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}
