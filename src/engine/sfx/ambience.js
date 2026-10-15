// Stereo ambience beds (seamless loops). Played 2D by the game (or 3D for local emitters).
import { stereoLoop, crackle, thud } from './kit.js';

const AMB = { v: 1, loop: true, group: 'amb', cat: 'sfx', dist: 'amb', prio: 0.6, maxInst: 2, burst: 1, gain: 0.25 };

function windBed(S, d, { lo = 250, hi = 900, gust = 0.15, whistle = 0.15 } = {}) {
  const o = S.buf(d);
  const n = S.pink(d);
  const g = S.wobble(d, gust);
  const g2 = S.wobble(d, gust * 3.1);
  S.lp(n, (t) => { const i = Math.min(g.length - 1, Math.round(t * S.sr)); return lo + (hi - lo) * (0.5 + 0.5 * g[i]); }, 0.9);
  for (let i = 0; i < n.length; i++) n[i] *= 0.45 + 0.4 * (0.5 + 0.5 * g[i]) + 0.15 * g2[i];
  S.add(o, S.norm(n, 1));
  if (whistle > 0) {
    const w = S.noise(d);
    const c = S.wobble(d, 0.1);
    S.bp(w, (t) => { const i = Math.min(c.length - 1, Math.round(t * S.sr)); return 900 + 500 * c[i]; }, 18);
    for (let i = 0; i < w.length; i++) w[i] *= Math.max(0, g[i]) ** 2;
    S.mix(o, S.norm(w, 1), 0, whistle);
  }
  return o;
}

function distantShot(S) {
  const s = S.burst(1.2, 0.03, 0.001);
  S.lp(s, S.rand(700, 1300));
  S.norm(s, 1);
  S.verb(s, { room: 0.9, damp: 0.6, wet: 0.9 });
  return S.norm(s, 1);
}

function siren(S, dur, f0 = 700, f1 = 1250, rate = 0.16) {
  const x = S.osc('tri', dur, (t) => f0 + (f1 - f0) * (0.5 - 0.5 * Math.cos(6.2832 * rate * t)));
  S.lp(x, 1600);
  S.mul(x, (t) => Math.sin(Math.PI * Math.min(1, t / dur)) ** 1.5);
  S.verb(x, { room: 0.92, damp: 0.5, wet: 0.7 });
  return S.norm(x, 1);
}

export const AMBIENCE_SOUNDS = {
  amb_wind: { ...AMB, gain: 0.28, gen: (S) => stereoLoop(S, 12, 2, (d) => windBed(S, d, { lo: 220, hi: 1100, gust: 0.12, whistle: 0.18 })) },
  amb_interior: { ...AMB, gain: 0.18, gen: (S) => stereoLoop(S, 10, 1.5, (d) => {
    const o = S.buf(d);
    const n = S.pink(d); S.lp(n, 380); S.add(o, S.norm(n, 1));
    const a = S.noise(d); S.bp(a, 220, 0.8); S.mix(o, S.norm(a, 1), 0, 0.35);
    for (const [f, amp] of [[60, 0.12], [120, 0.08], [180, 0.03]]) S.mix(o, S.osc('sine', d, f * S.jit(1, 0.002)), 0, amp);
    return o;
  }) },
  amb_fire_distant: { ...AMB, gain: 0.28, gen: (S) => stereoLoop(S, 12, 2, (d) => {
    const o = S.buf(d);
    const r = S.brown(d); S.lp(r, 320);
    const w = S.wobble(d, 0.6); for (let i = 0; i < r.length; i++) r[i] *= 0.7 + 0.3 * w[i];
    S.add(o, S.norm(r, 1));
    const c = crackle(S, d, Math.round(14 * d), { fLo: 500, fHi: 2500, tauLo: 0.002, tauHi: 0.008, q: 1, ampLo: 0.1 });
    S.lp(c, 2200);
    S.mix(o, c, 0, 0.35);
    return o;
  }, (d) => {
    const o = S.buf(d);
    for (let k = 0; k < 3; k++) { const th = thud(S, S.rand(45, 70), 0.25, { noise: 0.8, nf: 300 }); S.verb(th, { room: 0.9, wet: 0.6 }); S.mix(o, th, S.rand(0.5, 11), S.rand(0.15, 0.3)); }
    return o;
  }) },
  amb_city: { ...AMB, gain: 0.28, gen: (S) => stereoLoop(S, 16, 2, (d) => {
    const o = windBed(S, d, { lo: 200, hi: 700, gust: 0.1, whistle: 0.06 });
    const r = S.brown(d); S.lp(r, 110); S.mix(o, S.norm(r, 1), 0, 0.5);
    return o;
  }, (d) => {
    const L = S.buf(d), R = S.buf(d);
    const sr = siren(S, 9, S.rand(650, 750), S.rand(1150, 1300), 0.17);
    const pan = S.rand(0.2, 0.8);
    S.mix(L, sr, 1.5, 0.35 * (1 - pan)); S.mix(R, sr, 1.5, 0.35 * pan);
    const shots = S.randi(4, 6);
    for (let k = 0; k < shots; k++) {
      const t = S.rand(0, 14.5), p = S.r(), a = S.rand(0.25, 0.6);
      const burst = S.chance(0.4) ? S.randi(2, 4) : 1;
      for (let b = 0; b < burst; b++) { const s = distantShot(S); S.mix(L, s, t + b * 0.11, a * (1 - p)); S.mix(R, s, t + b * 0.11, a * p); }
    }
    return [L, R];
  }) },
  amb_mall: { ...AMB, gain: 0.25, gen: (S) => stereoLoop(S, 16, 2, (d) => {
    const o = S.buf(d);
    const v = S.brown(d); S.lp(v, 260); S.add(o, S.norm(v, 1));
    const a = S.noise(d); S.bp(a, 520, 0.6); S.mix(o, S.norm(a, 1), 0, 0.3);
    for (const [f, amp] of [[120, 0.08], [240, 0.04], [360, 0.015]]) S.mix(o, S.osc('sine', d, f * S.jit(1, 0.002)), 0, amp);
    return o;
  }, (d) => {
    const L = S.buf(d), R = S.buf(d);
    // distant electronic alarm wail echoing through the atrium
    const n = S.len(6), x = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / S.sr, u = (t % 0.8) / 0.8; ph += (560 + 900 * Math.pow(u, 0.8)) / S.sr; ph -= Math.floor(ph); x[i] = (ph < 0.5 ? 1 : -1) * Math.min(1, u / 0.03) * Math.min(1, (1 - u) / 0.04); }
    S.lp(x, 1200); S.mul(x, (t) => Math.sin(Math.PI * Math.min(1, t / 6)));
    S.verb(x, { room: 0.95, damp: 0.6, wet: 1.0 });
    S.norm(x, 1);
    S.mix(L, x, 3, 0.18); S.mix(R, x, 3.03, 0.14);
    return [L, R];
  }) },
};
