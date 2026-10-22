// Continuous engine/rotor/fire loops. Each frame the loudest few sources (with
// hysteresis so voices do not flicker) get a looping voice:
//   source (loop) -> lowpass -> gain -> pan -> loop bus, gain -> send -> reverb
// Sources are heard at their retarded position (where they were when the sound
// left them) with doppler from the relative radial velocity.
import { LOOPS } from './catalog.js';
import { clamp, hashString, lerp } from './dsp.js';
import { MIN_AUDIBLE } from './voices.js';
import { distanceGain, dopplerRatio, dryAmount, locate, retardedPosition, wetAmount } from './spatial.js';

const HYSTERESIS = 1.6;
const FADE_IN = 0.12;
const FADE_OUT = 0.25;

class LoopVoice {
  constructor(ctx, out, wet, entry, id, kind) {
    this.id = id;
    this.kind = kind;
    this.src = new AudioBufferSourceNode(ctx, { buffer: entry.buffer, loop: true });
    this.filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 20000, Q: -3 });
    this.gain = new GainNode(ctx, { gain: 0 });
    this.pan = new StereoPannerNode(ctx);
    this.send = new GainNode(ctx, { gain: 0 });
    this.src.connect(this.filter).connect(this.gain).connect(this.pan).connect(out);
    this.gain.connect(this.send).connect(wet);
    const h = hashString(String(id));
    this.detune = 1 + ((h % 1000) / 1000 - 0.5) * 0.06;
    this.src.start(ctx.currentTime, ((h >>> 10) % 1000) / 1000 * entry.duration);
    this.cur = { g: -1, pan: 0, cut: 20000, rate: 1, send: 0 };
    this.seen = 0;
  }

  fadeOut(now) {
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(0, now, FADE_OUT / 3);
    try {
      this.src.stop(now + FADE_OUT * 2);
    } catch {
      // already stopped
    }
    this.src.onended = () => {
      this.gain.disconnect();
      this.send.disconnect();
    };
  }
}

export class LoopManager {
  constructor(ctx, mixer, bank, max = 8) {
    this.ctx = ctx;
    this.bank = bank;
    this.max = max;
    this.bus = new GainNode(ctx, { gain: 1 });
    this.bus.connect(mixer.loops);
    this.wet = mixer.reverbIn;
    this.voices = new Map();
    this.cands = [];
    this.pool = [];
    this.loc = { d: 0, pan: 0, front: 1, cutoff: 20000, ux: 0, uy: 0, uz: 0 };
    this.ret = { x: 0, y: 0, z: 0, tau: 0 };
    this.frame = 0;
    this.unknown = new Set();
    this.paused = false;
  }

  setPaused(paused) {
    if (paused === this.paused) return;
    this.paused = paused;
    this.bus.gain.setTargetAtTime(paused ? 0.12 : 1, this.ctx.currentTime, 0.2);
  }

  candidate(i) {
    if (!this.pool[i]) this.pool[i] = { src: null, def: null, loud: 0, d: 0, x: 0, y: 0, z: 0 };
    return this.pool[i];
  }

  set(sources, L, sim) {
    const now = this.ctx.currentTime;
    this.frame++;
    const cands = this.cands;
    cands.length = 0;
    let n = 0;
    for (const s of sources || []) {
      const def = LOOPS[s.kind];
      if (!def) {
        if (!this.unknown.has(s.kind)) {
          this.unknown.add(s.kind);
          console.warn(`[audio] unknown loop kind "${s.kind}"`);
        }
        continue;
      }
      if (!s.position) continue;
      const r = retardedPosition(L, s.position, s.velocity, this.ret);
      const d = Math.hypot(r.x - L.px, r.y - L.py, r.z - L.pz);
      if (d > def.range) continue;
      const inten = clamp(s.intensity ?? 0.5, 0, 1);
      let loud = def.levelLin * distanceGain(def, d) * lerp(def.gain[0], def.gain[1], inten);
      if (loud < MIN_AUDIBLE) continue;
      const key = `${s.kind}:${s.id}`;
      if (this.voices.has(key)) loud *= HYSTERESIS;
      const c = this.candidate(n++);
      c.key = key;
      c.src = s;
      c.def = def;
      c.loud = loud;
      c.x = r.x;
      c.y = r.y;
      c.z = r.z;
      c.inten = inten;
      cands.push(c);
    }
    cands.sort((a, b) => b.loud - a.loud);
    const keep = Math.min(this.max, cands.length);
    for (let i = 0; i < keep; i++) this.drive(cands[i], L, sim, now);
    for (const [id, v] of this.voices) {
      if (v.seen !== this.frame) {
        v.fadeOut(now);
        this.voices.delete(id);
      }
    }
  }

  drive(c, L, sim, now) {
    const s = c.src;
    let v = this.voices.get(c.key);
    if (!v) {
      const set = this.bank.get(`loop:${s.kind}`);
      const entry = set.near[hashString(String(s.id)) % set.near.length];
      v = new LoopVoice(this.ctx, this.bus, this.wet, entry, s.id, s.kind);
      this.voices.set(c.key, v);
    }
    v.seen = this.frame;
    const def = c.def;
    const loc = locate(L, c.x, c.y, c.z, this.loc);
    const dry = dryAmount(loc.d);
    const g = def.levelLin * distanceGain(def, loc.d) * lerp(def.gain[0], def.gain[1], c.inten) * dry;
    const doppler = dopplerRatio(L, s.velocity, loc.ux, loc.uy, loc.uz);
    const rate = clamp(lerp(def.rate[0], def.rate[1], c.inten) * v.detune * doppler * sim.pitch, 0.25, 4);
    const send = (def.wet * wetAmount(loc.d)) / Math.max(dry, 0.05);
    const cur = v.cur;
    if (cur.g < 0) {
      v.gain.gain.setTargetAtTime(g, now, FADE_IN / 3);
      cur.g = g;
    } else if (Math.abs(g - cur.g) > 0.03 * Math.max(cur.g, 1e-5)) {
      v.gain.gain.setTargetAtTime(g, now, 0.05);
      cur.g = g;
    }
    if (Math.abs(loc.pan - cur.pan) > 0.01) {
      v.pan.pan.setTargetAtTime(loc.pan, now, 0.05);
      cur.pan = loc.pan;
    }
    if (Math.abs(loc.cutoff - cur.cut) > 0.03 * cur.cut) {
      v.filter.frequency.setTargetAtTime(loc.cutoff, now, 0.05);
      cur.cut = loc.cutoff;
    }
    if (Math.abs(rate - cur.rate) > 0.002) {
      v.src.playbackRate.setTargetAtTime(rate, now, 0.06);
      cur.rate = rate;
    }
    if (Math.abs(send - cur.send) > 0.05 * Math.max(cur.send, 1e-3)) {
      v.send.gain.setTargetAtTime(send, now, 0.1);
      cur.send = send;
    }
  }

  get count() {
    return this.voices.size;
  }

  stopAll() {
    const now = this.ctx.currentTime;
    for (const v of this.voices.values()) v.fadeOut(now);
    this.voices.clear();
  }

  dispose() {
    this.stopAll();
    this.bus.disconnect();
  }
}
