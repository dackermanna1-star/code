// Dead County audio — footsteps, movement, doors, containers, UI, world objects and SFX loops.

import { burst, tone, modal, whoosh, click, thud, crackle, bubbles, creak, scrape } from './instruments.js';
import { voice } from './instruments.js';

const STEP = { cat: 'sfx', sr: 'mid', dur: 0.4, variants: 6, level: 0.24, ref: 1.5, maxDist: 22, cap: 6, group: 'step', groupCap: 12, send: 0.04, pv: 0.07, vv: 0.18, prio: 1 };

/** heel + toe pattern helper: calls fn(t, strength) twice */
function heelToe(s, fn) {
  fn(0.003, 1);
  fn(s.rand(0.045, 0.085), s.rand(0.35, 0.6));
}

export const WORLD_SOUNDS = {
  // ------------------------------------------------------------------ footsteps
  footstep_grass: {
    ...STEP,
    render: (s) =>
      heelToe(s, (t, k) => {
        burst(s, { t, kind: 'pink', a: 0.01, tau: 0.045, peak: 0.55 * k, filters: [['bandpass', s.rand(2000, 3200), 0.6]] });
        crackle(s, { t, dur: 0.12, rate: 500, gmin: 0.0005, gmax: 0.002, filters: [['highpass', 2000], ['lowpass', 7000]], peak: 0.5 * k, ampEnv: [[0, 0.3], [0.2, 1], [1, 0]] });
        thud(s, { t, f: 80, f1: 55, tau: 0.03, peak: 0.35 * k, noise: 0.25 * k, noiseLp: 300 });
      }),
  },
  footstep_dirt: {
    ...STEP,
    render: (s) =>
      heelToe(s, (t, k) => {
        thud(s, { t, f: s.rand(80, 100), f1: 55, tau: 0.035, peak: 0.8 * k, noise: 0.6 * k, noiseLp: 500 });
        crackle(s, { t, dur: 0.07, rate: 800, gmin: 0.0004, gmax: 0.0015, filters: [['bandpass', 1500, 0.6]], peak: 0.4 * k, ampEnv: [[0, 1], [1, 0]] });
      }),
  },
  footstep_stone: {
    ...STEP,
    render: (s) =>
      heelToe(s, (t, k) => {
        burst(s, { t, kind: 'white', a: 0.0005, tau: 0.007, peak: 0.8 * k, filters: [['bandpass', s.rand(1900, 2700), 1]] });
        thud(s, { t, f: 120, f1: 70, tau: 0.02, peak: 0.7 * k, noise: 0.35 * k, noiseLp: 800 });
        crackle(s, { t, dur: 0.04, rate: 900, gmin: 0.0003, gmax: 0.001, filters: [['highpass', 3000]], peak: 0.15 * k });
      }),
  },
  footstep_wood: {
    ...STEP,
    render: (s, v) => {
      heelToe(s, (t, k) => {
        modal(s, { t, f: s.rand(140, 200), modes: 'wood', tau: 0.04, peak: 0.7 * k });
        burst(s, { t, kind: 'white', a: 0.0006, tau: 0.01, peak: 0.45 * k, filters: [['bandpass', s.rand(800, 1100), 1.2]] });
        thud(s, { t, f: 100, f1: 70, tau: 0.03, peak: 0.6 * k });
      });
      if (v % 3 === 0) creak(s, { t: 0.04, dur: s.rand(0.12, 0.2), rate0: 70, rate1: 120, res: [[s.rand(800, 1000), 12, 1], [1700, 10, 0.5]], peak: 0.12, jitter: 40 });
    },
  },
  footstep_metal: {
    ...STEP, dur: 0.6,
    render: (s) =>
      heelToe(s, (t, k) => {
        modal(s, { t, f: s.rand(300, 500), modes: 'metal', tau: 0.12, peak: 0.45 * k });
        burst(s, { t, kind: 'white', a: 0.0005, tau: 0.008, peak: 0.7 * k, filters: [['bandpass', 1500, 1]] });
        thud(s, { t, f: 110, f1: 75, tau: 0.03, peak: 0.5 * k });
      }),
  },
  footstep_gravel: {
    ...STEP,
    render: (s) =>
      heelToe(s, (t, k) => {
        crackle(s, { t, dur: 0.15, rate: 1200, gmin: 0.0004, gmax: 0.0025, pow: 2, filters: [['bandpass', s.rand(2000, 3000), 0.5]], peak: 1 * k, ampEnv: [[0, 0], [0.1, 1], [1, 0]] });
        thud(s, { t, f: 90, f1: 60, tau: 0.025, peak: 0.4 * k });
      }),
  },
  footstep_water: {
    ...STEP, dur: 0.5, level: 0.35,
    render: (s) => {
      burst(s, { t: 0.003, kind: 'white', a: 0.01, tau: 0.05, peak: 0.7, filters: [['bandpass', 800, 1]], fenv: [[0.003, 700], [0.06, s.rand(2000, 2800), 'e'], [0.2, 900, 'e']] });
      burst(s, { t: 0.01, kind: 'pink', a: 0.02, tau: 0.08, peak: 0.45, filters: [['lowpass', 1200]] });
      bubbles(s, { t: 0.02, dur: 0.18, count: 6, fmin: 500, fmax: 1500, peak: 0.3, len: 0.04 });
      thud(s, { t: 0.003, f: 80, f1: 55, tau: 0.03, peak: 0.35 });
    },
  },
  footstep_sand: {
    ...STEP,
    render: (s) =>
      heelToe(s, (t, k) => {
        burst(s, { t, kind: 'pink', a: 0.02, tau: 0.055, peak: 0.8 * k, filters: [['bandpass', s.rand(700, 1000), 0.5], ['lowpass', 1800]] });
        crackle(s, { t, dur: 0.12, rate: 1500, gmin: 0.0002, gmax: 0.0008, filters: [['highpass', 3000], ['lowpass', 8000]], peak: 0.25 * k, ampEnv: [[0, 0.2], [0.25, 1], [1, 0]] });
        thud(s, { t, f: 70, f1: 50, tau: 0.03, peak: 0.3 * k });
      }),
  },
  footstep_leaves: {
    ...STEP,
    render: (s) =>
      heelToe(s, (t, k) => {
        crackle(s, { t, dur: s.rand(0.16, 0.22), rate: 900, gmin: 0.0006, gmax: 0.004, pow: 1.8, filters: [['highpass', 1500]], peak: 1 * k, ampEnv: [[0, 0.3], [0.15, 1], [1, 0]] });
        burst(s, { t, kind: 'pink', a: 0.01, tau: 0.06, peak: 0.4 * k, filters: [['bandpass', 3500, 0.7]] });
        thud(s, { t, f: 80, f1: 55, tau: 0.025, peak: 0.3 * k });
      }),
  },
  footstep_cloth: {
    ...STEP, level: 0.25,
    render: (s) =>
      heelToe(s, (t, k) => {
        thud(s, { t, f: s.rand(80, 95), f1: 60, tau: 0.03, peak: 0.6 * k, noise: 0.5 * k, noiseLp: 350 });
        burst(s, { t, kind: 'pink', a: 0.006, tau: 0.03, peak: 0.2 * k, filters: [['lowpass', 1200]] });
      }),
  },
  jump: {
    ...STEP, variants: 4, level: 0.3,
    render: (s) => {
      burst(s, { t: 0, kind: 'pink', a: 0.01, tau: 0.04, peak: 0.5, filters: [['bandpass', 1800, 0.6]] });
      thud(s, { t: 0, f: 90, f1: 60, tau: 0.02, peak: 0.5 });
      burst(s, { t: 0.02, kind: 'white', a: 0.02, tau: 0.06, peak: 0.25, filters: [['bandpass', 1500, 0.8]] });
    },
  },
  land: {
    ...STEP, variants: 4, level: 0.4,
    render: (s) => {
      thud(s, { t: 0, f: s.rand(80, 95), f1: 50, tau: 0.05, peak: 1, noise: 0.6, noiseLp: 500 });
      burst(s, { t: 0, kind: 'pink', a: 0.003, tau: 0.04, peak: 0.4, filters: [['bandpass', 1500, 0.7]] });
      crackle(s, { t: 0, dur: 0.06, rate: 900, gmin: 0.0004, gmax: 0.0015, filters: [['bandpass', 1800, 0.6]], peak: 0.25, ampEnv: [[0, 1], [1, 0]] });
    },
  },
  land_hard: {
    ...STEP, variants: 3, dur: 0.6, level: 0.6, cap: 2,
    render: (s) => {
      thud(s, { t: 0, f: 72, f1: 38, tau: 0.1, peak: 1.2, noise: 1, noiseLp: 400, noiseTau: 0.06 });
      crackle(s, { t: 0, dur: 0.08, rate: 2000, gmin: 0.0004, gmax: 0.002, filters: [['bandpass', 1500, 0.6]], peak: 0.5, ampEnv: [[0, 1], [1, 0]] });
      burst(s, { t: 0.002, kind: 'white', a: 0.002, tau: 0.03, peak: 0.5, filters: [['bandpass', 600, 1]] });
      voice(s, { t: 0.03, dur: 0.18, f0: s.rand(105, 125), contour: [[0, 1], [1, -3]], vowels: [[0, 'uh']], bw: 1.4, breath: 0.4, rough: 0.1, drive: 1.5, gain: 0.35, env: [[0, 0], [0.15, 1], [1, 0]] });
    },
  },

  // ------------------------------------------------------------------ doors / containers
  door_open: {
    cat: 'sfx', sr: 'mid', dur: 1.3, variants: 4, level: 0.55, ref: 3, maxDist: 30, cap: 3, send: 0.15, pv: 0.06, vv: 0.1,
    render: (s, v) => {
      click(s, { t: 0, f: 2500, q: 2, tau: 0.003, peak: 0.6, ring: 0.03, ringGain: 0.3, body: 0.3 });
      if (v !== 3) {
        const base = s.rand(600, 850);
        creak(s, {
          t: 0.06, dur: s.rand(0.5, 0.9), rate0: s.rand(32, 48), rateMid: s.rand(85, 150), rate1: s.rand(60, 110), midAt: s.rand(0.35, 0.65),
          res: [[base, 10, 1], [base * 1.85, 9, 0.6], [base * 3.2, 8, 0.3]], peak: 0.6, jitter: 30, flutter: 0.4,
          env: [[0, 0], [0.1, 0.8], [0.4, 1], [0.7, 0.6], [0.85, 0.9], [1, 0]],
        });
      }
      whoosh(s, { t: 0.05, dur: 0.45, f0: 200, fmid: 400, f1: 200, q: 0.7, peak: 0.12 });
    },
  },
  door_close: {
    cat: 'sfx', sr: 'mid', dur: 0.8, variants: 4, level: 0.65, ref: 3, maxDist: 35, cap: 3, send: 0.18, pv: 0.06, vv: 0.1,
    render: (s) => {
      whoosh(s, { t: 0, dur: 0.14, f0: 250, fmid: 450, f1: 250, q: 0.7, peak: 0.2 });
      const t = 0.12;
      thud(s, { t, f: s.rand(85, 105), f1: 55, tau: 0.07, peak: 1, noise: 0.8, noiseLp: 700 });
      modal(s, { t, f: s.rand(110, 140), modes: 'wood', tau: 0.08, peak: 0.5 });
      click(s, { t: t + 0.005, f: 2600, q: 2, tau: 0.003, peak: 0.6, ring: 0.04, ringGain: 0.3 });
      click(s, { t: t + 0.04, f: 2200, q: 2, tau: 0.002, peak: 0.2 });
    },
  },
  door_locked: {
    cat: 'sfx', sr: 'mid', dur: 0.7, variants: 3, level: 0.55, ref: 3, maxDist: 25, cap: 2, send: 0.12, pv: 0.06, vv: 0.1,
    render: (s) => {
      click(s, { t: 0, f: 2200, q: 2, tau: 0.003, peak: 0.4, ring: 0.02 });
      const n = s.irand(3, 5);
      for (let i = 0; i < n; i++) {
        const t = 0.05 + i * s.rand(0.06, 0.08);
        click(s, { t, f: s.rand(1800, 2500), q: 1.5, tau: 0.003, peak: s.rand(0.6, 0.9), ring: 0.03, ringGain: 0.3, body: 0.5, bodyF: 160 });
        modal(s, { t, f: s.rand(130, 170), modes: 'wood', tau: 0.03, peak: 0.35 });
      }
    },
  },
  door_break: {
    cat: 'sfx', sr: 'mid', dur: 1.5, variants: 3, level: 0.85, ref: 5, maxDist: 60, cap: 2, send: 0.2, pv: 0.05, vv: 0.08,
    render: (s) => {
      thud(s, { t: 0, f: 80, f1: 35, tau: 0.12, peak: 1.2, noise: 1.0, noiseLp: 600, noiseTau: 0.07 });
      burst(s, { t: 0, kind: 'white', a: 0.0005, tau: 0.02, peak: 0.8, filters: [['highpass', 1000]] });
      crackle(s, { t: 0.002, dur: 0.45, rate: 1500, gmin: 0.0005, gmax: 0.004, pow: 1.5, filters: [['bandpass', 1500, 0.5]], peak: 1, ampEnv: [[0, 1], [0.3, 0.5], [1, 0]] });
      modal(s, { t: 0, f: 110, modes: 'wood', tau: 0.15, peak: 0.6 });
      const n = s.irand(4, 6);
      for (let i = 0; i < n; i++) {
        const t = s.rand(0.15, 0.9);
        modal(s, { t, f: s.rand(180, 400), modes: 'wood', tau: 0.03, peak: s.rand(0.2, 0.45) });
        thud(s, { t, f: 120, f1: 80, tau: 0.02, peak: 0.2 });
      }
    },
  },
  door_bash: {
    cat: 'sfx', sr: 'mid', dur: 0.8, variants: 4, level: 0.75, ref: 4, maxDist: 45, cap: 3, send: 0.16, pv: 0.06, vv: 0.1,
    render: (s, v) => {
      thud(s, { t: 0, f: s.rand(85, 100), f1: 50, tau: 0.08, peak: 1, noise: 0.7, noiseLp: 700 });
      modal(s, { t: 0, f: s.rand(100, 140), modes: 'wood', tau: 0.1, peak: 0.6 });
      for (let i = 0; i < s.irand(2, 3); i++) click(s, { t: 0.03 + i * s.rand(0.03, 0.05), f: s.rand(1900, 2500), q: 1.5, tau: 0.003, peak: 0.3, ring: 0.02, body: 0.3, bodyF: 180 });
      if (v === 2) creak(s, { t: 0.02, dur: 0.25, rate0: 75, rate1: 45, res: [[700, 10, 1], [1300, 8, 0.5]], peak: 0.25, jitter: 40 });
    },
  },
  container_open: {
    cat: 'sfx', sr: 'mid', dur: 0.7, variants: 4, level: 0.5, ref: 2.5, maxDist: 20, cap: 3, send: 0.1, pv: 0.06, vv: 0.1,
    render: (s, v) => {
      if (v % 2 === 0) {
        // drawer slide + stop knock
        const d = s.rand(0.2, 0.3);
        scrape(s, { t: 0, dur: d, f: s.rand(500, 700), q: 1.2, peak: 0.7, rough: 0.7, roughRate: 80, kind: 'pink' });
        modal(s, { t: d, f: s.rand(200, 250), modes: 'wood', tau: 0.04, peak: 0.6 });
        thud(s, { t: d, f: 130, f1: 90, tau: 0.02, peak: 0.5 });
        crackle(s, { t: d, dur: 0.15, rate: 200, gmin: 0.002, gmax: 0.006, filters: [['bandpass', 2000, 0.8]], peak: 0.25 });
      } else {
        // cupboard door: catch click + short creak + rattle
        click(s, { t: 0, f: 1800, q: 1.5, tau: 0.004, peak: 0.6, body: 0.4, bodyF: 250 });
        creak(s, { t: 0.03, dur: s.rand(0.25, 0.4), rate0: 60, rate1: 130, res: [[s.rand(900, 1200), 10, 1], [2000, 8, 0.4]], peak: 0.25, jitter: 40 });
        modal(s, { t: 0.01, f: s.rand(180, 230), modes: 'wood', tau: 0.05, peak: 0.4 });
      }
    },
  },
  container_metal_open: {
    cat: 'sfx', sr: 'mid', dur: 1.0, variants: 3, level: 0.5, ref: 2.5, maxDist: 25, cap: 3, send: 0.12, pv: 0.05, vv: 0.1,
    render: (s) => {
      click(s, { t: 0, f: 1500, q: 1.2, tau: 0.004, peak: 0.8, ring: 0.12, modes: 'metal', ringGain: 0.5, body: 0.4 });
      creak(s, { t: 0.05, dur: s.rand(0.25, 0.35), rate0: 250, rate1: 420, res: [[s.rand(1600, 2000), 20, 1], [3200, 15, 0.4]], peak: 0.2, jitter: 25 });
      modal(s, { t: 0.02, f: s.rand(170, 260), modes: 'metal', tau: 0.25, peak: 0.45 });
      scrape(s, { t: 0.03, dur: 0.2, f: 2500, q: 2, peak: 0.2, rough: 0.6 });
    },
  },

  // ------------------------------------------------------------------ player interaction / UI
  item_pickup: {
    cat: 'sfx', sr: 'mid', dur: 0.25, variants: 4, level: 0.35, ref: 1.5, maxDist: 8, cap: 3, send: 0.02, pv: 0.08, vv: 0.1,
    render: (s) => {
      burst(s, { t: 0, kind: 'pink', a: 0.01, tau: 0.04, peak: 0.6, filters: [['bandpass', s.rand(1700, 2400), 0.7]] });
      click(s, { t: s.rand(0.02, 0.05), f: 2500, q: 1, tau: 0.002, peak: 0.3, body: 0.4, bodyF: 300 });
    },
  },
  item_drop: {
    cat: 'sfx', sr: 'mid', dur: 0.35, variants: 4, level: 0.4, ref: 2, maxDist: 12, cap: 3, send: 0.04, pv: 0.08, vv: 0.1,
    render: (s) => {
      thud(s, { t: 0, f: s.rand(120, 160), f1: 80, tau: 0.03, peak: 0.8, noise: 0.5, noiseLp: 900 });
      crackle(s, { t: 0.005, dur: 0.05, rate: 400, gmin: 0.001, gmax: 0.003, filters: [['bandpass', 2000, 0.8]], peak: 0.3 });
      burst(s, { t: 0, kind: 'pink', a: 0.004, tau: 0.03, peak: 0.25, filters: [['bandpass', 1500, 0.7]] });
    },
  },
  equip: {
    cat: 'sfx', sr: 'mid', dur: 0.3, variants: 3, level: 0.35, ref: 1.5, maxDist: 8, cap: 2, send: 0.02, pv: 0.06, vv: 0.1,
    render: (s) => {
      scrape(s, { t: 0, dur: 0.08, f: 3000, q: 1.2, peak: 0.6, rough: 0.5 });
      click(s, { t: 0.07, f: 2200, q: 1.5, tau: 0.003, peak: 0.7, ring: 0.02, ringGain: 0.3, body: 0.3 });
    },
  },
  ui_click: {
    cat: 'ui', sr: 'hi', dur: 0.08, variants: 2, level: 0.3, cap: 3, pv: 0.03, vv: 0.05,
    render: (s) => {
      burst(s, { t: 0, kind: 'white', a: 0.0002, tau: 0.0018, peak: 0.7, filters: [['bandpass', 2800, 2]] });
      tone(s, { t: 0, f: s.rand(1700, 1900), a: 0.0005, tau: 0.006, peak: 0.3 });
    },
  },
  ui_hover: {
    cat: 'ui', sr: 'hi', dur: 0.06, variants: 2, level: 0.1, cap: 2, pv: 0.03, vv: 0.05,
    render: (s) => {
      tone(s, { t: 0, f: s.rand(2500, 2700), a: 0.001, tau: 0.006, peak: 0.5 });
      burst(s, { t: 0, kind: 'white', a: 0.0005, tau: 0.002, peak: 0.2, filters: [['bandpass', 4000, 2]] });
    },
  },
  ui_open: {
    cat: 'ui', sr: 'hi', dur: 0.25, variants: 2, level: 0.3, cap: 2, pv: 0.04, vv: 0.05,
    render: (s) => {
      whoosh(s, { t: 0, dur: 0.13, f0: 600, fmid: 1800, f1: 2500, q: 1.5, peak: 0.6, peakAt: 0.7 });
      tone(s, { t: 0.01, f: 200, f1: 130, glide: 0.05, tau: 0.03, peak: 0.25 });
      click(s, { t: 0.11, f: 2000, q: 1.5, tau: 0.002, peak: 0.35 });
    },
  },
  ui_close: {
    cat: 'ui', sr: 'hi', dur: 0.25, variants: 2, level: 0.3, cap: 2, pv: 0.04, vv: 0.05,
    render: (s) => {
      whoosh(s, { t: 0, dur: 0.12, f0: 2200, fmid: 1400, f1: 500, q: 1.5, peak: 0.6, peakAt: 0.3 });
      thud(s, { t: 0.09, f: 150, f1: 100, tau: 0.02, peak: 0.4 });
    },
  },
  craft: {
    cat: 'sfx', sr: 'mid', dur: 0.9, variants: 4, level: 0.4, ref: 2, maxDist: 15, cap: 2, send: 0.06, pv: 0.06, vv: 0.1,
    render: (s) => {
      scrape(s, { t: 0, dur: 0.15, f: 1500, q: 1, peak: 0.4, rough: 0.6, kind: 'pink' });
      let t = 0.12;
      for (let i = 0; i < s.irand(2, 3); i++) {
        const k = s.irand(0, 2);
        if (k === 0) modal(s, { t, f: s.rand(200, 300), modes: 'wood', tau: 0.04, peak: 0.6 });
        else if (k === 1) modal(s, { t, f: s.rand(1500, 2500), modes: 'bar', tau: 0.06, peak: 0.35 });
        else burst(s, { t, kind: 'pink', a: 0.01, tau: 0.05, peak: 0.5, filters: [['bandpass', 1800, 0.7]] });
        thud(s, { t, f: 140, f1: 90, tau: 0.02, peak: 0.3 });
        t += s.rand(0.15, 0.25);
      }
    },
  },
  sleep_start: {
    cat: 'ui', sr: 'mid', dur: 3.2, variants: 1, level: 0.3, cap: 1, pv: 0, vv: 0,
    render: (s) => {
      const notes = [392, 293.66, 196];
      notes.forEach((f, i) => {
        const t = 0.02 + i * 0.55;
        modal(s, { t, f, modes: [[1, 1, 1], [2, 0.6, 0.25], [3, 0.4, 0.08], [4.2, 0.25, 0.03]], tau: 0.9, a: 0.02, peak: 0.8 - i * 0.15, jit: 0.002 });
      });
    },
  },
  level_up: {
    cat: 'ui', sr: 'mid', dur: 2.0, variants: 1, level: 0.3, cap: 1, pv: 0, vv: 0,
    render: (s) => {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        modal(s, { t: 0.01 + i * 0.085, f, modes: [[1, 1, 1], [2, 0.6, 0.2], [3, 0.4, 0.06], [4.16, 0.3, 0.04]], tau: 0.5, a: 0.004, peak: 0.7, jit: 0.002 });
      });
    },
  },

  // ------------------------------------------------------------------ world objects
  car_alarm: {
    cat: 'sfx', sr: 'lo', dur: 8.0, loop: { len: 8.0, xfade: 0, mode: 'linear' }, variants: 1, level: 0.42, ref: 8, maxDist: 260, cap: 3, send: 0.25, pv: 0, vv: 0, prio: 4,
    render: (s) => {
      const bus = s.g(1);
      const sat = s.sat(2.5);
      s.chain(bus, s.hp(350), sat, s.peak(2000, 1, 4), s.lp(5000), s.out);
      const o = s.osc('square', 800, 0, 6.0);
      const g = s.g(0);
      s.chain(o, g, bus);
      const A = 0.5;
      // 1) four rising whoops
      for (let i = 0; i < 4; i++) {
        const t = i * 0.5;
        o.frequency.setValueAtTime(520, t);
        o.frequency.exponentialRampToValueAtTime(1500, t + 0.46);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(A, t + 0.008);
        g.gain.setValueAtTime(A, t + 0.45);
        g.gain.linearRampToValueAtTime(0, t + 0.47);
      }
      // 2) two-tone alternation
      g.gain.setValueAtTime(0, 2.0);
      g.gain.linearRampToValueAtTime(A, 2.008);
      for (let k = 0; k < 16; k++) o.frequency.setValueAtTime(k % 2 ? 950 : 1400, 2 + k * 0.125);
      // 3) warble
      o.frequency.setValueAtTime(1100, 4.0);
      const lfo = s.osc('sine', 14, 4.0, 6.0);
      const lg = s.g(330);
      s.chain(lfo, lg);
      lg.connect(o.frequency);
      g.gain.setValueAtTime(A, 5.97);
      g.gain.linearRampToValueAtTime(0, 5.99);
      // 4) horn honks
      const hg = s.g(0);
      const h1 = s.osc('sawtooth', 405, 6.0, 8.0), h2 = s.osc('sawtooth', 508, 6.0, 8.0);
      const hl = s.lp(2500, 0.8);
      s.chain(h1, hl);
      s.chain(h2, hl);
      s.chain(hl, hg, bus);
      for (let k = 0; k < 4; k++) {
        const t = 6.0 + k * 0.5;
        hg.gain.setValueAtTime(0, t);
        hg.gain.linearRampToValueAtTime(0.55, t + 0.01);
        hg.gain.setValueAtTime(0.55, t + 0.25);
        hg.gain.linearRampToValueAtTime(0, t + 0.26);
      }
    },
  },
  helicopter: {
    cat: 'sfx', sr: 'mid', dur: 2.2, loop: { len: 2.0, xfade: 0.2, mode: 'linear' }, variants: 1, level: 0.9, ref: 25, maxDist: 900, cap: 2, send: 0.3, pv: 0, vv: 0, prio: 4,
    render: (s) => {
      const rate = 11; // blade slaps per second (2 s loop = 22 slaps, exactly periodic)
      const n = Math.ceil(2.2 * rate) + 1;
      for (let k = 0; k < n; k++) {
        const t = k / rate;
        const pk = k % 2 ? 0.85 : 1;
        burst(s, { t, kind: 'pink', a: 0.002, tau: 0.024, peak: pk, filters: [['bandpass', 320, 0.8]] });
        tone(s, { t, f: 72, f1: 50, glide: 0.04, a: 0.002, tau: 0.03, peak: 0.7 * pk });
      }
      // rotor wash, amplitude-modulated at the blade rate
      const wash = s.noise('brown', 0, 2.25);
      const wl = s.lp(500, 0.7);
      const wam = s.g(0.6);
      const wlfo = s.osc('sine', rate, 0, 2.25);
      const wlg = s.g(0.35);
      s.chain(wlfo, wlg);
      wlg.connect(wam.gain);
      const wg = s.g(0.9);
      s.chain(wash, wl, wam, wg, s.out);
      // turbine whine
      const w1 = s.osc('sine', 2300, 0, 2.25), w2 = s.osc('sine', 4600, 0, 2.25);
      const wg1 = s.g(0.035), wg2 = s.g(0.015);
      s.chain(w1, wg1, s.out);
      s.chain(w2, wg2, s.out);
      // tail rotor buzz
      const tr = s.osc('sawtooth', 58, 0, 2.25);
      const trg = s.g(0.1);
      s.chain(tr, s.lp(400, 0.8), trg, s.out);
    },
  },
  explosion: {
    cat: 'sfx', sr: 'lo', dur: 4.8, variants: 2, level: 1.0, ref: 20, maxDist: 1200, cap: 4, send: 0.4, pv: 0.06, vv: 0.05, prio: 5,
    render: (s) => {
      const mix = s.g(0.5);
      const sat = s.sat(4);
      const post = s.g(1);
      s.chain(mix, sat, post, s.out);
      burst(s, { t: 0.002, kind: 'white', a: 0.0003, tau: 0.03, peak: 1, filters: [['highpass', 500]], dest: mix });
      burst(s, { t: 0.002, kind: 'brown', a: 0.002, tau: 0.35, peak: 1.4, filters: [['lowpass', 600]], dest: mix });
      tone(s, { t: 0.002, f: s.rand(70, 85), f1: 28, glideTau: 0.15, a: 0.003, tau: 0.4, peak: 1.5, dest: mix });
      // rolling rumble
      const rum = burst(s, { t: 0.02, kind: 'brown', a: 0.05, tau: 1.2, peak: 0.9, filters: [['lowpass', 260, 0.8]], dest: post });
      const roll = s.g(0.6);
      s.randCtl(0.02, 4.5, 4, 0, 0.5).connect(roll.gain);
      rum.g.disconnect();
      s.chain(rum.g, roll, post);
      // debris
      crackle(s, { t: 0.12, dur: 2.6, rate: 120, gmin: 0.002, gmax: 0.01, pow: 1.5, density: (x) => (1 - x) * (1 - x), filters: [['bandpass', 1500, 0.5]], peak: 0.5, dest: post });
      crackle(s, { t: 0.3, dur: 2.4, rate: 30, gmin: 0.006, gmax: 0.02, pow: 1.3, density: (x) => 1 - x, filters: [['lowpass', 900]], peak: 0.4, dest: post });
      for (const [dt, gg, lp] of [[0.35, 0.3, 600], [0.8, 0.2, 400], [1.4, 0.1, 300]]) {
        const d = s.delay(dt * s.rand(0.85, 1.15));
        s.chain(post, d, s.lp(lp), s.g(gg), s.out);
      }
    },
  },
  fire_loop: {
    cat: 'sfx', sr: 'mid', dur: 6.5, loop: { len: 6.0, xfade: 0.5, mode: 'power' }, variants: 1, level: 0.55, ref: 2.5, maxDist: 40, cap: 6, send: 0.1, pv: 0, vv: 0, prio: 4,
    render: (s) => {
      const roar = s.noise('brown', 0, 6.6);
      const ram = s.g(0.6);
      s.randCtl(0, 6.6, 2, 0.4, 1).connect(ram.gain);
      ram.gain.value = 0;
      s.chain(roar, s.lp(350, 0.7), ram, s.g(0.7), s.out);
      crackle(s, { t: 0, dur: 6.5, rate: 22, gmin: 0.001, gmax: 0.006, pow: 1.5, filters: [['highpass', 800]], peak: 1 });
      crackle(s, { t: 0, dur: 6.5, rate: 280, gmin: 0.0002, gmax: 0.001, pow: 2.2, filters: [['highpass', 2000]], peak: 0.45 });
      crackle(s, { t: 0, dur: 6.5, rate: 3, gmin: 0.008, gmax: 0.02, pow: 1, filters: [['lowpass', 2500]], peak: 0.8 });
      const hiss = s.noise('pink', 0, 6.6);
      const hg = s.g(0.07);
      s.chain(hiss, s.bp(3000, 0.5), hg, s.out);
    },
  },
  molotov_break: {
    cat: 'sfx', sr: 'mid', dur: 1.8, variants: 3, level: 0.8, ref: 5, maxDist: 60, cap: 3, send: 0.2, pv: 0.05, vv: 0.08,
    render: (s) => {
      burst(s, { t: 0, kind: 'white', a: 0.0003, tau: 0.015, peak: 1, filters: [['highpass', 2000]] });
      crackle(s, { t: 0.01, dur: 0.8, rate: 60, gmin: 0.01, gmax: 0.04, decay: 4, ping: 2800, ping2: 8000, pow: 1.4, density: (x) => (1 - x) * (1 - x), peak: 0.7 });
      whoosh(s, { t: 0.05, dur: 0.65, f0: 200, fmid: 900, f1: 350, q: 0.7, peak: 1, body: 0.8, bodyF: 300, peakAt: 0.35 });
      thud(s, { t: 0.08, f: 65, f1: 40, tau: 0.15, peak: 0.6 });
      crackle(s, { t: 0.25, dur: 1.2, rate: 40, gmin: 0.001, gmax: 0.006, pow: 1.4, filters: [['highpass', 800]], density: (x) => 1 - x * 0.7, peak: 0.6 });
    },
  },
  flare_loop: {
    cat: 'sfx', sr: 'mid', dur: 4.3, loop: { len: 4.0, xfade: 0.3, mode: 'power' }, variants: 1, level: 0.4, ref: 2, maxDist: 30, cap: 4, send: 0.08, pv: 0, vv: 0, prio: 4,
    render: (s) => {
      const n = s.noise('white', 0, 4.4);
      const am = s.g(0.8);
      s.randCtl(0, 4.4, 15, 0, 0.25).connect(am.gain);
      s.chain(n, s.bp(3500, 0.6), s.hp(1200), am, s.g(0.9), s.out);
      crackle(s, { t: 0, dur: 4.3, rate: 80, gmin: 0.0005, gmax: 0.002, filters: [['highpass', 1500]], peak: 0.5 });
      const r = s.noise('pink', 0, 4.4);
      s.chain(r, s.lp(600), s.g(0.3), s.out);
    },
  },
  lighter: {
    cat: 'sfx', sr: 'mid', dur: 0.7, variants: 3, level: 0.4, ref: 1.5, maxDist: 8, cap: 2, send: 0.03, pv: 0.05, vv: 0.08,
    render: (s, v) => {
      let t = 0;
      if (v === 2) {
        // zippo lid
        modal(s, { t: 0, f: 2200, modes: 'bar', tau: 0.05, peak: 0.5 });
        t = 0.15;
      }
      crackle(s, { t, dur: 0.05, rate: 3000, gmin: 0.0002, gmax: 0.0008, filters: [['highpass', 3000]], peak: 0.8 });
      scrape(s, { t, dur: 0.06, f: 4000, q: 1, peak: 0.4, rough: 0.7 });
      burst(s, { t: t + 0.05, kind: 'pink', a: 0.03, hold: 0.15, tau: 0.1, peak: 0.28, filters: [['bandpass', 2500, 0.5]] });
      burst(s, { t: t + 0.06, kind: 'brown', a: 0.04, hold: 0.1, tau: 0.1, peak: 0.2, filters: [['lowpass', 500]] });
    },
  },
  match: {
    cat: 'sfx', sr: 'mid', dur: 0.8, variants: 3, level: 0.4, ref: 1.5, maxDist: 8, cap: 2, send: 0.03, pv: 0.05, vv: 0.08,
    render: (s) => {
      scrape(s, { t: 0, dur: s.rand(0.1, 0.14), f: 2500, f1: 4000, q: 0.8, peak: 0.8, rough: 0.8 });
      burst(s, { t: 0.1, kind: 'pink', a: 0.02, tau: 0.15, peak: 0.6, filters: [['bandpass', 1500, 0.4]] });
      crackle(s, { t: 0.1, dur: 0.3, rate: 150, gmin: 0.0003, gmax: 0.001, filters: [['highpass', 2000]], peak: 0.3 });
    },
  },
  wood_chop: {
    cat: 'sfx', sr: 'mid', dur: 0.55, variants: 4, level: 0.65, ref: 3, maxDist: 40, cap: 3, send: 0.15, pv: 0.06, vv: 0.1,
    render: (s) => {
      click(s, { t: 0, f: 2000, q: 0.8, tau: 0.004, peak: 1 });
      modal(s, { t: 0, f: s.rand(250, 350), modes: 'wood', tau: 0.05, peak: 0.9 });
      thud(s, { t: 0, f: 120, f1: 70, tau: 0.04, peak: 0.8, noise: 0.5, noiseLp: 900 });
      crackle(s, { t: 0.003, dur: 0.12, rate: 1000, gmin: 0.0004, gmax: 0.002, filters: [['bandpass', 2500, 0.6]], peak: 0.5, ampEnv: [[0, 1], [1, 0]] });
    },
  },
  barricade_hammer: {
    cat: 'sfx', sr: 'mid', dur: 0.55, variants: 4, level: 0.65, ref: 3, maxDist: 45, cap: 3, send: 0.15, pv: 0.05, vv: 0.1,
    render: (s) => {
      modal(s, { t: 0, f: s.rand(2600, 3300), modes: 'bar', tau: 0.05, peak: 0.6 });
      click(s, { t: 0, f: 3500, q: 1.2, tau: 0.002, peak: 0.8 });
      modal(s, { t: 0, f: s.rand(160, 210), modes: 'wood', tau: 0.05, peak: 0.7 });
      thud(s, { t: 0, f: 110, f1: 70, tau: 0.025, peak: 0.6 });
    },
  },
  pry: {
    cat: 'sfx', sr: 'mid', dur: 1.1, variants: 3, level: 0.6, ref: 3, maxDist: 30, cap: 2, send: 0.12, pv: 0.05, vv: 0.1,
    render: (s) => {
      creak(s, { t: 0, dur: 0.55, rate0: 30, rate1: 95, res: [[s.rand(450, 600), 8, 1], [1100, 6, 0.5]], peak: 0.7, flutter: 0.5, jitter: 50 });
      creak(s, { t: 0.25, dur: 0.3, rate0: 400, rate1: 700, res: [[s.rand(2300, 2800), 25, 1], [4100, 20, 0.4]], peak: 0.3, jitter: 20 });
      const t = s.rand(0.55, 0.65);
      burst(s, { t, kind: 'white', a: 0.0005, tau: 0.01, peak: 1, filters: [['bandpass', 1500, 0.8]] });
      crackle(s, { t, dur: 0.15, rate: 1200, gmin: 0.0004, gmax: 0.003, filters: [['bandpass', 1800, 0.6]], peak: 0.6, ampEnv: [[0, 1], [1, 0]] });
      thud(s, { t, f: 110, f1: 70, tau: 0.04, peak: 0.6 });
    },
  },
  splash: {
    cat: 'sfx', sr: 'mid', dur: 1.1, variants: 4, level: 0.6, ref: 3, maxDist: 35, cap: 4, send: 0.1, pv: 0.07, vv: 0.1,
    render: (s) => {
      burst(s, { t: 0, kind: 'white', a: 0.005, tau: 0.12, peak: 1, filters: [['bandpass', 800, 0.8]], fenv: [[0, 500], [0.05, s.rand(2000, 3000), 'e'], [0.4, 800, 'e']] });
      burst(s, { t: 0, kind: 'brown', a: 0.01, tau: 0.15, peak: 0.8, filters: [['lowpass', 600]] });
      bubbles(s, { t: 0.03, dur: 0.45, count: 14, fmin: 400, fmax: 2000, peak: 0.4, len: 0.05 });
      crackle(s, { t: 0.1, dur: 0.7, rate: 40, gmin: 0.004, gmax: 0.012, ping: 1500, ping2: 4000, decay: 5, density: (x) => 1 - x, peak: 0.3 });
    },
  },
  radio_static: {
    cat: 'sfx', sr: 'mid', dur: 1.4, variants: 3, level: 0.4, ref: 2, maxDist: 15, cap: 2, send: 0.05, pv: 0.03, vv: 0.08, loopAlias: 'radio_static_loop',
    render: (s, v) => radioStatic(s, 1.3, v < 2),
  },
  radio_static_loop: {
    cat: 'sfx', sr: 'mid', dur: 4.4, loop: { len: 4.0, xfade: 0.4, mode: 'power' }, variants: 1, level: 0.35, ref: 2, maxDist: 15, cap: 2, send: 0.05, pv: 0, vv: 0, internal: true,
    render: (s) => radioStatic(s, 4.4, true),
  },
  flashlight_click: {
    cat: 'sfx', sr: 'hi', dur: 0.12, variants: 2, level: 0.35, ref: 1, maxDist: 6, cap: 2, send: 0, pv: 0.04, vv: 0.05,
    render: (s) => {
      click(s, { t: 0, f: 3000, q: 1.5, tau: 0.0015, peak: 1, body: 0.3, bodyF: 800 });
      click(s, { t: 0.025, f: 2200, q: 1.5, tau: 0.0015, peak: 0.6 });
    },
  },
  block_break: {
    cat: 'sfx', sr: 'mid', dur: 0.65, variants: 4, level: 0.6, ref: 3, maxDist: 30, cap: 3, send: 0.12, pv: 0.07, vv: 0.1,
    render: (s) => {
      thud(s, { t: 0, f: s.rand(100, 120), f1: 60, tau: 0.05, peak: 0.9, noise: 0.8, noiseLp: 1200 });
      crackle(s, { t: 0, dur: 0.25, rate: 1200, gmin: 0.0005, gmax: 0.004, filters: [['bandpass', s.rand(1200, 1800), 0.5]], peak: 0.9, ampEnv: [[0, 1], [0.4, 0.6], [1, 0]] });
      for (let i = 0; i < 3; i++) {
        const t = s.rand(0.08, 0.4);
        thud(s, { t, f: s.rand(140, 260), f1: 100, tau: 0.015, peak: 0.25, noise: 0.2, noiseLp: 1500 });
      }
    },
  },
};

/** band-limited radio static with crackles and (optionally) garbled far-away voices */
function radioStatic(s, dur, withVoice) {
  const bus = s.g(1);
  s.chain(bus, s.hp(300), s.lp(3200), s.out);
  const n = s.noise('white', 0, dur);
  const am = s.g(0.6);
  s.randCtl(0, dur, 25, 0, 0.4).connect(am.gain);
  s.chain(n, s.bp(1800, 0.5), am, s.g(0.7), bus);
  crackle(s, { t: 0, dur, rate: 30, gmin: 0.0005, gmax: 0.003, filters: [['highpass', 1000]], peak: 0.6, dest: bus });
  if (withVoice) {
    let t = s.rand(0.05, 0.3);
    while (t < dur - 0.3) {
      const d = Math.min(s.rand(0.15, 0.5), dur - t - 0.1);
      voice(s, {
        t, dur: d, f0: s.rand(110, 190), contour: [[0, s.rand(-2, 2)], [0.5, s.rand(-2, 3)], [1, s.rand(-4, 0)]],
        vowels: [[0, s.pick(['a', 'e', 'i', 'o', 'u'])], [0.5, s.pick(['a', 'e', 'o', 'uh'])], [1, s.pick(['a', 'i', 'er'])]],
        bw: 1.2, breath: 0.2, drive: 3, preDrive: 2, gain: 0.35, jitter: 0.6,
        env: [[0, 0], [0.1, 1], [0.8, 0.8], [1, 0]], dest: bus,
      });
      t += d + s.rand(0.04, 0.2);
    }
  }
}
