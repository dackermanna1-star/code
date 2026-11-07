// =============================================================================
// Generative music for the IFE "Music" section. Everything is ORIGINAL and
// synthesised live with Web Audio (no samples): four albums in different
// styles, each track = a deterministic seed (key, tempo, progression, motifs),
// so a track sounds the same every time it is played.
//
// Output: app.audio.ifeBus (headphone bus, follows settings.ifeVolume) or a
// private AudioContext when the audio module is unavailable.
// =============================================================================
import { rng } from '../ui/kit.js';

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
};
function chordTones(root, scale, degree, size = 4) {
  const sc = SCALES[scale];
  const out = [];
  for (let i = 0; i < size; i++) {
    const d = degree + i * 2;
    out.push(root + sc[d % 7] + 12 * Math.floor(d / 7));
  }
  return out;
}
function scaleNote(root, scale, idx) {
  const sc = SCALES[scale];
  const o = Math.floor(idx / 7), d = ((idx % 7) + 7) % 7;
  return root + sc[d] + 12 * o;
}

export const ALBUMS = [
  {
    title: 'Cirrus', artist: 'Halcyon Sound Studio', style: 'ambient', year: 2026, genre: 'Ambient · Piano',
    colors: ['#9fc6e6', '#e9d9c4', '#4a6f98'],
    tracks: [
      { title: 'Above the Cloud Deck', seed: 11, root: 62, scale: 'lydian', bpm: 64, dur: 214 },
      { title: 'Contrails at Dusk', seed: 12, root: 57, scale: 'major', bpm: 58, dur: 236 },
      { title: 'Window Seat', seed: 13, root: 64, scale: 'major', bpm: 66, dur: 198 },
      { title: 'Thirty-Six Thousand Feet', seed: 14, root: 60, scale: 'lydian', bpm: 60, dur: 252 },
    ],
  },
  {
    title: 'Cabin Pressure', artist: 'Night Shift Collective', style: 'lofi', year: 2026, genre: 'Lo-fi · Chillhop',
    colors: ['#f2a07b', '#3b2d5c', '#f7d9a8'],
    tracks: [
      { title: 'Tray Table Up', seed: 21, root: 57, scale: 'dorian', bpm: 82, dur: 168 },
      { title: 'Gate 14', seed: 22, root: 60, scale: 'minor', bpm: 78, dur: 184 },
      { title: 'Seatbelt Sign Off', seed: 23, root: 62, scale: 'dorian', bpm: 86, dur: 172 },
      { title: 'Red-Eye Study Session', seed: 24, root: 55, scale: 'minor', bpm: 74, dur: 196 },
    ],
  },
  {
    title: 'Blue Hour Trio', artist: 'The Port Solano Trio', style: 'jazz', year: 2025, genre: 'Jazz · Piano trio',
    colors: ['#1d4f8a', '#e8b04b', '#0d1d33'],
    tracks: [
      { title: 'Holding Pattern', seed: 31, root: 53, scale: 'major', bpm: 132, dur: 204 },
      { title: 'Jet Bridge Blues', seed: 32, root: 58, scale: 'mixolydian', bpm: 118, dur: 192 },
      { title: 'Final Approach', seed: 33, root: 51, scale: 'major', bpm: 144, dur: 186 },
      { title: 'Cedar Bay Nocturne', seed: 34, root: 55, scale: 'dorian', bpm: 108, dur: 214 },
    ],
  },
  {
    title: 'Études in Motion', artist: 'Clara Vennholm, piano', style: 'classical', year: 2024, genre: 'Classical · Solo piano',
    colors: ['#efe7da', '#7a1f2b', '#26313f'],
    tracks: [
      { title: 'Étude No. 1 in C major', seed: 41, root: 60, scale: 'major', bpm: 84, dur: 180 },
      { title: 'Étude No. 2 in A minor', seed: 42, root: 57, scale: 'minor', bpm: 76, dur: 196 },
      { title: 'Étude No. 3 in E-flat major', seed: 43, root: 63, scale: 'major', bpm: 92, dur: 172 },
      { title: 'Étude No. 4 in D minor', seed: 44, root: 62, scale: 'minor', bpm: 70, dur: 208 },
    ],
  },
];

export class MusicEngine {
  constructor(app) {
    this.app = app;
    this.ctx = null;
    this.out = null;
    this.albums = ALBUMS;
    this.albumIndex = 0;
    this.trackIndex = 0;
    this.active = false;       // a track is loaded
    this.wantPlay = false;
    this.held = new Set();
    this._elapsed = 0;          // seconds of music played in the current track
    this._t0 = 0;               // ctx time corresponding to _elapsed at resume
    this._running = false;
    this._step = 0;
    this._nextTime = 0;
    this.onChange = null;
  }

  get album() { return this.albums[this.albumIndex]; }
  get current() { return this.active ? this.album.tracks[this.trackIndex] : null; }
  get playing() { return this._running; }
  get duration() { return this.current?.dur || 0; }
  get position() { return this._running && this.ctx ? this._elapsed + (this.ctx.currentTime - this._t0) : this._elapsed; }

  _ensureCtx() {
    if (this.ctx) return true;
    const a = this.app.audio;
    let ctx = a?.context || null, dest = a?.ifeBus || null;
    if (!ctx || !dest) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        const g = ctx.createGain();
        g.gain.value = 0.7 * (this.app.settings?.get?.('ifeVolume') ?? 0.8);
        g.connect(ctx.destination);
        dest = g;
        this._ownVol = g;
      } catch { return false; }
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 16000;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(2.8, 2.6);
    this.dry.connect(this.tone);
    this.wet.connect(this.verb); this.verb.connect(this.tone);
    this.tone.connect(this.master);
    this.master.connect(dest);
    this.noise = this._noiseBuffer(2);
    this.crackle = this._crackleBuffer(4);
    return true;
  }
  setOwnVolume(v) { if (this._ownVol) this._ownVol.gain.value = 0.7 * v; }

  _impulse(sec, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    const r = rng(99);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[i] = (r() * 2 - 1) * (1 - t) ** decay * (i < 200 ? i / 200 : 1);
      }
    }
    return b;
  }
  _noiseBuffer(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), r = rng(5);
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    return b;
  }
  _crackleBuffer(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), r = rng(8);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp = lp * 0.97 + (r() * 2 - 1) * 0.03;
      d[i] = lp * 0.5 + (r() < 0.0006 ? (r() * 2 - 1) * 0.9 : 0);
    }
    return b;
  }

  // ---------------------------------------------------------------------------------- transport
  play(albumIndex = this.albumIndex, trackIndex = 0) {
    if (!this._ensureCtx()) return false;
    const changed = !this.active || albumIndex !== this.albumIndex || trackIndex !== this.trackIndex;
    this.albumIndex = albumIndex;
    this.trackIndex = trackIndex;
    this.active = true;
    if (changed) { this._elapsed = 0; this._setupTrack(); }
    this.wantPlay = true;
    this._apply(changed);
    this._emit();
    return true;
  }
  toggle() { if (this.wantPlay) this.pause(); else if (this.active) { this.wantPlay = true; this._apply(); this._emit(); } }
  pause() { this.wantPlay = false; this._apply(); this._emit(); }
  stop() { this.wantPlay = false; this._apply(); this.active = false; this._elapsed = 0; this._emit(); }
  next() { if (!this.active) return; this.play(this.albumIndex, (this.trackIndex + 1) % this.album.tracks.length); }
  prev() {
    if (!this.active) return;
    if (this.position > 4) { this._elapsed = 0; this._setupTrack(); this.wantPlay = true; this._apply(true); this._emit(); return; }
    this.play(this.albumIndex, (this.trackIndex + this.album.tracks.length - 1) % this.album.tracks.length);
  }
  hold(reason, on) { if (on) this.held.add(reason); else this.held.delete(reason); this._apply(); this._emit(); }
  _emit() { try { this.onChange?.(); } catch { /* */ } }

  _apply(restart = false) {
    if (!this.ctx) return;
    const should = this.wantPlay && this.active && this.held.size === 0;
    const now = this.ctx.currentTime;
    if (should && (!this._running || restart)) {
      if (this.ctx.state === 'suspended') this.ctx.resume?.().catch?.(() => {});
      this._running = true;
      this._t0 = now;
      this._nextTime = now + 0.08;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0.9, now + 0.6);
      this.app.audio?.setHeadphones?.(true);
    } else if (!should && this._running) {
      this._elapsed += now - this._t0;
      this._running = false;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0, now + 0.25);
      if (this._crackleSrc) { try { this._crackleSrc.stop(now + 0.3); } catch { /* */ } this._crackleSrc = null; }
    }
  }

  _setupTrack() {
    const tr = this.current, al = this.album;
    const r = rng(tr.seed * 7919);
    const T = { r, tr, style: al.style, root: tr.root, scale: tr.scale, bpm: tr.bpm };
    const progs = {
      ambient: [[0, 3, 5, 4], [0, 5, 3, 4], [3, 0, 4, 5], [0, 4, 5, 3]],
      lofi: [[1, 4, 0, 5], [5, 3, 0, 4], [0, 5, 3, 4], [3, 4, 2, 5]],
      jazz: [[1, 4, 0, 5], [0, 5, 1, 4], [2, 5, 1, 4], [0, 3, 1, 4]],
      classical: [[0, 5, 3, 4], [0, 3, 4, 0], [5, 3, 0, 4], [0, 4, 5, 3]],
    }[al.style];
    T.prog = progs[Math.floor(r() * progs.length)];
    T.prog2 = progs[Math.floor(r() * progs.length)];
    T.motif = Array.from({ length: 8 }, () => Math.floor(r() * 7) - 1);
    T.barSteps = 16;
    this.T = T;
    this._step = 0;
    if (this._crackleSrc) { try { this._crackleSrc.stop(); } catch { /* */ } this._crackleSrc = null; }
    this.tone.frequency.setValueAtTime(al.style === 'lofi' ? 3800 : 16000, this.ctx.currentTime);
    this.wet.gain.value = { ambient: 0.55, lofi: 0.18, jazz: 0.16, classical: 0.32 }[al.style];
    this.dry.gain.value = { ambient: 0.7, lofi: 0.9, jazz: 0.95, classical: 0.85 }[al.style];
  }

  /** Scheduler; call every frame. */
  update() {
    if (!this._running || !this.ctx) return;
    if (this.position >= this.duration) {
      // end of track: short gap then the next one
      this.next();
      return;
    }
    const ctx = this.ctx, T = this.T;
    const sixteenth = 60 / T.bpm / 4;
    while (this._nextTime < ctx.currentTime + 0.25) {
      const s = this._step;
      let t = this._nextTime;
      if ((T.style === 'jazz' || T.style === 'lofi') && s % 2 === 1) t += sixteenth * (T.style === 'jazz' ? 0.33 : 0.22);
      try { this['_' + T.style](s, t, sixteenth); } catch (e) { console.warn('[ife] music', e); }
      this._step++;
      this._nextTime += sixteenth;
    }
    if (T.style === 'lofi' && !this._crackleSrc) {
      const src = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 900;
      src.buffer = this.crackle; src.loop = true;
      g.gain.value = 0.06;
      src.connect(hp); hp.connect(g); g.connect(this.dry);
      src.start();
      this._crackleSrc = src;
    }
  }

  // ---------------------------------------------------------------------------------- instruments
  _env(g, t, a, peak, decay, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(0.0001, t + a, decay);
    return end;
  }
  piano(t, midi, vel = 0.5, len = 2.5, wet = 0.5) {
    const ctx = this.ctx, f = mtof(midi);
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(12000, f * (6 + vel * 10)), t);
    lp.frequency.setTargetAtTime(f * 2.2, t, 0.35);
    const decay = Math.max(0.35, (len * 0.5) * (1.3 - (midi - 48) / 60));
    const parts = [[1, 1, 'triangle'], [2, 0.32, 'sine'], [3, 0.12, 'sine'], [4.01, 0.06, 'sine']];
    const end = t + decay * 6;
    for (const [m, a, type] of parts) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type;
      o.frequency.value = f * m;
      o.detune.value = (Math.random() - 0.5) * 6;
      og.gain.value = a;
      o.connect(og); og.connect(lp);
      o.start(t); o.stop(end);
    }
    // hammer
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.32, t + 0.006);
    g.gain.setTargetAtTime(vel * 0.14, t + 0.006, 0.12);
    g.gain.setTargetAtTime(0.0001, t + 0.2, decay);
    lp.connect(g);
    g.connect(this.dry);
    if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(this.wet); }
  }
  epiano(t, midi, vel = 0.5, dur = 1.2) {
    const ctx = this.ctx, f = mtof(midi);
    const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    c.type = 'sine'; m.type = 'sine';
    c.frequency.value = f; m.frequency.value = f;
    mg.gain.setValueAtTime(f * 1.6 * vel, t);
    mg.gain.setTargetAtTime(f * 0.15, t, 0.25);
    m.connect(mg); mg.connect(c.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.16, t + 0.008);
    g.gain.setTargetAtTime(vel * 0.06, t + 0.01, 0.4);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.15);
    c.connect(g); g.connect(this.dry);
    const s = ctx.createGain(); s.gain.value = 0.35; g.connect(s); s.connect(this.wet);
    c.start(t); m.start(t); c.stop(t + dur + 1); m.stop(t + dur + 1);
  }
  pad(t, midis, dur, vol = 0.05) {
    const ctx = this.ctx, g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(vol * 0.8, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.15);
    for (const m of midis) {
      for (const dt of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt;
        o.connect(lp); o.start(t); o.stop(t + dur * 1.2);
      }
    }
    lp.connect(g); g.connect(this.wet);
    const d = ctx.createGain(); d.gain.value = 0.4; g.connect(d); d.connect(this.dry);
  }
  bass(t, midi, dur, vol = 0.32, type = 'triangle') {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = mtof(midi);
    o2.type = 'sine'; o2.frequency.value = mtof(midi);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.setTargetAtTime(260, t, 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.setTargetAtTime(vol * 0.5, t + 0.02, 0.15);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.9, 0.05);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.dry);
    o.start(t); o2.start(t); o.stop(t + dur + 0.4); o2.stop(t + dur + 0.4);
  }
  kick(t, vol = 0.7) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g); g.connect(this.dry); o.start(t); o.stop(t + 0.4);
  }
  noiseHit(t, { f = 6000, type = 'highpass', q = 0.7, vol = 0.1, decay = 0.05, attack = 0.001, wet = 0 } = {}) {
    const ctx = this.ctx, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise;
    fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setTargetAtTime(0.0001, t + attack, decay);
    s.connect(fl); fl.connect(g); g.connect(this.dry);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.wet); }
    s.start(t, Math.random() * 1.5); s.stop(t + attack + decay * 7);
  }
  snare(t, vol = 0.35) {
    this.noiseHit(t, { f: 1900, type: 'bandpass', q: 0.8, vol, decay: 0.06, wet: 0.2 });
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.05);
    g.gain.setValueAtTime(vol * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g); g.connect(this.dry); o.start(t); o.stop(t + 0.15);
  }

  // ---------------------------------------------------------------------------------- styles
  _chordAt(bar) {
    const T = this.T;
    const prog = Math.floor(bar / 8) % 2 ? T.prog2 : T.prog;
    return prog[bar % prog.length];
  }

  _ambient(s, t, six) {
    const T = this.T, r = T.r;
    const bar = Math.floor(s / 16), pos = s % 16;
    const deg = this._chordAt(bar);
    const ch = chordTones(T.root - 12, T.scale, deg, 4);
    if (pos === 0) {
      this.pad(t, ch.map((m) => m), six * 16, 0.035);
      this.piano(t, ch[0] - 12, 0.4, 5, 0.7);
      this.piano(t + 0.02, ch[0], 0.25, 5, 0.7);
    }
    // sparse melodic notes from the pentatonic-ish scale
    if (pos % 2 === 0 && r() < (pos === 8 ? 0.6 : 0.22)) {
      const idx = 7 + deg + [0, 2, 4, 7, 9][Math.floor(r() * 5)] + (r() < 0.3 ? 7 : 0);
      this.piano(t + r() * 0.03, scaleNote(T.root, T.scale, idx), 0.22 + r() * 0.2, 4, 0.8);
    }
    if (pos === 6 && r() < 0.5) this.piano(t, ch[1] + 12, 0.18, 4, 0.8);
  }

  _lofi(s, t, six) {
    const T = this.T, r = T.r;
    const bar = Math.floor(s / 16), pos = s % 16;
    const deg = this._chordAt(bar);
    const ch = chordTones(T.root - 12, T.scale, deg, 4);
    const intro = bar < 2;
    if (pos === 0 || (pos === 10 && r() < 0.5)) for (let i = 0; i < 4; i++) this.epiano(t + i * 0.012, ch[i] + 12, 0.42, six * (pos === 0 ? 9 : 5));
    if (!intro) {
      if (pos === 0 || pos === 7 || (pos === 10 && r() < 0.6)) this.kick(t, 0.55);
      if (pos === 4 || pos === 12) this.snare(t, 0.22);
      if (pos % 2 === 0) this.noiseHit(t, { f: 7500, vol: pos % 4 === 0 ? 0.05 : 0.03, decay: 0.025 });
      if (pos === 0) this.bass(t, ch[0] - 12, six * 6, 0.34);
      if (pos === 8 && r() < 0.7) this.bass(t, ch[r() < 0.5 ? 0 : 2] - 12, six * 4, 0.28);
    }
    // little melody hook every other bar
    if (bar % 2 === 1 && pos % 4 === 2 && r() < 0.55) {
      const idx = 14 + T.motif[(pos / 2) % 8] + deg;
      this.epiano(t, scaleNote(T.root, T.scale, idx), 0.3, six * 3);
    }
  }

  _jazz(s, t, six) {
    const T = this.T, r = T.r;
    const bar = Math.floor(s / 16), pos = s % 16;
    const deg = this._chordAt(bar);
    const ch = chordTones(T.root - 12, T.scale, deg, 4);
    const nextCh = chordTones(T.root - 12, T.scale, this._chordAt(bar + 1), 4);
    // walking bass on quarter notes
    if (pos % 4 === 0) {
      const q = pos / 4;
      let n;
      if (q === 0) n = ch[0];
      else if (q === 3) n = nextCh[0] + (r() < 0.5 ? 1 : -1);
      else n = ch[[1, 2, 3][Math.floor(r() * 3)]] - (r() < 0.4 ? 12 : 0);
      while (n > T.root - 7) n -= 12;
      while (n < T.root - 26) n += 12;
      this.bass(t, n, six * 3.6, 0.36, 'triangle');
    }
    // ride: spang-a-lang
    if (pos % 4 === 0 || pos % 8 === 7) this.noiseHit(t, { f: 6800, type: 'highpass', vol: pos % 8 === 4 ? 0.055 : 0.04, decay: 0.16, wet: 0.2 });
    if (pos === 4 || pos === 12) this.noiseHit(t, { f: 9000, vol: 0.025, decay: 0.03 });   // hi-hat foot
    // brushes: soft swish on 2 & 4
    if (pos === 4 || pos === 12) this.noiseHit(t, { f: 2500, type: 'bandpass', q: 0.5, vol: 0.05, attack: 0.04, decay: 0.08 });
    // comping: rootless voicings on syncopated spots
    if ((pos === 6 || pos === 14 || (pos === 3 && r() < 0.4)) && r() < 0.7) {
      const v = [ch[1], ch[3], ch[0] + 12, ch[2] + 12].map((m) => m + 12);
      v.forEach((m, i) => this.piano(t + i * 0.008, m, 0.2, 1.2, 0.25));
    }
    // right-hand improvised line in some bars
    if (bar % 4 >= 2 && pos % 2 === 0 && r() < 0.62) {
      T.line = (T.line ?? 10) + [-2, -1, 1, 2, -1, 1][Math.floor(r() * 6)];
      T.line = Math.max(6, Math.min(16, T.line));
      this.piano(t, scaleNote(T.root + 12, T.scale, T.line + deg), 0.3, 0.9, 0.25);
    }
  }

  _classical(s, t, six) {
    const T = this.T, r = T.r;
    const bar = Math.floor(s / 16), pos = s % 16;
    const deg = this._chordAt(bar);
    const ch = chordTones(T.root - 12, T.scale, deg, 3);
    // left hand: broken chord (Alberti) in sixteenths
    const pat = [0, 2, 1, 2];
    const n = ch[pat[pos % 4]];
    this.piano(t, n, pos % 4 === 0 ? 0.3 : 0.2, 1.4, 0.35);
    if (pos === 0) this.piano(t, ch[0] - 12, 0.32, 3, 0.35);
    // right hand: melody in eighths / quarters, stepwise around chord tones
    if (pos % 4 === 0 || (pos % 2 === 0 && r() < 0.35)) {
      if (pos === 0) T.mel = 9 + deg + [0, 2, 4][Math.floor(r() * 3)];
      else T.mel = (T.mel ?? 11) + [-1, 1, -2, 2, 0][Math.floor(r() * 5)];
      T.mel = Math.max(7, Math.min(17, T.mel));
      this.piano(t, scaleNote(T.root, T.scale, T.mel), 0.4 + (pos === 0 ? 0.1 : 0), 2.2, 0.35);
    }
  }
}

/** Procedural album cover (cached per size). */
const _artCache = new Map();
export function albumArt(index, size) {
  const key = `${index}:${size}`;
  if (_artCache.has(key)) return _artCache.get(key);
  const al = ALBUMS[index];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const r = rng(index * 101 + 7);
  const [a, b, k] = al.colors;
  const g = x.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, a); g.addColorStop(1, k);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const s = size / 100;
  if (al.style === 'ambient') {
    for (let i = 0; i < 7; i++) {
      x.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.12})`;
      x.beginPath();
      const cy = 30 + i * 9 + r() * 6;
      x.ellipse(50 * s + (r() - 0.5) * 40 * s, cy * s, (30 + r() * 30) * s, (3 + r() * 4) * s, 0, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = b; x.globalAlpha = 0.85;
    x.beginPath(); x.arc(70 * s, 26 * s, 9 * s, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
  } else if (al.style === 'lofi') {
    x.fillStyle = b; x.fillRect(0, 62 * s, size, 38 * s);
    x.fillStyle = a; x.beginPath(); x.arc(50 * s, 62 * s, 22 * s, Math.PI, 0); x.fill();
    for (let i = 0; i < 5; i++) { x.fillStyle = `rgba(247,217,168,${0.5 - i * 0.08})`; x.fillRect(0, (66 + i * 6) * s, size, 2 * s); }
    x.fillStyle = 'rgba(20,14,30,0.85)';
    x.fillRect(14 * s, 40 * s, 10 * s, 22 * s); x.fillRect(76 * s, 34 * s, 12 * s, 28 * s); x.fillRect(64 * s, 46 * s, 8 * s, 16 * s);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,255,255,${r() * 0.06})`; x.fillRect(r() * size, r() * size, s, s); }
  } else if (al.style === 'jazz') {
    x.fillStyle = k; x.fillRect(0, 0, size, size);
    x.fillStyle = a; x.fillRect(0, 0, 58 * s, size);
    x.fillStyle = b; x.beginPath(); x.arc(58 * s, 58 * s, 26 * s, 0, Math.PI * 2); x.fill();
    x.fillStyle = k; x.beginPath(); x.arc(58 * s, 58 * s, 6 * s, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f3f1ea'; x.font = `700 ${11 * s}px sans-serif`; x.fillText('BLUE', 8 * s, 18 * s); x.fillText('HOUR', 8 * s, 30 * s);
    x.font = `400 ${6 * s}px sans-serif`; x.fillText('TRIO', 8 * s, 40 * s);
  } else {
    x.fillStyle = a; x.fillRect(0, 0, size, size);
    x.strokeStyle = b; x.lineWidth = 1.2 * s;
    for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(12 * s, (40 + i * 4) * s); x.lineTo(88 * s, (40 + i * 4) * s); x.stroke(); }
    x.fillStyle = k;
    for (let i = 0; i < 9; i++) { const nx = (18 + i * 8) * s, ny = (38 + Math.round(r() * 8) * 2) * s; x.beginPath(); x.ellipse(nx, ny, 2.6 * s, 2 * s, -0.4, 0, 7); x.fill(); x.fillRect(nx + 2 * s, ny - 12 * s, 0.9 * s, 12 * s); }
    x.fillStyle = b; x.font = `italic 600 ${9 * s}px Georgia, serif`; x.fillText('Études', 12 * s, 78 * s);
    x.font = `400 ${5 * s}px Georgia, serif`; x.fillStyle = k; x.fillText('in Motion', 12 * s, 86 * s);
  }
  // title strip
  if (al.style !== 'jazz' && al.style !== 'classical') {
    x.fillStyle = 'rgba(255,255,255,0.92)';
    x.font = `700 ${9 * s}px sans-serif`;
    x.fillText(al.title.toUpperCase(), 8 * s, 92 * s);
  }
  _artCache.set(key, c);
  return c;
}
