import * as THREE from 'three';
import { heightAt, terrainInfo, getOasis, OASIS_CELL } from '../world/heightfield.js';

// First-person walker. Feet follow the exact JavaScript heightfield (identical to the
// rendered terrain). Sand physics: uphill slows you down, slip faces steeper than the
// angle of repose make you slide, feet sink a little into soft sand, water slows you.

const EYE_HEIGHT = 1.68;
const WALK_SPEED = 1.7;
const SPRINT_SPEED = 4.5;
const JUMP_SPEED = 3.7;
const GRAVITY = 9.81;
const REPOSE_SLOPE = 0.62; // tan(~32 deg)
const LOOK_SCALE = 0.0021;

const _v = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

function groundSample(x, z, out) {
  const e = 0.3;
  const h = heightAt(x, z);
  const lee = terrainInfo.lee;
  const oasisMask = terrainInfo.oasisMask;
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  out.h = h;
  out.gx = gx;
  out.gz = gz;
  out.lee = lee;
  out.oasis = oasisMask;
  const o = getOasis(Math.floor(x / OASIS_CELL), Math.floor(z / OASIS_CELL));
  out.water = o ? o.waterLevel : -1e9;
  return out;
}

export class Player {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.feet = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = 0; // compass bearing, radians (0 = north, +pi/2 = east)
    this.pitch = 0;
    this.grounded = true;
    this.stride = 0;
    this.bobWeight = 0;
    this.landY = 0;
    this.landV = 0;
    this.sink = 0.03;
    this.fovKick = 0;
    this.photoMode = false;
    this.colliders = []; // { x, z, r } trunks near the player
    this.ground = { h: 0, gx: 0, gz: 0, lee: 0, oasis: 0, water: -1e9 };
    this.listeners = { step: new Set(), land: new Set(), jump: new Set() };
    this.sliding = 0;
    this.speed = 0;
    this.distanceWalked = 0;
    this.inWater = 0;
  }

  on(event, fn) {
    this.listeners[event].add(fn);
  }

  _emit(event, data) {
    for (const fn of this.listeners[event]) fn(data);
  }

  setPosition(x, z, yawDeg = null, pitchDeg = null) {
    groundSample(x, z, this.ground);
    this.feet.set(x, this.ground.h, z);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.grounded = true;
    if (yawDeg !== null) this.yaw = (yawDeg * Math.PI) / 180;
    if (pitchDeg !== null) this.pitch = (pitchDeg * Math.PI) / 180;
  }

  get headingDeg() {
    return (((this.yaw * 180) / Math.PI) % 360 + 360) % 360;
  }

  update(dt, { sensitivity = 1, invertY = false, headBob = true, fov = 72 } = {}) {
    const input = this.input;
    const look = input.consumeLook(dt);
    this.yaw += look.x * LOOK_SCALE * sensitivity;
    this.pitch -= look.y * LOOK_SCALE * sensitivity * (invertY ? -1 : 1);
    this.pitch = Math.max(-1.53, Math.min(1.53, this.pitch));

    const mv = input.moveVector();
    const fx = Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = Math.sin(this.yaw);

    if (this.photoMode) {
      this._updatePhoto(dt, mv, fx, fz, rx, rz);
    } else {
      this._updateWalk(dt, mv, fx, fz, rx, rz);
    }
    this._updateCamera(dt, headBob, fov);
  }

  _updatePhoto(dt, mv, fx, fz, rx, rz) {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const speed = this.input.sprinting() ? 90 : 14;
    const wish = _v.set(fx * cp * mv.y + rx * mv.x, sp * mv.y + this.input.verticalAxis(), fz * cp * mv.y + rz * mv.x);
    const k = 1 - Math.exp(-dt * 4);
    this.vel.lerp(wish.multiplyScalar(speed), k);
    this.feet.addScaledVector(this.vel, dt);
    groundSample(this.feet.x, this.feet.z, this.ground);
    this.feet.y = Math.max(this.feet.y, this.ground.h + 0.3);
    this.speed = 0;
    this.grounded = false;
  }

  _updateWalk(dt, mv, fx, fz, rx, rz) {
    const g = this.ground;
    groundSample(this.feet.x, this.feet.z, g);
    const slope = Math.hypot(g.gx, g.gz);

    let wx = fx * mv.y + rx * mv.x;
    let wz = fz * mv.y + rz * mv.x;
    const wl = Math.hypot(wx, wz);
    let target = 0;
    if (wl > 1e-3) {
      wx /= wl;
      wz /= wl;
      const uphill = g.gx * wx + g.gz * wz;
      let factor = uphill > 0 ? 1 / (1 + 2.3 * uphill) : 1 + 0.25 * Math.min(-uphill, 0.6);
      const depth = g.water - g.h;
      if (depth > 0) factor *= Math.max(0.3, 1 - depth * 0.55);
      target = (this.input.sprinting() ? SPRINT_SPEED : WALK_SPEED) * Math.min(1, wl) * factor;
    }

    const accel = this.grounded ? 9 : 1.4;
    const k = 1 - Math.exp(-dt * accel);
    this.vel.x += (wx * target - this.vel.x) * k;
    this.vel.z += (wz * target - this.vel.z) * k;

    // Beyond the angle of repose the sand gives way and carries you downhill.
    this.sliding = Math.max(0, slope - REPOSE_SLOPE);
    if (this.grounded && this.sliding > 0) {
      const s = Math.min(this.sliding * 7, 4) * dt;
      this.vel.x -= (g.gx / slope) * s;
      this.vel.z -= (g.gz / slope) * s;
    }

    let nx = this.feet.x + this.vel.x * dt;
    let nz = this.feet.z + this.vel.z * dt;

    // Water deeper than ~1.1 m is a wall; let the player slide along the shore.
    const nh = heightAt(nx, nz);
    if (g.water - nh > 1.1 && g.water - nh > g.water - g.h) {
      nx = this.feet.x;
      nz = this.feet.z;
      this.vel.x *= 0.2;
      this.vel.z *= 0.2;
    }

    for (const c of this.colliders) {
      const dx = nx - c.x;
      const dz = nz - c.z;
      const d = Math.hypot(dx, dz);
      const r = c.r + 0.3;
      if (d < r && d > 1e-4) {
        nx = c.x + (dx / d) * r;
        nz = c.z + (dz / d) * r;
      }
    }

    const moved = Math.hypot(nx - this.feet.x, nz - this.feet.z);
    this.distanceWalked += moved;
    this.feet.x = nx;
    this.feet.z = nz;
    groundSample(nx, nz, g);

    if (this.grounded) {
      if (this.input.consumeJump()) {
        this.grounded = false;
        this.vy = JUMP_SPEED;
        this._emit('jump', { x: nx, z: nz });
      }
    } else {
      this.input.consumeJump();
    }

    if (this.grounded) {
      this.feet.y = g.h;
    } else {
      this.vy -= GRAVITY * dt;
      this.feet.y += this.vy * dt;
      if (this.feet.y <= g.h) {
        const impact = -this.vy;
        this.feet.y = g.h;
        this.vy = 0;
        this.grounded = true;
        this.landV -= Math.min(impact, 8) * 0.06;
        this._emit('land', { x: nx, z: nz, impact, heading: this.yaw, water: g.water - g.h });
      }
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.inWater = Math.max(0, g.water - g.h);
    // Feet sink deeper into loose slip-face sand.
    const sinkTarget = 0.025 + 0.045 * g.lee + (this.inWater > 0 ? 0.0 : 0.0);
    this.sink += (sinkTarget - this.sink) * (1 - Math.exp(-dt * 3));

    // Stride: cadence rises with speed; each whole stride count is a foot strike.
    if (this.grounded && this.speed > 0.25) {
      const cadence = 1.45 + 0.34 * this.speed;
      const before = Math.floor(this.stride);
      this.stride += dt * cadence;
      const after = Math.floor(this.stride);
      if (after !== before) {
        const foot = after & 1;
        const heading = Math.atan2(this.vel.x, -this.vel.z);
        const side = foot ? 0.11 : -0.11;
        this._emit('step', {
          foot,
          x: nx + Math.cos(heading) * side,
          z: nz + Math.sin(heading) * side,
          heading,
          speed: this.speed,
          running: this.speed > 3,
          slope,
          lee: g.lee,
          sliding: this.sliding > 0.02,
          water: this.inWater,
          oasis: g.oasis,
        });
      }
    } else if (this.speed < 0.1) {
      // Settle the stride to a planted stance.
      const frac = this.stride - Math.floor(this.stride);
      this.stride += (frac > 0.5 ? 1 - frac : -frac) * Math.min(1, dt * 4);
    }
  }

  _updateCamera(dt, headBob, fov) {
    const target = this.photoMode ? 0 : Math.min(1, this.speed / 1.6);
    this.bobWeight += (target - this.bobWeight) * (1 - Math.exp(-dt * 6));
    const w = headBob ? this.bobWeight : 0;
    const run = Math.min(1, Math.max(0, (this.speed - 1.7) / 2.8));
    const amp = 0.028 + 0.03 * run;
    const ph = this.stride * Math.PI;
    const bobY = -amp * w * (Math.cos(2 * ph) + 1) * 0.5;
    const bobX = 0.014 * w * Math.sin(ph) * (1 + run);
    const roll = 0.0045 * w * Math.sin(ph) * (1 + run);

    // Landing spring.
    this.landV += (-55 * this.landY - 9 * this.landV) * dt;
    this.landY += this.landV * dt;

    const rx = Math.cos(this.yaw);
    const rz = Math.sin(this.yaw);
    const eye = this.photoMode ? 0 : EYE_HEIGHT - this.sink;
    this.camera.position.set(this.feet.x + rx * bobX, this.feet.y + eye + bobY + this.landY, this.feet.z + rz * bobX);

    // Three.js: yaw about +Y is counter-clockwise; our bearing is clockwise from north.
    _euler.set(this.pitch, -this.yaw, roll, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);

    const kickTarget = this.input.sprinting() && this.speed > 2.5 ? 5 : 0;
    this.fovKick += (kickTarget - this.fovKick) * (1 - Math.exp(-dt * 3));
    const f = fov + this.fovKick;
    if (Math.abs(this.camera.fov - f) > 0.01) {
      this.camera.fov = f;
      this.camera.updateProjectionMatrix();
    }
  }
}
