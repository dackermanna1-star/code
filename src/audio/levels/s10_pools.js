// Sounds of the three pools: 50 (night, open air), 90 (dust, a glass hall) and 78 (underground).
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

// ------------------------------------------------------------------ 78 THE UNDERGROUND POOL
// sodium lamp ballasts buzzing at double mains frequency, pumps far off, a vast hall of tile and water
defineBed('tone_lv78', { L: 16, sr: SR_LO, norm: ['rms', 0.17], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const tab = wavetable([[1, 1], [2, 0.5, 1], [3, 0.35, 0.3], [4, 0.22, 2], [6, 0.12, 1.4]]);
  oscAdd(out, tab, cyc(100, L), 0.35, sr); oscAdd(out, tab, cyc(100.5, L), 0.2, sr, 0.4); yield;
  const rum = white(n, r); yield* filterG(rum, [['lp', 75], ['lp', 75]], sr, true); yield;
  const sw = loopLfo(r, L, [1, 3]);
  for (let i = 0; i < n; i++) rum[i] *= 0.6 + 0.4 * sw(i / sr);
  mixRms(out, rum, rmsOf(out) * 0.9);
  const hall = white(n, r); yield* filterG(hall, [['bp', 900, 0.4], ['lp', 2200]], sr, true); yield;
  mixRms(out, hall, rmsOf(out) * 0.12);
  const f = cyc(0.5, L);
  for (let i = 0; i < n; i++) out[i] *= 1 + 0.07 * Math.sin((TAU * f * i) / sr);
} });

// a pump running in a dry sump: slow thrum, a little water
defineLoop('lv78_pump', { L: 4, sr: SR_LO, norm: ['rms', 0.2], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 0.6], [2, 0.4, 1], [3, 0.2, 2]]), cyc(46, L), 1, sr); yield;
  const f = cyc(2, L);
  for (let i = 0; i < n; i++) out[i] *= 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 2);
  const sl = white(n, r); yield* filterG(sl, [['bp', 380, 0.7], ['lp', 900]], sr, true); yield;
  for (let i = 0; i < n; i++) sl[i] *= 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr + 2), 2);
  mixRms(out, sl, rmsOf(out) * 0.5);
} });

// heavy drips from a low ceiling into black water, answered by the tiled hall
defineLoop('lv78_drip', { L: 10, sr: SR_LO, norm: ['peak', 0.65], gen(S) {
  const r = S.r;
  for (const t of [0.4, 2.7, 5.3, 8.1]) {
    const f = r.range(260, 480);
    for (let e = 0; e < 4; e++) S.bubble(t + e * 0.42, 0.6 / (1 + e * 1.6), f * (1 - e * 0.05), r.range(0.03, 0.05), 0.4).ring(t + e * 0.42, [[r.range(180, 240), 0.4, 0.05 / (1 + e)], [r.range(420, 560), 0.3, 0.03 / (1 + e)]]);
  }
} });

// water draining somewhere far below
defineShot('lv78_gurgle', { n: 2, dur: 4, sr: SR_LO, peak: 0.7, gen(S, k) {
  const r = S.r;
  S.noise(0.1, 0.4, 0.8, 1.6, [['bp', 300 + k * 60, 1], ['lp', 800]], 3.4);
  for (let j = 0; j < 14; j++) S.bubble(0.4 + j * r.range(0.12, 0.26), r.range(0.1, 0.4), r.range(160, 520), r.range(0.03, 0.08), 0.3);
  S.tone(0.3, 0.12, { f0: 90, f1: 55, glide: 1.4, att: 0.4, dec: 1.2, dur: 3, shape: 'sin' });
} });
void envelope; void mulInto; void mixInto;
