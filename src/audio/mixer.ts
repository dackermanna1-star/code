// Mix graph:
//
//   one-shots ─► sfxIn ─► sfxGate ───────┬──────────────► preMix ─► compressor ─► softClip ─► output
//   loops ─────► loopIn ─► loopGate ─────┤                  ▲
//   Mochi ─────► voiceIn ─► voiceGate ───┤                  │
//   music ─────► musicIn(trim) ─► duck ──┘                  │
//        (sfxGate / voiceGate / duck also feed a small room reverb ─► return ─┘)
//
// Gates implement the sound switch (the music player fades its own notes); `duck` lowers the
// music under Mochi and big moments.

import { softClip, clamp } from './dsp';
import { MUSIC_TRIM } from './music';

export const REVERB_SEC = 1.25;
const SEND = { sfx: 0.11, voice: 0.13, music: 0.24 };
const REVERB_RETURN = 1;

/** Ramps an AudioParam from its current value without jumps (cancel-and-hold where available). */
export function holdAt(p: AudioParam, t: number): void {
  const anyP = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  try {
    if (typeof anyP.cancelAndHoldAtTime === 'function') {
      anyP.cancelAndHoldAtTime(t);
      return;
    }
  } catch {
    /* fall through */
  }
  const v = p.value;
  p.cancelScheduledValues(t);
  p.setValueAtTime(v, t);
}

/** Smoothly moves a param towards `v` (time constant `tc` seconds). */
export function glide(p: AudioParam, v: number, t: number, tc: number): void {
  holdAt(p, t);
  p.setTargetAtTime(v, t, Math.max(0.002, tc));
}

export class Mixer {
  readonly sfxIn: GainNode;
  readonly loopIn: GainNode;
  readonly voiceIn: GainNode;
  readonly musicIn: GainNode;
  readonly output: GainNode;
  private readonly sfxGate: GainNode;
  private readonly loopGate: GainNode;
  private readonly voiceGate: GainNode;
  private readonly musicDuck: GainNode;
  private readonly comp: DynamicsCompressorNode;
  private ducks: { amount: number; until: number }[] = [];
  private analyser: AnalyserNode | null = null;
  /** sum of the reverb sends; the convolver is attached later (its IR is rendered off-thread) */
  private readonly revIn: GainNode;
  private readonly revOut: GainNode;
  private conv: ConvolverNode | null = null;

  constructor(
    readonly ctx: BaseAudioContext,
    opts: { master?: number } = {},
  ) {
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    this.sfxIn = g();
    this.loopIn = g();
    this.voiceIn = g();
    this.musicIn = g(MUSIC_TRIM);
    this.sfxGate = g();
    this.loopGate = g();
    this.voiceGate = g();
    this.musicDuck = g();
    const preMix = g();

    // Gentle glue compression; the soft clipper after it only ever touches rare overs.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.comp = comp;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = 'none';
    this.output = g(clamp(opts.master ?? 1, 0, 1));

    this.sfxIn.connect(this.sfxGate).connect(preMix);
    this.loopIn.connect(this.loopGate).connect(preMix);
    this.voiceIn.connect(this.voiceGate).connect(preMix);
    this.musicIn.connect(this.musicDuck).connect(preMix);
    preMix.connect(comp).connect(clip).connect(this.output);

    this.revIn = g();
    this.revOut = g(REVERB_RETURN);
    this.revOut.connect(preMix);
    this.sfxGate.connect(g(SEND.sfx)).connect(this.revIn);
    this.voiceGate.connect(g(SEND.voice)).connect(this.revIn);
    this.musicDuck.connect(g(SEND.music)).connect(this.revIn);
  }

  /** Attaches the room reverb once its impulse response ([left..., right...]) is ready. */
  attachReverb(ir: Float32Array): void {
    if (this.conv || ir.length < 4) return;
    try {
      const n = ir.length >> 1;
      const buf = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
      buf.getChannelData(0).set(ir.subarray(0, n));
      buf.getChannelData(1).set(ir.subarray(n, 2 * n));
      const conv = this.ctx.createConvolver();
      conv.normalize = false;
      conv.buffer = buf;
      this.revIn.connect(conv).connect(this.revOut);
      this.conv = conv;
    } catch {
      /* no reverb: fine */
    }
  }

  get hasReverb(): boolean {
    return !!this.conv;
  }

  connectTo(dest: AudioNode): void {
    this.output.connect(dest);
  }

  private now(): number {
    return this.ctx.currentTime;
  }

  setSfxEnabled(on: boolean): void {
    const t = this.now();
    const v = on ? 1 : 0;
    glide(this.sfxGate.gain, v, t, 0.02);
    glide(this.loopGate.gain, v, t, 0.04);
    glide(this.voiceGate.gain, v, t, 0.02);
  }

  setMaster(v: number): void {
    glide(this.output.gain, clamp(v, 0, 1), this.now(), 0.03);
  }

  /** Lowers the music by `amount` (0..1) for `seconds`; overlapping ducks combine (deepest wins). */
  duck(amount: number, seconds: number): void {
    const now = this.now();
    const a = clamp(amount, 0, 1);
    if (a <= 0 || !(seconds > 0)) return;
    this.ducks = this.ducks.filter((d) => d.until > now);
    this.ducks.push({ amount: a, until: now + seconds });
    const level = (t: number) => 1 - this.ducks.reduce((m, d) => (d.until > t ? Math.max(m, d.amount) : m), 0);
    const p = this.musicDuck.gain;
    holdAt(p, now);
    p.setTargetAtTime(level(now), now, 0.05);
    const ends = [...new Set(this.ducks.map((d) => d.until))].sort((x, y) => x - y);
    for (const t of ends) p.setTargetAtTime(level(t + 1e-4), t, 0.3);
  }

  /** Debug: attaches a meter to the master output. */
  meter(): AnalyserNode {
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.output.connect(this.analyser);
    }
    return this.analyser;
  }

  /** Debug: current gain reduction of the master compressor (dB, ≤ 0). */
  get reduction(): number {
    const r = this.comp.reduction as unknown;
    return typeof r === 'number' ? r : 0;
  }
}

function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 4096;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = softClip(x, 0.85, 0.99);
  }
  return c;
}
