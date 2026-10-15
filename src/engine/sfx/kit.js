// Reusable sound-design building blocks on top of dsp.Synth.
// Each helper returns a fresh mono Float32Array (roughly peak-normalised unless noted).
import { curve, vpath } from './dsp.js';

export { curve, vpath };

const nrm = (S, x, p = 1) => S.norm(x, p);

/** metallic clack/click: short excitation into a few inharmonic modes */
export function clack(S, f, { tau = 0.012, dur = 0.08, ratios = [1, 1.51, 2.27], noise = 0.4, hard = 1 } = {}) {
  const ex = S.burst(0.006, 0.0006 + 0.001 / hard);
  const m = S.modes(dur, ratios.map((r, k) => [f * r * S.jit(1, 0.03), tau * Math.pow(0.7, k), 1 / (k + 1)]), ex);
  nrm(S, m);
  if (noise > 0) { const c = S.burst(dur, 0.002 / hard); S.hp(c, f * 0.6); nrm(S, c, noise); S.add(m, c); }
  return nrm(S, m);
}

/** soft click: band-limited noise burst */
export function tick(S, f, q = 3, tau = 0.004) { return nrm(S, S.click(f, q, tau, Math.min(0.2, tau * 10 + 0.01))); }

/** dull low-frequency impact (sine pitch drop + lowpassed noise) */
export function thud(S, f = 90, tau = 0.08, { noise = 0.5, nf = 500, dur = 0, drop = 1.8 } = {}) {
  const d = dur || Math.min(1.5, tau * 7 + 0.05);
  const s = S.thump(d, f * drop, f, tau * 0.35, tau, 0.0015);
  if (noise > 0) {
    const n = S.burst(d, tau * 0.45, 0.001);
    S.lp(n, nf, 0.8);
    nrm(S, n, noise);
    S.add(s, n);
  }
  return nrm(S, s);
}

/** air whoosh: bandpassed noise whose centre sweeps lo->hi->lo with a bell envelope */
export function whoosh(S, dur, lo = 300, hi = 1800, q = 1.4, peakAt = 0.45) {
  const x = S.noise(dur);
  S.bp(x, (t) => { const u = t / dur; const b = Math.exp(-Math.pow((u - peakAt) / 0.22, 2)); return lo + (hi - lo) * b; }, q);
  S.mul(x, (t) => { const u = t / dur; return Math.pow(Math.sin(Math.PI * Math.min(1, u)), 1.6) * (u < peakAt ? u / peakAt : 1); });
  return nrm(S, x);
}

/** wet squelch: noise with chattering amplitude through a moving band */
export function squelch(S, dur = 0.2, f = 900, { chatter = 45, q = 1.6 } = {}) {
  const x = S.noise(dur);
  const ch = S.wobble(dur, chatter);
  S.bp(x, (t) => f * (1.3 - 0.6 * t / dur), q);
  S.mul(x, (t) => Math.exp(-t / (dur * 0.35)) * Math.min(1, t / 0.003));
  for (let i = 0; i < x.length; i++) x[i] *= 0.35 + 0.65 * Math.abs(ch[i]);
  // a few bubbles
  for (let k = 0; k < 3; k++) S.mix(x, bubble(S, S.rand(250, 700), S.rand(0.02, 0.05)), S.rand(0, dur * 0.6), 0.25);
  return nrm(S, x);
}

/** liquid bubble: short rising sine chirp */
export function bubble(S, f = 500, dur = 0.04) {
  const x = S.osc('sine', dur, (t) => f * (1 + 2.5 * t / dur));
  S.mul(x, (t) => Math.sin(Math.PI * t / dur) * Math.exp(-t / (dur * 0.6)));
  return x;
}

/** sparse crackle/grit: count short bursts in [t0,t1] with random bands */
export function crackle(S, dur, count, { t0 = 0, t1 = dur, fLo = 1500, fHi = 6000, tauLo = 0.0008, tauHi = 0.004, q = 2, decay = 0, ampLo = 0.3 } = {}) {
  const out = S.buf(dur);
  for (let k = 0; k < count; k++) {
    const t = t0 + (t1 - t0) * Math.pow(S.r(), decay > 0 ? 1 + decay : 1);
    const g = S.click(S.rand(fLo, fHi), q, S.rand(tauLo, tauHi), 0.03);
    const env = decay > 0 ? Math.exp(-(t - t0) / Math.max(0.01, (t1 - t0) / decay)) : 1;
    S.mix(out, g, t, S.rand(ampLo, 1) * env);
  }
  return nrm(S, out);
}

/** falling debris: small inharmonic tinks + chunks over time */
export function debris(S, dur, count, { t0 = 0.05, fLo = 900, fHi = 4500, chunky = 0.4, tau = 0.02 } = {}) {
  const out = S.buf(dur);
  for (let k = 0; k < count; k++) {
    const t = t0 + (dur - t0 - 0.05) * Math.pow(S.r(), 1.7);
    const amp = Math.exp(-(t - t0) / (dur * 0.35)) * S.rand(0.3, 1);
    if (S.chance(chunky)) {
      const f = S.rand(180, 600);
      S.mix(out, S.modes(0.15, [[f, tau * 2, 1], [f * 2.3, tau, 0.5]], S.burst(0.004, 0.001)), t, amp * 0.9);
    } else {
      const f = S.rand(fLo, fHi);
      S.mix(out, S.modes(0.1, [[f, tau, 1], [f * 1.7, tau * 0.6, 0.5], [f * 2.6, tau * 0.4, 0.3]], S.burst(0.003, 0.0006)), t, amp);
    }
  }
  return nrm(S, out);
}

/** glass shards tinkling */
export function shards(S, dur, count, t0 = 0.02) {
  const out = S.buf(dur);
  const top = S.sr * 0.45;
  for (let k = 0; k < count; k++) {
    const t = t0 + (dur - t0 - 0.08) * Math.pow(S.r(), 1.5);
    const f = Math.min(top / 2.9, S.rand(2200, 7000));
    const tau = S.rand(0.02, 0.09);
    const m = S.modes(tau * 5 + 0.02, [[f, tau, 1], [f * 1.73, tau * 0.6, 0.6], [f * 2.86, tau * 0.4, 0.4]], S.burst(0.002, 0.0003));
    S.mix(out, m, t, S.rand(0.2, 1) * Math.exp(-(t - t0) / (dur * 0.5)));
  }
  return nrm(S, out);
}

/** glass smash: crack + shatter noise + shards */
export function glassSmash(S, dur = 1.2, size = 1) {
  const out = S.buf(dur);
  const c = S.burst(0.05, 0.004); S.hp(c, 1800); S.mix(out, nrm(S, c), 0, 0.9);
  const n = S.noise(dur); S.hp(n, 2500);
  S.mul(n, (t) => Math.min(1, t / 0.002) * Math.exp(-t / (0.08 * size)));
  S.mix(out, nrm(S, n), 0, 0.6);
  S.mix(out, shards(S, dur, Math.round(26 * size), 0.01), 0, 0.8);
  S.mix(out, thud(S, 140, 0.03, { noise: 0.4, nf: 900 }), 0, 0.25 * size);
  return nrm(S, out);
}

/** friction creak (stick-slip): impulse train at varying rate into wooden/metal body resonances */
export function creak(S, dur, rateFn, { body = [[300, 0.02, 1], [720, 0.015, 0.6], [1500, 0.008, 0.3]], irregular = 0.3, amp = null } = {}) {
  const exc = S.buf(dur), sr = S.sr;
  let ph = 0;
  for (let i = 0; i < exc.length; i++) {
    const t = i / sr;
    ph += rateFn(t) * (1 + irregular * (S.r() - 0.5)) / sr;
    if (ph >= 1) { ph -= 1; exc[i] = S.rand(0.5, 1); }
  }
  const out = S.modes(dur, body, exc);
  if (amp) S.mul(out, amp);
  return nrm(S, out);
}

/** scrape: gritty bandpassed noise */
export function scrape(S, dur, f = 2500, q = 2, grit = 0.6) {
  const x = S.noise(dur);
  S.bp(x, f, q);
  const g = S.wobble(dur, 120);
  for (let i = 0; i < x.length; i++) x[i] *= 1 - grit + grit * Math.abs(g[i]);
  S.mul(x, (t) => Math.sin(Math.PI * Math.min(1, t / dur)));
  return nrm(S, x);
}

/** fabric rustle */
export function rustle(S, dur, f = 2200) {
  const x = S.noise(dur);
  S.bp(x, f, 0.8);
  const w = S.wobble(dur, 30);
  for (let i = 0; i < x.length; i++) x[i] *= Math.max(0, w[i]) ** 2;
  S.mul(x, (t) => Math.sin(Math.PI * Math.min(1, t / dur)));
  return nrm(S, x);
}

/** simple beep with click-free envelope */
export function beep(S, dur, f, type = 'square', lpf = 4000) {
  const x = S.osc(type, dur, f);
  S.lp(x, lpf);
  S.mul(x, (t) => Math.min(1, t / 0.003) * Math.min(1, (dur - t) / 0.006));
  return nrm(S, x);
}

/** FM bell */
export function bell(S, dur, f, { ratio = 1.4, index = 3, tau = 0.6 } = {}) {
  const x = S.fm(dur, f, ratio, (t) => index * Math.exp(-t / (tau * 0.4)));
  S.mul(x, (t) => Math.min(1, t / 0.002) * Math.exp(-t / tau));
  return nrm(S, x);
}

/** wet splat for gore */
export function splat(S, dur = 0.5, size = 1) {
  const out = S.buf(dur);
  S.mix(out, thud(S, 85, 0.05 * size, { noise: 0.7, nf: 700 }), 0, 0.8);
  S.mix(out, squelch(S, dur * 0.8, 750, { chatter: 55 }), 0.004, 0.9);
  const sp = S.noise(dur); S.bp(sp, 1800, 0.9);
  S.mul(sp, (t) => Math.min(1, t / 0.004) * Math.exp(-t / (0.06 * size)));
  S.mix(out, nrm(S, sp), 0, 0.5);
  // droplets
  for (let k = 0; k < 6 * size; k++) S.mix(out, S.click(S.rand(600, 1600), 3, 0.006, 0.04), S.rand(0.05, dur * 0.8), S.rand(0.1, 0.35));
  return nrm(S, out);
}

/** voice helper: f0 & amp given as [[t,v],...] multiplier curves */
export function vox(S, g, o) {
  const d = o.dur;
  const f0c = o.f0c ? curve(o.f0c) : () => 1;
  const vib = o.vib || 0, vibR = o.vibR || 5.5;
  const base = g.f0 * (o.pitch || 1);
  const ampc = curve(o.amp || [[0, 0], [0.02, 1], [d * 0.7, 0.8], [d, 0]]);
  return S.voice({
    dur: d,
    f0: (t) => base * f0c(t) * (1 + vib * Math.sin(6.2832 * vibR * t)),
    amp: (t) => ampc(t),
    vowel: Array.isArray(o.v) ? vpath(o.v) : (o.v || 'uh'),
    breath: o.br ? (Array.isArray(o.br) ? curve(o.br) : o.br) : 0.12,
    growl: o.growl ? (Array.isArray(o.growl) ? curve(o.growl) : o.growl) : 0,
    growlRate: o.growlRate,
    fry: o.fry ? (Array.isArray(o.fry) ? curve(o.fry) : o.fry) : 0,
    rough: o.rough || 0,
    jitter: o.jitter ?? 0.015,
    shimmer: o.shimmer ?? 0.1,
    fscale: (g.fscale || 1) * (o.fs || 1),
    bw: o.bw || 1,
    oq: o.oq,
    tilt: o.tilt,
  });
}

/** stereo loop helper: continuous layers rendered L+X then cross-faded; events wrapped */
export function stereoLoop(S, L, X, contFn, eventsFn = null, tail = 2) {
  const out = [];
  // events rendered once (mono or [l,r]) so both channels share them
  let ev = eventsFn ? eventsFn(L + tail, L) : null;
  if (ev && !Array.isArray(ev)) ev = [ev, ev];
  for (let c = 0; c < 2; c++) {
    const cont = contFn(L + X, c);
    const ch = S.loopXfade(cont, S.len(L), S.len(X));
    if (ev) {
      const w = S.wrap(ev[c], S.len(L));
      for (let i = 0; i < ch.length; i++) ch[i] += w[i];
    }
    out.push(ch);
  }
  return out;
}

/** mono loop helper */
export function monoLoop(S, L, X, contFn, eventsFn = null, tail = 1) {
  const cont = contFn(L + X);
  const ch = S.loopXfade(cont, S.len(L), S.len(X));
  if (eventsFn) {
    const ev = eventsFn(L + tail, L);
    const w = S.wrap(ev, S.len(L));
    for (let i = 0; i < ch.length; i++) ch[i] += w[i];
  }
  return ch;
}

/** two-stroke engine (chainsaw) with rpm curve, optional chain noise */
export function engine(S, dur, rpmFn, { chain = 0, load = 0, misfire = 0, bright = 1 } = {}) {
  const sr = S.sr, n = S.len(dur);
  const pulses = new Float32Array(n);
  const buzz = new Float32Array(n);
  const chainSig = new Float32Array(n);
  let ph = 0, cph = 0, amp = 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const ff = rpmFn(t) / 60;
    ph += ff * (1 + (S.r() - 0.5) * 0.05 * (1 + load * 3)) / sr;
    if (ph >= 1) {
      ph -= 1;
      amp = S.chance(misfire) ? 0.15 : S.rand(0.7, 1.0);
      pulses[i] = amp;
    }
    buzz[i] = (2 * ph - 1) * amp;
    cph += ff * 9 / sr; if (cph >= 1) cph -= 1;
    chainSig[i] = (S.r() * 2 - 1) * (0.5 + 0.5 * Math.sin(6.2832 * cph));
  }
  // combustion pops through muffler resonances
  const pops = S.modes(dur, [[170, 0.012, 1], [620, 0.006, 0.6], [1900 * bright, 0.003, 0.35], [3300 * bright, 0.002, 0.2]], pulses);
  S.norm(pops, 1);
  S.lp(buzz, 1400 * bright); S.norm(buzz, 0.5);
  const out = S.add(pops, buzz);
  if (chain > 0) {
    S.bp(chainSig, 3600, 1.2);
    S.norm(chainSig, chain);
    S.add(out, chainSig);
  }
  return S.norm(out, 1);
}
