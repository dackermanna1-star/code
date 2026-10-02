// The Pit Grid: a long beige hall whose floor is a regular grid of square pits separated by narrow
// walkways, under rows of fluorescent strips, with a single door far at the other end. A plain
// service corridor runs around the hall and picks up the zone's doors.
//
// Each pit is the 2x2 cell block between walkway centre lines (cell floor = pit bottom); the 0.5 m
// walkways are brushes straddling the block borders, so pits come out ~1.5 m square.
// Pits stay within 1.75 m: the level below may have content up to 4.2 m (= -1.8 here), and
// anything deeper shows through its ceiling. Pits deeper than the 1.45 m climb get a block.
import { defineZone } from '../zonetypes.js';
import { W, M, env } from '../gen/common.js';

function params(zone, rng) {
  const p = {
    wallMat: M.paint_beige,
    floorMat: M.lino_vct,
    ceilMat: rng.chance(0.6) ? M.ceil_tile_white : M.ceil_tile,
    ceilH: rng.pick([3.0, 3.2, 3.4]),
    ambient: [0.2, 0.19, 0.165],
  };
  p.env = env({ fog: [0.34, 0.32, 0.27], fogNear: 6, fogFar: 40, hum: 0.85, hvac: 0.3, reverb: 'hall', tone: 'office' });
  return p;
}

function gen(zb) {
  const p = zb.params, r = zb.rng;
  const wm = p.wallMat, tile = M.c_pit_tile;
  const alongZ = zb.d >= zb.w;
  // local frame: a runs across the hall, b along it
  const A0 = alongZ ? zb.x0 : zb.z0, A1 = alongZ ? zb.x1 : zb.z1;
  const B0 = alongZ ? zb.z0 : zb.x0, B1 = alongZ ? zb.z1 : zb.x1;
  const WX = (a, b) => (alongZ ? a : b), WZ = (a, b) => (alongZ ? b : a);
  const cell = (a, b) => zb.i(WX(a, b), WZ(a, b));
  // local face bits -> world face bits (+x 1, -x 2, +y 4, -y 8, +z 16, -z 32)
  const F = alongZ ? { pa: 1, na: 2, pb: 16, nb: 32 } : { pa: 16, na: 32, pb: 1, nb: 2 };
  const box = (a0, y0, b0, a1, y1, b1, mat, skip = 0) => zb.box(WX(a0, b0), y0, WZ(a0, b0), WX(a1, b1), y1, WZ(a1, b1), mat, { skip: skip | 8 });
  const lineA = (a, b0, b1, t) => (alongZ ? zb.vLine(a, b0, b1, t, wm, wm) : zb.hLine(a, b0, b1, t, wm, wm));
  const lineB = (b, a0, a1, t) => (alongZ ? zb.hLine(b, a0, a1, t, wm, wm) : zb.vLine(b, a0, a1, t, wm, wm));
  const edgeB = (a, b, t) => (alongZ ? zb.setWall(a, b, 'N', t, wm, wm) : zb.setWall(b, a, 'W', t, wm, wm));
  const fixture = (a, b, on, ch) => zb.fixture(WX(a, b), WZ(a, b), 'tube', on, { ch, rot: alongZ ? 0 : 1, l: 1.42, w: 0.2 });
  const light = (a, b, y, o) => zb.light(WX(a, b), y, WZ(a, b), o);

  // ---- service corridor around the hall
  const ring = 2;
  const ha0 = A0 + ring, ha1 = A1 - ring, hb0 = B0 + ring, hb1 = B1 - ring;
  zb.fill(zb.x0, zb.z0, zb.x1, zb.z1, (x, z, i) => { zb.ceil[i] = 2.7; });
  for (let a = ha0; a < ha1; a++) for (let b = hb0; b < hb1; b++) { const i = cell(a, b); zb.ceil[i] = p.ceilH; zb.fmat[i] = tile; }
  lineA(ha0, hb0, hb1, W.WALL); lineA(ha1, hb0, hb1, W.WALL);
  lineB(hb0, ha0, ha1, W.WALL); lineB(hb1, ha0, ha1, W.WALL);
  // corridor lights
  for (let b = B0 + 1; b < B1; b += 4) for (const a of [A0 + 1, A1 - 1]) {
    const on = r.chance(0.7);
    zb.fixture(WX(a, b + 0.5), WZ(a, b + 0.5), 'troffer', on, { rot: alongZ ? 0 : 1 });
    if (on) light(a, b + 0.5, 2.15, { rad: 5.5, int: 0.55 });
  }
  for (let a = A0 + 5; a < A1 - 4; a += 4) for (const b of [B0 + 1, B1 - 1]) {
    const on = r.chance(0.7);
    zb.fixture(WX(a + 0.5, b), WZ(a + 0.5, b), 'troffer', on, { rot: alongZ ? 1 : 0 });
    if (on) light(a + 0.5, b, 2.15, { rad: 5.5, int: 0.55 });
  }

  // ---- the hall: an entrance at one end, a single door far away at the other
  const doorIn = r.int(ha0 + 2, ha1 - 3), doorFar = r.int(ha0 + 2, ha1 - 3);
  const nearEnd = r.chance(0.5);
  edgeB(doorIn, nearEnd ? hb0 : hb1, W.DOOR);
  edgeB(doorFar, nearEnd ? hb1 : hb0, W.DOOR);
  const farB = nearEnd ? hb1 - 0.3 : hb0 + 0.3;
  zb.prop('exit_sign', WX(doorFar + 0.5, farB), p.ceilH, WZ(doorFar + 0.5, farB), alongZ ? 0 : Math.PI / 2, { green: r.chance(0.5) });

  // pit grid region (landings of >= 2 cells at both ends; an odd cell column becomes a ledge)
  const nI = Math.floor((ha1 - ha0) / 2), extra = (ha1 - ha0) - nI * 2;
  const ga0 = ha0 + (extra && r.chance(0.5) ? 1 : 0), ga1 = ga0 + nI * 2;
  const gb0 = hb0 + 2, nJ = Math.max(0, Math.floor((hb1 - 2 - gb0) / 2)), gb1 = gb0 + nJ * 2;
  const deep = [];
  const dep = (i, j) => (i < 0 || j < 0 || i >= nI || j >= nJ ? 0 : deep[j * nI + i]);
  for (let j = 0; j < nJ; j++) for (let i = 0; i < nI; i++) {
    const u = r.next();
    deep.push(u < 0.12 ? r.range(1.6, 1.75) : u < 0.3 ? r.range(0.7, 1.0) : r.range(1.05, 1.4));
  }
  for (let j = 0; j < nJ; j++) for (let i = 0; i < nI; i++) {
    for (let a = ga0 + 2 * i; a < ga0 + 2 * i + 2; a++) for (let b = gb0 + 2 * j; b < gb0 + 2 * j + 2; b++) {
      const c = cell(a, b);
      zb.floor[c] = -dep(i, j);
      zb.fmat[c] = tile;
      zb.wmat[c] = tile;
    }
  }
  // walkway extents across (a) and along (b); edge walkways are 0.5 m wide against walls/landings
  const ledgeL = ga0 > ha0, ledgeR = ga1 < ha1;
  const aL = (i) => (i === 0 ? ga0 : ga0 + 2 * i - 0.25);
  const aR = (i) => (i === 0 ? ga0 + (ledgeL ? 0.25 : 0.5) : i === nI ? ga1 : ga0 + 2 * i + 0.25);
  const aLx = (i) => (i === nI ? ga1 - (ledgeR ? 0.25 : 0.5) : aL(i));
  const bL = (j) => (j === 0 ? gb0 : j === nJ ? gb1 - 0.5 : gb0 + 2 * j - 0.25);
  const bR = (j) => (j === 0 ? gb0 + 0.5 : j === nJ ? gb1 : gb0 + 2 * j + 0.25);
  if (nI > 0 && nJ > 0) {
    // walkways along the hall (continuous over the crossings), one brush per pit row
    for (let i = 0; i <= nI; i++) {
      for (let j = 0; j < nJ; j++) {
        const bot = -Math.max(dep(i - 1, j), dep(i, j));
        let skip = 0;
        if (i === 0) skip |= F.na;
        if (i === nI) skip |= F.pa;
        box(aLx(i), bot, gb0 + 2 * j, aR(i), 0, gb0 + 2 * j + 2, tile, skip);
      }
    }
    // walkways across the hall, between the long ones
    for (let j = 0; j <= nJ; j++) {
      for (let i = 0; i < nI; i++) {
        const bot = -Math.max(dep(i, j - 1), dep(i, j));
        let skip = 0;
        if (j === 0) skip |= F.nb;
        if (j === nJ) skip |= F.pb;
        box(aR(i), bot, bL(j), aLx(i + 1), 0, bR(j), tile, skip);
      }
    }
  }
  // deep pits get a block to climb onto and a ladder above it; a few hold something
  for (let j = 0; j < nJ; j++) for (let i = 0; i < nI; i++) {
    const d = dep(i, j);
    const pa0 = aR(i), pa1 = aLx(i + 1), pb0 = bR(j), pb1 = bL(j + 1);
    if (d > 1.45) {
      const sa = r.chance(0.5), sb = r.chance(0.5);
      const a0 = sa ? pa0 : pa1 - 0.62, b0 = sb ? pb0 : pb1 - 0.62;
      box(a0, -d, b0, a0 + 0.62, -d / 2, b0 + 0.62, M.concrete);
      const la = a0 + 0.31, lb = sb ? pb0 + 0.03 : pb1 - 0.03;
      zb.prop('ladder', WX(la, lb), -d / 2, WZ(la, lb), alongZ ? (sb ? Math.PI : 0) : (sb ? Math.PI / 2 : -Math.PI / 2), { h: d / 2 + 0.45 });
    } else if (r.chance(0.035)) {
      const ca = (pa0 + pa1) / 2 + r.range(-0.3, 0.3), cb = (pb0 + pb1) / 2 + r.range(-0.3, 0.3);
      const what = r.pick(['ball', 'papers', 'tile_fallen', 'chair_folding']);
      zb.prop(what, WX(ca, cb), -d, WZ(ca, cb), r.range(0, Math.PI * 2), what === 'chair_folding' ? { roll: Math.PI / 2 } : {});
    }
  }
  // rows of strips above every other long walkway, a light per three tubes
  for (let i = 1; i < Math.max(2, nI); i += 2) {
    const a = nI > 0 ? ga0 + 2 * i : (ha0 + ha1) / 2;
    for (let b = hb0 + 0.75; b < hb1 - 0.5; b += 4.5) {
      const u = r.next();
      const state = u < 0.06 ? 'off' : u < 0.12 ? 'flicker' : 'on';
      const ch = state === 'flicker' ? r.int(1, 4) : 0;
      let n = 0;
      for (let t = b; t < Math.min(hb1 - 0.5, b + 4.5); t += 1.5) { fixture(a, t, state !== 'off', ch); n++; }
      if (state !== 'off') light(a, b + 1.5 * (n - 1) / 2, p.ceilH - 0.5, { rad: 6.5, int: 0.72, ch, color: [0.98, 0.98, 0.94] });
    }
    zb.emitter(WX(a, (hb0 + hb1) / 2), p.ceilH - 0.3, WZ(a, (hb0 + hb1) / 2), 'hum_strip', { vol: 0.35, rad: 9 });
  }
}

defineZone('pit_grid', {
  border: 'wall',
  gate: 'door',
  minW: 16, minD: 16,
  allowStairs: false,
  weight: (c) => {
    if (c.dim !== 0 || c.dist <= 180) return 0;
    const lo = Math.min(c.w, c.d), hi = Math.max(c.w, c.d);
    return hi >= 40 && lo <= 32 ? 0.35 : 0;
  },
  params,
  gen,
});
