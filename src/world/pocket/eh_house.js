// The split-level tract house of the Cul-de-sac of Hollow Frames (pocket 3).
// 12 x 11 m. Front half (garage room, entry, living room) sits at the lawn level; a stairwell
// of half-flight carpeted steps leads up to the back half (hall and three bedrooms) which is
// 1.35 m higher. Every wall is raw drywall inside and siding outside, every floor carpet, and
// there is not a stick of furniture. The front door stands open.
import { W, CF, M, stairs } from '../gen/common.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial } from '../materials.js';
import { face, tface, rotAlong } from './eh_common.js';
import { FACE, only } from './e_util.js';

export const HW = 12, HD = 11;           // footprint in cells
export const GROUND = 0.15;              // lawn / sidewalk level (road is 0)
export const F0 = 0.30, F1 = 1.65;       // finished floors: front half, back half
export const CH = 2.6;                   // ceiling height above each floor
const TOP0 = F0 + CH, TOP1 = F1 + CH;    // wall tops
const TOPS = 3.6;                        // ceiling over the stairwell (kept under the sloping roof)

// ---------------------------------------------------------------- assets
// builder-grade carpet, fine pile, the colour of old oatmeal
defineTexture('eh_carpet', (p) => {
  p.fill([168, 152, 124]);
  p.grain(0.1);
  p.noise(8, 0.05, 2);
  p.speckle(260, [150, 134, 108], 0.25, 0.6);
  p.speckle(120, [186, 172, 144], 0.25, 0.5);
}, 16);
defineMaterial('eh_carpet', 'eh_carpet', { s: 1.4, surf: 'carpet', stain: 0.05 });

// ---------------------------------------------------------------- roof prop
// Local frame: facade at z = 0 (front faces -z), the house extends toward +z, lateral x centred.
const LAT = 6.55;                        // roof half width (overhang included)
const WALL_X = 6.12;                     // outer face of the side walls
const RT = 0.12;                         // slab thickness
const ROOF = [[-0.7, 3.05], [5.0, 4.5], [8.4, 5.55], [11.7, 4.45]]; // (v, top y)
function roofTop(v) {
  for (let k = 0; k < ROOF.length - 1; k++) {
    const [v0, y0] = ROOF[k], [v1, y1] = ROOF[k + 1];
    if (v <= v1 || k === ROOF.length - 2) return y0 + ((v - v0) / (v1 - v0)) * (y1 - y0);
  }
  return 0;
}
const roofUnder = (v) => roofTop(v) - RT;
// props are lit a little brighter than cell geometry; the tint evens siding fills out
const TINT = 0.74;

defineProp('eh_roof_split', {
  build(mb, p) {
    const shingle = S('shingles', { tint: [0.9, 0.9, 0.92] });
    const siding = S(p.opts.siding || 'siding', { tint: [TINT, TINT, TINT] });
    const brick = S('brick', { tint: [TINT, TINT, TINT] });
    const under = S('plastic_white', { tint: [0.62, 0.62, 0.62] });
    for (let k = 0; k < ROOF.length - 1; k++) {
      const [v0, y0] = ROOF[k], [v1, y1] = ROOF[k + 1];
      // top and underside
      face(mb, [-LAT, y0, v0], [LAT, y0, v0], [LAT, y1, v1], [-LAT, y1, v1], [0, 1, 0], shingle, shingle.su, shingle.sv);
      face(mb, [-LAT, y0 - RT, v0], [LAT, y0 - RT, v0], [LAT, y1 - RT, v1], [-LAT, y1 - RT, v1], [0, -1, 0], under, 2, 2);
      // slab edges
      for (const sx of [-1, 1]) {
        face(mb, [sx * LAT, y0 - RT, v0], [sx * LAT, y0, v0], [sx * LAT, y1, v1], [sx * LAT, y1 - RT, v1], [sx, 0, 0], under, 2, 2);
      }
    }
    const [vf, yf] = ROOF[0], [vb, yb] = ROOF[ROOF.length - 1];
    face(mb, [-LAT, yf - RT, vf], [LAT, yf - RT, vf], [LAT, yf, vf], [-LAT, yf, vf], [0, 0, -1], under, 2, 2);
    face(mb, [-LAT, yb - RT, vb], [LAT, yb - RT, vb], [LAT, yb, vb], [-LAT, yb, vb], [0, 0, 1], under, 2, 2);
    // frieze boards closing the gap between wall tops and the roof underside, front and back
    face(mb, [-WALL_X, TOP0, -0.12], [WALL_X, TOP0, -0.12], [WALL_X, roofUnder(-0.12), -0.12], [-WALL_X, roofUnder(-0.12), -0.12], [0, 0, -1], siding, siding.su, siding.sv);
    face(mb, [-WALL_X, TOP1, 11.12], [WALL_X, TOP1, 11.12], [WALL_X, roofUnder(11.12), 11.12], [-WALL_X, roofUnder(11.12), 11.12], [0, 0, 1], siding, siding.su, siding.sv);
    // gable fills on both sides: front half (lower wall tops) and back half
    for (const sx of [-1, 1]) {
      const x = sx * WALL_X, h = [sx, 0, 0];
      if (p.opts.stairSide === sx) {
        // the stairwell side has a taller wall between v = 2 and 5
        face(mb, [x, TOP0, 0], [x, TOP0, 2], [x, roofUnder(2), 2], [x, roofUnder(0), 0], h, siding, siding.su, siding.sv, [0, -1, 0]);
        face(mb, [x, TOPS, 2], [x, TOPS, 5], [x, roofUnder(5), 5], [x, roofUnder(2), 2], h, siding, siding.su, siding.sv, [0, -1, 0]);
      } else {
        face(mb, [x, TOP0, 0], [x, TOP0, 5], [x, roofUnder(5), 5], [x, roofUnder(0), 0], h, siding, siding.su, siding.sv, [0, -1, 0]);
      }
      const P = [[5, TOP1], [11.12, TOP1], [11.12, roofUnder(11.12)], [8.4, roofUnder(8.4)], [5, roofUnder(5)]].map(([v, y]) => [x, y, v]);
      tface(mb, P[0], P[1], P[2], h, siding, siding.su, siding.sv);
      tface(mb, P[0], P[2], P[3], h, siding, siding.su, siding.sv);
      tface(mb, P[0], P[3], P[4], h, siding, siding.su, siding.sv);
    }
    // chimney
    const cy0 = roofTop(7.6) - 0.5;
    mb.box(2.6, cy0, 7.1, 3.5, 6.7, 8.0, brick, { skip: 8 });
    mb.box(2.5, 6.7, 7.0, 3.6, 6.82, 8.1, S('concrete', { tint: [TINT, TINT, TINT] }), { skip: 8 });
  },
  boxes: [],
});

// The closed garage door, a thin slab standing off the facade (a decal would z-fight with the
// wall at this distance). Local origin on the facade plane, the slab sticks out toward -z.
defineProp('eh_garage_door', {
  build(mb, p) {
    const w = (p.opts.w || 4.5) / 2, h = p.opts.h || 2.2;
    const st = T('garage_door', { tint: [0.78, 0.78, 0.78] });
    const edge = S('plastic_white', { tint: [0.55, 0.55, 0.55] });
    const FIT = [0, 0, 1, 1];
    mb.box(-w, 0.03, -0.07, w, 0.03 + h, 0, [edge, edge, edge, null, null, st], { uv: ['world', 'world', 'world', 'world', FIT, FIT] });
  },
  boxes: [],
});

// A front door leaf hinged at the origin (the leaf runs along local +x), so a dynamic
// prop's rotation swings it about the hinge.
defineProp('eh_door_leaf', {
  build(mb, p) {
    const st = T('house_door', { tint: [0.9, 0.9, 0.9] });
    const edge = S('wood_dark');
    const FIT = [0, 0, 1, 1];
    mb.box(0, 0.02, -0.025, 0.92, 2.05, 0.025, [edge, edge, edge, null, st, st], { uv: ['world', 'world', 'world', 'world', FIT, FIT] });
    mb.box(0.78, 0.98, -0.06, 0.84, 1.02, 0.06, S('chrome'));
  },
  boxes: [],
});

// ---------------------------------------------------------------- the house
// The engine closes every cell that has a ceiling next to an open-sky cell with a wall up to the
// 6 m level height, which would wall each house up to 6 m. So the one-cell ring of ground around
// a house is made VOID (the rule skips void neighbours) and its ground is a brush slab instead.
function groundRing(zb, fr, driveMat, EXT) {
  for (let v = -1; v <= HD; v++) {
    for (let u = -1; u <= HW; u++) {
      if (u >= 0 && u < HW && v >= 0 && v < HD) continue;
      // beside the raised back half the wall base (and so the window sills) follows the upper floor
      fr.setCell(u, v, { floor: v >= 5 && (u < 0 || u >= HW || v >= HD) ? F1 : GROUND, ceil: NaN, flags: CF.VOID | CF.NOPROPS });
    }
  }
  const slab = (u0, v0, u1, v1, mat) => {
    const xa = fr.x(u0, v0), xb = fr.x(u1, v1), za = fr.z(u0, v0), zb2 = fr.z(u1, v1);
    zb.box(Math.min(xa, xb), GROUND - 0.3, Math.min(za, zb2), Math.max(xa, xb), GROUND, Math.max(za, zb2), mat, { skip: only(FACE.PY), sub: 2 });
  };
  const grass = M.grass_dead;
  // front row (the driveway runs up to the garage), back row, and the two side columns
  slab(-1, -1, 0, 0, grass);
  slab(0, -1, 5, 0, driveMat);
  slab(5, -1, HW + 1, 0, grass);
  slab(-1, HD, HW + 1, HD + 1, grass);
  slab(-1, 0, 0, HD, grass);
  slab(HW, 0, HW + 1, HD, grass);
  // siding foundation under the raised back half, flush with the thin walls (+-0.1)
  const found = (u0, v0, u1, v1) => {
    const xa = fr.x(u0, v0), xb = fr.x(u1, v1), za = fr.z(u0, v0), zb2 = fr.z(u1, v1);
    zb.box(Math.min(xa, xb), GROUND, Math.min(za, zb2), Math.max(xa, xb), F1, Math.max(za, zb2), EXT, { sub: 2 });
  };
  found(-0.1, 4.9, 0.1, HD + 0.1);
  found(HW - 0.1, 4.9, HW + 0.1, HD + 0.1);
  found(0.1, HD - 0.1, HW - 0.1, HD + 0.1);
}

// The engine caps every wall junction and every change of wall type with a post that has ONE
// material on all four sides, so beside a window or where a partition meets the outside wall a
// drywall (or siding) pillar shows on the wrong face. After the plan is written, every such post on
// the outer walls gets a thin board in the right material over its wrong-looking face.
function coverPosts(zb, fr, EXT, INT) {
  const isNum = (v) => !Number.isNaN(v);
  const edge = (x, z, side) => {
    if (!zb.in(x, z)) return [0, 0, 0, 0];
    const i = zb.i(x, z), ox = side === 'W' ? x - 1 : x, oz = side === 'W' ? z : z - 1;
    const t = side === 'W' ? zb.wallW[i] : zb.wallN[i], mm = side === 'W' ? zb.wmW[i] : zb.wmN[i];
    const fa = zb.getFloor(ox, oz), fb = zb.floor[i], ca = zb.getCeil(ox, oz), cb = zb.ceil[i];
    const bot = Math.min(isNum(fa) ? fa : Infinity, isNum(fb) ? fb : Infinity);
    const top = Math.max(isNum(ca) ? ca : -Infinity, isNum(cb) ? cb : -Infinity);
    return [t, mm >> 8 || (mm & 255), bot, top];
  };
  const line = (cells, ed, td) => {
    for (const [u, v] of cells) {
      const vx = fr.x(u, v), vz = fr.z(u, v);
      if (!zb.in(vx, vz)) continue;
      const E = [edge(vx, vz - 1, 'W'), edge(vx, vz, 'W'), edge(vx - 1, vz, 'N'), edge(vx, vz, 'N')];
      const [n, s, w, e] = E.map((q) => q[0]);
      const cnt = (n ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0) + (e ? 1 : 0);
      if (!cnt || (cnt === 2 && n && s && n === s) || (cnt === 2 && w && e && w === e)) continue;
      const first = E.find((q) => q[0]);
      const post = first[1];
      const outside = post === INT;           // a drywall post shows on the siding face
      if (!outside && post !== EXT) continue;
      let bot = Infinity, top = -Infinity;
      for (const q of E) if (q[0]) { bot = Math.min(bot, q[2]); top = Math.max(top, q[3]); }
      if (!Number.isFinite(bot) || !Number.isFinite(top)) continue;
      const [ex, ez] = fr.dir(ed[0], ed[1]), [tx, tz] = fr.dir(td[0], td[1]);
      const sgn = outside ? 1 : -1;               // outer face: along the exterior direction, inner: against it
      const a0 = 0.1 * sgn, a1 = 0.15 * sgn;
      const px = [vx + ex * a0, vx + ex * a1], pz = [vz + ez * a0, vz + ez * a1];
      const x0 = Math.min(px[0], px[1]) - Math.abs(tx) * 0.17, x1 = Math.max(px[0], px[1]) + Math.abs(tx) * 0.17;
      const z0 = Math.min(pz[0], pz[1]) - Math.abs(tz) * 0.17, z1 = Math.max(pz[0], pz[1]) + Math.abs(tz) * 0.17;
      const m = outside ? EXT : INT;
      // faces: [+x, -x, +y, -y, +z, -z]; only the face looking away from the wall and the two ends
      const out = [ex * sgn > 0 ? m : null, ex * sgn < 0 ? m : null, null, null, ez * sgn > 0 ? m : null, ez * sgn < 0 ? m : null];
      if (tx) { out[0] = m; out[1] = m; }
      if (tz) { out[4] = m; out[5] = m; }
      zb.box(x0, bot, z0, x1, top, z1, out, { collide: false, sub: 8 });
    }
  };
  const L = [], R = [], F = [], B = [];
  for (let v = 1; v < HD; v++) { L.push([0, v]); R.push([HW, v]); }
  for (let u = 1; u < HW; u++) { F.push([u, 0]); B.push([u, HD]); }
  line(L, [-1, 0], [0, 1]);
  line(R, [1, 0], [0, 1]);
  line(F, [0, -1], [1, 0]);
  line(B, [0, 1], [1, 0]);
  // corners: a board on each of the two outer faces when the corner post is drywall
  for (const [u, v, du, dv] of [[0, 0, -1, -1], [HW, 0, 1, -1], [0, HD, -1, 1], [HW, HD, 1, 1]]) {
    const vx = fr.x(u, v), vz = fr.z(u, v);
    if (!zb.in(vx, vz)) continue;
    const E = [edge(vx, vz - 1, 'W'), edge(vx, vz, 'W'), edge(vx - 1, vz, 'N'), edge(vx, vz, 'N')];
    const first = E.find((q) => q[0]);
    if (!first || first[1] !== INT) continue;
    let bot = Infinity, top = -Infinity;
    for (const q of E) if (q[0]) { bot = Math.min(bot, q[2]); top = Math.max(top, q[3]); }
    if (!Number.isFinite(bot) || !Number.isFinite(top)) continue;
    const e1 = fr.dir(du, 0), e2 = fr.dir(0, dv);          // world outward directions of the two faces
    // face along e1 runs on along -e2 (the wall continues that way), face along e2 along -e1
    for (const [e, d] of [[e1, [-e2[0], -e2[1]]], [e2, [-e1[0], -e1[1]]]]) {
      const along = (k) => [vx + e[0] * k[0] + d[0] * k[1], vz + e[1] * k[0] + d[1] * k[1]];
      const a = along([0.1, -0.1]), b = along([0.15, 0.17]);
      zb.box(Math.min(a[0], b[0]), bot, Math.min(a[1], b[1]), Math.max(a[0], b[0]), top, Math.max(a[1], b[1]),
        [e[0] > 0 || d[0] ? EXT : null, e[0] < 0 || d[0] ? EXT : null, null, null, e[1] > 0 || d[1] ? EXT : null, e[1] < 0 || d[1] ? EXT : null], { collide: false });
    }
  }
}

export function buildHouse(zb, fr, o) {
  const EXT = o.ext, INT = M.drywall_raw, CARPET = M.eh_carpet;
  groundRing(zb, fr, o.driveMat || M.concrete_floor, EXT);
  const floorOf = (v) => (v < 5 ? F0 : F1);

  // ---- cells: carpet floors, raw drywall ceilings
  for (let v = 0; v < HD; v++) {
    for (let u = 0; u < HW; u++) {
      const f = floorOf(v);
      let ceil = f + CH;
      if (u >= 10 && v >= 2 && v <= 4) ceil = TOPS;       // stairwell: room for the climb, still under the roof
      fr.setCell(u, v, { floor: f, ceil, fmat: CARPET, cmat: INT, wmat: INT, flags: 0, solid: 0 });
    }
  }
  // stairs rising toward the back (+v) from the front half to the back half
  const c0 = fr.cell(10, 2), c1 = fr.cell(11, 4);
  const sx0 = Math.min(c0[0], c1[0]), sx1 = Math.max(c0[0], c1[0]) + 1;
  const sz0 = Math.min(c0[1], c1[1]), sz1 = Math.max(c0[1], c1[1]) + 1;
  const dir = fr.vx > 0 ? '+x' : fr.vx < 0 ? '-x' : fr.vz > 0 ? '+z' : '-z';
  stairs(zb, sx0, sz0, sx1, sz1, dir, F0, F1, CARPET);
  for (let v = 2; v <= 4; v++) for (let u = 10; u <= 11; u++) fr.setCell(u, v, { ceil: TOPS });

  // ---- exterior walls
  fr.hEdges(0, 5, 0, W.WALL, EXT, INT);               // garage front (closed door painted on)
  fr.hEdges(5, 7, 0, W.DOOR, EXT, INT);               // the front door: wide open
  fr.hEdges(7, 8, 0, W.WALL, EXT, INT);
  fr.hEdges(8, 10, 0, W.WINDOW, EXT, INT);            // living room picture window
  fr.hEdges(10, 12, 0, W.WALL, EXT, INT);
  fr.vEdges(0, 0, HD, W.WALL, EXT, INT);              // west (left) side
  fr.vEdges(0, 2, 3, W.WINDOW, EXT, INT);
  fr.vEdges(0, 8, 9, W.WINDOW, EXT, INT);
  fr.vEdges(12, 0, HD, W.WALL, INT, EXT);             // east (right) side
  fr.vEdges(12, 1, 2, W.WINDOW, INT, EXT);
  fr.vEdges(12, 8, 9, W.WINDOW, INT, EXT);
  fr.hEdges(0, 12, HD, W.WALL, INT, EXT);             // back
  for (const u of [1, 5, 9]) fr.hEdges(u, u + 1, HD, W.WINDOW, INT, EXT);

  // ---- interior walls (raw drywall both sides)
  fr.vEdges(5, 0, 1, W.WALL, INT, INT);               // garage room | entry
  fr.vEdges(5, 1, 3, W.ARCH, INT, INT);
  fr.vEdges(5, 3, 5, W.WALL, INT, INT);
  fr.hEdges(0, 10, 5, W.WALL, INT, INT);              // split between the two halves (steps at u 10-11)
  fr.vEdges(10, 2, 5, W.WALL, INT, INT);              // stairwell
  fr.hEdges(0, 12, 7, W.WALL, INT, INT);              // hall | bedrooms
  for (const u of [1, 5, 9]) fr.hEdges(u, u + 1, 7, W.DOOR, INT, INT);
  fr.vEdges(4, 7, HD, W.WALL, INT, INT);
  fr.vEdges(8, 7, HD, W.WALL, INT, INT);

  coverPosts(zb, fr, EXT, INT);

  // ---- outside dressing
  {
    const gx = fr.x(2.5, -0.1), gz = fr.z(2.5, -0.1);
    if (zb.in(Math.floor(gx), Math.floor(gz))) zb.prop('eh_garage_door', gx, GROUND, gz, Math.atan2(fr.fx, -fr.fz), { w: 4.5, h: 2.2 });
  }
  // the front door leaf, ajar in the wind
  const hx = fr.x(5.16, 0.0), hz = fr.z(5.16, 0.0);
  if (zb.in(Math.floor(hx), Math.floor(hz))) {
    const rot = rotAlong(fr.vx, fr.vz) + 0.1;
    zb.dynamic('eh_door_leaf', hx, F0, hz, rot, {}, { osc: [0.14, 0.06, o.phase || 0] });
  }

  // ---- daylight: a cool light just inside every window, a very dim one in the windowless
  // hall, foyer and stairwell. No fixtures anywhere.
  const L = (lu, lv, f, int, color, rad = 6.5) => {
    const x = fr.x(lu, lv), z = fr.z(lu, lv);
    if (zb.in(Math.floor(x), Math.floor(z))) zb.light(x, f, z, { rad, int: int * (o.light ?? 1), color });
  };
  const day = [0.9, 0.95, 1.0], dim = [1, 0.96, 0.88];
  L(9.0, 0.9, F0 + 1.7, 0.55, day);      // living room picture window
  L(11.0, 1.5, F0 + 1.7, 0.45, day);     // living room side window
  L(0.9, 2.5, F0 + 1.7, 0.5, day);       // garage room window
  L(11.1, 8.5, F1 + 1.7, 0.5, day);      // east bedroom
  L(0.9, 8.5, F1 + 1.7, 0.5, day);       // west bedroom
  for (const u of [1.5, 5.5, 9.5]) L(u, 10.1, F1 + 1.7, 0.5, day);   // back windows
  L(7.5, 2.5, F0 + 2.1, 0.3, dim);       // foyer
  L(10.5, 3.0, F0 + 2.4, 0.22, dim);     // stairwell
  L(3.0, 6.0, F1 + 2.1, 0.2, dim, 5);    // hall
  L(9.0, 6.0, F1 + 2.1, 0.2, dim, 5);

  // ---- roof
  const rx = fr.x(HW / 2, 0), rz = fr.z(HW / 2, 0);
  if (!o.noRoof) zb.prop('eh_roof_split', rx, 0, rz, Math.atan2(fr.fx, -fr.fz), { siding: o.sidingName || 'siding', collide: false, stairSide: fr.mirror ? 1 : -1 });
}

export { CF };
