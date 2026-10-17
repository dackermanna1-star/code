// UI sounds: quiet, dry, slightly papery — the interface is Tess's sketchbook, not a console.
import { ring, burst, grains, envHump, xlerp } from './dsp.js';
import { scrape, thump, paper } from './synth.js';

export const UI_SFX = {
  ui_move: { bus: 'ui', peak: -24, var: 4, jit: 0.015, gen(S) {
    const { sr, R } = S, o = S.alloc(0.07);
    ring(o, sr, 0, 1650 * R.jit(1, 0.02), 1, 0.035);
    ring(o, sr, 0, 3310, 0.18, 0.012);
    burst(o, sr, 0, { dur: 0.004, t60: 0.003, gain: 0.25, R, filters: [['hp', 5000]] });
    return o;
  } },
  ui_confirm: { bus: 'ui', peak: -17, var: 2, jit: 0.01, gen(S) {
    const { sr, R } = S, o = S.alloc(0.45);
    ring(o, sr, 0, 783.99, 0.8, 0.28, { attack: 0.003 });
    ring(o, sr, 0.055, 1174.66, 1, 0.38, { attack: 0.003 });
    ring(o, sr, 0.055, 2349.3, 0.08, 0.1);
    burst(o, sr, 0, { dur: 0.006, t60: 0.004, gain: 0.12, R, filters: [['bp', 3000, 1]] });
    return o;
  } },
  ui_cancel: { bus: 'ui', peak: -19, var: 2, jit: 0.01, gen(S) {
    const { sr } = S, o = S.alloc(0.4);
    ring(o, sr, 0, 659.25, 0.9, 0.22, { attack: 0.003 });
    ring(o, sr, 0.06, 493.88, 1, 0.3, { attack: 0.003 });
    return o;
  } },
  ui_open: { bus: 'ui', peak: -19, var: 2, gen(S) {
    const { sr, R } = S, o = S.alloc(0.35);
    burst(o, sr, 0, { dur: 0.22, R, color: 'pink', gain: 0.6, env: envHump(0.13, 0.22), filters: [['bp', (u) => xlerp(600, 2600, u), 1.2]] });
    ring(o, sr, 0.04, 392, 0.5, 0.25, { attack: 0.02 });
    ring(o, sr, 0.09, 587.33, 0.35, 0.22, { attack: 0.02 });
    return o;
  } },
  ui_close: { bus: 'ui', peak: -20, var: 2, gen(S) {
    const { sr, R } = S, o = S.alloc(0.32);
    burst(o, sr, 0, { dur: 0.2, R, color: 'pink', gain: 0.6, env: envHump(0.07, 0.2), filters: [['bp', (u) => xlerp(2400, 600, u), 1.2]] });
    ring(o, sr, 0.02, 523.25, 0.4, 0.2, { attack: 0.01 });
    ring(o, sr, 0.07, 349.23, 0.4, 0.22, { attack: 0.01 });
    return o;
  } },
  page_turn: { bus: 'ui', peak: -16, var: 4, gen(S) {
    const { sr, R } = S, o = S.alloc(0.6), d = R.range(0.32, 0.42);
    burst(o, sr, 0.01, { dur: d, R, gain: 0.8, env: envHump(d * 0.55, d), filters: [['bp', (u) => (u < 0.55 ? xlerp(900, 3600, u / 0.55) : xlerp(3600, 1500, (u - 0.55) / 0.45)), 0.9]] });
    grains(o, sr, 0.03, { dur: d * 0.8, R, rate: (u) => 30 + 260 * envHump(0.5, 1)(u), amp: 0.5, f: [2000, 7000], t60: [0.002, 0.008], click: 0.6 });
    thump(o, sr, d * 0.92, { f: 190, to: 150, t60: 0.05, amp: 0.25, noise: 0.5, lp: 1200, R });
    return o;
  } },
  item_get: { bus: 'ui', peak: -14, var: 1, gen(S) {
    // two soft struck notes (a fifth) — warm, unshowy; this is a horror game, not a jingle
    const { sr, R } = S, o = S.alloc(1.4);
    const n = [[880, 0], [1318.5, 0.11]];
    for (const [f, t] of n) {
      ring(o, sr, t, f, 1, 1.0, { attack: 0.004 });
      ring(o, sr, t, f * 2.01, 0.12, 0.35);
      ring(o, sr, t, f * 1.002, 0.5, 1.2, { attack: 0.004 });
    }
    paper(o, sr, 0, { dur: 0.25, amp: 0.3, density: 250, R });
    return o;
  } },
  objective: { bus: 'ui', peak: -17, var: 2, gen(S) {
    // pencil in the sketchbook: three quick graphite strokes
    const { sr, R } = S, o = S.alloc(0.75);
    let t = 0.01;
    for (let k = 0; k < 3; k++) {
      const d = R.range(0.1, 0.16);
      scrape(o, sr, t, { dur: d, f: R.range(2600, 3600), q: 0.9, grain: 70, depth: 0.85, amp: envHump(0.35, 1), R, gain: k === 1 ? 1 : 0.8 });
      grains(o, sr, t, { dur: d, R, rate: 160, amp: 0.25, f: [2500, 7000], t60: [0.001, 0.004], click: 0.6 });
      t += d + R.range(0.03, 0.07);
    }
    return o;
  } },
};
