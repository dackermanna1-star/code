// Physics helpers for worlds with thousands of anchored parts.
//
// cannon's SAPBroadphase skips (rather than stops at) pairs of static bodies,
// so every anchored brick is compared with every other one each step, and its
// ArrayCollisionMatrix keeps (and clears) a slot for every possible pair.
// Both grow with the square of the part count. These replacements only do
// work for the bodies that actually move.
import * as CANNON from '../vendor/cannon-es.js';

const STATIC = CANNON.Body.STATIC, SLEEPING = CANNON.Body.SLEEPING;

/** Remembers which body pairs touched this step (only the pairs that did). */
export class SparseCollisionMatrix {
  constructor() { this.s = new Set(); }
  _k(bi, bj) { const a = bi.id, b = bj.id; return a < b ? a * 4294967296 + b : b * 4294967296 + a; }
  get(bi, bj) { return this.s.has(this._k(bi, bj)) ? 1 : 0; }
  set(bi, bj, value) { const k = this._k(bi, bj); if (value) this.s.add(k); else this.s.delete(k); }
  reset() { this.s.clear(); }
  setNumObjects() {}
}

/**
 * Static bodies are filed once in a grid over x/z (very big ones, like
 * baseplates and roads, in a list of their own). Each step the moving bodies
 * are tested against the grid cells they overlap, the big ones, and each
 * other (swept along x). Bodies that stop being static (unanchored parts)
 * simply count as moving; stale grid entries are skipped and the grid is
 * rebuilt now and then.
 */
export class StaticGridBroadphase extends CANNON.Broadphase {
  constructor(cell = 16) {
    super();
    this.cell = cell;
    this.useBoundingBoxes = true;
    this.grid = new Map();
    this.big = [];
    this.movers = [];
    this.inGrid = new Set(); // static bodies filed in the grid (kept off the bodies themselves,
    this.seen = new Set(); //   so cannon's per-body loops stay fast)
    this.stale = 0;
    this._onAdd = (e) => this._insert(e.body);
    this._onRemove = () => { this.stale++; };
  }

  setWorld(world) {
    if (this.world) { this.world.removeEventListener('addBody', this._onAdd); this.world.removeEventListener('removeBody', this._onRemove); }
    this.world = world;
    world.addEventListener('addBody', this._onAdd);
    world.addEventListener('removeBody', this._onRemove);
    this.rebuild();
  }

  rebuild() {
    this.grid.clear();
    this.big = [];
    this.stale = 0;
    this.inGrid.clear();
    for (const b of this.world.bodies) this._insert(b);
  }

  _range(aabb) {
    const c = this.cell, lo = aabb.lowerBound, hi = aabb.upperBound;
    return [Math.floor(lo.x / c), Math.floor(hi.x / c), Math.floor(lo.z / c), Math.floor(hi.z / c)];
  }

  _insert(b) {
    if (b.type !== STATIC) return;
    if (b.aabbNeedsUpdate) b.updateAABB();
    this.inGrid.add(b);
    const [x0, x1, z0, z1] = this._range(b.aabb);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 16) { this.big.push(b); return; }
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = (x + 32768) * 65536 + (z + 32768);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(b);
      }
    }
  }

  _test(a, b, p1, p2) {
    if (!this.needBroadphaseCollision(a, b)) return;
    if (a.aabb.overlaps(b.aabb)) { p1.push(a); p2.push(b); }
  }

  collisionPairs(world, p1, p2) {
    if (this.stale > 600) this.rebuild();
    const movers = this.movers;
    movers.length = 0;
    for (const b of world.bodies) {
      if (b.type === STATIC) { if (!this.inGrid.has(b)) this._insert(b); continue; }
      if (this.inGrid.delete(b)) this.stale++; // was static (an unanchored part): its grid entries are stale now
      if (b.aabbNeedsUpdate) b.updateAABB();
      movers.push(b);
    }
    // the moving bodies against the static world
    for (const m of movers) {
      if (m.sleepState === SLEEPING) continue;
      const seen = this.seen;
      seen.clear();
      const [x0, x1, z0, z1] = this._range(m.aabb);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 64) {
        for (const s of world.bodies) if (s.type === STATIC) this._test(m, s, p1, p2);
        continue;
      }
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const list = this.grid.get((x + 32768) * 65536 + (z + 32768));
          if (!list) continue;
          for (const s of list) {
            if (seen.has(s)) continue;
            seen.add(s);
            if (s.type !== STATIC || s.world !== world) continue;
            this._test(m, s, p1, p2);
          }
        }
      }
      for (const s of this.big) if (s.world === world && s.type === STATIC) this._test(m, s, p1, p2);
    }
    // and against each other
    movers.sort((a, b) => a.aabb.lowerBound.x - b.aabb.lowerBound.x);
    for (let i = 0; i < movers.length; i++) {
      const a = movers[i], ax = a.aabb.upperBound.x;
      for (let j = i + 1; j < movers.length; j++) {
        const b = movers[j];
        if (b.aabb.lowerBound.x > ax) break;
        this._test(a, b, p1, p2);
      }
    }
  }

  aabbQuery(world, aabb, result = []) {
    const seen = this.seen;
    seen.clear();
    const [x0, x1, z0, z1] = this._range(aabb);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 256) {
      for (const b of world.bodies) { if (b.aabbNeedsUpdate) b.updateAABB(); if (b.aabb.overlaps(aabb)) result.push(b); }
      return result;
    }
    const take = (b) => {
      if (seen.has(b)) return;
      seen.add(b);
      if (b.world !== world) return;
      if (b.aabbNeedsUpdate) b.updateAABB();
      if (b.aabb.overlaps(aabb)) result.push(b);
    };
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const list = this.grid.get((x + 32768) * 65536 + (z + 32768));
        if (list) for (const b of list) take(b);
      }
    }
    for (const b of this.big) take(b);
    for (const b of this.movers) take(b);
    return result;
  }
}
