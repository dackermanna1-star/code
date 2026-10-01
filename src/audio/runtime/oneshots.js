// One-shot voice pool (persistent panners, a few HRTF ones for nearby events) and the car-pass mover.
import {
  glide, jump, makePanner, setPannerPos, dist, airCutoff, inverseGain, dbToGain, rand, pickIndexNoRepeat, finite,
  autoCleanup, SPEED_OF_SOUND,
} from './spatial.js';

// type -> bank selection, level and acoustics
export const ONESHOT_TYPES = {
  drip: { db: { water: -13, metal: -17, ground: -17, plastic: -15 }, ref: 1.0, send: 0.55, rate: 0.07 },
  canKick: { bank: 'canKick', db: -6, ref: 1.5, send: 0.45, rate: 0.05 },
  canRoll: { bank: 'canRoll', db: -10, ref: 1.5, send: 0.45, rate: 0.04 },
  bottleKick: { bank: 'bottleKick', db: -7, ref: 1.5, send: 0.45, rate: 0.04 },
  paperRustle: { bank: 'paperRustle', db: -19, ref: 1.0, send: 0.3, rate: 0.08 },
  plasticRustle: { bank: 'plasticRustle', db: -19, ref: 1.0, send: 0.3, rate: 0.08 },
  garbageShift: { bank: 'garbageShift', db: -11, ref: 1.5, send: 0.45, rate: 0.06 },
  doorRattle: { bank: 'doorRattle', db: -10, ref: 1.5, send: 0.45, rate: 0.05 },
  wireCreak: { bank: 'wireCreak', db: -22, ref: 2.0, send: 0.4, rate: 0.08 },
};

class Voice {
  constructor(ctx, out, sendBus, hrtf) {
    this.ctx = ctx;
    this.hrtf = hrtf;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.panner = makePanner(ctx, hrtf ? 'HRTF' : 'equalpower', 1, 1);
    this.air = ctx.createBiquadFilter();
    this.air.type = 'lowpass';
    this.air.Q.value = 0.5;
    this.send = ctx.createGain();
    this.send.gain.value = 0;
    this.gain.connect(this.panner);
    this.panner.connect(this.air);
    this.air.connect(out);
    this.gain.connect(this.send);
    this.send.connect(sendBus);
    this.busyUntil = 0;
    this.started = 0;
    this.src = null;
  }
}

export class OneShotPool {
  constructor(engine, n = 12, nHrtf = 3) {
    this.engine = engine;
    this.ctx = engine.ctx;
    this.voices = [];
    for (let i = 0; i < n; i++) this.voices.push(new Voice(this.ctx, engine.busOneShots, engine.oneShotSendIn, i < nHrtf));
    this.last = {};
    this.hrtfCount = nHrtf;
  }

  _choose(now, d) {
    const free = (v) => v.busyUntil <= now;
    if (d < 9) {
      const v = this.voices.find((x) => x.hrtf && free(x));
      if (v) return v;
    }
    const v = this.voices.find((x) => !x.hrtf && free(x));
    if (v) return v;
    // steal the oldest non-HRTF voice
    let best = null;
    for (const x of this.voices) if (!x.hrtf && (!best || x.started < best.started)) best = x;
    return best;
  }

  play(buffer, pos, o = {}) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const lis = this.engine._lis.pos;
    const d = dist(pos, lis);
    const v = this._choose(now, d);
    if (!v) return null;
    let t = now + (o.delay ?? 0);
    if (v.busyUntil > now && v.src) {
      // steal: quick fade
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0, now, 0.004);
      try { v.src.stop(now + 0.025); } catch (e) { /* ignore */ }
      t = Math.max(t, now + 0.03);
    }
    const g = o.gain ?? 1;
    v.gain.gain.cancelScheduledValues(t);
    if (o.fadeIn) {
      v.gain.gain.setValueAtTime(0, t);
      v.gain.gain.linearRampToValueAtTime(g, t + o.fadeIn);
    } else {
      v.gain.gain.setValueAtTime(g, t);
    }
    v.panner.refDistance = o.ref ?? 1;
    setPannerPos(v.panner, pos, t, 0);
    jump(v.air.frequency, airCutoff(d), t);
    const ig = inverseGain(d, o.ref ?? 1, 1);
    jump(v.send.gain, (o.send ?? 0.4) * Math.sqrt(ig), t);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const rate = o.rate ?? 1;
    src.playbackRate.value = rate;
    src.connect(v.gain);
    const offset = o.offset ?? 0;
    let dur = o.duration ?? (buffer.duration - offset) / rate;
    if (o.duration) {
      // end with a fade instead of a cut
      const fade = Math.min(0.4, dur * 0.3);
      v.gain.gain.setValueAtTime(g, t + Math.max(0.01, dur - fade));
      v.gain.gain.linearRampToValueAtTime(0, t + dur);
      src.start(t, offset, dur * rate + 0.02);
    } else {
      src.start(t, offset);
    }
    v.src = src;
    v.started = t;
    v.busyUntil = t + dur + 0.05;
    src.onended = () => {
      try { src.disconnect(); } catch (e) { /* ignore */ }
      if (v.src === src) v.src = null;
    };
    return v;
  }

  /** Public dispatch for AudioEngine.oneShot (except carPass). */
  trigger(type, params, banks) {
    const cfg = ONESHOT_TYPES[type];
    if (!cfg) return false;
    const pos = params.position || this.engine._lis.pos;
    const p = { x: finite(pos.x), y: finite(pos.y), z: finite(pos.z) };
    let bankName = cfg.bank;
    let db = cfg.db;
    if (type === 'drip') {
      const surf = ['water', 'metal', 'ground', 'plastic'].includes(params.surface) ? params.surface : 'water';
      bankName = 'drip.' + surf;
      db = cfg.db[surf];
    }
    const bank = banks[bankName];
    if (!bank || !bank.length) return false;
    const idx = pickIndexNoRepeat(bank.length, this.last[bankName] ?? -1);
    this.last[bankName] = idx;
    const buf = bank[idx];
    const strength = Math.min(1.5, Math.max(0.05, finite(params.strength, 0.7)));
    let gain = dbToGain(db + rand(-2, 2)) * (params.gain ?? 1);
    if (type === 'canKick' || type === 'bottleKick' || type === 'paperRustle' || type === 'plasticRustle') gain *= 0.35 + 0.65 * strength;
    if (params.ambient) gain *= 0.5;
    const rate = 1 + rand(-cfg.rate, cfg.rate);
    const o = { gain, rate, ref: cfg.ref, send: cfg.send * (params.ambient ? 1.6 : 1) };
    if (type === 'canRoll') {
      const want = Math.max(0.3, finite(params.duration, 2));
      const full = buf.duration / rate;
      if (want < full) { o.offset = (full - want) * rate; o.fadeIn = 0.06; }
      else o.rate = Math.max(0.8, full / want) * rate;
    }
    this.play(buf, p, o);
    return true;
  }
}

/**
 * Car passing on a wet street near an alley opening. Engine + tyre loops through a moving panner,
 * Doppler from the rate of change of the propagation path, and occlusion/portal handling: when the
 * car is not visible through the alley mouth, the sound arrives diffracted around the corner
 * (apparent position at the corner, darker and quieter).
 */
export class CarPass {
  constructor(engine, params, hrtf) {
    const ctx = engine.ctx;
    this.engine = engine;
    this.ctx = ctx;
    const now = ctx.currentTime;
    this.t0 = now;
    this.from = { x: finite(params.from?.x, -40), y: finite(params.from?.y, 0.5), z: finite(params.from?.z, 14) };
    this.to = { x: finite(params.to?.x, 40), y: finite(params.to?.y, 0.5), z: finite(params.to?.z, 14) };
    this.dur = Math.max(0.5, finite(params.duration, 6));
    this.done = false;
    this.hrtf = hrtf;
    const b = engine.buffers;
    const k = Math.floor(Math.random() * b.carTires.length);
    this.tire = ctx.createBufferSource();
    this.tire.buffer = b.carTires[k];
    this.tire.loop = true;
    this.eng = ctx.createBufferSource();
    this.eng.buffer = b.carEngine[k % b.carEngine.length];
    this.eng.loop = true;
    this.baseRate = rand(0.94, 1.06);
    this.tireG = ctx.createGain();
    this.tireG.gain.value = 1;
    this.engG = ctx.createGain();
    this.engG.gain.value = 0.55;
    this.spray = ctx.createBiquadFilter();
    this.spray.type = 'highshelf';
    this.spray.frequency.value = 2500;
    this.spray.gain.value = 0;
    this.occl = ctx.createBiquadFilter();
    this.occl.type = 'lowpass';
    this.occl.Q.value = 0.5;
    this.occl.frequency.value = 16000;
    this.vol = ctx.createGain();
    this.vol.gain.value = 0;
    this.panner = makePanner(ctx, hrtf ? 'HRTF' : 'equalpower', 4, 1);
    this.air = ctx.createBiquadFilter();
    this.air.type = 'lowpass';
    this.air.Q.value = 0.5;
    this.send = ctx.createGain();
    this.send.gain.value = 0;
    this.tire.connect(this.tireG);
    this.eng.connect(this.engG);
    this.tireG.connect(this.spray);
    this.engG.connect(this.spray);
    this.spray.connect(this.occl);
    this.occl.connect(this.vol);
    this.vol.connect(this.panner);
    this.panner.connect(this.air);
    this.air.connect(engine.busOneShots);
    this.vol.connect(this.send);
    this.send.connect(engine.emitterSendIn);
    this.level = dbToGain(params.db ?? 2) * finite(params.gain, 1);
    this.tire.start(now, Math.random() * this.tire.buffer.duration);
    this.eng.start(now, Math.random() * this.eng.buffer.duration);
    this.prevPath = null;
    this.prevT = now;
    this.nodes = [this.tireG, this.engG, this.spray, this.occl, this.vol, this.panner, this.air, this.send];
    this.update(now, engine._lis);
  }

  /** Apparent source + occlusion (0 visible .. 1 fully diffracted) for a listener inside the alley. */
  portal(car, L) {
    const A = this.engine.alley;
    const hw = A.halfWidth;
    const inside = Math.abs(L.x) < hw + 0.5 && L.z < A.zBack + 0.5 && L.z > A.zFront - 6;
    if (!inside) return { pos: car, occl: 0, path: dist(car, L) };
    const tryOpening = (zOpen, beyond) => {
      if (!beyond) return null;
      const t = (zOpen - L.z) / (car.z - L.z);
      const xc = L.x + (car.x - L.x) * t;
      if (Math.abs(xc) <= hw) return { pos: car, occl: 0, path: dist(car, L) };
      const edge = { x: Math.sign(xc) * hw, y: Math.max(1, car.y), z: zOpen };
      const d1 = dist(L, edge);
      const d2 = dist(edge, car);
      // how far around the corner: angle between L->edge and edge->car
      const ax = edge.x - L.x, az = edge.z - L.z;
      const bx = car.x - edge.x, bz = car.z - edge.z;
      const cos = (ax * bx + az * bz) / ((Math.hypot(ax, az) || 1) * (Math.hypot(bx, bz) || 1));
      const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      const occl = Math.min(1, ang / (Math.PI * 0.5));
      const k = (d1 + d2) / (d1 || 1);
      return { pos: { x: L.x + (edge.x - L.x) * k, y: edge.y, z: L.z + (edge.z - L.z) * k }, occl, path: d1 + d2 };
    };
    const back = tryOpening(A.zBack, car.z > A.zBack);
    if (back) return back;
    const front = tryOpening(A.zFront, car.z < A.zFront);
    if (front) return front;
    // alongside the alley behind a facade: heavily occluded, arrives via nearest opening
    const zOpen = Math.abs(car.z - A.zBack) < Math.abs(car.z - A.zFront) ? A.zBack : A.zFront;
    const edge = { x: Math.sign(car.x || 1) * hw, y: 1, z: zOpen };
    const d1 = dist(L, edge), d2 = dist(edge, car);
    const k = (d1 + d2) / (d1 || 1);
    return { pos: { x: L.x + (edge.x - L.x) * k, y: 1, z: L.z + (edge.z - L.z) * k }, occl: 1, path: d1 + d2 };
  }

  update(now, lis) {
    if (this.done) return;
    const u = (now - this.t0) / this.dur;
    if (u >= 1) { this.finish(now); return; }
    const car = {
      x: this.from.x + (this.to.x - this.from.x) * u,
      y: this.from.y + (this.to.y - this.from.y) * u,
      z: this.from.z + (this.to.z - this.from.z) * u,
    };
    const P = this.portal(car, lis.pos);
    // Doppler from path-length rate
    let rate = this.baseRate;
    if (this.prevPath !== null && now - this.prevT > 1e-3) {
      const v = (P.path - this.prevPath) / (now - this.prevT);
      const vv = Math.max(-60, Math.min(60, v));
      rate *= SPEED_OF_SOUND / (SPEED_OF_SOUND + vv);
    }
    this.prevPath = P.path;
    this.prevT = now;
    glide(this.tire.playbackRate, rate, now, 0.06);
    glide(this.eng.playbackRate, rate, now, 0.06);
    setPannerPos(this.panner, P.pos, now, 0.03);
    const d = dist(P.pos, lis.pos);
    glide(this.air.frequency, airCutoff(d), now, 0.08);
    glide(this.occl.frequency, 16000 * Math.pow(1100 / 16000, Math.pow(P.occl, 0.6)), now, 0.08);
    const edgeFade = Math.min(1, u / 0.12, (1 - u) / 0.15);
    const og = 1 - 0.68 * Math.pow(P.occl, 0.8);
    glide(this.vol.gain, this.level * og * Math.max(0, edgeFade), now, 0.06);
    // wet spray emphasis when the car is close to the listener's line of sight
    const prox = Math.max(0, 1 - dist(car, lis.pos) / 25) * (1 - P.occl);
    glide(this.spray.gain, 5 * prox, now, 0.08);
    const ig = inverseGain(d, 4, 1);
    glide(this.send.gain, 0.5 * Math.sqrt(ig), now, 0.08);
  }

  finish(now) {
    if (this.done) return;
    this.done = true;
    glide(this.vol.gain, 0, now, 0.05);
    try { this.tire.stop(now + 0.3); this.eng.stop(now + 0.3); } catch (e) { /* ignore */ }
    const nodes = this.nodes;
    this.tire.onended = () => {
      try { this.tire.disconnect(); this.eng.disconnect(); } catch (e) { /* ignore */ }
      for (const n of nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    };
  }
}

export { autoCleanup };
