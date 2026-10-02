/**
 * Deterministic region-grid placement (Minecraft RandomSpreadStructurePlacement): the world is
 * split into `spacing`x`spacing`-chunk regions; each region has exactly one candidate start chunk,
 * offset by a seeded random in [0, spacing - separation).
 */
import { Rng, seedFor } from '../../../core/rng';
import type { RandomSpreadPlacement } from './types';

const floorDiv = (a: number, b: number) => Math.floor(a / b);

/** Candidate start chunk of a region, or null if the region is skipped by `frequency`. */
export function regionCandidate(seed: number, p: RandomSpreadPlacement, rx: number, rz: number): [number, number] | null {
  const r = new Rng(seedFor(seed, rx, rz, p.salt));
  const span = p.spacing - p.separation;
  let ox: number, oz: number;
  if (p.spread === 'triangular') {
    ox = Math.floor((r.int(span) + r.int(span)) / 2);
    oz = Math.floor((r.int(span) + r.int(span)) / 2);
  } else {
    ox = r.int(span);
    oz = r.int(span);
  }
  if (p.frequency !== undefined && p.frequency < 1 && !(r.next() < p.frequency)) return null;
  return [rx * p.spacing + ox, rz * p.spacing + oz];
}

/** Regions overlapping the chunk range [cx0, cx1] x [cz0, cz1]. */
export function regionsFor(p: RandomSpreadPlacement, cx0: number, cz0: number, cx1: number, cz1: number): [number, number, number, number] {
  return [floorDiv(cx0, p.spacing), floorDiv(cz0, p.spacing), floorDiv(cx1, p.spacing), floorDiv(cz1, p.spacing)];
}

/** Seed for building a structure at a start chunk. */
export const startSeed = (seed: number, p: RandomSpreadPlacement, cx: number, cz: number) => seedFor(seed, cx, cz, p.salt ^ 0x5717c7);
