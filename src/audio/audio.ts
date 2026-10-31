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

  startAmbience() {
    const c = this.ctx;
    if (!c || !this.loaded) return;
    const list = this.cats['ambience'] ?? [];
    list.forEach((f, i) => {
      const b = this.buffers.get(f);
      if (!b) return;
      const s = c.createBufferSource();
      s.buffer = b;
      s.loop = true;
      const g = c.createGain();
      g.gain.value = i === 0 ? 0.55 : 0.22;
      s.connect(g);
      g.connect(this.amb);
      s.start();
      this.ambSources.push(s);
    });
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
