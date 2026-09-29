// Procedural sound design toolkit + every sound effect in the game.

type NoiseKind = 'white' | 'pink' | 'brown';

export class Synth {
  private buffers = new Map<NoiseKind, AudioBuffer>();

  constructor(readonly ctx: AudioContext, readonly reverb: AudioNode) {
    for (const k of ['white', 'pink', 'brown'] as NoiseKind[]) this.buffers.set(k, this.makeNoise(k));
  }

  private makeNoise(kind: NoiseKind): AudioBuffer {
    const len = this.ctx.sampleRate * 3;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return b;
  }

  noise(kind: NoiseKind): AudioBuffer {
    return this.buffers.get(kind)!;
  }

  /** Noise burst through a filter with an ADSR-ish envelope. */
  nz(
    out: AudioNode,
    t: number,
    dur: number,
    o: { kind?: NoiseKind; type?: BiquadFilterType; f?: number; f2?: number; q?: number; gain?: number; attack?: number; curve?: 'exp' | 'lin'; rate?: number } = {},
  ) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(o.kind ?? 'white');
    src.playbackRate.value = o.rate ?? 1;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.f ?? 1000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.5;
    const a = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (o.curve === 'lin') g.gain.linearRampToValueAtTime(0.0001, t + dur);
    else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.05);
  }

  /** Oscillator tone with pitch glide and envelope. */
  tone(
    out: AudioNode,
    t: number,
    dur: number,
    o: { type?: OscillatorType; f: number; f2?: number; gain?: number; attack?: number; detune?: number; glide?: number; vibrato?: number },
  ) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.glide ?? dur));
    if (o.detune) osc.detune.value = o.detune;
    if (o.vibrato) {
      const l = ctx.createOscillator();
      l.frequency.value = 5.5;
      const lg = ctx.createGain();
      lg.gain.value = o.vibrato;
      l.connect(lg).connect(osc.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    const g = ctx.createGain();
    const peak = o.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Inharmonic bell / metal ping. */
  bell(out: AudioNode, t: number, f: number, o: { gain?: number; decay?: number; partials?: number[]; rev?: number } = {}) {
    const parts = o.partials ?? [1, 2.76, 5.4, 8.93];
    const dec = o.decay ?? 0.8;
    const gain = o.gain ?? 0.2;
    parts.forEach((p, i) => {
      this.tone(out, t, dec / (1 + i * 0.6), { f: f * p, gain: gain / (1 + i * 1.2), attack: 0.002 });
      if (o.rev) this.tone(this.reverb, t, dec / (1 + i * 0.6), { f: f * p, gain: (gain * o.rev) / (1 + i * 1.2), attack: 0.002 });
    });
  }

  /** Marimba/EP-like pluck: sine + FM bite. */
  pluck(out: AudioNode, t: number, f: number, dur = 0.5, gain = 0.2, bright = 1) {
    const ctx = this.ctx;
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 1;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 1.6 * bright, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05 + 1, t + dur * 0.6);
    mod.connect(mg).connect(car.frequency);
    const tine = ctx.createOscillator();
    tine.frequency.value = f * 7.02;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(gain * 0.12 * bright, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(gain * 0.35, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(g).connect(out);
    tine.connect(tg).connect(out);
    for (const o of [car, mod, tine]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /** Several tiny noise grains (crunch / crackle textures). */
  grains(out: AudioNode, t: number, n: number, span: number, o: { f?: number; q?: number; gain?: number; len?: number } = {}) {
    for (let i = 0; i < n; i++) {
      const tt = t + Math.random() * span;
      this.nz(out, tt, (o.len ?? 0.012) * (0.6 + Math.random() * 0.8), { type: 'bandpass', f: (o.f ?? 4000) * (0.7 + Math.random() * 0.6), q: o.q ?? 1.5, gain: (o.gain ?? 0.3) * (0.4 + Math.random() * 0.6) });
    }
  }

  crackle(out: AudioNode, t: number, gain: number, pan: number) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(out);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.nz(p, t + i * 0.006, 0.004 + Math.random() * 0.01, { type: 'highpass', f: 2500 + Math.random() * 4000, q: 0.7, gain: gain * (0.5 + Math.random()) });
    setTimeout(() => p.disconnect(), 400);
  }

  clink(out: AudioNode, t: number, gain: number, f: number) {
    this.bell(out, t, f, { gain, decay: 0.35, partials: [1, 2.4, 3.9, 5.6], rev: 0.8 });
  }

  bird(out: AudioNode, t: number, gain: number) {
    const base = 2600 + Math.random() * 2400;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.07 + Math.random() * 0.05);
      this.tone(out, tt, 0.06, { f: base * (0.9 + Math.random() * 0.25), f2: base * (1.2 + Math.random() * 0.3), gain, attack: 0.005 });
    }
  }

  cricket(out: AudioNode, t: number, gain: number) {
    for (let i = 0; i < 3; i++) this.tone(out, t + i * 0.05, 0.03, { f: 4400 + Math.random() * 200, gain, type: 'sine', attack: 0.004 });
  }

  /**
   * Gibberish "Simlish" voice: a buzzy glottal source through two formant
   * filters per syllable, with mood-dependent pitch contours.
   */
  babble(out: AudioNode, t: number, dur: number, f0: number, mood: 'happy' | 'neutral' | 'angry' | 'sad', gain: number, pan = 0, raspy = false) {
    const ctx = this.ctx;
    const vowels: [number, number][] = [
      [800, 1200],
      [400, 2000],
      [330, 2300],
      [500, 900],
      [350, 750],
      [650, 1700],
    ];
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(out);
    let tt = t;
    const end = t + dur;
    let i = 0;
    while (tt < end - 0.05) {
      const syl = 0.075 + Math.random() * 0.075;
      const [F1, F2] = vowels[Math.floor(Math.random() * vowels.length)];
      const k = f0 > 230 ? 1.18 : f0 < 130 ? 0.88 : 1;
      let p0 = f0 * (0.92 + Math.random() * 0.2);
      let p1 = p0;
      const phrasePos = (tt - t) / dur;
      if (mood === 'happy') p1 = p0 * (1.08 + Math.random() * 0.15) * (phrasePos > 0.8 ? 1.15 : 1);
      else if (mood === 'angry') {
        p0 *= 0.92;
        p1 = p0 * (0.85 + Math.random() * 0.1);
      } else if (mood === 'sad') p1 = p0 * 0.85;
      else p1 = p0 * (0.95 + Math.random() * 0.12) * (phrasePos > 0.85 ? 1.12 : 1);
      const src = ctx.createOscillator();
      src.type = mood === 'angry' || raspy ? 'sawtooth' : 'triangle';
      src.frequency.setValueAtTime(p0, tt);
      src.frequency.linearRampToValueAtTime(p1, tt + syl);
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = F1 * k;
      f1.Q.value = 5;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = F2 * k;
      f2.Q.value = 7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(gain, tt + 0.015);
      g.gain.setValueAtTime(gain * 0.9, tt + syl * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + syl);
      const mix = ctx.createGain();
      mix.gain.value = 1.6;
      src.connect(f1).connect(g);
      src.connect(f2).connect(g);
      g.connect(mix).connect(panner);
      src.start(tt);
      src.stop(tt + syl + 0.02);
      // consonant onset
      if (Math.random() < 0.55) this.nz(panner, tt, 0.018, { type: 'highpass', f: 3500, gain: gain * 0.35 });
      tt += syl + (Math.random() < 0.18 ? 0.06 + Math.random() * 0.06 : 0.01);
      i++;
    }
    setTimeout(() => panner.disconnect(), (dur + 1) * 1000);
    return i;
  }
}

export type SfxFn = (s: Synth, out: AudioNode, t: number, rate: number) => void;

const note = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export const SFX = {
  click: (s, o, t, r) => {
    s.tone(o, t, 0.05, { f: 1300 * r, f2: 650 * r, gain: 0.22 });
    s.nz(o, t, 0.012, { type: 'highpass', f: 3000, gain: 0.15 });
  },
  hover: (s, o, t, r) => s.tone(o, t, 0.035, { f: 2200 * r, gain: 0.05 }),
  pop: (s, o, t, r) => s.tone(o, t, 0.08, { f: 420 * r, f2: 980 * r, gain: 0.2, glide: 0.05 }),
  pin: (s, o, t) => {
    s.bell(o, t, 2600, { gain: 0.08, decay: 0.12 });
    s.nz(o, t, 0.02, { type: 'highpass', f: 4000, gain: 0.1 });
  },
  whoosh: (s, o, t, r) => s.nz(o, t, 0.32, { kind: 'pink', type: 'bandpass', f: 500 * r, f2: 2200 * r, q: 1.2, gain: 0.22, attack: 0.12, curve: 'lin' }),
  cameraWhoosh: (s, o, t) => s.nz(o, t, 0.4, { kind: 'pink', type: 'bandpass', f: 300, f2: 1100, q: 0.9, gain: 0.1, attack: 0.18, curve: 'lin' }),
  pickup: (s, o, t, r) => {
    s.nz(o, t, 0.08, { type: 'bandpass', f: 1300 * r, f2: 2800 * r, q: 1.5, gain: 0.14 });
    s.tone(o, t, 0.05, { f: 700 * r, f2: 900 * r, gain: 0.05 });
  },
  pattyPlace: (s, o, t, r) => {
    s.tone(o, t, 0.14, { f: 120 * r, f2: 55, gain: 0.45 });
    s.nz(o, t, 0.08, { kind: 'pink', type: 'lowpass', f: 1100, q: 0.7, gain: 0.5, attack: 0.001 });
  },
  pattyStack: (s, o, t, r) => {
    s.tone(o, t, 0.12, { f: 140 * r, f2: 70, gain: 0.3 });
    s.nz(o, t, 0.07, { kind: 'pink', type: 'lowpass', f: 900, gain: 0.35, attack: 0.001 });
  },
  flipSlap: (s, o, t, r) => {
    s.nz(o, t, 0.06, { type: 'bandpass', f: 1300 * r, q: 0.9, gain: 0.55, attack: 0.001 });
    s.tone(o, t, 0.12, { f: 110 * r, f2: 60, gain: 0.35 });
  },
  spatula: (s, o, t, r) => {
    s.nz(o, t, 0.16, { type: 'bandpass', f: 3200 * r, f2: 2400 * r, q: 6, gain: 0.12, attack: 0.02 });
    s.bell(o, t + 0.02, 2300 * r, { gain: 0.03, decay: 0.15 });
  },
  sizzleBurst: (s, o, t) => {
    s.nz(o, t, 1.2, { kind: 'pink', type: 'highpass', f: 2200, q: 0.6, gain: 0.3, attack: 0.01 });
    s.grains(o, t, 18, 0.8, { f: 5000, gain: 0.25, len: 0.008 });
  },
  flare: (s, o, t) => {
    s.nz(o, t, 0.55, { kind: 'brown', type: 'lowpass', f: 250, f2: 1400, q: 0.8, gain: 0.5, attack: 0.03 });
    s.nz(o, t + 0.05, 0.4, { kind: 'pink', type: 'bandpass', f: 1200, f2: 400, q: 0.7, gain: 0.18, attack: 0.05 });
  },
  bun: (s, o, t, r) => {
    s.nz(o, t, 0.1, { kind: 'pink', type: 'lowpass', f: 600 * r, q: 0.8, gain: 0.45, attack: 0.002 });
    s.tone(o, t, 0.1, { f: 170 * r, f2: 95, gain: 0.22 });
  },
  cheese: (s, o, t, r) => {
    s.nz(o, t, 0.09, { kind: 'pink', type: 'lowpass', f: 800 * r, f2: 300, q: 1.5, gain: 0.35, attack: 0.002 });
    s.tone(o, t, 0.07, { f: 260 * r, f2: 150, gain: 0.08 });
  },
  leafy: (s, o, t, r) => {
    s.grains(o, t, 12, 0.12, { f: 4200 * r, q: 1.2, gain: 0.3, len: 0.014 });
    s.nz(o, t, 0.1, { kind: 'pink', type: 'bandpass', f: 1800, q: 0.7, gain: 0.12 });
  },
  wet: (s, o, t, r) => {
    s.nz(o, t, 0.13, { kind: 'pink', type: 'bandpass', f: 1600 * r, f2: 380 * r, q: 3, gain: 0.45, attack: 0.002 });
    s.tone(o, t + 0.02, 0.05, { f: 1100 * r, f2: 1600 * r, gain: 0.06 });
  },
  crisp: (s, o, t, r) => {
    s.grains(o, t, 4, 0.05, { f: 5000 * r, q: 2, gain: 0.35 });
    s.nz(o, t, 0.05, { type: 'bandpass', f: 2600 * r, q: 2, gain: 0.2 });
  },
  crunchy: (s, o, t, r) => {
    s.grains(o, t, 16, 0.2, { f: 3200 * r, q: 1.2, gain: 0.35, len: 0.018 });
    s.nz(o, t, 0.1, { kind: 'pink', type: 'lowpass', f: 700, gain: 0.2 });
  },
  soft: (s, o, t, r) => s.nz(o, t, 0.1, { kind: 'pink', type: 'lowpass', f: 650 * r, q: 1, gain: 0.35, attack: 0.003 }),
  squirt: (s, o, t, r) => {
    const ctx = s.ctx;
    const src = ctx.createBufferSource();
    src.buffer = s.noise('pink');
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 4;
    f.frequency.value = 600 * r;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 17;
    const lg = ctx.createGain();
    lg.gain.value = 260 * r;
    lfo.connect(lg).connect(f.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.04);
    g.gain.setValueAtTime(0.45, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    src.connect(f).connect(g).connect(o);
    src.start(t);
    lfo.start(t);
    src.stop(t + 0.7);
    lfo.stop(t + 0.7);
    s.tone(o, t + 0.55, 0.08, { f: 180 * r, f2: 90, gain: 0.12 });
  },
  splat: (s, o, t, r) => s.nz(o, t, 0.12, { kind: 'pink', type: 'lowpass', f: 1400 * r, f2: 300, q: 1.2, gain: 0.4, attack: 0.001 }),
  stab: (s, o, t) => {
    s.tone(o, t, 0.04, { f: 800, f2: 320, gain: 0.18 });
    s.nz(o, t, 0.02, { type: 'highpass', f: 3000, gain: 0.1 });
  },
  burgerDone: (s, o, t) => {
    [72, 76, 79, 84].forEach((m, i) => s.pluck(o, t + i * 0.07, note(m), 0.7, 0.16, 1.2));
    s.bell(o, t + 0.3, note(96), { gain: 0.05, decay: 0.6, rev: 1 });
  },
  slide: (s, o, t) => s.nz(o, t, 0.4, { kind: 'pink', type: 'bandpass', f: 700, f2: 500, q: 1.2, gain: 0.16, attack: 0.03 }),
  plate: (s, o, t, r) => s.bell(o, t, 1900 * r, { gain: 0.08, decay: 0.3, partials: [1, 2.3, 3.8] }),
  trash: (s, o, t) => {
    s.nz(o, t, 0.2, { kind: 'brown', type: 'lowpass', f: 400, gain: 0.5 });
    s.grains(o, t + 0.05, 6, 0.2, { f: 2500, gain: 0.2 });
  },
  error: (s, o, t) => {
    s.tone(o, t, 0.09, { type: 'square', f: 220, gain: 0.06 });
    s.tone(o, t + 0.1, 0.12, { type: 'square', f: 175, gain: 0.06 });
  },
  wrong: (s, o, t) => s.tone(o, t, 0.18, { type: 'triangle', f: 320, f2: 190, gain: 0.18 }),
  orderUp: (s, o, t) => s.bell(o, t, 2350, { gain: 0.16, decay: 1.4, partials: [1, 2.02, 2.93, 4.1, 5.3], rev: 0.8 }),
  doorBell: (s, o, t) => {
    for (let i = 0; i < 4; i++) {
      s.bell(o, t + i * 0.09 + Math.random() * 0.03, 2800 * (1 + (i % 2) * 0.21), { gain: 0.07 / (1 + i * 0.4), decay: 0.9, rev: 0.6 });
    }
  },
  printer: (s, o, t) => {
    for (let i = 0; i < 12; i++) {
      s.tone(o, t + i * 0.055, 0.04, { type: 'square', f: 1150 + (i % 3) * 90, gain: 0.025 });
      s.nz(o, t + i * 0.055, 0.035, { type: 'bandpass', f: 3000, q: 2, gain: 0.08 });
    }
  },
  tear: (s, o, t) => s.grains(o, t, 14, 0.16, { f: 2800, q: 1.5, gain: 0.3, len: 0.012 }),
  timerDing: (s, o, t) => s.bell(o, t, 1580, { gain: 0.13, decay: 1.0, partials: [1, 2.72, 4.9], rev: 0.5 }),
  burnWarning: (s, o, t) => {
    s.tone(o, t, 0.08, { type: 'square', f: 880, gain: 0.04 });
    s.tone(o, t + 0.12, 0.08, { type: 'square', f: 880, gain: 0.04 });
  },
  step: (s, o, t, r) => {
    s.nz(o, t, 0.05, { kind: 'pink', type: 'lowpass', f: 380 * r, q: 1, gain: 0.25, attack: 0.001 });
    s.nz(o, t, 0.015, { type: 'bandpass', f: 2200 * r, q: 2, gain: 0.05 });
  },
  register: (s, o, t) => {
    s.nz(o, t, 0.05, { type: 'bandpass', f: 1500, q: 2, gain: 0.3 });
    s.tone(o, t, 0.08, { f: 200, f2: 90, gain: 0.2 });
    s.bell(o, t + 0.1, 3150, { gain: 0.1, decay: 0.9, partials: [1, 1.34, 2.5, 3.3], rev: 0.6 });
  },
  coin: (s, o, t, r) => s.bell(o, t, (3200 + Math.random() * 1500) * r, { gain: 0.07, decay: 0.25, partials: [1, 2.4, 3.8] }),
  coins: (s, o, t) => {
    const n = 7 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) s.bell(o, t + i * (0.035 + Math.random() * 0.04), 3000 + Math.random() * 2000, { gain: 0.06, decay: 0.22, partials: [1, 2.4, 3.8] });
  },
  success: (s, o, t) => {
    [67, 71, 74, 79].forEach((m, i) => s.pluck(o, t + i * 0.08, note(m), 0.8, 0.14, 1));
    s.pluck(o, t + 0.36, note(83), 1.2, 0.1, 0.8);
  },
  perfect: (s, o, t) => {
    [72, 76, 79, 84, 88].forEach((m, i) => s.pluck(o, t + i * 0.07, note(m), 1.0, 0.15, 1.2));
    [72, 76, 79].forEach((m) => s.tone(o, t + 0.4, 1.2, { type: 'triangle', f: note(m), gain: 0.06, attack: 0.05 }));
    for (let i = 0; i < 6; i++) s.bell(o, t + 0.4 + i * 0.06, note(96 + (i % 3) * 4), { gain: 0.03, decay: 0.5, rev: 1 });
  },
  meh: (s, o, t) => {
    s.pluck(o, t, note(67), 0.5, 0.1, 0.6);
    s.pluck(o, t + 0.16, note(65), 0.7, 0.1, 0.6);
  },
  fail: (s, o, t) => {
    [55, 54, 53].forEach((m, i) => s.tone(o, t + i * 0.28, 0.3, { type: 'sawtooth', f: note(m), gain: 0.05, vibrato: 3 }));
    s.tone(o, t + 0.84, 0.8, { type: 'sawtooth', f: note(52), f2: note(50), gain: 0.05, vibrato: 6, glide: 0.8 });
  },
  levelUp: (s, o, t) => {
    [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => s.pluck(o, t + i * 0.06, note(m), 0.9, 0.13, 1.1));
    [72, 76, 79, 84].forEach((m) => s.tone(o, t + 0.45, 1.6, { type: 'triangle', f: note(m), gain: 0.05, attack: 0.08 }));
    for (let i = 0; i < 8; i++) s.bell(o, t + 0.45 + i * 0.07, note(100 + (i % 4) * 3), { gain: 0.025, decay: 0.5, rev: 1 });
  },
  buy: (s, o, t) => {
    (SFX.register as SfxFn)(s, o, t, 1);
    [79, 84].forEach((m, i) => s.pluck(o, t + 0.2 + i * 0.08, note(m), 0.6, 0.1, 1));
  },
  unlock: (s, o, t) => (SFX.levelUp as SfxFn)(s, o, t, 1),
  tick: (s, o, t, r) => s.tone(o, t, 0.025, { f: 1500 * r, gain: 0.06 }),
  dingSmall: (s, o, t) => s.bell(o, t, 2100, { gain: 0.07, decay: 0.4 }),
  blip: (s, o, t) => s.tone(o, t, 0.08, { type: 'triangle', f: 660, gain: 0.1 }),
  thud: (s, o, t) => s.tone(o, t, 0.15, { f: 150, f2: 70, gain: 0.25 }),
  star: (s, o, t, r) => {
    s.tone(o, t, 0.25, { f: 1700 * r, gain: 0.08 });
    s.bell(o, t, 3400 * r, { gain: 0.03, decay: 0.3 });
  },
  chop: (s, o, t, r) => {
    s.nz(o, t, 0.03, { type: 'bandpass', f: 2600 * r, q: 2, gain: 0.3, attack: 0.001 });
    s.tone(o, t, 0.08, { f: 420 * r, f2: 300, gain: 0.2 });
  },
} satisfies Record<string, SfxFn>;

export type SfxId = keyof typeof SFX;
