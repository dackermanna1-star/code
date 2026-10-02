// Sounds of the halls: 15 (futuristic halls) and 23 (the elevator).
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable, wowLoop, SR_LO } from '../dsp.js';

const sine = wavetable([[1, 1]]);

// ---- 15: a clean tonal whine of electronics, a hair of air
defineLoop('g05_ion', { L: 4, norm: ['rms', 0.14], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, sine, cyc(1760, L), 0.2, sr);
  oscAdd(out, sine, cyc(1762, L), 0.15, sr, 0.3);
  oscAdd(out, sine, cyc(220, L), 0.25, sr, 0.1);
  const f = cyc(0.5, L);
  for (let i = 0; i < n; i++) out[i] *= 0.8 + 0.2 * Math.sin((TAU * f * i) / sr);
  const air = white(n, r); filter(air, [['bp', 5200, 2], ['lp', 8000]], sr, true);
  mixRms(out, air, rmsOf(out) * 0.04);
} });

// a slightly distorted chime: a bell run through a bit-crusher and a ring modulator, a second
// voice drifting out of tune
defineShot('g05_dchime', { n: 4, dur: 4.2, sr: SR_LO * 2, peak: 0.8, gen(S, k) {
  const { out, sr } = S, n = out.length;
  const seqs = [[784, 988, 1175], [880, 660, 988, 1319], [1047, 784, 1047], [698, 880, 1047, 880]];
  const notes = seqs[k];
  const bell = (f) => [[f, 1.1, 0.5], [f * 2.0, 0.5, 0.18], [f * 3.01, 0.35, 0.08], [f * 5.2, 0.15, 0.03]];
  notes.forEach((f, i) => {
    S.ring(0.05 + i * 0.42, bell(f), 1 - i * 0.08);
    S.ring(0.07 + i * 0.42, bell(f * (1.012 + 0.004 * i)), 0.4);
  });
  const lv = 24 + k * 6;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = out[i] * (0.72 + 0.28 * Math.sin(TAU * (96 + k * 17) * t));          // ring modulation
    v = Math.round(v * lv) / lv;                                                // crushed
    out[i] = v;
  }
  filter(out, [['hp', 300], ['lp', 5200]], sr);
} });

// ---- 23: the elevator
// the floor chime: bright and two-toned when the car arrives, low and muffled when it will not open
defineShot('g05_ding', { n: 2, dur: 3.4, sr: SR_LO * 2, peak: 0.8, gen(S, k) {
  const bell = (f) => [[f, 1.3, 0.5], [f * 2.0, 0.6, 0.16], [f * 2.76, 0.35, 0.07], [f * 4.07, 0.2, 0.04]];
  if (k === 0) {
    S.noise(0.02, 0.04, 0.001, 0.004, [['bp', 3000, 1]]).ring(0.02, bell(659.3), 1).ring(0.52, bell(523.3), 0.95);
  } else {
    S.ring(0.02, bell(329.6), 1).ring(0.6, bell(261.6), 0.85);
    S.thump(1.5, 0.35, 70, 40, 0.2).noise(1.5, 0.12, 0.01, 0.3, [['lp', 200]], 0.5);
    S.filter([['lp', 1100]]);
  }
} });
// doors sliding on their rails
defineShot('g05_door_slide', { n: 2, dur: 2.6, sr: SR_LO * 2, peak: 0.8, gen(S, k) {
  S.tone(0.05, 0.1, { f0: 110 + k * 15, f1: 170 + k * 20, glide: 0.9, att: 0.15, dec: 0.9, dur: 1.2, shape: 'saw' });
  S.noise(0.05, 0.28, 0.25, 1.0, [['bp', 520, 1.2], ['lp', 1500]], 1.3);
  S.noise(0.2, 0.1, 0.3, 0.8, [['bp', 2400, 3]], 1.0);
  S.click(1.35, 0.5, 1200, 0.004).thump(1.35, 0.32, 110, 60, 0.08);
  S.noise(1.38, 0.1, 0.002, 0.2, [['lp', 400]], 0.4);
  S.filter([['lp', 3600]]);
} });
// the cable and the motor, somewhere above
defineLoop('g05_car_hum', { L: 4, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 0.6], [2, 1], [3, 0.3], [4, 0.2]]), cyc(55, L), 0.4, sr);
  oscAdd(out, sine, cyc(110.5, L), 0.15, sr, 0.2);
  const lo = white(n, r); filter(lo, [['lp', 140], ['lp', 140]], sr, true);
  mixRms(out, lo, 0.35);
  const w = white(n, r); filter(w, [['bp', 900, 3]], sr, true);
  const f = cyc(1.5, L);
  for (let i = 0; i < n; i++) w[i] *= 0.6 + 0.4 * Math.sin((TAU * f * i) / sr);
  mixRms(out, w, 0.04);
} });
// lounge music through a speaker that has seen better years: slow chords, a little wow
defineLoop('g05_muzak', { L: 12, norm: ['peak', 0.45], gen(S, L) {
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const ep = (f) => [[f, 1.0, 0.5], [f * 2.0, 0.5, 0.22], [f * 3.99, 0.18, 0.08]];
  const chords = [[57, 61, 64], [53, 57, 60], [50, 54, 57]];
  chords.forEach((ch, c) => {
    ch.forEach((m, k) => S.ring(c * 4 + k * 0.7, ep(hz(m + 12)), 0.7 - k * 0.1));
    S.ring(c * 4 + 2.6, ep(hz(ch[1] + 24)), 0.34);
  });
  S.filter([['lp', 2600], ['hp', 200]]);
  S.out.set(wowLoop(S.out, S.sr, 0.005, 2));
} });
// a house behind a door that will not open: a clock, a refrigerator, a music box a long way in
defineShot('g05_home', { n: 1, dur: 9, sr: SR_LO * 2, peak: 0.7, gen(S) {
  const { out, r, sr } = S, n = out.length;
  const hum = white(n, r); filter(hum, [['lp', 150], ['lp', 150]], sr);
  mixRms(out, hum, 0.12);
  oscAdd(out, sine, 100, 0.03, sr);
  mulInto(out, envelope(n, sr, [[0, 0], [1, 1], [8, 1], [9, 0]]));
  for (let t = 0.5; t < 8.6; t += 1) {
    S.click(t, 0.35, 1800, 0.003).ring(t, [[1500, 0.03, 0.2], [2300, 0.02, 0.1]]);
    S.click(t + 0.5, 0.25, 1200, 0.003).ring(t + 0.5, [[1100, 0.03, 0.15]]);
  }
  const mb = [[1.2, 76], [1.9, 72], [2.6, 69], [3.3, 71], [4.0, 72], [4.7, 76], [5.4, 74], [6.8, 72]];
  for (const [t, m] of mb) {
    const f = 440 * Math.pow(2, (m - 69) / 12);
    S.ring(t, [[f, 1.2, 0.35], [f * 2.01, 0.4, 0.07], [f * 5.4, 0.1, 0.03]]);
  }
  S.filter([['lp', 3000], ['hp', 60]]);
} });
