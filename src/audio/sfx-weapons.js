// Dead County audio — firearms, gun mechanics, melee and impacts.
// Each def: { dur, variants, sr ('hi'|'mid'|'lo'), level, ref, maxDist, cap, group, send, pv, vv, render(s, v) }

import { burst, tone, modal, whoosh, click, thud, crackle, scrape, pluck, gunshot } from './instruments.js';

const GUN = { cat: 'sfx', sr: 'mid', variants: 4, cap: 10, group: 'gun', groupCap: 16, pv: 0.035, vv: 0.08, prio: 2 };

/** run `fn` with s.out temporarily replaced by a node chain (e.g. a lowpass for distant versions) */
function via(s, node, fn) {
  const prev = s.out;
  node.connect(prev);
  s.out = node;
  try {
    fn();
  } finally {
    s.out = prev;
  }
}

const slide = (t, peak = 0.08) => (s) => {
  click(s, { t: t + s.rand(-0.005, 0.005), f: s.rand(3200, 4200), q: 2.5, tau: 0.003, peak, ring: 0.03, ringGain: 0.5 });
  click(s, { t: t + 0.03 + s.rand(0, 0.01), f: s.rand(2500, 3200), q: 2, tau: 0.003, peak: peak * 0.8, ring: 0.025, ringGain: 0.4 });
};

export const WEAPON_SOUNDS = {
  // ------------------------------------------------------------------ firearms
  gun_pistol: {
    ...GUN, dur: 1.4, level: 0.95, ref: 7, maxDist: 350, send: 0.32,
    render: (s) =>
      gunshot(s, {
        snap: 0.6, snapTau: 0.001,
        crack: 1.0, crackTau: 0.01, crackHp: 1000, crackPk: 2600, crackPkDb: 5,
        body: 0.9, bodyF: 620, bodyQ: 0.9, bodyTau: 0.04,
        thump: 1.0, thumpF0: 155, thumpF1: 55, thumpGlide: 0.02, thumpTau: 0.05,
        boom: 0.6, boomTau: 0.08, boomLp: 350,
        tail: 0.07, tailTau: 0.32, tailLp: 2000,
        echoes: [[0.11, 0.22, 1800], [0.23, 0.13, 1200], [0.41, 0.07, 900]],
        drive: 3, mixGain: 0.6,
        mech: (ss, t) => slide(t + 0.06, 0.05)(ss),
      }),
  },
  gun_revolver: {
    ...GUN, dur: 2.0, level: 1.0, ref: 9, maxDist: 420, send: 0.36,
    render: (s) =>
      gunshot(s, {
        snap: 0.8, snapTau: 0.0012,
        crack: 1.0, crackTau: 0.016, crackHp: 850, crackPk: 2000, crackPkDb: 4,
        body: 1.0, bodyF: 430, bodyQ: 0.8, bodyTau: 0.07,
        thump: 1.2, thumpF0: 125, thumpF1: 42, thumpGlide: 0.025, thumpTau: 0.1,
        boom: 1.0, boomTau: 0.17, boomLp: 280,
        tail: 0.1, tailTau: 0.55, tailLp: 1600,
        echoes: [[0.13, 0.28, 1500], [0.27, 0.19, 1100], [0.48, 0.12, 800], [0.75, 0.06, 600]],
        drive: 4, mixGain: 0.55,
      }),
  },
  gun_shotgun: {
    ...GUN, dur: 2.5, level: 1.0, ref: 10, maxDist: 450, send: 0.38,
    render: (s) =>
      gunshot(s, {
        snap: 0.5, snapTau: 0.0015,
        crack: 1.0, crackTau: 0.02, crackHp: 700, crackPk: 1800, crackPkDb: 3,
        body: 1.1, bodyF: 320, bodyQ: 0.6, bodyTau: 0.1,
        thump: 1.4, thumpF0: 105, thumpF1: 34, thumpGlide: 0.035, thumpTau: 0.15,
        boom: 1.4, boomTau: 0.24, boomLp: 230,
        tail: 0.14, tailTau: 0.8, tailLp: 1300,
        echoes: [[0.14, 0.33, 1200], [0.3, 0.24, 900], [0.52, 0.15, 700], [0.85, 0.08, 500]],
        drive: 5, mixGain: 0.55,
      }),
  },
  gun_rifle: {
    ...GUN, dur: 2.8, level: 1.0, ref: 10, maxDist: 550, send: 0.4,
    render: (s) =>
      gunshot(s, {
        snap: 1.2, snapTau: 0.0012,
        crack: 1.0, crackTau: 0.012, crackHp: 1500, crackPk: 3200, crackPkDb: 5,
        body: 0.8, bodyF: 550, bodyTau: 0.06,
        thump: 1.0, thumpF0: 130, thumpF1: 40, thumpTau: 0.1,
        boom: 0.9, boomTau: 0.15, boomLp: 300,
        tail: 0.12, tailTau: 1.0, tailLp: 1700,
        echoes: [[0.18, 0.33, 1500], [0.38, 0.24, 1100], [0.62, 0.17, 800], [0.95, 0.1, 600], [1.35, 0.05, 500]],
        drive: 4, mixGain: 0.55,
      }),
  },
  gun_sniper: {
    ...GUN, dur: 3.4, level: 1.0, ref: 12, maxDist: 700, send: 0.45, variants: 3,
    render: (s) =>
      gunshot(s, {
        snap: 1.4, snapTau: 0.0015,
        crack: 1.1, crackTau: 0.014, crackHp: 1300, crackPk: 2800, crackPkDb: 5,
        body: 0.9, bodyF: 480, bodyTau: 0.07,
        thump: 1.25, thumpF0: 115, thumpF1: 36, thumpTau: 0.13,
        boom: 1.2, boomTau: 0.2, boomLp: 260,
        tail: 0.16, tailTau: 1.35, tailLp: 1500,
        echoes: [[0.22, 0.38, 1400], [0.45, 0.29, 1000], [0.75, 0.21, 800], [1.1, 0.14, 600], [1.55, 0.08, 500], [2.0, 0.04, 400]],
        drive: 4.5, mixGain: 0.55,
      }),
  },
  gun_ar: {
    ...GUN, dur: 1.5, level: 0.95, ref: 9, maxDist: 500, send: 0.34, cap: 12,
    render: (s) =>
      gunshot(s, {
        snap: 1.0, snapTau: 0.001,
        crack: 1.0, crackTau: 0.008, crackHp: 2000, crackPk: 3800, crackPkDb: 6,
        body: 0.65, bodyF: 900, bodyTau: 0.03,
        thump: 0.8, thumpF0: 165, thumpF1: 60, thumpTau: 0.045,
        boom: 0.5, boomTau: 0.07, boomLp: 380,
        tail: 0.08, tailTau: 0.4, tailLp: 2200,
        echoes: [[0.12, 0.22, 1800], [0.26, 0.14, 1300], [0.45, 0.07, 1000]],
        drive: 3, mixGain: 0.6,
        mech: (ss, t) => click(ss, { t: t + 0.03, f: ss.rand(4200, 5200), q: 3, tau: 0.002, peak: 0.04, ring: 0.06, ringGain: 0.6 }),
      }),
  },
  gun_ak: {
    ...GUN, dur: 1.6, level: 1.0, ref: 9, maxDist: 500, send: 0.34, cap: 12,
    render: (s) =>
      gunshot(s, {
        snap: 0.9, snapTau: 0.0012,
        crack: 1.15, crackTau: 0.011, crackHp: 1300, crackPk: 1600, crackPkDb: 8,
        body: 1.0, bodyF: 700, bodyQ: 1.1, bodyTau: 0.05,
        thump: 0.95, thumpF0: 135, thumpF1: 48, thumpTau: 0.065,
        boom: 0.7, boomTau: 0.1, boomLp: 330,
        tail: 0.09, tailTau: 0.45, tailLp: 1900,
        echoes: [[0.12, 0.25, 1700], [0.27, 0.16, 1200], [0.47, 0.08, 900]],
        drive: 6, mixGain: 0.6,
        mech: (ss, t) => click(ss, { t: t + 0.035, f: 2200, q: 2, tau: 0.003, peak: 0.06, ring: 0.04, ringGain: 0.4, body: 0.5 }),
      }),
  },
  gun_smg: {
    ...GUN, dur: 1.1, level: 0.85, ref: 7, maxDist: 320, send: 0.3, cap: 14,
    render: (s) =>
      gunshot(s, {
        snap: 0.4, snapTau: 0.001,
        crack: 0.9, crackTau: 0.008, crackHp: 1300, crackPk: 3000, crackPkDb: 5,
        body: 0.75, bodyF: 800, bodyTau: 0.03,
        thump: 0.8, thumpF0: 165, thumpF1: 65, thumpTau: 0.04,
        boom: 0.4, boomTau: 0.06, boomLp: 400,
        tail: 0.055, tailTau: 0.25, tailLp: 2200,
        echoes: [[0.1, 0.18, 1800], [0.21, 0.1, 1300]],
        drive: 3, mixGain: 0.6,
        mech: (ss, t) => click(ss, { t: t + 0.025, f: 2600, q: 2, tau: 0.002, peak: 0.05, ring: 0.03, ringGain: 0.4, body: 0.3 }),
      }),
  },
  gun_22: {
    ...GUN, dur: 0.9, level: 0.5, ref: 4, maxDist: 220, send: 0.25,
    render: (s) =>
      gunshot(s, {
        snap: 0.3, snapTau: 0.0008,
        crack: 0.8, crackTau: 0.005, crackHp: 2000, crackPk: 4000, crackPkDb: 4,
        body: 0.45, bodyF: 1300, bodyTau: 0.015,
        thump: 0.3, thumpF0: 230, thumpF1: 110, thumpTau: 0.02,
        tail: 0.035, tailTau: 0.2, tailLp: 2600,
        echoes: [[0.1, 0.12, 2000], [0.2, 0.06, 1500]],
        drive: 2, mixGain: 0.6,
      }),
  },
  gun_suppressed: {
    ...GUN, dur: 0.6, level: 0.42, ref: 3, maxDist: 70, send: 0.14,
    render: (s) =>
      gunshot(s, {
        crack: 0.12, crackTau: 0.004, crackHp: 3000,
        body: 0.85, bodyF: s.rand(600, 800), bodyQ: 0.7, bodyTau: 0.022,
        thump: 0.45, thumpF0: 125, thumpF1: 60, thumpTau: 0.03,
        boom: 0.3, boomTau: 0.04, boomLp: 500,
        tail: 0.02, tailTau: 0.12, tailLp: 1500,
        drive: 1.5, mixGain: 0.7,
        mech: (ss, t) => {
          // "thwip": quick high-passed noise sweep
          burst(ss, { t, kind: 'white', a: 0.0005, tau: 0.009, peak: 0.25, filters: [['bandpass', 6000, 1.2]], fenv: [[t, 6500], [t + 0.03, 1800, 'e']] });
          click(ss, { t: t + 0.012, f: 2800, q: 2.5, tau: 0.003, peak: 0.5, ring: 0.03, ringGain: 0.5, body: 0.4 });
          click(ss, { t: t + 0.045 + ss.rand(0, 0.01), f: 3500, q: 2, tau: 0.003, peak: 0.35, ring: 0.02 });
        },
      }),
  },
  distant_gunshot: {
    ...GUN, cat: 'amb', sr: 'lo', dur: 3.6, variants: 4, level: 0.55, ref: 50, maxDist: 5000, send: 0.25, cap: 4, group: null,
    render: (s, v) => {
      const lp = s.lp(s.rand(700, 1100), 0.6);
      const kind = v % 3; // 0 pistol-ish, 1 rifle-ish, 2 shotgun-ish
      via(s, lp, () =>
        gunshot(s, {
          crack: 0.25, crackTau: 0.012, crackHp: 500, crackPk: 1200, crackPkDb: 2,
          body: 0.8, bodyF: kind === 2 ? 300 : 450, bodyTau: 0.06,
          thump: 0.6, thumpF0: 95, thumpF1: 40, thumpTau: kind === 2 ? 0.14 : 0.09,
          boom: 1.0, boomTau: kind === 2 ? 0.26 : 0.18, boomLp: 220,
          tail: 0.22, tailA: 0.08, tailTau: kind === 1 ? 1.2 : 0.9, tailLp: 650,
          echoes: [[0.3, 0.45, 700], [0.68, 0.38, 600], [1.05, 0.28, 500], [1.55, 0.18, 400], [2.15, 0.09, 350]],
          drive: 3, mixGain: 0.5,
        })
      );
    },
  },

  // ------------------------------------------------------------------ bows
  crossbow: {
    cat: 'sfx', sr: 'mid', variants: 3, dur: 0.6, level: 0.6, ref: 3, maxDist: 50, cap: 4, send: 0.15, pv: 0.05, vv: 0.1,
    render: (s) => {
      click(s, { t: 0, f: 2500, q: 2, tau: 0.003, peak: 0.6, ring: 0.02, ringGain: 0.3 });
      pluck(s, { t: 0.003, f: s.rand(100, 125), tau: 0.05, bright: 2600, dark: 200, peak: 1, q: 3 });
      thud(s, { t: 0.003, f: 130, f1: 60, tau: 0.04, peak: 0.9, noise: 0.5, noiseLp: 900 });
      pluck(s, { t: 0.01, f: s.rand(85, 100), tau: 0.14, bright: 900, dark: 150, peak: 0.25, type: 'triangle' });
      whoosh(s, { t: 0.01, dur: 0.14, f0: 1500, fmid: 3000, f1: 1000, q: 1.4, peak: 0.3 });
    },
  },
  bow: {
    cat: 'sfx', sr: 'mid', variants: 3, dur: 0.5, level: 0.5, ref: 3, maxDist: 40, cap: 4, send: 0.15, pv: 0.05, vv: 0.1,
    render: (s) => {
      pluck(s, { t: 0, f: s.rand(170, 200), tau: 0.07, bright: 3500, dark: 300, peak: 1, q: 2 });
      thud(s, { t: 0, f: 210, f1: 90, tau: 0.03, peak: 0.45, noise: 0.25, noiseLp: 1500 });
      pluck(s, { t: 0.002, f: s.rand(340, 380), tau: 0.04, bright: 4000, dark: 500, peak: 0.2 });
      whoosh(s, { t: 0.005, dur: 0.18, f0: 2000, fmid: 3600, f1: 1500, q: 1.5, peak: 0.25 });
    },
  },

  // ------------------------------------------------------------------ gun mechanics
  dry_fire: {
    cat: 'sfx', sr: 'mid', variants: 3, dur: 0.25, level: 0.45, ref: 2, maxDist: 15, cap: 3, send: 0.05, pv: 0.05, vv: 0.1,
    render: (s) => {
      click(s, { t: 0, f: s.rand(2900, 3500), q: 2, tau: 0.003, peak: 1, ring: 0.02, ringGain: 0.4, body: 0.3, bodyF: 420 });
      click(s, { t: 0.012 + s.rand(0, 0.004), f: 5000, q: 3, tau: 0.0015, peak: 0.3 });
    },
  },
  reload_mag_out: {
    cat: 'sfx', sr: 'mid', variants: 3, dur: 0.45, level: 0.45, ref: 2, maxDist: 15, cap: 3, send: 0.05, pv: 0.05, vv: 0.1,
    render: (s) => {
      click(s, { t: 0, f: 3500, q: 2.5, tau: 0.002, peak: 0.5 });
      scrape(s, { t: 0.03, dur: 0.12, f: 2500, f1: 1900, q: 3, peak: 0.35, rough: 0.5 });
      click(s, { t: 0.05 + s.rand(0, 0.015), f: 1800, q: 1.6, tau: 0.004, peak: 0.8, ring: 0.05, ringGain: 0.35, body: 0.4 });
    },
  },
  reload_mag_in: {
    cat: 'sfx', sr: 'mid', variants: 3, dur: 0.5, level: 0.5, ref: 2, maxDist: 15, cap: 3, send: 0.05, pv: 0.05, vv: 0.1,
    render: (s) => {
      scrape(s, { t: 0, dur: 0.1, f: 2000, f1: 2600, q: 2.5, peak: 0.35, rough: 0.5 });
      const t = 0.1 + s.rand(0, 0.02);
      click(s, { t, f: s.rand(2200, 2600), q: 1.5, tau: 0.004, peak: 1, ring: 0.06, ringGain: 0.35, body: 0.6, bodyF: 300 });
      click(s, { t: t + 0.015, f: 4200, q: 2.5, tau: 0.002, peak: 0.4 });
    },
  },
  reload_shell: {
    cat: 'sfx', sr: 'mid', variants: 4, dur: 0.35, level: 0.45, ref: 2, maxDist: 15, cap: 3, send: 0.05, pv: 0.06, vv: 0.1,
    render: (s) => {
      click(s, { t: 0, f: 1500, q: 1.2, tau: 0.004, peak: 0.5, body: 0.6, bodyF: 350 });
      scrape(s, { t: 0.01, dur: 0.06, f: 1800, q: 2, peak: 0.3, rough: 0.6 });
      click(s, { t: 0.06 + s.rand(0, 0.015), f: 3200, q: 2, tau: 0.003, peak: 0.6, ring: 0.03, ringGain: 0.25 });
    },
  },
  pump: {
    cat: 'sfx', sr: 'mid', variants: 3, dur: 0.6, level: 0.6, ref: 3, maxDist: 20, cap: 3, send: 0.08, pv: 0.04, vv: 0.08,
    render: (s) => {
      // back
      scrape(s, { t: 0, dur: 0.09, f: 1500, f1: 1100, q: 2, peak: 0.6, rough: 0.7 });
      click(s, { t: 0.085, f: 1600, q: 1.3, tau: 0.005, peak: 1, ring: 0.05, ringGain: 0.3, body: 0.8, bodyF: 250 });
      // forward
      const t2 = 0.19 + s.rand(0, 0.03);
      scrape(s, { t: t2, dur: 0.08, f: 1200, f1: 1600, q: 2, peak: 0.5, rough: 0.7 });
      click(s, { t: t2 + 0.075, f: 2000, q: 1.3, tau: 0.005, peak: 1, ring: 0.06, ringGain: 0.3, body: 0.7, bodyF: 280 });
    },
  },
  bolt: {
    cat: 'sfx', sr: 'mid', variants: 3, dur: 0.8, level: 0.55, ref: 3, maxDist: 20, cap: 3, send: 0.08, pv: 0.04, vv: 0.08,
    render: (s) => {
      const j = () => s.rand(-0.01, 0.01);
      click(s, { t: 0, f: 2500, q: 2, tau: 0.003, peak: 0.6, ring: 0.03, ringGain: 0.3 });
      scrape(s, { t: 0.06 + j(), dur: 0.12, f: 2200, f1: 1600, q: 3, peak: 0.5, rough: 0.5 });
      click(s, { t: 0.18 + j(), f: 1900, q: 1.5, tau: 0.004, peak: 0.8, ring: 0.05, ringGain: 0.3, body: 0.3 });
      scrape(s, { t: 0.32 + j(), dur: 0.1, f: 1600, f1: 2300, q: 3, peak: 0.45, rough: 0.5 });
      click(s, { t: 0.43 + j(), f: 2400, q: 1.5, tau: 0.004, peak: 0.9, ring: 0.04, ringGain: 0.3, body: 0.4 });
      click(s, { t: 0.5 + j(), f: 3000, q: 2, tau: 0.003, peak: 0.6, ring: 0.02 });
    },
  },
  break_open: {
    cat: 'sfx', sr: 'mid', variants: 3, dur: 0.55, level: 0.55, ref: 3, maxDist: 20, cap: 3, send: 0.08, pv: 0.04, vv: 0.08,
    render: (s, v) => {
      click(s, { t: 0, f: 2800, q: 2, tau: 0.003, peak: 0.6, ring: 0.02 });
      click(s, { t: 0.05 + s.rand(0, 0.02), f: 900, q: 1, tau: 0.006, peak: 1, ring: 0.08, modes: 'hollow', ringGain: 0.3, body: 0.9, bodyF: 180 });
      if (v !== 1) {
        // ejected shells: plastic hull pops
        click(s, { t: 0.11, f: 1800, q: 1.5, tau: 0.004, peak: 0.35, body: 0.4, bodyF: 500 });
        click(s, { t: 0.13, f: 1700, q: 1.5, tau: 0.004, peak: 0.3, body: 0.4, bodyF: 480 });
      }
    },
  },
  break_close: {
    cat: 'sfx', sr: 'mid', variants: 3, dur: 0.4, level: 0.6, ref: 3, maxDist: 20, cap: 3, send: 0.08, pv: 0.04, vv: 0.08,
    render: (s) => {
      click(s, { t: 0, f: 1400, q: 1, tau: 0.005, peak: 1, ring: 0.07, ringGain: 0.35, body: 1.0, bodyF: 200 });
      click(s, { t: 0.012, f: 3500, q: 2, tau: 0.002, peak: 0.6 });
    },
  },
  cock: {
    cat: 'sfx', sr: 'mid', variants: 3, dur: 0.3, level: 0.45, ref: 2, maxDist: 15, cap: 3, send: 0.05, pv: 0.05, vv: 0.08,
    render: (s) => {
      click(s, { t: 0, f: 3000, q: 3, tau: 0.002, peak: 0.5 });
      click(s, { t: 0.06 + s.rand(0, 0.025), f: 2600, q: 2, tau: 0.003, peak: 0.9, ring: 0.02, ringGain: 0.3, body: 0.25 });
    },
  },
  gun_jam: {
    cat: 'sfx', sr: 'mid', variants: 3, dur: 0.45, level: 0.5, ref: 2, maxDist: 15, cap: 3, send: 0.05, pv: 0.05, vv: 0.08,
    render: (s) => {
      click(s, { t: 0, f: 3000, q: 2, tau: 0.003, peak: 0.8, ring: 0.02 });
      scrape(s, { t: 0.04, dur: 0.08, f: 1200, q: 1.5, peak: 0.5, rough: 0.9, roughRate: 60 });
      click(s, { t: 0.12 + s.rand(0, 0.02), f: 1100, q: 1, tau: 0.005, peak: 0.7, body: 0.7, bodyF: 160, ring: 0.03 });
    },
  },
  shell_drop: {
    cat: 'sfx', sr: 'mid', variants: 5, dur: 0.5, level: 0.22, ref: 1.5, maxDist: 12, cap: 6, send: 0.05, pv: 0.08, vv: 0.15,
    render: (s) => {
      const f = s.rand(2800, 4200);
      const n = s.irand(2, 4);
      let t = 0, pk = 1, gap = s.rand(0.07, 0.11);
      for (let i = 0; i < n; i++) {
        modal(s, { t, f: f * s.rand(0.97, 1.03), modes: 'brass', tau: 0.045, peak: pk * 0.6 });
        click(s, { t, f: 6000, q: 1.5, tau: 0.0012, peak: pk * 0.5 });
        t += gap;
        gap *= s.rand(0.5, 0.75);
        pk *= s.rand(0.4, 0.65);
      }
    },
  },

  // ------------------------------------------------------------------ melee
  swing_light: {
    cat: 'sfx', sr: 'mid', variants: 4, dur: 0.3, level: 0.4, ref: 2, maxDist: 14, cap: 4, send: 0.04, pv: 0.08, vv: 0.12,
    render: (s) => whoosh(s, { t: 0, dur: s.rand(0.16, 0.22), f0: 600, fmid: s.rand(1900, 2600), f1: 500, q: 1.4, peak: 1, peakAt: s.rand(0.4, 0.55) }),
  },
  swing_heavy: {
    cat: 'sfx', sr: 'mid', variants: 4, dur: 0.5, level: 0.5, ref: 2, maxDist: 16, cap: 4, send: 0.05, pv: 0.07, vv: 0.12,
    render: (s) => whoosh(s, { t: 0, dur: s.rand(0.32, 0.42), f0: 280, fmid: s.rand(900, 1300), f1: 240, q: 1.2, peak: 1, body: 0.6, bodyF: 300, peakAt: s.rand(0.5, 0.62) }),
  },
  hit_flesh: {
    cat: 'sfx', sr: 'mid', variants: 6, dur: 0.38, level: 0.6, ref: 2.5, maxDist: 25, cap: 6, group: 'hit', groupCap: 10, send: 0.08, pv: 0.08, vv: 0.12,
    render: (s) => {
      thud(s, { t: 0, f: s.rand(115, 150), f1: 60, tau: 0.05, peak: 1, noise: 0.6, noiseLp: 900, noiseTau: 0.03 });
      crackle(s, { t: 0.002, dur: 0.14, rate: 600, gmin: 0.0008, gmax: 0.004, pow: 1.5, filters: [['lowpass', 1800], ['highpass', 250]], peak: 0.7, ampEnv: [[0, 1], [1, 0]] });
      burst(s, { t: 0, kind: 'white', a: 0.001, tau: 0.02, peak: 0.45, filters: [['bandpass', s.rand(700, 1100), 1.2]] });
    },
  },
  hit_flesh_heavy: {
    cat: 'sfx', sr: 'mid', variants: 5, dur: 0.55, level: 0.75, ref: 3, maxDist: 30, cap: 5, group: 'hit', groupCap: 10, send: 0.1, pv: 0.07, vv: 0.1,
    render: (s) => {
      thud(s, { t: 0, f: s.rand(100, 125), f1: 45, tau: 0.09, peak: 1.2, noise: 0.9, noiseLp: 700, noiseTau: 0.05 });
      crackle(s, { t: 0.003, dur: 0.22, rate: 900, gmin: 0.0008, gmax: 0.005, pow: 1.4, filters: [['lowpass', 1600], ['highpass', 200]], peak: 0.8, ampEnv: [[0, 1], [1, 0]] });
      crackle(s, { t: 0, dur: 0.04, rate: 3000, gmin: 0.0003, gmax: 0.0012, pow: 1.2, filters: [['highpass', 1500], ['peaking', 2500, 1, 6]], peak: 0.45 });
      burst(s, { t: 0.005, kind: 'white', a: 0.002, tau: 0.05, peak: 0.45, filters: [['bandpass', 600, 1]] });
    },
  },
  hit_blunt: {
    cat: 'sfx', sr: 'mid', variants: 5, dur: 0.38, level: 0.65, ref: 2.5, maxDist: 25, cap: 5, group: 'hit', groupCap: 10, send: 0.08, pv: 0.08, vv: 0.12,
    render: (s) => {
      thud(s, { t: 0, f: s.rand(90, 115), f1: 50, tau: 0.06, peak: 1, noise: 0.8, noiseLp: 500, noiseTau: 0.04 });
      burst(s, { t: 0, kind: 'white', a: 0.0008, tau: 0.025, peak: 0.5, filters: [['bandpass', s.rand(350, 480), 1]] });
      crackle(s, { t: 0.004, dur: 0.1, rate: 500, gmin: 0.0008, gmax: 0.004, pow: 1.6, filters: [['lowpass', 1500]], peak: 0.35, ampEnv: [[0, 1], [1, 0]] });
    },
  },
  hit_blade: {
    cat: 'sfx', sr: 'mid', variants: 5, dur: 0.38, level: 0.6, ref: 2.5, maxDist: 22, cap: 5, group: 'hit', groupCap: 10, send: 0.08, pv: 0.08, vv: 0.12,
    render: (s) => {
      burst(s, { t: 0, kind: 'white', a: 0.001, tau: 0.03, peak: 0.6, filters: [['bandpass', 5000, 1.5], ['highpass', 2000]], fenv: [[0, s.rand(4500, 6000)], [0.05, 2500, 'e']] });
      crackle(s, { t: 0.004, dur: 0.12, rate: 700, gmin: 0.0008, gmax: 0.004, pow: 1.5, filters: [['lowpass', 2200], ['highpass', 300]], peak: 0.65, ampEnv: [[0, 1], [1, 0]] });
      thud(s, { t: 0.002, f: 150, f1: 80, tau: 0.03, peak: 0.5, noise: 0.3, noiseLp: 900 });
    },
  },
  headshot: {
    cat: 'sfx', sr: 'mid', variants: 5, dur: 0.55, level: 0.8, ref: 3, maxDist: 30, cap: 4, group: 'hit', groupCap: 10, send: 0.1, pv: 0.07, vv: 0.1,
    render: (s) => {
      crackle(s, { t: 0, dur: 0.08, rate: 2500, gmin: 0.0003, gmax: 0.0015, pow: 1.2, filters: [['highpass', 800], ['peaking', s.rand(1800, 2600), 1, 6]], peak: 1, ampEnv: [[0, 1], [1, 0.2]] });
      thud(s, { t: 0, f: s.rand(150, 175), f1: 70, tau: 0.04, peak: 1, noise: 0.5, noiseLp: 1200 });
      crackle(s, { t: 0.01, dur: 0.28, rate: 700, gmin: 0.001, gmax: 0.005, pow: 1.4, filters: [['lowpass', 1500], ['highpass', 200]], peak: 0.75, ampEnv: [[0, 1], [1, 0]] });
      burst(s, { t: 0.004, kind: 'white', a: 0.002, tau: 0.06, peak: 0.45, filters: [['bandpass', 700, 1]] });
    },
  },
  bite: {
    cat: 'sfx', sr: 'mid', variants: 4, dur: 0.6, level: 0.65, ref: 2, maxDist: 20, cap: 3, send: 0.06, pv: 0.07, vv: 0.1,
    render: (s) => {
      thud(s, { t: 0, f: 150, f1: 80, tau: 0.03, peak: 0.6, noise: 0.4, noiseLp: 1000 });
      crackle(s, { t: 0, dur: 0.15, rate: 1500, gmin: 0.0005, gmax: 0.002, pow: 1.4, filters: [['lowpass', 2500], ['highpass', 400]], peak: 0.8, ampEnv: [[0, 1], [1, 0.1]] });
      scrape(s, { t: 0.05, dur: s.rand(0.2, 0.3), f: s.rand(1000, 1400), q: 1.5, peak: 0.5, rough: 0.9, roughRate: 200, kind: 'pink' });
      crackle(s, { t: 0.05, dur: 0.35, rate: 500, gmin: 0.001, gmax: 0.006, pow: 1.5, filters: [['lowpass', 1300]], peak: 0.55, ampEnv: [[0, 0.3], [0.3, 1], [1, 0]] });
    },
  },
  shove: {
    cat: 'sfx', sr: 'mid', variants: 3, dur: 0.4, level: 0.5, ref: 2, maxDist: 15, cap: 3, send: 0.05, pv: 0.07, vv: 0.1,
    render: (s) => {
      whoosh(s, { t: 0, dur: 0.15, f0: 500, fmid: 1200, f1: 400, q: 1.2, peak: 0.6 });
      thud(s, { t: 0.08, f: 100, f1: 55, tau: 0.05, peak: 0.8, noise: 0.6, noiseLp: 600 });
      burst(s, { t: 0.08, kind: 'pink', a: 0.002, tau: 0.03, peak: 0.4, filters: [['bandpass', 1500, 0.8]] });
    },
  },
  stomp: {
    cat: 'sfx', sr: 'mid', variants: 3, dur: 0.5, level: 0.7, ref: 2.5, maxDist: 20, cap: 3, send: 0.07, pv: 0.06, vv: 0.1,
    render: (s) => {
      thud(s, { t: 0, f: 78, f1: 40, tau: 0.08, peak: 1.2, noise: 1, noiseLp: 500, noiseTau: 0.05 });
      crackle(s, { t: 0.002, dur: 0.16, rate: 1500, gmin: 0.0006, gmax: 0.003, pow: 1.3, filters: [['lowpass', 2500], ['highpass', 300]], peak: 0.7, ampEnv: [[0, 1], [1, 0]] });
      burst(s, { t: 0.003, kind: 'white', a: 0.002, tau: 0.05, peak: 0.4, filters: [['bandpass', 650, 1]] });
    },
  },
  throw: {
    cat: 'sfx', sr: 'mid', variants: 3, dur: 0.35, level: 0.4, ref: 2, maxDist: 12, cap: 3, send: 0.04, pv: 0.07, vv: 0.1,
    render: (s) => {
      whoosh(s, { t: 0, dur: s.rand(0.22, 0.28), f0: 400, fmid: 1600, f1: 600, q: 1, peak: 1 });
      burst(s, { t: 0, kind: 'pink', a: 0.01, tau: 0.04, peak: 0.25, filters: [['bandpass', 2000, 0.7]] });
    },
  },

  // ------------------------------------------------------------------ impacts on materials
  hit_wood: {
    cat: 'sfx', sr: 'mid', variants: 5, dur: 0.45, level: 0.6, ref: 3, maxDist: 30, cap: 5, group: 'impact', groupCap: 10, send: 0.1, pv: 0.07, vv: 0.12,
    render: (s) => {
      modal(s, { t: 0, f: s.rand(170, 260), modes: 'wood', tau: 0.06, peak: 1 });
      burst(s, { t: 0, kind: 'white', a: 0.0004, tau: 0.008, peak: 0.6, filters: [['bandpass', s.rand(1000, 1500), 1.2]] });
      thud(s, { t: 0, f: 120, f1: 80, tau: 0.03, peak: 0.5 });
    },
  },
  hit_metal: {
    cat: 'sfx', sr: 'mid', variants: 5, dur: 1.4, level: 0.55, ref: 3, maxDist: 40, cap: 5, group: 'impact', groupCap: 10, send: 0.14, pv: 0.06, vv: 0.12,
    render: (s) => {
      modal(s, { t: 0, f: s.rand(380, 720), modes: 'metal', tau: s.rand(0.25, 0.4), peak: 0.8 });
      click(s, { t: 0, f: 3500, q: 1, tau: 0.002, peak: 0.7 });
      thud(s, { t: 0, f: 160, f1: 100, tau: 0.02, peak: 0.3 });
    },
  },
  hit_stone: {
    cat: 'sfx', sr: 'mid', variants: 5, dur: 0.32, level: 0.55, ref: 3, maxDist: 25, cap: 5, group: 'impact', groupCap: 10, send: 0.1, pv: 0.07, vv: 0.12,
    render: (s) => {
      burst(s, { t: 0, kind: 'white', a: 0.0003, tau: 0.01, peak: 1, filters: [['bandpass', s.rand(1500, 2200), 0.8]] });
      crackle(s, { t: 0, dur: 0.07, rate: 2000, gmin: 0.0003, gmax: 0.0012, filters: [['highpass', 1500]], peak: 0.4, ampEnv: [[0, 1], [1, 0]] });
      thud(s, { t: 0, f: 140, f1: 90, tau: 0.025, peak: 0.6, noise: 0.3, noiseLp: 1200 });
    },
  },
  hit_glass: {
    cat: 'sfx', sr: 'mid', variants: 4, dur: 0.6, level: 0.45, ref: 2.5, maxDist: 25, cap: 4, group: 'impact', groupCap: 10, send: 0.1, pv: 0.06, vv: 0.12,
    render: (s) => {
      modal(s, { t: 0, f: s.rand(1700, 2600), modes: 'glass', tau: 0.12, peak: 0.8 });
      click(s, { t: 0, f: 5000, q: 1.2, tau: 0.0015, peak: 0.6 });
    },
  },
  glass_break: {
    cat: 'sfx', sr: 'mid', variants: 4, dur: 1.4, level: 0.7, ref: 4, maxDist: 50, cap: 4, send: 0.15, pv: 0.06, vv: 0.1,
    render: (s) => {
      burst(s, { t: 0, kind: 'white', a: 0.0003, tau: 0.015, peak: 1, filters: [['highpass', 2000]] });
      burst(s, { t: 0.002, kind: 'white', a: 0.002, tau: 0.12, peak: 0.5, filters: [['highpass', 3000], ['peaking', 6000, 1, 4]] });
      crackle(s, { t: 0.01, dur: 1.0, rate: 70, gmin: 0.01, gmax: 0.05, decay: 4, ping: 2800, ping2: 9500, pow: 1.4, density: (x) => (1 - x) * (1 - x), peak: 0.9 });
      crackle(s, { t: 0.15, dur: 0.9, rate: 25, gmin: 0.004, gmax: 0.02, decay: 4, ping: 2000, ping2: 6000, pow: 1.4, density: (x) => 1 - x, peak: 0.5 });
      thud(s, { t: 0, f: 220, f1: 120, tau: 0.02, peak: 0.3 });
    },
  },
  bullet_impact: {
    cat: 'sfx', sr: 'mid', variants: 5, dur: 0.38, level: 0.5, ref: 3, maxDist: 40, cap: 6, group: 'impact', groupCap: 10, send: 0.1, pv: 0.08, vv: 0.15,
    render: (s) => {
      burst(s, { t: 0, kind: 'white', a: 0.0002, tau: 0.006, peak: 1, filters: [['bandpass', s.rand(2000, 3000), 0.7]] });
      thud(s, { t: 0, f: 180, f1: 80, tau: 0.025, peak: 0.6, noise: 0.6, noiseLp: 1200 });
      crackle(s, { t: 0.01, dur: 0.16, rate: 400, gmin: 0.0005, gmax: 0.002, filters: [['highpass', 1200]], peak: 0.45, ampEnv: [[0, 1], [1, 0]] });
    },
  },
  bullet_impact_metal: {
    cat: 'sfx', sr: 'mid', variants: 5, dur: 0.8, level: 0.5, ref: 3, maxDist: 45, cap: 6, group: 'impact', groupCap: 10, send: 0.12, pv: 0.07, vv: 0.15,
    render: (s) => {
      modal(s, { t: 0, f: s.rand(1700, 2700), modes: 'metal', tau: 0.15, peak: 0.6 });
      click(s, { t: 0, f: 4000, q: 1, tau: 0.002, peak: 1, ring: 0.05, ringGain: 0.3 });
      thud(s, { t: 0, f: 220, f1: 130, tau: 0.015, peak: 0.3 });
    },
  },
  ricochet: {
    cat: 'sfx', sr: 'mid', variants: 4, dur: 0.9, level: 0.45, ref: 4, maxDist: 60, cap: 3, send: 0.15, pv: 0.06, vv: 0.12,
    render: (s) => {
      click(s, { t: 0, f: 3000, q: 1, tau: 0.003, peak: 0.6 });
      const len = s.rand(0.4, 0.65);
      const f0 = s.rand(2800, 3800), f1 = f0 * s.rand(0.35, 0.5);
      const o = s.osc('sine', f0, 0.004, 0.004 + len + 0.05);
      s.env(o.frequency, [[0.004, f0], [0.004 + len, f1, 'e']]);
      const am = s.g(0.5);
      const lfo = s.osc('sine', s.rand(30, 55), 0, len + 0.1);
      const lg = s.g(0.5);
      s.chain(lfo, lg);
      lg.connect(am.gain);
      const g = s.g(0);
      s.env(g.gain, [[0.004, 0], [0.02, 0.6], [0.004 + len * 0.5, 0.35], [0.004 + len, 0]]);
      s.chain(o, am, g, s.out);
      burst(s, { t: 0.004, kind: 'white', a: 0.01, hold: len * 0.3, tau: len * 0.25, peak: 0.12, filters: [['bandpass', f0, 4]], fenv: [[0.004, f0], [0.004 + len, f1, 'e']] });
    },
  },
};
