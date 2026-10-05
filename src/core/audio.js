// Fully procedural audio: every sound effect, the ambience and the adaptive music are synthesized
// with the Web Audio API at runtime. No audio assets are loaded.

const rnd = (a, b) => a + Math.random() * (b - a);

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volumes = { master: 0.8, sfx: 0.9, music: 0.5 };
    this.listener = { x: 0, y: 0, z: 0 };
    this.active = 0;
    this.maxVoices = 56;
    this.lastPlayed = new Map();
    this.musicIntensity = 0; // 0 explore, 1 combat, 2 boss
    this.musicOn = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    this.master.connect(comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);

    // Dungeon reverb: generated impulse response, dark and long.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.8, 2.6);
    const revFilter = ctx.createBiquadFilter();
    revFilter.type = 'lowpass';
    revFilter.frequency.value = 3200;
    this.reverbIn = ctx.createGain();
    this.reverbIn.connect(this.reverb).connect(revFilter);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    revFilter.connect(revOut).connect(this.master);

    // noise buffers
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }

    this.distCurve = this._distortionCurve(30);
    this.applyVolumes();
    this.ready = true;
    this._startAmbience();
    this._startMusic();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfxBus.gain.value = this.volumes.sfx;
    this.musicBus.gain.value = this.volumes.music * 0.6;
  }

  setListener(pos, yaw) {
    if (!this.ready || !Number.isFinite(pos.x + pos.y + pos.z + yaw)) return;
    const l = this.ctx.listener;
    this.listener.x = pos.x;
    this.listener.y = pos.y;
    this.listener.z = pos.z;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(pos.x, t, 0.01);
      l.positionY.setTargetAtTime(pos.y, t, 0.01);
      l.positionZ.setTargetAtTime(pos.z, t, 0.01);
      l.forwardX.setTargetAtTime(fx, t, 0.01);
      l.forwardY.setTargetAtTime(0, t, 0.01);
      l.forwardZ.setTargetAtTime(fz, t, 0.01);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  // ---------- primitives ----------

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // early reflections cluster + exponential tail
        const er = i < ctx.sampleRate * 0.08 && Math.random() < 0.02 ? 2 : 1;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * er;
      }
    }
    return buf;
  }

  _distortionCurve(k) {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // Creates the output chain for one sound. Returns null if the sound should be culled.
  _voice(pos, vol = 1, reverb = 0.25, dur = 1, key = null, minGap = 0.03) {
    if (!this.ready || this.ctx.state !== 'running') return null;
    if (this.active >= this.maxVoices) return null;
    if (key) {
      const now = this.ctx.currentTime;
      const last = this.lastPlayed.get(key) || 0;
      if (now - last < minGap) return null;
      this.lastPlayed.set(key, now);
    }
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = vol;
    let tail = out;
    if (pos) {
      const dx = pos.x - this.listener.x, dy = pos.y - this.listener.y, dz = pos.z - this.listener.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 50 * 50) return null;
      const p = ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = 3;
      p.maxDistance = 60;
      p.rolloffFactor = 1.1;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      out.connect(p);
      tail = p;
    }
    tail.connect(this.sfxBus);
    let send = null;
    if (reverb > 0) {
      send = ctx.createGain();
      send.gain.value = reverb;
      tail.connect(send);
      send.connect(this.reverbIn);
    }
    this.active++;
    setTimeout(() => {
      out.disconnect();
      if (tail !== out) tail.disconnect();
      if (send) send.disconnect();
      this.active--;
    }, (dur + 0.4) * 1000);
    return { out, t: ctx.currentTime + 0.005 };
  }

  _osc(v, type, f0, f1, t0, dur, peak, attack = 0.004, curve = 'exp') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      else o.frequency.linearRampToValueAtTime(f1, t0 + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);
    o.connect(g).connect(v.out);
    o.start(t0);
    o.stop(t0 + attack + dur + 0.05);
    return { o, g };
  }

  // Filtered noise burst. filter: {type, f0, f1, q}
  _noise(v, t0, dur, peak, filter, attack = 0.003, brown = false, dest = null) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.white;
    src.playbackRate.value = rnd(0.9, 1.1);
    const off = Math.random() * 1.5;
    let node = src;
    let f = null;
    if (filter) {
      f = ctx.createBiquadFilter();
      f.type = filter.type || 'bandpass';
      f.Q.value = filter.q ?? 1;
      f.frequency.setValueAtTime(filter.f0, t0);
      if (filter.f1) f.frequency.exponentialRampToValueAtTime(filter.f1, t0 + dur + attack);
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);
    node.connect(g).connect(dest || v.out);
    src.start(t0, off);
    src.stop(t0 + attack + dur + 0.05);
    return { src, g, f };
  }

  _metal(v, t0, f0, ring, peak) {
    const ratios = [1, 2.76, 5.4, 8.93, 13.34];
    const amps = [1, 0.55, 0.38, 0.22, 0.12];
    const decs = [1.0, 0.7, 0.45, 0.3, 0.18];
    for (let i = 0; i < ratios.length; i++) {
      const f = f0 * ratios[i] * rnd(0.995, 1.005);
      if (f > 16000) continue;
      this._osc(v, 'sine', f, f, t0, ring * decs[i], peak * amps[i], 0.002);
    }
  }

  // ---------- combat ----------

  swing(weight = 1, pitch = 1) {
    const dur = 0.16 + weight * 0.08;
    const v = this._voice(null, 0.55, 0.12, dur, 'swing', 0.04);
    if (!v) return;
    const p = pitch * rnd(0.9, 1.12);
    this._noise(v, v.t, dur, 0.9, { type: 'bandpass', f0: 380 * p, f1: 1700 * p / weight, q: 1.4 }, dur * 0.45);
    this._noise(v, v.t + dur * 0.2, dur * 0.6, 0.25, { type: 'highpass', f0: 3000 * p, f1: 5000 * p, q: 0.7 }, dur * 0.25);
  }

  hitFlesh(pos, power = 1) {
    const v = this._voice(pos, 0.9, 0.2, 0.5, 'flesh', 0.02);
    if (!v) return;
    const t = v.t;
    this._osc(v, 'sine', 140 * rnd(0.9, 1.1), 42, t, 0.14 + power * 0.06, 0.9 * Math.min(1.4, power));
    this._noise(v, t, 0.1 + power * 0.04, 0.7, { type: 'lowpass', f0: 3200, f1: 500, q: 0.8 });
    this._noise(v, t + 0.01, 0.16, 0.35 * power, { type: 'bandpass', f0: 1100, f1: 260, q: 5 });
  }

  hitBone(pos, power = 1) {
    const v = this._voice(pos, 0.8, 0.22, 0.4, 'bone', 0.02);
    if (!v) return;
    const t = v.t;
    this._noise(v, t, 0.06, 0.9, { type: 'bandpass', f0: 2600, f1: 1500, q: 2.5 });
    this._osc(v, 'square', 320 * rnd(0.8, 1.2), 160, t, 0.04, 0.15);
    this._osc(v, 'sine', 110, 50, t, 0.1, 0.5 * power);
    for (let i = 0; i < 3; i++) this._noise(v, t + 0.03 + i * rnd(0.02, 0.05), 0.025, 0.3, { type: 'bandpass', f0: rnd(1800, 3500), q: 4 });
  }

  clang(pos, pitch = 1, ring = 1, vol = 0.8) {
    const v = this._voice(pos, vol, 0.4, 1.4 * ring, 'clang', 0.03);
    if (!v) return;
    this._noise(v, v.t, 0.04, 0.8, { type: 'highpass', f0: 2500, q: 0.7 });
    this._metal(v, v.t, 560 * pitch * rnd(0.97, 1.03), 0.5 * ring, 0.32);
  }

  parry(pos) {
    const v = this._voice(pos, 1.0, 0.7, 2.2, 'parry', 0.05);
    if (!v) return;
    this._noise(v, v.t, 0.05, 1, { type: 'highpass', f0: 2000, q: 0.5 });
    this._metal(v, v.t, 740 * rnd(0.98, 1.02), 1.4, 0.36);
    this._metal(v, v.t + 0.01, 1110, 1.0, 0.18);
    this._osc(v, 'sine', 90, 45, v.t, 0.25, 0.7);
  }

  block(pos) {
    const v = this._voice(pos, 0.8, 0.3, 0.7, 'block', 0.04);
    if (!v) return;
    this._noise(v, v.t, 0.07, 0.8, { type: 'bandpass', f0: 1800, f1: 700, q: 1.2 });
    this._metal(v, v.t, 380 * rnd(0.95, 1.05), 0.35, 0.25);
    this._osc(v, 'sine', 120, 50, v.t, 0.12, 0.6);
  }

  wallHit(pos) {
    const v = this._voice(pos, 0.75, 0.35, 0.6, 'wall', 0.06);
    if (!v) return;
    this._noise(v, v.t, 0.09, 0.9, { type: 'lowpass', f0: 2200, f1: 400, q: 0.8 });
    this._metal(v, v.t, 900 * rnd(0.9, 1.1), 0.22, 0.16);
    this._osc(v, 'sine', 95, 50, v.t, 0.09, 0.5);
  }

  woodHit(pos, breaking = false) {
    const v = this._voice(pos, 0.85, 0.25, 0.6, 'wood', 0.03);
    if (!v) return;
    const t = v.t;
    this._noise(v, t, 0.09, 0.9, { type: 'bandpass', f0: 900, f1: 450, q: 1.8 });
    this._osc(v, 'triangle', 190 * rnd(0.9, 1.1), 110, t, 0.09, 0.45);
    if (breaking) {
      for (let i = 0; i < 5; i++) {
        this._noise(v, t + 0.02 + i * rnd(0.015, 0.05), 0.05, 0.55, { type: 'bandpass', f0: rnd(600, 2400), q: 3 });
      }
      this._osc(v, 'sine', 80, 40, t, 0.2, 0.6);
    }
  }

  potteryBreak(pos) {
    const v = this._voice(pos, 0.8, 0.3, 0.6, 'pot', 0.03);
    if (!v) return;
    for (let i = 0; i < 7; i++) {
      this._noise(v, v.t + i * rnd(0.01, 0.04), 0.06, 0.5, { type: 'bandpass', f0: rnd(2000, 5000), q: 5 });
      this._osc(v, 'sine', rnd(1500, 3500), null, v.t + i * 0.02, 0.05, 0.08);
    }
    this._noise(v, v.t, 0.12, 0.5, { type: 'lowpass', f0: 1500, q: 0.7 });
  }

  kick(pos, hit) {
    const v = this._voice(pos, 0.9, 0.2, 0.4, 'kick', 0.05);
    if (!v) return;
    this._noise(v, v.t, 0.12, 0.5, { type: 'bandpass', f0: 300, f1: 900, q: 1 }, 0.06);
    if (hit) {
      this._osc(v, 'sine', 110, 38, v.t + 0.05, 0.18, 1.1);
      this._noise(v, v.t + 0.05, 0.09, 0.8, { type: 'lowpass', f0: 1200, f1: 300, q: 0.8 });
    }
  }

  gore(pos, power = 1) {
    const v = this._voice(pos, 0.8, 0.25, 0.8, 'gore', 0.04);
    if (!v) return;
    const t = v.t;
    this._noise(v, t, 0.3, 0.6 * power, { type: 'bandpass', f0: 700, f1: 160, q: 4 }, 0.01);
    this._noise(v, t + 0.06, 0.22, 0.4, { type: 'lowpass', f0: 900, f1: 200, q: 3 }, 0.02);
    // bone crack
    this._noise(v, t, 0.03, 0.9, { type: 'highpass', f0: 2500, q: 1 });
    this._osc(v, 'sine', 70, 35, t, 0.2, 0.7 * power);
  }

  splat(pos) {
    const v = this._voice(pos, 0.35, 0.1, 0.2, 'splat', 0.05);
    if (!v) return;
    this._noise(v, v.t, 0.08, 0.6, { type: 'bandpass', f0: rnd(500, 900), f1: 200, q: 3 });
  }

  slimeHit(pos, big = false) {
    const v = this._voice(pos, 0.8, 0.25, 0.5, 'slime', 0.03);
    if (!v) return;
    this._osc(v, 'sine', big ? 180 : 320, big ? 60 : 120, v.t, 0.18, 0.7);
    this._noise(v, v.t, 0.2, 0.5, { type: 'bandpass', f0: 600, f1: 180, q: 6 });
  }

  // ---------- movement ----------

  footstep(surface = 'stone', vol = 1) {
    const v = this._voice(null, 0.22 * vol, 0.08, 0.15);
    if (!v) return;
    if (surface === 'water') {
      this._noise(v, v.t, 0.12, 0.7, { type: 'bandpass', f0: 1200, f1: 500, q: 2 });
      return;
    }
    this._noise(v, v.t, 0.05, 0.8, { type: 'lowpass', f0: rnd(500, 800), q: 0.7 }, 0.002, true);
    this._noise(v, v.t, 0.03, 0.2, { type: 'bandpass', f0: rnd(2000, 3000), q: 2 });
  }

  land(power = 1) {
    const v = this._voice(null, 0.5 * power, 0.1, 0.3);
    if (!v) return;
    this._osc(v, 'sine', 90, 40, v.t, 0.12, 0.8);
    this._noise(v, v.t, 0.08, 0.6, { type: 'lowpass', f0: 900, q: 0.7 }, 0.002, true);
  }

  dodge() {
    const v = this._voice(null, 0.5, 0.1, 0.35, 'dodge', 0.1);
    if (!v) return;
    this._noise(v, v.t, 0.3, 0.8, { type: 'bandpass', f0: 250, f1: 900, q: 0.9 }, 0.08);
    this._noise(v, v.t + 0.05, 0.12, 0.25, { type: 'highpass', f0: 2500, q: 0.6 }, 0.04);
  }

  jump() {
    const v = this._voice(null, 0.25, 0.05, 0.2);
    if (!v) return;
    this._noise(v, v.t, 0.08, 0.5, { type: 'bandpass', f0: 400, f1: 800, q: 1 }, 0.02);
  }

  // ---------- voices ----------

  _formant(v, t, f0, f1, dur, formants, peak, wave = 'sawtooth', distort = false) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    // vibrato
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rnd(5, 8);
    const lg = ctx.createGain();
    lg.gain.value = f0 * 0.03;
    lfo.connect(lg).connect(o.frequency);
    let src = o;
    if (distort) {
      const ws = ctx.createWaveShaper();
      ws.curve = this.distCurve;
      o.connect(ws);
      src = ws;
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.03);
    g.gain.setValueAtTime(peak, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [ff, q, a] of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = ff;
      bp.Q.value = q;
      const fg = ctx.createGain();
      fg.gain.value = a;
      src.connect(bp).connect(fg).connect(g);
    }
    g.connect(v.out);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  voice(pos, kind, mood) {
    // kind: skeleton, goblin, brute, ghoul, cultist, knight, boss, bat, imp
    const durMap = { alert: 0.45, attack: 0.3, hurt: 0.2, death: 0.8, roar: 1.6 };
    const dur = durMap[mood] || 0.3;
    const v = this._voice(pos, 0.7, 0.35, dur + 0.2, 'voice' + kind + mood, 0.12);
    if (!v) return;
    const t = v.t;
    const ah = [[700, 6, 1], [1150, 8, 0.6], [2600, 10, 0.25]];
    const uh = [[550, 6, 1], [900, 8, 0.5], [2400, 10, 0.2]];
    const ee = [[300, 6, 0.8], [2300, 9, 0.7], [3000, 10, 0.3]];
    switch (kind) {
      case 'skeleton': {
        const n = mood === 'death' ? 9 : 4;
        for (let i = 0; i < n; i++) this._noise(v, t + i * rnd(0.03, 0.07), 0.03, 0.6, { type: 'bandpass', f0: rnd(1500, 4000), q: 5 });
        if (mood !== 'hurt') this._noise(v, t, dur, 0.15, { type: 'bandpass', f0: 500, f1: 300, q: 8 }, 0.05);
        break;
      }
      case 'goblin':
      case 'imp': {
        const p = rnd(320, 420) * (kind === 'imp' ? 1.4 : 1);
        const end = mood === 'death' ? p * 0.5 : mood === 'attack' ? p * 1.5 : p * 1.2;
        this._formant(v, t, p, end, dur, mood === 'attack' ? ee : ah, 0.6);
        break;
      }
      case 'brute':
      case 'boss': {
        const p = kind === 'boss' ? rnd(55, 70) : rnd(75, 95);
        const end = mood === 'death' ? p * 0.55 : p * 0.85;
        this._formant(v, t, p, end, dur * (kind === 'boss' ? 1.3 : 1), uh, 0.9, 'sawtooth', true);
        this._noise(v, t, dur, 0.25, { type: 'lowpass', f0: 600, q: 1 }, 0.05, true);
        break;
      }
      case 'ghoul': {
        this._noise(v, t, dur, 0.7, { type: 'bandpass', f0: 1400, f1: 700, q: 3 }, 0.04);
        this._formant(v, t, rnd(140, 180), 90, dur, uh, 0.25, 'sawtooth', true);
        break;
      }
      case 'cultist': {
        this._noise(v, t, dur, 0.5, { type: 'bandpass', f0: 2200, f1: 1200, q: 4 }, 0.08);
        this._formant(v, t, rnd(110, 130), 90, dur, ah, 0.3, 'triangle');
        break;
      }
      case 'knight': {
        this._formant(v, t, rnd(100, 120), mood === 'death' ? 60 : 95, dur, uh, 0.5, 'sawtooth');
        this._metal(v, t, 300, 0.15, 0.06);
        break;
      }
      case 'bat': {
        this._osc(v, 'sine', rnd(3500, 5000), 2500, t, 0.08, 0.2);
        break;
      }
      case 'slime': {
        this._osc(v, 'sine', 220, 90, t, dur, 0.5);
        this._noise(v, t, dur, 0.4, { type: 'bandpass', f0: 500, f1: 200, q: 6 });
        break;
      }
      default:
        this._formant(v, t, 150, 100, dur, uh, 0.5);
    }
  }

  playerHurt(power = 1) {
    const v = this._voice(null, 0.6, 0.15, 0.35, 'phurt', 0.15);
    if (!v) return;
    this._formant(v, v.t, rnd(150, 175), 105, 0.2, [[600, 6, 1], [1000, 8, 0.5], [2500, 10, 0.2]], 0.5);
    this._osc(v, 'sine', 100, 40, v.t, 0.15, 0.7 * power);
  }

  heartbeat(vol = 1) {
    const v = this._voice(null, 0.6 * vol, 0.05, 0.6);
    if (!v) return;
    this._osc(v, 'sine', 60, 40, v.t, 0.1, 0.9);
    this._osc(v, 'sine', 55, 38, v.t + 0.22, 0.12, 0.7);
  }

  // ---------- items & world ----------

  coin(pos) {
    const v = this._voice(pos, 0.35, 0.2, 0.35, 'coin', 0.035);
    if (!v) return;
    const p = rnd(0.95, 1.1);
    this._osc(v, 'sine', 2100 * p, null, v.t, 0.12, 0.5);
    this._osc(v, 'sine', 2800 * p, null, v.t + 0.06, 0.18, 0.45);
    this._osc(v, 'triangle', 4200 * p, null, v.t, 0.05, 0.1);
  }

  pickup(rarity = 0) {
    const v = this._voice(null, 0.55, 0.45, 1.6, 'pickup', 0.05);
    if (!v) return;
    const base = 440 * Math.pow(2, rarity / 12);
    const notes = [0, 4, 7, 12, 16, 19].slice(0, 3 + rarity);
    notes.forEach((n, i) => {
      const f = base * Math.pow(2, n / 12);
      this._osc(v, 'triangle', f, null, v.t + i * 0.055, 0.35 + rarity * 0.12, 0.28);
      if (rarity >= 3) this._osc(v, 'sine', f * 2.005, null, v.t + i * 0.055, 0.6, 0.08);
    });
    if (rarity >= 4) this._noise(v, v.t, 1.2, 0.12, { type: 'highpass', f0: 6000, q: 0.5 }, 0.3);
  }

  relic() {
    const v = this._voice(null, 0.7, 0.6, 2.8, 'relic', 0.3);
    if (!v) return;
    const chord = [261.6, 329.6, 392, 523.3, 659.3];
    chord.forEach((f, i) => {
      this._osc(v, 'triangle', f, null, v.t + i * 0.07, 1.6, 0.18, 0.05);
      this._osc(v, 'sine', f * 2, null, v.t + 0.3 + i * 0.07, 1.4, 0.07, 0.1);
    });
    this._noise(v, v.t, 1.6, 0.1, { type: 'highpass', f0: 7000, q: 0.5 }, 0.5);
  }

  secret() {
    const v = this._voice(null, 0.6, 0.5, 1.6, 'secret', 0.5);
    if (!v) return;
    [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => this._osc(v, 'triangle', f, null, v.t + i * 0.09, 0.5, 0.25));
  }

  potion() {
    const v = this._voice(null, 0.6, 0.15, 1.0);
    if (!v) return;
    for (let i = 0; i < 3; i++) {
      const t = v.t + i * 0.16;
      this._noise(v, t, 0.08, 0.6, { type: 'lowpass', f0: 500, q: 4 });
      this._osc(v, 'sine', rnd(180, 260), 120, t, 0.07, 0.4);
    }
    this._osc(v, 'sine', 500, 1500, v.t + 0.5, 0.4, 0.15, 0.1, 'lin');
  }

  equip() {
    const v = this._voice(null, 0.5, 0.15, 0.4);
    if (!v) return;
    this._metal(v, v.t, 900, 0.2, 0.12);
    this._noise(v, v.t, 0.1, 0.4, { type: 'bandpass', f0: 1200, q: 1 });
  }

  ui(kind = 'click') {
    const v = this._voice(null, 0.3, 0.05, 0.25, 'ui' + kind, 0.03);
    if (!v) return;
    if (kind === 'click') this._osc(v, 'triangle', 900, 700, v.t, 0.05, 0.4);
    else if (kind === 'hover') this._osc(v, 'sine', 1300, null, v.t, 0.03, 0.15);
    else if (kind === 'deny') {
      this._osc(v, 'square', 160, 120, v.t, 0.12, 0.2);
      this._osc(v, 'square', 150, 110, v.t + 0.12, 0.14, 0.2);
    } else if (kind === 'open') {
      this._osc(v, 'triangle', 500, 800, v.t, 0.08, 0.3, 0.004, 'lin');
    }
  }

  buy() {
    this.coin(null);
    const v = this._voice(null, 0.5, 0.3, 0.6);
    if (!v) return;
    [660, 880, 1320].forEach((f, i) => this._osc(v, 'triangle', f, null, v.t + 0.05 + i * 0.06, 0.25, 0.25));
  }

  chestOpen(pos) {
    const v = this._voice(pos, 0.7, 0.35, 1.2);
    if (!v) return;
    this._noise(v, v.t, 0.03, 0.8, { type: 'bandpass', f0: 2500, q: 3 });
    this._creak(v, v.t + 0.05, 0.6, 180);
    this._metal(v, v.t + 0.6, 700, 0.3, 0.08);
  }

  _creak(v, t, dur, f) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t);
    for (let i = 1; i < 8; i++) o.frequency.linearRampToValueAtTime(f * rnd(0.7, 1.5), t + (dur * i) / 8);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp).connect(g).connect(v.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  door(pos, kicked = false) {
    const v = this._voice(pos, 0.8, 0.4, 1.2, 'door', 0.1);
    if (!v) return;
    if (kicked) {
      this._osc(v, 'sine', 100, 40, v.t, 0.25, 1);
      this._noise(v, v.t, 0.18, 0.9, { type: 'lowpass', f0: 1800, f1: 300, q: 0.8 });
      for (let i = 0; i < 4; i++) this._noise(v, v.t + i * 0.03, 0.05, 0.4, { type: 'bandpass', f0: rnd(700, 2000), q: 3 });
    } else this._creak(v, v.t, 0.7, 140);
  }

  unlock(pos) {
    const v = this._voice(pos, 0.7, 0.3, 0.6);
    if (!v) return;
    this._metal(v, v.t, 1400, 0.15, 0.2);
    this._noise(v, v.t + 0.12, 0.05, 0.6, { type: 'bandpass', f0: 3000, q: 3 });
    this._metal(v, v.t + 0.15, 900, 0.3, 0.2);
  }

  gate(pos, closing = true) {
    const v = this._voice(pos, 0.9, 0.6, 1.6, 'gate', 0.2);
    if (!v) return;
    for (let i = 0; i < 10; i++) this._noise(v, v.t + i * 0.04, 0.03, 0.25, { type: 'bandpass', f0: rnd(2500, 4500), q: 6 });
    const tt = v.t + (closing ? 0.4 : 0.05);
    this._osc(v, 'sine', 70, 35, tt, 0.4, 1);
    this._metal(v, tt, 220, 0.6, 0.18);
    this._noise(v, tt, 0.4, 0.6, { type: 'lowpass', f0: 800, f1: 150, q: 0.7 }, 0.002, true);
  }

  explosion(pos, size = 1) {
    const v = this._voice(pos, 1.0 * Math.min(1.3, size), 0.6, 2.0, 'boom', 0.05);
    if (!v) return;
    const t = v.t;
    this._noise(v, t, 1.4 * size, 1.2, { type: 'lowpass', f0: 2500, f1: 120, q: 0.6 }, 0.004, true);
    this._noise(v, t, 0.25, 0.8, { type: 'lowpass', f0: 5000, f1: 800, q: 0.5 });
    this._osc(v, 'sine', 75, 28, t, 0.7 * size, 1.2);
    for (let i = 0; i < 6; i++) this._noise(v, t + 0.1 + Math.random() * 0.5, 0.03, 0.2, { type: 'highpass', f0: 3000, q: 1 });
  }

  fire(pos, big = false) {
    const v = this._voice(pos, 0.6, 0.3, 0.8, 'fire', 0.06);
    if (!v) return;
    this._noise(v, v.t, big ? 0.7 : 0.35, 0.8, { type: 'bandpass', f0: 300, f1: big ? 1400 : 900, q: 0.8 }, 0.05, true);
    this._noise(v, v.t, 0.3, 0.3, { type: 'highpass', f0: 3000, q: 0.6 }, 0.03);
  }

  zap(pos) {
    const v = this._voice(pos, 0.5, 0.3, 0.5, 'zap', 0.05);
    if (!v) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    for (let i = 0; i < 10; i++) o.frequency.setValueAtTime(rnd(80, 1600), v.t + i * 0.025);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, v.t);
    g.gain.exponentialRampToValueAtTime(0.0001, v.t + 0.3);
    o.connect(g).connect(v.out);
    o.start(v.t);
    o.stop(v.t + 0.32);
    this._noise(v, v.t, 0.25, 0.5, { type: 'highpass', f0: 4000, q: 0.5 });
  }

  freeze(pos) {
    const v = this._voice(pos, 0.5, 0.4, 0.8, 'freeze', 0.08);
    if (!v) return;
    for (let i = 0; i < 6; i++) this._osc(v, 'sine', rnd(2500, 5000), null, v.t + i * 0.03, 0.2, 0.12);
    this._noise(v, v.t, 0.3, 0.4, { type: 'highpass', f0: 5000, q: 1 });
  }

  poison(pos) {
    const v = this._voice(pos, 0.4, 0.2, 0.5, 'poison', 0.1);
    if (!v) return;
    for (let i = 0; i < 4; i++) this._osc(v, 'sine', rnd(300, 600), rnd(700, 1100), v.t + i * 0.07, 0.06, 0.2);
  }

  bowShoot(pos) {
    const v = this._voice(pos, 0.6, 0.25, 0.4, 'bow', 0.05);
    if (!v) return;
    this._osc(v, 'triangle', 220, 180, v.t, 0.15, 0.4);
    this._noise(v, v.t, 0.03, 0.5, { type: 'bandpass', f0: 2000, q: 2 });
    this._noise(v, v.t + 0.02, 0.2, 0.25, { type: 'bandpass', f0: 1500, f1: 3000, q: 2 }, 0.05);
  }

  thunk(pos) {
    const v = this._voice(pos, 0.6, 0.2, 0.3, 'thunk', 0.04);
    if (!v) return;
    this._osc(v, 'triangle', 300, 120, v.t, 0.06, 0.5);
    this._noise(v, v.t, 0.05, 0.5, { type: 'bandpass', f0: 1200, q: 2 });
  }

  cast(pos, kind = 'fire') {
    const v = this._voice(pos, 0.55, 0.35, 0.8, 'cast', 0.08);
    if (!v) return;
    if (kind === 'fire') {
      this._noise(v, v.t, 0.4, 0.8, { type: 'bandpass', f0: 200, f1: 1500, q: 1 }, 0.1, true);
    } else {
      this._osc(v, 'sine', 300, 900, v.t, 0.3, 0.3, 0.05);
      this._osc(v, 'sine', 450, 1350, v.t, 0.3, 0.2, 0.05);
    }
  }

  trap(pos, kind = 'click') {
    const v = this._voice(pos, 0.7, 0.3, 0.5, 'trap' + kind, 0.05);
    if (!v) return;
    if (kind === 'click') {
      this._noise(v, v.t, 0.02, 0.7, { type: 'bandpass', f0: 2500, q: 4 });
      this._osc(v, 'square', 600, 300, v.t, 0.03, 0.15);
    } else if (kind === 'spikes') {
      this._noise(v, v.t, 0.15, 0.8, { type: 'highpass', f0: 2000, f1: 6000, q: 1 });
      this._metal(v, v.t, 1300, 0.25, 0.1);
    } else if (kind === 'blade') {
      this._noise(v, v.t, 0.4, 0.5, { type: 'bandpass', f0: 300, f1: 1200, q: 1.5 }, 0.15);
    }
  }

  stairs() {
    const v = this._voice(null, 0.8, 0.6, 2.5);
    if (!v) return;
    this._noise(v, v.t, 2.0, 0.7, { type: 'lowpass', f0: 1200, f1: 100, q: 0.7 }, 0.3, true);
    this._osc(v, 'sine', 110, 40, v.t, 2.0, 0.5, 0.3);
  }

  bossIntro() {
    const v = this._voice(null, 0.9, 0.7, 3.5);
    if (!v) return;
    this._osc(v, 'sawtooth', 55, 41, v.t, 2.8, 0.25, 0.3);
    this._osc(v, 'sawtooth', 82.4, 61, v.t, 2.8, 0.15, 0.3);
    this._osc(v, 'sine', 40, 30, v.t, 3, 0.8, 0.1);
    this._noise(v, v.t, 2.5, 0.4, { type: 'lowpass', f0: 400, f1: 100, q: 1 }, 0.4, true);
  }

  victory() {
    const v = this._voice(null, 0.7, 0.6, 3.5);
    if (!v) return;
    const seq = [[392, 0], [523.3, 0.15], [659.3, 0.3], [784, 0.45], [1046.5, 0.7]];
    seq.forEach(([f, d]) => this._osc(v, 'triangle', f, null, v.t + d, 1.4, 0.22, 0.02));
  }

  death() {
    const v = this._voice(null, 0.9, 0.7, 4);
    if (!v) return;
    this._osc(v, 'sawtooth', 110, 55, v.t, 3, 0.12, 0.2);
    this._osc(v, 'sawtooth', 130.8, 65, v.t, 3, 0.1, 0.2);
    this._osc(v, 'sine', 55, 27, v.t, 3, 0.6, 0.05);
  }

  levelUp() {
    const v = this._voice(null, 0.6, 0.5, 1.4);
    if (!v) return;
    [392, 493.9, 587.3, 784].forEach((f, i) => this._osc(v, 'square', f, null, v.t + i * 0.08, 0.3, 0.08));
    [784, 987.8].forEach((f) => this._osc(v, 'triangle', f, null, v.t + 0.35, 0.9, 0.2));
  }

  // ---------- ambience & adaptive music ----------

  _startAmbience() {
    const ctx = this.ctx;
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.0;
    this.ambBus.connect(this.musicBus);
    // low wind drone
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.value = 0.35;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 120;
    lfo.connect(lg).connect(lp.frequency);
    src.connect(lp).connect(g).connect(this.ambBus);
    src.start();
    lfo.start();
    this.ambBus.gain.linearRampToValueAtTime(1, ctx.currentTime + 3);

    const drip = () => {
      if (!this.ready) return;
      if (this.ctx.state === 'running' && this.musicOn) {
        const v = this._voice({ x: this.listener.x + rnd(-15, 15), y: 2, z: this.listener.z + rnd(-15, 15) }, 0.25, 0.9, 1.0);
        if (v) {
          if (Math.random() < 0.8) {
            const f = rnd(900, 1800);
            this._osc(v, 'sine', f, f * 0.6, v.t, 0.08, 0.5);
          } else {
            // distant rumble / chains
            this._noise(v, v.t, 1.2, 0.5, { type: 'lowpass', f0: 300, f1: 80, q: 1 }, 0.4, true);
          }
        }
      }
      setTimeout(drip, rnd(1500, 6000));
    };
    setTimeout(drip, 2000);
  }

  _startMusic() {
    const ctx = this.ctx;
    // Drone pad layer
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 500;
    padFilter.Q.value = 0.7;
    this.padFilter = padFilter;
    padFilter.connect(this.padGain).connect(this.musicBus);
    const padSend = ctx.createGain();
    padSend.gain.value = 0.4;
    this.padGain.connect(padSend).connect(this.reverbIn);
    this.padOscs = [];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = i < 2 ? 'sawtooth' : 'triangle';
      o.frequency.value = 55;
      o.detune.value = (i - 1.5) * 7;
      const g = ctx.createGain();
      g.gain.value = i < 2 ? 0.08 : 0.12;
      o.connect(g).connect(padFilter);
      o.start();
      this.padOscs.push(o);
    }
    // Percussion layer gain
    this.percGain = ctx.createGain();
    this.percGain.gain.value = 0;
    this.percGain.connect(this.musicBus);

    this.musicStep = 0;
    this.nextNote = ctx.currentTime + 0.2;
    // A minor-ish progression in root frequencies (A1, F1, D2, E1)
    this.prog = [55, 43.65, 73.42, 41.2];
    this.progIdx = 0;
    this.musicTimer = setInterval(() => this._scheduleMusic(), 90);
  }

  _scheduleMusic() {
    if (!this.ready || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const intensity = this.musicOn ? this.musicIntensity : -1;
    const now = ctx.currentTime;
    // layer gains
    const padTarget = intensity < 0 ? 0 : intensity === 0 ? 0.55 : 0.7;
    const percTarget = intensity >= 1 ? (intensity >= 2 ? 0.9 : 0.6) : 0;
    this.padGain.gain.setTargetAtTime(padTarget, now, 1.5);
    this.percGain.gain.setTargetAtTime(percTarget, now, intensity >= 1 ? 0.3 : 2.0);
    this.padFilter.frequency.setTargetAtTime(intensity >= 2 ? 1100 : intensity >= 1 ? 800 : 420, now, 1.0);

    const bpm = intensity >= 2 ? 132 : 104;
    const step = 60 / bpm / 2; // eighth notes
    while (this.nextNote < now + 0.3) {
      const t = this.nextNote;
      const s = this.musicStep % 32;
      if (s === 0) {
        if (this.musicStep % 64 === 0 || intensity >= 1) this.progIdx = (this.progIdx + 1) % this.prog.length;
        const root = this.prog[this.progIdx];
        this.padOscs.forEach((o, i) => {
          const mult = i === 3 ? 1.5 : i === 2 ? 2 : 1; // root, root, octave, fifth
          o.frequency.setTargetAtTime(root * mult, t, 0.6);
        });
      }
      if (intensity >= 1) this._percStep(t, s, intensity);
      this.nextNote += step;
      this.musicStep++;
    }
  }

  _percStep(t, s, intensity) {
    const ctx = this.ctx;
    const out = this.percGain;
    const drum = (f0, f1, dur, peak) => {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const hat = (peak, dur) => {
      const src = ctx.createBufferSource();
      src.buffer = this.white;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random());
      src.stop(t + dur + 0.02);
    };
    const pat = s % 16;
    // taiko-like low drums
    if (pat === 0 || pat === 6 || pat === 10 || (intensity >= 2 && (pat === 3 || pat === 13))) drum(120, 45, 0.45, 0.55);
    if (pat === 4 || pat === 12) drum(220, 90, 0.25, 0.35);
    if (intensity >= 2 && pat % 2 === 1) hat(0.06, 0.04);
    if (pat % 4 === 2) hat(0.05, 0.06);
    // pulsing bass on the root
    if (pat % 4 === 0) {
      const root = this.prog[this.progIdx] * 2;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = root;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(120, t + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(f).connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.4);
    }
  }

  setMusic(on, intensity = 0) {
    this.musicOn = on;
    this.musicIntensity = intensity;
  }
}

export const audio = new AudioSystem();
