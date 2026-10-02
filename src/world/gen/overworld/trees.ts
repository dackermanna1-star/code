/**
 * Tree shapes — ports of Minecraft 1.18-1.20 trunk & foliage placers.
 *
 * Every generator is a pure function of (base position, seed): it computes the whole tree and
 * writes through a `ChunkWriter`, which only keeps blocks inside the chunk being generated. RNG is
 * consumed identically no matter which chunk is being generated, so a tree crossing chunk borders is
 * reproduced exactly by each chunk it touches. Leaves use meta 0; logs use axis meta (0 y, 1 x, 2 z).
 */
import { Rng } from '../../../core/rng';
import { ST as ST_, withAxis as withAxis_, IS_SOLID as IS_SOLID_, IS_LOG as IS_LOG_, IS_LEAVES as IS_LEAVES_ } from '../common/states';
import { S } from '../../blocks/registry';
import type { ChunkWriter } from '../common/writer';

const ST = ST_;
const withAxis = withAxis_;
const IS_SOLID = IS_SOLID_;
const IS_LOG = IS_LOG_;
const IS_LEAVES = IS_LEAVES_;
/** Boulders may replace terrain and plants, never trees. */
const BOULDER_REPLACEABLE = new Uint8Array(4096);
for (let id = 0; id < 4096; id++) BOULDER_REPLACEABLE[id] = IS_LOG[id] || IS_LEAVES[id] ? 0 : 1;

export const TreeKind = {
  OAK: 0,
  FANCY_OAK: 1,
  BIRCH: 2,
  TALL_BIRCH: 3,
  SPRUCE: 4,
  PINE: 5,
  MEGA_SPRUCE: 6,
  MEGA_PINE: 7,
  JUNGLE: 8,
  MEGA_JUNGLE: 9,
  JUNGLE_BUSH: 10,
  ACACIA: 11,
  DARK_OAK: 12,
  CHERRY: 13,
  SWAMP_OAK: 14,
  BROWN_MUSHROOM: 15,
  RED_MUSHROOM: 16,
  BEE_OAK: 17,
} as const;
export type TreeKind = (typeof TreeKind)[keyof typeof TreeKind];

/** Max horizontal reach (blocks) from the base column, for culling. Must stay <= 15. */
export const TREE_REACH: number[] = [3, 9, 3, 3, 4, 3, 6, 6, 3, 11, 3, 6, 6, 8, 4, 4, 3, 3];
/** Trees with a 2x2 trunk (base = north-west column). */
export const TREE_LARGE: boolean[] = [false, false, false, false, false, false, true, true, false, true, false, false, true, false, false, false, false, false];

// vine meta bits = attached face: 1 south, 2 west, 4 north, 8 east
const VINE_S = 1, VINE_W = 2, VINE_N = 4, VINE_E = 8;
const VINE_STATE = S('vine', 0);

// ------------------------------------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------------------------------------

function dirtBelow(w: ChunkWriter, x: number, y: number, z: number): void {
  const s = w.get(x, y, z);
  if (s === ST.grass || s === ST.mycelium || s === ST.snowBlock || s === ST.powderSnow) w.set(x, y, z, ST.dirt);
  else if (s === 0 || s === ST.water) {
    // uneven ground under a 2x2 trunk: fill a few blocks of dirt so the trunk never floats
    for (let d = 0; d < 4; d++) {
      const t = w.get(x, y - d, z);
      if (t === -1 || (t !== 0 && t !== ST.water)) break;
      w.set(x, y - d, z, ST.dirt);
    }
  }
}

type SkipFn = (r: Rng, lx: number, ly: number, lz: number, range: number, large: boolean) => boolean;

/** Minecraft FoliagePlacer.placeLeavesRow (signed offsets for large trunks). */
function leavesRow(w: ChunkWriter, r: Rng, cx: number, cy: number, cz: number, range: number, ly: number, large: boolean, leaf: number, skip: SkipFn, placed?: number[]): void {
  const e = large ? 1 : 0;
  for (let dx = -range; dx <= range + e; dx++) {
    for (let dz = -range; dz <= range + e; dz++) {
      const ax = large ? Math.min(Math.abs(dx), Math.abs(dx - 1)) : Math.abs(dx);
      const az = large ? Math.min(Math.abs(dz), Math.abs(dz - 1)) : Math.abs(dz);
      if (skip(r, ax, ly, az, range, large)) continue;
      const x = cx + dx, y = cy + ly, z = cz + dz;
      w.leaf(x, y, z, leaf);
      if (placed) placed.push(x, y, z);
    }
  }
}

const blobSkip: SkipFn = (r, lx, ly, lz, range) => lx === range && lz === range && (r.int(2) === 0 || ly === 0);
const spruceSkip: SkipFn = (_r, lx, _ly, lz, range) => lx === range && lz === range && range > 0;
const megaPineSkip: SkipFn = (_r, lx, _ly, lz, range) => (lx + lz >= 7 ? true : lx * lx + lz * lz > range * range);
const bushSkip: SkipFn = (r, lx, _ly, lz, range) => lx === range && lz === range && r.int(2) === 0;
const fancySkip: SkipFn = (_r, lx, _ly, lz, range) => (lx + 0.5) * (lx + 0.5) + (lz + 0.5) * (lz + 0.5) > range * range;
const acaciaSkip: SkipFn = (_r, lx, ly, lz, range) => (ly === 0 ? (lx > 1 || lz > 1) && lx !== 0 && lz !== 0 : lx === range && lz === range && range > 0);

/** Vines hanging from (x,y,z) downwards (Minecraft addHangingVine). `face` = attached face bit. */
function hangingVine(w: ChunkWriter, x: number, y: number, z: number, face: number): void {
  if (w.get(x, y, z) !== 0) return;
  w.set(x, y, z, VINE_STATE | face);
  for (let i = 4; i > 0; i--) {
    y--;
    if (w.get(x, y, z) !== 0) break;
    w.set(x, y, z, VINE_STATE | face);
  }
}

/** LeaveVineDecorator: random hanging vines on the outside of leaves. */
function leafVines(w: ChunkWriter, r: Rng, leaves: number[], p: number): void {
  for (let i = 0; i < leaves.length; i += 3) {
    const x = leaves[i], y = leaves[i + 1], z = leaves[i + 2];
    if (r.next() < p) hangingVine(w, x - 1, y, z, VINE_E);
    if (r.next() < p) hangingVine(w, x + 1, y, z, VINE_W);
    if (r.next() < p) hangingVine(w, x, y, z - 1, VINE_S);
    if (r.next() < p) hangingVine(w, x, y, z + 1, VINE_N);
  }
}

/** TrunkVineDecorator. */
function trunkVines(w: ChunkWriter, r: Rng, logs: number[]): void {
  for (let i = 0; i < logs.length; i += 3) {
    const x = logs[i], y = logs[i + 1], z = logs[i + 2];
    if (r.int(3) > 0 && w.get(x - 1, y, z) === 0) w.set(x - 1, y, z, VINE_STATE | VINE_E);
    if (r.int(3) > 0 && w.get(x + 1, y, z) === 0) w.set(x + 1, y, z, VINE_STATE | VINE_W);
    if (r.int(3) > 0 && w.get(x, y, z - 1) === 0) w.set(x, y, z - 1, VINE_STATE | VINE_S);
    if (r.int(3) > 0 && w.get(x, y, z + 1) === 0) w.set(x, y, z + 1, VINE_STATE | VINE_N);
  }
}

// ------------------------------------------------------------------------------------------------
// straight-trunk trees
// ------------------------------------------------------------------------------------------------

function straightTrunk(w: ChunkWriter, x: number, y: number, z: number, h: number, log: number, logs?: number[]): void {
  dirtBelow(w, x, y - 1, z);
  for (let i = 0; i < h; i++) {
    w.log(x, y + i, z, log);
    if (logs) logs.push(x, y + i, z);
  }
}

/** BlobFoliagePlacer(radius, offset 0, height 3). */
function blobFoliage(w: ChunkWriter, r: Rng, x: number, ay: number, z: number, radius: number, leaf: number, placed?: number[]): void {
  for (let i = 0; i >= -3; i--) {
    const j = Math.max(radius - 1 - Math.trunc(i / 2), 0);
    leavesRow(w, r, x, ay, z, j, i, false, leaf, blobSkip, placed);
  }
}

function oak(w: ChunkWriter, r: Rng, x: number, y: number, z: number, log: number, leaf: number, base: number, rand1: number, rand2: number): void {
  const h = base + r.int(rand1 + 1) + r.int(rand2 + 1);
  straightTrunk(w, x, y, z, h, log);
  blobFoliage(w, r, x, y + h, z, 2, leaf);
}

function swampOak(w: ChunkWriter, r: Rng, x: number, y: number, z: number): void {
  const h = 5 + r.int(4);
  straightTrunk(w, x, y, z, h, ST.oakLog);
  const placed: number[] = [];
  blobFoliage(w, r, x, y + h, z, 3, ST.oakLeaves, placed);
  leafVines(w, r, placed, 0.25);
}

function jungleTree(w: ChunkWriter, r: Rng, x: number, y: number, z: number): void {
  const h = 4 + r.int(9);
  const logs: number[] = [];
  straightTrunk(w, x, y, z, h, ST.jungleLog, logs);
  const placed: number[] = [];
  blobFoliage(w, r, x, y + h, z, 2, ST.jungleLeaves, placed);
  trunkVines(w, r, logs);
  leafVines(w, r, placed, 0.25);
}

function jungleBush(w: ChunkWriter, r: Rng, x: number, y: number, z: number): void {
  straightTrunk(w, x, y, z, 1, ST.jungleLog);
  const ay = y + 1;
  for (let i = 1; i >= -1; i--) leavesRow(w, r, x, ay, z, 2 - 1 - i, i, false, ST.oakLeaves, bushSkip);
}

function spruce(w: ChunkWriter, r: Rng, x: number, y: number, z: number): void {
  const h = 5 + r.int(3) + r.int(2);
  const radius = 2 + r.int(2);
  const offset = r.int(3);
  const trunkH = 1 + r.int(2);
  const fh = Math.max(4, h - trunkH);
  straightTrunk(w, x, y, z, h, ST.spruceLog);
  const ay = y + h;
  let i = r.int(2), j = 1, k = 0;
  for (let l = offset; l >= -fh; l--) {
    leavesRow(w, r, x, ay, z, i, l, false, ST.spruceLeaves, spruceSkip);
    if (i >= j) {
      i = k;
      k = 1;
      j = Math.min(j + 1, radius);
    } else i++;
  }
}

function pine(w: ChunkWriter, r: Rng, x: number, y: number, z: number): void {
  const h = 6 + r.int(5);
  const radius = 1 + r.int(2);
  const fh = 3 + r.int(2);
  straightTrunk(w, x, y, z, h, ST.spruceLog);
  const ay = y + h;
  const offset = 1;
  let i = 0;
  for (let j = offset; j >= offset - fh; j--) {
    leavesRow(w, r, x, ay, z, i, j, false, ST.spruceLeaves, spruceSkip);
    if (i >= 1 && j === offset - fh + 1) i--;
    else if (i < radius) i++;
  }
}

function birch(w: ChunkWriter, r: Rng, x: number, y: number, z: number, tall: boolean): void {
  const h = 5 + r.int(3) + (tall ? r.int(7) : 0);
  straightTrunk(w, x, y, z, h, ST.birchLog);
  blobFoliage(w, r, x, y + h, z, 2, ST.birchLeaves);
}

// ------------------------------------------------------------------------------------------------
// giant (2x2) trees
// ------------------------------------------------------------------------------------------------

function giantTrunk(w: ChunkWriter, x: number, y: number, z: number, h: number, log: number, logs?: number[]): void {
  dirtBelow(w, x, y - 1, z);
  dirtBelow(w, x + 1, y - 1, z);
  dirtBelow(w, x, y - 1, z + 1);
  dirtBelow(w, x + 1, y - 1, z + 1);
  for (let i = 0; i < h; i++) {
    for (let d = 0; d < 4; d++) {
      const lx = x + (d & 1), lz = z + (d >> 1);
      w.log(lx, y + i, lz, log);
      if (logs && (i & 1) === 0) logs.push(lx, y + i, lz);
    }
  }
}

function megaSpruce(w: ChunkWriter, r: Rng, x: number, y: number, z: number, pineCrown: boolean): void {
  const h = 13 + r.int(3) + r.int(15);
  const fh = pineCrown ? 3 + r.int(5) : 13 + r.int(5);
  giantTrunk(w, x, y, z, h, ST.spruceLog);
  const ay = y + h;
  let prev = 0;
  for (let j = ay - fh; j <= ay; j++) {
    const k = ay - j;
    const l = Math.floor((k / fh) * 3.5);
    const range = k > 0 && l === prev && (j & 1) === 0 ? l + 1 : l;
    leavesRow(w, r, x, j, z, range, 0, true, ST.spruceLeaves, megaPineSkip);
    prev = l;
  }
  // AlterGroundDecorator: podzol around the trunk (5x5 disc around each trunk column, rounded)
  for (let d = 0; d < 4; d++) {
    const tx = x + (d & 1) * 1, tz = z + (d >> 1) * 1;
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        if ((Math.abs(dx) === 2 || Math.abs(dz) === 2) && r.int(5) === 0) continue;
        podzolAt(w, tx + dx, y, tz + dz);
      }
  }
}

/** Turn the top ground block near y into podzol (searching a few blocks up/down in the column). */
function podzolAt(w: ChunkWriter, x: number, y: number, z: number): void {
  for (let yy = y + 2; yy >= y - 3; yy--) {
    const s = w.get(x, yy, z);
    if (s === -1) return;
    if (s === ST.grass || s === ST.dirt || s === ST.coarseDirt || s === ST.podzol) {
      const above = w.get(x, yy + 1, z);
      if (above === 0 || !IS_SOLID[above >>> 4] || above >>> 4 === ST.spruceLog >>> 4) w.set(x, yy, z, ST.podzol);
      return;
    }
    if (s !== 0 && IS_SOLID[s >>> 4] && s >>> 4 !== ST.spruceLog >>> 4) return;
  }
}

function megaJungle(w: ChunkWriter, r: Rng, x: number, y: number, z: number): void {
  const h = 10 + r.int(3) + r.int(20);
  const logs: number[] = [];
  giantTrunk(w, x, y, z, h, ST.jungleLog, logs);
  const atts: number[] = []; // x, y, z, radiusOffset
  for (let i = h - 2 - r.int(4); i > h / 2; i -= 2 + r.int(4)) {
    const f = r.next() * Math.PI * 2;
    let j = 0, k = 0;
    for (let l = 0; l < 5; l++) {
      j = Math.trunc(1.5 + Math.cos(f) * l);
      k = Math.trunc(1.5 + Math.sin(f) * l);
      const ax = Math.abs(j - 0.5) > Math.abs(k - 0.5) ? 1 : 2;
      w.log(x + j, y + i - 3 + (l >> 1), z + k, withAxis(ST.jungleLog, l === 0 ? 0 : ax));
    }
    atts.push(x + j, y + i, z + k, -2);
  }
  const placed: number[] = [];
  // top canopy (double trunk, height 2)
  const ay = y + h;
  for (let j = 0; j >= -2; j--) leavesRow(w, r, x, ay, z, 2 + 1 - j, j, true, ST.jungleLeaves, megaPineSkip, placed);
  for (let a = 0; a < atts.length; a += 4) {
    const n = 1 + r.int(2);
    for (let j = 0; j >= -n; j--) leavesRow(w, r, atts[a], atts[a + 1], atts[a + 2], 2 + atts[a + 3] + 1 - j, j, false, ST.jungleLeaves, megaPineSkip, placed);
  }
  trunkVines(w, r, logs);
  leafVines(w, r, placed, 0.25);
}

function darkOak(w: ChunkWriter, r: Rng, x: number, y: number, z: number): void {
  const h = 6 + r.int(3) + r.int(2);
  dirtBelow(w, x, y - 1, z);
  dirtBelow(w, x + 1, y - 1, z);
  dirtBelow(w, x, y - 1, z + 1);
  dirtBelow(w, x + 1, y - 1, z + 1);
  const dir = r.int(4);
  const ddx = [0, -1, 0, 1][dir], ddz = [1, 0, -1, 0][dir];
  const i0 = h - r.int(4);
  let lean = 2 - r.int(3);
  let tx = x, tz = z;
  const top = y + h - 1;
  for (let i = 0; i < h; i++) {
    if (i >= i0 && lean > 0) {
      tx += ddx;
      tz += ddz;
      lean--;
    }
    const yy = y + i;
    w.log(tx, yy, tz, ST.darkOakLog);
    w.log(tx + 1, yy, tz, ST.darkOakLog);
    w.log(tx, yy, tz + 1, ST.darkOakLog);
    w.log(tx + 1, yy, tz + 1, ST.darkOakLog);
  }
  const atts: number[] = [];
  for (let l2 = -1; l2 <= 2; l2++) {
    for (let i3 = -1; i3 <= 2; i3++) {
      if ((l2 < 0 || l2 > 1 || i3 < 0 || i3 > 1) && r.int(3) <= 0) {
        const n = r.int(3) + 2;
        for (let k2 = 0; k2 < n; k2++) w.log(x + l2, top - k2 - 1, z + i3, ST.darkOakLog);
        atts.push(tx + l2, top, tz + i3);
      }
    }
  }
  // main canopy (double trunk)
  const skipLarge = (rr: Rng, lx: number, ly: number, lz: number, range: number): boolean => {
    if (ly === 1) return lx + lz > range * 2 - 2;
    return false;
  };
  const rowLarge = (range: number, ly: number) => {
    for (let dx = -range; dx <= range + 1; dx++)
      for (let dz = -range; dz <= range + 1; dz++) {
        if (ly === 0 && (dx === -range || dx >= range) && (dz === -range || dz >= range)) continue;
        const ax = Math.min(Math.abs(dx), Math.abs(dx - 1)), az = Math.min(Math.abs(dz), Math.abs(dz - 1));
        if (skipLarge(r, ax, ly, az, range)) continue;
        w.leaf(tx + dx, top + ly, tz + dz, ST.darkOakLeaves);
      }
  };
  rowLarge(2, -1);
  rowLarge(3, 0);
  rowLarge(2, 1);
  if (r.next() < 0.5) rowLarge(0, 2);
  for (let a = 0; a < atts.length; a += 3) {
    leavesRow(w, r, atts[a], atts[a + 1], atts[a + 2], 2, -1, false, ST.darkOakLeaves, (_r, lx, ly, lz, range) => ly === -1 && lx === range && lz === range);
    leavesRow(w, r, atts[a], atts[a + 1], atts[a + 2], 1, 0, false, ST.darkOakLeaves, () => false);
  }
}

// ------------------------------------------------------------------------------------------------
// fancy oak
// ------------------------------------------------------------------------------------------------

function treeShape(height: number, y: number): number {
  if (y < height * 0.3) return -1;
  const f = height / 2;
  const f1 = f - y;
  let f2 = Math.sqrt(f * f - f1 * f1);
  if (f1 === 0) f2 = f;
  else if (Math.abs(f1) >= f) return 0;
  return f2 * 0.5;
}

function limb(w: ChunkWriter, fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, log: number): void {
  const dx = tx - fx, dy = ty - fy, dz = tz - fz;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  if (steps === 0) {
    w.log(fx, fy, fz, log);
    return;
  }
  const sx = dx / steps, sy = dy / steps, sz = dz / steps;
  for (let j = 0; j <= steps; j++) {
    const bx = fx + Math.floor(0.5 + j * sx), by = fy + Math.floor(0.5 + j * sy), bz = fz + Math.floor(0.5 + j * sz);
    const ax = Math.abs(bx - fx), az = Math.abs(bz - fz);
    const k = Math.max(ax, az);
    const axis = k > 0 ? (ax === k ? 1 : 2) : 0;
    w.log(bx, by, bz, withAxis(log, axis));
  }
}

function fancyOak(w: ChunkWriter, r: Rng, x: number, y: number, z: number, log: number, leaf: number): void {
  const height = 3 + r.int(12);
  const j = height + 2;
  const k = Math.floor(j * 0.618);
  dirtBelow(w, x, y - 1, z);
  const l = Math.min(1, Math.floor(1.382 + Math.pow(j / 13, 2)));
  const i1 = y + k;
  let j1 = j - 5;
  const coords: number[] = [x, y + j1, z, i1]; // attachment x,y,z + branch base y
  for (; j1 >= 0; j1--) {
    const f = treeShape(j, j1);
    if (f < 0) continue;
    for (let k1 = 0; k1 < l; k1++) {
      const d2 = f * (r.next() + 0.328);
      const d3 = r.next() * 2 * Math.PI;
      const bx = x + Math.floor(d2 * Math.sin(d3) + 0.5);
      const bz = z + Math.floor(d2 * Math.cos(d3) + 0.5);
      const by = y + j1 - 1;
      const l1 = x - bx, i2 = z - bz;
      const d6 = by - Math.sqrt(l1 * l1 + i2 * i2) * 0.381;
      const j2 = d6 > i1 ? i1 : Math.trunc(d6);
      coords.push(bx, by, bz, j2);
    }
  }
  limb(w, x, y, z, x, y + k, z, log);
  for (let c = 0; c < coords.length; c += 4) {
    const base = coords[c + 3];
    const ax = coords[c], ay = coords[c + 1], az = coords[c + 2];
    const trimmed = base - y >= j * 0.2;
    if (!(x === ax && base === ay && z === az) && trimmed) limb(w, x, base, z, ax, ay, az, log);
  }
  for (let c = 0; c < coords.length; c += 4) {
    if (coords[c + 3] - y < j * 0.2) continue;
    const ax = coords[c], ay = coords[c + 1], az = coords[c + 2];
    for (let i = 4; i >= 0; i--) {
      const rad = 2 + (i !== 4 && i !== 0 ? 1 : 0);
      leavesRow(w, r, ax, ay, az, rad, i, false, leaf, fancySkip);
    }
  }
}

// ------------------------------------------------------------------------------------------------
// acacia
// ------------------------------------------------------------------------------------------------

const HDX = [0, -1, 0, 1];
const HDZ = [1, 0, -1, 0];

function acacia(w: ChunkWriter, r: Rng, x: number, y: number, z: number): void {
  const h = 5 + r.int(3) + r.int(3);
  dirtBelow(w, x, y - 1, z);
  const dir = r.int(4);
  const i = h - r.int(4) - 1;
  let j = 3 - r.int(3);
  let k = x, l = z;
  let topY = -1;
  for (let i1 = 0; i1 < h; i1++) {
    if (i1 >= i && j > 0) {
      k += HDX[dir];
      l += HDZ[dir];
      j--;
    }
    w.log(k, y + i1, l, ST.acaciaLog);
    topY = y + i1 + 1;
  }
  const atts: number[] = [k, topY, l, 1];
  k = x;
  l = z;
  const dir2 = r.int(4);
  if (dir2 !== dir) {
    const j2 = i - r.int(2) - 1;
    let k1 = 1 + r.int(3);
    let att = -1;
    for (let l1 = j2; l1 < h && k1 > 0; k1--) {
      if (l1 >= 1) {
        const i2 = y + l1;
        k += HDX[dir2];
        l += HDZ[dir2];
        w.log(k, i2, l, ST.acaciaLog);
        att = i2 + 1;
      }
      l1++;
    }
    if (att >= 0) atts.push(k, att, l, 0);
  }
  for (let a = 0; a < atts.length; a += 4) {
    const ax = atts[a], ay = atts[a + 1], az = atts[a + 2], ro = atts[a + 3];
    leavesRow(w, r, ax, ay, az, 2 + ro, -1, false, ST.acaciaLeaves, acaciaSkip);
    leavesRow(w, r, ax, ay, az, 1, 0, false, ST.acaciaLeaves, acaciaSkip);
    leavesRow(w, r, ax, ay, az, 2 + ro - 1, 0, false, ST.acaciaLeaves, acaciaSkip);
  }
}

// ------------------------------------------------------------------------------------------------
// cherry
// ------------------------------------------------------------------------------------------------

function cherry(w: ChunkWriter, r: Rng, x: number, y: number, z: number): void {
  const height = 7 + r.int(2);
  dirtBelow(w, x, y - 1, z);
  const i = Math.max(0, height - 1 + (r.int(2) - 4));
  let j = Math.max(0, height - 1 + (r.int(2) - 4));
  if (j >= i) j++;
  const branches = 1 + r.int(3);
  const three = branches === 3;
  const two = branches >= 2;
  const l = three ? height : two ? Math.max(i, j) + 1 : i + 1;
  for (let i1 = 0; i1 < l; i1++) w.log(x, y + i1, z, ST.cherryLog);
  const atts: number[] = [];
  if (three) atts.push(x, y + l, z);
  const dir = r.int(4);
  const axis = HDX[dir] !== 0 ? 1 : 2;
  const branch = (d: number, startY: number, logAtStart: boolean) => {
    let mx = x, my = y + startY, mz = z;
    const endOff = height - 1 + (r.int(2) - 1);
    const flag = logAtStart || endOff < startY;
    const len = 2 + r.int(3) + (flag ? 1 : 0);
    const tx = x + HDX[d] * len, ty = y + endOff, tz = z + HDZ[d] * len;
    const k = flag ? 2 : 1;
    for (let q = 0; q < k; q++) {
      mx += HDX[d];
      mz += HDZ[d];
      w.log(mx, my, mz, withAxis(ST.cherryLog, axis));
    }
    const up = ty > my ? 1 : -1;
    for (let guard = 0; guard < 32; guard++) {
      const dist = Math.abs(tx - mx) + Math.abs(ty - my) + Math.abs(tz - mz);
      if (dist === 0) {
        atts.push(tx, ty + 1, tz);
        return;
      }
      const f = Math.abs(ty - my) / dist;
      const vertical = r.next() < f;
      if (vertical) my += up;
      else {
        mx += HDX[d];
        mz += HDZ[d];
      }
      w.log(mx, my, mz, vertical ? ST.cherryLog : withAxis(ST.cherryLog, axis));
    }
  };
  branch(dir, i, i < l - 1);
  if (two) branch((dir + 2) & 3, j, j < l - 1);
  for (let a = 0; a < atts.length; a += 3) cherryCanopy(w, r, atts[a], atts[a + 1], atts[a + 2]);
}

function cherryCanopy(w: ChunkWriter, r: Rng, x: number, y: number, z: number): void {
  const R = 3;
  const skip = (lx: number, ly: number, lz: number, range: number): boolean => {
    if (ly === -1 && (lx === range || lz === range) && r.next() < 0.25) return true;
    const corner = lx === range && lz === range;
    if (range > 2) return corner || (lx + lz > range * 2 - 2 && r.next() < 0.25);
    return corner && r.next() < 0.25;
  };
  const row = (range: number, ly: number, hanging: boolean) => {
    for (let dx = -range; dx <= range; dx++)
      for (let dz = -range; dz <= range; dz++) {
        const ax = Math.abs(dx), az = Math.abs(dz);
        if (skip(ax, ly, az, range)) continue;
        const px = x + dx, py = y + ly, pz = z + dz;
        w.leaf(px, py, pz, ST.cherryLeaves);
        if (hanging && (ax === range || az === range) && r.next() < 1 / 6) {
          w.leaf(px, py - 1, pz, ST.cherryLeaves);
          if (r.next() < 1 / 3) w.leaf(px, py - 2, pz, ST.cherryLeaves);
        }
      }
  };
  row(R - 2, 2, false);
  row(R - 1, 1, false);
  row(R, 0, false);
  row(R, -1, true);
  row(R - 1, -2, true);
}

// ------------------------------------------------------------------------------------------------
// huge mushrooms
// ------------------------------------------------------------------------------------------------

function hugeMushroom(w: ChunkWriter, r: Rng, x: number, y: number, z: number, red: boolean): void {
  let h = r.int(3) + 4;
  if (r.int(12) === 0) h *= 2;
  const stem = ST.mushroomStem || ST.oakLog;
  const cap = red ? ST.redMushroomBlock || ST.redTerracotta : ST.brownMushroomBlock || ST.brownTerracotta;
  for (let i = 0; i < h; i++) w.log(x, y + i, z, stem);
  if (red) {
    for (let i = h - 3; i <= h; i++) {
      const j = i < h ? 2 : 1;
      for (let dx = -j; dx <= j; dx++)
        for (let dz = -j; dz <= j; dz++) {
          const ex = dx === -j || dx === j, ez = dz === -j || dz === j;
          if (i >= h || ex !== ez) w.leaf(x + dx, y + i, z + dz, cap);
        }
    }
  } else {
    const R = 3;
    for (let dx = -R; dx <= R; dx++)
      for (let dz = -R; dz <= R; dz++) {
        if (Math.abs(dx) === R && Math.abs(dz) === R) continue;
        w.leaf(x + dx, y + h, z + dz, cap);
      }
  }
}

// ------------------------------------------------------------------------------------------------
// dispatcher
// ------------------------------------------------------------------------------------------------

export function growTree(kind: TreeKind, w: ChunkWriter, x: number, y: number, z: number, seed: number): void {
  const r = new Rng(seed);
  switch (kind) {
    case TreeKind.OAK: return oak(w, r, x, y, z, ST.oakLog, ST.oakLeaves, 4, 2, 0);
    case TreeKind.BEE_OAK: return oak(w, r, x, y, z, ST.oakLog, ST.oakLeaves, 5, 2, 0);
    case TreeKind.FANCY_OAK: return fancyOak(w, r, x, y, z, ST.oakLog, ST.oakLeaves);
    case TreeKind.BIRCH: return birch(w, r, x, y, z, false);
    case TreeKind.TALL_BIRCH: return birch(w, r, x, y, z, true);
    case TreeKind.SPRUCE: return spruce(w, r, x, y, z);
    case TreeKind.PINE: return pine(w, r, x, y, z);
    case TreeKind.MEGA_SPRUCE: return megaSpruce(w, r, x, y, z, false);
    case TreeKind.MEGA_PINE: return megaSpruce(w, r, x, y, z, true);
    case TreeKind.JUNGLE: return jungleTree(w, r, x, y, z);
    case TreeKind.MEGA_JUNGLE: return megaJungle(w, r, x, y, z);
    case TreeKind.JUNGLE_BUSH: return jungleBush(w, r, x, y, z);
    case TreeKind.ACACIA: return acacia(w, r, x, y, z);
    case TreeKind.DARK_OAK: return darkOak(w, r, x, y, z);
    case TreeKind.CHERRY: return cherry(w, r, x, y, z);
    case TreeKind.SWAMP_OAK: return swampOak(w, r, x, y, z);
    case TreeKind.BROWN_MUSHROOM: return hugeMushroom(w, r, x, y, z, false);
    case TreeKind.RED_MUSHROOM: return hugeMushroom(w, r, x, y, z, true);
  }
}

// ------------------------------------------------------------------------------------------------
// other shaped features
// ------------------------------------------------------------------------------------------------

/** Minecraft IceSpikeFeature (packed ice spike, occasionally very tall). Base = on top of the ground. */
export function iceSpike(w: ChunkWriter, x: number, y: number, z: number, seed: number): void {
  const r = new Rng(seed);
  let py = y + r.int(4);
  const i = r.int(4) + 7;
  const j = (i >> 2) + r.int(2);
  if (j > 1 && r.int(60) === 0) py += 10 + r.int(30);
  const ok = (s: number) => s === 0 || s === ST.snowBlock || s === ST.ice || s === ST.dirt || s === ST.grass || s === ST.snowLayer || s === ST.packedIce;
  for (let k = 0; k < i; k++) {
    const f = (1 - k / i) * j;
    const l = Math.ceil(f);
    for (let i1 = -l; i1 <= l; i1++) {
      const f1 = Math.abs(i1) - 0.25;
      for (let j1 = -l; j1 <= l; j1++) {
        const f2 = Math.abs(j1) - 0.25;
        const edge = i1 === -l || i1 === l || j1 === -l || j1 === l;
        const hole = r.next() > 0.75;
        if ((i1 === 0 && j1 === 0) || !(f1 * f1 + f2 * f2 > f * f)) {
          if (!edge || !hole) {
            const a = w.get(x + i1, py + k, z + j1);
            if (a !== -1 && ok(a)) w.set(x + i1, py + k, z + j1, ST.packedIce);
            if (k !== 0 && l > 1) {
              const b = w.get(x + i1, py - k, z + j1);
              if (b !== -1 && ok(b)) w.set(x + i1, py - k, z + j1, ST.packedIce);
            }
          }
        }
      }
    }
  }
  let k1 = j - 1;
  if (k1 < 0) k1 = 0;
  else if (k1 > 1) k1 = 1;
  for (let l1 = -k1; l1 <= k1; l1++)
    for (let i2 = -k1; i2 <= k1; i2++) {
      let by = py - 1;
      let j2 = Math.abs(l1) === 1 && Math.abs(i2) === 1 ? r.int(5) : 50;
      while (by > 50) {
        const s = w.get(x + l1, by, z + i2);
        if (s === -1 || !ok(s)) break;
        w.set(x + l1, by, z + i2, ST.packedIce);
        by--;
        if (--j2 <= 0) {
          by -= r.int(5) + 1;
          j2 = r.int(5);
        }
      }
    }
}

/** Mossy cobblestone boulder (Minecraft forest_rock / BlockBlobFeature). Base = ground surface y. */
export function boulder(w: ChunkWriter, x: number, y: number, z: number, seed: number): void {
  const r = new Rng(seed);
  let px = x, py = y, pz = z;
  for (let n = 0; n < 3; n++) {
    const i = r.int(2), j = r.int(2), k = r.int(2);
    const f = (i + j + k) * 0.333 + 0.5;
    for (let dx = -i; dx <= i; dx++)
      for (let dy = -j; dy <= j; dy++)
        for (let dz = -k; dz <= k; dz++)
          if (dx * dx + dy * dy + dz * dz <= f * f) w.replace(px + dx, py + dy, pz + dz, ST.mossyCobblestone, BOULDER_REPLACEABLE);
    px += -1 + r.int(2);
    py -= r.int(2);
    pz += -1 + r.int(2);
  }
}
