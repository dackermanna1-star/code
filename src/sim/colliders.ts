// Rigid collision shapes for the static world and for kinematic (scripted)
// obstacles. Soft-body nodes are tested against these as points; wheels cast
// short rays against them.

import { Surface } from './surfaces.ts';

export const SHAPE_BOX = 0;
export const SHAPE_SPHERE = 1;
export const SHAPE_CAPSULE = 2;
export const SHAPE_CYLINDER = 3;
export const SHAPE_CONVEX = 4;

/** Collider flags. */
export const CF_SPIKES = 1; // punctures tires on contact
export const CF_NO_WHEELS = 2; // ignored by wheel raycasts
export const CF_TRIGGER = 4; // reports overlap, no collision response
export const CF_SHARP = 8; // spikes and blades: higher local damage
export const CF_CONVEYOR = 16; // surface velocity applies without moving the shape
export const CF_CUTTER = 32; // shredder teeth: rips the beams it grinds against

export interface PointHit {
  depth: number;
  nx: number;
  ny: number;
  nz: number;
}

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
  /** surface velocity at the hit point */
  vx: number;
  vy: number;
  vz: number;
  surface: number;
  collider: Collider | null;
  flags: number;
}

export function makeRayHit(): RayHit {
  return { t: Infinity, nx: 0, ny: 1, nz: 0, vx: 0, vy: 0, vz: 0, surface: Surface.ASPHALT, collider: null, flags: 0 };
}

let nextColliderId = 1;

export class Collider {
  readonly id = nextColliderId++;
  shape: number;
  /** World position of the shape's local origin. */
  pos = new Float64Array(3);
  /** Row-major rotation, local -> world. */
  rot = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  /** Linear velocity (m/s) of the local origin. */
  lin = new Float64Array(3);
  /** Angular velocity (rad/s, world axis). */
  ang = new Float64Array(3);
  /** Additional tangential surface velocity in local space (conveyors). */
  surfVel = new Float64Array(3);

  /** Box half extents; sphere [r]; capsule [r, halfLen]; cylinder [r, halfHeight]. Axis is local Y. */
  half = new Float64Array(3);
  /** Convex planes in local space: nx, ny, nz, d (inside when n.p - d <= 0). */
  planes: Float64Array | null = null;
  /** Local bounding box for convex shapes. */
  localMin = new Float64Array(3);
  localMax = new Float64Array(3);

  min = new Float64Array(3);
  max = new Float64Array(3);

  friction = 0.6;
  restitution = 0.05;
  surface: number = Surface.CONCRETE;
  flags = 0;
  kinematic = false;
  enabled = true;
  /** Damage multiplier for nodes hitting this (e.g. spikes, grinder teeth). */
  harshness = 1;

  /** If set, contact impulses are accumulated so a dynamic owner can react. */
  receivesImpulse = false;
  impulse = new Float64Array(3);
  angImpulse = new Float64Array(3);
  /** Pivot around which angular impulse is accumulated (world). */
  pivot = new Float64Array(3);

  /** Opaque owner reference (obstacle), and a tag for sounds/effects. */
  owner: unknown = null;
  tag = '';
  /** Frame counter of last contact, used by owners for sounds. */
  lastContactFrame = -1;
  contactSpeed = 0;

  constructor(shape: number) {
    this.shape = shape;
  }

  static box(hx: number, hy: number, hz: number): Collider {
    const c = new Collider(SHAPE_BOX);
    c.half[0] = hx;
    c.half[1] = hy;
    c.half[2] = hz;
    return c;
  }

  static sphere(r: number): Collider {
    const c = new Collider(SHAPE_SPHERE);
    c.half[0] = r;
    return c;
  }

  /** Capsule along local Y with given radius and half length of the inner segment. */
  static capsule(r: number, halfLen: number): Collider {
    const c = new Collider(SHAPE_CAPSULE);
    c.half[0] = r;
    c.half[1] = halfLen;
    return c;
  }

  /** Cylinder along local Y. */
  static cylinder(r: number, halfHeight: number): Collider {
    const c = new Collider(SHAPE_CYLINDER);
    c.half[0] = r;
    c.half[1] = halfHeight;
    return c;
  }

  /** Convex hull given by vertices (local space); planes computed from a face list. */
  static convex(vertices: number[][], faces: number[][]): Collider {
    const c = new Collider(SHAPE_CONVEX);
    const planes = new Float64Array(faces.length * 4);
    let cx = 0, cy = 0, cz = 0;
    for (const v of vertices) {
      cx += v[0];
      cy += v[1];
      cz += v[2];
    }
    cx /= vertices.length;
    cy /= vertices.length;
    cz /= vertices.length;
    faces.forEach((f, i) => {
      const a = vertices[f[0]], b = vertices[f[1]], d = vertices[f[2]];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      let dd = nx * a[0] + ny * a[1] + nz * a[2];
      // orient outward (centroid must be inside)
      if (nx * cx + ny * cy + nz * cz - dd > 0) {
        nx = -nx; ny = -ny; nz = -nz; dd = -dd;
      }
      planes[i * 4] = nx;
      planes[i * 4 + 1] = ny;
      planes[i * 4 + 2] = nz;
      planes[i * 4 + 3] = dd;
    });
    c.planes = planes;
    c.localMin.fill(Infinity);
    c.localMax.fill(-Infinity);
    for (const v of vertices) {
      for (let k = 0; k < 3; k++) {
        c.localMin[k] = Math.min(c.localMin[k], v[k]);
        c.localMax[k] = Math.max(c.localMax[k], v[k]);
      }
    }
    return c;
  }

  /** Wedge/ramp: length along local Z (0..len), width X centered, rising from y=0 at z=0 to y=height at z=len. */
  static wedge(width: number, length: number, height: number): Collider {
    const hw = width / 2;
    const verts = [
      [-hw, 0, 0], [hw, 0, 0], // front low edge
      [-hw, 0, length], [hw, 0, length], // back bottom
      [-hw, height, length], [hw, height, length], // back top
    ];
    const faces = [
      [0, 2, 1], // bottom
      [0, 1, 4], // slope (0,1,5,4)
      [2, 4, 3], // back
      [0, 4, 2], // left
      [1, 3, 5], // right
    ];
    return Collider.convex(verts, faces);
  }

  setPosition(x: number, y: number, z: number): this {
    this.pos[0] = x;
    this.pos[1] = y;
    this.pos[2] = z;
    return this;
  }

  setRotation(m: ArrayLike<number>): this {
    for (let i = 0; i < 9; i++) this.rot[i] = m[i];
    return this;
  }

  setYaw(yaw: number): this {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const r = this.rot;
    r[0] = c; r[1] = 0; r[2] = s;
    r[3] = 0; r[4] = 1; r[5] = 0;
    r[6] = -s; r[7] = 0; r[8] = c;
    return this;
  }

  /** Recompute world AABB from current pose. Pads by `pad` meters. */
  updateBounds(pad = 0): void {
    const r = this.rot, p = this.pos, h = this.half;
    let ex = 0, ey = 0, ez = 0;
    let ox = 0, oy = 0, oz = 0;
    switch (this.shape) {
      case SHAPE_BOX:
        ex = Math.abs(r[0]) * h[0] + Math.abs(r[1]) * h[1] + Math.abs(r[2]) * h[2];
        ey = Math.abs(r[3]) * h[0] + Math.abs(r[4]) * h[1] + Math.abs(r[5]) * h[2];
        ez = Math.abs(r[6]) * h[0] + Math.abs(r[7]) * h[1] + Math.abs(r[8]) * h[2];
        break;
      case SHAPE_SPHERE:
        ex = ey = ez = h[0];
        break;
      case SHAPE_CAPSULE: {
        const hl = h[1];
        ex = Math.abs(r[1]) * hl + h[0];
        ey = Math.abs(r[4]) * hl + h[0];
        ez = Math.abs(r[7]) * hl + h[0];
        break;
      }
      case SHAPE_CYLINDER: {
        const rr = h[0], hh = h[1];
        ex = Math.abs(r[1]) * hh + rr * Math.sqrt(Math.max(0, 1 - r[1] * r[1]));
        ey = Math.abs(r[4]) * hh + rr * Math.sqrt(Math.max(0, 1 - r[4] * r[4]));
        ez = Math.abs(r[7]) * hh + rr * Math.sqrt(Math.max(0, 1 - r[7] * r[7]));
        break;
      }
      case SHAPE_CONVEX: {
        const lmin = this.localMin, lmax = this.localMax;
        const cx = (lmin[0] + lmax[0]) / 2, cy = (lmin[1] + lmax[1]) / 2, cz = (lmin[2] + lmax[2]) / 2;
        const hx = (lmax[0] - lmin[0]) / 2, hy = (lmax[1] - lmin[1]) / 2, hz = (lmax[2] - lmin[2]) / 2;
        ox = r[0] * cx + r[1] * cy + r[2] * cz;
        oy = r[3] * cx + r[4] * cy + r[5] * cz;
        oz = r[6] * cx + r[7] * cy + r[8] * cz;
        ex = Math.abs(r[0]) * hx + Math.abs(r[1]) * hy + Math.abs(r[2]) * hz;
        ey = Math.abs(r[3]) * hx + Math.abs(r[4]) * hy + Math.abs(r[5]) * hz;
        ez = Math.abs(r[6]) * hx + Math.abs(r[7]) * hy + Math.abs(r[8]) * hz;
        break;
      }
    }
    this.min[0] = p[0] + ox - ex - pad;
    this.min[1] = p[1] + oy - ey - pad;
    this.min[2] = p[2] + oz - ez - pad;
    this.max[0] = p[0] + ox + ex + pad;
    this.max[1] = p[1] + oy + ey + pad;
    this.max[2] = p[2] + oz + ez + pad;
  }

  /** Surface velocity at world point. */
  velocityAt(x: number, y: number, z: number, out: Float64Array | number[]): void {
    const rx = x - this.pos[0], ry = y - this.pos[1], rz = z - this.pos[2];
    const w = this.ang, l = this.lin;
    out[0] = l[0] + w[1] * rz - w[2] * ry;
    out[1] = l[1] + w[2] * rx - w[0] * rz;
    out[2] = l[2] + w[0] * ry - w[1] * rx;
    if (this.flags & CF_CONVEYOR) {
      const r = this.rot, s = this.surfVel;
      out[0] += r[0] * s[0] + r[1] * s[1] + r[2] * s[2];
      out[1] += r[3] * s[0] + r[4] * s[1] + r[5] * s[2];
      out[2] += r[6] * s[0] + r[7] * s[1] + r[8] * s[2];
    }
  }
}

/**
 * Point vs shape. Returns true if the point is inside; writes penetration
 * depth and world-space outward normal.
 */
export function pointQuery(c: Collider, x: number, y: number, z: number, out: PointHit): boolean {
  const p = c.pos, r = c.rot, h = c.half;
  const dx = x - p[0], dy = y - p[1], dz = z - p[2];
  switch (c.shape) {
    case SHAPE_SPHERE: {
      const d2 = dx * dx + dy * dy + dz * dz;
      const rad = h[0];
      if (d2 >= rad * rad) return false;
      const d = Math.sqrt(d2);
      if (d < 1e-9) {
        out.nx = 0; out.ny = 1; out.nz = 0;
      } else {
        out.nx = dx / d; out.ny = dy / d; out.nz = dz / d;
      }
      out.depth = rad - d;
      return true;
    }
    case SHAPE_BOX: {
      const lx = r[0] * dx + r[3] * dy + r[6] * dz;
      const ly = r[1] * dx + r[4] * dy + r[7] * dz;
      const lz = r[2] * dx + r[5] * dy + r[8] * dz;
      const px = h[0] - Math.abs(lx);
      if (px <= 0) return false;
      const py = h[1] - Math.abs(ly);
      if (py <= 0) return false;
      const pz = h[2] - Math.abs(lz);
      if (pz <= 0) return false;
      if (px < py && px < pz) {
        const s = lx > 0 ? 1 : -1;
        out.nx = r[0] * s; out.ny = r[3] * s; out.nz = r[6] * s;
        out.depth = px;
      } else if (py < pz) {
        const s = ly > 0 ? 1 : -1;
        out.nx = r[1] * s; out.ny = r[4] * s; out.nz = r[7] * s;
        out.depth = py;
      } else {
        const s = lz > 0 ? 1 : -1;
        out.nx = r[2] * s; out.ny = r[5] * s; out.nz = r[8] * s;
        out.depth = pz;
      }
      return true;
    }
    case SHAPE_CAPSULE: {
      const ly = r[1] * dx + r[4] * dy + r[7] * dz;
      const hl = h[1];
      const t = ly < -hl ? -hl : ly > hl ? hl : ly;
      // closest point on segment in world
      const qx = dx - r[1] * t, qy = dy - r[4] * t, qz = dz - r[7] * t;
      const d2 = qx * qx + qy * qy + qz * qz;
      const rad = h[0];
      if (d2 >= rad * rad) return false;
      const d = Math.sqrt(d2);
      if (d < 1e-9) {
        out.nx = r[0]; out.ny = r[3]; out.nz = r[6];
      } else {
        out.nx = qx / d; out.ny = qy / d; out.nz = qz / d;
      }
      out.depth = rad - d;
      return true;
    }
    case SHAPE_CYLINDER: {
      const lx = r[0] * dx + r[3] * dy + r[6] * dz;
      const ly = r[1] * dx + r[4] * dy + r[7] * dz;
      const lz = r[2] * dx + r[5] * dy + r[8] * dz;
      const hh = h[1];
      const capPen = hh - Math.abs(ly);
      if (capPen <= 0) return false;
      const rad = h[0];
      const rr2 = lx * lx + lz * lz;
      if (rr2 >= rad * rad) return false;
      const rr = Math.sqrt(rr2);
      const sidePen = rad - rr;
      if (sidePen < capPen) {
        let ux = 1, uz = 0;
        if (rr > 1e-9) {
          ux = lx / rr;
          uz = lz / rr;
        }
        out.nx = r[0] * ux + r[2] * uz;
        out.ny = r[3] * ux + r[5] * uz;
        out.nz = r[6] * ux + r[8] * uz;
        out.depth = sidePen;
      } else {
        const s = ly > 0 ? 1 : -1;
        out.nx = r[1] * s; out.ny = r[4] * s; out.nz = r[7] * s;
        out.depth = capPen;
      }
      return true;
    }
    case SHAPE_CONVEX: {
      const lx = r[0] * dx + r[3] * dy + r[6] * dz;
      const ly = r[1] * dx + r[4] * dy + r[7] * dz;
      const lz = r[2] * dx + r[5] * dy + r[8] * dz;
      const pl = c.planes!;
      let best = -Infinity, bi = 0;
      for (let i = 0; i < pl.length; i += 4) {
        const d = pl[i] * lx + pl[i + 1] * ly + pl[i + 2] * lz - pl[i + 3];
        if (d > 0) return false;
        if (d > best) {
          best = d;
          bi = i;
        }
      }
      const nx = pl[bi], ny = pl[bi + 1], nz = pl[bi + 2];
      out.nx = r[0] * nx + r[1] * ny + r[2] * nz;
      out.ny = r[3] * nx + r[4] * ny + r[5] * nz;
      out.nz = r[6] * nx + r[7] * ny + r[8] * nz;
      out.depth = -best;
      return true;
    }
  }
  return false;
}

/**
 * Ray vs shape. Direction must be normalized. Returns hit distance in [0, maxT]
 * or -1. Rays starting inside report t = 0 and the nearest face normal.
 */
export function rayQuery(
  c: Collider,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxT: number,
  out: RayHit,
): number {
  const p = c.pos, r = c.rot, h = c.half;
  // to local
  const rx = ox - p[0], ry = oy - p[1], rz = oz - p[2];
  const lox = r[0] * rx + r[3] * ry + r[6] * rz;
  const loy = r[1] * rx + r[4] * ry + r[7] * rz;
  const loz = r[2] * rx + r[5] * ry + r[8] * rz;
  const ldx = r[0] * dx + r[3] * dy + r[6] * dz;
  const ldy = r[1] * dx + r[4] * dy + r[7] * dz;
  const ldz = r[2] * dx + r[5] * dy + r[8] * dz;
  let t = -1;
  let lnx = 0, lny = 1, lnz = 0;
  switch (c.shape) {
    case SHAPE_BOX: {
      let tmin = -Infinity, tmax = Infinity;
      let ax = 0, sgn = 1;
      const o = [lox, loy, loz], d = [ldx, ldy, ldz];
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-12) {
          if (o[k] < -h[k] || o[k] > h[k]) return -1;
        } else {
          const inv = 1 / d[k];
          let t1 = (-h[k] - o[k]) * inv;
          let t2 = (h[k] - o[k]) * inv;
          let s = -1;
          if (t1 > t2) {
            const tmp = t1; t1 = t2; t2 = tmp;
            s = 1;
          }
          if (t1 > tmin) {
            tmin = t1;
            ax = k;
            sgn = s;
          }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) return -1;
        }
      }
      if (tmax < 0 || tmin > maxT) return -1;
      if (tmin < 0) {
        // origin inside: nearest face
        let best = Infinity;
        for (let k = 0; k < 3; k++) {
          const pen = h[k] - Math.abs(o[k]);
          if (pen < best) {
            best = pen;
            ax = k;
            sgn = o[k] > 0 ? 1 : -1;
          }
        }
        t = 0;
      } else t = tmin;
      lnx = ax === 0 ? sgn : 0;
      lny = ax === 1 ? sgn : 0;
      lnz = ax === 2 ? sgn : 0;
      break;
    }
    case SHAPE_SPHERE: {
      const rad = h[0];
      const b = lox * ldx + loy * ldy + loz * ldz;
      const cc = lox * lox + loy * loy + loz * loz - rad * rad;
      if (cc < 0) {
        t = 0;
      } else {
        const disc = b * b - cc;
        if (disc < 0) return -1;
        t = -b - Math.sqrt(disc);
        if (t < 0 || t > maxT) return -1;
      }
      const hx = lox + ldx * t, hy = loy + ldy * t, hz = loz + ldz * t;
      const l = Math.hypot(hx, hy, hz) || 1;
      lnx = hx / l; lny = hy / l; lnz = hz / l;
      break;
    }
    case SHAPE_CAPSULE:
    case SHAPE_CYLINDER: {
      const rad = h[0], hh = h[1];
      // infinite cylinder along Y
      const a = ldx * ldx + ldz * ldz;
      const b = lox * ldx + loz * ldz;
      const cc = lox * lox + loz * loz - rad * rad;
      let best = Infinity;
      let bnx = 0, bny = 1, bnz = 0;
      if (cc < 0 && Math.abs(loy) <= hh) {
        // inside the tube section
        best = 0;
        const rr = Math.hypot(lox, loz) || 1;
        bnx = lox / rr; bnz = loz / rr; bny = 0;
        if (c.shape === SHAPE_CYLINDER && hh - Math.abs(loy) < rad - rr) {
          bnx = 0; bnz = 0; bny = loy > 0 ? 1 : -1;
        }
      } else {
        if (a > 1e-12) {
          const disc = b * b - a * cc;
          if (disc >= 0) {
            const tt = (-b - Math.sqrt(disc)) / a;
            if (tt >= 0 && tt <= maxT) {
              const yy = loy + ldy * tt;
              if (Math.abs(yy) <= hh) {
                best = tt;
                const hx = lox + ldx * tt, hz = loz + ldz * tt;
                const rr = Math.hypot(hx, hz) || 1;
                bnx = hx / rr; bny = 0; bnz = hz / rr;
              }
            }
          }
        }
        if (c.shape === SHAPE_CYLINDER) {
          // caps
          if (Math.abs(ldy) > 1e-12) {
            for (const s of [-1, 1]) {
              const tt = (s * hh - loy) / ldy;
              if (tt >= 0 && tt <= maxT && tt < best) {
                const hx = lox + ldx * tt, hz = loz + ldz * tt;
                if (hx * hx + hz * hz <= rad * rad && (loy - s * hh) * s > 0) {
                  best = tt;
                  bnx = 0; bny = s; bnz = 0;
                }
              }
            }
          }
        } else {
          // sphere caps
          for (const s of [-1, 1]) {
            const cy = s * hh;
            const qy = loy - cy;
            const bb = lox * ldx + qy * ldy + loz * ldz;
            const c2 = lox * lox + qy * qy + loz * loz - rad * rad;
            if (c2 < 0) {
              best = 0;
              const l = Math.hypot(lox, qy, loz) || 1;
              bnx = lox / l; bny = qy / l; bnz = loz / l;
              break;
            }
            const disc = bb * bb - c2;
            if (disc >= 0) {
              const tt = -bb - Math.sqrt(disc);
              if (tt >= 0 && tt <= maxT && tt < best) {
                best = tt;
                const hx = lox + ldx * tt, hy = qy + ldy * tt, hz = loz + ldz * tt;
                const l = Math.hypot(hx, hy, hz) || 1;
                bnx = hx / l; bny = hy / l; bnz = hz / l;
              }
            }
          }
        }
      }
      if (best === Infinity) return -1;
      t = best;
      lnx = bnx; lny = bny; lnz = bnz;
      break;
    }
    case SHAPE_CONVEX: {
      const pl = c.planes!;
      let tEnter = -Infinity, tExit = Infinity;
      let ei = -1;
      let inside = true;
      let closest = -Infinity, ci = 0;
      for (let i = 0; i < pl.length; i += 4) {
        const nx = pl[i], ny = pl[i + 1], nz = pl[i + 2];
        const dist = nx * lox + ny * loy + nz * loz - pl[i + 3];
        const denom = nx * ldx + ny * ldy + nz * ldz;
        if (dist > 0) inside = false;
        if (dist > closest) {
          closest = dist;
          ci = i;
        }
        if (Math.abs(denom) < 1e-12) {
          if (dist > 0) return -1;
          continue;
        }
        const tt = -dist / denom;
        if (denom < 0) {
          if (tt > tEnter) {
            tEnter = tt;
            ei = i;
          }
        } else if (tt < tExit) tExit = tt;
        if (tEnter > tExit) return -1;
      }
      if (inside) {
        t = 0;
        ei = ci;
      } else {
        if (ei < 0 || tEnter < 0 || tEnter > maxT) return -1;
        t = tEnter;
      }
      lnx = pl[ei]; lny = pl[ei + 1]; lnz = pl[ei + 2];
      break;
    }
  }
  if (t < 0 || t > maxT) return -1;
  out.t = t;
  out.nx = r[0] * lnx + r[1] * lny + r[2] * lnz;
  out.ny = r[3] * lnx + r[4] * lny + r[5] * lnz;
  out.nz = r[6] * lnx + r[7] * lny + r[8] * lnz;
  out.surface = c.surface;
  out.collider = c;
  out.flags = c.flags;
  if (c.kinematic || c.flags & CF_CONVEYOR) {
    const v = _vtmp;
    c.velocityAt(ox + dx * t, oy + dy * t, oz + dz * t, v);
    out.vx = v[0]; out.vy = v[1]; out.vz = v[2];
  } else {
    out.vx = out.vy = out.vz = 0;
  }
  return t;
}
const _vtmp = new Float64Array(3);

// ---------------------------------------------------------------------------
// Uniform grid broadphase for static colliders.

export class StaticGrid {
  readonly cell: number;
  private cells = new Map<number, Collider[]>();
  readonly all: Collider[] = [];
  private stamp = 0;
  private stamps = new Map<number, number>();

  constructor(cell = 12) {
    this.cell = cell;
  }

  private key(ix: number, iz: number): number {
    return (ix + 4096) * 8192 + (iz + 4096);
  }

  add(c: Collider): void {
    c.updateBounds();
    this.all.push(c);
    const s = this.cell;
    const x0 = Math.floor(c.min[0] / s), x1 = Math.floor(c.max[0] / s);
    const z0 = Math.floor(c.min[2] / s), z1 = Math.floor(c.max[2] / s);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz);
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(c);
      }
    }
  }

  remove(c: Collider): void {
    const i = this.all.indexOf(c);
    if (i < 0) return;
    this.all.splice(i, 1);
    const s = this.cell;
    const x0 = Math.floor(c.min[0] / s), x1 = Math.floor(c.max[0] / s);
    const z0 = Math.floor(c.min[2] / s), z1 = Math.floor(c.max[2] / s);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.cells.get(this.key(ix, iz));
        if (!list) continue;
        const j = list.indexOf(c);
        if (j >= 0) list.splice(j, 1);
      }
    }
  }

  /** Collect colliders whose AABB overlaps the query box. */
  query(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: Collider[]): void {
    const s = this.cell;
    this.stamp++;
    const x0 = Math.floor(minX / s), x1 = Math.floor(maxX / s);
    const z0 = Math.floor(minZ / s), z1 = Math.floor(maxZ / s);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.cells.get(this.key(ix, iz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (this.stamps.get(c.id) === this.stamp) continue;
          this.stamps.set(c.id, this.stamp);
          if (!c.enabled) continue;
          if (c.max[0] < minX || c.min[0] > maxX || c.max[1] < minY || c.min[1] > maxY || c.max[2] < minZ || c.min[2] > maxZ) continue;
          out.push(c);
        }
      }
    }
  }
}
