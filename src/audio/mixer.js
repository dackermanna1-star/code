// Master signal chain:
//   sfx, loops, ambience, reverb return -> bus -> duck -> muffle -> slow-mo LP
//   -> glue compressor -> trim -> limiter (radio joins here) -> soft clip -> master
// The convolver is fed by a mono send bus. A very close blast briefly ducks and
// muffles everything (the ear's protective reflex) and adds a faint ringing.
import { Rng, clamp } from './dsp.js';

// Compensates DynamicsCompressorNode's automatic make-up gain so quiet material
// passes at roughly unity and only peaks are pulled down.
const TRIM = 0.585;

function softClipCurve() {
  // The shaper sees half the signal level, so its [-1, 1] input covers [-2, 2].
  const n = 4096;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = ((i / (n - 1)) * 2 - 1) * 2;
    const a = Math.abs(u);
    const y = a <= 0.9 ? a : 0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1);
    curve[i] = Math.sign(u) * y;
  }
  return curve;
}

export class Mixer {
  constructor(ctx, impulse) {
    this.ctx = ctx;
    const gain = (value = 1, extra = {}) => new GainNode(ctx, { gain: value, ...extra });
    this.sfx = gain();
    this.loops = gain();
    this.amb = gain();
    this.radio = gain(0.9);
    this.reverbIn = gain(1, { channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
    this.convolver = new ConvolverNode(ctx, { disableNormalization: true });
    this.convolver.buffer = impulse;
    this.reverbOut = gain(0.85);
    this.bus = gain();
    this.duckGain = gain();
    this.muffle = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 20000, Q: -3 });
    this.slow = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 20000, Q: -3 });
    this.comp = new DynamicsCompressorNode(ctx, { threshold: -12, knee: 8, ratio: 2.5, attack: 0.005, release: 0.25 });
    this.limiter = new DynamicsCompressorNode(ctx, { threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.12 });
    this.trim = gain(TRIM);
    this.clipIn = gain(0.5);
    this.shaper = new WaveShaperNode(ctx, { curve: softClipCurve(), oversample: 'none' });
    this.master = gain(1);

    this.sfx.connect(this.bus);
    this.loops.connect(this.bus);
    this.amb.connect(this.bus);
    this.reverbIn.connect(this.convolver).connect(this.reverbOut).connect(this.bus);
    this.bus.connect(this.duckGain).connect(this.muffle).connect(this.slow).connect(this.comp);
    this.comp.connect(this.trim).connect(this.limiter);
    this.radio.connect(this.limiter);
    this.limiter.connect(this.clipIn).connect(this.shaper).connect(this.master);
    this.master.connect(ctx.destination);
    // Tinnitus is "in the head": after the dynamics, before the safety clipper.
    this.post = this.clipIn;

    this.volume = 1;
    this.muted = false;
    this.duckUntil = 0;
    this.duckDepth = 0;
    this.ringUntil = 0;
    this.ringLevel = 0;
    this.rng = new Rng(0x41e5);
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    this.applyMaster();
  }

  setMuted(m) {
    this.muted = !!m;
    this.applyMaster();
  }

  applyMaster() {
    const target = this.muted ? 0 : this.volume;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  // Slow motion: a gentle lowpass for a cinematic, "underwater" time feel.
  setTimeScale(s) {
    const k = clamp(s, 0, 1);
    const f = 3000 + 17000 * k * k;
    this.slow.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.15);
  }

  // Protective-reflex duck at `when` (context time); depth 0..1 from proximity.
  duck(depth, when) {
    if (depth < 0.03) return;
    const now = this.ctx.currentTime;
    const t = Math.max(when, now);
    if (t < this.duckUntil && depth <= this.duckDepth) return;
    const g = this.duckGain.gain;
    const f = this.muffle.frequency;
    const floor = 1 - 0.8 * depth;
    const hold = 0.15 + 0.5 * depth;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(floor, t + 0.03, 0.02);
    g.setTargetAtTime(1, t + hold, 0.3 + 0.4 * depth);
    f.cancelScheduledValues(t);
    f.setTargetAtTime(700 + 9000 * (1 - depth) * (1 - depth), t + 0.03, 0.03);
    f.setTargetAtTime(20000, t + hold + 0.1, 0.45 + 0.4 * depth);
    this.duckUntil = t + hold + 1.2;
    this.duckDepth = depth;
    if (depth > 0.25) this.ring(depth, t + 0.06);
  }

  // Faint high-pitched ear ringing for 1-2 s, two close tones beating.
  ring(level, when) {
    if (when < this.ringUntil && level <= this.ringLevel) return;
    const ctx = this.ctx;
    const f = 3600 + this.rng.next() * 900;
    const g = new GainNode(ctx, { gain: 0 });
    const peak = 0.036 * clamp(level, 0, 1);
    const len = 1 + level;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.12);
    g.gain.setTargetAtTime(0, when + 0.25, len / 4);
    g.connect(this.post);
    for (const freq of [f, f + 6.5]) {
      const o = new OscillatorNode(ctx, { frequency: freq });
      o.connect(g);
      o.start(when);
      o.stop(when + len + 0.8);
      o.onended = () => g.disconnect();
    }
    this.ringUntil = when + len;
    this.ringLevel = level;
  }

  dispose() {
    try {
      this.master.disconnect();
    } catch {
      // already disconnected
    }
  }
}
