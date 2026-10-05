/**
 * Where the player wakes up on the tropical island: a castaway camp on the upper beach (a
 * campfire with driftwood seats, a palm-thatch lean-to with a supply chest and a barrel) and the
 * wreck of the sloop that brought them, beached at the waterline and listing to one side: a
 * broken weathered hull with holes, a snapped mast lying across the sand, a torn sail and a
 * chest in the hold.
 *
 * Both are pure functions of the seed and the terrain height; every chunk that overlaps them
 * writes its own part through the clipping ChunkWriter.
 */
import type { ChunkWriter } from '../common/writer';
import { ST as ST_, withAxis } from '../common/states';
import { S } from '../../blocks/registry';
import { Rng } from '../../../core/rng';
import { chestData, LOOT } from '../structures/lib/blockEntities';

const ST = ST_;
/** Max distance from the camp centre of anything placed here. */
export const WRECK_REACH = 34;
const SEA = 63;

type Camp = { x: number; y: number; z: number; ax: number; az: number };
type HeightAt = (x: number, z: number) => number;

const PLANK = () => S('spruce_planks');
const OLD_PLANK = () => S('dark_oak_planks');
const FENCE = () => S('oak_fence');

/** Axis-aligned seaward direction (fx, fz) and its right-hand side (rx, rz). */
function frame(c: Camp) {
  const sx = Math.abs(c.ax) > Math.abs(c.az);
  const fx = sx ? Math.sign(c.ax) : 0, fz = sx ? 0 : Math.sign(c.az);
  return { fx, fz, rx: -fz, rz: fx };
}

export function castawayCamp(w: ChunkWriter, c: Camp, seed: number, heightAt: HeightAt): void {
  const { fx, fz, rx, rz } = frame(c);
  const at = (f: number, r: number) => ({ x: c.x + fx * f + rx * r, z: c.z + fz * f + rz * r });
  const ground = (x: number, z: number) => heightAt(x, z) + 1;
  // campfire
  {
    const p = at(0, 0);
    const y = ground(p.x, p.z);
    w.set(p.x, y, p.z, S('campfire', 0));
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (i || j) w.set(p.x + i, y, p.z + j, 0);
  }
  // driftwood seats on either side of the fire
  for (const side of [-2, 2]) {
    for (let f = -1; f <= 0; f++) {
      const p = at(f, side);
      w.set(p.x, ground(p.x, p.z), p.z, withAxis(ST.jungleLog, fx !== 0 ? 1 : 2));
    }
  }
  // the lean-to, inland of the fire
  const back = -5;
  const yb = ground(at(back, 0).x, at(back, 0).z);
  for (let r = -2; r <= 2; r++) {
    for (let f = back - 1; f <= back + 1; f++) {
      const p = at(f, r);
      // level the floor
      for (let y = yb; y < yb + 4; y++) w.set(p.x, y, p.z, 0);
      w.set(p.x, yb - 1, p.z, ST.sand);
    }
  }
  for (const r of [-2, 2]) {
    const front = at(back + 1, r), rear = at(back - 1, r);
    for (let y = 0; y < 3; y++) w.set(front.x, yb + y, front.z, FENCE());
    for (let y = 0; y < 2; y++) w.set(rear.x, yb + y, rear.z, FENCE());
  }
  // sloping thatch roof of palm leaves
  for (let r = -2; r <= 2; r++) {
    const thatch = S('palm_leaves');
    w.set(at(back + 1, r).x, yb + 3, at(back + 1, r).z, thatch);
    w.set(at(back, r).x, yb + 2, at(back, r).z, thatch);
    w.set(at(back - 1, r).x, yb + 2, at(back - 1, r).z, thatch);
    w.set(at(back - 2, r).x, yb + 1, at(back - 2, r).z, thatch);
  }
  // supplies under the roof
  const chest = at(back - 1, -1);
  const facing = fx > 0 ? 3 : fx < 0 ? 1 : fz > 0 ? 0 : 2;
  w.set(chest.x, yb, chest.z, S('chest', facing & 3));
  w.blockEntity(chest.x, yb, chest.z, chestData(LOOT.shipwreckSupply, seed ^ 0xca57));
  const barrel = at(back - 1, 1);
  w.set(barrel.x, yb, barrel.z, S('barrel', 1));
  // a bedroll of wool beside the fire
  const bed = at(-2, 0);
  w.set(bed.x, ground(bed.x, bed.z), bed.z, S('white_carpet'));
  void SEA;
}

export function wreck(w: ChunkWriter, c: Camp, seed: number, heightAt: HeightAt): void {
  const { fx, fz, rx, rz } = frame(c);
  const r = new Rng(seed ^ 0x5a1d);
  // find the waterline seaward of the camp
  let wl = 6;
  for (; wl < 30; wl++) if (heightAt(c.x + fx * wl, c.z + fz * wl) < SEA - 1) break;
  const along = r.chance(0.5) ? 1 : -1;
  // hull frame: s along the hull (parallel to the shore), f across (+ = seaward)
  const at = (s: number, f: number) => ({ x: c.x + fx * (wl + f) + rx * (s * along + 7), z: c.z + fz * (wl + f) + rz * (s * along + 7) });
  const half = 8;
  const keelY = Math.max(SEA - 3, heightAt(at(0, 0).x, at(0, 0).z) - 1);
  const plank = (x: number, y: number, z: number) => hashCell(x, y + 7, z, seed) < 0.3 ? OLD_PLANK() : PLANK();
  for (let s = -half; s <= half; s++) {
    const u = s / half; // -1 stern .. +1 bow
    const beam = Math.round(3.2 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(u), u > 0 ? 2.2 : 3.5))));
    const sheer = Math.round(u > 0 ? u * u * 2.5 : u * u * 1.2); // bow and stern rise
    // keel
    const k = at(s, 0);
    w.set(k.x, keelY, k.z, withAxis(S('spruce_log', 0), fx !== 0 ? 2 : 1));
    for (let f = -beam; f <= beam; f++) {
      const p = at(s, f);
      // listing toward the sea: the seaward side sits lower, the landward side higher
      const list = f > 0 ? -Math.ceil(f / 2) : Math.ceil(-f / 3);
      const bottom = keelY + Math.abs(f) - (Math.abs(f) > 1 ? 1 : 0) + Math.min(0, list);
      const top = keelY + 3 + sheer + list;
      const broken = f > 0 && s > -4 && s < 5 && hashCell(p.x, 1, p.z, seed) < 0.75; // the stove-in seaward side
      for (let y = bottom; y <= top; y++) {
        const shell = Math.abs(f) === beam || y === bottom || Math.abs(s) === half;
        if (shell) {
          if (broken && y > bottom) {
            // exposed ribs where the planking is gone
            if ((s & 1) === 0 && y <= top - 1) w.set(p.x, y, p.z, FENCE());
            else w.set(p.x, y, p.z, y < SEA ? ST.water : 0);
            continue;
          }
          if (hashCell(p.x, y, p.z, seed) < 0.1) w.set(p.x, y, p.z, y < SEA ? ST.water : 0);
          else w.set(p.x, y, p.z, plank(p.x, y, p.z));
        } else w.set(p.x, y, p.z, y < SEA ? ST.water : 0);
      }
      // a scrap of deck near the stern, slanting with the list
      if (s < -3 && Math.abs(f) < beam && hashCell(p.x, 2, p.z, seed) < 0.8) w.set(p.x, top - 1, p.z, S('spruce_slab', 0));
    }
  }
  // stem post with the bowsprit running out level from its head, and the sternpost
  const bowTop = keelY + 3 + Math.round(2.5) + 1;
  const bow = at(half, 0);
  for (let y = keelY + 1; y <= bowTop; y++) w.set(bow.x, y, bow.z, S('spruce_log', 0));
  for (let i = 1; i <= 3; i++) { const b = at(half + i, 0); w.set(b.x, bowTop, b.z, FENCE()); }
  const stern = at(-half, 0);
  for (let y = keelY + 1; y <= keelY + 5; y++) w.set(stern.x, y, stern.z, S('spruce_log', 0));
  // the hold's chest (landward side, out of the water)
  const hold = at(-2, -1);
  w.set(hold.x, keelY + 1, hold.z, S('chest', 0));
  w.blockEntity(hold.x, keelY + 1, hold.z, chestData(LOOT.shipwreckTreasure, seed ^ 0x5a1e));
  w.set(hold.x, keelY, hold.z, PLANK());
  // stump of the mast and the snapped mast lying across the beach, the torn sail beside it
  const stump = at(1, 0);
  for (let y = 1; y < 5; y++) w.set(stump.x, keelY + y, stump.z, S('spruce_log', 0));
  const mastLen = 11;
  for (let i = 0; i < mastLen; i++) {
    const x = stump.x - fx * (i + 2), z = stump.z - fz * (i + 2);
    const y = Math.max(heightAt(x, z) + 1, SEA);
    w.set(x, y, z, withAxis(S('spruce_log', 0), fx !== 0 ? 1 : 2));
    if (i > 1 && i < 9 && hashCell(x, 3, z, seed) < 0.8) {
      for (const side of [1, 2]) {
        const sx = x + rx * side * along, sz = z + rz * side * along;
        if (side === 2 && hashCell(sx, 4, sz, seed) < 0.4) continue;
        w.set(sx, Math.max(heightAt(sx, sz) + 1, SEA), sz, S('white_carpet'));
      }
    }
  }
  // scattered cargo on the sand: barrels and a broken crate
  for (let i = 0; i < 3; i++) {
    const x = c.x + fx * (wl - 3 - i * 2) + rx * (r.int(9) - 4), z = c.z + fz * (wl - 3 - i * 2) + rz * (r.int(9) - 4);
    w.set(x, heightAt(x, z) + 1, z, i === 1 ? S('oak_planks') : S('barrel', 1));
  }
}

function hashCell(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
