import * as THREE from 'three';
import { Bank } from './geom.js';
import { SIGN_UV, PROP_UV, rng, hash2 } from './textures.js';
import { smoothLine, groundY } from './terrain.js';

/**
 * Props: the lookout tower and its cabin (inside and out), the fenced compound and its gates,
 * the defences the player places (barbed wire, mines, fuel barrels, the sentry gun), floodlights,
 * the valley's lamps, signs, range boards, fences, power lines, barriers, bales, the cemetery and
 * the scarecrow. Static parts go into a Bank (merged per material); dynamic ones are objects.
 *
 * Builders used: steel, concrete, cabinWood, cabinIn, roofGreen, paint, grating, chain, planks,
 * propsIn, props, sandbag, signs, stone, hay, bark, cloth (sway), lampHead, black.
 */

const PROPS_TEX = [128, 128];
const SIGNS_TEX = [256, 256];
const pa = (k) => ({ tex: PROPS_TEX, all: PROP_UV[k] });
const PAINT = { tex: [64, 64], all: [0, 0, 32, 32] };

function rectUV(r, W = 256, H = 256) {
  const [x, y, w, h] = r;
  return [[x / W, 1 - (y + h) / H], [(x + w) / W, 1 - (y + h) / H], [(x + w) / W, 1 - y / H], [x / W, 1 - y / H]];
}

/** A vertical panel centred at (cx, cy, cz) facing (nx, 0, nz), w x h, with uv corners. */
export function panel(b, cx, cy, cz, nx, nz, w, h, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
  const rx = nz, rz = -nx;
  const bl = [cx - (rx * w) / 2, cy - h / 2, cz - (rz * w) / 2], br = [cx + (rx * w) / 2, cy - h / 2, cz + (rz * w) / 2];
  const tr = [br[0], cy + h / 2, br[2]], tl = [bl[0], cy + h / 2, bl[2]];
  b.quad(bl, br, tr, tl, uv[0], uv[1], uv[2], uv[3], [nx, 0, nz]);
}

// ---------------------------------------------------------------------------------------------
// The tower

export function tower(bank, L, wires) {
  const T = L.tower, C = T.cabin, BAL = T.balcony;
  const fy = C.floorY, H = C.half[0];
  bank.identity();
  const S = bank.b('steel');
  S.setColor(1, 1, 1);
  const legAt = (i, y) => {
    const [fx, fz] = T.legs[i], [tx, , tz] = T.legTop[i];
    const k = y / fy;
    return [fx + (tx - fx) * k, y, fz + (tz - fz) * k];
  };
  for (let i = 0; i < 4; i++) S.beam(legAt(i, 0), legAt(i, fy - 0.12), 0.2, { uv: [1, 2] });
  const Cc = bank.b('concrete');
  Cc.setColor(0.85, 0.83, 0.8);
  for (const [x, z] of T.legs) Cc.box(x, 0.18, z, 0.9, 0.36, 0.9, { uv: [2, 2] });
  const levels = [0.4, 4.2, 8.4, 12.6, 16.8, 20.8];
  for (const y of levels.slice(1)) for (let i = 0; i < 4; i++) S.beam(legAt(i, y), legAt((i + 1) % 4, y), 0.11);
  for (let l = 0; l < levels.length - 1; l++) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      S.beam(legAt(i, levels[l]), legAt(j, levels[l + 1]), 0.065);
      S.beam(legAt(j, levels[l]), legAt(i, levels[l + 1]), 0.065);
    }
  }
  // zig-zag stairs from the first landing up (the bottom flight was torn down)
  const G = bank.b('grating');
  G.setColor(1, 1, 1);
  for (let l = 1; l < levels.length - 1; l++) {
    const y0 = levels[l], y1 = levels[l + 1];
    const even = (l - 1) % 2 === 0;
    const xs = even ? -0.45 : 0.45, z0 = even ? 1.25 : -1.25, z1 = -z0;
    for (const o of [-0.38, 0.38]) S.beam([xs + o, y0 + 0.05, z0], [xs + o, y1, z1], 0.06);
    const n = 13;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      S.box(xs, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, 0.72, 0.04, 0.2, { uv: [1, 1], split: false });
    }
    const ox = xs + (even ? -0.42 : 0.42);
    S.beam([ox, y0 + 0.95, z0], [ox, y1 + 0.95, z1], 0.035);
    S.beam([ox, y0, z0], [ox, y0 + 0.95, z0], 0.035);
    // landing at the bottom of this flight
    const lz = z0 + Math.sign(z0) * 0.4;
    G.box(0, y0 - 0.02, lz, 1.7, 0.04, 0.8, { uv: [0.5, 0.5], split: false });
    S.beam([-0.85, y0 - 0.05, lz - 0.4 * Math.sign(z0)], [0.85, y0 - 0.05, lz - 0.4 * Math.sign(z0)], 0.06);
  }
  // the torn bottom flight: one stringer hanging askew from the first landing
  S.beam([-0.83, 4.15, 1.25], [-1.2, 1.1, 1.9], 0.06);
  S.beam([-0.07, 4.15, 1.25], [0.35, 2.3, 2.3], 0.06);
  // under the cabin: perimeter frame, joists, knee braces out to the balcony corners
  const bh = BAL.half[0];
  const yF = fy - 0.14;
  for (const s of [-1, 1]) {
    S.beam([-bh, yF, s * bh], [bh, yF, s * bh], 0.12);
    S.beam([s * bh, yF, -bh], [s * bh, yF, bh], 0.12);
    S.beam([-H, yF, s * H], [H, yF, s * H], 0.14);
    S.beam([s * H, yF, -H], [s * H, yF, H], 0.14);
  }
  for (let x = -H + 0.45; x < H; x += 0.7) S.beam([x, yF - 0.02, -H], [x, yF - 0.02, H], 0.08);
  for (let i = 0; i < 4; i++) {
    const [lx, , lz] = legAt(i, 18.2);
    S.beam([lx, 18.2, lz], [Math.sign(lx) * (bh - 0.05), yF, Math.sign(lz) * (bh - 0.05)], 0.09);
  }
  // the balcony: grating round the cabin, posts and rails
  G.box(0, fy - 0.02, -(H + bh) / 2, 2 * bh, 0.04, bh - H, { uv: [0.5, 0.5], split: false });
  G.box(0, fy - 0.02, (H + bh) / 2, 2 * bh, 0.04, bh - H, { uv: [0.5, 0.5], split: false });
  G.box(-(H + bh) / 2, fy - 0.02, 0, bh - H, 0.04, 2 * H, { uv: [0.5, 0.5], split: false });
  G.box((H + bh) / 2, fy - 0.02, 0, bh - H, 0.04, 2 * H, { uv: [0.5, 0.5], split: false });
  // a light railing: posts, a slim top rail, two cables, a toe board
  const rh = BAL.railY;
  const rp = bh - 0.04;
  for (const s of [-1, 1]) {
    for (const t of [-1, -0.5, 0, 0.5, 1]) {
      S.beam([t * rp, fy, s * rp], [t * rp, rh, s * rp], 0.04);
      if (Math.abs(t) < 1) S.beam([s * rp, fy, t * rp], [s * rp, rh, t * rp], 0.04);
    }
    S.beam([-rp, rh, s * rp], [rp, rh, s * rp], 0.045);
    S.beam([s * rp, rh, -rp], [s * rp, rh, rp], 0.045);
    S.box(0, fy + 0.05, s * rp, 2 * rp, 0.1, 0.02, { uv: [1, 1], split: false });
    S.box(s * rp, fy + 0.05, 0, 0.02, 0.1, 2 * rp, { uv: [1, 1], split: false });
    for (const y of [fy + (rh - fy) * 0.36, fy + (rh - fy) * 0.68]) {
      wires.push([-rp, y, s * rp, rp, y, s * rp], [s * rp, y, -rp, s * rp, y, rp]);
    }
  }
  cabin(bank, L, wires);
}

function cabin(bank, L, wires) {
  const C = L.tower.cabin;
  const fy = C.floorY, H = C.half[0], sill = C.sillY, lin = C.lintelY, eav = C.eavesY, peak = C.roofY;
  const W = bank.b('cabinWood');
  W.setColor(1, 1, 1);
  const In = bank.b('cabinIn');
  In.setColor(1, 1, 1);
  const P = bank.b('trim');
  const t = 0.1;
  // floor (inside boards) and its underside
  In.quad([-H, fy, H], [H, fy, H], [H, fy, -H], [-H, fy, -H], [-H / 2.4, H / 2.4], [H / 2.4, H / 2.4], [H / 2.4, -H / 2.4], [-H / 2.4, -H / 2.4], [0, 1, 0]);
  bank.b('steel').box(0, fy - 0.08, 0, 2 * H, 0.1, 2 * H, { uv: [1, 1], skip: 'py', split: false });
  // lower walls (sill height) and the header above the windows: outer skin + inner skin
  for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const cx = nx * (H - t / 2), cz = nz * (H - t / 2);
    const sx = nx ? t : 2 * H, sz = nz ? t : 2 * H;
    const skipIn = nx > 0 ? 'nx' : nx < 0 ? 'px' : nz > 0 ? 'nz' : 'pz';
    W.box(cx, (fy + sill) / 2, cz, sx, sill - fy, sz, { uv: [2.4, 2.4], skip: `${skipIn} ny`, split: false });
    W.box(cx, (lin + eav) / 2, cz, sx, eav - lin, sz, { uv: [2.4, 2.4], skip: `${skipIn} py`, split: false });
    const ix = nx * (H - t), iz = nz * (H - t);
    const len = 2 * H - 2 * t;
    const uvw = len / 2.4;
    panel(In, ix, (fy + sill) / 2, iz, -nx, -nz, len, sill - fy, [[0, 0], [uvw, 0], [uvw, 0.4], [0, 0.4]]);
    panel(In, ix, (lin + eav) / 2, iz, -nx, -nz, len, eav - lin, [[0, 0], [uvw, 0], [uvw, 0.15], [0, 0.15]]);
    // the sill board (white trim), proud inside and out
    P.setColor(0.6, 0.58, 0.54);
    P.box(nx * (H - 0.05), sill + 0.025, nz * (H - 0.05), nx ? 0.3 : 2 * H + 0.1, 0.05, nz ? 0.3 : 2 * H + 0.1, { uv: [0.6, 0.6], split: false });
    P.box(nx * (H - 0.03), lin - 0.03, nz * (H - 0.03), nx ? 0.18 : 2 * H, 0.06, nz ? 0.18 : 2 * H, { uv: [0.6, 0.6], split: false });
  }
  // corner posts
  P.setColor(0.62, 0.6, 0.56);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box(sx * (H - 0.07), (fy + eav) / 2, sz * (H - 0.07), 0.15, eav - fy, 0.15, { uv: [0.6, 0.6], split: false });
  // ceiling
  In.quad([-H, eav - 0.02, -H], [H, eav - 0.02, -H], [H, eav - 0.02, H], [-H, eav - 0.02, H], [0, 0], [1.6, 0], [1.6, 1.6], [0, 1.6], [0, -1, 0]);
  // hip roof: four triangles from the eaves (overhang 0.42) to the peak, fascia, soffits
  const E = H + 0.42, ey = eav - 0.08;
  const Rf = bank.b('roofGreen');
  Rf.setColor(1, 1, 1);
  const top = [0, peak, 0];
  const sides = [
    [[-E, ey, E], [E, ey, E]], [[E, ey, E], [E, ey, -E]], [[E, ey, -E], [-E, ey, -E]], [[-E, ey, -E], [-E, ey, E]],
  ];
  for (const [a, b] of sides) Rf.tri(a, b, top, [0, 0], [2 * E / 1.5, 0], [E / 1.5, 1.6]);
  // soffit (seen from inside, looking out and up)
  W.setColor(0.7, 0.66, 0.62);
  for (const [a, b] of sides) {
    const ia = [a[0] * (H / E), ey + 0.02, a[2] * (H / E)], ib = [b[0] * (H / E), ey + 0.02, b[2] * (H / E)];
    W.quad(b, a, [ia[0], ia[1], ia[2]], [ib[0], ib[1], ib[2]], [0, 0], [2, 0], [2, 0.3], [0, 0.3], [0, -1, 0]);
  }
  W.setColor(1, 1, 1);
  P.setColor(0.86, 0.84, 0.78);
  for (const [a, b] of sides) {
    const mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2;
    P.box(mx, ey - 0.06, mz, Math.abs(b[0] - a[0]) + 0.08 || 0.08, 0.14, Math.abs(b[2] - a[2]) + 0.08 || 0.08, { uv: [1.2, 1.2], split: false });
  }
  // lightning rod, finial
  const S = bank.b('steel');
  S.beam([0, peak - 0.1, 0], [0, peak + 1.3, 0], 0.03);
  S.box(0, peak + 0.02, 0, 0.16, 0.16, 0.16, { uv: [1, 1] });
  wires.push([0, peak + 1.2, 0, H + 0.42, ey, H + 0.42], [H + 0.42, ey, H + 0.42, H + 1.0, 21.0, H + 1.0]);
  // awning shutters propped out on all four sides
  const aw = 1.1, ang = 0.2;
  for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const hx = nx * (E - 0.02), hz = nz * (E - 0.02);
    const ox = nx * aw * Math.cos(ang), oz = nz * aw * Math.cos(ang), oy = aw * Math.sin(ang);
    const rx = nz, rz = -nx;
    const w = 2 * E - 0.1;
    const p0 = [hx - (rx * w) / 2, ey - 0.05, hz - (rz * w) / 2], p1 = [hx + (rx * w) / 2, ey - 0.05, hz + (rz * w) / 2];
    const p2 = [p1[0] + ox, p1[1] + oy, p1[2] + oz], p3 = [p0[0] + ox, p0[1] + oy, p0[2] + oz];
    W.setColor(1, 1, 1);
    W.quad(p1, p0, p3, p2, [w / 2.4, 0], [0, 0], [0, aw / 2.4], [w / 2.4, aw / 2.4]); // top
    W.setColor(0.6, 0.55, 0.5);
    W.quad(p0, p1, p2, p3, [0, 0], [w / 2.4, 0], [w / 2.4, aw / 2.4], [0, aw / 2.4]); // underside
    // props (struts) from the corner posts to the awning's outer corners
    for (const s of [-1, 1]) {
      const px = hx * (H / E) + (rx * s * (w / 2 - 0.15)) * (H / E), pz = hz * (H / E) + (rz * s * (w / 2 - 0.15)) * (H / E);
      S.beam([px, lin - 0.3, pz], [px + ox * 0.92 + nx * 0.4, ey - 0.05 + oy * 0.92, pz + oz * 0.92 + nz * 0.4], 0.035);
    }
  }
  // trapdoor where the stairs arrive
  const Bk = bank.b('cabinIn');
  Bk.setColor(0.62, 0.55, 0.48);
  Bk.quad([0.08, fy + 0.006, 1.25], [0.82, fy + 0.006, 1.25], [0.82, fy + 0.006, 0.45], [0.08, fy + 0.006, 0.45], [0, 0], [0.3, 0], [0.3, 0.33], [0, 0.33], [0, 1, 0]);
  interior(bank, L, wires);
}

/** One sandbag: a squashed, slightly tapered octagonal bag lying along local x. */
export function sandbag(bank, x, y, z, len = 0.55, yaw = 0, mat = 'sandbag') {
  bank.push().local(x, y, z, yaw);
  bank.push().local(0, 0, 0, 0, 0, 0);
  const m = bank.xf.m;
  m.multiply(new THREE.Matrix4().makeScale(1, 0.46, 1.2));
  bank.xf.nm.getNormalMatrix(m);
  const B = bank.b(mat);
  B.setColor(1, 1, 1);
  B.hcyl(0, 0, 0, 0.15, len, { seg: 8, uv: [0.7, 0.7], phase: Math.PI / 8 });
  bank.pop();
  bank.pop();
}

/** The lookout's things: sandbag rest, ammo crates, radio, cot, lantern, the map, cans. */
function interior(bank, L, wires) {
  const C = L.tower.cabin;
  const fy = C.floorY, H = C.half[0], sill = C.sillY;
  const Pi = bank.b('propsIn');
  Pi.setColor(1, 1, 1);
  // sandbag rifle rest on the south sill (off-centre, so the middle of the window stays clear)
  const sy = sill + 0.05;
  for (const [x, y, z, len, yaw] of [[0.82, sy + 0.08, H - 0.08, 0.58, 0.05], [1.36, sy + 0.08, H - 0.07, 0.5, -0.08], [1.1, sy + 0.22, H - 0.1, 0.55, 0.12], [-1.45, sy + 0.07, -H + 0.08, 0.5, 0.1]]) {
    sandbag(bank, x, y, z, len, yaw);
  }
  // ammo crates stacked in the north-west corner, an open one with boxes
  Pi.box(-1.45, fy + 0.18, -1.3, 0.62, 0.36, 0.42, { atlas: { tex: PROPS_TEX, all: PROP_UV.crate, top: PROP_UV.crateTop } });
  Pi.box(-1.42, fy + 0.54, -1.32, 0.6, 0.36, 0.4, { atlas: { tex: PROPS_TEX, all: PROP_UV.crate, top: PROP_UV.crateTop } });
  Pi.box(-1.45, fy + 0.18, -0.78, 0.62, 0.36, 0.42, { atlas: { tex: PROPS_TEX, all: PROP_UV.crate, top: PROP_UV.crateTop }, skip: 'py' });
  for (let k = 0; k < 3; k++) Pi.box(-1.6 + k * 0.16, fy + 0.3, -0.78, 0.13, 0.14, 0.3, { atlas: pa('ammoBox') });
  // radio table in the north-east corner, the radio, a mug, a thermos
  const Wd = bank.b('cabinIn');
  Wd.setColor(0.85, 0.75, 0.65);
  Wd.box(1.4, fy + 0.74, -1.35, 0.7, 0.05, 0.5, { uv: [1, 1], split: false });
  for (const [x, z] of [[1.1, -1.55], [1.7, -1.55], [1.1, -1.15], [1.7, -1.15]]) Wd.box(x, fy + 0.36, z, 0.05, 0.72, 0.05, { uv: [1, 1], split: false });
  Pi.box(1.45, fy + 0.89, -1.42, 0.42, 0.25, 0.24, { atlas: { tex: PROPS_TEX, side: PROP_UV.radio, top: PROP_UV.metal, all: PROP_UV.radio } });
  bank.b('steel').beam([1.62, fy + 1.0, -1.5], [1.75, fy + 1.9, -1.75], 0.012);
  Pi.cyl(1.16, fy + 0.765, -1.2, 0.045, 0.1, { seg: 6, caps: 'top', atlas: { tex: PROPS_TEX, side: PROP_UV.can, top: PROP_UV.metal } });
  Pi.cyl(1.25, fy + 0.765, -1.5, 0.05, 0.3, { seg: 6, caps: 'top', atlas: { tex: PROPS_TEX, side: PROP_UV.metal, top: PROP_UV.metal } });
  wires.push([1.62, fy + 0.95, -1.5, 1.85, fy + 2.3, -1.85]);
  // a cot along the east wall with a blanket
  const St = bank.b('steel');
  St.setColor(0.7, 0.72, 0.7);
  St.box(1.5, fy + 0.4, 0.15, 0.7, 0.04, 1.9, { uv: [1, 1], split: false });
  for (const [x, z] of [[1.18, -0.75], [1.82, -0.75], [1.18, 1.05], [1.82, 1.05]]) St.box(x, fy + 0.2, z, 0.04, 0.4, 0.04, { uv: [1, 1], split: false });
  Pi.box(1.5, fy + 0.47, 0.25, 0.68, 0.1, 1.6, { atlas: pa('blanket') });
  Pi.box(1.5, fy + 0.5, -0.65, 0.5, 0.12, 0.3, { atlas: pa('cloth') });
  // the map pinned on the inside of the west wall, the calendar on a corner post
  const mapUV = (k) => {
    const [x, y, w, h] = PROP_UV[k];
    return [[x / 128, 1 - (y + h) / 128], [(x + w) / 128, 1 - (y + h) / 128], [(x + w) / 128, 1 - y / 128], [x / 128, 1 - y / 128]];
  };
  panel(Pi, -H + 0.12, fy + 0.55, 0.35, 1, 0, 0.8, 0.62, mapUV('map'));
  panel(Pi, H - 0.16, fy + 1.55, -H + 0.16, -1, 0, 0.2, 0.3, mapUV('calendar'));
  // the lantern hanging from the ceiling (glass is the 'lanternGlass' emissive, added separately)
  const lp = L.tower.lantern ?? [-1.15, C.eavesY - 0.55, 1.15];
  St.setColor(0.25, 0.24, 0.22);
  St.box(lp[0], lp[1] - 0.1, lp[2], 0.13, 0.03, 0.13, { uv: [1, 1], split: false });
  wires.push([lp[0], lp[1] + 0.13, lp[2], lp[0], C.eavesY - 0.02, lp[2]]);
  // empty cans and brass on the floor and the sills
  const R = rng(55);
  for (let k = 0; k < 6; k++) {
    const x = (R() - 0.5) * 2.6, z = (R() - 0.5) * 2.6;
    if (Math.hypot(x, z) < 0.6) continue;
    if (R() < 0.5) Pi.cyl(x, fy, z, 0.035, 0.11, { seg: 6, caps: 'top', atlas: { tex: PROPS_TEX, side: PROP_UV.can, top: PROP_UV.metal } });
    else {
      bank.push().local(x, fy + 0.035, z, R() * 6, Math.PI / 2, 0);
      Pi.cyl(0, -0.055, 0, 0.035, 0.11, { seg: 6, caps: 'both', atlas: { tex: PROPS_TEX, side: PROP_UV.can, top: PROP_UV.metal } });
      bank.pop();
    }
  }
  const brass = bank.b('paint');
  brass.setColor(0.75, 0.55, 0.22);
  for (let k = 0; k < 14; k++) {
    const x = (R() - 0.3) * 1.6, z = H - 0.4 - R() * 0.8;
    brass.box(x, fy + 0.008, z, 0.06, 0.016, 0.016, { atlas: PAINT, skip: 'ny', split: false });
  }
  Pi.cyl(-0.6, sill + 0.05, H - 0.08, 0.035, 0.11, { seg: 6, caps: 'top', atlas: { tex: PROPS_TEX, side: PROP_UV.can, top: PROP_UV.metal } });
  Pi.cyl(-0.45, sill + 0.05, H - 0.1, 0.035, 0.11, { seg: 6, caps: 'top', atlas: { tex: PROPS_TEX, side: PROP_UV.can, top: PROP_UV.metal } });
  // a jerry can and a rolled tarp by the door
  Pi.box(-1.55, fy + 0.25, 1.4, 0.35, 0.5, 0.18, { atlas: pa('jerry') });
  bank.push().local(-0.9, fy + 0.12, 1.55, 0, 0, Math.PI / 2);
  Pi.cyl(0, -0.45, 0, 0.12, 0.9, { seg: 7, caps: 'both', atlas: { tex: PROPS_TEX, side: PROP_UV.tarp, top: PROP_UV.tarp } });
  bank.pop();
}

// ---------------------------------------------------------------------------------------------
// The compound

export function compound(bank, L, wires) {
  const Cr = L.compound.rect, fh = L.compound.fenceHeight;
  const S = bank.b('steel');
  const Ch = bank.b('chain');
  Ch.setColor(1, 1, 1);
  const gates = L.compound.gates;
  // walk each side from corner to corner, leaving the gate openings
  const corners = [[Cr.minX, Cr.minZ], [Cr.maxX, Cr.minZ], [Cr.maxX, Cr.maxZ], [Cr.minX, Cr.maxZ]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    const nx = uz, nz = -ux; // outward for a counter-clockwise walk seen from above (-z north)
    // gate interval along this side
    const g = gates.find((gg) => {
      const mx = (gg.a[0] + gg.b[0]) / 2, mz = (gg.a[1] + gg.b[1]) / 2;
      return Math.abs((mx - ax) * uz - (mz - az) * ux) < 0.1;
    });
    let gs = -1, ge = -1;
    if (g) {
      const s1 = (g.a[0] - ax) * ux + (g.a[1] - az) * uz, s2 = (g.b[0] - ax) * ux + (g.b[1] - az) * uz;
      gs = Math.min(s1, s2);
      ge = Math.max(s1, s2);
    }
    const spans = g ? [[0, gs], [ge, len]] : [[0, len]];
    for (const [s0, s1] of spans) {
      const n = Math.max(1, Math.round((s1 - s0) / 2.45));
      for (let k = 0; k <= n; k++) {
        const s = s0 + ((s1 - s0) * k) / n;
        const x = ax + ux * s, z = az + uz * s;
        const gatePost = Math.abs(s - gs) < 0.01 || Math.abs(s - ge) < 0.01;
        S.setColor(0.85, 0.85, 0.85);
        S.cyl(x, 0, z, gatePost ? 0.09 : 0.05, fh + 0.25, { seg: 6, caps: 'top', uv: [1, 1] });
        // outrigger leaning out, carrying the barbed wire
        S.beam([x, fh + 0.2, z], [x + nx * 0.42, fh + 0.62, z + nz * 0.42], 0.03);
      }
      const x0 = ax + ux * s0, z0 = az + uz * s0, x1 = ax + ux * s1, z1 = az + uz * s1;
      // chain-link (both faces) and the top rail
      const L0 = s1 - s0;
      Ch.quad([x0, 0.04, z0], [x1, 0.04, z1], [x1, fh, z1], [x0, fh, z0], [0, 0], [L0 / 0.5, 0], [L0 / 0.5, fh / 0.5], [0, fh / 0.5], [nx, 0, nz]);
      S.beam([x0, fh, z0], [x1, fh, z1], 0.05);
      S.beam([x0, 0.12, z0], [x1, 0.12, z1], 0.035);
      for (let w = 0; w < 3; w++) {
        const o = 0.14 + w * 0.14, y = fh + 0.34 + w * 0.14;
        wires.push([x0 + nx * o, y, z0 + nz * o, x1 + nx * o, y, z1 + nz * o]);
      }
    }
  }
  // KEEP OUT boards on the fence beside the north and west gates
  const Sg = bank.b('signs');
  Sg.setColor(1, 1, 1);
  const ko = rectUV(SIGN_UV.keepout);
  panel(Sg, -3.6, 1.35, Cr.minZ - 0.06, 0, -1, 1.8, 0.45, ko);
  panel(Sg, Cr.minX - 0.06, 1.25, 3.4, -1, 0, 1.8, 0.45, ko);
  panel(Sg, 4.0, 1.3, Cr.maxZ + 0.06, 0, 1, 1.8, 0.45, ko);
  // the generator in its sandbag ring, its fuel, the work lamp, the water tank, crates, a tarp
  const Pr = bank.b('props');
  Pr.setColor(1, 1, 1);
  Pr.box(5.1, 0.55, 5.0, 1.8, 1.0, 1.1, { atlas: { tex: PROPS_TEX, all: PROP_UV.genPanel, top: PROP_UV.metal } });
  S.setColor(0.3, 0.3, 0.3);
  S.beam([5.7, 1.0, 5.3], [5.7, 1.65, 5.3], 0.08);
  Pr.box(4.0, 0.25, 4.55, 0.35, 0.5, 0.18, { atlas: pa('jerry') });
  Pr.box(4.0, 0.25, 4.8, 0.35, 0.5, 0.18, { atlas: pa('jerry') });
  const Sb = bank.b('sandbag');
  Sb.setColor(1, 1, 1);
  Sb.box(3.9, 0.45, 6.3, 0.5, 0.9, 1.8, { uv: [0.7, 0.7] });
  Sb.box(6.4, 0.45, 3.7, 1.8, 0.9, 0.5, { uv: [0.7, 0.7] });
  const Pt = bank.b('paint');
  Pt.setColor(0.42, 0.46, 0.4);
  Pt.cyl(5.2, 0.15, -5.3, 0.85, 1.55, { seg: 10, caps: 'top', atlas: { tex: [64, 64], side: [0, 0, 32, 32], top: [0, 0, 32, 32] } });
  S.setColor(0.6, 0.6, 0.6);
  for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) S.box(5.2 + dx, 0.08, -5.3 + dz, 0.08, 0.16, 0.08, { uv: [1, 1] });
  for (const [x, y, z, r] of [[-5.5, 0.35, 5.0, 0.1], [-4.85, 0.35, 5.15, -0.05], [-5.15, 0.72, 5.05, 0.2], [-5.3, 0.35, 5.85, 0.3]]) {
    bank.push().local(x, y, z, r);
    Pr.box(0, 0, 0, 0.7, 0.7, 0.7, { atlas: { tex: PROPS_TEX, all: PROP_UV.crate, top: PROP_UV.crateTop } });
    bank.pop();
  }
  // tarp lean-to on the west side
  Pr.quad([-7.3, 0.4, 1.2], [-7.3, 0.4, 4.0], [-5.6, 1.7, 4.0], [-5.6, 1.7, 1.2], [0, 96 / 128], [0.25, 96 / 128], [0.25, 1], [0, 1]);
  Pr.quad([-5.6, 1.7, 1.2], [-5.6, 1.7, 4.0], [-7.3, 0.4, 4.0], [-7.3, 0.4, 1.2], [0, 96 / 128], [0.25, 96 / 128], [0.25, 1], [0, 1]);
  S.beam([-5.6, 0, 1.2], [-5.6, 1.75, 1.2], 0.05);
  S.beam([-5.6, 0, 4.0], [-5.6, 1.75, 4.0], 0.05);
  // the windsock pole (the sock itself is a dynamic cloth)
  S.setColor(0.8, 0.8, 0.8);
  S.cyl(7.0, 0, -7.0, 0.05, 6.2, { seg: 6, caps: 'top', uv: [1, 1] });
  S.beam([7.0, 6.1, -7.0], [7.0, 6.1, -7.0], 0.01);
}

// ---------------------------------------------------------------------------------------------
// Valley props (static)

export function valleyProps(bank, L, wires) {
  const S = L.scenery;
  const R = rng(321);
  // range boards: two posts and a board facing the tower; a wind flag on the left post
  const Sg = bank.b('signs');
  Sg.setColor(1, 1, 1);
  const Pk = bank.b('planks');
  const flags = [];
  for (const m of L.rangeMarkers) {
    const [x, z] = m.pos;
    const yaw = Math.atan2(-x, -z);
    bank.at(x, 0, z, yaw);
    Pk.setColor(0.8, 0.75, 0.7);
    Pk.box(-0.85, 1.2, -0.05, 0.12, 2.4, 0.12, { uv: [2.4, 2.4] });
    Pk.box(0.85, 1.0, -0.05, 0.12, 2.0, 0.12, { uv: [2.4, 2.4] });
    const uv = rectUV(SIGN_UV[`range${m.dist}`]);
    Sg.quad([-1.0, 1.0, 0.02], [1.0, 1.0, 0.02], [1.0, 2.25, 0.02], [-1.0, 2.25, 0.02], uv[0], uv[1], uv[2], uv[3], [0, 0, 1]);
    Pk.setColor(0.5, 0.48, 0.45);
    Pk.quad([1.0, 1.0, -0.01], [-1.0, 1.0, -0.01], [-1.0, 2.25, -0.01], [1.0, 2.25, -0.01], [0, 0], [0.8, 0], [0.8, 0.5], [0, 0.5], [0, 0, -1]);
    Pk.setColor(0.8, 0.75, 0.7);
    Pk.box(-0.85, 2.85, -0.05, 0.05, 1.0, 0.05, { uv: [2.4, 2.4] });
    const c = Math.cos(yaw), s = Math.sin(yaw);
    flags.push([x + -0.85 * c, 3.3, z - -0.85 * s, 0.7, 0.45]);
    bank.identity();
  }
  // power lines: poles with crossarms, wires sagging between them
  const Bk = bank.b('bark');
  for (const line of S.powerLines) {
    const pts = smoothLine(line.pts, 2);
    const poles = [];
    let acc = line.spacing;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      acc += d;
      if (acc >= line.spacing) {
        acc = 0;
        const dir = Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        poles.push([pts[i][0], pts[i][1], dir]);
      }
    }
    const tops = [];
    for (const [x, z, dir] of poles) {
      const y0 = groundY(x, z);
      const lean = (R() - 0.5) * 0.08;
      bank.at(x, y0, z, dir + Math.PI / 2);
      Bk.setColor(0.75, 0.68, 0.6);
      bank.push().local(0, 0, 0, 0, 0, lean);
      Bk.cyl(0, 0, 0, 0.15, 9.2, { seg: 6, r1: 0.12, caps: 'top', uv: [1, 3] });
      Bk.box(0, 8.4, 0, 0.12, 0.14, 2.3, { uv: [1, 1] });
      bank.pop();
      const yaw = dir + Math.PI / 2;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      // arm along local z -> world (sin yaw, cos yaw)
      const t3 = [-1.0, 0, 1.0].map((o) => [x + s * o + lean * 8.4, y0 + 8.52 + (o === 0 ? 0.25 : 0), z + c * o]);
      tops.push(t3);
      bank.identity();
    }
    for (let i = 0; i < tops.length - 1; i++) {
      for (let w = 0; w < 3; w++) {
        const a = tops[i][w], b = tops[i + 1][w];
        const n = 8, sag = 0.9;
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          const p = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
          const p0 = p(t0), p1 = p(t1);
          wires.push([p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]]);
        }
      }
    }
  }
  // rail fences
  for (const f of S.railFences) {
    const pts = f.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 2.8));
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
        if (R() < f.broken * 0.4) continue;
        Pk.setColor(0.72, 0.68, 0.62);
        const tilt = R() < f.broken ? (R() - 0.5) * 0.5 : 0;
        Pk.beam([x, -0.1, z], [x + tilt * 0.6, 1.25, z + tilt * 0.3], 0.11);
        if (k < n && R() > f.broken * 0.6) {
          const x2 = ax + ((bx - ax) * (k + 1)) / n, z2 = az + ((bz - az) * (k + 1)) / n;
          Pk.beam([x, 1.05, z], [x2, 1.05, z2], 0.07);
          if (R() > f.broken) Pk.beam([x, 0.55, z], [x2, 0.55 + (R() < f.broken ? -0.45 : 0), z2], 0.07);
        }
      }
    }
  }
  // jersey barriers and sandbag walls
  const Cc = bank.b('concrete');
  const Sb = bank.b('sandbag');
  for (const b of S.barriers) {
    bank.at(b.pos[0], 0, b.pos[1], b.yaw);
    if (b.type === 'jersey') {
      Cc.setColor(0.86, 0.85, 0.8);
      Cc.box(0, 0.12, 0, 3.8, 0.24, 0.62, { uv: [2, 2] });
      Cc.box(0, 0.5, 0, 3.8, 0.55, 0.3, { uv: [2, 2] });
      // faded red-white stripes
      Cc.setColor(0.7, 0.3, 0.25);
      Cc.box(-1.2, 0.55, 0, 0.6, 0.5, 0.31, { uv: [2, 2], skip: 'py ny' });
      Cc.box(0.6, 0.55, 0, 0.6, 0.5, 0.31, { uv: [2, 2], skip: 'py ny' });
    } else {
      Sb.setColor(1, 1, 1);
      for (let row = 0; row < 3; row++) Sb.box(row % 2 ? 0.2 : 0, 0.15 + row * 0.3, 0, b.len - row * 0.3, 0.3, 0.75 - row * 0.12, { uv: [0.7, 0.7] });
    }
    bank.identity();
  }
  // round hay bales
  const Hy = bank.b('hay');
  Hy.setColor(1, 1, 1);
  for (const [x, z, a] of S.bales) {
    bank.at(x, 0, z, a);
    Hy.hcyl(0, 0.8, 0, 0.8, 1.5, { seg: 10, atlas: { tex: [64, 32], side: [0, 0, 32, 32], top: [32, 0, 32, 32] } });
    bank.identity();
  }
  // the cemetery: low stone wall, headstones, crosses
  const C = S.cemetery;
  const St = bank.b('stone');
  St.setColor(0.9, 0.9, 0.88);
  for (const c of L.colliders) if (c.kind === 'wall' && c.material === 'concrete') St.box(c.c[0], c.h[1], c.c[2], c.h[0] * 2, c.h[1] * 2, c.h[2] * 2, { uv: [1.5, 1.5] });
  for (let x = C.minX + 2; x < C.maxX - 1.5; x += 2.2) {
    for (let z = C.minZ + 3; z < C.maxZ - 1.5; z += 3) {
      if (R() < 0.15) continue;
      if (Math.abs(x + 210) < 2.5) continue; // the path from the gate
      const lean = (R() - 0.5) * 0.3;
      bank.at(x + (R() - 0.5) * 0.4, 0, z, Math.PI + (R() - 0.5) * 0.2);
      bank.push().local(0, 0, 0, 0, lean, (R() - 0.5) * 0.2);
      St.setColor(0.7 + R() * 0.3, 0.7 + R() * 0.28, 0.68 + R() * 0.25);
      if (R() < 0.3) {
        St.box(0, 0.6, 0, 0.12, 1.2, 0.12, { uv: [1, 1] });
        St.box(0, 0.88, 0, 0.6, 0.12, 0.12, { uv: [1, 1] });
      } else {
        const h = 0.6 + R() * 0.5;
        St.box(0, h / 2, 0, 0.55, h, 0.14, { uv: [1, 1] });
      }
      bank.pop();
      // a grave mound
      bank.b('concrete').setColor(0.45, 0.4, 0.3).box(0, 0.04, 0.9, 0.8, 0.08, 1.6, { uv: [2, 2] });
      bank.identity();
    }
  }
  // the scarecrow in the corn
  {
    const [x, z] = S.scarecrow;
    bank.at(x, 0, z, Math.atan2(-x, -z));
    const P = bank.b('planks');
    P.setColor(0.7, 0.66, 0.6);
    P.box(0, 1.2, 0, 0.1, 2.4, 0.1, { uv: [2.4, 2.4] });
    P.box(0, 1.85, 0, 1.6, 0.08, 0.08, { uv: [2.4, 2.4] });
    const Pr = bank.b('props');
    Pr.setColor(1, 1, 1);
    Pr.box(0, 1.6, 0, 0.55, 0.65, 0.3, { atlas: pa('cloth') });
    Pr.box(0, 1.85, 0, 1.3, 0.16, 0.16, { atlas: pa('cloth') });
    Pr.box(0, 2.15, 0, 0.26, 0.28, 0.24, { atlas: pa('rope') });
    Pr.box(0, 2.33, 0, 0.5, 0.04, 0.45, { atlas: pa('cloth') });
    Pr.box(0, 2.42, 0, 0.26, 0.16, 0.24, { atlas: pa('cloth') });
    bank.identity();
  }
  // the town sign and a speed limit sign on the highway
  {
    const put = (x, z, key, w, h, y0) => {
      const yaw = Math.atan2(-x, -z);
      bank.at(x, 0, z, yaw);
      const St2 = bank.b('steel');
      St2.setColor(0.6, 0.6, 0.6);
      St2.box(-w * 0.35, (y0 + h / 2) / 2, -0.04, 0.08, y0 + h / 2, 0.08, { uv: [1, 1] });
      St2.box(w * 0.35, (y0 + h / 2) / 2, -0.04, 0.08, y0 + h / 2, 0.08, { uv: [1, 1] });
      const uv = rectUV(SIGN_UV[key]);
      Sg.quad([-w / 2, y0, 0.01], [w / 2, y0, 0.01], [w / 2, y0 + h, 0.01], [-w / 2, y0 + h, 0.01], uv[0], uv[1], uv[2], uv[3], [0, 0, 1]);
      St2.setColor(0.4, 0.4, 0.4);
      St2.quad([w / 2, y0, -0.01], [-w / 2, y0, -0.01], [-w / 2, y0 + h, -0.01], [w / 2, y0 + h, -0.01], [0, 0], [1, 0], [1, 1], [0, 1], [0, 0, -1]);
      bank.identity();
    };
    put(-133, 7.5, 'town', 3.2, 1.35, 1.2);
    put(92, -95, 'speed', 0.75, 1.0, 1.6);
    put(70, 52, 'speed', 0.75, 1.0, 1.6);
  }
  return { flags };
}

/** Lamp posts (the head and pool are added by the scene's lamp system). */
export function lampPosts(bank, L) {
  const S = bank.b('steel');
  for (const l of L.scenery.lamps) {
    const [x, y, z] = l.pos;
    if (!l.pole) continue;
    S.setColor(0.55, 0.55, 0.55);
    S.cyl(x - 0.9, 0, z, 0.09, y + 0.1, { seg: 6, caps: 'top', uv: [1, 1] });
    S.beam([x - 0.9, y + 0.05, z], [x, y + 0.05, z], 0.06);
    S.box(x, y + 0.08, z, 0.55, 0.12, 0.3, { uv: [1, 1] });
  }
}

// ---------------------------------------------------------------------------------------------
// Gates: every plank and frame bar of all eight leaves is an instance of one box

const GATE_H = 2.1;

export function makeGates(L, mat) {
  const gates = L.compound.gates;
  const parts = []; // per instance: { gate, leaf, kind, local: Matrix4 (in the leaf frame), seed, colour }
  const R = rng(4242);
  for (const g of gates) {
    for (const leaf of [0, 1]) {
      const hinge = leaf === 0 ? g.a : g.b, other = leaf === 0 ? g.b : g.a;
      const len = Math.hypot(other[0] - hinge[0], other[1] - hinge[1]) / 2 - 0.04;
      // leaf frame: origin at the hinge (ground), +x toward the gate's middle, +z outward, +y up
      const zs = leaf === 0 ? 1 : -1; // leaf 1's frame has +z inward (keeps the basis right-handed)
      const add = (kind, cx, cy, cz, sx, sy, sz, rz = 0) => {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz * zs), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(sx, sy, sz));
        parts.push({ gate: g.id, leaf, kind, local: m, seed: R(), tough: 0.15 + R() * 0.8, len });
      };
      const n = 6, pw = (len - 0.1) / n;
      for (let k = 0; k < n; k++) add('plank', 0.06 + pw * (k + 0.5), 0.12 + GATE_H / 2, 0.06, pw - 0.03, GATE_H, 0.04);
      add('frame', len / 2, 0.25, 0, len, 0.08, 0.06);
      add('frame', len / 2, GATE_H, 0, len, 0.08, 0.06);
      add('frame', len / 2, 1.2, 0.0, len, 0.07, 0.05);
      add('frame', 0.04, 0.1 + GATE_H / 2, 0, 0.08, GATE_H, 0.06);
      add('frame', len - 0.04, 0.1 + GATE_H / 2, 0, 0.08, GATE_H, 0.06);
      const dl = Math.hypot(len, GATE_H - 0.3);
      add('brace', len / 2, 0.25 + (GATE_H - 0.25) / 2, -0.03, dl, 0.07, 0.04, Math.atan2(GATE_H - 0.35, len) * (leaf === 0 ? 1 : 1));
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  // planks: one board of the planks texture per face (u 0..0.125), v by length
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.125, uv.getY(i) * 0.9);
  const mesh = new THREE.InstancedMesh(geo, mat, parts.length);
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  const state = {};
  for (const g of gates) state[g.id] = { damage: 0, broken: false, steel: false, g };
  const _m = new THREE.Matrix4(), _leaf = new THREE.Matrix4(), _r = new THREE.Matrix4(), _c = new THREE.Color();
  const leafFrame = (g, leaf, st) => {
    const hinge = leaf === 0 ? g.a : g.b, other = leaf === 0 ? g.b : g.a;
    const ux = other[0] - hinge[0], uz = other[1] - hinge[1];
    const ul = Math.hypot(ux, uz);
    const ax = ux / ul, az = uz / ul;
    // basis: x = along (toward the middle), z = outward normal, y = up
    const zs = leaf === 0 ? 1 : -1;
    const nx = g.normal[0] * zs, nz = g.normal[1] * zs;
    _leaf.makeBasis(new THREE.Vector3(ax, 0, az), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz));
    _leaf.setPosition(hinge[0], 0, hinge[1]);
    const d = st.damage;
    if (st.broken) {
      // one leaf flat on the ground inside, the other hanging off its hinge
      // (leaf 0: +z is outward, so falling inward is a rotation about x by -90 deg; leaf 1: +z is
      // inward, so swinging inward is a positive turn about y)
      if (leaf === 0) {
        _r.makeRotationX(-Math.PI / 2 + 0.06);
        _leaf.multiply(_r);
        _leaf.multiply(new THREE.Matrix4().makeTranslation(0.2, -0.05, 0.12));
      } else {
        _leaf.multiply(new THREE.Matrix4().makeRotationY(-1.15));
        _leaf.multiply(new THREE.Matrix4().makeRotationZ(-0.32));
      }
    } else {
      // sag (droop about the hinge) and a push inward as it weakens
      const sag = d * d * 0.22 + (d > 0.85 ? 0.08 : 0);
      // pushed inward: toward -z for leaf 0 (z out), toward +z for leaf 1 (z in)
      _leaf.multiply(new THREE.Matrix4().makeRotationY((d > 0.3 ? (d - 0.3) * 0.35 : 0) * zs));
      _leaf.multiply(new THREE.Matrix4().makeRotationZ(-sag));
    }
    return _leaf;
  };
  const refresh = (id) => {
    const st = state[id];
    parts.forEach((p, i) => {
      if (p.gate !== id) return;
      const F = leafFrame(st.g, p.leaf, st);
      _m.copy(F).multiply(p.local);
      const d = st.damage;
      let col;
      if (p.kind === 'plank') {
        const broken = st.broken || d > p.tough;
        const gone = st.broken ? p.seed < 0.45 : d > p.tough + 0.28;
        if (gone) _m.scale(new THREE.Vector3(0, 0, 0));
        else if (broken) {
          // splintered: shortened from the top, skewed
          const keep = 0.35 + 0.4 * p.seed;
          _m.copy(F).multiply(p.local).multiply(new THREE.Matrix4().makeTranslation(0, -(1 - keep) / 2, 0)).multiply(new THREE.Matrix4().makeRotationZ((p.seed - 0.5) * 0.25)).multiply(new THREE.Matrix4().makeScale(1, keep, 1));
        }
        const k = 0.72 + 0.3 * p.seed - d * 0.15;
        col = st.steel ? _c.setRGB(0.42 * k, 0.45 * k, 0.46 * k) : _c.setRGB(0.95 * k, 0.86 * k, 0.72 * k);
      } else {
        if (st.broken && p.seed < 0.3) _m.scale(new THREE.Vector3(0, 0, 0));
        const k = 0.5 + 0.2 * p.seed;
        col = st.steel ? _c.setRGB(0.32 * k, 0.33 * k, 0.34 * k) : _c.setRGB(0.42 * k, 0.4 * k, 0.38 * k);
      }
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  for (const g of gates) refresh(g.id);
  const handles = {};
  for (const g of gates) {
    handles[g.id] = {
      /** 0 intact .. 1 about to give (planks splinter and drop out, the leaves sag inward). */
      setDamage(d) {
        const st = state[g.id];
        d = Math.min(1, Math.max(0, d || 0));
        if (d < 1 && st.broken) st.broken = false; // repaired
        st.damage = d;
        refresh(g.id);
      },
      /** The gate gives way: one leaf down flat, the other hanging off its hinge. */
      break() {
        state[g.id].broken = true;
        state[g.id].damage = 1;
        refresh(g.id);
      },
      /** The steel-gate upgrade: steel sheets instead of planks. */
      setSteel(on = true) {
        state[g.id].steel = !!on;
        refresh(g.id);
      },
      get damage() {
        return state[g.id].damage;
      },
      get broken() {
        return state[g.id].broken;
      },
    };
  }
  return { mesh, handles };
}

// ---------------------------------------------------------------------------------------------
// Defences the player places

export function makeTrapFactory(mats) {
  const geos = {};
  const buildGeo = (fn) => {
    const bank = new Bank();
    fn(bank);
    const out = [];
    for (const [name, b] of bank.builders) if (b.count) out.push([name, b.build()]);
    return out;
  };
  // barrel: red drum with ribs (props atlas)
  geos.barrel = buildGeo((bank) => {
    const P = bank.b('props');
    P.cyl(0, 0, 0, 0.29, 0.88, { seg: 10, caps: 'top', atlas: { tex: PROPS_TEX, side: PROP_UV.barrel, top: PROP_UV.barrelTop } });
    P.cyl(0, 0.3, 0, 0.3, 0.03, { seg: 10, caps: '', atlas: { tex: PROPS_TEX, side: PROP_UV.metal } });
    P.cyl(0, 0.6, 0, 0.3, 0.03, { seg: 10, caps: '', atlas: { tex: PROPS_TEX, side: PROP_UV.metal } });
  });
  geos.mine = buildGeo((bank) => {
    const P = bank.b('props');
    P.cyl(0, -0.02, 0, 0.16, 0.07, { seg: 10, caps: 'top', atlas: { tex: PROPS_TEX, side: PROP_UV.metal, top: PROP_UV.mine } });
    const C = bank.b('concrete');
    C.setColor(0.42, 0.36, 0.28);
    C.cyl(0, -0.02, 0, 0.34, 0.03, { seg: 10, r1: 0.2, caps: '', uv: [1, 1] });
  });
  geos.sentryBase = buildGeo((bank) => {
    const S = bank.b('steel');
    S.setColor(0.45, 0.47, 0.42);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      S.beam([0, 0.62, 0], [Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55], 0.04);
    }
    S.cyl(0, 0.55, 0, 0.06, 0.2, { seg: 6, caps: 'top', uv: [1, 1] });
    const P = bank.b('props');
    P.box(0.35, 0.12, 0.3, 0.32, 0.24, 0.18, { atlas: pa('ammoBox') });
    P.box(-0.3, 0.12, 0.35, 0.32, 0.24, 0.18, { atlas: pa('ammoBox') });
  });
  geos.sentryGun = buildGeo((bank) => {
    const S = bank.b('steel');
    S.setColor(0.32, 0.34, 0.3);
    S.box(0, 0.1, 0.05, 0.16, 0.18, 0.62, { uv: [1, 1] }); // receiver (barrel along -z)
    S.setColor(0.18, 0.18, 0.18);
    bank.push().local(0, 0.12, -0.25, 0, Math.PI / 2, 0);
    S.cyl(0, 0, 0, 0.035, 0.8, { seg: 6, caps: 'top', uv: [1, 1] });
    S.cyl(0, 0.6, 0, 0.05, 0.25, { seg: 6, caps: 'both', uv: [1, 1] });
    bank.pop();
    S.setColor(0.4, 0.42, 0.36);
    S.box(0, 0.28, -0.12, 0.6, 0.4, 0.03, { uv: [1, 1] }); // shield
    const P = bank.b('props');
    P.box(0.16, 0.06, 0.08, 0.14, 0.2, 0.26, { atlas: pa('ammoBox') });
  });
  const WIRE = (() => {
    const pts = [];
    const len = 6, r = 0.42, loops = 34, segs = loops * 14;
    let prev = null;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs, a = t * loops * Math.PI * 2;
      const p = [-len / 2 + t * len + Math.cos(a) * 0.08, 0.45 + Math.sin(a) * r, Math.cos(a) * r];
      if (prev) pts.push(...prev, ...p);
      prev = p;
    }
    // barbs: little ticks every few segments
    for (let k = 0; k < segs; k += 3) {
      const t = k / segs, a = t * loops * Math.PI * 2;
      const x = -len / 2 + t * len, y = 0.45 + Math.sin(a) * r, z = Math.cos(a) * r;
      pts.push(x - 0.03, y - 0.03, z, x + 0.03, y + 0.03, z);
    }
    // stakes
    for (const x of [-len / 2, -len / 6, len / 6, len / 2]) pts.push(x, -0.1, 0, x + 0.05, 1.0, 0.02);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  })();
  const meshFrom = (list) => {
    const grp = new THREE.Group();
    for (const [name, g] of list) {
      const m = new THREE.Mesh(g, mats[name]);
      grp.add(m);
    }
    return grp;
  };
  return (kind) => {
    let obj;
    if (kind === 'wire') {
      obj = new THREE.LineSegments(WIRE, mats.wire);
    } else if (kind === 'mine') obj = meshFrom(geos.mine);
    else if (kind === 'barrel') obj = meshFrom(geos.barrel);
    else if (kind === 'sentry') {
      obj = meshFrom(geos.sentryBase);
      const pivot = new THREE.Group();
      pivot.name = 'yaw';
      pivot.position.y = 0.66;
      pivot.add(meshFrom(geos.sentryGun));
      const muzzle = new THREE.Object3D();
      muzzle.name = 'muzzle';
      muzzle.position.set(0, 0.12, -1.1);
      pivot.add(muzzle);
      obj.add(pivot);
      obj.userData.yaw = pivot;
      obj.userData.muzzle = muzzle;
    } else throw new Error(`unknown trap kind ${kind}`);
    obj.userData.trapKind = kind;
    return obj;
  };
}

// ---------------------------------------------------------------------------------------------
// Floodlights: a pole and lamp at each mount; a beam cone and a ground pool; real spot lights for
// the first three switched on, the rest faked.

export function makeFloodlights(L, mats, spots) {
  const group = new THREE.Group();
  group.name = 'floodlights';
  const units = {};
  const coneGeo = new THREE.CylinderGeometry(0.12, 1, 1, 16, 1, true);
  coneGeo.translate(0, -0.5, 0); // apex at the origin, opening down -y, length 1
  for (const m of L.floodlightMounts) {
    const [x, y, z] = m.pos;
    const aim = m.aim ?? [x * 3, 0, z * 3];
    const root = new THREE.Group();
    root.name = `floodlight:${m.id}`;
    root.visible = false;
    // pole + lamp housing (merged per material, small)
    const bank = new Bank();
    const S = bank.b('steel');
    S.setColor(0.6, 0.6, 0.58);
    const px = x, pz = z;
    S.cyl(px, 0, pz, 0.08, y + 0.3, { seg: 6, caps: 'top', uv: [1, 1] });
    const dir = new THREE.Vector3(aim[0] - x, aim[1] - y, aim[2] - z).normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = Math.asin(-dir.y);
    bank.push().local(x, y, z, yaw, pitch, 0);
    S.setColor(0.25, 0.26, 0.25);
    S.box(0, 0, -0.05, 0.55, 0.42, 0.3, { uv: [1, 1] });
    bank.pop();
    for (const mesh of bank.meshes(mats)) root.add(mesh);
    // lens
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.34), mats.lens);
    lens.position.set(x + dir.x * 0.11, y + dir.y * 0.11, z + dir.z * 0.11);
    lens.lookAt(x + dir.x, y + dir.y, z + dir.z);
    root.add(lens);
    // beam cone toward the aim point
    const dist = Math.hypot(aim[0] - x, aim[1] - y, aim[2] - z);
    const half = 0.4;
    const cone = new THREE.Mesh(coneGeo, mats.beam);
    cone.position.set(x, y, z);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    cone.scale.set(Math.tan(half) * dist, dist * 1.05, Math.tan(half) * dist);
    cone.renderOrder = 5;
    root.add(cone);
    // ground pool, stretched along the aim
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mats.pool);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(aim[0] - dir.x * 2, 0.07, aim[2] - dir.z * 2);
    const flat = Math.max(0.35, -dir.y);
    pool.scale.set(Math.tan(half) * dist * 2.2, (Math.tan(half) * dist * 2.2) / flat, 1);
    pool.rotation.z = yaw;
    pool.renderOrder = 4;
    root.add(pool);
    group.add(root);
    units[m.id] = { root, lens, cone, pool, pos: new THREE.Vector3(x, y, z), aim: new THREE.Vector3(...aim), spot: null, on: false };
  }
  const free = spots.slice();
  return {
    group,
    units,
    add(id) {
      const u = units[id];
      if (!u) return null;
      u.on = true;
      u.root.visible = true;
      if (!u.spot && free.length) {
        u.spot = free.shift();
        u.spot.position.copy(u.pos);
        u.spot.target.position.copy(u.aim);
        u.spot.target.updateMatrixWorld();
        u.spot.userData.active = true;
      }
      return u.spot ?? u.root;
    },
    remove(id) {
      const u = units[id];
      if (!u) return;
      u.on = false;
      u.root.visible = false;
      if (u.spot) {
        u.spot.userData.active = false;
        u.spot.intensity = 0;
        free.push(u.spot);
        u.spot = null;
      }
    },
  };
}
