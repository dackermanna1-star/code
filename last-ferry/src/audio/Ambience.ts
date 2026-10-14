// The pier at dusk, all synthesised: the sea washing under the planks, wind
// gusts, the burning town (a low roar and crackle off to the left), the
// ferry's idling engine throbbing on the right, plus scheduled one-shots —
// waves slapping the pilings, creaking wood, gulls (fewer as night falls),
// distant sirens, a bell buoy, the odd car alarm, scream or explosion in town.
import { loopSource, noiseBuffers } from './loops';

export type AmbientPlay = (name: string, o: { x?: number; volume?: number; pitch?: number; delay?: number }) => void;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Sched {
  name: string;
  next: number;
  /** Seconds between events at time of day 0 and 1. */
  gap: [number, number];
  gapNight: [number, number];
  x: [number, number];
  vol: [number, number];
  pitch?: [number, number];
  /** Chance an event is skipped at night (gulls sleep). */
  nightSkip?: number;
}

export class Ambience {
  private out: GainNode | null = null;
  private srcs: AudioScheduledSourceNode[] = [];
  private windG!: GainNode;
  private windBp!: BiquadFilterNode;
  private townG!: GainNode;
  private seaG!: GainNode;
  private nextGust = 0;
  private tod = 0;
  private scheds: Sched[] = [];
  /** Debug counters. */
  readonly stats = { oneShots: 0 };

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
    private readonly play: AmbientPlay,
  ) {}

  get running(): boolean {
    return this.out !== null;
  }

  start(fadeIn = 2): void {
    if (this.out) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const nb = noiseBuffers(ctx);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.setTargetAtTime(1, t, fadeIn / 3);
    out.connect(this.dest);
    this.out = out;
    const pan = (p: number, node: AudioNode) => {
      if (typeof ctx.createStereoPanner !== 'function') return node.connect(out);
      const sp = ctx.createStereoPanner();
      sp.pan.value = p;
      return node.connect(sp).connect(out);
    };

    // Sea wash: brown noise, slow swells.
    const sea = loopSource(ctx, nb.brown);
    const seaLp = ctx.createBiquadFilter();
    seaLp.type = 'lowpass';
    seaLp.frequency.value = 420;
    this.seaG = ctx.createGain();
    this.seaG.gain.value = 0.4;
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.09;
    const swell2 = ctx.createOscillator();
    swell2.frequency.value = 0.143;
    const sd = ctx.createGain();
    sd.gain.value = 0.14;
    swell.connect(sd);
    swell2.connect(sd);
    sd.connect(this.seaG.gain);
    sea.connect(seaLp).connect(this.seaG);
    this.seaG.connect(out);

    // Wind: pink noise through a moving band.
    const wind = loopSource(ctx, nb.pink);
    const whp = ctx.createBiquadFilter();
    whp.type = 'highpass';
    whp.frequency.value = 120;
    this.windBp = ctx.createBiquadFilter();
    this.windBp.type = 'bandpass';
    this.windBp.frequency.value = 500;
    this.windBp.Q.value = 0.8;
    this.windG = ctx.createGain();
    this.windG.gain.value = 0.15;
    wind.connect(whp).connect(this.windBp).connect(this.windG).connect(out);

    // The town burning on the left: low roar + distant crackle.
    const town = loopSource(ctx, nb.brown);
    const tlp = ctx.createBiquadFilter();
    tlp.type = 'lowpass';
    tlp.frequency.value = 170;
    const crk = loopSource(ctx, nb.pink);
    const cbp = ctx.createBiquadFilter();
    cbp.type = 'bandpass';
    cbp.frequency.value = 2800;
    cbp.Q.value = 0.7;
    const cg = ctx.createGain();
    cg.gain.value = 0.05;
    const cmod = ctx.createGain();
    cmod.gain.value = 0.5;
    const cl = ctx.createOscillator();
    cl.type = 'square';
    cl.frequency.value = 13.7;
    const cld = ctx.createGain();
    cld.gain.value = 0.5;
    cl.connect(cld).connect(cmod.gain);
    this.townG = ctx.createGain();
    this.townG.gain.value = 0.25;
    town.connect(tlp).connect(this.townG);
    crk.connect(cbp).connect(cmod).connect(cg).connect(this.townG);
    pan(-0.75, this.townG);

    // The ferry idling on the right: a low two-stroke throb.
    const f1 = ctx.createOscillator();
    f1.frequency.value = 41;
    const f2 = ctx.createOscillator();
    f2.frequency.value = 82.4;
    const f3 = ctx.createOscillator();
    f3.type = 'triangle';
    f3.frequency.value = 123;
    const fm = ctx.createGain();
    fm.gain.value = 0.6;
    const f2g = ctx.createGain();
    f2g.gain.value = 0.45;
    const f3g = ctx.createGain();
    f3g.gain.value = 0.12;
    f1.connect(fm);
    f2.connect(f2g).connect(fm);
    f3.connect(f3g).connect(fm);
    const trem = ctx.createOscillator();
    trem.frequency.value = 6.6;
    const tremD = ctx.createGain();
    tremD.gain.value = 0.35;
    const ferry = ctx.createGain();
    ferry.gain.value = 0.6;
    trem.connect(tremD).connect(ferry.gain);
    const flp = ctx.createBiquadFilter();
    flp.type = 'lowpass';
    flp.frequency.value = 220;
    const fg = ctx.createGain();
    fg.gain.value = 0.16;
    fm.connect(ferry).connect(flp).connect(fg);
    pan(0.85, fg);

    for (const s of [swell, swell2, cl, f1, f2, f3, trem]) s.start(t);
    this.srcs = [sea, wind, town, crk, swell, swell2, cl, f1, f2, f3, trem];

    this.nextGust = t;
    this.scheds = [
      { name: 'wave_slap', next: t + rnd(0.5, 2), gap: [1.4, 4], gapNight: [1.2, 3.5], x: [-24, 20], vol: [0.5, 1] },
      { name: 'creak', next: t + rnd(2, 6), gap: [4, 10], gapNight: [3, 8], x: [-15, 15], vol: [0.5, 1] },
      { name: 'gull', next: t + rnd(1, 4), gap: [3, 8], gapNight: [8, 20], x: [-24, 24], vol: [0.4, 1], pitch: [0.92, 1.1], nightSkip: 0.6 },
      { name: 'siren', next: t + rnd(8, 20), gap: [22, 45], gapNight: [16, 34], x: [-24, -14], vol: [0.6, 1], pitch: [0.95, 1.05] },
      { name: 'bell_buoy', next: t + rnd(6, 14), gap: [18, 34], gapNight: [16, 30], x: [-20, -8], vol: [0.7, 1] },
      { name: 'car_alarm', next: t + rnd(40, 80), gap: [70, 140], gapNight: [60, 120], x: [-24, -18], vol: [0.6, 1] },
      { name: 'distant_scream', next: t + rnd(20, 40), gap: [28, 60], gapNight: [20, 45], x: [-24, -16], vol: [0.6, 1], pitch: [0.9, 1.15] },
      { name: 'town_boom', next: t + rnd(25, 50), gap: [35, 80], gapNight: [30, 70], x: [-24, -16], vol: [0.5, 1] },
    ];
    this.tick();
  }

  stop(fadeOut = 1.2): void {
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

  /** 0 (sunset) … 1 (deep night): more wind and town, fewer gulls. */
  setTimeOfDay(t: number): void {
    this.tod = Math.max(0, Math.min(1, t));
    if (!this.out) return;
    const now = this.ctx.currentTime;
    this.townG.gain.setTargetAtTime(0.2 + 0.25 * this.tod, now, 2);
  }

  /** Schedule gusts and one-shots up to ~1 s ahead (call every frame or so). */
  tick(): void {
    if (!this.out) return;
    const now = this.ctx.currentTime;
    const until = now + 1;
    const night = this.tod;
    while (this.nextGust < until) {
      const t = Math.max(this.nextGust, now);
      const g = rnd(0.2, 1) * (0.7 + 0.5 * night);
      const tau = rnd(0.8, 2);
      this.windG.gain.setTargetAtTime(0.06 + 0.22 * g, t, tau);
      this.windBp.frequency.setTargetAtTime(280 + 700 * g, t, tau);
      this.nextGust = t + rnd(2.5, 7);
    }
    for (const s of this.scheds) {
      while (s.next < until) {
        const t = Math.max(s.next, now);
        const gap = night > 0.5 ? s.gapNight : s.gap;
        s.next = t + rnd(gap[0], gap[1]);
        if (s.nightSkip && Math.random() < s.nightSkip * night) continue;
        this.play(s.name, {
          x: rnd(s.x[0], s.x[1]),
          volume: rnd(s.vol[0], s.vol[1]),
          pitch: s.pitch ? rnd(s.pitch[0], s.pitch[1]) : undefined,
          delay: t - now,
        });
        this.stats.oneShots++;
      }
    }
  }
}
