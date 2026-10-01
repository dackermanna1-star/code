// Wall infrastructure: meters, gas meter, junction boxes, conduit, downspouts, window AC,
// exhaust fans, vents, condenser, signs. Wall-mounted props: origin on the wall surface
// (back plane z = 0), bottom centre; they extend toward +Z.
import {
  VB, mat, V, MCLS, VS_FINE, VS_MED, VS_XFINE, COL, rgbMul, rgbMix, rgbJitter, valueNoise2, valueNoise3, fbm2, clamp,
  recolor, grime, mottle, rust, streaks, chips, vrand, emptyModel, addProp, eachSurface, F_PY, F_PZ, textMask, rot,
  lathe, latheZ, torusZ, projectFace, applyPaint, paintFor, famSet, dent, TAU, variant,
} from './kit.js';

const GREY_BOX = [[128, 130, 128], [112, 116, 114], [140, 140, 134], [96, 100, 100]];

function weatherSteel(b, rng, mats, { rustAmt = 0.3, streak = 4 } = {}) {
  const seed = rng.int(1, 1e6);
  mottle(b, mats, { freq: 0.06, seed, k: [0.9, 1.06], sat: 0.1, cover: 0.3 });
  if (streak) streaks(b, rng, mats, { count: streak, len: [4, 16], kind: 'rust', t: 0.35 });
  rust(b, mats, { amount: rustAmt, seed: seed + 1, bottom: 0, edges: true });
  chips(b, rng, mats, { density: 0.004, kinds: ['rust'] });
}

// ───────────────────────────── conduit helper ─────────────────────────────

/** EMT conduit along a polyline of axis-aligned segments (voxel coords), with couplings. */
function conduitPath(b, pts, r, m, coup) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, c] = [pts[i], pts[i + 1]];
    b.g.line(a[0], a[1], a[2], c[0], c[1], c[2], r, m);
    // coupling rings every ~2 m
    const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    for (let s = 70; s < len - 10; s += 150) {
      const t = s / len;
      const p = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
      const d = [(c[0] - a[0]) / len, (c[1] - a[1]) / len, (c[2] - a[2]) / len];
      b.g.line(p[0] - d[0], p[1] - d[1], p[2] - d[2], p[0] + d[0], p[1] + d[1], p[2] + d[2], r + 0.5, coup);
    }
  }
}

/** One-hole conduit strap at p (voxel coords) for a pipe running along axis 'x' or 'y'. */
function strap(b, p, axis, m) {
  const [x, y, z] = p.map(Math.round);
  if (axis === 'y') {
    b.box(x - 2, y, 0, x + 3, y + 2, z + 2, m);
    b.box(x + 2, y, 0, x + 4, y + 2, 1, m);
  } else {
    b.box(x, y - 2, 0, x + 2, y + 3, z + 2, m);
    b.box(x, y + 2, 0, x + 2, y + 4, 1, m);
  }
}

// ───────────────────────────── electric meters ─────────────────────────────

function meterSocket(b, P, cx, y0, rng, { box, glass, dial, ring, dark }) {
  // enclosure 16 x 24 x 7 with rounded top
  const w = 16, h = 24, d = 7;
  const x0 = Math.round(cx - w / 2);
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const top = y - y0 > h - 4;
      const dx = Math.abs(x + 0.5 - cx), dy = y + 0.5 - (y0 + h - 4);
      if (top && Math.hypot(Math.max(0, dx - (w / 2 - 4)), dy) > 4) continue;
      b.box(x, y, 0, x + 1, y + 1, d, box);
    }
  // meter: ring + glass dome
  const my = y0 + 13;
  latheZ(b, cx, my, d, d + 1, () => [7.4, 5.5], ring);
  latheZ(b, cx, my, d, d + 9, (z) => {
    const t = (z - d) / 9;
    const r = 6.4 * Math.sqrt(Math.max(0.05, 1 - Math.pow(Math.max(0, t - 0.35) / 0.65, 2)));
    return [r, -1];
  }, (x, y, z) => {
    const dz = z - d;
    if (dz >= 7.5) {
      // face seen through the glass: register digits + disk slot
      if (Math.abs(y + 0.5 - (my - 2)) < 0.6 && Math.abs(x + 0.5 - cx) < 3) return dark;
      if (Math.abs(y + 0.5 - (my + 2)) < 0.6 && Math.abs(x + 0.5 - cx) < 2) return dial;
      return glass;
    }
    return dz < 2 ? dark : glass;
  });
  // seal tag
  b.box(Math.round(cx + 6), y0 + 5, d, Math.round(cx + 7), y0 + 7, d + 1, mat.plastic(P, 'seal', [180, 40, 34]));
  return { top: y0 + h, bottom: y0, front: d };
}

/**
 * Single socket electric meter (round glass meter on a grey box) with conduit to the ground.
 * opts: height (box bottom above ground, default 1.35), conduit 'down'|'up'|'none'.
 * Origin: wall surface at ground level below the meter.
 */
export function electricMeter(rng, opts = {}) {
  const vs = VS_FINE;
  const hM = opts.height ?? 1.35;
  const y0 = Math.round(hM / vs);
  const cond = opts.conduit ?? rng.weighted(['down', 'up', 'none'], [3, 1, 1]);
  const ny = y0 + 24 + (cond === 'up' ? Math.round(rng.range(0.6, 1.4) / vs) : 2);
  const b = new VB(24, ny, 18, vs, 'wall');
  const P = b.P;
  const boxC = rgbJitter(rng, rng.pick(GREY_BOX), 0.05);
  const M = {
    box: mat.paint(P, 'box', boxC, { cls: MCLS.GENERIC, rough: 0.55, metal: 0.4 }),
    glass: mat.glass(P, 'glass', [172, 182, 184]),
    dial: mat.generic(P, 'dial', [210, 208, 200], { rough: 0.4 }),
    ring: mat.galv(P, 'ring', [150, 152, 150]),
    dark: mat.plastic(P, 'dark', [36, 36, 38]),
  };
  const cx = 12;
  const s = meterSocket(b, P, cx, y0, rng, M);
  const pipe = mat.galv(P, 'emt', [150, 152, 150]);
  const coup = mat.galv(P, 'coup', [130, 132, 130]);
  if (cond === 'down') {
    conduitPath(b, [[cx, y0, 3], [cx, 0, 3]], 1.2, pipe, coup);
    for (let y = 30; y < y0 - 10; y += 70) strap(b, [cx - 1, y, 3], 'y', pipe);
  } else if (cond === 'up') {
    conduitPath(b, [[cx, s.top, 3], [cx, ny, 3]], 1.2, pipe, coup);
    strap(b, [cx - 1, s.top + 20, 3], 'y', pipe);
  }
  weatherSteel(b, rng, [M.box], { rustAmt: rng.range(0.1, 0.5) });
  grime(b, [pipe], { h: 12, amount: 0.6, seed: 4 });
  return {
    model: b.model(),
    meta: { size: b.sizeM(), mount: 'wall', kind: 'electricMeter', previewY: 0, anchors: { meter: [0, (y0 + 13) * vs, 16 * vs] }, paintSurfaces: { front: { w: 16 * vs, h: 24 * vs, face: '+z' } } },
  };
}

/**
 * Bank of 3-6 apartment meters over a horizontal wireway with a main disconnect, service
 * conduit running up the wall and unit labels. opts: count, height (wireway bottom, 1.0),
 * mastHeight (m above the bank, default 1.6). Origin: wall surface at ground, centred.
 */
export function meterBank(rng, opts = {}) {
  const vs = VS_FINE;
  const n = clamp(opts.count ?? rng.int(3, 6), 2, 8);
  const pitch = 24;
  const disc = 26;
  const W = n * pitch + disc + 10;
  const wy = Math.round((opts.height ?? 1.0) / vs);
  const mast = Math.round((opts.mastHeight ?? rng.range(1.2, 2.2)) / vs);
  const ny = wy + 12 + 26 + mast;
  const b = new VB(W, ny, 20, vs, 'wall');
  const P = b.P;
  const boxC = rgbJitter(rng, rng.pick(GREY_BOX), 0.05);
  const M = {
    box: mat.paint(P, 'box', boxC, { cls: MCLS.GENERIC, rough: 0.55, metal: 0.4 }),
    glass: mat.glass(P, 'glass', [172, 182, 184]),
    dial: mat.generic(P, 'dial', [210, 208, 200], { rough: 0.4 }),
    ring: mat.galv(P, 'ring', [150, 152, 150]),
    dark: mat.plastic(P, 'dark', [36, 36, 38]),
  };
  const pipe = mat.galv(P, 'emt', [150, 152, 150]);
  const coup = mat.galv(P, 'coup', [130, 132, 130]);
  const label = mat.paper(P, 'label', [214, 210, 196]);
  const ink = mat.paper(P, 'ink', [40, 40, 44]);
  // wireway (gutter) along the bottom
  b.box(3, wy, 0, W - 3, wy + 11, 9, M.box);
  b.box(3, wy + 10, 0, W - 3, wy + 11, 10, M.box);
  for (let x = 6; x < W - 6; x += 20) b.set(x, wy + 5, 9, M.ring); // cover screws
  // meters
  const tops = [];
  for (let i = 0; i < n; i++) {
    const cx = 6 + pitch / 2 + i * pitch;
    const s = meterSocket(b, P, cx, wy + 13, rng, M);
    tops.push(cx);
    b.box(cx - 1, wy + 11, 2, cx + 1, wy + 13, 4, pipe); // nipple into the gutter
    // unit label under the meter
    const lab = rng.pick(['1', '2', '3', 'G', '1F', '2F', '3F', 'R', 'B']);
    const lw = 7, lh = 4;
    const mask = textMask(lw, lh, [{ text: i === 0 && rng.chance(0.3) ? 'HSE' : lab, size: 0.95, y: 0.5 }], { ss: 6 });
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) b.set(Math.round(cx - lw / 2) + x, wy + 2 + y, 9, mask[x + y * lw] > 0.45 ? ink : label);
    void s;
  }
  // main disconnect at the end
  const dx0 = 6 + n * pitch + 2;
  b.box(dx0, wy + 13, 0, dx0 + disc - 4, wy + 13 + 30, 9, M.box);
  b.box(dx0 + disc - 6, wy + 25, 9, dx0 + disc - 4, wy + 36, 12, mat.paint(P, 'handle', [150, 34, 30], { cls: MCLS.GENERIC }));
  b.box(dx0 + 3, wy + 34, 9, dx0 + 12, wy + 39, 10, label);
  b.box(dx0 + 2, wy + 13, 9, dx0 + disc - 6, wy + 14, 10, M.box);
  // service conduit up from the disconnect + feeders into the wall
  const sx = dx0 + 10;
  conduitPath(b, [[sx, wy + 43, 4], [sx, ny, 4]], 2.4, pipe, coup);
  for (let y = wy + 60; y < ny - 10; y += 70) strap(b, [sx - 1, y, 6], 'y', pipe);
  // ground wire + clamp running down to the ground
  const cu = mat.generic(P, 'copper', [150, 90, 50], { metal: 0.8, rough: 0.4 });
  b.g.line(3, wy, 1, 3, 0, 1, 0.5, cu);
  weatherSteel(b, rng, [M.box], { rustAmt: rng.range(0.15, 0.5), streak: 8 });
  grime(b, [M.box, pipe], { h: wy + 6, amount: 0.4, seed: 3 });
  const src = paintFor(opts.paint, 'front');
  if (src) applyPaint(b, src, '+z', { u0: 3, v0: wy, u1: W - 3, v1: wy + 43 }, { skip: new Set([M.glass]) });
  return {
    model: b.model(),
    meta: { size: b.sizeM(), mount: 'wall', kind: 'meterBank', count: n, anchors: { serviceTop: [b.mx(sx), ny * vs, 4 * vs] }, paintSurfaces: { front: { w: (W - 6) * vs, h: 43 * vs, face: '+z' } } },
  };
}

/**
 * Residential gas meter with regulator, shutoff valve and yellow painted pipes from the ground
 * into the wall. opts: height (meter bottom, default 0.45). Origin: wall surface at ground.
 */
export function gasMeter(rng, opts = {}) {
  const vs = VS_FINE;
  const y0 = Math.round((opts.height ?? rng.range(0.35, 0.6)) / vs);
  const b = new VB(46, y0 + 36, 26, vs, 'wall');
  const P = b.P;
  const meterC = rgbJitter(rng, rng.pick([[150, 150, 146], [176, 170, 150], [120, 124, 122]]), 0.05);
  const body = mat.paint(P, 'meter', meterC, { cls: MCLS.GENERIC, rough: 0.5, metal: 0.4 });
  const yellow = mat.paint(P, 'yellow', rgbJitter(rng, [196, 160, 40], 0.06), { cls: MCLS.GENERIC, rough: 0.6, metal: 0.2 });
  const glass = mat.glass(P, 'glass', [170, 180, 182]);
  const dial = mat.generic(P, 'dial', [210, 208, 200], { rough: 0.4 });
  const black = mat.plastic(P, 'black', [36, 36, 38]);
  const steel = mat.steel(P, 'steel', [90, 90, 88]);
  const red = mat.paint(P, 'tag', [160, 40, 34], { cls: MCLS.GENERIC });
  const x0 = 16, w = 24, h = 22, d = 15;
  // meter body with rounded top edge and a front index window
  b.box(x0, y0, 4, x0 + w, y0 + h, 4 + d, body);
  b.box(x0 + 1, y0 + h, 5, x0 + w - 1, y0 + h + 2, 3 + d, body);
  b.box(x0 + 5, y0 + h - 8, 3 + d, x0 + w - 5, y0 + h - 3, 4 + d, glass);
  for (let x = x0 + 7; x < x0 + w - 7; x += 3) b.set(x, y0 + h - 6, 3 + d, dial);
  b.box(x0 + 3, y0 + 2, 4 + d, x0 + w - 3, y0 + 4, 5 + d, body); // bottom lip
  // inlet / outlet swivels on top
  const pr = 1.6;
  const inX = x0 + 5, outX = x0 + w - 5, pz = 10;
  b.g.line(inX, y0 + h + 2, pz, inX, y0 + h + 6, pz, pr, steel);
  b.g.line(outX, y0 + h + 2, pz, outX, y0 + h + 6, pz, pr, steel);
  // inlet riser from the ground on the left: up, valve, regulator, over to the meter inlet
  const rx = 6;
  b.g.line(rx, 0, pz, rx, y0 + h + 8, pz, pr, yellow);
  b.g.line(rx, y0 + h + 8, pz, inX, y0 + h + 8, pz, pr, yellow);
  b.g.line(inX, y0 + h + 8, pz, inX, y0 + h + 5, pz, pr, yellow);
  // shutoff valve with tab
  b.box(rx - 2, y0 + 6, pz - 2, rx + 3, y0 + 10, pz + 3, steel);
  b.box(rx - 1, y0 + 8, pz + 3, rx + 2, y0 + 9, pz + 7, steel);
  b.set(rx, y0 + 9, pz + 6, red);
  // regulator bell with downward vent
  b.g.ellipsoid(rx + 0.5, y0 + 16, pz + 4, 4.5, 3.2, 4.5, mat.paint(P, 'reg', [70, 80, 90], { cls: MCLS.GENERIC, metal: 0.4 }));
  b.g.line(rx + 4, y0 + 16, pz + 4, rx + 6, y0 + 12, pz + 6, 1.0, black);
  // outlet: up and into the wall
  b.g.line(outX, y0 + h + 8, pz, outX + 10, y0 + h + 8, pz, pr, yellow);
  b.g.line(outX + 10, y0 + h + 8, pz, outX + 10, y0 + h + 8, 0, pr, yellow);
  b.box(outX + 7, y0 + h + 4, 0, outX + 14, y0 + h + 12, 1, mat.galv(P, 'escutch', [140, 140, 138]));
  // weathering: chipped yellow paint with rust, dirty meter
  chips(b, rng, [yellow], { density: 0.06, kinds: ['rust', 'bare'] });
  rust(b, [yellow, steel], { amount: 0.5, seed: rng.int(1, 1e5), bottom: 4, edges: false });
  weatherSteel(b, rng, [body], { rustAmt: 0.2, streak: 3 });
  grime(b, [body, yellow], { h: y0 + 4, amount: 0.5, seed: 9 });
  return { model: b.model(), meta: { size: b.sizeM(), mount: 'wall', kind: 'gasMeter', anchors: { meter: [b.mx(x0 + w / 2), (y0 + h / 2) * vs, 12 * vs] } } };
}

/**
 * Grey steel junction / pull box with screwed cover and conduit stubs.
 * opts: size 's'|'m'|'l', conduits: ['down','up','left','right'] (short stubs; lengths opts.stub m).
 * Origin: wall surface, bottom centre of the box.
 */
export function junctionBox(rng, opts = {}) {
  const vs = VS_FINE;
  const size = opts.size ?? rng.pick(['s', 'm', 'm', 'l']);
  const [w, h, d] = { s: [11, 11, 6], m: [22, 22, 9], l: [30, 37, 11] }[size];
  const stub = Math.round((opts.stub ?? rng.range(0.25, 0.7)) / vs);
  const dirs = opts.conduits ?? rng.pick([['down'], ['up'], ['down', 'up'], ['left'], ['down', 'right']]);
  const padX = dirs.includes('left') || dirs.includes('right') ? stub : 2;
  const padY = dirs.includes('down') ? stub : 1;
  const b = new VB(w + 2 * padX, h + padY + (dirs.includes('up') ? stub : 1), d + 4, vs, 'corner');
  const P = b.P;
  const boxM = mat.paint(P, 'box', rgbJitter(rng, rng.pick(GREY_BOX), 0.05), { cls: MCLS.GENERIC, rough: 0.55, metal: 0.4 });
  const pipe = mat.galv(P, 'emt', [150, 152, 150]);
  const screw = mat.steel(P, 'screw', [90, 88, 84]);
  const x0 = padX, y0 = padY;
  b.box(x0, y0, 0, x0 + w, y0 + h, d, boxM);
  b.box(x0 - 1, y0 - 1, d - 1, x0 + w + 1, y0 + h + 1, d + 1, boxM); // cover lip
  for (const [sx, sy] of [[x0 + 1, y0 + 1], [x0 + w - 2, y0 + 1], [x0 + 1, y0 + h - 2], [x0 + w - 2, y0 + h - 2]]) b.set(sx, sy, d + 1, screw);
  if (size === 'l') b.box(x0 + w - 4, y0 + h / 2 - 3, d + 1, x0 + w - 2, y0 + h / 2 + 3, d + 2, screw); // latch
  const cx = x0 + w / 2, cz = 3;
  for (const dir of dirs) {
    if (dir === 'down') conduitPath(b, [[cx, y0, cz], [cx, 0, cz]], 1.2, pipe, pipe);
    if (dir === 'up') conduitPath(b, [[cx, y0 + h, cz], [cx, b.ny, cz]], 1.2, pipe, pipe);
    if (dir === 'left') conduitPath(b, [[x0, y0 + h / 2, cz], [0, y0 + h / 2, cz]], 1.2, pipe, pipe);
    if (dir === 'right') conduitPath(b, [[x0 + w, y0 + h / 2, cz], [b.nx, y0 + h / 2, cz]], 1.2, pipe, pipe);
  }
  weatherSteel(b, rng, [boxM], { rustAmt: rng.range(0.2, 0.6), streak: 4 });
  const src = paintFor(opts.paint, 'front');
  if (src) applyPaint(b, src, '+z', { u0: x0 - 1, v0: y0 - 1, u1: x0 + w + 1, v1: y0 + h + 1 }, {});
  b.setMount([-(x0 + w / 2) * vs, -y0 * vs, 0]);
  return { model: b.model(), meta: { size: [w * vs, h * vs, d * vs], mount: 'wall', kind: 'junctionBox', previewY: 1.2, paintSurfaces: { front: { w: w * vs, h: h * vs, face: '+z' } } } };
}

/**
 * Straight EMT conduit run with one-hole straps and couplings. opts: length (m), axis 'x'|'y'.
 * Origin: wall surface; axis 'x': centred along x, y = 0 at the pipe bottom; axis 'y': x centred, y from 0 to length.
 */
export function conduitRun(rng, opts = {}) {
  const vs = VS_FINE;
  const axis = opts.axis ?? 'y';
  const L = Math.round((opts.length ?? 2) / vs);
  const b = axis === 'y' ? new VB(6, L, 5, vs, 'wall') : new VB(L, 6, 5, vs, 'wall');
  const P = b.P;
  const pipe = mat.galv(P, 'emt', rgbJitter(rng, [150, 152, 150], 0.04));
  const coup = mat.galv(P, 'coup', [128, 130, 128]);
  const strapM = mat.galv(P, 'strap', [138, 140, 138]);
  if (axis === 'y') {
    conduitPath(b, [[3, 0, 2], [3, L, 2]], 1.2, pipe, coup);
    for (let y = 20 + rng.int(0, 20); y < L - 4; y += rng.int(55, 80)) strap(b, [2, y, 2], 'y', strapM);
  } else {
    conduitPath(b, [[0, 3, 2], [L, 3, 2]], 1.2, pipe, coup);
    for (let x = 20 + rng.int(0, 20); x < L - 4; x += rng.int(55, 80)) strap(b, [x, 2, 2], 'x', strapM);
  }
  recolor(b, [pipe], (v, x, y, z, n) => (n > 0.68 ? V.tone(P, pipe, 0.8, 0) : undefined), { freq: 0.05, seed: rng.int(1, 1e5) });
  streaks(b, rng, [pipe], { count: 3, len: [3, 10], kind: 'rust', t: 0.3 });
  return { model: b.model(), meta: { size: b.sizeM(), mount: 'wall', kind: 'conduitRun', axis, previewY: axis === 'x' ? 1.5 : 0 } };
}

// ───────────────────────────── downspout ─────────────────────────────

/**
 * Downspout: rectangular corrugated leader (or round) with conductor head at the top, offset
 * elbows, straps, kick-out shoe at the bottom, dents and rust streaks.
 * opts: height (m, top of the conductor head), style 'rect'|'round', color 'galv'|'white'|'brown'|'grey'|'black',
 *       broken (bool: bottom section missing). Origin: wall surface at ground below the leader.
 */
export function downspout(rng, opts = {}) {
  const vs = VS_FINE;
  const Hm = opts.height ?? rng.range(7, 11);
  const H = Math.round(Hm / vs);
  const style = opts.style ?? rng.weighted(['rect', 'round'], [3, 1]);
  const ck = opts.color ?? rng.weighted(['galv', 'white', 'brown', 'grey', 'black'], [3, 2, 2, 1.5, 1]);
  const cols = { galv: [150, 152, 150], white: [196, 196, 188], brown: [86, 66, 50], grey: [120, 122, 120], black: [38, 38, 40] };
  const b = new VB(26, H, 30, vs, 'wall');
  const P = b.P;
  const m = ck === 'galv' ? mat.galv(P, 'pipe', rgbJitter(rng, cols.galv, 0.04)) : mat.paint(P, 'pipe', rgbJitter(rng, cols[ck], 0.05), { cls: MCLS.GENERIC, rough: 0.5, metal: 0.3 });
  const strapM = ck === 'galv' ? m : mat.paint(P, 'strap', rgbMul(cols[ck], 0.9), { cls: MCLS.GENERIC });
  const flute = variant(P, m, 'flute', (e) => ({ ...e, color: rgbMul(e.color, 0.78) }));
  const cx = 13;
  const pw = style === 'rect' ? 6 : 5.6, pd = style === 'rect' ? 7 : 5.6;
  const zIn = 1 + Math.ceil(pd / 2); // pipe centre z at the wall
  const zOut = zIn + 8; // offset away from the wall near the top
  const section = (x0, y0, x1, y1, zc) => {
    if (style === 'rect') {
      const hz = pd / 2;
      for (let y = Math.max(0, Math.round(Math.min(y0, y1))); y < Math.min(H, Math.round(Math.max(y0, y1))); y++) {
        const t = (y - y0) / (y1 - y0 || 1);
        const x = Math.round(x0 + (x1 - x0) * t);
        const z = Math.round(zc(y));
        b.box(x - 3, y, z - Math.floor(hz), x + 3, y + 1, z + Math.ceil(hz), m);
        // corrugation: vertical flute lines (colour only: geometric grooves cost one quad per row)
        for (const gx of [x - 2, x + 1]) b.set(gx, y, z + Math.ceil(hz) - 1, flute);
        b.set(x - 3, y, z, flute);
        b.set(x + 2, y, z, flute);
      }
    } else {
      for (let y = Math.max(0, Math.round(Math.min(y0, y1))); y < Math.min(H, Math.round(Math.max(y0, y1))); y++) {
        const t = (y - y0) / (y1 - y0 || 1);
        const x = x0 + (x1 - x0) * t;
        const z = zc(y);
        for (let zz = Math.floor(z - 3); zz <= z + 3; zz++) for (let xx = Math.floor(x - 3); xx <= x + 3; xx++) if (Math.hypot(xx + 0.5 - x, zz + 0.5 - z) < pw / 2) b.set(xx, y, zz, m);
      }
    }
  };
  // conductor head at the top (box with a tapered funnel)
  const headH = 22, headY = H - headH;
  const offsetTop = headY - 4, offsetBot = offsetTop - 18;
  for (let y = headY; y < H; y++) {
    const t = (y - headY) / headH;
    const hw = 6 + Math.min(1, t * 2.2) * 6, hd = 5 + Math.min(1, t * 2.2) * 5;
    b.box(Math.round(cx - hw), y, Math.max(0, Math.round(zOut - hd)), Math.round(cx + hw), y + 1, Math.round(zOut + hd), m);
  }
  b.box(cx - 13, H - 2, 0, cx + 13, H, zOut + 11, m); // top lip
  b.box(cx - 12, headY + 9, zOut + 10, cx + 12, headY + 10, zOut + 11, m);
  // offset: from the head (zOut) diagonally back to the wall (zIn)
  section(cx, offsetTop, cx, headY + 1, () => zOut);
  section(cx, offsetBot, cx, offsetTop, (y) => zIn + ((y - offsetBot) / (offsetTop - offsetBot)) * (zOut - zIn));
  // main run down to the shoe
  const broken = opts.broken ?? rng.chance(0.2);
  const shoeY = 14;
  const gapY0 = broken ? Math.round(rng.range(0.4, 0.9) / vs) : 0;
  section(cx, broken ? gapY0 : shoeY, cx, offsetBot + 1, () => zIn);
  if (!broken) {
    // kick-out shoe: elbow outward at the bottom
    for (let k = 0; k < 12; k++) section(cx, shoeY - k - 1, cx, shoeY - k, () => zIn + k * 0.9);
  } else {
    // jagged torn end
    for (let x = cx - 3; x < cx + 3; x++) if (vrand(x, gapY0, 0, 3) < 0.5) b.box(x, gapY0, 0, x + 1, gapY0 + 1, zIn + 4, 0);
  }
  // straps every ~1.8 m
  for (let y = 40 + rng.int(0, 30); y < offsetBot - 10; y += Math.round(rng.range(1.5, 2.1) / vs)) {
    if (broken && y < gapY0 + 4) continue;
    b.box(cx - 5, y, 0, cx + 5, y + 2, zIn + Math.ceil(pd / 2) + 1, strapM);
    b.box(cx - 5, y, zIn + Math.ceil(pd / 2), cx + 5, y + 2, zIn + Math.ceil(pd / 2) + 1, strapM);
  }
  // dents near the bottom (kicked / hit)
  if (style === 'rect') for (let i = 0; i < rng.int(1, 3); i++) dent(b, 'z', zIn + Math.ceil(pd / 2) - 1, -1, cx - 0.5, rng.range(20, 120), rng.range(3, 6), rng.range(1, 2), { squash: 0.6 });
  const seed = rng.int(1, 1e5);
  // long vertical weathering bands (keeps tall quads)
  recolor(b, [m], (v, x, y, z, n) => {
    const nn = valueNoise2(x * 0.02, y * 0.004, seed);
    return nn > 0.62 ? V.tone(P, m, 0.86, 0.1) : nn < 0.3 ? V.tone(P, m, 1.05, 0) : undefined;
  }, { freq: 0.01, seed });
  streaks(b, rng, [m], { count: rng.int(3, 7), len: [10, 60], kind: 'rust', t: ck === 'white' ? 0.3 : 0.4 });
  grime(b, [m], { h: 30, amount: 0.6, seed: seed + 1, k: 0.7 });
  return {
    model: b.model(),
    meta: { size: b.sizeM(), mount: 'wall', kind: 'downspout', style, anchors: { outlet: [0, broken ? gapY0 * vs : 0.05, (zIn + 10) * vs], head: [0, Hm, zOut * vs] } },
  };
}

// ───────────────────────────── window AC ─────────────────────────────

/**
 * Window air conditioner sitting on the sill, with accordion side panels and a support bracket.
 * opts: w (opening width to fill with side panels, m), color [r,g,b], protrude (m, default 0.42).
 * Origin: like an opening insert - bottom centre of the window opening at the recess plane;
 * the unit extends +Z. Use windowSash with raised >= meta.height to leave room for it.
 */
export function acUnit(rng, opts = {}) {
  const vs = VS_FINE;
  const W = Math.round(rng.range(0.46, 0.6) / vs), H = Math.round(rng.range(0.3, 0.38) / vs);
  const prot = Math.round((opts.protrude ?? rng.range(0.38, 0.46)) / vs);
  const back = 6;
  const openW = Math.round((opts.w ?? 0.88) / vs);
  const nx = Math.max(openW, W + 2);
  const b = new VB(nx, H + 10, prot + back + 2, vs, 'corner');
  b.setMount([-(nx * vs) / 2, -10 * vs, -back * vs]);
  const P = b.P;
  const col = opts.color ?? rgbJitter(rng, rng.pick([[196, 188, 166], [176, 176, 170], [206, 204, 196], [150, 146, 136]]), 0.04);
  const casing = mat.paint(P, 'casing', col, { cls: MCLS.GENERIC, rough: 0.5, metal: 0.4 });
  const grille = mat.paint(P, 'grille', rgbMul(col, 0.72), { cls: MCLS.GENERIC, rough: 0.6, metal: 0.4 });
  const dark = mat.generic(P, 'dark', [30, 30, 30], { rough: 0.8 });
  const panel = mat.plastic(P, 'panel', rgbJitter(rng, [200, 198, 190], 0.04), { rough: 0.5 });
  const bracket = mat.steel(P, 'bracket', [60, 58, 54]);
  const x0 = Math.round(nx / 2 - W / 2), y0 = 10, z0 = 0, z1 = prot + back;
  b.box(x0, y0, z0, x0 + W, y0 + H, z1, casing);
  // rear (outdoor) face: recessed coil grille with fins
  b.box(x0 + 1, y0 + 1, z1 - 1, x0 + W - 1, y0 + H - 1, z1, dark);
  for (let y = y0 + 2; y < y0 + H - 1; y += 2) b.box(x0 + 1, y, z1 - 1, x0 + W - 1, y + 1, z1, grille);
  // side louvers (outside the window plane)
  for (let z = back + 3; z < z1 - 3; z++)
    for (let y = y0 + 4; y < y0 + H - 3; y += 3) {
      b.set(x0, y, z, dark);
      b.set(x0 + W - 1, y, z, dark);
    }
  // top: slightly domed lid + drip edge
  b.box(x0, y0 + H, back, x0 + W, y0 + H + 1, z1, casing);
  // accordion side panels filling the opening at the window plane
  for (let x = 0; x < nx; x++) {
    if (x >= x0 && x < x0 + W) continue;
    const pleat = x % 3 === 0 ? 1 : 0;
    b.box(x, y0, back - 1 + pleat, x + 1, y0 + H, back + pleat, panel);
  }
  // support bracket below (angled to the wall below the sill)
  b.g.line(x0 + 3, y0 - 1, z1 - 4, x0 + 3, 0, back + 1, 0.8, bracket);
  b.g.line(x0 + W - 4, y0 - 1, z1 - 4, x0 + W - 4, 0, back + 1, 0.8, bracket);
  b.box(x0 + 2, y0 - 1, back, x0 + W - 2, y0, z1 - 2, bracket);
  // weathering: yellowed / dirty, rust streaks from the bottom, grime on top
  const seed = rng.int(1, 1e5);
  mottle(b, [casing], { freq: 0.06, seed, k: [0.86, 1.04], sat: 0.2, cover: 0.35 });
  rust(b, [casing], { amount: 0.4, seed: seed + 1, bottom: 2, y0, edges: true });
  streaks(b, rng, [casing], { count: rng.int(3, 7), len: [3, 12], kind: 'rust', t: 0.4 });
  recolor(b, [casing], (v, x, y, z, n, m) => (m & F_PY && n > 0.4 ? V.dirt(P, casing, 0.7) : undefined), { freq: 0.1, seed: seed + 2 });
  return {
    model: b.model(),
    meta: { size: [nx * vs, (H + 10) * vs, (prot + back) * vs], mount: 'opening', kind: 'acUnit', height: (H + 1) * vs, previewY: 1.0, anchors: { drip: [0, 0, (z1 - back - 2) * vs] } },
  };
}

// ───────────────────────────── exhaust / vents ─────────────────────────────

/**
 * Kitchen exhaust on a wall: sheet-metal housing with rain hood and gravity louvers (or a
 * round fan guard with a spinning fan part), heavy grease staining.
 * opts: style 'louver'|'fan', size (m, default 0.6). Origin: wall surface, bottom centre.
 */
export function exhaustFan(rng, opts = {}) {
  const vs = VS_FINE;
  const style = opts.style ?? rng.pick(['louver', 'fan']);
  const S = Math.round((opts.size ?? rng.range(0.5, 0.7)) / vs);
  const D = Math.round(0.26 / vs);
  const b = new VB(S + 6, S + 8, D + 8, vs, 'wall');
  const P = b.P;
  const metal = mat.galv(P, 'metal', rgbJitter(rng, [140, 142, 140], 0.04));
  const dark = mat.generic(P, 'dark', [26, 24, 22], { rough: 0.7 });
  const blade = mat.galv(P, 'blade', [120, 122, 120]);
  const x0 = 3, y0 = 0;
  b.box(x0, y0, 0, x0 + S, y0 + S, D, metal);
  b.box(x0 + 2, y0 + 2, D - 1, x0 + S - 2, y0 + S - 2, D, dark);
  b.box(x0 - 2, y0 + S, 0, x0 + S + 2, y0 + S + 2, D + 6, metal); // rain hood top
  b.box(x0 - 2, y0 + S - 4, D + 4, x0 + S + 2, y0 + S, D + 6, metal);
  for (const sx of [x0 - 2, x0 + S + 1]) for (let y = y0 + S - 4; y < y0 + S; y++) b.box(sx, y, D, sx + 1, y + 1, D + 6 - (y0 + S - y), metal);
  const parts = [];
  if (style === 'louver') {
    for (let y = y0 + 3; y < y0 + S - 3; y += 3) {
      b.box(x0 + 2, y, D - 1, x0 + S - 2, y + 1, D + 1, blade);
      b.box(x0 + 2, y + 1, D, x0 + S - 2, y + 2, D + 1, blade);
    }
  } else {
    // round guard (concentric rings + cross bars)
    const cx = x0 + S / 2, cy = y0 + S / 2, R = S / 2 - 3;
    for (const r of [R, R * 0.66, R * 0.33]) torusZ(b, cx, cy, D + 0.5, r, 0.6, blade);
    b.g.line(cx - R, cy, D + 0.5, cx + R, cy, D + 0.5, 0.6, blade);
    b.g.line(cx, cy - R, D + 0.5, cx, cy + R, D + 0.5, 0.6, blade);
    // fan blades part (spins about z)
    const fb = new VB(Math.ceil(R * 2 + 2), Math.ceil(R * 2 + 2), 3, vs, 'center');
    const fm = mat.galv(fb.P, 'fan', [110, 112, 110]);
    const fc = (R * 2 + 2) / 2;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      fb.fill(0, 0, 0, fb.nx, fb.ny, 3, (px, py, pz) => {
        const dx = px - fc, dy = py - fc;
        const r = Math.hypot(dx, dy);
        if (r > R - 0.5 || r < 1.5) return r < 2 ? fm : undefined;
        let da = Math.atan2(dy, dx) - a;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        return Math.abs(da) < 0.32 && Math.abs(pz - 1.5 - da * 2) < 1 ? fm : undefined;
      });
    }
    parts.push({ name: 'fan', model: fb.model(), position: [b.mx(cx), b.my(cy), (D - 3) * vs], rotation: [0, 0, rng.range(0, TAU)], animate: 'spin-z' });
  }
  // grease: dark glossy streaks + coating
  const seed = rng.int(1, 1e5);
  recolor(b, [metal], (v, x, y, z, n) => (n > 0.55 ? V.grease(P, metal) : n < 0.25 ? V.tone(P, metal, 0.7, 0) : undefined), { freq: 0.09, seed });
  streaks(b, rng, [metal], { count: rng.int(6, 14), len: [6, 30], kind: 'grease' });
  return { model: b.model(), parts, meta: { size: b.sizeM(), mount: 'wall', kind: 'exhaustFan', previewY: 2.2, style } };
}

/** Dryer / bathroom vent hood with lint. opts: kind 'flap'|'louver', color. Origin: wall surface, bottom centre. */
export function dryerVent(rng, opts = {}) {
  const vs = VS_FINE;
  const b = new VB(16, 16, 12, vs, 'wall');
  const P = b.P;
  const col = opts.color ?? rgbJitter(rng, rng.pick([[200, 198, 190], [150, 150, 146], [110, 100, 86]]), 0.04);
  const hood = mat.plastic(P, 'hood', col, { rough: 0.5 });
  const lint = mat.fabric(P, 'lint', [150, 148, 144]);
  const dark = mat.generic(P, 'dark', [30, 30, 30]);
  b.box(1, 1, 0, 15, 15, 1, hood); // flange
  latheZ(b, 8, 8, 1, 7, () => [4.5, 3.4], hood);
  if ((opts.kind ?? rng.pick(['flap', 'louver'])) === 'flap') {
    b.box(3, 3, 7, 13, 13, 8, hood);
    b.box(3, 2, 6, 13, 3, 8, dark);
  } else {
    b.box(2, 2, 1, 14, 14, 8, hood);
    for (let y = 3; y < 13; y += 2) b.box(3, y, 7, 13, y + 1, 8, dark);
  }
  // lint fuzz and grime streak under it
  for (let i = 0; i < 18; i++) b.set(rng.int(3, 12), rng.int(1, 4), rng.int(1, 8), lint);
  streaks(b, rng, [hood], { count: 4, len: [3, 8], kind: 'dirt' });
  return { model: b.model(), meta: { size: b.sizeM(), mount: 'wall', kind: 'dryerVent', previewY: 0.9 } };
}

/** Louvered rectangular wall vent. opts: w, h (m), material 'alu'|'rusty'|'painted'. Origin: wall surface, bottom centre. */
export function wallVent(rng, opts = {}) {
  const vs = VS_FINE;
  const W = Math.round((opts.w ?? rng.pick([0.3, 0.4, 0.6])) / vs), H = Math.round((opts.h ?? rng.pick([0.2, 0.3, 0.4])) / vs);
  const b = new VB(W + 2, H + 2, 5, vs, 'wall');
  const P = b.P;
  const kind = opts.material ?? rng.pick(['alu', 'rusty', 'painted']);
  const m = kind === 'alu' ? mat.galv(P, 'vent', [168, 170, 168]) : kind === 'rusty' ? mat.rust(P, 'vent', [92, 52, 32]) : mat.paint(P, 'vent', rgbJitter(rng, [120, 110, 96], 0.06), { cls: MCLS.GENERIC });
  const dark = mat.generic(P, 'dark', [22, 22, 22]);
  b.box(0, 0, 0, W + 2, H + 2, 2, m);
  b.box(2, 2, 1, W, H, 2, dark);
  for (let y = 2; y < H; y += 2) {
    b.box(2, y, 2, W, y + 1, 3, m);
    b.box(2, y + 1, 1, W, y + 2, 2, m);
  }
  if (kind !== 'rusty') rust(b, [m], { amount: 0.4, seed: rng.int(1, 1e5), bottom: 1, edges: true });
  streaks(b, rng, [m], { count: 3, len: [3, 9], kind: 'rust' });
  return { model: b.model(), meta: { size: b.sizeM(), mount: 'wall', kind: 'wallVent', previewY: 1.6 } };
}

/**
 * Ground AC condenser on a concrete pad: coil sides with fins, top fan grille, fan blades
 * (part 'spin-y'), service panel, refrigerant lines running back to the wall (-Z).
 * Origin: footprint centre at ground; the line set ends at z = -(depth/2 + opts.wallGap).
 */
export function hvacCondenser(rng, opts = {}) {
  const vs = VS_FINE;
  const S = Math.round(rng.range(0.66, 0.8) / vs), H = Math.round(rng.range(0.66, 0.86) / vs);
  const gap = Math.round((opts.wallGap ?? 0.25) / vs);
  const b = new VB(S + 12, H + 8, S + 12 + gap, vs, 'corner');
  const P = b.P;
  const casing = mat.paint(P, 'casing', rgbJitter(rng, rng.pick([[150, 150, 146], [120, 118, 110], [176, 172, 160]]), 0.04), { cls: MCLS.GENERIC, rough: 0.5, metal: 0.4 });
  const fin = mat.galv(P, 'fin', [112, 114, 112], { cls: MCLS.WIRE });
  const dark = mat.generic(P, 'dark', [28, 28, 28]);
  const pad = mat.concrete(P, 'pad', [132, 130, 124]);
  const copper = mat.generic(P, 'copper', [150, 92, 52], { metal: 0.8, rough: 0.4 });
  const foam = mat.rubber(P, 'foam', [30, 30, 30]);
  const x0 = 6, z0 = 6 + gap, y0 = 4;
  b.box(x0 - 5, 0, z0 - 5, x0 + S + 5, y0, z0 + S + 5, pad);
  // corner posts + top + base
  b.box(x0, y0, z0, x0 + S, y0 + 3, z0 + S, casing);
  b.box(x0, y0 + H - 3, z0, x0 + S, y0 + H, z0 + S, casing);
  for (const [cx, cz] of [[x0, z0], [x0 + S - 3, z0], [x0, z0 + S - 3], [x0 + S - 3, z0 + S - 3]]) b.box(cx, y0, cz, cx + 3, y0 + H, cz + 3, casing);
  // coil faces: slightly recessed panels with fine vertical fin stripes (colour only - cheap)
  b.box(x0 + 1, y0 + 3, z0 + 1, x0 + S - 1, y0 + H - 3, z0 + S - 1, dark);
  for (let i = x0 + 3; i < x0 + S - 3; i++) {
    const m = i % 2 ? fin : dark;
    b.box(i, y0 + 3, z0 + 1, i + 1, y0 + H - 3, z0 + 2, m);
    b.box(i, y0 + 3, z0 + S - 2, i + 1, y0 + H - 3, z0 + S - 1, m);
  }
  for (let i = z0 + 3; i < z0 + S - 3; i++) {
    const m = i % 2 ? fin : dark;
    b.box(x0 + 1, y0 + 3, i, x0 + 2, y0 + H - 3, i + 1, m);
    b.box(x0 + S - 2, y0 + 3, i, x0 + S - 1, y0 + H - 3, i + 1, m);
  }

  // service panel with valves on one corner (facing -z, toward the wall)
  b.box(x0 + S - 14, y0 + 6, z0 - 1, x0 + S - 3, y0 + H - 6, z0, casing);
  // top fan opening + guard rings
  const cx = x0 + S / 2, cz = z0 + S / 2, R = S * 0.4;
  lathe(b, cx, cz, y0 + H - 3, y0 + H, () => [R, -1], dark);
  lathe(b, cx, cz, y0 + H, y0 + H + 1, () => [R + 1, R - 0.6], casing);
  for (const r of [R * 0.33, R * 0.66]) for (let a = 0; a < TAU; a += 0.04) b.set(Math.round(cx + Math.cos(a) * r), y0 + H, Math.round(cz + Math.sin(a) * r), fin);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    b.g.line(cx, y0 + H + 0.5, cz, cx + Math.cos(a) * R, y0 + H + 0.5, cz + Math.sin(a) * R, 0.5, fin);
  }
  // refrigerant line set to the wall
  const ly = y0 + 10;
  b.g.line(x0 + S - 10, ly, z0, x0 + S - 10, ly, 0, 1.6, foam);
  b.g.line(x0 + S - 6, ly - 3, z0, x0 + S - 6, ly - 3, 0, 0.9, copper);
  const parts = [];
  const fb = new VB(Math.ceil(R * 2 + 2), 3, Math.ceil(R * 2 + 2), vs, 'center');
  const fm = mat.galv(fb.P, 'blade', [70, 72, 70]);
  const fc = (R * 2 + 2) / 2;
  fb.fill(0, 0, 0, fb.nx, 3, fb.nz, (px, py, pz) => {
    const dx = px - fc, dz = pz - fc;
    const r = Math.hypot(dx, dz);
    if (r < 2) return fm;
    if (r > R - 1) return undefined;
    for (let k = 0; k < 3; k++) {
      let da = Math.atan2(dz, dx) - (k / 3) * TAU;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < 0.45 && Math.abs(py - 1.5 - da * 2) < 1) return fm;
    }
    return undefined;
  });
  parts.push({ name: 'fan', model: fb.model(), position: [0, 0, 0], rotation: [0, rng.range(0, TAU), 0], animate: 'spin-y' });
  rust(b, [casing], { amount: 0.35, seed: rng.int(1, 1e5), bottom: 3, y0, edges: false });
  streaks(b, rng, [casing], { count: 4, len: [4, 14], kind: 'rust', t: 0.35 });
  grime(b, [casing, pad], { h: y0 + 8, amount: 0.5, seed: 5 });
  b.setMount([-(x0 + S / 2) * vs, 0, -(z0 + S / 2) * vs]);
  parts[0].position = [0, (y0 + H - 5) * vs, 0];
  return { model: b.model(), parts, meta: { size: [S * vs, (H + y0) * vs, S * vs], footprint: [(S + 10) * vs, (S + 10) * vs], mount: 'floor', kind: 'hvacCondenser', anchors: { lineSet: [b.mx(x0 + S - 8), ly * vs, b.mz(0)] } } };
}

// ───────────────────────────── signs ─────────────────────────────

const SIGNS = {
  noParking: { w: 0.3, h: 0.45, bg: [222, 220, 210], fg: [170, 34, 30], lines: (t) => [
    { text: 'NO', size: 0.2, y: 0.83 }, { text: 'PARKING', size: 0.15, y: 0.66 }, { text: t || 'ANY TIME', size: 0.09, y: 0.5 }, { text: 'TOW ZONE', size: 0.1, y: 0.2, inv: true }] },
  privateProperty: { w: 0.45, h: 0.3, bg: [222, 220, 210], fg: [30, 30, 32], lines: (t) => [
    { text: 'PRIVATE', size: 0.24, y: 0.76 }, { text: 'PROPERTY', size: 0.2, y: 0.5 }, { text: t || 'NO TRESPASSING', size: 0.14, y: 0.2, red: true }] },
  fireExit: { w: 0.4, h: 0.25, bg: [176, 34, 30], fg: [230, 228, 220], lines: (t) => [
    { text: 'FIRE EXIT', size: 0.34, y: 0.66 }, { text: t || 'DO NOT BLOCK', size: 0.2, y: 0.26 }] },
  address: { w: 0.36, h: 0.14, bg: [30, 50, 100], fg: [226, 226, 220], lines: (t) => [{ text: t || '2216 REAR', size: 0.66, y: 0.5 }] },
};

/**
 * Weathered metal sign plate with legible text (canvas 2D -> extra-fine voxels).
 * opts: kind 'noParking'|'privateProperty'|'fireExit'|'address', text (replaces the secondary
 * line / address), mount 'wall'|'pole' (pole: band clamps behind). Origin: wall surface, bottom centre.
 */
export function sign(rng, opts = {}) {
  const vs = VS_XFINE;
  const kind = opts.kind ?? rng.pick(Object.keys(SIGNS));
  const S = SIGNS[kind] ?? SIGNS.noParking;
  const W = Math.round(S.w / vs), H = Math.round(S.h / vs);
  const b = new VB(W + 4, H + 4, 6, vs, 'corner');
  b.setMount([-((W + 4) * vs) / 2, -2 * vs, 0]);
  const P = b.P;
  const fade = rng.range(0.05, 0.3);
  const bg = mat.paint(P, 'bg', rgbMix(S.bg, [190, 188, 180], fade), { cls: MCLS.GENERIC, rough: 0.45, metal: 0.3, vari: 0.04 });
  const fg = mat.paint(P, 'fg', rgbMix(S.fg, S.bg, fade * 0.8), { cls: MCLS.GENERIC, rough: 0.45, metal: 0.3, vari: 0.04 });
  const red = mat.paint(P, 'red', rgbMix([170, 34, 30], S.bg, fade), { cls: MCLS.GENERIC, rough: 0.45, metal: 0.3, vari: 0.04 });
  const back = mat.galv(P, 'back', [150, 152, 150]);
  const bolt = mat.steel(P, 'bolt', [80, 78, 74]);
  const lines = S.lines(opts.text);
  const mask = textMask(W, H, lines.map((l) => ({ ...l })), { ss: 4, font: 'Arial Black, Arial, Helvetica, sans-serif', weight: '900' });
  // inverted band (white text on red) for lines flagged inv
  const inv = lines.find((l) => l.inv);
  const redLine = lines.find((l) => l.red);
  const z = 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ink = mask[x + y * W] > 0.42;
      const yy = (y + 0.5) / H;
      let m = ink ? fg : bg;
      if (inv && Math.abs(yy - inv.y) < inv.size * 0.75) m = ink ? bg : fg;
      if (redLine && Math.abs(yy - redLine.y) < redLine.size * 0.6 && ink) m = red;
      // rounded corners + border line
      const ex = Math.min(x, W - 1 - x), ey = Math.min(y, H - 1 - y);
      if (ex + ey < 2) continue;
      if ((ex === 1 || ey === 1) && kind !== 'address') m = fg;
      b.set(x + 2, y + 2, z, m);
      b.set(x + 2, y + 2, z - 1, back);
    }
  // bent corner: one corner peeled outward
  if (rng.chance(0.6)) {
    const cxn = rng.chance(0.5) ? 2 : W + 1, cyn = rng.chance(0.5) ? 2 : H + 1;
    const r = rng.range(5, 10);
    const set = [];
    b.g.forEach((v, x, y, zz) => {
      if (!v) return;
      const d = Math.hypot(x - cxn, y - cyn);
      if (d < r) set.push([x, y, zz, v, Math.round((1 - d / r) * 2.5)]);
    });
    for (const [x, y, zz] of set) b.set(x, y, zz, 0);
    for (const [x, y, zz, v, k] of set) b.set(x, y, Math.min(5, zz + k), v);
  }
  // bolts / band clamps
  const mountKind = opts.mount ?? 'wall';
  for (const [bx, by] of kind === 'address' ? [[4, (H + 4) / 2], [W - 1, (H + 4) / 2]] : [[(W + 4) / 2, H - 1], [(W + 4) / 2, 5]]) {
    b.box(Math.round(bx) - 1, Math.round(by) - 1, z + 1, Math.round(bx) + 1, Math.round(by) + 1, z + 2, bolt);
  }
  if (mountKind === 'pole') for (const by of [6, H - 2]) b.box(0, by, 0, W + 4, by + 2, 1, back);
  // weathering: rust around bolts and edges, dirt film, stickers
  streaks(b, rng, [bg, fg], { count: rng.int(2, 5), len: [3, 14], kind: 'rust', t: 0.35, yMin: 2 });
  recolor(b, [bg], (v, x, y, zz, n) => (n > 0.66 ? V.dirt(P, bg, 0.82) : undefined), { freq: 0.07, seed: rng.int(1, 1e5) });
  if (rng.chance(0.5)) {
    const st = mat.plastic(P, 'sticker', rgbJitter(rng, rng.pick([[220, 220, 220], [40, 40, 40], [200, 60, 60], [60, 130, 200]]), 0.05));
    const sx = rng.int(4, W - 8), sy = rng.int(4, H - 8);
    b.box(sx, sy, z, sx + rng.int(3, 6), sy + rng.int(2, 4), z + 1, st);
  }
  return { model: b.model(), meta: { size: [W * vs, H * vs, 4 * vs], mount: 'wall', kind: 'sign', signKind: kind, previewY: 1.6 } };
}
