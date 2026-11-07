// =============================================================================
// FLIGHT DIRECTOR — owns and mutates app.flight.state (priority 10).
//
//  * Motion: GroundMover (exactly along the layout.js paths, strut dynamics,
//    rotation about the main gear) and AirMover (coordinated point-mass flight
//    with autopilot-style guidance), handed over continuously at liftoff and
//    touchdown. Fixed sub-steps (≤ 50 ms) make it frame-rate independent.
//  * Attitude = flight-path angle + angle of attack from a lift model (higher
//    AoA at low speed / with flaps), bank from the turn rate, crab into the wind,
//    de-crab in the flare. Turbulence adds real heave / sway / attitude motion.
//  * Feel: gForce (accelerometer in aircraft axes), angularVelocity,
//    acceleration, vibration, runwayRumble, buffet, turbulence.
//  * Script (script.js): phases, configuration, engines, cabin events.
//  * Journey info for the IFE (journey.js), time of day (sun clock).
//  * skipTo / restart with a fade; jumpTo (canonical anchor + silent
//    fast-forward) for debug boot.
// See docs/ARCHITECTURE.md §4-§6 and src/flight/state.js.
// =============================================================================
import * as THREE from 'three';
import { createFlightState, PHASES, phaseIndex } from './state.js';
import { DEG, KT, FT, G } from '../core/constants.js';
import { DEPARTURE, ARRIVAL, RUNWAY, buildPath } from '../world/layout.js';
import { GEO } from '../world/geo.js';
import { noise1 } from '../core/util.js';
import {
  clamp, clamp01, damp, approach, follow, smoothstep, lerp, wrap360, wrap180, isaInto, iasFromTas,
  preparePath, concatPaths, greatCircle,
} from './fmath.js';
import { AERO, alphaFor, cdFor, n1ForThrust, windInto } from './aero.js';
import { Engines, GROUND_IDLE_N1 } from './engines.js';
import { GroundMover, STRUT_EXT, originAboveContact } from './ground.js';
import { AirMover } from './air.js';
import { planApproach, tasFor, THR_X } from './route.js';
import { Announcer } from './crew.js';
import { Perturb } from './motion.js';
import { SCRIPT, ANCHOR_OF, FL360 } from './script.js';
import {
  ROUTE_GEO, ROUTE_KM, PRESENTED_H, TAKEOFF_H, LANDING_H, PUSHBACK_CIVIL, SUN_CLOCK, ROUTE_FRACTION, FIXED_TOD, phaseValue,
} from './journey.js';

const SUB = 0.05;                 // max physics sub-step (s)
const MAX_FRAME_SIM = 4;          // never integrate more than this per frame (s of sim time)
const LIGHT_MODES = {
  boarding: { level: 1.0, color: new THREE.Color('#ffe3c4') },
  bright: { level: 1.0, color: new THREE.Color('#f7f4ee') },
  cruise: { level: 0.72, color: new THREE.Color('#edf0ff') },
  dim: { level: 0.32, color: new THREE.Color('#ffcfa2') },
  night: { level: 0.1, color: new THREE.Color('#9fb2ff') },
};
const WEIGHTS = (() => {
  const tot = PHASES.reduce((s, p) => s + p.weight, 0);
  let acc = 0;
  return PHASES.map((p) => { const w = p.weight / tot; const r = { id: p.id, label: p.label, start: acc, end: acc + w }; acc += w; return r; });
})();

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _axX = new THREE.Vector3(1, 0, 0);
const _gc = { lat: 0, lon: 0, bearing: 90, distanceKm: 0 };
const _wind = { wx: 0, wz: 0, dir: 0, speed: 0 };

export class Director {
  constructor(app) {
    this.app = app;
    // keep the placeholder's state object (modules initialised before us may hold a reference)
    const st = (app.flight && app.flight.state) || createFlightState();
    this.state = st; this.st = st;
    if (st.mapBearing === undefined) st.mapBearing = 90;
    if (st.bumpCount === undefined) st.bumpCount = 0;
    this.ground = new GroundMover();
    this.air = new AirMover();
    this.mode = 'ground';
    this.eng = new Engines(st.engines);
    this.ann = new Announcer(this);
    this.pert = new Perturb();
    this.silent = false;
    this.realTime = 0;
    this.pd = {};
    this.fired = new Set();
    this.gc = {};
    this.ac = {};
    this.cfg = {
      flapsLever: 0, gearDown: true, speedbrake: 0, groundSpoilers: false, reverser: false,
      flapsSt: { x: 0, v: 0 }, slatsSt: { x: 0, v: 0 }, gearSt: { x: 1, v: 0 },
    };
    this.ad = { T: 288, rho: 1.225, a: 340, mach: 0, tas: 0, iasKt: 0, q: 0, mass: AERO.massTakeoff, W: AERO.massTakeoff * G, wx: 0, wz: 0 };
    this.n1Cmd = 0; this.autoThrust = false; this.atN1 = GROUND_IDLE_N1; this.thrustMode = 'off';
    this.turbScript = 0; this.turbI = 0;
    this.hdgResid = 0;
    this.gh = 0; this.terrain = 0; this.terrainT = 0; this.gRef = 0;
    this.alpha = 0;
    this.descentRequested = false; this.shortCruise = false;
    this.plan = null;
    this.sunElev = 35;
    this.bumpPulse = 0; this._lastBumps = 0;
    this.wheelRpm = 0;
    this.fade = null;
    this.apuOffT = 0;
    this.todSnap = true;
    const dep = app.world?.departureOrigin;
    this.depOrigin = { x: dep ? dep.x : DEPARTURE.origin[0], z: dep ? dep.z : DEPARTURE.origin[2] };
    this.paths = this._buildDeparturePaths();
    // feel scratch
    this._vel = new THREE.Vector3(); this._prevVel = new THREE.Vector3();
    this._acc = new THREE.Vector3(); this._omega = new THREE.Vector3();
    this._qPrev = new THREE.Quaternion();
    this._feelInit = false;
    // audio feedback for the announcer
    app.events?.on?.('cabin:announcement', (p) => this.ann.onStarted(p));
    app.events?.on?.('cabin:announcementEnd', (p) => this.ann.onEnded(p));
  }

  // ===================================================================================== loop
  frame(dt) {
    this._updateFade(dt);
    if (this.app.paused) return;
    if (!(dt > 0)) return;
    this.realTime += dt;
    const sd = this.app.sun?.direction;
    if (sd) this.sunElev = Math.asin(clamp(sd.y / (sd.length() || 1), -1, 1)) / DEG;
    const sim = Math.min(MAX_FRAME_SIM, dt * (this.app.timeScale || 1));
    this._advance(sim);
    this.ann.update();
  }

  _advance(dt) {
    if (!(dt > 0)) return;
    const n = Math.max(1, Math.ceil(dt / SUB - 1e-9));
    const h = dt / n;
    for (let i = 0; i < n; i++) this._step(h);
  }

  _step(dt) {
    const st = this.state;
    st.simTime += dt;
    st.phaseTime += dt;
    this._airData();
    this._resetCommands();
    const sc = SCRIPT[st.phase];
    sc.update(this, dt);
    if (this.mode === 'ground') this.ground.step(dt, this.gc);
    else {
      this.air.wx = this.ad.wx; this.air.wz = this.ad.wz;
      this.air.step(dt, this.ac);
      this._alpha(dt);
    }
    this._actuators(dt);
    this._engines(dt);
    this._turbulence(dt);
    this._compose(dt);
    this._feel(dt);
    st.phaseProgress = clamp01(SCRIPT[st.phase].progress ? SCRIPT[st.phase].progress(this) : 0);
    const w = WEIGHTS[st.phaseIndex] || WEIGHTS[0];
    st.missionProgress = clamp01(w.start + (w.end - w.start) * st.phaseProgress);
    this._journey(dt);
    this._cabin(dt);
  }

  _resetCommands() {
    const c = this.gc;
    c.hold = false; c.cap = undefined; c.capFn = null; c.stopAtEnd = false; c.stopDecel = 0.45; c.amax = 0.5; c.bmax = 1.0;
    c.jerk = 0.4; c.gain = 1.0; c.aExternal = null; c.aMinBrake = null; c.liftFrac = 0; c.joints = 0; c.bump = 0.002;
    const a = this.ac;
    a.bank = 0; a.phiMax = 25 * DEG; a.bankWn = undefined; a.rollRate = undefined; a.rollAcc = undefined;
    a.gam = 0; a.gamRate = null; a.nMax = 0.08; a.gamGain = undefined; a.gamTau = undefined;
    a.V = this.air.V; a.Vdot = null; a.accel = 0.6; a.decel = 0.6; a.vGain = undefined; a.vJerk = undefined;
    this.n1Cmd = 0;
    this.autoThrust = false;
    this.turbScript = 0;
  }

  // ===================================================================================== air data
  _airData() {
    const st = this.state, ad = this.ad;
    const h = this.mode === 'air' ? this.air.y : st.position.y;
    isaInto(h, ad);
    const mix = st.region === 'arrival' ? 1 : st.region === 'enroute' ? 0.5 : 0;
    windInto(h, mix, _wind);
    ad.wx = _wind.wx; ad.wz = _wind.wz;
    let tas;
    if (this.mode === 'air') tas = this.air.V;
    else {
      const g = this.ground, hd = g.heading * DEG;
      const headwind = -(ad.wx * Math.sin(hd) - ad.wz * Math.cos(hd));
      const vFwd = g.path && g.path.reverse ? -g.v : g.v;
      tas = Math.max(0, vFwd + headwind * smoothstep(0.5, 6, Math.abs(g.v)));
    }
    ad.tas = tas;
    ad.mach = tas / ad.a;
    ad.iasKt = iasFromTas(tas, ad.rho) / KT;
    ad.q = 0.5 * ad.rho * tas * tas;
    ad.mass = lerp(AERO.massTakeoff, AERO.massLanding, clamp01(st.routeProgress));
    ad.W = ad.mass * G;
    st.windDir = _wind.dir; st.windSpeed = _wind.speed;
  }

  /** Angle of attack from the load factor the trajectory demands (lift = n·W). */
  _alpha(dt) {
    const a = this.air, ad = this.ad, st = this.state;
    const n = (Math.cos(a.gam) + a.V * a.gamRate / G) / Math.max(0.5, Math.cos(a.bank.x));
    const q = 0.5 * ad.rho * a.V * a.V;
    const CL = n * ad.W / Math.max(1, q * AERO.S);
    const target = clamp(alphaFor(CL, st.flapsDeg, a.V / ad.a, st.spoilers), -2, 14) * DEG;
    this.alpha = damp(this.alpha, target, 8, dt);
  }

  // ===================================================================================== actuators
  _actuators(dt) {
    const st = this.state, c = this.cfg;
    // trailing-edge flaps: hydraulic, slow at the small detents
    const fx = c.flapsSt.x, ext = c.flapsLever > fx;
    const base = fx < 5 || (fx <= 5.01 && !ext) ? 0.38 : fx < 15 || (fx <= 15.01 && !ext) ? 1.4 : fx < 30 ? 2.0 : 1.4;
    follow(c.flapsSt, c.flapsLever, dt, 2.2, base * (ext ? 1 : 0.9), 1.2);
    if (Math.abs(c.flapsSt.x - c.flapsLever) < 0.002 && Math.abs(c.flapsSt.v) < 0.01) { c.flapsSt.x = c.flapsLever; c.flapsSt.v = 0; }
    st.flapsDeg = clamp(c.flapsSt.x, 0, 40);
    st.flaps = st.flapsDeg / 40;
    // leading-edge slats: extend first, retract last
    const slT = c.flapsLever > 0 || st.flapsDeg > 0.3 ? (c.flapsLever >= 30 ? 1 : 0.6) : 0;
    follow(c.slatsSt, slT, dt, 3, 0.35, 1.0);
    st.slats = clamp01(c.slatsSt.x);
    // gear (doors open first; nose doors stay open with the gear down)
    if (c.gearDown) {
      st.gearDoorsOpen = approach(st.gearDoorsOpen, 1, 0.9 * dt);
      if (st.gearDoorsOpen > 0.95) follow(c.gearSt, 1, dt, 1.4, 0.17, 0.25);
    } else {
      follow(c.gearSt, 0, dt, 1.4, 0.16, 0.25);
      if (c.gearSt.x < 0.02) st.gearDoorsOpen = approach(st.gearDoorsOpen, 0, 0.7 * dt);
    }
    st.gear = clamp01(c.gearSt.x);
    // spoilers: in-flight speedbrake or ground spoilers
    const spT = c.groundSpoilers ? 1 : c.speedbrake;
    const spRate = spT > st.spoilers ? (c.groundSpoilers ? 1.4 : 0.45) : 0.4;
    st.spoilers = approach(st.spoilers, spT, spRate * dt);
    st.speedbrakeArmed = !c.groundSpoilers && c.gearDown && this.mode === 'air' && (st.phase === 'approach' || st.phase === 'landing');
    st.reverser = approach(st.reverser, c.reverser ? 1 : 0, (c.reverser ? 0.55 : 0.45) * dt);
  }

  _engines(dt) {
    const st = this.state, ad = this.ad;
    const air = this.mode === 'air';
    let idle = GROUND_IDLE_N1;
    if (air) idle = Math.max(23 + 10 * clamp01(this.air.y / 11000), st.flapsDeg >= 14 || this.cfg.gearDown ? 29 : 0);
    let target = this.n1Cmd;
    if (this.autoThrust && air) {
      const a = this.air;
      const q = 0.5 * ad.rho * a.V * a.V;
      const n = Math.cos(a.gam) / Math.max(0.5, Math.cos(a.bank.x));
      const CL = n * ad.W / Math.max(1, q * AERO.S);
      const drag = q * AERO.S * cdFor(CL, st.flapsDeg, st.gear, st.spoilers, false);
      const T = drag + ad.mass * (G * Math.sin(a.gam) + a.Vdot);
      target = n1ForThrust(T, ad.rho, ad.mach);
      if (target < idle) target = idle;
      this.atN1 = damp(this.atN1, target, 0.7, dt);
      target = this.atN1;
    } else {
      if (!(target > idle)) target = idle;
      this.atN1 = damp(this.atN1, Math.max(target, idle), 2, dt);
    }
    this.eng.setTarget(Math.min(target, 97));
    this.eng.step(dt, { ambientC: ad.T - 273.15, rho: ad.rho, idleN1: idle });
    const lever = clamp01((target - idle) / (95 - idle));
    st.thrust = damp(st.thrust, this.cfg.reverser ? Math.max(lever, 0.05) : lever, 3, dt);
    // APU off once both engines are stable (departure side)
    if (st.apuRunning && this.eng.allRunning() && st.phaseIndex <= 4) {
      this.apuOffT += dt;
      if (this.apuOffT > 25) this.setApu(false);
    } else this.apuOffT = 0;
  }

  _turbulence(dt) {
    const st = this.state;
    let I = 0;
    if (this.mode === 'air') {
      const chop = 0.022 + 0.018 * (0.5 + 0.5 * noise1(st.simTime / 37 + 4.2));
      I = this.turbScript + (st.inCloud || 0) * 0.3 + chop;
      if (st.phase === 'landing') I *= smoothstep(1, 12, this.wheelHeight());
    }
    this.turbI = damp(this.turbI, clamp01(I), 1.2, dt);
    this.pert.step(dt, this.turbI);
  }

  // ===================================================================================== pose
  _groundHeightAt(x, z) {
    let h = 0;
    try { const v = this.app.world?.groundHeight?.(x, z); if (Number.isFinite(v)) h = v; } catch { h = 0; }
    return clamp(h, 0, 0.6);
  }
  _nearAirport(x, z) {
    const d = this.depOrigin, a = this.arrOrigin;
    const near = (o) => x - o.x > -2800 && x - o.x < 2600 && z - o.z > -1200 && z - o.z < 800;
    return near(d) || near(a);
  }
  /** Main-wheel height above the surface below (runway, terrain or sea). */
  wheelHeight() {
    if (this.mode === 'ground') return 0;
    return this.air.y - this.gRef - originAboveContact(this.state.pitch, STRUT_EXT);
  }

  _compose(dt) {
    const st = this.state, P = this.pert;
    let x, y, z;
    const vel = this._vel;
    this.hdgResid *= Math.exp(-dt / 1.1);
    if (this.mode === 'ground') {
      const g = this.ground;
      this.gh = damp(this.gh, this._groundHeightAt(g.x, g.z), 8, dt);
      this.gRef = this.gh;
      x = g.x; z = g.z; y = this.gh + g.height();
      const rough = st.runwayRumble;
      const pitch = g.theta + g.pitchS.x + rough * 0.0006 * noise1(g.s * 0.37 + 3.1);
      const roll = g.rollS.x + rough * 0.0009 * noise1(g.s * 0.29 + 8.4);
      _e.set(pitch, -(g.heading + this.hdgResid) * DEG, -roll, 'YXZ');
      _q.setFromEuler(_e);
      const th = g.travelHeading * DEG;
      vel.set(g.v * Math.sin(th), g.heightRate(), -g.v * Math.cos(th));
      st.nosewheelSteer = g.steer;
      st.wheelRpm = g.wheelRpm();
      this.wheelRpm = st.wheelRpm;
      if (g.bumpCount !== this._lastBumps) { this._lastBumps = g.bumpCount; st.bumpCount++; this.bumpPulse = 1; }
    } else {
      const a = this.air;
      x = a.x; y = a.y; z = a.z;
      // surface below: runway/apron near the airports, terrain or sea elsewhere (sampled at 4 Hz)
      this.terrainT -= dt;
      if (this._nearAirport(x, z)) this.gRef = this._groundHeightAt(x, z);
      else {
        if (this.terrainT <= 0) {
          this.terrainT = 0.25;
          let h = 0;
          try { h = GEO.terrainHeight(x, z, this.depOrigin, this.arrOrigin); } catch { h = 0; }
          this.terrain = Math.max(0, Number.isFinite(h) ? h : 0);
        }
        this.gRef = this.terrain;
      }
      _e.set(a.gam, -(a.psi + a.decrab) - this.hdgResid * DEG, -a.bank.x, 'YXZ');
      _q.setFromEuler(_e);
      _q2.setFromAxisAngle(_axX, this.alpha);
      _q.multiply(_q2);
      vel.set(a.vx, a.vy, a.vz);
      st.nosewheelSteer = damp(st.nosewheelSteer, 0, 1.5, dt);
      this.wheelRpm = damp(this.wheelRpm, 0, st.gear < 0.95 ? 1.6 : 0.35, dt);
      st.wheelRpm = this.wheelRpm;
    }
    // turbulence: heave (world up), sway (horizontal, body right), small attitude excursions
    y += P.heave.x; vel.y += P.heave.v;
    const yaw = this.mode === 'ground' ? -(this.ground.heading + this.hdgResid) * DEG : -(this.air.psi + this.air.decrab);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);   // body +X projected (yaw about +Y)
    x += rx * P.side.x; z += rz * P.side.x; vel.x += rx * P.side.v; vel.z += rz * P.side.v;
    if (P.roll !== 0 || P.pitch !== 0 || P.yaw !== 0) {
      _e.set(P.pitch, -P.yaw, -P.roll, 'YXZ');
      _q3.setFromEuler(_e);
      _q.multiply(_q3);
    }
    st.position.set(x, y, z);
    st.quaternion.copy(_q);
    st.velocity.copy(vel);
    _e.setFromQuaternion(_q, 'YXZ');
    st.pitch = _e.x;
    st.roll = -_e.z;
    st.heading = wrap360(-_e.y / DEG);
    st.onGround = this.mode === 'ground';
    st.altitude = y;
    st.altitudeAGL = this.mode === 'ground' ? y - this.gh : y - this.gRef;
    st.groundSpeed = Math.hypot(vel.x, vel.z);
    st.verticalSpeed = vel.y;
    st.airspeed = iasFromTas(this.ad.tas, this.ad.rho);
    st.mach = this.ad.mach;
    st.outsideTempC = this.ad.T - 273.15;
    // control surfaces (cosmetic, for the exterior)
    if (this.mode === 'air') {
      const b = this.air.bank;
      st.aileron = clamp(0.3 * b.a / (3.5 * DEG) + 0.4 * b.v / (3.2 * DEG) - 4 * P.roll, -1, 1);
      st.elevator = clamp(this.air.gamRate / (0.08 * G / Math.max(this.air.V, 40)) * 0.35, -1, 1);
      st.rudder = clamp(this.air.decrabV / (2.5 * DEG) * 0.6, -1, 1);
    } else {
      st.aileron = damp(st.aileron, 0, 2, dt); st.elevator = damp(st.elevator, 0, 2, dt);
      st.rudder = damp(st.rudder, 0, 2, dt);
    }
    st.brakes = this.mode === 'ground' ? (this.gc.hold ? 1 : clamp01(-this.ground.a / 2.6)) : 0;
  }

  _feel(dt) {
    const st = this.state;
    if (!this._feelInit) {
      this._prevVel.copy(this._vel); this._qPrev.copy(st.quaternion);
      this._acc.set(0, 0, 0); this._omega.set(0, 0, 0);
      this._feelInit = true;
    }
    _v.copy(this._vel).sub(this._prevVel).divideScalar(Math.max(dt, 1e-4));
    const k = 1 - Math.exp(-16 * dt);
    this._acc.lerp(_v, k);
    st.acceleration.copy(this._acc);
    // specific force (accelerometer) in aircraft axes, g
    _q2.copy(st.quaternion).invert();
    _v2.copy(this._acc); _v2.y += G;
    _v2.applyQuaternion(_q2).divideScalar(G);
    st.gForce.copy(_v2);
    // angular velocity (aircraft axes) from the attitude change
    _q3.copy(this._qPrev).invert().multiply(st.quaternion);
    if (_q3.w < 0) { _q3.x = -_q3.x; _q3.y = -_q3.y; _q3.z = -_q3.z; _q3.w = -_q3.w; }
    _v.set(_q3.x, _q3.y, _q3.z).multiplyScalar(2 / Math.max(dt, 1e-4));
    this._omega.lerp(_v, 1 - Math.exp(-20 * dt));
    st.angularVelocity.copy(this._omega);
    this._prevVel.copy(this._vel);
    this._qPrev.copy(st.quaternion);
    // vibration / rumble / buffet
    const onG = this.mode === 'ground';
    const gv = onG ? this.ground.v : 0;
    this.bumpPulse *= Math.exp(-dt * 22);
    let vib = st.apuRunning ? 0.02 : 0;
    for (const e of st.engines) vib += (e.running ? 0.022 : 0) + 0.2 * Math.pow(Math.max(0, e.n1) / 100, 2.5);
    const onRunway = st.phase === 'takeoff' || st.phase === 'landing';
    const rumble = onG ? clamp01(smoothstep(0.05, 2.5, gv) * (0.12 + 0.88 * smoothstep(2, 80, gv)) * (onRunway ? 1 : 0.82) + 0.25 * this.bumpPulse) : 0;
    let buffet;
    if (!onG) buffet = 0.6 * st.spoilers + (st.gear > 0.02 && st.gear < 0.98 ? 0.3 : 0) + 0.12 * st.gear + 0.05 * st.flaps;
    else buffet = 0.25 * st.spoilers * smoothstep(10, 60, gv) + 0.35 * st.reverser * smoothstep(15, 60, gv);
    st.runwayRumble = rumble;
    st.buffet = clamp01(buffet);
    st.turbulence = clamp01(this.turbI);
    st.vibration = clamp01(vib + 0.35 * rumble + 0.3 * st.buffet + 0.3 * st.turbulence);
  }
  _resetFeel() { this._feelInit = false; }

  // ===================================================================================== journey / cabin
  _journey(dt) {
    const st = this.state, ph = st.phase, p = st.phaseProgress;
    let PT = phaseValue(PRESENTED_H, ph, p);
    if (ph === 'arrived') PT += st.phaseTime / 3600;
    const rf = phaseValue(ROUTE_FRACTION, ph, p);
    st.routeProgress = rf;
    st.routeDistanceKm = ROUTE_KM;
    st.distanceFlownKm = rf * ROUTE_KM;
    st.distanceToGoKm = (1 - rf) * ROUTE_KM;
    st.timeToGoSec = Math.max(0, (LANDING_H - Math.max(PT, TAKEOFF_H)) * 3600);
    greatCircle(ROUTE_GEO.origin.lat, ROUTE_GEO.origin.lon, ROUTE_GEO.dest.lat, ROUTE_GEO.dest.lon, rf, _gc);
    st.mapLat = _gc.lat; st.mapLon = _gc.lon; st.mapBearing = _gc.bearing;
    // sun clock
    const dbg = this.app.debug?.tod;
    const fixed = Number.isFinite(dbg) ? dbg : FIXED_TOD[this.setting('timeOfDay')];
    let tod;
    if (fixed != null) tod = fixed;
    else { tod = phaseValue(SUN_CLOCK, ph, p); if (ph === 'arrived') tod += st.phaseTime / 3600; }
    if (this.todSnap || Math.abs(tod - st.timeOfDay) > 0.08) { st.timeOfDay = tod; this.todSnap = false; }
    else st.timeOfDay = damp(st.timeOfDay, tod, 1.5, dt);
    const shift = fixed != null ? fixed - SUN_CLOCK.pushback[0] : 0;
    const civil = (((PUSHBACK_CIVIL + PT + shift) % 24) + 24) % 24;
    st.localTimeOrigin = civil;
    st.localTimeDestination = civil;
  }

  _cabin(dt) {
    const c = this.state.cabin, m = LIGHT_MODES[c.lightsMode] || LIGHT_MODES.bright;
    c.lightLevel = damp(c.lightLevel, m.level, 0.6, dt);
    c.moodColor.lerp(m.color, 1 - Math.exp(-0.6 * dt));
    const L = this.state.lights;
    L.nav = true;
    L.logo = this.sunElev < 14 || this.state.timeOfDay > 18 || this.state.timeOfDay < 7;
    L.wing = this.sunElev < -1 && (this.mode === 'ground' ? this.ground.v > 0.5 : this.state.altitude < 3000);
  }

  // ===================================================================================== events & config
  emit(name, payload) { if (!this.silent) this.app.events?.emit?.(name, payload); }
  once(key, cond) { if (cond && !this.fired.has(key)) { this.fired.add(key); return true; } return false; }
  setting(k) { try { return this.app.settings?.get?.(k); } catch { return undefined; } }
  announce(id, opts) { return this.ann.request(id, opts); }
  get arrOrigin() { return this.app.world?.arrivalOrigin || { x: ARRIVAL.origin[0], y: 0, z: ARRIVAL.origin[2] }; }
  setArrivalOrigin({ x, z }) {
    const w = this.app.world;
    if (w?.setArrivalOrigin) w.setArrivalOrigin(new THREE.Vector3(x, 0, z));
    else if (w?.arrivalOrigin) w.arrivalOrigin.set(x, 0, z);
  }

  setPhase(id) {
    const st = this.state, prev = st.phase;
    st.phase = id;
    st.phaseIndex = phaseIndex(id);
    st.phaseTime = 0;
    st.phaseProgress = 0;
    this.pd = {};
    this.fired.clear();
    SCRIPT[id].enter?.(this);
    this.emit('flight:phase', { phase: id, prev });
  }

  setFlaps(deg) { if (this.cfg.flapsLever !== deg) { this.cfg.flapsLever = deg; this.emit('flight:flaps', { deg }); } }
  setGear(down) { if (this.cfg.gearDown !== down) { this.cfg.gearDown = down; this.emit('flight:gear', { down }); } }
  setSpeedbrake(x) {
    if (this.cfg.speedbrake !== x) { this.cfg.speedbrake = x; this.emit('flight:spoilers', { deployed: x > 0.02, amount: x, ground: false }); }
  }
  setGroundSpoilers(on) {
    if (this.cfg.groundSpoilers !== on) { this.cfg.groundSpoilers = on; this.emit('flight:spoilers', { deployed: on, amount: on ? 1 : 0, ground: true }); }
  }
  setReverser(on) { if (this.cfg.reverser !== on) { this.cfg.reverser = on; this.emit('flight:reverse', { on }); } }
  setThrust(mode, level) { if (this.thrustMode !== mode) { this.thrustMode = mode; this.emit('flight:thrust', { mode, level }); } }
  startEngine(i) { if (this.eng.start(i)) this.emit('flight:engineStart', { engine: i }); }
  shutdownEngines() {
    for (let i = 0; i < this.state.engines.length; i++) if (this.eng.shutdown(i)) this.emit('flight:engineShutdown', { engine: i });
    this.setThrust('shutdown', 0);
  }
  setApu(on) { if (this.state.apuRunning !== on) { this.state.apuRunning = on; this.emit('flight:apu', { running: on }); } }
  setSeatbelt(on, chime = true) {
    const c = this.state.cabin;
    if (c.seatbelt === on) return;
    c.seatbelt = on;
    this.emit('cabin:seatbelt', { on });
    if (chime) this.emit('cabin:chime', { type: 'seatbelt' });
  }
  setLightsMode(mode) { const c = this.state.cabin; if (c.lightsMode !== mode) { c.lightsMode = mode; this.emit('cabin:lights', { mode }); } }
  setDoors(closed) { const c = this.state.cabin; if (c.doorsClosed !== closed) { c.doorsClosed = closed; this.emit('flight:doors', { closed }); } }
  setBridge(connected, airport) {
    const c = this.state.cabin;
    if (c.bridgeConnected !== connected) { c.bridgeConnected = connected; this.emit('flight:bridge', { connected, airport }); }
  }
  setArmed(v) { this.state.cabin.doorsArmed = v; }
  setMusic(v) { this.state.cabin.boardingMusic = v; }

  /** Taxi thrust: a short breakaway burst to get rolling (and out of slow turns), idle otherwise. */
  groundThrust(wantMove) {
    const g = this.ground;
    if (!wantMove) { this.n1Cmd = 0; return; }
    this.n1Cmd = g.a > 0.06 && g.v < 4.5 ? 30 + 5 * (1 - clamp01(g.v / 4.5)) : 0;
  }

  // ===================================================================================== handovers
  liftoff() {
    const g = this.ground, a = this.air, st = this.state, ad = this.ad;
    a.x = g.x; a.z = g.z; a.y = this.gh + g.height();
    a.V = Math.max(40, ad.tas);
    a.gam = Math.asin(clamp(g.heightRate() / a.V, -0.05, 0.05));
    a.gamRate = 0; a.Vdot = g.a;
    a.psi = g.heading * DEG;
    a.bank.x = 0; a.bank.v = 0; a.bank.a = 0;
    a.windK = 0; a.decrab = 0; a.decrabV = 0;
    a.wx = ad.wx; a.wz = ad.wz;
    a.groundVelocity();
    this.alpha = g.theta - a.gam;
    this.hdgResid = 0;
    this.mode = 'air';
    st.onGround = false;
    this.emit('flight:liftoff', {});
  }

  touchdown() {
    const a = this.air, st = this.state, g = this.ground, A = this.arrOrigin;
    const sink = -(a.vy + this.pert.heave.v);
    const lx = a.x - A.x, lz = a.z - A.z;
    this._buildArrivalPath(lx, lz);
    g.setPath(this.paths.arrival, A, 0);
    const bodyHdg = wrap360((a.psi + a.decrab) / DEG);
    g.v = a.gs; g.a = clamp(a.Vdot, -2, 0.5);
    g.theta = Math.max(0, st.pitch); g.thetaV = 0;
    g.heave.x = STRUT_EXT; g.heave.v = -Math.max(0, sink);
    g.pitchS.x = 0; g.pitchS.v = 0;
    g.rollS.x = clamp(st.roll, -0.03, 0.03); g.rollS.v = 0;
    g._pose();
    const ex = this.paths.exitStart, re = this.paths.rolloutEnd;
    g.buildProfile({ vmax: (s) => (s < ex ? 90 : s < re ? 16 : 10), alat: 0.12 * G, decel: 2.0 });
    this.hdgResid = wrap180(bodyHdg - g.heading);
    this.mode = 'ground';
    st.onGround = true;
    this.pert.heave.x *= 0.2; this.pert.heave.v *= 0.2;
    const intensity = clamp01((sink - 0.3) / 2.4);
    this.emit('flight:touchdown', { verticalSpeed: sink, intensity });
  }

  // ===================================================================================== paths & anchors
  _buildDeparturePaths() {
    const D = DEPARTURE;
    return {
      push: preparePath(buildPath(D.pushback.points, D.pushback.filletRadius, { reverse: true }), true),
      taxiOut: preparePath(buildPath(D.taxiOut.points, D.taxiOut.filletRadius), false),
      lineUp: preparePath(buildPath(D.lineUp.points, D.lineUp.filletRadius), false),
      runway: preparePath(buildPath([D.lineUp.takeoffStart, [RUNWAY.x1, 0]], 0), false),
      arrival: null, rolloutEnd: 0, exitStart: 0,
    };
  }
  _buildArrivalPath(tdx, tdz) {
    const R = ARRIVAL.rollout, TI = ARRIVAL.taxiIn;
    const roll = buildPath([[tdx, tdz], ...R.points.slice(1)], R.filletRadius);
    const taxi = buildPath(TI.points, TI.filletRadius);
    this.paths.arrival = preparePath(concatPaths(roll, taxi), false);
    this.paths.rolloutEnd = roll.length;
    let exitS = roll.length * 0.5;
    for (const p of roll.samples) if (Math.abs(wrap180(p.heading - 90)) > 0.5) { exitS = p.s; break; }
    this.paths.exitStart = exitS;
  }

  _resetCommon() {
    const g = this.ground, a = this.air;
    this.pert.reset();
    this.turbI = 0; this.turbScript = 0; this.hdgResid = 0;
    this.descentRequested = false; this.shortCruise = false;
    this.autoThrust = false; this.n1Cmd = 0;
    g.v = 0; g.a = 0; g.theta = 0; g.thetaV = 0; g.steer = 0;
    g.pitchS.x = g.pitchS.v = 0; g.rollS.x = g.rollS.v = 0; g.heave.x = g.heave.v = 0;
    a.decrab = 0; a.decrabV = 0; a.bank.x = a.bank.v = a.bank.a = 0; a.gamRate = 0; a.Vdot = 0; a.windK = 1;
    this.bumpPulse = 0; this.apuOffT = 0;
    this.thrustMode = 'off';
    this.todSnap = true;
    this._feelInit = false;
  }
  _snapConfig(flaps, gearDown) {
    const c = this.cfg, st = this.state;
    c.flapsLever = flaps; c.flapsSt.x = flaps; c.flapsSt.v = 0;
    st.flapsDeg = flaps; st.flaps = flaps / 40;
    st.slats = flaps === 0 ? 0 : flaps >= 30 ? 1 : 0.6; c.slatsSt.x = st.slats; c.slatsSt.v = 0;
    c.gearDown = gearDown; c.gearSt.x = gearDown ? 1 : 0; c.gearSt.v = 0;
    st.gear = gearDown ? 1 : 0; st.gearDoorsOpen = gearDown ? 1 : 0;
    c.speedbrake = 0; c.groundSpoilers = false; st.spoilers = 0; st.speedbrakeArmed = false;
    c.reverser = false; st.reverser = 0;
  }
  _setLights(o) {
    const L = this.state.lights;
    L.beacon = !!o.beacon; L.strobe = !!o.strobe; L.nav = true; L.landing = !!o.landing; L.taxi = !!o.taxi;
    L.runwayTurnoff = !!o.turnoff; L.wing = false;
  }
  _setCabin(o) {
    const c = this.state.cabin;
    c.seatbelt = o.seatbelt; c.noSmoking = true;
    c.lightsMode = o.lights; c.doorsArmed = o.armed; c.doorsClosed = o.closed; c.bridgeConnected = o.bridge;
    c.boardingMusic = o.music; c.announcement = null;
    const m = LIGHT_MODES[o.lights] || LIGHT_MODES.bright;
    c.lightLevel = m.level; c.moodColor.copy(m.color);
  }
  _lowSun() { return this.sunElev < 12 || this.state.timeOfDay > 18.2; }
  _ambient(h) { isaInto(h, this.ad); return this.ad.T - 273.15; }

  anchorGround(kind) {
    const st = this.state;
    this._resetCommon();
    this.mode = 'ground'; st.onGround = true; st.region = 'departure';
    const P = this.paths;
    const path = { gate: P.push, pushback: P.push, taxi_out: P.taxiOut, lineup: P.lineUp, takeoff: P.runway }[kind];
    this.ground.setPath(path, this.depOrigin, 0);
    const atGate = kind === 'gate' || kind === 'pushback';
    this._snapConfig(kind === 'lineup' || kind === 'takeoff' ? 5 : 0, true);
    if (atGate) { this.eng.snap('off', this._ambient(3)); st.apuRunning = true; }
    else { this.eng.snap('idle', this._ambient(3)); st.apuRunning = false; }
    this._setLights({
      beacon: kind !== 'gate', strobe: kind === 'takeoff', landing: kind === 'takeoff',
      taxi: kind === 'taxi_out' || kind === 'lineup' || kind === 'takeoff', turnoff: kind === 'takeoff',
    });
    this._setCabin({
      seatbelt: true, lights: kind === 'gate' ? 'boarding' : ((kind === 'lineup' || kind === 'takeoff') && this._lowSun() ? 'dim' : 'bright'),
      armed: !atGate, closed: kind !== 'gate', bridge: kind === 'gate', music: kind === 'gate',
    });
    this._compose(0);
  }

  anchorCruise() {
    const st = this.state;
    const keep = this.mode === 'air' && (st.phase === 'climb' || st.phase === 'cruise' || st.phase === 'descent');
    const x = keep ? this.air.x : 95000, z = keep ? this.air.z : 4600;
    this._resetCommon();
    this.mode = 'air'; st.onGround = false; st.region = 'enroute';
    const a = this.air;
    a.x = x; a.z = z; a.y = FL360;
    this._initAir(tasFor(300, FL360, 0.78), 90);
    this._snapConfig(0, false);
    this.eng.snap(82, this._ambient(FL360), this.ad.rho);
    this.atN1 = 82;
    st.apuRunning = false;
    this._setLights({ beacon: true, strobe: true });
    this._setCabin({ seatbelt: false, lights: 'cruise', armed: true, closed: true, bridge: false, music: false });
    this._compose(0);
  }

  anchorApproach() {
    const st = this.state, A = this.arrOrigin;
    this._resetCommon();
    this.mode = 'air'; st.onGround = false; st.region = 'arrival';
    this.plan = planApproach(A, 21000);
    const a = this.air;
    a.x = A.x + THR_X - 21000; a.z = A.z; a.y = 2800 * FT;
    this._initAir(tasFor(210, a.y), 90);
    this._snapConfig(1, false);
    this.eng.snap(52, this._ambient(a.y), this.ad.rho);
    this.atN1 = 52;
    st.apuRunning = false;
    this._setLights({ beacon: true, strobe: true, landing: true, turnoff: true });
    this._setCabin({ seatbelt: true, lights: 'dim', armed: true, closed: true, bridge: false, music: false });
    this._compose(0);
  }

  anchorTaxiIn() {
    const st = this.state, A = this.arrOrigin;
    this._resetCommon();
    this.mode = 'ground'; st.onGround = true; st.region = 'arrival';
    this._buildArrivalPath(ARRIVAL.approach.touchdownX, 0);
    this.ground.setPath(this.paths.arrival, A, this.paths.rolloutEnd);
    this.ground.v = 8;
    this._snapConfig(0, true);
    this.eng.snap('idle', this._ambient(3));
    st.apuRunning = false;
    this._setLights({ beacon: true, taxi: true, turnoff: true });
    this._setCabin({ seatbelt: true, lights: 'dim', armed: true, closed: true, bridge: false, music: false });
    this._compose(0);
  }

  anchorArrived() {
    const st = this.state, A = this.arrOrigin;
    this._resetCommon();
    this.mode = 'ground'; st.onGround = true; st.region = 'arrival';
    this._buildArrivalPath(ARRIVAL.approach.touchdownX, 0);
    this.ground.setPath(this.paths.arrival, A, this.paths.arrival.length);
    this._snapConfig(0, true);
    this.eng.snap('off', this._ambient(3));
    st.apuRunning = true;
    this._setLights({});
    this._setCabin({ seatbelt: false, lights: 'boarding', armed: false, closed: false, bridge: true, music: true });
    this._compose(0);
  }

  /** Steady air state: TAS V, ground track `track` (deg), wings level, wind-corrected heading. */
  _initAir(V, track) {
    const a = this.air, st = this.state;
    isaInto(a.y, this.ad);
    windInto(a.y, st.region === 'arrival' ? 1 : st.region === 'enroute' ? 0.5 : 0, _wind);
    a.wx = _wind.wx; a.wz = _wind.wz; a.windK = 1;
    a.V = V; a.Vdot = 0; a.gam = 0; a.gamRate = 0;
    a.bank.x = a.bank.v = a.bank.a = 0;
    // heading that cancels the cross-track wind component for the requested track
    const tr = track * DEG;
    const cross = -_wind.wx * Math.cos(tr) - _wind.wz * Math.sin(tr);   // wind component to the left of track
    a.psi = tr + Math.asin(clamp(cross / V, -0.3, 0.3));
    a.groundVelocity();
    const q = 0.5 * this.ad.rho * V * V;
    this.alpha = clamp(alphaFor(this.ad.W / (q * AERO.S), this.state.flapsDeg, V / this.ad.a, 0), -2, 12) * DEG;
  }

  // ===================================================================================== public control
  jumpTo(id, progress = 0) {
    if (!SCRIPT[id]) return false;
    let p = clamp01(Number(progress) || 0);
    const wasSilent = this.silent;
    this.silent = true;
    const hadAnn = this.ann.cancel();
    try {
      const anchor = ANCHOR_OF[id];
      SCRIPT[anchor].anchor(this);
      this.setPhase(anchor);
      const target = phaseIndex(id);
      if (target === 0 && this.pd.end == null) p = Math.min(p, 0.78);
      let guard = 0;
      while (guard++ < 60000) {
        const st = this.state, cur = st.phaseIndex;
        if (cur > target) break;
        if (cur === target && st.phaseProgress >= p - 1e-6) break;
        if (cur === target && st.phaseTime > 4000) break;
        if (st.phase === 'gate' && target > 0) this.pd.end = Math.min(this.pd.end ?? Infinity, st.phaseTime + 0.05);
        if (st.phase === 'cruise' && target > phaseIndex('cruise')) this.descentRequested = true;
        this._advance(0.1);
      }
    } catch (e) {
      console.error('[flight] jumpTo failed', e);
    } finally {
      this.silent = wasSilent;
    }
    this.todSnap = true;
    this._journey(0);
    this._resetFeel();
    this._feel(SUB);
    if (hadAnn) this.emit('cabin:announceCancel', {});
    this.syncEvents(true);
    return true;
  }

  skipTo(id) {
    if (!SCRIPT[id]) return false;
    this._startFade(() => { this.jumpTo(id, 0); this.emit('flight:skip', { to: id }); });
    return true;
  }

  restart() {
    this._startFade(() => {
      const A = this.arrOrigin, d = ARRIVAL.origin;
      if (A.x !== d[0] || A.z !== d[2]) this.setArrivalOrigin({ x: d[0], z: d[2] });
      this.plan = null;
      this.state.simTime = 0;
      this.jumpTo('gate', 0);
      this.emit('flight:restart', { to: 'gate' });
    });
    return true;
  }

  beginDeparture() {
    const st = this.state;
    if (st.phase !== 'gate') return false;
    const t = st.phaseTime, pd = this.pd;
    if (pd.end == null || pd.end - t > 80) pd.end = t + 80;
    return true;
  }

  beginDescent() {
    const st = this.state, i = st.phaseIndex;
    if (st.phase === 'cruise') { this.descentRequested = true; return true; }
    if (i < phaseIndex('cruise')) { this.shortCruise = true; return true; }
    return false;
  }

  _startFade(action) {
    const pipe = this.app.pipeline;
    if (!pipe || typeof pipe.fade !== 'number') { action(); return; }
    if (this.fade && this.fade.stage === 'out') { this.fade.action = action; return; }
    this.fade = { stage: 'out', t: 0, action, from: this.fade ? pipe.fade : (pipe.fade || 0) };
  }
  _updateFade(dt) {
    const f = this.fade;
    if (!f) return;
    const pipe = this.app.pipeline;
    f.t += Math.min(dt || 0, 0.1);
    if (f.stage === 'out') {
      pipe.fade = lerp(f.from, 1, smoothstep(0, 1, f.t / 0.5));
      if (f.t >= 0.5) {
        pipe.fade = 1;
        try { f.action(); } catch (e) { console.error('[flight] skip failed', e); }
        f.stage = 'hold'; f.t = 0;
      }
    } else if (f.stage === 'hold') {
      pipe.fade = 1;
      if (f.t >= 0.3) { f.stage = 'in'; f.t = 0; }
    } else {
      pipe.fade = 1 - smoothstep(0, 1, f.t / 0.7);
      if (f.t >= 0.7) { pipe.fade = 0; this.fade = null; }
    }
  }

  /** Re-emit the current configuration (after a jump / at app:ready) so listeners can snap to it. */
  syncEvents(instant = true) {
    const st = this.state, c = st.cabin;
    const e = (n, p) => this.emit(n, { ...p, instant });
    e('flight:phase', { phase: st.phase, prev: null });
    e('flight:doors', { closed: c.doorsClosed });
    e('flight:bridge', { connected: c.bridgeConnected, airport: st.region === 'arrival' ? 'arrival' : 'departure' });
    e('flight:gear', { down: this.cfg.gearDown });
    e('flight:flaps', { deg: this.cfg.flapsLever });
    e('flight:spoilers', { deployed: this.cfg.groundSpoilers || this.cfg.speedbrake > 0.02, amount: this.cfg.groundSpoilers ? 1 : this.cfg.speedbrake, ground: this.cfg.groundSpoilers });
    e('flight:reverse', { on: this.cfg.reverser });
    e('flight:apu', { running: st.apuRunning });
    e('flight:thrust', { mode: this.thrustMode, level: st.thrust });
    e('flight:turbulence', { level: this.turbI });
    e('cabin:seatbelt', { on: c.seatbelt });
    e('cabin:lights', { mode: c.lightsMode });
  }

  // ===================================================================================== info
  timeline() { return WEIGHTS.map((w) => ({ ...w })); }
  phaseLabel(id = this.state.phase) { const p = PHASES.find((x) => x.id === id); return p ? p.label : id; }

  getStatusText() {
    const st = this.state, metric = this.setting('units') === 'metric';
    const alt = (m) => (metric ? `${Math.round(m / 10) * 10} m` : `${(Math.round(m / FT / 100) * 100).toLocaleString('en-US')} ft`);
    const spd = (ias) => (metric ? `${Math.round(ias * 3.6)} km/h` : `${Math.round(ias / KT)} kt`);
    const gs = (v) => (metric ? `${Math.round(v * 3.6)} km/h` : `${Math.round(v * 2.23694)} mph`);
    const fl = (m) => `FL${Math.round(m / FT / 100).toString().padStart(3, '0')}`;
    switch (st.phase) {
      case 'gate': return `Boarding at gate ${DEPARTURE.ownGate} · ${DEPARTURE.city}`;
      case 'pushback': return `Pushing back from gate ${DEPARTURE.ownGate} · starting engines`;
      case 'taxi_out': return this.pd.hold != null ? 'Holding short of runway 09' : 'Taxiing to runway 09';
      case 'lineup': return 'Lining up on runway 09';
      case 'takeoff': return st.onGround ? `Takeoff roll · ${spd(st.airspeed)}` : `Climbing out · ${spd(st.airspeed)}`;
      case 'climb': return `Climbing through ${st.altitude > 5500 ? fl(st.altitude) : alt(st.altitude)} · ${spd(st.airspeed)}`;
      case 'cruise': return `Cruising at ${alt(st.altitude)} · Mach ${st.mach.toFixed(2)} · ${gs(st.groundSpeed)}`;
      case 'descent': return `Descending through ${st.altitude > 5500 ? fl(st.altitude) : alt(st.altitude)} · ${spd(st.airspeed)}`;
      case 'approach': return `Final approach runway 09 · ${alt(Math.max(0, st.altitudeAGL))} · ${spd(st.airspeed)}`;
      case 'landing': return st.onGround ? `Landing roll · ${spd(st.groundSpeed)}` : `Landing runway 09 · ${spd(st.airspeed)}`;
      case 'taxi_in': return this.pd.park != null ? `Arriving at gate ${ARRIVAL.ownGate}` : `Taxiing to gate ${ARRIVAL.ownGate}`;
      case 'arrived': return `Arrived at gate ${ARRIVAL.ownGate} · ${ARRIVAL.city}`;
      default: return this.phaseLabel();
    }
  }

  api() {
    const d = this;
    return {
      state: d.state,
      phases: PHASES,
      director: d,
      get phase() { return d.state.phase; },
      skipTo: (id) => d.skipTo(id),
      restart: () => d.restart(),
      beginDeparture: () => d.beginDeparture(),
      beginDescent: () => d.beginDescent(),
      jumpTo: (id, p) => d.jumpTo(id, p),
      timeline: () => d.timeline(),
      phaseLabel: (id) => d.phaseLabel(id),
      getStatusText: () => d.getStatusText(),
      /** HUD helpers */
      isWaitingForDeparture: () => d.state.phase === 'gate' && d.pd.end == null,
      canBeginDescent: () => d.state.phase === 'cruise' || (d.state.phaseIndex < phaseIndex('cruise') && !d.shortCruise),
      get skipping() { return !!d.fade; },
    };
  }
}

export async function init(app) {
  const d = new Director(app);
  const api = d.api();
  app.flight = api;
  // initial pose: boot jump (debug) or the gate
  const dbg = app.debug || {};
  let jumped = false;
  if (dbg.phase && SCRIPT[dbg.phase]) {
    try { jumped = d.jumpTo(dbg.phase, dbg.progress ?? 0); } catch (e) { console.error('[flight] debug jump failed', e); }
  }
  if (!jumped) d.jumpTo('gate', 0);
  app.addUpdate((dt) => d.frame(dt), 10, 'flight');
  app.events?.on?.('app:ready', () => d.syncEvents(true));
  return api;
}
