// Zombie survival melee shove (shove.js): the swing (an arm and a gun thrown forward: a short
// cloth whoosh with the kit rattling) and the hit (the stock or the shoulder into a body: a dull
// thud with a soft slap, no gore). Same synthesis kit as the rest of the bank (dsp.js).
import { addBurst, addTone, addScrape, addGrains, mixInto, normalize, svf, pwl, pink, envBell } from './dsp.js';
import { foley } from './weapons.js';

export const SHOVE_FX = {
  shove_swing: { dur: 0.3, variants: 2, peak: 0.4, attn: 'idle', jitter: 0.05, fn: (P, v) => foley(P, (x, sr, r) => {
    const n = Math.ceil(0.26 * sr);
    const rise = v ? 0.05 : 0.065, fall = v ? 0.12 : 0.14;
    const w = pink(n, r);
    for (let i = 0; i < n; i++) w[i] *= envBell(i / sr, rise, fall);
    svf(w, sr, 'bp', pwl([[0, 380], [rise, v ? 1500 : 1250], [rise + fall, 450]]), 1.1);
    normalize(w, 1);
    mixInto(x, w, 0, 1);
    addScrape(x, sr, r, 0.01, 0.12, { f0: 900, f1: 1600, q: 1.2, amp: 0.22, grit: 0.4, color: 'pink' }); // the sleeve
    addGrains(x, sr, r, { t0: rise * 0.8, span: 0.06, count: 6, f: [2200, 4800], amp: [0.05, 0.16], decay: 0.02 }); // kit and sling
  }) },
  shove_hit: { dur: 0.32, variants: 3, peak: 0.66, attn: 'normal', jitter: 0.04, fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: r.jit(115, 0.1), f1: 52, glide: 0.03, tau: 0.06, amp: 1, a: 0.001 }); // the body takes it
    addBurst(x, sr, r, 0, 0.9, { a: 0.0008, tau: r.jit(0.03, 0.15), color: 'pink', filters: [['lowpass', r.jit(850, 0.12), 0.7], ['peaking', 260, 1.2, 5]] });
    addBurst(x, sr, r, 0.001, 0.35, { a: 0.0004, tau: 0.012, filters: [['bandpass', r.jit(1400, 0.15), 1.2]] }); // stock on cloth
    addTone(x, sr, 0.001, { f: r.jit(620, 0.08), tau: 0.012, amp: 0.18 }); // polymer knock
    addBurst(x, sr, r, 0.05, 0.12, { a: 0.004, tau: 0.04, color: 'pink', filters: [['lowpass', 500, 0.7]] }); // a stumble
  }, 0.06) },
};
