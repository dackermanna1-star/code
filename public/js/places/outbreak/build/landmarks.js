// Landmarks: the ruined castle on its hill, the lighthouse on the cape, the
// radio station on its mountain.
import { mat } from './kit.js';
import { S, wall, doorIn, stairs, slab, railing } from './parts.js';
import { body } from './body.js';
import * as Fu from './furniture.js';
import { ladder } from './houses.js';

const STONE = () => mat('stone', 0xc8c0b4), STONE_DARK = () => mat('stone', 0x9a948c);

/**
 * Vorona Castle: a ring of broken curtain walls with round towers on a hilltop, and the keep - its stairs
 * still climb to the top. Built over uneven ground: every piece reaches down to the land under it.
 */
export function castle(K, s) {
  const r = K.r, st = STONE(), sd = STONE_DARK();
  // the ring: an irregular polygon
  const n = 7, R = 52;
  const pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + (r() - 0.5) * 0.3; const rr = R * (0.85 + r() * 0.3); pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.85]); }
  for (let i = 0; i < n; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % n];
    const L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
    // the wall in stretches, each standing on the ground under it; some fallen to stumps, some gone
    const segs = Math.ceil(L / 7);
    for (let k = 0; k < segs; k++) {
      const f0 = k / segs, f1 = (k + 1) / segs, fm = (f0 + f1) / 2;
      const x = x0 + (x1 - x0) * fm, z = z0 + (z1 - z0) * fm;
      const g = K.groundAt(x, z);
      const ruin = r();
      if (i === 2 && k >= segs / 2 - 1 && k <= segs / 2) continue; // the gate
      if (ruin < 0.1) continue;
      const h = ruin < 0.3 ? 3 + r() * 4 : 13 + r() * 4;
      K.push(x, g - 3, z, yaw);
      K.box(0, (h + 3) / 2, 0, L / segs / 2 + 0.1, (h + 3) / 2, 2.2, { side: st, top: sd }, { skip: 'ny' });
      // battlements along the top of the standing stretches
      if (h > 12) for (let b = -1; b <= 1; b += 2) K.box(b * L / segs / 4, h + 3 + 1, 1.6, L / segs / 8, 1, 0.6, st, {});
      K.pop();
    }
    // a round tower at each corner
    const g = K.groundAt(x0, z0);
    const th = r() < 0.3 ? 9 + r() * 6 : 20 + r() * 6;
    K.cyl(x0, g - 3, z0, 6, th + 3, st, { seg: 12, top: sd });
    if (th > 15) K.lathe(x0, g + th, z0, [[6.4, 0], [6.4, 1.2]], sd, { seg: 12 });
  }
  // the gate's arch
  {
    const [x0, z0] = pts[2], [x1, z1] = pts[3];
    const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, yaw = Math.atan2(-(z1 - z0), x1 - x0), g = K.groundAt(xm, zm);
    K.push(xm, g - 3, zm, yaw);
    for (const sx of [-1, 1]) K.box(sx * 5.5, 10, 0, 2, 10, 3, st, { skip: 'ny' });
    K.box(0, 18, 0, 7.5, 2.5, 3, st, {});
    K.pop();
  }
  // the keep: a square stone tower with floors and stairs, roofless
  const kx = -6, kz = -4, g = K.groundAt(kx, kz);
  K.push(kx, g, kz, 0.2);
  const kw = 20, F = 3, H = 10;
  const plans = [];
  for (let f = 0; f < F; f++) plans.push({ rooms: [{ x0: -kw / 2 + 2, z0: -kw / 2 + 2, x1: kw / 2 - 2, z1: kw / 2 - 2, kind: 'keep', id: 0 }], walls: [], start: 0 });
  const B = body(K, {
    w: kw, d: kw, floors: F, H, base: 1, t: 2, it: 0.5, outer: st, plinth: sd, plans,
    roomMat: () => mat('stone', 0xa8a098), floorMat: () => mat('planks', 0x8a7a68),
    doors: [{ side: 'pz', a: 0, w: 4.6, h: 8, kind: 'plank' }],
    win: (side, f) => (f > 0 ? { w: 1.6, h: 4, sill: 4, every: 8, style: { glass: 0, board: 0, sill: false, frame: sd } } : null),
    stairs: Array.from({ length: F - 1 }, (_, f) => ({ f, x: f % 2 ? kw / 2 - 2 - 2 : -kw / 2 + 2 + 2, z: f % 2 ? -kw / 2 + 3 : kw / 2 - 3, dir: f % 2 ? 'pz' : 'nz', w: 3.4, run: 12, mat: mat('stone', 0xb0a8a0) })),
    roof: { kind: 'flat', mat: mat('stone', 0x9a948c), parapet: 3, holes: [{ x0: -kw / 2 + 2, z0: -kw / 2 + 2.5, x1: -kw / 2 + 6, z1: kw / 2 - 4 }] },
    furnish: (K2, R, f, y) => {
      if (f === 0) { Fu.table(K2, 2, y, 2, 0.3, { w: 6, d: 3, m: Fu.F.woodDark, cat: 'castle' }); Fu.barrel(K2, 5, y, -5); Fu.crate(K2, -4, y, -5, 0.2, { loot: 'castle' }); }
      else K2.lootAt(2, y + 0.05, 0, 'castle', { spread: 3 });
    },
  });
  // the stairs from the top floor up onto the roof
  stairs(K, -kw / 2 + 4, kw / 2 - 4, 'nz', 3.4, B.floorY(F - 1), H, 12, mat('stone', 0xb0a8a0), {});
  K.lootAt(0, B.top + 0.85, 0, 'castle', { spread: 4 });
  K.pop();
  // rubble about the place
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = R * (0.3 + r() * 0.9), x = Math.cos(a) * d, z = Math.sin(a) * d * 0.85;
    const sz = 0.6 + r() * 1.6;
    K.box(x, K.groundAt(x, z) + sz * 0.5, z, sz, sz * 0.7, sz * (0.6 + r() * 0.6), st, { yaw: r() * 3, col: sz > 1.2 });
  }
  K.lootAt(10, K.groundAt(10, 6) + 0.1, 6, 'castle', { spread: 6 });
  K.room(-R * 0.7, -R * 0.6, R * 0.7, R * 0.6, K.groundAt(0, 0), 20, 'castleYard');
}

/** The lighthouse: a tapering white tower with red bands, a gallery, a lamp room; a ladder inside. */
export function lighthouse(K, s) {
  const white = mat('plaster', 0xf0ece4), red = mat('plaster', 0xb83a2a, { p: 5 });
  const H = 46, R0 = 6.5, R1 = 4.4;
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const y0 = H * i / bands, y1 = H * (i + 1) / bands;
    const ra = R0 + (R1 - R0) * (i / bands), rb = R0 + (R1 - R0) * ((i + 1) / bands);
    K.lathe(0, y0, 0, [[ra, 0], [rb, y1 - y0]], i % 2 ? red : white, { seg: 16 });
  }
  K.solid(0, H / 2, 0, R0 * 0.75, H / 2, R0 * 0.75, 'concrete');
  // the door, the inside (one room, a ladder up the middle)
  K.box(0, 4, R0 - 0.2, 2.2, 4, 0.5, mat('woodFine', 0x6a4a30), { col: false });
  K.span(-R1 - 3, H, -R1 - 3, R1 + 3, H + 1, R1 + 3, { top: mat('metalPlate'), side: mat('metal', 0x2a2a2a, { p: 4 }), bottom: white }, {});
  railing(K, -R1 - 3, R1 + 3, R1 + 3, R1 + 3, H + 1, 3.4, mat('metal', 0x2a2a2a, { p: 4 }));
  railing(K, -R1 - 3, -R1 - 3, R1 + 3, -R1 - 3, H + 1, 3.4, mat('metal', 0x2a2a2a, { p: 4 }));
  railing(K, R1 + 3, -R1 - 3, R1 + 3, R1 + 3, H + 1, 3.4, mat('metal', 0x2a2a2a, { p: 4 }));
  railing(K, -R1 - 3, -R1 - 3, -R1 - 3, R1 + 3, H + 1, 3.4, mat('metal', 0x2a2a2a, { p: 4 }));
  // the lamp room
  K.cyl(0, H + 1, 0, R1 - 0.5, 1.5, mat('metal', 0x2a2a2a, { p: 4 }), { seg: 12 });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; K.box(Math.cos(a) * (R1 - 0.6), H + 5.5, Math.sin(a) * (R1 - 0.6), 0.15, 3, 0.15, mat('metal', 0x2a2a2a, { p: 4 }), { col: false }); }
  K.cyl(0, H + 2.5, 0, R1 - 0.7, 6, S.glass, { seg: 12, col: false, cap: false });
  K.lathe(0, H + 8.5, 0, [[R1, 0], [R1 * 0.6, 2.2], [0.3, 4]], red, { seg: 12 });
  K.box(0, H + 4.5, 0, 1.2, 1.4, 1.2, mat('plaster', 0xfff4c8, { p: 5, r: 30 }), { col: false });
  ladder(K, 0, 0, -1.6, H + 1, 0);
  K.lootAt(2, H + 1.05, R1 + 1.5, 'hunting');
  K.lootAt(1.5, 0.1, 1.5, 'home');
  K.room(-R1, -R1, R1, R1, 0.1, H, 'lighthouse');
}

/** The radio station: a lattice mast and the operators' hut. */
export function radio(K, s) {
  const m = mat('metal', 0xc8302a, { p: 4 }), w2 = mat('metal', 0xe8e8e0, { p: 4 });
  const H = 92;
  // the mast: four legs leaning in, cross braces, painted in red and white sections
  const seg = 12;
  for (let i = 0; i < seg; i++) {
    const y0 = H * i / seg, y1 = H * (i + 1) / seg;
    const a0 = 6 - 4.5 * (i / seg), a1 = 6 - 4.5 * ((i + 1) / seg);
    const mm = i % 2 ? m : w2;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.quad([sx * a0, y0, sz * a0], [sx * a0 + 0.35, y0, sz * a0], [sx * a1 + 0.35, y1, sz * a1], [sx * a1, y1, sz * a1], mm, { both: true });
    for (const [p0, p1] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
      K.quad([p0[0] * a0, y0, p0[1] * a0], [p1[0] * a1, y1, p1[1] * a1], [p1[0] * a1, y1 + 0.3, p1[1] * a1], [p0[0] * a0, y0 + 0.3, p0[1] * a0], mm, { both: true });
    }
  }
  K.solid(0, H / 2, 0, 3.5, H / 2, 3.5, 'metal');
  K.cyl(0, H, 0, 0.3, 8, w2, { col: false });
  K.ladderAt(-6.4, 0, 0, 34);
  K.push(-6.8, 0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) K.box(sx * 0.8, 17, 0, 0.1, 17, 0.1, w2, { col: false });
  for (let i = 1; i < 37; i++) K.box(0, i * 0.92, 0, 0.8, 0.05, 0.05, w2, { col: false });
  K.pop();
  K.span(-8, 34, -8, 8, 34.5, 8, { top: mat('metalPlate'), side: m }, {});
  railing(K, -8, 8, 8, 8, 34.5); railing(K, -8, -8, 8, -8, 34.5); railing(K, 8, -8, 8, 8, 34.5); railing(K, -8, -8, -8, 8, 34.5);
  K.lootAt(3, 34.55, 3, 'military');
  // the hut
  K.push(0, 0, 18, 0);
  const P = { rooms: [{ x0: -10, z0: -4.2, x1: 2, z1: 4.2, kind: 'radio', id: 0 }, { x0: 2, z0: -4.2, x1: 10, z1: 4.2, kind: 'store', id: 1 }], walls: [{ axis: 'z', at: 2, a0: -4.2, a1: 4.2, ra: 0, rb: 1, door: { a: 0, w: 4 } }], start: 0 };
  body(K, {
    w: 22, d: 10, floors: 1, base: 0.8, t: 0.8, outer: mat('stucco', 0xd8d4c8), plinth: S.plinth, plans: [P],
    roomMat: () => mat('plaster', 0xc8d0c8), floorMat: () => mat('linoleum'),
    doors: [{ side: 'pz', a: -4, kind: 'metal' }],
    win: { w: 3.6, h: 4, sill: 3, every: 8, style: { glass: 0.6 } },
    roof: { kind: 'flat', mat: mat('concrete', 0x6a6864), parapet: 0.8 },
    furnish: (K2, R, f, y) => {
      if (R.kind === 'radio') { Fu.desk(K2, -5, y, -2.6, 0, { cat: 'military' }); K2.box(-8.4, y + 3.6, -3.2, 1.3, 3.6, 0.8, mat('metal', 0x6a7a6a, { p: 4 }), {}); K2.lootAt(-8.4, y + 7.25, -3.2, 'military'); }
      else Fu.rack(K2, 6, y, -2.8, 0, { w: 6, cat: 'industrial' });
    },
  });
  K.pop();
  void wall; void doorIn; void slab;
}

export const LANDMARKS = { castle, lighthouse, radio };
