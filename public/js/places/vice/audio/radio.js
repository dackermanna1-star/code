// The radio: music made on the fly, a different station for every taste.
// Each station has a style (tempo, drums, bass, chords, lead) and makes a
// new song from a seed every couple of minutes - a chord progression, a
// bass line, an arpeggio and a hook - played by a little synth band with a
// lookahead scheduler. Plays in cars, bikes and boats; Q and E change the
// station; the HUD shows its name and the song when you tune in.
//
//   V.radio = new Radio()   next() prev() off()   station (name or null)   setVolume(v)   update(dt)
import { V } from '../state.js';
import { sounds } from '../../../engine/Sound.js';

const STATIONS = [
  { name: 'Flash 84', style: 'synthpop', bpm: 112, key: 9, minor: true, songs: ['Neon Heartbreak', 'Ocean Drive Nights', 'Electric Sunset', 'Pastel Dreams', 'Midnight Highway'] },
  { name: 'Wave 103', style: 'newwave', bpm: 128, key: 4, minor: true, songs: ['Cold Chrome', 'Static Love', 'Parallel Lines', 'Glass Hearts', 'Danger Zone Blues'] },
  { name: 'Fever 105', style: 'disco', bpm: 118, key: 2, minor: false, songs: ['Boogie On Collins', 'Get Down Tonight', 'Mirrorball Lady', 'Saturday Heat', 'Funky Flamingo'] },
  { name: 'Radio Caliente', style: 'latin', bpm: 98, key: 7, minor: true, songs: ['Calle Ocho', 'Mi Corazón de Neón', 'Salsa del Puerto', 'Noche Tropical', 'La Bahía'] },
  { name: 'V-Rock', style: 'rock', bpm: 138, key: 4, minor: true, songs: ['Highway Burner', 'Steel Palms', 'Wild Side of Vice', 'Live Fast', 'Thunder Coast'] },
];
const PROG = { true: [[0, 5, 3, 4], [0, 3, 6, 4], [0, 6, 3, 4], [0, 5, 6, 4]], false: [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 4], [0, 4, 3, 4]] };
const SCALE = { true: [0, 2, 3, 5, 7, 8, 10], false: [0, 2, 4, 5, 7, 9, 11] };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Radio {
  constructor() {
    this.index = 0; this.on = false; this.vol = V.settings?.music ?? 0.8;
    this.h = null; this.song = null; this.step = 0; this.next16 = 0;
    this.seeds = STATIONS.map((_, i) => 1000 + i * 77);
  }
  get station() { return this.on ? STATIONS[this.index].name : null; }
  setVolume(v) { this.vol = v; this.h?.setVolume(this._vol()); }
  _vol() { return 0.32 * this.vol; }
  next() { this.index = (this.index + 1) % (STATIONS.length + 1); this._tune(); }
  prev() { this.index = (this.index + STATIONS.length) % (STATIONS.length + 1); this._tune(); }
  off() { this.on = false; this._stop(); }
  _tune() {
    this._stop();
    if (this.index >= STATIONS.length) { this.on = false; V.hud?.radio('Radio Off'); return; }
    this.on = true;
    this._newSong(true);
  }
  _stop() { if (this.h) { this.h.stop(); this.h = null; } }

  _newSong(announce) {
    const st = STATIONS[this.index];
    const r = rng(this.seeds[this.index]++);
    const minor = st.minor;
    const prog = PROG[minor][Math.floor(r() * 4)];
    const sc = SCALE[minor];
    const hook = []; // a 2-bar hook in scale degrees (-1 = rest)
    for (let i = 0; i < 16; i++) hook.push(r() < (st.style === 'rock' ? 0.45 : 0.55) ? Math.floor(r() * 7) + (r() < 0.25 ? 7 : 0) : -1);
    const arp = [0, 2, 4, 7, 4, 2].map((x) => x + (r() < 0.3 ? 1 : 0));
    this.song = { st, prog, sc, hook, arp, title: st.songs[Math.floor(r() * st.songs.length)], bars: 0, len: 48 + Math.floor(r() * 3) * 8, swing: st.style === 'disco' || st.style === 'latin' ? 0.08 : 0 };
    this.step = 0;
    if (announce) V.hud?.radio(st.name, this.song.title);
  }

  update(dt) {
    const veh = V.player?.vehicle;
    const can = veh && ['car', 'bike', 'boat'].includes(veh.kind) && V.session?.state === 'play';
    // Q / E in a vehicle
    const inp = V.input;
    if (can && inp?.pressed) {
      if (inp.pressed.has('code:KeyE') || inp.pressed.has('e')) this.next();
      else if (inp.pressed.has('code:KeyQ') || inp.pressed.has('q')) this.prev();
    }
    // tune in when you get in, off when you get out
    if (can && !this.wasIn) { this.wasIn = true; if (this.index < STATIONS.length) { this.on = true; this._newSong(true); } }
    if (!can && this.wasIn) { this.wasIn = false; this._stop(); return; }
    if (!can || !this.on) return;
    if (!this.h) { const h = sounds.customLoop(() => ({ stop() {} }), this._vol()); if (h.dead) return; this.h = h; this.next16 = h.ctx.currentTime + 0.1; }
    // schedule the next notes, 0.25 s ahead
    const c = this.h.ctx, out = this._out();
    if (!out) return;
    const st = this.song.st, s16 = 60 / st.bpm / 4;
    while (this.next16 < c.currentTime + 0.25) {
      this._play16(c, out, this.next16, this.step);
      this.next16 += s16 * (1 + (this.step % 2 ? -this.song.swing : this.song.swing));
      this.step++;
      if (this.step % 16 === 0 && ++this.song.bars >= this.song.len) { this._jingle(c, out, this.next16); this._newSong(false); this.next16 += s16 * 16; V.hud?.radio(st.name, this.song.title); }
    }
  }
  /** The station's bus (customLoop's gain node isn't exposed, so make our own once). */
  _out() {
    if (this.bus && this.busCtx === this.h.ctx) { this.bus.gain.setTargetAtTime(this._vol() * 3, this.h.ctx.currentTime, 0.1); return this.bus; }
    const c = this.h.ctx;
    // route through a quick master: compressor -> destination via the Sound master is private, so go direct
    const g = c.createGain(); g.gain.value = this._vol() * 3;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    g.connect(comp); comp.connect(c.destination);
    this.bus = g; this.busCtx = c;
    const stop = this.h.stop; const self = this;
    this.h.stop = () => { stop(); g.gain.setTargetAtTime(0, c.currentTime, 0.05); setTimeout(() => { try { comp.disconnect(); } catch (e) { /* gone */ } }, 300); self.bus = null; };
    return g;
  }

  _play16(c, out, t, i) {
    const S = this.song, st = S.st, bar = Math.floor(i / 16) % 4, b16 = i % 16;
    const root = 48 + st.key + S.sc[S.prog[bar]];
    const deg = (d) => { const o = Math.floor(d / 7); return st.key + S.sc[((d % 7) + 7) % 7] + 12 * o; };
    const chord = [0, 2, 4].map((x) => 60 + deg(S.prog[bar] + x));
    const intro = S.bars < 2, breakdown = S.bars % 16 >= 12 && S.bars % 16 < 14;
    // drums
    const four = st.style === 'disco' || st.style === 'synthpop' || st.style === 'newwave';
    if (st.style === 'latin') {
      const clave = [0, 3, 6, 10, 12];
      if (clave.includes(b16)) click(c, out, t, 2400, 0.18);
      if (b16 % 4 === 2 || b16 === 15) conga(c, out, t, b16 === 15 ? 320 : 240);
      if (b16 === 0 || b16 === 8) kick(c, out, t, 0.7);
    } else {
      if ((four && b16 % 4 === 0) || (!four && (b16 === 0 || b16 === 6 || b16 === 10))) if (!breakdown) kick(c, out, t, 1);
      if (b16 === 4 || b16 === 12) if (!intro) snare(c, out, t, st.style === 'synthpop' ? 0.9 : 0.75, st.style !== 'rock');
      if (st.style === 'disco' ? b16 % 4 === 2 : b16 % 2 === 0) hat(c, out, t, st.style === 'disco' && b16 % 4 === 2 ? 0.22 : 0.1, st.style === 'disco' && b16 % 4 === 2);
    }
    if (intro) return;
    // bass
    if (st.style === 'disco') { if (b16 % 2 === 0) synth(c, out, t, hz(root + (b16 % 4 === 2 ? 12 : 0) - 12), 0.14, 'sawtooth', 0.32, 700); }
    else if (st.style === 'rock') { if (b16 % 2 === 0) synth(c, out, t, hz(root - 12), 0.15, 'square', 0.22, 500); }
    else if (st.style === 'latin') { if ([0, 3, 6, 8, 11, 14].includes(b16)) synth(c, out, t, hz(root - 12 + (b16 === 6 || b16 === 14 ? 7 : 0)), 0.2, 'triangle', 0.4, 900); }
    else if (b16 % 2 === 0) synth(c, out, t, hz(root - 12 + (b16 % 8 === 6 ? 12 : 0)), 0.13, 'sawtooth', 0.3, 520 + 300 * (b16 % 4 === 0));
    // chords: pads, stabs or a power chord
    if (st.style === 'rock') { if (b16 % 8 === 0 && !breakdown) for (const m of [root, root + 7, root + 12]) synth(c, out, t, hz(m), 0.9, 'sawtooth', 0.08, 1600, true); }
    else if (st.style === 'disco') { if (b16 === 2 || b16 === 10) for (const m of chord) synth(c, out, t, hz(m), 0.18, 'sawtooth', 0.06, 2600); }
    else if (st.style === 'latin') { if ([0, 3, 4, 7, 10, 11, 14].includes(b16)) for (const m of chord) synth(c, out, t, hz(m + 12), 0.12, 'triangle', 0.05, 3000); }
    else if (b16 === 0) for (const m of chord) synth(c, out, t, hz(m), (60 / st.bpm) * 4 * 0.98, 'sawtooth', 0.045, 1200, true);
    // arpeggio (synth-pop, new wave)
    if ((st.style === 'synthpop' || st.style === 'newwave') && !breakdown) synth(c, out, t, hz(60 + 12 + deg(S.prog[bar] + S.arp[b16 % S.arp.length])), 0.1, 'square', 0.035, 2200);
    // the hook, every other phrase
    if (S.bars % 8 >= 4 || breakdown) {
      const n = S.hook[i % 16];
      if (n >= 0) synth(c, out, t, hz(72 + deg(n)), (60 / st.bpm) * 0.45, st.style === 'rock' ? 'sawtooth' : st.style === 'latin' ? 'triangle' : 'square', st.style === 'rock' ? 0.07 : 0.08, st.style === 'rock' ? 1800 : 3200, false, st.style !== 'latin');
    }
  }

  _jingle(c, out, t) {
    // the station ident: a rising sweep and two chimes
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(1760, t + 0.6);
    g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.75);
    synth(c, out, t + 0.6, 1318, 0.5, 'triangle', 0.15, 6000); synth(c, out, t + 0.75, 1760, 0.8, 'triangle', 0.15, 6000);
  }
}

// ---- the band ----
let NB = null;
function nbuf(c) { if (NB && NB.sampleRate === c.sampleRate) return NB; const n = c.sampleRate, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; NB = b; return b; }
function synth(c, out, t, f, dur, type, vol, cut, pad = false, vib = false) {
  const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
  o.type = type; o2.type = type; o.frequency.value = f; o2.frequency.value = f; o2.detune.value = pad ? 11 : 6;
  if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = f * 0.006; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.1); }
  fl.type = 'lowpass'; fl.frequency.setValueAtTime(cut, t); if (!pad) fl.frequency.exponentialRampToValueAtTime(Math.max(200, cut * 0.35), t + dur);
  const a = pad ? dur * 0.25 : 0.005;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setValueAtTime(vol, t + Math.max(a, dur * 0.7)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(out);
  o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
function kick(c, out, t, v) { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32); }
function snare(c, out, t, v, gated) {
  const s = c.createBufferSource(); s.buffer = nbuf(c); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.6;
  const g = c.createGain(); g.gain.setValueAtTime(0.5 * v, t);
  if (gated) { g.gain.setValueAtTime(0.42 * v, t + 0.16); g.gain.linearRampToValueAtTime(0.0001, t + 0.2); } // the big 80s gated reverb
  else g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 0.25);
  const o = c.createOscillator(), og = c.createGain(); o.frequency.value = 190; og.gain.setValueAtTime(0.3 * v, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.12);
}
function hat(c, out, t, v, open) { const s = c.createBufferSource(); s.buffer = nbuf(c); const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500; const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.22 : 0.05)); s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 0.25); }
function click(c, out, t, f0, v) { const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = f0; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.05); }
function conga(c, out, t, f0) { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.75, t + 0.15); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.22); }
