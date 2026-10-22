// Acoustic building blocks shared by the weapon, explosion and effect recipes.
import {
  addEchoes,
  addModes,
  addTone,
  biquad,
  burst,
  decimate2,
  echoTaps,
  fadeOut,
  glide,
  hp1,
  lp1,
  lpSweep,
  mixNorm,
  peak,
  samples,
  scale,
  scratch,
  smoothRandom,
  svf,
  TAU,
  white,
} from '../dsp.js';

const INV_2_31 = 4.656612873077393e-10;

// Turbulent gas burst: band-limited noise with a fast attack and exponential decay.
export function addGas(out, at, amp, o, rng, sr) {
  const x = burst(sr, rng.seed(), o.attack ?? 0.0003, o.tau, o.length ?? o.tau * 6, 0);
  if (o.f) biquad(x, 'bp', o.f, o.q ?? 0.8, sr);
  if (o.lp) lp1(x, o.lp, sr);
  if (o.hp) hp1(hp1(x, o.hp, sr), o.hp, sr);
  mixNorm(out, x, at, amp, sr);
}

// Dense cluster of near reflections (ground, trees, vehicles) right after an impulse.
// `roll` sets how lumpy it is: low values give distinct swells, high values a smooth decay.
export function addScatterTail(out, at, amp, tau, lp, rng, sr, roll = 30) {
  const i0 = Math.round(at * sr);
  const n = Math.min(out.length - i0, samples(sr, tau * 5));
  if (n <= 16) return;
  const x = white(n, rng.seed(), 1, scratch(1, n));
  const mod = smoothRandom(n, Math.max(3, Math.round((n / sr) * roll)), rng, false, scratch(2, n));
  const att = Math.min(n, samples(sr, 0.006));
  for (let i = 0; i < att; i++) {
    const m = 0.5 + 0.5 * mod[i];
    x[i] *= (i / att) * m * m;
  }
  const d = Math.exp(-1 / (tau * sr));
  let e = 1;
  for (let i = att; i < n; i++) {
    const m = 0.5 + 0.5 * mod[i];
    x[i] *= e * m * m;
    e *= d;
  }
  lp1(x, lp, sr);
  lp1(x, lp * 1.6, sr);
  hp1(x, 110, sr);
  mixNorm(out, x, at, amp, sr);
}

// Fused noise source: white blended with its own leaky integral ("brown"),
// shaped by an attack/decay envelope and a smooth random modulation.
function shapedNoise(n, seed, sr, o, into) {
  const x = into;
  const a = Math.exp((-TAU * (o.corner ?? 25)) / sr);
  const gB = 0.3 * Math.sqrt(3 * (1 - a * a)) * INV_2_31 * (o.brownMix ?? 1);
  const gW = INV_2_31 * (1 - (o.brownMix ?? 1));
  const mod = o.mod;
  const depth = o.depth ?? 0;
  const att = Math.max(1, Math.round((o.attack ?? 0.002) * sr));
  const d = Math.exp(-1 / (o.tau * sr));
  const swell = o.swell ?? 0;
  const sd = Math.exp(-1 / ((o.swellTau ?? 0.15) * sr));
  const square = o.squareAttack ?? false;
  let s = (seed | 0) ^ 0x3c6ef372;
  let y = 0;
  let e = 1;
  let sw = 1;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    y = a * y + s;
    let env;
    if (i < att) {
      const u = i / att;
      env = square ? u * u : u;
    } else {
      env = e * (1 + swell * (1 - sw));
      e *= d;
      sw *= sd;
    }
    const m = mod ? (o.rectify ? Math.max(0, (1 - depth) + depth * mod[i]) : 1 - depth + depth * mod[i]) : 1;
    x[i] = (s * gW + y * gB) * env * m;
  }
  return x;
}

// Low rolling rumble: echoes off terrain merging into a lumpy growl.
export function addRollingRumble(out, at, amp, tau, rng, sr, o = {}) {
  const i0 = Math.round(at * sr);
  const n = Math.min(out.length - i0, samples(sr, tau * 4 + (o.attack ?? 0.08)));
  if (n <= 16) return;
  const mod = smoothRandom(n, Math.max(4, Math.round((n / sr) * (o.rate ?? 4))), rng, false, scratch(2, n));
  const x = shapedNoise(n, rng.seed(), sr, {
    brownMix: 1, attack: o.attack ?? 0.08, squareAttack: true, tau, mod, depth: 0.65, rectify: true,
  }, scratch(1, n));
  const lp = o.lp ?? 240;
  lp1(x, lp, sr);
  lp1(x, lp, sr);
  mixNorm(out, x, at, amp, sr);
}

// Explosion / fireball body: noise through a moving lowpass with turbulent "boil".
export function addRoar(out, at, amp, o, rng, sr) {
  const n = Math.min(out.length - Math.round(at * sr), samples(sr, o.length ?? o.tau * 5));
  if (n <= 16) return;
  const boil = smoothRandom(n, Math.max(4, Math.round((n / sr) * (o.boil ?? 30))), rng, false, scratch(2, n));
  const x = shapedNoise(n, rng.seed(), sr, {
    brownMix: o.brownMix ?? 0.7, corner: 30, attack: o.attack ?? 0.002, tau: o.tau, mod: boil,
    depth: o.boilDepth ?? 0.35, swell: o.swell, swellTau: o.swellTau,
  }, scratch(1, n));
  const fc = glide(o.lp0, o.lp1, o.lpTau);
  if ((o.q ?? 0.75) > 0.8) svf(x, 'lp', fc, o.q, sr);
  else lpSweep(x, fc, sr);
  if (o.hp) hp1(x, o.hp, sr);
  mixNorm(out, x, at, amp, sr);
}

// Sparse sharp crackles (fireball, burning propellant); density decays over `dur`.
export function addCrackle(out, at, dur, rate, amp, rng, sr, o = {}) {
  const n = Math.min(out.length - Math.round(at * sr), samples(sr, dur + 0.02));
  if (n <= 16) return;
  const x = scratch(1, n, true);
  const fall = o.fall ?? 1.2;
  let t = 0;
  for (;;) {
    t += rng.exp(rate);
    if (t >= dur) break;
    const u = t / dur;
    if (fall > 0 && !rng.chance(Math.pow(1 - u, fall))) continue;
    const i0 = Math.round(t * sr);
    const len = Math.max(2, Math.round(sr * rng.range(0.0002, o.maxLen ?? 0.0025)));
    const a = (0.2 + 0.8 * rng.pow(2)) * (rng.chance(0.5) ? 1 : -1);
    let s = rng.seed() | 0;
    for (let i = 0; i < len && i0 + i < n; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) | 0;
      const env = 1 - i / len;
      x[i0 + i] += a * env * env * (0.6 + 0.4 * s * INV_2_31);
    }
  }
  hp1(hp1(x, o.hp ?? 1200, sr), o.hp ?? 1200, sr);
  if (o.lp) lp1(x, o.lp, sr);
  mixNorm(out, x, at, amp, sr);
}

const DEBRIS_MIX = {
  dirt: [['soil', 0.55], ['stone', 0.25], ['clod', 0.2]],
  metal: [['ping', 0.4], ['clank', 0.35], ['soil', 0.25]],
  masonry: [['chunk', 0.3], ['brick', 0.4], ['soil', 0.3]],
  wood: [['snap', 0.55], ['soil', 0.45]],
};

function pickWeighted(mix, rng) {
  let r = rng.next();
  for (const [name, w] of mix) {
    r -= w;
    if (r <= 0) return name;
  }
  return mix[mix.length - 1][0];
}

// Inharmonic plate/bar mode ratios for metallic pings.
const METAL_RATIOS = [1, 2.32, 4.25, 6.63, 9.38];

export function metalModes(f0, decay, rng, count = 4) {
  const modes = [];
  for (let i = 0; i < count; i++) {
    modes.push({
      f: f0 * METAL_RATIOS[i] * rng.jit(1, 0.04),
      d: decay * Math.pow(0.7, i) * rng.jit(1, 0.2),
      a: Math.pow(0.65, i) * rng.range(0.6, 1),
    });
  }
  return modes;
}

export function addGrain(out, at, g, type, rng, sr) {
  switch (type) {
    case 'soil': {
      const x = burst(sr, rng.seed(), 0.0004, rng.range(0.002, 0.009), undefined, 0);
      lp1(x, rng.range(600, 2400), sr);
      hp1(x, 150, sr);
      mixNorm(out, x, at, g * 0.8, sr);
      break;
    }
    case 'stone':
      addModes(out, at, g * 0.55, [
        { f: rng.range(1800, 4200), d: rng.range(0.004, 0.012), a: 1 },
        { f: rng.range(4500, 7000), d: 0.004, a: 0.5 },
      ], sr);
      addGas(out, at, g * 0.4, { tau: 0.0012, hp: 2000 }, rng, sr);
      break;
    case 'clod':
      addTone(out, at, g, rng.range(110, 170), rng.range(70, 100), 0.01, rng.range(0.012, 0.03), sr);
      addGas(out, at, g * 0.5, { tau: 0.012, lp: 900 }, rng, sr);
      break;
    case 'ping':
      addModes(out, at, g * 0.45, metalModes(rng.range(900, 2600), rng.range(0.06, 0.22), rng), sr);
      break;
    case 'clank':
      addModes(out, at, g * 0.6, metalModes(rng.range(280, 700), rng.range(0.03, 0.08), rng), sr);
      addGas(out, at, g * 0.4, { tau: 0.003, hp: 800 }, rng, sr);
      break;
    case 'chunk':
      addTone(out, at, g, rng.range(70, 130), rng.range(45, 70), 0.015, rng.range(0.03, 0.08), sr);
      addGas(out, at, g * 0.7, { tau: rng.range(0.02, 0.06), f: rng.range(400, 1200), q: 0.7 }, rng, sr);
      break;
    case 'brick':
      addModes(out, at, g * 0.6, [
        { f: rng.range(500, 1100), d: rng.range(0.01, 0.03), a: 1 },
        { f: rng.range(1300, 2600), d: rng.range(0.006, 0.015), a: 0.6 },
      ], sr);
      addGas(out, at, g * 0.5, { tau: 0.004, hp: 600 }, rng, sr);
      break;
    case 'snap':
      addGas(out, at, g * 0.6, { tau: 0.002, hp: 1000 }, rng, sr);
      addModes(out, at, g * 0.5, [{ f: rng.range(400, 1400), d: rng.range(0.008, 0.02), a: 1 }], sr);
      break;
    default:
      break;
  }
}

// Debris falling back after a blast; Poisson grains with a fast build-up and a long thinning tail.
export function addDebris(out, at, dur, rate, amp, kind, rng, sr) {
  const mix = DEBRIS_MIX[kind] || DEBRIS_MIX.dirt;
  let t = 0;
  for (;;) {
    t += rng.exp(rate);
    if (t >= dur) break;
    const u = t / dur;
    const density = Math.min(1, u * 5) * Math.pow(1 - u, 1.3);
    if (!rng.chance(density)) continue;
    const g = amp * (0.15 + 0.85 * rng.pow(2.5)) * (1 - 0.5 * u);
    addGrain(out, at + t, g, pickWeighted(mix, rng), rng, sr);
  }
}

// Fine sandy hiss of soil raining down (huge blasts).
export function addSandRain(out, at, dur, amp, rng, sr) {
  const n = Math.min(out.length - Math.round(at * sr), samples(sr, dur));
  if (n <= 16) return;
  const x = white(n, rng.seed(), 1, scratch(1, n));
  const grit = smoothRandom(n, Math.round((n / sr) * 60), rng, false, scratch(2, n));
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const env = Math.min(1, u * 4) * (1 - u) * (1 - u);
    const gm = grit[i] > 0 ? grit[i] : 0;
    x[i] *= env * (0.3 + gm);
  }
  biquad(x, 'bp', 2200, 0.5, sr);
  mixNorm(out, x, at, amp, sr);
}

// "Distance" version of an impulsive sound: air absorption, ground effect, sparse
// terrain echoes and a diffuse tail. The near signal is decimated first (by 2 or 4,
// depending on how little high-frequency content survives) to keep this cheap.
export function makeFar(near, rng, sr, p) {
  let x = decimate2(near);
  let rate = sr / 2;
  if (p.lp * 4.5 < rate / 2 && rate >= 16000) {
    x = decimate2(x);
    rate /= 2;
  }
  const out = new Float32Array(x.length + samples(rate, p.extra ?? 0.6));
  out.set(x);
  biquad(out, 'lp', p.lp, 0.7, rate);
  biquad(out, 'lp', p.lp * 1.3, 0.6, rate);
  biquad(out, 'hp', p.hp, 0.7, rate);
  // Sparse terrain echoes give the rolling character; the diffuse tail comes from
  // the convolver, which far voices feed heavily.
  const echoMax = p.echoMax ?? 0.7;
  addEchoes(out, p.echoSrc ?? 0.15, echoTaps(rng, p.echoes ?? 4, 0.07, echoMax, 0.42, p.lp * 0.8, p.lp * 0.45), rate);
  fadeOut(out, 0.06, rate);
  const pk = peak(out);
  scale(out, Math.min(p.gain ?? 1, 0.95 / Math.max(pk, 1e-6)));
  return { ch: [out], rate };
}
