// Procedural sound engine. Every sound in the game is synthesised at runtime with the
// Web Audio API, so there are no external audio assets to license or load.

import { clamp, rand } from './math.js';

const VOWELS = {
  a: [800, 1150, 2900],
  o: [450, 800, 2830],
  e: [400, 2000, 2550],
  u: [325, 700, 2530],
  aw: [570, 840, 2410],
  i: [300, 2300, 3000],
};

function makeDistortion(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.muted = false;
    this.lx = 0;
    this.ly = 0;
    this.last = new Map();
    this.loops = new Map();
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    const white = ctx.createBuffer(1, len, ctx.sampleRate);
    const wd = white.getChannelData(0);
    for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;
    this.white = white;

    const brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const bd = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      bd[i] = last * 3.5;
    }
    this.brown = brown;
    this.dist = makeDistortion(20);
    this.hardDist = makeDistortion(80);
    if (ctx.state === 'suspended') ctx.resume();
  }

  get ok() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }

  setMuted(m) {
    this.muted = m;
    this.setVolume(this.volume);
  }

  setListener(x, y) {
    this.lx = x;
    this.ly = y;
  }

  throttle(key, ms) {
    const now = performance.now();
    const t = this.last.get(key) || 0;
    if (now - t < ms) return false;
    this.last.set(key, now);
    return true;
  }

  spatial(x, y) {
    if (x === undefined || x === null) return 1;
    const d = Math.hypot(x - this.lx, y - this.ly);
    return clamp(1.2 - d / 38, 0, 1);
  }

  /** Create a spatialised output node. Returns null when inaudible. */
  out(x, y, gain = 1) {
    if (!this.ok) return null;
    const s = this.spatial(x, y);
    if (s <= 0.01) return null;
    const g = this.ctx.createGain();
    g.gain.value = gain * s;
    if (this.ctx.createStereoPanner && x !== undefined && x !== null) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp((x - this.lx) / 22, -0.8, 0.8);
      g.connect(p);
      p.connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  // ---------- primitives ----------

  noise(dest, { t = 0, dur = 0.2, type = 'lowpass', f0 = 1000, f1 = null, q = 1, gain = 1, attack = 0.002, buf = 'white', rate = 1 }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + t;
    const src = ctx.createBufferSource();
    src.buffer = buf === 'brown' ? this.brown : this.white;
    src.loop = true;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t0);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  tone(dest, { t = 0, type = 'sine', f0 = 440, f1 = null, dur = 0.2, gain = 0.5, attack = 0.004, hold = 0 }) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + t;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    if (hold) g.gain.setValueAtTime(gain, t0 + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return o;
  }

  // ---------- game sounds ----------

  impact(strength, material, x, y) {
    if (!this.throttle('imp' + material, 45)) return;
    const s = clamp(strength, 0, 1);
    const o = this.out(x, y, 0.25 + 0.75 * s);
    if (!o) return;
    switch (material) {
      case 'metal':
        this.noise(o, { type: 'bandpass', f0: rand(1800, 3200), q: 6, dur: 0.25, gain: 0.5 });
        this.tone(o, { type: 'triangle', f0: rand(500, 900), dur: 0.35 + s * 0.3, gain: 0.25 });
        this.tone(o, { type: 'sine', f0: rand(1300, 1900), dur: 0.25, gain: 0.12 });
        break;
      case 'wood':
        this.noise(o, { type: 'bandpass', f0: rand(600, 1100), q: 2.5, dur: 0.08, gain: 0.7 });
        this.tone(o, { f0: rand(180, 260), f1: 90, dur: 0.12, gain: 0.5 });
        break;
      case 'flesh':
        this.tone(o, { f0: rand(90, 130), f1: 45, dur: 0.14, gain: 0.7 });
        this.noise(o, { type: 'lowpass', f0: 700, f1: 200, dur: 0.1, gain: 0.5 });
        break;
      default:
        this.noise(o, { type: 'lowpass', f0: 500, f1: 150, dur: 0.16 + s * 0.15, gain: 0.8, buf: 'brown' });
        this.tone(o, { f0: 85, f1: 40, dur: 0.15, gain: 0.5 * s + 0.15 });
    }
  }

  crack(x, y) {
    if (!this.throttle('crack', 60)) return;
    const o = this.out(x, y, 0.7);
    if (!o) return;
    for (let i = 0; i < 3; i++) {
      this.noise(o, { t: i * rand(0.008, 0.02), type: 'highpass', f0: rand(1800, 3500), q: 1.5, dur: 0.03, gain: 0.9 });
    }
    this.tone(o, { type: 'square', f0: rand(1400, 2000), f1: 600, dur: 0.04, gain: 0.15 });
  }

  splat(strength, x, y) {
    if (!this.throttle('splat', 50)) return;
    const s = clamp(strength, 0.2, 1);
    const o = this.out(x, y, 0.5 + 0.5 * s);
    if (!o) return;
    this.noise(o, { type: 'lowpass', f0: 2200, f1: 180, q: 4, dur: 0.22 + s * 0.2, gain: 0.8 });
    this.noise(o, { t: 0.03, type: 'bandpass', f0: 600, f1: 250, q: 6, dur: 0.18, gain: 0.6 });
    this.tone(o, { f0: 140, f1: 50, dur: 0.18, gain: 0.5 * s });
  }

  gore(x, y) {
    this.crack(x, y);
    this.splat(1, x, y);
  }

  explosion(x, y, size = 1) {
    const o = this.out(x, y, 1.0);
    if (!o) return;
    this.noise(o, { type: 'lowpass', f0: 3000, f1: 300, dur: 0.12, gain: 1.0 });
    this.noise(o, { type: 'lowpass', f0: 1000 * size, f1: 90, dur: 1.4 + size * 0.5, gain: 1.4, buf: 'brown', attack: 0.01 });
    this.tone(o, { f0: 95, f1: 26, dur: 0.9, gain: 1.0, attack: 0.005 });
    for (let i = 0; i < 6; i++) {
      this.noise(o, { t: 0.05 + Math.random() * 0.5, type: 'highpass', f0: 2500, q: 1, dur: 0.03, gain: 0.25 });
    }
  }

  scream(voice, intensity = 1, x, y) {
    if (!this.ok) return;
    if (!this.throttle('scream' + (voice.id || ''), 900)) return;
    const o = this.out(x, y, 0.42);
    if (!o) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const dur = 0.55 + 0.6 * intensity * Math.random() + 0.2;
    const base = 260 * (voice.pitch || 1) * (1 + 0.25 * intensity) * rand(0.92, 1.1);
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(base * 0.8, t0);
    src.frequency.exponentialRampToValueAtTime(base * 1.25, t0 + 0.09);
    src.frequency.exponentialRampToValueAtTime(base * 0.72, t0 + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rand(6, 10);
    const lfoG = ctx.createGain();
    lfoG.gain.value = base * 0.06;
    lfo.connect(lfoG);
    lfoG.connect(src.frequency);

    const shaper = ctx.createWaveShaper();
    shaper.curve = this.dist;
    src.connect(shaper);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(1, t0 + 0.04);
    env.gain.setValueAtTime(1, t0 + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const forms = VOWELS[voice.vowel || 'a'];
    const fs = voice.formantShift || 1;
    const gains = [1, 0.55, 0.25];
    forms.forEach((f, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * fs;
      bp.Q.value = 7 + i * 3;
      const g = ctx.createGain();
      g.gain.value = gains[i] * 3.5;
      shaper.connect(bp);
      bp.connect(g);
      g.connect(env);
    });
    env.connect(o);
    this.noise(o, { type: 'highpass', f0: 1800, dur: dur * 0.9, gain: 0.08, attack: 0.04 });
    src.start(t0);
    lfo.start(t0);
    src.stop(t0 + dur + 0.05);
    lfo.stop(t0 + dur + 0.05);
  }

  grunt(voice, x, y) {
    if (!this.ok) return;
    if (!this.throttle('grunt' + (voice.id || ''), 280)) return;
    const o = this.out(x, y, 0.35);
    if (!o) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const base = 150 * (voice.pitch || 1) * rand(0.9, 1.15);
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(base * 1.2, t0);
    src.frequency.exponentialRampToValueAtTime(base * 0.75, t0 + 0.18);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(1, t0 + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    const forms = VOWELS.u;
    forms.forEach((f, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * (voice.formantShift || 1);
      bp.Q.value = 6;
      const g = ctx.createGain();
      g.gain.value = [3, 1.5, 0.6][i];
      src.connect(bp);
      bp.connect(g);
      g.connect(env);
    });
    env.connect(o);
    src.start(t0);
    src.stop(t0 + 0.25);
  }

  harpoonFire(x, y) {
    const o = this.out(x, y, 0.8);
    if (!o) return;
    this.noise(o, { type: 'bandpass', f0: 400, f1: 2600, q: 2, dur: 0.28, gain: 0.7 });
    this.tone(o, { type: 'sawtooth', f0: 190, f1: 120, dur: 0.3, gain: 0.25 });
    this.tone(o, { type: 'square', f0: 70, f1: 40, dur: 0.08, gain: 0.4 });
  }

  cannon(x, y) {
    const o = this.out(x, y, 0.9);
    if (!o) return;
    this.noise(o, { type: 'lowpass', f0: 1800, f1: 120, dur: 0.6, gain: 1.1, buf: 'brown' });
    this.tone(o, { f0: 120, f1: 35, dur: 0.4, gain: 0.8 });
  }

  impale(x, y) {
    if (!this.throttle('impale', 70)) return;
    const o = this.out(x, y, 0.8);
    if (!o) return;
    this.tone(o, { f0: 160, f1: 60, dur: 0.12, gain: 0.7 });
    this.noise(o, { type: 'bandpass', f0: 900, f1: 300, q: 5, dur: 0.2, gain: 0.7 });
    this.noise(o, { t: 0.02, type: 'lowpass', f0: 1600, f1: 200, q: 3, dur: 0.25, gain: 0.5 });
  }

  slice(x, y) {
    if (!this.throttle('slice', 60)) return;
    const o = this.out(x, y, 0.8);
    if (!o) return;
    this.noise(o, { type: 'highpass', f0: 2500, f1: 6000, q: 2, dur: 0.12, gain: 0.6 });
    this.splat(0.8, x, y);
  }

  boing(x, y) {
    if (!this.throttle('boing', 120)) return;
    const o = this.out(x, y, 0.7);
    if (!o) return;
    const osc = this.tone(o, { type: 'triangle', f0: 140, f1: 520, dur: 0.45, gain: 0.6 });
    if (osc) {
      const ctx = this.ctx;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 28;
      const lg = ctx.createGain();
      lg.gain.value = 40;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start();
      lfo.stop(ctx.currentTime + 0.5);
    }
    this.tone(o, { type: 'sine', f0: 70, f1: 50, dur: 0.15, gain: 0.5 });
  }

  boost(x, y) {
    if (!this.throttle('boost', 250)) return;
    const o = this.out(x, y, 0.6);
    if (!o) return;
    this.noise(o, { type: 'bandpass', f0: 300, f1: 3500, q: 1.5, dur: 0.45, gain: 0.6 });
    this.tone(o, { type: 'sawtooth', f0: 180, f1: 900, dur: 0.35, gain: 0.12 });
  }

  coin() {
    const o = this.out(undefined, undefined, 0.45);
    if (!o) return;
    this.tone(o, { type: 'square', f0: 1318, dur: 0.09, gain: 0.25 });
    this.tone(o, { t: 0.08, type: 'square', f0: 1760, dur: 0.25, gain: 0.25 });
    this.tone(o, { t: 0.08, type: 'sine', f0: 3520, dur: 0.3, gain: 0.1 });
  }

  checkpoint() {
    const o = this.out(undefined, undefined, 0.45);
    if (!o) return;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(o, { t: i * 0.07, type: 'triangle', f0: f, dur: 0.3, gain: 0.4 }));
  }

  fanfare() {
    const o = this.out(undefined, undefined, 0.5);
    if (!o) return;
    const notes = [523, 659, 784, 1046, 784, 1046, 1318];
    notes.forEach((f, i) => this.tone(o, { t: i * 0.11, type: 'square', f0: f, dur: 0.22, gain: 0.18 }));
    [523, 659, 784].forEach((f) => this.tone(o, { t: 0.8, type: 'triangle', f0: f, dur: 1.2, gain: 0.25, hold: 0.5 }));
  }

  sadTrombone() {
    const o = this.out(undefined, undefined, 0.35);
    if (!o) return;
    [392, 370, 349, 330].forEach((f, i) =>
      this.tone(o, { t: i * 0.32, type: 'sawtooth', f0: f, f1: i === 3 ? f * 0.85 : f, dur: i === 3 ? 0.9 : 0.3, gain: 0.18 })
    );
  }

  beep(x, y) {
    const o = this.out(x, y, 0.5);
    if (!o) return;
    this.tone(o, { type: 'square', f0: 1700, dur: 0.06, gain: 0.3 });
  }

  click() {
    const o = this.out(undefined, undefined, 0.3);
    if (!o) return;
    this.tone(o, { type: 'square', f0: 900, f1: 500, dur: 0.04, gain: 0.25 });
  }

  glass(x, y) {
    const o = this.out(x, y, 0.7);
    if (!o) return;
    this.noise(o, { type: 'highpass', f0: 3000, dur: 0.25, gain: 0.6 });
    for (let i = 0; i < 14; i++) {
      this.tone(o, { t: Math.random() * 0.35, type: 'sine', f0: rand(2500, 7000), dur: rand(0.05, 0.25), gain: rand(0.05, 0.15) });
    }
  }

  woodBreak(x, y) {
    if (!this.throttle('wood', 60)) return;
    const o = this.out(x, y, 0.7);
    if (!o) return;
    this.noise(o, { type: 'bandpass', f0: 1300, q: 1.5, dur: 0.12, gain: 0.9 });
    this.noise(o, { t: 0.04, type: 'bandpass', f0: 700, q: 2, dur: 0.15, gain: 0.6 });
    this.tone(o, { f0: 160, f1: 70, dur: 0.18, gain: 0.5 });
  }

  whoosh(x, y, s = 1) {
    if (!this.throttle('whoosh', 200)) return;
    const o = this.out(x, y, 0.35 * s);
    if (!o) return;
    this.noise(o, { type: 'bandpass', f0: 300, f1: 1200, q: 1.2, dur: 0.35, gain: 0.7, attack: 0.12 });
  }

  zap(x, y) {
    if (!this.throttle('zap', 90)) return;
    const o = this.out(x, y, 0.5);
    if (!o) return;
    this.tone(o, { type: 'sawtooth', f0: 120, dur: 0.18, gain: 0.3 });
    this.noise(o, { type: 'highpass', f0: 4000, dur: 0.15, gain: 0.4 });
  }

  honk(x, y) {
    if (!this.throttle('honk', 350)) return;
    const o = this.out(x, y, 0.7);
    if (!o) return;
    for (let i = 0; i < 2; i++) {
      const t = i * 0.17;
      this.tone(o, { t, type: 'square', f0: 360 - i * 40, f1: 300 - i * 40, dur: 0.14, gain: 0.3 });
      this.tone(o, { t, type: 'sawtooth', f0: 720 - i * 80, dur: 0.14, gain: 0.1 });
    }
  }

  bell(x, y) {
    if (!this.throttle('bell', 500)) return;
    const o = this.out(x, y, 0.5);
    if (!o) return;
    for (let i = 0; i < 2; i++) {
      this.tone(o, { t: i * 0.14, type: 'sine', f0: 2100, dur: 0.6, gain: 0.25 });
      this.tone(o, { t: i * 0.14, type: 'sine', f0: 2950, dur: 0.4, gain: 0.12 });
    }
  }

  tick(x, y) {
    const o = this.out(x, y, 0.12);
    if (!o) return;
    this.noise(o, { type: 'highpass', f0: 5000, dur: 0.02, gain: 0.5 });
  }

  // ---------- continuous loops ----------

  /** Get or create a named loop. `kind` selects the synth graph. */
  loop(key, kind) {
    if (!this.ok) return null;
    let l = this.loops.get(key);
    if (l) return l;
    l = this._makeLoop(kind);
    this.loops.set(key, l);
    return l;
  }

  stopLoop(key) {
    const l = this.loops.get(key);
    if (l) {
      l.stop();
      this.loops.delete(key);
    }
  }

  stopAllLoops() {
    for (const l of this.loops.values()) l.stop();
    this.loops.clear();
  }

  _makeLoop(kind) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);
    const nodes = [];
    const startNoise = (buf, filterType, f, q = 1) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      const fl = ctx.createBiquadFilter();
      fl.type = filterType;
      fl.frequency.value = f;
      fl.Q.value = q;
      s.connect(fl);
      s.start();
      nodes.push(s);
      return fl;
    };
    let set;
    if (kind === 'engine') {
      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      const o2 = ctx.createOscillator();
      o2.type = 'square';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 3;
      const sh = ctx.createWaveShaper();
      sh.curve = this.dist;
      o1.connect(sh);
      o2.connect(sh);
      sh.connect(lp);
      lp.connect(out);
      o1.start();
      o2.start();
      nodes.push(o1, o2);
      set = ({ rpm = 0, throttle = 0, gain = 1 }) => {
        const t = ctx.currentTime;
        const f = 38 + rpm * 150;
        o1.frequency.setTargetAtTime(f, t, 0.05);
        o2.frequency.setTargetAtTime(f * 0.501, t, 0.05);
        lp.frequency.setTargetAtTime(350 + throttle * 1600 + rpm * 600, t, 0.05);
        out.gain.setTargetAtTime((0.05 + throttle * 0.08) * gain, t, 0.06);
      };
    } else if (kind === 'hiss') {
      const fl = startNoise(this.white, 'highpass', 2200, 0.7);
      fl.connect(out);
      set = ({ gain = 0 }) => out.gain.setTargetAtTime(gain * 0.35, ctx.currentTime, 0.03);
    } else if (kind === 'roar') {
      const fl = startNoise(this.brown, 'lowpass', 900, 1);
      fl.connect(out);
      set = ({ gain = 0 }) => out.gain.setTargetAtTime(gain * 0.9, ctx.currentTime, 0.04);
    } else if (kind === 'wind') {
      const fl = startNoise(this.brown, 'bandpass', 500, 0.6);
      fl.connect(out);
      set = ({ speed = 0 }) => {
        const t = ctx.currentTime;
        fl.frequency.setTargetAtTime(300 + speed * 40, t, 0.2);
        out.gain.setTargetAtTime(clamp((speed - 4) / 30, 0, 1) * 0.5, t, 0.2);
      };
    } else if (kind === 'saw') {
      const o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = 96;
      const o2 = ctx.createOscillator();
      o2.type = 'square';
      o2.frequency.value = 193;
      const sh = ctx.createWaveShaper();
      sh.curve = this.hardDist;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 0.8;
      o1.connect(sh);
      o2.connect(sh);
      sh.connect(bp);
      bp.connect(out);
      o1.start();
      o2.start();
      nodes.push(o1, o2);
      set = ({ gain = 0 }) => out.gain.setTargetAtTime(gain * 0.06, ctx.currentTime, 0.08);
    } else if (kind === 'rumble') {
      const fl = startNoise(this.brown, 'lowpass', 260, 1);
      fl.connect(out);
      set = ({ gain = 0, f = 260 }) => {
        out.gain.setTargetAtTime(gain * 0.6, ctx.currentTime, 0.05);
        fl.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
      };
    } else {
      set = () => {};
    }
    return {
      set,
      stop: () => {
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0, t, 0.05);
        setTimeout(() => {
          for (const n of nodes) {
            try {
              n.stop();
            } catch (e) {
              /* already stopped */
            }
          }
          out.disconnect();
        }, 300);
      },
    };
  }
}
