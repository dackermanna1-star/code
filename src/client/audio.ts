import type { SoundMat } from '../shared/world/blocks';

/**
 * Procedural audio (WebAudio, no sample files): footsteps per surface,
 * gathering hits, gunshots with distance delay/filtering, explosions,
 * doors, UI and ambience (wind, rain, birds by day, crickets at night).
 * Positional sounds use HRTF panners driven by the camera.
 */
export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private wind: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private rain: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private nextChirp = 0;
  private nextMusic = 10;
  volumes = { master: 0.8, sfx: 1, ambient: 0.6, music: 0.25 };

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.sfx = c.createGain();
    this.amb = c.createGain();
    this.music = c.createGain();
    for (const g of [this.sfx, this.amb, this.music]) g.connect(this.master);
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    // ambience loops
    const ws = c.createBufferSource();
    ws.buffer = this.noise;
    ws.loop = true;
    const wf = c.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 400;
    const wg = c.createGain();
    wg.gain.value = 0.08;
    ws.connect(wf).connect(wg).connect(this.amb);
    ws.start();
    this.wind = { src: ws, filter: wf, gain: wg };
    const rs = c.createBufferSource();
    rs.buffer = this.noise;
    rs.loop = true;
    const rf = c.createBiquadFilter();
    rf.type = 'highpass';
    rf.frequency.value = 1500;
    const rg = c.createGain();
    rg.gain.value = 0;
    rs.connect(rf).connect(rg).connect(this.amb);
    rs.start();
    this.rain = { src: rs, gain: rg };
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.amb.gain.value = this.volumes.ambient;
    this.music.gain.value = this.volumes.music;
  }

  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number) {
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
      l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      (l as unknown as { setPosition: (a: number, b: number, c: number) => void }).setPosition(x, y, z);
    }
  }

  private out(pos?: [number, number, number], refDist = 4): AudioNode {
    const c = this.ctx!;
    if (!pos) return this.sfx;
    const p = c.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDist;
    p.rolloffFactor = 1.2;
    p.maxDistance = 400;
    if (p.positionX) {
      p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2];
    }
    p.connect(this.sfx);
    return p;
  }

  private noiseHit(opts: { freq: number; q?: number; type?: BiquadFilterType; dur: number; gain: number; pos?: [number, number, number]; ref?: number; delay?: number; pitch?: number }) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (opts.delay ?? 0);
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = opts.pitch ?? 1;
    const f = c.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.value = opts.freq;
    f.Q.value = opts.q ?? 1;
    const g = c.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + opts.dur);
    s.connect(f).connect(g).connect(this.out(opts.pos, opts.ref));
    s.start(t, Math.random() * 1.5);
    s.stop(t + opts.dur + 0.05);
  }

  private tone(opts: { freq: number; to?: number; type?: OscillatorType; dur: number; gain: number; pos?: [number, number, number]; delay?: number; ref?: number }) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (opts.delay ?? 0);
    const o = c.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(opts.freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + opts.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(opts.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + opts.dur);
    o.connect(g).connect(this.out(opts.pos, opts.ref));
    o.start(t);
    o.stop(t + opts.dur + 0.05);
  }

  footstep(mat: SoundMat, pos?: [number, number, number], loud = 1) {
    const m: Record<string, [number, number, number]> = {
      grass: [900, 0.08, 0.25], dirt: [700, 0.07, 0.3], stone: [2200, 0.05, 0.3], wood: [500, 0.07, 0.4], sand: [1600, 0.1, 0.18],
      snow: [1200, 0.12, 0.22], gravel: [1800, 0.09, 0.3], metal: [3000, 0.08, 0.35], leaves: [2500, 0.1, 0.2], water: [800, 0.18, 0.25],
    };
    const [f, d, g] = m[mat] ?? m.dirt;
    this.noiseHit({ freq: f * (0.85 + Math.random() * 0.3), q: 0.8, dur: d, gain: g * loud, pos, ref: 2 });
    if (mat === 'wood' || mat === 'metal') this.tone({ freq: mat === 'metal' ? 420 : 140, dur: 0.06, gain: 0.08 * loud, pos });
  }

  hitBlock(mat: SoundMat, pos?: [number, number, number], breaking = false) {
    const f: Record<string, number> = { stone: 1800, wood: 600, metal: 2600, dirt: 500, grass: 600, sand: 900, gravel: 1200, snow: 1000, leaves: 2000, glass: 4000, plant: 1500, cloth: 800 };
    const freq = f[mat] ?? 900;
    this.noiseHit({ freq, q: 2, dur: breaking ? 0.25 : 0.1, gain: breaking ? 0.6 : 0.4, pos });
    if (mat === 'wood') this.tone({ freq: 180, to: 120, dur: 0.1, gain: 0.25, pos });
    if (mat === 'stone') this.tone({ freq: 900, dur: 0.05, gain: 0.08, type: 'square', pos });
    if (mat === 'metal') this.tone({ freq: 1400, to: 1200, dur: 0.25, gain: 0.12, type: 'triangle', pos });
    if (mat === 'glass' && breaking) for (let i = 0; i < 5; i++) this.tone({ freq: 2000 + Math.random() * 3000, dur: 0.15, gain: 0.05, delay: i * 0.02, pos });
  }

  /** Gunshot: delayed by distance (speed of sound), muffled when far. */
  gunshot(weapon: string, pos: [number, number, number] | undefined, dist: number) {
    const delay = dist / 343;
    const far = Math.min(1, dist / 150);
    const loud = weapon.includes('bow') ? 0.25 : 1;
    if (weapon.includes('bow') || weapon === 'crossbow') {
      this.tone({ freq: 220, to: 90, dur: 0.15, gain: 0.25, type: 'triangle', pos, delay });
      return;
    }
    this.noiseHit({ freq: 3000 * (1 - far * 0.8), type: 'lowpass', q: 0.5, dur: 0.25 + far * 0.4, gain: 0.9 * loud, pos, ref: 20, delay });
    this.tone({ freq: 120, to: 50, dur: 0.18, gain: 0.5 * loud * (1 - far * 0.5), pos, ref: 20, delay });
  }

  explosion(pos: [number, number, number], dist: number) {
    const delay = dist / 343;
    this.noiseHit({ freq: 400, type: 'lowpass', q: 0.3, dur: 1.8, gain: 1.4, pos, ref: 40, delay, pitch: 0.5 });
    this.tone({ freq: 70, to: 25, dur: 1.2, gain: 0.9, pos, ref: 40, delay });
  }

  door(open: boolean, pos?: [number, number, number]) {
    this.tone({ freq: open ? 180 : 220, to: open ? 260 : 120, dur: 0.35, gain: 0.12, type: 'sawtooth', pos });
    this.noiseHit({ freq: 300, dur: 0.12, gain: 0.25, pos, delay: 0.3 });
  }

  ui(kind: 'click' | 'craft' | 'pickup' | 'error' | 'hit' | 'kill' | 'hurt' | 'build' | 'eat') {
    switch (kind) {
      case 'click': return this.tone({ freq: 900, dur: 0.04, gain: 0.08, type: 'square' });
      case 'craft': this.tone({ freq: 660, dur: 0.1, gain: 0.1 }); return this.tone({ freq: 990, dur: 0.15, gain: 0.1, delay: 0.08 });
      case 'pickup': return this.tone({ freq: 500, to: 800, dur: 0.08, gain: 0.12 });
      case 'error': return this.tone({ freq: 160, dur: 0.15, gain: 0.12, type: 'square' });
      case 'hit': return this.tone({ freq: 1800, dur: 0.05, gain: 0.15, type: 'triangle' });
      case 'kill': this.tone({ freq: 1200, dur: 0.08, gain: 0.15 }); return this.tone({ freq: 1600, dur: 0.12, gain: 0.15, delay: 0.07 });
      case 'hurt': return this.noiseHit({ freq: 250, q: 3, dur: 0.18, gain: 0.5 });
      case 'build': return this.noiseHit({ freq: 500, q: 1, dur: 0.2, gain: 0.4 });
      case 'eat': for (let i = 0; i < 3; i++) this.noiseHit({ freq: 1500, q: 2, dur: 0.06, gain: 0.2, delay: i * 0.12 });
    }
  }

  generic(k: string, pos?: [number, number, number]) {
    switch (k) {
      case 'bite': return this.noiseHit({ freq: 400, q: 4, dur: 0.2, gain: 0.5, pos });
      case 'throw': return this.noiseHit({ freq: 1200, q: 1, dur: 0.15, gain: 0.2, pos });
      case 'reload': this.tone({ freq: 700, dur: 0.05, gain: 0.1, type: 'square', pos }); return this.tone({ freq: 500, dur: 0.05, gain: 0.1, type: 'square', pos, delay: 0.3 });
      case 'dryfire': return this.tone({ freq: 1800, dur: 0.03, gain: 0.1, type: 'square', pos });
      case 'treefall': this.noiseHit({ freq: 300, type: 'lowpass', dur: 1.0, gain: 0.6, pos }); return this.tone({ freq: 90, to: 40, dur: 0.6, gain: 0.4, pos, delay: 0.6 });
      case 'collapse': return this.noiseHit({ freq: 600, type: 'lowpass', dur: 0.8, gain: 0.7, pos, ref: 10 });
      case 'locked': return this.tone({ freq: 300, dur: 0.1, gain: 0.15, type: 'square', pos });
      case 'ignite': return this.noiseHit({ freq: 2000, type: 'highpass', dur: 0.5, gain: 0.2, pos });
      case 'drink': for (let i = 0; i < 3; i++) this.tone({ freq: 400 + i * 80, to: 300, dur: 0.08, gain: 0.08, delay: i * 0.15, pos }); return;
      case 'research': this.tone({ freq: 523, dur: 0.15, gain: 0.1, pos }); this.tone({ freq: 659, dur: 0.15, gain: 0.1, delay: 0.12, pos }); return this.tone({ freq: 784, dur: 0.3, gain: 0.1, delay: 0.24, pos });
      case 'dud': return this.noiseHit({ freq: 3000, type: 'highpass', dur: 0.6, gain: 0.15, pos });
    }
  }

  /** Ambience per frame: wind with altitude, rain, birdsong by day, crickets at night, sparse generative music. */
  updateAmbience(dt: number, altitude: number, daylight: number, rain: number, indoor: boolean) {
    const c = this.ctx;
    if (!c || !this.wind || !this.rain) return;
    const windAmt = (0.05 + Math.max(0, altitude - 60) * 0.004) * (indoor ? 0.3 : 1);
    this.wind.gain.gain.value += (windAmt - this.wind.gain.gain.value) * dt;
    this.wind.filter.frequency.value = 300 + Math.sin(c.currentTime * 0.3) * 120 + altitude;
    this.rain.gain.gain.value += ((rain > 0.3 ? (rain - 0.3) * 0.25 : 0) * (indoor ? 0.4 : 1) - this.rain.gain.gain.value) * dt;
    this.nextChirp -= dt;
    if (this.nextChirp <= 0 && !indoor) {
      this.nextChirp = 1 + Math.random() * 4;
      if (daylight > 0.5 && rain < 0.3) {
        const base = 2000 + Math.random() * 1500;
        for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) this.tone({ freq: base, to: base * (1.2 + Math.random() * 0.3), dur: 0.07, gain: 0.025, delay: i * 0.1 });
      } else if (daylight < 0.3) {
        for (let i = 0; i < 6; i++) this.tone({ freq: 4200, dur: 0.02, gain: 0.015, type: 'square', delay: i * 0.05 });
      }
    }
    this.nextMusic -= dt;
    if (this.nextMusic <= 0) {
      this.nextMusic = 50 + Math.random() * 70;
      this.pad(daylight > 0.4);
    }
  }

  /** A slow minor/major pad chord (low volume generative music). */
  private pad(day: boolean) {
    const c = this.ctx!;
    const root = day ? 220 : 196;
    const chord = day ? [1, 1.25, 1.5] : [1, 1.2, 1.5];
    const t = c.currentTime;
    for (const r of chord) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = root * r / 2;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 3);
      g.gain.linearRampToValueAtTime(0, t + 9);
      o.connect(g).connect(this.music);
      o.start(t);
      o.stop(t + 9.5);
    }
  }
}
