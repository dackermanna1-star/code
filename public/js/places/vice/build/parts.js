// Parts shared by the district builders: the city's palette of surfaces, and the pieces most
// buildings are made of - parapets, rooftop plant, awnings, canopies, balconies, neon tubes, café
// terraces, pools, fences and parked-car spots. Everything takes the kit (K) and works in the
// current building frame (local +z is the front).
import { mat, BASE, MID, NEAR, WIN, GF } from './kit.js';

export { WIN, GF, BASE, MID, NEAR, mat };

// ---- surfaces ----------------------------------------------------------------------------------------------------
export const M = {
  white: mat('stucco', 0xf6f3ec), cream: mat('stucco', 0xf1e6cf), trim: mat('stucco', 0xfbfaf6, { grime: 0.15 }),
  concrete: mat('concrete', 0xd6d1c8), concreteDark: mat('concrete', 0x8e8a84), slab: mat('concrete', 0xe4e0d8, { grime: 0.2 }),
  roof: mat('concrete', 0xb4aea4, { grime: 0.7 }), roofGravel: mat('gravel', 0xc4bdb2, { grime: 0.3 }), membrane: mat('concrete', 0xe8e6e0, { p: 5, grime: 0.5 }),
  metal: mat('metalSheet', 0xc9cdd1, { p: 9, r: 0.45 }), metalDark: mat('metalSheet', 0x4a4e54, { p: 9, r: 0.5 }), steel: mat('metalSheet', 0x9aa0a6, { p: 9, r: 0.4 }),
  ac: mat('metalSheet', 0xb8bcbe, { p: 9, r: 0.55, grime: 0.5 }), rust: mat('rust', 0xffffff),
  glass: mat('whiteTiles', 0x7d98a6, { p: 8 }), glassDark: mat('whiteTiles', 0x3a4a56, { p: 8 }), glassGreen: mat('whiteTiles', 0x6aa89a, { p: 8 }),
  tiles: mat('floorTiles', 0xf0ebe0), whiteTiles: mat('whiteTiles', 0xffffff), marble: mat('marble', 0xffffff),
  deck: mat('deck', 0xd8b090), wood: mat('deck', 0x9a6a48), pavers: mat('pavers', 0xe0d6c4), herring: mat('herringbone', 0xf0e6d6), brickPave: mat('brickPave', 0xffffff),
  asphalt: mat('asphalt', 0xb0b0b0), lot: mat('asphaltWorn', 0x9a9a9a), lawn: mat('lawn', 0xb8d890), hedge: mat('lawn', 0x5e9a4a, { p: 0, r: 0.95 }),
  sand: mat('sand', 0xffffff), roofTiles: mat('roofTiles', 0xe8a080), roofTilesDark: mat('roofTiles', 0xc07858),
  pool: mat('whiteTiles', 0x35d0e0, { p: 5, r: 0.08 }), poolEdge: mat('whiteTiles', 0xf4f0e6),
  black: mat('concrete', 0x1c1d20, { p: 5 }), rubber: mat('concrete', 0x2a2a2c, { p: 5 }),
  block: mat('blockWall', 0xe8e2d8), brick: mat('brick', 0xffffff), shutter: mat('shutter', 0xd8dadc),
  canvasW: mat('plaster', 0xf4f0e6, { p: 5, grime: 0 }),
};

/** A stucco/paint surface in a colour (cached by the kit). glow: uplit at night. */
export const paint = (hex, glow = 0, grime = 0.3) => mat('stucco', hex, { p: glow > 0 ? 7 : 4, glow, grime });
export const flat = (hex, o = {}) => mat('plaster', hex, { p: 5, grime: 0.1, ...o });
export const neon = (hex, glow = 1) => mat('whiteTiles', hex, { p: 6, glow });
export const glassOf = (hex) => mat('whiteTiles', hex, { p: 8 });
export const metalOf = (hex) => mat('metalSheet', hex, { p: 9, r: 0.45 });
export const fabric = (hex) => mat('plaster', hex, { p: 5, r: 0.95, grime: 0.15 });

// ---- palettes ------------------------------------------------------------------------------------------------------
export const PASTEL = [0xf7b6c8, 0xa8e6cf, 0xc9b6f2, 0xffd3b0, 0xb3dcf5, 0xfff1c9, 0xf9c9d9, 0x9fe0d8, 0xffe08a, 0xe8c6f0, 0xbfe8a8, 0xffc4a8];
export const DECO_ACCENT = [0x2bb5b0, 0xe8507a, 0x5a7ae0, 0xf08a3c, 0x26a69a, 0xd04a8a, 0x8a5ad0, 0xf2c14e];
export const NEON = [0xff2a8a, 0x2af0ff, 0xb44aff, 0xff5a2a, 0x3aff8a, 0xffe14a, 0xff4ad8, 0x4a8aff];
export const CARIB = [0x2ec4b6, 0xffd23f, 0xff6b6b, 0x9b5de5, 0x7bd389, 0xf15bb5, 0x00bbf9, 0xfee440, 0xff9f1c, 0x3a86ff];
export const STUCCO_WARM = [0xf3e3c3, 0xf0d6b0, 0xe8c9a0, 0xf6e7d0, 0xeed9b8, 0xf5dcc8, 0xe9d3a8, 0xf4ead8];
export const GLASS_T = [0x5f8fb0, 0x5f9f98, 0x9aa8b2, 0x8a7a64, 0x46627a, 0x6aa0c8, 0x7aa6a0, 0x3e5868, 0xa2b4c0];

export const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
export const rr = (r, a, b) => a + (b - a) * r();
export const ri = (r, a, b) => Math.floor(a + (b - a + 1) * r());

// ---- pieces ------------------------------------------------------------------------------------------------------
/** A parapet: low walls round a roof rectangle (local x0..x1, z0..z1) standing on y, h tall, t thick. */
export function parapet(K, x0, z0, x1, z1, y, h, t, m, cap = M.trim) {
  K.box((x0 + x1) / 2, y + h / 2, z1 - t / 2, (x1 - x0) / 2, h / 2, t / 2, m, { col: false, win: false });
  K.box((x0 + x1) / 2, y + h / 2, z0 + t / 2, (x1 - x0) / 2, h / 2, t / 2, m, { col: false, win: false });
  K.box(x0 + t / 2, y + h / 2, (z0 + z1) / 2, t / 2, h / 2, (z1 - z0) / 2 - t, m, { col: false, win: false, skip: 'pz nz' });
  K.box(x1 - t / 2, y + h / 2, (z0 + z1) / 2, t / 2, h / 2, (z1 - z0) / 2 - t, m, { col: false, win: false, skip: 'pz nz' });
  if (cap) K.box((x0 + x1) / 2, y + h + 0.15, (z0 + z1) / 2, (x1 - x0) / 2 + 0.2, 0.15, (z1 - z0) / 2 + 0.2, cap, { col: false, win: false, skip: 'ny' });
}

/** Rooftop plant: AC units, vents, a water tank or a stair hut, scattered over a roof rectangle (MID tier). */
export function roofKit(K, r, x0, z0, x1, z1, y, o = {}) {
  const w = x1 - x0, d = z1 - z0;
  if (w < 8 || d < 8) return;
  K.at(MID, () => {
    const n = Math.min(8, Math.floor((w * d) / 260) + (o.extra || 0));
    for (let i = 0; i < n; i++) {
      const sx = rr(r, 1.8, 3.5), sz = rr(r, 1.8, 3.5), sh = rr(r, 1.2, 2.6);
      const x = rr(r, x0 + sx + 1, x1 - sx - 1), z = rr(r, z0 + sz + 1, z1 - sz - 1);
      K.box(x, y + sh, z, sx, sh, sz, M.ac, { col: false, win: false, skip: 'ny' });
      // the fan on top
      if (r() < 0.5) K.cyl(x, z, Math.min(sx, sz) * 0.7, y + sh * 2, y + sh * 2 + 0.25, M.metalDark, { seg: 6, win: false });
    }
    if (o.tank !== false && r() < (o.tank ?? 0.35) && w > 20 && d > 20) {
      const x = rr(r, x0 + 6, x1 - 6), z = rr(r, z0 + 6, z1 - 6);
      for (const [a, b] of [[-2.4, -2.4], [2.4, -2.4], [2.4, 2.4], [-2.4, 2.4]]) K.box(x + a, y + 3, z + b, 0.25, 3, 0.25, M.metalDark, { col: false, win: false });
      K.cyl(x, z, 3.6, y + 6, y + 12, mat('deck', 0x8a6040), { seg: 10, win: false });
      K.lathe(x, y + 12, z, [[3.8, 0], [0.4, 2.2]], M.metalDark, { seg: 10 });
    }
    if (o.hut !== false && w > 16 && d > 16 && r() < (o.hut ?? 0.6)) {
      const hx = rr(r, 3.5, 6), hz = rr(r, 3, 5);
      const x = rr(r, x0 + hx + 2, x1 - hx - 2), z = rr(r, z0 + hz + 2, z1 - hz - 2);
      K.box(x, y + 4.5, z, hx, 4.5, hz, o.hutMat || M.concrete, { col: false, win: false, skip: 'ny' });
    }
  });
}

/** A fabric awning over a shopfront: centre x, top at y, on the wall at z, w wide, sticking out `depth`, dropping `drop`. (NEAR) */
export function awning(K, x, y, z, w, depth, drop, m, o = {}) {
  K.at(o.tier ?? NEAR, () => {
    const a = [x - w / 2, y, z], b = [x + w / 2, y, z], c = [x + w / 2, y - drop, z + depth], d = [x - w / 2, y - drop, z + depth];
    K.quad(d, c, b, a, m, { both: true });
    // the valance
    K.quad([x - w / 2, y - drop - 1.3, z + depth], [x + w / 2, y - drop - 1.3, z + depth], [x + w / 2, y - drop, z + depth], [x - w / 2, y - drop, z + depth], m, { both: true });
    if (o.sides !== false) for (const s of [-1, 1]) K.tri([x + s * w / 2, y, z], [x + s * w / 2, y - drop, z + depth], [x + s * w / 2, y - drop - 1.3, z + depth], m, { both: true });
  });
}

/** A flat canopy (entrance, petrol station): slab of w x depth at height y, stuck to the wall at z. Columns at the front if asked. */
export function canopy(K, x, y, z, w, depth, m = M.trim, o = {}) {
  K.at(o.tier ?? MID, () => {
    K.box(x, y, z + depth / 2, w / 2, o.t ?? 0.6, depth / 2, m, { col: false, win: false });
    if (o.glow) K.box(x, y - (o.t ?? 0.6) - 0.05, z + depth / 2, w / 2 - 0.6, 0.05, depth / 2 - 0.6, neon(o.glow, 0.8), { col: false, win: false, skip: 'py' });
    if (o.cols) for (const s of [-1, 1]) {
      K.box(x + s * (w / 2 - 0.8), (y - (o.t ?? 0.6) + (o.base ?? 0)) / 2, z + depth - 0.8, 0.45, (y - (o.t ?? 0.6) - (o.base ?? 0)) / 2, 0.45, o.colMat || M.trim, { col: true, win: false });
    }
  });
}

/** A neon tube from a to b (local), colour hex, thickness t. MID tier unless told. */
export function tube(K, a, b, hex, t = 0.22, tier = MID) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dz), m = neon(hex);
  K.at(tier, () => {
    if (Math.abs(dy) > Math.max(L, 0.01)) K.box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, t, Math.abs(dy) / 2, t, m, { col: false, win: false });
    else K.box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, L / 2, t, t, m, { col: false, win: false, yaw: Math.atan2(-dz, dx) });
  });
}

/** Café tables with umbrellas (and chairs) over a local rectangle at height y. NEAR tier. */
export function cafe(K, r, x0, z0, x1, z1, y, cols, max = 14) {
  K.at(NEAR, () => {
    const sp = 8.5;
    let n = 0;
    for (let x = x0 + 4; x <= x1 - 4; x += sp) for (let z = z0 + 4; z <= z1 - 4; z += sp) {
      if (r() < 0.15 || n++ >= max) continue;
      const jx = x + rr(r, -1, 1), jz = z + rr(r, -1, 1);
      K.cyl(jx, jz, 0.18, y, y + 2.4, M.metalDark, { seg: 5, win: false, top: false });
      K.cyl(jx, jz, 1.25, y + 2.4, y + 2.55, M.white, { seg: 10, win: false });
      for (const [a, b] of [[1.9, 0], [-1.9, 0], [0, 1.9], [0, -1.9]]) {
        if (r() < 0.3) continue;
        K.box(jx + a, y + 1.5, jz + b, 0.6, 0.12, 0.6, M.metalDark, { col: false, win: false });
        K.box(jx + a * 1.3, y + 2.4, jz + b * 1.3, Math.abs(b) > 0 ? 0.6 : 0.08, 0.9, Math.abs(a) > 0 ? 0.6 : 0.08, M.metalDark, { col: false, win: false });
      }
      if (r() < 0.75) {
        const c = pick(r, cols);
        K.cyl(jx, jz, 0.12, y + 2.55, y + 7.6, M.white, { seg: 5, win: false, top: false });
        K.lathe(jx, y + 6.4, jz, [[4.6, 0], [3.2, 0.8], [0.3, 1.6]], fabric(c), { seg: 8 });
        K.lathe(jx, y + 6.4, jz, [[0.3, 1.58], [3.2, 0.78], [4.6, -0.02]], fabric(c), { seg: 8 });
      }
    }
  });
}

/** A balcony per floor along a face (local front at z, from x0 to x1), floors from y0 every fh, n of them. MID tier. */
export function balconies(K, x0, x1, z, y0, fh, n, o = {}) {
  const depth = o.depth ?? 4, slab = o.slab || M.slab, rail = o.rail || M.glass;
  K.at(o.tier ?? MID, () => {
    for (let i = 0; i < n; i++) {
      const y = y0 + i * fh;
      K.box((x0 + x1) / 2, y + 0.35, z + depth / 2, (x1 - x0) / 2, 0.35, depth / 2, slab, { col: false, win: false });
      if (o.railH !== 0) K.box((x0 + x1) / 2, y + 0.7 + 1.7, z + depth - 0.1, (x1 - x0) / 2, 1.7, 0.08, rail, { col: false, win: false, skip: 'ny py' });
    }
  });
}

/** A low wall or hedge along local a->b (x, z), h tall. col: blocks people. */
export function lowWall(K, ax, az, bx, bz, y, h, t, m, o = {}) {
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 0.5) return;
  K.at(o.tier ?? NEAR, () => K.box((ax + bx) / 2, y + h / 2, (az + bz) / 2, L / 2, h / 2, t / 2, m, { col: o.col ?? true, win: false, yaw: Math.atan2(-(bz - az), bx - ax), mat: o.mat }));
}

/** A chain-link style fence: posts and rails with a see-through-ish mesh panel (dark, thin). */
export function fence(K, ax, az, bx, bz, y, h = 6, o = {}) {
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 1) return;
  const yaw = Math.atan2(-(bz - az), bx - ax);
  K.push((ax + bx) / 2, 0, (az + bz) / 2, yaw);
  K.at(NEAR, () => {
    const n = Math.max(1, Math.round(L / 8));
    for (let i = 0; i <= n; i++) K.box(-L / 2 + (L * i) / n, y + h / 2, 0, 0.18, h / 2, 0.18, M.steel, { col: false, win: false });
    K.box(0, y + h - 0.1, 0, L / 2, 0.12, 0.12, M.steel, { col: false, win: false });
    K.quad([-L / 2, y + 0.2, 0], [L / 2, y + 0.2, 0], [L / 2, y + h - 0.2, 0], [-L / 2, y + h - 0.2, 0], o.m || mat('metalSheet', 0x6a7078, { p: 9, r: 0.6 }), { both: true });
  });
  if (o.col !== false) K.solid(0, y + h / 2, 0, L / 2, h / 2, 0.3, 'metal');
  K.pop();
}

/** A swimming pool (water, tiled rim) sunk into a deck: local centre, half sizes. */
export function pool(K, x, z, hx, hz, y, o = {}) {
  K.at(o.tier ?? MID, () => {
    K.box(x, y + 0.15, z, hx + 1.4, 0.15, hz + 1.4, M.poolEdge, { col: false, win: false });
    K.box(x, y + 0.32, z, hx, 0.04, hz, M.pool, { col: false, win: false, skip: 'ny' });
  });
}

/** Parking bays (painted asphalt and lines) over a local rectangle, rows facing ±z; records spawn spots. */
export function parkingLot(C, K, x0, z0, x1, z1, y, o = {}) {
  const w = x1 - x0, d = z1 - z0;
  if (w < 20 || d < 20) return;
  K.at(MID, () => {
    K.quad([x0, y + 0.08, z1], [x1, y + 0.08, z1], [x1, y + 0.08, z0], [x0, y + 0.08, z0], M.lot);
  });
  // bays: 10 wide, 19 deep, rows along x
  const bw = 10, bd = 19;
  const rows = Math.max(1, Math.floor(d / (bd * 2 + 22)) * 2 || (d >= bd + 18 ? 1 : 0));
  const stripe = flat(0xf0f0e8);
  K.at(NEAR, () => {
    for (let r = 0; r < rows; r++) {
      const facing = r % 2 === 0 ? 1 : -1;
      const zr = r % 2 === 0 ? z0 + 2 + bd / 2 + Math.floor(r / 2) * (bd * 2 + 22) : z0 + 2 + bd / 2 + bd + Math.floor(r / 2) * (bd * 2 + 22);
      const nb = Math.floor((w - 4) / bw);
      for (let i = 0; i < nb; i++) {
        const x = x0 + 2 + bw * (i + 0.5);
        K.box(x - bw / 2, y + 0.11, zr, 0.25, 0.02, bd / 2 - 0.5, stripe, { col: false, win: false, skip: 'ny' });
        if ((i * 7 + r * 3) % 3 !== 0) {
          const p = K.world(x, 0, zr), hd = K.w.yaw + (facing > 0 ? Math.PI : 0);
          C.park(p[0], p[2], hd);
        }
      }
    }
  });
}

/** A dark door with a frame, in the wall at local z, centre x, w wide, h tall (NEAR is too far: MID). */
export function door(K, x, y, z, w, h, m = M.black, frame = M.trim) {
  K.at(MID, () => {
    K.box(x, y + h / 2, z + 0.12, w / 2, h / 2, 0.12, m, { col: false, win: false, skip: 'ny nz' });
    K.box(x, y + h + 0.3, z + 0.2, w / 2 + 0.5, 0.3, 0.2, frame, { col: false, win: false, skip: 'nz' });
    for (const s of [-1, 1]) K.box(x + s * (w / 2 + 0.25), y + h / 2, z + 0.2, 0.25, h / 2, 0.2, frame, { col: false, win: false, skip: 'nz ny' });
  });
}

/** Rounded-corner rectangle outline (anticlockwise from above), corners: [fl, fr, br, bl] radii. */
export function roundRect(x0, z0, x1, z1, radii, seg = 5) {
  const [rfl, rfr, rbr, rbl] = radii;
  const pts = [];
  const arc = (cx, cz, r, a0, a1) => {
    if (r <= 0.01) { pts.push([cx, cz]); return; }
    for (let i = 0; i <= seg; i++) { const a = a0 + ((a1 - a0) * i) / seg; pts.push([cx + Math.cos(a) * r, cz - Math.sin(a) * r]); }
  };
  // front-left (x0, z1) -> front-right (x1, z1) -> back-right (x1, z0) -> back-left (x0, z0); angles measured anticlockwise from +x with z flipped
  arc(x0 + rfl, z1 - rfl, rfl, Math.PI, Math.PI * 1.5);
  arc(x1 - rfr, z1 - rfr, rfr, Math.PI * 1.5, Math.PI * 2);
  arc(x1 - rbr, z0 + rbr, rbr, 0, Math.PI * 0.5);
  arc(x0 + rbl, z0 + rbl, rbl, Math.PI * 0.5, Math.PI);
  return pts;
}

/** A street-facing shop sign band and awning over a ground floor run (local x0..x1 at the front z). */
export function shopFront(K, r, x0, x1, z, g, o = {}) {
  const w = x1 - x0;
  if (o.awning !== false && r() < (o.awningP ?? 0.7)) {
    const c = pick(r, o.awnCols || [0x2a6e5a, 0xc8322a, 0x1d4e89, 0xe0a030, 0x7a2a5a, 0x2a8a8a, 0xf4f0e6]);
    awning(K, (x0 + x1) / 2, g - 2.6, z, Math.min(w - 2, rr(r, 14, 30)), 5, 2.2, fabric(c));
  }
}

/** The name of something (deterministic). */
export function nameOf(r, list) { return list[Math.floor(r() * list.length) % list.length]; }
