// Lightweight impulse-based rigid bodies (crates, barrels, pots, debris, dropped weapons, bombs).
// Each body is an oriented box (or cylinder approximated by rim points) colliding with the dungeon
// grid, static obstacles and (coarsely) other bodies. Contacts are solved with sequential impulses
// against a proper inertia tensor; penetration is fixed with split impulses so resolving overlap never
// injects energy, and bodies settle and fall asleep instead of jittering forever.
import * as THREE from 'three';
import { TILE } from '../world/constants.js';

const GRAVITY = 20;
const ITER = 8;
const POS_ITER = 4;
const SLOP = 0.004;
const BETA = 0.35;
const BOUNCE_MIN = 1.8; // approach speed below which impacts never bounce
const SPECULATIVE = 0.03;
const MAX_ANG = 40;
const MAX_VEL = 40;

export class RigidBody {
  // shape: {type:'box', hx,hy,hz} | {type:'cyl', r, hy}
  constructor(shape, opts = {}) {
    this.shape = shape;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.ang = new THREE.Vector3();
    this.mass = opts.mass ?? 1;
    this.invMass = 1 / this.mass;
    this.restitution = opts.restitution ?? 0.25;
    this.friction = opts.friction ?? 0.6;
    this.mesh = opts.mesh || null;
    this.sleeping = false;
    this.sleepTimer = 0;
    this.restT = 0;
    this.radius = 0;
    this.points = [];
    this.alive = true;
    this.life = opts.life ?? Infinity;
    this.fade = opts.fade ?? 0;
    this.onImpact = opts.onImpact || null;
    this.collideBodies = opts.collideBodies ?? true;
    this.owner = opts.owner || null; // prop / item this body belongs to
    this.grounded = false;
    this.support = false;
    this.impactCooldown = 0;
    this.minY = 0;
    this.maxY = 0;
    this._buildPoints();
    // body-space principal inverse inertia, and its world-space counterpart (row-major 3x3)
    const m = this.mass, s = shape;
    let ix, iy, iz;
    if (s.type === 'box') {
      ix = (m / 3) * (s.hy * s.hy + s.hz * s.hz);
      iy = (m / 3) * (s.hx * s.hx + s.hz * s.hz);
      iz = (m / 3) * (s.hx * s.hx + s.hy * s.hy);
    } else {
      iy = (m * s.r * s.r) / 2;
      ix = iz = (m * (3 * s.r * s.r + 4 * s.hy * s.hy)) / 12;
    }
    // very thin shapes get a floor on their inertia so they can't spin up absurdly about their long axis
    const floor = m * 0.006;
    this.invI = [1 / Math.max(ix, floor), 1 / Math.max(iy, floor), 1 / Math.max(iz, floor)];
    this.I = new Float64Array(9);
    this.R = new Float64Array(9);
  }

  _buildPoints() {
    const s = this.shape;
    if (s.type === 'box') {
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) this.points.push(new THREE.Vector3(x * s.hx, y * s.hy, z * s.hz));
      this.radius = Math.hypot(s.hx, s.hy, s.hz);
    } else {
      const n = 8;
      for (const y of [-1, 1]) for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.points.push(new THREE.Vector3(Math.cos(a) * s.r, y * s.hy, Math.sin(a) * s.r));
      }
      this.radius = Math.hypot(s.r, s.hy);
    }
    // horizontal radius used for actor pushing
    this.hRadius = s.type === 'box' ? Math.max(s.hx, s.hz) : s.r;
  }

  // Refresh the rotation matrix and world-space inverse inertia from the orientation.
  updateFrame() {
    const { x, y, z, w } = this.quat;
    const R = this.R;
    R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y - z * w); R[2] = 2 * (x * z + y * w);
    R[3] = 2 * (x * y + z * w); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z - x * w);
    R[6] = 2 * (x * z - y * w); R[7] = 2 * (y * z + x * w); R[8] = 1 - 2 * (x * x + y * y);
    const [a, b, c] = this.invI;
    const I = this.I;
    for (let i = 0; i < 3; i++) for (let j = i; j < 3; j++) {
      const v = R[i * 3] * a * R[j * 3] + R[i * 3 + 1] * b * R[j * 3 + 1] + R[i * 3 + 2] * c * R[j * 3 + 2];
      I[i * 3 + j] = v;
      I[j * 3 + i] = v;
    }
  }

  // Recompute the vertical extent (used for stacking and support tests).
  updateBounds() {
    this.updateFrame();
    const R = this.R;
    let lo = Infinity, hi = -Infinity;
    for (const p of this.points) {
      const y = R[3] * p.x + R[4] * p.y + R[5] * p.z;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    this.minY = this.pos.y + lo;
    this.maxY = this.pos.y + hi;
  }

  wake() {
    if (this.sleeping) this.restT = 0;
    this.sleeping = false;
    this.sleepTimer = 0;
  }

  sleep() {
    this.sleeping = true;
    this.vel.set(0, 0, 0);
    this.ang.set(0, 0, 0);
  }

  // impulse applied at a world-space point (or through the centre of mass)
  applyImpulse(impulse, point) {
    this.wake();
    this.vel.addScaledVector(impulse, this.invMass);
    if (point) {
      this.updateFrame();
      const rx = point.x - this.pos.x, ry = point.y - this.pos.y, rz = point.z - this.pos.z;
      this._addAng(this.ang, ry * impulse.z - rz * impulse.y, rz * impulse.x - rx * impulse.z, rx * impulse.y - ry * impulse.x);
    }
  }

  // w += I^-1 * t
  _addAng(w, tx, ty, tz) {
    const I = this.I;
    w.x += I[0] * tx + I[1] * ty + I[2] * tz;
    w.y += I[3] * tx + I[4] * ty + I[5] * tz;
    w.z += I[6] * tx + I[7] * ty + I[8] * tz;
  }

  syncMesh() {
    if (!this.mesh) return;
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
  }
}

// contact scratch record
function makeContact() {
  return { rx: 0, ry: 0, rz: 0, nx: 0, ny: 0, nz: 0, pen: 0, t1x: 0, t1y: 0, t1z: 0, t2x: 0, t2y: 0, t2z: 0, mN: 0, mT1: 0, mT2: 0, bias: 0, pb: 0, jn: 0, jt1: 0, jt2: 0, jp: 0 };
}

const _pv = new THREE.Vector3();
const _pw = new THREE.Vector3();
const _w = new THREE.Vector3();
const _dq = new THREE.Quaternion();

export class PhysicsWorld {
  constructor(world) {
    this.world = world;
    this.level = null; // optional: static obstacles (pillars, door panels, counters...)
    this.bodies = [];
    this._cs = [];
    this._obsSet = new Set();
  }

  add(body) {
    this.bodies.push(body);
    body.updateBounds();
    body.syncMesh();
    return body;
  }

  remove(body) {
    body.alive = false;
  }

  clear() {
    this.bodies.length = 0;
  }

  update(dt, onRemove) {
    const sub = dt > 1 / 45 ? 2 : 1;
    const h = dt / sub;
    const bs = this.bodies;
    for (let s = 0; s < sub; s++) {
      for (const b of bs) if (b.alive && !b.sleeping) this._integrate(b, h);
      this._bodyCollisions();
      for (const b of bs) if (b.alive && !b.sleeping) this._sleepCheck(b, h);
    }
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      if (b.life !== Infinity) {
        b.life -= dt;
        if (b.life <= 0) b.alive = false;
        else if (b.fade && b.life < b.fade && b.mesh) {
          const k = b.life / b.fade;
          b.mesh.scale.setScalar(Math.max(0.01, k));
        }
      }
      if (!b.alive) {
        bs.splice(i, 1);
        this._wakeAbove(b);
        if (b.mesh) b.mesh.removeFromParent();
        if (onRemove) onRemove(b);
        continue;
      }
      b.syncMesh();
    }
  }

  // anything resting on a body that disappeared must fall
  _wakeAbove(gone) {
    if (!gone.collideBodies) return;
    for (const o of this.bodies) {
      if (!o.sleeping || !o.collideBodies) continue;
      const dx = o.pos.x - gone.pos.x, dz = o.pos.z - gone.pos.z;
      const rr = o.hRadius + gone.hRadius + 0.1;
      if (dx * dx + dz * dz < rr * rr && o.minY > gone.minY + 0.05) o.wake();
    }
  }

  _sleepCheck(b, h) {
    const v2 = b.vel.lengthSq(), w2 = b.ang.lengthSq();
    const rested = b.grounded || b.support;
    if (rested && v2 < 0.06 && w2 < 0.25) {
      b.sleepTimer += h;
      if (b.sleepTimer > 0.3) b.sleep();
    } else b.sleepTimer = 0;
    // backstop: anything that has been dribbling around on the ground for a while settles for good
    if (rested) {
      b.restT += h;
      if (b.restT > 5 && v2 < 0.6 && w2 < 4) b.sleep();
    }
    if (b.pos.y < -20) b.alive = false;
  }

  _integrate(b, h) {
    b.impactCooldown -= h;
    b.vel.y -= GRAVITY * h;
    b.vel.multiplyScalar(Math.exp(-0.05 * h));
    // spin bleeds off quickly while touching the ground (rolling resistance)
    b.ang.multiplyScalar(Math.exp((b.grounded ? -2.2 : -0.12) * h));
    if (b.grounded) {
      const k = Math.exp(-0.6 * h);
      b.vel.x *= k;
      b.vel.z *= k;
    }
    b.updateFrame();
    const n = this._collect(b);
    const cs = this._cs;
    const im = b.invMass, v = b.vel, w = b.ang, I = b.I;
    let impact = 0;
    let ground = false;
    // ---- prepare
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      const { rx, ry, rz, nx, ny, nz } = c;
      c.mN = 1 / (im + this._angK(I, rx, ry, rz, nx, ny, nz));
      // tangent basis
      if (Math.abs(ny) > 0.7) { c.t1x = 1; c.t1y = 0; c.t1z = 0; } else { c.t1x = 0; c.t1y = 1; c.t1z = 0; }
      // orthogonalise t1 against n, t2 = n x t1
      const d = c.t1x * nx + c.t1y * ny + c.t1z * nz;
      c.t1x -= nx * d; c.t1y -= ny * d; c.t1z -= nz * d;
      const tl = Math.hypot(c.t1x, c.t1y, c.t1z) || 1;
      c.t1x /= tl; c.t1y /= tl; c.t1z /= tl;
      c.t2x = ny * c.t1z - nz * c.t1y; c.t2y = nz * c.t1x - nx * c.t1z; c.t2z = nx * c.t1y - ny * c.t1x;
      c.mT1 = 1 / (im + this._angK(I, rx, ry, rz, c.t1x, c.t1y, c.t1z));
      c.mT2 = 1 / (im + this._angK(I, rx, ry, rz, c.t2x, c.t2y, c.t2z));
      const vn = (v.x + w.y * rz - w.z * ry) * nx + (v.y + w.z * rx - w.x * rz) * ny + (v.z + w.x * ry - w.y * rx) * nz;
      if (vn < 0 && c.pen > -0.005) impact = Math.max(impact, -vn);
      if (vn < -BOUNCE_MIN) c.bias = -b.restitution * vn;
      else if (c.pen < 0) c.bias = c.pen / h; // speculative: may still approach this fast
      else c.bias = 0;
      c.pb = c.pen > SLOP ? (BETA * Math.min(c.pen - SLOP, 0.25)) / h : 0;
      c.jn = c.jt1 = c.jt2 = c.jp = 0;
      if (ny > 0.5 && c.pen > -0.01) ground = true;
    }
    // ---- velocity iterations
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < n; i++) {
        const c = cs[i];
        const { rx, ry, rz, nx, ny, nz } = c;
        let vx = v.x + w.y * rz - w.z * ry, vy = v.y + w.z * rx - w.x * rz, vz = v.z + w.x * ry - w.y * rx;
        const vn = vx * nx + vy * ny + vz * nz;
        let dj = c.mN * (c.bias - vn);
        const old = c.jn;
        c.jn = Math.max(0, old + dj);
        dj = c.jn - old;
        if (dj !== 0) this._apply(b, v, w, rx, ry, rz, nx * dj, ny * dj, nz * dj, im);
        // friction (circular cone)
        vx = v.x + w.y * rz - w.z * ry; vy = v.y + w.z * rx - w.x * rz; vz = v.z + w.x * ry - w.y * rx;
        const vt1 = vx * c.t1x + vy * c.t1y + vz * c.t1z;
        const vt2 = vx * c.t2x + vy * c.t2y + vz * c.t2z;
        const o1 = c.jt1, o2 = c.jt2;
        let n1 = o1 - c.mT1 * vt1, n2 = o2 - c.mT2 * vt2;
        const maxF = b.friction * c.jn;
        const l = Math.hypot(n1, n2);
        if (l > maxF) { const s = l > 1e-9 ? maxF / l : 0; n1 *= s; n2 *= s; }
        c.jt1 = n1; c.jt2 = n2;
        const d1 = n1 - o1, d2 = n2 - o2;
        if (d1 !== 0 || d2 !== 0) this._apply(b, v, w, rx, ry, rz, c.t1x * d1 + c.t2x * d2, c.t1y * d1 + c.t2y * d2, c.t1z * d1 + c.t2z * d2, im);
      }
    }
    // ---- split-impulse position correction (pseudo velocities, discarded afterwards)
    const pv = _pv.set(0, 0, 0), pw = _pw.set(0, 0, 0);
    for (let it = 0; it < POS_ITER; it++) {
      for (let i = 0; i < n; i++) {
        const c = cs[i];
        if (c.pb <= 0) continue;
        const { rx, ry, rz, nx, ny, nz } = c;
        const vn = (pv.x + pw.y * rz - pw.z * ry) * nx + (pv.y + pw.z * rx - pw.x * rz) * ny + (pv.z + pw.x * ry - pw.y * rx) * nz;
        let dj = c.mN * (c.pb - vn);
        const old = c.jp;
        c.jp = Math.max(0, old + dj);
        dj = c.jp - old;
        if (dj !== 0) this._apply(b, pv, pw, rx, ry, rz, nx * dj, ny * dj, nz * dj, im);
      }
    }
    // clamp runaway speeds
    const vl = v.length();
    if (vl > MAX_VEL) v.multiplyScalar(MAX_VEL / vl);
    const wl = w.length();
    if (wl > MAX_ANG) w.multiplyScalar(MAX_ANG / wl);
    // ---- integrate
    const ox = b.pos.x, oz = b.pos.z;
    b.pos.x += (v.x + pv.x) * h;
    b.pos.y += (v.y + pv.y) * h;
    b.pos.z += (v.z + pv.z) * h;
    _w.copy(w).add(pw);
    const al = _w.length();
    if (al > 1e-6) {
      _dq.setFromAxisAngle(_w.divideScalar(al), al * h);
      b.quat.premultiply(_dq).normalize();
    }
    this._noTunnel(b, ox, oz);
    b.grounded = ground;
    b.support = false;
    if (impact > 2.5 && b.onImpact && b.impactCooldown <= 0) {
      b.impactCooldown = 0.12;
      b.onImpact(b, impact);
    }
  }

  // Fast bodies (thrown bombs, flung weapons) must not skip through thin closed door panels.
  _noTunnel(b, ox, oz) {
    const tw = this.world.thinWalls;
    if (!tw || !tw.length) return;
    const pad = Math.min(b.hRadius, 0.15);
    for (const w of tw) {
      if (b.minY > w.y1) continue;
      const thinX = w.x1 - w.x0 < w.z1 - w.z0;
      const a0 = thinX ? ox : oz, a1 = thinX ? b.pos.x : b.pos.z, across = thinX ? b.pos.z : b.pos.x;
      if (across < (thinX ? w.z0 : w.x0) || across > (thinX ? w.z1 : w.x1)) continue;
      const mid = thinX ? (w.x0 + w.x1) / 2 : (w.z0 + w.z1) / 2;
      const s0 = a0 - mid, s1 = a1 - mid;
      if (Math.sign(s0) === Math.sign(s1) || s0 === 0) continue;
      const half = (thinX ? w.x1 - w.x0 : w.z1 - w.z0) / 2 + pad;
      const side = Math.sign(s0);
      if (thinX) { b.pos.x = mid + side * half; if (b.vel.x * side < 0) b.vel.x *= -b.restitution; }
      else { b.pos.z = mid + side * half; if (b.vel.z * side < 0) b.vel.z *= -b.restitution; }
      if (b.onImpact && b.impactCooldown <= 0) { b.impactCooldown = 0.12; b.onImpact(b, 6); }
    }
  }

  // (r x d) . I^-1 (r x d)
  _angK(I, rx, ry, rz, dx, dy, dz) {
    const cx = ry * dz - rz * dy, cy = rz * dx - rx * dz, cz = rx * dy - ry * dx;
    return cx * (I[0] * cx + I[1] * cy + I[2] * cz) + cy * (I[3] * cx + I[4] * cy + I[5] * cz) + cz * (I[6] * cx + I[7] * cy + I[8] * cz);
  }

  _apply(b, v, w, rx, ry, rz, jx, jy, jz, im) {
    v.x += jx * im; v.y += jy * im; v.z += jz * im;
    b._addAng(w, ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx);
  }

  _push(n, rx, ry, rz, nx, ny, nz, pen) {
    let c = this._cs[n];
    if (!c) c = this._cs[n] = makeContact();
    c.rx = rx; c.ry = ry; c.rz = rz;
    c.nx = nx; c.ny = ny; c.nz = nz;
    c.pen = pen;
    return n + 1;
  }

  // Gathers contacts for all hull points against floor, ceiling, walls and static obstacles.
  _collect(b) {
    const world = this.world;
    const R = b.R;
    const floorY = world.floorAt(b.pos.x, b.pos.z);
    const ceilY = world.ceilAt(b.pos.x, b.pos.z);
    let obs = null;
    if (this.level) {
      obs = this.level._nearObstacles(b.pos.x, b.pos.z, b.radius + 0.1, this._obsSet);
      if (!obs.size) obs = null;
    }
    let n = 0;
    let lo = Infinity, hi = -Infinity;
    for (const lp of b.points) {
      const rx = R[0] * lp.x + R[1] * lp.y + R[2] * lp.z;
      const ry = R[3] * lp.x + R[4] * lp.y + R[5] * lp.z;
      const rz = R[6] * lp.x + R[7] * lp.y + R[8] * lp.z;
      const px = b.pos.x + rx, py = b.pos.y + ry, pz = b.pos.z + rz;
      if (py < lo) lo = py;
      if (py > hi) hi = py;
      // floor
      const pen = floorY - py;
      if (pen > -SPECULATIVE) n = this._push(n, rx, ry, rz, 0, 1, 0, pen);
      // ceiling
      if (py > ceilY) n = this._push(n, rx, ry, rz, 0, -1, 0, py - ceilY);
      // walls: push out through the nearest face that borders open space
      if (world.solidAt(px, pz)) {
        const cx = Math.floor(px / TILE), cz = Math.floor(pz / TILE);
        let best = Infinity, nx = 0, nz = 0;
        if (!world.solidCell(cx - 1, cz)) { const d = px - cx * TILE; if (d < best) { best = d; nx = -1; nz = 0; } }
        if (!world.solidCell(cx + 1, cz)) { const d = (cx + 1) * TILE - px; if (d < best) { best = d; nx = 1; nz = 0; } }
        if (!world.solidCell(cx, cz - 1)) { const d = pz - cz * TILE; if (d < best) { best = d; nx = 0; nz = -1; } }
        if (!world.solidCell(cx, cz + 1)) { const d = (cz + 1) * TILE - pz; if (d < best) { best = d; nx = 0; nz = 1; } }
        if (best === Infinity) {
          // buried deep: head back toward the body's centre
          const dx = b.pos.x - px, dz = b.pos.z - pz;
          if (Math.abs(dx) > Math.abs(dz)) { nx = Math.sign(dx) || 1; nz = 0; } else { nx = 0; nz = Math.sign(dz) || 1; }
          best = 0.1;
        }
        n = this._push(n, rx, ry, rz, nx, 0, nz, Math.min(best, 0.4));
      }
      // static obstacles (pillars, door panels, counters, fountains)
      if (obs) {
        for (const o of obs) {
          const top = o.h ?? 2;
          if (py > top) continue;
          const up = top - py;
          if (o.type === 'circle') {
            const dx = px - o.x, dz = pz - o.z;
            const d2 = dx * dx + dz * dz;
            if (d2 >= o.r * o.r) continue;
            const d = Math.sqrt(d2) || 1e-4;
            const side = o.r - d;
            if (up < side && up < 0.3) n = this._push(n, rx, ry, rz, 0, 1, 0, up);
            else n = this._push(n, rx, ry, rz, dx / d, 0, dz / d, Math.min(side, 0.4));
          } else {
            if (px <= o.x0 || px >= o.x1 || pz <= o.z0 || pz >= o.z1) continue;
            const l = px - o.x0, r = o.x1 - px, t = pz - o.z0, bb = o.z1 - pz;
            const m = Math.min(l, r, t, bb);
            if (up < m && up < 0.3) n = this._push(n, rx, ry, rz, 0, 1, 0, up);
            else if (m === l) n = this._push(n, rx, ry, rz, -1, 0, 0, Math.min(m, 0.4));
            else if (m === r) n = this._push(n, rx, ry, rz, 1, 0, 0, Math.min(m, 0.4));
            else if (m === t) n = this._push(n, rx, ry, rz, 0, 0, -1, Math.min(m, 0.4));
            else n = this._push(n, rx, ry, rz, 0, 0, 1, Math.min(m, 0.4));
          }
        }
      }
    }
    b.minY = lo;
    b.maxY = hi;
    return n;
  }

  // Coarse body-vs-body: vertical cylinders that can stack (crate on crate) or shove each other.
  // Sleeping bodies act as static unless hit hard, so piles don't keep each other awake.
  _bodyCollisions() {
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (!a.collideBodies || !a.alive) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (!b.collideBodies || !b.alive) continue;
        if (a.sleeping && b.sleeping) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const rr = (a.hRadius + b.hRadius) * 0.92;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const oy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
        if (oy < -0.04) continue;
        const d = Math.sqrt(d2) || 1e-3;
        const penH = rr - d;
        if (oy < penH) {
          // stacked: resolve vertically
          const up = a.pos.y > b.pos.y ? a : b, lo = up === a ? b : a;
          if (oy <= 0) {
            // just touching: a moving support wakes whatever sits on it
            if (up.sleeping && !lo.sleeping && lo.vel.lengthSq() + lo.ang.lengthSq() * 0.1 > 0.08) up.wake();
            if (!up.sleeping) up.support = true;
            continue;
          }
          const rv = up.vel.y - lo.vel.y;
          if (lo.sleeping && rv < -3.5) lo.wake();
          if (up.sleeping && !lo.sleeping) up.wake();
          // shock propagation: a support already resting on the floor can't be shoved into it
          const iu = up.sleeping ? 0 : up.invMass, il = lo.sleeping || lo.grounded ? 0 : lo.invMass;
          const tot = iu + il;
          if (!tot) continue;
          const corr = (Math.min(oy, 0.2) * 0.8) / tot;
          up.pos.y += corr * iu;
          lo.pos.y -= corr * il;
          up.minY += corr * iu; up.maxY += corr * iu;
          lo.minY -= corr * il; lo.maxY -= corr * il;
          if (rv < 0) {
            const e = rv < -BOUNCE_MIN ? 0.15 : 0;
            const jj = (-(1 + e) * rv) / tot;
            up.vel.y += jj * iu;
            lo.vel.y -= jj * il;
            // friction drags the top body along with its support
            const fx = (up.vel.x - lo.vel.x) * 0.25 / tot, fz = (up.vel.z - lo.vel.z) * 0.25 / tot;
            up.vel.x -= fx * iu; up.vel.z -= fz * iu;
            lo.vel.x += fx * il; lo.vel.z += fz * il;
            up.ang.multiplyScalar(0.92);
          }
          up.support = true;
        } else {
          const nx = dx / d, nz = dz / d;
          const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
          if (rv < -1) { if (a.sleeping) a.wake(); if (b.sleeping) b.wake(); }
          const ia = a.sleeping ? 0 : a.invMass, ib = b.sleeping ? 0 : b.invMass;
          const tot = ia + ib;
          if (!tot) continue;
          const corr = (Math.min(penH, 0.2) * 0.8) / tot;
          a.pos.x -= nx * corr * ia; a.pos.z -= nz * corr * ia;
          b.pos.x += nx * corr * ib; b.pos.z += nz * corr * ib;
          if (rv < 0) {
            const e = rv < -BOUNCE_MIN ? 0.2 : 0;
            const jj = (-(1 + e) * rv) / tot;
            a.vel.x -= jj * nx * ia; a.vel.z -= jj * nz * ia;
            b.vel.x += jj * nx * ib; b.vel.z += jj * nz * ib;
          }
        }
      }
    }
  }

  // Push bodies away from an actor (player/enemy) moving through them.
  pushFrom(x, y, z, radius, vx, vz, strength = 1) {
    for (const b of this.bodies) {
      if (!b.alive || !b.collideBodies) continue;
      const dx = b.pos.x - x, dz = b.pos.z - z;
      const rr = radius + b.hRadius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || b.minY > y + 2 || b.maxY < y - 0.3) continue;
      const d = Math.sqrt(d2) || 0.001;
      const nx = dx / d, nz = dz / d;
      const pen = rr - d;
      if (b.mass >= 6) continue;
      const along = vx * nx + vz * nz;
      // standing still against a prop doesn't keep nudging it awake
      if (along < 0.3 && pen < 0.05) continue;
      b.pos.x += nx * pen * 0.8;
      b.pos.z += nz * pen * 0.8;
      if (along > 0) {
        b.vel.x += nx * along * 0.9 * strength;
        b.vel.z += nz * along * 0.9 * strength;
        b.ang.x += nz * along * 0.6;
        b.ang.z -= nx * along * 0.6;
      }
      b.wake();
    }
  }
}
