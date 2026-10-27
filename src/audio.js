/**
 * St. Agatha — fully procedural audio (Web Audio API only: no files, no network).
 *
 * Design notes
 *  - Everything is synthesised from a handful of noise buffers (white / pink / brown /
 *    sparse crackle / dense grit) and oscillators, created once per AudioContext.
 *  - Synthesis is factored into "voice builders" that take any BaseAudioContext and a
 *    destination node, so sounds can be rendered offline for testing (see `AudioSynth`).
 *  - The mix is deliberately quiet: room tone + distant wind + sub rumble sit far below
 *    footsteps, drips and lamp buzz, so those carry the space.
 *  - Positional emitters are virtualised: only the nearest MAX_ACTIVE within VIRT_RADIUS
 *    own live nodes; the rest are plain data.
 *
 * World units: metres, Y up. Listener = player's head.
 *
 * Public API (see AudioSystem below):
 *   start() [from a user gesture] · started · setListener(pos, forward) · update(dt, env)
 *   addEmitter(type, pos, opts) -> id · setEmitterLevel(id, level) · footstep(surface, opts)
 *   play(name, pos?, opts?) -> duration (s) · setMasterVolume(v) · suspend() · resume()
 * Extras: removeEmitter(id), setEmitterPosition(id, pos), stats (diagnostics),
 *   new AudioSystem({ hrtf: false }) for cheaper equal-power panning,
 *   start({ context }) to inject an (Offline)AudioContext for tests, and `AudioSynth`
 *   (offline rendering of individual voices).
 * Emitter opts (all types): volume (gain multiplier, default 1). Per type:
 *   drip { rate (drips/min, default 8), pitch?, splash? (0..1) },
 *   buzz { level (default 1), hz (default 100) }, machine { hz (default 50) }, wind { pitch? }.
 * A buzz whose level has been 0 for >1.5 s is parked (no voice) until its level rises again.
 */

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const db = (d) => Math.pow(10, d / 20);
function gauss() {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * Math.random());
}

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------
const MAX_ACTIVE = 10; // emitters instantiated at once
const VIRT_RADIUS = 16; // m, instantiate inside this (effective) distance
const VIRT_RELEASE = 17; // m, hysteresis for tear-down
const REEVAL_INTERVAL = 0.25; // s
const SPAWNS_PER_FRAME = 4; // spread voice creation over frames (teleports, level load)
const MAX_ONESHOTS = 48; // concurrent one-shot voices (safety cap)
const EMITTER_REF = 1.5;
const EMITTER_ROLLOFF = 1.6;
const CREAK_MAKEUP = 6;
// floor occlusion: ramps in over |dy| 2.0..2.5 m (one slab), second slab over 6..7 m
const OCC_A = 2.0;
const OCC_B = 2.5;

// Level calibration (linear, into the mix bus). Tuned by offline measurement.
const MIX_TRIM = 0.52; // compensates DynamicsCompressor auto make-up gain
const ROOM_LEVEL = 0.012;
const AIR_LEVEL = 0.006;
const WIND_BED_LEVEL = 0.14;
const RUMBLE_LEVEL = 0.028;
const FOOTSTEP_LEVEL = 0.55;
const FOOTSTEP_SEND = 0.4;
const ONESHOT_LEVEL = 0.6;
const AMBIENT_EVENT_LEVEL = 0.32;

// ---------------------------------------------------------------------------
// Noise bank + periodic waves (created once per context)
// ---------------------------------------------------------------------------
const NOISE_SECONDS = 4;

function makeLoopBuffer(ctx, gen, normalise) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * NOISE_SECONDS);
  const F = Math.floor(sr * 0.08);
  const x = new Float32Array(n + F);
  gen(x, sr);
  const buf = ctx.createBuffer(1, n, sr);
  const y = buf.getChannelData(0);
  for (let i = 0; i < n; i++) y[i] = x[i];
  // equal-power crossfade of the overhang into the start => seamless loop point
  for (let i = 0; i < F; i++) {
    const w = (i / F) * (Math.PI / 2);
    y[i] = x[i] * Math.sin(w) + x[n + i] * Math.cos(w);
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += y[i];
  mean /= n;
  let sq = 0;
  let pk = 0;
  for (let i = 0; i < n; i++) {
    y[i] -= mean;
    sq += y[i] * y[i];
    pk = Math.max(pk, Math.abs(y[i]));
  }
  const rms = Math.sqrt(sq / n) || 1;
  const s = normalise.rms ? normalise.rms / rms : normalise.peak / (pk || 1);
  for (let i = 0; i < n; i++) y[i] *= s;
  return buf;
}

function genWhite(x) {
  for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1;
}
function genPink(x) {
  // Paul Kellet's refined pink filter
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < x.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    x[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
}
function genBrown(x) {
  let b = 0;
  for (let i = 0; i < x.length; i++) {
    b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    x[i] = b;
  }
}
function genCrackle(density) {
  return (x, sr) => {
    const p = density / sr;
    for (let i = 0; i < x.length; i++) {
      if (Math.random() < p) {
        const a = (Math.random() < 0.5 ? -1 : 1) * (0.12 + 0.88 * Math.pow(Math.random(), 2.5));
        const len = 1 + ((Math.random() * 4) | 0);
        for (let j = 0; j < len && i + j < x.length; j++) x[i + j] += a * Math.pow(0.6, j) * (j % 2 ? -1 : 1);
      }
    }
  };
}

function periodic(ctx, amps, cosine = false) {
  const n = amps.length;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 1; i < n; i++) (cosine ? re : im)[i] = amps[i];
  return ctx.createPeriodicWave(re, im);
}

/** Create the shared noise buffers / periodic waves for a context. */
export function createBank(ctx) {
  const bank = {
    white: makeLoopBuffer(ctx, genWhite, { rms: 0.35 }),
    pink: makeLoopBuffer(ctx, genPink, { rms: 0.35 }),
    brown: makeLoopBuffer(ctx, genBrown, { rms: 0.35 }),
    crackle: makeLoopBuffer(ctx, genCrackle(260), { peak: 0.95 }),
    grit: makeLoopBuffer(ctx, genCrackle(3200), { peak: 0.95 }),
    waves: {},
  };
  // Impulse train (stick-slip excitation for creaks)
  const pulse = new Array(160).fill(1);
  pulse[0] = 0;
  bank.waves.pulse = periodic(ctx, pulse, true);
  // Fluorescent ballast hum: 100 Hz family, slightly odd-heavy
  bank.waves.ballast = periodic(ctx, [0, 1, 0.5, 0.42, 0.2, 0.17, 0.09, 0.08, 0.045, 0.04, 0.025, 0.022, 0.015]);
  // Rich buzz (fed into band-pass + grit modulation)
  const bz = [0];
  for (let k = 1; k < 48; k++) bz.push((k % 2 ? 1 : 0.55) / Math.pow(k, 0.55));
  bank.waves.buzz = periodic(ctx, bz);
  // 50 Hz mains hum with strong 100 Hz
  bank.waves.hum50 = periodic(ctx, [0, 0.55, 1, 0.3, 0.22, 0.07, 0.09, 0.03, 0.035]);
  return bank;
}

// ---------------------------------------------------------------------------
// Reverb impulse responses + soft clip curve
// ---------------------------------------------------------------------------
function makeIR(ctx, o) {
  const sr = ctx.sampleRate;
  const n = Math.ceil(sr * o.dur);
  const buf = ctx.createBuffer(2, n, sr);
  const pre = Math.floor(o.pre * sr);
  let energy = 0;
  const decay = Math.exp(-6.91 / (o.t60 * sr)); // per-sample amplitude decay
  const fadeN = Math.max(1, Math.floor(o.fadeIn * sr));
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    let env = 1;
    let a = 0;
    let comp = 1;
    for (let i = pre, j = 0; i < n; i++, j++) {
      if ((j & 63) === 0) {
        // brightness falls over time (air + soft-surface absorption)
        const fc = o.f1 + (o.f0 - o.f1) * Math.exp(-j / sr / o.fTau);
        a = Math.exp((-TAU * fc) / sr);
        comp = Math.sqrt((1 + a) / (1 - a));
      }
      lp = (1 - a) * (Math.random() * 2 - 1) + a * lp;
      const x = lp * comp * env * (j < fadeN ? j / fadeN : 1);
      d[i] = x;
      energy += x * x;
      env *= decay;
    }
  }
  // discrete early reflections (energy given as a fraction of the diffuse tail)
  const kern = [0.25, 0.75, 1, 0.75, 0.25];
  const kE = kern.reduce((s, k) => s + k * k, 0);
  for (const [et, frac] of o.early) {
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      const idx = pre + Math.floor((et + rand(-0.0012, 0.0012)) * sr);
      const amp = Math.sqrt((frac * energy * 0.5) / kE) * (Math.random() < 0.5 ? -1 : 1);
      for (let k = 0; k < kern.length; k++) if (idx + k < n) d[idx + k] += amp * kern[k];
    }
  }
  // normalise: unit energy per channel
  let e = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) e += d[i] * d[i];
  }
  const s = 1 / Math.sqrt(e / 2 || 1);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] *= s;
  }
  return buf;
}

function softClipCurve(n = 4097, range = 1.5, knee = 0.7, ceil = 0.98) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * range;
    const ax = Math.abs(x);
    const y = ax <= knee ? ax : knee + (ceil - knee) * Math.tanh((ax - knee) / (ceil - knee));
    c[i] = Math.sign(x) * y;
  }
  return c;
}

// ---------------------------------------------------------------------------
// One-shot voice builder
// ---------------------------------------------------------------------------
/**
 * A tiny graph builder for one-shots. Times passed to helpers are absolute
 * (from v.at(offset)); durations/frequencies are nominal and get scaled by
 * the voice's rate R (pitch multiplier; time is divided by R like playbackRate).
 */
class Voice {
  constructor(ctx, bank, dest, t0, rate = 1, vol = 1) {
    this.ctx = ctx;
    this.bank = bank;
    this.t0 = t0;
    this.R = rate > 0 ? rate : 1;
    this.nyq = ctx.sampleRate * 0.5;
    this.out = ctx.createGain();
    this.out.gain.value = vol;
    if (dest) this.out.connect(dest);
    this.bus = this.out;
    this.end = t0;
    this.last = null;
  }
  at(off) {
    return this.t0 + off / this.R;
  }
  T(d) {
    return d / this.R;
  }
  F(f) {
    return clamp(f * this.R, 8, this.nyq * 0.9);
  }
  gain(v, dest) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(dest || this.bus);
    return g;
  }
  filt(type, f, q, dest) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = this.F(f);
    b.Q.value = q != null ? q : type === 'bandpass' ? 1 : 0.707;
    b.connect(dest || this.bus);
    return b;
  }
  /** chain [[type,f,q],...] ending in dest; returns the first node */
  chain(filters, dest) {
    let node = dest || this.bus;
    for (let i = filters.length - 1; i >= 0; i--) {
      const [ty, f, q] = filters[i];
      node = this.filt(ty, f, q, node);
    }
    return node;
  }
  _track(src, tEnd) {
    if (!this.last || tEnd >= this.end) {
      this.end = Math.max(this.end, tEnd);
      this.last = src;
    }
  }
  osc(type, f, t, dur, dest) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type;
    else o.setPeriodicWave(type);
    if (f != null) o.frequency.value = this.F(f);
    o.connect(dest);
    o.start(t);
    o.stop(t + dur);
    this._track(o, t + dur);
    return o;
  }
  noise(kind, t, dur, dest, pr = 1) {
    const s = this.ctx.createBufferSource();
    const buf = this.bank[kind];
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = pr;
    s.connect(dest);
    s.start(t, Math.random() * buf.duration * 0.95);
    s.stop(t + dur);
    this._track(s, t + dur);
    return s;
  }
}

/** attack (linear) -> optional hold -> exponential decay. Returns end time (~-60 dB). */
function ad(p, t, a, peak, tau, hold = 0) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  const td = t + a + hold;
  if (hold > 0) p.setValueAtTime(peak, td);
  p.setTargetAtTime(0, td, tau);
  return td + tau * 7;
}

/** filtered noise hit */
function nhit(v, t, o) {
  const g = v.gain(0, o.dest);
  const input = o.f ? v.chain(o.f, g) : g;
  const end = ad(g.gain, t, v.T(o.a != null ? o.a : 0.0008), o.amp, v.T(o.tau), v.T(o.hold || 0));
  v.noise(o.kind || 'white', t, end - t + 0.005, input, o.pr || 1);
  return end;
}

/** enveloped oscillator, optional exponential sweep f -> f1 */
function tone(v, t, o) {
  const g = v.gain(0, o.dest);
  const end = ad(g.gain, t, v.T(o.a != null ? o.a : 0.0006), o.amp, v.T(o.tau), v.T(o.hold || 0));
  const osc = v.osc(o.type || 'sine', null, t, end - t + 0.005, g);
  osc.frequency.setValueAtTime(v.F(o.f), t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(v.F(o.f1), t + v.T(o.sweep || 0.05));
  return end;
}

/** modal (inharmonic partials) impact: parts = [[ratio, relAmp, tau], ...] */
function modal(v, t, f0, parts, amp, o = {}) {
  const j = o.jit != null ? o.jit : 0.015;
  let end = t;
  for (const [r, a, tau] of parts) {
    end = Math.max(
      end,
      tone(v, t, {
        f: f0 * r * rand(1 - j, 1 + j),
        amp: amp * a * rand(0.75, 1.15),
        tau: tau * (o.tauScale || 1) * rand(0.85, 1.15),
        a: o.a != null ? o.a : 0.0006,
        dest: o.dest,
      }),
    );
  }
  return end;
}

/**
 * Stick-slip friction creak: an impulse train (or saw for squeals) with a jittery,
 * intermittent rate contour, exciting parallel resonant band-passes.
 * o: { rate:[start,mid,end] Hz, formants:[[f,q,amp]...], amp, jitter, stick, att, rel, wave }
 */
function creak(v, t, durN, o) {
  const dur = v.T(durN);
  const N = Math.max(16, Math.ceil(dur * 90));
  const fr = new Float32Array(N);
  const am = new Float32Array(N);
  const [r0, r1, r2] = o.rate;
  const att = o.att != null ? o.att : 0.15;
  const rel = o.rel != null ? o.rel : 0.3;
  const stick = o.stick != null ? o.stick : 0.06;
  const jitter = o.jitter != null ? o.jitter : 0.4;
  let w = 0;
  let gate = 1;
  let gateT = 1;
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    const base = x < 0.5 ? lerp(r0, r1, smoothstep(0, 1, x * 2)) : lerp(r1, r2, smoothstep(0, 1, x * 2 - 1));
    w = w * 0.82 + gauss() * jitter * 0.12;
    fr[i] = Math.max(0.8, base * v.R * (1 + w));
    if (Math.random() < stick) gateT = Math.random() < 0.3 ? rand(0.05, 0.3) : rand(0.6, 1);
    gate += (gateT - gate) * 0.4;
    am[i] = o.amp * smoothstep(0, att, x) * (1 - smoothstep(1 - rel, 1, x)) * gate;
  }
  am[0] = 0;
  am[N - 1] = 0;
  // the normalised impulse train spreads its energy over ~160 harmonics; make up for it
  const g = v.gain(0, v.gain(o.wave ? 1 : CREAK_MAKEUP, o.dest));
  g.gain.setValueCurveAtTime(am, t, dur);
  const bps = o.formants.map(([f, q, a]) => v.filt('bandpass', f, q, v.gain(a, g)));
  const osc = v.osc(o.wave || v.bank.waves.pulse, null, t, dur + 0.01, bps[0]);
  for (let i = 1; i < bps.length; i++) osc.connect(bps[i]);
  osc.frequency.setValueCurveAtTime(fr, t, dur);
  return t + dur + 0.01;
}

/** irregular envelope from a list of [time(s), amp, tau] grains, as a value curve */
function grainCurve(param, t, dur, grains, rate = 500) {
  const N = Math.max(8, Math.ceil(dur * rate));
  const c = new Float32Array(N);
  for (const [gt, ga, gtau] of grains) {
    const i0 = Math.floor((gt / dur) * (N - 1));
    for (let i = Math.max(0, i0); i < N; i++) {
      const dt = ((i - i0) / (N - 1)) * dur;
      const e = ga * Math.exp(-dt / gtau);
      if (e < ga * 0.002) break;
      c[i] += i === i0 ? ga * 0.6 : e;
    }
  }
  c[0] = 0;
  c[N - 1] = 0;
  param.setValueCurveAtTime(c, t, dur);
}

// --- shared little sound elements ------------------------------------------
const doorFormants = (s) => [
  [380 * s, 7, 1],
  [920 * s, 9, 0.75],
  [1750 * s, 11, 0.45],
  [3000 * s, 12, 0.22],
];

function latchClick(v, t, amp, p = 1) {
  nhit(v, t, { amp: 0.35 * amp, tau: 0.002, f: [['bandpass', 3800 * p, 1.2]] });
  modal(v, t, 2100 * p, [[1, 1, 0.018], [1.73, 0.6, 0.012], [2.91, 0.35, 0.008]], 0.1 * amp);
}

function switchClick(v, t, amp, p) {
  nhit(v, t, { amp: 0.5 * amp, a: 0.0002, tau: 0.0012, f: [['bandpass', 4300 * p, 1.4]] });
  tone(v, t, { f: 2300 * p * rand(0.97, 1.03), amp: 0.06 * amp, tau: 0.005 });
  tone(v, t, { f: 5200 * p, amp: 0.03 * amp, tau: 0.0025 });
}

function pebbles(v, t, n, spread, amp) {
  for (let i = 0; i < n; i++) {
    nhit(v, t + v.T(rand(0, spread)), {
      amp: amp * rand(0.35, 1),
      a: 0.0003,
      tau: rand(0.002, 0.005),
      f: [['bandpass', rand(1600, 4800), 4]],
    });
  }
}

function debrisTexture(v, t, amp, durN, fc = 2200) {
  const dur = v.T(durN);
  const out = v.gain(amp);
  const grains = [];
  let x = 0;
  while (x < durN * 0.85) {
    grains.push([v.T(x), rand(0.25, 1) * Math.exp(-x / (durN * 0.45)), v.T(rand(0.006, 0.025))]);
    x += rand(0.004, 0.03);
  }
  const g = v.gain(0, out);
  grainCurve(g.gain, t, dur, grains);
  v.noise('grit', t, dur + 0.01, v.chain([['bandpass', fc, 0.8]], g));
  const g2 = v.gain(0, out);
  grainCurve(g2.gain, t, dur, grains.filter(() => Math.random() < 0.5).map(([a, b, c]) => [a, b, c * 1.5]));
  v.noise('crackle', t, dur + 0.01, v.chain([['bandpass', fc * 0.5, 1]], g2));
}

function dripDrop(v, t, f, amp) {
  nhit(v, t, { amp: 0.05 * amp, a: 0.0002, tau: 0.0008, f: [['highpass', 2500]] });
  return tone(v, t, {
    f,
    f1: f * rand(1.35, 2.0),
    sweep: rand(0.012, 0.03),
    amp: 0.2 * amp,
    a: 0.0012,
    tau: rand(0.018, 0.04),
  });
}

function dripSplash(v, t, f, amp) {
  nhit(v, t, { amp: 0.11 * amp, a: 0.002, tau: 0.028, f: [['bandpass', rand(2500, 4500), 0.9]] });
  const n = randi(1, 3);
  for (let i = 0; i < n; i++) {
    const ff = f * rand(1.3, 2.2);
    tone(v, t + rand(0.01, 0.07), { f: ff, f1: ff * rand(1.3, 1.7), sweep: 0.02, amp: 0.1 * amp * rand(0.5, 1), tau: 0.014 });
  }
}

function pipeTick(v, t, amp) {
  nhit(v, t, { amp: 0.2 * amp, a: 0.0003, tau: 0.0015, f: [['bandpass', rand(2500, 4000), 2]] });
  modal(v, t, rand(1800, 2600), [[1, 1, 0.022], [2.1, 0.5, 0.012]], 0.06 * amp);
}

function pipeKnock(v, t, amp) {
  modal(v, t, rand(170, 320), [[1, 1, 0.2], [2.76, 0.5, 0.08], [5.4, 0.22, 0.04]], 0.13 * amp);
  nhit(v, t, { kind: 'brown', amp: 0.25 * amp, a: 0.002, tau: 0.03, f: [['lowpass', 420]] });
}

function structCreak(v, t, amp = 1) {
  if (Math.random() < 0.55) {
    const d = rand(0.5, 1.4);
    creak(v, t, d, {
      rate: [rand(8, 15), rand(25, 55), rand(12, 25)],
      jitter: 0.5,
      formants: doorFormants(rand(0.7, 1.1)),
      amp: 0.42 * amp,
    });
    return d;
  }
  const d = rand(1.4, 2.8);
  creak(v, t, d, {
    rate: [rand(4, 8), rand(10, 20), rand(5, 9)],
    jitter: 0.4,
    formants: [
      [rand(110, 150), 6, 1],
      [rand(230, 290), 7, 0.7],
      [rand(420, 520), 8, 0.4],
      [rand(800, 950), 9, 0.2],
    ],
    amp: 0.6 * amp,
    att: 0.25,
    rel: 0.35,
  });
  return d;
}

function ballastTick(v, t) {
  nhit(v, t, { amp: 0.16, a: 0.0002, tau: 0.001, f: [['bandpass', 3500, 1]] });
  tone(v, t, { f: 100, amp: 0.06, a: 0.001, tau: 0.01 });
}

function arcCrackle(v, t) {
  nhit(v, t, { kind: 'grit', amp: 0.08, a: 0.001, tau: 0.008, f: [['bandpass', 3000, 0.8]] });
}

// ---------------------------------------------------------------------------
// Footsteps
// ---------------------------------------------------------------------------
const FOOTSTEPS = {
  // crisp hard heel click on ceramic + short tile "tock"
  tile(v, p, t) {
    const { k, b } = p;
    nhit(v, t, { amp: 1.2 * k, tau: 0.004, f: [['bandpass', 3400 * b, 0.9]] });
    nhit(v, t, { amp: 0.65 * k * b, a: 0.0003, tau: 0.002, f: [['highpass', 5000 * b]] });
    tone(v, t, { f: rand(950, 1250), amp: 0.12 * k, tau: 0.012 });
    tone(v, t, { f: rand(2500, 3100), amp: 0.07 * k * b, tau: 0.007 });
    tone(v, t, { f: 150, f1: 70, sweep: 0.04, amp: 0.12 * k, a: 0.002, tau: 0.02 });
    const t2 = t + v.T(p.gap);
    nhit(v, t2, { amp: 0.85 * k * p.toe, tau: 0.0025, f: [['bandpass', 4200 * b, 1.1]] });
    tone(v, t2, { f: rand(1100, 1400), amp: 0.07 * k * p.toe, tau: 0.008 });
    if (Math.random() < 0.3) nhit(v, t2, { kind: 'grit', amp: 0.1 * k, a: 0.01, tau: 0.02, f: [['bandpass', 5000, 0.8]] });
  },
  // dull thud + gritty scuff
  concrete(v, p, t) {
    const { k, b } = p;
    nhit(v, t, { amp: 0.55 * k, a: 0.0015, tau: 0.022, f: [['lowpass', 520 * b]] });
    tone(v, t, { f: 95, f1: 52, sweep: 0.05, amp: 0.14 * k, a: 0.002, tau: 0.028 });
    nhit(v, t, { amp: 0.6 * k, tau: 0.004, f: [['bandpass', 2000 * b, 1]] });
    nhit(v, t + 0.004, { kind: 'grit', amp: 1.6 * k, a: 0.005, tau: 0.035, f: [['bandpass', 1600 * b, 0.9]] });
    nhit(v, t + 0.006, { amp: 0.25 * k, a: 0.01, tau: 0.04, f: [['bandpass', 1200 * b, 0.7]] });
    const t2 = t + v.T(p.gap);
    nhit(v, t2, { kind: 'grit', amp: 1.4 * k * p.toe, a: 0.014, tau: 0.045, f: [['bandpass', 2300 * b, 0.8]] });
    nhit(v, t2, { amp: 0.2 * k * p.toe, a: 0.012, tau: 0.04, f: [['bandpass', 1500 * b, 0.7]] });
    nhit(v, t2, { amp: 0.25 * k * p.toe, a: 0.002, tau: 0.015, f: [['lowpass', 600 * b]] });
  },
  // soft muffled thump, faint fabric swish
  carpet(v, p, t) {
    const { k } = p;
    nhit(v, t, { kind: 'brown', amp: 0.35 * k, a: 0.007, tau: 0.035, f: [['lowpass', 260]] });
    tone(v, t, { f: 75, f1: 55, sweep: 0.05, amp: 0.08 * k, a: 0.005, tau: 0.03 });
    nhit(v, t + 0.01, { amp: 0.04 * k, a: 0.02, tau: 0.04, f: [['bandpass', 1800, 0.6], ['lowpass', 3000]] });
    const t2 = t + v.T(p.gap);
    nhit(v, t2, { kind: 'brown', amp: 0.2 * k * p.toe, a: 0.01, tau: 0.03, f: [['lowpass', 300]] });
  },
  // clang: inharmonic plate modes + hollow boom (stairs / elevator car)
  metal(v, p, t) {
    const { k, b } = p;
    nhit(v, t, { amp: 0.8 * k, tau: 0.003, f: [['bandpass', 4500 * b, 0.8]] });
    const f0 = rand(210, 340);
    const ring = rand(0.22, 0.4);
    const ratios = [1, 1.58, 2.37, 3.11, 4.29, 5.67, 7.23];
    const amps = [0.17, 0.18, 0.16, 0.14, 0.11, 0.08, 0.06];
    const parts = ratios.map((r, i) => [r * rand(0.97, 1.03), amps[i] * Math.pow(b, i / 3), ring / (1 + i * 0.35)]);
    modal(v, t, f0, parts, 0.4 * k);
    tone(v, t, { f: rand(85, 105), f1: 72, sweep: 0.08, amp: 0.18 * k, a: 0.002, tau: 0.07 });
    const t2 = t + v.T(p.gap);
    nhit(v, t2, { amp: 0.45 * k * p.toe, tau: 0.0025, f: [['bandpass', 5000 * b, 0.8]] });
    modal(v, t2, f0 * rand(1.0, 1.08), parts.slice(1, 4).map(([r, a, tau]) => [r, a, tau * 0.6]), 0.32 * k * p.toe);
  },
  // shard crunch + tinkles
  glass(v, p, t) {
    const { k, b } = p;
    nhit(v, t, { amp: 0.45 * k, a: 0.002, tau: 0.022, f: [['lowpass', 420]] });
    nhit(v, t, { kind: 'crackle', amp: 1.6 * k, a: 0.003, hold: 0.025, tau: 0.045, f: [['highpass', 2500], ['bandpass', 5200 * b, 0.7]] });
    const t2 = t + v.T(p.gap);
    nhit(v, t2, { kind: 'crackle', amp: 0.8 * k * p.toe * 1.5, a: 0.006, hold: 0.02, tau: 0.05, f: [['highpass', 2200], ['bandpass', 4200 * b, 0.8]] });
    const n = p.crouch ? randi(2, 3) : randi(3, 6);
    for (let i = 0; i < n; i++) {
      tone(v, t + v.T(rand(0.0, 0.22)), { f: rand(3200, 7600), amp: rand(0.03, 0.09) * k, tau: rand(0.012, 0.045) });
    }
  },
  // slap + filtered splash + slosh + bubbles
  water(v, p, t) {
    const { k, b } = p;
    nhit(v, t, { amp: 0.75 * k, a: 0.001, tau: 0.014, f: [['lowpass', 1400 * b]] });
    const g = v.gain(0);
    const end = ad(g.gain, t, v.T(0.008), 0.55 * k, v.T(0.07), v.T(0.03));
    const bp = v.filt('bandpass', 900, 0.9, g);
    bp.frequency.setValueAtTime(v.F(900 * b), t);
    bp.frequency.exponentialRampToValueAtTime(v.F(2900 * b), t + v.T(0.12));
    v.noise('white', t, end - t, bp);
    nhit(v, t + v.T(0.04), { kind: 'brown', amp: 0.9 * k, a: 0.06, tau: 0.11, f: [['bandpass', rand(420, 620), 1.2]] });
    const n = randi(2, 4);
    for (let i = 0; i < n; i++) {
      const f = rand(500, 1400);
      tone(v, t + v.T(rand(0.02, 0.22)), { f, f1: f * rand(1.4, 1.8), sweep: rand(0.025, 0.05), amp: rand(0.05, 0.11) * k, tau: rand(0.02, 0.04) });
    }
    const t2 = t + v.T(p.gap * 1.3);
    nhit(v, t2, { amp: 0.3 * k * p.toe, a: 0.004, tau: 0.04, f: [['bandpass', 1600 * b, 0.8]] });
  },
  // gritty plaster/rubble crunch + skittering bits
  debris(v, p, t) {
    const { k, b } = p;
    nhit(v, t, { amp: 0.4 * k, a: 0.002, tau: 0.026, f: [['lowpass', 450]] });
    tone(v, t, { f: 82, f1: 55, sweep: 0.05, amp: 0.12 * k, a: 0.002, tau: 0.025 });
    debrisTexture(v, t, 2.4 * k, rand(0.18, 0.26), 2400 * b);
    pebbles(v, t + v.T(0.04), p.crouch ? 1 : randi(1, 3), 0.25, 0.35 * k);
    const t2 = t + v.T(p.gap);
    nhit(v, t2, { kind: 'grit', amp: 1.1 * k * p.toe, a: 0.004, tau: 0.04, f: [['bandpass', 1900 * b, 0.9]] });
  },
  // hollow board knock
  wood(v, p, t) {
    const { k, b } = p;
    const f1 = rand(230, 300);
    tone(v, t, { f: f1, amp: 0.26 * k, a: 0.001, tau: 0.05 });
    tone(v, t, { f: f1 * rand(2.3, 2.55), amp: 0.2 * k, tau: 0.03 });
    tone(v, t, { f: f1 * rand(3.9, 4.3), amp: 0.08 * k * b, tau: 0.016 });
    nhit(v, t, { amp: 0.8 * k, tau: 0.004, f: [['bandpass', 1500 * b, 1.2]] });
    nhit(v, t, { amp: 0.35 * k, a: 0.002, tau: 0.03, f: [['bandpass', rand(330, 400), 4]] });
    nhit(v, t, { amp: 0.4 * k * b, a: 0.001, tau: 0.018, f: [['bandpass', rand(650, 800), 3]] });
    const t2 = t + v.T(p.gap);
    tone(v, t2, { f: f1 * rand(1.05, 1.15), amp: 0.18 * k * p.toe, a: 0.001, tau: 0.035 });
    nhit(v, t2, { amp: 0.22 * k * p.toe, tau: 0.003, f: [['bandpass', 1800 * b, 1.2]] });
    if (Math.random() < 0.12) {
      creak(v, t + v.T(0.03), rand(0.18, 0.3), {
        rate: [rand(25, 35), rand(40, 60), rand(30, 40)],
        jitter: 0.5,
        formants: doorFormants(rand(0.9, 1.3)),
        amp: 0.08 * k,
        att: 0.2,
        rel: 0.4,
      });
    }
  },
};

/**
 * Render one footstep into `dest` starting at time t. Works with any BaseAudioContext.
 * Returns the Voice (v.end = end time) or null for an unknown surface.
 */
function renderFootstep(ctx, bank, dest, t, surface, opts = {}) {
  const fn = FOOTSTEPS[surface];
  if (!fn) return null;
  const speed = clamp(opts.speed != null ? +opts.speed || 0 : 0.5, 0, 1);
  const crouch = !!opts.crouch;
  const v = new Voice(ctx, bank, dest, t, rand(0.93, 1.07), FOOTSTEP_LEVEL * (opts.volume != null ? opts.volume : 1));
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = clamp(crouch ? rand(3000, 4200) : lerp(5000, 13000, speed) * rand(0.85, 1.15), 400, v.nyq * 0.9);
  lp.Q.value = 0.5;
  lp.connect(v.out);
  v.bus = lp;
  let k = lerp(0.6, 1.25, speed);
  let b = lerp(0.82, 1.22, speed);
  if (crouch) {
    k *= 0.32;
    b *= 0.7;
  }
  k *= db(rand(-1.5, 1.5));
  b *= rand(0.9, 1.1);
  const p = {
    speed,
    crouch,
    k,
    b,
    gap: crouch ? rand(0.12, 0.17) : lerp(0.11, 0.055, speed) * rand(0.85, 1.15),
    toe: crouch ? rand(0.3, 0.45) : rand(0.35, 0.6),
  };
  fn(v, p, t);
  return v;
}

// ---------------------------------------------------------------------------
// One-shots
// ---------------------------------------------------------------------------
const SOUNDS = {
  door_open(v, t) {
    latchClick(v, t, 1.0);
    latchClick(v, v.at(0.075), 0.7, 0.75);
    nhit(v, v.at(0.08), { kind: 'brown', amp: 0.4, a: 0.002, tau: 0.03, f: [['lowpass', 320]] });
    creak(v, v.at(0.17), rand(0.95, 1.15), {
      rate: [rand(9, 14), rand(30, 45), rand(16, 24)],
      jitter: 0.45,
      formants: doorFormants(rand(0.9, 1.1)),
      amp: 0.6,
    });
    creak(v, v.at(rand(0.35, 0.5)), rand(0.45, 0.65), {
      wave: 'sawtooth',
      rate: [rand(480, 560), rand(640, 760), rand(540, 620)],
      jitter: 0.12,
      stick: 0.15,
      formants: [[1500, 2.5, 1], [2900, 4, 0.5]],
      amp: 0.045,
      att: 0.3,
      rel: 0.4,
    });
    nhit(v, v.at(0.3), { kind: 'brown', amp: 0.2, a: 0.35, tau: 0.12, f: [['lowpass', 260]] });
  },
  door_close(v, t) {
    creak(v, t, rand(0.45, 0.6), {
      rate: [rand(18, 26), rand(14, 20), rand(8, 12)],
      jitter: 0.4,
      formants: doorFormants(rand(0.8, 0.9)),
      amp: 0.55,
      att: 0.25,
      rel: 0.25,
    });
    nhit(v, v.at(0.1), { kind: 'brown', amp: 0.15, a: 0.25, tau: 0.08, f: [['lowpass', 240]] });
    const th = v.at(rand(0.55, 0.62));
    tone(v, th, { f: 78, f1: 46, sweep: 0.08, amp: 0.32, a: 0.002, tau: 0.06 });
    nhit(v, th, { kind: 'brown', amp: 0.45, a: 0.002, tau: 0.05, f: [['lowpass', 380]] });
    nhit(v, th, { amp: 0.14, tau: 0.01, f: [['bandpass', 900, 1.2]] });
    latchClick(v, th + v.T(0.025), 0.75, 1.15);
    latchClick(v, th + v.T(0.065), 0.35, 1.05);
  },
  door_locked(v, t) {
    let tt = t;
    const n = randi(3, 5);
    for (let i = 0; i < n; i++) {
      const a = i === 0 ? 1 : rand(0.5, 0.95);
      nhit(v, tt, { amp: 0.35 * a, tau: 0.003, f: [['bandpass', rand(2600, 3600), 1.3]] });
      modal(v, tt, rand(1250, 1650), [[1, 1, 0.03], [1.47, 0.7, 0.022], [2.23, 0.45, 0.014], [3.4, 0.25, 0.009]], 0.13 * a);
      if (i % 2 === 0) nhit(v, tt + 0.004, { kind: 'brown', amp: 0.35 * a, a: 0.002, tau: 0.025, f: [['lowpass', 300]] });
      tt += v.T(rand(0.06, 0.12));
    }
  },
  door_barricaded(v, t) {
    tone(v, t, { f: 58, f1: 38, sweep: 0.12, amp: 0.45, a: 0.003, tau: 0.11 });
    nhit(v, t, { kind: 'brown', amp: 0.7, a: 0.003, tau: 0.08, f: [['lowpass', 320]] });
    nhit(v, t, { amp: 0.18, tau: 0.02, f: [['bandpass', 650, 1.0]] });
    for (let i = 0; i < 2; i++) {
      nhit(v, v.at(0.015 + i * rand(0.03, 0.06)), { amp: 0.14, tau: 0.004, f: [['bandpass', rand(1100, 1900), 2.5]] });
    }
    creak(v, v.at(0.1), rand(0.8, 1.0), {
      rate: [rand(6, 9), rand(13, 18), rand(7, 10)],
      jitter: 0.35,
      formants: [[180, 6, 1], [340, 7, 0.8], [640, 9, 0.5], [1150, 10, 0.25]],
      amp: 0.75,
      att: 0.2,
      rel: 0.4,
    });
    nhit(v, v.at(0.25), { kind: 'crackle', amp: 0.1, a: 0.12, tau: 0.2, f: [['bandpass', 2800, 0.7]] });
    const t2 = v.at(rand(0.95, 1.1));
    tone(v, t2, { f: 70, f1: 50, sweep: 0.06, amp: 0.22, a: 0.003, tau: 0.05 });
    nhit(v, t2, { kind: 'brown', amp: 0.35, a: 0.003, tau: 0.04, f: [['lowpass', 300]] });
  },
  flashlight_on(v, t) {
    switchClick(v, t, 1.0, 1.0);
    switchClick(v, v.at(rand(0.016, 0.024)), 0.7, 0.82);
  },
  flashlight_off(v, t) {
    switchClick(v, t, 0.85, 0.85);
    switchClick(v, v.at(rand(0.02, 0.028)), 0.6, 0.72);
  },
  paper(v, t) {
    const durN = rand(0.65, 0.9);
    const dur = v.T(durN);
    const grains = [];
    let x = 0.01;
    while (x < durN * 0.9) {
      grains.push([v.T(x), rand(0.3, 1), v.T(rand(0.008, 0.035))]);
      x += rand(0.015, 0.09);
    }
    const g = v.gain(0, v.gain(1.6));
    grainCurve(g.gain, t, dur, grains);
    const bp = v.filt('bandpass', 3500, 0.7, g);
    const fc = new Float32Array(Math.max(8, Math.ceil(dur * 60)));
    let f = rand(2500, 5000);
    for (let i = 0; i < fc.length; i++) {
      if (Math.random() < 0.25) f = rand(2200, 6000);
      fc[i] = v.F(f);
    }
    bp.frequency.setValueCurveAtTime(fc, t, dur);
    v.noise('crackle', t, dur + 0.01, v.chain([['highpass', 1500]], bp));
    v.noise('white', t, dur + 0.01, v.chain([['highpass', 1500]], v.gain(0.12, bp)));
    // page swish
    const ts = v.at(rand(0.15, 0.35));
    const sg = v.gain(0);
    const end = ad(sg.gain, ts, v.T(0.08), 0.15, v.T(0.08));
    const sbp = v.filt('bandpass', 1200, 0.8, sg);
    sbp.frequency.setValueAtTime(v.F(1200), ts);
    sbp.frequency.exponentialRampToValueAtTime(v.F(3600), ts + v.T(0.25));
    v.noise('white', ts, end - ts, sbp);
  },
  land_hard(v, t) {
    tone(v, t, { f: 64, f1: 34, sweep: 0.14, amp: 0.45, a: 0.003, tau: 0.1 });
    nhit(v, t, { kind: 'brown', amp: 0.7, a: 0.003, tau: 0.09, f: [['lowpass', 240]] });
    nhit(v, t, { amp: 0.3, a: 0.001, tau: 0.018, f: [['lowpass', 1000]] });
    nhit(v, v.at(0.01), { amp: 0.08, a: 0.01, tau: 0.05, f: [['bandpass', 1500, 0.7]] });
    debrisTexture(v, v.at(0.005), 0.9, 0.4, 2200);
    pebbles(v, v.at(0.06), randi(3, 5), 0.5, 0.4);
  },
  ladder_step(v, t) {
    nhit(v, t, { amp: 0.3, tau: 0.002, f: [['bandpass', 3600, 1]] });
    modal(v, t, rand(560, 680), [[1, 1, 0.09], [2.76, 0.55, 0.05], [5.4, 0.28, 0.03], [8.93, 0.12, 0.018]], 0.24);
    nhit(v, t, { kind: 'brown', amp: 0.35, a: 0.002, tau: 0.025, f: [['lowpass', 320]] });
  },
  flicker_click(v, t) {
    nhit(v, t, { amp: 0.3, a: 0.0002, tau: 0.0009, f: [['highpass', 3500]] });
    tone(v, t, { f: rand(5600, 6800), amp: 0.04, tau: 0.004 });
    tone(v, v.at(0.002), { f: 100, amp: 0.1, a: 0.001, tau: 0.014 });
    if (Math.random() < 0.5) nhit(v, v.at(rand(0.012, 0.03)), { amp: 0.12, a: 0.0002, tau: 0.0008, f: [['highpass', 4000]] });
  },
  distant_creak(v, t) {
    v.bus = v.filt('lowpass', 480, 0.5, v.out);
    const d = rand(2.2, 3.6);
    creak(v, t, d, {
      rate: [rand(4, 6), rand(9, 15), rand(4, 7)],
      jitter: 0.35,
      stick: 0.05,
      formants: [
        [rand(85, 110), 5, 1],
        [rand(160, 190), 6, 0.8],
        [rand(290, 340), 7, 0.55],
        [rand(500, 560), 8, 0.3],
      ],
      amp: 0.6,
      att: 0.3,
      rel: 0.4,
    });
    if (Math.random() < 0.4) tone(v, v.at(d * rand(0.8, 1.0)), { f: 52, f1: 40, sweep: 0.1, amp: 0.25, a: 0.004, tau: 0.08 });
  },
  distant_door(v, t) {
    v.bus = v.filt('lowpass', 750, 0.5, v.out);
    const d = rand(1.2, 1.7);
    creak(v, t, d, {
      rate: [rand(8, 11), rand(15, 22), rand(9, 13)],
      jitter: 0.4,
      formants: doorFormants(rand(0.85, 1.0)),
      amp: 0.6,
      att: 0.25,
      rel: 0.25,
    });
    const th = v.at(d + rand(0.05, 0.2));
    tone(v, th, { f: 64, f1: 44, sweep: 0.08, amp: 0.2, a: 0.003, tau: 0.08 });
    nhit(v, th, { kind: 'brown', amp: 0.3, a: 0.003, tau: 0.06, f: [['lowpass', 280]] });
  },
  distant_metal(v, t) {
    v.bus = v.filt('lowpass', 1200, 0.6, v.out);
    const n = Math.random() < 0.45 ? 1 : randi(2, 3);
    const f0 = rand(140, 260);
    let tt = t;
    for (let i = 0; i < n; i++) {
      const a = i ? rand(0.5, 0.9) : 1;
      modal(v, tt, f0 * rand(0.97, 1.03), [[1, 1, 0.5], [1.52, 0.4, 0.35], [2.76, 0.6, 0.28], [5.4, 0.3, 0.12]], 0.16 * a);
      nhit(v, tt, { amp: 0.25 * a, tau: 0.006, f: [['bandpass', 900, 1.2]] });
      tt += v.T(rand(0.35, 0.9));
    }
  },
  elevator_groan(v, t) {
    v.bus = v.filt('lowpass', 900, 0.5, v.out);
    const d = rand(4.5, 6.5);
    const dur = v.T(d);
    creak(v, t, d, {
      rate: [rand(2.5, 4), rand(6, 10), rand(3, 5)],
      jitter: 0.3,
      stick: 0.04,
      formants: [
        [rand(130, 150), 14, 1],
        [rand(220, 245), 16, 0.8],
        [rand(360, 385), 18, 0.6],
        [rand(600, 630), 20, 0.35],
      ],
      amp: 0.6,
      att: 0.25,
      rel: 0.35,
    });
    // slow beating metal moan
    const lp = v.filt('lowpass', 320, 0.7);
    for (const [f, a] of [[rand(44, 50), 1], [rand(71, 78), 0.7], [rand(118, 126), 0.45]]) {
      const g = v.gain(0, lp);
      const N = 64;
      const c = new Float32Array(N);
      const ph = rand(0, TAU);
      const sp = rand(1.5, 3.5);
      for (let i = 0; i < N; i++) {
        const x = i / (N - 1);
        c[i] = 0.07 * a * smoothstep(0, 0.35, x) * (1 - smoothstep(0.6, 1, x)) * (0.6 + 0.4 * Math.sin(ph + x * sp * TAU));
      }
      c[0] = 0;
      c[N - 1] = 0;
      g.gain.setValueCurveAtTime(c, t, dur);
      const o = v.osc('triangle', null, t, dur + 0.01, g);
      o.frequency.setValueAtTime(v.F(f), t);
      o.frequency.linearRampToValueAtTime(v.F(f * rand(0.95, 1.05)), t + dur);
    }
    const rg = v.gain(0);
    const re = ad(rg.gain, t, dur * 0.4, 0.35, dur * 0.12, dur * 0.2);
    v.noise('brown', t, re - t, v.chain([['lowpass', 90]], rg));
    if (Math.random() < 0.5) modal(v, v.at(d * rand(0.6, 0.85)), rand(170, 200), [[1, 1, 0.7], [2.32, 0.4, 0.35]], 0.05);
  },
  whisper_wind(v, t) {
    const d = rand(2.8, 4.2);
    const dur = v.T(d);
    v.bus = v.filt('lowpass', 5000, 0.5, v.out);
    const vowels = [
      [730, 1090, 2440],
      [570, 840, 2410],
      [300, 870, 2240],
      [530, 1840, 2480],
      [400, 1700, 2500],
    ];
    const ia = randi(0, vowels.length - 1);
    let ib = randi(0, vowels.length - 2);
    if (ib >= ia) ib++;
    const A = vowels[ia];
    const B = vowels[ib];
    const env = v.gain(0);
    const N = Math.max(32, Math.ceil(dur * 60));
    const c = new Float32Array(N);
    const syl = rand(2.5, 4);
    const ph = rand(0, TAU);
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1);
      const sw = smoothstep(0, 0.42, x) * (1 - smoothstep(0.5, 1, x));
      c[i] = sw * (1 + 0.22 * Math.sin(ph + x * d * syl * TAU) * smoothstep(0.15, 0.5, x));
    }
    c[0] = 0;
    c[N - 1] = 0;
    env.gain.setValueCurveAtTime(c, t, dur);
    const qs = [6, 9, 10];
    const gs = [1, 0.6, 0.3];
    const split = v.ctx.createGain(); // fan-out node for the formant bank
    v.noise('pink', t, dur + 0.01, split);
    for (let k = 0; k < 3; k++) {
      const g = v.gain(gs[k] * 0.9, env);
      const bp = v.filt('bandpass', A[k], qs[k], g);
      const fc = new Float32Array(24);
      let drift = 0;
      for (let i = 0; i < fc.length; i++) {
        const x = i / (fc.length - 1);
        drift = drift * 0.7 + gauss() * 0.03;
        fc[i] = v.F(lerp(A[k], B[k], smoothstep(0.2, 0.85, x)) * (1 + drift));
      }
      bp.frequency.setValueCurveAtTime(fc, t, dur);
      split.connect(bp);
    }
    v.noise('white', t, dur + 0.01, v.chain([['highpass', 2500], ['bandpass', 5500, 0.6]], v.gain(0.12, env)));
  },
};

// per-sound mix metadata: reverb send and dry level (positional chain)
const SOUND_META = {
  door_open: { send: 0.42 },
  door_close: { send: 0.42 },
  door_locked: { send: 0.35 },
  door_barricaded: { send: 0.45 },
  flashlight_on: { send: 0.04 },
  flashlight_off: { send: 0.04 },
  paper: { send: 0.06 },
  land_hard: { send: 0.45 },
  ladder_step: { send: 0.4 },
  flicker_click: { send: 0.15 },
  distant_creak: { send: 1.0, dry: 0.45 },
  distant_door: { send: 1.0, dry: 0.4 },
  distant_metal: { send: 1.0, dry: 0.45 },
  elevator_groan: { send: 0.6, dry: 0.75 },
  whisper_wind: { send: 0.55, dry: 0.7 },
};

/**
 * Render a named one-shot into `dest` at time t. Works with any BaseAudioContext.
 * Returns the Voice (v.end = end time) or null for an unknown name.
 */
function renderOneShot(ctx, bank, dest, t, name, opts = {}) {
  const fn = SOUNDS[name];
  if (!fn) return null;
  const rate = clamp(opts.rate != null ? +opts.rate || 1 : 1, 0.25, 4);
  const vol = clamp(opts.volume != null ? +opts.volume || 0 : 1, 0, 4);
  const v = new Voice(ctx, bank, dest, t, rate, vol * ONESHOT_LEVEL);
  fn(v, t);
  return v;
}

// ---------------------------------------------------------------------------
// Positional emitter types
// ---------------------------------------------------------------------------
const buzzLevelGain = (l) => (l <= 0 ? 0 : Math.pow(clamp(l, 0, 1), 0.6));

function bufSrc(ctx, buf, pr = 1) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.playbackRate.value = pr;
  return s;
}
function mkGain(ctx, v, dest) {
  const g = ctx.createGain();
  g.gain.value = v;
  if (dest) g.connect(dest);
  return g;
}
function mkFilt(ctx, type, f, q, dest) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  if (dest) b.connect(dest);
  return b;
}

/**
 * Each builder: (sys, ctx, bank, input, em, now) -> instance
 * instance: { srcs, nodes, level?, setLevel?(l, now), fire?(t) -> secondsUntilNext,
 *             firstDelay?, gust?(G, now) }
 */
const EMITTERS = {
  buzz: {
    send: 0.05,
    build(sys, ctx, bank, input, em, now) {
      const hz = (em.opts.hz || 100) * rand(0.996, 1.004);
      const level = mkGain(ctx, buzzLevelGain(em.level), input);
      const hum = ctx.createOscillator();
      hum.setPeriodicWave(bank.waves.ballast);
      hum.frequency.value = hz;
      const humG = mkGain(ctx, 0.022, level);
      hum.connect(humG);
      const bz = ctx.createOscillator();
      bz.setPeriodicWave(bank.waves.buzz);
      bz.frequency.value = hz;
      const bzG = mkGain(ctx, 0.018, level);
      const grit = mkGain(ctx, 0.3, bzG);
      const bp = mkFilt(ctx, 'bandpass', rand(2100, 2900), 0.6, grit);
      const hp = mkFilt(ctx, 'highpass', 700, 0.7, bp);
      bz.connect(hp);
      const gs = bufSrc(ctx, bank.grit);
      const gsG = mkGain(ctx, 0.7, grit.gain);
      gs.connect(gsG);
      hum.start(now);
      bz.start(now);
      gs.start(now, rand(0, 3));
      return {
        srcs: [hum, bz, gs],
        nodes: [level, humG, bzG, grit, bp, hp, gsG],
        setLevel(l, t) {
          level.gain.setTargetAtTime(buzzLevelGain(l), t, 0.01);
        },
      };
    },
  },
  drip: {
    send: 0.32,
    build(sys, ctx, bank, input, em) {
      const rate = Math.max(0.2, em.opts.rate != null ? +em.opts.rate || 8 : 8);
      const mean = 60 / rate;
      const baseF = em.opts.pitch || em.character.f;
      const splash = em.opts.splash != null ? em.opts.splash : em.character.splash;
      return {
        srcs: [],
        nodes: [],
        firstDelay: rand(0.15, 1) * mean,
        fire(t) {
          const v = sys._voice(input, t, 1, 1);
          if (!v) return mean;
          const r = Math.random();
          const n = r < 0.1 ? 3 : r < 0.28 ? 2 : 1;
          let tt = t;
          for (let i = 0; i < n; i++) {
            const a = i === 0 ? rand(0.75, 1) : rand(0.4, 0.8);
            const f = baseF * rand(0.86, 1.16);
            dripDrop(v, tt, f, a);
            if (Math.random() < splash) dripSplash(v, tt + 0.002, f, a);
            tt += rand(0.12, 0.45);
          }
          sys._track(v);
          return mean * rand(0.35, 1.65) + (tt - t);
        },
      };
    },
  },
  wind: {
    send: 0.2,
    build(sys, ctx, bank, input, em, now) {
      const src = bufSrc(ctx, bank.pink);
      const fW = em.opts.pitch || em.character.f * 0.6 + 200;
      const wG = mkGain(ctx, 0, input);
      const wBP = mkFilt(ctx, 'bandpass', fW, 24, wG);
      const w2G = mkGain(ctx, 0, input);
      const r2 = rand(1.45, 1.6);
      const w2BP = mkFilt(ctx, 'bandpass', fW * r2, 30, w2G);
      const mG = mkGain(ctx, 0, input);
      const mBP = mkFilt(ctx, 'bandpass', rand(200, 320), 4.5, mG);
      const hG = mkGain(ctx, 0, input);
      const hLP = mkFilt(ctx, 'lowpass', 6000, 0.7, hG);
      const hHP = mkFilt(ctx, 'highpass', 1800, 0.7, hLP);
      for (const n of [wBP, w2BP, mBP, hHP]) src.connect(n);
      src.start(now, rand(0, 3));
      let local = Math.random();
      const apply = (G, t, tau) => {
        local = clamp(local + (0.5 - local) * 0.08 + gauss() * 0.12, 0, 1);
        const g = clamp(0.6 * G + 0.4 * local, 0, 1);
        wBP.frequency.setTargetAtTime(fW * (0.85 + 0.4 * g), t, tau);
        w2BP.frequency.setTargetAtTime(fW * r2 * (0.85 + 0.4 * g), t, tau);
        wG.gain.setTargetAtTime(1.1 * (0.12 + g * g), t, tau);
        w2G.gain.setTargetAtTime(0.65 * g * g * g, t, tau);
        mG.gain.setTargetAtTime(0.22 * (0.35 + 0.65 * g), t, tau * 1.3);
        hG.gain.setTargetAtTime(0.035 * (0.3 + 0.7 * g), t, tau);
      };
      apply(sys._gust, now, 0.05);
      return {
        srcs: [src],
        nodes: [wG, wBP, w2G, w2BP, mG, mBP, hG, hLP, hHP],
        gust(G, t) {
          apply(G, t, 0.6);
        },
      };
    },
  },
  machine: {
    send: 0.15,
    build(sys, ctx, bank, input, em, now) {
      const hum = ctx.createOscillator();
      hum.setPeriodicWave(bank.waves.hum50);
      hum.frequency.value = (em.opts.hz || 50) * rand(0.998, 1.002);
      const humG = mkGain(ctx, 0.02, input);
      hum.connect(humG);
      const br = bufSrc(ctx, bank.brown);
      const rumG = mkGain(ctx, 0.2, input);
      const rumLP = mkFilt(ctx, 'lowpass', 140, 0.7, rumG);
      br.connect(rumLP);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rand(0.6, 1.1);
      const lfoG = mkGain(ctx, 0.05, rumG.gain);
      lfo.connect(lfoG);
      const pk = bufSrc(ctx, bank.pink, 1);
      const roarG = mkGain(ctx, 0.022, input);
      const roarBP = mkFilt(ctx, 'bandpass', rand(260, 340), 0.9, roarG);
      pk.connect(roarBP);
      hum.start(now);
      br.start(now, rand(0, 3));
      lfo.start(now);
      pk.start(now, rand(0, 3));
      return {
        srcs: [hum, br, lfo, pk],
        nodes: [humG, rumG, rumLP, lfoG, roarG, roarBP],
        firstDelay: rand(1, 6),
        fire(t) {
          const v = sys._voice(input, t, 1, 1);
          if (!v) return 5;
          v.out.gain.value = 0.6;
          let tt = t;
          if (Math.random() < 0.62) {
            const n = randi(1, 5);
            for (let i = 0; i < n; i++) {
              pipeTick(v, tt, rand(0.5, 1));
              tt += rand(0.25, 1.1);
            }
          } else {
            pipeKnock(v, tt, rand(0.6, 1));
            if (Math.random() < 0.35) pipeKnock(v, (tt += rand(0.15, 0.4)), rand(0.4, 0.7));
          }
          sys._track(v);
          return rand(3, 13) + (tt - t);
        },
      };
    },
  },
  creak: {
    send: 0.35,
    build(sys, ctx, bank, input) {
      return {
        srcs: [],
        nodes: [],
        firstDelay: rand(4, 30),
        fire(t) {
          const v = sys._voice(input, t, 1, 1);
          if (!v) return 20;
          const d = structCreak(v, t, rand(0.6, 1));
          sys._track(v);
          return rand(20, 60) + d;
        },
      };
    },
  },
};

// ---------------------------------------------------------------------------
// Param helpers (compat)
// ---------------------------------------------------------------------------
function setPannerPos(p, pos) {
  if (p.positionX) {
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
  } else p.setPosition(pos.x, pos.y, pos.z);
}

const AMBIENT_WEIGHTS = {
  above: { distant_creak: 0.34, distant_metal: 0.26, distant_door: 0.26, elevator_groan: 0.1, whisper_wind: 0.04 },
  below: { distant_creak: 0.28, distant_metal: 0.4, distant_door: 0.16, elevator_groan: 0.12, whisper_wind: 0.04 },
};

// ---------------------------------------------------------------------------
// AudioSystem
// ---------------------------------------------------------------------------
export class AudioSystem {
  /** @param {{hrtf?: boolean}} [options] hrtf=false uses cheaper equal-power panning */
  constructor(options = {}) {
    this._hrtf = options.hrtf !== false;
    this._ctx = null;
    this._ready = false;
    this._paused = false;
    this._isOffline = false;
    this._emitters = new Map();
    this._active = new Set();
    this._nextId = 1;
    this._listener = { x: 0, y: 1.6, z: 0, fx: 0, fy: 0, fz: -1 };
    this._masterVolume = 0.8;
    this._warned = new Set();
    this._graveyard = [];
    this._settles = [];
    this._live = 0;
    this._created = 0;
    this._gust = 0.4;
    this._frameDt = 1 / 60;
    this._lastEval = -1;
    this._needEval = true;
    this._foot = 1;
    this._underground = false;
    this._last = {}; // last smoothed targets
  }

  get started() {
    return this._ready;
  }

  /** Diagnostic counters (cheap). */
  get stats() {
    return {
      started: this._ready,
      state: this._ctx ? this._ctx.state : 'none',
      emitters: this._emitters.size,
      activeVoices: this._active.size,
      releasing: this._graveyard.length,
      liveOneShots: this._live,
      oneShotsCreated: this._created,
      nextAmbientIn: this._ready ? Math.max(0, this._nextAmbient - this._ctx.currentTime) : null,
    };
  }

  /**
   * Create the AudioContext (call from a user gesture). Idempotent.
   * options.context may inject an existing (e.g. Offline) context — used for tests.
   */
  start(options = {}) {
    if (this._ready) {
      if (!this._paused && !this._isOffline && this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
      return;
    }
    let ctx = options && options.context;
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) {
        this._warn('noapi', 'Web Audio API not available; audio disabled.');
        return;
      }
      try {
        ctx = new AC({ latencyHint: 'interactive' });
      } catch (e) {
        this._warn('ctxfail', 'Could not create AudioContext: ' + e);
        return;
      }
    }
    this._ctx = ctx;
    this._isOffline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    try {
      this._build();
    } catch (e) {
      console.error('[audio] failed to build graph', e);
      if (!options || !options.context) ctx.close().catch(() => {});
      this._ctx = null;
      return;
    }
    this._ready = true;
    if (!this._isOffline && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  setListener(pos, forward) {
    const L = this._listener;
    if (pos) {
      if (Number.isFinite(pos.x)) L.x = pos.x;
      if (Number.isFinite(pos.y)) L.y = pos.y;
      if (Number.isFinite(pos.z)) L.z = pos.z;
    }
    if (forward && Number.isFinite(forward.x) && Number.isFinite(forward.z)) {
      // project to horizontal (robust when looking straight up/down)
      const h = Math.hypot(forward.x, forward.z);
      if (h > 1e-3) {
        L.fx = forward.x / h;
        L.fy = 0;
        L.fz = forward.z / h;
      }
    }
    if (this._ready) this._applyListener();
  }

  update(dt, env) {
    if (!this._ready || this._paused) return;
    const ctx = this._ctx;
    if (ctx.state === 'closed') return;
    const now = ctx.currentTime;
    dt = clamp(Number(dt) || 0, 0, 0.25);
    this._frameDt = clamp(dt || 1 / 60, 1 / 240, 0.1);
    this._applyEnv(env || {}, now);

    // global gust process (Ornstein-Uhlenbeck), shared by wind bed + wind emitters
    if (dt > 0) {
      this._gust = clamp(this._gust + (0.42 - this._gust) * 0.12 * dt + 0.2 * Math.sqrt(dt) * gauss(), 0, 1);
    }

    if (this._needEval || now - this._lastEval >= REEVAL_INTERVAL) {
      this._needEval = false;
      this._lastEval = now;
      this._reevaluate(now);
      this._applyGust(now);
    }

    // recurring emitter events (drips, ticks, creaks)
    for (const em of this._active) {
      const vo = em.voice;
      if (!vo.inst.fire) continue;
      if (now + 0.05 >= vo.nextEvent) {
        const t = Math.max(vo.nextEvent, now + 0.01);
        const next = vo.inst.fire(t);
        vo.nextEvent = t + Math.max(0.05, next);
      }
    }

    this._ambientTick(now);

    if (this._settles.length) {
      let w = 0;
      for (const s of this._settles) {
        if (now < s[2]) this._settles[w++] = s;
        else if (s[0].__settleAt === s[2]) {
          s[0].cancelScheduledValues(0);
          s[0].value = s[1];
        }
      }
      this._settles.length = w;
    }

    // tear down released voices
    if (this._graveyard.length) {
      let w = 0;
      for (const g of this._graveyard) {
        if (now >= g.t) {
          for (const n of g.nodes) {
            try {
              n.disconnect();
            } catch (e) {
              /* already disconnected */
            }
          }
        } else this._graveyard[w++] = g;
      }
      this._graveyard.length = w;
    }
  }

  addEmitter(type, pos, opts = {}) {
    if (!EMITTERS[type]) {
      this._warn('emitter:' + type, `Unknown emitter type "${type}"`);
      return -1;
    }
    const id = this._nextId++;
    const p = pos || {};
    this._emitters.set(id, {
      id,
      type,
      pos: { x: +p.x || 0, y: +p.y || 0, z: +p.z || 0 },
      opts: opts || {},
      level: opts && opts.level != null ? clamp(+opts.level || 0, 0, 1) : 1,
      // stable per-emitter character so a revisited drip sounds like the same drip
      character: { f: rand(900, 2100), splash: rand(0.06, 0.22) },
      volume: opts && opts.volume != null ? clamp(+opts.volume || 0, 0, 4) : 1,
      zeroSince: -Infinity, // level-0 buzzes stop occupying voices after a while
      pendingTick: false,
      voice: null,
      dist: Infinity,
      rank: Infinity,
      occ: 0,
      lastTick: -1,
    });
    this._needEval = true;
    return id;
  }

  /** Extra: remove an emitter (fades out if instantiated). */
  removeEmitter(id) {
    const em = this._emitters.get(id);
    if (!em) return;
    if (em.voice && this._ready) this._releaseVoice(em, this._ctx.currentTime);
    this._emitters.delete(id);
  }

  /** Extra: move an emitter. */
  setEmitterPosition(id, pos) {
    const em = this._emitters.get(id);
    if (!em || !pos) return;
    em.pos.x = +pos.x || 0;
    em.pos.y = +pos.y || 0;
    em.pos.z = +pos.z || 0;
    if (em.voice) setPannerPos(em.voice.panner, em.pos);
  }

  setEmitterLevel(id, level) {
    const em = this._emitters.get(id);
    if (!em) return;
    const l = clamp(+level || 0, 0, 1);
    const prev = em.level;
    if (Math.abs(l - prev) < 1e-4) return;
    em.level = l;
    const now = this._ready ? this._ctx.currentTime : 0;
    if (l <= 0 && prev > 0) em.zeroSince = now;
    const vo = em.voice;
    if (!vo && l > 0 && prev <= 0) {
      // a parked (silent) lamp came back on: instantiate next frame, keep its start tick
      this._needEval = true;
      em.pendingTick = l > 0.5;
    }
    if (!this._ready || !vo || !vo.inst.setLevel) return;
    vo.inst.setLevel(l, now);
    if (now - em.lastTick > 0.04) {
      if (prev <= 0.001 && l > 0.5) {
        em.lastTick = now;
        const v = this._voice(vo.input, now + 0.002, 1, 1);
        if (v) {
          ballastTick(v, now + 0.002);
          this._track(v);
        }
      } else if (Math.abs(l - prev) > 0.35 && l > 0) {
        em.lastTick = now;
        const v = this._voice(vo.input, now + 0.002, 1, l);
        if (v) {
          arcCrackle(v, now + 0.002);
          this._track(v);
        }
      }
    }
  }

  footstep(surface, opts = {}) {
    if (!this._ready || this._paused) return;
    if (!FOOTSTEPS[surface]) {
      this._warn('surface:' + surface, `Unknown footstep surface "${surface}"`);
      return;
    }
    if (this._live >= MAX_ONESHOTS) return;
    const ctx = this._ctx;
    const t = ctx.currentTime + 0.004 + Math.random() * 0.012;
    this._foot = -this._foot;
    let pan;
    if (ctx.createStereoPanner) {
      pan = ctx.createStereoPanner();
      pan.pan.value = this._foot * rand(0.03, 0.08);
    } else pan = ctx.createGain();
    pan.connect(this._sfx);
    const send = mkGain(ctx, FOOTSTEP_SEND, this._revIn);
    pan.connect(send);
    const v = renderFootstep(ctx, this._bank, pan, t, surface, opts || {});
    this._track(v, [pan, send]);
  }

  play(name, pos = null, opts = {}) {
    if (!this._ready || this._paused) return 0;
    if (!SOUNDS[name]) {
      this._warn('sound:' + name, `Unknown sound "${name}"`);
      return 0;
    }
    if (this._live >= MAX_ONESHOTS) return 0;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const t = now + 0.005;
    const meta = SOUND_META[name] || { send: 0.25 };
    const nodes = [];
    let dest;
    if (pos && Number.isFinite(pos.x)) {
      // positional: occlusion LP -> occ gain -> panner ; occ gain -> wet send
      const L = this._listener;
      const dx = pos.x - L.x;
      const dy = (pos.y || 0) - L.y;
      const dz = pos.z - L.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const occ = smoothstep(OCC_A, OCC_B, Math.abs(dy));
      const occ2 = smoothstep(6, 7, Math.abs(dy));
      const lp = mkFilt(ctx, 'lowpass', lerp(1000 + 16000 * Math.exp(-d / 9), 320, occ), 0.5);
      const og = mkGain(ctx, (meta.dry != null ? meta.dry : 1) * lerp(1, 0.14, occ) * lerp(1, 0.35, occ2), null);
      const pn = this._makePanner({ x: pos.x, y: pos.y || 0, z: pos.z }, 2, 1.1, 80);
      const wet = mkGain(ctx, meta.send / (1 + d / 10), this._revIn);
      lp.connect(og);
      og.connect(pn);
      pn.connect(this._sfx);
      lp.connect(wet);
      wet.gain.value *= lerp(1, 0.2, occ);
      nodes.push(lp, og, pn, wet);
      dest = lp;
    } else {
      const split = mkGain(ctx, 1);
      const dry = mkGain(ctx, meta.dry != null ? meta.dry : 1, this._sfx);
      const wet = mkGain(ctx, meta.send, this._revIn);
      split.connect(dry);
      split.connect(wet);
      nodes.push(split, dry, wet);
      dest = split;
    }
    const v = renderOneShot(ctx, this._bank, dest, t, name, opts || {});
    this._track(v, nodes);
    return v ? v.end - now : 0;
  }

  setMasterVolume(v) {
    this._masterVolume = clamp(+v || 0, 0, 1);
    if (this._ready) this._vol.gain.setTargetAtTime(this._masterVolume, this._ctx.currentTime, 0.05);
  }

  suspend() {
    if (!this._ready) return Promise.resolve();
    this._paused = true;
    if (this._isOffline) return Promise.resolve();
    return this._ctx.suspend().catch(() => {});
  }

  resume() {
    if (!this._ready) return Promise.resolve();
    this._paused = false;
    if (this._isOffline) return Promise.resolve();
    return this._ctx.resume().catch(() => {});
  }

  // ------------------------------------------------------------------ internals
  _warn(key, msg) {
    if (this._warned.has(key)) return;
    this._warned.add(key);
    console.warn('[audio] ' + msg);
  }

  _build() {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    this._bank = createBank(ctx);

    // --- master chain: mix -> HP -> glue comp -> limiter -> volume -> soft clip -> out
    const mix = (this._mix = mkGain(ctx, MIX_TRIM));
    const hp = mkFilt(ctx, 'highpass', 18, 0.6);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.12;
    const vol = (this._vol = mkGain(ctx, this._masterVolume));
    const pre = mkGain(ctx, 1 / 1.5);
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve();
    shaper.oversample = 'none';
    mix.connect(hp);
    hp.connect(comp);
    comp.connect(lim);
    lim.connect(vol);
    vol.connect(pre);
    pre.connect(shaper);
    shaper.connect(ctx.destination);

    this._sfx = mkGain(ctx, 1, mix);
    this._amb = mkGain(ctx, 1, mix);

    // --- reverb: two procedurally generated IRs, crossfaded for stairwells
    this._revIn = mkGain(ctx, 1);
    const revOut = mkGain(ctx, 1);
    const revHP = mkFilt(ctx, 'highpass', 130, 0.6, mix);
    revOut.connect(revHP);
    const convA = ctx.createConvolver();
    convA.normalize = false;
    convA.buffer = makeIR(ctx, {
      dur: 2.0,
      t60: 1.8,
      pre: 0.012,
      fadeIn: 0.006,
      f0: 7000,
      f1: 1600,
      fTau: 0.35,
      early: [[0.009, 0.02], [0.017, 0.018], [0.026, 0.014], [0.039, 0.012], [0.058, 0.009], [0.14, 0.012], [0.21, 0.006]],
    });
    this._gA = mkGain(ctx, 1, revOut);
    this._gB = mkGain(ctx, 0, revOut);
    convA.connect(this._gA);
    this._revIn.connect(convA);
    // The long stairwell IR is built shortly after start (keeps the click handler fast),
    // or immediately on first stairwell entry, and only fed while it is needed.
    this._convB = null;
    this._convBOn = false;
    this._convBIdleSince = now;
    if (!this._isOffline && typeof setTimeout === 'function') setTimeout(() => this._ensureStairReverb(), 1500);

    // --- ambience beds
    const amb = this._amb;
    // (1) room tone: heavily low-passed brown noise + faint air, slow drift
    const drift = mkGain(ctx, 0.85, amb);
    this._roomBus = drift;
    for (const [f, d] of [[0.043, 0.22], [0.017, 0.14]]) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = f * rand(0.8, 1.2);
      lfo.connect(mkGain(ctx, d, drift.gain));
      lfo.start(now);
    }
    const room = bufSrc(ctx, this._bank.brown);
    this._roomG = mkGain(ctx, ROOM_LEVEL, drift);
    room.connect(mkFilt(ctx, 'lowpass', 170, 0.6, mkFilt(ctx, 'highpass', 24, 0.6, this._roomG)));
    room.start(now, rand(0, 3));
    const air = bufSrc(ctx, this._bank.pink, 1);
    this._airG = mkGain(ctx, AIR_LEVEL, drift);
    air.connect(mkFilt(ctx, 'bandpass', 450, 0.5, this._airG));
    air.start(now, rand(0, 3));

    // (2) distant wind bed: moaning band + faint whistle, gust-modulated, level = exposure
    this._windG = mkGain(ctx, WIND_BED_LEVEL * 0.04, amb);
    this._windGust = mkGain(ctx, 1, this._windG);
    const wlp = mkFilt(ctx, 'lowpass', 1100, 0.6, this._windGust);
    this._windBP = mkFilt(ctx, 'bandpass', 380, 0.7, wlp);
    this._windWh = mkFilt(ctx, 'bandpass', 640, 9, mkGain(ctx, 0.9, this._windGust));
    const wsrc = bufSrc(ctx, this._bank.pink);
    wsrc.connect(this._windBP);
    wsrc.connect(this._windWh);
    wsrc.start(now, rand(0, 3));

    // (3) sub rumble: very low brown noise + faint 31 Hz, louder underground
    this._rumbleG = mkGain(ctx, RUMBLE_LEVEL * 0.28, amb);
    const rsrc = bufSrc(ctx, this._bank.brown);
    rsrc.connect(mkFilt(ctx, 'lowpass', 55, 0.7, this._rumbleG));
    rsrc.start(now, rand(0, 3));
    const sub = ctx.createOscillator();
    sub.frequency.value = 31;
    sub.connect(mkGain(ctx, 0.12, this._rumbleG));
    sub.start(now);

    // --- listener initial state
    const l = ctx.listener;
    if (l.upX) {
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }
    this._applyListener(true);

    // --- schedulers
    this._startTime = now;
    this._nextAmbient = now + rand(12, 35);
    this._ambientBusy = now;
    this._lastWhisper = now - 60; // first whisper possible after ~2 min
    this._lastEval = -1;
    this._needEval = true;
  }

  _ensureStairReverb() {
    if (this._convB || !this._ctx) return;
    const ctx = this._ctx;
    const convB = ctx.createConvolver();
    convB.normalize = false;
    const flutter = [];
    for (let i = 1; i <= 14; i++) flutter.push([0.004 + i * 0.0185, 0.016 * Math.pow(0.82, i)]);
    convB.buffer = makeIR(ctx, {
      dur: 3.4,
      t60: 3.0,
      pre: 0.008,
      fadeIn: 0.004,
      f0: 8000,
      f1: 2200,
      fTau: 0.6,
      early: flutter,
    });
    convB.connect(this._gB);
    this._convB = convB;
  }

  /** after automation converges, drop the events so the node returns to its cheap static path */
  _settleLater(param, target, at) {
    param.__settleAt = at;
    this._settles.push([param, target, at]);
  }

  _makePanner(pos, ref, rolloff, max) {
    const p = this._ctx.createPanner();
    p.panningModel = this._hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = max;
    setPannerPos(p, pos);
    return p;
  }

  _applyListener(initial = false) {
    const ctx = this._ctx;
    const l = ctx.listener;
    const L = this._listener;
    if (l.positionX) {
      // When the clock is frozen (suspended) do not pile up automation events.
      if (!initial && !this._isOffline && ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const vals = [
        [l.positionX, L.x],
        [l.positionY, L.y],
        [l.positionZ, L.z],
        [l.forwardX, L.fx],
        [l.forwardY, L.fy],
        [l.forwardZ, L.fz],
      ];
      if (initial) for (const [p, v] of vals) p.setValueAtTime(v, now);
      else {
        const end = now + this._frameDt;
        for (const [p, v] of vals) p.linearRampToValueAtTime(v, end);
      }
    } else {
      l.setPosition(L.x, L.y, L.z);
      l.setOrientation(L.fx, L.fy, L.fz, 0, 1, 0);
    }
  }

  /** setTargetAtTime only when the target changed (avoids automation pile-up). */
  _smooth(key, param, v, now, tau) {
    const last = this._last[key];
    if (last !== undefined && Math.abs(last - v) <= Math.max(1e-5, Math.abs(last) * 0.01)) return;
    this._last[key] = v;
    param.setTargetAtTime(v, now, tau);
  }

  _applyEnv(env, now) {
    const ex = clamp(+env.exposure || 0, 0, 1);
    const ug = !!env.underground;
    const st = !!env.inStairwell;
    this._underground = ug;
    this._smooth('wind', this._windG.gain, WIND_BED_LEVEL * (0.04 + 0.96 * Math.pow(ex, 1.3)) * (ug ? 0.15 : 1), now, 1.2);
    this._smooth('rumble', this._rumbleG.gain, RUMBLE_LEVEL * (ug ? 1 : 0.28), now, 2.5);
    if (st && !this._convBOn) {
      this._ensureStairReverb();
      this._revIn.connect(this._convB);
      this._convBOn = true;
    }
    if (st) this._convBIdleSince = now;
    this._smooth('revA', this._gA.gain, st ? 0.3 : 1, now, 0.7);
    this._smooth('revB', this._gB.gain, st ? 1.5 : 0, now, 0.7);
    // free the long convolver's CPU when we've been out of stairwells a while
    if (!st && this._convBOn && now - this._convBIdleSince > 8) {
      try {
        this._revIn.disconnect(this._convB);
      } catch (e) {
        /* ignore */
      }
      this._convBOn = false;
    }
  }

  _applyGust(now) {
    const G = this._gust;
    this._windGust.gain.setTargetAtTime(0.45 + 0.75 * G, now, 0.8);
    this._windWh.frequency.setTargetAtTime(560 + 220 * G, now, 0.8);
    for (const em of this._active) if (em.voice.inst.gust) em.voice.inst.gust(G, now);
  }

  _reevaluate(now) {
    const L = this._listener;
    const cands = [];
    for (const em of this._emitters.values()) {
      const dx = em.pos.x - L.x;
      const dy = em.pos.y - L.y;
      const dz = em.pos.z - L.z;
      const ady = Math.abs(dy);
      em.dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      em.occ = smoothstep(OCC_A, OCC_B, ady);
      em.occ2 = smoothstep(6, 7, ady);
      em.rank = em.dist + em.occ * 6 + em.occ2 * 6 - (em.voice ? 0.75 : 0);
      if (em.level <= 0 && now - em.zeroSince > 1.5) continue; // lamp off for a while: silent, park it
      if (em.rank < (em.voice ? VIRT_RELEASE : VIRT_RADIUS)) cands.push(em);
    }
    cands.sort((a, b) => a.rank - b.rank);
    if (cands.length > MAX_ACTIVE) cands.length = MAX_ACTIVE;
    const keep = new Set(cands);
    for (const em of this._active) if (!keep.has(em)) this._releaseVoice(em, now);
    let spawns = 0;
    for (const em of cands) {
      if (em.voice) this._updateVoiceMix(em, now, 0.12);
      else if (spawns < SPAWNS_PER_FRAME) {
        this._spawnVoice(em, now);
        spawns++;
      } else this._needEval = true; // finish next frame
    }
    for (const em of cands) em.pendingTick = false;
  }

  _voiceMix(em) {
    const def = EMITTERS[em.type];
    const fade = 1 - smoothstep(10.5, 16, em.rank + (em.voice ? 0.75 : 0));
    const occGain = lerp(1, 0.14, em.occ) * lerp(1, 0.35, em.occ2);
    const cutoff = lerp(900 + 15000 * Math.exp(-em.dist / 7), 320, em.occ);
    const wet = (def.send / (1 + em.dist / 3)) * lerp(1, 0.3, em.occ);
    return { g: fade * occGain, cutoff, wet };
  }

  _updateVoiceMix(em, now, tau) {
    const vo = em.voice;
    const m = this._voiceMix(em);
    const near = (a, b, r) => Math.abs(a - b) <= Math.max(1e-4, Math.abs(a) * r);
    if (near(vo.m.g, m.g, 0.02)) m.g = vo.m.g;
    else vo.occG.gain.setTargetAtTime(m.g, now, tau);
    if (near(vo.m.wet, m.wet, 0.02)) m.wet = vo.m.wet;
    else vo.wet.gain.setTargetAtTime(m.wet, now, tau);
    if (near(vo.m.cutoff, m.cutoff, 0.06)) m.cutoff = vo.m.cutoff;
    else {
      vo.occLP.frequency.setTargetAtTime(m.cutoff, now, tau);
      this._settleLater(vo.occLP.frequency, m.cutoff, now + tau * 6);
    }
    vo.m = m;
  }

  _spawnVoice(em, now) {
    const ctx = this._ctx;
    const def = EMITTERS[em.type];
    const m = this._voiceMix(em);
    const input = mkGain(ctx, 1);
    const fade = mkGain(ctx, 0);
    input.gain.value = em.volume;
    fade.gain.setTargetAtTime(1, now, 0.12);
    const occLP = mkFilt(ctx, 'lowpass', m.cutoff, 0.5);
    const occG = mkGain(ctx, m.g);
    const panner = this._makePanner(em.pos, EMITTER_REF, EMITTER_ROLLOFF, 60);
    const wet = mkGain(ctx, m.wet, this._revIn);
    input.connect(fade);
    fade.connect(occLP);
    occLP.connect(occG);
    occG.connect(panner);
    panner.connect(this._sfx);
    occG.connect(wet);
    const inst = def.build(this, ctx, this._bank, input, em, now);
    em.voice = {
      input,
      fade,
      occLP,
      occG,
      panner,
      wet,
      inst,
      m,
      nextEvent: now + (inst.firstDelay != null ? inst.firstDelay : 1e9),
    };
    this._active.add(em);
    if (em.pendingTick) {
      em.pendingTick = false;
      const v = this._voice(input, now + 0.002, 1, 1);
      if (v) {
        ballastTick(v, now + 0.002);
        this._track(v);
      }
    }
  }

  _releaseVoice(em, now) {
    const vo = em.voice;
    if (!vo) return;
    em.voice = null;
    this._active.delete(em);
    vo.fade.gain.setTargetAtTime(0, now, 0.08);
    for (const s of vo.inst.srcs) {
      try {
        s.stop(now + 0.6);
      } catch (e) {
        /* ignore */
      }
    }
    this._graveyard.push({
      t: now + 0.7,
      nodes: [vo.input, vo.fade, vo.occLP, vo.occG, vo.panner, vo.wet, ...vo.inst.nodes, ...vo.inst.srcs],
    });
  }

  /** create a one-shot Voice into dest (null if over the voice cap) */
  _voice(dest, t, rate, vol) {
    if (this._live >= MAX_ONESHOTS) return null;
    return new Voice(this._ctx, this._bank, dest, t, rate, vol);
  }

  /** count + auto-disconnect a one-shot when its last source ends */
  _track(v, extra = []) {
    const cleanup = () => {
      try {
        v && v.out.disconnect();
      } catch (e) {
        /* ignore */
      }
      for (const n of extra) {
        try {
          n.disconnect();
        } catch (e) {
          /* ignore */
        }
      }
    };
    if (!v || !v.last) {
      cleanup();
      return;
    }
    this._live++;
    this._created++;
    v.last.onended = () => {
      this._live--;
      cleanup();
    };
  }

  _ambientTick(now) {
    if (now < this._nextAmbient || now < this._ambientBusy) return;
    const w = { ...AMBIENT_WEIGHTS[this._underground ? 'below' : 'above'] };
    if (now - this._lastWhisper < 180) delete w.whisper_wind;
    let sum = 0;
    for (const k in w) sum += w[k];
    let r = Math.random() * sum;
    let name = 'distant_creak';
    for (const k in w) {
      r -= w[k];
      if (r <= 0) {
        name = k;
        break;
      }
    }
    const dur = this._playDistant(name, rand(0.6, 1.0));
    if (name === 'whisper_wind') this._lastWhisper = now;
    this._ambientBusy = now + dur + 2;
    this._nextAmbient = now + rand(25, 70);
  }

  /** an ambient event from a random direction a few tens of metres away */
  _playDistant(name, vol) {
    if (this._live >= MAX_ONESHOTS) return 0;
    const ctx = this._ctx;
    const now = ctx.currentTime;
    const L = this._listener;
    const az = rand(0, TAU);
    const D = rand(18, 35);
    const pos = { x: L.x + Math.cos(az) * D, y: L.y + rand(-2, 3), z: L.z + Math.sin(az) * D };
    const meta = SOUND_META[name];
    const pn = this._makePanner(pos, 1, 0, 1000); // direction only, level baked in
    const split = mkGain(ctx, 1);
    const dry = mkGain(ctx, meta.dry != null ? meta.dry : 0.5, this._sfx);
    const wet = mkGain(ctx, meta.send, this._revIn);
    split.connect(pn);
    pn.connect(dry);
    split.connect(wet);
    const v = renderOneShot(ctx, this._bank, split, now + 0.02, name, { volume: vol * AMBIENT_EVENT_LEVEL });
    this._track(v, [pn, split, dry, wet]);
    return v ? v.end - now : 0;
  }
}

/**
 * Offline-renderable synthesis entry points (any BaseAudioContext).
 * Used by tests; also handy for previews.
 */
export const AudioSynth = {
  SURFACES: Object.keys(FOOTSTEPS),
  SOUNDS: Object.keys(SOUNDS),
  EMITTER_TYPES: Object.keys(EMITTERS),
  createBank,
  footstep: renderFootstep,
  oneShot: renderOneShot,
  /** render one recurring emitter event (drip burst / machine tick / creak) */
  emitterEvent(ctx, bank, dest, t, type) {
    const v = new Voice(ctx, bank, dest, t, 1, 1);
    if (type === 'drip') {
      const f = rand(900, 2100);
      dripDrop(v, t, f, 1);
      dripSplash(v, t + 0.002, f, 1);
    } else if (type === 'machine') {
      pipeKnock(v, t, 1);
      pipeTick(v, t + 0.6, 1);
    } else if (type === 'creak') structCreak(v, t, 1);
    else if (type === 'buzz') ballastTick(v, t);
    else return null;
    return v;
  },
};
