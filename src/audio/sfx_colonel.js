// The Colonel (wet breath, drag, medals, "hm?", lunge, grab, sink), Kevin the Safety Patrol
// (pea whistle, breath, sole squeak), Miss Adair (glass harmonica, finger on fogged glass) and
// the husks (dry rustle, cicada click). The Colonel's palette is low, wet and close; nothing
// supernatural is "spooky-synth" — it is all bodies, cloth, brass and glass.
import { ring, burst, grains, tone, stickSlip, voiced, envPts, envHump, xlerp, smooth, BQ, Reson, OnePole, filt, mixInto, saturate, TAU } from './dsp.js';
import { RATIOS, thump, knock, clink, creak, scrape, whoosh, drop, grit, breath } from './synth.js';

/** Tiny wet sounds (saliva, mucus): a damp click + a small bubble. */
function wetClick(o, sr, t, R, amp = 0.25) {
  burst(o, sr, t, { dur: 0.005, t60: 0.004, gain: amp, R, filters: [['bp', R.range(1600, 2600), 3]] });
  drop(o, sr, t + 0.002, { f: R.range(900, 1600), amp: amp * 0.35, rise: 1.4, len: 0.025, R });
}

/** One huge, wet breath cycle. Returns the end time. intensity 0..1 → rattle & rate. */
function breathCycle(o, sr, t, R, { inD, pause, exD, intensity = 0.5, sub = 1 }) {
  // inhale: air dragged through a vast throat, formants rising
  breath(o, sr, t, { dur: inD, R, color: 'pink', lp: 3200,
    amp: (u) => Math.pow(envHump(0.78, 1)(u), 1.15) * (0.75 + 0.15 * intensity),
    formants: (u) => [[xlerp(420, 760, u), 3.5, 1], [xlerp(1150, 1650, u), 5, 0.5], [2600, 6, 0.12]] });
  wetClick(o, sr, t + inD + pause * 0.4, R, 0.22);
  // exhale: lower and longer, a mucus rattle growing toward the end
  const ex = new Float32Array(Math.ceil((exD + 0.05) * sr));
  breath(ex, sr, 0, { dur: exD, R, color: 'pink', lp: 2600,
    amp: envPts([[0, 0], [0.1, 1], [0.5, 0.8], [1, 0]]),
    formants: (u) => [[xlerp(640, 380, u), 3, 1], [xlerp(1400, 950, u), 4, 0.55], [2300, 5, 0.1]] });
  let ph = 0;
  const jit = new OnePole(sr, 8);
  for (let i = 0; i < ex.length; i++) {
    const u = i / ex.length;
    ph += (26 + 10 * intensity) * (1 + jit.run(R.bi() * 1.5)) / sr;
    const depth = (0.35 + 0.4 * intensity) * smooth((u - 0.25) / 0.6);
    ex[i] *= 1 - depth * (0.5 + 0.5 * Math.sin(TAU * ph));
  }
  const exT = t + inD + pause;
  mixInto(o, ex, sr, exT, 1);
  for (let k = 0; k < R.int(2, 4) + Math.round(intensity * 2); k++) wetClick(o, sr, exT + R.range(0.2, exD * 0.9), R, R.range(0.06, 0.16));
  // the chest: a sub-bass swell under the whole cycle (felt more than heard)
  const total = inD + pause + exD;
  const chest = (tt) => (tt < inD ? smooth(tt / inD) : tt < inD + pause ? 1 : 1 - smooth((tt - inD - pause) / exD));
  tone(o, sr, t, total, { f: (tt) => 38 + 3 * Math.sin(TAU * 0.4 * tt), a: (tt) => 0.16 * sub * chest(tt) * Math.min(1, tt / 0.3) });
  tone(o, sr, t, total, { f: 76, a: (tt) => 0.07 * sub * chest(tt) * Math.min(1, tt / 0.3) });
  return exT + exD;
}

export const COLONEL_SFX = {
  colonel_breath: { peak: -8, var: 3, max: 2, jit: 0.03, gen(S) {
    const { sr, R } = S, o = S.alloc(4.9);
    breathCycle(o, sr, 0.05, R, { inD: R.range(1.4, 1.7), pause: R.range(0.2, 0.35), exD: R.range(2.0, 2.4), intensity: R.range(0.3, 0.55) });
    return o;
  } },
  colonel_breath_fast: { peak: -7, var: 3, max: 2, jit: 0.03, gen(S) {
    const { sr, R } = S, o = S.alloc(3.6);
    let t = 0.03;
    for (let k = 0; k < 3; k++) {
      t = breathCycle(o, sr, t, R, { inD: R.range(0.38, 0.5), pause: R.range(0.04, 0.09), exD: R.range(0.5, 0.65), intensity: 0.8 + 0.2 * R.r(), sub: 1.2 }) + R.range(0.04, 0.12);
    }
    return o;
  } },
  colonel_drag: { peak: -9, var: 3, max: 2, gen(S) {
    // the weight shifts (low thud), then the long drag of wet wool and flesh over floorboards
    const { sr, R } = S, o = S.alloc(2.7);
    thump(o, sr, 0, { f: 48, to: 34, t60: 0.5, amp: 0.45, noise: 0.8, lp: 500, R });
    knock(o, sr, 0.01, { f: 110, amp: 0.3, t60: 0.15, click: 0.05, R });
    scrape(o, sr, 0.08, { dur: 2.1, f: 420, f1: 300, q: 0.9, grain: 14, depth: 0.75, color: 'pink', gain: 1.6, R,
      amp: envPts([[0, 0], [0.08, 1], [0.6, 0.8], [1, 0]]) });
    scrape(o, sr, 0.1, { dur: 1.9, f: 1400, q: 1.2, grain: 40, depth: 0.6, gain: 0.25, R, amp: envPts([[0, 0], [0.1, 1], [0.7, 0.6], [1, 0]]) });
    creak(o, sr, R.range(0.5, 1.0), { dur: 0.8, body: 'floor', R, gain: 0.6, rate: (u) => 18 + 20 * Math.sin(Math.PI * u), amp: envHump(0.4, 1) });
    burst(o, sr, R.range(0.6, 1.4), { dur: 0.06, attack: 0.004, t60: 0.05, gain: 0.35, R, color: 'pink', filters: [['lp', 700, 0.8]] });
    thump(o, sr, 2.25, { f: 55, to: 42, t60: 0.3, amp: 0.45, noise: 0.5, lp: 400, R });
    return o;
  } },
  colonel_hm: { peak: -10, var: 3, max: 1, jit: 0.02, gen(S) {
    // closed-mouth "hm?" — a low nasal hum with a questioning rise; sub-harmonic underneath
    const { sr, R } = S, o = S.alloc(1.05), top = R.range(112, 126), turn = R.range(0.34, 0.42);
    voiced(o, sr, 0.02, { dur: 0.9, R, breath: 0.06, jitter: 0.02, sub: 0.5, lp: 1500,
      f0: (t) => (t < turn ? 84 : 84 + (top - 84) * smooth((t - turn) / 0.42)) * (1 + 0.012 * Math.sin(TAU * 5 * t)),
      amp: envPts([[0, 0], [0.07, 1], [0.7, 0.9], [0.9, 0]]),
      formants: () => [[250, 4, 1], [1050, 6, 0.25], [2300, 8, 0.08]] });
    tone(o, sr, 0.02, 0.8, { f: 42, a: (t) => 0.04 * envHump(0.3, 0.8)(t) });
    wetClick(o, sr, 0.015, R, 0.05);
    return o;
  } },
  colonel_jingle: { peak: -15, var: 4, max: 2, gen(S) {
    // medals pinned into skin, knocking together as he moves
    const { sr, R } = S, o = S.alloc(1.0);
    const clusters = R.int(2, 3);
    for (let c = 0; c < clusters; c++) {
      const t0 = R.range(0, 0.4);
      for (let k = 0; k < R.int(2, 4); k++) clink(o, sr, t0 + R.range(0, 0.06), { f: R.range(2600, 5200), amp: R.range(0.3, 1), t60: R.range(0.15, 0.4), R, ratios: RATIOS.medal });
    }
    return o;
  } },
  colonel_lunge: { peak: -3, var: 3, max: 2, gen(S) {
    const { sr, R } = S, o = S.alloc(1.7);
    whoosh(o, sr, 0, { dur: 0.45, f0: 300, fm: 1600, f1: 250, peak: 0.35, amp: 1, q: 1, R });
    // the coat flapping
    const flap = new Float32Array(Math.ceil(0.5 * sr));
    burst(flap, sr, 0, { dur: 0.45, R, gain: 0.6, env: envHump(0.15, 0.45), filters: [['bp', 700, 1]] });
    for (let i = 0; i < flap.length; i++) flap[i] *= 0.5 + 0.5 * Math.sin(TAU * 17 * i / sr);
    mixInto(o, flap, sr, 0.02, 1);
    const i1 = R.range(0.2, 0.25), i2 = i1 + R.range(0.17, 0.23);
    thump(o, sr, i1, { f: 52, to: 34, t60: 0.6, amp: 1.4, noise: 1, lp: 700, R });
    knock(o, sr, i1, { f: 120, amp: 0.8, t60: 0.2, R });
    creak(o, sr, i1 + 0.02, { dur: 0.3, body: 'floor', R, gain: 0.5, rate: (u) => 40 + 50 * u, amp: envHump(0.3, 1) });
    thump(o, sr, i2, { f: 46, to: 32, t60: 0.7, amp: 1.2, noise: 0.9, lp: 600, R });
    knock(o, sr, i2, { f: 105, amp: 0.6, t60: 0.2, R });
    ring(o, sr, i1, 38, 0.6, 0.8);
    for (let k = 0; k < 4; k++) clink(o, sr, i1 + R.range(0, 0.1), { f: R.range(2800, 5000), amp: R.range(0.15, 0.35), t60: 0.25, R, ratios: RATIOS.medal });
    return saturate(o, 1.3);
  } },
  colonel_grab: { peak: -3, var: 2, max: 1, gen(S) {
    const { sr, R } = S, o = S.alloc(1.7);
    whoosh(o, sr, 0, { dur: 0.25, f0: 500, fm: 2000, f1: 400, peak: 0.7, amp: 0.7, R });
    burst(o, sr, 0.2, { dur: 0.2, attack: 0.005, t60: 0.14, gain: 1.2, R, color: 'pink', filters: [['bp', (u) => xlerp(1400, 280, u), 2]] });
    thump(o, sr, 0.2, { f: 60, to: 40, t60: 0.4, amp: 1.1, noise: 0.8, R });
    scrape(o, sr, 0.2, { dur: 0.5, f: 900, q: 1, grain: 30, amp: (u) => Math.exp(-u * 3), gain: 0.5, R });
    creak(o, sr, 0.3, { dur: 0.6, R, gain: 0.4, res: [[400, 4, 1], [1100, 6, 0.5]], rate: (u) => 20 + 15 * u, amp: envHump(0.3, 1) });
    for (let k = 0; k < 3; k++) wetClick(o, sr, R.range(0.35, 0.8), R, 0.15);
    breath(o, sr, 0.55, { dur: 0.9, R, color: 'pink', lp: 2200, amp: envHump(0.2, 1), formants: (u) => [[xlerp(600, 380, u), 3, 1], [1200, 4, 0.5]] });
    ring(o, sr, 0.2, 36, 0.5, 0.7);
    return o;
  } },
  colonel_sink: { peak: -8, var: 2, max: 1, gen(S) {
    // pouring back into the wall seam: wet slide, a sinking groan, plaster grit
    const { sr, R } = S, o = S.alloc(3.9), g = new Float32Array(Math.ceil(3.3 * sr));
    scrape(o, sr, 0, { dur: 3.2, f: 500, f1: 180, q: 1.1, grain: 9, depth: 0.7, color: 'pink', gain: 1, R, amp: envPts([[0, 0], [0.1, 1], [0.7, 0.7], [1, 0]]) });
    tone(g, sr, 0.2, 3.0, { f: (t) => 44 - 4 * t + 1.5 * Math.sin(TAU * 0.7 * t), a: envHump(1.0, 3.0), wave: 'saw', harm: 6 });
    filt(g, new BQ(sr, 'lp', 220, 0.8));
    mixInto(o, g, sr, 0, 0.5);
    grit(o, sr, 0.3, { dur: 2.5, rate: 120, amp: 0.3, R, env: (u) => Math.exp(-u * 1.5) });
    for (let k = 0; k < 6; k++) knock(o, sr, R.range(0.3, 2.4), { f: R.range(1200, 2500), amp: 0.15, t60: 0.02, R });
    for (let k = 0; k < 4; k++) wetClick(o, sr, R.range(0.2, 2.8), R, 0.15);
    thump(o, sr, 3.4, { f: 50, to: 40, t60: 0.3, amp: 0.5, noise: 0.5, R });
    return o;
  } },

  // ------------------------------------------------------------------ the Safety Patrol
  whistle: { peak: -6, var: 3, max: 1, jit: 0.01, wet: 1.2, gen(S) {
    // pea whistle: ~2.8 kHz tone, the pea's spin chops it into a fast trill; breath around it
    const { sr, R } = S, d = R.range(0.8, 1.0), o = S.alloc(d + 0.15), f = R.range(2700, 2950);
    const env = envPts([[0, 0], [0.02, 1.15], [0.06, 1], [d - 0.06, 0.95], [d, 0]]);
    const trill = R.range(26, 34), drift = new OnePole(sr, 3);
    let ph = 0, tp = 0;
    for (let i = 0; i < o.length; i++) {
      const t = i / sr, e = env(t);
      if (e <= 0) continue;
      tp += trill * (1 + drift.run(R.bi() * 4) * 0.2) / sr;
      const tr = Math.sin(TAU * tp);
      ph += f * (1 + 0.022 * tr) / sr;
      const am = 1 - 0.5 * (0.5 + 0.5 * Math.sin(TAU * tp + 0.6));
      o[i] += (Math.sin(TAU * ph) + 0.12 * Math.sin(2 * TAU * ph) + 0.04 * Math.sin(3 * TAU * ph)) * e * am;
    }
    burst(o, sr, 0, { dur: d, R, gain: 0.3, env, filters: [['bp', f, 2.5]] });
    burst(o, sr, 0, { dur: d, R, gain: 0.08, env, filters: [['hp', 1500]] });
    burst(o, sr, 0, { dur: 0.04, t60: 0.03, gain: 0.6, R, filters: [['bp', f, 1]] });
    return o;
  } },
  whistle_breath: { peak: -16, var: 3, max: 1, gen(S) {
    // the breathy pre-whistle: air through the whistle before the pea engages
    const { sr, R } = S, o = S.alloc(0.75), f = R.range(2700, 2950);
    burst(o, sr, 0, { dur: 0.6, R, gain: 1, env: envHump(0.42, 0.6), filters: [['bp', f, 3]] });
    burst(o, sr, 0, { dur: 0.6, R, gain: 0.35, env: envHump(0.3, 0.6), color: 'pink', filters: [['lp', 1500, 0.7]] });
    for (let k = 0; k < R.int(2, 3); k++) tone(o, sr, R.range(0.3, 0.55), R.range(0.02, 0.05), { f, a: 0.15 });
    return o;
  } },
  squeak: { peak: -14, var: 5, gen(S) {
    // rubber sole on polished floor
    const { sr, R } = S, d = R.range(0.1, 0.2), o = S.alloc(d + 0.05);
    const a = R.range(800, 1000), b = R.range(1200, 1500), up = R.chance(0.5);
    stickSlip(o, sr, 0, { dur: d, R, rate: (u) => (up ? xlerp(a, b, u) : xlerp(b, a, u)), jitter: 0.06, tone: 0.6, amp: envHump(0.3, 1),
      res: [[1200, 6, 1], [2500, 8, 0.5], [3800, 10, 0.3]] });
    return o;
  } },

  // ------------------------------------------------------------------ Adair & the husks
  glass_tone: { peak: -10, var: 3, max: 2, jit: 0.005, wet: 1.4, gen(S) {
    // glass harmonica: near-pure tones, two glasses a fifth apart, slow beating
    const { sr, R } = S, d = 3.8, o = S.stereo(d);
    const pair = R.pick([[659.26, 987.77], [587.33, 880], [739.99, 1108.73]]);
    const env = envPts([[0, 0], [0.35, 0.85], [0.6, 1], [2.0, 0.9], [d, 0]]);
    pair.forEach((f, k) => {
      const wL = k ? 0.55 : 1, wR = k ? 1 : 0.55, beat = R.range(0.0004, 0.0008), trem = R.range(4.2, 5.2);
      const a = (t) => env(t) * (1 + 0.06 * Math.sin(TAU * trem * t)) * (k ? 0.8 : 1);
      for (const [c, w] of [[o[0], wL], [o[1], wR]]) {
        tone(c, sr, 0, d, { f: f * (1 + beat), a: (t) => a(t) * w * 0.5 });
        tone(c, sr, 0, d, { f: f * (1 - beat), a: (t) => a(t) * w * 0.5 });
        tone(c, sr, 0, d, { f: f * 2, a: (t) => a(t) * w * 0.06 });
        tone(c, sr, 0, d, { f: f * 3, a: (t) => a(t) * w * 0.025 });
        burst(c, sr, 0, { dur: d, R, gain: 0.02 * w, env, filters: [['bp', f, 40]] });
      }
    });
    return o;
  } },
  glass_write: { peak: -13, var: 3, max: 1, gen(S) {
    // a fingertip writing in condensation: squeaky strokes + a damp smear
    const { sr, R } = S, o = S.alloc(2.2);
    let t = 0.02;
    for (let k = 0; k < R.int(4, 5); k++) {
      const d = R.range(0.18, 0.45), base = R.range(420, 650), wob = R.range(5, 9);
      stickSlip(o, sr, t, { dur: d, R, rate: (u) => base + 220 * Math.sin(Math.PI * u) + 60 * Math.sin(TAU * wob * u), jitter: 0.12, tone: 0.35, amp: envHump(0.3, 1),
        res: [[1300, 14, 0.8], [2600, 18, 0.6], [4100, 22, 0.3]] });
      scrape(o, sr, t, { dur: d, f: 2400, q: 0.8, grain: 50, amp: envHump(0.4, 1), gain: 0.12, R });
      t += d + R.range(0.05, 0.16);
      if (t > 1.9) break;
    }
    return o;
  } },
  husk_rustle: { peak: -16, var: 4, gen(S) {
    // amber shells: brittle, papery, dry
    const { sr, R } = S, d = R.range(0.6, 1.0), o = S.alloc(d + 0.1);
    grains(o, sr, 0, { dur: d, R, rate: (u) => 30 + 600 * envHump(0.35, 1)(u), amp: envHump(0.35, 1), f: [2500, 9000], t60: [0.001, 0.005], click: 0.8 });
    burst(o, sr, 0, { dur: d, R, gain: 0.15, env: envHump(d * 0.35, d), filters: [['bp', 5000, 0.7]] });
    return o;
  } },
  cicada_click: { peak: -16, var: 5, gen(S) {
    // a lone tymbal buckle-train: a few rapid clicks ringing a 5 kHz body
    const { sr, R } = S, o = S.alloc(0.4), x = new Float32Array(o.length);
    let t = 0.01;
    for (let b = 0; b < R.int(1, 2); b++) {
      const n = R.int(8, 14), gap = R.range(0.0025, 0.004);
      for (let k = 0; k < n; k++) { const i = Math.round((t + k * gap) * sr); if (i < x.length) x[i] += (0.4 + 0.6 * k / n) * (k % 2 ? -1 : 1); }
      t += n * gap + R.range(0.06, 0.14);
    }
    const r1 = new Reson(sr, R.range(4600, 5400), 0.02), r2 = new Reson(sr, 9500, 0.01);
    for (let i = 0; i < o.length; i++) o[i] = r1.run(x[i]) + 0.3 * r2.run(x[i]) + x[i] * 0.05;
    return o;
  } },
};
