/**
 * audio.js — the sandbox's entire sound system. No assets, no dependencies: Web Audio only.
 *
 * Every sound is synthesized in plain JS into short mono AudioBuffers (modal synthesis: sums of
 * decaying inharmonic partials excited by shaped noise transients, plus granular clouds for
 * shatter/crunch textures). Buffers are rendered lazily (and pre-warmed in idle time), a few
 * seeded variations per family, then played through:
 *
 *   source -> lowpass (opens with intensity) -> gain -> panner -+-> dry ------------+
 *                                                               +-> convolver -> wet +-> slow-mo
 *   lowpass -> compressor -> soft clip -> master -> destination
 */

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ───────────────────────────── DSP primitives (all add into `o`) ─────────────────────────────
let SR = 48000; // sample rate of the buffer being rendered
let rnd = Math.random; // seeded PRNG of the buffer being rendered
const rr = (a, b) => a + (b - a) * rnd(); // uniform
const rx = (a, b) => a * Math.pow(b / a, rnd()); // log-uniform (for frequencies)
const ri = (a, b) => a + ((rnd() * (b - a + 1)) | 0); // integer, inclusive
const buf = (sec) => new Float32Array(Math.ceil(sec * SR));
const sat = (x) => x / Math.sqrt(1 + x * x); // cheap tanh-like saturation
// Per-sample noise uses an inline LCG seeded from rnd() (several times faster than calling rnd per sample):
//   s = (Math.imul(s, LA) + LC) | 0;  s * I31 is white noise in [-1, 1)
const LA = 1664525, LC = 1013904223, I31 = 1 / 2147483648, lcgSeed = () => (rnd() * 4294967296) | 0;

/** One decaying partial, amp·e^(-t/tau)·sin(2πft+ph), as a 2-pole recurrence (no trig per sample). */
function mode(o, t0, f, tau, amp, ph = 0) {
  if (!(f > 10 && f < SR * 0.46)) return;
  const w = (TAU * f) / SR, r = Math.exp(-1 / (tau * SR)), a1 = 2 * r * Math.cos(w), a2 = r * r;
  let i = (t0 * SR) | 0, y1 = (amp * Math.sin(ph - w)) / r, y2 = (amp * Math.sin(ph - 2 * w)) / a2;
  for (const end = Math.min(o.length, i + ((tau * 7 * SR) | 0)); i < end; i++) {
    const y = a1 * y1 - a2 * y2;
    o[i] += y; y2 = y1; y1 = y;
  }
}

/**
 * A struck object: inharmonic partials f0·ratio (random detune), higher ones decaying faster
 * (tau0·ratio^-slope) and quieter (tilt^k). `twin` adds a slightly detuned partner per partial
 * (beating shimmer of glass/bells); `am` adds sidebands (wobble of thin sheet metal).
 */
function modes(o, t0, f0, ratios, tau0, slope, amp, { det = 0.03, tilt = 0.75, twin = 0, am = 0 } = {}) {
  for (let k = 0; k < ratios.length; k++) {
    const f = f0 * ratios[k] * (1 + det * (rnd() * 2 - 1));
    const tau = tau0 * Math.pow(ratios[k], -slope) * rr(0.8, 1.2);
    const a = amp * Math.pow(tilt, k) * rr(0.5, 1), ph = rnd() * 0.5;
    mode(o, t0, f, tau, a, ph);
    if (twin) mode(o, t0, f * (1 + twin * rr(0.3, 1)), tau * rr(0.8, 1), a * rr(0.3, 0.7), rnd() * TAU);
    if (am) { const fm = rr(7, 26); mode(o, t0, f + fm, tau, a * am, ph); mode(o, t0, f - fm, tau, a * am, ph); }
  }
}

/** Exponentially decaying noise burst, band-limited fLo..fHi (one-pole HP, two-pole LP). */
function burst(o, t0, tau, amp, fLo = 20, fHi = 20000, atk = 0) {
  const n0 = (t0 * SR) | 0, len = Math.min(o.length - n0, (tau * 7 * SR) | 0);
  fHi = Math.min(fHi, SR * 0.45);
  const kl = 1 - Math.exp((-TAU * fHi) / SR), kh = 1 - Math.exp((-TAU * fLo) / SR);
  const d = Math.exp(-1 / (tau * SR)), na = Math.max(1, atk * SR);
  let e = (amp * 0.78) / Math.sqrt(clamp((fHi - fLo) / (SR / 2), 0.004, 1)), l1 = 0, l2 = 0, h = 0, s = lcgSeed();
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, LA) + LC) | 0;
    l1 += kl * (s * I31 - l1); l2 += kl * (l1 - l2); h += kh * (l2 - h);
    o[n0 + i] += (l2 - h) * e * (i < na ? i / na : 1);
    e *= d;
  }
}

/** Resonant band-passed noise tick (state-variable filter): splinters, clacks, rattles. */
function tick(o, t0, tau, amp, fc, q = 2) {
  const n0 = (t0 * SR) | 0, len = Math.min(o.length - n0, (tau * 7 * SR) | 0);
  fc = Math.min(fc, SR * 0.45);
  const g = Math.tan((Math.PI * fc) / SR), k = 1 / q, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
  const d = Math.exp(-1 / (tau * SR));
  let e = amp * k * 0.45 * Math.sqrt((q * SR) / fc), s1 = 0, s2 = 0, s = lcgSeed();
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, LA) + LC) | 0;
    const v3 = s * I31 - s2, v1 = a1 * s1 + a2 * v3, v2 = s2 + a2 * s1 + a3 * v3;
    s1 = 2 * v1 - s1; s2 = 2 * v2 - s2;
    o[n0 + i] += v1 * e;
    e *= d;
  }
}

/** Sine gliding exponentially f0 -> f1 (time constant tg) with decay tau: thumps and booms. */
function sweep(o, t0, f0, f1, tg, tau, amp, atk = 0.001) {
  const n0 = (t0 * SR) | 0, len = Math.min(o.length - n0, (tau * 7 * SR) | 0);
  const dg = Math.exp(-1 / (tg * SR)), d = Math.exp(-1 / (tau * SR)), na = Math.max(1, atk * SR), w1 = (TAU * f1) / SR;
  let dw = (TAU * (f0 - f1)) / SR, ph = 0, e = amp;
  for (let i = 0; i < len; i++) {
    o[n0 + i] += Math.sin(ph) * e * (i < na ? i / na : 1);
    ph += w1 + dw; dw *= dg; e *= d;
  }
}

/** Gritty texture: sparse grains of fast-decaying noise, `dens` grains/s thinning out with tauD. */
function crackle(o, t0, dur, amp, dens, tauD, tauG, fLo, fHi) {
  const n0 = (t0 * SR) | 0, len = Math.min(o.length - n0, (dur * SR) | 0), fo = 1 / (0.008 * SR);
  const kl = 1 - Math.exp((-TAU * Math.min(fHi, SR * 0.45)) / SR), kh = 1 - Math.exp((-TAU * fLo) / SR);
  const dg = Math.exp(-1 / (tauG * SR)), dp = Math.exp(-1 / (tauD * SR));
  let p = dens / SR, a = 0, l = 0, h = 0, s = lcgSeed();
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, LA) + LC) | 0;
    if (s * I31 * 0.5 + 0.5 < p) { const r = rnd(); a = Math.max(a, r * r); } // a new grain
    s = (Math.imul(s, LA) + LC) | 0;
    l += kl * (s * I31 * a - l); h += kh * (l - h);
    o[n0 + i] += (l - h) * amp * Math.min(1, (len - i) * fo);
    a *= dg; p *= dp;
  }
}

/** One shard/chip landing: 2-3 inharmonic partials + micro click (glass) or a mid "clack" (ceramic). */
function ping(o, t, f, tau, a, clack = 0) {
  mode(o, t, f, tau, a);
  mode(o, t, f * rr(1.42, 1.78), tau * 0.7, a * rr(0.3, 0.6));
  if (rnd() < 0.5) mode(o, t, f * rr(2.2, 2.9), tau * 0.45, a * 0.3);
  if (clack) tick(o, t, 0.003, a * clack, f * rr(0.6, 0.9), 1.4);
  else burst(o, t, 0.0005, a * 0.6, 3000);
}

/** Granular cloud of n pings over T seconds — dense at first, thinning out; some shards bounce. */
function cloud(o, t0, T, n, fLo, fHi, tauLo, tauHi, amp, clack) {
  for (let k = 0; k < n; k++) {
    const u = Math.pow(rnd(), 1.9), t = t0 + T * u, p = rnd(), f = fLo * Math.pow(fHi / fLo, p);
    const a = amp * (0.12 + 0.88 * rnd() * rnd()) * Math.exp(-1.7 * u);
    const tau = lerp(tauLo, tauHi, p) * rr(0.6, 1.4); // low pings ring longer
    ping(o, t, f, tau, a, clack);
    if (rnd() < 0.22) { // tink-tink-tk
      bounces(t, rr(0.03, 0.07), ri(2, 3), (tb, e) => tb > t && ping(o, tb, f * rr(0.97, 1.03), tau * 0.8, a * e * 0.6, clack));
    }
  }
}

/** Bouncing contact: n events with shrinking intervals and falling energy. */
function bounces(t, dt, n, cb) {
  for (let e = 1; n-- > 0; t += dt * rr(0.75, 1.25), dt *= 0.78, e *= 0.8) cb(t, e);
}

/** A handful of irregular crackles (band-passed ticks) with descending energy: splinters, crunch. */
function crunch(o, t0, T, n, amp, fLo, fHi, qLo = 1.5, qHi = 4) {
  for (let k = 0; k < n; k++) {
    const u = Math.pow(rnd(), 1.5);
    tick(o, t0 + T * u, rr(0.002, 0.006), amp * Math.exp(-2.2 * u) * rr(0.4, 1), rx(fLo, fHi), rr(qLo, qHi));
  }
}

/**
 * Stick-slip friction (groans, creaks, screeches): an irregular sawtooth of slips at f0->f1 Hz
 * drives resonators [fc, q, gain] whose pitch drifts by `sag` (fraction) over the duration.
 */
function stickSlip(o, t0, dur, amp, f0, f1, jit, formants, sag) {
  const n = (dur * SR) | 0, tmp = new Float32Array(n), st = formants.map(() => [0, 0, 0, 0, 0]);
  let ph = 0, per = 1, pa = 1, pk = 1e-9;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if ((i & 31) === 0) {
      for (let j = 0; j < st.length; j++) {
        const g = Math.tan((Math.PI * formants[j][0] * (1 + sag * u)) / SR), k = 1 / formants[j][1], s = st[j];
        s[2] = 1 / (1 + g * (g + k)); s[3] = g * s[2]; s[4] = g * s[3];
      }
    }
    ph += (lerp(f0, f1, u) / SR) * per;
    if (ph >= 1) { ph -= 1; per = 1 + jit * (rnd() * 2 - 1); pa = rr(0.4, 1); }
    const q = 1 - ph, x = (q * q * q * q - 0.2) * pa + (rnd() - 0.5) * 0.08; // sharp slip, slow stick, hiss
    let y = 0;
    for (let j = 0; j < st.length; j++) {
      const s = st[j], v3 = x - s[1], v1 = s[2] * s[0] + s[3] * v3, v2 = s[1] + s[3] * s[0] + s[4] * v3;
      s[0] = 2 * v1 - s[0]; s[1] = 2 * v2 - s[1];
      y += (v1 * formants[j][2]) / formants[j][1];
    }
    y *= Math.min(1, u * 8) * Math.min(1, (1 - u) * 5);
    tmp[i] = y;
    if (y > pk) pk = y; else if (-y > pk) pk = -y;
  }
  const n0 = (t0 * SR) | 0, s = amp / pk;
  for (let i = 0, e = Math.min(n, o.length - n0); i < e; i++) o[n0 + i] += tmp[i] * s;
}

/** Electrical arc: a harmonic-rich buzz pulse-modulating bright crackly noise, gated irregularly. */
function zap(o, t0, dur, amp, fBuzz) {
  const n0 = (t0 * SR) | 0, len = Math.min(o.length - n0, (dur * SR) | 0);
  const kh = 1 - Math.exp((-TAU * 1500) / SR), kl = 1 - Math.exp((-TAU * 9000) / SR);
  let ph = rnd(), gate = 1, gateN = 0, h = 0, l = 0, cr = 1;
  for (let i = 0; i < len; i++) {
    if (gateN-- <= 0) { gate = i === 0 || rnd() < 0.72 ? rr(0.5, 1) : 0.03; gateN = rr(0.004, 0.022) * SR; }
    ph += fBuzz / SR; if (ph >= 1) ph -= 1;
    const pulse = ph < 0.35 ? 1 : 0; // the arc strikes once per buzz cycle
    if (rnd() < 0.03) cr = rr(0.3, 1.6);
    let x = (rnd() * 2 - 1) * (0.3 + 0.7 * pulse) * cr + pulse * 0.5;
    if (rnd() < 0.004) x += rr(-2, 2); // stray snaps
    h += kh * (x - h); l += kl * (x - h - l);
    o[n0 + i] += l * gate * amp * Math.min(1, ((len - i) / len) * 5);
  }
}

// Inharmonic partial ratios of a glass vessel and of a metal plate/bell.
const GLASS = [1, 1.47, 2.09, 2.56, 3.14, 3.93], PLATE = [1, 1.51, 2.12, 2.76, 3.57, 4.38, 5.43, 6.71, 8.21, 9.9];

/** Glass shatter: crack -> choked ring of the object -> granular cloud of shard pings -> "shhk". */
function shatter(T, n, fLo, fHi) {
  const o = buf(T + 0.2);
  burst(o, 0, rr(0.0025, 0.005), 1.2); // the crack: 5-15 ms, broadband
  tick(o, 0, 0.012, 0.9, rr(2200, 3800), 1.2);
  tick(o, 0, 0.01, 0.4, rr(450, 700), 1.5); // the pane giving way
  modes(o, 0, rr(1500, 2300), GLASS, 0.026, 0.5, 0.55, { twin: 0.02 }); // the object itself, choked
  cloud(o, 0.004, T, n, fLo, fHi, 0.03, 0.005, 0.85, 0);
  crackle(o, 0, T * 0.9, 0.7, 2600, T * 0.17, 0.0012, 3500, 16000); // fine shard hiss
  burst(o, 0, 0.045, 0.35, 4000, 16000, 0.002);
  return o;
}

/** Trim trailing silence, fade the tail, peak-normalize. */
function finish(o, fadeSec = 0.012, peak = 0.9) {
  let pk = 1e-9;
  for (let i = 0; i < o.length; i++) { const a = Math.abs(o[i]); if (a > pk) pk = a; }
  let end = o.length;
  for (const thr = pk * 0.002; end > 64 && Math.abs(o[end - 1]) < thr;) end--;
  const out = o.subarray(0, end), fade = Math.min(end, (fadeSec * SR) | 0), s = peak / pk;
  for (let i = 0; i < end; i++) out[i] *= s;
  for (let i = 0; i < fade; i++) out[end - 1 - i] *= i / fade;
  return out;
}

// ─────────────────── Sound families: name -> [variations, generator, tail fade (s)] ───────────────────
const FAM = {
  // ---- impacts ----
  iGlass: [4, () => { // bright inharmonic clink, beating partials, crisp click
    const o = buf(0.45);
    modes(o, 0, rr(1800, 2300), GLASS, rr(0.035, 0.055), 0.7, 1, { twin: 0.007, tilt: 0.8 });
    burst(o, 0, 0.0008, 1, 2500);
    tick(o, 0, 0.004, 0.3, rr(700, 1100), 1.2);
    return o;
  }],
  iCeramic: [4, () => { // lower, duller, chunkier than glass, mid "clack"
    const o = buf(0.3);
    modes(o, 0, rr(900, 1320), [1, 1.62, 2.31, 3.05, 3.4], rr(0.018, 0.03), 0.6, 1, { twin: 0.008, tilt: 0.72 });
    tick(o, 0, 0.005, 0.9, rr(1300, 2100), 1.4);
    burst(o, 0, 0.001, 0.7, 1500, 9000);
    return o;
  }],
  iWood: [4, () => { // few low damped modes + noisy knock
    const o = buf(0.22);
    const ratios = [1, 1.9, 2.75, 3.6, 4.4].slice(0, ri(3, 5));
    modes(o, 0, rr(140, 220), ratios, rr(0.011, 0.022), 0.5, 1, { det: 0.08, tilt: 0.6 });
    burst(o, 0, 0.005, 1.2, 180, 2600);
    burst(o, 0, 0.001, 0.4, 1200, 7000);
    return o;
  }],
  iWoodHollow: [4, () => { // furniture panel: lower, more resonant, boxy cavity
    const o = buf(0.5), f0 = rr(95, 140);
    modes(o, 0, f0, [1, 1.83, 2.6, 3.45, 4.7, 6.2], rr(0.04, 0.065), 0.55, 1, { det: 0.08, tilt: 0.68 });
    tick(o, 0, 0.03, 0.5, rr(230, 380), 5);
    burst(o, 0, 0.006, 1, 120, 2200);
    burst(o, 0, 0.001, 0.3, 1200, 6000);
    return o;
  }],
  iMetal: [4, () => { // bell/plate: long inharmonic ring, bright strike
    const o = buf(1.1);
    modes(o, 0, rr(430, 680), PLATE, rr(0.1, 0.15), 0.55, 1, { det: 0.04, twin: 0.006, tilt: 0.86 });
    burst(o, 0, 0.0012, 0.9, 3500);
    tick(o, 0, 0.004, 0.45, rr(2200, 3400), 1.5);
    return o;
  }, 0.12],
  iSheet: [4, () => { // appliance panel: low, dense, wobbly modes + flex boom + rattle
    const o = buf(0.95), f0 = rr(105, 165);
    const ratios = [1, 1.36, 1.83, 2.32, 2.95, 3.62, 4.48, 5.6, 7.1, 9.2, 11.8, 15.1];
    modes(o, 0, f0, ratios, rr(0.09, 0.14), 0.6, 1, { det: 0.06, am: 0.4, tilt: 0.9 });
    sweep(o, 0, f0 * 1.35, f0 * 0.8, 0.03, 0.05, 1);
    bounces(rr(0.012, 0.03), rr(0.016, 0.026), ri(6, 11), (t, e) => tick(o, t, 0.003, 0.55 * e, rr(1500, 4200), 2));
    burst(o, 0, 0.002, 0.9, 800, 8000);
    burst(o, 0, 0.06, 0.3, 1200, 5000, 0.002);
    return o;
  }, 0.1],
  iPlastic: [4, () => { // mid modes, very short: dull clack
    const o = buf(0.12);
    modes(o, 0, rr(380, 640), [1, 1.71, 2.4, 3.35], rr(0.006, 0.013), 0.4, 1, { det: 0.1, tilt: 0.65 });
    burst(o, 0, 0.0025, 1, 350, 4500);
    return o;
  }],
  iElec: [4, () => { // plastic shell + faint metallic ring + loose bits rattling inside
    const o = buf(0.26);
    modes(o, 0, rr(290, 450), [1, 1.6, 2.5, 3.6], rr(0.008, 0.016), 0.4, 1, { det: 0.1, tilt: 0.65 });
    burst(o, 0, 0.003, 1, 300, 4000);
    modes(o, 0, rr(2200, 3200), [1, 1.37, 1.86], rr(0.02, 0.04), 0.5, 0.15, { twin: 0.01 });
    for (let k = ri(3, 5), t = 0; k-- > 0;) { t += rr(0.008, 0.03); tick(o, t, 0.002, rr(0.12, 0.3), rr(2800, 5200), 3); }
    return o;
  }],
  iConcrete: [4, () => { // hard low knock + grit (also the ground)
    const o = buf(0.2);
    modes(o, 0, rr(90, 135), [1, 2.3, 4.1, 6.3], rr(0.009, 0.014), 0.5, 1, { det: 0.1, tilt: 0.55 });
    burst(o, 0, 0.007, 1.3, 80, 1700);
    crackle(o, 0.002, 0.07, 0.4, 1500, 0.02, 0.0015, 1200, 5000);
    return o;
  }],
  iPaper: [4, () => { // book: dull thud + papery slap
    const o = buf(0.2);
    burst(o, 0, rr(0.011, 0.016), 1, 40, rr(700, 1000));
    burst(o, 0, 0.003, 0.4, 1200, 4000);
    sweep(o, 0, rr(95, 125), 70, 0.03, 0.03, 0.8);
    return o;
  }],
  iFabric: [4, () => { // cushion: soft muffled thump, no click
    const o = buf(0.3);
    burst(o, 0, rr(0.025, 0.035), 1, 30, rr(280, 400), 0.004);
    sweep(o, 0, rr(72, 90), 50, 0.04, rr(0.04, 0.055), 0.9, 0.005);
    return o;
  }],
  iRubber: [4, () => { // dull bouncy thunk with a quick pitch drop
    const o = buf(0.26), f = rr(170, 220);
    sweep(o, 0, f, f * 0.62, 0.025, rr(0.03, 0.045), 1, 0.0015);
    sweep(o, 0, f * 2.6, f * 1.9, 0.02, 0.014, 0.25, 0.001);
    burst(o, 0, 0.005, 0.45, 100, 1300);
    return o;
  }],
  thud: [3, () => { // sub layer under heavy impacts: 110 -> 45 Hz sweep, lightly saturated
    const o = buf(0.34);
    sweep(o, 0, rr(105, 120), rr(42, 48), 0.05, rr(0.06, 0.085), 1, 0.003);
    burst(o, 0, 0.02, 0.3, 30, 220, 0.002);
    for (let i = 0; i < o.length; i++) o[i] = sat(o[i] * 1.8);
    return o;
  }],
  // ---- debris ticks (tiny, cheap) ----
  dGlass: [5, () => { const o = buf(0.07); ping(o, 0, rx(3200, 8500), rr(0.005, 0.011), 1); return o; }],
  dCeramic: [5, () => { const o = buf(0.05); ping(o, 0, rx(1500, 3800), rr(0.004, 0.007), 1, 0.6); return o; }],
  dWood: [5, () => { const o = buf(0.05); tick(o, 0, rr(0.003, 0.005), 1, rx(700, 1900), 3); mode(o, 0, rr(450, 950), 0.005, 0.5); return o; }],
  dMetal: [5, () => {
    const o = buf(0.09), f = rx(2000, 5200);
    mode(o, 0, f, rr(0.01, 0.016), 1);
    mode(o, 0, f * rr(1.45, 1.6), 0.009, 0.6); mode(o, 0, f * rr(2.3, 2.8), 0.006, 0.4);
    burst(o, 0, 0.0006, 0.5, 3000);
    return o;
  }],
  dPlastic: [5, () => { const o = buf(0.04); tick(o, 0, 0.0025, 1, rx(1100, 2600), 2); mode(o, 0, rr(800, 1300), 0.003, 0.5); return o; }],
  dConcrete: [5, () => { const o = buf(0.04); burst(o, 0, rr(0.003, 0.005), 1, 300, 2600); return o; }],
  // ---- fractures ----
  fGlassS: [4, () => shatter(rr(0.7, 0.82), ri(45, 62), 2400, 10500), 0.03],
  fGlassL: [3, () => shatter(rr(1.05, 1.15), ri(95, 120), 1900, 9000), 0.04],
  fCeramic: [3, () => { // crack + cloud of clacky pings + gritty noise
    const o = buf(0.72);
    burst(o, 0, 0.004, 1.4, 60, 7000);
    tick(o, 0, 0.012, 1, rr(1100, 1800), 1.3);
    sweep(o, 0, 170, 110, 0.02, 0.022, 0.5);
    modes(o, 0, rr(800, 1200), [1, 1.62, 2.31, 3.05], 0.014, 0.5, 0.6);
    cloud(o, 0.004, 0.5, ri(22, 48), 900, 4500, 0.016, 0.004, 0.65, 0.6);
    crackle(o, 0, 0.42, 0.9, 1800, 0.09, 0.002, 1200, 6500);
    return o;
  }, 0.03],
  fWood: [4, () => { // sharp CRACK with 300-2500 Hz body, splinter crackles, low thump
    const o = buf(0.72);
    burst(o, 0, 0.0025, 1.5, 100, 12000);
    for (const f of [rr(320, 520), rr(900, 1300), rr(1800, 2500)]) tick(o, 0, rr(0.01, 0.018), 0.9, f, 3);
    modes(o, 0, rr(170, 260), [1, 1.9, 2.75, 3.6], 0.02, 0.5, 0.7, { det: 0.1 });
    const fibres = [[rr(600, 900), 3, 1], [rr(1500, 2200), 3, 0.7]]; // fibres tearing right after the crack
    stickSlip(o, 0.004, rr(0.04, 0.09), 0.3, rr(160, 240), rr(70, 110), 0.5, fibres, -0.2);
    const T = rr(0.18, 0.45);
    for (let k = ri(6, 14); k-- > 0;) { // splinters
      const u = Math.pow(rnd(), 1.6), t = 0.012 + T * u, e = 1.5 * Math.exp(-1.6 * u) * rr(0.4, 1);
      tick(o, t, rr(0.002, 0.006), e, rx(700, 4200), rr(1.5, 4));
      if (rnd() < 0.4) mode(o, t, rr(250, 800), rr(0.006, 0.015), e * 0.5);
    }
    sweep(o, 0.002, rr(120, 150), rr(55, 70), 0.04, 0.05, 0.9, 0.002);
    return o;
  }],
  fMetal: [3, () => { // clank + rattle of parts + short tearing screech
    const o = buf(1.0);
    const clank = { det: 0.05, twin: 0.01, am: 0.25, tilt: 0.88 };
    modes(o, 0, rr(300, 480), PLATE.slice(0, 8), rr(0.09, 0.15), 0.5, 1, clank);
    burst(o, 0, 0.002, 1.2, 1500);
    bounces(rr(0.03, 0.06), rr(0.04, 0.07), ri(5, 9), (t, e) => {
      const f = rr(1400, 4200);
      mode(o, t, f, 0.014, 0.4 * e); mode(o, t, f * rr(1.4, 1.6), 0.01, 0.25 * e); burst(o, t, 0.001, 0.4 * e, 2500);
    });
    const f = rr(1900, 2600);
    const tear = [[f, 6, 1], [f * 1.6, 7, 0.8], [f * 2.5, 6, 0.5]];
    stickSlip(o, rr(0.01, 0.03), rr(0.12, 0.22), 0.7, rr(380, 520), rr(700, 950), 0.2, tear, 0.25);
    return o;
  }, 0.08],
  fPlastic: [3, () => { // snap + short crunch
    const o = buf(0.34);
    burst(o, 0, 0.0012, 1.5, 300, 12000);
    tick(o, 0, 0.004, 1, rr(2000, 3200), 1.5);
    modes(o, 0, rr(550, 850), [1, 1.71, 2.4], 0.009, 0.4, 0.7, { det: 0.1 });
    crunch(o, 0.01, rr(0.08, 0.16), ri(5, 10), 1.3, 900, 3800);
    return o;
  }],
  fElec: [3, () => { // plastic crunch + glassy tinkle + mains-buzz zap
    const o = buf(0.62);
    burst(o, 0, 0.0015, 1.4, 300, 10000);
    tick(o, 0, 0.005, 0.9, rr(1600, 2600), 1.5);
    modes(o, 0, rr(380, 560), [1, 1.6, 2.5], 0.012, 0.4, 0.7, { det: 0.1 });
    crunch(o, 0.008, rr(0.12, 0.2), ri(7, 12), 1.2, 800, 3600);
    cloud(o, 0.02, 0.35, ri(8, 14), 3000, 8500, 0.02, 0.005, 0.35, 0);
    zap(o, rr(0.02, 0.05), rr(0.08, 0.16), 0.5, rr(50, 120));
    return o;
  }],
  fConcrete: [3, () => { // low crack + crumbling clacks + grit
    const o = buf(0.68);
    burst(o, 0, 0.008, 1.3, 60, 3000);
    sweep(o, 0, 110, 60, 0.03, 0.045, 0.9);
    crunch(o, 0.01, 0.45, ri(14, 24), 0.8, 300, 1600, 0.8, 2);
    crackle(o, 0, 0.45, 0.7, 1500, 0.1, 0.003, 350, 2800);
    return o;
  }, 0.03],
  fSoft: [3, () => { // rip / tear for paper, fabric, rubber
    const o = buf(0.32), d = rr(0.14, 0.24);
    crackle(o, 0, d, 1, 2600, d * 0.6, 0.002, 700, 4200);
    burst(o, 0, d * 0.3, 0.12, 500, 4000, 0.01);
    sweep(o, 0, 100, 70, 0.03, 0.03, 0.12);
    return o;
  }],
  // ---- one-offs ----
  bend: [3, () => { // stick-slip metal groan: slowing pulses, sagging pitch, a few ringing partials
    const o = buf(0.62), f = rr(260, 380);
    const body = [[f, 14, 1], [f * rr(2.2, 2.7), 18, 0.7], [f * rr(4.6, 5.6), 12, 0.4]];
    stickSlip(o, 0, 0.6, 1, rr(55, 70), rr(20, 28), 0.3, body, -0.18);
    for (let k = ri(2, 3); k-- > 0;) mode(o, rr(0.03, 0.4), rr(900, 2600), rr(0.05, 0.11), rr(0.1, 0.2));
    burst(o, 0, 0.25, 0.08, 300, 2500, 0.03);
    return o;
  }, 0.03],
  spark: [5, () => { // 30-120 ms of crackly noise chopped by a 100 Hz buzz
    const d = rr(0.03, 0.12), o = buf(d + 0.02);
    burst(o, 0, 0.0008, 1, 2000);
    zap(o, 0, d, 0.8, 100);
    return o;
  }, 0.004],
  explosion: [3, () => { // hard crack, saturated 90->30 Hz boom, brown-noise rumble under a closing low-pass
    const o = buf(2.15), n = o.length;
    burst(o, 0, 0.006, 1.4);
    tick(o, 0, 0.03, 0.9, rr(1300, 2400), 0.7);
    sweep(o, 0, rr(85, 95), rr(28, 33), 0.14, rr(0.32, 0.42), 1.8, 0.002);
    const d1 = Math.exp(-1 / (0.22 * SR)), d2 = Math.exp(-1 / (0.75 * SR)), atk = 1 / (0.012 * SR);
    let b = 0, l1 = 0, l2 = 0, k = 0, roll = 1, target = 1, e1 = 0.65 * 1.8, e2 = 0.35 * 1.8, s = lcgSeed();
    for (let i = 0; i < n; i++) {
      if ((i & 63) === 0) {
        k = 1 - Math.exp((-TAU * (70 + 2200 * Math.exp(-i / SR / 0.4))) / SR);
        if ((i & 2047) === 0) target = rr(0.45, 1.25); // slow "rolling" of the rumble
      }
      s = (Math.imul(s, LA) + LC) | 0;
      b = b * 0.996 + s * I31 * 0.09;
      l1 += k * (b - l1); l2 += k * (l1 - l2); roll += (target - roll) * 0.0006;
      o[i] += l2 * roll * (e1 + e2) * (i * atk < 1 ? i * atk : 1); // fast blast + slow tail
      e1 *= d1; e2 *= d2;
    }
    crackle(o, 0.03, 0.8, 0.6, 700, 0.25, 0.004, 300, 5000); // falling debris
    for (let i = 0; i < n; i++) o[i] = sat(o[i] * 1.5); // glue + grit
    return o;
  }, 0.5],
  whoosh: [3, () => { // band-passed noise, centre frequency and level rising then falling
    const o = buf(0.42), n = o.length, fPk = rr(1000, 1600), k = 1 / 1.4;
    let s1 = 0, s2 = 0, a1 = 0, a2 = 0, a3 = 0, env = 0, s = lcgSeed();
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) {
        env = Math.sin(Math.PI * Math.pow(i / n, 0.6)) ** 2;
        const g = Math.tan((Math.PI * (240 + fPk * env)) / SR);
        a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
      }
      s = (Math.imul(s, LA) + LC) | 0;
      const v3 = s * I31 - s2, v1 = a1 * s1 + a2 * v3, v2 = s2 + a2 * s1 + a3 * v3;
      s1 = 2 * v1 - s1; s2 = 2 * v2 - s2;
      o[i] = v1 * env;
    }
    return o;
  }, 0.03],
  uiClick: [1, () => { const o = buf(0.05); mode(o, 0, 1900, 0.004, 1); mode(o, 0, 2850, 0.003, 0.4); burst(o, 0, 0.0006, 0.25, 2000); return o; }],
  uiSpawn: [1, () => { const o = buf(0.18); sweep(o, 0, 420, 760, 0.03, 0.035, 1, 0.004); sweep(o, 0, 840, 1520, 0.03, 0.02, 0.2, 0.004); return o; }],
  uiError: [1, () => {
    const o = buf(0.26);
    for (const [t, f] of [[0, 196], [0.085, 147]]) {
      mode(o, t, f, 0.03, 1); mode(o, t, f * 2, 0.025, 0.5); mode(o, t, f * 3, 0.02, 0.3);
    }
    return o;
  }],
};

// ───────────────────────────────────── Materials ─────────────────────────────────────
// imp/hollow: impact families · ref/href: object size (m) that plays at rate 1 · g: impact gain
// fc: lowpass cutoff (Hz) of the softest hit · frac/fracL/fg: fracture family (large tier) + gain
// deb/dg: debris family + gain
const MAT = {
  glass: { imp: 'iGlass', ref: 0.16, g: 0.5, fc: 2600, frac: 'fGlassS', fracL: 'fGlassL', fg: 1.0, deb: 'dGlass', dg: 0.24 },
  ceramic: { imp: 'iCeramic', ref: 0.16, g: 0.55, fc: 2200, frac: 'fCeramic', fg: 0.9, deb: 'dCeramic', dg: 0.24 },
  wood: { imp: 'iWood', hollow: 'iWoodHollow', ref: 0.45, href: 0.8, g: 0.7, fc: 1400, frac: 'fWood', fg: 1.0, deb: 'dWood', dg: 0.22 },
  metal: { imp: 'iMetal', hollow: 'iSheet', ref: 0.3, href: 0.7, g: 0.45, fc: 2200, frac: 'fMetal', fg: 0.8, deb: 'dMetal', dg: 0.2 },
  plastic: { imp: 'iPlastic', ref: 0.22, g: 0.6, fc: 1800, frac: 'fPlastic', fg: 0.75, deb: 'dPlastic', dg: 0.2 },
  electronics: { imp: 'iElec', ref: 0.35, g: 0.6, fc: 1800, frac: 'fElec', fg: 0.8, deb: 'dPlastic', dg: 0.2 },
  concrete: { imp: 'iConcrete', ref: 0.5, g: 0.75, fc: 1200, frac: 'fConcrete', fg: 0.9, deb: 'dConcrete', dg: 0.22 },
  paper: { imp: 'iPaper', ref: 0.25, g: 0.55, fc: 1000, frac: 'fSoft', fg: 0.5, deb: 'dConcrete', dg: 0.07 },
  fabric: { imp: 'iFabric', ref: 0.5, g: 0.5, fc: 700, frac: 'fSoft', fg: 0.45, deb: null, dg: 0 },
  rubber: { imp: 'iRubber', ref: 0.25, g: 0.6, fc: 900, frac: 'fSoft', fg: 0.5, deb: 'dPlastic', dg: 0.1 },
};
const UI = { click: ['uiClick', 0.11], spawn: ['uiSpawn', 0.1], error: ['uiError', 0.12] };

// ───────────────────────────────────── Mixing constants ─────────────────────────────────────
const REF_DIST = 2.5, ROLLOFF = 1.1, MAX_DIST = 300;
const MAX_VOICES = 36, MAX_DEBRIS = 10, HRTF_MAX = 10;
const MIN_LEVEL = 0.004; // estimated gain at the listener below which a sound is skipped
const WET = 0.14, NO = Object.freeze({});
const sizeRate = (ref, size) => clamp(Math.pow(ref / size, 0.45), 0.45, 2.4);
const jitter = () => 0.94 + Math.random() * 0.12; // ±6 % pitch
const curve = (i) => Math.pow(i, 0.7); // perceptual loudness curve
const finite3 = (p) => !!p && Number.isFinite(p.x + p.y + p.z);

/** Stereo room impulse (energy-normalized): sparse early reflections + decaying, darkening noise. */
function makeImpulse(ctx, seconds = 1.0) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), ir = ctx.createBuffer(2, n, sr), r = mulberry32(0x5eed);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch), early = new Float32Array(n);
    let lp = 0, hp = 0, k = 0, eT = 0, eE = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 31) === 0) k = 1 - Math.exp((-TAU * (1800 + 7000 * Math.exp(-t / 0.25))) / sr); // highs die first
      lp += k * (r() * 2 - 1 - lp); hp += 0.02 * (lp - hp);
      d[i] = (lp - hp) * Math.min(1, t / 0.03) * Math.exp(-t / 0.15) * Math.min(1, (n - i) / (0.05 * sr));
      eT += d[i] * d[i];
    }
    for (let j = 0; j < 9; j++) {
      const t = 0.006 + 0.055 * Math.pow((j + r()) / 9, 1.3), i = (t * sr) | 0;
      const a = (r() < 0.5 ? -1 : 1) * Math.exp(-t / 0.04);
      early[i] += a; early[i + 1] += a * 0.5;
    }
    for (let i = 0; i < n; i++) eE += early[i] * early[i];
    const sT = Math.sqrt(0.7 / eT), sE = Math.sqrt(0.3 / eE); // 70 % tail, 30 % early energy
    for (let i = 0; i < n; i++) d[i] = d[i] * sT + early[i] * sE;
  }
  return ir;
}

/** Transparent below |x| = 0.7, then a smooth knee to 1. Curve spans input -2..2 (fed at half gain). */
function softClipCurve() {
  const n = 2049, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2, a = Math.abs(x);
    c[i] = a < 0.7 ? x : Math.sign(x) * (0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
  }
  return c;
}

// ───────────────────────────────────── Engine ─────────────────────────────────────
export class AudioEngine {
  constructor() {
    this.ctx = null; // created in unlock() (autoplay policy)
    this._dead = false; // Web Audio missing or failed: everything stays a no-op
    this._vol = 0.8;
    this._ts = 1; this._tsRate = 1;
    this._lis = { x: 0, y: 0, z: 0 };
    this._voices = [];
    this._bufs = Object.create(null); // family -> AudioBuffer[] (sparse until rendered)
    this._lastVar = Object.create(null);
    this._thr = Object.create(null); // family -> ring of last 3 start times
    this._debT = -1e9; this._hrtfAt = Infinity;
    this._synthMs = 0; this._started = 0; this._peakVoices = 0;
  }

  /** Call from a user gesture. Creates/resumes the context and builds the graph. Idempotent. */
  unlock() {
    if (this._dead) return;
    try {
      if (!this.ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) { this._dead = true; return; }
        this.ctx = new AC({ latencyHint: 'interactive' });
        this._build();
        this._warm();
      }
      if (this.ctx.state !== 'running') { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
    } catch (e) { this._dead = true; }
  }

  get ready() { return !!this.ctx && !this._dead && this.ctx.state === 'running'; }

  setMasterVolume(v) {
    try {
      if (!Number.isFinite(+v)) return;
      this._vol = clamp(+v, 0, 1);
      if (this._master) this._master.gain.setTargetAtTime(this._vol, this.ctx.currentTime, 0.02);
    } catch (e) { /* never throw into the game loop */ }
  }

  /** Slow-mo: pitch follows s^0.45 (new and already-ringing sounds glide), mix darkens below 0.5. */
  setTimeScale(s) {
    try {
      s = clamp(+s, 0.03, 4);
      if (!(s > 0) || s === this._ts) return;
      this._ts = s; this._tsRate = Math.pow(s, 0.45);
      if (!this.ctx || this._dead) return;
      const now = this.ctx.currentTime;
      this._slow.frequency.setTargetAtTime(this._slowCut(), now, 0.08);
      for (const v of this._voices) v.src.playbackRate.setTargetAtTime(v.rate * this._tsRate, now, 0.08);
    } catch (e) { /* ignore */ }
  }

  setListener(pos, forward, up) {
    try {
      const p = this._lis;
      if (finite3(pos)) { p.x = pos.x; p.y = pos.y; p.z = pos.z; }
      if (!this.ctx || this._dead) return;
      const l = this.ctx.listener, f = finite3(forward) ? forward : null, u = finite3(up) ? up : { x: 0, y: 1, z: 0 };
      const ok = f && f.x * f.x + f.y * f.y + f.z * f.z > 1e-9;
      if (l.positionX) {
        l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
        if (ok) {
          l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z;
          l.upX.value = u.x; l.upY.value = u.y; l.upZ.value = u.z;
        }
      } else {
        l.setPosition(p.x, p.y, p.z);
        if (ok) l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
      }
    } catch (e) { /* ignore */ }
  }

  /** A collision / knock. opts.hollow selects the panel flavour (wood furniture, sheet metal). */
  impact(material, pos, intensity = 0.5, size = 0.3, opts) {
    if (!this.ready) return;
    try {
      const m = MAT[material] || MAT.plastic, i = clamp(+intensity, 0, 1.5);
      if (!(i > 0.015)) return;
      size = clamp(+size || m.ref, 0.01, 2.5);
      const hollow = !!(opts && opts.hollow && m.hollow), ref = hollow ? m.href : m.ref;
      const gain = m.g * curve(i) * clamp(Math.pow(size / ref, 0.22), 0.6, 1.35);
      const cut = m.fc * Math.pow(18000 / m.fc, Math.pow(Math.min(i, 1), 0.6)); // soft = dull, hard = bright
      this._play(hollow ? m.hollow : m.imp, pos, gain, sizeRate(ref, size) * jitter(), cut);
      this._thud(pos, i * size);
    } catch (e) { /* ignore */ }
  }

  /** The object breaks: shatter / crack+splinter / smash / snap+crunch / clank+tear / crunch+zap. */
  fracture(material, pos, intensity = 1, size = 0.3) {
    if (!this.ready) return;
    try {
      const m = MAT[material] || MAT.plastic, i = clamp(+intensity, 0, 1.5);
      if (!(i > 0.015)) return;
      size = clamp(+size || m.ref, 0.01, 2.5);
      const fam = m.fracL && size > 0.4 ? m.fracL : m.frac;
      const rate = clamp(Math.pow((m.ref * (fam === m.fracL ? 4 : 1.5)) / size, 0.3), 0.68, 1.6) * jitter();
      const gain = m.fg * (0.45 + 0.55 * curve(i)) * clamp(Math.pow(size / m.ref, 0.15), 0.7, 1.25);
      this._play(fam, pos, gain, rate, lerp(8000, 19000, Math.min(i, 1)));
      this._thud(pos, i * size * 0.8);
    } catch (e) { /* ignore */ }
  }

  /** Tiny fragment tick/tinkle. Called a lot: at most one per 12 ms, 10 at once. */
  debris(material, pos, intensity = 0.4) {
    if (!this.ready) return;
    try {
      const m = MAT[material] || MAT.plastic, i = clamp(+intensity, 0, 1.5), ms = nowMs();
      if (!m.deb || !(i > 0.02) || ms - this._debT < 12) return;
      let n = 0;
      for (const v of this._voices) if (v.debris) n++;
      if (n >= MAX_DEBRIS) return;
      const o = { debris: true, delay: Math.random() * 0.008 }; // small offset avoids phasing
      const cut = lerp(5000, 18000, Math.min(i, 1));
      if (this._play(m.deb, pos, m.dg * curve(i), 0.8 + Math.random() * 0.55, cut, o)) this._debT = ms;
    } catch (e) { /* ignore */ }
  }

  /** Metal bending groan/creak, 0.25-0.6 s depending on intensity. */
  bend(pos, intensity = 0.6, size = 0.5) {
    if (!this.ready) return;
    try {
      const i = clamp(+intensity, 0, 1.5);
      if (!(i > 0.02)) return;
      const rate = clamp(Math.pow(0.5 / clamp(+size || 0.5, 0.01, 2.5), 0.35), 0.6, 1.6) * jitter();
      const dur = lerp(0.25, 0.6, Math.min(i, 1));
      this._play('bend', pos, 0.5 * curve(i), rate, lerp(3000, 14000, Math.min(i, 1)), { dur });
    } catch (e) { /* ignore */ }
  }

  spark(pos, intensity = 0.7) {
    if (!this.ready) return;
    try {
      const i = clamp(+intensity, 0, 1.5);
      if (i > 0.02) this._play('spark', pos, 0.5 * curve(i), 0.9 + Math.random() * 0.3, 18000);
    } catch (e) { /* ignore */ }
  }

  explosion(pos, intensity = 1) {
    if (!this.ready) return;
    try {
      const i = clamp(+intensity, 0, 1.5);
      if (!(i > 0.02)) return;
      const rate = lerp(1.25, 0.85, Math.min(i, 1)) * jitter(); // bigger = deeper; carries further than other sounds
      this._play('explosion', pos, 0.5 + 0.5 * curve(i), rate, 20000, { ref: 8 });
    } catch (e) { /* ignore */ }
  }

  whoosh(pos, intensity = 0.6) {
    if (!this.ready) return;
    try {
      const i = clamp(+intensity, 0, 1.5);
      if (i > 0.02) this._play('whoosh', pos, 0.32 * curve(i), lerp(0.8, 1.3, Math.min(i, 1)) * jitter(), 12000);
    } catch (e) { /* ignore */ }
  }

  /** 'click' | 'spawn' | 'error' — subtle, non-positional, unaffected by slow-mo. */
  ui(kind) {
    if (!this.ready) return;
    try {
      const [fam, gain] = UI[kind] || UI.click;
      if (!this._throttle(fam, nowMs())) return;
      const c = this.ctx, src = c.createBufferSource(), g = c.createGain();
      src.buffer = this._pick(fam);
      g.gain.value = gain;
      src.connect(g); g.connect(this._comp);
      src.onended = () => { src.disconnect(); g.disconnect(); };
      src.start(c.currentTime);
    } catch (e) { /* ignore */ }
  }

  /** Cut every voice and the reverb tail (scene reset). */
  stopAll() {
    if (!this.ctx || this._dead) return;
    try {
      for (const v of this._voices.slice()) this._kill(v, 0.01);
      this._voices.length = 0;
      this._thr = Object.create(null);
      const old = this._rev, t = this.ctx.currentTime;
      old.ret.gain.setTargetAtTime(0, t, 0.01);
      setTimeout(() => {
        try { this._send.disconnect(old.conv); old.conv.disconnect(); old.ret.disconnect(); } catch (e) { /* gone */ }
      }, 120);
      this._reverb();
    } catch (e) { /* ignore */ }
  }

  // ───────────── internals ─────────────

  _build() {
    const c = this.ctx;
    this._sr = Math.min(c.sampleRate, 48000); // synthesis rate (bounded cost on 96k+ devices)
    const master = (this._master = c.createGain());
    master.gain.value = this._vol;
    const comp = (this._comp = c.createDynamicsCompressor()); // gentle limiter
    comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 12;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    const pre = c.createGain(), clip = c.createWaveShaper(); // safety net for transient overshoot
    pre.gain.value = 0.5; clip.curve = softClipCurve();
    const slow = (this._slow = c.createBiquadFilter()); // darkens the whole mix in heavy slow-mo
    slow.type = 'lowpass'; slow.Q.value = -3; slow.frequency.value = this._slowCut();
    this._dry = c.createGain(); this._send = c.createGain();
    this._dry.connect(slow); slow.connect(comp); comp.connect(pre); pre.connect(clip); clip.connect(master);
    master.connect(c.destination);
    this._ir = makeImpulse(c, 1.0);
    this._reverb();
    // Chrome's HRTF panners are silent until its HRTF database has loaded: trigger that now and
    // pan with equal-power for the first moments.
    this._hrtfWarm = c.createPanner(); this._hrtfWarm.panningModel = 'HRTF';
    this._hrtfAt = nowMs() + 700;
  }

  _reverb() {
    const c = this.ctx, conv = c.createConvolver(), ret = c.createGain();
    conv.normalize = false; conv.buffer = this._ir; // impulse is already energy-normalized
    ret.gain.value = WET;
    this._send.connect(conv); conv.connect(ret); ret.connect(this._slow);
    this._rev = { conv, ret };
  }

  _slowCut() {
    const s = this._ts, top = Math.min(20000, this.ctx.sampleRate * 0.45);
    return s >= 0.5 ? top : Math.min(top, 20000 * Math.pow(s / 0.5, 0.75));
  }

  /** Render one variation of a family (seeded, so it is the same every run). */
  _render(fam, v) {
    const def = FAM[fam], t0 = nowMs();
    SR = this._sr; rnd = mulberry32(hash(fam) + v * 7919);
    const data = finish(def[1](v), def[2]);
    const ab = this.ctx.createBuffer(1, data.length, SR);
    ab.getChannelData(0).set(data);
    this._synthMs += nowMs() - t0;
    return ((this._bufs[fam] || (this._bufs[fam] = new Array(def[0]).fill(null)))[v] = ab);
  }

  /** Random variation (not the last one played); prefers ones already rendered to avoid hitches. */
  _pick(fam) {
    const def = FAM[fam];
    if (!def) return null;
    const n = def[0], arr = this._bufs[fam];
    let v = (Math.random() * n) | 0;
    if (v === this._lastVar[fam]) v = (v + 1) % n;
    if (arr && !arr[v]) for (let k = 1; k < n; k++) if (arr[(v + k) % n]) { v = (v + k) % n; break; }
    this._lastVar[fam] = v;
    return (arr && arr[v]) || this._render(fam, v);
  }

  /** Render everything in idle slices after unlock so first hits don't hitch mid-simulation. */
  _warm() {
    const names = Object.keys(FAM);
    let v = 0, f = 0;
    const next = () => { // variation 0 of every family first, then 1, ...
      for (; v < 5; v++, f = 0) for (; f < names.length; f++) {
        const fam = names[f];
        if (v < FAM[fam][0] && !(this._bufs[fam] && this._bufs[fam][v])) { this._render(fam, v); f++; return true; }
      }
      return false;
    };
    const idle = globalThis.requestIdleCallback;
    const step = (dl) => {
      if (!this.ctx || this._dead) return;
      try {
        let more = next();
        while (more && dl && dl.timeRemaining && dl.timeRemaining() > 6) more = next();
        if (more) idle ? idle(step, { timeout: 250 }) : setTimeout(step, 30);
      } catch (e) { /* stop warming */ }
    };
    idle ? idle(step, { timeout: 250 }) : setTimeout(step, 30);
  }

  /** Max 3 starts of one family per 25 ms. */
  _throttle(fam, ms) {
    const th = this._thr[fam] || (this._thr[fam] = [-1e9, -1e9, -1e9, 0]);
    if (ms - th[th[3]] < 25) return false;
    th[th[3]] = ms; th[3] = (th[3] + 1) % 3;
    return true;
  }

  _thud(pos, heavy) { // sub layer so heavy objects feel heavy
    if (!(heavy > 0.22)) return;
    this._play('thud', pos, 0.8 * Math.pow(clamp(heavy - 0.2, 0, 1), 0.6), 0.85 + Math.random() * 0.3, 3000);
  }

  /** Start one positional voice. Returns the voice, or null if culled/throttled/dropped. */
  _play(fam, pos, gain, rate, cutoff, o = NO) {
    const c = this.ctx, now = c.currentTime, ms = nowMs(), V = this._voices, L = this._lis;
    const P = finite3(pos) ? pos : L, x = P.x, y = P.y, z = P.z;
    const ref = o.ref || REF_DIST, d = Math.min(MAX_DIST, Math.hypot(x - L.x, y - L.y, z - L.z));
    const level = (gain * ref) / (ref + ROLLOFF * (Math.max(d, ref) - ref)); // what the panner will do
    if (!(level > MIN_LEVEL) || !(rate > 0)) return null;
    if (V.length >= MAX_VOICES && !this._canSteal(level, now)) return null;
    if (!this._throttle(fam, ms)) return null;
    const buffer = this._pick(fam);
    if (!buffer) return null;
    if (V.length >= MAX_VOICES) this._kill(this._victim, 0.01);

    const src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain(), pan = c.createPanner();
    src.buffer = buffer;
    src.playbackRate.value = rate * this._tsRate;
    lp.type = 'lowpass'; lp.Q.value = -3; lp.frequency.value = Math.min(cutoff, c.sampleRate * 0.45);
    g.gain.value = gain;
    pan.panningModel = V.length > HRTF_MAX || ms < this._hrtfAt ? 'equalpower' : 'HRTF';
    pan.distanceModel = 'inverse'; pan.refDistance = ref; pan.rolloffFactor = ROLLOFF; pan.maxDistance = MAX_DIST;
    if (pan.positionX) { pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z; }
    else pan.setPosition(x, y, z);
    src.connect(lp); lp.connect(g); g.connect(pan); pan.connect(this._dry); pan.connect(this._send);

    const when = now + (o.delay || 0);
    let dur = buffer.duration / (rate * this._tsRate);
    src.start(when);
    const cut = o.dur ? o.dur / this._tsRate : 0;
    if (cut && cut < dur) { // play an excerpt with a soft release
      dur = cut + 0.12;
      g.gain.setValueAtTime(gain, when + cut);
      g.gain.setTargetAtTime(0, when + cut, 0.03);
      src.stop(when + dur);
    }
    const v = { src, lp, g, pan, fam, level, rate, t0: when, dur, debris: !!o.debris, cur: 0, dead: false };
    src.onended = () => this._free(v);
    V.push(v);
    this._started++;
    if (V.length > this._peakVoices) this._peakVoices = V.length;
    return v;
  }

  /** Voice cap: is the new sound louder than the quietest one playing? If so pick the oldest quiet voice. */
  _canSteal(level, now) {
    let min = Infinity, pick = null;
    for (const v of this._voices) {
      const rem = clamp(1 - (now - v.t0) / v.dur, 0, 1);
      v.cur = v.level * rem * rem; // rough current loudness of a decaying sound
      if (v.cur < min) min = v.cur;
    }
    if (level <= min) return false;
    for (const v of this._voices) if (v.cur <= min * 1.5 + 1e-9 && (!pick || v.t0 < pick.t0)) pick = v;
    this._victim = pick;
    return true;
  }

  /** Fade a voice out quickly (no click) and release it. */
  _kill(v, fade) {
    const i = this._voices.indexOf(v), t = this.ctx.currentTime;
    if (i >= 0) this._voices.splice(i, 1);
    try {
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(v.g.gain.value, t);
      v.g.gain.linearRampToValueAtTime(0, t + fade);
      v.src.stop(t + fade + 0.004);
    } catch (e) { /* already stopped */ }
    setTimeout(() => this._free(v), fade * 1000 + 60); // in case 'ended' never fires (suspended context)
  }

  /** Disconnect a finished voice's nodes so nothing leaks. */
  _free(v) {
    if (v.dead) return;
    v.dead = true;
    const i = this._voices.indexOf(v);
    if (i >= 0) this._voices.splice(i, 1);
    try {
      v.src.onended = null;
      v.src.disconnect(); v.lp.disconnect(); v.g.disconnect(); v.pan.disconnect();
    } catch (e) { /* gone */ }
  }

  // ───────────── debug hooks (tests) ─────────────

  /** Force-render every variation of every family; returns { family: AudioBuffer[] }. */
  _debugBuffers() {
    if (!this.ctx || this._dead) return {};
    for (const fam of Object.keys(FAM)) {
      for (let v = 0; v < FAM[fam][0]; v++) if (!(this._bufs[fam] && this._bufs[fam][v])) this._render(fam, v);
    }
    return this._bufs;
  }

  _debugStats() {
    let debris = 0;
    for (const v of this._voices) if (v.debris) debris++;
    const { _peakVoices: peakVoices, _started: started, _synthMs: synthMs } = this;
    return { voices: this._voices.length, debris, peakVoices, started, synthMs, sampleRate: this._sr || 0 };
  }
}
