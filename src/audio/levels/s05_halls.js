// Sounds of the halls: 15 (futuristic halls) and 23 (the elevator).
import { defineBed, defineLoop, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable, SR_LO } from '../dsp.js';

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
