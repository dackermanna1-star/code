import { SFX, SfxId, Synth } from './Sfx';
import { Music } from './Music';
import type { Personality } from '../characters/Roster';

export interface PlayOpts {
  volume?: number;
  rate?: number;
  pan?: number;
  delay?: number;
}

/**
 * Fully procedural audio: every sound effect, voice, ambience bed and the
 * adaptive soundtrack are synthesized with the Web Audio API at runtime.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private voiceBus!: GainNode;
  private reverbSend!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private synth!: Synth;
  music!: Music;
  private sizzleGain!: GainNode;
  private sizzleLevel = 0;
  private sizzleTarget = 0;
  private crackleTimer = 0;
  private ambTimers: number[] = [];
  private chatterGain!: GainNode;
  private outdoorGain!: GainNode;
  private birdsOn = true;
  private volumes = { master: 0.85, music: 0.6, sfx: 0.9 };
  muted = false;
  private lastPlay = new Map<string, number>();
  private duck = 1;
  /** 0 while the music is cut dead (after a gunshot) */
  private cut = 1;
  private cutTimer = 0;
  started = false;

  /** Must be called from a user gesture. */
  async unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    // reverb (generated impulse response)
    const conv = ctx.createConvolver();
    conv.buffer = this.makeIR(1.6, 2.2);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    conv.connect(revOut).connect(this.master);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(conv);

    const bus = (g: number, rev = 0) => {
      const b = ctx.createGain();
      b.gain.value = g;
      b.connect(this.master);
      if (rev) {
        const s = ctx.createGain();
        s.gain.value = rev;
        b.connect(s).connect(this.reverbSend);
      }
      return b;
    };
    this.sfxBus = bus(1, 0.12);
    this.voiceBus = bus(0.9, 0.18);
    this.ambBus = bus(0.8, 0.25);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.musicFilter).connect(this.master);
    const ms = ctx.createGain();
    ms.gain.value = 0.2;
    this.musicBus.connect(ms).connect(this.reverbSend);

    this.synth = new Synth(ctx, this.reverbSend);
    this.music = new Music(ctx, this.musicBus, this.synth);
    this.buildSizzle();
    this.buildAmbience();
    this.applyVolumes();
    if (ctx.state !== 'running') await ctx.resume();
    this.started = true;
  }

  private makeIR(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // early reflections + smooth tail
        const early = i < ctx.sampleRate * 0.03 && Math.random() < 0.02 ? 1.5 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + early * (Math.random() * 2 - 1)) * (ch ? 0.95 : 1);
      }
    }
    return buf;
  }

  setVolumes(v: { master: number; music: number; sfx: number }) {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.muted ? 0 : this.volumes.master;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    // a cut is instant; the music creeps back in afterwards
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.55 * this.duck * this.cut, t, this.cut < 1 ? 0.015 : this.cutRecover ? 1.6 : 0.1);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.voiceBus.gain.setTargetAtTime(this.volumes.sfx * 0.95, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.volumes.sfx * 0.75, t, 0.05);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyVolumes();
    return this.muted;
  }

  /** Muffle the music (pause menu / modal screens). */
  muffle(on: boolean) {
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(on ? 700 : 20000, this.ctx.currentTime, 0.15);
  }

  play(id: SfxId | string, o: PlayOpts = {}) {
    if (!this.ctx || !this.started) return;
    const fn = SFX[id as SfxId];
    if (!fn) return;
    // light rate limiting to avoid pile-ups
    const now = this.ctx.currentTime;
    const last = this.lastPlay.get(id) ?? -1;
    if (now - last < 0.025 && id !== 'tick' && id !== 'coin') return;
    this.lastPlay.set(id, now);
    const out = this.ctx.createGain();
    out.gain.value = o.volume ?? 1;
    let node: AudioNode = out;
    if (o.pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      out.connect(p);
      node = p;
    }
    node.connect(this.sfxBus);
    fn(this.synth, out, now + (o.delay ?? 0) + 0.005, o.rate ?? 1);
    // auto disconnect later
    setTimeout(() => {
      try {
        out.disconnect();
        if (node !== out) node.disconnect();
      } catch {
        /* ignore */
      }
    }, 4000 + (o.delay ?? 0) * 1000);
  }

  // ------------------------------------------------------------------ sizzle
  private buildSizzle() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.synth.noise('pink');
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1600;
    const bp = ctx.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.value = 5200;
    bp.gain.value = 6;
    bp.Q.value = 0.8;
    const am = ctx.createGain();
    // slow amplitude flutter for liveliness
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7.3;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.18;
    lfo.connect(lfoG).connect(am.gain);
    am.gain.value = 0.82;
    this.sizzleGain = ctx.createGain();
    this.sizzleGain.gain.value = 0;
    src.connect(hp).connect(bp).connect(am).connect(this.sizzleGain).connect(this.sfxBus);
    src.start();
    lfo.start();
  }

  setSizzle(level: number) {
    this.sizzleTarget = level;
  }

  // ------------------------------------------------------------------ ambience
  private buildAmbience() {
    const ctx = this.ctx!;
    // vent hood hum
    const hum = ctx.createBufferSource();
    hum.buffer = this.synth.noise('brown');
    hum.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const hg = ctx.createGain();
    hg.gain.value = 0.22;
    hum.connect(lp).connect(hg).connect(this.ambBus);
    hum.start();
    const mains = ctx.createOscillator();
    mains.frequency.value = 120;
    const mg = ctx.createGain();
    mg.gain.value = 0.006;
    mains.connect(mg).connect(this.ambBus);
    mains.start();
    // room tone / chatter bed
    this.chatterGain = ctx.createGain();
    this.chatterGain.gain.value = 0;
    this.chatterGain.connect(this.ambBus);
    // outdoor bed (heard when the door opens)
    const out = ctx.createBufferSource();
    out.buffer = this.synth.noise('brown');
    out.loop = true;
    const olp = ctx.createBiquadFilter();
    olp.type = 'lowpass';
    olp.frequency.value = 500;
    this.outdoorGain = ctx.createGain();
    this.outdoorGain.gain.value = 0.02;
    out.connect(olp).connect(this.outdoorGain).connect(this.ambBus);
    out.start();
  }

  /** Called every frame. */
  update(dt: number, s: { customers: number; hour: number; doorOpen: number; busy: number; night: number }) {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    // sizzle smoothing + crackles
    this.sizzleLevel += (this.sizzleTarget - this.sizzleLevel) * Math.min(1, dt * 6);
    this.sizzleGain.gain.setTargetAtTime(this.sizzleLevel * 0.22, t, 0.05);
    this.crackleTimer -= dt;
    if (this.crackleTimer <= 0 && this.sizzleLevel > 0.02) {
      this.crackleTimer = (0.02 + Math.random() * 0.09) / Math.max(0.3, this.sizzleLevel);
      this.synth.crackle(this.sfxBus, t + Math.random() * 0.02, 0.05 + this.sizzleLevel * 0.1, (Math.random() - 0.5) * 0.8);
    }
    // chatter from diners
    this.chatterGain.gain.setTargetAtTime(Math.min(1, s.customers / 6) * 0.5, t, 0.5);
    if (Math.random() < dt * Math.min(3, s.customers * 0.45)) this.synth.babble(this.chatterGain, t, 0.35 + Math.random() * 0.7, 140 + Math.random() * 120, 'neutral', 0.06, (Math.random() - 0.5) * 1.2);
    // outdoor bed + birds / crickets through the open door
    this.outdoorGain.gain.setTargetAtTime(0.03 + s.doorOpen * 0.22, t, 0.12);
    if (s.doorOpen > 0.3 && Math.random() < dt * 2.2) {
      if (s.night < 0.5) this.synth.bird(this.ambBus, t, 0.06 * s.doorOpen);
      else this.synth.cricket(this.ambBus, t, 0.05 * s.doorOpen);
    }
    // kitchen clatter
    if (Math.random() < dt * 0.12) this.synth.clink(this.ambBus, t, 0.05 + Math.random() * 0.05, 1800 + Math.random() * 2400);
    // ducking for voices
    this.music?.update(dt, s.busy, s.night);
    void this.birdsOn;
  }

  /** Gibberish speech in a character's voice. */
  voice(p: Personality, mood: 'happy' | 'neutral' | 'angry' | 'sad', duration: number) {
    if (!this.ctx || !this.started) return;
    const base = { bright: 210, warm: 170, deep: 105, squeaky: 290, raspy: 150 }[p.voiceType] * p.voice;
    this.synth.babble(this.voiceBus, this.ctx.currentTime + 0.02, duration, base, mood, 0.32, 0, p.voiceType === 'raspy');
    // duck music under dialogue
    this.duck = 0.6;
    this.applyVolumes();
    setTimeout(() => {
      this.duck = 1;
      this.applyVolumes();
    }, duration * 1000 + 250);
  }

  private cutRecover = false;
  /** Record scratch, then silence for a while (the first shot in the diner). */
  musicCut(seconds: number) {
    if (!this.ctx || !this.started) return;
    if (this.cut === 1) this.play('recordScratch', { volume: 0.45 });
    this.cut = 0;
    this.cutRecover = false;
    this.applyVolumes();
    clearTimeout(this.cutTimer);
    this.cutTimer = window.setTimeout(() => {
      this.cut = 1;
      this.cutRecover = true;
      this.applyVolumes();
      this.cutRecover = false;
    }, seconds * 1000);
  }

  /** Restore the music straight away (new day, back to the title). */
  musicRestore() {
    clearTimeout(this.cutTimer);
    this.cut = 1;
    this.applyVolumes();
  }

  /**
   * A scream: a buzzy source pitched well above the character's speaking
   * voice, through open-vowel "aah" formants, with a rise, a wavering
   * vibrato and a falling tail.
   */
  scream(p: Personality, o: { pan?: number; volume?: number; delay?: number } = {}) {
    if (!this.ctx || !this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01 + (o.delay ?? 0);
    const base = { bright: 210, warm: 170, deep: 105, squeaky: 290, raspy: 150 }[p.voiceType] * p.voice;
    const f0 = base * (2 + Math.random() * 0.45);
    const dur = 0.8 + Math.random() * 0.7;
    const out = ctx.createGain();
    out.gain.value = o.volume ?? 0.5;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, o.pan ?? 0));
    out.connect(pan).connect(this.voiceBus);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0 * 0.78, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.12, t + 0.1);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.96, t + dur * 0.7);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = 6 + Math.random() * 3;
    const vg = ctx.createGain();
    vg.gain.value = f0 * 0.04;
    vib.connect(vg).connect(osc.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(1, t + 0.04);
    env.gain.setValueAtTime(0.85, t + dur * 0.75);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const mix = ctx.createGain();
    mix.gain.value = 0.9;
    for (const [f, q] of [[950, 5], [1450, 6], [2950, 8]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * (f0 > 500 ? 1.12 : 1);
      bp.Q.value = q;
      osc.connect(bp).connect(env);
    }
    env.connect(mix).connect(out);
    this.synth.nz(out, t, dur, { type: 'bandpass', f: 2600, q: 0.9, gain: 0.05, attack: 0.03 });
    osc.start(t);
    vib.start(t);
    osc.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
    setTimeout(() => {
      out.disconnect();
      pan.disconnect();
    }, (dur + (o.delay ?? 0) + 0.5) * 1000);
  }

  setMusicMode(mode: 'title' | 'day' | 'summary' | 'off') {
    this.music?.setMode(mode);
  }

  dispose() {
    for (const t of this.ambTimers) clearInterval(t);
    this.ctx?.close();
  }
}
