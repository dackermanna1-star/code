import { G } from '../core/G';
import { RECIPES } from './Sounds';
import { SR, ad, biquad, brown, buf, env, mix, normalize, osc, pink, setSampleRate, srand } from './Synth';

export interface PlayOpts {
  x?: number;
  y?: number;
  z?: number;
  volume?: number;
  pitch?: number;
  pitchVar?: number;
  voices?: number;
  reverb?: number;
  weapon?: boolean;
  /** When the voice pool is full, skip this sound instead of cutting the oldest. */
  dropIfFull?: boolean;
}

const DEFAULT_VOICES: Record<string, number> = { casing: 8, shell: 6, casingBig: 6, footstep: 2, hitFlesh: 8, bodyFall: 6, gib: 6, explosion: 6, groan: 8 };

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Procedural audio: every sound is synthesized at load into AudioBuffers, then
 * played through a small mixing graph with positional voices and reverb.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private verbIn!: GainNode;
  private buffers = new Map<string, AudioBuffer[]>();
  private active = new Map<string, AudioBufferSourceNode[]>();
  private loops: Record<string, { src: AudioBufferSourceNode; gain: GainNode }> = {};
  private vol = { master: 0.8, sfx: 1, music: 0.5 };
  private ambMode = 'menu';
  private hordeLevel = 0;
  ready = false;

  async init(progress?: (p: number) => void) {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx!;
    setSampleRate(ctx.sampleRate);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.3;
    this.master = ctx.createGain();
    this.master.gain.value = this.vol.master;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = this.vol.music;
    this.amb.connect(this.master);
    // reverb
    const conv = ctx.createConvolver();
    conv.buffer = this.makeIR(2.4);
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.9;
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.6;
    this.verbIn.connect(conv);
    conv.connect(verbOut);
    verbOut.connect(this.master);

    // synthesize everything
    const names = Object.keys(RECIPES);
    let done = 0;
    const total = names.reduce((a, n) => a + RECIPES[n].variants, 0) + 4;
    let lastYield = performance.now();
    for (const name of names) {
      const r = RECIPES[name];
      const arr: AudioBuffer[] = [];
      for (let v = 0; v < r.variants; v++) {
        srand(hash(name) + v * 7919);
        const data = r.fn(v);
        arr.push(this.toBuffer(data));
        done++;
        if (performance.now() - lastYield > 30) {
          progress?.(done / total);
          await new Promise((res) => setTimeout(res, 0));
          lastYield = performance.now();
        }
      }
      this.buffers.set(name, arr);
    }
    this.buildAmbience();
    progress?.(1);
    this.ready = true;
  }

  private toBuffer(data: Float32Array) {
    const b = this.ctx!.createBuffer(1, data.length, SR);
    b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    return b;
  }

  private makeIR(sec: number) {
    const ctx = this.ctx!;
    const len = Math.round(sec * ctx.sampleRate);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        const n = Math.random() * 2 - 1;
        lp = lp * 0.72 + n * 0.28;
        const early = t < 0.09 ? (Math.random() < 0.004 ? 1 : 0) * (1 - t / 0.09) : 0;
        d[i] = (lp * Math.exp(-t / 0.55) * (t < 0.02 ? t / 0.02 : 1) + early * 0.8) * 0.5;
      }
    }
    return ir;
  }

  private buildAmbience() {
    const mk = (name: string, data: Float32Array) => this.buffers.set(name, [this.toBuffer(data)]);
    srand(4242);
    // wind: brown noise with slow gusts
    const wl = 9;
    const w = biquad(brown(wl), 'lp', 420);
    env(w, (t) => 0.55 + 0.45 * Math.sin((t / wl) * Math.PI * 2 * 2) * Math.sin((t / wl) * Math.PI * 2 * 3 + 1));
    mk('ambWind', normalize(this.loopable(w), 0.5));
    // rain
    const rl = 4;
    const r = biquad(biquad(pink(rl), 'hp', 700), 'lp', 7000);
    mk('ambRain', normalize(this.loopable(r), 0.45));
    // crickets
    const cl = 6;
    const c = buf(cl);
    for (let k = 0; k < 26; k++) {
      const t0 = Math.random() * (cl - 0.3);
      const f = 4200 + Math.random() * 600;
      for (let j = 0; j < 3; j++) {
        const chirp = env(osc(0.04, f), ad(0.003, 0.01));
        mix(c, chirp, 0.3, t0 + j * 0.06);
      }
    }
    mk('ambCrickets', normalize(c, 0.25));
    // horde murmur: many groans layered
    const hl = 8;
    const h = buf(hl);
    const g = this.buffers.get('groan_normal') ?? [];
    for (let k = 0; k < 22; k++) {
      const src = g[k % g.length]?.getChannelData(0);
      if (!src) continue;
      mix(h, src, 0.35 + Math.random() * 0.3, Math.random() * (hl - 1));
    }
    mk('ambHorde', normalize(biquad(this.loopable(h), 'lp', 1400), 0.7));
  }

  /** Crossfades the end into the start for seamless looping. */
  private loopable(x: Float32Array) {
    const n = Math.round(0.5 * SR);
    const out = new Float32Array(x.length - n);
    out.set(x.subarray(0, out.length));
    for (let i = 0; i < n; i++) {
      const k = i / n;
      out[i] = out[i] * k + x[out.length + i] * (1 - k);
    }
    return out;
  }

  unlock() {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    if (this.ready && !this.loops.ambWind) {
      for (const name of ['ambWind', 'ambRain', 'ambCrickets', 'ambHorde']) {
        const b = this.buffers.get(name)?.[0];
        if (!b) continue;
        const src = this.ctx.createBufferSource();
        src.buffer = b;
        src.loop = true;
        const gn = this.ctx.createGain();
        gn.gain.value = 0;
        src.connect(gn);
        gn.connect(this.amb);
        src.start();
        this.loops[name] = { src, gain: gn };
      }
    }
  }

  setVolumes(master: number, sfx: number, music: number) {
    this.vol = { master, sfx, music };
    if (!this.ctx) return;
    this.master.gain.value = master;
    this.sfx.gain.value = sfx;
    this.amb.gain.value = music;
  }

  setAmbience(mode: string) {
    this.ambMode = mode;
  }

  play(name: string, o: PlayOpts = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.ready || ctx.state !== 'running') return;
    const arr = this.buffers.get(name);
    if (!arr || arr.length === 0) return;
    const b = arr[Math.floor(Math.random() * arr.length)];
    // voice limiting
    const key = name.startsWith('groan_') ? 'groan' : name;
    const limit = o.voices ?? DEFAULT_VOICES[key] ?? (o.weapon ? 10 : 5);
    let list = this.active.get(key);
    if (!list) {
      list = [];
      this.active.set(key, list);
    }
    if (list.length >= limit) {
      if (o.dropIfFull) return;
      const old = list.shift();
      try {
        old?.stop();
      } catch {
        /* already stopped */
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = b;
    const pv = o.pitchVar ?? 0.03;
    src.playbackRate.value = (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * pv);
    const gn = ctx.createGain();
    let vol = o.volume ?? 1;
    let node: AudioNode = src;
    let dist = 0;
    if (o.x !== undefined) {
      const cam = G.camera;
      dist = Math.hypot(o.x - cam.position.x, (o.y ?? 0) - cam.position.y, (o.z ?? 0) - cam.position.z);
      if (dist > 160) return;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(700, 20000 * Math.exp(-dist / 55));
      const pan = ctx.createPanner();
      pan.panningModel = 'equalpower';
      pan.distanceModel = 'inverse';
      pan.refDistance = name === 'explosion' || name === 'jet' || name === 'thunder' ? 14 : 3.5;
      pan.rolloffFactor = 1.1;
      pan.maxDistance = 400;
      pan.positionX.value = o.x;
      pan.positionY.value = o.y ?? 0;
      pan.positionZ.value = o.z ?? 0;
      node.connect(lp);
      lp.connect(pan);
      node = pan;
    }
    node.connect(gn);
    gn.gain.value = vol;
    gn.connect(this.sfx);
    const rv = o.reverb ?? (o.weapon ? 0.22 : name === 'explosion' ? 0.4 : name.startsWith('groan') ? 0.18 : name.startsWith('ui') || name === 'buy' ? 0 : 0.1);
    if (rv > 0) {
      const send = ctx.createGain();
      send.gain.value = rv * Math.min(1.5, 0.6 + dist / 40);
      gn.connect(send);
      send.connect(this.verbIn);
    }
    src.onended = () => {
      const i = list!.indexOf(src);
      if (i >= 0) list!.splice(i, 1);
      src.disconnect();
    };
    list.push(src);
    src.start();
    void vol;
  }

  private debrisNext = new Map<string, number>();
  /** Debris landings: rate-limited per kind so a shower of gibs stays cheap. */
  debris(kind: string, x: number, y: number, z: number, speed: number) {
    if (!this.ctx || speed < 1.2) return;
    const now = this.ctx.currentTime;
    if (now < (this.debrisNext.get(kind) ?? 0)) return;
    this.debrisNext.set(kind, now + (kind === 'casing' || kind === 'shell' ? 0.02 : 0.045));
    this.play(kind, { x, y, z, volume: Math.min(1, speed / 5) * 0.7, pitchVar: 0.12, dropIfFull: true });
  }

  explosion(x: number, y: number, z: number, radius: number) {
    this.play('explosion', { x, y, z, volume: Math.min(1.3, 0.7 + radius / 12), pitch: 1.15 - Math.min(0.35, radius / 30), pitchVar: 0.06 });
  }

  structHit(mat: string, x: number, y: number, z: number) {
    this.play('structHit_' + mat, { x, y, z, volume: 0.8, voices: 6 });
  }

  update(dt: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const cam = G.camera;
    const L = ctx.listener;
    const f = { x: 0, y: 0, z: -1 };
    const e = cam.matrixWorld.elements;
    f.x = -e[8];
    f.y = -e[9];
    f.z = -e[10];
    if (L.positionX) {
      L.positionX.value = cam.position.x;
      L.positionY.value = cam.position.y;
      L.positionZ.value = cam.position.z;
      L.forwardX.value = f.x;
      L.forwardY.value = f.y;
      L.forwardZ.value = f.z;
      L.upX.value = e[4];
      L.upY.value = e[5];
      L.upZ.value = e[6];
    } else {
      (L as any).setPosition(cam.position.x, cam.position.y, cam.position.z);
      (L as any).setOrientation(f.x, f.y, f.z, e[4], e[5], e[6]);
    }
    // ambience
    const s = G.atmosphere.state;
    let near = 0;
    for (const z of G.zombies.list) {
      const d = Math.hypot(z.x - cam.position.x, z.z - cam.position.z);
      if (d < 45) near += 1 - d / 45;
    }
    this.hordeLevel += (Math.min(1, Math.log(1 + near) / Math.log(40)) - this.hordeLevel) * Math.min(1, dt * 1.5);
    const set = (n: string, v: number) => {
      const l = this.loops[n];
      if (l) l.gain.gain.value += (v - l.gain.gain.value) * Math.min(1, dt * 2);
    };
    set('ambWind', 0.35 + s.storm * 0.4 + (this.ambMode === 'menu' ? 0.1 : 0));
    set('ambRain', s.rain * 0.8);
    set('ambCrickets', s.stars * 0.5 * (1 - s.rain));
    set('ambHorde', this.hordeLevel * 0.9);
  }
}
