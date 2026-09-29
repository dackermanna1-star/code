import type { Synth } from './Sfx';

const mf = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Chord {
  bass: number;
  ep: number[];
  scale: number[];
}

const C: Record<string, Chord> = {
  Cmaj9: { bass: 36, ep: [64, 67, 71, 74], scale: [72, 74, 76, 79, 81, 83] },
  Am9: { bass: 33, ep: [60, 64, 67, 71], scale: [69, 71, 72, 76, 79] },
  Dm9: { bass: 38, ep: [65, 69, 72, 76], scale: [74, 76, 77, 81, 84] },
  G13: { bass: 31, ep: [65, 69, 71, 76], scale: [74, 76, 79, 81, 83] },
  Fmaj9: { bass: 41, ep: [64, 67, 69, 72], scale: [72, 76, 77, 79, 81] },
  Em7: { bass: 40, ep: [62, 67, 71, 74], scale: [71, 74, 76, 79] },
  A7: { bass: 33, ep: [61, 64, 67, 71], scale: [69, 73, 76, 79] },
  G7sus: { bass: 31, ep: [60, 65, 67, 72], scale: [72, 74, 77, 79] },
  Bb13: { bass: 34, ep: [62, 67, 68, 74], scale: [70, 74, 77, 79] },
};

const PROG_A = ['Cmaj9', 'Am9', 'Dm9', 'G13'];
const PROG_B = ['Fmaj9', 'Em7', 'Dm9', 'G7sus'];
const PROG_C = ['Fmaj9', 'Bb13', 'Cmaj9', 'A7'];

type Mode = 'title' | 'day' | 'summary' | 'off';

/**
 * Generative diner-lounge soundtrack: EP comping, walking bass, drums and a
 * vibraphone that improvises over chord tones. Layers fade in with the
 * kitchen's intensity; nights get mellower.
 */
export class Music {
  private mode: Mode = 'off';
  private bpm = 100;
  private step = 0;
  private bar = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private layers: Record<string, GainNode> = {};
  private intensity = 0;
  private night = 0;
  private swing = 0.14;
  private motif: number[] = [];
  private master: GainNode;

  constructor(private ctx: AudioContext, out: AudioNode, private s: Synth) {
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(out);
    for (const k of ['drums', 'bass', 'ep', 'vibes', 'perc']) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      this.layers[k] = g;
    }
  }

  setMode(m: Mode) {
    if (m === this.mode) return;
    this.mode = m;
    const t = this.ctx.currentTime;
    if (m === 'off') {
      this.master.gain.setTargetAtTime(0, t, 0.4);
      return;
    }
    this.master.gain.setTargetAtTime(1, t, 0.6);
    this.bpm = m === 'title' ? 88 : m === 'summary' ? 96 : 104;
    if (this.timer === null) {
      this.nextTime = t + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 25);
    }
    this.applyLayers();
  }

  private applyLayers() {
    const t = this.ctx.currentTime;
    const m = this.mode;
    const i = this.intensity;
    const night = this.night;
    const set = (k: string, v: number) => this.layers[k].gain.setTargetAtTime(v, t, 0.8);
    if (m === 'title') {
      set('ep', 0.9);
      set('bass', 0.8);
      set('drums', 0.0);
      set('perc', 0.5);
      set('vibes', 0.7);
    } else if (m === 'summary') {
      set('ep', 1);
      set('bass', 0.9);
      set('drums', 0.7);
      set('perc', 0.6);
      set('vibes', 0.9);
    } else {
      set('ep', 0.95);
      set('bass', 0.9);
      set('drums', (0.55 + i * 0.45) * (1 - night * 0.5));
      set('perc', 0.3 + i * 0.5);
      set('vibes', i > 0.45 ? 0.35 + i * 0.5 : night * 0.5);
    }
  }

  update(dt: number, busy: number, night: number) {
    const target = Math.max(0, Math.min(1, busy));
    this.intensity += (target - this.intensity) * Math.min(1, dt * 0.5);
    this.night = night;
    if (Math.random() < dt * 0.5) this.applyLayers();
  }

  private chordAt(bar: number): Chord {
    const section = Math.floor(bar / 4) % 4;
    const prog = section === 2 ? PROG_B : section === 3 && this.mode === 'summary' ? PROG_C : PROG_A;
    return C[prog[bar % 4]];
  }

  private schedule() {
    if (this.mode === 'off') return;
    const ahead = this.ctx.currentTime + 0.15;
    while (this.nextTime < ahead) {
      this.playStep(this.nextTime);
      const sixteenth = 60 / this.bpm / 4;
      const swingOff = this.step % 2 === 0 ? sixteenth * this.swing : -sixteenth * this.swing;
      this.nextTime += sixteenth + swingOff;
      this.step++;
      if (this.step >= 16) {
        this.step = 0;
        this.bar++;
        if (this.bar % 2 === 0) this.newMotif();
      }
    }
  }

  private newMotif() {
    const len = 5 + Math.floor(Math.random() * 3);
    this.motif = [];
    for (let i = 0; i < len; i++) this.motif.push(Math.floor(Math.random() * 5));
  }

  private playStep(t: number) {
    const st = this.step;
    const ch = this.chordAt(this.bar);
    const next = this.chordAt(this.bar + 1);
    const L = this.layers;
    const beat = 60 / this.bpm;
    const s = this.s;
    // ------------------------------------------------ drums
    if (this.mode !== 'title') {
      if (st === 0 || st === 10 || (st === 7 && Math.random() < 0.3)) this.kick(L.drums, t, st === 0 ? 0.55 : 0.4);
      if (st === 4 || st === 12) this.snare(L.drums, t, 0.28);
      if ((st === 15 || st === 9) && Math.random() < 0.25) this.snare(L.drums, t, 0.07);
      if (st % 2 === 0) s.nz(L.drums, t, st === 14 && Math.random() < 0.4 ? 0.18 : 0.035, { type: 'highpass', f: 7500, gain: st % 4 === 0 ? 0.09 : 0.06 });
    }
    // shaker / perc
    s.nz(L.perc, t, 0.045, { type: 'bandpass', f: 5600, q: 1.4, gain: st % 4 === 2 ? 0.05 : 0.025 });
    // ------------------------------------------------ bass (walking-ish)
    const bassNotes: Record<number, number> = {
      0: ch.bass,
      6: ch.bass + 7,
      8: ch.bass + 12,
      12: ch.bass + (Math.random() < 0.5 ? 10 : 7),
      14: next.bass - 1 + (Math.random() < 0.5 ? 0 : 2),
    };
    if (bassNotes[st] !== undefined && !(st === 8 && Math.random() < 0.4)) this.bass(L.bass, t, mf(bassNotes[st]), beat * (st === 0 ? 1.4 : 0.8));
    // ------------------------------------------------ EP comping
    const compSteps = this.mode === 'title' ? [0, 7] : [2, 7, 10];
    if (compSteps.includes(st) || (st === 14 && Math.random() < 0.3)) {
      const v = st === 0 ? 0.06 : 0.045 + Math.random() * 0.02;
      for (const m of ch.ep) if (Math.random() < 0.9) s.pluck(L.ep, t + Math.random() * 0.012, mf(m), beat * 1.5, v, 0.55);
    }
    // ------------------------------------------------ vibes improvisation
    if ([0, 3, 6, 8, 11, 14].includes(st) && Math.random() < 0.55) {
      const idx = this.motif[(st + this.bar * 3) % Math.max(1, this.motif.length)] ?? 0;
      const m = ch.scale[idx % ch.scale.length];
      this.vibe(L.vibes, t, mf(m), beat * 2.2);
    }
  }

  private kick(out: AudioNode, t: number, g: number) {
    this.s.tone(out, t, 0.32, { f: 150, f2: 44, gain: g, glide: 0.12 });
    this.s.nz(out, t, 0.008, { type: 'highpass', f: 2500, gain: g * 0.2 });
  }

  private snare(out: AudioNode, t: number, g: number) {
    this.s.nz(out, t, 0.17, { type: 'bandpass', f: 1900, q: 0.8, gain: g });
    this.s.tone(out, t, 0.08, { f: 200, f2: 160, gain: g * 0.5 });
  }

  private bass(out: AudioNode, t: number, f: number, dur: number) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(out);
    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  private vibe(out: AudioNode, t: number, f: number, dur: number) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const trem = ctx.createGain();
    trem.gain.value = 1;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = ctx.createGain();
    lg.gain.value = 0.25;
    lfo.connect(lg).connect(trem.gain);
    for (const [ratio, amp] of [[1, 1], [4, 0.18], [10, 0.05]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f * ratio;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    g.connect(trem).connect(out);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
}
