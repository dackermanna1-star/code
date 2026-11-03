import type { AudioSys } from '../audio/audio';
import { CLUB_BEAT } from '../anim/lib/dance';

/**
 * The Lantern's sound system, inside: a house track at 122 BPM (kick, claps, hats, an off-beat
 * bass, chord stabs, a pad, an arpeggio on the second phrase), synthesised once into an 8-bar
 * loop. Loud on the floor, muffled through the walls of the back rooms and the office, a thump
 * on the roof; and when the alarm goes, the record grinds to a stop and the siren takes over.
 */
export class ClubMix {
  private src: AudioBufferSourceNode | null = null;
  private lp: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private siren: { o: OscillatorNode; g: GainNode; lfo: OscillatorNode } | null = null;
  private stopped = false;
  constructor(private audio: AudioSys) {
    const c = audio.ctx;
    if (!c) return;
    const buf = ClubMix.render(c);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 18000;
    lp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(lp);
    lp.connect(g);
    g.connect(audio.music);
    src.start();
    this.src = src;
    this.lp = lp;
    this.gain = g;
  }

  /** Where she is decides what she hears: 1 on the floor .. 0 out of earshot; `muffle` 0 clear .. 1 through a wall. */
  set(level: number, muffle: number, fade = 0.25) {
    const c = this.audio.ctx;
    if (!c || !this.gain || !this.lp || this.stopped) return;
    const t = c.currentTime;
    this.gain.gain.setTargetAtTime(0.5 * level, t, fade);
    this.lp.frequency.setTargetAtTime(18000 * Math.pow(220 / 18000, muffle), t, fade);
  }
  /** The needle off the record: the track grinds down and stops. */
  scratch() {
    const c = this.audio.ctx;
    if (!c || !this.src || this.stopped) return;
    this.stopped = true;
    const t = c.currentTime;
    this.src.playbackRate.setValueAtTime(1, t);
    this.src.playbackRate.exponentialRampToValueAtTime(0.05, t + 0.9);
    this.gain?.gain.setTargetAtTime(0, t + 0.5, 0.15);
    const s = this.src;
    setTimeout(() => s.stop(), 1800);
  }
  /** The building's alarm: a two-tone wail (on, or off). */
  alarm(on: boolean) {
    const c = this.audio.ctx;
    if (!c) return;
    if (on && !this.siren) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = 760;
      const lfo = c.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 1.6;
      const lg = c.createGain();
      lg.gain.value = 170;
      lfo.connect(lg);
      lg.connect(o.frequency);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 1.4;
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.045, c.currentTime, 0.3);
      o.connect(bp);
      bp.connect(g);
      g.connect(this.audio.amb);
      o.start();
      lfo.start();
      this.siren = { o, g, lfo };
    } else if (!on && this.siren) {
      const s = this.siren;
      s.g.gain.setTargetAtTime(0, c.currentTime, 0.4);
      setTimeout(() => {
        s.o.stop();
        s.lfo.stop();
      }, 2000);
      this.siren = null;
    }
  }
  /** The siren's loudness (it fades with distance from the building's sounders). */
  sirenLevel(v: number) {
    const c = this.audio.ctx;
    if (!c || !this.siren) return;
    this.siren.g.gain.setTargetAtTime(0.045 * v, c.currentTime, 0.3);
  }
  dispose() {
    this.alarm(false);
    if (!this.stopped) {
      this.stopped = true;
      const c = this.audio.ctx;
      if (c && this.gain) this.gain.gain.setTargetAtTime(0, c.currentTime, 0.3);
      const s = this.src;
      setTimeout(() => s?.stop(), 1500);
    }
  }

  // ------------------------------------------------------------------ the track
  private static render(c: BaseAudioContext): AudioBuffer {
    const sr = c.sampleRate;
    const beat = CLUB_BEAT;
    const BARS = 8;
    const len = Math.round(beat * 4 * BARS * sr);
    const buf = c.createBuffer(2, len, sr);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    // A minor: Am F C G, a bar each
    const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const add = (i0: number, n: number, f: (t: number) => number, pan = 0) => {
      const gl = 1 - Math.max(0, pan), gr = 1 + Math.min(0, pan);
      for (let i = 0; i < n; i++) {
        const j = (i0 + i) % len;
        const v = f(i / sr);
        L[j] += v * gl;
        R[j] += v * gr;
      }
    };
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const noise = new Float32Array(Math.round(sr * 0.5));
    for (let i = 0; i < noise.length; i++) noise[i] = rnd();
    for (let bar = 0; bar < BARS; bar++) {
      const chord = PROG[bar % 4];
      for (let b = 0; b < 4; b++) {
        const t0 = Math.round(((bar * 4 + b) * beat) * sr);
        // kick
        add(t0, Math.round(0.38 * sr), (t) => Math.sin(2 * Math.PI * (48 * t + (110 / 30) * (1 - Math.exp(-t * 30)))) * Math.exp(-t * 7.5) * 0.85);
        // clap on 2 and 4 (three quick noise hits, a tail)
        if (b === 1 || b === 3) {
          for (const off of [0, 0.011, 0.023]) {
            const ti = t0 + Math.round(off * sr);
            let lp = 0;
            add(ti, Math.round(0.16 * sr), (t) => {
              const n = noise[Math.floor(t * sr) % noise.length];
              lp += (n - lp) * 0.45;
              return (n - lp) * Math.exp(-t * (off === 0.023 ? 18 : 60)) * 0.32;
            });
          }
        }
        // hats: the off-beat open, closed sixteenths around it
        for (let s = 0; s < 4; s++) {
          const ti = t0 + Math.round((s * beat * sr) / 4);
          const open = s === 2;
          const vel = open ? 0.16 : s % 2 ? 0.07 : 0.045;
          let hp = 0;
          add(ti, Math.round((open ? 0.2 : 0.04) * sr), (t) => {
            const n = noise[(Math.floor(t * sr) * 7) % noise.length];
            const o = n - hp;
            hp = n * 0.85;
            return o * Math.exp(-t * (open ? 16 : 90)) * vel;
          }, s % 2 ? 0.25 : -0.2);
        }
        // the off-beat bass: the chord's root, an octave down
        {
          const f = hz(chord[0] - 24);
          const ti = t0 + Math.round((beat * sr) / 2);
          add(ti, Math.round(beat * 0.45 * sr), (t) => {
            const ph = (f * t) % 1;
            const env = Math.min(1, t * 300) * Math.exp(-t * 5);
            return ((ph * 2 - 1) * 0.35 + Math.sin(2 * Math.PI * f * t) * 0.6) * env * 0.42;
          });
        }
        // chord stabs on the "and" of 2 and 4
        if (b === 1 || b === 3) {
          const ti = t0 + Math.round((beat * sr) / 2);
          for (const [k, m] of chord.entries()) {
            const f = hz(m + 12);
            add(ti, Math.round(0.22 * sr), (t) => {
              const ph = (f * t * (1 + k * 0.002)) % 1;
              return (ph * 2 - 1) * Math.exp(-t * 14) * 0.06;
            }, (k - 1) * 0.4);
          }
        }
      }
      // the pad: the whole bar, soft
      const t0 = Math.round(bar * 4 * beat * sr);
      for (const m of chord) {
        const f = hz(m);
        add(t0, Math.round(4 * beat * sr), (t) => {
          const env = Math.min(1, t * 2) * Math.min(1, (4 * beat - t) * 3);
          return (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.004 * t) * 0.6) * env * 0.022;
        });
      }
      // the arpeggio, on the second phrase
      if (bar >= 4) {
        for (let s = 0; s < 16; s++) {
          const m = chord[s % 3] + 24 + (s % 6 === 5 ? 12 : 0);
          const f = hz(m);
          const ti = t0 + Math.round((s * beat * sr) / 4);
          add(ti, Math.round(0.12 * sr), (t) => ((f * t) % 1 < 0.5 ? 1 : -1) * Math.exp(-t * 22) * 0.028, s % 2 ? 0.35 : -0.35);
        }
      }
    }
    // a soft clip over the lot
    for (let i = 0; i < len; i++) {
      L[i] = Math.tanh(L[i] * 1.1) * 0.9;
      R[i] = Math.tanh(R[i] * 1.1) * 0.9;
    }
    return buf;
  }
}
