// Dead County audio — reusable synthesis building blocks ("instruments").
// Every function takes a Synth `s` (see dsp.js) plus an options object and builds a small node graph
// inside the (offline) context, scheduled at option `t` (seconds). Output goes to `o.dest || s.out`.

import { crackleBuffer } from './dsp.js';

const out = (s, o) => o.dest || s.out;

/** Filter list → connected chain. Items: BiquadFilterNode or [type, freq, Q, gainDb]. */
function filterChain(s, src, list) {
  let node = src;
  const made = [];
  for (const fd of list || []) {
    const f = Array.isArray(fd) ? s.f(fd[0], fd[1], fd[2] ?? 0.7071, fd[3] ?? 0) : fd;
    node.connect(f.in || f);
    node = f.out || f;
    made.push(f);
  }
  return { node, made };
}

/**
 * Noise burst with percussive envelope.
 * o: t, kind ('white'|'pink'|'brown'), a (attack), hold, tau (decay time-constant), peak, filters,
 *    fenv: [[t, freq, kind]] automation of the first filter's frequency, rate (playback rate of noise)
 */
export function burst(s, o) {
  const t = o.t ?? 0;
  const a = o.a ?? 0.001, tau = o.tau ?? 0.05, hold = o.hold ?? 0;
  const end = o.end ?? (o.env ? o.env[o.env.length - 1][0] + 0.02 : t + a + hold + tau * 9 + 0.01);
  const src = s.noise(o.kind || 'white', t, end, o.rate ?? 1);
  const g = s.g(0);
  if (o.env) s.env(g.gain, o.env);
  else s.perc(g.gain, t, o.peak ?? 1, a, tau, hold);
  const { node, made } = filterChain(s, src, o.filters);
  if (o.fenv && made[0]) s.env(made[0].frequency, o.fenv);
  node.connect(g);
  g.connect(out(s, o));
  return { src, g, filters: made, end };
}

/**
 * Oscillator with pitch glide + percussive envelope.
 * o: t, type, f, f1 (end freq), glide (exp ramp time) or glideTau (setTarget), a, hold, tau, peak, filters
 */
export function tone(s, o) {
  const t = o.t ?? 0;
  const a = o.a ?? 0.002, tau = o.tau ?? 0.1, hold = o.hold ?? 0;
  const end = o.end ?? (o.env ? o.env[o.env.length - 1][0] + 0.02 : t + a + hold + tau * 9 + 0.01);
  const osc = s.osc(o.type || 'sine', o.f, t, end);
  if (o.f1 && o.f1 !== o.f) {
    osc.frequency.setValueAtTime(o.f, t);
    if (o.glideTau) osc.frequency.setTargetAtTime(o.f1, t, o.glideTau);
    else osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? 0.1));
  }
  if (o.fenvOsc) s.env(osc.frequency, o.fenvOsc);
  const g = s.g(0);
  if (o.env) s.env(g.gain, o.env);
  else s.perc(g.gain, t, o.peak ?? 1, a, tau, hold);
  const { node } = filterChain(s, osc, o.filters);
  node.connect(g);
  g.connect(out(s, o));
  return { osc, g, end };
}

// Mode tables: [frequency ratio, decay multiplier, gain]
export const MODES = {
  metal: [[1, 1, 1], [1.483, 0.85, 0.7], [2.031, 0.7, 0.55], [2.571, 0.6, 0.45], [3.214, 0.5, 0.35], [3.93, 0.42, 0.25], [4.62, 0.35, 0.18]],
  bar: [[1, 1, 1], [2.756, 0.6, 0.5], [5.404, 0.35, 0.3], [8.933, 0.2, 0.15]],
  bell: [[0.5, 1.3, 0.4], [1, 1, 1], [1.183, 0.8, 0.6], [1.506, 0.7, 0.5], [2, 0.6, 0.4], [2.514, 0.45, 0.3], [2.662, 0.4, 0.25], [3.011, 0.35, 0.2]],
  glass: [[1, 1, 1], [2.32, 0.7, 0.6], [4.25, 0.5, 0.4], [6.63, 0.35, 0.25]],
  wood: [[1, 1, 1], [2.11, 0.5, 0.5], [3.62, 0.3, 0.3], [5.1, 0.2, 0.15]],
  brass: [[1, 1, 1], [1.72, 0.7, 0.6], [2.95, 0.5, 0.4], [4.1, 0.35, 0.25]],
  hollow: [[1, 1, 1], [1.59, 0.7, 0.5], [2.14, 0.5, 0.4], [2.65, 0.4, 0.3], [3.16, 0.3, 0.2]],
};

/**
 * Modal resonator: sum of decaying sines.
 * o: t, f (base freq), modes (table or name), tau (base decay), peak, a, jit (random detune), dest
 */
export function modal(s, o) {
  const t = o.t ?? 0;
  const modes = typeof o.modes === 'string' ? MODES[o.modes] : o.modes || MODES.metal;
  const bus = s.g(o.peak ?? 1);
  const jit = o.jit ?? 0.015;
  const n = Math.min(modes.length, o.max ?? 99);
  for (let i = 0; i < n; i++) {
    const [ratio, dk, gain] = modes[i];
    const f = o.f * ratio * (1 + (s.r() * 2 - 1) * jit);
    if (f > s.sr * 0.45 || f < 20) continue;
    tone(s, { t, f, a: o.a ?? 0.0006, tau: (o.tau ?? 0.2) * dk, peak: gain * (0.7 + 0.3 * s.r()), dest: bus });
  }
  bus.connect(out(s, o));
  return bus;
}

/**
 * Filtered noise sweep ("whoosh").
 * o: t, dur, f0, fmid, f1 (bandpass centre path), peakAt (0..1), q, peak, kind, body (lowpassed layer gain)
 */
export function whoosh(s, o) {
  const t = o.t ?? 0, dur = o.dur;
  const end = t + dur + 0.02;
  const src = s.noise(o.kind || 'pink', t, end);
  const bp = s.bp(o.f0, o.q ?? 1.1);
  const pk = t + dur * (o.peakAt ?? 0.45);
  const fmid = o.fmid ?? o.f0 * 2;
  s.env(bp.frequency, [[t, o.f0], [pk, fmid, 'e'], [t + dur, o.f1 ?? o.f0, 'e']]);
  const g = s.g(0);
  const P = o.peak ?? 1;
  s.env(g.gain, [
    [t, 0],
    [t + (pk - t) * 0.55, P * 0.35],
    [pk, P],
    [pk + (t + dur - pk) * 0.35, P * 0.4],
    [t + dur, 0],
  ]);
  s.chain(src, bp, g, out(s, o));
  if (o.body) {
    const src2 = s.noise('brown', t, end);
    const lp = s.lp(o.bodyF ?? 400, 0.7);
    const g2 = s.g(0);
    s.env(g2.gain, [[t, 0], [pk, o.body], [t + dur, 0]]);
    s.chain(src2, lp, g2, out(s, o));
  }
  return g;
}

/**
 * Mechanical click: tight band-passed noise tick + optional metallic ring + optional low body.
 * o: t, f, q, tau, peak, ring (decay s), ringGain, ringF, body (gain), bodyF
 */
export function click(s, o) {
  const t = o.t ?? 0;
  const f = o.f ?? 3000;
  const peak = o.peak ?? 1;
  burst(s, { t, kind: 'white', a: 0.0002, tau: o.tau ?? 0.0025, peak, filters: [['bandpass', f, o.q ?? 1.4]], dest: o.dest });
  if (o.hiss) burst(s, { t, kind: 'white', a: 0.0001, tau: 0.0008, peak: peak * o.hiss, filters: [['highpass', 6000]], dest: o.dest });
  if (o.ring) {
    modal(s, { t, f: o.ringF ?? f * 0.8, modes: o.modes || 'metal', tau: o.ring, peak: peak * (o.ringGain ?? 0.25), max: 5, dest: o.dest });
  }
  if (o.body) {
    const bf = o.bodyF ?? 220;
    tone(s, { t, f: bf, f1: bf * 0.6, glide: 0.02, a: 0.0008, tau: o.bodyTau ?? 0.012, peak: peak * o.body, dest: o.dest });
  }
}

/**
 * Low impact: pitch-dropping sine + lowpassed noise.
 * o: t, f, f1, glide, tau, peak, noise, noiseLp, noiseTau, kind
 */
export function thud(s, o) {
  const t = o.t ?? 0;
  tone(s, { t, type: o.type || 'sine', f: o.f ?? 90, f1: o.f1 ?? 45, glideTau: o.glide ?? 0.03, a: o.a ?? 0.0015, tau: o.tau ?? 0.08, peak: o.peak ?? 1, dest: o.dest });
  if (o.noise) {
    burst(s, { t, kind: o.kind || 'pink', a: 0.0008, tau: o.noiseTau ?? 0.03, peak: o.noise, filters: [['lowpass', o.noiseLp ?? 600, 0.7]], dest: o.dest });
  }
}

/**
 * Sparse grain texture rendered into a buffer.
 * o: t, dur, rate, gmin, gmax, pow, density (fn x01→0..1), ping/ping2, filters, peak, ampEnv [[x01, v, kind]]
 */
export function crackle(s, o) {
  const t = o.t ?? 0, dur = o.dur;
  const buf = crackleBuffer(s.sr, dur, { rate: o.rate, gmin: o.gmin, gmax: o.gmax, pow: o.pow, env: o.density, ping: o.ping, ping2: o.ping2, decay: o.decay }, s.r);
  const src = s.src(buf, t, o.rate2 ?? 1);
  const P = o.peak ?? 1;
  const g = s.g(P);
  if (o.ampEnv) s.env(g.gain, o.ampEnv.map(([x, v, k, tau]) => [t + x * dur, v * P, k, tau]));
  const { node } = filterChain(s, src, o.filters);
  node.connect(g);
  g.connect(out(s, o));
  return g;
}

/**
 * Bubbles: rising sine chirps (Minnaert-style).
 * o: t, dur, count, fmin, fmax, peak, rise, len
 */
export function bubbles(s, o) {
  const t = o.t ?? 0;
  const bus = s.g(o.peak ?? 1);
  for (let i = 0; i < o.count; i++) {
    const r = s.r();
    const bt = t + Math.pow(s.r(), o.skew ?? 1) * o.dur;
    const f = o.fmin * Math.pow(o.fmax / o.fmin, r);
    const len = (o.len ?? 0.05) * (1.3 - r * 0.7);
    tone(s, { t: bt, f, f1: f * (o.rise ?? 1.7), glide: len, a: 0.0015, tau: len * 0.45, peak: 0.3 + 0.7 * s.r(), dest: bus });
  }
  bus.connect(out(s, o));
  return bus;
}

/**
 * Stick-slip friction creak: low-rate sawtooth pulses exciting resonant band-passes.
 * o: t, dur, rate0, rateMid, rate1, res [[f, Q, gain]], peak, jitter (cents), env [[x01, v]], flutter
 */
export function creak(s, o) {
  const t = o.t ?? 0, dur = o.dur;
  const end = t + dur + 0.05;
  const src = s.osc('sawtooth', o.rate0, t, end);
  const rm = o.rateMid ?? Math.sqrt(o.rate0 * o.rate1);
  s.env(src.frequency, [[t, o.rate0], [t + dur * (o.midAt ?? 0.5), rm, 'e'], [t + dur, o.rate1, 'e']]);
  if (o.jitter) s.randCtl(t, dur, o.jitterRate ?? 16, -o.jitter, o.jitter).connect(src.detune);
  const bus = s.g(1);
  const hp = s.hp(o.hp ?? 200, 0.7);
  src.connect(hp);
  for (const [f, Q, gg] of o.res) {
    const b = s.bp(f, Q);
    const bg = s.g(gg);
    s.chain(hp, b, bg, bus);
  }
  const g = s.g(0);
  const P = o.peak ?? 1;
  const ep = o.env || [[0, 0], [0.06, 1], [0.6, 0.8], [0.85, 0.9], [1, 0]];
  s.env(g.gain, ep.map(([x, v]) => [t + x * dur, v * P]));
  if (o.flutter) {
    const fl = s.g(1 - o.flutter);
    s.randCtl(t, dur, o.flutterRate ?? 22, 0, o.flutter).connect(fl.gain);
    s.chain(bus, fl, g, out(s, o));
  } else s.chain(bus, g, out(s, o));
  return g;
}

/**
 * Friction scrape: noise through a bandpass with fast random amplitude modulation.
 * o: t, dur, f, f1, q, peak, rough (0..1), roughRate, kind, env [[x01, v]]
 */
export function scrape(s, o) {
  const t = o.t ?? 0, dur = o.dur;
  const src = s.noise(o.kind || 'white', t, t + dur + 0.02);
  const bp = s.bp(o.f, o.q ?? 2);
  if (o.f1) s.env(bp.frequency, [[t, o.f], [t + dur, o.f1, 'e']]);
  const am = s.g(1 - (o.rough ?? 0.6));
  s.randCtl(t, dur, o.roughRate ?? 120, 0, o.rough ?? 0.6, false).connect(am.gain);
  const g = s.g(0);
  const P = o.peak ?? 1;
  const ep = o.env || [[0, 0], [0.15, 1], [0.8, 0.8], [1, 0]];
  s.env(g.gain, ep.map(([x, v]) => [t + x * dur, v * P]));
  s.chain(src, bp, am, g, out(s, o));
  return g;
}

/** Plucked string (bow / crossbow twang). o: t, f, tau, peak, bright (lp start), type */
export function pluck(s, o) {
  const t = o.t ?? 0;
  const tau = o.tau ?? 0.12;
  const end = t + tau * 9;
  const osc = s.osc(o.type || 'sawtooth', o.f, t, end);
  osc.frequency.setValueAtTime(o.f * (o.bend ?? 1.04), t);
  osc.frequency.setTargetAtTime(o.f, t, 0.01);
  const lp = s.lp(o.bright ?? 3000, o.q ?? 2);
  s.env(lp.frequency, [[t, o.bright ?? 3000], [t + tau * 3, (o.dark ?? 300), 'e']]);
  const g = s.g(0);
  s.perc(g.gain, t, o.peak ?? 1, 0.001, tau);
  s.chain(osc, lp, g, out(s, o));
  return g;
}

/** Bird / generic sine chirp: frequency path [[dt, f], ...] (relative seconds) + envelope. */
export function chirp(s, o) {
  const t = o.t ?? 0;
  const path = o.path;
  const dur = path[path.length - 1][0];
  const osc = s.osc('sine', path[0][1], t, t + dur + 0.02);
  s.env(osc.frequency, path.map(([dt, f], i) => [t + dt, f, i ? 'e' : undefined]));
  const g = s.g(0);
  const P = o.peak ?? 1;
  const ep = o.env || [[0, 0], [0.15, 1], [0.7, 0.8], [1, 0]];
  s.env(g.gain, ep.map(([x, v]) => [t + x * dur, v * P]));
  osc.connect(g);
  g.connect(out(s, o));
  if (o.harm) {
    // 2nd harmonic for a bit of timbre
    const o2 = s.osc('sine', path[0][1] * 2, t, t + dur + 0.02);
    s.env(o2.frequency, path.map(([dt, f], i) => [t + dt, Math.min(f * 2, s.sr * 0.45), i ? 'e' : undefined]));
    const g2 = s.g(o.harm);
    o2.connect(g2);
    g2.connect(g);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Formant voice
// ---------------------------------------------------------------------------------------------
// [frequency, relative gain, bandwidth Hz] for F1..F4
export const VOWELS = {
  a: [[800, 1, 80], [1150, 0.63, 90], [2900, 0.32, 120], [3900, 0.12, 130]],
  e: [[530, 1, 60], [1840, 0.5, 100], [2480, 0.35, 120], [3500, 0.12, 150]],
  i: [[300, 1, 50], [2300, 0.35, 100], [3000, 0.3, 120], [3700, 0.1, 150]],
  o: [[450, 1, 70], [800, 0.6, 80], [2830, 0.15, 100], [3500, 0.08, 130]],
  u: [[325, 1, 50], [700, 0.4, 60], [2530, 0.1, 170], [3500, 0.05, 180]],
  uh: [[640, 1, 80], [1190, 0.55, 90], [2390, 0.28, 120], [3400, 0.1, 130]],
  er: [[490, 1, 70], [1350, 0.5, 90], [1690, 0.42, 110], [3300, 0.1, 130]],
  ae: [[660, 1, 80], [1720, 0.6, 100], [2410, 0.32, 120], [3500, 0.12, 140]],
  aw: [[570, 1, 80], [840, 0.62, 80], [2410, 0.2, 110], [3400, 0.08, 130]],
};

/**
 * Formant voice synthesiser (zombies, player, animals).
 * o: t, dur, f0, contour [[x01, semitones]], wave, beat (cents detune of 2nd osc), beatGain,
 *    sub (subharmonic gain), subWave, vib {rate, depth (semitones), delay (x01)}, jitter (semitones),
 *    jitterRate, rough (AM depth 0..1), roughRate, roughWave, roughJit (Hz), wet (random AM 0..1), wetRate,
 *    vowels [[x01, name]], fshift, bw (bandwidth multiplier), nf (formants used), breath, breathF, breathQ,
 *    hiss (unfiltered breath gain), drive, fuzz, lp, env [[x01, v, kind]], gain, dest
 */
export function voice(s, o) {
  const t = o.t ?? 0, dur = o.dur;
  const end = t + dur + 0.06;
  const dest = out(s, o);
  // pitch control (cents) shared by all oscillators
  const pc = s.konst(0, t, end);
  const cont = o.contour || [[0, 0], [1, 0]];
  pc.offset.setValueAtTime(cont[0][1] * 100, t);
  for (let i = 1; i < cont.length; i++) pc.offset.linearRampToValueAtTime(cont[i][1] * 100, t + cont[i][0] * dur);
  const oscs = [];
  oscs.push([s.osc(o.wave || 'sawtooth', o.f0, t, end), 1]);
  if (o.beat) oscs.push([s.osc(o.wave2 || 'sawtooth', o.f0 * Math.pow(2, o.beat / 1200), t, end), o.beatGain ?? 0.6]);
  if (o.sub) oscs.push([s.osc(o.subWave || 'triangle', o.f0 / 2, t, end), o.sub]);
  const mix = s.g(1);
  let vibG = null, jit = null;
  if (o.vib) {
    const lfo = s.osc('sine', o.vib.rate, t, end);
    if (o.vib.wobble) s.randCtl(t, dur, 3, -o.vib.wobble, o.vib.wobble).connect(lfo.frequency);
    vibG = s.g(0);
    const d = o.vib.depth * 100;
    s.env(vibG.gain, [[t, 0], [t + dur * (o.vib.delay ?? 0.15), d * 0.3], [t + dur * 0.6, d], [end, d]]);
    lfo.connect(vibG);
  }
  if (o.jitter) jit = s.randCtl(t, dur, o.jitterRate ?? 14, -o.jitter * 100, o.jitter * 100);
  for (const [osc, gn] of oscs) {
    pc.connect(osc.detune);
    if (vibG) vibG.connect(osc.detune);
    if (jit) jit.connect(osc.detune);
    const gg = s.g(gn);
    osc.connect(gg);
    gg.connect(mix);
  }
  let src = mix;
  if (o.rough) {
    const am = s.g(1 - o.rough);
    const lfo = s.osc(o.roughWave || 'sine', o.roughRate ?? 35, t, end);
    if (o.roughJit) s.randCtl(t, dur, 7, -o.roughJit, o.roughJit).connect(lfo.frequency);
    const lg = s.g(o.rough);
    lfo.connect(lg);
    lg.connect(am.gain);
    src.connect(am);
    src = am;
  }
  if (o.wet) {
    const am2 = s.g(1 - o.wet);
    s.randCtl(t, dur, o.wetRate ?? 40, -o.wet, o.wet).connect(am2.gain);
    src.connect(am2);
    src = am2;
  }
  // formant bank
  const fin = s.g(1);
  src.connect(fin);
  if (o.breath) {
    const n = s.noise('white', t, end);
    const bf = s.bp(o.breathF ?? 1500, o.breathQ ?? 0.7);
    const bg = s.g(o.breath);
    if (o.breathEnv) s.env(bg.gain, o.breathEnv.map(([x, v]) => [t + x * dur, v * o.breath]));
    s.chain(n, bf, bg, fin);
  }
  const fsum = s.g(1);
  const vowels = o.vowels || [[0, 'uh']];
  const shift = o.fshift ?? 1;
  const nf = o.nf ?? 4;
  for (let k = 0; k < nf; k++) {
    const v0 = VOWELS[vowels[0][1]][k];
    const bp = s.bp(v0[0] * shift, (v0[0] * shift) / (v0[2] * (o.bw ?? 1.5)));
    bp.frequency.setValueAtTime(Math.min(v0[0] * shift, s.sr * 0.45), t);
    for (let i = 1; i < vowels.length; i++) {
      const vk = VOWELS[vowels[i][1]][k];
      bp.frequency.linearRampToValueAtTime(Math.min(vk[0] * shift, s.sr * 0.45), t + vowels[i][0] * dur);
    }
    const fg = s.g(v0[1] * (k === 0 ? 1 : o.upper ?? 1));
    fin.connect(bp);
    bp.connect(fg);
    fg.connect(fsum);
  }
  if (o.raw) {
    // a little unfiltered (lowpassed) source for body
    const lp = s.lp(o.rawLp ?? 900, 0.7);
    const rg = s.g(o.raw);
    s.chain(src, lp, rg, fsum);
  }
  let post = fsum;
  if (o.drive) {
    const pre = s.g(o.preDrive ?? 3);
    const sat = s.sat(o.drive, o.fuzz ? 'fuzz' : 'tanh');
    s.chain(fsum, pre, sat);
    post = sat.out;
  }
  if (o.lp) {
    const lp = s.lp(o.lp, 0.7);
    post.connect(lp);
    post = lp;
  }
  const env = s.g(0);
  const ep = o.env || [[0, 0], [0.12, 1], [0.75, 0.75], [1, 0]];
  const G = o.gain ?? 1;
  s.env(env.gain, ep.map(([x, v, k, tau]) => [t + x * dur, v * G, k, tau]));
  post.connect(env);
  env.connect(dest);
  if (o.hiss) {
    const n2 = s.noise('white', t, end);
    const hp = s.bp(o.hissF ?? 3000, 0.5);
    const hg = s.g(o.hiss);
    s.chain(n2, hp, hg, env);
  }
  return env;
}

// ---------------------------------------------------------------------------------------------
// Gunshot
// ---------------------------------------------------------------------------------------------
/**
 * Layered gunshot: supersonic snap + crack + body + thump + boom (all through a saturator for punch),
 * environmental tail and discrete echoes (slapback off buildings / tree lines).
 */
export function gunshot(s, p) {
  const t = 0.002;
  const v = (x, a = 0.08) => s.vary(x, a);
  const mix = s.g(p.mixGain ?? 0.5);
  const sat = s.sat(p.drive ?? 3);
  const post = s.g(1);
  s.chain(mix, sat, post);
  post.connect(s.out);
  if (p.snap) burst(s, { t, kind: 'white', a: 0.0001, tau: v(p.snapTau ?? 0.0012), peak: p.snap, filters: [['highpass', 3000, 0.7]], dest: mix });
  if (p.crack)
    burst(s, {
      t,
      kind: 'white',
      a: 0.0002,
      tau: v(p.crackTau ?? 0.012),
      peak: p.crack,
      filters: [['highpass', p.crackHp ?? 1200, 0.6], ['peaking', v(p.crackPk ?? 3000, 0.15), 1.2, p.crackPkDb ?? 4]],
      dest: mix,
    });
  if (p.body) burst(s, { t, kind: 'white', a: 0.0006, tau: v(p.bodyTau ?? 0.05), peak: p.body, filters: [['bandpass', v(p.bodyF ?? 700, 0.1), p.bodyQ ?? 0.8]], dest: mix });
  if (p.thump)
    tone(s, { t, type: 'sine', f: v(p.thumpF0 ?? 140, 0.06), f1: p.thumpF1 ?? 50, glideTau: p.thumpGlide ?? 0.025, a: 0.0012, tau: v(p.thumpTau ?? 0.07), peak: p.thump, dest: mix });
  if (p.boom) burst(s, { t, kind: 'brown', a: 0.002, tau: v(p.boomTau ?? 0.12), peak: p.boom, filters: [['lowpass', p.boomLp ?? 300, 0.8]], dest: mix });
  if (p.tail) {
    const tail = burst(s, {
      t: t + 0.004,
      kind: 'pink',
      a: p.tailA ?? 0.025,
      tau: v(p.tailTau ?? 0.4),
      peak: p.tail,
      filters: [['lowpass', p.tailLp ?? 1600, 0.6], ['highpass', p.tailHp ?? 140, 0.6]],
      dest: post,
    });
    s.env(tail.filters[0].frequency, [[t, p.tailLp ?? 1600], [t + (p.tailTau ?? 0.4) * 4, (p.tailLp ?? 1600) * 0.3, 'e']]);
  }
  for (const [dt, g, lp] of p.echoes || []) {
    const d = s.delay(v(dt, 0.18));
    const f = s.lp(lp ?? 1500, 0.5);
    const gg = s.g(v(g, 0.2));
    s.chain(post, d, f, gg, s.out);
  }
  if (p.mech) p.mech(s, t);
  return post;
}
