// Distant battle bed. Far-away events (and ones that lost the voice race) do not
// get full voices: they are rendered as rate-limited far "pops" and "thuds" on a
// small private pool, panned from their real direction, over a rolling rumble
// whose level follows battle intensity and how much distant fighting the sim
// reports. When the sim reports little far fire, synthetic bursts fill in.
import { SOUNDS } from './catalog.js';
import { Rng, clamp } from './dsp.js';
import { distanceGain, dryAmount, locate } from './spatial.js';

const VOICES = 20;
const WINDOW = 0.25;
const MAX_PER_WINDOW = 7;
const SMALL = ['rifle', 'rifle_ak', 'lmg', 'gpmg', 'rifle', 'rifle_ak', 'hmg'];
const HEAVY = ['tank_cannon', 'explosion_medium', 'explosion_large', 'howitzer', 'mortar', 'autocannon', 'explosion_small'];

export class BattleBed {
  constructor(ctx, mixer, bank) {
    this.ctx = ctx;
    this.bank = bank;
    this.rng = new Rng(0xbed);
    this.out = new GainNode(ctx, { gain: 1 });
    this.lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2400, Q: -3 });
    this.send = new GainNode(ctx, { gain: 0.9 });
    this.out.connect(this.lp).connect(mixer.amb);
    this.lp.connect(this.send).connect(mixer.reverbIn);
    const rumble = bank.get('amb:rumble').near[0];
    this.rumbleGain = new GainNode(ctx, { gain: 0 });
    this.rumble = new AudioBufferSourceNode(ctx, { buffer: rumble.buffer, loop: true });
    this.rumble.connect(this.rumbleGain).connect(this.out);
    this.rumble.start(ctx.currentTime, this.rng.range(0, rumble.duration));
    this.strips = [];
    for (let i = 0; i < VOICES; i++) {
      const gain = new GainNode(ctx, { gain: 0 });
      const pan = new StereoPannerNode(ctx);
      gain.connect(pan).connect(this.out);
      this.strips.push({ gain, pan, end: 0 });
    }
    this.queue = [];
    this.recent = [];
    this.loc = { d: 0, pan: 0 };
    this.countSmall = 0;
    this.countHeavy = 0;
    this.rateSmall = 0;
    this.rateHeavy = 0;
    this.window = [];
    this.nextSmall = 0;
    this.nextHeavy = 0;
    this.stats = { aggregated: 0, played: 0, dropped: 0, synthetic: 0 };
  }

  // Aggregate a far event; it is heard when its sound arrives (sim time `ev.due`).
  add(ev) {
    this.stats.aggregated++;
    if (ev.def.bed === 'heavy') this.countHeavy++;
    else this.countSmall++;
    if (this.queue.length < 800) this.queue.push(ev);
  }

  // Play an event now-ish (context time) on the bed, if the rate limit allows.
  play(ev, when) {
    const now = this.ctx.currentTime;
    const t = Math.max(when, now);
    // Rate limit on scheduled start times (bursts are scheduled ahead).
    let w = 0;
    let near = 0;
    for (const x of this.window) {
      if (x < now - WINDOW) continue;
      this.window[w++] = x;
      if (Math.abs(x - t) < WINDOW / 2) near++;
    }
    this.window.length = w;
    if (near >= MAX_PER_WINDOW) {
      this.stats.dropped++;
      return false;
    }
    const entry = this.bank.pick(ev.key, 'far');
    if (!entry) return false;
    let pan = ev.pan ?? 0;
    let gain = ev.loud;
    if (ev.spatial && this.listener) {
      locate(this.listener, ev.x, ev.y, ev.z, this.loc);
      pan = this.loc.pan;
      gain = ev.def.levelLin * distanceGain(ev.def, this.loc.d) * ev.vol * dryAmount(this.loc.d);
      this.recent.push(pan);
      if (this.recent.length > 32) this.recent.shift();
    }
    if (!this.voice(entry, gain, pan, t, ev.pitch ?? 1)) {
      this.stats.dropped++;
      return false;
    }
    this.window.push(t);
    this.stats.played++;
    return true;
  }

  voice(entry, gain, pan, when, rate) {
    const now = this.ctx.currentTime;
    let strip = null;
    for (const s of this.strips) {
      if (s.end <= now) {
        strip = s;
        break;
      }
    }
    if (!strip) return false;
    const src = new AudioBufferSourceNode(this.ctx, {
      buffer: entry.buffer, playbackRate: rate * (1 + 0.04 * this.rng.bi()),
    });
    src.connect(strip.gain);
    const t = Math.max(when, now);
    strip.gain.gain.setValueAtTime(gain, t);
    strip.pan.pan.setValueAtTime(clamp(pan, -0.9, 0.9), t);
    src.start(t);
    strip.end = t + entry.duration / src.playbackRate.value;
    return true;
  }

  // Pan for synthetic fire: mostly where real far fighting was heard recently.
  synthPan() {
    if (this.recent.length && this.rng.chance(0.7)) return this.recent[this.rng.int(this.recent.length)] + 0.15 * this.rng.bi();
    return 0.85 * this.rng.bi();
  }

  synthShot(names, dMin, dMax, when, burst) {
    const name = this.rng.pick(names);
    const def = SOUNDS[name];
    const d = this.rng.range(Math.min(dMin, def.range * 0.5), Math.min(dMax, def.range * 0.85));
    const gain = def.levelLin * distanceGain(def, d) * dryAmount(d) * this.rng.range(0.6, 1.2);
    const pan = this.synthPan();
    const ev = { key: name, def, loud: gain, pan, spatial: false, vol: 1, pitch: this.rng.range(0.95, 1.05) };
    const shots = burst ? (this.rng.chance(0.35) ? 3 + this.rng.int(8) : 1 + this.rng.int(3)) : 1;
    const interval = this.rng.range(0.065, 0.14);
    for (let k = 0; k < shots; k++) {
      const t = when + k * interval * this.rng.range(0.92, 1.08);
      this.stats.synthetic++;
      if (!this.play(ev, t)) break;
    }
  }

  update(dt, sim, env, listener) {
    this.listener = listener;
    const now = this.ctx.currentTime;
    if (dt > 0) {
      const k = 1 - Math.exp(-dt / 1.5);
      this.rateSmall += (this.countSmall / dt - this.rateSmall) * k;
      this.rateHeavy += (this.countHeavy / dt - this.rateHeavy) * k;
      this.countSmall = 0;
      this.countHeavy = 0;
    }
    const scale = Math.max(sim.timeScale, 1e-3);
    if (this.queue.length) {
      const horizon = sim.time + 0.06 * sim.timeScale;
      let w = 0;
      for (const ev of this.queue) {
        if (ev.due <= horizon) this.play(ev, now + Math.max(0, (ev.due - sim.time) / scale));
        else this.queue[w++] = ev;
      }
      this.queue.length = w;
    }
    const bi = clamp(env.battleIntensity ?? 0, 0, 1);
    const paused = sim.timeScale <= 0;
    if (!paused && bi > 0.01) {
      // Synthetic distant fire fills the gap between intensity and what the sim reports.
      const smallRate = bi * 3.5 * (1 - clamp(this.rateSmall / 8, 0, 1));
      const heavyRate = bi * 0.35 * (1 - clamp(this.rateHeavy / 1.5, 0, 1));
      this.nextSmall -= dt * sim.timeScale;
      this.nextHeavy -= dt * sim.timeScale;
      if (smallRate > 0.01 && this.nextSmall <= 0) {
        this.synthShot(SMALL, 700, 2400, now + 0.02, true);
        this.nextSmall = this.rng.exp(smallRate);
      }
      if (heavyRate > 0.01 && this.nextHeavy <= 0) {
        this.synthShot(HEAVY, 1500, 6000, now + 0.02, false);
        this.nextHeavy = this.rng.exp(heavyRate);
      }
    }
    this.paramTimer = (this.paramTimer ?? 0) - dt;
    if (this.paramTimer > 0) return;
    this.paramTimer = 0.1;
    const near = clamp(env.nearIntensity ?? 0, 0, 1);
    let rumble = 0.28 * bi + 0.06 * clamp(this.rateHeavy / 3, 0, 1) + 0.04 * clamp(this.rateSmall / 30, 0, 1);
    rumble *= (1 - 0.4 * near) * (paused ? 0.3 : 1);
    this.rumbleGain.gain.setTargetAtTime(rumble, now, 0.8);
  }

  dispose() {
    try {
      this.rumble.stop();
    } catch {
      // not started
    }
    this.out.disconnect();
    this.send.disconnect();
  }
}
