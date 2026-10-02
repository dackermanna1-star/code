// Level 69 (The Abandoned Carnival): a band organ, turning machinery, loudspeakers that only crackle.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable, ns, alloc } from '../dsp.js';

// dusk over a fairground: a soft wind, a distant generator, the hum of many bulbs
defineBed('tone_lv69_dusk', { L: 12, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const g = loopLfo(r, L, [1, 2, 3]);
  const a = white(n, r); filter(a, [['lp', 300], ['lp', 300]], sr, true);
  for (let i = 0; i < n; i++) a[i] *= 0.55 + 0.45 * g(i / sr);
  mixRms(out, a, 0.28);
  const b = white(n, r); filter(b, [['bp', 900, 1.5], ['lp', 1800]], sr, true);
  for (let i = 0; i < n; i++) b[i] *= Math.pow(0.5 + 0.5 * g(i / sr + 3), 2);
  mixRms(out, b, 0.03);
  oscAdd(out, wavetable([[1, 1], [2, 0.6], [3, 0.3]]), cyc(60, L), 0.02, sr);
  oscAdd(out, wavetable([[1, 1]]), cyc(7.5, L), 0.02, sr);
} });

// a reed organ voice: a few harmonics, a soft attack, tremolo
function organNote(out, t, dur, f, gain, sr, ph = 0) {
  const i0 = Math.round(t * sr), n = Math.round(dur * sr), len = out.length;
  const h = [1, 0.55, 0.35, 0.22, 0.12];
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    const env = Math.min(1, tt / 0.03) * Math.min(1, (dur - tt) / 0.05) * (0.85 + 0.15 * Math.sin(TAU * 5.4 * tt + ph));
    let v = 0;
    for (let k = 0; k < h.length; k++) v += h[k] * Math.sin(TAU * f * (k + 1) * tt + k);
    out[(i0 + i) % len] += v * env * gain;
  }
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// a waltz, forever (the same twelve bars): oom-pah-pah and a tune above
defineLoop('lv69_organ', { L: 14.4, sr: 11025, norm: ['rms', 0.14], gen(S, L) {
  const { out, r, sr } = S;
  const beat = L / 36;
  const bass = [48, 55, 48, 55, 53, 48, 53, 55, 48, 55, 48, 43];       // one per bar
  const chord = [[60, 64, 67], [59, 62, 67], [60, 64, 67], [59, 62, 67], [60, 65, 69], [60, 64, 67], [59, 65, 67], [59, 62, 67], [60, 64, 67], [59, 62, 67], [60, 64, 67], [55, 59, 62]];
  for (let bar = 0; bar < 12; bar++) {
    const t = bar * 3 * beat;
    organNote(out, t, beat * 0.8, mtof(bass[bar]), 0.5, sr);
    for (const k of [1, 2]) for (const m of chord[bar]) organNote(out, t + k * beat, beat * 0.45, mtof(m), 0.12, sr);
  }
  const tune = [[0, 76, 1.5], [1.5, 74, 0.75], [2.25, 72, 0.75], [3, 71, 1.5], [4.5, 72, 1.5], [6, 74, 3], [9, 76, 1.5], [10.5, 79, 1.5], [12, 76, 3],
    [15, 77, 1.5], [16.5, 76, 0.75], [17.25, 74, 0.75], [18, 72, 1.5], [19.5, 74, 1.5], [21, 76, 3], [24, 74, 1.5], [25.5, 72, 1.5], [27, 71, 3],
    [30, 72, 1.5], [31.5, 74, 1.5], [33, 72, 3]];
  for (const [b0, m, d] of tune) organNote(out, b0 * beat, d * beat * 0.92, mtof(m) * (1 + r.range(-0.004, 0.004)), 0.26, sr, r.range(0, 6));
  filter(out, [['lp', 3600], ['hp', 120]], sr, true);
} });

// a carousel's machinery: a low turn, gear ticks, a loose rattle
defineLoop('lv69_carousel', { L: 4, sr: 11025, norm: ['rms', 0.18], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 1], [2, 0.5], [3, 0.3]]), cyc(42, L), 0.4, sr);
  const rat = white(n, r); filter(rat, [['bp', 1300, 3]], sr, true);
  const f = cyc(12.5, L);
  for (let i = 0; i < n; i++) rat[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 10);
  mixRms(out, rat, rmsOf(out) * 0.3);
  for (let k = 0; k < 4; k++) S.thump(k * 1.0 + 0.02, 0.3, 120, 60, 0.05).click(k * 1.0, 0.2, 900, 0.004);
  const w = white(n, r); filter(w, [['lp', 500], ['lp', 500]], sr, true);
  mixRms(out, w, rmsOf(out) * 0.3);
} });

// swing ride: air and chain links going round
defineLoop('lv69_chains', { L: 8, sr: 11025, norm: ['rms', 0.16], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const g = loopLfo(r, L, [1, 2]);
  const a = white(n, r); filter(a, [['bp', 600, 0.8], ['lp', 1400]], sr, true);
  for (let i = 0; i < n; i++) a[i] *= 0.35 + 0.65 * Math.pow(0.5 + 0.5 * g(i / sr), 1.5);
  mixRms(out, a, 0.3);
  const c = white(n, r); filter(c, [['hp', 2500], ['lp', 6000]], sr, true);
  const f = cyc(9, L);
  for (let i = 0; i < n; i++) c[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr + g(i / sr) * 2), 6) * (0.4 + 0.6 * (0.5 + 0.5 * g(i / sr)));
  mixRms(out, c, 0.12);
  oscAdd(out, wavetable([[1, 1], [2, 0.4]]), cyc(50, L), 0.05, sr);
} });

// the wheel: a slow ratchet and structure creaking under its own weight
defineLoop('lv69_wheel', { L: 6, sr: 11025, norm: ['rms', 0.16], gen(S, L) {
  const { out, r, sr } = S;
  for (let t = 0.1; t < L; t += 0.5) S.click(t, 0.4, 700, 0.006).thump(t, 0.25, 160, 80, 0.03).ring(t, [[r.range(350, 520), 0.06, 0.1]], 0.4);
  S.tone(0.4, 0.05, { f0: 150, f1: 135, glide: 1.5, att: 0.8, dec: 2, dur: 3, shape: 'saw', vib: 0.02, vibF: 7 });
  S.tone(3.4, 0.04, { f0: 200, f1: 185, glide: 1.5, att: 0.5, dec: 1.6, dur: 2.5, shape: 'saw', vib: 0.02, vibF: 6 });
  oscAdd(out, wavetable([[1, 1], [2, 0.5]]), cyc(36, L), 0.1, sr);
  S.filter([['lp', 2400]]);
} });

// a horn speaker with nobody speaking: hiss and mains hum
defineLoop('lv69_pa_hiss', { L: 3, sr: 11025, norm: ['rms', 0.12], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const h = white(n, r); filter(h, [['hp', 1800], ['lp', 4500]], sr, true);
  mixRms(out, h, 0.2);
  oscAdd(out, wavetable([[1, 1], [2, 0.6], [4, 0.2]]), cyc(60, L), 0.4, sr);
  for (let k = 0; k < 3; k++) if (r.chance(0.6)) S.click(r.range(0, L), 0.25, 1500, 0.002);
} });

// three soft chimes, falling: "attention, please" with no one to say it
defineShot('lv69_chime', { n: 1, dur: 5, peak: 0.7, gen(S) {
  const notes = [[0.0, 784.0], [0.55, 659.3], [1.1, 523.3]];
  for (const [t, f] of notes) {
    S.ring(t, [[f, 1.0, 0.5], [f * 2.0, 0.6, 0.15], [f * 3.01, 0.3, 0.07], [f * 4.2, 0.12, 0.04]], 0.9);
    S.click(t, 0.1, 3000, 0.002);
  }
  const { out, sr } = S, n = out.length;
  const tail = new Float32Array(n);
  for (const [d, g] of [[0.19, 0.4], [0.37, 0.25], [0.61, 0.15]]) { const o = Math.round(d * sr); for (let i = o; i < n; i++) tail[i] += out[i - o] * g; }
  for (let i = 0; i < n; i++) out[i] += tail[i];
  filter(out, [['lp', 5000], ['hp', 200]], sr);
  const hiss = white(n, S.r); filter(hiss, [['hp', 2500], ['lp', 5000]], sr);
  mulInto(hiss, envelope(n, sr, [[0, 0], [0.05, 1], [3.6, 0.6], [4.4, 0]]));
  mixRms(out, hiss, rmsOf(out) * 0.1);
} });

// the loudspeaker clears its throat: pops and crackle
defineShot('lv69_crackle', { n: 2, dur: 2.8, sr: 11025, peak: 0.8, gen(S, k) {
  const { out, r, sr } = S, n = out.length;
  S.click(0.05, 0.8, 500, 0.01).thump(0.06, 0.5, 130, 70, 0.07);
  for (let t = 0.3; t < 2.0; t += r.range(0.05, 0.28)) S.grit(t, r.range(0.2, 0.5), r.range(0.03, 0.15), 600, 0.04, [['hp', 900]]);
  const hum = new Float32Array(n);
  oscAdd(hum, wavetable([[1, 1], [3, 0.4], [5, 0.15]]), 60, 0.4, sr);
  mulInto(hum, envelope(n, sr, [[0, 0], [0.1, 0], [0.25, 1], [2.1, 0.8], [2.3, 0]]));
  for (let i = 0; i < n; i++) out[i] += hum[i];
  S.click(2.3 + k * 0.1, 0.6, 500, 0.01).thump(2.31, 0.4, 120, 60, 0.07);
  filter(out, [['lp', 4000]], sr);
} });
void ns; void alloc;
