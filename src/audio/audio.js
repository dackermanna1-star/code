// Audio engine: plays the procedural sound bank (sounds.js) through WebAudio.
//
//   one-shots, emitter loops, light hum:
//       source -> lowpass (air, occlusion) -> gain -> stereo pan -> dry bus
//                                        \-> send -> reverb bus
//   footsteps: source -> [lowpass when crouched] -> gain -> pan -> dry bus (+ a small send)
//   beds (fluorescent hum, air handling, room tone) -> bed bus · UI blips -> ui bus
//   reverb bus -> convolver (a second one crossfades in when the space changes) -> reverb return
//   dry + beds + ui + reverb return -> master (volume) -> limiter -> destination
//
// The bank (about a second of synthesis) is generated in a worker (bankworker.js) and arrives
// buffer by buffer, most needed first. Without a worker it is built on the main thread in short
// idle-time slices, using the jobs' generator form. Anything asked for before its buffer exists
// is skipped; beds fade in when they arrive. No processing is added beyond the reverb, filters
// and pitch-by-playback-rate, so the bank keeps its lo-fi PlayStation character.
// Every public method is safe at any time (before the bank is ready, while suspended, with
// unknown names) and never throws.
import { FOOT_NAMES, FOOT_VARIANTS, SHOT_VARIANTS, TONES, bankQueue } from './sounds.js';
import { REVERB, makeIRG } from './reverb.js';

const WORKER_PATH = 'src/audio/bankworker.js';   // repo-relative: what the single-file build expects
const CTX_RATE = 22050;     // the bank's own rate: SPU-era bandwidth and half the convolution cost
const MAX_VOICES = 24;      // one-shots and footsteps playing at once (quietest/oldest stolen)
const MAX_STEPS = 6;
const MAX_UI = 4;
const MAX_LOOPS = 10;       // positional loops at once: the loudest emitters win
const OCC_HZ = 700;         // lowpass for a source behind a wall
const OCC_GAIN = 0.4;       // ... and about -8 dB (distant events skip this: their lowpass is it)
const PAN_WIDTH = 0.8;      // never pan hard: keeps a little of every sound in both ears
const PENDING = 1, FAILED = 2;

// Mix levels (linear, before the master volume). Footsteps lead; beds sit well below them.
export const MIX = {
  foot: 0.6, footRun: 1.3, footCrouch: 0.42, footVerb: 0.2,
  land: 0.75,
  ui: 0.36,
  shot: 0.62,       // positional one-shot at 2 m or closer
  distant: 0.9,     // extra factor for far-away ambient events (their lowpass already takes energy)
  loop: 0.55,       // emitter loop at 1.5 m or closer, times the emitter's vol
  lightHum: 0.06,   // each of the two hum voices that follow the nearest lights
  hum: 0.11,        // fluorescent hum bed at env.hum = 1 under a well-lit ceiling
  hvac: 0.14,       // air handling bed at env.hvac = 1
  tone: 0.075,      // room tone
};
const SHOT_TRIM = {
  climb: 0.6, paper: 0.65, typewriter: 0.75, phone_pickup: 0.8, locked_rattle: 0.85, cooler_glug: 0.75,
  vending_clunk: 0.85, drip: 0.45, flick_on: 0.4, flick_off: 0.4, fall_wind: 0.6, phone_ring: 1.1,
};
const TONE_TRIM = { yellow: 1, office: 0.9, industrial: 1.1, dark: 0.85, water: 1, outdoor: 1.2, school: 0.9, hotel: 0.9, void: 0.8 };

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
const dbRand = (db) => Math.pow(10, rnd(-db, db) / 20);
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const volCurve = (v) => Math.pow(clamp(v, 0, 1), 1.5);
// one-shots: inverse distance (WebAudio's 'inverse' model, ref 2 m, rolloff 0.5): a door 30 m
// away arrives 18 dB down, then lowpassed; loops: inverse distance from 1.5 m, faded to nothing
// at the emitter's radius
const shotGain = (d) => (d <= 2 ? 1 : 2 / (2 + 0.5 * (d - 2)));
const loopGain = (d, rad) => Math.min(1, 1.5 / Math.max(0.01, d)) * (1 - smooth(rad * 0.55, rad, d));
const lightGain = (d) => Math.min(1, 1.3 / Math.max(0.01, d)) * (1 - smooth(4, 8, d));
const airHz = (d) => 16000 / (1 + d / 6);   // highs fall away with distance

function surfIndex(s) {
  if (typeof s === 'number' && Number.isInteger(s) && s >= 0 && s < FOOT_NAMES.length) return s;
  if (typeof s === 'string') {
    const i = FOOT_NAMES.indexOf(s);
    if (i >= 0) return i;
    if (/^\d+$/.test(s) && +s < FOOT_NAMES.length) return +s;
  }
  return 1;   // unknown surface: concrete, the building's default
}

function makeContext() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try { return new AC({ latencyHint: 'interactive', sampleRate: CTX_RATE }); } catch (e) { /* rate not supported */ }
  try { return new AC({ latencyHint: 'interactive' }); } catch (e) { /* constructor without options */ }
  return new AC();
}

// Glide an AudioParam toward value, skipping changes under `rel` (1%) so per-frame updates don't
// pile up automation events. v[key] remembers the last target.
function aim(v, key, param, value, t, tau, rel = 0.01) {
  const prev = v[key];
  if (prev !== undefined && Math.abs(prev - value) <= Math.max(1e-4, Math.abs(prev) * rel)) return;
  v[key] = value;
  param.setTargetAtTime(value, t, tau);
}

export class AudioEngine {
  // opts.context: use this (e.g. Offline) AudioContext; opts.noWorker: build the bank on the main thread
  constructor(opts = {}) {
    this.opts = opts || {};
    this.ctx = null;
    this.offline = false;
    // bank loading
    this.buffers = new Map();
    this.total = 0; this.loaded = 0; this.failed = 0;
    this.ready = false; this.loadMs = 0; this.mode = 'off';
    this.t0 = 0;
    this.worker = null; this.workerUp = false; this.outbox = []; this.helloTimer = 0;
    this.wanted = new Set();
    this.queue = null; this.cur = null; this.slicePending = false;
    this.irs = new Map(); this.irJobs = [];
    // voices
    this.voices = []; this.dying = new Set();
    this.loops = new Map(); this.lightVoices = [null, null];
    this.beds = { hum: null, hvac: null }; this.tones = new Map();
    this.verb = { cur: null, want: null, wantT: 0, until: 0, slots: [] };
    // state
    this.lis = { x: 0, y: 0, z: 0, yaw: 0, ok: false };
    this.time = 0; this.moveSpeed = 0; this.vol = 0.8;
    this.hvacOn = true; this.lightLevel = 0; this.humEnv = 0;
    this.shift = { rate: 1, until: 0, start: 0 };
    this.last = new Map(); this.side = 1; this.tickT = new Float64Array(16); this.dripT = 2;
    this.occluded = null; this.occBudget = 0; this.stamp = 0; this.errors = 0;
    this.G = { d: 0, pan: 0, behind: 0 };          // scratch: geom()
    this.P = { fc: 0, dry: 0, wet: 0, pan: 0, d: 0 };   // scratch: calc()
    this.cands = [];                                  // scratch: updateEmitters()
  }

  get status() {
    const c = this.ctx;
    let irs = 0;
    for (const b of this.irs.values()) if (typeof b === 'object') irs++;
    return {
      mode: this.mode, ready: this.ready, loaded: this.loaded, total: this.total, failed: this.failed,
      loadMs: Math.round(this.loadMs), state: c ? c.state : 'none', rate: c ? c.sampleRate : 0,
      voices: this.voices.length, loops: this.loops.size, reverb: this.verb.cur, irs,
    };
  }

  warn(e) { if (this.errors++ < 8) console.warn('audio:', e); }

  // ------------------------------------------------------------------ setup
  async init() {
    try {
      if (this.ctx) return true;
      const ctx = this.opts.context || makeContext();
      if (!ctx) return false;
      this.ctx = ctx;
      this.offline = typeof OfflineAudioContext === 'function' && ctx instanceof OfflineAudioContext;
      this.fcMax = ctx.sampleRate * 0.45;
      const c = ctx;
      const lim = this.limiter = c.createDynamicsCompressor();
      lim.threshold.value = -6; lim.knee.value = 4; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.2;
      lim.connect(c.destination);
      this.master = this.gain(volCurve(this.vol), lim);
      this.dry = this.gain(1, this.master);
      this.bedBus = this.gain(1, this.master);
      this.uiBus = this.gain(1, this.master);
      this.verbOut = this.gain(1, this.master);
      this.verbIn = this.gain(1, null);
      this.t0 = nowMs();
      this.total = bankQueue().length;
      // start the worker in a task of its own (the single-file build's worker factory encodes the
      // whole bundle into a Blob: ~10-15 ms that shouldn't stack on the context's creation)
      setTimeout(() => this.loadBank(), 0);
      this.resume();
      return true;
    } catch (e) {
      this.warn(e);
      return false;
    }
  }

  gain(v, to) { const g = this.ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }

  resume() {
    try {
      const c = this.ctx;
      if (c && !this.offline && c.state !== 'running' && c.state !== 'closed') { const p = c.resume(); if (p && p.catch) p.catch(() => {}); }
    } catch (e) { this.warn(e); }
  }

  suspend() {
    try {
      const c = this.ctx;
      if (c && !this.offline && c.state === 'running') { const p = c.suspend(); if (p && p.catch) p.catch(() => {}); }
    } catch (e) { this.warn(e); }
  }

  setVolume(v) {
    try {
      this.vol = clamp(num(v, this.vol), 0, 1);
      if (this.master) this.master.gain.setTargetAtTime(volCurve(this.vol), this.ctx.currentTime, 0.05);
    } catch (e) { this.warn(e); }
  }

  setHvac(on) { this.hvacOn = !!on; }

  humShift(semitones, seconds) {
    try {
      const st = clamp(num(semitones, 0), -12, 12);
      this.shift.rate = Math.pow(2, st / 12);
      this.shift.start = this.time;
      this.shift.until = this.time + clamp(num(seconds, 3), 0.2, 30);
    } catch (e) { this.warn(e); }
  }

  // ------------------------------------------------------------------ bank loading
  loadBank() {
    if (this.mode !== 'off') return;
    const off = this.opts.noWorker || (typeof location !== 'undefined' && /[?&](noworker|noaudioworker)\b/.test(location.search || ''));
    if (!off) {
      try {
        const w = globalThis.__makeWorker ? globalThis.__makeWorker(WORKER_PATH)
          : new Worker(new URL('./bankworker.js', import.meta.url), { type: 'module' });
        this.worker = w;
        this.mode = 'worker';
        w.onmessage = (e) => this.fromWorker(e.data);
        w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); this.dropWorker((e && e.message) || 'error'); };
        w.onmessageerror = () => this.dropWorker('message error');
        this.helloTimer = setTimeout(() => { if (!this.workerUp) this.dropWorker('no answer'); }, 8000);
        return;
      } catch (e) {
        console.warn('audio: no bank worker,', (e && e.message) || e);
      }
    }
    this.mainThreadBank();
  }

  fromWorker(m) {
    try {
      if (!m || this.mode !== 'worker') return;
      switch (m.type) {
        case 'hello':
          this.workerUp = true;
          clearTimeout(this.helloTimer);
          for (const o of this.outbox) this.worker.postMessage(o);
          this.outbox.length = 0;
          break;
        case 'buf': this.addBuffer(m.name, m.sr, m.data); break;
        case 'ir': this.addIR(m.kind, m.rate, m.l, m.r); break;
        case 'jobError':
          if (typeof m.name === 'string' && m.name.startsWith('ir:')) this.irs.set(m.name.slice(3), FAILED);
          else this.failed++;
          this.warn(new Error('bank job ' + m.name + ' failed: ' + m.message));
          break;
        case 'done': this.bankDone(); break;
        case 'error': this.dropWorker(m.message); break;   // the single-file build reports module errors so
        default: break;
      }
    } catch (e) { this.warn(e); }
  }

  dropWorker(reason) {
    if (this.mode !== 'worker') return;
    console.warn('audio: bank worker failed (' + reason + '), building the sounds on the main thread');
    clearTimeout(this.helloTimer);
    try { this.worker.terminate(); } catch (e) { /* already gone */ }
    this.worker = null; this.workerUp = false; this.outbox.length = 0;
    for (const [k, v] of this.irs) if (v === PENDING) this.irs.delete(k);   // asked for again by update()
    this.mainThreadBank();
  }

  post(msg) {
    if (!this.worker) return;
    if (this.workerUp) this.worker.postMessage(msg); else this.outbox.push(msg);
  }

  // Fallback: run the jobs' generators on the main thread in short slices during idle time.
  mainThreadBank() {
    this.mode = 'main';
    this.queue = bankQueue().filter((j) => !this.buffers.has(j.name));
    this.slice();
  }

  slice() {
    if (this.slicePending) return;
    this.slicePending = true;
    const run = (dl) => { this.slicePending = false; this.runSlice(dl); };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 60 }); else setTimeout(run, 0);
  }

  runSlice(dl) {
    const t0 = nowMs();
    const budget = dl && typeof dl.timeRemaining === 'function' ? clamp(dl.timeRemaining() - 1, 4, 12) : 6;
    try {
      while (nowMs() - t0 < budget) {
        if (!this.cur) this.cur = this.nextJob();
        if (!this.cur) break;
        const r = this.cur.it.next();
        if (r.done) {
          const j = this.cur;
          this.cur = null;
          if (j.ir) this.addIR(j.kind, j.rate, r.value[0], r.value[1]);
          else this.addBuffer(j.job.name, j.job.sr, r.value);
        }
      }
    } catch (e) {
      const j = this.cur;
      this.cur = null;
      if (j && j.ir) this.irs.set(j.kind, FAILED); else this.failed++;
      this.warn(e);
    }
    if (this.cur || this.irJobs.length || (this.queue && this.queue.length)) this.slice();
    else this.bankDone();
  }

  nextJob() {
    if (this.irJobs.length) return this.irJobs.shift();
    while (this.queue && this.queue.length) {
      const job = this.queue.shift();
      if (!this.buffers.has(job.name)) return { job, it: job.makeG() };
    }
    return null;
  }

  bankDone() {
    if (this.ready) return;
    this.ready = true;
    this.loadMs = nowMs() - this.t0;
  }

  addBuffer(name, sr, data) {
    if (typeof name !== 'string' || this.buffers.has(name)) return;
    try {
      if (!data || !data.length) throw new Error('empty buffer ' + name);
      const b = this.ctx.createBuffer(1, data.length, sr);
      if (typeof b.copyToChannel === 'function') b.copyToChannel(data, 0); else b.getChannelData(0).set(data);
      this.buffers.set(name, b);
      this.loaded++;
    } catch (e) { this.failed++; this.warn(e); }
  }

  // move buffers that are needed now to the front of the queue
  want(names) {
    if (this.ready || this.mode === 'off') return;
    const list = names.filter((n) => !this.buffers.has(n) && !this.wanted.has(n));
    if (!list.length) return;
    for (const n of list) this.wanted.add(n);
    if (this.mode === 'worker') this.post({ type: 'want', names: list });
    else if (this.queue) {
      const s = new Set(list);
      this.queue = this.queue.filter((j) => s.has(j.name)).concat(this.queue.filter((j) => !s.has(j.name)));
    }
  }

  // reverb impulse response for a space, built on first request (worker or slices); null until ready
  ir(kind) {
    const v = this.irs.get(kind);
    if (v === PENDING || v === FAILED) return null;
    if (v) return v;
    if (this.mode === 'off') return null;
    this.irs.set(kind, PENDING);
    const rate = this.ctx.sampleRate;
    if (this.mode === 'worker') this.post({ type: 'ir', kind, rate });
    else { this.irJobs.push({ ir: true, kind, rate, it: makeIRG(kind, rate) }); this.slice(); }
    return null;
  }

  addIR(kind, rate, l, r) {
    try {
      if (rate !== this.ctx.sampleRate || !l || !r || !l.length) { this.irs.delete(kind); return; }
      const b = this.ctx.createBuffer(2, l.length, rate);
      if (typeof b.copyToChannel === 'function') { b.copyToChannel(l, 0); b.copyToChannel(r, 1); }
      else { b.getChannelData(0).set(l); b.getChannelData(1).set(r); }
      this.irs.set(kind, b);
    } catch (e) { this.irs.set(kind, FAILED); this.warn(e); }
  }

  // ------------------------------------------------------------------ voices
  live() { return !!this.ctx && (this.offline || this.ctx.state === 'running'); }

  // source -> [lowpass] -> gain -> [pan] -> bus, and [lowpass] -> send -> reverb
  voice(buf, o) {
    const c = this.ctx, t = c.currentTime, rate = o.rate || 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = !!o.loop;
    src.playbackRate.value = rate;
    const v = { src, nodes: [src], kind: o.kind, level: o.gain, t0: t, end: Infinity, lp: null, g: null, pan: null, send: null, rate, occ: 0, occT: 0, nextOcc: 0 };
    let head = src;
    if (o.lowpass) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = -3;   // dB: flat (Butterworth), no resonant peak
      lp.frequency.value = Math.min(o.lowpass, this.fcMax);
      head.connect(lp);
      head = lp; v.lp = lp; v.nodes.push(lp);
    }
    const g = c.createGain();
    g.gain.value = o.gain;
    head.connect(g);
    v.g = g; v.nodes.push(g);
    let out = g;
    if (o.pan !== undefined && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1);
      g.connect(p);
      out = p; v.pan = p; v.nodes.push(p);
    }
    out.connect(o.bus || this.dry);
    if (o.send !== undefined) {
      const s = c.createGain();
      s.gain.value = o.send;
      head.connect(s);
      s.connect(this.verbIn);
      v.send = s; v.nodes.push(s);
    }
    src.onended = () => this.release(v);
    const off = o.offset ? o.offset % buf.duration : 0;
    src.start(t, off);
    if (!o.loop) v.end = t + (buf.duration - off) / rate;
    return v;
  }

  release(v) {
    if (v.dead) return;
    v.dead = true;
    v.src.onended = null;
    for (const n of v.nodes) { try { n.disconnect(); } catch (e) { /* not connected */ } }
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    this.dying.delete(v);
  }

  // stop a voice smoothly; it is released (disconnected) when its source ends
  fadeOut(v, tau) {
    if (v.stopping || v.dead) return;
    v.stopping = true;
    const t = this.ctx.currentTime;
    for (const node of [v.g, v.send]) {
      if (!node) continue;
      node.gain.cancelScheduledValues(t);
      node.gain.setTargetAtTime(0, t, tau);
    }
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    this.dying.add(v);
    v.end = Math.min(v.end, t + tau * 7);
    try { v.src.stop(t + tau * 7); } catch (e) { this.release(v); }
  }

  // keep fewer than `max` voices (of one kind, or of all kinds), stealing the quietest/oldest
  limit(kind, max) {
    const t = this.ctx.currentTime;
    for (;;) {
      let n = 0, worst = null, ws = Infinity;
      for (const v of this.voices) {
        if (kind && v.kind !== kind) continue;
        n++;
        const left = v.end === Infinity ? 1 : clamp((v.end - t) / Math.max(0.05, v.end - v.t0), 0, 1);
        const s = v.level * (0.2 + left);
        if (s < ws) { ws = s; worst = v; }
      }
      if (n < max || !worst) return;
      this.fadeOut(worst, 0.01);
      const i = this.voices.indexOf(worst);
      if (i >= 0) this.voices.splice(i, 1);   // (fadeOut already did; never loop forever)
    }
  }

  // geometry of a point relative to the listener -> this.G { d, pan, behind }
  geom(x, y, z) {
    const L = this.lis, G = this.G;
    const dx = x - L.x, dy = y - L.y, dz = z - L.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const s = Math.sin(L.yaw), c = Math.cos(L.yaw);
    const right = dx * c + dz * s, fwd = dx * s - dz * c;   // yaw 0 faces -z, +x is to the right
    const inv = 1 / Math.max(d, 0.5);
    G.d = d;
    G.pan = clamp(right * inv, -1, 1) * PAN_WIDTH;
    G.behind = clamp(-fwd * inv, 0, 1);
    return G;
  }

  // filter / dry / wet / pan for a positional voice -> this.P
  calc(v) {
    const G = this.geom(v.x, v.y, v.z), P = this.P;
    let fc = airHz(G.d) * (1 - 0.35 * G.behind), dg, wet;
    if (v.kind === 'loop') {
      dg = loopGain(G.d, v.rad);
      wet = 0.22 * Math.sqrt(dg);
    } else {
      dg = shotGain(G.d);
      wet = Math.sqrt(dg) * (v.distant ? 0.6 : 0.3 + 0.25 * smooth(3, 20, G.d));   // reverb falls off slower
      if (v.distant) fc = Math.min(fc, 900 + 900 * (1 - smooth(18, 40, G.d)));
    }
    const occ = v.occ;
    fc += (Math.min(fc, OCC_HZ) - fc) * occ;
    P.fc = Math.min(fc, this.fcMax);
    P.dry = v.base * dg * (1 - (1 - OCC_GAIN) * occ);
    P.wet = v.base * wet * (1 - 0.35 * occ);
    P.pan = G.pan;
    P.d = G.d;
    return P;
  }

  place(v, t, tau) {
    const P = this.calc(v);
    v.level = P.dry;
    aim(v, 'af', v.lp.frequency, P.fc, t, tau);
    aim(v, 'ag', v.g.gain, P.dry, t, tau);
    aim(v, 'aw', v.send.gain, P.wet, t, tau);
    if (v.pan) aim(v, 'ap', v.pan.pan, P.pan, t, tau);
  }

  // occlusion raycasts: a few per second per source, at most occBudget per frame
  occCheck(v, d) {
    if (d < 1.5 || !this.occluded) { v.occT = 0; return; }
    if (this.occBudget <= 0 || this.time < v.nextOcc) return;
    this.occBudget--;
    v.nextOcc = this.time + 0.25 + Math.random() * 0.15;
    try { v.occT = this.occluded(v.x, v.y, v.z) ? 1 : 0; } catch (e) { this.occluded = null; this.warn(e); }
  }

  pickVariant(prefix, n) {
    const last = this.last.get(prefix);
    let k = Math.floor(Math.random() * n);
    if (n > 1 && k === last) k = (k + 1 + Math.floor(Math.random() * (n - 1))) % n;   // never twice in a row
    for (let i = 0; i < n; i++) {
      const kk = (k + i) % n, b = this.buffers.get(prefix + kk);
      if (b) { this.last.set(prefix, kk); return b; }
    }
    return null;
  }

  shotBuffer(name) {
    const n = has(SHOT_VARIANTS, name) ? SHOT_VARIANTS[name] : 0;
    if (n) {
      const b = this.pickVariant(name + '_', n);
      if (!b) { const all = []; for (let k = 0; k < n; k++) all.push(name + '_' + k); this.want(all); }
      return b;
    }
    return /_\d+$/.test(name) ? this.buffers.get(name) || null : null;   // an explicit variant
  }

  // ------------------------------------------------------------------ one-shots
  footstep(surf, speed, crouched) {
    try {
      if (!this.live()) return;
      const s = surfIndex(surf);
      const buf = this.pickVariant('step_' + s + '_', FOOT_VARIANTS);
      if (!buf) return;
      // speed is m/s; the listener's measured speed covers callers that pass a walk-relative ratio
      const v = Math.max(clamp(num(speed, 1.5), 0, 20), this.moveSpeed);
      const run = crouched ? 0 : smooth(1.9, 2.7, v);
      const gain = MIX.foot * dbRand(1.5) * (crouched ? MIX.footCrouch : 1 + (MIX.footRun - 1) * run);
      this.side = -this.side;
      this.limit('foot', MAX_STEPS);
      this.limit(null, MAX_VOICES);
      this.voices.push(this.voice(buf, {
        kind: 'foot', rate: rnd(0.96, 1.04) * (crouched ? 0.97 : 1), gain, pan: 0.06 * this.side,
        lowpass: crouched ? 1500 : 0, send: gain * MIX.footVerb * (crouched ? 0.6 : 1),
      }));
    } catch (e) { this.warn(e); }
  }

  land(speed, surf) {
    try {
      if (!this.live()) return;
      const k = smooth(3, 12, clamp(num(speed, 5), 0, 40));   // impact m/s
      const thud = this.pickVariant('land_', SHOT_VARIANTS.land);
      this.limit(null, MAX_VOICES - 1);
      if (thud) {
        const gain = MIX.land * (0.4 + 0.6 * k) * dbRand(1);
        this.voices.push(this.voice(thud, { kind: 'foot', rate: (1 - 0.1 * k) * rnd(0.97, 1.03), gain, pan: 0, send: gain * 0.3 }));
      }
      // the floor's own sound, pitched down and heavier
      const s = surfIndex(surf), step = this.pickVariant('step_' + s + '_', FOOT_VARIANTS);
      if (step) {
        const gain = MIX.foot * (0.6 + 0.5 * k);
        this.voices.push(this.voice(step, { kind: 'foot', rate: rnd(0.8, 0.86), gain, pan: 0, send: gain * MIX.footVerb }));
      }
    } catch (e) { this.warn(e); }
  }

  play(name, x, y, z, opts) {
    try {
      if (!this.live() || typeof name !== 'string') return;
      const buf = this.shotBuffer(name);
      if (!buf) return;
      const o = opts || {};
      const base = name.replace(/_\d+$/, '');
      const trim = has(SHOT_TRIM, base) ? SHOT_TRIM[base] : 1;
      const v = { kind: 'shot', distant: !!o.distant, occ: 0, base: MIX.shot * trim * clamp(num(o.vol, 1), 0, 2) * (o.distant ? MIX.distant : 1) };
      const L = this.lis;
      v.positional = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
      v.x = v.positional ? x : L.x; v.y = v.positional ? y : L.y; v.z = v.positional ? z : L.z;
      // one raycast at the start; distant events are heard through the building by definition
      if (v.positional && !v.distant && this.occluded && this.geom(v.x, v.y, v.z).d > 1.5) {
        try { v.occ = this.occluded(v.x, v.y, v.z) ? 1 : 0; } catch (e) { this.occluded = null; }
      }
      const P = this.calc(v);
      this.limit(null, MAX_VOICES);
      const voice = this.voice(buf, { kind: 'shot', rate: rnd(0.975, 1.025), gain: P.dry, lowpass: P.fc, pan: P.pan, send: P.wet });
      Object.assign(voice, { positional: v.positional, x: v.x, y: v.y, z: v.z, distant: v.distant, base: v.base, occ: v.occ, af: P.fc, ag: P.dry, aw: P.wet, ap: P.pan });
      this.voices.push(voice);
    } catch (e) { this.warn(e); }
  }

  ui(name) {
    try {
      if (!this.live() || typeof name !== 'string') return;
      const buf = this.buffers.get('ui_' + name);
      if (!buf) return;
      this.limit('ui', MAX_UI);
      this.voices.push(this.voice(buf, { kind: 'ui', gain: MIX.ui, bus: this.uiBus }));
    } catch (e) { this.warn(e); }
  }

  // ------------------------------------------------------------------ per frame
  update(dt, listener, env, gctx) {
    try {
      const c = this.ctx;
      if (!c || c.state === 'closed') return;
      dt = clamp(num(dt, 1 / 60), 0, 0.25);
      this.time += dt;
      this.track(listener, dt);
      const e = env || {}, g = gctx || {};
      this.occluded = typeof g.occluded === 'function' ? g.occluded : null;
      this.occBudget = 2;
      const t = c.currentTime;
      this.updateLights(dt, t, Array.isArray(g.lights) ? g.lights : [], g.flicker, e);
      this.updateBeds(dt, t, e);
      this.updateReverb(t, e);
      this.updateEmitters(dt, t, Array.isArray(g.emitters) ? g.emitters : []);
      this.updateVoices(dt, t);
      this.sprinkle(dt, e);
    } catch (err) { this.warn(err); }
  }

  track(l, dt) {
    if (!l) return;
    const x = num(l.x, NaN), y = num(l.y, NaN), z = num(l.z, NaN);
    if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) return;
    const L = this.lis;
    if (L.ok && dt > 0) {
      const sp = Math.hypot(x - L.x, z - L.z) / dt;
      if (sp < 12) this.moveSpeed += (sp - this.moveSpeed) * (1 - Math.exp(-dt / 0.2));   // faster = teleport
    }
    L.x = x; L.y = y; L.z = z; L.yaw = num(l.yaw, L.yaw); L.ok = true;
  }

  // Nearby ceiling lights: how lit the ceiling is drives the hum bed; the two nearest lights get
  // a positional hum voice that stutters with their flicker, and click when they flicker.
  updateLights(dt, t, lights, fl, env) {
    const L = this.lis, fv = fl && fl.v;
    const flick = (ch) => (fv ? clamp(num(fv[ch | 0], 1), 0, 1) : 1);
    let sum = 0, n0 = null, d0 = Infinity, n1 = null, d1 = Infinity;
    for (const li of lights) {
      if (!li || !Number.isFinite(li.x) || !Number.isFinite(li.z)) continue;
      const dx = li.x - L.x, dy = num(li.y, L.y + 1) - L.y, dz = li.z - L.z;
      const dd = dx * dx + dy * dy + dz * dz;
      sum += clamp(num(li.int, 0.62), 0, 2) * flick(li.ch) / (1 + dd / 6.25);
      if (dd < d0) { n1 = n0; d1 = d0; n0 = li; d0 = dd; } else if (dd < d1) { n1 = li; d1 = dd; }
    }
    const lit = 1 - Math.exp(-sum * 1.2);
    this.lightLevel += (lit - this.lightLevel) * (1 - Math.exp(-dt / 0.3));
    this.humEnv = clamp(num(env.hum, 0.5), 0, 1.5);
    const buf = this.buffers.get('loop_hum_strip');
    const near = [n0, n1];
    for (let i = 0; i < 2; i++) {
      const li = near[i];
      let v = this.lightVoices[i];
      if (!v) {
        if (!li || !buf || !this.humEnv) continue;
        v = this.lightVoices[i] = this.voice(buf, { kind: 'light', loop: true, rate: i ? 1.0035 : 0.9975, gain: 0, lowpass: this.fcMax, pan: 0, send: 0, offset: Math.random() * 2 });
      }
      let gain = 0;
      if (li) {
        const G = this.geom(li.x, num(li.y, L.y + 1), li.z), f = flick(li.ch);
        gain = MIX.lightHum * this.humEnv * clamp(num(li.int, 0.62) / 0.62, 0, 2) * f * lightGain(G.d);
        if (v.pan) aim(v, 'ap', v.pan.pan, G.pan, t, 0.12);
        aim(v, 'af', v.lp.frequency, Math.min(this.fcMax, airHz(G.d) * (1 - 0.35 * G.behind)), t, 0.12);
        aim(v, 'aw', v.send.gain, gain * 0.25, t, 0.12);
        // a tube that stutters on or off clicks (rate-limited per flicker channel)
        const ch = li.ch | 0;
        if (fl && typeof fl.toggled === 'function' && ch >= 1 && ch <= 12 && G.d < 7 && fl.toggled(ch) && this.time - this.tickT[ch] > 0.22 && Math.random() < 0.7) {
          this.tickT[ch] = this.time;
          this.play(f > 0.5 ? 'flick_on' : 'flick_off', li.x, num(li.y, L.y + 1), li.z, { vol: rnd(0.5, 1) });
        }
      }
      aim(v, 'ag', v.g.gain, gain, t, 0.025);
      this.humRate(v, t);
    }
  }

  // hum pitch: 1, or the humShift() wobble while it lasts
  humRate(v, t) {
    const S = this.shift;
    let r = 1;
    if (this.time < S.until) r = S.rate * (1 + 0.004 * Math.sin((this.time - S.start) * 14.5) * Math.min(1, (this.time - S.start) * 3));
    aim(v, 'ar', v.src.playbackRate, r * v.rate, t, this.time < S.until ? 0.06 : 0.5, 0.0005);
  }

  bed(slot, name, level, t, tau) {
    let v = this.beds[slot];
    if (!v) {
      const buf = this.buffers.get(name);
      if (!buf || level < 1e-4) return null;
      v = this.beds[slot] = this.voice(buf, { kind: 'bed', loop: true, gain: 0, bus: this.bedBus, offset: Math.random() * buf.duration });
    }
    aim(v, 'ag', v.g.gain, level, t, tau);
    return v;
  }

  updateBeds(dt, t, env) {
    // fluorescent hum: the zone's level, louder under more / closer lit fixtures, swelling a
    // little while the hum shifts
    const swell = this.time < this.shift.until ? 1.35 : 1;
    const hum = this.bed('hum', 'bed_hum', MIX.hum * this.humEnv * (0.2 + 0.8 * this.lightLevel) * swell, t, 0.5);
    if (hum) this.humRate(hum, t);
    // air handling: winds down (level and pitch) when switched off, spins back up when on
    const on = this.hvacOn;
    const hv = this.bed('hvac', 'bed_hvac', MIX.hvac * clamp(num(env.hvac, 0.5), 0, 1.5) * (on ? 1 : 0), t, on ? 0.9 : 0.4);
    if (hv) aim(hv, 'ar', hv.src.playbackRate, on ? 1 : 0.8, t, on ? 0.8 : 0.5);
    // room tone: crossfade (~2 s) to the zone's tone; idle tones are stopped
    const tone = TONES.includes(env.tone) ? env.tone : 'yellow';
    if (!this.tones.has(tone)) {
      const buf = this.buffers.get('tone_' + tone);
      if (buf) this.tones.set(tone, this.voice(buf, { kind: 'bed', loop: true, gain: 0, bus: this.bedBus, offset: Math.random() * buf.duration }));
      else this.want(['tone_' + tone]);
    }
    for (const [name, v] of this.tones) {
      const cur = name === tone;
      aim(v, 'ag', v.g.gain, cur ? MIX.tone * (has(TONE_TRIM, name) ? TONE_TRIM[name] : 1) : 0, t, 0.6);
      v.idle = cur ? 0 : (v.idle || 0) + dt;
      if (v.idle > 3.5) { this.tones.delete(name); try { v.src.stop(); } catch (e) { this.release(v); } }
    }
  }

  // Reverb follows env.reverb; a change waits until the new space has held for a moment, then
  // crossfades to a second convolver.
  updateReverb(t, env) {
    const V = this.verb;
    const want = typeof env.reverb === 'string' && has(REVERB, env.reverb) ? env.reverb : 'room';
    if (want !== V.want) { V.want = want; V.wantT = this.time; this.ir(want); }
    for (let i = V.slots.length - 1; i >= 0; i--) {
      const s = V.slots[i];
      if (this.time > s.dieAt) {
        try { this.verbIn.disconnect(s.conv); } catch (e) { /* already */ }
        try { s.conv.disconnect(); s.g.disconnect(); } catch (e) { /* already */ }
        V.slots.splice(i, 1);
      }
    }
    if (V.cur === want || this.time < V.until || (V.cur && this.time - V.wantT < 0.3)) return;
    const buf = this.ir(want);
    if (!buf) return;
    const c = this.ctx;
    const conv = c.createConvolver();
    conv.normalize = false;   // makeIR sets the return level itself
    conv.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0;
    this.verbIn.connect(conv);
    conv.connect(g);
    g.connect(this.verbOut);
    const fade = V.cur ? 1.2 : 0.4;
    g.gain.setTargetAtTime(1, t, fade / 3);
    for (const s of V.slots) {
      if (s.dieAt !== Infinity) continue;
      s.g.gain.cancelScheduledValues(t);
      s.g.gain.setTargetAtTime(0, t, fade / 4);
      s.dieAt = this.time + fade * 1.6 + 0.2;
    }
    V.slots.push({ conv, g, kind: want, dieAt: Infinity });
    V.cur = want;
    V.until = this.time + fade;
  }

  // Positional loops: start a voice when an emitter comes into range, fade it out when it leaves.
  updateEmitters(dt, t, emitters) {
    const stamp = ++this.stamp, cands = this.cands;
    cands.length = 0;
    for (const e of emitters) {
      if (!e || typeof e.snd !== 'string' || !Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.z)) continue;
      const rad = clamp(num(e.rad, 12), 0.5, 200);
      const d = this.geom(e.x, e.y, e.z).d;
      if (d >= rad) continue;
      const vol = clamp(num(e.vol, 1), 0, 4);
      cands.push({ e, rad, vol, level: vol * loopGain(d, rad), key: e.snd + '|' + Math.round(e.x * 4) + '|' + Math.round(e.y * 4) + '|' + Math.round(e.z * 4) });
    }
    if (cands.length > MAX_LOOPS) { cands.sort((a, b) => b.level - a.level); cands.length = MAX_LOOPS; }
    for (const cd of cands) {
      let v = this.loops.get(cd.key);
      if (!v) {
        if (cd.level < 1e-3) continue;
        const name = 'loop_' + cd.e.snd, buf = this.buffers.get(name);
        if (!buf) { this.want([name]); continue; }
        v = this.voice(buf, { kind: 'loop', loop: true, gain: 0, lowpass: this.fcMax, pan: 0, send: 0, offset: Math.random() * buf.duration, rate: rnd(0.99, 1.01) });
        v.x = cd.e.x; v.y = cd.e.y; v.z = cd.e.z;
        v.occ = v.occT = -1;   // first occlusion answer applies at once
        this.loops.set(cd.key, v);
      }
      v.stamp = stamp; v.rad = cd.rad; v.base = MIX.loop * cd.vol;
    }
    for (const [key, v] of this.loops) {
      if (v.stamp !== stamp) { this.loops.delete(key); this.fadeOut(v, 0.15); continue; }
      const d = this.geom(v.x, v.y, v.z).d;
      this.occCheck(v, d);
      if (v.occT < 0) continue;   // waiting for its first occlusion check: stays silent
      v.occ = v.occ < 0 ? v.occT : v.occ + (v.occT - v.occ) * (1 - Math.exp(-dt / 0.2));
      this.place(v, t, 0.08);
    }
  }

  // positional one-shots follow the listener's movement; ended voices are swept up
  updateVoices(dt, t) {
    for (const v of this.voices) if (v.positional && !v.stopping) this.place(v, t, 0.05);
    if ((this.stamp & 31) === 0) {
      for (const v of this.voices.slice()) if (v.end !== Infinity && t > v.end + 1) this.release(v);
      for (const v of [...this.dying]) if (t > v.end + 1) this.release(v);
    }
  }

  // ambience sprinkles: drips in damp spaces
  sprinkle(dt, env) {
    if (env.tone !== 'water' || !this.live()) return;
    this.dripT -= dt;
    if (this.dripT > 0) return;
    this.dripT = rnd(0.7, 4);
    const L = this.lis, a = rnd(0, Math.PI * 2), d = rnd(2, 9);
    this.play('drip', L.x + Math.sin(a) * d, L.y - rnd(0.6, 1.4), L.z - Math.cos(a) * d, { vol: rnd(0.4, 1) });
  }
}
