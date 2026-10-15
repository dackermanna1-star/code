// Non-verbal vocal recipes: survivors, common infected, special infected.
// All built on the formant voice synth (glottal pulses + aspiration -> cascade formants).
import { vox, thud, whoosh, squelch, bubble, crackle, splat, scrape, creak, clack, debris, monoLoop } from './kit.js';

const M = { f0: 112, fscale: 1 };
const F = { f0: 215, fscale: 1.17 };
const Z = { f0: 100, fscale: 0.95 };

const SURV = { v: 4, group: 'survivor', cat: 'voice', dist: 'vox', prio: 0.7, peak: 0.75, maxInst: 3, burst: 1, fadeIn: 0.003, fadeOut: 0.02 };
const ZED = { v: 5, group: 'common', cat: 'voice', dist: 'zed', prio: 0.3, peak: 0.7, maxInst: 6, burst: 2, fadeIn: 0.003, fadeOut: 0.02 };
const SPEC = { v: 4, group: 'special', cat: 'voice', dist: 'special', prio: 0.75, peak: 0.8, maxInst: 3, burst: 1, fadeIn: 0.003, fadeOut: 0.03 };

const pickV = (S, arr) => arr[Math.floor(S.r() * arr.length)];

// ---------------------------------------------------------------- survivors
function pain(S, g) {
  const d = S.rand(0.26, 0.4);
  return vox(S, g, { dur: d, pitch: S.rand(1.15, 1.45), f0c: [[0, 1.3], [0.04, 1.05], [d, 0.8]], v: [[0, 'uh'], [d * 0.4, pickV(S, ['a', 'ae', 'uh', 'aw'])]], amp: [[0, 0], [0.012, 1], [d * 0.5, 0.75], [d, 0]], br: [[0, 0.15], [d * 0.55, 0.2], [d, 0.75]], rough: 0.15, jitter: 0.02 });
}
function painBig(S, g) {
  const d = S.rand(0.6, 0.85);
  const o = vox(S, g, { dur: d, pitch: S.rand(1.5, 1.85), f0c: [[0, 1.15], [0.06, 1.25], [d * 0.6, 1.05], [d, 0.75]], v: [[0, 'ae'], [d * 0.3, pickV(S, ['a', 'aw'])], [d, 'uh']], amp: [[0, 0], [0.015, 1], [d * 0.6, 0.85], [d, 0]], br: [[0, 0.12], [d * 0.6, 0.2], [d, 0.7]], rough: 0.3, growl: 0.25, jitter: 0.025 });
  return S.sat(o, 1.6);
}
function incap(S, g) {
  const d = S.rand(1.4, 1.8);
  return vox(S, g, { dur: d, pitch: S.rand(1.35, 1.6), f0c: [[0, 1.05], [0.15, 1.2], [d * 0.6, 0.95], [d, 0.65]], vib: 0.03, vibR: 7, v: [[0, 'a'], [d * 0.4, 'aw'], [d * 0.8, 'uh']], amp: [[0, 0], [0.04, 1], [d * 0.5, 0.85], [d * 0.85, 0.35], [d, 0]], br: [[0, 0.15], [d * 0.6, 0.3], [d, 0.85]], rough: 0.25, growl: [[0, 0.2], [d, 0.05]], jitter: 0.025 });
}
function death(S, g) {
  const d = S.rand(1.5, 1.9), o = S.buf(d + 0.9);
  S.mix(o, vox(S, g, { dur: d, pitch: S.rand(1.4, 1.6), f0c: [[0, 1.1], [0.1, 1.2], [d * 0.5, 0.95], [d, 0.55]], v: [[0, 'a'], [d * 0.5, 'uh'], [d, 'o']], amp: [[0, 0], [0.03, 1], [d * 0.6, 0.7], [d, 0]], br: [[0, 0.12], [d * 0.6, 0.35], [d, 0.8]], fry: [[0, 0], [d * 0.6, 0.1], [d, 0.6]], rough: 0.3, growl: 0.15 }), 0, 1);
  S.mix(o, vox(S, g, { dur: 0.8, pitch: 0.8, v: 'uh', br: 0.95, amp: [[0, 0], [0.1, 0.6], [0.8, 0]], fry: 0.5 }), d - 0.05, 0.3);
  return o;
}
function scream(S, g, pitch) {
  const d = S.rand(0.9, 1.2);
  const o = vox(S, g, { dur: d, pitch: pitch * S.rand(0.92, 1.08), f0c: [[0, 0.85], [0.08, 1.05], [d * 0.6, 1], [d, 0.82]], vib: 0.035, vibR: 6, v: [[0, 'ae'], [d * 0.3, pickV(S, ['a', 'ae'])], [d, 'a']], amp: [[0, 0], [0.03, 1], [d * 0.7, 0.9], [d, 0]], br: 0.15, rough: 0.2, growl: 0.15, tilt: 7500 });
  return S.sat(o, 1.5);
}
function grunt(S, g) {
  const d = S.rand(0.16, 0.26);
  return vox(S, g, { dur: d, pitch: S.rand(1.05, 1.3), f0c: [[0, 1.15], [d, 0.85]], v: [[0, 'm'], [0.05, pickV(S, ['uh', 'aw', 'a'])]], amp: [[0, 0], [0.01, 1], [d * 0.4, 0.8], [d, 0]], br: [[0, 0.3], [d, 0.6]], growl: 0.2 });
}
function cough(S, g, n = 0) {
  const count = n || S.randi(2, 3), o = S.buf(0.4 * count + 0.5);
  let t = 0;
  for (let k = 0; k < count; k++) {
    const d = S.rand(0.15, 0.24);
    S.mix(o, vox(S, g, { dur: d, pitch: S.rand(1.1, 1.4), f0c: [[0, 1.1], [d, 0.8]], v: [[0, 'a'], [d, 'uh']], amp: [[0, 0], [0.006, 1], [0.04, 0.55], [d, 0]], br: 0.75, growl: 0.4, rough: 0.4 }), t, k === 0 ? 1 : S.rand(0.6, 0.9));
    S.mix(o, thud(S, 110, 0.02, { noise: 0.4 }), t, 0.15);
    t += d + S.rand(0.08, 0.18);
  }
  // wheezing inhale
  S.mix(o, vox(S, g, { dur: 0.35, v: 'i', br: 1, amp: [[0, 0], [0.1, 0.5], [0.35, 0]] }), t, 0.35);
  return o;
}
function choke(S, g) {
  const d = 1.4, gaps = [];
  for (let k = 0; k < 4; k++) gaps.push(S.rand(0.1, d - 0.1));
  const gate = (t) => { for (const c of gaps) if (Math.abs(t - c) < 0.05) return 0.15; return 1; };
  const o = vox(S, g, { dur: d, pitch: S.rand(1.6, 1.8), f0c: [[0, 1], [0.5, 1.1], [d, 0.9]], vib: 0.08, vibR: 9, v: [[0, 'i'], [0.4, 'uh'], [0.8, 'e'], [d, 'uh']], amp: [[0, 0], [0.04, 1], [d * 0.8, 0.8], [d, 0]], br: 0.5, growl: 0.6, growlRate: 25, rough: 0.3 });
  S.mul(o, (t) => gate(t));
  S.onepole(o, 6000);
  for (let k = 0; k < 3; k++) S.mix(o, S.click(S.rand(800, 1400), 3, 0.004, 0.03), S.rand(0.1, d - 0.1), 0.3);
  return o;
}
function vomitSpit(S) {
  const o = S.buf(0.85);
  const lip = S.burst(0.04, 0.004); S.bp(lip, 1800, 0.9); S.mix(o, S.norm(lip, 1), 0, 0.8);
  const spray = S.noise(0.2); S.hp(spray, 2800); S.mul(spray, (t) => Math.min(1, t / 0.004) * Math.exp(-t / 0.05));
  S.mix(o, S.norm(spray, 1), 0.005, 0.6);
  for (let k = 0; k < 5; k++) S.mix(o, S.click(S.rand(1500, 3500), 3, 0.003, 0.02), S.rand(0.02, 0.2), S.rand(0.1, 0.3));
  const g = S.chance(0.5) ? M : F;
  S.mix(o, vox(S, g, { dur: 0.35, pitch: 1.2, v: [[0, 'e'], [0.35, 'uh']], br: 0.45, growl: 0.7, growlRate: 28, amp: [[0, 0], [0.02, 1], [0.35, 0]] }), 0.22, 0.7);
  S.mix(o, vox(S, g, { dur: 0.25, pitch: 1, v: 'h', br: 0.9, amp: [[0, 0], [0.03, 0.6], [0.25, 0]] }), 0.58, 0.4);
  return o;
}

export const VOICE_SOUNDS = {
  survivor_pain_m: { ...SURV, v: 5, gen: (S) => pain(S, M) },
  survivor_pain_f: { ...SURV, v: 5, gen: (S) => pain(S, F) },
  survivor_pain_big_m: { ...SURV, peak: 0.85, gen: (S) => painBig(S, M) },
  survivor_pain_big_f: { ...SURV, peak: 0.85, gen: (S) => painBig(S, F) },
  survivor_incap_m: { ...SURV, v: 3, peak: 0.85, prio: 0.9, gen: (S) => incap(S, M) },
  survivor_incap_f: { ...SURV, v: 3, peak: 0.85, prio: 0.9, gen: (S) => incap(S, F) },
  survivor_death_m: { ...SURV, v: 3, peak: 0.85, prio: 0.95, gen: (S) => death(S, M) },
  survivor_death_f: { ...SURV, v: 3, peak: 0.85, prio: 0.95, gen: (S) => death(S, F) },
  survivor_cough: { ...SURV, gen: (S) => cough(S, S.chance(0.5) ? M : F) },
  survivor_choke: { ...SURV, v: 3, gen: (S) => choke(S, S.chance(0.5) ? M : F) },
  survivor_scream_m: { ...SURV, v: 3, peak: 0.9, prio: 0.9, gen: (S) => scream(S, M, 3.2) },
  survivor_scream_f: { ...SURV, v: 3, peak: 0.9, prio: 0.9, gen: (S) => scream(S, F, 3.0) },
  survivor_grunt_m: { ...SURV, v: 5, peak: 0.6, gen: (S) => grunt(S, M) },
  survivor_grunt_f: { ...SURV, v: 5, peak: 0.6, gen: (S) => grunt(S, F) },
  survivor_vomit_spit: { ...SURV, v: 3, gen: (S) => vomitSpit(S) },
};

// ---------------------------------------------------------------- common infected
function zIdle(S) {
  const d = S.rand(1.2, 2.2), o = S.buf(d + 0.1);
  S.mix(o, vox(S, Z, { dur: d, pitch: S.rand(0.85, 1.2), f0c: [[0, 1], [d * 0.3, 1.12], [d * 0.7, 0.92], [d, 0.75]], v: [[0, 'o'], [d * 0.5, pickV(S, ['uh', 'a', 'aw'])], [d, 'u']], amp: [[0, 0], [d * 0.25, 1], [d * 0.6, 0.7], [d, 0]], br: 0.3, fry: 0.35, growl: 0.35, growlRate: 30, rough: 0.3, fs: S.rand(0.88, 1.0), jitter: 0.03 }), 0, 1);
  for (let k = 0; k < 4; k++) S.mix(o, bubble(S, S.rand(180, 420), S.rand(0.03, 0.06)), S.rand(d * 0.2, d * 0.9), S.rand(0.05, 0.15));
  S.lp(o, 3200);
  return o;
}
function zAlert(S) {
  const d = S.rand(0.6, 0.9);
  const o = vox(S, Z, { dur: d, pitch: S.rand(2.6, 3.4), f0c: [[0, 0.8], [0.07, 1.25], [d * 0.5, 1.12], [d, 0.88]], v: [[0, 'ae'], [d, pickV(S, ['a', 'ae', 'aw'])]], amp: [[0, 0], [0.02, 1], [d * 0.6, 0.85], [d, 0]], br: 0.25, growl: 0.45, rough: 0.35, jitter: 0.04, tilt: 6500, fs: S.rand(0.95, 1.1) });
  return S.sat(o, 2);
}
function zRage(S) {
  const n = S.randi(2, 3), o = S.buf(1.2);
  let t = 0;
  for (let k = 0; k < n; k++) {
    const d = S.rand(0.2, 0.36);
    S.mix(o, vox(S, Z, { dur: d, pitch: S.rand(1.3, 2.0), f0c: [[0, 1.1], [d, 0.85]], v: pickV(S, ['a', 'ae', 'aw']), amp: [[0, 0], [0.015, 1], [d * 0.6, 0.8], [d, 0]], br: 0.45, growl: 0.8, rough: 0.4, jitter: 0.05 }), t, S.rand(0.7, 1));
    t += d + S.rand(0.02, 0.12);
  }
  return S.sat(o, 2);
}
function zGrunt(S, pitch = 1.5, d = 0.25) {
  return vox(S, Z, { dur: d, pitch, f0c: [[0, 1.15], [d, 0.8]], v: pickV(S, ['uh', 'a', 'aw']), amp: [[0, 0], [0.012, 1], [d * 0.5, 0.7], [d, 0]], br: 0.4, growl: 0.7, rough: 0.35 });
}
function zDeath(S) {
  const d = S.rand(0.7, 1.1), o = S.buf(d + 0.2);
  S.mix(o, vox(S, Z, { dur: d, pitch: S.rand(1.4, 1.9), f0c: [[0, 1], [0.05, 1.1], [d, 0.45]], v: [[0, 'a'], [d * 0.5, 'o'], [d, 'u']], amp: [[0, 0], [0.02, 1], [d * 0.5, 0.7], [d, 0]], br: [[0, 0.2], [d, 0.7]], fry: [[0, 0.05], [d, 0.6]], growl: 0.5, rough: 0.3 }), 0, 1);
  for (let k = 0; k < 4; k++) S.mix(o, bubble(S, S.rand(200, 450), S.rand(0.03, 0.06)), S.rand(d * 0.5, d), 0.12);
  return S.sat(o, 1.4);
}

function horde(S, dur, count, { build = 0, lpf = 2600 } = {}) {
  const o = S.buf(dur);
  for (let k = 0; k < count; k++) {
    const d = S.rand(0.7, 1.9);
    let st = S.rand(0, Math.max(0.01, dur - d - 0.3));
    if (build > 0) st = (dur - d - 0.3) * Math.pow(S.r(), 1 / (1 + build));
    const shout = S.chance(0.55);
    const v = vox(S, Z, {
      dur: d, pitch: shout ? S.rand(2.0, 3.8) : S.rand(1.2, 2.2), f0c: [[0, 0.85], [0.08, 1.15], [d * 0.6, 1.05], [d, 0.8]],
      v: pickV(S, ['a', 'ae', 'aw', 'o', 'uh']), amp: [[0, 0], [S.rand(0.02, 0.15), 1], [d * 0.7, 0.8], [d, 0]],
      br: S.rand(0.2, 0.45), growl: S.rand(0.3, 0.8), rough: 0.35, jitter: 0.045, fs: S.rand(0.88, 1.12),
    });
    const amp = S.rand(0.25, 1) * (build > 0 ? 0.3 + 0.7 * (st / dur) : 1);
    S.mix(o, v, st, amp);
  }
  // feet rumble
  const r = S.brown(dur); S.lp(r, 220);
  const w = S.wobble(dur, 9); for (let i = 0; i < r.length; i++) r[i] *= 0.5 + 0.5 * Math.abs(w[i]);
  S.mul(r, (t) => build > 0 ? Math.min(1, t / dur * 1.3) : Math.sin(Math.PI * Math.min(1, t / dur)));
  S.mix(o, S.norm(r, 1), 0, 0.35);
  if (build > 0) S.lp(o, (t) => 700 + (lpf - 700) * Math.pow(t / dur, 1.5), 0.7);
  else S.lp(o, lpf, 0.7);
  S.verb(o, { room: 0.82, damp: 0.5, wet: 0.25 });
  S.sat(o, 1.3);
  return o;
}

export const COMMON_SOUNDS = {
  zombie_idle: { ...ZED, v: 6, peak: 0.6, prio: 0.15, gen: zIdle },
  zombie_alert: { ...ZED, v: 4, peak: 0.85, prio: 0.5, dist: 'zedLoud', gen: zAlert },
  zombie_rage: { ...ZED, v: 5, peak: 0.75, gen: zRage },
  zombie_attack: { ...ZED, v: 4, peak: 0.75, prio: 0.55, gen: (S) => {
    const o = S.buf(0.55);
    S.mix(o, whoosh(S, 0.22, 400, 2400, 1.5, 0.6), 0, 0.6);
    S.mix(o, zGrunt(S, S.rand(1.4, 1.9), 0.3), 0.04, 0.8);
    return o;
  } },
  zombie_hit_survivor: { ...ZED, v: 4, peak: 0.8, prio: 0.75, cat: 'sfx', gen: (S) => {
    const o = S.buf(0.4);
    const sl = S.noise(0.08); S.hp(sl, 2500); S.mul(sl, (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.025));
    S.mix(o, S.norm(sl, 1), 0, 0.6);
    S.mix(o, thud(S, S.rand(90, 120), 0.04, { noise: 0.9, nf: 1300 }), 0.02, 1);
    S.mix(o, squelch(S, 0.18, S.rand(800, 1100)), 0.022, 0.6);
    S.sat(o, 1.5);
    return o;
  } },
  zombie_pain: { ...ZED, v: 4, gen: (S) => S.sat(zGrunt(S, S.rand(2.0, 2.6), S.rand(0.2, 0.3)), 1.5) },
  zombie_death: { ...ZED, v: 5, burst: 3, gen: zDeath },
  zombie_burning: { ...ZED, v: 3, peak: 0.8, prio: 0.4, gen: (S) => {
    const d = 1.6, o = S.buf(d);
    const wob = S.wobble(d, 4);
    S.mix(o, vox(S, Z, { dur: d, pitch: S.rand(4.8, 6), f0c: [[0, 0.8], [0.1, 1.1], [d, 0.85]], vib: 0.1, vibR: 8, v: [[0, 'a'], [0.5, 'ae'], [1.0, 'i'], [d, 'a']], amp: [[0, 0], [0.04, 1], [d * 0.7, 0.8], [d, 0]], br: 0.3, growl: 0.35, rough: 0.35, jitter: 0.05, fs: 1.1 }), 0, 1);
    S.mul(o, (t) => 0.8 + 0.2 * wob[Math.min(wob.length - 1, Math.round(t * S.sr))]);
    S.mix(o, crackle(S, d, 45, { fLo: 900, fHi: 5000 }), 0, 0.3);
    return S.sat(o, 1.6);
  } },
  zombie_climb: { ...ZED, v: 3, peak: 0.6, gen: (S) => {
    const o = S.buf(1.1);
    for (let k = 0; k < 5; k++) S.mix(o, thud(S, S.rand(180, 320), 0.02, { noise: 0.9, nf: 1800 }), S.rand(0, 0.9), S.rand(0.4, 0.9));
    S.mix(o, scrape(S, 0.6, 1600, 1.2, 0.8), 0.2, 0.35);
    S.mix(o, zGrunt(S, 1.5, 0.28), S.rand(0.2, 0.6), 0.7);
    return o;
  } },
  horde_roar: { ...ZED, v: 3, peak: 0.9, prio: 0.9, dist: 'horde', maxInst: 2, burst: 1, fadeOut: 0.1, gen: (S) => horde(S, 4.5, 26) },
  horde_scream: { ...ZED, v: 2, peak: 0.9, prio: 0.9, dist: 'horde', maxInst: 2, burst: 1, fadeOut: 0.1, gen: (S) => horde(S, 5.5, 34, { build: 1.5, lpf: 4200 }) },
  zombie_footsteps_run: { ...ZED, v: 3, loop: true, cat: 'sfx', prio: 0.2, gain: 0.5, dist: 'step', gen: (S) => monoLoop(S, 2, 0.1, (d) => S.buf(d), (d) => {
    const o = S.buf(d);
    let t = 0.02;
    while (t < 2) {
      S.mix(o, thud(S, S.rand(80, 110), 0.02, { noise: 0.9, nf: 1500 }), t, S.rand(0.6, 1));
      const sc = S.burst(0.08, 0.015, 0.003); S.hp(sc, 2500); S.mix(o, S.norm(sc, 1), t + 0.01, 0.25);
      t += S.rand(0.17, 0.26);
    }
    return o;
  }) },
};

// ---------------------------------------------------------------- special infected
const BOOM = { f0: 64, fscale: 0.82 };
const HUNT = { f0: 110, fscale: 1 };
const SMOK = { f0: 118, fscale: 0.98 };
const CHRG = { f0: 78, fscale: 0.82 };
const JOCK = { f0: 470, fscale: 1.25 };
const SPIT = { f0: 175, fscale: 1.12 };
const TANK = { f0: 54, fscale: 0.72 };
const WITCH = { f0: 290, fscale: 1.2 };

function laugh(S, g, d, { rate = 9, pitch = 1, phrases = 2, shriek = 0 } = {}) {
  const ph = [];
  let t = 0.03;
  for (let k = 0; k < phrases; k++) { const len = S.rand(0.4, 0.8) * (d / 1.4); ph.push([t, Math.min(d - 0.05, t + len), S.chance(0.5) ? -1 : 1]); t += len + S.rand(0.05, 0.25); }
  const inPh = (t) => { for (const p of ph) if (t >= p[0] && t <= p[1]) return p; return null; };
  const pulse = (t) => { const p = inPh(t); if (!p) return 0; const u = (t - p[0]) / (p[1] - p[0]); return Math.pow(Math.max(0, Math.sin(Math.PI * rate * (t - p[0]))), 2) * Math.sin(Math.PI * u) ** 0.4; };
  const o = vox(S, g, {
    dur: d, pitch,
    f0c: [[0, 1]],
    v: [[0, 'i'], [d * 0.5, 'e'], [d, 'i']],
    amp: [[0, 1], [d, 1]],
    br: 0.35, rough: 0.2 + shriek * 0.2, growl: shriek * 0.3, jitter: 0.03,
  });
  // per-phrase pitch slope (cackle up / down) via resample would change duration; use gating + gentle wobble instead
  S.mul(o, (t) => pulse(t));
  const h = S.noise(d); S.bp(h, 2400, 1.2); S.mul(h, (t) => { const p = inPh(t); return p ? 0.25 * (1 - pulse(t)) : 0; });
  S.add(o, h);
  return o;
}

function wailSob(S, out, t0) {
  // inhale gasp
  let t = t0;
  S.mix(out, vox(S, WITCH, { dur: 0.35, pitch: 1.2, v: [[0, 'i'], [0.35, 'h']], br: 1, amp: [[0, 0], [0.12, 0.8], [0.35, 0]] }), t, 0.5);
  t += S.rand(0.35, 0.5);
  const sobs = S.randi(3, 5);
  for (let k = 0; k < sobs; k++) {
    const d = S.rand(0.12, 0.18);
    S.mix(out, vox(S, WITCH, { dur: d, pitch: S.rand(0.95, 1.1) * (1 - k * 0.03), f0c: [[0, 1.08], [d, 0.92]], v: [[0, 'h'], [0.04, pickV(S, ['uh', 'o'])]], br: 0.55, amp: [[0, 0], [0.02, 1], [d, 0]], jitter: 0.03, shimmer: 0.15 }), t, S.rand(0.6, 0.9));
    t += d + S.rand(0.06, 0.12);
  }
  const wd = S.rand(1.0, 1.5), wobR = S.rand(4, 6);
  S.mix(out, vox(S, WITCH, { dur: wd, pitch: S.rand(0.95, 1.1), f0c: [[0, 1.1], [0.2, 1.15], [wd, 0.85]], vib: 0.06, vibR: wobR, v: [[0, 'uh'], [wd * 0.3, 'o'], [wd, 'u']], br: 0.45, amp: [[0, 0], [0.15, 1], [wd * 0.6, 0.8], [wd, 0]], jitter: 0.03, shimmer: 0.15 }), t, 1);
  t += wd + S.rand(0.15, 0.3);
  // sniffle
  const sn = S.noise(0.16); S.bp(sn, 3200, 2); S.mul(sn, (x) => Math.sin(Math.PI * x / 0.16) ** 2);
  S.mix(out, S.norm(sn, 1), t, 0.25);
  t += 0.16 + S.rand(0.25, 0.7);
  return t;
}

export const SPECIAL_SOUNDS = {
  // ---- Boomer
  boomer_idle: { ...SPEC, gen: (S) => {
    const d = S.rand(1.4, 2.0), o = S.buf(d + 0.2);
    S.mix(o, vox(S, BOOM, { dur: d, pitch: S.rand(0.85, 1.12), f0c: [[0, 0.9], [d * 0.3, 1.1], [d, 0.8]], v: [[0, 'o'], [d * 0.5, 'uh'], [d, 'o']], amp: [[0, 0], [0.08, 1], [d * 0.4, 0.9], [d * 0.7, 0.5], [d, 0]], br: 0.35, fry: 0.6, growl: 0.5, growlRate: 22, rough: 0.4, jitter: 0.04 }), 0, 1);
    for (let k = 0; k < 14; k++) S.mix(o, bubble(S, S.rand(140, 450), S.rand(0.03, 0.09)), S.rand(0, d), S.rand(0.1, 0.35));
    S.mix(o, squelch(S, d * 0.6, 500, { chatter: 25 }), d * 0.2, 0.2);
    return S.sat(o, 1.5);
  } },
  boomer_vomit: { ...SPEC, v: 2, peak: 0.9, prio: 0.9, dist: 'zedLoud', gen: (S) => {
    const d = 2.7, o = S.buf(d);
    S.mix(o, vox(S, BOOM, { dur: 0.4, pitch: 1.4, v: [[0, 'uh'], [0.4, 'a']], br: 0.5, growl: 0.8, rough: 0.5, amp: [[0, 0], [0.03, 1], [0.4, 0.6]] }), 0, 0.8);
    const gd = 2.2, gush = S.noise(gd);
    S.lp(gush, (t) => 900 + 900 * Math.exp(-t / 0.4), 0.9);
    const w = S.wobble(gd, 16); for (let i = 0; i < gush.length; i++) gush[i] *= 0.6 + 0.4 * Math.abs(w[i]);
    S.mul(gush, (t) => Math.min(1, t / 0.05) * (t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) / 0.6)));
    S.mix(o, S.norm(gush, 1), 0.35, 0.9);
    S.mix(o, vox(S, BOOM, { dur: gd, pitch: 1.25, f0c: [[0, 1.1], [gd, 0.8]], v: 'aw', br: 0.6, growl: 0.9, rough: 0.5, fry: 0.2, amp: [[0, 0], [0.05, 1], [1.6, 0.8], [gd, 0]] }), 0.35, 0.6);
    for (let k = 0; k < 30; k++) S.mix(o, bubble(S, S.rand(150, 600), S.rand(0.03, 0.08)), S.rand(0.4, 2.4), S.rand(0.1, 0.4));
    return S.sat(o, 1.6);
  } },
  boomer_explode: { ...SPEC, v: 2, peak: 0.97, prio: 0.95, dist: 'gun', gen: (S) => {
    const d = 2.2, o = S.buf(d);
    S.mix(o, S.thump(d, 110, 38, 0.04, 0.2, 0.002), 0, 1);
    const b = S.noise(d); S.lp(b, (t) => 250 + 3500 * Math.exp(-t / 0.08), 0.8); S.mul(b, (t) => Math.min(1, t / 0.002) * Math.exp(-t / 0.18));
    S.mix(o, S.norm(b, 1), 0, 0.9);
    S.mix(o, splat(S, 1.5, 2.5), 0.005, 1);
    S.mix(o, squelch(S, 1.0, 600, { chatter: 30 }), 0.05, 0.5);
    for (let k = 0; k < 10; k++) S.mix(o, splat(S, 0.3, 0.5), S.rand(0.2, 1.6), S.rand(0.1, 0.3));
    S.sat(o, 2);
    return o;
  } },
  boomer_alert: { ...SPEC, v: 2, gen: (S) => {
    const d = 1.1, o = S.buf(d + 0.2);
    S.mix(o, vox(S, BOOM, { dur: d, pitch: 1.3, f0c: [[0, 0.8], [0.3, 1.35], [d, 1.0]], v: [[0, 'o'], [0.3, 'aw'], [d, 'a']], br: 0.4, growl: 0.8, fry: 0.3, rough: 0.5, amp: [[0, 0], [0.05, 1], [d * 0.7, 0.8], [d, 0]] }), 0, 1);
    for (let k = 0; k < 8; k++) S.mix(o, bubble(S, S.rand(150, 400), S.rand(0.03, 0.08)), S.rand(0, d), 0.25);
    return S.sat(o, 1.8);
  } },
  // ---- Hunter
  hunter_idle: { ...SPEC, gen: (S) => {
    const o = S.buf(1.6);
    const g1 = vox(S, HUNT, { dur: 0.8, pitch: S.rand(0.9, 1.1), f0c: [[0, 0.9], [0.4, 1.1], [0.8, 0.85]], v: [[0, 'a'], [0.8, 'aw']], br: 0.65, growl: 0.9, growlRate: 45, rough: 0.4, amp: [[0, 0], [0.1, 1], [0.6, 0.8], [0.8, 0]] });
    const g2 = vox(S, HUNT, { dur: 0.4, pitch: S.rand(3.4, 4.1), f0c: [[0, 0.9], [0.1, 1.1], [0.4, 0.95]], v: pickV(S, ['i', 'e', 'ae']), br: 0.7, growl: 0.6, rough: 0.4, amp: [[0, 0], [0.03, 1], [0.4, 0]], tilt: 7000 });
    if (S.chance(0.5)) { S.mix(o, g1, 0, 1); S.mix(o, g2, S.rand(0.75, 0.95), 0.8); } else { S.mix(o, g2, 0, 0.8); S.mix(o, g1, S.rand(0.3, 0.5), 1); }
    return S.sat(o, 1.8);
  } },
  hunter_scream: { ...SPEC, v: 3, peak: 0.9, prio: 0.9, dist: 'zedLoud', gen: (S) => {
    const d = 1.1;
    const o = vox(S, HUNT, { dur: d, pitch: S.rand(4.6, 5.4), f0c: [[0, 0.85], [0.06, 1.15], [d * 0.5, 1.05], [d, 0.85]], vib: 0.04, vibR: 9, v: [[0, 'ae'], [d, 'a']], br: 0.35, growl: 0.5, rough: 0.4, jitter: 0.04, tilt: 7000, amp: [[0, 0], [0.02, 1], [d * 0.7, 0.85], [d, 0]] });
    return S.sat(o, 2);
  } },
  hunter_lunge: { ...SPEC, v: 3, gen: (S) => {
    const o = S.buf(0.6);
    S.mix(o, whoosh(S, 0.45, 300, 2000, 1.2, 0.5), 0, 0.8);
    S.mix(o, vox(S, HUNT, { dur: 0.3, pitch: 5, f0c: [[0, 0.9], [0.3, 1.2]], v: 'ae', br: 0.5, growl: 0.5, amp: [[0, 0], [0.02, 1], [0.3, 0]] }), 0, 0.6);
    return o;
  } },
  hunter_shred: { ...SPEC, v: 3, peak: 0.85, prio: 0.85, cat: 'sfx', gen: (S) => {
    const d = 1.6, o = S.buf(d);
    let t = 0.01;
    while (t < d - 0.15) {
      const sl = S.noise(0.06); S.hp(sl, 2800); S.mul(sl, (x) => Math.min(1, x / 0.008) * Math.exp(-x / 0.02));
      S.mix(o, S.norm(sl, 1), t, 0.5);
      S.mix(o, thud(S, S.rand(90, 130), 0.03, { noise: 0.9, nf: 1300 }), t + 0.015, S.rand(0.6, 1));
      S.mix(o, squelch(S, 0.12, S.rand(800, 1300), { chatter: 70 }), t + 0.016, S.rand(0.4, 0.7));
      t += S.rand(0.1, 0.15);
    }
    S.mix(o, vox(S, HUNT, { dur: d, pitch: 1, v: 'aw', br: 0.7, growl: 0.9, amp: [[0, 0], [0.1, 1], [d - 0.1, 1], [d, 0]] }), 0, 0.35);
    return S.sat(o, 1.5);
  } },
  // ---- Smoker
  smoker_idle: { ...SPEC, gen: (S) => {
    const o = S.buf(1.7);
    S.mix(o, cough(S, SMOK, S.randi(2, 3)), 0, 1);
    return S.sat(o, 1.4);
  } },
  smoker_tongue: { ...SPEC, v: 3, gen: (S) => {
    const o = S.buf(0.8);
    S.mix(o, whoosh(S, 0.18, 800, 4000, 1.6, 0.3), 0, 0.7);
    S.mix(o, squelch(S, 0.35, 1200, { chatter: 40, q: 1.2 }), 0.02, 0.7);
    const tw = S.osc('sine', 0.4, (t) => 90 + 160 * Math.exp(-t / 0.05) + 6 * Math.sin(t * 60)); S.mul(tw, (t) => Math.min(1, t / 0.005) * Math.exp(-t / 0.1));
    S.mix(o, tw, 0.08, 0.4);
    S.mix(o, clack(S, 1700, { tau: 0.01 }), 0.1, 0.3);
    return o;
  } },
  smoker_drag: { ...SPEC, v: 2, peak: 0.6, gen: (S) => {
    const d = 1.6, o = S.buf(d);
    const sc = S.noise(d); S.lp(sc, 1200); const w = S.wobble(d, 25);
    for (let i = 0; i < sc.length; i++) sc[i] *= 0.4 + 0.6 * Math.abs(w[i]);
    S.mul(sc, (t) => Math.min(1, t / 0.1) * Math.min(1, (d - t) / 0.2));
    S.mix(o, S.norm(sc, 1), 0, 0.6);
    S.mix(o, creak(S, d, (t) => 45 + 15 * Math.sin(t * 5), { body: [[160, 0.04, 1], [410, 0.02, 0.5]], irregular: 0.5, amp: (t) => Math.sin(Math.PI * Math.min(1, t / d)) }), 0, 0.5);
    for (let k = 0; k < 4; k++) S.mix(o, thud(S, S.rand(90, 150), 0.03, { noise: 0.8 }), S.rand(0.1, d - 0.2), S.rand(0.3, 0.6));
    return o;
  } },
  smoker_choke_loop: { ...SPEC, v: 1, loop: true, gain: 0.8, prio: 0.85, gen: (S) => monoLoop(S, 3, 0.25, (d) => {
    const c = creak(S, d, (t) => 28 + 8 * Math.sin(t * 3.3), { body: [[140, 0.05, 1], [330, 0.03, 0.5], [900, 0.01, 0.2]], irregular: 0.6 });
    const sq = S.noise(d); S.bp(sq, 700, 1.5); const w = S.wobble(d, 12);
    for (let i = 0; i < sq.length; i++) sq[i] *= Math.max(0, w[i]);
    return S.add(S.norm(c, 0.6), S.norm(sq, 0.25));
  }, (d) => {
    const o = S.buf(d);
    const g = S.chance(0.5) ? M : F;
    S.mix(o, choke(S, g), 0.1, 0.8);
    S.mix(o, vox(S, g, { dur: 0.5, pitch: 1.9, v: [[0, 'i'], [0.5, 'uh']], br: 0.7, growl: 0.7, amp: [[0, 0], [0.05, 0.8], [0.5, 0]] }), 1.9, 0.6);
    return o;
  }) },
  smoker_death: { ...SPEC, v: 2, gen: (S) => {
    const o = S.buf(2.0);
    S.mix(o, cough(S, SMOK, 2), 0, 0.9);
    const pf = S.noise(1.2); S.lp(pf, 700); S.mul(pf, (t) => Math.min(1, t / 0.03) * Math.exp(-t / 0.3));
    S.mix(o, S.norm(pf, 1), 0.55, 0.9);
    const hs = S.noise(1.0); S.hp(hs, 3000); S.mul(hs, (t) => Math.min(1, t / 0.02) * Math.exp(-t / 0.25));
    S.mix(o, S.norm(hs, 1), 0.55, 0.3);
    S.mix(o, thud(S, 70, 0.08, { noise: 0.6 }), 0.55, 0.5);
    return o;
  } },
  // ---- Charger
  charger_idle: { ...SPEC, gen: (S) => {
    const o = S.buf(1.3);
    let t = 0;
    const n = S.randi(2, 3);
    for (let k = 0; k < n; k++) {
      const d = S.rand(0.2, 0.32);
      S.mix(o, vox(S, CHRG, { dur: d, pitch: S.rand(0.9, 1.15), f0c: [[0, 1.1], [d, 0.85]], v: [[0, 'm'], [0.06, pickV(S, ['uh', 'aw'])]], br: 0.3, growl: 0.5, rough: 0.4, amp: [[0, 0], [0.015, 1], [d * 0.5, 0.7], [d, 0]] }), t, 1);
      t += d + S.rand(0.1, 0.25);
    }
    S.mix(o, vox(S, CHRG, { dur: 0.3, v: 'm', br: 1, amp: [[0, 0], [0.05, 0.6], [0.3, 0]] }), Math.min(1.0, t), 0.4);
    return S.sat(o, 1.6);
  } },
  charger_charge: { ...SPEC, v: 2, peak: 0.95, prio: 0.9, dist: 'zedLoud', gen: (S) => {
    const d = 2.3, o = S.buf(d);
    S.mix(o, vox(S, CHRG, { dur: 1.9, pitch: 1, f0c: [[0, 0.9], [1.5, 2.3], [1.9, 2.0]], v: [[0, 'o'], [0.8, 'aw'], [1.9, 'a']], br: 0.3, growl: [[0, 0.5], [1.9, 0.9]], rough: 0.45, amp: [[0, 0], [0.1, 0.5], [1.4, 1], [1.9, 0]] }), 0, 1);
    let t = 0.1, gap = 0.3;
    while (t < d - 0.2) { S.mix(o, thud(S, 60, 0.05, { noise: 0.7, nf: 500 }), t, 0.6); t += gap; gap = Math.max(0.16, gap * 0.9); }
    return S.sat(o, 2.2);
  } },
  charger_impact: { ...SPEC, v: 3, peak: 0.97, prio: 0.9, dist: 'gun', cat: 'sfx', gen: (S) => {
    const o = S.buf(1.1);
    S.mix(o, whoosh(S, 0.12, 200, 900, 1, 0.8), 0, 0.4);
    S.mix(o, thud(S, 55, 0.12, { noise: 1, nf: 800 }), 0.1, 1);
    S.mix(o, crackle(S, 0.2, 25, { fLo: 900, fHi: 3500 }), 0.1, 0.45);
    S.mix(o, squelch(S, 0.2, 700), 0.1, 0.3);
    S.mix(o, vox(S, CHRG, { dur: 0.35, pitch: 1.5, v: 'aw', br: 0.4, growl: 0.8, amp: [[0, 0], [0.02, 1], [0.35, 0]] }), 0.12, 0.5);
    return S.sat(o, 2.4);
  } },
  charger_pummel: { ...SPEC, v: 2, peak: 0.95, prio: 0.9, cat: 'sfx', gen: (S) => {
    const o = S.buf(2.0);
    for (let k = 0; k < 3; k++) {
      const t = k * S.rand(0.55, 0.65);
      S.mix(o, whoosh(S, 0.2, 150, 700, 1, 0.8), t, 0.3);
      S.mix(o, thud(S, S.rand(50, 60), 0.1, { noise: 1, nf: 700 }), t + 0.18, 1);
      S.mix(o, crackle(S, 0.12, 12, { fLo: 900, fHi: 3000 }), t + 0.18, 0.3);
      S.mix(o, squelch(S, 0.15, 650), t + 0.185, 0.3);
      S.mix(o, vox(S, CHRG, { dur: 0.28, pitch: 1.3, v: 'uh', br: 0.3, growl: 0.8, amp: [[0, 0], [0.02, 1], [0.28, 0]] }), t + 0.1, 0.5);
    }
    return S.sat(o, 2);
  } },
  // ---- Jockey
  jockey_idle: { ...SPEC, gen: (S) => S.sat(laugh(S, JOCK, S.rand(1.2, 1.6), { rate: S.rand(8, 10), pitch: S.rand(0.9, 1.15), phrases: S.randi(2, 3) }), 1.3) },
  jockey_leap: { ...SPEC, v: 3, gen: (S) => {
    const o = S.buf(0.7);
    S.mix(o, vox(S, JOCK, { dur: 0.45, pitch: 0.95, f0c: [[0, 0.85], [0.3, 1.6], [0.45, 1.5]], v: [[0, 'e'], [0.45, 'i']], br: 0.3, rough: 0.3, amp: [[0, 0], [0.03, 1], [0.45, 0]] }), 0, 1);
    S.mix(o, whoosh(S, 0.5, 300, 1800, 1.2, 0.5), 0.1, 0.5);
    return S.sat(o, 1.3);
  } },
  jockey_ride: { ...SPEC, v: 1, loop: true, gain: 0.85, prio: 0.85, gen: (S) => monoLoop(S, 3, 0.05, (d) => S.buf(d), () => {
    const o = S.buf(3.3);
    S.mix(o, laugh(S, JOCK, 1.5, { rate: 11, pitch: 1.25, phrases: 2, shriek: 1 }), 0.02, 1);
    S.mix(o, laugh(S, JOCK, 1.4, { rate: 10, pitch: 1.4, phrases: 2, shriek: 1 }), 1.55, 1);
    return S.sat(o, 1.4);
  }) },
  // ---- Spitter
  spitter_idle: { ...SPEC, gen: (S) => {
    const d = S.rand(1.4, 1.8), o = S.buf(d + 0.1);
    const h = S.noise(d); S.hp(h, 3000); const w = S.wobble(d, 6);
    for (let i = 0; i < h.length; i++) h[i] *= Math.max(0, 0.5 + 0.5 * w[i]);
    S.mul(h, (t) => Math.sin(Math.PI * Math.min(1, t / d)));
    S.mix(o, S.norm(h, 1), 0, 0.5);
    S.mix(o, vox(S, SPIT, { dur: d, pitch: S.rand(0.9, 1.1), f0c: [[0, 1], [d, 0.85]], v: [[0, 'i'], [d * 0.5, 'e'], [d, 'uh']], br: 0.55, growl: 0.6, fry: 0.3, rough: 0.3, amp: [[0, 0], [0.2, 0.9], [d * 0.7, 0.7], [d, 0]] }), 0, 0.8);
    for (let k = 0; k < 10; k++) S.mix(o, bubble(S, S.rand(300, 900), S.rand(0.02, 0.05)), S.rand(0, d), S.rand(0.1, 0.3));
    return o;
  } },
  spitter_spit: { ...SPEC, v: 3, gen: (S) => {
    const o = S.buf(0.95);
    S.mix(o, vox(S, SPIT, { dur: 0.3, v: 'h', br: 0.9, growl: 0.9, amp: [[0, 0], [0.05, 1], [0.3, 0.4]] }), 0, 0.7);
    const lip = S.burst(0.04, 0.005); S.bp(lip, 1500, 1); S.mix(o, S.norm(lip, 1), 0.3, 0.8);
    const spray = S.noise(0.25); S.hp(spray, 2000); S.mul(spray, (t) => Math.min(1, t / 0.005) * Math.exp(-t / 0.07));
    S.mix(o, S.norm(spray, 1), 0.3, 0.5);
    S.mix(o, whoosh(S, 0.5, 500, 2500, 1.4, 0.3), 0.32, 0.4);
    S.mix(o, squelch(S, 0.2, 1000), 0.3, 0.4);
    return o;
  } },
  acid_sizzle: { ...SPEC, v: 1, loop: true, cat: 'sfx', gain: 0.6, prio: 0.6, dist: 'world', gen: (S) => monoLoop(S, 3, 0.3, (d) => {
    const h = S.noise(d); S.hp(h, 2500); const w = S.wobble(d, 9);
    for (let i = 0; i < h.length; i++) h[i] *= 0.6 + 0.4 * w[i];
    const o = S.norm(h, 0.5);
    S.add(o, S.norm(crackle(S, d, Math.round(160 * d), { fLo: 2000, fHi: 8000, tauLo: 0.0005, tauHi: 0.002, q: 1, ampLo: 0.1 }), 0.8));
    for (let k = 0; k < 20 * d; k++) S.mix(o, bubble(S, S.rand(500, 1400), S.rand(0.015, 0.04)), S.rand(0, d), S.rand(0.1, 0.3));
    return o;
  }) },
  spitter_death: { ...SPEC, v: 2, gen: (S) => {
    const o = S.buf(1.8);
    S.mix(o, vox(S, SPIT, { dur: 0.9, pitch: 1.7, f0c: [[0, 1.1], [0.9, 0.5]], v: [[0, 'ae'], [0.9, 'uh']], br: 0.5, growl: 0.7, fry: [[0, 0], [0.9, 0.5]], amp: [[0, 0], [0.03, 1], [0.9, 0]] }), 0, 0.9);
    S.mix(o, splat(S, 1.0, 1.5), 0.5, 0.8);
    const h = S.noise(1.2); S.hp(h, 3000); S.mul(h, (t) => Math.min(1, t / 0.05) * Math.exp(-t / 0.35));
    S.mix(o, S.norm(h, 1), 0.55, 0.4);
    return o;
  } },
  // ---- Tank
  tank_idle: { ...SPEC, v: 3, peak: 0.85, dist: 'tank', prio: 0.9, gen: (S) => {
    const o = S.buf(3.2);
    const ex = vox(S, TANK, { dur: 1.3, pitch: S.rand(0.85, 1.1), f0c: [[0, 1], [0.6, 1.15], [1.3, 0.85]], v: [[0, 'aw'], [1.3, 'o']], br: 0.6, growl: 0.85, growlRate: 25, rough: 0.5, fry: 0.3, amp: [[0, 0], [0.2, 1], [0.9, 0.8], [1.3, 0]] });
    const inh = vox(S, TANK, { dur: 0.9, pitch: 1.1, v: 'u', br: 0.9, growl: 0.4, amp: [[0, 0], [0.3, 0.6], [0.9, 0]] });
    S.mix(o, inh, 0, 0.5); S.mix(o, ex, 0.8, 1);
    S.mix(o, S.copy(inh), 2.1, 0.4);
    const r = S.brown(3.2); S.lp(r, 140); S.mul(r, (t) => Math.exp(-Math.pow((t - 1.4) / 0.7, 2)));
    S.mix(o, S.norm(r, 1), 0, 0.4);
    return S.sat(o, 2);
  } },
  tank_roar: { ...SPEC, v: 3, peak: 0.97, prio: 1, dist: 'tank', gen: (S) => {
    const d = 2.6, o = S.buf(d);
    const opts = { dur: d, pitch: S.rand(1.5, 1.75), f0c: [[0, 0.8], [0.25, 1.25], [1.6, 1.15], [d, 0.7]], v: [[0, 'o'], [0.3, 'aw'], [1.8, 'a'], [d, 'o']], br: 0.35, growl: 0.85, rough: 0.4, jitter: 0.04, amp: [[0, 0], [0.08, 1], [1.8, 0.9], [d, 0]] };
    S.mix(o, vox(S, TANK, opts), 0, 1);
    S.mix(o, vox(S, TANK, { ...opts, pitch: opts.pitch * 0.5, br: 0.5 }), 0, 0.7);
    S.mix(o, S.thump(1.0, 80, 35, 0.1, 0.3, 0.05), 0, 0.5);
    S.peq(o, 120, 0.8, 5);
    return S.sat(o, 2.6);
  } },
  tank_punch: { ...SPEC, v: 3, peak: 0.98, prio: 1, dist: 'gun', cat: 'sfx', gen: (S) => {
    const o = S.buf(1.2);
    S.mix(o, whoosh(S, 0.16, 150, 900, 1, 0.8), 0, 0.4);
    S.mix(o, S.thump(1.0, 120, 38, 0.03, 0.15, 0.002), 0.14, 1);
    const n = S.burst(0.6, 0.06, 0.001); S.lp(n, 1500); S.mix(o, S.norm(n, 1), 0.14, 0.9);
    S.mix(o, crackle(S, 0.25, 30, { fLo: 900, fHi: 4000 }), 0.14, 0.4);
    S.mix(o, squelch(S, 0.2, 600), 0.145, 0.3);
    return S.sat(o, 2.6);
  } },
  tank_rock_rip: { ...SPEC, v: 2, peak: 0.9, prio: 0.95, dist: 'tank', cat: 'sfx', gen: (S) => {
    const d = 1.7, o = S.buf(d);
    const g = S.noise(d); S.bp(g, 700, 0.7); const w = S.wobble(d, 30);
    for (let i = 0; i < g.length; i++) g[i] *= Math.abs(w[i]);
    S.mul(g, (t) => Math.min(1, t / 0.2) * Math.min(1, (d - t) / 0.3));
    S.mix(o, S.norm(g, 1), 0, 0.6);
    S.mix(o, crackle(S, d, 120, { fLo: 600, fHi: 3500, tauLo: 0.002, tauHi: 0.012, q: 1.2 }), 0, 0.7);
    for (let k = 0; k < 4; k++) S.mix(o, thud(S, S.rand(50, 80), 0.08, { noise: 0.9 }), S.rand(0.1, 1.3), S.rand(0.5, 0.9));
    S.mix(o, vox(S, TANK, { dur: 1.2, pitch: 1.4, v: 'aw', br: 0.5, growl: 0.9, rough: 0.5, amp: [[0, 0], [0.3, 1], [1.2, 0]] }), 0.2, 0.5);
    S.mix(o, debris(S, d, 20), 0, 0.2);
    return S.sat(o, 2);
  } },
  tank_rock_throw: { ...SPEC, v: 2, peak: 0.95, prio: 0.95, dist: 'tank', gen: (S) => {
    const o = S.buf(1.4);
    S.mix(o, vox(S, TANK, { dur: 0.7, pitch: 1.8, f0c: [[0, 0.9], [0.2, 1.2], [0.7, 0.9]], v: [[0, 'uh'], [0.2, 'a']], br: 0.35, growl: 0.9, rough: 0.5, amp: [[0, 0], [0.03, 1], [0.7, 0]] }), 0, 1);
    S.mix(o, whoosh(S, 0.7, 120, 700, 0.9, 0.4), 0.35, 0.8);
    return S.sat(o, 2.2);
  } },
  tank_death: { ...SPEC, v: 2, peak: 0.95, prio: 1, dist: 'tank', gen: (S) => {
    const d = 3.4, o = S.buf(4.6);
    S.mix(o, vox(S, TANK, { dur: d, pitch: 1.6, f0c: [[0, 1], [0.2, 1.15], [d * 0.6, 0.75], [d, 0.45]], v: [[0, 'a'], [1.2, 'aw'], [2.5, 'o'], [d, 'u']], br: [[0, 0.3], [d, 0.8]], growl: 0.8, rough: 0.4, fry: [[0, 0.05], [d, 0.6]], amp: [[0, 0], [0.1, 1], [d * 0.5, 0.8], [d, 0]] }), 0, 1);
    S.mix(o, vox(S, TANK, { dur: 0.8, v: 'uh', br: 0.95, amp: [[0, 0], [0.1, 0.5], [0.8, 0]] }), d - 0.1, 0.5);
    S.mix(o, thud(S, 45, 0.18, { noise: 0.9, nf: 400 }), 3.6, 0.8);
    S.mix(o, debris(S, 1.0, 10, { t0: 0.03 }), 3.6, 0.15);
    return S.sat(o, 1.8);
  } },
  // ---- Witch
  witch_cry: { ...SPEC, v: 1, loop: true, gain: 0.9, prio: 0.9, dist: 'special', gen: (S) => {
    const L = 9.6;
    const ev = S.buf(L + 3);
    let t = 0.05;
    while (t < L - 0.5) t = wailSob(S, ev, t);
    S.verb(ev, { room: 0.55, damp: 0.6, wet: 0.12 });
    return S.wrap(ev, S.len(L));
  } },
  witch_growl: { ...SPEC, v: 3, peak: 0.85, gen: (S) => {
    const d = 1.3, o = S.buf(d + 0.1);
    S.mix(o, vox(S, WITCH, { dur: d, pitch: S.rand(0.6, 0.7), f0c: [[0, 0.9], [d, 1.2]], v: [[0, 'aw'], [d, 'a']], br: 0.6, growl: 0.85, growlRate: 35, rough: 0.4, amp: [[0, 0], [0.1, 0.5], [d * 0.85, 1], [d, 0]] }), 0, 1);
    const h = S.noise(d); S.hp(h, 2500); S.mul(h, (t) => (t / d) * Math.min(1, (d - t) / 0.05));
    S.mix(o, S.norm(h, 1), 0, 0.25);
    return S.sat(o, 1.6);
  } },
  witch_scream: { ...SPEC, v: 2, peak: 0.97, prio: 1, dist: 'tank', gen: (S) => {
    const d = 1.7, o = S.buf(d);
    const opts = { dur: d, pitch: S.rand(3.1, 3.5), f0c: [[0, 0.75], [0.06, 1.1], [0.8, 1.0], [d, 0.8]], vib: 0.04, vibR: 9, v: [[0, 'ae'], [0.6, 'a'], [1.2, 'i'], [d, 'a']], br: 0.25, growl: 0.4, rough: 0.35, jitter: 0.04, tilt: 8000, amp: [[0, 0], [0.02, 1], [d * 0.75, 0.85], [d, 0]] };
    S.mix(o, vox(S, WITCH, opts), 0, 1);
    S.mix(o, vox(S, WITCH, { ...opts, pitch: opts.pitch * 0.5, br: 0.4, growl: 0.7 }), 0, 0.5);
    return S.sat(o, 2.2);
  } },
  witch_attack: { ...SPEC, v: 3, peak: 0.9, prio: 1, cat: 'sfx', gen: (S) => {
    const o = S.buf(0.8);
    const sl = S.noise(0.1); S.hp(sl, 2200); S.mul(sl, (t) => Math.min(1, t / 0.01) * Math.exp(-t / 0.03));
    S.mix(o, S.norm(sl, 1), 0, 0.7);
    S.mix(o, thud(S, 100, 0.04, { noise: 0.9, nf: 1500 }), 0.03, 0.9);
    S.mix(o, squelch(S, 0.25, 1100, { chatter: 70 }), 0.03, 0.7);
    S.mix(o, vox(S, WITCH, { dur: 0.45, pitch: 3, f0c: [[0, 0.9], [0.45, 1.1]], v: 'ae', br: 0.3, growl: 0.5, rough: 0.3, amp: [[0, 0], [0.02, 1], [0.45, 0]] }), 0, 0.6);
    return S.sat(o, 1.7);
  } },
};

