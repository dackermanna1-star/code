import * as THREE from 'three';

interface Manifest {
  categories: Record<string, string[]>;
}

export interface PlayOpts {
  pos?: THREE.Vector3 | null;
  vol?: number;
  pitch?: number;
  pitchVar?: number;
  delay?: number;
  file?: string;
}

const CATEGORY_GAIN: Record<string, number> = {
  punch_light: 0.85, punch_heavy: 1.0, kick: 1.0, body_hit: 0.9, face_crunch: 0.95, bone_break: 1.0, block: 0.75, parry: 0.8,
  whoosh_light: 0.45, whoosh_heavy: 0.55, sword_swing: 0.6, sword_clash: 0.75, blade_flesh: 0.85, club_hit: 0.95, wood_break: 0.9,
  metal_hit: 0.85, body_fall: 0.9, footstep: 0.28, squish: 0.6, grunt_attack: 0.55, grunt_pain: 0.6, death: 0.7, announcer: 0.8, ambience: 0.35,
};
const MAX_VOICES: Record<string, number> = { footstep: 4, whoosh_light: 4, whoosh_heavy: 3, grunt_attack: 3, grunt_pain: 3, death: 3, squish: 4 };

export class AudioSys {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  amb!: GainNode;
  comp!: DynamicsCompressorNode;
  buffers = new Map<string, AudioBuffer>();
  cats: Record<string, string[]> = {};
  private lastPick = new Map<string, string>();
  private voices = new Map<string, number>();
  loaded = false;
  listener = new THREE.Vector3();
  camRight = new THREE.Vector3(1, 0, 0);
  private noiseBuf: AudioBuffer | null = null;
  volumes = { master: 0.9, sfx: 1, music: 0.6 };
  private ambSources: AudioBufferSourceNode[] = [];

  async init() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
    } catch {
      this.ctx = null;
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.18;
    this.sfx = c.createGain();
    this.music = c.createGain();
    this.amb = c.createGain();
    this.sfx.connect(this.comp);
    this.music.connect(this.master);
    this.amb.connect(this.master);
    this.comp.connect(this.master);
    this.master.connect(c.destination);
    this.applyVolumes();
    // noise buffer for synth layers
    const len = c.sampleRate * 1;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    try {
      const res = await fetch('audio/manifest.json');
      const m = (await res.json()) as Manifest;
      this.cats = m.categories;
      const all = Object.values(m.categories).flat();
      await Promise.all(
        all.map(async (f) => {
          try {
            const r = await fetch(f);
            const ab = await r.arrayBuffer();
            const buf = await c.decodeAudioData(ab);
            this.buffers.set(f, buf);
          } catch {
            /* missing file: skip */
          }
        }),
      );
      this.loaded = true;
    } catch {
      this.loaded = false;
    }
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.music.gain.value = this.volumes.music * 0.55;
    this.amb.gain.value = this.volumes.sfx * 0.6;
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => undefined);
  }

  setListener(pos: THREE.Vector3, right: THREE.Vector3) {
    this.listener.copy(pos);
    this.camRight.copy(right);
  }

  private pick(cat: string): string | null {
    const list = this.cats[cat];
    if (!list || list.length === 0) return null;
    let f = list[Math.floor(Math.random() * list.length)];
    if (list.length > 1 && f === this.lastPick.get(cat)) f = list[(list.indexOf(f) + 1) % list.length];
    this.lastPick.set(cat, f);
    return f;
  }

  play(cat: string, o: PlayOpts = {}) {
    const c = this.ctx;
    if (!c || !this.loaded || c.state !== 'running') return;
    const max = MAX_VOICES[cat] ?? 8;
    const cur = this.voices.get(cat) ?? 0;
    if (cur >= max) return;
    const file = o.file ?? this.pick(cat);
    if (!file) return;
    const buf = this.buffers.get(file);
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    const pv = o.pitchVar ?? 0.08;
    src.playbackRate.value = (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * pv);
    const g = c.createGain();
    let vol = (o.vol ?? 1) * (CATEGORY_GAIN[cat] ?? 0.8);
    let pan = 0;
    if (o.pos) {
      const dx = o.pos.x - this.listener.x, dy = o.pos.y - this.listener.y, dz = o.pos.z - this.listener.z;
      const d = Math.hypot(dx, dy, dz);
      vol *= 1 / (1 + Math.max(0, d - 2) * 0.12);
      pan = Math.max(-1, Math.min(1, (dx * this.camRight.x + dz * this.camRight.z) / Math.max(1.5, d)));
    }
    g.gain.value = vol;
    src.connect(g);
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan * 0.8;
      g.connect(p);
      p.connect(this.sfx);
    } else g.connect(this.sfx);
    const when = c.currentTime + (o.delay ?? 0);
    src.start(when);
    this.voices.set(cat, cur + 1);
    src.onended = () => this.voices.set(cat, Math.max(0, (this.voices.get(cat) ?? 1) - 1));
  }

  /** Short synthesized interface blips: focus move, confirm, back. */
  ui(kind: 'move' | 'ok' | 'back') {
    const c = this.ctx;
    if (!c || !this.sfx || c.state !== 'running') return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    const f = kind === 'ok' ? [330, 990] : kind === 'back' ? [520, 210] : [1250, 900];
    o.type = kind === 'move' ? 'triangle' : 'square';
    o.frequency.setValueAtTime(f[0], t);
    o.frequency.exponentialRampToValueAtTime(f[1], t + (kind === 'ok' ? 0.09 : 0.06));
    const peak = kind === 'move' ? 0.035 : 0.05;
    const len = kind === 'ok' ? 0.2 : 0.08;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + len + 0.02);
    if (kind === 'ok') this.thump(0.5);
  }

  /** A heartbeat (lub-dub) for low health. */
  heartbeat(vol: number) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t0 = c.currentTime;
    for (const [dt, v, f] of [[0, 1, 62], [0.17, 0.7, 54]] as [number, number, number][]) {
      const t = t0 + dt;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g);
      g.connect(this.sfx);
      o.start(t);
      o.stop(t + 0.18);
    }
  }

  /** Low-frequency body thump layered under heavy impacts (adds weight). */
  thump(strength: number, pos?: THREE.Vector3 | null) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110 + strength * 30, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    const v = 0.55 * Math.min(1.5, strength) * this.distGain(pos);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + 0.25);
  }

  /** Crisp synthetic crack (bone) layer. */
  crack(pos?: THREE.Vector3 | null) {
    const c = this.ctx;
    if (!c || !this.noiseBuf || c.state !== 'running') return;
    const t = c.currentTime;
    for (let i = 0; i < 3; i++) {
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800 + Math.random() * 2500;
      f.Q.value = 2.5;
      const g = c.createGain();
      const tt = t + i * (0.012 + Math.random() * 0.02);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.7 * this.distGain(pos), tt + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05);
      s.connect(f);
      f.connect(g);
      g.connect(this.sfx);
      s.start(tt, Math.random() * 0.5, 0.08);
    }
  }

  /** Filtered noise swoosh (supplements whoosh samples on big moves). */
  swoosh(dur = 0.25, pitch = 1) {
    const c = this.ctx;
    if (!c || !this.noiseBuf || c.state !== 'running') return;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400 * pitch, t);
    f.frequency.exponentialRampToValueAtTime(1800 * pitch, t + dur * 0.6);
    f.frequency.exponentialRampToValueAtTime(600 * pitch, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    s.start(t, Math.random() * 0.4, dur + 0.05);
  }

  private distGain(pos?: THREE.Vector3 | null) {
    if (!pos) return 1;
    const d = pos.distanceTo(this.listener);
    return 1 / (1 + Math.max(0, d - 2) * 0.12);
  }

  /**
   * Looping beds for the map: the warehouse is factory hum with rain on the roof outside; the rooftop
   * is the rain itself, up close, over a low city rumble.
   */
  startAmbience(map: string = 'warehouse') {
    const c = this.ctx;
    if (!c || !this.loaded) return;
    const list = this.cats['ambience'] ?? [];
    const levels = map === 'rooftop' ? [0.05, 0.85] : map === 'alley' ? [0.12, 0.1] : map === 'apartment' ? [0.0, 0.3] : map === 'lab' ? [0.3, 0.0] : [0.55, 0.22];
    list.forEach((f, i) => {
      const b = this.buffers.get(f);
      if (!b) return;
      const s = c.createBufferSource();
      s.buffer = b;
      s.loop = true;
      const g = c.createGain();
      g.gain.value = levels[i] ?? 0.2;
      s.connect(g);
      g.connect(this.amb);
      s.start();
      this.ambSources.push(s);
    });
    if (map === 'alley' || map === 'apartment' || map === 'lab') {
      // the city through the walls (the lab: the building's own machinery)
      const s = c.createBufferSource();
      s.buffer = this.brown();
      s.loop = true;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = map === 'lab' ? 140 : map === 'apartment' ? 160 : 260;
      const g = c.createGain();
      g.gain.value = map === 'alley' ? 0.4 : 0.25;
      s.connect(lp);
      lp.connect(g);
      g.connect(this.amb);
      s.start();
      this.ambSources.push(s);
    }
    if (map === 'lab') {
      // mains hum
      for (const [f, v] of [[60, 0.012], [120, 0.008], [180, 0.004]]) {
        const o = c.createOscillator();
        o.frequency.value = f;
        const g = c.createGain();
        g.gain.value = v;
        o.connect(g);
        g.connect(this.amb);
        o.start();
      }
    }
    if (map === 'rooftop') {
      // the second rain layer, offset and brighter, so the loop never repeats audibly
      const rainF = list[1] && this.buffers.get(list[1]);
      if (rainF) {
        const s = c.createBufferSource();
        s.buffer = rainF;
        s.loop = true;
        s.playbackRate.value = 1.13;
        const hp = c.createBiquadFilter();
        hp.type = 'highshelf';
        hp.frequency.value = 3500;
        hp.gain.value = 5;
        const g = c.createGain();
        g.gain.value = 0.35;
        s.connect(hp);
        hp.connect(g);
        g.connect(this.amb);
        s.start(0, rainF.duration * 0.47);
        this.ambSources.push(s);
      }
      // the city far below: a brown-noise rumble
      const s = c.createBufferSource();
      s.buffer = this.brown();
      s.loop = true;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      const g = c.createGain();
      g.gain.value = 0.32;
      s.connect(lp);
      lp.connect(g);
      g.connect(this.amb);
      s.start();
      this.ambSources.push(s);
    }
  }

  private brownBuf: AudioBuffer | null = null;
  /** Four seconds of brown (integrated, red) noise: all rumble, no hiss. */
  private brown() {
    const c = this.ctx!;
    if (this.brownBuf) return this.brownBuf;
    const len = c.sampleRate * 4;
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let v = 0;
      for (let i = 0; i < len; i++) {
        v = (v + (Math.random() * 2 - 1) * 0.02) * 0.998;
        d[i] = v * 3.2;
      }
      // fade the loop seam
      const f = 2048;
      for (let i = 0; i < f; i++) {
        const k = i / f;
        d[len - f + i] = d[len - f + i] * (1 - k) + d[i] * k;
      }
    }
    this.brownBuf = b;
    return b;
  }

  /**
   * Thunder: a crack if the strike is close, then a long low roll that swells two or three times as
   * it rumbles off between the buildings.
   */
  thunder(delay: number, vol: number) {
    const c = this.ctx;
    if (!c || c.state !== 'running' || !this.noiseBuf) return;
    const t = c.currentTime + delay;
    const near = vol > 0.78;
    if (near) {
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      s.connect(hp);
      hp.connect(g);
      g.connect(this.amb);
      s.start(t, Math.random() * 0.5, 0.4);
    }
    const dur = 3.5 + Math.random() * 2.5;
    const s = c.createBufferSource();
    s.buffer = this.brown();
    s.playbackRate.value = 0.8 + Math.random() * 0.3;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(near ? 1400 : 700, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.4 * vol, t + (near ? 0.06 : 0.35));
    // the roll: a few swells, each weaker than the last
    let at = t + 0.5;
    let level = 0.9 * vol;
    while (at < t + dur - 0.8) {
      g.gain.exponentialRampToValueAtTime(level * 0.45, at);
      at += 0.25 + Math.random() * 0.45;
      g.gain.exponentialRampToValueAtTime(level, at);
      at += 0.3 + Math.random() * 0.6;
      level *= 0.72;
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(lp);
    lp.connect(g);
    g.connect(this.amb);
    s.start(t, Math.random() * 3);
    s.stop(t + dur + 0.1);
  }

  /** A short burst of filtered noise (the building block of the synthesized breakage sounds). */
  private noiseHit(t: number, type: BiquadFilterType, f0: number, f1: number, q: number, v: number, dur: number) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    s.start(t, Math.random() * 0.7, dur + 0.05);
  }
  /** Bright little rings: glass and china. */
  private tinkles(t: number, n: number, lo: number, hi: number, v: number) {
    const c = this.ctx!;
    for (let i = 0; i < n; i++) {
      const tt = t + Math.random() * 0.25 + i * 0.01;
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(lo + Math.random() * (hi - lo), tt);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(v * (0.4 + Math.random() * 0.6), tt + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05 + Math.random() * 0.12);
      o.connect(g);
      g.connect(this.sfx);
      o.start(tt);
      o.stop(tt + 0.2);
    }
  }

  /** Something broke: glass shatters, china smashes, screens pop, cardboard crumples, bags burst. */
  shatter(material: string, pos: THREE.Vector3 | null, vol = 1) {
    const c = this.ctx;
    if (!c || !this.noiseBuf || c.state !== 'running') return;
    const t = c.currentTime;
    const v = vol * this.distGain(pos);
    switch (material) {
      case 'glass':
        this.noiseHit(t, 'highpass', 2600, 1800, 0.7, 0.55 * v, 0.35);
        this.noiseHit(t, 'bandpass', 5200, 3800, 2, 0.3 * v, 0.6);
        this.tinkles(t + 0.02, 14, 3000, 7500, 0.12 * v);
        break;
      case 'electronics':
        this.noiseHit(t, 'highpass', 2200, 1600, 0.7, 0.5 * v, 0.3);
        this.noiseHit(t, 'lowpass', 900, 200, 0.7, 0.6 * v, 0.25);
        this.tinkles(t + 0.02, 8, 2500, 6000, 0.1 * v);
        break;
      case 'ceramic':
        this.noiseHit(t, 'bandpass', 2400, 1200, 1.4, 0.7 * v, 0.22);
        this.tinkles(t + 0.01, 8, 1800, 4200, 0.12 * v);
        break;
      case 'paper':
        this.noiseHit(t, 'bandpass', 1400, 600, 0.8, 0.45 * v, 0.3);
        this.noiseHit(t + 0.08, 'bandpass', 1100, 500, 0.8, 0.3 * v, 0.25);
        break;
      case 'trash':
      case 'fabric':
        this.noiseHit(t, 'lowpass', 1200, 300, 0.7, 0.6 * v, 0.28);
        this.play('squish', { pos, vol: 0.35 * vol, pitch: 0.7 });
        break;
      case 'wood':
        this.play('wood_break', { pos, vol });
        break;
      default:
        this.play('metal_hit', { pos, vol });
    }
  }
  private alarmNodes: { o: OscillatorNode; g: GainNode; lfo: OscillatorNode } | null = null;
  /** The lab's lockdown klaxon: a rising two-tone whoop, over and over, until it's switched off. */
  alarm(on: boolean) {
    const c = this.ctx;
    if (!c) return;
    if (!on) {
      if (this.alarmNodes) {
        const t = c.currentTime;
        this.alarmNodes.g.gain.setTargetAtTime(0.0001, t, 0.2);
        const n = this.alarmNodes;
        setTimeout(() => {
          n.o.stop();
          n.lfo.stop();
        }, 1200);
        this.alarmNodes = null;
      }
      return;
    }
    if (this.alarmNodes || c.state !== 'running') return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 520;
    // a slow sawtooth LFO sweeps the pitch up (the whoop), a lowpass takes the edge off
    const lfo = c.createOscillator();
    lfo.type = 'sawtooth';
    lfo.frequency.value = 0.9;
    const depth = c.createGain();
    depth.gain.value = 230;
    lfo.connect(depth);
    depth.connect(o.frequency);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.4);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.amb);
    o.start(t);
    lfo.start(t);
    this.alarmNodes = { o, g, lfo };
  }

  /** A body lands on a grand piano: a crashing cluster of low strings, ringing on. */
  piano(pos: THREE.Vector3 | null, vol = 1) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime;
    const v = 0.2 * vol * this.distGain(pos);
    const base = 55 * Math.pow(2, Math.floor(Math.random() * 6) / 12);
    for (const semi of [0, 1, 5, 6, 11, 13, 18]) {
      for (const [type, mul, gain] of [['triangle', 1, 1], ['sine', 2.003, 0.35]] as [OscillatorType, number, number][]) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.value = base * Math.pow(2, semi / 12) * mul * (1 + (Math.random() - 0.5) * 0.004);
        const g = c.createGain();
        const tt = t + Math.random() * 0.03;
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(v * gain, tt + 0.006);
        g.gain.exponentialRampToValueAtTime(v * gain * 0.3, tt + 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 2.6);
        o.connect(g);
        g.connect(this.sfx);
        o.start(tt);
        o.stop(tt + 2.7);
      }
    }
    this.noiseHit(t, 'lowpass', 600, 120, 0.7, v * 1.5, 0.12);
  }

  /** Glass or china knocked but not broken. */
  clink(pos: THREE.Vector3 | null, vol = 0.5) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    this.tinkles(c.currentTime, 2, 2200, 4800, 0.09 * vol * this.distGain(pos));
  }
  /** Something soft or plastic hits the floor. */
  thudSoft(pos: THREE.Vector3 | null, vol = 0.5) {
    const c = this.ctx;
    if (!c || !this.noiseBuf || c.state !== 'running') return;
    this.noiseHit(c.currentTime, 'lowpass', 700, 150, 0.7, 0.4 * vol * this.distGain(pos), 0.14);
  }

  /** Water underfoot / under a body: a short wet slap of filtered noise. */
  splash(pos: THREE.Vector3 | null, vol = 0.5) {
    const c = this.ctx;
    if (!c || !this.noiseBuf || c.state !== 'running') return;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.5;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800 + Math.random() * 1400, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.09);
    bp.Q.value = 0.9;
    const g = c.createGain();
    const v = 0.32 * vol * this.distGain(pos);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    s.connect(bp);
    bp.connect(g);
    g.connect(this.sfx);
    s.start(t, Math.random() * 0.8, 0.14);
  }

  /** A siren a few blocks away: a slow wail, muffled by distance, drifting past. */
  siren(vol = 0.5) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime;
    const dur = 9 + Math.random() * 5;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const base = 620 + Math.random() * 120;
    o.frequency.setValueAtTime(base, t);
    for (let k = t; k < t + dur; k += 2.2) {
      o.frequency.linearRampToValueAtTime(base * 1.55, k + 1.1);
      o.frequency.linearRampToValueAtTime(base, k + 2.2);
    }
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * vol, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = c.createStereoPanner();
    pan.pan.setValueAtTime(Math.random() < 0.5 ? -0.8 : 0.8, t);
    pan.pan.linearRampToValueAtTime(-pan.pan.value * 0.6, t + dur);
    o.connect(lp);
    lp.connect(g);
    g.connect(pan);
    pan.connect(this.amb);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  /** Slow-motion: pitch down everything (applied to new sounds via global rate). */
  duck(amount: number, dur: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setValueAtTime(this.music.gain.value, t);
    this.music.gain.linearRampToValueAtTime(this.volumes.music * 0.55 * (1 - amount), t + 0.05);
    this.music.gain.linearRampToValueAtTime(this.volumes.music * 0.55, t + dur);
  }
}
