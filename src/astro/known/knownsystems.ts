/**
 * Builds simulated systems for catalogued stars. Measured quantities (star
 * parameters, companion orbits, planet orbits & masses) come from the
 * catalogue; anything unmeasured (planet radii when only masses are known,
 * atmospheres, surfaces) is modelled and labelled as such. Stars with no
 * confirmed planets receive procedural planets explicitly marked
 * "hypothetical".
 */
import { Body, StarSystem } from '../body';
import { AU, EARTH_MASS, EARTH_RADIUS, G, JUPITER_MASS, SOLAR_LUMINOSITY, SOLAR_MASS, SOLAR_RADIUS, DAY } from '../../core/constants';
import { generatePlanet, type Formation } from '../planetgen';
import { generateSystem } from '../systemgen';
import { blackbodyRGB, msLifetime } from '../stellar';
import { visualEfficacy } from '../photometry';
import { Rng, seedOf } from '../../core/rng';
import type { StarPhysics, StellarStage } from '../types';
import type { UPos } from '../../core/upos';
import type { KnownStarEntry } from './stars';

const DEG = Math.PI / 180;

function stageFromSpec(spec: string, kind?: string): StellarStage {
  if (kind === 'white-dwarf' || spec.startsWith('D')) return 'white-dwarf';
  if (kind === 'neutron-star' || spec === 'NS') return 'neutron-star';
  if (kind === 'black-hole' || spec === 'BH' || spec === 'SMBH') return 'black-hole';
  if (spec.includes('III')) return spec.startsWith('M7') ? 'asymptotic-giant' : 'red-giant';
  if (/Ia|Ib|II|LBV|WR/.test(spec)) return 'supergiant';
  if (spec.includes('IV') && !spec.includes('IV-V')) return 'subgiant';
  return 'main-sequence';
}

export function knownStarPhysics(e: { spec: string; mass: number; lum: number; temp: number; radius: number; kind?: string }, ageGyr: number, pulsarPeriod?: number): StarPhysics {
  const stage = stageFromSpec(e.spec, e.kind);
  const T = e.temp;
  const st: StarPhysics = {
    mass: e.mass * SOLAR_MASS,
    radius: stage === 'black-hole' ? (2 * G * e.mass * SOLAR_MASS) / 299792458 ** 2 : e.radius * SOLAR_RADIUS,
    luminosity: e.lum * SOLAR_LUMINOSITY,
    temperature: T,
    spectralType: e.spec,
    stage,
    age: ageGyr * 1e9,
    lifetime: msLifetime(Math.max(e.mass, 0.08)),
    metallicity: 0,
    rotationPeriod: stage === 'neutron-star' ? (pulsarPeriod ?? 1) : 20 * DAY,
    activity: e.spec.includes('M') && stage === 'main-sequence' ? 0.6 : 0.2,
    color: T > 0 ? (blackbodyRGB(T).map((c) => c * visualEfficacy(T)) as [number, number, number]) : [0, 0, 0],
  };
  if (stage === 'neutron-star') { st.pulsarPeriod = pulsarPeriod; st.magneticField = 4e8; }
  return st;
}

function kindOf(st: StarPhysics): Body['kind'] {
  return st.stage === 'white-dwarf' ? 'white-dwarf' : st.stage === 'neutron-star' ? 'neutron-star' : st.stage === 'black-hole' ? 'black-hole' : 'star';
}

export function buildKnownSystem(e: KnownStarEntry, id: string, upos: UPos, lifeFrequency: number): StarSystem {
  const age = e.ageGyr ?? 4;
  const rng = new Rng(seedOf('known', e.id));
  const primary = knownStarPhysics(e, age, e.pulsarPeriod);
  const rot = () => ({ period: primary.rotationPeriod, tilt: rng.range(0, 0.4), tiltAzimuth: rng.range(0, 6.28), phase0: 0, locked: false });

  // stars without confirmed planets and without known companions: hypothetical procedural planets
  if (!e.planets && !e.companion && primary.stage !== 'black-hole' && primary.stage !== 'neutron-star') {
    const sys = generateSystem({ id, name: e.name, seed: seedOf('known-sys', e.id), upos, primaryMass: e.mass, age: age * 1e9, metallicity: 0, lifeFrequency, forceSingle: true });
    const root = sys.root;
    Object.assign(root.star!, primary);
    (root as { radius: number }).radius = primary.radius;
    root.name = e.name;
    for (const b of sys.bodies) if (b.planet) b.planet.classLabel += ' · hypothetical (procedural)';
    sys.notes = `${e.note ? e.note + ' ' : ''}Star parameters from catalogue (approximate). No confirmed planets: the planets shown are procedural and hypothetical.`;
    return rebuildKnown(sys);
  }

  let root: Body;
  let host: Body;
  if (e.companion) {
    const c = e.companion;
    const sec = knownStarPhysics({ ...c, kind: c.kind }, age);
    const M = primary.mass + sec.mass;
    root = new Body(`${id}/bary`, `${e.name} barycentre`, 'barycenter', null, M, 0, null, { period: Infinity, tilt: 0, tiltAzimuth: 0, phase0: 0, locked: false }, undefined, undefined, true);
    const mu = G * M;
    const aBin = c.a * AU;
    const base = { e: c.e, i: rng.range(0, 0.3), node: rng.range(0, 6.28), peri: rng.range(0, 6.28), M0: rng.range(0, 6.28), epoch: 0 };
    host = new Body(`${id}/A`, e.name.includes(' A') ? e.name : `${e.name} A`, kindOf(primary), root, primary.mass, primary.radius,
      { ...base, a: aBin * (sec.mass / M), mu: mu * Math.pow(sec.mass / M, 3) }, rot(), primary, undefined, true);
    new Body(`${id}/B`, c.name, c.kind === 'brown-dwarf' ? 'brown-dwarf' : kindOf(sec), root, sec.mass, sec.radius,
      { ...base, a: aBin * (primary.mass / M), peri: base.peri + Math.PI, mu: mu * Math.pow(primary.mass / M, 3) }, rot(), sec, undefined, true);
  } else {
    root = new Body(`${id}/A`, e.name, kindOf(primary), null, primary.mass, primary.radius, null, rot(), primary, undefined, true);
    host = root;
  }
  // confirmed / candidate planets
  for (let i = 0; i < (e.planets?.length ?? 0); i++) {
    const kp = e.planets![i];
    const me = kp.massEarth;
    const formation: Formation = me > 60 ? 'gas-giant' : me > 12 ? 'ice-giant' : me > 2.5 && !kp.radiusEarth ? 'mini-neptune' : 'rocky';
    const a = kp.a * AU;
    const phys = generatePlanet({
      seed: seedOf('known-planet', e.id, i), isMoon: false, mass: me * EARTH_MASS, formation, starLum: primary.luminosity, starTemp: primary.temperature,
      starMass: primary.mass, starAge: age * 1e9, starActivity: primary.activity, starIsRemnant: false, distance: a, ecc: kp.e ?? 0,
      carbonRich: false, metallicity: 0, lifeFrequency,
    }, kp.radiusEarth ? { physics: { radius: kp.radiusEarth * EARTH_RADIUS } } : undefined);
    if (kp.radiusEarth && phys.surface) phys.surface.radius = kp.radiusEarth * EARTH_RADIUS;
    phys.knownSource = `NASA Exoplanet Archive (${kp.status}): orbit and ${kp.radiusEarth ? 'mass/radius' : 'minimum mass'}; atmosphere and surface are modelled`;
    if (kp.status === 'candidate') phys.classLabel += ' · candidate';
    if (kp.note) phys.anomalies.push(kp.note);
    const R = phys.radius;
    new Body(`${id}/p${i}`, kp.name, 'planet', host, me * EARTH_MASS, R,
      { a, e: kp.e ?? 0, i: rng.range(0, 2) * DEG, node: rng.range(0, 6.28), peri: rng.range(0, 6.28), M0: rng.range(0, 6.28), epoch: 0, mu: G * (host.mass + me * EARTH_MASS) },
      { period: phys.tidallyLocked ? 0 : rng.range(10, 60) * 3600, tilt: phys.tidallyLocked ? 0 : rng.range(0, 0.5), tiltAzimuth: rng.range(0, 6.28), phase0: 0, locked: phys.tidallyLocked },
      undefined, phys, true);
  }
  const sys = new StarSystem(id, e.name, upos, root, true);
  sys.notes = `${e.note ? e.note + ' ' : ''}Catalogue values (approximate).`;
  return sys;
}

/** Re-wrap a generated system so every body carries the 'known' system flag. */
function rebuildKnown(sys: StarSystem): StarSystem {
  const s2 = new StarSystem(sys.id, sys.name, sys.upos, sys.root, true);
  s2.belts = sys.belts;
  s2.notes = sys.notes;
  s2.q.copy(sys.q);
  return s2;
}

export { JUPITER_MASS };
