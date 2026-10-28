/**
 * Rogue (free-floating) planets: ejected during planet formation, they drift
 * between the stars warmed only by their own internal heat. Microlensing
 * surveys suggest a few per star at low masses; we generate a conservative
 * ~0.3 per star (super-Earth to super-Jupiter) following the local stellar
 * density, per 40-ly cell, deterministically.
 *
 * They emit almost nothing in visible light (≈ 30–120 K): the renderer shows
 * them lit only by starlight and the galactic background, and the interface
 * marks them as infrared detections.
 */
import { Vector3 } from 'three';
import type { GalaxyParams } from './galaxy';
import { densities } from './galaxy';
import { Rng, seedOf } from '../core/rng';
import { Body, StarSystem } from './body';
import { generatePlanet, type Formation } from './planetgen';
import { EARTH_MASS, SOLAR_MASS, DAY, LY } from '../core/constants';
import type { UPos } from '../core/upos';

export const ROGUE_CELL = 40; // ly
const PER_STAR = 0.3;

export interface Rogue {
  id: string;
  name: string;
  galaxyId: string;
  local: Vector3;
  mass: number;   // kg
  seed: number;
}

export function rogueDesignation(g: GalaxyParams, ix: number, iy: number, iz: number, k: number): string {
  const s = (v: number) => (v < 0 ? 'm' : 'p') + Math.abs(v);
  const gal = g.known && g.id === 'MW' ? '' : ` ${g.name.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase()}`;
  return `ICF${gal} ${s(ix)}${s(iy)}${s(iz)}-${k}`;
}

export function cellRogues(g: GalaxyParams, ix: number, iy: number, iz: number, exclude: { x: number; y: number; z: number; r: number }[] = []): Rogue[] {
  const S = ROGUE_CELL;
  const cx = (ix + 0.5) * S, cy = (iy + 0.5) * S, cz = (iz + 0.5) * S;
  const d = densities(g, cx, cy, cz, { young: 0, disk: 0, bulge: 0, halo: 0 });
  const rho = d.young + d.disk + d.bulge + d.halo;
  const rng = new Rng(seedOf(g.seed, 'rogue', ix, iy, iz));
  const n = rng.poisson(Math.min(rho * S * S * S * PER_STAR, 400));
  const out: Rogue[] = [];
  for (let k = 0; k < n; k++) {
    const local = new Vector3(cx + rng.range(-0.5, 0.5) * S, cy + rng.range(-0.5, 0.5) * S, cz + rng.range(-0.5, 0.5) * S);
    const massE = rng.chance(0.75) ? rng.logUniform(1, 20) : rng.logUniform(20, 3000);
    const seed = rng.int(1, 2 ** 30);
    if (exclude.some((e) => local.distanceTo(new Vector3(e.x, e.y, e.z)) < e.r)) continue;
    out.push({ id: `${g.id}/rogue/${ix}:${iy}:${iz}:${k}`, name: rogueDesignation(g, ix, iy, iz, k), galaxyId: g.id, local, mass: massE * EARTH_MASS, seed });
  }
  return out;
}

/** Rogue planets within `range` ly of a galaxy-local point. */
export function roguesAround(g: GalaxyParams, p: Vector3, range: number, exclude: { x: number; y: number; z: number; r: number }[] = []): Rogue[] {
  const S = ROGUE_CELL;
  const r = Math.ceil(range / S);
  const ix0 = Math.floor(p.x / S), iy0 = Math.floor(p.y / S), iz0 = Math.floor(p.z / S);
  const out: Rogue[] = [];
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++)
        for (const x of cellRogues(g, ix0 + dx, iy0 + dy, iz0 + dz, exclude)) if (x.local.distanceTo(p) < range) out.push(x);
  return out;
}

/** A star-less "system" containing just the rogue planet (and possibly moons). */
export function buildRogueSystem(rg: Rogue, upos: UPos, lifeFrequency: number): StarSystem {
  const rng = new Rng(rg.seed);
  const me = rg.mass / EARTH_MASS;
  const formation: Formation = me > 60 ? 'gas-giant' : me > 12 ? 'ice-giant' : rng.chance(0.5) ? 'icy' : 'rocky';
  // internal heat flux: radiogenic for rocky worlds, contraction for giants (W/m²)
  const qInt = me > 60 ? rng.range(0.5, 5) : me > 12 ? rng.range(0.05, 0.5) : rng.range(0.03, 0.12) * Math.pow(me, 0.2);
  const age = rng.range(1e9, 10e9);
  const phys = generatePlanet({
    seed: rg.seed, isMoon: false, mass: rg.mass, formation,
    starLum: 1e3, starTemp: 3000, starMass: 0.1 * SOLAR_MASS, starAge: age, starActivity: 0, starIsRemnant: false,
    distance: LY, ecc: 0, carbonRich: rng.chance(0.05), metallicity: rng.normal(0, 0.2),
    lifeFrequency: lifeFrequency * 0.1, stellarFlux: qInt * 4,
  });
  phys.classLabel = `Rogue ${phys.classLabel.charAt(0).toLowerCase()}${phys.classLabel.slice(1)}`;
  phys.anomalies.push('Free-floating: no host star (detected in thermal infrared)');
  const rot = { period: rng.range(8, 40) * 3600 * (me > 60 ? 0.4 : 1), tilt: rng.range(0, Math.PI), tiltAzimuth: rng.range(0, Math.PI * 2), phase0: rng.range(0, 6.28), locked: false };
  const planet = new Body(`${rg.id}/p`, rg.name, 'planet', null, rg.mass, phys.radius, null, rot, undefined, phys, false);
  // large rogues can keep moons
  if (me > 60 && rng.chance(0.6)) {
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const mm = rng.logUniform(0.005, 0.03) * EARTH_MASS;
      const a = phys.radius * rng.range(6, 40) * (i + 1);
      const mphys = generatePlanet({
        seed: seedOf(rg.seed, 'moon', i), isMoon: true, mass: mm, formation: 'icy',
        starLum: 1e3, starTemp: 3000, starMass: 0.1 * SOLAR_MASS, starAge: age, starActivity: 0, starIsRemnant: false,
        distance: LY, ecc: 0, carbonRich: false, metallicity: 0, lifeFrequency: 0, stellarFlux: 0.05,
        host: { mass: rg.mass, radius: phys.radius, moonA: a, moonE: rng.range(0, 0.02), isGiant: true },
      });
      const mu = 6.674e-11 * (rg.mass + mm);
      new Body(`${rg.id}/m${i}`, `${rg.name} ${['I', 'II', 'III'][i]}`, 'moon', planet, mm, mphys.radius,
        { a, e: rng.range(0, 0.02), i: rng.range(0, 0.05), node: rng.range(0, 6.28), peri: rng.range(0, 6.28), M0: rng.range(0, 6.28), epoch: 0, mu },
        { period: 2 * Math.PI * Math.sqrt(a ** 3 / mu), tilt: 0, tiltAzimuth: 0, phase0: 0, locked: true }, undefined, mphys, false);
    }
  }
  const sys = new StarSystem(rg.id, rg.name, upos, planet, false);
  sys.notes = 'A rogue planet drifting through interstellar space, warmed only by its own internal heat. It is visible only by faint starlight.';
  void DAY;
  return sys;
}
