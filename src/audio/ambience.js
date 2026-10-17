// Ambience beds: long, non-repeating room sounds. Each bed = continuous layers (room tone,
// rain on a surface, wind, hum, fire…) plus randomly scheduled events (drips, creaks, settling
// ticks, distant thunder, pipe knocks…) placed around the listener with distance colouring.
// Layers are grouped in named strata so the long hall can strip them one by one
// (HW.audio.stripAmbience(n): wind → creaks → drips → rain → events).
import { Voice } from './voice.js';
import { dbToGain } from './dsp.js';
import { noiseLayer, rainLayer, windLayer, humLayer, ballastLayer, fireLayer, engineLayer, toneLayer } from './layers.js';
import { crowd } from './voices.js';

export const STRIP_ORDER = ['wind', 'creaks', 'drips', 'rain', 'events'];
/** Scattered events sit this far under their own peak (keeps drips ≈ 15 dB over the bed). */
const EVENT_TRIM = -12;

/** Output calibration per bed (dB), measured with tools/audio-qa.mjs: beds land near -24 dBFS
 *  RMS — quiet rooms (library, auditorium, vault) a little under, rain/fire spaces over. */
export const BED_GAIN = {
  silence: 10.5, exterior_rain: 10, car_interior: 4.4, hall: 21.7, classroom: 21.3, office: 21,
  restroom: 21.3, library: 23.1, cafeteria: 22.1, kitchen: 23.9, gym: 13, basement: 22.9,
  boiler_room: 15, stairwell: 22.6, auditorium: 22.1, assembly: 17.8, vault: 24.5, breaker: 16,
  dawn: 24.5, period_buzz: 4.4,
};

/** Reverb space each bed implies (applied on ambience change unless setSpace overrides). */
export const BED_SPACE = {
  exterior_rain: 'outside', car_interior: 'car', hall: 'corridor', classroom: 'room', office: 'room',
  restroom: 'tile', library: 'library', cafeteria: 'hall', kitchen: 'tile', gym: 'hall', basement: 'basement',
  boiler_room: 'basement', stairwell: 'stairwell', auditorium: 'hall', assembly: 'hall', vault: 'vault',
  breaker: 'cavern', dawn: 'outside',
};

export class Bed {
  constructor(eng, id, def, { fade = 2, dest, send, layer = false }) {
    this.eng = eng; this.id = id; this.send = send; this.layer = layer;
    const t0 = eng.now + 0.02;
    this.core = new Voice(eng, { id: `bed:${id}`, dest, send: null, t0, vol: dbToGain(BED_GAIN[id] ?? 18) });
    this.core.end = Infinity;
    const g = this.core.out.gain;
    g.setValueAtTime(0, t0); g.linearRampToValueAtTime(1, t0 + Math.max(0.02, fade));
    this.strata = new Map(); this.events = []; this.tasks = []; this.stripN = 0;
    this.end = Infinity; this.stopped = false;
    def(this, eng);
  }

  stratum(name = 'tone') {
    let g = this.strata.get(name);
    if (!g) {
      const k = STRIP_ORDER.indexOf(name);
      g = this.core.gain(k >= 0 && k < this.stripN ? 0 : 1);
      g.connect(this.core.out);
      this.strata.set(name, g);
    }
    return g;
  }

  // ---- continuous layers ---------------------------------------------------------------------
  tone(o = {}) { return toneLayer(this.core, this.eng, { ...o, dest: this.stratum(o.stratum || 'tone') }); }
  noise(o) { return noiseLayer(this.core, this.eng, { ...o, dest: this.stratum(o.stratum || 'tone') }).out; }
  rain(o) { return rainLayer(this.core, this.eng, { ...o, dest: this.stratum(o.stratum || 'rain') }); }
  wind(o = {}) { return windLayer(this.core, this.eng, { ...o, dest: this.stratum(o.stratum || 'wind') }); }
  hum(o) { return humLayer(this.core, { ...o, dest: this.stratum(o.stratum || 'tone') }); }
  buzz(o) { return ballastLayer(this.core, this.eng, { ...o, dest: this.stratum(o.stratum || 'tone') }); }
  fire(o) { return fireLayer(this.core, this.eng, { ...o, dest: this.stratum(o.stratum || 'tone') }); }
  engine(o) { return engineLayer(this.core, this.eng, { ...o, dest: this.stratum(o.stratum || 'tone') }); }
  crowd(o) {
    const g = this.core.gain(dbToGain(o.level ?? -20)); g.connect(this.stratum(o.stratum || 'events'));
    crowd(this.core, this.eng, { n: o.n || 10, dur: null, level: 1, kids: o.kids ?? 0.5, lp: o.lp || 2200, dest: g });
    return g;
  }

  // ---- events --------------------------------------------------------------------------------
  /** Call fn(t) at random intervals in [g0, g1] seconds (first after `start` [a, b]). */
  every([g0, g1], fn, { start } = {}) {
    const R = this.eng.R;
    const first = this.core.t0 + (start ? R.range(start[0], start[1]) : R.range(0, g1));
    const task = this.eng.addTask(first, (t) => { if (this.stopped) return null; fn(t); return t + R.range(g0, g1); }, this);
    this.tasks.push(task);
    return task;
  }
  /** Scatter sfx `id` around the listener: vol dB, dist 0..1, pan -1..1, rate ranges. */
  event(id, { gap = [5, 15], vol = [-6, 0], dist = [0.3, 1], pan = [-1, 1], stratum = 'events', rate = [0.97, 1.03], start } = {}) {
    const R = this.eng.R;
    this.stratum(stratum);
    return this.every(gap, (t) => this.play(id, t, { vol: R.range(vol[0], vol[1]), dist: R.range(dist[0], dist[1]), pan: R.range(pan[0], pan[1]), stratum, rate: R.range(rate[0], rate[1]) }), { start });
  }
  play(id, t, { vol = 0, dist = 0.5, pan = 0, stratum = 'events', rate = 1 } = {}) {
    const v = this.eng.play(id, { t, dest: this.stratum(stratum), send: this.send, place: this.eng.placeRel(pan, dist), vol: dbToGain(vol + EVENT_TRIM), rate });
    if (v) this.events.push(v);
    return v;
  }

  // ---- lifecycle -----------------------------------------------------------------------------
  sweep(now) {
    if (this.events.length) this.events = this.events.filter((v) => { if (now > v.end + 0.1) { v.dispose(); return false; } return true; });
  }
  strip(n, fade = 1.5) {
    const t = this.eng.now;
    this.stripN = n;
    STRIP_ORDER.forEach((name, i) => { const g = this.strata.get(name); if (g) g.gain.setTargetAtTime(i < n ? 0 : 1, t, fade / 3); });
  }
  stop(fade = 2) {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.eng.now, g = this.core.out.gain, f = Math.max(0.02, fade);
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
    g.linearRampToValueAtTime(0, t + f);
    for (const task of this.tasks) task.dead = true;
    this.end = t + f + 0.1;
  }
  dispose() {
    for (const v of this.events) v.dispose();
    this.events = [];
    this.core.dispose();
  }
}

// =================================================================================================
// Bed definitions. Levels are dB (layer gain); event vol is dB relative to the sound's own peak.
// Targets: beds ≈ -24 dBFS RMS overall; 'silence' is a near-silent room tone.
// =================================================================================================
const SETTLING = (B, k = 1) => {
  B.event('amb_creak', { gap: [8 / k, 22 / k], vol: [-12, -4], dist: [0.4, 1], stratum: 'creaks' });
  B.event('amb_tick', { gap: [6 / k, 16 / k], vol: [-12, -5], dist: [0.2, 0.9], stratum: 'creaks' });
};

export const BEDS = {
  silence(B) {
    B.tone({ level: -50, lp: 140, mod: null });
  },

  exterior_rain(B) {
    B.rain({ kind: 'asphalt', level: -19 });
    B.rain({ kind: 'metal', level: -30, stratum: 'rain' });
    B.wind({ level: -26, whistle: -14 });
    B.event('amb_thunder_far', { gap: [18, 45], vol: [-6, 0], dist: [0.5, 1], start: [4, 12], stratum: 'wind' });
    B.event('thunder', { gap: [70, 140], vol: [-8, -3], dist: [0.6, 0.9], start: [35, 70], stratum: 'wind' });
    B.event('amb_flag', { gap: [4, 12], vol: [-10, -3], dist: [0.4, 0.8], pan: [0.2, 0.9], stratum: 'creaks' });
    B.event('drip', { gap: [0.6, 2.5], vol: [-10, -4], dist: [0.25, 0.7], stratum: 'drips' });
    B.event('amb_steam', { gap: [12, 30], vol: [-14, -8], dist: [0.5, 0.9], stratum: 'events' });
  },

  car_interior(B) {
    B.rain({ kind: 'car_roof', level: -21 });
    B.engine({ level: -22 });
    B.noise({ color: 'pink', filters: [['bandpass', 1800, 0.6]], level: -44 });
    let side = 1;
    B.every([1.55, 1.75], (t) => { side = -side; B.play('amb_wiper', t, { vol: -5, dist: 0.12, pan: side * 0.3, stratum: 'events' }); }, { start: [0.3, 0.6] });
    B.event('amb_thunder_far', { gap: [25, 60], vol: [-12, -6], dist: [0.8, 1], start: [8, 20], stratum: 'wind' });
  },

  hall(B) {
    B.tone({ level: -32, lp: 220 });
    B.tone({ level: -46, lp: 3000, hp: 700, color: 'pink' });
    B.rain({ kind: 'window', level: -34 });
    B.wind({ level: -36, whistle: -12 });
    B.event('drip', { gap: [2.5, 8], vol: [-12, -4], dist: [0.3, 0.9], stratum: 'drips' });
    SETTLING(B);
    B.event('amb_gust_window', { gap: [12, 30], vol: [-12, -6], dist: [0.5, 0.9], stratum: 'wind' });
    B.event('amb_thunder_far', { gap: [25, 60], vol: [-8, -2], dist: [0.6, 1], start: [8, 25], stratum: 'wind' });
    B.event('pipe_knock', { gap: [30, 70], vol: [-14, -8], dist: [0.7, 1], start: [15, 40], stratum: 'creaks' });
  },

  classroom(B) {
    B.tone({ level: -34, lp: 180 });
    B.rain({ kind: 'window', level: -30 });
    B.wind({ level: -40, whistle: -12 });
    const pan = B.eng.R.range(-0.6, 0.6);
    B.every([1, 1], (t) => B.play('amb_clock', t, { vol: -6, dist: 0.35, pan, stratum: 'creaks' }), { start: [0.2, 1] });
    SETTLING(B, 0.8);
    B.event('drip', { gap: [8, 20], vol: [-16, -10], dist: [0.4, 0.8], stratum: 'drips' });
    B.event('amb_rattle', { gap: [14, 35], vol: [-12, -6], dist: [0.2, 0.6], stratum: 'wind' });
    B.event('amb_thunder_far', { gap: [30, 70], vol: [-8, -2], dist: [0.6, 1], start: [10, 30], stratum: 'wind' });
  },

  office(B) {
    B.tone({ level: -35, lp: 200 });
    B.hum({ f: 60, level: -48, h: [1, 0.7, 0.4, 0.3] });
    B.rain({ kind: 'window', level: -34 });
    const pan = B.eng.R.range(-0.6, 0.6);
    B.every([1, 1], (t) => B.play('amb_clock', t, { vol: -5, dist: 0.3, pan, stratum: 'creaks' }), { start: [0.2, 1] });
    B.event('amb_page', { gap: [20, 50], vol: [-10, -4], dist: [0.3, 0.7], stratum: 'events' });
    SETTLING(B, 0.7);
    B.event('amb_thunder_far', { gap: [30, 70], vol: [-10, -4], dist: [0.7, 1], start: [10, 30], stratum: 'wind' });
  },

  restroom(B) {
    B.tone({ level: -32, lp: 200 });
    B.noise({ color: 'white', filters: [['bandpass', 2600, 2]], level: -40, mod: { period: 7, depth: 0.5, seed: 50 } });
    B.every([1.2, 2.2], (t) => B.play('amb_faucet', t, { vol: -3, dist: 0.25, pan: 0.35, stratum: 'drips' }), { start: [0.3, 1] });
    B.event('drip', { gap: [4, 10], vol: [-12, -6], dist: [0.3, 0.8], stratum: 'drips' });
    B.event('pipe_knock', { gap: [20, 45], vol: [-12, -6], dist: [0.5, 0.9], start: [8, 20], stratum: 'creaks' });
    B.event('amb_tick', { gap: [8, 20], vol: [-12, -6], dist: [0.3, 0.8], stratum: 'creaks' });
  },

  library(B) {
    B.tone({ level: -38, lp: 150 });
    B.wind({ level: -42, whistle: -14 });
    B.rain({ kind: 'window', level: -37 });
    B.hum({ f: 60, level: -54, h: [1, 0.5] });
    B.event('amb_page', { gap: [15, 40], vol: [-10, -4], dist: [0.4, 0.9], stratum: 'events' });
    B.event('amb_creak', { gap: [12, 30], vol: [-12, -6], dist: [0.4, 1], stratum: 'creaks' });
    B.event('amb_tick', { gap: [10, 24], vol: [-14, -8], dist: [0.3, 0.9], stratum: 'creaks' });
    B.event('amb_thunder_far', { gap: [35, 80], vol: [-10, -4], dist: [0.7, 1], start: [12, 35], stratum: 'wind' });
  },

  cafeteria(B) {
    B.tone({ level: -34, lp: 180 });
    B.rain({ kind: 'window', level: -31 });
    B.wind({ level: -38, whistle: -12 });
    B.event('amb_tray', { gap: [40, 90], vol: [-12, -6], dist: [0.5, 1], start: [15, 40], stratum: 'events' });
    B.event('drip', { gap: [5, 12], vol: [-12, -6], dist: [0.5, 1], stratum: 'drips' });
    SETTLING(B, 0.8);
    B.event('amb_rattle', { gap: [15, 35], vol: [-12, -6], dist: [0.4, 0.8], stratum: 'wind' });
    B.event('amb_thunder_far', { gap: [25, 60], vol: [-8, -2], dist: [0.6, 1], start: [8, 25], stratum: 'wind' });
  },

  kitchen(B) {
    B.tone({ level: -35, lp: 200 });
    B.wind({ level: -40, whistle: -4, center: 500 });
    B.event('drip', { gap: [2, 6], vol: [-8, -2], dist: [0.2, 0.6], stratum: 'drips' });
    B.event('pipe_knock', { gap: [15, 40], vol: [-12, -6], dist: [0.4, 0.9], start: [6, 18], stratum: 'creaks' });
    B.event('amb_tick', { gap: [6, 14], vol: [-10, -4], dist: [0.3, 0.8], stratum: 'creaks' });
    B.event('amb_tray', { gap: [50, 110], vol: [-14, -8], dist: [0.4, 0.9], start: [20, 50], stratum: 'events' });
  },

  gym(B) {
    B.tone({ level: -34, lp: 140 });
    B.rain({ kind: 'roof', level: -23 });
    B.wind({ level: -40, whistle: -14 });
    B.event('drip', { gap: [4, 10], vol: [-10, -4], dist: [0.4, 1], stratum: 'drips' });
    B.event('amb_creak', { gap: [10, 25], vol: [-10, -4], dist: [0.6, 1], stratum: 'creaks' });
    B.event('amb_timber', { gap: [25, 60], vol: [-12, -6], dist: [0.7, 1], start: [10, 30], stratum: 'creaks' });
    B.event('amb_thunder_far', { gap: [20, 50], vol: [-6, 0], dist: [0.5, 1], start: [6, 20], stratum: 'wind' });
  },

  basement(B) {
    B.tone({ level: -31, lp: 120 });
    B.fire({ level: -40, lp: 180, stratum: 'tone' });
    B.event('drip', { gap: [1.5, 5], vol: [-10, -2], dist: [0.2, 0.9], stratum: 'drips' });
    B.event('amb_steam', { gap: [8, 20], vol: [-12, -6], dist: [0.4, 0.9], stratum: 'events' });
    B.event('pipe_knock', { gap: [10, 25], vol: [-10, -4], dist: [0.4, 0.9], start: [4, 12], stratum: 'creaks' });
    B.event('amb_tick', { gap: [6, 14], vol: [-12, -6], dist: [0.3, 0.9], stratum: 'creaks' });
    B.event('amb_creak', { gap: [12, 30], vol: [-10, -4], dist: [0.5, 1], stratum: 'creaks' });
    B.event('amb_rat', { gap: [40, 90], vol: [-12, -6], dist: [0.5, 1], start: [20, 50], stratum: 'events' });
  },

  boiler_room(B) {
    B.fire({ level: -27, lp: 260 });
    B.hum({ f: 48, level: -38, h: [1, 0.6, 0.3] });
    B.tone({ level: -36, lp: 120 });
    B.event('amb_fire_pop', { gap: [0.5, 3], vol: [-10, -3], dist: [0.2, 0.5], pan: [-0.4, 0.4], stratum: 'events' });
    B.event('amb_steam', { gap: [5, 12], vol: [-10, -4], dist: [0.3, 0.8], stratum: 'events' });
    B.event('pipe_knock', { gap: [6, 15], vol: [-8, -2], dist: [0.3, 0.8], stratum: 'creaks' });
    B.event('drip', { gap: [3, 8], vol: [-12, -6], dist: [0.3, 0.9], stratum: 'drips' });
  },

  stairwell(B) {
    B.tone({ level: -34, lp: 250 });
    B.wind({ level: -31, whistle: -6, center: 450 });
    B.event('drip', { gap: [4, 12], vol: [-10, -4], dist: [0.3, 1], stratum: 'drips' });
    SETTLING(B, 0.9);
    B.event('amb_rattle', { gap: [8, 20], vol: [-10, -4], dist: [0.3, 0.8], stratum: 'wind' });
    B.event('amb_thunder_far', { gap: [25, 60], vol: [-8, -2], dist: [0.6, 1], start: [8, 25], stratum: 'wind' });
  },

  auditorium(B) {
    B.tone({ level: -35, lp: 110 });
    B.tone({ level: -50, lp: 2500, hp: 600, color: 'pink' });
    B.rain({ kind: 'roof', level: -40 });
    B.event('amb_rope', { gap: [12, 30], vol: [-10, -4], dist: [0.5, 1], stratum: 'creaks' });
    B.event('amb_seat', { gap: [15, 40], vol: [-10, -4], dist: [0.4, 1], stratum: 'creaks' });
    B.event('amb_timber', { gap: [20, 50], vol: [-12, -6], dist: [0.7, 1], start: [10, 30], stratum: 'creaks' });
    B.event('drip', { gap: [8, 20], vol: [-12, -6], dist: [0.6, 1], stratum: 'drips' });
    B.event('amb_thunder_far', { gap: [35, 80], vol: [-10, -4], dist: [0.8, 1], start: [15, 40], stratum: 'wind' });
  },

  assembly(B) {
    BEDS.auditorium(B);
    B.crowd({ level: -27, n: 10, kids: 0.7, lp: 1600, stratum: 'events' });
    B.hum({ f: 60, level: -46, h: [0.3, 1, 0.5, 0.3] });
    B.event('amb_whisper', { gap: [2, 6], vol: [-10, -3], dist: [0.35, 1], stratum: 'events' });
    B.event('husk_rustle', { gap: [5, 14], vol: [-12, -6], dist: [0.3, 0.9], stratum: 'events' });
  },

  vault(B) {
    B.tone({ level: -32, lp: 100 });
    B.noise({ color: 'white', filters: [['highpass', 1500, 0.7], ['lowpass', 5000, 0.7]], level: -50, mod: { period: 9, depth: 0.6, seed: 60 } });
    B.event('drip', { gap: [3, 9], vol: [-8, -2], dist: [0.3, 1], stratum: 'drips' });
    B.event('amb_machine', { gap: [6, 14], vol: [-14, -8], dist: [0.9, 1], start: [3, 8], stratum: 'events' });
    B.event('amb_tick', { gap: [8, 18], vol: [-12, -6], dist: [0.3, 0.9], stratum: 'creaks' });
    B.event('amb_coal_trickle', { gap: [20, 45], vol: [-14, -8], dist: [0.6, 1], start: [8, 20], stratum: 'creaks' });
  },

  breaker(B) {
    B.fire({ level: -24, lp: 180 });
    B.wind({ level: -38, whistle: -16, center: 220 });
    B.every([2.2, 2.9], (t) => B.play('amb_machine', t, { vol: B.eng.R.range(-12, -6), dist: B.eng.R.range(0.75, 1), pan: B.eng.R.range(-0.8, 0.8), stratum: 'events' }), { start: [0.5, 2] });
    B.event('amb_timber', { gap: [4, 10], vol: [-8, -2], dist: [0.3, 1], stratum: 'creaks' });
    B.event('amb_coal_trickle', { gap: [5, 12], vol: [-10, -4], dist: [0.3, 0.9], stratum: 'drips' });
    B.event('amb_fire_pop', { gap: [0.5, 2.5], vol: [-12, -4], dist: [0.4, 1], stratum: 'events' });
    B.event('amb_steam', { gap: [10, 20], vol: [-12, -6], dist: [0.5, 1], stratum: 'events' });
  },

  dawn(B) {
    B.wind({ level: -33, whistle: null });
    B.rain({ kind: 'asphalt', level: -39 });
    B.event('drip', { gap: [0.8, 3.5], vol: [-10, -4], dist: [0.2, 0.8], stratum: 'drips' });
    B.event('amb_bird', { gap: [3, 9], vol: [-10, -2], dist: [0.5, 1], start: [2, 5], stratum: 'events' });
    B.event('amb_crow', { gap: [15, 35], vol: [-10, -4], dist: [0.7, 1], start: [6, 15], stratum: 'events' });
    B.event('amb_flag', { gap: [10, 25], vol: [-12, -6], dist: [0.6, 0.9], stratum: 'creaks' });
  },

  /** Layer: the school "wakes" — banks of fluorescent tubes buzzing (periods). */
  period_buzz(B) {
    B.buzz({ level: -30 });
    B.event('fluor_off', { gap: [10, 30], vol: [-16, -10], dist: [0.5, 1], start: [6, 15], stratum: 'events' });
  },
};
