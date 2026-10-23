// Procedural soundscape, synthesised with WebAudio (no audio files).
//
//  wind      layered filtered noise: low rumble, broadband whoosh, resonant whistle;
//            gusts modulate level and colour, direction pans it around your head
//  saltation high hiss of sand grains bouncing along the surface in strong wind
//  steps     pre-rendered granular sand crunches (walk / run / splash / landing)
//  slide     continuous swish while sliding down a slip face, plus the rare low
//            "booming dune" drone heard on real avalanching slip faces
//  oasis     positional water lapping, palm rustle and birdsong by day
//  night     crickets once the sun is down

function makeNoise(ctx, seconds, color) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'pink') {
        // Paul Kellet's refined pink filter.
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else if (color === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        d[i] = w * 0.5;
      }
    }
    // Crossfade the loop seam.
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[len - fade + i] = d[len - fade + i] * (1 - t) + d[i] * t;
    }
  }
  return buf;
}

// One-pole filters for offline synthesis.
function lowpass(x, cutoff, sr) {
  const a = Math.exp((-2 * Math.PI * cutoff) / sr);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y = (1 - a) * x[i] + a * y;
    x[i] = y;
  }
}
function highpass(x, cutoff, sr) {
  const a = Math.exp((-2 * Math.PI * cutoff) / sr);
  let y = 0;
  let px = 0;
  for (let i = 0; i < x.length; i++) {
    y = a * (y + x[i] - px);
    px = x[i];
    x[i] = y;
  }
}

/** A sand footstep: heel crunch, rolling swish and a spray of tiny grain clicks. */
function makeStep(ctx, kind) {
  const sr = ctx.sampleRate;
  const dur = kind === 'land' ? 0.5 : 0.36;
  const n = Math.floor(sr * dur);
  const x = new Float32Array(n);
  const heelT = kind === 'run' ? 0.022 : 0.035;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const heel = Math.exp(-t / heelT) * (1 - Math.exp(-t / 0.002));
    const roll = Math.exp(-Math.max(0, t - 0.045) / 0.075) * (t > 0.03 ? 1 : 0) * 0.45;
    x[i] = (Math.random() * 2 - 1) * (heel + roll);
  }
  // Grain crackle: many tiny compressions of sand.
  const clicks = kind === 'run' ? 55 : 38;
  for (let c = 0; c < clicks; c++) {
    const t0 = Math.pow(Math.random(), 1.8) * 0.18;
    const s0 = Math.floor(t0 * sr);
    const amp = (0.3 + Math.random() * 0.7) * (1 - t0 / 0.25);
    const len = Math.floor(sr * (0.0008 + Math.random() * 0.002));
    for (let i = 0; i < len && s0 + i < n; i++) x[s0 + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / (len * 0.3));
  }
  if (kind === 'splash') {
    highpass(x, 300, sr);
    lowpass(x, 2600, sr);
    // Bubbles: short decaying sines.
    for (let b = 0; b < 9; b++) {
      const t0 = 0.02 + Math.random() * 0.2;
      const f = 400 + Math.random() * 900;
      const s0 = Math.floor(t0 * sr);
      for (let i = 0; i < sr * 0.04 && s0 + i < n; i++) x[s0 + i] += Math.sin((2 * Math.PI * f * i) / sr) * 0.4 * Math.exp(-i / (sr * 0.01));
    }
  } else {
    highpass(x, kind === 'land' ? 90 : 220, sr);
    lowpass(x, kind === 'run' ? 5200 : 4200, sr);
  }
  if (kind === 'land' || kind === 'run') {
    // Body thump.
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      x[i] += Math.sin(2 * Math.PI * 62 * t) * Math.exp(-t / 0.05) * (kind === 'land' ? 1.1 : 0.35);
    }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (x[i] / (peak || 1)) * 0.9;
  return buf;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.volume = 0.8;
    this.smoothed = { wind: 0, hiss: 0, slide: 0, boom: 0 };
    this.nextBird = 0;
    this.nextCricket = 0;
    this.boomHold = 0;
  }

  /** Must be called from a user gesture. Safe to call more than once. */
  async start() {
    if (this.ready) {
      if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    master.connect(comp).connect(ctx.destination);
    this.master = master;

    this.pink = makeNoise(ctx, 6, 'pink');
    this.brown = makeNoise(ctx, 7, 'brown');
    this.white = makeNoise(ctx, 3, 'white');
    const loop = (buf, rate = 1) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = rate;
      s.start(0, Math.random() * buf.duration);
      return s;
    };

    // Wind: three layers sharing one stereo panner.
    this.windPan = ctx.createStereoPanner();
    this.windPan.connect(master);
    this.rumble = { f: ctx.createBiquadFilter(), g: ctx.createGain() };
    this.rumble.f.type = 'lowpass';
    this.rumble.f.frequency.value = 260;
    this.rumble.g.gain.value = 0;
    loop(this.brown).connect(this.rumble.f).connect(this.rumble.g).connect(this.windPan);
    this.whoosh = { f: ctx.createBiquadFilter(), g: ctx.createGain() };
    this.whoosh.f.type = 'bandpass';
    this.whoosh.f.Q.value = 0.7;
    this.whoosh.f.frequency.value = 500;
    this.whoosh.g.gain.value = 0;
    loop(this.pink, 0.9).connect(this.whoosh.f).connect(this.whoosh.g).connect(this.windPan);
    this.whistle = { f: ctx.createBiquadFilter(), g: ctx.createGain() };
    this.whistle.f.type = 'bandpass';
    this.whistle.f.Q.value = 14;
    this.whistle.f.frequency.value = 900;
    this.whistle.g.gain.value = 0;
    loop(this.pink, 1.1).connect(this.whistle.f).connect(this.whistle.g).connect(this.windPan);

    // Saltation hiss (grains), slightly flutter-modulated.
    this.hiss = { f: ctx.createBiquadFilter(), g: ctx.createGain() };
    this.hiss.f.type = 'highpass';
    this.hiss.f.frequency.value = 3800;
    this.hiss.g.gain.value = 0;
    loop(this.white).connect(this.hiss.f).connect(this.hiss.g).connect(master);

    // Sliding swish.
    this.slide = { f: ctx.createBiquadFilter(), g: ctx.createGain() };
    this.slide.f.type = 'bandpass';
    this.slide.f.frequency.value = 1100;
    this.slide.f.Q.value = 0.9;
    this.slide.g.gain.value = 0;
    loop(this.pink, 1.3).connect(this.slide.f).connect(this.slide.g).connect(master);

    // Booming dune: two detuned low voices beating against each other.
    this.boom = { g: ctx.createGain(), f: ctx.createBiquadFilter() };
    this.boom.f.type = 'lowpass';
    this.boom.f.frequency.value = 380;
    this.boom.g.gain.value = 0;
    for (const [freq, type, level] of [
      [84, 'sawtooth', 0.5],
      [85.6, 'triangle', 0.6],
      [168.5, 'sine', 0.25],
    ]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(this.boom.f);
      o.start();
    }
    this.boom.f.connect(this.boom.g).connect(master);

    // Oasis ambience, positioned at the nearest lake.
    this.oasis = ctx.createPanner();
    this.oasis.panningModel = 'HRTF';
    this.oasis.distanceModel = 'inverse';
    this.oasis.refDistance = 40;
    this.oasis.rolloffFactor = 1.4;
    this.oasis.maxDistance = 3000;
    this.oasisGain = ctx.createGain();
    this.oasisGain.gain.value = 0;
    this.oasis.connect(this.oasisGain).connect(master);
    const lap = { f: ctx.createBiquadFilter(), g: ctx.createGain() };
    lap.f.type = 'bandpass';
    lap.f.frequency.value = 520;
    lap.f.Q.value = 0.8;
    lap.g.gain.value = 0.35;
    loop(this.brown, 1.4).connect(lap.f).connect(lap.g).connect(this.oasis);
    // Slow swell on the lapping.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain).connect(lap.g.gain);
    lfo.start();
    this.rustle = { f: ctx.createBiquadFilter(), g: ctx.createGain() };
    this.rustle.f.type = 'bandpass';
    this.rustle.f.frequency.value = 3200;
    this.rustle.f.Q.value = 0.6;
    this.rustle.g.gain.value = 0;
    loop(this.pink, 1.2).connect(this.rustle.f).connect(this.rustle.g).connect(this.oasis);
    this.birdBus = ctx.createGain();
    this.birdBus.gain.value = 0.5;
    this.birdBus.connect(this.oasis);

    // Night insects.
    this.night = ctx.createGain();
    this.night.gain.value = 0;
    this.night.connect(master);

    this.steps = {
      walk: Array.from({ length: 8 }, () => makeStep(ctx, 'walk')),
      run: Array.from({ length: 8 }, () => makeStep(ctx, 'run')),
      splash: Array.from({ length: 5 }, () => makeStep(ctx, 'splash')),
      land: Array.from({ length: 3 }, () => makeStep(ctx, 'land')),
    };
    this.ready = true;
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.1);
  }

  setMuted(m) {
    this.muted = m;
    this.setVolume(this.volume);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  _play(buf, gain, pan = 0, rate = 1) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(g).connect(p).connect(this.master);
    s.start();
  }

  footstep(e) {
    if (!this.ready) return;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const pan = e.foot ? 0.12 : -0.12;
    const rate = 0.9 + Math.random() * 0.2;
    if (e.water > 0.03) {
      this._play(pick(this.steps.splash), 0.55, pan, rate);
      return;
    }
    const run = e.running;
    // Damp, compact oasis ground is duller; loose slip-face sand is softer and longer.
    const g = (run ? 0.42 : 0.3) * (1 - 0.35 * (e.oasis || 0)) * (0.85 + Math.random() * 0.3);
    this._play(pick(run ? this.steps.run : this.steps.walk), g, pan, rate * (1 - 0.1 * (e.lee || 0)));
  }

  land(impact) {
    if (!this.ready) return;
    this._play(this.steps.land[Math.floor(Math.random() * 3)], Math.min(0.8, 0.3 + impact * 0.08), 0, 0.9 + Math.random() * 0.15);
  }

  _chirp(t0) {
    const ctx = this.ctx;
    const base = 2200 + Math.random() * 2400;
    const notes = 2 + Math.floor(Math.random() * 5);
    let t = t0;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const g = ctx.createGain();
      const f0 = base * (0.85 + Math.random() * 0.3);
      const dur = 0.05 + Math.random() * 0.09;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 1.35 : 0.72), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.birdBus);
      o.start(t);
      o.stop(t + dur + 0.02);
      t += dur + 0.03 + Math.random() * 0.08;
    }
  }

  _cricket(t0) {
    const ctx = this.ctx;
    const f = 4300 + Math.random() * 900;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    const g = ctx.createGain();
    g.gain.value = 0;
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.connect(g).connect(pan).connect(this.night);
    const pulses = 3 + Math.floor(Math.random() * 3);
    let t = t0;
    for (let i = 0; i < pulses; i++) {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.004);
      g.gain.linearRampToValueAtTime(0, t + 0.018);
      t += 0.035;
    }
    o.start(t0);
    o.stop(t + 0.05);
  }

  /**
   * state: { wind, gust, storm, windRelX (-1 left .. 1 right), sliding, onLee, speed,
   *          oasis: {x, y, z} | null, listener: {pos, fwd}, day (0..1), night (0..1) }
   */
  update(dt, s) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const tc = 0.25;
    const w = Math.min(1.4, s.wind / 14);
    this.windPan.pan.setTargetAtTime(Math.max(-0.7, Math.min(0.7, -s.windRelX * 0.6)), now, 0.5);
    this.rumble.g.gain.setTargetAtTime(0.02 + 0.5 * w * w + 0.25 * s.storm, now, tc);
    this.rumble.f.frequency.setTargetAtTime(160 + 260 * w, now, tc);
    this.whoosh.g.gain.setTargetAtTime(0.02 + 0.32 * w * (0.6 + 0.6 * s.gust), now, tc);
    this.whoosh.f.frequency.setTargetAtTime(320 + 900 * w * (0.5 + 0.5 * s.gust), now, tc);
    this.whistle.g.gain.setTargetAtTime(Math.max(0, w - 0.45) * 0.18 * s.gust, now, 0.6);
    this.whistle.f.frequency.setTargetAtTime(700 + 900 * s.gust + 300 * Math.sin(now * 0.37), now, 0.8);
    const sal = Math.max(0, (s.wind - 5.5) / 10);
    this.hiss.g.gain.setTargetAtTime(Math.min(0.22, sal * 0.2) * (0.7 + 0.3 * Math.sin(now * 23 + Math.sin(now * 3.1) * 4)), now, 0.05);

    const sliding = s.sliding && s.speed > 0.6;
    this.slide.g.gain.setTargetAtTime(sliding ? Math.min(0.35, s.speed * 0.12) : 0, now, 0.15);
    // The boom needs a sustained avalanche down a big slip face.
    this.boomHold = sliding && s.onLee > 0.5 ? this.boomHold + dt : Math.max(0, this.boomHold - dt * 2);
    this.boom.g.gain.setTargetAtTime(this.boomHold > 1.2 ? 0.14 : 0, now, this.boomHold > 1.2 ? 0.8 : 1.5);

    const L = ctx.listener;
    const { pos, fwd } = s.listener;
    if (L.positionX) {
      L.positionX.value = pos.x;
      L.positionY.value = pos.y;
      L.positionZ.value = pos.z;
      L.forwardX.value = fwd.x;
      L.forwardY.value = fwd.y;
      L.forwardZ.value = fwd.z;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else if (L.setPosition) {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
    if (s.oasis) {
      if (this.oasis.positionX) {
        this.oasis.positionX.value = s.oasis.x;
        this.oasis.positionY.value = s.oasis.y;
        this.oasis.positionZ.value = s.oasis.z;
      } else this.oasis.setPosition(s.oasis.x, s.oasis.y, s.oasis.z);
      this.oasisGain.gain.setTargetAtTime(1, now, 1);
      this.rustle.g.gain.setTargetAtTime(0.03 + 0.12 * w, now, 0.4);
      if (s.day > 0.3 && now > this.nextBird && s.oasisDistance < 600) {
        this._chirp(now + 0.05);
        this.nextBird = now + 1.5 + Math.random() * 6;
      }
    } else {
      this.oasisGain.gain.setTargetAtTime(0, now, 1);
    }
    this.night.gain.setTargetAtTime(s.night * (1 - s.storm) * (1 - 0.6 * w), now, 2);
    if (s.night > 0.4 && now > this.nextCricket) {
      this._cricket(now + 0.02);
      this.nextCricket = now + 0.25 + Math.random() * 0.9;
    }
  }
}
