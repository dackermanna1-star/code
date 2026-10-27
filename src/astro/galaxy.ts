/**
 * Galaxy morphology and stellar density model.
 *
 * Galaxy-local frame: disk in the XZ plane, Y = disk normal, units light-years.
 * Components: exponential disk (with logarithmic spiral arm modulation and a
 * young arm population), bar, bulge (Hernquist-like), stellar halo,
 * ellipticals (modified Hubble profile), rings, irregular clumps, dust.
 * The same functions (mirrored in GLSL) drive star generation and the
 * volumetric renderer, so what you see from afar is where stars are.
 */
import { Quaternion, Vector3 } from 'three';
import { Rng } from '../core/rng';
import { UPos } from '../core/upos';
import { LY } from '../core/constants';

export type GalaxyType = 'spiral' | 'barred-spiral' | 'lenticular' | 'elliptical' | 'irregular' | 'dwarf-elliptical' | 'dwarf-irregular' | 'ring';

export interface GalaxyParams {
  id: string;
  name: string;
  seed: number;
  type: GalaxyType;
  hubble: string;
  upos: UPos;
  q: Quaternion;           // galaxy-local → universe
  radius: number;          // ly, visible extent
  diskScale: number;       // ly, exponential scale length
  diskHeight: number;      // ly, scale height
  bulgeScale: number;      // ly
  bulgeWeight: number;     // central bulge/disk density ratio
  barLength: number;       // ly (0 = none)
  barAngle: number;        // rad
  arms: number;
  pitch: number;           // rad
  armWidth: number;        // 0..1 (fraction of inter-arm phase)
  armContrast: number;     // 0..1
  ellipAxes: [number, number, number]; // ellipsoid axis ratios (ellipticals)
  ringRadius: number;      // ly (ring galaxies)
  dust: number;            // 0..1
  starFormation: number;   // 0..1 (young blue population, HII regions)
  stellarMass: number;     // M☉
  centralDensity: number;  // stars / ly³ at the centre of the disk component
  agn: number;             // 0..1 nuclear activity
  bhMass: number;          // M☉ central black hole
  warp: number;            // tidal warp/tail strength (interacting systems)
  ageGyr: number;
  metallicity: number;
  known: boolean;
  description?: string;
}

const TAU = Math.PI * 2;

/** Density of each stellar population at a galaxy-local point (stars / ly³). */
export interface PopDensity { young: number; disk: number; bulge: number; halo: number }

export function spiralPhase(g: GalaxyParams, x: number, z: number): number {
  const r = Math.sqrt(x * x + z * z) + 1;
  const th = Math.atan2(z, x);
  const k = 1 / Math.tan(g.pitch);
  return g.arms * (th - Math.log(r / (g.diskScale * 0.3)) * k);
}

/** 0..1 arm strength at a point (1 on arm ridge). */
export function armFactor(g: GalaxyParams, x: number, z: number): number {
  if (g.arms <= 0) return 0;
  const ph = spiralPhase(g, x, z);
  const c = 0.5 + 0.5 * Math.cos(ph);
  const sharp = 1 + 8 * (1 - g.armWidth);
  return Math.pow(c, sharp);
}

export function densities(g: GalaxyParams, x: number, y: number, z: number, out: PopDensity): PopDensity {
  const r = Math.sqrt(x * x + z * z);
  const ay = Math.abs(y);
  const rho0 = g.centralDensity;
  out.young = out.disk = out.bulge = out.halo = 0;
  const sph = Math.sqrt(r * r + y * y);
  if (g.type === 'elliptical' || g.type === 'dwarf-elliptical') {
    const [a, b, c] = g.ellipAxes;
    const m = Math.sqrt((x / a) ** 2 + (y / b) ** 2 + (z / c) ** 2);
    out.bulge = rho0 * Math.pow(1 + (m / g.bulgeScale) ** 2, -1.5);
    out.halo = rho0 * 0.002 * Math.pow(1 + sph / g.radius, -3);
    return out;
  }
  // disk
  let diskR = Math.exp(-r / g.diskScale);
  if (g.type === 'ring') {
    const dr = (r - g.ringRadius) / (g.diskScale * 0.35);
    diskR = 0.15 * Math.exp(-r / g.diskScale) + Math.exp(-dr * dr);
  }
  const vert = Math.exp(-ay / g.diskHeight);
  let disk = rho0 * diskR * vert;
  // spiral arms concentrate young stars and modulate the old disk slightly
  const arm = armFactor(g, x, z);
  const armWeight = g.type === 'lenticular' ? 0 : g.armContrast;
  disk *= 1 - armWeight * 0.35 + armWeight * 0.7 * arm;
  out.disk = disk;
  out.young = rho0 * 0.08 * g.starFormation * diskR * Math.exp(-ay / (g.diskHeight * 0.35)) * (0.1 + 3 * arm * armWeight);
  if (g.type === 'irregular' || g.type === 'dwarf-irregular') {
    // clumpy: modulate by coarse hash-noise lumps
    const lump = 0.4 + 1.2 * clumps(g.seed, x / g.diskScale, y / g.diskScale, z / g.diskScale);
    out.disk *= lump;
    out.young *= lump * 1.5;
  }
  // bar
  if (g.barLength > 0) {
    const ca = Math.cos(g.barAngle), sa = Math.sin(g.barAngle);
    const bx = x * ca + z * sa, bz = -x * sa + z * ca;
    const bar = Math.exp(-Math.sqrt((bx / g.barLength) ** 2 + (bz / (g.barLength * 0.3)) ** 2 + (y / (g.diskHeight * 1.5)) ** 2) * 2.2);
    out.bulge += rho0 * 1.6 * bar;
  }
  // bulge
  const bs = g.bulgeScale;
  out.bulge += (rho0 * g.bulgeWeight * bs) / (sph + bs * 0.15) * Math.pow(1 + sph / bs, -3) * 0.15;
  out.halo = rho0 * 0.0015 * Math.pow(1 + sph / (g.diskScale * 1.5), -3.2);
  return out;
}

function clumps(seed: number, x: number, y: number, z: number): number {
  // cheap smooth value noise (deterministic)
  const f = (ix: number, iy: number, iz: number) => {
    let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(iz, 0x9e3779b1) ^ seed) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    return ((h ^ (h >>> 13)) & 0xffff) / 65535;
  };
  const s = (t: number) => t * t * (3 - 2 * t);
  const X = x * 1.7, Y = y * 1.7, Z = z * 1.7;
  const ix = Math.floor(X), iy = Math.floor(Y), iz = Math.floor(Z);
  const fx = s(X - ix), fy = s(Y - iy), fz = s(Z - iz);
  let v = 0;
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++)
    v += f(ix + i, iy + j, iz + k) * (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * (k ? fz : 1 - fz);
  return v;
}

export function totalDensity(g: GalaxyParams, x: number, y: number, z: number): number {
  const d = densities(g, x, y, z, _pd);
  return d.young + d.disk + d.bulge + d.halo;
}
const _pd: PopDensity = { young: 0, disk: 0, bulge: 0, halo: 0 };

/** Universe position of a galaxy-local point given in light-years. */
export function galaxyToUPos(g: GalaxyParams, x: number, y: number, z: number, out = new UPos()): UPos {
  const v = new Vector3(x * LY, y * LY, z * LY).applyQuaternion(g.q);
  return out.copy(g.upos).add(v);
}

/** Galaxy-local position (ly) of a universe position. */
export function uposToGalaxy(g: GalaxyParams, p: UPos, out = new Vector3()): Vector3 {
  p.sub(g.upos, out);
  out.applyQuaternion(_qi.copy(g.q).invert());
  return out.multiplyScalar(1 / LY);
}
const _qi = new Quaternion();

const HUBBLE: Record<GalaxyType, string[]> = {
  spiral: ['Sa', 'Sab', 'Sb', 'Sbc', 'Sc', 'Scd', 'Sd'],
  'barred-spiral': ['SBa', 'SBab', 'SBb', 'SBbc', 'SBc', 'SBd'],
  lenticular: ['S0', 'SB0'],
  elliptical: ['E0', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7'],
  irregular: ['Irr I', 'Irr II'],
  'dwarf-elliptical': ['dE', 'dSph'],
  'dwarf-irregular': ['dIrr'],
  ring: ['Ring (collisional)'],
};

/**
 * Generate galaxy parameters from a luminosity (L☉) and environment density.
 * Morphology–density relation: dense environments favour ellipticals/S0.
 */
export function makeGalaxy(id: string, name: string, seed: number, upos: UPos, lumSun: number, envDensity: number): GalaxyParams {
  const rng = new Rng(seed);
  const dwarf = lumSun < 5e8;
  const pEll = Math.min(0.8, 0.1 + 0.35 * Math.log10(1 + envDensity));
  let type: GalaxyType;
  if (dwarf) type = rng.chance(0.4 + pEll * 0.3) ? 'dwarf-elliptical' : 'dwarf-irregular';
  else {
    const u = rng.next();
    if (u < pEll * 0.7) type = 'elliptical';
    else if (u < pEll) type = 'lenticular';
    else if (u < pEll + 0.012) type = 'ring';
    else if (u < pEll + 0.06) type = 'irregular';
    else type = rng.chance(0.6) ? 'barred-spiral' : 'spiral';
  }
  const hubble = rng.pick(HUBBLE[type]);
  // size–luminosity relation (R ∝ L^0.35); MW: L≈2.5e10 → R≈50 000 ly
  const radius = 50000 * Math.pow(lumSun / 2.5e10, 0.35) * rng.range(0.75, 1.3);
  const diskScale = radius / rng.range(4.5, 6.5);
  const diskHeight = diskScale * rng.range(0.03, 0.06) * (type === 'lenticular' ? 2 : 1);
  const lateness = hubble.includes('a') ? 0 : hubble.includes('b') ? 0.4 : hubble.includes('c') ? 0.7 : 1;
  const ell = parseInt(hubble.replace(/\D/g, '') || '0', 10);
  const qv = new Vector3();
  rng.unitVector(qv);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), qv);
  q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rng.range(0, TAU)));
  const stellarMass = lumSun * rng.range(1.2, 2.2);
  const g: GalaxyParams = {
    id, name, seed, type, hubble, upos, q,
    radius,
    diskScale,
    diskHeight,
    bulgeScale: type === 'elliptical' || type === 'dwarf-elliptical' ? radius * rng.range(0.12, 0.25) : diskScale * rng.range(0.15, 0.35) * (1.2 - lateness * 0.6),
    bulgeWeight: type === 'elliptical' ? 1 : type === 'lenticular' ? 3 : 4.5 * (1 - lateness * 0.75),
    barLength: type === 'barred-spiral' || (type === 'lenticular' && hubble === 'SB0') ? diskScale * rng.range(0.6, 1.3) : 0,
    barAngle: rng.range(0, Math.PI),
    arms: type === 'spiral' || type === 'barred-spiral' ? (rng.chance(0.55) ? 2 : rng.int(3, 4)) : 0,
    pitch: (10 + 20 * lateness + rng.range(-4, 4)) * (Math.PI / 180),
    armWidth: rng.range(0.3, 0.75),
    armContrast: type === 'spiral' || type === 'barred-spiral' ? rng.range(0.55, 0.95) : type === 'ring' ? 0.3 : 0,
    ellipAxes: type === 'elliptical' || type === 'dwarf-elliptical' ? [1, 1 - ell / 10, rng.range(1 - ell / 10, 1)] : [1, 1, 1],
    ringRadius: type === 'ring' ? radius * rng.range(0.45, 0.7) : 0,
    dust: type === 'elliptical' || type === 'dwarf-elliptical' ? rng.range(0, 0.05) : type === 'lenticular' ? rng.range(0.05, 0.3) : rng.range(0.4, 1),
    starFormation: type === 'elliptical' || type === 'dwarf-elliptical' ? 0.02 : type === 'lenticular' ? 0.1 : 0.4 + 0.6 * lateness,
    stellarMass,
    centralDensity: 0,
    agn: rng.chance(0.08) ? rng.range(0.3, 1) : rng.chance(0.3) ? rng.range(0, 0.2) : 0,
    bhMass: Math.pow(10, 8.2 + 1.1 * Math.log10(stellarMass / 1e11) + rng.normal(0, 0.3)),
    warp: envDensity > 3 && rng.chance(0.15) ? rng.range(0.2, 1) : 0,
    ageGyr: type.includes('elliptical') ? rng.range(9, 12.5) : rng.range(6, 12),
    metallicity: Math.max(-2, Math.min(0.4, 0.3 * Math.log10(stellarMass / 5e10) + rng.normal(0, 0.15))),
    known: false,
  };
  // star-density normalisation is deferred until someone needs resolved stars
  return g;
}

/** Ensure centralDensity is set (lazy: a Monte-Carlo integral over the galaxy). */
export function ensureDensity(g: GalaxyParams) {
  if (!(g.centralDensity > 0)) normaliseDensity(g);
}

/** Set centralDensity so the integrated star count matches stellarMass / <m>. */
export function normaliseDensity(g: GalaxyParams) {
  g.centralDensity = 1;
  // Monte-Carlo integral over the bounding box (deterministic samples)
  const rng = new Rng(g.seed ^ 0x55aa);
  const R = g.radius * 1.4, H = g.type.includes('elliptical') ? R : Math.max(g.diskHeight * 12, g.bulgeScale * 4);
  let sum = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const x = rng.range(-R, R), y = rng.range(-H, H), z = rng.range(-R, R);
    sum += totalDensity(g, x, y, z);
  }
  const vol = 2 * R * 2 * H * 2 * R;
  const integral = (sum / N) * vol;
  const nStars = g.stellarMass / 0.6; // mean mass per star incl. remnants & brown dwarfs
  g.centralDensity = nStars / Math.max(integral, 1e-30);
}
