// Zombie survival Milestone 3 sounds: the boss overhaul (bosses.js): a posture break, phase roars, the staged arrival, elites, the trophy.
// Recipes as in shove.js (the dsp.js kit; { dur, variants, peak, attn, jitter, fn(P, v) });
// list every name in your SOUND_GROUPS line in recipes.js too (the bank, the preview tool).
import { TAU, addBurst, addTone, addMetal, addGrains, addScrape } from './dsp.js';
import { foley, explosion, addGrunt, V } from './foley.js';

// pitch points with a vibrato: [[t, f], ...]
function vib(f0, f1, dur, depth = 0.04, rate = 6, n = 40) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * dur;
    pts.push([t, (f0 + (f1 - f0) * (i / n)) * (1 + depth * Math.sin(TAU * rate * t))]);
  }
  return pts;
}

// a bright bell: inharmonic partials with long tails (the trophy's chime)
function bell(x, sr, t0, f, amp, tau = 0.9) {
  for (const [k, a] of [[1, 1], [2.01, 0.45], [2.76, 0.3], [4.07, 0.18], [5.43, 0.1]]) addTone(x, sr, t0, { f: f * k, amp: amp * a, tau: tau / Math.sqrt(k), a: 0.002 });
}

export const BOSS_FX = {
  // ---- posture: the break (a crunch of bone and armour, a ringing hit, the weight dropping), a hit on the glowing weak point, getting back up
  boss_posture_break: { rate: 22050, dur: 2.0, peak: 0.95, attn: 'loud', fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 120, f1: 38, glide: 0.08, tau: 0.35, amp: 1.3, a: 0.001 }); // the weight going down
    addBurst(x, sr, r, 0, 1, { a: 0.0005, tau: 0.05, color: 'pink', filters: [['lowpass', 2200, 0.8], ['peaking', 300, 1.2, 6]] });
    addGrains(x, sr, r, { t0: 0.005, span: 0.18, count: 40, f: [600, 4200], amp: [0.2, 0.7], decay: 0.1, dur: [0.001, 0.006] }); // bone and plate cracking
    addMetal(x, sr, r, 0.01, { f: 900, amp: 0.8, tau: 0.25, fall: 0.85, n: 6, body: 0.8, bodyF: 210, bodyTau: 0.2, noise: 0.4 }); // a ringing hit
    addTone(x, sr, 0.02, { f: 1760, amp: 0.25, tau: 0.6, a: 0.003 });
    addTone(x, sr, 0.02, { f: 2637, amp: 0.15, tau: 0.45, a: 0.003 });
    addBurst(x, sr, r, 0.32, 0.7, { a: 0.003, tau: 0.12, color: 'brown', filters: [['lowpass', 420, 0.7]] }); // knees hitting the floor
    addTone(x, sr, 0.32, { f: 70, f1: 40, glide: 0.05, tau: 0.18, amp: 0.9 });
  }, 0.35, { tau: 0.5, lp: 3000, lpEnd: 500, slaps: [[0.12, 0.35], [0.3, 0.2]] }) },
  boss_weak_hit: { rate: 22050, dur: 0.6, variants: 2, peak: 0.7, attn: 'none', jitter: 0.04, fn: (P, v) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: v ? 1320 : 1180, f1: v ? 990 : 880, glide: 0.04, tau: 0.16, amp: 0.7, a: 0.0005 }); // a bright ping
    addTone(x, sr, 0, { f: v ? 2640 : 2360, tau: 0.08, amp: 0.3, a: 0.0005 });
    addBurst(x, sr, r, 0, 0.8, { a: 0.0004, tau: 0.03, color: 'pink', filters: [['lowpass', 1600, 0.8]] }); // and a wet crunch
    addTone(x, sr, 0, { f: 140, f1: 60, glide: 0.03, tau: 0.07, amp: 0.8 });
  }) },
  boss_recover: { rate: 22050, dur: 1.4, peak: 0.85, attn: 'loud', fn: (P) => foley(P, (x, sr, r) => {
    addGrunt(x, sr, r, 0.02, 1, { dur: 1.0, f0: vib(62, 96, 1.0, 0.06, 8), env: [[0, 0], [0.15, 0.7], [0.6, 1], [1.0, 0]], vowels: [[0, V.u], [0.5, V.a], [1, V.ae]], breath: 0.8, grit: 9 });
    addBurst(x, sr, r, 0, 0.5, { len: 0.5, color: 'brown', env: (t) => Math.min(1, t / 0.1) * Math.exp(-t / 0.25), filters: [['lowpass', 300, 0.7]] }); // pushing up off the floor
  }, 0.2) },
  // ---- a phase: a roar over a sub drop and a rising rush
  boss_phase: { rate: 22050, dur: 2.6, peak: 0.95, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.6, { len: 0.7, color: 'pink', env: (t) => Math.pow(Math.min(1, t / 0.7), 2), sweep: { mode: 'bp', fc: (t) => 200 + 2200 * Math.min(1, t / 0.7), q: 1.2 } }); // the rush
    addTone(x, sr, 0.68, { f: 95, f1: 32, glide: 0.25, tau: 0.8, amp: 1.2, a: 0.002 }); // the sub drop
    addBurst(x, sr, r, 0.68, 0.8, { a: 0.001, tau: 0.15, color: 'brown', filters: [['lowpass', 500, 0.7]] });
    addGrunt(x, sr, r, 0.72, 1, { dur: 1.6, f0: vib(78, 58, 1.6, 0.07, 7), env: [[0, 0], [0.1, 1], [1.1, 0.8], [1.6, 0]], vowels: [[0, V.ae], [0.5, V.a], [1.6, V.o]], breath: 0.7, grit: 10 });
  }, 0.35, { tau: 0.6, lp: 2400, lpEnd: 300, slaps: [[0.2, 0.4], [0.5, 0.25]] }) },
  // ---- the staged arrival: the ground rumbling, a far-off roar from where it comes, the title card's hit
  boss_rumble: { rate: 16000, dur: 5.5, peak: 0.75, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    const sw = (t) => Math.min(1, t / 3.2) ** 1.5 * Math.min(1, Math.max(0, (5.3 - t) / 1.2));
    addBurst(x, sr, r, 0, 1, { len: 5.4, color: 'brown', env: (t) => sw(t) * (0.75 + 0.25 * Math.sin(t * 5.1) * Math.sin(t * 1.7 + 1)), filters: [['lowpass', 140, 0.8]] });
    for (const [f, a] of [[31, 0.9], [41.2, 0.6], [55, 0.35]]) addTone(x, sr, 0, { f, amp: a, a: 3, tau: 4, len: 5.3, vib: 0.02, vibF: 0.7, rel: 1 });
    addGrains(x, sr, r, { t0: 1.5, span: 3.4, count: 60, shape: 0.8, f: [300, 1800], amp: [0.05, 0.25], decay: 4, dur: [0.002, 0.01] }); // grit shaken loose
  }) },
  boss_far_roar: { rate: 22050, dur: 3.6, variants: 2, peak: 0.9, attn: 'loud', fn: (P, v) => foley(P, (x, sr, r) => {
    const f = v ? 64 : 54;
    addGrunt(x, sr, r, 0.02, 1, { dur: 2.2, f0: vib(f, f * 0.7, 2.2, 0.08, 6), env: [[0, 0], [0.25, 1], [1.4, 0.85], [2.2, 0]], vowels: [[0, V.o], [0.6, V.a], [2.2, V.u]], breath: 0.9, grit: 10 });
    addBurst(x, sr, r, 0, 0.6, { len: 2.4, color: 'brown', env: (t) => Math.min(1, t / 0.3) * Math.exp(-t / 1.2), filters: [['lowpass', 180, 0.7]] });
  }, 0.6, { tau: 1.1, lp: 900, lpEnd: 200, pre: 0.04, slaps: [[0.3, 0.5], [0.7, 0.35], [1.2, 0.2]] }) },
  boss_title: { rate: 22050, dur: 3.4, peak: 0.9, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    // a war drum, then a low brass chord swelling under it
    for (const [t, a] of [[0, 1], [0.28, 0.6], [0.42, 1.1]]) {
      addTone(x, sr, t, { f: 72, f1: 44, glide: 0.06, tau: 0.3, amp: a, a: 0.001 });
      addBurst(x, sr, r, t, a * 0.6, { a: 0.0008, tau: 0.06, color: 'pink', filters: [['lowpass', 700, 0.8]] });
    }
    for (const f of [55, 82.4, 110, 130.8, 164.8]) {
      for (let k = 1; k <= 5; k++) addTone(x, sr, 0.42, { f: f * k * (1 + 0.003 * (k - 3)), amp: 0.32 / k ** 1.2, a: 0.35, tau: 1.4, len: 2.8, rel: 0.6, vib: 0.004, vibF: 5 });
    }
  }, 0.4, { tau: 0.9, lp: 2600, lpEnd: 500, slaps: [[0.18, 0.4], [0.45, 0.25]] }) },
  // ---- moves: the Butcher's meat hook (thrown on its chain, biting in), a meteor falling (the Inferno), a telegraph circle going down
  boss_hook_throw: { rate: 22050, dur: 0.9, peak: 0.7, attn: 'loud', fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.8, { len: 0.5, color: 'pink', env: (t) => Math.sin(Math.PI * Math.min(1, t / 0.45)) ** 2, sweep: { mode: 'bp', fc: (t) => 500 + 1800 * Math.min(1, t / 0.3), q: 1.3 } });
    for (let i = 0; i < 12; i++) addMetal(x, sr, r, 0.05 + i * 0.045 + r.range(-0.01, 0.01), { f: r.range(2400, 3600), amp: 0.35 * (1 - i / 14), tau: 0.012, n: 3, noise: 0.3 }); // the chain paying out
  }) },
  boss_hook_hit: { rate: 22050, dur: 0.8, peak: 0.85, attn: 'loud', fn: (P) => foley(P, (x, sr, r) => {
    addMetal(x, sr, r, 0, { f: 1500, amp: 1, tau: 0.08, n: 6, body: 0.9, bodyF: 330, bodyTau: 0.06, noise: 0.7 });
    addBurst(x, sr, r, 0.005, 0.8, { a: 0.001, tau: 0.05, color: 'pink', filters: [['lowpass', 1200, 0.8], ['peaking', 350, 1.2, 6]] });
    addTone(x, sr, 0, { f: 130, f1: 60, glide: 0.04, tau: 0.08, amp: 0.8 });
    addScrape(x, sr, r, 0.08, 0.5, { f0: 3000, f1: 1600, q: 2, amp: 0.4, grit: 0.8 }); // the chain dragging
  }) },
  boss_meteor: { rate: 22050, dur: 1.4, peak: 0.6, attn: 'loud', fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 1900, f1: 420, glide: 0.5, a: 0.05, tau: 1.2, len: 1.2, amp: 0.5, rel: 0.1 }); // the whistle down
    addBurst(x, sr, r, 0, 0.6, { len: 1.2, color: 'pink', env: (t) => Math.min(1, t / 1.0) ** 2, sweep: { mode: 'bp', fc: (t) => 2500 - 1700 * Math.min(1, t / 1.1), q: 1.6 } });
  }) },
  boss_telegraph: { rate: 22050, dur: 0.7, peak: 0.45, attn: 'normal', fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 220, f1: 440, glide: 0.25, a: 0.02, tau: 0.4, len: 0.6, amp: 0.6, vib: 0.03, vibF: 14 });
    addBurst(x, sr, r, 0, 0.3, { len: 0.5, color: 'pink', env: (t) => Math.min(1, t / 0.4), filters: [['bandpass', 900, 1.5]] });
  }) },
  // ---- elites: the alpha's arrival (a howl over a hit), one going down
  elite_spawn: { rate: 22050, dur: 2.4, peak: 0.9, attn: 'loud', fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 80, f1: 42, glide: 0.08, tau: 0.35, amp: 1.1, a: 0.001 });
    addBurst(x, sr, r, 0, 0.6, { a: 0.001, tau: 0.08, color: 'pink', filters: [['lowpass', 900, 0.8]] });
    addGrunt(x, sr, r, 0.12, 1, { dur: 1.7, f0: vib(260, 420, 1.7, 0.05, 6), env: [[0, 0], [0.3, 1], [1.2, 0.85], [1.7, 0]], vowels: [[0, V.u], [0.7, V.o], [1.7, V.u]], breath: 0.6, grit: 5 });
  }, 0.4, { tau: 0.7, lp: 3000, lpEnd: 600, slaps: [[0.2, 0.4], [0.5, 0.2]] }) },
  elite_down: { rate: 22050, dur: 1.6, peak: 0.8, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    addTone(x, sr, 0, { f: 110, f1: 45, glide: 0.06, tau: 0.25, amp: 1, a: 0.001 });
    addBurst(x, sr, r, 0, 0.5, { a: 0.001, tau: 0.06, color: 'pink', filters: [['lowpass', 800, 0.8]] });
    bell(x, sr, 0.06, 660, 0.35, 0.8);
    bell(x, sr, 0.16, 990, 0.3, 0.8);
  }, 0.3) },
  // ---- the trophy: it drops (a shimmer rising out of the body), you take it
  trophy_drop: { rate: 22050, dur: 2.6, peak: 0.75, attn: 'loud', fn: (P) => foley(P, (x, sr, r) => {
    const notes = [523.3, 659.3, 784, 1046.5, 1318.5];
    notes.forEach((f, i) => bell(x, sr, 0.05 + i * 0.09, f, 0.45, 1.1));
    addBurst(x, sr, r, 0, 0.35, { len: 1.4, color: 'white', env: (t) => Math.min(1, t / 0.3) * Math.exp(-t / 0.6), filters: [['highpass', 4000, 0.7]] }); // sparkle
    addGrains(x, sr, r, { t0: 0.1, span: 1.2, count: 40, f: [5000, 9000], amp: [0.05, 0.2], decay: 0.8, dur: [0.001, 0.003] });
  }, 0.45, { tau: 0.8, lp: 7000, lpEnd: 2000, slaps: [[0.15, 0.35], [0.35, 0.2]] }) },
  trophy_take: { rate: 22050, dur: 2.2, peak: 0.75, attn: 'none', fn: (P) => foley(P, (x, sr, r) => {
    addBurst(x, sr, r, 0, 0.5, { len: 0.4, color: 'pink', env: (t) => Math.pow(Math.min(1, t / 0.35), 2), sweep: { mode: 'bp', fc: (t) => 600 + 4000 * Math.min(1, t / 0.35), q: 1.4 } });
    for (const [t, f] of [[0.32, 784], [0.32, 1046.5], [0.32, 1318.5], [0.5, 1568]]) bell(x, sr, t, f, 0.35, 1.2);
  }, 0.4, { tau: 0.9, lp: 7000, lpEnd: 2000, slaps: [[0.18, 0.3]] }) },
  // ---- the Abomination's leap landing and the aftershock (a slam's second, wider ring)
  boss_quake: { rate: 22050, dur: 2.6, peak: 0.95, attn: 'loud', fn: (P) => explosion(P, {
    crack: 0.4, crackTau: 0.015, blast: 1.2, hold: 0.05, blastTau: 0.25, blastLP: 800, blastResF: 90, thump: 1.8, thumpF0: 48, thumpF1: 22, thumpTau: 0.5,
    rumble: 0.9, rumbleTau: 1.1, rumbleLP: 200, debris: 90, debrisAmp: 0.35, debrisT0: 0.08, debrisSpan: 1.6, drive: 2.2,
    tail: { tau: 0.8, lp: 1400, lpEnd: 200, pre: 0.01, slaps: [[0.2, 0.5], [0.5, 0.3]], wet: 0.5, slapWin: 0.3 },
  }) },
};
