// Audio engine: procedural SFX + music (synthesised at runtime in Workers), positional playback,
// voice management, category buses, muffling, pause and music cue control.
import * as THREE from 'three';
import { SOUND_DEFS, SOUND_NAMES as SFX_NAMES, renderSound } from './sfx/sounds.js';
import { MUSIC_DEFS, MUSIC_CUES as CUE_NAMES, renderMusic } from './sfx/music.js';
// inlined so the single-file build (and file://) can start synth workers
import SfxWorker from './sfx/worker.js?worker&inline';

export const SOUND_NAMES = SFX_NAMES.slice();
export const MUSIC_CUES = CUE_NAMES.slice();

const MAX_VOICES = 48;          // simultaneous sfx+voice voices (ui & music not counted)
const BURST_WINDOW = 0.04;      // seconds: same-name starts inside this window are limited by def.burst
const MUSIC_LEVEL = 0.75;       // music sits a little under SFX
const ONE_SHOT_LATE = 0.3;      // a one-shot whose buffer isn't ready within this time is dropped
const CORE_TIMEOUT = 4000;      // ms: init() never waits longer than this for the core set
const PRIO = { urgent: -10, music1: 25, music2: 30 };

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** A playing (or pending / paused) sound. This object is the handle returned by play(). */
class Voice {
  constructor(engine, name, def, opts, kind) {
    this.e = engine;
    this.name = name;
    this.def = def;
    this.kind = kind; // 'sfx' | 'music'
    this.cat = opts.category || def.cat || 'sfx';
    this.loop = opts.loop ?? !!def.loop;
    this.volume = opts.volume ?? 1;
    this.pitch = opts.pitch ?? 1;
    const rp = opts.randomPitch || 0;
    this.pitchJitter = rp ? 1 + (Math.random() * 2 - 1) * rp : 1;
    this.occ = clamp01(opts.occlusion || 0);
    this.prio = opts.priority ?? def.prio ?? 0.5;
    this.follow = opts.follow && opts.follow.position ? opts.follow : null;
    this.is3D = !!(opts.pos || this.follow);
    this.pos = new THREE.Vector3();
    if (opts.pos) this.pos.set(opts.pos.x, opts.pos.y, opts.pos.z);
    else if (this.follow) this.pos.set(this.follow.position.x, this.follow.position.y, this.follow.position.z);
    this.ref = opts.refDistance ?? def.ref ?? 2;
    this.max = opts.maxDistance ?? def.max ?? 40;
    this.rolloff = def.rolloff ?? 1;
    this.reverb = opts.reverb ?? (this.is3D && kind === 'sfx' ? engine._envReverb : 0);
    this.fadeIn = opts.fadeIn || 0;
    this.state = 'pending'; // pending | playing | paused | stopping | stopped
    this.buffer = null;
    this.src = null;
    this.created = engine.ctx.currentTime;
    this.deadline = this.loop ? Infinity : this.created + ONE_SHOT_LATE;
    this.offsetAt = 0;
    this.startedAt = 0;
    this._lastF = -1; this._lastA = -1;
  }
  get rate() { return this.pitch * this.pitchJitter; }
  get playing() { return this.state === 'playing' || this.state === 'pending' || this.state === 'paused'; }
  stop(fadeSec = 0) { try { this.e._stopVoice(this, fadeSec); } catch (err) { console.warn('[audio] stop', err); } }
  setPos(v) {
    if (!v || !Number.isFinite(v.x + v.y + v.z)) return;
    this.pos.set(v.x, v.y, v.z);
    const p = this.panner;
    if (p) {
      if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z);
    }
  }
  setVolume(v, fadeSec = 0) {
    this.volume = v;
    if (!this.gain || this.state === 'stopping' || this.state === 'stopped') return;
    const g = this.gain.gain, now = this.e.ctx.currentTime, target = this.volume * (this.def.gain ?? 1);
    hold(g, now);
    if (fadeSec > 0) g.linearRampToValueAtTime(target, now + fadeSec); else g.setTargetAtTime(target, now, 0.012);
  }
  setPitch(p) {
    if (this.src && this.state === 'playing') { this.offsetAt = this.e._voicePos(this); this.startedAt = this.e.ctx.currentTime; }
    this.pitch = p;
    if (this.src) this.src.playbackRate.setTargetAtTime(this.rate, this.e.ctx.currentTime, 0.01);
  }
  setOcclusion(o) { this.occ = clamp01(o); if (this.state === 'playing') this.e._updateSpatial(this, true); }
}

function hold(param, now) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
  else { const v = param.value; param.cancelScheduledValues(now); param.setValueAtTime(v, now); }
}

export class AudioEngine {
  constructor(settings) {
    this.settings = settings || null;
    this.ctx = null;
    this._ready = false;
    this._initPromise = null;
    this._buffers = new Map();      // name -> AudioBuffer[] (variants)
    this._lastVariant = new Map();
    this._musicBuffers = new Map(); // cue -> AudioBuffer
    this._jobs = new Map();         // key -> job
    this._queue = [];
    this._seq = 0;
    this._workers = [];
    this._mainBusy = false;
    this._voices = new Set();
    this._recent = new Map();
    this._warned = new Set();
    this._music = new Map();        // cue -> voice
    this._paused = false;
    this._muffle = 0;
    this._envReverb = 0;
    this._duckUntil = 0;
    this._lp = new THREE.Vector3();
    this._lf = new THREE.Vector3(0, 0, -1);
    this._lu = new THREE.Vector3(0, 1, 0);
    this.hrtf = true;          // HRTF panning when available (else equal-power)
    this.useWorkers = true;    // synthesise in Web Workers (falls back to main-thread chunks)
    this.timings = { initMs: 0, coreMs: 0, allSfxMs: 0, allMusicMs: 0, workers: 0, gen: {} };
    if (this.settings && typeof this.settings.onChange === 'function') {
      this.settings.onChange((k) => { if (k === 'masterVolume' || k === 'sfxVolume' || k === 'musicVolume') this._applyVolumes(); });
    }
  }

  get ready() { return this._ready; }
  get context() { return this.ctx; }
  get activeVoices() { let n = 0; for (const v of this._voices) if (v.playing) n++; return n; }

  // ------------------------------------------------------------------ init
  init() {
    if (!this._initPromise) this._initPromise = this._init().catch((err) => { console.warn('[audio] init failed', err); });
    return this._initPromise;
  }

  async _init() {
    const t0 = performance.now();
    this._t0 = t0;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) { console.warn('[audio] Web Audio unavailable'); return; }
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
    this.ctx = ctx;
    this._buildGraph();
    this._applyVolumes();
    if (this._muffle) this.setMuffled(this._muffle);
    this.resume();
    if (typeof window !== 'undefined') {
      const kick = () => { this.resume(); if (ctx.state === 'running') { window.removeEventListener('pointerdown', kick, true); window.removeEventListener('keydown', kick, true); } };
      window.addEventListener('pointerdown', kick, true);
      window.addEventListener('keydown', kick, true);
    }
    this._startWorkers();
    // queue everything: core sfx first, then the rest, then music (lazily, in the background)
    const core = [];
    for (const name of SOUND_NAMES) {
      const d = SOUND_DEFS[name];
      for (let v = 0; v < d.v; v++) {
        const job = this._request('sfx', name, v, d.genPrio * 10);
        if (d.genPrio === 0) core.push(job.promise);
      }
    }
    for (const cue of MUSIC_CUES) this._request('music', cue, 0, MUSIC_DEFS[cue].loop ? PRIO.music2 : PRIO.music1);
    const allSfx = [...this._jobs.values()].filter((j) => j.kind === 'sfx').map((j) => j.promise);
    const allMusic = [...this._jobs.values()].filter((j) => j.kind === 'music').map((j) => j.promise);
    Promise.all(allSfx).then(() => { this.timings.allSfxMs = performance.now() - t0; });
    Promise.all(allMusic).then(() => { this.timings.allMusicMs = performance.now() - t0; });
    let timer;
    await Promise.race([Promise.all(core), new Promise((r) => { timer = setTimeout(r, CORE_TIMEOUT); })]);
    clearTimeout(timer);
    this.timings.coreMs = performance.now() - t0;
    this._ready = true;
    this.timings.initMs = performance.now() - t0;
  }

  /** Resume a suspended context (call from any user gesture; init() does this too). */
  resume() {
    try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); } catch (e) { /* ignore */ }
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -9;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 10;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.2;
    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this.world = ctx.createGain();
    this.muffleFilter = ctx.createBiquadFilter();
    this.muffleFilter.type = 'lowpass';
    this.muffleFilter.frequency.value = 20000;
    this.muffleFilter.Q.value = 0.6;
    this.muffleGain = ctx.createGain();
    this.world.connect(this.muffleFilter).connect(this.muffleGain).connect(this.master);

    this.buses = {
      sfx: ctx.createGain(),
      voice: ctx.createGain(),
      ui: ctx.createGain(),
      music: ctx.createGain(),
    };
    this.buses.sfx.connect(this.world);
    this.buses.voice.connect(this.world);
    this.buses.ui.connect(this.master);
    this.buses.music.connect(this.master);
    this.musicLoops = ctx.createGain();
    this.musicStingers = ctx.createGain();
    this.musicLoops.connect(this.buses.music);
    this.musicStingers.connect(this.buses.music);

    // shared synthesised reverb (indoor ambience send)
    this.reverbIn = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this._makeIR(2.2);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.6;
    this.reverbIn.connect(this.convolver).connect(this.reverbOut).connect(this.world);
  }

  _makeIR(sec) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.round(sec * sr);
    const buf = ctx.createBuffer(2, n, sr);
    let seed = 1234567;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const a = Math.exp(-t / 0.42) * Math.min(1, t / 0.008);
        const cut = 0.55 * Math.exp(-t / 0.6) + 0.04; // darkens over time
        lp += (rnd() - lp) * cut;
        d[i] = lp * a;
      }
      // a few early reflections
      for (let k = 0; k < 8; k++) { const i = Math.round((0.011 + k * 0.0093 + c * 0.0031) * sr); if (i < n) d[i] += (k % 2 ? -1 : 1) * 0.5 * Math.exp(-k / 4); }
    }
    return buf;
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings, get = (k, dflt) => { const v = s && typeof s.get === 'function' ? s.get(k) : undefined; return typeof v === 'number' ? clamp01(v) : dflt; };
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(get('masterVolume', 0.8), now, 0.02);
    const sv = get('sfxVolume', 0.9);
    this.buses.sfx.gain.setTargetAtTime(sv, now, 0.02);
    this.buses.voice.gain.setTargetAtTime(sv, now, 0.02);
    this.buses.ui.gain.setTargetAtTime(sv, now, 0.02);
    this.buses.music.gain.setTargetAtTime(get('musicVolume', 0.7) * MUSIC_LEVEL, now, 0.02);
  }

  // ------------------------------------------------------------------ synthesis jobs
  _startWorkers() {
    let n = 0;
    if (this.useWorkers && typeof Worker !== 'undefined') {
      const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
      n = Math.max(1, Math.min(4, hc - 1));
    }
    for (let i = 0; i < n; i++) {
      try {
        const w = new SfxWorker();
        const slot = { w, job: null, dead: false };
        w.onmessage = (e) => this._onWorkerMessage(slot, e.data);
        w.onerror = (e) => { console.warn('[audio] synth worker failed, falling back to main thread', e.message || e); this._killWorker(slot); };
        this._workers.push(slot);
      } catch (err) {
        console.warn('[audio] cannot start synth worker', err);
        break;
      }
    }
    this.timings.workers = this._workers.length;
  }

  _killWorker(slot) {
    if (slot.dead) return;
    slot.dead = true;
    try { slot.w.terminate(); } catch (e) { /* ignore */ }
    if (slot.job) { slot.job.state = 'queued'; this._queue.push(slot.job); slot.job = null; }
    this._pump();
  }

  _key(kind, name, variant) { return kind + ':' + name + ':' + variant; }

  _request(kind, name, variant, prio) {
    const key = this._key(kind, name, variant);
    let job = this._jobs.get(key);
    if (job) {
      if (job.state === 'queued' && prio < job.prio) job.prio = prio;
      this._pump();
      return job;
    }
    job = { key, kind, name, variant, prio, seq: this._seq++, state: 'queued' };
    job.promise = new Promise((res) => { job.resolve = res; });
    this._jobs.set(key, job);
    this._queue.push(job);
    this._pump();
    return job;
  }

  _nextJob() {
    let bi = -1;
    for (let i = 0; i < this._queue.length; i++) {
      const j = this._queue[i];
      if (bi < 0 || j.prio < this._queue[bi].prio || (j.prio === this._queue[bi].prio && j.seq < this._queue[bi].seq)) bi = i;
    }
    if (bi < 0) return null;
    return this._queue.splice(bi, 1)[0];
  }

  _pump() {
    const live = this._workers.filter((s) => !s.dead);
    if (live.length) {
      for (const slot of live) {
        if (slot.job) continue;
        const job = this._nextJob();
        if (!job) break;
        job.state = 'running';
        job.t0 = performance.now();
        slot.job = job;
        slot.w.postMessage({ id: job.key, kind: job.kind, name: job.name, variant: job.variant });
      }
      return;
    }
    // main-thread fallback: one job per macrotask
    if (this._mainBusy || !this._queue.length) return;
    this._mainBusy = true;
    setTimeout(() => {
      this._mainBusy = false;
      const job = this._nextJob();
      if (job) this._runSync(job);
      this._pump();
    }, 0);
  }

  _runSync(job) {
    job.state = 'running';
    const t0 = performance.now();
    let r = null;
    try { r = job.kind === 'music' ? renderMusic(job.name) : renderSound(job.name, job.variant); } catch (err) { console.warn('[audio] synth failed', job.key, err); }
    this._finishJob(job, r, performance.now() - t0);
  }

  _onWorkerMessage(slot, data) {
    const job = slot.job;
    slot.job = null;
    if (job && job.key === data.id) {
      if (!data.ok) console.warn('[audio] synth failed', job.key, data.error);
      this._finishJob(job, data.ok ? data : null, data.ms || 0);
    }
    this._pump();
  }

  _finishJob(job, r, ms) {
    if (job.state === 'done') return;
    job.state = 'done';
    let buf = null;
    if (r && this.ctx) {
      try {
        buf = this.ctx.createBuffer(r.channels.length, r.channels[0].length, r.sampleRate);
        r.channels.forEach((c, i) => buf.copyToChannel(c, i));
      } catch (err) { console.warn('[audio] buffer create failed', job.key, err); buf = null; }
    }
    this.timings.gen[job.key] = ms;
    if (buf) {
      if (job.kind === 'music') this._musicBuffers.set(job.name, buf);
      else {
        let arr = this._buffers.get(job.name);
        if (!arr) { arr = new Array(SOUND_DEFS[job.name].v).fill(null); this._buffers.set(job.name, arr); }
        arr[job.variant] = buf;
      }
    }
    job.resolve(buf);
    this._onBufferReady(job.kind, job.name);
  }

  /** synchronously generate a queued (not yet running) variant on the main thread */
  _syncGen(name) {
    const d = SOUND_DEFS[name];
    for (let v = 0; v < d.v; v++) {
      const job = this._jobs.get(this._key('sfx', name, v));
      if (job && job.state === 'queued') {
        const i = this._queue.indexOf(job);
        if (i >= 0) this._queue.splice(i, 1);
        this._runSync(job);
        return true;
      }
    }
    return false;
  }

  /** resolves when every sound and music buffer has been generated */
  ensureAll() {
    if (!this.ctx) return Promise.resolve();
    for (const name of SOUND_NAMES) for (let v = 0; v < SOUND_DEFS[name].v; v++) this._request('sfx', name, v, 50);
    for (const cue of MUSIC_CUES) this._request('music', cue, 0, 60);
    return Promise.all([...this._jobs.values()].map((j) => j.promise));
  }
  /** resolves when the given cue's buffer exists (starts generating it immediately) */
  prepareMusic(cue) {
    if (!this.ctx || !MUSIC_DEFS[cue]) return Promise.resolve(null);
    return this._request('music', cue, 0, PRIO.urgent).promise;
  }
  getBuffers(name) { return (this._buffers.get(name) || []).filter(Boolean); }
  getBuffer(name, variant = 0) { const a = this._buffers.get(name); return (a && a[variant]) || null; }
  getMusicBuffer(cue) { return this._musicBuffers.get(cue) || null; }
  soundInfo(name) { const d = SOUND_DEFS[name]; return d ? { name, variants: d.v, loop: d.loop, category: d.cat, ref: d.ref, max: d.max, priority: d.prio, gain: d.gain, group: d.group } : null; }
  musicInfo(cue) { const d = MUSIC_DEFS[cue]; return d ? { cue, loop: !!d.loop, duration: d.dur, duck: d.duck, gain: d.gain ?? 1 } : null; }
  /** bytes held by generated buffers (float32 PCM) */
  memoryBytes() {
    let n = 0;
    for (const arr of this._buffers.values()) for (const b of arr) if (b) n += b.length * b.numberOfChannels * 4;
    for (const b of this._musicBuffers.values()) n += b.length * b.numberOfChannels * 4;
    return n;
  }

  _onBufferReady(kind, name) {
    const now = this.ctx.currentTime;
    for (const v of this._voices) {
      if (v.state !== 'pending' || v.kind !== kind || v.name !== name) continue;
      if (now > v.deadline) { this._finalize(v); continue; }
      const buf = kind === 'music' ? this._musicBuffers.get(name) : this._pickBuffer(name);
      if (buf) this._startVoice(v, buf);
    }
  }

  _pickBuffer(name) {
    const arr = this._buffers.get(name);
    if (!arr) return null;
    const ready = [];
    for (let i = 0; i < arr.length; i++) if (arr[i]) ready.push(i);
    if (!ready.length) return null;
    const last = this._lastVariant.get(name);
    let idx = ready[Math.floor(Math.random() * ready.length)];
    if (ready.length > 1 && idx === last) idx = ready[(ready.indexOf(idx) + 1 + Math.floor(Math.random() * (ready.length - 1))) % ready.length];
    this._lastVariant.set(name, idx);
    return arr[idx];
  }

  // ------------------------------------------------------------------ listener / update
  setListener(pos, forward, up) {
    if (pos) this._lp.set(pos.x, pos.y, pos.z);
    if (forward) this._lf.set(forward.x, forward.y, forward.z);
    if (up) this._lu.set(up.x, up.y, up.z);
    if (!this.ctx) return;
    const L = this.ctx.listener, p = this._lp, f = this._lf, u = this._lu;
    try {
      if (L.positionX) {
        L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
        L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
        L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z;
      } else {
        L.setPosition(p.x, p.y, p.z);
        L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
      }
    } catch (e) { /* ignore non-finite input */ }
  }

  update(dt = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const v of this._voices) {
      if (v.state === 'stopped') { this._voices.delete(v); continue; }
      if (v.follow && v.state !== 'stopping') v.setPos(v.follow.position);
      if (v.state === 'playing' && v.is3D) this._updateSpatial(v, false);
      else if (v.state === 'pending' && now > v.deadline && !this._paused) this._finalize(v);
    }
  }

  _dist(v) { return v.is3D ? v.pos.distanceTo(this._lp) : 0; }
  _distGain(v, d) {
    if (!v.is3D) return 1;
    const dd = Math.min(Math.max(d, v.ref), v.max);
    const g = v.ref / (v.ref + v.rolloff * (dd - v.ref));
    return g * this._edge(v, d);
  }
  _edge(v, d) { const x = clamp01((v.max - d) / (0.22 * v.max)); return x * x * (3 - 2 * x); }

  _updateSpatial(v, force, immediate = false) {
    if (!v.filter) return;
    const d = this._dist(v);
    const occF = 22000 * Math.pow(700 / 22000, v.occ);
    const airF = v.is3D ? Math.max(1400, 20000 * Math.exp(-d / (v.max * 0.5))) : 22000;
    const f = Math.min(occF, airF, this.ctx.sampleRate * 0.45);
    const a = Math.pow(10, (-6 * v.occ) / 20) * (v.is3D ? this._edge(v, d) : 1);
    const now = this.ctx.currentTime;
    if (immediate) { v.filter.frequency.value = f; v.att.gain.value = a; v._lastF = f; v._lastA = a; return; }
    if (force || Math.abs(f - v._lastF) > v._lastF * 0.03) { v.filter.frequency.setTargetAtTime(f, now, 0.04); v._lastF = f; }
    if (force || Math.abs(a - v._lastA) > 0.01) { v.att.gain.setTargetAtTime(a, now, 0.04); v._lastA = a; }
  }

  // ------------------------------------------------------------------ playback
  play(name, opts = {}) {
    try { return this._play(name, opts || {}); } catch (err) { console.warn('[audio] play failed', name, err); return null; }
  }

  _warnOnce(key, msg) { if (!this._warned.has(key)) { this._warned.add(key); console.warn(msg); } }

  _play(name, opts) {
    const def = SOUND_DEFS[name];
    if (!def) { this._warnOnce('u:' + name, `[audio] unknown sound "${name}"`); return null; }
    if (!this.ctx) return null;
    const cat = opts.category || def.cat;
    if (this._paused && cat !== 'ui') return null;
    const now = this.ctx.currentTime;
    // same-name burst limiting (e.g. 30 zombies dying in one frame)
    let rec = this._recent.get(name);
    if (!rec) { rec = []; this._recent.set(name, rec); }
    while (rec.length && rec[0] < now - BURST_WINDOW) rec.shift();
    if (rec.length >= def.burst) return null;

    if (opts.pos && !Number.isFinite(opts.pos.x + opts.pos.y + opts.pos.z)) return null;
    const v = new Voice(this, name, def, opts, 'sfx');
    if (v.is3D && !Number.isFinite(v.pos.x + v.pos.y + v.pos.z)) return null;
    if (v.is3D && !v.loop && this._dist(v) > v.max) return null; // out of earshot
    v.score = this._score(v);

    // per-name instance cap
    let same = 0, worstSame = null;
    for (const o of this._voices) {
      if (o.name !== name || o.kind !== 'sfx' || !o.playing) continue;
      same++;
      o.score = this._score(o);
      if (!worstSame || o.score < worstSame.score) worstSame = o;
    }
    if (same >= def.maxInst) {
      if (worstSame && worstSame.score <= v.score) this._steal(worstSame); else return null;
    }
    // global cap
    if (cat === 'sfx' || cat === 'voice') {
      let count = 0, worst = null;
      for (const o of this._voices) {
        if (o.kind !== 'sfx' || !o.playing || (o.cat !== 'sfx' && o.cat !== 'voice')) continue;
        count++;
        o.score = this._score(o);
        if (!worst || o.score < worst.score) worst = o;
      }
      if (count >= MAX_VOICES) {
        if (worst && worst.score < v.score) this._steal(worst); else return null;
      }
    }
    rec.push(now);

    let buf = this._pickBuffer(name);
    if (!buf && !def.loop && this._syncGen(name)) buf = this._pickBuffer(name);
    this._voices.add(v);
    if (buf) this._startVoice(v, buf);
    else {
      // not generated yet: start as soon as it is (loops always, one-shots only if still timely)
      for (let i = 0; i < def.v; i++) this._request('sfx', name, i, PRIO.urgent);
    }
    return v;
  }

  _score(v) {
    let a = v.volume * (v.def.gain ?? 1) * Math.pow(10, (-6 * v.occ) / 20);
    if (v.is3D) a *= this._distGain(v, this._dist(v));
    if (!v.loop && v.state === 'playing' && v.buffer) a *= 1 - 0.7 * clamp01(this._voicePos(v) / v.buffer.duration);
    return v.prio * 0.6 + Math.min(1, a) * 0.4;
  }

  _steal(v) { this._stopVoice(v, 0.03); }

  _busFor(v) {
    if (v.kind === 'music') return v.isStinger ? this.musicStingers : this.musicLoops;
    return this.buses[v.cat] || this.buses.sfx;
  }

  _startVoice(v, buf) {
    const ctx = this.ctx;
    v.buffer = buf;
    if (!v.gain) {
      v.gain = ctx.createGain();
      let head = v.gain;
      if (v.kind === 'sfx') {
        v.filter = ctx.createBiquadFilter();
        v.filter.type = 'lowpass';
        v.filter.Q.value = 0.5;
        v.att = ctx.createGain();
        v.filter.connect(v.att).connect(v.gain);
        head = v.filter;
      }
      v.input = head;
      let out = v.gain;
      if (v.is3D) {
        let p;
        const po = { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: v.ref, maxDistance: v.max, rolloffFactor: v.rolloff, positionX: v.pos.x, positionY: v.pos.y, positionZ: v.pos.z };
        try { p = new PannerNode(ctx, po); } catch (e) {
          p = ctx.createPanner();
          p.distanceModel = 'inverse'; p.refDistance = v.ref; p.maxDistance = v.max; p.rolloffFactor = v.rolloff;
          try { p.panningModel = 'HRTF'; } catch (e2) { /* ignore */ }
          if (p.positionX) { p.positionX.value = v.pos.x; p.positionY.value = v.pos.y; p.positionZ.value = v.pos.z; } else p.setPosition(v.pos.x, v.pos.y, v.pos.z);
        }
        if (!this.hrtf || p.panningModel !== 'HRTF') { try { p.panningModel = 'equalpower'; } catch (e) { /* ignore */ } }
        v.panner = p;
        v.gain.connect(p);
        out = p;
      }
      out.connect(this._busFor(v));
      if (v.reverb > 0 && v.kind === 'sfx') {
        v.send = ctx.createGain();
        v.send.gain.value = v.reverb;
        out.connect(v.send).connect(this.reverbIn);
      }
      const target = v.volume * (v.def.gain ?? 1);
      if (v.fadeIn > 0) { v.gain.gain.setValueAtTime(0, ctx.currentTime); v.gain.gain.linearRampToValueAtTime(target, ctx.currentTime + v.fadeIn); }
      else v.gain.gain.value = target;
      if (v.filter) this._updateSpatial(v, true, true);
    }
    if (this._paused && v.cat !== 'ui') { v.state = 'paused'; v.offsetAt = 0; return; }
    v.state = 'playing';
    this._startSource(v, 0);
  }

  _startSource(v, offset) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = v.buffer;
    src.loop = v.loop;
    src.playbackRate.value = v.rate;
    src.connect(v.input);
    const dur = v.buffer.duration;
    let off = offset;
    if (v.loop) off = ((off % dur) + dur) % dur;
    else if (off >= dur) { this._finalize(v); return; }
    src.onended = () => { if (v.src === src) this._finalize(v); };
    src.start(ctx.currentTime, off);
    v.src = src;
    v.startedAt = ctx.currentTime;
    v.offsetAt = off;
  }

  _voicePos(v) {
    if (v.state === 'paused') return v.offsetAt;
    if (!v.src) return 0;
    return v.offsetAt + (this.ctx.currentTime - v.startedAt) * v.rate;
  }

  _stopVoice(v, fade) {
    if (v.state === 'stopped') return;
    if (v.state === 'pending' || v.state === 'paused' || !v.src) { this._finalize(v); return; }
    const now = this.ctx.currentTime;
    const f = Math.max(0.008, fade || 0);
    if (v.state === 'stopping' && v.stopAt <= now + f) return;
    const g = v.gain.gain;
    hold(g, now);
    g.linearRampToValueAtTime(0, now + f);
    v.stopAt = now + f;
    try { v.src.stop(now + f + 0.02); } catch (e) { this._finalize(v); return; }
    v.state = 'stopping';
    if (v.kind === 'music') { const m = this._music.get(v.name); if (m === v) this._music.delete(v.name); }
  }

  _finalize(v) {
    if (v.state === 'stopped') return;
    v.state = 'stopped';
    const src = v.src;
    v.src = null;
    if (src) { try { src.onended = null; src.stop(); } catch (e) { /* already stopped */ } try { src.disconnect(); } catch (e) { /* ignore */ } }
    for (const n of [v.filter, v.att, v.gain, v.panner, v.send]) if (n) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    this._voices.delete(v);
    if (v.kind === 'music') { const m = this._music.get(v.name); if (m === v) this._music.delete(v.name); }
  }

  stopAll(fade = 0.1) {
    for (const v of [...this._voices]) if (v.cat !== 'music' && v.kind !== 'music') v.stop(fade);
  }

  /** default reverb send for new 3D sounds (indoor spaces), 0..1 */
  setReverb(amount) { this._envReverb = clamp01(amount); }

  // ------------------------------------------------------------------ music
  playMusic(cue, opts = {}) {
    try { return this._playMusic(cue, opts || {}); } catch (err) { console.warn('[audio] playMusic failed', cue, err); return null; }
  }

  _playMusic(cue, opts) {
    const def = MUSIC_DEFS[cue];
    if (!def) { this._warnOnce('m:' + cue, `[audio] unknown music cue "${cue}"`); return null; }
    if (!this.ctx) return null;
    const vol = opts.volume ?? 1;
    const fade = opts.fade ?? (def.loop ? 1 : 0);
    if (opts.exclusive) { // crossfade: fade out every other looping cue
      for (const [c, o] of [...this._music]) if (c !== cue && !o.isStinger) this.stopMusic(c, Math.max(0.05, fade));
    }
    const cur = this._music.get(cue);
    if (cur && cur.playing) {
      if (def.loop) { cur.setVolume(vol, Math.max(0.05, fade)); return cur; }
      cur.stop(0.08);
    }
    const v = new Voice(this, cue, { gain: def.gain ?? 1, prio: 1, cat: 'music', loop: !!def.loop }, { volume: vol, category: 'music', fadeIn: fade }, 'music');
    v.isStinger = !def.loop;
    v.deadline = def.loop ? Infinity : this.ctx.currentTime + 2.5;
    this._music.set(cue, v);
    this._voices.add(v);
    const buf = this._musicBuffers.get(cue);
    if (buf) this._startVoice(v, buf);
    else this._request('music', cue, 0, PRIO.urgent);
    if (def.duck != null && def.duck < 1) this._duck(def.duck, def.dur || 3);
    return v;
  }

  _duck(level, dur) {
    const now = this.ctx.currentTime, g = this.musicLoops.gain;
    const until = Math.max(this._duckUntil, now + Math.max(0.3, dur - 0.6));
    this._duckUntil = until;
    hold(g, now);
    g.setTargetAtTime(level, now, 0.06);
    g.setTargetAtTime(1, until, 0.35);
  }

  stopMusic(cue, fade = 1) {
    const v = this._music.get(cue);
    if (v) v.stop(fade);
    this._music.delete(cue);
  }

  setMusicLayer(cue, volume, fade = 0.5) {
    const v = this._music.get(cue);
    if (!v || !v.playing) return null;
    v.setVolume(volume, fade);
    return v;
  }

  stopAllMusic(fade = 1) {
    for (const cue of [...this._music.keys()]) this.stopMusic(cue, fade);
  }

  /** free a cue's PCM (it is re-synthesised on the next playMusic/prepareMusic) */
  releaseMusic(cue) {
    if (this.isMusicPlaying(cue)) return false;
    this._musicBuffers.delete(cue);
    this._jobs.delete(this._key('music', cue, 0));
    return true;
  }

  isMusicPlaying(cue) { const v = this._music.get(cue); return !!(v && v.playing); }

  // ------------------------------------------------------------------ global state
  setMuffled(amount) {
    this._muffle = clamp01(amount || 0);
    if (!this.ctx) return;
    const now = this.ctx.currentTime, a = this._muffle;
    this.muffleFilter.frequency.setTargetAtTime(20000 * Math.pow(450 / 20000, a), now, 0.08);
    this.muffleGain.gain.setTargetAtTime(1 - 0.3 * a, now, 0.08);
  }

  pauseAll(paused) {
    paused = !!paused;
    if (!this.ctx || paused === this._paused) { this._paused = paused; return; }
    this._paused = paused;
    const now = this.ctx.currentTime;
    for (const v of [...this._voices]) {
      if (v.cat === 'ui') continue;
      if (paused) {
        if (v.state === 'stopping') this._finalize(v);
        else if (v.state === 'playing') {
          v.offsetAt = this._voicePos(v);
          hold(v.gain.gain, now);
          const s = v.src;
          v.src = null;
          v.state = 'paused';
          if (s) { try { s.onended = null; s.stop(); s.disconnect(); } catch (e) { /* ignore */ } }
        }
      } else if (v.state === 'paused') {
        v.state = 'playing';
        this._startSource(v, v.offsetAt);
      } else if (v.state === 'pending' && v.deadline !== Infinity) {
        v.deadline = now + ONE_SHOT_LATE;
      }
    }
    // the duck envelope keeps running in context time; just restore it on resume
    if (!paused) { hold(this.musicLoops.gain, now); this.musicLoops.gain.setTargetAtTime(1, now, 0.2); this._duckUntil = 0; }
  }

  get paused() { return this._paused; }
}

export default AudioEngine;
