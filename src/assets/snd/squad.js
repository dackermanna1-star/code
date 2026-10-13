// Zombie survival Milestone 3 sounds: squad roles and orders (zsquad.js, zorders.js). Radio-ish
// UI cues, all through the squad net's band-limited squelch:
//  - squad_order: an order went out (Follow, Regroup, Cover, Fall back): a squelch and a rising chirp
//  - squad_hold: "Hold here": the squelch and a settling two-note fall (dig in)
//  - squad_focus: "Focus target": a sharp double ping (the target is marked)
//  - squad_mark: the Focus target is down: a quick rising triple blip
// Recipes as in shove.js (the dsp.js kit; { dur, variants, peak, attn, jitter, fn(P, v) });
// every name is in the 'Squad roles' line of SOUND_GROUPS (recipes.js).
import { addBurst, addTone, biquad } from './dsp.js';
import { foley } from './weapons.js';

/** The radio's squelch: a short band-passed hiss opening the channel. */
function squelch(x, sr, r, t0 = 0, amp = 0.45) {
  addBurst(x, sr, r, t0, amp, { a: 0.0005, h: 0.018, tau: 0.01, filters: [['bandpass', 2300, 1.1]] });
}

export const SQUAD_FX = {
  squad_order: { dur: 0.32, peak: 0.28, lofi: 4200, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    squelch(x, sr, r);
    addTone(x, sr, 0.03, { f: 1180, f1: 1560, glide: 0.05, tau: 0.05, len: 0.07, amp: 0.55, a: 0.003, rel: 0.01 });
    addTone(x, sr, 0.03, { f: 2360, f1: 3120, glide: 0.05, tau: 0.03, len: 0.07, amp: 0.12, a: 0.003, rel: 0.01 });
    addTone(x, sr, 0.12, { f: 1560, tau: 0.06, amp: 0.4, a: 0.003 });
    squelch(x, sr, r, 0.22, 0.2); // (the channel closing)
    biquad(x, sr, 'highpass', 320, 0.7);
  }) },
  squad_hold: { dur: 0.48, peak: 0.3, lofi: 4200, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    squelch(x, sr, r);
    addTone(x, sr, 0.03, { f: 988, tau: 0.08, amp: 0.55, a: 0.003 });
    addTone(x, sr, 0.03, { f: 1976, tau: 0.03, amp: 0.1, a: 0.003 });
    addTone(x, sr, 0.15, { f: 740, tau: 0.16, amp: 0.6, a: 0.004 });
    addTone(x, sr, 0.15, { f: 1480, tau: 0.05, amp: 0.1, a: 0.004 });
    squelch(x, sr, r, 0.38, 0.18);
    biquad(x, sr, 'highpass', 300, 0.7);
  }) },
  squad_focus: { dur: 0.42, peak: 0.32, lofi: 5200, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    squelch(x, sr, r, 0, 0.3);
    for (const [t, f] of [[0.02, 1760], [0.11, 2349]]) {
      addTone(x, sr, t, { f, tau: 0.05, amp: 0.7, a: 0.0015 });
      addTone(x, sr, t, { f: f * 2.01, tau: 0.02, amp: 0.16, a: 0.0015 });
      addTone(x, sr, t, { f: f * 0.5, tau: 0.03, amp: 0.15, a: 0.002 });
    }
    addBurst(x, sr, r, 0.02, 0.15, { a: 0.0002, tau: 0.004, filters: [['highpass', 5000, 0.7]] }); // (the tick of a marker)
    biquad(x, sr, 'highpass', 400, 0.7);
  }) },
  squad_mark: { dur: 0.36, peak: 0.26, lofi: 5200, attn: 'none', fn: (P) => foley(P, (x, sr) => {
    [1319, 1760, 2093].forEach((f, i) => {
      addTone(x, sr, i * 0.055, { f, tau: i === 2 ? 0.09 : 0.03, amp: i === 2 ? 0.7 : 0.5, a: 0.0015 });
      addTone(x, sr, i * 0.055, { f: f * 2, tau: 0.015, amp: 0.1, a: 0.0015 });
    });
    biquad(x, sr, 'highpass', 400, 0.7);
  }) },
};
