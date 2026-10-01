// First-person controller: deliberate walking pace, step-up, crouch, ledge climbing, head bob,
// settle-on-stop and slightly heavy turning.
import { PLAYER_R, PLAYER_H, CROUCH_H, EYE_H, CROUCH_EYE, STEP_H, CLIMB_H, LEVEL_H } from '../config.js';
import { clamp, lerp, wrapAngle } from '../core/math.js';

const WALK = 1.55, RUN = 2.85, CROUCH = 0.85;
const EPS = 1e-4;

export class Player {
  constructor(world) {
    this.world = world;
    this.dim = 0;
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;
    this.tyaw = 0; this.tpitch = 0;
    this.turnVel = 0;
    this.onGround = false;
    this.crouched = false;
    this.height = PLAYER_H;
    this.eye = EYE_H;
    this.eyeSmooth = 0;      // offset applied after step-ups, decays to 0
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.lean = 0; this.leanVel = 0;
    this.shake = 0;
    this.surface = 0;
    this.stepDist = 0;
    this.distance = 0;
    this.fallStart = null;
    this.airTime = 0;
    this.climb = null;
    this.sens = 0.0023;
    this.invertY = false;
    this.boxes = [];
    this.onStep = null;
    this.onLand = null;
    this.frozen = false;
    this.lastSafe = null;
  }

  setPos(x, y, z, yaw = this.yaw) {
    this.x = x; this.y = y; this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.yaw = this.tyaw = yaw;
    this.eyeSmooth = 0;
    this.climb = null;
    this.fallStart = null;
  }

  aabb(h = this.height) { return [this.x - PLAYER_R, this.y, this.z - PLAYER_R, this.x + PLAYER_R, this.y + h, this.z + PLAYER_R]; }

  gather(extra = 1.5) {
    const missing = this.world.queryBoxes(this.dim, this.x - PLAYER_R - extra, this.y - extra - 1, this.z - PLAYER_R - extra,
      this.x + PLAYER_R + extra, this.y + PLAYER_H + extra, this.z + PLAYER_R + extra, this.boxes);
    return missing;
  }

  // clip movement d along axis (0 x, 1 y, 2 z) against gathered boxes
  clip(axis, d, h = this.height, px = this.x, py = this.y, pz = this.z) {
    const a = [px - PLAYER_R, py, pz - PLAYER_R], b = [px + PLAYER_R, py + h, pz + PLAYER_R];
    const B = this.boxes;
    const o1 = (axis + 1) % 3, o2 = (axis + 2) % 3;
    let hitSurf = -1;
    for (let k = 0; k < B.length; k += 7) {
      if (B[k + o1] >= b[o1] - EPS || B[k + 3 + o1] <= a[o1] + EPS) continue;
      if (B[k + o2] >= b[o2] - EPS || B[k + 3 + o2] <= a[o2] + EPS) continue;
      if (d > 0) {
        if (b[axis] <= B[k + axis] + EPS) {
          const m = B[k + axis] - b[axis];
          if (m < d) { d = Math.max(0, m); hitSurf = B[k + 6]; }
        }
      } else if (d < 0) {
        if (a[axis] >= B[k + 3 + axis] - EPS) {
          const m = B[k + 3 + axis] - a[axis];
          if (m > d) { d = Math.min(0, m); hitSurf = B[k + 6]; }
        }
      }
    }
    this.lastHitSurf = hitSurf;
    return d;
  }

  overlaps(px, py, pz, h) {
    const B = this.boxes;
    for (let k = 0; k < B.length; k += 7) {
      if (B[k] < px + PLAYER_R - EPS && B[k + 3] > px - PLAYER_R + EPS && B[k + 1] < py + h - EPS && B[k + 4] > py + EPS && B[k + 2] < pz + PLAYER_R - EPS && B[k + 5] > pz - PLAYER_R + EPS) return true;
    }
    return false;
  }

  groundBelow(maxDrop) {
    const d = this.clip(1, -maxDrop);
    return d > -maxDrop + EPS ? -d : null;
  }

  update(dt, inp, opts = {}) {
    if (this.frozen) { this.updateCamera(dt, 0, 0); return; }
    const missing = this.gather();
    // ---------------- look
    const sens = this.sens * (opts.sensMul || 1);
    this.tyaw += inp.lookX * sens;
    this.tpitch -= inp.lookY * sens * (this.invertY ? -1 : 1);
    if (inp.padLookX || inp.padLookY) {
      this.tyaw += (inp.padLookX || 0) * 2.4 * dt;
      this.tpitch -= (inp.padLookY || 0) * 1.8 * dt * (this.invertY ? -1 : 1);
    }
    // keyboard turning: accelerates up to a fixed rate (stiff, tank-like)
    if (inp.turn) this.turnVel = clamp(this.turnVel + inp.turn * 10 * dt, -2.1, 2.1);
    else this.turnVel *= Math.max(0, 1 - 14 * dt);
    this.tyaw += this.turnVel * dt;
    this.tpitch = clamp(this.tpitch, -1.05, 1.05);
    const k = 1 - Math.exp(-dt * 22);
    this.yaw += wrapAngle(this.tyaw - this.yaw) * k;
    this.pitch += (this.tpitch - this.pitch) * k;

    // ---------------- crouch
    if (inp.crouchToggle) this.crouchWanted = !this.crouchWanted;
    const wantCrouch = this.crouchWanted || inp.crouchHold;
    if (wantCrouch && !this.crouched) { this.crouched = true; this.height = CROUCH_H; }
    else if (!wantCrouch && this.crouched) {
      if (!this.overlaps(this.x, this.y + 0.01, this.z, PLAYER_H)) { this.crouched = false; this.height = PLAYER_H; }
    }
    const targetEye = this.crouched ? CROUCH_EYE : EYE_H;
    this.eye += (targetEye - this.eye) * (1 - Math.exp(-dt * 10));

    // ---------------- climbing animation in progress
    if (this.climb) {
      const c = this.climb;
      c.t += dt / c.dur;
      const t = Math.min(1, c.t);
      const up = Math.min(1, t / 0.6), fw = Math.max(0, (t - 0.45) / 0.55);
      this.x = lerp(c.sx, c.ex, fw); this.z = lerp(c.sz, c.ez, fw);
      this.y = lerp(c.sy, c.ey, up * (2 - up));
      this.vx = this.vy = this.vz = 0;
      if (t >= 1) { this.climb = null; this.onGround = true; }
      this.updateCamera(dt, 0.4, 0);
      return;
    }

    // ---------------- horizontal intent
    let mx = inp.mx, mz = inp.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = Math.sin(this.yaw);
    let speed = this.crouched ? CROUCH : inp.run ? RUN : WALK;
    if (this.surface === 7) speed *= 0.6;       // gel
    if (this.surface === 6) speed *= 0.75;      // water
    if (mz < 0) speed *= 0.8;                   // walking backwards is slower
    const wx = (fx * mz + rx * mx) * speed, wz = (fz * mz + rz * mx) * speed;
    const accel = this.onGround ? (ml > 0.05 ? 7.5 : 10) : 1.2;
    const ax = wx - this.vx, az = wz - this.vz;
    const al = Math.hypot(ax, az), maxd = accel * dt;
    if (al > maxd) { this.vx += (ax / al) * maxd; this.vz += (az / al) * maxd; } else { this.vx = wx; this.vz = wz; }

    // ---------------- vertical
    this.vy -= 9.8 * dt;
    if (this.vy < -28) this.vy = -28;
    if (missing && this.onGround) this.vy = Math.max(this.vy, 0); // never fall into unloaded space

    const wasGround = this.onGround;
    const prevVy = this.vy;
    let dy = this.vy * dt;
    const cy = this.clip(1, dy);
    const groundSurf = this.lastHitSurf;
    if (dy < 0 && cy > dy + EPS) { this.onGround = true; this.vy = 0; if (groundSurf >= 0 && groundSurf !== 255) this.surface = groundSurf; }
    else if (dy > 0 && cy < dy - EPS) { this.vy = 0; this.onGround = false; }
    else this.onGround = false;
    this.y += cy;

    // ---------------- horizontal move with step-up
    const dxw = this.vx * dt, dzw = this.vz * dt;
    const ox = this.x, oz = this.z;
    const moved = this.slide(dxw, dzw);
    if ((Math.abs(moved[0] - dxw) > 1e-4 || Math.abs(moved[1] - dzw) > 1e-4) && (this.onGround || wasGround)) {
      // try stepping up onto whatever blocked us
      const sx = this.x, sy = this.y, sz = this.z;
      const up = this.clip(1, STEP_H);
      this.x = ox; this.z = oz;
      this.y += up;
      const m2 = this.slide(dxw, dzw);
      const down = this.clip(1, -up - 0.05);
      this.y += down;
      const gain2 = Math.hypot(m2[0], m2[1]), gain1 = Math.hypot(moved[0], moved[1]);
      if (gain2 > gain1 + 1e-3 && down > -up - 0.05 + EPS) {
        this.eyeSmooth -= this.y - sy;
        this.eyeSmooth = Math.max(this.eyeSmooth, -0.5);
      } else {
        this.x = sx; this.y = sy; this.z = sz;
      }
    }
    // lose velocity along blocked axes (wall sliding)
    if (dt > 0) {
      const rdx = this.x - ox, rdz = this.z - oz;
      if (Math.abs(dxw) > 1e-5 && Math.abs(rdx) < Math.abs(dxw) * 0.3) this.vx = rdx / dt;
      if (Math.abs(dzw) > 1e-5 && Math.abs(rdz) < Math.abs(dzw) * 0.3) this.vz = rdz / dt;
    }
    // stick to ground when walking down steps / ramps
    if (wasGround && !this.onGround && this.vy <= 0) {
      const g = this.groundBelow(STEP_H + 0.02);
      if (g !== null) {
        this.y -= g; this.onGround = true; this.vy = 0;
        this.eyeSmooth += g; this.eyeSmooth = Math.min(this.eyeSmooth, 0.5);
        if (this.lastHitSurf >= 0 && this.lastHitSurf !== 255) this.surface = this.lastHitSurf;
      }
    }
    // landing
    if (!wasGround && this.onGround) {
      if (prevVy < -3.5) {
        this.shake = Math.min(1, -prevVy / 14);
        this.leanVel -= Math.min(2.5, -prevVy * 0.12);
        if (this.onLand) this.onLand(-prevVy, this.surface);
      }
      this.fallStart = null;
    }
    if (!this.onGround) {
      this.airTime += dt;
      if (this.fallStart === null) this.fallStart = this.y;
    } else {
      this.airTime = 0;
      this.lastSafe = [this.x, this.y, this.z];
    }

    // ---------------- climb
    if (inp.climb && this.onGround) this.tryClimb();

    // ---------------- footsteps & bob
    const hs = Math.hypot(this.vx, this.vz);
    if (this.onGround && hs > 0.1) {
      const stride = this.crouched ? 0.5 : hs > 2.2 ? 0.95 : 0.72;
      const adv = hs * dt;
      this.stepDist += adv;
      this.distance += adv;
      const prev = this.bobPhase;
      this.bobPhase += (adv / stride) * Math.PI;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.bobPhase / Math.PI)) {
        if (this.onStep) this.onStep(this.surface, hs / WALK, this.crouched);
      }
    }
    this.updateCamera(dt, hs, ml);
  }

  slide(dx, dz) {
    const cx = this.clip(0, dx);
    this.x += cx;
    const cz = this.clip(2, dz);
    this.z += cz;
    return [cx, cz];
  }

  tryClimb() {
    const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const reach = 0.55;
    const ex = this.x + fx * reach, ez = this.z + fz * reach;
    // find top surface in front between step height and climb height
    this.gather(1.2);
    let best = null;
    const B = this.boxes;
    for (let k = 0; k < B.length; k += 7) {
      if (ex + 0.05 < B[k] || ex - 0.05 > B[k + 3] || ez + 0.05 < B[k + 2] || ez - 0.05 > B[k + 5]) continue;
      const top = B[k + 4];
      const h = top - this.y;
      if (h > 0.3 && h <= CLIMB_H && (best === null || top > best)) best = top;
    }
    if (best === null) return false;
    // landing spot must be free (crouched height at least)
    const lx = this.x + fx * (reach + 0.2), lz = this.z + fz * (reach + 0.2);
    if (this.overlaps(lx, best + 0.02, lz, CROUCH_H)) return false;
    if (this.overlaps(this.x, this.y + 0.05, this.z, best - this.y + CROUCH_H)) return false;
    const stand = !this.overlaps(lx, best + 0.02, lz, PLAYER_H);
    if (!stand) { this.crouched = true; this.crouchWanted = true; this.height = CROUCH_H; }
    this.climb = { t: 0, dur: 0.75 + (best - this.y) * 0.35, sx: this.x, sy: this.y, sz: this.z, ex: lx, ey: best + 0.01, ez: lz };
    if (this.onClimb) this.onClimb(best - this.y);
    return true;
  }

  updateCamera(dt, hs, intent) {
    const moving = this.onGround && hs > 0.15;
    const targetAmp = moving ? (this.crouched ? 0.55 : hs > 2.2 ? 1.5 : 1.0) * Math.min(1, hs / WALK) : 0;
    // amplitude eases in, and decays with a slight overshoot when stopping
    this.bobAmp += (targetAmp - this.bobAmp) * (1 - Math.exp(-dt * (targetAmp > this.bobAmp ? 6 : 4)));
    if (!moving) {
      // let the phase drift to the nearest rest point so the head settles
      const rest = Math.round(this.bobPhase / Math.PI) * Math.PI;
      this.bobPhase += (rest - this.bobPhase) * (1 - Math.exp(-dt * 5));
    }
    // lean spring: decelerating tips the view forward a touch
    const accelForward = intent < 0.05 && hs > 0.05 ? 1 : 0;
    this.leanVel += (accelForward * 0.6 - this.lean * 30 - this.leanVel * 7) * dt;
    this.lean += this.leanVel * dt;
    this.eyeSmooth *= Math.exp(-dt * 12);
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  camera(t) {
    const amp = this.bobAmp;
    const ph = this.bobPhase;
    const bobY = amp * 0.034 * (Math.abs(Math.sin(ph)) - 0.6);
    const bobX = amp * 0.022 * Math.sin(ph);
    const rx = Math.cos(this.yaw), rz = Math.sin(this.yaw);
    let sx = 0, sy = 0;
    if (this.shake > 0) {
      sx = Math.sin(t * 61) * 0.03 * this.shake;
      sy = Math.cos(t * 53) * 0.03 * this.shake;
    }
    return {
      x: this.x + rx * bobX + sx * rx,
      y: this.y + this.eye + bobY + this.eyeSmooth + sy + this.lean * 0.02,
      z: this.z + rz * bobX + sx * rz,
      yaw: this.yaw,
      pitch: this.pitch - this.lean * 0.06 + amp * 0.004 * Math.sin(ph * 2),
      roll: amp * 0.006 * Math.sin(ph) + sx * 0.5,
      dim: this.dim,
    };
  }

  level() { return Math.floor((this.y + 0.05) / LEVEL_H); }
}
