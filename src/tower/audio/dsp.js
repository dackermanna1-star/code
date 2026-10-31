// LAST LOOKOUT — offline renderers for the long audio buffers: the valley's impulse response, the
// ambience loops (crickets, frogs, rain, fire) and the horde murmur. Pure functions that fill
// Float32Arrays (data, sampleRate, rng); no Web Audio, so they run (and are tested) in Node.
// Every loop is seamless: periodic content repeats exactly, noise content is cross-faded.

const TAU = Math.PI * 2;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One-pole low-pass coefficient for cutoff fc. */
const lpA = (fc, sr) => 1 - Math.exp((-TAU * fc) / sr);

/** Scales the arrays so their RMS (over all of them) is `rms`. */
export function normalizeRms(chans, rms) {
  let e = 0, n = 0;
  for (const d of chans) {
    for (let i = 0; i < d.length; i++) e += d[i] * d[i];
    n += d.length;
  }
  const r = Math.sqrt(e / Math.max(1, n));
  if (r > 0) for (const d of chans) for (let i = 0; i < d.length; i++) d[i] *= rms / r;
}

export function normalizePeak(chans, peak) {
  let m = 0;
  for (const d of chans) for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (const d of chans) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
}

/** Makes a noise loop seamless: the last `fade` seconds are cross-faded into the start. */
export function loopCrossfade(d, sr, fade) {
  const n = Math.min(Math.floor(fade * sr), Math.floor(d.length / 3));
  const L = d.length - n;
  for (let i = 0; i < n; i++) {
    const w = i / n;
    d[i] = d[i] * w + d[L + i] * (1 - w);
  }
  return L; // usable loop length (samples)
}

// ---------------------------------------------------------------------------------------------
// The valley: a stereo impulse response for the shared reverb send. A ground bounce, a slap-back
// off the near hills, then echoes rolling round the valley that get later, wider and darker, over
// a diffuse low tail (RT60 ~2.6 s) whose brightness dies first.

export const VALLEY_ECHOES = [
  // [seconds, amplitude, pan -1..1, smear seconds, cutoff Hz]
  [0.012, 0.5, 0.05, 0.004, 9000],
  [0.38, 0.62, -0.55, 0.03, 2600],
  [0.61, 0.4, 0.65, 0.05, 2000],
  [0.86, 0.34, -0.25, 0.07, 1500],
  [1.18, 0.3, 0.45, 0.1, 1100],
  [1.55, 0.24, -0.6, 0.14, 850],
  [1.98, 0.18, 0.3, 0.18, 650],
  [2.5, 0.12, -0.35, 0.24, 500],
  [3.05, 0.07, 0.55, 0.3, 400],
];

export function renderValleyIR(L, R, sr, seed = 4242) {
  const rng = mulberry32(seed);
  const n = L.length;
  // diffuse tail, slightly decorrelated per channel
  for (const [ch, d] of [[0, L], [1, R]]) {
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.exp((-t * 6.9) / 2.6) * Math.min(1, t / 0.08) * 0.16;
      const fc = 2600 * Math.exp(-t * 1.6) + 220;
      const a = lpA(fc, sr);
      const w = rng() * 2 - 1;
      lp += a * (w - lp);
      lp2 += a * (lp - lp2);
      d[i] = lp2 * env * (ch ? 1.02 : 1);
    }
  }
  // discrete echoes
  for (const [t0, amp, pan, smear, fc] of VALLEY_ECHOES) {
    const i0 = Math.floor(t0 * sr);
    const len = Math.min(n - i0, Math.floor((smear * 6 + 0.01) * sr));
    const gl = Math.sqrt(0.5 * (1 - pan)), gr = Math.sqrt(0.5 * (1 + pan));
    const a = lpA(fc, sr);
    let lp = 0, lp2 = 0;
    for (let k = 0; k < len; k++) {
      const t = k / sr;
      const env = (1 - Math.exp(-t / Math.max(0.0008, smear * 0.15))) * Math.exp(-t / smear);
      lp += a * (rng() * 2 - 1 - lp);
      lp2 += a * (lp - lp2);
      const v = lp2 * env * amp * 3;
      L[i0 + k] += v * gl;
      R[i0 + k] += v * gr;
    }
  }
  // unit energy per channel (the reverb return gain sets the level)
  let e = 0;
  for (const d of [L, R]) for (let i = 0; i < n; i++) e += d[i] * d[i];
  const s = e > 0 ? 1 / Math.sqrt(e / 2) : 1;
  for (const d of [L, R]) for (let i = 0; i < n; i++) d[i] *= s;
}

// ---------------------------------------------------------------------------------------------
// Crickets: field crickets chirping in pulse trains (3-4 pulses of a ~4.5 kHz tone), a tree
// cricket trilling, all periodic in the loop length so it repeats seamlessly.

export function renderCrickets(L, R, sr, seed = 77, count = 9) {
  const rng = mulberry32(seed);
  const n = L.length, dur = n / sr;
  for (let c = 0; c < count; c++) {
    const trill = c === count - 1;
    // whole numbers of carrier cycles and of chirp periods per loop
    const f = Math.round((3900 + rng() * 1300) * dur) / dur;
    const chirps = trill ? Math.round(dur * 24) : Math.max(2, Math.round(dur * (1.2 + rng() * 1.6)));
    const period = dur / chirps;
    const pulses = trill ? 1 : 3 + Math.floor(rng() * 2);
    const pulseLen = trill ? period * 0.55 : 0.012 + rng() * 0.006;
    const gap = pulseLen * (1.6 + rng() * 0.5);
    const amp = (trill ? 0.05 : 0.12 + 0.18 * rng()) * (0.4 + 0.6 * rng());
    const pan = rng() * 1.8 - 0.9;
    const gl = Math.sqrt(0.5 * (1 - pan)), gr = Math.sqrt(0.5 * (1 + pan));
    const ph0 = rng() * period;
    const w = (TAU * f) / sr;
    // rotating phasor (no sin() per sample)
    let s = 0, co = 1;
    const cw = Math.cos(w), sw = Math.sin(w);
    for (let i = 0; i < n; i++) {
      const ns = s * cw + co * sw;
      co = co * cw - s * sw;
      s = ns;
      const t = (i / sr + ph0) % period;
      const k = Math.floor(t / gap);
      if (k >= pulses) continue;
      const u = (t - k * gap) / pulseLen;
      if (u >= 1) continue;
      const env = Math.sin(Math.PI * u) * (1 - 0.15 * k);
      const v = (s + 0.25 * s * s * s) * env * amp;
      L[i] += v * gl;
      R[i] += v * gr;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Frogs: croaks (a buzzy pulse train under a resonant mouth) placed periodically in the loop.

export function renderFrogs(L, R, sr, seed = 91, count = 6) {
  const rng = mulberry32(seed);
  const n = L.length, dur = n / sr;
  for (let c = 0; c < count; c++) {
    const croaks = 1 + Math.floor(rng() * 3);
    const pan = rng() * 1.6 - 0.8;
    const gl = Math.sqrt(0.5 * (1 - pan)), gr = Math.sqrt(0.5 * (1 + pan));
    const pulseHz = 28 + rng() * 30;
    const f1 = 380 + rng() * 420;
    const amp = 0.18 + 0.3 * rng();
    for (let k = 0; k < croaks; k++) {
      const start = rng() * dur;
      const len = 0.16 + rng() * 0.22;
      const parts = 1 + Math.floor(rng() * 2); // "rib-bit"
      // resonant two-pole band-pass state
      const r = Math.exp((-TAU * 120) / sr), wc = (TAU * f1) / sr;
      const b1 = 2 * r * Math.cos(wc), b2 = -r * r;
      let y1 = 0, y2 = 0;
      const m = Math.floor(len * sr);
      for (let j = 0; j < m; j++) {
        const t = j / sr;
        const part = Math.floor((t / len) * parts);
        const u = ((t / len) * parts) % 1;
        const env = Math.sin(Math.PI * u) ** 0.7 * (part ? 0.8 : 1);
        const phase = (t * pulseHz) % 1;
        const x = phase < 0.08 ? 1 - phase / 0.08 : 0; // glottal-ish click train
        const y = x * env + b1 * y1 + b2 * y2;
        y2 = y1;
        y1 = y;
        const i = (Math.floor(start * sr) + j) % n; // wraps: seamless
        const v = y * amp * 0.08;
        L[i] += v * gl;
        R[i] += v * gr;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The horde: dozens of overlapping moans (glottal pulses through two throat formants, a falling
// contour and some rasp), wrapped round the loop so it never seams. Low-passed, dark.

export function renderHorde(L, R, sr, seed = 1313, count = 26) {
  const rng = mulberry32(seed);
  const n = L.length, dur = n / sr;
  const tmp = new Float32Array(Math.ceil(sr * 3));
  for (let c = 0; c < count; c++) {
    const len = 0.9 + rng() * 1.8;
    const m = Math.min(tmp.length, Math.floor(len * sr));
    const f0 = 62 + rng() * 70;
    const start = rng() * dur;
    const pan = rng() * 1.8 - 0.9;
    const gl = Math.sqrt(0.5 * (1 - pan)), gr = Math.sqrt(0.5 * (1 + pan));
    const amp = 0.25 + 0.75 * rng();
    const fa = 420 + rng() * 260, fb = 950 + rng() * 500;
    const ra = Math.exp((-TAU * 110) / sr), rb = Math.exp((-TAU * 180) / sr);
    const a1 = 2 * ra * Math.cos((TAU * fa) / sr), a2 = -ra * ra;
    const c1 = 2 * rb * Math.cos((TAU * fb) / sr), c2 = -rb * rb;
    let ya1 = 0, ya2 = 0, yb1 = 0, yb2 = 0, ph = rng(), nlp = 0;
    const peak = 0.25 + rng() * 0.3;
    for (let j = 0; j < m; j++) {
      const u = j / m;
      const f = f0 * (1.06 - 0.28 * u + 0.05 * Math.sin(u * 17 + c));
      ph += f / sr;
      if (ph >= 1) ph -= 1;
      const pulse = ph < 0.12 ? Math.sin((Math.PI * ph) / 0.12) : 0;
      nlp += 0.2 * (rng() * 2 - 1 - nlp);
      const x = pulse + nlp * 0.35;
      const ya = x + a1 * ya1 + a2 * ya2;
      ya2 = ya1;
      ya1 = ya;
      const yb = x + c1 * yb1 + c2 * yb2;
      yb2 = yb1;
      yb1 = yb;
      const env = u < peak ? Math.sin((0.5 * Math.PI * u) / peak) ** 2 : Math.cos((0.5 * Math.PI * (u - peak)) / (1 - peak)) ** 1.6;
      tmp[j] = (ya * 0.04 + yb * 0.02) * env * amp;
    }
    const i0 = Math.floor(start * sr);
    for (let j = 0; j < m; j++) {
      const i = (i0 + j) % n;
      L[i] += tmp[j] * gl;
      R[i] += tmp[j] * gr;
    }
  }
  // gentle overall low-pass (a crowd heard from up the tower), seamless by running it twice
  for (const d of [L, R]) {
    const a = lpA(1400, sr);
    let y = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        y += a * (d[i] - y);
        if (pass) d[i] = y;
      }
    }
  }
  normalizeRms([L, R], 0.18);
}

// ---------------------------------------------------------------------------------------------
// Rain: broadband hiss shaped like rain on grass, plus individual drops, cross-faded loop.

export function renderRain(L, R, sr, seed = 555) {
  const rng = mulberry32(seed);
  const n = L.length;
  for (const d of [L, R]) {
    let b0 = 0, b1 = 0, b2 = 0, hp = 0, prev = 0;
    const ah = Math.exp((-TAU * 400) / sr);
    for (let i = 0; i < n; i++) {
      const w = rng() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      const pink = b0 + b1 + b2 + w * 0.1848;
      hp = ah * (hp + pink - prev);
      prev = pink;
      d[i] = hp * 0.12;
    }
    // drops: short decaying ticks of random pitch
    const drops = Math.floor((n / sr) * 140);
    for (let k = 0; k < drops; k++) {
      const i0 = Math.floor(rng() * n);
      const f = 1800 + rng() * 5200, tau = 0.0015 + rng() * 0.004, amp = 0.05 + 0.25 * rng() ** 2;
      const w = (TAU * f) / sr, m = Math.min(n - i0, Math.floor(tau * sr * 6));
      for (let j = 0; j < m; j++) d[i0 + j] += Math.sin(w * j) * Math.exp(-j / (tau * sr)) * amp;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Fire: pops and crackles (heavy-tailed clicks), a hiss and a low roar.

export function renderFire(d, sr, seed = 808) {
  const rng = mulberry32(seed);
  const n = d.length;
  let br = 0, hiss = 0;
  const aR = lpA(260, sr), aH = lpA(5200, sr);
  for (let i = 0; i < n; i++) {
    const w = rng() * 2 - 1;
    br += aR * (w - br);
    hiss += aH * (w - hiss);
    const flick = 0.75 + 0.25 * Math.sin((i / sr) * TAU * 0.7) * Math.sin((i / sr) * TAU * 1.3);
    d[i] = br * 1.6 * flick + (w - hiss) * 0.035;
  }
  const pops = Math.floor((n / sr) * 38);
  for (let k = 0; k < pops; k++) {
    const i0 = Math.floor(rng() * n);
    const big = rng() < 0.12;
    const amp = (big ? 0.6 : 0.12) * (0.3 + 0.7 * rng());
    const tau = big ? 0.004 + rng() * 0.01 : 0.0006 + rng() * 0.002;
    const f = big ? 600 + rng() * 1400 : 2000 + rng() * 5000;
    const m = Math.min(n - i0, Math.floor(tau * sr * 6));
    const w = (TAU * f) / sr;
    for (let j = 0; j < m; j++) d[i0 + j] += (j === 0 ? amp : Math.sin(w * j) * amp * 0.7) * Math.exp(-j / (tau * sr));
  }
}

/** Long noise for the wind bed (brownish, slowly breathing), cross-faded. */
export function renderWindNoise(d, sr, seed = 321) {
  const rng = mulberry32(seed);
  let b = 0;
  const leak = Math.exp((-TAU * 30) / sr);
  for (let i = 0; i < d.length; i++) {
    b = leak * b + (rng() * 2 - 1) * 0.06;
    d[i] = b;
  }
  normalizeRms([d], 0.3);
}
