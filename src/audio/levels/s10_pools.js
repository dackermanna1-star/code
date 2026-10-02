// Sounds of the two hotel pools: 50 (night, open air) and 90 (dust, a glass hall).
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, SR_LO, white, filterG, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable, wowLoop, mixInto } from '../dsp.js';

// ------------------------------------------------------------------ 50 THE HOTEL POOL
// a plant room somewhere under the courtyard: a low pump hum, air being moved, a thin whine
defineBed('tone_lv50', { L: 12, sr: SR_LO, norm: ['rms', 0.15], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const tab = wavetable([[1, 1], [2, 0.3, 1], [3, 0.12, 2]]);
  oscAdd(out, tab, cyc(58, L), 0.5, sr); oscAdd(out, tab, cyc(116.5, L), 0.16, sr, 0.3); yield;
  const air = white(n, r); yield* filterG(air, [['bp', 420, 0.5], ['lp', 900]], sr, true); yield;
  const sw = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) air[i] *= 0.6 + 0.4 * sw(i / sr);
  mixRms(out, air, rmsOf(out) * 0.8); yield;
  oscAdd(out, wavetable([[1, 1]]), cyc(1710, L), (t) => 0.004 * (1 + 0.5 * Math.sin((TAU * t) / L)), sr); yield;
  const lap = white(n, r); yield* filterG(lap, [['bp', 650, 0.7], ['lp', 1500]], sr, true); yield;
  const f = cyc(0.25, L);
  for (let i = 0; i < n; i++) lap[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr + 1), 4);
  mixRms(out, lap, rmsOf(out) * 0.2);
} });

// water running along the overflow gutter at the rim
defineLoop('lv50_gutter', { L: 6, sr: SR_LO, norm: ['rms', 0.16], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const run = white(n, r); yield* filterG(run, [['bp', 1300, 0.5], ['lp', 3000]], sr, true); yield;
  const lf = loopLfo(r, L, [3, 5, 8]);
  for (let i = 0; i < n; i++) run[i] *= 0.5 + 0.5 * Math.abs(lf(i / sr));
  mixRms(out, run, 0.2);
  for (let k = 0; k < 16; k++) S.bubble(r.range(0, L), 0.14, r.range(650, 1800), r.range(0.006, 0.02), 0.4);
  yield;
} });

// soft instrumental lounge music from a ceiling speaker, slowed down a little by tired tape
defineLoop('lv50_muzak', { L: 24, sr: SR_LO, norm: ['rms', 0.12], *gen(S) {
  const r = S.r, sr = S.sr;
  const chords = [[261.6, 329.6, 392.0, 493.9], [220, 261.6, 329.6, 392.0], [293.7, 349.2, 440, 523.3], [196, 246.9, 293.7, 349.2]];
  const pat = [0, 1, 2, 3, 2, 1, 2, 3];
  for (let c = 0; c < chords.length; c++) {
    const ch = chords[c], t0 = c * 6;
    for (let k = 0; k < 8; k++) {
      const f = ch[pat[k]] * (k > 5 ? 2 : 1);
      S.tone(t0 + k * 0.75, 0.22, { f0: f, att: 0.006, dec: 0.5, dur: 1.6, shape: 'sin', h2: 0.28, h3: 0.08 });
    }
    for (const f of [ch[0], ch[2]]) S.tone(t0, 0.07, { f0: f / 2, att: 1.4, dec: 2.2, dur: 5.2, shape: 'sin', h2: 0.1 });
    yield;
  }
  S.filter([['lp', 1500], ['hp', 120]]);
  S.out.set(wowLoop(S.out, sr, 0.004, 3));
} });

// a wave knocks against the gutter and runs away along it
defineShot('lv50_slosh', { n: 3, dur: 2.6, sr: SR_LO, peak: 0.8, gen(S, k) {
  const r = S.r;
  S.noise(0.05, 0.7, 0.25, 0.5, [['bp', r.range(300, 520), 0.8], ['lp', 1400]], 1.8);
  S.thump(0.3, 0.5, 92, 46, 0.25);
  for (let j = 0; j < 4 + k; j++) S.bubble(0.5 + j * r.range(0.1, 0.25), r.range(0.1, 0.25), r.range(300, 900), r.range(0.02, 0.05), 0.3);
} });

// ------------------------------------------------------------------ 90 THE ABANDONED HOTEL POOL
// a glass hall full of dust: air standing still, a breath of wind across a broken pane, a roof frame ticking
defineBed('tone_lv90', { L: 14, sr: SR_LO, norm: ['rms', 0.12], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const rum = white(n, r); yield* filterG(rum, [['lp', 90], ['lp', 90]], sr, true); yield;
  const sw = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) rum[i] *= 0.7 + 0.3 * sw(i / sr);
  mixRms(out, rum, 0.18);
  const wind = white(n, r); yield* filterG(wind, [['bp', 700, 0.8], ['lp', 1400]], sr, true); yield;
  const wl = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) wind[i] *= 0.1 + 0.9 * Math.pow(0.5 + 0.5 * wl(i / sr), 2);
  mixRms(out, wind, 0.05);
  const f = cyc(1480, L), fl = cyc(0.5, L);
  oscAdd(out, wavetable([[1, 1]]), f, (t) => 0.004 * Math.pow(0.5 + 0.5 * Math.sin(TAU * fl * t + 0.8), 3), sr); yield;
  for (let k = 0; k < 5; k++) {
    const t = r.range(0.2, L - 0.2);
    S.click(t, 0.04, 1800, 0.002).ring(t, [[r.range(1300, 2200), 0.03, 0.05], [r.range(2500, 3800), 0.015, 0.03]]);
  }
} });

// single drips falling a long way into still water, and the hall answering
defineLoop('lv90_drip', { L: 9, sr: SR_LO, norm: ['peak', 0.6], gen(S) {
  const r = S.r;
  for (const t of [0.6, 3.8, 6.4]) {
    const f = r.range(520, 880);
    for (let e = 0; e < 3; e++) S.bubble(t + e * 0.31, 0.5 / (1 + e * 1.4), f * (1 - e * 0.06), r.range(0.02, 0.035), 0.5).ring(t + e * 0.31, [[r.range(240, 330), 0.25, 0.04 / (1 + e)]]);
  }
} });

// the surface of the water stirs although nothing touches it: one soft low swell
defineShot('lv90_ripple', { n: 3, dur: 3.4, sr: SR_LO, peak: 0.75, gen(S, k) {
  const r = S.r;
  S.bubble(0.1, 0.5, r.range(190, 260), r.range(0.1, 0.16), 0.6);
  S.noise(0.15, 0.25, 0.5, 0.9, [['bp', 400, 0.7], ['lp', 900]], 2.4);
  S.tone(0.2, 0.16, { f0: 150 + k * 12, f1: 118, glide: 0.8, att: 0.12, dec: 0.8, dur: 2, shape: 'sin' });
  for (let j = 0; j < 3; j++) S.bubble(0.9 + j * r.range(0.35, 0.6), 0.16, r.range(300, 520), r.range(0.03, 0.07), 0.3);
} });

// a flake of dirty glass lets go of the roof frame and tinkles down
defineShot('lv90_tink', { n: 3, dur: 1.6, peak: 0.6, gen(S) {
  const r = S.r;
  let t = 0.02;
  for (let k = 0; k < 5; k++) { S.ring(t, [[r.range(3400, 5200), 0.05, 0.2], [r.range(5600, 7600), 0.03, 0.1]]); S.click(t, 0.2, 3000, 0.002); t += r.range(0.05, 0.25) * (1 + k * 0.5); }
} });

void envelope; void mulInto; void mixInto;
