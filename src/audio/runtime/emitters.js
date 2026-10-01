// Persistent spatial emitters. Each emitter: sources -> voice -> level -> panner -> air LPF -> dry -> emitter bus,
// and level -> send -> alley reverb. Panning model switches between HRTF/equalpower (nearest few get HRTF)
// behind a short gain dip. Per-type slow random modulation keeps long loops from sounding like loops.
import {
  glide, jump, hold, makePanner, setPannerPos, dist, airCutoff, inverseGain, dbToGain, rand, randExp, loopSource,
  autoCleanup, pickIndexNoRepeat, finite,
} from './spatial.js';

// Calibrated type levels (dB at refDistance for gain=1) and acoustic parameters.
export const EMITTER_TYPES = {
  hvac: { db: -18, ref: 2.0, rolloff: 1.0, send: 0.32 },
  exhaust: { db: -17, ref: 3.0, rolloff: 1.0, send: 0.25 },
  transformer: { db: -28, ref: 1.5, rolloff: 1.0, send: 0.2 },
  lampBuzz: { db: -17, ref: 1.0, rolloff: 1.0, send: 0.25 },
  trickle: { db: -11, ref: 1.0, rolloff: 1.0, send: 0.45 },
  drain: { db: -16, ref: 1.5, rolloff: 1.0, send: 0.5 },
  tv: { db: -16, ref: 2.0, rolloff: 1.0, send: 0.3 },
  voices: { db: -17, ref: 2.0, rolloff: 1.0, send: 0.3 },
  radio: { db: -18, ref: 3.0, rolloff: 1.0, send: 0.3 },
};

/** Plays random segments of a long buffer with crossfades (no audible loop). */
export class ShufflePlayer {
  constructor(ctx, dest, o) {
    this.ctx = ctx;
    this.dest = dest;
    this.o = o;
    this.next = null;
    this.live = new Set();
    this.stopped = false;
  }
  start(t) { this.next = t; }
  update(now) {
    if (this.stopped || this.next === null) return;
    let guard = 0;
    while (this.next < now + 1.0 && guard++ < 4) this._schedule(Math.max(this.next, now));
  }
  _schedule(t) {
    const o = this.o;
    const seg = o.pick();
    if (!seg) { this.next = t + 1; return; }
    if (seg.gap) { this.next = t + seg.gap; return; }
    const xf = o.xfade ?? 0.25;
    const rate = o.rate ?? 1;
    const src = this.ctx.createBufferSource();
    src.buffer = seg.buffer;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    const lvl = seg.gain ?? 1;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl, t + xf);
    g.gain.setValueAtTime(lvl, t + seg.dur);
    g.gain.linearRampToValueAtTime(0, t + seg.dur + xf);
    src.connect(g);
    g.connect(this.dest);
    const maxOff = Math.max(0, seg.buffer.duration - (seg.dur + xf) * rate - 0.01);
    src.start(t, Math.min(seg.offset, maxOff), (seg.dur + xf + 0.02) * rate);
    const rec = { src, g };
    this.live.add(rec);
    autoCleanup(src, [g], () => this.live.delete(rec));
    this.next = t + seg.dur;
  }
  stop(now) {
    this.stopped = true;
    for (const { src, g } of this.live) {
      try { hold(g.gain, now); g.gain.setTargetAtTime(0, now, 0.05); src.stop(now + 0.4); } catch (e) { /* ignore */ }
    }
  }
}

export class Emitter {
  constructor(engine, desc) {
    const ctx = engine.ctx;
    this.engine = engine;
    this.ctx = ctx;
    this.type = desc.type;
    this.cfg = EMITTER_TYPES[this.type];
    this.pos = { x: finite(desc.position?.x), y: finite(desc.position?.y), z: finite(desc.position?.z) };
    this.userGain = finite(desc.gain, 1);
    this.params = desc.params || {};
    this.intensity = 1;
    this.stopped = false;
    this.hrtf = false;
    this.pendingModel = null;
    this.nextMod = 0;
    this.nextSpatial = 0;
    const now = ctx.currentTime;

    // optional per-instance params: refDistance, rolloff, reverb (send multiplier), lowpass (Hz, extra muffling)
    this.ref = Math.max(0.1, finite(this.params.refDistance, this.cfg.ref));
    this.rolloff = Math.max(0, finite(this.params.rolloff, this.cfg.rolloff));
    this.sendMul = Math.max(0, finite(this.params.reverb, 1));
    this.voice = ctx.createGain();
    this.level = ctx.createGain();
    this.level.gain.value = 0;
    this.panner = makePanner(ctx, 'equalpower', this.ref, this.rolloff);
    this.air = ctx.createBiquadFilter();
    this.air.type = 'lowpass';
    this.air.Q.value = 0.5;
    this.air.frequency.value = 18000;
    this.dry = ctx.createGain();
    this.send = ctx.createGain();
    this.send.gain.value = 0;
    if (Number.isFinite(this.params.lowpass)) {
      this.muffle = ctx.createBiquadFilter();
      this.muffle.type = 'lowpass';
      this.muffle.frequency.value = Math.max(80, this.params.lowpass);
      this.muffle.Q.value = 0.6;
      this.voice.connect(this.muffle);
      this.muffle.connect(this.level);
    } else {
      this.voice.connect(this.level);
    }
    this.level.connect(this.panner);
    this.panner.connect(this.air);
    this.air.connect(this.dry);
    this.dry.connect(engine.busEmitters);
    this.level.connect(this.send);
    this.send.connect(engine.emitterSendIn);
    setPannerPos(this.panner, this.pos, now, 0);
    this.nodes = [this.voice, this.level, this.panner, this.air, this.dry, this.send];
    if (this.muffle) this.nodes.push(this.muffle);
    this.sources = [];
    this.build(now);
    glide(this.level.gain, this.targetLevel(), now, 0.4);
  }

  targetLevel() {
    return dbToGain(this.cfg.db) * this.userGain;
  }

  add(node) { this.nodes.push(node); return node; }

  build() { /* per type */ }

  setGain(v) {
    this.userGain = Math.max(0, finite(v, 1));
    if (!this.stopped) glide(this.level.gain, this.targetLevel(), this.ctx.currentTime, 0.08);
  }
  setIntensity(v) { this.intensity = Math.min(1, Math.max(0, finite(v, 1))); }
  setPosition(p) {
    this.pos = { x: finite(p.x), y: finite(p.y), z: finite(p.z) };
    setPannerPos(this.panner, this.pos, this.ctx.currentTime, 0.05);
  }

  setHrtf(on, now) {
    if (on === this.hrtf && this.pendingModel === null) return;
    if (this.pendingModel !== null) { this.pendingModel = on ? 'HRTF' : 'equalpower'; return; }
    if (on === this.hrtf) return;
    this.pendingModel = on ? 'HRTF' : 'equalpower';
    this.switchAt = now + 0.075;
    hold(this.dry.gain, now);
    this.dry.gain.setTargetAtTime(0, now, 0.01);
  }

  update(now, lis, dt) {
    if (this.stopped) return;
    if (this.pendingModel !== null && now >= this.switchAt) {
      this.panner.panningModel = this.pendingModel;
      this.hrtf = this.pendingModel === 'HRTF';
      this.pendingModel = null;
      hold(this.dry.gain, now);
      this.dry.gain.setTargetAtTime(1, now, 0.02);
    }
    if (now >= this.nextSpatial) {
      this.nextSpatial = now + 0.1;
      const d = dist(this.pos, lis.pos);
      this.distance = d;
      glide(this.air.frequency, airCutoff(d), now, 0.15);
      // reverb send falls slower than the direct sound -> distance cue
      const g = inverseGain(d, this.ref, this.rolloff);
      glide(this.send.gain, this.cfg.send * this.sendMul * Math.sqrt(g), now, 0.15);
    }
    if (now >= this.nextMod) {
      this.nextMod = now + rand(2, 6);
      this.modulate(now);
    }
    this.tick(now, dt);
  }
  modulate() { /* per type */ }
  tick() { /* per type */ }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    hold(this.level.gain, now);
    this.level.gain.setTargetAtTime(0, now, 0.08);
    for (const s of this.sources) { try { s.stop(now + 0.6); } catch (e) { /* ignore */ } }
    if (this.player) this.player.stop(now);
    const nodes = this.nodes;
    const done = () => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } } };
    if (this.sources.length) this.sources[0].onended = done;
    else if (typeof setTimeout === 'function') setTimeout(done, 800);
  }
}

// ------------------------------------------------------------------ types
class Hvac extends Emitter {
  build(now) {
    const b = this.engine.buffers;
    const src = loopSource(this.ctx, b.hvac, rand(0.985, 1.015), now);
    this.sources.push(src);
    this.lp = this.add(this.ctx.createBiquadFilter());
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 1600;
    this.mod = this.add(this.ctx.createGain());
    src.connect(this.lp);
    this.lp.connect(this.mod);
    this.mod.connect(this.voice);
    this.nextRattle = now + rand(3, 15);
  }
  modulate(now) {
    glide(this.lp.frequency, rand(1100, 2400), now, 1.5);
    glide(this.mod.gain, rand(0.85, 1.1), now, 2);
  }
  tick(now) {
    if (now < this.nextRattle || this.params.rattle === false) return;
    const wind = this.engine.currentWind ?? 0.2;
    this.nextRattle = now + 3 + randExp(14 / (0.6 + wind));
    const bank = this.engine.buffers.hvacRattle;
    if (!bank || !bank.length) return;
    this._lastR = pickIndexNoRepeat(bank.length, this._lastR ?? -1);
    const src = this.ctx.createBufferSource();
    src.buffer = bank[this._lastR];
    src.playbackRate.value = rand(0.95, 1.05);
    const g = this.ctx.createGain();
    g.gain.value = rand(0.25, 0.6);
    src.connect(g);
    g.connect(this.voice);
    src.start(now);
    autoCleanup(src, [g]);
  }
}

class Exhaust extends Emitter {
  build(now) {
    const src = loopSource(this.ctx, this.engine.buffers.exhaust, rand(0.98, 1.02), now);
    this.sources.push(src);
    this.lp = this.add(this.ctx.createBiquadFilter());
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 2200;
    this.mod = this.add(this.ctx.createGain());
    src.connect(this.lp);
    this.lp.connect(this.mod);
    this.mod.connect(this.voice);
    this._lastW = -1;
  }
  modulate(now) { glide(this.lp.frequency, rand(1400, 2800), now, 1.5); }
  tick(now) {
    const w = this.engine.currentWind ?? 0.2;
    if (Math.abs(w - this._lastW) > 0.03) {
      this._lastW = w;
      glide(this.mod.gain, 0.8 + 0.45 * w, now, 0.4);
    }
  }
}

class Transformer extends Emitter {
  build(now) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.engine.waves.transformer);
    osc.frequency.value = 60;
    osc.start(now);
    this.sources.push(osc);
    this.osc = osc;
    this.mod = this.add(ctx.createGain());
    this.mod.gain.value = 0.9;
    osc.connect(this.mod);
    this.mod.connect(this.voice);
    const siz = loopSource(ctx, this.engine.buffers.sizzle, rand(0.97, 1.03), now);
    this.sources.push(siz);
    const sg = this.add(ctx.createGain());
    sg.gain.value = 0.05;
    siz.connect(sg);
    sg.connect(this.voice);
  }
  modulate(now) {
    glide(this.mod.gain, rand(0.75, 1.0), now, 2.5);
    glide(this.osc.frequency, 60 + rand(-0.03, 0.03), now, 3);
  }
}

class LampBuzz extends Emitter {
  build(now) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.engine.waves.ballast);
    osc.frequency.value = 120;
    osc.start(now);
    this.sources.push(osc);
    const bp = this.add(ctx.createBiquadFilter());
    bp.type = 'bandpass';
    bp.frequency.value = rand(1400, 2600);
    bp.Q.value = 0.8;
    const body = this.add(ctx.createBiquadFilter());
    body.type = 'lowpass';
    body.frequency.value = 450;
    const bodyG = this.add(ctx.createGain());
    bodyG.gain.value = 0.6;
    this.buzz = this.add(ctx.createGain());
    this.buzz.gain.value = 0;
    osc.connect(bp);
    bp.connect(this.buzz);
    osc.connect(body);
    body.connect(bodyG);
    bodyG.connect(this.buzz);
    this.buzz.connect(this.voice);
    const siz = loopSource(ctx, this.engine.buffers.sizzle, rand(0.97, 1.03), now);
    this.sources.push(siz);
    this.siz = this.add(ctx.createGain());
    this.siz.gain.value = 0;
    siz.connect(this.siz);
    this.siz.connect(this.voice);
    this.lastI = -1;
    this.lastCrackle = -1;
    this.setIntensity(1);
  }
  setIntensity(v) {
    v = Math.min(1, Math.max(0, finite(v, 1)));
    const prev = this.lastI < 0 ? v : this.lastI;
    this.intensity = v;
    if (Math.abs(v - this.lastI) < 0.004) return;
    this.lastI = v;
    const now = this.ctx.currentTime;
    const lvl = v < 0.05 ? 0 : Math.pow(v, 1.3);
    const d = v - prev;
    if (prev < 0.08 && v > 0.3) {
      // striking: starter tick + crackle + buzz overshoot
      this.playCrackle(now, 0.9, true);
      jump(this.buzz.gain, lvl * 1.9, now);
      this.buzz.gain.setTargetAtTime(lvl, now + 0.012, 0.06);
      jump(this.siz.gain, 0.9, now);
      this.siz.gain.setTargetAtTime(0.22 * lvl, now + 0.01, 0.05);
      return;
    }
    glide(this.buzz.gain, lvl, now, 0.006);
    if (Math.abs(d) > 0.12 && lvl > 0) {
      this.playCrackle(now, Math.min(1, Math.abs(d) * 1.8), false);
      jump(this.siz.gain, 0.5 + Math.abs(d), now);
      this.siz.gain.setTargetAtTime(0.22 * lvl, now + 0.01, 0.04);
    } else {
      glide(this.siz.gain, 0.22 * lvl, now, 0.01);
    }
  }
  playCrackle(now, amt, tick) {
    if (now - this.lastCrackle < 0.06) return;
    this.lastCrackle = now;
    const b = this.engine.buffers;
    const bank = tick && b.lampTick ? b.lampTick : b.lampCrackle;
    if (!bank || !bank.length) return;
    this._lastC = pickIndexNoRepeat(bank.length, this._lastC ?? -1);
    const src = this.ctx.createBufferSource();
    src.buffer = bank[this._lastC];
    src.playbackRate.value = rand(0.9, 1.1);
    const g = this.ctx.createGain();
    g.gain.value = 1.2 * amt * rand(0.7, 1);
    src.connect(g);
    g.connect(this.voice);
    src.start(now);
    autoCleanup(src, [g]);
    if (tick && b.lampCrackle) {
      const s2 = this.ctx.createBufferSource();
      s2.buffer = b.lampCrackle[Math.floor(Math.random() * b.lampCrackle.length)];
      const g2 = this.ctx.createGain();
      g2.gain.value = 0.8 * amt;
      s2.connect(g2);
      g2.connect(this.voice);
      s2.start(now + rand(0.01, 0.04));
      autoCleanup(s2, [g2]);
    }
  }
}

class LoopWithWander extends Emitter {
  build(now) {
    const key = this.type;
    const src = loopSource(this.ctx, this.engine.buffers[key], rand(0.97, 1.03), now);
    this.sources.push(src);
    this.mod = this.add(this.ctx.createGain());
    src.connect(this.mod);
    this.mod.connect(this.voice);
  }
  modulate(now) { glide(this.mod.gain, rand(0.75, 1.1), now, 2); }
}

class Behind extends Emitter {
  // tv / voices: random segments of a long, pre-muffled buffer
  build(now) {
    const buf = this.engine.buffers[this.type];
    this.mod = this.add(this.ctx.createGain());
    this.mod.connect(this.voice);
    const isTv = this.type === 'tv';
    // per-instance playback-rate offset: different windows sound like different people / programmes
    const rate = isTv ? rand(0.94, 1.06) : rand(0.88, 1.12);
    this.player = new ShufflePlayer(this.ctx, this.mod, {
      xfade: isTv ? 0.2 : 0.3,
      rate,
      pick: () => {
        if (!isTv && Math.random() < 0.12) return { gap: rand(1, 5) };
        const dur = isTv ? rand(3.5, 9) : rand(3, 8);
        return { buffer: buf, offset: Math.random() * (buf.duration - dur - 0.5), dur, gain: rand(0.8, 1.05) };
      },
    });
    this.player.start(now + 0.05);
  }
  modulate(now) { glide(this.mod.gain, rand(0.85, 1.05), now, 2); }
  tick(now) { this.player.update(now); }
}

class Radio extends Emitter {
  build(now) {
    const R = this.engine.buffers.radio;
    this.mod = this.add(this.ctx.createGain());
    this.mod.connect(this.voice);
    let song = Math.floor(Math.random() * R.songs.length);
    let phrasesLeft = 4 + Math.floor(Math.random() * 6);
    let djNext = false;
    this.player = new ShufflePlayer(this.ctx, this.mod, {
      xfade: 0.06,
      pick: () => {
        if (djNext) {
          djNext = false;
          song = (song + 1) % R.songs.length;
          phrasesLeft = 4 + Math.floor(Math.random() * 6);
          return { buffer: R.dj, offset: 0, dur: R.dj.duration - 0.1, gain: 0.9 };
        }
        if (phrasesLeft-- <= 0) {
          djNext = Math.random() < 0.6;
          if (!djNext) { song = (song + 1) % R.songs.length; phrasesLeft = 4 + Math.floor(Math.random() * 6); }
          return { gap: rand(0.8, 2.5) };
        }
        const buf = R.songs[song];
        const phrase = R.barSec[song] * 4;
        const k = Math.random() < 0.5 ? 0 : 1;
        return { buffer: buf, offset: k * phrase, dur: phrase, gain: 1 };
      },
    });
    this.player.start(now + 0.05);
  }
  modulate(now) { glide(this.mod.gain, rand(0.85, 1.05), now, 3); }
  tick(now) { this.player.update(now); }
}

const NEEDS = {
  hvac: ['hvac'], exhaust: ['exhaust'], transformer: ['sizzle', '~transformer'], lampBuzz: ['sizzle', 'lampCrackle', '~ballast'],
  trickle: ['trickle'], drain: ['drain'], tv: ['tv'], voices: ['voices'], radio: ['radio'],
};
/** True when the buffers/waves an emitter type depends on have been synthesized. */
export function emitterBuffersReady(type, buffers, waves) {
  const need = NEEDS[type];
  if (!need) return false;
  return need.every((k) => (k[0] === '~' ? !!waves[k.slice(1)] : !!buffers[k]));
}

const CLASSES = {
  hvac: Hvac, exhaust: Exhaust, transformer: Transformer, lampBuzz: LampBuzz, trickle: LoopWithWander,
  drain: LoopWithWander, tv: Behind, voices: Behind, radio: Radio,
};

export function createEmitter(engine, desc) {
  const C = CLASSES[desc.type];
  if (!C) throw new Error('unknown emitter type ' + desc.type);
  return new C(engine, desc);
}

/** Handle returned by AudioEngine.addEmitter (valid before the engine is ready). */
export class EmitterHandle {
  constructor(engine, desc) {
    this.engine = engine;
    this.desc = { ...desc, position: { ...(desc.position || { x: 0, y: 0, z: 0 }) } };
    this.type = desc.type;
    this.em = null;
    this.stopped = false;
    this.intensity = 1;
  }
  _instantiate() {
    if (this.stopped || this.em) return;
    try {
      this.em = createEmitter(this.engine, this.desc);
      if (this.intensity !== 1) this.em.setIntensity(this.intensity);
    } catch (e) {
      console.warn('[audio] emitter failed', this.type, e);
    }
  }
  setGain(v) { this.desc.gain = v; if (this.em) this.em.setGain(v); }
  setIntensity(v) { this.intensity = v; if (this.em) this.em.setIntensity(v); }
  setPosition(p) { this.desc.position = { x: p.x, y: p.y, z: p.z }; if (this.em) this.em.setPosition(p); }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.em) this.em.stop();
    this.engine._removeHandle(this);
  }
  get position() { return this.desc.position; }
}
