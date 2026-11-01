import { AudioSys } from './audio';

/**
 * Procedural adaptive score (Web Audio, no samples).
 *
 * A dark D-minor progression (i - VI - III - VII, then i - iv - VI - V) at 104-124 BPM, built
 * up in layers as the fight heats up:
 *  - always: a slowly breathing pad and a sub drone, through a warehouse-sized reverb,
 *  - >0.12: a pulsing kick and a gated bass on the chord roots,
 *  - >0.32: the full kit - snare and hats from shaped noise, ghost notes, tom fills every 4 bars,
 *  - >0.55: a plucked arpeggio ostinato and metallic accents,
 *  - >0.8: driving 16th bass, open hats,
 *  - boss: a distorted bass, a low choir-like swell and a ticking clock.
 * Stingers mark a wave starting, a wave cleared and a boss entering.
 */
export class Music {
  intensity = 0;
  target = 0;
  boss = false;
  private started = false;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private bpm = 104;
  private noise: AudioBuffer | null = null;
  private bus: GainNode | null = null;
  private wet: GainNode | null = null;
  private pad: { osc: OscillatorNode[]; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private sub: { osc: OscillatorNode; gain: GainNode } | null = null;
  private choir: { osc: OscillatorNode[]; gain: GainNode } | null = null;
  private chord = 0;

  constructor(public audio: AudioSys) {}

  // ------------------------------------------------------------------ harmony
  /** Chord roots (semitones from D) and qualities for the two 4-bar phrases. */
  private static PROG: [number, number[]][] = [
    [0, [0, 3, 7]], // Dm
    [-4, [0, 4, 7]], // Bb
    [3, [0, 4, 7]], // F
    [-2, [0, 4, 7]], // C
    [0, [0, 3, 7]], // Dm
    [5, [0, 3, 7]], // Gm
    [-4, [0, 4, 7]], // Bb
    [7, [0, 4, 7]], // A (dominant)
  ];
  private hz(semi: number, octave = 0) {
    return 73.42 * Math.pow(2, (semi + octave * 12) / 12); // D2
  }

  start() {
    const c = this.audio.ctx;
    if (!c || this.started) return;
    this.started = true;
    // noise for snares / hats / swells
    const nb = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    // music bus with a send to a generated warehouse reverb
    const bus = c.createGain();
    bus.gain.value = 1;
    bus.connect(this.audio.music);
    const conv = c.createConvolver();
    conv.buffer = this.impulse(2.6, 2.2);
    const wet = c.createGain();
    wet.gain.value = 0.32;
    wet.connect(conv);
    conv.connect(this.audio.music);
    this.bus = bus;
    this.wet = wet;
    // pad: detuned saws through a slow, breathing lowpass
    const pf = c.createBiquadFilter();
    pf.type = 'lowpass';
    pf.frequency.value = 420;
    pf.Q.value = 2;
    const pg = c.createGain();
    pg.gain.value = 0;
    pf.connect(pg);
    pg.connect(bus);
    pg.connect(wet);
    const osc: OscillatorNode[] = [];
    for (const [semi, det] of [[0, -7], [7, 5], [12, -3], [15, 8], [19, 0]] as [number, number][]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = this.hz(semi, 1);
      o.detune.value = det;
      o.connect(pf);
      o.start();
      osc.push(o);
    }
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = c.createGain();
    lg.gain.value = 220;
    lfo.connect(lg);
    lg.connect(pf.frequency);
    lfo.start();
    this.pad = { osc, filter: pf, gain: pg };
    // sub drone
    const so = c.createOscillator();
    so.type = 'sine';
    so.frequency.value = this.hz(0, -1);
    const sg = c.createGain();
    sg.gain.value = 0;
    so.connect(sg);
    sg.connect(bus);
    so.start();
    this.sub = { osc: so, gain: sg };
    // boss choir: stacked triangles, slow swell
    const cg = c.createGain();
    cg.gain.value = 0;
    const cf = c.createBiquadFilter();
    cf.type = 'bandpass';
    cf.frequency.value = 700;
    cf.Q.value = 0.7;
    cf.connect(cg);
    cg.connect(bus);
    cg.connect(wet);
    const cos: OscillatorNode[] = [];
    for (const [semi, det] of [[0, -9], [0, 9], [3, -4], [7, 6], [12, 0]] as [number, number][]) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = this.hz(semi, 2);
      o.detune.value = det;
      o.connect(cf);
      o.start();
      cos.push(o);
    }
    this.choir = { osc: cos, gain: cg };
    this.nextTime = c.currentTime + 0.1;
  }

  /** Exponentially decaying stereo noise: a cheap, convincing large-room impulse response. */
  private impulse(sec: number, decay: number) {
    const c = this.audio.ctx!;
    const n = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }

  update(dt: number) {
    const c = this.audio.ctx;
    if (!c || !this.started || c.state !== 'running') return;
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * 0.8);
    const I = this.intensity;
    const t = c.currentTime;
    if (this.pad) {
      this.pad.gain.gain.setTargetAtTime(0.03 + (1 - I) * 0.025 + (this.boss ? 0.01 : 0), t, 0.8);
      this.pad.filter.Q.value = 2 + I * 5;
    }
    if (this.sub) this.sub.gain.gain.setTargetAtTime(0.05 + I * 0.07, t, 0.6);
    if (this.choir) this.choir.gain.gain.setTargetAtTime(this.boss ? 0.03 + I * 0.025 : 0, t, 1.5);
    const spb = 60 / (this.bpm + I * 20 + (this.boss ? 8 : 0)) / 4; // 16th notes
    while (this.nextTime < c.currentTime + 0.12) {
      if (this.step === 0) this.newBar(this.nextTime);
      this.schedule(this.step, this.nextTime, spb);
      this.nextTime += spb;
      this.step = (this.step + 1) % 16;
    }
  }

  private newBar(t: number) {
    this.bar++;
    this.chord = (this.bar - 1) % Music.PROG.length;
    const [root, q] = Music.PROG[this.chord];
    const c = this.audio.ctx!;
    // pad and drone glide to the new chord
    if (this.pad) {
      const notes = [q[0], q[2], q[0] + 12, q[1] + 12, q[2] + 12];
      this.pad.osc.forEach((o, i) => o.frequency.setTargetAtTime(this.hz(root + notes[i], 1), t, 0.35));
    }
    if (this.sub) this.sub.osc.frequency.setTargetAtTime(this.hz(root, -1), t, 0.2);
    if (this.choir) {
      const notes = [0, 0, q[1], q[2], 12];
      this.choir.osc.forEach((o, i) => o.frequency.setTargetAtTime(this.hz(root + notes[i], 2), t, 0.6));
    }
    void c;
  }

  private schedule(s: number, t: number, spb: number) {
    const I = this.intensity;
    const [root, q] = Music.PROG[this.chord];
    const barInPhrase = (this.bar - 1) % 4;
    // ---- kick: four on the floor once it builds, half time before
    if (I > 0.12 && (s === 0 || s === 8 || (I > 0.32 && (s === 4 || s === 12)) || (I > 0.7 && s === 10))) this.kick(t, 0.55 + I * 0.35);
    // ---- bass: gated root 8ths, driving 16ths at the top
    if (I > 0.12) {
      const every = I > 0.8 || this.boss ? 1 : 2;
      if (s % every === 0) {
        const oct = s % 8 === 6 ? 1 : 0;
        this.bass(t, this.hz(root, oct), spb * every * 0.9, (0.1 + I * 0.08) * (s % 4 === 0 ? 1 : 0.75), this.boss);
      }
    }
    // ---- snare on 2 and 4, ghosts, tom fill closing every 4th bar
    if (I > 0.32) {
      if (s === 4 || s === 12) this.snare(t, 0.22 + I * 0.12);
      else if (I > 0.5 && (s === 7 || s === 15) && Math.random() < 0.5) this.snare(t, 0.05);
      if (barInPhrase === 3 && s >= 12) this.tom(t, 140 - (s - 12) * 18, 0.22);
    }
    // ---- hats
    if (I > 0.32) {
      if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.06 : 0.035, 0.03);
      else if (I > 0.65) this.hat(t, 0.02, 0.025);
      if (I > 0.8 && s === 14) this.hat(t, 0.05, 0.22);
    }
    // ---- arpeggio ostinato over the chord
    if (I > 0.55 && s % 2 === 0) {
      const arp = [0, 1, 2, 1, 2, 0, 2, 1];
      const n = q[arp[(s / 2) % 8]] + (s >= 8 ? 12 : 0);
      this.pluck(t, this.hz(root + n, 2), (I - 0.45) * 0.09);
    }
    // ---- metallic accents
    if (I > 0.6 && (s === 6 || s === 14) && barInPhrase % 2 === 1) this.metal(t, 0.08 * I);
    // ---- boss: ticking clock
    if (this.boss && s % 2 === 1) this.tick(t, 0.035);
  }

  // ------------------------------------------------------------------ voices
  private out(g: GainNode, send = 0) {
    g.connect(this.bus!);
    if (send > 0 && this.wet) {
      const sg = this.audio.ctx!.createGain();
      sg.gain.value = send;
      g.connect(sg);
      sg.connect(this.wet);
    }
  }
  private env(g: GainNode, t: number, v: number, a: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private kick(t: number, vol: number) {
    const c = this.audio.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    this.env(g, t, vol, 0.003, 0.32);
    o.connect(g);
    this.out(g, 0.05);
    o.start(t);
    o.stop(t + 0.4);
    // beater click
    this.noiseHit(t, 0.06 * vol, 3500, 'bandpass', 0.012, 0);
  }
  private snare(t: number, vol: number) {
    const c = this.audio.ctx!;
    this.noiseHit(t, vol, 1800, 'highpass', 0.16, 0.25);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    this.env(g, t, vol * 0.5, 0.002, 0.1);
    o.connect(g);
    this.out(g, 0.15);
    o.start(t);
    o.stop(t + 0.15);
  }
  private hat(t: number, vol: number, len: number) {
    this.noiseHit(t, vol, 7500, 'highpass', len, 0.05);
  }
  private tom(t: number, f: number, vol: number) {
    const c = this.audio.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    this.env(g, t, vol, 0.003, 0.25);
    o.connect(g);
    this.out(g, 0.2);
    o.start(t);
    o.stop(t + 0.3);
  }
  private noiseHit(t: number, vol: number, freq: number, type: BiquadFilterType, len: number, send: number) {
    const c = this.audio.ctx!;
    if (!this.noise) return;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    this.env(g, t, vol, 0.002, len);
    src.connect(f);
    f.connect(g);
    this.out(g, send);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.05);
  }
  private bass(t: number, f: number, len: number, vol: number, dirty: boolean) {
    const c = this.audio.ctx!;
    const o = c.createOscillator();
    o.type = dirty ? 'square' : 'sawtooth';
    o.frequency.value = f;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(dirty ? 900 : 600, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + len);
    lp.Q.value = 6;
    const g = c.createGain();
    this.env(g, t, vol, 0.004, len);
    o.connect(lp);
    lp.connect(g);
    this.out(g, 0.04);
    o.start(t);
    o.stop(t + len + 0.05);
  }
  private pluck(t: number, f: number, vol: number) {
    const c = this.audio.ctx!;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + 0.18);
    const g = c.createGain();
    this.env(g, t, vol, 0.002, 0.22);
    o.connect(lp);
    lp.connect(g);
    this.out(g, 0.35);
    o.start(t);
    o.stop(t + 0.3);
  }
  private metal(t: number, vol: number) {
    const c = this.audio.ctx!;
    const g = c.createGain();
    this.env(g, t, vol, 0.003, 0.7);
    this.out(g, 0.5);
    for (const r of [1, 2.76, 5.4, 8.93]) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = 196 * r;
      const og = c.createGain();
      og.gain.value = 0.25 / r;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + 0.75);
    }
  }
  private tick(t: number, vol: number) {
    const c = this.audio.ctx!;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 2400;
    const g = c.createGain();
    this.env(g, t, vol, 0.002, 0.04);
    o.connect(g);
    this.out(g, 0.1);
    o.start(t);
    o.stop(t + 0.05);
  }

  // ------------------------------------------------------------------ stingers
  /** Musical punctuation: a wave starting, a wave cleared, a boss walking in. */
  stinger(kind: 'wave' | 'clear' | 'boss') {
    const c = this.audio.ctx;
    if (!c || !this.started || c.state !== 'running' || !this.noise) return;
    const t = c.currentTime + 0.02;
    if (kind === 'wave') {
      // rising noise swell into a big hit
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(5000, t + 0.9);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.85);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      src.connect(f);
      f.connect(g);
      this.out(g, 0.3);
      src.start(t);
      src.stop(t + 1.0);
      this.kick(t + 0.92, 1.2);
      this.metal(t + 0.92, 0.14);
    } else if (kind === 'clear') {
      // a resolved chord with a cymbal wash
      for (const [n, v] of [[0, 0.07], [7, 0.05], [12, 0.05], [16, 0.04]] as [number, number][]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = this.hz(n, 2);
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(2400, t);
        lp.frequency.exponentialRampToValueAtTime(300, t + 2.2);
        const g = c.createGain();
        this.env(g, t, v, 0.02, 2.4);
        o.connect(lp);
        lp.connect(g);
        this.out(g, 0.6);
        o.start(t);
        o.stop(t + 2.6);
      }
      this.noiseHit(t, 0.08, 6000, 'highpass', 1.6, 0.6);
    } else {
      // low brass-like swell and a heavy double hit
      for (const n of [0, 0.08, 7]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = this.hz(n, 0);
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(200, t);
        lp.frequency.exponentialRampToValueAtTime(1400, t + 1.4);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 1.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
        o.connect(lp);
        lp.connect(g);
        this.out(g, 0.5);
        o.start(t);
        o.stop(t + 2.7);
      }
      this.kick(t + 1.35, 1.3);
      this.kick(t + 1.6, 1.1);
      this.tom(t + 1.35, 70, 0.4);
    }
  }
}
