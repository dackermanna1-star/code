// Level 39 (Concrete Forest): hollow air under slabs, the buzz of sodium lamps, and the power
// failing: a relay, a fall in pitch, then a long nothing.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

defineBed('tone_lv39_concrete', { L: 12, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 110], ['lp', 110]], sr, true);
  const sw = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) lo[i] *= 0.7 + 0.3 * sw(i / sr);
  mixRms(out, lo, 0.4);
  // the big hollow resonance of everything made of the same stuff
  const hol = white(n, r); filter(hol, [['bp', 230, 6], ['bp', 340, 8]], sr, true);
  const sw2 = loopLfo(r, L, [2, 3]);
  for (let i = 0; i < n; i++) hol[i] *= Math.max(0, 0.3 + 0.7 * sw2(i / sr));
  mixRms(out, hol, 0.09);
  oscAdd(out, wavetable([[1, 1], [2, 0.3]]), cyc(100, L), 0.02, sr);
  const air = white(n, r); filter(air, [['bp', 1800, 0.6], ['lp', 3000]], sr, true);
  mixRms(out, air, 0.025);
} });

// sodium lamp ballast: 100 Hz buzz and a thin tick
defineLoop('lv39_lamp', { L: 4, sr: 11025, norm: ['rms', 0.16], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const tab = wavetable([[1, 1], [2, 0.6], [3, 0.35], [4, 0.2], [6, 0.1]]);
  oscAdd(out, tab, cyc(100, L), 0.5, sr);
  oscAdd(out, tab, cyc(50, L), 0.18, sr, 0.2);
  const w = white(n, r); filter(w, [['bp', 1500, 1], ['lp', 3000]], sr, true);
  const f = cyc(100, L);
  for (let i = 0; i < n; i++) w[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 6);
  mixRms(out, w, rmsOf(out) * 0.18);
} });

// everything switched off at once: a big relay, then the hum falling away
defineShot('lv39_off', { n: 1, dur: 2.4, sr: 22050, peak: 0.9, gen(S) {
  const { out, r, sr } = S, n = out.length;
  S.thump(0.02, 0.9, 90, 40, 0.16);
  S.click(0.01, 0.6, 1200, 0.004);
  S.noise(0.02, 0.4, 0.002, 0.07, [['bp', 600, 1.2], ['lp', 2400]]);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, f = 100 * Math.exp(-t * 2.2) + 14;
    ph += (TAU * f) / sr;
    out[i] += (Math.sin(ph) * 0.4 + Math.sin(ph * 2.01) * 0.2) * Math.exp(-t * 1.6) * (t > 0.03 ? 1 : 0);
  }
  const lo = white(n, r); filter(lo, [['lp', 200]], sr);
  mixRms(out, lo, 0.06);
  mulInto(out, envelope(n, sr, [[0, 1], [1.4, 0.7], [2.4, 0]]));
} });
// and back on: a clack, a rising hum with a false start
defineShot('lv39_on', { n: 1, dur: 2.0, sr: 22050, peak: 0.85, gen(S) {
  const { out, r, sr } = S, n = out.length;
  S.click(0.02, 0.5, 1500, 0.004);
  S.thump(0.03, 0.6, 80, 50, 0.1);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, f = 40 + 62 * (1 - Math.exp(-t * 3));
    ph += (TAU * f) / sr;
    out[i] += (Math.sin(ph) * 0.35 + Math.sin(ph * 2) * 0.18 + Math.sin(ph * 3) * 0.1);
  }
  mulInto(out, envelope(n, sr, [[0, 0], [0.04, 0.9], [0.2, 0.2], [0.34, 0.8], [1.0, 0.6], [2.0, 0]]));
  const w = white(n, r); filter(w, [['bp', 2400, 1]], sr);
  mixRms(out, w, 0.03);
  S.noise(0.04, 0.25, 0.002, 0.05, [['bp', 800, 1.2]]);
} });
