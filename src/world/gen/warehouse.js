// Zone type 'warehouse': tall storage halls spanning two levels. Aisles of pallet racking under
// high-bay lamps, a loading dock wall with closed roll-up doors, staging lanes, painted floor
// lines, sometimes a steel mezzanine - and sometimes nothing but columns.
import { defineZone } from '../zonetypes.js';
import { CF, M, ceilingLight, facing, env } from './common.js';
import { tbox, bar, rod, floorLine, keepClearMask, lightState, rectClear } from './a_common.js';

function whParams(zone, rng, ctx) {
  const variant = rng.weighted([['racks', 5], ['bulk', 2], ['empty', 1.6], ['mezz', 2.6]]);
  const ceilH = rng.pick([9.6, 10.2, 10.5, 10.8]);
  const dark = rng.chance(variant === 'empty' ? 0.3 : 0.12);
  const levels = rng.pick([3, 3, 4, 4, 5]);
  const p = {
    variant,
    wallMat: rng.weighted([[M.cmu, 3], [M.concrete, 3], [M.paint_dirty, 1], [M.cmu_green, 0.6]]),
    floorMat: rng.weighted([[M.concrete_floor, 4], [M.a_epoxy, 2.5], [M.concrete, 0.8]]),
    ceilMat: M.a_deck,
    ceilH,
    rackH: Math.min(ceilH - 2.1, rng.pick([6.0, 6.8, 7.5, 8.2])),
    levels,
    upright: rng.weighted([[M.rack_blue, 4], [M.rack_orange, 1], [M.metal_dark, 1.2]]),
    beam: rng.weighted([[M.rack_orange, 5], [M.rack_blue, 1]]),
    colMat: rng.weighted([[M.metal_dark, 3], [M.rack_blue, 1], [M.concrete, 1.5]]),
    fullness: variant === 'empty' ? 0 : rng.range(0.45, 0.92),
    fail: dark ? 0.85 : variant === 'empty' ? rng.range(0.55, 0.85) : rng.range(0.06, 0.28),
    flicker: rng.range(0.03, 0.1),
    dark,
    ambient: dark ? [0.07, 0.07, 0.075] : [0.11, 0.11, 0.12],
  };
  const fogC = dark ? [0.05, 0.055, 0.06] : [0.15, 0.155, 0.165];
  p.env = env({ fog: fogC, fogNear: 6, fogFar: dark ? 30 : 46, hum: 0.2, hvac: 0.35, reverb: 'warehouse', tone: 'industrial' });
  return p;
}

// Local frame: u runs along the dock wall, v away from it into the hall. u maps to +x or +z.
function makeFrame(zb, side) {
  const { x0, z0, x1, z1 } = zb;
  const alongX = side === 'N' || side === 'S';
  const U = alongX ? x1 - x0 : z1 - z0, V = alongX ? z1 - z0 : x1 - x0;
  const pt = (u, v) => {
    switch (side) {
      case 'N': return [x0 + u, z0 + v];
      case 'S': return [x0 + u, z1 - v];
      case 'W': return [x0 + v, z0 + u];
      default: return [x1 - v, z0 + u];
    }
  };
  const rect = (u0, v0, u1, v1) => {
    const a = pt(u0, v0), b = pt(u1, v1);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  };
  const dv = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[side];
  const du = alongX ? [1, 0] : [0, 1];
  const axisU = alongX ? 'x' : 'z';
  return { side, U, V, pt, rect, dv, du, axisU };
}

// local-frame drawing helpers
function helpers(zb, F, keep) {
  return {
    F,
    B: (u0, y0, v0, u1, y1, v1, mat, o) => { const q = F.rect(u0, v0, u1, v1); bar(zb, q[0], y0, q[1], q[2], y1, q[3], mat, o); },
    TB: (u0, y0, v0, u1, y1, v1, sideM, top, tu, tv, o) => { const q = F.rect(u0, v0, u1, v1); tbox(zb, q[0], y0, q[1], q[2], y1, q[3], sideM, top, tu, tv, o); },
    free: (u0, v0, u1, v1) => { const q = F.rect(u0, v0, u1, v1); return rectClear(zb, keep, q[0], q[1], q[2], q[3]); },
    P: (type, u, y, v, rot, opts) => { const [x, z] = F.pt(u, v); return zb.prop(type, x, y, z, rot, opts); },
    rotFor: (du, dv) => facing(F.du[0] * du + F.dv[0] * dv, F.du[1] * du + F.dv[1] * dv),
  };
}
// the same frame mirrored across the hall (u' = U - u)
function mirrorFrame(F) {
  return { ...F, pt: (u, v) => F.pt(F.U - u, v), rect: (u0, v0, u1, v1) => F.rect(F.U - u1, v0, F.U - u0, v1), du: [-F.du[0], -F.du[1]], mirrored: true };
}

function genWarehouse(zb, world) {
  const p = zb.params, r = zb.rng;
  const keep = keepClearMask(zb, world, 5, 2);
  const longX = zb.w >= zb.d;
  const side = r.chance(0.7) ? (longX ? r.pick(['N', 'S']) : r.pick(['W', 'E'])) : r.pick(['N', 'S', 'W', 'E']);
  const F = makeFrame(zb, side);
  const H = p.ceilH;
  const ctx = { zb, r, p, F, keep, H, lightsAt: [] };
  // helpers in the local frame
  Object.assign(ctx, helpers(zb, F, keep));

  const dockDepth = F.V >= 44 ? r.int(10, 13) : F.V >= 36 ? 9 : 7;
  ctx.dockDepth = dockDepth;
  ceilingStructure(ctx);
  dockWall(ctx);
  let rackRegion = { u0: 0, u1: F.U, v0: dockDepth, v1: F.V - 3.5 };
  if (p.variant === 'mezz') rackRegion = mezzanine(ctx, rackRegion) || rackRegion;
  if (p.variant === 'racks' || p.variant === 'mezz') rackRows(ctx, rackRegion, false);
  else if (p.variant === 'bulk') { rackRows(ctx, rackRegion, true); }
  else emptyHall(ctx);
  staging(ctx);
  columns(ctx);
  hallLights(ctx);
  wallDressing(ctx);
  upperLiner(ctx);
  jambCovers(ctx);
  // layout summary (handy for tools / debugging)
  zb.aInfo = {
    side, variant: p.variant,
    aisles: (ctx.aisles || []).map((u) => F.pt(u, dockDepth + 3)),
    staging: F.pt(F.U / 2, dockDepth / 2),
    mezz: ctx.mezz ? { stairFoot: ctx.mezz.F.pt(ctx.mezz.mD + ctx.mezz.run + 0.8, ctx.mezz.sv + 0.5), deck: ctx.mezz.F.pt(ctx.mezz.mD / 2, (ctx.mezz.va + ctx.mezz.vb) / 2), under: ctx.mezz.F.pt(ctx.mezz.mD - 0.8, ctx.mezz.vb - 1), h: ctx.mezz.mh } : null,
  };
}

// Wall posts at the edges of border openings take one material for all faces, so beside a
// yellow neighbour they show up as 6 m tall wallpaper strips inside the hall: sleeve them.
function jambCovers(c) {
  const { zb, p } = c;
  for (const g of zb.gates) {
    if (!g.first) continue;
    let a, b;
    if (g.side === 'W' || g.side === 'E') { const x = g.side === 'W' ? zb.x0 : zb.x1; a = [x, g.z]; b = [x, g.z + g.w]; }
    else { const z = g.side === 'N' ? zb.z0 : zb.z1; a = [g.x, z]; b = [g.x + g.w, z]; }
    for (const [vx, vz] of [a, b]) zb.box(vx - 0.112, 0, vz - 0.112, vx + 0.112, 5.95, vz + 0.112, p.wallMat, { collide: false, skip: 4 | 8 });
  }
}

// The upper half of the hall's perimeter (above the level line) belongs to the claimed level
// above, which is lit by nothing. A thin liner in front of it is baked with this zone's lamps.
function upperLiner(c) {
  const { zb, H, p } = c;
  const { x0, z0, x1, z1 } = zb;
  const t = 0.115, y0 = 5.9;
  bar(zb, x0 + 0.1, y0, z0 + 0.1, x1 - 0.1, H, z0 + t, p.wallMat, { sub: 1.6, skip: 1 | 2 | 4 | 8 | 32, collide: false });
  bar(zb, x0 + 0.1, y0, z1 - t, x1 - 0.1, H, z1 - 0.1, p.wallMat, { sub: 1.6, skip: 1 | 2 | 4 | 8 | 16, collide: false });
  bar(zb, x0 + 0.1, y0, z0 + 0.1, x0 + t, H, z1 - 0.1, p.wallMat, { sub: 1.6, skip: 2 | 4 | 8 | 16 | 32, collide: false });
  bar(zb, x1 - t, y0, z0 + 0.1, x1 - 0.1, H, z1 - 0.1, p.wallMat, { sub: 1.6, skip: 1 | 4 | 8 | 16 | 32, collide: false });
}

// ------------------------------------------------------------------ roof structure
function ceilingStructure(c) {
  const { zb, F, H, r } = c;
  // open-web joists along u every ~2.4 m, girders along v on the column lines
  const js = r.pick([2.2, 2.4, 2.8]);
  for (let v = js; v < F.V - 0.5; v += js) c.B(0.1, H - 0.42, v - 0.05, F.U - 0.1, H, v + 0.05, M.metal_dark, { sub: 4, skip: 4 });
  c.colU = [];
  const cs = c.p.variant === 'empty' ? r.pick([9, 10, 12]) : r.pick([16, 18, 20, 24]);
  const n = Math.max(1, Math.round(F.U / cs));
  for (let k = 1; k < n; k++) c.colU.push(Math.round((k * F.U) / n));
  for (const u of c.colU) c.B(u - 0.15, H - 0.75, 0.1, u + 0.15, H - 0.42, F.V - 0.1, M.metal_dark, { sub: 4, skip: 4 });
  // dark skylights
  if (r.chance(0.55)) {
    for (let v = 6; v < F.V - 4; v += r.pick([10, 12])) for (let u = 6; u < F.U - 4; u += r.pick([10, 12, 14])) {
      const [x, z] = F.pt(u, v);
      zb.decal(x, H, z, 'down', 1.6, 2.6, 'window_dark', { lit: false, glow: 0.18 });
    }
  }
}

// ------------------------------------------------------------------ loading dock
function dockWall(c) {
  const { zb, F, r, p } = c;
  const doors = [];
  const dw = r.pick([2.8, 3.0, 3.2]), dh = r.pick([3.0, 3.3, 3.6]);
  const pitch = r.pick([4.2, 4.6, 5.2]);
  const gateU = zb.gates.filter((g) => g.side === F.side).map((g) => (F.axisU === 'x' ? g.x : g.z) - (F.axisU === 'x' ? zb.x0 : zb.z0));
  let num = r.int(1, 12);
  for (let u = 3 + dw / 2; u < F.U - 3 - dw / 2; u += pitch) {
    if (gateU.some((g) => Math.abs(g + 0.5 - u) < dw / 2 + 2.2)) continue;
    doors.push({ u, num: num++ });
  }
  c.doors = doors;
  const face = { N: 'pz', S: 'nz', W: 'px', E: 'nx' }[F.side];
  const wallV = 0.1;
  for (const d of doors) {
    const [x, z] = F.pt(d.u, wallV);
    zb.decal(x, dh / 2, z, face, dw, dh, 'a_rolldoor');
    // rubber dock seal around the opening
    const s0 = d.u - dw / 2, s1 = d.u + dw / 2;
    c.B(s0 - 0.28, 0, 0.1, s0, dh + 0.3, 0.38, M.rubber, { collide: true });
    c.B(s1, 0, 0.1, s1 + 0.28, dh + 0.3, 0.38, M.rubber, { collide: true });
    c.B(s0 - 0.28, dh, 0.1, s1 + 0.28, dh + 0.3, 0.38, M.rubber, { collide: false });
    // dock leveller plate + hazard edges
    const [lx, lz] = F.pt(d.u, 0.1 + 1.25);
    zb.decal(lx, 0.002, lz, 'up', 2.1, 2.5, 'metal_plate', { rot: F.axisU === 'x' ? 0 : Math.PI / 2 });
    for (const s of [-1, 1]) {
      const [hx, hz] = F.pt(d.u + s * 1.12, 0.1 + 1.25);
      zb.decal(hx, 0.004, hz, 'up', 0.14, 2.5, 'hazard', { rot: F.axisU === 'x' ? 0 : Math.PI / 2 });
    }
    // number above the door
    const label = String(d.num).padStart(2, '0');
    const sgn = F.side === 'N' || F.side === 'E' ? 1 : -1;
    for (let k = 0; k < 2; k++) {
      const [nx, nz] = F.pt(d.u + (k - 0.5) * 0.36 * sgn, wallV);
      zb.decal(nx, dh + 0.85, nz, face, 0.32, 0.46, 'digit_' + label[k]);
    }
    // controls and a swing-arm lamp
    const side = r.sign();
    const [cx, cz] = F.pt(d.u + side * (dw / 2 + 0.75), wallV);
    zb.decal(cx, 1.4, cz, face, 0.34, 0.5, 'a_breaker');
    if (r.chance(0.7)) c.P('a_docklight', d.u - side * (dw / 2 + 0.5), 2.5, wallV + 0.02, c.rotFor(0, 1), { on: r.chance(p.dark ? 0.25 : 0.4), ang: -side * 0.5, len: 0.9 });
    if (r.chance(0.5)) {
      for (const s of [-1, 1]) c.P('a_bollard', d.u + s * (dw / 2 + 0.35), 0, wallV + 0.6, 0, {});
    }
  }
  // a sign over the dock and safety posters
  const spots = [r.range(2, F.U - 2), r.range(2, F.U - 2)];
  const [sx, sz] = F.pt(spots[0], wallV);
  zb.decal(sx, 5.2, sz, face, 1.4, 1.4, r.pick(['a_sign_dock', 'a_sign_forklift', 'a_sign_hardhat']));
  void spots;
}

// ------------------------------------------------------------------ racking
function rackRows(c, reg, bulk) {
  const { F, r, p } = c;
  const aisle = r.range(3.0, 3.6), dd = 2.4, sd = 1.1, walk = r.range(1.8, 2.6);
  const rows = [];
  let u = reg.u0 + walk;
  if (bulk) {
    // single rack rows along both side walls, floor stacks in between
    rows.push({ u0: u, u1: u + sd, face: [1] });
    rows.push({ u0: reg.u1 - walk - sd, u1: reg.u1 - walk, face: [-1] });
  } else {
    if (r.chance(0.7)) { rows.push({ u0: u, u1: u + sd, face: [1] }); u += sd + aisle; }
    while (u + dd + aisle + 1.2 <= reg.u1 - walk) { rows.push({ u0: u, u1: u + dd, face: [-1, 1] }); u += dd + aisle; }
    if (u + sd <= reg.u1 - walk + 0.3) rows.push({ u0: u, u1: u + sd, face: [-1] });
  }
  // cross aisles split the run along v
  const span = reg.v1 - reg.v0;
  const runs = [];
  const nRuns = Math.max(1, Math.round(span / r.pick([26, 30, 34])));
  const cross = 3.5;
  const runLen = (span - cross * (nRuns - 1)) / nRuns;
  for (let k = 0; k < nRuns; k++) runs.push([reg.v0 + k * (runLen + cross), reg.v0 + k * (runLen + cross) + runLen]);
  c.rows = rows; c.runs = runs;
  let aisleNo = r.int(1, 20);
  rows.forEach((row) => {
    for (const [va, vb] of runs) { c.bayFill = []; rackRun(c, row, va, vb); }
  });
  // aisle floor lines + signs
  const lineTex = r.chance(0.8) ? 'a_dec_line' : 'a_dec_line_w';
  for (let k = 0; k < rows.length; k++) {
    const row = rows[k];
    for (const [va, vb] of runs) {
      for (const f of row.face) {
        const uu = f > 0 ? row.u1 + 0.12 : row.u0 - 0.12;
        const [ax, az] = F.pt(uu, va), [bx, bz] = F.pt(uu, vb);
        floorLine(c.zb, ax, az, bx, bz, 0.1, lineTex);
      }
    }
    const next = rows[k + 1];
    if (next && next.u0 - row.u1 > 2.5) {
      const um = (row.u1 + next.u0) / 2;
      const [sx, sz] = F.pt(um, runs[0][0] - 0.6);
      c.zb.prop('a_hangsign', sx, c.H, sz, c.rotFor(0, -1), { num: String(aisleNo++ % 100).padStart(2, '0'), drop: c.H - 4.6 });
      c.aisles = c.aisles || [];
      c.aisles.push(um);
    }
  }
  if (bulk) bulkStacks(c, rows, runs);
  void p;
}

const BAY = 2.75;

// world skip bit (mb.box face mask) for the face pointing along local (du, dv)
function dirBit(F, du, dv) {
  const wx = du * F.du[0] + dv * F.dv[0], wz = du * F.du[1] + dv * F.dv[1];
  return wx > 0 ? 1 : wx < 0 ? 2 : wz > 0 ? 16 : 32;
}

function pickLoad(r, maxH) {
  const kind = r.weighted([['wrap', 5], ['box', 4], ['crate', 0.5], ['pallets', 0.6], ['low', 0.8]]);
  let h = Math.min(maxH, r.range(0.75, 1.6));
  if (kind === 'low') h = Math.min(maxH, r.range(0.35, 0.6));
  if (kind === 'pallets') h = Math.min(maxH, 0.15 * r.int(2, 8));
  if (kind === 'crate') h = Math.min(h, 1.1);
  return h < 0.3 ? null : { kind, h };
}

function rackRun(c, row, va, vb) {
  const { p, r, F } = c;
  const nb = Math.floor((vb - va) / BAY);
  if (nb < 1) return;
  const v0 = va + (vb - va - nb * BAY) / 2;
  const levels = p.levels, Hr = p.rackH;
  const s = Hr / (levels + 0.4);
  const double = row.u1 - row.u0 > 2;
  const halves = double ? [[row.u0, row.u0 + 1.1, -1], [row.u1 - 1.1, row.u1, 1]] : [[row.u0, row.u1, row.face[0]]];
  // bays blocked by gate approaches / features are left out (and break the beams)
  const ok = [];
  for (let b = 0; b < nb; b++) ok.push(c.free(row.u0 - 0.3, v0 + b * BAY - 0.2, row.u1 + 0.3, v0 + (b + 1) * BAY + 0.2));
  // uprights at every frame line that touches a present bay
  for (let b = 0; b <= nb; b++) {
    if (!ok[b - 1] && !ok[b]) continue;
    const v = v0 + b * BAY;
    for (const [a0, a1] of halves) for (const uu of [a0 + 0.02, a1 - 0.11]) c.B(uu, 0, v - 0.045, uu + 0.09, Hr, v + 0.045, p.upright, { skip: 12 });
    // footplate / guard on the aisle ends
    if ((b === 0 && ok[0]) || (b === nb && ok[nb - 1])) for (const [a0, a1] of halves) c.B(a0, 0, v - 0.12, a1, 0.35, v + 0.12, M.hazard, { skip: 8 });
  }
  // beams along each run of present bays: only the face toward their own aisle + underside
  const endBits = dirBit(F, 0, 1) | dirBit(F, 0, -1);
  let b = 0;
  while (b < nb) {
    if (!ok[b]) { b++; continue; }
    let e = b;
    while (e < nb && ok[e]) e++;
    const ba = v0 + b * BAY + 0.045, bb = v0 + e * BAY - 0.045;
    for (let l = 1; l <= levels; l++) {
      const y = l * s;
      const top = y < 2.2 ? 0 : 4;
      for (const [a0, a1, f] of halves) {
        const skip = endBits | dirBit(F, -f, 0) | top;
        c.B(a0, y - 0.13, ba, a0 + 0.07, y, bb, p.beam, { sub: 6, skip, collide: true });
        c.B(a1 - 0.07, y - 0.13, ba, a1, y, bb, p.beam, { sub: 6, skip, collide: true });
      }
    }
    b = e;
  }
  // pallet loads: decide every slot first so hidden faces can be dropped
  for (let t = 0; t <= levels; t++) {
    const y = t === 0 ? 0 : t * s;
    const maxH = t === levels ? Math.min(s * 0.9, 1.7) : s - 0.32;
    const S = [];
    for (let bi = 0; bi < nb; bi++) {
      const fill = ok[bi] ? (c.bayFill[bi] ?? (c.bayFill[bi] = r.chance(0.15) ? 0 : p.fullness)) : 0;
      S.push(halves.map(() => [0, 1].map(() => (fill && r.chance(fill) ? pickLoad(r, maxH) : null))));
      // pairs of pallets in a slot are often identical loads
      for (const pr of S[bi]) if (pr[0] && pr[1] && r.chance(0.5)) { pr[1] = pr[0]; pr[0].merged = true; }
    }
    const H = (bi, h, q) => { const L = bi >= 0 && bi < nb ? S[bi][h][q] : null; return L ? L.h : 0; };
    for (let bi = 0; bi < nb; bi++) {
      const vc = v0 + bi * BAY + BAY / 2;
      for (let h = 0; h < halves.length; h++) {
        const [a0, a1, f] = halves[h];
        const pr = S[bi][h];
        const emit = (L, q0, q1) => {
          const lo = q0 === 0 ? vc - 1.26 : vc + 0.06, hi = q1 === 0 ? vc - 0.06 : vc + 1.26;
          let skip = 0;
          const other = halves.length > 1 ? 1 - h : -1;
          if (other >= 0 && H(bi, other, q0) >= L.h && H(bi, other, q1) >= L.h) skip |= dirBit(F, -f, 0);
          const lowN = q0 === 0 ? H(bi - 1, h, 1) : H(bi, h, 0), highN = q1 === 1 ? H(bi + 1, h, 0) : H(bi, h, 1);
          if (lowN >= L.h) skip |= dirBit(F, 0, -1);
          if (highN >= L.h) skip |= dirBit(F, 0, 1);
          load(c, a0 + 0.05, a1 - 0.05, lo, hi, y, L, t > 0, skip);
        };
        if (pr[0] && pr[0].merged) emit(pr[0], 0, 1);
        else { if (pr[0]) emit(pr[0], 0, 0); if (pr[1]) emit(pr[1], 1, 1); }
      }
    }
  }
  // the occasional box that slid off onto the aisle floor
  for (let bi = 0; bi < nb; bi++) {
    if (!ok[bi] || !r.chance(0.04)) continue;
    const vc = v0 + bi * BAY + BAY / 2;
    const [a0, a1, f] = r.pick(halves);
    const uu = f > 0 ? a1 + r.range(0.3, 1.2) : a0 - r.range(0.3, 1.2);
    c.P(r.chance(0.6) ? 'box' : 'a_archbox', uu, 0, vc + r.range(-1, 1), r.range(0, 6.28), { s: r.range(0.4, 0.6) });
  }
  // capacity sign on one end frame
  if (r.chance(0.5) && ok[0]) {
    const [a0, a1] = halves[0];
    const [x, z] = F.pt((a0 + a1) / 2, v0 - 0.12);
    const face = { N: 'nz', S: 'pz', W: 'nx', E: 'px' }[F.side];
    c.zb.decal(x, 1.6, z, face, 0.42, 0.42, 'a_sign_load');
  }
}

// one pallet load inside the u-range [a0,a1] and v-range [b0,b1] at height y
function load(c, a0, a1, b0, b1, y, L, raised, skip) {
  const bottom = raised ? M.a_pallet : 0;
  const tu = (b1 - b0) > 1.5 ? (b1 - b0) / 2 : b1 - b0;
  const o = { local: true, bottom, skip };
  if (L.kind === 'pallets') c.TB(a0, y, b0, a1, y + L.h, b1, M.a_pallet, M.wood_light, tu, 0.6, o);
  else if (L.kind === 'crate') c.TB(a0 + 0.05, y, b0 + 0.05, a1 - 0.05, y + L.h, b1 - 0.05, M.a_crate, M.a_crate, tu, 0, o);
  else c.TB(a0, y, b0, a1, y + L.h, b1, L.kind === 'wrap' ? M.a_load_wrap : M.a_load_box, M.cardboard, tu, 0, o);
}

// floor block stacks in lanes (bulk storage)
function bulkStacks(c, rows, runs) {
  const { r, F } = c;
  const u0 = rows[0].u1 + 3.4, u1 = rows[rows.length - 1].u0 - 3.4;
  const laneW = 1.25, gapU = 0.25;
  for (const [va, vb] of runs) {
    let u = u0;
    let lane = 0;
    while (u + laneW <= u1) {
      // blocks of 4..6 lanes then a 3.4 m aisle
      if (lane > 0 && lane % r.int(4, 6) === 0) { u += 3.4; lane = 0; continue; }
      const depth = r.int(3, 9);
      const tiers = r.int(1, 3);
      const kind = r.pick([M.a_load_wrap, M.a_load_wrap, M.a_load_box]);
      for (let k = 0; k < depth; k++) {
        const b0 = va + 0.4 + k * 1.1, b1 = b0 + 1.0;
        if (b1 > vb - 0.4) break;
        if (!c.free(u, b0, u + laneW - gapU, b1)) continue;
        let y = 0;
        const nt = r.chance(0.2) ? Math.max(0, tiers - 1) : tiers;
        for (let t = 0; t < nt; t++) {
          const h = r.range(1.0, 1.45);
          c.TB(u + r.range(0, 0.05), y, b0 + r.range(0, 0.05), u + laneW - gapU, y + h, b1, kind, M.cardboard, 1.2, 0, { local: true, bottom: t ? M.a_pallet : 0 });
          y += h;
        }
      }
      // lane line on the floor
      const [ax, az] = F.pt(u - gapU / 2, va + 0.2), [bx, bz] = F.pt(u - gapU / 2, vb - 0.2);
      floorLine(c.zb, ax, az, bx, bz, 0.07, 'a_dec_line_w', 0.002);
      u += laneW;
      lane++;
    }
  }
}

// ------------------------------------------------------------------ mezzanine
function mezzanine(c0, reg) {
  const { zb, r, p } = c0;
  const mD = r.int(6, 8), mh = r.pick([3.8, 4.0, 4.2]);
  const run = Math.round((mh / 0.18) * 0.24);
  const mLen = Math.min(c0.F.V - c0.dockDepth - 6, r.int(14, 26));
  if (mLen < 10) return null;
  // find a stretch along one of the side walls with room for the stair (gate approaches may pass
  // under the deck, but not through the stair, posts or the cage)
  let c = null, va = 0, sv = 0;
  const sides = r.chance(0.5) ? [false, true] : [true, false];
  for (const mir of sides) {
    const F = mir ? mirrorFrame(c0.F) : c0.F;
    const h = helpers(zb, F, c0.keep);
    for (let k = 0; k < 6 && !c; k++) {
      const a = c0.dockDepth + 1 + Math.floor((k / 5) * Math.max(0, c0.F.V - c0.dockDepth - mLen - 5));
      if (!h.free(mD - 0.5, a, mD + run + 2, a + mLen)) {
        // the whole front is blocked: look for a single free stair slot instead
        for (let t = 2; t < mLen - 3 && !c; t++) if (h.free(mD - 0.5, a + t - 1, mD + run + 2, a + t + 2)) { c = { ...c0, ...h }; va = a; sv = a + t; }
      } else { c = { ...c0, ...h }; va = a; sv = Math.floor(a + 2 + r.int(0, Math.max(0, mLen - 6))); }
    }
    if (c) break;
  }
  if (!c) return null;
  const F = c.F;
  const vb = va + mLen;
  // deck: open grating on steel joists, fascia beam on the open edges
  c.B(0.1, mh - 0.05, va, mD, mh, vb, M.grate, { sub: 3 });
  c.B(mD - 0.08, mh - 0.38, va, mD, mh - 0.05, vb, M.metal_dark, { sub: 3, collide: false });
  c.B(0.1, mh - 0.38, va, mD, mh - 0.05, va + 0.08, M.metal_dark, { sub: 3, collide: false });
  c.B(0.1, mh - 0.38, vb - 0.08, mD, mh - 0.05, vb, M.metal_dark, { sub: 3, collide: false });
  for (let v = va + 1.5; v < vb - 0.5; v += 1.5) c.B(0.1, mh - 0.3, v - 0.04, mD - 0.08, mh - 0.05, v + 0.04, M.metal_dark, { skip: 4, collide: false });
  const np = Math.max(1, Math.round(mLen / 4));
  for (let k = 0; k <= np; k++) {
    const vv = Math.min(va + 0.1 + (k * (mLen - 0.2)) / np, vb - 0.25);
    if (c.free(mD - 0.3, vv - 0.1, mD + 0.1, vv + 0.25)) c.B(mD - 0.2, 0, vv, mD - 0.05, mh - 0.38, vv + 0.15, M.metal_dark, { skip: 12 });
  }
  // stair coming straight out of the deck's front edge, rising toward the deck (-u)
  const up = { x: F.du[0] ? (F.du[0] > 0 ? '-x' : '+x') : null, z: F.du[1] ? (F.du[1] > 0 ? '-z' : '+z') : null };
  openStair(zb, F.rect(mD, sv, mD + run, sv + 1), up.x || up.z, mh);
  // railings: front edge (gap at the stair), both ends
  const rail = (u0, v0, u1, v1) => {
    const len = Math.max(u1 - u0, v1 - v0);
    const alongV = v1 - v0 > u1 - u0;
    c.B(u0, mh + 0.98, v0, u1, mh + 1.04, v1, M.rack_orange, { sub: 3 });
    c.B(u0, mh + 0.48, v0, u1, mh + 0.52, v1, M.rack_orange, { sub: 3 });
    c.B(u0, mh, v0, u1, mh + 0.1, v1, M.rack_orange, { sub: 3, collide: false });
    const n = Math.max(1, Math.round(len / 1.5));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const pu = alongV ? u0 : u0 + (u1 - u0) * t, pv = alongV ? v0 + (v1 - v0) * t : v0;
      c.B(pu - 0.03, mh, pv - 0.03, pu + 0.03, mh + 1.04, pv + 0.03, M.rack_orange, { skip: 12 });
    }
  };
  rail(mD - 0.06, va, mD, sv);
  rail(mD - 0.06, sv + 1, mD, vb);
  rail(0.1, va, mD, va + 0.06);
  rail(0.1, vb - 0.06, mD, vb);
  // under the deck: a wire mesh storage cage and tube lamps
  const cageV0 = va + 0.5, cageV1 = Math.min(vb - 0.5, va + r.int(6, 10), sv - 0.5);
  if (cageV1 - cageV0 > 4 && c.free(0, cageV0 - 0.5, mD - 1, cageV1 + 0.5)) {
    const cu = mD - 1.6;
    c.B(cu - 0.02, 0, cageV0, cu + 0.02, 2.6, cageV1, M.grate, { sub: 2 });
    c.B(0.1, 0, cageV1 - 0.02, cu, 2.6, cageV1 + 0.02, M.grate, { sub: 2 });
    for (let k = 0; k <= 3; k++) { const v = cageV0 + (k * (cageV1 - cageV0)) / 3; c.B(cu - 0.04, 0, v - 0.04, cu + 0.04, 2.6, v + 0.04, M.metal_dark, { skip: 12 }); }
    for (let v = cageV0 + 0.8; v < cageV1 - 0.8; v += 1.3) c.P('a_shelf', 0.45, 0, v, c.rotFor(1, 0), { w: 1.2, h: 2.0, fill: r.pick(['boxes', 'boxes', 'archive', 'paper']) });
    c.P('a_drum', cu - 0.6, 0, cageV1 - 0.6, 0, {});
  }
  for (let v = va + 3; v < vb - 1; v += 5) {
    const [x, z] = F.pt(mD / 2, v);
    ceilingLight(zb, x, z, 'tube', lightState(r, p.fail * 0.8, p.flicker), { y: mh - 0.38, rot: F.axisU === 'x' ? 1 : 0, l: 1.2, int: 0.55, rad: 5.5 });
  }
  // on the deck: shelving, a desk, drums
  for (let v = va + 1.2; v < vb - 1; v += r.pick([1.3, 1.3, 2.6])) c.P('a_shelf', 0.45, mh, v, c.rotFor(1, 0), { w: 1.2, h: 2.1, fill: r.pick(['boxes', 'paper', 'archive', 'linen', 'cans', 'empty']) });
  // under the deck along the wall where no cage stands: pallets and drums
  for (let v = Math.max(va + 1, cageV1 + 1.5); v < vb - 1.5; v += r.range(1.6, 3)) {
    if (!c.free(0.2, v - 0.7, 1.6, v + 0.7)) continue;
    if (r.chance(0.6)) c.TB(0.3, 0, v - 0.6, 1.3, r.range(0.8, 1.5), v + 0.6, r.chance(0.5) ? M.a_load_wrap : M.a_load_box, M.cardboard, 1.2, 0, { local: true });
    else c.P('a_drum', 0.7, 0, v, 0, {});
  }
  if (r.chance(0.7)) {
    const dv = r.range(va + 2, vb - 2);
    c.P('desk', mD - 1.6, mh, dv, c.rotFor(-1, 0), {});
    c.P('chair_office', mD - 2.4, mh, dv + r.range(-0.3, 0.3), c.rotFor(1, 0) + r.range(-0.6, 0.6), {});
    if (r.chance(0.6)) c.P('crt', mD - 1.5, mh + 0.75, dv, c.rotFor(1, 0), { screen: r.chance(0.15) ? 'crt_green' : 'crt_off' });
  }
  for (let k = 0; k < r.int(0, 3); k++) c.P('a_drum', r.range(2.5, mD - 1.2), mh, r.range(va + 1, vb - 1), 0, {});
  c0.mezz = { mD, va, vb, mh, sv, run, F };
  // racks only beside the mezzanine and its stair
  return F.mirrored ? { u0: reg.u0, u1: reg.u1 - (mD + run), v0: reg.v0, v1: reg.v1 } : { u0: reg.u0 + mD + run, u1: reg.u1, v0: reg.v0, v1: reg.v1 };
}

// open-riser steel stair over the cell rect, rising along `up` ('+x' '-x' '+z' '-z') to height h
function openStair(zb, rect, up, h) {
  const [x0, z0, x1, z1] = rect;
  const n = Math.max(1, Math.round(h / 0.18));
  const alongX = up[1] === 'x', pos = up[0] === '+';
  const lo = alongX ? x0 : z0, hi = alongX ? x1 : z1;
  const tread = (hi - lo) / n;
  // the floor underneath stays (no CF.STAIRS): only the treads are new
  zb.fill(x0, z0, x1, z1, (x, z, i) => { zb.flags[i] |= CF.NOPROPS; });
  for (let k = 0; k < n; k++) {
    const top = (h * (k + 1)) / n;
    const a = pos ? lo + k * tread : hi - (k + 1) * tread, b = a + tread;
    if (alongX) bar(zb, a, top - 0.05, z0 + 0.05, b, top, z1 - 0.05, M.metal_plate);
    else bar(zb, x0 + 0.05, top - 0.05, a, x1 - 0.05, top, b, M.metal_plate);
  }
  const lowC = pos ? lo : hi, highC = pos ? hi : lo;
  for (const s of [0.04, 0.96]) {
    const P = (c) => (alongX ? [c, z0 + s * (z1 - z0)] : [x0 + s * (x1 - x0), c]);
    const L = P(lowC), Hh = P(highC);
    rod(zb, L[0], 0.0, L[1], Hh[0], h - 0.05, Hh[1], 0.05, 'metal_dark', { sides: 4 });
    rod(zb, L[0], 1.0, L[1], Hh[0], h + 1.0, Hh[1], 0.025, 'rack_orange', { sides: 4 });
    rod(zb, L[0], 0, L[1], L[0], 1.0, L[1], 0.025, 'rack_orange', { sides: 4 });
  }
}

// ------------------------------------------------------------------ the empty variant
function emptyHall(c) {
  const { F, r, zb } = c;
  // a handful of things left behind in a huge empty floor
  const things = r.int(2, 6);
  for (let k = 0; k < things; k++) {
    const u = r.range(4, F.U - 4), v = r.range(c.dockDepth + 2, F.V - 4);
    if (!c.free(u - 1, v - 1, u + 1, v + 1)) continue;
    const t = r.weighted([['pallet', 3], ['load', 2], ['pjack', 1], ['drum', 1], ['box', 1.5]]);
    if (t === 'pallet') c.P('pallet', u, 0, v, r.range(0, 6.28), {});
    else if (t === 'load') c.TB(u - 0.6, 0, v - 0.5, u + 0.6, r.range(0.8, 1.5), v + 0.5, r.pick([M.a_load_wrap, M.a_load_box]), M.cardboard, 1.2, 0, { local: true });
    else if (t === 'pjack') c.P('a_pjack', u, 0, v, r.range(0, 6.28), {});
    else if (t === 'drum') c.P('a_drum', u, 0, v, 0, {});
    else c.P('box', u, 0, v, r.range(0, 6.28), { s: 0.5 });
  }
  // painted bay outlines with numbers, all empty
  const bw = r.pick([3, 4]), bd = r.pick([6, 8]);
  let n = r.int(1, 30);
  for (let u = 3; u + bw < F.U - 3; u += bw + 0.2) {
    for (const v0 of [c.dockDepth + 4]) {
      if (!c.free(u, v0, u + bw, v0 + bd)) continue;
      const pts = [[u, v0], [u + bw, v0], [u + bw, v0 + bd], [u, v0 + bd]];
      for (let k = 0; k < 4; k++) {
        if (k === 0) continue;
        const [ax, az] = F.pt(...pts[k]), [bx, bz] = F.pt(...pts[(k + 1) % 4]);
        floorLine(zb, ax, az, bx, bz, 0.1, 'a_dec_line', 0.001 * (k % 2));
      }
      const label = String(n++ % 100).padStart(2, '0');
      const sgn = F.side === 'S' || F.side === 'W' ? 1 : -1;
      for (let d = 0; d < 2; d++) {
        const [x, z] = F.pt(u + bw / 2 + (d - 0.5) * 0.55 * sgn, v0 + bd - 1.0);
        zb.decal(x, 0.003, z, 'up', 0.5, 0.75, 'digit_' + label[d], { rot: rotUp(F) });
      }
    }
  }
}
// rotation for floor decals so text reads from the dock side
function rotUp(F) { return { N: Math.PI, S: 0, W: Math.PI / 2, E: -Math.PI / 2 }[F.side]; }

// ------------------------------------------------------------------ staging area by the dock
function staging(c) {
  const { F, r, zb, p } = c;
  const dd = c.dockDepth;
  // lane lines in front of every door
  for (const d of c.doors || []) {
    for (const s of [-1, 1]) {
      const [ax, az] = F.pt(d.u + s * 1.6, 2.8), [bx, bz] = F.pt(d.u + s * 1.6, dd - 1);
      floorLine(zb, ax, az, bx, bz, 0.1, 'a_dec_line_w', 0.002);
    }
    if (r.chance(p.variant === 'empty' ? 0.15 : 0.55)) {
      // a lane of wrapped loads waiting to be shipped
      const n = r.int(1, Math.max(1, Math.floor((dd - 4) / 1.3)));
      for (let k = 0; k < n; k++) {
        const v0 = 3.2 + k * 1.3;
        if (!c.free(d.u - 0.6, v0, d.u + 0.6, v0 + 1.1)) continue;
        const h = r.range(0.9, 1.6);
        c.TB(d.u - 0.6, 0, v0, d.u + 0.6, h, v0 + 1.05, r.chance(0.6) ? M.a_load_wrap : M.a_load_box, M.cardboard, 1.2, 0, { local: true });
        if (r.chance(0.2)) c.TB(d.u - 0.55, h, v0 + 0.05, d.u + 0.55, h + r.range(0.6, 1.1), v0 + 1.0, M.a_load_wrap, M.cardboard, 1.2, 0, { local: true, bottom: M.a_pallet });
      }
    } else if (r.chance(0.3)) {
      c.P('a_pjack', d.u + r.range(-0.8, 0.8), 0, r.range(3, dd - 2), c.rotFor(0, 1) + r.range(-0.5, 0.5), {});
    }
  }
  // hatched keep-clear zone and pallet stacks
  if (r.chance(0.6)) {
    const u = r.range(3, F.U - 7), v = r.range(3, Math.max(3.5, dd - 4));
    const [x, z] = F.pt(u + 2, v + 1.5);
    if (c.free(u, v, u + 4, v + 3)) zb.decal(x, 0.003, z, 'up', 4, 3, 'a_dec_hatch', { rot: F.axisU === 'x' ? 0 : Math.PI / 2 });
  }
  for (let k = 0; k < r.int(1, 4); k++) {
    const u = r.range(2, F.U - 3), v = r.range(2.5, dd - 1.5);
    if (!c.free(u - 0.7, v - 0.6, u + 0.7, v + 0.6)) continue;
    c.TB(u - 0.6, 0, v - 0.5, u + 0.6, 0.15 * r.int(3, 12), v + 0.5, M.a_pallet, M.wood_light, 1.2, 0.6, { local: true });
  }
  // a shipping desk in a corner by the dock
  if (r.chance(0.6)) {
    const u = r.chance(0.5) ? 2.2 : F.U - 2.2, v = r.range(3, Math.max(3.2, dd - 2));
    if (c.free(u - 1, v - 1, u + 1, v + 1)) {
      const rot = c.rotFor(u < F.U / 2 ? 1 : -1, 0);
      c.P('desk_metal', u, 0, v, rot, {});
      c.P('crt', u, 0.76, v, rot + Math.PI, { screen: r.chance(0.12) ? 'crt_green' : 'crt_off' });
      c.P('papers', u + 0.3, 0.76, v + 0.1, 0, { n: r.int(2, 5) });
      if (r.chance(0.7)) c.P('chair_office', u + (u < F.U / 2 ? 0.8 : -0.8), 0, v, rot + Math.PI + r.range(-0.8, 0.8), {});
      c.P('trash_can', u, 0, v + 1.1, 0, {});
    }
  }
  for (let k = 0; k < r.int(0, 3); k++) {
    const u = r.range(2, F.U - 2), v = r.range(2.5, dd - 1);
    if (c.free(u - 0.4, v - 0.4, u + 0.4, v + 0.4)) c.P(r.pick(['a_drum', 'box', 'box_stack', 'trash_can']), u, 0, v, r.range(0, 6.28), {});
  }
}

// ------------------------------------------------------------------ columns
function columns(c) {
  const { F, r, p } = c;
  const vs = p.variant === 'empty' ? r.pick([9, 10, 12]) : r.pick([12, 14, 16]);
  for (const u of c.colU) {
    for (let v = vs; v < F.V - 2; v += vs) {
      // keep columns out of aisles: snap into the nearest rack flue if racks exist
      let uu = u;
      if (c.rows && c.rows.length) {
        let best = null;
        for (const row of c.rows) {
          const cu = (row.u0 + row.u1) / 2;
          if (best === null || Math.abs(cu - u) < Math.abs(best - u)) best = cu;
        }
        if (best !== null && Math.abs(best - u) < 3.5 && v > c.dockDepth) uu = best;
      }
      if (!c.free(uu - 0.4, v - 0.4, uu + 0.4, v + 0.4)) continue;
      const inFlue = uu !== u;
      const cw = inFlue ? 0.1 : 0.17;
      c.B(uu - cw, 0, v - cw, uu + cw, c.H - 0.42, v + cw, p.colMat, { skip: 12, sub: 3 });
      if (!inFlue) c.B(uu - 0.24, 0, v - 0.24, uu + 0.24, 1.0, v + 0.24, M.hazard, { skip: 8 });
      if (r.chance(0.15)) {
        const [x, z] = F.pt(uu, v - 0.25);
        const face = { N: 'nz', S: 'pz', W: 'nx', E: 'px' }[F.side];
        c.zb.decal(x, 1.7, z, face, 0.4, 0.4, r.pick(['a_sign_nosmoke', 'a_sign_hardhat', 'a_sign_forklift', 'poster_safety']));
      }
    }
  }
}

// ------------------------------------------------------------------ lights
function hallLights(c) {
  const { F, r, p, zb } = c;
  const sp = r.pick([6, 6.5, 7]);
  const opts = { hang: 1.5, rad: 14, int: 0.9 };
  const place = (u, v) => {
    const [x, z] = F.pt(u, v);
    let st = lightState(r, p.fail, p.flicker, 0.3);
    if (p.variant === 'empty' && st === 'on' && r.chance(0.5)) st = 'off';
    ceilingLight(zb, x, z, 'highbay', st, opts);
  };
  const mz = c.mezz;
  const underMezz = (u, v) => mz && (mz.F.mirrored ? F.U - u : u) < mz.mD + 1 && v > mz.va - 1 && v < mz.vb + 1;
  if (c.aisles && c.aisles.length) {
    for (const um of c.aisles) for (let v = c.dockDepth + 2.5; v < F.V - 1; v += sp) if (!underMezz(um, v)) place(um, v);
    for (let u = 3; u < F.U - 2; u += sp) if (!underMezz(u, c.dockDepth / 2)) place(u, Math.min(c.dockDepth / 2 + 1, c.dockDepth - 1));
    for (let u = 3; u < F.U - 2; u += sp * 1.4) place(u, F.V - 1.8);
  } else {
    for (let v = 3.5; v < F.V - 1; v += sp) for (let u = 3.5; u < F.U - 1; u += sp) if (!underMezz(u, v)) place(u, v);
  }
  if (p.variant === 'empty' || p.dark) {
    // one lamp still burning somewhere far away
    const [x, z] = F.pt(r.range(4, F.U - 4), r.range(F.V * 0.6, F.V - 3));
    ceilingLight(zb, x, z, 'highbay', 'on', { hang: 1.5, rad: 14, int: 1.25 });
  }
  zb.emitter(zb.x0 + zb.w / 2, 6, zb.z0 + zb.d / 2, 'hum_strip', { vol: 0.15, rad: 40 });
}

// ------------------------------------------------------------------ walls
function wallDressing(c) {
  const { zb, r, H } = c;
  const { x0, z0, x1, z1 } = zb;
  const sides = [['N', 'pz'], ['S', 'nz'], ['W', 'px'], ['E', 'nx']];
  for (const [sd, face] of sides) {
    const len = sd === 'N' || sd === 'S' ? zb.w : zb.d;
    // clerestory windows (dark) high up on the long walls
    if (sd !== c.F.side && r.chance(0.5)) {
      for (let t = 4; t < len - 3; t += r.pick([5, 6])) {
        const [x, z] = edgePt(zb, sd, t, 0.12);
        zb.decal(x, H - 2.2, z, face, 2.4, 1.1, 'window_dark', { lit: false, glow: 0.14 });
      }
    }
    // a few posters / signs / extinguishers at eye level
    for (let k = 0; k < Math.floor(len / 14); k++) {
      const t = r.range(2, len - 2);
      const [x, z] = edgePt(zb, sd, t);
      const cx = Math.floor(x - (face === 'nx' ? 0.5 : 0)), cz = Math.floor(z - (face === 'nz' ? 0.5 : 0));
      if (zb.gates.some((g) => Math.abs(g.x - cx) + Math.abs(g.z - cz) < 3)) continue;
      const u = r.next();
      if (u < 0.35) zb.decal(x, 1.6, z, face, 0.6, 0.6, r.pick(['poster_safety', 'poster_notice', 'a_sign_hardhat', 'a_sign_nosmoke', 'a_sign_forklift']));
      else if (u < 0.55) zb.prop('extinguisher', x, 0, z, facing(...inward(face)), {});
      else if (u < 0.7) zb.decal(x, r.range(0.4, 1.4), z, face, r.range(0.8, 1.6), r.range(0.4, 0.8), 'dec_scuff');
    }
  }
}
function inward(face) { return { pz: [0, 1], nz: [0, -1], px: [1, 0], nx: [-1, 0] }[face]; }
function edgePt(zb, sd, t, off = 0.1) {
  switch (sd) {
    case 'N': return [zb.x0 + t, zb.z0 + off];
    case 'S': return [zb.x0 + t, zb.z1 - off];
    case 'W': return [zb.x0 + off, zb.z0 + t];
    default: return [zb.x1 - off, zb.z0 + t];
  }
}

defineZone('warehouse', {
  border: 'wall',
  gate: 'wide',
  minW: 32, minD: 32,
  tall: 1,
  allowStairs: false,
  allowHoles: false,
  weight: (c) => {
    if (c.dim !== 0 || c.dist <= 120) return 0;
    let w = 1.1 * (0.25 + 1.5 * c.ind);
    if (c.level < -2) w *= 0.6;
    return w;
  },
  params: whParams,
  gen: genWarehouse,
});
