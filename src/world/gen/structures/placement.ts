/**
 * Deterministic region-grid placement (Minecraft RandomSpreadStructurePlacement): the world is
 * split into `spacing`x`spacing`-chunk regions; each region has exactly one candidate start chunk,
 * offset by a seeded random in [0, spacing - separation).
 */
import { Rng, seedFor } from '../../../core/rng';
import type { ConcentricRingsPlacement, RandomSpreadPlacement, StructureContext, StructurePlacement } from './types';

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
export const startSeed = (seed: number, p: StructurePlacement, cx: number, cz: number) => seedFor(seed, cx, cz, p.salt ^ 0x5717c7);

/**
 * Start chunks of a concentric-rings placement (Minecraft `ConcentricRingsStructurePlacement`),
 * in generation order (ring by ring). Pure function of (seed, placement, biome source).
 */
export function ringPositions(seed: number, p: ConcentricRingsPlacement, biomeAt: StructureContext['biomeAt']): [number, number][] {
  const r = new Rng(seedFor(seed, p.salt));
  const out: [number, number][] = [];
  let angle = r.next() * Math.PI * 2;
  let ring = 0, inRing = 0, spread = p.spread;
  for (let i = 0; i < p.count; i++) {
    const dist = 4 * p.distance + p.distance * ring * 6 + (r.next() - 0.5) * p.distance * 2.5;
    let cx = Math.round(Math.cos(angle) * dist), cz = Math.round(Math.sin(angle) * dist);
    if (p.biomeOk) {
      // nearest acceptable column within 112 blocks (spiral of 16-block steps), like vanilla
      const bx = cx * 16 + 8, bz = cz * 16 + 8;
      search: for (let rad = 0; rad <= 112; rad += 16) {
        const n = rad === 0 ? 1 : Math.round((2 * Math.PI * rad) / 16);
        const a0 = r.next() * Math.PI * 2;
        for (let k = 0; k < n; k++) {
          const a = a0 + (k / n) * Math.PI * 2;
          const x = Math.round(bx + Math.cos(a) * rad), z = Math.round(bz + Math.sin(a) * rad);
          if (p.biomeOk(biomeAt(x, z))) {
            cx = Math.floor(x / 16);
            cz = Math.floor(z / 16);
            break search;
          }
        }
      }
    }
    out.push([cx, cz]);
    angle += (Math.PI * 2) / spread;
    if (++inRing === spread) {
      ring++;
      inRing = 0;
      spread += Math.floor((2 * spread) / (ring + 1));
      spread = Math.min(spread, p.count - i - 1);
      angle += r.next() * Math.PI * 2;
    }
  }
  return out;
}
