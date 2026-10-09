// The beach: the whole Atlantic side of the beach island and its south tip.
// From the water inland: wet sand, the Art Deco lifeguard towers (every
// ~250 studs, each painted differently), clusters of umbrellas and loungers,
// volleyball courts, towels, then the dunes (sea oats and sea grape) crossed
// by wooden access paths with showers, the boardwalk, a row of palms, and on
// South Beach Lummus Park: a lawn with a winding path, palms and deco lamps
// between the boardwalk and Ocean Drive. South Pointe Pier runs out into the
// ocean from the tip.
import { L, tint, shade, cylAB, strip, resample, spline, rnd, faceUp, TAU } from './kit.js';
import { place } from './furniture.js';
import { PLACES } from '../layout.js';

const WALK_D = 182;      // the boardwalk's centre, inland from the waterline
const WALK_W = 5;        // its half width
const OCEAN_DRIVE = 2760, OD_EDGE = 2795, OD_Z = [250, 2410];

const SCHEMES = [
  { body: 0xf7a6c4, trim: 0x22b8b0, roof: 0x22b8b0 },
  { body: 0xffd23f, trim: 0x2f6fe4, roof: 0xff595e },
  { body: 0xc3a8f0, trim: 0x7debb5, roof: 0xf7f3e8 },
  { body: 0x4ecdc4, trim: 0xff6b6b, roof: 0xffe66d },
  { body: 0xfdfcf7, trim: 0xff8c42, roof: 0xff8c42, stripes: 0xff8c42 },
  { body: 0xfdfcf7, trim: 0xfdfcf7, roof: 0x7b2cbf, rainbow: true },
  { body: 0xa8e6cf, trim: 0xff8b94, roof: 0xffd3b6 },
  { body: 0xff9f1c, trim: 0x2b2d42, roof: 0xfdfffc },
  { body: 0x9be7ff, trim: 0xff4f9a, roof: 0xfdfcf7, stripes: 0xff4f9a },
  { body: 0xfdfcf7, trim: 0x1d3557, roof: 0xe63946, flag: true },
];
const RAINBOW = [0xe40303, 0xff8c00, 0xffed00, 0x008026, 0x004dff, 0x750787];
const UMBRELLA = [0x1aa6b7, 0xff6f59, 0xffd166, 0x2b59c3, 0xef476f, 0x06d6a0, 0xf8f4e3];
const TOWELS = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0xf78c6b, 0x9b5de5, 0xffffff, 0x00bbf9];

/** A local frame at (x, y, z) turned by heading h: boxes, quads and tubes in tower space. */
export function frame(g, x, y, z, h) {
  const c = Math.cos(h), s = Math.sin(h);
  const W = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  return {
    W,
    box: (lx, ly, lz, hx, hy, hz, o, dh = 0) => g.box(x + lx * c + lz * s, y + ly, z - lx * s + lz * c, hx, hy, hz, h + dh, o),
    quad: (a, b, cc, d, o) => g.quad(W(...a), W(...b), W(...cc), W(...d), o),
    tube: (a, b, r0, r1, seg, o) => cylAB(g, W(...a), W(...b), r0, r1, seg, o),
  };
}

export function buildBeach(P) {
  const { plan, ground } = P;
  const land = plan.landById.beach;
  const raw = [];
  for (let i = 1; i <= 10; i++) raw.push(land.pts[i]);
  const S = resample(spline(raw, 30), 6);
  for (const s of S) { s.nx = -s.tz; s.nz = s.tx; }
  // a point `d` inland from the waterline, snapped to the ground's own coast distance
  const at = (s, d) => {
    let x = s.x + s.nx * d, z = s.z + s.nz * d;
    for (let k = 0; k < 3; k++) { const c = ground.coastAt(x, z); x += s.nx * (d - c); z += s.nz * (d - c); }
    return [x, z];
  };
  const pierAt = pierStart(P, S);
  // ---- the boardwalk: where it fits (not on a road, not in a building, not at the pier) ----
  const walk = S.map((s, i) => {
    let d = WALK_D;
    for (; d > 120; d -= 4) { const [x, z] = at(s, d); if (P.roads.clear(x, z) > WALK_W + 2) break; }
    const [x, z] = at(s, d);
    const ok = d > 120 && P.free(x, z, WALK_W + 1) && Math.hypot(x - pierAt.x, z - pierAt.z) > 30;
    return { x, z, d, ok, i };
  });
  // smooth the distance so the walk doesn't zig-zag where it gives way to a road
  for (let k = 0; k < 3; k++) for (let i = 1; i < walk.length - 1; i++) walk[i].ds = (walk[i - 1].d + walk[i].d * 2 + walk[i + 1].d) / 4;
  for (const w of walk) { if (w.ds) { const [x, z] = at(S[w.i], w.ds); w.x = x; w.z = z; w.d = w.ds; } }
  boardwalk(P, S, walk);
  // ---- along the shore ----
  const r = rnd(1985);
  let lastTower = -999, scheme = 0, nCluster = 0;
  for (let i = 4; i < S.length - 4; i++) {
    const s = S[i], w = walk[i], head = Math.atan2(-s.nx, -s.nz);
    // lifeguard towers every ~250 studs
    if (i - lastTower >= 42 && w.ok) {
      const [x, z] = at(s, 58);
      if (P.free(x, z, 12) && P.roads.clear(x, z) > 14) {
        lifeguardTower(P, x, P.gy(x, z), z, head, SCHEMES[scheme++ % SCHEMES.length], scheme);
        lastTower = i;
        // a lifebuoy post and the tower's own umbrella cluster to the side
        const [bx, bz] = at(s, 44);
        place(P, 'lifering', bx + s.tx * 12, bz + s.tz * 12, head);
      }
    }
    // umbrella clusters between the towers (and more of them on the busy beaches)
    if ((i - lastTower === 21 || (i - lastTower === 10 && r() < 0.55) || (i - lastTower === 32 && r() < 0.55)) && w.ok) umbrellas(P, S, i, at, r, head, nCluster++);
    // volleyball on South Beach
    if (i % 140 === 70 && w.ok) volleyball(P, S, i, at, head);
    // towels scattered on the sand
    if (r() < 0.12 && w.ok) {
      const [x, z] = at(s, 35 + r() * 100);
      if (P.free(x, z, 3)) place(P, 'towel', x, z, head + (r() - 0.5) * 0.8, tint(TOWELS[Math.floor(r() * TOWELS.length)]));
    }
    // the dunes behind the sand
    if (w.ok && i % 25 !== 0 && i % 25 !== 1) {
      for (let k = 0; k < 2; k++) {
        const dd = w.d - WALK_W - 4 - r() * 24;
        const [x, z] = at(s, dd);
        const q = r();
        if (P.roads.clear(x, z) < 2) continue;
        if (q < 0.62) P.addBush(x, P.gy(x, z), z, 0.8 + r() * 0.6, 'grass');
        else if (q < 0.9) P.addBush(x, P.gy(x, z), z, 0.9 + r() * 0.7, 'shrub');
      }
    }
    // beach access paths across the dunes, with a shower and a bin
    if (w.ok && i % 25 === 0) {
      const [ax, az] = at(s, w.d - WALK_W), [bx, bz] = at(s, w.d - 40);
      strip(P.C.get('flat', ax, az), ax, az, bx, bz, 3, (x, z) => P.gy(x, z) + 0.35, { lay: L.whiteTiles, tint: [0.9, 0.78, 0.62], scale: 6 }, 6);
      place(P, 'shower', bx - s.tx * 6 + s.nx * 2, bz - s.tz * 6 + s.nz * 2, head);
      place(P, 'bin', ax + s.tx * 5 + s.nx * 3, az + s.tz * 5 + s.nz * 3, 0, tint(0x2a7f62));
    }
    // palms on the land side of the walk (in little groups)
    if (w.ok && r() < 0.24) {
      const n = r() < 0.4 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const [x, z] = at(s, w.d + WALK_W + 4 + r() * 9);
        if (P.free(x, z, 3) && P.roads.clear(x, z) > 2 && !(z > OD_Z[0] && z < OD_Z[1] && x < OD_EDGE + 30)) P.addPalm(x + (r() - 0.5) * 4, P.gy(x, z), z + (r() - 0.5) * 4, 0.85 + r() * 0.35);
      }
    }
    // the odd palm out on the sand
    if (w.ok && r() < 0.02) { const [x, z] = at(s, 120 + r() * 40); if (P.free(x, z, 3)) P.addPalm(x, P.gy(x, z), z, 0.8 + r() * 0.3, 0.12 + r() * 0.15); }
  }
  lummus(P, S, walk);
  pier(P, pierAt);
}

// ---- the boardwalk ---------------------------------------------------------------------
function boardwalk(P, S, walk) {
  const deckT = [0.92, 0.8, 0.64], postT = [0.62, 0.55, 0.47];
  let run = 0;
  for (let i = 0; i < walk.length - 1; i++) {
    const a = walk[i], b = walk[i + 1];
    if (!a.ok || !b.ok) { run = 0; continue; }
    const sa = S[i], sb = S[i + 1];
    const g = P.C.get('surf', a.x, a.z);
    const ya = Math.max(P.gy(a.x, a.z), 2.2) + 0.85, yb = Math.max(P.gy(b.x, b.z), 2.2) + 0.85;
    const A0 = [a.x - sa.nx * WALK_W, ya, a.z - sa.nz * WALK_W], A1 = [a.x + sa.nx * WALK_W, ya, a.z + sa.nz * WALK_W];
    const B0 = [b.x - sb.nx * WALK_W, yb, b.z - sb.nz * WALK_W], B1 = [b.x + sb.nx * WALK_W, yb, b.z + sb.nz * WALK_W];
    g.quad(A0, B0, B1, A1, { lay: L.whiteTiles, tint: deckT, scale: 7, normal: [0, 1, 0], rough: 0.8 });
    fixWinding(g);
    // the fascia boards on both sides
    for (const [p, q] of [[A0, B0], [A1, B1]]) {
      g.quad([p[0], p[1] - 1.4, p[2]], [q[0], q[1] - 1.4, q[2]], q, p, { lay: L.concrete, tint: shade(deckT, 0.75), scale: 6 });
      g.quad([q[0], q[1] - 1.4, q[2]], [p[0], p[1] - 1.4, p[2]], p, q, { lay: L.concrete, tint: shade(deckT, 0.75), scale: 6 });
    }
    // posts and a rope rail on the sea side
    run++;
    if (i % 2 === 0) {
      const gd = P.C.get('detail', a.x, a.z);
      gd.box(A0[0], ya + 1.2, A0[2], 0.25, 1.2, 0.25, 0, { lay: L.deck, tint: postT, scale: 4 });
      if (walk[i + 2]?.ok) cylAB(gd, [A0[0], ya + 2.1, A0[2]], [walk[i + 2].x - S[i + 2].nx * WALK_W, Math.max(P.gy(walk[i + 2].x, walk[i + 2].z), 2.2) + 0.85 + 2.1, walk[i + 2].z - S[i + 2].nz * WALK_W], 0.1, 0.1, 4, { lay: L.concrete, tint: [0.75, 0.68, 0.55] });
    }
    // collision every 4 samples: a low deck people step onto
    if (run % 4 === 1) {
      const e = walk[Math.min(walk.length - 1, i + 4)];
      if (e.ok) {
        const mx = (a.x + e.x) / 2, mz = (a.z + e.z) / 2, len = Math.hypot(e.x - a.x, e.z - a.z);
        const top = (ya + yb) / 2, gy = P.gy(mx, mz);
        P.box(mx, (top + gy - 1) / 2, mz, WALK_W, Math.max(0.3, (top - gy + 1) / 2), len / 2 + 0.3, Math.atan2(e.x - a.x, e.z - a.z), 'wood', { kerb: true, noBlock: true });
      }
    }
    // a lamp every ~60 studs on the land side
    if (i % 10 === 5) place(P, 'lampDeco', A1[0] + sa.nx * 1.6, A1[2] + sa.nz * 1.6, 0);
  }
}
const fixWinding = faceUp;

// ---- lifeguard towers ------------------------------------------------------------------------
export function lifeguardTower(P, x, y, z, h, sc, seed) {
  const g = P.C.get('surf', x, z), F = frame(g, x, y, z, h), r = rnd(seed * 97 + 13);
  const K = 1.32; // stucco is a little grey: lift the paint
  const body = tint(sc.body, K), trim = tint(sc.trim, K), roof = tint(sc.roof, K);
  const white = tint(0xfdfcf7, K), glass = [0.05, 0.09, 0.12], deck = [0.92, 0.86, 0.78];
  const st = { lay: L.stucco, scale: 6 };
  // stilts and braces
  for (const sx of [-4.6, 4.6]) for (const sz of [-3.2, 4.6]) F.box(sx, 4.1, sz, 0.38, 4.1, 0.38, { ...st, tint: trim });
  for (const sx of [-4.6, 4.6]) { F.tube([sx, 0.6, -3.2], [sx, 7.6, 4.6], 0.16, 0.16, 4, { ...st, tint: white }); F.tube([sx, 0.6, 4.6], [sx, 7.6, -3.2], 0.16, 0.16, 4, { ...st, tint: white }); }
  // platform and hut
  F.box(0, 8.4, 1.4, 6.4, 0.3, 5.6, { lay: L.deck, tint: deck, scale: 6 });
  const hx = 4.5, hz = 3.4, hzc = -0.2, y0 = 8.7, y1 = 15.2;
  if (sc.rainbow) {
    const n = RAINBOW.length, bh = (y1 - y0) / n;
    for (let k = 0; k < n; k++) F.box(0, y1 - bh * (k + 0.5), hzc, hx, bh / 2, hz, { ...st, tint: tint(RAINBOW[k], 1.25) });
  } else {
    F.box(0, (y0 + y1) / 2, hzc, hx, (y1 - y0) / 2, hz, { ...st, tint: body });
    if (sc.stripes) for (let k = 0; k < 3; k++) F.box(0, y0 + 0.9 + k * 0.9, hzc, hx + 0.04, 0.22, hz + 0.04, { ...st, tint: tint(sc.stripes, K) });
    if (sc.flag) { // stars and stripes
      for (let k = 0; k < 4; k++) F.box(0, y0 + 0.5 + k * 1.1, hzc, hx + 0.04, 0.27, hz + 0.04, { ...st, tint: tint(0xe63946, K) });
      F.box(-hx * 0.45, y1 - 1.3, hzc, hx * 0.55 + 0.06, 1.25, hz + 0.06, { ...st, tint: tint(0x1d3557, K) });
    }
  }
  // a trim band at the top and the bottom
  F.box(0, y1 - 0.25, hzc, hx + 0.12, 0.25, hz + 0.12, { ...st, tint: trim });
  F.box(0, y0 + 0.2, hzc, hx + 0.08, 0.2, hz + 0.08, { ...st, tint: trim });
  // windows: a wide one at the front, one each side, the door at the back
  F.quad([-3.6, 10.2, hzc + hz + 0.05], [3.6, 10.2, hzc + hz + 0.05], [3.6, 13.8, hzc + hz + 0.05], [-3.6, 13.8, hzc + hz + 0.05], { lay: L.whiteTiles, tint: glass, rough: 0.08 });
  F.box(0, 13.95, hzc + hz + 0.15, 3.8, 0.15, 0.15, { ...st, tint: trim });
  F.box(0, 10.05, hzc + hz + 0.3, 3.9, 0.12, 0.35, { ...st, tint: trim });
  for (const sx of [-1, 1]) F.quad([sx * (hx + 0.05), 10.4, sx > 0 ? hzc + 2.2 : hzc - 2.2], [sx * (hx + 0.05), 10.4, sx > 0 ? hzc - 2.2 : hzc + 2.2], [sx * (hx + 0.05), 13.4, sx > 0 ? hzc - 2.2 : hzc + 2.2], [sx * (hx + 0.05), 13.4, sx > 0 ? hzc + 2.2 : hzc - 2.2], { lay: L.whiteTiles, tint: glass, rough: 0.08 });
  F.quad([1.2, y0 + 0.1, hzc - hz - 0.05], [-1.2, y0 + 0.1, hzc - hz - 0.05], [-1.2, y0 + 5.2, hzc - hz - 0.05], [1.2, y0 + 5.2, hzc - hz - 0.05], { ...st, tint: shade(trim, 0.8) });
  // the roof
  const kind = seed % 4;
  const ro = { lay: L.stucco, tint: roof, scale: 6 };
  if (kind === 0) { // barrel vault, front to back
    const n = 7, rx = hx + 0.9, zf = hzc + hz + 1.6, zb = hzc - hz - 1.0;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, za = zf + (zb - zf) * t0, zb2 = zf + (zb - zf) * t1;
      const ya = y1 + 0.2 + 2.2 * Math.sin(Math.PI * t0), yb = y1 + 0.2 + 2.2 * Math.sin(Math.PI * t1);
      F.quad([-rx, ya, za], [rx, ya, za], [rx, yb, zb2], [-rx, yb, zb2], ro);
      F.quad([rx, ya - 0.3, za], [-rx, ya - 0.3, za], [-rx, yb - 0.3, zb2], [rx, yb - 0.3, zb2], { ...ro, tint: shade(roof, 0.7) });
      for (const sx of [-1, 1]) F.quad([sx * rx, y1 + 0.2, sx > 0 ? za : zb2], [sx * rx, y1 + 0.2, sx > 0 ? zb2 : za], [sx * rx, sx > 0 ? yb : ya, sx > 0 ? zb2 : za], [sx * rx, sx > 0 ? ya : yb, sx > 0 ? za : zb2], { ...st, tint: trim });
    }
  } else if (kind === 1) { // a shed roof sloping to the back, overhanging the front
    const rx = hx + 1.0, zf = hzc + hz + 2.0, zb = hzc - hz - 0.8;
    F.quad([-rx, y1 + 2.4, zf], [rx, y1 + 2.4, zf], [rx, y1 + 0.6, zb], [-rx, y1 + 0.6, zb], ro);
    F.quad([rx, y1 + 2.1, zf], [-rx, y1 + 2.1, zf], [-rx, y1 + 0.3, zb], [rx, y1 + 0.3, zb], { ...ro, tint: shade(roof, 0.7) });
    F.quad([-rx, y1 + 2.1, zf], [rx, y1 + 2.1, zf], [rx, y1 + 2.4, zf], [-rx, y1 + 2.4, zf], { ...st, tint: trim });
    for (const sx of [-1, 1]) F.quad([sx * rx, y1, sx > 0 ? zf : zb], [sx * rx, y1, sx > 0 ? zb : zf], [sx * rx, sx > 0 ? y1 + 0.6 : y1 + 2.4, sx > 0 ? zb : zf], [sx * rx, sx > 0 ? y1 + 2.4 : y1 + 0.6, sx > 0 ? zf : zb], { ...st, tint: body });
  } else if (kind === 2) { // a little pyramid
    const rx = hx + 0.9, zf = hzc + hz + 1.0, zb = hzc - hz - 1.0, ap = [0, y1 + 3.6, hzc];
    const c = [[rx, y1, zf], [-rx, y1, zf], [-rx, y1, zb], [rx, y1, zb]];
    for (let k = 0; k < 4; k++) F.quad(c[(k + 1) % 4], c[k], ap, ap, ro);
    F.quad(c[0], c[1], c[2], c[3], { ...ro, tint: shade(roof, 0.6) });
    F.tube([0, y1 + 3.4, hzc], [0, y1 + 5.2, hzc], 0.12, 0.06, 4, { ...st, tint: trim });
  } else { // flat deco roof with a stepped fin
    F.box(0, y1 + 0.35, hzc + 0.4, hx + 1.0, 0.35, hz + 1.4, ro);
    F.box(0, y1 + 1.6, hzc, 0.7, 1.0, hz * 0.8, { ...st, tint: trim });
    F.box(0, y1 + 2.9, hzc, 0.5, 0.4, hz * 0.45, { ...st, tint: trim });
  }
  // the balcony rail
  for (const [ax, az, bx, bz] of [[-6.2, 6.8, 6.2, 6.8], [-6.2, -4.0, -6.2, 6.8], [6.2, -4.0, 6.2, 6.8]]) {
    F.tube([ax, 11.2, az], [bx, 11.2, bz], 0.13, 0.13, 4, { ...st, tint: trim });
    F.tube([ax, 10.0, az], [bx, 10.0, bz], 0.09, 0.09, 4, { ...st, tint: white });
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2.5));
    for (let k = 0; k <= n; k++) { const t = k / n; F.box(ax + (bx - ax) * t, 9.9, az + (bz - az) * t, 0.1, 1.3, 0.1, { ...st, tint: white }); }
  }
  // the ramp down the side
  const rw = 1.7;
  F.quad([-6.4, 8.7, 2.8 - rw], [-6.4, 8.7, 2.8 + rw], [-19, 0.3, 2.8 + rw], [-19, 0.3, 2.8 - rw], { lay: L.deck, tint: deck, scale: 6 });
  F.quad([-6.4, 8.3, 2.8 + rw], [-6.4, 8.3, 2.8 - rw], [-19, -0.1, 2.8 - rw], [-19, -0.1, 2.8 + rw], { lay: L.deck, tint: shade(deck, 0.6), scale: 6 });
  for (const sz of [2.8 - rw, 2.8 + rw]) {
    F.tube([-6.4, 11.0, sz], [-19, 2.6, sz], 0.12, 0.12, 4, { ...st, tint: trim });
    for (let k = 0; k <= 4; k++) { const t = k / 4, xx = -6.4 + (-19 + 6.4) * t, yy = 8.7 + (0.3 - 8.7) * t; F.box(xx, yy + 1.15, sz, 0.1, 1.15, 0.1, { ...st, tint: white }); }
  }
  F.box(-12.7, 2.5, 2.8, 0.3, 2.5, 0.3, { ...st, tint: trim });
  // the flag pole and flags
  F.tube([5.9, 8.6, 6.5], [5.9, 21.5, 6.5], 0.13, 0.09, 5, { lay: L.concrete, tint: [0.9, 0.9, 0.9] });
  const fc = r() < 0.6 ? tint(0xffd400, 1.2) : tint(0xe8302c, 1.2);
  F.quad([5.9, 21.2, 6.5], [5.9, 21.2, 10.3], [5.9, 18.9, 10.0], [5.9, 18.9, 6.5], { ...st, tint: fc });
  F.quad([5.9, 21.2, 10.3], [5.9, 21.2, 6.5], [5.9, 18.9, 6.5], [5.9, 18.9, 10.0], { ...st, tint: fc });
  // a rescue board leaning on the stilts and a sign on the front
  F.box(3.6, 3.0, 5.4, 0.9, 2.9, 0.12, { ...st, tint: tint(0xff4b2b, 1.2) }, 0.15);
  const [cx, cz] = rot(x, z, h, 0, 1.0);
  P.box(cx, y + 7.8, cz, 6.4, 7.8, 5.8, h, 'wood', { tower: true, cover: true });
}
function rot(x, z, h, lx, lz) { const c = Math.cos(h), s = Math.sin(h); return [x + lx * c + lz * s, z - lx * s + lz * c]; }

// ---- umbrellas and loungers -------------------------------------------------------------------
function umbrellas(P, S, i, at, r, head, k) {
  const s = S[i];
  const rental = r() < 0.6, col = UMBRELLA[(k * 3) % UMBRELLA.length];
  const rows = 2 + Math.floor(r() * 3), cols = rental ? 4 + Math.floor(r() * 6) : 3 + Math.floor(r() * 4);
  for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) {
    if (!rental && r() < 0.4) continue;
    const along = (b - cols / 2) * 14 + (rental ? 0 : (r() - 0.5) * 8), d = 80 + a * 17 + (rental ? 0 : (r() - 0.5) * 8);
    const k = Math.max(0, Math.min(S.length - 1, i + Math.round(along / 6)));
    const [x, z] = at(S[k], d);
    if (!P.free(x, z, 6) || P.roads.clear(x, z) < 6) continue;
    const c = tint(rental ? col : UMBRELLA[Math.floor(r() * UMBRELLA.length)], 1.2);
    const y = P.gy(x, z);
    place(P, 'umbrella', x, z, r() * TAU, c, y - 0.4);
    const lc = rental ? c : tint(UMBRELLA[Math.floor(r() * UMBRELLA.length)], 1.2);
    for (const side of rental ? [-1, 1] : [r() < 0.5 ? -1 : 1]) {
      const lx = x + S[k].tx * side * 3.2, lz = z + S[k].tz * side * 3.2;
      place(P, 'lounger', lx, lz, head + (rental ? 0 : (r() - 0.5) * 0.5), lc);
    }
  }
}

// ---- volleyball ----------------------------------------------------------------------------
function volleyball(P, S, i, at, head) {
  const s = S[i], [x, z] = at(s, 118);
  if (!P.free(x, z, 30) || P.roads.clear(x, z) < 30) return;
  const y = P.gy(x, z), g = P.C.get('detail', x, z), F = frame(g, x, y, z, head + Math.PI / 2);
  // posts, the net and the boundary ropes (court 30 x 60 along the shore)
  for (const sx of [-17, 17]) F.box(sx, 4.6, 0, 0.25, 4.6, 0.25, { lay: L.concrete, tint: [0.9, 0.9, 0.9] });
  F.quad([-16.8, 6.4, 0], [16.8, 6.4, 0], [16.8, 8.9, 0], [-16.8, 8.9, 0], { lay: L.shutter, tint: [0.12, 0.12, 0.12], scale: 1 });
  F.quad([16.8, 6.4, 0], [-16.8, 6.4, 0], [-16.8, 8.9, 0], [16.8, 8.9, 0], { lay: L.shutter, tint: [0.12, 0.12, 0.12], scale: 1 });
  F.box(0, 8.95, 0, 16.8, 0.12, 0.05, { lay: L.stucco, tint: [1, 1, 1] });
  const gf = P.C.get('paint', x, z), FF = frame(gf, x, y, z, head + Math.PI / 2);
  const rope = (ax, az, bx, bz) => { const w = 0.25; const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), nx = -dz / l * w, nz = dx / l * w; FF.quad([ax + nx, 0.25, az + nz], [bx + nx, 0.25, bz + nz], [bx - nx, 0.25, bz - nz], [ax - nx, 0.25, az - nz], { lay: L.stucco, tint: [0.25, 0.4, 0.9], normal: [0, 1, 0] }); };
  rope(-15, -30, 15, -30); rope(15, -30, 15, 30); rope(15, 30, -15, 30); rope(-15, 30, -15, -30);
  fixAll(gf);
  for (const sx of [-17, 17]) { const [px, pz] = rot(x, z, head + Math.PI / 2, sx, 0); P.box(px, y + 4.6, pz, 0.3, 4.6, 0.3, 0, 'metal'); }
}
function fixAll(g) {
  // make every quad of a paint buffer face up
  for (let n = 6; n <= g.idx.length; n += 6) {
    const i0 = g.idx[n - 6], i1 = g.idx[n - 5], i2 = g.idx[n - 4], p = g.pos;
    const ax = p[i1 * 3] - p[i0 * 3], az = p[i1 * 3 + 2] - p[i0 * 3 + 2], bx = p[i2 * 3] - p[i0 * 3], bz = p[i2 * 3 + 2] - p[i0 * 3 + 2];
    if (az * bx - ax * bz >= 0) continue;
    for (let k = n - 6; k < n; k += 3) { const t = g.idx[k + 1]; g.idx[k + 1] = g.idx[k + 2]; g.idx[k + 2] = t; }
  }
}

// ---- Lummus Park: between Ocean Drive's sidewalk and the boardwalk --------------------------
function lummus(P, S, walk) {
  const r = rnd(77);
  // the boardwalk's land edge at a given z (the shore runs north-south here)
  const near = walk.filter((w) => w.ok && w.z > OD_Z[0] - 20 && w.z < OD_Z[1] + 20 && w.x > OD_EDGE).sort((a, b) => a.z - b.z);
  const edgeAt = (z) => {
    let lo = 0, hi = near.length - 1;
    if (hi < 0) return null;
    while (lo < hi) { const m = (lo + hi) >> 1; if (near[m].z < z) lo = m + 1; else hi = m; }
    let best = near[lo];
    if (lo > 0 && Math.abs(near[lo - 1].z - z) < Math.abs(best.z - z)) best = near[lo - 1];
    return Math.abs(best.z - z) < 10 ? best.x - WALK_W - 2 : null;
  };
  const x0 = OD_EDGE + 1;
  let prev = null;
  for (let z = OD_Z[0] + 6; z < OD_Z[1] - 6; z += 6) {
    const x1 = edgeAt(z);
    if (x1 == null || x1 - x0 < 6 || !P.free((x0 + x1) / 2, z, (x1 - x0) / 2)) { prev = null; continue; }
    const w = x1 - x0, cx = (x0 + x1) / 2;
    // a green lawn over the sand
    const gl = P.C.get('flat', cx, z);
    gl.quad([x0, P.gy(x0, z) + 0.12, z - 3.05], [x0, P.gy(x0, z + 3) + 0.12, z + 3.05], [x1, P.gy(x1, z + 3) + 0.12, z + 3.05], [x1, P.gy(x1, z) + 0.12, z - 3.05], { lay: L.lawn, tint: [0.85, 1.0, 0.72], scale: 14, normal: [0, 1, 0] });
    fixWinding(gl);
    // the winding path (a pink and white serpentine)
    if (w > 18) {
      const amp = Math.min(6, w / 2 - 6), px = cx + Math.sin(z / 38) * amp;
      if (prev) {
        const gp = P.C.get('paint', px, z);
        strip(gp, prev[0], prev[1], px, z, 3.2, (x, zz) => P.gy(x, zz) + 0.16, { lay: L.herringbone, tint: (Math.floor(z / 24) % 2) ? [1.25, 0.9, 0.92] : [1.2, 1.18, 1.12], scale: 7 }, 8);
        fixWinding(gp);
      }
      prev = [px, z];
      if (z % 96 < 6) place(P, 'lampDeco', px + 5, z, 0);
      if (z % 72 > 30 && z % 72 < 37) place(P, 'bench', px - 5.5, z, Math.PI / 2, tint(0x2e5e4e));
    }
    // palms: a row by the sidewalk, another by the boardwalk, a few in between
    if (r() < 0.36) P.addPalm(x0 + 3 + r() * 2, P.gy(x0 + 3, z), z + (r() - 0.5) * 3, 0.9 + r() * 0.3);
    if (w > 14 && r() < 0.3) P.addPalm(x1 - 3 - r() * 2, P.gy(x1 - 3, z), z + (r() - 0.5) * 3, 0.9 + r() * 0.3);
    if (w > 24 && r() < 0.08) P.addPalm(cx + (r() - 0.5) * (w - 12), P.gy(cx, z), z, 0.8 + r() * 0.3);
    if (r() < 0.12) P.addBush(x0 + 2, P.gy(x0 + 2, z), z, 0.7 + r() * 0.4, r() < 0.4 ? 'bougain' : 'shrub');
  }
}

// ---- South Pointe Pier --------------------------------------------------------------------
function pierStart(P, S) {
  const pl = PLACES.find((p) => p.id === 'pier');
  let best = S[0], bd = 1e9;
  for (const s of S) { const d = Math.hypot(s.x - pl.x, s.z - pl.z); if (d < bd) { bd = d; best = s; } }
  // out along the shore normal, from 60 studs inland
  const ox = -best.nx, oz = -best.nz;
  return { x: best.x + best.nx * 60, z: best.z + best.nz * 60, ox, oz };
}
function pier(P, A) {
  const LEN = 470, HW = 9, DECK = 8.5, g = P.C.get('surf', A.x + A.ox * LEN / 2, A.z + A.oz * LEN / 2);
  const h = Math.atan2(A.ox, A.oz), F = frame(g, A.x, 0, A.z, h);
  const conc = [0.86, 0.85, 0.82], rail = [0.95, 0.95, 0.93];
  // the ramp up from the sand, then the deck on piles
  const y0 = P.gy(A.x, A.z) + 0.3;
  F.quad([HW, y0, 0], [-HW, y0, 0], [-HW, DECK, 40], [HW, DECK, 40], { lay: L.concrete, tint: conc, scale: 14 });
  F.quad([-HW, DECK, 40], [-HW, DECK, LEN], [HW, DECK, LEN], [HW, DECK, 40], { lay: L.concrete, tint: conc, scale: 14 });
  // the end platform
  const EW = 22, E0 = LEN - 4, E1 = LEN + 46;
  F.box(0, DECK - 0.6, (E0 + E1) / 2, EW, 0.6, (E1 - E0) / 2, { lay: L.concrete, tint: conc, scale: 14, bottom: true });
  for (const sx of [-1, 1]) F.quad([sx * HW, DECK - 1.6, sx > 0 ? 40 : LEN], [sx * HW, DECK - 1.6, sx > 0 ? LEN : 40], [sx * HW, DECK, sx > 0 ? LEN : 40], [sx * HW, DECK, sx > 0 ? 40 : LEN], { lay: L.concrete, tint: shade(conc, 0.85), scale: 10 });
  F.quad([-HW, DECK - 1.6, 40], [HW, DECK - 1.6, 40], [HW, DECK - 1.6, LEN], [-HW, DECK - 1.6, LEN], { lay: L.concrete, tint: shade(conc, 0.6), scale: 10 });
  // piles
  for (let z = 48; z <= E1; z += 24) for (const sx of z > E0 ? [-EW + 2, -6, 6, EW - 2] : [-HW + 1.5, HW - 1.5]) F.box(sx, (DECK - 1.6 - 12) / 2, z, 1.0, (DECK - 1.6 + 12) / 2, 1.0, { lay: L.concrete, tint: [0.62, 0.6, 0.55], scale: 8 });
  // railings and lamps along both sides, benches facing out
  const railLine = (ax, az, bx, bz, ya, yb) => {
    F.tube([ax, ya + 3.4, az], [bx, yb + 3.4, bz], 0.18, 0.18, 5, { lay: L.concrete, tint: rail });
    F.tube([ax, ya + 1.8, az], [bx, yb + 1.8, bz], 0.12, 0.12, 4, { lay: L.concrete, tint: rail });
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 6));
    for (let k = 0; k <= n; k++) { const t = k / n; F.box(ax + (bx - ax) * t, ya + (yb - ya) * t + 1.7, az + (bz - az) * t, 0.18, 1.7, 0.18, { lay: L.concrete, tint: rail }); }
  };
  for (const sx of [-HW + 0.4, HW - 0.4]) { railLine(sx, 6, sx, 40, y0, DECK); railLine(sx, 40, sx, E0, DECK, DECK); }
  railLine(-EW + 0.4, E0, -EW + 0.4, E1, DECK, DECK); railLine(EW - 0.4, E0, EW - 0.4, E1, DECK, DECK); railLine(-EW + 0.4, E1, EW - 0.4, E1, DECK, DECK);
  railLine(-EW + 0.4, E0, -HW, E0, DECK, DECK); railLine(HW, E0, EW - 0.4, E0, DECK, DECK);
  const W = F.W;
  for (let z = 60; z < E1; z += 48) for (const sx of [-1, 1]) {
    const lx = z > E0 ? sx * (EW - 1.5) : sx * (HW - 1.5);
    const p = W(lx, DECK, z);
    place(P, 'lampDeco', p[0], p[2], 0, null, DECK);
    const b = W(lx - sx * 1.2, DECK, z + 18);
    if (z < E0 - 20) place(P, 'bench', b[0], b[2], h - sx * Math.PI / 2, tint(0x8a6a4a), DECK);
  }
  // a shade pavilion at the end
  const pz = (E0 + E1) / 2 + 8;
  for (const sx of [-8, 8]) for (const sz of [-8, 8]) F.box(sx, DECK + 4.5, pz + sz, 0.5, 4.5, 0.5, { lay: L.stucco, tint: [0.95, 0.95, 0.92] });
  F.box(0, DECK + 9.4, pz, 10.5, 0.45, 10.5, { lay: L.stucco, tint: tint(0x2ec4b6, 1.3), scale: 6, bottom: true });
  F.box(0, DECK + 10.6, pz, 6, 0.8, 6, { lay: L.stucco, tint: [0.97, 0.96, 0.93], scale: 6 });
  // collision: walkable decks (they behave like the causeways)
  const p0 = W(0, y0, 0), p1 = W(0, DECK, 40), p2 = W(0, DECK, E0);
  P.phys.addDeck({ x: p0[0], y: y0, z: p0[2] }, { x: p1[0], y: DECK, z: p1[2] }, HW);
  P.phys.addDeck({ x: p1[0], y: DECK, z: p1[2] }, { x: p2[0], y: DECK, z: p2[2] }, HW);
  const e0 = W(0, DECK, E0), e1 = W(0, DECK, E1);
  P.phys.addDeck({ x: e0[0], y: DECK, z: e0[2] }, { x: e1[0], y: DECK, z: e1[2] }, EW);
  // rails as walls
  for (const sx of [-HW + 0.4, HW - 0.4]) { const a = W(sx, 0, 40), b = W(sx, 0, E0); P.box((a[0] + b[0]) / 2, DECK + 1.7, (a[2] + b[2]) / 2, 0.3, 1.7, (E0 - 40) / 2, h, 'metal', { barrier: true }); }
  for (const [ax, az, bx, bz] of [[-EW + 0.4, E0, -EW + 0.4, E1], [EW - 0.4, E0, EW - 0.4, E1], [-EW, E1 - 0.4, EW, E1 - 0.4]]) {
    const a = W(ax, 0, az), b = W(bx, 0, bz), L2 = Math.hypot(b[0] - a[0], b[2] - a[2]);
    P.box((a[0] + b[0]) / 2, DECK + 1.7, (a[2] + b[2]) / 2, 0.3, 1.7, L2 / 2, Math.atan2(b[0] - a[0], b[2] - a[2]), 'metal', { barrier: true });
  }
  P.pier = { x: A.x, z: A.z, dir: [A.ox, A.oz], len: E1, deck: DECK };
}
