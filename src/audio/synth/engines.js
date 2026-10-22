// Continuous loops for vehicles, aircraft, fire and radar. Every component is
// generated as an exactly periodic signal: tonal frequencies are quantised to
// whole cycles per loop, impulses wrap around the end and IIR filters are
// pre-rolled circularly, so the buffers loop with no seam or crossfade.
import {
  TAU,
  addModes,
  biquad,
  blepSaw,
  blepSquare,
  brownFilter,
  circular,
  hp1,
  lp1,
  mixWrap,
  normalize,
  pinkFilter,
  samples,
  smoothRandom,
  softClip,
  white,
} from '../dsp.js';

// Frequency rounded to a whole number of cycles per loop of length L seconds.
const quant = (f, L) => Math.max(1, Math.round(f * L)) / L;

function zeroMean(x) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m += x[i];
  m /= x.length;
  for (let i = 0; i < x.length; i++) x[i] -= m;
  return x;
}

// Periodic zero-mean modulator with `perSecond` random breakpoints.
function lfo(n, sr, perSecond, rng) {
  return zeroMean(smoothRandom(n, Math.max(2, Math.round((n / sr) * perSecond)), rng, true));
}

// Sine via a rotating phasor, frequency updated per 32-sample block. With FM the
// block increments are corrected so the total phase still closes exactly on the loop.
function addSine(buf, f, amp, sr, fm = null, depth = 0) {
  const n = buf.length;
  const k = (TAU * f) / sr;
  const B = 32;
  const nb = Math.ceil(n / B);
  const w = new Float64Array(nb);
  let total = 0;
  for (let b = 0; b < nb; b++) {
    w[b] = fm ? k * (1 + depth * fm[b * B]) : k;
    total += w[b] * (Math.min(n, (b + 1) * B) - b * B);
  }
  const fix = (k * n - total) / n;
  let c = 1;
  let s = 0;
  for (let b = 0; b < nb; b++) {
    const cw = Math.cos(w[b] + fix);
    const sw = Math.sin(w[b] + fix);
    const end = Math.min(n, (b + 1) * B);
    for (let j = b * B; j < end; j++) {
      const nc = c * cw - s * sw;
      s = c * sw + s * cw;
      c = nc;
      buf[j] += amp * s;
    }
  }
}

// Band-limited saw/square blend; `shape` 1 = saw, 0 = square. The start phase
// is arbitrary (the waveform is periodic either way) so stacked oscillators do
// not all reset on the loop boundary.
function addOsc(buf, f, amp, sr, shape, fm = null, depth = 0, phase = 0) {
  const base = f / sr;
  let ph = phase;
  for (let i = 0; i < buf.length; i++) {
    const dt = fm ? base * (1 + depth * fm[i]) : base;
    ph += dt;
    if (ph >= 1) ph -= 1;
    buf[i] += amp * (shape * blepSaw(ph, dt) + (1 - shape) * blepSquare(ph, dt));
  }
}

// Filtered periodic noise layer: colouring and `filters(x)` both run circularly.
function noiseLayer(n, rng, sr, filters, kind = 'white') {
  const x = white(n, rng.seed());
  circular(x, Math.min(n, samples(sr, 0.4)), (b) => {
    if (kind === 'pink') pinkFilter(b);
    else if (kind === 'brown') brownFilter(b, sr, 20);
    filters(b);
  });
  return normalize(x, 1);
}

function addLayer(out, layer, amp, env = null) {
  for (let i = 0; i < out.length; i++) out[i] += amp * layer[i] * (env ? env[i] : 1);
}

// Alpha-function pressure pulse (fast rise, exponential fall).
function pulseShape(sr, rise, fall) {
  const n = samples(sr, rise + fall * 6);
  const p = new Float32Array(n);
  const tr = rise * sr;
  const tf = fall * sr;
  for (let i = 0; i < n; i++) {
    p[i] = i < tr ? Math.sin((Math.PI / 2) * (i / tr)) : Math.exp(-(i - tr) / tf);
  }
  return p;
}

// Periodic pulse-synchronous envelope (used to modulate noise with the firing rhythm).
function pulseEnvelope(n, count, sr, tau, depth) {
  const env = new Float32Array(n).fill(1 - depth);
  const shape = pulseShape(sr, 0.0005, tau);
  const period = n / count;
  for (let k = 0; k < count; k++) mixWrap(env, shape, Math.round(k * period), depth);
  return env;
}

// Diesel: combustion pulses at the firing rate with a per-cylinder pattern, body
// and exhaust resonances, combustion roughness and valve-train clatter.
function addDiesel(out, o, rng, sr, L) {
  const n = out.length;
  const pulses = Math.max(o.cyl, Math.round((o.fire * L) / o.cyl) * o.cyl);
  const period = n / pulses;
  const pattern = Array.from({ length: o.cyl }, () => 1 + o.uneven * rng.bi());
  const x = new Float32Array(n);
  const shape = pulseShape(sr, 0.0008, o.decay);
  for (let k = 0; k < pulses; k++) {
    const amp = pattern[k % o.cyl] * (1 + 0.12 * rng.bi());
    mixWrap(x, shape, Math.round(k * period + rng.bi() * 0.03 * period), amp);
  }
  circular(x, samples(sr, 0.2), (b) => {
    hp1(b, 25, sr);
    biquad(b, 'peak', o.res1, 1.8, sr, 9);
    biquad(b, 'peak', o.res2, 2.5, sr, 6);
    biquad(b, 'lp', o.lp, 0.7, sr);
  });
  addLayer(out, normalize(x, 1), o.amp);
  const env = pulseEnvelope(n, pulses, sr, o.decay * 1.5, 0.8);
  const rough = noiseLayer(n, rng, sr, (b) => biquad(b, 'bp', o.noiseF, 0.7, sr));
  addLayer(out, rough, o.amp * o.rough, env);
  const clatterEnv = pulseEnvelope(n, pulses / 2, sr, 0.003, 0.9);
  const clatter = noiseLayer(n, rng, sr, (b) => {
    hp1(b, 2500, sr);
    lp1(b, 7000, sr);
  });
  addLayer(out, clatter, o.amp * o.knock, clatterEnv);
  return pulses / L;
}

// Track links slapping the sprockets and road wheels, with occasional squeal.
function addTracks(out, o, rng, sr, L) {
  const n = out.length;
  const count = Math.round(o.rate * L);
  const period = n / count;
  for (let k = 0; k < count; k++) {
    const len = samples(sr, 0.06);
    const hit = new Float32Array(len);
    const f0 = rng.range(o.f[0], o.f[1]);
    addModes(hit, 0, 1, [
      { f: f0, d: rng.range(0.012, 0.03), a: 1 },
      { f: f0 * 2.3, d: 0.012, a: 0.6 },
      { f: f0 * 4.1, d: 0.006, a: 0.35 },
    ], sr);
    const click = white(samples(sr, 0.004), rng.seed());
    for (let i = 0; i < click.length; i++) hit[i] += 0.5 * click[i] * (1 - i / click.length);
    const amp = (0.4 + 0.6 * rng.pow(1.5)) * (k % 2 ? 0.8 : 1);
    mixWrap(out, hit, Math.round(k * period + rng.bi() * 0.15 * period), o.amp * amp);
  }
  for (let s = 0; s < o.squeals; s++) {
    const len = samples(sr, rng.range(0.2, 0.5));
    const sq = new Float32Array(len);
    const f = rng.range(1600, 2800);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      ph += (TAU * f * (1 + 0.01 * Math.sin((TAU * 6 * i) / sr))) / sr;
      sq[i] = Math.sin(Math.PI * u) ** 2 * (Math.sin(ph) + 0.3 * Math.sin(2.01 * ph));
    }
    mixWrap(out, sq, rng.int(n), o.squeal);
  }
}

function addRumble(out, rng, sr, amp, lp, mod = null, depth = 0) {
  const r = noiseLayer(out.length, rng, sr, (b) => {
    lp1(b, lp, sr);
    lp1(b, lp, sr);
  }, 'brown');
  for (let i = 0; i < out.length; i++) out[i] += amp * r[i] * (mod ? 1 - depth + depth * mod[i] : 1);
}

function finishLoop(out, drive = 0) {
  normalize(out, 1);
  if (drive) softClip(out, drive);
  return normalize(out, 0.9);
}

export function tankLoop(rng, sr, variant) {
  const L = 3;
  const n = samples(sr, L);
  const out = new Float32Array(n);
  const trackRate = quant(rng.range(13, 16), L);
  const trackEnv = pulseEnvelope(n, Math.round(trackRate * L), sr, 0.02, 0.5);
  if (variant % 2 === 0) {
    // Gas turbine (M1 class): whine over a jet-like roar.
    const fm = lfo(n, sr, 1.5, rng);
    addSine(out, quant(1450, L), 0.1, sr, fm, 0.004);
    addSine(out, quant(2900, L), 0.06, sr, fm, 0.004);
    addSine(out, quant(4650, L), 0.035, sr, fm, 0.004);
    addLayer(out, noiseLayer(n, rng, sr, (b) => biquad(b, 'bp', 3000, 0.6, sr)), 0.12);
    addLayer(out, noiseLayer(n, rng, sr, (b) => {
      lp1(b, 500, sr);
      lp1(b, 700, sr);
    }, 'pink'), 0.45);
  } else {
    // V12 diesel (T-90 / Leopard class) with a faint turbo whistle.
    addDiesel(out, {
      fire: 105, cyl: 12, uneven: 0.18, decay: 0.004, res1: 340, res2: 880, lp: 2400,
      noiseF: 1200, rough: 0.35, knock: 0.12, amp: 0.7,
    }, rng, sr, L);
    addSine(out, quant(3200, L), 0.025, sr, lfo(n, sr, 1, rng), 0.003);
  }
  addTracks(out, { rate: trackRate, f: [320, 650], amp: 0.5, squeals: 2, squeal: 0.07 }, rng, sr, L);
  addRumble(out, rng, sr, 0.5, 90, trackEnv, 0.4);
  return { ch: [finishLoop(out, 1.4)] };
}

export function ifvLoop(rng, sr) {
  const L = 3;
  const n = samples(sr, L);
  const out = new Float32Array(n);
  addDiesel(out, {
    fire: 120, cyl: 8, uneven: 0.15, decay: 0.0035, res1: 420, res2: 1100, lp: 2800,
    noiseF: 1500, rough: 0.35, knock: 0.14, amp: 0.65,
  }, rng, sr, L);
  const trackRate = quant(rng.range(17, 20), L);
  addTracks(out, { rate: trackRate, f: [420, 800], amp: 0.32, squeals: 1, squeal: 0.04 }, rng, sr, L);
  addSine(out, quant(900, L), 0.03, sr, lfo(n, sr, 1, rng), 0.004);
  addRumble(out, rng, sr, 0.4, 100, pulseEnvelope(n, Math.round(trackRate * L), sr, 0.02, 0.4), 0.3);
  return { ch: [finishLoop(out, 1.3)] };
}

function tyres(out, rng, sr, amp) {
  addRumble(out, rng, sr, amp, 180, lfo(out.length, sr, 3, rng), 0.3);
  addLayer(out, noiseLayer(out.length, rng, sr, (b) => biquad(b, 'bp', 420, 0.7, sr), 'pink'), amp * 0.45);
}

export function apcLoop(rng, sr) {
  const L = 3;
  const n = samples(sr, L);
  const out = new Float32Array(n);
  addDiesel(out, {
    fire: 95, cyl: 6, uneven: 0.15, decay: 0.004, res1: 380, res2: 950, lp: 2600,
    noiseF: 1300, rough: 0.3, knock: 0.12, amp: 0.7,
  }, rng, sr, L);
  tyres(out, rng, sr, 0.4);
  addSine(out, quant(650, L), 0.035, sr, lfo(n, sr, 1, rng), 0.004);
  addSine(out, quant(2700, L), 0.02, sr, lfo(n, sr, 1, rng), 0.003);
  return { ch: [finishLoop(out, 1.2)] };
}

export function truckLoop(rng, sr) {
  const L = 3;
  const n = samples(sr, L);
  const out = new Float32Array(n);
  addDiesel(out, {
    fire: 72, cyl: 6, uneven: 0.25, decay: 0.003, res1: 300, res2: 1250, lp: 3200,
    noiseF: 1700, rough: 0.45, knock: 0.2, amp: 0.7,
  }, rng, sr, L);
  tyres(out, rng, sr, 0.3);
  for (let i = 0; i < 9; i++) {
    const hit = new Float32Array(samples(sr, 0.05));
    addModes(hit, 0, 1, [{ f: rng.range(500, 1400), d: 0.015, a: 1 }, { f: rng.range(1800, 3000), d: 0.008, a: 0.5 }], sr);
    mixWrap(out, hit, rng.int(n), rng.range(0.05, 0.15));
  }
  return { ch: [finishLoop(out, 1.3)] };
}

// Helicopter: main-rotor blade slap at the blade-passing rate, rotor broadband
// noise modulated by it, tail-rotor buzz, turbine and gearbox whine.
export function heliLoop(rng, sr) {
  const L = 2.4;
  const n = samples(sr, L);
  const out = new Float32Array(n);
  const blades = 4;
  const passes = blades * Math.round((5 * L));
  const period = n / passes;
  const pattern = Array.from({ length: blades }, () => 1 + 0.05 * rng.bi());
  const thump = pulseShape(sr, 0.004, 0.006);
  const slapLen = samples(sr, 0.04);
  for (let k = 0; k < passes; k++) {
    const amp = pattern[k % blades] * (1 + 0.03 * rng.bi());
    const at = Math.round(k * period + rng.bi() * 0.01 * period);
    mixWrap(out, thump, at, amp);
    const slap = white(slapLen, rng.seed());
    for (let i = 0; i < slapLen; i++) slap[i] *= Math.exp(-i / (0.007 * sr)) * Math.min(1, i / (0.0008 * sr));
    biquad(slap, 'bp', rng.range(380, 520), 1.0, sr);
    mixWrap(out, slap, at, 1.6 * amp);
  }
  circular(out, samples(sr, 0.1), (b) => {
    hp1(b, 30, sr);
    lp1(b, 2500, sr);
  });
  normalize(out, 1);
  const bladeEnv = pulseEnvelope(n, passes, sr, 0.012, 0.6);
  addLayer(out, noiseLayer(n, rng, sr, (b) => biquad(b, 'bp', 550, 0.6, sr)), 0.35, bladeEnv);
  const tail = new Float32Array(n);
  addOsc(tail, quant(93, L), 1, sr, 0.8, lfo(n, sr, 2, rng), 0.004, rng.next());
  circular(tail, samples(sr, 0.05), (b) => lp1(lp1(b, 1100, sr), 1400, sr));
  addLayer(out, normalize(tail, 1), 0.14);
  const fm = lfo(n, sr, 1, rng);
  addSine(out, quant(2900, L), 0.035, sr, fm, 0.003);
  addSine(out, quant(5800, L), 0.018, sr, fm, 0.003);
  addSine(out, quant(1150, L), 0.025, sr, fm, 0.002);
  addLayer(out, noiseLayer(n, rng, sr, (b) => hp1(hp1(b, 3000, sr), 3000, sr)), 0.05);
  addRumble(out, rng, sr, 0.35, 100, bladeEnv, 0.5);
  return { ch: [finishLoop(out, 1.2)] };
}

// Fast jet: broadband roar with turbulent wobble, shock crackle, fan whine.
export function jetLoop(rng, sr) {
  const L = 3;
  const n = samples(sr, L);
  const out = new Float32Array(n);
  const wobble = lfo(n, sr, 5, rng);
  const roar = noiseLayer(n, rng, sr, (b) => {
    biquad(b, 'bp', 450, 0.5, sr);
    lp1(b, 6000, sr);
  }, 'pink');
  for (let i = 0; i < n; i++) out[i] += roar[i] * (1 + 0.25 * wobble[i]);
  const crack = new Float32Array(n);
  const pops = Math.round(85 * L);
  for (let k = 0; k < pops; k++) {
    const len = Math.max(2, samples(sr, rng.range(0.0002, 0.0012)));
    const a = (0.2 + 0.8 * rng.pow(2.2)) * (rng.chance(0.5) ? 1 : -1);
    const p = new Float32Array(len);
    for (let i = 0; i < len; i++) p[i] = a * (1 - i / len);
    mixWrap(crack, p, rng.int(n), 1);
  }
  circular(crack, samples(sr, 0.05), (b) => hp1(hp1(b, 1500, sr), 1500, sr));
  addLayer(out, normalize(crack, 1), 0.3);
  const fm = lfo(n, sr, 1, rng);
  addSine(out, quant(2400, L), 0.06, sr, fm, 0.003);
  addSine(out, quant(3350, L), 0.045, sr, fm, 0.003);
  addSine(out, quant(5100, L), 0.03, sr, fm, 0.003);
  addRumble(out, rng, sr, 0.5, 80);
  return { ch: [finishLoop(out, 1.3)] };
}

// Four-engine turboprop: slightly unsynchronised propellers beat against each other.
export function planeLoop(rng, sr) {
  const L = 4;
  const n = samples(sr, L);
  const out = new Float32Array(n);
  const props = [68, 68.25, 68.5, 67.75];
  const fm = lfo(n, sr, 0.5, rng);
  for (const f of props) addOsc(out, quant(f, L), 0.25, sr, 0.85, fm, 0.001, rng.next());
  // The beat lives in the blade-passing fundamental and its first few harmonics.
  circular(out, samples(sr, 0.1), (b) => {
    lp1(b, 700, sr);
    biquad(b, 'peak', 140, 1, sr, 6);
  });
  // Unsynchronised props drift in and out of phase: a slow "wah-wah" swell (2 per loop).
  const ph0 = rng.next() * TAU;
  for (let i = 0; i < n; i++) out[i] *= 1 - 0.55 * (0.5 + 0.5 * Math.cos((TAU * 2 * i) / n + ph0));
  normalize(out, 0.8);
  for (const d of [-1.5, -0.5, 0.75, 1.75]) addSine(out, quant(2100 + d, L), 0.012, sr);
  addLayer(out, noiseLayer(n, rng, sr, (b) => lp1(lp1(b, 1200, sr), 1600, sr), 'pink'), 0.18);
  addRumble(out, rng, sr, 0.18, 90);
  return { ch: [finishLoop(out, 1.1)] };
}

// FPV quadcopter: four detuned motors with nervous throttle corrections.
export function droneLoop(rng, sr) {
  const L = 2;
  const n = samples(sr, L);
  const out = new Float32Array(n);
  const base = rng.range(235, 250);
  for (let m = 0; m < 4; m++) {
    addOsc(out, quant(base * (1 + 0.03 * m), L), 0.3, sr, 0.7, lfo(n, sr, 4, rng), 0.025, rng.next());
  }
  circular(out, samples(sr, 0.05), (b) => {
    biquad(b, 'peak', 1800, 1.2, sr, 6);
    biquad(b, 'lp', 8000, 0.7, sr);
  });
  normalize(out, 1);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = 0.6 + 0.4 * Math.abs(out[i]);
  addLayer(out, noiseLayer(n, rng, sr, (b) => hp1(hp1(b, 2000, sr), 2000, sr)), 0.25, env);
  for (let m = 0; m < 4; m++) addSine(out, quant(3400 + 37 * m, L), 0.012, sr);
  return { ch: [finishLoop(out, 1.5)] };
}

// Small two-stroke reconnaissance UAV engine and pusher prop.
export function uavLoop(rng, sr) {
  const L = 2;
  const n = samples(sr, L);
  const out = new Float32Array(n);
  const pulses = Math.round(112 * L);
  const period = n / pulses;
  const shape = pulseShape(sr, 0.0004, 0.0025);
  for (let k = 0; k < pulses; k++) {
    const amp = rng.chance(0.1) ? 0.4 : 1 + 0.2 * rng.bi();
    mixWrap(out, shape, Math.round(k * period + rng.bi() * 0.04 * period), amp);
  }
  circular(out, samples(sr, 0.1), (b) => {
    hp1(b, 40, sr);
    biquad(b, 'peak', 650, 2, sr, 8);
    biquad(b, 'peak', 1900, 3, sr, 5);
    lp1(b, 6000, sr);
  });
  normalize(out, 1);
  const prop = new Float32Array(n);
  addOsc(prop, quant(224, L), 1, sr, 1, null, 0, rng.next());
  circular(prop, samples(sr, 0.05), (b) => lp1(lp1(b, 1000, sr), 1000, sr));
  addLayer(out, normalize(prop, 1), 0.15);
  addLayer(out, noiseLayer(n, rng, sr, (b) => biquad(b, 'bp', 1000, 0.8, sr)), 0.2, pulseEnvelope(n, pulses, sr, 0.003, 0.8));
  return { ch: [finishLoop(out, 1.6)] };
}

function fireChannel(rng, sr, n, roar) {
  const out = new Float32Array(n);
  addLayer(out, roar, 0.6);
  const flutterEnv = smoothRandom(n, Math.round((n / sr) * 10), rng, true);
  for (let i = 0; i < n; i++) flutterEnv[i] = Math.abs(flutterEnv[i]);
  addLayer(out, noiseLayer(n, rng, sr, (b) => biquad(b, 'bp', 500, 0.8, sr)), 0.35, flutterEnv);
  const crack = new Float32Array(n);
  const count = Math.round((25 * n) / sr);
  for (let k = 0; k < count; k++) {
    const big = rng.chance(0.08);
    const len = Math.max(2, samples(sr, big ? rng.range(0.005, 0.01) : rng.range(0.0003, 0.003)));
    const p = white(len, rng.seed());
    const a = 0.15 + 0.85 * rng.pow(2.5);
    for (let i = 0; i < len; i++) p[i] *= a * (1 - i / len) ** 2;
    if (big) lp1(p, 1500, sr);
    mixWrap(crack, p, rng.int(n), big ? 2 : 1);
  }
  circular(crack, samples(sr, 0.05), (b) => hp1(b, 900, sr));
  addLayer(out, normalize(crack, 1), 0.55);
  addLayer(out, noiseLayer(n, rng, sr, (b) => hp1(hp1(b, 4000, sr), 4000, sr)), 0.05);
  return normalize(out, 0.9);
}

export function fireLoop(rng, sr) {
  const n = samples(sr, 4);
  const mod = smoothRandom(n, 6, rng, true);
  const roar = noiseLayer(n, rng, sr, (b) => {
    lp1(b, 250, sr);
    lp1(b, 300, sr);
  }, 'brown');
  for (let i = 0; i < n; i++) roar[i] *= 0.7 + 0.3 * mod[i];
  return { ch: [fireChannel(rng, sr, n, roar), fireChannel(rng, sr, n, roar)] };
}

// Self-propelled AA radar: 400 Hz electrics, rotating antenna whoosh, servo whine.
export function radarLoop(rng, sr) {
  const L = 2;
  const n = samples(sr, L);
  const out = new Float32Array(n);
  for (const [h, a] of [[1, 1], [2, 0.5], [3, 0.25], [5, 0.1]]) addSine(out, 400 * h, 0.12 * a, sr);
  const rot = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = 0.5 + 0.5 * Math.cos((TAU * i) / (n / 2));
    rot[i] = c ** 4;
  }
  addLayer(out, noiseLayer(n, rng, sr, (b) => biquad(b, 'bp', 900, 0.8, sr)), 0.18, rot);
  const servo = new Float32Array(n);
  for (let i = 0; i < n; i++) servo[i] = Math.sin((TAU * 2 * i) / n);
  addSine(out, quant(1630, L), 0.06, sr, servo, 0.01);
  addSine(out, 50, 0.05, sr);
  return { ch: [finishLoop(out)] };
}
