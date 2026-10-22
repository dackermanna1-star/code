// One-shot voices. Each of the `maxVoices` channel strips is a permanent chain
//   env gain -> lowpass (air absorption) -> gain (distance) -> stereo pan -> sfx bus
//                                        `-> send -> reverb bus
// so an event only allocates its AudioBufferSourceNode. Events wait in a queue
// keyed on simulation time until their sound arrives (distance / 343 s), then
// compete for strips by loudness at the listener; losers go to the distant bed.
import { CATEGORY_CAPS } from './catalog.js';
import { Rng, clamp } from './dsp.js';
import { dbToGain, distanceGain, dryAmount, locate, panSpread, wetAmount } from './spatial.js';

const LOOKAHEAD = 0.06;
const STEAL_FADE = 0.035;
const MAX_SPAWN_PER_UPDATE = 24;
const MAX_PENDING = 2000;
const STEAL_MARGIN = 1.3;
export const MIN_AUDIBLE = dbToGain(-70);

class Strip {
  constructor(ctx, dry, wet, index) {
    this.index = index;
    this.env = new GainNode(ctx, { gain: 1 });
    this.filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 20000, Q: -3 });
    this.gain = new GainNode(ctx, { gain: 0 });
    this.pan = new StereoPannerNode(ctx, { pan: 0 });
    this.send = new GainNode(ctx, { gain: 0 });
    this.env.connect(this.filter).connect(this.gain).connect(this.pan).connect(dry);
    this.gain.connect(this.send).connect(wet);
    this.src = null;
    this.tail = null;
    this.start = 0;
    this.end = 0;
    this.loud = 0;
    this.decay = 0.2;
    this.cat = '';
    this.name = '';
    this.def = null;
    this.base = 0;
    this.spatial = false;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.far = false;
    this.cur = { g: 0, pan: 0, cut: 20000, send: 0 };
  }

  // Loudness rank used for stealing: fades with the sound's own decay.
  score(now) {
    if (now <= this.start) return this.loud;
    return this.loud * Math.exp(-(now - this.start) / this.decay);
  }

  stop(t) {
    for (const node of [this.src, this.tail]) {
      if (!node) continue;
      try {
        node.stop(t);
      } catch {
        // never started or already stopped
      }
    }
  }

  release() {
    for (const node of [this.src, this.tail]) {
      if (!node) continue;
      try {
        node.disconnect();
      } catch {
        // already disconnected
      }
    }
    this.src = null;
    this.tail = null;
  }
}

export class VoicePool {
  constructor(ctx, mixer, bank, maxVoices) {
    this.ctx = ctx;
    this.bank = bank;
    this.strips = [];
    for (let i = 0; i < maxVoices; i++) this.strips.push(new Strip(ctx, mixer.sfx, mixer.reverbIn, i));
    this.pending = [];
    this.due = [];
    this.rng = new Rng(0xbeef);
    this.loc = { d: 0, pan: 0, front: 1, cutoff: 20000, ux: 0, uy: 0, uz: 0 };
    this.updateCursor = 0;
    this.stats = { events: 0, played: 0, stolen: 0, dropped: 0, toBed: 0, maxActive: 0, maxPending: 0 };
  }

  enqueue(ev) {
    this.stats.events++;
    if (this.pending.length >= MAX_PENDING) {
      this.stats.dropped++;
      return;
    }
    this.pending.push(ev);
    if (this.pending.length > this.stats.maxPending) this.stats.maxPending = this.pending.length;
  }

  clear() {
    this.pending.length = 0;
  }

  activeCount(now = this.ctx.currentTime) {
    let n = 0;
    for (const s of this.strips) if (s.end > now) n++;
    return n;
  }

  // Starts every event whose sound arrives within the lookahead window.
  update(sim, listener, bed) {
    const now = this.ctx.currentTime;
    this.reclaim(now);
    const scale = Math.max(sim.timeScale, 1e-3);
    const horizon = sim.time + LOOKAHEAD * sim.timeScale;
    const due = this.due;
    due.length = 0;
    let w = 0;
    for (const ev of this.pending) {
      if (ev.due <= horizon) due.push(ev);
      else this.pending[w++] = ev;
    }
    this.pending.length = w;
    if (due.length) {
      due.sort((a, b) => b.loud - a.loud);
      let spawned = 0;
      for (const ev of due) {
        const when = now + Math.max(0, (ev.due - sim.time) / scale);
        if (spawned < MAX_SPAWN_PER_UPDATE && this.start(ev, when, listener, sim, now)) {
          spawned++;
        } else if (ev.def.bed && ev.spatial) {
          this.stats.toBed++;
          bed.play(ev, when);
        } else {
          this.stats.dropped++;
        }
      }
      due.length = 0;
    }
    this.refresh(listener, now);
    const active = this.activeCount(now);
    if (active > this.stats.maxActive) this.stats.maxActive = active;
  }

  reclaim(now) {
    for (const s of this.strips) {
      if (s.src && s.end + 0.1 < now) s.release();
    }
  }

  // Free strip, else the quietest (by decayed loudness) if the newcomer is clearly louder.
  allocate(cat, loud, now) {
    let free = null;
    let victim = null;
    let victimScore = Infinity;
    let catVictim = null;
    let catScore = Infinity;
    let catActive = 0;
    for (const s of this.strips) {
      if (s.end <= now) {
        if (!free) free = s;
        continue;
      }
      const sc = s.score(now);
      if (s.cat === cat) {
        catActive++;
        if (sc < catScore) {
          catScore = sc;
          catVictim = s;
        }
      }
      if (sc < victimScore) {
        victimScore = sc;
        victim = s;
      }
    }
    if (catActive >= (CATEGORY_CAPS[cat] ?? 8)) {
      return loud > catScore * STEAL_MARGIN ? this.steal(catVictim, now) : null;
    }
    if (free) return free;
    return loud > victimScore * STEAL_MARGIN ? this.steal(victim, now) : null;
  }

  // Fades the victim out quickly; its nodes are dropped (not disconnected) so the
  // fade completes, after which they stop and are garbage collected.
  steal(s, now) {
    s.env.gain.cancelScheduledValues(now);
    s.env.gain.setTargetAtTime(0, now, STEAL_FADE / 4);
    s.stop(now + STEAL_FADE);
    s.src = null;
    s.tail = null;
    s.end = now + STEAL_FADE;
    s.stolen = true;
    this.stats.stolen++;
    return s;
  }

  start(ev, when, L, sim, now) {
    const def = ev.def;
    const loc = this.loc;
    let gain = 1;
    let dry = 1;
    let wet = def.wet ?? 0.5;
    let cutoff = 20000;
    let pan = 0;
    if (ev.spatial) {
      locate(L, ev.x, ev.y, ev.z, loc);
      gain = ev.flyby ? ev.distGain : distanceGain(def, loc.d);
      dry = dryAmount(loc.d);
      wet *= wetAmount(loc.d);
      cutoff = loc.cutoff;
      pan = loc.pan * panSpread(def.size, loc.d);
    } else {
      wet *= 0.1;
    }
    const loud = def.levelLin * gain * ev.vol;
    if (loud < MIN_AUDIBLE) return false;
    const useFar = ev.spatial && def.farDist && loc.d > def.farDist;
    const entry = this.bank.pick(ev.key, useFar ? 'far' : 'near');
    if (!entry) return false;
    const strip = this.allocate(def.cat, loud, now);
    if (!strip) return false;
    let t = Math.max(when, strip.stolen ? strip.end + 0.002 : when);
    strip.stolen = false;
    strip.release();
    const [pj, gj] = def.jitter ?? [0, 0];
    const slow = def.cat === 'ui' ? 1 : sim.pitch;
    const rate = clamp(ev.pitch * (1 + pj * this.rng.bi()) * slow, 0.25, 4);
    const base = def.levelLin * ev.vol * dbToGain(gj * this.rng.bi());
    // A pre-filtered far layer already lost its treble; open the voice filter a little.
    if (useFar) cutoff = Math.min(20000, cutoff * 1.6);
    const ctx = this.ctx;
    const src = new AudioBufferSourceNode(ctx, { buffer: entry.buffer, playbackRate: rate });
    src.connect(strip.env);
    const env = strip.env.gain;
    env.cancelScheduledValues(t);
    env.setValueAtTime(1, t);
    strip.gain.gain.cancelScheduledValues(t);
    strip.gain.gain.setValueAtTime(base * gain * dry, t);
    strip.send.gain.cancelScheduledValues(t);
    strip.send.gain.setValueAtTime(wet / Math.max(dry, 0.05), t);
    strip.filter.frequency.cancelScheduledValues(t);
    strip.filter.frequency.setValueAtTime(cutoff, t);
    strip.pan.pan.cancelScheduledValues(t);
    strip.pan.pan.setValueAtTime(pan, t);
    let offset = 0;
    let length = entry.duration;
    const lead = ev.dur > 0 ? ev.dur : def.lead ?? 0;
    if (def.alignEnd && lead > 0) {
      // Whistles/dives are timed to end on impact: trim the start or wait.
      offset = Math.max(0, entry.duration - lead * rate);
      t += Math.max(0, lead - entry.duration / rate);
      length = entry.duration - offset;
    }
    if (def.burst) {
      length = this.startBurst(strip, src, entry, ev, t, rate);
    } else {
      src.start(t, offset);
    }
    strip.src = src;
    strip.start = t;
    strip.end = t + length / rate;
    strip.loud = loud;
    strip.decay = def.burst ? Math.max(def.decay, ev.dur || 1) : def.decay;
    strip.cat = def.cat;
    strip.name = ev.key;
    strip.def = def;
    strip.base = base;
    strip.spatial = ev.spatial && !ev.flyby;
    strip.x = ev.x;
    strip.y = ev.y;
    strip.z = ev.z;
    strip.far = useFar;
    strip.cur.g = base * gain * dry;
    strip.cur.pan = pan;
    strip.cur.cut = cutoff;
    strip.cur.send = wet / Math.max(dry, 0.05);
    this.stats.played++;
    if (def.duck > 0 && ev.spatial && loc.d < def.duck && this.onDuck) {
      this.onDuck(1 - loc.d / def.duck, t);
    }
    return true;
  }

  // Rotary-cannon burst: loop the sustain for the requested duration, then hand
  // over to the matching spin-down tail (wired past the envelope so it can fade in).
  startBurst(strip, src, entry, ev, t, rate) {
    const dur = clamp(ev.dur || 1, 0.15, 6);
    src.loop = true;
    src.loopStart = entry.loopStart;
    src.loopEnd = entry.loopEnd;
    src.start(t);
    const stopAt = t + dur;
    strip.env.gain.setValueAtTime(1, stopAt);
    strip.env.gain.setTargetAtTime(0, stopAt, 0.02);
    src.stop(stopAt + 0.2);
    const index = this.bank.get(ev.key).near.indexOf(entry);
    const tailEntry = this.bank.variant('jet_gun_tail', Math.max(0, index));
    if (tailEntry) {
      const tail = new AudioBufferSourceNode(this.ctx, { buffer: tailEntry.buffer, playbackRate: rate });
      tail.connect(strip.filter);
      tail.start(stopAt - 0.01);
      strip.tail = tail;
      return dur * rate + tailEntry.duration;
    }
    return (dur + 0.2) * rate;
  }

  // Keeps long voices placed correctly while the camera moves (a few strips per frame).
  refresh(L, now) {
    const loc = this.loc;
    const n = this.strips.length;
    for (let k = 0; k < 12; k++) {
      const s = this.strips[this.updateCursor];
      this.updateCursor = (this.updateCursor + 1) % n;
      if (!s.spatial || s.start > now || s.end - now < 0.15) continue;
      locate(L, s.x, s.y, s.z, loc);
      const dry = dryAmount(loc.d);
      const g = s.base * distanceGain(s.def, loc.d) * dry;
      const send = ((s.def.wet ?? 0.5) * wetAmount(loc.d)) / Math.max(dry, 0.05);
      const cut = s.far ? Math.min(20000, loc.cutoff * 1.6) : loc.cutoff;
      const pan = loc.pan * panSpread(s.def.size, loc.d);
      const c = s.cur;
      if (Math.abs(g - c.g) > 0.06 * Math.max(c.g, 1e-4)) {
        s.gain.gain.setTargetAtTime(g, now, 0.05);
        c.g = g;
      }
      if (Math.abs(pan - c.pan) > 0.03) {
        s.pan.pan.setTargetAtTime(pan, now, 0.05);
        c.pan = pan;
      }
      if (Math.abs(cut - c.cut) > 0.08 * c.cut) {
        s.filter.frequency.setTargetAtTime(cut, now, 0.05);
        c.cut = cut;
      }
      if (Math.abs(send - c.send) > 0.08 * Math.max(c.send, 1e-3)) {
        s.send.gain.setTargetAtTime(send, now, 0.1);
        c.send = send;
      }
    }
  }

  stopAll() {
    const now = this.ctx.currentTime;
    for (const s of this.strips) {
      s.env.gain.cancelScheduledValues(now);
      s.env.gain.setTargetAtTime(0, now, 0.01);
      s.stop(now + 0.05);
      s.end = Math.min(s.end, now + 0.05);
    }
    this.pending.length = 0;
  }

  dispose() {
    this.stopAll();
    for (const s of this.strips) {
      s.release();
      for (const node of [s.env, s.filter, s.gain, s.pan, s.send]) node.disconnect();
    }
  }
}
