/**
 * Axis-aligned bounding boxes and swept collision of entity boxes against the voxel world
 * (Minecraft-style: resolve Y, then X, then Z with step-up support).
 */
import type { World } from '../world/world';
import { getCollisionBoxes } from '../world/blocks/models';
import { T_SOLID } from '../world/blocks/registry';

export class AABB {
  constructor(public minX = 0, public minY = 0, public minZ = 0, public maxX = 0, public maxY = 0, public maxZ = 0) {}
  static fromCenter(x: number, y: number, z: number, w: number, h: number): AABB {
    return new AABB(x - w / 2, y, z - w / 2, x + w / 2, y + h, z + w / 2);
  }
  set(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.minX = a; this.minY = b; this.minZ = c; this.maxX = d; this.maxY = e; this.maxZ = f;
    return this;
  }
  copy(o: AABB) {
    return this.set(o.minX, o.minY, o.minZ, o.maxX, o.maxY, o.maxZ);
  }
  clone() {
    return new AABB(this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ);
  }
  offset(x: number, y: number, z: number) {
    this.minX += x; this.maxX += x; this.minY += y; this.maxY += y; this.minZ += z; this.maxZ += z;
    return this;
  }
  expand(x: number, y: number, z: number): AABB {
    const r = this.clone();
    if (x < 0) r.minX += x; else r.maxX += x;
    if (y < 0) r.minY += y; else r.maxY += y;
    if (z < 0) r.minZ += z; else r.maxZ += z;
    return r;
  }
  grow(d: number): AABB {
    return new AABB(this.minX - d, this.minY - d, this.minZ - d, this.maxX + d, this.maxY + d, this.maxZ + d);
  }
  intersects(o: AABB): boolean {
    return this.minX < o.maxX && this.maxX > o.minX && this.minY < o.maxY && this.maxY > o.minY && this.minZ < o.maxZ && this.maxZ > o.minZ;
  }
  contains(x: number, y: number, z: number) {
    return x >= this.minX && x <= this.maxX && y >= this.minY && y <= this.maxY && z >= this.minZ && z <= this.maxZ;
  }
  get centerX() { return (this.minX + this.maxX) / 2; }
  get centerY() { return (this.minY + this.maxY) / 2; }
  get centerZ() { return (this.minZ + this.maxZ) / 2; }
  /** Ray intersection, returns t or -1 and face (Dir) via out. */
  rayIntersect(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out?: { face: number }): number {
    let tmin = 0, tmax = maxT, face = -1;
    const axes: [number, number, number, number, number, number][] = [
      [ox, dx, this.minX, this.maxX, 4, 5],
      [oy, dy, this.minY, this.maxY, 0, 1],
      [oz, dz, this.minZ, this.maxZ, 2, 3],
    ];
    for (const [o, d, mn, mx, fneg, fpos] of axes) {
      if (Math.abs(d) < 1e-12) {
        if (o < mn || o > mx) return -1;
        continue;
      }
      let t1 = (mn - o) / d, t2 = (mx - o) / d;
      let f = fneg;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; f = fpos; }
      if (t1 > tmin) { tmin = t1; face = f; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    if (out) out.face = face;
    return tmin;
  }
}

const tmpBoxes: number[] = [];

/**
 * Regions where block collision is removed (the tunnel behind a linked portal, so bodies can
 * pass into the wall while their eye is still in front of the portal plane). Owned by the
 * portal system; empty almost always.
 */
export const COLLISION_HOLES: { holes: AABB[]; world: World | null } = { holes: [], world: null };

/** Push the parts of `b` outside hole `h` (axis-aligned box difference: up to 6 pieces). */
function subtractBox(b: AABB, h: AABB, out: AABB[]) {
  if (!b.intersects(h)) {
    out.push(b);
    return;
  }
  let minX = b.minX, maxX = b.maxX, minY = b.minY, maxY = b.maxY;
  if (minX < h.minX) { out.push(new AABB(minX, b.minY, b.minZ, h.minX, b.maxY, b.maxZ)); minX = h.minX; }
  if (maxX > h.maxX) { out.push(new AABB(h.maxX, b.minY, b.minZ, maxX, b.maxY, b.maxZ)); maxX = h.maxX; }
  if (minY < h.minY) { out.push(new AABB(minX, minY, b.minZ, maxX, h.minY, b.maxZ)); minY = h.minY; }
  if (maxY > h.maxY) { out.push(new AABB(minX, h.maxY, b.minZ, maxX, maxY, b.maxZ)); maxY = h.maxY; }
  if (b.minZ < h.minZ) out.push(new AABB(minX, minY, b.minZ, maxX, maxY, h.minZ));
  if (b.maxZ > h.maxZ) out.push(new AABB(minX, minY, h.maxZ, maxX, maxY, b.maxZ));
}

const holeTmp: AABB[] = [];
const holeTmp2: AABB[] = [];

/** Collect world collision boxes overlapping `box` into `out` (as AABB objects). */
export function collectCollisions(world: World, box: AABB, out: AABB[]): void {
  collectWorldCollisions(world, box, out);
  const holes = COLLISION_HOLES.holes;
  if (!holes.length || COLLISION_HOLES.world !== world) return;
  for (const h of holes) {
    if (!h.intersects(box)) continue;
    holeTmp.length = 0;
    for (const b of out) subtractBox(b, h, holeTmp);
    holeTmp2.length = 0;
    for (const b of holeTmp) if (b.maxX - b.minX > 1e-6 && b.maxY - b.minY > 1e-6 && b.maxZ - b.minZ > 1e-6) holeTmp2.push(b);
    out.length = 0;
    for (const b of holeTmp2) out.push(b);
  }
}

function collectWorldCollisions(world: World, box: AABB, out: AABB[]): void {
  out.length = 0;
  const x0 = Math.floor(box.minX) - 1, x1 = Math.floor(box.maxX) + 1;
  const y0 = Math.floor(box.minY) - 1, y1 = Math.floor(box.maxY) + 1;
  const z0 = Math.floor(box.minZ) - 1, z1 = Math.floor(box.maxZ) + 1;
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++) {
      if (!world.isLoaded(x, z)) {
        // unloaded chunks are solid walls
        out.push(new AABB(x, y0, z, x + 1, y1 + 1, z + 1));
        continue;
      }
      for (let y = y0; y <= y1; y++) {
        const st = world.getBlock(x, y, z);
        if (st === 0 || !T_SOLID[st >>> 4]) continue;
        tmpBoxes.length = 0;
        getCollisionBoxes(st, (dx, dy, dz) => world.getBlock(x + dx, y + dy, z + dz), tmpBoxes);
        for (let i = 0; i < tmpBoxes.length; i += 6) {
          const b = new AABB(x + tmpBoxes[i], y + tmpBoxes[i + 1], z + tmpBoxes[i + 2], x + tmpBoxes[i + 3], y + tmpBoxes[i + 4], z + tmpBoxes[i + 5]);
          if (b.intersects(box)) out.push(b);
        }
      }
    }
}

function clipY(b: AABB, o: AABB, dy: number) {
  if (o.maxX <= b.minX || o.minX >= b.maxX || o.maxZ <= b.minZ || o.minZ >= b.maxZ) return dy;
  if (dy > 0 && o.minY >= b.maxY - 1e-7) dy = Math.min(dy, o.minY - b.maxY);
  else if (dy < 0 && o.maxY <= b.minY + 1e-7) dy = Math.max(dy, o.maxY - b.minY);
  return dy;
}
function clipX(b: AABB, o: AABB, dx: number) {
  if (o.maxY <= b.minY || o.minY >= b.maxY || o.maxZ <= b.minZ || o.minZ >= b.maxZ) return dx;
  if (dx > 0 && o.minX >= b.maxX - 1e-7) dx = Math.min(dx, o.minX - b.maxX);
  else if (dx < 0 && o.maxX <= b.minX + 1e-7) dx = Math.max(dx, o.maxX - b.minX);
  return dx;
}
function clipZ(b: AABB, o: AABB, dz: number) {
  if (o.maxX <= b.minX || o.minX >= b.maxX || o.maxY <= b.minY || o.minY >= b.maxY) return dz;
  if (dz > 0 && o.minZ >= b.maxZ - 1e-7) dz = Math.min(dz, o.minZ - b.maxZ);
  else if (dz < 0 && o.maxZ <= b.minZ + 1e-7) dz = Math.max(dz, o.maxZ - b.minZ);
  return dz;
}

export interface MoveResult {
  dx: number; dy: number; dz: number;
  collidedX: boolean; collidedY: boolean; collidedZ: boolean;
  onGround: boolean;
  stepped: number;
}

const cols: AABB[] = [];

/**
 * Move `box` by (dx,dy,dz) against the world. Mutates box. `stepHeight` allows climbing
 * small ledges (0.6 for the player) when on ground.
 */
export function moveBox(world: World, box: AABB, dx: number, dy: number, dz: number, stepHeight = 0, onGroundBefore = false, extra?: AABB[]): MoveResult {
  const want = { dx, dy, dz };
  collectCollisions(world, box.expand(dx, dy, dz).grow(0.01), cols);
  if (extra) for (const e of extra) cols.push(e);
  const start = box.clone();
  for (const o of cols) dy = clipY(box, o, dy);
  box.offset(0, dy, 0);
  for (const o of cols) dx = clipX(box, o, dx);
  box.offset(dx, 0, 0);
  for (const o of cols) dz = clipZ(box, o, dz);
  box.offset(0, 0, dz);
  const collidedX = Math.abs(dx - want.dx) > 1e-9, collidedZ = Math.abs(dz - want.dz) > 1e-9;
  let collidedY = Math.abs(dy - want.dy) > 1e-9;
  let onGround = collidedY && want.dy < 0;
  let stepped = 0;
  // step-up
  if (stepHeight > 0 && (onGround || onGroundBefore) && (collidedX || collidedZ)) {
    const b2 = start.clone();
    collectCollisions(world, b2.expand(want.dx, stepHeight, want.dz).grow(0.01), cols);
    if (extra) for (const e of extra) cols.push(e);
    let sy = stepHeight;
    for (const o of cols) sy = clipY(b2, o, sy);
    b2.offset(0, sy, 0);
    let sx = want.dx, sz = want.dz;
    for (const o of cols) sx = clipX(b2, o, sx);
    b2.offset(sx, 0, 0);
    for (const o of cols) sz = clipZ(b2, o, sz);
    b2.offset(0, 0, sz);
    let down = -sy;
    for (const o of cols) down = clipY(b2, o, down);
    b2.offset(0, down, 0);
    if (sx * sx + sz * sz > dx * dx + dz * dz + 1e-9) {
      stepped = b2.minY - start.minY;
      box.copy(b2);
      dx = sx; dz = sz; dy = b2.minY - start.minY;
      onGround = true;
      collidedY = true;
      return { dx, dy, dz, collidedX: Math.abs(sx - want.dx) > 1e-9, collidedY, collidedZ: Math.abs(sz - want.dz) > 1e-9, onGround, stepped };
    }
  }
  return { dx, dy, dz, collidedX, collidedY, collidedZ, onGround, stepped };
}

/** True if the box overlaps any solid collision box. */
export function boxCollides(world: World, box: AABB): boolean {
  collectCollisions(world, box, cols);
  for (const c of cols) if (c.intersects(box)) return true;
  return false;
}
