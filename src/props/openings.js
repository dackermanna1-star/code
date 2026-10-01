// Opening inserts (windows, doors, roll-up / garage / sliding doors) plus window bars,
// boarded windows, stoops and bollards.
//
// Insert convention: origin at the BOTTOM-CENTRE of the opening at the recess plane (z = 0 is
// the back of the frame, flush against the recess bottom); the insert spans x in [-w/2, w/2],
// y in [0, h] and extends toward +Z. Glass is NOT voxelized: pane areas are left empty and
// listed in meta.panes = [{x, y, w, h, z, sash?, broken?, frosted?, screen?, wired?, open?}]
// (x, y = lower-left corner, local meters; z = depth of the glass plane; open: no glass, the
// room interior is visible through the gap).
import {
  VB, mat, V, MCLS, VS_FINE, VS_MED, rgbMul, rgbMix, rgbJitter, valueNoise2, valueNoise3, fbm2, clamp,
  recolor, grime, mottle, rust, streaks, chips, vrand, emptyModel, rot, restPos, lathe, latheZ, torusZ, TAU,
  applyPaint, paintFor, projectFace, famSet, dent, textMask, variant, F_PZ,
} from './kit.js';

const PAINTS = {
  white: [206, 204, 196], cream: [196, 186, 160], green: [40, 62, 48], brown: [80, 58, 42], black: [36, 36, 38],
  grey: [120, 120, 116], red: [110, 48, 36], blue: [44, 62, 92],
};
const pickColor = (rng, c, keys) => (Array.isArray(c) ? c : rgbJitter(rng, PAINTS[c ?? rng.pick(keys ?? Object.keys(PAINTS))] ?? PAINTS.white, 0.04));

/** Builder for an opening insert: W x H voxels of opening plus margins; origin per convention. */
function openingVB(w, h, depthVox, vs, { l = 0, r = 0, b = 0, t = 0 } = {}) {
  const W = Math.round(w / vs), H = Math.round(h / vs);
  const vb = new VB(W + l + r, H + b + t, depthVox, vs, 'corner');
  vb.setMount([-(W / 2 + l) * vs, -b * vs, 0]);
  vb.W = W;
  vb.H = H;
  vb.ox = l; // voxel index of the opening's left edge
  vb.oy = b; // voxel index of the opening's bottom
  return vb;
}

/** Pane record from voxel rect [i0,i1) x [j0,j1) at glass depth zVox (fractional ok). */
function pane(b, i0, j0, i1, j1, zVox, extra = {}) {
  return { x: +b.mx(i0).toFixed(4), y: +b.my(j0).toFixed(4), w: +((i1 - i0) * b.vs).toFixed(4), h: +((j1 - j0) * b.vs).toFixed(4), z: +(zVox * b.vs).toFixed(4), ...extra };
}

/** Jagged shards left in a broken pane's edges (glass voxels). */
function shards(b, rng, i0, j0, i1, j1, z, glass) {
  for (let i = i0; i < i1; i++)
    for (let j = j0; j < j1; j++) {
      const e = Math.min(i - i0, i1 - 1 - i, j - j0, j1 - 1 - j);
      const k = valueNoise2(i * 0.35, j * 0.35, 77) * 4.5;
      if (e < k - 1.5) b.set(i, j, z, glass);
    }
}

/** Peeling paint: patches of bare weathered wood / older paint layer. */
function peel(b, rng, mats, amount = 0.4) {
  const P = b.P;
  const seed = rng.int(1, 1e6);
  const under = rgbJitter(rng, rng.pick([[118, 108, 94], [70, 90, 70], [150, 140, 120]]), 0.05);
  recolor(b, mats, (v, x, y, z, n) => {
    const n2 = valueNoise3(x * 0.4, y * 0.4, z * 0.4, seed + 5);
    if (n > 0.78 - amount * 0.25 && n2 > 0.35) return variant(P, v, 'peel', (e) => ({ ...e, color: under, rough: 0.9, metal: 0, cls: MCLS.WOOD }));
    return undefined;
  }, { freq: 0.11, seed });
}

// ───────────────────────────── windows ─────────────────────────────

/**
 * Window insert. opts: w, h (m), style 'dh' (double-hung painted wood) | 'fe' (fire-escape
 * double-hung, taller lower sash) | 'alu' (aluminum horizontal slider) | 'steel' (industrial
 * steel multi-pane) | 'small' (single sash, frosted), color (key or [r,g,b]), raised (m, lower
 * sash raised), lites [cols, rows] per sash, broken (pane index list; panes are numbered top-
 * to-bottom, left-to-right as listed in meta.panes).
 */
export function windowSash(rng, opts = {}) {
  const vs = VS_FINE;
  const w = opts.w ?? 0.88, h = opts.h ?? 1.45;
  const style = opts.style ?? 'dh';
  if (style === 'alu') return aluWindow(rng, opts, w, h);
  if (style === 'steel') return steelWindow(rng, opts, w, h);
  const b = openingVB(w, h, 7, vs);
  const P = b.P;
  const col = pickColor(rng, opts.color, ['white', 'white', 'cream', 'green', 'brown', 'black', 'grey', 'red']);
  const paint = mat.paint(P, 'paint', col, { cls: MCLS.GENERIC, rough: 0.6, metal: 0, vari: 0.06 });
  const sashPaint = mat.paint(P, 'sash', rgbMix(col, [200, 200, 196], rng.chance(0.3) ? 0.3 : 0), { cls: MCLS.GENERIC, rough: 0.6, metal: 0, vari: 0.06 });
  const glassShard = mat.glass(P, 'shard', [120, 132, 134]);
  const W = b.W, H = b.H;
  const jw = 3, hh = 3, sh = 3, fd = 6;
  // frame: jambs, head, sloped sill
  b.box(0, 0, 0, jw, H, fd, paint);
  b.box(W - jw, 0, 0, W, H, fd, paint);
  b.box(0, H - hh, 0, W, H, fd, paint);
  b.box(0, 0, 0, W, sh - 1, fd + 1, paint);
  b.box(0, sh - 1, 0, W, sh, fd, paint);
  // stop beads (thin strips inside the jambs that hold the sashes)
  b.box(jw, sh, fd - 1, jw + 1, H - hh, fd, paint);
  b.box(W - jw - 1, sh, fd - 1, W - jw, H - hh, fd, paint);
  const iw0 = jw, iw1 = W - jw, ih0 = sh, ih1 = H - hh;
  const small = style === 'small';
  const split = style === 'fe' ? 0.56 : 0.5;
  const ymid = Math.round(ih0 + (ih1 - ih0) * split);
  const lites = opts.lites ?? (small ? [1, 1] : rng.weighted([[1, 1], [2, 1], [3, 2], [1, 1]], [5, 2, 1, 1]));
  const panes = [];
  const sashes = [];
  const sashDef = (y0, y1, z0, botRail, topRail, name, shift = 0) => ({ y0: y0 + shift, y1: y1 + shift, z0, botRail, topRail, name });
  if (small) sashes.push(sashDef(ih0, ih1, 2, 3, 3, 'single'));
  else {
    const raise = Math.round(clamp(opts.raised ?? (rng.chance(0.2) ? rng.range(0.05, 0.3) : 0), 0, (ymid - ih0) * vs * 0.95) / vs);
    sashes.push(sashDef(ymid - 1, ih1, 3, 2, 3, 'upper'));
    sashes.push(sashDef(ih0, ymid + 1, 1, 4, 2, 'lower', raise));
    if (raise > 0) panes.push(pane(b, iw0, ih0, iw1, ih0 + raise, 2, { open: true }));
  }
  const broken = new Set(opts.broken ?? (rng.chance(0.12) ? [rng.int(0, 1)] : []));
  const sashPanes = [];
  for (const s of sashes) {
    const z0 = s.z0, z1 = z0 + 2;
    const sw = 3;
    b.box(iw0, s.y0, z0, iw0 + sw, s.y1, z1, sashPaint);
    b.box(iw1 - sw, s.y0, z0, iw1, s.y1, z1, sashPaint);
    b.box(iw0, s.y0, z0, iw1, s.y0 + s.botRail, z1, sashPaint);
    b.box(iw0, s.y1 - s.topRail, z0, iw1, s.y1, z1, sashPaint);
    // muntins
    const gx0 = iw0 + sw, gx1 = iw1 - sw, gy0 = s.y0 + s.botRail, gy1 = s.y1 - s.topRail;
    const [cols, rows] = lites;
    const xs = [gx0], ys = [gy0];
    for (let c = 1; c < cols; c++) xs.push(Math.round(gx0 + ((gx1 - gx0) * c) / cols));
    for (let r = 1; r < rows; r++) ys.push(Math.round(gy0 + ((gy1 - gy0) * r) / rows));
    xs.push(gx1);
    ys.push(gy1);
    for (let c = 1; c < cols; c++) b.box(xs[c], gy0, z0, xs[c] + 1, gy1, z1, sashPaint);
    for (let r = 1; r < rows; r++) b.box(gx0, ys[r], z0, gx1, ys[r] + 1, z1, sashPaint);
    for (let r = rows - 1; r >= 0; r--)
      for (let c = 0; c < cols; c++) {
        const i0 = xs[c] + (c > 0 ? 1 : 0), i1 = xs[c + 1], j0 = ys[r] + (r > 0 ? 1 : 0), j1 = ys[r + 1];
        sashPanes.push({ i0, j0, i1, j1, z: z0 + 1, sash: s.name });
      }
  }
  // order panes top-to-bottom, left-to-right
  sashPanes.sort((a, c) => c.j1 - a.j1 || a.i0 - c.i0);
  sashPanes.forEach((p, k) => {
    const isBroken = broken.has(k);
    if (isBroken) shards(b, rng, p.i0, p.j0, p.i1, p.j1, p.z, glassShard);
    panes.push(pane(b, p.i0, p.j0, p.i1, p.j1, p.z + 0.5, { sash: p.sash, ...(isBroken ? { broken: true } : {}), ...(small ? { frosted: true } : {}) }));
  });
  // weathering: peeling paint, dirty sill, rust stains from hardware
  peel(b, rng, [paint, sashPaint], opts.peel ?? rng.range(0.2, 0.8));
  grime(b, [paint], { h: sh + 1, amount: 0.6, seed: rng.int(1, 1e5), k: 0.7 });
  recolor(b, [paint, sashPaint], (v, x, y, z, n) => (n > 0.7 ? V.dirt(P, v, 0.8) : undefined), { freq: 0.06, seed: rng.int(1, 1e5) });
  return { model: b.model(), meta: { size: [w, h, fd * vs], mount: 'opening', kind: 'windowSash', style, panes, previewY: 1.0 } };
}

function aluWindow(rng, opts, w, h) {
  const vs = VS_FINE;
  const b = openingVB(w, h, 5, vs);
  const P = b.P;
  const col = Array.isArray(opts.color) ? opts.color : rng.pick([[150, 152, 150], [70, 58, 46], [200, 200, 196]]);
  const alu = mat.paint(P, 'alu', col, { cls: MCLS.GENERIC, rough: 0.4, metal: col[0] > 140 && col[0] < 160 ? 0.7 : 0.3 });
  const W = b.W, H = b.H;
  const fw = 2;
  b.shell(0, 0, 0, W, H, 4, fw, alu, { nz: true, pz: true });
  b.box(0, 0, 0, W, 1, 5, alu); // sill lip
  const mid = Math.round(W / 2);
  const panes = [];
  // two sashes: left on the outer track (z 2..3), right on the inner track (z 1..2)
  const sash = (x0, x1, z) => {
    b.box(x0, fw, z, x0 + 2, H - fw, z + 1, alu);
    b.box(x1 - 2, fw, z, x1, H - fw, z + 1, alu);
    b.box(x0, fw, z, x1, fw + 2, z + 1, alu);
    b.box(x0, H - fw - 2, z, x1, H - fw, z + 1, alu);
    return [x0 + 2, fw + 2, x1 - 2, H - fw - 2];
  };
  const a = sash(fw, mid + 1, 2), c = sash(mid - 1, W - fw, 1);
  const broken = new Set(opts.broken ?? []);
  panes.push(pane(b, a[0], a[1], a[2], a[3], 2.5, { sash: 'left', ...(broken.has(0) ? { broken: true } : {}) }));
  panes.push(pane(b, c[0], c[1], c[2], c[3], 1.5, { sash: 'right', ...(broken.has(1) ? { broken: true } : {}) }));
  // insect screen on the right half (outer track)
  if (rng.chance(0.6)) panes.push(pane(b, mid + 1, fw + 1, W - fw - 1, H - fw - 1, 3.5, { screen: true }));
  recolor(b, [alu], (v, x, y, z, n) => (n > 0.66 ? V.dirt(P, alu, 0.75) : undefined), { freq: 0.08, seed: rng.int(1, 1e5) });
  return { model: b.model(), meta: { size: [w, h, 5 * vs], mount: 'opening', kind: 'windowSash', style: 'alu', panes, previewY: 1.0 } };
}

function steelWindow(rng, opts, w, h) {
  const vs = VS_FINE;
  const b = openingVB(w, h, 5, vs);
  const P = b.P;
  const col = pickColor(rng, opts.color, ['black', 'grey', 'green', 'grey']);
  const steel = mat.paint(P, 'steel', col, { cls: MCLS.METAL_PAINTED, rough: 0.6, metal: 0.4 });
  const ply = mat.wood(P, 'ply', rgbJitter(rng, [120, 104, 82], 0.06));
  const painted = mat.paint(P, 'paintedGlass', rgbJitter(rng, rng.pick([[70, 70, 66], [120, 110, 90], [60, 70, 80]]), 0.05), { cls: MCLS.GENERIC, rough: 0.7 });
  const shardM = mat.glass(P, 'shard', [120, 132, 134]);
  const W = b.W, H = b.H;
  const fw = 3;
  b.box(0, 0, 0, W, H, 2, 0);
  b.shell(0, 0, 0, W, H, 4, fw, steel, { nz: true, pz: true });
  b.box(0, 0, 0, W, 2, 5, steel);
  const cols = opts.lites?.[0] ?? Math.max(2, Math.round(w / 0.3)), rows = opts.lites?.[1] ?? Math.max(2, Math.round(h / 0.34));
  const xs = [], ys = [];
  for (let c = 0; c <= cols; c++) xs.push(Math.round(fw + ((W - 2 * fw) * c) / cols));
  for (let r = 0; r <= rows; r++) ys.push(Math.round(fw + ((H - 2 * fw) * r) / rows));
  for (let c = 1; c < cols; c++) b.box(xs[c], fw, 0, xs[c] + 1, H - fw, 4, steel);
  for (let r = 1; r < rows; r++) b.box(fw, ys[r], 0, W - fw, ys[r] + 1, 4, steel);
  const panes = [];
  const brokenSet = new Set(opts.broken ?? []);
  const parts = [];
  // a hopper vent section (2 x 1 panes) tilted open
  const vent = rng.chance(0.35) && cols >= 2 && rows >= 3 ? { c: rng.int(0, cols - 2), r: rng.int(1, rows - 2) } : null;
  let k = 0;
  for (let r = rows - 1; r >= 0; r--)
    for (let c = 0; c < cols; c++) {
      const i0 = xs[c] + 1, i1 = xs[c + 1], j0 = ys[r] + 1, j1 = ys[r + 1];
      const idx = k++;
      if (vent && r === vent.r && (c === vent.c || c === vent.c + 1)) continue;
      const roll = vrand(c, r, 3, rng.int(0, 1e6));
      if (!opts.broken && roll < 0.06) {
        b.box(i0, j0, 1, i1, j1, 2, ply);
        continue;
      }
      if (!opts.broken && roll < 0.12) {
        b.box(i0, j0, 1, i1, j1, 2, painted);
        continue;
      }
      const isBroken = brokenSet.has(idx) || (!opts.broken && roll < 0.2);
      if (isBroken) shards(b, rng, i0, j0, i1, j1, 1, shardM);
      panes.push(pane(b, i0, j0, i1, j1, 1.5, { ...(isBroken ? { broken: true } : {}), ...(rng.chance(0.15) ? { frosted: true } : {}) }));
    }
  if (vent) {
    const i0 = xs[vent.c], i1 = xs[vent.c + 2] + 1, j0 = ys[vent.r], j1 = ys[vent.r + 1] + 1;
    const vb = new VB(i1 - i0, j1 - j0, 2, vs, [0, -(j1 - j0) * vs, 0]);
    const vm = vb.P.add('steel', { ...P.entries[steel] });
    vb.shell(0, 0, 0, i1 - i0, j1 - j0, 2, 1, vm, { nz: true, pz: true });
    vb.box(Math.round((i1 - i0) / 2), 0, 0, Math.round((i1 - i0) / 2) + 1, j1 - j0, 2, vm);
    const ang = rng.range(0.3, 0.6);
    parts.push({ name: 'vent', model: vb.model(), position: [b.mx(i0), b.my(j1), 2 * vs], rotation: [ang, 0, 0] });
    panes.push({ ...pane(b, i0 + 1, j0 + 1, i1 - 1, j1 - 1, 1.5), open: true });
  }
  rust(b, [steel], { amount: 0.5, seed: rng.int(1, 1e5), bottom: 3, edges: true });
  streaks(b, rng, [steel], { count: rng.int(3, 8), len: [4, 20], kind: 'rust', t: 0.45 });
  return { model: b.model(), parts, meta: { size: [w, h, 5 * vs], mount: 'opening', kind: 'windowSash', style: 'steel', panes, previewY: 1.0 } };
}

/**
 * Steel security grille bolted to the masonry around a window. opts: w, h (opening, m),
 * color, style 'straight'|'scroll', recess (m): if given, the grille is shifted to z = recess so
 * it can share the opening insert's transform; otherwise origin is on the WALL FACE plane at the
 * bottom centre of the opening. The grille overlaps the masonry by ~5 cm on each side.
 */
export function windowBars(rng, opts = {}) {
  const vs = VS_FINE;
  const w = opts.w ?? 0.9, h = opts.h ?? 1.3;
  const ov = 4; // overlap voxels
  const zr = Math.round((opts.recess ?? 0) / vs);
  const b = openingVB(w, h, zr + 6, vs, { l: ov, r: ov, b: ov, t: ov + (opts.style === 'scroll' ? 8 : 0) });
  const P = b.P;
  const col = pickColor(rng, opts.color, ['black', 'black', 'white', 'red', 'grey']);
  const steel = mat.paint(P, 'steel', col, { cls: MCLS.GENERIC, rough: 0.55, metal: 0.4 });
  const bolt = mat.steel(P, 'bolt', [70, 66, 60]);
  const W = b.W + 2 * ov, H = b.H + 2 * ov;
  const z0 = zr + 2; // stand-off from the wall face (tabs)
  // perimeter frame (flat bar 2 wide)
  b.box(0, 0, z0, W, 2, z0 + 1, steel);
  b.box(0, H - 2, z0, W, H, z0 + 1, steel);
  b.box(0, 0, z0, 2, H, z0 + 1, steel);
  b.box(W - 2, 0, z0, W, H, z0 + 1, steel);
  // horizontal flat bars
  const hb = [Math.round(H * 0.33), Math.round(H * 0.66)];
  for (const y of hb) b.box(0, y, z0, W, y + 2, z0 + 1, steel);
  // vertical square bars every ~11 cm, one bent
  const n = Math.max(3, Math.round((W - 4) / 8));
  const bent = rng.chance(0.4) ? rng.int(1, n - 1) : -1;
  for (let i = 0; i <= n; i++) {
    const x = Math.round(2 + ((W - 5) * i) / n);
    for (let y = 2; y < H - 2; y++) {
      const bow = i === bent ? Math.round(Math.sin(((y - 2) / (H - 4)) * Math.PI) * 2.5) : 0;
      b.box(x, y, z0 + 1 + Math.max(0, bow), x + 1, y + 1, z0 + 2 + Math.max(0, bow), steel);
    }
  }
  // mounting tabs + bolts into the masonry
  for (const [tx, ty] of [[0, 3], [0, H - 6], [W - 3, 3], [W - 3, H - 6]]) {
    b.box(tx, ty, zr, tx + 3, ty + 3, z0, steel);
    b.set(tx + 1, ty + 1, z0, bolt);
  }
  if (opts.style === 'scroll') {
    for (let k = 0; k < 3; k++) {
      const cx = W * (0.25 + k * 0.25), cy = H - 2 + 4;
      torusZ(b, cx, cy, z0 + 0.5, 3, 0.55, steel, (x, y) => y > H - 2);
    }
  }
  chips(b, rng, [steel], { density: col[0] > 150 ? 0.03 : 0.01, kinds: ['rust', 'rust', 'bare'] });
  rust(b, [steel], { amount: 0.5, seed: rng.int(1, 1e5), bottom: 6, edges: true });
  streaks(b, rng, [steel], { count: 4, len: [4, 14], kind: 'rust' });
  b.setMount([-(b.W / 2 + ov) * vs, -ov * vs, -zr * vs + (opts.recess ? (opts.recess - zr * vs) : 0)]);
  b.origin[2] = 0;
  return { model: b.model(), meta: { size: [W * vs, H * vs, (zr + 4) * vs], mount: opts.recess ? 'opening' : 'wall', kind: 'windowBars', previewY: 1.0 } };
}

/**
 * Plywood boarding over a window (or door) opening: weathered sheets, screws, delaminated
 * edges, optional sprayed X. opts: w, h (m), mount 'reveal' (inside the opening, near the wall
 * face: needs opts.recess, default 0.2) | 'face' (on the wall face, overlapping the masonry),
 * x (bool sprayed X), paint (canvas). Origin: opening-insert convention.
 */
export function boardedWindow(rng, opts = {}) {
  const vs = VS_FINE;
  const w = opts.w ?? 0.9, h = opts.h ?? 1.4;
  const recess = Math.round((opts.recess ?? 0.2) / vs);
  const face = opts.mount === 'face';
  const ov = face ? 4 : 0;
  const zP = face ? recess : Math.max(1, recess - 2);
  const b = openingVB(w, h, zP + 2, vs, { l: ov, r: ov, b: ov, t: ov });
  const P = b.P;
  const tone = rgbJitter(rng, rng.pick([[126, 112, 92], [110, 104, 96], [140, 124, 98], [96, 90, 82]]), 0.06);
  const ply = mat.wood(P, 'ply', tone, { rough: 0.92 });
  const ply2 = mat.wood(P, 'ply2', rgbMul(tone, 0.85), { rough: 0.92 });
  const screw = mat.steel(P, 'screw', [70, 66, 60]);
  const plyBack = mat.generic(P, 'plyBack', rgbMul(tone, 0.55), { rough: 0.95 });
  const W = b.W + 2 * ov, H = b.H + 2 * ov;
  const seam = H > 90 && rng.chance(0.6) ? Math.round(H * rng.range(0.45, 0.6)) : -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // delaminated / broken lower edge
      if (y < 2 && valueNoise2(x * 0.3, 1, 3) > 0.6) continue;
      if (y === seam) continue;
      b.set(x, y, zP, y > seam && seam > 0 ? ply2 : ply);
      b.set(x, y, zP - 1, plyBack);
    }
  // screws along the edges
  for (let x = 2; x < W - 1; x += rng.int(9, 13)) {
    b.set(x, 2, zP + 1, screw);
    b.set(x, H - 3, zP + 1, screw);
    if (seam > 0) {
      b.set(x, seam - 2, zP + 1, screw);
      b.set(x, seam + 2, zP + 1, screw);
    }
  }
  for (let y = 2; y < H - 1; y += rng.int(11, 15)) {
    b.set(2, y, zP + 1, screw);
    b.set(W - 3, y, zP + 1, screw);
  }
  // water streaks + dark rot at the bottom
  const seed = rng.int(1, 1e5);
  recolor(b, [ply, ply2], (v, x, y, z, n) => {
    const s = valueNoise2(x * 0.25, y * 0.02, seed);
    if (s > 0.68) return V.dark(P, v, 0.72);
    if (y < 6 + n * 8) return V.dark(P, v, 0.6);
    return undefined;
  }, { freq: 0.05, seed });
  // sprayed X (vacant marking) or graffiti
  const sprayX = opts.x ?? rng.chance(0.35);
  if (sprayX) {
    const sc = mat.generic(P, 'spray', rgbJitter(rng, rng.pick([[190, 40, 34], [220, 120, 40], [220, 220, 214]]), 0.05), { rough: 0.6 });
    const th = 1.6;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = x / W, v = y / H;
        const d1 = Math.abs(u - v) * Math.min(W, H), d2 = Math.abs(u - (1 - v)) * Math.min(W, H);
        if ((d1 < th || d2 < th) && u > 0.12 && u < 0.88 && b.get(x, y, zP) && vrand(x, y, 0, 3) < 0.85) b.set(x, y, zP, sc);
      }
  }
  const src = paintFor(opts.paint, 'front');
  if (src) applyPaint(b, src, '+z', { u0: 0, v0: 0, u1: W, v1: H }, {});
  return { model: b.model(), meta: { size: [W * vs, H * vs, (zP + 1) * vs], mount: 'opening', kind: 'boardedWindow', previewY: 1.0, paintSurfaces: { front: { w: W * vs, h: H * vs, face: '+z' } } } };
}

// ───────────────────────────── doors ─────────────────────────────

function doorFrame(b, steelM, W, H, fd) {
  b.box(0, 0, 0, 3, H, fd, steelM);
  b.box(W - 3, 0, 0, W, H, fd, steelM);
  b.box(0, H - 3, 0, W, H, fd, steelM);
}

/**
 * Exterior door insert. opts: w, h (m), style 'steel'|'steel2'|'wood'|'kitchen'|'boarded',
 * color (key or [r,g,b]), hinge 'left'|'right', paint (canvas -> door leaf front).
 * steel: hollow-metal door with hinges, lever, deadbolt, kickplate, closer arm, dents.
 * steel2: steel door with a wired-glass vision lite, latch guard and pull handle.
 * wood: painted panel door. kitchen: steel door + aluminum screen door in front.
 * boarded: plywood over the opening.
 */
export function door(rng, opts = {}) {
  const vs = VS_FINE;
  const w = opts.w ?? 0.95, h = opts.h ?? 2.15;
  const style = opts.style ?? rng.pick(['steel', 'steel2', 'wood', 'kitchen']);
  if (style === 'boarded') {
    const r = boardedWindow(rng, { w, h, recess: opts.recess ?? 0.2, x: opts.x ?? rng.chance(0.5), paint: opts.paint });
    r.meta.kind = 'door';
    r.meta.style = 'boarded';
    r.meta.previewY = 0;
    return r;
  }
  const kitchen = style === 'kitchen';
  const depth = kitchen ? 12 : 8;
  const b = openingVB(w, h, depth, vs);
  const P = b.P;
  const W = b.W, H = b.H;
  const col = pickColor(rng, opts.color, style === 'wood' ? ['brown', 'green', 'red', 'black', 'blue', 'grey'] : ['grey', 'green', 'brown', 'red', 'blue', 'black', 'grey']);
  const frameM = mat.paint(P, 'frame', rgbMul(col, rng.range(0.85, 1.05)), { cls: MCLS.METAL_PAINTED, rough: 0.6, metal: 0.4 });
  const leaf = style === 'wood' ? mat.paint(P, 'leaf', col, { cls: MCLS.GENERIC, rough: 0.65, metal: 0 }) : mat.paint(P, 'leaf', col, { cls: MCLS.GENERIC, rough: 0.55, metal: 0.4 });
  const hw = mat.steel(P, 'hardware', [150, 148, 140], { metal: 0.85, rough: 0.35 });
  const dark = mat.steel(P, 'darkhw', [50, 48, 46]);
  const fd = 6;
  doorFrame(b, frameM, W, H, fd);
  const hingeRight = (opts.hinge ?? rng.pick(['left', 'right'])) === 'right';
  // leaf: 3 voxels thick, front face at z = 5
  const lx0 = 3, lx1 = W - 3, ly0 = 0, ly1 = H - 3, lz0 = 2, lz1 = 5;
  b.box(lx0, ly0 + 1, lz0, lx1, ly1, lz1, leaf);
  const panes = [];
  const latchX = hingeRight ? lx0 + 5 : lx1 - 6;
  const hingeX = hingeRight ? lx1 : lx0 - 1;
  // hinges (knuckles on the hinge side)
  for (const hy of [12, Math.round(H / 2), H - 22]) b.box(hingeX, hy, lz1 - 1, hingeX + 1, hy + 9, lz1 + 1, hw);
  if (style === 'wood') {
    // raised panels: 2 x 3 grid
    const pc = 2, pr = 3;
    for (let c = 0; c < pc; c++)
      for (let r = 0; r < pr; r++) {
        const x0 = Math.round(lx0 + 6 + ((lx1 - lx0 - 12) * c) / pc) + (c ? 2 : 0), x1 = Math.round(lx0 + 6 + ((lx1 - lx0 - 12) * (c + 1)) / pc) - (c ? 0 : 2);
        const y0 = Math.round(ly0 + 8 + ((ly1 - ly0 - 16) * r) / pr) + 2, y1 = Math.round(ly0 + 8 + ((ly1 - ly0 - 16) * (r + 1)) / pr) - 2;
        b.box(x0, y0, lz1, x1, y1, lz1 + 1, leaf);
        b.box(x0 + 2, y0 + 2, lz1 - 1, x1 - 2, y1 - 2, lz1, 0);
        b.box(x0 + 2, y0 + 2, lz1 - 2, x1 - 2, y1 - 2, lz1 - 1, leaf);
      }
    b.g.cylZ(latchX + 0.5, 72.5, 1.6, lz1, lz1 + 3, hw); // knob
    b.box(latchX - 1, 80, lz1, latchX + 2, 83, lz1 + 1, hw); // deadbolt
  } else {
    // kickplate
    b.box(lx0 + 2, 1, lz1, lx1 - 2, 19, lz1 + 1, hw);
    // lever handle + escutcheon, deadbolt
    b.box(latchX - 1, 68, lz1, latchX + 2, 76, lz1 + 1, hw);
    b.box(hingeRight ? latchX + 1 : latchX - 7, 73, lz1 + 1, hingeRight ? latchX + 8 : latchX + 1, 75, lz1 + 3, hw);
    b.box(latchX - 1, 82, lz1, latchX + 2, 85, lz1 + 1, hw);
    // door closer box + arm at the top (pull side)
    const cx0 = hingeRight ? lx1 - 26 : lx0 + 4;
    b.box(cx0, ly1 - 8, lz1, cx0 + 22, ly1 - 3, lz1 + 4, dark);
    b.g.line(hingeRight ? cx0 + 2 : cx0 + 20, ly1 - 4, lz1 + 3, hingeRight ? cx0 - 6 : cx0 + 28, ly1 + 1, lz1 + 6, 0.8, dark);
    b.box(hingeRight ? cx0 - 8 : cx0 + 26, ly1, lz1, hingeRight ? cx0 - 4 : cx0 + 30, ly1 + 3, lz1 + 6, dark);
    if (style === 'steel2') {
      // narrow vision lite (wired glass) + latch guard plate
      const vx0 = hingeRight ? lx0 + 12 : lx1 - 22, vy0 = 100, vx1 = vx0 + 10, vy1 = 136;
      b.box(vx0 - 1, vy0 - 1, lz0, vx1 + 1, vy1 + 1, lz1 + 1, frameM);
      b.box(vx0, vy0, lz0, vx1, vy1, lz1 + 1, 0);
      panes.push(pane(b, vx0, vy0, vx1, vy1, 3.5, { wired: true }));
      b.box(hingeRight ? latchX - 2 : latchX - 4, 60, lz1 + 1, hingeRight ? latchX + 4 : latchX + 3, 90, lz1 + 2, hw);
    }
  }
  // threshold
  b.box(0, 0, 0, W, 1, fd + 1, hw);
  // dents on the steel leaf
  if (style !== 'wood') for (let i = 0, nd = rng.int(1, 3); i < nd; i++) dent(b, 'z', lz1 - 1, -1, rng.range(lx0 + 8, lx1 - 8), rng.range(20, 60), rng.range(3, 7), rng.range(0.8, 1.5));
  // weathering
  const seed = rng.int(1, 1e5);
  if (style === 'wood') peel(b, rng, [leaf], rng.range(0.3, 0.8));
  else {
    mottle(b, [leaf], { freq: 0.04, seed, k: [0.9, 1.08], sat: 0.15, cover: 0.3 });
    chips(b, rng, [leaf], { density: 0.004, kinds: ['rust', 'primer', 'bare'] });
  }
  rust(b, [leaf, frameM], { amount: 0.45, seed: seed + 1, bottom: 5, edges: false });
  streaks(b, rng, [leaf], { count: rng.int(2, 6), len: [6, 30], kind: 'rust', t: 0.35 });
  grime(b, [leaf, frameM], { h: 22, amount: 0.65, seed: seed + 2, k: 0.7 });
  // hand grime around the handle
  recolor(b, [leaf], (v, x, y, z) => (Math.abs(x - latchX) < 6 && y > 60 && y < 90 && vrand(x, y, z, 9) < 0.5 ? V.dirt(P, v, 0.7) : undefined), { freq: 0.1 });
  const src = paintFor(opts.paint, 'front');
  if (src) applyPaint(b, src, '+z', { u0: lx0, v0: ly0, u1: lx1, v1: ly1 }, { depthLimit: 2, skip: new Set([hw, dark]) });
  // kitchen: aluminum screen door in front
  if (kitchen) {
    const alu = mat.galv(P, 'alu', [160, 162, 160]);
    const sz0 = 9, sz1 = 11;
    const sx0 = 3, sx1 = W - 3, sy1 = H - 3;
    b.box(sx0, 1, sz0, sx0 + 3, sy1, sz1, alu);
    b.box(sx1 - 3, 1, sz0, sx1, sy1, sz1, alu);
    b.box(sx0, sy1 - 3, sz0, sx1, sy1, sz1, alu);
    b.box(sx0, 1, sz0, sx1, 22, sz1, alu); // kick panel
    b.box(sx0, 74, sz0, sx1, 79, sz1, alu); // push bar rail
    b.box(sx0 + 4, 75, sz1, sx1 - 4, 77, sz1 + 1, hw);
    // pneumatic closer tube
    b.g.line(sx0 + 4, sy1 - 6, sz1 + 1, sx0 + 26, sy1 - 10, 6, 0.9, alu);
    panes.push(pane(b, sx0 + 3, 79, sx1 - 3, sy1 - 3, 10, { screen: true }));
    panes.push(pane(b, sx0 + 3, 22, sx1 - 3, 74, 10, { screen: true }));
    grime(b, [alu], { h: 22, amount: 0.5, seed: seed + 3 });
  }
  return {
    model: b.model(),
    meta: { size: [w, h, depth * vs], mount: 'opening', kind: 'door', style, panes, anchors: { handle: [b.mx(latchX), 0.98, lz1 * vs] }, paintSurfaces: { front: { w: (lx1 - lx0) * vs, h: (ly1 - ly0) * vs, face: '+z' } } },
  };
}

/**
 * Roll-up steel door: corrugated curtain (horizontal ribs), bottom bar with padlocked hasp,
 * side guides, hood box at the top of the opening. opts: w, h, color, open (m, curtain raised),
 * paint (canvas -> curtain). Origin: opening-insert convention.
 */
export function rollupDoor(rng, opts = {}) {
  const vs = VS_FINE;
  const w = opts.w ?? 3.6, h = opts.h ?? 3.3;
  const b = openingVB(w, h, 14, vs);
  const P = b.P;
  const W = b.W, H = b.H;
  const col = Array.isArray(opts.color) ? opts.color : rgbJitter(rng, rng.pick([[150, 152, 150], [120, 122, 120], [96, 80, 66], [80, 90, 100], [150, 140, 120]]), 0.05);
  const slat = mat.paint(P, 'slat', col, { cls: MCLS.GENERIC, rough: 0.5, metal: 0.5 });
  const slatD = mat.paint(P, 'slatD', rgbMul(col, 0.82), { cls: MCLS.GENERIC, rough: 0.55, metal: 0.5 });
  const guide = mat.steel(P, 'guide', [70, 70, 70]);
  const hood = mat.paint(P, 'hood', rgbMul(col, 0.9), { cls: MCLS.GENERIC, rough: 0.6, metal: 0.4 });
  const brass = mat.steel(P, 'lock', [150, 120, 60], { metal: 0.9, rough: 0.3 });
  const rubber = mat.rubber(P);
  const hoodH = Math.round(0.45 / vs);
  const openV = Math.round(clamp(opts.open ?? (rng.chance(0.15) ? rng.range(0.3, 0.9) : 0), 0, h - 0.6) / vs);
  const gw = 4, zc = 6;
  // side guides
  b.box(0, 0, 2, gw, H - hoodH, 10, guide);
  b.box(W - gw, 0, 2, W, H - hoodH, 10, guide);
  b.box(1, 0, 4, gw, H - hoodH, 8, 0);
  b.box(W - gw, 0, 4, W - 1, H - hoodH, 8, 0);
  // hood box (coil housing) at the top of the opening
  b.box(0, H - hoodH, 1, W, H, 13, hood);
  b.box(0, H - hoodH, 12, W, H - hoodH + 2, 14, hood);
  // curtain: flat, slat profile rendered as shaded colour bands (a geometric rib on every slat
  // would break greedy merging on every row); one real joint step every 8 slats
  const slatL = mat.paint(P, 'slatL', rgbMul(col, 1.12), { cls: MCLS.GENERIC, rough: 0.45, metal: 0.5 });
  const back = mat.paint(P, 'back', rgbMul(col, 0.6), { cls: MCLS.GENERIC, rough: 0.7, metal: 0.3 });
  const yBot = openV;
  for (let y = yBot + 3; y < H - hoodH; y++) {
    const ph = (y - yBot) % 5;
    const m = ph === 0 ? slatD : ph === 1 ? slatL : slat;
    b.box(1, y, zc, W - 1, y + 1, zc + 1, m);
    b.box(1, y, zc - 1, W - 1, y + 1, zc, back); // uniform backing layer: cheap back faces
  }
  // bottom bar (angle) with rubber seal, lift handles, hasp + padlock
  b.box(1, yBot, zc - 1, W - 1, yBot + 1, zc + 2, rubber);
  b.box(1, yBot + 1, zc - 1, W - 1, yBot + 3, zc + 2, guide);
  const hx = Math.round(W / 2);
  b.box(hx - 3, yBot + 3, zc + 1, hx + 3, yBot + 8, zc + 2, guide);
  if (openV === 0) {
    b.box(hx - 1, yBot + 1, zc + 2, hx + 2, yBot + 5, zc + 4, brass);
    b.box(hx - 4, 0, zc + 2, hx + 4, 1, zc + 4, guide); // floor eye
  }
  for (const lx of [Math.round(W * 0.25), Math.round(W * 0.75)]) b.box(lx - 3, yBot + 4, zc + 1, lx + 3, yBot + 5, zc + 3, guide);
  // dent from a vehicle + rust + grime
  if (rng.chance(0.6)) dent(b, 'z', zc, -1, rng.range(W * 0.2, W * 0.8), rng.range(yBot + 15, yBot + 60), rng.range(8, 16), rng.range(1, 2), { squash: 1.6 });
  const seed = rng.int(1, 1e5);
  rust(b, [slat, slatD, slatL, guide], { amount: 0.5, seed: seed + 1, bottom: 6, y0: yBot, edges: false });
  streaks(b, rng, [hood], { count: rng.int(3, 6), len: [6, 20], kind: 'rust', t: 0.35 });
  streaks(b, rng, [slat, slatD, slatL], { count: rng.int(2, 5), len: [20, 80], kind: 'rust', t: 0.3, yMin: H - hoodH - 4 });
  grime(b, [slat, slatD, slatL], { h: yBot + 22, amount: 0.55, seed: seed + 2, k: 0.75, freq: 0.04 });
  const src = paintFor(opts.paint, 'front');
  if (src) applyPaint(b, src, '+z', { u0: gw, v0: yBot, u1: W - gw, v1: H - hoodH }, { depthLimit: 3 });
  const panes = openV > 0 ? [{ ...pane(b, gw, 0, W - gw, yBot, 2), open: true }] : [];
  return { model: b.model(), meta: { size: [w, h, 14 * vs], mount: 'opening', kind: 'rollupDoor', panes, paintSurfaces: { front: { w: (W - 2 * gw) * vs, h: (H - hoodH) * vs, face: '+z' } } } };
}

/**
 * Sectional garage door: 4 sections with raised panels, joint hinges, handle, side lock,
 * optional windows in the top section; painted, dented, rusty bottom.
 * opts: w, h, color, windows (bool), paint (canvas). Origin: opening-insert convention.
 */
export function garageDoor(rng, opts = {}) {
  const vs = VS_FINE;
  const w = opts.w ?? 2.6, h = opts.h ?? 2.4;
  const b = openingVB(w, h, 7, vs);
  const P = b.P;
  const W = b.W, H = b.H;
  const col = pickColor(rng, opts.color, ['white', 'cream', 'brown', 'green', 'red', 'grey']);
  const panel = mat.paint(P, 'panel', col, { cls: MCLS.GENERIC, rough: 0.55, metal: 0.4 });
  const panelL = mat.paint(P, 'panelL', rgbMul(col, 1.1), { cls: MCLS.GENERIC, rough: 0.55, metal: 0.4 });
  const panelD = mat.paint(P, 'panelD', rgbMul(col, 0.72), { cls: MCLS.GENERIC, rough: 0.55, metal: 0.4 });
  const frameM = mat.wood(P, 'jamb', rgbMix(col, [120, 110, 96], 0.4));
  const hw = mat.steel(P, 'hw', [70, 68, 64]);
  const backG = mat.generic(P, 'back', rgbMul(col, 0.5), { rough: 0.8 });
  b.box(0, 0, 0, 3, H, 6, frameM);
  b.box(W - 3, 0, 0, W, H, 6, frameM);
  b.box(0, H - 3, 0, W, H, 6, frameM);
  const sections = 4;
  const sh = Math.floor((H - 3) / sections);
  const windows = opts.windows ?? rng.chance(0.35);
  const panes = [];
  const nPanels = Math.max(2, Math.round(w / 0.62));
  for (let s = 0; s < sections; s++) {
    const y0 = s * sh, y1 = s === sections - 1 ? H - 3 : (s + 1) * sh;
    b.box(3, y0, 3, W - 3, y1 - 1, 4, panel);
    b.box(3, y1 - 1, 3, W - 3, y1, 4, panelD); // joint line
    b.box(3, y0, 2, W - 3, y1, 3, backG);
    for (let k = 0; k < nPanels; k++) {
      const x0 = Math.round(3 + 4 + ((W - 14) * k) / nPanels), x1 = Math.round(3 + 4 + ((W - 14) * (k + 1)) / nPanels) - 4;
      if (windows && s === sections - 1) {
        b.box(x0, y0 + 5, 2, x1, y1 - 5, 4, 0);
        panes.push(pane(b, x0, y0 + 5, x1, y1 - 5, 3));
        continue;
      }
      // raised-panel relief as light (top/left) and shadow (bottom/right) edge lines
      b.box(x0, y1 - 5, 3, x1, y1 - 4, 4, panelL);
      b.box(x0, y0 + 4, 3, x0 + 1, y1 - 4, 4, panelL);
      b.box(x0, y0 + 4, 3, x1, y0 + 5, 4, panelD);
      b.box(x1 - 1, y0 + 4, 3, x1, y1 - 4, 4, panelD);
    }
    for (const hx of [8, Math.round(W / 2), W - 10]) b.box(hx, y1 - 2, 4, hx + 3, y1 + 2, 5, hw);
  }
  b.box(Math.round(W / 2) - 4, 12, 4, Math.round(W / 2) + 4, 14, 6, hw); // handle
  b.box(W - 14, 30, 4, W - 11, 34, 6, hw); // side lock
  b.box(3, 0, 1, W - 3, 1, 5, mat.rubber(P)); // bottom seal
  // dented / bowed lower section
  for (let i = 0, nd = rng.int(1, 3); i < nd; i++) dent(b, 'z', 3, -1, rng.range(15, W - 15), rng.range(8, sh - 4), rng.range(5, 12), rng.range(1, 2), { squash: 1.5 });
  const seed = rng.int(1, 1e5);
  peel(b, rng, [panel], rng.range(0.1, 0.4));
  rust(b, [panel, panelD, panelL], { amount: 0.4, seed, bottom: 6, edges: false });
  streaks(b, rng, [panel], { count: rng.int(2, 5), len: [6, 40], kind: 'dirt' });
  grime(b, [panel, panelD, panelL], { h: 24, amount: 0.55, seed: seed + 1, k: 0.75, freq: 0.04 });
  const src = paintFor(opts.paint, 'front');
  if (src) applyPaint(b, src, '+z', { u0: 3, v0: 0, u1: W - 3, v1: H - 3 }, { depthLimit: 2 });
  return { model: b.model(), meta: { size: [w, h, 6 * vs], mount: 'opening', kind: 'garageDoor', panes, paintSurfaces: { front: { w: (W - 6) * vs, h: (H - 3) * vs, face: '+z' } } } };
}

/**
 * Warehouse sliding door on an overhead track mounted on the wall face. The door leaf is wider
 * than the opening and slides along the face (slightly open by `open` m, revealing a dark gap).
 * opts: w, h (opening), recess (m, depth of the opening = distance from the recess plane to the
 * wall face, default 0.135), open (m), kind 'corrugated'|'planks', color, paint.
 * Origin: opening-insert convention (the leaf sits at z = recess, on the wall face).
 */
export function slidingDoor(rng, opts = {}) {
  const vs = VS_FINE;
  const w = opts.w ?? 4.4, h = opts.h ?? 3.6;
  const zr = Math.round((opts.recess ?? 0.135) / vs);
  const open = Math.round((opts.open ?? rng.range(0, 0.6)) / vs);
  const over = 8; // leaf overlap past the jambs
  const trackUp = 14;
  const b = openingVB(w, h, zr + 10, vs, { l: over + 2, r: over + open + 2, t: trackUp });
  const P = b.P;
  const W = b.W, H = b.H, ox = b.ox;
  const kind = opts.kind ?? rng.pick(['corrugated', 'planks']);
  const col = Array.isArray(opts.color) ? opts.color : rgbJitter(rng, kind === 'planks' ? rng.pick([[110, 84, 60], [90, 70, 52], [70, 80, 64]]) : rng.pick([[130, 132, 128], [110, 60, 44], [80, 90, 96], [150, 140, 116]]), 0.05);
  const leafM = kind === 'planks' ? mat.wood(P, 'plank', col) : mat.paint(P, 'leaf', col, { cls: MCLS.METAL_PAINTED, rough: 0.55, metal: 0.45 });
  const leafD = kind === 'planks' ? mat.wood(P, 'plankD', rgbMul(col, 0.8)) : mat.paint(P, 'leafD', rgbMul(col, 0.82), { cls: MCLS.METAL_PAINTED, rough: 0.6, metal: 0.45 });
  const frameM = mat.paint(P, 'frame', rgbMul(col, 0.7), { cls: MCLS.METAL_PAINTED, rough: 0.6, metal: 0.4 });
  const leafL = kind === 'planks' ? leafM : mat.paint(P, 'leafL', rgbMul(col, 1.12), { cls: MCLS.METAL_PAINTED, rough: 0.5, metal: 0.45 });
  const backM = mat.generic(P, 'back', rgbMul(col, 0.5), { rough: 0.8 });
  const track = mat.steel(P, 'track', [60, 58, 56]);
  const z0 = zr + 2;
  const lx0 = ox - over + open, lx1 = ox + W + over + open;
  // leaf with frame and vertical ribs / planks
  for (let x = lx0; x < lx1; x++) {
    const ph = (x - lx0) % 6;
    const rib = kind === 'corrugated' ? ph < 2 : (x - lx0) % 10 === 0;
    b.box(x, 1, z0 + 1, x + 1, H + 2, z0 + 2, rib ? leafD : kind === 'corrugated' && ph === 2 ? leafL : leafM);
    b.box(x, 1, z0, x + 1, H + 2, z0 + 1, backM);
  }
  b.box(lx0, 1, z0 + 2, lx1, 4, z0 + 4, frameM);
  b.box(lx0, H - 1, z0 + 2, lx1, H + 2, z0 + 4, frameM);
  b.box(lx0, 1, z0 + 2, lx0 + 3, H + 2, z0 + 4, frameM);
  b.box(lx1 - 3, 1, z0 + 2, lx1, H + 2, z0 + 4, frameM);
  // diagonal brace
  b.g.line(lx0 + 3, 5, z0 + 3, lx1 - 4, H - 2, z0 + 3, 1.0, frameM);
  // overhead track on brackets + trolleys
  const ty = H + trackUp - 6;
  b.box(ox - over - 2, ty, zr, ox + W + over + open + 2, ty + 4, zr + 8, track);
  for (const bx of [ox - over, ox + W / 2, ox + W + over]) b.box(Math.round(bx), ty - 2, zr, Math.round(bx) + 3, ty + 6, zr + 1, track);
  for (const tx of [lx0 + 10, lx1 - 14]) {
    b.box(tx, H + 2, z0 + 2, tx + 4, ty, z0 + 3, track);
    b.g.cylZ(tx + 2, ty + 2, 2.4, zr + 8, zr + 10, track);
  }
  // handle + bottom guide + hasp
  b.box(lx0 + 6, 60, z0 + 4, lx0 + 8, 90, z0 + 6, track);
  b.box(ox + W - 6, 0, zr, ox + W - 2, 3, z0 + 4, track);
  const seed = rng.int(1, 1e5);
  rust(b, [leafM, leafD, leafL, frameM], { amount: 0.5, seed, bottom: 8, edges: false });
  streaks(b, rng, [leafM, leafD, leafL], { count: rng.int(3, 6), len: [10, 70], kind: 'rust', t: 0.3 });
  grime(b, [leafM, leafD, leafL, frameM], { h: 26, amount: 0.55, seed: seed + 1, k: 0.75, freq: 0.04 });
  const src = paintFor(opts.paint, 'front');
  if (src) applyPaint(b, src, '+z', { u0: lx0, v0: 1, u1: lx1, v1: H }, { depthLimit: 3 });
  const panes = open > 0 ? [{ ...pane(b, ox, 0, ox + open, H, 1), open: true }] : [];
  return { model: b.model(), meta: { size: [(W + 2 * over + open) * vs, (H + trackUp) * vs, (zr + 10) * vs], mount: 'opening', kind: 'slidingDoor', panes, paintSurfaces: { front: { w: (lx1 - lx0) * vs, h: H * vs, face: '+z' } } } };
}

// ───────────────────────────── stoop / bollard ─────────────────────────────

/**
 * Concrete stoop / steps in front of a door. opts: w (m, default 1.35), steps (1-4), depth
 * (landing depth, m, 0.9), recess (m, landing continues back into the door recess, default
 * 0.2), rail (bool: pipe handrail on one side). Origin: WALL FACE at ground, bottom centre;
 * extends +Z (and back to z = -recess). meta.topY = landing height (raise the door by it).
 */
export function stoop(rng, opts = {}) {
  const vs = VS_FINE;
  const n = clamp(opts.steps ?? rng.int(1, 3), 1, 5);
  const Wm = opts.w ?? 1.35, dm = opts.depth ?? rng.range(0.7, 1.0);
  const riser = Math.round(0.18 / vs), tread = Math.round(0.28 / vs);
  const W = Math.round(Wm / vs), landing = Math.round(dm / vs), rec = Math.round((opts.recess ?? 0.2) / vs);
  const total = landing + (n - 1) * tread; // n risers: landing on top, n-1 treads below it
  const railH = opts.rail ? Math.round(0.95 / vs) : 0;
  const b = new VB(W + 6, n * riser + railH + 4, total + rec + 4, vs, 'corner');
  b.setMount([-((W + 6) / 2) * vs, 0, -rec * vs]);
  const P = b.P;
  const conc = mat.concrete(P, 'conc', rgbJitter(rng, [128, 126, 118], 0.05));
  const concD = mat.concrete(P, 'concD', rgbJitter(rng, [100, 98, 92], 0.05));
  const nosing = mat.steel(P, 'nosing', [70, 62, 54]);
  const x0 = 3, x1 = 3 + W;
  const topY = n * riser;
  b.box(x0, 0, 0, x1, topY, rec + landing, conc);
  for (let s = 0; s < n - 1; s++) {
    const zs = rec + landing + s * tread;
    b.box(x0, 0, zs, x1, (n - 1 - s) * riser, zs + tread, conc);
  }
  // chipped nosings, cracks, stains
  b.g.forEach((v, x, y, z) => {
    if (v !== conc) return;
    const m = (b.get(x, y + 1, z) ? 0 : 1) + (b.get(x, y, z + 1) ? 0 : 1);
    if (m === 2 && vrand(x, y, z, 5) < 0.18) b.set(x, y, z, 0);
  });
  if (rng.chance(0.4)) for (let x = x0; x < x1; x++) b.set(x, topY - 1, rec + landing - 1, nosing);
  const seed = rng.int(1, 1e5);
  recolor(b, [conc], (v, x, y, z, nn) => (nn > 0.68 ? concD : nn < 0.2 ? V.dirt(P, conc, 0.75) : undefined), { freq: 0.06, seed });
  // crack lines on the landing
  for (let k = 0; k < rng.int(1, 3); k++) {
    let x = rng.int(x0 + 2, x1 - 2), z = rec + rng.int(2, landing - 2);
    for (let i = 0; i < rng.int(10, 30); i++) {
      b.set(x, topY - 1, z, concD);
      x += rng.int(-1, 1);
      z += rng.chance(0.7) ? 1 : 0;
      if (x < x0 || x >= x1 || z >= rec + landing) break;
    }
  }
  if (opts.rail) {
    const pipe = mat.paint(P, 'rail', rgbJitter(rng, rng.pick([[40, 40, 42], [150, 140, 60], [120, 40, 34]]), 0.05), { cls: MCLS.METAL_PAINTED, rough: 0.5, metal: 0.4 });
    const rx = rng.chance(0.5) ? x0 + 1 : x1 - 2;
    const zTop = rec + landing - 3, zBot = Math.min(b.nz - 1, rec + total + 1);
    const ylow = 0;
    b.g.line(rx, topY, zTop, rx, topY + railH, zTop, 1.4, pipe);
    b.g.line(rx, 0, zBot, rx, ylow + railH, zBot, 1.4, pipe);
    b.g.line(rx, topY + railH, rec + 2, rx, topY + railH, zTop, 1.4, pipe);
    b.g.line(rx, topY + railH, zTop, rx, ylow + railH, zBot, 1.4, pipe);
    b.g.line(rx, topY + railH * 0.5, zTop, rx, ylow + railH * 0.5, zBot, 1.0, pipe);
    rust(b, [pipe], { amount: 0.5, seed: seed + 3, bottom: 4, edges: true });
  }
  return { model: b.model(), meta: { size: [W * vs, topY * vs, (total + rec) * vs], footprint: [W * vs, total * vs], mount: 'wall', kind: 'stoop', topY: topY * vs, steps: n } };
}

/**
 * Steel pipe bollard (yellow paint, chipped, tire scuffs, concrete-filled dome top).
 * opts: height (m), dia (m), color, lean (rad). Origin: base centre.
 */
export function bollard(rng, opts = {}) {
  const vs = VS_FINE;
  const H = Math.round((opts.height ?? rng.range(0.95, 1.2)) / vs);
  const R = (opts.dia ?? rng.pick([0.168, 0.152, 0.114])) / 2 / vs;
  const n = Math.ceil(R * 2 + 3);
  const b = new VB(n, H + Math.ceil(R * 0.6) + 2, n, vs, 'floor');
  const P = b.P;
  const col = Array.isArray(opts.color) ? opts.color : rgbJitter(rng, rng.pick([[200, 160, 40], [200, 160, 40], [190, 60, 40], [60, 60, 62]]), 0.05);
  const paint = mat.paint(P, 'paint', col, { cls: MCLS.GENERIC, rough: 0.55, metal: 0.25 });
  const conc = mat.concrete(P, 'cap', [132, 128, 120]);
  const c = n / 2;
  lathe(b, c, c, 0, H, () => [R, -1], paint);
  lathe(b, c, c, H, H + Math.ceil(R * 0.6) + 1, (y) => {
    const t = (y - H) / (R * 0.6 + 0.5);
    return [Math.max(0.5, R * Math.sqrt(Math.max(0, 1 - t * t))), -1];
  }, conc);
  const seed = rng.int(1, 1e5);
  chips(b, rng, [paint], { density: 0.008, kinds: ['rust', 'rust', 'bare'] });
  // scrapes from bumpers: a few short dark / bare streaks at bumper height on one side
  const sa = rng.range(0, TAU);
  recolor(b, [paint], (v, x, y, z, nn) => {
    if (y < 3 + nn * 5) return V.rust(P, v, 0.9);
    const a = Math.atan2(z + 0.5 - c, x + 0.5 - c);
    let da = Math.abs(Math.atan2(Math.sin(a - sa), Math.cos(a - sa)));
    if (da < 0.9 && y > 30 && y < 52 && valueNoise2(a * 6, y * 0.6, seed) > 0.62) return variant(P, v, 'scuff', (e) => ({ ...e, color: vrand(x, y, z, 2) < 0.5 ? [44, 42, 40] : [120, 118, 110], rough: 0.7 }));
    return undefined;
  }, { freq: 0.1, seed });
  streaks(b, rng, [paint], { count: 3, len: [6, 20], kind: 'rust', t: 0.4 });
  const model = b.model();
  const lean = opts.lean ?? (rng.chance(0.3) ? rng.range(0.02, 0.08) : 0);
  if (!lean) return { model, meta: { size: b.sizeM(), footprint: [R * 2 * vs, R * 2 * vs], mount: 'floor', kind: 'bollard' } };
  const r = rot(['x', lean], ['y', rng.range(0, TAU)]);
  return { model: emptyModel(vs), parts: [{ name: 'bollard', model, position: [0, -0.01, 0], rotation: r }], meta: { size: b.sizeM(), footprint: [R * 2 * vs, R * 2 * vs], mount: 'floor', kind: 'bollard', lean } };
}
