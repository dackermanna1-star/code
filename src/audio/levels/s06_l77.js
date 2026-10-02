// Level 77 (The Endless Grocery Aisle): refrigeration under fluorescent tubes, a store chime that
// no voice follows, and ceiling-speaker muzak that slowly stops being music.
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, mixRms, rmsOf, cyc, oscAdd, wavetable, loopLfo } from '../dsp.js';
import { muzak, muzakLen, PROG } from './s06_muzak.js';

// room tone: compressors and a long way of air
defineBed('tone_lv77_store', { L: 8, sr: 11025, norm: ['rms', 0.2], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 0.6], [2, 0.4, 1], [3, 0.18, 2], [4, 0.1, 0.4]]), cyc(49.5, L), 0.5, sr);
  oscAdd(out, wavetable([[1, 0.5], [2, 0.3, 1]]), cyc(100.5, L), 0.2, sr, 0.3);
  const air = white(n, r); filter(air, [['bp', 450, 0.5], ['lp', 1500]], sr, true);
  const sw = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) air[i] *= 0.7 + 0.3 * sw(i / sr);
  mixRms(out, air, rmsOf(out) * 0.7);
  const rum = white(n, r); filter(rum, [['lp', 120], ['lp', 120]], sr, true);
  mixRms(out, rum, rmsOf(out) * 0.5);
} });

// a refrigerated case somewhere along the aisle
defineLoop('lv77_cooler', { L: 4, norm: ['rms', 0.16], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  oscAdd(out, wavetable([[1, 0.5], [2, 0.4, 1], [3, 0.2, 2], [5, 0.06, 1]]), cyc(55, L), 1, sr);
  const fan = white(n, r); filter(fan, [['bp', 800, 0.6]], sr, true);
  const f = cyc(26, L);
  for (let i = 0; i < n; i++) fan[i] *= 0.6 + 0.4 * Math.pow(0.5 + 0.5 * Math.sin((TAU * f * i) / sr), 2);
  mixRms(out, fan, rmsOf(out) * 0.3);
  oscAdd(out, wavetable([[1, 1]]), cyc(2200, L), 0.004, sr);
} });

// ceiling speakers: ordinary, then out of tune, then slow and hollow
const PA = PROG.lounge, BPM_A = 76;
defineLoop('lv77_muzak_a', { L: muzakLen(PA, BPM_A), norm: ['rms', 0.14], gen(S, L) {
  muzak(S, L, { prog: PA, bpm: BPM_A, dens: 0.55, detune: 6, wow: 0.003, lp: 2400, lead: 'epiano', pad: 0.8 });
} });
defineLoop('lv77_muzak_b', { L: muzakLen(PROG.minor, 64), norm: ['rms', 0.14], gen(S, L) {
  muzak(S, L, { prog: PROG.minor, bpm: 64, dens: 0.45, detune: 38, wow: 0.012, wowCycles: 2, wow2: 0.004, lp: 1700, lead: 'vibes', pad: 1.1 });
} });
defineLoop('lv77_muzak_c', { L: muzakLen(PROG.warm, 40), norm: ['rms', 0.14], gen(S, L) {
  muzak(S, L, { prog: PROG.warm, bpm: 40, dens: 0.3, detune: 90, wow: 0.03, wowCycles: 1, wow2: 0.008, lp: 1100, lead: 'bell', pad: 1.5, lift: -1 });
} });

// the store chime (two notes, the second lower); then silence
defineShot('lv77_chime', { n: 1, dur: 5, sr: 22050, peak: 0.8, gen(S) {
  const f1 = 659.3, f2 = 523.3;
  S.ring(0.0, [[f1, 1.1, 0.6], [f1 * 2.01, 0.5, 0.2], [f1 * 3.02, 0.25, 0.08]]);
  S.ring(0.75, [[f2, 1.5, 0.6], [f2 * 2.01, 0.6, 0.2], [f2 * 3.02, 0.3, 0.08]]);
  S.noise(0, 0.05, 0.01, 0.2, [['bp', 1500, 1]]);
  S.filter([['hp', 280], ['lp', 3600]]);
} });
