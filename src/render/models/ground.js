// Ground vehicles. Faction 0 = Coalition (western designs), 1 = Federation
// (eastern designs). Every builder returns unbaked Parts in the spaces defined
// by src/sim/specs.js: hull (hull origin), turret (turret pivot), gun
// (trunnion, barrel along +Z), optional radar (radar pivot) and emissive
// (hull space).

import { VEHICLE_SPECS } from '../../sim/specs.js';
import { Part, Piece, box, bbox, prismX, cyl, lathe, sphere, TAU, DEG } from './geom.js';

const PI = Math.PI;

// ---------------------------------------------------------------------------
// Running gear

function convexHull2(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-9) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-9) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper); // CCW in (z, y)
}

// Track belt wrapped around circles [z, y, r] (inner surface), x0..x1 wide.
// Alternate link pads are offset slightly to read as grousers.
export function beltPiece(circles, x0, x1, t, pitch) {
  const pts = [];
  for (const [z, y, r] of circles) {
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * TAU;
      pts.push([z + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
  }
  const hull = convexHull2(pts);
  const n = hull.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const a = hull[i], b = hull[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[n];
  let N = Math.max(8, Math.round(L / pitch));
  if (N % 2) N++;
  const S = [];
  let seg = 0;
  for (let k = 0; k < N; k++) {
    const s = (k / N) * L;
    while (cum[seg + 1] < s) seg++;
    const a = hull[seg], b = hull[(seg + 1) % n];
    const u = (s - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
    S.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  const nrm = S.map((q, k) => {
    const a = S[(k - 1 + N) % N], b = S[(k + 1) % N];
    let tz = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tz, ty) || 1;
    tz /= l; ty /= l;
    return [ty, -tz];
  });
  const O = S.map((q, k) => [q[0] + nrm[k][0] * t, q[1] + nrm[k][1] * t]);
  const G = S.map((q, k) => {
    const d = k % 2 ? t : t * 0.72;
    return [q[0] + nrm[k][0] * d, q[1] + nrm[k][1] * d];
  });
  const P = new Piece();
  const P3 = (x, q) => [x, q[1], q[0]];
  for (let k = 0; k < N; k++) {
    const a = G[k], b = G[(k + 1) % N];
    const f = [0, (nrm[k][1] + nrm[(k + 1) % N][1]) * 0.5, (nrm[k][0] + nrm[(k + 1) % N][0]) * 0.5];
    P.quadF(P3(x0, a), P3(x1, a), P3(x1, b), P3(x0, b), f, k % 2 ? 'track' : 'track2');
  }
  // side strips, merged along straight runs
  let r = 0;
  const dir = (k) => {
    const a = S[k % N], b = S[(k + 1) % N];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  for (let k = 1; k <= N; k++) {
    const d0 = dir(r), d1 = dir(k);
    if (k < N && d0[0] * d1[0] + d0[1] * d1[1] > 0.9995) continue;
    const a = r % N, b = k % N;
    P.quadF(P3(x1, S[a]), P3(x1, S[b]), P3(x1, O[b]), P3(x1, O[a]), [1, 0, 0], 'track');
    P.quadF(P3(x0, S[a]), P3(x0, S[b]), P3(x0, O[b]), P3(x0, O[a]), [-1, 0, 0], 'track');
    r = k;
  }
  return P;
}

// Road wheel: rubber tread + rubber outer ring + painted dished disc, outer
// face at +X. Segments entirely above `cutY` (relative to the hub) are skipped
// when a skirt hides them.
export function roadWheelPiece(R, w, seg = 10, o = {}) {
  const P = new Piece();
  const xi = -w / 2, xo = w / 2, xh = w / 2 + (o.hub ?? 0.035);
  const rr = R * (o.ring ?? 0.8);
  const hubMat = o.hubMat ?? 'paintS';
  const pt = (x, r, a) => [x, Math.sin(a) * r, Math.cos(a) * r];
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * TAU + (o.phase ?? 0), a1 = ((k + 1) / seg) * TAU + (o.phase ?? 0);
    if (o.cutY !== undefined && Math.min(Math.sin(a0), Math.sin(a1)) * R > o.cutY) continue;
    const am = (a0 + a1) / 2;
    P.quadF(pt(xi, R, a0), pt(xi, R, a1), pt(xo, R, a1), pt(xo, R, a0), [0, Math.sin(am), Math.cos(am)], 'rubber');
    P.quadF(pt(xo, R, a0), pt(xo, R, a1), pt(xo, rr, a1), pt(xo, rr, a0), [1, 0, 0], 'rubber');
    P.triF(pt(xo, rr, a0), pt(xo, rr, a1), [xh, 0, 0], [1, 0, 0], hubMat);
  }
  return P.normals(40);
}

function sprocketPiece(R, w, teeth = 8) {
  const pts = [];
  const d = PI / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    for (const [da, rr] of [[-0.6, 0.84], [0, 1.08], [0.6, 0.84]]) {
      pts.push([Math.cos(a + da * d) * R * rr, Math.sin(a + da * d) * R * rr]);
    }
  }
  const P = prismX(pts, -w / 2, w / 2, { caps: 'end', capMat: 'darkSteel' });
  P.append(lathe([[R * 0.5, 0], [0, 0.06]], 8, { axis: 'x', mats: ['steel'] }).transform({ at: [w / 2, 0, 0] }));
  return P;
}

// Both tracks with wheels, sprockets, idlers and return rollers.
function runningGear(hull, g) {
  const ww = g.width * (g.wheelFrac ?? 0.42);
  const xOuter = g.offsetX + g.width / 2;
  const wy = g.wheelR + g.beltT;
  const circles = g.wheelZ.map((z) => [z, wy, g.wheelR]);
  circles.push(g.sprocket, g.idler, ...(g.rollers || []));
  const belt = beltPiece(circles, g.offsetX - g.width / 2, xOuter, g.beltT, g.pitch ?? 0.27);
  const cut = g.skirtY !== undefined ? g.skirtY - wy + 0.04 : undefined;
  const wheel = roadWheelPiece(g.wheelR, ww, g.seg ?? 10, { hubMat: g.hubMat, cutY: cut });
  const idlerCut = g.skirtY !== undefined ? g.skirtY - g.idler[1] + 0.04 : undefined;
  const idler = roadWheelPiece(g.idler[2] - 0.01, ww, g.seg ?? 10, { hubMat: g.hubMat, cutY: idlerCut });
  const spr = sprocketPiece(g.sprocket[2] + 0.02, ww * 0.85, g.teeth ?? 8);
  const roller = (g.rollers || []).length ? cyl(g.rollers[0][2], ww * 0.7, 6, { axis: 'x', caps: 'end', capMat: 'darkSteel' }) : null;
  const xw = xOuter - 0.035 - ww / 2;
  hull.mirrorX(() => {
    hull.add(belt);
    for (const z of g.wheelZ) hull.add(wheel, { at: [xw, wy, z] });
    hull.add(spr, { at: [xw, g.sprocket[1], g.sprocket[0]], c: 'darkSteel' });
    hull.add(idler, { at: [xw, g.idler[1], g.idler[0]] });
    for (const r of g.rollers || []) hull.add(roller, { at: [xw, r[1], r[0]], c: 'rubber' });
  });
  return { xw, ww, xOuter, wy };
}

// ---------------------------------------------------------------------------
// Wheels for wheeled vehicles (axis X, outer face +X)

export function tyrePiece(R, w, seg = 14, o = {}) {
  const P = new Piece();
  const xi = -w / 2, xo = w / 2;
  const sh = Math.min(0.07, w * 0.2);
  const r1 = R * 0.9;
  const r2 = R * (o.rim ?? 0.58);
  const xh = xo + (o.hub ?? 0.05);
  const hubMat = o.hubMat ?? 'paintS';
  const pt = (x, r, a) => [x, Math.sin(a) * r, Math.cos(a) * r];
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * TAU, a1 = ((k + 1) / seg) * TAU, am = (a0 + a1) / 2;
    const out = [0, Math.sin(am), Math.cos(am)];
    P.quadF(pt(xi, R, a0), pt(xi, R, a1), pt(xo - sh, R, a1), pt(xo - sh, R, a0), out, o.lugs && k % 2 ? 'rubber2' : 'rubber');
    P.quadF(pt(xo - sh, R, a0), pt(xo - sh, R, a1), pt(xo, r1, a1), pt(xo, r1, a0), [0.7, out[1] * 0.7, out[2] * 0.7], 'rubber');
    P.quadF(pt(xo, r1, a0), pt(xo, r1, a1), pt(xo - 0.025, r2, a1), pt(xo - 0.025, r2, a0), [1, 0, 0], 'rubber');
    P.triF(pt(xo - 0.025, r2, a0), pt(xo - 0.025, r2, a1), [xh, 0, 0], [1, 0, 0], hubMat);
  }
  return P.normals(o.crease ?? 40);
}

// Place the spec's wheels on both sides; returns the tyre width used.
function wheelSet(hull, spec, o = {}) {
  const { radius: R, offsetX, positionsZ } = spec.wheels;
  const w = o.w ?? 0.38;
  const tyre = tyrePiece(R, w, o.seg ?? 14, { hubMat: o.hubMat, lugs: o.lugs ?? true, rim: o.rim });
  hull.mirrorX(() => {
    for (const z of positionsZ) hull.add(tyre, { at: [offsetX, R, z] });
  });
  return w;
}

// ---------------------------------------------------------------------------
// Small detail helpers (all in the part's current space)

// Run fn on several parts at once, then again mirrored across X.
function mirrorParts(parts, fn) {
  fn(1);
  for (const p of parts) p.push({ s: [-1, 1, 1] });
  fn(-1);
  for (const p of parts) p.pop();
}

function smokeBank(part, at, side, o = {}) {
  const rows = o.rows ?? 2, cols = o.cols ?? 3, sp = o.spacing ?? 0.095, r = o.r ?? 0.042, len = o.len ?? 0.24;
  const mat = o.c ?? 'paintS';
  const tubeP = cyl(r, len, 6, { axis: 'z', caps: 'end', capMat: 'black' });
  part.group({ at, rot: [-(o.pitch ?? 0.55), (o.yaw ?? 0.45) * side, 0] }, () => {
    part.box(cols * sp + 0.05, rows * sp + 0.03, 0.08, { at: [0, 0, -len / 2 + 0.02], c: mat });
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        part.add(tubeP, { at: [(j - (cols - 1) / 2) * sp, (i - (rows - 1) / 2) * sp, 0.02], c: mat });
      }
    }
  });
}

function machineGun(part, at, o = {}) {
  const s = o.scale ?? 1;
  const len = o.len ?? 0.9;
  const mat = o.c ?? 'gunmetal';
  part.group({ at, rot: o.rot, s }, () => {
    part.box(0.13, 0.14, 0.62, { at: [0, 0, -0.08], c: mat });
    part.box(0.05, 0.1, 0.16, { at: [0, -0.02, -0.46], c: mat });
    part.add(cyl(0.024, len, 6, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [0, 0.015, 0.23 + len / 2], c: mat });
    part.add(cyl(0.04, 0.3, 6, { axis: 'z', caps: 'none' }), { at: [0, 0.015, 0.35], c: mat });
    if (o.ammo !== false) part.box(0.11, 0.13, 0.26, { at: [0.13 * (o.ammoSide ?? 1), -0.03, -0.05], c: 'jerry' });
    if (o.post) part.add(cyl(0.035, o.post, 6, { caps: 'none' }), { at: [0, -o.post / 2 - 0.06, -0.05], c: mat });
  });
}

function antenna(part, base, h, o = {}) {
  part.add(cyl(0.045, 0.1, 6, { caps: 'end' }), { at: [base[0], base[1] + 0.05, base[2]], c: o.c ?? 'darkSteel' });
  const tip = [base[0] + (o.lean?.[0] ?? 0), base[1] + h, base[2] + (o.lean?.[1] ?? -0.15)];
  part.tube([base[0], base[1] + 0.1, base[2]], tip, 0.012, 0.006, 3, { c: 'black' });
}

function jerryCan(part, at, rotY = 0, mat = 'jerry') {
  part.group({ at, rot: [0, rotY, 0] }, () => {
    part.box(0.17, 0.46, 0.34, { c: mat });
    part.box(0.06, 0.05, 0.2, { at: [0, 0.25, 0.02], c: mat });
  });
}

// Lamp housing with lens; the glowing face goes into the emissive part.
function lamp(part, em, at, facing, o = {}) {
  const w = o.w ?? 0.16, h = o.h ?? 0.12, d = o.d ?? 0.1;
  const yaw = facing === 'back' ? PI : 0;
  part.group({ at, rot: [0, yaw, 0] }, () => {
    part.box(w + 0.04, h + 0.04, d, { c: o.housing ?? 'paintS' });
    part.box(w, h, 0.02, { at: [0, 0, d / 2], c: o.lens ?? 'lens' });
  });
  if (em) {
    em.group({ at, rot: [0, yaw, 0] }, () => {
      em.box(w * 0.8, h * 0.75, 0.012, { at: [0, 0, d / 2 + 0.012], c: o.glow ?? 0xfff1cc });
    });
  }
}

function louverPanel(part, at, w, d, o = {}) {
  const n = o.n ?? 5;
  part.group({ at, rot: o.rot, order: o.order }, () => {
    part.box(w, 0.04, d, { c: 'black' });
    for (let i = 0; i < n; i++) {
      const z = -d / 2 + ((i + 0.5) / n) * d;
      part.add(box(w - 0.04, 0.03, d / n * 0.42, { noBottom: true }), { at: [0, 0.03, z], rot: [0.5, 0, 0], c: o.c ?? 'paintDark' });
    }
  });
}

function hatch(part, at, r, o = {}) {
  part.add(cyl(r, 0.05, o.seg ?? 10, { caps: 'end' }), { at: [at[0], at[1] + 0.025, at[2]], c: o.c ?? 'paintS' });
  part.box(r * 0.5, 0.05, 0.06, { at: [at[0], at[1] + 0.055, at[2] - r * 0.75], c: o.c ?? 'paintS' });
}

function bag(part, at, size, o = {}) {
  part.add(bbox(size[0], size[1], size[2], Math.min(size[0], size[1], size[2]) * 0.22), { at, rot: o.rot, c: o.c ?? 'canvas' });
  if (o.strap !== false) {
    part.box(0.04, size[1] + 0.01, size[2] + 0.01, { at: [at[0] + size[0] * 0.25, at[1], at[2]], rot: o.rot, c: 'strap' });
  }
}

function towHook(part, at) {
  part.box(0.06, 0.16, 0.14, { at, c: 'darkSteel' });
}

// ---------------------------------------------------------------------------
// Main battle tank

function mbtCoalition(spec) {
  const hull = new Part(), turret = new Part(), gun = new Part(), em = new Part();
  runningGear(hull, {
    offsetX: spec.tracks.offsetX, width: spec.tracks.width, wheelR: 0.32, beltT: 0.07,
    wheelZ: [2.55, 1.72, 0.89, 0.06, -0.77, -1.6, -2.43],
    sprocket: [-3.45, 0.72, 0.33], idler: [3.42, 0.62, 0.3], seg: 10, skirtY: 0.5,
  });
  // lower hull between the tracks and the sponson upper hull
  hull.prismX([[3.9, 1.1], [3.3, 0.45], [-3.6, 0.45], [-3.92, 0.8], [-3.92, 1.18], [3.7, 1.18]], -1.12, 1.12, { c: 'paintS' });
  hull.prismX([[3.95, 1.12], [2.25, 1.66], [2.0, 1.72], [-3.62, 1.72], [-3.95, 1.6], [-3.95, 1.2], [3.75, 1.2]], -1.74, 1.74);
  // side skirts (panelled)
  const skirtZ = [3.62, 2.42, 1.22, 0.02, -1.2, -2.5, -3.8];
  mirrorParts([hull, em], () => {
    for (let i = 0; i < skirtZ.length - 1; i++) {
      const z0 = skirtZ[i + 1] + 0.012, z1 = skirtZ[i] - 0.012;
      const prof = i === 0
        ? [[z0, 0.5], [3.15, 0.5], [z1, 0.82], [z1, 1.21], [z0, 1.21]]
        : [[z0, 0.5], [z1, 0.5], [z1, 1.21], [z0, 1.21]];
      hull.prismX(prof, 1.74, i < 2 ? 1.85 : 1.83, { c: 'paint' });
    }
    // headlight cluster on the front fender
    lamp(hull, em, [1.42, 1.29, 3.62], 'front', { w: 0.2, h: 0.1, housing: 'paintS' });
    lamp(hull, em, [1.52, 1.5, -3.97], 'back', { w: 0.12, h: 0.12, lens: 'redLens', glow: 0xff2a14 });
    towHook(hull, [0.75, 0.62, 3.58]);
    towHook(hull, [0.8, 0.62, -3.95]);
    // rear mud flap
    hull.box(0.6, 0.38, 0.02, { at: [1.5, 0.92, -3.82], c: 'skirtRubber' });
  });
  // driver's hatch and periscopes on the glacis
  hull.group({ at: [0, 1.63, 2.25], rot: [17.5 * DEG, 0, 0] }, () => {
    hull.bbox(0.8, 0.07, 0.55, 0.03, { at: [0, 0.03, 0] });
    for (const x of [-0.24, 0, 0.24]) hull.box(0.16, 0.07, 0.08, { at: [x, 0.08, 0.3], c: 'glass' });
  });
  // engine deck grilles and access panels
  louverPanel(hull, [0.62, 1.73, -2.55], 0.95, 1.6, { n: 6 });
  louverPanel(hull, [-0.62, 1.73, -2.55], 0.95, 1.6, { n: 6 });
  hull.box(2.6, 0.03, 0.6, { at: [0, 1.735, -1.45], c: 'paintS' });
  // rear exhaust grille (spec exhaust point at the centre)
  louverPanel(hull, [0, 1.12, -3.97], 1.7, 0.62, { n: 5, rot: [-PI / 2, 0, 0] });
  hull.box(0.3, 0.12, 0.16, { at: [0, 0.6, -3.9], c: 'darkSteel' });

  // --- turret (origin at ring centre)
  turret.add(cyl(1.1, 0.1, 18, { caps: 'none' }), { at: [0, 0.02, 0], c: 'black' });
  const B = [
    [0.5, 1.74], [0.56, 2.16], [1.6, 1.42], [1.72, 0.9], [1.72, -1.5], [1.5, -2.85],
    [-1.5, -2.85], [-1.72, -1.5], [-1.72, 0.9], [-1.6, 1.42], [-0.56, 2.16], [-0.5, 1.74],
  ];
  const ringAt = (y, sx, dzF, dzR) => B.map(([x, z]) => [Math.abs(x) > 0.6 ? x * sx : x, y, z > 0.5 ? z - dzF : z + dzR]);
  turret.loft([ringAt(0.04, 1, 0, 0), ringAt(0.46, 0.985, 0.02, 0), ringAt(0.68, 0.93, 0.13, 0.06)]);
  // cheek armour seams and roof plates
  turret.mirrorX(() => {
    turret.box(0.035, 0.42, 0.04, { at: [1.06, 0.24, 1.8], rot: [0, -0.62, 0], c: 'paintDark' });
    turret.box(1.0, 0.03, 0.7, { at: [1.05, 0.69, -0.9], c: 'paintS' });
    // ammunition compartment blow-off panels on the bustle roof
    turret.box(0.9, 0.035, 1.1, { at: [0.52, 0.695, -2.1], c: 'paintS', noBottom: true });
  });
  turret.box(0.05, 0.036, 1.14, { at: [0, 0.694, -2.1], c: 'paintDark', noBottom: true });
  // gunner's primary sight (right) and CITV (left)
  turret.box(0.46, 0.24, 0.62, { at: [-0.62, 0.8, 1.18] });
  turret.box(0.32, 0.14, 0.03, { at: [-0.62, 0.82, 1.5], c: 'glass' });
  turret.add(cyl(0.12, 0.18, 8, { caps: 'none' }), { at: [0.62, 0.77, 0.6], c: 'paintS' });
  turret.box(0.34, 0.24, 0.3, { at: [0.62, 0.98, 0.6], c: 'paintS' });
  turret.box(0.22, 0.13, 0.02, { at: [0.62, 0.99, 0.76], c: 'glass' });
  // commander's cupola + M2 (spec roof MG pivot)
  const [mx, my, mz] = spec.roofMgPivot;
  turret.lathe([[0.42, 0.66], [0.42, 0.74], [0.4, 0.8], [0.36, 0.84], [0, 0.85]], 12, {
    mats: ['paintS', 'glass', 'paintS', 'paintS'], at: [mx, 0, mz],
  });
  machineGun(turret, [mx, my, mz], { len: 0.95, post: 0.06 });
  // loader's hatch and M240
  hatch(turret, [0.66, 0.68, -0.35], 0.36);
  machineGun(turret, [0.66, 0.9, 0.1], { len: 0.55, scale: 0.8, post: 0.14, ammoSide: -1 });
  // smoke grenade launchers at the spec points
  for (const p of spec.smokeLaunchers) {
    smokeBank(turret, [p[0], 0.8, p[2]], Math.sign(p[0]), { rows: 2, cols: 3, yaw: 0.5, pitch: 0.5 });
  }
  // wind sensor mast and antennas
  turret.tube([0, 0.68, -1.9], [0, 1.1, -1.9], 0.02, 0.02, 4, { c: 'darkSteel' });
  turret.box(0.24, 0.03, 0.03, { at: [0, 1.1, -1.9], c: 'darkSteel' });
  antenna(turret, [1.18, 0.68, -2.2], 2.3, { lean: [0.05, -0.25] });
  antenna(turret, [-1.18, 0.68, -2.2], 2.3, { lean: [-0.05, -0.25] });
  // side stowage boxes
  turret.mirrorX(() => {
    turret.box(0.18, 0.42, 1.1, { at: [1.79, 0.38, -1.7] });
  });
  // bustle rack with stowage
  turret.box(3.0, 0.04, 0.5, { at: [0, 0.16, -3.1], c: 'darkSteel' });
  for (const y of [0.38, 0.62]) turret.tube([1.5, y, -3.36], [-1.5, y, -3.36], 0.022, 0.022, 4, { c: 'darkSteel' });
  for (const x of [-1.5, -0.5, 0.5, 1.5]) turret.tube([x, 0.16, -3.36], [x, 0.64, -3.36], 0.02, 0.02, 4, { c: 'darkSteel' });
  turret.mirrorX(() => turret.tube([1.5, 0.62, -3.36], [1.5, 0.62, -2.86], 0.02, 0.02, 4, { c: 'darkSteel' }));
  bag(turret, [0.85, 0.37, -3.1], [0.95, 0.38, 0.42], { c: 'canvas' });
  bag(turret, [-0.15, 0.33, -3.1], [0.75, 0.3, 0.42], { c: 'canvas2' });
  jerryCan(turret, [-0.72, 0.41, -3.12], PI / 2);
  jerryCan(turret, [-1.15, 0.41, -3.12], PI / 2);
  turret.add(cyl(0.13, 0.85, 8, { axis: 'x' }), { at: [0.3, 0.6, -3.08], c: 'canvas2' });

  // --- gun (origin at trunnion)
  gun.bbox(0.98, 0.54, 0.5, 0.05, { at: [0, 0, 0.4], c: 'paint' });
  gunBarrel(gun, spec.barrelLength, [
    [0.125, 0.55], [0.118, 2.1], [0.152, 2.18], [0.152, 2.78], [0.112, 2.9], [0.1, 5.1], [0.112, 5.14],
  ], { seg: 10, muzzleR: 0.112, boreR: 0.062 });
  gun.box(0.08, 0.06, 0.14, { at: [0, 0.135, spec.barrelLength - 0.25], c: 'darkSteel' });
  const [cx, cy, cz] = spec.coaxOffset;
  gun.add(cyl(0.03, 0.14, 6, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [cx, cy, cz + 0.05], c: 'gunmetal' });
  return { hull, turret, gun, emissive: em };
}

// Cheap small-calibre barrel: tube with a muzzle brake ring and dark muzzle cap.
function simpleBarrel(part, at, len, r, o = {}) {
  const z0 = o.z0 ?? 0.4;
  part.add(cyl(r, len - z0, o.seg ?? 6, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [at[0], at[1], z0 + (len - z0) / 2], c: o.c ?? 'gunmetal' });
  part.add(cyl(r * 1.45, o.brake ?? 0.22, o.seg ?? 6, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [at[0], at[1], len - (o.brake ?? 0.22) / 2], c: o.c ?? 'gunmetal' });
}

// Barrel lathe along +Z ending exactly at z = len with a dark bore.
function gunBarrel(part, len, prof, o = {}) {
  const muzzleR = o.muzzleR ?? prof[prof.length - 1][0];
  const bore = o.boreR ?? muzzleR * 0.55;
  const p = prof.map(([r, z]) => [r, z]);
  p.push([muzzleR, len], [bore, len], [bore, len - 0.06], [0, len - 0.06]);
  const mats = p.slice(1).map((_, i) => (i >= p.length - 4 ? 'black' : (o.mats?.[i] ?? o.c ?? 'paintPlain')));
  if (o.mats?.[p.length - 5]) mats[p.length - 5] = o.mats[p.length - 5];
  mats[p.length - 4] = o.faceMat ?? 'gunmetal';
  part.add(lathe(p.map(([r, z]) => [r, z]), o.seg ?? 10, { mats, axis: 'z', crease: 40 }), { at: [o.x ?? 0, o.y ?? 0, 0] });
}

function mbtFederation(spec) {
  const hull = new Part(), turret = new Part(), gun = new Part(), em = new Part();
  runningGear(hull, {
    offsetX: spec.tracks.offsetX, width: spec.tracks.width, wheelR: 0.36, beltT: 0.07,
    wheelZ: [2.5, 1.72, 0.94, 0.16, -0.62, -1.4, -2.18],
    sprocket: [-3.33, 0.64, 0.31], idler: [3.3, 0.6, 0.29], seg: 10, skirtY: 0.6,
  });
  hull.prismX([[3.85, 1.05], [3.2, 0.42], [-3.55, 0.42], [-3.9, 0.7], [-3.9, 1.12], [3.6, 1.12]], -1.08, 1.08, { c: 'paintS' });
  hull.prismX([[3.88, 1.08], [1.95, 1.72], [-3.6, 1.72], [-3.9, 1.6], [-3.9, 1.1], [3.62, 1.1]], -1.14, 1.14);
  // fenders, rubber skirts with ERA in front, fender stowage
  mirrorParts([hull, em], (side) => {
    hull.box(0.64, 0.03, 6.9, { at: [1.45, 1.135, -0.2], c: 'paintS' });
    hull.prismX([[3.25, 1.15], [3.85, 0.98], [3.85, 0.95], [3.25, 1.12]], 1.12, 1.78, { c: 'paintS' });
    for (let i = 0; i < 4; i++) {
      hull.box(0.1, 0.52, 0.5, { at: [1.79, 0.84, 3.05 - i * 0.52], c: 'paintS' });
    }
    for (let i = 0; i < 3; i++) {
      hull.box(0.03, 0.5, 1.62, { at: [1.77, 0.86, 0.95 - i * 1.65], c: 'skirtRubber' });
    }
    // boxes and fuel tanks along the fender
    const boxes = side > 0
      ? [[0.75, 0.36, 2.1], [1.1, 0.4, 0.95], [0.9, 0.36, -0.3], [1.2, 0.42, -1.6], [0.6, 0.3, -2.75]]
      : [[0.9, 0.42, 2.0], [1.3, 0.42, 0.75], [1.3, 0.42, -0.65], [1.0, 0.38, -1.9], [0.7, 0.3, -2.9]];
    for (const [l, hgt, z] of boxes) hull.box(0.55, hgt, l, { at: [1.45, 1.15 + hgt / 2, z], c: 'paintS', noBottom: true });
    lamp(hull, em, [1.38, 1.3, 3.55], 'front', { w: 0.13, h: 0.11, housing: 'darkSteel' });
    lamp(hull, em, [1.5, 1.32, -3.82], 'back', { w: 0.1, h: 0.08, lens: 'redLens', glow: 0xff2a14 });
    towHook(hull, [0.7, 0.68, 3.55]);
    towHook(hull, [0.75, 0.7, -3.9]);
  });
  // IR searchlight on the left fender
  hull.add(cyl(0.13, 0.16, 10, { axis: 'z', caps: 'both', capMat: 'redLens' }), { at: [0.85, 1.43, 3.0], c: 'darkSteel' });
  // glacis ERA (two rows of plates) and dozer blade
  const gl = Math.atan2(1.72 - 1.08, 3.88 - 1.95);
  hull.group({ at: [0, 1.08, 3.88], rot: [gl, 0, 0] }, () => {
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 5; i++) {
        hull.box(0.4, 0.09, 0.62, { at: [(i - 2) * 0.43, 0.05, -0.55 - r * 0.68], c: 'paintS', noBottom: true });
      }
    }
  });
  hull.add(prismX([[3.62, 0.52], [3.98, 0.72], [3.98, 0.8], [3.55, 0.66]], -1.05, 1.05), { c: 'paintS' });
  // driver's hatch + periscope
  hull.add(cyl(0.3, 0.05, 10, { caps: 'end' }), { at: [0, 1.75, 1.75], c: 'paintS' });
  hull.box(0.22, 0.08, 0.08, { at: [0, 1.76, 2.08], c: 'glass' });
  // engine deck louvres, unditching log, rear fuel drums, exhaust grille
  louverPanel(hull, [0, 1.73, -2.45], 1.8, 1.25, { n: 6 });
  hull.box(1.9, 0.03, 0.55, { at: [0, 1.735, -1.55], c: 'paintS' });
  hull.add(cyl(0.13, 3.3, 8, { axis: 'x' }), { at: [0, 1.86, -3.62], c: 'wood' });
  hull.mirrorX(() => {
    hull.add(lathe([[0, -0.44], [0.27, -0.44], [0.29, -0.42], [0.29, 0.42], [0.27, 0.44], [0, 0.44]], 10, { axis: 'x', crease: 40 }), { at: [0.6, 1.45, -4.05], c: 'paintS' });
    hull.box(0.06, 0.35, 0.34, { at: [0.15, 1.3, -3.94], c: 'darkSteel' });
  });
  louverPanel(hull, [0, 1.0, -3.92], 0.9, 0.42, { n: 4, rot: [-PI / 2, 0, 0] });

  // --- turret: low cast dome with Kontakt-5 wedges
  turret.add(cyl(1.05, 0.1, 18, { caps: 'none' }), { at: [0, 0.02, 0], c: 'black' });
  const N = 22;
  const ring = (y, sx, sf, sr) => {
    const out = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU;
      const c = Math.cos(a);
      out.push([1.52 * sx * Math.sin(a), y, c > 0 ? 1.98 * sf * c : 1.6 * sr * c]);
    }
    return out;
  };
  turret.loft([ring(0.04, 1, 1, 1), ring(0.26, 1.0, 0.99, 1.0), ring(0.46, 0.9, 0.9, 0.93), ring(0.58, 0.7, 0.68, 0.74), ring(0.63, 0.5, 0.46, 0.55)], {
    smooth: 34,
  });
  // K-5 clamshell wedges either side of the gun
  turret.mirrorX(() => {
    const lo = [[0.36, 0.1, 2.22], [1.38, 0.1, 1.6], [1.2, 0.1, 1.08], [0.36, 0.1, 1.55]];
    const hi = [[0.36, 0.55, 2.0], [1.3, 0.5, 1.45], [1.12, 0.52, 1.0], [0.36, 0.6, 1.3]];
    turret.loft([lo, hi], { c: 'paint' });
    for (let i = 0; i < 3; i++) turret.box(0.3, 0.06, 0.26, { at: [0.5 + i * 0.32, 0.62, 0.62 - i * 0.12], rot: [0.1, -0.3, 0], c: 'paintS' });
    // Shtora dazzler between gun and wedge
    turret.box(0.26, 0.24, 0.24, { at: [0.48, 0.36, 2.02], c: 'paintS' });
    turret.box(0.2, 0.18, 0.02, { at: [0.48, 0.36, 2.15], c: 'redLens' });
  });
  // gunner's sight (left), commander's cupola + MG (right)
  turret.box(0.32, 0.3, 0.42, { at: [0.6, 0.7, 0.8], c: 'paintS' });
  turret.box(0.24, 0.16, 0.02, { at: [0.6, 0.74, 1.02], c: 'glass' });
  const [mx, my, mz] = spec.roofMgPivot;
  turret.lathe([[0.4, 0.5], [0.4, 0.66], [0.38, 0.72], [0.34, 0.76], [0, 0.78]], 12, {
    mats: ['paintS', 'glass', 'paintS', 'paintS'], at: [mx, 0, mz],
  });
  turret.box(0.12, 0.2, 0.12, { at: [mx + 0.15, 0.86, mz - 0.05], c: 'darkSteel' });
  machineGun(turret, [mx, my, mz], { len: 1.05, ammoSide: 1 });
  hatch(turret, [0.62, 0.58, -0.35], 0.33);
  for (const p of spec.smokeLaunchers) {
    smokeBank(turret, [p[0], p[1] + 0.06, p[2]], Math.sign(p[0]), { rows: 2, cols: 3, yaw: 0.75, pitch: 0.4, r: 0.04 });
  }
  // rear stowage bin, snorkel, antenna
  turret.box(1.9, 0.36, 0.34, { at: [0, 0.3, -1.68], c: 'paintS' });
  turret.add(cyl(0.11, 1.35, 10, { axis: 'x' }), { at: [0.25, 0.62, -1.62], c: 'paintS' });
  antenna(turret, [0.9, 0.48, -1.1], 2.4, { lean: [0.05, -0.3] });
  jerryCan(turret, [-1.12, 0.35, -1.3], 0.5);

  // --- gun: dust boot, thermal sleeve, fume extractor
  gun.lathe([[0.32, 0.12], [0.29, 0.3], [0.17, 0.58]], 10, { axis: 'z', mats: ['canvas2', 'canvas2'] });
  gunBarrel(gun, spec.barrelLength, [
    [0.13, 0.5], [0.118, 2.2], [0.165, 2.3], [0.165, 2.95], [0.112, 3.05], [0.095, 5.3],
  ], { seg: 10, muzzleR: 0.095, boreR: 0.065 });
  const [cx, cy, cz] = spec.coaxOffset;
  gun.add(cyl(0.025, 0.12, 6, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [cx * 0.75, cy + 0.05, cz], c: 'gunmetal' });
  return { hull, turret, gun, emissive: em };
}

// Loft along Z through symmetric cross-sections: each section is
// [z, [[x, y], ...]] listing the +X half from bottom centre to top centre;
// the -X half is mirrored automatically.
function hullLoft(part, sections, o = {}) {
  const rings = sections.map(([z, half]) => {
    const ring = half.map(([x, y]) => [x, y, z]);
    for (let i = half.length - 1; i >= 0; i--) {
      const [x, y] = half[i];
      if (x > 1e-6) ring.push([-x, y, z]);
    }
    return ring;
  });
  // drop duplicate centre points so rings stay simple polygons
  return part.loft(rings, o);
}

// Glass pane on a planar face given 4 corners (CCW from outside) pushed out by `off`.
function pane(part, a, b, c, d, facing, o = {}) {
  const off = o.off ?? 0.012;
  const n = facing;
  const push = (q) => [q[0] + n[0] * off, q[1] + n[1] * off, q[2] + n[2] * off];
  part.add(new Piece().quadF(push(a), push(b), push(c), push(d), facing), { c: o.c ?? 'glass' });
}

function rearRamp(hull, o) {
  const { z, y0, y1, w } = o;
  hull.box(w, y1 - y0, 0.06, { at: [0, (y0 + y1) / 2, z - 0.03], c: 'paint' });
  hull.box(w * 0.32, (y1 - y0) * 0.72, 0.04, { at: [-w * 0.22, y0 + (y1 - y0) * 0.45, z - 0.07], c: 'paintS' });
  hull.box(0.05, 0.12, 0.06, { at: [-w * 0.1, y0 + (y1 - y0) * 0.45, z - 0.1], c: 'darkSteel' });
  hull.add(cyl(0.05, w * 0.9, 8, { axis: 'x' }), { at: [0, y0 + 0.04, z - 0.04], c: 'darkSteel' });
  hull.box(w + 0.06, 0.04, 0.05, { at: [0, y1 + 0.01, z - 0.03], c: 'paintDark' });
}

// ---------------------------------------------------------------------------
// Infantry fighting vehicle

function ifvCoalition(spec) {
  const hull = new Part(), turret = new Part(), gun = new Part(), em = new Part();
  runningGear(hull, {
    offsetX: spec.tracks.offsetX, width: spec.tracks.width, wheelR: 0.3, beltT: 0.06,
    wheelZ: [2.1, 1.22, 0.34, -0.54, -1.42, -2.3],
    sprocket: [2.86, 0.74, 0.28], idler: [-2.95, 0.64, 0.27], seg: 10, skirtY: 0.52,
  });
  hull.prismX([[3.2, 1.12], [2.7, 0.45], [-2.95, 0.45], [-3.25, 0.7], [-3.25, 1.12]], -1.12, 1.12, { c: 'paintS' });
  hull.prismX([[3.3, 1.12], [3.3, 1.42], [1.98, 2.05], [-3.3, 2.05], [-3.3, 1.12]], -1.6, 1.6);
  const sk = [2.8, 1.62, 0.44, -0.74, -1.96, -3.22];
  mirrorParts([hull, em], () => {
    for (let i = 0; i < sk.length - 1; i++) {
      const z0 = sk[i + 1] + 0.012, z1 = sk[i] - 0.012;
      const prof = i === 0
        ? [[z0, 0.52], [2.3, 0.52], [z1, 0.9], [z1, 1.46], [z0, 1.46]]
        : [[z0, 0.52], [z1, 0.52], [z1, 1.46], [z0, 1.46]];
      hull.prismX(prof, 1.56, 1.65);
      hull.box(0.03, 0.03, z1 - z0 - 0.1, { at: [1.655, 0.98, (z0 + z1) / 2], c: 'paintDark' });
    }
    // upper side armour tiles
    for (let i = 0; i < 4; i++) hull.box(0.07, 0.46, 1.08, { at: [1.62, 1.76, 0.62 - i * 1.12], c: 'paint' });
    lamp(hull, em, [1.36, 1.5, 3.32], 'front', { w: 0.16, h: 0.12 });
    hull.box(0.36, 0.05, 0.22, { at: [1.36, 1.62, 3.24], c: 'darkSteel' });
    lamp(hull, em, [1.42, 1.86, -3.33], 'back', { w: 0.1, h: 0.1, lens: 'redLens', glow: 0xff2a14 });
    towHook(hull, [0.75, 0.98, 3.3]);
    towHook(hull, [0.85, 0.82, -3.27]);
    // rear stowage boxes beside the ramp
    hull.box(0.42, 0.62, 0.32, { at: [1.32, 1.5, -3.46], c: 'paintS' });
    antenna(hull, [1.35, 2.05, -3.05], 2.6, { lean: [0.05, -0.3] });
  });
  // exhaust grille on the left side near the spec point
  louverPanel(hull, [1.62, 1.66, 1.8], 0.36, 0.5, { n: 4, rot: [PI / 2, 0, -PI / 2], order: 'XYZ' });
  // trim vane folded on the glacis, driver's hatch and periscopes
  const gl = Math.atan2(2.05 - 1.42, 3.3 - 1.98);
  hull.group({ at: [0, 1.42, 3.3], rot: [gl, 0, 0] }, () => {
    hull.box(2.7, 0.05, 0.8, { at: [0, 0.05, -0.62], c: 'paint' });
    hull.box(2.5, 0.06, 0.06, { at: [0, 0.04, -0.12], c: 'darkSteel' });
  });
  hatch(hull, [0.68, 2.05, 1.55], 0.32);
  for (const x of [0.48, 0.68, 0.88]) hull.box(0.14, 0.07, 0.07, { at: [x, 2.08, 1.95], c: 'glass' });
  // roof cargo hatch, vision blocks
  hull.box(1.25, 0.06, 1.05, { at: [0, 2.08, -2.45], c: 'paintS', noBottom: true });
  for (const z of [-1.4, -2.0, -2.6]) hull.mirrorX(() => hull.box(0.06, 0.07, 0.14, { at: [1.5, 2.08, z], c: 'glass' }));
  rearRamp(hull, { z: -3.3, y0: 0.6, y1: 1.95, w: 1.9 });

  // --- turret: angular box with chamfered front corners
  turret.add(cyl(0.95, 0.1, 16, { caps: 'none' }), { at: [0, 0.02, 0], c: 'black' });
  const TB = [[0.42, 1.22], [1.02, 0.62], [1.05, -0.9], [0.85, -1.35], [-0.85, -1.35], [-1.05, -0.9], [-1.02, 0.62], [-0.42, 1.22]];
  const tr = (y, sc, dz) => TB.map(([x, z]) => [x * sc, y, z > 0 ? z - dz : z + dz * 0.25]);
  turret.loft([tr(0.04, 1, 0), tr(0.55, 0.99, 0.07), tr(0.86, 0.93, 0.28)]);
  // TOW launcher on the left side (spec point = launch tube front)
  const [ax, ay, az] = spec.atgmLauncher;
  turret.box(0.44, 0.42, 1.2, { at: [ax + 0.1, ay, az - 0.6], c: 'paint' });
  turret.box(0.18, 0.12, 0.5, { at: [ax - 0.14, ay - 0.1, az - 0.7], c: 'paintS' });
  for (const dx of [0, 0.2]) turret.add(cyl(0.075, 0.03, 8, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [ax + dx, ay, az + 0.005], c: 'paintS' });
  // smoke grenade launchers on the chamfered front corners
  for (const p of spec.smokeLaunchers) {
    const side = Math.sign(p[0]);
    smokeBank(turret, [p[0] * 1.06, p[1] + 0.05, p[2] + 0.18], side, { rows: 2, cols: 2, yaw: 0.8, pitch: 0.45, r: 0.045 });
  }
  hatch(turret, [-0.5, 0.86, -0.6], 0.3);
  hatch(turret, [0.48, 0.86, -0.55], 0.28);
  // commander's independent viewer and gunner's sight
  turret.add(cyl(0.11, 0.24, 8, { caps: 'none' }), { at: [-0.62, 0.98, -1.0], c: 'paintS' });
  turret.box(0.36, 0.28, 0.36, { at: [-0.62, 1.2, -1.0], c: 'paintS' });
  turret.box(0.26, 0.14, 0.02, { at: [-0.62, 1.22, -0.81], c: 'glass' });
  turret.box(0.32, 0.22, 0.44, { at: [0.42, 0.97, 0.38], c: 'paintS' });
  turret.box(0.24, 0.12, 0.02, { at: [0.42, 0.98, 0.61], c: 'glass' });
  // bustle rack with stowage
  turret.box(1.7, 0.04, 0.42, { at: [0, 0.22, -1.56], c: 'darkSteel' });
  for (const y of [0.45, 0.68]) turret.tube([0.85, y, -1.77], [-0.85, y, -1.77], 0.02, 0.02, 4, { c: 'darkSteel' });
  bag(turret, [0.4, 0.42, -1.56], [0.7, 0.36, 0.38], { c: 'canvas' });
  bag(turret, [-0.38, 0.4, -1.56], [0.62, 0.32, 0.36], { c: 'canvas2' });

  // --- gun: 25 mm chain gun in a box mantlet
  gun.bbox(0.68, 0.38, 0.46, 0.04, { at: [0, 0, 0.2], c: 'paint' });
  gun.add(cyl(0.075, 0.5, 8, { axis: 'z', caps: 'none' }), { at: [0, 0, 0.66], c: 'paintPlain' });
  gunBarrel(gun, spec.barrelLength, [[0.05, 0.9], [0.046, 2.42], [0.062, 2.45]], { seg: 8, muzzleR: 0.062, boreR: 0.024, c: 'gunmetal', faceMat: 'gunmetal' });
  const [cx, cy, cz] = spec.coaxOffset;
  gun.add(cyl(0.025, 0.14, 6, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [cx * 0.85, cy + 0.06, cz + 0.08], c: 'gunmetal' });
  return { hull, turret, gun, emissive: em };
}

function ifvFederation(spec) {
  const hull = new Part(), turret = new Part(), gun = new Part(), em = new Part();
  runningGear(hull, {
    offsetX: spec.tracks.offsetX, width: spec.tracks.width, wheelR: 0.34, beltT: 0.06,
    wheelZ: [2.05, 1.18, 0.31, -0.56, -1.43, -2.3],
    sprocket: [2.86, 0.68, 0.27], idler: [-2.95, 0.6, 0.26],
    rollers: [[1.62, 0.83, 0.075], [0.0, 0.83, 0.075], [-1.62, 0.83, 0.075]], seg: 9,
  });
  // central hull with the long glacis and pointed nose
  const glacisY = (z) => 0.98 + (3.3 - z) * 0.47;
  hull.prismX([[3.3, 0.98], [2.85, 0.45], [-3.0, 0.45], [-3.3, 0.72], [-3.3, 1.86], [-1.2, 2.05], [1.0, 2.05]], -1.1, 1.1);
  // sloped upper sides over the tracks
  const roof = (z) => (z > 1.0 ? Math.min(2.05, glacisY(z)) : z > -1.2 ? 2.05 : 2.05 - (-1.2 - z) * 0.09);
  const sec = (z) => [z, [[1.1, 1.12], [1.62, 1.12], [1.62, 1.2], [1.3, roof(z)], [1.1, roof(z)]]];
  hull.mirrorX(() => hull.loft([2.5, 1.0, -1.2, -3.3].map((z) => sec(z)).map(([z, h]) => h.map(([x, y]) => [x, y, z]))));
  // ribbed nose plate
  for (let i = 0; i < 5; i++) {
    const z = 3.12 - i * 0.2;
    const y = glacisY(z);
    hull.prismX([[z + 0.06, y - 0.02], [z, y + 0.07], [z - 0.06, y + 0.04]], -1.02, 1.02, { c: 'paintS' });
  }
  mirrorParts([hull, em], () => {
    // front mudguards and fender boxes
    hull.prismX([[2.5, 1.2], [3.2, 1.0], [3.2, 0.97], [2.5, 1.17]], 1.12, 1.66, { c: 'paintS' });
    lamp(hull, em, [0.88, 1.32, 2.95], 'front', { w: 0.12, h: 0.1, housing: 'darkSteel' });
    lamp(hull, em, [1.35, 1.32, -3.32], 'back', { w: 0.08, h: 0.07, lens: 'redLens', glow: 0xff2a14 });
    towHook(hull, [0.7, 0.85, 3.05]);
    towHook(hull, [0.78, 0.82, -3.32]);
    // firing ports along the side
    for (const z of [-0.55, -1.35, -2.15]) hull.add(cyl(0.07, 0.08, 5, { axis: 'x', caps: 'end', capMat: 'darkSteel' }), { at: [1.43, 1.62, z], rot: [0, 0, 0.42], c: 'paintS' });
    // rear doors (fuel tank doors) with vision blocks
    hull.box(0.7, 1.0, 0.24, { at: [0.42, 1.18, -3.4], c: 'paintS' });
    hull.box(0.12, 0.08, 0.03, { at: [0.42, 1.45, -3.53], c: 'glass' });
    hull.box(0.06, 0.12, 0.05, { at: [0.12, 1.15, -3.53], c: 'darkSteel' });
    // roof troop hatches
    for (const z of [-1.75, -2.65]) hull.box(0.62, 0.05, 0.78, { at: [0.5, roof(z) + 0.02, z], rot: [0.09, 0, 0], c: 'paintS', noBottom: true });
  });
  // exhaust louvre on the left slope, driver/commander hatches, IR light
  louverPanel(hull, [1.42, 1.55, 1.8], 0.32, 0.55, { n: 4, rot: [0, 0, -1.2] });
  hatch(hull, [0.58, glacisY(1.45) + 0.02, 1.45], 0.28);
  hatch(hull, [0.58, 2.05, 0.9], 0.28);
  for (const x of [0.42, 0.74]) hull.box(0.12, 0.07, 0.07, { at: [x, glacisY(1.78) + 0.05, 1.78], c: 'glass' });
  hull.add(cyl(0.11, 0.14, 10, { axis: 'z', caps: 'both', capMat: 'redLens' }), { at: [0.25, glacisY(1.9) + 0.14, 1.9], c: 'darkSteel' });
  antenna(hull, [1.2, 1.95, -2.2], 2.4);

  // --- turret: low conical BMP-2 style with twin ATGM launchers
  turret.add(cyl(0.92, 0.1, 16, { caps: 'none' }), { at: [0, 0.02, 0], c: 'black' });
  const N = 14;
  const tring = (y, sx, sf, sr) => {
    const out = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU;
      const c = Math.cos(a), sn = Math.sin(a);
      out.push([1.02 * sx * Math.sign(sn) * Math.pow(Math.abs(sn), 0.8), y, (c > 0 ? 1.1 * sf : 1.0 * sr) * Math.sign(c) * Math.pow(Math.abs(c), 0.8)]);
    }
    return out;
  };
  turret.loft([tring(0.04, 1, 1, 1), tring(0.32, 0.97, 0.96, 0.98), tring(0.68, 0.66, 0.58, 0.72)], { smooth: 28 });
  mirrorParts([turret], () => {
    const [ax, ay, az] = spec.atgmLauncher;
    turret.box(0.12, 0.34, 0.5, { at: [ax - 0.12, ay, az - 0.62], c: 'paintS' });
    for (const dy of [-0.09, 0.09]) {
      turret.add(cyl(0.075, 1.2, 10, { axis: 'z', caps: 'both', capMat: 'black' }), { at: [ax, ay + dy, az - 0.6], c: 'paint' });
    }
    turret.box(0.18, 0.04, 1.0, { at: [ax, ay + 0.19, az - 0.6], c: 'paintS' });
  });
  for (const p of spec.smokeLaunchers) {
    smokeBank(turret, [p[0], p[1] + 0.02, p[2]], Math.sign(p[0]), { rows: 1, cols: 3, yaw: 0.7, pitch: 0.4, r: 0.042 });
  }
  // sights and hatches
  turret.box(0.34, 0.3, 0.46, { at: [0.32, 0.82, 0.2], c: 'paintS' });
  turret.box(0.26, 0.15, 0.02, { at: [0.32, 0.86, 0.44], c: 'glass' });
  turret.add(cyl(0.12, 0.28, 8, { caps: 'end' }), { at: [-0.12, 0.82, -0.45], c: 'paintS' });
  turret.box(0.3, 0.2, 0.26, { at: [-0.12, 1.02, -0.45], c: 'paintS' });
  turret.box(0.22, 0.12, 0.02, { at: [-0.12, 1.03, -0.31], c: 'glass' });
  turret.lathe([[0.3, 0.6], [0.3, 0.7], [0.27, 0.76], [0, 0.78]], 10, { mats: ['glass', 'paintS', 'paintS'], at: [-0.42, 0, -0.15] });
  hatch(turret, [0.4, 0.66, -0.35], 0.26);
  antenna(turret, [-0.5, 0.6, -0.75], 2.2);

  // --- gun: 30 mm 2A42 with recoil sleeve and muzzle brake
  gun.bbox(0.44, 0.34, 0.36, 0.04, { at: [0, 0, 0.1], c: 'paint' });
  gun.add(cyl(0.075, 0.62, 10, { axis: 'z', caps: 'end' }), { at: [0, 0, 0.58], c: 'paintPlain' });
  gunBarrel(gun, spec.barrelLength, [[0.04, 0.88], [0.036, 2.4], [0.055, 2.42], [0.055, 2.56], [0.048, 2.58], [0.052, 2.6]], { seg: 8, muzzleR: 0.052, boreR: 0.02, c: 'paintPlain' });
  const [cx, cy, cz] = spec.coaxOffset;
  gun.add(cyl(0.02, 0.12, 6, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [cx * 0.7, cy, cz], c: 'gunmetal' });
  return { hull, turret, gun, emissive: em, camoScale: 1.15 };
}

// ---------------------------------------------------------------------------
// Heavy machine gun as a `gun` part: receiver behind the trunnion, barrel to len.
function hmgGun(gun, len, o = {}) {
  const r = o.r ?? 0.025;
  gun.box(0.14, 0.16, 0.62, { at: [0, 0, -0.22], c: 'gunmetal' });
  gun.box(0.05, 0.12, 0.14, { at: [0, -0.02, -0.6], c: 'gunmetal' });
  gun.box(0.12, 0.14, 0.24, { at: [o.ammoSide ?? 0.14, -0.04, -0.2], c: 'jerry' });
  gun.add(cyl(r * 1.5, 0.36, 8, { axis: 'z', caps: 'none' }), { at: [0, 0.01, 0.27], c: 'gunmetal' });
  gun.add(lathe([[r, 0.08], [r, len - 0.16], [r * 1.35, len - 0.15], [r * 1.35, len], [r * 0.6, len], [r * 0.6, len - 0.04], [0, len - 0.04]], 8, {
    axis: 'z', mats: ['gunmetal', 'gunmetal', 'gunmetal', 'gunmetal', 'black', 'black'],
  }), { at: [0, 0.01, 0], c: 'gunmetal' });
}

// Slat armour cage along a side: horizontal bars + posts, at x, from z0..z1, y0..y1.
function slatSide(part, x, z0, z1, y0, y1, o = {}) {
  const n = o.bars ?? 5;
  const bar = box(0.018, 0.065, z1 - z0, { noTop: false });
  for (let i = 0; i < n; i++) {
    const y = y0 + ((i + 0.5) / n) * (y1 - y0);
    part.add(bar, { at: [x, y, (z0 + z1) / 2], c: 'darkSteel' });
  }
  const posts = o.posts ?? 6;
  for (let i = 0; i <= posts; i++) {
    const z = z0 + (i / posts) * (z1 - z0);
    part.box(0.04, y1 - y0 + 0.04, 0.04, { at: [x + 0.01, (y0 + y1) / 2, z], c: 'darkSteel' });
    part.box(o.arm ?? 0.14, 0.035, 0.035, { at: [x - (o.arm ?? 0.14) / 2, y1 - 0.05, z], c: 'darkSteel' });
  }
}

// ---------------------------------------------------------------------------
// Wheeled APC

function apcCoalition(spec) {
  const hull = new Part(), turret = new Part(), gun = new Part(), em = new Part();
  wheelSet(hull, spec, { w: 0.38 });
  // V-bottom lower hull between the wheels
  const lower = (z, yb, ys) => [[0.4, yb], [1.02, ys], [1.02, 1.3]];
  hullLoft(hull, [
    [3.6, [[0.4, 1.0], [1.0, 1.05], [1.0, 1.3]]],
    [3.05, lower(3.05, 0.5, 0.78)],
    [-3.3, lower(-3.3, 0.5, 0.78)],
    [-3.68, [[0.4, 0.78], [1.0, 0.92], [1.0, 1.3]]],
  ], { c: 'paintS' });
  // upper hull with long sloped glacis
  hull.prismX([[3.72, 1.28], [3.72, 1.48], [2.55, 2.2], [-3.7, 2.2], [-3.7, 1.28]], -1.36, 1.36);
  // slat armour on the sides and rear
  hull.mirrorX(() => slatSide(hull, 1.49, -3.62, 2.45, 1.32, 2.12, { bars: 5, posts: 6 }));
  for (let i = 0; i < 4; i++) hull.box(2.9, 0.065, 0.018, { at: [0, 1.4 + i * 0.2, -3.86], c: 'darkSteel' });
  for (const x of [-1.45, -0.5, 0.5, 1.45]) hull.box(0.04, 0.8, 0.04, { at: [x, 1.7, -3.85], c: 'darkSteel' });
  mirrorParts([hull, em], () => {
    lamp(hull, em, [1.12, 1.42, 3.73], 'front', { w: 0.2, h: 0.12, housing: 'darkSteel' });
    hull.box(0.34, 0.04, 0.16, { at: [1.12, 1.53, 3.7], c: 'darkSteel' });
    lamp(hull, em, [1.2, 1.45, -3.72], 'back', { w: 0.12, h: 0.1, lens: 'redLens', glow: 0xff2a14 });
    towHook(hull, [0.62, 1.12, 3.72]);
    // roof stowage rails and bags
    hull.tube([1.22, 2.3, -3.4], [1.22, 2.3, -0.3], 0.02, 0.02, 4, { c: 'darkSteel' });
    antenna(hull, [1.2, 2.2, -3.45], 2.8, { lean: [0.06, -0.35] });
  });
  bag(hull, [0.95, 2.36, -2.9], [0.44, 0.32, 0.95], { c: 'canvas' });
  bag(hull, [-0.95, 2.34, -2.2], [0.44, 0.28, 0.85], { c: 'canvas2' });
  jerryCan(hull, [-0.98, 2.43, -3.15], 0);
  bag(hull, [0.95, 2.33, -1.6], [0.42, 0.26, 0.7], { c: 'canvas2' });
  // exhaust grille on the right side (spec point)
  louverPanel(hull, [-1.37, 1.72, 1.2], 0.36, 0.55, { n: 4, rot: [0, 0, PI / 2] });
  // hatches, periscopes, rear ramp
  hatch(hull, [0.7, 2.2, 2.25], 0.3);
  for (const x of [0.5, 0.7, 0.9]) hull.box(0.13, 0.07, 0.07, { at: [x, 2.24, 2.62], c: 'glass' });
  hatch(hull, [-0.55, 2.2, -0.2], 0.3);
  hull.box(1.3, 0.06, 0.9, { at: [0, 2.23, -1.5], c: 'paintS', noBottom: true });
  rearRamp(hull, { z: -3.7, y0: 0.75, y1: 2.05, w: 1.7 });
  hull.box(1.9, 0.12, 0.25, { at: [0, 0.95, 3.68], c: 'darkSteel' });

  // --- RWS (remote weapon station)
  turret.add(cyl(0.34, 0.14, 12, { caps: 'end' }), { at: [0, 0.07, 0], c: 'paintS' });
  turret.box(0.2, 0.34, 0.56, { at: [0.25, 0.3, -0.02], c: 'paint' });
  turret.box(0.26, 0.3, 0.36, { at: [-0.26, 0.33, 0.04], c: 'paint' });
  turret.box(0.2, 0.15, 0.02, { at: [-0.26, 0.36, 0.23], c: 'glass' });
  turret.box(0.14, 0.12, 0.02, { at: [-0.26, 0.2, 0.23], c: 'glass' });
  for (const p of spec.smokeLaunchers) {
    smokeBank(turret, [p[0] * 1.05, p[1], p[2] - 0.12], Math.sign(p[0]), { rows: 2, cols: 2, yaw: 0.35, pitch: 0.55, r: 0.04, len: 0.2 });
  }
  hmgGun(gun, spec.barrelLength, { r: spec.gunRadius * 0.85 });
  return { hull, turret, gun, emissive: em };
}

function apcFederation(spec) {
  const hull = new Part(), turret = new Part(), gun = new Part(), em = new Part();
  wheelSet(hull, spec, { w: 0.38, rim: 0.55 });
  // boat-shaped hull: sloped lower sides, widest above the wheels, steep upper sides
  const sec = (z, yb, ylo, ymid, yr, xb, xlo, xmid, xr) => [z, [[xb, yb], [xlo, ylo], [xmid, ymid], [xr, yr], [0, yr]]];
  hullLoft(hull, [
    sec(3.72, 1.08, 1.13, 1.2, 1.28, 0.62, 0.95, 1.08, 0.86),
    sec(3.3, 0.72, 1.0, 1.3, 1.62, 0.78, 1.22, 1.4, 1.0),
    sec(2.35, 0.55, 1.0, 1.32, 2.2, 0.8, 1.28, 1.45, 1.02),
    sec(-2.9, 0.55, 1.0, 1.32, 2.2, 0.8, 1.28, 1.45, 1.02),
    sec(-3.5, 0.76, 1.05, 1.32, 2.08, 0.8, 1.28, 1.44, 1.0),
    sec(-3.72, 1.0, 1.12, 1.3, 1.95, 0.75, 1.2, 1.38, 0.95),
  ].map(([z, h]) => [z, h.filter((q, i) => i < 4 || q[0] === 0)]), {});
  mirrorParts([hull, em], () => {
    // side door between the 2nd and 3rd axles, firing ports, lights
    hull.add(new Piece().quadF([1.3, 1.06, 0.48], [1.3, 1.06, -0.48], [1.08, 0.62, -0.48], [1.08, 0.62, 0.48], [1, -0.45, 0]), { c: 'paintDark' });
    hull.group({ at: [1.29, 1.04, 0], rot: [0, 0, -0.47] }, () => hull.box(0.03, 0.42, 0.9, { at: [0, -0.21, 0], c: 'paintS' }));
    for (const z of [1.4, -0.95, -1.9]) hull.add(sphere(0.07, 8, 4), { at: [1.33, 1.6, z], c: 'darkSteel' });
    lamp(hull, em, [0.78, 1.42, 3.42], 'front', { w: 0.16, h: 0.12, housing: 'darkSteel' });
    lamp(hull, em, [1.05, 1.5, -3.6], 'back', { w: 0.08, h: 0.08, lens: 'redLens', glow: 0xff2a14 });
    towHook(hull, [0.55, 1.05, 3.7]);
    hull.box(0.5, 0.25, 0.9, { at: [0.62, 2.31, -2.6], c: 'paintS' });
  });
  // trim vane folded on the glacis
  const gl = Math.atan2(2.2 - 1.62, 3.3 - 2.35);
  hull.group({ at: [0, 1.62, 3.3], rot: [gl, 0, 0] }, () => hull.box(1.8, 0.05, 0.7, { at: [0, 0.04, -0.45], c: 'paint' }));
  // exhaust grille right side, roof hatches with vision blocks, engine deck louvres
  louverPanel(hull, [-1.24, 1.75, 1.2], 0.36, 0.55, { n: 4, rot: [0, 0, 1.15] });
  for (const x of [0.45, -0.45]) {
    hatch(hull, [x, 2.2, 2.1], 0.28);
    hull.box(0.32, 0.08, 0.08, { at: [x, 2.22, 2.42], c: 'glass' });
  }
  louverPanel(hull, [0, 2.21, -2.0], 1.2, 1.2, { n: 5 });
  hull.box(1.0, 0.06, 0.7, { at: [0, 2.23, -0.75], c: 'paintS', noBottom: true });
  // small rear hatch and waterjet cover
  hull.box(0.9, 0.7, 0.05, { at: [0, 1.55, -3.71], rot: [-0.25, 0, 0], c: 'paintS' });
  hull.box(0.6, 0.35, 0.08, { at: [0, 1.0, -3.7], c: 'darkSteel' });
  antenna(hull, [0.9, 2.2, -3.2], 2.4);
  antenna(hull, [-0.9, 2.2, -3.2], 2.4);

  // --- small conical turret with KPVT
  turret.lathe([[0.64, 0.02], [0.62, 0.24], [0.5, 0.42], [0.3, 0.48], [0, 0.49]], 12, { crease: 30 });
  turret.box(0.34, 0.3, 0.3, { at: [0, 0.3, 0.52], c: 'paintS' });
  turret.box(0.22, 0.2, 0.28, { at: [-0.3, 0.55, 0.12], c: 'paintS' });
  turret.box(0.16, 0.1, 0.02, { at: [-0.3, 0.56, 0.27], c: 'glass' });
  for (const p of spec.smokeLaunchers) {
    smokeBank(turret, [p[0] * 1.15, p[1], p[2] - 0.2], Math.sign(p[0]), { rows: 1, cols: 3, yaw: 0.6, pitch: 0.5, r: 0.04, len: 0.2 });
  }
  hmgGun(gun, spec.barrelLength, { r: spec.gunRadius * 0.9 });
  gun.add(cyl(0.017, 0.5, 6, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [0.14, 0.0, 0.25], c: 'gunmetal' });
  return { hull, turret, gun, emissive: em };
}

// ---------------------------------------------------------------------------
// Armoured scout car

// Horizontal-ring loft for cabins: rings are [y, x0 (half width), zFront, zRear].
function cabin(part, rings, o = {}) {
  const ch = o.chamfer ?? 0;
  const ring = ([y, hw, zf, zr]) => {
    if (!ch) return [[hw, y, zf], [hw, y, zr], [-hw, y, zr], [-hw, y, zf]];
    return [[hw - ch, y, zf], [hw, y, zf - ch], [hw, y, zr + ch], [hw - ch, y, zr], [-hw + ch, y, zr], [-hw, y, zr + ch], [-hw, y, zf - ch], [-hw + ch, y, zf]];
  };
  return part.loft(rings.map(ring), o);
}

function scoutCoalition(spec) {
  const hull = new Part(), turret = new Part(), gun = new Part(), em = new Part();
  wheelSet(hull, spec, { w: 0.42, rim: 0.56, seg: 14 });
  // chassis, V-hull crew capsule
  hull.box(1.3, 0.3, 5.0, { at: [0, 0.62, 0], c: 'darkSteel' });
  hullLoft(hull, [
    [1.25, [[0.45, 0.62], [1.12, 0.98], [1.12, 1.0]]],
    [-1.45, [[0.45, 0.62], [1.12, 0.98], [1.12, 1.0]]],
  ], { c: 'paintS' });
  // engine hood with crowned top
  hullLoft(hull, [
    [2.74, [[0.92, 0.72], [0.96, 1.3], [0.78, 1.44], [0, 1.47]]],
    [1.2, [[0.98, 0.78], [1.0, 1.5], [0.82, 1.64], [0, 1.67]]],
  ]);
  // cabin: beltline at 1.5, sloped windscreen and greenhouse
  cabin(hull, [[0.98, 1.13, 1.22, -1.45], [1.52, 1.13, 1.22, -1.45], [2.15, 0.98, 0.8, -1.38]], { chamfer: 0.06 });
  // windows (windscreen, two per side, rear)
  const wsF = (t, x) => [x, 1.6 + t * 0.48, 1.18 - t * 0.37];
  pane(hull, wsF(0, 0.82), wsF(0, 0.06), wsF(1, 0.06), wsF(1, 0.7), [0, 0.6, 0.8]);
  pane(hull, wsF(0, -0.06), wsF(0, -0.82), wsF(1, -0.7), wsF(1, -0.06), [0, 0.6, 0.8]);
  for (const sx of [1, -1]) {
    for (const [z0, z1] of [[0.95, 0.15], [0.0, -0.85]]) {
      const lo = (z) => [sx * 1.115, 1.62, z], hi = (z) => [sx * 1.0, 2.05, z];
      pane(hull, lo(z0), lo(z1), hi(z1), hi(z0), [sx, 0.12, 0]);
    }
  }
  pane(hull, [0.55, 1.65, -1.44], [-0.55, 1.65, -1.44], [-0.5, 2.0, -1.4], [0.5, 2.0, -1.4], [0, 0.1, -1]);
  // rear cargo bed with stowage
  hull.box(2.2, 0.08, 1.35, { at: [0, 1.02, -2.1], c: 'paintS' });
  hull.mirrorX(() => hull.box(0.08, 0.48, 1.35, { at: [1.08, 1.3, -2.1] }));
  hull.box(2.2, 0.48, 0.08, { at: [0, 1.3, -2.76] });
  bag(hull, [0.4, 1.3, -2.0], [0.8, 0.45, 0.8], { c: 'canvas' });
  hull.box(0.55, 0.38, 0.5, { at: [-0.5, 1.25, -2.3], c: 'jerry' });
  jerryCan(hull, [-0.55, 1.3, -1.7], PI / 2);
  // fenders over the wheels
  mirrorParts([hull, em], () => {
    hull.prismX([[2.62, 1.0], [2.42, 1.3], [1.12, 1.33], [0.95, 1.0]], 0.98, 1.24, { c: 'paint' });
    hull.prismX([[-0.98, 1.0], [-1.12, 1.33], [-2.42, 1.33], [-2.6, 1.0]], 1.0, 1.24, { c: 'paint' });
    lamp(hull, em, [1.02, 1.18, 2.6], 'front', { w: 0.18, h: 0.12, housing: 'darkSteel' });
    lamp(hull, em, [1.0, 1.2, -2.8], 'back', { w: 0.1, h: 0.14, lens: 'redLens', glow: 0xff2a14 });
    // mirrors, steps, door seams and handles
    hull.tube([1.12, 1.75, 1.05], [1.32, 1.85, 1.1], 0.02, 0.02, 4, { c: 'black' });
    hull.box(0.04, 0.26, 0.16, { at: [1.34, 1.85, 1.1], c: 'black' });
    hull.box(0.22, 0.05, 1.8, { at: [1.18, 0.82, -0.12], c: 'darkSteel' });
    for (const z of [0.05, -1.0]) hull.box(0.015, 0.75, 0.025, { at: [1.135, 1.4, z], c: 'black' });
    for (const z of [0.85, -0.25]) hull.box(0.03, 0.04, 0.16, { at: [1.14, 1.42, z], c: 'black' });
    towHook(hull, [0.6, 0.78, 2.92]);
    antenna(hull, [0.95, 2.15, -1.3], 2.2, { lean: [0.05, -0.3] });
  });
  // grille and bumpers
  hull.box(1.3, 0.42, 0.04, { at: [0, 1.06, 2.76], c: 'black' });
  for (let i = 0; i < 5; i++) hull.box(1.26, 0.03, 0.03, { at: [0, 0.9 + i * 0.08, 2.78], c: 'paintDark' });
  hull.box(2.0, 0.22, 0.16, { at: [0, 0.74, 2.8], c: 'darkSteel' });
  hull.box(0.5, 0.18, 0.12, { at: [0, 0.74, 2.88], c: 'black' });
  hull.box(2.1, 0.18, 0.14, { at: [0, 0.78, -2.8], c: 'darkSteel' });
  // exhaust pipe (spec point, right rear low)
  hull.add(cyl(0.05, 0.4, 8, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [-1.0, 0.6, -2.45], c: 'darkSteel' });

  // --- turret: armoured ring with gun shield
  turret.add(cyl(0.62, 0.12, 14, { caps: 'end' }), { at: [0, 0.06, 0], c: 'paintS' });
  turret.add(cyl(0.05, 0.25, 6, { caps: 'none' }), { at: [0, 0.22, 0.1], c: 'gunmetal' });
  // lower front plate, upper window plates either side of the gun, side wings
  turret.box(0.7, 0.26, 0.05, { at: [0, 0.24, 0.55], rot: [-0.15, 0, 0] });
  turret.mirrorX(() => {
    turret.group({ at: [0.32, 0.5, 0.52], rot: [-0.12, 0.25, 0] }, () => {
      turret.box(0.4, 0.5, 0.05);
      turret.box(0.24, 0.2, 0.02, { at: [0, 0.06, 0.03], c: 'glass' });
    });
    turret.group({ at: [0.6, 0.42, 0.22], rot: [0, 1.15, 0] }, () => {
      turret.box(0.62, 0.66, 0.05);
      turret.box(0.3, 0.18, 0.02, { at: [0, 0.14, 0.03], c: 'glass' });
    });
  });
  hmgGun(gun, spec.barrelLength, { r: spec.gunRadius });
  return { hull, turret, gun, emissive: em };
}

function scoutFederation(spec) {
  const hull = new Part(), turret = new Part(), gun = new Part(), em = new Part();
  wheelSet(hull, spec, { w: 0.4, rim: 0.6, seg: 14 });
  hull.box(1.3, 0.3, 5.0, { at: [0, 0.6, 0], c: 'darkSteel' });
  // long hood
  hullLoft(hull, [
    [2.78, [[1.0, 0.78], [1.0, 1.36], [0.88, 1.46], [0, 1.47]]],
    [1.15, [[1.04, 0.78], [1.04, 1.48], [0.92, 1.58], [0, 1.6]]],
  ]);
  // boxy body with chamfered corners and upright windscreen
  cabin(hull, [[0.8, 1.1, 1.18, -2.5], [1.55, 1.12, 1.18, -2.5], [2.15, 1.02, 1.0, -2.43]], { chamfer: 0.1 });
  const ws = (t, x) => [x, 1.62 + t * 0.46, 1.16 - t * 0.17];
  pane(hull, ws(0, 0.88), ws(0, 0.04), ws(1, 0.04), ws(1, 0.82), [0, 0.35, 0.94]);
  pane(hull, ws(0, -0.04), ws(0, -0.88), ws(1, -0.82), ws(1, -0.04), [0, 0.35, 0.94]);
  for (const sx of [1, -1]) {
    for (const [z0, z1] of [[0.85, 0.05], [-0.15, -0.95], [-1.15, -1.9]]) {
      const lo = (z) => [sx * 1.115, 1.66, z], hi = (z) => [sx * 1.04, 2.02, z];
      pane(hull, lo(z0), lo(z1), hi(z1), hi(z0), [sx, 0.15, 0]);
    }
  }
  mirrorParts([hull, em], () => {
    // wheel arch flares
    hull.prismX([[2.55, 0.95], [2.3, 1.3], [1.2, 1.3], [0.95, 0.95]], 1.0, 1.22, { c: 'paintS' });
    hull.prismX([[-0.95, 0.95], [-1.2, 1.3], [-2.15, 1.3], [-2.4, 0.95]], 1.0, 1.22, { c: 'paintS' });
    lamp(hull, em, [0.72, 1.2, 2.79], 'front', { w: 0.24, h: 0.14, housing: 'darkSteel' });
    lamp(hull, em, [1.0, 1.15, -2.51], 'back', { w: 0.1, h: 0.16, lens: 'redLens', glow: 0xff2a14 });
    hull.tube([1.1, 1.75, 1.05], [1.32, 1.82, 1.08], 0.02, 0.02, 4, { c: 'black' });
    hull.box(0.04, 0.24, 0.17, { at: [1.34, 1.82, 1.08], c: 'black' });
    for (const z of [-0.05, -1.05]) hull.box(0.015, 0.78, 0.025, { at: [1.125, 1.4, z], c: 'black' });
    for (const z of [0.7, -0.3, -1.3]) hull.box(0.03, 0.04, 0.16, { at: [1.13, 1.45, z], c: 'black' });
    hull.box(0.2, 0.05, 1.7, { at: [1.18, 0.78, -0.15], c: 'darkSteel' });
    towHook(hull, [0.6, 0.72, 2.92]);
  });
  // grille, bumper with guard, rear door with spare wheel
  hull.box(1.0, 0.4, 0.04, { at: [0, 1.1, 2.79], c: 'black' });
  for (let i = 0; i < 6; i++) hull.box(0.03, 0.38, 0.03, { at: [-0.4 + i * 0.16, 1.1, 2.81], c: 'paintDark' });
  hull.box(2.0, 0.2, 0.18, { at: [0, 0.72, 2.82], c: 'darkSteel' });
  for (const x of [-0.45, 0.45]) hull.tube([x, 0.8, 2.88], [x, 1.32, 2.82], 0.03, 0.03, 6, { c: 'darkSteel' });
  hull.tube([-0.45, 1.32, 2.82], [0.45, 1.32, 2.82], 0.03, 0.03, 6, { c: 'darkSteel' });
  hull.add(tyrePiece(0.46, 0.28, 12, { rim: 0.6 }), { at: [0, 1.45, -2.66], rot: [0, -PI / 2, 0] });
  hull.box(2.0, 0.18, 0.14, { at: [0, 0.76, -2.56], c: 'darkSteel' });
  hull.add(cyl(0.05, 0.35, 8, { axis: 'z', caps: 'end', capMat: 'black' }), { at: [-1.0, 0.6, -2.5], c: 'darkSteel' });
  hull.box(1.6, 0.06, 1.3, { at: [0, 2.18, -1.6], c: 'darkSteel' });
  antenna(hull, [-0.8, 2.15, -2.25], 2.3);

  // --- roof hatch ring with small shield
  turret.add(cyl(0.48, 0.1, 12, { caps: 'end' }), { at: [0, 0.05, 0], c: 'paintS' });
  turret.add(cyl(0.045, 0.24, 6, { caps: 'none' }), { at: [0, 0.2, 0.08], c: 'gunmetal' });
  turret.box(0.62, 0.36, 0.04, { at: [0, 0.38, 0.42], rot: [-0.1, 0, 0] });
  turret.box(0.16, 0.12, 0.02, { at: [0.2, 0.47, 0.45], c: 'glass' });
  turret.mirrorX(() => turret.box(0.04, 0.3, 0.32, { at: [0.33, 0.36, 0.28], rot: [0, 0.3, 0] }));
  hmgGun(gun, spec.barrelLength, { r: spec.gunRadius });
  return { hull, turret, gun, emissive: em };
}

// ---------------------------------------------------------------------------
// Self-propelled anti-aircraft gun

// Parabolic dish facing +Z (both sides), radius r, depth d.
function dishPiece(r, d, seg = 12, o = {}) {
  const prof = [[0, d * 0.05], [r * 0.5, d * 0.3], [r, d]];
  const front = lathe(prof.map(([x, y]) => [x, -y]), seg, { crease: 70 });
  front.transform({ rot: [-PI / 2, 0, 0] }).setMat(o.c ?? 'paintS');
  const back = lathe(prof.map(([x, y]) => [x, -y - 0.03]).reverse(), seg, { crease: 70 });
  back.transform({ rot: [-PI / 2, 0, 0] }).setMat(o.back ?? 'paintS');
  back.flip();
  return front.append(back);
}

// Curved search-radar reflector (parabolic cylinder) w x h, facing +Z.
function reflectorPiece(w, h, depth, o = {}) {
  const P = new Piece();
  const nx = o.nx ?? 8;
  const pt = (i, y, back) => {
    const x = -w / 2 + (i / nx) * w;
    const z = depth * (2 * x / w) ** 2 - (back ? 0.04 : 0);
    return [x, y, z];
  };
  for (let i = 0; i < nx; i++) {
    const a = pt(i, -h / 2), b = pt(i + 1, -h / 2), c = pt(i + 1, h / 2), d = pt(i, h / 2);
    P.quadF(a, b, c, d, [0, 0, 1], o.c ?? 'paintS');
    const a2 = pt(i, -h / 2, 1), b2 = pt(i + 1, -h / 2, 1), c2 = pt(i + 1, h / 2, 1), d2 = pt(i, h / 2, 1);
    P.quadF(a2, b2, c2, d2, [0, 0, -1], o.back ?? 'paintS');
    P.quadF(a, b, b2, a2, [0, -1, 0], 'paintDark');
    P.quadF(d, c, c2, d2, [0, 1, 0], 'paintDark');
  }
  return P;
}

function spaagCoalition(spec) {
  const hull = new Part(), turret = new Part(), gun = new Part(), radar = new Part(), em = new Part();
  runningGear(hull, {
    offsetX: spec.tracks.offsetX, width: spec.tracks.width, wheelR: 0.33, beltT: 0.07,
    wheelZ: [2.5, 1.53, 0.56, -0.41, -1.38, -2.35],
    sprocket: [-3.35, 0.7, 0.31], idler: [3.3, 0.62, 0.29], seg: 10, skirtY: 0.7,
  });
  hull.prismX([[3.78, 1.06], [3.15, 0.45], [-3.45, 0.45], [-3.78, 0.85], [-3.78, 1.14], [3.6, 1.14]], -1.12, 1.12, { c: 'paintS' });
  hull.prismX([[3.8, 1.08], [3.8, 1.18], [2.75, 1.85], [-3.55, 1.85], [-3.78, 1.65], [-3.78, 1.14], [3.65, 1.14]], -1.68, 1.68);
  mirrorParts([hull, em], () => {
    for (let i = 0; i < 4; i++) hull.box(0.03, 0.46, 1.68, { at: [1.7, 0.93, 2.45 - i * 1.72], c: 'skirtRubber' });
    lamp(hull, em, [1.35, 1.42, 3.45], 'front', { w: 0.15, h: 0.12 });
    lamp(hull, em, [1.45, 1.55, -3.79], 'back', { w: 0.1, h: 0.1, lens: 'redLens', glow: 0xff2a14 });
    towHook(hull, [0.75, 0.95, 3.75]);
    towHook(hull, [0.8, 0.95, -3.78]);
    hull.box(0.55, 0.32, 1.1, { at: [1.35, 2.01, -2.6], c: 'paintS', noBottom: true });
  });
  louverPanel(hull, [0, 1.86, -2.5], 1.3, 1.4, { n: 6 });
  louverPanel(hull, [0, 1.12, -3.8], 1.6, 0.5, { n: 4, rot: [-PI / 2, 0, 0] });
  hatch(hull, [0.75, 1.85, 2.3], 0.3);
  for (const x of [0.6, 0.9]) hull.box(0.13, 0.07, 0.07, { at: [x, 1.88, 2.66], c: 'glass' });

  // --- turret: tall box with guns outboard, tracking radar at the front
  turret.add(cyl(1.0, 0.1, 16, { caps: 'none' }), { at: [0, 0.02, 0], c: 'black' });
  const B = [[0.55, 1.55], [1.02, 1.15], [1.04, -1.55], [0.8, -1.95], [-0.8, -1.95], [-1.04, -1.55], [-1.02, 1.15], [-0.55, 1.55]];
  const rr = (y, s, dz) => B.map(([x, z]) => [x * s, y, z > 0 ? z - dz : z + dz * 0.2]);
  turret.loft([rr(0.04, 1, 0), rr(0.95, 1, 0.12), rr(1.22, 0.92, 0.5)]);
  // trunnion housings on both sides
  turret.mirrorX(() => {
    turret.add(cyl(0.2, 0.18, 10, { axis: 'x' }), { at: [1.1, spec.gunPivot[1], spec.gunPivot[2]], c: 'paintS' });
    turret.box(0.12, 0.5, 1.2, { at: [1.08, 0.45, -0.85], c: 'paintS' });
  });
  // tracking radar dish on the front face
  turret.add(dishPiece(0.42, 0.12, 12), { at: [0, 0.92, 1.42] });
  turret.add(cyl(0.035, 0.32, 6, { axis: 'z' }), { at: [0, 0.92, 1.6], c: 'darkSteel' });
  turret.box(0.42, 0.3, 0.3, { at: [0, 0.92, 1.25], c: 'paintS' });
  // search radar mast up to the radar pivot
  const [rx, ry, rz] = spec.radarPivot;
  turret.add(cyl(0.2, 0.12, 10), { at: [rx, 1.28, rz], c: 'paintS' });
  turret.add(cyl(0.09, ry - 1.3, 8, { caps: 'none' }), { at: [rx, (ry + 1.3) / 2, rz], c: 'darkSteel' });
  for (const p of spec.smokeLaunchers) smokeBank(turret, [p[0] * 0.98, p[1], p[2]], Math.sign(p[0]), { rows: 2, cols: 2, yaw: 1.0, pitch: 0.5 });
  hatch(turret, [-0.45, 1.22, -0.55], 0.3);
  hatch(turret, [0.45, 1.22, -0.6], 0.28);
  turret.box(0.3, 0.22, 0.36, { at: [-0.5, 1.33, 0.25], c: 'paintS' });
  turret.box(0.22, 0.12, 0.02, { at: [-0.5, 1.34, 0.44], c: 'glass' });
  turret.box(1.6, 0.5, 0.35, { at: [0, 0.5, -2.05], c: 'paintS' });
  antenna(turret, [0.75, 1.22, -1.4], 2.2);

  // --- gun: twin 35 mm in external housings
  const ox = spec.twinGunOffsetX;
  gun.mirrorX(() => {
    gun.bbox(0.36, 0.48, 1.65, 0.05, { at: [ox, 0, -0.15], c: 'paint' });
    gunBarrel(gun, spec.barrelLength, [[0.065, 0.6], [0.045, 2.85], [0.062, 2.88]], { seg: 7, muzzleR: 0.062, boreR: 0.022, c: 'gunmetal', x: ox });
    gun.box(0.12, 0.1, 0.22, { at: [ox, 0.1, 0.9], c: 'paintS' });
  });
  radarSearch(radar, { w: 1.5, h: 0.48, depth: 0.16, y: 0.42, z: -0.05 });
  return { hull, turret, gun, radar, emissive: em };
}

function radarSearch(radar, o) {
  radar.add(cyl(0.18, 0.16, 10), { at: [0, 0.08, 0], c: 'paintS' });
  radar.box(0.12, o.y - 0.1, 0.12, { at: [0, (o.y + 0.1) / 2, o.z - 0.12], c: 'darkSteel' });
  radar.add(reflectorPiece(o.w, o.h, o.depth, {}), { at: [0, o.y, o.z] });
  radar.tube([0, o.y, o.z + 0.05], [0, o.y, o.z + 0.55], 0.025, 0.025, 4, { c: 'darkSteel' });
  radar.box(0.14, 0.1, 0.1, { at: [0, o.y, o.z + 0.58], c: 'paintS' });
}

function spaagFederation(spec) {
  const hull = new Part(), turret = new Part(), gun = new Part(), radar = new Part(), em = new Part();
  runningGear(hull, {
    offsetX: spec.tracks.offsetX, width: spec.tracks.width, wheelR: 0.34, beltT: 0.07,
    wheelZ: [2.45, 1.48, 0.51, -0.46, -1.43, -2.4],
    sprocket: [3.3, 0.68, 0.3], idler: [-3.32, 0.62, 0.29],
    rollers: [[1.95, 0.95, 0.08], [0.0, 0.95, 0.08], [-1.95, 0.95, 0.08]], seg: 10,
  });
  hull.prismX([[3.75, 1.08], [3.1, 0.45], [-3.45, 0.45], [-3.78, 0.8], [-3.78, 1.14], [3.6, 1.14]], -1.12, 1.12, { c: 'paintS' });
  hull.prismX([[3.8, 1.12], [3.55, 1.5], [2.6, 1.85], [-3.7, 1.85], [-3.8, 1.75], [-3.8, 1.12]], -1.66, 1.66);
  mirrorParts([hull, em], () => {
    hull.box(0.03, 0.4, 0.9, { at: [1.68, 0.92, 3.2], c: 'skirtRubber' });
    lamp(hull, em, [1.3, 1.48, 3.62], 'front', { w: 0.14, h: 0.12, housing: 'darkSteel' });
    lamp(hull, em, [1.45, 1.6, -3.81], 'back', { w: 0.08, h: 0.08, lens: 'redLens', glow: 0xff2a14 });
    towHook(hull, [0.75, 0.95, 3.72]);
    towHook(hull, [0.8, 0.92, -3.8]);
    for (const [z, l] of [[1.6, 1.0], [0.2, 1.2], [-1.3, 1.1], [-2.7, 1.0]]) hull.box(0.4, 0.34, l, { at: [1.45, 2.02, z], c: 'paintS', noBottom: true });
  });
  louverPanel(hull, [0, 1.86, -2.6], 1.5, 1.6, { n: 6 });
  louverPanel(hull, [0, 1.12, -3.81], 1.4, 0.45, { n: 4, rot: [-PI / 2, 0, 0] });
  hatch(hull, [0.7, 1.85, 2.15], 0.3);
  hull.box(0.3, 0.07, 0.07, { at: [0.7, 1.89, 2.5], c: 'glass' });

  // --- turret: large box, guns outboard, missile canisters above them
  turret.add(cyl(1.05, 0.1, 16, { caps: 'none' }), { at: [0, 0.02, 0], c: 'black' });
  const B = [[0.6, 1.45], [1.05, 1.1], [1.05, -1.6], [0.9, -1.85], [-0.9, -1.85], [-1.05, -1.6], [-1.05, 1.1], [-0.6, 1.45]];
  const rr = (y, s, dz) => B.map(([x, z]) => [x * s, y, z > 0 ? z - dz : z + dz * 0.2]);
  turret.loft([rr(0.04, 1, 0), rr(0.9, 1, 0.1), rr(1.18, 0.9, 0.38)]);
  turret.mirrorX(() => {
    turret.add(cyl(0.2, 0.18, 10, { axis: 'x' }), { at: [1.12, spec.gunPivot[1], spec.gunPivot[2]], c: 'paintS' });
    // 2x2 missile container pack
    turret.box(0.08, 0.5, 0.5, { at: [1.1, 1.3, -0.15], c: 'paintS' });
    for (const [dx, dy] of [[0, 0], [0.22, 0], [0, 0.22], [0.22, 0.22]]) {
      turret.add(cyl(0.1, 1.9, 8, { axis: 'z', caps: 'both', capMat: 'paintDark' }), { at: [1.28 + dx, 1.2 + dy, 0.25], c: 'paint' });
    }
  });
  // tracking radar at the front, search radar mount at the rear
  turret.add(dishPiece(0.48, 0.14, 12), { at: [0, 0.95, 1.35] });
  turret.add(cyl(0.035, 0.36, 6, { axis: 'z' }), { at: [0, 0.95, 1.55], c: 'darkSteel' });
  const [rx, ry, rz] = spec.radarPivot;
  turret.add(cyl(0.24, ry - 1.18, 10, { caps: 'end' }), { at: [rx, (ry + 1.18) / 2, rz], c: 'paintS' });
  for (const p of spec.smokeLaunchers) smokeBank(turret, [p[0] * 0.95, p[1], p[2] + 0.1], Math.sign(p[0]), { rows: 1, cols: 3, yaw: 0.9, pitch: 0.45 });
  hatch(turret, [-0.45, 1.18, -0.75], 0.3);
  turret.box(0.3, 0.24, 0.36, { at: [0.45, 1.3, 0.2], c: 'paintS' });
  turret.box(0.22, 0.14, 0.02, { at: [0.45, 1.32, 0.39], c: 'glass' });
  antenna(turret, [-0.8, 1.18, -1.5], 2.0);

  // --- gun: twin 2A38-style mounts, each with two superposed barrels
  const ox = spec.twinGunOffsetX;
  gun.mirrorX(() => {
    gun.box(0.32, 0.42, 1.4, { at: [ox, 0, -0.1], c: 'paint' });
    for (const dy of [-0.075, 0.075]) simpleBarrel(gun, [ox, dy], spec.barrelLength, 0.034, { z0: 0.5, brake: 0.2 });
    gun.box(0.06, 0.24, 0.06, { at: [ox, 0, 2.2], c: 'darkSteel' });
  });
  radarSearch(radar, { w: 1.7, h: 0.55, depth: 0.08, y: 0.45, z: 0.0 });
  return { hull, turret, gun, radar, emissive: em };
}

// ---------------------------------------------------------------------------
// Self-propelled howitzer

function spgCoalition(spec) {
  const hull = new Part(), turret = new Part(), gun = new Part(), em = new Part();
  runningGear(hull, {
    offsetX: spec.tracks.offsetX, width: spec.tracks.width, wheelR: 0.32, beltT: 0.07,
    wheelZ: [2.5, 1.68, 0.86, 0.04, -0.78, -1.6, -2.42],
    sprocket: [3.28, 0.7, 0.3], idler: [-3.3, 0.62, 0.29], seg: 10, skirtY: 0.68,
  });
  hull.prismX([[3.72, 1.06], [3.1, 0.45], [-3.4, 0.45], [-3.72, 0.85], [-3.72, 1.14], [3.6, 1.14]], -1.12, 1.12, { c: 'paintS' });
  hull.prismX([[3.75, 1.1], [3.75, 1.22], [2.55, 1.75], [-3.65, 1.75], [-3.75, 1.65], [-3.75, 1.14]], -1.68, 1.68);
  mirrorParts([hull, em], () => {
    const sk = [3.3, 2.0, 0.7, -0.6, -1.9, -3.4];
    for (let i = 0; i < sk.length - 1; i++) hull.box(0.06, 0.48, sk[i] - sk[i + 1] - 0.03, { at: [1.71, 0.93, (sk[i] + sk[i + 1]) / 2] });
    lamp(hull, em, [1.38, 1.4, 3.5], 'front', { w: 0.15, h: 0.12 });
    lamp(hull, em, [1.45, 1.5, -3.76], 'back', { w: 0.1, h: 0.1, lens: 'redLens', glow: 0xff2a14 });
    towHook(hull, [0.75, 0.95, 3.7]);
    towHook(hull, [0.8, 0.95, -3.74]);
  });
  // engine deck at the front (exhaust on the left per spec), driver's hatch
  louverPanel(hull, [0.0, 1.76, 2.05], 1.6, 0.9, { n: 5 });
  louverPanel(hull, [1.7, 1.42, 2.6], 0.36, 0.6, { n: 4, rot: [0, 0, -PI / 2] });
  hatch(hull, [-0.75, 1.75, 2.2], 0.3);
  hull.box(0.3, 0.07, 0.07, { at: [-0.75, 1.78, 2.55], c: 'glass' });
  // folded travel lock on the glacis
  const gl = Math.atan2(1.75 - 1.22, 3.75 - 2.55);
  hull.group({ at: [0, 1.22, 3.75], rot: [gl, 0, 0] }, () => {
    hull.box(0.08, 0.06, 0.9, { at: [0.3, 0.06, -0.6], c: 'darkSteel' });
    hull.box(0.08, 0.06, 0.9, { at: [-0.3, 0.06, -0.6], c: 'darkSteel' });
    hull.box(0.7, 0.1, 0.12, { at: [0, 0.08, -1.08], c: 'darkSteel' });
  });
  hull.box(1.2, 0.5, 0.12, { at: [0, 1.25, -3.78], c: 'paintS' });

  // --- turret: large flat-sided box set far back, gun at the front
  const B = [[0.7, 2.25], [1.55, 1.95], [1.6, -2.3], [1.45, -2.6], [-1.45, -2.6], [-1.6, -2.3], [-1.55, 1.95], [-0.7, 2.25]];
  const rr = (y, s, dz) => B.map(([x, z]) => [x * s, y, z > 0 ? z - dz : z]);
  turret.add(cyl(1.1, 0.1, 16, { caps: 'none' }), { at: [0, 0.02, 0], c: 'black' });
  turret.loft([rr(0.06, 1, 0), rr(1.0, 1, 0.08), rr(1.3, 0.95, 0.42)]);
  turret.mirrorX(() => {
    // side armour panels and stowage
    turret.box(0.06, 0.62, 3.0, { at: [1.62, 0.52, -0.55], c: 'paintS' });
    turret.box(0.2, 0.36, 0.9, { at: [1.72, 0.5, -1.7], c: 'paintS' });
    smokeBank(turret, [1.35, 1.05, 1.7], 1, { rows: 2, cols: 2, yaw: 0.6, pitch: 0.5 });
  });
  // commander's cupola + MG, sight, hatches, antennas
  turret.lathe([[0.38, 1.25], [0.38, 1.36], [0.36, 1.42], [0.3, 1.46], [0, 1.47]], 12, { mats: ['paintS', 'glass', 'paintS', 'paintS'], at: [-0.75, 0, -0.5] });
  machineGun(turret, [-0.75, 1.62, -0.45], { len: 0.65, scale: 0.8, post: 0.08 });
  turret.box(0.36, 0.26, 0.42, { at: [0.75, 1.42, 0.9], c: 'paintS' });
  turret.box(0.26, 0.14, 0.02, { at: [0.75, 1.44, 1.12], c: 'glass' });
  hatch(turret, [0.7, 1.29, -0.9], 0.3);
  turret.box(1.0, 0.06, 0.8, { at: [0, 1.32, -1.9], c: 'paintS', noBottom: true });
  antenna(turret, [1.3, 1.3, -2.3], 2.4);
  antenna(turret, [-1.3, 1.3, -2.3], 2.4);
  turret.box(2.4, 0.5, 0.06, { at: [0, 0.55, -2.63], c: 'paintS' });

  // --- gun: 155 mm with fume extractor and pepperpot muzzle brake
  gun.bbox(0.95, 0.72, 0.7, 0.06, { at: [0, 0, 0.2], c: 'paint' });
  gunBarrel(gun, spec.barrelLength, [
    [0.17, 0.5], [0.15, 2.1], [0.19, 2.2], [0.19, 3.05], [0.135, 3.15], [0.12, 5.55],
    [0.17, 5.6], [0.17, 5.8], [0.15, 5.84],
  ], { seg: 10, muzzleR: 0.17, boreR: 0.08, mats: { 7: 'black' } });
  return { hull, turret, gun, emissive: em };
}

function spgFederation(spec) {
  const hull = new Part(), turret = new Part(), gun = new Part(), em = new Part();
  runningGear(hull, {
    offsetX: spec.tracks.offsetX, width: spec.tracks.width, wheelR: 0.34, beltT: 0.07,
    wheelZ: [2.45, 1.65, 0.85, 0.05, -0.75, -1.55, -2.35],
    sprocket: [-3.3, 0.64, 0.3], idler: [3.25, 0.6, 0.28],
    rollers: [[1.25, 0.92, 0.075], [-0.35, 0.93, 0.075], [-1.95, 0.94, 0.075]], seg: 10, skirtY: 0.66,
  });
  hull.prismX([[3.7, 1.05], [3.1, 0.42], [-3.45, 0.42], [-3.75, 0.7], [-3.75, 1.12], [3.55, 1.12]], -1.08, 1.08, { c: 'paintS' });
  hull.prismX([[3.72, 1.08], [1.9, 1.75], [-3.55, 1.75], [-3.75, 1.62], [-3.75, 1.1], [3.6, 1.1]], -1.14, 1.14);
  mirrorParts([hull, em], (side) => {
    hull.box(0.64, 0.03, 7.0, { at: [1.45, 1.135, -0.15], c: 'paintS' });
    for (let i = 0; i < 4; i++) hull.box(0.03, 0.46, 1.72, { at: [1.76, 0.9, 2.55 - i * 1.75], c: 'skirtRubber' });
    const boxes = side > 0 ? [[1.0, 0.36, 2.2], [1.3, 0.4, 0.9], [1.2, 0.4, -0.5], [1.1, 0.36, -1.9]] : [[1.2, 0.4, 2.0], [1.4, 0.42, 0.6], [1.2, 0.4, -0.8], [1.0, 0.36, -2.2]];
    for (const [l, hgt, z] of boxes) hull.box(0.55, hgt, l, { at: [1.45, 1.15 + hgt / 2, z], c: 'paintS', noBottom: true });
    lamp(hull, em, [1.35, 1.28, 3.45], 'front', { w: 0.13, h: 0.11, housing: 'darkSteel' });
    lamp(hull, em, [1.5, 1.3, -3.77], 'back', { w: 0.1, h: 0.08, lens: 'redLens', glow: 0xff2a14 });
    towHook(hull, [0.7, 0.68, 3.55]);
    towHook(hull, [0.75, 0.7, -3.76]);
  });
  const gl = Math.atan2(1.75 - 1.08, 3.72 - 1.9);
  hull.group({ at: [0, 1.08, 3.72], rot: [gl, 0, 0] }, () => {
    hull.box(1.9, 0.06, 0.06, { at: [0, 0.05, -0.5], c: 'paintS' });
    hull.box(1.9, 0.06, 0.06, { at: [0, 0.05, -1.1], c: 'paintS' });
  });
  hull.add(prismX([[3.55, 0.5], [3.92, 0.7], [3.92, 0.78], [3.48, 0.64]], -1.05, 1.05), { c: 'paintS' });
  hatch(hull, [0, 1.75, 1.95], 0.3);
  hull.box(0.22, 0.08, 0.08, { at: [0, 1.76, 2.28], c: 'glass' });
  louverPanel(hull, [0, 1.76, -2.85], 1.8, 1.1, { n: 6 });
  louverPanel(hull, [1.15, 1.32, 2.6], 0.36, 0.5, { n: 3, rot: [0, 0, -PI / 2] });

  // --- turret: massive box overhanging the tracks
  const B = [[0.75, 2.2], [1.6, 1.85], [1.62, -2.0], [1.5, -2.3], [-1.5, -2.3], [-1.62, -2.0], [-1.6, 1.85], [-0.75, 2.2]];
  const rr = (y, s, dz) => B.map(([x, z]) => [x * s, y, z > 0 ? z - dz : z]);
  turret.add(cyl(1.08, 0.1, 16, { caps: 'none' }), { at: [0, 0.02, 0], c: 'black' });
  turret.loft([rr(0.06, 1, 0), rr(1.05, 1, 0.12), rr(1.35, 0.94, 0.55)]);
  turret.mirrorX(() => {
    turret.box(0.2, 0.42, 1.5, { at: [1.7, 0.55, -0.9], c: 'paintS' });
    turret.box(0.2, 0.32, 0.8, { at: [1.7, 0.5, 0.55], c: 'paintS' });
  });
  for (const sx of [1, -1]) smokeBank(turret, [sx * 1.3, 1.1, 1.6], sx, { rows: 1, cols: 3, yaw: 0.6, pitch: 0.5 });
  turret.lathe([[0.4, 1.3], [0.4, 1.44], [0.38, 1.5], [0.3, 1.54], [0, 1.55]], 12, { mats: ['paintS', 'glass', 'paintS', 'paintS'], at: [-0.8, 0, -0.4] });
  turret.box(0.12, 0.2, 0.12, { at: [-0.65, 1.65, -0.45], c: 'darkSteel' });
  machineGun(turret, [-0.8, 1.78, -0.35], { len: 1.0 });
  turret.box(0.36, 0.3, 0.42, { at: [0.8, 1.48, 0.7], c: 'paintS' });
  turret.box(0.26, 0.16, 0.02, { at: [0.8, 1.5, 0.92], c: 'glass' });
  hatch(turret, [0.75, 1.35, -0.85], 0.3);
  turret.box(2.6, 0.55, 0.42, { at: [0, 0.6, -2.5], c: 'paintS' });
  antenna(turret, [1.2, 1.35, -1.9], 2.3);

  // --- gun: 152 mm with fume extractor and big double-baffle muzzle brake
  gun.lathe([[0.42, 0.1], [0.36, 0.42], [0.22, 0.72]], 12, { axis: 'z', mats: ['canvas2', 'canvas2'] });
  gun.box(0.5, 0.3, 0.6, { at: [0, -0.32, 0.4], c: 'paintS' });
  gunBarrel(gun, spec.barrelLength, [
    [0.17, 0.6], [0.15, 2.4], [0.2, 2.5], [0.2, 3.25], [0.13, 3.35], [0.12, 5.4],
    [0.2, 5.45], [0.2, 5.72], [0.14, 5.76],
  ], { seg: 10, muzzleR: 0.2, boreR: 0.08, mats: { 7: 'black' } });
  return { hull, turret, gun, emissive: em };
}

// ---------------------------------------------------------------------------
// MLRS truck: hull = truck, turret = rotating launcher base, gun = rocket pod

function truckChassis(hull, spec, o = {}) {
  const tyreW = wheelSet(hull, spec, { w: 0.4, rim: 0.55, seg: 14 });
  // frame rails, cross members, fuel tank, battery box
  hull.mirrorX(() => hull.box(0.14, 0.28, 7.2, { at: [0.48, 0.92, -0.2], c: 'darkSteel' }));
  for (const z of [3.2, 1.2, -0.3, -1.7, -3.3]) hull.box(1.0, 0.14, 0.12, { at: [0, 0.92, z], c: 'darkSteel' });
  hull.add(cyl(0.26, 1.0, 10, { axis: 'z' }), { at: [0.82, 0.85, 0.75], c: o.tankMat ?? 'paintS' });
  hull.box(0.4, 0.42, 0.5, { at: [-0.82, 0.88, 0.7], c: 'paintS' });
  // rear axle housings and mud flaps
  for (const z of spec.wheels.positionsZ) hull.add(cyl(0.11, 2.0, 8, { axis: 'x', caps: 'none' }), { at: [0, spec.wheels.radius, z], c: 'darkSteel' });
  hull.mirrorX(() => {
    hull.box(0.42, 0.45, 0.02, { at: [1.05, 0.62, -3.1], c: 'rubber' });
  });
  return tyreW;
}

function mlrsCoalition(spec) {
  const hull = new Part(), turret = new Part(), gun = new Part(), em = new Part();
  truckChassis(hull, spec);
  // armoured forward-control cab over the front axle
  cabin(hull, [[1.05, 1.2, 3.72, 2.3], [2.15, 1.2, 3.72, 2.3], [3.0, 1.12, 3.32, 2.36]], { chamfer: 0.08 });
  const ws = (t, x) => [x, 2.2 + t * 0.72, 3.71 - t * 0.38];
  pane(hull, ws(0.05, 1.0), ws(0.05, 0.05), ws(0.95, 0.05), ws(0.95, 0.95), [0, 0.47, 0.88]);
  pane(hull, ws(0.05, -0.05), ws(0.05, -1.0), ws(0.95, -0.95), ws(0.95, -0.05), [0, 0.47, 0.88]);
  for (const sx of [1, -1]) {
    const lo = (z) => [sx * 1.2, 2.25, z], hi = (z) => [sx * 1.15, 2.85, z];
    pane(hull, lo(3.4), lo(2.75), hi(2.75), hi(3.3), [sx, 0.1, 0]);
  }
  mirrorParts([hull, em], () => {
    // front fenders, steps, mirrors, lights
    hull.prismX([[3.32, 1.25], [3.25, 1.42], [2.15, 1.42], [2.05, 1.2]], 0.86, 1.28, { c: 'black' });
    hull.box(0.3, 0.06, 0.3, { at: [1.1, 0.75, 2.15], c: 'darkSteel' });
    hull.tube([1.18, 2.5, 3.5], [1.3, 2.55, 3.55], 0.02, 0.02, 4, { c: 'black' });
    hull.box(0.05, 0.4, 0.22, { at: [1.32, 2.45, 3.55], c: 'black' });
    lamp(hull, em, [0.95, 1.3, 3.78], 'front', { w: 0.2, h: 0.14, housing: 'darkSteel' });
    lamp(hull, em, [1.05, 1.1, -3.6], 'back', { w: 0.12, h: 0.1, lens: 'redLens', glow: 0xff2a14 });
    towHook(hull, [0.55, 0.85, 3.9]);
    for (const z of [3.2, 2.55]) hull.box(0.015, 0.95, 0.025, { at: [1.205, 1.8, z], c: 'black' });
  });
  hull.box(2.2, 0.28, 0.2, { at: [0, 0.95, 3.84], c: 'darkSteel' });
  hull.box(1.5, 0.5, 0.04, { at: [0, 1.6, 3.73], c: 'black' });
  for (let i = 0; i < 4; i++) hull.box(1.46, 0.03, 0.03, { at: [0, 1.42 + i * 0.12, 3.75], c: 'paintDark' });
  hatch(hull, [-0.4, 3.0, 2.85], 0.3);
  // exhaust stack behind the cab (spec point)
  hull.add(cyl(0.07, 1.3, 8, { caps: 'none' }), { at: [-0.95, 1.95, 2.2], c: 'darkSteel' });
  hull.tube([-0.95, 2.6, 2.2], [-0.95, 2.75, 2.35], 0.07, 0.07, 8, { c: 'black' });
  // launcher deck
  hull.box(2.3, 0.12, 5.6, { at: [0, 1.3, -0.95], c: 'paintS' });
  hull.box(2.1, 0.28, 0.25, { at: [0, 1.12, -3.75], c: 'darkSteel' });
  hull.mirrorX(() => hull.box(0.25, 0.5, 0.25, { at: [0.95, 0.85, -3.6], c: 'darkSteel' }));
  antenna(hull, [1.0, 3.0, 2.5], 2.2);

  // --- launcher base: turntable and trunnion brackets
  turret.add(cyl(0.95, 0.14, 16), { at: [0, -0.12, 0], c: 'paintS' });
  const [, gy, gz] = spec.gunPivot;
  turret.mirrorX(() => {
    turret.prismX([[gz - 0.35, -0.05], [gz + 0.45, -0.05], [gz + 0.1, gy + 0.12], [gz - 0.2, gy + 0.12]], 1.08, 1.2);
    turret.add(cyl(0.1, 0.16, 8, { axis: 'x' }), { at: [1.16, gy, gz], c: 'darkSteel' });
  });
  turret.box(1.2, 0.18, 0.5, { at: [0, 0.0, 0.9], c: 'paintS' });

  // --- rocket pod (two six-round pods in the launcher cage)
  const [pw, ph, pl] = spec.podSize;
  gun.box(pw, ph, pl, { at: [0, 0, pl / 2], c: 'paint' });
  gun.mirrorX(() => {
    for (const z of [0.4, 1.8, 3.2]) gun.box(0.05, ph + 0.04, 0.1, { at: [pw / 2 + 0.02, 0, z], c: 'paintS', noTop: true, noBottom: true });
    gun.box(0.06, 0.08, pl - 0.1, { at: [pw / 2 + 0.02, ph / 2 - 0.02, pl / 2], c: 'paintS' });
  });
  gun.box(pw - 0.04, 0.06, 0.06, { at: [0, ph / 2 - 0.02, pl - 0.04], c: 'paintDark' });
  gun.box(0.05, ph - 0.06, 0.03, { at: [0, 0, pl - 0.015], c: 'paintDark' });
  tubeMouths(gun, spec, { r: 0.1, ring: 0.125, cover: 'canvas' });
  return { hull, turret, gun, emissive: em };
}

// Tube mouths on the pod's +Z face (gun space), centred grid from the spec.
function tubeMouths(gun, spec, o) {
  const { cols, rows, spacing } = spec.tubes;
  const L = spec.barrelLength;
  const ring = [], inner = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    ring.push([Math.cos(a) * o.ring, Math.sin(a) * o.ring, 0]);
    inner.push([Math.cos(a) * o.r, Math.sin(a) * o.r, 0.002]);
  }
  const P = new Piece();
  if (o.rim) for (let k = 0; k < 8; k++) P.quadF(ring[k], ring[(k + 1) % 8], inner[(k + 1) % 8], inner[k], [0, 0, 1], 'paintDark');
  for (let k = 1; k < 7; k++) P.triF(inner[0], inner[k], inner[k + 1], [0, 0, 1], o.cover ?? 'black');
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      gun.add(P, { at: [(c - (cols - 1) / 2) * spacing, (r - (rows - 1) / 2) * spacing, L - 0.002] });
    }
  }
}

function mlrsFederation(spec) {
  const hull = new Part(), turret = new Part(), gun = new Part(), em = new Part();
  truckChassis(hull, spec);
  // bonnet with rounded wide fenders, cab behind it
  hullLoft(hull, [
    [3.75, [[0.62, 1.05], [0.62, 1.72], [0.5, 1.82], [0, 1.83]]],
    [2.3, [[0.66, 1.05], [0.66, 1.86], [0.54, 1.96], [0, 1.97]]],
  ]);
  mirrorParts([hull, em], () => {
    hull.loft([
      [[0.62, 1.05, 3.7], [1.25, 1.05, 3.6], [1.25, 1.5, 3.45], [0.62, 1.55, 3.55]],
      [[0.62, 1.05, 2.0], [1.25, 1.05, 2.0], [1.25, 1.55, 2.0], [0.62, 1.6, 2.0]],
    ], { c: 'paint' });
    lamp(hull, em, [0.95, 1.6, 3.4], 'front', { w: 0.16, h: 0.14, housing: 'darkSteel' });
    lamp(hull, em, [1.0, 1.15, -3.62], 'back', { w: 0.1, h: 0.1, lens: 'redLens', glow: 0xff2a14 });
    hull.tube([1.15, 2.45, 2.25], [1.3, 2.5, 2.3], 0.02, 0.02, 4, { c: 'black' });
    hull.box(0.05, 0.36, 0.2, { at: [1.32, 2.4, 2.3], c: 'black' });
    hull.box(0.3, 0.06, 0.3, { at: [1.12, 0.78, 1.65], c: 'darkSteel' });
    hull.box(0.015, 0.9, 0.025, { at: [1.125, 1.72, 1.28], c: 'black' });
  });
  hull.box(1.2, 0.55, 0.04, { at: [0, 1.4, 3.77], c: 'black' });
  for (let i = 0; i < 7; i++) hull.box(0.03, 0.5, 0.03, { at: [-0.45 + i * 0.15, 1.4, 3.79], c: 'paintDark' });
  hull.box(2.3, 0.26, 0.2, { at: [0, 0.92, 3.85], c: 'darkSteel' });
  cabin(hull, [[1.05, 1.15, 2.3, 1.0], [2.0, 1.15, 2.3, 1.0], [2.75, 1.08, 2.18, 1.04]], { chamfer: 0.06 });
  const ws = (t, x) => [x, 2.05 + t * 0.62, 2.29 - t * 0.1];
  pane(hull, ws(0.05, 1.0), ws(0.05, 0.06), ws(0.92, 0.06), ws(0.92, 0.95), [0, 0.16, 0.99]);
  pane(hull, ws(0.05, -0.06), ws(0.05, -1.0), ws(0.92, -0.95), ws(0.92, -0.06), [0, 0.16, 0.99]);
  for (const sx of [1, -1]) {
    const lo = (z) => [sx * 1.15, 2.1, z], hi = (z) => [sx * 1.1, 2.62, z];
    pane(hull, lo(2.15), lo(1.45), hi(1.45), hi(2.08), [sx, 0.1, 0]);
  }
  // exhaust stack at the cab's front corner (spec point), spare wheel behind the cab
  hull.add(cyl(0.07, 1.5, 8, { caps: 'none' }), { at: [-0.9, 1.95, 2.42], c: 'darkSteel' });
  hull.tube([-0.9, 2.7, 2.42], [-0.9, 2.85, 2.3], 0.07, 0.07, 8, { c: 'black' });
  hull.add(tyrePiece(0.55, 0.38, 12, { rim: 0.55 }), { at: [0, 1.9, 0.82], rot: [0, PI / 2, 0] });
  hull.box(2.25, 0.12, 5.0, { at: [0, 1.3, -1.25], c: 'paintS' });
  hull.box(2.1, 0.28, 0.25, { at: [0, 1.12, -3.75], c: 'darkSteel' });
  hull.mirrorX(() => {
    hull.box(0.3, 0.55, 0.3, { at: [0.95, 0.85, -3.55], c: 'darkSteel' });
    hull.box(0.35, 0.3, 1.0, { at: [1.0, 1.52, -0.25], c: 'paintS' });
  });
  antenna(hull, [0.9, 2.75, 1.2], 2.2);

  // --- launcher base: turntable with elevating cradle supports and sight
  turret.add(cyl(0.9, 0.14, 16), { at: [0, -0.12, 0], c: 'paintS' });
  const [, gy, gz] = spec.gunPivot;
  turret.mirrorX(() => {
    turret.prismX([[gz - 0.3, -0.05], [gz + 0.5, -0.05], [gz + 0.1, gy + 0.1], [gz - 0.2, gy + 0.1]], 1.0, 1.12);
    turret.add(cyl(0.09, 0.14, 8, { axis: 'x' }), { at: [1.08, gy, gz], c: 'darkSteel' });
  });
  turret.box(0.3, 0.45, 0.3, { at: [-0.75, 0.22, 0.4], c: 'paintS' });
  turret.box(0.12, 0.14, 0.2, { at: [-0.75, 0.52, 0.45], c: 'glass' });

  // --- tube bundle: rows x cols open tubes held by frames
  const { cols, rows, spacing } = spec.tubes;
  const L = spec.barrelLength;
  const tubeR = spacing * 0.42;
  const t = cyl(tubeR, L, 6, { axis: 'z', caps: 'end', capMat: 'black' });
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      gun.add(t, { at: [(c - (cols - 1) / 2) * spacing, (r - (rows - 1) / 2) * spacing, L / 2], c: 'paintPlain' });
    }
  }
  const fw = cols * spacing + 0.08, fh = rows * spacing + 0.08;
  for (const z of [0.35, L - 0.35]) {
    gun.box(fw, 0.05, 0.14, { at: [0, fh / 2, z], c: 'paintS' });
    gun.box(fw, 0.05, 0.14, { at: [0, -fh / 2, z], c: 'paintS' });
    gun.mirrorX(() => gun.box(0.05, fh, 0.14, { at: [fw / 2, 0, z], c: 'paintS', noTop: true, noBottom: true }));
  }
  gun.box(0.5, 0.12, L * 0.8, { at: [0, -fh / 2 - 0.08, L * 0.42], c: 'paintS' });
  return { hull, turret, gun, emissive: em };
}

const BUILDERS = {
  mbt: [mbtCoalition, mbtFederation],
  ifv: [ifvCoalition, ifvFederation],
  apc: [apcCoalition, apcFederation],
  scout: [scoutCoalition, scoutFederation],
  spaag: [spaagCoalition, spaagFederation],
  spg: [spgCoalition, spgFederation],
  mlrs: [mlrsCoalition, mlrsFederation],
};

export function buildGroundParts(type, faction) {
  const spec = VEHICLE_SPECS[type];
  if (!spec) throw new Error(`models: unknown vehicle type '${type}'`);
  const b = BUILDERS[type];
  if (!b) throw new Error(`models: no builder for '${type}'`);
  return b[faction ? 1 : 0](spec);
}

export const GROUND_TYPES = Object.keys(VEHICLE_SPECS);
