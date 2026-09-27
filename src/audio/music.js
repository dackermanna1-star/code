// Dynamic, fully synthesised music: layered detuned-saw strings, FM-ish brass,
// additive piano, music-box bells, formant choir, taiko-like percussion
// (pre-rendered kit buffers) and dissonant clusters. A lookahead scheduler
// places notes on the AudioContext clock, so every state loops seamlessly.
// All material is original.

import { mtof, noiseBuffers } from './dsp.js';

export const MUSIC_STATES = ['none', 'calm', 'tension', 'combat', 'horde', 'tank', 'witch', 'finale', 'rescue'];
export const STINGER_NAMES = ['hordeIncoming', 'tank', 'witch', 'hunterNear', 'smokerNear', 'boomerNear', 'pinned', 'incap', 'death',
  'safeRoom', 'chapterStart', 'finaleStart', 'rescueArrive', 'escape', 'objective'];

const LOOKAHEAD = 0.35;

// ---------------------------------------------------------------------------
// Percussion kit (pre-rendered like the SFX, see audioEngine.js)

export const MUSIC_KIT = {
  mus_taikoLo: {
    v: 4, dur: 1.8, sr: 32000, level: 0.9, cat: 'music', prio: 1,
    build(K) {
      const sat = K.shaper(1.8);
      K.thump(0.001, { f0: K.r(96, 112), f1: 42, sweep: 0.12, d: 1.1, amp: 1, dest: sat });
      K.burst(0.001, { d: 0.14, amp: 0.5, f: [['bandpass', 240, 1]], dest: sat, color: 'pink' });
      K.burst(0.001, { d: 0.02, amp: 0.35, f: [['bandpass', 1200, 1]], dest: sat });
      K.modal(0.001, [[K.r(62, 70), 0.9, 0.4], [K.r(145, 160), 0.3, 0.12]]);
    },
  },
  mus_taikoHi: {
    v: 4, dur: 0.9, sr: 32000, level: 0.8, cat: 'music', prio: 1,
    build(K) {
      K.thump(0.001, { f0: K.r(185, 205), f1: 100, sweep: 0.06, d: 0.45, amp: 1 });
      K.burst(0.001, { d: 0.06, amp: 0.6, f: [['bandpass', 600, 1]], color: 'pink' });
      K.burst(0.001, { d: 0.015, amp: 0.4, f: [['bandpass', 2200, 1]] });
    },
  },
  mus_boom: {
    v: 2, dur: 4, sr: 32000, level: 0.95, cat: 'music', prio: 1,
    build(K) {
      const sat = K.shaper(3);
      K.thump(0.001, { f0: 62, f1: 27, sweep: 0.35, d: 2.8, amp: 1.4, dest: sat });
      K.burst(0.001, { color: 'pink', d: 1.0, amp: 0.8, f: [['lowpass', 450]], dest: sat });
      K.burst(0.001, { d: 0.03, amp: 0.4, f: [['bandpass', 1500, 0.7]], dest: sat });
      K.burst(0.02, { color: 'brown', a: 0.1, d: 3, amp: 0.5, f: [['lowpass', 180]] });
    },
  },
  mus_rim: {
    v: 3, dur: 0.3, sr: 32000, level: 0.6, cat: 'music', prio: 1,
    build(K) {
      K.modal(0.001, [[K.r(900, 1100), 0.06, 0.6], [K.r(2400, 2700), 0.035, 0.3]]);
      K.click(0.001, { f: 3500, q: 2, d: 0.005, amp: 0.4 });
    },
  },
  mus_anvil: {
    v: 2, dur: 1.6, sr: 32000, level: 0.7, cat: 'music', prio: 1,
    build(K) {
      const f = K.r(420, 480);
      K.modal(0.001, [[f, 0.7, 0.5], [f * 2.76, 0.45, 0.35], [f * 5.4, 0.25, 0.25], [f * 8.93, 0.15, 0.12]]);
      K.burst(0.001, { d: 0.05, amp: 0.6, f: [['highpass', 2000]] });
      K.thump(0.001, { f0: 160, f1: 80, d: 0.1, amp: 0.4 });
    },
  },
  mus_snare: {
    v: 4, dur: 0.5, sr: 32000, level: 0.7, cat: 'music', prio: 1,
    build(K) {
      K.burst(0.001, { d: 0.18, amp: 1, f: [['bandpass', 3000, 0.7]] });
      K.thump(0.001, { f0: 210, f1: 170, d: 0.08, amp: 0.5 });
      K.crackle(0.002, 0.15, 3000, { len: [0.1, 0.3], dest: K.hp(3000), amp: 0.4 });
    },
  },
  mus_swell: {
    v: 2, dur: 2.2, sr: 32000, level: 0.8, cat: 'music', stereo: true, prio: 1,
    build(K) {
      for (const p of [-0.6, 0.6]) {
        const g = K.gain(0, K.pan(p));
        K.env(g.gain, 0, [[0, 0.0001], [2.05, 1, 'e'], [2.1, 0]]);
        K.noise(0, 2.1, 'white', K.hp(3500, 0.7, g));
        const b = K.bp(400, 1.5, K.gain(0.8, g));
        K.env(b.frequency, 0, [[0, 300], [2.05, 6000, 'e']]);
        K.noise(0, 2.1, 'pink', b);
      }
    },
  },
};

// ---------------------------------------------------------------------------
// Instruments (real-time synthesis on the live context)

function pianoWave(ctx) {
  const n = 16;
  const re = new Float32Array(n), im = new Float32Array(n);
  const amps = [0, 1, 0.55, 0.32, 0.25, 0.14, 0.11, 0.07, 0.05, 0.04, 0.03, 0.02, 0.015, 0.01, 0.008, 0.005];
  for (let i = 1; i < n; i++) im[i] = amps[i];
  return ctx.createPeriodicWave(re, im);
}

class Inst {
  constructor(ctx, music) {
    this.ctx = ctx;
    this.m = music;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.1;
    this.vib = ctx.createGain();
    this.vib.gain.value = 7;
    lfo.connect(this.vib);
    lfo.start();
    this._lfo = lfo;
    this.pw = pianoWave(ctx);
    this.nb = noiseBuffers(ctx);
  }
  _osc(type, f, t, end, dest, det = 0, vib = false) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = det;
    o.connect(dest);
    if (vib) {
      this.vib.connect(o.detune);
      o.onended = () => { try { this.vib.disconnect(o.detune); } catch (e) { /* ignore */ } };
    }
    o.start(t);
    o.stop(end);
    return o;
  }
  _gain(v, dest) { const g = this.ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  // disconnect a finished note's output node so the render graph never accumulates dead notes
  _free(node, end) { this.m._gc.push(node, end); }
  _filt(type, f, q, dest) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = Math.min(f, 16000); b.Q.value = q; if (dest) b.connect(dest); return b; }
  // ADSR-ish envelope. Returns stop time.
  _env(p, t, att, dur, rel, peak) {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + att);
    const te = t + Math.max(dur, att);
    p.setValueAtTime(peak, te);
    p.setTargetAtTime(0, te, Math.max(0.005, rel / 4));
    return te + rel * 1.6 + 0.05;
  }

  // sustained section strings (3 detuned saws)
  strings(dest, t, midi, dur, vel = 0.5, o = {}) {
    const f = mtof(midi);
    const g = this._gain(0, dest);
    const end = this._env(g.gain, t, o.att ?? 0.25, dur, o.rel ?? 0.6, vel * 0.07);
    const lp = this._filt('lowpass', f * (1.5 + (o.bright ?? 0.5) * 7) + 200, 0.6, g);
    if (o.swell) { lp.frequency.setValueAtTime(f * 1.2 + 100, t); lp.frequency.linearRampToValueAtTime(f * (2 + (o.bright ?? 0.5) * 9) + 300, t + dur); }
    this._free(g, end);
    const n = o.voices ?? 3;
    for (let i = 0; i < n; i++) {
      const osc = this._osc('sawtooth', f, t, end, lp, (i - (n - 1) / 2) * (o.spread ?? 10) + (Math.random() - 0.5) * 5, i === 0 && dur >= 0.9);
      if (o.glideTo) { osc.frequency.setValueAtTime(f, t); osc.frequency.exponentialRampToValueAtTime(mtof(o.glideTo), t + dur); }
    }
  }
  gliss(dest, t, m0, m1, dur, vel = 0.4, o = {}) { this.strings(dest, t, m0, dur, vel, Object.assign({ glideTo: m1, att: 0.08, rel: 0.4, bright: 0.8 }, o)); }
  // short bowed notes
  spiccato(dest, t, midi, vel = 0.5, len = 0.12, o = {}) {
    const f = mtof(midi);
    const g = this._gain(0, dest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.1, t + 0.006);
    g.gain.setTargetAtTime(0, t + 0.01, len / 3);
    const end = t + len * 2 + 0.05;
    this._free(g, end);
    const lp = this._filt('lowpass', Math.min(12000, f * (o.bright ?? 8) * 0.6 + 300), 0.8, g);
    this._osc('sawtooth', f, t, end, lp, -6);
    this._osc('sawtooth', f, t, end, lp, 6);
  }
  tremolo(dest, t, midi, dur, vel = 0.4, o = {}) {
    const am = this._gain(0.5, dest);
    const lfo = this.ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = o.rate ?? 13;
    const lg = this._gain(0.5, am.gain);
    lfo.connect(lg);
    lfo.start(t);
    lfo.stop(t + dur + 1.5);
    this._free(am, t + dur + 1.6);
    this.strings(am, t, midi, dur, vel * 1.3, Object.assign({ att: 0.15, rel: 0.4, bright: 0.7 }, o));
  }
  // brass: detuned saws + sub square, filter swell ("blat")
  brass(dest, t, midi, dur, vel = 0.6, o = {}) {
    const f = mtof(midi);
    const att = o.att ?? 0.06;
    let out = this._gain(0, dest);
    const end = this._env(out.gain, t, att, dur, o.rel ?? 0.35, vel * 0.09);
    this._free(out, end);
    let pre = out;
    if (o.dist) {
      const s = this.ctx.createWaveShaper();
      s.curve = this.m.curve(o.dist);
      s.connect(out);
      pre = s;
    }
    const lp = this._filt('lowpass', f * 2, 1.8, pre);
    const top = Math.min(14000, f * (3 + vel * 6));
    lp.frequency.setValueAtTime(f * 1.2, t);
    lp.frequency.linearRampToValueAtTime(top, t + att + 0.04);
    lp.frequency.linearRampToValueAtTime(f * (2 + vel * 2.5), t + att + 0.4);
    this._osc('sawtooth', f, t, end, lp, -5, dur >= 0.8);
    this._osc('sawtooth', f, t, end, lp, 5);
    if (o.sub !== false && midi < 62) this._osc('square', f / 2, t, end, this._gain(0.35, lp));
    return lp;
  }
  // brass with pitch bend (used by boomer stinger)
  tuba(dest, t, midi, dur, bendTo, vel = 0.7) {
    const f = mtof(midi);
    const g = this._gain(0, dest);
    const end = this._env(g.gain, t, 0.08, dur, 0.3, vel * 0.12);
    this._free(g, end);
    const lp = this._filt('lowpass', f * 4, 1.2, g);
    for (const det of [-18, 14]) {
      const o = this._osc('sawtooth', f, t, end, lp, det);
      o.frequency.setValueAtTime(f, t + dur * 0.3);
      o.frequency.exponentialRampToValueAtTime(mtof(bendTo), t + dur);
    }
  }
  piano(dest, t, midi, vel = 0.5, dur = 2.5) {
    const f = mtof(midi);
    const g = this._gain(0, dest);
    const pk = vel * 0.22;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(pk, t + 0.004);
    g.gain.setTargetAtTime(pk * 0.45, t + 0.005, 0.12);
    const dec = Math.max(0.5, 2.8 - (midi - 36) * 0.045);
    g.gain.setTargetAtTime(0, t + 0.3, dec / 3);
    g.gain.setTargetAtTime(0, t + dur, 0.12);
    const end = t + Math.min(dur + 0.6, 0.3 + dec * 2.2);
    this._free(g, end);
    const lp = this._filt('lowpass', Math.min(12000, f * 8 + 1500 * vel), 0.5, g);
    lp.frequency.setValueAtTime(Math.min(12000, f * 8 + 1500 * vel), t);
    lp.frequency.linearRampToValueAtTime(f * 2.2 + 300, t + 0.9);
    for (const det of [-1.5, 1.8]) {
      const o = this.ctx.createOscillator();
      o.setPeriodicWave(this.pw);
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(end);
    }
    // hammer
    const hs = this.ctx.createBufferSource();
    hs.buffer = this.nb.white;
    const hb = this._filt('bandpass', 2500, 1, null);
    const hg = this._gain(0, dest);
    hg.gain.setValueAtTime(vel * 0.03, t);
    hg.gain.setTargetAtTime(0, t, 0.006);
    hs.connect(hb); hb.connect(hg);
    hs.start(t, Math.random() * 3);
    hs.stop(t + 0.06);
    this._free(hg, t + 0.08);
  }
  bell(dest, t, midi, vel = 0.4, det = 0, dec = 1.6) {
    const f = mtof(midi) * Math.pow(2, det / 1200);
    for (const [r, a, d] of [[1, 1, dec], [2.0, 0.25, dec * 0.5], [4.2, 0.3, dec * 0.25], [6.8, 0.08, dec * 0.15]]) {
      if (f * r > 15000) continue;
      const g = this._gain(0, dest);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel * 0.12 * a, t + 0.002);
      g.gain.setTargetAtTime(0, t + 0.003, d / 4);
      this._osc('sine', f * r, t, t + d * 1.3, g);
      this._free(g, t + d * 1.3);
    }
  }
  choir(dest, t, midi, dur, vel = 0.4, vowel = 'a', o = {}) {
    const f = mtof(midi);
    const F = vowel === 'u' ? [350, 700, 2700] : vowel === 'o' ? [500, 850, 2800] : [800, 1150, 2900];
    const g = this._gain(0, dest);
    const end = this._env(g.gain, t, o.att ?? 0.6, dur, o.rel ?? 0.8, vel * 0.16);
    this._free(g, end);
    const sum = this._gain(1, g);
    const src = this._gain(1, null);
    F.forEach((ff, k) => { const b = this._filt('bandpass', ff, ff / 90, this._gain([1, 0.6, 0.25][k], sum)); src.connect(b); });
    this._osc('sawtooth', f, t, end, src, -7, true);
    this._osc('sawtooth', f, t, end, src, 7);
    this._osc('sawtooth', f * 1.002, t, end, src, 0);
  }
  sub(dest, t, midi, dur, vel = 0.5, o = {}) {
    const g = this._gain(0, dest);
    const end = this._env(g.gain, t, o.att ?? 0.05, dur, o.rel ?? 0.3, vel * 0.25);
    this._free(g, end);
    this._osc('sine', mtof(midi), t, end, g);
  }
  // aggressive distorted riff voice (tank)
  riff(dest, t, midi, dur, vel = 0.8) {
    const f = mtof(midi);
    const g = this._gain(0, dest);
    const end = this._env(g.gain, t, 0.005, dur, 0.08, vel * 0.1);
    this._free(g, end);
    const lp = this._filt('lowpass', f * 10, 3, g);
    lp.frequency.setValueAtTime(f * 14, t);
    lp.frequency.linearRampToValueAtTime(f * 3.5, t + 0.14);
    const s = this.ctx.createWaveShaper();
    s.curve = this.m.curve(5);
    s.connect(lp);
    const pre = this._gain(0.6, s);
    this._osc('sawtooth', f, t, end, pre, -9);
    this._osc('sawtooth', f, t, end, pre, 9);
    this._osc('square', f / 2, t, end, this._gain(0.7, pre));
  }
  // bowed metal / eerie scrape
  metal(dest, t, dur, f = 420, vel = 0.3) {
    const g = this._gain(0, dest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.05, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    for (const r of [1, 2.43, 3.97, 5.61]) {
      const o = this._osc('sine', f * r, t, t + dur + 0.05, this._gain(1 / r, g));
      o.frequency.setValueAtTime(f * r, t);
      o.frequency.linearRampToValueAtTime(f * r * 1.03, t + dur);
    }
    const n = this.ctx.createBufferSource();
    n.buffer = this.nb.white; n.loop = true;
    n.connect(this._filt('bandpass', f * 2.43, 20, this._gain(0.6, g)));
    n.start(t, Math.random() * 3); n.stop(t + dur + 0.05);
    this._free(g, t + dur + 0.1);
  }
  whisper(dest, t, dur, vel = 0.3) {
    const g = this._gain(0, dest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.25, t + dur * 0.5);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const n = this.ctx.createBufferSource();
    n.buffer = this.nb.white; n.loop = true;
    for (const [ff, q] of [[950, 6], [1500, 8], [2900, 10]]) {
      const f0 = ff * (0.9 + Math.random() * 0.2);
      const b = this._filt('bandpass', f0, q, g);
      b.frequency.setValueAtTime(f0, t);
      b.frequency.linearRampToValueAtTime(ff * 1.2, t + dur);
      n.connect(b);
    }
    n.start(t, Math.random() * 3); n.stop(t + dur + 0.05);
    this._free(g, t + dur + 0.1);
  }
  riser(dest, t, dur, vel = 0.5) {
    const g = this._gain(0, dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel * 0.3, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
    const b = this._filt('bandpass', 300, 2, g);
    b.frequency.setValueAtTime(250, t);
    b.frequency.exponentialRampToValueAtTime(5000, t + dur);
    const n = this.ctx.createBufferSource();
    n.buffer = this.nb.pink; n.loop = true;
    n.connect(b);
    n.start(t, Math.random() * 3); n.stop(t + dur + 0.05);
    this._free(g, t + dur + 0.1);
  }
  drum(dest, t, name, vel = 0.8, rate = 1, offset = 0) {
    const buf = this.m.engine && this.m.engine._pickBuffer(name);
    if (!buf) return;
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.04);
    const g = this._gain(vel * 0.55, dest);
    s.connect(g);
    s.start(Math.max(t, this.ctx.currentTime), Math.min(offset, buf.duration - 0.01));
    this._free(g, t + buf.duration / s.playbackRate.value + 0.05);
  }
  // reverse-cymbal swell whose peak lands at time `peakAt`
  swellTo(dest, t, peakAt, vel = 0.8) {
    const peak = 2.05;
    const lead = Math.min(peak, Math.max(0.1, peakAt - t));
    this.drum(dest, t, 'mus_swell', vel, 1, peak - lead);
  }
  chord(fn, dest, t, notes, ...args) { for (const n of notes) this[fn](dest, t, n, ...args); }
}

// ---------------------------------------------------------------------------
// helpers

const smooth = (a, b, x) => { if (a === b) return x >= a ? 1 : 0; const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const hum = () => (Math.random() - 0.5) * 0.012;
const rv = (v, a = 0.12) => v * (1 + (Math.random() - 0.5) * 2 * a);
const triad = (root, q, oct = 0) => [root + oct, root + oct + (q === 'm' ? 3 : 4), root + oct + 7];

// ---------------------------------------------------------------------------
// States. layers: name -> 1 (always) or [lo, hi] intensity ramp. step(p, s, t) called per 16th.

const STATES = {
  calm: {
    bpm: 68, fadeIn: 3,
    layers: { pad: 1, piano: 1, bass: [0.2, 0.5], high: [0.55, 0.85] },
    chords: [
      { b: 38, n: [57, 62, 64, 65] },
      { b: 34, n: [53, 57, 62, 65] },
      { b: 31, n: [50, 53, 58, 62] },
      { b: 33, n: [52, 57, 62, 64], alt: [52, 57, 61, 64] },
    ],
    // [bar, step, midi, beats]
    motif: [
      [0, 0, 69, 1.5], [0, 6, 65, 0.5], [0, 8, 64, 1], [0, 12, 62, 2],
      [1, 8, 72, 1], [1, 12, 69, 2],
      [2, 0, 70, 1.5], [2, 6, 69, 0.5], [2, 8, 65, 1], [2, 12, 62, 2],
      [3, 4, 65, 1], [3, 8, 64, 3],
      [4, 0, 67, 1.5], [4, 6, 70, 0.5], [4, 8, 74, 1], [4, 12, 72, 2],
      [5, 4, 70, 1], [5, 8, 69, 3],
      [6, 0, 64, 1], [6, 4, 65, 1], [6, 8, 67, 1], [6, 12, 64, 1],
      [7, 0, 61, 2], [7, 8, 64, 2],
    ],
    step(p, s, t) {
      const I = p.I, bar = Math.floor(s / 16), pos = s % 16, sd = p.sd, beat = p.spb;
      const ci = Math.floor(bar / 2) % 4, ch = this.chords[ci];
      const cyc = Math.floor(bar / 8);
      if (pos === 0 && bar % 2 === 0) {
        const notes = ci === 3 ? ch.n : ch.n;
        for (const n of notes) I.strings(p.L('pad'), t + hum(), n, beat * 8 - 0.3, rv(0.45), { att: 1.6, rel: 2.2, bright: 0.25 });
        if (p.on('bass')) { I.strings(p.L('bass'), t, ch.b, beat * 8 - 0.3, 0.6, { att: 1.2, rel: 2, bright: 0.15 }); I.piano(p.L('piano'), t + 0.02, ch.b + 12, 0.35, beat * 6); }
      }
      if (ci === 3 && bar % 2 === 1 && pos === 0) {
        // resolve sus4 -> major third
        I.strings(p.L('pad'), t, 61, beat * 4 - 0.2, 0.4, { att: 0.8, rel: 2, bright: 0.25 });
      }
      const mb = bar % 8;
      for (const [b, st, n, len] of this.motif) {
        if (b !== mb || st !== pos) continue;
        if (cyc % 3 === 2 && Math.random() < 0.35) continue; // sparser variation
        const up = cyc % 2 === 1 ? 12 : 0;
        I.piano(p.L('piano'), t + hum(), n + up, rv(0.45, 0.2), len * beat + 0.4);
        if (up === 0 && Math.random() < 0.25) I.piano(p.L('piano'), t + 0.03, n - 12, 0.18, len * beat);
      }
      if (p.on('high') && pos === 8 && bar % 4 === 1) I.strings(p.L('high'), t, Math.random() < 0.5 ? 81 : 76, beat * 6, 0.18, { att: 2, rel: 2, bright: 0.4 });
    },
  },

  tension: {
    bpm: 60, fadeIn: 2.5,
    layers: { drone: 1, pulse: [0.25, 0.5], swell: 1, high: [0.55, 0.85], metal: [0.35, 0.7] },
    init(p) {
      const c = p.ctx;
      const g = c.createGain(); g.gain.value = 0; g.connect(p.L('drone'));
      g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(0.1, c.currentTime + 3);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170; lp.Q.value = 2; lp.connect(g);
      const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 70; lfo.connect(lg); lg.connect(lp.frequency);
      const oscs = [];
      for (const [m, d, ty, a] of [[26, -8, 'sawtooth', 0.8], [26, 7, 'sawtooth', 0.8], [38, 0, 'sawtooth', 0.4], [33, 3, 'sawtooth', 0.3], [26, 0, 'sine', 1.6]]) {
        const o = c.createOscillator(); o.type = ty; o.frequency.value = mtof(m); o.detune.value = d;
        const og = c.createGain(); og.gain.value = a; o.connect(og); og.connect(ty === 'sine' ? g : lp);
        oscs.push(o);
      }
      lfo.start(); oscs.forEach((o) => o.start());
      p.data = { oscs, lfo, nextSwell: 2, nextMetal: 4 };
    },
    stop(p, at) { for (const o of p.data.oscs) o.stop(at); p.data.lfo.stop(at); },
    step(p, s, t) {
      const I = p.I, bar = Math.floor(s / 16), pos = s % 16, beat = p.spb, D = p.data;
      if (pos === 0 && bar % 8 === 4) for (const o of D.oscs) o.frequency.setTargetAtTime(o.frequency.value * Math.pow(2, 1 / 12), t, 1.5);
      if (pos === 0 && bar % 8 === 0 && bar > 0) for (const o of D.oscs) o.frequency.setTargetAtTime(o.frequency.value / Math.pow(2, 1 / 12), t, 1.5);
      if (p.on('pulse') && (pos === 0 || pos === 3)) I.drum(p.L('pulse'), t, 'mus_taikoLo', pos === 0 ? 0.45 : 0.3, 0.8);
      if (p.on('pulse') && p.x > 0.7 && (pos === 8 || pos === 11)) I.drum(p.L('pulse'), t, 'mus_taikoLo', pos === 8 ? 0.3 : 0.2, 0.8);
      if (pos === 0 && bar >= D.nextSwell) {
        const sets = [[62, 63, 68], [57, 58, 64], [50, 51, 56, 62], [69, 70, 75], [45, 46, 52]];
        const set = sets[Math.floor(Math.random() * sets.length)];
        const len = beat * (3 + Math.random() * 2);
        const cut = Math.random() < 0.5;
        for (const n of set) I.strings(p.L('swell'), t + Math.random() * 0.2, n, len, rv(0.45), { att: len * 0.9, rel: cut ? 0.12 : 2, bright: 0.5, swell: true });
        if (cut && p.x > 0.5) I.drum(p.L('swell'), t + len, 'mus_boom', 0.5);
        D.nextSwell = bar + 2 + Math.floor(Math.random() * (p.x > 0.6 ? 2 : 3));
      }
      if (p.on('high') && pos === 0 && bar % 2 === 1) I.tremolo(p.L('high'), t, Math.random() < 0.5 ? 81 : 82, beat * 7, 0.18, { rate: 11 });
      if (p.on('metal') && pos === 8 && bar >= D.nextMetal) { I.metal(p.L('metal'), t, beat * 3, 300 + Math.random() * 300, 0.8); D.nextMetal = bar + 3 + Math.floor(Math.random() * 4); }
    },
  },

  combat: {
    bpm: 124, fadeIn: 1.5,
    layers: { ost: 1, pad: 1, drums: [0.15, 0.35], brass: [0.45, 0.65], mel: [0.72, 0.9] },
    prog: [[38, 'm'], [34, 'M'], [36, 'M'], [33, 'M']],
    mel: [[0, 0, 69, 16], [1, 0, 70, 4], [1, 4, 69, 4], [1, 8, 67, 4], [1, 12, 65, 4], [2, 0, 67, 16], [3, 0, 64, 8], [3, 8, 65, 4], [3, 12, 67, 4],
      [4, 0, 69, 12], [4, 12, 72, 4], [5, 0, 70, 16], [6, 0, 69, 4], [6, 4, 67, 4], [6, 8, 65, 4], [6, 12, 64, 4], [7, 0, 73, 16]],
    step(p, s, t) {
      const I = p.I, bar = Math.floor(s / 16), pos = s % 16, sd = p.sd, beat = p.spb;
      const [root, q] = this.prog[Math.floor(bar / 2) % 4];
      const third = q === 'm' ? 3 : 4;
      if (pos % 2 === 0) {
        const seq = bar % 2 === 0 ? [0, 0, 12, 0, third, 0, 7, 0] : [0, 0, 12, 0, 10, 7, third, 0];
        const n = root + seq[pos / 2];
        I.spiccato(p.L('ost'), t + hum() * 0.3, n, pos % 4 === 0 ? 0.9 : 0.6, 0.14, { bright: 8 });
        I.spiccato(p.L('ost'), t, n + 12, 0.35, 0.1);
      }
      if (pos === 0 && bar % 2 === 0) {
        for (const n of triad(root, q, 24)) I.strings(p.L('pad'), t, n, beat * 8 - 0.2, 0.35, { att: 0.5, rel: 1, bright: 0.45 });
        if (p.on('brass')) { I.brass(p.L('brass'), t, root + 12, beat * 7.5, 0.55, { att: 0.35 }); I.brass(p.L('brass'), t, root + 19, beat * 7.5, 0.45, { att: 0.35 }); }
      }
      if (p.on('drums')) {
        if (pos === 0 || pos === 8) I.drum(p.L('drums'), t, 'mus_taikoLo', pos === 0 ? 1 : 0.8);
        if (pos === 6 || pos === 14) I.drum(p.L('drums'), t, 'mus_taikoHi', 0.6);
        if (p.x > 0.55 && (pos === 11 || pos === 13)) I.drum(p.L('drums'), t, 'mus_taikoHi', 0.45);
        if (pos === 0 && bar % 4 === 0) I.drum(p.L('drums'), t, 'mus_boom', 0.55);
        if (p.x > 0.75 && bar % 4 === 3 && pos >= 8) I.drum(p.L('drums'), t, 'mus_snare', 0.2 + (pos - 8) * 0.05);
      }
      if (p.on('mel')) for (const [b, st, n, len] of this.mel) if (b === bar % 8 && st === pos) I.strings(p.L('mel'), t, n + 12, len * sd - 0.05, 0.5, { att: 0.08, rel: 0.3, bright: 0.8 });
    },
  },

  horde: {
    bpm: 144, fadeIn: 1.0,
    layers: { pulse: 1, bass: 1, perc: [0.1, 0.3], brass: [0.45, 0.6], trem: [0.68, 0.85] },
    prog: [[38, 'm'], [38, 'm'], [39, 'M'], [38, 'm'], [34, 'M'], [36, 'M'], [33, 'M'], [33, 'M']],
    step(p, s, t) {
      const I = p.I, bar = Math.floor(s / 16), pos = s % 16, sd = p.sd, beat = p.spb;
      const [root, q] = this.prog[bar % 8];
      const tri = triad(root, q, 12);
      const acc = pos % 8 === 0 || pos % 8 === 3 || pos % 8 === 6;
      // pulsing strings (16ths, 3+3+2 accents)
      const note = acc ? tri[0] + 12 : (pos % 2 ? tri[1] + 12 : tri[2]);
      I.spiccato(p.L('pulse'), t, note, acc ? 1 : 0.45, 0.11, { bright: acc ? 12 : 7 });
      if (acc) I.spiccato(p.L('pulse'), t, tri[2] + 12, 0.5, 0.1);
      if (bar % 8 === 7 && pos >= 8) I.spiccato(p.L('pulse'), t, 74 + (pos - 8), 0.6, 0.09, { bright: 12 });
      // bass (dotted pulse)
      if (acc) I.spiccato(p.L('bass'), t, root, 1, 0.22, { bright: 5 });
      if (acc && pos % 8 === 0) I.sub(p.L('bass'), t, root, sd * 2.5, 0.6);
      if (p.on('perc')) {
        if (pos === 0 || pos === 6 || pos === 11) I.drum(p.L('perc'), t, 'mus_taikoLo', pos === 0 ? 1 : 0.75);
        if (pos === 3 || pos === 8 || pos === 14) I.drum(p.L('perc'), t, 'mus_taikoHi', 0.65);
        if (pos === 0 && bar % 2 === 0) I.drum(p.L('perc'), t, 'mus_boom', 0.5);
        if (p.x > 0.5 && pos % 4 === 2) I.drum(p.L('perc'), t, 'mus_rim', 0.35);
        if (p.x > 0.6 && bar % 8 === 7 && pos >= 8) I.drum(p.L('perc'), t, 'mus_snare', 0.25 + (pos - 8) * 0.07);
      }
      if (p.on('brass') && (pos === 0 || (pos === 11 && bar % 4 === 3))) for (const n of triad(root, q, 12)) I.brass(p.L('brass'), t, n, sd * (pos === 0 ? 3 : 4), 0.85, { att: 0.02, rel: 0.15 });
      if (p.on('trem') && pos === 0) I.tremolo(p.L('trem'), t, tri[2] + 36, beat * 4 - 0.05, 0.3, { rate: 14 });
    },
  },

  tank: {
    bpm: 160, fadeIn: 0.8,
    layers: { drums: 1, riff: 1, stab: [0.35, 0.55], scream: [0.7, 0.85] },
    riff: [
      [[0, 38, 2], [3, 38, 1], [4, 38, 2], [6, 41, 2], [8, 40, 2], [10, 38, 2], [12, 39, 4]],
      [[0, 38, 2], [3, 38, 1], [4, 38, 2], [6, 34, 2], [8, 36, 2], [10, 37, 2], [12, 38, 2], [14, 33, 2]],
    ],
    step(p, s, t) {
      const I = p.I, bar = Math.floor(s / 16), pos = s % 16, sd = p.sd;
      if ([0, 3, 6, 10].includes(pos) || (p.x > 0.5 && pos === 14)) I.drum(p.L('drums'), t, 'mus_taikoLo', pos === 0 ? 1 : 0.8);
      if (pos === 4 || pos === 12) { I.drum(p.L('drums'), t, 'mus_taikoHi', 0.85); I.drum(p.L('drums'), t, 'mus_anvil', 0.3); }
      if (pos === 8) I.drum(p.L('drums'), t, 'mus_taikoHi', 0.5);
      if (pos === 0 && bar % 2 === 0) I.drum(p.L('drums'), t, 'mus_boom', 0.6);
      if (bar % 4 === 3 && pos >= 12) I.drum(p.L('drums'), t, 'mus_taikoHi', 0.5 + (pos - 12) * 0.12);
      for (const [st, n, len] of this.riff[bar % 2]) if (st === pos) { I.riff(p.L('riff'), t, n, len * sd - 0.02, 0.9); I.riff(p.L('riff'), t, n + 12, len * sd - 0.02, 0.4); }
      if (pos === 0) I.sub(p.L('riff'), t, 26, sd * 15, 0.5);
      if (p.on('stab') && pos === 0 && bar % 2 === 0) for (const n of [62, 63, 69]) I.brass(p.L('stab'), t, n, sd * 3, 0.8, { att: 0.015, rel: 0.2 });
      if (p.on('scream') && bar % 4 === 2 && pos >= 8) I.spiccato(p.L('scream'), t, 81 + (pos - 8), 0.7, 0.1, { bright: 12 });
    },
  },

  witch: {
    bpm: 50, fadeIn: 2.5,
    layers: { drone: 1.8, box: 1.8, low: [0.3, 0.5], whisper: [0.55, 0.75], trem: [0.7, 0.9] },
    init(p) {
      const c = p.ctx;
      const g = c.createGain(); g.gain.value = 0; g.connect(p.L('drone'));
      g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(0.035, c.currentTime + 3);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3500; lp.connect(g);
      const oscs = [];
      for (const [m, d] of [[81, -4], [81, 5], [82, 0], [88, 3]]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = d;
        const og = c.createGain(); og.gain.value = m === 88 ? 0.25 : 0.5;
        const lfo = c.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.1;
        const lg = c.createGain(); lg.gain.value = 0.4; lfo.connect(lg); lg.connect(og.gain);
        o.connect(og); og.connect(lp); oscs.push(o, lfo);
        this._vib(c, o);
      }
      oscs.forEach((o) => o.start());
      p.data = { oscs, lastBox: 88 };
    },
    _vib(c, o) { const l = c.createOscillator(); l.frequency.value = 4.2 + Math.random(); const g = c.createGain(); g.gain.value = 9; l.connect(g); g.connect(o.detune); l.start(); o.onended = () => { try { l.stop(); } catch (e) { /* */ } }; },
    stop(p, at) { for (const o of p.data.oscs) o.stop(at); },
    step(p, s, t) {
      const I = p.I, bar = Math.floor(s / 16), pos = s % 16, beat = p.spb, D = p.data;
      if (pos % 4 === 0 && Math.random() < 0.45) {
        const set = [88, 87, 83, 82, 79, 76, 75];
        let i = set.indexOf(D.lastBox);
        i = Math.min(set.length - 1, Math.max(0, i + (Math.random() < 0.7 ? 1 : -2)));
        if (i >= set.length - 1 && Math.random() < 0.5) i = 0;
        D.lastBox = set[i];
        I.bell(p.L('box'), t + Math.random() * 0.1, set[i], rv(0.5, 0.3), (Math.random() - 0.5) * 50, 2.2);
      }
      if (p.on('low') && pos === 0 && bar % 2 === 0) { I.piano(p.L('low'), t, 26, 0.5, beat * 6); I.piano(p.L('low'), t + 0.01, 27, 0.4, beat * 6); }
      if (p.on('whisper') && pos === 8 && bar % 2 === 1) I.whisper(p.L('whisper'), t, beat * 3, 0.6);
      if (p.on('trem') && pos === 0) I.tremolo(p.L('trem'), t, Math.random() < 0.5 ? 75 : 76, beat * 4, 0.2, { rate: 16 });
    },
  },

  finale: {
    bpm: 136, fadeIn: 1.5,
    layers: { ost: 1, drums: 1, lowbrass: [0.15, 0.35], choir: [0.3, 0.5], mel: [0.45, 0.6], hi: [0.72, 0.88] },
    prog: [[38, 'm'], [34, 'M'], [41, 'M'], [36, 'M'], [43, 'm'], [34, 'M'], [33, 'M'], [33, 'M']],
    mel: [[0, 0, 62, 8], [0, 8, 57, 4], [0, 12, 62, 4], [1, 0, 65, 12], [1, 12, 62, 4], [2, 0, 60, 8], [2, 8, 65, 4], [2, 12, 69, 4],
      [3, 0, 67, 12], [3, 12, 64, 4], [4, 0, 62, 8], [4, 8, 67, 4], [4, 12, 70, 4], [5, 0, 69, 8], [5, 8, 65, 8],
      [6, 0, 64, 8], [6, 8, 61, 4], [6, 12, 64, 4], [7, 0, 69, 16]],
    step(p, s, t) {
      const I = p.I, bar = Math.floor(s / 16), pos = s % 16, sd = p.sd, beat = p.spb;
      const [root, q] = this.prog[bar % 8];
      const r3 = root + 12;
      const pat = [r3, r3 + 7, r3 + 12, r3 + 7];
      const acc = pos % 8 === 0 || pos % 8 === 3 || pos % 8 === 6;
      I.spiccato(p.L('ost'), t, pat[pos % 4], acc ? 0.95 : 0.5, 0.11, { bright: acc ? 11 : 7 });
      if (acc) I.spiccato(p.L('ost'), t, root, 0.8, 0.2, { bright: 5 });
      if ([0, 3, 6, 8, 11].includes(pos)) I.drum(p.L('drums'), t, 'mus_taikoLo', pos === 0 ? 1 : 0.7);
      if (pos === 4 || pos === 12 || pos === 14) I.drum(p.L('drums'), t, 'mus_taikoHi', 0.6);
      if (pos === 0 && bar % 4 === 0) I.drum(p.L('drums'), t, 'mus_boom', 0.6);
      if (bar % 8 === 7 && pos >= 4) I.drum(p.L('drums'), t, 'mus_snare', 0.15 + (pos - 4) * 0.05);
      if (pos === 0) {
        if (p.on('lowbrass')) I.brass(p.L('lowbrass'), t, root, beat * 4 - 0.05, 0.6, { att: 0.1 });
        if (p.on('choir')) for (const n of triad(root, q, 24)) I.choir(p.L('choir'), t, n, beat * 4 - 0.1, 0.45, 'a', { att: 0.3, rel: 0.6 });
        if (p.on('hi')) I.tremolo(p.L('hi'), t, root + 43, beat * 4 - 0.05, 0.28, { rate: 14 });
      }
      if (p.on('mel')) for (const [b, st, n, len] of this.mel) if (b === bar % 8 && st === pos) { I.brass(p.L('mel'), t, n, len * sd - 0.04, 0.8, { att: 0.05 }); I.brass(p.L('mel'), t, n - 12, len * sd - 0.04, 0.5, { att: 0.05 }); }
    },
  },

  rescue: {
    bpm: 76, fadeIn: 2.5,
    layers: { pad: 1, bass: 1, mel: [0.25, 0.45], timp: [0.15, 0.3], arp: [0.5, 0.7] },
    chords: [
      { b: 34, n: [58, 62, 65] }, { b: 33, n: [57, 60, 65] }, { b: 31, n: [55, 58, 62] }, { b: 38, n: [54, 57, 62] },
      { b: 39, n: [55, 58, 63] }, { b: 38, n: [53, 58, 62] }, { b: 36, n: [55, 60, 64] }, { b: 38, n: [54, 57, 62, 66] },
    ],
    mel: [[0, 0, 65, 6], [0, 6, 70, 2], [0, 8, 72, 4], [0, 12, 74, 4], [1, 0, 72, 12], [1, 12, 69, 4], [2, 0, 70, 6], [2, 6, 69, 2], [2, 8, 67, 8],
      [3, 0, 66, 16], [4, 0, 67, 6], [4, 6, 70, 2], [4, 8, 75, 8], [5, 0, 74, 8], [5, 8, 70, 8], [6, 0, 72, 8], [6, 8, 76, 8], [7, 0, 74, 16]],
    step(p, s, t) {
      const I = p.I, bar = Math.floor(s / 16), pos = s % 16, sd = p.sd, beat = p.spb;
      const ch = this.chords[bar % 8];
      if (pos === 0) {
        for (const n of ch.n) I.strings(p.L('pad'), t + hum(), n, beat * 4 - 0.05, 0.42, { att: 0.6, rel: 1.2, bright: 0.4 });
        I.strings(p.L('bass'), t, ch.b, beat * 4 - 0.05, 0.6, { att: 0.4, rel: 1, bright: 0.2 });
        I.strings(p.L('bass'), t, ch.b + 12, beat * 4 - 0.05, 0.35, { att: 0.4, rel: 1, bright: 0.2 });
      }
      if (p.on('mel')) for (const [b, st, n, len] of this.mel) if (b === bar % 8 && st === pos) I.brass(p.L('mel'), t, n, len * sd - 0.05, 0.6, { att: 0.12, rel: 0.5 });
      if (p.on('timp') && (bar % 4 === 3) && pos >= 8) I.drum(p.L('timp'), t, 'mus_taikoLo', 0.2 + (pos - 8) * 0.06, 0.9);
      if (p.on('timp') && pos === 0 && bar % 4 === 0) I.drum(p.L('timp'), t, 'mus_taikoLo', 0.7, 0.9);
      if (p.on('arp') && pos % 2 === 0) { const n = ch.n[(pos / 2) % ch.n.length] + 12; I.piano(p.L('arp'), t, n, 0.3, sd * 3); }
    },
  },
};

// ---------------------------------------------------------------------------

class StatePlayer {
  constructor(music, name) {
    const def = STATES[name];
    this.m = music;
    this.ctx = music.ctx;
    this.I = music.inst;
    this.name = name;
    this.def = def;
    this.spb = 60 / def.bpm;
    this.sd = this.spb / 4;
    this.step = 0;
    const now = this.ctx.currentTime;
    this.next = now + 0.08;
    this.out = this.ctx.createGain();
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.linearRampToValueAtTime(1, now + (def.fadeIn ?? 2));
    this.out.connect(music.stateBus);
    this.layers = {};
    this.lg = {};
    for (const k in def.layers) { const g = this.ctx.createGain(); g.connect(this.out); this.layers[k] = g; }
    this.x = music.intensity;
    this.setIntensity(music.intensity, true);
    this.data = {};
    this.stopping = false;
    this.endAt = Infinity;
    if (def.init) def.init.call(def, this);
  }
  L(k) { return this.layers[k] || this.out; }
  on(k) { return (this.lg[k] ?? 1) > 0.02; }
  setIntensity(x, immediate) {
    this.x = x;
    const now = this.ctx.currentTime;
    for (const k in this.def.layers) {
      const spec = this.def.layers[k];
      const v = typeof spec === 'number' ? spec : smooth(spec[0], spec[1], x);
      this.lg[k] = v;
      const p = this.layers[k].gain;
      if (immediate) p.setValueAtTime(v, now); else p.setTargetAtTime(v, now, 0.5);
    }
  }
  schedule(until) {
    until = Math.min(until, this.endAt);
    let guard = 0;
    while (this.next < until && guard++ < 256) {
      try { this.def.step.call(this.def, this, this.step, this.next); } catch (e) { console.warn('[music]', e); }
      this.step++;
      this.next += this.sd;
    }
  }
  stop(fade = 2) {
    if (this.stopping) return;
    const now = this.ctx.currentTime;
    this.stopping = true;
    const g = this.out.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now); else { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); }
    g.linearRampToValueAtTime(0, now + fade);
    this.endAt = now + fade + 0.05;
    if (this.def.stop) try { this.def.stop.call(this.def, this, this.endAt + 0.1); } catch (e) { /* ignore */ }
  }
  dispose() { try { this.out.disconnect(); } catch (e) { /* ignore */ } }
}

// ---------------------------------------------------------------------------
// Stingers: (I, d, t) where d is the destination and t the start time. dur = ducking length.

const STINGERS = {
  hordeIncoming: {
    dur: 5.4,
    play(I, d, t) {
      I.swellTo(d, t, t + 0.9, 0.9);
      I.riser(d, t, 0.9, 0.5);
      I.strings(d, t, 38, 0.85, 0.7, { att: 0.8, rel: 0.05, bright: 0.4, swell: true });
      I.strings(d, t, 39, 0.85, 0.6, { att: 0.8, rel: 0.05, bright: 0.4, swell: true });
      I.gliss(d, t, 62, 69, 0.9, 0.35);
      const h = t + 0.9;
      I.drum(d, h, 'mus_boom', 1); I.drum(d, h, 'mus_taikoLo', 1); I.drum(d, h, 'mus_anvil', 0.4);
      for (const n of [38, 45, 50, 51]) I.brass(d, h, n, 0.9, 1, { att: 0.01, rel: 0.5, dist: 2.5 });
      for (const n of [74, 75, 81]) I.strings(d, h, n, 0.25, 0.8, { att: 0.01, rel: 0.2, bright: 1 });
      const call = (t0, notes, drum) => notes.forEach((n, k) => {
        const tt = t0 + k * 0.2, du = k === 2 ? 0.5 : 0.17;
        I.brass(d, tt, n, du, 0.95, { att: 0.02, rel: 0.2, dist: 2 });
        I.brass(d, tt, n - 12, du, 0.75, { att: 0.02, rel: 0.2 });
        I.drum(d, tt, drum, k === 0 ? 1 : 0.8);
      });
      call(h + 0.4, [50, 56, 55], 'mus_taikoLo');
      I.tremolo(d, h + 0.4, 62, 1.95, 0.4, { rate: 15 }); I.tremolo(d, h + 0.4, 63, 1.95, 0.35, { rate: 15 });
      call(h + 1.4, [53, 59, 58], 'mus_taikoHi');
      I.drum(d, h + 1.4, 'mus_taikoLo', 0.9);
      for (let k = 0; k < 8; k++) I.drum(d, h + 2.0 + k * 0.05, 'mus_snare', 0.2 + k * 0.08);
      const f = h + 2.4;
      I.drum(d, f, 'mus_boom', 1); I.drum(d, f, 'mus_taikoLo', 1); I.drum(d, f, 'mus_anvil', 0.6);
      for (const n of [38, 44, 50, 51, 55]) I.brass(d, f, n, 1.6, 1, { att: 0.01, rel: 0.8, dist: 3 });
      I.gliss(d, f, 86, 93, 1.4, 0.4, { rel: 0.8 });
      I.gliss(d, f, 85, 92, 1.4, 0.3, { rel: 0.8 });
    },
  },
  tank: {
    dur: 3.8,
    play(I, d, t) {
      const s = 60 / 160 / 4;
      for (const k of [0, 3, 6, 8, 9, 10]) { I.drum(d, t + k * s, 'mus_taikoLo', 1); I.riff(d, t + k * s, 26, s * 1.6, 1); I.riff(d, t + k * s, 38, s * 1.6, 0.6); }
      const h = t + 12 * s;
      I.drum(d, h, 'mus_boom', 1); I.drum(d, h, 'mus_anvil', 0.6);
      for (const n of [38, 44, 45, 51]) I.brass(d, h, n, 0.7, 1, { att: 0.01, dist: 3 });
      [50, 49, 48, 47].forEach((n, k) => { const tt = h + (k + 1) * 4 * s * 1.0 + 0.1; I.brass(d, tt, n, k === 3 ? 1.2 : 0.3, 0.9, { att: 0.02, dist: 2 }); I.brass(d, tt, n - 12, k === 3 ? 1.2 : 0.3, 0.8); I.drum(d, tt, 'mus_taikoLo', 0.9); I.drum(d, tt, 'mus_anvil', 0.35); });
    },
  },
  witch: {
    dur: 4.8, gain: 1.4,
    play(I, d, t) {
      for (const n of [81, 82, 88]) I.strings(d, t, n, 3, 0.3, { att: 1.5, rel: 1.5, bright: 0.5 });
      I.tremolo(d, t + 0.5, 76, 3, 0.2, { rate: 17 });
      [[0.3, 88], [0.9, 87], [1.5, 83], [2.1, 82], [2.9, 76]].forEach(([dt, n]) => I.bell(d, t + dt, n, 0.6, (Math.random() - 0.5) * 45, 2.4));
      I.piano(d, t + 2.9, 26, 0.55, 2); I.piano(d, t + 2.91, 27, 0.45, 2);
      I.whisper(d, t + 1.0, 2.5, 0.5);
    },
  },
  hunterNear: {
    dur: 1.8, gain: 1.3,
    play(I, d, t) {
      for (let k = 0; k < 8; k++) I.spiccato(d, t + k * 0.065, 79 + k, 0.8, 0.08, { bright: 12 });
      const h = t + 0.55;
      for (const n of [74, 80, 81]) I.strings(d, h, n, 0.35, 0.7, { att: 0.01, rel: 0.5, bright: 1 });
      I.drum(d, h, 'mus_taikoHi', 0.9); I.drum(d, h, 'mus_rim', 0.6);
      I.piano(d, h, 38, 0.7, 1.2); I.piano(d, h, 44, 0.6, 1.2);
    },
  },
  smokerNear: {
    dur: 3.0, gain: 2,
    play(I, d, t) {
      I.strings(d, t, 38, 2.6, 0.5, { att: 0.5, rel: 0.6, bright: 0.2 });
      [[0, 50, 0.7], [0.7, 49, 0.7], [1.4, 48, 1.2]].forEach(([dt, n, du]) => I.brass(d, t + dt, n, du, 0.55, { att: 0.12, rel: 0.4, sub: false }));
      I.whisper(d, t + 0.3, 2.2, 0.4);
      I.metal(d, t + 0.6, 2, 380, 0.5);
    },
  },
  boomerNear: {
    dur: 2.8,
    play(I, d, t) {
      I.tuba(d, t, 34, 0.9, 33, 0.8);
      I.tuba(d, t + 0.95, 33, 0.7, 35, 0.7);
      I.tuba(d, t + 1.7, 34, 0.9, 31, 0.8);
      for (const k of [0, 0.95, 1.7]) I.drum(d, t + k, 'mus_taikoLo', 0.5, 0.7);
      I.strings(d, t, 45, 2.4, 0.25, { att: 0.8, rel: 0.5, bright: 0.2 });
      I.strings(d, t, 46, 2.4, 0.25, { att: 0.8, rel: 0.5, bright: 0.2 });
    },
  },
  pinned: {
    dur: 3.4,
    play(I, d, t) {
      for (const n of [62, 63, 64, 70]) I.tremolo(d, t, n, 3, 0.3, { rate: 16 });
      for (let k = 0; k < 12; k++) {
        const tt = t + k * 0.25;
        I.drum(d, tt, k % 2 ? 'mus_taikoHi' : 'mus_taikoLo', 0.4 + k * 0.05);
        if (k % 2 === 0) for (const n of [38, 44]) I.brass(d, tt, n, 0.14, 0.7 + k * 0.02, { att: 0.01, rel: 0.1 });
      }
      I.drum(d, t + 3, 'mus_boom', 0.8);
    },
  },
  incap: {
    dur: 4.5,
    play(I, d, t) {
      for (const n of [38, 45, 51, 53]) I.strings(d, t, n, 3.2, 0.5, { att: 0.3, rel: 1.2, bright: 0.08 });
      const g = I._gain(0, d);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012, t + 0.05); g.gain.linearRampToValueAtTime(0, t + 3.5);
      I._osc('sine', 3800, t, t + 3.6, g);
      I.drum(d, t, 'mus_taikoLo', 0.6, 0.7); I.drum(d, t + 0.9, 'mus_taikoLo', 0.45, 0.7);
      I.drum(d, t + 2.0, 'mus_taikoLo', 0.35, 0.7);
    },
  },
  death: {
    dur: 7,
    play(I, d, t) {
      I.drum(d, t, 'mus_boom', 0.8);
      [[0, [50, 53, 57], 38], [2, [46, 49, 53], 34], [4, [45, 50, 53, 57], 33]].forEach(([dt, ns, b]) => {
        for (const n of ns) I.strings(d, t + dt, n, dt === 4 ? 2.5 : 2.1, 0.5, { att: 0.5, rel: dt === 4 ? 2 : 0.5, bright: 0.3 });
        I.brass(d, t + dt, b, dt === 4 ? 2.5 : 2.0, 0.55, { att: 0.3, rel: 1 });
        for (const n of ns) I.choir(d, t + dt, n + 12, 2.0, 0.3, 'u', { att: 0.6, rel: 1 });
      });
    },
  },
  safeRoom: {
    dur: 6.5,
    play(I, d, t) {
      [[0, [53, 57, 60, 65]], [1.5, [52, 55, 60, 64]], [3, [50, 53, 57, 60]], [4.5, [46, 53, 57, 62]]].forEach(([dt, ns]) => {
        for (const n of ns) I.strings(d, t + dt, n, dt === 4.5 ? 1.8 : 1.4, 0.4, { att: 0.5, rel: dt === 4.5 ? 2 : 0.6, bright: 0.35 });
      });
      [[0.2, 72], [0.8, 69], [1.6, 67], [2.2, 65], [3.1, 64], [3.7, 65], [4.6, 69], [5.2, 65]].forEach(([dt, n]) => I.piano(d, t + dt, n, 0.4, 1.4));
      I.piano(d, t + 4.6, 34, 0.35, 2.5);
    },
  },
  chapterStart: {
    dur: 5.5,
    play(I, d, t) {
      I.strings(d, t, 26, 4.5, 0.6, { att: 2, rel: 1, bright: 0.2, swell: true });
      I.strings(d, t, 38, 4.5, 0.5, { att: 2, rel: 1, bright: 0.2, swell: true });
      for (const k of [0, 1.2, 2.4]) I.drum(d, t + k, 'mus_taikoLo', 0.6 + k * 0.15);
      I.drum(d, t + 3.6, 'mus_boom', 0.9);
      [[1.2, 50, 0.7], [2.0, 53, 0.7], [2.8, 52, 1.8]].forEach(([dt, n, du]) => { I.brass(d, t + dt, n, du, 0.7, { att: 0.08 }); I.brass(d, t + dt, n - 12, du, 0.5, { att: 0.08 }); });
      I.strings(d, t + 2.8, 81, 2.2, 0.2, { att: 1.2, rel: 1, bright: 0.4 });
    },
  },
  finaleStart: {
    dur: 5.8,
    play(I, d, t) {
      I.riser(d, t, 2.5, 0.6);
      I.swellTo(d, t + 0.4, t + 2.5, 0.8);
      for (let k = 0; k < 20; k++) I.drum(d, t + 1.5 + k * 0.05, 'mus_snare', 0.1 + k * 0.03);
      const h = t + 2.5;
      I.drum(d, h, 'mus_boom', 1); I.drum(d, h, 'mus_taikoLo', 1);
      [[0, 50, 0.28], [0.3, 57, 0.28], [0.6, 62, 2.2]].forEach(([dt, n, du]) => { I.brass(d, h + dt, n, du, 0.95, { att: 0.02, dist: 1.5 }); I.brass(d, h + dt, n - 12, du, 0.7, { att: 0.02 }); I.drum(d, h + dt, 'mus_taikoLo', 0.9); });
      for (const n of [62, 65, 69]) I.tremolo(d, h, n, 2.8, 0.3, { rate: 15 });
      for (const k of [1.2, 1.5, 1.8, 2.1]) I.drum(d, h + k, 'mus_taikoHi', 0.7);
    },
  },
  rescueArrive: {
    dur: 5,
    play(I, d, t) {
      I.swellTo(d, t, t + 1.0, 0.7);
      for (const n of [50, 54, 57, 62]) I.strings(d, t, n, 3.5, 0.45, { att: 0.3, rel: 1.2, bright: 0.5 });
      [[0, 62, 0.22], [0.25, 66, 0.22], [0.5, 69, 0.45], [1.0, 74, 2.5]].forEach(([dt, n, du]) => { I.brass(d, t + dt, n, du, 0.85, { att: 0.03 }); I.brass(d, t + dt, n - 12, du, 0.6, { att: 0.03 }); });
      I.drum(d, t + 1.0, 'mus_boom', 0.7);
      for (let k = 0; k < 10; k++) I.drum(d, t + k * 0.08, 'mus_taikoLo', 0.2 + k * 0.05, 0.9);
    },
  },
  escape: {
    dur: 7.5,
    play(I, d, t) {
      I.drum(d, t, 'mus_boom', 0.8);
      [[0, 34, [58, 62, 65]], [1.8, 36, [60, 64, 67]], [3.6, 38, [62, 66, 69, 74]]].forEach(([dt, b, ns]) => {
        const du = dt === 3.6 ? 3.2 : 1.7;
        for (const n of ns) { I.strings(d, t + dt, n, du, 0.45, { att: 0.3, rel: dt === 3.6 ? 2.5 : 0.4, bright: 0.55 }); I.choir(d, t + dt, n, du, 0.3, 'a', { att: 0.4, rel: 1.5 }); }
        I.brass(d, t + dt, b + 12, du, 0.7, { att: 0.15 }); I.brass(d, t + dt, b, du, 0.6, { att: 0.15 });
        for (let k = 0; k < 4; k++) I.drum(d, t + dt + k * 0.45, 'mus_taikoLo', k === 0 ? 1 : 0.6);
      });
      I.swellTo(d, t + 1.5, t + 3.6, 0.8);
      I.drum(d, t + 3.6, 'mus_boom', 1);
      [[3.6, 77, 0.6], [4.2, 79, 0.6], [4.8, 81, 2.2]].forEach(([dt, n, du]) => I.strings(d, t + dt, n, du, 0.5, { att: 0.1, rel: 1.5, bright: 0.7 }));
    },
  },
  objective: {
    dur: 2, gain: 2,
    play(I, d, t) {
      I.bell(d, t, 81, 0.7, 0, 1.6); I.bell(d, t + 0.16, 86, 0.8, 0, 2);
      I.strings(d, t, 62, 1.4, 0.25, { att: 0.2, rel: 0.8, bright: 0.4 });
      I.strings(d, t, 69, 1.4, 0.2, { att: 0.2, rel: 0.8, bright: 0.4 });
    },
  },
};

// ---------------------------------------------------------------------------

export class Music {
  constructor(engine) {
    this.engine = engine;
    this.ctx = null;
    this.state = 'none';
    this.intensity = 0.5;
    this.players = [];
    this._curves = new Map();
    this._warned = new Set();
    this._gc = [];
  }
  curve(drive) {
    let c = this._curves.get(drive);
    if (!c) {
      c = new Float32Array(1024);
      const n = Math.tanh(drive);
      for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(x * drive) / n; }
      this._curves.set(drive, c);
    }
    return c;
  }
  // Attach to a context: `dest` receives the final music signal; `reverbIR` is an AudioBuffer.
  attach(ctx, dest, reverbIR) {
    this.ctx = ctx;
    this.inst = new Inst(ctx, this);
    this.stateBus = ctx.createGain();
    this.duck = ctx.createGain();
    this.stingBus = ctx.createGain();
    this.pre = ctx.createGain();
    this.pre.gain.value = 0.9;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.3;
    this.makeup = ctx.createGain();
    this.makeup.gain.value = 0.95;
    this.stateBus.connect(this.duck);
    this.duck.connect(this.pre);
    this.stingBus.connect(this.pre);
    this.pre.connect(this.comp);
    this.comp.connect(this.makeup);
    this.makeup.connect(dest);
    if (reverbIR) {
      this.conv = ctx.createConvolver();
      this.conv.buffer = reverbIR;
      const send = ctx.createGain(); send.gain.value = 0.32;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 150;
      this.pre.connect(send); send.connect(hp); hp.connect(this.conv); this.conv.connect(this.makeup);
    }
    const s = this.state;
    this.state = 'none';
    if (s !== 'none') this.setState(s);
  }
  setState(state) {
    if (state == null) state = 'none';
    if (state !== 'none' && !STATES[state]) {
      if (!this._warned.has(state)) { this._warned.add(state); console.warn('[audio] unknown music state', state); }
      return;
    }
    if (state === this.state) return;
    this.state = state;
    if (!this.ctx) return;
    const urgent = state === 'horde' || state === 'tank';
    for (const p of this.players) p.stop(urgent ? 1.0 : state === 'none' ? 2.5 : 2.0);
    if (state !== 'none') {
      const p = new StatePlayer(this, state);
      this.players.push(p);
      p.schedule(this.ctx.currentTime + LOOKAHEAD);
    }
  }
  setIntensity(x) {
    x = Math.max(0, Math.min(1, +x || 0));
    if (Math.abs(x - this.intensity) < 1e-3) return;
    this.intensity = x;
    for (const p of this.players) if (!p.stopping) p.setIntensity(x);
  }
  stinger(name) {
    const st = STINGERS[name];
    if (!st) {
      if (!this._warned.has(name)) { this._warned.add(name); console.warn('[audio] unknown stinger', name); }
      return;
    }
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    let dest = this.stingBus;
    if (st.gain) { dest = this.ctx.createGain(); dest.gain.value = st.gain; dest.connect(this.stingBus); setTimeout(() => { try { dest.disconnect(); } catch (e) { /* ignore */ } }, (st.dur + 4) * 1000); }
    try { st.play(this.inst, dest, t); } catch (e) { console.warn('[music] stinger', e); }
    // duck the state music under the stinger
    const g = this.duck.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
    g.linearRampToValueAtTime(0.35, t + 0.15);
    g.setValueAtTime(0.35, t + st.dur * 0.75);
    g.linearRampToValueAtTime(1, t + st.dur + 1.2);
  }
  tick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // release finished notes ([node, end, node, end, ...])
    const gc = this._gc;
    if (gc.length) {
      let w = 0;
      for (let i = 0; i < gc.length; i += 2) {
        if (now > gc[i + 1] + 0.05) { try { gc[i].disconnect(); } catch (e) { /* ignore */ } }
        else { gc[w++] = gc[i]; gc[w++] = gc[i + 1]; }
      }
      gc.length = w;
    }
    for (let i = this.players.length - 1; i >= 0; i--) {
      const p = this.players[i];
      if (p.stopping && now > p.endAt + 0.2) { p.dispose(); this.players.splice(i, 1); continue; }
      p.schedule(now + this._lookahead());
    }
  }
  // longer lookahead while the tab is hidden (background timers are throttled to ~1 Hz)
  _lookahead() { return typeof document !== 'undefined' && document.hidden ? 1.6 : LOOKAHEAD; }
  // Pre-schedule `sec` seconds (used for offline rendering tests).
  _prerun(sec) { for (const p of this.players) p.schedule(this.ctx.currentTime + sec); }
  stopAll() {
    for (const p of this.players) p.stop(0.3);
    this.state = 'none';
  }
}
