// Thin wrapper around a planck.js world: contact routing to game entities, deferred
// world mutation (planck forbids creating/destroying during a step), and helpers.

import { World, Vec2, AABB } from 'planck';
import { PHYS, CAT, MASK } from '../config.js';

/** Resolve the game-side owner of a fixture: fixture userData.owner, else body userData. */
export function ownerOf(fixture) {
  const fu = fixture.getUserData();
  if (fu && fu.owner) return fu.owner;
  return fixture.getBody().getUserData();
}

export function partOf(body) {
  const u = body && body.getUserData();
  return u && u.kind === 'part' ? u : null;
}

export class Physics {
  constructor() {
    this.world = new World({ gravity: new Vec2(0, PHYS.gravity) });
    this.deferred = [];
    this.groupCounter = 0;
    this.time = 0;
    this.steps = 0;
    this.invDt = 1 / PHYS.dt;
    const w = this.world;
    w.on('begin-contact', (c) => this._dispatch('onBeginContact', c));
    w.on('end-contact', (c) => this._dispatch('onEndContact', c));
    w.on('pre-solve', (c, m) => this._dispatch('onPreSolve', c, m));
    w.on('post-solve', (c, imp) => {
      this._dispatch('onPostSolve', c, imp);
      if (this.postSolveHook) this.postSolveHook(c, imp);
    });
  }

  _dispatch(name, c, extra) {
    const fA = c.getFixtureA();
    const fB = c.getFixtureB();
    const a = ownerOf(fA);
    const b = ownerOf(fB);
    if (a && a[name]) a[name](fA, fB, c, extra, true);
    if (b && b[name]) b[name](fB, fA, c, extra, false);
  }

  nextGroup() {
    this.groupCounter = (this.groupCounter % 30000) + 1;
    return -this.groupCounter;
  }

  defer(fn) {
    this.deferred.push(fn);
  }

  step(dt) {
    this.world.step(dt, PHYS.velIters, PHYS.posIters);
    this.time += dt;
    this.steps++;
    this.invDt = 1 / dt;
    this.flush();
  }

  flush() {
    let guard = 0;
    while (this.deferred.length && guard++ < 8) {
      const q = this.deferred;
      this.deferred = [];
      for (const fn of q) {
        try {
          fn();
        } catch (e) {
          console.error('deferred action failed', e);
        }
      }
    }
  }

  body(def, userData) {
    const b = this.world.createBody(def);
    if (userData) b.setUserData(userData);
    return b;
  }

  destroyBody(body) {
    if (!body || body._gone) return;
    body._gone = true;
    // planck destroys attached joints with the body; flag them so nobody touches them again
    for (let je = body.getJointList(); je; je = je.next) je.joint._gone = true;
    const ud = body.getUserData();
    if (ud) ud.destroyed = true;
    if (this.world.isLocked()) this.defer(() => this.world.destroyBody(body));
    else this.world.destroyBody(body);
  }

  destroyJoint(joint) {
    if (!joint || joint._gone) return;
    joint._gone = true;
    if (this.world.isLocked()) this.defer(() => this.world.destroyJoint(joint));
    else this.world.destroyJoint(joint);
  }

  createJoint(joint) {
    return this.world.createJoint(joint);
  }

  /** Unique bodies whose fixtures overlap the AABB. */
  queryBodies(x0, y0, x1, y1) {
    const set = new Set();
    this.world.queryAABB(new AABB(new Vec2(x0, y0), new Vec2(x1, y1)), (f) => {
      set.add(f.getBody());
      return true;
    });
    return set;
  }

  /** Closest ray hit. `filter(fixture)` returns false to ignore a fixture. */
  rayCast(x0, y0, x1, y1, filter) {
    let best = null;
    const p1 = new Vec2(x0, y0);
    const p2 = new Vec2(x1, y1);
    if (Vec2.distanceSquared(p1, p2) < 1e-8) return null;
    this.world.rayCast(p1, p2, (fixture, point, normal, fraction) => {
      if (filter && !filter(fixture)) return -1;
      best = { fixture, body: fixture.getBody(), x: point.x, y: point.y, nx: normal.x, ny: normal.y, fraction };
      return fraction;
    });
    return best;
  }

  /** Height of the first solid static surface below (x, yTop). */
  groundY(x, yTop = 200, yBottom = -200) {
    const hit = this.rayCast(x, yTop, x, yBottom, (f) => !f.isSensor() && f.getBody().isStatic());
    return hit ? hit.y : 0;
  }

  /** World contact point & normal (normal points from A to B). */
  contactInfo(contact) {
    const wm = contact.getWorldManifold(null);
    const n = contact.getManifold().pointCount;
    if (!wm || n === 0) return null;
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      x += wm.points[i].x;
      y += wm.points[i].y;
    }
    return { x: x / n, y: y / n, nx: wm.normal.x, ny: wm.normal.y };
  }

  /** Relative speed of two bodies at a world point (B relative to A). */
  relVel(bodyA, bodyB, x, y) {
    const p = new Vec2(x, y);
    const va = bodyA.getLinearVelocityFromWorldPoint(p);
    const vb = bodyB.getLinearVelocityFromWorldPoint(p);
    return { x: vb.x - va.x, y: vb.y - va.y };
  }

  /**
   * Radial impulse. Returns the list of affected bodies with their falloff factor.
   * Bodies get a velocity change rather than a flat impulse so light ragdoll parts
   * and heavy crates fly together convincingly.
   */
  blast(x, y, radius, power) {
    const hits = [];
    const bodies = this.queryBodies(x - radius, y - radius, x + radius, y + radius);
    for (const b of bodies) {
      if (!b.isDynamic()) continue;
      const c = b.getWorldCenter();
      const dx = c.x - x;
      const dy = c.y - y;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const f = 1 - d / radius;
      const nx = d > 1e-3 ? dx / d : 0;
      const ny = d > 1e-3 ? dy / d : 1;
      const m = b.getMass();
      const dv = power * 24 * f * (0.5 + 0.5 * f);
      const imp = Math.min(m * dv, power * 1600 * f + 40);
      b.applyLinearImpulse(new Vec2(nx * imp, (ny * 0.8 + 0.45) * imp), c, true);
      b.applyAngularImpulse((Math.random() - 0.5) * imp * 0.04 * Math.min(1, m), true);
      hits.push({ body: b, f, nx, ny });
    }
    return hits;
  }

  /** Apply standard filter data for a category. */
  static filter(cat, group = 0) {
    const maskKey = Object.keys(CAT).find((k) => CAT[k] === cat);
    return {
      filterCategoryBits: cat,
      filterMaskBits: MASK[maskKey],
      filterGroupIndex: group,
    };
  }
}
