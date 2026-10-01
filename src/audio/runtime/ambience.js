// Autonomous ambience: distant city bed, wind (follows windAt), and Poisson-scheduled distant events
// (cars several streets away, sirens, elevated train, street voices, a rare dog), plus garbage settling
// at registered dumpsters, gust-driven rustles and faint ambient drips. Distant events go mostly through
// the dark "city" convolution reverb.
import { glide, jump, makePanner, setPannerPos, dbToGain, rand, randExp, loopSource, autoCleanup, finite } from './spatial.js';

function monoIn(ctx) {
  const g = ctx.createGain();
  g.channelCount = 1;
  g.channelCountMode = 'explicit';
  g.channelInterpretation = 'speakers';
  return g;
}

export class Ambience {
  constructor(engine, o = {}) {
    const ctx = engine.ctx;
    const b = engine.buffers;
    this.engine = engine;
    this.ctx = ctx;
    this.bus = engine.busAmbience;
    this.bedOn = o.bed !== false;
    this.eventsOn = o.events !== false;
    const now = ctx.currentTime;

    // dark city reverb for distant events
    this.cityIn = monoIn(ctx);
    this.cityConv = ctx.createConvolver();
    this.cityConv.normalize = false;
    if (b.cityIR) this.cityConv.buffer = b.cityIR;
    this.cityRet = ctx.createGain();
    this.cityRet.gain.value = 1;
    this.cityIn.connect(this.cityConv);
    this.cityConv.connect(this.cityRet);
    this.cityRet.connect(this.bus);

    this.bed = ctx.createGain();
    this.bed.gain.value = this.bedOn ? 1 : 0;
    this.bed.connect(this.bus);

    // --- city rumble
    this.rumble = loopSource(ctx, b.cityRumble, rand(0.98, 1.02), now);
    this.rumbleLP = ctx.createBiquadFilter();
    this.rumbleLP.type = 'lowpass';
    this.rumbleLP.frequency.value = 320;
    this.rumbleLP.Q.value = 0.5;
    this.rumbleG = ctx.createGain();
    this.rumbleG.gain.value = 0;
    this.rumble.connect(this.rumbleLP);
    this.rumbleLP.connect(this.rumbleG);
    this.rumbleG.connect(this.bed);
    // --- far wet-road hiss
    this.hiss = loopSource(ctx, b.cityHiss, rand(0.98, 1.02), now);
    this.hissF = ctx.createBiquadFilter();
    this.hissF.type = 'lowpass';
    this.hissF.frequency.value = 5000;
    this.hissG = ctx.createGain();
    this.hissG.gain.value = 0;
    this.hiss.connect(this.hissF);
    this.hissF.connect(this.hissG);
    this.hissG.connect(this.bed);
    // --- faint low city hum (distant plant / HVAC drone)
    this.hum = ctx.createOscillator();
    this.hum.setPeriodicWave(engine.waves.cityHum);
    this.hum.frequency.value = 57.3;
    this.humLP = ctx.createBiquadFilter();
    this.humLP.type = 'lowpass';
    this.humLP.frequency.value = 260;
    this.humG = ctx.createGain();
    this.humG.gain.value = 0;
    this.hum.connect(this.humLP);
    this.humLP.connect(this.humG);
    this.humG.connect(this.bed);
    this.hum.start(now);
    // --- wind
    this.wind = loopSource(ctx, b.wind, 1, now);
    this.windLP = ctx.createBiquadFilter();
    this.windLP.type = 'lowpass';
    this.windLP.Q.value = 0.6;
    this.windLP.frequency.value = 400;
    this.windHP = ctx.createBiquadFilter();
    this.windHP.type = 'highpass';
    this.windHP.frequency.value = 40;
    this.windG = ctx.createGain();
    this.windG.gain.value = 0;
    this.wind.connect(this.windHP);
    this.windHP.connect(this.windLP);
    this.windLP.connect(this.windG);
    this.windG.connect(this.bed);
    // resonant whistles (gaps, wires, fire escapes)
    this.whistles = [];
    for (let k = 0; k < 2; k++) {
      const src = loopSource(ctx, b.wind, rand(0.9, 1.1), now);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = rand(28, 45);
      const f0 = k === 0 ? rand(560, 760) : rand(1050, 1400);
      bp.frequency.value = f0;
      const g = ctx.createGain();
      g.gain.value = 0;
      const pan = ctx.createStereoPanner();
      pan.pan.value = rand(-0.7, 0.7);
      src.connect(bp);
      bp.connect(g);
      g.connect(pan);
      pan.connect(this.bed);
      this.whistles.push({ src, bp, g, pan, f0, on: false, next: now + rand(2, 8), amt: 0 });
    }

    this.nextBedMod = now;
    this.nextWind = 0;
    const T = (a, c) => now + rand(a, c);
    this.timers = {
      car: T(5, 18), siren: T(70, 150), train: T(40, 110), voices: T(12, 40), dog: T(180, 420),
      garbage: T(25, 70), drip: T(0.5, 2), gust: T(3, 6),
    };
    this.dripRate = o.dripRate ?? 0.35;
    this.prevWind = 0;
    this.live = new Set();
  }

  setCityIR(buf) {
    try { if (!this.cityConv.buffer) this.cityConv.buffer = buf; } catch (e) { /* ignore */ }
  }

  setBedEnabled(on) {
    this.bedOn = on;
    glide(this.bed.gain, on ? 1 : 0, this.ctx.currentTime, 0.3);
  }

  modulateBed(now) {
    glide(this.rumbleG.gain, 0.15 * rand(0.75, 1.15), now, rand(2, 5));
    glide(this.rumbleLP.frequency, rand(220, 420), now, rand(2, 5));
    glide(this.hissG.gain, 0.06 * rand(0.6, 1.2), now, rand(2, 5));
    glide(this.hissF.frequency, rand(3500, 6500), now, rand(2, 5));
    glide(this.humG.gain, 0.006 * rand(0.5, 1.2), now, rand(3, 7));
  }

  updateWind(now, w) {
    const g = 0.04 + 0.96 * Math.pow(w, 1.7);
    glide(this.windG.gain, 0.32 * g, now, 0.12);
    glide(this.windLP.frequency, 220 + 2300 * Math.pow(w, 1.4), now, 0.12);
    for (const h of this.whistles) {
      if (now >= h.next) {
        h.on = Math.random() < 0.5;
        h.next = now + rand(4, 14);
      }
      const ss = Math.min(1, Math.max(0, (w - 0.5) / 0.35));
      const target = h.on ? 0.06 * ss * ss * (3 - 2 * ss) : 0;
      glide(h.g.gain, target, now, 0.4);
      glide(h.bp.frequency, h.f0 * (0.85 + 0.3 * w), now, 0.5);
    }
  }

  /** Route a buffer as a distant event: panned sweep, dry + city reverb. */
  playDistant(buffer, o) {
    const ctx = this.ctx;
    const now = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = o.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = dbToGain(o.db ?? -30);
    const dur = (o.dur ?? buffer.duration / (o.rate ?? 1));
    if (o.dur) {
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(dbToGain(o.db ?? -30), now + 0.3);
      g.gain.setValueAtTime(dbToGain(o.db ?? -30), now + dur - 0.5);
      g.gain.linearRampToValueAtTime(0, now + dur);
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = o.lp ?? 3000;
    lp.Q.value = 0.5;
    const nodes = [g, lp];
    src.connect(g);
    g.connect(lp);
    let out = lp;
    if (o.position) {
      const p = makePanner(ctx, 'equalpower', o.ref ?? 20, 1);
      setPannerPos(p, o.position, now, 0);
      out.connect(p);
      out = p;
      nodes.push(p);
    } else {
      const pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(o.panFrom ?? 0, now);
      pan.pan.linearRampToValueAtTime(o.panTo ?? 0, now + dur);
      out.connect(pan);
      out = pan;
      nodes.push(pan);
    }
    const dry = ctx.createGain();
    dry.gain.value = o.dry ?? 0.4;
    const wet = ctx.createGain();
    wet.gain.value = o.wet ?? 0.8;
    out.connect(dry);
    dry.connect(this.bus);
    out.connect(wet);
    wet.connect(this.cityIn);
    nodes.push(dry, wet);
    if (o.alley) {
      const a = ctx.createGain();
      a.gain.value = o.alley;
      g.connect(a);
      a.connect(this.engine.emitterSendIn);
      nodes.push(a);
    }
    if (o.dur) src.start(now, o.offset ?? 0, dur * (o.rate ?? 1) + 0.05);
    else src.start(now, o.offset ?? 0);
    const rec = { src, type: o.type };
    this.live.add(rec);
    autoCleanup(src, nodes, () => this.live.delete(rec));
    return rec;
  }

  trigger(type, opt = {}) {
    const b = this.engine.buffers;
    const lis = this.engine._lis.pos;
    const side = Math.random() < 0.5 ? -1 : 1;
    const need = { distantCar: 'distantCars', siren: 'sirens', train: 'trains', streetVoices: 'streetBabble', dog: 'barks' }[type];
    if (need && !b[need]) return false; // still synthesizing in the background
    switch (type) {
      case 'distantCar': {
        const buf = b.distantCars[Math.floor(Math.random() * b.distantCars.length)];
        const from = rand(0.3, 0.9) * side;
        return this.playDistant(buf, { type, db: rand(-33, -27), rate: rand(0.9, 1.1), panFrom: from, panTo: -from * rand(0.4, 1), dry: 0.55, wet: 0.65, lp: rand(1800, 3200) });
      }
      case 'siren': {
        const buf = b.sirens[Math.floor(Math.random() * b.sirens.length)];
        const from = rand(0.2, 0.8) * side;
        return this.playDistant(buf, { type, db: rand(-24, -20), rate: rand(0.97, 1.03), panFrom: from, panTo: -from * rand(0.2, 0.8), dry: 0.3, wet: 0.9, lp: 2600 });
      }
      case 'train': {
        const buf = b.trains[Math.floor(Math.random() * b.trains.length)];
        const from = rand(0.4, 0.8) * side;
        return this.playDistant(buf, { type, db: rand(-20, -17), rate: rand(0.96, 1.04), panFrom: from, panTo: -from, dry: 0.5, wet: 0.75, lp: 3000 });
      }
      case 'streetVoices': {
        const buf = b.streetBabble;
        const dur = rand(2.5, 7);
        const A = this.engine.alley;
        const pos = opt.position || { x: rand(-14, 14), y: 1.6, z: A.zFront - rand(6, 12) };
        return this.playDistant(buf, {
          type, db: rand(-12, -8), position: pos, ref: 12, dur, offset: Math.random() * (buf.duration - dur - 0.2),
          dry: 0.6, wet: 0.55, lp: 2600, alley: 0.06,
        });
      }
      case 'dog': {
        const n = 1 + Math.floor(Math.random() * 3);
        const from = rand(-0.8, 0.8);
        const db = rand(-32, -27);
        let t = 0;
        for (let k = 0; k < n; k++) {
          const buf = b.barks[Math.floor(Math.random() * b.barks.length)];
          this.playDistant(buf, { type, db: db + rand(-2, 1), rate: rand(0.95, 1.05), panFrom: from, panTo: from, dry: 0.25, wet: 0.95, lp: 1800, delay: t });
          t += rand(0.45, 0.9);
        }
        return true;
      }
      case 'garbage': {
        const d = this.engine._nearestDumpster(35);
        if (d) this.engine.oneShot('garbageShift', { position: d });
        return !!d;
      }
      case 'ambientDrip': {
        const r = Math.random();
        const surface = r < 0.5 ? 'ground' : r < 0.82 ? 'water' : r < 0.95 ? 'metal' : 'plastic';
        const A = this.engine.alley;
        const pos = { x: (Math.random() < 0.5 ? -1 : 1) * rand(A.halfWidth - 0.6, A.halfWidth - 0.1), y: 0, z: lis.z + rand(-16, 16) };
        this.engine.oneShot('drip', { position: pos, surface, ambient: true });
        return true;
      }
      default:
        return false;
    }
  }

  update(now, dt, s, w) {
    if (now >= this.nextBedMod) {
      this.nextBedMod = now + rand(3, 7);
      this.modulateBed(now);
    }
    if (now >= this.nextWind) {
      this.nextWind = now + 0.05;
      this.updateWind(now, w);
    }
    if (!this.eventsOn) return;
    const T = this.timers;
    if (now >= T.car) { T.car = now + 6 + randExp(22); this.trigger('distantCar'); }
    if (now >= T.siren) { T.siren = now + rand(120, 300); this.trigger('siren'); }
    if (now >= T.train) { T.train = now + rand(150, 330); this.trigger('train'); }
    if (now >= T.voices) { T.voices = now + 25 + randExp(55); this.trigger('streetVoices'); }
    if (now >= T.dog) { T.dog = now + rand(240, 600); if (Math.random() < 0.5) this.trigger('dog'); }
    if (now >= T.garbage) { T.garbage = now + 30 + randExp(60); this.trigger('garbage'); }
    if (now >= T.drip) { T.drip = now + randExp(1 / Math.max(0.02, this.dripRate)); this.trigger('ambientDrip'); }
    // gust-driven rustles near dumpsters (bags, paper)
    if (now >= T.gust) {
      T.gust = now + 0.5;
      if (w > 0.62 && w > this.prevWind + 0.01 && Math.random() < 0.18) {
        const d = this.engine._nearestDumpster(25);
        if (d) {
          const pos = { x: d.x + rand(-0.8, 0.8), y: d.y + 0.3, z: d.z + rand(-0.8, 0.8) };
          this.engine.oneShot(Math.random() < 0.65 ? 'plasticRustle' : 'paperRustle', { position: pos, strength: w });
        }
      }
      this.prevWind = w;
    }
  }
}

export { finite, jump };
