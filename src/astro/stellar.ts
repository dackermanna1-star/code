/**
 * Stellar physics approximations.
 *
 * Main-sequence mass–luminosity and mass–radius relations, lifetimes, and a
 * piecewise evolutionary track (subgiant → red giant → horizontal branch →
 * AGB → white dwarf for low/intermediate mass; red supergiant → core collapse
 * → neutron star / black hole for massive stars). These are well-known
 * empirical fits, not a stellar-structure code; accuracy is ~tens of percent.
 */
import { GYR, SOLAR_LUMINOSITY, SOLAR_MASS, SOLAR_RADIUS, SOLAR_TEMP, YEAR, DAY } from '../core/constants';
import type { Rng } from '../core/rng';
import type { StarPhysics, StellarStage } from './types';
import { visualEfficacy } from './photometry';

/** Main-sequence luminosity (L☉) for mass (M☉). */
export function msLuminosity(m: number): number {
  if (m < 0.43) return 0.23 * Math.pow(m, 2.3);
  if (m < 2) return Math.pow(m, 4);
  if (m < 55) return 1.4 * Math.pow(m, 3.5);
  return 32000 * m;
}

/** Main-sequence radius (R☉) at ZAMS-ish. */
export function msRadius(m: number): number {
  return m < 1 ? Math.pow(m, 0.8) : Math.pow(m, 0.57);
}

/** Main-sequence lifetime in years. */
export function msLifetime(m: number): number {
  return (10e9 * m) / msLuminosity(m);
}

export function tempFromLR(lSun: number, rSun: number): number {
  return SOLAR_TEMP * Math.pow(lSun / (rSun * rSun), 0.25);
}

const CLASSES: [string, number, number][] = [
  ['O', 30000, 50000], ['B', 10000, 30000], ['A', 7500, 10000], ['F', 6000, 7500],
  ['G', 5200, 6000], ['K', 3700, 5200], ['M', 2400, 3700], ['L', 1300, 2400], ['T', 550, 1300], ['Y', 250, 550],
];

export function spectralClass(T: number): { cls: string; sub: number } {
  for (const [c, lo, hi] of CLASSES) {
    if (T >= lo) {
      const t = Math.min(1, (Math.log(Math.min(T, hi)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)));
      const sub = Math.max(0, Math.min(9, Math.round((1 - t) * 9)));
      return { cls: c, sub };
    }
  }
  return { cls: 'Y', sub: 9 };
}

/** Linear-sRGB colour of a blackbody, normalised to unit luminance (matches the GLSL version). */
export function blackbodyRGB(T: number): [number, number, number] {
  T = Math.min(40000, Math.max(800, T));
  const t = T / 100;
  let r: number, g: number, b: number;
  r = t <= 66 ? 1 : Math.min(1, Math.max(0, 1.292936 * Math.pow(t - 60, -0.1332047)));
  g = t <= 66 ? Math.min(1, Math.max(0, 0.3900816 * Math.log(t) - 0.6318414)) : Math.min(1, Math.max(0, 1.1298909 * Math.pow(t - 60, -0.0755148)));
  b = t >= 66 ? 1 : t <= 19 ? 0 : Math.min(1, Math.max(0, 0.5432068 * Math.log(t - 10) - 1.1962541));
  r = Math.pow(r, 2.2); g = Math.pow(g, 2.2); b = Math.pow(b, 2.2);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [r / lum, g / lum, b / lum];
}

/** Kroupa (2001) initial mass function sample, M☉, including brown dwarfs. */
export function sampleIMF(rng: Rng, min = 0.015, max = 120): number {
  // segment weights from integrating the piecewise power law
  const segs = [
    { a: 0.015, b: 0.08, alpha: 0.3, k: 1 / 0.08 ** -0.3 * (0.08 ** -1.3) },
    { a: 0.08, b: 0.5, alpha: 1.3, k: 1 },
    { a: 0.5, b: 150, alpha: 2.3, k: 0.5 },
  ];
  const integ = (s: { a: number; b: number; alpha: number; k: number }, lo: number, hi: number) => {
    lo = Math.max(lo, s.a); hi = Math.min(hi, s.b);
    if (hi <= lo) return 0;
    const p = 1 - s.alpha;
    return (s.k * (Math.pow(hi, p) - Math.pow(lo, p))) / p;
  };
  const w = segs.map((s) => integ(s, min, max));
  const tot = w.reduce((x, y) => x + y, 0);
  let u = rng.next() * tot;
  let si = 0;
  while (si < segs.length - 1 && u > w[si]) { u -= w[si]; si++; }
  const s = segs[si];
  const lo = Math.max(min, s.a), hi = Math.min(max, s.b);
  const p = 1 - s.alpha;
  const x = rng.next();
  return Math.pow(Math.pow(lo, p) + x * (Math.pow(hi, p) - Math.pow(lo, p)), 1 / p);
}

export interface StellarState {
  stage: StellarStage;
  massSun: number;     // current mass
  lumSun: number;
  radiusSun: number;
  temp: number;
  remnantKind?: 'white-dwarf' | 'neutron-star' | 'black-hole';
}

/**
 * Evolve a star of initial mass m (M☉) to the given age (yr).
 * Returns current luminosity, radius, temperature and stage.
 */
export function evolve(m: number, age: number, rng?: Rng): StellarState {
  if (m < 0.075) {
    // brown dwarf: cools over time (Burrows et al. scaling, roughly)
    const ageGyr = Math.max(age / 1e9, 0.01);
    const T = Math.max(300, 2600 * Math.pow(m / 0.07, 0.8) * Math.pow(ageGyr, -0.3));
    const R = 0.1 * (1 + 0.15 / Math.max(ageGyr, 0.1));
    const L = Math.pow(R, 2) * Math.pow(T / SOLAR_TEMP, 4);
    return { stage: 'brown-dwarf', massSun: m, lumSun: L, radiusSun: R, temp: T };
  }
  const tMS = msLifetime(m);
  const f = age / tMS;
  const L0 = msLuminosity(m), R0 = msRadius(m);
  if (f < 1) {
    // brightening along the main sequence (Sun: +40% over its MS life)
    const L = L0 * (0.72 + 0.6 * f + 0.3 * f * f);
    const R = R0 * (0.89 + 0.25 * f);
    const stage: StellarStage = m > 25 && f > 0.85 ? 'wolf-rayet' : 'main-sequence';
    return { stage, massSun: m, lumSun: L, radiusSun: R, temp: tempFromLR(L, R) };
  }
  const j = rng ? rng.next() : 0.5;
  if (m < 8) {
    if (f < 1.1) {
      const s = (f - 1) / 0.1;
      const L = L0 * (1.6 + 1.5 * s);
      const R = R0 * (1.3 + 2.0 * s);
      return { stage: 'subgiant', massSun: m, lumSun: L, radiusSun: R, temp: tempFromLR(L, R) };
    }
    if (f < 1.15) {
      // RGB: luminosity climbs ever faster, so stars spend most of the phase near the base
      const s = Math.pow((f - 1.1) / 0.05, 3);
      const L = Math.max(L0 * 3, 30 * Math.pow(m, 1.5)) * Math.pow(30, s);
      const T = 4800 - 900 * s;
      const R = Math.sqrt(L) * Math.pow(SOLAR_TEMP / T, 2);
      return { stage: 'red-giant', massSun: m * (1 - 0.1 * s), lumSun: L, radiusSun: R, temp: T };
    }
    if (f < 1.165) {
      // core-helium burning (horizontal branch / red clump): ~1% of the MS lifetime
      const L = 50 * Math.pow(m, 0.8);
      const T = 4800 + 2500 * j * (m < 1.5 ? 1 : 0.3);
      return { stage: 'horizontal-branch', massSun: m * 0.85, lumSun: L, radiusSun: Math.sqrt(L) * Math.pow(SOLAR_TEMP / T, 2), temp: T };
    }
    if (f < 1.168) {
      const L = 3000 * Math.pow(m, 0.8);
      const T = 3100;
      return { stage: 'asymptotic-giant', massSun: m * 0.7, lumSun: L, radiusSun: Math.sqrt(L) * Math.pow(SOLAR_TEMP / T, 2), temp: T };
    }
    // white dwarf: initial–final mass relation and cooling
    const mwd = Math.min(1.35, 0.55 + 0.08 * (m - 1));
    const tCool = Math.max((age - tMS * 1.168) / 1e6, 0.1); // Myr
    const T = Math.max(3500, 100000 * Math.pow(tCool, -0.35) * 0.45 + 3500);
    const R = 0.0126 * Math.pow(mwd / 0.6, -1 / 3);
    const L = R * R * Math.pow(T / SOLAR_TEMP, 4);
    return { stage: 'white-dwarf', massSun: mwd, lumSun: L, radiusSun: R, temp: T, remnantKind: 'white-dwarf' };
  }
  // massive stars
  if (f < 1.1) {
    const red = m < 40 || j < 0.5;
    const L = L0 * 1.3;
    const T = red ? 3500 + 600 * j : 9000 + 15000 * j;
    return { stage: 'supergiant', massSun: m * 0.8, lumSun: L, radiusSun: Math.sqrt(L) * Math.pow(SOLAR_TEMP / T, 2), temp: T };
  }
  if (m < 20) {
    // neutron star: tiny, hot; thermal glow fades
    const T = Math.max(3e5, 1e6 * Math.pow(Math.max((age - tMS * 1.1) / 1e6, 0.01), -0.1));
    const R = 12e3 / SOLAR_RADIUS;
    return { stage: 'neutron-star', massSun: 1.2 + 0.6 * j, lumSun: R * R * Math.pow(T / SOLAR_TEMP, 4), radiusSun: R, temp: T, remnantKind: 'neutron-star' };
  }
  const mbh = Math.max(3, m * (0.25 + 0.2 * j));
  return { stage: 'black-hole', massSun: mbh, lumSun: 0, radiusSun: (2 * 6.674e-11 * mbh * SOLAR_MASS) / (299792458 ** 2) / SOLAR_RADIUS, temp: 0, remnantKind: 'black-hole' };
}

export function luminosityClass(stage: StellarStage, lumSun: number): string {
  switch (stage) {
    case 'main-sequence': return 'V';
    case 'subgiant': return 'IV';
    case 'red-giant': case 'horizontal-branch': return 'III';
    case 'asymptotic-giant': return lumSun > 1e4 ? 'II' : 'III';
    case 'supergiant': return lumSun > 2e5 ? 'Ia' : 'Ib';
    case 'wolf-rayet': return '';
    case 'white-dwarf': return 'D';
    case 'brown-dwarf': return 'V';
    default: return '';
  }
}

/** Build a full StarPhysics record from initial mass, age and metallicity. */
export function makeStar(massInit: number, age: number, metallicity: number, rng: Rng): StarPhysics {
  const st = evolve(massInit, age, rng);
  const lifetime = msLifetime(massInit);
  let spectral: string;
  if (st.stage === 'white-dwarf') spectral = `D${st.temp > 12000 ? 'A' : st.temp > 6000 ? 'B' : 'C'}${Math.min(9, Math.round(50400 / st.temp))}`;
  else if (st.stage === 'neutron-star') spectral = 'NS';
  else if (st.stage === 'black-hole') spectral = 'BH';
  else if (st.stage === 'wolf-rayet') spectral = `WN${rng.int(2, 8)}`;
  else {
    const sc = spectralClass(st.temp);
    spectral = `${sc.cls}${sc.sub}${luminosityClass(st.stage, st.lumSun)}`;
  }
  // rotation & magnetic activity: young and low-mass stars spin fast and flare
  const ageGyr = age / 1e9;
  let rot: number;
  if (st.stage === 'neutron-star') rot = rng.logUniform(0.0016, 5);
  else if (st.stage === 'white-dwarf') rot = rng.logUniform(600, 86400 * 3);
  else if (massInit > 1.4) rot = rng.range(0.5, 3) * DAY;
  else rot = (8 + 22 * Math.sqrt(ageGyr / 4.6) * Math.pow(massInit, -0.5)) * DAY * rng.range(0.7, 1.3);
  let activity = 0;
  if (st.stage === 'main-sequence' || st.stage === 'brown-dwarf') {
    activity = Math.min(1, 0.25 * Math.pow(Math.max(ageGyr, 0.05) / 4.6, -0.6) * Math.pow(Math.max(massInit, 0.08), -0.7));
  } else if (st.stage === 'red-giant' || st.stage === 'asymptotic-giant') activity = 0.2;
  const star: StarPhysics = {
    mass: st.massSun * SOLAR_MASS,
    radius: st.radiusSun * SOLAR_RADIUS,
    luminosity: st.lumSun * SOLAR_LUMINOSITY,
    temperature: st.temp,
    spectralType: spectral,
    stage: st.stage,
    age,
    lifetime,
    metallicity,
    rotationPeriod: rot,
    activity: Math.max(0, Math.min(1, activity)),
    // colour carries photopic efficacy: a red dwarf of solar bolometric flux looks far dimmer
    color: st.temp > 0 ? (blackbodyRGB(st.temp).map((c) => c * visualEfficacy(st.temp)) as [number, number, number]) : [0, 0, 0],
  };
  if (st.stage === 'neutron-star') {
    star.pulsarPeriod = rot;
    star.magneticField = rng.logUniform(1e7, 1e11) * (rng.chance(0.05) ? 1000 : 1);
  }
  return star;
}

export { GYR, YEAR };
