// Bomb, UI and ambience recipes.

import {
  TAU, addBurst, addTone, addMetal, addScrape, biquad, normalize, mixInto, svf, pink, brown, white,
} from './dsp.js';
import { foley } from './weapons.js';
import { explosion } from './foley.js';

/** Electronic beep: odd-harmonic tone with a flat sustain and short ramps. */
function addBeep(out, sr, t0, dur, f, { harm = [1, 0.25, 0.1], amp = 1, att = 0.002, rel = 0.008, slide = 0 } = {}) {
  const i0 = Math.round(t0 * sr);
  const n = Math.ceil(dur * sr);
  let ph = 0;
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / sr;
    const env = Math.min(1, t / att, (dur - t) / rel);
    ph += (TAU * f * (1 + slide * (t / dur))) / sr;
    let s = 0;
    for (let k = 0; k < harm.length; k++) s += harm[k] * Math.sin(ph * (2 * k + 1));
    out[i0 + i] += amp * Math.max(0, env) * s;
  }
}

function addChirp(out, sr, t0, { f0, f1, f2, dur, amp = 1, peakAt = 0.3, warble = 0.02, warbleF = 35 }) {
  const i0 = Math.round(t0 * sr);
  const n = Math.ceil(dur * sr);
  let ph = 0;
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / sr;
    const u = t / dur;
    let f = u < peakAt ? f0 + ((f1 - f0) * u) / peakAt : f1 + ((f2 - f1) * (u - peakAt)) / (1 - peakAt);
    f *= 1 + warble * Math.sin(TAU * warbleF * t);
    ph += (TAU * f) / sr;
    const e = Math.sin(Math.PI * u);
    out[i0 + i] += amp * e * e * (Math.sin(ph) + 0.12 * Math.sin(2 * ph));
  }
}

// ------------------------------------------------------------------ wind ---

/**
 * Gusty desert wind, stereo. Every modulation is a sum of harmonics of 1/loopLen
 * so it is periodic; the bank renders loopLen + crossfade and folds the end
 * back onto the start for a seamless loop.
 */
function wind(P) {
  const { rng, sr } = P;
  const L = P.loopLen;
  const n = P.len;
  const harm = [[1, 0.55], [2, 0.4], [3, 0.3], [5, 0.24], [7, 0.16], [11, 0.1], [17, 0.06], [23, 0.04]].map(([k, a]) => [k, a, rng() * TAU]);
  const raw = (t) => {
    let s = 0;
    for (const [k, a, ph] of harm) s += a * Math.sin((TAU * k * t) / L + ph);
    return s;
  };
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < 2000; i++) {
    const v = raw((i / 2000) * L);
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  const gust = (t) => Math.min(1, Math.max(0, (raw(t) - mn) / (mx - mn)));
  // multiply x by gain(t), evaluated every 32 samples and interpolated
  const shape = (x, fn) => {
    let g0 = fn(0);
    for (let b = 0; b < x.length; b += 32) {
      const g1 = fn((b + 32) / sr);
      const m = Math.min(32, x.length - b);
      for (let i = 0; i < m; i++) x[b + i] *= g0 + ((g1 - g0) * i) / 32;
      g0 = g1;
    }
    return x;
  };
  const chans = [];
  const B = 32;
  for (let ch = 0; ch < 2; ch++) {
    const off = ch ? 0.4 : 0;
    // gust strength tabulated at control rate (every 32 samples)
    const G = new Float32Array(Math.ceil(n / B) + 2);
    for (let b = 0; b < G.length; b++) G[b] = gust((b * B) / sr - off);
    const g = (t) => G[Math.min(G.length - 1, ((t * sr) / B) | 0)];
    const out = new Float32Array(n);
    const add = (x, amp) => mixInto(out, x, 0, amp);
    // A: low body
    const a = brown(n, rng);
    biquad(a, sr, 'lowpass', 380, 0.7);
    add(shape(normalize(a, 1), (t) => 0.35 + 0.65 * g(t)), 0.45);
    // B: gust band whose centre rises with the wind speed
    const b = svf(pink(n, rng), sr, 'bp', (t) => 260 + 700 * g(t), 0.9);
    add(shape(normalize(b, 1), (t) => 0.12 + Math.pow(g(t), 1.6)), 0.9);
    // C: whistle through gaps
    const c = svf(white(n, rng), sr, 'bp', (t) => 650 + 950 * g(t) + 60 * Math.sin((TAU * 13 * t) / L), 16);
    add(shape(normalize(c, 1), (t) => Math.pow(g(t), 2.2)), 0.4);
    // D: sand hiss on gusts
    const d = white(n, rng);
    biquad(d, sr, 'highpass', 3000, 0.7);
    biquad(d, sr, 'lowpass', Math.min(6500, sr * 0.4), 0.7);
    add(shape(normalize(d, 1), (t) => Math.pow(g(t), 3)), 0.08);
    chans.push(out);
  }
  P.play(chans, P.out);
}

// ---------------------------------------------------------------- recipes ---

const DTMF = [[770, 1336], [852, 1209], [697, 1477], [941, 1336]];

export const MISC = {
  // map entities: a wooden door swinging (hinge creak + rumble), its latch, a wall button
  door_move: { dur: 0.9, peak: 0.42, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.5, { a: 0.002, h: 0.02, tau: 0.03, color: 'pink', filters: [['lowpass', 900, 0.7]] });
    addScrape(x, sr, r, 0.03, 0.62, { f0: 520, f1: 760, q: 6, amp: 0.55, grit: 0.7, rise: 0.25, color: 'pink' });
    addScrape(x, sr, r, 0.08, 0.5, { f0: 1500, f1: 1150, q: 9, amp: 0.25, grit: 0.9, rise: 0.4 });
    addBurst(x, sr, r, 0.05, 0.35, { color: 'brown', len: 0.7, env: (t) => Math.min(1, t / 0.08) * Math.exp(-t / 0.45), filters: [['lowpass', 260, 0.7]] });
  }, 0.1) },
  door_stop: { dur: 0.5, peak: 0.5, fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 110, f1: 70, glide: 0.04, tau: 0.08, amp: 1, a: 0.0008 });
    addBurst(x, sr, r, 0, 0.9, { a: 0.0005, tau: 0.035, color: 'pink', filters: [['lowpass', 1600, 0.7], ['peaking', 380, 1.2, 6]] });
    addMetal(x, sr, r, 0.012, { f: 2600, amp: 0.35, tau: 0.02, body: 0.4, bodyF: 600 });
  }, 0.12) },
  button: { dur: 0.15, peak: 0.4, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: 3100, amp: 0.7, tau: 0.008, body: 0.5, bodyF: 900, bodyTau: 0.01 });
    addMetal(x, sr, r, 0.045, { f: 2500, amp: 0.5, tau: 0.01 });
  }, 0.05) },
  // ---- bomb
  c4_beep: { dur: 0.14, peak: 0.32, fn: (P) => foley(P, (x, sr) => addBeep(x, sr, 0, 0.1, 1650, { harm: [1, 0.28, 0.12, 0.05] })) },
  c4_plant_press: { dur: 0.12, variants: 3, peak: 0.28, fn: (P, v) => foley(P, (x, sr, r) => {
    const [lo, hi] = DTMF[v % DTMF.length];
    addBeep(x, sr, 0.004, 0.075, lo, { harm: [1], amp: 0.5, rel: 0.01 });
    addBeep(x, sr, 0.004, 0.075, hi, { harm: [1], amp: 0.5, rel: 0.01 });
    addMetal(x, sr, r, 0, { f: 2500, amp: 0.35, tau: 0.004, n: 3 });
  }) },
  c4_planted: { dur: 0.55, peak: 0.4, fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 140, f1: 80, glide: 0.02, tau: 0.03, amp: 0.7, a: 0.001 });
    addBurst(x, sr, r, 0, 0.6, { a: 0.0008, tau: 0.015, color: 'pink', filters: [['lowpass', 900, 0.7]] });
    addMetal(x, sr, r, 0.002, { f: 1800, amp: 0.5, tau: 0.015, body: 0.5, bodyF: 400, bodyTau: 0.02 });
    addBeep(x, sr, 0.15, 0.08, 1200, { amp: 0.55 });
    addBeep(x, sr, 0.26, 0.13, 1800, { amp: 0.55 });
  }, 0.06) },
  c4_disarm: { dur: 0.36, peak: 0.42, fn: (P) => foley(P, (x, sr, r) => {
    [[0, 3000, 0.7], [0.07, 3600, 0.5], [0.13, 2700, 0.8], [0.24, 3300, 0.6]].forEach(([t, f, a]) => addMetal(x, sr, r, t, { f, amp: a, tau: 0.008, body: 0.3, bodyF: 1000, bodyTau: 0.01 }));
    addScrape(x, sr, r, 0.15, 0.06, { f0: 3500, f1: 4500, q: 2, amp: 0.15, grit: 0.7 });
  }, 0.05) },
  c4_disarmed: { dur: 0.48, peak: 0.38, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: 2800, amp: 0.8, tau: 0.012, body: 0.5, bodyF: 700 });
    addBeep(x, sr, 0.06, 0.1, 1500, { amp: 0.5 });
    addBeep(x, sr, 0.18, 0.2, 750, { amp: 0.5, slide: -0.08, rel: 0.04 });
  }, 0.05) },
  c4_explode: { rate: 22050, dur: 5.5, peak: 0.98, fn: (P) => explosion(P, {
    crack: 1, crackTau: 0.02, crackHP: 600, blast: 1.8, hold: 0.07, blastTau: 0.4, blastLP: 1900, blastResF: 300,
    thump: 0.9, thumpF0: 70, thumpF1: 30, thumpGlide: 0.12, thumpTau: 0.45,
    rumble: 0.5, rumbleTau: 1.3, rumbleLP: 320, rumbleLen: 5, debris: 180, debrisSpan: 3, debrisDecay: 1.2, debrisAmp: 0.4, drive: 3,
    tail: { tau: 1.1, lp: 2000, lpEnd: 250, pre: 0.012, slaps: [[0.18, 0.6], [0.42, 0.45], [0.75, 0.3], [1.2, 0.2], [1.8, 0.1]], wet: 0.55, slapWin: 0.5 },
  }) },
  // ---- UI
  menu_click: { dur: 0.05, peak: 0.26, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.00005, tau: 0.0015, filters: [['bandpass', 2500, 1]] });
    addTone(x, sr, 0, { f: 1700, tau: 0.006, amp: 0.3 });
  }) },
  menu_select: { dur: 0.09, peak: 0.28, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.7, { a: 0.00005, tau: 0.002, filters: [['bandpass', 3500, 1]] });
    addTone(x, sr, 0, { f: 1200, tau: 0.02, amp: 0.6 });
    addTone(x, sr, 0, { f: 2400, tau: 0.012, amp: 0.3 });
  }) },
  radio_beep: { dur: 0.17, peak: 0.26, lofi: 3800, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.5, { a: 0.0005, h: 0.012, tau: 0.008, filters: [['bandpass', 2000, 1.2]] });
    addBeep(x, sr, 0.012, 0.1, 1000, { harm: [1, 0.33, 0.2, 0.14], amp: 0.6, att: 0.003, rel: 0.012 });
    biquad(x, sr, 'highpass', 300, 0.7);
  }) },
  hint: { dur: 0.5, peak: 0.28, fn: (P) => foley(P, (x, sr) => {
    addTone(x, sr, 0, { f: 990, tau: 0.06, amp: 0.8, a: 0.003 });
    addTone(x, sr, 0, { f: 1980, tau: 0.03, amp: 0.15, a: 0.003 });
    addTone(x, sr, 0.07, { f: 1480, tau: 0.1, amp: 0.8, a: 0.003 });
    addTone(x, sr, 0.07, { f: 2960, tau: 0.04, amp: 0.12, a: 0.003 });
  }, 0.1) },
  // zombie survival ready-up (zeconomy.js): you're ready (a rising fourth, bell-ish), and
  // everyone is (a rising triad that rings on: the wave is seconds away)
  zm_ready: { dur: 0.45, peak: 0.3, fn: (P) => foley(P, (x, sr) => {
    addTone(x, sr, 0, { f: 784, tau: 0.07, amp: 0.7, a: 0.002 });
    addTone(x, sr, 0, { f: 1568, tau: 0.03, amp: 0.12, a: 0.002 });
    addTone(x, sr, 0.085, { f: 1047, tau: 0.14, amp: 0.8, a: 0.002 });
    addTone(x, sr, 0.085, { f: 2094, tau: 0.05, amp: 0.14, a: 0.002 });
    addTone(x, sr, 0.085, { f: 3141, tau: 0.025, amp: 0.05, a: 0.002 });
  }, 0.08) },
  zm_allready: { dur: 1.1, peak: 0.32, fn: (P) => foley(P, (x, sr) => {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      const t = i * 0.09, last = i === notes.length - 1;
      addTone(x, sr, t, { f, tau: last ? 0.32 : 0.08, amp: last ? 0.85 : 0.6, a: 0.003, vib: last ? 0.004 : 0, vibF: 5.5 });
      addTone(x, sr, t, { f: f * 2, tau: last ? 0.12 : 0.04, amp: 0.15, a: 0.003 });
      addTone(x, sr, t, { f: f * 3.01, tau: 0.03, amp: 0.05, a: 0.002 });
    });
  }, 0.15) },
  nvg_on: { dur: 0.5, peak: 0.3, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: 2800, amp: 0.7, tau: 0.008, body: 0.4, bodyF: 1000 });
    addTone(x, sr, 0.01, { f: 1800, f1: 6500, glide: 0.2, tau: 0.6, len: 0.45, amp: 0.35, a: 0.03, rel: 0.12 });
    addTone(x, sr, 0.01, { f: 120, tau: 0.6, len: 0.45, amp: 0.12, a: 0.02, rel: 0.1 });
  }) },
  heartbeat: { rate: 22050, dur: 0.8, peak: 0.45, fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 100, f1: 65, glide: 0.03, tau: 0.045, amp: 0.7, a: 0.006 });
    addBurst(x, sr, r, 0, 0.5, { a: 0.004, tau: 0.025, color: 'pink', filters: [['lowpass', 450, 0.7], ['peaking', 220, 1.5, 5]] });
    addTone(x, sr, 0.24, { f: 110, f1: 72, glide: 0.03, tau: 0.035, amp: 0.5, a: 0.005 });
    addBurst(x, sr, r, 0.24, 0.35, { a: 0.004, tau: 0.02, color: 'pink', filters: [['lowpass', 500, 0.7], ['peaking', 240, 1.5, 5]] });
  }) },
  // ---- ambience
  ambience_wind: { dur: 10, loop: 1.0, stereo: true, rms: 0.07, rate: 16000, fn: (P) => wind(P) },
  ambience_bird: { rate: 22050, dur: 1.0, variants: 3, peak: 0.16, lofi: 6500, fn: (P, v) => foley(P, (x, sr, r) => {
    if (v === 0) {
      for (let i = 0; i < 3; i++) addChirp(x, sr, 0.02 + i * r.range(0.12, 0.15), { f0: r.jit(2800, 0.05), f1: r.jit(4300, 0.04), f2: r.jit(3600, 0.04), dur: r.range(0.06, 0.08) });
    } else if (v === 1) {
      for (let i = 0; i < 6; i++) addChirp(x, sr, 0.02 + i * 0.06, { f0: 4600 - i * 90, f1: 4800 - i * 90, f2: 3800 - i * 60, dur: 0.04, amp: 1 - i * 0.1, peakAt: 0.2 });
    } else {
      addChirp(x, sr, 0.02, { f0: 3000, f1: 4500, f2: 4300, dur: 0.12, peakAt: 0.7 });
      addChirp(x, sr, 0.2, { f0: 3900, f1: 4000, f2: 2900, dur: 0.16, peakAt: 0.15, amp: 0.8 });
    }
    biquad(x, sr, 'highpass', 1500, 0.7);
  }, 0.35, { len: 0.8, tau: 0.18, lp: 5000, lpEnd: 1500, slaps: [[0.09, 0.4], [0.2, 0.25]] }) },
  distant_fly: { rate: 22050, dur: 2.6, peak: 0.12, fn: (P) => foley(P, (x, sr, r) => {
    const n = x.length;
    let ph = 0;
    const p1 = r() * TAU;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = 200 + 22 * Math.sin(TAU * 0.8 * t + p1) + 12 * Math.sin(TAU * 2.3 * t + 1);
      const dt = f / sr;
      ph += dt;
      if (ph >= 1) ph -= 1;
      // band-limited (polyBLEP) sawtooth: the wing buzz
      let saw = 2 * ph - 1;
      if (ph < dt) {
        const u = ph / dt;
        saw -= u + u - u * u - 1;
      } else if (ph > 1 - dt) {
        const u = (ph - 1) / dt;
        saw -= u * u + u + u + 1;
      }
      const env = Math.min(1, t / 0.4, Math.max(0, (2.6 - t) / 0.6)) * (0.6 + 0.4 * Math.sin(TAU * 0.45 * t + p1));
      x[i] = saw * env;
    }
    biquad(x, sr, 'bandpass', 650, 0.7);
    biquad(x, sr, 'lowpass', 3000, 0.7);
  }) },
};
