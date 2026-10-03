import { RECIPES } from '../../audio/Sounds';
import { SR, ad, biquad, brown, buf, drive, echo, env, fadeOut, mix, modal, normalize, osc, pink, rnd, rr, sweep, voice, white } from '../../audio/Synth';

type Recipe = { variants: number; fn: (v: number) => Float32Array };
const R: Record<string, Recipe> = {};
const reg = (name: string, variants: number, fn: (v: number) => Float32Array) => (R[name] = { variants, fn });

// sounds borrowed from Blood Road's Gojo and Sukuna modes
for (const n of [
  'infinityBlock',
  'dismantle',
  'slashFlesh',
  'cleave',
  'fugaDraw',
  'fugaFire',
  'fugaBlast',
  'redCharge',
  'redFire',
  'redBlast',
  'blueStart',
  'blueCollapse',
  'blueLoop',
  'purpleCharge',
  'purpleFire',
  'purpleLoop',
  'domainStart',
  'domainLoop',
  'domainEnd',
  'shrineStart',
  'shrineLoop',
  'shrineEnd',
  'explosion',
  'thunder',
  'playerHurt',
  'playerDeath',
  'gojoTransform',
  'structBreak_concrete',
])
  if (RECIPES[n]) R[n] = RECIPES[n];

// ------------------------------------------------------------------ helpers
function whoosh(len: number, f0: number, f1: number, q = 1.2) {
  const n = pink(len);
  env(n, (t) => Math.sin(Math.min(1, t / len) * Math.PI) ** 1.5);
  return biquad(n, 'bp', sweep(f0, f1, len), q);
}
function thump(len: number, f0: number, f1: number, tau: number) {
  return env(osc(len, sweep(f0, f1, len * 0.5)), ad(0.002, tau));
}
function crack(len: number, f: number, tau: number) {
  return biquad(env(white(len), ad(0.0005, tau)), 'hp', f);
}
function rumble(len: number, lp: number, shape: (t: number) => number) {
  return env(biquad(brown(len), 'lp', lp), shape);
}

// ------------------------------------------------------------------ combat
reg('swing', 3, () => normalize(whoosh(0.2, rr(400, 600), rr(1600, 2400), 1.4), 0.6));
reg('swingHeavy', 2, () => {
  const o = buf(0.4);
  mix(o, whoosh(0.35, 250, 1500, 1.1), 1);
  mix(o, thump(0.3, 90, 50, 0.12), 0.3, 0.05);
  return normalize(o, 0.75);
});
reg('whiff', 2, () => normalize(whoosh(0.22, 700, 2600, 1.6), 0.4));
reg('whoosh', 2, () => normalize(whoosh(0.32, 300, 3000, 0.9), 0.65));
reg('hitPunch', 4, () => {
  const o = buf(0.5);
  mix(o, thump(0.35, rr(130, 160), 42, 0.09), 1.4);
  mix(o, crack(0.08, 1800, 0.012), 0.9);
  mix(o, biquad(env(white(0.15), ad(0.001, 0.03)), 'bp', rr(700, 1000), 1.3), 1.4);
  mix(o, biquad(env(white(0.3), ad(0.004, 0.08)), 'lp', 600), 0.6, 0.01);
  return normalize(drive(o, 2.4), 0.92);
});
reg('hitHeavy', 3, () => {
  const o = buf(1.2);
  mix(o, thump(0.8, rr(110, 130), 30, 0.22), 1.8);
  mix(o, crack(0.12, 1400, 0.02), 1.0);
  mix(o, biquad(env(white(0.4), ad(0.002, 0.09)), 'bp', 600, 1), 1.4);
  mix(o, rumble(1.1, 260, ad(0.01, 0.35)), 1.6);
  return normalize(drive(echo(o, 0.09, 0.3, 2000, 2), 2.8), 0.95);
});
reg('block', 2, () => {
  const o = buf(0.6);
  mix(o, modal(0.6, [[rr(1800, 2100), 0.6, 0.18], [rr(2900, 3300), 0.4, 0.12], [4700, 0.25, 0.08]]), 1);
  mix(o, whoosh(0.25, 2000, 600, 1.4), 0.8);
  mix(o, thump(0.2, 90, 60, 0.05), 0.4);
  return normalize(o, 0.6);
});
reg('blackFlash', 1, () => {
  const len = 2.6;
  const o = buf(len);
  // the crack of space, a deep blow, and black lightning crawling
  mix(o, crack(0.2, 2500, 0.03), 2.2);
  mix(o, thump(1.6, 150, 26, 0.5), 2.4);
  mix(o, rumble(2.4, 200, ad(0.02, 0.8)), 2.0);
  const z = buf(1.6);
  for (let i = 0; i < 70; i++) {
    const t = Math.pow(rr(0, 1), 1.6) * 1.4;
    const c = env(white(0.02), ad(0.0003, rr(0.002, 0.008)));
    mix(z, biquad(c, 'bp', rr(1500, 6000), 2), rr(0.4, 1.2) * (1 - t / 1.6), t);
  }
  const buzz = env(osc(1.2, (t) => 55 + Math.sin(t * 90) * 20 + rnd() * 30, 'square'), ad(0.005, 0.25));
  mix(o, biquad(buzz, 'bp', 900, 0.8), 0.35, 0.02);
  mix(o, z, 0.9, 0.01);
  return normalize(drive(echo(o, 0.12, 0.35, 1800, 3), 3.2), 0.98);
});
reg('bfCharge', 1, () => {
  const len = 0.9;
  const o = env(osc(len, sweep(80, 320, len), 'saw'), (t) => Math.min(1, t / 0.6));
  return normalize(biquad(o, 'lp', sweep(300, 2400, len), 2), 0.3);
});
reg('dash', 2, () => {
  const o = buf(0.5);
  mix(o, whoosh(0.4, 3000, 400, 1.0), 1);
  mix(o, thump(0.25, 140, 60, 0.06), 0.6);
  mix(o, biquad(env(white(0.1), ad(0.001, 0.02)), 'hp', 3000), 0.4);
  return normalize(o, 0.7);
});
reg('jump', 1, () => normalize(whoosh(0.25, 400, 1400, 1.2), 0.35));
reg('land', 2, () => {
  const o = buf(0.5);
  mix(o, thump(0.35, 100, 45, 0.1), 1);
  mix(o, biquad(env(white(0.3), ad(0.002, 0.06)), 'lp', 1400), 0.6);
  return normalize(o, 0.6);
});
reg('crash', 3, () => {
  const len = 2.2;
  const o = buf(len);
  mix(o, thump(1.2, 120, 28, 0.35), 2);
  mix(o, crack(0.2, 900, 0.04), 1.4);
  mix(o, rumble(len, 320, ad(0.01, 0.6)), 2.2);
  // debris rattling down
  for (let i = 0; i < 40; i++) {
    const t = rr(0.05, 1.6);
    mix(o, biquad(env(white(0.05), ad(0.0005, rr(0.005, 0.02))), 'bp', rr(800, 3500), 3), rr(0.1, 0.5) * (1 - t / 1.8), t);
  }
  return normalize(drive(o, 2), 0.95);
});
reg('slam', 2, () => {
  const o = buf(1.6);
  mix(o, thump(1.0, 90, 24, 0.4), 2.2);
  mix(o, crack(0.15, 700, 0.05), 1.2);
  mix(o, rumble(1.5, 240, ad(0.01, 0.5)), 2);
  return normalize(drive(o, 2.4), 0.95);
});
reg('slashStone', 3, () => {
  const o = buf(0.7);
  mix(o, crack(0.1, 3000, 0.02), 1);
  mix(o, modal(0.5, [[rr(2400, 3000), 0.4, 0.1], [rr(4200, 5200), 0.3, 0.06]]), 0.6);
  mix(o, biquad(env(white(0.6), ad(0.002, 0.15)), 'bp', 1200, 0.8), 0.8, 0.01);
  return normalize(o, 0.8);
});
reg('collapse', 2, () => {
  const len = 5;
  const o = buf(len);
  mix(o, rumble(len, 140, (t) => Math.min(1, t / 0.4) * Math.exp(-t / 2.4)), 3);
  mix(o, biquad(env(pink(len), (t) => Math.min(1, t / 0.6) * Math.exp(-t / 1.6)), 'bp', 900, 0.6), 1.2);
  for (let i = 0; i < 70; i++) {
    const t = rr(0.1, 3.8);
    mix(o, biquad(env(white(0.08), ad(0.001, rr(0.01, 0.05))), 'bp', rr(300, 2500), 2), rr(0.2, 0.7) * Math.exp(-t / 2.5), t);
  }
  for (let i = 0; i < 5; i++) mix(o, thump(0.8, rr(70, 100), 30, 0.3), 1.2, rr(0.2, 2.5));
  return normalize(drive(o, 1.6), 0.95);
});
reg('wheelTurn', 1, () => {
  const len = 2.4;
  const o = buf(len);
  // the Dharma wheel's heavy, ringing turn
  mix(o, modal(len, [[92, 1, 0.9], [138, 0.7, 0.8], [261, 0.5, 0.6], [523, 0.35, 0.5], [1047, 0.2, 0.3], [1567, 0.12, 0.25]]), 1);
  mix(o, thump(0.6, 70, 40, 0.15), 1.2);
  mix(o, crack(0.08, 1200, 0.02), 0.6);
  return normalize(echo(o, 0.16, 0.3, 2400, 3), 0.9);
});
reg('roar', 2, () => {
  const len = 2.4;
  const v = voice(len, (t) => 52 + Math.sin(t * 3) * 6 - t * 6, [
    [(t) => 380 + t * 40, 3, 1],
    [(t) => 900 - t * 80, 4, 0.7],
    [2400, 6, 0.3],
  ], 0.5, 0.06, 0.6);
  env(v, (t) => Math.min(1, t / 0.25) * Math.min(1, (len - t) / 0.6));
  const o = buf(len);
  mix(o, drive(v, 3), 1);
  mix(o, rumble(len, 160, (t) => Math.min(1, t / 0.3) * Math.min(1, (len - t) / 0.5)), 1.5);
  return normalize(o, 0.9);
});
reg('wcs', 1, () => {
  const len = 3.2;
  const o = buf(len);
  // a thin rising whine that splits the world, then the shear
  const whine = env(osc(len, sweep(2400, 9000, 0.9), 'sine'), (t) => (t < 0.9 ? (t / 0.9) ** 2 : Math.exp(-(t - 0.9) * 6)));
  mix(o, whine, 0.25);
  mix(o, crack(0.35, 1500, 0.08), 2.5, 0.9);
  mix(o, biquad(env(white(1.4), ad(0.002, 0.35)), 'bp', sweep(6000, 400, 1.2), 0.7), 2.2, 0.9);
  mix(o, thump(2.2, 70, 18, 0.9), 2.8, 0.9);
  mix(o, rumble(2.3, 180, ad(0.05, 0.9)), 2.2, 0.9);
  return normalize(drive(o, 2.2), 0.98);
});
reg('gong', 1, () => {
  const len = 5;
  const o = modal(len, [[58, 1, 3.5], [116, 0.6, 3], [152, 0.5, 2.6], [218, 0.4, 2.2], [311, 0.3, 1.6], [417, 0.2, 1.2], [587, 0.12, 0.9]]);
  mix(o, thump(0.4, 90, 50, 0.1), 0.5);
  env(o, (t) => 1 + 0.15 * Math.sin(t * 5));
  return normalize(o, 0.85);
});
reg('taiko', 3, () => normalize(taiko(1.4, rr(0.9, 1.1)), 0.95));
reg('vsSting', 1, () => {
  const len = 3.5;
  const o = buf(len);
  mix(o, taiko(1.6, 1), 1.4);
  mix(o, taiko(1.6, 0.8), 1.2, 0.18);
  // brassy stab: detuned saws on D and A
  for (const f of [73.4, 110, 146.8, 220, 293.7]) {
    const st = osc(len, f * rr(0.997, 1.003), 'saw');
    env(st, ad(0.01, 0.9));
    mix(o, biquad(st, 'lp', sweep(3200, 600, 1.2), 0.9), 0.22);
  }
  mix(o, biquad(env(white(len), ad(0.005, 1.1)), 'hp', 5000), 0.35);
  return normalize(echo(o, 0.2, 0.3, 1800, 3), 0.95);
});
reg('chant', 3, () => {
  const o = buf(1.6);
  mix(o, taiko(1.4, 1.05), 1);
  mix(o, modal(1.6, [[880, 0.3, 0.9], [1320, 0.2, 0.7], [2200, 0.1, 0.5]]), 0.5);
  return normalize(o, 0.8);
});
reg('uiMove', 1, () => normalize(env(osc(0.06, 1200, 'tri'), ad(0.001, 0.02)), 0.25));
reg('uiSelect', 1, () => {
  const o = buf(0.5);
  mix(o, taiko(0.5, 1.6), 0.6);
  mix(o, modal(0.5, [[1320, 0.4, 0.2], [1980, 0.3, 0.15]]), 0.5);
  return normalize(o, 0.6);
});
// a cold gust across the rooftops: the quiet before a cut
reg('wind', 1, () => {
  const len = 3.2;
  const o = biquad(env(pink(len), (t) => Math.min(1, t / 0.8) * Math.min(1, (len - t) / 1.4) * (0.7 + 0.3 * Math.sin(t * 2.3))), 'bp', sweep(380, 900, len), 0.5);
  mix(o, biquad(env(white(len), (t) => Math.min(1, t / 1.2) * Math.min(1, (len - t) / 1.2)), 'hp', 4200), 0.08);
  return normalize(o, 0.5);
});
reg('heartbeat', 1, () => {
  const o = buf(0.9);
  mix(o, thump(0.2, 60, 40, 0.06), 1);
  mix(o, thump(0.2, 55, 38, 0.06), 0.7, 0.28);
  return normalize(o, 0.6);
});
reg('laugh', 1, () => {
  // "kehi": two breathy, voiced chuckles
  const o = buf(0.9);
  for (const [t, f] of [
    [0, 150],
    [0.22, 135],
  ] as [number, number][]) {
    const v = voice(0.2, (tt) => f - tt * 120, [
      [700, 4, 1],
      [1800, 6, 0.5],
    ], 0.9, 0.05);
    env(v, ad(0.01, 0.06));
    mix(o, v, 1, t);
  }
  return normalize(biquad(o, 'hp', 300), 0.5);
});
reg('slashWorld', 2, () => {
  const o = buf(1.2);
  mix(o, crack(0.15, 2500, 0.05), 1.4);
  mix(o, biquad(env(white(1.0), ad(0.002, 0.25)), 'bp', sweep(5000, 800, 0.8), 0.9), 1.4);
  mix(o, thump(0.8, 90, 30, 0.25), 1);
  return normalize(o, 0.9);
});

function taiko(len: number, k: number) {
  const o = buf(len);
  mix(o, env(osc(len, sweep(170 * k, 52 * k, 0.12)), ad(0.002, 0.32)), 1.6);
  mix(o, biquad(env(white(0.06), ad(0.0005, 0.012)), 'bp', 1400 * k, 1.5), 0.6);
  mix(o, biquad(env(white(len), ad(0.002, 0.14)), 'bp', 210 * k, 1.2), 1.2);
  return o;
}

// ------------------------------------------------------------------ music
const BPM = 140;
const BEAT = 60 / BPM;
const STEP = BEAT / 4;
const BARS = 16;
const LOOP = BARS * 4 * BEAT;
// miyako-bushi on D: D Eb G A Bb
const N: Record<string, number> = {
  A1: 55,
  Bb1: 58.27,
  D2: 73.42,
  Eb2: 77.78,
  G2: 98,
  A2: 110,
  Bb2: 116.54,
  D3: 146.83,
  Eb3: 155.56,
  G3: 196,
  A3: 220,
  Bb3: 233.08,
  D4: 293.66,
  Eb4: 311.13,
  G4: 392,
  A4: 440,
  Bb4: 466.16,
  D5: 587.33,
};

/** Karplus-Strong pluck with a little buzz: shamisen / koto. */
function pluck(f: number, len: number, bright = 0.6, buzz = 0.25) {
  const o = buf(len);
  const P = Math.max(2, Math.round(SR / f));
  const line = new Float32Array(P);
  for (let i = 0; i < P; i++) line[i] = rnd() * (i < P * bright ? 1 : 0.3);
  let idx = 0;
  let last = 0;
  for (let i = 0; i < o.length; i++) {
    const a = line[idx];
    const b = line[(idx + 1) % P];
    let v = (a + b) * 0.5 * 0.996;
    // sawari: the bridge rattle that gives the shamisen its edge
    if (buzz > 0 && Math.abs(v) > 0.3) v += Math.sign(v) * buzz * (Math.abs(v) - 0.3) * 0.3;
    v = Math.max(-1, Math.min(1, v * 0.999));
    line[idx] = v;
    idx = (idx + 1) % P;
    o[i] = v * 0.7 + last * 0.3;
    last = v;
  }
  // a bachi strike on the skin
  mix(o, biquad(env(white(0.03), ad(0.0005, 0.006)), 'bp', 2800, 1.4), 0.5);
  return env(o, ad(0.001, len * 0.4));
}

function strings(f: number, len: number, att = 0.01, rel = 0.12) {
  const o = buf(len + rel);
  for (const d of [0.996, 1, 1.004]) mix(o, osc(len + rel, f * d, 'saw'), 0.33);
  env(o, (t) => Math.min(1, t / att) * (t > len ? Math.exp(-(t - len) / (rel * 0.4)) : 1));
  return biquad(o, 'lp', Math.min(5000, f * 7), 0.8);
}

function choirChord(fs: number[], len: number) {
  const o = buf(len);
  for (const f of fs) {
    for (const d of [0.995, 1.005]) {
      const v = voice(len, (t) => f * d * (1 + 0.006 * Math.sin(t * 5.5 + f)), [
        [730, 6, 1],
        [1090, 7, 0.55],
        [2440, 9, 0.25],
      ], 0.12, 0.01);
      mix(o, v, 0.5 / fs.length);
    }
  }
  env(o, (t) => Math.min(1, t / 0.6) * Math.min(1, (len - t) / 0.8));
  return o;
}

function at(bar: number, step: number) {
  return (bar * 16 + step) * STEP;
}

function musicDrive() {
  const o = buf(LOOP + 1);
  const roots = ['D2', 'D2', 'Eb2', 'D2', 'D2', 'D2', 'Bb1', 'A1', 'D2', 'D2', 'Eb2', 'D2', 'G2', 'Eb2', 'D2', 'A1'];
  for (let bar = 0; bar < BARS; bar++) {
    // taiko groove: don . . don . . don . do . . don . . don
    const big = [0, 3, 6, 8, 11, 14];
    for (const s of big) mix(o, taiko(0.9, bar % 4 === 3 && s > 8 ? 1.15 : 1), s === 0 ? 1 : 0.7, at(bar, s));
    for (const s of [2, 4, 10, 12, 15]) mix(o, taiko(0.25, 2.6), 0.28, at(bar, s));
    if (bar % 4 === 3) for (let s = 12; s < 16; s++) mix(o, taiko(0.4, 1.3 + s * 0.05), 0.55, at(bar, s));
    // bass ostinato in eighths
    const r = N[roots[bar]];
    const pat = [1, 1, 2, 1, 1.06, 1, 1, 1.5];
    pat.forEach((m, i) => {
      const f = r * m;
      const n = osc(STEP * 1.8, f, 'saw');
      mix(n, osc(STEP * 1.8, f * 0.5, 'sine'), 0.8);
      env(n, ad(0.004, STEP * 0.9));
      mix(o, biquad(n, 'lp', 520, 1.1), 0.5, at(bar, i * 2));
    });
  }
  return finishLoop(o);
}

function musicEpic() {
  const o = buf(LOOP + 1);
  // shamisen motif and answer
  const motifA: [number, string, number][] = [
    [0, 'D4', 2],
    [2, 'Eb4', 1],
    [3, 'D4', 1],
    [4, 'A3', 2],
    [6, 'Bb3', 2],
    [8, 'A3', 2],
    [10, 'G3', 2],
    [12, 'A3', 4],
  ];
  const motifB: [number, string, number][] = [
    [0, 'Bb3', 2],
    [2, 'A3', 2],
    [4, 'G3', 1],
    [5, 'A3', 1],
    [6, 'Bb3', 2],
    [8, 'D4', 2],
    [10, 'Eb4', 2],
    [12, 'D4', 4],
  ];
  for (let bar = 0; bar < BARS; bar++) {
    const m = bar % 2 === 0 ? motifA : motifB;
    const up = bar >= 8 ? 2 : 1;
    for (const [s, n, l] of m) mix(o, pluck(N[n] * up, STEP * l * 2.5), 0.55, at(bar, s));
    // string ostinato: sixteenths on the root and fifth
    const root = bar % 4 === 2 ? N.Eb3 : bar % 8 === 7 ? N.A2 : N.D3;
    for (let s = 0; s < 16; s++) {
      const f = s % 4 === 2 ? root * 1.5 : s % 2 ? root * 2 : root;
      mix(o, strings(f * 2, STEP * 0.55, 0.005, 0.05), s % 4 === 0 ? 0.16 : 0.1, at(bar, s));
    }
  }
  // choir pads every two bars
  const chords = [
    ['D3', 'A3', 'D4'],
    ['Eb3', 'Bb3', 'Eb4'],
    ['D3', 'A3', 'D4'],
    ['Bb2', 'D3', 'A3'],
    ['D3', 'A3', 'D4'],
    ['Eb3', 'G3', 'Bb3'],
    ['G2', 'D3', 'Bb3'],
    ['A2', 'Eb3', 'A3'],
  ];
  chords.forEach((c, i) => mix(o, choirChord(c.map((n) => N[n]), BEAT * 8), 0.5, at(i * 2, 0)));
  return finishLoop(o);
}

function musicDomain() {
  // the void / the shrine: a low cluster that breathes, and a bell every two bars
  const len = BEAT * 32;
  const o = buf(len + 1);
  for (const f of [36.7, 38.9, 55, 73.4]) {
    const d = osc(len, (t) => f * (1 + 0.003 * Math.sin(t * 0.7 + f)), 'saw');
    mix(o, biquad(d, 'lp', 300, 0.7), 0.25);
  }
  env(o, (t) => 0.6 + 0.4 * Math.sin((t / len) * Math.PI * 4) ** 2);
  for (let b = 0; b < 8; b++) mix(o, modal(BEAT * 6, [[N.D4, 0.4, 2.5], [N.D4 * 2.76, 0.25, 1.6], [N.D4 * 5.4, 0.12, 1.0]]), 0.5, b * BEAT * 4);
  const out = new Float32Array(Math.round(len * SR));
  out.set(o.subarray(0, out.length));
  for (let i = 0; i < Math.round(0.5 * SR); i++) out[out.length - 1 - i] *= i / (0.5 * SR);
  return normalize(out, 0.7);
}

/** Folds the tail past the loop point back over the head so it loops cleanly. */
function finishLoop(o: Float32Array) {
  const n = Math.round(LOOP * SR);
  const out = new Float32Array(n);
  out.set(o.subarray(0, n));
  for (let i = n; i < o.length; i++) out[i - n] += o[i];
  return normalize(out, 0.85);
}

reg('music_drive', 1, () => musicDrive());
reg('music_epic', 1, () => musicEpic());
reg('music_domain', 1, () => musicDomain());

export const SD_RECIPES = R;
export const MUSIC_LOOP = LOOP;
void fadeOut;
