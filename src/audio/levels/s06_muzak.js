// Shared synth for the shop levels' background music: faint, warped, purely instrumental muzak
// (electric piano, vibraphone, soft pads). No voices, ever. Used inside defineLoop gens: the
// canvas S wraps notes past the end, so every loop is seamless.
import { wowLoop, TAU } from '../dsp.js';

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// chord tables: [bass midi, [chord tones as midi]]
export const PROG = {
  lounge: [[48, [60, 64, 67, 71]], [45, [57, 60, 64, 67]], [50, [62, 65, 69, 72]], [43, [59, 62, 65, 67]]],
  warm: [[41, [57, 60, 64, 67]], [43, [59, 62, 65, 69]], [48, [60, 64, 67, 71]], [45, [57, 60, 64, 69]]],
  minor: [[45, [57, 60, 64, 67]], [41, [57, 60, 65, 69]], [43, [55, 59, 62, 67]], [40, [55, 59, 64, 67]]],
  bossa: [[50, [62, 65, 69, 72]], [43, [59, 62, 65, 67]], [48, [60, 64, 67, 71]], [48, [60, 64, 67, 71]]],
  elevator: [[53, [65, 69, 72, 76]], [52, [64, 67, 71, 74]], [50, [62, 65, 69, 72]], [55, [62, 65, 67, 71]]],
};

// length of one pass in seconds for a progression
export const muzakLen = (prog, bpm, beatsPerChord = 4) => (prog.length * beatsPerChord * 60) / bpm;

// o: { prog, bpm, bpc, dens (0..1 melody density), detune (cents), wow (s), wowCycles, lp (Hz),
//      lead: 'epiano'|'vibes'|'bell'|'sine', pad (gain), bass (gain), lift (octaves), gain }
export function muzak(S, L, o = {}) {
  const r = S.r;
  const prog = o.prog || PROG.lounge, bpm = o.bpm || 72, bpc = o.bpc || 4;
  const beat = 60 / bpm, dens = o.dens ?? 0.6, det = o.detune ?? 8;
  const lead = o.lead || 'epiano', g0 = o.gain ?? 1;
  const jit = () => Math.pow(2, r.range(-det, det) / 1200);
  prog.forEach(([bass, tones], ci) => {
    const t0 = ci * bpc * beat;
    // pad: the chord held, slow attack
    if (o.pad !== 0) for (const m of tones) S.tone(t0, 0.07 * (o.pad ?? 1) * g0, { f0: mtof(m - 12) * jit(), att: 0.5, dec: bpc * beat * 0.5, dur: bpc * beat * 1.1, shape: 'tri' });
    // bass: root on one and three
    if (o.bass !== 0) for (const b of [0, 2]) if (b < bpc) S.tone(t0 + b * beat, 0.16 * (o.bass ?? 1) * g0, { f0: mtof(bass) * jit(), att: 0.012, dec: beat * 0.9, dur: beat * 3, h2: 0.3 });
    // melody: eighth notes, picked from the chord with a gentle walk
    let idx = r.int(0, tones.length - 1);
    for (let k = 0; k < bpc * 2; k++) {
      if (r() > dens * (k % 2 ? 0.6 : 1)) continue;
      idx = Math.max(0, Math.min(tones.length - 1, idx + r.int(-1, 1)));
      const m = tones[idx] + 12 * (o.lift ?? 0) + (r.chance(0.12) ? 2 : 0);
      const f = mtof(m) * jit(), t = t0 + k * beat * 0.5, g = r.range(0.7, 1) * g0;
      if (lead === 'epiano') S.tone(t, 0.2 * g, { f0: f, att: 0.004, dec: 0.32, dur: 1.8, h2: 0.42, h3: 0.1 }).tone(t, 0.04 * g, { f0: f * 7.02, att: 0.001, dec: 0.05, dur: 0.3 });
      else if (lead === 'vibes') S.ring(t, [[f, 1.3, 0.45], [f * 3.97, 0.35, 0.12], [f * 10.1, 0.08, 0.05]], g);
      else if (lead === 'bell') S.ring(t, [[f, 1.8, 0.4], [f * 2.76, 0.9, 0.2], [f * 5.4, 0.4, 0.1], [f * 8.9, 0.15, 0.05]], g);
      else S.tone(t, 0.18 * g, { f0: f, att: 0.03, dec: 0.5, dur: 2, shape: 'sin', vib: 0.004, vibF: 5 });
    }
  });
  const wow = o.wow ?? 0.004;
  if (wow > 0) S.out.set(wowLoop(S.out, S.sr, wow, o.wowCycles || 3));
  // a slow, slightly out-of-step second wobble gives the tape feel
  if (o.wow2) S.out.set(wowLoop(S.out, S.sr, o.wow2, 7));
  S.filter([['hp', 90], ['lp', o.lp ?? 2600]]);
  void TAU;
}
