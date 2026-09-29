// Weapon, weapon-handling, melee and explosive sound definitions.
// Each def: { v: variants, dur: seconds rendered, sr, level: normalised peak, cat, build(K, i), loop?, xfade? }

// ---------------------------------------------------------------------------
// shared building blocks

export function metalClick(K, t, f, amp = 1, dest = K.out, ring = 0.05) {
  K.click(t, { f, q: 6, d: 0.012, amp, dest });
  K.modal(t, [[f * K.r(0.97, 1.03), ring, 0.35], [f * 1.62 * K.r(0.97, 1.03), ring * 0.7, 0.25], [f * 2.37, ring * 0.5, 0.15]], dest, { amp: amp * 0.5 });
}

export function scrape(K, t, dur, f, amp = 1, dest = K.out, q = 2.5) {
  const g = K.gain(0, dest);
  K.env(g.gain, t, [[0, 0], [dur * 0.25, amp], [dur, 0]]);
  const am = K.gain(0.5, null);
  const b = K.bp(f, q, g);
  am.connect(b);
  K.rand(t, dur, 180, 0.5, am.gain);
  K.noise(t, dur, 'white', am);
  return g;
}

export function rustle(K, t, dur, amp = 1, dest = K.out, f = 2500) {
  const g = K.gain(0, dest);
  K.env(g.gain, t, [[0, 0], [dur * 0.3, amp], [dur, 0]]);
  const b = K.bp(f, 0.8, g);
  const am = K.gain(0.4, b);
  K.rand(t, dur, 40, 0.45, am.gain);
  K.noise(t, dur, 'pink', am);
  K.crackle(t, dur, 120, { len: [0.3, 1.5], dest: K.hp(1500, 0.7, g), amp: 0.5 });
  return g;
}

// ---------------------------------------------------------------------------
// Gunshots

function gunshot(K, p) {
  const t = 0.001;
  const V = (x, a = 0.1) => K.vary(x, a);
  const sat = K.shaper(p.sat ?? 3, K.out, !!p.grit);
  const bus = K.gain(p.pre ?? 0.5, sat);
  // 1. transient: supersonic N-wave + broadband crack
  if (p.crackA) K.burst(t, { a: 0.0002, d: V(p.crackD), amp: V(p.crackA), f: [['highpass', V(p.crackHp), 0.7]], dest: bus });
  if (p.nw) K.nwave(t + 0.0002, V(p.nw, 0.15), p.nwA ?? 1, bus);
  // 2. muzzle blast: band-limited noise whose top end closes as it decays
  const blp = V(p.blastLp, 0.12);
  K.burst(t, {
    color: 'white', a: 0.0005, d: V(p.blastD), amp: V(p.blastA),
    f: [['lowpass', blp, 0.8], ['highpass', p.blastHp ?? 200, 0.7]], fenv: [[0, blp * 1.3], [p.blastD * 0.6, p.blastLp2 ?? blp * 0.28]], dest: bus,
  });
  // 3. body resonance (weight that survives small speakers)
  if (p.bodyA) K.burst(t, { a: 0.001, d: V(p.bodyD), amp: V(p.bodyA), f: [['bandpass', V(p.bodyF, 0.08), p.bodyQ ?? 1]], dest: bus, color: 'pink' });
  if (p.body2A) K.burst(t, { a: 0.001, d: V(p.body2D), amp: V(p.body2A), f: [['bandpass', V(p.body2F, 0.08), 1]], dest: bus });
  // 4. short low thump
  K.thump(t, { f0: V(p.boomF0), f1: V(p.boomF1), sweep: p.boomSweep, d: V(p.boomD), amp: V(p.boomA), dest: bus });
  // 5. mechanism
  const mechOut = K.gain(1, K.out);
  for (const m of p.mech || []) metalClick(K, t + m.t * K.r(0.9, 1.1), V(m.f, 0.05), V(m.a), mechOut, m.ring ?? 0.03);
  if (p.ring) K.modal(t, p.ring.map(([f, d, a]) => [V(f, 0.03), V(d), a]), K.out);
  // 6. air/body tail (unsaturated)
  const tg = K.gain(1, K.out);
  if (p.roll) K.rand(t, p.tailD * 1.2, p.roll, 0.45, tg.gain);
  K.burst(t + 0.004, { color: 'pink', a: 0.012, d: V(p.tailD), amp: V(p.tailA), f: [['lowpass', V(p.tailLp), 0.7], ['highpass', 90, 0.7]], dest: tg });
}

const GUNS = {
  pistol: {
    crackA: 0.8, crackD: 0.004, crackHp: 2000, blastA: 1.0, blastD: 0.07, blastLp: 5000, blastHp: 220,
    bodyF: 450, bodyQ: 1.2, bodyD: 0.07, bodyA: 0.7, boomF0: 150, boomF1: 72, boomSweep: 0.03, boomD: 0.07, boomA: 0.45,
    mech: [{ t: 0.016, f: 3400, a: 0.22 }, { t: 0.034, f: 2600, a: 0.16 }], tailLp: 1400, tailD: 0.3, tailA: 0.25, sat: 2.6, pre: 0.85,
  },
  magnum: {
    crackA: 1.0, crackD: 0.006, crackHp: 1500, nw: 0.5, nwA: 0.7, blastA: 1.1, blastD: 0.16, blastLp: 4500, blastHp: 150,
    bodyF: 320, bodyQ: 1, bodyD: 0.16, bodyA: 0.9, body2F: 1100, body2D: 0.08, body2A: 0.5,
    boomF0: 110, boomF1: 55, boomSweep: 0.05, boomD: 0.14, boomA: 0.6,
    ring: [[2150, 0.14, 0.07], [3480, 0.1, 0.05], [5200, 0.07, 0.035]], tailLp: 1000, tailD: 0.7, tailA: 0.4, sat: 3.8, pre: 0.85,
  },
  smg: {
    crackA: 0.7, crackD: 0.003, crackHp: 2500, blastA: 0.9, blastD: 0.045, blastLp: 6000, blastHp: 300,
    bodyF: 600, bodyQ: 1.4, bodyD: 0.04, bodyA: 0.5, boomF0: 190, boomF1: 90, boomSweep: 0.02, boomD: 0.045, boomA: 0.3,
    mech: [{ t: 0.022, f: 2600, a: 0.26 }], tailLp: 1500, tailD: 0.18, tailA: 0.18, sat: 2.6, pre: 0.8,
  },
  silenced: {
    crackA: 0.12, crackD: 0.002, crackHp: 5000, blastA: 0.8, blastD: 0.035, blastLp: 5000, blastLp2: 2500, blastHp: 800,
    bodyF: 1800, bodyQ: 1, bodyD: 0.04, bodyA: 0.7, boomF0: 250, boomF1: 120, boomSweep: 0.02, boomD: 0.04, boomA: 0.25,
    mech: [{ t: 0.008, f: 3800, a: 0.55 }, { t: 0.03, f: 3000, a: 0.42 }], tailLp: 900, tailD: 0.1, tailA: 0.06, sat: 1.4, pre: 0.6,
  },
  shotgun: {
    crackA: 0.7, crackD: 0.008, crackHp: 1200, blastA: 1.2, blastD: 0.2, blastLp: 3500, blastHp: 120,
    bodyF: 220, bodyQ: 0.9, bodyD: 0.22, bodyA: 1.0, body2F: 700, body2D: 0.12, body2A: 0.6,
    boomF0: 100, boomF1: 50, boomSweep: 0.06, boomD: 0.2, boomA: 0.7, tailLp: 800, tailD: 0.9, tailA: 0.45, sat: 4.5, pre: 0.8,
  },
  autoshotgun: {
    crackA: 0.7, crackD: 0.007, crackHp: 1300, blastA: 1.1, blastD: 0.16, blastLp: 3800, blastHp: 130,
    bodyF: 250, bodyQ: 0.9, bodyD: 0.18, bodyA: 0.9, body2F: 800, body2D: 0.1, body2A: 0.55,
    boomF0: 110, boomF1: 55, boomSweep: 0.05, boomD: 0.16, boomA: 0.6, mech: [{ t: 0.055, f: 2300, a: 0.3 }, { t: 0.085, f: 1800, a: 0.22 }],
    tailLp: 850, tailD: 0.7, tailA: 0.4, sat: 4, pre: 0.8,
  },
  rifle: {
    nw: 0.45, nwA: 1.0, crackA: 0.8, crackD: 0.005, crackHp: 2500, blastA: 1.0, blastD: 0.09, blastLp: 6500, blastHp: 250,
    bodyF: 500, bodyQ: 1.2, bodyD: 0.08, bodyA: 0.6, boomF0: 140, boomF1: 65, boomSweep: 0.035, boomD: 0.08, boomA: 0.4,
    mech: [{ t: 0.02, f: 2900, a: 0.16 }], tailLp: 1300, tailD: 0.45, tailA: 0.3, sat: 3.2, pre: 0.85,
  },
  rifle2: {
    nw: 0.65, nwA: 0.9, crackA: 0.8, crackD: 0.006, crackHp: 2000, blastA: 1.1, blastD: 0.12, blastLp: 5000, blastHp: 180,
    bodyF: 380, bodyQ: 1.1, bodyD: 0.11, bodyA: 0.8, boomF0: 120, boomF1: 55, boomSweep: 0.04, boomD: 0.11, boomA: 0.5,
    mech: [{ t: 0.024, f: 2200, a: 0.2 }], tailLp: 1100, tailD: 0.55, tailA: 0.36, sat: 4.2, pre: 0.9, grit: true,
  },
  sniper: {
    nw: 0.9, nwA: 1.0, crackA: 1.0, crackD: 0.01, crackHp: 1500, blastA: 1.2, blastD: 0.22, blastLp: 5000, blastHp: 120,
    bodyF: 260, bodyQ: 0.9, bodyD: 0.25, bodyA: 1.0, body2F: 900, body2D: 0.12, body2A: 0.5,
    boomF0: 95, boomF1: 45, boomSweep: 0.07, boomD: 0.25, boomA: 0.7, ring: [[1850, 0.22, 0.05], [3100, 0.16, 0.04]],
    tailLp: 900, tailD: 1.6, tailA: 0.55, roll: 7, sat: 5, pre: 0.85,
  },
  m60: {
    nw: 0.6, nwA: 0.8, crackA: 0.8, crackD: 0.007, crackHp: 1800, blastA: 1.2, blastD: 0.13, blastLp: 4200, blastHp: 150,
    bodyF: 300, bodyQ: 1, bodyD: 0.13, bodyA: 0.9, boomF0: 110, boomF1: 50, boomSweep: 0.045, boomD: 0.12, boomA: 0.55,
    mech: [{ t: 0.03, f: 1500, a: 0.28, ring: 0.05 }, { t: 0.05, f: 3600, a: 0.14 }], tailLp: 1000, tailD: 0.55, tailA: 0.42, sat: 4.5, pre: 0.9, grit: true,
  },
  minigun: {
    crackA: 0.6, crackD: 0.003, crackHp: 2200, blastA: 1.0, blastD: 0.04, blastLp: 5000, blastHp: 250,
    bodyF: 400, bodyQ: 1.2, bodyD: 0.035, bodyA: 0.6, boomF0: 170, boomF1: 80, boomSweep: 0.02, boomD: 0.04, boomA: 0.3,
    tailLp: 1100, tailD: 0.12, tailA: 0.18, sat: 3.5, pre: 0.85,
  },
};

const gunDef = (name, v, dur, level = 0.95) => ({
  v, dur, sr: 44100, level, cat: 'gun', crit: true, hp: 45, build: (K) => gunshot(K, GUNS[name]),
});

// ---------------------------------------------------------------------------

export const WEAPON_SFX = {
  pistol: gunDef('pistol', 5, 0.8),
  magnum: gunDef('magnum', 4, 1.4),
  smg: gunDef('smg', 5, 0.5),
  silenced: gunDef('silenced', 5, 0.4, 0.6),
  shotgun: gunDef('shotgun', 4, 1.8),
  autoshotgun: gunDef('autoshotgun', 4, 1.5),
  rifle: gunDef('rifle', 5, 1.0),
  rifle2: gunDef('rifle2', 5, 1.1),
  sniper: gunDef('sniper', 4, 2.4),
  m60: gunDef('m60', 5, 1.1),
  minigun: gunDef('minigun', 6, 0.35),
  launcher: {
    v: 3, dur: 0.9, sr: 44100, level: 0.85, cat: 'gun', crit: true, hp: 60,
    build(K) {
      const t = 0.001;
      const sat = K.shaper(2.2, K.out);
      const bus = K.gain(0.6, sat);
      K.thump(t, { f0: K.r(260, 300), f1: 130, sweep: 0.04, d: 0.1, amp: 0.7, dest: bus });
      K.burst(t, { d: 0.1, amp: 1, f: [['bandpass', K.r(380, 440), 2.5]], dest: bus });
      K.burst(t, { d: 0.18, amp: 1.2, f: [['bandpass', K.r(170, 195), 8]], dest: bus, color: 'pink' });
      K.burst(t, { d: 0.05, amp: 0.5, f: [['bandpass', 1200, 1.5]], dest: bus });
      K.burst(t, { d: 0.004, amp: 0.3, f: [['highpass', 3000]], dest: bus });
      metalClick(K, t + 0.03, 2200, 0.25);
      K.burst(t + 0.01, { color: 'pink', a: 0.01, d: 0.4, amp: 0.2, f: [['lowpass', 900]] });
    },
  },
  minigunSpin: {
    v: 1, dur: 2.3, sr: 32000, level: 0.6, cat: 'loop', loop: true, xfade: 0.3,
    build(K) {
      const d = 2.3;
      // motor whine
      const w = K.gain(0.35, K.bp(1400, 1.5));
      const o = K.osc('sawtooth', 185, 0, d, w);
      K.lfo(0, d, 0.9, 6, o.detune);
      K.osc('sawtooth', 370.5, 0, d, K.gain(0.25, K.bp(2600, 3)));
      // barrel rotation rattle: periodic clicks with random amplitude
      const rat = K.gain(0.8, K.bp(3200, 1.2));
      K.crackle(0, d, 70, { len: [0.3, 1.2], dest: rat, ampPow: 1 });
      const tick = K.gain(1, K.bp(2200, 4));
      for (let tt = 0.01; tt < d; tt += 1 / 36) K.burst(tt, { d: 0.012, amp: K.r(0.3, 0.6), f: [['highpass', 1500]], dest: tick });
      // low mechanical hum
      K.burst(0, { color: 'brown', a: 0.2, hold: d - 0.4, d: 0.2, amp: 0.4, f: [['lowpass', 180]] });
    },
  },
  dryFire: {
    v: 3, dur: 0.15, sr: 44100, level: 0.5, cat: 'foley', crit: true,
    build(K) { metalClick(K, 0.001, K.r(3200, 3800), 1, K.out, 0.02); metalClick(K, 0.012, K.r(1500, 1800), 0.5, K.out, 0.02); },
  },
  magOut: {
    v: 3, dur: 0.4, sr: 44100, level: 0.5, cat: 'foley', crit: true,
    build(K) {
      metalClick(K, 0.005, K.r(2800, 3300), 0.8);
      scrape(K, 0.02, K.r(0.1, 0.14), K.r(1800, 2400), 0.5);
      metalClick(K, 0.16, K.r(1400, 1700), 0.4, K.out, 0.04);
    },
  },
  magIn: {
    v: 3, dur: 0.4, sr: 44100, level: 0.55, cat: 'foley', crit: true,
    build(K) {
      scrape(K, 0.0, K.r(0.08, 0.11), K.r(1600, 2100), 0.45);
      const t = K.r(0.1, 0.13);
      metalClick(K, t, K.r(1700, 2000), 1, K.out, 0.05);
      K.thump(t, { f0: 320, f1: 180, d: 0.05, amp: 0.4 });
      metalClick(K, t + 0.015, K.r(3500, 4200), 0.5, K.out, 0.02);
    },
  },
  slideRack: {
    v: 3, dur: 0.45, sr: 44100, level: 0.6, cat: 'foley', crit: true,
    build(K) {
      metalClick(K, 0.003, K.r(2600, 3000), 0.6);
      scrape(K, 0.01, 0.07, K.r(2500, 3200), 0.5);
      const t = K.r(0.14, 0.18);
      scrape(K, t - 0.02, 0.03, 3000, 0.4);
      metalClick(K, t, K.r(2100, 2500), 1, K.out, 0.08);
      K.modal(t, [[2780, 0.08, 0.3], [4410, 0.06, 0.2]]);
    },
  },
  boltCycle: {
    v: 3, dur: 0.7, sr: 44100, level: 0.6, cat: 'foley', crit: true,
    build(K) {
      metalClick(K, 0.005, K.r(1900, 2200), 0.6);
      scrape(K, 0.05, 0.1, 2200, 0.5);
      metalClick(K, 0.16, K.r(2500, 2900), 0.8, K.out, 0.05);
      scrape(K, 0.3, 0.09, 2400, 0.5);
      metalClick(K, 0.4, K.r(2100, 2400), 1, K.out, 0.06);
      metalClick(K, 0.47, K.r(1600, 1800), 0.7, K.out, 0.04);
    },
  },
  pump: {
    v: 4, dur: 0.45, sr: 44100, level: 0.7, cat: 'foley', crit: true,
    build(K) {
      // shk-chk: back stroke then forward stroke, wooden fore-end + steel action
      const t2 = K.r(0.15, 0.2);
      for (const [t, f, a] of [[0.002, K.r(1400, 1700), 1], [t2, K.r(1700, 2000), 0.9]]) {
        scrape(K, t, 0.05, f * 1.5, 0.6);
        metalClick(K, t + 0.045, f, a, K.out, 0.05);
        K.thump(t + 0.045, { f0: 260, f1: 150, d: 0.05, amp: 0.4 * a });
        K.burst(t + 0.045, { d: 0.04, amp: 0.4, f: [['bandpass', 900, 2]] });
      }
    },
  },
  shellInsert: {
    v: 4, dur: 0.3, sr: 44100, level: 0.5, cat: 'foley', crit: true,
    build(K) {
      scrape(K, 0.0, 0.05, 1600, 0.3);
      K.burst(0.045, { d: 0.03, amp: 0.8, f: [['bandpass', K.r(1900, 2400), 4]] });
      metalClick(K, 0.06, K.r(2800, 3200), 0.6, K.out, 0.03);
      K.thump(0.06, { f0: 400, f1: 220, d: 0.04, amp: 0.3 });
    },
  },
  reloadStart: {
    v: 3, dur: 0.4, sr: 32000, level: 0.45, cat: 'foley', crit: true,
    build(K) { rustle(K, 0, 0.25, 0.7); metalClick(K, K.r(0.12, 0.2), K.r(1500, 2000), 0.6, K.out, 0.04); },
  },
  casing: {
    v: 5, dur: 0.5, sr: 44100, level: 0.4, cat: 'debris', crit: true,
    build(K) {
      const f = K.r(3200, 4600);
      let t = 0.001, a = 1;
      const n = K.ri(2, 4);
      for (let i = 0; i < n; i++) {
        K.modal(t, [[f * K.r(0.99, 1.01), 0.12, 0.5], [f * 1.47, 0.09, 0.35], [f * 2.09, 0.07, 0.3], [f * 2.63, 0.05, 0.2], [f * 0.52, 0.05, 0.1]], K.out, { amp: a });
        K.click(t, { f: 6000, q: 2, d: 0.004, amp: a * 0.4 });
        t += K.r(0.05, 0.11) * (1 - i * 0.25); a *= K.r(0.35, 0.6);
      }
    },
  },
  shellDrop: {
    v: 4, dur: 0.5, sr: 32000, level: 0.4, cat: 'debris', crit: true,
    build(K) {
      let t = 0.001, a = 1;
      const f = K.r(750, 1050);
      for (let i = 0; i < 3; i++) {
        K.burst(t, { d: 0.025, amp: a, f: [['bandpass', f * 1.4, 3]] });
        K.modal(t, [[f, 0.05, 0.4], [f * 2.3, 0.03, 0.2]], K.out, { amp: a });
        K.modal(t, [[f * 4.2, 0.04, 0.2]], K.out, { amp: a * 0.5 });
        t += K.r(0.07, 0.13) * (1 - i * 0.3); a *= 0.5;
      }
    },
  },

  // --- melee
  swing: {
    v: 5, dur: 0.4, sr: 32000, level: 0.55, cat: 'foley', crit: true,
    build(K) {
      const d = K.r(0.2, 0.3);
      K.whoosh(0, d, { f0: K.r(300, 500), f1: K.r(1400, 2200), f2: 500, q: 1.4, amp: 1, peakAt: K.r(0.45, 0.6) });
      K.whoosh(0, d, { f0: 2000, f1: 4500, f2: 2500, q: 2, amp: 0.3, peakAt: 0.55 });
    },
  },
  meleeHit: {
    v: 5, dur: 0.6, sr: 44100, level: 0.9, cat: 'impact', crit: true, ref: 4,
    build(K) {
      const sat = K.shaper(2.5, K.out);
      K.burst(0.001, { d: 0.02, amp: 1, f: [['bandpass', K.r(1800, 2600), 1.5]], dest: sat });
      K.thump(0.001, { f0: K.r(170, 210), f1: 80, d: 0.12, amp: 0.9, dest: sat });
      K.squelch(0.004, K.r(0.15, 0.25), { f: K.r(700, 1100), q: 3, amp: 0.8, rate: 55 });
      K.burst(0.003, { color: 'pink', d: 0.08, amp: 0.7, f: [['lowpass', 1500]] });
      // bone crack
      if (K.chance(0.7)) { K.click(K.r(0.01, 0.03), { f: K.r(2500, 3500), q: 3, d: 0.012, amp: 0.6 }); K.click(K.r(0.03, 0.05), { f: 1800, q: 3, d: 0.01, amp: 0.4 }); }
      K.crackle(0.01, 0.12, 250, { len: [0.3, 1.5], dest: K.lp(3000), amp: 0.5 });
    },
  },
  meleeHitBlunt: {
    v: 5, dur: 0.5, sr: 32000, level: 0.9, cat: 'impact', crit: true, ref: 4,
    build(K) {
      const sat = K.shaper(3, K.out);
      K.thump(0.001, { f0: K.r(120, 150), f1: 55, sweep: 0.06, d: 0.18, amp: 1.1, dest: sat });
      K.burst(0.001, { color: 'pink', d: 0.09, amp: 0.9, f: [['lowpass', 900]], dest: sat });
      K.crackle(0.004, 0.08, 500, { len: [0.3, 2], dest: K.bp(2000, 0.8), amp: 0.8 });
      K.squelch(0.01, 0.12, { f: 500, q: 2.5, amp: 0.35 });
    },
  },
  meleeWall: {
    v: 4, dur: 0.8, sr: 44100, level: 0.75, cat: 'impact', crit: true,
    build(K) {
      const f = K.r(600, 900);
      K.modal(0.001, [[f, 0.35, 0.4], [f * 2.76, 0.25, 0.3], [f * 5.4, 0.15, 0.2], [f * 1.5, 0.2, 0.2]]);
      K.burst(0.001, { d: 0.03, amp: 1, f: [['bandpass', 2500, 1]] });
      K.thump(0.001, { f0: 200, f1: 90, d: 0.06, amp: 0.5 });
      K.crackle(0.005, 0.2, [[0, 600], [0.2, 20]], { len: [0.2, 1], dest: K.hp(2000), amp: 0.5 });
    },
  },
  meleeWallSharp: {
    v: 4, dur: 0.9, sr: 44100, level: 0.7, cat: 'impact', crit: true,
    build(K) {
      const f = K.r(2200, 3200);
      K.modal(0.001, [[f, 0.5, 0.3], [f * 1.53, 0.35, 0.25], [f * 2.41, 0.25, 0.15], [f * 0.63, 0.2, 0.15]]);
      K.burst(0.001, { d: 0.015, amp: 1, f: [['highpass', 2500]] });
      scrape(K, 0.005, K.r(0.08, 0.15), 4500, 0.4);
      K.crackle(0.002, 0.1, 400, { len: [0.2, 1], dest: K.hp(2500), amp: 0.4 });
    },
  },
  shove: {
    v: 4, dur: 0.35, sr: 32000, level: 0.45, cat: 'foley', crit: true,
    build(K) {
      K.whoosh(0, K.r(0.18, 0.25), { f0: 250, f1: 900, f2: 300, q: 0.9, amp: 1, color: 'pink', peakAt: 0.5 });
      rustle(K, 0.02, 0.15, 0.5);
    },
  },
  shoveHit: {
    v: 4, dur: 0.4, sr: 32000, level: 0.75, cat: 'impact', crit: true,
    build(K) {
      K.thump(0.001, { f0: K.r(110, 140), f1: 65, d: 0.14, amp: 1 });
      K.burst(0.001, { color: 'pink', d: 0.08, amp: 0.8, f: [['lowpass', 700]] });
      rustle(K, 0.005, 0.1, 0.4);
    },
  },

  // --- L4D2 melee extras
  swingBlade: { // katana: thin, fast, high whistle
    v: 4, dur: 0.35, sr: 44100, level: 0.55, cat: 'foley', crit: true,
    build(K) {
      const d = K.r(0.16, 0.22);
      K.whoosh(0, d, { f0: K.r(900, 1200), f1: K.r(3800, 5200), f2: 1800, q: 3.2, amp: 1, peakAt: K.r(0.5, 0.62) });
      K.whoosh(0, d * 0.9, { f0: 400, f1: 1500, f2: 600, q: 1.2, amp: 0.35, peakAt: 0.55 });
    },
  },
  swingHeavy: { // bat / pan: slower, lower, more air moved
    v: 4, dur: 0.5, sr: 32000, level: 0.6, cat: 'foley', crit: true,
    build(K) {
      const d = K.r(0.28, 0.36);
      K.whoosh(0, d, { f0: K.r(180, 260), f1: K.r(800, 1100), f2: 260, q: 1.1, amp: 1, color: 'pink', peakAt: K.r(0.5, 0.6) });
      K.whoosh(0, d, { f0: 900, f1: 2200, f2: 900, q: 1.8, amp: 0.25, peakAt: 0.58 });
    },
  },
  katanaHit: { // clean slice through flesh + bone tick
    v: 5, dur: 0.5, sr: 44100, level: 0.85, cat: 'impact', crit: true, ref: 4,
    build(K) {
      K.burst(0.001, { d: 0.05, amp: 0.9, f: [['highpass', 2500], ['bandpass', K.r(4200, 5600), 1.2]] });
      scrape(K, 0.002, K.r(0.07, 0.11), K.r(3500, 4500), 0.55, K.out, 3);
      K.squelch(0.006, K.r(0.12, 0.2), { f: K.r(900, 1300), q: 3.5, amp: 0.7, rate: 70 });
      K.thump(0.002, { f0: 190, f1: 90, d: 0.07, amp: 0.45 });
      if (K.chance(0.6)) K.click(K.r(0.015, 0.04), { f: K.r(2600, 3400), q: 3, d: 0.01, amp: 0.4 });
    },
  },
  batHit: { // hollow wooden crack + meaty thud
    v: 5, dur: 0.6, sr: 32000, level: 0.9, cat: 'impact', crit: true, ref: 4,
    build(K) {
      const sat = K.shaper(2.2, K.out);
      const f = K.r(420, 520);
      K.modal(0.001, [[f, 0.09, 0.6], [f * 2.31, 0.06, 0.35], [f * 3.9, 0.04, 0.2]], sat);
      K.burst(0.001, { d: 0.025, amp: 0.8, f: [['bandpass', K.r(1400, 1900), 1.4]], dest: sat });
      K.thump(0.001, { f0: K.r(110, 135), f1: 55, sweep: 0.07, d: 0.2, amp: 1.1, dest: sat });
      K.burst(0.002, { color: 'pink', d: 0.1, amp: 0.7, f: [['lowpass', 800]] });
      K.crackle(0.004, 0.06, 600, { len: [0.3, 2], dest: K.bp(2300, 0.9), amp: 0.5 });
    },
  },
  batWall: {
    v: 3, dur: 0.6, sr: 32000, level: 0.75, cat: 'impact', crit: true,
    build(K) {
      const f = K.r(380, 470);
      K.modal(0.001, [[f, 0.16, 0.7], [f * 2.4, 0.1, 0.35], [f * 4.1, 0.05, 0.2]]);
      K.burst(0.001, { d: 0.03, amp: 0.9, f: [['bandpass', 1600, 1.2]] });
      K.thump(0.001, { f0: 160, f1: 80, d: 0.08, amp: 0.5 });
    },
  },
  panClang: { // the comedic cast-iron BONG: loud strike, long wobbly ring
    v: 4, dur: 1.9, sr: 44100, level: 0.95, cat: 'impact', crit: true, ref: 5,
    build(K) {
      const f = K.r(520, 640), wob = K.r(0.985, 0.995);
      K.burst(0.001, { d: 0.02, amp: 1, f: [['bandpass', 3200, 1.1]] });
      K.thump(0.001, { f0: 240, f1: 120, d: 0.08, amp: 0.6 });
      const ring = K.modal(0.001, [[f, 1.6, 0.55], [f * wob, 1.5, 0.45], [f * 1.593, 1.1, 0.35], [f * 2.137, 0.8, 0.3], [f * 2.92, 0.55, 0.22], [f * 3.87, 0.35, 0.15], [f * 5.21, 0.2, 0.1]], K.out, { glide: 0.992, glideT: 0.8 });
      K.lfo(0.001, 1.8, K.r(5, 7), 0.25, ring.gain);
      K.crackle(0.003, 0.05, 900, { len: [0.2, 1], dest: K.hp(3000), amp: 0.4 });
    },
  },
  // --- chainsaw
  chainsawStart: { // pull cord zip, sputter, catch
    v: 2, dur: 1.2, sr: 32000, level: 0.75, cat: 'foley', crit: true,
    build(K) {
      scrape(K, 0.0, 0.22, 1800, 0.6, K.out, 1.6);
      K.whoosh(0, 0.22, { f0: 600, f1: 2400, f2: 900, q: 2, amp: 0.4 });
      const sat = K.shaper(3, K.out);
      for (let i = 0; i < 7; i++) {
        const t = 0.28 + i * K.r(0.045, 0.065);
        K.thump(t, { f0: 140, f1: 70, d: 0.05, amp: 0.5 + i * 0.05, dest: sat });
        K.burst(t, { color: 'pink', d: 0.04, amp: 0.4, f: [['bandpass', 700, 1.5]], dest: sat });
      }
      const g = K.gain(0, K.lp(1400, 0.8, sat));
      K.env(g.gain, 0.62, [[0, 0], [0.08, 0.7], [0.55, 0.5]]);
      const o = K.osc('sawtooth', 58, 0.62, 0.58, g);
      o.frequency.setValueAtTime(95, 0.62); o.frequency.exponentialRampToValueAtTime(52, 1.1);
    },
  },
  chainsawIdle: { // two-stroke idle putter + chain slap
    v: 1, dur: 2.4, sr: 32000, level: 0.62, cat: 'loop', loop: true, xfade: 0.25,
    build(K) {
      const d = 2.4, f = 50;
      const sat = K.shaper(2.8, K.out);
      const eg = K.gain(0.5, K.lp(900, 0.9, sat));
      const o = K.osc('sawtooth', f, 0, d, eg);
      K.rand(0, d, 9, 3.5, o.frequency);
      const o2 = K.osc('square', f * 0.5, 0, d, K.gain(0.18, K.lp(300, 0.7, sat)));
      K.rand(0, d, 9, 1.8, o2.frequency);
      // exhaust chuff: pink noise gated at the firing rate
      const ng = K.gain(0.0, K.bp(1100, 0.9, sat));
      K.lfo(0, d, f, 0.35, ng.gain, 'square');
      K.noise(0, d, 'pink', ng);
      K.crackle(0, d, 45, { len: [0.2, 0.8], dest: K.gain(0.5, K.bp(3200, 1.2)), amp: 0.6 });
    },
  },
  chainsawCut: { // full-throttle scream + chain whine
    v: 1, dur: 2.2, sr: 44100, level: 0.8, cat: 'loop', loop: true, xfade: 0.25,
    build(K) {
      const d = 2.2, f = 148;
      const sat = K.shaper(3.4, K.out, true);
      const o = K.osc('sawtooth', f, 0, d, K.gain(0.55, K.bp(1500, 0.7, sat)));
      K.rand(0, d, 6, 6, o.frequency);
      const o2 = K.osc('sawtooth', f * 2.01, 0, d, K.gain(0.3, K.bp(2600, 1.5, sat)));
      K.rand(0, d, 6, 10, o2.frequency);
      K.osc('square', f * 0.5, 0, d, K.gain(0.2, K.lp(500, 0.8, sat)));
      const ng = K.gain(0.35, K.hp(2400, 0.7));
      K.rand(0, d, 30, 0.2, ng.gain);
      K.noise(0, d, 'white', ng);
      K.crackle(0, d, 420, { len: [0.2, 1], dest: K.gain(0.7, K.bp(4200, 1.4)), amp: 0.7 });
    },
  },
  chainsawWind: { // throttle released: pitch falls back to idle
    v: 2, dur: 0.6, sr: 32000, level: 0.55, cat: 'foley',
    build(K) {
      const sat = K.shaper(2.5, K.out);
      const g = K.gain(0, K.bp(1300, 0.8, sat));
      K.env(g.gain, 0, [[0, 0.7], [0.5, 0.0001, 'e']]);
      const o = K.osc('sawtooth', 150, 0, 0.55, g);
      o.frequency.exponentialRampToValueAtTime(55, 0.45);
    },
  },
  chainsawStop: { // out of gas: sputter and die
    v: 2, dur: 1.3, sr: 32000, level: 0.6, cat: 'foley', crit: true,
    build(K) {
      const sat = K.shaper(2.6, K.out);
      let t = 0.02;
      for (let i = 0; i < 9; i++) {
        t += 0.05 + i * i * 0.006;
        K.thump(t, { f0: 120, f1: 60, d: 0.06, amp: 0.7 - i * 0.06, dest: sat });
        K.burst(t, { color: 'pink', d: 0.05, amp: 0.4 - i * 0.03, f: [['bandpass', 800, 1.4]], dest: sat });
      }
      metalClick(K, t + 0.12, 1900, 0.3);
    },
  },
  chainsawFlesh: { // wet tearing chew
    v: 4, dur: 0.5, sr: 32000, level: 0.8, cat: 'impact', crit: true, ref: 4,
    build(K) {
      K.squelch(0.001, K.r(0.3, 0.4), { f: K.r(700, 1000), q: 2.5, amp: 1, rate: 90, depth: 0.6 });
      K.crackle(0.002, 0.3, 700, { len: [0.3, 1.8], dest: K.bp(1800, 0.8), amp: 0.8 });
      K.burst(0.001, { color: 'pink', d: 0.2, amp: 0.6, f: [['lowpass', 1200]] });
      if (K.chance(0.6)) K.click(K.r(0.03, 0.12), { f: K.r(2200, 3000), q: 3, d: 0.01, amp: 0.5 });
    },
  },
  chainsawGrind: { // chain on concrete / metal
    v: 3, dur: 0.5, sr: 44100, level: 0.7, cat: 'impact',
    build(K) {
      scrape(K, 0.001, K.r(0.25, 0.35), K.r(3800, 5200), 1, K.out, 2);
      K.crackle(0.001, 0.3, 900, { len: [0.2, 0.8], dest: K.hp(3000), amp: 0.8 });
      metalClick(K, 0.004, K.r(2600, 3400), 0.4);
    },
  },
  // --- defibrillator / upgrades
  defibCharge: { // capacitor whine rising, ready beeps
    v: 2, dur: 3.1, sr: 44100, level: 0.6, cat: 'foley', crit: true,
    build(K) {
      const g = K.gain(0, K.bp(3000, 0.8));
      K.env(g.gain, 0, [[0, 0], [0.2, 0.5], [2.6, 0.8], [2.9, 0.0001, 'e']]);
      const o = K.osc('sawtooth', 700, 0, 2.9, g);
      o.frequency.setValueAtTime(700, 0); o.frequency.exponentialRampToValueAtTime(4200, 2.6);
      const o2 = K.osc('sine', 1400, 0, 2.9, K.gain(0.3, g));
      o2.frequency.setValueAtTime(1400, 0); o2.frequency.exponentialRampToValueAtTime(8400, 2.6);
      for (const t of [0.05, 0.12]) K.modal(t, [[1850, 0.08, 0.4]]);
      for (const t of [2.62, 2.8]) K.modal(t, [[2350, 0.1, 0.5], [4700, 0.06, 0.2]]);
      K.burst(0, { d: 0.05, amp: 0.3, f: [['bandpass', 1200, 2]] });
    },
  },
  defibZap: { // discharge thump + arc crackle + monitor beep
    v: 3, dur: 1.4, sr: 44100, level: 0.9, cat: 'impact', crit: true,
    build(K) {
      const sat = K.shaper(3, K.out);
      K.thump(0.001, { f0: 160, f1: 45, sweep: 0.1, d: 0.3, amp: 1.2, dest: sat });
      K.burst(0.001, { d: 0.09, amp: 1, f: [['highpass', 1500]], dest: sat });
      K.crackle(0.001, 0.22, [[0, 2500], [0.22, 80]], { len: [0.3, 2], dest: K.hp(1800), amp: 0.9 });
      const g = K.gain(0.35, K.bp(1000, 2));
      K.osc('square', 1000, 0.52, 0.16, g);
      K.modal(0.52, [[2000, 0.2, 0.15]]);
    },
  },
  upgradeDeploy: { // pack dropped, latches flipped, lid swung open
    v: 2, dur: 1.0, sr: 32000, level: 0.7, cat: 'foley', crit: true,
    build(K) {
      K.thump(0.001, { f0: 140, f1: 70, d: 0.12, amp: 0.8 });
      K.burst(0.002, { color: 'pink', d: 0.08, amp: 0.6, f: [['lowpass', 900]] });
      metalClick(K, 0.16, 2400, 0.6); metalClick(K, 0.24, 2600, 0.6);
      scrape(K, 0.32, 0.22, 1400, 0.4);
      K.thump(0.56, { f0: 200, f1: 100, d: 0.08, amp: 0.5 });
      rustle(K, 0.6, 0.3, 0.4);
    },
  },
  upgradeTake: { // rummaging through rounds, mag clicked in
    v: 3, dur: 0.9, sr: 32000, level: 0.7, cat: 'foley', crit: true,
    build(K) {
      rustle(K, 0, 0.35, 0.6);
      for (let i = 0; i < 6; i++) metalClick(K, 0.05 + i * K.r(0.04, 0.07), K.r(3000, 4200), 0.35, K.out, 0.03);
      metalClick(K, 0.58, 1800, 0.8); metalClick(K, 0.62, 2600, 0.5);
    },
  },
  laserAttach: { // rail clamp + switch on chirp
    v: 2, dur: 0.6, sr: 44100, level: 0.6, cat: 'foley', crit: true,
    build(K) {
      scrape(K, 0, 0.1, 2800, 0.5);
      metalClick(K, 0.12, 2200, 0.8); metalClick(K, 0.2, 3100, 0.6);
      K.modal(0.32, [[3400, 0.08, 0.35]]);
    },
  },
  explosiveRound: { // small high-explosive pop
    v: 4, dur: 0.9, sr: 32000, level: 0.8, cat: 'explosion', ref: 6,
    build(K) {
      const sat = K.shaper(2.8, K.out);
      K.thump(0.001, { f0: K.r(110, 140), f1: 45, sweep: 0.08, d: 0.25, amp: 1, dest: sat });
      K.burst(0.001, { d: 0.12, amp: 0.9, f: [['lowpass', 2600]], dest: sat, fenv: [[0, 2600], [0.1, 500]] });
      K.burst(0.003, { color: 'pink', a: 0.01, d: 0.5, amp: 0.3, f: [['lowpass', 700]] });
      K.crackle(0.01, 0.2, 300, { len: [0.2, 1], dest: K.hp(1500), amp: 0.4 });
    },
  },

  // --- explosives
  explosion: {
    v: 3, dur: 4.5, sr: 32000, level: 0.97, cat: 'explosion', crit: true,
    build(K) { explosionCore(K, { size: 1 }); },
  },
  propaneExplode: {
    v: 2, dur: 5.0, sr: 32000, level: 0.97, cat: 'explosion',
    build(K) {
      // hiss burst, then bigger boom with a fireball roar
      K.burst(0, { d: 0.12, amp: 0.3, f: [['highpass', 3000]] });
      explosionCore(K, { size: 1.25, t: 0.06 });
      fireball(K, 0.1, 2.2, 0.7);
    },
  },
  gasCanIgnite: {
    v: 3, dur: 3.0, sr: 32000, level: 0.85, cat: 'explosion',
    build(K) {
      K.thump(0.001, { f0: 90, f1: 40, sweep: 0.1, d: 0.5, amp: 1 });
      fireball(K, 0.0, 2.2, 1);
    },
  },
  molotov: {
    v: 3, dur: 3.0, sr: 44100, level: 0.9, cat: 'explosion', crit: true, ref: 8,
    build(K) {
      glassSmash(K, 0, 0.8, 0.55);
      K.thump(0.05, { f0: 70, f1: 35, sweep: 0.15, d: 0.6, amp: 0.8 });
      fireball(K, 0.04, 2.2, 0.9);
    },
  },
  glass: {
    v: 4, dur: 1.4, sr: 44100, level: 0.8, cat: 'impact', crit: true, ref: 5,
    build(K) { glassSmash(K, 0, 1, 0.45); },
  },
  beep: {
    v: 1, dur: 0.14, sr: 32000, level: 0.55, cat: 'world', crit: true, ref: 4, jitter: 0,
    build(K) {
      const g = K.gain(0, K.lp(6000));
      K.env(g.gain, 0, [[0, 0], [0.003, 1], [0.08, 0.9], [0.095, 0]]);
      K.osc('square', 2050, 0, 0.1, K.gain(0.5, g));
      K.osc('sine', 4100, 0, 0.1, K.gain(0.2, g));
    },
  },
  throw: {
    v: 4, dur: 0.45, sr: 32000, level: 0.5, cat: 'foley', crit: true,
    build(K) { K.whoosh(0, K.r(0.25, 0.35), { f0: 300, f1: K.r(1100, 1500), f2: 350, q: 1.1, amp: 1, peakAt: 0.35, color: 'pink' }); rustle(K, 0, 0.12, 0.3); },
  },
  bounce: {
    v: 4, dur: 0.6, sr: 44100, level: 0.55, cat: 'impact', crit: true,
    build(K) {
      const f = K.r(850, 1200);
      K.modal(0.001, [[f, 0.25, 0.4], [f * 2.71, 0.18, 0.35], [f * 5.2, 0.1, 0.2], [f * 8.3, 0.06, 0.1]]);
      K.burst(0.001, { d: 0.015, amp: 0.6, f: [['bandpass', 3000, 1]] });
      K.thump(0.001, { f0: 240, f1: 120, d: 0.04, amp: 0.4 });
    },
  },
  fireLoop: {
    v: 1, dur: 6.4, sr: 32000, level: 0.6, cat: 'loop', loop: true, xfade: 0.4,
    build(K) { fireTexture(K, 0, 6.4, 1); },
  },
  oxygenHiss: {
    v: 1, dur: 3.3, sr: 44100, level: 0.5, cat: 'loop', loop: true, xfade: 0.3,
    build(K) {
      const g = K.gain(0.8, K.hp(1800));
      K.rand(0, 3.3, 14, 0.15, g.gain);
      K.noise(0, 3.3, 'white', K.bp(5200, 0.8, g));
      K.noise(0, 3.3, 'white', K.gain(0.3, K.bp(9000, 2, g)));
      K.noise(0, 3.3, 'pink', K.gain(0.15, K.bp(900, 1.5)));
    },
  },
};

// ---------------------------------------------------------------------------

export function explosionCore(K, o = {}) {
  const s = o.size ?? 1;
  const t = o.t ?? 0.001;
  const sat = K.shaper(5, K.out);
  const bus = K.gain(0.55, sat);
  // initial crack
  K.burst(t, { d: 0.02, amp: 1, f: [['highpass', 900]], dest: bus });
  K.nwave(t, 2.5 * s, 0.8, bus);
  // main blast
  K.burst(t, { a: 0.002, d: 0.6 * s, amp: 1.4, f: [['lowpass', 2800, 0.8], ['highpass', 90, 0.7]], fenv: [[0, 4000], [0.5, 500]], dest: bus, color: 'white' });
  K.burst(t, { color: 'pink', a: 0.003, d: 0.8 * s, amp: 1.3, f: [['bandpass', 220, 0.8]], dest: bus });
  K.burst(t, { a: 0.002, d: 0.35 * s, amp: 0.7, f: [['bandpass', 800, 1]], dest: bus });
  K.burst(t, { color: 'brown', a: 0.004, d: 1.2 * s, amp: 0.9, f: [['lowpass', 500, 0.7]], dest: bus });
  K.thump(t, { f0: 80, f1: 32, sweep: 0.2, d: 0.9 * s, amp: 0.9, dest: bus });
  // low rolling rumble tail (unsaturated)
  const rg = K.gain(1, K.out);
  K.rand(t, 4, 5, 0.35, rg.gain);
  K.burst(t + 0.05, { color: 'brown', a: 0.15, d: 3.2 * s, amp: 0.7, f: [['lowpass', 260, 0.7]], dest: rg });
  K.burst(t + 0.02, { color: 'pink', a: 0.05, d: 1.8 * s, amp: 0.5, f: [['lowpass', 1400], ['highpass', 120]], dest: rg });
  // debris patter
  K.crackle(t + 0.15, 1.6, [[0, 90], [0.6, 40], [1.6, 0]], { len: [0.3, 3], dest: K.bp(1800, 0.7), amp: 0.5 });
  K.crackle(t + 0.2, 2, [[0, 25], [2, 0]], { len: [1, 5], dest: K.lp(700), amp: 0.6 });
}

export function fireTexture(K, t, dur, amp = 1, dest = K.out) {
  const g = K.gain(amp, dest);
  // roar with flicker
  const roar = K.gain(0.8, g);
  K.rand(t, dur, 6, 0.4, roar.gain);
  K.noise(t, dur, 'brown', K.lp(450, 0.8, roar));
  const mid = K.gain(0.25, g);
  K.rand(t, dur, 11, 0.2, mid.gain);
  K.noise(t, dur, 'pink', K.bp(900, 0.7, mid));
  // crackles and pops
  K.crackle(t, dur, 120, { len: [0.1, 0.8], dest: K.hp(1500, 0.7, g), amp: 0.7 });
  K.crackle(t, dur, 9, { len: [1, 4], dest: K.bp(1200, 0.8, g), amp: 1, ampPow: 1.2 });
  // hiss
  K.noise(t, dur, 'white', K.gain(0.05, K.hp(5000, 0.7, g)));
  return g;
}

export function fireball(K, t, dur, amp = 1) {
  const g = K.gain(0, K.out);
  K.env(g.gain, t, [[0, 0], [0.12, amp], [0.4, amp * 0.8], [dur, 0.0001, 'e']]);
  const f = K.lp(300, 0.9, g);
  K.env(f.frequency, t, [[0, 200], [0.18, 2800, 'e'], [dur, 600, 'e']]);
  K.noise(t, dur, 'pink', f);
  K.noise(t, dur, 'brown', K.gain(1.2, f));
  fireTexture(K, t + 0.1, dur - 0.1, 0.4, g);
}

export function glassSmash(K, t, amp = 1, len = 0.45) {
  const g = K.gain(amp, K.out);
  K.burst(t, { d: 0.03, amp: 1, f: [['highpass', 1800]], dest: g });
  K.burst(t, { d: 0.08, amp: 0.5, f: [['bandpass', 3500, 1]], dest: g });
  K.thump(t, { f0: 300, f1: 150, d: 0.05, amp: 0.3, dest: g });
  // shards: many short high pings with random onsets
  const n = K.ri(22, 34);
  for (let i = 0; i < n; i++) {
    const tt = t + Math.pow(K.rng(), 1.8) * len;
    const f = K.r(2500, 9000);
    const a = K.r(0.05, 0.25) * (1 - (tt - t) / (len * 1.3));
    K.modal(tt, [[f, K.r(0.02, 0.08), a], [f * K.r(1.3, 1.8), K.r(0.015, 0.05), a * 0.6]], g);
  }
  K.crackle(t, len, [[0, 800], [len, 20]], { len: [0.1, 0.6], dest: K.hp(3500, 0.7, g), amp: 0.5 });
}
