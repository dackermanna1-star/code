// Procedural sound: everything is synthesised with Web Audio, triggered by
// simulation events and positioned by where they happen on screen. Slow
// motion lowers pitch; a crowd bed follows how many enemies are around.

import { clamp } from '../core/math.js';

const VOWELS = {
  uh: [620, 1180],
  ah: [800, 1250],
  oh: [470, 860],
  eh: [560, 1750],
};

export class AudioEngine {
  constructor() {
    this.ac = null;
    this.ready = false;
    this.volume = 0.7;
    this.muted = true;
    this.active = new Map();
    this.lastAt = new Map();
    this.timeScale = 1;
    this.theme = 'facility';
  }

  // Must be called from a user gesture.
  init() {
    if (this.ac) {
      if (this.ac.state === 'suspended') this.ac.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ac = new AC();
    this.ac = ac;
    this.master = ac.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;
    this.master.connect(comp);
    comp.connect(ac.destination);
    this.sfx = ac.createGain();
    this.sfx.connect(this.master);
    this.reverb = ac.createConvolver();
    this.reverbSend = ac.createGain();
    this.reverbSend.gain.value = 0.22;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);
    this.slowFilter = ac.createBiquadFilter();
    this.slowFilter.type = 'lowpass';
    this.slowFilter.frequency.value = 20000;
    this.slowFilter.connect(this.sfx);
    this.slowFilter.connect(this.reverbSend);
    // shared noise buffers
    this.white = this.makeNoise('white', 2);
    this.brown = this.makeNoise('brown', 4);
    this.buildReverb(1.2);
    this.startAmbience();
    this.ready = true;
    return true;
  }

  makeNoise(kind, seconds) {
    const ac = this.ac;
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  buildReverb(seconds) {
    const ac = this.ac;
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
    this.reverb.buffer = buf;
  }

  setTheme(theme, condition) {
    this.theme = theme;
    if (!this.ac) return;
    const rev = { facility: 1.1, warehouse: 2.3, rooftop: 0.45, construction: 0.7 }[theme] || 1;
    this.buildReverb(rev);
    this.reverbSend.gain.value = theme === 'warehouse' ? 0.3 : theme === 'rooftop' ? 0.08 : 0.2;
    this.condition = condition;
  }

  setVolume(v) {
    this.volume = v;
    this.applyGain();
  }

  setMuted(m) {
    this.muted = m;
    this.applyGain();
  }

  applyGain() {
    if (!this.master) return;
    const t = this.ac.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.05);
  }

  // ---------------------------------------------------------- building blocks
  out(pan) {
    const ac = this.ac;
    const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (p) {
      p.pan.value = clamp(pan, -1, 1);
      p.connect(this.slowFilter);
      return p;
    }
    return this.slowFilter;
  }

  noise(dest, t, dur, gain, filterType, freq, q, freqEnd, buf) {
    const ac = this.ac;
    const src = ac.createBufferSource();
    src.buffer = buf || this.white;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ac.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t + dur);
    f.Q.value = q || 1;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone(dest, t, dur, gain, type, f0, f1, attack = 0.004) {
    const ac = this.ac;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Limits concurrency per category and repeat rate.
  allow(cat, max, minGap) {
    const now = this.ac.currentTime;
    const list = this.active.get(cat) || [];
    const alive = list.filter((e) => e > now);
    if (alive.length >= max) return false;
    const last = this.lastAt.get(cat) || 0;
    if (now - last < minGap) return false;
    this.lastAt.set(cat, now);
    this.active.set(cat, alive);
    return true;
  }

  claim(cat, dur) {
    const list = this.active.get(cat) || [];
    list.push(this.ac.currentTime + dur);
    this.active.set(cat, list);
  }

  // ------------------------------------------------------------- sounds
  punch(pan, vol, heavy, r) {
    const t = this.ac.currentTime;
    const d = this.out(pan);
    const k = heavy ? 1.25 : 1;
    this.tone(d, t, (0.11 * k) / r, 0.9 * vol, 'sine', (150 / k) * r, 48 * r);
    this.noise(d, t, 0.05 / r, 0.55 * vol, 'bandpass', 1700 * r, 0.9);
    this.noise(d, t, 0.012, 0.35 * vol, 'highpass', 4500, 0.7);
    this.claim('impact', 0.15);
  }

  kick(pan, vol, r) {
    const t = this.ac.currentTime;
    const d = this.out(pan);
    this.tone(d, t, 0.15 / r, 1.0 * vol, 'sine', 120 * r, 40 * r);
    this.noise(d, t, 0.07 / r, 0.5 * vol, 'bandpass', 1100 * r, 0.8);
    this.noise(d, t, 0.015, 0.3 * vol, 'highpass', 3800, 0.7);
    this.claim('impact', 0.18);
  }

  thud(pan, vol, r) {
    const t = this.ac.currentTime;
    const d = this.out(pan);
    this.tone(d, t, 0.22 / r, 0.8 * vol, 'sine', 95 * r, 34 * r);
    this.noise(d, t, 0.16 / r, 0.45 * vol, 'lowpass', 520 * r, 0.7, 120);
    this.claim('thud', 0.22);
  }

  block(pan, vol, r) {
    const t = this.ac.currentTime;
    const d = this.out(pan);
    this.noise(d, t, 0.045, 0.5 * vol, 'bandpass', 2400 * r, 2.2);
    this.tone(d, t, 0.06, 0.25 * vol, 'triangle', 640 * r, 420 * r);
    this.claim('impact', 0.08);
  }

  clang(pan, vol, r) {
    const t = this.ac.currentTime;
    const d = this.out(pan);
    for (const [f, g, dur] of [[420, 0.3, 0.6], [1052, 0.22, 0.45], [1690, 0.16, 0.35], [2515, 0.1, 0.25]]) {
      this.tone(d, t, dur / r, g * vol, 'sine', f * r * (0.98 + Math.random() * 0.04));
    }
    this.noise(d, t, 0.02, 0.4 * vol, 'highpass', 3000, 0.8);
    this.claim('metal', 0.5);
  }

  whoosh(pan, vol, r, delay = 0) {
    const t = this.ac.currentTime + delay;
    const d = this.out(pan);
    const dur = 0.2 / r;
    const ac = this.ac;
    const src = ac.createBufferSource();
    src.buffer = this.white;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.3;
    f.frequency.setValueAtTime(450 * r, t);
    f.frequency.exponentialRampToValueAtTime(2300 * r, t + dur * 0.5);
    f.frequency.exponentialRampToValueAtTime(650 * r, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * vol, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(d);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
    this.claim('whoosh', dur);
  }

  step(pan, vol, metal) {
    const t = this.ac.currentTime;
    const d = this.out(pan);
    this.noise(d, t, 0.035, 0.22 * vol, 'lowpass', 420, 0.8);
    if (metal) this.tone(d, t, 0.06, 0.06 * vol, 'triangle', 980, 760);
    this.claim('step', 0.04);
  }

  glass(pan, vol, r) {
    const t = this.ac.currentTime;
    const d = this.out(pan);
    this.noise(d, t, 0.32 / r, 0.7 * vol, 'highpass', 2600, 0.7);
    this.noise(d, t, 0.08, 0.5 * vol, 'bandpass', 5200, 1.5);
    for (let i = 0; i < 9; i++) {
      const dt = Math.random() * 0.45;
      this.tone(d, t + dt, 0.18, (0.05 + Math.random() * 0.07) * vol, 'sine', (2600 + Math.random() * 4200) * r);
    }
    this.claim('break', 0.5);
  }

  wood(pan, vol, r) {
    const t = this.ac.currentTime;
    const d = this.out(pan);
    for (let i = 0; i < 3; i++) this.noise(d, t + i * 0.035 + Math.random() * 0.02, 0.07 / r, 0.55 * vol, 'bandpass', (700 + Math.random() * 900) * r, 2.5);
    this.tone(d, t, 0.12 / r, 0.5 * vol, 'sine', 140 * r, 60 * r);
    this.claim('break', 0.3);
  }

  zap(pan, vol, r, dur = 0.75) {
    const ac = this.ac;
    const t = ac.currentTime;
    const d = this.out(pan);
    const D = dur / r;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42 * vol, t + 0.02);
    g.gain.setValueAtTime(0.42 * vol, t + D * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + D);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 * r;
    bp.Q.value = 0.7;
    bp.connect(g);
    g.connect(d);
    for (const [type, f] of [['sawtooth', 72], ['square', 143]]) {
      const o = ac.createOscillator();
      o.type = type;
      for (let k = 0; k < D / 0.025; k++) o.frequency.setValueAtTime(f * r * (0.7 + Math.random() * 0.8), t + k * 0.025);
      o.connect(bp);
      o.start(t);
      o.stop(t + D + 0.05);
    }
    for (let k = 0; k < 8; k++) this.noise(d, t + Math.random() * D, 0.03, 0.4 * vol, 'highpass', 3500, 1);
    this.claim('zap', D);
  }

  explosion(pan, vol, r) {
    const t = this.ac.currentTime;
    const d = this.out(pan);
    this.noise(d, t, 1.6 / r, 1.0 * vol, 'lowpass', 2200 * r, 0.6, 90, this.white);
    this.tone(d, t, 0.8 / r, 1.0 * vol, 'sine', 62 * r, 26 * r, 0.01);
    for (let k = 0; k < 10; k++) this.noise(d, t + 0.1 + Math.random() * 0.9, 0.05, 0.25 * vol, 'bandpass', 900 + Math.random() * 2000, 2);
    this.claim('boom', 1.5);
  }

  // A gunshot: a sharp crack, a low body thump and a ringing tail.
  gunshot(pan, vol, r) {
    const t = this.ac.currentTime;
    const d = this.out(pan);
    this.noise(d, t, 0.03, 1.0 * vol, 'highpass', 2500, 0.7);
    this.noise(d, t, 0.22 / r, 0.8 * vol, 'lowpass', 1800 * r, 0.8, 200);
    this.tone(d, t, 0.12 / r, 0.9 * vol, 'sine', 160 * r, 40 * r, 0.002);
    this.noise(this.reverbSend, t, 0.5, 0.35 * vol, 'bandpass', 900, 0.6, 300);
    this.claim('gun', 0.12);
  }

  // Thunder: a white crack overhead, then a long rolling rumble.
  thunder(pan, vol) {
    const t = this.ac.currentTime;
    const d = this.out(pan);
    this.noise(d, t, 0.12, 1.0 * vol, 'highpass', 1800, 0.6);
    this.noise(d, t, 0.25, 0.9 * vol, 'bandpass', 2600, 0.8, 600);
    this.noise(d, t + 0.05, 2.4, 0.9 * vol, 'lowpass', 900, 0.6, 60, this.white);
    this.tone(d, t + 0.04, 1.6, 0.7 * vol, 'sine', 52, 30, 0.02);
    for (let k = 0; k < 6; k++) this.noise(d, t + 0.2 + Math.random() * 1.6, 0.3, 0.25 * vol, 'lowpass', 300 + Math.random() * 300, 1);
    this.claim('thunder', 2.4);
  }

  // A metallic tick: the grenade's spoon flying off.
  pin(pan, vol) {
    const t = this.ac.currentTime;
    const d = this.out(pan);
    this.tone(d, t, 0.08, 0.35 * vol, 'triangle', 2200, 1800);
    this.tone(d, t + 0.05, 0.12, 0.25 * vol, 'sine', 3100, 2900);
    this.claim('pin', 0.15);
  }

  hiss(pan, vol, dur) {
    const t = this.ac.currentTime;
    const d = this.out(pan);
    this.noise(d, t, dur, 0.3 * vol, 'highpass', 2400, 0.6);
    this.claim('hiss', dur);
  }

  ding(pan, vol) {
    const t = this.ac.currentTime;
    const d = this.out(pan);
    this.tone(d, t, 0.9, 0.22 * vol, 'sine', 1318.5);
    this.tone(d, t + 0.32, 1.2, 0.2 * vol, 'sine', 1046.5);
  }

  siren(vol) {
    const t = this.ac.currentTime;
    const d = this.out(0);
    for (let k = 0; k < 4; k++) this.tone(d, t + k * 0.42, 0.4, 0.1 * vol, 'sawtooth', k % 2 ? 620 : 840, k % 2 ? 600 : 820, 0.02);
  }

  vocal(pan, vol, f0, kind, r) {
    const ac = this.ac;
    const t = ac.currentTime;
    const d = this.out(pan);
    const dur = (kind === 'ko' ? 0.42 : kind === 'hurt' ? 0.2 : 0.16) / r;
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    const p0 = f0 * r;
    o.frequency.setValueAtTime(p0 * (kind === 'attack' ? 0.95 : 1.15), t);
    o.frequency.exponentialRampToValueAtTime(p0 * (kind === 'attack' ? 1.08 : kind === 'ko' ? 0.6 : 0.82), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const vowel = VOWELS[kind === 'attack' ? 'ah' : kind === 'ko' ? 'oh' : 'uh'];
    for (const fr of vowel) {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fr * (0.9 + Math.random() * 0.2);
      bp.Q.value = 7;
      o.connect(bp);
      bp.connect(g);
    }
    // breath noise
    this.noise(d, t, dur * 0.8, 0.05 * vol, 'bandpass', 1800, 1);
    g.connect(d);
    o.start(t);
    o.stop(t + dur + 0.05);
    this.claim('vocal', dur);
  }

  slowmo(vol) {
    const t = this.ac.currentTime;
    const d = this.out(0);
    this.tone(d, t, 0.9, 0.22 * vol, 'sine', 240, 70, 0.05);
    this.noise(d, t, 0.8, 0.18 * vol, 'lowpass', 1800, 0.8, 200);
  }

  // ------------------------------------------------------------- ambience
  startAmbience() {
    const ac = this.ac;
    const mk = (buf, type, freq, q, gain) => {
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ac.createGain();
      g.gain.value = gain;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start();
      return { src, f, g };
    };
    this.room = mk(this.brown, 'lowpass', 220, 0.5, 0.05);
    this.crowd = mk(this.brown, 'bandpass', 520, 0.9, 0);
    this.wind = mk(this.white, 'bandpass', 500, 0.6, 0);
    this.rain = mk(this.white, 'highpass', 2500, 0.4, 0);
    const hum = ac.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 60;
    const hg = ac.createGain();
    hg.gain.value = 0.012;
    hum.connect(hg);
    hg.connect(this.master);
    hum.start();
    this.hum = hg;
  }

  update(dt, sim, cam, timeScale) {
    if (!this.ready) return;
    const t = this.ac.currentTime;
    this.timeScale = timeScale;
    const lp = timeScale < 0.9 ? 1400 + 12000 * timeScale : 20000;
    this.slowFilter.frequency.setTargetAtTime(lp, t, 0.05);
    // crowd loudness follows how many enemies are near the camera
    let n = 0;
    for (const f of sim.enemies) {
      if (f.dead || f.removed) continue;
      if (Math.abs(f.x - cam.x) < cam.viewW) n++;
    }
    const crowd = clamp(Math.sqrt(n) * 0.035, 0, 0.16);
    this.crowd.g.gain.setTargetAtTime(crowd * (0.7 + 0.3 * Math.sin(t * 0.7)), t, 0.4);
    this.crowd.f.frequency.setTargetAtTime(420 + Math.sin(t * 0.37) * 120 + n * 3, t, 0.5);
    const L = sim.level;
    const outdoor = L.outdoor;
    const w = outdoor ? 0.03 + (L.wind ? Math.abs(sim.windNow) / 900 : 0) : 0.004;
    this.wind.g.gain.setTargetAtTime(w, t, 0.5);
    this.wind.f.frequency.setTargetAtTime(380 + Math.abs(sim.windNow || 0) * 2, t, 0.5);
    this.rain.g.gain.setTargetAtTime(L.rain ? 0.05 : 0, t, 0.5);
    this.room.g.gain.setTargetAtTime(outdoor ? 0.02 : 0.05, t, 0.5);
    this.hum.gain.setTargetAtTime(outdoor ? 0 : L.dark ? 0.004 : 0.012, t, 0.5);
  }

  // --------------------------------------------------------- event routing
  handle(e, cam, sim) {
    if (!this.ready || this.muted) return;
    if (e.x === undefined && e.t !== 'wave' && e.t !== 'slowmo') return;
    const half = cam.viewW * 0.5;
    const dx = e.x !== undefined ? e.x - cam.x : 0;
    const dy = e.y !== undefined ? e.y - cam.y : 0;
    const pan = clamp(dx / half, -1, 1) * 0.75;
    const dist = Math.abs(dx) / half + Math.max(0, Math.abs(dy) / (half * 0.7) - 1);
    let vol = clamp(1.25 - dist * 0.55, 0.06, 1);
    if (dist > 2.4) return;
    const r = clamp(0.55 + 0.45 * this.timeScale, 0.55, 1) * (0.94 + Math.random() * 0.12);
    switch (e.t) {
      case 'hit': {
        const pw = clamp(e.power || 0.5, 0.25, 1.6);
        vol *= 0.55 + pw * 0.35;
        if (e.kind === 'block' || e.kind === 'parry') {
          if (this.allow('impact', 10, 0.01)) this.block(pan, vol, r);
          if (e.kind === 'parry' && this.allow('metal', 4, 0.05)) this.clang(pan, vol * 0.5, r * 1.6);
        } else if (e.kind === 'weapon' && (e.weapon === 'pipe' || e.weapon === 'crowbar')) {
          if (this.allow('metal', 6, 0.02)) this.clang(pan, vol * 0.7, r);
          if (this.allow('impact', 10, 0.01)) this.punch(pan, vol, true, r);
        } else if (e.kind === 'kick' || e.kind === 'body') {
          if (this.allow('impact', 10, 0.01)) this.kick(pan, vol, r);
        } else if (this.allow('impact', 10, 0.01)) this.punch(pan, vol, pw > 1, r);
        if (e.b && !e.b.isHero && Math.random() < 0.45 && this.allow('vocal', 3, 0.06)) this.vocal(pan, vol * 0.8, 230 / e.b.scale, e.down ? 'ko' : 'hurt', r);
        if (e.b && e.b.isHero && Math.random() < 0.3 && this.allow('vocal', 3, 0.1)) this.vocal(pan, vol * 0.7, 110, 'hurt', r);
        break;
      }
      case 'whoosh':
        if (this.allow('whoosh', 6, 0.02)) this.whoosh(pan, vol * clamp(0.4 + (e.power || 5) / 25, 0.4, 1), r, (e.delay || 0) * 0.85);
        break;
      case 'thud':
        if (this.allow('thud', 6, 0.03)) this.thud(pan, vol * clamp(e.power || 0.5, 0.25, 1.4), r);
        break;
      case 'land':
        if ((e.power || 0) > 0.4 && this.allow('thud', 6, 0.04)) this.thud(pan, vol * 0.45 * e.power, r * 1.3);
        break;
      case 'step':
        if (this.allow('step', 4, 0.045)) this.step(pan, vol * 0.6 * (e.power || 0.5), sim.level.theme === 'warehouse' && e.y < -50);
        break;
      case 'break':
        if (e.material === 'glass') {
          if (this.allow('break', 4, 0.05)) this.glass(pan, vol * (e.small ? 0.4 : 1), r);
        } else if (this.allow('break', 4, 0.05)) {
          if (e.material === 'metal') this.clang(pan, vol * 0.6, r);
          else this.wood(pan, vol * (e.small ? 0.5 : 1), r);
        }
        break;
      case 'clatter':
        if (this.allow('clatter', 4, 0.06)) {
          if (e.material === 'metal' || e.material === 'stone') this.clang(pan, vol * 0.25 * (e.power || 0.5), r * 1.2);
          else this.thud(pan, vol * 0.3 * (e.power || 0.5), r * 1.6);
        }
        break;
      case 'zap':
        if (this.allow('zap', 3, 0.1)) this.zap(pan, vol, r, e.floor ? 0.4 : 0.8);
        break;
      case 'explosion':
        if (this.allow('boom', 3, 0.05)) this.explosion(pan, Math.min(1, vol * 1.3), r);
        break;
      case 'shot':
        if (this.allow('gun', 6, 0.03)) this.gunshot(pan * 0.6, Math.max(0.6, vol), r);
        if (e.kind === 'flesh' && this.allow('impact', 10, 0.01)) this.punch(pan, vol * 0.8, true, r);
        else if ((e.kind === 'metal' || e.kind === 'solid') && this.allow('metal', 6, 0.04)) this.clang(pan, vol * 0.2, r * 1.8);
        break;
      case 'lightning':
        if (this.allow('thunder', 2, 0.15)) this.thunder(pan, Math.max(0.8, vol));
        if (this.allow('zap', 3, 0.1)) this.zap(pan, vol, r, 0.9);
        break;
      case 'push':
        if (this.allow('boom', 3, 0.05)) {
          this.thud(pan, vol, r * 0.7);
          this.whoosh(pan, vol, r * 0.6);
        }
        break;
      case 'grenade':
        if (this.allow('pin', 2, 0.1)) this.pin(pan, vol);
        break;
      case 'pspawn':
        if (this.allow('thud', 6, 0.03)) this.thud(pan, vol * 0.4, r * 1.6);
        break;
      case 'steam':
        if (e.on && this.allow('hiss', 3, 0.2)) this.hiss(pan, vol * 0.8, 1.3);
        break;
      case 'fuse':
        if (this.allow('hiss', 3, 0.2)) this.hiss(pan, vol * 0.6, 0.9);
        break;
      case 'elevator':
        if (this.allow('ding', 2, 0.3)) this.ding(pan, vol);
        break;
      case 'vocal':
        if (Math.random() < 0.6 && this.allow('vocal', 3, 0.08)) this.vocal(pan, vol * 0.6, e.f && e.f.isHero ? 115 : 200 / (e.f ? e.f.scale : 1), 'attack', r);
        break;
      case 'wave':
        if (sim.level.theme === 'facility' && this.allow('siren', 1, 3)) this.siren(0.8);
        break;
      case 'slowmo':
        if (this.allow('slowmo', 1, 1)) this.slowmo(0.8);
        break;
    }
  }
}
