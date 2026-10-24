// Procedural "virtual" terrain: undisturbed ground is evaluated on demand from a heightmap
// plus a per-column ground type, so the huge ground surface costs almost no memory until it
// is actually dug into (at which point the world materialises the chunk).

import { hash3 } from '../engine/math';
import { P, variant } from './materials';

export const BEDROCK_Y = 2;

export const enum Ground {
  Asphalt = 0, AsphaltPatch, LineWhite, LineYellow, Concrete, ConcreteOld, Gravel, Dirt, Grass, GrassDry,
  Mud, Sand, Ballast, Coal, Rock, COUNT,
}

/** Layer stacks from the surface downwards (palette group bases). Deeper voxels use the fill. */
const STACKS: number[][] = [];
STACKS[Ground.Asphalt] = [P.asphalt, P.gravel, P.gravel];
STACKS[Ground.AsphaltPatch] = [P.asphaltPatch, P.gravel, P.gravel];
STACKS[Ground.LineWhite] = [P.lineWhite, P.asphalt, P.gravel, P.gravel];
STACKS[Ground.LineYellow] = [P.lineYellow, P.asphalt, P.gravel, P.gravel];
STACKS[Ground.Concrete] = [P.concrete, P.concrete, P.concreteMid, P.gravel];
STACKS[Ground.ConcreteOld] = [P.concreteDark, P.concreteMid, P.concreteMid, P.gravel];
STACKS[Ground.Gravel] = [P.gravel, P.gravel, P.dirt];
STACKS[Ground.Dirt] = [P.dirt, P.dirt];
STACKS[Ground.Grass] = [P.grass, P.dirt, P.dirt];
STACKS[Ground.GrassDry] = [P.grassDry, P.dirt, P.dirt];
STACKS[Ground.Mud] = [P.mud, P.mud, P.dirtDark];
STACKS[Ground.Sand] = [P.sand, P.sand, P.dirt];
STACKS[Ground.Ballast] = [P.ballast, P.ballast, P.gravel];
STACKS[Ground.Coal] = [P.coal, P.coal, P.coal, P.dirtDark];
STACKS[Ground.Rock] = [P.rock, P.rock, P.rock];

// Flattened lookup: STACK_FLAT[g*8 + d], STACK_LEN[g]
const STACK_FLAT = new Uint8Array(Ground.COUNT * 8);
const STACK_LEN = new Uint8Array(Ground.COUNT);
for (let g = 0; g < Ground.COUNT; g++) {
  const s = STACKS[g];
  STACK_LEN[g] = s.length;
  for (let i = 0; i < s.length; i++) STACK_FLAT[g * 8 + i] = s[i];
}

export class Terrain {
  readonly height: Int16Array;
  readonly ground: Uint8Array;

  constructor(readonly sx: number, readonly sz: number, baseHeight: number) {
    this.height = new Int16Array(sx * sz).fill(baseHeight);
    this.ground = new Uint8Array(sx * sz).fill(Ground.Grass);
  }

  heightAt(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return 0;
    return this.height[x + z * this.sx];
  }

  /** Palette index of the undisturbed terrain at a voxel. */
  eval(x: number, y: number, z: number): number {
    if (y < BEDROCK_Y) return P.bedrock;
    const i = x + z * this.sx;
    const h = this.height[i];
    if (y >= h) return 0;
    const d = h - 1 - y;
    const g = this.ground[i];
    const hv = hash3(x, y, z);
    if (d < STACK_LEN[g]) return d === 0 ? STACK_FLAT[g * 8] : variant(STACK_FLAT[g * 8 + d], hv);
    // deep fill: dirt with occasional stones, darker with depth
    if ((hv & 63) === 0) return variant(P.rock, hv >>> 8);
    return d > 14 ? variant(P.dirtDark, hv >>> 8) : variant(P.dirt, hv >>> 8);
  }

  /** Writes eval(x, y, z) for y in [ya, yb) into out[idx + (y - ya) * stride]. */
  fillColumn(x: number, z: number, ya: number, yb: number, out: Uint8Array, idx: number, stride: number): void {
    const i = x + z * this.sx;
    const h = this.height[i];
    const g = this.ground[i];
    const sl = STACK_LEN[g], sb = g * 8;
    const top = Math.min(yb, h);
    for (let y = ya; y < top; y++, idx += stride) {
      if (y < BEDROCK_Y) { out[idx] = P.bedrock; continue; }
      const d = h - 1 - y;
      const hv = hash3(x, y, z);
      if (d < sl) out[idx] = d === 0 ? STACK_FLAT[sb] : variant(STACK_FLAT[sb + d], hv);
      else if ((hv & 63) === 0) out[idx] = variant(P.rock, hv >>> 8);
      else out[idx] = d > 14 ? variant(P.dirtDark, hv >>> 8) : variant(P.dirt, hv >>> 8);
    }
  }

  /** Minimum and maximum surface height in a rectangular column area (inclusive bounds). */
  rangeIn(x0: number, z0: number, x1: number, z1: number): [number, number] {
    let mn = 1 << 30, mx = -1;
    for (let z = z0; z <= z1; z++) {
      const row = z * this.sx;
      for (let x = x0; x <= x1; x++) {
        const h = this.height[row + x];
        if (h < mn) mn = h;
        if (h > mx) mx = h;
      }
    }
    return [mn, mx];
  }
}
