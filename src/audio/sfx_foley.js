// Foley: doors, locks, chains, lockers, gates, flashlights, office & classroom objects,
// machines. Physical recipes: friction creaks are stick-slip impulse trains through body
// resonances; impacts are modal (inharmonic) rings plus contact noise.
import { ring, burst, grains, tone, envHump, envPts, xlerp, BQ, filt, mixInto, saturate, TAU } from './dsp.js';
import { RATIOS, thump, knock, metal, clink, latch, creak, scrape, whoosh, rumble, grit, paper } from './synth.js';

/** Glass in a door's wired-glass window rattling after an impact. */
function glassRattle(o, sr, t, R, amp = 0.2, n = 3) {
  for (let k = 0; k < n; k++) clink(o, sr, t + 0.012 * k + R.range(0, 0.02) * k, { f: R.range(2800, 4600), amp: amp * Math.pow(0.6, k), t60: 0.05, R });
}

export const FOLEY_SFX = {
  // ------------------------------------------------------------------ doors
  door_open_wood: { peak: -9, var: 4, gen(S) {
    const { sr, R } = S, o = S.alloc(1.25);
    latch(o, sr, 0, { amp: 0.3, f: R.range(1900, 2300), R });
    clink(o, sr, 0.07, { f: 2900, amp: 0.08, t60: 0.03, R });
    knock(o, sr, 0.1, { f: 175, amp: 0.3, t60: 0.1, click: 0.2, R });
    const peakU = R.range(0.3, 0.5), top = R.range(80, 120);
    creak(o, sr, 0.13, { dur: R.range(0.7, 0.9), body: 'door', R, gain: 2.2, jitter: 0.2,
      rate: (u) => (u < peakU ? xlerp(28, top, u / peakU) : xlerp(top, 45, (u - peakU) / (1 - peakU))),
      amp: envPts([[0, 0], [0.12, 0.7], [peakU, 1], [0.85, 0.6], [1, 0]]) });
    whoosh(o, sr, 0.15, { dur: 0.7, f0: 200, fm: 650, f1: 250, amp: 0.12, R });
    return o;
  } },
  door_close_wood: { peak: -7, var: 4, gen(S) {
    const { sr, R } = S, o = S.alloc(0.95), hitT = R.range(0.26, 0.34);
    creak(o, sr, 0, { dur: hitT, body: 'door', R, gain: 0.45, rate: (u) => xlerp(70, 30, u), amp: envHump(0.3, 1) });
    whoosh(o, sr, 0.02, { dur: hitT, f0: 250, fm: 500, f1: 300, peak: 0.8, amp: 0.15, R });
    thump(o, sr, hitT, { f: 88, to: 62, t60: 0.3, amp: 1, noise: 0.6, lp: 1000, R });
    knock(o, sr, hitT, { f: 160, amp: 0.8, t60: 0.15, click: 0.5, R });
    latch(o, sr, hitT + 0.008, { amp: 0.6, f: 2100, R });
    glassRattle(o, sr, hitT + 0.02, R, 0.18, 3);
    return o;
  } },
  door_open_metal: { peak: -8, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(1.3);
    metal(o, sr, 0, { f: R.range(480, 560), amp: 1, t60: 0.25, click: 0.6, R });  // push bar clack
    latch(o, sr, 0.01, { amp: 0.8, f: 1900, R });
    metal(o, sr, 0.02, { f: 140, amp: 0.3, t60: 0.6, tilt: 0.8, R });           // door leaf ring
    creak(o, sr, 0.16, { dur: 0.65, body: 'metal', R, gain: 0.4, tone: 0.3, jitter: 0.1,
      rate: (u) => 180 + 280 * Math.sin(Math.PI * u), amp: envHump(0.35, 1) });
    whoosh(o, sr, 0.2, { dur: 0.8, f0: 180, fm: 520, f1: 220, amp: 0.12, R });
    return o;
  } },
  door_close_metal: { peak: -6, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(1.3), h = R.range(0.16, 0.22);
    whoosh(o, sr, 0, { dur: h, f0: 200, fm: 600, f1: 400, peak: 0.85, amp: 0.15, R });
    metal(o, sr, h, { f: R.range(105, 125), amp: 1, t60: 0.9, click: 0.6, tilt: 0.82, R });
    thump(o, sr, h, { f: 72, to: 50, t60: 0.3, amp: 0.9, noise: 0.6, R });
    latch(o, sr, h + 0.01, { amp: 0.7, f: 2000, R });
    metal(o, sr, h + 0.03, { f: 900, amp: 0.25, t60: 0.05, ratios: RATIOS.bar, R });
    metal(o, sr, h + 0.065, { f: 950, amp: 0.15, t60: 0.05, ratios: RATIOS.bar, R });
    return o;
  } },
  door_locked: { peak: -9, var: 4, gen(S) {
    const { sr, R } = S, o = S.alloc(0.6);
    const n = R.int(2, 3);
    for (let k = 0; k < n; k++) {
      const t = 0.01 + k * R.range(0.09, 0.13), a = k === 0 ? 1 : R.range(0.6, 0.85);
      knock(o, sr, t, { f: R.range(190, 230), amp: 0.6 * a, t60: 0.08, click: 0.3, R });
      clink(o, sr, t + 0.004, { f: R.range(2400, 2800), amp: 0.3 * a, t60: 0.03, R });
      thump(o, sr, t, { f: 120, to: 100, t60: 0.06, amp: 0.35 * a, noise: 0.3, R });
    }
    clink(o, sr, 0, { f: 3100, amp: 0.15, t60: 0.02, R }); // knob turn
    return o;
  } },
  door_creak_slow: { peak: -9, var: 2, gen(S) {
    // the Colonel opening a classroom door: long, slow, irregular, a held breath of a sound
    const { sr, R } = S, d = R.range(2.6, 3.2), o = S.alloc(d + 0.5);
    const w1 = R.range(2.5, 3.5);
    creak(o, sr, 0.05, { dur: d, body: 'door', R, gain: 1, jitter: 0.32, tone: 0.12,
      rate: (u) => 12 + 24 * Math.pow(Math.sin(Math.PI * u), 0.7) + 7 * Math.sin(TAU * w1 * u),
      amp: envPts([[0, 0], [0.06, 0.7], [0.3, 1], [0.55, 0.75], [0.8, 0.95], [1, 0]]) });
    creak(o, sr, 0.3, { dur: d * 0.8, body: 'timber', R, gain: 0.5, jitter: 0.25, rate: (u) => 8 + 6 * Math.sin(Math.PI * u), amp: envHump(0.5, 1) });
    thump(o, sr, d + 0.06, { f: 95, to: 80, t60: 0.15, amp: 0.25, noise: 0.4, R });
    return o;
  } },
  door_slam: { peak: -3, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(1.8), h = 0.12;
    whoosh(o, sr, 0, { dur: h + 0.02, f0: 300, fm: 900, f1: 700, peak: 0.9, amp: 0.25, R });
    thump(o, sr, h, { f: 62, to: 40, t60: 0.55, amp: 1.2, noise: 0.9, lp: 1600, R });
    knock(o, sr, h, { f: 140, amp: 1, t60: 0.25, click: 0.8, R });
    burst(o, sr, h, { dur: 0.03, t60: 0.02, gain: 0.55, R, filters: [['hp', 1500, 0.7]] });
    latch(o, sr, h + 0.006, { amp: 0.8, f: 2000, R });
    glassRattle(o, sr, h + 0.025, R, 0.25, 6);
    rumble(o, sr, h, { dur: 0.9, lp: 180, amp: 0.45, env: (u) => Math.exp(-u * 5), R });
    return o;
  } },
  key_unlock: { peak: -10, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(1.0);
    for (let k = 0; k < 5; k++) clink(o, sr, 0.01 + k * R.range(0.026, 0.036), { f: R.range(3300, 4300), amp: 0.25, t60: 0.02, R });
    scrape(o, sr, 0, { dur: 0.19, f: 4500, q: 1.2, grain: 160, amp: envHump(0.5, 1), gain: 0.12, R });
    clink(o, sr, 0.38, { f: 2900, amp: 0.3, t60: 0.03, R });
    clink(o, sr, 0.45, { f: 2700, amp: 0.25, t60: 0.03, R });
    metal(o, sr, 0.56, { f: R.range(880, 1000), amp: 1, t60: 0.12, ratios: RATIOS.bar, click: 0.7, R });
    thump(o, sr, 0.56, { f: 180, to: 140, t60: 0.06, amp: 0.4, noise: 0.4, R });
    return o;
  } },
  chain_rattle: { peak: -8, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(1.5);
    let t = 0;
    while (t < 1.15) {
      const rate = t < 0.4 ? 45 : 45 * Math.exp(-(t - 0.4) * 3) + 4;
      t += -Math.log(1 - R.r() * 0.99) / rate;
      clink(o, sr, t, { f: R.range(2100, 5200), amp: R.range(0.2, 0.7) * (t < 0.5 ? 1 : 0.6), t60: R.range(0.05, 0.12), R });
    }
    for (const tt of [0.04, R.range(0.25, 0.35)]) {
      metal(o, sr, tt, { f: R.range(650, 780), amp: 0.7, t60: 0.2, ratios: RATIOS.medal, R });
      knock(o, sr, tt, { f: 180, amp: 0.4, t60: 0.1, R });
    }
    scrape(o, sr, 0, { dur: 0.9, f: 2500, q: 0.8, grain: 90, amp: (u) => Math.exp(-u * 2.5), gain: 0.2, R });
    return o;
  } },
  padlock: { peak: -9, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(0.7);
    latch(o, sr, 0, { amp: 1, f: 2700, R });
    metal(o, sr, 0.015, { f: R.range(1050, 1250), amp: 0.8, t60: 0.25, ratios: RATIOS.medal, R });
    metal(o, sr, 0.12, { f: 900, amp: 0.45, t60: 0.2, ratios: RATIOS.medal, R });
    knock(o, sr, 0.12, { f: 200, amp: 0.3, t60: 0.08, R });
    clink(o, sr, 0.3, { f: 2400, amp: 0.2, t60: 0.06, R });
    return o;
  } },
  bolt_cutters: { peak: -4, var: 2, gen(S) {
    const { sr, R } = S, o = S.alloc(2.1), snap = R.range(0.85, 0.95);
    clink(o, sr, 0, { f: 2000, amp: 0.4, t60: 0.06, R });
    creak(o, sr, 0.15, { dur: snap - 0.15, body: 'metal', R, gain: 0.45, tone: 0.25, jitter: 0.12,
      rate: (u) => 50 + 160 * u, amp: (u) => Math.pow(u, 1.4) });
    scrape(o, sr, 0.15, { dur: snap - 0.15, f: 1800, f1: 3400, q: 2, grain: 40, amp: (u) => u * u, gain: 0.25, R });
    burst(o, sr, snap, { dur: 0.02, t60: 0.012, gain: 1.6, R, filters: [['hp', 1200, 0.7]] });
    metal(o, sr, snap, { f: 2300, amp: 1.2, t60: 0.09, ratios: RATIOS.bar, click: 1, R });
    thump(o, sr, snap, { f: 140, to: 90, t60: 0.1, amp: 0.9, noise: 0.5, R });
    let t = snap + 0.04;
    while (t < snap + 0.75) { t += -Math.log(1 - R.r() * 0.99) / 30; clink(o, sr, t, { f: R.range(2000, 4800), amp: R.range(0.15, 0.5), t60: 0.08, R }); }
    thump(o, sr, snap + 0.42, { f: 100, to: 70, t60: 0.12, amp: 0.6, noise: 0.6, R });
    for (let k = 0; k < 4; k++) clink(o, sr, snap + 0.42 + k * 0.03, { f: R.range(1800, 3500), amp: 0.35, t60: 0.06, R });
    return o;
  } },

  // ------------------------------------------------------------------ lockers & gates
  locker_open: { peak: -9, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(1.0);
    metal(o, sr, 0, { f: R.range(1250, 1450), amp: 0.8, t60: 0.06, ratios: RATIOS.bar, click: 0.9, R });
    clink(o, sr, 0.03, { f: 2600, amp: 0.3, t60: 0.03, R });
    // sheet-metal door flexing as it swings ("boing")
    tone(o, sr, 0.08, 0.6, { f: (t) => 170 * (1 + 0.05 * Math.sin(TAU * 9 * t)), a: (t) => 0.35 * Math.exp(-t / 0.12) });
    metal(o, sr, 0.08, { f: 240, amp: 0.4, t60: 0.4, tilt: 0.8, R });
    creak(o, sr, 0.12, { dur: 0.3, body: 'metal', R, gain: 0.3, tone: 0.3, rate: (u) => 320 + 420 * Math.sin(Math.PI * u), amp: envHump(0.4, 1) });
    return o;
  } },
  locker_close: { peak: -6, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(1.1);
    metal(o, sr, 0.02, { f: R.range(140, 165), amp: 1, t60: 0.7, click: 0.7, tilt: 0.85, R });
    thump(o, sr, 0.02, { f: 95, to: 70, t60: 0.15, amp: 0.6, noise: 0.5, R });
    for (let k = 0; k < 5; k++) metal(o, sr, 0.03 + k * 0.035 * (1 + 0.35 * k), { f: 1250 * R.jit(1, 0.05), amp: 0.4 * Math.pow(0.7, k), t60: 0.04, ratios: RATIOS.bar, R });
    latch(o, sr, 0.05, { amp: 0.6, f: 2200, R });
    return o;
  } },
  locker_tap: { peak: -10, var: 5, gen(S) {
    // a ringed knuckle on sheet metal: bright 'tink' of the ring + the hollow locker
    const { sr, R } = S, o = S.alloc(0.55);
    clink(o, sr, 0, { f: R.range(3200, 4000), amp: 0.8, t60: 0.06, R });
    metal(o, sr, 0.002, { f: R.range(210, 250), amp: 0.55, t60: 0.38, click: 0.2, tilt: 0.8, R });
    thump(o, sr, 0, { f: 180, to: 150, t60: 0.05, amp: 0.3, noise: 0.3, R });
    return o;
  } },
  gate_rattle: { peak: -7, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(1.5);
    const n = R.int(5, 7);
    for (let k = 0; k < n; k++) {
      const t = k * R.range(0.12, 0.16), a = 1 - k / (n + 1);
      for (let j = 0; j < R.int(8, 14); j++) clink(o, sr, t + R.range(0, 0.06), { f: R.range(1800, 4800), amp: R.range(0.2, 0.5) * a, t60: R.range(0.03, 0.08), R });
      metal(o, sr, t, { f: R.range(380, 460), amp: 0.6 * a, t60: 0.25, R });
      if (k % 2 === 0) metal(o, sr, t + 0.02, { f: 1100, amp: 0.4 * a, t60: 0.15, ratios: RATIOS.medal, R });
    }
    return o;
  } },

  // ------------------------------------------------------------------ flashlights, tape, video
  flashlight_click: { peak: -14, var: 4, gen(S) {
    const { sr, R } = S, o = S.alloc(0.13);
    clink(o, sr, 0, { f: R.range(2700, 3100), amp: 0.7, t60: 0.015, R });
    knock(o, sr, 0, { f: 900, amp: 0.4, t60: 0.02, click: 0.5, R });
    clink(o, sr, 0.045, { f: 3400, amp: 0.35, t60: 0.01, R });
    return o;
  } },
  battery_swap: { peak: -12, var: 2, gen(S) {
    const { sr, R } = S, o = S.alloc(1.8);
    const turn = (t) => { scrape(o, sr, t, { dur: 0.08, f: 3800, q: 1.5, grain: 120, amp: envHump(0.5, 1), gain: 0.6, R }); clink(o, sr, t + 0.06, { f: 3000, amp: 0.1, t60: 0.01, R }); };
    for (let k = 0; k < 4; k++) turn(k * 0.12);
    scrape(o, sr, 0.55, { dur: 0.2, f: 1500, q: 1, grain: 50, amp: envHump(0.6, 1), gain: 0.5, R });
    for (const t of [0.78, 0.83]) { metal(o, sr, t, { f: R.range(1500, 1700), amp: 0.6, t60: 0.05, ratios: RATIOS.bar, R }); knock(o, sr, t, { f: 400, amp: 0.3, t60: 0.04, R }); }
    for (const t of [1.05, 1.17]) { knock(o, sr, t, { f: 300, amp: 0.6, t60: 0.05, R }); clink(o, sr, t, { f: 2200, amp: 0.3, t60: 0.03, R }); }
    for (let k = 0; k < 3; k++) turn(1.3 + k * 0.1);
    clink(o, sr, 1.62, { f: 2900, amp: 0.5, t60: 0.015, R });
    return o;
  } },
  flashlight_flicker: { peak: -18, var: 4, gen(S) {
    const { sr, R } = S, o = S.alloc(0.5);
    const n = R.int(4, 7);
    for (let k = 0; k < n; k++) {
      const t = R.range(0, 0.42), d = R.range(0.01, 0.04);
      grains(o, sr, t, { dur: d, R, rate: 1800, amp: 1, f: [2000, 7000], t60: [0.0005, 0.002], click: 1 });
      tone(o, sr, t, d, { f: 100, a: 0.08, wave: 'saw' });
    }
    ring(o, sr, R.range(0, 0.2), 4200, 0.12, 0.05);
    return o;
  } },
  flashlight_roll: { peak: -12, var: 2, gen(S) {
    // Danny's plastic flashlight: drops, bounces, rolls (one tick per revolution), rocks still
    const { sr, R } = S, o = S.alloc(2.9);
    knock(o, sr, 0, { f: 700, amp: 0.9, t60: 0.05, click: 0.6, R }); clink(o, sr, 0, { f: 2500, amp: 0.3, t60: 0.03, R });
    knock(o, sr, 0.14, { f: 760, amp: 0.55, t60: 0.05, R });
    knock(o, sr, 0.22, { f: 820, amp: 0.3, t60: 0.04, R });
    const t0 = 0.25, dur = 2.05;
    scrape(o, sr, t0, { dur, f: 900, q: 0.9, grain: 220, depth: 0.5, amp: (u) => Math.pow(1 - u, 1.2) * 0.4, gain: 0.8, R });
    let ph = 0;
    for (let i = 0; i < dur * sr; i += 64) {
      const u = i / (dur * sr), fr = 5.5 * Math.pow(1 - u, 1.3) + 0.4;
      ph += fr * 64 / sr;
      if (ph >= 1) { ph -= 1; const t = t0 + i / sr; knock(o, sr, t, { f: 1400, amp: 0.28 * (1 - u * 0.8), t60: 0.02, click: 0.4, R }); clink(o, sr, t, { f: 3000, amp: 0.08, t60: 0.015, R }); }
    }
    [[2.35, 0.2], [2.6, 0.12], [2.78, 0.06]].forEach(([t, a]) => knock(o, sr, t, { f: 900, amp: a, t60: 0.04, R }));
    return o;
  } },
  camcorder_click: { peak: -15, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(0.38);
    clink(o, sr, 0, { f: 3200, amp: 0.5, t60: 0.01, R });
    knock(o, sr, 0, { f: 1100, amp: 0.3, t60: 0.015, R });
    latch(o, sr, 0.06, { amp: 0.3, f: 2600, R });
    tone(o, sr, 0.09, 0.16, { f: (t) => 380 + 200 * t, a: (t) => 0.25 * envHump(0.04, 0.16)(t), wave: 'saw' });
    return filt(o, new BQ(sr, 'lp', 3500, 0.7));
  } },
  camcorder_whir: { peak: -14, var: 2, gen(S) {
    const { sr, R } = S, o = S.alloc(1.9), m = S.alloc(1.9);
    knock(o, sr, 0, { f: 500, amp: 0.7, t60: 0.04, R }); latch(o, sr, 0.02, { amp: 0.4, f: 2200, R });
    tone(m, sr, 0.05, 1.6, { f: (t) => 520 * (1 - 0.35 * Math.exp(-t / 0.08)) + 6 * Math.sin(TAU * 30 * t), a: envPts([[0, 0], [0.1, 0.5], [1.4, 0.5], [1.6, 0]]), wave: 'saw', harm: 8 });
    filt(m, new BQ(sr, 'bp', 900, 0.8));
    mixInto(o, m, sr, 0, 1);
    burst(o, sr, 0.05, { dur: 1.55, R, color: 'brown', gain: 0.25, env: envPts([[0, 0], [0.1, 1], [1.4, 1], [1.55, 0]]), filters: [['lp', 300, 0.8]] });
    grains(o, sr, 0.05, { dur: 1.5, R, rate: 80, amp: 0.12, f: [1500, 3000], t60: [0.003, 0.01] });
    knock(o, sr, 1.62, { f: 600, amp: 0.5, t60: 0.04, R });
    return o;
  } },
  tape_play: { peak: -12, var: 2, gen(S) {
    const { sr, R } = S, o = S.alloc(1.25), m = S.alloc(1.25);
    knock(o, sr, 0, { f: 450, amp: 0.7, t60: 0.04, click: 0.6, R });
    latch(o, sr, 0.005, { amp: 0.5, f: 1800, R });
    knock(o, sr, 0.08, { f: 300, amp: 0.4, t60: 0.05, R });
    tone(m, sr, 0.08, 1.1, { f: (t) => 380 * (1 - Math.exp(-t / 0.09)) + 1, a: envPts([[0, 0], [0.15, 0.4], [0.9, 0.3], [1.1, 0]]), wave: 'saw', harm: 6 });
    filt(m, new BQ(sr, 'lp', 900, 0.7));
    mixInto(o, m, sr, 0, 0.3);
    burst(o, sr, 0.15, { dur: 1.05, R, gain: 0.12, env: envPts([[0, 0], [0.2, 1], [0.9, 1], [1.05, 0]]), filters: [['bp', 5000, 0.5]] });
    return o;
  } },
  vhs_noise: { peak: -10, var: 2, gen(S) {
    // video static: field-rate (59.94 Hz) buzz on hiss, tracking warbles, head-switch ticks
    const { sr, R } = S, d = 2.5, o = S.stereo(d);
    for (const c of o) {
      burst(c, sr, 0, { dur: d, R, gain: 0.55, env: envPts([[0, 0], [0.04, 1], [d - 0.15, 1], [d, 0]]), filters: [['hp', 400, 0.7], ['peak', 5000, 0.7, 4]] });
      for (let i = 0; i < c.length; i++) { const ph = (i / sr) * 59.94 % 1; c[i] *= ph < 0.08 ? 1.5 : 0.82; }
      for (let k = 0; k < R.int(2, 3); k++) scrape(c, sr, R.range(0.1, d - 0.6), { dur: R.range(0.2, 0.45), f: R.range(1200, 2000), f1: R.range(4000, 7000), q: 3, grain: 60, amp: envHump(0.3, 1), gain: 0.8, R });
      for (let t = 0; t < d; t += 1 / 29.97) burst(c, sr, t, { dur: 0.003, t60: 0.002, gain: 0.08, R, filters: [['hp', 3000]] });
      tone(c, sr, 0, d, { f: 60, a: 0.04 });
    }
    return o;
  } },

  // ------------------------------------------------------------------ classroom & office
  chalk: { peak: -12, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(1.4);
    let t = 0.01;
    for (let k = 0; k < R.int(3, 4); k++) {
      const d = R.range(0.16, 0.34);
      knock(o, sr, t, { f: 2200, amp: 0.45, t60: 0.012, click: 0.9, R });
      scrape(o, sr, t, { dur: d, f: R.range(2200, 3000), q: 1, grain: 90, depth: 0.9, amp: envHump(0.3, 1), gain: 1.4, R });
      grains(o, sr, t, { dur: d, R, rate: 260, amp: envHump(0.3, 1), f: [2000, 6000], t60: [0.001, 0.004], click: 0.5, gain: 0.5 });
      if (R.chance(0.25)) tone(o, sr, t + d * 0.4, 0.05, { f: R.range(2100, 2600), a: (tt) => 0.025 * envHump(0.02, 0.05)(tt) });
      t += d + R.range(0.04, 0.12);
    }
    return o;
  } },
  chair_scrape: { peak: -10, var: 4, gen(S) {
    const { sr, R } = S, d = R.range(0.45, 0.75), o = S.alloc(d + 0.15);
    const top = R.range(90, 150);
    creak(o, sr, 0, { dur: d, body: 'chair', R, gain: 1, tone: 0.25, grit: 0.08, jitter: 0.25, rate: (u) => 50 + top * Math.sin(Math.PI * u), amp: envHump(0.25, 1) });
    scrape(o, sr, 0, { dur: d, f: 700, q: 0.8, grain: 40, amp: envHump(0.3, 1), gain: 0.25, R });
    knock(o, sr, d, { f: 400, amp: 0.25, t60: 0.05, R });
    return o;
  } },
  desk_creak: { peak: -12, var: 4, gen(S) {
    const { sr, R } = S, o = S.alloc(0.6);
    creak(o, sr, 0, { dur: R.range(0.3, 0.45), R, gain: 1, jitter: 0.22, res: [[260, 6, 1], [640, 9, 0.6], [1500, 10, 0.3]], rate: (u) => 35 + 25 * Math.sin(Math.PI * u), amp: envHump(0.4, 1) });
    knock(o, sr, 0.45, { f: 240, amp: 0.3, t60: 0.06, R });
    return o;
  } },
  paper_rustle: { peak: -15, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(0.85);
    const p1 = R.range(0.2, 0.35);
    paper(o, sr, 0, { dur: 0.8, amp: 1, density: 500, R, env: (u) => Math.max(envHump(p1 * 0.5, p1)(u), envHump(p1 + 0.25, 1)(u) * 0.8) });
    return o;
  } },
  typewriter_key: { peak: -10, var: 8, jit: 0.04, gen(S) {
    const { sr, R } = S, o = S.alloc(0.2);
    knock(o, sr, 0, { f: R.range(1600, 2000), amp: 0.35, t60: 0.015, click: 0.5, R });
    const s = R.range(0.015, 0.024);
    burst(o, sr, s, { dur: 0.012, t60: 0.006, gain: 1.2, R, filters: [['bp', 2200, 0.7]] });
    knock(o, sr, s, { f: R.range(480, 560), amp: 0.9, t60: 0.04, click: 0.3, R });
    metal(o, sr, s, { f: 2100, amp: 0.3, t60: 0.03, ratios: RATIOS.bar, R });
    clink(o, sr, s + R.range(0.03, 0.04), { f: 3600, amp: 0.25, t60: 0.02, R });
    knock(o, sr, s + 0.07, { f: 1500, amp: 0.15, t60: 0.01, R });
    return o;
  } },
  trs80_key: { peak: -15, var: 6, jit: 0.04, gen(S) {
    const { sr, R } = S, o = S.alloc(0.11);
    clink(o, sr, 0, { f: R.range(2900, 3300), amp: 0.45, t60: 0.008, R });
    knock(o, sr, 0.004, { f: R.range(700, 800), amp: 0.6, t60: 0.025, click: 0.3, R });
    knock(o, sr, R.range(0.055, 0.07), { f: 900, amp: 0.2, t60: 0.015, R });
    return o;
  } },
  trs80_beep: { peak: -13, var: 1, jit: 0, gen(S) {
    const { sr } = S, o = S.alloc(0.18);
    tone(o, sr, 0, 0.16, { f: 1000, a: envPts([[0, 0], [0.003, 1], [0.13, 1], [0.15, 0]]), wave: 'square' });
    return filt(o, new BQ(sr, 'hp', 500, 0.7), new BQ(sr, 'lp', 4500, 0.7));
  } },
  safe_click: { peak: -14, var: 4, gen(S) {
    const { sr, R } = S, o = S.alloc(0.14);
    clink(o, sr, 0, { f: R.range(2400, 2800), amp: 0.7, t60: 0.03, R });
    metal(o, sr, 0, { f: 900, amp: 0.3, t60: 0.04, ratios: RATIOS.bar, R });
    knock(o, sr, 0, { f: 300, amp: 0.2, t60: 0.03, R });
    return o;
  } },
  safe_open: { peak: -8, var: 2, gen(S) {
    const { sr, R } = S, o = S.alloc(2.3);
    creak(o, sr, 0, { dur: 0.35, body: 'metal', R, gain: 0.35, rate: (u) => xlerp(30, 70, u), amp: envHump(0.5, 1) });
    metal(o, sr, 0.38, { f: 340, amp: 1, t60: 0.35, click: 0.5, R });
    thump(o, sr, 0.38, { f: 120, to: 90, t60: 0.15, amp: 0.6, R });
    metal(o, sr, 0.46, { f: 380, amp: 0.7, t60: 0.3, R });
    creak(o, sr, 0.7, { dur: 1.2, R, gain: 0.45, tone: 0.05, jitter: 0.2, res: [[250, 8, 1], [640, 12, 0.6], [1300, 15, 0.3]], rate: (u) => 18 + 25 * Math.sin(Math.PI * u), amp: envHump(0.4, 1) });
    whoosh(o, sr, 0.8, { dur: 1.0, f0: 150, fm: 500, f1: 200, amp: 0.12, R });
    knock(o, sr, 1.95, { f: 200, amp: 0.3, t60: 0.08, R });
    return o;
  } },
  stamp: { peak: -6, var: 4, gen(S) {
    // rubber stamp on paper on a steel desk: a soft-edged thunk, then the sticky lift
    const { sr, R } = S, o = S.alloc(0.45);
    burst(o, sr, 0, { dur: 0.014, attack: 0.003, t60: 0.01, gain: 0.5, R, filters: [['lp', 1800, 0.7]] });
    thump(o, sr, 0.002, { f: R.range(140, 160), to: 105, t60: 0.12, amp: 1, noise: 0.6, lp: 1200, R });
    knock(o, sr, 0.002, { f: 230, amp: 0.6, t60: 0.09, click: 0.05, R });
    ring(o, sr, 0.002, 95, 0.4, 0.15);
    burst(o, sr, R.range(0.13, 0.16), { dur: 0.03, t60: 0.02, gain: 0.15, R, filters: [['bp', 1800, 1.5]] });
    return o;
  } },
  pen_scratch: { peak: -15, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(1.05);
    let t = 0.01;
    for (let k = 0; k < 3; k++) {
      const d = R.range(0.2, 0.3);
      scrape(o, sr, t, { dur: d, f: R.range(3800, 4600), q: 1.1, grain: 140, depth: 0.85, amp: envHump(0.25, 1), R });
      grains(o, sr, t, { dur: d, R, rate: 300, amp: 0.3, f: [3000, 8000], t60: [0.001, 0.003], click: 0.6 });
      t += d + R.range(0.04, 0.09);
    }
    return o;
  } },
  book_close: { peak: -8, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(0.4);
    burst(o, sr, 0, { dur: 0.05, attack: 0.003, t60: 0.04, gain: 1, R, color: 'pink', filters: [['lp', 500, 0.7]] });
    knock(o, sr, 0.004, { f: R.range(270, 330), amp: 0.8, t60: 0.06, click: 0.8, R });
    grains(o, sr, 0, { dur: 0.03, R, rate: 600, amp: 0.4, f: [2000, 6000], t60: [0.001, 0.004] });
    return o;
  } },
  lever_pull: { peak: -5, var: 2, gen(S) {
    const { sr, R } = S, o = S.alloc(1.7);
    metal(o, sr, 0, { f: 600, amp: 0.5, t60: 0.1, ratios: RATIOS.bar, R });
    [0.1, 0.27, 0.41, 0.52, 0.61, 0.68].forEach((t) => { clink(o, sr, t, { f: 2700, amp: 0.6, t60: 0.03, R }); knock(o, sr, t, { f: 800, amp: 0.3, t60: 0.03, R }); });
    creak(o, sr, 0.1, { dur: 0.7, R, gain: 0.5, res: [[300, 8, 1], [750, 10, 0.6], [1600, 12, 0.3]], rate: (u) => xlerp(25, 45, u), amp: envHump(0.6, 1) });
    metal(o, sr, 0.78, { f: 160, amp: 1.1, t60: 0.6, click: 0.6, R });
    thump(o, sr, 0.78, { f: 70, to: 50, t60: 0.3, amp: 0.9, R });
    rumble(o, sr, 1.0, { dur: 0.6, lp: 150, amp: 0.3, R });
    return o;
  } },
  trapdoor: { peak: -5, var: 2, gen(S) {
    const { sr, R } = S, o = S.alloc(2.3);
    metal(o, sr, 0, { f: 900, amp: 0.6, t60: 0.25, ratios: RATIOS.medal, R });
    creak(o, sr, 0.1, { dur: 0.8, body: 'door', R, gain: 0.7, rate: (u) => xlerp(25, 60, u), amp: envHump(0.5, 1) });
    whoosh(o, sr, 0.85, { dur: 0.3, f0: 250, fm: 800, f1: 400, peak: 0.85, amp: 0.25, R });
    thump(o, sr, 1.12, { f: 70, to: 48, t60: 0.4, amp: 1.1, noise: 0.7, R });
    knock(o, sr, 1.12, { f: 150, amp: 0.9, t60: 0.2, R });
    ring(o, sr, 1.12, 85, 0.5, 0.6);
    grit(o, sr, 1.15, { dur: 0.8, rate: 150, amp: 0.15, R, env: (u) => Math.exp(-u * 3) });
    return o;
  } },
  mixer_start: { peak: -4, var: 1, gen(S) {
    // 1950s Hobart floor mixer: switch, spin-up, loud gear whine & bowl rattle, then spin-down
    const { sr, R } = S, d = 4.6, o = S.alloc(d), m = S.alloc(d);
    metal(o, sr, 0, { f: 500, amp: 0.8, t60: 0.3, R }); latch(o, sr, 0, { amp: 0.6, R });
    const spd = (t) => (t < 3 ? 1 - Math.exp(-t / 0.35) : (1 - Math.exp(-3 / 0.35)) * Math.exp(-(t - 3) / 0.45));
    const on = (t) => (t < 3 ? Math.min(1, t / 0.05) : Math.exp(-(t - 3) / 0.05));
    tone(m, sr, 0, d, { f: 120, a: (t) => 0.35 * on(t), wave: 'saw', harm: 10 }); // motor hum
    tone(m, sr, 0, d, { f: (t) => 20 + 620 * spd(t), a: (t) => 0.3 * spd(t), harm: 4, wave: 'saw' });
    filt(m, new BQ(sr, 'bp', 700, 0.6));
    mixInto(o, m, sr, 0, 1);
    const rat = S.alloc(d);
    burst(rat, sr, 0, { dur: d, R, gain: 0.6, env: () => 1, filters: [['bp', 900, 1.2]] });
    let ph = 0;
    for (let i = 0; i < rat.length; i++) { const t = i / sr; ph += 24 * spd(t) / sr; rat[i] *= spd(t) * (0.5 + 0.5 * Math.pow(Math.abs(Math.sin(Math.PI * ph)), 4)); }
    mixInto(o, rat, sr, 0, 1);
    grains(o, sr, 0, { dur: d, R, rate: (u) => 1 + 70 * spd(u * d), amp: (u) => spd(u * d), f: [1000, 3000], t60: [0.005, 0.02], gain: 0.4 });
    return saturate(o, 1.4);
  } },
  dumbwaiter: { peak: -8, var: 2, gen(S) {
    const { sr, R } = S, o = S.alloc(3.5);
    for (let k = 0; k < 5; k++) creak(o, sr, 0.2 + 0.52 * k * R.jit(1, 0.08), { dur: 0.25, body: 'metal', R, gain: 0.22, tone: 0.3, rate: (u) => 300 + 220 * Math.sin(Math.PI * u), amp: envHump(0.5, 1) });
    creak(o, sr, 0.1, { dur: 2.7, body: 'rope', R, gain: 0.3, rate: (u) => 25 + 20 * Math.sin(TAU * 1.9 * u), amp: envPts([[0, 0], [0.05, 1], [0.95, 1], [1, 0]]) });
    let t = 0.1;
    while (t < 2.8) { t += -Math.log(1 - R.r() * 0.99) / 4; knock(o, sr, t, { f: R.range(170, 260), amp: R.range(0.15, 0.35), t60: 0.08, R }); }
    thump(o, sr, 2.9, { f: 80, to: 60, t60: 0.3, amp: 0.9, R });
    knock(o, sr, 2.9, { f: 160, amp: 0.8, t60: 0.15, R });
    latch(o, sr, 3.1, { amp: 0.4, R });
    return o;
  } },
};
