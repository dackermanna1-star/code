// Dead County audio — continuous ambience: wind with gusts, rain (outdoor / on-roof), storm, night
// crickets, underwater, tension drone, tinnitus, heartbeat and breathing, plus sparse random events
// (birds by day, owls / wolves / crickets at night, distant dogs, screams and gunshots).

import { clamp, lerp } from './dsp.js';

export const AMB_KEYS = ['rain', 'wind', 'storm', 'night', 'indoor', 'underwater', 'heartbeat', 'tinnitus', 'breathing', 'tension', 'events'];

const rand = (a, b) => a + (b - a) * Math.random();

export class AmbienceSystem {
  constructor(engine) {
    this.e = engine;
    const ctx = (this.ctx = engine.ctx);
    this.target = { rain: 0, wind: 0.2, storm: 0, night: 0, indoor: 0, underwater: 0, heartbeat: 0, tinnitus: 0, breathing: 0, tension: 0, events: 1 };
    this.cur = { ...this.target };
    this.beds = new Map(); // key -> {name, variant, dest, pan, offset, src}
    this.gust = 0.5;
    this.gustTarget = 0.5;
    this.gustTimer = 0;

    const g = (v, dest) => {
      const n = ctx.createGain();
      n.gain.value = v;
      if (dest) n.connect(dest);
      return n;
    };
    const outdoor = engine.outdoorBus;
    const amb = engine.ambBus;
    // wind
    this.windLP = ctx.createBiquadFilter();
    this.windLP.type = 'lowpass';
    this.windLP.frequency.value = 800;
    this.windLP.Q.value = 0.5;
    this.windLP.connect(outdoor);
    this.windG = g(0, this.windLP);
    // rain
    this.rainG = g(0, outdoor);
    this.heavyG = g(0, outdoor);
    this.roofG = g(0, amb);
    // crickets
    this.cricketG = g(0, outdoor);
    // underwater / tension
    this.uwG = g(0, amb);
    this.tensionG = g(0, amb);
    // tinnitus (live oscillators)
    this.tinG = g(0, engine.innerBus);
    const t1 = ctx.createOscillator();
    t1.frequency.value = 4100;
    const t2 = ctx.createOscillator();
    t2.frequency.value = 8230;
    const t2g = g(0.12, this.tinG);
    const t1g = g(1, this.tinG);
    t1.connect(t1g);
    t2.connect(t2g);
    const wob = ctx.createOscillator();
    wob.frequency.value = 0.3;
    const wobG = g(12);
    wob.connect(wobG);
    wobG.connect(t1.frequency);
    t1.start();
    t2.start();
    wob.start();
    this.tinOsc = [t1, t2, wob];

    this.addBed('wind0', 'amb_wind', 0, this.windG, -0.55);
    this.addBed('wind1', 'amb_wind', 1, this.windG, 0.55);
    // two copies of the same loop, 3 s apart, panned apart = decorrelated stereo bed
    this.addBed('rain0', 'amb_rain', 0, this.rainG, -0.6, 0);
    this.addBed('rain1', 'amb_rain', 0, this.rainG, 0.6, 3.1);
    this.addBed('heavy0', 'amb_rain_heavy', 0, this.heavyG, -0.5, 0);
    this.addBed('heavy1', 'amb_rain_heavy', 0, this.heavyG, 0.5, 2.9);
    this.addBed('roof', 'amb_rain_roof', 0, this.roofG, 0);
    this.addBed('crick0', 'amb_crickets', 0, this.cricketG, -0.6, 0);
    this.addBed('crick1', 'amb_crickets', 0, this.cricketG, 0.6, 4.7);
    this.addBed('uw', 'amb_underwater', 0, this.uwG, 0);
    this.addBed('tension', 'amb_tension', 0, this.tensionG, 0);

    // scheduled body sounds + random events
    this.nextBeat = 0;
    this.nextBreath = 0;
    this.timers = { bird: rand(1, 4), owl: rand(15, 40), wolf: rand(40, 120), cricket: rand(2, 6), dog: rand(40, 120), scream: rand(60, 180), gunshot: rand(90, 260) };
    this.burst = null; // pending distant gunshot burst
  }

  addBed(key, name, variant, dest, pan, offset) {
    this.beds.set(key, { name, variant, dest, pan, offset: offset ?? Math.random() * 5, src: null, active: false });
  }

  set(vals) {
    for (const k of AMB_KEYS) {
      if (vals[k] === undefined || vals[k] === null) continue;
      const v = typeof vals[k] === 'boolean' ? (vals[k] ? 1 : 0) : Number(vals[k]);
      if (Number.isFinite(v)) this.target[k] = clamp(v, 0, k === 'events' ? 4 : 1);
    }
  }

  /** start/stop a looping bed depending on whether it is audible (saves CPU for silent layers) */
  _bed(key, audible) {
    const b = this.beds.get(key);
    if (audible && !b.src) {
      const bufs = this.e.buffers.get(b.name);
      if (!bufs) return;
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = bufs[b.variant] || bufs[0];
      src.loop = true;
      let tail = src;
      if (b.pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = b.pan;
        src.connect(p);
        tail = p;
        b.panNode = p;
      }
      tail.connect(b.dest);
      src.start(ctx.currentTime, b.offset % src.buffer.duration);
      b.src = src;
      b.silentFor = 0;
    } else if (!audible && b.src) {
      b.silentFor = (b.silentFor || 0) + 1;
      if (b.silentFor > 240) {
        // ~4 s of silence at 60 fps: stop the source
        try {
          b.src.stop();
        } catch (e) {
          /* ignore */
        }
        b.src.disconnect();
        b.panNode?.disconnect();
        b.src = null;
        b.panNode = null;
      }
    } else if (audible) b.silentFor = 0;
  }

  _rampTo(param, v, tc = 0.08) {
    param.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  update(dt) {
    const T = this.target, C = this.cur;
    const k = 1 - Math.exp(-dt / 0.45);
    for (const key of AMB_KEYS) C[key] += (T[key] - C[key]) * k;
    const now = this.ctx.currentTime;
    const indoor = C.indoor, uw = C.underwater;

    // gusts: random target every few seconds, smoothed
    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      this.gustTarget = Math.random() < 0.25 ? rand(1.0, 1.6) : rand(0.35, 0.9);
      this.gustTimer = rand(1.5, 5);
    }
    this.gust += (this.gustTarget - this.gust) * (1 - Math.exp(-dt / 1.2));
    const windEff = clamp(C.wind + C.storm * 0.6, 0, 1.3);
    const wg = (0.035 + 0.3 * windEff) * lerp(1, this.gust, clamp(windEff * 1.4, 0, 1)) * (1 - uw);
    this._rampTo(this.windG.gain, wg);
    this._rampTo(this.windLP.frequency, 300 + 2600 * clamp(windEff * this.gust, 0, 1.5), 0.15);
    this._bed('wind0', wg > 0.001);
    this._bed('wind1', wg > 0.001);

    // rain
    const rainOut = C.rain * 0.5 * (1 - uw);
    const heavy = clamp(C.rain * C.storm * 0.9 + Math.max(0, C.rain - 0.6) * 0.6, 0, 1) * 0.5 * (1 - uw);
    const roof = indoor * clamp(C.rain * 0.8 + C.storm * 0.2, 0, 1) * 0.45 * (1 - uw);
    this._rampTo(this.rainG.gain, rainOut);
    this._rampTo(this.heavyG.gain, heavy);
    this._rampTo(this.roofG.gain, roof);
    this._bed('rain0', rainOut > 0.001);
    this._bed('rain1', rainOut > 0.001);
    this._bed('heavy0', heavy > 0.001);
    this._bed('heavy1', heavy > 0.001);
    this._bed('roof', roof > 0.001);

    // crickets
    const crick = clamp(C.night * 1.4 - 0.4, 0, 1) * (1 - C.rain * 0.85) * (1 - C.storm) * (1 - C.wind * 0.5) * 0.25 * (1 - uw);
    this._rampTo(this.cricketG.gain, crick, 0.3);
    this._bed('crick0', crick > 0.001);
    this._bed('crick1', crick > 0.001);

    // underwater / tension
    this._rampTo(this.uwG.gain, uw * 0.45);
    this._bed('uw', uw > 0.001);
    const ten = C.tension * 0.15;
    this._rampTo(this.tensionG.gain, ten, 0.3);
    this._bed('tension', ten > 0.001);

    // tinnitus
    this._rampTo(this.tinG.gain, Math.pow(C.tinnitus, 1.5) * 0.03, 0.05);

    // heartbeat
    if (C.heartbeat > 0.04) {
      if (now >= this.nextBeat - 0.05) {
        const t = Math.max(now, this.nextBeat);
        const bpm = 55 + 85 * C.heartbeat;
        this.e._playInternal('heartbeat', { volume: 0.2 + 0.6 * C.heartbeat, at: t, pitch: 1 + C.heartbeat * 0.08 });
        this.nextBeat = t + 60 / bpm;
      }
    } else this.nextBeat = now + 0.3;

    // breathing
    if (C.breathing > 0.05) {
      if (now >= this.nextBreath) {
        const interval = lerp(3.6, 1.15, C.breathing);
        const rate = clamp(1.35 / interval, 0.9, 1.3);
        this.e._playInternal('breath_heavy', { volume: C.breathing * 0.9, pitch: rate });
        this.nextBreath = now + interval * rand(0.92, 1.08);
      }
    } else this.nextBreath = now + 0.5;

    this._events(dt, C);
  }

  _events(dt, C) {
    const m = C.events * (1 - C.underwater);
    if (m <= 0.01) return;
    const tm = this.timers;
    const day = 1 - C.night;
    const outdoorQuiet = (1 - C.rain * 0.8) * (1 - C.storm);
    const dec = (k) => {
      tm[k] -= dt * m;
      return tm[k] <= 0;
    };
    // birds by day
    if (day > 0.35 && outdoorQuiet > 0.3) {
      if (dec('bird')) {
        this._far('birds', 12, 70, 3, 14, 0.4 + 0.6 * Math.random() * day * outdoorQuiet);
        tm.bird = rand(2.5, 9) / (0.4 + day);
      }
    }
    if (C.night > 0.6) {
      if (dec('owl')) {
        this._far('owl', 40, 120, 5, 15, rand(0.5, 1));
        tm.owl = rand(30, 90);
      }
      if (dec('wolf')) {
        this._far('wolf_howl', 250, 700, 0, 10, rand(0.5, 1));
        tm.wolf = rand(70, 220);
      }
      if (C.rain < 0.3 && dec('cricket')) {
        this._far('crickets', 4, 16, -0.5, 0.5, rand(0.4, 1));
        tm.cricket = rand(3, 10);
      }
    }
    if (dec('dog')) {
      this._far('dog_bark', 120, 400, 0, 5, rand(0.5, 1));
      tm.dog = rand(60, 200);
    }
    if (dec('scream')) {
      this._far('distant_scream', 120, 450, 0, 8, rand(0.5, 1));
      tm.scream = rand(100, 280) * (1.4 - C.tension * 0.6) * (1.2 - C.night * 0.4);
    }
    if (dec('gunshot')) {
      const n = Math.random() < 0.4 ? 1 : 1 + Math.floor(Math.random() * 4);
      const ang = Math.random() * Math.PI * 2;
      const dist = rand(250, 900);
      this.burst = { n, ang, dist, next: 0 };
      tm.gunshot = rand(150, 420);
    }
    if (this.burst) {
      this.burst.next -= dt;
      if (this.burst.next <= 0) {
        this._far('distant_gunshot', this.burst.dist, this.burst.dist, 0, 3, rand(0.7, 1), this.burst.ang + rand(-0.05, 0.05));
        this.burst.n--;
        this.burst.next = rand(0.25, 1.8);
        if (this.burst.n <= 0) this.burst = null;
      }
    }
  }

  /** play an ambient one-shot at a random position around the listener */
  _far(name, dmin, dmax, ymin, ymax, vol, ang) {
    const L = this.e.listener;
    const a = ang ?? Math.random() * Math.PI * 2;
    const d = rand(dmin, dmax);
    this.e._playInternal(name, { pos: { x: L.x + Math.cos(a) * d, y: L.y + rand(ymin, ymax), z: L.z + Math.sin(a) * d }, volume: vol, outdoor: true, noDelay: d > 150 });
  }

  dispose() {
    for (const o of this.tinOsc) o.stop();
    for (const b of this.beds.values()) b.src?.stop();
  }
}
