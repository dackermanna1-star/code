import { Vec3, Quat } from './math.js';

export const SHAPE_SPHERE = 0;
export const SHAPE_CAPSULE = 1; // segment along local Y, from -halfHeight to +halfHeight, plus radius
export const SHAPE_BOX = 2; // oriented box with half extents, optionally rounded by `radius`

let shapeIdCounter = 1;

/**
 * Collision shape attached to a rigid body. Every shape is a "core" primitive (point, segment or
 * box) inflated by a radius, which lets all pair tests share closest-point code.
 */
export class Shape {
  constructor(type, opts = {}) {
    this.id = shapeIdCounter++;
    this.type = type;
    this.radius = opts.radius ?? 0;
    this.halfHeight = opts.halfHeight ?? 0;
    this.halfExtents = opts.halfExtents ? new Vec3().copy(opts.halfExtents) : new Vec3();
    this.localPos = opts.localPos ? new Vec3().copy(opts.localPos) : new Vec3();
    this.localRot = opts.localRot ? new Quat().copy(opts.localRot) : new Quat();
    this.friction = opts.friction ?? 0.6;
    this.restitution = opts.restitution ?? 0.1;
    this.material = opts.material ?? 'default';
    this.collides = opts.collides ?? true;
    this.body = null;
    this.tag = opts.tag ?? null;

    // World-space cache, refreshed once per substep.
    this.wPos = new Vec3();
    this.wRot = new Quat();
    this.p0 = new Vec3(); // capsule endpoints
    this.p1 = new Vec3();
    this.ax = new Vec3(1, 0, 0); // box axes
    this.ay = new Vec3(0, 1, 0);
    this.az = new Vec3(0, 0, 1);
    this.aabbMin = new Vec3();
    this.aabbMax = new Vec3();
  }

  static sphere(radius, opts = {}) {
    return new Shape(SHAPE_SPHERE, { ...opts, radius });
  }

  static capsule(radius, halfHeight, opts = {}) {
    return new Shape(SHAPE_CAPSULE, { ...opts, radius, halfHeight });
  }

  static box(hx, hy, hz, opts = {}) {
    return new Shape(SHAPE_BOX, { ...opts, halfExtents: new Vec3(hx, hy, hz), radius: opts.radius ?? 0 });
  }

  // Capsule spanning two points given in the body's local frame.
  static capsuleBetween(a, b, radius, opts = {}) {
    const mid = new Vec3().addVectors(a, b).scale(0.5);
    const dir = new Vec3().subVectors(b, a);
    const len = dir.length();
    dir.normalize();
    const rot = new Quat().setFromUnitVectors(new Vec3(0, 1, 0), dir);
    return new Shape(SHAPE_CAPSULE, { ...opts, radius, halfHeight: len * 0.5, localPos: mid, localRot: rot });
  }

  volume() {
    const r = this.radius;
    switch (this.type) {
      case SHAPE_SPHERE:
        return (4 / 3) * Math.PI * r * r * r;
      case SHAPE_CAPSULE: {
        const H = 2 * this.halfHeight;
        return Math.PI * r * r * H + (4 / 3) * Math.PI * r * r * r;
      }
      case SHAPE_BOX: {
        const A = 2 * this.halfExtents.x, B = 2 * this.halfExtents.y, C = 2 * this.halfExtents.z;
        return A * B * C + 2 * r * (A * B + B * C + C * A) + Math.PI * r * r * (A + B + C) + (4 / 3) * Math.PI * r * r * r;
      }
    }
    return 0;
  }

  // Principal moments of inertia about the shape's own centre in its local frame.
  principalInertia(mass, out = new Vec3()) {
    const r = this.radius;
    switch (this.type) {
      case SHAPE_SPHERE: {
        const i = 0.4 * mass * r * r;
        return out.set(i, i, i);
      }
      case SHAPE_CAPSULE: {
        const H = 2 * this.halfHeight;
        const vc = Math.PI * r * r * H;
        const vh = (4 / 3) * Math.PI * r * r * r;
        const mc = (mass * vc) / (vc + vh);
        const mh = mass - mc; // both hemispheres together
        const iy = mc * (r * r * 0.5) + mh * (0.4 * r * r);
        const ix = mc * (H * H / 12 + r * r / 4) + mh * (0.4 * r * r + H * H / 4 + (3 * H * r) / 8);
        return out.set(ix, iy, ix);
      }
      case SHAPE_BOX: {
        const a = this.halfExtents.x + r * 0.8, b = this.halfExtents.y + r * 0.8, c = this.halfExtents.z + r * 0.8;
        return out.set((mass / 3) * (b * b + c * c), (mass / 3) * (a * a + c * c), (mass / 3) * (a * a + b * b));
      }
    }
    return out.set(0, 0, 0);
  }

  updateWorld(bodyPos, bodyRot) {
    this.wRot.multiplyQuats(bodyRot, this.localRot);
    this.wPos.copy(this.localPos).applyQuat(bodyRot).add(bodyPos);
    const r = this.radius;
    if (this.type === SHAPE_SPHERE) {
      this.aabbMin.set(this.wPos.x - r, this.wPos.y - r, this.wPos.z - r);
      this.aabbMax.set(this.wPos.x + r, this.wPos.y + r, this.wPos.z + r);
    } else if (this.type === SHAPE_CAPSULE) {
      this.ay.set(0, 1, 0).applyQuat(this.wRot);
      const hh = this.halfHeight;
      this.p0.copy(this.wPos).addScaled(this.ay, -hh);
      this.p1.copy(this.wPos).addScaled(this.ay, hh);
      this.aabbMin.set(Math.min(this.p0.x, this.p1.x) - r, Math.min(this.p0.y, this.p1.y) - r, Math.min(this.p0.z, this.p1.z) - r);
      this.aabbMax.set(Math.max(this.p0.x, this.p1.x) + r, Math.max(this.p0.y, this.p1.y) + r, Math.max(this.p0.z, this.p1.z) + r);
    } else {
      this.ax.set(1, 0, 0).applyQuat(this.wRot);
      this.ay.set(0, 1, 0).applyQuat(this.wRot);
      this.az.set(0, 0, 1).applyQuat(this.wRot);
      const e = this.halfExtents;
      const ex = Math.abs(this.ax.x) * e.x + Math.abs(this.ay.x) * e.y + Math.abs(this.az.x) * e.z + r;
      const ey = Math.abs(this.ax.y) * e.x + Math.abs(this.ay.y) * e.y + Math.abs(this.az.y) * e.z + r;
      const ez = Math.abs(this.ax.z) * e.x + Math.abs(this.ay.z) * e.y + Math.abs(this.az.z) * e.z + r;
      this.aabbMin.set(this.wPos.x - ex, this.wPos.y - ey, this.wPos.z - ez);
      this.aabbMax.set(this.wPos.x + ex, this.wPos.y + ey, this.wPos.z + ez);
    }
  }

  // Bounding radius around the shape centre (used for swept bounds).
  boundingRadius() {
    switch (this.type) {
      case SHAPE_SPHERE:
        return this.radius;
      case SHAPE_CAPSULE:
        return this.radius + this.halfHeight;
      default:
        return this.halfExtents.length() + this.radius;
    }
  }

  // Signed distance from a world point to this shape's surface.
  signedDistance(p) {
    const r = this.radius;
    if (this.type === SHAPE_SPHERE) {
      return p.distanceTo(this.wPos) - r;
    }
    if (this.type === SHAPE_CAPSULE) {
      const dx = this.p1.x - this.p0.x, dy = this.p1.y - this.p0.y, dz = this.p1.z - this.p0.z;
      const len2 = dx * dx + dy * dy + dz * dz;
      let t = ((p.x - this.p0.x) * dx + (p.y - this.p0.y) * dy + (p.z - this.p0.z) * dz) / (len2 || 1);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = this.p0.x + dx * t - p.x, qy = this.p0.y + dy * t - p.y, qz = this.p0.z + dz * t - p.z;
      return Math.sqrt(qx * qx + qy * qy + qz * qz) - r;
    }
    const px = p.x - this.wPos.x, py = p.y - this.wPos.y, pz = p.z - this.wPos.z;
    const lx = Math.abs(px * this.ax.x + py * this.ax.y + pz * this.ax.z) - this.halfExtents.x;
    const ly = Math.abs(px * this.ay.x + py * this.ay.y + pz * this.ay.z) - this.halfExtents.y;
    const lz = Math.abs(px * this.az.x + py * this.az.y + pz * this.az.z) - this.halfExtents.z;
    const ox = Math.max(lx, 0), oy = Math.max(ly, 0), oz = Math.max(lz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(lx, ly, lz), 0) - r;
  }
}
