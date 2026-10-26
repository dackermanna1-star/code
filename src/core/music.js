// Procedural music: an endless generative "radio" with several stations.
// Used by the phone music app, speakers, record players, the TV and games.
import { G } from '../game.js';
import { NOTE } from './audio.js';
import { seeded } from './utils.js';

export const STATIONS = {
  lofi: { name: 'Lo-Fi Beats', desc: 'Dusty chords & soft drums', bpm: 76, swing: 0.12, color: '#c9a37c', scale: 'dorian', root: 50, drums: 'boombap', lead: 'keys', crackle: true },
  jazz: { name: 'Late Night Jazz', desc: 'Walking bass & smoky keys', bpm: 104, swing: 0.3, color: '#6f7fd6', scale: 'mixolydian', root: 48, drums: 'brush', lead: 'keys', walking: true },
  synth: { name: 'Neon Synthwave', desc: 'Retro arps & big pads', bpm: 112, swing: 0, color: '#ff4fa3', scale: 'minor', root: 45, drums: 'gated', lead: 'saw', arp: true },
  ambient: { name: 'Rain Ambient', desc: 'Slow, warm drones', bpm: 60, swing: 0, color: '#5bb3a8', scale: 'lydian', root: 52, drums: 'none', lead: 'pad' },
  chip: { name: '8-Bit Arcade', desc: 'Bleeps from the console era', bpm: 132, swing: 0, color: '#7ad151', scale: 'major', root: 60, drums: 'chip', lead: 'square', arp: true },
  pop: { name: 'Bedroom Pop', desc: 'Sunny guitars & handclaps', bpm: 98, swing: 0.05, color: '#ffb347', scale: 'major', root: 55, drums: 'pop', lead: 'pluck' },
  classical: { name: 'Piano Études', desc: 'Gentle arpeggiated piano', bpm: 84, swing: 0, color: '#d8d0c0', scale: 'major', root: 48, drums: 'none', lead: 'piano', arp: true },
  bossa: { name: 'Café Bossa', desc: 'Breezy nylon & shakers', bpm: 128, swing: 0.08, color: '#e0784f', scale: 'dorian', root: 50, drums: 'bossa', lead: 'pluck' },
};

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
const PROGS = [[0, 5, 3, 4], [0, 3, 4, 3], [1, 4, 0, 0], [0, 4, 5, 3], [5, 3, 0, 4], [0, 2, 3, 4], [1, 4, 0, 5]];

export class MusicPlayer {
  // opts: { station, pos (for spatial), volume, lofi (muffled filter) }
  constructor(opts = {}) {
    this.audio = G.audio;
    this.station = opts.station || 'lofi';
    this.volume = opts.volume ?? 0.6;
    this.pos = opts.pos || null;
    this.playing = false;
    this.seed = Math.floor(Math.random() * 1e6);
    this.filterFreq = opts.filterFreq || 16000;
    this.onBeat = null;
  }

  start() {
    const a = this.audio;
    if (!a.ready || this.playing) return;
    const ctx = a.ctx;
    const { gain, panner } = a._out({ pos: this.pos, volume: 0, bus: 'music', refDistance: 2.2 });
    this.out = gain; this.panner = panner;
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = this.filterFreq;
    this.bus = ctx.createGain(); this.bus.gain.value = 1;
    this.bus.connect(this.filter).connect(this.out);
    gain.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.4);
    this.playing = true;
    this._initSong();
    this.nextTime = ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this._schedule(), 30);
    if (STATIONS[this.station].crackle) this.crackle = a.loop('crackle', { pos: this.pos, volume: 0.35 * this.volume, bus: 'music' });
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    const ctx = this.audio.ctx;
    this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    const out = this.out, panner = this.panner;
    setTimeout(() => { try { out.disconnect(); panner?.disconnect(); } catch { /* noop */ } }, 1500);
    this.crackle?.stop();
    this.crackle = null;
  }

  setStation(s) {
    const was = this.playing;
    this.stop();
    this.station = s;
    this.seed = Math.floor(Math.random() * 1e6);
    if (was) setTimeout(() => this.start(), 60);
  }

  setVolume(v) {
    this.volume = v;
    if (this.playing) this.out.gain.setTargetAtTime(v, this.audio.ctx.currentTime, 0.1);
  }

  setPos(p) { if (this.panner) this.audio._setPannerPos(this.panner, p); this.crackle?.setPos(p); }

  get info() { return STATIONS[this.station]; }

  _initSong() {
    const st = STATIONS[this.station];
    this.rnd = seeded(this.seed);
    this.scale = SCALES[st.scale];
    this.prog = PROGS[Math.floor(this.rnd() * PROGS.length)];
    this.root = st.root + Math.floor(this.rnd() * 5) - 2;
    this.bar = 0;
    this.melodyMotif = Array.from({ length: 8 }, () => (this.rnd() < 0.7 ? Math.floor(this.rnd() * 7) : -1));
    this.trackName = makeTrackName(this.rnd);
  }

  _deg(d, octave = 0) {
    const s = this.scale; const n = s.length;
    const o = Math.floor(d / n);
    return this.root + s[((d % n) + n) % n] + 12 * (o + octave);
  }

  _schedule() {
    const ctx = this.audio.ctx;
    const st = STATIONS[this.station];
    const sixteenth = 60 / st.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      let t = this.nextTime;
      if (this.step % 2 === 1) t += st.swing * sixteenth;
      this._playStep(this.step, t, sixteenth);
      this.nextTime += sixteenth;
      this.step++;
      if (this.step % 16 === 0) {
        this.bar++;
        if (this.bar % 16 === 0) { this.seed++; this._initSong(); }
      }
    }
  }

  _playStep(step, t, sx) {
    const st = STATIONS[this.station];
    const s16 = step % 16;
    const chordDeg = this.prog[this.bar % this.prog.length];
    const out = this.bus;
    if (s16 === 0) this.onBeat?.(this.bar);
    // ---- drums
    const dr = st.drums;
    if (dr !== 'none') {
      const kickPat = { boombap: [0, 10], gated: [0, 4, 8, 12], chip: [0, 8], pop: [0, 7, 8], brush: [0, 8], bossa: [0, 6, 8, 14] }[dr];
      const snarePat = { boombap: [4, 12], gated: [4, 12], chip: [4, 12], pop: [4, 12], brush: [4, 12], bossa: [] }[dr];
      if (kickPat.includes(s16)) this._kick(out, t, dr);
      if (snarePat.includes(s16)) this._snare(out, t, dr);
      if (dr === 'bossa' && [3, 7, 10, 13].includes(s16)) this._rim(out, t);
      const hatEvery = dr === 'gated' || dr === 'pop' ? 2 : dr === 'brush' ? 4 : 2;
      if (s16 % hatEvery === 0 && this.rnd() < 0.92) this._hat(out, t, dr, s16 % 4 === 2 ? 1 : 0.6);
    }
    // ---- chords (pads / keys) on bar start (and mid-bar for some)
    if (s16 === 0 || (s16 === 8 && st.lead === 'keys' && this.rnd() < 0.5)) {
      const notes = [0, 2, 4, 6].map((i) => this._deg(chordDeg + i, 0));
      const dur = sx * (s16 === 0 ? 15 : 7);
      for (const n of notes) this._voice(out, t, NOTE(n), dur, st.lead === 'pad' || st.lead === 'saw' ? 'pad' : st.lead === 'piano' ? 'piano' : 'keys', 0.06);
    }
    // ---- bass
    if (st.walking) {
      if (s16 % 4 === 0) {
        const d = chordDeg + [0, 2, 4, 5][s16 / 4] - 7;
        this._bass(out, t, NOTE(this._deg(d, -1)), sx * 3.5);
      }
    } else if ([0, 6, 10].includes(s16) || (st.drums === 'gated' && s16 % 2 === 0)) {
      this._bass(out, t, NOTE(this._deg(chordDeg, -1)), sx * (st.drums === 'gated' ? 1.6 : 3));
    }
    // ---- arps
    if (st.arp && s16 % 2 === 0) {
      const idx = (s16 / 2) % 4;
      const n = this._deg(chordDeg + [0, 2, 4, 7][idx], 1);
      this._voice(out, t, NOTE(n), sx * 1.6, st.lead === 'square' ? 'square' : st.lead === 'piano' ? 'piano' : 'pluck', 0.05);
    }
    // ---- melody
    if (s16 % 2 === 0 && this.bar % 4 !== 3) {
      const m = this.melodyMotif[(s16 / 2 + this.bar) % 8];
      if (m >= 0 && this.rnd() < 0.55) {
        const n = this._deg(chordDeg + m, 1);
        const kind = st.lead === 'pad' ? 'bell' : st.lead === 'saw' ? 'lead' : st.lead;
        this._voice(out, t, NOTE(n), sx * (2 + Math.floor(this.rnd() * 3)), kind, 0.06);
      }
    }
  }

  _voice(out, t, freq, dur, kind, vol) {
    const a = this.audio; const ctx = a.ctx;
    const g = ctx.createGain(); g.connect(out);
    const types = { keys: ['sine', 'triangle'], piano: ['triangle', 'sine'], pad: ['sawtooth', 'sawtooth'], pluck: ['triangle', 'square'], square: ['square'], lead: ['sawtooth'], bell: ['sine', 'sine'] }[kind] || ['sine'];
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.value = kind === 'pad' ? 900 : kind === 'lead' ? 2400 : kind === 'pluck' ? 3000 : kind === 'square' ? 3500 : 2000;
    f.connect(g);
    types.forEach((type, i) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq * (kind === 'bell' && i ? 2.01 : 1);
      o.detune.value = kind === 'pad' ? (i ? 9 : -9) : (i ? 4 : 0);
      const og = ctx.createGain(); og.gain.value = i ? 0.35 : 1;
      o.connect(og).connect(f); o.start(t); o.stop(t + dur + 0.6);
    });
    const peak = vol * (kind === 'square' ? 0.5 : kind === 'pad' ? 0.6 : 1);
    if (kind === 'pad') {
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
    } else {
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + (kind === 'keys' || kind === 'piano' ? 0.5 : 0.15));
    }
    if (kind === 'keys') { // tremolo
      const lfo = ctx.createOscillator(); lfo.frequency.value = 4.5; const lg = ctx.createGain(); lg.gain.value = peak * 0.25;
      lfo.connect(lg).connect(g.gain); lfo.start(t); lfo.stop(t + dur + 0.6);
    }
    setTimeout(() => { try { g.disconnect(); } catch { /* noop */ } }, (t - ctx.currentTime + dur + 1.5) * 1000);
  }

  _bass(out, t, freq, dur) {
    const a = this.audio; const ctx = a.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = freq / 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    o.connect(g); s.connect(g); g.connect(out);
    o.start(t); s.start(t); o.stop(t + dur + 0.2); s.stop(t + dur + 0.2);
  }

  _kick(out, t, kind) {
    const a = this.audio; const ctx = a.ctx;
    const o = ctx.createOscillator(); o.type = kind === 'chip' ? 'square' : 'sine';
    o.frequency.setValueAtTime(kind === 'chip' ? 180 : 140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(kind === 'chip' ? 0.12 : 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.32);
  }
  _snare(out, t, kind) {
    const a = this.audio;
    const peak = kind === 'brush' ? 0.12 : kind === 'chip' ? 0.15 : 0.3;
    a._noiseBurst(out, t, { type: kind === 'brush' ? 'bandpass' : 'highpass', freq: kind === 'brush' ? 3000 : 1500, dur: kind === 'gated' ? 0.25 : 0.14, peak, attack: kind === 'brush' ? 0.03 : 0.001 });
    if (kind !== 'brush') a._tone(out, t, { freq: 190, freqEnd: 140, dur: 0.08, peak: peak * 0.5 });
    if (kind === 'pop') a._noiseBurst(out, t + 0.012, { type: 'bandpass', freq: 1200, q: 1, dur: 0.06, peak: 0.2 });
  }
  _hat(out, t, kind, v) {
    this.audio._noiseBurst(out, t, { type: 'highpass', freq: kind === 'brush' ? 5000 : 8000, dur: kind === 'brush' ? 0.08 : 0.035, peak: 0.06 * v, attack: kind === 'brush' ? 0.02 : 0.001 });
  }
  _rim(out, t) { this.audio._tone(out, t, { type: 'triangle', freq: 1700, dur: 0.03, peak: 0.08 }); }
}

const W1 = ['Midnight', 'Velvet', 'Paper', 'Quiet', 'Neon', 'Window', 'Sunday', 'Coffee', 'Lazy', 'Static', 'Golden', 'Rainy', 'Pixel', 'Soft', 'Slow', 'Cloud', 'Late', 'Honey', 'Lamp', 'Rooftop'];
const W2 = ['Lights', 'Morning', 'Avenue', 'Dreams', 'Hours', 'Window', 'Balcony', 'Streets', 'Rain', 'Blanket', 'Signals', 'Daydream', 'Steps', 'Haze', 'Glow', 'Echo', 'Sofa', 'Tape', 'Tides', 'Sky'];
const ARTISTS = ['kōji', 'Loam', 'nightbus', 'Mira Vale', 'the attic', 'saltwater', 'DJ Couch', 'Pale Fern', 'hollow tea', 'Juno Park', 'blue ceramic', 'Ottoline'];
function makeTrackName(rnd) {
  return { title: `${W1[Math.floor(rnd() * W1.length)]} ${W2[Math.floor(rnd() * W2.length)]}`, artist: ARTISTS[Math.floor(rnd() * ARTISTS.length)] };
}
