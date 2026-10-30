import { SHAPE_SPHERE, SHAPE_CAPSULE, SHAPE_BOX } from './shapes.js';

/**
 * Narrowphase contact generation. Every primitive is a core (point / segment / box) inflated by a
 * radius. Contacts are reported through a collector as
 *   add(shapeA, shapeB, pA, pB, n)
 * with n pointing from B toward A, pA on A's surface and pB on B's surface; the penetration depth is
 * (pB - pA) . n (positive when overlapping). Contacts are generated slightly before touching (margin)
 * so the solver sees them even if earlier constraints push bodies together inside a substep.
 */
export class ContactCollector {
  constructor(sink) {
    this.sink = sink; // (sA, sB, ax, ay, az, bx, by, bz, nx, ny, nz) => void
    this.flip = false;
    this.margin = 0.006;
    this.feature = -1; // contact feature id (ground contacts) for persistent friction anchors
  }

  add(sA, sB, ax, ay, az, bx, by, bz, nx, ny, nz) {
    if (this.flip) this.sink(sB, sA, bx, by, bz, ax, ay, az, -nx, -ny, -nz);
    else this.sink(sA, sB, ax, ay, az, bx, by, bz, nx, ny, nz);
  }
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Emit a contact between two core points inflated by radii.
function emitCore(sA, sB, ax, ay, az, rA, bx, by, bz, rB, col, fnx = 0, fny = 1, fnz = 0) {
  const dx = ax - bx, dy = ay - by, dz = az - bz;
  const d2 = dx * dx + dy * dy + dz * dz;
  const reach = rA + rB + col.margin;
  if (d2 > reach * reach) return;
  let nx, ny, nz;
  if (d2 > 1e-18) {
    const d = Math.sqrt(d2);
    nx = dx / d;
    ny = dy / d;
    nz = dz / d;
  } else {
    nx = fnx;
    ny = fny;
    nz = fnz;
  }
  col.add(sA, sB, ax - nx * rA, ay - ny * rA, az - nz * rA, bx + nx * rB, by + ny * rB, bz + nz * rB, nx, ny, nz);
}

// ---------------------------------------------------------------------------------------------
// Point (sphere core) vs segment (capsule core)
function pointSegment(sA, cx, cy, cz, rA, sB, col) {
  const p0 = sB.p0, p1 = sB.p1;
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  const t = len2 > 1e-12 ? clamp01(((cx - p0.x) * dx + (cy - p0.y) * dy + (cz - p0.z) * dz) / len2) : 0;
  emitCore(sA, sB, cx, cy, cz, rA, p0.x + dx * t, p0.y + dy * t, p0.z + dz * t, sB.radius, col);
}

// Closest points between segments (Ericson, RTCD 5.1.9). Writes parameters to _ss.
const _ss = { s: 0, t: 0 };
function closestSegSeg(p1x, p1y, p1z, d1x, d1y, d1z, p2x, p2y, p2z, d2x, d2y, d2z) {
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  const EPS = 1e-12;
  let s, t;
  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  _ss.s = s;
  _ss.t = t;
}

function segmentSegment(sA, sB, col) {
  const a0 = sA.p0, a1 = sA.p1, b0 = sB.p0, b1 = sB.p1;
  const d1x = a1.x - a0.x, d1y = a1.y - a0.y, d1z = a1.z - a0.z;
  const d2x = b1.x - b0.x, d2y = b1.y - b0.y, d2z = b1.z - b0.z;
  const la2 = d1x * d1x + d1y * d1y + d1z * d1z;
  const lb2 = d2x * d2x + d2y * d2y + d2z * d2z;
  if (la2 > 1e-8 && lb2 > 1e-8) {
    const cosA = Math.abs(d1x * d2x + d1y * d2y + d1z * d2z) / Math.sqrt(la2 * lb2);
    if (cosA > 0.995) {
      // Nearly parallel: two contacts over the overlapping interval for stable resting contact.
      const t0 = ((b0.x - a0.x) * d1x + (b0.y - a0.y) * d1y + (b0.z - a0.z) * d1z) / la2;
      const t1 = ((b1.x - a0.x) * d1x + (b1.y - a0.y) * d1y + (b1.z - a0.z) * d1z) / la2;
      const lo = clamp01(Math.min(t0, t1));
      const hi = clamp01(Math.max(t0, t1));
      if ((hi - lo) * Math.sqrt(la2) > 0.02) {
        for (let k = 0; k < 2; k++) {
          const t = k === 0 ? lo : hi;
          const ax = a0.x + d1x * t, ay = a0.y + d1y * t, az = a0.z + d1z * t;
          const u = clamp01(((ax - b0.x) * d2x + (ay - b0.y) * d2y + (az - b0.z) * d2z) / lb2);
          emitCore(sA, sB, ax, ay, az, sA.radius, b0.x + d2x * u, b0.y + d2y * u, b0.z + d2z * u, sB.radius, col);
        }
        return;
      }
    }
  }
  closestSegSeg(a0.x, a0.y, a0.z, d1x, d1y, d1z, b0.x, b0.y, b0.z, d2x, d2y, d2z);
  const s = _ss.s, t = _ss.t;
  emitCore(
    sA, sB,
    a0.x + d1x * s, a0.y + d1y * s, a0.z + d1z * s, sA.radius,
    b0.x + d2x * t, b0.y + d2y * t, b0.z + d2z * t, sB.radius,
    col,
  );
}

// ---------------------------------------------------------------------------------------------
// Point vs (rounded) box
function pointBox(sA, cx, cy, cz, rA, sB, col) {
  const ax = sB.ax, ay = sB.ay, az = sB.az, e = sB.halfExtents, c = sB.wPos;
  const px = cx - c.x, py = cy - c.y, pz = cz - c.z;
  const lx = px * ax.x + py * ax.y + pz * ax.z;
  const ly = px * ay.x + py * ay.y + pz * ay.z;
  const lz = px * az.x + py * az.y + pz * az.z;
  let qx = lx < -e.x ? -e.x : lx > e.x ? e.x : lx;
  let qy = ly < -e.y ? -e.y : ly > e.y ? e.y : ly;
  let qz = lz < -e.z ? -e.z : lz > e.z ? e.z : lz;
  const rB = sB.radius;
  let nlx, nly, nlz;
  if (qx !== lx || qy !== ly || qz !== lz) {
    const dx = lx - qx, dy = ly - qy, dz = lz - qz;
    const d2 = dx * dx + dy * dy + dz * dz;
    const reach = rA + rB + col.margin;
    if (d2 > reach * reach) return;
    const d = Math.sqrt(d2);
    nlx = dx / d;
    nly = dy / d;
    nlz = dz / d;
  } else {
    const fx = e.x - Math.abs(lx), fy = e.y - Math.abs(ly), fz = e.z - Math.abs(lz);
    nlx = nly = nlz = 0;
    if (fx <= fy && fx <= fz) {
      nlx = lx >= 0 ? 1 : -1;
      qx = nlx * e.x;
    } else if (fy <= fz) {
      nly = ly >= 0 ? 1 : -1;
      qy = nly * e.y;
    } else {
      nlz = lz >= 0 ? 1 : -1;
      qz = nlz * e.z;
    }
  }
  const nx = ax.x * nlx + ay.x * nly + az.x * nlz;
  const ny = ax.y * nlx + ay.y * nly + az.y * nlz;
  const nz = ax.z * nlx + ay.z * nly + az.z * nlz;
  const wx = c.x + ax.x * qx + ay.x * qy + az.x * qz;
  const wy = c.y + ax.y * qx + ay.y * qy + az.y * qz;
  const wz = c.z + ax.z * qx + ay.z * qy + az.z * qz;
  col.add(sA, sB, cx - nx * rA, cy - ny * rA, cz - nz * rA, wx + nx * rB, wy + ny * rB, wz + nz * rB, nx, ny, nz);
}

// ---------------------------------------------------------------------------------------------
// Segment vs (rounded) box: endpoint contacts + the true closest point (golden-section search on
// the convex distance function), sampling along the segment when the core segment cuts the box.
function segDistSqToBox(ax, ay, az, dx, dy, dz, ex, ey, ez, t) {
  const px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
  const qx = px < -ex ? -ex - px : px > ex ? px - ex : 0;
  const qy = py < -ey ? -ey - py : py > ey ? py - ey : 0;
  const qz = pz < -ez ? -ez - pz : pz > ez ? pz - ez : 0;
  return qx * qx + qy * qy + qz * qz;
}

const GOLD = 0.6180339887498949;
function segmentBox(sA, sB, col) {
  const c = sB.wPos, bx = sB.ax, by = sB.ay, bz = sB.az, e = sB.halfExtents;
  const p0 = sA.p0, p1 = sA.p1, rA = sA.radius;
  // segment in box-local coordinates
  let qx = p0.x - c.x, qy = p0.y - c.y, qz = p0.z - c.z;
  const ax = qx * bx.x + qy * bx.y + qz * bx.z;
  const ay = qx * by.x + qy * by.y + qz * by.z;
  const az = qx * bz.x + qy * bz.y + qz * bz.z;
  qx = p1.x - p0.x;
  qy = p1.y - p0.y;
  qz = p1.z - p0.z;
  const dx = qx * bx.x + qy * bx.y + qz * bx.z;
  const dy = qx * by.x + qy * by.y + qz * by.z;
  const dz = qx * bz.x + qy * bz.y + qz * bz.z;

  // Quick reject with the inflated box.
  const reach = rA + sB.radius + col.margin;
  const minx = Math.min(ax, ax + dx), maxx = Math.max(ax, ax + dx);
  const miny = Math.min(ay, ay + dy), maxy = Math.max(ay, ay + dy);
  const minz = Math.min(az, az + dz), maxz = Math.max(az, az + dz);
  if (minx > e.x + reach || maxx < -e.x - reach) return;
  if (miny > e.y + reach || maxy < -e.y - reach) return;
  if (minz > e.z + reach || maxz < -e.z - reach) return;

  let lo = 0, hi = 1;
  let m1 = hi - GOLD * (hi - lo), m2 = lo + GOLD * (hi - lo);
  let f1 = segDistSqToBox(ax, ay, az, dx, dy, dz, e.x, e.y, e.z, m1);
  let f2 = segDistSqToBox(ax, ay, az, dx, dy, dz, e.x, e.y, e.z, m2);
  for (let it = 0; it < 22; it++) {
    if (f1 < f2) {
      hi = m2;
      m2 = m1;
      f2 = f1;
      m1 = hi - GOLD * (hi - lo);
      f1 = segDistSqToBox(ax, ay, az, dx, dy, dz, e.x, e.y, e.z, m1);
    } else {
      lo = m1;
      m1 = m2;
      f1 = f2;
      m2 = lo + GOLD * (hi - lo);
      f2 = segDistSqToBox(ax, ay, az, dx, dy, dz, e.x, e.y, e.z, m2);
    }
  }
  const tStar = (lo + hi) * 0.5;
  const fStar = segDistSqToBox(ax, ay, az, dx, dy, dz, e.x, e.y, e.z, tStar);
  const sx = p1.x - p0.x, sy = p1.y - p0.y, sz = p1.z - p0.z;
  if (fStar < 1e-14) {
    // Core segment passes through the core box: sample points, face-based normals.
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      pointBox(sA, p0.x + sx * t, p0.y + sy * t, p0.z + sz * t, rA, sB, col);
    }
    return;
  }
  const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
  pointBox(sA, p0.x, p0.y, p0.z, rA, sB, col);
  pointBox(sA, p1.x, p1.y, p1.z, rA, sB, col);
  const tol = len > 1e-6 ? (rA * 0.5) / len : 1;
  if (tStar > tol && tStar < 1 - tol) {
    pointBox(sA, p0.x + sx * tStar, p0.y + sy * tStar, p0.z + sz * tStar, rA, sB, col);
  }
}

// ---------------------------------------------------------------------------------------------
// Box vs box: SAT over 15 axes, face clipping or edge-edge contact. Rounded radii act as margins.
const _clipA = new Float64Array(8 * 3);
const _clipB = new Float64Array(8 * 3);

function clipPolygon(inP, inCount, outP, nx, ny, nz, d) {
  // keep points with n.p <= d
  let outCount = 0;
  for (let i = 0; i < inCount; i++) {
    const j = (i + 1) % inCount;
    const ax = inP[i * 3], ay = inP[i * 3 + 1], az = inP[i * 3 + 2];
    const bx = inP[j * 3], by = inP[j * 3 + 1], bz = inP[j * 3 + 2];
    const da = nx * ax + ny * ay + nz * az - d;
    const db = nx * bx + ny * by + nz * bz - d;
    if (da <= 0) {
      outP[outCount * 3] = ax;
      outP[outCount * 3 + 1] = ay;
      outP[outCount * 3 + 2] = az;
      outCount++;
    }
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      outP[outCount * 3] = ax + (bx - ax) * t;
      outP[outCount * 3 + 1] = ay + (by - ay) * t;
      outP[outCount * 3 + 2] = az + (bz - az) * t;
      outCount++;
    }
    if (outCount >= 8) break;
  }
  return outCount;
}

const _uA = [null, null, null];
const _uB = [null, null, null];
const _eA = [0, 0, 0];
const _eB = [0, 0, 0];
const _R = new Float64Array(9);
const _AR = new Float64Array(9);

function boxBox(sA, sB, col) {
  _uA[0] = sA.ax; _uA[1] = sA.ay; _uA[2] = sA.az;
  _uB[0] = sB.ax; _uB[1] = sB.ay; _uB[2] = sB.az;
  _eA[0] = sA.halfExtents.x; _eA[1] = sA.halfExtents.y; _eA[2] = sA.halfExtents.z;
  _eB[0] = sB.halfExtents.x; _eB[1] = sB.halfExtents.y; _eB[2] = sB.halfExtents.z;
  const margin = sA.radius + sB.radius + col.margin;
  const Tx = sB.wPos.x - sA.wPos.x, Ty = sB.wPos.y - sA.wPos.y, Tz = sB.wPos.z - sA.wPos.z;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const r = _uA[i].x * _uB[j].x + _uA[i].y * _uB[j].y + _uA[i].z * _uB[j].z;
      _R[i * 3 + j] = r;
      _AR[i * 3 + j] = Math.abs(r) + 1e-7;
    }
  }
  let bestSep = -Infinity, bestType = -1, bestI = 0, bestJ = 0;
  let bnx = 0, bny = 0, bnz = 0;
  // Face axes of A
  for (let i = 0; i < 3; i++) {
    const u = _uA[i];
    const t = Tx * u.x + Ty * u.y + Tz * u.z;
    const rb = _eB[0] * _AR[i * 3] + _eB[1] * _AR[i * 3 + 1] + _eB[2] * _AR[i * 3 + 2];
    const sep = Math.abs(t) - (_eA[i] + rb);
    if (sep > margin) return;
    if (sep > bestSep) {
      bestSep = sep;
      bestType = 0;
      bestI = i;
      const sg = t >= 0 ? 1 : -1;
      bnx = u.x * sg;
      bny = u.y * sg;
      bnz = u.z * sg;
    }
  }
  // Face axes of B
  for (let j = 0; j < 3; j++) {
    const u = _uB[j];
    const t = Tx * u.x + Ty * u.y + Tz * u.z;
    const ra = _eA[0] * _AR[j] + _eA[1] * _AR[3 + j] + _eA[2] * _AR[6 + j];
    const sep = Math.abs(t) - (ra + _eB[j]);
    if (sep > margin) return;
    if (sep > bestSep + 1e-4) {
      bestSep = sep;
      bestType = 1;
      bestJ = j;
      const sg = t >= 0 ? 1 : -1;
      bnx = u.x * sg;
      bny = u.y * sg;
      bnz = u.z * sg;
    }
  }
  const faceSep = bestSep;
  // Edge axes
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const a = _uA[i], b = _uB[j];
      let nx = a.y * b.z - a.z * b.y;
      let ny = a.z * b.x - a.x * b.z;
      let nz = a.x * b.y - a.y * b.x;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len < 1e-4) continue;
      nx /= len;
      ny /= len;
      nz /= len;
      const ra =
        _eA[0] * Math.abs(_uA[0].x * nx + _uA[0].y * ny + _uA[0].z * nz) +
        _eA[1] * Math.abs(_uA[1].x * nx + _uA[1].y * ny + _uA[1].z * nz) +
        _eA[2] * Math.abs(_uA[2].x * nx + _uA[2].y * ny + _uA[2].z * nz);
      const rb =
        _eB[0] * Math.abs(_uB[0].x * nx + _uB[0].y * ny + _uB[0].z * nz) +
        _eB[1] * Math.abs(_uB[1].x * nx + _uB[1].y * ny + _uB[1].z * nz) +
        _eB[2] * Math.abs(_uB[2].x * nx + _uB[2].y * ny + _uB[2].z * nz);
      const t = Tx * nx + Ty * ny + Tz * nz;
      const sep = Math.abs(t) - (ra + rb);
      if (sep > margin) return;
      // Prefer faces unless the edge axis is clearly better.
      if (sep > bestSep && sep > faceSep + 0.002 + Math.abs(faceSep) * 0.05) {
        bestSep = sep;
        bestType = 2;
        bestI = i;
        bestJ = j;
        const sg = t >= 0 ? 1 : -1;
        bnx = nx * sg;
        bny = ny * sg;
        bnz = nz * sg;
      }
    }
  }

  if (bestType === 2) {
    // Edge-edge. n points from A to B.
    const nx = bnx, ny = bny, nz = bnz;
    let cax = sA.wPos.x, cay = sA.wPos.y, caz = sA.wPos.z;
    for (let k = 0; k < 3; k++) {
      if (k === bestI) continue;
      const u = _uA[k];
      const sg = u.x * nx + u.y * ny + u.z * nz >= 0 ? 1 : -1;
      cax += u.x * _eA[k] * sg;
      cay += u.y * _eA[k] * sg;
      caz += u.z * _eA[k] * sg;
    }
    let cbx = sB.wPos.x, cby = sB.wPos.y, cbz = sB.wPos.z;
    for (let k = 0; k < 3; k++) {
      if (k === bestJ) continue;
      const u = _uB[k];
      const sg = u.x * nx + u.y * ny + u.z * nz >= 0 ? -1 : 1;
      cbx += u.x * _eB[k] * sg;
      cby += u.y * _eB[k] * sg;
      cbz += u.z * _eB[k] * sg;
    }
    const ua = _uA[bestI], ub = _uB[bestJ];
    const ea = _eA[bestI], eb = _eB[bestJ];
    closestSegSeg(
      cax - ua.x * ea, cay - ua.y * ea, caz - ua.z * ea, ua.x * 2 * ea, ua.y * 2 * ea, ua.z * 2 * ea,
      cbx - ub.x * eb, cby - ub.y * eb, cbz - ub.z * eb, ub.x * 2 * eb, ub.y * 2 * eb, ub.z * 2 * eb,
    );
    const s = _ss.s, t = _ss.t;
    const pax = cax - ua.x * ea + ua.x * 2 * ea * s;
    const pay = cay - ua.y * ea + ua.y * 2 * ea * s;
    const paz = caz - ua.z * ea + ua.z * 2 * ea * s;
    const pbx = cbx - ub.x * eb + ub.x * 2 * eb * t;
    const pby = cby - ub.y * eb + ub.y * 2 * eb * t;
    const pbz = cbz - ub.z * eb + ub.z * 2 * eb * t;
    const sep = (pbx - pax) * nx + (pby - pay) * ny + (pbz - paz) * nz;
    if (sep > margin) return;
    const rA = sA.radius, rB = sB.radius;
    col.add(sA, sB, pax + nx * rA, pay + ny * rA, paz + nz * rA, pbx - nx * rB, pby - ny * rB, pbz - nz * rB, -nx, -ny, -nz);
    return;
  }

  // Face contact. Reference box R with normal nRef pointing toward the incident box I.
  const refIsA = bestType === 0;
  const R = refIsA ? sA : sB;
  const I = refIsA ? sB : sA;
  const uR = refIsA ? _uA : _uB;
  const uI = refIsA ? _uB : _uA;
  const eR = refIsA ? _eA : _eB;
  const eI = refIsA ? _eB : _eA;
  const ri = refIsA ? bestI : bestJ;
  // nRef: from R toward I.
  const nrx = refIsA ? bnx : -bnx, nry = refIsA ? bny : -bny, nrz = refIsA ? bnz : -bnz;
  // Incident face: most anti-parallel to nRef.
  let ik = 0, best = -1;
  for (let k = 0; k < 3; k++) {
    const d = Math.abs(uI[k].x * nrx + uI[k].y * nry + uI[k].z * nrz);
    if (d > best) {
      best = d;
      ik = k;
    }
  }
  const isg = uI[ik].x * nrx + uI[ik].y * nry + uI[ik].z * nrz > 0 ? -1 : 1;
  const fcx = I.wPos.x + uI[ik].x * eI[ik] * isg;
  const fcy = I.wPos.y + uI[ik].y * eI[ik] * isg;
  const fcz = I.wPos.z + uI[ik].z * eI[ik] * isg;
  const k1 = (ik + 1) % 3, k2 = (ik + 2) % 3;
  const u1 = uI[k1], u2 = uI[k2];
  const e1 = eI[k1], e2 = eI[k2];
  const signs = [1, 1, -1, 1, -1, -1, 1, -1];
  for (let v = 0; v < 4; v++) {
    const s1 = signs[v * 2] * e1, s2 = signs[v * 2 + 1] * e2;
    _clipA[v * 3] = fcx + u1.x * s1 + u2.x * s2;
    _clipA[v * 3 + 1] = fcy + u1.y * s1 + u2.y * s2;
    _clipA[v * 3 + 2] = fcz + u1.z * s1 + u2.z * s2;
  }
  let count = 4;
  const rc = R.wPos;
  const j1 = (ri + 1) % 3, j2 = (ri + 2) % 3;
  let inP = _clipA, outP = _clipB;
  for (let pass = 0; pass < 4 && count > 0; pass++) {
    const ax = pass < 2 ? uR[j1] : uR[j2];
    const ext = pass < 2 ? eR[j1] : eR[j2];
    const sg = pass % 2 === 0 ? 1 : -1;
    const nx = ax.x * sg, ny = ax.y * sg, nz = ax.z * sg;
    const d = nx * rc.x + ny * rc.y + nz * rc.z + ext;
    count = clipPolygon(inP, count, outP, nx, ny, nz, d);
    const tmp = inP;
    inP = outP;
    outP = tmp;
  }
  const refD = nrx * rc.x + nry * rc.y + nrz * rc.z + eR[ri];
  const rR = R.radius, rI = I.radius;
  for (let v = 0; v < count; v++) {
    const px = inP[v * 3], py = inP[v * 3 + 1], pz = inP[v * 3 + 2];
    const sep = nrx * px + nry * py + nrz * pz - refD;
    if (sep > margin) continue;
    // incident surface point and reference surface point
    const pix = px - nrx * rI, piy = py - nry * rI, piz = pz - nrz * rI;
    const prx = px - nrx * sep + nrx * rR, pry = py - nry * sep + nry * rR, prz = pz - nrz * sep + nrz * rR;
    if (refIsA) {
      col.add(sA, sB, prx, pry, prz, pix, piy, piz, -nrx, -nry, -nrz);
    } else {
      col.add(sA, sB, pix, piy, piz, prx, pry, prz, nrx, nry, nrz);
    }
  }
}

// ---------------------------------------------------------------------------------------------
export function collideShapes(sA, sB, col) {
  const tA = sA.type, tB = sB.type;
  if (tA === SHAPE_SPHERE) {
    if (tB === SHAPE_SPHERE) {
      emitCore(sA, sB, sA.wPos.x, sA.wPos.y, sA.wPos.z, sA.radius, sB.wPos.x, sB.wPos.y, sB.wPos.z, sB.radius, col);
    } else if (tB === SHAPE_CAPSULE) {
      pointSegment(sA, sA.wPos.x, sA.wPos.y, sA.wPos.z, sA.radius, sB, col);
    } else {
      pointBox(sA, sA.wPos.x, sA.wPos.y, sA.wPos.z, sA.radius, sB, col);
    }
  } else if (tA === SHAPE_CAPSULE) {
    if (tB === SHAPE_SPHERE) {
      col.flip = !col.flip;
      pointSegment(sB, sB.wPos.x, sB.wPos.y, sB.wPos.z, sB.radius, sA, col);
      col.flip = !col.flip;
    } else if (tB === SHAPE_CAPSULE) {
      segmentSegment(sA, sB, col);
    } else {
      segmentBox(sA, sB, col);
    }
  } else {
    if (tB === SHAPE_SPHERE) {
      col.flip = !col.flip;
      pointBox(sB, sB.wPos.x, sB.wPos.y, sB.wPos.z, sB.radius, sA, col);
      col.flip = !col.flip;
    } else if (tB === SHAPE_CAPSULE) {
      col.flip = !col.flip;
      segmentBox(sB, sA, col);
      col.flip = !col.flip;
    } else {
      boxBox(sA, sB, col);
    }
  }
}

// Ground: half-space y <= groundY bounded to the floor rectangle `rect` {minX, maxX, minZ, maxZ}.
function groundPoint(s, x, y, z, r, groundY, rect, col) {
  if (y - r > groundY + col.margin) return;
  if (x < rect.minX || x > rect.maxX || z < rect.minZ || z > rect.maxZ) return;
  col.add(s, null, x, y - r, z, x, groundY, z, 0, 1, 0);
}

export function collideGround(s, groundY, rect, col) {
  if (s.aabbMin.y > groundY + col.margin) return;
  const r = s.radius;
  if (s.type === SHAPE_SPHERE) {
    col.feature = 0;
    groundPoint(s, s.wPos.x, s.wPos.y, s.wPos.z, r, groundY, rect, col);
  } else if (s.type === SHAPE_CAPSULE) {
    col.feature = 0;
    groundPoint(s, s.p0.x, s.p0.y, s.p0.z, r, groundY, rect, col);
    col.feature = 1;
    groundPoint(s, s.p1.x, s.p1.y, s.p1.z, r, groundY, rect, col);
  } else {
    const c = s.wPos, e = s.halfExtents, ax = s.ax, ay = s.ay, az = s.az;
    for (let i = 0; i < 8; i++) {
      const sx = i & 1 ? e.x : -e.x;
      const sy = i & 2 ? e.y : -e.y;
      const sz = i & 4 ? e.z : -e.z;
      const x = c.x + ax.x * sx + ay.x * sy + az.x * sz;
      const y = c.y + ax.y * sx + ay.y * sy + az.y * sz;
      const z = c.z + ax.z * sx + ay.z * sy + az.z * sz;
      col.feature = i;
      groundPoint(s, x, y, z, r, groundY, rect, col);
    }
  }
  col.feature = -1;
}

export { closestSegSeg, _ss as closestSegSegResult };
