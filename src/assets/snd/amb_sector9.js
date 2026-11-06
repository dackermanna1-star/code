// Sector 9's ambience loop (zm_sector9): the air handling of a sealed research level - a mains
// hum and the slow breathing of the ducts, a fan's blade beat; far off, an alarm that nobody
// has silenced, echoing down the corridors; water dripping; a damaged panel arcing now and
// then; a pipe knocking. Quiet and sparse: it plays under everything for a whole game.
// Every steady tone is a whole number of cycles in the loop, so the seam is clean.
import { stereoBed, swell, scatter, pink, brown, white, biquad, svf, normalize, mixInto, shape, addTone, TAU } from './ambkit.js';
import { addTail } from './dsp.js';

/** A frequency rounded to a whole number of cycles in L seconds (periodic in the loop). */
const per = (f, L) => Math.max(1, Math.round(f * L)) / L;

/** The far alarm: a two-tone klaxon (square-ish), band-limited, with a long corridor tail. */
function klaxon(sr, rng, dur, f0, f1) {
  const len = Math.ceil(dur * sr), x = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr, f = Math.floor(t / 0.45) % 2 ? f1 : f0;
    ph += TAU * f / sr;
    const sq = Math.tanh(3 * Math.sin(ph)) + 0.3 * Math.sin(3 * ph);
    x[i] = sq * Math.min(1, t / 0.05) * Math.min(1, (dur - t) / 0.3);
  }
  biquad(x, sr, 'bandpass', 900, 0.7);
  biquad(x, sr, 'lowpass', 1500, 0.7);
  const wet = new Float32Array(len + Math.ceil(2.2 * sr));
  addTail(wet, normalize(x, 1), sr, rng, { tau: 0.9, wet: 0.8, lp: 1600, lpEnd: 500, len: wet.length / sr });
  mixInto(wet, x, 0, 0.25);
  return normalize(wet, 1);
}

/** An electrical arc: a crackle of short grains over a 120 Hz buzz. */
function arc(sr, rng, dur) {
  const len = Math.ceil(dur * sr), x = new Float32Array(len), n = white(len, rng);
  let gate = 0;
  for (let i = 0; i < len; i++) {
    if (i % 64 === 0) gate = rng() < 0.35 ? 0.4 + rng() * 0.6 : gate * 0.3;
    const t = i / sr, env = Math.min(1, t / 0.01) * Math.pow(Math.max(0, 1 - t / dur), 0.7);
    x[i] = env * (gate * n[i] + 0.25 * Math.tanh(4 * Math.sin(TAU * 120 * t)) * gate);
  }
  biquad(x, sr, 'highpass', 900, 0.7);
  biquad(x, sr, 'lowpass', 7000, 0.7);
  return normalize(x, 1);
}

export const AMB = {
  amb_sector9: {
    dur: 14, loop: 1.5, stereo: true, rms: 0.06, rate: 22050,
    fn: (P) => {
      const { sr, rng, loopLen: L } = P;
      const g = swell(rng, L, [[1, 0.5], [2, 0.35], [3, 0.25], [5, 0.12]]);
      // the events (shared by both channels, each panned)
      const alarm = { t: rng() * (L - 4), pan: rng() * 1.6 - 0.8 };
      const alarmBuf = klaxon(sr, rng, 2.6, 620, 495);
      const drops = [];
      scatter(rng, L, 7, (t) => drops.push({ t, f: 900 + rng() * 900, pan: rng() * 2 - 1, a: 0.5 + rng() * 0.5 }));
      const arcs = [];
      scatter(rng, L, 2, (t) => arcs.push({ t, buf: arc(sr, rng, 0.25 + rng() * 0.45), pan: rng() * 2 - 1 }));
      const knock = { t: rng() * L, pan: rng() * 2 - 1 };
      const fHum = per(55, L), fFan = per(7.3, L), fDuct = per(0.11, L);
      stereoBed(P, (ch, out) => {
        const side = ch ? 1 : -1, gain = (pan) => 0.5 + 0.5 * side * pan;
        // mains hum: 55 Hz and harmonics, beating slowly against itself
        for (let i = 0; i < P.len; i++) {
          const t = i / sr, b = 1 + 0.18 * Math.sin(TAU * fDuct * t + ch);
          out[i] += 0.16 * b * Math.sin(TAU * fHum * t) + 0.09 * Math.sin(TAU * 2 * fHum * t + 0.4) + 0.05 * Math.sin(TAU * 3 * fHum * t + ch) + 0.03 * Math.sin(TAU * 5 * fHum * t);
        }
        // the ducts: a low rumble of moving air that breathes with the swell
        const a = brown(P.len, rng);
        biquad(a, sr, 'lowpass', 260, 0.7);
        mixInto(out, shape(normalize(a, 1), sr, (t) => 0.55 + 0.45 * g(t - ch * 0.3)), 0, 0.42);
        // a fan's blade beat in a narrow band of air
        const f = svf(pink(P.len, rng), sr, 'bp', () => 420, 1.6);
        mixInto(out, shape(normalize(f, 1), sr, (t) => 0.35 + 0.25 * Math.pow(0.5 + 0.5 * Math.sin(TAU * fFan * t), 3)), 0, 0.14);
        // hiss at the grilles
        const h = pink(P.len, rng);
        biquad(h, sr, 'highpass', 2500, 0.7);
        mixInto(out, shape(normalize(h, 1), sr, (t) => 0.4 + 0.6 * g(t)), 0, 0.035);
        // the far alarm
        mixInto(out, alarmBuf, alarm.t * sr, 0.11 * gain(alarm.pan));
        // drips: a tiny rising plink each
        for (const d of drops) addTone(out, sr, d.t, { f: d.f, f1: d.f * 1.9, glide: 0.02, amp: 0.1 * d.a * gain(d.pan), tau: 0.025, len: 0.09 });
        // arcing
        for (const e of arcs) mixInto(out, e.buf, e.t * sr, 0.07 * gain(e.pan));
        // a pipe knocking, far away
        addTone(out, sr, knock.t, { f: 140, f1: 110, glide: 0.08, amp: 0.12 * gain(knock.pan), tau: 0.12, len: 0.4 });
      });
    },
  },
};
