// Spray-can sounds for the graffiti feature, synthesized offline from the engine seed like everything else.
//  - hiss: seamless white-noise loop with baked jet turbulence (fast, shallow random AM on two time scales)
//    and a faint atomization fizz. The runtime shapes it per cap (highpass -> peaking -> lowpass) and flow.
//  - rough: coarse wall-splatter crackle + a low-mid "whoosh" wash (fat caps, close range, feathering).
//  - sputter: a control loop for the valve sputter at low flow (gain modulation, stored as env - 1):
//    irregular bursts and gaps with short spit spikes.
//  - onset "pfft" (valve tick, the air in the actuator pushed out ahead of the paint with its band rising
//    as the jet establishes, the first droplets) and release (the jet collapsing, a few spits as the
//    valve seats).
//  - clacks: a steel mixing ball striking a liquid-filled tinplate can: sub-millisecond contact click,
//    damped dome/wall modes (1.2-4.5 kHz), weak higher modes, a dull knock, low-passed by the paint.
//  - slosh: liquid swell loop (band-limited noise + small gurgles) for shaking.
//  - equip / holster / actuator-cap swap / menu tick: fabric/leather rustle, lid pop, metal tap, can
//    clink, plastic snaps.
import {
  SVF, filt, fillWhite, fillPink, smoothRandom, makeLoop, normalizeRms, normalizePeak, addNoiseBurst,
  addMode, addGlideMode, addBubble, addCrackle, dcBlock, fadeOut, trimTail, clamp, rmsOf,
} from '../lib/dsp.js';
import { deriveRng, noiseGen } from '../lib/rng.js';

const NOY = async () => {};

/** RMS of the continuous loops (the runtime normalizes its levels against these). */
export const SPRAY_LOOP_RMS = { hiss: 0.15, rough: 0.12, slosh: 0.1 };

function fin(x, sr, peak = 0.9, hp = 40) {
  dcBlock(x, sr, hp);
  const y = trimTail(x, sr, 1e-4);
  fadeOut(y, Math.round(0.004 * sr));
  normalizePeak(y, peak);
  return y;
}

/** Movement envelope: smooth sum of gaussian bumps, peak 1, faded ends. */
function bumpEnv(n, sr, r, count, from = 0.15, to = 0.75) {
  const BL = 32;
  const nb = Math.ceil(n / BL) + 1;
  const coarse = new Float32Array(nb);
  const dur = n / sr;
  for (let k = 0; k < count; k++) {
    const c = r.range(from, to) * dur;
    const w = r.range(0.07, 0.2) * dur;
    const a = r.range(0.45, 1);
    for (let j = 0; j < nb; j++) { const u = ((j * BL) / sr - c) / w; coarse[j] += a * Math.exp(-0.5 * u * u); }
  }
  let m = 0;
  for (let j = 0; j < nb; j++) if (coarse[j] > m) m = coarse[j];
  const inv = m > 0 ? 1 / m : 0;
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i / BL) | 0;
    const f = (i - j * BL) / BL;
    env[i] = (coarse[j] + (coarse[Math.min(nb - 1, j + 1)] - coarse[j]) * f) * inv;
  }
  const nf = Math.min(n >> 2, Math.round(0.012 * sr));
  for (let i = 0; i < nf; i++) { const g = i / nf; env[i] *= g; env[n - 1 - i] *= g; }
  return env;
}

// ------------------------------------------------------------------ continuous loops
async function hissLoop(r, sr, y) {
  const L = 6;
  const N = Math.round(L * sr), X = Math.round(0.25 * sr);
  const n = N + X;
  const x = new Float32Array(n);
  fillWhite(x, r.seed32(), 1);
  await y();
  // jet turbulence: fast, shallow random amplitude fluctuation on two time scales
  const fast = smoothRandom(n, sr, 170, r);
  await y();
  const mid = smoothRandom(n, sr, 38, r);
  await y();
  for (let i = 0; i < n; i++) x[i] *= 1 + 0.12 * fast[i] + 0.07 * mid[i];
  // atomization fizz: dense, faint micro-crackle of droplets breaking up
  const fz = new Float32Array(n);
  addCrackle(fz, 0, sr, r, {
    dur: n / sr, rate: 2200, amp: 1, grainMin: 0.00004, grainMax: 0.00016, ampPow: 2.2, bigProb: 0.03,
    hp: 2500, lp: 15000, shape: () => 1,
  });
  await y();
  normalizeRms(fz, rmsOf(x) * 0.18);
  for (let i = 0; i < n; i++) x[i] += fz[i];
  const loop = makeLoop(x, N, X);
  await y();
  normalizeRms(loop, SPRAY_LOOP_RMS.hiss);
  return loop;
}

async function roughLoop(r, sr, y) {
  const L = 5;
  const N = Math.round(L * sr), X = Math.round(0.25 * sr);
  const n = N + X;
  const dur = n / sr;
  // splatter: coarse droplet impacts on the wall, density wandering
  const dens = smoothRandom(Math.ceil(dur * 50) + 2, 50, 3, r);
  const sp = new Float32Array(n);
  addCrackle(sp, 0, sr, r, {
    dur, rate: 1300, amp: 1, grainMin: 0.00006, grainMax: 0.0005, ampPow: 1.7, bigProb: 0.07, hp: 1000, lp: 9000,
    shape: (u) => 0.7 + 0.3 * dens[Math.min(dens.length - 1, (u * dur * 50) | 0)],
    ring: [1500, 6000], ringProb: 0.22, ringTau: [0.0003, 0.0012], ringAmp: 0.35,
  });
  await y();
  // whoosh: low-mid turbulent wash (air entrained by the jet, the jet deflected off the wall)
  const w = new Float32Array(n);
  fillPink(w, r.seed32(), 1);
  filt(w, 'bandpass', r.range(750, 950), 0.6, sr);
  filt(w, 'highpass', 220, 0.7, sr);
  await y();
  const am1 = smoothRandom(n, sr, 11, r);
  const am2 = smoothRandom(n, sr, 2.5, r);
  for (let i = 0; i < n; i++) w[i] *= 1 + 0.3 * am1[i] + 0.15 * am2[i];
  await y();
  // the wash sits well under the crackle: caps with a high rough level (fat) and close range bring it up
  normalizeRms(sp, 0.1);
  normalizeRms(w, 0.022);
  for (let i = 0; i < n; i++) sp[i] += w[i];
  dcBlock(sp, sr, 40);
  const loop = makeLoop(sp, N, X);
  await y();
  normalizeRms(loop, SPRAY_LOOP_RMS.rough);
  return loop;
}

/**
 * Valve sputter control loop (feathering): bursts of flow, gaps with a little residual hiss, partial dips and
 * short spit spikes. Smooth raised-cosine transitions (no clicks in the modulated hiss). Stored as env - 1 so
 * that gain = 1 + depth * value: depth 0 leaves the hiss steady.
 */
function sputterLoop(r, sr) {
  const L = 9;
  const N = Math.round(L * sr);
  const env = new Float32Array(N);
  const res0 = 0.12;
  let i = 0;
  let level = res0;
  const seg = (to, ramp, holdSec) => {
    const nr = Math.max(1, Math.round(ramp * sr));
    const nh = Math.round(holdSec * sr);
    const from = level;
    for (let k = 0; k < nr && i < N; k++, i++) env[i] = from + (to - from) * (0.5 - 0.5 * Math.cos((Math.PI * (k + 1)) / nr));
    for (let k = 0; k < nh && i < N; k++, i++) env[i] = to;
    level = to;
  };
  seg(res0, 0.002, r.range(0.01, 0.04));
  while (i < N - 0.35 * sr) {
    const spit = r.chance(0.4);
    if (spit) seg(r.range(2.0, 3.0), 0.0015, r.range(0.002, 0.006));
    seg(r.range(0.75, 1.15), spit ? 0.004 : r.range(0.002, 0.006), clamp(r.exp(0.07), 0.015, 0.3));
    if (r.chance(0.3)) seg(r.range(0.45, 0.7), 0.006, clamp(r.exp(0.04), 0.01, 0.12));
    seg(r.range(0.04, 0.22), r.range(0.003, 0.009), clamp(r.exp(0.05), 0.008, 0.2));
  }
  // settle back to the starting residual so the loop wraps seamlessly
  seg(res0, 0.012, (N - i) / sr);
  for (let k = 0; k < N; k++) env[k] -= 1;
  return env;
}

async function sloshLoop(r, sr, y) {
  const L = 4;
  const N = Math.round(L * sr), X = Math.round(0.3 * sr);
  const n = N + X;
  const x = new Float32Array(n);
  fillPink(x, r.seed32(), 1);
  filt(x, 'bandpass', r.range(480, 620), 0.75, sr);
  filt(x, 'lowpass', 1800, 0.7, sr);
  const am = smoothRandom(n, sr, 9, r);
  const am2 = smoothRandom(n, sr, 2, r);
  for (let i = 0; i < n; i++) { const a = 0.6 + 0.4 * am[i] + 0.2 * am2[i]; x[i] *= a > 0 ? a : 0; }
  await y();
  normalizeRms(x, 0.08);
  // gurgles: small bubbles moving in the paint
  let t = r.range(0, 0.05);
  while (t < n / sr - 0.05) {
    addBubble(x, Math.round(t * sr), r.logRange(260, 1300), r.range(1.1, 1.5), r.range(0.004, 0.014), r.range(0.02, 0.09), sr, 0.001);
    t += r.exp(1 / 30);
  }
  dcBlock(x, sr, 60);
  const loop = makeLoop(x, N, X);
  await y();
  normalizeRms(loop, SPRAY_LOOP_RMS.slosh);
  return loop;
}

// ------------------------------------------------------------------ valve onset / release
function onsetSound(r, sr) {
  const n = Math.round(0.13 * sr);
  const x = new Float32Array(n);
  const s0 = 2;
  // valve: the stem gasket unseats (tiny tick)
  addNoiseBurst(x, s0, sr, { dur: 0.002, attack: 0.00003, tau: r.range(0.00008, 0.0002), hp: 2500, lp: 12000, amp: r.range(0.25, 0.45), seed: r.seed32() });
  addMode(x, s0, r.range(2600, 4200), r.range(0.0006, 0.0014), r.range(0.06, 0.12), sr, 0);
  // "pf": the air in the actuator channel pushed out ahead of the paint; its band rises as the jet establishes
  const svf = new SVF(1000, 0.85, sr);
  const nz = noiseGen(r.seed32());
  const f0 = r.range(850, 1300), f1 = r.range(3000, 4200), tg = r.range(0.012, 0.02);
  const d0 = s0 + Math.round(r.range(0.0008, 0.002) * sr);
  const att = r.range(0.0015, 0.003), dec = r.range(0.016, 0.028);
  const amp = r.range(0.7, 1);
  for (let i = 0; d0 + i < n; i++) {
    const t = i / sr;
    if ((i & 15) === 0) svf.set(f1 + (f0 - f1) * Math.exp(-t / tg), 0.85, sr);
    svf.tick(nz());
    const e = (1 - Math.exp(-t / att)) * Math.exp(-t / dec);
    x[d0 + i] += (svf.bp + 0.25 * svf.hp) * e * amp;
  }
  // the first droplets spitting out
  addCrackle(x, d0 + Math.round(0.002 * sr), sr, r, {
    dur: r.range(0.02, 0.045), rate: r.range(250, 600), amp: r.range(0.25, 0.5), grainMin: 0.0001, grainMax: 0.0006,
    hp: 1400, lp: 7000, shape: (u) => 1 - u,
  });
  return fin(x, sr, 0.9, 60);
}

function releaseSound(r, sr) {
  const n = Math.round(0.34 * sr);
  const x = new Float32Array(n);
  // the jet collapsing: a short puff whose band falls as the pressure drops
  const svf = new SVF(3000, 0.8, sr);
  const nz = noiseGen(r.seed32());
  const fa = r.range(3000, 4200), fb = r.range(900, 1400), tg = r.range(0.025, 0.045);
  const dec = r.range(0.02, 0.035);
  const m = Math.min(n, Math.round(0.2 * sr));
  for (let i = 0; i < m; i++) {
    const t = i / sr;
    if ((i & 15) === 0) svf.set(fb + (fa - fb) * Math.exp(-t / tg), 0.8, sr);
    svf.tick(nz());
    x[i] += svf.bp * Math.exp(-t / dec) * Math.min(1, t / 0.002) * 0.5;
  }
  // sputter: a few irregular spits as the valve seats
  const ns = r.int(1, 4);
  let t = r.range(0.012, 0.03);
  let a = r.range(0.7, 1);
  for (let k = 0; k < ns; k++) {
    const st = Math.round(t * sr);
    const d = r.range(0.003, 0.012);
    addNoiseBurst(x, st, sr, { dur: d * 3, attack: 0.0003, tau: d / 2.5, bp: r.range(1500, 4500), bpQ: 0.8, amp: a * 0.6, seed: r.seed32() });
    addCrackle(x, st, sr, r, { dur: d, rate: 1500, amp: a * 0.5, hp: 1200, lp: 8000, grainMax: 0.0004, shape: (u) => 1 - u });
    if (r.chance(0.5)) addBubble(x, st + Math.round(r.range(0.001, 0.004) * sr), r.logRange(2200, 5000), r.range(1.1, 1.4), r.range(0.0012, 0.003), a * 0.25, sr);
    t += r.range(0.018, 0.06) * (1 + 0.5 * k);
    a *= r.range(0.45, 0.75);
  }
  // the valve seats: tiny tick
  if (r.chance(0.7)) {
    addNoiseBurst(x, Math.round(r.range(0.03, 0.07) * sr), sr, { dur: 0.002, attack: 0.00003, tau: 0.00012, hp: 3000, lp: 11000, amp: 0.15, seed: r.seed32() });
  }
  return fin(x, sr, 0.9, 60);
}

// ------------------------------------------------------------------ the can and its mixing ball
/** One tinplate aerosol can (65 mm), liquid-filled: wall ring + bottom-dome modes, heavily damped. */
function canBody(r, o = {}) {
  const k = o.scale ?? 1;
  const wall = [], dome = [];
  for (let i = 0; i < 4; i++) wall.push({ f: r.logRange(1200, 2600) * k, tau: r.range(0.006, 0.016) });
  for (let i = 0; i < 4; i++) dome.push({ f: r.logRange(2300, 4500) * k, tau: r.range(0.004, 0.012) });
  const high = [{ f: r.range(5200, 6500) * k, tau: r.range(0.002, 0.005) }, { f: r.range(7000, 8800) * k, tau: r.range(0.0015, 0.004) }];
  return { wall, dome, high, thump: r.range(260, 420) };
}

/** Ball (steel) strikes the can from inside: bright contact click + body modes weighted by where it hits. */
function addClack(x, sr, r, s0, body, amp, hard = r.range(0.6, 1), where = r.chance(0.6) ? 'dome' : 'wall') {
  addNoiseBurst(x, s0, sr, {
    dur: 0.0015, attack: 0.00002, tau: 0.00006 + 0.00016 * (1 - hard), hp: 1800, lp: 7000 + 6000 * hard, amp: amp * 0.9 * hard, seed: r.seed32(),
  });
  const wd = where === 'dome' ? 1 : 0.45;
  const ww = where === 'dome' ? 0.45 : 1;
  for (const m of body.dome) addMode(x, s0, m.f * r.range(0.996, 1.004), m.tau * r.range(0.8, 1.2), amp * wd * r.range(0.25, 0.7), sr, 0);
  for (const m of body.wall) addMode(x, s0, m.f * r.range(0.996, 1.004), m.tau * r.range(0.8, 1.2), amp * ww * r.range(0.25, 0.7), sr, 0);
  for (const m of body.high) addMode(x, s0, m.f * r.range(0.995, 1.005), m.tau, amp * hard * r.range(0.08, 0.2), sr, 0);
  // dull knock of the ball through the paint / the can body in the hand
  addMode(x, s0, body.thump * r.range(0.95, 1.05), r.range(0.003, 0.006), amp * r.range(0.12, 0.25), sr, 0);
}

function clackSound(r, sr, body) {
  const x = new Float32Array(Math.round(0.09 * sr));
  const s0 = 2;
  const hard = r.range(0.55, 1);
  addClack(x, sr, r, s0, body, 1, hard);
  // the ball chatters against the dome (tiny secondary contact)
  if (r.chance(0.35)) addClack(x, sr, r, s0 + Math.round(r.range(0.0006, 0.003) * sr), body, r.range(0.2, 0.45), hard * 0.8);
  // muffled slightly by the liquid
  filt(x, 'lowpass', r.range(8500, 11000), 0.7, sr);
  return fin(x, sr, 0.9, 80);
}

// ------------------------------------------------------------------ handling
/** Fabric/leather rustle: friction noise with movement bumps, fibre crackle and leather creaks. */
function addRustle(x, sr, r, t0, dur, o = {}) {
  const s0 = Math.round(t0 * sr);
  const n = Math.min(x.length - s0, Math.round(dur * sr));
  if (n <= 16) return;
  const env = bumpEnv(n, sr, r, o.bumps ?? r.int(2, 3));
  const rough = smoothRandom(n, sr, r.range(80, 200), r);
  const nz = noiseGen(r.seed32());
  const sw = new Float32Array(n);
  for (let i = 0; i < n; i++) { const g = 0.4 + 0.7 * rough[i]; sw[i] = g > 0 ? nz() * g * env[i] : 0; }
  filt(sw, 'highpass', o.hp ?? 450, 0.7, sr);
  filt(sw, 'bandpass', o.bp ?? 2000, o.bpQ ?? 0.5, sr);
  filt(sw, 'lowpass', o.lp ?? 7000, 0.7, sr);
  const cr = new Float32Array(n);
  addCrackle(cr, 0, sr, r, {
    dur: n / sr, rate: o.crackleRate ?? r.range(70, 160), amp: 1, grainMin: 0.0002, grainMax: 0.0012, hp: 900, lp: 6500,
    shape: (u) => env[Math.min(n - 1, (u * n) | 0)], ring: [700, 2200], ringProb: o.creak ?? 0.35, ringTau: [0.002, 0.006], ringAmp: 0.8,
  });
  normalizeRms(sw, 0.1);
  normalizeRms(cr, 0.1 * (o.crackle ?? 0.5));
  const a = o.amp ?? 1;
  for (let i = 0; i < n; i++) x[s0 + i] += (sw[i] + cr[i]) * a;
}

function addPlasticClick(x, sr, r, s0, amp, o = {}) {
  addNoiseBurst(x, s0, sr, { dur: 0.003, attack: 0.00003, tau: r.range(0.0001, 0.00028), hp: o.hp ?? 1600, lp: o.lp ?? 11000, amp: amp * 0.8, seed: r.seed32() });
  const nm = r.int(2, 4);
  for (let k = 0; k < nm; k++) addMode(x, s0, r.logRange(o.lo ?? 2200, o.hi ?? 6500), r.range(0.0005, 0.0022), amp * r.range(0.12, 0.35), sr, 0);
  addMode(x, s0, r.range(o.tlo ?? 800, o.thi ?? 1500), r.range(0.0015, 0.0035), amp * r.range(0.15, 0.35), sr, 0);
}

/** The lid's skirt springs off the rim bead: two quick clicks, the cavity "pok", a tiny puff, the rim rings. */
function addLidPop(x, sr, r, s0, amp, body) {
  addPlasticClick(x, sr, r, s0, amp, { lo: 1800, hi: 5200 });
  addPlasticClick(x, sr, r, s0 + Math.round(r.range(0.002, 0.006) * sr), amp * r.range(0.3, 0.6), { lo: 2000, hi: 6000 });
  addGlideMode(x, s0 + 2, r.range(800, 1100), r.range(1250, 1700), r.range(0.004, 0.008), r.range(0.006, 0.011), amp * r.range(0.4, 0.6), sr);
  addNoiseBurst(x, s0 + Math.round(0.001 * sr), sr, { dur: 0.025, attack: 0.001, tau: r.range(0.003, 0.006), bp: r.range(1400, 2400), bpQ: 0.9, amp: amp * 0.2, seed: r.seed32() });
  for (const m of body.wall) addMode(x, s0, m.f, m.tau * 1.4, amp * r.range(0.03, 0.08), sr, 0);
}

/** The can taps a buckle / ring: light metallic tick, the body rings briefly (held, so damped). */
function addMetalTap(x, sr, r, s0, amp, body) {
  addNoiseBurst(x, s0, sr, { dur: 0.002, attack: 0.00002, tau: 0.00008, hp: 2500, lp: 12000, amp: amp * 0.6, seed: r.seed32() });
  for (const m of body.dome) addMode(x, s0, m.f * r.range(0.997, 1.003), m.tau * 1.4, amp * r.range(0.15, 0.35), sr, 0);
  for (const m of body.wall) addMode(x, s0, m.f * r.range(0.997, 1.003), m.tau * 1.4, amp * r.range(0.1, 0.25), sr, 0);
  for (const m of body.high) addMode(x, s0, m.f, m.tau * 1.4, amp * r.range(0.1, 0.2), sr, 0);
}

/** Two cans touching in the bag: a rounded contact, both bodies ring; the other one is emptier (rings longer). */
function addClink(x, sr, r, s0, amp, a, b) {
  addNoiseBurst(x, s0, sr, { dur: 0.002, attack: 0.00008, tau: 0.0002, hp: 1500, lp: 6500, amp: amp * 0.35, seed: r.seed32() });
  for (const m of a.dome) addMode(x, s0, m.f, m.tau * 1.3, amp * r.range(0.08, 0.2), sr, 0);
  for (const m of a.wall) addMode(x, s0, m.f, m.tau * 1.3, amp * r.range(0.08, 0.2), sr, 0);
  for (const m of b.dome) addMode(x, s0, m.f, m.tau * 3.5, amp * r.range(0.1, 0.22), sr, 0);
  for (const m of b.wall) addMode(x, s0, m.f, m.tau * 3.5, amp * r.range(0.1, 0.22), sr, 0);
}

function equipSound(r, sr, body) {
  const x = new Float32Array(Math.round(0.85 * sr));
  // pulled out of the jacket pocket / bag
  const tr = r.range(0.32, 0.42);
  addRustle(x, sr, r, 0.004, tr, { bp: r.range(1400, 2600), hp: 400, lp: 6500, creak: r.range(0.2, 0.5) });
  // the ball rolls and knocks once as the can tips up
  addClack(x, sr, r, Math.round(r.range(0.18, tr) * sr), body, r.range(0.12, 0.25), 0.4);
  // lid off (or, sometimes, a light tap of the can against a buckle)
  const tl = Math.round((tr + r.range(0.06, 0.14)) * sr);
  if (r.chance(0.7)) addLidPop(x, sr, r, tl, r.range(0.7, 1), body);
  else addMetalTap(x, sr, r, tl, r.range(0.45, 0.7), body);
  return fin(x, sr, 0.9, 50);
}

function holsterSound(r, sr, body) {
  const x = new Float32Array(Math.round(0.85 * sr));
  // soft clink: it touches another can in the bag (sometimes a second, lighter touch)
  const other = canBody(r, { scale: r.range(0.92, 1.08) });
  const tc = r.range(0.04, 0.1);
  addClink(x, sr, r, Math.round(tc * sr), r.range(0.55, 0.8), body, other);
  if (r.chance(0.55)) addClink(x, sr, r, Math.round((tc + r.range(0.03, 0.08)) * sr), r.range(0.15, 0.3), body, other);
  // slid into the pocket / bag
  addRustle(x, sr, r, r.range(0.02, 0.07), r.range(0.36, 0.5), { bp: r.range(1200, 2300), hp: 380, lp: 6000, creak: r.range(0.15, 0.4), amp: 0.85 });
  // settles: a dull thump
  const st = Math.round(r.range(0.36, 0.5) * sr);
  addNoiseBurst(x, st, sr, { dur: 0.05, attack: 0.002, tau: 0.01, lp: 500, hp: 70, amp: 0.25, seed: r.seed32() });
  addMode(x, st, r.range(120, 200), r.range(0.008, 0.014), 0.2, sr, 0);
  return fin(x, sr, 0.9, 50);
}

function capSound(r, sr) {
  const x = new Float32Array(Math.round(0.3 * sr));
  // pull the old actuator off the stem: soft tick + a short squeak of plastic on the stem
  addPlasticClick(x, sr, r, 2, r.range(0.3, 0.45), { lo: 2000, hi: 5000 });
  addNoiseBurst(x, 2 + Math.round(0.002 * sr), sr, { dur: r.range(0.02, 0.04), attack: 0.003, tau: 0.008, bp: r.range(2500, 3800), bpQ: 6, amp: 0.12, seed: r.seed32() });
  // push the new one on: crisp snap (two latching contacts)
  const st = Math.round(r.range(0.1, 0.16) * sr);
  addPlasticClick(x, sr, r, st, 1, { lo: 2500, hi: 7500 });
  addPlasticClick(x, sr, r, st + Math.round(r.range(0.0007, 0.002) * sr), r.range(0.4, 0.7), { lo: 2500, hi: 7500 });
  return fin(x, sr, 0.9, 80);
}

/** Soft tactile tick (dial detent); open is a touch higher than close. */
function menuTick(r, sr, open) {
  const x = new Float32Array(Math.round(0.05 * sr));
  addNoiseBurst(x, 2, sr, { dur: 0.0015, attack: 0.00005, tau: 0.00015, hp: 1500, lp: 7000, amp: 0.5, seed: r.seed32() });
  addMode(x, 2, open ? r.range(2900, 3400) : r.range(2000, 2400), 0.0018, 0.35, sr, 0);
  addMode(x, 2, open ? r.range(1500, 1800) : r.range(1000, 1250), 0.003, 0.25, sr, 0);
  return fin(x, sr, 0.9, 100);
}

// ------------------------------------------------------------------ bank
/**
 * Synthesize all spray-can material. Returns Float32Arrays plus their sample rates:
 * { rates: {name: Hz}, hiss, rough, sputter, slosh, onset[], release[], clack[], equip[], holster[], cap[], menuOpen[], menuClose[] }
 */
export async function synthSpray(seed, sr, y = NOY) {
  const lo = Math.min(32000, sr);
  const out = { rates: {} };
  const put = (name, v, rate) => { out[name] = v; out.rates[name] = rate; };
  put('hiss', await hissLoop(deriveRng(seed, 'spray-hiss'), sr, y), sr);
  await y();
  put('rough', await roughLoop(deriveRng(seed, 'spray-rough'), lo, y), lo);
  await y();
  put('sputter', sputterLoop(deriveRng(seed, 'spray-sputter'), 8000), 8000);
  put('slosh', await sloshLoop(deriveRng(seed, 'spray-slosh'), Math.min(16000, sr), y), Math.min(16000, sr));
  await y();
  const rv = deriveRng(seed, 'spray-valve');
  const bank = (count, fn) => { const a = []; for (let i = 0; i < count; i++) a.push(fn(i)); return a; };
  put('onset', bank(6, () => onsetSound(rv, sr)), sr);
  put('release', bank(8, () => releaseSound(rv, sr)), sr);
  await y();
  const body = canBody(deriveRng(seed, 'spray-can'));
  const rc = deriveRng(seed, 'spray-clack');
  put('clack', bank(16, () => clackSound(rc, sr, body)), sr);
  await y();
  const rh = deriveRng(seed, 'spray-handling');
  put('equip', bank(4, () => equipSound(rh, lo, body)), lo);
  await y();
  put('holster', bank(4, () => holsterSound(rh, lo, body)), lo);
  await y();
  put('cap', bank(5, () => capSound(rh, sr)), sr);
  put('menuOpen', bank(3, () => menuTick(rh, sr, true)), sr);
  put('menuClose', bank(3, () => menuTick(rh, sr, false)), sr);
  await y();
  return out;
}
