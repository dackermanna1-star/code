/**
 * Portal geometry: frames, the entry→exit transform, shot raycasts, placement on block
 * surfaces (fit search with nudging, floor snap, overlap rules), the collision tunnel behind a
 * portal and the plane-crossing test used for seamless transit.
 *
 * A portal frame has a centre on a block face plane, an outward normal `n` (axis aligned), an
 * `up` axis in the plane (world up on walls; the shooter's facing on floors/ceilings) and
 * `right = up × n`, so (right, up, n) is a right-handed basis. Local coordinates: x = right,
 * y = up, z = out of the wall.
 */
import * as THREE from 'three';
import type { World } from '../../world/world';
import { BLOCKS, T_FULL_CUBE, T_LAYER, T_SOLID } from '../../world/blocks/registry';
import { getCollisionBoxes } from '../../world/blocks/models';
import { AABB } from '../../physics/aabb';

/** Half width / half height of the portal opening (m). */
export const PORTAL_HW = 0.62;
export const PORTAL_HH = 1.12;
/** How far behind the plane the collision tunnel reaches (a falling body leads its eye by 1.62 m). */
export const TUNNEL_DEPTH = 2.2;

/** Face index (raycast convention: 0 down, 1 up, 2 -z, 3 +z, 4 -x, 5 +x) → outward normal. */
export const FACE_N: readonly (readonly [number, number, number])[] = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];

const axisOf = (v: THREE.Vector3) => (Math.abs(v.x) > 0.5 ? 0 : Math.abs(v.y) > 0.5 ? 1 : 2);
const comp = (v: THREE.Vector3, a: number) => (a === 0 ? v.x : a === 1 ? v.y : v.z);

export class PortalFrame {
  readonly c = new THREE.Vector3();
  readonly n = new THREE.Vector3();
  readonly up = new THREE.Vector3();
  readonly right = new THREE.Vector3();
  nAxis = 1;
  nSign = 1;
  uAxis = 0;
  vAxis = 2;
  /** Plane coordinate along nAxis. */
  plane = 0;

  constructor(c: THREE.Vector3, n: THREE.Vector3, up: THREE.Vector3) {
    this.c.copy(c);
    this.n.copy(n).normalize();
    this.up.copy(up).normalize();
    this.right.crossVectors(this.up, this.n).normalize();
    this.nAxis = axisOf(this.n);
    this.nSign = comp(this.n, this.nAxis) > 0 ? 1 : -1;
    this.uAxis = axisOf(this.right);
    this.vAxis = axisOf(this.up);
    this.plane = comp(this.c, this.nAxis);
  }

  clone() {
    return new PortalFrame(this.c, this.n, this.up);
  }

  matrix(out = new THREE.Matrix4()) {
    return out.makeBasis(this.right, this.up, this.n).setPosition(this.c);
  }

  /** World point → local (x right, y up, z out). */
  toLocal(p: THREE.Vector3, out = new THREE.Vector3()) {
    const dx = p.x - this.c.x, dy = p.y - this.c.y, dz = p.z - this.c.z;
    return out.set(dx * this.right.x + dy * this.right.y + dz * this.right.z, dx * this.up.x + dy * this.up.y + dz * this.up.z, dx * this.n.x + dy * this.n.y + dz * this.n.z);
  }

  /** Signed distance of a point in front of the plane. */
  side(p: THREE.Vector3) {
    return (p.x - this.c.x) * this.n.x + (p.y - this.c.y) * this.n.y + (p.z - this.c.z) * this.n.z;
  }

  /** World-axis half extents of the opening (along each world axis). */
  halfExtents(out = new THREE.Vector3()) {
    out.set(0, 0, 0);
    const set = (a: number, v: number) => (a === 0 ? (out.x = v) : a === 1 ? (out.y = v) : (out.z = v));
    set(this.uAxis, PORTAL_HW);
    set(this.vAxis, PORTAL_HH);
    return out;
  }

  /** The collision-free box behind the opening. */
  tunnel(out = new AABB(), depth = TUNNEL_DEPTH): AABB {
    const h = this.halfExtents(_he);
    const lo = [this.c.x - h.x, this.c.y - h.y, this.c.z - h.z];
    const hi = [this.c.x + h.x, this.c.y + h.y, this.c.z + h.z];
    if (this.nSign > 0) {
      lo[this.nAxis] = this.plane - depth;
      hi[this.nAxis] = this.plane;
    } else {
      lo[this.nAxis] = this.plane;
      hi[this.nAxis] = this.plane + depth;
    }
    return out.set(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
  }

  /** Is the in-plane point (local x, y) inside the opening (with margin m, may be negative)? */
  insideRect(lx: number, ly: number, m = 0) {
    return Math.abs(lx) <= PORTAL_HW + m && Math.abs(ly) <= PORTAL_HH + m;
  }
}
const _he = new THREE.Vector3();

const R180 = new THREE.Matrix4().makeRotationY(Math.PI);
const _ma = new THREE.Matrix4();
const _mb = new THREE.Matrix4();

/** Rigid transform taking a world point at the entry portal `a` to the matching point at `b`. */
export function portalTransform(a: PortalFrame, b: PortalFrame, out = new THREE.Matrix4()) {
  a.matrix(_ma).invert();
  b.matrix(_mb);
  return out.multiplyMatrices(_mb, R180).multiply(_ma);
}

// ------------------------------------------------------------------------------- blocks
const PORTAL_DENY = new Set(['glass', 'tinted_glass', 'ice', 'packed_ice', 'blue_ice', 'barrier', 'tnt', 'slime_block', 'honey_block', 'glowstone', 'sea_lantern', 'magma_block']);

/** Can a portal be placed on this block (opaque full solid cube, not glass/ice/etc.)? */
export function isPortalable(state: number): boolean {
  const id = state >>> 4;
  if (!state || !T_SOLID[id] || !T_FULL_CUBE[id] || T_LAYER[id] !== 1) return false;
  const name = BLOCKS[id]?.name ?? '';
  return !PORTAL_DENY.has(name) && !name.endsWith('_glass') && !name.includes('leaves');
}

/** Does this block leave room in front of a portal (no collision)? */
function isOpen(state: number): boolean {
  return !state || !T_SOLID[state >>> 4];
}

export interface ShotHit {
  x: number;
  y: number;
  z: number;
  face: number;
  state: number;
  point: THREE.Vector3;
  dist: number;
}

const _box = new AABB();
const _boxes: number[] = [];
const _faceOut = { face: 0 };

/** Ray through the world stopping at blocks that have collision (plants, fluids and air pass). */
export function shotRaycast(world: World, o: THREE.Vector3, d: THREE.Vector3, maxDist: number): ShotHit | null {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = sx ? Math.abs(1 / d.x) : Infinity, tdy = sy ? Math.abs(1 / d.y) : Infinity, tdz = sz ? Math.abs(1 / d.z) : Infinity;
  let tmx = sx > 0 ? (x + 1 - o.x) * tdx : sx < 0 ? (o.x - x) * tdx : Infinity;
  let tmy = sy > 0 ? (y + 1 - o.y) * tdy : sy < 0 ? (o.y - y) * tdy : Infinity;
  let tmz = sz > 0 ? (z + 1 - o.z) * tdz : sz < 0 ? (o.z - z) * tdz : Infinity;
  for (let i = 0; i < 1024; i++) {
    const st = world.getBlock(x, y, z);
    if (st && T_SOLID[st >>> 4]) {
      _boxes.length = 0;
      getCollisionBoxes(st, (dx, dy, dz) => world.getBlock(x + dx, y + dy, z + dz), _boxes);
      let best = Infinity, face = 0;
      for (let k = 0; k < _boxes.length; k += 6) {
        _box.set(x + _boxes[k], y + _boxes[k + 1], z + _boxes[k + 2], x + _boxes[k + 3], y + _boxes[k + 4], z + _boxes[k + 5]);
        const t = _box.rayIntersect(o.x, o.y, o.z, d.x, d.y, d.z, maxDist, _faceOut);
        if (t >= 0 && t < best) { best = t; face = _faceOut.face; }
      }
      if (best <= maxDist) return { x, y, z, face, state: st, point: new THREE.Vector3().copy(o).addScaledVector(d, best), dist: best };
    }
    if (tmx < tmy && tmx < tmz) {
      if (tmx > maxDist) break;
      x += sx; tmx += tdx;
    } else if (tmy < tmz) {
      if (tmy > maxDist) break;
      y += sy; tmy += tdy;
    } else {
      if (tmz > maxDist) break;
      z += sz; tmz += tdz;
    }
  }
  return null;
}

// ------------------------------------------------------------------------------- placement
const _cell = [0, 0, 0];

/** Does a portal with this frame fit: portalable wall behind every cell, open space in front? */
export function portalFits(world: World, f: PortalFrame): boolean {
  const cu = comp(f.c, f.uAxis), cv = comp(f.c, f.vAxis);
  const hu = PORTAL_HW;
  const hv = PORTAL_HH;
  const e = 1e-4;
  const u0 = Math.floor(cu - hu + e), u1 = Math.floor(cu + hu - e);
  const v0 = Math.floor(cv - hv + e), v1 = Math.floor(cv + hv - e);
  const plane = Math.round(f.plane);
  if (Math.abs(plane - f.plane) > 1e-6) return false;
  const wall = f.nSign > 0 ? plane - 1 : plane;
  const front = f.nSign > 0 ? plane : plane - 1;
  for (let iu = u0; iu <= u1; iu++)
    for (let iv = v0; iv <= v1; iv++) {
      _cell[f.uAxis] = iu;
      _cell[f.vAxis] = iv;
      _cell[f.nAxis] = wall;
      if (!isPortalable(world.getBlock(_cell[0], _cell[1], _cell[2]))) return false;
      _cell[f.nAxis] = front;
      if (!isOpen(world.getBlock(_cell[0], _cell[1], _cell[2]))) return false;
    }
  return true;
}

/** Do two portals on the same plane overlap? */
export function portalsOverlap(a: PortalFrame, b: PortalFrame, margin = 0.02): boolean {
  if (a.nAxis !== b.nAxis || a.nSign !== b.nSign || Math.abs(a.plane - b.plane) > 1e-3) return false;
  const ha = a.halfExtents(new THREE.Vector3()), hb = b.halfExtents(new THREE.Vector3());
  return Math.abs(a.c.x - b.c.x) < ha.x + hb.x + margin && Math.abs(a.c.y - b.c.y) < ha.y + hb.y + margin && Math.abs(a.c.z - b.c.z) < ha.z + hb.z + margin;
}

/** Portal `up` for a surface normal: world up on walls; along the shooter's facing on floors (away from them) and ceilings (towards them). */
export function portalUp(n: THREE.Vector3, facing: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  if (Math.abs(n.y) < 0.5) return out.set(0, 1, 0);
  const fx = facing.x * (n.y > 0 ? 1 : -1), fz = facing.z * (n.y > 0 ? 1 : -1);
  if (Math.abs(fx) >= Math.abs(fz)) return out.set(Math.sign(fx) || 1, 0, 0);
  return out.set(0, 0, Math.sign(fz) || 1);
}

const OFFSETS: [number, number][] = (() => {
  const o: [number, number][] = [];
  for (let i = -20; i <= 20; i++) for (let j = -24; j <= 24; j++) o.push([i / 16, j / 16]);
  o.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
  return o;
})();

/**
 * Place a portal for a shot hitting `hit`: the opening is centred on the hit point and nudged
 * (up to ~1.3 m) until it lies entirely on portalable blocks with open space in front, without
 * overlapping `other`. Wall portals settle onto a floor just below them so they can be walked
 * through. Returns null when it cannot fit (the shot fizzles).
 */
export function placePortal(world: World, hit: ShotHit, facing: THREE.Vector3, other: PortalFrame | null): PortalFrame | null {
  const nn = FACE_N[hit.face];
  if (!nn) return null;
  const n = new THREE.Vector3(nn[0], nn[1], nn[2]);
  const up = portalUp(n, facing);
  const a = axisOf(n);
  // plane coordinate: the hit block's face
  const blockC = [hit.x, hit.y, hit.z][a];
  const plane = n.getComponent(a) > 0 ? blockC + 1 : blockC;
  const base = hit.point.clone();
  base.setComponent(a, plane);
  const probe = new PortalFrame(base, n, up);
  const tryAt = (du: number, dv: number) => {
    const c = base.clone().addScaledVector(probe.right, du).addScaledVector(probe.up, dv);
    const f = new PortalFrame(c, n, up);
    if (!portalFits(world, f)) return null;
    if (other && portalsOverlap(f, other)) return null;
    return f;
  };
  let found: PortalFrame | null = null;
  let fu = 0, fv = 0;
  for (const [du, dv] of OFFSETS) {
    const f = tryAt(du, dv);
    if (f) { found = f; fu = du; fv = dv; break; }
  }
  if (!found) return null;
  // walls: settle the bottom edge onto a floor in front so the portal can be walked into
  if (Math.abs(n.y) < 0.5) {
    const bottom = found.c.y - PORTAL_HH;
    const fx = found.c.x + n.x * 0.5, fz = found.c.z + n.z * 0.5;
    let best: PortalFrame | null = null, bestD = Infinity;
    for (let y0 = Math.floor(bottom - 1.3); y0 <= Math.ceil(bottom + 0.6); y0++) {
      const d = y0 - bottom;
      if (d < -1.3 || d > 0.6 || Math.abs(d) >= bestD) continue;
      const below = world.getBlock(Math.floor(fx), y0 - 1, Math.floor(fz));
      if (!below || !T_SOLID[below >>> 4]) continue;
      const f = tryAt(fu, fv + d);
      if (f) { best = f; bestD = Math.abs(d); }
    }
    if (best) found = best;
  }
  return found;
}

// ------------------------------------------------------------------------------- transit
const _a = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Did the point move from in front of portal `f` (a) to behind it (b) through the opening?
 * `margin` widens the opening test (m).
 */
export function crossesPortal(f: PortalFrame, a: THREE.Vector3, b: THREE.Vector3, margin = 0.02): boolean {
  const s0 = f.side(a), s1 = f.side(b);
  if (!(s0 >= 0 && s1 < 0)) return false;
  const t = s0 / (s0 - s1);
  _p.copy(a).lerp(b, t);
  f.toLocal(_p, _a);
  return f.insideRect(_a.x, _a.y, margin);
}
