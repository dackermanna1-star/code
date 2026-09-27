// Base class for navigating infected: movement constrained to the nav grid
// (never clips through walls), flow-field following, climb/drop links, simple
// line-of-sight steering and hit-reaction springs.
import * as THREE from 'three';
import { LINK_CLIMB, LINK_DROP } from '../world/nav.js';
import { Body, Poser } from './body.js';
import { damp, wrapAngle } from '../core/math.js';

const STEP_OK = 0.62;

export class Agent {
  constructor(mgr) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.node = -1;
    this.targetY = 0;
    this.body = new Body(1, 1);
    this.poser = new Poser();
    this.phase = Math.random() * 6.28;
    this.hitS = 0; this.hitF = 0; this.hitVS = 0; this.hitVF = 0;
    this.climb = null;
    this.falling = false;
    this.fallVy = 0;
    this.radius = 0.3;
    this.dead = false;
    this.special = false;
    this.height = 1.75;
    this.seed = Math.random() * 100;
  }
  get nav() { return this.game.level.nav; }

  placeAt(x, y, z) {
    this.pos.set(x, y, z);
    const nav = this.nav;
    this.node = nav ? nav.nearestNode(x, y, z, 3) : -1;
    if (this.node >= 0) {
      this.pos.y = nav.nodeY[this.node];
      this.targetY = this.pos.y;
    }
  }

  // Attempt to move by (dx,dz) staying on walkable nodes. Returns true if moved.
  moveOnNav(dx, dz) {
    const nav = this.nav;
    if (!nav) { this.pos.x += dx; this.pos.z += dz; return true; }
    const tryMove = (mx, mz) => {
      const nx = this.pos.x + mx, nz = this.pos.z + mz;
      const n = nav.nodeAt(nx, this.pos.y, nz);
      if (n < 0) return false;
      const dy = nav.nodeY[n] - this.pos.y;
      if (dy > STEP_OK || dy < -STEP_OK) return false;
      if (nav.doorOf[n] >= 0) {
        const door = this.game.level.doors[nav.doorOf[n]];
        if (door && door.blocksInfected()) { this.blockedByDoor = door; return false; }
      }
      // ensure linked (prevents slipping through thin walls between columns)
      if (n !== this.node && this.node >= 0) {
        let linked = false;
        const L = nav.links;
        for (let d = 0; d < 8; d++) if (L[this.node * 8 + d] === n) { linked = true; break; }
        if (!linked) {
          // allow if within 2 cells (fast mover crossing a cell corner)
          const ax = nav.nodeX(n) - nav.nodeX(this.node), az = nav.nodeZ(n) - nav.nodeZ(this.node);
          if (Math.abs(ax) > nav.cs * 1.01 || Math.abs(az) > nav.cs * 1.01) {
            // two-step check through an intermediate linked node
            let ok = false;
            for (let d = 0; d < 8 && !ok; d++) {
              const m = L[this.node * 8 + d];
              if (m < 0) continue;
              for (let e = 0; e < 8; e++) if (L[m * 8 + e] === n) { ok = true; break; }
            }
            if (!ok) return false;
          } else return false;
        }
      }
      this.pos.x = nx; this.pos.z = nz;
      this.node = n;
      this.targetY = nav.nodeY[n];
      return true;
    };
    this.blockedByDoor = null;
    // subdivide long moves
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (nav.cs * 0.8)));
    let moved = false;
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps, sz = dz / steps;
      if (tryMove(sx, sz)) { moved = true; continue; }
      // slide
      if (Math.abs(sx) > 1e-4 && tryMove(sx, 0)) { moved = true; continue; }
      if (Math.abs(sz) > 1e-4 && tryMove(0, sz)) { moved = true; continue; }
      break;
    }
    return moved;
  }

  // Look ahead along a field and return a steering target {x,z,link,next} or null.
  flowTarget(field, lookahead = 3) {
    const nav = this.nav;
    if (this.node < 0 || field[this.node] >= 1e8) return null;
    let n = this.node;
    let first = -1, firstLink = 0;
    for (let k = 0; k < lookahead; k++) {
      let best = -1, bd = field[n], bl = 0;
      for (let d = 0; d < 8; d++) {
        const v = nav.links[n * 8 + d];
        if (v < 0) continue;
        const f = field[v];
        if (f < bd) { bd = f; best = v; bl = nav.ltype[n * 8 + d]; }
      }
      if (best < 0) break;
      if (k === 0) { first = best; firstLink = bl; }
      if (bl !== 0) { if (k > 0) break; }
      n = best;
      if (k === 0 && firstLink !== 0) break;
    }
    if (first < 0) return null;
    const out = this._ft || (this._ft = { x: 0, z: 0, y: 0, link: 0, next: -1 });
    out.x = nav.nodeX(n); out.z = nav.nodeZ(n); out.y = nav.nodeY[n];
    out.link = firstLink;
    out.next = first;
    return out;
  }

  startClimb(toNode) {
    const nav = this.nav;
    const y1 = nav.nodeY[toNode];
    const h = y1 - this.pos.y;
    this.climb = { x0: this.pos.x, z0: this.pos.z, y0: this.pos.y, x1: nav.nodeX(toNode), z1: nav.nodeZ(toNode), y1, t: 0, dur: 0.35 + h * 0.32, node: toNode };
    this.yaw = Math.atan2(-(this.climb.x1 - this.pos.x), -(this.climb.z1 - this.pos.z));
  }
  updateClimb(dt) {
    const c = this.climb;
    c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    // rise first, then move forward over the ledge
    const up = Math.min(1, k / 0.75);
    const fw = Math.max(0, (k - 0.6) / 0.4);
    this.pos.y = c.y0 + (c.y1 - c.y0) * (1 - (1 - up) * (1 - up));
    this.pos.x = c.x0 + (c.x1 - c.x0) * fw;
    this.pos.z = c.z0 + (c.z1 - c.z0) * fw;
    if (k >= 1) {
      this.node = c.node;
      this.targetY = c.y1;
      this.pos.y = c.y1;
      this.climb = null;
      return true;
    }
    return false;
  }
  startDrop(toNode) {
    const nav = this.nav;
    this.falling = true;
    this.fallVy = 0.5;
    this.fallNode = toNode;
    this.fallX = nav.nodeX(toNode); this.fallZ = nav.nodeZ(toNode);
  }
  updateFall(dt, speed = 3) {
    const nav = this.nav;
    this.fallVy -= 16 * dt;
    this.pos.y += this.fallVy * dt;
    const dx = this.fallX - this.pos.x, dz = this.fallZ - this.pos.z;
    const dl = Math.hypot(dx, dz);
    if (dl > 0.02) { const s = Math.min(dl, speed * dt); this.pos.x += dx / dl * s; this.pos.z += dz / dl * s; }
    const gy = nav.nodeY[this.fallNode];
    if (this.pos.y <= gy) {
      this.pos.y = gy;
      this.targetY = gy;
      this.node = this.fallNode;
      this.falling = false;
      return true;
    }
    return false;
  }

  followY(dt) {
    this.pos.y = damp(this.pos.y, this.targetY, 14, dt);
  }

  // Spring-damped hit reaction offsets (local side/forward).
  hitReact(dt) {
    const k = 90, c = 12;
    this.hitVS += (-k * this.hitS - c * this.hitVS) * dt;
    this.hitVF += (-k * this.hitF - c * this.hitVF) * dt;
    this.hitS += this.hitVS * dt;
    this.hitF += this.hitVF * dt;
  }
  pushReaction(dirX, dirZ, amount) {
    // convert world dir into local side/forward
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    this.hitVS += (dirX * rx + dirZ * rz) * amount;
    this.hitVF += (dirX * fx + dirZ * fz) * amount;
  }

  faceTowards(x, z, rate, dt) {
    const target = Math.atan2(-(x - this.pos.x), -(z - this.pos.z));
    const d = wrapAngle(target - this.yaw);
    this.yaw += d * Math.min(1, rate * dt);
    return Math.abs(d);
  }
}
