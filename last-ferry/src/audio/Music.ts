// Adaptive procedural score. A minor-key drone (detuned saws through a
// breathing lowpass) moves through i–VI–iv–V; over it a heartbeat, then a
// pulsing bass, taiko and ticking hats join as `intensity` rises (boarding
// progress + zombies on screen). Bosses add a brass stinger and a tense
// tremolo cluster; game over and victory get their own motifs.
import { loopSource, noiseBuffers } from './loops';

export type MusicPlay = (name: string, o: { volume?: number; pitch?: number; delay?: number; x?: number }) => void;

export interface MusicState {
  /** 0..1 */
  intensity: number;
  boss: boolean;
  /** 1..3 (selects the key). */
  chapter: number;
}

export type MusicCue = 'boss' | 'gameover' | 'victory' | 'chapter' | 'title' | 'play';

/** Chapter keys (drone roots, Hz): D, C, A. */
const ROOTS = [73.42, 65.41, 55.0];
/** Minor progression (semitones from the root): i, VI, iv, V. */
const PROG = [0, -4, 5, -5];
/** Bass pattern on the 16th grid (two bars of 8th/16th pulses). */
const BASS_STEPS = new Set([0, 3, 6, 8, 10, 11, 14]);
const semi = (f: number, s: number) => f * Math.pow(2, s / 12);

export class Music {
  private out: GainNode | null = null;
  private srcs: AudioScheduledSourceNode[] = [];
  private oscs: OscillatorNode[] = [];
  private droneLp!: BiquadFilterNode;
  private droneG!: GainNode;
  private tensionG!: GainNode;
  private tensionOscs: OscillatorNode[] = [];
  private state: MusicState = { intensity: 0.1, boss: false, chapter: 1 };
  /** Smoothed intensity actually used. */
  private level = 0.1;
  private nextStep = 0;
  private step = 0;
  private bar = 0;
  private bedOn = true;
  /** Debug: events scheduled. */
  readonly stats = { steps: 0, hits: 0 };

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
    private readonly play: MusicPlay,
  ) {}

  get running(): boolean {
    return this.out !== null;
  }

  get current(): Readonly<MusicState> & { level: number } {
    return { ...this.state, level: this.level };
  }

  start(fadeIn = 3): void {
    if (this.out) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.setTargetAtTime(1, t, fadeIn / 3);
    out.connect(this.dest);
    this.out = out;
    this.bedOn = true;

    // Drone: root, fifth, octave (two detuned saws each) + a sub sine.
    this.droneLp = ctx.createBiquadFilter();
    this.droneLp.type = 'lowpass';
    this.droneLp.frequency.value = 260;
    this.droneLp.Q.value = 1.2;
    this.droneG = ctx.createGain();
    this.droneG.gain.value = 0.09;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoD = ctx.createGain();
    lfoD.gain.value = 70;
    lfo.connect(lfoD).connect(this.droneLp.frequency);
    this.oscs = [];
    const ratios = [1, 1, 1.5, 1.5, 2, 2];
    ratios.forEach((r, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = i % 2 ? 7 : -7;
      o.frequency.value = this.root() * r;
      const g = ctx.createGain();
      g.gain.value = r === 2 ? 0.5 : r === 1.5 ? 0.6 : 1;
      o.connect(g).connect(this.droneLp);
      this.oscs.push(o);
    });
    const sub = ctx.createOscillator();
    sub.frequency.value = this.root() / 2;
    const subG = ctx.createGain();
    subG.gain.value = 0.5;
    sub.connect(subG).connect(this.droneLp);
    this.oscs.push(sub);
    this.droneLp.connect(this.droneG).connect(out);

    // Tension: a high minor-second cluster with tremolo (bosses, panic).
    const tbp = ctx.createBiquadFilter();
    tbp.type = 'bandpass';
    tbp.frequency.value = 1400;
    tbp.Q.value = 0.8;
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const tl = ctx.createOscillator();
    tl.frequency.value = 9;
    const tld = ctx.createGain();
    tld.gain.value = 0.5;
    tl.connect(tld).connect(trem.gain);
    this.tensionG = ctx.createGain();
    this.tensionG.gain.value = 0;
    this.tensionOscs = [0, 1, 7].map((s) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = semi(this.root() * 8, s);
      o.connect(tbp);
      return o;
    });
    tbp.connect(trem).connect(this.tensionG).connect(out);

    // Air: a whisper of filtered noise so the bed never sits in silence.
    const air = loopSource(ctx, noiseBuffers(ctx).pink);
    const abp = ctx.createBiquadFilter();
    abp.type = 'bandpass';
    abp.frequency.value = 700;
    abp.Q.value = 0.5;
    const ag = ctx.createGain();
    ag.gain.value = 0.025;
    air.connect(abp).connect(ag).connect(out);

    for (const o of [...this.oscs, ...this.tensionOscs, lfo, tl]) o.start(t);
    this.srcs = [...this.oscs, ...this.tensionOscs, lfo, tl, air];
    this.nextStep = t + 0.1;
    this.step = 0;
    this.bar = 0;
    this.applyLevel(true);
  }

  stop(fadeOut = 1.5): void {
    const out = this.out;
    if (!out) return;
    this.out = null;
    const t = this.ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.linearRampToValueAtTime(0, t + fadeOut);
    for (const s of this.srcs) {
      try {
        s.stop(t + fadeOut + 0.05);
      } catch {
        /* stopped */
      }
    }
    this.srcs = [];
  }

  setState(s: Partial<MusicState>): void {
    const chapterChanged = s.chapter !== undefined && s.chapter !== this.state.chapter;
    this.state = {
      intensity: Math.max(0, Math.min(1, s.intensity ?? this.state.intensity)),
      boss: s.boss ?? this.state.boss,
      chapter: Math.max(1, Math.min(3, Math.round(s.chapter ?? this.state.chapter))),
    };
    if (chapterChanged && this.out) this.retune(this.ctx.currentTime, 1.5);
  }

  /** One-off musical moments. */
  cue(c: MusicCue): void {
    const t = this.ctx.currentTime;
    switch (c) {
      case 'boss':
        this.play('mus_brass', { volume: 1 });
        this.state.boss = true;
        break;
      case 'gameover':
        this.bedOn = false;
        this.fadeBed(t, 0, 0.6);
        this.play('mus_gameover', { volume: 1, delay: 0.4 });
        break;
      case 'victory':
        this.bedOn = false;
        this.fadeBed(t, 0, 1.2);
        this.play('mus_victory', { volume: 1, delay: 1.2 });
        break;
      case 'chapter':
        this.play('mus_swell', { volume: 0.9 });
        break;
      case 'title':
        this.bedOn = true;
        this.state = { ...this.state, intensity: 0.05, boss: false };
        this.fadeBed(t, 1, 1.5);
        break;
      case 'play':
        this.bedOn = true;
        this.state.boss = false;
        this.fadeBed(t, 1, 0.8);
        break;
    }
  }

  private fadeBed(t: number, to: number, tau: number): void {
    if (!this.out) return;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(to, t, tau / 3);
  }

  private root(): number {
    const r = ROOTS[this.state.chapter - 1] ?? ROOTS[0];
    return semi(r, PROG[Math.floor(this.bar / 2) % PROG.length]);
  }

  private retune(t: number, glide = 0.4): void {
    const r = this.root();
    const ratios = [1, 1, 1.5, 1.5, 2, 2, 0.5];
    this.oscs.forEach((o, i) => o.frequency.setTargetAtTime(r * ratios[i], t, glide / 3));
    const base = ROOTS[this.state.chapter - 1] ?? ROOTS[0];
    [0, 1, 7].forEach((s, i) => this.tensionOscs[i]?.frequency.setTargetAtTime(semi(base * 8, s), t, glide / 3));
  }

  private applyLevel(now = false): void {
    if (!this.out) return;
    const t = this.ctx.currentTime;
    const L = this.level;
    const tau = now ? 0.01 : 0.6;
    this.droneLp.frequency.setTargetAtTime(220 + 1100 * L * L + (this.state.boss ? 300 : 0), t, tau);
    this.droneG.gain.setTargetAtTime(0.075 + 0.05 * L, t, tau);
    const tension = this.state.boss ? 0.035 : L > 0.78 ? (L - 0.78) * 0.12 : 0;
    this.tensionG.gain.setTargetAtTime(tension, t, tau);
  }

  /** Advance the scheduler: call every frame (or ~20 Hz). Schedules ~0.25 s ahead. */
  tick(dt = 1 / 60): void {
    if (!this.out) return;
    const target = this.state.boss ? Math.max(0.8, this.state.intensity) : this.state.intensity;
    // Rise quickly, fall slowly.
    const k = target > this.level ? 1 - Math.exp(-dt / 1.2) : 1 - Math.exp(-dt / 5);
    this.level += (target - this.level) * k;
    this.applyLevel();
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.nextStep < now - 0.5) this.nextStep = now + 0.05;
    const until = now + 0.25;
    while (this.nextStep < until) {
      this.schedule(this.nextStep);
      const bpm = 64 + 46 * this.level + (this.state.boss ? 10 : 0);
      this.nextStep += 60 / bpm / 4;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) {
        this.bar++;
        if (this.bar % 2 === 0) this.retune(this.nextStep, 0.6);
      }
    }
  }

  private schedule(at: number): void {
    this.stats.steps++;
    if (!this.bedOn) return;
    const delay = Math.max(0, at - this.ctx.currentTime);
    const L = this.level;
    const s = this.step;
    const hit = (name: string, volume: number, pitch = 1) => {
      if (volume <= 0.01) return;
      this.stats.hits++;
      this.play(name, { volume, pitch, delay });
    };
    // Heartbeat: every two beats when calm, every beat when tense.
    const beat = s % 4 === 0;
    const everyBeat = L > 0.3;
    if (beat && (everyBeat || s % 8 === 0) && L > 0.04) {
      const v = 0.3 + 0.7 * Math.min(1, L * 1.4);
      hit('mus_heart', v);
      const bpm = 64 + 46 * L;
      this.play('mus_heart2', { volume: v * 0.8, delay: delay + (60 / bpm) * 0.28 });
    }
    // Bass pulse.
    if (L > 0.3 && BASS_STEPS.has(s)) {
      const f = this.root();
      hit('mus_pluck', Math.min(1, (L - 0.3) / 0.4) * (s === 0 ? 1 : 0.75), f / 55);
    }
    // Taiko.
    if (L > 0.5 && (s === 0 || s === 8 || (L > 0.75 && (s === 14 || s === 11)))) {
      hit('mus_taiko', Math.min(1, (L - 0.5) / 0.35) * (s === 0 ? 1 : 0.7), s === 0 ? 1 : 1.12);
    }
    // Hats.
    if (L > 0.65 && (s % 2 === 0 || L > 0.86)) {
      hit('mus_hat', Math.min(1, (L - 0.65) / 0.25) * (s % 4 === 2 ? 1 : 0.55));
    }
  }
}
