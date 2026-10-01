// Procedural audio engine for the wet-alley night walk. Everything is synthesized at init with the
// Web Audio API (no files, no network). See README.md in this folder for design notes and API usage.
import { makeYielder } from './lib/dsp.js';
import { createWind } from './wind.js';
import { synthFootsteps, SURFACES, PARTS } from './synth/footsteps.js';
import { flutterIR, diffuseIR, cityIR } from './synth/reverb.js';
import * as ES from './synth/emitterSounds.js';
import * as AS from './synth/ambienceSounds.js';
import { synthOneShots, synthCarEngine, synthCarTires } from './synth/oneShotSounds.js';
import { Acoustics } from './runtime/acoustics.js';
import { EmitterHandle, EMITTER_TYPES, emitterBuffersReady } from './runtime/emitters.js';
import { OneShotPool, CarPass, ONESHOT_TYPES } from './runtime/oneshots.js';
import { Ambience } from './runtime/ambience.js';
import { glide, hold, dbToGain, rand, pickIndexNoRepeat, finite, dist, autoCleanup } from './runtime/spatial.js';

export { SURFACES, PARTS, EMITTER_TYPES, ONESHOT_TYPES };

const FS_PART = { heel: 1.0, toe: 0.5, scuff: 0.3 };
const FS_SURF = {
  asphalt: 1.0, concrete: 1.0, metal: 0.78, grate: 0.78, puddle: 0.92, wet: 0.95, debris: 0.85, glass: 0.78, wood: 0.9, cardboard: 0.95,
};
const MIX = {
  footsteps: 0.5, emitters: 1, oneShots: 1, ambience: 1, reverb: 1,
  fsFlutter: 0.5, fsDiffuse: 0.42, fsSlap: 0.85,
  emFlutter: 0.45, emDiffuse: 0.75, emSlap: 0.1,
  osFlutter: 0.55, osDiffuse: 0.75, osSlap: 0.25,
  cloth: 0.045,
};

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function vec(v, d) {
  if (!v) return { ...d };
  return { x: finite(v.x, d.x), y: finite(v.y, d.y), z: finite(v.z, d.z) };
}
function norm(v, d) {
  const l = Math.hypot(v.x, v.y, v.z);
  return l > 1e-6 ? { x: v.x / l, y: v.y / l, z: v.z / l } : { ...d };
}

export class AudioEngine {
  constructor(opts = {}) {
    this.opts = opts;
    this.seed = (finite(opts.seed, 1337) >>> 0) || 1337;
    this._ctx = opts.context || null;
    this._ready = false;
    this._paused = false;
    this._wind = createWind(this.seed);
    this._handles = new Set();
    this._dumpsters = [];
    this._movers = new Set();
    this._lis = { pos: { x: 0, y: 1.62, z: 0 }, fwd: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } };
    this._listenerSet = false;
    this._state = { time: 0, distFront: 95, distBack: 8, enclosure: 1, playerPos: { x: 0, y: 0, z: 0 } };
    this.alley = { halfWidth: 2.8, zBack: 8, zFront: -90, ...(opts.alley || {}) };
    this.currentWind = 0.2;
    this.volume = finite(opts.volume, 1);
    this.maxHrtf = finite(opts.maxHrtf, 10);
    this._lastFs = {};
    this._nextHrtf = 0;
    this.buffers = {};
    this.waves = {};
    this.debug = { jobs: {} };
    this.initMs = 0;
  }

  get ready() { return this._ready; }
  get context() { return this._ctx; }
  /** internal alias used by runtime modules */
  get ctx() { return this._ctx; }

  /** Deterministic gust function 0..1 shared with visuals. */
  windAt(t) { return this._wind(t); }

  // ------------------------------------------------------------------ init
  init() {
    if (!this._initPromise) {
      this._initPromise = this._init().catch((e) => {
        console.error('[audio] init failed, audio disabled', e);
        this._ready = false;
      });
    }
    return this._initPromise;
  }

  async _init() {
    const t0 = nowMs();
    let ctx = this._ctx;
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) { console.warn('[audio] Web Audio API not available'); return; }
      ctx = this._ctx = new AC({ latencyHint: 'interactive' });
    }
    this._offline = typeof ctx.startRendering === 'function';
    if (!this._offline && ctx.state === 'suspended') { try { ctx.resume().catch(() => {}); } catch (e) { /* ignore */ } }
    const y = makeYielder(this.opts.yieldBudgetMs ?? 10);
    const sr = ctx.sampleRate;
    const seed = this.seed;
    const B = this.buffers;
    const W = this.waves;
    const mk = (chs, rate) => {
      const b = ctx.createBuffer(chs.length, chs[0].length, rate);
      for (let c = 0; c < chs.length; c++) {
        if (b.copyToChannel) b.copyToChannel(chs[c], c);
        else b.getChannelData(c).set(chs[c]);
      }
      return b;
    };
    const mk1 = (x, rate) => mk([x], rate);
    const pw = (c) => ctx.createPeriodicWave(c.real, c.imag, { disableNormalization: false });
    const r24 = Math.min(24000, sr);
    const r16 = Math.min(16000, sr);
    const r22 = Math.min(22050, sr);
    const job = async (name, fn) => {
      const s = nowMs();
      try { await fn(); } catch (e) { console.warn('[audio] synthesis failed:', name, e); }
      this.debug.jobs[name] = Math.round(nowMs() - s);
      await y();
    };

    this._buildMaster();
    await this._measureMakeup();

    const r32 = Math.min(32000, sr);
    const addOneShots = async (names) => {
      const os = await synthOneShots(seed, sr, y, names);
      B.oneShots = B.oneShots || {};
      for (const k of Object.keys(os)) if (k !== 'rates') B.oneShots[k] = os[k].map((x) => mk1(x, os.rates[k]));
    };

    // ---------------- phase 1: what the first seconds need (init resolves after this)
    await job('ir', () => {
      const f = flutterIR(seed, sr);
      B.flutterIR = mk([f.L, f.R], sr);
      this.debug.flutterArrivals = f.arrivals;
      const d = diffuseIR(seed, sr);
      B.diffuseIR = mk([d.L, d.R], sr);
    });
    this._buildAcoustics();
    await job('footsteps', async () => {
      const fs = await synthFootsteps(seed, sr, y);
      const out = {};
      for (const s2 of SURFACES) {
        out[s2] = {};
        for (const p2 of PARTS) out[s2][p2] = fs[s2][p2].map((x) => mk1(x, sr));
      }
      out.cloth = fs.cloth.map((x) => mk1(x, sr));
      B.footsteps = out;
    });
    await job('oneshots-1', () => addOneShots(['drip.water', 'drip.metal', 'drip.ground', 'drip.plastic', 'canKick', 'paperRustle', 'plasticRustle']));
    await job('bed', () => {
      B.cityRumble = mk(AS.synthCityRumble(seed, 8000), 8000);
      B.cityHiss = mk(AS.synthCityHiss(seed, r24), r24);
      B.wind = mk(AS.synthWindNoise(seed, r16), r16);
      W.cityHum = pw({ real: new Float32Array([0, 0, 0, 0, 0, 0, 0]), imag: new Float32Array([0, 1, 0.55, 0.3, 0.18, 0.1, 0.05]) });
    });
    await job('electrics', () => {
      W.transformer = pw(ES.transformerWave(seed));
      W.ballast = pw(ES.ballastWave(seed));
      B.sizzle = mk1(ES.synthSizzle(seed, sr), sr);
      B.lampCrackle = ES.synthLampCrackles(seed, sr).map((x) => mk1(x, sr));
      B.lampTick = ES.synthLampTicks(seed, sr).map((x) => mk1(x, sr));
    });
    await job('hvac', () => {
      B.hvac = mk1(ES.synthHvac(seed, r24), r24);
      B.hvacRattle = ES.synthHvacRattles(seed, r24).map((x) => mk1(x, r24));
    });

    // runtime systems
    try { this.pool = new OneShotPool(this, 12, 3); } catch (e) { console.warn('[audio] one-shot pool failed', e); }
    try {
      this.ambience = new Ambience(this, { bed: this.opts.ambience !== false, events: this.opts.autoEvents !== false, dripRate: this.opts.ambientDripRate });
    } catch (e) { console.warn('[audio] ambience failed', e); }
    this._ready = true;
    this._applyListener(0);
    this._instantiatePending();
    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0, now);
    if (!this._paused) this.masterGain.gain.linearRampToValueAtTime(this.volume, now + (this.opts.fadeInSec ?? 1.2));
    this.initMs = Math.round(nowMs() - t0);
    this.debug.initMs = this.initMs;

    // ---------------- phase 2: cooperative background synthesis (emitters/one-shots/events whose banks
    // are not ready yet attach automatically as soon as they are; distant events are skipped until then)
    this._fullyLoaded = (async () => {
      const tb = nowMs();
      await job('oneshots-2', () => addOneShots(['garbageShift', 'doorRattle', 'wireCreak', 'canRoll', 'bottleKick']));
      await job('trickle', () => { B.trickle = mk1(ES.synthTrickle(seed, r32), r32); });
      await job('drain', () => { B.drain = mk1(ES.synthDrain(seed, r24), r24); });
      await job('cars', () => {
        B.carEngine = [0, 1].map((k) => mk1(synthCarEngine(seed, k, r24), r24));
        B.carTires = [0, 1].map((k) => mk1(synthCarTires(seed, k, sr), sr));
      });
      this._instantiatePending();
      await job('exhaust', () => { B.exhaust = mk1(ES.synthExhaust(seed, r24), r24); });
      await job('tv', () => { B.tv = mk1(ES.synthTV(seed, r16), r16); });
      await job('voices', () => { B.voices = mk1(ES.synthVoices(seed, r16), r16); });
      await job('radio', () => {
        const R = ES.synthRadio(seed, Math.min(12000, sr));
        B.radio = { songs: R.songs.map((x) => mk1(x, R.sr)), barSec: R.barSec, dj: mk1(R.dj, R.sr) };
      });
      this._instantiatePending();
      await job('ir-city', () => {
        const c = cityIR(seed, sr);
        B.cityIR = mk([c.L, c.R], sr);
        if (this.ambience) this.ambience.setCityIR(B.cityIR);
      });
      await job('distant-cars', () => { B.distantCars = [0, 1, 2, 3].map((k) => mk1(AS.synthDistantCar(seed, k, r22), r22)); });
      await job('sirens', () => { B.sirens = [0, 1].map((k) => mk1(AS.synthSiren(seed, k, r16), r16)); });
      await job('train', () => { B.trains = [0, 1].map((k) => mk1(AS.synthTrain(seed, k, r16), r16)); });
      await job('street', () => {
        B.streetBabble = mk1(ES.synthStreetBabble(seed, r16), r16);
        B.barks = AS.synthBarks(seed, r16).map((x) => mk1(x, r16));
      });
      y.close();
      this._instantiatePending();
      this.debug.backgroundMs = Math.round(nowMs() - tb);
      this.debug.totalSynthMs = Math.round(nowMs() - t0);
      this._complete = true;
    })().catch((e) => console.warn('[audio] background synthesis failed', e));
  }

  _instantiatePending() {
    if (!this._ready) return;
    for (const h of this._handles) if (!h.em && !h.stopped && emitterBuffersReady(h.type, this.buffers, this.waves)) h._instantiate();
  }

  /** Resolves when the background (rare distant event) synthesis has finished too. */
  whenFullyLoaded() {
    return this.init().then(() => this._fullyLoaded);
  }

  _buildMaster() {
    const ctx = this._ctx;
    this.preMaster = ctx.createGain();
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 2.5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.25;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.08;
    this.makeup = ctx.createGain();
    this.makeup.gain.value = 1;
    this.clip = ctx.createWaveShaper();
    const n = 4096;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const a = Math.abs(x);
      const k = 0.8;
      const yv = a <= k ? a : k + (1 - k) * Math.tanh((a - k) / (1 - k));
      curve[i] = Math.sign(x) * yv;
    }
    this.clip.curve = curve;
    this.clip.oversample = '2x';
    this.preMaster.connect(this.masterGain);
    this.masterGain.connect(this.comp);
    this.comp.connect(this.limiter);
    this.limiter.connect(this.makeup);
    this.makeup.connect(this.clip);
    this.clip.connect(ctx.destination);

    const bus = (g) => { const n2 = ctx.createGain(); n2.gain.value = g; n2.connect(this.preMaster); return n2; };
    this.busFootsteps = bus(MIX.footsteps);
    this.busEmitters = bus(MIX.emitters);
    this.busOneShots = bus(MIX.oneShots);
    this.busAmbience = bus(MIX.ambience);
    this.busReverb = bus(MIX.reverb);
    this.emitterSendIn = ctx.createGain();
    this.oneShotSendIn = ctx.createGain();
  }

  /** The compressors apply automatic make-up gain; measure it offline and compensate. */
  async _measureMakeup() {
    let g = 1;
    try {
      const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
      if (OAC) {
        const sr = 22050;
        const oc = new OAC(1, Math.round(sr * 0.3), sr);
        const osc = oc.createOscillator();
        osc.frequency.value = 400;
        const a = oc.createGain();
        a.gain.value = 0.01;
        const c1 = oc.createDynamicsCompressor();
        const c2 = oc.createDynamicsCompressor();
        for (const [d, s] of [[c1, this.comp], [c2, this.limiter]]) {
          d.threshold.value = s.threshold.value; d.knee.value = s.knee.value; d.ratio.value = s.ratio.value;
          d.attack.value = s.attack.value; d.release.value = s.release.value;
        }
        osc.connect(a); a.connect(c1); c1.connect(c2); c2.connect(oc.destination);
        osc.start();
        const buf = await oc.startRendering();
        const x = buf.getChannelData(0);
        let s2 = 0, cnt = 0;
        for (let i = Math.round(sr * 0.15); i < x.length; i++) { s2 += x[i] * x[i]; cnt++; }
        const rmsOut = Math.sqrt(s2 / cnt);
        const rmsIn = 0.01 / Math.SQRT2;
        if (rmsOut > 1e-6) g = rmsIn / rmsOut;
      }
    } catch (e) { g = 1; }
    if (!(g > 0.2 && g < 5)) g = 1;
    this.makeup.gain.value = g;
    this.debug.makeupComp = g;
  }

  _buildAcoustics() {
    const ctx = this._ctx;
    const B = this.buffers;
    if (!B.flutterIR || !B.diffuseIR) return;
    try {
      this.acoustics = new Acoustics(ctx, { flutter: B.flutterIR, diffuse: B.diffuseIR }, this.busReverb, { hrtf: true });
      const A = this.acoustics;
      const send = (from, to, g) => { const n = ctx.createGain(); n.gain.value = g; from.connect(n); n.connect(to); return n; };
      this.sends = {
        fsF: send(this.busFootsteps, A.flutterIn, MIX.fsFlutter),
        fsD: send(this.busFootsteps, A.diffuseIn, MIX.fsDiffuse),
        fsS: send(this.busFootsteps, A.slapIn, MIX.fsSlap),
        emF: send(this.emitterSendIn, A.flutterIn, MIX.emFlutter),
        emD: send(this.emitterSendIn, A.diffuseIn, MIX.emDiffuse),
        emS: send(this.emitterSendIn, A.slapIn, MIX.emSlap),
        osF: send(this.oneShotSendIn, A.flutterIn, MIX.osFlutter),
        osD: send(this.oneShotSendIn, A.diffuseIn, MIX.osDiffuse),
        osS: send(this.oneShotSendIn, A.slapIn, MIX.osSlap),
      };
    } catch (e) {
      console.warn('[audio] acoustics failed', e);
    }
  }

  // ------------------------------------------------------------------ control
  setPaused(paused) {
    paused = !!paused;
    if (paused === this._paused) return;
    this._paused = paused;
    if (!this._ready) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    if (this._suspendTimer) { clearTimeout(this._suspendTimer); this._suspendTimer = null; }
    if (paused) {
      hold(this.masterGain.gain, now);
      this.masterGain.gain.linearRampToValueAtTime(0, now + 0.4);
      if (!this._offline && typeof setTimeout === 'function') {
        this._suspendTimer = setTimeout(() => {
          this._suspendTimer = null;
          if (this._paused && ctx.state === 'running') ctx.suspend().catch(() => {});
        }, 480);
      }
    } else {
      const go = () => {
        const n = ctx.currentTime;
        hold(this.masterGain.gain, n);
        this.masterGain.gain.linearRampToValueAtTime(this.volume, n + 0.4);
      };
      if (!this._offline && ctx.state === 'suspended') ctx.resume().then(go, go);
      else go();
    }
  }

  setVolume(v) {
    this.volume = Math.max(0, finite(v, 1));
    if (this._ready && !this._paused) glide(this.masterGain.gain, this.volume, this._ctx.currentTime, 0.05);
  }

  /** Mixer helper: name in footsteps|emitters|oneShots|ambience|reverb */
  setBusGain(name, v) {
    const map = { footsteps: this.busFootsteps, emitters: this.busEmitters, oneShots: this.busOneShots, ambience: this.busAmbience, reverb: this.busReverb };
    const n = map[name];
    if (n) glide(n.gain, Math.max(0, finite(v, 1)) * (MIX[name] ?? 1), this._ctx.currentTime, 0.05);
  }

  setListener(pos, forward, up) {
    this._lis = {
      pos: vec(pos, this._lis.pos),
      fwd: norm(vec(forward, this._lis.fwd), { x: 0, y: 0, z: -1 }),
      up: norm(vec(up, this._lis.up), { x: 0, y: 1, z: 0 }),
    };
    this._listenerSet = true;
    if (this._ready) this._applyListener(0.012);
  }

  _applyListener(tc) {
    const L = this._ctx.listener;
    const t = this._ctx.currentTime;
    const { pos, fwd, up } = this._lis;
    if (L.positionX) {
      const set = (p, v) => (tc > 0 ? p.setTargetAtTime(v, t, tc) : (p.cancelScheduledValues(t), p.setValueAtTime(v, t)));
      set(L.positionX, pos.x); set(L.positionY, pos.y); set(L.positionZ, pos.z);
      set(L.forwardX, fwd.x); set(L.forwardY, fwd.y); set(L.forwardZ, fwd.z);
      set(L.upX, up.x); set(L.upY, up.y); set(L.upZ, up.z);
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  update(dt, state = {}) {
    const s = this._state;
    if (state) {
      if (Number.isFinite(state.time)) s.time = state.time;
      if (state.playerPos) s.playerPos = vec(state.playerPos, s.playerPos);
      if (state.playerVel) s.playerVel = vec(state.playerVel, { x: 0, y: 0, z: 0 });
      if (Number.isFinite(state.speed)) s.speed = state.speed;
      s.distFront = Number.isFinite(state.distFront) ? state.distFront : state.distFront === Infinity ? 400 : s.distFront;
      s.distBack = Number.isFinite(state.distBack) ? state.distBack : state.distBack === Infinity ? 400 : s.distBack;
      if (Number.isFinite(state.enclosure)) s.enclosure = state.enclosure;
      if (state.corridorDir) s.corridorDir = state.corridorDir;
    }
    if (!this._ready) return;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    if (!this._listenerSet && state && state.playerPos) {
      this._lis.pos = { x: s.playerPos.x, y: s.playerPos.y + 1.62, z: s.playerPos.z };
      this._applyListener(0.012);
    }
    dt = finite(dt, 1 / 60);
    if (this.acoustics) this.acoustics.update(now, this._lis, s);
    const w = this._wind(Number.isFinite(s.time) && s.time > 0 ? s.time : now);
    this.currentWind = w;
    if (this.ambience && !this._paused) this.ambience.update(now, dt, s, w);
    for (const h of this._handles) if (h.em) h.em.update(now, this._lis, dt);
    if (!this._complete && now >= (this._nextPending ?? 0)) { this._nextPending = now + 0.25; this._instantiatePending(); }
    if (now >= this._nextHrtf) { this._nextHrtf = now + 0.5; this._assignHrtf(now); }
    for (const m of this._movers) {
      m.update(now, this._lis);
      if (m.done) this._movers.delete(m);
    }
  }

  _assignHrtf(now) {
    const used = (this.acoustics ? this.acoustics.hrtfCount : 0) + (this.pool ? this.pool.hrtfCount : 0);
    const movers = [...this._movers].filter((m) => m.hrtf && !m.done).length;
    const budget = Math.max(0, this.maxHrtf - used - Math.max(1, movers));
    const lis = this._lis.pos;
    const arr = [];
    for (const h of this._handles) if (h.em && !h.em.stopped) arr.push([h.em, dist(h.em.pos, lis)]);
    arr.sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < arr.length; i++) arr[i][0].setHrtf(i < budget && arr[i][1] < 30, now);
  }

  hrtfInUse() {
    let n = (this.acoustics ? this.acoustics.hrtfCount : 0) + (this.pool ? this.pool.hrtfCount : 0);
    for (const h of this._handles) if (h.em && (h.em.hrtf || h.em.pendingModel === 'HRTF')) n++;
    for (const m of this._movers) if (m.hrtf && !m.done) n++;
    return n;
  }

  // ------------------------------------------------------------------ footsteps
  footstep(e = {}) {
    if (!this._ready || this._paused) return;
    const fs = this.buffers.footsteps;
    if (!fs) return;
    const surf = fs[e.surface] ? e.surface : 'asphalt';
    const part = e.part === 'toe' || e.part === 'scuff' ? e.part : 'heel';
    const bank = fs[surf][part];
    if (!bank || !bank.length) return;
    const key = surf + part;
    const idx = pickIndexNoRepeat(bank.length, this._lastFs[key] ?? -1);
    this._lastFs[key] = idx;
    const intensity = Math.min(1, Math.max(0, finite(e.intensity, 0.7)));
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const t = Number.isFinite(e.when) ? Math.max(now, e.when) : now;
    const src = ctx.createBufferSource();
    src.buffer = bank[idx];
    src.playbackRate.value = 1 + rand(-0.03, 0.03);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.value = 3500 + 17000 * intensity * intensity;
    const g = ctx.createGain();
    g.gain.value = FS_PART[part] * (FS_SURF[surf] ?? 1) * dbToGain(-18 * (1 - intensity) + rand(-2, 2));
    const pan = ctx.createStereoPanner();
    pan.pan.value = this._footPan(e);
    src.connect(lp);
    lp.connect(g);
    g.connect(pan);
    pan.connect(this.busFootsteps);
    src.start(t);
    autoCleanup(src, [lp, g, pan]);
    // optional quiet clothing rustle (coat/skirt swish) with the heel strike
    if (part === 'heel' && fs.cloth && fs.cloth.length && Math.random() < 0.55 && this.opts.clothing !== false) {
      const c = ctx.createBufferSource();
      this._lastCloth = pickIndexNoRepeat(fs.cloth.length, this._lastCloth ?? -1);
      c.buffer = fs.cloth[this._lastCloth];
      c.playbackRate.value = rand(0.9, 1.1);
      const cg = ctx.createGain();
      cg.gain.value = MIX.cloth * (0.4 + 0.6 * intensity) * rand(0.6, 1.2);
      c.connect(cg);
      cg.connect(pan);
      c.start(t + rand(0, 0.035));
      autoCleanup(c, [cg]);
    }
  }

  _footPan(e) {
    const p = e.position;
    if (!p || !Number.isFinite(p.x)) return e.foot === 'L' ? -0.07 : e.foot === 'R' ? 0.07 : 0;
    const { pos, fwd: f, up: u } = this._lis;
    const rx = f.y * u.z - f.z * u.y;
    const ry = f.z * u.x - f.x * u.z;
    const rz = f.x * u.y - f.y * u.x;
    const rl = Math.hypot(rx, ry, rz) || 1;
    const lat = ((p.x - pos.x) * rx + (finite(p.y, pos.y) - pos.y) * ry + (finite(p.z, pos.z) - pos.z) * rz) / rl;
    return Math.max(-0.35, Math.min(0.35, lat * 0.8));
  }

  // ------------------------------------------------------------------ emitters / one-shots
  addEmitter(desc = {}) {
    const h = new EmitterHandle(this, desc);
    if (!EMITTER_TYPES[desc.type]) {
      console.warn('[audio] unknown emitter type', desc.type);
      h.stopped = true;
      return h;
    }
    this._handles.add(h);
    if (this._ready) this._instantiatePending();
    return h;
  }

  _removeHandle(h) { this._handles.delete(h); }

  oneShot(type, params = {}) {
    if (!this._ready || this._paused) return false;
    try {
      if (type === 'carPass') {
        if (!this.buffers.carTires || !this.buffers.carEngine) return false;
        const hr = this.hrtfInUse() < this.maxHrtf;
        const car = new CarPass(this, params || {}, hr);
        this._movers.add(car);
        return true;
      }
      if (!this.pool || !this.buffers.oneShots) return false;
      return this.pool.trigger(type, params || {}, this.buffers.oneShots);
    } catch (e) {
      console.warn('[audio] oneShot failed', type, e);
      return false;
    }
  }

  /** Register dumpster positions: occasional garbage settling + gust rustles happen there. */
  registerDumpster(position) {
    if (position && Number.isFinite(position.x)) this._dumpsters.push({ x: position.x, y: finite(position.y, 0.6), z: finite(position.z) });
  }
  setDumpsters(list = []) {
    this._dumpsters = [];
    for (const p of list) this.registerDumpster(p);
  }
  _nearestDumpster(maxD) {
    let best = null, bd = maxD;
    for (const d of this._dumpsters) {
      const dd = dist(d, this._lis.pos);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  /** Force an autonomous ambience event (testing / scripted moments):
   *  'siren' | 'train' | 'distantCar' | 'streetVoices' | 'dog' | 'garbage' | 'ambientDrip' */
  triggerAmbient(type, opts = {}) {
    if (!this._ready || !this.ambience) return false;
    return !!this.ambience.trigger(type, opts);
  }

  /** Enable/disable the continuous city/wind bed and the autonomous event scheduler. */
  setAmbienceEnabled(bed = true, events = true) {
    if (!this.ambience) return;
    this.ambience.setBedEnabled(!!bed);
    this.ambience.eventsOn = !!events;
  }

  getDebugInfo() {
    return {
      ready: this._ready,
      initMs: this.initMs,
      jobs: { ...this.debug.jobs },
      sampleRate: this._ctx ? this._ctx.sampleRate : 0,
      emitters: [...this._handles].map((h) => ({ type: h.type, hrtf: !!(h.em && h.em.hrtf), distance: h.em ? h.em.distance : null })),
      hrtfInUse: this._ready ? this.hrtfInUse() : 0,
      movers: this._movers.size,
      wind: this.currentWind,
      slap: this.acoustics ? { front: this.acoustics.lastFront, back: this.acoustics.lastBack } : null,
      makeupComp: this.debug.makeupComp,
    };
  }

  dispose() {
    for (const h of [...this._handles]) h.stop();
    this._ready = false;
    if (this._ctx && !this._offline && this._ctx.close) this._ctx.close().catch(() => {});
  }
}

export default AudioEngine;
