/**
 * Star-system formation model (deterministic from a seed).
 *
 * - multiplicity from primary mass (Raghavan et al. 2010 trends), log-normal
 *   separations; S-type (around one star) and P-type (circumbinary) planet
 *   zones respect Holman & Wiegert (1999) stability limits
 * - planets on roughly log-spaced orbits with ≥ ~8 mutual Hill radii
 * - inside the snow line: rocky worlds and mini-Neptunes; outside: giants
 *   with metallicity-dependent occurrence (Fischer & Valenti 2005), ice
 *   giants and icy dwarfs; occasional hot-Jupiter migration
 * - evolved hosts engulf inner planets; white dwarfs keep only survivors
 * - moons (regular satellites of giants, giant-impact moons of rocky planets)
 * - asteroid belts in giant-induced gaps, Kuiper belts, dwarf planets, comets
 */
import { Rng, seedOf } from '../core/rng';
import { AU, DAY, EARTH_MASS, G, JUPITER_MASS, SOLAR_LUMINOSITY, SOLAR_MASS } from '../core/constants';
import { Body, StarSystem, type BeltInfo } from './body';
import { makeStar, msLuminosity, sampleIMF } from './stellar';
import { generatePlanet, type Formation } from './planetgen';
import type { OrbitElements } from './orbit';
import type { StarPhysics } from './types';
import { UPos } from '../core/upos';
import { Vector3 } from 'three';

export interface SystemSpec {
  id: string;
  name: string;
  seed: number;
  upos: UPos;
  /** initial mass of the primary (M☉) if already known from the galaxy model */
  primaryMass?: number;
  age?: number;          // yr
  metallicity?: number;  // dex
  lifeFrequency?: number;
  /** force a single star (catalogue stars whose multiplicity is known) */
  forceSingle?: boolean;
  /** force a black-hole pair (tests, showcases) */
  binaryBlackHole?: boolean;
}

const DEG = Math.PI / 180;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
const LETTERS = 'bcdefghijklmnopqrstuvwxyz';

function rayleigh(rng: Rng, sigma: number) {
  return sigma * Math.sqrt(-2 * Math.log(Math.max(rng.next(), 1e-12)));
}

function orbit(rng: Rng, a: number, e: number, inc: number, mu: number): OrbitElements {
  return { a, e, i: inc, node: rng.range(0, Math.PI * 2), peri: rng.range(0, Math.PI * 2), M0: rng.range(0, Math.PI * 2), epoch: 0, mu };
}

function starKind(st: StarPhysics): Body['kind'] {
  switch (st.stage) {
    case 'white-dwarf': return 'white-dwarf';
    case 'neutron-star': return 'neutron-star';
    case 'black-hole': return 'black-hole';
    case 'brown-dwarf': return 'brown-dwarf';
    default: return 'star';
  }
}

export function generateSystem(spec: SystemSpec): StarSystem {
  const rng = new Rng(spec.seed);
  const age = spec.age ?? rng.range(0.3e9, 11e9);
  const Z = spec.metallicity ?? rng.normal(-0.05, 0.22);
  const lifeF = spec.lifeFrequency ?? 1;
  const m1 = spec.binaryBlackHole ? rng.range(28, 60) : spec.primaryMass ?? sampleIMF(rng, 0.08, 60);
  const star1 = makeStar(m1, spec.binaryBlackHole ? Math.max(age, 2e8) : age, Z, rng.fork('s1'));

  // ---- multiplicity
  const pBinary = m1 < 0.1 ? 0.15 : m1 < 0.5 ? 0.27 : m1 < 1.5 ? 0.44 : m1 < 5 ? 0.6 : 0.75;
  // massive binaries evolve together: a black-hole primary often keeps a
  // compact companion (the LIGO population: BH–BH pairs at 0.01–1 AU,
  // spiralling in by gravitational waves over millions of years)
  const bbh = spec.binaryBlackHole || (star1.stage === 'black-hole' && !spec.forceSingle && rng.chance(0.25));
  const binary = bbh || (rng.chance(pBinary) && !spec.forceSingle);
  let star2: StarPhysics | null = null;
  let m2 = 0, aBin = 0, eBin = 0;
  if (bbh) {
    m2 = m1 * rng.range(0.6, 1);
    star2 = makeStar(Math.max(m2, 25), Math.max(age, 2e8), Z, rng.fork('s2'));
    if (star2.stage !== 'black-hole') star2 = null;
    aBin = Math.pow(10, rng.range(-2, 0)) * AU;
    eBin = rng.range(0, 0.1);
  } else if (binary) {
    m2 = Math.max(0.08, m1 * rng.range(0.1, 1));
    star2 = makeStar(m2, age, Z, rng.fork('s2'));
    aBin = Math.pow(10, rng.normal(1.6, 1.3)) * AU;
    aBin = Math.min(Math.max(aBin, 0.02 * AU), 5000 * AU);
    eBin = aBin < 0.2 * AU ? rng.range(0, 0.05) : rng.range(0, 0.7);
  }

  const rot = (st: StarPhysics) => ({ period: st.rotationPeriod, tilt: rng.range(0, 0.4), tiltAzimuth: rng.range(0, Math.PI * 2), phase0: rng.range(0, 6.28), locked: false });
  let root: Body;
  const stars: Body[] = [];
  const sid = spec.id;
  if (star2) {
    const M = star1.mass + star2.mass;
    root = new Body(`${sid}/bary`, `${spec.name} barycentre`, 'barycenter', null, M, 0, null,
      { period: Infinity, tilt: 0, tiltAzimuth: 0, phase0: 0, locked: false });
    const mu = G * M;
    const inc = rayleigh(rng, 2 * DEG);
    const o1 = orbit(rng, aBin * (star2.mass / M), eBin, inc, mu);
    const o2: OrbitElements = { ...o1, a: aBin * (star1.mass / M), peri: o1.peri + Math.PI };
    // each star orbits the barycentre on a scaled orbit (same period)
    const muScaled1 = mu * Math.pow(star2.mass / M, 3);
    const muScaled2 = mu * Math.pow(star1.mass / M, 3);
    stars.push(new Body(`${sid}/A`, `${spec.name} A`, starKind(star1), root, star1.mass, star1.radius, { ...o1, mu: muScaled1 }, rot(star1), star1));
    stars.push(new Body(`${sid}/B`, `${spec.name} B`, starKind(star2), root, star2.mass, star2.radius, { ...o2, mu: muScaled2 }, rot(star2), star2));
  } else {
    root = new Body(`${sid}/A`, spec.name, starKind(star1), null, star1.mass, star1.radius, null, rot(star1), star1);
    stars.push(root);
  }

  // ---- planet hosts & zones
  const belts: BeltInfo[] = [];
  const hosts: { body: Body; mass: number; lumMS: number; lum: number; temp: number; star: StarPhysics; aMin: number; aMax: number; tag: string }[] = [];
  const zone = (st: StarPhysics, mInit: number) => {
    const mS = st.mass / SOLAR_MASS;
    let aMin = Math.max(0.012 * AU * Math.cbrt(Math.max(mS, 0.05)), st.radius * 3);
    const aMax = 70 * AU * Math.sqrt(Math.max(mInit, 0.08));
    if (st.stage === 'red-giant' || st.stage === 'asymptotic-giant' || st.stage === 'supergiant' || st.stage === 'horizontal-branch') aMin = Math.max(aMin, st.radius * 4);
    if (st.stage === 'white-dwarf' || st.stage === 'neutron-star' || st.stage === 'black-hole') aMin = Math.max(aMin, (mInit > 1 ? 2 : 1.2) * AU);
    return { aMin, aMax };
  };
  if (star2 && aBin < 3 * AU) {
    // circumbinary (P-type): stable beyond ~(2.3–4) a_bin
    const z = zone(star1, m1);
    const aMin = Math.max(z.aMin, aBin * (2.4 + 2.5 * eBin));
    hosts.push({ body: root, mass: star1.mass + star2.mass, lumMS: (msLuminosity(m1) + msLuminosity(m2)) * SOLAR_LUMINOSITY, lum: star1.luminosity + star2.luminosity, temp: star1.temperature, star: star1, aMin, aMax: z.aMax, tag: '' });
  } else {
    const limit = star2 ? aBin * (0.46 - 0.38 * eBin) * 0.8 : Infinity; // S-type stability (Holman & Wiegert)
    const z1 = zone(star1, m1);
    hosts.push({ body: stars[0], mass: star1.mass, lumMS: msLuminosity(m1) * SOLAR_LUMINOSITY, lum: star1.luminosity, temp: star1.temperature, star: star1, aMin: z1.aMin, aMax: Math.min(z1.aMax, limit), tag: star2 ? ' A' : '' });
    if (star2) {
      const z2 = zone(star2, m2);
      hosts.push({ body: stars[1], mass: star2.mass, lumMS: msLuminosity(m2) * SOLAR_LUMINOSITY, lum: star2.luminosity, temp: star2.temperature, star: star2, aMin: z2.aMin, aMax: Math.min(z2.aMax, aBin * (0.46 - 0.38 * eBin) * 0.8 * Math.sqrt(m2 / m1)), tag: ' B' });
    }
  }

  const carbonRich = rng.chance(0.03);
  let hostIdx = 0;
  for (const h of hosts) {
    const hr = rng.fork(`host${hostIdx++}`);
    if (h.aMax <= h.aMin * 1.3) continue;
    const mS = h.mass / SOLAR_MASS;
    const snow = 2.7 * AU * Math.sqrt(h.lumMS / SOLAR_LUMINOSITY);
    const nMean = Math.min(9, 3.5 * (1 + 0.8 * Z) * (mS < 0.3 ? 1.2 : 1));
    let n = hr.chance(0.12) ? 0 : Math.max(0, Math.min(12, hr.poisson(nMean)));
    if (h.star.stage === 'white-dwarf' || h.star.stage === 'neutron-star' || h.star.stage === 'black-hole') n = hr.chance(0.3) ? hr.int(1, 3) : 0;
    // orbits
    const as: number[] = [];
    let a = h.aMin * hr.logUniform(1.2, 5);
    for (let i = 0; i < n && a < h.aMax; i++) {
      as.push(a);
      a *= hr.range(1.4, 2.3);
    }
    // masses & formation types
    type P = { a: number; mass: number; f: Formation };
    const ps: P[] = [];
    const pGiant = Math.min(0.6, 0.12 * Math.pow(10, 1.6 * Z) * Math.pow(mS, 0.8));
    for (const ai of as) {
      let mass: number, f: Formation;
      if (ai < snow) {
        const me = Math.min(15, Math.max(0.02, Math.pow(10, hr.normal(-0.05, 0.55))));
        if (me > 2 && hr.chance(0.45)) { f = 'mini-neptune'; mass = me * hr.range(1, 2.5) * EARTH_MASS; }
        else { f = 'rocky'; mass = me * EARTH_MASS; }
      } else {
        const nearSnow = Math.exp(-Math.log(ai / snow) / 1.5);
        if (hr.chance(pGiant * (0.6 + nearSnow))) { f = 'gas-giant'; mass = hr.logUniform(0.08, 8) * JUPITER_MASS; }
        else if (hr.chance(0.35)) { f = 'ice-giant'; mass = hr.range(8, 25) * EARTH_MASS; }
        else { f = hr.chance(0.6) ? 'icy' : 'rocky'; mass = Math.pow(10, hr.normal(-1, 0.6)) * EARTH_MASS; }
      }
      ps.push({ a: ai, mass, f });
    }
    // hot Jupiter migration
    const gi = ps.findIndex((p) => p.f === 'gas-giant');
    if (gi >= 0 && hr.chance(0.06 * Math.pow(10, 1.5 * Z))) {
      const aHot = Math.max(h.aMin * 1.2, hr.range(0.02, 0.08) * AU * Math.cbrt(mS));
      const giant = ps[gi];
      ps.splice(0, gi + 1);
      ps.unshift({ ...giant, a: aHot });
    }
    // asteroid belt in the gap inside the first giant
    const firstGiant = ps.findIndex((p) => p.f === 'gas-giant');
    if (firstGiant > 0 && hr.chance(0.7)) {
      const inner = ps[firstGiant - 1].a * 1.3, outer = ps[firstGiant].a * 0.65;
      if (outer > inner * 1.15) belts.push({ name: `${spec.name}${h.tag} asteroid belt`, parent: h.body, inner, outer, thickness: 8 * DEG, count: 12000, icy: false, seed: hr.int(0, 1e9) });
    }
    // Kuiper belt beyond the outermost planet
    const outermost = ps.length ? ps[ps.length - 1].a : h.aMin * 10;
    if (hr.chance(0.6) && outermost * 1.5 < h.aMax * 2) {
      belts.push({ name: `${spec.name}${h.tag} Kuiper belt`, parent: h.body, inner: outermost * 1.4, outer: outermost * 2.4, thickness: 12 * DEG, count: 15000, icy: true, seed: hr.int(0, 1e9) });
      const nd = hr.int(0, 3);
      for (let k = 0; k < nd; k++) ps.push({ a: outermost * hr.range(1.5, 2.6), mass: hr.logUniform(5e-4, 0.01) * EARTH_MASS, f: 'icy' });
    }
    // build planets
    let letter = 0;
    ps.sort((x, y) => x.a - y.a);
    for (let pi = 0; pi < ps.length; pi++) {
      const pl = ps[pi];
      const pr = hr.fork(`p${pi}`);
      const isDwarf = pl.mass < 0.008 * EARTH_MASS;
      const e = isDwarf ? pr.range(0.05, 0.3) : pl.f === 'gas-giant' && pr.chance(0.12) ? pr.range(0.15, 0.55) : Math.min(0.4, rayleigh(pr, 0.035));
      const inc = isDwarf ? pr.range(0, 20) * DEG : rayleigh(pr, 1.5 * DEG);
      const pseed = seedOf(spec.seed, 'planet', hostIdx, pi);
      const phys = generatePlanet({
        seed: pseed, isMoon: false, mass: pl.mass, formation: pl.f, starLum: h.lum, starTemp: h.temp, starMass: h.mass,
        starAge: age, starActivity: h.star.activity, starIsRemnant: h.star.stage === 'white-dwarf' || h.star.stage === 'neutron-star' || h.star.stage === 'black-hole',
        distance: pl.a, ecc: e, carbonRich, metallicity: Z, lifeFrequency: lifeF,
      });
      const name = isDwarf ? `${spec.name}${h.tag} ${String.fromCharCode(945 + (pi % 20))}` : `${spec.name}${h.tag} ${LETTERS[letter++ % LETTERS.length]}`;
      const rotP = phys.tidallyLocked ? 0 : (pr.chance(0.1) ? -1 : 1) * (phys.type === 'gas-giant' ? pr.range(9, 16) : phys.type === 'ice-giant' ? pr.range(14, 20) : pr.logUniform(10, 120)) * 3600;
      const tilt = phys.tidallyLocked ? pr.range(0, 0.04) : pr.chance(0.05) ? pr.range(1.4, 1.75) : Math.abs(pr.normal(0, 0.35));
      const planet = new Body(`${sid}/${hostIdx - 1}.${pi}`, name, isDwarf ? 'dwarf-planet' : 'planet', h.body, pl.mass, phys.radius,
        orbit(pr, pl.a, e, inc, G * (h.mass + pl.mass)),
        { period: rotP, tilt, tiltAzimuth: pr.range(0, Math.PI * 2), phase0: pr.range(0, 6.28), locked: phys.tidallyLocked },
        undefined, phys);
      // Jupiter-like giants collect Trojan swarms at L4/L5
      if (phys.type === 'gas-giant' && e < 0.15 && pr.chance(0.6)) {
        belts.push({ name: `${name} Trojans`, parent: h.body, inner: pl.a, outer: pl.a, thickness: 12 * DEG, count: 4000, icy: pl.a > snow, seed: pr.int(0, 1e9), trojanOf: planet });
      }
      // ---- moons
      const isGiant = phys.type === 'gas-giant' || phys.type === 'ice-giant';
      let nm = 0;
      if (isGiant) nm = pr.int(phys.type === 'gas-giant' ? 1 : 1, phys.type === 'gas-giant' ? 6 : 4);
      else if (pl.mass > 0.3 * EARTH_MASS && pr.chance(0.15)) nm = 1;
      else if (pl.mass > 0.05 * EARTH_MASS && pr.chance(0.15)) nm = pr.int(1, 2);
      // Hill radius limits moon orbits
      const hill = pl.a * (1 - e) * Math.cbrt(pl.mass / (3 * h.mass));
      let ma = phys.radius * (isGiant ? pr.range(3, 6) : pr.range(8, 25));
      for (let mi = 0; mi < nm && ma < hill * 0.4; mi++) {
        const mr = pr.fork(`m${mi}`);
        let mm: number;
        if (isGiant) mm = pl.mass * mr.logUniform(phys.type === 'gas-giant' ? 2e-6 : 5e-7, phys.type === 'gas-giant' ? 1.2e-4 : 4e-5);
        else if (nm === 1 && pl.mass > 0.3 * EARTH_MASS) mm = pl.mass * mr.range(0.004, 0.03);
        else mm = mr.logUniform(1e15, 1e19);
        const icyMoon = pl.a > snow * 0.8;
        // free eccentricities damp tidally; only resonant chains (≈25%) keep a forced e (Io/Europa)
        const me = isGiant ? (mr.chance(0.25) ? mr.range(0.002, 0.012) : rayleigh(mr, 0.0008)) : Math.min(0.1, rayleigh(mr, 0.03));
        const mphys = generatePlanet({
          seed: seedOf(pseed, 'moon', mi), isMoon: true, mass: mm, formation: mm < 1e19 ? 'asteroid' : icyMoon ? 'icy' : 'rocky',
          starLum: h.lum, starTemp: h.temp, starMass: h.mass, starAge: age, starActivity: h.star.activity,
          starIsRemnant: h.star.stage === 'white-dwarf', distance: pl.a, ecc: e, carbonRich, metallicity: Z, lifeFrequency: lifeF,
          host: { mass: pl.mass, radius: phys.radius, moonA: ma, moonE: me, isGiant },
        });
        const minc = rayleigh(mr, 0.5 * DEG);
        // regular moons orbit in the planet's equatorial plane: rotate by the planet's pole
        const mo = orbit(mr, ma, me, minc, G * (pl.mass + mm));
        mo.refQ = { x: planet.poleQ.x, y: planet.poleQ.y, z: planet.poleQ.z, w: planet.poleQ.w };
        new Body(`${planet.id}.${mi}`, `${name} ${ROMAN[mi]}`, 'moon', planet, mm, mphys.radius, mo,
          { period: mphys.tidallyLocked ? 0 : mr.logUniform(5, 50) * 3600, tilt: mr.range(0, 0.05), tiltAzimuth: 0, phase0: mr.range(0, 6.28), locked: mphys.tidallyLocked },
          undefined, mphys);
        ma *= mr.range(1.5, 2.4);
      }
    }
    // comets
    const nc = hr.chance(0.5) ? hr.int(1, 3) : 0;
    for (let ci = 0; ci < nc; ci++) {
      const cr = hr.fork(`c${ci}`);
      const q = cr.range(0.3, 2.5) * AU * Math.sqrt(h.lum / SOLAR_LUMINOSITY);
      const ecc = cr.range(0.6, 0.97);
      const ac = q / (1 - ecc);
      const cm = cr.logUniform(1e12, 5e14);
      const cphys = generatePlanet({ seed: seedOf(spec.seed, 'comet', hostIdx, ci), isMoon: false, mass: cm, formation: 'asteroid', starLum: h.lum, starTemp: h.temp,
        starMass: h.mass, starAge: age, starActivity: h.star.activity, starIsRemnant: false, distance: ac, ecc, carbonRich, metallicity: Z, lifeFrequency: 0 });
      cphys.classLabel = 'Comet nucleus';
      new Body(`${sid}/${hostIdx - 1}.c${ci}`, `${spec.name}${h.tag} comet ${ci + 1}`, 'comet', h.body, cm, cphys.radius,
        orbit(cr, ac, ecc, cr.range(0, 60) * DEG, G * h.mass), { period: cr.range(5, 50) * 3600, tilt: cr.range(0, 3), tiltAzimuth: 0, phase0: 0, locked: false }, undefined, cphys);
    }
  }

  const sys = new StarSystem(spec.id, spec.name, spec.upos.clone(), root);
  sys.belts = belts;
  // orientation of the system's invariable plane in the universe frame
  const qr = new Rng(seedOf(spec.seed, 'orient'));
  const ax = { x: 0, y: 0, z: 0 };
  qr.unitVector(ax);
  sys.q.setFromAxisAngle(new Vector3(ax.x, ax.y, ax.z), qr.range(0, Math.PI));
  return sys;
}
