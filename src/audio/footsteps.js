// Footsteps: one buffer recipe per surface × gait. Each step is a heel strike followed by the
// toe/roll (closer together and harder when running), coloured by the surface. Variants are
// cached; the engine alternates feet (the trailing foot slightly softer and lower) and adds
// per-step pitch/level jitter. Subtle by design: walk peaks ≈ -20 dBFS, runs ≈ -14.
import { SURFACES } from '../data/tiles.js';
import { burst, grains, stickSlip, envHump } from './dsp.js';
import { RATIOS, thump, knock, metal, clink, creak, scrape, drop } from './synth.js';

export const STEP_SURFACES = SURFACES;
export const stepId = (surface, run) => `step_${surface}_${run ? 'run' : 'walk'}`;

// hit(o, sr, t, amp, R, run, part) — part: 'heel' | 'toe'
const SURF = {
  lino: { peak: [-20, -14], hit(o, sr, t, a, R, run, part) {
    thump(o, sr, t, { f: R.range(120, 150), to: 100, t60: 0.05, amp: a, noise: 0.5, lp: run ? 2600 : 1800, R });
    knock(o, sr, t, { f: R.range(380, 460), amp: a * 0.5, t60: 0.03, click: 0.25, R });
    if (part === 'toe' && R.chance(run ? 0.25 : 0.06)) stickSlip(o, sr, t + 0.01, { dur: 0.04, R, rate: () => R.range(900, 1300), tone: 0.6, jitter: 0.05, amp: envHump(0.3, 1), gain: a * 0.3, res: [[1300, 6, 1], [2600, 8, 0.4]] });
  } },
  wood: { peak: [-19, -14], hit(o, sr, t, a, R, run, part) {
    thump(o, sr, t, { f: R.range(100, 120), to: 85, t60: 0.08, amp: a, noise: 0.45, lp: run ? 2200 : 1500, R });
    knock(o, sr, t, { f: R.range(180, 240), amp: a * 0.7, t60: 0.12, click: 0.3, R });
    if (part === 'toe' && R.chance(0.12)) creak(o, sr, t + 0.02, { dur: R.range(0.2, 0.4), body: 'floor', R, gain: a * 0.4, rate: (u) => 25 + 30 * Math.sin(Math.PI * u) });
  } },
  tile: { peak: [-19, -13], hit(o, sr, t, a, R, run) {
    thump(o, sr, t, { f: 160, to: 130, t60: 0.03, amp: a * 0.7, noise: 0.3, lp: 3000, R });
    knock(o, sr, t, { f: R.range(900, 1200), amp: a * 0.8, t60: 0.02, click: run ? 0.9 : 0.7, R });
    clink(o, sr, t, { f: R.range(3000, 4000), amp: a * 0.15, t60: 0.02, R });
  } },
  concrete: { peak: [-19, -13], hit(o, sr, t, a, R, run) {
    thump(o, sr, t, { f: 110, to: 90, t60: 0.04, amp: a, noise: 0.5, lp: 1500, R });
    knock(o, sr, t, { f: 600, amp: a * 0.4, t60: 0.015, click: 0.4, R });
    grains(o, sr, t, { dur: run ? 0.07 : 0.05, R, rate: 1500, amp: a * 0.3, f: [2500, 7000], t60: [0.001, 0.004], click: 0.6 });
  } },
  carpet: { peak: [-24, -19], hit(o, sr, t, a, R) {
    thump(o, sr, t, { f: 90, to: 75, t60: 0.05, amp: a, noise: 0.6, lp: 600, R });
    scrape(o, sr, t, { dur: 0.05, f: 1500, q: 0.7, grain: 80, amp: envHump(0.3, 1), gain: a * 0.15, R });
  } },
  water: { peak: [-16, -12], hit(o, sr, t, a, R, run) {
    thump(o, sr, t, { f: 100, to: 85, t60: 0.04, amp: a * 0.5, noise: 0.3, lp: 1000, R });
    burst(o, sr, t, { dur: 0.08, t60: 0.06, gain: a * 0.8, R, filters: [['bp', 1200, 0.6]] });
    for (let k = 0; k < (run ? 4 : 2) + R.int(0, 2); k++) drop(o, sr, t + R.range(0.01, 0.12), { f: R.range(700, 1800), amp: a * R.range(0.3, 0.5), rise: 1.6, len: 0.035, R });
  } },
  coal: { peak: [-17, -12], hit(o, sr, t, a, R, run) {
    grains(o, sr, t, { dur: run ? 0.11 : 0.09, R, rate: 900, amp: a, f: [1500, 6000], t60: [0.004, 0.02], modes: 2, click: 0.4 });
    thump(o, sr, t, { f: 90, to: 75, t60: 0.05, amp: a * 0.6, noise: 0.4, R });
    for (let k = 0; k < R.int(2, 3); k++) clink(o, sr, t + R.range(0, 0.06), { f: R.range(2000, 4500), amp: a * 0.3, t60: 0.03, R });
  } },
  gravel: { peak: [-18, -13], hit(o, sr, t, a, R, run) {
    grains(o, sr, t, { dur: run ? 0.12 : 0.1, R, rate: 1400, amp: a, f: [800, 4000], t60: [0.002, 0.01], click: 0.6 });
    thump(o, sr, t, { f: 100, to: 85, t60: 0.04, amp: a * 0.5, noise: 0.4, R });
  } },
  asphalt: { peak: [-19, -14], hit(o, sr, t, a, R, run) {
    thump(o, sr, t, { f: 110, to: 90, t60: 0.04, amp: a, noise: 0.4, lp: 1500, R });
    burst(o, sr, t, { dur: 0.05, t60: 0.04, gain: a * 0.6, R, filters: [['bp', 900, 0.7]] });
    for (let k = 0; k < (run ? 2 : 1); k++) drop(o, sr, t + R.range(0.01, 0.05), { f: R.range(900, 1600), amp: a * 0.2, rise: 1.5, len: 0.03, R });
    grains(o, sr, t, { dur: 0.03, R, rate: 800, amp: a * 0.15, f: [2500, 6000], t60: [0.001, 0.003] });
  } },
  grass: { peak: [-20, -15], hit(o, sr, t, a, R, run) {
    thump(o, sr, t, { f: 90, to: 75, t60: 0.04, amp: a * 0.6, noise: 0.5, lp: 500, R });
    grains(o, sr, t, { dur: run ? 0.15 : 0.12, R, rate: 600, amp: a * 0.6, f: [2000, 7000], t60: [0.002, 0.008], click: 0.7 });
    burst(o, sr, t, { dur: 0.1, R, gain: a * 0.2, env: envHump(0.03, 0.1), filters: [['bp', 2500, 0.5]] });
  } },
  stone: { peak: [-19, -13], hit(o, sr, t, a, R, run) {
    thump(o, sr, t, { f: 140, to: 115, t60: 0.04, amp: a * 0.8, noise: 0.4, lp: 2500, R });
    knock(o, sr, t, { f: R.range(700, 900), amp: a * 0.6, t60: 0.02, click: run ? 0.8 : 0.6, R });
    grains(o, sr, t, { dur: 0.03, R, rate: 800, amp: a * 0.2, f: [3000, 8000], t60: [0.001, 0.003] });
  } },
  metal: { peak: [-16, -11], hit(o, sr, t, a, R, run, part) {
    thump(o, sr, t, { f: 120, to: 100, t60: 0.04, amp: a * 0.5, noise: 0.3, R });
    metal(o, sr, t, { f: R.range(280, 360), amp: a * 0.5, t60: 0.35, click: 0.3, R });
    if (part === 'heel') clink(o, sr, t + 0.01, { f: R.range(1500, 2500), amp: a * 0.2, t60: 0.05, R });
  } },
};

function stepGen(surface, run) {
  const P = SURF[surface];
  return {
    peak: P.peak[run ? 1 : 0], var: 6, jit: 0.04, vjit: 1.5, wet: 0.6, max: 12,
    gen(S) {
      const { sr, R } = S, o = S.alloc(0.4);
      const gap = run ? R.range(0.018, 0.03) : R.range(0.035, 0.065);
      P.hit(o, sr, 0.002, 1, R, run, 'heel');
      P.hit(o, sr, 0.002 + gap, run ? 0.75 : 0.55, R, run, 'toe');
      return o;
    },
  };
}

export const STEP_SFX = {};
for (const s of SURFACES) { STEP_SFX[stepId(s, false)] = stepGen(s, false); STEP_SFX[stepId(s, true)] = stepGen(s, true); }

/** The Colonel's "step": a heavy body shifting forward and the drag of wet wool behind it. */
STEP_SFX.step_colonel = { peak: -14, var: 5, jit: 0.04, wet: 1, max: 4, gen(S) {
  const { sr, R } = S, o = S.alloc(0.8);
  thump(o, sr, 0.002, { f: R.range(45, 55), to: 36, t60: 0.3, amp: 1, noise: 0.8, lp: 500, R });
  scrape(o, sr, 0.04, { dur: R.range(0.35, 0.55), f: 380, q: 0.9, grain: 12, depth: 0.7, amp: envHump(0.3, 1), gain: 0.45, color: 'pink', R });
  if (R.chance(0.3)) creak(o, sr, 0.05, { dur: 0.4, body: 'floor', R, gain: 0.35, rate: (u) => 15 + 20 * Math.sin(Math.PI * u) });
  if (R.chance(0.35)) clink(o, sr, R.range(0.02, 0.2), { f: R.range(2800, 4800), amp: 0.08, t60: 0.25, R, ratios: RATIOS.medal });
  return o;
} };
