// Zombie survival Milestone 3 sounds: the perk draft (perks.js) - the draft opening, cards
// dealt, a pick (a brighter sting for a rare one), a reroll's shuffle, a curse taken, a synergy
// unlocking, and the rush a kill-triggered perk gives. UI sounds: no position, no attenuation.
// Recipes as in shove.js (the dsp.js kit; { dur, variants, peak, attn, jitter, fn(P, v) });
// every name is in the Perks line of SOUND_GROUPS in recipes.js too.
import { addBurst, addTone, addGrains, addScrape, addMetal } from './dsp.js';
import { foley } from './weapons.js';

// a soft bell: the fundamental and a few bright partials
const bell = (x, sr, t, f, amp, tau = 0.25) => {
  addTone(x, sr, t, { f, tau, amp, a: 0.002 });
  addTone(x, sr, t, { f: f * 2.01, tau: tau * 0.45, amp: amp * 0.28, a: 0.002 });
  addTone(x, sr, t, { f: f * 3.02, tau: tau * 0.2, amp: amp * 0.1, a: 0.002 });
};

export const PERK_FX = {
  // the draft opens: a card fan and a two-note rise
  perk_open: { dur: 0.75, peak: 0.36, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0, 0.22, { f0: 1800, f1: 5200, q: 0.9, amp: 0.22, grit: 0.5, rise: 0.7, color: 'pink' });
    bell(x, sr, 0.08, 523, 0.55, 0.18);
    bell(x, sr, 0.19, 784, 0.7, 0.32);
    addTone(x, sr, 0.19, { f: 196, tau: 0.2, amp: 0.25, a: 0.01 });
  }, 0.18) },
  // a card dealt onto the table: a paper snap
  perk_deal: { dur: 0.2, variants: 3, peak: 0.3, attn: 'none', jitter: 0.04, fn: (P, v) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.8, { a: 0.0006, tau: 0.012 + v * 0.003, color: 'pink', filters: [['bandpass', r.jit(2600 + v * 400, 0.1), 1.1]] });
    addBurst(x, sr, r, 0.004, 0.35, { a: 0.0002, tau: 0.004, filters: [['highpass', 4500, 0.7]] });
    addTone(x, sr, 0, { f: r.jit(180, 0.08), tau: 0.02, amp: 0.25, a: 0.001 });
  }) },
  // a pick: a bright stab with a low thump under it
  perk_pick: { dur: 0.7, peak: 0.42, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 110, f1: 70, glide: 0.06, tau: 0.08, amp: 0.7, a: 0.001 });
    addBurst(x, sr, r, 0, 0.3, { a: 0.0005, tau: 0.02, color: 'pink', filters: [['lowpass', 1800, 0.7]] });
    for (const [f, a] of [[659, 0.55], [988, 0.45], [1319, 0.35]]) bell(x, sr, 0.012, f, a, 0.22);
    bell(x, sr, 0.1, 1760, 0.3, 0.3);
  }, 0.2) },
  // a rare card taken (or a rare draft dealt): a sparkling arpeggio
  perk_rare: { dur: 1.2, peak: 0.4, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 98, tau: 0.3, amp: 0.45, a: 0.01 });
    [523, 659, 784, 1047, 1319].forEach((f, i) => bell(x, sr, i * 0.065, f, 0.42 + i * 0.05, i === 4 ? 0.5 : 0.16));
    addGrains(x, sr, r, { t0: 0.2, span: 0.7, count: 26, shape: 1.2, dur: [0.002, 0.006], f: [5000, 11000], q: [4, 9], amp: [0.08, 0.25], decay: 0.5 });
  }, 0.3) },
  // a boon-and-curse gamble taken: a low, wrong-sounding swell and a dark bell
  perk_curse: { dur: 1.4, peak: 0.42, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 73.4, tau: 0.5, amp: 0.7, a: 0.15, len: 1.2, rel: 0.4, vib: 0.01, vibF: 4 });
    addTone(x, sr, 0, { f: 77.8, tau: 0.5, amp: 0.55, a: 0.18, len: 1.2, rel: 0.4 });
    addTone(x, sr, 0.05, { f: 146.8, tau: 0.35, amp: 0.25, a: 0.2, len: 1, rel: 0.3 });
    bell(x, sr, 0.22, 311, 0.55, 0.45);
    bell(x, sr, 0.22, 440, 0.35, 0.4); // (a tritone over it)
    addScrape(x, sr, r, 0.05, 0.9, { f0: 900, f1: 300, q: 1.4, amp: 0.18, grit: 0.3, rise: 0.4, color: 'pink' }); // a whisper of breath
  }, 0.35) },
  // a reroll: the deck riffled and squared up
  perk_reroll: { dur: 0.5, peak: 0.34, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    addGrains(x, sr, r, { t0: 0, span: 0.32, count: 34, shape: 0.9, dur: [0.001, 0.004], f: [1800, 5200], q: [0.8, 1.6], amp: [0.25, 0.8], decay: 0.6 });
    addBurst(x, sr, r, 0.34, 0.7, { a: 0.0008, tau: 0.018, color: 'pink', filters: [['bandpass', 1500, 0.9]] });
    addTone(x, sr, 0.34, { f: 160, tau: 0.03, amp: 0.35, a: 0.001 });
  }, 0.1) },
  // a synergy unlocks: two power chords, a sub hit and a shimmer
  perk_synergy: { dur: 1.6, peak: 0.45, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 82, f1: 41, glide: 0.25, tau: 0.25, amp: 0.9, a: 0.002 });
    addBurst(x, sr, r, 0, 0.45, { a: 0.001, tau: 0.06, color: 'pink', filters: [['lowpass', 900, 0.7]] });
    for (const f of [392, 587, 784]) bell(x, sr, 0.01, f, 0.38, 0.2);
    for (const f of [523, 784, 1047, 1568]) bell(x, sr, 0.17, f, 0.36, 0.55);
    addMetal(x, sr, r, 0.17, { f: 4200, amp: 0.2, tau: 0.25, noise: 0.2 });
    addGrains(x, sr, r, { t0: 0.25, span: 1, count: 30, shape: 1.4, dur: [0.002, 0.006], f: [4000, 10000], q: [5, 10], amp: [0.06, 0.2], decay: 0.7 });
  }, 0.4) },
  // a kill-triggered rush (Adrenaline, Hit and Run): a heartbeat and a whoosh
  perk_rush: { dur: 0.6, peak: 0.36, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 62, tau: 0.06, amp: 0.9, a: 0.004 });
    addTone(x, sr, 0.16, { f: 55, tau: 0.07, amp: 0.7, a: 0.004 });
    addScrape(x, sr, r, 0.05, 0.4, { f0: 600, f1: 3200, q: 0.8, amp: 0.3, grit: 0.2, rise: 0.75, color: 'pink' });
  }) },
};
