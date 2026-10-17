// Voices: typewriter-voice dialogue blips (one timbre per speaker), the Colonel's murmur under
// his text, and the formant-voice crowd (assembly murmur). Blips are tiny cached buffers;
// murmur and crowd are live graphs whose "syllables" are scheduled by the engine's pump, so
// they run for any length and render identically offline.
import { CHARS } from '../data/chars.js';
import { tone, burst, envPts, BQ, filt, cents } from './dsp.js';
import { clink } from './synth.js';

// ---- blips ---------------------------------------------------------------------------------
// semis: pitch set the blip picks from (gives each voice a melodic "shape"); wave: timbre.
const BLIPS = {
  tess: { f: 520, semis: [0, 2, 3, 5, 7], wave: 'tri', dur: 0.034, click: 0.25, peak: -27 },
  danny: { f: 350, semis: [-2, 0, 2, 4, 5, 7, 9], wave: 'square', lp: 1600, dur: 0.042, glide: 1.07, peak: -27 },
  leah: { f: 700, semis: [0, 2, 4], wave: 'sine', dur: 0.026, click: 0.45, peak: -28 },
  marcus: { f: 245, semis: [0, 0, 2, 3, -2], wave: 'tri', dur: 0.06, peak: -26 },
  denise: { f: 466, semis: [0, 1, 3, 5], wave: 'clar', dur: 0.05, breath: 0.18, detune: -28, peak: -27 },
  intercom: { f: 300, semis: [0, 0, 1, -1], wave: 'square', band: [500, 2400], dur: 0.04, stat: 0.35, peak: -27 },
  neutral: { f: 440, semis: [0, 2, 4], wave: 'tri', dur: 0.035, peak: -28 },
};

function blipEntry(B) {
  return {
    bus: 'ui', peak: B.peak, var: 8, jit: 0.01, vjit: 1, max: 3, wet: 0,
    gen(S) {
      const { sr, R } = S, o = S.alloc(B.dur + 0.03);
      const f = B.f * Math.pow(2, R.pick(B.semis) / 12) * cents(B.detune || 0);
      const env = envPts([[0, 0], [0.002, 1], [B.dur * 0.45, 0.6], [B.dur, 0]]);
      const fq = B.glide ? (t) => f * (1 + (B.glide - 1) * Math.min(1, t / B.dur)) : f;
      if (B.wave === 'clar') {
        tone(o, sr, 0, B.dur, { f: fq, a: env, wave: 'square', harm: 9 });
        burst(o, sr, 0, { dur: B.dur, R, gain: B.breath, env, filters: [['bp', f * 3, 2]] });
      } else {
        tone(o, sr, 0, B.dur, { f: fq, a: env, wave: B.wave === 'tri' ? 'tri' : B.wave === 'square' ? 'square' : 'sine', harm: B.wave === 'sine' ? 0 : 12 });
      }
      if (B.lp) filt(o, new BQ(sr, 'lp', B.lp, 0.7));
      if (B.band) filt(o, new BQ(sr, 'hp', B.band[0], 0.8), new BQ(sr, 'lp', B.band[1], 0.8));
      if (B.stat) burst(o, sr, 0, { dur: 0.01, t60: 0.008, gain: B.stat, R, filters: [['bp', 3000, 1]] });
      if (B.click) clink(o, sr, 0, { f: 3000, amp: B.click * 0.4, t60: 0.006, R });
      return o;
    },
  };
}

export const BLIP_SFX = {};
for (const [k, B] of Object.entries(BLIPS)) BLIP_SFX[`blip_${k}`] = blipEntry(B);

/** Character id (or blip name) → blip sfx id; null when the speaker has no blip. */
export function blipId(charId) {
  if (!charId) return null;
  const c = CHARS[charId];
  if (c) {
    if (c.blip === null || c.blip === 'colonel') return null;
    const name = c.blip || charId;
    return BLIP_SFX[`blip_${name}`] ? `blip_${name}` : 'blip_neutral';
  }
  return BLIP_SFX[`blip_${charId}`] ? `blip_${charId}` : 'blip_neutral';
}

// ---- formant voices (murmur & crowd) ---------------------------------------------------------
// Rough vowel formants [F1, F2, F3] (adult male; scaled for higher voices).
const VOWELS = [[300, 870, 2240], [400, 2000, 2550], [520, 1190, 2390], [660, 1720, 2410], [730, 1090, 2440], [570, 840, 2410], [440, 1020, 2240], [330, 2300, 3000]];

/** One babbling formant voice inside Voice V. opts: f0, scale (formant scale), level, pan,
 *  rate (syllables/s), talk (probability a phrase continues), lp, seed, dur (null = forever),
 *  dest (node to connect to; default V.out). Syllables are scheduled by an engine task. */
export function formantVoice(V, eng, o) {
  const R = eng.R.fork();
  const ctx = V.ctx;
  const src = V.osc('sawtooth', o.f0);
  const sub = o.sub ? V.osc('sawtooth', o.f0 * 0.5, 7) : null;
  // slow random intonation
  const pc = V.src(eng.curve(10, o.seed || 0), 2 / R.range(2.5, 4.5), true);
  const pcg = V.gain(o.f0 * (o.inton ?? 0.09));
  pc.connect(pcg); pcg.connect(src.frequency);
  if (sub) { const pg2 = V.gain(o.f0 * (o.inton ?? 0.09) * 0.5); pc.connect(pg2); pg2.connect(sub.frequency); }
  const mixIn = V.gain(1);
  src.connect(mixIn);
  if (sub) { const sg = V.gain(o.sub); sub.connect(sg); sg.connect(mixIn); }
  const breath = V.noise('pink'); const bg = V.gain(o.breath ?? 0.15); breath.connect(bg); bg.connect(mixIn);
  const F = [V.filter('bandpass', 500, 5), V.filter('bandpass', 1500, 7), V.filter('bandpass', 2500, 9)];
  const FG = [V.gain(1), V.gain(0.45), V.gain(0.18)];
  const amp = V.gain(0);
  for (let k = 0; k < 3; k++) { mixIn.connect(F[k]); F[k].connect(FG[k]); FG[k].connect(amp); }
  const lp = V.filter('lowpass', o.lp || 2600, 0.7);
  amp.connect(lp);
  let tail = lp;
  if (o.pan != null && ctx.createStereoPanner) { const p = V.pan(o.pan); lp.connect(p); tail = p; }
  const lvl = V.gain(o.level ?? 1);
  tail.connect(lvl); lvl.connect(o.dest || V.out);
  const sources = [src, breath, pc].concat(sub ? [sub] : []);
  const start = V.t0, end = o.dur != null ? start + o.dur / V.rate : null;
  for (const s of sources) V.play(s, 0, o.dur != null ? o.dur + 0.4 : null);
  const scale = o.scale || 1, rate = o.rate || 4.5;
  let speaking = (o.talk ?? 0.85) > 0.95 || R.chance(0.7); // a lone speaker starts talking at once
  eng.addTask(start + R.range(0, 0.4), (t) => {
    if (V.disposed || V.stopping) return null;
    if (end != null && t >= end - 0.05) { amp.gain.setTargetAtTime(0, t, 0.05); return null; }
    const sd = R.range(0.6, 1.4) / rate;
    if (speaking) {
      const v = R.pick(VOWELS);
      for (let k = 0; k < 3; k++) F[k].frequency.setTargetAtTime(v[k] * scale * R.jit(1, 0.05), t, 0.03);
      const pk = R.range(0.5, 1);
      amp.gain.setTargetAtTime(pk, t, 0.025);
      amp.gain.setTargetAtTime(pk * 0.25, t + sd * 0.65, 0.03);
      if (R.chance(1 - (o.talk ?? 0.85))) speaking = false;
    } else {
      amp.gain.setTargetAtTime(0, t, 0.06);
      if (R.chance(0.45)) speaking = true;
    }
    return t + sd * (speaking ? 1 : R.range(1, 3));
  }, V);
  return lvl;
}

export const VOICE_SFX = {
  /** The Colonel's murmur under his lines: low, wet, indistinct; length = opts.dur. */
  colonel_murmur: { bus: 'sfx', wet: 1.1, dur: 2, jit: 0, vjit: 0.5, max: 1, graph(V, opts, eng) {
    const dur = Math.max(0.4, opts.dur ?? 1.5);
    V.out.gain.setValueAtTime(0, V.T(0));
    V.out.gain.linearRampToValueAtTime(1, V.T(0.12));
    V.out.gain.setValueAtTime(1, V.T(Math.max(0.13, dur - 0.25)));
    V.out.gain.linearRampToValueAtTime(0, V.T(dur + 0.1));
    formantVoice(V, eng, { f0: eng.R.range(64, 72), scale: 0.78, rate: 3.2, talk: 0.97, sub: 0.6, breath: 0.25, lp: 1100, level: 0.45, inton: 0.07, dur: dur + 0.15, seed: 3 });
    // wet undertone: a slow gurgle under the voice
    const n = V.noise('pink'), bp = V.filter('bandpass', 420, 3), g = V.gain(0.06);
    const am = V.src(eng.curve(24, 5), 2 / 1.3, true), amg = V.gain(0.05);
    am.connect(amg); amg.connect(g.gain);
    V.chain(n, bp, g, V.out);
    V.play(n, 0, dur + 0.2); V.play(am, 0, dur + 0.2);
    V.end = V.T(dur + 0.4);
  } },
  /** Indistinct crowd (12 detuned formant voices), e.g. the 1979 assembly through the PA. */
  crowd_murmur: { bus: 'sfx', wet: 1.3, dur: 4.6, jit: 0, max: 2, graph(V, opts, eng) {
    const dur = opts.dur ?? 4.5;
    V.out.gain.setValueAtTime(0, V.T(0));
    V.out.gain.linearRampToValueAtTime(1, V.T(0.6));
    V.out.gain.setValueAtTime(1, V.T(dur - 0.8));
    V.out.gain.linearRampToValueAtTime(0, V.T(dur));
    crowd(V, eng, { n: 12, dur, level: 0.32 });
    V.end = V.T(dur + 0.3);
  } },
};

/** A crowd of formant voices into V.out (band-limited, slightly distant). */
export function crowd(V, eng, { n = 12, dur = null, level = 0.15, kids = 0.5, lp = 2400, dest = null } = {}) {
  const R = eng.R.fork();
  const bus = V.gain(1), hp = V.filter('highpass', 160, 0.7), lpf = V.filter('lowpass', lp, 0.7);
  V.chain(bus, hp, lpf, dest || V.out);
  for (let i = 0; i < n; i++) {
    const kid = R.chance(kids);
    formantVoice(V, eng, {
      f0: kid ? R.range(200, 280) : R.range(95, 150), scale: kid ? R.range(1.15, 1.3) : R.range(0.92, 1.05),
      rate: R.range(3.5, 5.5), talk: R.range(0.8, 0.92), breath: 0.2, lp: 3000, level: level * R.range(0.6, 1),
      pan: R.range(-0.8, 0.8), inton: 0.1, dur, seed: i + 11, dest: bus,
    });
  }
  return bus;
}
