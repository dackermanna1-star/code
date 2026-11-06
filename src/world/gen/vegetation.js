// Trees, forests and undergrowth.
import { B, SOLID } from '../blocks.js';
import { SURFACE, ZONES } from '../World.js';
import { hash01, hash32, makeRng } from '../../core/rng.js';
import { OCC } from './plan.js';

const LEAF_AUTUMN = [B.leaves_autumn, B.leaves_autumn_red, B.leaves_oak, B.leaves_autumn];

function leaf(world, x, y, z, id) {
  if (y >= world.SY || y < 1) return;
  if (world.get(x, y, z) === 0) world.set(x, y, z, id);
}

/** Place a tree with its trunk base at (x, y, z) (y = first air cell above ground). */
export function tree(world, x, y, z, type, h, seed = 0) {
  const r = (a, b) => hash01(seed, x * 31 + a, z * 17 + b, y);
  if (y + 12 >= world.SY) return;
  switch (type) {
    case 'pine': {
      const H = 7 + Math.floor(h * 6);
      for (let k = 0; k < H; k++) world.set(x, y + k, z, B.log_pine);
      let rad = 2 + (H > 10 ? 1 : 0);
      for (let k = 2; k <= H; k++) {
        const yy = y + k;
        const rr = Math.max(0, Math.round(rad * (1 - (k - 2) / (H - 1))) + ((k & 1) ? 0 : 1) - 1);
        for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > rr + (rr > 1 ? 1 : 0)) continue;
          leaf(world, x + dx, yy, z + dz, B.leaves_pine);
        }
      }
      leaf(world, x, y + H, z, B.leaves_pine);
      leaf(world, x, y + H + 1, z, B.leaves_pine);
      break;
    }
    case 'birch': {
      const H = 5 + Math.floor(h * 3);
      for (let k = 0; k < H; k++) world.set(x, y + k, z, B.log_birch);
      const lid = r(1, 1) < 0.6 ? B.leaves_birch : B.leaves_autumn;
      for (let k = H - 3; k <= H + 1; k++) {
        const rr = k >= H ? 1 : 2;
        for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
          if (rr === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          if (r(dx + 5, dz + k * 7) < 0.12) continue;
          leaf(world, x + dx, y + k, z + dz, lid);
        }
      }
      break;
    }
    case 'dead': {
      const H = 4 + Math.floor(h * 4);
      for (let k = 0; k < H; k++) world.set(x, y + k, z, B.log_oak);
      const bx = r(2, 2) < 0.5 ? 1 : -1;
      world.set(x + bx, y + H - 2, z, B.log_oak);
      world.set(x, y + H - 1, z + (r(3, 3) < 0.5 ? 1 : -1), B.log_oak);
      break;
    }
    case 'bush': {
      world.set(x, y, z, B.bush);
      break;
    }
    default: { // oak (autumn colours)
      const H = 4 + Math.floor(h * 3);
      for (let k = 0; k < H; k++) world.set(x, y + k, z, B.log_oak);
      const lid = LEAF_AUTUMN[Math.floor(r(0, 0) * LEAF_AUTUMN.length)];
      const lid2 = LEAF_AUTUMN[Math.floor(r(9, 9) * LEAF_AUTUMN.length)];
      const R = h > 0.6 ? 3 : 2;
      for (let k = H - 2; k <= H + 1; k++) {
        const rr = k === H + 1 ? R - 1 : R;
        for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
          const dd = dx * dx + dz * dz;
          if (dd > rr * rr + 1) continue;
          if (dd >= rr * rr && r(dx * 3 + k, dz * 5) < 0.45) continue;
          leaf(world, x + dx, y + k, z + dz, r(dx + 11, dz + k) < 0.3 ? lid2 : lid);
        }
      }
    }
  }
}

/** Forest + meadow vegetation on unreserved land. */
export function buildVegetation(ctx) {
  const { world, SX, SZ, occ, forest, ground, water, seed } = ctx;
  const rng = makeRng(seed ^ 0xbeef);
  let trees = 0;
  // 1. trees on a jittered grid
  const CELL = 4;
  for (let gz = 0; gz < SZ; gz += CELL) {
    for (let gx = 0; gx < SX; gx += CELL) {
      const hh = hash32(seed, gx, gz, 1);
      const x = gx + (hh & 3), z = gz + ((hh >> 2) & 3);
      if (x < 1 || z < 1 || x >= SX - 1 || z >= SZ - 1) continue;
      const k = z * SX + x;
      if (occ[k] || water[k]) continue;
      // keep 2 cells away from reserved stuff
      if (occ[k - 2] || occ[k + 2] || occ[k - 2 * SX] || occ[k + 2 * SX] || occ[k - 2 * SX - 2] || occ[k + 2 * SX + 2]) continue;
      const f = forest[k] / 255;
      const e = Math.min(x, z, SX - 1 - x, SZ - 1 - z);
      let p = f * 0.85 + (e < 40 ? 0.6 : 0);
      if (ctx.dWater[k] < 4) p *= 0.3;
      const r0 = ((hh >>> 8) & 1023) / 1024;
      if (r0 > p) continue;
      const gy = ground[k];
      const top = world.get(x, gy, z);
      if (top !== B.grass && top !== B.forest_floor && top !== B.dry_grass && top !== B.dirt) continue;
      if (world.get(x, gy + 1, z) !== 0) continue;
      const tsel = ((hh >>> 18) & 255) / 256;
      const pineBias = gy > 30 ? 0.45 : 0.25;
      const type = tsel < pineBias ? 'pine' : tsel < pineBias + 0.18 ? 'birch' : tsel < 0.97 ? 'oak' : 'dead';
      tree(world, x, gy + 1, z, type, ((hh >>> 26) & 63) / 64, seed);
      trees++;
    }
  }
  // 2. undergrowth
  for (let z = 1; z < SZ - 1; z++) {
    for (let x = 1; x < SX - 1; x++) {
      const k = z * SX + x;
      if (occ[k] && occ[k] !== OCC.MARGIN) continue;
      if (water[k]) {
        // reeds in shallow water
        if (ctx.waterDepth[k] <= 1 && hash01(seed, x, z, 41) < 0.35) {
          const y = ground[k] + 1;
          if (y <= 18 && world.get(x, 19, z) === 0) world.set(x, 19, z, B.reeds);
        }
        continue;
      }
      const gy = ground[k];
      if (world.get(x, gy + 1, z) !== 0) continue;
      const top = world.get(x, gy, z);
      const r = hash01(seed, x, z, 42);
      const f = forest[k] / 255;
      if (top === B.sand) {
        if (ctx.dWater[k] <= 1.5 && r < 0.3) world.set(x, gy + 1, z, B.reeds);
        continue;
      }
      if (top !== B.grass && top !== B.forest_floor && top !== B.dry_grass) continue;
      let id = 0;
      if (top === B.forest_floor) {
        if (r < 0.10) id = B.fern;
        else if (r < 0.16) id = B.tall_grass;
        else if (r < 0.19) id = B.bush;
        else if (r < 0.2) id = B.berry_bush;
        else if (r < 0.205) id = B.dead_bush;
        else if (r < 0.2058) { world.set(x, gy + 1, z, B.hollow_log); continue; }
      } else {
        const m = occ[k] === OCC.MARGIN ? 0.5 : 1;
        if (r < 0.22 * m) id = B.tall_grass;
        else if (r < 0.235 * m) id = B.flower_yellow;
        else if (r < 0.245 * m) id = B.flower_white;
        else if (r < 0.252 * m) id = B.flower_red;
        else if (r < 0.27 * m && f > 0.3) id = B.bush;
        else if (r < 0.274 * m) id = B.berry_bush;
        else if (r < 0.285 * m && top === B.dry_grass) id = B.dead_bush;
      }
      if (id) world.set(x, gy + 1, z, id);
      // boulders
      if (!id && r > 0.9993 && gy > SURFACE) {
        world.set(x, gy + 1, z, B.cobblestone);
        if (r > 0.9997) world.set(x + 1, gy + 1, z, B.stone);
      }
    }
  }
  // zones: wilderness
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const k = z * SX + x;
      if (water[k]) { world.zone[k] = ZONES.WATER; continue; }
      if (world.zone[k] !== ZONES.WILD) continue;
      if (forest[k] > 120) world.zone[k] = ZONES.FOREST;
    }
  }
  ctx.stats.trees = trees;
  void SOLID; void rng;
}
