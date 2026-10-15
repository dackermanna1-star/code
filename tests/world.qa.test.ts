// QA regression tests (world QA pass): gameplay-facing invariants of the generated world data that a player or
// another module would notice — fences across roads, cars spawned inside props or in water, steps at bridge ends,
// steep banks in front of doors, surface queries next to roads, circular ponds.
import { beforeAll, describe, expect, it } from 'vitest';
import { BUILDING_FOOTPRINTS } from '../src/core/contracts';
import { buildLayout } from '../src/world/layout/MapData';
import { PROP_FOOTPRINTS } from '../src/world/layout/props';
import { pondRadiusAt } from '../src/world/layout/pondShape';
import type { WorldLayout } from '../src/world/layout/types';
import { generateTerrain } from '../src/world/terrain/generate';
import type { TerrainResult } from '../src/world/terrain/TerrainData';
import { World } from '../src/world/World';

let layout: WorldLayout;
let t: TerrainResult;
let world: World;
const h = (x: number, z: number) => world.getHeight(x, z);

/** Exact distance to the nearest road edge (negative = on the road surface). */
function roadEdge(x: number, z: number, skipRoad = -1): number {
  let best = Infinity;
  for (const r of layout.roadDefs) {
    if (r.id === skipRoad) continue;
    const p = r.points;
    for (let i = 1; i < p.length; i++) {
      const ax = p[i - 1].x, az = p[i - 1].z, dx = p[i].x - ax, dz = p[i].z - az;
      if (Math.abs(ax - x) > 80 && Math.abs(p[i].x - x) > 80) continue;
      const L2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      best = Math.min(best, Math.hypot(ax + dx * u - x, az + dz * u - z) - r.width / 2);
    }
  }
  return best;
}

/** Sample points of a rotated rectangle (local X half extent hx, local Z half extent hz). */
function rectPoints(x: number, z: number, rot: number, hx: number, hz: number, n = 4): [number, number][] {
  const c = Math.cos(rot), s = Math.sin(rot);
  const out: [number, number][] = [];
  for (let a = 0; a <= n; a++)
    for (let b = 0; b <= n; b++) {
      const lx = (a / n - 0.5) * 2 * hx, lz = (b / n - 0.5) * 2 * hz;
      out.push([x + lx * c + lz * s, z - lx * s + lz * c]);
    }
  return out;
}

function inRect(px: number, pz: number, x: number, z: number, rot: number, hx: number, hz: number): boolean {
  const c = Math.cos(rot), s = Math.sin(rot), dx = px - x, dz = pz - z;
  return Math.abs(dx * c - dz * s) <= hx && Math.abs(dx * s + dz * c) <= hz;
}

beforeAll(() => {
  layout = buildLayout();
  t = generateTerrain(layout);
  layout.lots.forEach((l, i) => (l.groundY = t.lotGround[i]));
  layout.bridges.forEach((b, i) => (b.deckY = t.bridgeDeck[i]));
  layout.ponds.forEach((p, i) => (p.level = t.pondLevel[i]));
  world = new World(layout, t);
}, 120000);

describe('world QA invariants', () => {
  it('fences and walls never run across a road (gaps are cut where roads pass)', () => {
    const bad: string[] = [];
    for (const p of layout.props) {
      const f = PROP_FOOTPRINTS[p.kind];
      if (!f?.linear || !p.length || p.kind === 'guard_rail') continue;
      const c = Math.cos(p.rotationY), s = Math.sin(p.rotationY);
      for (let a = -p.length / 2; a <= p.length / 2; a += 0.5) {
        if (roadEdge(p.x + a * c, p.z - a * s) < 0) {
          bad.push(`${p.kind} @${p.x.toFixed(0)},${p.z.toFixed(0)}`);
          break;
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('land vehicle spawns are on dry, fairly level ground and clear of props and lots', () => {
    const land = layout.vehicleSpawns.filter((v) => v.kind === 'land');
    expect(land.length).toBeGreaterThanOrEqual(36);
    for (const v of land) {
      const pts = rectPoints(v.x, v.z, v.rotationY, 1.0, 2.3);
      const hs = pts.map(([x, z]) => h(x, z));
      expect(Math.max(...hs) - Math.min(...hs), `slope at ${v.x.toFixed(0)},${v.z.toFixed(0)}`).toBeLessThan(0.9);
      expect(Math.min(...hs)).toBeGreaterThan(0.3);
      for (const p of layout.props) {
        const f = PROP_FOOTPRINTS[p.kind];
        if (!f || Math.hypot(p.x - v.x, p.z - v.z) > (p.length ?? 0) / 2 + 30) continue;
        const hx = f.linear ? (p.length ?? 0) / 2 : f.hx;
        const hit = pts.some(([x, z]) => inRect(x, z, p.x, p.z, p.rotationY, hx + 0.2, f.hz + 0.2));
        expect(hit, `spawn ${v.x.toFixed(0)},${v.z.toFixed(0)} inside ${p.kind}`).toBe(false);
      }
      for (const l of layout.lots) {
        const f = BUILDING_FOOTPRINTS[l.type];
        expect(pts.some(([x, z]) => inRect(x, z, l.x, l.z, l.rotationY, f.w / 2, f.d / 2))).toBe(false);
      }
    }
  });

  it('boat spawns float in at least 0.8 m of water', () => {
    for (const v of layout.vehicleSpawns.filter((s) => s.kind === 'water')) {
      const bed = Math.max(...rectPoints(v.x, v.z, v.rotationY, 1.4, 3.2).map(([x, z]) => h(x, z)));
      expect(bed, `boat ${v.x},${v.z}`).toBeLessThan(world.waterLevelAt(v.x, v.z) - 0.8);
    }
  });

  it('bridge ramps meet the deck top (no step or dip at the deck ends)', () => {
    for (const br of layout.bridges) {
      const L = Math.hypot(br.b.x - br.a.x, br.b.z - br.a.z);
      const tx = (br.b.x - br.a.x) / L, tz = (br.b.z - br.a.z) / L;
      for (const [p, dir] of [
        [br.a, -1],
        [br.b, 1],
      ] as const) {
        for (const u of [0.5, 1, 2, 3]) {
          const y = h(p.x + tx * u * dir, p.z + tz * u * dir);
          expect(br.deckY - y, `bridge ${br.id} at ${u} m past the end`).toBeLessThan(0.45);
          expect(br.deckY - y).toBeGreaterThan(-0.3);
        }
      }
    }
  });

  it('free-standing props are not placed in water', () => {
    for (const p of layout.props) {
      const f = PROP_FOOTPRINTS[p.kind];
      if (!f || f.linear) continue;
      const min = Math.min(...rectPoints(p.x, p.z, p.rotationY, Math.max(0.2, f.hx), Math.max(0.2, f.hz), 2).map(([x, z]) => h(x, z)));
      expect(min, `${p.kind} @${p.x.toFixed(0)},${p.z.toFixed(0)}`).toBeGreaterThan(-0.2);
    }
  });

  it('every front door has a walkable approach', () => {
    for (const l of layout.lots) {
      const f = BUILDING_FOOTPRINTS[l.type];
      const fx = l.x + (f.d / 2 + 3) * Math.sin(l.rotationY), fz = l.z + (f.d / 2 + 3) * Math.cos(l.rotationY);
      expect(Math.abs(h(fx, fz) - l.groundY), `lot ${l.id} ${l.type}`).toBeLessThan(1.5);
    }
  });

  it('getSurface: asphalt on the road, gravel on the shoulder, natural ground beyond', () => {
    const road = layout.roadDefs.find((r) => r.kind === 'asphalt' && r.width >= 8)!;
    let checked = 0;
    for (let i = 10; i < road.points.length - 10 && checked < 40; i += 7) {
      const p = road.points[i], q = road.points[i + 1];
      const L = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      const nx = -(q.z - p.z) / L, nz = (q.x - p.x) / L;
      const at = (o: number) => [p.x + nx * o, p.z + nz * o] as const;
      // skip junctions / bridges / towns where other roads or pads are close
      if (roadEdge(...at(road.width / 2 + 4), road.id) < 6 || layout.bridges.some((b) => Math.hypot(b.a.x - p.x, b.a.z - p.z) < 120 || Math.hypot(b.b.x - p.x, b.b.z - p.z) < 120)) continue;
      expect(world.getSurface(...at(0))).toBe('asphalt');
      expect(world.getSurface(...at(road.width / 2 + 0.7))).toBe('gravel');
      expect(['asphalt', 'gravel']).not.toContain(world.getSurface(...at(road.width / 2 + 3.5)));
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('ponds have organic (non-circular) shorelines that getWaterHeight follows', () => {
    layout.ponds.forEach((p, i) => {
      const radii = Array.from({ length: 36 }, (_, k) => pondRadiusAt(p, i, p.x + Math.cos((k / 36) * Math.PI * 2), p.z + Math.sin((k / 36) * Math.PI * 2)));
      expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(1.25);
      // a point well inside the outline in every direction is water at the pond level
      for (let k = 0; k < 36; k += 3) {
        const a = (k / 36) * Math.PI * 2, r = radii[k] * 0.7;
        expect(world.getWaterHeight(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r)).toBeCloseTo(p.level, 3);
      }
    });
  });
});

describe('rain occlusion (no rain indoors)', () => {
  it('rasterises rotated building footprints at their roof height and leaves open ground clear', async () => {
    const THREE = await import('three');
    const { RainOcclusion } = await import('../src/world/env/RainOcclusion');
    const occ = new RainOcclusion();
    const lot = { id: 1, type: 'house_small' as const, x: 100, z: 200, rotationY: Math.PI / 4, seed: 1, groundY: 5 };
    const info = { id: 1, type: lot.type, lot, floors: 1, bounds: new THREE.Box3(new THREE.Vector3(90, 5, 190), new THREE.Vector3(110, 11.5, 210)) };
    expect(occ.update(100, 200, [info])).toBe(true);
    expect(occ.update(101, 201, [info])).toBe(false); // same snapped cell, same buildings: no rebuild
    const roofAt = (x: number, z: number) => {
      const o = occ.origin, res = occ.texture.image.width;
      const i = Math.floor(((x - o.x) / o.z) * res), j = Math.floor(((z - o.y) / o.z) * res);
      return (occ.texture.image.data as Float32Array)[j * res + i];
    };
    expect(roofAt(100, 200)).toBeCloseTo(11.5);
    // a point 4 m along the rotated local X axis is inside the 9 x 8 m footprint, 4 m along world X is a corner gap
    const c = Math.cos(lot.rotationY), s = Math.sin(lot.rotationY);
    expect(roofAt(100 + 4 * c, 200 - 4 * s)).toBeCloseTo(11.5);
    expect(roofAt(100 + 7, 200 + 7)).toBeLessThan(0);
    expect(roofAt(120, 220)).toBeLessThan(0);
  });
});

describe('spatial query edge cases', () => {
  it('isReserved with a margin beyond the 25.5 m distance cap does not reserve open country', () => {
    // open meadow far from roads/lots/props
    let open = 0;
    for (let x = 200; x < 2900 && open < 5; x += 37)
      for (let z = 200; z < 2900 && open < 5; z += 41)
        if (world.isLand(x, z) && world.reservedDistance(x, z) >= 25.5) {
          expect(world.isReserved(x, z, 30)).toBe(false);
          expect(world.isReserved(x, z, 0)).toBe(false);
          open++;
        }
    expect(open).toBe(5);
    // a road centre is reserved at any margin
    const p = layout.roadDefs[0].points[20];
    expect(world.isReserved(p.x, p.z, 0)).toBe(true);
    expect(world.isReserved(p.x, p.z, 40)).toBe(true);
  });

  it('queries are total outside the map and on NaN-free inputs', () => {
    expect(world.getSurface(-10, 50)).toBe('water');
    expect(world.isLand(5000, 5000)).toBe(false);
    expect(world.getWaterHeight(-100, -100)).not.toBeNull();
    expect(Number.isFinite(world.getHeight(-100, 99999))).toBe(true);
  });
});
