// Helpers shared by the three public-interior variants (lobby / waiting room / conference hall):
// a placement context with an occupancy grid, wall frames along the zone sides, side rooms,
// columns, light grids and a few recurring furniture groups.
import { W, ceilingLight, facing } from './common.js';
import { keepClearMask } from './a_common.js';
import { restroom } from './b_util.js';
import { tryRoomPiece } from '../roompieces.js';
import { roomFrame } from './z_rooms.js';
import { faceOfNormal, clamp, lightState, gateSet } from './z_util.js';
import './b_assets.js';
import './z_assets.js';

// ------------------------------------------------------------------ context
export function makeCtx(zb, world, r) {
  const keep = keepClearMask(zb, world, 3, 1);
  const occ = new Uint8Array(zb.w * zb.d);
  for (let i = 0; i < occ.length; i++) if (keep[i]) occ[i] = 2;
  const gates = zb.gates;
  const gateCell = new Set();
  for (const g of gates) { gateCell.add(g.x + ',' + g.z); gateCell.add((g.x + g.dx) + ',' + (g.z + g.dz)); }
  return { zb, p: zb.params, r, occ, keep, gates, gateCell, gset: gateSet(zb), lights: [], frames: {} };
}
const idx = (c, x, z) => (z - c.zb.z0) * c.zb.w + (x - c.zb.x0);
export function freeRect(c, x0, z0, x1, z1, inset = 0) {
  const zb = c.zb;
  if (x0 < zb.x0 + inset || z0 < zb.z0 + inset || x1 > zb.x1 - inset || z1 > zb.z1 - inset) return false;
  for (let z = Math.floor(z0); z < Math.ceil(z1); z++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) if (c.occ[idx(c, x, z)]) return false;
  return true;
}
export function reserve(c, x0, z0, x1, z1, v = 1) {
  const zb = c.zb;
  for (let z = Math.max(zb.z0, Math.floor(z0)); z < Math.min(zb.z1, Math.ceil(z1)); z++) for (let x = Math.max(zb.x0, Math.floor(x0)); x < Math.min(zb.x1, Math.ceil(x1)); x++) c.occ[idx(c, x, z)] = v;
}
// random free rectangle w x d (cells); opts.margin: extra free ring, opts.inset: distance from the zone border
export function findSpot(c, w, d, opts = {}) {
  const { r, zb } = c;
  const inset = opts.inset ?? 1;
  for (let k = 0; k < (opts.tries ?? 60); k++) {
    // the requested margin applies for the first tries, then relaxes
    const m = k < 30 ? (opts.margin ?? 0) : Math.min(opts.margin ?? 0, 0.4);
    const ww = opts.rot && r.chance(0.5) ? d : w, dd = ww === w ? d : w;
    const sx = zb.x1 - zb.x0 - ww - 2 * inset, sz = zb.z1 - zb.z0 - dd - 2 * inset;
    if (sx < 0 || sz < 0) continue;
    const x0 = zb.x0 + inset + r.int(0, sx), z0 = zb.z0 + inset + r.int(0, sz);
    if (!freeRect(c, x0 - m, z0 - m, x0 + ww + m, z0 + dd + m, 0)) continue;
    if (x0 - m < zb.x0 || z0 - m < zb.z0 || x0 + ww + m > zb.x1 || z0 + dd + m > zb.z1) continue;
    return { x0, z0, x1: x0 + ww, z1: z0 + dd, w: ww, d: dd, swapped: ww !== w };
  }
  return null;
}

// ------------------------------------------------------------------ frames along the zone sides
export function sideFrame(c, side) {
  if (c.frames[side]) return c.frames[side];
  const zb = c.zb;
  const into = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[side];
  const F = roomFrame({ x0: zb.x0, z0: zb.z0, x1: zb.x1, z1: zb.z1, dx: into[0], dz: into[1] });
  F.side = side;
  F.into = into;
  F.normalFace = faceOfNormal(into[0], into[1]);
  F.rect = (u0, v0, u1, v1) => { const a = F.pt(u0, v0), b = F.pt(u1, v1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
  // gate cells (u indices) on this side
  const gu = new Set();
  for (const g of c.gates) if (g.side === side) gu.add(side === 'N' || side === 'S' ? g.x - zb.x0 : g.z - zb.z0);
  F.gateU = gu;
  F.gateNear = (u0, u1, margin = 1) => { for (let u = Math.floor(u0 - margin); u < Math.ceil(u1 + margin); u++) if (gu.has(u)) return true; return false; };
  F.place = (type, u, v, du, dv, opts, y = 0) => { const [x, z] = F.pt(u, v); return zb.prop(type, x, y, z, F.rot(du, dv), opts || {}); };
  // decal on the wall of this side (seen from inside); v defaults to the wall plane
  F.decal = (u, y, w, h, tex, opts, v = 0.1) => { const [x, z] = F.pt(u, v); return zb.decal(x, y, z, F.normalFace, w, h, tex, opts); };
  F.box = (u0, y0, v0, u1, y1, v1, mat, o) => { const q = F.rect(u0, v0, u1, v1); return zb.box(q[0], y0, q[1], q[2], y1, q[3], mat, o); };
  c.frames[side] = F;
  return F;
}
// the longest stretch of a side free of gates (u0, u1)
export function freeSpan(c, side, margin = 2) {
  const F = sideFrame(c, side);
  let best = [0, 0], s = -1;
  for (let u = 0; u <= F.U; u++) {
    const ok = u < F.U && !F.gateNear(u, u + 1, margin);
    if (ok && s < 0) s = u;
    if (!ok && s >= 0) { if (u - s > best[1] - best[0]) best = [s, u]; s = -1; }
  }
  return best;
}

// ------------------------------------------------------------------ rooms with thin walls
// Rectangular room [x0,x1) x [z0,z1) with walls on all edges and one door on edge `door`
// ({side:'N'|'S'|'W'|'E', t: cell index along the edge}); materials inner/outer.
export function buildRoomBox(c, rect, o) {
  const { zb } = c;
  const { x0, z0, x1, z1 } = rect;
  zb.roomWalls(x0, z0, x1, z1, W.WALL, o.inner, o.outer);
  if (o.floor) zb.rectFloor(x0, z0, x1, z1, o.floorH ?? 0, o.floor);
  if (o.ceil !== undefined) zb.rectCeil(x0, z0, x1, z1, o.ceil, o.ceilMat);
  zb.rectWallMat(x0, z0, x1, z1, o.inner);
  zb.rectRoom(x0, z0, x1, z1, o.id ?? 100);
  const doors = o.doors || [];
  const out = [];
  for (const d of doors) {
    const type = d.type ?? W.DOOR;
    for (let k = 0; k < (d.n || 1); k++) {
      const t = d.t + k;
      if (d.side === 'N') zb.setWall(x0 + t, z0, 'N', type, o.outer, o.inner);
      else if (d.side === 'S') zb.setWall(x0 + t, z1, 'N', type, o.inner, o.outer);
      else if (d.side === 'W') zb.setWall(x0, z0 + t, 'W', type, o.outer, o.inner);
      else zb.setWall(x1, z0 + t, 'W', type, o.inner, o.outer);
    }
    // the cell inside the doorway and the direction pointing into the room
    const into = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[d.side];
    const ix = d.side === 'W' ? x0 : d.side === 'E' ? x1 - 1 : x0 + d.t, iz = d.side === 'N' ? z0 : d.side === 'S' ? z1 - 1 : z0 + d.t;
    out.push({ x: ix, z: iz, dx: into[0], dz: into[1], side: d.side, t: d.t, n: d.n || 1 });
  }
  return out;
}

// Room against the wall of `side`: u0..u0+w along it, `depth` into the hall, door on the hall edge.
// Returns the room descriptor or null if it does not fit / collides.
export function sideRoom(c, side, u0, w, depth, o) {
  const F = sideFrame(c, side);
  const q = F.rect(u0, 0, u0 + w, depth);
  if (F.gateNear(u0 - 0.5, u0 + w + 0.5, 2)) return null;
  if (!freeRect(c, q[0] - (F.into[0] === 0 ? 0 : 0), q[1], q[2], q[3], 0)) return null;
  // ring in front of the door stays free
  const doorT = o.doorT ?? Math.floor(w / 2);
  const hallEdge = depth;
  const dsd = side === 'N' ? 'S' : side === 'S' ? 'N' : side === 'W' ? 'E' : 'W';
  // door cell index along the hall-facing edge (world index relative to the rect)
  const tt = side === 'N' || side === 'S' ? Math.floor(F.pt(u0 + doorT, 0)[0]) - q[0] : Math.floor(F.pt(u0 + doorT, 0)[1]) - q[1];
  const rect = { x0: q[0], z0: q[1], x1: q[2], z1: q[3] };
  const doors = buildRoomBox(c, rect, { inner: o.inner, outer: o.outer, floor: o.floor, ceil: o.ceil, ceilMat: o.ceilMat, doors: [{ side: dsd, t: tt }] });
  reserve(c, q[0], q[1], q[2], q[3], 3);
  // keep a pad in front of the door
  const pad = F.rect(u0 + doorT - 1, depth, u0 + doorT + 2, depth + 2);
  reserve(c, pad[0], pad[1], pad[2], pad[3], 4);
  void hallEdge;
  const dd = doors[0];
  (c.views || (c.views = [])).push({ name: 'room' + (c.views ? c.views.length : 0), x: dd.x + 0.5 - dd.dx * 2.2, z: dd.z + 0.5 - dd.dz * 2.2, yaw: Math.atan2(dd.dx, -dd.dz), pitch: 0 });
  return { rect, door: dd, side, dsd, F, u0, w, depth };
}

// ------------------------------------------------------------------ simple furnished side rooms
export function furnishSideRoom(c, room, type) {
  const { zb, r } = c;
  const { x0, z0, x1, z1 } = room.rect;
  const d = room.door;
  const fr = roomFrame({ x0, z0, x1, z1, dx: d.dx, dz: d.dz });
  // frame is seen from the door, so the room is entered at v = 0
  const U = fr.U, V = fr.V;
  const place = (t, u, v, du, dv, opts, y = 0) => { const [x, z] = fr.pt(u, v); return zb.prop(t, x, y, z, fr.rot(du, dv), opts || {}); };
  const dec = (side, t, y, w, h, tex) => {
    let u, v, nu, nv;
    if (side === 'back') { u = t; v = V - 0.1; nu = 0; nv = -1; } else if (side === 'left') { u = 0.1; v = t; nu = 1; nv = 0; } else { u = U - 0.1; v = t; nu = -1; nv = 0; }
    const [x, z] = fr.pt(u, v);
    const n = fr.vec(nu, nv);
    zb.decal(x, y, z, faceOfNormal(n[0], n[1]), w, h, tex);
  };
  const lightKind = type === 'security' ? 'tube' : 'panel';
  switch (type) {
    case 'office': {
      place('desk', U / 2, V - 1.0, 0, -1);
      place('chair_office', U / 2 + r.range(-0.2, 0.2), V - 1.9, 0, 1);
      place('filing_cabinet', U - 0.45, V - 0.4, 0, -1);
      if (r.chance(0.6)) place('bookshelf', 0.4, V * 0.5, 1, 0, { w: 0.9 });
      if (r.chance(0.5)) place('plant', 0.5, V - 0.5, 0, -1);
      dec('back', U * 0.3, 1.6, 0.6, 0.6, r.pick(['calendar', 'poster_motiv', 'frame_empty', 'painting_land']));
      break;
    }
    case 'security': {
      place('table', U / 2, V - 0.6, 0, -1, { len: Math.min(U - 0.6, 2.6), depth: 0.7 });
      const n = Math.max(2, Math.min(4, Math.floor((U - 1) / 0.6)));
      for (let k = 0; k < n; k++) {
        const [x, z] = fr.pt(U / 2 + (k - (n - 1) / 2) * 0.58, V - 0.62);
        zb.prop('crt', x, 0.76, z, fr.rot(0, -1), { screen: r.pick(['static', 'static', 'crt_off', 'crt_blue']) });
      }
      place('chair_office', U / 2 + r.range(-0.3, 0.3), V - 1.5, 0, 1);
      break;
    }
    case 'coat': {
      for (let k = 0; k < Math.floor(U - 0.8); k++) if (r.chance(0.8)) place('coat_rack', 0.7 + k * 0.9, V - 0.4, 0, -1, { coat: r.chance(0.5) });
      place('counter', U / 2, 1.1, 0, -1, { len: Math.min(2, U - 0.5) });
      break;
    }
    case 'store': {
      place('shelf_metal', U / 2, V - 0.4, 0, -1, { w: Math.min(1.4, U - 0.5) });
      place('stack_chairs', 0.5, 1.2, 0, 1, { n: r.int(10, 26) });
      if (r.chance(0.6)) place('stack_chairs', 1.15, 1.2, 0, 1, { n: r.int(6, 18) });
      place('bucket', U - 0.5, 0.9, 0, 1);
      place('cart_cleaning', U - 0.8, V - 1.0, 1, 0);
      break;
    }
    default: break;
  }
  // lights
  const [lx, lz] = fr.pt(U / 2, V / 2);
  ceilingLight(zb, lx, lz, lightKind, lightState(r, c.p.fail * 0.7, c.p.flicker), { rot: fr.eu[0] !== 0 ? 1 : 0, mul: 1.2 });
  if (V >= 6) { const [l2x, l2z] = fr.pt(U / 2, V * 0.78); ceilingLight(zb, l2x, l2z, lightKind, lightState(r, c.p.fail * 0.7, c.p.flicker), { rot: fr.eu[0] !== 0 ? 1 : 0, mul: 1.2 }); }
}

// A few rooms along free stretches of walls. spec: {n, sides, depth: [min,max], width: [min,max]}
export function sideRooms(c, spec, inner, outer, floor, ceilH, ceilMat) {
  const { r, zb } = c;
  const rooms = [];
  const sides = r.shuffle(spec.sides ? spec.sides.slice() : ['N', 'S', 'W', 'E']);
  for (let k = 0; k < spec.n * 6 && rooms.length < spec.n; k++) {
    const side = sides[k % sides.length];
    const F = sideFrame(c, side);
    const w = r.int(spec.width[0], spec.width[1]), depth = r.int(spec.depth[0], spec.depth[1]);
    if (F.U < w + 4 || F.V < depth + 4) continue;
    const u0 = r.int(1, F.U - w - 1);
    const rm = sideRoom(c, side, u0, w, depth, { inner, outer, floor: floor(), ceil: ceilH, ceilMat });
    if (!rm) continue;
    rooms.push(rm);
  }
  return rooms;
}
export function dressSideRoom(c, rm, types) {
  const { r, zb } = c;
  const area = (rm.rect.x1 - rm.rect.x0) * (rm.rect.z1 - rm.rect.z0);
  if (area >= 16 && Math.min(rm.rect.x1 - rm.rect.x0, rm.rect.z1 - rm.rect.z0) >= 4 && tryRoomPiece(zb, rm.rect, r, 0.18)) return 'piece';
  const type = r.weighted(types);
  if (type === 'restroom') {
    const q = rm.rect;
    restroom(zb, { x0: q.x0, z0: q.z0, x1: q.x1, z1: q.z1 }, r, { light: lightState(r, c.p.fail * 0.5, c.p.flicker) });
    return type;
  }
  furnishSideRoom(c, rm, type);
  return type;
}

// ------------------------------------------------------------------ columns
export function columns(c, x0, z0, x1, z1, sx, sz, H, mat, o = {}) {
  const { zb, r } = c;
  const ox = o.ox ?? 0, oz = o.oz ?? 0;
  const out = [];
  const stx = x0 + ((ox - x0) % sx + sx) % sx, stz = z0 + ((oz - z0) % sz + sz) % sz;
  const hw = o.hw ?? 0.34;
  for (let z = stz; z < z1; z += sz) for (let x = stx; x < x1; x += sx) {
    if (x < zb.x0 + 2 || x > zb.x1 - 2 || z < zb.z0 + 2 || z > zb.z1 - 2) continue;
    if (!freeRect(c, x - 0.5, z - 0.5, x + 0.5, z + 0.5, 0)) continue;
    const cx = x + 0.5, cz = z + 0.5;
    zb.box(cx - hw, 0.18, cz - hw, cx + hw, H - 0.2, cz + hw, mat, { sub: 1.6 });
    zb.box(cx - hw - 0.07, 0, cz - hw - 0.07, cx + hw + 0.07, 0.18, cz + hw + 0.07, mat);
    zb.box(cx - hw - 0.07, H - 0.2, cz - hw - 0.07, cx + hw + 0.07, H, cz + hw + 0.07, mat, { skip: 4 });
    if (r.chance(o.signs ?? 0.22)) {
      const k = Math.floor(r.range(0, 4));
      const [fx, fz, face] = [[cx + hw, cz, 'px'], [cx - hw, cz, 'nx'], [cx, cz + hw, 'pz'], [cx, cz - hw, 'nz']][k];
      zb.decal(fx, 1.7, fz, face, 0.5, 0.5, r.pick(['sign_level', 'sign_floor0', 'sign_occupancy', 'sign_thisway', 'z_poster_quiet']));
    }
    reserve(c, x, z, x + 1, z + 1, 5);
    out.push([cx, cz]);
  }
  return out;
}

// ------------------------------------------------------------------ ceiling lights
export function lightGrid(c, x0, z0, x1, z1, step, kind, o = {}) {
  const { zb, r, p } = c;
  const test = o.test;
  const stx = x0 + ((0 - x0) % step + step) % step, stz = z0 + ((0 - z0) % step + step) % step;
  for (let z = stz + (o.off ?? 0); z < z1; z += step) for (let x = stx + (o.off ?? 0); x < x1; x += step) {
    if (!zb.in(x, z)) continue;
    const i = zb.i(x, z);
    if (zb.solid[i] || Number.isNaN(zb.ceil[i])) continue;
    if (test && !test(x, z)) continue;
    const st = lightState(r, o.fail ?? p.fail, o.flicker ?? p.flicker);
    ceilingLight(zb, x + 0.5, z + 0.5, kind, st, { rot: o.rot, mul: o.mul, rad: o.rad, color: o.color });
  }
}

// ------------------------------------------------------------------ furniture groups
const tandemPitch = (n) => n * 0.56 + 0.1;
// A row of airport seats centred on (cx, cz) facing the unit vector (fx, fz); `units` tandems of n seats.
export function seatRow(c, cx, cz, fx, fz, units, o = {}) {
  const { zb, r } = c;
  const n = o.n || 3, pitch = tandemPitch(n);
  const color = o.color || 'plastic_blue';
  const rot = facing(fx, fz);
  for (let k = 0; k < units; k++) {
    if (r.chance(o.miss ?? 0.04)) continue;
    const t = (k - (units - 1) / 2) * pitch;
    const x = fx !== 0 ? cx : cx + t, z = fx !== 0 ? cz + t : cz;
    zb.prop('seat_tandem', x, 0, z, rot + r.range(-0.015, 0.015) * (o.messy ?? 1), { n, color });
  }
  return units * pitch;
}
// Two back-to-back rows along x (alongX) or z, centred on (cx, cz).
export function seatBlock(c, cx, cz, alongX, units, o = {}) {
  const color = o.color || c.r.pick(['plastic_blue', 'plastic_blue', 'plastic_gray', 'plastic_orange']);
  if (alongX) {
    seatRow(c, cx, cz + 0.27, 0, -1, units, { ...o, color });
    seatRow(c, cx, cz - 0.27, 0, 1, units, { ...o, color });
  } else {
    seatRow(c, cx - 0.27, cz, 1, 0, units, { ...o, color });
    seatRow(c, cx + 0.27, cz, -1, 0, units, { ...o, color });
  }
  return units * tandemPitch(o.n || 3);
}

export { clamp };

// a light just inside every group of gates so that arrivals are never in the dark
export function gateLights(c, kind = 'panel', o = {}) {
  const { zb, r, p } = c;
  const done = new Set();
  for (const g of c.gates) {
    const k = g.side + ':' + Math.floor((g.side === 'N' || g.side === 'S' ? g.x : g.z) / 4);
    if (done.has(k)) continue;
    done.add(k);
    const x = g.x + g.dx * 2 + 0.5, z = g.z + g.dz * 2 + 0.5;
    if (!zb.in(Math.floor(x), Math.floor(z))) continue;
    const i = zb.i(Math.floor(x), Math.floor(z));
    if (zb.solid[i] || Number.isNaN(zb.ceil[i])) continue;
    ceilingLight(zb, x, z, kind, lightState(r, (o.fail ?? p.fail) * 0.35, p.flicker), { mul: o.mul ?? 1.4, rad: o.rad ?? 7.2, rot: o.rot });
  }
}
