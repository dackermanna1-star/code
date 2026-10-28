/**
 * Procedural audio (WebAudio, no sample assets).
 *
 * Physical rules:
 *  - sound needs a medium: in vacuum only structure-borne sound reaches you
 *    (engine vibration through the hull, your own footsteps through your body),
 *    unless "cinematic audio" is enabled;
 *  - in thin air sounds are quieter and muffled (intensity ∝ pressure·c·…,
 *    and high frequencies are absorbed quickly), so Mars sounds dull and quiet;
 *  - wind noise scales with air density × relative airspeed².
 */
export type Surface = 'rock' | 'sand' | 'snow' | 'ice' | 'liquid' | 'vegetation';

export interface AudioState {
  /** ambient pressure at the listener (bar) */
  pressure: number;
  /** air speed relative to the listener (m/s) */
  airSpeed: number;
  /** ambient planetary wind (m/s) at the surface */
  wind: number;
  /** listener is inside a spacecraft (cockpit view) */
  inCabin: boolean;
  /** listener is in or attached to a spacecraft (any view) */
  inShip: boolean;
  engineLevel: number;
  rcs: number;
  /** aerodynamic heating (W/m²) for the re-entry roar */
  heating: number;
  /** storm activity nearby (0..1), for thunder */
  storm: number;
  /** liquid surface close to the listener (0..1) */
  liquidNear: number;
  /** animals near the listener (0..1) */
  fauna: number;
  /** warp / hyperspace active (speculative) */
  ftl: number;
}

const SILENT: AudioState = { pressure: 0, airSpeed: 0, wind: 0, inCabin: false, inShip: false, engineLevel: 0, rcs: 0, heating: 0, storm: 0, liquidNear: 0, fauna: 0, ftl: 0 };

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambBus!: GainNode;
  private fxBus!: GainNode;
  private noise!: AudioBuffer;
  private brown!: AudioBuffer;
  // continuous layers
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private gustFilter!: BiquadFilterNode;
  private gustGain!: GainNode;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private engineOsc!: OscillatorNode;
  private engineOsc2!: OscillatorNode;
  private rcsGain!: GainNode;
  private roarGain!: GainNode;
  private roarFilter!: BiquadFilterNode;
  private humGain!: GainNode;
  private waveGain!: GainNode;
  private waveFilter!: BiquadFilterNode;
  private ftlGain!: GainNode;
  private ftlOsc!: OscillatorNode;
  /** muffling of external sound by the medium (and by the hull when inside) */
  private extFilter!: BiquadFilterNode;
  private extGain!: GainNode;
  volumes = { master: 0.7, ambience: 0.8, effects: 0.8 };
  cinematic = false;
  private state: AudioState = SILENT;
  private t = 0;
  private nextThunder = 5;
  private nextCall = 3;
  enabled = true;

  /** Create the context on a user gesture (browser autoplay policy). */
  init() {
    if (this.ctx || !this.enabled) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.ambBus = ctx.createGain();
    this.fxBus = ctx.createGain();
    // external sound path: medium absorption → level
    this.extFilter = ctx.createBiquadFilter();
    this.extFilter.type = 'lowpass';
    this.extGain = ctx.createGain();
    this.extFilter.connect(this.extGain);
    this.extGain.connect(this.master);
    this.ambBus.connect(this.extFilter);
    this.fxBus.connect(this.master);
    this.noise = this.makeNoise(2, false);
    this.brown = this.makeNoise(4, true);

    // wind: broadband rush + whistling gusts
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.loop(this.brown, this.windFilter);
    this.windFilter.connect(this.windGain).connect(this.ambBus);
    this.gustFilter = ctx.createBiquadFilter();
    this.gustFilter.type = 'bandpass';
    this.gustFilter.Q.value = 8;
    this.gustGain = ctx.createGain();
    this.loop(this.noise, this.gustFilter);
    this.gustFilter.connect(this.gustGain).connect(this.ambBus);

    // waves / flowing liquid
    this.waveFilter = ctx.createBiquadFilter();
    this.waveFilter.type = 'lowpass';
    this.waveFilter.frequency.value = 700;
    this.waveGain = ctx.createGain();
    this.loop(this.brown, this.waveFilter);
    this.waveFilter.connect(this.waveGain).connect(this.ambBus);

    // engine: low saw pair + rumble noise; routed directly (structure-borne in cabin)
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 220;
    this.engineGain = ctx.createGain();
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 42;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 42.7;
    const oscG = ctx.createGain();
    oscG.gain.value = 0.25;
    this.engineOsc.connect(oscG);
    this.engineOsc2.connect(oscG);
    oscG.connect(this.engineFilter);
    this.loop(this.brown, this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.fxBus);
    this.engineOsc.start();
    this.engineOsc2.start();

    // RCS hiss
    const rcsF = ctx.createBiquadFilter();
    rcsF.type = 'highpass';
    rcsF.frequency.value = 2500;
    this.rcsGain = ctx.createGain();
    this.loop(this.noise, rcsF);
    rcsF.connect(this.rcsGain).connect(this.fxBus);

    // re-entry plasma roar (through the hull)
    this.roarFilter = ctx.createBiquadFilter();
    this.roarFilter.type = 'lowpass';
    this.roarGain = ctx.createGain();
    this.loop(this.brown, this.roarFilter);
    this.roarFilter.connect(this.roarGain).connect(this.fxBus);

    // cabin life-support hum
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 120;
    const hum2 = ctx.createOscillator();
    hum2.type = 'triangle';
    hum2.frequency.value = 60;
    this.humGain = ctx.createGain();
    hum.connect(this.humGain);
    hum2.connect(this.humGain);
    this.humGain.connect(this.fxBus);
    hum.start();
    hum2.start();

    // speculative FTL drone
    this.ftlOsc = ctx.createOscillator();
    this.ftlOsc.type = 'sine';
    this.ftlOsc.frequency.value = 55;
    this.ftlGain = ctx.createGain();
    this.ftlOsc.connect(this.ftlGain).connect(this.fxBus);
    this.ftlOsc.start();

    for (const g of [this.windGain, this.gustGain, this.waveGain, this.engineGain, this.rcsGain, this.roarGain, this.humGain, this.ftlGain]) g.gain.value = 0;
    this.applyVolumes();
  }

  private makeNoise(seconds: number, brown: boolean): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  private loop(buf: AudioBuffer, dest: AudioNode) {
    const s = this.ctx!.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.loopStart = 0;
    s.playbackRate.value = 0.97 + Math.random() * 0.06;
    s.connect(dest);
    s.start(0, Math.random() * buf.duration);
    return s;
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.ambBus.gain.value = this.volumes.ambience;
    this.fxBus.gain.value = this.volumes.effects;
  }

  private ramp(p: AudioParam, v: number, tc = 0.15) {
    p.setTargetAtTime(v, this.ctx!.currentTime, tc);
  }

  /** Per-frame update. */
  update(s: AudioState, dt: number) {
    this.state = s;
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'suspended') return;
    this.t += dt;
    const P = Math.max(s.pressure, 0);
    const medium = this.cinematic ? 1 : Math.min(1, Math.sqrt(P)); // loudness of airborne sound
    // high frequencies die out in thin air; the hull muffles everything outside
    const cutoff = this.cinematic ? 12000 : 250 + 11000 * Math.min(1, Math.sqrt(P));
    this.ramp(this.extFilter.frequency, s.inCabin ? Math.min(cutoff, 700) : cutoff, 0.3);
    this.ramp(this.extGain.gain, medium * (s.inCabin ? 0.35 : 1), 0.3);
    // wind: ambient + relative airspeed
    const rel = Math.sqrt(s.wind * s.wind + s.airSpeed * s.airSpeed);
    const rho = Math.min(P, 4);
    const windAmp = Math.min(0.9, rho * (0.02 + 0.0006 * rel * rel) / (1 + 0.0008 * rel * rel));
    const gust = 0.6 + 0.4 * Math.sin(this.t * 0.37) * Math.sin(this.t * 0.11 + 1.3);
    this.ramp(this.windGain.gain, windAmp * gust, 0.4);
    this.ramp(this.windFilter.frequency, 250 + Math.min(rel, 400) * 6, 0.5);
    this.ramp(this.gustGain.gain, windAmp * 0.05 * Math.max(0, gust - 0.6) * 2, 0.6);
    this.ramp(this.gustFilter.frequency, 600 + 500 * Math.sin(this.t * 0.23), 0.8);
    // liquids
    const swell = 0.5 + 0.5 * Math.sin(this.t * 0.6) * Math.sin(this.t * 0.17 + 2);
    this.ramp(this.waveGain.gain, s.liquidNear * 0.35 * (0.4 + 0.6 * swell), 0.5);
    // engine: structure-borne inside the ship; airborne outside (or cinematic)
    const hearEngine = s.inShip && (s.inCabin || P > 1e-3 || this.cinematic);
    const engineLvl = hearEngine ? s.engineLevel * (s.inCabin ? 0.6 : 0.9 * (this.cinematic ? 1 : medium)) : 0;
    this.ramp(this.engineGain.gain, engineLvl, 0.25);
    this.ramp(this.engineOsc.frequency, 38 + 30 * s.engineLevel, 0.4);
    this.ramp(this.engineOsc2.frequency, 38.6 + 30.5 * s.engineLevel, 0.4);
    this.ramp(this.engineFilter.frequency, 150 + 450 * s.engineLevel, 0.3);
    this.ramp(this.rcsGain.gain, s.inShip && (s.inCabin || P > 1e-3 || this.cinematic) ? s.rcs * 0.05 : 0, 0.05);
    // re-entry roar through the hull
    const roar = Math.min(0.8, Math.log10(1 + s.heating / 1e4) / 4);
    this.ramp(this.roarGain.gain, s.inShip ? roar : 0, 0.3);
    this.ramp(this.roarFilter.frequency, 200 + roar * 900, 0.3);
    this.ramp(this.humGain.gain, s.inCabin ? 0.012 : 0, 0.5);
    this.ramp(this.ftlGain.gain, s.ftl * 0.08, 0.6);
    this.ramp(this.ftlOsc.frequency, 55 + s.ftl * 40, 1);
    // occasional events
    if (s.storm > 0.05 && P > 0.05) {
      this.nextThunder -= dt * s.storm;
      if (this.nextThunder <= 0) {
        this.thunder(1 + Math.random() * 8);
        this.nextThunder = 6 + Math.random() * 20;
      }
    }
    if (s.fauna > 0.05 && P > 0.05) {
      this.nextCall -= dt * s.fauna;
      if (this.nextCall <= 0) {
        this.call();
        this.nextCall = 2 + Math.random() * 9;
      }
    }
  }

  /** A footstep: impulsive filtered noise, shaped by the surface. */
  footstep(surface: Surface, speed = 1.5) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const P = this.state.pressure;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = surface === 'snow' ? 0.6 : surface === 'sand' ? 0.8 : 1.2;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = { rock: 1800, sand: 900, snow: 700, ice: 2600, liquid: 500, vegetation: 1200 }[surface] * (0.9 + Math.random() * 0.2);
    f.Q.value = surface === 'ice' || surface === 'rock' ? 2.5 : 0.9;
    const g = ctx.createGain();
    // in vacuum you only hear your own steps through your body: quiet and dull
    const vac = !this.cinematic && P < 1e-3;
    const amp = (vac ? 0.05 : 0.18) * Math.min(1.5, 0.6 + speed * 0.12);
    const dur = surface === 'snow' || surface === 'sand' ? 0.22 : 0.12;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
    if (vac) f.frequency.value *= 0.3;
    src.connect(f).connect(g).connect(this.fxBus);
    src.start(now, Math.random() * 1.5, dur + 0.05);
  }

  /** Distant thunder: delayed (speed of sound), low-passed rumble. */
  thunder(distKm: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime + Math.min(distKm * 2.9, 12) * 0.1; // compressed delay
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900 / (1 + distKm * 0.4);
    const g = ctx.createGain();
    const amp = 0.6 / (1 + distKm * 0.5);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.05);
    g.gain.setTargetAtTime(amp * 0.4, now + 0.3, 0.3);
    g.gain.setTargetAtTime(0, now + 1.2, 0.8 + distKm * 0.1);
    src.connect(f).connect(g).connect(this.ambBus);
    src.start(now, Math.random() * 2);
    src.stop(now + 6);
  }

  /** An alien animal call: FM chirp sequence. */
  call() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const base = 300 + Math.random() * 1400;
    const n = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const t0 = now + i * (0.12 + Math.random() * 0.15);
      const o = ctx.createOscillator();
      o.type = 'sine';
      const m = ctx.createOscillator();
      m.frequency.value = base * (0.5 + Math.random());
      const mg = ctx.createGain();
      mg.gain.value = base * 0.3;
      m.connect(mg).connect(o.frequency);
      o.frequency.setValueAtTime(base, t0);
      o.frequency.exponentialRampToValueAtTime(base * (0.6 + Math.random() * 0.9), t0 + 0.15);
      const g = ctx.createGain();
      const amp = 0.02 + Math.random() * 0.03;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0002, t0 + 0.2);
      o.connect(g).connect(this.ambBus);
      o.start(t0);
      m.start(t0);
      o.stop(t0 + 0.25);
      m.stop(t0 + 0.25);
    }
  }

  /** Interface / instrument tone (not physical sound). */
  blip(kind: 'select' | 'scan' | 'discovery' | 'warn') {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const notes = { select: [880], scan: [660, 990], discovery: [523, 659, 784], warn: [440, 330] }[kind];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      const t0 = now + i * 0.09;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
      o.connect(g).connect(this.master);
      o.start(t0);
      o.stop(t0 + 0.3);
    });
  }

  resume() {
    if (!this.ctx) this.init();
    else if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
}
