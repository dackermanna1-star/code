// Synthesised arctic ambience (no files): soft filtered-noise wind with slow
// gusts and a faint whistle, plus irregular water lapping against the floe.
// The original shipped no music; this sits well under the gunfire.

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

const noiseCache = new WeakMap<BaseAudioContext, { pink: AudioBuffer; brown: AudioBuffer }>();

/** Looping noise buffers, generated once per context. */
function noiseBuffers(ctx: BaseAudioContext): { pink: AudioBuffer; brown: AudioBuffer } {
  const hit = noiseCache.get(ctx);
  if (hit) return hit;
  const len = Math.floor(ctx.sampleRate * 6);
  // Stereo pink noise (Paul Kellet's filter), decorrelated channels for width.
  const pink = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = pink.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  // Mono brown noise for the water.
  const brown = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  // Crossfade the loop seam so the buffers loop without a click.
  const fade = Math.floor(ctx.sampleRate * 0.05);
  for (const buf of [pink, brown]) {
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        ch[i] = ch[i] * k + ch[len - fade + i] * (1 - k);
      }
    }
  }
  const out = { pink, brown };
  noiseCache.set(ctx, out);
  return out;
}

export class Ambience {
  private out: GainNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private windGain!: GainNode;
  private windLP!: BiquadFilterNode;
  private whistleBP!: BiquadFilterNode;
  private whistleGain!: GainNode;
  private waterGain!: GainNode;
  private waterLP!: BiquadFilterNode;
  private waterPan: StereoPannerNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextGust = 0;
  private nextLap = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
  ) {}

  get running(): boolean {
    return this.out !== null;
  }

  start(fadeIn = 2.5): void {
    if (this.out) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const { pink, brown } = noiseBuffers(ctx);

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.setTargetAtTime(1, now, fadeIn / 3);
    out.connect(this.dest);
    this.out = out;

    // Wind: pink noise → highpass → lowpass (swept by gusts) → gain.
    const wind = this.loop(pink, rnd(0, pink.duration));
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 70;
    this.windLP = ctx.createBiquadFilter();
    this.windLP.type = 'lowpass';
    this.windLP.frequency.value = 450;
    this.windLP.Q.value = 0.4;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.5;
    wind.connect(hp).connect(this.windLP).connect(this.windGain).connect(out);

    // Faint whistle: resonant band of the same wind.
    this.whistleBP = ctx.createBiquadFilter();
    this.whistleBP.type = 'bandpass';
    this.whistleBP.frequency.value = 700;
    this.whistleBP.Q.value = 7;
    this.whistleGain = ctx.createGain();
    this.whistleGain.gain.value = 0.12;
    hp.connect(this.whistleBP).connect(this.whistleGain).connect(out);

    // Water lapping: brown noise → lowpass → enveloped gain → pan.
    const water = this.loop(brown, rnd(0, brown.duration));
    this.waterLP = ctx.createBiquadFilter();
    this.waterLP.type = 'lowpass';
    this.waterLP.frequency.value = 260;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0;
    water.connect(this.waterLP).connect(this.waterGain);
    if (typeof ctx.createStereoPanner === 'function') {
      this.waterPan = ctx.createStereoPanner();
      this.waterGain.connect(this.waterPan).connect(out);
    } else {
      this.waterGain.connect(out);
    }

    this.nextGust = now;
    this.nextLap = now + rnd(0.5, 1.5);
    this.schedule(now + 1);
    this.timer = setInterval(() => this.schedule(this.ctx.currentTime + 1), 250);
  }

  stop(fadeOut = 1.2): void {
    const out = this.out;
    if (!out) return;
    this.out = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(out.gain.value, now);
    out.gain.linearRampToValueAtTime(0, now + fadeOut);
    for (const s of this.sources) {
      try {
        s.stop(now + fadeOut + 0.05);
      } catch {
        /* already stopped */
      }
    }
    const srcs = this.sources;
    this.sources = [];
    srcs[0]?.addEventListener('ended', () => out.disconnect());
  }

  /** Queue gusts and laps up to context time `until` (public for offline rendering tests). */
  schedule(until: number): void {
    if (!this.out) return;
    const now = this.ctx.currentTime;
    while (this.nextGust < until) {
      const t = Math.max(this.nextGust, now);
      const g = rnd(0.25, 1);
      const tau = rnd(0.7, 1.8);
      this.windGain.gain.setTargetAtTime(0.32 + 0.68 * g, t, tau);
      this.windLP.frequency.setTargetAtTime(260 + 820 * g, t, tau);
      this.whistleBP.frequency.setTargetAtTime(480 + 650 * g + rnd(-80, 80), t, tau * 1.3);
      this.whistleGain.gain.setTargetAtTime(0.03 + 0.2 * g * g, t, tau);
      this.nextGust = t + rnd(2.2, 6.5);
    }
    while (this.nextLap < until) {
      const t = Math.max(this.nextLap, now + 0.02);
      this.lap(t, rnd(0.45, 1));
      // Sometimes a smaller follow-up wave.
      if (Math.random() < 0.35) this.lap(t + rnd(0.35, 0.6), rnd(0.25, 0.5));
      this.nextLap = t + rnd(1.4, 3.8);
    }
  }

  private lap(t: number, size: number): void {
    const peak = 0.55 * size;
    this.waterGain.gain.setTargetAtTime(peak, t, rnd(0.08, 0.16));
    this.waterGain.gain.setTargetAtTime(0, t + rnd(0.25, 0.45), rnd(0.25, 0.45));
    this.waterLP.frequency.setTargetAtTime(380 + 420 * size, t, 0.08);
    this.waterLP.frequency.setTargetAtTime(200, t + 0.3, 0.35);
    this.waterPan?.pan.setValueAtTime(rnd(-0.6, 0.6), t);
  }

  private loop(buf: AudioBuffer, offset: number): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start(this.ctx.currentTime, offset);
    this.sources.push(s);
    return s;
  }
}
