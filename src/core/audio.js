// Procedural audio engine. Every sound in the game is synthesized with the
// Web Audio API — no sample files needed.
import { rand, clamp } from './utils.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volumes = { master: 0.8, sfx: 0.9, music: 0.7, ambience: 0.7 };
    this.loops = new Set();
    this.listenerPos = { x: 0, y: 1.6, z: 0 };
    this.reverbWet = 0.12;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.connect(this.master);
    this.ambience = ctx.createGain(); this.ambience.connect(this.master);
    // shared room reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.6, 2.8);
    this.reverbGain = ctx.createGain(); this.reverbGain.gain.value = this.reverbWet;
    this.reverbSend = ctx.createGain();
    this.reverbSend.connect(this.reverb).connect(this.reverbGain).connect(this.master);
    this.sfx.connect(this.reverbSend);
    this.music.connect(this.reverbSend);
    // noise buffers
    this.white = this._noise('white');
    this.pink = this._noise('pink');
    this.brown = this._noise('brown');
    this.applyVolumes();
    this.ready = true;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.music.gain.setTargetAtTime(this.volumes.music * 0.8, t, 0.05);
    this.ambience.gain.setTargetAtTime(this.volumes.ambience, t, 0.05);
  }

  setRoomReverb(amount) {
    if (!this.ctx) return;
    this.reverbGain.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.4);
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _noise(kind) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return buf;
  }

  updateListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = camera.getWorldPosition(this._v || (this._v = camera.position.clone()));
    this.listenerPos = { x: p.x, y: p.y, z: p.z };
    const f = camera.getWorldDirection(this._f || (this._f = camera.position.clone()));
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(p.x, p.y, p.z); l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  // Creates an output chain: gain -> (panner) -> bus.
  _out({ pos = null, volume = 1, bus = 'sfx', refDistance = 1.2 } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = volume;
    let panner = null;
    if (pos) {
      panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = refDistance; panner.rolloffFactor = 1.3; panner.maxDistance = 40;
      this._setPannerPos(panner, pos);
      g.connect(panner).connect(this[bus]);
    } else g.connect(this[bus]);
    return { gain: g, panner };
  }

  _setPannerPos(panner, pos) {
    if (panner.positionX) { panner.positionX.value = pos.x; panner.positionY.value = pos.y; panner.positionZ.value = pos.z; }
    else panner.setPosition(pos.x, pos.y, pos.z);
  }

  _src(buffer, { loop = false, rate = 1 } = {}) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer; s.loop = loop; s.playbackRate.value = rate;
    if (!loop) s.loopStart = 0;
    return s;
  }

  _osc(type, freq) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq; return o; }

  _env(gainNode, t, a, d, peak = 1, sustain = 0, release = 0.05) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(peak, t + a);
    if (sustain > 0) { g.setTargetAtTime(sustain * peak, t + a, d / 3); }
    else g.exponentialRampToValueAtTime(0.0001, t + a + d);
    void release;
  }

  // Noise burst through a filter
  _noiseBurst(out, t, { type = 'bandpass', freq = 1000, q = 1, dur = 0.1, attack = 0.002, peak = 1, buffer = 'white', freqEnd = null, rate = 1 } = {}) {
    const ctx = this.ctx;
    const src = this._src(this[buffer], { rate });
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    this._env(g, t, attack, dur, peak);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 2); src.stop(t + attack + dur + 0.05);
  }

  _tone(out, t, { type = 'sine', freq = 440, freqEnd = null, dur = 0.2, attack = 0.005, peak = 0.5, detune = 0, glideTime = null } = {}) {
    const o = this._osc(type, freq);
    o.detune.value = detune;
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + (glideTime || dur));
    const g = this.ctx.createGain();
    this._env(g, t, attack, dur, peak);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + attack + dur + 0.05);
    return o;
  }

  _bell(out, t, freq, dur = 1.2, peak = 0.3) {
    this._tone(out, t, { freq, dur, peak, attack: 0.002 });
    this._tone(out, t, { freq: freq * 2.76, dur: dur * 0.4, peak: peak * 0.25, attack: 0.002 });
    this._tone(out, t, { freq: freq * 5.4, dur: dur * 0.2, peak: peak * 0.1, attack: 0.002 });
  }

  // ---------------------------------------------------------------- one-shots
  play(name, opts = {}) {
    if (!this.ready) return;
    const fn = SFX[name];
    if (!fn) { console.warn('unknown sfx', name); return; }
    const ctx = this.ctx;
    const { gain } = this._out(opts);
    const t = ctx.currentTime + (opts.delay || 0);
    const p = opts.pitch ?? 1;
    try { fn.call(this, gain, t, p, opts); } catch (e) { console.error(e); }
    // auto-disconnect
    setTimeout(() => { try { gain.disconnect(); } catch { /* noop */ } }, 6000 + (opts.delay || 0) * 1000);
  }

  // ---------------------------------------------------------------- loops
  loop(name, opts = {}) {
    if (!this.ready) return { stop() {}, setVolume() {}, setPos() {}, setParam() {} };
    const ctx = this.ctx;
    const vol = opts.volume ?? 1;
    const { gain, panner } = this._out({ ...opts, volume: 0 });
    gain.gain.setTargetAtTime(vol, ctx.currentTime, opts.fadeIn ?? 0.15);
    const nodes = [];
    const handle = {
      name, gain, panner, nodes, params: {}, stopped: false,
      stop: (fade = 0.25) => {
        if (handle.stopped) return;
        handle.stopped = true;
        gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
        setTimeout(() => {
          nodes.forEach((n) => { try { n.stop?.(); } catch { /* noop */ } try { n.disconnect(); } catch { /* noop */ } });
          try { gain.disconnect(); panner?.disconnect(); } catch { /* noop */ }
          clearInterval(handle.timer);
        }, fade * 1000 + 200);
        this.loops.delete(handle);
      },
      setVolume: (v, tc = 0.1) => { if (!handle.stopped) gain.gain.setTargetAtTime(v, ctx.currentTime, tc); },
      setPos: (p) => { if (panner) this._setPannerPos(panner, p); },
      setParam: (k, v) => { handle.params[k]?.(v); },
    };
    const fn = LOOPS[name];
    if (!fn) { console.warn('unknown loop', name); return handle; }
    fn.call(this, gain, handle, opts);
    this.loops.add(handle);
    return handle;
  }

  stopAllLoops() { for (const l of [...this.loops]) l.stop(0.1); }
}

// ---------------------------------------------------------------------------
// One-shot recipes: function(out, t, pitch, opts)
const SFX = {
  click(out, t, p) { this._tone(out, t, { type: 'sine', freq: 1900 * p, dur: 0.03, peak: 0.25 }); this._noiseBurst(out, t, { freq: 5000, dur: 0.015, peak: 0.2 }); },
  ui(out, t, p) { this._tone(out, t, { type: 'sine', freq: 1200 * p, freqEnd: 1500 * p, dur: 0.05, peak: 0.12 }); },
  uiBack(out, t, p) { this._tone(out, t, { type: 'sine', freq: 900 * p, freqEnd: 700 * p, dur: 0.06, peak: 0.12 }); },
  hover(out, t, p) { this._tone(out, t, { type: 'sine', freq: 2400 * p, dur: 0.02, peak: 0.04 }); },
  pop(out, t, p) { this._tone(out, t, { type: 'sine', freq: 380 * p, freqEnd: 980 * p, dur: 0.07, peak: 0.4, glideTime: 0.05 }); },
  bubblepop(out, t, p) { this._tone(out, t, { type: 'sine', freq: rand(1300, 2100) * p, freqEnd: rand(2400, 3200) * p, dur: 0.035, peak: 0.18 }); },
  notify(out, t, p) { this._bell(out, t, 880 * p, 0.5, 0.2); this._bell(out, t + 0.11, 1320 * p, 0.7, 0.2); },
  message(out, t, p) { this._tone(out, t, { type: 'triangle', freq: 1046 * p, dur: 0.09, peak: 0.2 }); this._tone(out, t + 0.09, { type: 'triangle', freq: 1568 * p, dur: 0.16, peak: 0.2 }); },
  doorbell(out, t) { this._bell(out, t, 659, 1.6, 0.35); this._bell(out, t + 0.55, 523, 2.2, 0.35); },
  knock(out, t) {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.16;
      this._tone(out, tt, { freq: 140, freqEnd: 80, dur: 0.09, peak: 0.6 });
      this._noiseBurst(out, tt, { type: 'lowpass', freq: 700, dur: 0.05, peak: 0.6 });
    }
  },
  step(out, t, p, o) {
    const surface = o.surface || 'wood';
    const f = { wood: 900, tile: 2400, rug: 400, carpet: 380 }[surface] || 900;
    this._noiseBurst(out, t, { type: 'bandpass', freq: f * rand(0.85, 1.15), q: 1.2, dur: 0.06, peak: surface === 'rug' ? 0.25 : 0.35 });
    this._tone(out, t, { freq: rand(70, 95), dur: 0.05, peak: surface === 'tile' ? 0.15 : 0.3 });
  },
  crunch(out, t, p) {
    for (let i = 0; i < 6; i++) this._noiseBurst(out, t + i * rand(0.015, 0.035), { type: 'bandpass', freq: rand(1500, 4200) * p, q: 2, dur: rand(0.02, 0.05), peak: rand(0.3, 0.6) });
    this._noiseBurst(out, t, { type: 'lowpass', freq: 500, dur: 0.12, peak: 0.4 });
  },
  bite(out, t, p) {
    this._noiseBurst(out, t, { type: 'lowpass', freq: 900 * p, dur: 0.12, peak: 0.5 });
    for (let i = 0; i < 3; i++) this._noiseBurst(out, t + 0.12 + i * 0.12, { type: 'lowpass', freq: 450, dur: 0.06, peak: 0.25 });
  },
  slurp(out, t, p) {
    this._noiseBurst(out, t, { type: 'bandpass', freq: 900 * p, freqEnd: 2600 * p, q: 3, dur: 0.35, peak: 0.4, attack: 0.05 });
  },
  sip(out, t, p) {
    this._noiseBurst(out, t, { type: 'bandpass', freq: 1400 * p, q: 4, dur: 0.18, peak: 0.2, attack: 0.04 });
    this._tone(out, t + 0.25, { freq: 220 * p, freqEnd: 120 * p, dur: 0.12, peak: 0.35 });
    this._tone(out, t + 0.55, { freq: 200 * p, freqEnd: 110 * p, dur: 0.12, peak: 0.3 });
  },
  canopen(out, t) {
    this._noiseBurst(out, t, { type: 'highpass', freq: 3000, dur: 0.02, peak: 0.8 });
    this._noiseBurst(out, t + 0.02, { type: 'highpass', freq: 5000, dur: 0.9, peak: 0.35, attack: 0.01 });
  },
  fizz(out, t) { this._noiseBurst(out, t, { type: 'highpass', freq: 6000, dur: 1.4, peak: 0.12, attack: 0.05 }); },
  tape(out, t) { this._noiseBurst(out, t, { type: 'bandpass', freq: 800, freqEnd: 4000, q: 2, dur: 0.45, peak: 0.6, attack: 0.02 }); },
  boxopen(out, t) {
    this._noiseBurst(out, t, { type: 'lowpass', freq: 400, dur: 0.15, peak: 0.7 });
    this._noiseBurst(out, t + 0.05, { type: 'bandpass', freq: 2500, q: 0.8, dur: 0.35, peak: 0.3 });
  },
  rustle(out, t) {
    for (let i = 0; i < 5; i++) this._noiseBurst(out, t + i * 0.07, { type: 'bandpass', freq: rand(2500, 5000), q: 1, dur: 0.08, peak: 0.25 });
  },
  whoosh(out, t, p) { this._noiseBurst(out, t, { type: 'bandpass', freq: 300 * p, freqEnd: 1400 * p, q: 1.5, dur: 0.3, peak: 0.4, attack: 0.08 }); },
  thud(out, t, p, o) {
    const soft = o.soft;
    this._tone(out, t, { freq: (soft ? 120 : 95) * p, freqEnd: 45, dur: 0.15, peak: (o.impact ?? 1) * 0.6 });
    this._noiseBurst(out, t, { type: 'lowpass', freq: soft ? 500 : 1400, dur: 0.08, peak: (o.impact ?? 1) * 0.5 });
  },
  clink(out, t, p) {
    this._tone(out, t, { freq: 2500 * p, dur: 0.25, peak: 0.18 });
    this._tone(out, t, { freq: 3760 * p, dur: 0.18, peak: 0.1 });
  },
  squeak(out, t, p) {
    const o = this._tone(out, t, { type: 'triangle', freq: 1100 * p, freqEnd: 2000 * p, dur: 0.22, peak: 0.25, glideTime: 0.12 });
    void o;
  },
  boing(out, t, p) {
    const o = this._osc('sine', 300 * p);
    const lfo = this._osc('sine', 18); const lg = this.ctx.createGain(); lg.gain.value = 40;
    lfo.connect(lg).connect(o.frequency);
    o.frequency.exponentialRampToValueAtTime(140 * p, t + 0.5);
    const g = this.ctx.createGain(); this._env(g, t, 0.005, 0.5, 0.4);
    o.connect(g).connect(out); o.start(t); lfo.start(t); o.stop(t + 0.6); lfo.stop(t + 0.6);
  },
  spray(out, t) { this._noiseBurst(out, t, { type: 'highpass', freq: 3500, dur: 0.55, peak: 0.35, attack: 0.03 }); },
  switch(out, t) { this._noiseBurst(out, t, { type: 'bandpass', freq: 2200, q: 2, dur: 0.015, peak: 0.6 }); this._tone(out, t, { freq: 180, dur: 0.03, peak: 0.25 }); },
  door(out, t, p, o) {
    if (o.close) {
      this._tone(out, t + 0.05, { freq: 80, freqEnd: 50, dur: 0.18, peak: 0.6 });
      this._noiseBurst(out, t + 0.05, { type: 'lowpass', freq: 600, dur: 0.12, peak: 0.6 });
      this._noiseBurst(out, t + 0.07, { type: 'bandpass', freq: 2500, dur: 0.03, peak: 0.25 });
    } else {
      const c = this._osc('sawtooth', 130);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6;
      c.frequency.setValueAtTime(110, t); c.frequency.linearRampToValueAtTime(170, t + 0.35); c.frequency.linearRampToValueAtTime(140, t + 0.5);
      const g = this.ctx.createGain(); this._env(g, t, 0.05, 0.45, 0.06);
      c.connect(f).connect(g).connect(out); c.start(t); c.stop(t + 0.6);
      this._noiseBurst(out, t, { type: 'bandpass', freq: 1800, dur: 0.03, peak: 0.25 });
    }
  },
  latch(out, t) { this._noiseBurst(out, t, { type: 'bandpass', freq: 3000, q: 3, dur: 0.02, peak: 0.5 }); this._noiseBurst(out, t + 0.06, { type: 'bandpass', freq: 2200, q: 3, dur: 0.02, peak: 0.4 }); },
  fridge(out, t, p, o) {
    if (o.close) { this._tone(out, t, { freq: 70, dur: 0.2, peak: 0.5 }); this._noiseBurst(out, t, { type: 'lowpass', freq: 300, dur: 0.15, peak: 0.6 }); }
    else this._noiseBurst(out, t, { type: 'lowpass', freq: 600, freqEnd: 200, dur: 0.25, peak: 0.6 });
  },
  cash(out, t) {
    this._noiseBurst(out, t, { type: 'bandpass', freq: 3000, dur: 0.06, peak: 0.4 });
    this._bell(out, t + 0.05, 1318, 0.6, 0.18); this._bell(out, t + 0.12, 1760, 0.9, 0.18);
  },
  levelup(out, t) { [60, 64, 67, 72, 76].forEach((n, i) => this._tone(out, t + i * 0.09, { type: 'triangle', freq: NOTE(n + 12), dur: 0.35, peak: 0.18 })); },
  success(out, t) { this._tone(out, t, { type: 'triangle', freq: NOTE(76), dur: 0.15, peak: 0.2 }); this._tone(out, t + 0.1, { type: 'triangle', freq: NOTE(83), dur: 0.3, peak: 0.2 }); },
  error(out, t) { this._tone(out, t, { type: 'square', freq: 220, dur: 0.1, peak: 0.08 }); this._tone(out, t + 0.12, { type: 'square', freq: 175, dur: 0.16, peak: 0.08 }); },
  flush(out, t) {
    this._noiseBurst(out, t, { type: 'lowpass', freq: 3000, freqEnd: 300, dur: 2.6, peak: 0.6, attack: 0.15, buffer: 'pink' });
    this._noiseBurst(out, t + 0.3, { type: 'bandpass', freq: 600, freqEnd: 200, q: 3, dur: 1.8, peak: 0.4, buffer: 'pink' });
  },
  ding(out, t) { this._bell(out, t, 1760, 1.4, 0.25); },
  sparkle(out, t, p) { for (let i = 0; i < 6; i++) this._tone(out, t + i * 0.05, { type: 'sine', freq: NOTE(84 + [0, 4, 7, 11, 12, 16][i]) * p, dur: 0.25, peak: 0.08 }); },
  reveal(out, t) { [72, 76, 79, 84].forEach((n, i) => this._bell(out, t + i * 0.08, NOTE(n), 1.0, 0.1)); },
  legendary(out, t) { [60, 64, 67, 71, 72, 76, 79, 83, 84].forEach((n, i) => this._bell(out, t + i * 0.07, NOTE(n + 12), 1.4, 0.09)); },
  type(out, t) { this._noiseBurst(out, t, { type: 'bandpass', freq: rand(2500, 4000), q: 2, dur: 0.02, peak: 0.25 }); this._tone(out, t, { freq: rand(250, 350), dur: 0.015, peak: 0.08 }); },
  shutter(out, t) { this._noiseBurst(out, t, { type: 'highpass', freq: 2000, dur: 0.03, peak: 0.6 }); this._noiseBurst(out, t + 0.07, { type: 'highpass', freq: 2500, dur: 0.04, peak: 0.5 }); },
  thunder(out, t, p, o) {
    const big = o.big ?? 1;
    this._noiseBurst(out, t, { type: 'lowpass', freq: 600, freqEnd: 80, dur: 4.5, peak: 0.9 * big, attack: 0.08, buffer: 'brown' });
    this._noiseBurst(out, t + 0.1, { type: 'lowpass', freq: 1200, freqEnd: 150, dur: 1.5, peak: 0.4 * big, attack: 0.01, buffer: 'brown' });
  },
  coin(out, t) { this._tone(out, t, { type: 'square', freq: 988, dur: 0.06, peak: 0.07 }); this._tone(out, t + 0.06, { type: 'square', freq: 1319, dur: 0.2, peak: 0.07 }); },
  blip(out, t, p) { this._tone(out, t, { type: 'square', freq: 660 * p, dur: 0.05, peak: 0.06 }); },
  hit(out, t, p) { this._noiseBurst(out, t, { type: 'lowpass', freq: 1500 * p, dur: 0.1, peak: 0.4 }); this._tone(out, t, { type: 'square', freq: 120 * p, freqEnd: 60, dur: 0.12, peak: 0.08 }); },
  explode(out, t) { this._noiseBurst(out, t, { type: 'lowpass', freq: 2000, freqEnd: 100, dur: 0.6, peak: 0.6, buffer: 'brown' }); },
  powerup(out, t) { this._tone(out, t, { type: 'square', freq: 300, freqEnd: 1200, dur: 0.3, peak: 0.07 }); },
  toaster(out, t) { this._noiseBurst(out, t, { type: 'bandpass', freq: 2000, q: 3, dur: 0.03, peak: 0.6 }); SFX.boing.call(this, out, t + 0.02, 1.6, {}); },
  zipper(out, t) { for (let i = 0; i < 12; i++) this._noiseBurst(out, t + i * 0.025, { type: 'bandpass', freq: 3000 + i * 150, q: 4, dur: 0.015, peak: 0.25 }); },
  paper(out, t) { this._noiseBurst(out, t, { type: 'bandpass', freq: 4000, q: 0.7, dur: 0.18, peak: 0.25, attack: 0.03 }); },
  pageturn(out, t) { this._noiseBurst(out, t, { type: 'bandpass', freq: 3000, freqEnd: 6000, q: 0.7, dur: 0.25, peak: 0.25, attack: 0.04 }); },
  splash(out, t) { this._noiseBurst(out, t, { type: 'lowpass', freq: 2500, freqEnd: 600, dur: 0.5, peak: 0.5, buffer: 'pink' }); },
  glug(out, t) { for (let i = 0; i < 3; i++) this._tone(out, t + i * 0.18, { freq: 260 - i * 30, freqEnd: 140, dur: 0.1, peak: 0.3 }); },
  sizzleBurst(out, t) { this._noiseBurst(out, t, { type: 'highpass', freq: 3000, dur: 1.0, peak: 0.4, attack: 0.01 }); },
  pour(out, t) { this._noiseBurst(out, t, { type: 'bandpass', freq: 1200, freqEnd: 2400, q: 2, dur: 1.4, peak: 0.25, attack: 0.1, buffer: 'pink' }); },
  chime(out, t, p) { this._bell(out, t, NOTE(72 + [0, 2, 4, 7, 9][Math.floor(Math.random() * 5)]) * p, 1.5, 0.15); },
  squish(out, t, p) { this._noiseBurst(out, t, { type: 'lowpass', freq: 700 * p, freqEnd: 300, dur: 0.25, peak: 0.5, attack: 0.03, buffer: 'pink' }); },
  spring(out, t, p) { for (let i = 0; i < 4; i++) this._tone(out, t + i * 0.06, { type: 'triangle', freq: (900 - i * 120) * p, freqEnd: (500 - i * 50) * p, dur: 0.08, peak: 0.12 }); },
  vinyl(out, t) { this._noiseBurst(out, t, { type: 'bandpass', freq: 1500, dur: 0.3, peak: 0.2 }); },
  beep(out, t, p) { this._tone(out, t, { type: 'sine', freq: 1500 * p, dur: 0.08, peak: 0.15 }); },
  match(out, t) { this._noiseBurst(out, t, { type: 'highpass', freq: 2500, dur: 0.15, peak: 0.6 }); this._noiseBurst(out, t + 0.1, { type: 'lowpass', freq: 900, dur: 0.6, peak: 0.25, attack: 0.05 }); },
  purr(out, t) { this._noiseBurst(out, t, { type: 'lowpass', freq: 200, dur: 1.2, peak: 0.4, buffer: 'brown', attack: 0.2 }); },
};

// ---------------------------------------------------------------------------
// Loop recipes: function(out, handle, opts)
function loopNoise(self, out, handle, { buffer = 'pink', type = 'bandpass', freq = 1200, q = 0.7, gain = 1 } = {}) {
  const src = self._src(self[buffer], { loop: true });
  const f = self.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = self.ctx.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(out);
  src.start(0, Math.random() * 2);
  handle.nodes.push(src, f, g);
  return { src, f, g };
}

const LOOPS = {
  water(out, h) {
    loopNoise(this, out, h, { freq: 1600, q: 0.5, gain: 0.5 });
    const { f } = loopNoise(this, out, h, { buffer: 'white', type: 'highpass', freq: 5000, gain: 0.12 });
    h.timer = setInterval(() => { f.frequency.setTargetAtTime(rand(4000, 7000), this.ctx.currentTime, 0.05); }, 90);
  },
  shower(out, h) {
    loopNoise(this, out, h, { freq: 1100, q: 0.4, gain: 0.7 });
    loopNoise(this, out, h, { buffer: 'white', type: 'highpass', freq: 4000, gain: 0.15 });
  },
  bath(out, h) { loopNoise(this, out, h, { freq: 700, q: 0.6, gain: 0.6 }); },
  sizzle(out, h) {
    const { g } = loopNoise(this, out, h, { buffer: 'white', type: 'highpass', freq: 3500, gain: 0.25 });
    h.timer = setInterval(() => {
      const t = this.ctx.currentTime;
      g.gain.setTargetAtTime(rand(0.12, 0.4), t, 0.03);
      if (Math.random() < 0.5) this._noiseBurst(out, t, { type: 'bandpass', freq: rand(2000, 6000), q: 3, dur: 0.02, peak: rand(0.2, 0.5) });
    }, 70);
  },
  hum(out, h, o) {
    const base = o.freq || 60;
    const a = this._osc('sawtooth', base); const b = this._osc('sine', base * 2);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    const g = this.ctx.createGain(); g.gain.value = 0.12;
    a.connect(f); b.connect(f); f.connect(g).connect(out);
    a.start(); b.start();
    h.nodes.push(a, b, f, g);
  },
  spinner(out, h) {
    const o = this._osc('sawtooth', 40);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 2;
    const g = this.ctx.createGain(); g.gain.value = 0.18;
    o.connect(f).connect(g).connect(out); o.start();
    const n = loopNoise(this, out, h, { buffer: 'white', type: 'bandpass', freq: 3000, q: 1, gain: 0.04 });
    h.nodes.push(o, f, g);
    h.params.rate = (r) => {
      const t = this.ctx.currentTime;
      o.frequency.setTargetAtTime(20 + r * 90, t, 0.05);
      f.frequency.setTargetAtTime(400 + r * 900, t, 0.05);
      g.gain.setTargetAtTime(0.05 + r * 0.18, t, 0.05);
      n.g.gain.setTargetAtTime(r * 0.06, t, 0.05);
    };
  },
  fan(out, h) { loopNoise(this, out, h, { buffer: 'brown', type: 'lowpass', freq: 700, gain: 0.5 }); LOOPS.hum.call(this, out, h, { freq: 50 }); },
  vacuum(out, h) {
    loopNoise(this, out, h, { buffer: 'pink', type: 'bandpass', freq: 1500, q: 0.8, gain: 0.25 });
    const o = this._osc('sawtooth', 160); const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = this.ctx.createGain(); g.gain.value = 0.05; o.connect(f).connect(g).connect(out); o.start(); h.nodes.push(o, f, g);
  },
  rain(out, h) {
    loopNoise(this, out, h, { buffer: 'pink', type: 'lowpass', freq: 1800, gain: 0.7 });
    const hp = loopNoise(this, out, h, { buffer: 'white', type: 'highpass', freq: 6000, gain: 0.08 });
    h.timer = setInterval(() => {
      if (Math.random() < 0.6) this._noiseBurst(out, this.ctx.currentTime, { type: 'bandpass', freq: rand(2500, 6500), q: 4, dur: 0.012, peak: rand(0.05, 0.25) });
      hp.g.gain.setTargetAtTime(rand(0.05, 0.1), this.ctx.currentTime, 0.2);
    }, 45);
  },
  city(out, h) {
    loopNoise(this, out, h, { buffer: 'brown', type: 'lowpass', freq: 380, gain: 0.45 });
    loopNoise(this, out, h, { buffer: 'pink', type: 'bandpass', freq: 900, q: 0.3, gain: 0.03 });
    h.timer = setInterval(() => {
      const t = this.ctx.currentTime;
      const r = Math.random();
      if (r < 0.025) { // distant horn
        this._tone(out, t, { type: 'sawtooth', freq: rand(330, 420), dur: rand(0.2, 0.5), peak: 0.012, attack: 0.03 });
      } else if (r < 0.03) { // siren swoop
        const o = this._osc('sine', 700); const g = this.ctx.createGain();
        for (let i = 0; i < 6; i++) { o.frequency.linearRampToValueAtTime(950, t + i * 0.9 + 0.45); o.frequency.linearRampToValueAtTime(700, t + i * 0.9 + 0.9); }
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.012, t + 1.5); g.gain.linearRampToValueAtTime(0.0001, t + 5.4);
        o.connect(g).connect(out); o.start(t); o.stop(t + 5.5);
      }
    }, 1000);
  },
  birds(out, h) {
    h.timer = setInterval(() => {
      if (Math.random() < 0.35) {
        const t = this.ctx.currentTime; const base = rand(2500, 4200); const n = Math.floor(rand(2, 6));
        for (let i = 0; i < n; i++) this._tone(out, t + i * rand(0.07, 0.12), { freq: base * rand(0.9, 1.15), freqEnd: base * rand(1.1, 1.5), dur: 0.06, peak: 0.03 });
      }
    }, 700);
  },
  tvchatter(out, h) {
    const { g, f } = loopNoise(this, out, h, { buffer: 'pink', type: 'bandpass', freq: 800, q: 1.5, gain: 0.2 });
    h.timer = setInterval(() => {
      const t = this.ctx.currentTime;
      g.gain.setTargetAtTime(Math.random() < 0.25 ? 0.02 : rand(0.1, 0.35), t, 0.04);
      f.frequency.setTargetAtTime(rand(500, 1400), t, 0.05);
    }, 140);
  },
  static(out, h) { loopNoise(this, out, h, { buffer: 'white', type: 'highpass', freq: 1000, gain: 0.15 }); },
  bubbling(out, h) {
    h.timer = setInterval(() => { if (Math.random() < 0.7) this._tone(out, this.ctx.currentTime, { freq: rand(300, 700), freqEnd: rand(800, 1400), dur: 0.04, peak: 0.08 }); }, 60);
  },
  kettle(out, h) {
    const o = this._osc('sine', 1800); const g = this.ctx.createGain(); g.gain.value = 0.0;
    o.connect(g).connect(out); o.start(); h.nodes.push(o, g);
    loopNoise(this, out, h, { buffer: 'pink', type: 'lowpass', freq: 600, gain: 0.3 });
    h.params.whistle = (v) => { g.gain.setTargetAtTime(v * 0.05, this.ctx.currentTime, 0.3); o.frequency.setTargetAtTime(1600 + v * 600, this.ctx.currentTime, 0.3); };
  },
  crackle(out, h) {
    h.timer = setInterval(() => {
      if (Math.random() < 0.5) this._noiseBurst(out, this.ctx.currentTime, { type: 'highpass', freq: rand(2000, 7000), dur: 0.005, peak: rand(0.03, 0.12) });
    }, 40);
  },
  fire(out, h) {
    loopNoise(this, out, h, { buffer: 'brown', type: 'lowpass', freq: 500, gain: 0.3 });
    LOOPS.crackle.call(this, out, h);
  },
  purr(out, h) {
    const { g } = loopNoise(this, out, h, { buffer: 'brown', type: 'lowpass', freq: 220, gain: 0.5 });
    const lfo = this._osc('sine', 24); const lg = this.ctx.createGain(); lg.gain.value = 0.3;
    lfo.connect(lg).connect(g.gain); lfo.start(); h.nodes.push(lfo, lg);
  },
  rcmotor(out, h) {
    const o = this._osc('sawtooth', 120); const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = this.ctx.createGain(); g.gain.value = 0.06; o.connect(f).connect(g).connect(out); o.start(); h.nodes.push(o, f, g);
    h.params.rate = (r) => { o.frequency.setTargetAtTime(90 + r * 260, this.ctx.currentTime, 0.05); g.gain.setTargetAtTime(0.03 + r * 0.07, this.ctx.currentTime, 0.05); };
  },
};

export { NOTE, clamp };
