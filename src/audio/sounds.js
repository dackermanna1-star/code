// Procedural sound bank: every footstep, one-shot, loop, ambience bed and UI blip is
// synthesised here from noise, oscillators and modal resonators, mostly at 22050 Hz (some at
// 11025) and passed through a PS-ADPCM round trip for PlayStation-style grit.
// Pure data generation – safe to import in Node; the engine turns the arrays into AudioBuffers.
// Every job has a generator form (makeG) that yields between heavy steps, so the bank can also be
// built in small slices on the main thread when no worker is available; make() runs it to the end.
import {
  SR, SR_LO, TAU, makeRng, hashStr, ns, alloc, clamp, smoothstep, cyc, white, filter, svf, filterG, svfG, drain,
  burst, tone, modesBuf, crackle, bubble, squeak, stickSlip, wavetable, oscAdd, envelope, loopLfo,
  mixInto, mixWrap, mulInto, scale, peakOf, normPeak, normRms, mixRms, fadeEdges, softClip, wowLoop, adpcmG, rmsOf,
} from './dsp.js';
import { EXTRA } from './registry.js';
import './levels/index.js';

// ----------------------------------------------------------------------------- canvas
// A small drawing context: adds layers at times (seconds). In loop mode layers that run past
// the end wrap around to the start, and filters run circularly, so the loop is seamless.
function canvas(sec, sr, seed, loop = false) {
  const r = makeRng(hashStr(seed));
  const out = alloc(sec, sr);
  const put = loop ? mixWrap : mixInto;
  const at = (t) => Math.round(t * sr);
  const S = {
    out, r, sr, loop,
    add(b, t = 0, g = 1) { put(out, b, at(t), g); return S; },
    noise(t, g, att, dec, f = [], dur) { return S.add(burst(r, { att, dec, f, dur, sr }), t, g); },
    noiseH(t, g, att, hold, dec, f = []) { return S.add(burst(r, { att, hold, dec, f, sr }), t, g); },
    tone(t, g, o) { return S.add(tone({ sr, ...o }), t, g); },
    thump(t, g, f0, f1, dec) { return S.add(tone({ f0, f1, glide: dec * 0.7, att: 0.0015, dec, sr }), t, g); },
    ring(t, list, g = 1) { return S.add(modesBuf(list, sr, loop ? 5 : Math.max(0.01, sec - t)), t, g); },
    grit(t, g, dur, rate, dec, f = []) { return S.add(crackle(r, { dur, rate, dec, f, sr }), t, g); },
    bubble(t, g, f0, dec, rise = 0.3) { return S.add(bubble(f0, dec, rise, sr), t, g); },
    click(t, g, hp = 2000, dec = 0.0025) { return S.add(burst(r, { att: 0.0002, dec, f: [['hp', hp]], sr }), t, g); },
    filter(specs) { filter(out, specs, sr, loop); return S; },
    filterG(specs) { return filterG(out, specs, sr, loop); },   // yield* S.filterG(specs)
  };
  return S;
}

function* finishShotG(a, sr, peak = 0.9) {
  yield* filterG(a, [['hp', 24, 0.7]], sr);  // DC / subsonic
  fadeEdges(a, 0.0004, 0.04, sr);
  normPeak(a, peak);
  return yield* adpcmG(a);
}

function* finishLoopG(a, sr, norm) {
  yield* filterG(a, [['hp', 20, 0.7]], sr, true);
  if (norm[0] === 'rms') normRms(a, norm[1], 0.95); else normPeak(a, norm[1]);
  yield;
  return yield* adpcmG(a, true);
}

// gen(S, arg) is either a plain function or a generator that yields between heavy steps
function* runGen(d, S, arg) {
  const it = d.gen(S, arg);
  if (it && typeof it.next === 'function') yield* it;
}

// Fluorescent ballast: mains harmonics (120 Hz dominant), clipped magnetostriction buzz and arc
// sizzle gated at twice the mains frequency. Loops seamlessly when fund*L is whole and no bend.
let HUM_TABLE = null;
function humTable() {
  return HUM_TABLE || (HUM_TABLE = wavetable([[1, 0.06], [2, 1], [3, 0.12, 1], [4, 0.42, 2], [5, 0.05, 0.3], [6, 0.22, 1.1],
    [8, 0.12, 2.4], [10, 0.07, 0.7], [12, 0.045, 1.9], [14, 0.03, 0.2], [16, 0.02, 2.8], [18, 0.014, 1.4], [20, 0.01, 0.4]], 4096));
}
function ballast(n, sr, r, { hum = 1, buzz = 0.25, sizzle = 0.06, fund = 60, bend = null, circ = false } = {}) {
  const T = humTable(), size = T.length - 1;
  const out = new Float32Array(n), bz = new Float32Array(n), sz = white(n, r);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const x = ph * size, j = x | 0;
    out[i] = (T[j] + (T[j + 1] - T[j]) * (x - j)) * hum;
    const s1 = Math.sin(TAU * ph), s2 = 2 * s1 * Math.cos(TAU * ph);
    const c = s2 * 2.4 + 0.35;
    bz[i] = c > 1 ? 1 : c < -0.7 ? -0.7 : c;
    const g = s1 * s1;
    sz[i] *= g * g * g * g;
    ph += (bend ? fund * bend(i / sr) : fund) / sr;
    if (ph >= 1) ph -= 1;
  }
  filter(bz, [['hp', 700], ['lp', 4800]], sr, circ);
  filter(sz, [['hp', 2800], ['lp', 8500]], sr, circ);
  const ref = 0.55 * hum + 0.2;
  if (buzz) mixRms(out, bz, buzz * ref);
  if (sizzle) mixRms(out, sz, sizzle * ref);
  return out;
}

// ============================================================================ footsteps
export const FOOT_NAMES = ['carpet', 'concrete', 'tile', 'wood', 'metal', 'lino', 'water', 'gel', 'grass', 'drywall', 'plastic', 'wetcarpet', 'wet', 'asphalt'];
export const FOOT_VARIANTS = 6;
const FOOT_LEN = [0.3, 0.32, 0.3, 0.42, 0.8, 0.34, 0.62, 0.55, 0.4, 0.34, 0.32, 0.46, 0.42, 0.36];

function gelSweep(r, sr, att, dec, dur, q, from, to, time) {
  const b = burst(r, { att, dec, dur, sr });
  return svf(b, 'bpn', q, (t) => from + (to - from) * Math.min(1, t / time), sr);
}

export function footstep(surf, k) { return drain(footstepG(surf, k)); }
function* footstepG(surf, k) {
  const S = canvas(FOOT_LEN[surf] || 0.35, SR, `step${surf}:${k}`);
  const r = S.r, sr = SR;
  const h = 0.002 + r() * 0.004;                 // heel strike
  const toe = h + r.range(0.05, 0.09);           // roll onto the toe
  const hv = r.range(0.85, 1), tv = r.range(0.35, 0.55);
  switch (surf) {
    case 0: // carpet: soft muffled thud and a little fabric brush
      S.thump(h, 0.5 * hv, r.jit(85, 0.1), 52, 0.03)
        .noise(h, 0.9 * hv, 0.004, 0.03, [['lp', r.jit(520, 0.15)], ['lp', 900]])
        .noise(h + 0.003, 0.07 * hv, 0.012, 0.035, [['bp', r.jit(2300, 0.2), 0.9]])
        .noise(toe, 0.75 * tv, 0.006, 0.028, [['lp', r.jit(700, 0.15)]])
        .noise(toe + 0.012, 0.05, 0.02, 0.045, [['bp', r.jit(3000, 0.2), 1]]);
      filter(S.out, [['lp', 2400]], sr);
      break;
    case 1: // concrete: gritty tap + low thump, toe scrape
      S.click(h, 0.5 * hv, 1800, 0.004)
        .noise(h, 0.5 * hv, 0.0005, 0.009, [['bp', r.jit(2400, 0.15), 1.2]])
        .thump(h, 0.5 * hv, r.jit(95, 0.1), 58, 0.035)
        .noise(h, 0.45 * hv, 0.001, 0.018, [['lp', 320]])
        .grit(h, 0.3 * hv, 0.06, r.jit(900, 0.3), 0.02, [['hp', 2200]])
        .click(toe, 0.3 * tv, 2200, 0.003)
        .noise(toe, 0.25 * tv, 0.0005, 0.007, [['bp', r.jit(2800, 0.15), 1.2]])
        .grit(toe, 0.25 * tv, 0.07, r.jit(1100, 0.3), 0.025, [['hp', 2600]])
        .noise(toe + 0.01, 0.07, 0.012, 0.035, [['bp', r.jit(3600, 0.2), 0.8]]);
      break;
    case 2: // tile: bright click with a ceramic ring
      S.click(h, 0.8 * hv, 2600, 0.0025)
        .ring(h, [[r.jit(2900, 0.12), 0.022, 0.25], [r.jit(4300, 0.1), 0.016, 0.16], [r.jit(1750, 0.1), 0.028, 0.12]], hv)
        .thump(h, 0.35 * hv, r.jit(110, 0.1), 70, 0.025)
        .noise(h, 0.25 * hv, 0.0005, 0.012, [['lp', 500]])
        .click(toe, 0.5 * tv, 2800, 0.002)
        .ring(toe, [[r.jit(3100, 0.12), 0.018, 0.2], [r.jit(4700, 0.1), 0.012, 0.12]], tv);
      break;
    case 3: { // wood: hollow knock, occasionally a board creaks
      const f0 = r.jit(175, 0.15);
      S.noise(h, 0.4 * hv, 0.0005, 0.006, [['bp', r.jit(1300, 0.2), 1]])
        .ring(h, [[f0, 0.075, 0.6], [f0 * r.jit(2.35, 0.08), 0.05, 0.32], [f0 * r.jit(4.3, 0.08), 0.032, 0.18], [f0 * r.jit(7.4, 0.08), 0.02, 0.09]], hv)
        .thump(h, 0.35 * hv, 82, 55, 0.03)
        .noise(toe, 0.25 * tv, 0.0005, 0.005, [['bp', 1500, 1]])
        .ring(toe, [[f0 * 1.06, 0.05, 0.45], [f0 * 2.5, 0.035, 0.22], [f0 * 4.6, 0.02, 0.1]], tv);
      if (k === 2 || k === 5) {
        const base = r.range(110, 170);
        S.add(stickSlip(r, 0.12, () => base, (t) => Math.sin((Math.PI * t) / 0.12), [[r.jit(650, 0.1), 6, 1], [r.jit(1300, 0.1), 8, 0.5]], sr), toe + 0.02, 0.5);
      }
      break;
    }
    case 4: { // metal: clang with a ring, grating rattle on some variations
      const b = r.jit(360, 0.15);
      const ratios = [1, 2.32, 4.25, 6.63, 9.38], decs = [0.28, 0.2, 0.13, 0.09, 0.06], amps = [0.32, 0.3, 0.22, 0.15, 0.1];
      const modes = (s) => ratios.map((q, i) => [b * q * r.jit(1, 0.02), decs[i] * r.jit(1, 0.15), amps[i] * s * r.range(0.6, 1.2)]);
      S.click(h, 0.6 * hv, 1500, 0.003)
        .ring(h, modes(1), hv)
        .ring(h, [[r.jit(3100, 0.1), 0.35, 0.05], [r.jit(3550, 0.1), 0.3, 0.04]], hv)
        .thump(h, 0.4 * hv, 92, 60, 0.04)
        .click(toe, 0.4 * tv, 1800, 0.003)
        .ring(toe, modes(0.6), tv);
      if (k % 2 === 0) {
        for (let j = 0; j < 4; j++) {
          const t = h + 0.012 + j * r.range(0.01, 0.025);
          S.click(t, 0.12 * (1 - j / 4), 2500, 0.0015).ring(t, [[r.jit(1800, 0.2), 0.03, 0.06]]);
        }
      }
      break;
    }
    case 5: // lino: squeaky tap
      S.noise(h, 0.6 * hv, 0.0005, 0.007, [['bp', r.jit(1700, 0.15), 1]])
        .thump(h, 0.4 * hv, r.jit(100, 0.1), 65, 0.03)
        .noise(h, 0.3 * hv, 0.001, 0.014, [['lp', 450]])
        .ring(h, [[r.jit(1150, 0.1), 0.02, 0.1]], hv)
        .noise(toe, 0.35 * tv, 0.0005, 0.006, [['bp', r.jit(1900, 0.15), 1]]);
      if (k % 2 === 1 || k === 4) {
        const f0 = r.range(1300, 1800), up = r.chance(0.6);
        const sq = squeak(r, r.range(0.05, 0.09), f0, up ? f0 * r.range(1.2, 1.45) : f0 * r.range(0.7, 0.85), sr);
        filter(sq, [['bp', f0 * 1.2, 1.5]], sr);
        S.add(sq, toe + r.range(0, 0.02), 0.22);
      }
      break;
    case 6: { // water: splash, droplets, bubbles, slosh
      S.noise(h, 0.55 * hv, 0.003, 0.05, [['hp', 250], ['lp', r.jit(2200, 0.2)]])
        .noise(h + 0.01, 0.35, 0.02, 0.1, [['lp', 420]])
        .grit(h + 0.005, 0.22, 0.2, r.jit(700, 0.3), 0.07, [['hp', 2500]])
        .thump(h, 0.22 * hv, 75, 55, 0.03);
      const nb = r.int(4, 8);
      for (let j = 0; j < nb; j++) S.bubble(h + r.range(0.01, 0.3), r.range(0.06, 0.16), r.range(450, 1600), r.range(0.012, 0.035), r.range(0.15, 0.4));
      S.noise(toe + 0.03, 0.25 * tv, 0.02, 0.08, [['bp', r.jit(900, 0.2), 0.8]]);
      break;
    }
    case 7: { // gel: squelch on the press, suction on the release
      S.add(gelSweep(r, sr, 0.025, 0.08, 0.3, 2.5, 260, 780, 0.12), h, 0.8 * hv)
        .noise(h, 0.4 * hv, 0.015, 0.06, [['lp', 300]])
        .add(gelSweep(r, sr, 0.01, 0.05, 0.2, 3.5, 950, 350, 0.1), h + r.range(0.13, 0.19), 0.45);
      const nb = r.int(2, 4);
      for (let j = 0; j < nb; j++) S.bubble(h + r.range(0.12, 0.3), r.range(0.05, 0.1), r.range(280, 650), r.range(0.015, 0.03), 0.3);
      break;
    }
    case 8: // grass: rustle and a soft thud
      S.grit(h, 0.35 * hv, 0.2, r.jit(1800, 0.25), 0.06, [['hp', 1400]])
        .noise(h, 0.12 * hv, 0.01, 0.05, [['bp', r.jit(4000, 0.2), 0.7]])
        .noise(h, 0.45 * hv, 0.003, 0.025, [['lp', 260]])
        .thump(h, 0.3 * hv, 72, 50, 0.03)
        .grit(toe, 0.45 * tv, 0.15, r.jit(1500, 0.3), 0.05, [['hp', 1800]]);
      break;
    case 9: // drywall / gypsum: dull hollow thud with a fine crumble
      S.noise(h, 0.35 * hv, 0.0005, 0.005, [['bp', r.jit(1500, 0.15), 1]])
        .ring(h, [[r.jit(140, 0.12), 0.05, 0.5], [r.jit(330, 0.12), 0.03, 0.25], [r.jit(720, 0.12), 0.02, 0.1]], hv)
        .noise(h, 0.5 * hv, 0.001, 0.02, [['lp', 900]])
        .grit(h + 0.003, 0.12 * hv, 0.08, r.jit(500, 0.3), 0.03, [['bp', 2500, 0.8]])
        .noise(toe, 0.3 * tv, 0.001, 0.015, [['lp', 1000]])
        .grit(toe, 0.1 * tv, 0.06, 400, 0.02, [['bp', 2800, 0.8]]);
      break;
    case 10: { // plastic: hollow tap with a small panel rattle
      const f = r.jit(620, 0.12);
      S.noise(h, 0.55 * hv, 0.0004, 0.004, [['bp', r.jit(2000, 0.15), 1]])
        .ring(h, [[f, 0.03, 0.35], [f * r.jit(2.3, 0.06), 0.02, 0.2], [f * r.jit(4.1, 0.06), 0.012, 0.1]], hv)
        .thump(h, 0.25 * hv, 120, 80, 0.02);
      const nr = r.int(1, 3);
      for (let j = 0; j < nr; j++) S.ring(h + 0.01 + j * r.range(0.008, 0.016), [[f * r.jit(1.4, 0.1), 0.012, 0.12]], 1 - j * 0.3);
      S.noise(toe, 0.3 * tv, 0.0004, 0.004, [['bp', 2300, 1]]).ring(toe, [[f * 1.05, 0.02, 0.2]], tv);
      break;
    }
    case 11: // wet carpet: muffled thud with a squish
      S.thump(h, 0.45 * hv, 80, 52, 0.03)
        .noise(h, 0.75 * hv, 0.004, 0.035, [['lp', r.jit(480, 0.15), 0.8]])
        .add(gelSweep(r, sr, 0.012, 0.06, 0.25, 2, 600, 1100, 0.08), h + 0.008, 0.35 * hv)
        .grit(h + 0.01, 0.1, 0.12, 320, 0.05, [['bp', 1500, 1.2]])
        .add(gelSweep(r, sr, 0.01, 0.05, 0.2, 2, 700, 1200, 0.08), toe + 0.01, 0.5 * tv);
      break;
    case 12: { // wet hard floor: tap plus a thin splash
      S.click(h, 0.45 * hv, 1800, 0.003)
        .noise(h, 0.35 * hv, 0.0005, 0.008, [['bp', r.jit(2200, 0.15), 1.1]])
        .thump(h, 0.4 * hv, r.jit(92, 0.1), 58, 0.03)
        .noise(h + 0.002, 0.28 * hv, 0.002, 0.03, [['hp', 1500], ['lp', 6000]])
        .grit(h + 0.003, 0.12, 0.08, r.jit(450, 0.3), 0.03, [['hp', 3000]]);
      const nb = r.int(2, 3);
      for (let j = 0; j < nb; j++) S.bubble(h + r.range(0.01, 0.12), r.range(0.04, 0.08), r.range(1000, 2400), r.range(0.006, 0.015), 0.3);
      S.click(toe, 0.25 * tv, 2200, 0.002).noise(toe, 0.18 * tv, 0.002, 0.025, [['hp', 1800]]);
      break;
    }
    default: // 13 asphalt: dull tap and loose grit
      S.noise(h, 0.5 * hv, 0.0005, 0.01, [['bp', r.jit(1700, 0.15), 0.9]])
        .thump(h, 0.45 * hv, r.jit(88, 0.1), 55, 0.035)
        .noise(h, 0.35 * hv, 0.001, 0.02, [['lp', 300]])
        .grit(h, 0.38 * hv, 0.07, r.jit(2500, 0.25), 0.025, [['bp', r.jit(3000, 0.2), 0.7]])
        .grit(toe, 0.45 * tv, 0.08, r.jit(2200, 0.25), 0.03, [['bp', r.jit(3300, 0.2), 0.7]])
        .noise(toe + 0.01, 0.07, 0.015, 0.04, [['bp', 3800, 0.8]]);
      break;
  }
  yield;
  return yield* finishShotG(S.out, sr, 0.9);
}

// ============================================================================ one-shots
// n: variations, sr, dur (seconds), peak (normalisation), gen(S, variationIndex)
export const SHOTS = {
  door_slam: { n: 2, sr: SR_LO, dur: 2.2, gen(S) {
    const r = S.r;
    S.thump(0.01, 0.8, r.jit(64, 0.1), 42, 0.22)
      .thump(0.01, 0.3, r.jit(110, 0.1), 92, 0.1)
      .noise(0.01, 0.75, 0.002, 0.1, [['lp', 340], ['lp', 340]])
      .noise(0.01, 0.35, 0.0005, 0.02, [['lp', 1500]])
      .click(0.022, 0.25, 1500, 0.004)
      .ring(0.022, [[r.jit(2100, 0.1), 0.04, 0.12], [r.jit(3300, 0.08), 0.03, 0.08]]);
    for (let j = 0; j < 3; j++) {
      const t = 0.06 + j * r.range(0.035, 0.07);
      S.ring(t, [[r.jit(380, 0.15), 0.05, 0.12 / (j + 1)], [r.jit(870, 0.15), 0.03, 0.06 / (j + 1)]]);
    }
  } },
  door_close: { n: 2, dur: 1.2, gen(S) {
    const r = S.r, t0 = r.range(0.28, 0.36);
    S.noiseH(0, 0.1, 0.2, 0, 0.06, [['lp', 500], ['hp', 80]])
      .thump(t0, 0.5, r.jit(88, 0.1), 60, 0.06)
      .noise(t0, 0.5, 0.001, 0.03, [['lp', 700]])
      .noise(t0, 0.2, 0.0005, 0.008, [['bp', 1400, 1]])
      .click(t0 + 0.006, 0.4, 2000, 0.003)
      .ring(t0 + 0.006, [[r.jit(1900, 0.1), 0.03, 0.12], [r.jit(2950, 0.1), 0.02, 0.08]])
      .click(t0 + r.range(0.03, 0.05), 0.25, 2200, 0.002)
      .ring(t0 + 0.04, [[r.jit(2300, 0.1), 0.02, 0.08]]);
  } },
  door_latch: { n: 2, dur: 0.5, gen(S) {
    const r = S.r, t1 = 0.05, t2 = t1 + r.range(0.07, 0.11);
    S.noise(0, 0.06, 0.02, 0.03, [['bp', 2500, 2]])
      .click(t1, 0.6, 1800, 0.002)
      .ring(t1, [[r.jit(2400, 0.1), 0.025, 0.25], [r.jit(3700, 0.08), 0.02, 0.15], [r.jit(1300, 0.1), 0.03, 0.1]])
      .click(t2, 0.45, 1600, 0.0025)
      .ring(t2, [[r.jit(2200, 0.1), 0.02, 0.18], [r.jit(1150, 0.1), 0.03, 0.08]])
      .thump(t2, 0.15, 150, 120, 0.02);
  } },
  click: { n: 3, dur: 0.3, gen(S) {
    const r = S.r;
    S.click(0.005, 0.8, r.range(1000, 2200), r.range(0.0015, 0.003))
      .ring(0.005, [[r.range(1500, 3200), r.range(0.015, 0.05), 0.2], [r.range(2500, 4500), r.range(0.01, 0.03), 0.1], [r.range(250, 400), 0.012, 0.15]]);
    if (r.chance(0.5)) S.click(0.005 + r.range(0.01, 0.03), 0.3, 1500, 0.002);
  } },
  relay: { n: 2, dur: 0.5, gen(S) {
    const r = S.r;
    S.noise(0.005, 0.8, 0.0003, 0.003, [['bp', r.jit(2000, 0.15), 1]])
      .ring(0.005, [[r.jit(1100, 0.1), 0.02, 0.2], [r.jit(2600, 0.1), 0.015, 0.15], [r.jit(180, 0.1), 0.03, 0.25]]);
    [0.004, 0.009, 0.015].forEach((d, j) => S.click(0.005 + d, 0.35 / (j + 1), 2500, 0.0012));
    const b = tone({ f0: 120, dec: 0.08, att: 0.01, dur: 0.3, shape: 'sq', sr: S.sr });
    filter(b, [['lp', 1800]], S.sr);
    S.add(b, 0.02, 0.05);
  } },
  pipe_knock: { n: 3, dur: 2.8, gen(S, k) {
    const r = S.r, count = 2 + k, f0 = r.range(170, 240);
    let t = 0.02, g = 1;
    for (let j = 0; j < count; j++) {
      const f = f0 * r.jit(1, 0.03);
      S.noise(t, 0.4 * g, 0.0005, 0.01, [['lp', 600]])
        .ring(t, [[f, 0.3, 0.5], [f * 2.76, 0.15, 0.3], [f * 5.4, 0.08, 0.15], [f * 8.93, 0.05, 0.08], [r.range(1800, 2600), 0.04, 0.1]], g);
      t += r.range(0.18, 0.45);
      g *= r.range(0.6, 0.9);
    }
  } },
  vending_start: { n: 1, dur: 2.8, peak: 0.8, *gen(S) {
    const r = S.r, sr = S.sr, n = S.out.length;
    S.noise(0.01, 0.6, 0.0003, 0.003, [['bp', 1900, 1]]).ring(0.01, [[1150, 0.02, 0.15], [2500, 0.015, 0.1]])
      .thump(0.06, 0.4, 52, 45, 0.12).noise(0.06, 0.3, 0.002, 0.05, [['lp', 220]]);
    const hum = new Float32Array(n);
    let p = 0;
    for (let i = Math.round(0.08 * sr); i < n; i++) {
      const t = i / sr - 0.08, f = 58 - 18 * Math.exp(-t / 0.12);
      p += (TAU * f) / sr;
      const env = Math.min(1, t / 0.3) * (t > 1.7 ? Math.max(0, 1 - (t - 1.7) / 0.95) : 1);
      hum[i] = (0.5 * Math.sin(p) + 0.35 * Math.sin(2 * p + 1) + 0.22 * Math.sin(3 * p + 2) + 0.12 * Math.sin(4 * p + 0.5)) * env;
    } yield;
    S.add(hum, 0, 0.6); yield;
    const rat = white(n, r); yield;
    yield* filterG(rat, [['bp', 900, 3]], sr); yield;
    for (let i = 0; i < n; i++) rat[i] *= hum[i] * hum[i]; yield;
    S.add(rat, 0, 0.5); yield;
  } },
  light_on: { n: 2, dur: 2.2, peak: 0.8, *gen(S) {
    const r = S.r, sr = S.sr, n = S.out.length;
    S.noise(0.01, 0.5, 0.0003, 0.004, [['bp', 1500, 1]]).thump(0.01, 0.35, 115, 95, 0.03).ring(0.01, [[r.jit(900, 0.1), 0.03, 0.12]]); yield;
    const flick = ballast(ns(0.05, sr), sr, r, { buzz: 0.6, sizzle: 0.4 }); yield;
    fadeEdges(flick, 0.003, 0.02, sr);
    for (const t of [0.12, 0.29, 0.41]) {
      const tt = t + r.range(-0.03, 0.03);
      S.click(tt, 0.22, 3000, 0.0015).ring(tt, [[r.jit(3400, 0.1), 0.02, 0.06]]).add(flick, tt, 0.12);
    } yield;
    const b = ballast(n, sr, r, { buzz: 0.35, sizzle: 0.12 }); yield;
    const env = envelope(n, sr, [[0, 0], [0.45, 0], [1.05, 1], [1.6, 1], [2.2, 0]]); yield;
    mulInto(b, env); yield;
    yield* svfG(b, 'lp', 0.8, (t) => 400 + 4000 * smoothstep(0.45, 1.2, t), sr); yield;
    S.add(b, 0, 0.3); yield;
  } },
  light_off: { n: 2, dur: 0.9, peak: 0.75, *gen(S) {
    const r = S.r, sr = S.sr, n = S.out.length;
    S.noise(0.005, 0.5, 0.0003, 0.003, [['bp', 1800, 1]]).ring(0.005, [[r.jit(1000, 0.1), 0.025, 0.12], [r.jit(2400, 0.1), 0.015, 0.08]]); yield;
    const b = ballast(n, sr, r, { buzz: 0.5, sizzle: 0.3, bend: (t) => 1 - 0.06 * Math.min(1, t / 0.15) }); yield;
    for (let i = 0; i < n; i++) b[i] *= Math.exp(-i / (0.06 * sr)); yield;
    S.add(b, 0.004, 0.35).ring(r.range(0.12, 0.2), [[r.jit(4100, 0.1), 0.05, 0.05]]); yield;
  } },
  elevator_ding: { n: 1, dur: 3.6, peak: 0.8, *gen(S) {
    const r = S.r, sr = S.sr, n = S.out.length;
    const env = envelope(n, sr, [[0, 0], [0.6, 0.7], [1.0, 1], [1.12, 0.25], [2.2, 0.08], [3.6, 0]]); yield;
    const rum = white(n, r); yield;
    yield* filterG(rum, [['lp', 110], ['lp', 110]], sr); yield;
    mulInto(rum, env); yield;
    mixRms(S.out, rum, 0.06); yield;
    const m = new Float32Array(n);
    let p = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, f = 70 - 12 * smoothstep(0.8, 1.15, t);
      p += (TAU * f) / sr;
      m[i] = (Math.sin(p) + 0.4 * Math.sin(2 * p) + 0.15 * Math.sin(3 * p)) * env[i];
    } yield;
    S.add(m, 0, 0.06); yield;
    S.thump(1.1, 0.3, 90, 70, 0.05).noise(1.1, 0.25, 0.001, 0.03, [['lp', 320]]).click(1.1, 0.08, 1500, 0.003);
    const bell = (f) => [[f, 1.3, 0.5], [f * 2.0, 0.6, 0.16], [f * 2.76, 0.35, 0.07], [f * 4.07, 0.2, 0.04]];
    S.noise(1.25, 0.03, 0.001, 0.004, [['bp', 3000, 1]]).ring(1.25, bell(659.3), 1); yield;
    S.noise(1.65, 0.03, 0.001, 0.004, [['bp', 3000, 1]]).ring(1.65, bell(523.3), 0.95); yield;
  } },
  // old electromechanical bell: clapper hammering two gongs at ~20 Hz, two rings
  phone_ring: { n: 2, dur: 2.1, peak: 0.8, *gen(S) {
    const r = S.r;
    const g1 = r.range(1150, 1250), g2 = g1 * r.range(1.12, 1.2);
    const gong = (f) => [[f, 0.45, 0.4], [f * 2.32, 0.22, 0.18], [f * 3.6, 0.14, 0.1], [f * 5.1, 0.08, 0.05]];
    for (const [t0, len] of [[0.01, 0.42], [0.66, 0.42]]) {
      let k = 0;
      for (let t = t0; t < t0 + len; t += r.range(0.047, 0.053), k++) {
        const a = 0.6 + 0.4 * r();
        S.ring(t, gong(k % 2 ? g2 : g1), a).click(t, 0.05 * a, 3000, 0.0008);
      }
      const coil = tone({ f0: 20, dur: len, att: 0.01, dec: 10, shape: 'sq', sr: S.sr });
      fadeEdges(coil, 0.01, 0.02, S.sr);
      yield* filterG(coil, [['lp', 300]], S.sr);
      S.add(coil, t0, 0.03);
    } yield;
  } },
  clatter: { n: 2, dur: 1.8, gen(S, k) {
    const r = S.r, metal = k === 0;
    const base = metal ? r.range(600, 900) : r.range(450, 750);
    const ratios = metal ? [1, 2.41, 3.93, 5.6, 7.9] : [1, 1.9, 3.1];
    const decs = metal ? [0.35, 0.25, 0.18, 0.12, 0.08] : [0.05, 0.035, 0.02];
    let t = 0.02, g = 1, dt = r.range(0.18, 0.26);
    for (let j = 0; j < 9 && g > 0.04; j++) {
      const list = ratios.map((q, i) => [base * q * r.jit(1, 0.02), decs[i] * r.jit(1, 0.2), r.range(0.2, 1) / (i + 1)]);
      S.click(t, 0.5 * g, metal ? 2000 : 1200, 0.002).ring(t, list, 0.5 * g);
      if (!metal) S.noise(t, 0.3 * g, 0.0005, 0.008, [['lp', 900]]);
      t += dt; dt *= r.range(0.55, 0.75); g *= r.range(0.5, 0.75);
    }
    for (let j = 0; j < 8; j++) S.click(t + j * r.range(0.03, 0.06), 0.06 * (1 - j / 8), 2500, 0.001);
    if (!metal) {
      let t2 = r.range(0.08, 0.15), g2 = 0.5;
      for (let j = 0; j < 4; j++) {
        S.ring(t2, [[r.jit(1300, 0.1), 0.025, 0.2], [r.jit(2600, 0.1), 0.015, 0.1]], g2).click(t2, 0.2 * g2, 1500, 0.0015);
        t2 += r.range(0.08, 0.16); g2 *= 0.6;
      }
    }
  } },
  thud: { n: 2, sr: SR_LO, dur: 1.2, gen(S) {
    const r = S.r;
    S.thump(0.01, 0.75, r.jit(58, 0.1), 40, 0.15)
      .noise(0.01, 0.6, 0.002, 0.08, [['lp', 250], ['lp', 250]])
      .noise(0.01, 0.25, 0.001, 0.02, [['lp', 700]]);
    if (r.chance(0.6)) {
      const t = 0.012 + r.range(0.1, 0.2);
      S.thump(t, 0.18, 70, 50, 0.06).noise(t, 0.12, 0.002, 0.03, [['lp', 400]]);
    }
  } },
  // the building settling: stick-slip groans through beam resonances, then a tick
  creak: { n: 3, dur: 2.6, peak: 0.8, gen(S, k) {
    const r = S.r, sr = S.sr;
    const res = k === 0 ? [[r.jit(320, 0.1), 8, 1], [r.jit(710, 0.1), 10, 0.6], [r.jit(1450, 0.1), 6, 0.3]]
      : k === 1 ? [[r.jit(520, 0.1), 20, 1], [r.jit(1240, 0.1), 25, 0.5], [r.jit(2380, 0.1), 18, 0.25]]
        : [[r.jit(180, 0.1), 10, 1], [r.jit(420, 0.1), 12, 0.6], [r.jit(950, 0.1), 8, 0.25]];
    const dur = r.range(0.9, 1.6), t0 = 0.05;
    const base = k === 2 ? r.range(8, 14) : r.range(18, 30), w = r.range(1, 2.2), ph = r() * TAU;
    S.add(stickSlip(r, dur, (t) => base * (1 + 0.55 * Math.sin((TAU * w * t) / dur + ph)), (t) => Math.pow(Math.sin((Math.PI * t) / dur), 0.7), res, sr), t0, 1);
    const te = t0 + dur + r.range(0.05, 0.3);
    S.click(te, 0.25, 1200, 0.003).ring(te, [[r.jit(600, 0.2), 0.04, 0.2]]);
  } },
  buzz_change: { n: 2, dur: 1.8, peak: 0.75, *gen(S) {
    const r = S.r, sr = S.sr, n = S.out.length, up = r.range(1.03, 1.06);
    const b = ballast(n, sr, r, { buzz: 0.6, sizzle: 0.25, bend: (t) => 1 + (up - 1) * Math.sin(Math.min(1, t / 0.4) * Math.PI) - 0.02 * smoothstep(0.6, 1.6, t) }); yield;
    mulInto(b, envelope(n, sr, [[0, 0], [0.08, 1], [0.35, 0.8], [1.2, 0.35], [1.8, 0]])); yield;
    yield* svfG(b, 'lp', 0.9, (t) => 1200 + 3800 * Math.exp(-t / 0.4), sr); yield;
    S.add(b, 0, 1).grit(0, 0.15, 0.08, 1500, 0.03, [['hp', 2500]]); yield;
  } },
  water_rush: { n: 2, dur: 4.8, peak: 0.8, *gen(S) {
    const r = S.r, sr = S.sr, n = S.out.length;
    const env = envelope(n, sr, [[0, 0], [0.8, 0.8], [1.2, 1], [3.0, 0.85], [4.8, 0]]); yield;
    const a = white(n, r); yield* filterG(a, [['bp', 600, 0.8]], sr); yield;
    const b = white(n, r); yield* filterG(b, [['lp', 250]], sr); yield;
    const w1 = r.range(5, 8), w2 = r.range(1.5, 3);
    const g = white(n, r); yield* svfG(g, 'bpn', 6, (t) => 300 + 600 * (0.5 + 0.5 * Math.sin(t * w1) * Math.sin(t * w2 + 1)), sr); yield;
    const p = white(n, r); yield* filterG(p, [['bp', r.range(160, 220), 12]], sr); yield;
    const mix = new Float32Array(n);
    mixRms(mix, a, 0.5); mixRms(mix, b, 0.4); mixRms(mix, g, 0.3); mixRms(mix, p, 0.2); yield;
    mulInto(mix, env); yield;
    S.add(mix, 0, 1); yield;
    for (let j = 0; j < 18; j++) {
      const t = r.range(0.3, 4.2);
      S.bubble(t, 0.25 * env[Math.min(n - 1, Math.round(t * sr))], r.range(200, 700), r.range(0.02, 0.05), 0.2);
    } yield;
    yield* S.filterG([['lp', 2200]]); yield;
  } },
  tile_fall: { n: 2, dur: 2.0, gen(S) {
    const r = S.r, tl = r.range(0.5, 0.7);
    S.noise(0, 0.1, 0.06, 0.08, [['bp', 1800, 1.5]])
      .grit(0, 0.05, 0.25, 400, 0.15, [['hp', 2000]])
      .click(0.2, 0.08, 2500, 0.002).ring(0.2, [[r.jit(2900, 0.1), 0.03, 0.08]])
      .noise(0.28, 0.025, 0.15, 0.1, [['lp', 800]])
      .noise(tl, 0.8, 0.0008, 0.025, [['lp', 1500], ['hp', 120]])
      .noise(tl, 0.5, 0.001, 0.05, [['lp', 300]])
      .thump(tl, 0.3, 80, 60, 0.05)
      .noise(tl + r.range(0.09, 0.14), 0.22, 0.0008, 0.02, [['lp', 1300]])
      .grit(tl + 0.02, 0.06, 0.9, 150, 0.35, [['hp', 2000]]);
  } },
  locked_rattle: { n: 3, dur: 1.0, gen(S) {
    const r = S.r, fb = r.range(1700, 1950), fc = r.range(2900, 3300);
    let t = 0.01;
    for (const cnt of [r.int(3, 4), r.int(2, 4)]) {
      for (let j = 0; j < cnt; j++) {
        const g = r.range(0.6, 1);
        S.click(t, 0.5 * g, 1500, 0.003).ring(t, [[fb * r.jit(1, 0.04), 0.03, 0.15], [fc * r.jit(1, 0.04), 0.02, 0.1], [r.jit(900, 0.1), 0.02, 0.06]], g);
        if (j % 2 === 0) S.noise(t, 0.3 * g, 0.001, 0.02, [['lp', 400]]).thump(t, 0.2 * g, 130, 110, 0.04);
        t += r.range(0.045, 0.08);
      }
      t += r.range(0.12, 0.2);
    }
  } },
  cooler_glug: { n: 2, dur: 1.8, peak: 0.8, gen(S) {
    const r = S.r, sr = S.sr, count = r.int(3, 4);
    let t = 0.02;
    for (let j = 0; j < count; j++) {
      const f = r.range(170, 230), b = new Float32Array(ns(0.25, sr));
      let p = 0;
      for (let i = 0; i < b.length; i++) {
        const tt = i / sr, ff = f * (1 + 1.2 * Math.min(1, tt / 0.07));
        p += (TAU * ff) / sr;
        b[i] = (Math.sin(p) + 0.25 * Math.sin(2 * p)) * Math.min(1, tt / 0.005) * Math.exp(-tt / 0.05);
      }
      S.add(b, t, 0.5 * (1 - j * 0.12)).noise(t, 0.1, 0.003, 0.04, [['bp', 500, 3]]);
      const nb = r.int(2, 4);
      for (let q = 0; q < nb; q++) S.bubble(t + r.range(0.02, 0.12), 0.08, r.range(600, 1300), r.range(0.01, 0.025), 0.4);
      t += r.range(0.25, 0.4);
    }
    S.filter([['peak', 420, 2, 4]]);
  } },
  vending_clunk: { n: 2, dur: 1.2, gen(S) {
    const r = S.r, t = r.range(0.15, 0.22), tb = t + r.range(0.09, 0.14);
    S.noise(0, 0.05, 0.01, 0.03, [['bp', 2000, 1.5]])
      .noise(t, 0.6, 0.0005, 0.02, [['lp', 500]])
      .ring(t, [[r.jit(220, 0.08), 0.12, 0.35], [r.jit(490, 0.08), 0.08, 0.2], [r.jit(1150, 0.08), 0.05, 0.1], [r.jit(1700, 0.08), 0.06, 0.12], [r.jit(2900, 0.08), 0.05, 0.08]])
      .thump(t, 0.35, 95, 70, 0.05)
      .ring(tb, [[r.jit(1700, 0.1), 0.05, 0.1], [r.jit(2900, 0.1), 0.04, 0.06]], 0.4)
      .noise(tb, 0.15, 0.0005, 0.01, [['lp', 800]]);
    for (let j = 0; j < 5; j++) S.click(tb + 0.05 + j * r.range(0.04, 0.07), 0.05 * (1 - j / 5), 2500, 0.001);
    const tf = t + r.range(0.35, 0.5);
    S.click(tf, 0.08, 1200, 0.002).ring(tf, [[r.jit(800, 0.1), 0.02, 0.06]]);
  } },
  // handset lifted: cradle clack, hook switch, dial tone ... that cuts to nothing
  phone_pickup: { n: 1, dur: 2.7, peak: 0.6, *gen(S) {
    const r = S.r, sr = S.sr, n = S.out.length;
    S.noise(0.01, 0.6, 0.0004, 0.004, [['bp', 1500, 1]]).ring(0.01, [[700, 0.03, 0.25], [1650, 0.02, 0.15]]).click(0.06, 0.35, 1800, 0.002); yield;
    const t0 = 0.28, t1 = r.range(2.0, 2.3), d = new Float32Array(n);
    for (let i = Math.round(t0 * sr), e = Math.round(t1 * sr); i < e; i++) {
      const t = i / sr - t0;
      d[i] = (Math.sin(TAU * 350 * t) + Math.sin(TAU * 440 * t)) * Math.min(1, t / 0.01) + 0.05 * Math.sin(TAU * 60 * t) + 0.04 * (r() * 2 - 1);
    } yield;
    yield* filterG(d, [['hp', 300], ['lp', 3400]], sr); yield;
    S.add(d, 0, 0.12).click(t1, 0.05, 1500, 0.001); yield;
  } },
  paper: { n: 3, dur: 0.7, peak: 0.7, gen(S, k) {
    const r = S.r, len = r.range(0.25, 0.45);
    S.add(crackle(r, { dur: len, rate: r.range(900, 1500), att: len * 0.3, dec: len * 0.5, f: [['bp', 3500, 0.6]], sr: S.sr }), 0.01, 0.5)
      .noiseH(0.01, 0.12, len * 0.4, 0, len * 0.3, [['bp', 2500, 0.8]]);
    if (k === 2) S.noise(len, 0.25, 0.0005, 0.006, [['bp', 3000, 1]]);
  } },
  // pulling yourself up a ledge: clothing, hands, shoe scuffs (no voice)
  climb: { n: 2, dur: 1.1, peak: 0.75, gen(S) {
    const r = S.r, t2 = 0.18 + r.range(0, 0.04), t3 = 0.7 + r.range(0, 0.06);
    S.noiseH(0, 0.15, 0.12, 0.1, 0.15, [['bp', 1200, 0.7]])
      .grit(0, 0.05, 0.5, 300, 0.2, [['bp', 2500, 0.8]])
      .noise(0.05, 0.45, 0.001, 0.012, [['lp', 1200]]).thump(0.05, 0.2, 140, 110, 0.03)
      .noise(t2, 0.35, 0.001, 0.012, [['lp', 1100]]).thump(t2, 0.15, 130, 100, 0.03)
      .noiseH(0.35, 0.18, 0.05, 0.08, 0.08, [['bp', 1800, 1.2]])
      .grit(0.35, 0.08, 0.25, 700, 0.1, [['hp', 2000]])
      .noise(t3, 0.35, 0.002, 0.03, [['lp', 400]]).thump(t3, 0.2, 90, 70, 0.04);
  } },
  fall_wind: { n: 1, dur: 2.2, peak: 0.7, gen(S) {
    const r = S.r, sr = S.sr, n = S.out.length;
    const a = white(n, r); svf(a, 'bpn', 1.2, (t) => 300 + 1100 * Math.min(1, t / 1.8), sr);
    const b = white(n, r); filter(b, [['lp', 400]], sr);
    const env = envelope(n, sr, [[0, 0], [1.2, 0.8], [1.9, 1], [2.2, 0]]);
    const mix = new Float32Array(n);
    mixRms(mix, a, 0.6); mixRms(mix, b, 0.4);
    for (let i = 0; i < n; i++) { const t = i / sr; mix[i] *= env[i] * (1 + 0.15 * Math.sin(TAU * 9 * t) * Math.sin(TAU * 1.3 * t)); }
    S.add(mix, 0, 1);
  } },
  typewriter: { n: 2, dur: 2.2, peak: 0.8, gen(S) {
    const r = S.r, count = r.int(6, 9);
    let t = 0.02;
    for (let j = 0; j < count; j++) {
      const g = r.range(0.7, 1);
      S.click(t, 0.6 * g, 2000, 0.002)
        .noise(t, 0.35 * g, 0.0005, 0.01, [['lp', 600]])
        .ring(t, [[r.jit(1350, 0.15), 0.03, 0.15], [r.jit(2900, 0.1), 0.02, 0.1], [r.jit(420, 0.1), 0.02, 0.1]], g)
        .click(t + r.range(0.02, 0.03), 0.15 * g, 2500, 0.0012);
      t += r.chance(0.15) ? r.range(0.3, 0.45) : r.range(0.09, 0.2);
    }
  } },
  // ---- internal one-shots (flicker ticks, landing, ambience sprinkles)
  flick_on: { n: 3, dur: 0.22, peak: 0.8, gen(S) {
    const r = S.r, sr = S.sr;
    S.click(0.002, 0.5, 2800, 0.0012).ring(0.002, [[r.jit(3600, 0.1), 0.015, 0.1]]);
    const b = ballast(ns(0.12, sr), sr, r, { buzz: 0.7, sizzle: 0.4 });
    for (let i = 0; i < b.length; i++) b[i] *= Math.min(1, i / (0.004 * sr)) * Math.exp(-i / (0.03 * sr));
    S.add(b, 0.004, 0.25);
  } },
  flick_off: { n: 2, dur: 0.15, peak: 0.8, gen(S) {
    const r = S.r;
    S.click(0.002, 0.5, 2400, 0.001).ring(0.002, [[r.jit(4200, 0.1), 0.02, 0.08], [r.jit(2600, 0.1), 0.01, 0.05]]);
  } },
  land: { n: 2, sr: SR_LO, dur: 0.6, gen(S) {
    const r = S.r;
    S.thump(0.005, 0.8, r.jit(70, 0.1), 45, 0.08).noise(0.005, 0.7, 0.002, 0.05, [['lp', 300], ['lp', 300]]).noise(0.005, 0.3, 0.001, 0.015, [['lp', 900]]);
  } },
  drip: { n: 4, dur: 0.35, peak: 0.8, gen(S) {
    const r = S.r;
    S.bubble(0.005, 0.5, r.range(900, 1900), r.range(0.012, 0.03), r.range(0.3, 0.8)).noise(0.004, 0.12, 0.0003, 0.006, [['hp', 2500]]);
  } },
};

// ============================================================================ loops
// Emitter loops: L seconds, whole cycles of every periodic part, circular filters and wrapped
// events, so the buffer loops without a seam. norm: ['rms', level] | ['peak', level]
export const LOOPS = {
  vending: { L: 4, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    oscAdd(out, wavetable([[1, 0.45], [2, 0.35, 1], [3, 0.2, 2], [4, 0.12, 0.5], [6, 0.06, 1.7]]), cyc(58.5, L), 1, sr); yield;
    oscAdd(out, wavetable([[1, 0.1], [2, 0.04, 1], [3, 0.03, 2]]), cyc(120, L), 1, sr); yield;
    const fan = white(n, r); yield* filterG(fan, [['bp', 700, 0.7]], sr, true); yield;
    const rum = white(n, r); yield* filterG(rum, [['lp', 200], ['lp', 200]], sr, true); yield;
    const rat = white(n, r); yield* filterG(rat, [['bp', 1100, 4]], sr, true); yield;
    const fr = cyc(117, L);
    for (let i = 0; i < n; i++) rat[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * fr * i) / sr), 4); yield;
    const base = rmsOf(out);
    mixRms(out, fan, base * 0.35); mixRms(out, rum, base * 0.4); mixRms(out, rat, base * 0.12); yield;
    const fa = cyc(1.75, L);
    for (let i = 0; i < n; i++) out[i] *= 1 + 0.08 * Math.sin((TAU * fa * i) / sr); yield;
  } },
  cooler: { L: 4, norm: ['rms', 0.16], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    oscAdd(out, wavetable([[1, 0.5], [2, 0.3, 1], [3, 0.15, 2], [5, 0.05, 1]]), cyc(49.75, L), 1, sr); yield;
    const hiss = white(n, r); yield* filterG(hiss, [['bp', 2500, 0.8]], sr, true); yield;
    const rum = white(n, r); yield* filterG(rum, [['lp', 160], ['lp', 160]], sr, true); yield;
    const base = rmsOf(out);
    mixRms(out, hiss, base * 0.06); mixRms(out, rum, base * 0.35); yield;
  } },
  fridge: { L: 4, norm: ['rms', 0.16], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    oscAdd(out, wavetable([[1, 0.6], [2, 0.45, 1], [3, 0.2, 2], [4, 0.12, 0.4], [6, 0.05, 1]]), cyc(47.5, L), 1, sr); yield;
    oscAdd(out, wavetable([[1, 1]]), cyc(1600, L), (t) => 0.012 * (1 + 0.3 * Math.sin((TAU * t) / L)), sr); yield;
    const rum = white(n, r); yield* filterG(rum, [['lp', 140], ['lp', 140]], sr, true); yield;
    mixRms(out, rum, rmsOf(out) * 0.4); yield;
  } },
  server: { L: 6, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const air = white(n, r); yield* filterG(air, [['lp', 4500], ['hp', 200]], sr, true); yield;
    mixRms(out, air, 0.3); yield;
    const tbl = wavetable([[1, 1], [2, 0.35, 1]]);
    oscAdd(out, tbl, cyc(236.5, L), 0.05, sr); oscAdd(out, tbl, cyc(237, L), 0.045, sr, 0.3); oscAdd(out, tbl, cyc(318.5, L), 0.03, sr, 0.6); yield;
    oscAdd(out, wavetable([[1, 1]]), cyc(3150, L), 0.006, sr); yield;
    for (let j = 0; j < 7; j++) {
      const t = r.range(0, L);
      S.click(t, 0.05, 2000, 0.002).click(t + r.range(0.01, 0.03), 0.03, 2500, 0.0015);
    } yield;
  } },
  static: { L: 3, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const w = white(n, r); yield* filterG(w, [['lp', 7000], ['hp', 120]], sr, true); yield;
    const f60 = cyc(60, L);
    for (let i = 0; i < n; i++) w[i] *= 1 + 0.18 * Math.sin((TAU * f60 * i) / sr); yield;
    mixRms(out, w, 0.3); yield;
    oscAdd(out, wavetable([[1, 1], [3, 0.3], [5, 0.15]]), f60, 0.02, sr); yield;
    S.grit(0, 0.25, L, 250, L * 10, [['hp', 1500]]);
  } },
  tick: { L: 2, norm: ['peak', 0.6], *gen(S) {
    const r = S.r;
    S.click(0.01, 0.5, 2500, 0.0015).ring(0.01, [[r.jit(2600, 0.05), 0.012, 0.3], [r.jit(4100, 0.05), 0.008, 0.2], [r.jit(900, 0.05), 0.02, 0.1]]); yield;
    S.click(1.01, 0.42, 2300, 0.0015).ring(1.01, [[r.jit(2300, 0.05), 0.012, 0.3], [r.jit(3700, 0.05), 0.008, 0.18], [r.jit(820, 0.05), 0.02, 0.1]]); yield;
  } },
  transformer: { L: 2, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const b = ballast(n, sr, r, { buzz: 0.3, sizzle: 0.02, fund: cyc(60, L), circ: true }); yield;
    softClip(scale(b, 1 / Math.max(1e-6, peakOf(b))), 1.6);
    mixInto(out, b); yield;
    const fa = cyc(0.5, L);
    for (let i = 0; i < n; i++) out[i] *= 1 + 0.06 * Math.sin((TAU * fa * i) / sr); yield;
  } },
  drip: { L: 7, norm: ['peak', 0.7], *gen(S) {
    const r = S.r;
    for (const t of [0.3, 1.9, 2.95, 4.6, 5.8]) {
      const f = r.range(1100, 1700);
      S.bubble(t, 0.5, f, r.range(0.015, 0.03), r.range(0.3, 0.7)).noise(t, 0.1, 0.0003, 0.006, [['hp', 2500]]);
      if (r.chance(0.4)) S.bubble(t + r.range(0.03, 0.08), 0.15, f * r.range(1.3, 1.8), 0.01, 0.4);
    } yield;
  } },
  washer: { L: 4, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    oscAdd(out, wavetable([[1, 0.5], [2, 0.3, 1], [3, 0.12, 2]]), cyc(92, L), 0.4, sr); yield;
    const sw = white(n, r); yield* filterG(sw, [['bp', 500, 1]], sr, true); yield;
    const sl = white(n, r); yield* filterG(sl, [['lp', 700]], sr, true); yield;
    const rum = white(n, r); yield* filterG(rum, [['lp', 60], ['lp', 60]], sr, true); yield;
    const fa = cyc(0.5, L), fd = cyc(1, L);
    for (let i = 0; i < n; i++) {
      const t = i / sr, c = 0.5 + 0.5 * Math.sin(TAU * fa * t);
      sw[i] *= 0.3 + 0.7 * Math.abs(Math.sin(TAU * fa * t));
      sl[i] *= Math.pow(c, 3);
      rum[i] *= 1 + 0.6 * Math.sin(TAU * fd * t);
    } yield;
    const base = rmsOf(out);
    mixRms(out, sw, base * 0.9); mixRms(out, sl, base * 0.6); mixRms(out, rum, base * 0.8); yield;
    for (let j = 0; j < 8; j++) S.bubble(r.range(0, L), 0.03, r.range(300, 900), r.range(0.01, 0.03), 0.2); yield;
  } },
  vent: { L: 6, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const air = white(n, r); yield* filterG(air, [['bp', 400, 0.6]], sr, true); yield;
    const rum = white(n, r); yield* filterG(rum, [['lp', 150], ['lp', 150]], sr, true); yield;
    const duct = white(n, r); yield* filterG(duct, [['bp', 95, 5]], sr, true); yield;
    mixRms(out, air, 0.5); mixRms(out, rum, 0.35); mixRms(out, duct, 0.15); yield;
    const ff = cyc(13.5, L), lf = loopLfo(r, L, [1, 2]);
    for (let i = 0; i < n; i++) { const t = i / sr; out[i] *= (1 + 0.05 * Math.sin(TAU * ff * t)) * (1 + 0.12 * lf(t)); } yield;
  } },
  // slow mechanical heartbeat (~50 bpm): sub thumps, felt more than heard
  heartbeat: { L: 2.4, sr: SR_LO, norm: ['peak', 0.8], *gen(S) {
    const r = S.r;
    for (const [t, g] of [[0.02, 1], [1.22, 0.92]]) {
      S.thump(t, 0.8 * g, r.jit(48, 0.05), 38, 0.09).noise(t, 0.3 * g, 0.004, 0.05, [['lp', 120]]).ring(t, [[r.jit(900, 0.1), 0.01, 0.03]], g);
      S.thump(t + 0.24, 0.55 * g, r.jit(55, 0.05), 42, 0.07).noise(t + 0.24, 0.2 * g, 0.004, 0.04, [['lp', 120]]);
    } yield;
  } },
  machine: { L: 4, sr: SR_LO, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    oscAdd(out, wavetable([[1, 0.3], [2, 0.2, 1], [3, 0.1, 2]]), cyc(29.5, L), 1, sr); yield;
    const roar = white(n, r); yield* filterG(roar, [['lp', 300], ['bp', 150, 0.7]], sr, true); yield;
    const lf = loopLfo(r, L, [3, 5, 7]);
    for (let i = 0; i < n; i++) roar[i] *= 1 + 0.25 * lf(i / sr); yield;
    mixRms(out, roar, rmsOf(out) * 0.9); yield;
    const stroke = cyc(1.5, L);
    for (let j = 0; j < Math.round(stroke * L); j++) {
      const t = j / stroke;
      S.thump(t, 0.25, 45, 38, 0.1).noise(t, 0.18, 0.003, 0.08, [['lp', 200]]);
    } yield;
    S.click(r.range(0, L), 0.08, 1200, 0.003).click(r.range(0, L), 0.06, 1500, 0.003);
  } },
  water: { L: 6, norm: ['rms', 0.18], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const w = white(n, r); yield* filterG(w, [['bp', 1000, 0.5], ['hp', 300]], sr, true); yield;
    const lf = loopLfo(r, L, [2, 3, 5]);
    for (let i = 0; i < n; i++) w[i] *= 1 + 0.2 * lf(i / sr); yield;
    mixRms(out, w, 0.15); yield;
    for (let j = 0; j < 70; j++) S.bubble(r.range(0, L), r.range(0.04, 0.12), r.range(300, 2500), r.range(0.01, 0.03), r.range(0.1, 0.5)); yield;
  } },
  pipes: { L: 8, norm: ['rms', 0.12], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const hiss = white(n, r); yield* filterG(hiss, [['hp', 2500], ['lp', 7000]], sr, true); yield;
    const flow = white(n, r); yield* filterG(flow, [['lp', 300]], sr, true); yield;
    const fa = cyc(0.25, L);
    for (let i = 0; i < n; i++) hiss[i] *= 1 + 0.2 * Math.sin((TAU * fa * i) / sr); yield;
    mixRms(out, hiss, 0.12); mixRms(out, flow, 0.05); yield;
    for (let j = 0; j < 2; j++) {
      const t = r.range(0, L);
      S.click(t, 0.3, 2000, 0.0015).ring(t, [[r.range(2200, 3500), 0.02, 0.25], [r.range(500, 700), 0.03, 0.12]]);
    } yield;
  } },
  fan: { L: 2, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const air = white(n, r); yield* filterG(air, [['bp', 900, 0.6]], sr, true); yield;
    const low = white(n, r); yield* filterG(low, [['lp', 250]], sr, true); yield;
    const rat = white(n, r); yield* filterG(rat, [['bp', 1300, 5]], sr, true); yield;
    const bpf = cyc(49.5, L), rot = cyc(16.5, L);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      air[i] *= 1 + 0.25 * Math.sin(TAU * bpf * t);
      rat[i] *= Math.pow(0.5 + 0.5 * Math.sin(TAU * rot * t), 6);
    } yield;
    mixRms(out, air, 0.3); mixRms(out, low, 0.2); mixRms(out, rat, 0.03); yield;
    oscAdd(out, wavetable([[1, 1], [2, 0.5]]), cyc(120, L), 0.03, sr); yield;
  } },
  escalator: { L: 4, norm: ['rms', 0.18], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    oscAdd(out, wavetable([[1, 0.4], [2, 0.3, 1], [3, 0.15, 2], [4, 0.08, 0.3]]), cyc(47.25, L), 0.5, sr); yield;
    const ch = white(n, r); yield* filterG(ch, [['bp', 2500, 2]], sr, true); yield;
    const cf = cyc(25, L);
    for (let i = 0; i < n; i++) ch[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * cf * i) / sr), 4); yield;
    mixRms(out, ch, rmsOf(out) * 0.15); yield;
    for (let j = 0; j < 10; j++) {
      const t = j * 0.4 + r.range(-0.01, 0.01), g = r.range(0.6, 1);
      S.click(t, 0.25 * g, 1500, 0.004).ring(t, [[r.jit(700, 0.05), 0.03, 0.12], [r.jit(1900, 0.05), 0.02, 0.08]], g);
    } yield;
  } },
  // gusty wind for open, slate-sky areas
  wind: { L: 12, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const gust = loopLfo(r, L, [1, 2, 3, 5]);
    const g = (t) => 0.62 + 0.38 * gust(t) * 1.6;
    const a = white(n, r); yield* svfG(a, 'lp', 0.7, (t) => 250 + 900 * clamp(g(t), 0, 1.2), sr, true); yield;
    const wh = white(n, r); yield* svfG(wh, 'bpn', 12, (t) => 700 + 400 * clamp(g(t), 0, 1.2), sr, true); yield;
    for (let i = 0; i < n; i++) { const e = clamp(g(i / sr), 0.15, 1.3); a[i] *= e; wh[i] *= e * e; } yield;
    mixRms(out, a, 0.3); mixRms(out, wh, 0.05); yield;
  } },
  drone: { L: 4, sr: SR_LO, norm: ['rms', 0.22], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    oscAdd(out, wavetable([[1, 1]]), cyc(33.25, L), 0.4, sr); yield;
    oscAdd(out, wavetable([[1, 1]]), cyc(33.5, L), 0.3, sr, 0.25); yield;
    oscAdd(out, wavetable([[1, 1]]), cyc(66.5, L), 0.25, sr, 0.5); yield;
    oscAdd(out, wavetable([[1, 1]]), cyc(100, L), 0.1, sr, 0.1); yield;
    const rum = white(n, r); yield* filterG(rum, [['lp', 90], ['lp', 90]], sr, true); yield;
    mixRms(out, rum, rmsOf(out) * 0.6); yield;
    const rat = white(n, r); yield* filterG(rat, [['bp', 400, 6]], sr, true); yield;
    const fr = cyc(33.25, L);
    for (let i = 0; i < n; i++) rat[i] *= Math.pow(0.5 + 0.5 * Math.sin((TAU * fr * i) / sr), 6); yield;
    mixRms(out, rat, rmsOf(out) * 0.05); yield;
  } },
  hum_strip: { L: 2, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    mixInto(out, ballast(n, sr, r, { buzz: 0.55, sizzle: 0.2, fund: cyc(60, L), circ: true })); yield;
    oscAdd(out, wavetable([[1, 1]]), cyc(9000, L), rmsOf(out) * 0.06, sr); yield;
    const fa = cyc(0.5, L);
    for (let i = 0; i < n; i++) out[i] *= 1 + 0.05 * Math.sin((TAU * fa * i) / sr); yield;
  } },
  // a music box somewhere: faint, slow, slightly out of tune, with a little wow
  music_box: { L: 12, norm: ['peak', 0.55], *gen(S, L) {
    const r = S.r;
    const notes = [[0.0, 76], [0.75, 72], [1.5, 69], [2.25, 71], [3.0, 72], [3.75, 76], [4.5, 74], [6.0, 72], [6.75, 71], [7.5, 68], [8.25, 69], [9.75, 64]];
    for (const [t, m] of notes) {
      const f = 440 * Math.pow(2, (m - 69) / 12 + r.range(-25, 25) / 1200);
      const g = r.range(0.75, 1);
      S.ring(t, [[f, 1.4, 0.5], [f * 2.01, 0.45, 0.1], [f * 5.4, 0.12, 0.06], [f * 8.9, 0.05, 0.03]], g).click(t, 0.04 * g, 3000, 0.0012);
    } yield;
    const whir = white(S.out.length, r); yield* filterG(whir, [['bp', 2200, 1]], S.sr, true); yield;
    mixRms(S.out, whir, 0.004); yield;
    S.out.set(wowLoop(S.out, S.sr, 0.006, 2)); yield;
  } },
};

// ============================================================================ ambience beds
const HUM_L = 4, HVAC_L = 8;
export const BEDS = {
  // fluorescent hum: 120 Hz dominant + harmonics, a slightly detuned second tube beating against
  // it, clipped ballast buzz, arc sizzle and a faint high whine
  bed_hum: { L: HUM_L, norm: ['rms', 0.25], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    mixInto(out, ballast(n, sr, r, { buzz: 0.22, sizzle: 0.05, fund: cyc(60, L), circ: true })); yield;
    oscAdd(out, wavetable([[1, 0.3], [2, 0.1, 1]]), cyc(120.25, L), 1, sr); yield;
    const base = rmsOf(out), fw = cyc(8400, L), fm = cyc(0.25, L);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      out[i] += base * 0.05 * Math.sin(TAU * fw * t + (12 / fm) * Math.sin(TAU * fm * t)) * (0.7 + 0.3 * Math.sin(TAU * 0.5 * t));
    } yield;
    const a1 = cyc(0.5, L), a2 = cyc(1.25, L);
    for (let i = 0; i < n; i++) { const t = i / sr; out[i] *= 1 + 0.06 * Math.sin(TAU * a1 * t + 1) + 0.03 * Math.sin(TAU * a2 * t); } yield;
  } },
  // air handling: rumble, airflow band, hiss, a faint blade tone, slow swells
  bed_hvac: { L: HVAC_L, norm: ['rms', 0.25], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const rum = white(n, r); yield* filterG(rum, [['lp', 140], ['lp', 140]], sr, true); yield;
    const air = white(n, r); yield* filterG(air, [['bp', 520, 0.5], ['lp', 1800]], sr, true); yield;
    const hiss = white(n, r); yield* filterG(hiss, [['hp', 2500], ['lp', 6000]], sr, true); yield;
    mixRms(out, rum, 0.55); mixRms(out, air, 0.5); mixRms(out, hiss, 0.08); yield;
    oscAdd(out, wavetable([[1, 1], [2, 0.4, 1], [3, 0.15, 2]]), cyc(87.5, L), (t) => 0.04 * (1 + 0.3 * Math.sin((TAU * 3 * t) / L)), sr); yield;
    const lf = loopLfo(r, L, [1, 3]);
    for (let i = 0; i < n; i++) out[i] *= 1 + 0.14 * lf(i / sr); yield;
  } },
  tone_yellow: { L: 8, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const lo = white(n, r); yield* filterG(lo, [['lp', 150], ['lp', 150]], sr, true); yield;
    const air = white(n, r); yield* filterG(air, [['lp', 2500], ['hp', 200]], sr, true); yield;
    mixRms(out, lo, 0.6); mixRms(out, air, 0.15); yield;
    oscAdd(out, wavetable([[1, 1], [2, 0.3]]), cyc(60, L), 0.04, sr); yield;
  } },
  tone_office: { L: 8, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const air = white(n, r); yield* filterG(air, [['lp', 2000], ['hp', 150]], sr, true); yield;
    const lo = white(n, r); yield* filterG(lo, [['lp', 120], ['lp', 120]], sr, true); yield;
    mixRms(out, air, 0.3); mixRms(out, lo, 0.45); yield;
    oscAdd(out, wavetable([[1, 1]]), cyc(236, L), 0.006, sr); yield;
    const lf = loopLfo(r, L, [1, 2]);
    for (let i = 0; i < n; i++) out[i] *= 1 + 0.08 * lf(i / sr); yield;
  } },
  // distant machinery: sub rumble with a slow throb, low hum tones, faint metallic ringing
  tone_industrial: { L: 8, sr: SR_LO, norm: ['rms', 0.22], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const rum = white(n, r); yield* filterG(rum, [['lp', 90], ['lp', 90]], sr, true); yield;
    const th = cyc(1.25, L);
    for (let i = 0; i < n; i++) rum[i] *= 1 + 0.35 * Math.pow(0.5 + 0.5 * Math.sin((TAU * th * i) / sr), 3); yield;
    mixRms(out, rum, 0.6); yield;
    oscAdd(out, wavetable([[1, 1]]), cyc(30, L), 0.12, sr); yield;
    oscAdd(out, wavetable([[1, 1]]), cyc(45, L), 0.07, sr, 0.3); yield;
    const ring = white(n, r); yield* filterG(ring, [['bp', 310, 30]], sr, true); yield;
    const ring2 = white(n, r); yield* filterG(ring2, [['bp', 523, 35]], sr, true); yield;
    const ring3 = white(n, r); yield* filterG(ring3, [['bp', 870, 30]], sr, true); yield;
    mixRms(out, ring, 0.03); mixRms(out, ring2, 0.02); mixRms(out, ring3, 0.012); yield;
  } },
  // near silence with a sub hum beating slowly
  tone_dark: { L: 8, sr: SR_LO, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    oscAdd(out, wavetable([[1, 1]]), cyc(38, L), 0.5, sr); yield;
    oscAdd(out, wavetable([[1, 1]]), cyc(38.5, L), 0.35, sr, 0.4); yield;
    oscAdd(out, wavetable([[1, 1]]), cyc(76, L), 0.06, sr, 0.1); yield;
    const lo = white(n, r); yield* filterG(lo, [['lp', 200], ['lp', 200]], sr, true); yield;
    mixRms(out, lo, rmsOf(out) * 0.25); yield;
  } },
  // damp, enclosed: slow lapping band and a low wash (drips are sprinkled live)
  tone_water: { L: 8, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const lap = white(n, r); yield* filterG(lap, [['bp', 550, 0.9]], sr, true); yield;
    const lf = loopLfo(r, L, [2, 3, 5, 7]);
    for (let i = 0; i < n; i++) lap[i] *= Math.max(0, 0.6 + 0.8 * lf(i / sr)); yield;
    const lo = white(n, r); yield* filterG(lo, [['lp', 160], ['lp', 160]], sr, true); yield;
    mixRms(out, lap, 0.3); mixRms(out, lo, 0.4); yield;
    for (let j = 0; j < 14; j++) S.bubble(r.range(0, L), 0.02, r.range(250, 700), r.range(0.02, 0.05), 0.2); yield;
  } },
  // wind and distant nothing
  tone_outdoor: { L: 12, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const gust = loopLfo(r, L, [1, 2, 3]);
    const g = (t) => clamp(0.55 + 0.45 * gust(t) * 1.5, 0.15, 1.1);
    const a = white(n, r); yield* svfG(a, 'lp', 0.7, (t) => 220 + 500 * g(t), sr, true); yield;
    const wh = white(n, r); yield* svfG(wh, 'bpn', 8, (t) => 600 + 300 * g(t), sr, true); yield;
    for (let i = 0; i < n; i++) { const e = g(i / sr); a[i] *= e; wh[i] *= e * e; } yield;
    const far = white(n, r); yield* filterG(far, [['lp', 60], ['lp', 60]], sr, true); yield;
    mixRms(out, a, 0.35); mixRms(out, wh, 0.04); mixRms(out, far, 0.2); yield;
  } },
  tone_school: { L: 8, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const air = white(n, r); yield* filterG(air, [['lp', 1500], ['hp', 180]], sr, true); yield;
    const lo = white(n, r); yield* filterG(lo, [['lp', 130], ['lp', 130]], sr, true); yield;
    mixRms(out, air, 0.32); mixRms(out, lo, 0.4); yield;
    oscAdd(out, wavetable([[2, 1], [4, 0.3]]), cyc(60, L), 0.02, sr); yield;
  } },
  tone_hotel: { L: 8, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const lo = white(n, r); yield* filterG(lo, [['lp', 250], ['lp', 250]], sr, true); yield;
    const air = white(n, r); yield* filterG(air, [['lp', 900], ['hp', 120]], sr, true); yield;
    mixRms(out, lo, 0.5); mixRms(out, air, 0.15); yield;
    oscAdd(out, wavetable([[1, 1], [2, 0.4]]), cyc(50, L), 0.035, sr); yield;
    const lf = loopLfo(r, L, [1, 2]);
    for (let i = 0; i < n; i++) out[i] *= 1 + 0.1 * lf(i / sr); yield;
  } },
  // almost nothing: a whisper of air and a faint ringing, like your own ears
  tone_void: { L: 8, norm: ['rms', 0.2], *gen(S, L) {
    const { out, r, sr } = S, n = out.length;
    const air = white(n, r); yield* filterG(air, [['lp', 500], ['lp', 500]], sr, true); yield;
    mixRms(out, air, 0.4); yield;
    oscAdd(out, wavetable([[1, 1]]), cyc(6200, L), (t) => 0.025 * (1 + 0.4 * Math.sin((TAU * t) / L)), sr); yield;
    oscAdd(out, wavetable([[1, 1]]), cyc(41, L), 0.08, sr); yield;
  } },
};

// ============================================================================ UI
export const UI_SOUNDS = {
  move: { dur: 0.1, gen(S) { S.tone(0, 0.5, { f0: 1320, att: 0.001, dec: 0.016, shape: 'tri' }).tone(0, 0.15, { f0: 2640, att: 0.001, dec: 0.008 }).filter([['lp', 5000]]); } },
  select: { dur: 0.4, gen(S) {
    S.tone(0, 0.45, { f0: 880, att: 0.001, dec: 0.035, shape: 'tri', dur: 0.12 }).tone(0.07, 0.45, { f0: 1320, att: 0.001, dec: 0.07, shape: 'tri' }).filter([['lp', 4500]]);
  } },
  back: { dur: 0.4, gen(S) {
    S.tone(0, 0.45, { f0: 990, att: 0.001, dec: 0.035, shape: 'tri', dur: 0.12 }).tone(0.07, 0.45, { f0: 660, att: 0.001, dec: 0.07, shape: 'tri' }).filter([['lp', 4000]]);
  } },
  save: { dur: 2.2, gen(S) {
    const chime = (f) => [[f, 1.1, 0.4], [f * 2, 0.45, 0.1], [f * 3.01, 0.25, 0.04]];
    S.ring(0.01, chime(523.25), 1).ring(0.11, chime(659.25), 0.85).ring(0.21, chime(783.99), 0.75).ring(0.4, chime(1046.5), 0.35);
    S.filter([['lp', 5000]]);
  } },
  note_open: { dur: 0.6, gen(S) {
    const r = S.r;
    S.add(crackle(r, { dur: 0.3, rate: 1400, att: 0.08, dec: 0.12, f: [['bp', 3500, 0.6]], sr: S.sr }), 0.01, 0.5)
      .add(svf(burst(r, { att: 0.08, dec: 0.08, dur: 0.4, sr: S.sr }), 'bpn', 1.5, (t) => 1500 + 3000 * Math.min(1, t / 0.2), S.sr), 0, 0.25);
  } },
  note_close: { dur: 0.45, gen(S) {
    const r = S.r;
    S.add(crackle(r, { dur: 0.18, rate: 1100, att: 0.03, dec: 0.08, f: [['bp', 3000, 0.6]], sr: S.sr }), 0.01, 0.45)
      .add(svf(burst(r, { att: 0.03, dec: 0.06, dur: 0.3, sr: S.sr }), 'bpn', 1.5, (t) => 3500 - 2200 * Math.min(1, t / 0.15), S.sr), 0, 0.25)
      .noise(0.16, 0.2, 0.0005, 0.008, [['lp', 900]]);
  } },
  // a heavy switch somewhere and the building's hum swelling up
  start: { dur: 3.0, *gen(S) {
    const { r, sr } = S, n = S.out.length;
    S.noise(0.01, 0.5, 0.0005, 0.02, [['lp', 600]]).thump(0.01, 0.6, 70, 50, 0.12).click(0.012, 0.15, 1500, 0.003);
    const b = ballast(n, sr, r, { buzz: 0.25, sizzle: 0.05 }); yield;
    mulInto(b, envelope(n, sr, [[0, 0], [0.15, 0], [1.2, 0.6], [2.0, 0.5], [3.0, 0]])); yield;
    yield* svfG(b, 'lp', 0.7, (t) => 300 + 1500 * smoothstep(0.1, 1.5, t), sr); yield;
    S.add(b, 0, 0.4); yield;
  } },
  error: { dur: 0.35, gen(S) {
    S.tone(0, 0.4, { f0: 147, att: 0.002, dec: 1, dur: 0.07, shape: 'sq' }).tone(0.11, 0.4, { f0: 147, att: 0.002, dec: 1, dur: 0.07, shape: 'sq' }).filter([['lp', 1200]]);
  } },
};

// sounds registered by other modules (levels): merged into the tables, built last unless wanted
const EXTRA_NAMES = new Set();
for (const [k, d] of Object.entries(EXTRA.shots)) { SHOTS[k] = d; EXTRA_NAMES.add(k); }
for (const [k, d] of Object.entries(EXTRA.loops)) { LOOPS[k] = d; EXTRA_NAMES.add('loop_' + k); }
for (const [k, d] of Object.entries(EXTRA.beds)) { BEDS[k] = d; EXTRA_NAMES.add(k); }
for (const [k, d] of Object.entries(EXTRA.ui)) { UI_SOUNDS[k] = d; EXTRA_NAMES.add('ui_' + k); }

// ============================================================================ bank
// Every buffer the engine needs, as lazy jobs: { name, sr, loop, kind, make() -> Float32Array,
// makeG() -> generator returning the same Float32Array }.
function job(name, sr, loop, kind, makeG) {
  const extra = EXTRA_NAMES.has(name) || EXTRA_NAMES.has(name.replace(/_\d+$/, ''));
  return { name, sr, loop, kind, extra, makeG, make: () => drain(makeG()) };
}

export function* bankJobs() {
  for (let s = 0; s < FOOT_NAMES.length; s++) {
    for (let k = 0; k < FOOT_VARIANTS; k++) yield job(`step_${s}_${k}`, SR, false, 'foot', () => footstepG(s, k));
  }
  for (const [name, d] of Object.entries(UI_SOUNDS)) {
    yield job('ui_' + name, SR, false, 'ui', function* () { const S = canvas(d.dur, SR, 'ui:' + name); yield* runGen(d, S); yield; return yield* finishShotG(S.out, SR, 0.85); });
  }
  for (const [name, d] of Object.entries(BEDS)) {
    const sr = d.sr || SR;
    yield job(name, sr, true, 'bed', function* () { const S = canvas(d.L, sr, 'bed:' + name, true); yield* runGen(d, S, d.L); yield; return yield* finishLoopG(S.out, sr, d.norm); });
  }
  for (const [name, d] of Object.entries(SHOTS)) {
    const sr = d.sr || SR;
    for (let k = 0; k < d.n; k++) {
      yield job(`${name}_${k}`, sr, false, 'shot', function* () { const S = canvas(d.dur, sr, `shot:${name}:${k}`); yield* runGen(d, S, k); yield; return yield* finishShotG(S.out, sr, d.peak ?? 0.9); });
    }
  }
  for (const [name, d] of Object.entries(LOOPS)) {
    const sr = d.sr || SR;
    yield job('loop_' + name, sr, true, 'loop', function* () { const S = canvas(d.L, sr, 'loop:' + name, true); yield* runGen(d, S, d.L); yield; return yield* finishLoopG(S.out, sr, d.norm); });
  }
}

// The bank in the order the engine wants it: what the first seconds of play need comes first
// (the hum, the air, the yellow room tone, footsteps, menu blips), the rest after.
const PRIORITY = [(j) => j.name === 'bed_hum', (j) => j.name === 'bed_hvac', (j) => j.name === 'tone_yellow',
  (j) => j.kind === 'foot', (j) => j.kind === 'ui', (j) => j.kind === 'bed' && !j.extra, (j) => j.kind === 'shot' && !j.extra,
  (j) => !j.extra, () => true];
export function bankQueue() {
  const rank = (j) => PRIORITY.findIndex((f) => f(j));
  return [...bankJobs()].map((j, i) => [rank(j), i, j]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((e) => e[2]);
}

export const SHOT_VARIANTS = Object.fromEntries(Object.entries(SHOTS).map(([k, d]) => [k, d.n]));
export const TONES = Object.keys(BEDS).filter((k) => k.startsWith('tone_')).map((k) => k.slice(5));


let JOBS = null;
// name -> job lookup (built on first use)
export function jobTable() {
  if (!JOBS) { JOBS = new Map(); for (const j of bankJobs()) JOBS.set(j.name, j); }
  return JOBS;
}
