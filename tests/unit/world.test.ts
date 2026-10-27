import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SurfaceGenerator } from '../../src/terrain/surface';
import { buildNode, GRID } from '../../src/terrain/meshbuilder';
import { earthlikeSurface } from '../../src/astro/testworlds';
import { Universe } from '../../src/astro/universe';
import { densities } from '../../src/astro/galaxy';
import { generateSector } from '../../src/astro/starsectors';
import { Cosmos } from '../../src/sim/cosmos';
import { describe as describeTarget } from '../../src/ui/describe';
import { matchScore } from '../../src/ui/search';
import { bodyTarget, standoff } from '../../src/sim/targets';
import { scanRange, Scanner } from '../../src/sim/scanner';
import { lookRotation } from '../../src/sim/locations';
import { UPos } from '../../src/core/upos';
import { buildSolarSystem } from '../../src/astro/known/solarsystem';

const gen = new SurfaceGenerator(earthlikeSurface(6.371e6, 12345));

function vertex(n: ReturnType<typeof buildNode>, i: number, j: number) {
  const k = (j * (GRID + 1) + i) * 3;
  return new Vector3(n.center[0] + n.position[k], n.center[1] + n.position[k + 1], n.center[2] + n.position[k + 2]);
}

describe('terrain', () => {
  it('is deterministic', () => {
    const g2 = new SurfaceGenerator(earthlikeSurface(6.371e6, 12345));
    for (let i = 0; i < 20; i++) {
      const d = new Vector3(Math.sin(i), Math.cos(i * 1.3), Math.sin(i * 0.7)).normalize();
      expect(gen.sample(d.x, d.y, d.z, 100).height).toBe(g2.sample(d.x, d.y, d.z, 100).height);
    }
  });

  it('has no cracks between neighbouring nodes on a face', () => {
    const a = buildNode(gen, 0, 3, 2, 5);
    const b = buildNode(gen, 0, 3, 3, 5); // right neighbour
    for (let j = 0; j <= GRID; j++) {
      expect(vertex(a, GRID, j).distanceTo(vertex(b, 0, j))).toBeLessThan(0.05);
    }
  });

  it('has no cracks across cube-face boundaries', () => {
    const faces = [0, 1, 2, 3, 4, 5].map((f) => buildNode(gen, f, 0, 0, 0));
    const verts = faces.map((n) => {
      const out: Vector3[] = [];
      for (let j = 0; j <= GRID; j++) for (let i = 0; i <= GRID; i++) if (i === 0 || j === 0 || i === GRID || j === GRID) out.push(vertex(n, i, j));
      return out;
    });
    // every border vertex of face 0 coincides with a border vertex of some other face
    for (const v of verts[0]) {
      let best = Infinity;
      for (let f = 1; f < 6; f++) for (const w of verts[f]) best = Math.min(best, v.distanceTo(w));
      expect(best).toBeLessThan(1.0);
    }
  });

  it('produces Earth-like hypsometry for an Earth-like world', () => {
    const sea = gen.liquidLevel();
    let land = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const z = (i / N) * 2 - 1, a = i * 2.39996, r = Math.sqrt(1 - z * z);
      if (gen.sample(r * Math.cos(a), z, r * Math.sin(a), 20000).height > sea) land++;
    }
    expect(land / N).toBeGreaterThan(0.15);
    expect(land / N).toBeLessThan(0.5);
  });
});

describe('universe', () => {
  const u = new Universe({ seed: 20261027, knownLocalGroup: true });

  it('calibrates the Milky Way to the local stellar density', () => {
    const s = u.sunLocal;
    const d = densities(u.home, s.x, s.y, s.z, { young: 0, disk: 0, bulge: 0, halo: 0 });
    expect(d.young + d.disk + d.bulge + d.halo).toBeCloseTo(0.004, 4);
  });

  it('places Andromeda ~2.5 Mly away', () => {
    const m31 = u.known.find((g) => g.name.includes('Andromeda'))!;
    expect(m31.upos.distanceTo(u.home.upos) / 9.4607e21).toBeGreaterThan(2.3);
    expect(m31.upos.distanceTo(u.home.upos) / 9.4607e21).toBeLessThan(2.7);
  });

  it('generates star sectors deterministically', () => {
    const a = generateSector(u.home, 6, -1083, 0, 0);
    const b = generateSector(u.home, 6, -1083, 0, 0);
    expect(a.count).toBe(b.count);
    expect(Array.from(a.pos.slice(0, 30))).toEqual(Array.from(b.pos.slice(0, 30)));
  });

  it('rebuilds procedural star systems from their id', () => {
    const cosmos = new Cosmos(20261027, true);
    const g = cosmos.universe.home;
    // a level-5 sector (768 ly) near the Sun, 26 kly from the galactic centre
    const sec = generateSector(g, 5, -34, 0, 1, cosmos.exclusionsFor(g));
    expect(sec.count).toBeGreaterThan(0);
    const id = `${g.id}/5:-34:0:1:0`;
    const ref = cosmos.refById(id)!;
    expect(ref).not.toBeNull();
    expect(ref.local.x).toBeCloseTo(sec.cx + sec.pos[0], 6);
    const s1 = ref.build(), s2 = cosmos.refById(id)!.build();
    expect(s1.bodies.length).toBe(s2.bodies.length);
    expect(s1.stars[0].star!.temperature).toBe(s2.stars[0].star!.temperature);
  });

  it('finds catalogued systems by id', () => {
    const cosmos = new Cosmos(1, true);
    expect(cosmos.refById('MW/known/sol')?.name).toBe('Solar System');
    expect(cosmos.refById('MW/known/proxima')?.name).toBe('Proxima Centauri');
  });
});

describe('interface logic', () => {
  const sys = buildSolarSystem(new UPos(), { x: 0, y: 0, z: 0, w: 1 });
  sys.update(0);
  const earth = sys.bodies.find((b) => b.name === 'Earth')!;

  it('describes catalogued bodies with provenance and scan gating', () => {
    const t = bodyTarget(earth);
    const d = describeTarget(t, 1e7, false);
    expect(d.title).toBe('Earth');
    expect(d.provenance).toBe('mixed');
    expect(d.needsScan).toBe(false); // measured data needs no scan
    const life = d.sections.find((s) => s.title === 'Life')!;
    expect(life.rows.some(([, v]) => v === 'complex')).toBe(true);
  });

  it('locks physical sections of unscanned procedural worlds', () => {
    const proc = new Cosmos(5, false);
    const ref = proc.refById(`${proc.universe.home.id}/3:-130:0:5:0`);
    const sys2 = ref?.build();
    const planet = sys2?.bodies.find((b) => b.kind === 'planet');
    if (!planet) return; // sector may be empty for this seed
    const d = describeTarget(bodyTarget(planet), 1e9, false);
    expect(d.needsScan).toBe(true);
    expect(d.sections.find((s) => s.title === 'Atmosphere')!.locked).toBe(true);
    const scanned = describeTarget(bodyTarget(planet), 1e9, true);
    expect(scanned.sections.every((s) => !s.locked)).toBe(true);
  });

  it('ranks search matches', () => {
    expect(matchScore('Mars', 'mars')).toBe(0);
    expect(matchScore('Mars', 'ma')).toBeLessThan(matchScore('Mimas', 'ma'));
    expect(matchScore('Alpha Centauri', 'cen')).toBeLessThan(Infinity);
    expect(matchScore('Earth', 'xyz')).toBe(Infinity);
  });

  it('requires scanner range and time', () => {
    const t = bodyTarget(earth);
    const sc = new Scanner();
    sc.start(t);
    expect(sc.update(1, scanRange(t) * 2)).toBe('range');
    sc.start(t);
    let r: string | null = null;
    for (let i = 0; i < 100 && !r; i++) r = sc.update(0.1, earth.radius * 3);
    expect(r).toBe('done');
  });

  it('chooses sensible travel stand-off distances', () => {
    expect(standoff(bodyTarget(earth)) / earth.radius).toBeGreaterThan(2);
    const sun = sys.bodies.find((b) => b.name === 'Sun')!;
    expect(standoff(bodyTarget(sun))).toBeGreaterThan(sun.radius * 5);
  });

  it('builds look rotations that face the target', () => {
    const dir = new Vector3(0.3, -0.2, 0.9).normalize();
    const q = lookRotation(dir, new Vector3(0, 1, 0));
    const fwd = new Vector3(0, 0, -1).applyQuaternion(q);
    expect(fwd.dot(dir)).toBeCloseTo(1, 9);
  });
});
