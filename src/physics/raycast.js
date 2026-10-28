import { Vec3 } from './math.js';
import { SHAPE_SPHERE, SHAPE_CAPSULE, SHAPE_BOX } from './shapes.js';

const _o = new Vec3();
const _d = new Vec3();
const _p = new Vec3();

function raySphereInterval(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, out) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return false;
  const s = Math.sqrt(disc);
  out[0] = -b - s;
  out[1] = -b + s;
  return true;
}

const _iv = [0, 0];

// Intersection interval of a ray (unit direction) with a capsule (convex: union of three intervals).
function rayCapsule(shape, o, d, out) {
  const p0 = shape.p0, p1 = shape.p1, r = shape.radius;
  let ax = p1.x - p0.x, ay = p1.y - p0.y, az = p1.z - p0.z;
  const L = Math.sqrt(ax * ax + ay * ay + az * az);
  let tIn = Infinity, tOut = -Infinity;
  if (L > 1e-9) {
    ax /= L;
    ay /= L;
    az /= L;
    const aox = o.x - p0.x, aoy = o.y - p0.y, aoz = o.z - p0.z;
    const dPar = d.x * ax + d.y * ay + d.z * az;
    const aoPar = aox * ax + aoy * ay + aoz * az;
    const dpx = d.x - ax * dPar, dpy = d.y - ay * dPar, dpz = d.z - az * dPar;
    const apx = aox - ax * aoPar, apy = aoy - ay * aoPar, apz = aoz - az * aoPar;
    const A = dpx * dpx + dpy * dpy + dpz * dpz;
    const B = 2 * (dpx * apx + dpy * apy + dpz * apz);
    const C = apx * apx + apy * apy + apz * apz - r * r;
    let c0 = -Infinity, c1 = Infinity, ok = true;
    if (A > 1e-12) {
      const disc = B * B - 4 * A * C;
      if (disc < 0) ok = false;
      else {
        const s = Math.sqrt(disc);
        c0 = (-B - s) / (2 * A);
        c1 = (-B + s) / (2 * A);
      }
    } else if (C > 0) ok = false;
    if (ok) {
      let s0, s1;
      if (Math.abs(dPar) > 1e-12) {
        s0 = (0 - aoPar) / dPar;
        s1 = (L - aoPar) / dPar;
        if (s0 > s1) {
          const tmp = s0;
          s0 = s1;
          s1 = tmp;
        }
      } else if (aoPar >= 0 && aoPar <= L) {
        s0 = -Infinity;
        s1 = Infinity;
      } else {
        s0 = 1;
        s1 = 0;
      }
      const lo = Math.max(c0, s0), hi = Math.min(c1, s1);
      if (lo <= hi) {
        tIn = Math.min(tIn, lo);
        tOut = Math.max(tOut, hi);
      }
    }
  }
  if (raySphereInterval(o.x, o.y, o.z, d.x, d.y, d.z, p0.x, p0.y, p0.z, r, _iv)) {
    tIn = Math.min(tIn, _iv[0]);
    tOut = Math.max(tOut, _iv[1]);
  }
  if (raySphereInterval(o.x, o.y, o.z, d.x, d.y, d.z, p1.x, p1.y, p1.z, r, _iv)) {
    tIn = Math.min(tIn, _iv[0]);
    tOut = Math.max(tOut, _iv[1]);
  }
  if (tIn > tOut) return false;
  out.tIn = tIn;
  out.tOut = tOut;
  return true;
}

function sdRoundBoxLocal(x, y, z, ex, ey, ez, r) {
  const qx = Math.abs(x) - ex, qy = Math.abs(y) - ey, qz = Math.abs(z) - ez;
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

function rayBox(shape, o, d, out) {
  const c = shape.wPos, ax = shape.ax, ay = shape.ay, az = shape.az, e = shape.halfExtents, r = shape.radius;
  // local ray
  const px = o.x - c.x, py = o.y - c.y, pz = o.z - c.z;
  const lo = [px * ax.x + py * ax.y + pz * ax.z, px * ay.x + py * ay.y + pz * ay.z, px * az.x + py * az.y + pz * az.z];
  const ld = [d.x * ax.x + d.y * ax.y + d.z * ax.z, d.x * ay.x + d.y * ay.y + d.z * ay.z, d.x * az.x + d.y * az.y + d.z * az.z];
  const ext = [e.x + r, e.y + r, e.z + r];
  let t0 = -Infinity, t1 = Infinity, axisIn = 0, signIn = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ld[i]) < 1e-12) {
      if (lo[i] < -ext[i] || lo[i] > ext[i]) return false;
      continue;
    }
    let ta = (-ext[i] - lo[i]) / ld[i];
    let tb = (ext[i] - lo[i]) / ld[i];
    let sg = -1;
    if (ta > tb) {
      const tmp = ta;
      ta = tb;
      tb = tmp;
      sg = 1;
    }
    if (ta > t0) {
      t0 = ta;
      axisIn = i;
      signIn = sg;
    }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  if (r <= 0) {
    out.tIn = t0;
    out.tOut = t1;
    const n = [0, 0, 0];
    n[axisIn] = signIn;
    out.normal.set(
      ax.x * n[0] + ay.x * n[1] + az.x * n[2],
      ax.y * n[0] + ay.y * n[1] + az.y * n[2],
      ax.z * n[0] + ay.z * n[1] + az.z * n[2],
    );
    out.normalSet = true;
    return true;
  }
  // Rounded box: sphere-trace inside the slab interval for entry and exit.
  let t = Math.max(t0, -1e3);
  let hit = false;
  for (let i = 0; i < 48; i++) {
    const dd = sdRoundBoxLocal(lo[0] + ld[0] * t, lo[1] + ld[1] * t, lo[2] + ld[2] * t, e.x, e.y, e.z, r);
    if (dd < 1e-5) {
      hit = true;
      break;
    }
    t += dd;
    if (t > t1) break;
  }
  if (!hit) return false;
  let tb = t1;
  for (let i = 0; i < 48; i++) {
    const dd = sdRoundBoxLocal(lo[0] + ld[0] * tb, lo[1] + ld[1] * tb, lo[2] + ld[2] * tb, e.x, e.y, e.z, r);
    if (dd < 1e-5) break;
    tb -= dd;
    if (tb < t) break;
  }
  out.tIn = t;
  out.tOut = Math.max(tb, t);
  // gradient at entry point
  const hx = lo[0] + ld[0] * t, hy = lo[1] + ld[1] * t, hz = lo[2] + ld[2] * t;
  const qx = Math.abs(hx) - e.x, qy = Math.abs(hy) - e.y, qz = Math.abs(hz) - e.z;
  let gx, gy, gz;
  if (qx > 0 || qy > 0 || qz > 0) {
    gx = Math.max(qx, 0) * Math.sign(hx);
    gy = Math.max(qy, 0) * Math.sign(hy);
    gz = Math.max(qz, 0) * Math.sign(hz);
  } else {
    gx = gy = gz = 0;
    if (qx >= qy && qx >= qz) gx = Math.sign(hx);
    else if (qy >= qz) gy = Math.sign(hy);
    else gz = Math.sign(hz);
  }
  out.normal.set(ax.x * gx + ay.x * gy + az.x * gz, ax.y * gx + ay.y * gy + az.y * gz, ax.z * gx + ay.z * gy + az.z * gz).normalize();
  out.normalSet = true;
  return true;
}

/**
 * Ray vs shape. `d` must be unit length. On hit fills out.tIn/out.tOut (tIn may be negative when
 * the origin is inside) and out.normal (outward surface normal at entry).
 */
export function rayShape(shape, o, d, maxT, out) {
  out.normalSet = false;
  let ok = false;
  if (shape.type === SHAPE_SPHERE) {
    const c = shape.wPos;
    ok = raySphereInterval(o.x, o.y, o.z, d.x, d.y, d.z, c.x, c.y, c.z, shape.radius, _iv);
    if (ok) {
      out.tIn = _iv[0];
      out.tOut = _iv[1];
    }
  } else if (shape.type === SHAPE_CAPSULE) {
    ok = rayCapsule(shape, o, d, out);
  } else if (shape.type === SHAPE_BOX) {
    ok = rayBox(shape, o, d, out);
  }
  if (!ok) return false;
  if (out.tOut < 0 || out.tIn > maxT) return false;
  if (!out.normalSet) {
    // Surface normal from closest core point.
    _p.copy(o).addScaled(d, Math.max(out.tIn, 0));
    if (shape.type === SHAPE_SPHERE) {
      out.normal.subVectors(_p, shape.wPos).normalize();
    } else {
      const p0 = shape.p0, p1 = shape.p1;
      _d.subVectors(p1, p0);
      const len2 = _d.lengthSq();
      let t = len2 > 1e-12 ? _o.subVectors(_p, p0).dot(_d) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      _o.copy(p0).addScaled(_d, t);
      out.normal.subVectors(_p, _o).normalize();
    }
  }
  return true;
}
