// Structures: buildings, walls and solid props. Each is a box rotated about Y
// (footprint half extents hx/hz, height h above its base y). They block
// movement, line of sight and projectiles, provide cover, and can be
// destroyed (buildings collapse into rubble, walls and props are flattened).

import { StaticGrid } from '../core/grid.js';
import { segOBB } from '../core/math.js';

let nextStructureId = 1;

// Per-type defaults. hpDensity is hit points per cubic metre of volume.
export const STRUCTURE_TYPES = {
  house: { material: 'brick', hpDensity: 1.5, minHp: 450 },
  apartment: { material: 'concrete', hpDensity: 1.0, minHp: 1800 },
  shop: { material: 'brick', hpDensity: 1.3, minHp: 900 },
  townhall: { material: 'stone', hpDensity: 1.2, minHp: 3000 },
  church: { material: 'stone', hpDensity: 1.4, minHp: 2600 },
  tower: { material: 'stone', hpDensity: 2.2, minHp: 1500 },
  warehouse: { material: 'metal', hpDensity: 0.35, minHp: 1200 },
  factory: { material: 'concrete', hpDensity: 0.5, minHp: 2200 },
  barn: { material: 'wood', hpDensity: 0.6, minHp: 500 },
  garage: { material: 'brick', hpDensity: 2.0, minHp: 250 },
  hangar: { material: 'metal', hpDensity: 0.25, minHp: 2600 },
  barracks: { material: 'concrete', hpDensity: 1.2, minHp: 1400 },
  hq: { material: 'concrete', hpDensity: 1.1, minHp: 4000 },
  bunker: { material: 'concrete', hpDensity: 9.0, minHp: 5000 },
  control_tower: { material: 'concrete', hpDensity: 1.6, minHp: 2500 },
  silo: { material: 'concrete', hpDensity: 0.8, minHp: 1600 },
  farmhouse: { material: 'stone', hpDensity: 1.6, minHp: 700 },
  // Walls and props.
  stone_wall: { material: 'stone', hpDensity: 120, minHp: 300 },
  hedge: { material: 'hedge', hpDensity: 25, minHp: 80 },
  fence: { material: 'wood', hpDensity: 40, minHp: 40 },
  concrete_wall: { material: 'concrete', hpDensity: 160, minHp: 700 },
  sandbags: { material: 'sandbag', hpDensity: 200, minHp: 450 },
  hesco: { material: 'sandbag', hpDensity: 160, minHp: 1400 },
  jersey_barrier: { material: 'concrete', hpDensity: 300, minHp: 700 },
  tank_trap: { material: 'metal', hpDensity: 200, minHp: 900 },
  crates: { material: 'wood', hpDensity: 40, minHp: 120 },
  fuel_drums: { material: 'metal', hpDensity: 30, minHp: 60 },
  fuel_tank: { material: 'metal', hpDensity: 8, minHp: 500 },
  car: { material: 'metal', hpDensity: 15, minHp: 220 },
  car_wreck: { material: 'metal', hpDensity: 15, minHp: 400 },
  rock: { material: 'rock', hpDensity: 400, minHp: 2000 },
  guard_tower: { material: 'wood', hpDensity: 8, minHp: 300 },
  radio_mast: { material: 'metal', hpDensity: 2, minHp: 350 },
};

export class Structure {
  constructor(o) {
    this.id = nextStructureId++;
    this.kind = o.kind || 'building'; // 'building' | 'wall' | 'prop'
    this.type = o.type;
    this.x = o.x;
    this.z = o.z;
    this.y = o.y || 0;
    this.yaw = o.yaw || 0;
    this.hx = o.hx;
    this.hz = o.hz;
    this.h = o.h;
    this.floors = o.floors || 1;
    this.roof = o.roof || 'flat';
    this.roofH = o.roofH || 0;
    this.color = o.color ?? 0xb8ad98;
    this.roofColor = o.roofColor ?? 0x7a3b2e;
    this.variant = o.variant || 0;
    this.propKind = o.propKind || null; // model id for props rendered by the models module
    const def = STRUCTURE_TYPES[o.type] || STRUCTURE_TYPES.house;
    this.material = o.material || def.material;
    const volume = this.hx * 2 * this.hz * 2 * (this.h + this.roofH * 0.5);
    this.maxHp = o.hp || Math.max(def.minHp, volume * def.hpDensity);
    this.hp = this.maxHp;
    this.damage = 0; // 0..1 visual damage
    this.stage = 0; // buildings: 0 intact, 1 holed, 2 roof and upper floors fallen in
    this.ruinH = this.h; // standing wall height once ruined
    this.destroyed = false;
    this.blocksMove = o.blocksMove ?? true;
    this.crushable = o.crushable ?? false; // tracked vehicles flatten it
    this.rubbleH = Math.max(1.2, Math.min(4, this.h * 0.28));
    this.burning = 0;
    this.version = 0; // bumped whenever render state changes
    this.flat = this.roof === 'flat';
    this.coverPoints = null;
    this.roofPoints = null;
    this._stamp = 0;
  }

  // Effective height of the solid box used for collision and sight.
  get solidH() {
    if (this.destroyed) return this.kind === 'building' ? this.rubbleH : 0.25;
    if (this.stage >= 2) return this.ruinH;
    return this.h + this.roofH * 0.55;
  }

  get top() {
    return this.y + this.solidH;
  }

  get radius() {
    return Math.hypot(this.hx, this.hz);
  }

  get isLow() {
    return this.solidH < 1.6;
  }

  // Unit-space corner extents for grid registration.
  bounds() {
    const c = Math.abs(Math.cos(this.yaw));
    const s = Math.abs(Math.sin(this.yaw));
    const ex = this.hx * c + this.hz * s;
    const ez = this.hx * s + this.hz * c;
    return [this.x - ex, this.z - ez, this.x + ex, this.z + ez];
  }
}

const _tmp = [];

export class StructureSet {
  constructor(terrain) {
    this.terrain = terrain;
    this.list = [];
    this.grid = new StaticGrid(-terrain.half, -terrain.half, terrain.size, 16);
  }

  add(s) {
    this.list.push(s);
    const b = s.bounds();
    this.grid.insertRect(s, b[0], b[1], b[2], b[3]);
    return s;
  }

  queryRadius(x, z, r, out) {
    return this.grid.queryRadius(x, z, r, out);
  }

  // Nearest structure hit by segment a->b; writes into `hit` and returns it,
  // or null. `ignore` may be a structure to skip.
  segmentHit(ax, ay, az, bx, by, bz, hit, ignore = null) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    this.grid.queryRect(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), _tmp);
    let best = null;
    let bestT = 2;
    let bestAxis = 0;
    let bestSign = 0;
    for (let i = 0; i < _tmp.length; i++) {
      const s = _tmp[i];
      if (s === ignore) continue;
      const sh = s.solidH;
      if (sh <= 0.3) continue;
      // Quick reject on height.
      if (ay > s.y + sh && by > s.y + sh) continue;
      const r = segOBB(ax, ay, az, dx, dy, dz, s.x, s.y + sh * 0.5, s.z, s.hx, sh * 0.5, s.hz, s.yaw);
      if (r !== null && r.t < bestT) {
        bestT = r.t;
        best = s;
        bestAxis = r.axis;
        bestSign = r.sign;
      }
    }
    if (best === null) return null;
    hit.structure = best;
    hit.t = bestT;
    // Surface normal in world space.
    const c = Math.cos(best.yaw);
    const sn = Math.sin(best.yaw);
    if (bestAxis === 1) {
      hit.nx = 0;
      hit.ny = bestSign;
      hit.nz = 0;
    } else if (bestAxis === 0) {
      hit.nx = bestSign * c;
      hit.ny = 0;
      hit.nz = -bestSign * sn;
    } else {
      hit.nx = bestSign * sn;
      hit.ny = 0;
      hit.nz = bestSign * c;
    }
    if (bestAxis === -1) {
      const l = Math.hypot(dx, dy, dz) || 1;
      hit.nx = -dx / l;
      hit.ny = -dy / l;
      hit.nz = -dz / l;
    }
    return hit;
  }

  // True if something solid blocks the sight line (used by LOS).
  blocksSight(ax, ay, az, bx, by, bz, ignoreA = null, ignoreB = null) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    this.grid.queryRect(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), _tmp);
    for (let i = 0; i < _tmp.length; i++) {
      const s = _tmp[i];
      if (s === ignoreA || s === ignoreB) continue;
      const sh = s.solidH;
      if (sh < 0.9) continue;
      if (ay > s.y + sh && by > s.y + sh) continue;
      // Thin props (masts, towers on legs) don't really block sight.
      if (s.type === 'radio_mast' || s.type === 'guard_tower' || s.type === 'tank_trap' || s.type === 'fence') continue;
      const r = segOBB(ax, ay, az, dx, dy, dz, s.x, s.y + sh * 0.5, s.z, s.hx, sh * 0.5, s.hz, s.yaw);
      if (r !== null) return true;
    }
    return false;
  }

  // Footprint contains point (with margin)?
  structureAt(x, z, margin = 0, out = null) {
    this.grid.queryRect(x - margin, z - margin, x + margin, z + margin, _tmp);
    for (let i = 0; i < _tmp.length; i++) {
      const s = _tmp[i];
      if (s.destroyed && s.kind !== 'building') continue;
      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      const rx = x - s.x;
      const rz = z - s.z;
      const lx = rx * c - rz * sn;
      const lz = rx * sn + rz * c;
      if (Math.abs(lx) <= s.hx + margin && Math.abs(lz) <= s.hz + margin) {
        if (out) out.push(s);
        else return s;
      }
    }
    return out ? out : null;
  }
}
