// Live, continuously-modulated sound graphs (Web Audio nodes, not baked):
// the outboard engine, the fire bed and the gas hiss. Each owns a small
// subgraph that ends in a StereoPanner connected to a bus.
import { Rng, brown, pink } from './dsp';

const noiseCache = new WeakMap<BaseAudioContext, { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer }>();

/** Looping 4 s noise buffers (white, pink, brown), generated once per context. */
export function noiseBuffers(ctx: BaseAudioContext): { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer } {
  const hit = noiseCache.get(ctx);
  if (hit) return hit;
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * 4);
  const rng = new Rng(0x5eed);
  const make = (gen: (n: number) => Float32Array, stereo: boolean) => {
    const b = ctx.createBuffer(stereo ? 2 : 1, n, sr);
    for (let c = 0; c < b.numberOfChannels; c++) {
      const d = gen(n);
      // Crossfade the loop seam.
      const f = Math.floor(sr * 0.05);
      for (let i = 0; i < f; i++) {
        const k = i / f;
        d[i] = d[i] * k + d[n - f + i] * (1 - k);
      }
      b.copyToChannel(d as Float32Array<ArrayBuffer>, c);
    }
    return b;
  };
  const out = {
    white: make((m) => {
      const d = new Float32Array(m);
      for (let i = 0; i < m; i++) d[i] = rng.bi() * 0.5;
      return d;
    }, true),
    pink: make((m) => pink(m, rng), true),
    brown: make((m) => brown(m, rng), true),
  };
  noiseCache.set(ctx, out);
  return out;
}

export function loopSource(ctx: BaseAudioContext, b: AudioBuffer, rng = Math.random): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.loop = true;
  s.start(ctx.currentTime, rng() * b.duration);
  return s;
}

function panner(ctx: BaseAudioContext): StereoPannerNode | null {
  return typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
}

export const panOf = (x: number) => Math.max(-1, Math.min(1, x / 25)) * 0.85;

const tanhCurve = (k: number) => {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * k) / Math.tanh(k);
  }
  return c;
};

// ------------------------------------------------------------------ engine

export type EngineState = 'off' | 'pull' | 'idle' | 'run' | 'stop';

/**
 * The "Outboard": a two-stroke putter that revs with the minigun's spin.
 * Saw + square at the firing frequency through a saturator and a resonant
 * lowpass, a rattle (noise amplitude-modulated at the firing rate) and a
 * "brrrt" layer that follows the trigger while bullets fly.
 */
export class OutboardEngine {
  state: EngineState = 'off';
  private built = false;
  private readonly out: GainNode;
  private readonly pan: StereoPannerNode | null;
  private osc1!: OscillatorNode;
  private osc2!: OscillatorNode;
  private am!: OscillatorNode;
  private buzzLfo!: OscillatorNode;
  private lp!: BiquadFilterNode;
  private body!: GainNode;
  private rattle!: GainNode;
  private buzz!: GainNode;
  private srcs: AudioScheduledSourceNode[] = [];
  private spin = 0;
  private fireUntil = 0;
  private pullAt = -1;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    dest: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.pan = panner(ctx);
    if (this.pan) this.out.connect(this.pan).connect(dest);
    else this.out.connect(dest);
  }

  private build(): void {
    if (this.built) return;
    this.built = true;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const nb = noiseBuffers(ctx);
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.55;
    const mix = ctx.createGain();
    mix.gain.value = 0.6;
    const shaper = ctx.createWaveShaper();
    shaper.curve = tanhCurve(3);
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 3.5;
    this.lp.frequency.value = 320;
    this.body = ctx.createGain();
    this.body.gain.value = 0.8;
    this.osc1.connect(mix);
    this.osc2.connect(g2).connect(mix);
    mix.connect(shaper).connect(this.lp).connect(this.body).connect(this.out);

    // Rattle: band of noise, amplitude-modulated at the firing frequency.
    const rn = loopSource(ctx, nb.white);
    const rbp = ctx.createBiquadFilter();
    rbp.type = 'bandpass';
    rbp.frequency.value = 1700;
    rbp.Q.value = 1.1;
    const ramp = ctx.createGain();
    ramp.gain.value = 0.5;
    this.am = ctx.createOscillator();
    this.am.type = 'square';
    const amDepth = ctx.createGain();
    amDepth.gain.value = 0.5;
    this.am.connect(amDepth).connect(ramp.gain);
    this.rattle = ctx.createGain();
    this.rattle.gain.value = 0.25;
    rn.connect(rbp).connect(ramp).connect(this.rattle).connect(this.out);

    // Brrrt: the minigun's stream of shots as one modulated noise band.
    const bn = loopSource(ctx, nb.white);
    const bbp = ctx.createBiquadFilter();
    bbp.type = 'bandpass';
    bbp.frequency.value = 2300;
    bbp.Q.value = 0.6;
    const bam = ctx.createGain();
    bam.gain.value = 0.5;
    this.buzzLfo = ctx.createOscillator();
    this.buzzLfo.type = 'square';
    this.buzzLfo.frequency.value = 22;
    const bDepth = ctx.createGain();
    bDepth.gain.value = 0.5;
    this.buzzLfo.connect(bDepth).connect(bam.gain);
    const thumpLp = ctx.createBiquadFilter();
    thumpLp.type = 'lowpass';
    thumpLp.frequency.value = 4000;
    this.buzz = ctx.createGain();
    this.buzz.gain.value = 0;
    bn.connect(bbp).connect(bam).connect(thumpLp).connect(this.buzz).connect(this.out);

    this.setFreq(22, t);
    for (const s of [this.osc1, this.osc2, this.am, this.buzzLfo]) s.start(t);
    this.srcs = [this.osc1, this.osc2, this.am, this.buzzLfo, rn, bn];
  }

  private setFreq(f: number, t: number, tau = 0.06): void {
    this.osc1.frequency.setTargetAtTime(f, t, tau);
    this.osc2.frequency.setTargetAtTime(f / 2, t, tau);
    this.am.frequency.setTargetAtTime(f, t, tau);
  }

  /** Engine event from the logic ('pull' | 'idle' | 'run' | 'stop'). */
  setState(s: EngineState): void {
    const t = this.ctx.currentTime;
    if (s === this.state) return;
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.state = s;
    if (s === 'off') {
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setTargetAtTime(0, t, 0.05);
      return;
    }
    this.build();
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    switch (s) {
      case 'pull':
        // The pull-start one-shot plays the rip and coughs; the engine fades in as it catches.
        this.pullAt = t;
        g.setValueAtTime(g.value, t);
        g.setTargetAtTime(0.0, t, 0.02);
        g.setTargetAtTime(0.16, t + 0.85, 0.12);
        this.setFreq(14, t, 0.01);
        this.setFreq(24, t + 0.85, 0.2);
        break;
      case 'idle':
        g.setTargetAtTime(0.16, t, 0.08);
        break;
      case 'run':
        g.setTargetAtTime(0.26, t, 0.05);
        break;
      case 'stop':
        g.setTargetAtTime(0, t + 0.05, 0.18);
        this.setFreq(9, t, 0.35);
        this.stopTimer = setTimeout(() => {
          if (this.state === 'stop') this.state = 'off';
        }, 1500);
        break;
    }
  }

  /** Per-frame: spin 0..1 (RPM), world x of the hunter. */
  update(spin: number, x: number): void {
    if (!this.built || this.state === 'off') return;
    const t = this.ctx.currentTime;
    this.spin = spin;
    if (this.pan) this.pan.pan.setTargetAtTime(panOf(x), t, 0.05);
    // The logic may never send 'idle' after a pull-start (trigger released before full spin).
    if (this.state === 'pull' && t - this.pullAt > 0.9) this.state = 'idle';
    if (this.state === 'stop' || this.state === 'pull') return;
    const s = Math.max(0, Math.min(1, spin));
    this.setFreq(24 + 78 * s, t, 0.05);
    this.lp.frequency.setTargetAtTime(320 + 2300 * s, t, 0.05);
    this.rattle.gain.setTargetAtTime(0.18 + 0.3 * s, t, 0.05);
    const firing = t < this.fireUntil;
    this.buzz.gain.setTargetAtTime(firing ? 0.4 : 0, t, firing ? 0.01 : 0.05);
  }

  /** A minigun round left the barrel: keeps the brrrt layer open briefly. */
  shot(): void {
    if (!this.built) return;
    const t = this.ctx.currentTime;
    this.fireUntil = t + 0.09;
    this.buzz.gain.setTargetAtTime(0.4, t, 0.008);
  }

  get spinning(): number {
    return this.spin;
  }

  dispose(): void {
    for (const s of this.srcs) {
      try {
        s.stop();
      } catch {
        /* stopped */
      }
    }
    this.srcs = [];
    this.built = false;
    this.state = 'off';
  }
}

// -------------------------------------------------------------------- fire

/** Bed of fire: a hissing band and a low roar, scaled by how much is burning. */
export class FireBed {
  private built = false;
  private hiss!: GainNode;
  private roar!: GainNode;
  private readonly pan: StereoPannerNode | null;
  private readonly out: GainNode;
  level = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    dest: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.pan = panner(ctx);
    if (this.pan) this.out.connect(this.pan).connect(dest);
    else this.out.connect(dest);
  }

  private build(): void {
    if (this.built) return;
    this.built = true;
    const ctx = this.ctx;
    const nb = noiseBuffers(ctx);
    const a = loopSource(ctx, nb.pink);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 0.5;
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    a.connect(bp).connect(this.hiss).connect(this.out);
    const b = loopSource(ctx, nb.brown);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    this.roar = ctx.createGain();
    this.roar.gain.value = 0;
    b.connect(lp).connect(this.roar).connect(this.out);
  }

  /** `count` burning things (zombies, bodies, fire patches) around world x. */
  set(count: number, x: number): void {
    if (count <= 0 && !this.built) return;
    this.build();
    const t = this.ctx.currentTime;
    const s = Math.sqrt(Math.max(0, count));
    this.level = count;
    this.hiss.gain.setTargetAtTime(Math.min(0.35, 0.09 * s), t, 0.3);
    this.roar.gain.setTargetAtTime(Math.min(0.45, 0.1 * s), t, 0.4);
    if (this.pan) this.pan.pan.setTargetAtTime(panOf(x) * 0.8, t, 0.3);
  }
}

// --------------------------------------------------------------------- gas

/** Gas hiss with a slow wobble, scaled by the number of clouds. */
export class GasHiss {
  private built = false;
  private g!: GainNode;
  private readonly pan: StereoPannerNode | null;
  private readonly out: GainNode;

  constructor(
    private readonly ctx: BaseAudioContext,
    dest: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.pan = panner(ctx);
    if (this.pan) this.out.connect(this.pan).connect(dest);
    else this.out.connect(dest);
  }

  private build(): void {
    if (this.built) return;
    this.built = true;
    const ctx = this.ctx;
    const n = loopSource(ctx, noiseBuffers(ctx).white);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4800;
    bp.Q.value = 0.6;
    const wob = ctx.createGain();
    wob.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.7;
    const depth = ctx.createGain();
    depth.gain.value = 0.3;
    lfo.connect(depth).connect(wob.gain);
    lfo.start();
    this.g = ctx.createGain();
    this.g.gain.value = 0;
    n.connect(hp).connect(bp).connect(wob).connect(this.g).connect(this.out);
  }

  set(count: number, x: number): void {
    if (count <= 0 && !this.built) return;
    this.build();
    const t = this.ctx.currentTime;
    this.g.gain.setTargetAtTime(Math.min(0.35, 0.16 * Math.sqrt(Math.max(0, count))), t, 0.25);
    if (this.pan) this.pan.pan.setTargetAtTime(panOf(x), t, 0.3);
  }
}
