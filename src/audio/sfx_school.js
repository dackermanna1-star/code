// The building's own voice: electro-mechanical bells, the PA (crackle + two-tone chime) and
// fluorescent tubes. Bells accept opts.dur (ring length, s) — e.g. the dismissal bell that
// "rings on and on" in DISMISSED: sfx('school_bell', { dur: 9 }).
import { ring, burst, grains, BQ, Reson, filt, saturate, envPts, TAU } from './dsp.js';
import { RATIOS, thump, knock, clink, hum, ballast, paColour } from './synth.js';

/** Trembler bell: an armature hammers a gong ~20×/s. Each stroke kicks the gong's inharmonic
 *  (doublet-split) modes — with per-mode random phase, so the ring builds up instead of
 *  spiking — and the hammer briefly damps them while in contact. The result is the harsh,
 *  rattling "BRRRRING" (20 Hz roughness on a sustained ring); after power-off the gong rings out. */
function bell(S, ringDur, distant) {
  const { sr, R } = S;
  const tail = distant ? 1.2 : 1.7, o = S.alloc(ringDur + tail);
  const f0 = R.range(770, 830);
  const T60 = [1.9, 1.35, 1.0, 0.75, 0.55, 0.42], G = [1, 0.9, 0.8, 0.6, 0.45, 0.32];
  const res = [];
  RATIOS.gong.forEach((r, i) => {
    const f = f0 * r * (1 + R.bi() * 0.004);
    for (const [ff, t60, g] of [[f, T60[i], G[i]], [f * (1.0016 + 0.0011 * i), T60[i] * 0.9, G[i] * 0.55]]) {
      res.push({ m: new Reson(sr, ff, t60), g, w: TAU * ff / sr });
    }
  });
  const clickHp = new BQ(sr, 'hp', 2500, 0.7), rattleBp = new BQ(sr, 'bp', 260, 2);
  const nStop = Math.round(ringDur * sr), pw = Math.max(2, Math.round(0.00025 * sr)), contact = Math.round(0.005 * sr);
  const damp = Math.pow(0.6, 1 / contact); // ≈ -4.4 dB per stroke while the hammer rests on the gong
  let next = Math.round(0.004 * sr), pulseLeft = 0, pulseAmp = 0, sinceHit = 1e9, rattle = 0;
  for (let i = 0; i < o.length; i++) {
    if (i >= next && i < nStop) {
      const rate = 20.5 - 6.5 * Math.exp(-(i / sr) / 0.08); // armature settles from ~14 to ~20.5 Hz
      next = i + Math.round(sr / (rate * (1 + R.bi() * 0.06)));
      pulseLeft = pw; pulseAmp = 1 + R.bi() * 0.15; sinceHit = 0; rattle = 1;
      for (const r of res) { // kick every mode with its own phase
        const ph = R.r() * TAU, a = pulseAmp * r.g * 0.25;
        r.m.y1 += a * Math.sin(ph); r.m.y2 += a * Math.sin(ph - r.w);
      }
    }
    let x = 0;
    if (pulseLeft > 0) { x = pulseAmp * Math.sin(Math.PI * (pw - pulseLeft) / pw) + R.bi() * 0.2; pulseLeft--; }
    let y = 0;
    for (let k = 0; k < res.length; k++) {
      const m = res[k].m;
      if (sinceHit < contact) { m.y1 *= damp; m.y2 *= damp; }
      y += m.run(0) * res[k].g;
    }
    sinceHit++;
    y += clickHp.run(x) * 0.35; // the clapper's tick
    rattle *= 0.9992;
    if (i < nStop) y += rattleBp.run(R.bi()) * 0.05 * (0.4 + rattle);
    o[i] = y;
  }
  filt(o, new BQ(sr, 'hp', 220, 0.7), new BQ(sr, 'peak', 2600, 1, 3));
  saturate(o, 1.4);
  if (distant) filt(o, new BQ(sr, 'lp', 1900, 0.7), new BQ(sr, 'lp', 2600, 0.6));
  return o;
}

/** One struck chime bar (felt plunger): warm fundamental, faint inharmonic partials. */
function chimeBar(o, sr, t, f, amp, R) {
  ring(o, sr, t, f, amp, 2.4, { attack: 0.002 });
  ring(o, sr, t, f * 1.0012, amp * 0.35, 2.6, { attack: 0.002 });
  ring(o, sr, t, f * 2.0, amp * 0.06, 1.1);
  ring(o, sr, t, f * 2.756, amp * 0.1, 0.5);
  ring(o, sr, t, f * 5.404, amp * 0.03, 0.18);
  knock(o, sr, t, { f: 620, amp: amp * 0.15, t60: 0.02, click: 0.05, R });
}

export const SCHOOL_SFX = {
  school_bell: { peak: -6, var: 2, max: 1, jit: 0.01, wet: 1.2, key: (o) => (o.dur ? `d${Math.round(o.dur * 4)}` : ''),
    gen: (S) => bell(S, Math.max(0.5, Math.min(20, S.opts.dur ?? 3.6)), false) },
  bell_short: { peak: -12, var: 2, max: 1, jit: 0.01, wet: 1.4, key: (o) => (o.dur ? `d${Math.round(o.dur * 4)}` : ''),
    gen: (S) => bell(S, Math.max(0.5, Math.min(20, S.opts.dur ?? 2.1)), true) },

  intercom_chime: { peak: -8, var: 1, jit: 0.002, max: 1, gen(S) {
    // two-tone "ding-dong" (E5 → C5). The act-by-act semitone drop is rate: 2^(-1/12) per act.
    const { sr, R } = S, o = S.alloc(3.1);
    chimeBar(o, sr, 0.02, 659.26, 1, R);
    chimeBar(o, sr, 0.66, 523.25, 0.95, R);
    paColour(o, sr, { lo: 220, hi: 5200, drive: 1.15 });
    hum(o, sr, 0, 3.0, { amp: 0.012, env: envPts([[0, 0], [0.05, 1], [2.6, 1], [3, 0]]) });
    return o;
  } },
  intercom_crackle: { peak: -9, var: 3, max: 2, gen(S) {
    // the PA keying on: speaker pop, 60 Hz hum with buzz, static bursts, hiss
    const { sr, R } = S, d = R.range(1.4, 1.8), o = S.alloc(d + 0.1);
    thump(o, sr, 0, { f: 70, to: 40, t60: 0.08, amp: 0.9, noise: 0.3, R });
    const env = envPts([[0, 0], [0.04, 1], [d - 0.35, 1], [d, 0]]);
    hum(o, sr, 0, d, { amp: 0.11, h: [1, 0.7, 0.45, 0.3, 0.2, 0.12], env });
    for (let k = 0; k < R.int(6, 10); k++) {
      const t = R.range(0.05, d - 0.2), bd = R.range(0.01, 0.07);
      burst(o, sr, t, { dur: bd, t60: bd, gain: R.range(0.25, 1), R, filters: [['bp', R.range(1500, 4000), 0.6]] });
    }
    grains(o, sr, 0.03, { dur: d - 0.1, R, rate: 90, amp: (u) => env(u * d), f: [1000, 5000], t60: [0.0008, 0.003], click: 1, gain: 0.5 });
    burst(o, sr, 0.02, { dur: d - 0.02, R, gain: 0.05, env: (t) => env(t), filters: [['bp', 3000, 0.4]] });
    return paColour(o, sr, { lo: 200, hi: 4500, drive: 2 });
  } },

  fluor_on: { peak: -9, var: 2, max: 2, gen(S) {
    // a bank of tubes starting: starter 'tinks', stuttering ignition, then the 120 Hz buzz
    const { sr, R } = S, d = 3.2, o = S.alloc(d);
    thump(o, sr, 0, { f: 100, to: 80, t60: 0.1, amp: 0.3, R });
    const starts = [0, R.range(0.3, 0.45), R.range(0.7, 0.95)];
    for (const s of starts) {
      const tR = R.fork();
      for (let k = 0; k < tR.int(2, 3); k++) clink(o, sr, s + k * tR.range(0.1, 0.2), { f: tR.range(3000, 4500), amp: 0.35, t60: 0.02, R: tR });
      // ignition stutter: list of [t, len] on-gates, then steady
      const gates = [];
      let t = s + tR.range(0.22, 0.32);
      for (let k = 0; k < tR.int(3, 5); k++) { const len = tR.range(0.02, 0.12); gates.push([t, len]); t += len + tR.range(0.03, 0.2); }
      const steady = t;
      const gate = (tt) => {
        if (tt >= steady) return tt > d - 0.9 ? Math.max(0, (d - tt) / 0.9) : 1;
        for (const [g0, gl] of gates) if (tt >= g0 && tt < g0 + gl) return Math.min(1, (tt - g0) / 0.003, (g0 + gl - tt) / 0.003);
        return 0;
      };
      ballast(o, sr, 0, d, { amp: tR.range(0.35, 0.55), gate, bright: tR.range(0.3, 0.6), R: tR });
      for (const [g0] of gates) burst(o, sr, g0, { dur: 0.01, t60: 0.008, gain: 0.25, R: tR, filters: [['hp', 2000]] });
    }
    hum(o, sr, 0, d, { amp: 0.06, f: 60, h: [0.3, 1, 0.3, 0.4], env: envPts([[0, 0], [0.2, 1], [d - 0.9, 1], [d, 0]]) });
    return o;
  } },
  fluor_off: { peak: -12, var: 3, gen(S) {
    const { sr, R } = S, o = S.alloc(0.8), cut = R.range(0.45, 0.55);
    const g1 = R.range(0.1, 0.2), g2 = R.range(0.28, 0.36);
    const gate = (t) => (t > cut ? 0 : (t > g1 && t < g1 + 0.04) || (t > g2 && t < g2 + 0.06) ? 0 : 1);
    ballast(o, sr, 0, 0.8, { amp: 0.5, gate, bright: 0.45, R });
    burst(o, sr, cut, { dur: 0.006, t60: 0.004, gain: 0.5, R, filters: [['hp', 1500]] });
    clink(o, sr, cut + R.range(0.08, 0.15), { f: 4100, amp: 0.06, t60: 0.03, R });
    return o;
  } },
};
