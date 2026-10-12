// Zombie survival hit confirmation (zfeedback.js): short, dry, non-positional UI sounds that
// cut through the gunfire - a tick for a body hit, a brighter tink for the head, a weighty
// thunk-clack for a kill (played lower for specials and bosses).
import { addBurst, addTone, addMetal } from './dsp.js';
import { foley } from './weapons.js';

export const HIT_FX = {
  hit_tick: { dur: 0.06, peak: 0.3, attn: 'none', jitter: 0.04, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.6, { a: 0.0002, tau: 0.003, filters: [['bandpass', 3800, 1.4]] });
    addTone(x, sr, 0, { f: 2400, tau: 0.008, amp: 0.7, a: 0.0003 });
    addTone(x, sr, 0, { f: 1150, tau: 0.012, amp: 0.35, a: 0.0005 });
  }) },
  hit_head: { dur: 0.22, peak: 0.36, attn: 'none', jitter: 0.03, fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.5, { a: 0.0002, tau: 0.003, filters: [['bandpass', 5000, 1.4]] });
    addMetal(x, sr, r, 0, { f: 3900, amp: 0.9, tau: 0.045, n: 4, noise: 0.3 }); // the helmet-less "tink"
    addTone(x, sr, 0, { f: 5800, tau: 0.03, amp: 0.25 });
    addTone(x, sr, 0, { f: 1600, tau: 0.012, amp: 0.4 });
  }) },
  hit_kill: { dur: 0.32, peak: 0.5, attn: 'none', jitter: 0.02, fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 210, f1: 95, glide: 0.04, tau: 0.06, amp: 0.9, a: 0.001 }); // thunk
    addBurst(x, sr, r, 0, 0.55, { a: 0.0005, tau: 0.02, color: 'pink', filters: [['lowpass', 1400, 0.8]] });
    addTone(x, sr, 0, { f: 2200, tau: 0.01, amp: 0.55 });
    addMetal(x, sr, r, 0.045, { f: 3200, amp: 0.55, tau: 0.03, n: 3, noise: 0.2 }); // ...clack
    addTone(x, sr, 0.045, { f: 1300, tau: 0.02, amp: 0.3 });
  }) },
};
