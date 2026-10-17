// Higher-level physical-ish building blocks for buffer recipes: impacts, creaks, latches,
// clinks, whooshes, scrapes, drops, rumbles and the PA / old-recording colourations.
// Each ADDS into a Float32Array `o` at time t (seconds). R = Rand. Amplitudes are relative;
// recipes are normalised to their target peak afterwards.
import { BQ, OnePole, Noise, Rand, ring, hit, burst, grains, stickSlip, tone, envAD, envHump, xlerp, TAU, clamp, saturate } from './dsp.js';

// Inharmonic mode-ratio sets.
export const RATIOS = {
  sheet: [1, 1.58, 2.31, 2.97, 3.82, 4.66, 5.83, 7.1],      // sheet steel (lockers, doors)
  bar: [1, 2.756, 5.404, 8.933],                            // free bar / tine / tube
  gong: [1, 2.32, 4.25, 6.63, 9.38, 12.6],                  // bell gong
  wood: [1, 2.13, 3.42, 5.16],                               // wooden panel
  medal: [1, 2.63, 4.91, 7.65, 11.2],                        // small stamped metal
};

/** Low impact (body / floor / door thud) with pitch drop + soft noise. */
export function thump(o, sr, t, { f = 90, to = 50, tau = 0.03, t60 = 0.25, amp = 1, noise = 0.5, lp = 900, R = new Rand() } = {}) {
  ring(o, sr, t, f, amp, t60, { glide: { to, tau }, phase: 0 });
  ring(o, sr, t, f * 2.1, amp * 0.25, t60 * 0.4, { glide: { to: to * 2.1, tau } });
  if (noise > 0) burst(o, sr, t, { dur: 0.08, t60: 0.05, gain: amp * noise, R, color: 'pink', filters: [['lp', lp, 0.7]] });
  return o;
}

/** Wooden knock: a few low-Q panel modes + a short contact click. */
export function knock(o, sr, t, { f = 220, amp = 1, t60 = 0.12, click = 0.4, R = new Rand(), ratios = RATIOS.wood } = {}) {
  ratios.forEach((r, i) => ring(o, sr, t, f * r * R.jit(1, 0.03), amp / (1 + i * 0.9), t60 / (1 + i * 0.6), { phase: R.r() * TAU }));
  burst(o, sr, t, { dur: 0.01, t60: 0.006, gain: amp * click, R, filters: [['bp', 2500, 0.8]] });
  return o;
}

/** Struck metal object with mode set `ratios` from base frequency. */
export function metal(o, sr, t, { f = 400, amp = 1, t60 = 0.6, ratios = RATIOS.sheet, tilt = 0.75, decayTilt = 0.7, click = 0.3, spread = 0.01, R = new Rand() } = {}) {
  const modes = ratios.map((r, i) => [f * r * (1 + R.bi() * spread), amp * Math.pow(tilt, i) * R.range(0.6, 1), t60 * Math.pow(decayTilt, i) * R.range(0.8, 1.2)]);
  hit(o, sr, t, modes, { R, click: amp * click, clickF: 3000 });
  return o;
}

/** Small high metal clink (keys, chain links, medals, coins). */
export function clink(o, sr, t, { f = 3200, amp = 1, t60 = 0.12, R = new Rand(), ratios = RATIOS.medal } = {}) {
  ratios.forEach((r, i) => ring(o, sr, t, f * r * R.jit(1, 0.02), amp * Math.pow(0.55, i) * R.range(0.5, 1), t60 * Math.pow(0.75, i), { phase: R.r() * TAU }));
  burst(o, sr, t, { dur: 0.004, t60: 0.002, gain: amp * 0.35, R, filters: [['hp', 4000, 0.7]] });
  return o;
}

/** Spring latch / bolt: a sharp double click with a bright metallic ring. */
export function latch(o, sr, t, { amp = 1, f = 2400, gap = 0.012, R = new Rand() } = {}) {
  metal(o, sr, t, { f, amp: amp * 0.7, t60: 0.05, ratios: RATIOS.bar, click: 0.8, R });
  metal(o, sr, t + gap * R.jit(1, 0.3), { f: f * 1.31, amp: amp * 0.45, t60: 0.04, ratios: RATIOS.bar, click: 0.6, R });
  thump(o, sr, t, { f: 320, to: 260, t60: 0.03, amp: amp * 0.3, noise: 0.2, lp: 2000, R });
  return o;
}

/** Hinge / floorboard / door creak (stick-slip). preset picks the resonant body. */
const CREAK_BODIES = {
  door: [[180, 6, 1], [420, 9, 0.8], [950, 12, 0.5], [1700, 14, 0.25]],
  floor: [[140, 5, 1], [330, 8, 0.7], [760, 10, 0.35]],
  chair: [[520, 6, 0.8], [1250, 9, 0.6], [2600, 12, 0.3]],
  metal: [[700, 25, 0.7], [1550, 30, 0.6], [3100, 30, 0.35], [4700, 30, 0.2]],
  timber: [[90, 4, 1], [210, 6, 0.8], [480, 8, 0.4]],
  rope: [[600, 10, 0.6], [1500, 14, 0.4], [320, 6, 0.5]],
};
export function creak(o, sr, t, { dur = 0.6, rate, amp, body = 'door', jitter = 0.18, tone: tn = 0.1, gain = 1, R = new Rand(), grit = 0.03, res } = {}) {
  return stickSlip(o, sr, t, {
    dur, rate: rate || ((u) => 40 + 50 * Math.sin(Math.PI * u)), amp: amp || ((u) => envHump(0.3, 1)(u)),
    res: res || CREAK_BODIES[body], jitter, tone: tn, gain, R, grit,
  });
}

/** Friction noise (cloth, flesh, paper, chalk): band-passed noise with grainy AM. */
export function scrape(o, sr, t, { dur = 0.5, f = 800, q = 1.2, f1 = null, amp = (u) => envHump(0.2, 1)(u), grain = 25, depth = 0.6, gain = 1, color = 'white', R = new Rand() } = {}) {
  const n0 = Math.round(t * sr), len = Math.min(o.length - n0, Math.ceil(dur * sr));
  const nz = new Noise(R, color), bq = new BQ(sr, 'bp', f, q), sm = new OnePole(sr, grain), lp2 = new OnePole(sr, grain * 0.3);
  for (let i = 0; i < len; i++) {
    const u = i / len;
    if (f1 && (i & 63) === 0) bq.set('bp', xlerp(f, f1, u), q);
    const mod = 1 - depth + depth * Math.abs(sm.run(R.bi() * 2.2) + lp2.run(R.bi()) * 0.5) * 1.6;
    o[n0 + i] += bq.run(nz.next()) * mod * amp(u) * gain;
  }
  return o;
}

/** Air movement: band-passed noise sweeping f0 → fm → f1 under a hump envelope. */
export function whoosh(o, sr, t, { dur = 0.4, f0 = 400, fm = 1800, f1 = 300, q = 1.4, peak = 0.45, amp = 1, color = 'pink', R = new Rand() } = {}) {
  return burst(o, sr, t, {
    dur, R, color, gain: amp, env: (tt) => envHump(peak * dur, dur)(tt),
    filters: [['bp', (u) => (u < peak ? xlerp(f0, fm, u / peak) : xlerp(fm, f1, (u - peak) / (1 - peak))), q]],
  });
}

/** Water drop into water: a bubble 'plink' (rising sine) + a tiny impact. */
export function drop(o, sr, t, { f = 1100, amp = 1, rise = 1.9, len = 0.06, R = new Rand() } = {}) {
  tone(o, sr, t, len * 1.5, { f: (tt) => f * Math.pow(rise, Math.min(1, tt / len)), a: (tt) => amp * Math.exp(-tt / (len * 0.45)) * Math.min(1, tt / 0.0015) });
  burst(o, sr, t, { dur: 0.008, t60: 0.005, gain: amp * 0.25, R, filters: [['bp', 3000, 1]] });
  return o;
}

/** Deep rumble: brown noise low-passed, env fn(u). */
export function rumble(o, sr, t, { dur = 3, lp = 120, env = (u) => envHump(0.2, 1)(u), amp = 1, R = new Rand(), color = 'brown', q = 0.8 } = {}) {
  return burst(o, sr, t, { dur, R, color, gain: amp, env: (tt) => env(tt / dur), filters: [['lp', lp, q], ['lp', lp * 1.3, 0.6]] });
}

/** Fine grit / dust / crackle texture. */
export function grit(o, sr, t, { dur = 1, rate = 300, amp = 1, f = [2500, 8000], R = new Rand(), env = null } = {}) {
  return grains(o, sr, t, { dur, R, rate: env ? (u) => rate * env(u) : rate, amp, f, t60: [0.002, 0.008], click: 0.5, gain: amp });
}

/** Paper handling: crinkle grains + a soft body swish. */
export function paper(o, sr, t, { dur = 0.5, amp = 1, density = 400, R = new Rand(), env = (u) => envHump(0.3, 1)(u) } = {}) {
  grains(o, sr, t, { dur, R, rate: (u) => 40 + density * env(u), amp: (u) => env(u), f: [1800, 7000], t60: [0.002, 0.01], click: 0.7, gain: amp * 0.7 });
  burst(o, sr, t, { dur, R, gain: amp * 0.35, env: (tt) => env(tt / dur), filters: [['bp', 2400, 0.6]] });
  return o;
}

/** Breathy noise through moving formants: formants fn(u) → [[f, q, g], ...]. */
export function breath(o, sr, t, { dur, amp, formants, R = new Rand(), color = 'white', lp = 5000 }) {
  const n0 = Math.round(t * sr), len = Math.min(o.length - n0, Math.ceil(dur * sr));
  const nz = new Noise(R, color);
  const fm0 = formants(0), bank = fm0.map(([f, q]) => new BQ(sr, 'bp', f, q));
  let gs = fm0.map((x) => x[2] ?? 1);
  const lpf = new BQ(sr, 'lp', lp, 0.7);
  for (let i = 0; i < len; i++) {
    const u = i / len;
    if ((i & 63) === 0) { const fm = formants(u); for (let k = 0; k < bank.length; k++) bank[k].set('bp', fm[k][0], fm[k][1]); gs = fm.map((x) => x[2] ?? 1); }
    const x = nz.next();
    let y = 0; for (let k = 0; k < bank.length; k++) y += bank[k].run(x) * gs[k];
    o[n0 + i] += lpf.run(y) * amp(u);
  }
  return o;
}

/** 60 Hz mains hum with harmonics (PA amps, ballasts). */
export function hum(o, sr, t, dur, { amp = 1, f = 60, h = [1, 0.5, 0.35, 0.2, 0.12], env = () => 1 } = {}) {
  h.forEach((a, i) => tone(o, sr, t, dur, { f: f * (i + 1), a: (tt) => amp * a * env(tt) }));
  return o;
}

/** Fluorescent ballast buzz (full-wave rectified 60 Hz → 120 Hz rich buzz). */
export function ballast(o, sr, t, dur, { amp = 1, gate = () => 1, bright = 0.5, R = new Rand() } = {}) {
  const n0 = Math.round(t * sr), len = Math.min(o.length - n0, Math.ceil(dur * sr));
  const bp = new BQ(sr, 'bp', 2400, 1.2), lp = new OnePole(sr, 5000);
  for (let i = 0; i < len; i++) {
    const tt = i / sr;
    const s = Math.abs(Math.sin(TAU * 60 * tt));
    const b = Math.pow(s, 6) - 0.27; // peaky pulses at 120 Hz
    const x = b + R.bi() * 0.04;
    o[n0 + i] += (lp.run(x) * (1 - bright) + bp.run(x) * bright * 3) * amp * gate(tt);
  }
  return o;
}

/** Colour a buffer as heard through a 1970s PA speaker (band-limited, honky, a bit driven). */
export function paColour(a, sr, { lo = 320, hi = 3600, drive = 1.6 } = {}) {
  const f = [new BQ(sr, 'hp', lo, 0.8), new BQ(sr, 'hp', lo * 0.8, 0.6), new BQ(sr, 'peak', 1600, 1.2, 5), new BQ(sr, 'lp', hi, 0.9), new BQ(sr, 'lp', hi * 1.15, 0.6)];
  for (let i = 0; i < a.length; i++) { let v = a[i]; for (const x of f) v = x.run(v); a[i] = v; }
  return saturate(a, drive);
}

/** Colour as an old acoustic recording (78 rpm / 1930s): narrow band + slight drive. */
export function oldRecording(a, sr, { lo = 280, hi = 3200 } = {}) {
  const f = [new BQ(sr, 'hp', lo, 0.7), new BQ(sr, 'peak', 1200, 1, 4), new BQ(sr, 'lp', hi, 0.8), new BQ(sr, 'lp', hi * 1.2, 0.6)];
  for (let i = 0; i < a.length; i++) { let v = a[i]; for (const x of f) v = x.run(v); a[i] = v; }
  return saturate(a, 1.3);
}

/** Record surface noise: pops, crackle, hiss and a 78 rpm rotation thump. */
export function surfaceNoise(o, sr, t, dur, { amp = 1, pops = 3, crackle = 220, hiss = 0.15, R = new Rand() } = {}) {
  grains(o, sr, t, { dur, R, rate: crackle, amp: 0.25, f: [1500, 6000], t60: [0.0008, 0.003], click: 1, gain: amp });
  grains(o, sr, t, { dur, R, rate: pops, amp: 1, f: [600, 2500], t60: [0.002, 0.006], click: 1.2, gain: amp, skew: 0.6 });
  burst(o, sr, t, { dur, R, gain: amp * hiss, env: () => 1, filters: [['bp', 3500, 0.5]] });
  const n0 = Math.round(t * sr), len = Math.min(o.length - n0, Math.ceil(dur * sr)), lp = new OnePole(sr, 60);
  for (let i = 0; i < len; i++) {
    const ph = (i / sr) * 1.3 % 1; // 78 rpm
    const thumpE = ph < 0.03 ? Math.sin(Math.PI * ph / 0.03) : 0;
    o[n0 + i] += lp.run(R.bi()) * amp * 0.6 * (0.3 + thumpE);
  }
  return o;
}

/** Rain drops texture (one channel): drops of resonant ticks at `rate`/s. */
export function rainDrops(o, sr, t, dur, { rate = 400, f = [1200, 5000], t60 = [0.004, 0.02], amp = 1, R = new Rand(), env = null } = {}) {
  return grains(o, sr, t, { dur, R, rate: env ? (u) => rate * env(u) : rate, amp: env || 1, f, t60, click: 0.25, gain: amp, skew: 2 });
}

/** Utility: a fresh Rand for a recipe from S. */
export const rnd = (S) => S.R || new Rand();
export { clamp, xlerp, envAD, envHump };
