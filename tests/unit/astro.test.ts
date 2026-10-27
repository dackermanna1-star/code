import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { solveKeplerE, orbitState, orbitalPeriod, elementsFromState, type OrbitElements } from '../../src/astro/orbit';
import { evolve, makeStar, msLuminosity, sampleIMF, spectralClass } from '../../src/astro/stellar';
import { Rng } from '../../src/core/rng';
import { AU, DAY, G, SOLAR_LUMINOSITY, SOLAR_MASS, YEAR } from '../../src/core/constants';
import { buildSolarSystem } from '../../src/astro/known/solarsystem';
import { UPos } from '../../src/core/upos';
import { generateSystem } from '../../src/astro/systemgen';

const SUN_MU = G * SOLAR_MASS;

describe('Kepler orbits', () => {
  it('solves Kepler\'s equation to machine precision for e ∈ [0, 0.99]', () => {
    for (const e of [0, 0.1, 0.5, 0.9, 0.99]) {
      for (let k = 0; k < 64; k++) {
        const M = -Math.PI + (k / 63) * 2 * Math.PI;
        const E = solveKeplerE(M, e);
        expect(E - e * Math.sin(E) - M).toBeCloseTo(0, 10);
      }
    }
  });

  it('conserves energy and angular momentum along an eccentric orbit', () => {
    const o: OrbitElements = { a: 1.5 * AU, e: 0.6, i: 0.3, node: 1.1, peri: 2.2, M0: 0.4, epoch: 0, mu: SUN_MU };
    const T = orbitalPeriod(o);
    const p = new Vector3(), v = new Vector3();
    let E0 = NaN, h0 = NaN;
    for (let k = 0; k <= 40; k++) {
      orbitState(o, (k / 40) * T, p, v);
      const E = v.lengthSq() / 2 - SUN_MU / p.length();
      const h = p.clone().cross(v).length();
      if (k === 0) { E0 = E; h0 = h; }
      expect(E / E0).toBeCloseTo(1, 9);
      expect(h / h0).toBeCloseTo(1, 9);
    }
    // vis-viva: specific energy = −μ/2a
    expect(E0).toBeCloseTo(-SUN_MU / (2 * o.a), -2);
  });

  it('round-trips state → elements → state', () => {
    const o: OrbitElements = { a: 7e6, e: 0.12, i: 0.9, node: 0.3, peri: 1.7, M0: 2.0, epoch: 1000, mu: 3.986e14 };
    const p = new Vector3(), v = new Vector3();
    orbitState(o, 5000, p, v);
    const o2 = elementsFromState(p, v, o.mu, 5000);
    const p2 = new Vector3(), v2 = new Vector3();
    orbitState(o2, 5000, p2, v2);
    expect(p2.distanceTo(p)).toBeLessThan(1e-3);
    expect(v2.distanceTo(v)).toBeLessThan(1e-6);
    expect(o2.a).toBeCloseTo(o.a, 0);
    expect(o2.e).toBeCloseTo(o.e, 9);
  });

  it('periods follow Kepler\'s third law', () => {
    const o: OrbitElements = { a: AU, e: 0.0167, i: 0, node: 0, peri: 0, M0: 0, epoch: 0, mu: SUN_MU };
    expect(orbitalPeriod(o) / DAY).toBeCloseTo(365.25, 0);
  });
});

describe('stellar physics', () => {
  it('reproduces the Sun', () => {
    expect(msLuminosity(1)).toBeCloseTo(1, 1);
    const s = makeStar(1, 4.6e9, 0, new Rng(1));
    expect(s.luminosity / SOLAR_LUMINOSITY).toBeGreaterThan(0.7);
    expect(s.luminosity / SOLAR_LUMINOSITY).toBeLessThan(1.4);
    expect(s.temperature).toBeGreaterThan(5300);
    expect(s.temperature).toBeLessThan(6200);
    expect(s.spectralType.startsWith('G')).toBe(true);
  });

  it('classifies temperatures into spectral classes', () => {
    expect(spectralClass(5772).cls).toBe('G');
    expect(spectralClass(3000).cls).toBe('M');
    expect(spectralClass(9600).cls).toBe('A');
    expect(spectralClass(30000).cls).toBe('O');
  });

  it('evolves massive stars into remnants', () => {
    expect(evolve(25, 20e6).stage).toMatch(/neutron-star|black-hole/);
    expect(evolve(2, 3e9).stage).toBe('white-dwarf');
    expect(evolve(0.3, 13e9).stage).toBe('main-sequence');
  });

  it('samples a Kroupa IMF dominated by low-mass stars', () => {
    const r = new Rng(7);
    let low = 0, high = 0;
    for (let i = 0; i < 20000; i++) {
      const m = sampleIMF(r);
      if (m < 0.5) low++;
      if (m > 8) high++;
    }
    expect(low / 20000).toBeGreaterThan(0.6);
    expect(high / 20000).toBeLessThan(0.01);
  });
});

describe('Solar System (catalogue data)', () => {
  const sys = buildSolarSystem(new UPos(), { x: 0, y: 0, z: 0, w: 1 });
  const body = (n: string) => sys.bodies.find((b) => b.name === n)!;

  it('places Earth near perihelion at J2000', () => {
    sys.update(0);
    const d = sys.relative(body('Sun'), body('Earth'), new Vector3()).length() / AU;
    expect(d).toBeGreaterThan(0.98);
    expect(d).toBeLessThan(0.99);
  });

  it('keeps the Moon at lunar distance', () => {
    sys.update(1e7);
    const d = sys.relative(body('Earth'), body('Moon'), new Vector3()).length();
    expect(d).toBeGreaterThan(356e6);
    expect(d).toBeLessThan(407e6);
  });

  it('labels Earth as a living world and Mars as a cold desert', () => {
    expect(body('Earth').planet!.classLabel).toBe('Living world');
    expect(body('Earth').planet!.life.kind).toBe('complex');
    expect(body('Mars').planet!.classLabel).toMatch(/desert/i);
  });

  it('has a one-year Earth orbit', () => {
    expect(orbitalPeriod(body('Earth').orbit!) / YEAR).toBeCloseTo(1, 2);
  });
});

describe('procedural systems', () => {
  it('are deterministic', () => {
    const a = generateSystem({ id: 'a', name: 'A', seed: 4242, upos: new UPos() });
    const b = generateSystem({ id: 'a', name: 'A', seed: 4242, upos: new UPos() });
    expect(a.bodies.length).toBe(b.bodies.length);
    for (let i = 0; i < a.bodies.length; i++) {
      expect(a.bodies[i].mass).toBe(b.bodies[i].mass);
      expect(a.bodies[i].planet?.classLabel).toBe(b.bodies[i].planet?.classLabel);
    }
  });

  it('are diverse, hostile on average, and life is rare', () => {
    const classes = new Map<string, number>();
    let planets = 0, life = 0, complex = 0;
    for (let s = 0; s < 150; s++) {
      const sys = generateSystem({ id: `s${s}`, name: `S${s}`, seed: 1000 + s * 7919, upos: new UPos() });
      for (const b of sys.bodies) {
        const p = b.planet;
        if (!p || b.kind !== 'planet') continue;
        planets++;
        const base = p.classLabel.replace(/^(Super-|Small |Dwarf )/, '').toLowerCase();
        classes.set(base, (classes.get(base) ?? 0) + 1);
        if (p.life.kind === 'microbial' || p.life.kind === 'simple' || p.life.kind === 'complex') life++;
        if (p.life.kind === 'complex') complex++;
      }
    }
    expect(planets).toBeGreaterThan(300);
    expect(classes.size).toBeGreaterThanOrEqual(10);
    expect(life / planets).toBeLessThan(0.05);
    expect(complex / planets).toBeLessThan(0.01);
  });

  it('keeps moons inside their planet\'s Hill sphere', () => {
    for (let s = 0; s < 40; s++) {
      const sys = generateSystem({ id: `h${s}`, name: `H${s}`, seed: 77 + s * 104729, upos: new UPos() });
      for (const m of sys.bodies) {
        if (m.kind !== 'moon' || !m.orbit || !m.parent?.orbit) continue;
        const P = m.parent;
        const hill = P.orbit!.a * (1 - P.orbit!.e) * Math.cbrt(P.mass / (3 * P.parent!.mass));
        expect(m.orbit.a * (1 + m.orbit.e)).toBeLessThan(hill);
      }
    }
  });
});
