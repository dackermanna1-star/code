/**
 * Bar ambience: a crowd "walla" bed made of several formant-filtered voices
 * babbling random syllables (unintelligible murmur), occasional glass clinks
 * and distant laughs, panic pushing it toward shouting / screaming; plus a
 * quiet room tone indoors and night ambience (crickets, distant traffic) on the porch.
 */
import { getKit, mkGain, mkFilter, mkNoise, mkOsc, chain, rand, randi, pick, chance, clamp } from './dsp';
import { VOWELS, renderUtterance, vocalScript, type Vowel, type VocalKind } from './Voice';
import { modal } from './layers';

interface Walla {
  osc: OscillatorNode;
  ng: GainNode;
  f1: BiquadFilterNode;
  f2: BiquadFilterNode;
  g2: GainNode;
  amp: GainNode;
  pan: StereoPannerNode;
  base: number;
  female: boolean;
  next: number;
  left: number;
}

const CALM_VOWELS: Vowel[] = ['ah', 'eh', 'ih', 'oh', 'uh', 'ee', 'ae', 'oo', 'uh', 'eh'];
const PANIC_VOWELS: Vowel[] = ['ah', 'ae', 'eh', 'ee', 'ah', 'oh'];
const VOICES = 8;

export class Ambience {
  private readonly ac: BaseAudioContext;
  private readonly crowdBus: GainNode;
  private readonly crowdLP: BiquadFilterNode;
  private readonly crowdGain: GainNode;
  private readonly detail: GainNode;
  private readonly roomGain: GainNode;
  private readonly nightGain: GainNode;
  private readonly cricketAmp: GainNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private readonly voices: Walla[] = [];
  private level = 0.5;
  private panic = 0;
  private indoor = true;
  private nextClink = 0;
  private nextLaugh = 0;
  private nextYell = 0;
  private nextCricket = [0, 0];
  private discrete: number[] = [];

  constructor(ac: BaseAudioContext, out: AudioNode, reverbSend: AudioNode | null) {
    this.ac = ac;
    const k = getKit(ac);
    const keep = <T extends AudioNode>(n: T): T => (this.nodes.push(n), n);
    const now = ac.currentTime;

    // ---- crowd bus
    this.crowdBus = keep(mkGain(ac, 1));
    this.crowdLP = keep(mkFilter(ac, 'lowpass', 2300, 0.6));
    this.crowdGain = keep(mkGain(ac, 0));
    chain(this.crowdBus, keep(mkFilter(ac, 'highpass', 120, 0.7)), this.crowdLP, this.crowdGain, out);
    if (reverbSend) chain(this.crowdLP, keep(mkGain(ac, 0.5)), reverbSend);
    this.detail = keep(mkGain(ac, 1));
    this.detail.connect(out);
    if (reverbSend) chain(this.detail, keep(mkGain(ac, 0.6)), reverbSend);

    // shared consonant noise for all walla voices
    const noise = mkNoise(ac, k.white, now, now + 1e7);
    this.sources.push(noise);
    for (let i = 0; i < VOICES; i++) {
      const female = i % 3 === 1;
      const base = female ? rand(185, 230) : rand(95, 135);
      const osc = ac.createOscillator();
      osc.setPeriodicWave(k.waves.glottal);
      osc.frequency.value = base;
      osc.start(now);
      this.sources.push(osc);
      const sum = keep(mkGain(ac, 1));
      const ng = keep(mkGain(ac, 0));
      noise.connect(ng);
      osc.connect(sum);
      ng.connect(sum);
      const f1 = keep(mkFilter(ac, 'bandpass', 600, 5));
      const f2 = keep(mkFilter(ac, 'bandpass', 1300, 8));
      const g1 = keep(mkGain(ac, 1));
      const g2 = keep(mkGain(ac, 0.6));
      const amp = keep(mkGain(ac, 0));
      const pan = keep(ac.createStereoPanner());
      pan.pan.value = (i / (VOICES - 1)) * 1.6 - 0.8 + rand(-0.1, 0.1);
      sum.connect(f1);
      sum.connect(f2);
      f1.connect(g1);
      f2.connect(g2);
      g1.connect(amp);
      g2.connect(amp);
      amp.connect(pan);
      pan.connect(this.crowdBus);
      this.voices.push({ osc, ng, f1, f2, g2, amp, pan, base, female, next: now + rand(0, 1.5), left: randi(3, 10) });
    }

    // ---- room tone: low rumble + faint mains hum (fridge / neon)
    this.roomGain = keep(mkGain(ac, 1));
    this.roomGain.connect(out);
    const rumble = mkNoise(ac, k.brown, now, now + 1e7);
    this.sources.push(rumble);
    chain(rumble, keep(mkFilter(ac, 'lowpass', 140, 0.7)), keep(mkGain(ac, 0.05)), this.roomGain);
    for (const [f, a] of [[60, 0.004], [120, 0.0025], [180, 0.001]] as const) {
      const o = mkOsc(ac, 'sine', f, now, now + 1e7);
      this.sources.push(o);
      chain(o, keep(mkGain(ac, a)), this.roomGain);
    }

    // ---- porch at night: distant traffic + two crickets
    this.nightGain = keep(mkGain(ac, 0));
    this.nightGain.connect(out);
    const traffic = mkNoise(ac, k.brown, now, now + 1e7);
    this.sources.push(traffic);
    chain(traffic, keep(mkFilter(ac, 'lowpass', 320, 0.7)), keep(mkGain(ac, 0.06)), this.nightGain);
    for (let i = 0; i < 2; i++) {
      const o = mkOsc(ac, 'sine', i ? 4650 : 4300, now, now + 1e7);
      this.sources.push(o);
      const a = keep(mkGain(ac, 0));
      const p = keep(ac.createStereoPanner());
      p.pan.value = i ? 0.7 : -0.6;
      chain(o, a, p, this.nightGain);
      this.cricketAmp.push(a);
    }
    this.applyLevels(now, 0.01);
  }

  /** 0..1 crowd chatter amount, 0..1 panic/rowdiness */
  setCrowd(level: number, panic: number): void {
    this.level = clamp(level, 0, 1);
    this.panic = clamp(panic, 0, 1);
    this.applyLevels(this.ac.currentTime, 0.4);
  }

  setIndoor(indoor: boolean): void {
    if (indoor === this.indoor) return;
    this.indoor = indoor;
    this.applyLevels(this.ac.currentTime, 0.5);
  }

  private applyLevels(now: number, tc: number): void {
    const lv = Math.pow(this.level, 0.7) * (1 + 0.5 * this.panic);
    this.crowdGain.gain.setTargetAtTime(lv * 0.5 * (this.indoor ? 1 : 0.45), now, tc);
    this.crowdLP.frequency.setTargetAtTime(this.indoor ? 2300 + this.panic * 1200 : 900, now, tc);
    this.roomGain.gain.setTargetAtTime(this.indoor ? 1 : 0, now, tc);
    this.nightGain.gain.setTargetAtTime(this.indoor ? 0 : 1, now, tc);
    this.detail.gain.setTargetAtTime(this.indoor ? 1 : 0.35, now, tc);
  }

  /** Schedules the next ~0.4s of babble and random events; call every frame. */
  update(dt: number): void {
    const ac = this.ac;
    const now = ac.currentTime;
    const horizon = now + 0.4;
    const active = Math.round(this.level * VOICES + 0.3);
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (i >= active) {
        if (v.next < now) v.next = now + rand(0.2, 1);
        continue;
      }
      if (v.next < now - 0.5) v.next = now + rand(0, 0.4);
      let guard = 0;
      while (v.next < horizon && guard++ < 20) this.syllable(v, Math.max(v.next, now + 0.01));
    }
    // discrete events
    this.discrete = this.discrete.filter((e) => e > now);
    const lv = Math.max(this.level, 0.02);
    if (now > this.nextClink) {
      this.nextClink = now + rand(1.2, 5) / lv;
      if (this.indoor && this.level > 0.05) this.clink(now + 0.02);
    }
    if (now > this.nextLaugh) {
      const rowdy = this.panic < 0.5 ? 1 + this.panic * 2 : Math.max(0, 2 - this.panic * 2);
      this.nextLaugh = now + rand(4, 11) / (lv * Math.max(rowdy, 0.15));
      if (this.level > 0.08 && rowdy > 0.2) this.distantVoice(now + 0.02, 'laugh', 0.11);
    }
    if (now > this.nextYell) {
      this.nextYell = now + rand(1.2, 3.5) / Math.max(this.panic, 0.05);
      if (this.panic > 0.25 && this.level > 0.05) this.distantVoice(now + 0.02, this.panic > 0.55 && chance(0.6) ? 'scream' : 'shout', 0.07 + this.panic * 0.05);
    }
    if (!this.indoor) this.crickets(now);
    void dt;
  }

  private syllable(v: Walla, t: number): void {
    const p = this.panic;
    if (v.left <= 0) {
      // pause between phrases (shorter when panicking)
      v.left = randi(3, 12);
      v.next = t + rand(0.35, 1.8) / (1 + p * 1.5);
      return;
    }
    const shout = p > 0.3 && chance(p * 0.25);
    const dur = shout ? rand(0.25, 0.45) : rand(0.08, 0.22) / (1 + 0.5 * p);
    const vow = VOWELS[pick(p > 0.5 ? PANIC_VOWELS : CALM_VOWELS)];
    const fs = v.female ? 1.15 : 1;
    const f0 = v.base * (1 + p * 0.5 + (shout ? 0.45 : 0)) * rand(0.88, 1.18) * (1 + 0.012 * v.left);
    const a = rand(0.45, 1) * (1 + p * 0.4) * (shout ? 1.5 : 1);
    v.osc.frequency.setTargetAtTime(f0, t, 0.03);
    v.f1.frequency.setTargetAtTime(vow.f[0] * fs, t, 0.02);
    v.f2.frequency.setTargetAtTime(vow.f[1] * fs, t, 0.02);
    v.g2.gain.setTargetAtTime(vow.g[1] * 1.1, t, 0.02);
    if (chance(0.6)) {
      v.ng.gain.setTargetAtTime(rand(0.15, 0.5), Math.max(t - 0.03, this.ac.currentTime), 0.006);
      v.ng.gain.setTargetAtTime(0.02, t, 0.012);
    }
    v.amp.gain.setTargetAtTime(a, t, 0.018);
    v.amp.gain.setTargetAtTime(a * 0.55, t + dur * 0.55, 0.03);
    v.amp.gain.setTargetAtTime(0, t + dur, 0.025);
    v.next = t + dur + rand(0.015, 0.07);
    v.left--;
  }

  private clink(t: number): void {
    const ac = this.ac;
    const p = ac.createStereoPanner();
    p.pan.value = rand(-0.9, 0.9);
    const g = mkGain(ac, rand(0.05, 0.14) * (0.5 + 0.5 * this.level));
    g.connect(p);
    p.connect(this.detail);
    const f = rand(2200, 3600);
    modal(ac, g, t, { f, ratios: [1, 1.52, 2.33], taus: [0.16, 0.09, 0.05], amps: [1, 0.4, 0.25], amp: 0.5 });
    if (chance(0.5)) modal(ac, g, t + rand(0.004, 0.012), { f: f * rand(1.08, 1.25), ratios: [1, 1.5], taus: [0.12, 0.07], amps: [1, 0.4], amp: 0.35 });
  }

  /** A far-away voice in the crowd (low passed, panned, reverberant). */
  private distantVoice(t: number, kind: VocalKind, vol: number): void {
    if (this.discrete.length >= 2) return;
    const ac = this.ac;
    const p = ac.createStereoPanner();
    p.pan.value = rand(-0.85, 0.85);
    const lp = mkFilter(ac, 'lowpass', rand(1400, 2600), 0.6);
    const g = mkGain(ac, vol * (0.6 + 0.4 * this.level));
    chain(g, lp, p, this.crowdBus);
    const female = chance(0.4);
    const end = renderUtterance(ac, g, t, vocalScript(kind), female ? rand(1.5, 1.85) : rand(0.8, 1.15));
    this.discrete.push(end);
  }

  private crickets(now: number): void {
    for (let i = 0; i < 2; i++) {
      if (now + 0.3 < this.nextCricket[i]) continue;
      const t = Math.max(this.nextCricket[i], now + 0.02);
      const a = this.cricketAmp[i].gain;
      const n = randi(2, 4);
      for (let k = 0; k < n; k++) {
        const t0 = t + k * 0.045;
        a.setTargetAtTime(0.012, t0, 0.003);
        a.setTargetAtTime(0, t0 + 0.022, 0.004);
      }
      this.nextCricket[i] = t + rand(0.45, 1.3);
    }
  }

  dispose(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* ignore */
      }
    }
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  }
}

