// Sounds of the parking levels: 29 (underground), 73 (multi-storey at dusk), 82 (open lot).
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable, SR_LO } from '../dsp.js';

const sine = wavetable([[1, 1]]);

// ---- 29: low ventilation rumble, mains hum, a thread of air
defineBed('tone_g05_garage', { L: 8, sr: SR_LO, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 110], ['lp', 110]], sr, true);
  const sw = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) lo[i] *= 0.75 + 0.25 * sw(i / sr);
  mixRms(out, lo, 0.5);
  oscAdd(out, wavetable([[1, 0.4], [2, 1], [3, 0.3], [4, 0.2]]), cyc(60, L), 0.05, sr);
  const air = white(n, r); filter(air, [['bp', 700, 0.7], ['lp', 1700]], sr, true);
  mixRms(out, air, 0.05);
} });

// a big fan far away: blade pass over a broad whoosh
defineLoop('g05_vent', { L: 6, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const w = white(n, r); filter(w, [['bp', 380, 0.6], ['lp', 900]], sr, true);
  const f = cyc(3, L);
  for (let i = 0; i < n; i++) w[i] *= 0.65 + 0.35 * Math.sin((TAU * f * i) / sr);
  mixRms(out, w, 0.3);
  const lo = white(n, r); filter(lo, [['lp', 90], ['lp', 90]], sr, true);
  mixRms(out, lo, 0.35);
  oscAdd(out, sine, cyc(48, L), 0.08, sr);
} });

// a relay clacks and a lamp catches
defineShot('g05_relay', { n: 2, dur: 1.2, peak: 0.8, gen(S, k) {
  const r = S.r;
  S.click(0, 0.7, 1400, 0.004).thump(0, 0.35, 130, 62, 0.05).ring(0.004, [[2300 + k * 300, 0.03, 0.14], [3900, 0.02, 0.08]]);
  S.click(0.19 + k * 0.03, 0.4, 1800, 0.003);
  S.tone(0.2, 0.05, { f0: 120, att: 0.15, dec: 0.6, dur: 0.9, shape: 'sq' });
  S.noise(0.2, 0.05, 0.2, 0.7, [['bp', 3000, 2]], 0.9);
  S.filter([['lp', 5200]]);
  void r;
} });

// concrete or a steel beam shifting somewhere above
defineShot('g05_creak', { n: 3, dur: 3.2, sr: SR_LO, peak: 0.8, gen(S, k) {
  const { out, sr, r } = S, n = out.length;
  const f0 = 70 + k * 23;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = f0 * (1 + 0.25 * Math.sin(t * 2.1 + k) + 0.08 * Math.sin(t * 9));
    ph += (TAU * f) / sr;
    out[i] = (Math.sin(ph) + 0.5 * Math.sin(2 * ph + 1) + 0.3 * Math.sin(3.1 * ph)) * 0.4;
  }
  const g = white(n, r); filter(g, [['bp', 260 + k * 60, 5]], sr);
  mixRms(out, g, rmsOf(out) * 0.4);
  mulInto(out, envelope(n, sr, [[0, 0], [0.5, 0.5], [1.4, 1], [2.3, 0.4], [3.2, 0]]));
  filter(out, [['lp', 700]], sr);
} });

// something heavy settles a long way off
defineShot('g05_far_clunk', { n: 3, dur: 3.0, sr: SR_LO, peak: 0.8, gen(S, k) {
  S.thump(0, 0.8, 95 - k * 10, 42, 0.14).noise(0, 0.5, 0.002, 0.2, [['lp', 300 + k * 60]], 0.6);
  S.ring(0.01, [[180 + k * 30, 0.5, 0.3], [260 + k * 21, 0.35, 0.2], [440, 0.2, 0.1]]);
  S.noise(0.5, 0.15, 0.1, 1.4, [['lp', 200]], 2);
  S.filter([['lp', 900]]);
} });

// an engine cooling: irregular pings of contracting metal
defineLoop('g05_tick', { L: 8, norm: ['peak', 0.5], gen(S, L) {
  const r = S.r;
  let t = 0.3;
  while (t < L - 0.4) {
    const f = r.range(1500, 3800);
    S.click(t, 0.3, 2400, 0.002).ring(t, [[f, 0.045, 0.4], [f * 1.51, 0.03, 0.18]], r.range(0.6, 1));
    t += r.chance(0.25) ? r.range(0.12, 0.3) : r.range(0.6, 1.9);
  }
  S.filter([['lp', 6000]]);
} });

// ---- 73: wind through the open sides, a faint city a long way down
defineBed('tone_g05_dusk', { L: 12, sr: SR_LO, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const gust = loopLfo(r, L, [1, 2, 3, 5]);
  const a = white(n, r); filter(a, [['lp', 420], ['lp', 420]], sr, true);
  const b = white(n, r); filter(b, [['bp', 900, 3]], sr, true);
  for (let i = 0; i < n; i++) { const g = Math.max(0.12, 0.6 + 0.5 * gust(i / sr)); a[i] *= g; b[i] *= g * g; }
  mixRms(out, a, 0.35); mixRms(out, b, 0.05);
  const far = white(n, r); filter(far, [['lp', 70], ['lp', 70]], sr, true);
  mixRms(out, far, 0.28);
  oscAdd(out, sine, cyc(100, L), 0.015, sr);
} });
// a loose panel flexing in the wind
defineShot('g05_panel', { n: 3, dur: 2.4, sr: SR_LO, peak: 0.8, gen(S, k) {
  const r = S.r;
  for (let j = 0; j < 4; j++) {
    const t = j * (0.22 + r.range(0, 0.1)) + 0.02;
    S.thump(t, 0.5 * (1 - j * 0.2), 160 + k * 25, 70, 0.07).ring(t, [[430 + k * 50, 0.18, 0.2], [610 + k * 33, 0.12, 0.12]]);
  }
  S.noise(0, 0.25, 0.01, 0.8, [['bp', 500, 1]], 1.2);
  S.filter([['lp', 1600]]);
} });

// ---- 82: the lot under a low sun
defineBed('tone_g05_lot', { L: 12, sr: SR_LO, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const gust = loopLfo(r, L, [1, 2, 3]);
  const a = white(n, r); filter(a, [['lp', 300], ['lp', 300]], sr, true);
  for (let i = 0; i < n; i++) a[i] *= Math.max(0.1, 0.55 + 0.45 * gust(i / sr));
  mixRms(out, a, 0.35);
  const w = white(n, r); filter(w, [['bp', 1100, 6]], sr, true);
  for (let i = 0; i < n; i++) { const g = Math.max(0, 0.5 + 0.7 * gust(i / sr)); w[i] *= g * g; }
  mixRms(out, w, 0.03);
  const far = white(n, r); filter(far, [['lp', 55], ['lp', 55]], sr, true);
  mixRms(out, far, 0.25);
  oscAdd(out, wavetable([[1, 1], [2, 0.2]]), cyc(100, L), 0.012, sr);
} });
// a lamp head: ballast hum with a thin buzz on top
defineLoop('g05_pole', { L: 2, norm: ['rms', 0.18], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 0.3], [2, 1], [3, 0.25], [4, 0.3], [6, 0.12]]), cyc(100, L), 0.5, sr);
  const b = white(n, r); filter(b, [['bp', 2200, 4]], sr, true);
  const f = cyc(100, L);
  for (let i = 0; i < n; i++) b[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 3);
  mixRms(out, b, rmsOf(out) * 0.12);
} });
// a store announcement without a store: a falling three-note chime, a burst of static, a click
defineShot('g05_pa', { n: 3, dur: 5.5, sr: SR_LO, peak: 0.8, gen(S, k) {
  const notes = [[784, 659, 523], [880, 698, 587], [740, 622, 494]][k];
  const bell = (f) => [[f, 0.9, 0.5], [f * 2.76, 0.35, 0.12], [f * 5.4, 0.2, 0.05]];
  S.click(0.02, 0.5, 900, 0.004);
  S.noise(0.02, 0.08, 0.01, 0.3, [['bp', 1800, 1.5]], 0.4);
  notes.forEach((f, i) => S.ring(0.4 + i * 0.62, bell(f), 1 - i * 0.12));
  // the garble: a rising and falling wobble of tone
  S.tone(2.5, 0.07, { f0: 420, f1: 300, glide: 0.8, att: 0.05, dec: 0.6, dur: 1.0, shape: 'saw', vib: 0.2, vibF: 7 });
  S.noise(2.5, 0.06, 0.2, 0.6, [['bp', 1300, 1.2]], 1.0);
  S.noise(3.6, 0.05, 0.05, 0.2, [['bp', 2200, 2]], 0.3);
  S.click(3.9, 0.45, 800, 0.004);
  S.filter([['lp', 3200], ['hp', 220]]);
} });
