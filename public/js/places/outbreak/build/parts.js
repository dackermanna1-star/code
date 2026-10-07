// The pieces buildings are made of: walls with window and door holes in
// them, windows (frames, glass, sills, shutters, boards), doorways (frames and
// door leaves), floors with holes for the stairs, flights of stairs, and
// roofs (gabled, hipped, flat with a parapet, lean-to). Plus `plan`, which
// cuts a floor into rooms and decides which ones get doorways between them.
//
// Building frame: x across the front, z front-to-back (the front, facing the
// street, is +z), y up from the ground the building stands on.
import { mat } from './kit.js';

export const STOREY = 10;

// shared surfaces
export const S = {
  frame: mat('woodFine', 0xf4f0e8, { p: 4 }),
  frameDark: mat('woodFine', 0x6a5848),
  sill: mat('concrete', 0xd8d4cc),
  plinth: mat('concrete', 0x9a948a),
  stoneBase: mat('stone', 0xb0aaa0),
  board: mat('planks', 0xc8b8a0),
  shutter: mat('woodPaint', 0x9ab0a0),
  curtain: mat('fabric', 0xb07060, { p: 5 }),
  glass: mat('concrete', 0x7a8a92, { r: 20 }),
  ceiling: mat('plaster', 0xeeeae2),
  step: mat('concrete', 0xb8b4ac),
  rail: mat('metal', 0x4a4a48, { p: 4 }),
  fascia: mat('woodFine', 0x5a4636),
  gutter: mat('metal', 0x8a8a86, { p: 4 }),
};

/** Interior wall finishes, picked per room. */
export const WALLS = [
  mat('plaster', 0xe8e0cc), mat('plaster', 0xd8e0d0), mat('plaster', 0xe0d4c0),
  mat('wallpaper', 0xd8c8a8, { p: 1 }), mat('wallpaper', 0xc8d0c0, { p: 2 }), mat('wallpaper', 0xe0c8b8, { p: 1 }),
  mat('plasterOld', 0xd0c8b8), mat('wallpaper', 0xb8c4cc, { p: 2 }), mat('plaster', 0xc8d4dc),
];
export const FLOORS = [mat('woodFloor', 0xffffff), mat('woodFloor', 0xd8c8b0), mat('linoleum', 0xffffff), mat('linoleum', 0xc8d8c8), mat('tiles', 0xffffff)];

// --- walls --------------------------------------------------------------------------------------------------------------
/**
 * A straight wall with holes in it.
 * axis 'x': runs along x from a0 to a1 at z = c; axis 'z': along z from a0 to a1 at x = c.
 * y0..y1: bottom and top; t: thickness. out: which side is outside (+1: +z / +x side, -1, or 0 for an inside wall).
 * holes: [{ a (centre along the wall), w, y (bottom), h }].
 * mo / mi: the outside and inside surfaces (inside walls use mi on both sides, or mo on the +side).
 */
export function wall(K, axis, a0, a1, c, y0, y1, t, mo, mi, holes = [], o = {}) {
  const out = o.out ?? 1;
  const hs = holes.filter((h) => h.a + h.w / 2 > a0 && h.a - h.w / 2 < a1);
  const big = axis === 'x' ? ['pz', 'nz'] : ['px', 'nx'];
  const posF = out >= 0 ? big[0] : big[1], negF = out >= 0 ? big[1] : big[0];
  const inside = out === 0 || o.inner;
  const aoIn = o.aoIn ?? 0.56, aoOut = inside ? aoIn : (o.aoOut ?? 1), aoRev = inside ? aoIn : 0.8;
  const aoF = { px: aoRev, nx: aoRev, pz: aoRev, nz: aoRev, py: aoRev, ny: aoRev };
  aoF[posF] = aoOut; aoF[negF] = aoIn;
  const topSkip = o.top ? '' : 'py';
  const piece = (b0, b1, yy0, yy1, skip, inner) => {
    if (b1 - b0 < 0.02 || yy1 - yy0 < 0.02) return;
    const faces = { [posF]: mo, [negF]: inner, side: inside ? inner : mo, top: o.topMat || (inside ? inner : mo), bottom: inside ? inner : mo };
    const ac = (b0 + b1) / 2, ha = (b1 - b0) / 2, yc = (yy0 + yy1) / 2, hy = (yy1 - yy0) / 2;
    const oo = { aoF, skip, foot: yy0 <= y0 + 0.01, col: o.col, mat: o.phys };
    if (axis === 'x') K.box(ac, yc, c, ha, hy, t / 2, faces, oo);
    else K.box(c, yc, ac, t / 2, hy, ha, faces, oo);
  };
  // cut the wall at the edges of the holes (and anywhere asked: where the rooms behind it change)
  const cl = (v) => Math.max(a0, Math.min(a1, v));
  const pts = [a0, a1];
  for (const h of hs) pts.push(cl(h.a - h.w / 2), cl(h.a + h.w / 2));
  for (const q of o.cuts || []) if (q > a0 + 0.05 && q < a1 - 0.05) pts.push(q);
  pts.sort((p, q) => p - q);
  for (let i = 0; i < pts.length - 1; i++) {
    const b0 = pts[i], b1 = pts[i + 1];
    if (b1 - b0 < 0.02) continue;
    const mid = (b0 + b1) / 2;
    const inner = typeof mi === 'function' ? mi(mid) : mi;
    const h = hs.find((q) => mid > q.a - q.w / 2 && mid < q.a + q.w / 2);
    if (!h) { piece(b0, b1, y0, y1, 'ny ' + topSkip, inner); continue; }
    if (h.y > y0 + 0.02) piece(b0, b1, y0, h.y, 'ny', inner); // below the hole (its top is the sill)
    if (h.y + h.h < y1 - 0.02) piece(b0, b1, h.y + h.h, y1, topSkip, inner); // above it (its underside shows)
  }
}

/**
 * The four outside walls of a box-shaped storey: x0..x1, z0..z1 are the outer faces.
 * holes: { pz: [...], nz: [...], px: [...], nx: [...] } along each wall (a measured along x for pz/nz, along z for px/nx).
 * mi: a surface, or fn(side) -> surface, for the inside.
 */
export function outerWalls(K, x0, z0, x1, z1, y0, y1, t, mo, mi, holes = {}, o = {}) {
  const inner = (side) => (typeof mi === 'function' ? mi(side) : mi);
  wall(K, 'x', x0, x1, z1 - t / 2, y0, y1, t, mo, inner('pz'), holes.pz || [], { ...o, out: 1 });
  wall(K, 'x', x0, x1, z0 + t / 2, y0, y1, t, mo, inner('nz'), holes.nz || [], { ...o, out: -1 });
  wall(K, 'z', z0 + t, z1 - t, x1 - t / 2, y0, y1, t, mo, inner('px'), holes.px || [], { ...o, out: 1 });
  wall(K, 'z', z0 + t, z1 - t, x0 + t / 2, y0, y1, t, mo, inner('nx'), holes.nx || [], { ...o, out: -1 });
}

/** Evenly spaced holes along a wall from a0 to a1: count n (or as many as fit at `every`). */
export function spaced(a0, a1, w, h, y, every = 9, o = {}) {
  const L = a1 - a0, n = o.n ?? Math.max(0, Math.floor((L - 2) / every));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + L * (i + 0.5) / n;
    if (o.avoid && o.avoid.some((q) => Math.abs(q - a) < (o.gap ?? w + 1.5))) continue;
    out.push({ a, w, h, y, kind: o.kind || 'window' });
  }
  return out;
}

// --- windows and doors --------------------------------------------------------------------------------------------------
/**
 * Fill a hole in a wall with a window. axis/c/t/out as the wall; h: the hole { a, w, y, h }.
 * style: { frame, glass (0..1 chance of glass), board (chance boarded), shutters, curtains, sill }
 */
export function windowIn(K, axis, c, t, out, h, style = {}) { K.details(() => windowParts(K, axis, c, t, out, h, style)); }
function windowParts(K, axis, c, t, out, h, style) {
  const r = K.r;
  const fw = 0.28, fd = Math.min(0.5, t * 0.6);
  const fr = style.frame || S.frame;
  const sgn = out >= 0 ? 1 : -1;
  const plane = c + sgn * (t / 2 - fd / 2 - 0.12); // frame plane, near the outside
  const B = (a, y, z, ha, hy, hz, m, o) => (axis === 'x' ? K.box(a, y, z, ha, hy, hz, m, o) : K.box(z, y, a, hz, hy, ha, m, o));
  const y0 = h.y, y1 = h.y + h.h, a0 = h.a - h.w / 2, a1 = h.a + h.w / 2;
  const noCol = { col: false, ao: 0.85 };
  // the frame
  const sideSkip = { ...noCol, skip: 'ny py' + (axis === 'x' ? '' : '') };
  B(a0 + fw / 2, (y0 + y1) / 2, plane, fw / 2, h.h / 2, fd / 2, fr, sideSkip);
  B(a1 - fw / 2, (y0 + y1) / 2, plane, fw / 2, h.h / 2, fd / 2, fr, sideSkip);
  const railSkip = { ...noCol, skip: axis === 'x' ? 'px nx' : 'pz nz' };
  B(h.a, y0 + fw / 2, plane, h.w / 2 - fw, fw / 2, fd / 2, fr, railSkip);
  B(h.a, y1 - fw / 2, plane, h.w / 2 - fw, fw / 2, fd / 2, fr, railSkip);
  if (h.w > 3.2 && !style.single) B(h.a, (y0 + y1) / 2, plane, fw / 2.5, h.h / 2 - fw, fd / 2.4, fr, noCol); // the middle bar
  if (h.h > 3.5 && style.transom !== false) B(h.a, y1 - h.h * 0.28, plane, h.w / 2 - fw, fw / 3, fd / 2.4, fr, noCol);
  // the glass (or not: broken, or boarded up)
  const boarded = r() < (style.board ?? 0.08);
  const glass = !boarded && r() < (style.glass ?? 0.8);
  if (glass) B(h.a, (y0 + y1) / 2, plane, h.w / 2 - fw, h.h / 2 - fw, 0.04, S.glass, { glass: true, ao: 1 });
  else K.solid(axis === 'x' ? h.a : plane, (y0 + y1) / 2, axis === 'x' ? plane : h.a, axis === 'x' ? h.w / 2 : 0.2, h.h / 2, axis === 'x' ? 0.2 : h.w / 2, 'glass', { extra: { glass: true, broken: true } });
  // the sill outside
  if (style.sill !== false && y0 > 0.5) B(h.a, y0 - 0.15, c + sgn * (t / 2 + 0.2), h.w / 2 + 0.35, 0.15, 0.4, style.sillMat || S.sill, { col: false });
  if (boarded) {
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const yy = y0 + h.h * (i + 0.5) / n + (r() - 0.5) * 0.5;
      K.push(axis === 'x' ? h.a : c + sgn * (t / 2 + 0.12), yy, axis === 'x' ? c + sgn * (t / 2 + 0.12) : h.a, (axis === 'x' ? 0 : Math.PI / 2));
      K.box(0, 0, 0, h.w / 2 + 0.4, 0.38, 0.08, S.board, { col: false, yaw: (r() - 0.5) * 0.25 });
      K.pop();
    }
  }
  if (style.shutters && r() < 0.8) {
    const sh = style.shutterMat || S.shutter;
    for (const s of [-1, 1]) {
      const ang = r() < 0.75 ? 0 : 0.6;
      K.push(axis === 'x' ? h.a + s * (h.w / 2 + h.w / 4 + 0.1) : c + sgn * (t / 2 + 0.1), (y0 + y1) / 2, axis === 'x' ? c + sgn * (t / 2 + 0.1) : h.a + s * (h.w / 2 + h.w / 4 + 0.1), axis === 'x' ? 0 : Math.PI / 2);
      K.box(0, 0, 0, h.w / 4, h.h / 2, 0.08, sh, { col: false, yaw: ang * s * sgn });
      K.pop();
    }
  }
  if (style.curtains && r() < 0.55) {
    const cm = style.curtainMat || S.curtain;
    const inner = c - sgn * (t / 2 + 0.15);
    for (const s of [-1, 1]) B(h.a + s * (h.w / 2 - 0.25), (y0 + y1) / 2 + 0.3, inner, 0.45, h.h / 2 + 0.6, 0.08, cm, { col: false, ao: 0.5 });
  }
}

/**
 * A doorway in a wall: frame trim on both sides, and a door leaf (kind) unless kind is null.
 * Returns the door record (or null).
 */
export function doorIn(K, axis, c, t, h, kind = 'wood', o = {}) {
  const fr = o.frame || S.frameDark;
  const B = (a, y, z, ha, hy, hz, m, oo) => (axis === 'x' ? K.box(a, y, z, ha, hy, hz, m, oo) : K.box(z, y, a, hz, hy, ha, m, oo));
  const a0 = h.a - h.w / 2, a1 = h.a + h.w / 2, y0 = h.y, y1 = h.y + h.h;
  const tw = 0.32, ao = o.ao ?? 0.7;
  for (const s of [-1, 1]) {
    // the casing on both faces of the wall
    const z = c + s * (t / 2 + 0.06);
    B(a0 - tw / 2 + 0.1, (y0 + y1) / 2 + tw / 2, z, tw / 2, h.h / 2 + tw / 2, 0.08, fr, { col: false, ao });
    B(a1 + tw / 2 - 0.1, (y0 + y1) / 2 + tw / 2, z, tw / 2, h.h / 2 + tw / 2, 0.08, fr, { col: false, ao });
    B(h.a, y1 + tw / 2, z, h.w / 2 + tw - 0.1, tw / 2, 0.08, fr, { col: false, ao });
  }
  // the threshold
  if (y0 > 0.05) B(h.a, y0 - 0.05, c, h.w / 2, 0.08, t / 2 + 0.1, S.step, { col: false });
  if (!kind) return null;
  // the leaf: hung in the middle of the wall
  if (axis === 'x') return K.door(h.a, y0, c, h.w, h.h, kind, o);
  return K.door(c, y0, h.a, h.w, h.h, kind, { ...o, yaw: Math.PI / 2 });
}

// --- floors and stairs ----------------------------------------------------------------------------------------------------
/**
 * A floor slab x0..x1, z0..z1 with its top at y, thickness th, with holes cut in it ([{x0, z0, x1, z1}]).
 * top / bottom: the floor finish and the ceiling below.
 */
export function slab(K, x0, z0, x1, z1, y, th, top, bottom, holes = [], o = {}) {
  const xs = new Set([x0, x1]), zs = new Set([z0, z1]);
  for (const h of holes) { if (h.x0 > x0 && h.x0 < x1) xs.add(h.x0); if (h.x1 > x0 && h.x1 < x1) xs.add(h.x1); if (h.z0 > z0 && h.z0 < z1) zs.add(h.z0); if (h.z1 > z0 && h.z1 < z1) zs.add(h.z1); }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
  const inHole = (cx, cz) => holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1);
  const faces = { top, bottom: bottom || top, side: bottom || top };
  const ao = o.ao ?? K.ao;
  for (let j = 0; j < Z.length - 1; j++) {
    // merge runs of cells along x
    let run = null;
    const flush = () => { if (run) { K.span(X[run[0]], y - th, Z[j], X[run[1] + 1], y, Z[j + 1], faces, { aoF: { py: ao, ny: o.aoBelow ?? ao, px: ao, nx: ao, pz: ao, nz: ao }, col: o.col, skip: o.skip }); run = null; } };
    for (let i = 0; i < X.length - 1; i++) {
      if (inHole((X[i] + X[i + 1]) / 2, (Z[j] + Z[j + 1]) / 2)) { flush(); continue; }
      if (run) run[1] = i; else run = [i, i];
    }
    flush();
  }
}

/**
 * A straight flight of stairs: starting at local (x, z), climbing towards `dir` ('px' | 'nx' | 'pz' | 'nz'),
 * width w, from y0 up by rise over run. Each step is a solid block. Returns the top landing point.
 */
export function stairs(K, x, z, dir, w, y0, rise, run, m, o = {}) {
  const n = Math.max(2, Math.round(rise / 0.83)), sh = rise / n, sd = run / n;
  const dx = dir === 'px' ? 1 : dir === 'nx' ? -1 : 0, dz = dir === 'pz' ? 1 : dir === 'nz' ? -1 : 0;
  const side = m.side ? m : { top: m, side: o.side || m };
  for (let i = 0; i < n; i++) {
    const top = y0 + sh * (i + 1);
    const cx = x + dx * sd * (i + 0.5), cz = z + dz * sd * (i + 0.5);
    const hx = dx ? sd / 2 : w / 2, hz = dz ? sd / 2 : w / 2;
    // only the bit of each block that shows: a riser and tread (the block under goes down to the step below)
    const bot = i === 0 ? y0 : y0 + sh * (i - 0.5);
    K.box(cx, (top + bot) / 2, cz, hx, (top - bot) / 2, hz, side, { skip: 'ny', ao: o.ao ?? K.ao, mat: o.phys });
  }
  return { x: x + dx * run, y: y0 + rise, z: z + dz * run };
}

/** A railing: posts and a top rail from (x0, z0) to (x1, z1) at floor y. */
export function railing(K, x0, z0, x1, z1, y, h = 3.2, m = S.rail, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / (o.every ?? 4)));
  const yaw = Math.atan2(-(z1 - z0), x1 - x0);
  K.push((x0 + x1) / 2, y, (z0 + z1) / 2, yaw);
  K.box(0, h - 0.12, 0, L / 2 + 0.1, 0.12, 0.12, m, { col: false });
  if (o.mid !== false) K.box(0, h * 0.5, 0, L / 2, 0.07, 0.07, m, { col: false });
  for (let i = 0; i <= n; i++) K.box(-L / 2 + L * i / n, h / 2, 0, 0.1, h / 2, 0.1, m, { col: false });
  if (o.col !== false) K.solid(0, h / 2, 0, L / 2, h / 2, 0.25, 'metal');
  K.pop();
}

// --- roofs ----------------------------------------------------------------------------------------------------------------
/**
 * A gabled roof over x0..x1, z0..z1 (the outer wall faces), eaves at y, ridge `rise` higher, along `axis` ('x' or 'z').
 * mr: roof covering; mg: the gable-end wall (outside); over: overhang.
 */
export function gableRoof(K, x0, z0, x1, z1, y, rise, mr, mg, o = {}) {
  const over = o.over ?? 1.4, axis = o.axis ?? (x1 - x0 >= z1 - z0 ? 'x' : 'z');
  const under = o.under || S.fascia;
  const th = 0.45;
  if (axis === 'x') {
    const zc = (z0 + z1) / 2, half = (z1 - z0) / 2, k = rise / half;
    const ye = y - over * k;
    const X0 = x0 - over, X1 = x1 + over, Z0 = z0 - over, Z1 = z1 + over;
    // the two slopes (and their undersides)
    K.quad([X0, ye, Z1], [X1, ye, Z1], [X1, y + rise, zc], [X0, y + rise, zc], mr, { back: under, backAo: 0.55 });
    K.quad([X1, ye, Z0], [X0, ye, Z0], [X0, y + rise, zc], [X1, y + rise, zc], mr, { back: under, backAo: 0.55 });
    // ridge cap and fascia boards
    K.box((X0 + X1) / 2, y + rise + 0.12, zc, (X1 - X0) / 2, 0.22, 0.45, o.ridge || mr, { col: false });
    K.box((X0 + X1) / 2, ye - 0.25, Z1, (X1 - X0) / 2, 0.35, 0.12, under, { col: false });
    K.box((X0 + X1) / 2, ye - 0.25, Z0, (X1 - X0) / 2, 0.35, 0.12, under, { col: false });
    // the gable ends: triangles of wall, and barge boards along their slopes
    for (const [x, s, X] of [[x0, -1, X0], [x1, 1, X1]]) {
      const a = [x, y, s > 0 ? z1 : z0], b = [x, y, s > 0 ? z0 : z1], c = [x, y + rise, zc];
      K.tri(a, b, c, mg, { back: o.attic || S.fascia, backAo: 0.3 });
      for (const zz of [Z0, Z1]) {
        const e = [X, ye, zz], tp = [X, y + rise, zc];
        K.quad([e[0], e[1] - 0.6, e[2]], [tp[0], tp[1] - 0.6, tp[2]], [tp[0], tp[1] + 0.05, tp[2]], [e[0], e[1] + 0.05, e[2]], under, { both: true, back: under, ao: 0.9 });
      }
    }
    // the attic, for bullets: a few boxes stepping up under the slopes
    if (o.col !== false) for (let i = 0; i < 3; i++) {
      const f = (i + 0.5) / 3, hz = half * (1 - f * 0.85);
      K.solid((x0 + x1) / 2, y + rise * (i / 3) + rise / 6, zc, (x1 - x0) / 2, rise / 6, hz, o.phys || mr.phys, { noStand: true });
    }
  } else {
    // the same turned a quarter: ridge along z
    K.push((x0 + x1) / 2, 0, (z0 + z1) / 2, Math.PI / 2);
    const hw = (x1 - x0) / 2, hd = (z1 - z0) / 2;
    gableRoof(K, -hd, -hw, hd, hw, y, rise, mr, mg, { ...o, axis: 'x' });
    K.pop();
  }
}

/** A hipped roof: four slopes up to a short ridge. */
export function hipRoof(K, x0, z0, x1, z1, y, rise, mr, o = {}) {
  const over = o.over ?? 1.4, under = o.under || S.fascia;
  const X0 = x0 - over, X1 = x1 + over, Z0 = z0 - over, Z1 = z1 + over;
  const w = X1 - X0, d = Z1 - Z0;
  const along = w >= d; // ridge along x if wider
  const k = rise / ((along ? d : w) / 2);
  const ye = y - over * k;
  const top = y + rise;
  const inset = (along ? d : w) / 2;
  const xc = (X0 + X1) / 2, zc = (Z0 + Z1) / 2;
  let r0, r1; // ridge ends
  if (along) { r0 = [X0 + inset, top, zc]; r1 = [X1 - inset, top, zc]; if (r0[0] > r1[0]) { r0[0] = r1[0] = xc; } }
  else { r0 = [xc, top, Z0 + inset]; r1 = [xc, top, Z1 - inset]; if (r0[2] > r1[2]) { r0[2] = r1[2] = zc; } }
  const A = [X0, ye, Z1], B = [X1, ye, Z1], C = [X1, ye, Z0], D = [X0, ye, Z0];
  const opts = { back: under, backAo: 0.55 };
  if (along) {
    K.quad(A, B, r1, r0, mr, opts); // front
    K.quad(C, D, r0, r1, mr, opts); // back
    K.tri(B, C, r1, mr, { back: under }); // right end
    K.tri(D, A, r0, mr, { back: under }); // left end
  } else {
    K.quad(B, C, r0, r1, mr, opts);
    K.quad(D, A, r1, r0, mr, opts);
    K.tri(A, B, r1, mr, { back: under });
    K.tri(C, D, r0, mr, { back: under });
  }
  K.box(xc, ye - 0.25, Z1, w / 2, 0.35, 0.12, under, { col: false });
  K.box(xc, ye - 0.25, Z0, w / 2, 0.35, 0.12, under, { col: false });
  K.box(X1, ye - 0.25, zc, 0.12, 0.35, d / 2, under, { col: false });
  K.box(X0, ye - 0.25, zc, 0.12, 0.35, d / 2, under, { col: false });
  if (o.col !== false) for (let i = 0; i < 3; i++) {
    const f = (i + 0.5) / 3;
    K.solid((x0 + x1) / 2, y + rise * (i / 3) + rise / 6, (z0 + z1) / 2, (x1 - x0) / 2 * (1 - f * 0.8), rise / 6, (z1 - z0) / 2 * (1 - f * 0.8), mr.phys, { noStand: true });
  }
}

/** A flat roof: a slab and a low wall round the edge. Returns the roof's top height. */
export function flatRoof(K, x0, z0, x1, z1, y, mr, o = {}) {
  const th = o.th ?? 0.8, ph = o.parapet ?? 1.6, pt = 0.6, pm = o.parapetMat || o.wall;
  slab(K, x0, z0, x1, z1, y + th, th, mr, o.ceiling || S.ceiling, o.holes || [], { aoBelow: 0.56, ao: 1 });
  if (ph > 0 && pm) {
    const cap = o.cap || S.sill;
    const yy = y + th;
    K.span(x0, yy, z1 - pt, x1, yy + ph, z1, pm, { skip: 'ny' });
    K.span(x0, yy, z0, x1, yy + ph, z0 + pt, pm, { skip: 'ny' });
    K.span(x1 - pt, yy, z0 + pt, x1, yy + ph, z1 - pt, pm, { skip: 'ny' });
    K.span(x0, yy, z0 + pt, x0 + pt, yy + ph, z1 - pt, pm, { skip: 'ny' });
    // the coping on top
    K.span(x0 - 0.1, yy + ph, z1 - pt - 0.1, x1 + 0.1, yy + ph + 0.2, z1 + 0.1, cap, { col: false, skip: 'ny' });
    K.span(x0 - 0.1, yy + ph, z0 - 0.1, x1 + 0.1, yy + ph + 0.2, z0 + pt + 0.1, cap, { col: false, skip: 'ny' });
    K.span(x1 - pt - 0.1, yy + ph, z0 + pt + 0.1, x1 + 0.1, yy + ph + 0.2, z1 - pt - 0.1, cap, { col: false, skip: 'ny' });
    K.span(x0 - 0.1, yy + ph, z0 + pt + 0.1, x0 + pt + 0.1, yy + ph + 0.2, z1 - pt - 0.1, cap, { col: false, skip: 'ny' });
  }
  return y + th;
}

/** A lean-to roof sloping down towards +z (turn the frame for other ways). */
export function shedRoof(K, x0, z0, x1, z1, yLow, yHigh, mr, o = {}) {
  const over = o.over ?? 1, under = o.under || S.fascia;
  const k = (yHigh - yLow) / (z1 - z0);
  K.quad([x0 - over, yLow - over * k, z1 + over], [x1 + over, yLow - over * k, z1 + over], [x1 + over, yHigh + over * k, z0 - over], [x0 - over, yHigh + over * k, z0 - over], mr, { back: under, backAo: 0.55 });
  if (o.sides && o.wall) {
    for (const [x, s] of [[x0, -1], [x1, 1]]) {
      if (s > 0) K.tri([x, yLow, z1], [x, yLow, z0], [x, yHigh, z0], o.wall, { back: S.fascia });
      else K.tri([x, yLow, z0], [x, yLow, z1], [x, yHigh, z0], o.wall, { back: S.fascia });
    }
  }
  if (o.col !== false) K.solid((x0 + x1) / 2, (yLow + yHigh) / 2, (z0 + z1) / 2, (x1 - x0) / 2, Math.max(0.3, (yHigh - yLow) / 2), (z1 - z0) / 2, mr.phys, { noStand: true });
}

// --- floor plans ------------------------------------------------------------------------------------------------------------
/**
 * Cut a rectangle into rooms. rect: { x0, z0, x1, z1 }. n: how many rooms (roughly).
 * Returns { rooms: [{x0, z0, x1, z1}], walls: [{axis, at, a0, a1, ra, rb, door}] } with
 * a doorway on enough of the walls that every room can be reached.
 */
export function plan(rect, n, r, o = {}) {
  const min = o.min ?? 9;
  // start from one room, or from rooms given (o.rooms; those with keep: true are never split)
  const rooms = o.rooms ? o.rooms.map((q) => ({ ...q })) : [{ ...rect }];
  for (let guard = 0; rooms.length < n && guard < 40; guard++) {
    // split the biggest room across its longer side
    rooms.sort((a, b) => (b.keep ? -1e9 : (b.x1 - b.x0) * (b.z1 - b.z0)) - (a.keep ? -1e9 : (a.x1 - a.x0) * (a.z1 - a.z0)));
    const R = rooms[0], w = R.x1 - R.x0, d = R.z1 - R.z0;
    if (R.keep) break;
    const alongX = w > d * (0.8 + r() * 0.4);
    const L = alongX ? w : d;
    if (L < min * 2) { if (rooms.length >= 2 && Math.max(w, d) < min * 2) break; else continue; }
    const t = 0.38 + r() * 0.24, cut = (alongX ? R.x0 : R.z0) + Math.max(min, Math.min(L - min, L * t));
    rooms.shift();
    if (alongX) rooms.push({ x0: R.x0, z0: R.z0, x1: cut, z1: R.z1 }, { x0: cut, z0: R.z0, x1: R.x1, z1: R.z1 });
    else rooms.push({ x0: R.x0, z0: R.z0, x1: R.x1, z1: cut }, { x0: R.x0, z0: cut, x1: R.x1, z1: R.z1 });
  }
  // keep a stable order: the kept rooms first, then front to back, left to right
  rooms.sort((a, b) => (b.keep ? 1 : 0) - (a.keep ? 1 : 0) || b.z1 - a.z1 || a.x0 - b.x0);
  rooms.forEach((q, i) => { q.id = i; });
  // the walls between neighbours
  const walls = [];
  const eps = 0.01;
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const A = rooms[i], B = rooms[j];
    if (Math.abs(A.x1 - B.x0) < eps || Math.abs(B.x1 - A.x0) < eps) {
      const at = Math.abs(A.x1 - B.x0) < eps ? A.x1 : A.x0;
      const a0 = Math.max(A.z0, B.z0), a1 = Math.min(A.z1, B.z1);
      if (a1 - a0 > 0.5) walls.push({ axis: 'z', at, a0, a1, ra: i, rb: j, door: null });
    } else if (Math.abs(A.z1 - B.z0) < eps || Math.abs(B.z1 - A.z0) < eps) {
      const at = Math.abs(A.z1 - B.z0) < eps ? A.z1 : A.z0;
      const a0 = Math.max(A.x0, B.x0), a1 = Math.min(A.x1, B.x1);
      if (a1 - a0 > 0.5) walls.push({ axis: 'x', at, a0, a1, ra: i, rb: j, door: null });
    }
  }
  // doorways: a spanning tree (every room reachable), plus the odd extra
  const dw = o.doorW ?? 4.2;
  const start = typeof o.start === 'function' ? rooms.findIndex(o.start) : (o.start ?? 0);
  const reach = new Set([Math.max(0, start)]);
  const fits = (wl) => wl.a1 - wl.a0 > dw + 1.4;
  const putDoor = (wl) => {
    const room = wl.a1 - wl.a0;
    const a = wl.a0 + 0.7 + dw / 2 + r() * Math.max(0, room - dw - 1.4);
    wl.door = { a, w: dw };
  };
  for (let guard = 0; reach.size < rooms.length && guard < 100; guard++) {
    const cand = walls.filter((wl) => !wl.door && fits(wl) && (reach.has(wl.ra) !== reach.has(wl.rb)));
    if (!cand.length) break;
    const wl = cand[Math.floor(r() * cand.length)];
    putDoor(wl); reach.add(wl.ra); reach.add(wl.rb);
  }
  for (const wl of walls) if (!wl.door && fits(wl) && r() < (o.extra ?? 0.15)) putDoor(wl);
  return { rooms, walls, start: Math.max(0, start) };
}

/** A corridor plan: a corridor along x through the middle (width cw), rooms either side every ~roomW. */
export function corridorPlan(rect, cw, roomW, r, o = {}) {
  const zc = o.zc ?? (rect.z0 + rect.z1) / 2;
  const c0 = zc - cw / 2, c1 = zc + cw / 2;
  const rooms = [{ x0: rect.x0, z0: c0, x1: rect.x1, z1: c1, corridor: true }];
  const walls = [];
  for (const side of [-1, 1]) {
    const z0 = side < 0 ? rect.z0 : c1, z1 = side < 0 ? c0 : rect.z1;
    if (z1 - z0 < 4) continue;
    const L = rect.x1 - rect.x0, n = Math.max(1, Math.round(L / roomW));
    let x = rect.x0;
    for (let i = 0; i < n; i++) {
      const x1 = i === n - 1 ? rect.x1 : rect.x0 + L * (i + 1) / n + (r() - 0.5) * 2;
      const R = { x0: x, z0, x1, z1, side };
      if (o.skip && o.skip(R)) { x = x1; continue; }
      rooms.push(R);
      x = x1;
    }
  }
  rooms.forEach((q, i) => { q.id = i; });
  const dw = o.doorW ?? 4.2;
  for (const R of rooms) {
    if (R.corridor) continue;
    // its wall to the corridor, with a door
    const at = R.side < 0 ? c0 : c1, a0 = R.x0, a1 = R.x1;
    const a = Math.min(a1 - dw / 2 - 0.8, Math.max(a0 + dw / 2 + 0.8, a0 + (a1 - a0) * (0.3 + r() * 0.4)));
    walls.push({ axis: 'x', at, a0, a1, ra: 0, rb: R.id, door: a1 - a0 > dw + 1.6 ? { a, w: dw } : null });
  }
  // the walls between neighbouring rooms on the same side (no doors)
  for (const A of rooms) for (const B of rooms) {
    if (A === B || A.corridor || B.corridor || A.side !== B.side || Math.abs(A.x1 - B.x0) > 0.01) continue;
    walls.push({ axis: 'z', at: A.x1, a0: A.z0, a1: A.z1, ra: A.id, rb: B.id, door: o.through && r() < o.through ? { a: (A.z0 + A.z1) / 2, w: dw } : null });
  }
  return { rooms, walls, start: 0 };
}

/** Build the inside walls of a plan (thickness t) on the floor at y0..y1, interior surfaces per room. */
export function planWalls(K, P, y0, y1, t, roomMat, o = {}) {
  for (const wl of P.walls) {
    const holes = wl.door ? [{ a: wl.door.a, w: wl.door.w, y: y0, h: Math.min(7.6, y1 - y0 - 1) }] : [];
    const ma = roomMat(P.rooms[wl.ra]), mb = roomMat(P.rooms[wl.rb]);
    // which room is on the + side
    const A = P.rooms[wl.ra];
    const aPlus = wl.axis === 'x' ? A.z0 >= wl.at - 0.01 : A.x0 >= wl.at - 0.01;
    wall(K, wl.axis, wl.a0, wl.a1, wl.at, y0, y1, t, aPlus ? ma : mb, aPlus ? mb : ma, holes, { out: 1, inner: true, top: o.top });
    if (wl.door) {
      const kind = o.doorKind ? o.doorKind(wl) : (K.r() < 0.7 ? 'wood' : null);
      wl.door.rec = doorIn(K, wl.axis, wl.at, t, holes[0], kind, { ao: 0.45 });
    }
  }
}
