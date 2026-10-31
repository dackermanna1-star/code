import { AudioSys } from './audio';

/**
 * Procedural adaptive score: dark drone pad + industrial taiko-style percussion.
 * Intensity (0..1) controls layers: drone always, pulse >0.15, drums >0.35, metal hits >0.6, boss layer.
 */
export class Music {
  intensity = 0;
  target = 0;
  boss = false;
  private nextTime = 0;
  private step = 0;
  private bpm = 96;
  private drone: { osc: OscillatorNode[]; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private started = false;
  private bar = 0;
  private root = 0; // semitone offset

  constructor(public audio: AudioSys) {}

  start() {
    const c = this.audio.ctx;
    if (!c || this.started) return;
    this.started = true;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    filter.Q.value = 3;
    const gain = c.createGain();
    gain.gain.value = 0.0;
    const osc: OscillatorNode[] = [];
    const freqs = [41.2, 41.5, 61.7, 82.4];
    for (const f of freqs) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(filter);
      o.start();
      osc.push(o);
    }
    filter.connect(gain);
    gain.connect(this.audio.music);
    this.drone = { osc, filter, gain };
    // slow LFO on filter
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain();
    lg.gain.value = 90;
    lfo.connect(lg);
    lg.connect(filter.frequency);
    lfo.start();
    this.nextTime = c.currentTime + 0.1;
  }

  update(dt: number) {
    const c = this.audio.ctx;
    if (!c || !this.started || c.state !== 'running') return;
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * 0.8);
    if (this.drone) {
      const t = c.currentTime;
      this.drone.gain.gain.setTargetAtTime(0.06 + this.intensity * 0.05, t, 0.5);
      this.drone.filter.Q.value = 3 + this.intensity * 4;
    }
    const spb = 60 / (this.bpm + this.intensity * 26 + (this.boss ? 12 : 0)) / 4; // 16th notes
    while (this.nextTime < c.currentTime + 0.12) {
      this.schedule(this.step, this.nextTime);
      this.nextTime += spb;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) {
        this.bar++;
        if (this.bar % 8 === 0) {
          this.root = [0, -2, 3, -4][(this.bar / 8) % 4];
          if (this.drone) {
            const base = [41.2, 41.5, 61.7, 82.4];
            this.drone.osc.forEach((o, i) => o.frequency.setTargetAtTime(base[i] * Math.pow(2, this.root / 12), c.currentTime, 1.5));
          }
        }
      }
    }
  }

  private schedule(s: number, t: number) {
    const I = this.intensity;
    // pulse (low tom) on beats
    if (I > 0.12 && s % 4 === 0) this.drum(t, 70, 0.45 * Math.min(1, I * 1.5), 0.35);
    // taiko pattern
    if (I > 0.35) {
      const pat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
      if (pat[s]) this.drum(t, 55 + (s % 3) * 8, 0.55 * I, 0.5);
    }
    // metallic hits
    if (I > 0.6 && (s === 6 || s === 14)) this.metal(t, 0.12 * I);
    // boss: fast ticking
    if (this.boss && s % 2 === 1) this.tick(t, 0.05);
    if (I > 0.8 && s % 2 === 0) this.tick(t, 0.03);
  }

  private drum(t: number, f: number, vol: number, dur: number) {
    const c = this.audio.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 2.2 * Math.pow(2, this.root / 24), t);
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t + dur * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.audio.music);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private metal(t: number, vol: number) {
    const c = this.audio.ctx!;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    g.connect(this.audio.music);
    for (const r of [1, 2.76, 5.4, 8.93]) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = 220 * r * Math.pow(2, this.root / 12);
      const og = c.createGain();
      og.gain.value = 0.25 / r;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + 0.65);
    }
  }
  private tick(t: number, vol: number) {
    const c = this.audio.ctx!;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 2400;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g);
    g.connect(this.audio.music);
    o.start(t);
    o.stop(t + 0.05);
  }
}
