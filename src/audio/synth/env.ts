// Procedural environment sounds (pure): electrical (bulb pop, sparks, buzz, breaker clunk),
// water (spray loop, drips), appliances (fridge hum, fan motor, wind-down), ambience beds
// (city traffic, wind through broken windows, distant horns), smoke-alarm chirp and the
// very distant crash of something thrown off the balcony.
//
// Loops are seamless: periodic parts use frequencies that are integer multiples of 1/L; noise
// parts are rendered L+X long and equal-power crossfaded (makeLoop).

import {
  Biquad,
  TAU,
  addMode,
  addNoiseBurst,
  addThump,
  buf,
  clamp,
  fadeOut,
  makeLoop,
  peakOf,
  poisson,
} from "./dsp.ts";
import { addTink } from "./modal.ts";
import type { G } from "./breaks.ts";

/** Mains frequency (Hz) used for hums and buzzes. */
export const MAINS_HZ = 50;

// ======================================================================= electrical

/** Light bulb breaking: implosion "pop", crisp crack, a few thin-glass tinkles. */
export function bulbPop(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, rng.range(0.35, 0.5));
  addNoiseBurst(out, 0, sr, noise, 1, { attack: 0.0004, decay: 0.012, bp: rng.range(450, 900), q: 1.5 });
  addThump(out, 0, sr, rng.range(180, 320), 0.5, 0.012, 0.5, 0.004, 0.0005);
  addNoiseBurst(out, 0.0005 * sr, sr, noise, 0.6, { attack: 0.0001, decay: 0.0015, hp: 2000 });
  for (let i = 0; i < rng.int(4, 10); i++) addTink(out, rng.range(0.02, 0.25) * sr, sr, noise.logRange(5000, 10500), rng.range(0.02, 0.08), 6);
  fadeOut(out, sr, 0.03);
  return out;
}

/**
 * Electrical arcing: irregular sharp snaps (power-law amplitudes, each a sub-millisecond noise
 * burst), a sizzle and a brief buzz at 2·f_mains, all following 2–5 arc bursts.
 */
export function sparkCrackle(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(0.45, 1.1);
  const out = buf(sr, dur);
  const env = new Float32Array(out.length);
  const nb = rng.int(2, 5);
  for (let b = 0; b < nb; b++) {
    const t0 = b === 0 ? 0 : rng.range(0.05, dur - 0.2);
    const len = rng.range(0.03, 0.14);
    const s0 = Math.floor(t0 * sr);
    const n = Math.floor(len * sr);
    for (let k = 0; k < n && s0 + k < env.length; k++) env[s0 + k] = Math.max(env[s0 + k], Math.sin((Math.PI * k) / n) ** 0.5);
    // Snaps: Poisson in time, amplitude ~ u^3 (few loud, many faint).
    poisson(noise, len, 400, () => rng.range(90, 320), (t) => {
      const a = 0.08 + 0.92 * rng.next() ** 3;
      addNoiseBurst(out, (t0 + t) * sr, sr, noise, a, { attack: 0.00005, decay: rng.range(0.00015, 0.0007), hp: 900, lp: 12000 });
    });
    // First snap of each burst is the loudest (arc strike).
    addNoiseBurst(out, s0, sr, noise, 1, { attack: 0.00005, decay: 0.0008, hp: 700, lp: 12000 });
  }
  // Sizzle and buzz follow the arc envelope (computed only while the arc is active).
  const sz = new Biquad().bandpass(sr, rng.range(5000, 7000), 0.8);
  const bz = new Biquad().lowpass(sr, 2200);
  const dp = (MAINS_HZ * 2) / sr;
  let p = 0;
  for (let i = 0; i < out.length; i++) {
    p += dp;
    if (p >= 1) p -= 1;
    const e = env[i];
    // Rectified-mains buzz: rich harmonics of 2·f_mains (sawtooth-like), low-passed.
    const buzz = bz.process(e > 0 ? (2 * p - 1) * e : 0);
    out[i] += buzz * 0.3 + (e > 0 ? sz.process(noise.white()) * e * 0.05 : 0);
  }
  new Biquad().lowpass(sr, 14000).run(out);
  fadeOut(out, sr, 0.02);
  return out;
}

/** Seamless 2 s buzz loop of a damaged circuit / transformer (harmonics of 2·f_mains). */
export function elecBuzz(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const f = MAINS_HZ * 2;
  // One period of the waveform (every partial is a multiple of f), then tiled: exact and cheap.
  const per = Math.round(sr / f);
  const n = per * Math.round((2.0 * sr) / per); // whole number of periods ≈ 2 s
  const L = n / sr;
  const cyc = new Float32Array(per);
  for (let k = 1; k <= 24; k++) {
    if (f * k > sr * 0.45) break;
    const a = (1 / k) * (k % 2 ? 1 : rng.range(0.4, 0.9)) * rng.range(0.7, 1.2);
    const ph = rng.range(0, TAU);
    for (let i = 0; i < per; i++) cyc[i] += a * Math.sin((TAU * k * i) / per + ph);
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = cyc[i % per];
  // Flutter at multiples of 1/L keeps the loop periodic (evaluated per 64-sample block).
  applyBlockEnv(out, 64, (i) => {
    const t = i / sr;
    return 0.3 * (1 + 0.15 * Math.sin((TAU * 7 * t) / L) + 0.08 * Math.sin((TAU * 13 * t) / L + 1));
  });
  // Occasional crackles (wrapped around the loop end).
  for (let c = 0; c < rng.int(3, 7); c++) {
    const s0 = Math.floor(rng.next() * n);
    const w = Math.floor(rng.range(0.0002, 0.0008) * sr);
    const a = rng.range(0.2, 0.6);
    for (let k = 0; k < w; k++) out[(s0 + k) % n] += a * noise.white() * (1 - k / w);
  }
  return out;
}

/** Multiply by an envelope evaluated every `block` samples and linearly interpolated. */
function applyBlockEnv(b: Float32Array, block: number, env: (i: number) => number): void {
  let e0 = env(0);
  for (let s0 = 0; s0 < b.length; s0 += block) {
    const e1 = env(Math.min(s0 + block, b.length));
    const n = Math.min(block, b.length - s0);
    const de = (e1 - e0) / block;
    for (let k = 0; k < n; k++) b[s0 + k] *= e0 + de * k;
    e0 = e1;
  }
}

/** Circuit breaker tripping / power cut: mechanical snap, contactor thunk, hum dying. */
export function elecClunk(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.6);
  addNoiseBurst(out, 0, sr, noise, 0.9, { attack: 0.0001, decay: 0.0012, hp: 1500 });
  addMode(out, 0, sr, rng.range(2500, 4500), 0.5, 300, 0);
  addMode(out, 0, sr, rng.range(450, 800), 0.6, 90, 0);
  addThump(out, 0.003 * sr, sr, rng.range(80, 120), 0.8, 0.03, 0.3, 0.006);
  let ph = 0;
  const hl = Math.floor(0.35 * sr);
  for (let i = 0; i < hl && i < out.length; i++) {
    const t = i / sr;
    ph += (TAU * MAINS_HZ * 2 * (1 - 0.3 * t)) / sr;
    out[i] += 0.12 * Math.exp(-t / 0.08) * (Math.sin(ph) + 0.4 * Math.sin(2 * ph));
  }
  fadeOut(out, sr, 0.04);
  return out;
}

// ======================================================================= water

/**
 * Minnaert bubble: a sine chirping upward as the bubble settles, decaying fast. Rendered with
 * a recursive oscillator whose frequency is updated every 16 samples.
 */
function bubble(out: Float32Array, t: number, sr: number, f0: number, amp: number, decay: number): void {
  const s = Math.floor(t * sr);
  const n = Math.min(Math.ceil(decay * 4.5 * sr), out.length - s);
  if (n < 4 || s < 0) return;
  const r = Math.exp(-1 / (decay * sr));
  const r2 = r * r;
  const w0 = (TAU * f0) / sr;
  const dw = (w0 * 0.6) / (decay * 3 * sr); // linear upward chirp (per sample)
  let y2 = 0;
  let y1 = amp * r * Math.sin(w0);
  let c = 2 * r * Math.cos(w0);
  out[s + 1] += y1;
  for (let k = 2; k < n; k++) {
    if ((k & 15) === 0) c = 2 * r * Math.cos(w0 + dw * k);
    const y = c * y1 - r2 * y2;
    out[s + k] += y;
    y2 = y1;
    y1 = y;
  }
}

/** Seamless spray loop of a broken pressurised pipe / faucet: hiss, splashes, bubbles, gurgle. */
export function waterSpray(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const L = 4.0;
  const X = 0.35;
  const out = buf(sr, L + X);
  const hp = new Biquad().highpass(sr, 1500);
  const bp = new Biquad().bandpass(sr, Math.min(rng.range(4500, 6500), sr * 0.4), 0.6);
  const lp = new Biquad().lowpass(sr, 320);
  const lfo0 = rng.range(0, TAU);
  const lfo1 = rng.range(0, TAU);
  let turb = 1;
  let gurg = 1;
  for (let i = 0; i < out.length; i++) {
    if ((i & 63) === 0) {
      const t = i / sr;
      turb = 1 + 0.22 * Math.sin((TAU * 9 * t) / L + lfo0) + 0.12 * Math.sin((TAU * 23 * t) / L + lfo1);
      gurg = 0.5 * (0.7 + 0.3 * Math.sin((TAU * 5 * t) / L));
    }
    const w = noise.white();
    out[i] = (hp.process(w) * 0.35 + bp.process(w) * 0.5) * turb + lp.process(noise.white()) * gurg;
  }
  poisson(noise, L + X - 0.05, 260, () => 180, (t) => bubble(out, t, sr, noise.logRange(600, 4000), rng.range(0.02, 0.12), rng.range(0.004, 0.012)));
  return makeLoop(out, Math.round(X * sr));
}

/** A single drip into a puddle: impact tick + upward-chirping bubble. */
export function waterDrip(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const out = buf(sr, 0.2);
  addNoiseBurst(out, 0, sr, noise, 0.3, { attack: 0.0001, decay: 0.0012, hp: 2000 });
  bubble(out, rng.range(0.001, 0.004), sr, rng.range(900, 2400), 0.9, rng.range(0.012, 0.025));
  fadeOut(out, sr, 0.02);
  return out;
}

// ======================================================================= appliances

/** Seamless fridge compressor hum: mains-locked harmonics + fan noise. */
export function fridgeHum(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const X = 0.4;
  const per0 = Math.round(sr / MAINS_HZ);
  const n = per0 * Math.round((4.0 * sr) / per0); // whole number of mains periods ≈ 4 s
  const L = n / sr;
  // Magnetostriction hum is strongest at 2·f_mains; motor adds f_mains and harmonics.
  const parts: Array<[number, number]> = [
    [1, 0.35],
    [2, 1],
    [3, 0.3],
    [4, 0.35],
    [6, 0.15],
    [8, 0.08],
    [10, 0.05],
  ];
  const per = per0;
  const cyc = new Float32Array(per);
  for (const [k, a] of parts) {
    const ph = rng.range(0, TAU);
    for (let i = 0; i < per; i++) cyc[i] += a * Math.sin((TAU * k * i) / per + ph);
  }
  const tone = new Float32Array(n);
  for (let i = 0; i < n; i++) tone[i] = cyc[i % per];
  applyBlockEnv(tone, 128, (i) => 0.35 * (1 + 0.05 * Math.sin((TAU * i) / sr / L)));
  const xs = Math.round(X * sr);
  const fan = new Float32Array(n + xs);
  const lp = new Biquad().lowpass(sr, 650);
  const bp = new Biquad().bandpass(sr, rng.range(180, 260), 2);
  for (let i = 0; i < fan.length; i++) {
    const w = noise.white();
    fan[i] = lp.process(w) * 0.25 + bp.process(w) * 0.2;
  }
  const loop = makeLoop(fan, xs);
  for (let i = 0; i < n; i++) tone[i] += loop[i];
  return tone;
}

/** Seamless ceiling-fan motor loop: low hum + blade-pass air swish (4 blades). */
export function motorHum(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const L = 3.0;
  const X = 0.3;
  const out = buf(sr, L + X);
  const bp = new Biquad().bandpass(sr, rng.range(500, 900), 0.7);
  const bladeHz = 12; // 4 blades × 3 rev/s, 36 cycles in L (periodic)
  let p1 = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    p1 += (TAU * MAINS_HZ * 2) / sr;
    const sw = 0.5 + 0.5 * Math.sin(TAU * bladeHz * t);
    out[i] = bp.process(noise.white()) * (0.25 + 0.6 * sw * sw) + 0.12 * Math.sin(p1) + 0.05 * Math.sin(2 * p1);
  }
  return makeLoop(out, Math.round(X * sr));
}

/** Motor/fan winding down after losing power: falling pitch + clunks. */
export function motorStop(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(1.4, 2.0);
  const out = buf(sr, dur);
  const f0 = rng.range(110, 150);
  const kd = Math.exp(-1 / (dur * 0.4 * sr));
  let ph = 0;
  let w = 0;
  let e = 1;
  for (let i = 0; i < out.length; i++) {
    if ((i & 31) === 0) w = (TAU * (18 + (f0 - 18) * Math.exp(-i / sr / (dur * 0.35)))) / sr;
    ph += w;
    const s1 = Math.sin(ph);
    const c1 = Math.cos(ph);
    // sin 2x = 2 s c, sin 3x = s (3 - 4 s^2)
    out[i] = e * (s1 * 0.5 + 2 * s1 * c1 * 0.25 + s1 * (3 - 4 * s1 * s1) * 0.1);
    e *= kd;
  }
  for (let i = 0; i < rng.int(2, 4); i++) addThump(out, rng.range(0.2, dur - 0.3) * sr, sr, rng.range(150, 300), 0.15, 0.01, 0.2, 0.004);
  addNoiseBurst(out, 0, sr, noise, 0.15, { attack: 0.05, decay: dur * 0.3, bp: 700, q: 0.7 });
  fadeOut(out, sr, 0.1);
  return out;
}

// ======================================================================= ambience

/** Render a band-limited noise "swell" (passing car) into a stereo pair centred at time tc. */
function swell(L: Float32Array, R: Float32Array, sr: number, g: G, tc: number, len: number, amp: number, pan: number, f: number): void {
  const { noise } = g;
  const s0 = Math.floor((tc - len / 2) * sr);
  const n = Math.floor(len * sr);
  const a = Math.max(0, -s0);
  const b = Math.min(n, L.length - s0);
  if (b <= a) return;
  const bp = new Biquad().bandpass(sr, f, 0.6);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  let e = 0;
  for (let k = a; k < b; k++) {
    if (((k - a) & 63) === 0) {
      const u = k / n;
      e = Math.exp(-(((u - 0.5) / 0.2) ** 2)) * amp;
    }
    const y = bp.process(noise.white()) * e;
    const i = s0 + k;
    L[i] += y * gl;
    R[i] += y * gr;
  }
}

/**
 * Seamless stereo city ambience heard from a 31st-floor apartment: distant traffic rumble,
 * passing-car swells. 12 s loop.
 */
export function cityAmbience(g: G): Float32Array[] {
  const { sr, rng, noise } = g;
  const Ls = 12;
  const X = 0.5;
  const n = Math.ceil((Ls + X) * sr);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const lpC = new Biquad().lowpass(sr, 200);
  const hpC = new Biquad().highpass(sr, 60);
  const a1 = Math.exp((-TAU * 520) / sr);
  let yl = 0;
  let yr = 0;
  for (let i = 0; i < n; i++) {
    const c = hpC.process(lpC.process(noise.brownian())) * 1.4;
    // Per-channel pink noise through a one-pole low-pass (independent → stereo width).
    const pl = noise.pink();
    const pr = noise.pink();
    yl = pl + a1 * (yl - pl);
    yr = pr + a1 * (yr - pr);
    L[i] = c + yl * 1.3;
    R[i] = c * 0.9 + yr * 1.3;
  }
  const cars = rng.int(7, 11);
  for (let c = 0; c < cars; c++) {
    const tc = rng.range(0, Ls);
    const len = rng.range(2.5, 6);
    const amp = rng.range(0.15, 0.45);
    const pan = rng.range(-0.8, 0.8);
    const f = rng.range(250, 900);
    // Render three copies so the swell wraps across the loop boundary correctly.
    for (const off of [-Ls, 0, Ls]) swell(L, R, sr, g, tc + off, len, amp, pan, f);
  }
  return [makeLoop(L, Math.round(X * sr)), makeLoop(R, Math.round(X * sr))];
}

/** Distant car horn (heard over the city): two-tone pulse waves, low-passed, with a slapback. */
export function horn(g: G): Float32Array {
  const { sr, rng } = g;
  const pattern = rng.int(0, 2); // 0 short beep, 1 double beep, 2 long honk
  const segs: Array<[number, number]> = pattern === 0 ? [[0, 0.18]] : pattern === 1 ? [[0, 0.12], [0.2, 0.32]] : [[0, rng.range(0.5, 0.8)]];
  const dur = segs[segs.length - 1][1] + 0.6;
  const out = buf(sr, dur);
  const fA = rng.range(380, 450);
  const fB = fA * rng.range(1.2, 1.27);
  // Wavetable of the brassy pulse-ish wave (odd harmonics).
  const TN = 1024;
  const tab = new Float32Array(TN + 1);
  for (let i = 0; i <= TN; i++) {
    const x = (TAU * i) / TN;
    tab[i] = Math.sin(x) + 0.4 * Math.sin(3 * x) + 0.2 * Math.sin(5 * x);
  }
  const look = (p: number): number => {
    const x = p * TN;
    const i = x | 0;
    return tab[i] + (tab[i + 1] - tab[i]) * (x - i);
  };
  let pa = 0;
  let pb = 0;
  const da = fA / sr;
  const db = fB / sr;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    let e = 0;
    for (let k = 0; k < segs.length; k++) {
      const a = segs[k][0];
      const b = segs[k][1];
      if (t >= a && t < b + 0.04) e = Math.max(e, Math.min(1, (t - a) / 0.015) * Math.min(1, (b + 0.04 - t) / 0.04));
    }
    pa += da;
    pb += db;
    if (pa >= 1) pa -= 1;
    if (pb >= 1) pb -= 1;
    out[i] = e > 0 ? (look(pa) + look(pb)) * e * 0.25 : 0;
  }
  const lp = new Biquad().lowpass(sr, 1600);
  lp.run(out);
  const echo = out.slice();
  const d1 = Math.floor(rng.range(0.12, 0.3) * sr);
  for (let i = d1; i < out.length; i++) out[i] += echo[i - d1] * 0.35;
  fadeOut(out, sr, 0.1);
  return out;
}

/**
 * Seamless stereo wind loop (10 s): gusty band-limited noise plus a narrow whistle that
 * appears in strong gusts (air rushing through broken window frames) and low buffeting.
 */
export function windLoop(g: G): Float32Array[] {
  const { sr, rng, noise } = g;
  const Ls = 10;
  const X = 0.5;
  const n = Math.ceil((Ls + X) * sr);
  const chans: Float32Array[] = [];
  const gph = [rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU)];
  for (let c = 0; c < 2; c++) {
    const out = new Float32Array(n);
    const bp = new Biquad();
    const wh = new Biquad();
    const a1 = Math.exp((-TAU * 120) / sr);
    let lb = 0;
    const wf = rng.range(650, 1100) * (c ? 1.07 : 1);
    let gust = 0.5;
    let g3 = 0.125;
    for (let i = 0; i < n; i++) {
      if ((i & 63) === 0) {
        const t = i / sr;
        // Gust envelope: LFOs at multiples of 1/L so the loop's dynamics are periodic.
        gust = clamp(0.55 + 0.25 * Math.sin((TAU * 1 * t) / Ls + gph[0]) + 0.15 * Math.sin((TAU * 3 * t) / Ls + gph[1] + c * 0.4) + 0.08 * Math.sin((TAU * 7 * t) / Ls + gph[2]), 0.05, 1);
        g3 = gust * gust * gust;
        bp.bandpass(sr, 250 + 700 * gust, 0.7);
        wh.bandpass(sr, wf * (0.9 + 0.2 * gust), 18);
      }
      const w = noise.white();
      const br = noise.brownian();
      lb = br + a1 * (lb - br);
      out[i] = bp.process(w) * gust * 0.8 + wh.process(w) * g3 * 1.2 + lb * gust * 0.5;
    }
    new Biquad().highpass(sr, 70).run(out); // no subsonic rumble
    chans.push(makeLoop(out, Math.round(X * sr)));
  }
  return chans;
}

/** Smoke detector chirp (piezo ~3.2 kHz). */
export function alarmChirp(g: G): Float32Array {
  const { sr, rng } = g;
  const out = buf(sr, 0.15);
  const f = rng.range(3100, 3300);
  const n = Math.floor(0.07 * sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const e = Math.min(1, t / 0.003) * Math.min(1, (0.07 - t) / 0.005);
    out[i] = e * (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t) + 0.1 * Math.sin(TAU * 3 * f * t)) * 0.6;
  }
  return out;
}

/**
 * Something hitting the street ~90 m below: a dull boom and clatter, heavily low-passed by
 * distance, with slapback echoes from the buildings across the street and a diffuse tail.
 */
export function fallDistant(g: G): Float32Array {
  const { sr, rng, noise } = g;
  const dur = rng.range(2.2, 2.8);
  const src = buf(sr, 0.6);
  addThump(src, 0, sr, rng.range(45, 70), 1, 0.12, 0.4, 0.02);
  addNoiseBurst(src, 0, sr, noise, 0.8, { attack: 0.002, decay: 0.08, lp: 1100, hp: 80, grit: 0.7 });
  for (let i = 0; i < rng.int(3, 7); i++) addNoiseBurst(src, rng.range(0.05, 0.4) * sr, sr, noise, rng.range(0.1, 0.35), { attack: 0.001, decay: 0.02, bp: rng.range(500, 1200), q: 0.8, grit: 0.8 });
  const out = buf(sr, dur);
  const echoes: Array<[number, number, number]> = [
    [0, 1, 1400],
    [rng.range(0.14, 0.22), 0.45, 1000],
    [rng.range(0.3, 0.42), 0.28, 800],
    [rng.range(0.55, 0.7), 0.16, 600],
  ];
  for (const [d, a, f] of echoes) {
    const lp = new Biquad().lowpass(sr, f);
    const s0 = Math.floor(d * sr);
    for (let i = 0; i < src.length && s0 + i < out.length; i++) out[s0 + i] += lp.process(src[i]) * a;
  }
  // Diffuse street reverb tail.
  const lp = new Biquad().lowpass(sr, 700);
  const pk = Math.max(peakOf(out), 1e-3);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    out[i] += lp.process(noise.white()) * pk * 0.18 * Math.min(1, t / 0.05) * Math.exp(-t / 0.6);
  }
  fadeOut(out, sr, 0.2);
  return out;
}
