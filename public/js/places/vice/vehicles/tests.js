// Scripted handling tests for the vehicles (loaded on demand by __vc.vtest):
// each one spawns vehicles, drives them with held controls by ticking the
// game, and returns numbers. Not used by the game itself.
import * as THREE from 'three';
import { V } from '../state.js';
import { step, groundProbe } from './physics.js';

const tick = (n = 1) => { for (let i = 0; i < n; i++) window.game.tick(1 / 30); };
const r1 = (x) => Math.round(x * 10) / 10;

/** Body roll (+ = leaning right) and pitch (+ = nose up), degrees. */
function rollOf(v) {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(v.quat), fw = new THREE.Vector3(0, 0, 1).applyQuaternion(v.quat);
  const rh = new THREE.Vector3(-fw.z, 0, fw.x).normalize();
  return Math.asin(Math.max(-1, Math.min(1, up.dot(rh)))) * 57.3;
}
function pitchOf(v) { const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(v.quat); return Math.asin(Math.max(-1, Math.min(1, fw.y))) * 57.3; }

function fresh(type, x, z, h, o = {}) {
  const sys = V.vehicles;
  const v = sys.spawn(type, x, z, h, o);
  v.engineOn = true; v.parked = false; v.wake();
  v.enter({ isPlayer: false, test: true }, 0);
  v.focus = !window.__lo; // full substeps wherever the camera is (window.__lo: test the cheap path traffic gets)
  return v;
}
function hold(v, c) { Object.assign(v.ctl, { throttle: 0, brake: 0, steer: 0, handbrake: false, up: 0, yaw: 0 }, c); }
function done(v) { V.vehicles.remove(v); }

export const TESTS = {
  /** 0-60, 0-100, top speed, braking 100-0 on Washington Ave (northbound). */
  accel(type = 'sedan', x = 2440, z = 1000) {
    const v = fresh(type, x, z, Math.PI);
    tick(10);
    hold(v, { throttle: 1 });
    let t = 0, t60 = null, t100 = null, top = 0, topAt = 0, gears = [];
    while (t < 40) {
      tick(); t += 1 / 30;
      if (t60 == null && v.speed >= 60) t60 = r1(t);
      if (t100 == null && v.speed >= 100) t100 = r1(t);
      if (v.speed > top + 0.2) { top = v.speed; topAt = t; } else if (t - topAt > 3) break;
      if (gears[gears.length - 1] !== v.gear) gears.push(v.gear);
      if (v.pos.z < -2900) break;
    }
    const topT = r1(t);
    // brake from whatever speed down to 0 (and from 100: measured on a second run)
    done(v);
    const b = fresh(type, x, z, Math.PI);
    tick(5);
    b.vel.copy(b._fw).multiplyScalar(100);
    hold(b, { brake: 1 });
    const z0 = b.pos.z; let bt = 0;
    do { tick(); bt += 1 / 30; } while (b.speed > 0.5 && bt < 15);
    const dist = Math.abs(b.pos.z - z0);
    const res = { type, t60, t100, top: r1(top), topT: r1(topAt), gears: gears.join(''), brake100: r1(dist), brakeT: r1(bt), y: r1(b.pos.y), pitch: r1(pitchOf(b)) };
    done(b);
    return res;
  },

  /** Steady state at a speed with full lock: radius, lateral g, body roll. */
  turn(type = 'sedan', speed = 30, steer = 1, x = -3700, z = -2500) {
    const v = fresh(type, x, z, Math.PI);
    tick(5);
    v.vel.copy(v._fw).multiplyScalar(speed);
    let t = 0, roll = 0, rate = 0;
    hold(v, { steer, throttle: 0.2 });
    while (t < 4) {
      // cruise control on the throttle
      v.ctl.throttle = Math.max(0, Math.min(1, (speed - v.speed) * 0.2 + 0.25));
      tick(); t += 1 / 30;
      if (t > 2.5) { rate += v.angVel.y; roll += rollOf(v); }
    }
    const n = 1.5 * 30;
    const w = rate / n;
    const res = { type, speed: r1(v.speed), yawRate: r1(w * 100) / 100, radius: r1(Math.abs(v.speed / w)), latG: r1(Math.abs(v.speed * w) / 9.81 * 0.33 * 10) / 10, rollDeg: r1(roll / n), skid: r1(v.skid * 100) / 100 };
    done(v);
    return res;
  },

  /** Handbrake turn at speed: how far the car rotates and how much it slides. */
  handbrake(type = 'sedan', speed = 70, x = -3700, z = -2500) {
    const v = fresh(type, x, z, Math.PI);
    tick(5);
    v.vel.copy(v._fw).multiplyScalar(speed);
    const h0 = v.heading;
    hold(v, { steer: 1, handbrake: true, throttle: 0 });
    tick(24);
    const mid = v.heading, slipMid = Math.atan2(v.vel.dot(new THREE.Vector3(1, 0, 0).applyQuaternion(v.quat)), v.vel.dot(v._fw));
    hold(v, { steer: -0.3, throttle: 0.6 });
    tick(30);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const res = { type, rotated: r1(wrap(mid - h0) * 57.3), slipDeg: r1(slipMid * 57.3), after: r1(wrap(v.heading - h0) * 57.3), speed: r1(v.speed), maxSkid: r1(v.skid * 100) / 100, upright: v.quat.y !== undefined && new THREE.Vector3(0, 1, 0).applyQuaternion(v.quat).y > 0.8 };
    done(v);
    return res;
  },

  /** Drive into a wall at a speed: bounce, damage, no tunnelling. */
  crash(type = 'sedan', speed = 60, x = 2440, z = 600) {
    const wall = V.phys.add(x, 3 + 20, z - 150, 60, 20, 4, 0, 'concrete', { building: true, test: true });
    const v = fresh(type, x, z, Math.PI);
    tick(5);
    v.vel.copy(v._fw).multiplyScalar(speed);
    let minZ = Infinity, t = 0, peakDv = 0;
    const off = V.events.on('vehicle:crash', (e) => { if (e.veh === v) peakDv = Math.max(peakDv, e.speed); });
    hold(v, { throttle: 1 });
    while (t < 4) { tick(); t += 1 / 30; minZ = Math.min(minZ, v.pos.z + v.def.hull.z0 * -1 * 0); }
    off();
    const front = v.pos.z - v.def.hull.z1; // heading north: the nose is at -z
    const res = { type, speed, health: Math.round(v.health), tunnelled: v.pos.z < z - 150, nose: r1(front - (z - 150 + 4)), backSpeed: r1(v.speed), peakDv: r1(peakDv), burning: v.burning, y: r1(v.pos.y) };
    V.phys.remove(wall);
    done(v);
    return res;
  },

  /** Two cars head-on at a speed each. */
  headon(a = 'sedan', b = 'sedan', speed = 50, x = 2440, z = 600) {
    const A = fresh(a, x + 3, z, Math.PI), B = fresh(b, x - 3, z - 120, 0);
    tick(5);
    A.vel.copy(A._fw).multiplyScalar(speed); B.vel.copy(B._fw).multiplyScalar(speed);
    hold(A, { throttle: 0.3 }); hold(B, { throttle: 0.3 });
    tick(90);
    const res = { a: [Math.round(A.health), r1(A.speed), r1(A.angVel.y)], b: [Math.round(B.health), r1(B.speed), r1(B.angVel.y)], gap: r1(Math.hypot(A.pos.x - B.pos.x, A.pos.z - B.pos.z)) };
    done(A); done(B);
    return res;
  },

  /** Drop from a height with forward speed: the landing. */
  drop(type = 'sedan', h = 30, speed = 60, x = 2440, z = 600) {
    const v = fresh(type, x, z, Math.PI, { y: 3 + h });
    v.vel.copy(v._fw).multiplyScalar(speed);
    hold(v, { throttle: 0.5 });
    let t = 0, land = null, minY = Infinity, maxBounce = 0, wasAir = true;
    while (t < 4) {
      tick(); t += 1 / 30;
      minY = Math.min(minY, v.pos.y);
      if (wasAir && v.contacts > 0 && land == null) land = r1(t);
      if (land != null && v.vel.y > maxBounce) maxBounce = v.vel.y;
    }
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(v.quat);
    const res = { type, land, minY: r1(minY), y: r1(v.pos.y), bounce: r1(maxBounce), upright: r1(up.y * 100) / 100, health: Math.round(v.health), speed: r1(v.speed) };
    done(v);
    return res;
  },

  /** A bike: launch, lean in a turn, and a crash into a wall that throws the rider. */
  bike(type = 'motorbike', x = -3700, z = -2500) {
    const v = fresh(type, x, z, Math.PI);
    tick(10);
    const settle = { roll: r1(rollOf(v)), y: r1(v.pos.y) };
    hold(v, { throttle: 1 });
    let t = 0, t60 = null;
    while (t < 6) { tick(); t += 1 / 30; if (t60 == null && v.speed > 60) t60 = r1(t); }
    const sp = r1(v.speed);
    hold(v, { throttle: 0.6, steer: 0.6 });
    let lean = 0;
    for (let i = 0; i < 60; i++) { tick(); if (i > 30) lean += rollOf(v); }
    const turn = { speed: r1(v.speed), leanDeg: r1(lean / 29), yawRate: r1(v.angVel.y * 100) / 100 };
    // into a wall
    let ejected = null;
    const off = V.events.on('vehicle:eject', (e) => { if (e.veh === v) ejected = r1(e.vel.length()); });
    const ahead = v.pos.clone().addScaledVector(v._fw, 60);
    const wall = V.phys.add(ahead.x, 20, ahead.z, 30, 17, 3, v.heading, 'concrete', { test: true });
    hold(v, { throttle: 1 });
    tick(60);
    off(); V.phys.remove(wall);
    const res = { type, settle, t60, speed6s: sp, turn, ejected, health: Math.round(v.health), driverAfter: !!v.driver };
    done(v);
    return res;
  },

  /** A boat across the bay: top speed, planing attitude, staying afloat. */
  boat(type = 'speedboat', x = 2000, z = 2400) {
    const v = fresh(type, x, z, -Math.PI / 2); // heading west
    tick(30);
    const rest = { y: r1(v.pos.y * 10) / 10, pitch: r1(pitchOf(v)), water: r1(v.inWater * 100) / 100 };
    hold(v, { throttle: 1 });
    let t = 0, pitchMax = 0, t60 = null;
    while (t < 12) { tick(); t += 1 / 30; const p = pitchOf(v); if (p > pitchMax) pitchMax = p; if (t60 == null && v.speed > 60) t60 = r1(t); }
    const fast = { speed: r1(v.speed), y: r1(v.pos.y * 10) / 10, pitch: r1(pitchOf(v)), bowUpMax: r1(pitchMax), t60, x: Math.round(v.pos.x) };
    hold(v, { throttle: 0.8, steer: 1 });
    tick(60);
    const turn = { speed: r1(v.speed), yawRate: r1(v.angVel.y * 100) / 100, roll: r1(rollOf(v)) };
    const res = { type, rest, fast, turn, alive: !v.dead && !v.drowned };
    done(v);
    return res;
  },

  /** Helicopter: spool up, climb, hover, fly forward, come down on a roof. */
  heli(type = 'policeheli', x = 1000, z = -1380) {
    const v = fresh(type, x, z, Math.PI / 2);
    v.rotor = 0;
    tick(5);
    hold(v, { up: 0 });
    let t = 0, lift = null;
    while (t < 8) { tick(); t += 1 / 30; if (lift == null && v.alt > 1) lift = r1(t); }
    hold(v, { up: 1 });
    tick(90);
    const climb = { alt: r1(v.alt), vy: r1(v.vel.y), y: r1(v.pos.y) };
    hold(v, { up: 0 });
    tick(30);
    const y0 = v.pos.y;
    tick(90);
    const hover = { drift: r1(v.pos.y - y0), vy: r1(v.vel.y), speed: r1(v.vel.length()) };
    hold(v, { throttle: 1 });
    tick(150);
    const fwd = { speed: r1(v.vel.length()), pitch: r1(pitchOf(v)), y: r1(v.pos.y) };
    hold(v, { throttle: -1 });
    tick(90);
    // find a roof nearby and land on it
    let roof = null;
    // a roof with open sky above it
    V.phys.query(-400, -1300, 400, -500, (b) => {
      if (!b.building || b.hx < 16 || b.hz < 16) return;
      const top = b.y + b.hy;
      if (top < 60 || top > 300 || (roof && top < roof.y + roof.hy)) return;
      const h = V.phys.ray(b.x, 1200, b.z, 0, -1, 0, 1300);
      if (h && h.box === b) roof = b;
    });
    let land = null;
    if (roof) {
      const top = roof.y + roof.hy;
      v.com.set(roof.x, top + 30, roof.z); v.vel.set(0, 0, 0); v.angVel.set(0, 0, 0);
      hold(v, { up: -0.6 });
      let tt = 0;
      while (tt < 10) { tick(); tt += 1 / 30; if (v.alt < 0.5 && Math.abs(v.vel.y) < 1) break; }
      hold(v, { up: -1 });
      tick(60);
      land = { roofTop: r1(top), y: r1(v.pos.y), alt: r1(v.alt), t: r1(tt), health: Math.round(v.health), dead: v.dead };
    }
    const res = { type, lift, climb, hover, fwd, land };
    done(v);
    return res;
  },

  /** Plane: takeoff roll on the airfield, rotate, climb. */
  plane(x = -3800, z = -1250) {
    const v = fresh('plane', x, z, Math.PI);
    tick(20);
    const rest = { y: r1(v.pos.y * 10) / 10, pitch: r1(pitchOf(v)), contacts: v.contacts };
    hold(v, { throttle: 1 });
    let t = 0, rot = null, off = null;
    while (t < 25) {
      tick(); t += 1 / 30;
      if (v.speed > 78 && rot == null) { rot = r1(t); v.ctl.up = 0.5; }
      if (off == null && v.contacts === 0 && v.alt > 3) off = { t: r1(t), speed: r1(v.speed), dist: Math.round(z - v.pos.z) };
      if (off && t > off.t + 1.2) v.ctl.up = 0;
    }
    const res = { rest, rot, off, after: { alt: r1(v.alt), speed: r1(v.speed), pitch: r1(pitchOf(v)), stall: v.stall, dead: v.dead } };
    // a bank and a turn
    hold(v, { throttle: 0.8, steer: 1, up: 0 });
    tick(20);
    const bank = r1(rollOf(v));
    hold(v, { throttle: 0.8, steer: 0, up: 0.6 });
    tick(60);
    res.turn = { bank, yawRate: r1(v.angVel.y * 100) / 100, alt: r1(v.alt), speed: r1(v.speed), dead: v.dead };
    done(v);
    return res;
  },

  /** Many cars driving at once: physics ms per frame. */
  perf(n = 40, x = 2440, z = 800) {
    const vs = [];
    for (let i = 0; i < n; i++) {
      const v = fresh(i % 3 ? 'sedan' : i % 2 ? 'suv' : 'taxi', x - 18 + (i % 4) * 12, z - Math.floor(i / 4) * 30, Math.PI);
      v.vel.copy(v._fw).multiplyScalar(30);
      hold(v, { throttle: 0.6, steer: ((i % 5) - 2) * 0.05 });
      vs.push(v);
    }
    tick(15);
    const t0 = performance.now();
    let phys = 0;
    for (let i = 0; i < 60; i++) { const a = performance.now(); V.vehicles.update(1 / 60); phys += performance.now() - a; }
    const res = { n, msPerFrame60: r1((phys / 60) * 100) / 100, steps: V.vehicles.stats.steps, wall: r1(performance.now() - t0) };
    for (const v of vs) done(v);
    return res;
  },
};

/** Where the time goes: physics steps, pairs, after-step work, drawing (ms per 60 Hz frame). */
TESTS.perfParts = (n = 40, x = 2440, z = 800) => {
  const vs = [];
  for (let i = 0; i < n; i++) {
    const v = fresh(i % 3 ? 'sedan' : 'suv', x - 18 + (i % 4) * 12, z - Math.floor(i / 4) * 30, Math.PI);
    v.vel.copy(v._fw).multiplyScalar(30);
    hold(v, { throttle: 0.6 });
    vs.push(v);
  }
  tick(10);
  const S = V.vehicles, R = 60, h = 1 / 120;
  const time = (fn) => { const a = performance.now(); for (let i = 0; i < R; i++) fn(); return r1(((performance.now() - a) / R) * 100) / 100; };
  const res = {
    n,
    step2: time(() => { for (const v of vs) { step(v, h); step(v, h); } }),
    probe: time(() => { for (const v of vs) for (let k = 0; k < 8; k++) groundProbe(v.pos.x + k, v.pos.y + 2, v.pos.z, 0.35, v.box); }),
    pairs: time(() => { S.findPairs(vs, 1 / 60); const pr = S._pairs; for (let i = 0; i < pr.length; i += 2) S.pair(pr[i], pr[i + 1], h); }),
    after: time(() => { for (const v of vs) S.afterStep(v, 1 / 60); }),
    draw: time(() => S.drawAll(1 / 60, 0, V.world.camera.position)),
    update: time(() => S.update(1 / 60)),
  };
  for (const v of vs) done(v);
  return res;
};

export function runTest(name, ...a) {
  const prev = V.freeCam, dbg = V.vehicles.debug;
  V.vehicles.debug = null;
  try { return TESTS[name](...a); } finally { V.freeCam = prev; V.vehicles.debug = dbg; }
}
