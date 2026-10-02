// Level 97 (The Empty Restaurant): a big quiet room, a grandfather clock, piano muzak with no one at it.
import { defineBed, defineLoop } from '../registry.js';
import { TAU, white, filter, mixRms, rmsOf, cyc, oscAdd, wavetable, loopLfo } from '../dsp.js';
import { muzak, muzakLen, PROG } from './s06_muzak.js';

// a large room at night: air in the ducts, a distant compressor, almost nothing else
defineBed('tone_lv97_hall', { L: 12, sr: 11025, norm: ['rms', 0.14], gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const air = white(n, r); filter(air, [['bp', 260, 0.5], ['lp', 800]], sr, true);
  const sw = loopLfo(r, L, [1, 2, 3]);
  for (let i = 0; i < n; i++) air[i] *= 0.5 + 0.5 * (0.5 + 0.5 * sw(i / sr));
  mixRms(out, air, 0.3);
  oscAdd(out, wavetable([[1, 0.7], [2, 0.25, 1]]), cyc(36, L), 0.2, sr);
  oscAdd(out, wavetable([[1, 1]]), cyc(2400, L), 0.002, sr);
} });

// the clock: a slow wooden tick-tock with a small ring in the case
defineLoop('lv97_clock', { L: 4, norm: ['peak', 0.5], gen(S, L) {
  for (let k = 0; k < 4; k++) {
    const t = k * 1.0, hi = k % 2 === 0;
    S.click(t, 0.9, hi ? 2200 : 1700, 0.004).thump(t, 0.4, hi ? 330 : 280, 190, 0.02).ring(t, [[hi ? 880 : 740, 0.05, 0.2], [hi ? 2400 : 2000, 0.02, 0.1]]);
  }
  S.filter([['lp', 5200], ['hp', 120]]);
} });

// piano muzak: slow, soft, a little behind the beat, nothing but the instrument
const PB = 58;
defineLoop('lv97_piano', { L: muzakLen(PROG.minor, PB), norm: ['rms', 0.12], gen(S, L) {
  muzak(S, L, { prog: PROG.minor, bpm: PB, dens: 0.5, detune: 14, wow: 0.007, wowCycles: 2, wow2: 0.003, lp: 1500, lead: 'epiano', pad: 0.7, bass: 1.2, lift: 0 });
} });
