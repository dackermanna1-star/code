// Music instruments. Percussive voices (music box, piano, plucked string, chase hits) are
// buffer recipes rendered per pitch and cached by the engine; sustained band voices (cornet,
// clarinet, tuba, horn) and pads are small live graphs inside a note Voice.
import { ring, burst, BQ, OnePole, filt, mtof, cents, clamp, pluckString, saturate } from './dsp.js';
import { RATIOS, thump, metal } from './synth.js';

const fadeTail = (o, sr, sec) => { const n = Math.min(o.length, Math.round(sec * sr)); for (let i = 0; i < n; i++) o[o.length - 1 - i] *= i / n; return o; };

// ---- buffer instruments (engine.buffer entries; opts carry pitch/velocity) -------------------
export const MUSIC_BOX = {
  peak: -2, var: 1, key: (o) => `${o.midi}|${Math.round(o.cents || 0)}`,
  gen(S) {
    const { sr, R, opts } = S, f = mtof(opts.midi) * cents(opts.cents || 0);
    const t60 = clamp(4.2 - (opts.midi - 60) * 0.09, 1.2, 4);
    const o = S.alloc(t60 * 1.0 + 0.05);
    ring(o, sr, 0, f, 1, t60, { attack: 0.0008 });
    ring(o, sr, 0, f * 1.0007, 0.25, t60 * 0.8, { attack: 0.0008 });
    ring(o, sr, 0, f * 2, 0.08, t60 * 0.3);
    ring(o, sr, 0, f * 5.4, 0.3, 0.18);   // the tine's second mode: the bright "tink"
    ring(o, sr, 0, f * 8.9, 0.1, 0.06);
    burst(o, sr, 0, { dur: 0.004, t60: 0.003, gain: 0.15, R, filters: [['hp', 5000]] });
    filt(o, new BQ(sr, 'peak', 650, 1.2, 3)); // the little wooden box
    return fadeTail(o, sr, 0.3);
  },
};

export const PIANO = {
  peak: -1, var: 1, key: (o) => `${o.midi}|${Math.round((o.vel ?? 0.5) * 4)}`,
  gen(S) {
    const { sr, R, opts } = S, m = opts.midi, f = mtof(m), vel = Math.round((opts.vel ?? 0.5) * 4) / 4;
    const T1 = clamp(9 - (m - 48) * 0.13, 2.2, 9), dur = Math.min(T1 * 0.75, 6);
    const o = S.alloc(dur);
    const B = 0.00035 * Math.pow(2, (m - 60) / 24);
    for (let n = 1; n <= 14; n++) {
      const fn = n * f * Math.sqrt(1 + B * n * n);
      if (fn > sr * 0.45) break;
      const hammer = Math.abs(Math.sin(Math.PI * n * 0.12)) + 0.1;   // struck ~1/8 along the string
      const a = Math.pow(n, -(1.35 - vel * 0.6)) * hammer;
      const t60 = T1 / (1 + 0.35 * (n - 1));
      ring(o, sr, 0, fn * 1.0004, a * 0.5, t60, { attack: 0.002, phase: R.r() });
      ring(o, sr, 0, fn * 0.9996, a * 0.5, t60 * 1.25, { attack: 0.002, phase: R.r() });
    }
    burst(o, sr, 0, { dur: 0.02, t60: 0.015, gain: 0.12 * (0.5 + vel), R, filters: [['lp', 1200 + 2000 * vel, 0.7]] });
    filt(o, new OnePole(sr, 1800 + 6000 * vel));
    return fadeTail(o, sr, 0.5);
  },
};

export const PLUCK = {
  peak: -1, var: 2, key: (o) => `${o.midi}|${Math.round((o.vel ?? 0.5) * 3)}`,
  gen(S) {
    const { sr, R, opts } = S, vel = Math.round((opts.vel ?? 0.5) * 3) / 3;
    const o = pluckString(sr, mtof(opts.midi), { dur: 2.6, bright: 0.3 + 0.3 * vel, damp: 0.5, pick: 0.2, R });
    filt(o, new BQ(sr, 'peak', 110, 1.2, 4), new BQ(sr, 'peak', 230, 1.5, 3), new BQ(sr, 'peak', 2500, 1, -3), new BQ(sr, 'lp', 5000, 0.7));
    return fadeTail(o, sr, 0.8);
  },
};

/** Chase: a distorted sub pulse (felt in the chest, audible on small speakers). */
export const SUB_PULSE = {
  peak: -2, var: 3,
  gen(S) {
    const { sr, R } = S, o = S.alloc(0.5);
    thump(o, sr, 0, { f: 62, to: 38, tau: 0.05, t60: 0.35, amp: 1, noise: 0.25, lp: 400, R });
    ring(o, sr, 0, 124, 0.15, 0.1);
    return saturate(o, 2.2);
  },
};

/** Chase: a junk-metal hit (pipes, lockers, grates struck in the dark). */
export const JUNK_HIT = {
  peak: -3, var: 8,
  gen(S) {
    const { sr, R } = S, o = S.alloc(1.2);
    const ratios = R.pick([RATIOS.sheet, RATIOS.gong, RATIOS.bar, RATIOS.medal]);
    metal(o, sr, 0, { f: R.range(180, 900), amp: 1, t60: R.range(0.3, 1.0), ratios, tilt: 0.8, decayTilt: 0.75, click: 0.8, spread: 0.02, R });
    burst(o, sr, 0, { dur: 0.03, t60: 0.02, gain: 0.5, R, filters: [['bp', R.range(1500, 4000), 1.2]] });
    return o;
  },
};

// ---- graph instruments (inside a note Voice V; dest = V.out) ----------------------------------
const CLAR_WAVE = new WeakMap();
function clarWave(ctx) {
  let w = CLAR_WAVE.get(ctx);
  if (!w) {
    const n = 16, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = k % 2 ? 1 / k : 0.08 / k; // odd harmonics (closed pipe)
    w = ctx.createPeriodicWave(re, im);
    CLAR_WAVE.set(ctx, w);
  }
  return w;
}

/** A gain envelope for sustained notes: attack, slight decay, hold, release. */
function sustainEnv(V, param, dur, peak, { a = 0.03, d = 0.2, s = 0.8, r = 0.08 } = {}) {
  param.setValueAtTime(0, V.T(0));
  param.linearRampToValueAtTime(peak, V.T(a));
  param.setTargetAtTime(peak * s, V.T(a), d / 3);
  param.setValueAtTime(peak * s, V.T(Math.max(a + 0.01, dur)));
  param.linearRampToValueAtTime(0, V.T(dur + r));
  return dur + r;
}

export function cornet(V, midi, dur, vel = 0.7) {
  const f = mtof(midi);
  const o1 = V.osc('sawtooth', f), o2 = V.osc('sawtooth', f, 6);
  const vib = V.osc('sine', 5.3), vg = V.gain(0);
  vib.connect(vg); vg.connect(o1.detune); vg.connect(o2.detune);
  vg.gain.setValueAtTime(0, V.T(0)); vg.gain.linearRampToValueAtTime(dur > 0.6 ? 10 : 3, V.T(Math.min(dur, 0.45)));
  const lp = V.filter('lowpass', 700, 1.2);
  V.env(lp.frequency, [[0, 700], [0.04, 900 + 2400 * vel], [Math.max(0.1, dur), 1500]], false);
  const g = V.gain(0);
  const end = sustainEnv(V, g.gain, dur, 0.5 * vel, { a: 0.035, s: 0.8 });
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(V.out);
  for (const o of [o1, o2, vib]) V.play(o, 0, end + 0.05);
}
export function clarinet(V, midi, dur, vel = 0.5) {
  const o = V.osc(clarWave(V.ctx), mtof(midi));
  const lp = V.filter('lowpass', 2200, 0.7), g = V.gain(0);
  const end = sustainEnv(V, g.gain, dur, 0.45 * vel, { a: 0.05, s: 0.85 });
  V.chain(o, lp, g, V.out);
  V.play(o, 0, end + 0.05);
}
/** Reed wave for the solo clarinet: a fuller odd-harmonic series (the closed bore) with faint evens, so
 *  the breath-driven low-pass below decides how bright it gets. */
const REED_WAVE = new WeakMap();
function reedWave(ctx) {
  let w = REED_WAVE.get(ctx);
  if (!w) {
    const n = 28, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = k % 2 ? 1 / Math.pow(k, 0.85) : 0.045 / k;
    im[3] *= 0.8; // the chalumeau's slightly hollow third
    w = ctx.createPeriodicWave(re, im);
    REED_WAVE.set(ctx, w);
  }
  return w;
}
/**
 * A lone clarinet, played by someone (Ch6: Denise on the bleachers). Unlike the band `clarinet` above
 * (a pad voice inside the 78), this one breathes: a tongued "d" onset (a little chiff and a pitch
 * scoop from below) or a soft slur, brightness that follows the breath, breath noise along the reed,
 * a slow pitch drift and a late, shy vibrato on long notes, and a swell through held notes.
 * opts: slur (no tongue), seed (0..1, per-note variation), rel (release s: short into a slur).
 */
export function clarinetSolo(V, midi, dur, vel = 0.7, { slur = false, seed = 0.5, rel = 0.14 } = {}) {
  const f = mtof(midi);
  const o = V.osc(reedWave(V.ctx), f);
  // pitch: up from below into the note, then a slow drift; long notes waver late (a player, not a synth)
  const det = o.detune;
  det.setValueAtTime(slur ? -7 : -22, V.T(0));
  det.setTargetAtTime(0, V.T(0.005), slur ? 0.025 : 0.035);
  const drift = V.osc('sine', 0.23 + seed * 0.3), dg = V.gain(2.5 + seed * 2);
  drift.connect(dg); dg.connect(det);
  let vib = null;
  if (dur > 0.75) {
    vib = V.osc('sine', 4.4 + seed * 0.8);
    const vg = V.gain(0);
    vg.gain.setValueAtTime(0, V.T(0)); vg.gain.setValueAtTime(0, V.T(dur * 0.4));
    vg.gain.linearRampToValueAtTime(6 + seed * 4, V.T(dur * 0.95));
    vib.connect(vg); vg.connect(det);
  }
  // breath-driven brightness and the bore's resonance
  const a = slur ? 0.07 : 0.045, peak = 0.42 * vel;
  const lp = V.filter('lowpass', 700, 0.9);
  const top = 1300 + 2200 * vel;
  V.env(lp.frequency, [[0, 650], [a * 1.6, top], [Math.max(a * 1.6 + 0.01, dur * 0.35), top * 0.82], [Math.max(a * 2, dur * 0.7), top * (dur > 0.75 ? 0.95 : 0.85)], [dur + rel, 700]], true);
  const body = V.filter('peaking', 1450, 1.6, 3.5);
  const g = V.gain(0);
  g.gain.setValueAtTime(0, V.T(0));
  g.gain.linearRampToValueAtTime(peak, V.T(a));
  g.gain.setTargetAtTime(peak * 0.8, V.T(a), 0.09);
  if (dur > 0.75) { g.gain.setValueAtTime(peak * 0.8, V.T(dur * 0.45)); g.gain.linearRampToValueAtTime(peak * 0.92, V.T(dur * 0.8)); }
  g.gain.setValueAtTime(peak * (dur > 0.75 ? 0.92 : 0.8), V.T(Math.max(a + 0.02, dur)));
  g.gain.linearRampToValueAtTime(0, V.T(dur + rel));
  V.chain(o, lp, body, g, V.out);
  // breath along the reed (follows the tone) + the tongue's chiff
  const n = V.noise('pink'), nb = V.filter('bandpass', 2900 + seed * 600, 0.8), ng = V.gain(0);
  const breath = 0.05 * vel;
  ng.gain.setValueAtTime(0, V.T(0));
  ng.gain.linearRampToValueAtTime(slur ? breath * 0.8 : breath * 2.6, V.T(slur ? a : 0.012));
  ng.gain.setTargetAtTime(breath * 0.55, V.T(slur ? a : 0.02), 0.05);
  ng.gain.setValueAtTime(breath * 0.55, V.T(Math.max(a + 0.02, dur)));
  ng.gain.linearRampToValueAtTime(0, V.T(dur + rel * 0.85));
  V.chain(n, nb, ng, V.out);
  const end = dur + rel + 0.02;
  for (const s of [o, drift, n, ...(vib ? [vib] : [])]) V.play(s, 0, end);
}
export function tuba(V, midi, dur, vel = 0.7) {
  const o = V.osc('sawtooth', mtof(midi)), lp = V.filter('lowpass', 380, 1.2), g = V.gain(0);
  const end = sustainEnv(V, g.gain, dur, 0.7 * vel, { a: 0.04, d: 0.3, s: 0.6, r: 0.1 });
  V.chain(o, lp, g, V.out);
  V.play(o, 0, end + 0.05);
}
export function horn(V, midis, dur, vel = 0.4) {
  const lp = V.filter('lowpass', 1200, 0.8), g = V.gain(0);
  const end = sustainEnv(V, g.gain, dur, 0.22 * vel, { a: 0.02, d: 0.1, s: 0.7, r: 0.06 });
  lp.connect(g); g.connect(V.out);
  for (const m of midis) { const o = V.osc('triangle', mtof(m)), o2 = V.osc('sawtooth', mtof(m), -5), og = V.gain(0.35); o.connect(lp); o2.connect(og); og.connect(lp); V.play(o, 0, end + 0.05); V.play(o2, 0, end + 0.05); }
}
/** Soft pad chord (credits / register): detuned triangles + saws through a low-pass. */
export function pad(V, midis, dur, vel = 0.3, { lp = 1100, a = 1.2, r = 2 } = {}) {
  const f = V.filter('lowpass', lp, 0.6), g = V.gain(0);
  g.gain.setValueAtTime(0, V.T(0)); g.gain.linearRampToValueAtTime(0.12 * vel, V.T(a));
  g.gain.setValueAtTime(0.12 * vel, V.T(Math.max(a, dur))); g.gain.linearRampToValueAtTime(0, V.T(dur + r));
  f.connect(g); g.connect(V.out);
  for (const m of midis) for (const d of [-7, 7]) { const o = V.osc(d < 0 ? 'triangle' : 'sawtooth', mtof(m), d); const og = V.gain(d < 0 ? 1 : 0.25); o.connect(og); og.connect(f); V.play(o, 0, dur + r + 0.05); }
}
