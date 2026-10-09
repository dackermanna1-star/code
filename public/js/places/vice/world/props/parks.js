// The parks: the grids' open squares, each with its own character.
//   Bayfront Park: the big fountain (lit in colours at night), the bandshell
//     and its lawn, a baywalk lined with palms along the seawall.
//   Margaret Pace, Peacock and Collins Parks: lawns, crossing paths, a
//     playground, picnic tables, palms and shade trees.
//   Flamingo and Westside Parks: a baseball diamond, tennis and basketball
//     courts, a soccer pitch.
//   Government Center: a paved plaza with a fountain, planters and flags.
//   The cemetery: rows of headstones, white mausoleums, a wall and old oaks.
//   The golf courses: fairways, greens with flags, bunkers, ponds, cart paths.
// Everything lies on the park's gentle hills (ground.heightAt).
import { L, tint, shade, cyl, cylAB, tri, rnd, hash, faceUp, strip, GROUND, TAU } from './kit.js';
import { place } from './furniture.js';
import { fence } from './port.js';

const PARKS = [
  { id: 'bayfront', rect: [380, -1180, 760, -880], kind: 'bayfront' },
  { id: 'pace', rect: [380, -2380, 760, -2000], kind: 'park' },
  { id: 'cemetery', rect: [-1700, -3700, -1290, -3270], kind: 'cemetery' },
  { id: 'westside', rect: [-3640, 1180, -3100, 1720], kind: 'sports' },
  { id: 'peacock', rect: [-260, 2420, 260, 2840], kind: 'park' },
  { id: 'govcenter', rect: [-470, -1520, -250, -1300], kind: 'plaza' },
  { id: 'flamingo', rect: [2300, 1150, 2580, 1450], kind: 'sports' },
  { id: 'collins', rect: [2470, -560, 2740, -300], kind: 'park' },
  { id: 'golfGables', rect: [-2100, 1700, -1500, 2120], kind: 'golf' },
  { id: 'golfBeach', rect: [1960, -3420, 2460, -2980], kind: 'golf' },
];
const INSET = 30;
const PATH = { lay: L.pavers, tint: [1.05, 1.0, 0.94], scale: 8 };

export function buildParks(P) {
  P.parks = [];
  for (const pk of PARKS) {
    const r = rnd(pk.id.length * 977 + Math.round(pk.rect[0]));
    // the part of the park on dry land, inside its ring street
    let [x0, z0, x1, z1] = [pk.rect[0] + INSET, pk.rect[1] + INSET, pk.rect[2] - INSET, pk.rect[3] - INSET];
    const dry = (x, z, pad = 4) => P.plan.isLand(x, z, pad) && P.ground.coastAt(x, z) > 10 && P.roads.clear(x, z) > 2;
    while (x1 > x0 + 40 && !dry(x1, (z0 + z1) / 2)) x1 -= 8;
    while (x0 < x1 - 40 && !dry(x0, (z0 + z1) / 2)) x0 += 8;
    const S = { ...pk, x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, r, dry };
    P.parks.push({ id: pk.id, rect: [x0, z0, x1, z1], kind: pk.kind });
    const fy = (x, z) => P.ground.heightAt(x, z) + 0.12;
    S.fy = fy;
    if (pk.kind === 'golf') { golf(P, S); continue; }
    if (pk.kind === 'cemetery') { cemetery(P, S); continue; }
    if (pk.kind === 'plaza') { plaza(P, S); continue; }
    // paths: a loop and two diagonals
    const m = 14;
    const loop = [[x0 + m, z0 + m], [x1 - m, z0 + m], [x1 - m, z1 - m], [x0 + m, z1 - m], [x0 + m, z0 + m]];
    for (let i = 0; i < 4; i++) path(P, S, loop[i], loop[i + 1]);
    if (pk.kind !== 'sports') { path(P, S, [x0 + m, z0 + m], [x1 - m, z1 - m]); path(P, S, [x1 - m, z0 + m], [x0 + m, z1 - m]); }
    // entrances from the four sides
    path(P, S, [S.cx, z0 - 6], [S.cx, z0 + m]); path(P, S, [S.cx, z1 + 6], [S.cx, z1 - m]);
    path(P, S, [x0 - 6, S.cz], [x0 + m, S.cz]); path(P, S, [x1 + 6, S.cz], [x1 - m, S.cz]);
    if (pk.kind === 'bayfront') bayfront(P, S);
    else if (pk.kind === 'sports') sports(P, S);
    else { playground(P, S, S.cx + (x1 - x0) * 0.25, S.cz - (z1 - z0) * 0.12); circle(P, S, S.cx, S.cz, 14); }
    trees(P, S, pk.kind === 'sports' ? 0.5 : 1);
  }
}

// ---- helpers ------------------------------------------------------------------------------
function path(P, S, a, b, w = 3.2, o = PATH) {
  const g = P.C.get('flat', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  strip(g, a[0], a[1], b[0], b[1], w, (x, z) => S.fy(x, z) + 0.05, o, 8);
  faceAllUp(g);
  // keep trees off it, put benches, lamps and bins beside it
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
  for (let d = 0; d <= len; d += 6) P.occupy(a[0] + ux * d, a[1] + uz * d, w + 2);
  for (let d = 24; d < len - 12; d += 38) {
    const side = (Math.round(d / 38) % 2) ? 1 : -1, x = a[0] + ux * d - uz * side * (w + 2.2), z = a[1] + uz * d + ux * side * (w + 2.2);
    const k = Math.round(d / 38) % 3;
    if (!S.dry(x, z, 2)) continue;
    if (k === 0) place(P, 'lampDeco', x, z, 0);
    else if (k === 1) place(P, 'bench', x, z, Math.atan2(uz * side, -ux * side), tint(0x2e5e4e));
    else if (S.r() < 0.5) place(P, 'bin', x, z, 0, tint(0x2a5d48));
    P.occupy(x, z, 3);
  }
}
function faceAllUp(g) {
  for (let n = g.idx.length - 6; n >= 0 && n >= g.idx.length - 600; n -= 6) {
    const i0 = g.idx[n], i1 = g.idx[n + 1], i2 = g.idx[n + 2], p = g.pos;
    const ax = p[i1 * 3] - p[i0 * 3], az = p[i1 * 3 + 2] - p[i0 * 3 + 2], bx = p[i2 * 3] - p[i0 * 3], bz = p[i2 * 3 + 2] - p[i0 * 3 + 2];
    if (az * bx - ax * bz >= 0) continue;
    for (let k = n; k < n + 6; k += 3) { const t = g.idx[k + 1]; g.idx[k + 1] = g.idx[k + 2]; g.idx[k + 2] = t; }
  }
}
/** A disc (or ellipse) lying on the ground: centre, two rings; o: surface options. */
function disc(g, cx, cz, rx, rz, fy, o, segs = 16, lift = 0.1, wob = 0, seed = 0) {
  const base = g.count, t = o.tint || [1, 1, 1], s = 1 / (o.scale || 8);
  const v = (x, z) => g.vert(x, fy(x, z) + lift, z, 0, 1, 0, x * s, z * s, o.lay ?? 0, o.rough ?? 0.85, o.glow || 0, t[0], t[1], t[2], null);
  v(cx, cz);
  for (let ring = 1; ring <= 2; ring++) for (let i = 0; i < segs; i++) {
    const a = (i / segs) * TAU, k = ring / 2 * (1 + wob * (hash(i, seed, 1) - 0.5) * (ring === 2 ? 1 : 0.5));
    v(cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k);
  }
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs, a1 = base + 1 + i, b1 = base + 1 + j, a2 = base + 1 + segs + i, b2 = base + 1 + segs + j;
    g.idx.push(base, b1, a1, a1, b2, a2, a1, b1, b2);
  }
}
/** A level pad (courts): flat top at the highest ground under it, with sides down to the ground. */
function pad(P, g, cx, cz, hw, hd, rot, o, sideT = [0.8, 0.79, 0.76]) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const W = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
  const corners = [W(-hw, -hd), W(hw, -hd), W(hw, hd), W(-hw, hd)];
  let y = -1e9; for (const p of corners) y = Math.max(y, P.ground.heightAt(p[0], p[1]));
  for (const p of [W(0, 0), W(-hw, 0), W(hw, 0), W(0, -hd), W(0, hd)]) y = Math.max(y, P.ground.heightAt(p[0], p[1]));
  y += 0.25;
  g.quad([corners[0][0], y, corners[0][1]], [corners[1][0], y, corners[1][1]], [corners[2][0], y, corners[2][1]], [corners[3][0], y, corners[3][1]], { normal: [0, 1, 0], ...o });
  faceUp(g);
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4], ya = P.ground.heightAt(a[0], a[1]) - 0.4, yb = P.ground.heightAt(b[0], b[1]) - 0.4;
    g.quad([b[0], yb, b[1]], [a[0], ya, a[1]], [a[0], y, a[1]], [b[0], y, b[1]], { lay: L.concrete, tint: sideT, scale: 6 });
  }
  return y;
}

function trees(P, S, density) {
  const r = S.r, area = (S.x1 - S.x0) * (S.z1 - S.z0);
  let n = Math.round(area / 900 * density);
  for (let i = 0; i < n * 3 && n > 0; i++) {
    const x = S.x0 + 6 + r() * (S.x1 - S.x0 - 12), z = S.z0 + 6 + r() * (S.z1 - S.z0 - 12);
    if (!P.isFree(x, z, 5) || !S.dry(x, z, 4) || !P.free(x, z, 4)) continue;
    const y = P.ground.heightAt(x, z), q = r();
    if (q < 0.55) P.addPalm(x, y, z, 0.8 + r() * 0.35, 0, q < 0.12 ? 'royal' : 'coconut');
    else if (q < 0.85) P.addTree(x, y, z, 0.8 + r() * 0.5);
    else P.addBush(x, y, z, 0.8 + r() * 0.6, r() < 0.4 ? 'bougain' : 'shrub');
    P.occupy(x, z, 6);
    if (--n <= 0) break;
  }
}

/** A round paved plaza at a crossing of paths, with a planter in the middle. */
function circle(P, S, x, z, R) {
  disc(P.C.get('flat', x, z), x, z, R, R, S.fy, { lay: L.herringbone, tint: [1.05, 1.0, 0.95], scale: 8 }, 20, 0.08);
  const g = P.C.get('detail', x, z), y = P.ground.heightAt(x, z);
  cyl(g, x, y, z, 5, 1.6, 14, { lay: L.concrete, tint: [0.88, 0.86, 0.82], capTint: [0.4, 0.3, 0.22] });
  P.addPalm(x, y + 1.4, z, 1.0, 0, 'royal', false);
  P.box(x, y + 0.8, z, 5, 0.8, 5, 0, 'concrete', { cover: true });
  P.occupy(x, z, R);
}

// ---- Bayfront Park ---------------------------------------------------------------------------
function bayfront(P, S) {
  const { cx, cz, x0, x1, z0, z1 } = S;
  fountain(P, S, cx, cz - 20, 22, true);
  // the bandshell at the south end, facing north over its lawn
  bandshell(P, S, cx, z1 - 34, Math.PI);
  // a baywalk along the east edge with a palm every few steps
  for (let z = z0 + 8; z < z1 - 8; z += 14) {
    const x = x1 - 6;
    if (!S.dry(x, z, 1)) continue;
    if (Math.round(z / 14) % 2) P.addPalm(x + 2, P.ground.heightAt(x, z), z, 0.9 + S.r() * 0.2);
    P.occupy(x, z, 4);
  }
  path(P, S, [x1 - 8, z0 + 4], [x1 - 8, z1 - 4], 4, { lay: L.herringbone, tint: [1.15, 1.0, 0.95], scale: 8 });
}
export function fountain(P, S, x, z, R, big) {
  const y = Math.max(P.ground.heightAt(x, z), GROUND) + 0.1, g = P.C.get('surf', x, z), gd = P.C.get('detail', x, z);
  const stone = [0.92, 0.9, 0.86];
  // the paved surround
  disc(P.C.get('flat', x, z), x, z, R + 10, R + 10, () => y - 0.05, { lay: L.herringbone, tint: [1.08, 1.02, 0.96], scale: 8 }, 24, 0);
  // the basin: an outer wall ring and the water
  const seg = 24;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const P0 = (r, a, yy) => [x + Math.cos(a) * r, yy, z + Math.sin(a) * r];
    g.quad(P0(R + 1.2, a1, y), P0(R + 1.2, a0, y), P0(R + 1.2, a0, y + 2.2), P0(R + 1.2, a1, y + 2.2), { lay: L.marble, tint: stone, scale: 6 });
    g.quad(P0(R, a0, y + 0.5), P0(R, a1, y + 0.5), P0(R, a1, y + 2.2), P0(R, a0, y + 2.2), { lay: L.marble, tint: stone, scale: 6 });
    g.quad(P0(R + 1.2, a0, y + 2.2), P0(R, a0, y + 2.2), P0(R, a1, y + 2.2), P0(R + 1.2, a1, y + 2.2), { lay: L.marble, tint: [1, 0.98, 0.95], scale: 6 });
    // underwater lights round the inside, in colours (they glow at night)
    if (i % 2 === 0) { const col = [[1, 0.3, 0.7], [0.2, 0.8, 1], [0.3, 1, 0.7]][(i / 2) % 3]; const p = P0(R - 0.4, (a0 + a1) / 2, y + 0.75); gd.box(p[0], p[1], p[2], 0.5, 0.25, 0.5, 0, { lay: L.whiteTiles, tint: col, glow: 1 }); }
  }
  disc(g, x, z, R, R, () => y + 1.6, { lay: L.whiteTiles, tint: tint(0x2aa5c8, 0.9), rough: 0.04, scale: 6 }, seg, 0);
  // the tiers and the jets
  cyl(g, x, y, z, R * 0.32, 4.2, 16, { lay: L.marble, tint: stone, scale: 6 });
  cyl(g, x, y + 4.2, z, R * 0.5, 0.8, 18, { lay: L.marble, tint: stone, scale: 6, capTint: tint(0x2aa5c8, 0.9) });
  cyl(g, x, y + 5, z, R * 0.12, 4.5, 10, { lay: L.marble, tint: stone, scale: 6 });
  if (big) cyl(g, x, y + 9.5, z, R * 0.22, 0.6, 12, { lay: L.marble, tint: stone, scale: 6, capTint: tint(0x2aa5c8, 0.9) });
  const water = { lay: L.whiteTiles, tint: [1.15, 1.25, 1.3], rough: 0.1, glow: 0.4 };
  cylAB(g, [x, y + 9, z], [x, y + (big ? 26 : 16), z], 0.9, 0.3, 8, water);
  for (let k = 0; k < (big ? 12 : 6); k++) {
    const a = (k / (big ? 12 : 6)) * TAU, rr = R * 0.75;
    // arcs of water from the rim towards the middle
    let prev = [x + Math.cos(a) * rr, y + 1.7, z + Math.sin(a) * rr];
    for (let t = 1; t <= 4; t++) {
      const u = t / 4, d = rr * (1 - u * 0.55), h = y + 1.7 + Math.sin(u * Math.PI) * 7;
      const p = [x + Math.cos(a) * d, h, z + Math.sin(a) * d];
      cylAB(g, prev, p, 0.35, 0.3, 5, water);
      prev = p;
    }
  }
  P.box(x, y + 1.1, z, R + 1.2, 1.1, R + 1.2, 0, 'concrete', { cover: true, fountain: true });
  P.occupy(x, z, R + 12);
}
function bandshell(P, S, x, z, h) {
  const y = P.ground.heightAt(x, z) + 0.1, g = P.C.get('surf', x, z);
  const c = Math.cos(h), s = Math.sin(h), W = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  // the stage
  const st = W(0, 0, 0);
  g.box(st[0], y + 2, st[2], 30, 2, 18, h, { lay: L.concrete, tint: [0.9, 0.89, 0.86], scale: 8 });
  g.box(st[0], y + 4.05, st[2], 29, 0.05, 17, h, { lay: L.deck, tint: [0.7, 0.55, 0.42], scale: 8 });
  // the shell: a quarter sphere opening towards +z (local)
  const R = 34, n = 12, m = 6;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const t0 = Math.PI * (i / n), t1 = Math.PI * ((i + 1) / n), p0 = (Math.PI / 2) * (j / m), p1 = (Math.PI / 2) * ((j + 1) / m);
    const Q = (t, p) => W(Math.cos(t) * Math.cos(p) * R, 4 + Math.sin(p) * R * 0.85, -Math.sin(t) * Math.cos(p) * R * 0.75);
    const o = { lay: L.stucco, tint: (j + i) % 2 ? [1.25, 1.24, 1.2] : [1.18, 1.17, 1.13], scale: 10 };
    g.quad(Q(t0, p0), Q(t1, p0), Q(t1, p1), Q(t0, p1), o);
    g.quad(Q(t1, p0), Q(t0, p0), Q(t0, p1), Q(t1, p1), { ...o, tint: shade(o.tint, 0.8) });
  }
  // lights along the arch (glow at night)
  for (let i = 0; i <= 16; i++) { const t = Math.PI * (i / 16); const p = W(Math.cos(t) * R, 4 + Math.sin(t) * 2 + 0.5, 0.6); g.box(p[0], p[1], p[2], 0.45, 0.45, 0.45, 0, { lay: L.whiteTiles, tint: [1, 0.85, 0.6], glow: 1 }); }
  // the audience: curved rows of benches on the lawn in front
  for (let row = 0; row < 3; row++) {
    const rr = 40 + row * 10;
    for (let k = -2; k <= 2; k++) {
      const a = k * 0.22, p = W(Math.sin(a) * rr, 0, rr * Math.cos(a) + 6);
      if (!S.dry(p[0], p[2], 2)) continue;
      place(P, 'bench', p[0], p[2], h + Math.PI + a, tint(0xd8d2c4));
    }
  }
  P.box(st[0], y + 2, st[2], 30, 2, 18, h, 'concrete', { cover: true });
  const sh = W(0, 0, -12);
  P.box(sh[0], y + 16, sh[2], 34, 14, 8, h, 'concrete', {});
  P.occupy(x, z, 40);
  const lawn = W(0, 0, 55);
  P.occupy(lawn[0], lawn[2], 45);
}

// ---- playgrounds and sports ------------------------------------------------------------------
function playground(P, S, x, z) {
  if (!S.dry(x, z, 20) || !P.isFree(x, z, 16)) return;
  const g = P.C.get('detail', x, z), gf = P.C.get('flat', x, z);
  disc(gf, x, z, 17, 13, S.fy, { lay: L.stucco, tint: tint(0xd8482f, 0.9), scale: 6, rough: 0.95 }, 16, 0.08);
  const y = P.ground.heightAt(x, z);
  const red = tint(0xe63946, 1.2), blue = tint(0x1d6fd8, 1.2), yel = tint(0xffc21a, 1.2), steel = [0.75, 0.77, 0.8];
  // a climbing tower with a slide
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(x - 6 + sx * 2.5, y + 4, z + sz * 2.5, 0.25, 4, 0.25, 0, { lay: L.stucco, tint: blue });
  g.box(x - 6, y + 4.2, z, 2.8, 0.2, 2.8, 0, { lay: L.deck, tint: [0.8, 0.7, 0.6] });
  for (const [a, b, c, d] of [[[-8.8, 7.6, -2.8], [-3.2, 7.6, -2.8], [-6, 10.4, 0], [-6, 10.4, 0]], [[-3.2, 7.6, 2.8], [-8.8, 7.6, 2.8], [-6, 10.4, 0], [-6, 10.4, 0]], [[-3.2, 7.6, -2.8], [-3.2, 7.6, 2.8], [-6, 10.4, 0], [-6, 10.4, 0]], [[-8.8, 7.6, 2.8], [-8.8, 7.6, -2.8], [-6, 10.4, 0], [-6, 10.4, 0]]]) g.quad([x + a[0], y + a[1], z + a[2]], [x + b[0], y + b[1], z + b[2]], [x + c[0], y + c[1], z + c[2]], [x + d[0], y + d[1], z + d[2]], { lay: L.stucco, tint: red });
  g.quad([x - 3.4, y + 4.4, z + 1.3], [x - 3.4, y + 4.4, z - 1.3], [x + 5, y + 0.6, z - 1.3], [x + 5, y + 0.6, z + 1.3], { lay: L.stucco, tint: yel, rough: 0.3 });
  g.quad([x - 3.4, y + 4.3, z - 1.3], [x - 3.4, y + 4.3, z + 1.3], [x + 5, y + 0.5, z + 1.3], [x + 5, y + 0.5, z - 1.3], { lay: L.stucco, tint: shade(yel, 0.7) });
  // swings
  const sx0 = x + 4, sz0 = z + 8;
  for (const dx of [-5, 5]) { cylAB(g, [sx0 + dx, y, sz0 - 2], [sx0 + dx, y + 8, sz0], 0.2, 0.2, 5, { lay: L.concrete, tint: steel }); cylAB(g, [sx0 + dx, y, sz0 + 2], [sx0 + dx, y + 8, sz0], 0.2, 0.2, 5, { lay: L.concrete, tint: steel }); }
  cylAB(g, [sx0 - 5, y + 8, sz0], [sx0 + 5, y + 8, sz0], 0.22, 0.22, 5, { lay: L.concrete, tint: steel });
  for (const dx of [-2.2, 2.2]) {
    for (const e of [-0.6, 0.6]) cylAB(g, [sx0 + dx + e, y + 8, sz0], [sx0 + dx + e, y + 2, sz0], 0.05, 0.05, 3, { lay: L.concrete, tint: [0.3, 0.3, 0.3] });
    g.box(sx0 + dx, y + 1.95, sz0, 0.8, 0.1, 0.4, 0, { lay: L.stucco, tint: blue });
  }
  P.box(x - 6, y + 4, z, 3, 4, 3, 0, 'metal', { prop: true });
  P.occupy(x, z, 18);
}

function sports(P, S) {
  const { x0, x1, z0, z1 } = S;
  const w = x1 - x0, d = z1 - z0;
  // a baseball diamond in one corner
  baseball(P, S, x0 + w * 0.3, z0 + d * 0.3, Math.PI * 0.25);
  // tennis courts in a row and two basketball courts
  const tx = x1 - 50, tz = z0 + 40;
  for (let k = 0; k < 2; k++) tennis(P, S, tx, tz + k * 44);
  basketball(P, S, x0 + w * 0.3, z1 - 44);
  basketball(P, S, x0 + w * 0.3 + 52, z1 - 44);
  if (w > 380 && d > 380) soccer(P, S, x1 - 110, z1 - 90);
}
function tennis(P, S, x, z) {
  const hw = 18, hd = 38;
  if (!S.dry(x, z, 24) || !P.isFree(x, z, 20)) return;
  const g = P.C.get('flat', x, z), gp = P.C.get('paint', x, z);
  const y = pad(P, g, x, z, hw + 4, hd + 6, Math.PI / 2, { lay: L.concrete, tint: tint(0x2f7f5a, 1.0), scale: 10, rough: 0.7 });
  // the court in blue inside a green surround, white lines
  const R2 = (cx, cz, hx, hz, o) => { gp.quad([cx - hx, y + 0.04, cz - hz], [cx - hx, y + 0.04, cz + hz], [cx + hx, y + 0.04, cz + hz], [cx + hx, y + 0.04, cz - hz], { normal: [0, 1, 0], ...o }); faceUp(gp); };
  R2(x, z, hd, hw, { lay: L.concrete, tint: tint(0x2c5fa0, 1.0), scale: 10, rough: 0.7 });
  const wl = { lay: L.stucco, tint: [1.2, 1.2, 1.2] };
  for (const e of [-hd, hd]) R2(x + e, z, 0.3, hw, wl);
  for (const e of [-hw, hw, -hw + 4.5, hw - 4.5]) R2(x, z + e, hd, 0.25, wl);
  for (const e of [-21, 21]) R2(x + e, z, 0.25, hw - 4.5, wl);
  R2(x, z, 21, 0.2, wl);
  // the net and its posts
  const gd = P.C.get('detail', x, z);
  gd.quad([x, y + 0.2, z - hw - 1], [x, y + 0.2, z + hw + 1], [x, y + 3.2, z + hw + 1], [x, y + 3.2, z - hw - 1], { lay: L.shutter, tint: [0.1, 0.1, 0.1], scale: 1 });
  gd.quad([x, y + 0.2, z + hw + 1], [x, y + 0.2, z - hw - 1], [x, y + 3.2, z - hw - 1], [x, y + 3.2, z + hw + 1], { lay: L.shutter, tint: [0.1, 0.1, 0.1], scale: 1 });
  gd.box(x, y + 3.25, z, 0.08, 0.12, hw + 1, 0, { lay: L.stucco, tint: [1.2, 1.2, 1.2] });
  // fence round it
  const fx = hd + 6, fz = hw + 4;
  fence(P, x - fx, z - fz, x + fx, z - fz, 10); fence(P, x - fx, z + fz, x + fx, z + fz, 10);
  fence(P, x - fx, z - fz, x - fx, z + fz, 10); fence(P, x + fx, z - fz, x + fx, z + fz, 10);
  P.occupy(x, z, 44);
}
function basketball(P, S, x, z) {
  const hw = 22, hd = 20;
  if (!S.dry(x, z, 24) || !P.isFree(x, z, 22)) return;
  const g = P.C.get('flat', x, z), gp = P.C.get('paint', x, z);
  const y = pad(P, g, x, z, hw, hd, 0, { lay: L.concrete, tint: tint(0x2b4c7e, 1.0), scale: 10, rough: 0.75 });
  const R2 = (cx, cz, hx, hz, o) => { gp.quad([cx - hx, y + 0.04, cz - hz], [cx - hx, y + 0.04, cz + hz], [cx + hx, y + 0.04, cz + hz], [cx + hx, y + 0.04, cz - hz], { normal: [0, 1, 0], ...o }); faceUp(gp); };
  R2(x, z - hd + 9, 6, 9, { lay: L.concrete, tint: tint(0xd9772a, 1.0), scale: 8 });
  const wl = { lay: L.stucco, tint: [1.2, 1.2, 1.2] };
  for (const e of [-hw + 1, hw - 1]) R2(x + e, z, 0.25, hd - 1, wl);
  R2(x, z - hd + 1, hw - 1, 0.25, wl); R2(x, z + hd - 1, hw - 1, 0.25, wl);
  // the hoop
  const gd = P.C.get('detail', x, z), hz = z - hd + 2;
  cyl(gd, x, y, hz - 2, 0.35, 11, 6, { lay: L.concrete, tint: [0.25, 0.27, 0.3] });
  cylAB(gd, [x, y + 10.6, hz - 2], [x, y + 10.6, hz], 0.2, 0.2, 4, { lay: L.concrete, tint: [0.25, 0.27, 0.3] });
  gd.box(x, y + 11.5, hz, 2.6, 1.7, 0.1, 0, { lay: L.stucco, tint: [1.2, 1.2, 1.2] });
  for (let k = 0; k < 8; k++) { const a0 = (k / 8) * TAU, a1 = ((k + 1) / 8) * TAU; cylAB(gd, [x + Math.cos(a0) * 0.9, y + 10.2, hz + 1.1 + Math.sin(a0) * 0.9], [x + Math.cos(a1) * 0.9, y + 10.2, hz + 1.1 + Math.sin(a1) * 0.9], 0.06, 0.06, 3, { lay: L.concrete, tint: tint(0xff5a1f, 1.2) }); }
  P.box(x, y + 5.5, hz - 2, 0.4, 5.5, 0.4, 0, 'metal', { pole: true });
  P.occupy(x, z, 26);
}
function baseball(P, S, x, z, rot) {
  // home plate at (x, z); the diamond opens towards `rot` (the direction of second base)
  if (!S.dry(x, z, 10)) return;
  const fx = Math.sin(rot), fz = Math.cos(rot), B = 58, g = P.C.get('flat', x, z), gp = P.C.get('paint', x, z);
  const dirt = { lay: L.gravel, tint: [1.05, 0.8, 0.62], scale: 10 };
  // the infield dirt: a fan beyond the bases
  const pts = [];
  for (let k = 0; k <= 10; k++) { const a = rot - Math.PI / 4 + (k / 10) * (Math.PI / 2), rr = B * 1.45; pts.push([x + Math.sin(a) * rr, z + Math.cos(a) * rr]); }
  const base = g.count;
  g.vert(x, S.fy(x, z), z, 0, 1, 0, x / 10, z / 10, dirt.lay, 0.9, 0, dirt.tint[0], dirt.tint[1], dirt.tint[2], null);
  for (const p of pts) g.vert(p[0], S.fy(p[0], p[1]), p[1], 0, 1, 0, p[0] / 10, p[1] / 10, dirt.lay, 0.9, 0, dirt.tint[0], dirt.tint[1], dirt.tint[2], null);
  for (let k = 0; k < pts.length - 1; k++) {
    const a = base + 1 + k, b = base + 2 + k;
    // wind so it faces up whichever way round it goes
    const ax = g.pos[a * 3] - x, az = g.pos[a * 3 + 2] - z, bx = g.pos[b * 3] - x, bz = g.pos[b * 3 + 2] - z;
    if (az * bx - ax * bz >= 0) g.idx.push(base, a, b); else g.idx.push(base, b, a);
  }
  // the grass inside the diamond
  const c1 = [x + Math.sin(rot - Math.PI / 4) * B, z + Math.cos(rot - Math.PI / 4) * B], c2 = [x + fx * B * Math.SQRT2, z + fz * B * Math.SQRT2], c3 = [x + Math.sin(rot + Math.PI / 4) * B, z + Math.cos(rot + Math.PI / 4) * B];
  const sh = 0.82, cc = (p) => [x + (p[0] - x) * sh + fx * B * 0.12, z + (p[1] - z) * sh + fz * B * 0.12];
  const q1 = cc([x, z]), q2 = cc(c1), q3 = cc(c2), q4 = cc(c3);
  gp.quad([q1[0], S.fy(q1[0], q1[1]) + 0.05, q1[1]], [q2[0], S.fy(q2[0], q2[1]) + 0.05, q2[1]], [q3[0], S.fy(q3[0], q3[1]) + 0.05, q3[1]], [q4[0], S.fy(q4[0], q4[1]) + 0.05, q4[1]], { lay: L.lawn, tint: [0.75, 1.0, 0.6], scale: 12 });
  faceUp(gp);
  // bases and the foul lines
  for (const p of [c1, c2, c3, [x, z]]) disc(gp, p[0], p[1], 1.2, 1.2, S.fy, { lay: L.stucco, tint: [1.2, 1.2, 1.2] }, 4, 0.12);
  for (const a of [rot - Math.PI / 4, rot + Math.PI / 4]) { const e = [x + Math.sin(a) * B * 2.2, z + Math.cos(a) * B * 2.2]; strip(gp, x, z, e[0], e[1], 0.3, (xx, zz) => S.fy(xx, zz) + 0.14, { lay: L.stucco, tint: [1.2, 1.2, 1.2] }, 10); faceAllUp(gp); }
  // the backstop behind home plate, dugouts and bleachers
  const bk = (a, r0) => [x - Math.sin(rot + a) * r0, z - Math.cos(rot + a) * r0];
  for (let k = -2; k < 2; k++) { const p = bk(k * 0.35, 16), q = bk((k + 1) * 0.35, 16); fence(P, p[0], p[1], q[0], q[1], 16); }
  for (const s of [-1, 1]) {
    const a = rot + s * (Math.PI / 4 + 0.35), p = [x + Math.sin(a) * B * 0.9, z + Math.cos(a) * B * 0.9];
    const gd = P.C.get('detail', p[0], p[1]), yy = P.ground.heightAt(p[0], p[1]);
    for (let row = 0; row < 4; row++) gd.box(p[0] + Math.sin(a + Math.PI / 2 * s) * row * 2.2, yy + 0.6 + row * 1.2, p[1] + Math.cos(a + Math.PI / 2 * s) * row * 2.2, 14, 0.6 + row * 0.6, 1.1, a + Math.PI / 2, { lay: L.concrete, tint: [0.8, 0.82, 0.85] });
    P.box(p[0], yy + 2.4, p[1], 14, 2.4, 4, a + Math.PI / 2, 'metal', { cover: true });
  }
  P.occupy(x + fx * B * 0.7, z + fz * B * 0.7, B * 1.2);
}
function soccer(P, S, x, z) {
  const hw = 60, hd = 38;
  if (!S.dry(x, z, 50) || !P.isFree(x, z, 40)) return;
  const gp = P.C.get('paint', x, z), wl = { lay: L.stucco, tint: [1.2, 1.2, 1.2] };
  const line = (ax, az, bx, bz) => { strip(gp, ax, az, bx, bz, 0.35, (xx, zz) => S.fy(xx, zz) + 0.1, wl, 12); faceAllUp(gp); };
  line(x - hw, z - hd, x + hw, z - hd); line(x - hw, z + hd, x + hw, z + hd); line(x - hw, z - hd, x - hw, z + hd); line(x + hw, z - hd, x + hw, z + hd); line(x, z - hd, x, z + hd);
  for (const s of [-1, 1]) { line(x + s * hw, z - 18, x + s * (hw - 16), z - 18); line(x + s * hw, z + 18, x + s * (hw - 16), z + 18); line(x + s * (hw - 16), z - 18, x + s * (hw - 16), z + 18); }
  const pts = []; for (let k = 0; k <= 16; k++) { const a = (k / 16) * TAU; pts.push([x + Math.cos(a) * 12, z + Math.sin(a) * 12]); }
  for (let k = 0; k < 16; k++) line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]);
  // goals
  for (const s of [-1, 1]) {
    const gx = x + s * hw, gd = P.C.get('detail', gx, z), y = P.ground.heightAt(gx, z);
    for (const e of [-8, 8]) gd.box(gx, y + 3.2, z + e, 0.25, 3.2, 0.25, 0, { lay: L.stucco, tint: [1.2, 1.2, 1.2] });
    gd.box(gx, y + 6.4, z, 0.25, 0.25, 8.2, 0, { lay: L.stucco, tint: [1.2, 1.2, 1.2] });
    P.C.get('fence', gx, z).quad([gx + s * 4, y, z - 8], [gx + s * 4, y, z + 8], [gx, y + 6.4, z + 8], [gx, y + 6.4, z - 8], { scale: 2 });
  }
  P.occupy(x, z, hw);
}

// ---- Government Center plaza --------------------------------------------------------------
function plaza(P, S) {
  const { x0, x1, z0, z1, cx, cz } = S;
  const g = P.C.get('flat', cx, cz);
  for (let x = x0 - 12; x < x1 + 12; x += 40) for (let z = z0 - 12; z < z1 + 12; z += 40) {
    const xa = x, xb = Math.min(x + 40, x1 + 12), za = z, zb = Math.min(z + 40, z1 + 12);
    g.quad([xa, S.fy(xa, za), za], [xa, S.fy(xa, zb), zb], [xb, S.fy(xb, zb), zb], [xb, S.fy(xb, za), za], { lay: L.pavers, tint: [1.08, 1.04, 0.98], scale: 9, normal: [0, 1, 0] });
    faceUp(g);
  }
  fountain(P, S, cx, cz, 14, false);
  // planters with royal palms in rows, benches between, flag poles at the north edge
  for (const sx of [-1, 1]) for (let k = -2; k <= 2; k++) {
    const x = cx + sx * (x1 - x0) * 0.38, z = cz + k * (z1 - z0) * 0.19;
    const y = P.ground.heightAt(x, z);
    place(P, 'planter', x, z, 0);
    P.addPalm(x, y + 2.2, z, 0.85, 0, 'royal', false);
    if (k < 2) place(P, 'bench', x, z + (z1 - z0) * 0.095, sx > 0 ? -Math.PI / 2 : Math.PI / 2, tint(0x6b6b6b));
  }
  const gd = P.C.get('surf', cx, z0);
  for (let k = -1; k <= 1; k++) {
    const x = cx + k * 14, z = z0 + 6, y = P.ground.heightAt(x, z);
    cylAB(gd, [x, y, z], [x, y + 34, z], 0.35, 0.22, 6, { lay: L.concrete, tint: [0.92, 0.92, 0.9] });
    const col = [[tint(0x1d3557, 1.2), tint(0xe63946, 1.2)], [tint(0xff8c42, 1.2), tint(0xfdfcf7, 1.2)], [tint(0x2ec4b6, 1.2), tint(0xffd166, 1.2)]][k + 1];
    for (let b = 0; b < 2; b++) { gd.quad([x, y + 33 - b * 2.2, z], [x + 9, y + 33 - b * 2.2, z], [x + 9, y + 31 - b * 2.2, z], [x, y + 31 - b * 2.2, z], { lay: L.stucco, tint: col[b] }); gd.quad([x + 9, y + 33 - b * 2.2, z], [x, y + 33 - b * 2.2, z], [x, y + 31 - b * 2.2, z], [x + 9, y + 31 - b * 2.2, z], { lay: L.stucco, tint: col[b] }); }
  }
}

// ---- the cemetery ---------------------------------------------------------------------------
function cemetery(P, S) {
  const { x0, x1, z0, z1, cx, cz, r } = S;
  // the wall round it (white, with gates in the middle of each side)
  const gw = P.C.get('surf', cx, cz);
  const wall = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 20);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, xa = ax + (bx - ax) * t0, za = az + (bz - az) * t0, xb = ax + (bx - ax) * t1, zb = az + (bz - az) * t1;
      const mx = (xa + xb) / 2, mz = (za + zb) / 2;
      if (Math.abs(mx - cx) < 10 && Math.abs(za - zb) < 1) continue; // gates
      if (Math.abs(mz - cz) < 10 && Math.abs(xa - xb) < 1) continue;
      const y = P.ground.heightAt(mx, mz);
      gw.box(mx, y + 3, mz, 0.9, 3.4, len / n / 2 + 0.5, Math.atan2(xb - xa, zb - za), { lay: L.stucco, tint: [1.1, 1.08, 1.02], scale: 8 });
      P.box(mx, y + 3, mz, 0.9, 3.4, len / n / 2 + 0.5, Math.atan2(xb - xa, zb - za), 'concrete', { wall: true, cover: true });
    }
  };
  wall(x0 - 6, z0 - 6, x1 + 6, z0 - 6); wall(x0 - 6, z1 + 6, x1 + 6, z1 + 6); wall(x0 - 6, z0 - 6, x0 - 6, z1 + 6); wall(x1 + 6, z0 - 6, x1 + 6, z1 + 6);
  // the main paths: a cross, gravel
  const gravel = { lay: L.gravel, tint: [1.15, 1.08, 0.98], scale: 8 };
  path(P, S, [cx, z0 - 6], [cx, z1 + 6], 4, gravel); path(P, S, [x0 - 6, cz], [x1 + 6, cz], 4, gravel);
  // mausoleums along the main paths
  for (const [mx, mz, h] of [[cx - 30, cz - 40, 0], [cx + 30, cz - 40, 0], [cx - 30, cz + 40, Math.PI], [cx + 30, cz + 40, Math.PI], [cx - 60, cz - 22, Math.PI / 2], [cx + 60, cz + 22, -Math.PI / 2]]) mausoleum(P, mx, mz, h, r);
  // rows of headstones in the four quarters
  const stone = [[0.78, 0.78, 0.76], [0.66, 0.65, 0.63], [0.9, 0.89, 0.86], [0.55, 0.55, 0.57]];
  for (let x = x0 + 6; x < x1 - 4; x += 5.5) for (let z = z0 + 6; z < z1 - 4; z += 9) {
    if (Math.abs(x - cx) < 9 || Math.abs(z - cz) < 9 || !P.isFree(x, z, 2.5) || r() < 0.12) continue;
    const y = P.ground.heightAt(x, z), g = P.C.get('detail', x, z), t = stone[Math.floor(r() * stone.length)], k = r();
    if (k < 0.7) g.box(x, y + 1.1, z, 1.1, 1.3, 0.3, (r() - 0.5) * 0.08, { lay: L.marble, tint: t, scale: 3 });
    else if (k < 0.85) { g.box(x, y + 1.6, z, 0.25, 1.8, 0.25, 0, { lay: L.marble, tint: t, scale: 3 }); g.box(x, y + 2.4, z, 0.9, 0.22, 0.24, 0, { lay: L.marble, tint: t, scale: 3 }); }
    else g.box(x, y + 0.5, z + 1.5, 1.3, 0.5, 2.4, 0, { lay: L.marble, tint: t, scale: 3 });
  }
  // old oaks and a few palms
  for (let i = 0; i < 26; i++) {
    const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
    if (Math.abs(x - cx) < 10 || Math.abs(z - cz) < 10 || !P.isFree(x, z, 4)) continue;
    if (r() < 0.75) P.addTree(x, P.ground.heightAt(x, z), z, 0.9 + r() * 0.5); else P.addPalm(x, P.ground.heightAt(x, z), z, 0.9, 0, 'royal');
    P.occupy(x, z, 5);
  }
}
function mausoleum(P, x, z, h, r) {
  const y = P.ground.heightAt(x, z), g = P.C.get('surf', x, z), c = Math.cos(h), s = Math.sin(h);
  const W = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  const white = [1.12, 1.1, 1.05], w = 7 + r() * 3, d = 9 + r() * 3, hh = 9 + r() * 3;
  g.box(x, y + 0.5, z, w + 1.5, 0.5, d + 1.5, h, { lay: L.marble, tint: white, scale: 6 });
  g.box(x, y + 1 + hh / 2, z, w, hh / 2, d, h, { lay: L.marble, tint: white, scale: 6 });
  // the pediment roof (a triangular prism along local z)
  const ry = 1 + hh, rh = 3.5;
  for (const sz of [-1, 1]) { tri(g, W(-w - 0.6, ry, sz * (d + 0.6)), W(w + 0.6, ry, sz * (d + 0.6)), W(0, ry + rh, sz * (d + 0.6)), { lay: L.marble, tint: white, scale: 6 }); if (sz < 0) { const a = W(-w - 0.6, ry, -d - 0.6), b = W(w + 0.6, ry, -d - 0.6), cc = W(0, ry + rh, -d - 0.6); tri(g, b, a, cc, { lay: L.marble, tint: white, scale: 6 }); } }
  for (const sx of [-1, 1]) { const za = sx > 0 ? d + 0.6 : -(d + 0.6); g.quad(W(sx * (w + 0.6), ry, za), W(sx * (w + 0.6), ry, -za), W(0, ry + rh, -za), W(0, ry + rh, za), { lay: L.marble, tint: shade(white, 0.92), scale: 6 }); }
  // columns at the front and a dark door
  for (const lx of [-w * 0.7, -w * 0.25, w * 0.25, w * 0.7]) { const p = W(lx, 0, d + 0.9); cyl(g, p[0], y + 1, p[2], 0.55, hh, 8, { lay: L.marble, tint: white, scale: 4 }); }
  const D = [W(-1.6, 1, d + 0.06), W(1.6, 1, d + 0.06), W(1.6, 6.5, d + 0.06), W(-1.6, 6.5, d + 0.06)];
  g.quad(D[0], D[1], D[2], D[3], { lay: L.shutter, tint: [0.18, 0.2, 0.18], scale: 3 });
  P.box(x, y + 1 + hh / 2, z, w + 0.6, hh / 2 + 1, d + 1, h, 'concrete', { building: false, cover: true });
  P.occupy(x, z, Math.max(w, d) + 4);
}

// ---- golf ---------------------------------------------------------------------------------
function golf(P, S) {
  const { x0, x1, z0, z1, r } = S;
  // holes: tee -> green, laid out across the course
  const holes = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, zz = z0 + 40 + t * (z1 - z0 - 80);
    const flip = i % 2;
    holes.push({ tee: [flip ? x1 - 40 : x0 + 40, zz + (r() - 0.5) * 20], green: [flip ? x0 + 60 : x1 - 60, zz + (r() - 0.5) * 30] });
  }
  for (const H of holes) {
    const [tx, tz] = H.tee, [gx, gz] = H.green;
    if (!S.dry(tx, tz, 10) || !S.dry(gx, gz, 10)) continue;
    // the fairway: a mown band of brighter grass
    const len = Math.hypot(gx - tx, gz - tz), steps = Math.ceil(len / 30);
    for (let k = 0; k <= steps; k++) {
      const u = k / steps, x = tx + (gx - tx) * u, z = tz + (gz - tz) * u, w = 16 + Math.sin(u * Math.PI) * 10;
      disc(P.C.get('flat', x, z), x, z, w, w * 0.9, S.fy, { lay: L.lawn, tint: [0.72, 1.12, 0.55], scale: 10 }, 12, 0.05, 0.3, k);
    }
    // the tee box and the green with its flag
    disc(P.C.get('paint', tx, tz), tx, tz, 7, 5, S.fy, { lay: L.lawn, tint: [0.6, 1.18, 0.45], scale: 6 }, 10, 0.1);
    disc(P.C.get('paint', gx, gz), gx, gz, 15, 12, S.fy, { lay: L.lawn, tint: [0.45, 1.25, 0.35], scale: 5, rough: 0.6 }, 16, 0.1, 0.25, Math.round(gx));
    const gy = P.ground.heightAt(gx, gz), fx = gx + 3, fz = gz - 2, gd = P.C.get('detail', gx, gz);
    cylAB(gd, [fx, gy, fz], [fx, gy + 9, fz], 0.08, 0.08, 4, { lay: L.stucco, tint: [1.2, 1.2, 1.2] });
    gd.quad([fx, gy + 9, fz], [fx + 3, gy + 8.2, fz], [fx + 3, gy + 7, fz], [fx, gy + 7.6, fz], { lay: L.stucco, tint: tint(0xe63946, 1.2) });
    gd.quad([fx + 3, gy + 8.2, fz], [fx, gy + 9, fz], [fx, gy + 7.6, fz], [fx + 3, gy + 7, fz], { lay: L.stucco, tint: tint(0xe63946, 1.2) });
    // bunkers by the green and along the fairway, a pond on some holes
    for (let k = 0; k < 3; k++) {
      const a = r() * TAU, bx = gx + Math.cos(a) * (20 + r() * 6), bz = gz + Math.sin(a) * (17 + r() * 6);
      if (S.dry(bx, bz, 6)) disc(P.C.get('paint', bx, bz), bx, bz, 6 + r() * 4, 4 + r() * 3, S.fy, { lay: L.sand, tint: [1.25, 1.2, 1.1], scale: 6 }, 12, 0.12, 0.5, k * 31 + Math.round(bx));
    }
    if (r() < 0.5) {
      const u = 0.45 + r() * 0.2, px = tx + (gx - tx) * u + (r() - 0.5) * 30, pz = tz + (gz - tz) * u + 28 * (r() < 0.5 ? 1 : -1);
      if (S.dry(px, pz, 16)) disc(P.C.get('paint', px, pz), px, pz, 16 + r() * 8, 11 + r() * 5, S.fy, { lay: L.whiteTiles, tint: tint(0x1f6f7a, 0.55), rough: 0.03, scale: 6 }, 16, 0.14, 0.35, Math.round(px));
    }
    // a cart path alongside
    const ox = -(gz - tz) / len * 30, oz = (gx - tx) / len * 30;
    if (S.dry(tx + ox, tz + oz, 3) && S.dry(gx + ox, gz + oz, 3)) path(P, S, [tx + ox, tz + oz], [gx + ox, gz + oz], 2.2, { lay: L.concrete, tint: [1.05, 1.03, 1.0], scale: 8 });
    P.occupy(tx, tz, 10); P.occupy(gx, gz, 24);
    for (let k = 0; k <= steps; k++) { const u = k / steps; P.occupy(tx + (gx - tx) * u, tz + (gz - tz) * u, 18); }
  }
  // palms and trees in the rough
  trees(P, S, 0.45);
}
