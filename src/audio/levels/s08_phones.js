// Level 89 (The Telephone Hall): the hush of a hall full of lines, and the rings.
import { defineBed, defineLoop } from '../registry.js';
import { TAU, white, filter, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// a room of dead air with a dial tone buried far beneath it
defineBed('tone_lv89_hall', { L: 10, norm: ['rms', 0.18], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const lo = white(n, r); filter(lo, [['lp', 160], ['lp', 160]], sr, true);
  const air = white(n, r); filter(air, [['bp', 700, 0.7], ['lp', 1800]], sr, true);
  const sw = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) air[i] *= 0.7 + 0.3 * sw(i / sr);
  mixRms(out, lo, 0.45); mixRms(out, air, 0.12);
  const sine = wavetable([[1, 1]]);
  oscAdd(out, sine, cyc(350, L), 0.012, sr);
  oscAdd(out, sine, cyc(440, L), 0.012, sr, 0.2);
  oscAdd(out, wavetable([[1, 1], [2, 0.3]]), cyc(60, L), 0.03, sr);
} });

// three old bell telephones with different rhythms: a double ring, then quiet
function ringLoop(name, L, g1, pattern) {
  defineLoop(name, { L, norm: ['peak', 0.55], gen(S) {
    const r = S.r;
    const g2 = g1 * 1.16;
    const gong = (f) => [[f, 0.4, 0.4], [f * 2.32, 0.2, 0.18], [f * 3.6, 0.12, 0.1], [f * 5.1, 0.07, 0.05]];
    for (const [t0, len] of pattern) {
      let k = 0;
      for (let t = t0; t < t0 + len; t += r.range(0.047, 0.053), k++) {
        const a = 0.6 + 0.4 * r();
        S.ring(t, gong(k % 2 ? g2 : g1), a).click(t, 0.05 * a, 3000, 0.0008);
      }
    }
    S.filter([['lp', 5200], ['hp', 220]]);
  } });
}
ringLoop('lv89_ring_a', 5.2, 1180, [[0.1, 0.42], [0.75, 0.42]]);
ringLoop('lv89_ring_b', 6.1, 1330, [[0.3, 0.9]]);
ringLoop('lv89_ring_c', 4.4, 1050, [[0.05, 0.3], [0.5, 0.3], [0.95, 0.3]]);
void TAU; void rmsOf;
