// Cover points: places a soldier can use for protection, generated along
// building walls, walls/hedges/sandbags, props, rocks, trees and flat
// rooftops, plus dynamic ones from wrecks and craters. Each point stores the
// direction toward its protecting object; a threat is covered when it lies
// roughly in that direction.

import { StaticGrid } from '../core/grid.js';
import { rng } from '../core/rng.js';

let nextId = 1;

export class CoverPoint {
  constructor(x, z, nx, nz, high, kind, struct = null) {
    this.id = nextId++;
    this.x = x;
    this.z = z;
    this.y = 0;
    this.nx = nx; // unit vector toward the cover object (0,0 for all-round cover)
    this.nz = nz;
    this.high = high; // can stand behind it
    this.kind = kind; // 'building' | 'wall' | 'prop' | 'rock' | 'tree' | 'roof' | 'crater' | 'wreck' | 'rubble'
    this.struct = struct;
    this.occupant = null;
    this.active = true;
    this.pos = { x, z };
    this._stamp = 0;
  }
}

const _pts = [];

export class CoverSystem {
  constructor(world) {
    this.world = world;
    this.terrain = world.terrain;
    this.points = [];
    this.grid = new StaticGrid(-world.terrain.half, -world.terrain.half, world.terrain.size, 16);
    this.byStruct = new Map();
  }

  add(p) {
    if (!this.terrain.inBounds(p.x, p.z, 30)) return null;
    // Don't put cover points inside other solid structures.
    const s = this.world.structures.structureAt(p.x, p.z, 0.3);
    if (s && s !== p.struct && !s.destroyed && s.kind !== 'wall' && p.kind !== 'roof') return null;
    p.y = p.kind === 'roof' && p.struct ? p.struct.top : this.terrain.heightAt(p.x, p.z);
    this.points.push(p);
    this.grid.insertPoint(p, p.x, p.z);
    if (p.struct) {
      let l = this.byStruct.get(p.struct);
      if (!l) this.byStruct.set(p.struct, (l = []));
      l.push(p);
    }
    return p;
  }

  build(map) {
    for (const s of map.structures.list) this.addAround(s);
    const trees = map.trees.list;
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      if (t.kind === 3 || (i & 1) === 1) continue;
      // A point on a random side of the trunk, facing it.
      const a = rng.range(0, Math.PI * 2);
      const p = new CoverPoint(t.x + Math.sin(a) * 0.9, t.z + Math.cos(a) * 0.9, -Math.sin(a), -Math.cos(a), true, 'tree', null);
      p.tree = t;
      this.add(p);
    }
  }

  // Generate points around a structure's footprint.
  addAround(s) {
    const c = Math.cos(s.yaw);
    const sn = Math.sin(s.yaw);
    const toW = (lx, lz) => [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
    const dirW = (lx, lz) => [lx * c + lz * sn, -lx * sn + lz * c];
    const isBuilding = s.kind === 'building';
    const kind = isBuilding ? 'building' : s.kind === 'wreck' ? 'wreck' : s.kind === 'wall' ? 'wall' : s.type === 'rock' ? 'rock' : 'prop';
    const high = s.solidH > 1.5;
    if (s.type === 'radio_mast' || s.type === 'guard_tower' || s.type === 'fence') return;
    const spacing = isBuilding ? 3.6 : 3;
    const off = isBuilding ? 0.9 : 0.75;
    // Faces: +X, -X, +Z, -Z (local).
    const faces = [
      [1, 0, s.hz],
      [-1, 0, s.hz],
      [0, 1, s.hx],
      [0, -1, s.hx],
    ];
    for (const [fx, fz, halfLen] of faces) {
      // Thin walls only get points on their long sides.
      if (s.kind === 'wall' && ((fx !== 0 && s.hx > s.hz) || (fz !== 0 && s.hz > s.hx))) continue;
      const n = Math.max(1, Math.floor((halfLen * 2) / spacing));
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : -halfLen + spacing * 0.5 + ((halfLen * 2 - spacing) * i) / (n - 1);
        const lx = fx !== 0 ? fx * (s.hx + off) : t;
        const lz = fz !== 0 ? fz * (s.hz + off) : t;
        const [x, z] = toW(lx, lz);
        const [dx, dz] = dirW(-fx, -fz);
        this.add(new CoverPoint(x, z, dx, dz, high, kind, s));
      }
    }
    // Flat roofs: firing positions along the parapet.
    if (isBuilding && s.flat && s.h > 5 && s.hx > 3 && s.hz > 3) {
      for (const [fx, fz, halfLen] of faces) {
        const n = Math.max(1, Math.floor((halfLen * 2) / 5));
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0 : -halfLen + 2.5 + ((halfLen * 2 - 5) * i) / Math.max(1, n - 1);
          const lx = fx !== 0 ? fx * (s.hx - 0.9) : t * 0.85;
          const lz = fz !== 0 ? fz * (s.hz - 0.9) : t * 0.85;
          const [x, z] = toW(lx, lz);
          const [dx, dz] = dirW(fx, fz);
          this.add(new CoverPoint(x, z, dx, dz, false, 'roof', s));
        }
      }
    }
  }

  addCrater(x, z, r) {
    const p = this.add(new CoverPoint(x, z, 0, 0, false, 'crater', null));
    if (p) p.expire = this.world.time + 600;
  }

  onStructureDestroyed(s) {
    const list = this.byStruct.get(s);
    if (list) {
      for (const p of list) {
        p.active = false;
        if (p.occupant) {
          if (p.kind === 'roof') p.occupant.roof = null;
          p.occupant.cover = null;
          p.occupant = null;
        }
      }
    }
    if (s.kind === 'building') {
      // Rubble piles give low all-round cover.
      const n = Math.max(2, Math.round((s.hx * s.hz) / 30));
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(0.4, 1) * Math.max(s.hx, s.hz);
        this.add(new CoverPoint(s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, 0, 0, false, 'rubble', null));
      }
    }
  }

  claim(p, u) {
    if (u.cover && u.cover !== p) this.release(u);
    p.occupant = u;
    u.cover = p;
  }

  release(u) {
    if (u.cover) {
      if (u.cover.occupant === u) u.cover.occupant = null;
      u.cover = null;
    }
  }

  // Best free cover point for unit `u` within maxDist that protects against a
  // threat at (tx, tz). Optionally biased toward (gx, gz) (squad goal).
  find(u, tx, tz, maxDist, opts = {}) {
    const ux = u.pos.x;
    const uz = u.pos.z;
    this.grid.queryRadius(ux, uz, maxDist, _pts);
    let best = null;
    let bestScore = -Infinity;
    const now = this.world.time;
    const allowRoof = opts.allowRoof ?? false;
    const hasThreat = tx !== null && tx !== undefined;
    for (let i = 0; i < _pts.length; i++) {
      const p = _pts[i];
      if (!p.active || (p.occupant && p.occupant !== u && p.occupant.alive)) continue;
      if (p.expire && now > p.expire) {
        p.active = false;
        continue;
      }
      if (p.kind === 'roof' && !allowRoof) continue;
      if (p.tree && !p.tree.alive) continue;
      const dx = p.x - ux;
      const dz = p.z - uz;
      const d = Math.hypot(dx, dz);
      if (d > maxDist) continue;
      let protect = 0.55;
      if (hasThreat) {
        const tdx = tx - p.x;
        const tdz = tz - p.z;
        const tl = Math.hypot(tdx, tdz) || 1;
        if (p.nx !== 0 || p.nz !== 0) {
          protect = (p.nx * tdx + p.nz * tdz) / tl;
          if (protect < 0.35) continue;
        }
        // Don't run toward the enemy to reach cover.
        const toward = (dx * tdx + dz * tdz) / (tl * (d || 1));
        if (toward > 0.3 && d > 6) protect -= toward * 0.4;
        // Not too close to the threat.
        if (tl < 25) protect -= 0.5;
      }
      let score = protect * 2 - (d / maxDist) * 1.2;
      if (p.high) score += 0.25;
      if (p.kind === 'building' || p.kind === 'wall' || p.kind === 'rock' || p.kind === 'wreck') score += 0.3;
      if (p.kind === 'tree') score -= 0.25;
      if (p.kind === 'roof') score += opts.roofBonus ?? 0.4;
      if (opts.gx !== undefined) {
        const gd = Math.hypot(p.x - opts.gx, p.z - opts.gz);
        score -= (gd / (opts.goalRadius || 80)) * (opts.goalWeight ?? 0.8);
      }
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  // Points around a location (for defensive set-ups), regardless of threat.
  around(x, z, r, out) {
    this.grid.queryRadius(x, z, r, out);
    return out;
  }
}
