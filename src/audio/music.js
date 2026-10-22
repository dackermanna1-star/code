// Music tracks. Every arrangement of the alma mater is sequenced bar by bar by an engine task
// (so loops are seamless by construction and render identically offline); drones and pads are
// continuous graphs with slow random modulation and sparse scheduled events.
//
// title        detuned music box, sparse, big reverb (loops with a lonely rest bar)
// phonograph   the alma mater on a warped 78: band through a narrow, driven horn; wow, crackle
// ending_good  Leah's tape: lo-fi finger-picked guitar (second pass an octave up)
// ending_true  fragile piano, rubato, lots of air
// credits      piano + picked waltz + soft pad; music box doubles on alternate passes
// drone_1..3   passing-time drones, each act lower and darker
// chase        pulsing distorted sub + irregular junk-metal hits; no melody
// register     near-silent tension pad
// ending_bad   one detuned music-box note, repeating, slowing, fading — then nothing
// clarinet     Ch6 (Denise): the alma mater on one clarinet in the empty gym — a player breathing, rubato,
//              tongued phrase starts and slurs, hard walls; two bars of breath before she starts again
// clarinet_far the same performance from down the hall (lobby / east hall): dark, distant, mostly room.
//              Both share one performance clock, so switching far → near carries on mid-tune.
import { Voice } from './voice.js';
import { dbToGain, cents } from './dsp.js';
import { MELODY_BARS, HARMONY_BARS, below } from './alma.js';
import { MUSIC_BOX, PIANO, PLUCK, SUB_PULSE, JUNK_HIT, cornet, clarinet, clarinetSolo, tuba, horn, pad } from './instruments.js';
import { noiseLayer, modulate } from './layers.js';

MUSIC_BOX.id = 'mus_box'; PIANO.id = 'mus_piano'; PLUCK.id = 'mus_pluck'; SUB_PULSE.id = 'mus_sub'; JUNK_HIT.id = 'mus_junk';

const spb = (bpm) => 60 / bpm;

/** Output calibration per track (dB), measured with tools/audio-qa.mjs (≈ -20 dBFS RMS;
 *  'register' and 'ending_bad' are meant to sit near silence). */
export const TRACK_GAIN = {
  title: 0, phonograph: 0, ending_good: 2.5, ending_true: -0.5, credits: -2.5,
  drone_1: -1.5, drone_2: -2, drone_3: -4, chase: -8, register: 0, ending_bad: 0,
  clarinet: -6, clarinet_far: -11.5,
};
/** The chord sounding at a beat inside a bar. */
function chordAt(bar, beat) {
  let cur = HARMONY_BARS[bar][0][1];
  for (const [b, ch] of HARMONY_BARS[bar]) if (beat >= b) cur = ch;
  return cur;
}

export class Track {
  constructor(eng, id, def, { fade = 2, dest, send }) {
    this.eng = eng; this.id = id; this.R = eng.R.fork();
    const t0 = eng.now + 0.05;
    this.t0 = t0;
    this.core = new Voice(eng, { id: `music:${id}`, dest, send, wet: 0.35, t0, vol: dbToGain(TRACK_GAIN[id] ?? 0) });
    this.core.end = Infinity;
    const g = this.core.out.gain;
    g.setValueAtTime(0, t0); g.linearRampToValueAtTime(1, t0 + Math.max(0.05, fade));
    this.input = this.core.gain(1);
    this.post = this.core.gain(1);
    this.input.connect(this.post); this.post.connect(this.core.out);
    this.notes = []; this.srcs = new Set(); this.tasks = [];
    this.stopped = false; this.end = Infinity;
    def(this, eng);
  }

  // ---- routing -------------------------------------------------------------------------------
  wet(v) { if (this.core.wet) this.core.wet.gain.value = v; }
  /** Insert an effect chain between the instrument bus and the fader. */
  fx(...nodes) {
    this.input.disconnect();
    this.core.chain(this.input, ...nodes, this.post);
  }
  filter(type, f, q = 0.707, g = 0) { return this.core.filter(type, f, q, g, false); }
  gain(v) { return this.core.gain(v); }
  shaper(drive = 2) {
    const n = 1024, c = new Float32Array(n), k = Math.tanh(drive);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / k; }
    return this.core.shaper(c, '2x');
  }
  /** Tape/disc speed wobble: a delay line whose time is modulated (pitch = derivative). */
  wow(depth = 0.002, rate = 0.5, flutter = 0.0002, frate = 7) {
    const V = this.core, d = V.delay(0.03 + depth + flutter, 0.1);
    for (const [r, dp] of [[rate, depth], [frate, flutter]]) {
      if (!dp) continue;
      const o = V.osc('sine', r), g = V.gain(dp);
      o.connect(g); g.connect(d.delayTime); V.play(o, 0, null);
    }
    modulate(V, this.eng, d.delayTime, { period: 9, points: 8, depth: depth * 0.6, seed: 77 });
    return d;
  }

  // ---- notes ---------------------------------------------------------------------------------
  /** Play a cached instrument buffer at absolute time t. */
  buf(entry, opts, t, gain = 1, rate = 1, dest = this.input) {
    if (this.stopped) return;
    const eng = this.eng, ctx = eng.ctx;
    const b = eng.buffer(entry.id, entry, opts);
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = b; s.playbackRate.value = rate; g.gain.value = gain;
    s.connect(g); g.connect(dest);
    const at = Math.max(ctx.currentTime, t);
    s.start(at); s.stop(at + b.duration / rate + 0.01);
    this.srcs.add(s);
    s.onended = () => { this.srcs.delete(s); try { s.disconnect(); g.disconnect(); } catch { /* ignore */ } };
  }
  /** A graph note: build(V) inside a fresh Voice starting at t. */
  note(t, build, dest = this.input) {
    if (this.stopped) return null;
    const V = new Voice(this.eng, { id: 'note', dest, send: null, t0: Math.max(this.eng.now, t) });
    build(V);
    this.notes.push(V);
    return V;
  }
  mb(t, midi, vel, tune) { this.buf(MUSIC_BOX, { midi, cents: Math.round(tune ? tune(midi) : 0) }, t, vel * 0.55, 1 + this.R.bi() * 0.0015); }
  piano(t, midi, vel) { this.buf(PIANO, { midi, vel }, t, 0.55 * (0.4 + vel)); }
  pluck(t, midi, vel) { this.buf(PLUCK, { midi, vel }, t, 0.5 * (0.3 + vel), 1 + this.R.bi() * 0.001); }

  // ---- scheduling ----------------------------------------------------------------------------
  /** Bar sequencer: barFn(t, bar, loop, beatSec) schedules one bar starting at t and returns
   *  its length in seconds (default 3 beats). Bars wrap at nBars (loop++). */
  seq(bpm, nBars, barFn, { start = 0, bar: bar0 = 0 } = {}) {
    let bar = bar0 % nBars, loop = 0;
    const task = this.eng.addTask(this.t0 + start, (t) => {
      if (this.stopped) return null;
      const len = barFn(t, bar, loop, spb(bpm)) ?? 3 * spb(bpm);
      if (++bar >= nBars) { bar = 0; loop++; }
      return t + len;
    }, this);
    this.tasks.push(task);
  }
  every([g0, g1], fn, { start = null } = {}) {
    const R = this.R;
    const task = this.eng.addTask(this.t0 + (start ? R.range(start[0], start[1]) : R.range(g0, g1)), (t) => { if (this.stopped) return null; fn(t); return t + R.range(g0, g1); }, this);
    this.tasks.push(task);
  }

  // ---- lifecycle -----------------------------------------------------------------------------
  sweep(now) {
    if (this.notes.length > 24) this.notes = this.notes.filter((v) => { if (now > v.end + 0.1) { v.dispose(); return false; } return true; });
  }
  stop(fade = 2) {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.eng.now, g = this.core.out.gain, f = Math.max(0.03, fade);
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
    g.linearRampToValueAtTime(0, t + f);
    for (const task of this.tasks) task.dead = true;
    this.end = t + f + 0.1;
  }
  dispose() {
    for (const s of this.srcs) { try { s.stop(); s.disconnect(); } catch { /* ignore */ } }
    this.srcs.clear();
    for (const v of this.notes) v.dispose();
    this.notes = [];
    this.core.dispose();
  }
}

// ---- shared continuous pieces ------------------------------------------------------------------
/** Drone: detuned saw pairs on `tones` (Hz) → slowly moving low-pass; sub; air; shimmer. */
function drone(T, eng, { tones, lp, lpMod, level, sub, subLevel = -6, air = -24, airF = 600, shimmer = [], shimLevel = -26, mid = null, seed = 1 }) {
  const V = T.core, out = V.gain(dbToGain(level));
  out.connect(T.input);
  const f = V.filter('lowpass', lp, 0.9);
  f.connect(out);
  modulate(V, eng, f.frequency, { period: 37, points: 10, depth: lpMod, seed });
  // a slow, vowel-like resonance over the same oscillators: mid presence on small speakers
  let mf = null;
  if (mid) {
    mf = V.filter('bandpass', mid.f, mid.q || 5);
    const mg = V.gain(dbToGain(mid.level));
    mf.connect(mg); mg.connect(out);
    modulate(V, eng, mf.frequency, { period: 41, points: 9, depth: mid.f * 0.4, seed: seed + 50 });
    modulate(V, eng, mg.gain, { period: 27, points: 8, depth: dbToGain(mid.level) * 0.7, seed: seed + 51 });
  }
  tones.forEach((hz, i) => {
    for (const dt of [-7, 6]) {
      const o = V.osc('sawtooth', hz, dt + i * 1.3), g = V.gain(0.5 / (1 + i * 0.4));
      o.connect(g); g.connect(f); if (mf) g.connect(mf); V.play(o, 0, null);
      modulate(V, eng, o.detune, { period: 23 + i * 7, points: 8, depth: 4, seed: seed + i * 3 + (dt > 0 ? 1 : 0) });
    }
  });
  if (sub) { const s = V.osc('sine', sub), sg = V.gain(dbToGain(subLevel)); s.connect(sg); sg.connect(out); V.play(s, 0, null); modulate(V, eng, sg.gain, { period: 19, points: 8, depth: dbToGain(subLevel) * 0.4, seed: seed + 20 }); }
  noiseLayer(V, eng, { color: 'pink', filters: [['bandpass', airF, 0.8]], level: air, dest: out, mod: { period: 29, depth: 0.6, seed: seed + 30 } });
  shimmer.forEach((hz, i) => {
    const o = V.osc('sine', hz), g = V.gain(dbToGain(shimLevel));
    o.connect(g); g.connect(out); V.play(o, 0, null);
    modulate(V, eng, g.gain, { period: 13 + i * 5, points: 10, depth: dbToGain(shimLevel) * 0.95, seed: seed + 40 + i });
  });
  return out;
}

/** A slow brass-like swell (drone events). */
function swell(T, t, hz, dur, vel, lp = 420) {
  T.note(t, (V) => {
    const f = V.filter('lowpass', lp, 1), g = V.gain(0);
    g.gain.setValueAtTime(0, V.T(0)); g.gain.linearRampToValueAtTime(0.18 * vel, V.T(dur * 0.55)); g.gain.linearRampToValueAtTime(0, V.T(dur));
    f.connect(g); g.connect(V.out);
    for (const d of [-9, 0, 8]) { const o = V.osc('sawtooth', hz, d); o.connect(f); V.play(o, 0, dur + 0.05); }
  });
}

/** Denise's clarinet: one player, the alma mater, unaccompanied (Ch6 VI.3–4). */
const CLAR_BPM = 84, CLAR_BARS = 18, CLAR_TON = 58; // B-flat like the band record, low chalumeau register
const CLAR_DYN = [0.6, 0.64, 0.72, 0.58, 0.64, 0.7, 0.76, 0.6, 0.8, 0.84, 0.9, 0.94, 0.74, 0.66, 0.6, 0.5];
/** Bar length (s): rubato that breathes with the phrase, longer at the cadences, two rest bars. */
function clarBarLen(bar) {
  const beat = spb(CLAR_BPM);
  if (bar >= 16) return beat * 3;
  return beat * 3 * (1 + 0.06 * Math.sin(bar * 1.7)) * (bar === 15 ? 1.25 : bar === 7 ? 1.12 : bar === 3 || bar === 11 ? 1.06 : 1);
}
const CLAR_LOOP = Array.from({ length: CLAR_BARS }, (_, b) => clarBarLen(b)).reduce((a, b) => a + b, 0);

function soloClarinet(T, eng, far) {
  const R = T.R, V = T.core;
  // the room: in the gym she is right there (hard walls, a long tail); from the halls it is mostly the room
  if (far) T.fx(T.filter('highpass', 240), T.filter('lowpass', 1500, 0.6), T.filter('lowpass', 2300, 0.5));
  else T.fx(T.filter('highpass', 150), T.filter('lowpass', 4400, 0.6));
  T.wet(far ? 1 : 0.6);
  // early reflections off bare walls / lockers (parallel, into the fader)
  for (const [d, lvl, lpf] of far ? [[0.13, -8, 1100], [0.29, -12, 900], [0.47, -17, 750]] : [[0.083, -15, 2600], [0.191, -18, 1900], [0.34, -24, 1400]]) {
    const dl = V.delay(d, 1), lp = V.filter('lowpass', lpf, 0.7, 0, false), g = V.gain(dbToGain(lvl));
    T.input.connect(dl); V.chain(dl, lp, g, T.post);
  }
  // one performance clock for both versions: a new track picks the tune up where it is
  const now = T.t0 + 0.3;
  let clk = eng.clarinetClock;
  if (!clk || now - clk.alive > 6) clk = eng.clarinetClock = { t: now, alive: now };
  const e = (now - clk.t) % CLAR_LOOP;
  let bar = 0, acc = 0;
  while (bar < CLAR_BARS - 1 && acc + clarBarLen(bar) <= e) acc += clarBarLen(bar++);
  let start = now - e + acc;
  if (start < now - 0.05) { start += clarBarLen(bar); bar = (bar + 1) % CLAR_BARS; }
  T.seq(CLAR_BPM, CLAR_BARS, (t, b) => {
    clk.alive = t;
    if (b >= 16) return clarBarLen(b); // she breathes, then starts again
    const bt = clarBarLen(b) / 3;
    const notes = MELODY_BARS[b];
    notes.forEach(([at, d, dur], i) => {
      const last = i === notes.length - 1;
      const phraseEnd = last && b % 4 === 3;
      // tongue the phrase starts (and now and then a bar start); slur the rest
      const slur = i > 0 || (b % 4 !== 0 && R.chance(0.55));
      const nextSlur = !last || (b + 1) % 4 !== 0;
      const len = dur * bt * (phraseEnd ? 0.8 : nextSlur ? 1.0 : 0.9);
      T.note(t + at * bt + R.range(0, 0.02), (W) => clarinetSolo(W, CLAR_TON + d, len, CLAR_DYN[b] * R.range(0.93, 1.04), { slur, seed: R.r(), rel: phraseEnd ? 0.3 : nextSlur ? 0.05 : 0.1 }));
    });
    return bt * 3;
  }, { start: start - T.t0, bar });
}

// =================================================================================================
export const TRACKS = {
  title(T, eng) {
    const R = T.R, TON = 74, beat = spb(76); // D major, music box register
    const tune = new Map();
    const detune = (m) => { if (!tune.has(m)) tune.set(m, R.gauss() * 12 + (R.chance(0.15) ? R.pick([-35, 32]) : 0)); return tune.get(m); };
    T.fx(T.wow(0.0016, 0.33, 0.00018, 4.7), T.filter('highpass', 160), T.filter('lowpass', 7500));
    T.wet(0.55);
    // the box being wound before it first plays
    for (let k = 0; k < 7; k++) eng.play('safe_click', { t: T.t0 + 0.15 + k * 0.13, dest: T.input, send: null, vol: 0.18 });
    T.seq(76, 17, (t, bar, loop) => {
      if (bar === 16) { // rest bar: one lonely high tine
        T.mb(t + beat * 1.5, TON + 24 + (loop % 2 ? 2 : 0), 0.22, detune);
        return beat * 3 * 1.4;
      }
      const bt = beat * (bar === 15 ? 1.14 : bar === 14 ? 1.05 : 1);
      for (const [b, d] of MELODY_BARS[bar]) T.mb(t + b * bt + R.bi() * 0.012, TON + d, (b === 0 ? 0.95 : 0.8) * R.range(0.9, 1.05), detune);
      const ch = HARMONY_BARS[bar][0][1];
      if (bar % 2 === 0 || bar >= 12) T.mb(t + R.range(0, 0.01), TON - 12 + ch[0], 0.45, detune);
      if (bar % 4 === 1) T.mb(t + bt, TON + below(MELODY_BARS[bar][0][1], ch, 3), 0.28, detune);
      return bt * 3;
    }, { start: 1.3 });
  },

  phonograph(T, eng) {
    const TON = 70, beat = spb(92); // B-flat, school band
    T.fx(T.gain(0.22), T.shaper(1.8), T.gain(0.5), T.filter('highpass', 300, 0.7), T.filter('peaking', 1400, 1, 5), T.filter('lowpass', 3400, 0.8), T.filter('lowpass', 4200, 0.6), T.wow(0.0025, 0.55, 0.00025, 7.5));
    T.wet(0.22);
    // surface noise is on the disc, not in the band: it bypasses the wow but not the horn
    T.every([3.3, 3.3], (t) => eng.play('record_crackle', { t, dest: T.post, send: null, vol: 0.32 }), { start: [0, 0.01] });
    noiseLayer(T.core, eng, { color: 'white', filters: [['bandpass', 3000, 0.5]], level: -46, dest: T.post });
    T.seq(92, 17, (t, bar) => {
      if (bar === 16) return beat * 3; // the run-out groove: crackle only
      for (const [b, d, dur] of MELODY_BARS[bar]) {
        T.note(t + b * beat, (V) => cornet(V, TON + d, dur * beat * 0.9, 0.85));
        T.note(t + b * beat, (V) => clarinet(V, TON + below(d, chordAt(bar, b), 3), dur * beat * 0.9, 0.55));
      }
      for (const [b, ch, dur] of HARMONY_BARS[bar]) {
        T.note(t + b * beat, (V) => tuba(V, TON - 24 + ch[0], beat * 0.85, 0.85));
        for (let k = b + 1; k < b + dur; k++) T.note(t + k * beat, (V) => horn(V, ch.slice(0, 3).map((x) => TON - 12 + x), beat * 0.35, 0.6));
      }
      return beat * 3;
    }, { start: 0.6 });
  },

  ending_good(T, eng) {
    const R = T.R, TON = 67, beat = spb(84); // G major, Leah's tape
    T.fx(T.wow(0.0011, 0.45, 0.00012, 6), T.gain(0.45), T.shaper(1.25), T.filter('lowpass', 5200, 0.7), T.filter('highpass', 90));
    T.wet(0.3);
    noiseLayer(T.core, eng, { color: 'white', filters: [['bandpass', 5000, 0.4]], level: -50, dest: T.post });
    T.seq(84, 16, (t, bar, loop) => {
      const oct = loop % 2 ? 12 : 0;
      for (const [b, ch, dur] of HARMONY_BARS[bar]) {
        T.pluck(t + b * beat, TON - 24 + ch[0], 0.55);
        const mid = ch.slice(1).map((x) => TON - 12 + x);
        for (let e = b * 2 + 2; e < (b + dur) * 2; e++) T.pluck(t + e * beat / 2 + R.range(0, 0.012), mid[(e + bar) % mid.length], e % 2 ? 0.22 : 0.3);
      }
      for (const [b, d] of MELODY_BARS[bar]) T.pluck(t + b * beat + R.range(0.004, 0.016), TON + d + oct, 0.8);
      return beat * 3;
    }, { start: 0.4 });
  },

  ending_true(T) {
    const R = T.R, TON = 72, beat = spb(58); // C major, slow
    T.wet(0.6);
    T.seq(58, 18, (t, bar) => {
      if (bar >= 16) return beat * 3; // two bars of air before it begins again
      const bt = beat * (1 + 0.05 * Math.sin(bar * 1.3)) * (bar === 15 ? 1.22 : bar === 7 ? 1.1 : 1);
      for (const [b, d] of MELODY_BARS[bar]) T.piano(t + b * bt + R.range(-0.015, 0.035), TON + d, R.range(0.32, 0.48));
      for (const [b, ch] of HARMONY_BARS[bar]) {
        T.piano(t + b * bt, TON - 24 + ch[0], 0.26);
        T.piano(t + b * bt + 0.07, TON - 12 + ch[ch.length > 2 ? 2 : 1], 0.2);
        if (bar % 2 === 1) T.piano(t + (b + 1) * bt + 0.03, TON - 12 + ch[1], 0.16);
      }
      return bt * 3;
    }, { start: 0.5 });
  },

  credits(T) {
    const R = T.R, TON = 65, beat = spb(80); // F major
    T.wet(0.45);
    T.seq(80, 16, (t, bar, loop) => {
      for (const [b, ch, dur] of HARMONY_BARS[bar]) {
        T.note(t + b * beat, (V) => pad(V, ch.slice(0, 3).map((x) => TON - 12 + x), dur * beat, 0.55, { a: 0.6, r: 1.2 }));
        T.pluck(t + b * beat, TON - 24 + ch[0], 0.5);
        for (let k = b + 1; k < b + dur; k++) { T.pluck(t + k * beat, TON - 12 + ch[1], 0.25); T.pluck(t + k * beat + 0.01, TON - 12 + ch[2], 0.22); }
      }
      for (const [b, d] of MELODY_BARS[bar]) {
        T.piano(t + b * beat + R.range(0, 0.02), TON + d, 0.45);
        if (loop % 2) T.mb(t + b * beat + 0.01, TON + 12 + d, 0.3);
      }
      return beat * 3;
    }, { start: 0.5 });
  },

  ending_bad(T, eng) {
    // one tine, badly out, repeating slower and quieter until it stops
    const R = T.R, midi = 81, ct = -38;
    T.wet(0.7);
    let gap = 2.6, amp = 0.7, k = 0;
    const task = eng.addTask(T.t0 + 0.5, (t) => {
      if (T.stopped || k >= 15) return null;
      T.buf(MUSIC_BOX, { midi, cents: ct }, t, amp * 0.55, 1 + R.bi() * 0.002);
      k++; amp *= 0.86;
      const g = gap; gap *= 1.09;
      return t + g;
    }, T);
    T.tasks.push(task);
  },

  drone_1(T, eng) {
    T.wet(0.4);
    drone(T, eng, { tones: [55, 82.41, 110], lp: 320, lpMod: 140, level: -14, sub: 55, subLevel: -10, air: -26, shimmer: [440 * 1.002, 659.25], shimLevel: -34, mid: { f: 620, q: 6, level: 9 }, seed: 1 });
    T.every([18, 40], (t) => swell(T, t, T.R.pick([110, 164.81, 146.83]), T.R.range(6, 9), 0.5), { start: [8, 16] });
  },
  drone_2(T, eng) {
    T.wet(0.45);
    drone(T, eng, { tones: [43.65, 87.31, 92.5], lp: 240, lpMod: 110, level: -13, sub: 43.65, subLevel: -8, air: -24, airF: 420, shimmer: [1396.9, 1479.98], shimLevel: -38, mid: { f: 480, q: 7, level: 9 }, seed: 5 });
    noiseLayer(T.core, eng, { color: 'brown', filters: [['lowpass', 300, 0.7]], level: -30, dest: T.input, mod: { period: 17, depth: 0.5, seed: 8 } });
    T.every([20, 40], (t) => { T.buf(SUB_PULSE, {}, t, 0.35, 0.7); T.buf(SUB_PULSE, {}, t + 0.38, 0.25, 0.7); }, { start: [10, 20] });
    T.every([30, 60], (t) => T.buf(JUNK_HIT, {}, t, 0.12, 0.5), { start: [15, 30] });
  },
  drone_3(T, eng) {
    T.wet(0.5);
    drone(T, eng, { tones: [36.71, 51.91, 73.42, 74.2], lp: 180, lpMod: 80, level: -12, sub: 36.71, subLevel: -6, air: -24, airF: 300, shimmer: [], mid: { f: 360, q: 8, level: 12 }, seed: 9 });
    noiseLayer(T.core, eng, { color: 'brown', filters: [['lowpass', 150, 0.7]], level: -26, dest: T.input, mod: { period: 11, depth: 0.6, seed: 12 } });
    T.every([25, 50], (t) => T.buf(SUB_PULSE, {}, t, 0.45, 0.55), { start: [6, 14] });
    T.every([20, 45], (t) => eng.play('amb_timber', { t, dest: T.input, send: null, vol: 0.35, rate: 0.6 }), { start: [12, 24] });
    T.every([28, 34], (t) => { T.buf(SUB_PULSE, {}, t, 0.3, 0.8); T.buf(SUB_PULSE, {}, t + 0.3, 0.22, 0.8); }, { start: [18, 28] });
  },

  chase(T, eng) {
    const R = T.R, st = spb(132) / 4;
    T.wet(0.3);
    // tension bed: detuned low saws with a nervous filter + a tremolo'd high noise band
    const V = T.core, f = V.filter('lowpass', 260, 2), g = V.gain(dbToGain(-14));
    f.connect(g); g.connect(T.input);
    for (const hz of [41.2, 43.65, 82.4]) { const o = V.osc('sawtooth', hz); o.connect(f); V.play(o, 0, null); }
    const lfo = V.osc('sine', 0.31), lg = V.gain(120); lfo.connect(lg); lg.connect(f.frequency); V.play(lfo, 0, null);
    const hi = noiseLayer(V, eng, { color: 'white', filters: [['bandpass', 3200, 4]], level: -34, dest: T.input });
    const trem = V.osc('sine', 8), tg = V.gain(dbToGain(-34) * 0.8); trem.connect(tg); tg.connect(hi.out.gain); V.play(trem, 0, null);
    const PAT = [[0, 3, 6, 10, 12], [0, 3, 8, 11, 14], [0, 2, 6, 8, 12, 14], [0, 3, 6, 9, 12, 13], [0, 3, 7, 10, 13]];
    T.seq(132, 8, (t, bar, loop) => {
      for (const s of R.pick(PAT)) T.buf(SUB_PULSE, {}, t + s * st, s === 0 ? 0.9 : 0.62, 1 + R.bi() * 0.02);
      for (let s = 0; s < 16; s++) if (R.chance(s % 4 === 2 ? 0.3 : 0.12)) T.buf(JUNK_HIT, {}, t + s * st + R.range(0, 0.012), R.range(0.18, 0.42), R.range(0.85, 1.15));
      if (bar % 4 === 2) T.note(t, (W) => { // a two-bar noise riser
        const n = W.noise('white'), bp = W.filter('bandpass', 300, 1.5), a = W.gain(0);
        W.env(bp.frequency, [[0, 300], [st * 32, 3200, 'exp']]);
        W.env(a.gain, [[0, 0], [st * 31, 0.25], [st * 32, 0]]);
        W.chain(n, bp, a, W.out); W.play(n, 0, st * 32 + 0.05);
      });
      if (bar === 0 && loop % 2 === 0) { T.buf(SUB_PULSE, {}, t, 1, 0.6); T.buf(JUNK_HIT, {}, t, 0.5, 0.7); }
      return st * 16;
    }, { start: 0.2 });
  },

  clarinet(T, eng) { soloClarinet(T, eng, false); },
  clarinet_far(T, eng) { soloClarinet(T, eng, true); },

  register(T, eng) {
    T.wet(0.8);
    const V = T.core, out = V.gain(dbToGain(-30));
    out.connect(T.input);
    [1567.98, 1661.22, 2093.0].forEach((hz, i) => {
      const o = V.osc('sine', hz), g = V.gain(dbToGain(-16));
      o.connect(g); g.connect(out); V.play(o, 0, null);
      modulate(V, eng, g.gain, { period: 17 + i * 6, points: 8, depth: dbToGain(-16) * 0.9, seed: 90 + i });
    });
    const s = V.osc('sine', 32.7), sg = V.gain(dbToGain(-2)); s.connect(sg); sg.connect(out); V.play(s, 0, null);
    noiseLayer(V, eng, { color: 'pink', filters: [['bandpass', 400, 1]], level: -18, dest: out, mod: { period: 21, depth: 0.7, seed: 95 } });
    T.every([20, 40], (t) => T.note(t, (W) => pad(W, [36, 37, 43], 7, 0.25, { lp: 500, a: 3, r: 4 })), { start: [10, 20] });
  },
};
