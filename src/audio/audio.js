// Audio: recorded impact/whoosh/grunt/footstep samples (from the owner's "Last Stance"
// project), plus synthesized prison sounds (buzzer, PA chime, doors, whistle, crowd), voice
// blips and a small generative music bed whose intensity follows the action.

const BASE = 'assets/audio/';
export class AudioEngine {
  constructor() {
    this.ctx = null; this.ready = false;
    this.buffers = new Map(); this.manifest = null; this.loading = new Map();
    this.volumes = { master: 0.8, sfx: 0.9, music: 0.35, ambience: 0.6 };
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.intensity = 0; this.musicOn = true;
    this.lastPlay = new Map();
  }
  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.volumes.master;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = this.volumes.sfx; this.sfx.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.volumes.music; this.musicBus.connect(this.master);
    this.ambBus = c.createGain(); this.ambBus.gain.value = this.volumes.ambience; this.ambBus.connect(this.master);
    // Small room reverb for indoor spaces
    this.verb = c.createConvolver(); this.verb.buffer = this._impulse(1.6, 2.5);
    this.verbSend = c.createGain(); this.verbSend.gain.value = 0.18; this.verbSend.connect(this.verb).connect(this.master);
    this.noise = this._noiseBuffer(2);
    try { this.manifest = await (await fetch(BASE + 'manifest.json')).json(); } catch { this.manifest = {}; }
    for (const cat of ['punch_light', 'punch_heavy', 'kick', 'body_hit', 'block', 'whoosh_light', 'whoosh_heavy', 'body_fall', 'footstep', 'grunt_pain', 'grunt_attack', 'parry', 'metal_hit', 'club_hit', 'wood_break']) this._loadCat(cat);
    this.ready = true;
    this._startAmbience();
    this._musicTick();
  }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  setVolume(k, v) { this.volumes[k] = v; if (!this.ctx) return; const n = { master: this.master, sfx: this.sfx, music: this.musicBus, ambience: this.ambBus }[k]; if (n) n.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setListener(x, y, z, yaw) { this.listener.x = x; this.listener.y = y; this.listener.z = z; this.listener.yaw = yaw; }

  async _loadCat(cat) {
    if (this.loading.has(cat)) return this.loading.get(cat);
    const files = (this.manifest && this.manifest[cat]) || [];
    const p = Promise.all(files.map(async (f) => {
      try { const ab = await (await fetch(`${BASE}${cat}/${f}`)).arrayBuffer(); return await this.ctx.decodeAudioData(ab); } catch { return null; }
    })).then((bufs) => { this.buffers.set(cat, bufs.filter(Boolean)); return this.buffers.get(cat); });
    this.loading.set(cat, p);
    return p;
  }
  /** Gain and pan for a world position relative to the listener. */
  _spatial(pos, range = 28) {
    if (!pos) return { gain: 1, pan: 0 };
    const L = this.listener;
    const dx = pos.x - L.x, dz = pos.z - L.z, d = Math.hypot(dx, dz);
    const gain = Math.max(0, 1 - d / range) ** 1.6;
    const ang = Math.atan2(dx, dz) - L.yaw;
    return { gain, pan: Math.max(-1, Math.min(1, Math.sin(ang) * Math.min(1, d / 3))) };
  }
  _out(gainV, pan, bus = this.sfx, reverb = 0) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = gainV;
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) { p.pan.value = pan; g.connect(p).connect(bus); } else g.connect(bus);
    if (reverb > 0) { const s = c.createGain(); s.gain.value = reverb; g.connect(s).connect(this.verbSend); }
    return g;
  }
  /** Play a recorded sample from a category. */
  play(cat, opts = {}) {
    if (!this.ready || !this.ctx) return;
    const bufs = this.buffers.get(cat);
    if (!bufs || !bufs.length) { this._loadCat(cat); return; }
    const key = cat + (opts.key || '');
    const now = this.ctx.currentTime;
    if ((this.lastPlay.get(key) || 0) > now - (opts.minGap ?? 0.03)) return;
    this.lastPlay.set(key, now);
    const sp = this._spatial(opts.pos, opts.range);
    const vol = (opts.vol ?? 1) * sp.gain;
    if (vol < 0.01) return;
    const src = this.ctx.createBufferSource();
    src.buffer = bufs[Math.floor(Math.random() * bufs.length)];
    src.playbackRate.value = (opts.rate ?? 1) * (0.94 + Math.random() * 0.12);
    src.connect(this._out(vol, sp.pan, this.sfx, opts.indoor ? 0.6 : 0.15));
    src.start(now + (opts.delay || 0));
  }

  // ------------------------------------------------------------------ synthesized sounds
  _noiseBuffer(sec) {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  _impulse(sec, decay) {
    const c = this.ctx, len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  _tone(freq, dur, { type = 'sine', vol = 0.3, pos = null, attack = 0.005, release = null, bus = null, detune = 0, slide = null, delay = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const sp = this._spatial(pos);
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * sp.gain + 0.0001, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (release ?? dur));
    o.connect(g).connect(this._out(1, sp.pan, bus || this.sfx, 0.3));
    o.start(t); o.stop(t + (release ?? dur) + 0.05);
  }
  _noiseHit(dur, { vol = 0.3, freq = 1200, q = 1, type = 'bandpass', pos = null, slide = null, delay = 0, bus = null } = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const sp = this._spatial(pos);
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol * sp.gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this._out(1, sp.pan, bus || this.sfx, 0.4));
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  buzzer() { for (let i = 0; i < 2; i++) { this._tone(110, 0.9, { type: 'square', vol: 0.18, delay: i * 1.05, release: 0.9 }); this._tone(113, 0.9, { type: 'sawtooth', vol: 0.08, delay: i * 1.05, release: 0.9 }); } }
  chime() { this._tone(784, 0.6, { vol: 0.2, release: 0.9 }); this._tone(587, 0.8, { vol: 0.2, delay: 0.32, release: 1.1 }); }
  door(pos, closing) {
    this._noiseHit(0.5, { vol: 0.35, freq: 300, q: 0.7, type: 'lowpass', pos });
    this._tone(closing ? 95 : 120, 0.25, { type: 'square', vol: 0.12, pos, delay: closing ? 0.45 : 0, release: 0.3 });
    if (closing) this._noiseHit(0.25, { vol: 0.5, freq: 900, q: 2, pos, delay: 0.45 });
  }
  whistle(pos) { for (let i = 0; i < 2; i++) this._tone(2600, 0.22, { type: 'sine', vol: 0.18, pos, delay: i * 0.28, release: 0.24, detune: i * 40 }); }
  cheer(pos, vol = 0.3) { this._noiseHit(1.6, { vol, freq: 900, q: 0.6, pos, slide: 1300 }); }
  ui(kind = 'click') {
    if (!this.ctx) return;
    if (kind === 'click') this._tone(880, 0.06, { type: 'triangle', vol: 0.08, release: 0.07 });
    else if (kind === 'good') { this._tone(660, 0.12, { vol: 0.12 }); this._tone(990, 0.18, { vol: 0.12, delay: 0.09 }); }
    else if (kind === 'bad') this._tone(220, 0.25, { type: 'sawtooth', vol: 0.08, slide: 160 });
    else if (kind === 'coin') { this._tone(1320, 0.08, { type: 'square', vol: 0.05 }); this._tone(1760, 0.12, { type: 'square', vol: 0.05, delay: 0.07 }); }
    else if (kind === 'level') { [523, 659, 784].forEach((f, i) => this._tone(f, 0.18, { type: 'triangle', vol: 0.1, delay: i * 0.08 })); }
  }
  /** Gibberish speech blips with a per-character pitch. */
  voice(text, pitch = 1, pos = null, mood = 'neutral') {
    if (!this.ctx) return;
    const n = Math.min(10, Math.ceil(text.length / 7));
    const base = 150 * pitch * (mood === 'angry' ? 0.9 : mood === 'happy' ? 1.12 : 1);
    for (let i = 0; i < n; i++) this._tone(base * (0.85 + Math.random() * 0.4), 0.07, { type: 'triangle', vol: 0.07, pos, delay: i * 0.085, release: 0.075 });
  }

  // ------------------------------------------------------------------ ambience & music
  async _startAmbience() {
    const bufs = await this._loadCat('ambience');
    if (!bufs || !bufs.length) return;
    this.amb = bufs.map((b) => {
      const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0;
      s.connect(g).connect(this.ambBus); s.start();
      return g;
    });
    // Fluorescent hum
    const o = this.ctx.createOscillator(); o.frequency.value = 120; o.type = 'sine';
    const hg = this.ctx.createGain(); hg.gain.value = 0;
    o.connect(hg).connect(this.ambBus); o.start();
    this.hum = hg;
  }
  /** indoor 0..1, crowd ~ nearby people count, night 0..1 */
  setAmbience(indoor, crowd, night) {
    if (!this.amb) return;
    const t = this.ctx.currentTime;
    const crowdK = Math.min(1, crowd / 14);
    this.amb[0].gain.setTargetAtTime(0.12 + crowdK * 0.5 * (1 - night * 0.8), t, 0.8);
    if (this.amb[1]) this.amb[1].gain.setTargetAtTime((1 - indoor) * 0.35 + 0.05, t, 0.8);
    this.hum.gain.setTargetAtTime(indoor * 0.012, t, 0.5);
  }
  setIntensity(v) { this.intensity += (v - this.intensity) * 0.05; }
  _musicTick() {
    if (!this.ctx) return;
    const bpm = 84, beat = 60 / bpm;
    this.step = (this.step || 0) + 1;
    const s = this.step % 16, bar = Math.floor(this.step / 16) % 4;
    const I = this.intensity;
    if (this.musicOn && this.volumes.music > 0.01) {
      const chords = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
      const ch = chords[bar];
      const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
      if (s === 0 || s === 8) ch.forEach((m) => this._tone(mtof(m), beat * 3.5, { type: 'triangle', vol: 0.035, bus: this.musicBus, attack: 0.02, release: beat * 3.8 }));
      if (s % 4 === 0) this._tone(mtof(ch[0] - 24), beat * 0.9, { type: 'sine', vol: 0.12, bus: this.musicBus, release: beat * 0.9 });
      if (s % 8 === 6) this._tone(mtof(ch[1] - 24), beat * 0.5, { type: 'sine', vol: 0.08, bus: this.musicBus, release: beat * 0.5 });
      if (s % 8 === 0) this._tone(60, 0.25, { type: 'sine', vol: 0.18 + I * 0.15, bus: this.musicBus, slide: 35 });
      if (s % 8 === 4) this._noiseHit(0.15, { vol: 0.06 + I * 0.12, freq: 1800, q: 0.8, bus: this.musicBus });
      if (s % 2 === 1 || I > 0.4) this._noiseHit(0.04, { vol: 0.015 + I * 0.03, freq: 8000, q: 1, type: 'highpass', bus: this.musicBus });
      if (I > 0.5 && s % 4 === 2) this._tone(70, 0.15, { type: 'sine', vol: 0.12 * I, bus: this.musicBus, slide: 40 });
    }
    this._musicTimer = setTimeout(() => this._musicTick(), (beat / 2) * 1000);
  }
}
