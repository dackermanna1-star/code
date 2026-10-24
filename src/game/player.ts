// First-person player: kinematic AABB controller against the static voxel world (with step-up),
// sphere contacts against dynamic bodies (stand on / push debris), crouch, jump, sprint, fall damage.

import { Vec3 } from '../engine/math';
import { Input } from '../engine/input';
import { Game } from './game';
import { Body } from '../physics/body';
import { GridView, RawContacts, sphereVsGrid } from '../physics/collide';
import { VOXEL } from '../world/world';

const EPS = 0.001;
const STEP = 0.42;
const MASS = 80;

export class Player {
  pos = new Vec3();
  vel = new Vec3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  crouching = false;
  readonly radius = 0.27;
  height = 1.8;
  eye = 1.62;
  private eyeSmooth = 1.62;
  /** smoothed vertical camera offset after step-ups */
  stepOffset = 0;
  health = 100;
  groundBody: Body | null = null;
  noclip = false;
  bob = 0;
  private landSpeed = 0;
  /** seconds since last on ground */
  airTime = 0;
  spawn = new Vec3();
  onLand: ((speed: number) => void) | null = null;
  onStep: (() => void) | null = null;
  private stepDist = 0;
  private raw = new RawContacts(64);
  hurtFlash = 0;

  constructor(readonly game: Game) {}

  get eyeY(): number { return this.pos.y + this.eyeSmooth - this.stepOffset; }

  private solidAt(x: number, y: number, z: number): boolean { return this.game.world.get(x, y, z) !== 0; }

  /** Is the AABB at (px,py,pz) free of solid voxels? */
  boxFree(px: number, py: number, pz: number, h = this.height): boolean {
    const r = this.radius;
    const x0 = Math.floor((px - r + EPS) * 10), x1 = Math.floor((px + r - EPS) * 10);
    const y0 = Math.floor((py + EPS) * 10), y1 = Math.floor((py + h - EPS) * 10);
    const z0 = Math.floor((pz - r + EPS) * 10), z1 = Math.floor((pz + r - EPS) * 10);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (this.solidAt(x, y, z)) return false;
    return true;
  }

  /** Move along one axis with collision; returns the distance actually moved. */
  private moveAxis(axis: 0 | 1 | 2, d: number): number {
    if (d === 0) return 0;
    const r = this.radius, h = this.height, p = this.pos;
    let lo: number, hi: number;
    if (axis === 0) { lo = p.x - r; hi = p.x + r; } else if (axis === 1) { lo = p.y; hi = p.y + h; } else { lo = p.z - r; hi = p.z + r; }
    // cross-section ranges of the other two axes
    const ax = axis === 0 ? 1 : 0, bx = axis === 2 ? 1 : 2;
    const range = (a: number): [number, number] => {
      if (a === 0) return [Math.floor((p.x - r + EPS) * 10), Math.floor((p.x + r - EPS) * 10)];
      if (a === 1) return [Math.floor((p.y + EPS) * 10), Math.floor((p.y + h - EPS) * 10)];
      return [Math.floor((p.z - r + EPS) * 10), Math.floor((p.z + r - EPS) * 10)];
    };
    const [a0, a1] = range(ax), [b0, b1] = range(bx);
    const test = (layer: number): boolean => {
      for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) {
        const c = [0, 0, 0];
        c[axis] = layer; c[ax] = a; c[bx] = b;
        if (this.solidAt(c[0], c[1], c[2])) return true;
      }
      return false;
    };
    let moved = d;
    if (d > 0) {
      const from = Math.floor((hi - EPS) * 10) + 1, to = Math.floor((hi + d - EPS) * 10);
      for (let l = from; l <= to; l++) if (test(l)) { moved = Math.max(0, l * VOXEL - hi - EPS); break; }
    } else {
      const from = Math.floor((lo + EPS) * 10) - 1, to = Math.floor((lo + d + EPS) * 10);
      for (let l = from; l >= to; l--) if (test(l)) { moved = Math.min(0, (l + 1) * VOXEL - lo + EPS); break; }
    }
    if (axis === 0) p.x += moved; else if (axis === 1) p.y += moved; else p.z += moved;
    return moved;
  }

  update(dt: number, input: Input, controlsEnabled: boolean): void {
    const g = this.game;
    // look
    if (controlsEnabled) {
      this.yaw -= input.mouseDX * input.sensitivity;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - input.mouseDY * input.sensitivity));
    }
    // crouch
    const wantCrouch = controlsEnabled && (input.isDown('ControlLeft') || input.isDown('KeyC'));
    if (wantCrouch && !this.crouching) { this.crouching = true; this.height = 1.15; this.eye = 1.0; }
    else if (!wantCrouch && this.crouching && this.boxFree(this.pos.x, this.pos.y, this.pos.z, 1.8)) { this.crouching = false; this.height = 1.8; this.eye = 1.62; }
    this.eyeSmooth += (this.eye - this.eyeSmooth) * Math.min(1, dt * 12);
    this.stepOffset *= Math.max(0, 1 - dt * 14);
    // wish direction
    let fx = 0, fz = 0;
    if (controlsEnabled) {
      if (input.isDown('KeyW')) fz -= 1;
      if (input.isDown('KeyS')) fz += 1;
      if (input.isDown('KeyA')) fx -= 1;
      if (input.isDown('KeyD')) fx += 1;
    }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = fx * cy + fz * sy, wz = -fx * sy + fz * cy;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const sprint = controlsEnabled && input.isDown('ShiftLeft') && !this.crouching;
    const speed = this.crouching ? 2.1 : sprint ? 7.2 : 4.4;
    if (this.noclip) {
      const fly = (sprint ? 25 : 9);
      const cp = Math.cos(this.pitch);
      const dx = (-sy * cp) * -fz + cy * fx, dy = Math.sin(this.pitch) * -fz, dz = (-cy * cp) * -fz - sy * fx;
      this.vel.set(dx * fly, dy * fly + ((input.isDown('Space') ? 1 : 0) - (input.isDown('KeyC') ? 1 : 0)) * fly, dz * fly);
      this.pos.addScaled(this.vel, dt);
      return;
    }
    const accel = this.onGround ? 14 : 2.5;
    const k = Math.min(1, dt * accel);
    // relative to the ground body (moving platforms)
    let gvx = 0, gvz = 0;
    if (this.groundBody && !this.groundBody.removed) {
      const v = this.groundBody.pointVel(this.pos.x, this.pos.y, this.pos.z, new Vec3());
      gvx = v.x; gvz = v.z;
    }
    this.vel.x += (wx * speed + gvx - this.vel.x) * k;
    this.vel.z += (wz * speed + gvz - this.vel.z) * k;
    this.vel.y -= 19 * dt;
    if (this.vel.y < -50) this.vel.y = -50;
    if (controlsEnabled && input.wasPressed('Space') && (this.onGround || this.airTime < 0.12)) {
      this.vel.y = 5.6;
      this.onGround = false;
      this.airTime = 1;
    }
    const wasGround = this.onGround;
    // ---- move with world collision (substeps for large velocities)
    const steps = Math.max(1, Math.ceil(this.vel.len() * dt / 0.15));
    const sdt = dt / steps;
    this.onGround = false;
    for (let s = 0; s < steps; s++) {
      const dx = this.vel.x * sdt, dz = this.vel.z * sdt;
      const px = this.pos.x, py = this.pos.y, pz = this.pos.z;
      const mx = this.moveAxis(0, dx);
      const mz = this.moveAxis(2, dz);
      // step up if blocked horizontally while grounded
      if ((Math.abs(mx - dx) > 1e-5 || Math.abs(mz - dz) > 1e-5) && (wasGround || this.airTime < 0.2)) {
        const sx = this.pos.x, szz = this.pos.z, sy0 = this.pos.y;
        this.pos.set(px, py, pz);
        const up = this.moveAxis(1, STEP);
        const mx2 = this.moveAxis(0, dx);
        const mz2 = this.moveAxis(2, dz);
        const down = this.moveAxis(1, -up - 0.02);
        const gain = Math.hypot(mx2, mz2) - Math.hypot(mx, mz);
        if (gain > 1e-4 && down > -up - 0.019) {
          const rise = this.pos.y - sy0;
          if (rise > 0.01) { this.stepOffset += rise; this.onStep?.(); }
        } else {
          this.pos.set(sx, sy0, szz);
        }
        if (Math.abs(mx - dx) > 1e-5 && Math.abs(this.pos.x - px - dx) > 1e-4) this.vel.x = 0;
        if (Math.abs(mz - dz) > 1e-5 && Math.abs(this.pos.z - pz - dz) > 1e-4) this.vel.z = 0;
      } else {
        if (Math.abs(mx - dx) > 1e-5) this.vel.x = 0;
        if (Math.abs(mz - dz) > 1e-5) this.vel.z = 0;
      }
      const dy = this.vel.y * sdt;
      const my = this.moveAxis(1, dy);
      if (Math.abs(my - dy) > 1e-6) {
        if (dy < 0) { this.landSpeed = Math.max(this.landSpeed, -this.vel.y); this.onGround = true; }
        this.vel.y = 0;
      }
    }
    // ground probe (standing still on a surface)
    if (!this.onGround && this.vel.y <= 0 && !this.boxFree(this.pos.x, this.pos.y - 0.03, this.pos.z, 0.05)) this.onGround = true;
    // ---- dynamic bodies
    this.groundBody = null;
    this.collideBodies(dt);
    // ---- landing / fall damage
    if (this.onGround) {
      if (!wasGround && this.landSpeed > 2) this.onLand?.(this.landSpeed);
      if (!wasGround && this.landSpeed > 10.5) this.damage((this.landSpeed - 10.5) * 9);
      this.landSpeed = 0;
      this.airTime = 0;
    } else this.airTime += dt;
    // head bob + footsteps
    const hs = Math.hypot(this.vel.x - gvx, this.vel.z - gvz);
    if (this.onGround && hs > 0.5) {
      this.bob += dt * hs * 1.9;
      this.stepDist += hs * dt;
      if (this.stepDist > (sprint ? 2.0 : 1.6)) { this.stepDist = 0; this.onStep?.(); }
    } else this.bob *= 0.9;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    if (this.pos.y < -20) this.respawn();
  }

  private collideBodies(dt: number): void {
    const g = this.game;
    const r = this.radius;
    const px = this.pos.x, py = this.pos.y, pz = this.pos.z;
    const spheres = this.crouching ? [0.3, 0.85] : [0.3, 0.9, 1.5];
    for (const b of g.physics.bodies) {
      if (b.held) continue;
      const a = b.aabb;
      if (a[0] > px + r + 0.1 || a[3] < px - r - 0.1 || a[1] > py + this.height + 0.1 || a[4] < py - 0.1 || a[2] > pz + r + 0.1 || a[5] < pz - r - 0.1) continue;
      const gv: GridView = { data: b.vox, sx: b.sx, sy: b.sy, sz: b.sz, ox: 0, oy: 0, oz: 0, outside: 0 };
      for (const hgt of spheres) {
        const raw = this.raw;
        raw.reset();
        const c = b.worldToGrid(this.pos.x, this.pos.y + hgt, this.pos.z, new Vec3());
        sphereVsGrid(gv, c.x, c.y, c.z, (r + 0.03) * 10, 0.2, 0, raw);
        // deepest contact
        let best = -1;
        for (let i = 0; i < raw.n; i++) if (raw.depth[i] > 0 && (best < 0 || raw.depth[i] > raw.depth[best])) best = i;
        if (best < 0) continue;
        const R = b.R;
        const ln = [raw.nrm[best * 3], raw.nrm[best * 3 + 1], raw.nrm[best * 3 + 2]];
        let nx = R[0] * ln[0] + R[1] * ln[1] + R[2] * ln[2];
        let ny = R[3] * ln[0] + R[4] * ln[1] + R[5] * ln[2];
        let nz = R[6] * ln[0] + R[7] * ln[1] + R[8] * ln[2];
        const depth = raw.depth[best] * VOXEL;
        const standing = ny > 0.6 && hgt < 0.5;
        if (standing) { nx = 0; ny = 1; nz = 0; }
        // light bodies get pushed instead of pushing the player
        const ratio = b.mass / (b.mass + MASS);
        const push = Math.min(depth, 0.15) * (standing ? 1 : ratio);
        const nxp = this.pos.x + nx * push, nyp = this.pos.y + ny * push, nzp = this.pos.z + nz * push;
        if (this.boxFree(nxp, nyp, nzp)) { this.pos.set(nxp, nyp, nzp); }
        // velocity relative to the body
        const bv = b.pointVel(this.pos.x, this.pos.y + hgt, this.pos.z, new Vec3());
        const rvx = this.vel.x - bv.x, rvy = this.vel.y - bv.y, rvz = this.vel.z - bv.z;
        const vn = rvx * nx + rvy * ny + rvz * nz;
        if (vn < 0) {
          this.vel.x -= vn * nx * (standing ? 1 : ratio); this.vel.y -= vn * ny; this.vel.z -= vn * nz * (standing ? 1 : ratio);
          // reaction on the body
          if (!b.kinematic) {
            const J = -vn * MASS * (standing ? 0.4 : 0.6);
            const cp = new Vec3(this.pos.x - nx * r, this.pos.y + hgt - ny * r, this.pos.z - nz * r);
            b.updateDerived();
            b.applyImpulse(-nx * J, -ny * J, -nz * J, cp.x, cp.y, cp.z);
            if (J > 4) b.wake();
          }
        }
        if (standing) {
          this.onGround = true;
          this.groundBody = b;
          // weight of the player presses on the body (wakes it if it is a light plank etc.)
          if (!b.sleeping && !b.kinematic) {
            const J = MASS * 9.81 * dt;
            b.applyImpulse(0, -J, 0, this.pos.x, this.pos.y, this.pos.z);
          }
        } else if (b.vel.len() > 4 && b.mass > 30) {
          // getting hit by fast heavy debris hurts
          const rel = Math.max(0, -vn);
          if (rel > 4) this.damage(Math.min(60, (rel - 4) * b.mass * 0.01));
        }
      }
    }
  }

  damage(amount: number): void {
    if (amount <= 0) return;
    this.health -= amount;
    this.hurtFlash = Math.min(1, this.hurtFlash + amount / 40);
    if (this.health <= 0) this.respawn();
  }

  respawn(): void {
    this.pos.copy(this.spawn);
    this.vel.set(0, 0, 0);
    this.health = 100;
  }
}
