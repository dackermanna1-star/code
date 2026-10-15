// World collision: static triangle soup accelerated by a BVH, plus dynamic
// axis-aligned boxes (doors, elevator car, breakable glass, props).
// Characters are upright capsules described by feet position, radius and height.
import * as THREE from 'three';

const _seg = new THREE.Line3();
const _box = new THREE.Box3();
const _triPoint = new THREE.Vector3();
const _capPoint = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ray = new THREE.Ray();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _n = new THREE.Vector3();

export const SURF = { DEFAULT: 0, CONCRETE: 1, METAL: 2, WOOD: 3, CARPET: 4, TILE: 5, GLASS: 6, DIRT: 7, GRASS: 8, WATER: 9, FLESH: 10, GRAVEL: 11 };

export class DynamicBox {
  constructor(min, max, opts = {}) {
    this.box = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
    this.enabled = true;
    this.surface = opts.surface || SURF.METAL;
    this.owner = opts.owner || null;           // e.g. door/glass object
    this.blocksBullets = opts.blocksBullets !== false;
    this.blocksInfected = opts.blocksInfected !== false;
    this.blocksSurvivors = opts.blocksSurvivors !== false;
    this.velocity = new THREE.Vector3();       // for moving platforms
  }
}

export class CollisionWorld {
  constructor() {
    this.bvh = null;
    this.geometry = null;
    this.surfAttr = null;
    this.dynamic = [];
  }

  // moveBVH: everything solid to characters; shootBVH: everything that stops bullets / sight
  build(moveBVH, shootBVH) {
    this.bvh = moveBVH;
    this.shootBvh = shootBVH || moveBVH;
    this.surfAttr = moveBVH.geometry.getAttribute('surf');
    this.shootSurfAttr = this.shootBvh.geometry.getAttribute('surf');
  }

  addDynamic(d) { this.dynamic.push(d); return d; }
  removeDynamic(d) { const i = this.dynamic.indexOf(d); if (i >= 0) this.dynamic.splice(i, 1); }

  // Raycast against static world + dynamic boxes. Returns nearest hit or null.
  // opts: { dynamic: true, ignoreGlass: false, forBullets: false }
  raycast(origin, dir, maxDist, opts = {}) {
    _ray.origin.copy(origin); _ray.direction.copy(dir);
    let best = null;
    const bvh = opts.move ? this.bvh : this.shootBvh;
    if (bvh) {
      const hit = bvh.raycastFirst(_ray, THREE.DoubleSide, 0, maxDist);
      if (hit && hit.distance <= maxDist) {
        const sa = opts.move ? this.surfAttr : this.shootSurfAttr;
        const surf = sa ? sa.getX(hit.face.a) : 0;
        const n = hit.face.normal.clone();
        if (n.dot(dir) > 0) n.negate();
        best = { point: hit.point.clone(), normal: n, distance: hit.distance, surface: surf, dynamic: null };
      }
    }
    if (opts.dynamic !== false) {
      for (const d of this.dynamic) {
        if (!d.enabled) continue;
        if (opts.forBullets && !d.blocksBullets) continue;
        if (opts.forInfected && !d.blocksInfected) continue;
        const p = _ray.intersectBox(d.box, _v);
        if (p) {
          const dist = p.distanceTo(origin);
          if (dist <= maxDist && (!best || dist < best.distance)) {
            best = { point: p.clone(), normal: boxNormal(d.box, p), distance: dist, surface: d.surface, dynamic: d };
          }
        }
      }
    }
    return best;
  }

  // True if the straight line a->b is blocked by world geometry.
  blocked(a, b, opts = {}) {
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-4) return false;
    _dir.multiplyScalar(1 / len);
    const hit = this.raycast(a, _dir, len - 0.01, opts);
    return !!hit;
  }

  // Height of ground below point (within maxDrop). Returns {y, normal, surface} or null.
  groundAt(x, y, z, maxDrop = 50) {
    _v2.set(x, y, z);
    _n.set(0, -1, 0);
    const hit = this.raycast(_v2, _n, maxDrop, { dynamic: true, move: true });
    if (!hit) return null;
    return { y: hit.point.y, normal: hit.normal, surface: hit.surface, dynamic: hit.dynamic };
  }

  /**
   * Push an upright capsule out of the static world. feet: Vector3 (modified).
   * Returns accumulated push vector in outPush.
   */
  resolveCapsule(feet, radius, height, outPush, outNormal) {
    outPush.set(0, 0, 0);
    if (outNormal) outNormal.set(0, 0, 0);
    _seg.start.set(feet.x, feet.y + radius, feet.z);
    _seg.end.set(feet.x, feet.y + height - radius, feet.z);
    const startX = _seg.start.x, startY = _seg.start.y, startZ = _seg.start.z;
    if (this.bvh) {
      for (let iter = 0; iter < 2; iter++) {
        _box.makeEmpty();
        _box.expandByPoint(_seg.start); _box.expandByPoint(_seg.end);
        _box.min.addScalar(-radius); _box.max.addScalar(radius);
        this.bvh.shapecast({
          intersectsBounds: (b) => b.intersectsBox(_box),
          intersectsTriangle: (tri) => {
            const dist = tri.closestPointToSegment(_seg, _triPoint, _capPoint);
            if (dist < radius) {
              const depth = radius - dist;
              if (dist > 1e-6) _dir.subVectors(_capPoint, _triPoint).divideScalar(dist);
              else { tri.getNormal(_dir); }
              _seg.start.addScaledVector(_dir, depth);
              _seg.end.addScaledVector(_dir, depth);
              if (outNormal) outNormal.addScaledVector(_dir, depth);
            }
          },
        });
      }
    }
    // dynamic boxes (upright capsule vs AABB)
    for (const d of this.dynamic) {
      if (!d.enabled || !d.blocksSurvivors) continue;
      this._capsuleVsBox(_seg, radius, d.box, outNormal);
    }
    outPush.set(_seg.start.x - startX, _seg.start.y - startY, _seg.start.z - startZ);
    feet.add(outPush);
    return outPush;
  }

  _capsuleVsBox(seg, radius, box, outNormal) {
    const y0 = seg.start.y, y1 = seg.end.y;
    // closest y on segment to box's y range
    let cy;
    if (y1 < box.min.y) cy = y1; else if (y0 > box.max.y) cy = y0; else cy = Math.min(Math.max((box.min.y + box.max.y) / 2, y0), y1);
    const px = seg.start.x, pz = seg.start.z;
    const qx = Math.min(Math.max(px, box.min.x), box.max.x);
    const qy = Math.min(Math.max(cy, box.min.y), box.max.y);
    const qz = Math.min(Math.max(pz, box.min.z), box.max.z);
    let dx = px - qx, dy = cy - qy, dz = pz - qz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= radius * radius) return;
    let d = Math.sqrt(d2);
    if (d < 1e-6) {
      // centre inside box: push out along smallest axis in XZ
      const pushes = [px - box.min.x, box.max.x - px, pz - box.min.z, box.max.z - pz, box.max.y - y0];
      let mi = 0; for (let i = 1; i < 5; i++) if (pushes[i] < pushes[mi]) mi = i;
      dx = dy = dz = 0;
      if (mi === 0) dx = -1; else if (mi === 1) dx = 1; else if (mi === 2) dz = -1; else if (mi === 3) dz = 1; else dy = 1;
      const amt = pushes[mi] + radius;
      seg.start.x += dx * amt; seg.end.x += dx * amt; seg.start.z += dz * amt; seg.end.z += dz * amt; seg.start.y += dy * amt; seg.end.y += dy * amt;
      if (outNormal) outNormal.x += dx * amt, outNormal.y += dy * amt, outNormal.z += dz * amt;
      return;
    }
    const depth = radius - d;
    dx /= d; dy /= d; dz /= d;
    seg.start.x += dx * depth; seg.start.y += dy * depth; seg.start.z += dz * depth;
    seg.end.x += dx * depth; seg.end.y += dy * depth; seg.end.z += dz * depth;
    if (outNormal) { outNormal.x += dx * depth; outNormal.y += dy * depth; outNormal.z += dz * depth; }
  }

  /**
   * Character movement with substeps. body = { pos (feet), vel, radius, height, grounded, groundNormal }
   * opts: { stepDown: 0.35, gravity }
   */
  moveCharacter(body, dt, opts = {}) {
    const maxStep = 0.12;
    const speed = body.vel.length() * dt;
    const steps = Math.min(8, Math.max(1, Math.ceil(speed / maxStep)));
    const h = dt / steps;
    const push = _v; const nrm = new THREE.Vector3();
    let groundedAny = false;
    body.hitWall = false;
    const wasGrounded = body.grounded;
    for (let s = 0; s < steps; s++) {
      body.pos.addScaledVector(body.vel, h);
      this.resolveCapsule(body.pos, body.radius, body.height, push, nrm);
      const pl = push.length();
      if (pl > 1e-6) {
        const n = nrm.lengthSq() > 1e-10 ? nrm.normalize() : push.clone().normalize();
        if (n.y > 0.6) {
          groundedAny = true;
          body.groundNormal.copy(n);
          if (body.vel.y < 0) body.vel.y = 0;
          // remove the small horizontal drift caused by sliding on slopes when standing still
        } else {
          // wall or ceiling: remove velocity into surface
          const vn = body.vel.dot(n);
          if (vn < 0) body.vel.addScaledVector(n, -vn);
          if (Math.abs(n.y) < 0.6) body.hitWall = true;
        }
      }
    }
    // ground probe / snap down (keeps us glued to stairs ramps and slopes)
    if (!groundedAny && (wasGrounded || body.vel.y <= 0)) {
      const probe = opts.stepDown !== undefined ? opts.stepDown : 0.3;
      const g = this.groundAt(body.pos.x, body.pos.y + 0.3, body.pos.z, 0.3 + (wasGrounded && body.vel.y <= 0.01 ? probe : 0.04));
      if (g && g.normal.y > 0.6) {
        if (wasGrounded && body.vel.y <= 0.01) body.pos.y = g.y;
        if (body.pos.y - g.y < 0.05) { groundedAny = true; body.groundNormal.copy(g.normal); if (body.vel.y < 0) body.vel.y = 0; }
        body.groundDynamic = g.dynamic;
      }
    }
    body.grounded = groundedAny;
    return body;
  }
}

function boxNormal(box, p) {
  const e = 1e-3;
  if (Math.abs(p.x - box.min.x) < e) return new THREE.Vector3(-1, 0, 0);
  if (Math.abs(p.x - box.max.x) < e) return new THREE.Vector3(1, 0, 0);
  if (Math.abs(p.y - box.min.y) < e) return new THREE.Vector3(0, -1, 0);
  if (Math.abs(p.y - box.max.y) < e) return new THREE.Vector3(0, 1, 0);
  if (Math.abs(p.z - box.min.z) < e) return new THREE.Vector3(0, 0, -1);
  return new THREE.Vector3(0, 0, 1);
}
