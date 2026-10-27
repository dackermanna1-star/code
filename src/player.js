// First-person controller: circle-vs-box collision with iterative push-out (so
// it slides along walls and around clutter instead of snagging), step-up onto
// stairs, gravity, crouch, sprint, a climbable ladder and subtle head bob.
import * as THREE from 'three';
import { FLOORS, ci, cj, CELL, GX0, GZ0 } from './plan.js';

const RADIUS = 0.3;
const STAND_H = 1.75;
const CROUCH_H = 1.05;
const EYE_STAND = 1.62;
const EYE_CROUCH = 0.92;
const STEP_UP = 0.45;
const WALK = 1.85;
const SPRINT = 3.5;
const CROUCH_SPEED = 0.95;
const GRAVITY = 17;
const CLIMB = 1.5;

const _near = [];

export class Player {
  constructor(level, doors) {
    this.level = level;
    this.doors = doors;
    const s = level.start;
    this.pos = new THREE.Vector3(s.x, s.y, s.z);
    this.vel = new THREE.Vector3();
    this.yaw = s.yaw;
    this.pitch = 0;
    this.crouched = false;
    this.crouchT = 0;
    this.height = STAND_H;
    this.onGround = true;
    this.ladder = null;
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.camYOffset = 0; // smooths stair steps
    this.landDip = 0;
    this.stepAccum = 0;
    this.climbAccum = 0;
    this.lastSurface = 'tile';
    this.events = []; // {type:'step'|'land'|'ladder', ...}
    this.blockedByLow = 0;
  }

  get eyeHeight() {
    return EYE_STAND + (EYE_CROUCH - EYE_STAND) * this.crouchT;
  }

  toggleCrouch() {
    if (this.crouched) {
      if (this.fits(this.pos.x, this.pos.z, this.pos.y, STAND_H)) this.crouched = false;
    } else this.crouched = true;
  }

  // Can a body of height h stand here?
  fits(x, z, feet, h) {
    const p = { x, z };
    return !this.overlaps(p, feet, h);
  }

  overlaps(p, feet, h) {
    const y0 = feet + 0.3, y1 = feet + h;
    const L = this.level;
    for (const k of FLOORS) {
      const g = L.grid(k);
      if (y1 <= g.base || y0 >= g.base + 4) continue;
      const i0 = ci(p.x - RADIUS), i1 = ci(p.x + RADIUS), j0 = cj(p.z - RADIUS), j1 = cj(p.z + RADIUS);
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          if (!g.blocks(i, j, y0, y1)) continue;
          const bx0 = GX0 + i * CELL, bz0 = GZ0 + j * CELL;
          if (circleBoxDepth(p.x, p.z, RADIUS - 0.02, bx0, bz0, bx0 + CELL, bz0 + CELL)) return true;
        }
    }
    L.collidersNear(p.x, p.z, _near);
    for (const c of _near) if (c.y1 > y0 && c.y0 < y1 && circleBoxDepth(p.x, p.z, RADIUS - 0.02, c.x0, c.z0, c.x1, c.z1)) return true;
    return false;
  }

  // Push the body circle out of every blocking cell/collider.
  resolve(p, feet, h) {
    const y0 = feet + 0.3, y1 = feet + h;
    const L = this.level;
    let lowBlock = false;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const k of FLOORS) {
        const g = L.grid(k);
        if (y1 <= g.base || y0 >= g.base + 4) continue;
        const i0 = ci(p.x - RADIUS), i1 = ci(p.x + RADIUS), j0 = cj(p.z - RADIUS), j1 = cj(p.z + RADIUS);
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            if (!g.blocks(i, j, y0, y1)) continue;
            const bx0 = GX0 + i * CELL, bz0 = GZ0 + j * CELL;
            if (pushOut(p, RADIUS, bx0, bz0, bx0 + CELL, bz0 + CELL)) moved = true;
          }
      }
      L.collidersNear(p.x, p.z, _near);
      for (const c of _near) {
        if (c.y1 <= y0 || c.y0 >= y1) continue;
        if (pushOut(p, RADIUS, c.x0, c.z0, c.x1, c.z1)) {
          moved = true;
          if (c.tag === 'crouch') lowBlock = true;
        }
      }
      for (const c of this.doors.colliders) {
        if (c.off || c.y1 <= y0 || c.y0 >= y1) continue;
        if (Math.abs(c.x0 - p.x) > 2 || Math.abs(c.z0 - p.z) > 2) continue;
        if (pushOut(p, RADIUS, c.x0, c.z0, c.x1, c.z1)) moved = true;
      }
      if (!moved) break;
    }
    if (lowBlock) this.blockedByLow = 1.5;
  }

  ladderAt(x, z, feet) {
    for (const l of this.level.ladders) {
      if (x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1 && feet >= l.y0 - 0.2 && feet <= l.y1) return l;
    }
    return null;
  }

  update(dt, input) {
    this.events.length = 0;
    const L = this.level;
    // crouch blend
    const targetC = this.crouched ? 1 : 0;
    this.crouchT += (targetC - this.crouchT) * Math.min(1, dt * 9);
    this.height = STAND_H + (CROUCH_H - STAND_H) * this.crouchT;
    if (this.blockedByLow > 0) this.blockedByLow -= dt;

    // wish direction
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let wx = fx * input.fwd + rx * input.strafe;
    let wz = fz * input.fwd + rz * input.strafe;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }
    const sprinting = input.sprint && !this.crouched && input.fwd > 0 && !this.ladder;
    const speed = this.crouched ? CROUCH_SPEED : sprinting ? SPRINT : WALK;

    // ------------------------------------------------------------- ladder
    let lad = this.ladder || this.ladderAt(this.pos.x, this.pos.z, this.pos.y);
    if (lad && !this.ladder) {
      const into = -lad.nx * wx + -lad.nz * wz;
      if (!this.onGround || (input.fwd > 0 && into > 0.5)) {
        this.ladder = lad;
        this.vel.set(0, 0, 0);
      }
    }
    if (this.ladder) {
      this.updateLadder(dt, input, wx, wz);
      this.updateBob(dt, 0);
      return;
    }

    // ------------------------------------------------------------ walking
    const accel = this.onGround ? 11 : 2;
    const tx = wx * speed, tz = wz * speed;
    this.vel.x += (tx - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (tz - this.vel.z) * Math.min(1, dt * accel);

    const p = { x: this.pos.x, z: this.pos.z };
    const total = Math.hypot(this.vel.x * dt, this.vel.z * dt);
    const steps = Math.max(1, Math.ceil(total / 0.08));
    for (let s = 0; s < steps; s++) {
      p.x += (this.vel.x * dt) / steps;
      p.z += (this.vel.z * dt) / steps;
      this.resolve(p, this.pos.y, this.height);
    }
    // ledge check: don't let the body step onto something too high
    const g = L.groundAt(p.x, p.z, this.pos.y + STEP_UP);
    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.x = p.x;
    this.pos.z = p.z;
    const movedDist = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
    // keep velocity consistent with the slide
    if (dt > 0) {
      this.vel.x = (this.pos.x - prevX) / dt;
      this.vel.z = (this.pos.z - prevZ) / dt;
    }

    // ------------------------------------------------------------ vertical
    const wasGround = this.onGround;
    if (this.onGround && g <= this.pos.y + 0.001 && this.pos.y - g < STEP_UP + 0.05) {
      // stick to ramps / small drops
      const dy = g - this.pos.y;
      this.pos.y = g;
      this.camYOffset -= dy;
      this.vel.y = 0;
    } else if (g > this.pos.y) {
      // step up
      const dy = g - this.pos.y;
      this.pos.y = g;
      this.camYOffset -= dy;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
      this.vel.y -= GRAVITY * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= g) {
        const impact = -this.vel.y;
        this.pos.y = g;
        this.vel.y = 0;
        this.onGround = true;
        this.landDip = Math.min(0.45, impact * 0.035);
        this.events.push({ type: 'land', impact, surface: this.surface() });
      }
    }
    if (!wasGround && this.onGround) this.stepAccum = 0;
    this.camYOffset *= Math.exp(-dt * 14);
    if (Math.abs(this.camYOffset) > 0.6) this.camYOffset = Math.sign(this.camYOffset) * 0.6;

    // footsteps follow distance travelled
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && movedDist > 0.0005) {
      this.stepAccum += movedDist;
      const stride = this.crouched ? 0.55 : sprinting ? 0.95 : 0.72;
      if (this.stepAccum >= stride) {
        this.stepAccum -= stride;
        this.events.push({ type: 'step', surface: this.surface(), speed: Math.min(1, hs / SPRINT), crouch: this.crouched });
      }
    }
    this.updateBob(dt, this.onGround ? hs : 0, sprinting);
  }

  updateLadder(dt, input, wx, wz) {
    const l = this.ladder;
    const L = this.level;
    const ix = -l.nx, iz = -l.nz; // toward the wall
    const toward = wx * ix + wz * iz;
    let climb = 0;
    if (Math.abs(input.fwd) > 0.1 || Math.abs(input.strafe) > 0.1) {
      if (toward > 0.3) climb = this.pitch < -0.5 ? -1 : 1;
      else if (toward < -0.3) climb = -1;
    }
    if (input.jump) {
      // let go
      this.ladder = null;
      this.onGround = false;
      this.vel.set(l.nx * 1.5, 0, l.nz * 1.5);
      return;
    }
    const groundHere = L.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.05);
    let ny = this.pos.y + climb * CLIMB * dt;
    ny = Math.min(ny, l.y1 - 1.1);
    if (ny < groundHere) ny = groundHere;
    const dyc = Math.abs(ny - this.pos.y);
    this.pos.y = ny;
    this.climbAccum += dyc;
    if (this.climbAccum > 0.32) {
      this.climbAccum = 0;
      this.events.push({ type: 'ladder' });
    }
    // lateral / exit movement: strip the into-wall component, and the
    // away component too unless stepping off at the bottom
    const atBottom = this.pos.y <= groundHere + 0.02;
    let mx = wx, mz = wz;
    if (toward > 0 || !atBottom) {
      mx -= ix * toward;
      mz -= iz * toward;
    }
    const p = { x: this.pos.x + mx * 1.4 * dt, z: this.pos.z + mz * 1.4 * dt };
    // exiting the zone is only allowed onto solid footing
    const inZone = p.x >= l.x0 && p.x <= l.x1 && p.z >= l.z0 && p.z <= l.z1;
    if (!inZone) {
      const g = L.groundAt(p.x, p.z, this.pos.y + STEP_UP);
      if (g > this.pos.y - 0.6 && g > -1e8) {
        this.resolve(p, this.pos.y, this.height);
        this.pos.x = p.x;
        this.pos.z = p.z;
        this.pos.y = Math.max(this.pos.y, g);
        this.ladder = null;
        this.onGround = true;
        this.vel.set(0, 0, 0);
        return;
      }
      p.x = Math.min(l.x1, Math.max(l.x0, p.x));
      p.z = Math.min(l.z1, Math.max(l.z0, p.z));
    }
    this.resolve(p, this.pos.y, this.height);
    this.pos.x = p.x;
    this.pos.z = p.z;
    this.onGround = false;
    this.vel.set(0, 0, 0);
  }

  updateBob(dt, hs, sprinting = false) {
    const moving = hs > 0.2;
    const target = moving ? (this.crouched ? 0.018 : sprinting ? 0.05 : 0.032) : 0;
    this.bobAmp += (target - this.bobAmp) * Math.min(1, dt * 6);
    if (moving) this.bobPhase += dt * hs * (sprinting ? 4.0 : 4.6);
    this.landDip *= Math.exp(-dt * 7);
  }

  // Footstep material under the player.
  surface() {
    const L = this.level;
    const p = this.pos;
    for (const z of L.zones) {
      if (Math.abs(z.y - p.y) > 1) continue;
      const dx = z.x - p.x, dz = z.z - p.z;
      if (dx * dx + dz * dz < z.r * z.r) return z.surface;
    }
    L.groundAt(p.x, p.z, p.y + 0.05);
    const s = L._lastSurf;
    if (s) return s.zone || 'concrete';
    const room = L.roomAtPos(p.x, p.y + 0.1, p.z);
    return room ? room.surface : 'concrete';
  }

  // Camera transform
  applyCamera(cam) {
    const bobY = Math.abs(Math.sin(this.bobPhase)) * this.bobAmp * 1.6 - this.bobAmp * 0.8;
    const bobX = Math.sin(this.bobPhase) * this.bobAmp * 0.5;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    cam.position.set(
      this.pos.x + rx * bobX,
      this.pos.y + this.eyeHeight + bobY + this.camYOffset - this.landDip,
      this.pos.z + rz * bobX,
    );
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw;
    cam.rotation.x = this.pitch;
    cam.rotation.z = Math.sin(this.bobPhase) * this.bobAmp * 0.12;
  }
}

function circleBoxDepth(px, pz, r, x0, z0, x1, z1) {
  const nx = Math.max(x0, Math.min(px, x1));
  const nz = Math.max(z0, Math.min(pz, z1));
  const dx = px - nx, dz = pz - nz;
  return dx * dx + dz * dz < r * r;
}

function pushOut(p, r, x0, z0, x1, z1) {
  const nx = Math.max(x0, Math.min(p.x, x1));
  const nz = Math.max(z0, Math.min(p.z, z1));
  const dx = p.x - nx, dz = p.z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    const k = (r - d) / d;
    p.x += dx * k;
    p.z += dz * k;
  } else {
    // centre inside the box: leave by the shallowest side
    const l = p.x - x0, rr = x1 - p.x, t = p.z - z0, bb = z1 - p.z;
    const m = Math.min(l, rr, t, bb);
    if (m === l) p.x = x0 - r;
    else if (m === rr) p.x = x1 + r;
    else if (m === t) p.z = z0 - r;
    else p.z = z1 + r;
  }
  return true;
}
