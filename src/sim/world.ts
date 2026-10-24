// Physics world: steps all soft bodies at a fixed high rate (default 2 kHz),
// resolves node collisions against terrain, static and kinematic colliders,
// and node-vs-triangle collisions between bodies.

import {
  Collider,
  CF_NO_WHEELS,
  CF_TRIGGER,
  SHAPE_CAPSULE,
  SHAPE_CYLINDER,
  pointQuery,
  rayQuery,
  makeRayHit,
  StaticGrid,
  type PointHit,
  type RayHit,
} from './colliders.ts';
import { Heightfield, type TerrainSample } from './terrain.ts';
import { SoftBody, NODE_COLLIDE, NODE_SOFTCOLLIDE, Mat } from './softbody.ts';
import { SURFACES, Surface } from './surfaces.ts';

export interface SubstepController {
  /** Called at the start of each substep (kinematic poses, triggers). */
  preSubstep?(t: number, dt: number): void;
  /** Called after beam forces are accumulated; add external forces here. */
  applyForces?(dt: number): void;
  /** Called after integration/collision. */
  postSubstep?(dt: number): void;
}

export interface ContactSample {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  speed: number;
}

const MAX_NODE_SPEED = 300;
/** An awake body must move at least this fast (m/s) to wake sleeping bodies it touches. */
const WAKE_SPEED = 0.15;
/** Capsules and cylinders thinner than this (radius, m) also collide with body triangles. */
const THIN_RADIUS = 0.35;
/** Spacing (m) of the sample points along a thin collider's axis. */
const THIN_STEP = 0.2;

export class World {
  dt = 1 / 2000;
  time = 0;
  substepCount = 0;
  gravity = -9.81;
  terrain: Heightfield | null = null;
  bodies: SoftBody[] = [];
  statics = new StaticGrid(12);
  kinematics: Collider[] = [];
  controllers: SubstepController[] = [];
  /** Global multiplier on beam yield/strength, set by the game (damage scale). */
  frameIndex = 0;

  /** Substeps between candidate refreshes. */
  candidateInterval = 8;

  private _hit: PointHit = { depth: 0, nx: 0, ny: 1, nz: 0 };
  private _ts: TerrainSample = { h: 0, nx: 0, ny: 1, nz: 0 };
  private _sv = new Float64Array(3);
  private triHash = new TriHash();
  private wakers = new Float64Array(0);
  private wakerCount = 0;

  addBody(b: SoftBody): void {
    if (!this.bodies.includes(b)) this.bodies.push(b);
    this.refreshCandidates(b);
  }

  removeBody(b: SoftBody): void {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
    // anything resting on or against it has to fall
    this.wakeRegion(b.min, b.max, 0.3);
  }

  addStatic(c: Collider): Collider {
    c.kinematic = false;
    this.statics.add(c);
    c.updateBounds();
    this.wakeRegion(c.min, c.max, 0.1);
    return c;
  }

  removeStatic(c: Collider): void {
    this.statics.remove(c);
    this.wakeRegion(c.min, c.max, 0.3);
  }

  addKinematic(c: Collider): Collider {
    c.kinematic = true;
    c.updateBounds();
    this.kinematics.push(c);
    this.wakeRegion(c.min, c.max, 0.1);
    return c;
  }

  removeKinematic(c: Collider): void {
    const i = this.kinematics.indexOf(c);
    if (i >= 0) this.kinematics.splice(i, 1);
    this.wakeRegion(c.min, c.max, 0.3);
  }

  /** Whether any active soft body comes within `r` (horizontally) of (x, z). */
  anyBodyNear(x: number, z: number, r: number): boolean {
    for (const b of this.bodies) {
      if (!b.active) continue;
      const dx = Math.max(b.min[0] - x, 0, x - b.max[0]);
      const dz = Math.max(b.min[2] - z, 0, z - b.max[2]);
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  /** Wake every sleeping body whose bounds overlap the box. */
  wakeRegion(min: ArrayLike<number>, max: ArrayLike<number>, pad: number): void {
    for (const b of this.bodies) {
      if (b.sleeping && aabbOverlap(b.min, b.max, min, max, pad)) b.wake();
    }
  }

  addController(c: SubstepController): void {
    if (!this.controllers.includes(c)) this.controllers.push(c);
  }

  removeController(c: SubstepController): void {
    const i = this.controllers.indexOf(c);
    if (i >= 0) this.controllers.splice(i, 1);
  }

  /** Recompute the candidate colliders near a body. */
  refreshCandidates(b: SoftBody): void {
    b.computeBounds();
    const pad = 0.4 + b.maxSpeed * this.dt * this.candidateInterval * 1.5;
    const out = b.candidates as Collider[];
    out.length = 0;
    this.statics.query(b.min[0] - pad, b.min[1] - pad, b.min[2] - pad, b.max[0] + pad, b.max[1] + pad, b.max[2] + pad, out);
    for (let i = 0; i < this.kinematics.length; i++) {
      const c = this.kinematics[i];
      if (!c.enabled) continue;
      if (c.max[0] < b.min[0] - pad || c.min[0] > b.max[0] + pad) continue;
      if (c.max[1] < b.min[1] - pad || c.min[1] > b.max[1] + pad) continue;
      if (c.max[2] < b.min[2] - pad || c.min[2] > b.max[2] + pad) continue;
      out.push(c);
    }
  }

  /** Advance one fixed substep. */
  substep(): void {
    const dt = this.dt;
    this.time += dt;
    this.substepCount++;
    const ctrls = this.controllers;
    for (let i = 0; i < ctrls.length; i++) ctrls[i].preSubstep?.(this.time, dt);

    const refresh = this.substepCount % this.candidateInterval === 0;
    if (refresh) {
      for (let i = 0; i < this.kinematics.length; i++) this.kinematics[i].updateBounds(0.05);
    }

    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!b.active || b.sleeping) continue;
      b.frc.fill(0);
      b.beamForces();
    }
    for (let i = 0; i < ctrls.length; i++) ctrls[i].applyForces?.(dt);
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!b.active || b.sleeping) continue;
      this.integrate(b, dt);
    }
    this.bodyBodyCollisions();
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.active && !b.sleeping && b.t > 0) this.thinCollidersVsTris(b);
    }
    for (let i = 0; i < ctrls.length; i++) ctrls[i].postSubstep?.(dt);

    if (refresh) {
      this.collectWakers();
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (!b.active) continue;
        if (b.sleeping) {
          this.checkWake(b);
          continue;
        }
        this.refreshCandidates(b);
        this.updateSleep(b, dt * this.candidateInterval);
      }
    }
  }

  /**
   * Gather, once per refresh, the padded bounds of everything that may wake a
   * sleeping body: bodies that are actually moving and machine parts in
   * motion. Bodies that have come to rest against each other must not keep
   * waking one another.
   */
  private collectWakers(): void {
    const need = (this.bodies.length + this.kinematics.length) * 6;
    if (this.wakers.length < need) this.wakers = new Float64Array(need * 2);
    const W = this.wakers;
    let n = 0;
    for (let i = 0; i < this.bodies.length; i++) {
      const o = this.bodies[i];
      if (!o.active || o.sleeping || o.maxSpeed < WAKE_SPEED) continue;
      W[n] = o.min[0] - 0.2; W[n + 1] = o.min[1] - 0.2; W[n + 2] = o.min[2] - 0.2;
      W[n + 3] = o.max[0] + 0.2; W[n + 4] = o.max[1] + 0.2; W[n + 5] = o.max[2] + 0.2;
      n += 6;
    }
    for (let i = 0; i < this.kinematics.length; i++) {
      const c = this.kinematics[i];
      if (!c.enabled) continue;
      const ex = c.max[0] - c.min[0], ey = c.max[1] - c.min[1], ez = c.max[2] - c.min[2];
      const reach2 = 0.25 * (ex * ex + ey * ey + ez * ez);
      const l = c.lin, a = c.ang, sv = c.surfVel;
      const speed2 = l[0] * l[0] + l[1] * l[1] + l[2] * l[2] + (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) * reach2 + sv[0] * sv[0] + sv[1] * sv[1] + sv[2] * sv[2];
      if (speed2 < 1e-4) continue;
      W[n] = c.min[0] - 0.1; W[n + 1] = c.min[1] - 0.1; W[n + 2] = c.min[2] - 0.1;
      W[n + 3] = c.max[0] + 0.1; W[n + 4] = c.max[1] + 0.1; W[n + 5] = c.max[2] + 0.1;
      n += 6;
    }
    this.wakerCount = n / 6;
  }

  private checkWake(b: SoftBody): void {
    const W = this.wakers, mn = b.min, mx = b.max;
    for (let k = 0, o = 0; k < this.wakerCount; k++, o += 6) {
      if (mx[0] < W[o] || mn[0] > W[o + 3] || mx[1] < W[o + 1] || mn[1] > W[o + 4] || mx[2] < W[o + 2] || mn[2] > W[o + 5]) continue;
      b.wake();
      this.refreshCandidates(b);
      return;
    }
  }

  private updateSleep(b: SoftBody, dt: number): void {
    if (!b.canSleep) return;
    if (b.maxSpeed < 0.06) {
      b.sleepTimer += dt;
      if (b.sleepTimer > 1.0) {
        b.sleeping = true;
        b.vel.fill(0);
      }
    } else b.sleepTimer = 0;
  }

  /** Integrate node velocities/positions and resolve world collisions. */
  private integrate(b: SoftBody, dt: number): void {
    const pos = b.pos, vel = b.vel, frc = b.frc, invMass = b.invMass, mass = b.mass;
    const flags = b.nodeFlags, fricArr = b.friction, matArr = b.material;
    const g = this.gravity * b.gravityScale * dt;
    const drag = 1 - b.linearDrag * dt;
    const terrain = this.terrain;
    const cands = b.candidates as Collider[];
    const nc = cands.length;
    const hit = this._hit, ts = this._ts, sv = this._sv;
    const maxV2 = MAX_NODE_SPEED * MAX_NODE_SPEED;
    const frame = this.frameIndex;
    for (let i = 0; i < b.n; i++) {
      const im = invMass[i];
      if (im === 0) continue;
      const i3 = i * 3;
      let vx = vel[i3] + frc[i3] * im * dt;
      let vy = vel[i3 + 1] + (frc[i3 + 1] * im * dt + g);
      let vz = vel[i3 + 2] + frc[i3 + 2] * im * dt;
      if (drag !== 1) {
        vx *= drag;
        vy *= drag;
        vz *= drag;
      }
      const s2 = vx * vx + vy * vy + vz * vz;
      if (!(s2 < maxV2)) {
        if (s2 !== s2) {
          vx = vy = vz = 0;
          b.unstable = true;
        } else {
          const s = MAX_NODE_SPEED / Math.sqrt(s2);
          vx *= s;
          vy *= s;
          vz *= s;
        }
      }
      let x = pos[i3] + vx * dt;
      let y = pos[i3 + 1] + vy * dt;
      let z = pos[i3 + 2] + vz * dt;
      if (flags[i] & NODE_COLLIDE) {
        const mu0 = fricArr[i];
        // terrain
        if (terrain) {
          terrain.sample(x, z, ts);
          const pen = (ts.h - y) * ts.ny;
          if (pen > 0) {
            const surf = SURFACES[terrain.surfaceAt(x, z)];
            const mu = mu0 * surf.bodyFriction * 1.8;
            x += ts.nx * pen;
            y += ts.ny * pen;
            z += ts.nz * pen;
            // velocity response
            const vn = vx * ts.nx + vy * ts.ny + vz * ts.nz;
            if (vn < 0) {
              const soft = surf.soft;
              const jn = -vn * (1 + 0.02 * (1 - soft));
              vx += ts.nx * jn;
              vy += ts.ny * jn;
              vz += ts.nz * jn;
              const vn2 = vx * ts.nx + vy * ts.ny + vz * ts.nz;
              let tx = vx - ts.nx * vn2, ty = vy - ts.ny * vn2, tz = vz - ts.nz * vn2;
              const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
              const fl = mu * jn;
              let slide = 0;
              if (tl <= fl) {
                tx = ty = tz = 0;
              } else {
                const k = 1 - fl / tl;
                tx *= k;
                ty *= k;
                tz *= k;
                slide = tl;
              }
              vx = tx + ts.nx * vn2;
              vy = ty + ts.ny * vn2;
              vz = tz + ts.nz * vn2;
              this.recordContact(b, i, x, y, z, ts.nx, ts.ny, ts.nz, -vn, slide, mass[i] * jn, surf.sparks && matArr[i] === Mat.METAL);
            }
          }
        }
        for (let c = 0; c < nc; c++) {
          const col = cands[c];
          if (x < col.min[0] || x > col.max[0] || y < col.min[1] || y > col.max[1] || z < col.min[2] || z > col.max[2]) continue;
          if (!pointQuery(col, x, y, z, hit)) continue;
          if (col.flags & CF_TRIGGER) {
            col.lastContactFrame = frame;
            continue;
          }
          const nx = hit.nx, ny = hit.ny, nz = hit.nz, pen = hit.depth;
          x += nx * pen;
          y += ny * pen;
          z += nz * pen;
          let svx = 0, svy = 0, svz = 0;
          if (col.kinematic) {
            col.velocityAt(x, y, z, sv);
            svx = sv[0];
            svy = sv[1];
            svz = sv[2];
          }
          let rx = vx - svx, ry = vy - svy, rz = vz - svz;
          const vn = rx * nx + ry * ny + rz * nz;
          if (vn < 0) {
            const jn = -vn * (1 + col.restitution);
            rx += nx * jn;
            ry += ny * jn;
            rz += nz * jn;
            const vn2 = rx * nx + ry * ny + rz * nz;
            let tx = rx - nx * vn2, ty = ry - ny * vn2, tz = rz - nz * vn2;
            const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
            const fl = mu0 * col.friction * 1.6 * jn;
            let slide = 0;
            if (tl <= fl) {
              tx = ty = tz = 0;
            } else {
              const k = 1 - fl / tl;
              tx *= k;
              ty *= k;
              tz *= k;
              slide = tl;
            }
            vx = svx + tx + nx * vn2;
            vy = svy + ty + ny * vn2;
            vz = svz + tz + nz * vn2;
            const imp = mass[i] * jn * col.harshness;
            if (col.receivesImpulse) {
              // reaction on the collider
              const J = mass[i] * jn;
              const jx = -nx * J, jy = -ny * J, jz = -nz * J;
              col.impulse[0] += jx;
              col.impulse[1] += jy;
              col.impulse[2] += jz;
              const px = x - col.pivot[0], py = y - col.pivot[1], pz = z - col.pivot[2];
              col.angImpulse[0] += py * jz - pz * jy;
              col.angImpulse[1] += pz * jx - px * jz;
              col.angImpulse[2] += px * jy - py * jx;
            }
            if (-vn > col.contactSpeed || col.lastContactFrame !== frame) col.contactSpeed = -vn;
            col.lastContactFrame = frame;
            this.recordContact(b, i, x, y, z, nx, ny, nz, -vn, slide, imp, SURFACES[col.surface].sparks && matArr[i] === Mat.METAL);
          }
        }
      }
      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;
      vel[i3] = vx;
      vel[i3 + 1] = vy;
      vel[i3 + 2] = vz;
    }
  }

  private recordContact(
    b: SoftBody, i: number,
    x: number, y: number, z: number,
    nx: number, ny: number, nz: number,
    impactSpeed: number, slide: number, impulse: number, sparks: boolean,
  ): void {
    if (impactSpeed > b.impactSpeed) {
      b.impactSpeed = impactSpeed;
      b.impactX = x;
      b.impactY = y;
      b.impactZ = z;
      b.impactMaterial = b.material[i];
    }
    if (slide > 0.5 && impulse > 0.0005) {
      b.nodeScrape[i] += slide * 0.0005;
      b.scrapeCount++;
      if (sparks) b.scrapeSparks++;
      if (slide > b.scrapeSpeed) {
        b.scrapeSpeed = slide;
        b.scrapeX = x;
        b.scrapeY = y;
        b.scrapeZ = z;
        b.scrapeNx = nx;
        b.scrapeNy = ny;
        b.scrapeNz = nz;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Body vs body (node vs triangle)

  private bodyBodyCollisions(): void {
    const bodies = this.bodies;
    const nb = bodies.length;
    // every pair with at least one awake body, each pair once
    for (let i = 0; i < nb; i++) {
      const a = bodies[i];
      if (!a.active || !a.softCollisions || a.sleeping) continue;
      for (let j = 0; j < nb; j++) {
        const b = bodies[j];
        if (j === i || !b.active || !b.softCollisions) continue;
        if (j < i && !b.sleeping) continue;
        if ((a.ignoreBody === b || b.ignoreBody === a) && this.time < Math.max(a.ignoreUntil, b.ignoreUntil)) continue;
        if (!aabbOverlap(a.min, a.max, b.min, b.max, 0.1)) continue;
        // A sleeping body stays asleep, and acts immovable, against a body
        // that is merely settling; something moving or a firm sideways push
        // wakes it.
        if (a.sleeping && b.maxSpeed >= WAKE_SPEED) a.wake();
        if (b.sleeping && a.maxSpeed >= WAKE_SPEED) b.wake();
        a.pushImpulse = 0;
        b.pushImpulse = 0;
        this.nodesVsTris(a, b);
        this.nodesVsTris(b, a);
        const push = 0.3 * Math.abs(this.gravity) * this.dt;
        if (a.sleeping && a.pushImpulse > a.totalMass * push) a.wake();
        if (b.sleeping && b.pushImpulse > b.totalMass * push) b.wake();
      }
    }
  }

  /**
   * Thin colliders (spikes, poles, a mace's arm) are narrower than the gaps
   * between a body's nodes, so node contacts alone would let them thread
   * straight through a panel and leave the body skewered. Points along their
   * axis are also pushed against the body's triangles, so they dent the
   * panel instead.
   */
  private thinCollidersVsTris(b: SoftBody): void {
    const cands = b.candidates as Collider[];
    const skin = b.skin;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    let any = false;
    for (let k = 0; k < cands.length; k++) {
      const c = cands[k];
      if (!c.enabled || c.flags & CF_TRIGGER || (c.shape !== SHAPE_CAPSULE && c.shape !== SHAPE_CYLINDER) || c.half[0] >= THIN_RADIUS) continue;
      if (!aabbOverlap(b.min, b.max, c.min, c.max, skin)) continue;
      any = true;
      x0 = Math.min(x0, c.min[0]); y0 = Math.min(y0, c.min[1]); z0 = Math.min(z0, c.min[2]);
      x1 = Math.max(x1, c.max[0]); y1 = Math.max(y1, c.max[1]); z1 = Math.max(z1, c.max[2]);
    }
    if (!any) return;
    const pad = THIN_RADIUS + skin;
    const hash = this.triHash;
    hash.build(b, Math.max(x0, b.min[0]) - pad, Math.max(y0, b.min[1]) - pad, Math.max(z0, b.min[2]) - pad, Math.min(x1, b.max[0]) + pad, Math.min(y1, b.max[1]) + pad, Math.min(z1, b.max[2]) + pad, THIN_RADIUS);
    if (hash.count === 0) return;
    const pos = b.pos, vel = b.vel, im = b.invMass;
    const sv = this._sv;
    const maxPush = 0.01;
    for (let k = 0; k < cands.length; k++) {
      const c = cands[k];
      if (!c.enabled || c.flags & CF_TRIGGER || (c.shape !== SHAPE_CAPSULE && c.shape !== SHAPE_CYLINDER) || c.half[0] >= THIN_RADIUS) continue;
      if (!aabbOverlap(b.min, b.max, c.min, c.max, skin)) continue;
      const r = c.half[0], hl = c.half[1];
      const band = r + skin;
      // local Y axis in world space
      const axx = c.rot[1], axy = c.rot[4], axz = c.rot[7];
      const steps = Math.max(1, Math.ceil((2 * hl) / THIN_STEP));
      for (let s = 0; s <= steps; s++) {
        const f = -hl + (2 * hl * s) / steps;
        const px = c.pos[0] + axx * f, py = c.pos[1] + axy * f, pz = c.pos[2] + axz * f;
        if (px < b.min[0] - band || px > b.max[0] + band || py < b.min[1] - band || py > b.max[1] + band || pz < b.min[2] - band || pz > b.max[2] + band) continue;
        // nearest triangle that the point is in front of, within the contact band
        let best = -1, dist = band, u = 0, v = 0, w = 0;
        let start = hash.cellStart(px, py, pz);
        while (start >= 0) {
          const t = hash.entryTri[start];
          start = hash.entryNext[start];
          const t3 = t * 3;
          const tnx = hash.triN[t3], tny = hash.triN[t3 + 1], tnz = hash.triN[t3 + 2];
          const ta = b.tA[t] * 3;
          const ax = pos[ta], ay = pos[ta + 1], az = pos[ta + 2];
          const d = (px - ax) * tnx + (py - ay) * tny + (pz - az) * tnz;
          if (d < 0 || d >= dist) continue;
          const qx = px - tnx * d, qy = py - tny * d, qz = pz - tnz * d;
          const tb = b.tB[t] * 3, tc = b.tC[t] * 3;
          const e0x = pos[tb] - ax, e0y = pos[tb + 1] - ay, e0z = pos[tb + 2] - az;
          const e1x = pos[tc] - ax, e1y = pos[tc + 1] - ay, e1z = pos[tc + 2] - az;
          const wx = qx - ax, wy = qy - ay, wz = qz - az;
          const d00 = e0x * e0x + e0y * e0y + e0z * e0z;
          const d01 = e0x * e1x + e0y * e1y + e0z * e1z;
          const d11 = e1x * e1x + e1y * e1y + e1z * e1z;
          const d20 = wx * e0x + wy * e0y + wz * e0z;
          const d21 = wx * e1x + wy * e1y + wz * e1z;
          const den = d00 * d11 - d01 * d01;
          if (den < 1e-12) continue;
          const bv = (d11 * d20 - d01 * d21) / den;
          const bw = (d00 * d21 - d01 * d20) / den;
          const bu = 1 - bv - bw;
          if (bu < -0.02 || bv < -0.02 || bw < -0.02) continue;
          best = t;
          dist = d;
          u = bu;
          v = bv;
          w = bw;
        }
        if (best < 0) continue;
        const nx = hash.triN[best * 3], ny = hash.triN[best * 3 + 1], nz = hash.triN[best * 3 + 2];
        const ia = b.tA[best], ib = b.tB[best], ic = b.tC[best];
        const imT = u * u * im[ia] + v * v * im[ib] + w * w * im[ic];
        if (imT <= 0) continue;
        // the collider is immovable: the panel gives way
        const kp = Math.min(band - dist, maxPush) / imT;
        const ka = kp * u * im[ia], kb = kp * v * im[ib], kc = kp * w * im[ic];
        pos[ia * 3] -= nx * ka; pos[ia * 3 + 1] -= ny * ka; pos[ia * 3 + 2] -= nz * ka;
        pos[ib * 3] -= nx * kb; pos[ib * 3 + 1] -= ny * kb; pos[ib * 3 + 2] -= nz * kb;
        pos[ic * 3] -= nx * kc; pos[ic * 3 + 1] -= ny * kc; pos[ic * 3 + 2] -= nz * kc;
        let cvx = 0, cvy = 0, cvz = 0;
        if (c.kinematic) {
          c.velocityAt(px, py, pz, sv);
          cvx = sv[0]; cvy = sv[1]; cvz = sv[2];
        }
        const tvx = u * vel[ia * 3] + v * vel[ib * 3] + w * vel[ic * 3];
        const tvy = u * vel[ia * 3 + 1] + v * vel[ib * 3 + 1] + w * vel[ic * 3 + 1];
        const tvz = u * vel[ia * 3 + 2] + v * vel[ib * 3 + 2] + w * vel[ic * 3 + 2];
        // panel moving out into the collider (or the collider moving into it)
        const vn = (tvx - cvx) * nx + (tvy - cvy) * ny + (tvz - cvz) * nz;
        if (vn <= 0) continue;
        const jn = vn / imT;
        const ja = jn * u * im[ia], jb = jn * v * im[ib], jc = jn * w * im[ic];
        vel[ia * 3] -= nx * ja; vel[ia * 3 + 1] -= ny * ja; vel[ia * 3 + 2] -= nz * ja;
        vel[ib * 3] -= nx * jb; vel[ib * 3 + 1] -= ny * jb; vel[ib * 3 + 2] -= nz * jb;
        vel[ic * 3] -= nx * jc; vel[ic * 3 + 1] -= ny * jc; vel[ic * 3 + 2] -= nz * jc;
        if (vn > b.impactSpeed) {
          b.impactSpeed = vn;
          b.impactX = px;
          b.impactY = py;
          b.impactZ = pz;
          b.impactMaterial = b.material[ia];
        }
        if (vn > c.contactSpeed || c.lastContactFrame !== this.frameIndex) c.contactSpeed = vn;
        c.lastContactFrame = this.frameIndex;
      }
    }
  }

  /** Nodes of `a` against triangles of `b`. */
  private nodesVsTris(a: SoftBody, b: SoftBody): void {
    if (b.t === 0) return;
    const pad = b.skin + 0.05;
    const x0 = Math.max(a.min[0], b.min[0]) - pad, x1 = Math.min(a.max[0], b.max[0]) + pad;
    const y0 = Math.max(a.min[1], b.min[1]) - pad, y1 = Math.min(a.max[1], b.max[1]) + pad;
    const z0 = Math.max(a.min[2], b.min[2]) - pad, z1 = Math.min(a.max[2], b.max[2]) + pad;
    if (x0 > x1 || y0 > y1 || z0 > z1) return;
    const hash = this.triHash;
    hash.build(b, x0, y0, z0, x1, y1, z1);
    if (hash.count === 0) return;
    const apos = a.pos, avel = a.vel, aim = a.invMass, af = a.nodeFlags;
    const bpos = b.pos, bvel = b.vel, bim = b.invMass;
    // sleeping bodies are not integrated, so they take no corrections
    const sa = a.sleeping ? 0 : 1, sb = b.sleeping ? 0 : 1;
    const skin = b.skin;
    const maxDepth = 0.1;
    const maxPush = 0.003;
    for (let i = 0; i < a.n; i++) {
      if (!(af[i] & NODE_SOFTCOLLIDE)) continue;
      const i3 = i * 3;
      const px = apos[i3], py = apos[i3 + 1], pz = apos[i3 + 2];
      if (px < x0 || px > x1 || py < y0 || py > y1 || pz < z0 || pz > z1) continue;
      // Respond to a single triangle: the one the node is least deep behind.
      // For a convex body that face is the minimum-translation direction, so a
      // node resting on a top face near an edge isn't shoved off sideways by
      // the side face that meets it there.
      let best = -1, dist = -Infinity, u = 0, v = 0, w = 0;
      let start = hash.cellStart(px, py, pz);
      while (start >= 0) {
        const t = hash.entryTri[start];
        start = hash.entryNext[start];
        const t3 = t * 3;
        const tnx = hash.triN[t3], tny = hash.triN[t3 + 1], tnz = hash.triN[t3 + 2];
        const ta = b.tA[t] * 3;
        const ax = bpos[ta], ay = bpos[ta + 1], az = bpos[ta + 2];
        const d = (px - ax) * tnx + (py - ay) * tny + (pz - az) * tnz;
        if (d >= skin || d < -maxDepth || d <= dist) continue;
        // barycentric of projection
        const qx = px - tnx * d, qy = py - tny * d, qz = pz - tnz * d;
        const tb = b.tB[t] * 3, tc = b.tC[t] * 3;
        const e0x = bpos[tb] - ax, e0y = bpos[tb + 1] - ay, e0z = bpos[tb + 2] - az;
        const e1x = bpos[tc] - ax, e1y = bpos[tc + 1] - ay, e1z = bpos[tc + 2] - az;
        const wx = qx - ax, wy = qy - ay, wz = qz - az;
        const d00 = e0x * e0x + e0y * e0y + e0z * e0z;
        const d01 = e0x * e1x + e0y * e1y + e0z * e1z;
        const d11 = e1x * e1x + e1y * e1y + e1z * e1z;
        const d20 = wx * e0x + wy * e0y + wz * e0z;
        const d21 = wx * e1x + wy * e1y + wz * e1z;
        const den = d00 * d11 - d01 * d01;
        if (den < 1e-12) continue;
        const bv = (d11 * d20 - d01 * d21) / den;
        const bw = (d00 * d21 - d01 * d20) / den;
        const bu = 1 - bv - bw;
        // a little slack so nodes can't slip between neighbouring triangles
        const margin = -0.02;
        if (bu < margin || bv < margin || bw < margin) continue;
        best = t;
        dist = d;
        u = bu;
        v = bv;
        w = bw;
      }
      if (best < 0) continue;
      const nx = hash.triN[best * 3], ny = hash.triN[best * 3 + 1], nz = hash.triN[best * 3 + 2];
      const ia = b.tA[best], ib = b.tB[best], ic = b.tC[best];
      // effective masses
      const imP = aim[i] * sa;
      const imT = (u * u * bim[ia] + v * v * bim[ib] + w * w * bim[ic]) * sb;
      const imSum = imP + imT;
      if (imSum <= 0) continue;
      // positional correction, capped per substep so deep overlaps resolve
      // smoothly through the velocity response instead of snapping beams
      const pen = Math.min(skin - dist, maxPush);
      const kp = pen / imSum;
      apos[i3] += nx * kp * imP;
      apos[i3 + 1] += ny * kp * imP;
      apos[i3 + 2] += nz * kp * imP;
      const ka = kp * u * bim[ia] * sb, kb = kp * v * bim[ib] * sb, kc = kp * w * bim[ic] * sb;
      bpos[ia * 3] -= nx * ka; bpos[ia * 3 + 1] -= ny * ka; bpos[ia * 3 + 2] -= nz * ka;
      bpos[ib * 3] -= nx * kb; bpos[ib * 3 + 1] -= ny * kb; bpos[ib * 3 + 2] -= nz * kb;
      bpos[ic * 3] -= nx * kc; bpos[ic * 3 + 1] -= ny * kc; bpos[ic * 3 + 2] -= nz * kc;
      // velocity response
      const tvx = u * bvel[ia * 3] + v * bvel[ib * 3] + w * bvel[ic * 3];
      const tvy = u * bvel[ia * 3 + 1] + v * bvel[ib * 3 + 1] + w * bvel[ic * 3 + 1];
      const tvz = u * bvel[ia * 3 + 2] + v * bvel[ib * 3 + 2] + w * bvel[ic * 3 + 2];
      const rvx = avel[i3] - tvx, rvy = avel[i3 + 1] - tvy, rvz = avel[i3 + 2] - tvz;
      const vn = rvx * nx + rvy * ny + rvz * nz;
      if (vn < 0) {
        const jn = -vn / imSum;
        // friction
        let tx = rvx - nx * vn, ty = rvy - ny * vn, tz = rvz - nz * vn;
        const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
        const mu = 0.45;
        let jt = 0;
        if (tl > 1e-6) {
          jt = Math.min(mu * jn, tl / imSum);
          tx /= tl;
          ty /= tl;
          tz /= tl;
        }
        const jx = nx * jn - tx * jt, jy = ny * jn - ty * jt, jz = nz * jn - tz * jt;
        avel[i3] += jx * imP;
        avel[i3 + 1] += jy * imP;
        avel[i3 + 2] += jz * imP;
        const ja = u * bim[ia] * sb, jb = v * bim[ib] * sb, jc = w * bim[ic] * sb;
        if (!sa || !sb) {
          const lateral = jn * Math.sqrt(nx * nx + nz * nz);
          if (!sa) a.pushImpulse += lateral;
          else b.pushImpulse += lateral;
        }
        bvel[ia * 3] -= jx * ja; bvel[ia * 3 + 1] -= jy * ja; bvel[ia * 3 + 2] -= jz * ja;
        bvel[ib * 3] -= jx * jb; bvel[ib * 3 + 1] -= jy * jb; bvel[ib * 3 + 2] -= jz * jb;
        bvel[ic * 3] -= jx * jc; bvel[ic * 3 + 1] -= jy * jc; bvel[ic * 3 + 2] -= jz * jc;
        const speed = -vn;
        if (speed > a.impactSpeed) {
          a.impactSpeed = speed;
          a.impactX = px;
          a.impactY = py;
          a.impactZ = pz;
          a.impactMaterial = a.material[i];
        }
        if (speed > b.impactSpeed) {
          b.impactSpeed = speed;
          b.impactX = px;
          b.impactY = py;
          b.impactZ = pz;
          b.impactMaterial = a.material[i];
        }
        if (tl > 1.5 && a.material[i] === Mat.METAL) {
          a.scrapeCount++;
          a.scrapeSparks++;
          if (tl > a.scrapeSpeed) {
            a.scrapeSpeed = tl;
            a.scrapeX = px;
            a.scrapeY = py;
            a.scrapeZ = pz;
            a.scrapeNx = nx;
            a.scrapeNy = ny;
            a.scrapeNz = nz;
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Queries

  private _rh = makeRayHit();
  private _qc: Collider[] = [];

  /**
   * Cast a ray against terrain and colliders. Direction must be normalized.
   * Returns true on hit; result in `out`.
   */
  raycast(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    maxT: number, out: RayHit,
    candidates?: Collider[], forWheels = false,
  ): boolean {
    out.t = Infinity;
    out.collider = null;
    let hit = false;
    if (this.terrain) {
      const ts = this._ts;
      const t = this.terrain.raycast(ox, oy, oz, dx, dy, dz, maxT, ts);
      if (t >= 0) {
        out.t = t;
        out.nx = ts.nx;
        out.ny = ts.ny;
        out.nz = ts.nz;
        out.vx = out.vy = out.vz = 0;
        out.surface = this.terrain.surfaceAt(ox + dx * t, oz + dz * t);
        out.flags = 0;
        hit = true;
      }
    }
    let list = candidates;
    if (!list) {
      list = this._qc;
      list.length = 0;
      const ex = ox + dx * maxT, ey = oy + dy * maxT, ez = oz + dz * maxT;
      this.statics.query(
        Math.min(ox, ex), Math.min(oy, ey), Math.min(oz, ez),
        Math.max(ox, ex), Math.max(oy, ey), Math.max(oz, ez), list,
      );
      for (const k of this.kinematics) if (k.enabled) list.push(k);
    }
    const rh = this._rh;
    const lim = Math.min(maxT, out.t);
    let best = lim;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.enabled || c.flags & CF_TRIGGER) continue;
      if (forWheels && c.flags & CF_NO_WHEELS) continue;
      // quick AABB reject of the ray segment
      const ex = ox + dx * best, ey = oy + dy * best, ez = oz + dz * best;
      if (Math.max(ox, ex) < c.min[0] || Math.min(ox, ex) > c.max[0]) continue;
      if (Math.max(oy, ey) < c.min[1] || Math.min(oy, ey) > c.max[1]) continue;
      if (Math.max(oz, ez) < c.min[2] || Math.min(oz, ez) > c.max[2]) continue;
      const t = rayQuery(c, ox, oy, oz, dx, dy, dz, best, rh);
      if (t >= 0 && t <= best) {
        best = t;
        out.t = t;
        out.nx = rh.nx;
        out.ny = rh.ny;
        out.nz = rh.nz;
        out.vx = rh.vx;
        out.vy = rh.vy;
        out.vz = rh.vz;
        out.surface = rh.surface;
        out.collider = c;
        out.flags = rh.flags;
        hit = true;
      }
    }
    return hit;
  }

  /**
   * Raise a freshly placed body so that none of its colliding nodes starts
   * inside the terrain. Pushing a deeply buried node out in one substep would
   * load its beams with a huge spring energy and launch the body.
   */
  liftClear(b: SoftBody, margin = 0.01): void {
    const t = this.terrain;
    if (!t) return;
    const p = b.pos;
    let lift = 0;
    for (let i = 0; i < b.n; i++) {
      if (!(b.nodeFlags[i] & NODE_COLLIDE)) continue;
      const d = t.heightAt(p[i * 3], p[i * 3 + 2]) + margin - p[i * 3 + 1];
      if (d > lift) lift = d;
    }
    if (lift <= 0) return;
    for (let i = 0; i < b.n; i++) p[i * 3 + 1] += lift;
    b.computeBounds();
  }

  /**
   * Surface to put a vehicle on near height `nearY`: cast down from just above
   * it (never from inside the terrain), so a reset under a gantry or bridge
   * lands back on the road rather than on the structure overhead.
   */
  spawnHeight(x: number, z: number, nearY: number): number {
    const terrainY = this.terrain ? this.terrain.heightAt(x, z) : 0;
    return this.groundHeight(x, z, Math.max(nearY + 2.5, terrainY + 0.5));
  }

  /** Ground height below a point, including colliders (for spawning). */
  groundHeight(x: number, z: number, fromY = 300): number {
    const out = makeRayHit();
    if (this.raycast(x, fromY, z, 0, -1, 0, fromY + 200, out)) return fromY - out.t;
    return 0;
  }

  /** Raycast against soft bodies' collision triangles (for camera/editor picking). */
  raycastBodies(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, ignore?: SoftBody): { t: number; body: SoftBody | null } {
    let best = maxT;
    let bestBody: SoftBody | null = null;
    for (const b of this.bodies) {
      if (b === ignore || !b.active) continue;
      // slab test on AABB
      if (!rayAabb(ox, oy, oz, dx, dy, dz, b.min, b.max, best)) continue;
      const p = b.pos;
      for (let t = 0; t < b.t; t++) {
        const ia = b.tA[t] * 3, ib = b.tB[t] * 3, ic = b.tC[t] * 3;
        const tt = rayTri(ox, oy, oz, dx, dy, dz, p[ia], p[ia + 1], p[ia + 2], p[ib], p[ib + 1], p[ib + 2], p[ic], p[ic + 1], p[ic + 2]);
        if (tt >= 0 && tt < best) {
          best = tt;
          bestBody = b;
        }
      }
    }
    return { t: bestBody ? best : -1, body: bestBody };
  }
}

export function aabbOverlap(amin: ArrayLike<number>, amax: ArrayLike<number>, bmin: ArrayLike<number>, bmax: ArrayLike<number>, pad = 0): boolean {
  return !(
    amax[0] + pad < bmin[0] || amin[0] - pad > bmax[0] ||
    amax[1] + pad < bmin[1] || amin[1] - pad > bmax[1] ||
    amax[2] + pad < bmin[2] || amin[2] - pad > bmax[2]
  );
}

function rayAabb(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, mn: ArrayLike<number>, mx: ArrayLike<number>, maxT: number): boolean {
  let t0 = 0, t1 = maxT;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < mn[k] || o[k] > mx[k]) return false;
      continue;
    }
    let a = (mn[k] - o[k]) / d[k], b = (mx[k] - o[k]) / d[k];
    if (a > b) {
      const t = a; a = b; b = t;
    }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  return true;
}

/** Möller–Trumbore, double sided. */
export function rayTri(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
): number {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det;
  const tx = ox - ax, ty = oy - ay, tz = oz - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= 0 ? t : -1;
}

// ---------------------------------------------------------------------------
// Spatial hash of a body's triangles for node-vs-triangle tests.

class TriHash {
  cell = 0.6;
  size = 4096;
  head = new Int32Array(this.size).fill(-1);
  stampArr = new Int32Array(this.size);
  stamp = 1;
  entryTri = new Int32Array(8192);
  entryNext = new Int32Array(8192);
  count = 0;
  triN = new Float64Array(3 * 1024);

  private h(ix: number, iy: number, iz: number): number {
    return ((Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) >>> 0) & (this.size - 1);
  }

  cellStart(x: number, y: number, z: number): number {
    const c = this.cell;
    const k = this.h(Math.floor(x / c), Math.floor(y / c), Math.floor(z / c));
    if (this.stampArr[k] !== this.stamp) return -1;
    return this.head[k];
  }

  build(b: SoftBody, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, extraPad = 0): void {
    this.stamp++;
    this.count = 0;
    if (this.triN.length < b.t * 3) this.triN = new Float64Array(b.t * 3 * 2);
    const p = b.pos, c = this.cell, skin = b.skin + 0.02 + extraPad;
    const N = this.triN;
    for (let t = 0; t < b.t; t++) {
      if (!b.tEnabled[t]) continue;
      const ia = b.tA[t] * 3, ib = b.tB[t] * 3, ic = b.tC[t] * 3;
      const ax = p[ia], ay = p[ia + 1], az = p[ia + 2];
      const bx = p[ib], by = p[ib + 1], bz = p[ib + 2];
      const cx = p[ic], cy = p[ic + 1], cz = p[ic + 2];
      let mnx = Math.min(ax, bx, cx), mxx = Math.max(ax, bx, cx);
      let mny = Math.min(ay, by, cy), mxy = Math.max(ay, by, cy);
      let mnz = Math.min(az, bz, cz), mxz = Math.max(az, bz, cz);
      if (mxx < x0 || mnx > x1 || mxy < y0 || mny > y1 || mxz < z0 || mnz > z1) continue;
      // skip torn/stretched triangles
      if (mxx - mnx > 2.5 || mxy - mny > 2.5 || mxz - mnz > 2.5) continue;
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l < 1e-10) continue;
      nx /= l; ny /= l; nz /= l;
      N[t * 3] = nx; N[t * 3 + 1] = ny; N[t * 3 + 2] = nz;
      // expand by the collision band (skin in front, max depth behind)
      const px = skin + Math.abs(nx) * 0.2, py = skin + Math.abs(ny) * 0.2, pz = skin + Math.abs(nz) * 0.2;
      mnx -= px; mxx += px;
      mny -= py; mxy += py;
      mnz -= pz; mxz += pz;
      const ix0 = Math.floor(Math.max(mnx, x0 - c) / c), ix1 = Math.floor(Math.min(mxx, x1 + c) / c);
      const iy0 = Math.floor(Math.max(mny, y0 - c) / c), iy1 = Math.floor(Math.min(mxy, y1 + c) / c);
      const iz0 = Math.floor(Math.max(mnz, z0 - c) / c), iz1 = Math.floor(Math.min(mxz, z1 + c) / c);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iy = iy0; iy <= iy1; iy++) {
          for (let iz = iz0; iz <= iz1; iz++) {
            const k = this.h(ix, iy, iz);
            if (this.stampArr[k] !== this.stamp) {
              this.stampArr[k] = this.stamp;
              this.head[k] = -1;
            }
            if (this.count >= this.entryTri.length) this.grow();
            const e = this.count++;
            this.entryTri[e] = t;
            this.entryNext[e] = this.head[k];
            this.head[k] = e;
          }
        }
      }
    }
  }

  private grow(): void {
    const n = this.entryTri.length * 2;
    const a = new Int32Array(n);
    a.set(this.entryTri);
    const b = new Int32Array(n);
    b.set(this.entryNext);
    this.entryTri = a;
    this.entryNext = b;
  }
}

export { Surface };
