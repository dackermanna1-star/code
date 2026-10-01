// Spray can voice (graffiti feature): aerosol hiss per cap / flow / distance with valve onset and release,
// feathering sputter, the mixing-ball rattle with liquid slosh, and the handling sounds (equip, holster,
// actuator-cap swap, menu tick). One persistent voice, built on first use and reused across sprays:
//
//   hiss loop -> highpass -> peaking -> lowpass -+
//   rough loop -> roughG ------------------------+-> am (gain += depth * sputter loop) -> env -+-> panner -> busSpray
//   slosh loop -> sloshG, per-event one-shots (onset, release, clacks, handling) ------------+-> send -> alley reverb
//
// The panner (HRTF) sits at the nozzle (sprayUpdate position) or, for the other sounds, at the right hand /
// hip relative to the listener. The loops run silently between uses (env / sloshG at 0, so everything
// downstream propagates silence). Every parameter change is smoothed with setTargetAtTime; sprayUpdate()
// and the per-frame tick allocate nothing. Randomness comes from the engine seed.
import { glide, jump, hold, makePanner, setPannerPos, dbToGain, autoCleanup } from './spatial.js';
import { biquadCoefs } from '../lib/dsp.js';
import { deriveRng } from '../lib/rng.js';
import { SPRAY_LOOP_RMS } from '../synth/spraySounds.js';

// Web Audio reads lowpass/highpass Q in dB
const Q_HP = -1; // soft knee
const Q_LP = -3; // Butterworth

/**
 * Cap voicing at full flow. lo / fc / hi: highpass, peaking centre, lowpass (Hz); q, pkDb: peaking Q and
 * gain; db: level vs. standard; roughDb: splatter/whoosh layer vs. the hiss; sput: constant sputter depth
 * (roughness); onsetRate: playback rate of the valve transients; wobble, drift: slow pitch drift (fraction)
 * and its retarget interval (s).
 */
export const SPRAY_CAPS = {
  skinny: { lo: 4300, fc: 7800, q: 1.3, pkDb: 6, hi: 14000, db: -6, roughDb: -21, sput: 0.02, onsetRate: 1.12, onsetDb: -2, wobble: 0.015, drift: [0.3, 0.8] },
  standard: { lo: 3000, fc: 5800, q: 0.85, pkDb: 4.5, hi: 12500, db: 0, roughDb: -17, sput: 0.04, onsetRate: 1, onsetDb: 0, wobble: 0.02, drift: [0.3, 0.8] },
  fat: { lo: 1800, fc: 4200, q: 0.5, pkDb: 3, hi: 10500, db: 3.5, roughDb: -9, sput: 0.14, onsetRate: 0.86, onsetDb: 1.5, wobble: 0.025, drift: [0.25, 0.7] },
  calligraphy: { lo: 4200, fc: 6500, q: 7, pkDb: 11, hi: 9800, db: -2.5, roughDb: -19, sput: 0.05, onsetRate: 1.05, onsetDb: -1, wobble: 0.012, drift: [0.08, 0.22] },
};
export const SPRAY_CAP_NAMES = Object.keys(SPRAY_CAPS);
const CAP_SET = new Set(SPRAY_CAP_NAMES);

// Levels (linear). hiss: RMS into the panner for a standard cap at full flow; onset/release: transient
// peak relative to the hiss RMS; the rest are peak gains of their (peak-normalized) buffers.
const LV = {
  hiss: 0.06, onset: 4, release: 1.6, clack: 0.3, slosh: 0.35,
  equip: 0.28, holster: 0.26, cap: 0.2, menu: 0.035,
  send: 0.16, // alley reverb send (the one-shot sends: flutter, diffuse, slap-back)
};

// Listener-relative offsets (m): right, forward, down.
const HAND = { r: 0.22, f: 0.32, d: 0.28 };
const HIP = { r: 0.26, f: 0.1, d: 0.62 };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function sstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
/** Paint hitting the wall: 1 at <= 5 cm, ~0.22 at 17-45 cm, gone by ~1.5 m and when spraying into the air. */
function splatOf(d) {
  if (!(d < 1.5)) return 0;
  return (0.22 + 0.78 * sstep(0.17, 0.05, d)) * (1 - sstep(0.45, 1.5, d));
}
function airOf(d) { return d === Infinity ? 1 : sstep(0.6, 1.8, d); }
const rel = (x, y) => Math.abs(x - y) / Math.max(1e-9, Math.abs(y));
function pick(rng, n, last) {
  if (n <= 1) return 0;
  let i = Math.floor(rng.next() * (n - 1));
  if (last >= 0 && i >= last) i++;
  return i;
}

function magSq(c, w) {
  const cw = Math.cos(w), sw = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * cw + c.b2 * c2, ni = -(c.b1 * sw + c.b2 * s2);
  const dr = 1 + c.a1 * cw + c.a2 * c2, di = -(c.a1 * sw + c.a2 * s2);
  return (nr * nr + ni * ni) / (dr * dr + di * di);
}
/** Mean power gain of a cap's filter chain for white noise (Web Audio biquad semantics). */
function chainPower(cap, sr) {
  const hp = biquadCoefs('highpass', cap.lo, Math.pow(10, Q_HP / 20), sr);
  const pk = biquadCoefs('peaking', cap.fc, cap.q, sr, cap.pkDb);
  const lp = biquadCoefs('lowpass', cap.hi, Math.pow(10, Q_LP / 20), sr);
  const K = 1024;
  let s = 0;
  for (let k = 0; k < K; k++) {
    const w = (Math.PI * (k + 0.5)) / K;
    s += magSq(hp, w) * magSq(pk, w) * magSq(lp, w);
  }
  return Math.max(1e-6, s / K);
}

export class SprayCan {
  constructor(engine) {
    this.engine = engine;
    this.ctx = engine.ctx;
    this.rng = deriveRng(engine.seed, 'spray-runtime');
    this.n = null;
    this._hrtf = false;
    this.wanted = false; // between sprayStart and sprayStop
    this.on = false; // valve open (hiss sounding)
    this.cap = 'standard';
    this.flow = 1;
    this.dist = 0.25;
    this.pos = { x: 0, y: 0, z: 0 };
    this._hasPos = false;
    this._posFresh = false;
    this._posT = -1;
    this._hp = { x: 0, y: 0, z: 0 };
    this._startT = 0;
    this._openT = 0;
    this._updT = -1;
    this._updates = 0;
    this._pending = false;
    this._quietAt = 0;
    this._activeUntil = -1;
    this._t = { lvl: 0, hp: 0, pk: 0, lp: 0, rough: 0, depth: 0, feather: 0 };
    this._a = { lvl: -1, hp: -1, pk: -1, lp: -1, q: -1, g: -99, rough: -1, depth: -1 };
    this._peakFlow = 0;
    this._steadyFlow = 0.8;
    this._dg = 1; this._df = 1; this._dgT = 1; this._dfT = 1; this._nextDrift = 0;
    this._last = { onset: -1, release: -1, clack: -1, equip: -1, holster: -1, cap: -1, menuOpen: -1, menuClose: -1 };
    this._lastClack = -10;
    this._rate = 0;
    this._sloshOn = false;
    this.equipped = false;
    this._eqT = -10;
    this._hlT = -10;
    this._capT = -10;
    this._menu = false;
    this._hipUntil = 0;
    this._pow = {};
    const sr = this.ctx.sampleRate;
    for (const k of SPRAY_CAP_NAMES) this._pow[k] = chainPower(SPRAY_CAPS[k], sr);
  }

  /** True while the voice is audible (its HRTF panner counts against the engine's HRTF budget). */
  get hrtfActive() { return !!this.n && this._hrtf && (this.on || this.ctx.currentTime < this._activeUntil); }

  // ------------------------------------------------------------------ graph
  _build() {
    if (this.n) return true;
    const B = this.engine.buffers.spray;
    if (!B) return false;
    const E = this.engine, ctx = this.ctx, r = this.rng;
    const now = ctx.currentTime;
    const c = SPRAY_CAPS[this.cap];
    const loop = (buf) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start(now, r.next() * buf.duration);
      return s;
    };
    const bq = (type, f, q, g) => {
      const b = ctx.createBiquadFilter();
      b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g;
      return b;
    };
    const gn = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    this._hrtf = E.maxHrtf >= 1;
    const n = {
      hiss: loop(B.hiss), hp: bq('highpass', c.lo, Q_HP, 0), pk: bq('peaking', c.fc, c.q, c.pkDb), lp: bq('lowpass', c.hi, Q_LP, 0),
      rough: loop(B.rough), roughG: gn(0), am: gn(1), sput: loop(B.sputter), depth: gn(0), env: gn(0),
      slosh: loop(B.slosh), sloshG: gn(0),
      panner: makePanner(ctx, this._hrtf ? 'HRTF' : 'equalpower', 0.6, 1),
      send: gn(LV.send),
    };
    n.hiss.connect(n.hp); n.hp.connect(n.pk); n.pk.connect(n.lp); n.lp.connect(n.am);
    n.rough.connect(n.roughG); n.roughG.connect(n.am);
    n.sput.connect(n.depth); n.depth.connect(n.am.gain);
    n.am.connect(n.env);
    n.env.connect(n.panner); n.env.connect(n.send);
    n.slosh.connect(n.sloshG); n.sloshG.connect(n.panner); n.sloshG.connect(n.send);
    n.panner.connect(E.busSpray);
    n.send.connect(E.oneShotSendIn);
    setPannerPos(n.panner, this._hand(HAND), now, 0);
    this.n = n;
    return true;
  }

  _ok() {
    const E = this.engine;
    return E._ready && !E._paused && this._build();
  }

  /** World position at a listener-relative offset (written into a reused object). */
  _hand(o) {
    const L = this.engine._lis, p = L.pos, f = L.fwd, u = L.up, h = this._hp;
    let rx = f.y * u.z - f.z * u.y, ry = f.z * u.x - f.x * u.z, rz = f.x * u.y - f.y * u.x;
    const rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    h.x = p.x + rx * o.r + f.x * o.f - u.x * o.d;
    h.y = p.y + ry * o.r + f.y * o.f - u.y * o.d;
    h.z = p.z + rz * o.r + f.z * o.f - u.z * o.d;
    return h;
  }

  /** Put the voice at the hand / hip unless the game is feeding the nozzle position. */
  _place(now, o) {
    if (this.on && this._hasPos && now - this._posT < 0.25) return;
    const active = this.on || now < this._activeUntil;
    setPannerPos(this.n.panner, this._hand(o), now, active ? 0.02 : 0);
  }

  _play(buf, gain, rate, when, lp, ui) {
    if (!buf || !(gain > 0)) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    let f = null;
    if (lp > 0) {
      f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.min(lp, ctx.sampleRate * 0.45);
      f.Q.value = Q_LP;
      src.connect(f);
      f.connect(g);
    } else src.connect(g);
    if (ui) g.connect(this.engine.busSpray);
    else { g.connect(this.n.panner); g.connect(this.n.send); }
    src.start(when);
    autoCleanup(src, f ? [g, f] : [g]);
    const end = when + buf.duration / rate + 0.25;
    if (!ui && end > this._activeUntil) this._activeUntil = end;
  }

  _oneShot(name, level, when) {
    const bank = this.engine.buffers.spray[name];
    if (!bank || !bank.length) return;
    const r = this.rng;
    const k = pick(r, bank.length, this._last[name]);
    this._last[name] = k;
    this._play(bank[k], level * dbToGain(r.range(-1.5, 1.5)), r.range(0.97, 1.03), when, 0, name === 'menuOpen' || name === 'menuClose');
  }

  // ------------------------------------------------------------------ spray
  /** Reads flow / cap / distance / position from an options object (no allocation). */
  _read(o) {
    const f = o.flow;
    if (typeof f === 'number' && f === f) this.flow = f < 0 ? 0 : f > 1 ? 1 : f;
    const c = o.cap;
    if (c !== undefined && c !== this.cap && CAP_SET.has(c)) this.cap = c;
    const d = o.distance;
    if (typeof d === 'number' && d === d) this.dist = d < 0 ? 0 : d;
    const p = o.position;
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
      this.pos.x = p.x; this.pos.y = p.y; this.pos.z = p.z;
      this._hasPos = true;
      this._posFresh = true;
      this._posT = this.ctx.currentTime;
    }
  }

  start(o) {
    const E = this.engine;
    if (!E._ready || E._paused) return false;
    const fresh = !this.wanted;
    if (fresh) this.flow = 1; // until a sprayUpdate says otherwise
    if (o) this._read(o);
    if (fresh) {
      this.wanted = true;
      this._startT = this.ctx.currentTime;
      this._updates = 0;
      // the valve opens on the next sprayUpdate (it carries the flow), or after 40 ms without one
      this._pending = true;
    }
    return true;
  }

  update(o) {
    if (o) this._read(o);
    const E = this.engine;
    if (!this.wanted || !E._ready || E._paused) return;
    const now = this.ctx.currentTime;
    this._updT = now;
    this._updates++;
    const wasOn = this.on;
    const wasActive = wasOn || now < this._activeUntil;
    this._valve(now);
    if (this.on && wasOn) this._apply(now);
    if (this._posFresh && this.n) {
      this._posFresh = false;
      setPannerPos(this.n.panner, this.pos, now, wasActive ? 0.012 : 0);
    }
  }

  stop() {
    if (!this.wanted) return;
    this.wanted = false;
    this._pending = false;
    if (this.on) this._close(this.ctx.currentTime, false);
  }

  _valve(now) {
    this._pending = false;
    const open = this.wanted && this.flow > (this.on ? 0.012 : 0.03);
    if (open && !this.on) this._open(now);
    else if (!open && this.on) this._close(now, false);
  }

  /** RMS of the hiss into the panner for flow f at the current cap and distance (without the slow drift). */
  _rmsAt(f) {
    const c = SPRAY_CAPS[this.cap], d = this.dist;
    return LV.hiss * dbToGain(c.db) * Math.pow(f, 0.9) * (1 + 0.2 * splatOf(d)) * (1 - 0.1 * airOf(d));
  }

  /** env gain giving that RMS (the cap's filter chain changes the loop's RMS by sqrt(power)). */
  _levelAt(f) { return this._rmsAt(f) / this._chainRms(); }

  _chainRms() { return SPRAY_LOOP_RMS.hiss * Math.sqrt(this._pow[this.cap]); }

  _targets() {
    const c = SPRAY_CAPS[this.cap], f = this.flow, d = this.dist, T = this._t;
    const splat = splatOf(d), air = airOf(d);
    const feather = sstep(0.32, 0.04, f);
    const sq = Math.sqrt(f);
    T.lvl = this._levelAt(f) * this._dg;
    T.hp = c.lo * (0.85 + 0.15 * sq);
    T.pk = c.fc * (0.8 + 0.2 * sq) * this._df;
    T.lp = c.hi * (0.42 + 0.58 * Math.pow(f, 0.6)) * (1 + 0.06 * splat);
    T.rough = (dbToGain(c.roughDb + 10 * splat - 6 * air + 6 * feather) * this._chainRms()) / SPRAY_LOOP_RMS.rough;
    T.depth = Math.min(0.95, c.sput + 0.75 * feather);
    T.feather = feather;
  }

  _apply(now) {
    const n = this.n, a = this._a, T = this._t, c = SPRAY_CAPS[this.cap];
    this._targets();
    if (this.flow > this._peakFlow) this._peakFlow = this.flow;
    if (rel(T.lvl, a.lvl) > 0.01) { glide(n.env.gain, T.lvl, now, 0.035); a.lvl = T.lvl; }
    if (rel(T.hp, a.hp) > 0.004) { glide(n.hp.frequency, T.hp, now, 0.05); a.hp = T.hp; }
    if (rel(T.pk, a.pk) > 0.003) { glide(n.pk.frequency, T.pk, now, 0.05); a.pk = T.pk; }
    if (rel(T.lp, a.lp) > 0.004) { glide(n.lp.frequency, T.lp, now, 0.05); a.lp = T.lp; }
    if (c.q !== a.q) { glide(n.pk.Q, c.q, now, 0.06); a.q = c.q; }
    if (c.pkDb !== a.g) { glide(n.pk.gain, c.pkDb, now, 0.06); a.g = c.pkDb; }
    if (rel(T.rough, a.rough) > 0.02) { glide(n.roughG.gain, T.rough, now, 0.06); a.rough = T.rough; }
    if (Math.abs(T.depth - a.depth) > 0.01) { glide(n.depth.gain, T.depth, now, 0.06); a.depth = T.depth; }
  }

  _settle(p, v, k, now, quiet) {
    if (quiet) jump(p, v * k, now);
    else hold(p, now);
    p.setTargetAtTime(v, now + 0.002, 0.019);
  }

  _open(now) {
    if (!this._build()) return false;
    const n = this.n, c = SPRAY_CAPS[this.cap], r = this.rng, a = this._a;
    const quiet = now >= this._quietAt;
    this.on = true;
    this._openT = now;
    this._peakFlow = this.flow;
    this._targets();
    const T = this._t;
    hold(n.env.gain, now);
    n.env.gain.setTargetAtTime(T.lvl, now, 0.006);
    // pitch settling over ~60 ms: the band starts low (the "pf") and rises as the jet establishes
    this._settle(n.hp.frequency, T.hp, 0.5, now, quiet);
    this._settle(n.pk.frequency, T.pk, 0.55, now, quiet);
    this._settle(n.lp.frequency, T.lp, 0.6, now, quiet);
    const tc = quiet ? 0 : 0.02;
    glide(n.pk.Q, c.q, now, tc);
    glide(n.pk.gain, c.pkDb, now, tc);
    glide(n.roughG.gain, T.rough, now, tc);
    glide(n.depth.gain, T.depth, now, tc);
    a.lvl = T.lvl; a.hp = T.hp; a.pk = T.pk; a.lp = T.lp; a.q = c.q; a.g = c.pkDb; a.rough = T.rough; a.depth = T.depth;
    // the valve's "pfft", scaled to the flow it opens to (the game ramps the pressure up over ~70 ms, so
    // the first update's flow is low: fall back on the last spray's peak flow)
    const B = this.engine.buffers.spray;
    const k = pick(r, B.onset.length, this._last.onset);
    this._last.onset = k;
    const fo = Math.max(this.flow, this._steadyFlow);
    const g = this._rmsAt(fo) * LV.onset * dbToGain(c.onsetDb + r.range(-1.5, 1.5));
    this._play(B.onset[k], g, c.onsetRate * r.range(0.96, 1.04) * (0.9 + 0.1 * fo), now, 0, false);
    return true;
  }

  _close(now, silent) {
    this.on = false;
    const n = this.n;
    if (!n) return;
    const a = this._a;
    hold(n.env.gain, now);
    n.env.gain.setTargetAtTime(0, now, silent ? 0.05 : 0.022);
    // the pressure drops as the valve seats: the band falls
    if (a.hp > 0) {
      hold(n.hp.frequency, now); n.hp.frequency.setTargetAtTime(a.hp * 0.72, now, 0.035);
      hold(n.pk.frequency, now); n.pk.frequency.setTargetAtTime(a.pk * 0.7, now, 0.035);
      hold(n.lp.frequency, now); n.lp.frequency.setTargetAtTime(a.lp * 0.6, now, 0.045);
    }
    const hissRms = Math.max(0, a.lvl) * this._chainRms();
    a.lvl = a.hp = a.pk = a.lp = a.rough = a.depth = a.q = -1;
    a.g = -99;
    this._quietAt = now + (silent ? 0.45 : 0.3);
    if (now + 0.6 > this._activeUntil) this._activeUntil = now + 0.6;
    if (this._peakFlow > 0.05) this._steadyFlow = this._peakFlow;
    if (silent || !(hissRms > 0)) return;
    // a quick tail with a tiny sputter/spit
    const B = this.engine.buffers.spray, c = SPRAY_CAPS[this.cap], r = this.rng;
    const k = pick(r, B.release.length, this._last.release);
    this._last.release = k;
    this._play(B.release[k], hissRms * LV.release * dbToGain(r.range(-2.5, 1.5)), c.onsetRate * r.range(0.94, 1.06), now, 0, false);
  }

  _drift(now, dt) {
    const c = SPRAY_CAPS[this.cap];
    if (now >= this._nextDrift) {
      const r = this.rng;
      this._dgT = dbToGain(r.range(-0.7, 0.7));
      this._dfT = 1 + r.range(-1, 1) * c.wobble;
      this._nextDrift = now + r.range(c.drift[0], c.drift[1]);
    }
    const k = 1 - Math.exp(-Math.min(0.1, Math.max(0, dt)) / 0.15);
    this._dg += (this._dgT - this._dg) * k;
    this._df += (this._dfT - this._df) * k;
    // without a sprayUpdate this frame, keep the drift moving here
    if (now - this._updT > 0.05) this._apply(now);
  }

  // ------------------------------------------------------------------ rattle / handling
  /** One mixing-ball clack (strength 0..1) plus a liquid swell that follows the shaking rate. */
  rattle(strength) {
    if (!this._ok()) return false;
    let s = typeof strength === 'number' && strength === strength ? strength : 0.7;
    s = clamp01(s);
    if (s < 0.005) return false;
    const now = this.ctx.currentTime;
    const dt = now - this._lastClack;
    if (dt < 0.03) return false; // called every frame: at most ~33 clacks/s
    this._rate = dt < 1 ? this._rate + (1 / dt - this._rate) * 0.45 : 2.5;
    this._lastClack = now;
    this._place(now, HAND);
    const B = this.engine.buffers.spray, r = this.rng;
    const k = pick(r, B.clack.length, this._last.clack);
    const when = now + r.range(0, 0.007);
    const g = LV.clack * Math.pow(s, 1.25) * dbToGain(r.range(-1.5, 1.5));
    const lp = (2400 + 13000 * Math.pow(s, 1.5)) * r.range(0.85, 1.15);
    this._play(B.clack[k], g, r.range(0.965, 1.035), when, lp, false);
    let last = k;
    if (r.chance(0.12 + 0.3 * s)) {
      // the ball bounces back for a second, weaker knock
      last = pick(r, B.clack.length, k);
      this._play(B.clack[last], g * dbToGain(r.range(-17, -9)), r.range(0.96, 1.04), when + r.range(0.012, 0.04), lp * 0.6, false);
    }
    this._last.clack = last;
    this._slosh(now, s);
    return true;
  }

  _slosh(now, s) {
    const n = this.n, r = this.rng;
    const rn = clamp01((this._rate - 1.5) / 7);
    const peak = LV.slosh * (0.3 + 0.7 * s) * (0.55 + 0.45 * rn) * dbToGain(r.range(-2, 2));
    const base = LV.slosh * 0.4 * s * rn;
    const p = n.sloshG.gain;
    hold(p, now);
    p.setTargetAtTime(peak, now + 0.006, 0.022);
    p.setTargetAtTime(base, now + 0.07, 0.08);
    glide(n.slosh.playbackRate, 0.78 + 0.34 * rn + r.range(-0.03, 0.03), now, 0.05);
    this._sloshOn = true;
  }

  equip() {
    if (!this.engine._ready) return false;
    const now = this.ctx.currentTime;
    if ((this.equipped && now - this._eqT < 1.5) || now - this._hlT < 0.12) return false;
    this.equipped = true;
    this._eqT = now;
    if (!this._ok()) return false;
    this._hipUntil = now + 0.3;
    this._place(now, HIP);
    this._oneShot('equip', LV.equip, now);
    return true;
  }

  holster() {
    if (!this.engine._ready) return false;
    const now = this.ctx.currentTime;
    if ((!this.equipped && now - this._hlT < 1.5) || now - this._eqT < 0.12) return false;
    this.equipped = false;
    this._hlT = now;
    if (!this._ok()) return false;
    this._hipUntil = now + 0.7;
    this._place(now, HIP);
    this._oneShot('holster', LV.holster, now);
    return true;
  }

  capChange() {
    if (!this._ok()) return false;
    const now = this.ctx.currentTime;
    if (now - this._capT < 0.12) return false;
    this._capT = now;
    this._place(now, HAND);
    this._oneShot('cap', LV.cap, now);
    return true;
  }

  /** Soft UI tick on menu open/close (edge-triggered, so calling it every frame is fine). Not spatialized. */
  menu(open) {
    open = !!open;
    if (open === this._menu) return false;
    this._menu = open;
    if (!this._ok()) return false;
    this._oneShot(open ? 'menuOpen' : 'menuClose', LV.menu, this.ctx.currentTime);
    return true;
  }

  // ------------------------------------------------------------------ engine hooks
  /** Per frame from AudioEngine.update(). */
  tick(now, dt) {
    if (this._pending && now - this._startT >= 0.04) this._valve(now);
    const n = this.n;
    if (!n) return;
    if (this.on) {
      // updates stopped arriving without a sprayStop: let go (a later sprayUpdate reopens the valve)
      if (this._updates > 0 && now - this._updT > 1.0) this._close(now, false);
      else this._drift(now, dt);
    }
    if (this._sloshOn && now - this._lastClack > 0.35) {
      glide(n.sloshG.gain, 0, now, 0.12);
      this._sloshOn = false;
    }
    if (this.on || now < this._activeUntil) this._place(now, now < this._hipUntil ? HIP : HAND);
  }

  setPaused(paused) {
    const n = this.n;
    if (!n || !paused) return;
    const now = this.ctx.currentTime;
    if (this.on) this._close(now, true);
    if (this._sloshOn) {
      glide(n.sloshG.gain, 0, now, 0.05);
      this._sloshOn = false;
    }
  }

  debug() {
    return {
      built: !!this.n, wanted: this.wanted, on: this.on, cap: this.cap, flow: this.flow, distance: this.dist,
      level: this.on ? this._t.lvl : 0, equipped: this.equipped, hrtf: this.hrtfActive,
      nodes: this.n ? Object.keys(this.n).length : 0,
    };
  }

  dispose() {
    const n = this.n;
    if (!n) return;
    for (const s of [n.hiss, n.rough, n.sput, n.slosh]) { try { s.stop(); } catch (e) { /* ignore */ } }
    for (const k of Object.keys(n)) { try { n[k].disconnect(); } catch (e) { /* ignore */ } }
    this.n = null;
    this.on = false;
    this.wanted = false;
  }
}
