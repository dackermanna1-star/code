import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Quaternion, ShaderMaterial, Vector3 } from 'three';
import { Floaters, Fliers } from '../../src/render/aerial';
import { Swimmers, swimState, type SwimState } from '../../src/render/swimmers';
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

  it('swimmers live in deep water, surface to breathe and leap under local gravity', () => {
    const sol = buildSolarSystem(new UPos(), { x: 0, y: 0, z: 0, w: 1 });
    const mat = new ShaderMaterial();
    for (const name of ['Earth', 'Mars', 'Titan']) expect(new Swimmers(sol.bodies.find((x) => x.name === name)!, mat).hasSwimmers, name).toBe(false);
    const world = generateSystem({ id: 'sys1697', name: 'S1697', seed: 1697, upos: new UPos() }).bodies.find((x) => x.planet?.life.kind === 'complex')!;
    expect(world.planet!.gravity).toBeLessThan(4);
    const sw = new Swimmers(world, mat);
    expect(sw.species.map((x) => x.kind).sort()).toEqual(['breather', 'leaper']);
    const g = new SurfaceGenerator(world.planet!.surface!);
    const sea = g.liquidLevel();
    // every pod's loop keeps to deep water
    let pods = 0;
    const allPods = [0, 1, 4, 5].flatMap((f) => [...Array(100).keys()].flatMap((k) => sw.spawn(g, f, (k % 10) - 5, Math.floor(k / 10) - 5)));
    for (const pod of allPods) {
      pods++;
      const pos = new Vector3(), fwd = new Vector3();
      for (let t = 0; t < 600; t += 37) for (const m of pod.members) {
        sw.pathAt(pod, m, t, sea, pos, fwd);
        const d = pos.clone().normalize();
        expect(sea - g.sample(d.x, d.y, d.z, 10).height).toBeGreaterThan(5);
        expect(Math.abs(fwd.dot(d))).toBeLessThan(1e-6); // swimming along the surface
      }
    }
    expect(pods).toBeGreaterThan(3);
    // leaps: same launch speed, apex h = v²/2g, so 4× higher at a quarter of the gravity
    const leaper = sw.species.find((x) => x.kind === 'leaper')!;
    const pod = { sp: 1, centre: new Vector3(0, 0, 1), radius: 100, dir: 1, cycle: 60, members: [] };
    const m = { a: 0, dr: 0, t0: 0, period: 30 };
    const st: SwimState = { y: 0, pitch: 0, tau: -1, dur: 0, roll: 0 };
    const apex = (gg: number) => { let h = -Infinity; for (let t = 0; t < 30; t += 0.005) h = Math.max(h, swimState(leaper, pod, m, t, gg, st).y); return h; };
    expect(apex(9.81)).toBeCloseTo(leaper.leapV ** 2 / (2 * 9.81), 2);
    expect(apex(9.81 / 4) / apex(9.81)).toBeCloseTo(4, 1);
    // breathers spend most of their time below the surface
    const br = sw.species.find((x) => x.kind === 'breather')!;
    let up = 0, n = 0;
    for (let t = 0; t < 600; t += 0.1, n++) if (swimState(br, { ...pod, sp: 0 }, m, t, world.planet!.gravity, st).y > -0.1 * br.length) up++;
    expect(up / n).toBeGreaterThan(0.05);
    expect(up / n).toBeLessThan(0.35);
    // rendered: some animals and spray break the surface over a minute near a pod
    const p0 = allPods.find((x) => x.sp === 0)!;
    const cam = new Vector3();
    sw.pathAt(p0, p0.members[0], 0, sea, cam, new Vector3());
    cam.addScaledVector(p0.centre, 120); // hovering 120 m up, out of their way
    let seen = 0, spray = 0;
    for (let t = 0; t < 90; t += 0.5) { sw.update(g, cam, t, true); seen = Math.max(seen, sw.count); spray = Math.max(spray, sw.sprayCount); }
    expect(seen).toBeGreaterThan(0);
    expect(spray).toBeGreaterThan(0);
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

describe('science instruments', () => {
  it('stellar spectra show the lines each temperature should', async () => {
    const { stellarSpectrum } = await import('../../src/astro/spectrum');
    const star = (T: number, stage = 'main-sequence') => ({ mass: 2e30, radius: 7e8, luminosity: 3.8e26, temperature: T, spectralType: '', stage, age: 1e9, lifetime: 1e10, metallicity: 0, rotationPeriod: 2e6, activity: 0.1, color: [1, 1, 1] }) as never;
    const sun = stellarSpectrum(star(5772))!;
    expect(sun.findings[0]).toMatch(/50\d nm/);              // Wien peak ≈ 502 nm
    expect(sun.marks.map((m) => m.label)).toContain('Ca II K');
    const vega = stellarSpectrum(star(9600))!;
    expect(vega.findings[1]).toMatch(/^Strongest lines: H/);
    const mdwarf = stellarSpectrum(star(3100))!;
    expect(mdwarf.marks.map((m) => m.label)).toContain('TiO');
  });

  it('planetary spectra reveal composition and biosignatures', async () => {
    const { planetSpectrum } = await import('../../src/astro/spectrum');
    const sol = buildSolarSystem(new UPos(), { x: 0, y: 0, z: 0, w: 1 });
    const get = (n: string) => sol.bodies.find((b) => b.name === n)!.planet!;
    const earth = planetSpectrum(get('Earth'), 5772)!;
    const ef = earth.findings.join(' ');
    expect(ef).toMatch(/H₂O/);
    expect(ef).toMatch(/O₂/);
    expect(ef).toMatch(/red edge/);
    expect(ef).toMatch(/O₃/); // Chappuis band from the ozone layer
    expect(ef).toMatch(/disequilibrium/); // O₂ with trace CH₄, as the Galileo flyby saw (Sagan et al. 1993)
    const mars = planetSpectrum(get('Mars'), 5772)!.findings.join(' ');
    expect(mars).toMatch(/CO₂/);
    expect(mars).not.toMatch(/biosignature/);
    const titan = planetSpectrum(get('Titan'), 5772)!.findings.join(' ');
    expect(titan).toMatch(/CH₄/);
    expect(planetSpectrum(get('Moon'), 5772)).toBeNull();
  });

  it('field instruments read the local world', async () => {
    const { fieldSurvey } = await import('../../src/sim/fieldsurvey');
    const { World } = await import('../../src/sim/world');
    const w = new World();
    w.system = buildSolarSystem(new UPos(), { x: 0, y: 0, z: 0, w: 1 });
    w.system.update(0);
    const earth = w.system.bodies.find((b) => b.name === 'Earth')!;
    const g = w.generator(earth)!;
    // a dry-land spot
    let dir = new Vector3();
    for (let i = 0; i < 2000; i++) {
      const y = 1 - (2 * (i + 0.5)) / 2000, r = Math.sqrt(1 - y * y), t = 2.39996 * i;
      dir.set(Math.cos(t) * r, y, Math.sin(t) * r);
      if (g.sample(dir.x, dir.y, dir.z, 5).height > g.liquidLevel() + 50) break;
    }
    const rd = fieldSurvey(w, earth, dir.clone().multiplyScalar(earth.radius + g.sample(dir.x, dir.y, dir.z, 1).height))!;
    const v = (k: string) => rd.rows.find((r) => r[0] === k)![1];
    const gv = parseFloat(v('Gravity'));
    expect(gv).toBeGreaterThan(9.7);
    expect(gv).toBeLessThan(9.9);
    expect(parseFloat(v('Magnetic field'))).toBeGreaterThan(25);
    expect(v('Air composition')).toMatch(/N2/);
    const moon = w.system.bodies.find((b) => b.name === 'Moon')!;
    const mr = fieldSurvey(w, moon, new Vector3(0, 0, moon.radius))!;
    expect(mr.rows.find((r) => r[0] === 'Air')![1]).toMatch(/vacuum/);
    expect(mr.rows.find((r) => r[0] === 'Radiation')![1]).toMatch(/cosmic rays/);
    // afloat on the open ocean: the sea, not the seabed, is under the observer
    for (let i = 0; i < 2000; i++) {
      const y = 1 - (2 * (i + 0.5)) / 2000, r = Math.sqrt(1 - y * y), t = 2.39996 * i;
      dir.set(Math.cos(t) * r, y, Math.sin(t) * r);
      if (g.sample(dir.x, dir.y, dir.z, 5).height < g.liquidLevel() - 2000) break;
    }
    const sr = fieldSurvey(w, earth, dir.clone().multiplyScalar(earth.radius + g.liquidLevel()))!;
    const sv = (k: string) => sr.rows.find((r) => r[0] === k)![1];
    expect(sv('Ground')).toMatch(/open water sea/);
    expect(parseFloat(sv('Elevation'))).toBeCloseTo(0, 0);
    expect(sv('Life detection')).toMatch(/aquatic/);
    expect(sv('Subsurface')).not.toMatch(/permafrost|groundwater/);
  });

  it('surface radiation matches measured doses across the Solar System', () => {
    const sol = buildSolarSystem(new UPos(), { x: 0, y: 0, z: 0, w: 1 });
    const rad = (n: string) => sol.bodies.find((b) => b.name === n)!.planet!.radiation; // × Earth (2.4 mSv/yr)
    expect(rad('Earth')).toBeGreaterThan(0.8);
    expect(rad('Earth')).toBeLessThan(1.2);
    expect(rad('Moon')).toBeGreaterThan(100);   // ≈500 mSv/yr (Chang'e 4)
    expect(rad('Moon')).toBeLessThan(300);
    expect(rad('Mars')).toBeGreaterThan(60);    // ≈230 mSv/yr (Curiosity RAD)
    expect(rad('Mars')).toBeLessThan(160);
    expect(rad('Europa')).toBeGreaterThan(3e5); // ≈5 Sv/day
    expect(rad('Io')).toBeGreaterThan(rad('Europa'));
    expect(rad('Callisto')).toBeLessThan(rad('Ganymede'));
    expect(rad('Titan')).toBeLessThan(0.5);     // under 10 m of air-equivalent
  });
});


describe('caves', () => {
  const setup = async () => {
    const { World } = await import('../../src/sim/world');
    const w = new World();
    w.system = buildSolarSystem(new UPos(), { x: 0, y: 0, z: 0, w: 1 });
    w.system.update(0);
    const moon = w.system.bodies.find((b) => b.name === 'Moon')!;
    const g = w.generator(moon)!;
    const caves = w.caves(moon)!;
    // the first lava tube found on a spiral of directions
    for (let i = 0; i < 400; i++) {
      const y = 1 - (2 * (i + 0.5)) / 400, r = Math.sqrt(1 - y * y), th = 2.39996 * i;
      for (const site of g.cavesNear(Math.cos(th) * r, y, Math.sin(th) * r, 0)) {
        const t = caves.tunnel(site);
        if (t && t.length > 60) return { w, moon, g, caves, t, site };
      }
    }
    throw new Error('no cave');
  };
  const at = (g: SurfaceGenerator, site: { dir: number[]; U: number[]; V: number[] }, u: number, v: number) => {
    const R = g.R;
    const p = new Vector3(...(site.dir as [number, number, number])).multiplyScalar(R)
      .addScaledVector(new Vector3(...(site.U as [number, number, number])), u).addScaledVector(new Vector3(...(site.V as [number, number, number])), v);
    return p.normalize();
  };

  it('open through a skylight with a walkable rubble ramp', async () => {
    const { g, t, site } = await setup();
    expect(site.kind).toBe('lava-tube');
    const h = (u: number, v: number) => { const d = at(g, site, u, v); return g.sample(d.x, d.y, d.z, 0.25).height; };
    // flat floor at the skylight's depth below the surroundings
    expect(Math.abs(h(site.lf / 2, 0) - t.floor0)).toBeLessThan(0.05);
    expect(h(site.lf / 2, site.w + site.wall + 3) - t.floor0).toBeGreaterThan(site.depth * 0.6);
    // the ramp climbs at 28°: walkable (the walker slides above ~42°)
    const slope = Math.atan((h(-site.lr * 0.4, 0) - h(-site.lr * 0.2, 0)) / (site.lr * 0.2));
    expect(slope).toBeGreaterThan(0.35);
    expect(slope).toBeLessThan(0.6);
    // the tunnel keeps a roof of rock over it
    for (let i = 0; i < t.n; i += 5) {
      if (t.s[i] < 3 * site.rt) continue;
      const d = t.dir[i];
      expect(g.sample(d[0], d[1], d[2], 4).height - (t.floor[i] + site.hc * t.scale[i])).toBeGreaterThan(2);
    }
  });

  it('render as a closed tunnel seen from inside', async () => {
    const { g, t, site } = await setup();
    const { tunnelGeometry } = await import('../../src/render/cave');
    const origin = new Vector3(...site.dir).multiplyScalar(g.R + t.floor0);
    const geo = tunnelGeometry(t, g.R, origin);
    expect(geo.attributes.position.count).toBeGreaterThan(t.n * 30);
    // a ceiling vertex (straight up from the axis) has its normal pointing down, into the tunnel
    const i = 6, k = 9, n = new Vector3().fromBufferAttribute(geo.attributes.normal, i * 36 + k);
    expect(n.dot(new Vector3(...t.dir[i]))).toBeLessThan(-0.5);
  });

  it('can be walked into from the skylight, with walls and floor', async () => {
    const { w, moon, caves, t, site, g } = await setup();
    const { Walker } = await import('../../src/sim/walker');
    const wk = new Walker();
    const start = at(g, site, site.lf * 0.4, 0).multiplyScalar(g.R + t.floor0 + 0.5);
    wk.placeAt(moon, start, new Vector3(...site.U));
    const input = { look: () => ({ yaw: 0, pitch: 0 }), axis: (a: string) => (a === 'forward' ? 1 : 0), held: () => false, pressed: () => false, gamepadAxes: [0, 0, 0, 0] };
    let maxV = 0, deepest = 0;
    for (let k = 0; k < 60 * 25; k++) {
      wk.update(1 / 60, w, input as never);
      const loc = caves.locate(wk.pos.x, wk.pos.y, wk.pos.z);
      if (wk.cave) {
        maxV = Math.max(maxV, Math.abs(wk.cave.local.v) / wk.cave.local.rt);
        deepest = Math.max(deepest, wk.cave.local.s);
        // standing on the tunnel floor, not on the ground far above
        expect(Math.abs(wk.pos.length() - wk.cave.local.floorR)).toBeLessThan(0.6);
      }
      void loc;
    }
    expect(deepest).toBeGreaterThan(10);
    expect(maxV).toBeLessThan(1);
    // the rock above shields it: the surface is far overhead
    const up = wk.pos.clone().normalize();
    expect(g.sample(up.x, up.y, up.z, 1).height + g.R - wk.pos.length()).toBeGreaterThan(site.hc);
    // and the instruments say so: a lava tube is a radiation shelter
    const { fieldSurvey } = await import('../../src/sim/fieldsurvey');
    const dose = (rows: [string, string][]) => parseFloat(rows.find((r) => r[0] === 'Radiation')![1]) * (/Sv\/day/.test(rows.find((r) => r[0] === 'Radiation')![1]) ? 365e3 : 1);
    const inside = fieldSurvey(w, moon, wk.pos)!.rows;
    expect(inside.find((r) => r[0] === 'Location')![1]).toMatch(/lava tube/);
    const outside = fieldSurvey(w, moon, start)!.rows;
    expect(outside.find((r) => r[0] === 'Nearest cave')![1]).toMatch(/skylight/);
    expect(dose(outside)).toBeGreaterThan(100); // ≈ 400 mSv/yr of cosmic rays on the open surface
    expect(dose(inside)).toBeLessThan(dose(outside) / 50);
  });
});
