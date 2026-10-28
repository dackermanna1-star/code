/**
 * Procedural sound effects for Ragdoll Lab: Web Audio API only, no audio files or other assets.
 *
 * Everything is synthesised at runtime from cached noise buffers (white / pink / brown / crackle),
 * oscillators, biquad filters, wave shapers and gain envelopes, plus a few small "grain banks"
 * (modal rings for metal, glass, wood and bowling balls; brass casings; glass shards; droplets;
 * concrete grit; cloth; bone micro-fractures) rendered in JS in small idle slices after unlock()
 * (or on first use) and then replayed with random pitch, filter and level variation. A generated
 * stereo impulse response (discrete early reflections + a frequency-damped diffuse tail, RT60
 * ~1.25 s) gives the bare concrete test arena its room sound.
 *
 * Signal flow
 *   layers -> voice.out -+-> [air / head-shadow low-pass] -> [stereo pan] -> dry ---------+
 *   (level, distance     |       (gunshots: -> gun bus -> fast gun limiter) ------------+
 *    gain, steal fade)   +-> send -> reverbIn -> convolver (room IR) -> wet -------------+-> bus
 *   bus -> high-pass 25 Hz -> master limiter -> master volume -> soft clip -> destination
 * Gunshots get their own limiter so they can slam it without ducking the bullet impacts and
 * everything else; the master limiter only catches sums, and the soft clip never exceeds ~0.95.
 *
 * Voices and budgets
 *   - Each one-shot is a Voice that owns its nodes and disconnects all of them once its last
 *     source has ended (every source gets a scheduled stop()), so nothing leaks.
 *   - At most `maxVoices` (24) voices sound at once. When full, a new sound steals the
 *     lowest-priority voice (short fade) or is dropped if it is the least important itself.
 *   - Every category has a token-bucket rate limit (impact() of one material at most every 25 ms,
 *     plus a global impact budget). impact() calls made during one frame are merged per material
 *     (the strongest wins) and played from a microtask, so a physics loop can call it for every
 *     contact; rapid repeated contacts (rolling, sliding) are additionally softened.
 *
 * Usage
 *   const audio = new AudioEngine();
 *   addEventListener('pointerdown', () => audio.unlock()); // must run inside a user gesture
 *   audio.setListener(camera.position, cameraDirection);   // optional, metres
 *   audio.gunshot('rifle', muzzle);
 *   audio.bulletImpact('flesh', hit.point, 1);
 *   audio.impact('wood', 0.4, contact.point);
 *
 * Every public method is a silent no-op until unlock() has created a running AudioContext, and
 * none of them throws: errors are caught and logged (rate-limited) so audio can never break the
 * simulation. `new AudioEngine({ context })` accepts an existing (e.g. Offline) AudioContext,
 * which is handy for tests and offline renders.
 */

const TAU = Math.PI * 2;
const MAX_VOICES = 24;
const MAX_FADING = 8; // stolen voices still fading out; beyond this, minor sounds are dropped
const NO_OPTS = Object.freeze({});
const REF_DISTANCE = 2; // m: no distance attenuation closer than this
const SPEED_OF_SOUND = 343; // m/s
const MAX_PROPAGATION_DELAY = 0.06; // s: cap so distant sounds never drift far from the picture
const IMPACT_INTERVAL = 0.025; // s: minimum spacing of impact() sounds of one material
const IMPACT_MIN = 0.012; // impact() intensities below this are inaudible and ignored
const REVERB_SECONDS = 1.5;
const REVERB_RT60 = 1.25;
const REVERB_RETURN = 0.5;
const NOISE_SECONDS = 1;

export const GUN_TYPES = Object.freeze(['pistol', 'revolver', 'shotgun', 'smg', 'rifle', 'sniper']);
export const IMPACT_MATERIALS = Object.freeze([
  'flesh', 'wood', 'metal', 'glass', 'rubber', 'leather', 'brick', 'bowling', 'concrete',
]);

// ---------------------------------------------------------------------------------------------
// Small helpers

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
/** x scaled by a random factor in [1 - amt, 1 + amt]. */
const vary = (x, amt) => x * (1 + (Math.random() * 2 - 1) * amt);
/** The number itself if finite, otherwise the fallback. */
const num = (x, fallback) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/** Small deterministic PRNG so the generated buffers are identical on every run. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Percussive envelope on an AudioParam: 0 -> peak in `att` seconds (linear), then an exponential
 * decay with time constant `tau`. Returns the time at which it has decayed by `span` time
 * constants (7 = -61 dB; quiet layers can stop earlier).
 */
function perc(param, t, peak, att, tau, span = 7) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + att);
  param.setTargetAtTime(0, t + att, tau);
  return t + att + tau * span;
}

/**
 * How many time constants a decaying layer needs until it is ~-70 dB below full scale: loud
 * layers ring out fully, quiet ones stop (and free their nodes) much sooner.
 */
const spanFor = (level) => clamp(Math.log(Math.max(level, 1e-6) / 3e-4), 2.5, 7.5);

/** Exponential glide of a frequency-like param (both ends kept strictly positive). */
function glide(param, t, from, to, dur) {
  param.setValueAtTime(Math.max(1, from), t);
  param.exponentialRampToValueAtTime(Math.max(1, to), t + Math.max(0.001, dur));
}

/** Envelope curve sampled into `n` points, scaled by `peak`; the last point is always 0. */
function curve(n, peak, fn) {
  const c = new Float32Array(n);
  for (let i = 0; i < n - 1; i++) c[i] = peak * fn(i / (n - 1));
  return c;
}

/** Swell: smooth rise to 1 at `p` (0..1), then a smooth fall back to 0. */
function swell(p, fallPow = 1.5) {
  return (x) => (x < p
    ? Math.sin(0.5 * Math.PI * x / p) ** 2
    : Math.cos(0.5 * Math.PI * (x - p) / (1 - p)) ** fallPow);
}

// ---------------------------------------------------------------------------------------------
// Buffer renderers: pure functions filling a Float32Array (data, sampleRate, rng or seed)

function normalizePeak(d, peak) {
  let m = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > m) m = a;
  }
  if (m > 0) {
    const s = peak / m;
    for (let i = 0; i < d.length; i++) d[i] *= s;
  }
}

function normalizeRms(d, rms) {
  let e = 0;
  for (let i = 0; i < d.length; i++) e += d[i] * d[i];
  const r = Math.sqrt(e / d.length);
  if (r > 0) {
    const s = rms / r;
    for (let i = 0; i < d.length; i++) d[i] *= s;
  }
}

/** Raised-cosine fade over the last `seconds` so truncated rings never click. */
function fadeTail(d, sr, seconds) {
  const n = Math.min(d.length, Math.floor(seconds * sr));
  for (let i = 0; i < n; i++) d[d.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / n);
}

/**
 * Fills `d` with uniform white noise in [-1, 1) from an inline xorshift32. No per-sample function
 * call, so even the first (not yet JIT-compiled) run over a buffer is fast.
 */
function fillWhite(d, seed) {
  let x = seed | 0 || 0x2545f491;
  for (let i = 0; i < d.length; i++) {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    d[i] = x * 4.656612873077393e-10;
  }
}

/**
 * Adds a damped sinusoid amp * r^k * sin(w k + phase) starting at sample i0. Uses the two-pole
 * resonator recurrence, so it costs two multiplies per sample instead of a sin() call.
 */
function addMode(d, sr, i0, f, tau, amp, phase = 0) {
  if (!(f > 0) || f >= sr * 0.45 || !(tau > 0) || i0 < 0 || i0 >= d.length) return;
  const w = TAU * f / sr;
  const r = Math.exp(-1 / (tau * sr));
  const c = 2 * r * Math.cos(w);
  const r2 = r * r;
  const n = Math.min(d.length - i0, Math.ceil(tau * sr * 7));
  let y0 = amp * Math.sin(phase);
  let y1 = amp * r * Math.sin(w + phase);
  d[i0] += y0;
  if (n > 1) d[i0 + 1] += y1;
  for (let k = 2; k < n; k++) {
    const y = c * y1 - r2 * y0;
    d[i0 + k] += y;
    y0 = y1;
    y1 = y;
  }
}

let noiseTable = null; // 16k white samples shared by the grain renderers

/** Short, low-passed noise burst (a "tick" of contact) starting at sample i0. */
function addBurst(d, sr, rng, i0, amp, tau, smooth) {
  if (!noiseTable) {
    noiseTable = new Float32Array(16384);
    fillWhite(noiseTable, 0x6a09e667);
  }
  const n = Math.min(d.length - i0, Math.ceil(tau * sr * 6));
  const decay = Math.exp(-1 / (tau * sr));
  let lp = 0, a = amp, j = (rng() * 16384) | 0;
  for (let i = 0; i < n; i++) {
    lp += smooth * (noiseTable[j++ & 16383] - lp);
    d[i0 + i] += a * lp;
    a *= decay;
  }
}

// --- Level calibration of filtered noise -------------------------------------------------------
// A noise burst band-passed at 1 kHz keeps only a few percent of the buffer's power, so raw gains
// would make every filtered layer far quieter than an oscillator of the same nominal peak. Each
// layer is therefore scaled by 1/sqrt(fraction of the buffer's power its filter chain passes),
// estimated from analog biquad prototypes on a log-frequency grid against the buffer's spectrum.
// Layer gains in the sound tables thus read as (roughly) the layer's real output peak.

const GRID_N = 96;

/** |H(f)|^2 of an analog 2nd-order prototype; low/high-pass Q in dB as Web Audio defines it. */
function mag2(type, f, f0, Q) {
  const r = f / f0, r2 = r * r, d = (1 - r2) * (1 - r2);
  if (type === 'bandpass') {
    const b = r / Q;
    return (b * b) / (d + b * b);
  }
  if (type === 'lowpass' || type === 'highpass') {
    const b = r / 10 ** (Q / 20);
    const den = d + b * b;
    return type === 'lowpass' ? 1 / den : (r2 * r2) / den;
  }
  return 1;
}

function makeGrid(nyquist) {
  const f = new Float64Array(GRID_N);
  for (let i = 0; i < GRID_N; i++) f[i] = 20 * (nyquist * 0.98 / 20) ** (i / (GRID_N - 1));
  // power per log-frequency step (PSD * f) of each noise colour
  const spectra = {
    white: (x) => x,
    crackle: (x) => x * (1.2 - 0.9 * Math.cos(Math.PI * x / nyquist)),
    pink: () => 1,
    brown: (x) => x / (x * x + 1600),
  };
  const grid = { f };
  for (const [name, fn] of Object.entries(spectra)) {
    const w = new Float64Array(GRID_N);
    let total = 0;
    for (let i = 0; i < GRID_N; i++) {
      w[i] = fn(f[i]);
      total += w[i];
    }
    grid[name] = { w, total };
  }
  return grid;
}

const NOISES = {
  white(d, sr, seed) {
    fillWhite(d, seed);
    normalizeRms(d, 0.35);
  },
  // Paul Kellet's refined pink filter: -3 dB/octave, natural for rumble and "air".
  pink(d, sr, seed) {
    fillWhite(d, seed);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = d[i];
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
    normalizeRms(d, 0.35);
  },
  // Leaky-integrated white noise: -6 dB/octave above 40 Hz (the weight behind thuds and booms),
  // with the sub-sonic part removed so its power is all audible.
  brown(d, sr, seed) {
    fillWhite(d, seed);
    const leak = Math.exp(-TAU * 40 / sr);
    const hpA = Math.exp(-TAU * 25 / sr);
    let b = 0, hp = 0, prev = 0;
    for (let i = 0; i < d.length; i++) {
      b = leak * b + d[i] * 0.05;
      hp = hpA * (hp + b - prev);
      prev = b;
      d[i] = hp;
    }
    normalizeRms(d, 0.35);
  },
  // Sparse random clicks with a heavy-tailed amplitude: crunch, grit and splinters when filtered.
  crackle(d, sr, seed) {
    // Poisson clicks (~2600/s): jump straight to the next one with exponential gaps
    const rng = mulberry32(seed);
    const mean = sr / 2600;
    const gap = () => Math.floor(-Math.log(1 - rng()) * mean);
    for (let i = gap(); i < d.length - 1; i += 1 + gap()) {
      const a = (rng() < 0.5 ? -1 : 1) * (0.15 + 0.85 * rng() ** 2);
      d[i] += a;
      d[i + 1] -= a * 0.45;
    }
    normalizeRms(d, 0.35);
  },
};

/**
 * Friedlander blast wave p(t) = (1 - t/t*) exp(-b t/t*): the pressure pulse of a muzzle blast,
 * with its long negative phase. High-passed at 25 Hz like a real microphone would.
 */
function renderBlast(d, sr, tStarMs) {
  const ts = tStarMs / 1000;
  const b = 1.6;
  const a = Math.exp(-TAU * 25 / sr);
  let hp = 0, prev = 0;
  for (let i = 0; i < d.length; i++) {
    const x = i / sr / ts;
    const p = (1 - x) * Math.exp(-b * x);
    hp = a * (hp + p - prev);
    prev = p;
    d[i] = hp;
  }
  fadeTail(d, sr, 0.004);
  normalizePeak(d, 1);
}

/** Ballistic N-wave of a supersonic bullet: instant overpressure, linear fall, instant recovery. */
function renderNWave(d, sr, durMs) {
  const n = Math.max(3, Math.round(durMs / 1000 * sr));
  for (let i = 0; i <= n && i < d.length; i++) d[i] = 1 - 2 * i / n;
}

/** Modal ring of a struck object: a set of damped partials plus a short excitation click. */
function renderRing(d, sr, rng, spec) {
  for (let k = 0; k < spec.ratios.length; k++) {
    const f = spec.f0 * spec.ratios[k] * (1 + (rng() * 2 - 1) * spec.detune);
    const tau = spec.taus[k] * (0.75 + 0.5 * rng());
    addMode(d, sr, 0, f, tau, spec.amps[k] * (0.6 + 0.4 * rng()), rng() * TAU);
  }
  addBurst(d, sr, rng, 0, spec.click * 3, spec.clickTau, 0.6);
  fadeTail(d, sr, 0.15);
  normalizePeak(d, 0.9);
}

const RINGS = {
  // Free-free bar modes plus a few plate-like extras: a "ping" at high rates, "clang" at low ones.
  metal: {
    f0: 600, detune: 0.025, click: 0.5, clickTau: 0.0006,
    ratios: [1, 2.756, 5.404, 8.933, 1.59, 3.52, 4.67, 6.95],
    taus: [0.6, 0.4, 0.25, 0.15, 0.45, 0.3, 0.22, 0.14],
    amps: [1, 0.7, 0.45, 0.3, 0.45, 0.35, 0.28, 0.2],
  },
  glass: {
    f0: 2000, detune: 0.03, click: 0.35, clickTau: 0.0004,
    ratios: [1, 2.32, 2.97, 4.25, 5.6],
    taus: [0.3, 0.2, 0.16, 0.1, 0.07],
    amps: [1, 0.55, 0.45, 0.3, 0.2],
  },
  wood: {
    f0: 300, detune: 0.05, click: 0.8, clickTau: 0.0008,
    ratios: [1, 2.52, 3.86, 5.4, 7.1],
    taus: [0.055, 0.035, 0.025, 0.018, 0.012],
    amps: [1, 0.6, 0.45, 0.3, 0.2],
  },
  bowling: {
    f0: 380, detune: 0.03, click: 0.6, clickTau: 0.0007,
    ratios: [1, 1.47, 2.09, 2.83, 3.9],
    taus: [0.12, 0.085, 0.06, 0.045, 0.03],
    amps: [1, 0.6, 0.5, 0.35, 0.2],
  },
};

/** A spent brass case dropping on concrete: 3-5 bounces with shrinking gaps, bright tinks. */
function renderCasing(d, sr, rng) {
  const base = 4200 * (0.9 + 0.2 * rng());
  const ratios = [1, 1.47, 2.31, 2.9, 3.8];
  const end = d.length / sr - 0.1;
  let t = 0.003, gap = 0.1 + 0.08 * rng(), amp = 1;
  const bounces = 3 + Math.floor(rng() * 3);
  for (let b = 0; b < bounces && t < end; b++) {
    const i0 = Math.floor(t * sr);
    addBurst(d, sr, rng, i0, amp * 0.9, 0.0004, 0.8);
    for (let k = 0; k < ratios.length; k++) {
      const f = base * ratios[k] * (1 + 0.01 * (rng() * 2 - 1));
      const tau = (0.04 + 0.08 * rng()) / (1 + 0.35 * k);
      addMode(d, sr, i0, f, tau, amp * 0.35 * (0.25 + 0.75 * rng()) / (1 + 0.4 * k), rng() * TAU);
    }
    t += gap;
    gap *= 0.55 + 0.2 * rng();
    amp *= 0.45 + 0.25 * rng();
  }
  fadeTail(d, sr, 0.05);
  normalizePeak(d, 0.9);
}

/** Glass shards: a dense first burst, then pieces skittering and bouncing for about a second. */
function renderShards(d, sr, rng) {
  const dur = d.length / sr;
  for (let k = 0; k < 80; k++) {
    const early = rng() < 0.4;
    const t = early ? 0.001 + rng() ** 1.6 * 0.07 : 0.03 + rng() ** 1.7 * (dur - 0.25);
    const i0 = Math.floor(t * sr);
    const size = rng();
    const amp = (early ? 0.8 : 0.55 * (1 - t / dur)) * (0.2 + 0.8 * rng() * rng());
    const f = 2000 + (1 - size) * 6500 + rng() * 1200;
    const tau = (0.004 + 0.035 * size * rng()) * (early ? 1.3 : 1);
    addMode(d, sr, i0, f, tau, amp, rng() * TAU);
    addMode(d, sr, i0, f * (1.47 + 0.6 * rng()), tau * 0.6, amp * 0.6 * rng(), rng() * TAU);
    if (rng() < 0.5) addMode(d, sr, i0, f * (2.3 + rng()), tau * 0.4, amp * 0.4 * rng(), rng() * TAU);
    addBurst(d, sr, rng, i0, amp * 0.8, 0.0003, 0.9);
  }
  fadeTail(d, sr, 0.1);
  normalizePeak(d, 0.9);
}

/** Liquid spatter: drop ticks, a few bubble "plips" (rising chirps) and heavier wet chunks. */
function renderDroplets(d, sr, rng) {
  const dur = d.length / sr;
  for (let k = 0; k < 60; k++) {
    const t = rng() ** 2.2 * (dur - 0.08);
    const i0 = Math.floor(t * sr);
    const size = rng();
    const amp = (0.25 + 0.75 * rng()) * (1 - 0.7 * t / dur);
    addBurst(d, sr, rng, i0, amp * 2.2, 0.0008 + 0.003 * size, 0.25 + 0.5 * (1 - size));
    if (rng() < 0.45) {
      const f0 = 900 + 2600 * (1 - size) * rng();
      const rise = 1.3 + 0.9 * rng();
      const tau = 0.003 + 0.008 * rng();
      const n = Math.min(d.length - i0, Math.floor(tau * 6 * sr));
      const decay = Math.exp(-1 / (tau * sr));
      const w0 = TAU * f0 / sr, dw = w0 * (rise - 1) / n;
      let ph = 0, a = amp * 0.5;
      for (let i = 0; i < n; i++) {
        ph += w0 + dw * i;
        d[i0 + i] += a * Math.sin(ph);
        a *= decay;
      }
    }
  }
  for (let k = 0; k < 5; k++) {
    const i0 = Math.floor((0.02 + rng() * 0.35) * sr);
    addBurst(d, sr, rng, i0, 4 * (0.4 + 0.6 * rng()), 0.008 + 0.02 * rng(), 0.06);
  }
  fadeTail(d, sr, 0.06);
  normalizePeak(d, 0.9);
}

/** Concrete grit: fine chips raining back down after a bullet strike. */
function renderDebris(d, sr, rng) {
  const dur = d.length / sr;
  for (let k = 0; k < 90; k++) {
    const t = rng() ** 1.5 * (dur - 0.05);
    const i0 = Math.floor(t * sr);
    const amp = (0.15 + 0.85 * rng() * rng()) * (1 - t / dur) ** 1.5;
    addMode(d, sr, i0, 1400 + 5000 * rng(), 0.0008 + 0.003 * rng(), amp, rng() * TAU);
    addBurst(d, sr, rng, i0, amp * 0.6, 0.0003, 0.9);
  }
  for (let k = 0; k < 6; k++) {
    const t = 0.02 + rng() * 0.3;
    const i0 = Math.floor(t * sr);
    const amp = 0.8 * (1 - t / dur);
    addMode(d, sr, i0, 700 + 700 * rng(), 0.004 + 0.003 * rng(), amp, rng() * TAU);
    addBurst(d, sr, rng, i0, amp * 0.8, 0.0006, 0.6);
  }
  fadeTail(d, sr, 0.05);
  normalizePeak(d, 0.9);
}

/** Fabric rustle: band-passed noise with a crinkly amplitude texture and a few shuffling swells. */
function renderCloth(d, sr, rng) {
  const n = d.length, dur = n / sr;
  const env = new Float32Array(n);
  const bumps = 3 + Math.floor(rng() * 3);
  for (let b = 0; b < bumps; b++) {
    const c = 0.015 + rng() ** 1.5 * (dur - 0.15);
    const w = 0.025 + 0.08 * rng();
    const a = (0.35 + 0.65 * rng()) * (1 - 0.6 * c / dur);
    const i1 = Math.min(n, Math.ceil((c + 3 * w) * sr));
    for (let i = Math.max(0, Math.floor((c - 3 * w) * sr)); i < i1; i++) {
      const x = (i / sr - c) / w;
      env[i] += a * Math.exp(-x * x);
    }
  }
  // RBJ band-pass around 2.8 kHz (constant 0 dB peak)
  const w0 = TAU * 2800 / sr, alpha = Math.sin(w0) / (2 * 0.6), cw = Math.cos(w0), a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * cw / a0, a2 = (1 - alpha) / a0;
  const noise = new Float32Array(n), wobble = new Float32Array(n);
  fillWhite(noise, (rng() * 0x7fffffff) | 0);
  fillWhite(wobble, (rng() * 0x7fffffff) | 0);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, am = 0;
  for (let i = 0; i < n; i++) {
    const x = noise[i];
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    am += 0.02 * (Math.abs(wobble[i]) - am); // slow random amplitude: the "crinkle"
    d[i] = y * env[i] * (0.3 + 1.6 * am);
  }
  // sparse louder grains: fibres catching on the concrete (~140 per second)
  for (let i = Math.floor(rng() * 300); i < n; i += 1 + Math.floor(-Math.log(1 - rng()) * 333)) {
    d[i] *= 4;
  }
  fadeTail(d, sr, 0.04);
  normalizePeak(d, 0.9);
}

/** Bone fracture: a cluster of micro-cracks plus fibrous crackle, all within ~90 ms. */
function renderCrunch(d, sr, rng) {
  const n = 8 + Math.floor(rng() * 7);
  for (let k = 0; k < n; k++) {
    const t = rng() ** 1.8 * 0.09;
    const i0 = Math.floor(t * sr);
    const amp = (0.3 + 0.7 * rng()) * (1 - t / 0.12);
    const tau = 0.0012 + 0.004 * rng();
    addBurst(d, sr, rng, i0, amp * 1.5, tau * 0.5, 0.7);
    addMode(d, sr, i0, 900 + 3000 * rng(), tau, amp * 0.8, 0);
  }
  const m = Math.min(d.length, Math.floor(0.07 * sr));
  for (let i = 0; i < m; i++) {
    const t = i / sr;
    if (rng() < 0.06 * Math.exp(-t / 0.025)) d[i] += (rng() * 2 - 1) * 0.5 * Math.exp(-t / 0.03);
  }
  fadeTail(d, sr, 0.02);
  normalizePeak(d, 0.9);
}

/** Order in which banks are pre-rendered after unlock (most likely to be needed first). */
const PREWARM_ORDER = [
  'casing', 'droplets', 'debris', 'crunch', 'cloth', 'wood', 'metal', 'glass', 'bowling', 'shards',
];

const BANKS = {
  metal: { count: 4, seconds: 1.4, render: (d, sr, rng) => renderRing(d, sr, rng, RINGS.metal) },
  glass: { count: 4, seconds: 0.9, render: (d, sr, rng) => renderRing(d, sr, rng, RINGS.glass) },
  wood: { count: 4, seconds: 0.35, render: (d, sr, rng) => renderRing(d, sr, rng, RINGS.wood) },
  bowling: { count: 3, seconds: 0.6, render: (d, sr, rng) => renderRing(d, sr, rng, RINGS.bowling) },
  casing: { count: 4, seconds: 0.9, render: renderCasing },
  shards: { count: 3, seconds: 1.3, render: renderShards },
  droplets: { count: 3, seconds: 0.8, render: renderDroplets },
  debris: { count: 3, seconds: 0.6, render: renderDebris },
  cloth: { count: 3, seconds: 0.55, render: renderCloth },
  crunch: { count: 4, seconds: 0.16, render: renderCrunch },
};

/**
 * Stereo impulse response of a small, bare concrete room: sparse early reflections (floor,
 * walls, ceiling) followed by a diffuse tail whose brightness falls over time (high frequencies
 * die first), with the low-end build-up trimmed so booms don't turn to mud.
 */
function renderRoom(d, sr, rng, ch) {
  const noise = new Float32Array(d.length);
  fillWhite(noise, 0x51ed27 + ch * 7919);
  const k = 6.9078 / REVERB_RT60; // amplitude reaches -60 dB at RT60
  const t0 = 0.006;
  const i0 = Math.floor(t0 * sr);
  const hpA = Math.exp(-TAU * 110 / sr);
  const decay = Math.exp(-k / sr);
  let lp = 0, hp = 0, prev = 0, hp2 = 0, prev2 = 0, env = Math.exp(-k * t0);
  for (let blk = i0; blk < d.length; blk += 64) {
    // the tail darkens as it decays: high frequencies die first in a real room
    const a = Math.exp(-TAU * (1600 + 6400 * Math.exp(-blk / sr / 0.3)) / sr), b = 1 - a;
    const end = Math.min(d.length, blk + 64);
    for (let i = blk; i < end; i++) {
      lp = a * lp + b * noise[i];
      hp = hpA * (hp + lp - prev); // two one-pole high-passes: keep booms from turning to mud
      prev = lp;
      hp2 = hpA * (hp2 + hp - prev2);
      prev2 = hp;
      d[i] = hp2 * env;
      env *= decay;
    }
  }
  // the diffuse field builds up over the first 20 ms
  const ramp = Math.floor(0.02 * sr);
  for (let i = 0; i < ramp && i0 + i < d.length; i++) d[i0 + i] *= i / ramp;
  const smear = [1, 0.55, 0.25, 0.1];
  for (let r = 0; r < 16; r++) {
    const t = 0.0025 + rng() ** 1.3 * 0.05 + ch * 0.0007 * rng();
    const i = Math.floor(t * sr);
    const amp = 0.6 * (0.5 + 0.5 * rng()) * Math.exp(-k * t) * (1 - t / 0.07) * (rng() < 0.5 ? -1 : 1);
    for (let j = 0; j < smear.length && i + j < d.length; j++) d[i + j] += amp * smear[j];
  }
  fadeTail(d, sr, 0.2);
}

/** tanh saturation normalised to +-1: thickens gunshots the way a clipping preamp does. */
function driveCurve(k, n = 1024) {
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(k * (i / (n - 1) * 2 - 1)) / norm;
  return c;
}

/** Transparent below 0.8, then a soft knee that never exceeds ~0.95: final clip protection. */
function safetyCurve(n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1) * 2 - 1, a = Math.abs(x);
    c[i] = a <= 0.8 ? x : Math.sign(x) * (0.8 + 0.19 * Math.tanh((a - 0.8) / 0.19));
  }
  return c;
}

// ---------------------------------------------------------------------------------------------
// Sound tables. Noise-layer gains are calibrated (see "Level calibration" above), so every number
// below is roughly that layer's output peak before the master chain.

/**
 * Firearm profiles. Every shot has the same anatomy: a Friedlander muzzle-blast pulse, an optional
 * supersonic N-wave, a bright noise crack, a band-passed mid "bang" (body), a low-mid punch, a
 * brown-noise boom and a short pitch-dropping thump, summed into a tanh drive stage. On top come
 * mechanism noise, the room send and, for big calibres, a rumbling tail plus slap echoes.
 */
const GUNS = {
  pistol: {
    level: 0.9, drive: 2.2, send: 0.55, blastMs: 1.0, blast: 0.8, nwave: 0,
    crack: 1.0, crackHP: 2600, crackTau: 0.003, body: 0.9, bodyF: 1300, bodyQ: 0.9, bodyTau: 0.024,
    punch: 0.7, punchF: 420, punchTau: 0.03, boom: 0.35, boomF: 240, boomTau: 0.03,
    thump: 0.3, thumpF0: 160, thumpF1: 60, thumpTau: 0.026,
    tail: 0, echo: 0, mech: 'slide', casing: true,
  },
  revolver: {
    level: 0.95, drive: 2.5, send: 0.65, blastMs: 1.5, blast: 1.0, nwave: 0,
    crack: 1.0, crackHP: 2300, crackTau: 0.0038, body: 1.0, bodyF: 1100, bodyQ: 0.8, bodyTau: 0.034,
    punch: 0.8, punchF: 380, punchTau: 0.042, boom: 0.5, boomF: 230, boomTau: 0.045,
    thump: 0.4, thumpF0: 140, thumpF1: 50, thumpTau: 0.04,
    tail: 0.15, echo: 0.1, mech: 'tick', casing: false,
  },
  shotgun: {
    level: 1.0, drive: 2.6, send: 0.75, blastMs: 2.6, blast: 1.1, nwave: 0,
    crack: 0.85, crackHP: 2000, crackTau: 0.0045, body: 1.0, bodyF: 950, bodyQ: 0.7, bodyTau: 0.05,
    punch: 0.95, punchF: 300, punchTau: 0.065, boom: 0.7, boomF: 200, boomTau: 0.1,
    thump: 0.5, thumpF0: 110, thumpF1: 40, thumpTau: 0.08,
    tail: 0.45, echo: 0.18, mech: null, casing: false,
  },
  smg: {
    level: 0.8, drive: 2.0, send: 0.45, blastMs: 0.8, blast: 0.75, nwave: 0,
    crack: 1.0, crackHP: 3000, crackTau: 0.0028, body: 0.85, bodyF: 1500, bodyQ: 1.0, bodyTau: 0.018,
    punch: 0.6, punchF: 450, punchTau: 0.022, boom: 0.25, boomF: 260, boomTau: 0.024,
    thump: 0.25, thumpF0: 170, thumpF1: 68, thumpTau: 0.022,
    tail: 0, echo: 0, mech: 'bolt', casing: true,
  },
  rifle: {
    level: 0.95, drive: 2.5, send: 0.65, blastMs: 1.2, blast: 0.95, nwave: 0.32,
    crack: 1.3, crackHP: 3600, crackTau: 0.0032, body: 1.0, bodyF: 1900, bodyQ: 0.9, bodyTau: 0.028,
    punch: 0.7, punchF: 400, punchTau: 0.035, boom: 0.4, boomF: 240, boomTau: 0.04,
    thump: 0.35, thumpF0: 145, thumpF1: 52, thumpTau: 0.035,
    tail: 0.15, echo: 0.12, mech: 'bolt', casing: true,
  },
  sniper: {
    level: 1.0, drive: 2.8, send: 0.85, blastMs: 2.1, blast: 1.2, nwave: 0.48,
    crack: 1.3, crackHP: 3300, crackTau: 0.0035, body: 1.1, bodyF: 1400, bodyQ: 0.8, bodyTau: 0.045,
    punch: 1.0, punchF: 320, punchTau: 0.06, boom: 0.8, boomF: 200, boomTau: 0.1,
    thump: 0.55, thumpF0: 112, thumpF1: 36, thumpTau: 0.11,
    tail: 1.0, echo: 0.35, mech: null, casing: false,
  },
};

/**
 * Collision materials for impact(). Layers scale with intensity I (0..1):
 *   click: [amp, high-pass Hz]                       contact transient, firm hits only
 *   noise: [[type, Hz, Q, tau, amp, buffer, minI]]    filtered noise bursts (Hz scaled by brightness)
 *   tone:  [f0, f1, tau, amp]                         pitched thump gliding f0 -> f1
 *   ring:  [bank, rateLo, rateHi, amp, minI, tauLo, tauHi]  modal ring, damped by intensity
 *   grit:  amp                                        crackle of debris on brittle surfaces
 * (low/high-pass Q values are resonance in dB as Web Audio defines them; band-pass Q is linear.)
 */
const MATERIALS = {
  flesh: {
    gain: 0.85, send: 0.06,
    noise: [['lowpass', 600, 0, 0.028, 0.7, 'pink'], ['bandpass', 1250, 1, 0.008, 0.3, 'white', 0.3]],
    tone: [95, 60, 0.04, 0.3],
  },
  wood: {
    gain: 0.7, send: 0.18, click: [0.35, 3200],
    noise: [['bandpass', 850, 2, 0.018, 0.7]],
    tone: [140, 110, 0.03, 0.15], ring: ['wood', 0.75, 1.3, 0.45, 0.08, 0.04, 0.09],
  },
  metal: {
    gain: 0.6, send: 0.3, click: [0.45, 3800],
    noise: [['bandpass', 2400, 1.6, 0.009, 0.45]],
    ring: ['metal', 0.55, 1.5, 0.5, 0.04, 0.12, 0.6],
  },
  glass: {
    gain: 0.6, send: 0.3, click: [0.4, 5000],
    noise: [['bandpass', 750, 3, 0.016, 0.35]],
    ring: ['glass', 0.75, 1.3, 0.45, 0.03, 0.08, 0.35],
  },
  rubber: {
    gain: 1.0, send: 0.05,
    noise: [['lowpass', 420, 0, 0.028, 0.6, 'pink']],
    tone: [175, 120, 0.035, 0.35],
  },
  leather: {
    gain: 0.65, send: 0.1,
    noise: [['bandpass', 1150, 0.9, 0.013, 0.7], ['lowpass', 380, 0, 0.03, 0.4, 'pink']],
    tone: [110, 80, 0.03, 0.15],
  },
  brick: {
    gain: 0.7, send: 0.2, click: [0.35, 2600],
    noise: [['bandpass', 650, 1.2, 0.022, 0.7]],
    tone: [140, 100, 0.028, 0.15], grit: 0.3,
  },
  bowling: {
    gain: 1.1, send: 0.25, click: [0.3, 3000],
    noise: [['lowpass', 320, 0, 0.05, 0.5, 'pink']],
    tone: [110, 92, 0.06, 0.45], ring: ['bowling', 0.92, 1.08, 0.4, 0.05, 0.06, 0.15],
  },
  concrete: {
    gain: 0.7, send: 0.2, click: [0.35, 2500],
    noise: [['bandpass', 520, 0.9, 0.028, 0.7]],
    tone: [120, 85, 0.035, 0.2], grit: 0.3,
  },
  shoe: {
    gain: 0.55, send: 0.1,
    noise: [['bandpass', 1600, 1.1, 0.01, 0.45], ['lowpass', 350, 0, 0.025, 0.4, 'pink']],
  },
  baseball: {
    gain: 0.7, send: 0.12, click: [0.35, 3000],
    noise: [['bandpass', 1400, 1.2, 0.009, 0.7], ['lowpass', 500, 0, 0.018, 0.3, 'pink']],
    tone: [320, 260, 0.012, 0.2],
  },
  melon: {
    gain: 0.75, send: 0.08,
    noise: [['bandpass', 420, 2.2, 0.03, 0.6, 'pink']],
    tone: [155, 125, 0.05, 0.35],
  },
  generic: {
    gain: 0.6, send: 0.12,
    noise: [['bandpass', 700, 1, 0.02, 0.65]],
    tone: [130, 95, 0.03, 0.2],
  },
};

const MATERIAL_ALIASES = {
  body: 'flesh', skin: 'flesh', human: 'flesh', ragdoll: 'flesh', steel: 'metal', iron: 'metal',
  tin: 'metal', can: 'metal', bottle: 'glass', ceramic: 'glass', plastic: 'rubber', ball: 'rubber',
  tire: 'rubber', tyre: 'rubber', cloth: 'leather', fabric: 'leather', boot: 'shoe', foot: 'shoe',
  stone: 'brick', rock: 'brick', ground: 'concrete', floor: 'concrete', asphalt: 'concrete',
  watermelon: 'melon', fruit: 'melon', default: 'generic',
};

const BULLET_KINDS = { flesh: 'flesh', bone: 'bone', ground: 'ground', metal: 'metal', wood: 'wood' };
const BULLET_ALIASES = {
  body: 'flesh', skin: 'flesh', melon: 'flesh', watermelon: 'flesh', rubber: 'flesh', skull: 'bone',
  concrete: 'ground', floor: 'ground', brick: 'ground', stone: 'ground', bowling: 'ground',
  glass: 'ground', steel: 'metal', iron: 'metal', plank: 'wood', crate: 'wood', baseball: 'wood',
};

/** Formant sets [Hz, Q, gain] for neutral, word-free grunts (adult male vocal tract). */
const GRUNT_VOWELS = [
  [[640, 6, 1], [1190, 9, 0.5], [2390, 12, 0.22], [260, 3, 0.45]], // open "uh"
  [[520, 6, 1], [1450, 10, 0.4], [2500, 12, 0.2], [250, 3, 0.5]], // schwa
  [[560, 6, 1], [920, 8, 0.55], [2400, 12, 0.18], [280, 3, 0.55]], // rounded, half-closed
  [[300, 4, 1], [1050, 8, 0.25], [2300, 10, 0.12], [230, 2.5, 0.6]], // nasal, mouth closed
];

function resolveMaterial(m) {
  const k = typeof m === 'string' ? m.toLowerCase() : 'generic';
  return MATERIALS[k] ? k : MATERIAL_ALIASES[k] || 'generic';
}

function resolveBulletKind(k) {
  const s = typeof k === 'string' ? k.toLowerCase() : 'flesh';
  return BULLET_KINDS[s] || BULLET_ALIASES[s] || 'ground';
}

// ---------------------------------------------------------------------------------------------
// Voice: one sound event, owning its nodes until its last source has ended

class Voice {
  constructor(engine, prio, pos, o) {
    const ctx = engine.ctx;
    this.engine = engine;
    this.ctx = ctx;
    this.prio = prio;
    this.born = ctx.currentTime;
    this.nodes = [];
    this.sources = [];
    this.live = 0; // started sources that have not ended yet
    this.end = 0; // latest scheduled stop time
    this.killed = false;
    this.disposed = false;
    this._onEnded = this._onEnded.bind(this);

    const sp = engine._spatial(pos);
    const now = ctx.currentTime;
    const when = o.when ?? -1;
    this.t = when >= 0 ? Math.max(when, now) : now + 0.004 + (o.propagate === false ? 0 : sp.delay);

    // layers mix into `out`, whose gain carries level, distance attenuation and the steal fade
    this.out = this.gain(sp.gain * (o.level ?? 1));
    let node = this.out;
    if (sp.lowpass) {
      const lp = this.filter('lowpass', sp.lowpass, -3);
      node.connect(lp);
      node = lp;
    }
    if (engine._hasPan && sp.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = sp.pan;
      this.nodes.push(p);
      node.connect(p);
      node = p;
    }
    node.connect(o.bus || engine.dry);
    const send = o.send || 0;
    if (send > 0.001) {
      // the reverberant field falls off more slowly with distance than the direct sound
      const s = this.gain(send * sp.verb / sp.gain);
      this.out.connect(s);
      s.connect(engine.verbIn);
    }
  }

  gain(v = 1) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    this.nodes.push(g);
    return g;
  }

  filter(type, freq, Q = 1, gainDb = 0) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = clamp(freq, 10, this.engine._nyquist * 0.95);
    f.Q.value = Q;
    if (gainDb) f.gain.value = gainDb;
    this.nodes.push(f);
    return f;
  }

  shaper(curveData) {
    const s = this.ctx.createWaveShaper();
    s.curve = curveData;
    this.nodes.push(s);
    return s;
  }

  _start(src, t, stop, offset) {
    src.onended = this._onEnded;
    if (offset === undefined) src.start(t);
    else src.start(t, offset);
    src.stop(stop);
    src.stopAt = stop;
    this.sources.push(src);
    this.nodes.push(src);
    this.live++;
    if (stop > this.end) this.end = stop;
  }

  /** Cached noise buffer from a random offset (looped if the request is long). */
  noise(name, t, dur, rate = 1) {
    const buf = this.engine._noise(name);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    if (rate !== 1) src.playbackRate.value = rate;
    const span = buf.duration;
    const need = dur * rate + 0.01;
    let offset;
    if (need < span) offset = Math.random() * (span - need);
    else {
      src.loop = true;
      offset = Math.random() * span * 0.9;
    }
    this._start(src, t, t + dur + 0.005, offset);
    return src;
  }

  osc(type, freq, t, stop) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type;
    else o.setPeriodicWave(type);
    o.frequency.value = freq;
    this._start(o, t, stop);
    return o;
  }

  buffer(buf, t, rate = 1, maxDur = 0) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    if (rate !== 1) src.playbackRate.value = rate;
    const len = buf.duration / rate;
    this._start(src, t, t + (maxDur > 0 ? Math.min(maxDur, len) : len) + 0.005, 0);
    return src;
  }

  _chain(src, filters, dest) {
    const out = [];
    let node = src;
    if (filters) {
      for (const f of filters) {
        const fl = this.filter(f[0], f[1], f[2], f[3]);
        node.connect(fl);
        node = fl;
        out.push(fl);
      }
    }
    node.connect(dest);
    return out;
  }

  /**
   * Noise burst: buffer -> filters -> percussive gain -> dest. `peak` is calibrated for the
   * filter chain (the layer's real output peak, roughly) unless `raw` is set.
   */
  noiseHit(dest, o) {
    const t = o.t ?? this.t;
    const buf = o.buf || 'white';
    const g = this.gain(0);
    const peak = o.raw ? o.peak : o.peak * this.engine._bandComp(buf, o.filters);
    const end = perc(g.gain, t, peak, o.att ?? 0.001, Math.max(1e-4, o.tau), o.span ?? spanFor(o.peak));
    const src = this.noise(buf, t, end - t, o.rate || 1);
    const filters = this._chain(src, o.filters, g);
    g.connect(dest);
    return { src, gain: g, filters, end };
  }

  /** Pitched thump: oscillator gliding f0 -> f1 under a percussive envelope. */
  toneHit(dest, o) {
    const t = o.t ?? this.t;
    const g = this.gain(0);
    const end = perc(g.gain, t, o.peak, o.att ?? 0.002, Math.max(1e-4, o.tau), o.span ?? spanFor(o.peak));
    const osc = this.osc(o.type || 'sine', o.f0, t, end);
    if (o.f1 && o.f1 !== o.f0) glide(osc.frequency, t, o.f0, o.f1, o.glideT || o.tau * 1.5);
    osc.connect(g);
    g.connect(dest);
    return { osc, gain: g, end };
  }

  /**
   * Random variant from a pre-rendered bank (or the explicit `o.buf`), optionally damped by its
   * own percussive envelope (`o.tau`).
   */
  bankHit(dest, name, o) {
    const buf = o.buf || pick(this.engine._bankReady(name));
    const t = o.t ?? this.t;
    const g = this.gain(o.tau ? 0 : o.peak);
    let maxDur = o.maxDur || 0;
    if (o.tau) {
      const end = perc(g.gain, t, o.peak, o.att || 0.0005, o.tau, spanFor(o.peak));
      maxDur = maxDur ? Math.min(maxDur, end - t) : end - t;
    }
    const src = this.buffer(buf, t, o.rate || 1, maxDur);
    const filters = this._chain(src, o.filters, g);
    g.connect(dest);
    return { src, gain: g, filters };
  }

  /** Called once building is done: a voice that scheduled nothing is released immediately. */
  commit() {
    if (this.live <= 0) this.dispose();
  }

  /** Steal: quick fade, then stop every source (cleanup follows from their `ended` events). */
  kill(fade = 0.015) {
    if (this.killed || this.disposed) return;
    this.killed = true;
    const now = this.ctx.currentTime;
    try {
      const g = this.out.gain;
      if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(now);
      else {
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
      }
      g.linearRampToValueAtTime(0, now + fade);
    } catch (e) {
      // the fade is cosmetic; stopping the sources below is what matters
    }
    const stop = now + fade + 0.005;
    for (const s of this.sources) {
      if (s.stopAt > stop) {
        try {
          s.stop(stop);
          s.stopAt = stop;
        } catch (e) {
          // already stopped
        }
      }
    }
    if (this.end > stop) this.end = stop;
  }

  _onEnded() {
    if (--this.live <= 0) this.dispose();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.sources) s.onended = null;
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch (e) {
        // already disconnected
      }
    }
    this.nodes.length = 0;
    this.sources.length = 0;
    this.engine._release(this);
  }
}

// ---------------------------------------------------------------------------------------------

export class AudioEngine {
  /**
   * @param {object} [opts]
   * @param {BaseAudioContext} [opts.context] use this context instead of creating one (tests,
   *   OfflineAudioContext renders); it is still only wired up by unlock()
   * @param {number} [opts.maxVoices=24] concurrent voice cap
   * @param {number} [opts.volume=0.8] initial master volume 0..1
   */
  constructor(opts = {}) {
    this.ctx = null;
    this.maxVoices = Math.max(1, Math.floor(num(opts.maxVoices, MAX_VOICES)));
    this.volume = clamp(num(opts.volume, 0.8), 0, 1);
    this.voices = [];
    this.stats = { played: 0, dropped: 0, stolen: 0, limited: 0, errors: 0 };
    this.master = null;
    this._ctxOption = opts.context || null;
    this._offline = false;
    this._nyquist = 22050;
    this._hasPan = false;
    this._grid = null;
    this._gw = null;
    this._buffers = new Map();
    this._buckets = new Map();
    this._impactState = new Map();
    this._pending = new Map(); // impact() requests merged per material until the microtask flush
    this._pendingList = [];
    this._flushQueued = false;
    this._listener = { set: false, x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, rx: 1, rz: 0 };
    this._sp = { gain: 1, verb: 1, pan: 0, lowpass: 0, delay: 0 };
    this._hb = { bpm: 0, next: 0, timer: null, voices: [] };
    this._gruntUntil = 0;
    this._warnAt = -Infinity;
    this._flush = this._flush.bind(this);
    this._pumpHeart = this._pumpHeart.bind(this);
  }

  /**
   * Creates (first call) or resumes the AudioContext. Call it from a user gesture (click / key /
   * touch); safe to call repeatedly. Resolves to `ready`.
   */
  unlock() {
    try {
      if (this.ctx && this.ctx.state === 'closed' && !this._ctxOption) this.dispose(); // closed elsewhere
      if (!this.ctx) {
        let ctx = this._ctxOption;
        if (!ctx) {
          const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!Ctor) return Promise.resolve(false);
          try {
            ctx = new Ctor({ latencyHint: 'interactive' });
          } catch (e) {
            ctx = new Ctor();
          }
        }
        this.ctx = ctx;
        this._offline = typeof ctx.startRendering === 'function';
        this._build();
      }
      const ctx = this.ctx;
      if (this._hb.bpm) this._ensureHeartTimer();
      if (!this._offline && ctx.state !== 'running' && ctx.state !== 'closed') {
        this._tickle();
        return Promise.resolve(ctx.resume()).then(() => this.ready, () => false);
      }
      return Promise.resolve(this.ready);
    } catch (e) {
      this._warn(e);
      return Promise.resolve(false);
    }
  }

  /** True once the context exists and is running. */
  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Number of voices currently sounding (excluding ones being faded out after a steal). */
  get voiceCount() {
    let n = 0;
    for (const v of this.voices) if (!v.killed) n++;
    return n;
  }

  /** Master volume 0..1 (smoothed, no zipper noise). */
  setVolume(v) {
    this.volume = clamp(num(v, this.volume), 0, 1);
    if (!this.master) return;
    try {
      const g = this.master.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(this.volume, now, 0.03);
    } catch (e) {
      this._warn(e);
    }
  }

  /**
   * Listener for distance attenuation and stereo panning. `pos` / `forward` are {x, y, z} in
   * metres (e.g. the camera position and view direction). Until this is called, sounds play
   * unattenuated and centred.
   */
  setListener(pos, forward) {
    const L = this._listener;
    if (pos) {
      const x = num(pos.x, NaN), y = num(pos.y, NaN), z = num(pos.z, NaN);
      if (Number.isFinite(x + y + z)) {
        L.x = x;
        L.y = y;
        L.z = z;
        L.set = true;
      }
    }
    if (forward) {
      const fx = num(forward.x, 0), fy = num(forward.y, 0), fz = num(forward.z, 0);
      const len = Math.hypot(fx, fy, fz);
      if (len > 1e-6) {
        L.fx = fx / len;
        L.fy = fy / len;
        L.fz = fz / len;
        // right = forward x up(0, 1, 0), kept horizontal; keep the old one when looking straight down
        const h = Math.hypot(fx, fz);
        if (h > 1e-4 * len) {
          L.rx = -fz / h;
          L.rz = fx / h;
        }
      }
    }
  }

  /** Gun report. type: 'pistol' | 'revolver' | 'shotgun' | 'smg' | 'rifle' | 'sniper'. */
  gunshot(type = 'pistol', pos) {
    if (!this._live()) return;
    try {
      this._gunshot(GUNS[type] ? type : 'pistol', pos);
    } catch (e) {
      this._warn(e);
    }
  }

  /** Bullet strike. kind: 'flesh' | 'bone' | 'ground' | 'metal' | 'wood'. */
  bulletImpact(kind = 'flesh', pos, intensity = 1) {
    if (!this._live()) return;
    try {
      const I = clamp(num(intensity, 1), 0, 1.5);
      if (I >= 0.02) this._bulletImpact(resolveBulletKind(kind), pos, I);
    } catch (e) {
      this._warn(e);
    }
  }

  /**
   * Physical collision. material: 'flesh', 'wood', 'metal', 'glass', 'rubber', 'leather',
   * 'brick', 'bowling', 'concrete' (also 'shoe', 'baseball', 'melon', 'default' and a few aliases;
   * anything unknown gets a generic knock); intensity 0..1 scales loudness, brightness and pitch.
   * Cheap and throttled: calls made in one frame are merged per material and played together.
   */
  impact(material, intensity, pos) {
    if (!this._live()) return;
    try {
      const I = clamp(num(intensity, 0), 0, 1);
      if (I < IMPACT_MIN) return;
      const mat = resolveMaterial(material);
      let e = this._pending.get(mat);
      if (!e) {
        e = { mat, i: 0, n: 0, active: false, hasPos: false, x: 0, y: 0, z: 0 };
        this._pending.set(mat, e);
      }
      if (!e.active) {
        e.active = true;
        e.i = 0;
        e.n = 0;
        this._pendingList.push(e);
      }
      e.n++;
      if (I > e.i) {
        e.i = I;
        e.hasPos = !!pos;
        // copy now: callers often pass pooled vectors that are reused after this frame
        if (pos) {
          e.x = num(pos.x, 0);
          e.y = num(pos.y, 0);
          e.z = num(pos.z, 0);
        }
      }
      if (!this._flushQueued) {
        this._flushQueued = true;
        if (typeof queueMicrotask === 'function') queueMicrotask(this._flush);
        else Promise.resolve().then(this._flush);
      }
    } catch (e) {
      this._warn(e);
    }
  }

  /** Heavy, dull body-on-concrete thud with limbs following and a cloth rustle. */
  bodyFall(intensity = 1, pos) {
    if (!this._live()) return;
    try {
      const I = clamp(num(intensity, 1), 0, 1);
      if (I >= 0.02) this._bodyFall(I, pos);
    } catch (e) {
      this._warn(e);
    }
  }

  /** Fracture: sharp snap plus a muffled crunch of micro-cracks. */
  boneCrack(intensity = 1, pos) {
    if (!this._live()) return;
    try {
      const I = clamp(num(intensity, 1), 0, 1);
      if (I >= 0.02) this._boneCrack(I, pos);
    } catch (e) {
      this._warn(e);
    }
  }

  /** Bottle breaking: impact click, crack burst, crash and a second of tinkling shards. */
  glassShatter(intensity = 1, pos) {
    if (!this._live()) return;
    try {
      const I = clamp(num(intensity, 1), 0, 1);
      if (I >= 0.02) this._glassShatter(I, pos);
    } catch (e) {
      this._warn(e);
    }
  }

  /** Wet splatter: watermelon bursting, blood spray. */
  splat(intensity = 1, pos) {
    if (!this._live()) return;
    try {
      const I = clamp(num(intensity, 1), 0, 1);
      if (I >= 0.02) this._splat(I, pos);
    } catch (e) {
      this._warn(e);
    }
  }

  /** Air whoosh of a thrown / fast object; speed in m/s (about 10..45). */
  whoosh(speed = 20, pos) {
    if (!this._live()) return;
    try {
      this._whoosh(clamp(num(speed, 20), 3, 80), pos);
    } catch (e) {
      this._warn(e);
    }
  }

  /** Short, non-verbal pain grunt / forced exhalation (subtle, never word-like). */
  grunt(intensity = 0.5, pos) {
    if (!this._live()) return;
    try {
      this._grunt(clamp(num(intensity, 0.5), 0, 1), pos);
    } catch (e) {
      this._warn(e);
    }
  }

  /**
   * Soft, muffled lub-dub at `rate` bpm (e.g. while the character is dying). Can be called every
   * frame; the latest rate is used for the next beat. heartbeat(0) stops it.
   */
  heartbeat(rate) {
    try {
      const bpm = num(rate, 0);
      if (!(bpm > 0)) {
        this._stopHeart();
        return;
      }
      this._hb.bpm = clamp(bpm, 25, 220);
      if (!this._live()) return;
      this._ensureHeartTimer();
      this._pumpHeart();
    } catch (e) {
      this._warn(e);
    }
  }

  /** Stops everything and closes the context (e.g. on hot reload). unlock() starts afresh. */
  dispose() {
    try {
      this._stopHeart();
      for (const v of this.voices.slice()) v.dispose();
      if (this.ctx && !this._offline && this.ctx.state !== 'closed' && this.ctx.close) {
        Promise.resolve(this.ctx.close()).catch(() => {});
      }
    } catch (e) {
      this._warn(e);
    }
    this.ctx = null;
    this.master = null;
    this._gw = null;
    this._grid = null;
    this._buffers.clear();
    this._buckets.clear();
    this._impactState.clear();
    this._pendingList.length = 0;
    this._pending.clear();
    this._gruntUntil = 0;
  }

  // -------------------------------------------------------------------------------------------
  // Infrastructure

  _live() {
    const c = this.ctx;
    return !!c && (c.state === 'running' || (this._offline && c.state !== 'closed'));
  }

  _warn(err) {
    this.stats.errors++;
    const now = Date.now();
    if (now - this._warnAt < 5000) return;
    this._warnAt = now;
    if (typeof console !== 'undefined') console.warn('[audio]', err);
  }

  _build() {
    const ctx = this.ctx;
    this._nyquist = ctx.sampleRate / 2;
    this._grid = makeGrid(this._nyquist);
    this._hasPan = typeof ctx.createStereoPanner === 'function';

    this.bus = ctx.createGain();
    this.dry = ctx.createGain();
    this.dry.connect(this.bus);

    // gunshots get their own fast limiter so their peaks never duck everything else
    this.gunBus = ctx.createGain();
    this.gunComp = ctx.createDynamicsCompressor();
    this.gunComp.threshold.value = -12;
    this.gunComp.knee.value = 4;
    this.gunComp.ratio.value = 8;
    this.gunComp.attack.value = 0.0003;
    this.gunComp.release.value = 0.07;
    this.gunBus.connect(this.gunComp);
    this.gunComp.connect(this.bus);

    this.verbIn = ctx.createGain();
    this.verbIn.channelCount = 1;
    this.verbIn.channelCountMode = 'explicit';
    this.verb = ctx.createConvolver();
    this.verb.normalize = false;
    this.verb.buffer = this._roomImpulse();
    this.wet = ctx.createGain();
    this.wet.gain.value = REVERB_RETURN;
    this.verbIn.connect(this.verb);
    this.verb.connect(this.wet);
    this.wet.connect(this.bus);

    // trim sub-sonic energy (blast DC, thump tails) that would only eat limiter headroom
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 25;
    this.hp.Q.value = -3;

    // master limiter: only catches sums of loud events (e.g. a burst plus impacts and room)
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 3;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.1;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.clip = ctx.createWaveShaper();
    this.clip.curve = safetyCurve();

    this.bus.connect(this.hp);
    this.hp.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(this.clip);
    this.clip.connect(ctx.destination);

    this._prewarm();
  }

  /** iOS only unlocks audio once a source has been started inside the gesture. */
  _tickle() {
    try {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.onended = () => src.disconnect();
      src.start(0);
    } catch (e) {
      // not fatal
    }
  }

  /** Renders the grain banks in small idle slices after unlock so first use never hitches. */
  _prewarm() {
    if (this._offline || typeof setTimeout !== 'function') return;
    // one small buffer per task (a few ms each), most commonly needed first
    const tasks = ['white', 'pink', 'brown', 'crackle'].map((n) => () => this._noise(n));
    for (const name of PREWARM_ORDER) {
      for (let i = 0; i < BANKS[name].count; i++) tasks.push(() => this._bank(name, i + 1));
    }
    const ctx = this.ctx;
    const step = () => {
      if (this.ctx !== ctx || !tasks.length) return;
      try {
        tasks.shift()();
      } catch (e) {
        this._warn(e);
        return;
      }
      setTimeout(step, 16);
    };
    setTimeout(step, 0);
  }

  _render(seconds, fn, channels = 1) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(channels, Math.max(2, Math.ceil(seconds * sr)), sr);
    for (let ch = 0; ch < channels; ch++) fn(buf.getChannelData(ch), sr, ch);
    return buf;
  }

  _noise(name) {
    const key = 'noise:' + name;
    let b = this._buffers.get(key);
    if (!b) {
      const fn = NOISES[name] || NOISES.white;
      b = this._render(NOISE_SECONDS, (d, sr) => fn(d, sr, hashString(key)));
      this._buffers.set(key, b);
    }
    return b;
  }

  /**
   * Variants available for playback right now. A real-time context renders just one if the bank
   * is still empty (keeping the first use cheap) and leaves the rest to the prewarm queue.
   */
  _bankReady(name) {
    const b = this._buffers.get(name);
    if (b && (b.length === BANKS[name].count || (b.length && !this._offline))) return b;
    return this._bank(name, this._offline ? Infinity : 1);
  }

  /** Variants of a grain bank, rendering any that are still missing (up to `upTo`). */
  _bank(name, upTo = Infinity) {
    const spec = BANKS[name];
    let b = this._buffers.get(name);
    if (!b) {
      b = [];
      this._buffers.set(name, b);
    }
    for (let i = b.length; i < spec.count && i < upTo; i++) {
      const rng = mulberry32(hashString(name) + i * 7919);
      b.push(this._render(spec.seconds, (d, sr) => spec.render(d, sr, rng)));
    }
    return b;
  }

  _blast(type, ms) {
    const key = 'blast:' + type;
    let b = this._buffers.get(key);
    if (!b) {
      b = this._render(ms * 0.012 + 0.03, (d, sr) => renderBlast(d, sr, ms));
      this._buffers.set(key, b);
    }
    return b;
  }

  _nwave(ms) {
    const key = 'nwave:' + ms;
    let b = this._buffers.get(key);
    if (!b) {
      b = this._render(ms / 1000 + 0.002, (d, sr) => renderNWave(d, sr, ms));
      this._buffers.set(key, b);
    }
    return b;
  }

  _curve(k) {
    const key = 'drive:' + k;
    let c = this._buffers.get(key);
    if (!c) {
      c = driveCurve(k);
      this._buffers.set(key, c);
    }
    return c;
  }

  _roomImpulse() {
    let b = this._buffers.get('room');
    if (!b) {
      b = this._render(REVERB_SECONDS, (d, sr, ch) => renderRoom(d, sr, mulberry32(9001 + ch * 977), ch), 2);
      // normalise to unit energy per channel; the wet gain then sets the room level
      let e = 0;
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        for (let i = 0; i < d.length; i++) e += d[i] * d[i];
      }
      const s = e > 0 ? 1 / Math.sqrt(e / 2) : 1;
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        for (let i = 0; i < d.length; i++) d[i] *= s;
      }
      this._buffers.set('room', b);
    }
    return b;
  }

  _glottalWave() {
    if (!this._gw) {
      // glottal pulse train after lip radiation: harmonics falling ~1/n^1.35
      const n = 48;
      const real = new Float32Array(n), imag = new Float32Array(n);
      for (let k = 1; k < n; k++) imag[k] = k ** -1.35 * (k % 2 ? 1 : 0.85);
      this._gw = this.ctx.createPeriodicWave(real, imag);
    }
    return this._gw;
  }

  /** Gain that brings a filtered noise layer up to the level of the unfiltered buffer. */
  _bandComp(buf, filters) {
    if (!filters || !filters.length) return 1;
    const g = this._grid || (this._grid = makeGrid(this._nyquist));
    const s = g[buf] || g.white;
    let pass = 0;
    for (let i = 0; i < GRID_N; i++) {
      let h = s.w[i];
      for (let j = 0; j < filters.length; j++) {
        const fl = filters[j];
        h *= mag2(fl[0], g.f[i], fl[1], fl[2] ?? 1);
      }
      pass += h;
    }
    return clamp(Math.sqrt(s.total / Math.max(pass, 1e-9)), 1, 12);
  }

  /** Token bucket: `burst` events at once, refilling one token every `interval` seconds. */
  _allow(key, interval, burst = 1) {
    const now = this.ctx.currentTime;
    let b = this._buckets.get(key);
    if (!b) {
      b = { tokens: burst, t: now };
      this._buckets.set(key, b);
    }
    b.tokens = Math.min(burst, b.tokens + (now - b.t) / interval);
    b.t = now;
    if (b.tokens < 1) {
      this.stats.limited++;
      return false;
    }
    b.tokens -= 1;
    return true;
  }

  /** Distance gain, reverb ratio, pan, air/head-shadow low-pass and propagation delay for pos. */
  _spatial(pos) {
    const sp = this._sp;
    sp.gain = 1;
    sp.verb = 1;
    sp.pan = 0;
    sp.lowpass = 0;
    sp.delay = 0;
    const L = this._listener;
    if (!pos || !L.set) return sp;
    const dx = num(pos.x, L.x) - L.x, dy = num(pos.y, L.y) - L.y, dz = num(pos.z, L.z) - L.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(d > 1e-3)) return sp;
    if (d > REF_DISTANCE) {
      sp.gain = Math.max(0.02, REF_DISTANCE / d);
      sp.verb = Math.max(0.15, Math.sqrt(REF_DISTANCE / d));
    }
    const side = (dx * L.rx + dz * L.rz) / d;
    const front = (dx * L.fx + dy * L.fy + dz * L.fz) / d;
    sp.pan = clamp(side * 0.85, -0.85, 0.85) * Math.min(1, d / 0.75);
    let lp = 0;
    if (front < -0.25) lp = 16000 - 8000 * clamp((-front - 0.25) / 0.75, 0, 1); // behind the head
    if (d > 12) {
      const air = 20000 * (12 / d) ** 0.9;
      lp = lp ? Math.min(lp, air) : air;
    }
    sp.lowpass = lp && lp < 15000 ? lp : 0;
    sp.delay = Math.min(MAX_PROPAGATION_DELAY, d / SPEED_OF_SOUND);
    return sp;
  }

  /**
   * Allocates a voice or returns null (budget exhausted). When all voices are busy the
   * lowest-priority (then oldest) one is stolen if the newcomer matters more.
   * opts: send (reverb amount), level, bus (default: dry), when (absolute start time),
   * propagate (false: no speed-of-sound delay).
   */
  _voice(prio, pos, opts = NO_OPTS) {
    const now = this.ctx.currentTime;
    let active = 0, fading = 0, victim = null;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      if (v.end > 0 && v.end + 0.5 < now) {
        v.dispose(); // its `ended` events never arrived (e.g. context was suspended): reclaim
        continue;
      }
      if (v.killed) {
        fading++;
        continue;
      }
      active++;
      if (!victim || v.prio < victim.prio || (v.prio === victim.prio && v.born < victim.born)) victim = v;
    }
    if (active >= this.maxVoices) {
      // under extreme load also bound the voices still fading out from earlier steals
      const tooBusy = fading >= MAX_FADING && prio < 90;
      if (tooBusy || !victim || victim.prio > prio || (victim.prio === prio && now - victim.born < 0.05)) {
        this.stats.dropped++;
        return null;
      }
      victim.kill();
      this.stats.stolen++;
    }
    const v = new Voice(this, prio, pos, opts);
    this.voices.push(v);
    this.stats.played++;
    return v;
  }

  _release(v) {
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  // -------------------------------------------------------------------------------------------
  // Gunshots

  _gunshot(type, pos) {
    const P = GUNS[type];
    if (!this._allow('gun:' + type, 0.035, 2)) return;
    const v = this._voice(100, pos, { send: P.send * vary(1, 0.1), bus: this.gunBus });
    if (!v) return;
    try {
      const t = v.t;
      const k = vary(1, 0.07); // this shot's "size": scales decays, inversely the pitch
      const pre = v.gain(0.55);
      const sat = v.shaper(this._curve(P.drive));
      const post = v.gain(P.level * vary(1, 0.1));
      pre.connect(sat);
      sat.connect(post);
      post.connect(v.out);

      // muzzle blast pressure pulse and (supersonic) ballistic crack
      v.bankHit(pre, null, { t, peak: P.blast, rate: vary(1, 0.08), buf: this._blast(type, P.blastMs) });
      if (P.nwave) v.bankHit(pre, null, { t, peak: 0.9, rate: vary(1, 0.05), buf: this._nwave(P.nwave) });
      // bright crack, mid "bang", low-mid punch, low boom and a short pitch-dropping thump
      v.noiseHit(pre, {
        t, peak: P.crack, att: 0.0002, tau: P.crackTau * k, filters: [['highpass', vary(P.crackHP, 0.1), -3]],
      });
      v.noiseHit(pre, {
        t, peak: P.body, att: 0.0004, tau: P.bodyTau * k, filters: [['bandpass', vary(P.bodyF / k, 0.08), P.bodyQ]],
      });
      v.noiseHit(pre, {
        buf: 'pink', t, peak: P.punch, att: 0.0008, tau: P.punchTau * k,
        filters: [['bandpass', vary(P.punchF / k, 0.1), 0.8]],
      });
      v.noiseHit(pre, {
        buf: 'brown', t, peak: P.boom, att: 0.0015, tau: P.boomTau * k, filters: [['lowpass', vary(P.boomF, 0.1), 0]],
      });
      v.toneHit(pre, {
        t, f0: P.thumpF0 / k, f1: P.thumpF1 / k, glideT: P.thumpTau * 1.6,
        peak: P.thump, att: 0.0008, tau: P.thumpTau * k,
      });

      if (P.mech) this._mechanism(v, t, P.mech);
      if (P.tail) {
        // rolling low rumble of a big report working its way around the room
        const n = v.noiseHit(v.out, {
          buf: 'brown', t: t + 0.01, peak: 0.06 + 0.16 * P.tail, att: 0.05, tau: (0.15 + 0.3 * P.tail) * k,
          filters: [['lowpass', 420, 0]],
        });
        glide(n.filters[0].frequency, t + 0.01, 420, 110, n.end - t);
      }
      if (P.echo) {
        // slap echoes off the far walls
        let et = t + rand(0.16, 0.24), ea = P.echo;
        for (let i = 0; i < 2; i++) {
          v.noiseHit(v.out, {
            t: et, peak: ea * 0.4, att: 0.004, tau: 0.035 + 0.02 * i,
            filters: [['bandpass', vary(700, 0.15), 0.6], ['lowpass', 2200, -3]],
          });
          v.toneHit(v.out, { t: et, f0: 90, f1: 45, glideT: 0.08, peak: ea * 0.25, att: 0.004, tau: 0.05 });
          et += rand(0.2, 0.32);
          ea *= 0.45;
        }
      }
    } finally {
      v.commit();
    }
    if (P.casing) this._casing(pos, rand(0.35, 0.6));
  }

  _mechanism(v, t, kind) {
    const out = v.out;
    if (kind === 'slide') {
      // slide slamming back and forward
      const t1 = t + rand(0.028, 0.04);
      v.noiseHit(out, { t: t1, peak: 0.08, att: 0.0003, tau: 0.005, filters: [['bandpass', vary(2900, 0.1), 3]] });
      v.noiseHit(out, {
        t: t1 + rand(0.012, 0.02), peak: 0.06, att: 0.0003, tau: 0.004,
        filters: [['bandpass', vary(4600, 0.1), 4]],
      });
      v.toneHit(out, { t: t1, f0: vary(3300, 0.05), peak: 0.02, att: 0.0005, tau: 0.02 });
    } else if (kind === 'bolt') {
      const t1 = t + rand(0.015, 0.028);
      v.noiseHit(out, { t: t1, peak: 0.07, att: 0.0003, tau: 0.007, filters: [['bandpass', vary(2200, 0.1), 2.5]] });
      v.noiseHit(out, {
        t: t1 + rand(0.008, 0.014), peak: 0.05, att: 0.0003, tau: 0.005,
        filters: [['bandpass', vary(3600, 0.1), 3]],
      });
    } else {
      // revolver: hammer / cylinder tick
      v.noiseHit(out, {
        t: t + rand(0.04, 0.06), peak: 0.03, att: 0.0002, tau: 0.003,
        filters: [['bandpass', vary(4000, 0.1), 4]],
      });
    }
  }

  /** The ejected case tinkling on the floor a moment later (its own low-priority voice). */
  _casing(pos, delay) {
    if (!this._allow('casing', 0.09)) return;
    const L = this._listener;
    let p = pos;
    if (pos && L.set) p = { x: num(pos.x, 0) + L.rx * 0.7, y: num(pos.y, 0) - 1.2, z: num(pos.z, 0) + L.rz * 0.7 };
    const v = this._voice(12, p, { send: 0.25 });
    if (!v) return;
    try {
      v.bankHit(v.out, 'casing', {
        t: v.t + delay, rate: rand(0.88, 1.14), peak: rand(0.05, 0.08), filters: [['highpass', 1800, -3]],
      });
    } finally {
      v.commit();
    }
  }

  // -------------------------------------------------------------------------------------------
  // Bullet impacts

  _bulletImpact(kind, pos, I) {
    if (!this._allow('bullet:' + kind, 0.02, 3)) return;
    const send = { flesh: 0.12, bone: 0.15, ground: 0.35, metal: 0.4, wood: 0.25 }[kind];
    const v = this._voice(80, pos, { send, level: 0.6 });
    if (!v) return;
    try {
      const t = v.t + Math.random() * 0.003;
      if (kind === 'flesh') this._fleshHit(v, t, I, 1);
      else if (kind === 'bone') {
        this._fleshHit(v, t, I, 0.8);
        this._boneSnap(v, t, I);
      } else if (kind === 'ground') this._groundHit(v, t, I);
      else if (kind === 'metal') this._metalHit(v, t, I);
      else this._woodHit(v, t, I);
    } finally {
      v.commit();
    }
  }

  _fleshHit(v, t, I, s) {
    const out = v.out, g = s * I ** 0.75;
    // entry snap
    v.noiseHit(out, { t, peak: 0.3 * g * I, att: 0.0002, tau: 0.0012, filters: [['highpass', 3200, -3]] });
    // the thwack: dense mid-range slap, with the weight of the body behind it
    v.noiseHit(out, { t, peak: 0.85 * g, att: 0.0008, tau: vary(0.02, 0.15), filters: [['bandpass', vary(950, 0.15), 1.1]] });
    v.noiseHit(out, {
      buf: 'pink', t, peak: 0.55 * g, att: 0.001, tau: vary(0.03, 0.15), filters: [['bandpass', vary(260, 0.12), 0.9]],
    });
    v.toneHit(out, { t, f0: vary(110, 0.1), f1: 70, glideT: 0.04, peak: 0.22 * g, att: 0.0015, tau: vary(0.025, 0.15) });
    // wet squelch: a resonance sweeping down through the noise
    const sq = v.noiseHit(out, {
      t: t + 0.004, peak: 0.4 * g, att: 0.004, tau: vary(0.035, 0.2), filters: [['bandpass', 1800, 4]],
    });
    glide(sq.filters[0].frequency, t + 0.004, vary(1900, 0.2), vary(420, 0.2), 0.08);
    // a little spray for solid hits
    if (I > 0.35) {
      v.bankHit(out, 'droplets', {
        t: t + rand(0.01, 0.025), rate: rand(1, 1.3), peak: 0.12 * g, tau: 0.12, filters: [['lowpass', 3500, -3]],
      });
    }
  }

  _boneSnap(v, t, I) {
    const out = v.out, g = I ** 0.7;
    v.noiseHit(out, { t, peak: 1.0 * g, att: 0.0002, tau: 0.0035, filters: [['bandpass', vary(2800, 0.15), 1.3]] });
    v.bankHit(out, 'crunch', { t: t + 0.0015, rate: rand(1, 1.35), peak: 0.6 * g, filters: [['bandpass', 1900, 0.7]] });
    v.toneHit(out, { t, f0: vary(260, 0.1), f1: 170, glideT: 0.03, peak: 0.25 * g, att: 0.0008, tau: 0.02 });
  }

  _groundHit(v, t, I) {
    const out = v.out, g = I ** 0.75;
    // the strike: a sharp chip off the concrete
    v.noiseHit(out, { t, peak: 0.8 * g, att: 0.0002, tau: 0.002, filters: [['highpass', vary(2400, 0.15), -3]] });
    v.noiseHit(out, { t, peak: 0.9 * g, att: 0.0004, tau: vary(0.01, 0.2), filters: [['bandpass', vary(1700, 0.2), 1.3]] });
    v.noiseHit(out, { buf: 'pink', t, peak: 0.35 * g, att: 0.001, tau: 0.018, filters: [['bandpass', vary(500, 0.15), 1]] });
    // grit raining back down, and a puff of dust
    v.bankHit(out, 'debris', {
      t: t + rand(0.006, 0.02), rate: rand(0.85, 1.2), peak: 0.3 * g, filters: [['highpass', 1100, -3]],
    });
    v.noiseHit(out, { buf: 'pink', t: t + 0.002, peak: 0.2 * g, att: 0.006, tau: 0.05, filters: [['lowpass', 700, 0]] });
    if (Math.random() < 0.28) this._ricochet(v, t + rand(0.004, 0.015), I);
  }

  /** Tumbling bullet whining away: a Doppler-falling whistle with tumble flutter. */
  _ricochet(v, t, I) {
    const dur = rand(0.32, 0.7);
    const f0 = rand(2300, 3800), f1 = f0 * rand(0.45, 0.65);
    const peak = rand(0.1, 0.16) * (0.5 + 0.5 * I);
    const env = v.gain(0);
    env.gain.setValueCurveAtTime(curve(32, peak, (x) => Math.min(1, x / 0.03) * (1 - x) ** 1.5), t, dur);
    const tone = v.osc('sine', f0, t, t + dur + 0.01);
    glide(tone.frequency, t, f0, f1, dur);
    tone.connect(env);
    const air = v.noise('white', t, dur + 0.01);
    const bp = v.filter('bandpass', f0, 8);
    glide(bp.frequency, t, f0, f1, dur);
    const airGain = v.gain(0.4 * this._bandComp('white', [['bandpass', f0, 8]]));
    air.connect(bp);
    bp.connect(airGain);
    airGain.connect(env);
    // tumble flutter: base gain 0.7 modulated +-0.3
    const trem = v.gain(0.7);
    const lfo = v.osc('sine', rand(25, 55), t, t + dur + 0.01);
    const depth = v.gain(0.3);
    lfo.connect(depth);
    depth.connect(trem.gain);
    env.connect(trem);
    trem.connect(v.out);
  }

  _metalHit(v, t, I) {
    const out = v.out, g = I ** 0.75;
    v.noiseHit(out, { t, peak: 0.8 * g, att: 0.0002, tau: 0.0018, filters: [['highpass', 4200, -3]] });
    v.noiseHit(out, { t, peak: 0.7 * g, att: 0.0003, tau: 0.008, filters: [['bandpass', vary(3300, 0.15), 2]] });
    v.bankHit(out, 'metal', { t, rate: rand(1.1, 2), peak: 0.5 * g, filters: [['highpass', 400, -3]] });
  }

  _woodHit(v, t, I) {
    const out = v.out, g = I ** 0.75;
    v.noiseHit(out, { t, peak: 0.5 * g, att: 0.0002, tau: 0.0018, filters: [['highpass', 3000, -3]] });
    v.noiseHit(out, { t, peak: 0.9 * g, att: 0.0005, tau: vary(0.016, 0.2), filters: [['bandpass', vary(780, 0.15), 2.2]] });
    v.bankHit(out, 'wood', { t, rate: rand(0.8, 1.25), peak: 0.45 * g });
    // splinters
    v.noiseHit(out, { buf: 'crackle', t: t + 0.002, peak: 0.45 * g, att: 0.001, tau: 0.025, filters: [['highpass', 1800, -3]] });
  }

  // -------------------------------------------------------------------------------------------
  // Collisions

  _flush() {
    this._flushQueued = false;
    const list = this._pendingList;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      e.active = false;
      if (!this._live()) continue;
      try {
        this._impactNow(e.mat, e.i, e.hasPos ? e : null);
      } catch (err) {
        this._warn(err);
      }
    }
    list.length = 0;
  }

  _impactNow(mat, I, pos) {
    const now = this.ctx.currentTime;
    let st = this._impactState.get(mat);
    if (!st) {
      st = { last: -1, lastI: 0, density: 0 };
      this._impactState.set(mat, st);
    }
    const dt = now - st.last;
    // decaying count of recent contacts: rolling / sliding chatter gets softer
    st.density = st.density * Math.exp(-Math.max(0, dt) / 0.3) + 1;
    if (dt < IMPACT_INTERVAL && I < st.lastI * 1.8 + 0.08) {
      this.stats.limited++;
      return;
    }
    if (!this._allow('impact', 1 / 90, 12)) return;
    const M = MATERIALS[mat];
    const v = this._voice(8 + 40 * I, pos, { send: I > 0.15 ? M.send : 0 });
    if (!v) return;
    st.last = now;
    st.lastI = I;
    try {
      const out = v.out;
      const t = v.t + Math.random() * 0.003;
      const crowd = clamp(3 / st.density, 0.4, 1);
      const g = I ** 0.8 * M.gain * crowd * vary(1, 0.15);
      const bright = 0.55 + 0.9 * I; // harder hits excite higher frequencies
      const pitch = 0.92 + 0.16 * I;
      if (M.click && I > 0.12) {
        v.noiseHit(out, {
          t, peak: g * M.click[0] * I, att: 0.0003, tau: 0.0015,
          filters: [['highpass', vary(M.click[1], 0.15), -3]],
        });
      }
      for (const n of M.noise) {
        if (n[6] && I < n[6]) continue;
        v.noiseHit(out, {
          buf: n[5] || 'white', t, peak: g * n[4], att: 0.0008, tau: vary(n[3], 0.15) * (0.75 + 0.5 * I),
          filters: [[n[0], vary(n[1] * bright, 0.12), n[2]]],
        });
      }
      if (M.tone && I > 0.06) {
        const [f0, f1, tau, amp] = M.tone;
        v.toneHit(out, {
          t, f0: vary(f0 * pitch, 0.06), f1: f1 * pitch, glideT: tau * 1.5,
          peak: g * amp, att: 0.002, tau: vary(tau, 0.15),
        });
      }
      if (M.ring && I > M.ring[4]) {
        // light taps die away sooner than solid hits (and free their voice sooner)
        const [bank, rateLo, rateHi, amp, , tauLo, tauHi] = M.ring;
        v.bankHit(out, bank, {
          t, rate: rand(rateLo, rateHi) * (0.94 + 0.12 * I), peak: g * amp, tau: tauLo + (tauHi - tauLo) * I,
          filters: [['lowpass', 1500 + 14000 * I * I, -3]],
        });
      }
      if (M.grit && I > 0.3) {
        v.noiseHit(out, {
          buf: 'crackle', t: t + 0.002, peak: g * M.grit, att: 0.002, tau: 0.03 + 0.03 * I,
          filters: [['highpass', 1800, -3]],
        });
      }
    } finally {
      v.commit();
    }
  }

  _bodyFall(I, pos) {
    if (!this._allow('fall', 0.09)) return;
    const v = this._voice(55, pos, { send: 0.25, level: 1.1 });
    if (!v) return;
    try {
      const out = v.out, t = v.t, g = I ** 0.7;
      // the torso's weight hitting the slab: dull whump, body knock and a little sub weight
      v.noiseHit(out, {
        buf: 'pink', t, peak: 0.85 * g, att: 0.003, tau: vary(0.075, 0.15), filters: [['bandpass', vary(170, 0.1), 0.7]],
      });
      v.noiseHit(out, {
        buf: 'pink', t, peak: 0.5 * g, att: 0.002, tau: vary(0.045, 0.15), filters: [['bandpass', vary(420, 0.12), 1]],
      });
      v.toneHit(out, { t, f0: vary(90, 0.08), f1: 50, glideT: 0.1, peak: 0.3 * g, att: 0.003, tau: vary(0.07, 0.15) });
      // skin and clothes slapping the concrete
      v.noiseHit(out, {
        t: t + 0.001, peak: 0.4 * g * (0.4 + 0.6 * I), att: 0.0008, tau: vary(0.014, 0.2),
        filters: [['bandpass', vary(1000, 0.2), 0.9]],
      });
      // limbs and head landing just after
      let tt = t + rand(0.05, 0.09), a = rand(0.3, 0.45);
      for (let i = 0; i < 2; i++) {
        v.noiseHit(out, {
          buf: 'pink', t: tt, peak: a * 0.75 * g, att: 0.002, tau: 0.04, filters: [['bandpass', vary(230, 0.15), 0.8]],
        });
        v.noiseHit(out, { t: tt, peak: a * 0.3 * g, att: 0.001, tau: 0.009, filters: [['bandpass', vary(1300, 0.2), 1]] });
        tt += rand(0.05, 0.12);
        a *= rand(0.45, 0.7);
      }
      v.bankHit(out, 'cloth', {
        t: t + rand(0, 0.01), rate: rand(0.9, 1.12), peak: 0.25 * (0.4 + 0.6 * I), filters: [['highpass', 900, -3]],
      });
    } finally {
      v.commit();
    }
  }

  _boneCrack(I, pos) {
    if (!this._allow('bone', 0.04, 2)) return;
    const v = this._voice(70, pos, { send: 0.12, level: 0.75 });
    if (!v) return;
    try {
      const out = v.out, t = v.t, g = I ** 0.7;
      // the snap: bright and very short
      v.noiseHit(out, { t, peak: 0.9 * g, att: 0.0002, tau: 0.0035, filters: [['bandpass', vary(2600, 0.15), 1.1]] });
      v.noiseHit(out, { t, peak: 0.3 * g, att: 0.0001, tau: 0.001, filters: [['highpass', 4500, -3]] });
      // crunch of micro-fractures, muffled by the surrounding tissue
      v.bankHit(out, 'crunch', {
        t: t + 0.001, rate: rand(0.85, 1.2), peak: 0.7 * g,
        filters: [['lowpass', 3500 + 3500 * I, -3], ['highpass', 500, -3]],
      });
      // dull thock of bone inside flesh
      v.toneHit(out, { t, f0: vary(230, 0.1), f1: 160, glideT: 0.04, peak: 0.25 * g, att: 0.001, tau: 0.025 });
      v.noiseHit(out, { buf: 'pink', t, peak: 0.35 * g, att: 0.001, tau: 0.03, filters: [['bandpass', 350, 1]] });
    } finally {
      v.commit();
    }
  }

  _glassShatter(I, pos) {
    if (!this._allow('glass', 0.06, 2)) return;
    const v = this._voice(68, pos, { send: 0.4, level: 0.8 });
    if (!v) return;
    try {
      const out = v.out, t = v.t, g = I ** 0.7;
      // first contact: hard click and the bottle's body ringing for an instant as it gives way
      v.noiseHit(out, { t, peak: 0.6 * g, att: 0.0002, tau: 0.0015, filters: [['highpass', 4500, -3]] });
      v.bankHit(out, 'glass', { t, rate: rand(0.5, 0.75), peak: 0.35 * g, tau: 0.03, att: 0.0005 });
      v.noiseHit(out, { buf: 'pink', t, peak: 0.3 * g, att: 0.001, tau: 0.02, filters: [['bandpass', 600, 1.2]] });
      // the break: bright crack burst, then the crash of the glass splitting apart
      v.noiseHit(out, { t: t + 0.002, peak: 0.7 * g, att: 0.0004, tau: 0.02, filters: [['bandpass', vary(4800, 0.15), 0.8]] });
      v.noiseHit(out, {
        t: t + 0.003, peak: 0.3 * g, att: 0.003, tau: 0.1 + 0.08 * I, filters: [['highpass', 3000, -3]],
      });
      // shards tinkling and skittering across the floor
      v.bankHit(out, 'shards', {
        t: t + 0.004, rate: rand(0.9, 1.12), peak: 0.6 * g, filters: [['highpass', 1500, -3]],
      });
    } finally {
      v.commit();
    }
  }

  _splat(I, pos) {
    if (!this._allow('splat', 0.05, 2)) return;
    const v = this._voice(60, pos, { send: 0.2, level: 0.75 });
    if (!v) return;
    try {
      const out = v.out, t = v.t, g = I ** 0.8;
      v.toneHit(out, { t, f0: vary(120, 0.1), f1: 55, glideT: 0.06, peak: 0.25 * g, att: 0.002, tau: 0.04 });
      v.noiseHit(out, {
        buf: 'pink', t, peak: 0.85 * g, att: 0.0015, tau: vary(0.045, 0.15) * (0.7 + 0.6 * I),
        filters: [['bandpass', vary(600, 0.15), 0.8]],
      });
      // squelch: resonance sweeping down
      const sq = v.noiseHit(out, { t: t + 0.003, peak: 0.45 * g, att: 0.004, tau: 0.045, filters: [['bandpass', 2000, 4.5]] });
      glide(sq.filters[0].frequency, t + 0.003, vary(2200, 0.15), vary(480, 0.15), 0.09);
      // rind / skin tearing on big bursts
      if (I > 0.5) {
        v.noiseHit(out, { t, peak: 0.3 * g, att: 0.0003, tau: 0.007, filters: [['bandpass', vary(1600, 0.2), 1.4]] });
      }
      // droplets and chunks landing, plus a fine spray hiss
      v.bankHit(out, 'droplets', {
        t: t + rand(0.008, 0.02), rate: rand(0.85, 1.15), peak: 0.45 * g, filters: [['lowpass', 3000 + 3000 * I, -3]],
      });
      v.noiseHit(out, { t: t + 0.004, peak: 0.12 * g, att: 0.006, tau: 0.07, filters: [['highpass', 2500, -3]] });
    } finally {
      v.commit();
    }
  }

  _whoosh(speed, pos) {
    if (!this._allow('whoosh', 0.06)) return;
    const u = clamp((speed - 8) / 37, 0, 1);
    const v = this._voice(28 + 15 * u, pos, { send: 0.1, level: 0.85 });
    if (!v) return;
    try {
      const out = v.out, t = v.t;
      const dur = (0.45 - 0.24 * u) * rand(0.88, 1.12);
      const peak = (0.04 + 0.22 * u ** 1.3) * vary(1, 0.1);
      const fc = (380 + 1300 * u) * rand(0.88, 1.12);
      const p = rand(0.4, 0.55);
      const shape = swell(p);
      // broad air rush, pitch rising as it approaches and falling as it passes (Doppler-ish)
      const a = v.gain(0);
      a.gain.setValueCurveAtTime(curve(32, peak * this._bandComp('pink', [['bandpass', fc, 1.1]]), shape), t, dur);
      const bpA = v.filter('bandpass', fc, 1.1);
      bpA.frequency.setValueAtTime(fc * 0.55, t);
      bpA.frequency.exponentialRampToValueAtTime(fc * 1.25, t + dur * p);
      bpA.frequency.exponentialRampToValueAtTime(fc * 0.5, t + dur);
      v.noise('pink', t, dur + 0.01).connect(bpA);
      bpA.connect(a);
      a.connect(out);
      // narrower, higher edge whistle
      const b = v.gain(0);
      b.gain.setValueCurveAtTime(curve(32, peak * 0.35 * this._bandComp('white', [['bandpass', fc * 2, 3]]), shape), t, dur);
      const bpB = v.filter('bandpass', fc * 2, 3);
      bpB.frequency.setValueAtTime(fc * 1.2, t);
      bpB.frequency.exponentialRampToValueAtTime(fc * 2.4, t + dur * p);
      bpB.frequency.exponentialRampToValueAtTime(fc * 1.1, t + dur);
      v.noise('white', t, dur + 0.01).connect(bpB);
      bpB.connect(b);
      b.connect(out);
      // pressure "whum" of a fast, heavy object
      if (u > 0.55) {
        const c = v.gain(0);
        c.gain.setValueCurveAtTime(curve(24, peak * 0.6 * (u - 0.45), swell(p, 2)), t, dur);
        const lp = v.filter('lowpass', 180, 0);
        v.noise('brown', t, dur + 0.01).connect(lp);
        lp.connect(c);
        c.connect(out);
      }
    } finally {
      v.commit();
    }
  }

  _grunt(I, pos) {
    const now = this.ctx.currentTime;
    if (now < this._gruntUntil || !this._allow('grunt', 0.3)) return;
    const v = this._voice(52, pos, { send: 0.1 });
    if (!v) return;
    try {
      const t = v.t;
      const dur = (0.16 + 0.2 * I) * rand(0.85, 1.15);
      const tail = dur + rand(0.06, 0.12); // breath carries on a little after the voicing stops
      this._gruntUntil = t + tail + 0.12;
      const breathy = Math.random() < 0.3 + 0.2 * (1 - I);
      const f0 = (98 + 50 * I) * rand(0.9, 1.1);
      const N = 48;
      // falling pain contour with natural jitter (random walk) on top
      const pitch = new Float32Array(N);
      let jit = 0;
      for (let i = 0; i < N; i++) {
        const x = i / (N - 1);
        jit = jit * 0.8 + (Math.random() * 2 - 1) * 0.012;
        pitch[i] = f0 * ((x < 0.15 ? 0.94 + 0.4 * x : 1 - 0.24 * (x - 0.15) / 0.85) + jit);
      }
      // abrupt glottal onset, sagging sustain with shimmer, release
      const voicedPeak = (breathy ? 0.45 : 1) * (0.6 + 0.4 * I);
      const amp = curve(N, voicedPeak, (x) => (x < 0.08 ? x / 0.08 : (1 - (x - 0.08) / 0.92) ** 0.7) * vary(1, 0.06));
      const src = v.osc(this._glottalWave(), f0, t, t + dur + 0.01);
      src.frequency.setValueCurveAtTime(pitch, t, dur);
      const voiced = v.gain(0);
      voiced.gain.setValueCurveAtTime(amp, t, dur);
      src.connect(voiced);
      // aspiration noise through the same tract
      const breathPeak = (breathy ? 0.55 : 0.22) * (0.6 + 0.4 * I) * this._bandComp('pink', [['bandpass', 1500, 0.6]]);
      const breath = v.gain(0);
      breath.gain.setValueCurveAtTime(curve(N, breathPeak, swell(0.12, 0.8)), t, tail);
      const bf = v.filter('bandpass', 1500, 0.6);
      v.noise('pink', t, tail + 0.01).connect(bf);
      bf.connect(breath);
      const glottis = v.gain(1);
      voiced.connect(glottis);
      breath.connect(glottis);
      // parallel formant resonators, then lips closing at the end
      const tract = v.gain(0.6 * (0.55 + 0.45 * I));
      for (const [f, q, a] of pick(GRUNT_VOWELS)) {
        const bp = v.filter('bandpass', vary(f, 0.05), q);
        const fg = v.gain(a);
        glottis.connect(bp);
        bp.connect(fg);
        fg.connect(tract);
      }
      const lips = v.filter('lowpass', 4200, -3);
      lips.frequency.setValueAtTime(4200, t + dur * 0.6);
      lips.frequency.exponentialRampToValueAtTime(1100, t + tail);
      const hp = v.filter('highpass', 80, -3);
      tract.connect(lips);
      lips.connect(hp);
      hp.connect(v.out);
    } finally {
      v.commit();
    }
  }

  // -------------------------------------------------------------------------------------------
  // Heartbeat

  _ensureHeartTimer() {
    const hb = this._hb;
    if (hb.timer || typeof setInterval !== 'function') return;
    hb.timer = setInterval(this._pumpHeart, 50);
    if (hb.timer && typeof hb.timer.unref === 'function') hb.timer.unref();
  }

  _stopHeart() {
    const hb = this._hb;
    hb.bpm = 0;
    hb.next = 0;
    if (hb.timer) {
      clearInterval(hb.timer);
      hb.timer = null;
    }
    if (this.ctx) {
      // silence beats already queued in the look-ahead window
      const now = this.ctx.currentTime;
      for (const v of hb.voices) if (!v.disposed && v.t > now) v.kill(0.005);
    }
    hb.voices.length = 0;
  }

  _pumpHeart() {
    const hb = this._hb;
    if (!hb.bpm || !this._live()) return;
    try {
      const now = this.ctx.currentTime;
      if (hb.next < now) hb.next = now + 0.03; // first beat, or the timer was starved
      while (hb.next < now + 0.2) {
        this._beat(hb.next, hb.bpm);
        hb.next += 60 / hb.bpm;
      }
      for (let i = hb.voices.length - 1; i >= 0; i--) if (hb.voices[i].disposed) hb.voices.splice(i, 1);
    } catch (e) {
      this._warn(e);
    }
  }

  _beat(time, bpm) {
    const v = this._voice(22, null, { when: time, propagate: false });
    if (!v) return;
    this._hb.voices.push(v);
    try {
      const t = v.t;
      const s2 = t + clamp(0.3 * Math.sqrt(60 / bpm), 0.16, 0.36);
      const lvl = 0.07;
      const lp = v.filter('lowpass', 300, -3);
      lp.connect(v.out);
      // "lub" (S1) and the slightly higher, softer "dub" (S2)
      v.toneHit(lp, { t, f0: 62, f1: 46, glideT: 0.08, peak: lvl, att: 0.012, tau: 0.045 });
      v.noiseHit(lp, { buf: 'brown', t, peak: lvl, att: 0.01, tau: 0.04, filters: [['lowpass', 220, 0]] });
      v.toneHit(lp, { t: s2, f0: 78, f1: 60, glideT: 0.05, peak: lvl * 0.7, att: 0.008, tau: 0.032 });
      v.noiseHit(lp, { buf: 'brown', t: s2, peak: lvl * 0.7, att: 0.006, tau: 0.03, filters: [['lowpass', 260, 0]] });
    } finally {
      v.commit();
    }
  }
}
