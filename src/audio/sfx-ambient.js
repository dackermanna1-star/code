// Dead County audio — ambience one-shots (birds, crickets, thunder), continuous ambience beds (loops)
// and the music instrument samples (felt piano multisamples, tense pulse).

import { burst, tone, chirp, crackle, bubbles } from './instruments.js';
import { makeBuffer, clamp, lerp } from './dsp.js';

// ---------------------------------------------------------------------------------------------
// Birds
// ---------------------------------------------------------------------------------------------
function birdSong(s, v) {
  const kind = v % 5;
  let t = 0.02;
  const P = s.rand(0.6, 1);
  if (kind === 0) {
    // whistled phrase
    const n = s.irand(3, 6);
    const base = s.rand(2200, 3200);
    for (let i = 0; i < n; i++) {
      const d = s.rand(0.08, 0.2);
      const f0 = base * s.rand(0.85, 1.25), f1 = f0 * s.rand(0.75, 1.35);
      chirp(s, { t, path: [[0, f0], [d * 0.5, (f0 + f1) * 0.5 * s.rand(0.95, 1.1)], [d, f1]], peak: P * s.rand(0.6, 1), harm: 0.06 });
      t += d + s.rand(0.04, 0.12);
    }
  } else if (kind === 1) {
    // chip trill
    const n = s.irand(8, 18);
    const rate = s.rand(12, 20);
    const f0 = s.rand(4200, 5600);
    for (let i = 0; i < n; i++) {
      const d = s.rand(0.02, 0.032);
      const ff = f0 * (1 - i * 0.008);
      chirp(s, { t, path: [[0, ff], [d, ff * 0.7]], peak: P * (0.5 + 0.5 * Math.sin((i / n) * Math.PI)), env: [[0, 0], [0.2, 1], [1, 0]] });
      t += 1 / rate;
    }
  } else if (kind === 2) {
    // warble
    const d = s.rand(0.6, 1.1);
    const pts = [[0, s.rand(2600, 3400)]];
    let tt = 0;
    while (tt < d) {
      tt += s.rand(0.03, 0.06);
      pts.push([Math.min(tt, d), s.rand(2200, 4200)]);
    }
    chirp(s, { t, path: pts, peak: P * 0.8, env: [[0, 0], [0.1, 1], [0.5, 0.7], [0.8, 1], [1, 0]], harm: 0.05 });
  } else if (kind === 3) {
    // two-note "fee-bee"
    const f = s.rand(3600, 4100);
    chirp(s, { t, path: [[0, f], [0.28, f * 0.98]], peak: P, harm: 0.04 });
    chirp(s, { t: t + 0.36, path: [[0, f * 0.84], [0.1, f * 0.86], [0.32, f * 0.83]], peak: P * 0.85, harm: 0.04 });
    if (s.chance(0.5)) chirp(s, { t: t + 0.8, path: [[0, f * 0.84], [0.1, f * 0.86], [0.3, f * 0.83]], peak: P * 0.7 });
  } else {
    // mourning-dove style low coo: coo-OOO-oo-oo
    const f = s.rand(480, 560);
    const pat = [[0, 0.3, 0.6, 1.0], [0.42, 0.45, 1, 1.12], [1.0, 0.35, 0.7, 1.0], [1.45, 0.35, 0.6, 0.98]];
    for (const [dt, d, pk, fr] of pat) {
      chirp(s, { t: t + dt, path: [[0, f * fr * 0.95], [d * 0.3, f * fr * 1.04], [d, f * fr * 0.9]], peak: pk * P * 0.8, env: [[0, 0], [0.25, 1], [0.7, 0.8], [1, 0]], harm: 0.12 });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Crickets (JS-rendered; events wrap around so the buffer loops seamlessly)
// ---------------------------------------------------------------------------------------------
function cricketsBuffer(sr, L, rnd, count, wrap) {
  const n = Math.floor(L * sr);
  const buf = makeBuffer(n, sr, 1);
  const d = buf.getChannelData(0);
  for (let c = 0; c < count; c++) {
    const fc = 3800 + rnd() * 1500;
    const amp = count === 1 ? 1 : 0.12 + 0.88 * rnd() * rnd();
    const period = 0.32 + rnd() * 0.45;
    const pulses = 2 + Math.floor(rnd() * 3);
    const pl = 0.011 + rnd() * 0.009;
    const pg = 0.01 + rnd() * 0.008;
    const w = (2 * Math.PI * fc) / sr;
    const cw = Math.cos(w), sw = Math.sin(w);
    let t = rnd() * period;
    while (t < L) {
      if (rnd() < 0.07) {
        t += period * (2 + rnd() * 4);
        continue;
      }
      for (let p = 0; p < pulses; p++) {
        const st = Math.floor((t + p * (pl + pg)) * sr);
        const len = Math.floor(pl * sr);
        const a = amp * (p === pulses - 1 ? 0.75 : 1);
        // phasor recursion: carrier (c, s) and Hann window (hc, hs)
        let c = 1, s = 0, hc = 1, hs = 0;
        const hw = (2 * Math.PI) / len, hcw = Math.cos(hw), hsw = Math.sin(hw);
        for (let j = 0; j < len; j++) {
          let idx = st + j;
          if (idx >= n) {
            if (!wrap) break;
            idx -= n;
          }
          d[idx] += a * (0.5 - 0.5 * hc) * (s + 0.3 * s * c); // sin + 0.15·sin(2φ)
          const c2 = c * cw - s * sw;
          s = s * cw + c * sw;
          c = c2;
          const h2 = hc * hcw - hs * hsw;
          hs = hs * hcw + hc * hsw;
          hc = h2;
        }
      }
      t += period * (0.96 + rnd() * 0.08);
    }
  }
  if (count > 1) {
    // faint distant katydid trill (integer number of AM cycles over L)
    const fk = 6100 + rnd() * 400;
    const am = Math.round(42 * L) / L;
    const slow = Math.round(0.4 * L) / L;
    for (let i0 = 0; i0 < n; i0 += 32) {
      // envelope at block rate, carrier per sample
      const tt = i0 / sr;
      const e = 0.5 + 0.5 * Math.sin(2 * Math.PI * am * tt);
      const sl = 0.5 + 0.5 * Math.sin(2 * Math.PI * slow * tt + 1);
      const g = 0.05 * e * e * sl;
      const w0 = (2 * Math.PI * fk) / sr;
      for (let i = i0; i < Math.min(n, i0 + 32); i++) d[i] += g * Math.sin(w0 * i);
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------------------------
// Thunder: d = 0 overhead (sharp crack + boom + rumble) .. 1 far (low long rolling rumble)
// ---------------------------------------------------------------------------------------------
function thunderRender(s, d) {
  const T = s.T - 0.15;
  const sat = s.sat(1.6);
  const post = s.g(1);
  s.chain(sat, post, s.out);
  if (d < 0.65) {
    const k = 1 - d / 0.65;
    burst(s, { t: 0.01, kind: 'white', a: 0.001, tau: 0.05 + d * 0.05, peak: 1.2 * k, filters: [['highpass', 500], ['lowpass', lerp(9000, 2500, d)]], dest: sat.in });
    crackle(s, { t: 0.015, dur: 0.6, rate: 260, gmin: 0.002, gmax: 0.014, pow: 1.2, density: (x) => 1 - x, filters: [['highpass', 350], ['lowpass', lerp(7000, 2000, d)]], peak: 1.1 * k, dest: sat.in });
    burst(s, { t: 0.02, kind: 'brown', a: 0.01, tau: 0.35, peak: 1.4 * k, filters: [['lowpass', 380]], dest: sat.in });
  }
  // rolling rumble
  const att = lerp(0.12, 0.9, d);
  const decTau = lerp(1.1, 1.8, d);
  const lpTop = lerp(650, 230, d);
  const n = s.noise('brown', 0, T);
  const lp = s.lp(0, 0.9);
  lp.frequency.value = 0;
  s.randCtl(0, T, 3, lpTop * 0.45, lpTop).connect(lp.frequency);
  const roll = s.g(0);
  s.randCtl(0, T, lerp(4, 1.8, d), 0.12, 1).connect(roll.gain);
  const env = s.g(0);
  s.env(env.gain, [[0, 0], [att, 1.3], [att + 0.1, 1.1], [att + 0.1, 0, 't', decTau]]);
  s.chain(n, lp, roll, env, sat.in);
  // occasional secondary crackle (branching) for mid distances
  if (d > 0.2 && d < 0.8 && s.chance(0.6)) {
    crackle(s, { t: att + s.rand(0.2, 1.2), dur: 0.6, rate: 120, gmin: 0.004, gmax: 0.015, density: (x) => 1 - x, filters: [['lowpass', 1500]], peak: 0.35, dest: sat.in });
  }
}

// ---------------------------------------------------------------------------------------------
// Felt piano multisample
// ---------------------------------------------------------------------------------------------
export function pianoNote(s, midi) {
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const x = clamp((midi - 36) / 52, 0, 1);
  const B = 0.00012 * Math.pow(2, (midi - 48) / 18);
  const nP = Math.max(3, Math.min(14, Math.floor(7000 / f)));
  const T60 = lerp(7.5, 2.4, x);
  const bus = s.g(1);
  const lp0 = Math.min(9000, f * 6 + 1200);
  const lp = s.lp(lp0, 0.5);
  s.env(lp.frequency, [[0, lp0], [T60 * 0.6, Math.min(4000, f * 2.5 + 600), 'e']]);
  s.chain(bus, lp, s.out);
  const att = lerp(0.009, 0.004, x);
  for (let n = 1; n <= nP; n++) {
    const fn = n * f * Math.sqrt(1 + B * n * n);
    if (fn > s.sr * 0.45) break;
    const amp = Math.pow(n, -1.0) / (1 + Math.pow(n / 5, 2));
    const tau1 = 0.4 / Math.sqrt(n);
    const tau2 = T60 / 6.9 / (1 + 0.45 * (n - 1));
    // unison strings: unequal amplitudes + small detune → gentle shimmer instead of full beating nulls
    const cents = 0.08 + s.r() * (0.25 + 0.04 * n);
    const strings = midi >= 50 ? [[0, 0.55], [cents, 0.3], [-cents * 0.7, 0.15]] : [[cents * 0.5, 0.65], [-cents * 0.5, 0.35]];
    for (const [c, sa] of strings) {
      const o = s.osc('sine', fn * Math.pow(2, c / 1200), 0, s.T);
      const g = s.g(0);
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(amp * sa, att);
      g.gain.setTargetAtTime(amp * sa * 0.4, att, tau1);
      g.gain.setTargetAtTime(0, att + tau1 * 2.5, tau2);
      s.chain(o, g, bus);
    }
  }
  burst(s, { t: 0, kind: 'pink', a: 0.001, tau: 0.012, peak: 0.05, filters: [['lowpass', 1500], ['highpass', 100]], dest: bus });
}

export const PIANO_SAMPLES = [];
for (let m = 36; m <= 88; m += 5) PIANO_SAMPLES.push(m);

// ---------------------------------------------------------------------------------------------
const AMB = { cat: 'amb', pv: 0.05, vv: 0.15, send: 0.3 };
const LOOP = { cat: 'amb', internal: true, variants: 1, level: 1, pv: 0, vv: 0, send: 0, prio: 3 };

export const AMBIENT_SOUNDS = {
  birds: {
    ...AMB, sr: 'lo', dur: 2.4, variants: 8, level: 0.35, ref: 10, maxDist: 250, cap: 4,
    render: (s, v) => birdSong(s, v),
  },
  crickets: {
    ...AMB, sr: 'lo', dur: 2.6, variants: 2, level: 0.3, ref: 4, maxDist: 60, cap: 4,
    render: (s) => {
      const buf = cricketsBuffer(s.sr, 2.5, s.r, 1, false);
      s.chain(s.src(buf, 0.01), s.hp(2500), s.out);
    },
  },
  thunder: {
    ...AMB, sr: 'lo', dur: 6.5, variants: 2, level: 0.9, ref: 100, maxDist: 1e5, cap: 3, send: 0.35, pv: 0.06, vv: 0.1,
    render: (s) => thunderRender(s, s.rand(0.35, 0.55)),
  },
  thunder_near: {
    ...AMB, internal: true, sr: 'lo', dur: 6.0, variants: 2, level: 1, ref: 100, maxDist: 1e5, cap: 3, send: 0.35,
    render: (s) => thunderRender(s, s.rand(0, 0.12)),
  },
  thunder_far: {
    ...AMB, internal: true, sr: 'vlo', dur: 7.0, variants: 3, level: 1, ref: 100, maxDist: 1e5, cap: 3, send: 0.35,
    render: (s) => thunderRender(s, s.rand(0.88, 1)),
  },

  // ------------------------------------------------------------------ ambience beds (loops)
  amb_wind: {
    ...LOOP, sr: 'vlo', dur: 13.5, loop: { len: 12, xfade: 1.5, mode: 'power' }, variants: 2,
    render: (s) => {
      const T = s.T;
      const n = s.noise('brown', 0, T);
      const lp = s.lp(0, 0.6);
      lp.frequency.value = 0;
      s.randCtl(0, T, 0.35, 220, 750).connect(lp.frequency);
      const g = s.g(0);
      s.randCtl(0, T, 0.3, 0.35, 1).connect(g.gain);
      s.chain(n, lp, g, s.out);
      const n2 = s.noise('pink', 0, T);
      const bp = s.bp(0, 3);
      bp.frequency.value = 0;
      s.randCtl(0, T, 0.4, 380, 1100).connect(bp.frequency);
      const g2 = s.g(0);
      s.randCtl(0, T, 0.3, 0.02, 0.22).connect(g2.gain);
      s.chain(n2, bp, g2, s.out);
    },
  },
  amb_rain: {
    ...LOOP, sr: 'mid', dur: 6.6, loop: { len: 6, xfade: 0.6, mode: 'power' }, variants: 1,
    render: (s) => {
      const T = s.T;
      s.chain(s.noise('pink', 0, T), s.hp(600), s.lp(9000), s.g(0.5), s.out);
      s.chain(s.noise('white', 0, T), s.bp(5000, 0.4), s.g(0.15), s.out);
      crackle(s, { t: 0, dur: T, rate: 1800, gmin: 0.0002, gmax: 0.0009, pow: 2.5, filters: [['highpass', 1500]], peak: 0.6 });
      crackle(s, { t: 0, dur: T, rate: 40, gmin: 0.004, gmax: 0.012, decay: 6, ping: 1200, ping2: 3500, pow: 1.5, peak: 0.25 });
      crackle(s, { t: 0, dur: T, rate: 300, gmin: 0.001, gmax: 0.004, filters: [['lowpass', 1200]], peak: 0.3 });
    },
  },
  amb_rain_heavy: {
    ...LOOP, sr: 'mid', dur: 6.6, loop: { len: 6, xfade: 0.6, mode: 'power' }, variants: 1,
    render: (s) => {
      const T = s.T;
      s.chain(s.noise('brown', 0, T), s.lp(700), s.g(0.6), s.out);
      s.chain(s.noise('pink', 0, T), s.hp(300), s.lp(7000), s.g(0.6), s.out);
      crackle(s, { t: 0, dur: T, rate: 5000, gmin: 0.0002, gmax: 0.001, pow: 2.2, filters: [['highpass', 1000]], peak: 0.6 });
      crackle(s, { t: 0, dur: T, rate: 80, gmin: 0.004, gmax: 0.012, decay: 6, ping: 900, ping2: 3000, pow: 1.5, peak: 0.25 });
    },
  },
  amb_rain_roof: {
    ...LOOP, sr: 'lo', dur: 6.6, loop: { len: 6, xfade: 0.6, mode: 'power' }, variants: 1,
    render: (s) => {
      const T = s.T;
      crackle(s, { t: 0, dur: T, rate: 1300, gmin: 0.002, gmax: 0.006, pow: 2, filters: [['lowpass', 1500]], peak: 0.8 });
      s.chain(s.noise('brown', 0, T), s.lp(300), s.g(0.4), s.out);
      crackle(s, { t: 0, dur: T, rate: 2, gmin: 0.02, gmax: 0.05, decay: 5, ping: 900, ping2: 1800, pow: 1, peak: 0.4 });
      const tr = s.noise('pink', 0, T);
      const am = s.g(0);
      s.randCtl(0, T, 12, 0, 0.12).connect(am.gain);
      s.chain(tr, s.bp(1200, 3), am, s.out);
    },
  },
  amb_crickets: {
    ...LOOP, sr: 'lo', dur: 10, loop: { len: 10, xfade: 0, mode: 'linear' }, variants: 1,
    render: (s) => {
      const buf = cricketsBuffer(s.sr, 10, s.r, 7, true);
      s.chain(s.src(buf, 0), s.hp(2500), s.out);
    },
  },
  amb_underwater: {
    ...LOOP, sr: 'vlo', dur: 9, loop: { len: 8, xfade: 1, mode: 'power' }, variants: 1,
    render: (s) => {
      const T = s.T;
      const am = s.g(0.5);
      s.randCtl(0, T, 0.8, 0, 0.5).connect(am.gain);
      s.chain(s.noise('brown', 0, T), s.lp(300), am, s.out);
      bubbles(s, { t: 0, dur: T - 0.3, count: 14, fmin: 200, fmax: 900, peak: 0.25, len: 0.08 });
    },
  },
  amb_tension: {
    ...LOOP, sr: 'vlo', dur: 13.5, loop: { len: 12, xfade: 1.5, mode: 'linear' }, variants: 1,
    render: (s) => {
      const T = s.T;
      const tones = [[55, 0.5], [55.4, 0.26], [82.5, 0.18], [116.5, 0.12], [233, 0.04]];
      for (const [f, a] of tones) {
        const o = s.osc(f > 100 ? 'triangle' : 'sine', f, 0, T);
        const g = s.g(a * 0.5);
        s.randCtl(0, T, 0.2, 0, a * 0.5).connect(g.gain);
        s.chain(o, g, s.out);
      }
      const n = s.noise('pink', 0, T);
      const am = s.g(0);
      s.randCtl(0, T, 0.25, 0.02, 0.35).connect(am.gain);
      s.chain(n, s.bp(260, 2), am, s.out);
      const hi = s.osc('sine', 1864.7, 0, T);
      const hg = s.g(0);
      s.randCtl(0, T, 0.3, 0, 0.025).connect(hg.gain);
      const trem = s.g(0.6);
      const lfo = s.osc('sine', 5.5, 0, T);
      const lg = s.g(0.4);
      s.chain(lfo, lg);
      lg.connect(trem.gain);
      s.chain(hi, trem, hg, s.out);
    },
  },

  // ------------------------------------------------------------------ music instrument samples
  mus_pulse: {
    ...LOOP, cat: 'music', sr: 'vlo', dur: 1.3, prio: 2,
    render: (s) => {
      tone(s, { t: 0.002, f: 64, f1: 47, glideTau: 0.08, a: 0.006, tau: 0.25, peak: 1 });
      tone(s, { t: 0.002, f: 98, f1: 90, glideTau: 0.08, a: 0.006, tau: 0.09, peak: 0.25 });
      burst(s, { t: 0.002, kind: 'brown', a: 0.003, tau: 0.04, peak: 0.5, filters: [['lowpass', 220]] });
      burst(s, { t: 0.002, kind: 'pink', a: 0.001, tau: 0.008, peak: 0.08, filters: [['lowpass', 1200]] });
    },
  },
};
for (const m of PIANO_SAMPLES) {
  AMBIENT_SOUNDS['mus_piano_' + m] = {
    ...LOOP, cat: 'music', prio: 1, sr: 'lo', dur: lerp(8, 4.5, (m - 36) / 52),
    render: (s) => pianoNote(s, m),
  };
}
