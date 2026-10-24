// Procedural sound: everything is synthesised with WebAudio (no samples).
// Positional sources use stereo panning, distance attenuation, air absorption (low-pass) and the speed
// of sound delay for distant explosions.

import { Mat } from '../world/materials';

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private noise!: AudioBuffer;
  private lx = 0; private ly = 0; private lz = 0;
  private rx = 1; private rz = 0; // listener right vector
  private fireGain: GainNode | null = null;
  private torchGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private recent = new Map<string, number>();
  volume = 0.8;
  enabled = true;

  /** Must be called from a user gesture. */
  start(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      this.ctx = new AC();
    } catch { this.enabled = false; return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    // noise buffer
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // loops: wind ambience, fire crackle, torch hiss
    this.windGain = this.loop(300, 0.6, 0.05, 'lowpass');
    this.fireGain = this.loop(1200, 0.8, 0, 'bandpass');
    this.torchGain = this.loop(3500, 1.2, 0, 'bandpass');
    // low industrial hum
    const hum = c.createOscillator(); hum.frequency.value = 50;
    const hg = c.createGain(); hg.gain.value = 0.012;
    hum.connect(hg).connect(this.master); hum.start();
  }

  private loop(freq: number, q: number, gain: number, type: BiquadFilterType): GainNode {
    const c = this.ctx!;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return g;
  }

  setListener(x: number, y: number, z: number, yaw: number): void {
    this.lx = x; this.ly = y; this.lz = z;
    this.rx = Math.cos(yaw); this.rz = -Math.sin(yaw);
  }

  setLoops(fire: number, torch: boolean, windHeight: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.fireGain!.gain.setTargetAtTime(Math.min(0.35, fire * 0.35), t, 0.2);
    this.torchGain!.gain.setTargetAtTime(torch ? 0.12 : 0, t, 0.05);
    this.windGain!.gain.setTargetAtTime(0.03 + Math.min(0.08, windHeight * 0.002), t, 1);
  }

  /** Spatial output chain for a source at (x,y,z): returns [input node, start time]. */
  private spatial(x: number, y: number, z: number, vol: number, delayed = false): [AudioNode, number] | null {
    const c = this.ctx!;
    const dx = x - this.lx, dy = y - this.ly, dz = z - this.lz;
    const d = Math.hypot(dx, dy, dz);
    const att = vol / (1 + d * d * 0.004 + d * 0.04);
    if (att < 0.003) return null;
    const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * this.rx + dz * this.rz) / d)) : 0;
    const g = c.createGain(); g.gain.value = att;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(400, 18000 / (1 + d * 0.03));
    const p = c.createStereoPanner(); p.pan.value = pan * 0.8;
    g.connect(lp).connect(p).connect(this.sfx);
    const t = c.currentTime + (delayed ? d / 343 : 0);
    return [g, t];
  }

  private noiseBurst(out: AudioNode, t: number, dur: number, f0: number, f1: number, type: BiquadFilterType, gain: number, q = 0.7, attack = 0.002): void {
    const c = this.ctx!;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  private tone(out: AudioNode, t: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine'): void {
    const c = this.ctx!;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }

  /** Rate limit per sound key. */
  private allow(key: string, interval: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    const l = this.recent.get(key) ?? -1;
    if (now - l < interval) return false;
    this.recent.set(key, now);
    return true;
  }

  explosion(x: number, y: number, z: number, power: number): void {
    if (!this.ctx) return;
    const s = this.spatial(x, y, z, Math.min(2.5, 0.9 + power * 0.25), true);
    if (!s) return;
    const [o, t] = s;
    const p = Math.min(1, power / 8);
    this.tone(o, t, 0.9 + p, 90, 28, 1.1);
    this.noiseBurst(o, t, 2.2 + p * 2.5, 1800, 120, 'lowpass', 1.0, 0.5, 0.004);
    this.noiseBurst(o, t, 0.25, 6000, 1500, 'bandpass', 0.6, 0.8);
    for (let i = 0; i < 6 + power; i++) this.noiseBurst(o, t + 0.1 + Math.random() * (1.2 + p), 0.06 + Math.random() * 0.1, 2500, 600, 'bandpass', 0.18, 1.5);
  }

  /** Breaking material (destroyed voxels). */
  breakMat(x: number, y: number, z: number, mat: Mat, count: number): void {
    if (!this.ctx || !this.allow('break' + mat, 0.05)) return;
    const vol = Math.min(1.2, 0.25 + Math.sqrt(count) * 0.05);
    const s = this.spatial(x, y, z, vol);
    if (!s) return;
    const [o, t] = s;
    switch (mat) {
      case Mat.Glass: case Mat.Light:
        this.noiseBurst(o, t, 0.4, 7000, 3000, 'highpass', 0.5, 0.7);
        for (let i = 0; i < Math.min(14, 3 + count / 8); i++) this.tone(o, t + Math.random() * 0.45, 0.15 + Math.random() * 0.3, 2500 + Math.random() * 4000, 2400 + Math.random() * 3500, 0.12);
        break;
      case Mat.Metal: case Mat.HeavyMetal: case Mat.Explosive:
        this.metal(o, t, 180 + Math.random() * 200, 0.5, 0.8);
        this.noiseBurst(o, t, 0.25, 4000, 900, 'bandpass', 0.35, 1.2);
        break;
      case Mat.Wood:
        this.noiseBurst(o, t, 0.18, 900, 250, 'bandpass', 0.7, 2);
        this.noiseBurst(o, t + 0.02, 0.35, 3000, 700, 'bandpass', 0.3, 3);
        break;
      case Mat.Dirt: case Mat.Grass: case Mat.Gravel: case Mat.Foliage:
        this.noiseBurst(o, t, 0.35, 900, 150, 'lowpass', 0.6, 0.6);
        break;
      default:
        this.noiseBurst(o, t, 0.3 + Math.min(0.6, count * 0.002), 2200, 300, 'bandpass', 0.8, 0.9);
        this.noiseBurst(o, t, 0.6, 500, 80, 'lowpass', 0.5, 0.7);
    }
  }

  private metal(o: AudioNode, t: number, f0: number, dur: number, gain: number): void {
    for (const [k, a] of [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.93, 0.2]]) this.tone(o, t, dur * (1.2 - k * 0.08), f0 * k, f0 * k * 0.98, gain * a * 0.4, 'sine');
  }

  /** Collision of debris / bodies. */
  impact(x: number, y: number, z: number, mat: Mat, energy: number): void {
    if (!this.ctx || energy < 30 || !this.allow('imp' + mat + ((x * 2) | 0), 0.06)) return;
    const vol = Math.min(1.1, Math.log10(energy) * 0.22);
    const s = this.spatial(x, y, z, vol);
    if (!s) return;
    const [o, t] = s;
    const heavy = energy > 20000;
    switch (mat) {
      case Mat.Metal: case Mat.HeavyMetal: case Mat.Explosive:
        this.metal(o, t, heavy ? 90 + Math.random() * 60 : 250 + Math.random() * 400, heavy ? 1.2 : 0.4, 0.9);
        break;
      case Mat.Wood:
        this.noiseBurst(o, t, 0.12, 700, 200, 'bandpass', 0.8, 2.5);
        this.tone(o, t, 0.1, 220 + Math.random() * 80, 120, 0.4);
        break;
      case Mat.Glass:
        this.tone(o, t, 0.25, 3000 + Math.random() * 2000, 2900, 0.25);
        break;
      default:
        this.noiseBurst(o, t, heavy ? 0.6 : 0.15, heavy ? 600 : 1600, 120, 'lowpass', heavy ? 1.0 : 0.5, 0.8);
        if (heavy) this.tone(o, t, 0.4, 70, 35, 0.8);
    }
  }

  crumble(x: number, y: number, z: number): void {
    if (!this.ctx || !this.allow('crumble', 0.12)) return;
    const s = this.spatial(x, y, z, 1.1);
    if (!s) return;
    const [o, t] = s;
    this.noiseBurst(o, t, 1.4, 400, 60, 'lowpass', 0.9, 0.6, 0.05);
    this.noiseBurst(o, t, 0.5, 2500, 500, 'bandpass', 0.4, 1);
    this.tone(o, t, 0.8, 55, 30, 0.6);
  }

  shot(kind: 'shotgun' | 'rifle' | 'rocket', x: number, y: number, z: number): void {
    if (!this.ctx) return;
    const s = this.spatial(x, y, z, 1.2);
    if (!s) return;
    const [o, t] = s;
    if (kind === 'shotgun') {
      this.noiseBurst(o, t, 0.45, 5000, 300, 'lowpass', 1.2, 0.6, 0.001);
      this.tone(o, t, 0.25, 140, 45, 1.0);
    } else if (kind === 'rifle') {
      this.noiseBurst(o, t, 0.3, 9000, 800, 'lowpass', 1.0, 0.6, 0.001);
      this.noiseBurst(o, t, 0.08, 4000, 2000, 'bandpass', 0.6, 1);
      this.tone(o, t, 0.15, 200, 60, 0.6);
    } else {
      this.noiseBurst(o, t, 1.2, 800, 2400, 'bandpass', 0.7, 0.8, 0.02);
      this.tone(o, t, 0.4, 90, 50, 0.5);
    }
  }

  ui(name: string, x = this.lx, y = this.ly, z = this.lz, vol = 0.5): void {
    if (!this.ctx) return;
    const s = this.spatial(x, y, z, vol);
    if (!s) return;
    const [o, t] = s;
    switch (name) {
      case 'beep': this.tone(o, t, 0.08, 1900, 1900, 0.25, 'square'); break;
      case 'switch': this.noiseBurst(o, t, 0.05, 3000, 2000, 'bandpass', 0.2, 2); break;
      case 'throw': this.noiseBurst(o, t, 0.25, 400, 1600, 'bandpass', 0.25, 1, 0.05); break;
      case 'swing': this.noiseBurst(o, t, 0.2, 500, 1500, 'bandpass', 0.2, 1.5, 0.06); break;
      case 'grab': this.tone(o, t, 0.08, 600, 800, 0.15); break;
      case 'deny': this.tone(o, t, 0.12, 200, 180, 0.2, 'square'); break;
      case 'empty': this.noiseBurst(o, t, 0.04, 4000, 3000, 'bandpass', 0.3, 3); break;
      case 'torch': if (this.allow('torchhit', 0.1)) this.noiseBurst(o, t, 0.12, 5000, 3000, 'bandpass', 0.1, 1); break;
      case 'step': this.noiseBurst(o, t, 0.08, 500 + Math.random() * 200, 150, 'lowpass', 0.18, 0.8); break;
      case 'land': this.noiseBurst(o, t, 0.18, 400, 80, 'lowpass', 0.5, 0.8); break;
      case 'thud': this.noiseBurst(o, t, 0.2, 900, 150, 'lowpass', 0.9, 0.9); this.tone(o, t, 0.15, 110, 50, 0.6); break;
      case 'clang': this.metal(o, t, 320 + Math.random() * 120, 0.9, 1); break;
      case 'wood': this.noiseBurst(o, t, 0.16, 800, 200, 'bandpass', 1, 2.5); this.tone(o, t, 0.1, 180, 100, 0.5); break;
      case 'glass': this.breakMat(x, y, z, Mat.Glass, 30); break;
      default:
        if (name.startsWith('impact_')) {
          const m = name.slice(7);
          if (m === 'metal') this.metal(o, t, 600 + Math.random() * 600, 0.25, 0.5);
          else if (m === 'glass') this.tone(o, t, 0.2, 3500, 3200, 0.2);
          else this.noiseBurst(o, t, 0.08, 2500, 600, 'bandpass', 0.4, 1.2);
        }
    }
  }
}
