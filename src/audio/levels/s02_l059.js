// Level 59 (The Maintenance Tunnels): air handlers, tubes, valves, distant hatches.
import { defineBed, defineShot } from '../registry.js';
import { TAU, white, filter, envelope, mulInto, mixRms, rmsOf, cyc, loopLfo, oscAdd, wavetable } from '../dsp.js';

// narrow concrete tunnels: a far-off air handler, a pump that cycles, the faint ring of long pipes
defineBed('tone_g02_maint', { L: 10, sr: 11025, norm: ['rms', 0.2], *gen(S, L) {
  const { out, r, sr } = S, n = out.length;
  const air = white(n, r); filter(air, [['bp', 380, 0.5], ['lp', 1100]], sr, true); yield;
  const lf = loopLfo(r, L, [1, 2]);
  for (let i = 0; i < n; i++) air[i] *= 0.7 + 0.3 * lf(i / sr);
  mixRms(out, air, 0.3); yield;
  const low = white(n, r); filter(low, [['lp', 80], ['lp', 80]], sr, true);
  const pump = cyc(0.9, L);
  for (let i = 0; i < n; i++) low[i] *= 0.5 + 0.5 * Math.pow(0.5 + 0.5 * Math.sin((TAU * pump * i) / sr), 2);
  mixRms(out, low, 0.35); yield;
  oscAdd(out, wavetable([[1, 1], [2, 0.4, 1]]), cyc(50, L), 0.09, sr); yield;
  for (const [f, g] of [[240, 0.03], [610, 0.02]]) {
    const ring = white(n, r); filter(ring, [['bp', f, 26]], sr, true);
    mixRms(out, ring, rmsOf(out) * g * 3);
  } yield;
  for (let j = 0; j < 3; j++) S.bubble(r.range(0, L), r.range(0.05, 0.1), r.range(500, 1200), r.range(0.015, 0.03), 0.3);
} });

// something heavy shuts, far down a tunnel: hatch, then the echo
defineShot('g02_clank', { n: 3, dur: 3.2, sr: 11025, peak: 0.9, gen(S, k) {
  const r = S.r, f = r.range(130, 210) * (1 + k * 0.15);
  S.noise(0.02, 0.8, 0.0005, 0.02, [['lp', 1400]]);
  S.thump(0.02, 0.5, 120, 55, 0.08);
  S.ring(0.02, [[f, 0.35, 0.4], [f * 2.4, 0.25, 0.25], [f * 4.7, 0.15, 0.15], [f * 7.2, 0.1, 0.08]]);
  for (const [d, g] of [[0.31, 0.35], [0.66, 0.18], [1.1, 0.09]]) {
    S.noise(0.02 + d, 0.4 * g, 0.001, 0.03, [['lp', 1000]]);
    S.ring(0.02 + d, [[f * 0.98, 0.3, 0.3], [f * 2.4, 0.2, 0.2]], g);
  }
  S.filter([['lp', 2200]]);
} });

// a hand wheel turned: a squeal of dry thread, then the stop
defineShot('g02_valve', { n: 2, dur: 3, peak: 0.8, gen(S, k) {
  const r = S.r;
  S.tone(0.1, 0.18, { f0: 620 + k * 90, f1: 420 + k * 60, glide: 0.5, att: 0.1, dec: 0.5, dur: 1.4, shape: 'saw', vib: 0.03, vibF: 11 });
  S.noise(0.1, 0.3, 0.2, 0.9, [['bp', 900, 1.5], ['lp', 2800]], 1.6);
  S.click(1.6, 0.5, 1500, 0.004);
  S.ring(1.6, [[r.range(180, 260), 0.25, 0.3], [r.range(500, 700), 0.15, 0.2]]);
  S.filter([['lp', 4000]]);
} });

// pipes ticking as they warm: small metal clicks in a row
defineShot('g02_ticks', { n: 3, dur: 3.5, sr: 11025, peak: 0.7, gen(S, k) {
  const r = S.r;
  let t = 0.1;
  for (let j = 0; j < 7 + k * 3; j++) {
    S.click(t, 0.6, 1800, 0.002);
    S.ring(t, [[r.range(900, 2400), 0.03, 0.2], [r.range(300, 700), 0.05, 0.15]]);
    t += r.range(0.12, 0.5) * (j > 4 ? 1.8 : 1);
  }
} });
