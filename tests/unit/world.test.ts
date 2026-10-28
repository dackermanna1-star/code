import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Quaternion, ShaderMaterial, Vector3 } from 'three';
import { Floaters, Fliers } from '../../src/render/aerial';
import { activeShowers, meteorAltitude, MeteorSky, solarLongitude } from '../../src/render/meteors';
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
import { generateSystem } from '../../src/astro/systemgen';

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

describe('nebulae', () => {
  it('are deterministic and concentrated toward star-forming regions', async () => {
    const { cellNebulae, knownNebulae } = await import('../../src/astro/nebulae');
    const u = new Universe({ seed: 20261027, knownLocalGroup: true });
    const a = cellNebulae(u.home, -10, 0, 3).map((n) => n.id + n.radius);
    const b = cellNebulae(u.home, -10, 0, 3).map((n) => n.id + n.radius);
    expect(a).toEqual(b);
    let inner = 0, outer = 0;
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      inner += cellNebulae(u.home, -6 + i, 0, j).length;   // ~9 kly from centre
      outer += cellNebulae(u.home, -30 + i, 0, j).length;  // ~45 kly
    }
    expect(inner).toBeGreaterThan(outer);
    const orion = knownNebulae(u.home, u.sunLocal).find((n) => n.name.includes('Orion'))!;
    expect(orion.center.distanceTo(u.sunLocal)).toBeCloseTo(1344, 0);
  });
});

describe('cosmic events', () => {
  it('are deterministic and occur at physical rates', async () => {
    const { EventSystem, eventLumV } = await import('../../src/sim/events');
    const u = new Universe({ seed: 20261027, knownLocalGroup: true });
    const a = new EventSystem(), b = new EventSystem();
    let sn = 0, novae = 0;
    for (let y = 0; y < 2000; y++) {
      const ea = a.eventsInYear(u.home, y), eb = b.eventsInYear(u.home, y);
      expect(ea.map((e) => e.id + e.t0)).toEqual(eb.map((e) => e.id + e.t0));
      sn += ea.filter((e) => e.kind.startsWith('supernova')).length;
      if (y < 20) novae += ea.filter((e) => e.kind === 'nova').length;
    }
    // Milky Way: ~1–3 supernovae per century, ~20–60 novae per year
    expect(sn / 20).toBeGreaterThan(0.8);
    expect(sn / 20).toBeLessThan(4);
    expect(novae / 20).toBeGreaterThan(15);
    expect(novae / 20).toBeLessThan(80);
    // a supernova peaks near M ≈ −17…−19.5 (≈ 1e9 L☉) and fades
    const e = a.eventsInYear(u.home, 0).concat(...Array.from({ length: 300 }, (_, y) => a.eventsInYear(u.home, y + 1))).find((x) => x.kind.startsWith('supernova'))!;
    const peak = Math.max(...Array.from({ length: 60 }, (_, d) => eventLumV(e, e.t0 + d * 86400)));
    expect(peak).toBeGreaterThan(2e8);
    expect(eventLumV(e, e.t0 + 3 * 365 * 86400)).toBeLessThan(peak * 1e-2);
  });
});

describe('rogue planets', () => {
  it('are deterministic, follow stellar density and rebuild from their id', async () => {
    const { cellRogues } = await import('../../src/astro/rogues');
    const cosmos = new Cosmos(20261027, true);
    const g = cosmos.universe.home;
    const near = [] as ReturnType<typeof cellRogues>;
    for (let i = 0; i < 4; i++) near.push(...cellRogues(g, -650 + i, 0, 2));
    const again = [] as ReturnType<typeof cellRogues>;
    for (let i = 0; i < 4; i++) again.push(...cellRogues(g, -650 + i, 0, 2));
    expect(near.map((r) => r.id + r.mass)).toEqual(again.map((r) => r.id + r.mass));
    expect(near.length).toBeGreaterThan(10); // ~0.3 per star at 0.004 stars/ly³ in 4×(40 ly)³
    const ref = cosmos.refById(near[0].id)!;
    expect(ref.rogue?.name).toBe(near[0].name);
    const sys = ref.build();
    expect(sys.stars.length).toBe(0);
    expect(sys.root.planet!.classLabel.startsWith('Rogue')).toBe(true);
  });
});

describe('terrain continuity', () => {
  it('has no cliffs from features switching on or off between neighbouring samples', () => {
    const sol = buildSolarSystem(new UPos(), { x: 0, y: 0, z: 0, w: 1 });
    const lava = generateSystem({ id: 'sys1', name: 'S1', seed: 1, upos: new UPos() }).bodies.find((b) => b.name.endsWith('B c'))!;
    const bodies = [...['Moon', 'Mars', 'Earth', 'Mercury'].map((n) => sol.bodies.find((b) => b.name === n)!), lava];
    for (const b of bodies) {
      const g = new SurfaceGenerator(b.planet!.surface!);
      const R = b.radius;
      let worst = 0;
      for (let i = 0; i < 6000; i++) {
        const y = 1 - (2 * (i + 0.5)) / 6000, r = Math.sqrt(1 - y * y), t = 2.39996 * i;
        const p = new Vector3(Math.cos(t) * r, y, Math.sin(t) * r);
        const e = new Vector3(-p.z, 0, p.x).normalize();
        const q = p.clone().addScaledVector(e, 0.25 / R).normalize();
        const h0 = g.sample(p.x, p.y, p.z, 0.5).height, h1 = g.sample(q.x, q.y, q.z, 0.5).height;
        worst = Math.max(worst, Math.abs(h1 - h0));
      }
      // 25 cm apart: even a vertical crater wall changes by well under a few metres
      expect(worst, b.name).toBeLessThan(3);
    }
  });
});

describe('rivers', () => {
  it('flow on wet worlds with surface liquids only, carved below their banks', () => {
    const sys = buildSolarSystem(new UPos(), { x: 0, y: 0, z: 0, w: 1 });
    const frac = (name: string) => {
      const g = new SurfaceGenerator(sys.bodies.find((b) => b.name === name)!.planet!.surface!);
      let land = 0, river = 0, carved = 0;
      const N = 60000;
      for (let i = 0; i < N; i++) {
        const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), t = 2.39996 * i;
        const s = g.sample(Math.cos(t) * r, y, Math.sin(t) * r, 5);
        if (s.height > g.liquidLevel()) land++;
        if (s.water > s.height) { river++; if (s.water > g.liquidLevel()) carved++; }
      }
      return { f: river / Math.max(land, 1), carved };
    };
    const earth = frac('Earth'), mars = frac('Mars');
    expect(earth.f).toBeGreaterThan(0.001);
    expect(earth.f).toBeLessThan(0.03);
    expect(earth.carved).toBeGreaterThan(0);
    expect(mars.f).toBe(0);
  });

  it('include lava channels on molten worlds, without making them "moist"', () => {
    let found = 0;
    for (let seed = 1; seed < 40 && !found; seed++) {
      const sys = generateSystem({ id: `s${seed}`, name: `S${seed}`, seed, upos: new UPos() });
      const b = sys.bodies.find((x) => x.planet?.liquid === 'lava' && x.planet.surface!.rivers > 0.2);
      if (!b) continue;
      const g = new SurfaceGenerator(b.planet!.surface!);
      for (let i = 0; i < 60000; i++) {
        const y = 1 - (2 * (i + 0.5)) / 60000, r = Math.sqrt(1 - y * y), t = 2.39996 * i;
        const s = g.sample(Math.cos(t) * r, y, Math.sin(t) * r, 5);
        if (s.water > s.height) { found++; expect(s.moisture).toBeLessThan(0.95); }
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('floaters', () => {
  it('drift through dense living skies only, deterministically and downwind', () => {
    const sol = buildSolarSystem(new UPos(), { x: 0, y: 0, z: 0, w: 1 });
    const mat = new ShaderMaterial();
    for (const name of ['Earth', 'Mars', 'Venus']) {
      const b = sol.bodies.find((x) => x.name === name)!;
      expect(new Floaters(b, mat).abundance, name).toBe(0);
    }
    const living = generateSystem({ id: 'sys1873', name: 'S1873', seed: 1873, upos: new UPos() }).bodies.find((x) => x.planet?.life.kind === 'complex')!;
    expect(living.planet!.atmosphere!.pressure).toBeGreaterThan(1);
    const g = new SurfaceGenerator(living.planet!.surface!);
    const cam = new Vector3(0.3, 0.2, 0.93).normalize();
    cam.multiplyScalar(living.radius + Math.max(g.sample(cam.x, cam.y, cam.z, 5).height, 0) + 50);
    const a = new Floaters(living, mat), b = new Floaters(living, mat);
    expect(a.abundance).toBeGreaterThan(0.3);
    a.update(g, cam, 1000, true);
    b.update(g, cam, 1000, true);
    expect(a.count).toBeGreaterThan(5);
    expect(a.count).toBe(b.count);
    // same placement from independent instances
    const pos = (f: Floaters, i: number) => {
      const m = new Matrix4();
      (f.group.children[0] as InstancedMesh).getMatrixAt(i, m);
      return new Vector3().setFromMatrixPosition(m).add(f.group.children[0].position);
    };
    expect(pos(a, 0).distanceTo(pos(b, 0))).toBeLessThan(1e-6);
    // ten seconds later the organisms have drifted some metres, mostly horizontally
    const n = (a.group.children[0] as InstancedMesh).count;
    const before = Array.from({ length: n }, (_, i) => pos(a, i));
    a.update(g, cam, 1010, true);
    const moves = before.map((p0, i) => { const d = pos(a, i).sub(p0); return { d: d.length(), v: Math.abs(d.dot(p0.clone().normalize())) }; })
      .filter((m) => m.d < 200) // (an organism that wrapped to the far edge of its cell)
      .sort((x, y) => x.d - y.d);
    const med = moves[moves.length >> 1];
    expect(med.d).toBeGreaterThan(5);
    expect(med.d).toBeLessThan(80);
    expect(med.v).toBeLessThan(med.d * 0.5);
  });

  it('fliers circle in flocks by day and roost at night', () => {
    const living = generateSystem({ id: 'sys1873', name: 'S1873', seed: 1873, upos: new UPos() }).bodies.find((x) => x.planet?.life.kind === 'complex')!;
    const g = new SurfaceGenerator(living.planet!.surface!);
    const mat = new ShaderMaterial();
    const f = new Fliers(living, mat);
    expect(f.hasFliers).toBe(true);
    let seen = 0;
    // try a few spots: flocks occupy about half the cells
    for (let i = 0; i < 12 && !seen; i++) {
      const cam = new Vector3(Math.cos(i), 0.3, Math.sin(i)).normalize();
      cam.multiplyScalar(living.radius + Math.max(g.sample(cam.x, cam.y, cam.z, 5).height, 0) + 50);
      const sun = cam.clone().normalize();
      f.update(g, cam, 500, true, sun, 0);
      if (f.count > 0) {
        seen = f.count;
        // all roost at night (unless the species is nocturnal), and in heavy rain
        f.update(g, cam, 500, true, sun, 0.9);
        expect(f.count).toBe(0);
      }
    }
    expect(seen).toBeGreaterThan(1);
    expect(new Fliers(buildSolarSystem(new UPos(), { x: 0, y: 0, z: 0, w: 1 }).bodies.find((b) => b.name === 'Mars')!, mat).hasFliers).toBe(false);
  });
});

describe('meteors', () => {
  const sol = buildSolarSystem(new UPos(), { x: 0, y: 0, z: 0, w: 1 });
  const earth = sol.bodies.find((b) => b.name === 'Earth')!;
  const sun = sol.bodies.find((b) => b.name === 'Sun')!;
  const J2000 = Date.UTC(2000, 0, 1, 12);
  const at = (y: number, m: number, d: number, h = 0) => (Date.UTC(y, m - 1, d, h) - J2000) / 1000;

  it('burn up in the upper atmosphere of worlds with air', () => {
    const h = meteorAltitude(earth)!;
    expect(h).toBeGreaterThan(80e3);
    expect(h).toBeLessThan(135e3);
    expect(meteorAltitude(sol.bodies.find((b) => b.name === 'Mars')!)).toBeGreaterThan(40e3);
    expect(meteorAltitude(sol.bodies.find((b) => b.name === 'Moon')!)).toBeNull();
  });

  it("follow Earth's real shower calendar", () => {
    sol.update(at(2026, 8, 12, 22));
    expect((solarLongitude(earth, sun) * 180) / Math.PI).toBeCloseTo(140, 0);
    const aug = activeShowers(earth, sun);
    const per = aug.find((a) => a.shower?.name === 'Perseids');
    expect(per!.zhr).toBeGreaterThan(80);
    sol.update(at(2026, 12, 14, 12));
    const dec = activeShowers(earth, sun);
    expect(dec.find((a) => a.shower?.name === 'Geminids')!.zhr).toBeGreaterThan(100);
    expect(dec.find((a) => a.shower?.name === 'Perseids')).toBeUndefined();
  });

  it('are much more frequent during a shower', () => {
    // an observer where the Perseid radiant is high in the sky
    const count = (t0: number) => {
      sol.update(t0);
      const sky = new MeteorSky();
      const q = sol.bodyRotation(earth, new Quaternion());
      const rad = activeShowers(earth, sun).find((a) => a.shower?.name === 'Perseids')?.shower?.radiant
        ?? new Vector3(0, 1, 0);
      const up = rad.clone().applyQuaternion(q.clone().invert()).normalize();
      const cam = up.multiplyScalar(earth.radius + 2);
      let n = 0;
      for (let t = t0; t < t0 + 1800; t += 0.5) sky.update(sol, earth, sun, cam, q, t, () => { n++; });
      return n;
    };
    const peak = count(at(2026, 8, 12, 22)), quiet = count(at(2026, 3, 1, 0));
    expect(quiet).toBeGreaterThan(0);
    expect(peak).toBeGreaterThan(quiet * 3);
  });
});

describe('supernova close-up', () => {
  it('expands, cools and thins out; selectable and described', async () => {
    const { eventTarget, standoff: so } = await import('../../src/sim/targets');
    const { photosphericPhase, photoTemperature, shellRadius } = await import('../../src/sim/events');
    const u = new Universe({ seed: 20261027, knownLocalGroup: true });
    const g = u.home;
    const DAY = 86400;
    const e = { id: 'sn', kind: 'supernova-cc' as const, name: 'SN test', galaxy: g, local: new Vector3(), t0: 0, peakMag: -17, temp: 7000 };
    expect(shellRadius(e, 365 * DAY) / 1.496e11).toBeGreaterThan(1000);   // ~1700 AU after a year at 8000 km/s
    expect(photosphericPhase(e, 30 * DAY)).toBe(1);
    expect(photosphericPhase(e, 400 * DAY)).toBe(0);
    expect(photoTemperature(e, 2 * DAY)).toBeGreaterThan(photoTemperature(e, 60 * DAY));
    const t = eventTarget(e, 60 * DAY);
    expect(so(t)).toBeGreaterThan(t.radius * 4);
    const d = describeTarget(t, 1e15, false, 60 * DAY);
    expect(d.title).toBe('SN test');
    expect(d.sections[0].rows.find((r) => r[0] === 'Phase')![1]).toMatch(/photospheric/);
  });
});

describe('pulsars', () => {
  it('spin down like the Crab and flash only when a beam sweeps past', async () => {
    const { pulsarModel, pulseFactor } = await import('../../src/astro/pulsar');
    const { Body: B } = await import('../../src/astro/body');
    const mk = (P: number, Bt: number) => new B('ns-' + P, 'NS', 'neutron-star', null, 2.8e30, 1.2e4, null,
      { period: P, tilt: 0, tiltAzimuth: 0, phase0: 0, locked: false },
      { mass: 2.8e30, radius: 1.2e4, luminosity: 1e26, temperature: 1e6, spectralType: 'NS', stage: 'neutron-star', age: 1e3 * 3.15e7, lifetime: 1e18, metallicity: 0, rotationPeriod: P, activity: 0, color: [1, 1, 1], pulsarPeriod: P, magneticField: Bt });
    const crab = pulsarModel(mk(0.0337, 4e8))!;
    expect(crab.lsd).toBeGreaterThan(2e31);
    expect(crab.lsd).toBeLessThan(1e32);
    expect(crab.period / (2 * crab.pdot) / 3.156e7).toBeGreaterThan(500);   // characteristic age ~1000 yr
    expect(crab.period / (2 * crab.pdot) / 3.156e7).toBeLessThan(3000);
    const slow = pulsarModel(mk(1.0, 1e8))!;
    const q = new Quaternion();
    // an observer on the north beam's cone sees one flash per rotation
    const onCone = new Vector3(Math.sin(slow.alpha), Math.cos(slow.alpha), 0);
    const samples = Array.from({ length: 200 }, (_, i) => pulseFactor(slow, onCone, q, i * 0.005));
    expect(Math.max(...samples)).toBeGreaterThan(1);
    expect(Math.min(...samples)).toBeLessThan(0.01);
    const peaks = samples.filter((v, i) => i > 0 && i < 199 && v > samples[i - 1] && v >= samples[i + 1] && v > 0.5).length;
    expect(peaks).toBe(1);
    // far from both cones: dark
    const off = new Vector3(Math.sin(slow.alpha + 0.8), Math.cos(slow.alpha + 0.8), 0);
    if (Math.abs(slow.alpha + 0.8 - (Math.PI - slow.alpha)) > 0.5) expect(pulseFactor(slow, off, q, 0.3)).toBe(0);
  });
});

