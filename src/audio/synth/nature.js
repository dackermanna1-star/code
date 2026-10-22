// Ambience recipes: wind, rain, the distant-battle rumble bed, night insects,
// birds and thunder. Beds are generated as seamless periodic loops.
import {
  TAU,
  addTone,
  biquad,
  blepSaw,
  brown,
  brownFilter,
  circular,
  finish,
  hp1,
  lp1,
  mixNorm,
  mixWrap,
  normalize,
  pinkFilter,
  samples,
  smoothRandom,
  white,
} from '../dsp.js';

function loopNoise(n, rng, sr, kind, filters) {
  const x = white(n, rng.seed());
  circular(x, Math.min(n, samples(sr, 0.5)), (b) => {
    if (kind === 'pink') pinkFilter(b);
    else if (kind === 'brown') brownFilter(b, sr, 15);
    filters(b);
  });
  return normalize(x, 1);
}

// Broadband wind noise; gusts and howl are shaped at runtime by filters.
export function wind(rng, sr) {
  const n = samples(sr, 6);
  const make = () => {
    const x = loopNoise(n, rng, sr, 'pink', (b) => {
      lp1(b, 2500, sr);
      hp1(b, 30, sr);
    });
    const mod = smoothRandom(n, 5, rng, true);
    for (let i = 0; i < n; i++) x[i] *= 0.75 + 0.25 * mod[i];
    return normalize(x, 0.9);
  };
  return { ch: [make(), make()] };
}

// Writes `count` decaying noise grains at random positions (wrapping around the end).
function addDrops(x, count, rng, sr, minLen, maxLen, ampExp, floor) {
  const n = x.length;
  for (let k = 0; k < count; k++) {
    const len = Math.max(2, Math.round(sr * rng.range(minLen, maxLen)));
    const d = Math.exp(-1 / (len * 0.3));
    let e = (floor + (1 - floor) * rng.pow(ampExp)) * 4.656612873077393e-10;
    let s = rng.seed() | 0;
    let j = rng.int(n);
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) | 0;
      x[j] += s * e;
      e *= d;
      if (++j === n) j = 0;
    }
  }
  return x;
}

// Rain as thousands of tiny drop impacts plus the hiss of the rain field.
function rainChannel(rng, sr, n, o) {
  const x = addDrops(new Float32Array(n), Math.round((o.drops * n) / sr), rng, sr, 0.0004, 0.0018, 3, 0.1);
  circular(x, samples(sr, 0.05), (b) => {
    hp1(b, 1800, sr);
    biquad(b, 'peak', 4500, 0.8, sr, 4);
  });
  normalize(x, 1);
  if (o.splats) {
    const s = addDrops(new Float32Array(n), Math.round((o.splats * n) / sr), rng, sr, 0.002, 0.006, 2, 0.2);
    circular(s, samples(sr, 0.05), (b) => biquad(b, 'bp', 1300, 0.7, sr));
    normalize(s, 1);
    for (let i = 0; i < n; i++) x[i] += s[i] * o.splatGain;
  }
  const hiss = loopNoise(n, rng, sr, 'pink', (b) => biquad(b, 'bp', o.hissF, 0.5, sr));
  for (let i = 0; i < n; i++) x[i] += hiss[i] * o.hiss;
  return normalize(x, 0.9);
}

export function rainLight(rng, sr) {
  const n = samples(sr, 3);
  const o = { drops: 380, splats: 0, hiss: 0.25, hissF: 5000 };
  return { ch: [rainChannel(rng, sr, n, o), rainChannel(rng, sr, n, o)] };
}

export function rainHeavy(rng, sr) {
  const n = samples(sr, 3);
  const o = { drops: 1500, splats: 260, splatGain: 0.5, hiss: 0.6, hissF: 1800 };
  return { ch: [rainChannel(rng, sr, n, o), rainChannel(rng, sr, n, o)] };
}

// Distant battle: low rolling growl with buried far-off thuds of guns and impacts.
export function battleRumble(rng, sr) {
  const n = samples(sr, 6);
  const make = () => {
    const x = loopNoise(n, rng, sr, 'brown', (b) => {
      lp1(b, 130, sr);
      lp1(b, 160, sr);
    });
    const mod = smoothRandom(n, 6, rng, true);
    for (let i = 0; i < n; i++) x[i] *= Math.max(0.15, 0.6 + 0.4 * mod[i]);
    const thuds = new Float32Array(n);
    for (let k = 0; k < 7; k++) {
      const len = samples(sr, 1.4);
      const th = new Float32Array(len);
      addTone(th, 0, 1, rng.range(60, 85), rng.range(32, 45), 0.05, rng.range(0.25, 0.6), sr, 0.01);
      const nz = white(len, rng.seed());
      const d = Math.exp(-1 / (rng.range(0.2, 0.5) * sr));
      let e = 1;
      for (let i = 0; i < len; i++) {
        th[i] += 0.6 * nz[i] * e;
        e *= d;
      }
      lp1(th, 220, sr);
      mixWrap(thuds, th, rng.int(n), 0.2 + 0.8 * rng.pow(2));
    }
    normalize(thuds, 1);
    for (let i = 0; i < n; i++) x[i] += 0.7 * thuds[i];
    return normalize(x, 0.9);
  };
  return { ch: [make(), make()] };
}

// Night insects: a few crickets with their own pitch and chirp rate.
export function crickets(rng, sr) {
  const L = 4;
  const n = samples(sr, L);
  const make = () => {
    const x = new Float32Array(n);
    for (let c = 0; c < 4; c++) {
      const f = rng.range(4200, 4900);
      const chirps = Math.round(L * rng.range(1.6, 2.6));
      const period = n / chirps;
      const amp = rng.range(0.25, 1);
      const pulses = 2 + rng.int(3);
      const chirp = new Float32Array(samples(sr, 0.03 * pulses + 0.02));
      for (let p = 0; p < pulses; p++) {
        const i0 = samples(sr, p * 0.03);
        const len = samples(sr, 0.014);
        for (let i = 0; i < len; i++) {
          chirp[i0 + i] += Math.sin((Math.PI * i) / len) * Math.sin((TAU * f * i) / sr);
        }
      }
      const offset = rng.int(n);
      for (let k = 0; k < chirps; k++) mixWrap(x, chirp, offset + Math.round(k * period), amp);
    }
    return normalize(x, 0.8);
  };
  return { ch: [make(), make()] };
}

function chirp(out, at, dur, f0, f1, amp, sr, harm = 0.1) {
  const i0 = samples(sr, at);
  const n = samples(sr, dur);
  let ph = 0;
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const u = i / n;
    ph += (TAU * (f0 + (f1 - f0) * u)) / sr;
    const env = Math.sin(Math.PI * u) ** 2;
    out[i0 + i] += amp * env * (Math.sin(ph) + harm * Math.sin(2 * ph));
  }
}

// Six bird calls: chirp series, trill, warble, crow, two-note whistle, sparrow.
export function birdCall(rng, sr, variant) {
  const out = new Float32Array(samples(sr, 1.2));
  switch (variant % 6) {
    case 0: {
      let t = 0.02;
      const count = 3 + rng.int(4);
      for (let i = 0; i < count; i++) {
        const up = rng.chance(0.6);
        chirp(out, t, rng.range(0.04, 0.09), up ? 3000 : 6000, up ? 6000 : 3200, rng.range(0.6, 1), sr);
        t += rng.range(0.1, 0.18);
      }
      break;
    }
    case 1: {
      const f = rng.range(4000, 5000);
      for (let t = 0.02; t < 0.7; t += 1 / 16) chirp(out, t, 0.035, f * 1.05, f * 0.95, 0.8, sr);
      break;
    }
    case 2: {
      const n = samples(sr, 0.9);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const f = 3200 + 700 * Math.sin(TAU * 1.3 * t) + 250 * Math.sin(TAU * 21 * t);
        ph += (TAU * f) / sr;
        const env = Math.sin((Math.PI * i) / n) * (0.5 + 0.5 * Math.sin(TAU * 4.5 * t) ** 2);
        out[i + samples(sr, 0.02)] += env * Math.sin(ph);
      }
      break;
    }
    case 3: {
      for (let c = 0; c < 2 + rng.int(2); c++) {
        const at = 0.02 + c * rng.range(0.32, 0.42);
        const n = samples(sr, 0.26);
        const caw = new Float32Array(n);
        const f0 = rng.range(480, 600);
        let ph = 0;
        for (let i = 0; i < n; i++) {
          const u = i / n;
          const dt = (f0 * (1 - 0.15 * u)) / sr;
          ph += dt;
          if (ph >= 1) ph -= 1;
          caw[i] = Math.sin(Math.PI * Math.min(1, u * 3)) * (1 - u * 0.5) * blepSaw(ph, dt);
        }
        const nz = white(n, rng.seed());
        for (let i = 0; i < n; i++) caw[i] += 0.3 * nz[i] * Math.abs(caw[i]);
        const a = caw.slice();
        biquad(caw, 'bp', 1250, 3, sr);
        biquad(a, 'bp', 2400, 4, sr);
        for (let i = 0; i < n; i++) caw[i] += 0.6 * a[i];
        mixNorm(out, caw, at, 0.9, sr);
      }
      break;
    }
    case 4: {
      const f = rng.range(2000, 2500);
      chirp(out, 0.02, 0.32, f, f * 0.98, 0.9, sr, 0.02);
      chirp(out, 0.42, 0.38, f * 0.8, f * 0.78, 0.8, sr, 0.02);
      break;
    }
    default: {
      let t = 0.02;
      for (let i = 0; i < 5 + rng.int(4); i++) {
        chirp(out, t, rng.range(0.02, 0.04), rng.range(5500, 7000), rng.range(2500, 3500), rng.range(0.5, 1), sr, 0.25);
        t += rng.range(0.07, 0.14);
      }
    }
  }
  return finish(out, sr, { drive: 0, fade: 0.05, dc: 300, target: 0.8 });
}

// Thunder: a cascade of N-waves from the tortuous lightning channel, arriving
// over seconds, plus a low rolling growl. Near strikes open with a tearing crack.
export function thunder(rng, sr, near) {
  const len = 6.5;
  const n = samples(sr, len);
  const out = new Float32Array(n);
  const clusters = Array.from({ length: 3 + rng.int(3) }, () => ({
    t: rng.range(near ? 0.1 : 0.3, 4.0), w: rng.range(0.2, 0.7), a: rng.range(0.4, 1),
  }));
  if (near) clusters.push({ t: 0.05, w: 0.15, a: 1.6 });
  const pulses = near ? 900 : 600;
  for (let k = 0; k < pulses; k++) {
    const c = clusters[rng.int(clusters.length)];
    const t = Math.max(0.01, c.t + (rng.next() + rng.next() - 1) * c.w);
    if (t > len - 0.5) continue;
    const short = near && t < 0.6;
    const dur = short ? rng.range(0.001, 0.004) : rng.range(0.008, 0.04);
    const i0 = samples(sr, t);
    const m = samples(sr, dur);
    const a = c.a * (0.1 + 0.9 * rng.pow(2.5)) * (rng.chance(0.5) ? 1 : -1);
    for (let i = 0; i <= m && i0 + i < n; i++) out[i0 + i] += a * (1 - (2 * i) / m);
  }
  if (!near) lp1(lp1(out, 400, sr), 500, sr);
  else lp1(out, 6000, sr);
  normalize(out, 1);
  const rum = brown(n, rng.seed(), sr, 15);
  const mod = smoothRandom(n, 14, rng);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const v = 1 - u;
    rum[i] *= Math.max(0, 0.5 + 0.6 * mod[i]) * Math.min(1, u * 8) * v * Math.sqrt(v);
  }
  lp1(lp1(rum, 120, sr), 160, sr);
  mixNorm(out, rum, 0, near ? 0.7 : 1, sr);
  if (near) addTone(out, 0.06, 0.8, 55, 30, 0.08, 0.6, sr, 0.01);
  return finish(out, sr, { drive: near ? 2.2 : 1.6, fade: 0.8, dc: 15 });
}
