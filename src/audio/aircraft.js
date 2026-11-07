// =============================================================================
// PROCEDURAL AIRCRAFT SOUND ENGINE - everything the airframe, its systems and
// the airport around it make, driven by app.flight.state every frame.
//
// Built only from the shared NoiseBank (looping noise / slow modulators) and
// oscillators, so it works in any BaseAudioContext (the live AudioContext and
// OfflineAudioContext for numeric verification: see index.js debug.render*).
//
// Physical model in a nutshell (inside-the-cabin perspective):
//  * CFM56-7B: fan blade-passing tone (24 blades, BPF = 24·N1·86.25 Hz) +
//    narrow-band noise around it, 2×BPF, "buzz-saw" multiple-pure-tones at
//    supersonic fan tip speeds (N1 > ~82 %, shaft-order harmonics, mostly
//    on the ground / low speed), N2 core hum & HPC whine, broadband jet-mixing
//    roar (∝ exhaust velocity, reduced by forward speed), low rumble, air
//    turbine starter whine + light-off. Fan noise radiates from the inlet, jet
//    noise from the plume aft of the nozzle -> two sources per engine.
//  * Fuselage transmission loss rises ~6 dB/oct -> every exterior source goes
//    through a "hull" low-pass (opened up in the cinematic exterior view).
//  * Turbulent boundary layer: broadband, ∝ dynamic pressure, dominant at cruise,
//    a little louder near the sidewall; door-seal whistle; rain/cloud hiss.
//  * Packs + ventilation (diffuse hiss), ACM whine under the floor, APU at the tail,
//    EMDP hydraulic pump, gear/flap drive hydraulics, PTU "barking dog".
//  * Ground roll: tyre rumble + joint/centre-light thumps (nose then mains),
//    brake squeal / groan, touchdown, reverse thrust, spoilers.
//  * Airport outside (gate): distant jets, APUs, diesel tugs, reversing beepers,
//    bags thrown in the hold, jet-bridge PCA air - loud at the open L1 door.
// =============================================================================
import { AIRCRAFT, DOORS, ZONES } from '../core/constants.js';
import { clamp, clamp01, smoothstep, rng } from './dsp.js';

const E = AIRCRAFT.engine;
const L1 = { x: -1.72, y: 1.0, z: DOORS.L1.z };

export class AircraftSound {
  /**
   * @param ctx BaseAudioContext
   * @param bank NoiseBank
   * @param buses {engines, ambience, effects}  destination AudioNodes
   * @param shot  (name, {position, volume, rate, bus}) => void   one-shot player
   */
  constructor(ctx, bank, buses, shot) {
    this.ctx = ctx; this.bank = bank; this.buses = buses; this.shot = shot || (() => {});
    this.r = rng(4242);
    this.snap = false;
    this.ext = 0;            // 0 cabin .. 1 exterior (cinematic) mix
    this.prev = null;
    this.t = 0;
    this._build();
  }

  // ------------------------------------------------------------------ node helpers
  gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  filt(type, f, q = 0.707, gainDb = 0) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gainDb; return b; }
  osc(type, f, wave) { const o = this.ctx.createOscillator(); if (wave) o.setPeriodicWave(wave); else o.type = type; o.frequency.value = f; o.start(); return o; }
  chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; }
  panner(x, y, z, dest, { model = 'equalpower', ref = 4, roll = 1, max = 200 } = {}) {
    const p = this.ctx.createPanner();
    p.panningModel = model; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = max;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
    p.connect(dest);
    return p;
  }
  stereo(pan, dest) { const s = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : this.gain(1); if (s.pan) s.pan.value = pan; s.connect(dest); return s; }
  /** Smoothly drive an AudioParam (skips redundant writes). */
  set(param, v, tc = 0.08) {
    if (!(v === v) || !isFinite(v)) return;
    const last = param._v;
    if (!this.snap && last !== undefined && Math.abs(v - last) <= 1e-5 + Math.abs(last) * 1e-4) return;
    param._v = v;
    const now = this.ctx.currentTime;
    if (this.snap) { param.cancelScheduledValues(0); param.setValueAtTime(v, now); }
    else param.setTargetAtTime(v, now, tc);
  }
  /** brown noise source high-passed (no inaudible sub-bass eating headroom) */
  brown(k = 0) { const h = this.filt('highpass', 38, 0.7); this.bank.brownSrc(k).connect(h); return h; }
  wave(amps, seedPhase = 0) {
    const n = amps.length + 1, re = new Float32Array(n), im = new Float32Array(n), r = rng(99 + seedPhase);
    for (let i = 1; i < n; i++) { const a = amps[i - 1], p = r() * Math.PI * 2; re[i] = a * Math.cos(p); im[i] = a * Math.sin(p); }
    return this.ctx.createPeriodicWave(re, im, { disableNormalization: false });
  }

  // ------------------------------------------------------------------ graph
  _build() {
    const B = this.bank, eng = this.buses.engines, amb = this.buses.ambience, fx = this.buses.effects;

    // ============================== ENGINES
    this.eng = [0, 1].map((i) => {
      const sx = i === 0 ? -1 : 1;
      const fanPan = this.panner(sx * E.x, E.y + 0.2, E.inletZ + 0.9, eng, { ref: 5, roll: 0.7 });
      const jetPan = this.panner(sx * E.x, E.y + 0.3, E.inletZ + E.length + 7.5, eng, { ref: 6, roll: 0.7 });
      const fanHull = this.filt('lowpass', 2400, 0.5); fanHull.connect(fanPan);
      const fanHull2 = this.filt('lowpass', 2600, 0.6); fanHull2.connect(fanHull);
      const jetHull = this.filt('lowpass', 900, 0.6); jetHull.connect(jetPan);
      const k = {};
      k.fanHull = [fanHull, fanHull2]; k.jetHull = jetHull;
      // blade-passing tone + narrow band noise + 2nd harmonic
      k.fanOsc = this.osc('sine', 400); k.gFan = this.gain(); this.chain(k.fanOsc, k.gFan, fanHull2);
      k.fanBp = this.filt('bandpass', 400, 9); k.gFanNb = this.gain(); this.chain(B.pinkSrc(i), k.fanBp, k.gFanNb, fanHull2);
      k.fan2 = this.osc('sine', 800); k.gFan2 = this.gain(); this.chain(k.fan2, k.gFan2, fanHull2);
      k.jit = this.gain(0); this.chain(B.wobbleSrc(i, 1.0 + i * 0.37), k.jit); k.jit.connect(k.fanOsc.frequency); k.jit.connect(k.fanBp.frequency);
      k.jit2 = this.gain(0); k.jit.connect(k.jit2); k.jit2.connect(k.fan2.frequency);
      k.fanAm = this.gain(0); this.chain(B.wobbleSrc(3, 1.3 + i * 0.21), k.fanAm, k.gFan.gain);
      // buzz-saw (multiple pure tones): shaft-order harmonics with an irregular spectrum
      const r = rng(17 + i * 101), amps = [];
      for (let h = 1; h <= 44; h++) { const centre = Math.exp(-Math.pow((h - 16) / 9, 2)); amps.push(centre * (0.25 + r() * 0.75) * (r() < 0.25 ? 0.2 : 1)); }
      k.buzz = this.osc('sine', 80, this.wave(amps, i)); k.gBuzz = this.gain(); k.buzzBp = this.filt('bandpass', 1300, 0.6);
      this.chain(k.buzz, k.buzzBp, k.gBuzz, fanHull);
      k.buzzAm = this.gain(0); this.chain(this.brown(i), this.filt('lowpass', 40), k.buzzAm, k.gBuzz.gain);
      // N2 core hum (harmonics 2..9 of HP shaft) + HPC whine
      k.core = this.osc('sine', 140, this.wave([0.1, 0.5, 0.8, 0.6, 0.4, 0.5, 0.3, 0.2, 0.15], 5 + i)); k.gCore = this.gain(); this.chain(k.core, k.gCore, fanHull);
      k.whine = this.osc('sine', 5000); k.gWhine = this.gain(); this.chain(k.whine, k.gWhine, fanPan);
      // jet mixing roar
      k.jetLp = this.filt('lowpass', 400, 0.6); k.gJet = this.gain(); this.chain(B.pinkSrc(i + 1), k.jetLp, this.filt('peaking', 160, 0.8, 4), k.gJet, jetHull);
      k.jetAm = this.gain(0); this.chain(B.wobbleSrc(2 - i, 0.7), k.jetAm, k.gJet.gain);
      // low rumble (passes the hull)
      k.gRumble = this.gain(); this.chain(this.brown(i), this.filt('lowpass', 130, 0.7), k.gRumble, jetPan);
      // starter (air turbine) whine + duct air
      k.starter = this.osc('sawtooth', 900); k.starterBp = this.filt('bandpass', 900, 4); k.gStarter = this.gain();
      this.chain(k.starter, k.starterBp, k.gStarter, fanHull);
      k.gStartAir = this.gain(); this.chain(B.pinkSrc(2), this.filt('bandpass', 2200, 0.8), k.gStartAir, fanPan);
      // reverse thrust roar: radiates forward from the cascades
      k.gRev = this.gain(); this.chain(B.pinkSrc(i), this.filt('lowpass', 1100, 0.6), this.filt('peaking', 300, 0.7, 5), k.gRev, fanHull);
      k.spin = 0; k.prevN2 = 0; k.drift = 0;
      return k;
    });

    // ============================== APU (tail cone)
    {
      const pan = this.panner(0, 1.1, 17.5, eng, { ref: 6, roll: 1 });
      const hull = this.filt('lowpass', 1400, 0.6); hull.connect(pan);
      const a = this.apu = { level: 0 };
      a.tone = this.osc('sine', 816); a.gTone = this.gain(); this.chain(a.tone, a.gTone, hull);
      a.tone2 = this.osc('sine', 1632); a.gTone2 = this.gain(); this.chain(a.tone2, a.gTone2, hull);
      a.bp = this.filt('bandpass', 1500, 1.5); a.gHiss = this.gain(); this.chain(B.pinkSrc(1), a.bp, a.gHiss, hull);
      a.gRumble = this.gain(); this.chain(this.brown(1), this.filt('lowpass', 220), a.gRumble, pan);
      a.jit = this.gain(3); this.chain(B.wobbleSrc(1, 2.2), a.jit); a.jit.connect(a.tone.frequency);
    }

    // ============================== PACKS & VENTILATION (diffuse)
    {
      const p = this.packs = { level: 0 };
      p.gL = this.gain(); p.gR = this.gain();
      this.chain(B.pinkSrc(0), this.filt('highpass', 260), this.filt('lowpass', 4800, 0.6), this.filt('peaking', 1100, 0.8, 2), p.gL, this.stereo(-0.75, amb));
      this.chain(B.pinkSrc(1), this.filt('highpass', 260), this.filt('lowpass', 4800, 0.6), this.filt('peaking', 1300, 0.8, 2), p.gR, this.stereo(0.75, amb));
      p.gLow = this.gain(); this.chain(this.brown(0), this.filt('lowpass', 140), p.gLow, amb);
      p.acm = this.osc('sine', 1850); p.gAcm = this.gain(); this.chain(p.acm, p.gAcm, this.panner(0, -1.2, 0.5, amb, { ref: 3, roll: 1 }));
      p.acmJit = this.gain(6); this.chain(B.wobbleSrc(2, 1.7), p.acmJit); p.acmJit.connect(p.acm.frequency);
    }

    // ============================== AIRFLOW / AERODYNAMICS
    {
      const a = this.air = {};
      a.lpL = this.filt('lowpass', 800, 0.6); a.lpR = this.filt('lowpass', 800, 0.6);
      a.gL = this.gain(); a.gR = this.gain();
      this.chain(B.pinkSrc(1), this.filt('highpass', 45), a.lpL, this.filt('peaking', 260, 0.7, 3), a.gL, this.stereo(-0.9, amb));
      this.chain(B.pinkSrc(2), this.filt('highpass', 45), a.lpR, this.filt('peaking', 240, 0.7, 3), a.gR, this.stereo(0.9, amb));
      a.am = this.gain(0); this.chain(B.wobbleSrc(3, 0.6), a.am); a.am.connect(a.gL.gain); a.am.connect(a.gR.gain);
      a.gLow = this.gain(); this.chain(this.brown(1), this.filt('lowpass', 95), a.gLow, amb);
      a.gWhistle = this.gain(); this.chain(B.whiteSrc(), this.filt('bandpass', 2650, 28), a.gWhistle, this.panner(L1.x, 1.3, L1.z, amb, { model: 'equalpower', ref: 1.2, roll: 1.4 }));
      a.wAm = this.gain(0); this.chain(B.wobbleSrc(0, 1.9), a.wAm, a.gWhistle.gain);
      a.gRain = this.gain(); this.chain(B.pinkSrc(0), this.filt('highpass', 2200), this.filt('lowpass', 9000), a.gRain, amb);
      a.rainAm = this.gain(0); this.chain(B.wobbleSrc(3, 3.1), a.rainAm, a.gRain.gain);
      a.gBuffet = this.gain(); this.chain(this.brown(0), this.filt('lowpass', 85), a.gBuffet, amb);
      a.bAm = this.gain(0); this.chain(B.wobbleSrc(3, 9), a.bAm, a.gBuffet.gain);
      a.gGear = this.gain(); this.chain(B.pinkSrc(2), this.filt('lowpass', 380, 0.7), a.gGear, this.panner(0, -1.4, 1.6, amb, { ref: 3, roll: 0.8 }));
      a.gSpoil = this.gain(); this.chain(B.pinkSrc(0), this.filt('lowpass', 480, 0.7), this.filt('peaking', 120, 1, 5), a.gSpoil, amb);
    }

    // ============================== ROLLING
    {
      const g = this.roll = { dist: 0, next: 12, mainAt: -1, wasStopped: true };
      const mainPan = this.panner(0, -1.6, AIRCRAFT.gear.mainZ, amb, { ref: 4, roll: 0.8 });
      const nosePan = this.panner(0, -1.5, AIRCRAFT.gear.noseZ, amb, { ref: 4, roll: 0.8 });
      g.lp = this.filt('lowpass', 120, 0.8); g.gLow = this.gain(); this.chain(this.brown(1), g.lp, g.gLow, mainPan);
      g.gMid = this.gain(); this.chain(B.pinkSrc(2), this.filt('bandpass', 430, 0.9), g.gMid, mainPan);
      g.gNose = this.gain(); this.chain(this.brown(0), this.filt('lowpass', 110), g.gNose, nosePan);
      g.am = this.gain(0); this.chain(B.wobbleSrc(3, 4), g.am, g.gLow.gain);
      // brake squeal (main gear)
      g.sq = this.osc('triangle', 1250); g.sqBp = this.filt('bandpass', 1250, 9); g.gSq = this.gain();
      this.chain(g.sq, g.sqBp, g.gSq, this.filt('lowpass', 2500), mainPan);
      g.sqVib = this.gain(14); this.chain(B.wobbleSrc(3, 6), g.sqVib); g.sqVib.connect(g.sq.frequency);
      g.squeal = 0; g.sqT = 0;
    }

    // ============================== HYDRAULICS: gear, flaps, EMDP, PTU
    {
      const h = this.hyd = { prevGear: null, prevFlaps: null, gearMoving: false, flapLevel: 0, lastPtu: -1e9 };
      const well = this.panner(0, -1.3, 2.6, fx, { ref: 3, roll: 0.8 });
      h.gearOsc = this.osc('sawtooth', 340); h.gGear = this.gain(); this.chain(h.gearOsc, this.filt('bandpass', 1050, 2), h.gGear, well);
      h.gGearN = this.gain(); this.chain(B.pinkSrc(1), this.filt('bandpass', 700, 1.2), h.gGearN, well);
      h.flapOsc = this.osc('sawtooth', 520); h.gFlap = this.gain(); this.chain(h.flapOsc, this.filt('bandpass', 950, 1.6), h.gFlap, well);
      h.flapOsc2 = this.osc('square', 261); h.gFlap2 = this.gain(); this.chain(h.flapOsc2, this.filt('lowpass', 650), h.gFlap2, well);
      h.gFlapN = this.gain(); this.chain(B.pinkSrc(0), this.filt('bandpass', 1500, 1.5), h.gFlapN, well);
      h.fJit = this.gain(5); this.chain(B.wobbleSrc(1, 3), h.fJit); h.fJit.connect(h.flapOsc.frequency);
      // EMDP + 400 Hz electrical hum
      h.emdp = this.osc('sine', 400, this.wave([1, 0.45, 0.25, 0.12, 0.08], 21)); h.gEmdp = this.gain();
      this.chain(h.emdp, h.gEmdp, this.panner(0, -1.2, 1.8, fx, { ref: 2.5, roll: 1 }));
      h.gEmdpN = this.gain(); this.chain(B.pinkSrc(2), this.filt('bandpass', 2600, 1.5), h.gEmdpN, well);
      h.emdpLevel = 0;
    }

    // ============================== GALLEY & LAV equipment (positional, near-field)
    {
      const q = this.equip = {};
      const oven = (x, y, z) => {
        const p = this.panner(x, y, z, fx, { model: 'HRTF', ref: 0.8, roll: 1.6 });
        const g = this.gain(); const hum = this.osc('sine', 800); const gh = this.gain(0.25);
        this.chain(hum, gh, g); this.chain(B.pinkSrc(1), this.filt('bandpass', 1200, 0.9), g);
        g.connect(p); return g;
      };
      q.ovenF = oven(1.05, 1.3, ZONES.forwardGalley.zMin + 0.35);
      q.ovenA = oven(0.0, 1.3, ZONES.aftGalley.zMax - 0.35);
      const lav = (x, z) => {
        const p = this.panner(x, 2.0, z, fx, { model: 'HRTF', ref: 0.6, roll: 2.2 });
        const g = this.gain(); this.chain(B.pinkSrc(2), this.filt('bandpass', 900, 0.6), this.filt('highpass', 300), g, p); return g;
      };
      const fl = ZONES.forwardLav, al = ZONES.aftLavs;
      q.lav = {
        'lav-fwd': lav((fl.xMin + fl.xMax) / 2, (fl.zMin + fl.zMax) / 2),
        'lav-aft-l': lav((al.left.xMin + al.left.xMax) / 2, (al.zMin + al.zMax) / 2),
        'lav-aft-r': lav((al.right.xMin + al.right.xMax) / 2, (al.zMin + al.zMax) / 2),
      };
      q.zone = null;
    }

    // ============================== AIRPORT OUTSIDE (gate ambience)
    {
      const o = this.out = { level: 0, door: 0, events: [], nextBag: 3, nextBeep: 8, nextJet: 5, nextVeh: 2 };
      o.mix = this.gain(1);
      o.doorPan = this.panner(L1.x - 0.4, L1.y, L1.z, amb, { model: 'equalpower', ref: 1.4, roll: 1.3 });
      o.gDoor = this.gain(0); this.chain(o.mix, o.gDoor, o.doorPan);
      o.gHull = this.gain(0); this.chain(o.mix, this.filt('lowpass', 300, 0.6), o.gHull, amb);
      o.gJets = this.gain(); this.chain(this.brown(1), this.filt('lowpass', 600), this.filt('peaking', 180, 0.7, 4), o.gJets, o.mix);
      o.jAm = this.gain(0); this.chain(B.wobbleSrc(0, 0.25), o.jAm, o.gJets.gain);
      o.gJetEvt = this.gain(0); o.jetLp = this.filt('lowpass', 500, 0.7); this.chain(B.pinkSrc(1), o.jetLp, o.gJetEvt, o.mix);
      o.apuTone = this.osc('sine', 790); o.gApu = this.gain(); this.chain(o.apuTone, o.gApu, o.mix);
      o.gApuN = this.gain(); this.chain(B.pinkSrc(0), this.filt('bandpass', 2300, 2), o.gApuN, o.mix);
      o.apuJit = this.gain(4); this.chain(B.wobbleSrc(2, 0.8), o.apuJit); o.apuJit.connect(o.apuTone.frequency);
      o.diesel = this.osc('sawtooth', 32); o.gDiesel = this.gain(0); this.chain(o.diesel, this.filt('lowpass', 240, 1.2), o.gDiesel, o.mix);
      o.dJit = this.gain(3); this.chain(B.wobbleSrc(1, 0.5), o.dJit); o.dJit.connect(o.diesel.frequency);
      o.beep = this.osc('square', 1180); o.gBeep = this.gain(0); this.chain(o.beep, this.filt('bandpass', 1180, 5), o.gBeep, o.mix);
      o.gWind = this.gain(); this.chain(B.pinkSrc(2), this.filt('bandpass', 320, 0.5), o.gWind, o.mix);
      o.wAm = this.gain(0); this.chain(B.wobbleSrc(1, 0.4), o.wAm, o.gWind.gain);
      o.gPca = this.gain(); this.chain(B.pinkSrc(0), this.filt('bandpass', 850, 0.8), o.gPca, o.gDoor);
      o.gPcaLow = this.gain(); this.chain(this.brown(0), this.filt('lowpass', 150), o.gPcaLow, o.gDoor);
      // pushback tug diesel under the nose
      o.tug = this.osc('sawtooth', 29); o.gTug = this.gain(0);
      this.chain(o.tug, this.filt('lowpass', 220, 1.3), o.gTug, this.panner(0, -1.5, AIRCRAFT.noseZ + 0.5, amb, { ref: 4, roll: 1 }));
      o.tugN = this.gain(0); this.chain(this.brown(1), this.filt('lowpass', 300), o.tugN, this.panner(0, -1.5, AIRCRAFT.noseZ + 0.5, amb, { ref: 4, roll: 1 }));
      o.tugLevel = 0;
    }
  }

  // ------------------------------------------------------------------ per-frame update
  /**
   * @param st   flight state (src/flight/state.js)
   * @param dt   seconds
   * @param env  { listener: {x,y,z}, zone, exterior 0..1, pushback bool, snap bool }
   */
  update(st, dt, env = {}) {
    if (!st) return;
    this.snap = !!env.snap;
    if (this.snap) dt = Math.max(dt, 5);
    this.t += dt;
    const ext = this.ext = env.exterior || 0;
    const L = env.listener || { x: 0, y: 1.2, z: 0 };
    const v = Math.max(0, st.airspeed || 0), gs = Math.max(0, st.groundSpeed || 0);
    const onGround = !!st.onGround;
    const vEff = onGround ? v : 0.6 * v + 0.4 * Math.max(v, gs);
    const r = this.r, S = (p, x, tc) => this.set(p, x, tc);
    const hullK = 1 + 5 * ext;      // exterior view: no fuselage transmission loss
    const anyStarting = st.engines.some((e) => e.starting);
    const anyRunning = st.engines.some((e) => e.running);

    // ============================== ENGINES
    for (let i = 0; i < 2; i++) {
      const e = st.engines[i] || { n1: 0, n2: 0 }, k = this.eng[i];
      k.drift = clamp(k.drift + (r() - 0.5) * dt * 0.0012, -0.0012, 0.0012);
      const n = Math.max(0, e.n1 / 100) * (1 + k.drift + (i ? 0.0007 : 0)), n2 = Math.max(0, e.n2 / 100);
      const bpf = 2070 * n, shaft = 86.25 * n, hp = 241 * n2;
      const on = smoothstep(0.03, 0.2, n);
      const fanA = 0.011 * on * (0.55 + 1.5 * n * n);
      S(k.fanOsc.frequency, Math.max(20, bpf), 0.05); S(k.fanBp.frequency, Math.max(40, bpf), 0.05);
      S(k.fan2.frequency, Math.max(40, 2 * bpf), 0.05);
      S(k.jit.gain, bpf * 0.0025, 0.2); S(k.jit2.gain, 2, 0.2);
      S(k.gFan.gain, fanA * 0.55, 0.12); S(k.fanAm.gain, fanA * 0.2, 0.2);
      S(k.gFanNb.gain, fanA * 7, 0.12);
      S(k.gFan2.gain, fanA * 0.25 * smoothstep(0.4, 0.9, n), 0.12);
      // buzz-saw: supersonic tip speeds, forward radiated, masked in flight at speed
      const buzzA = 0.016 * smoothstep(0.8, 0.95, n) * (1 - 0.8 * smoothstep(60, 150, v));
      S(k.buzz.frequency, Math.max(10, shaft), 0.05); S(k.buzzBp.frequency, 900 + 900 * n, 0.2);
      S(k.gBuzz.gain, buzzA, 0.15); S(k.buzzAm.gain, buzzA * 2.2, 0.15);
      // core
      const coreOn = smoothstep(0.1, 0.55, n2);
      S(k.core.frequency, Math.max(5, hp), 0.05); S(k.gCore.gain, 0.005 * coreOn * (1 + n), 0.15);
      S(k.whine.frequency, Math.max(50, hp * 38), 0.05); S(k.gWhine.gain, (0.0006 + 0.004 * ext) * coreOn, 0.15);
      // jet roar
      const nj = clamp01((n - 0.18) / 0.82);
      const jetA = (0.05 * on + 0.62 * Math.pow(nj, 2.3)) * (1 - 0.6 * smoothstep(0, 230, vEff)) * (1 + 1.2 * ext);
      S(k.jetLp.frequency, (260 + 1300 * Math.pow(nj, 1.2)) * (1 + ext * 2), 0.1);
      S(k.gJet.gain, jetA, 0.1); S(k.jetAm.gain, jetA * 0.12, 0.2);
      S(k.gRumble.gain, 0.2 * on * (0.35 + 0.65 * Math.pow(n, 1.5)), 0.12);
      // hull transmission
      S(k.fanHull[0].frequency, 2400 * hullK, 0.3); S(k.fanHull[1].frequency, 2600 * hullK, 0.3); S(k.jetHull.frequency, 900 * hullK, 0.3);
      // starter: air turbine spins with N2 until cut-out
      if (e.starting) k.spin += (e.n2 - k.spin) * Math.min(1, dt * 3); else k.spin *= Math.exp(-dt / 2.8);
      const stA = 0.009 * smoothstep(0.5, 8, k.spin) * (e.starting ? 1 : smoothstep(0, 25, k.spin));
      S(k.starter.frequency, 520 + k.spin * 46, 0.1); S(k.starterBp.frequency, 520 + k.spin * 46, 0.1);
      S(k.gStarter.gain, stA, 0.2); S(k.gStartAir.gain, (e.starting ? 0.03 : 0) * smoothstep(0, 10, k.spin), 0.6);
      if (!this.snap && e.starting && k.prevN2 < 25 && e.n2 >= 25) {
        this.shot('lightoff', { position: { x: (i ? 1 : -1) * E.x, y: E.y, z: 0 }, volume: 0.55, bus: 'engines' });
      }
      k.prevN2 = e.n2;
      // reverse thrust
      const rev = clamp01(st.reverser || 0) * smoothstep(0.25, 0.75, n);
      S(k.gRev.gain, 0.32 * rev, 0.15);
    }

    // ============================== APU
    {
      const a = this.apu, tgt = st.apuRunning ? 1 : 0;
      a.level = this.snap ? tgt : clamp01(a.level + (tgt > a.level ? dt / 22 : -dt / 16));
      const l = a.level, f = 816 * (0.4 + 0.6 * smoothstep(0, 0.6, l));
      S(a.tone.frequency, f, 0.2); S(a.tone2.frequency, 2 * f, 0.2); S(a.bp.frequency, 1500 * (0.5 + 0.5 * l), 0.3);
      S(a.gTone.gain, 0.006 * l, 0.3); S(a.gTone2.gain, 0.002 * l, 0.3);
      S(a.gHiss.gain, 0.1 * l, 0.3); S(a.gRumble.gain, 0.09 * l, 0.3);
    }

    // ============================== PACKS
    {
      const p = this.packs;
      // packs are switched off for engine start (bleed air to the starters): the cabin goes quiet
      let tgt = anyStarting ? 0.12 : (st.apuRunning || anyRunning) ? 1 : 0.25;
      tgt *= (1 - 0.85 * ext);
      p.level += (tgt - p.level) * (this.snap ? 1 : 1 - Math.exp(-dt / 2.5));
      const pk = 0.09 * p.level * (onGround ? 1.1 : 1);
      // a little louder on the side of the cabin the listener is on
      const near = clamp(L.x / 1.6, -1, 1);
      S(p.gL.gain, pk * (1 - 0.18 * near), 0.2); S(p.gR.gain, pk * (1 + 0.18 * near), 0.2);
      S(p.gLow.gain, 0.05 * p.level, 0.3); S(p.gAcm.gain, 0.0016 * p.level, 0.3);
    }

    // ============================== AIRFLOW
    {
      const a = this.air;
      const q = clamp01(vEff / 175);
      const flapK = 1 + 0.6 * clamp01((st.flapsDeg || 0) / 30) * (onGround ? 0 : 1);
      const aero = 0.2 * Math.pow(q, 1.75) * flapK * (1 + 0.6 * ext);
      const near = clamp(L.x / 1.5, -1, 1);
      S(a.lpL.frequency, 320 + 1700 * q, 0.2); S(a.lpR.frequency, 320 + 1700 * q, 0.2);
      S(a.gL.gain, aero * (1 - 0.22 * near), 0.15); S(a.gR.gain, aero * (1 + 0.22 * near), 0.15);
      S(a.am.gain, aero * (0.05 + 0.35 * (st.turbulence || 0)), 0.2);
      S(a.gLow.gain, 0.3 * Math.pow(q, 1.75) * (1 + (st.turbulence || 0)), 0.2);
      const wh = 0.004 * smoothstep(0.55, 1, q); S(a.gWhistle.gain, wh, 0.5); S(a.wAm.gain, wh * 0.8, 0.5);
      const rain = 0.05 * clamp01(st.inCloud || 0) * smoothstep(30, 160, vEff);
      S(a.gRain.gain, rain, 0.6); S(a.rainAm.gain, rain * 0.5, 0.6);
      const buf = clamp01(st.buffet || 0);
      S(a.gBuffet.gain, 0.5 * buf, 0.15); S(a.bAm.gain, 0.5 * buf, 0.15);
      const gearOut = onGround ? 0 : clamp01(st.gear || 0) * Math.pow(clamp01(v / 95), 2);
      S(a.gGear.gain, 0.5 * gearOut, 0.3);
      const sp = clamp01(st.spoilers || 0);
      S(a.gSpoil.gain, onGround ? 0.06 * sp * Math.pow(clamp01(gs / 70), 2) : 0.16 * sp * Math.pow(clamp01(v / 130), 2), 0.25);
    }

    // ============================== ROLLING
    {
      const g = this.roll, rr = clamp01(st.runwayRumble ?? (onGround ? 0.5 : 0));
      const rolling = onGround ? 1 : 0, sF = Math.pow(smoothstep(0.3, 70, gs), 0.4);
      S(g.lp.frequency, 70 + 3 * Math.min(gs, 80), 0.2);
      S(g.gLow.gain, rolling * (0.08 + 0.32 * rr) * (0.15 + 0.85 * sF), 0.06);
      S(g.am.gain, rolling * 0.1 * rr * sF, 0.1);
      S(g.gMid.gain, rolling * 0.12 * (0.3 + 0.7 * rr) * Math.pow(sF, 1.5), 0.06);
      S(g.gNose.gain, rolling * 0.1 * (0.2 + 0.8 * rr) * sF, 0.06);
      // joints & centreline lights: nose wheel first, mains 17.7 m later
      if (!this.snap && onGround && gs > 0.8) {
        g.dist += gs * dt;
        if (g.dist >= g.next) {
          g.dist = 0; g.next = 13 + r() * 6;
          const vol = (0.2 + 0.8 * smoothstep(1, 45, gs)) * (0.6 + 0.4 * rr) * (0.7 + r() * 0.5);
          this.shot('joint_thump', { position: { x: 0, y: -1.4, z: AIRCRAFT.gear.noseZ }, volume: 0.55 * vol, rate: 0.9 + r() * 0.2, bus: 'ambience' });
          const dtMain = (AIRCRAFT.gear.mainZ - AIRCRAFT.gear.noseZ) / gs;
          if (dtMain < 2.5) g.mainAt = this.t + dtMain, g.mainVol = vol;
        }
      }
      if (g.mainAt > 0 && this.t >= g.mainAt) {
        g.mainAt = -1;
        if (onGround) this.shot('joint_thump', { position: { x: 0, y: -1.5, z: AIRCRAFT.gear.mainZ }, volume: 0.8 * g.mainVol, rate: 0.85 + r() * 0.15, bus: 'ambience' });
      }
      // brakes: squeal bursts at low speed, groan at the stop
      const br = clamp01(st.brakes || 0);
      const sqWant = onGround && br > 0.2 && gs > 0.3 && gs < 6 ? 1 : 0;
      g.sqT -= dt;
      if (g.sqT <= 0) { g.squeal = sqWant && r() < 0.55 ? 0.4 + r() * 0.6 : 0; g.sqT = 0.25 + r() * 0.9; S(g.sq.frequency, 1100 + r() * 400, 0.3); }
      S(g.gSq.gain, sqWant * g.squeal * 0.012, 0.08);
      const stopped = gs < 0.25;
      if (!this.snap && onGround && stopped && !g.wasStopped && br > 0.15) this.shot('brake_creak', { position: { x: 0, y: -1.5, z: AIRCRAFT.gear.mainZ }, volume: 0.5 });
      g.wasStopped = stopped;
    }

    // ============================== HYDRAULICS
    {
      const h = this.hyd;
      const gear = clamp01(st.gear ?? 1), flaps = st.flapsDeg || 0;
      if (h.prevGear === null || this.snap) { h.prevGear = gear; h.prevFlaps = flaps; }
      const dG = gear - h.prevGear, dF = flaps - h.prevFlaps;
      const jumped = Math.abs(dG) > 0.25 || Math.abs(dF) > 6;
      const gearMoving = !jumped && Math.abs(dG) / Math.max(dt, 1e-3) > 0.01 && gear > 0.001 && gear < 0.999;
      if (!this.snap && !jumped) {
        if (gearMoving && !h.gearMoving) this.shot('gear_clunk', { position: { x: 0, y: -1.4, z: AIRCRAFT.gear.mainZ }, volume: 0.6 });
        if (!gearMoving && h.gearMoving) this.shot('gear_lock', { position: { x: 0, y: -1.4, z: AIRCRAFT.gear.mainZ }, volume: gear > 0.5 ? 0.6 : 0.75 });
      }
      h.gearMoving = gearMoving;
      S(h.gGear.gain, gearMoving ? 0.006 : 0, 0.25); S(h.gGearN.gain, gearMoving ? 0.03 : 0, 0.25);
      const fRate = jumped ? 0 : Math.abs(dF) / Math.max(dt, 1e-3);
      const fl = smoothstep(0.03, 0.4, fRate);
      if (!this.snap && fl > 0.5 && h.flapLevel <= 0.5 && !onGround && this.t - h.lastPtu > 45 && r() < 0.85) {
        h.lastPtu = this.t;
        this.shot('ptu', { position: { x: 0, y: -1.3, z: 3 }, volume: 0.32, rate: 0.95 + r() * 0.1 });
      }
      h.flapLevel = fl;
      S(h.gFlap.gain, 0.0045 * fl, 0.4); S(h.gFlap2.gain, 0.002 * fl, 0.4); S(h.gFlapN.gain, 0.02 * fl, 0.4);
      h.prevGear = gear; h.prevFlaps = flaps;
      const emdpTgt = st.phase !== 'gate' || st.phaseProgress > 0.85 ? 1 : 0;
      h.emdpLevel += (emdpTgt - h.emdpLevel) * (this.snap ? 1 : 1 - Math.exp(-dt / 1.5));
      S(h.gEmdp.gain, 0.005 * h.emdpLevel, 0.4); S(h.gEmdpN.gain, 0.012 * h.emdpLevel, 0.4);
    }

    // ============================== GALLEY / LAV equipment
    {
      const q = this.equip, inflight = !onGround || st.phase === 'gate' ? 1 : 0.4;
      S(q.ovenF.gain, 0.02 * inflight * (1 - ext), 0.5); S(q.ovenA.gain, 0.02 * inflight * (1 - ext), 0.5);
      const zone = env.zone;
      for (const id in q.lav) S(q.lav[id].gain, (zone === id ? 0.06 : 0.004) * (1 - ext), 0.3);
    }

    // ============================== AIRPORT OUTSIDE
    {
      const o = this.out, ph = st.phase;
      const tgt = !onGround ? 0 : ph === 'gate' || ph === 'arrived' ? 1 : ph === 'pushback' ? 0.85 : ph === 'taxi_in' || ph === 'taxi_out' ? 0.55 : 0.3;
      o.level += (tgt - o.level) * (this.snap ? 1 : 1 - Math.exp(-dt / 3));
      const doorTgt = st.cabin && st.cabin.doorsClosed === false ? 1 : 0;
      o.door += (doorTgt - o.door) * (this.snap ? 1 : 1 - Math.exp(-dt / 1.2));
      S(o.gDoor.gain, o.level * o.door * 2.4, 0.2);
      S(o.gHull.gain, o.level * (0.12 + 0.4 * ext), 0.3);
      const busy = o.level;
      S(o.gJets.gain, 0.12 * busy, 0.5); S(o.jAm.gain, 0.08 * busy, 0.5);
      S(o.gApu.gain, 0.004 * busy, 0.5); S(o.gApuN.gain, 0.03 * busy, 0.5);
      S(o.gWind.gain, 0.06 * busy, 0.5); S(o.wAm.gain, 0.04 * busy, 0.5);
      const bridge = st.cabin && st.cabin.bridgeConnected ? 1 : 0;
      S(o.gPca.gain, 0.05 * bridge, 0.8); S(o.gPcaLow.gain, 0.08 * bridge, 0.8);
      if (!this.snap && busy > 0.05) this._airportEvents(st, dt, busy);
      // pushback tug
      const tugTgt = env.pushback ? 1 : 0;
      o.tugLevel += (tugTgt - o.tugLevel) * (this.snap ? 1 : 1 - Math.exp(-dt / 1.5));
      S(o.gTug.gain, 0.025 * o.tugLevel, 0.3); S(o.tugN.gain, 0.06 * o.tugLevel, 0.3);
      S(o.tug.frequency, 27 + 5 * smoothstep(0, 1.5, gs), 0.5);
    }

    // ============================== TURBULENCE rattles / creaks
    if (!this.snap) {
      const turb = clamp01(st.turbulence || 0), gy = Math.abs(((st.gForce && st.gForce.y) || 1) - 1);
      const rough = onGround ? clamp01(st.runwayRumble || 0) * smoothstep(5, 40, gs) * 0.4 : 0;
      const lambda = turb * 2 + clamp(gy * 9, 0, 4) + rough * 1.2;
      if (lambda > 0.05 && r() < lambda * dt) {
        const k = r();
        if (k < 0.5) this.shot('rattle_bin', { position: { x: (r() < 0.5 ? -1 : 1) * 1.25, y: 1.9, z: L.z + (r() - 0.5) * 6 }, volume: 0.25 + 0.5 * r() * (0.4 + turb), rate: 0.9 + r() * 0.2, model: 'HRTF' });
        else if (k < 0.8) this.shot('creak_panel', { position: { x: (r() < 0.5 ? -1 : 1) * 1.55, y: 1.0 + r(), z: L.z + (r() - 0.5) * 4 }, volume: 0.25 + 0.4 * r(), rate: 0.85 + r() * 0.3, model: 'HRTF' });
        else {
          const fwd = Math.abs(L.z - ZONES.forwardGalley.zMin) < Math.abs(L.z - ZONES.aftGalley.zMax);
          this.shot('rattle_cart', { position: fwd ? { x: 1.0, y: 0.6, z: ZONES.forwardGalley.zMin + 0.4 } : { x: 0, y: 0.6, z: ZONES.aftGalley.zMax - 0.4 }, volume: 0.35 + 0.5 * r() * (0.5 + turb), rate: 0.9 + r() * 0.2, model: 'HRTF' });
        }
      }
    }
  }

  _airportEvents(st, dt, busy) {
    const o = this.out, r = this.r, ctx = this.ctx, now = ctx.currentTime;
    const atGate = st.phase === 'gate' || st.phase === 'arrived';
    // bags thrown into the forward / aft hold during boarding
    o.nextBag -= dt;
    if (o.nextBag <= 0) {
      o.nextBag = atGate ? 2.5 + r() * 9 : 1e9;
      if (atGate && !st.cabin?.doorsClosed) {
        const fwd = r() < 0.5;
        this.shot('bag_thump', { position: { x: (r() - 0.5) * 1.5, y: -1.1, z: fwd ? -7 - r() * 3 : 5 + r() * 3 }, volume: 0.25 + r() * 0.35, rate: 0.85 + r() * 0.3, bus: 'ambience' });
        if (r() < 0.35) o.nextBag = 0.5 + r() * 0.7;   // a quick sequence
      }
    }
    // a ground vehicle reversing (beeper) / driving by (diesel)
    o.nextVeh -= dt;
    if (o.nextVeh <= 0) {
      o.nextVeh = 12 + r() * 30;
      const dur = 5 + r() * 8, g = o.gDiesel.gain, lvl = (0.004 + r() * 0.01) * busy;
      g.cancelScheduledValues(now); g.setTargetAtTime(lvl, now, 1.2); g.setTargetAtTime(0, now + dur, 1.5);
      o.diesel.frequency.setTargetAtTime(28 + r() * 10, now, 1);
      if (r() < 0.6) {
        const b = o.gBeep.gain, bl = (0.003 + r() * 0.006) * busy, t0 = now + 0.8 + r() * 2, n = Math.floor(5 + r() * 8);
        b.cancelScheduledValues(now);
        for (let i = 0; i < n; i++) { b.setValueAtTime(bl, t0 + i * 1.0); b.setValueAtTime(0, t0 + i * 1.0 + 0.5); }
      }
    }
    // a distant jet spooling up / taking off
    o.nextJet -= dt;
    if (o.nextJet <= 0) {
      o.nextJet = 25 + r() * 50;
      const g = o.gJetEvt.gain, lvl = (0.03 + r() * 0.05) * busy, up = 4 + r() * 5, hold = 4 + r() * 10;
      g.cancelScheduledValues(now); g.setTargetAtTime(lvl, now, up / 3); g.setTargetAtTime(0, now + up + hold, 4);
      o.jetLp.frequency.cancelScheduledValues(now); o.jetLp.frequency.setTargetAtTime(380 + r() * 500, now, up / 2);
    }
  }

  /** Touchdown impact (flight:touchdown intensity 0..1). */
  touchdown(intensity = 0.3) {
    const k = clamp01(intensity);
    this.shot('touchdown', { position: { x: 0, y: -1.4, z: AIRCRAFT.gear.mainZ }, volume: 0.45 + 0.55 * k, rate: 1 - 0.1 * k });
    const n = 2 + Math.floor(k * 5);
    for (let i = 0; i < n; i++) {
      const delay = 0.04 + this.r() * 0.35;
      setTimeout(() => this.shot('rattle_bin', { position: { x: (this.r() < 0.5 ? -1 : 1) * 1.25, y: 1.9, z: (this.r() - 0.5) * 20 }, volume: 0.2 + 0.4 * k, rate: 0.9 + this.r() * 0.2, model: 'HRTF' }), delay * 1000);
    }
  }
  reverser(on) { if (on) for (let i = 0; i < 2; i++) this.shot('reverser_clunk', { position: { x: (i ? 1 : -1) * E.x, y: E.y, z: E.inletZ + 3 }, volume: 0.5, bus: 'engines' }); }
  spoilers(p) { if (p && p.deployed && p.ground && !p.instant) this.shot('spoiler_thump', { position: { x: 0, y: -0.8, z: 3 }, volume: 0.45 }); }
}
