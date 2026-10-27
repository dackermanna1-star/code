/**
 * Large-scale structure: galaxies in hierarchical cells over a cosmic-web
 * density field (filaments from ridged noise, clusters at cellular nodes,
 * voids between), with a Schechter luminosity function (L* = 2×10¹⁰ L☉,
 * α = −1.2, φ* = 0.005 Mpc⁻³). Bright galaxies are generated in large cells
 * so they are visible from far away; dwarfs only in nearby small cells.
 * The Milky Way and the Local Group are placed from catalogue data in
 * "known" mode; everything else is procedural and deterministic.
 */
import { Quaternion, Vector3 } from 'three';
import { Rng, seedOf } from '../core/rng';
import { noise3, cellular3, ridged } from '../core/noise';
import { UPos } from '../core/upos';
import { LY, MPC } from '../core/constants';
import { makeGalaxy, normaliseDensity, densities, type GalaxyParams } from './galaxy';

export const GAL_LEVELS = [
  { size: 1.2, lMin: 2e7, lMax: 1e9 },     // dwarfs
  { size: 4.8, lMin: 1e9, lMax: 1e10 },
  { size: 19.2, lMin: 1e10, lMax: 8e10 },
  { size: 76.8, lMin: 8e10, lMax: 1e12 },  // giants & brightest cluster galaxies
]; // sizes in Mpc
export const GAL_NEIGHBOURS = 2;

const L_STAR = 2e10, ALPHA = -1.2, PHI_STAR = 0.005;

function schechterCount(l1: number, l2: number): number {
  // ∫ x^α e^{-x} dx from l1/L* to l2/L* (log-spaced numeric integral)
  const a = l1 / L_STAR, b = l2 / L_STAR;
  const n = 200;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const x0 = a * Math.pow(b / a, i / n), x1 = a * Math.pow(b / a, (i + 1) / n);
    const xm = Math.sqrt(x0 * x1);
    s += Math.pow(xm, ALPHA) * Math.exp(-xm) * (x1 - x0);
  }
  return PHI_STAR * s;
}
const BAND_DENSITY = GAL_LEVELS.map((l) => schechterCount(l.lMin, l.lMax));

function sampleSchechter(rng: Rng, l1: number, l2: number): number {
  // rejection from a log-uniform proposal
  for (let t = 0; t < 64; t++) {
    const L = l1 * Math.pow(l2 / l1, rng.next());
    const x = L / L_STAR;
    const w = Math.pow(x, ALPHA + 1) * Math.exp(-x) / Math.pow(l1 / L_STAR, ALPHA + 1);
    if (rng.next() < w) return L;
  }
  return l1;
}

/** Cosmic-web density contrast (mean ≈ 1) at a point given in Mpc. */
export function webDensity(seed: number, x: number, y: number, z: number): number {
  const s = 1 / 45;
  const fil = ridged(x * s, y * s, z * s, seed, 3, 2.0, 0.5, 3.0);
  const c = cellular3(x / 60, y / 60, z / 60, seed + 99, 0.8);
  const node = Math.exp(-(c.f1 * c.f1) / 0.02) * (((c.id1 >>> 4) & 255) / 255 > 0.4 ? 1 : 0.2);
  const v = 0.5 + 0.5 * noise3(x / 120, y / 120, z / 120, seed + 7);
  return 0.08 + 2.6 * Math.pow(fil, 3) * v * 1.4 + 8 * node;
}

export interface UniverseOptions {
  seed: number;
  knownLocalGroup: boolean;
}

export class Universe {
  readonly seed: number;
  readonly known: GalaxyParams[] = [];
  readonly home: GalaxyParams;
  private cache = new Map<string, GalaxyParams[]>();
  /** Sun position in the Milky Way frame (ly) when the known universe is enabled */
  readonly sunLocal = new Vector3(-26000, 66, 0);

  constructor(readonly opts: UniverseOptions) {
    this.seed = opts.seed;
    this.home = this.makeMilkyWay();
    this.known.push(this.home);
    if (opts.knownLocalGroup) this.addLocalGroup();
  }

  private makeMilkyWay(): GalaxyParams {
    const known = this.opts.knownLocalGroup;
    const g = makeGalaxy('MW', known ? 'Milky Way' : 'Home Galaxy', known ? 31415926 : seedOf(this.seed, 'home'), new UPos(), 2.5e10, 1);
    if (known) {
      Object.assign(g, {
        type: 'barred-spiral', hubble: 'SBbc', radius: 52000, diskScale: 8500, diskHeight: 980,
        bulgeScale: 2800, bulgeWeight: 2.2, barLength: 15000, barAngle: (27 * Math.PI) / 180,
        arms: 4, pitch: (12.5 * Math.PI) / 180, armWidth: 0.5, armContrast: 0.75, dust: 0.85, starFormation: 0.55,
        stellarMass: 6e10, bhMass: 4.3e6, agn: 0.02, warp: 0.1, ageGyr: 13.2, metallicity: 0, known: true,
        q: new Quaternion(),
        description: 'Our home galaxy. Morphology, size and the Sun’s position follow published estimates; individual stars beyond the catalogued neighbourhood are procedural.',
      } as Partial<GalaxyParams>);
      normaliseDensity(g);
      // calibrate to the observed local stellar density (~0.14 stars pc⁻³ ≈ 0.004 ly⁻³)
      const d = densities(g, this.sunLocal.x, this.sunLocal.y, this.sunLocal.z, { young: 0, disk: 0, bulge: 0, halo: 0 });
      const local = d.young + d.disk + d.bulge + d.halo;
      g.centralDensity *= 0.0040 / local;
    }
    return g;
  }

  private addLocalGroup() {
    // galactic (l, b, distance) → Milky-Way frame (X → Galactic Centre, Y → NGP)
    const place = (l: number, b: number, dLy: number) => {
      const L = (l * Math.PI) / 180, B = (b * Math.PI) / 180;
      const dir = new Vector3(Math.cos(B) * Math.cos(L), Math.sin(B), -Math.cos(B) * Math.sin(L));
      const p = this.sunLocal.clone().addScaledVector(dir, dLy);
      return UPos.fromMeters(p.x * LY, p.y * LY, p.z * LY);
    };
    const lg: [string, string, number, number, number, number, Partial<GalaxyParams>][] = [
      ['M31', 'Andromeda Galaxy (M31)', 121.17, -21.57, 2.54e6, 3.0e10, { type: 'spiral', hubble: 'SA(s)b', radius: 110000, arms: 2, pitch: 0.17, bhMass: 1.4e8, dust: 0.8, starFormation: 0.35 }],
      ['M33', 'Triangulum Galaxy (M33)', 133.61, -31.33, 2.73e6, 3.0e9, { type: 'spiral', hubble: 'SA(s)cd', radius: 30000, arms: 2, pitch: 0.42, starFormation: 0.9 }],
      ['LMC', 'Large Magellanic Cloud', 280.47, -32.89, 1.63e5, 1.5e9, { type: 'barred-spiral', hubble: 'SB(s)m', radius: 16000, arms: 1, pitch: 0.5, starFormation: 1, dust: 0.5 }],
      ['SMC', 'Small Magellanic Cloud', 302.8, -44.3, 2.0e5, 4.6e8, { type: 'dwarf-irregular', hubble: 'SB(s)m pec', radius: 9000, starFormation: 0.8 }],
      ['M32', 'M32', 121.15, -21.98, 2.49e6, 4e8, { type: 'dwarf-elliptical', hubble: 'cE2', radius: 3300 }],
      ['M110', 'M110', 120.72, -21.14, 2.69e6, 3.5e8, { type: 'dwarf-elliptical', hubble: 'E5 pec', radius: 8500 }],
      ['NGC6822', "Barnard's Galaxy", 25.34, -18.4, 1.6e6, 1e8, { type: 'dwarf-irregular', hubble: 'IB(s)m', radius: 3500 }],
    ];
    for (const [id, name, l, b, d, lum, over] of lg) {
      const g = makeGalaxy(id, name, seedOf(id), place(l, b, d), lum, 1);
      Object.assign(g, over, { known: true, description: 'Position, distance and type from catalogue data; internal structure is a procedural model.' });
      normaliseDensity(g);
      this.known.push(g);
    }
  }

  /** Galaxies of one level/cell (deterministic). Coordinates in Mpc relative to the universe origin. */
  cell(level: number, ix: number, iy: number, iz: number): GalaxyParams[] {
    const key = `${level}:${ix}:${iy}:${iz}`;
    const c = this.cache.get(key);
    if (c) return c;
    const L = GAL_LEVELS[level];
    const S = L.size;
    const rng = new Rng(seedOf(this.seed, 'gcell', level, ix, iy, iz));
    const cx = (ix + 0.5) * S, cy = (iy + 0.5) * S, cz = (iz + 0.5) * S;
    const w = webDensity(this.seed, cx, cy, cz);
    const n = rng.poisson(BAND_DENSITY[level] * S * S * S * w);
    const out: GalaxyParams[] = [];
    for (let i = 0; i < Math.min(n, 400); i++) {
      // position following the web at finer scale (rejection)
      let x = 0, y = 0, z = 0, wd = w;
      for (let t = 0; t < 8; t++) {
        x = cx + rng.range(-0.5, 0.5) * S; y = cy + rng.range(-0.5, 0.5) * S; z = cz + rng.range(-0.5, 0.5) * S;
        wd = webDensity(this.seed, x, y, z);
        if (rng.next() * w * 2.5 < wd) break;
      }
      // keep the Local Group clear in known mode (the catalogue provides it)
      if (this.opts.knownLocalGroup && x * x + y * y + z * z < 1.5 * 1.5) continue;
      if (!this.opts.knownLocalGroup && x * x + y * y + z * z < 0.3 * 0.3) continue;
      const lum = sampleSchechter(rng, L.lMin, L.lMax);
      const gseed = seedOf(this.seed, 'gal', level, ix, iy, iz, i);
      const name = `ICG ${level}${ix < 0 ? 'm' : 'p'}${Math.abs(ix)}-${iy < 0 ? 'm' : 'p'}${Math.abs(iy)}-${iz < 0 ? 'm' : 'p'}${Math.abs(iz)}-${i}`;
      out.push(makeGalaxy(`g${level}:${ix}:${iy}:${iz}:${i}`, name, gseed, UPos.fromMeters(x * MPC, y * MPC, z * MPC), lum, wd));
    }
    this.cache.set(key, out);
    if (this.cache.size > 4000) this.cache.delete(this.cache.keys().next().value!);
    return out;
  }

  /** All galaxies whose generation cells neighbour the given position (Mpc). */
  galaxiesAround(xMpc: number, yMpc: number, zMpc: number): GalaxyParams[] {
    const res: GalaxyParams[] = [...this.known];
    for (let level = 0; level < GAL_LEVELS.length; level++) {
      const S = GAL_LEVELS[level].size;
      const bx = Math.floor(xMpc / S), by = Math.floor(yMpc / S), bz = Math.floor(zMpc / S);
      const R = GAL_NEIGHBOURS;
      for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) res.push(...this.cell(level, bx + i, by + j, bz + k));
    }
    return res;
  }

  /** Look up a procedural galaxy by id ("g<level>:<ix>:<iy>:<iz>:<i>") or a known one. */
  galaxyById(id: string): GalaxyParams | undefined {
    const k = this.known.find((g) => g.id === id);
    if (k) return k;
    const m = /^g(\d+):(-?\d+):(-?\d+):(-?\d+):(\d+)$/.exec(id);
    if (!m) return undefined;
    return this.cell(+m[1], +m[2], +m[3], +m[4]).find((g) => g.id === id);
  }
}
