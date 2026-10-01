// Seamless portals. A vestibule is an S-shaped bend of corridor; from the middle of its centre
// row neither doorway is visible, so the player can be swapped into an identical copy somewhere
// else without anything visibly changing. Kinds:
//   loop   - the copy is the same vestibule rotated 180 degrees: you come out where you went in
//   pair   - two vestibules far apart in the building are each other's copy
//   pocket - leads into a pocket dimension (and back to wherever you came from)
import { RNG, hash4, hc } from '../core/rng.js';
import { W, CF } from './zonebuilder.js';
import { M } from './materials.js';
import { ZT } from './zonetypes.js';
import { LEVEL_H } from '../config.js';
import { POCKETS, pocketIds } from './pockets.js';

const SLOT = 112;

// local layout (rotation 0): width 3, depth 2*Lg+1. Entry leg x=0 (south), exit leg x=2 (north).
export function vestibuleCells(Lg) {
  const cells = [];
  for (let k = 1; k <= Lg; k++) cells.push([0, Lg + k]);
  cells.push([0, Lg], [1, Lg], [2, Lg]);
  for (let k = 0; k < Lg; k++) cells.push([2, k]);
  return cells;
}

// trigger rectangle (world coords) in the middle of the centre row
export function vestibuleTrigger(v) {
  return [v.ox + 1.35, v.oz + v.Lg + 0.2, v.ox + 1.65, v.oz + v.Lg + 0.8];
}

// Stamp a vestibule into a zone. v: {ox, oz, Lg, low, sign}
export function stampVestibule(zb, v) {
  const Lg = v.Lg, D = 2 * Lg + 1;
  const outer = zb.params.wallMat || M.wp_stripe;
  const ceilH = v.low ? 1.25 : 2.6;
  // clear footprint + 1 ring
  zb.clearEntities(v.ox - 1, v.oz - 1, v.ox + 4, v.oz + D + 1);
  zb.fill(v.ox - 1, v.oz - 1, v.ox + 4, v.oz + D + 1, (x, z, i) => {
    zb.solid[i] = 0;
    zb.floor[i] = 0;
    if (Number.isNaN(zb.ceil[i]) || zb.ceil[i] < 2.4) zb.ceil[i] = Math.max(2.6, zb.params.ceilH || 2.8);
    zb.flags[i] = (zb.flags[i] & ~(CF.VOID | CF.HOLE_CEIL | CF.STAIRS)) | CF.NOPROPS;
  });
  // no walls anywhere in the ring, including its outer edges, so both doors are reachable
  for (let z = v.oz - 1; z <= v.oz + D + 1; z++) for (let x = v.ox - 1; x <= v.ox + 4; x++) {
    if (!zb.in(x, z)) continue;
    const i = zb.i(x, z);
    if (z <= v.oz + D) zb.wallW[i] = 0;
    if (x <= v.ox + 3) zb.wallN[i] = 0;
  }
  const open = new Set(vestibuleCells(Lg).map(([lx, lz]) => lx + ',' + lz));
  const isOpen = (lx, lz) => open.has(lx + ',' + lz);
  for (const [lx, lz] of vestibuleCells(Lg)) {
    const x = v.ox + lx, z = v.oz + lz;
    if (!zb.in(x, z)) continue;
    const i = zb.i(x, z);
    zb.floor[i] = 0; zb.ceil[i] = ceilH;
    zb.fmat[i] = M.vest_floor; zb.cmat[i] = M.vest_ceil; zb.wmat[i] = M.vest_wall;
    zb.flags[i] |= CF.NOLIGHTBLEED | CF.KEEP;
    // walls toward every non-corridor neighbour
    if (!isOpen(lx - 1, lz)) zb.setWall(x, z, 'W', W.WALL, outer, M.vest_wall);
    if (!isOpen(lx + 1, lz)) zb.setWall(x + 1, z, 'W', W.WALL, M.vest_wall, outer);
    if (!isOpen(lx, lz - 1)) zb.setWall(x, z, 'N', W.WALL, outer, M.vest_wall);
    if (!isOpen(lx, lz + 1)) zb.setWall(x, z + 1, 'N', W.WALL, M.vest_wall, outer);
  }
  // doors: south end of the entry leg, north end of the exit leg
  const door = v.low ? W.LOW : W.DOOR;
  zb.setWall(v.ox, v.oz + D, 'N', door, M.vest_wall, outer);
  zb.setWall(v.ox + 2, v.oz, 'N', door, outer, M.vest_wall);
  // the outside of the low variant drops to a crawlspace height around the doors
  zb.light(v.ox + 1.5, ceilH - 0.15, v.oz + Lg + 0.5, { rad: 4.2, int: 0.7, local: true, color: [1, 0.94, 0.8] });
  zb.fixture(v.ox + 1.5, v.oz + Lg + 0.5, 'panel', true, { y: ceilH });
  if (v.sign) {
    zb.decal(v.ox + 0.5, Math.min(2.45, ceilH + 0.6), v.oz + D + 0.115, 'pz', 0.5, 0.5, v.sign);
    zb.decal(v.ox + 2.5, Math.min(2.45, ceilH + 0.6), v.oz - 0.115, 'nz', 0.5, 0.5, v.sign);
  }
  zb.special({ kind: 'vestibule', x: v.ox + 1.5, z: v.oz + Lg + 0.5, v });
}

export class PortalMap {
  constructor(world) { this.world = world; this.cache = new Map(); }

  // Kind and geometry of a slot, validated for its own placement but not its partner.
  rawSlot(dim, i, j, level) {
    const seed = this.world.seed;
    const cx = i * SLOT + SLOT / 2, cz = j * SLOT + SLOT / 2;
    const dist = Math.hypot(cx, cz) + Math.abs(level) * 140;
    const r = new RNG(hash4(i, j, level, 0x51ab, seed));
    if (!(r.next() < Math.min(0.62, 0.22 + dist / 1200)) || dist <= 70) return null;
    const kindRoll = r.next();
    const isPairSlot = (i & 1) === (j & 1); // diagonal partners share a 2x2 block
    const pairExists = new RNG(hash4(i >> 1, j >> 1, level, 0x9a17, seed)).next() < 0.45;
    let res;
    if (isPairSlot && pairExists && dist > 160) res = { kind: 'pair', Lg: 3 };
    else if (kindRoll < 0.5 && dist > 220 && pocketIds().length) res = { kind: 'pocket', pocket: r.pick(pocketIds()), Lg: 3 };
    else res = { kind: 'loop', Lg: r.int(4, 9) };
    res.low = res.kind === 'pocket' ? !!POCKETS[res.pocket].low : res.kind === 'pair' && r.chance(0.12);
    const D = 2 * res.Lg + 1;
    res.level = level; res.dim = dim; res.i = i; res.j = j;
    res.id = hash4(i, j, level, 0xbee5, seed);
    if (res.kind === 'pocket') res.sign = POCKETS[res.pocket].sign;
    // a few deterministic placement attempts inside the slot
    for (let attempt = 0; attempt < 5; attempt++) {
      res.ox = i * SLOT + r.int(6, SLOT - 10);
      res.oz = j * SLOT + r.int(6, SLOT - D - 6);
      if (this.valid(res)) return res;
    }
    return null;
  }

  slotPortal(dim, i, j, level) {
    const key = dim + ':' + i + ':' + j + ':' + level;
    if (this.cache.has(key)) return this.cache.get(key);
    let res = this.rawSlot(dim, i, j, level);
    if (res && res.kind === 'pair') {
      const partner = this.rawSlot(dim, i ^ 1, j ^ 1, level);
      if (!partner || partner.kind !== 'pair' || partner.low !== res.low) res = null;
      else res.link = { dim, level, ox: partner.ox, oz: partner.oz };
    }
    this.cache.set(key, res);
    if (this.cache.size > 5000) this.cache.clear();
    return res;
  }

  valid(v) {
    const zm = this.world.zones;
    const D = 2 * v.Lg + 1;
    const x0 = v.ox - 2, z0 = v.oz - 2, x1 = v.ox + 5, z1 = v.oz + D + 2;
    const zone = zm.zoneAt(v.dim, v.level, x0, z0);
    // must sit fully inside one ordinary zone
    for (const [x, z] of [[x1, z0], [x0, z1], [x1, z1]]) if (zm.zoneAt(v.dim, v.level, x, z) !== zone) return false;
    if (zone.type === 'claimed' || zone.spanUp) return false;
    const t = ZT[zone.type];
    if (!t || t.allowStairs === false || t.allowPortals === false) return false;
    // keep away from stairwells and holes
    const vm = this.world.vertical;
    if (vm) for (const f of vm.featuresAt(v.dim, v.level, x0 - 2, z0 - 2, x1 + 2, z1 + 2)) if (f) return false;
    return true;
  }

  featuresAt(dim, level, x0, z0, x1, z1) {
    const out = [];
    if (dim !== 0) return out;
    for (let j = Math.floor((z0 - SLOT) / SLOT); j <= Math.floor(z1 / SLOT); j++) {
      for (let i = Math.floor((x0 - SLOT) / SLOT); i <= Math.floor(x1 / SLOT); i++) {
        const v = this.slotPortal(dim, i, j, level);
        if (!v) continue;
        if (v.ox + 4 < x0 || v.ox - 1 > x1 || v.oz + 2 * v.Lg + 2 < z0 || v.oz - 1 > z1) continue;
        out.push(v);
      }
    }
    return out;
  }
}

export function applyPortals(world, zb) {
  if (!world.portals) world.portals = new PortalMap(world);
  const z = zb.zone;
  for (const v of world.portals.featuresAt(z.dim, z.level, zb.x0, zb.z0, zb.x1, zb.z1)) stampVestibule(zb, v);
}

// Where does walking through vestibule v take you? Returns {dim, dx, dy, dz, rot180, enterPocket}
export function portalTarget(v, game) {
  if (v.kind === 'loop') return { dim: v.dim, rot180: true };
  if (v.kind === 'pair' && v.link) return { dim: v.dim, dx: v.link.ox - v.ox, dy: (v.link.level - v.level) * LEVEL_H, dz: v.link.oz - v.oz };
  if (v.kind === 'pocket') {
    const P = POCKETS[v.pocket];
    return { dim: P.id, dx: P.entry.ox - v.ox, dy: (P.entry.level - v.level) * LEVEL_H, dz: P.entry.oz - v.oz, enterPocket: true, from: v };
  }
  if (v.kind === 'return') {
    const r = game.portalReturn;
    if (r) return { dim: r.dim, dx: r.ox - v.ox, dy: (r.level - v.level) * LEVEL_H, dz: r.oz - v.oz, leavePocket: true };
    return { dim: 0, respawn: true, leavePocket: true };
  }
  return null;
}
void hc;
