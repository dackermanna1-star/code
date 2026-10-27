/**
 * Nebulae: catalogued objects plus procedural ones seeded by each galaxy's
 * stellar populations — HII regions trace young stars along spiral arms,
 * planetary nebulae and supernova remnants follow the older disk, reflection
 * and dark clouds sit in the dusty mid-plane. Generated per 1500-ly cell,
 * deterministic and lazy like everything else.
 */
import { Vector3 } from 'three';
import type { GalaxyParams } from './galaxy';
import { densities } from './galaxy';
import { Rng, seedOf } from '../core/rng';
import { KNOWN_NEBULAE } from './known/stars';
import { radecToGalaxyDir } from './known/coords';

export type NebulaType = 'emission' | 'planetary' | 'supernova-remnant' | 'reflection' | 'dark';

export interface Nebula {
  id: string;
  name: string;
  type: NebulaType;
  galaxyId: string;
  /** galaxy-local centre (ly) */
  center: Vector3;
  /** outer radius (ly) */
  radius: number;
  seed: number;
  /** emissivity scale (radiance units per ly of path at unit density) */
  emissivity: number;
  /** optical depth across the radius for dust */
  dust: number;
  /** shape: axis ratios (bipolar / elongated) */
  axes: [number, number, number];
  /** orientation as a unit quaternion (x, y, z, w) in galaxy-local axes */
  q: [number, number, number, number];
  known: boolean;
  note?: string;
}

export const NEBULA_CELL = 1500; // ly
const TYPES: NebulaType[] = ['emission', 'planetary', 'supernova-remnant', 'reflection', 'dark'];

/** Typical surface brightness → emissivity per type (radiance per ly). */
const BASE_EMISSIVITY: Record<NebulaType, number> = {
  emission: 4e-9,
  planetary: 6e-8,
  'supernova-remnant': 3e-9,
  reflection: 4e-10,
  dark: 0,
};

function randomQuat(rng: Rng): [number, number, number, number] {
  const u1 = rng.next(), u2 = rng.next() * Math.PI * 2, u3 = rng.next() * Math.PI * 2;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}

/** Catalogued nebulae placed in the Milky Way relative to the Sun. */
export function knownNebulae(mw: GalaxyParams, sunLocal: Vector3): Nebula[] {
  return KNOWN_NEBULAE.map((k, i) => {
    const rng = new Rng(seedOf('known-nebula', k.id));
    const center = sunLocal.clone().addScaledVector(radecToGalaxyDir(k.ra, k.dec), k.dist);
    const type = k.type as NebulaType;
    const radius = k.size / 2;
    const ax: [number, number, number] = type === 'planetary' ? [1, rng.range(0.6, 0.9), rng.range(0.75, 1)] : [1, rng.range(0.55, 0.9), rng.range(0.7, 1)];
    return {
      id: `MW/neb/${k.id}`, name: k.name, type, galaxyId: mw.id, center, radius, seed: seedOf('nebula', k.id, i),
      emissivity: BASE_EMISSIVITY[type] * (type === 'planetary' ? 1 : Math.pow(24 / Math.max(k.size, 1), 0.3)),
      dust: type === 'dark' ? 6 : type === 'emission' ? 1.2 : type === 'reflection' ? 0.6 : 0.2,
      axes: ax, q: randomQuat(rng), known: true, note: k.note,
    };
  });
}

/** Procedural nebulae in one cell of a galaxy. */
export function cellNebulae(g: GalaxyParams, ix: number, iy: number, iz: number): Nebula[] {
  const S = NEBULA_CELL;
  const cx = (ix + 0.5) * S, cy = (iy + 0.5) * S, cz = (iz + 0.5) * S;
  const d = densities(g, cx, 0, cz, { young: 0, disk: 0, bulge: 0, halo: 0 });
  const rng = new Rng(seedOf(g.seed, 'neb', ix, iy, iz));
  const out: Nebula[] = [];
  // expected counts, normalised to the solar neighbourhood (≈0.004 stars/ly³)
  const youngRel = d.young / 0.0002;
  const diskRel = (d.disk + d.young) / 0.004;
  const plane = Math.exp(-Math.abs(cy) / (g.diskHeight * 1.5 + 200));
  const lam: Record<NebulaType, number> = {
    emission: 0.35 * youngRel * g.starFormation * plane,
    planetary: 0.6 * diskRel * plane,
    'supernova-remnant': 0.12 * (youngRel * g.starFormation + 0.2 * diskRel) * plane,
    reflection: 0.25 * youngRel * plane,
    dark: 0.4 * youngRel * g.dust * plane,
  };
  for (const type of TYPES) {
    const n = rng.poisson(Math.min(lam[type], 6));
    for (let k = 0; k < n; k++) {
      const radius =
        type === 'emission' ? rng.logUniform(15, 180) :
        type === 'planetary' ? rng.logUniform(0.3, 2.5) :
        type === 'supernova-remnant' ? rng.logUniform(8, 70) :
        type === 'reflection' ? rng.logUniform(2, 12) : rng.logUniform(4, 40);
      const hz = type === 'planetary' ? g.diskHeight : g.diskHeight * 0.25;
      const center = new Vector3(cx + rng.range(-0.5, 0.5) * S, rng.normal(0, hz), cz + rng.range(-0.5, 0.5) * S);
      if (Math.abs(center.y - cy) > S / 2) continue; // belongs to another vertical cell
      const axes: [number, number, number] = type === 'planetary'
        ? (rng.chance(0.4) ? [1, 0.45, 0.45] : [1, rng.range(0.7, 0.95), rng.range(0.8, 1)])
        : [1, rng.range(0.4, 0.85), rng.range(0.6, 1)];
      out.push({
        id: `${g.id}/neb/${ix}:${iy}:${iz}:${type[0]}${k}`,
        name: nebulaDesignation(g, type, ix, iy, iz, k),
        type, galaxyId: g.id, center, radius, seed: rng.int(1, 2 ** 30),
        emissivity: BASE_EMISSIVITY[type] * rng.logUniform(0.3, 2.5) * (type === 'planetary' ? Math.pow(1.3 / radius, 1.2) : 1),
        dust: type === 'dark' ? rng.range(3, 9) : type === 'emission' ? rng.range(0.4, 2) : rng.range(0.1, 0.7),
        axes, q: randomQuat(rng), known: false,
      });
    }
  }
  return out;
}

export function nebulaDesignation(g: GalaxyParams, type: NebulaType, ix: number, iy: number, iz: number, k: number): string {
  const pre = { emission: 'ICH', planetary: 'ICP', 'supernova-remnant': 'ICR', reflection: 'ICF', dark: 'ICD' }[type];
  const gal = g.known && g.id === 'MW' ? '' : ` ${g.name.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase()}`;
  const s = (v: number) => (v < 0 ? 'm' : 'p') + Math.abs(v);
  return `${pre}${gal} ${s(ix)}${s(iy)}${s(iz)}-${k}`;
}

/** All nebulae within `range` ly of a galaxy-local point. */
export function nebulaeAround(g: GalaxyParams, p: Vector3, range: number, known: Nebula[]): Nebula[] {
  const out: Nebula[] = [];
  const S = NEBULA_CELL;
  const r = Math.ceil(range / S);
  const ix0 = Math.floor(p.x / S), iy0 = Math.floor(p.y / S), iz0 = Math.floor(p.z / S);
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -r; dz <= r; dz++) {
        for (const n of cellNebulae(g, ix0 + dx, iy0 + dy, iz0 + dz)) if (n.center.distanceTo(p) < range + n.radius) out.push(n);
      }
  for (const n of known) if (n.galaxyId === g.id && n.center.distanceTo(p) < Math.max(range * 3, n.radius * 200)) out.push(n);
  return out;
}
