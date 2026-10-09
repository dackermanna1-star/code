// Scripted handling tests for the vehicles (loaded on demand by __vc.vtest):
// each one spawns vehicles, drives them with held controls by ticking the
// game, and returns numbers. Not used by the game itself.
import * as THREE from 'three';
import { V } from '../state.js';

const tick = (n = 1) => { for (let i = 0; i < n; i++) window.game.tick(1 / 30); };
const r1 = (x) => Math.round(x * 10) / 10;

function fresh(type, x, z, h, o = {}) {
  const sys = V.vehicles;
  const v = sys.spawn(type, x, z, h, o);
  v.engineOn = true; v.parked = false; v.wake();
  v.enter({ isPlayer: false, test: true }, 0);
  v.focus = true; // full substeps wherever the camera is
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
    const res = { type, t60, t100, top: r1(top), topT: r1(topAt), gears: gears.join(''), brake100: r1(dist), brakeT: r1(bt), y: r1(b.pos.y), pitch: r1(new THREE.Euler().setFromQuaternion(b.quat, 'YXZ').x * 57.3) };
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
      if (t > 2.5) { rate += v.angVel.y; roll += new THREE.Euler().setFromQuaternion(v.quat, 'ZXY').z; }
    }
    const n = 1.5 * 30;
    const w = rate / n;
    const res = { type, speed: r1(v.speed), yawRate: r1(w * 100) / 100, radius: r1(Math.abs(v.speed / w)), latG: r1(Math.abs(v.speed * w) / 9.81 * 0.33 * 10) / 10, rollDeg: r1((roll / n) * 57.3), skid: r1(v.skid * 100) / 100 };
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

export function runTest(name, ...a) {
  const prev = V.freeCam, dbg = V.vehicles.debug;
  V.vehicles.debug = null;
  try { return TESTS[name](...a); } finally { V.freeCam = prev; V.vehicles.debug = dbg; }
}
