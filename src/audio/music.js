// =============================================================================
// BOARDING MUSIC - an original, gentle generative instrumental (soft electric
// piano comping + warm pad + upright-ish bass + sparse pentatonic melody, a
// whisper of brushes) in D major, ~74 bpm, played through the PA bus so it
// sounds like it comes out of the ceiling speakers. Never repeats exactly:
// voicings, rhythms and the melody are chosen with a seeded random walk.
// Scheduled with a look-ahead scheduler on the audio clock.
// =============================================================================
import { rng } from './dsp.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// [bass, voicing...]
const PROG = [
  [38, 54, 57, 61, 64],   // Dmaj9
  [47, 50, 54, 57, 61],   // Bm9
  [40, 55, 59, 62, 66],   // Em9
  [45, 55, 59, 62, 64],   // A7sus4
  [43, 54, 57, 59, 62],   // Gmaj9
  [42, 52, 57, 61, 64],   // F#m7
  [40, 55, 59, 62, 64],   // Em7
  [45, 55, 61, 64, 66],   // A13
];
const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81];

export class BoardingMusic {
  constructor(ctx, out, bank) {
    this.ctx = ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 5200;
    this.out.connect(this.tone); this.tone.connect(out);
    this.bank = bank;
    this.r = rng(1987);
    this.beat = 60 / 74;
    this.next = 0;          // next beat time (audio clock)
    this.step = 0;          // beat counter
    this.chord = 0;
    this.mel = 3;
    this.level = 0;
    this.on = false;
    // e-piano wave (tine + body harmonics), pad wave
    const mk = (amps) => { const re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1); amps.forEach((a, i) => { im[i + 1] = a; }); return ctx.createPeriodicWave(re, im); };
    this.epWave = mk([1, 0.42, 0.1, 0.12, 0.03, 0.02, 0.025]);
    this.padWave = mk([1, 0.3, 0.12, 0.07, 0.04, 0.025, 0.015, 0.01]);
  }

  /** on: boardingMusic flag; duck: 0..1 multiplier (PA voice active -> duck) */
  update(on, duck = 1) {
    const ctx = this.ctx, now = ctx.currentTime;
    const tgt = on ? 0.32 * duck : 0;
    if (Math.abs(tgt - this.level) > 1e-4) { this.out.gain.setTargetAtTime(tgt, now, on ? (duck < 1 ? 0.35 : 1.2) : 1.8); this.level = tgt; }
    if (on && !this.on) { this.next = now + 0.2; }
    this.on = on;
    if (ctx.state !== 'running') return;
    if (!on && this.out.gain.value < 0.002) return;
    if (this.next < now - 1) this.next = now + 0.1;   // resumed after a stall
    while (this.next < now + 0.6) { this._beat(this.next); this.next += this.beat; this.step++; }
  }

  _beat(t) {
    const r = this.r, b = this.step % 8, beat = this.beat;
    if (b === 0) {
      if (this.step > 0) this.chord = (this.chord + 1) % PROG.length;
      if (r() < 0.12 && this.chord % 2 === 1) this.chord = (this.chord + PROG.length - 1) % PROG.length; // linger
      const ch = PROG[this.chord];
      this._pad(t, ch.slice(1), beat * 8);
      this._bass(t, ch[0], 1.0);
      this._ep(t + 0.02, ch.slice(1), 0.55);
    } else {
      const ch = PROG[this.chord];
      if (b === 4) this._bass(t, r() < 0.7 ? ch[0] : ch[0] + 7, 0.75);
      if ((b === 3 || b === 6) && r() < 0.6) this._ep(t + beat * 0.5 + 0.03, ch.slice(1 + Math.floor(r() * 2)), 0.32 + r() * 0.12);
      else if (r() < 0.15) this._ep(t + beat * (r() < 0.5 ? 0 : 0.5), ch.slice(2), 0.25);
    }
    // melody: sparse, stepwise, mostly on the beat or the swung off-beat
    if (r() < 0.32) {
      this.mel = Math.max(0, Math.min(SCALE.length - 1, this.mel + Math.floor(r() * 5) - 2));
      const swing = r() < 0.4 ? beat * 0.62 : 0;
      this._ep(t + swing, [SCALE[this.mel] + 12], 0.28 + r() * 0.12, 1.9);
    }
    // brushes on 2 & 4
    if (b % 2 === 1 && this.bank) this._brush(t, 0.012 + r() * 0.006);
  }

  _voice(t, f, wave, a, attack, decay, dur, lp = 3000) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), f2 = ctx.createBiquadFilter();
    o.setPeriodicWave(wave); o.frequency.value = f;
    f2.type = 'lowpass'; f2.frequency.setValueAtTime(lp, t); f2.frequency.exponentialRampToValueAtTime(Math.max(300, lp * 0.35), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a, t + attack);
    g.gain.setTargetAtTime(0, t + attack, decay);
    o.connect(f2); f2.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dur + decay * 5);
    o.onended = () => { try { g.disconnect(); f2.disconnect(); } catch { /* */ } };
  }

  _ep(t, notes, vel, len = 2.6) {
    for (let i = 0; i < notes.length; i++) {
      const f = mtof(notes[i]) * (1 + (this.r() - 0.5) * 0.002);
      this._voice(t + i * 0.012 * this.r(), f, this.epWave, vel * 0.16 / Math.sqrt(notes.length), 0.006, 0.9 + 0.5 * len / 2.6, len, 2600 + vel * 3000);
    }
  }
  _pad(t, notes, dur) {
    const ctx = this.ctx;
    for (const n of notes) {
      for (const det of [-0.0025, 0.0025]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.setPeriodicWave(this.padWave); o.frequency.value = mtof(n) * (1 + det);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.012, t + 1.8);
        g.gain.setValueAtTime(0.012, t + dur - 0.4);
        g.gain.linearRampToValueAtTime(0, t + dur + 1.6);
        o.connect(g); g.connect(this.out);
        o.start(t); o.stop(t + dur + 1.7);
        o.onended = () => { try { g.disconnect(); } catch { /* */ } };
      }
    }
  }
  _bass(t, n, vel) { this._voice(t, mtof(n), this.epWave, 0.09 * vel, 0.012, 0.55, 1.4, 700); }
  _brush(t, a) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
    s.buffer = this.bank.white; hp.type = 'highpass'; hp.frequency.value = 5500;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.015); g.gain.setTargetAtTime(0, t + 0.02, 0.05);
    s.connect(hp); hp.connect(g); g.connect(this.out);
    s.start(t, this.r() * 4); s.stop(t + 0.4);
    s.onended = () => { try { g.disconnect(); hp.disconnect(); } catch { /* */ } };
  }
}
