// Lightweight impulse-based rigid bodies (crates, barrels, pots, debris, dropped weapons, bombs).
// Each body is an oriented box (or cylinder approximated by rim points) colliding with the dungeon
// grid via contact points. Cheap, stable and good-looking enough for tumbling props.
import * as THREE from 'three';
import { TILE } from '../world/constants.js';

const _r = new THREE.Vector3();
const _vp = new THREE.Vector3();
const _t = new THREE.Vector3();
const _p = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
const _m4 = new THREE.Matrix4();
const _dq = new THREE.Quaternion();
const GRAVITY = 20;

export class RigidBody {
  // shape: {type:'box', hx,hy,hz} | {type:'cyl', r, hy}
  constructor(shape, opts = {}) {
    this.shape = shape;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.ang = new THREE.Vector3();
    this.mass = opts.mass ?? 1;
    this.restitution = opts.restitution ?? 0.25;
    this.friction = opts.friction ?? 0.6;
    this.mesh = opts.mesh || null;
    this.sleeping = false;
    this.sleepTimer = 0;
    this.radius = 0;
    this.points = [];
    this.alive = true;
    this.life = opts.life ?? Infinity;
    this.fade = opts.fade ?? 0;
    this.onImpact = opts.onImpact || null;
    this.collideBodies = opts.collideBodies ?? true;
    this.owner = opts.owner || null; // prop / item this body belongs to
    this.grounded = false;
    this.impactCooldown = 0;
    this._buildPoints();
    const h = this.radius;
    this.invInertia = 1 / (this.mass * h * h * 0.4);
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

  wake() {
    this.sleeping = false;
    this.sleepTimer = 0;
  }

  applyImpulse(impulse, point) {
    this.wake();
    this.vel.addScaledVector(impulse, 1 / this.mass);
    if (point) {
      _r.subVectors(point, this.pos);
      _t.crossVectors(_r, impulse).multiplyScalar(this.invInertia);
      this.ang.add(_t);
    }
  }

  syncMesh() {
    if (!this.mesh) return;
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
  }
}

export class PhysicsWorld {
  constructor(world) {
    this.world = world;
    this.bodies = [];
  }

  add(body) {
    this.bodies.push(body);
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
    for (let s = 0; s < sub; s++) {
      for (const b of this.bodies) if (b.alive && !b.sleeping) this._integrate(b, h);
      this._bodyCollisions();
    }
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      if (b.life !== Infinity) {
        b.life -= dt;
        if (b.life <= 0) b.alive = false;
        else if (b.fade && b.life < b.fade && b.mesh) {
          const k = b.life / b.fade;
          b.mesh.scale.setScalar(Math.max(0.01, k));
        }
      }
      if (!b.alive) {
        this.bodies.splice(i, 1);
        if (onRemove) onRemove(b);
        continue;
      }
      b.syncMesh();
    }
  }

  _integrate(b, dt) {
    const world = this.world;
    b.impactCooldown -= dt;
    b.vel.y -= GRAVITY * dt;
    // air drag
    b.vel.multiplyScalar(1 - 0.05 * dt);
    b.ang.multiplyScalar(1 - 0.4 * dt);
    b.pos.addScaledVector(b.vel, dt);
    // rotate
    const al = b.ang.length();
    if (al > 1e-5) {
      _dq.setFromAxisAngle(_w.copy(b.ang).divideScalar(al), al * dt);
      b.quat.premultiply(_dq).normalize();
    }
    // contacts
    _m4.makeRotationFromQuaternion(b.quat);
    _m3.setFromMatrix4(_m4);
    let contacts = 0;
    let maxPen = 0;
    let impactSpeed = 0;
    const floorY = world.floorAt(b.pos.x, b.pos.z);
    b.grounded = false;
    for (const lp of b.points) {
      _p.copy(lp).applyMatrix3(_m3).add(b.pos);
      // floor
      const pen = floorY - _p.y;
      if (pen > 0) {
        contacts++;
        b.grounded = true;
        maxPen = Math.max(maxPen, pen);
        _r.subVectors(_p, b.pos);
        _vp.crossVectors(b.ang, _r).add(b.vel);
        if (_vp.y < 0) {
          impactSpeed = Math.max(impactSpeed, -_vp.y);
          // normal impulse (n = +y)
          const rxn = _t.set(_r.z, 0, -_r.x); // r x n where n=(0,1,0)
          const denom = 1 / b.mass + rxn.lengthSq() * b.invInertia;
          const e = -_vp.y > 2 ? b.restitution : 0;
          const j = (-(1 + e) * _vp.y) / denom / Math.max(1, contacts * 0.5);
          b.vel.y += j / b.mass;
          b.ang.addScaledVector(rxn, j * b.invInertia);
          // friction
          _vp.crossVectors(b.ang, _r).add(b.vel);
          const vtx = _vp.x, vtz = _vp.z;
          const vt = Math.hypot(vtx, vtz);
          if (vt > 1e-4) {
            const jt = Math.min(b.friction * j, vt / denom);
            const fx = (-vtx / vt) * jt, fz = (-vtz / vt) * jt;
            b.vel.x += fx / b.mass;
            b.vel.z += fz / b.mass;
            // r x f
            b.ang.x += (_r.y * fz) * b.invInertia;
            b.ang.y += (_r.z * fx - _r.x * fz) * b.invInertia;
            b.ang.z += (-_r.y * fx) * b.invInertia;
          }
        }
      }
      // walls
      if (world.solidAt(_p.x, _p.z)) {
        const cx = Math.floor(_p.x / TILE), cz = Math.floor(_p.z / TILE);
        // find push normal relative to body centre's cell
        const bx = Math.floor(b.pos.x / TILE), bz = Math.floor(b.pos.z / TILE);
        let nx = 0, nz = 0, pen2 = 0;
        if (cx !== bx) { nx = cx > bx ? -1 : 1; pen2 = nx < 0 ? _p.x - cx * TILE : (cx + 1) * TILE - _p.x; }
        else if (cz !== bz) { nz = cz > bz ? -1 : 1; pen2 = nz < 0 ? _p.z - cz * TILE : (cz + 1) * TILE - _p.z; }
        if (nx || nz) {
          b.pos.x += nx * Math.min(pen2, 0.2);
          b.pos.z += nz * Math.min(pen2, 0.2);
          const vn = b.vel.x * nx + b.vel.z * nz;
          if (vn < 0) {
            impactSpeed = Math.max(impactSpeed, -vn);
            b.vel.x -= (1 + b.restitution) * vn * nx;
            b.vel.z -= (1 + b.restitution) * vn * nz;
            b.ang.multiplyScalar(0.8);
          }
        }
      }
    }
    if (maxPen > 0) b.pos.y += maxPen * 0.9;
    if (impactSpeed > 2.5 && b.onImpact && b.impactCooldown <= 0) {
      b.impactCooldown = 0.12;
      b.onImpact(b, impactSpeed);
    }
    // ceiling
    const cy = world.ceilAt(b.pos.x, b.pos.z);
    if (b.pos.y + b.radius * 0.5 > cy && b.vel.y > 0) b.vel.y *= -0.3;
    // sleep
    if (b.grounded && b.vel.lengthSq() < 0.02 && b.ang.lengthSq() < 0.05) {
      b.sleepTimer += dt;
      if (b.sleepTimer > 0.6) {
        b.sleeping = true;
        b.vel.set(0, 0, 0);
        b.ang.set(0, 0, 0);
      }
    } else b.sleepTimer = 0;
    if (b.pos.y < -20) b.alive = false;
  }

  _bodyCollisions() {
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (!a.collideBodies || !a.alive) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (!b.collideBodies || !b.alive) continue;
        if (a.sleeping && b.sleeping) continue;
        const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
        const rr = (a.hRadius + b.hRadius) * 0.9;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || Math.abs(dy) > (a.radius + b.radius) * 0.8) continue;
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d, nz = dz / d;
        const pen = rr - d;
        const ta = 1 / a.mass, tb = 1 / b.mass, tot = ta + tb;
        a.pos.x -= nx * pen * (ta / tot);
        a.pos.z -= nz * pen * (ta / tot);
        b.pos.x += nx * pen * (tb / tot);
        b.pos.z += nz * pen * (tb / tot);
        const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (rv < 0) {
          const jj = (-(1.3) * rv) / tot;
          a.vel.x -= jj * nx * ta; a.vel.z -= jj * nz * ta;
          b.vel.x += jj * nx * tb; b.vel.z += jj * nz * tb;
          if (Math.abs(rv) > 0.3) { a.wake(); b.wake(); }
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
      if (d2 >= rr * rr || b.pos.y > y + 2 || b.pos.y + b.radius < y - 0.3) continue;
      const d = Math.sqrt(d2) || 0.001;
      const nx = dx / d, nz = dz / d;
      const pen = rr - d;
      const light = b.mass < 6;
      if (light) {
        b.pos.x += nx * pen * 0.8;
        b.pos.z += nz * pen * 0.8;
        const along = vx * nx + vz * nz;
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
}
