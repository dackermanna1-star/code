// Level 2 (Pipe Dreams): boilers, steam, water in pipes, a hammer a long way off.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// the room tone: a boiler's low breathing, steam in the walls, pipes ringing at their own pitch
defineBed('tone_g02_pipes', { L: 12, sr: 11025, norm: ['rms', 0.2], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const rum = white(n, r); filter(rum, [['lp', 120], ['lp', 120]], sr, true); yield;
  const sw = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) rum[i] *= 0.55 + 0.45 * sw(i / sr);
  mixRms(out, rum, 0.5); yield;
  const hiss = white(n, r); filter(hiss, [['bp', 2800, 0.5], ['lp', 5200]], sr, true); yield;
  const f1 = cyc(0.17, L), f2 = cyc(0.31, L);
  for (let i = 0; i < n; i++) hiss[i] *= 0.4 + 0.3 * Math.sin((TAU * f1 * i) / sr) + 0.3 * Math.sin((TAU * f2 * i) / sr + 1.3);
  mixRms(out, hiss, rmsOf(out) * 0.35); yield;
  for (const [f, g] of [[165, 0.04], [248, 0.03], [392, 0.02]]) {
    const ring = white(n, r); filter(ring, [['bp', f, 28]], sr, true);
    mixRms(out, ring, rmsOf(out) * g * 3);
  } yield;
  oscAdd(out, wavetable([[1, 1], [2, 0.3]]), cyc(41, L), 0.1, sr); yield;
  for (let j = 0; j < 5; j++) {
    const t = r.range(0, L);
    S.click(t, 0.12, 1800, 0.002).ring(t, [[r.range(900, 2200), 0.03, 0.1], [r.range(300, 600), 0.05, 0.08]]);
  }
} });

// a vent hissing: the pressure comes and goes
defineLoop('g02_steam', { L: 4, norm: ['rms', 0.2], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const a = white(n, r); filter(a, [['hp', 1800], ['lp', 8000]], sr, true); yield;
  const b = white(n, r); filter(b, [['bp', 700, 0.6]], sr, true); yield;
  const f = cyc(0.5, L), g = cyc(0.25, L);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const e = 0.7 + 0.2 * Math.sin(TAU * f * t) + 0.1 * Math.sin(TAU * g * t + 2);
    a[i] *= e; b[i] *= e * e;
  }
  mixRms(out, a, 0.2); mixRms(out, b, 0.08); yield;
  for (let j = 0; j < 3; j++) S.click(r.range(0, L), 0.08, 2500, 0.001);
} });

// a burner and a furnace draught
defineLoop('g02_boiler', { L: 4, sr: 11025, norm: ['rms', 0.22], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const roar = white(n, r); filter(roar, [['lp', 260], ['bp', 120, 0.6]], sr, true); yield;
  const lf = loopLfo(r, L, [2, 5, 9]);
  for (let i = 0; i < n; i++) roar[i] *= 0.75 + 0.35 * lf(i / sr);
  mixRms(out, roar, 0.2); yield;
  oscAdd(out, wavetable([[1, 1], [2, 0.5, 1], [3, 0.2, 2]]), cyc(36, L), 0.2, sr); yield;
  const fl = white(n, r); filter(fl, [['bp', 900, 1.2]], sr, true);
  const fr = cyc(7, L);
  for (let i = 0; i < n; i++) fl[i] *= Math.pow(0.5 + 0.5 * Math.sin(TAU * fr * i / sr), 4);
  mixRms(out, fl, rmsOf(out) * 0.2); yield;
  for (let j = 0; j < 6; j++) S.click(r.range(0, L), 0.15, 1400, 0.004);
} });

// water rushing through a pipe in the wall
defineLoop('g02_pipeflow', { L: 6, sr: 11025, norm: ['rms', 0.18], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const w = white(n, r); filter(w, [['bp', 520, 0.8], ['lp', 2400]], sr, true); yield;
  const lf = loopLfo(r, L, [2, 3, 5, 8]);
  for (let i = 0; i < n; i++) w[i] *= 0.65 + 0.35 * lf(i / sr) * 1.6;
  mixRms(out, w, 0.2); yield;
  const low = white(n, r); filter(low, [['lp', 160]], sr, true);
  mixRms(out, low, 0.12); yield;
  for (const [f, g] of [[310, 0.05], [470, 0.04]]) {
    const ring = white(n, r); filter(ring, [['bp', f, 20]], sr, true);
    mixRms(out, ring, rmsOf(out) * g * 4);
  } yield;
  for (let j = 0; j < 14; j++) S.bubble(r.range(0, L), r.range(0.04, 0.1), r.range(150, 500), r.range(0.02, 0.05), 0.2);
} });

// someone is hitting a very large pipe, a long way off: a few blows and the echo coming back
defineShot('g02_bang', { n: 3, dur: 4.5, sr: 11025, peak: 0.9, gen(S, k) {
  const r = S.r, f0 = r.range(70, 105) * (1 + k * 0.12);
  const blows = 1 + k;
  let t = 0.05;
  for (let b = 0; b < blows; b++) {
    const g = 1 - b * 0.12;
    for (const [d, gg] of [[0, 1], [0.37, 0.4], [0.81, 0.22], [1.4, 0.12]]) {
      const tt = t + d;
      S.noise(tt, 0.5 * g * gg, 0.0005, 0.012, [['lp', 900]]);
      S.ring(tt, [[f0, 0.9, 0.5], [f0 * 2.31, 0.6, 0.3], [f0 * 4.1, 0.4, 0.2], [f0 * 6.7, 0.25, 0.12], [f0 * 9.8, 0.15, 0.07]], g * gg);
    }
    t += r.range(0.55, 1.1);
  }
  S.filter([['lp', 2400]]);
} });

// a joint lets go: a cloud of steam
defineShot('g02_steam_blast', { n: 2, dur: 4.2, peak: 0.85, gen(S, k) {
  const r = S.r;
  S.thump(0.02, 0.6, 90, 45, 0.18);
  S.noise(0.03, 0.9, 0.04, 0.6 + k * 0.2, [['hp', 1400], ['lp', 9000]], 3.8);
  S.noise(0.03, 0.5, 0.12, 1.2, [['bp', 600, 0.5]], 3.8);
  S.ring(0.05, [[r.range(160, 220), 0.4, 0.2]]);
  S.grit(0.1, 0.12, 2.5, 600, 0.9, [['hp', 3000]]);
} });

// metal under strain somewhere in the structure: a slow groan
defineShot('g02_groan', { n: 2, dur: 6, sr: 11025, peak: 0.85, gen(S, k) {
  const { out, r, sr } = S, n = out.length;
  const f0 = 52 + k * 11;
  let ph = 0, ph2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = f0 * (1 + 0.25 * Math.sin(t * 0.9 + k) + 0.08 * Math.sin(t * 3.1));
    ph += (TAU * f) / sr; ph2 += (TAU * f * 1.503) / sr;
    out[i] = Math.sin(ph) * 0.5 + Math.sin(ph * 2.02) * 0.3 + Math.sin(ph2) * 0.25 + Math.sin(ph * 3.05) * 0.12;
  }
  const grit = white(n, r); filter(grit, [['bp', 340, 5]], sr);
  mixRms(out, grit, rmsOf(out) * 0.2);
  mulInto(out, envelope(n, sr, [[0, 0], [1.2, 0.5], [2.8, 1], [4.4, 0.6], [6, 0]]));
  filter(out, [['lp', 700]], sr);
} });
