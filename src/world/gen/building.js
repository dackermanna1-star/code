// Building toolkit shared by houses, shops and civic buildings. All coordinates are Frame-local.
//
// Shell convention: footprint [0..W-1] x [0..D-1], local +Z = front. Exterior walls are 2 thick:
//   outer ring (x=0,W-1 / z=0,D-1) = facade material, inner ring (x=1,W-2 / z=1,D-2) = interior finish.
//   Interior cells are [2..W-3] x [2..D-3]. Floors are at y = baseY + k*storeyH (floor block), walls above.
// A floor plan is a list of room rects (interior coords); everything inside the interior that is not a room is a
// 1-thick partition wall. Doors are cut where two rooms face each other across a partition.
import { B, BLOCKS, SOLID, IS_DOOR } from '../blocks.js';

export const id = (n) => { const v = B[n]; if (v === undefined) throw new Error('unknown block ' + n); return v; };

/** Build exterior walls + floor slabs for `floors` storeys. Returns {W, D, floorsY: [...], topY} */
export function shell(fr, o) {
  const { W, D, floors = 1, storeyH = 4, baseY = 20 } = o;
  const outer = id(o.outer), inner = id(o.inner || 'wall_white');
  const floorsY = [];
  for (let f = 0; f < floors; f++) floorsY.push(baseY + f * storeyH);
  const topY = baseY + floors * storeyH; // ceiling / roof slab level
  // foundation / floors
  fr.fill(0, baseY, 0, W - 1, baseY, D - 1, id(o.foundation || 'concrete'));
  // walls
  fr.walls(0, baseY + 1, 0, W - 1, topY, D - 1, outer);
  fr.walls(1, baseY + 1, 1, W - 2, topY - 1, D - 2, inner);
  // interior air
  fr.fill(2, baseY + 1, 2, W - 3, topY - 1, D - 3, 0);
  // intermediate floor slabs + ceiling
  for (let f = 1; f < floors; f++) {
    const y = floorsY[f];
    fr.fill(1, y, 1, W - 2, y, D - 2, outer);
    fr.fill(2, y, 2, W - 3, y, D - 3, id(o.slab || 'planks_oak'));
  }
  fr.fill(1, topY, 1, W - 2, topY, D - 2, id(o.ceiling || 'wall_white'));
  return { W, D, floorsY, topY, storeyH, outer: o.outer, inner: o.inner || 'wall_white' };
}

/**
 * Carve a floor plan on the storey with floor block y. rooms: [{id, type, x0,z0,x1,z1, floor, wall}]
 * h = air height (storeyH - 1).
 */
export function carvePlan(fr, y, rooms, partition, h = 3, bounds = null) {
  const pid = id(partition);
  const b = bounds || { x0: 2, z0: 2, x1: fr.w - 3, z1: fr.d - 3 };
  fr.fill(b.x0, y + 1, b.z0, b.x1, y + h, b.z1, pid);
  for (const r of rooms) {
    fr.fill(r.x0, y + 1, r.z0, r.x1, y + h, r.z1, 0);
    if (r.floor) fr.fill(r.x0, y, r.z0, r.x1, y, r.z1, id(r.floor));
  }
}

/** Shared wall cells between rooms a and b (1-thick partition). Returns [{x, z, f}] where f = facing a->b axis */
export function sharedWall(a, b) {
  const out = [];
  const ovz = [Math.max(a.z0, b.z0), Math.min(a.z1, b.z1)];
  const ovx = [Math.max(a.x0, b.x0), Math.min(a.x1, b.x1)];
  if (a.x1 + 2 === b.x0 || b.x1 + 2 === a.x0) {
    const x = a.x1 + 2 === b.x0 ? a.x1 + 1 : b.x1 + 1;
    for (let z = ovz[0]; z <= ovz[1]; z++) out.push({ x, z, f: 3 });
  }
  if (a.z1 + 2 === b.z0 || b.z1 + 2 === a.z0) {
    const z = a.z1 + 2 === b.z0 ? a.z1 + 1 : b.z1 + 1;
    for (let x = ovx[0]; x <= ovx[1]; x++) out.push({ x, z, f: 0 });
  }
  return out;
}

/**
 * Connect two rooms through their shared partition. kind: 'door' | 'open' | 'wide'. Returns cell or null.
 * opts: {door: 'door_white', locked, open}
 */
export function connect(fr, y, a, b, kind, rng, opts = {}) {
  let cells = sharedWall(a, b);
  // both sides of the passage need a solid (non-stair) floor and air above
  const okSide = (x, z) => {
    const fl = fr.get(x, y, z);
    return SOLID[fl] && !BLOCKS[fl].name.startsWith('stairs') && fr.get(x, y + 1, z) === 0 && fr.get(x, y + 2, z) === 0;
  };
  cells = cells.filter((c) => (c.f === 3 ? okSide(c.x - 1, c.z) && okSide(c.x + 1, c.z) : okSide(c.x, c.z - 1) && okSide(c.x, c.z + 1)));
  if (!cells.length) return null;
  const inner = cells.length >= 3 ? cells.slice(1, -1) : cells;
  if (kind === 'door') {
    const c = rng.pick(inner);
    fr.door(c.x, y + 1, c.z, c.f === 3 ? 1 : 0, opts.door || 'door_white', { locked: opts.locked, open: opts.open ?? rng.chance(0.45) });
    return c;
  }
  const n = kind === 'wide' ? Math.min(inner.length, 4) : Math.min(inner.length, 2);
  const st = rng.int(0, inner.length - n);
  for (let k = 0; k < n; k++) {
    const c = inner[st + k];
    fr.opening(c.x, y + 1, c.z, Math.min(3, opts.h || 2));
    if ((opts.h || 2) < 3) fr.markOpening(c.x, y + 1, c.z);
  }
  return inner[st];
}

/** Try connecting room a to the first room in `targets` that shares a wall. */
export function connectAny(fr, y, a, targets, kind, rng, opts = {}) {
  for (const t of targets) {
    if (!t) continue;
    const c = connect(fr, y, a, t, kind, rng, opts);
    if (c) return { cell: c, room: t };
  }
  return null;
}

/** Which exterior sides does a room touch? (interior bounds) */
export function exteriorSides(r, b) {
  const s = [];
  if (r.z1 === b.z1) s.push('front');
  if (r.z0 === b.z0) s.push('back');
  if (r.x0 === b.x0) s.push('left');
  if (r.x1 === b.x1) s.push('right');
  return s;
}

/**
 * Exterior door for room r on side ('front'|'back'|'left'|'right') of a 2-thick shell (W x D).
 * pos: optional coordinate along the wall. Returns the outer door cell.
 */
export function exteriorDoor(fr, y, r, side, W, D, kind, rng, opts = {}, pos = null) {
  let x, z, ix, iz, f;
  const pick = (a0, a1) => (pos !== null ? pos : (a1 - a0 >= 2 ? rng.int(a0 + 1, a1 - 1) : rng.int(a0, a1)));
  if (side === 'front') { x = pick(r.x0, r.x1); z = D - 1; ix = x; iz = D - 2; f = 0; }
  else if (side === 'back') { x = pick(r.x0, r.x1); z = 0; ix = x; iz = 1; f = 2; }
  else if (side === 'left') { z = pick(r.z0, r.z1); x = 0; ix = 1; iz = z; f = 1; }
  else { z = pick(r.z0, r.z1); x = W - 1; ix = W - 2; iz = z; f = 3; }
  fr.opening(ix, y + 1, iz, 2);
  fr.door(x, y + 1, z, f, kind, opts);
  return { x, z, ix, iz, f, side };
}

/**
 * Windows along the exterior sides of a room (2 tall at y+1..y+2). Glass in the inner ring, outer ring open.
 * skip: Set of "x,z" outer cells to avoid (doors). Returns list of inner cells.
 */
export function roomWindows(fr, y, r, b, W, D, glass, rng, skip, o = {}) {
  const out = [];
  const g = id(glass);
  const sides = exteriorSides(r, b);
  const spacing = o.spacing || 3;
  const doIt = (cells) => {
    // cells: [{ox, oz, ix, iz}] along the wall
    const L = cells.length;
    if (L < 2) return;
    let idxs = [];
    if (o.continuous) { for (let k = 1; k < L - 1; k++) idxs.push(k); }
    else if (L <= 4) idxs = L === 4 ? [1, 2] : [Math.floor(L / 2)];
    else {
      for (let k = 1; k < L - 1; k += spacing) { idxs.push(k); if (o.pairs !== false && k + 1 < L - 1) idxs.push(k + 1); }
    }
    for (const k of idxs) {
      const c = cells[k];
      let blocked = false;
      for (const s of [-1, 0, 1]) {
        const n = cells[k + s];
        if (n && skip && skip.has(n.ox + ',' + n.oz)) blocked = true;
      }
      if (blocked) continue;
      for (let dy = 1; dy <= (o.tall || 2); dy++) {
        if (IS_DOOR[fr.get(c.ix, y + dy, c.iz)] || IS_DOOR[fr.get(c.ox, y + dy, c.oz)]) continue;
        fr.clear(c.ix, y + dy, c.iz, g);
        fr.clear(c.ox, y + dy, c.oz, o.flush ? g : 0);
      }
      out.push(c);
    }
  };
  if (sides.includes('front')) { const c = []; for (let x = r.x0; x <= r.x1; x++) c.push({ ox: x, oz: D - 1, ix: x, iz: D - 2, side: 'front' }); doIt(c); }
  if (sides.includes('back')) { const c = []; for (let x = r.x0; x <= r.x1; x++) c.push({ ox: x, oz: 0, ix: x, iz: 1, side: 'back' }); doIt(c); }
  if (sides.includes('left')) { const c = []; for (let z = r.z0; z <= r.z1; z++) c.push({ ox: 0, oz: z, ix: 1, iz: z, side: 'left' }); doIt(c); }
  if (sides.includes('right')) { const c = []; for (let z = r.z0; z <= r.z1; z++) c.push({ ox: W - 1, oz: z, ix: W - 2, iz: z, side: 'right' }); doIt(c); }
  return out;
}

/** Paint the wall surfaces facing room r (cells just outside its rect) with material, only over `over` ids. */
export function paintRoomWalls(fr, y, r, mat, h, over) {
  const m = id(mat);
  for (let dy = 1; dy <= h; dy++) {
    const yy = y + dy;
    for (let x = r.x0 - 1; x <= r.x1 + 1; x++) {
      for (const z of [r.z0 - 1, r.z1 + 1]) if (over.has(fr.get(x, yy, z))) fr.set(x, yy, z, m);
    }
    for (let z = r.z0; z <= r.z1; z++) {
      for (const x of [r.x0 - 1, r.x1 + 1]) if (over.has(fr.get(x, yy, z))) fr.set(x, yy, z, m);
    }
  }
}

/**
 * Gable roof over [0..W-1]x[0..D-1] starting at y (eave level = ceiling level), 1 block overhang.
 * alongX: ridge parallel to local X (slopes face front/back). gable: material for the gable ends.
 */
export function gableRoof(fr, W, D, y, roof, gable, alongX = true, o = {}) {
  const st = id('roof_' + roof + '_stairs'), sl = id('roof_' + roof + '_slab'), full = id('roof_' + roof);
  const g = id(gable);
  const L = alongX ? D : W; // span across slopes
  const ov = o.overhang ?? 1;
  for (let k = 0; ; k++) {
    const a = -ov + k, bb = L - 1 + ov - k, yy = y + k;
    if (a > bb) break;
    const along0 = -ov, along1 = (alongX ? W : D) - 1 + ov;
    for (let t = along0; t <= along1; t++) {
      if (a === bb) {
        // single ridge row
        put(t, yy, a, sl, 0);
        continue;
      }
      put(t, yy, a, st, alongX ? 2 : 1);
      put(t, yy, bb, st, alongX ? 0 : 3);
    }
    // gable triangle fill
    if (k >= 1) {
      for (let c = a + 1; c <= bb - 1; c++) {
        if (alongX) { set(0, yy, c, g); set(W - 1, yy, c, g); }
        else { set(c, yy, 0, g); set(c, yy, D - 1, g); }
      }
    }
    if (a === bb || a + 1 === bb) {
      if (a + 1 === bb && o.cap) for (let t = along0; t <= along1; t++) put(t, yy + 1, a, sl, 0);
      break;
    }
  }
  function put(t, yy, c, blk, f) {
    const [x, z] = alongX ? [t, c] : [c, t];
    fr.clear(x, yy, z, 0);
    fr.place(x, yy, z, blk, f);
  }
  function set(x, yy, z, blk) { fr.set(x, yy, z, blk); }
  void full;
}

/** Flat roof with parapet: roof slab at y over the footprint, parapet ring at y+1 (material) */
export function flatRoof(fr, W, D, y, parapet, o = {}) {
  fr.fill(0, y, 0, W - 1, y, D - 1, id(parapet));
  fr.fill(1, y, 1, W - 2, y, D - 2, id(o.roof || 'roof_tar'));
  if (o.parapetH !== 0) fr.walls(0, y + 1, 0, W - 1, y + (o.parapetH || 1), D - 1, id(parapet));
}

/**
 * Switchback stairwell occupying local box [x0..x0+3] x [z0..z0+storeyH+2] (walls included).
 * Interior columns A = x0+1, B = x0+2; interior z = z0+1 .. z0+storeyH+1 (landings at both ends).
 * levels: number of floors to connect (floor k at baseY + k*storeyH). Doors on the +x side (x0+3) at landings.
 * Even levels have their landing at the south (high z) end, odd levels at the north end.
 * Returns door positions [{x, z, y}] per level (cells in the wall at x0+3).
 */
export function stairwell(fr, x0, z0, baseY, storeyH, levels, o = {}) {
  const H = storeyH;
  const wallM = id(o.wall || 'concrete'), floorM = id(o.floor || 'concrete'), stair = o.stair || 'stairs_concrete';
  const zi0 = z0 + 1, zi1 = z0 + H + 1; // interior z range (H+1 cells)
  const A = x0 + 1, Bc = x0 + 2;
  const topY = baseY + (levels - 1) * H;
  const roofY = topY + H;
  fr.walls(x0, baseY + 1, z0, x0 + 3, roofY + (o.extra || 0), z0 + H + 2, wallM);
  fr.fill(A, baseY, zi0, Bc, baseY, zi1, floorM);
  fr.fill(A, baseY + 1, zi0, Bc, roofY + (o.extra || 0) - 1, zi1, 0);
  // floor plates at each level >= 1 (solid), carve wells later
  for (let L = 1; L < levels; L++) fr.fill(A, baseY + L * H, zi0, Bc, baseY + L * H, zi1, floorM);
  if (o.roofCap !== false) fr.fill(x0, roofY + (o.extra || 0), z0, x0 + 3, roofY + (o.extra || 0), z0 + H + 2, wallM);
  const doors = [];
  for (let L = 0; L < levels - 1; L++) {
    const y = baseY + L * H;
    const even = L % 2 === 0;
    const col = even ? A : Bc;
    // flight cells: H steps. even: from zi1-1 going north to zi0 ... wait: H steps from z = zi1-1 down to zi1-H
    for (let s = 1; s <= H; s++) {
      const z = even ? zi1 - s : zi0 + s;
      fr.clear(col, y + s, z, 0);
      fr.place(col, y + s, z, stair, even ? 0 : 2);
      // under-stair fill
      for (let yy = y + 1; yy < y + s; yy++) fr.set(col, yy, z, wallM);
      // headroom: carve the next floor plate above stairs whose height >= y + H - 2
      if (s >= H - 2 && s < H) { fr.clear(col, y + H, z, 0); }
    }
  }
  for (let L = 0; L < levels; L++) {
    const y = baseY + L * H;
    const z = L % 2 === 0 ? zi1 : zi0;
    doors.push({ x: x0 + 3, z, y });
  }
  return { doors, roofY: roofY + (o.extra || 0), topY };
}

export const PARTITION_SET = (names) => new Set(names.map((n) => B[n]));
export { B, BLOCKS, SOLID };
