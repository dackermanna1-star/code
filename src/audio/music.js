// Dead County audio — generative music.
// 'menu' / 'calm': sparse, melancholic felt-piano pieces (modal / pentatonic phrases, open voicings,
//   long decays, lots of space), played as occasional pieces separated by long silences.
// 'night': darker modes, lower register, slower, with a soft low drone pad under the piece.
// 'tense': continuous low drone + heartbeat-like pulse ostinato + dissonant shimmer while active.
// Piano notes play from pre-rendered multisamples (mus_piano_XX) via playbackRate.

import { PIANO_SAMPLES } from './sounds.js';
import { clamp } from './dsp.js';

const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};
const MINOR = new Set(['dorian', 'aeolian', 'phrygian']);

const LOOKAHEAD = 0.6;

function rng() {
  return {
    r: Math.random,
    rand: (a, b) => a + (b - a) * Math.random(),
    irand: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    chance: (p) => Math.random() < p,
  };
}

/**
 * Generate a piece: returns {events:[{t, midi, vel, dur}], drone?:{midi:[...]}, length, bpm}
 */
export function generatePiece(mood, R = rng()) {
  const night = mood === 'night';
  const modeName = night ? R.pick(['aeolian', 'dorian', 'phrygian', 'aeolian']) : R.pick(['ionian', 'lydian', 'mixolydian', 'ionian', 'dorian', 'lydian']);
  const scale = MODES[modeName];
  const minor = MINOR.has(modeName);
  const tonic = night ? R.pick([45, 46, 47, 48, 50]) : R.pick([48, 50, 51, 53, 55]);
  const bpm = night ? R.rand(46, 56) : mood === 'menu' ? R.rand(58, 68) : R.rand(56, 70);
  const beat = 60 / bpm;
  const meter = R.chance(0.3) ? 3 : 4;
  const bar = beat * meter;
  const P = (deg) => tonic + 12 * Math.floor(deg / 7) + scale[((deg % 7) + 7) % 7];

  const majorProgs = [[0, 5, 3, 4], [0, 3, 5, 4], [0, 4, 5, 3], [0, 2, 3, 0], [3, 0, 4, 0], [0, 3, 0, 4], [5, 3, 0, 4], [0, 1, 3, 0]];
  const minorProgs = [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6], [0, 2, 3, 0], [0, 5, 3, 4], [0, 3, 0, 6], [0, 5, 0, 3]];
  const progs = minor ? minorProgs : majorProgs;
  const progA = R.pick(progs);
  let progB = R.pick(progs);
  if (progB === progA) progB = progs[(progs.indexOf(progA) + 3) % progs.length];

  const makeMotif = () => {
    const r4 = [[1, 1, 2], [2, 1, 1], [1.5, 0.5, 2], [0.5, 0.5, 1, 2], [1, 1, 1, 1], [3, 1], [2, 2], [1, 0.5, 0.5, 2], [4]];
    const r3 = [[1, 1, 1], [2, 1], [1.5, 0.5, 1], [1, 2], [3], [0.5, 0.5, 2]];
    const rhythm = R.pick(meter === 4 ? r4 : r3);
    const steps = [];
    let st = R.pick([0, 2, 4, 4, 7]);
    for (let i = 0; i < rhythm.length; i++) {
      steps.push(R.chance(0.12) && i > 0 ? null : st);
      st += R.pick([-2, -1, -1, 1, 1, 2, -3, 3, 0, 1, -1]);
      st = clamp(st, -3, 9);
    }
    // land on a chord tone
    const last = steps.length - 1;
    if (steps[last] !== null) steps[last] = [0, 2, 4, 7].reduce((a, b) => (Math.abs(b - steps[last]) < Math.abs(a - steps[last]) ? b : a));
    return { rhythm, steps };
  };
  const motifA = makeMotif();
  const motifB = makeMotif();
  const vary = (m) => ({
    rhythm: m.rhythm,
    steps: m.steps.map((x, i) => (x === null ? null : i === m.steps.length - 1 ? x : x + (R.chance(0.35) ? R.pick([-1, 1, 2]) : 0))),
  });

  const ev = [];
  const note = (t, midi, vel, dur) => {
    if (midi < 31 || midi > 92) return;
    ev.push({ t: t + R.rand(-0.012, 0.018), midi, vel, dur });
  };
  const melDeg = (c, step) => {
    let d = c + step + 7;
    while (d > (night ? 14 : 16)) d -= 7;
    while (d < (night ? 3 : 5)) d += 7;
    return d;
  };
  const lhStyle = () => R.pick(['drone', 'broken', 'half', 'sparse', 'broken']);

  let t = 0.4;
  const lh = (c, t0, style, vel) => {
    const root = P(c - 7);
    const rootLow = root - (night && R.chance(0.4) ? 12 : 0);
    if (style === 'drone') {
      note(t0, rootLow, vel, bar * 1.6);
      note(t0 + 0.035, P(c + 4 - 7), vel * 0.7, bar * 1.5);
      if (R.chance(0.4)) note(t0 + 0.07, P(c + 8 - 7), vel * 0.5, bar * 1.4);
    } else if (style === 'broken') {
      note(t0, rootLow, vel, bar * 1.4);
      note(t0 + beat, P(c + 4 - 7), vel * 0.7, bar);
      note(t0 + beat * 2, P(c + 2), vel * 0.6, bar * 0.8);
      if (meter === 4 && R.chance(0.6)) note(t0 + beat * 3, P(c + 4 - 7), vel * 0.5, beat * 1.5);
    } else if (style === 'half') {
      note(t0, rootLow, vel, bar);
      note(t0 + beat * (meter === 4 ? 2 : 1.5), P(c + 4 - 7), vel * 0.65, bar * 0.8);
      if (R.chance(0.5)) note(t0 + beat * (meter === 4 ? 2 : 1.5) + 0.03, P(c + 7 - 7), vel * 0.5, bar * 0.8);
    } else {
      note(t0, rootLow, vel, bar * 1.8);
    }
  };
  const phrase = (motif, c, t0, vel, dyad) => {
    let tt = t0;
    for (let i = 0; i < motif.rhythm.length; i++) {
      const d = motif.rhythm[i] * beat;
      if (motif.steps[i] !== null) {
        const deg = melDeg(c, motif.steps[i]);
        const acc = i === 0 ? 1.12 : 1;
        note(tt, P(deg), vel * acc * R.rand(0.88, 1.05), d * 1.6);
        if (dyad && R.chance(0.35)) note(tt + 0.02, P(deg - 2), vel * 0.55, d * 1.4);
      }
      tt += d;
    }
  };

  // intro: left hand only
  const introBars = R.irand(1, 2);
  const style0 = lhStyle();
  for (let i = 0; i < introBars; i++) {
    lh(progA[0], t, style0, R.rand(0.3, 0.4));
    t += bar;
  }
  const form = R.pick([['A', 'A', 'B', 'A'], ['A', 'B', 'A'], ['A', 'A', 'B', 'B', 'A'], ['A', 'B', 'B', 'A'], ['A', 'B', 'A', 'B']]);
  const density = night ? 0.5 : mood === 'menu' ? 0.75 : 0.65;
  form.forEach((sec, si) => {
    const prog = sec === 'A' ? progA : progB;
    let motif = sec === 'A' ? motifA : motifB;
    if (si > 0 && form.indexOf(sec) < si) motif = vary(motif);
    const style = R.chance(0.6) ? style0 : lhStyle();
    const secVel = R.rand(0.38, 0.55) * (si === form.length - 1 ? 0.85 : 1);
    for (let b = 0; b < 4; b++) {
      const c = prog[b];
      lh(c, t, style, secVel * 0.75);
      // melody: phrases mostly on even bars, answers on odd bars
      if (b % 2 === 0) {
        if (R.chance(density)) phrase(motif, c, t + (R.chance(0.3) ? beat : 0), secVel, !night);
      } else if (R.chance(density * 0.6)) {
        // answer: a held chord tone, or the motif varied
        if (R.chance(0.5)) note(t + beat * R.pick([0, 1, 2]), P(melDeg(c, R.pick([0, 2, 4]))), secVel * 0.8, bar * 1.5);
        else phrase(vary(motif), c, t, secVel * 0.9, false);
      }
      t += bar;
    }
    // breathing room between sections
    if (R.chance(night ? 0.6 : 0.4)) {
      lh(prog[0], t, 'sparse', secVel * 0.6);
      t += bar * R.irand(1, 2);
    }
  });
  // outro: final tonic chord, rolled
  const fin = [P(-7), P(-3), P(0), P(2), P(4 + 7)];
  if (R.chance(0.5)) fin.push(P(8)); // add9 colour
  fin.forEach((m, i) => note(t + i * 0.07, m, 0.32 - i * 0.025, bar * 3));
  t += bar * 3 + 2;
  ev.sort((a, b) => a.t - b.t);
  return { events: ev, length: t, bpm, mode: modeName, tonic, drone: night ? [tonic - 24, tonic - 17] : null };
}

export class MusicSystem {
  constructor(engine) {
    this.e = engine;
    this.ctx = engine.ctx;
    this.mood = 'none';
    this.current = null; // active piece / tense player
    this.fading = [];
    this.nextStart = Infinity;
    this.req = 'none';
    this.reqSince = 0;
  }

  /** debounced mood request (called every frame by the game) */
  request(m) {
    if (m !== this.req) {
      this.req = m;
      this.reqSince = this.ctx.currentTime;
    }
    this._applyRequest();
  }

  _applyRequest() {
    const m = this.req;
    if (m === this.mood) return;
    const held = this.ctx.currentTime - this.reqSince;
    let need = 2;
    if (m === 'menu' || m === 'none' || this.mood === 'menu' || this.mood === 'none') need = 0;
    else if (m === 'tense') need = 0.5;
    else if (this.mood === 'tense') need = 8;
    if (held >= need) this.setMood(m);
  }

  setMood(m) {
    if (!['menu', 'calm', 'night', 'tense', 'none'].includes(m)) m = 'none';
    if (m === this.mood) return;
    const prev = this.mood;
    this.mood = m;
    const now = this.ctx.currentTime;
    // calm <-> night: let a playing piece finish naturally unless switching to/from tense/menu/none
    const soft = (prev === 'calm' && m === 'night') || (prev === 'night' && m === 'calm');
    if (this.current && !soft) this._fadeOut(this.current, m === 'tense' ? 1.5 : 3);
    if (this.current && soft) return;
    if (m === 'tense') this.current = this._startTense();
    else if (m === 'none') this.nextStart = Infinity;
    else {
      const delay = m === 'menu' ? (prev === 'none' ? 0.5 : 1.5) : prev === 'tense' ? 6 + Math.random() * 10 : 4 + Math.random() * 16;
      this.nextStart = now + delay;
    }
  }

  _fadeOut(p, time) {
    const now = this.ctx.currentTime;
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setValueAtTime(p.gain.gain.value, now);
    p.gain.gain.setTargetAtTime(0, now, time / 4);
    p.killAt = now + time + 0.5;
    this.fading.push(p);
    if (this.current === p) this.current = null;
  }

  _kill(p) {
    for (const n of p.nodes) {
      try {
        n.stop?.();
      } catch (e) {
        /* already stopped */
      }
      try {
        n.disconnect();
      } catch (e) {
        /* ignore */
      }
    }
    p.nodes.clear();
    try {
      p.gain.disconnect();
    } catch (e) {
      /* ignore */
    }
  }

  _newPlayer(kind, level = 1) {
    const g = this.ctx.createGain();
    g.gain.value = level;
    g.connect(this.e.musicIn);
    return { kind, gain: g, nodes: new Set() };
  }

  _pianoReady() {
    return PIANO_SAMPLES.every((m) => this.e.buffers.has('mus_piano_' + m));
  }

  _startPiece() {
    const piece = this._newPlayer(this.mood, 0.85);
    piece.mood = this.mood;
    const gen = generatePiece(this.mood);
    piece.events = gen.events;
    piece.idx = 0;
    piece.t0 = this.ctx.currentTime + 0.1;
    piece.length = gen.length;
    if (gen.drone) this._drone(piece, gen.drone, gen.length);
    this.current = piece;
    this.e._debug && console.log('[music] piece', piece.mood, gen.mode, gen.bpm.toFixed(0), gen.length.toFixed(0) + 's');
  }

  _drone(p, midis, length) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.1;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.07, t0 + 6);
    g.gain.setValueAtTime(0.07, t0 + Math.max(6.1, length - 8));
    g.gain.linearRampToValueAtTime(0, t0 + length);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.Q.value = 0.8;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lg = ctx.createGain();
    lg.gain.value = 120;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start(t0);
    lfo.stop(t0 + length + 0.5);
    p.nodes.add(lfo);
    for (const m of midis) {
      const f = 440 * Math.pow(2, (m - 69) / 12);
      for (const [type, det] of [['sawtooth', -6], ['triangle', 5]]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t0);
        o.stop(t0 + length + 0.5);
        p.nodes.add(o);
      }
    }
    lp.connect(g);
    g.connect(p.gain);
    p.nodes.add(g);
    p.nodes.add(lp);
  }

  _note(p, midi, time, vel, dur) {
    const ctx = this.ctx;
    let best = PIANO_SAMPLES[0];
    for (const m of PIANO_SAMPLES) if (Math.abs(m - midi) < Math.abs(best - midi)) best = m;
    const bufs = this.e.buffers.get('mus_piano_' + best);
    if (!bufs || !bufs[0]) return;
    const buf = bufs[0];
    const rate = Math.pow(2, (midi - best) / 12);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vel;
    const end = time + dur;
    g.gain.setValueAtTime(vel, end);
    g.gain.setTargetAtTime(0, end, 0.35);
    let tail = g;
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = clamp((midi - 60) / 40, -0.45, 0.45);
      g.connect(pan);
      tail = pan;
      p.nodes.add(pan);
    }
    src.connect(g);
    tail.connect(p.gain);
    const stopAt = Math.min(end + 2.5, time + buf.duration / rate);
    src.start(time);
    src.stop(Math.max(time + 0.05, stopAt));
    p.nodes.add(src);
    p.nodes.add(g);
    src.onended = () => {
      p.nodes.delete(src);
      p.nodes.delete(g);
      try {
        g.disconnect();
        tail.disconnect();
      } catch (e) {
        /* ignore */
      }
      if (tail !== g) p.nodes.delete(tail);
    };
  }

  // ------------------------------------------------------------------ tense
  _startTense() {
    const ctx = this.ctx;
    const p = this._newPlayer('tense', 0);
    const t0 = ctx.currentTime + 0.05;
    p.gain.gain.setValueAtTime(0, t0);
    p.gain.gain.linearRampToValueAtTime(0.6, t0 + 3);
    p.start = t0;
    // drone: sub sine + two detuned saws through a slowly opening resonant lowpass
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(140, t0);
    lp.frequency.linearRampToValueAtTime(420, t0 + 40);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 70;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start(t0);
    p.nodes.add(lfo);
    const dg = ctx.createGain();
    dg.gain.value = 0.16;
    const root = 41.2; // E1
    for (const [type, f, det, gain] of [['sine', root, 0, 1.6], ['sawtooth', root * 2, -7, 0.5], ['sawtooth', root * 2, 8, 0.5], ['sawtooth', root * 3, 3, 0.18]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = gain;
      o.connect(og);
      og.connect(type === 'sine' ? dg : lp);
      o.start(t0);
      p.nodes.add(o);
      p.nodes.add(og);
    }
    lp.connect(dg);
    dg.connect(p.gain);
    p.nodes.add(lp);
    p.nodes.add(dg);
    p.nextPulse = t0 + 1.5;
    p.pulseIdx = 0;
    p.period = 0.92;
    p.nextShimmer = t0 + 8 + Math.random() * 6;
    p.nextCluster = t0 + 12 + Math.random() * 8;
    return p;
  }

  _updateTense(p, now) {
    const ctx = this.ctx;
    const pulse = this.e.buffers.get('mus_pulse');
    const age = now - p.start;
    const intensity = clamp(age / 40, 0.35, 1);
    while (p.nextPulse < now + LOOKAHEAD) {
      if (p.nextPulse < now - 0.2) {
        p.nextPulse = now + 0.05;
      }
      if (pulse) {
        // "dum-dum ..... dum-dum": heartbeat-like double pulse
        for (const [dt, v] of [[0, 1], [0.27, 0.62]]) {
          const src = ctx.createBufferSource();
          src.buffer = pulse[0];
          src.playbackRate.value = p.pulseIdx % 8 === 7 ? 0.94 : 1;
          const g = ctx.createGain();
          g.gain.value = v * 0.55 * intensity;
          src.connect(g);
          g.connect(p.gain);
          src.start(p.nextPulse + dt);
          p.nodes.add(src);
          src.onended = () => {
            p.nodes.delete(src);
            g.disconnect();
          };
        }
      }
      p.pulseIdx++;
      p.period = Math.max(0.68, p.period - 0.0015); // slowly accelerating
      p.nextPulse += p.period;
    }
    if (now > p.nextShimmer) {
      // dissonant high minor-second shimmer with tremolo
      const t = now + 0.05;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.022, t + 2.5);
      g.gain.linearRampToValueAtTime(0, t + 6);
      const trem = ctx.createGain();
      trem.gain.value = 0.6;
      const tl = ctx.createOscillator();
      tl.frequency.value = 6.5;
      const tlg = ctx.createGain();
      tlg.gain.value = 0.4;
      tl.connect(tlg);
      tlg.connect(trem.gain);
      const base = Math.random() < 0.5 ? 659.26 : 587.33;
      let alive = 2;
      for (const f of [base, base * 1.0595]) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        o.connect(trem);
        o.start(t);
        o.stop(t + 6.1);
        p.nodes.add(o);
        o.onended = () => {
          p.nodes.delete(o);
          if (--alive === 0) {
            g.disconnect();
            trem.disconnect();
            tlg.disconnect();
          }
        };
      }
      tl.start(t);
      tl.stop(t + 6.1);
      trem.connect(g);
      g.connect(p.gain);
      p.nextShimmer = now + 10 + Math.random() * 12;
    }
    if (now > p.nextCluster && this._pianoReady()) {
      const t = now + 0.05;
      const low = Math.random() < 0.5 ? 40 : 41;
      this._note(p, low, t, 0.4, 5);
      this._note(p, low + 1, t + 0.02, 0.3, 5);
      if (Math.random() < 0.5) this._note(p, low + 6, t + 0.04, 0.22, 4);
      p.nextCluster = now + 11 + Math.random() * 12;
    }
  }

  update() {
    const now = this.ctx.currentTime;
    this._applyRequest();
    // fades
    for (let i = this.fading.length - 1; i >= 0; i--) {
      if (now > this.fading[i].killAt) {
        this._kill(this.fading[i]);
        this.fading.splice(i, 1);
      }
    }
    if (this.mood === 'tense') {
      if (!this.current) this.current = this._startTense();
      this._updateTense(this.current, now);
      return;
    }
    const p = this.current;
    if (!p) {
      if (this.mood !== 'none' && now >= this.nextStart) {
        if (this._pianoReady()) this._startPiece();
        else this.nextStart = now + 0.5;
      }
      return;
    }
    // schedule piece events
    while (p.idx < p.events.length) {
      const ev = p.events[p.idx];
      let at = p.t0 + ev.t;
      if (at > now + LOOKAHEAD) break;
      if (at < now - 0.15) {
        // we fell behind (tab hidden): shift the rest of the piece instead of dumping notes
        p.t0 = now + 0.05 - ev.t;
        at = now + 0.05;
      }
      this._note(p, ev.midi, Math.max(now, at), ev.vel, ev.dur);
      p.idx++;
    }
    if (p.idx >= p.events.length && now > p.t0 + p.length) {
      this._kill(p);
      this.current = null;
      const m = this.mood;
      const gap = m === 'menu' ? 8 + Math.random() * 14 : m === 'night' ? 70 + Math.random() * 110 : 50 + Math.random() * 100;
      this.nextStart = now + gap;
    }
  }
}
