// Zombie survival Milestone 3 sounds: drops and power-ups (pickups.js, powerups.js): loot pickups, power-up stingers, the airdrop flare and plane.
// Recipes as in shove.js (the dsp.js kit; { dur, variants, peak, attn, jitter, fn(P, v) });
// list every name in your SOUND_GROUPS line in recipes.js too (the bank, the preview tool).
//  - loot: a pop as it falls out of a body (loot_drop), then a sound per kind when it's taken
//    (bills and a coin, an ammo can, a glass vial) - short, bright, readable over gunfire
//  - power-ups: a shimmer when one appears and a hum while it sits there (find it by ear), the
//    grab (a whoosh into a chord) plus a stinger of its own, a power-down when a timed one ends,
//    a poof when one fades unclaimed; the Nuke is a long, deep blast
//  - airdrops: the flare's ignition and its fizzing burn, the plane passing over, the crate
//    landing, its beacon, and the latches and lid when it's opened
import { addBurst, addTone, addMetal, addGrains, addScrape, mixInto, normalize, svf, pink, envBell, TAU } from './dsp.js';
import { foley } from './weapons.js';

// a bright struck chime: partials of a small bell
const chime = (x, sr, t0, f, amp, tau = 0.25) => {
  addTone(x, sr, t0, { f, tau, amp, a: 0.0015 });
  addTone(x, sr, t0, { f: f * 2.01, tau: tau * 0.55, amp: amp * 0.35, a: 0.0015 });
  addTone(x, sr, t0, { f: f * 3.03, tau: tau * 0.3, amp: amp * 0.18, a: 0.001 });
};
// a chord swell (each note with a little vibrato)
const chord = (x, sr, t0, fs, amp, len, a = 0.02) => {
  for (const [i, f] of fs.entries()) addTone(x, sr, t0 + i * 0.012, { f, tau: len * 0.45, len, amp: amp / fs.length * (1 - i * 0.08), a, vib: 0.004, vibF: 5.5, rel: len * 0.25 });
};
// a noise whoosh rising through a bandpass
const whoosh = (x, sr, r, t0, len, amp, f0 = 400, f1 = 3200) => {
  const n = Math.ceil(len * sr), w = pink(n, r);
  for (let i = 0; i < n; i++) w[i] *= envBell(i / sr, len * 0.7, len * 0.3);
  svf(w, sr, 'bp', (t) => f0 * Math.pow(f1 / f0, Math.min(1, t / len)), 1.4);
  normalize(w, 1);
  mixInto(x, w, t0 * sr, amp);
};
const boom = (x, sr, r, t0, amp, f = 70, tau = 0.5) => {
  addTone(x, sr, t0, { f: f * 1.6, f1: f * 0.5, glide: tau * 0.4, tau, amp, a: 0.002 });
  addBurst(x, sr, r, t0, amp * 0.9, { a: 0.003, tau: tau * 0.6, color: 'brown', filters: [['lowpass', 380, 0.7]] });
  addBurst(x, sr, r, t0, amp * 0.4, { a: 0.001, tau: 0.06, color: 'pink', filters: [['lowpass', 2200, 0.7]] });
};

export const DROP_FX = {
  // ---- loot
  loot_drop: { dur: 0.3, variants: 2, peak: 0.42, attn: 'normal', jitter: 0.06, fn: (P, v) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: v ? 820 : 700, f1: v ? 1500 : 1300, glide: 0.04, tau: 0.05, amp: 0.7, a: 0.001 }); // a pop out of the body
    addMetal(x, sr, r, 0.07, { f: 3400, amp: 0.4, tau: 0.03, n: 3, noise: 0.2 }); // ...and a clink as it lands
  }, 0.08) },
  loot_cash: { dur: 0.6, peak: 0.55, attn: 'idle', jitter: 0.03, fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0, 0.12, { f0: 2400, f1: 5200, q: 1.2, amp: 0.35, grit: 0.8, color: 'pink' }); // the bills riffle
    addGrains(x, sr, r, { t0: 0, span: 0.12, count: 14, f: [2500, 7000], amp: [0.05, 0.2], decay: 0.06 });
    chime(x, sr, 0.07, 2093, 0.6, 0.22); // ka-
    chime(x, sr, 0.15, 3136, 0.75, 0.32); // -ching
    addMetal(x, sr, r, 0.15, { f: 4200, amp: 0.25, tau: 0.08, n: 4, noise: 0.1 });
  }, 0.1) },
  loot_ammo: { dur: 0.5, peak: 0.6, attn: 'idle', jitter: 0.04, fn: (P) => foley(P, (x, sr, r) => {
    addGrains(x, sr, r, { t0: 0, span: 0.18, count: 22, shape: 1.2, f: [1800, 5200], amp: [0.1, 0.45], decay: 0.12, q: [3, 7] }); // rounds rattling
    for (let i = 0; i < 5; i++) addMetal(x, sr, r, 0.02 + i * 0.03 + r.range(0, 0.01), { f: r.range(2400, 3400), amp: 0.3, tau: 0.012, n: 3, noise: 0.2 });
    addMetal(x, sr, r, 0.21, { f: 1700, amp: 1, tau: 0.02, body: 0.9, bodyF: 260, bodyTau: 0.05 }); // the lid clacks shut
    addBurst(x, sr, r, 0.21, 0.4, { a: 0.0005, tau: 0.03, color: 'pink', filters: [['lowpass', 900, 0.7]] });
  }, 0.1) },
  loot_health: { dur: 0.8, peak: 0.55, attn: 'idle', jitter: 0.03, fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: 3600, amp: 0.55, tau: 0.05, n: 5, noise: 0.15, ratios: [1, 1.52, 2.3, 2.9, 3.7] }); // glass clink
    addTone(x, sr, 0.08, { f: 260, f1: 720, glide: 0.06, tau: 0.06, amp: 0.45, a: 0.004 }); // a gulp
    addTone(x, sr, 0.19, { f: 300, f1: 820, glide: 0.05, tau: 0.05, amp: 0.35, a: 0.004 });
    chime(x, sr, 0.25, 880, 0.3, 0.3); chime(x, sr, 0.33, 1318.5, 0.3, 0.35); // a soft "patched up" rise
  }, 0.15) },
  // ---- power-ups
  powerup_spawn: { dur: 1.2, peak: 0.5, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    whoosh(x, sr, r, 0, 0.5, 0.35, 600, 5000);
    const notes = [880, 1108.7, 1318.5, 1760, 2217.5];
    notes.forEach((f, i) => chime(x, sr, 0.08 + i * 0.06, f, 0.35, 0.4));
    addGrains(x, sr, r, { t0: 0.1, span: 0.8, count: 40, shape: 1, f: [4000, 9000], amp: [0.03, 0.12], decay: 0.5, q: [6, 12] }); // sparkle
  }, 0.25) },
  // the hum of a power-up on the floor (a loop, positional: you can find it by ear)
  powerup_loop: { rate: 22050, dur: 2, loop: 0.4, rms: 0.06, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    const n = x.length;
    for (let i = 0; i < n; i++) {
      const t = i / sr, am = 0.75 + 0.25 * Math.sin(TAU * 2 * t);
      x[i] += am * (0.4 * Math.sin(TAU * 220 * t) + 0.3 * Math.sin(TAU * 221.5 * t + 1) + 0.2 * Math.sin(TAU * 330 * t) + 0.12 * Math.sin(TAU * 660.5 * t));
    }
    addGrains(x, sr, r, { t0: 0, span: 2.4, count: 60, shape: 1, f: [3000, 8000], amp: [0.05, 0.2], decay: 1000, q: [8, 14] });
  }) },
  powerup_grab: { dur: 1.3, peak: 0.6, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    whoosh(x, sr, r, 0, 0.32, 0.5, 300, 4200);
    chord(x, sr, 0.26, [523.25, 659.25, 783.99, 1046.5], 1, 0.95, 0.01);
    chime(x, sr, 0.26, 2093, 0.25, 0.4);
  }, 0.3) },
  pu_maxammo: { dur: 1.1, peak: 0.6, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    for (let i = 0; i < 12; i++) addMetal(x, sr, r, 0.3 + i * 0.028, { f: r.range(2600, 3600), amp: 0.35, tau: 0.01, n: 3, noise: 0.25 }); // a belt feeding through
    addMetal(x, sr, r, 0.66, { f: 1500, amp: 1, tau: 0.03, body: 1, bodyF: 180, bodyTau: 0.08 }); // the bolt slams home
    addBurst(x, sr, r, 0.66, 0.5, { a: 0.0005, tau: 0.05, color: 'pink', filters: [['lowpass', 700, 0.7]] });
  }, 0.2) },
  pu_instakill: { dur: 1.6, peak: 0.65, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0.2, 0.4, { len: 0.35, color: 'pink', env: (t) => Math.pow(Math.min(1, t / 0.35), 2), filters: [['bandpass', 900, 0.8]] }); // a reverse swell
    boom(x, sr, r, 0.55, 0.9, 55, 0.6);
    for (const f of [146.8, 207.7, 293.7]) addTone(x, sr, 0.55, { f, tau: 0.5, amp: 0.3, a: 0.004, vib: 0.01, vibF: 7 }); // a tritone stab
    addTone(x, sr, 0.55, { f: 1174.7, f1: 880, glide: 0.4, tau: 0.35, amp: 0.15 });
  }, 0.35) },
  pu_doublecash: { dur: 1.2, peak: 0.6, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    addScrape(x, sr, r, 0.25, 0.12, { f0: 900, f1: 1400, q: 1.2, amp: 0.4, grit: 0.4 }); // the till drawer
    addMetal(x, sr, r, 0.37, { f: 1200, amp: 0.7, tau: 0.02, body: 0.6, bodyF: 300 });
    chime(x, sr, 0.3, 2637, 0.9, 0.5); // ding!
    for (let i = 0; i < 16; i++) addMetal(x, sr, r, 0.42 + Math.pow(i / 16, 1.4) * 0.6, { f: r.range(3200, 5200), amp: 0.25 * (1 - i / 20), tau: 0.04, n: 4, noise: 0.1 }); // coins pouring
  }, 0.2) },
  pu_nuke: { rate: 22050, dur: 3.5, peak: 0.85, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    boom(x, sr, r, 0.15, 1, 60, 1.1);
    addBurst(x, sr, r, 0.15, 0.7, { len: 3.2, color: 'brown', env: (t) => (t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) / 1.1)) * (0.8 + 0.2 * Math.sin(t * 9)), filters: [['lowpass', 260, 0.7]] }); // the long rumble
    addBurst(x, sr, r, 0.15, 0.45, { len: 1.6, color: 'pink', env: (t) => Math.exp(-t / 0.45), sweep: { mode: 'lp', fc: (t) => 4000 * Math.exp(-t / 0.4) + 200, q: 0.7 } });
    addGrains(x, sr, r, { t0: 0.3, span: 2, count: 50, shape: 1.6, f: [300, 2500], amp: [0.05, 0.3], decay: 0.9 }); // debris
    addTone(x, sr, 0, { f: 2400, f1: 300, glide: 0.08, tau: 0.08, amp: 0.25 }); // the flash's crack
  }, 0.4) },
  pu_firesale: { dur: 1.4, peak: 0.55, attn: 'none', fn: (P) => foley(P, (x, sr) => {
    const tune = [784, 988, 1175, 1568, 1175, 1568]; // a little game-show run
    tune.forEach((f, i) => { chime(x, sr, 0.25 + i * 0.09, f, 0.5, 0.18); addTone(x, sr, 0.25 + i * 0.09, { f: f / 2, tau: 0.08, amp: 0.2 }); });
    chord(x, sr, 0.8, [784, 988, 1175], 0.6, 0.55, 0.01);
  }, 0.25) },
  powerup_fade: { dur: 0.8, peak: 0.45, attn: 'none', fn: (P) => foley(P, (x, sr) => {
    addTone(x, sr, 0, { f: 880, tau: 0.12, amp: 0.6, a: 0.004 });
    addTone(x, sr, 0.14, { f: 587, tau: 0.16, amp: 0.6, a: 0.004 });
    addTone(x, sr, 0.28, { f: 440, f1: 330, glide: 0.2, tau: 0.25, amp: 0.55, a: 0.004 });
  }, 0.2) },
  powerup_vanish: { dur: 0.7, peak: 0.45, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.5, { len: 0.4, color: 'pink', env: (t) => envBell(t, 0.05, 0.35), sweep: { mode: 'bp', fc: (t) => 3000 * Math.exp(-t / 0.15) + 300, q: 1.5 } });
    addTone(x, sr, 0, { f: 1320, f1: 330, glide: 0.15, tau: 0.2, amp: 0.4 });
  }, 0.2) },
  // ---- airdrops
  airdrop_flare: { rate: 22050, dur: 1.4, peak: 0.6, attn: 'loud', fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.8, { a: 0.0005, tau: 0.02, filters: [['bandpass', 1800, 0.9]] }); // the striker pops
    addTone(x, sr, 0, { f: 180, f1: 90, glide: 0.04, tau: 0.05, amp: 0.5 });
    addBurst(x, sr, r, 0.03, 0.7, { len: 1.3, color: 'white', env: (t) => Math.min(1, t / 0.08) * Math.exp(-t / 1.2), filters: [['highpass', 1500, 0.7], ['peaking', 4200, 1.2, 6]] }); // a fierce hiss
    addGrains(x, sr, r, { t0: 0.05, span: 1.2, count: 40, shape: 1, f: [1500, 6000], amp: [0.1, 0.4], decay: 0.8 });
  }, 0.2) },
  flare_loop: { rate: 22050, dur: 2, loop: 0.4, rms: 0.07, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.6, { len: 2.4, color: 'white', env: (t) => 0.8 + 0.2 * Math.sin(t * 13) * Math.sin(t * 3.1), filters: [['highpass', 1800, 0.7], ['peaking', 3800, 1, 5]] });
    addGrains(x, sr, r, { t0: 0, span: 2.4, count: 110, shape: 1, f: [1200, 6000], amp: [0.05, 0.5], decay: 1000, dur: [0.0005, 0.003] }); // sputters
  }) },
  airdrop_plane: { rate: 22050, dur: 7, peak: 0.6, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    // a big prop plane passing over: an engine drone and blade chop that rises, peaks, and falls away
    // with the pitch dropping past (doppler)
    const n = x.length, T = 7;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, u = (t - 3.2) / 1.6;
      const env = Math.exp(-u * u) * 0.9 + 0.1 * Math.min(1, t / 0.5) * Math.max(0, 1 - t / T);
      const dop = 1.06 - 0.12 / (1 + Math.exp(-u * 2.2));
      ph += TAU * 72 * dop / sr;
      const chop = 0.6 + 0.4 * Math.sin(ph * 3.5);
      x[i] += env * chop * (0.5 * Math.sin(ph) + 0.3 * Math.sin(2 * ph + 0.4) + 0.18 * Math.sin(3 * ph + 1.1) + 0.1 * Math.sin(5 * ph));
    }
    addBurst(x, sr, r, 0, 0.35, { len: T, color: 'brown', env: (t) => Math.exp(-(((t - 3.2) / 1.8) ** 2)), filters: [['lowpass', 700, 0.7]] }); // the air it shoves
  }) },
  airdrop_land: { rate: 22050, dur: 1.2, peak: 0.8, attn: 'loud', fn: (P) => foley(P, (x, sr, r) => {
    boom(x, sr, r, 0, 1, 55, 0.25); // the crate hits the ground
    addBurst(x, sr, r, 0, 0.6, { a: 0.001, tau: 0.08, color: 'pink', filters: [['lowpass', 1200, 0.7], ['peaking', 300, 1, 6]] });
    addScrape(x, sr, r, 0.08, 0.35, { f0: 500, f1: 300, q: 3, amp: 0.25, grit: 0.9 }); // the wood creaks
    addGrains(x, sr, r, { t0: 0.02, span: 0.5, count: 30, f: [400, 3000], amp: [0.05, 0.3], decay: 0.25 }); // grit and gravel
    for (let i = 0; i < 4; i++) addMetal(x, sr, r, 0.03 + i * 0.05, { f: r.range(1400, 2200), amp: 0.2, tau: 0.02, n: 3 }); // the fittings rattle
  }, 0.2) },
  crate_beep: { dur: 0.25, peak: 0.35, attn: 'normal', fn: (P) => foley(P, (x, sr) => {
    addTone(x, sr, 0, { f: 1760, tau: 0.03, len: 0.09, amp: 0.8, a: 0.002, rel: 0.02 });
    addTone(x, sr, 0.1, { f: 2349, tau: 0.03, len: 0.08, amp: 0.6, a: 0.002, rel: 0.02 });
  }, 0.1) },
  crate_open: { rate: 22050, dur: 1.6, peak: 0.7, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: 1900, amp: 0.9, tau: 0.02, body: 0.7, bodyF: 400 }); // latch
    addMetal(x, sr, r, 0.14, { f: 2100, amp: 0.9, tau: 0.02, body: 0.7, bodyF: 420 }); // latch
    addScrape(x, sr, r, 0.28, 0.45, { f0: 350, f1: 620, q: 4, amp: 0.45, grit: 0.95 }); // the lid creaks up
    addBurst(x, sr, r, 0.78, 0.6, { a: 0.002, tau: 0.08, color: 'pink', filters: [['lowpass', 700, 0.7]] }); // ...and thumps down
    chord(x, sr, 0.8, [587.3, 880, 1174.7], 0.5, 0.7, 0.02); // what's inside
  }, 0.2) },
};
