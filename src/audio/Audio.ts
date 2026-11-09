/**
 * Fully synthesized audio (Web Audio API, no files):
 *  - engine: detuned saw/square oscillators + rumble through a lowpass, driven by rpm/throttle
 *  - boost roar, wind, tire skid
 *  - one-shot SFX from game events (splats, crunches, booms, guns, stingers)
 *  - procedural punk/surf-rock music loop with layers that react to speed & kills
 * Safe to call before/without an AudioContext (headless, autoplay blocked).
 */
import { events } from "../core/Events";
import type { Save } from "../core/Save";
import type { IVehicle } from "../core/types";

export type AudioMode = "garage" | "run" | "results";

const BPM = 132;
const STEP = 60 / BPM / 4; // 16th note
// A minor-ish riff (semitones from A1) for the bass, 16 steps per bar, 4 bars.
const BASS = [
  [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 3, 3, 5, 7],
  [5, 5, 17, 5, 5, 5, 17, 5, 3, 3, 15, 3, 3, 3, 2, 2],
  [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 7, 7, 10, 12],
  [8, 8, 20, 8, 7, 7, 19, 7, 5, 5, 17, 5, 3, 3, 2, -2],
];
const LEAD = [12, -1, 15, -1, 19, -1, 17, 15, 12, -1, 10, -1, 12, -1, -1, -1];

class AudioSystem {
  private ctx: AudioContext | null = null;
  private save: Save | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private noise!: AudioBuffer;
  private vehicle: IVehicle | null = null;
  private mode: AudioMode = "garage";
  // engine graph
  private eng: { o1: OscillatorNode; o2: OscillatorNode; o3: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private loops: { boost: GainNode; wind: GainNode; windF: BiquadFilterNode; skid: GainNode } | null = null;
  // music sequencing
  private nextStep = 0;
  private step = 0;
  private intensity = 0;
  private killHeat = 0;
  private lastSfx = new Map<string, number>();

  constructor() {
    const unlock = () => this.ensure();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    events.on("zombieHit", (e) => {
      this.killHeat = Math.min(1, this.killHeat + 0.15);
      this.splat(Math.min(1, e.force / 20));
    });
    events.on("limbSevered", () => this.pop());
    events.on("carImpact", (e) => this.crunch(Math.min(1, e.force / 20)));
    events.on("carScrape", () => this.scrape());
    events.on("explosion", (e) => this.boom(e.power));
    events.on("landed", (e) => e.airTime > 0.3 && this.thump(Math.min(1, e.airTime / 2)));
    events.on("stunt", () => this.chime(1));
    events.on("survivor", () => this.chime(1.5));
    events.on("weaponFired", (e) => (e.weapon === "gun" ? this.gun() : this.hiss()));
    events.on("runEnd", (e) => this.stinger(e.reason === "evac"));
  }

  configure(save: Save): void {
    this.save = save;
  }

  private ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.music = ctx.createGain();
      this.sfx = ctx.createGain();
      this.music.connect(this.master);
      this.sfx.connect(this.master);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      this.nextStep = ctx.currentTime + 0.1;
      if (this.vehicle) this.buildEngine();
    } catch {
      this.ctx = null;
    }
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.save) return;
    const s = this.save.data.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.masterVolume, t, 0.05);
    this.music.gain.setTargetAtTime(s.musicVolume * 0.45, t, 0.05);
    this.sfx.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
  }

  attachVehicle(v: IVehicle): void {
    this.vehicle = v;
    if (this.ctx) this.buildEngine();
  }

  detachVehicle(): void {
    this.vehicle = null;
    this.teardownEngine();
  }

  setMode(m: AudioMode): void {
    this.mode = m;
    if (m !== "run") this.teardownEngine();
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    return src;
  }

  private buildEngine(): void {
    const ctx = this.ctx;
    if (!ctx || this.eng) return;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 4;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    filter.connect(gain).connect(this.sfx);
    const mk = (type: OscillatorType, detune: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detune;
      o.connect(filter);
      o.start();
      return o;
    };
    this.eng = { o1: mk("sawtooth", 0), o2: mk("square", -1200 + 8), o3: mk("sawtooth", 7), filter, gain };
    // looping noise layers
    const mkLoop = (type: BiquadFilterType, freq: number, q: number) => {
      const n = this.noiseSource();
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      n.connect(f).connect(g).connect(this.sfx);
      n.start();
      return { g, f };
    };
    const boost = mkLoop("bandpass", 900, 0.8);
    const wind = mkLoop("lowpass", 500, 0.5);
    const skid = mkLoop("bandpass", 2400, 6);
    this.loops = { boost: boost.g, wind: wind.g, windF: wind.f, skid: skid.g };
  }

  private teardownEngine(): void {
    if (!this.eng || !this.ctx) return;
    const t = this.ctx.currentTime;
    const e = this.eng;
    const l = this.loops!;
    e.gain.gain.setTargetAtTime(0, t, 0.08);
    for (const g of [l.boost, l.wind, l.skid]) g.gain.setTargetAtTime(0, t, 0.08);
    setTimeout(() => {
      for (const o of [e.o1, e.o2, e.o3]) o.stop();
      e.gain.disconnect();
      for (const g of [l.boost, l.wind, l.skid]) g.disconnect();
    }, 400);
    this.eng = null;
    this.loops = null;
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.applyVolumes();
    const t = ctx.currentTime;
    const v = this.vehicle;
    this.killHeat = Math.max(0, this.killHeat - dt * 0.12);

    if (v && this.eng && this.loops) {
      const alive = v.fuel > 0 && !v.wrecked;
      const rpm = alive ? v.rpm : Math.max(0, v.rpm - 0.3);
      // Bigger vehicles = lower engine note.
      const base = 34 - Math.min(16, v.def.mass / 400);
      const f = base + rpm * base * 3.2;
      this.eng.o1.frequency.setTargetAtTime(f, t, 0.04);
      this.eng.o2.frequency.setTargetAtTime(f, t, 0.04);
      this.eng.o3.frequency.setTargetAtTime(f * 1.5, t, 0.04);
      this.eng.filter.frequency.setTargetAtTime(220 + rpm * 900 + v.throttle * 900, t, 0.05);
      this.eng.gain.gain.setTargetAtTime(alive ? 0.06 + v.throttle * 0.07 : 0.0, t, 0.1);
      const speed = Math.min(1, v.velocity.length() / 45);
      this.loops.wind.gain.setTargetAtTime(speed * speed * 0.18, t, 0.2);
      this.loops.windF.frequency.setTargetAtTime(300 + speed * 1600, t, 0.2);
      this.loops.boost.gain.setTargetAtTime(v.boosting ? 0.22 : 0, t, 0.05);
      let slip = 0;
      for (const w of v.wheels) if (w.grounded) slip = Math.max(slip, w.slip);
      this.loops.skid.gain.setTargetAtTime(slip > 0.35 ? (slip - 0.35) * 0.25 : 0, t, 0.05);
      this.intensity = Math.min(1, speed * 0.8 + this.killHeat * 0.6 + (v.boosting ? 0.3 : 0));
    } else {
      this.intensity = this.mode === "results" ? 0.3 : 0;
    }
    this.scheduleMusic();
  }

  // ───────────────────────────── music ─────────────────────────────

  private scheduleMusic(): void {
    const ctx = this.ctx!;
    if (this.nextStep < ctx.currentTime) this.nextStep = ctx.currentTime + 0.05;
    while (this.nextStep < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextStep);
      this.step = (this.step + 1) % 64;
      this.nextStep += this.mode === "garage" ? STEP * 1.25 : STEP;
    }
  }

  private playStep(i: number, t: number): void {
    const s = i % 16;
    const bar = Math.floor(i / 16);
    const run = this.mode === "run";
    const hi = this.intensity;
    // drums
    if (s % 8 === 0 || (run && hi > 0.5 && s === 10)) this.kick(t);
    if (s % 8 === 4 && (run || bar % 2 === 1)) this.snare(t, run ? 1 : 0.5);
    if (s % 2 === 0 || (run && hi > 0.35)) this.hat(t, s % 4 === 2 ? 0.6 : 0.3);
    // bass
    const note = BASS[bar][s];
    if (s % 2 === 0 || run) this.bass(t, 55 * Math.pow(2, note / 12), run ? 1 : 0.7);
    // lead layer at high intensity
    const ln = LEAD[s];
    if (run && hi > 0.55 && ln >= 0 && bar % 2 === 0) this.lead(t, 220 * Math.pow(2, (ln + BASS[bar][0]) / 12));
  }

  private env(t: number, peak: number, attack: number, decay: number, dest: AudioNode): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }

  private kick(t: number): void {
    const o = this.ctx!.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    o.connect(this.env(t, 0.9, 0.003, 0.18, this.music));
    o.start(t);
    o.stop(t + 0.25);
  }

  private snare(t: number, vol: number): void {
    const n = this.noiseSource();
    const f = this.ctx!.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 1500;
    n.connect(f).connect(this.env(t, 0.45 * vol, 0.002, 0.14, this.music));
    n.start(t);
    n.stop(t + 0.2);
    const o = this.ctx!.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(190, t);
    o.connect(this.env(t, 0.3 * vol, 0.002, 0.08, this.music));
    o.start(t);
    o.stop(t + 0.12);
  }

  private hat(t: number, vol: number): void {
    const n = this.noiseSource();
    const f = this.ctx!.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    n.connect(f).connect(this.env(t, 0.12 * vol, 0.001, 0.04, this.music));
    n.start(t);
    n.stop(t + 0.06);
  }

  private bass(t: number, freq: number, vol: number): void {
    const o = this.ctx!.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    const f = this.ctx!.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.15);
    o.connect(f).connect(this.env(t, 0.28 * vol, 0.005, 0.16, this.music));
    o.start(t);
    o.stop(t + 0.2);
  }

  private lead(t: number, freq: number): void {
    const o = this.ctx!.createOscillator();
    o.type = "square";
    o.frequency.value = freq;
    const vib = this.ctx!.createOscillator();
    vib.frequency.value = 6;
    const vg = this.ctx!.createGain();
    vg.gain.value = 4;
    vib.connect(vg).connect(o.frequency);
    const f = this.ctx!.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2200;
    o.connect(f).connect(this.env(t, 0.07, 0.01, 0.22, this.music));
    o.start(t);
    vib.start(t);
    o.stop(t + 0.3);
    vib.stop(t + 0.3);
  }

  // ───────────────────────────── SFX ─────────────────────────────

  private gate(name: string, minGap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.lastSfx.get(name) ?? -1) < minGap) return false;
    this.lastSfx.set(name, now);
    return true;
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, endFreq: number, vol: number, dur: number): void {
    const n = this.noiseSource();
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    n.connect(f).connect(this.env(t, vol, 0.004, dur, this.sfx));
    n.start(t);
    n.stop(t + dur + 0.05);
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, vol: number, dur: number): void {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    o.connect(this.env(t, vol, 0.003, dur, this.sfx));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private splat(k: number): void {
    if (!this.gate("splat", 0.03)) return;
    const t = this.ctx!.currentTime;
    const p = 0.8 + Math.random() * 0.4;
    this.tone(t, "sine", 120 * p, 45, 0.5 + k * 0.3, 0.14); // thud
    this.noiseHit(t, "lowpass", 1800 * p, 300, 0.35 + k * 0.25, 0.18); // squelch
    this.noiseHit(t + 0.03, "bandpass", 700 * p, 250, 0.2, 0.12);
  }

  private pop(): void {
    if (!this.gate("pop", 0.05)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, "sine", 500, 120, 0.25, 0.08);
    this.noiseHit(t, "bandpass", 1200, 400, 0.2, 0.1);
  }

  private crunch(k: number): void {
    if (!this.gate("crunch", 0.08)) return;
    const t = this.ctx!.currentTime;
    this.noiseHit(t, "bandpass", 2500, 600, 0.3 + k * 0.4, 0.25 + k * 0.2);
    this.tone(t, "square", 90, 40, 0.15 + k * 0.2, 0.2);
    this.noiseHit(t + 0.05, "highpass", 4000, 2000, 0.12 * k, 0.15);
  }

  private scrape(): void {
    if (!this.gate("scrape", 0.12)) return;
    this.noiseHit(this.ctx!.currentTime, "bandpass", 3200, 2600, 0.12, 0.15);
  }

  private boom(power: number): void {
    if (!this.gate("boom", 0.05)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, "sine", 90, 28, 0.9 * Math.min(1.3, power), 0.8);
    this.noiseHit(t, "lowpass", 2400, 120, 0.8, 1.0);
    this.noiseHit(t + 0.08, "highpass", 3000, 1500, 0.15, 0.6); // crackle
  }

  private thump(k: number): void {
    if (!this.gate("thump", 0.1)) return;
    const t = this.ctx!.currentTime;
    this.tone(t, "sine", 80, 35, 0.4 + k * 0.4, 0.25);
    this.noiseHit(t, "lowpass", 600, 100, 0.2 + k * 0.2, 0.2);
  }

  private chime(pitch: number): void {
    const t = this.ctx?.currentTime;
    if (t === undefined) return;
    [0, 4, 7, 12].forEach((n, i) => this.tone(t + i * 0.06, "triangle", 660 * pitch * Math.pow(2, n / 12), 660 * pitch * Math.pow(2, n / 12), 0.12, 0.25));
  }

  private gun(): void {
    if (!this.gate("gun", 0.04)) return;
    const t = this.ctx!.currentTime;
    this.noiseHit(t, "bandpass", 1800, 500, 0.25, 0.07);
    this.tone(t, "square", 160, 60, 0.12, 0.06);
  }

  private hiss(): void {
    if (!this.gate("hiss", 0.12)) return;
    this.noiseHit(this.ctx!.currentTime, "bandpass", 900, 600, 0.18, 0.2);
  }

  private stinger(win: boolean): void {
    const t = this.ctx?.currentTime;
    if (t === undefined) return;
    const notes = win ? [0, 4, 7, 12, 16] : [7, 6, 5, 0];
    notes.forEach((n, i) => this.tone(t + i * (win ? 0.09 : 0.18), win ? "square" : "sawtooth", 330 * Math.pow(2, n / 12), 330 * Math.pow(2, n / 12), 0.1, win ? 0.3 : 0.35));
  }

  /** UI sounds for menus. */
  ui(sound: "click" | "buy" | "deny" | "cash" | "launch"): void {
    this.ensure();
    const t = this.ctx?.currentTime;
    if (t === undefined) return;
    switch (sound) {
      case "click":
        this.tone(t, "square", 900, 600, 0.06, 0.04);
        break;
      case "buy":
        this.tone(t, "square", 520, 520, 0.08, 0.07);
        this.tone(t + 0.07, "square", 780, 780, 0.08, 0.1);
        this.noiseHit(t, "highpass", 5000, 3000, 0.08, 0.15);
        break;
      case "deny":
        this.tone(t, "sawtooth", 160, 110, 0.12, 0.2);
        break;
      case "cash":
        this.tone(t, "triangle", 1320, 1320, 0.08, 0.06);
        this.tone(t + 0.05, "triangle", 1760, 1760, 0.08, 0.12);
        break;
      case "launch":
        this.tone(t, "sawtooth", 80, 300, 0.2, 0.5);
        this.noiseHit(t, "bandpass", 400, 2000, 0.2, 0.5);
        break;
    }
  }
}

export const audio = new AudioSystem();
