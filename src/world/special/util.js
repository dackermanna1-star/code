// Helpers shared by the special set-pieces.
import { W, CF, W_BLOCKS } from '../zonebuilder.js';

export const key = (x, z) => x + ',' + z;

// Wall type on a cell edge, including the zone's east / south border lines, which belong to the
// neighbouring zone and are only written after gen(): those are derived from the shared border
// segments (zb.segs) the same way the pipeline will build them.
export function edgeType(zb, x, z, e) {
  if (zb.in(x, z)) return zb.getWall(x, z, e);
  const side = e === 'W' ? 'E' : 'S';
  if ((side === 'E' && x !== zb.x1) || (side === 'S' && z !== zb.z1)) return -1;
  const t = e === 'W' ? z : x;
  const tall = (zn) => zn && (zn.spanUp > 0 || zn.type === 'claimed');
  for (const s of zb.segs || []) {
    if (s.side !== side || t < s.a || t >= s.b) continue;
    if (s.kind === 'open') return W.NONE;
    if (s.kind === 'seal') return W.FULL;
    const g = s.gates.find((q) => t >= q.at && t < q.at + q.w);
    if (!g) return W.WALL;
    const anyTall = tall(zb.zone) || tall(s.nb);
    if (g.style === 'door') return W.DOOR;
    if (g.style === 'open') return anyTall ? W.BIGDOOR : W.NONE;
    return anyTall || g.w >= 3 ? W.ARCH : W.NONE;
  }
  return W.WALL;
}
const SOLIDW = (t) => t === W.WALL || t === W.FULL;

// Openings (doors, arches, gaps) in the boundary of a room rect [x0,x1) x [z0,z1).
// Returns the interior cell next to each opening and the outward direction.
export function roomOpenings(zb, rect) {
  const out = [];
  const { x0, z0, x1, z1 } = rect;
  const open = (t) => t !== -1 && !W_BLOCKS.has(t);
  for (let x = x0; x < x1; x++) {
    if (open(edgeType(zb, x, z0, 'N'))) out.push({ x, z: z0, dx: 0, dz: -1 });
    if (open(edgeType(zb, x, z1, 'N'))) out.push({ x, z: z1 - 1, dx: 0, dz: 1 });
  }
  for (let z = z0; z < z1; z++) {
    if (open(edgeType(zb, x0, z, 'W'))) out.push({ x: x0, z, dx: -1, dz: 0 });
    if (open(edgeType(zb, x1, z, 'W'))) out.push({ x: x1 - 1, z, dx: 1, dz: 0 });
  }
  return out;
}

// Cells that must stay walkable: the cell inside every opening plus `depth` more cells inward.
export function clearMask(zb, rect, depth = 1) {
  const s = new Set();
  for (const o of roomOpenings(zb, rect)) {
    for (let k = 0; k <= depth; k++) {
      const x = o.x - o.dx * k, z = o.z - o.dz * k;
      s.add(key(x, z));
      // doors are often hit at an angle: keep the side cells of the first step clear as well
      if (k === 0) { s.add(key(x + (o.dz !== 0 ? 1 : 0), z + (o.dx !== 0 ? 1 : 0))); s.add(key(x - (o.dz !== 0 ? 1 : 0), z - (o.dx !== 0 ? 1 : 0))); }
    }
  }
  return s;
}

// The four boundary walls of a room as edge lists. side: 'N' | 'S' | 'W' | 'E'.
// Each edge: {x, z, e} where e is the owning cell edge ('N' or 'W') at (x, z) and inner is the
// index (0 = minus side, 1 = plus side) of the material facing into the room.
export function roomSide(rect, side) {
  const { x0, z0, x1, z1 } = rect;
  const edges = [];
  if (side === 'N') for (let x = x0; x < x1; x++) edges.push({ x, z: z0, e: 'N', inner: 1, cx: x, cz: z0 });
  if (side === 'S') for (let x = x0; x < x1; x++) edges.push({ x, z: z1, e: 'N', inner: 0, cx: x, cz: z1 - 1 });
  if (side === 'W') for (let z = z0; z < z1; z++) edges.push({ x: x0, z, e: 'W', inner: 1, cx: x0, cz: z });
  if (side === 'E') for (let z = z0; z < z1; z++) edges.push({ x: x1, z, e: 'W', inner: 0, cx: x1 - 1, cz: z });
  return edges;
}

// Is the whole side a solid wall that this zone owns (so its material may be changed)?
export function sideIsWall(zb, rect, side) {
  for (const ed of roomSide(rect, side)) {
    if (!zb.in(ed.x, ed.z)) return false;
    const t = zb.getWall(ed.x, ed.z, ed.e);
    if (t !== W.WALL && t !== W.FULL && t !== W.WINDOW) return false;
  }
  return true;
}

// Is the edge behind the interior cell `t` metres along a side a solid wall (no opening)?
export function solidAt(zb, rect, side, t) {
  const ed = roomSide(rect, side)[Math.max(0, Math.min(sideLen(rect, side) - 1, Math.floor(t)))];
  return !!ed && SOLIDW(edgeType(zb, ed.x, ed.z, ed.e));
}

// Repaint the room-facing side of a boundary wall (outer face untouched). Windows become wall.
// A side owned by the neighbouring zone gets a lining instead (see lineSide).
export function paintSide(zb, rect, side, mat, opts = {}) {
  if (!roomSide(rect, side).every((ed) => zb.in(ed.x, ed.z))) { lineSide(zb, rect, side, mat); return; }
  for (const ed of roomSide(rect, side)) {
    if (!zb.in(ed.x, ed.z)) continue;
    const i = zb.i(ed.x, ed.z);
    const t = ed.e === 'W' ? zb.wallW[i] : zb.wallN[i];
    if (!t) continue;
    const packed = ed.e === 'W' ? zb.wmW[i] : zb.wmN[i];
    let mm = packed & 0xffff, mp = packed >>> 16;
    if (ed.inner === 1) mp = mat; else mm = mat;
    const nt = opts.noWindows && t === W.WINDOW ? W.WALL : t;
    zb.setWall(ed.x, ed.z, ed.e, nt, mm, mp);
  }
}

// Line a side with thin non-colliding brushes of `mat` just in front of the wall face. Used for
// walls that belong to the neighbouring zone (their paint can't be changed from here). Door
// openings only get lined above the opening.
export function lineSide(zb, rect, side, mat) {
  const { x0, z0, x1, z1 } = rect;
  const T0 = 0.1, T1 = 0.125;
  for (const ed of roomSide(rect, side)) {
    const t = edgeType(zb, ed.x, ed.z, ed.e);
    const ci = zb.in(ed.cx, ed.cz) ? zb.i(ed.cx, ed.cz) : -1;
    if (ci < 0) continue;
    const f = zb.floor[ci], c = zb.ceil[ci];
    if (Number.isNaN(f) || Number.isNaN(c)) continue;
    let y0 = f;
    if (t === W.DOOR) y0 = f + 2.1; else if (t === W.BIGDOOR) y0 = f + 2.45; else if (t === W.ARCH) y0 = f + 2.6;
    else if (t <= 0 || t === W.LOW || t === W.RAIL || t === W.GLASS || t === W.HALF || t === W.PART) continue;
    if (y0 >= c - 0.01) continue;
    const o = { collide: false };
    if (side === 'N') zb.box(ed.x, y0, z0 + T0, ed.x + 1, c, z0 + T1, mat, { ...o, skip: 63 & ~16 });
    else if (side === 'S') zb.box(ed.x, y0, z1 - T1, ed.x + 1, c, z1 - T0, mat, { ...o, skip: 63 & ~32 });
    else if (side === 'W') zb.box(x0 + T0, y0, ed.z, x0 + T1, c, ed.z + 1, mat, { ...o, skip: 63 & ~1 });
    else zb.box(x1 - T1, y0, ed.z, x1 - T0, c, ed.z + 1, mat, { ...o, skip: 63 & ~2 });
  }
}

// Give every wall face that bounds the room from the inside a material: walls this zone owns are
// repainted, walls owned by the neighbour get a lining.
export function paintRoom(zb, rect, mat, opts) {
  for (const s of ['N', 'S', 'W', 'E']) paintSide(zb, rect, s, mat, opts);
}

// Unit vector pointing out of the room through a side, and the face name of decals on it.
export const SIDE_DIR = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
export const SIDE_FACE = { N: 'pz', S: 'nz', W: 'px', E: 'nx' };

// Point on the inner surface of a side, `t` metres along it from its start (x0 / z0), and the
// prop rotation that makes a model face into the room.
export function onSide(rect, side, t) {
  const { x0, z0, x1, z1 } = rect;
  const off = 0.1;
  if (side === 'N') return { x: x0 + t, z: z0 + off, rot: Math.PI };
  if (side === 'S') return { x: x0 + t, z: z1 - off, rot: 0 };
  if (side === 'W') return { x: x0 + off, z: z0 + t, rot: Math.PI / 2 };
  return { x: x1 - off, z: z0 + t, rot: -Math.PI / 2 };
}

export function sideLen(rect, side) { return side === 'N' || side === 'S' ? rect.x1 - rect.x0 : rect.z1 - rect.z0; }

// Number of openings on a side.
export function openingsOn(zb, rect, side) {
  const [dx, dz] = SIDE_DIR[side];
  return roomOpenings(zb, rect).filter((o) => o.dx === dx && o.dz === dz).length;
}

export function freeOf(zb, x, z) {
  if (!zb.in(x, z)) return false;
  const i = zb.i(x, z);
  return !zb.solid[i] && !Number.isNaN(zb.floor[i]) && !(zb.flags[i] & (CF.VOID | CF.GATE | CF.STAIRS));
}
