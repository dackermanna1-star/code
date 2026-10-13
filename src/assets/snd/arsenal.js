// Zombie survival Milestone 3 sounds: the new weapons' foley and anything that isn't a gunshot (gunshots: GUNS in weapons.js).
// Recipes as in shove.js (the dsp.js kit; { dur, variants, peak, attn, jitter, fn(P, v) });
// list every name in your SOUND_GROUPS line in recipes.js too (the bank, the preview tool).
//
// The arsenal (zarsenal.js): three blades (the machete's quick whip, the fire axe's heavy
// swing and wet chop, the katana's ringing sweep and clean cut, steel on stone), the crossbow
// (a string's twang and the bolt's hiss, the crank, the latch, a bolt in wood or stone, a
// bolt in a body), the pipe bomb (the arming click and whine, its beep, its blast: an HE
// with nails in it) and the cryo grenade (the burst of gas, the crackle of the freeze, ice
// shattering).
import { addBurst, addTone, addMetal, addScrape, addGrains, mixInto, normalize, svf, pwl, pink, white, envBell, softclip } from './dsp.js';
import { foley } from './weapons.js';
import { explosion } from './foley.js';

/** A blade's whoosh: band-passed noise swept up and down over a bell (lo..hi Hz, rise / fall s, an edge whistle). */
function whoosh(x, sr, r, { rise, fall, lo, hi, q = 1.3, edge = 0.2, edgeF = 4200, color = 'pink', t0 = 0 }) {
  const n = Math.ceil((rise + fall + 0.05) * sr);
  const w = color === 'pink' ? pink(n, r) : white(n, r);
  for (let i = 0; i < n; i++) w[i] *= envBell(i / sr, rise, fall);
  svf(w, sr, 'bp', pwl([[0, lo], [rise, hi], [rise + fall, lo * 1.2]]), q);
  normalize(w, 1);
  mixInto(x, w, t0 * sr, 1);
  if (edge) {
    const a = white(n, r);
    for (let i = 0; i < n; i++) a[i] *= envBell(i / sr - 0.01, rise * 0.9, fall * 0.5);
    svf(a, sr, 'bp', (t) => edgeF * (0.8 + 0.4 * Math.sin(Math.min(1, t / (rise + fall)) * Math.PI)), 3);
    normalize(a, 1);
    mixInto(x, a, t0 * sr, edge);
  }
}

/** Steel into a body: a wet slap and thump, a squelch, a crunch of bone (bone 0..1). */
function chop(x, sr, r, { low = 150, thump = 0.8, wet = 0.7, bone = 0.4, sqF = 800, ring = 0, ringF = 2600 }) {
  addTone(x, sr, 0, { f: r.jit(low, 0.08), f1: low * 0.45, glide: 0.02, tau: 0.045, amp: thump, a: 0.0006 });
  addBurst(x, sr, r, 0, 1, { a: 0.0003, tau: r.jit(0.018, 0.15), color: 'pink', filters: [['lowpass', r.jit(2400, 0.1), 0.7], ['peaking', r.jit(700, 0.15), 1.4, 6]] });
  const f0 = r.jit(sqF, 0.15);
  addBurst(x, sr, r, 0.003, wet, { a: 0.003, h: 0.01, tau: 0.05, sweep: { mode: 'bp', fc: (t) => f0 * (1 - 0.5 * Math.min(1, t / 0.08)), q: 3 } });
  if (bone) addGrains(x, sr, r, { t0: 0.004, span: 0.05, count: 14, f: [900, 4000], amp: [0.2 * bone, 0.7 * bone], decay: 0.03, dur: [0.0004, 0.002] });
  if (ring) addMetal(x, sr, r, 0, { f: r.jit(ringF, 0.04), amp: ring, tau: 0.12, fall: 0.82, n: 4, ratios: [1, 1.58, 2.71, 3.62], noise: 0.15 });
}

/** Electronic beep (square-ish: a tone and its odd harmonics). */
function beep(x, sr, t0, f, len, amp) {
  for (const [k, a] of [[1, 1], [3, 0.3], [5, 0.12]]) addTone(x, sr, t0, { f: f * k, amp: amp * a, tau: 9, len, a: 0.002, rel: 0.01 });
}

export const ARSENAL_FX = {
  // ---- blades
  machete_slash: { dur: 0.32, variants: 3, peak: 0.5, attn: 'idle', fn: (P, v) => foley(P, (x, sr, r) => {
    whoosh(x, sr, r, { rise: 0.05 + v * 0.008, fall: 0.11, lo: 600, hi: 2600 + v * 300, edge: 0.22, edgeF: 4600 });
  }) },
  machete_hit: { dur: 0.42, variants: 3, peak: 0.7, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    chop(x, sr, r, { low: 170, thump: 0.7, wet: 0.75, bone: 0.45, sqF: 950, ring: 0.12, ringF: 3100 });
  }, 0.06) },
  axe_swing: { dur: 0.5, variants: 2, peak: 0.5, attn: 'idle', fn: (P, v) => foley(P, (x, sr, r) => {
    whoosh(x, sr, r, { rise: 0.16 + v * 0.02, fall: 0.2, lo: 220, hi: 1100, q: 1.0, edge: 0.08, edgeF: 2400 });
    addScrape(x, sr, r, 0.0, 0.1, { f0: 700, f1: 1200, q: 1, amp: 0.12, grit: 0.5, color: 'pink' }); // the grip tightening
  }) },
  axe_hit: { dur: 0.6, variants: 3, peak: 0.85, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    chop(x, sr, r, { low: 95, thump: 1.4, wet: 0.9, bone: 0.9, sqF: 600, ring: 0.08, ringF: 1700 });
    addTone(x, sr, 0, { f: r.jit(62, 0.06), f1: 38, glide: 0.06, tau: 0.12, amp: 0.6 }); // the weight behind it
    addGrains(x, sr, r, { t0: 0.01, span: 0.12, count: 22, f: [500, 2500], amp: [0.1, 0.45], decay: 0.06 }); // the crunch
  }, 0.08) },
  axe_draw: { dur: 0.5, peak: 0.45, attn: 'idle', fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.6, { a: 0.001, tau: 0.03, color: 'pink', filters: [['lowpass', 900, 0.7]] }); // the haft into the palm
    addTone(x, sr, 0, { f: 210, f1: 150, glide: 0.03, tau: 0.04, amp: 0.4 });
    addMetal(x, sr, r, 0.06, { f: 1900, amp: 0.4, tau: 0.08, fall: 0.8, n: 4, noise: 0.2, body: 0.4, bodyF: 520 }); // the head clinks
  }) },
  katana_slash: { dur: 0.34, variants: 3, peak: 0.5, attn: 'idle', fn: (P, v) => foley(P, (x, sr, r) => {
    whoosh(x, sr, r, { rise: 0.06, fall: 0.13 + v * 0.01, lo: 900, hi: 3800 + v * 250, q: 1.6, edge: 0.4, edgeF: 6400, color: 'white' });
  }) },
  katana_heavy: { dur: 0.45, variants: 2, peak: 0.55, attn: 'idle', fn: (P, v) => foley(P, (x, sr, r) => {
    whoosh(x, sr, r, { rise: 0.12 + v * 0.01, fall: 0.16, lo: 500, hi: 3000, q: 1.2, edge: 0.45, edgeF: 5600, color: 'white' });
    addScrape(x, sr, r, 0, 0.06, { f0: 5000, f1: 7000, q: 4, amp: 0.15, grit: 0.2 }); // the wrist turning the edge
  }) },
  katana_hit: { dur: 0.5, variants: 3, peak: 0.7, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    chop(x, sr, r, { low: 200, thump: 0.45, wet: 0.6, bone: 0.25, sqF: 1300, ring: 0.3, ringF: 3600 }); // a clean cut, the blade sings
    addScrape(x, sr, r, 0.004, 0.09, { f0: 3000, f1: 1800, q: 2, amp: 0.25, grit: 0.5 }); // drawn through
  }, 0.05) },
  katana_draw: { dur: 0.9, peak: 0.5, attn: 'idle', fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0.02, 0.42, { f0: 2600, f1: 6200, q: 3.5, amp: 0.5, grit: 0.25, rise: 0.4 }); // steel along the scabbard's throat
    const ring = { f: 2850, amp: 0.8, tau: 0.38, fall: 0.86, n: 4, ratios: [1, 1.59, 2.68, 3.54], noise: 0.08, spread: 0.008 };
    addMetal(x, sr, r, 0.42, ring);
    addMetal(x, sr, r, 0.42, { ...ring, f: 2850 * 1.004, amp: 0.55 });
  }, 0.1) },
  blade_wall: { dur: 0.5, variants: 2, peak: 0.6, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.00005, tau: 0.003, filters: [['bandpass', 2800, 0.9]] });
    addMetal(x, sr, r, 0, { f: r.jit(2100, 0.06), amp: 0.9, tau: 0.16, fall: 0.8, n: 5, ratios: [1, 1.58, 2.71, 3.62, 4.4], noise: 0.25, body: 0.4, bodyF: 400 });
    addGrains(x, sr, r, { t0: 0.003, span: 0.08, count: 18, f: [1200, 5000], amp: [0.1, 0.35], decay: 0.04 }); // grit off the wall
  }, 0.12) },
  // ---- crossbow
  crossbow_fire: { dur: 0.6, variants: 2, peak: 0.6, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: r.jit(155, 0.05), f1: 110, glide: 0.06, tau: 0.09, amp: 0.9, vib: 0.06, vibF: 38, a: 0.0005 }); // the string
    addTone(x, sr, 0, { f: r.jit(310, 0.05), f1: 230, glide: 0.05, tau: 0.05, amp: 0.35, a: 0.0005 });
    addBurst(x, sr, r, 0, 0.8, { a: 0.0002, tau: 0.008, color: 'pink', filters: [['bandpass', 900, 0.9]] }); // the slap on the stops
    addMetal(x, sr, r, 0.001, { f: 1400, amp: 0.3, tau: 0.03, n: 3, body: 0.5, bodyF: 260 }); // limbs and latch
    whoosh(x, sr, r, { rise: 0.02, fall: 0.12, lo: 1800, hi: 5200, q: 2, edge: 0, t0: 0.004 }); // the bolt away
  }, 0.05) },
  crossbow_crank: { dur: 0.75, peak: 0.45, attn: 'idle', fn: (P) => foley(P, (x, sr, r) => {
    for (let i = 0; i < 9; i++) addMetal(x, sr, r, 0.03 + i * 0.065 + r.range(-0.006, 0.006), { f: r.jit(3000, 0.06), amp: r.range(0.3, 0.5), tau: 0.006, n: 3, body: 0.3, bodyF: 900 }); // the ratchet
    addScrape(x, sr, r, 0.02, 0.6, { f0: 600, f1: 900, q: 1.2, amp: 0.12, grit: 0.7, color: 'pink' }); // the string creaking back
    addTone(x, sr, 0.05, { f: 120, f1: 180, glide: 0.4, tau: 0.6, amp: 0.12, len: 0.6 });
  }) },
  crossbow_load: { dur: 0.5, peak: 0.5, attn: 'idle', fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: 2500, amp: 0.9, tau: 0.02, body: 0.6, bodyF: 600, bodyTau: 0.03 }); // the latch catches
    addScrape(x, sr, r, 0.08, 0.12, { f0: 1800, f1: 2600, q: 2, amp: 0.25, grit: 0.4 }); // the bolt slid down the rail
    addMetal(x, sr, r, 0.22, { f: 3400, amp: 0.4, tau: 0.01, n: 3 });
  }) },
  bolt_hit: { dur: 0.45, variants: 3, peak: 0.6, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.0002, tau: 0.01, color: 'pink', filters: [['bandpass', r.jit(1100, 0.1), 0.8]] });
    addTone(x, sr, 0, { f: r.jit(380, 0.08), tau: 0.06, amp: 0.6, vib: 0.08, vibF: 55 }); // the shaft quivers
    addTone(x, sr, 0, { f: r.jit(760, 0.08), tau: 0.035, amp: 0.25 });
    addGrains(x, sr, r, { t0: 0.002, span: 0.04, count: 10, f: [1500, 5000], amp: [0.1, 0.3], decay: 0.03 });
  }, 0.08) },
  bolt_flesh: { dur: 0.4, variants: 3, peak: 0.66, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    chop(x, sr, r, { low: 140, thump: 0.6, wet: 0.55, bone: 0.2, sqF: 700 });
    addTone(x, sr, 0.004, { f: r.jit(300, 0.1), tau: 0.03, amp: 0.25 });
  }, 0.05) },
  // ---- pipe bomb
  pipebomb_arm: { dur: 0.7, peak: 0.5, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: 3600, amp: 0.7, tau: 0.008, n: 3, body: 0.2, bodyF: 1500 }); // the switch
    addTone(x, sr, 0.03, { f: 900, f1: 3200, glide: 0.18, tau: 9, len: 0.4, amp: 0.25, a: 0.01, rel: 0.05 }); // the circuit charging
    beep(x, sr, 0.46, 2400, 0.06, 0.4);
  }) },
  pipebomb_beep: { dur: 0.16, peak: 0.55, attn: 'normal', fn: (P) => foley(P, (x, sr) => {
    beep(x, sr, 0, 2700, 0.07, 1);
  }) },
  pipebomb_explode: { rate: 22050, dur: 3.4, variants: 2, peak: 0.99, attn: 'loud', fn: (P) => explosion(P, {
    crack: 1.2, crackTau: 0.012, blast: 1.7, hold: 0.04, blastTau: 0.22, blastLP: 2600, blastResF: 420, thump: 0.95, thumpF0: 80, thumpF1: 36, thumpTau: 0.26,
    rumble: 0.4, rumbleTau: 0.6, rumbleLP: 420, debris: 170, debrisAmp: 0.6, ring: 0.25, ringF: 2400, drive: 3,
    tail: { tau: 0.7, lp: 2500, lpEnd: 320, pre: 0.01, slaps: [[0.13, 0.5], [0.32, 0.36], [0.58, 0.22], [0.9, 0.1]], wet: 0.5, slapWin: 0.3 },
  }) },
  // ---- cryo grenade
  cryo_burst: { rate: 22050, dur: 1.8, peak: 0.85, attn: 'loud', fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.0003, tau: 0.015, color: 'pink', filters: [['lowpass', 1800, 0.7]] }); // the canister pops
    addTone(x, sr, 0, { f: 110, f1: 55, glide: 0.05, tau: 0.08, amp: 0.7 });
    addBurst(x, sr, r, 0.005, 0.9, { len: 1.6, color: 'white', env: (t) => Math.min(1, t / 0.02) * Math.exp(-t / 0.45), filters: [['highpass', 2500, 0.7], ['peaking', 6000, 1, 5]] }); // the gas hissing out
    addGrains(x, sr, r, { t0: 0.1, span: 1.2, count: 90, f: [3000, 9000], amp: [0.05, 0.3], decay: 0.6, dur: [0.0003, 0.0015] }); // frost forming
    softclip(x, 1.4);
  }, 0.2) },
  freeze: { dur: 0.9, variants: 2, peak: 0.55, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    addGrains(x, sr, r, { t0: 0, span: 0.6, count: 70, shape: 1.2, f: [2500, 8000], q: [2, 6], amp: [0.1, 0.5], decay: 0.35, dur: [0.0003, 0.002] }); // the crackle
    for (let i = 0; i < 5; i++) addMetal(x, sr, r, 0.02 + i * r.range(0.05, 0.12), { f: r.range(4000, 7000), amp: r.range(0.1, 0.25), tau: 0.03, n: 3, noise: 0.1 }); // ice ticking
    addTone(x, sr, 0, { f: 140, f1: 90, glide: 0.2, tau: 0.25, amp: 0.2 });
  }, 0.1) },
  ice_shatter: { dur: 1.1, variants: 3, peak: 0.8, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 1, { a: 0.0001, tau: 0.02, filters: [['highpass', 1200, 0.7]] }); // the crack
    addTone(x, sr, 0, { f: r.jit(150, 0.1), f1: 70, glide: 0.03, tau: 0.06, amp: 0.6 }); // the body giving way
    for (let i = 0; i < 26; i++) addMetal(x, sr, r, Math.pow(r(), 1.8) * 0.7, { f: r.range(2500, 8500), amp: r.range(0.1, 0.45), tau: r.range(0.02, 0.08), n: 3, ratios: [1, 2.3, 3.7], noise: 0.2, spread: 0.06 }); // shards ringing
    addGrains(x, sr, r, { t0: 0.01, span: 0.5, count: 60, f: [2000, 9000], amp: [0.1, 0.5], decay: 0.25 }); // ...and skittering
  }, 0.12) },
};
