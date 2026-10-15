// Terrain generation invariants (runs the full generator once, ~3-6 s).
import { beforeAll, describe, expect, it } from 'vitest';
import { buildLayout } from '../src/world/layout/MapData';
import { generateTerrain } from '../src/world/terrain/generate';
import type { TerrainResult } from '../src/world/terrain/TerrainData';
import { CELL, CLS, CLS_CELL, M, MAP_RES, N, Surf, WATER_RES } from '../src/world/terrain/TerrainData';
import { heightAt } from '../src/world/terrain/sample';
import { densify } from '../src/world/terrain/gen/raster';
import { BUILDING_FOOTPRINTS } from '../src/core/contracts';
import type { WorldLayout } from '../src/world/layout/types';

let layout: WorldLayout;
let t: TerrainResult;
const h = (x: number, z: number) => heightAt(t.heights, N, CELL, x, z);

beforeAll(() => {
  layout = buildLayout();
  t = generateTerrain(layout);
  layout.lots.forEach((l, i) => (l.groundY = t.lotGround[i]));
}, 120000);

describe('terrain generation', () => {
  it('produces grids of the documented sizes', () => {
    expect(t.heights.length).toBe(N * N);
    expect(t.surface.length).toBe(CLS * CLS);
    expect(t.reserved.length).toBe(M * M);
    expect(t.water.length).toBe(WATER_RES * WATER_RES * 4);
    expect(t.mapRaster.length).toBe(MAP_RES * MAP_RES * 4);
  });

  it('flattens every lot pad to its groundY, above water', () => {
    let worst = 0;
    for (const lot of layout.lots) {
      const f = BUILDING_FOOTPRINTS[lot.type];
      const c = Math.cos(lot.rotationY), s = Math.sin(lot.rotationY);
      for (const [lx, lz] of [[0, 0], [f.w / 2, f.d / 2], [-f.w / 2, f.d / 2], [f.w / 2, -f.d / 2], [-f.w / 2, -f.d / 2]]) {
        const x = lot.x + lx * c + lz * s, z = lot.z - lx * s + lz * c;
        worst = Math.max(worst, Math.abs(h(x, z) - lot.groundY));
      }
      expect(lot.groundY).toBeGreaterThan(1.5);
    }
    expect(worst).toBeLessThan(1e-3);
  });

  it('keeps asphalt roads drivable (gentle grades) outside bridges', () => {
    let worst = 0;
    for (const r of layout.roadDefs) {
      if (r.kind !== 'asphalt') continue;
      const pts = densify(r.points, 4);
      for (let i = 1; i < pts.length; i++) {
        const onBridge = layout.bridges.some((b) => {
          const dx = b.b.x - b.a.x, dz = b.b.z - b.a.z, L2 = dx * dx + dz * dz;
          const u = ((pts[i].x - b.a.x) * dx + (pts[i].z - b.a.z) * dz) / L2;
          const L = Math.sqrt(L2);
          // deck span plus 20 m at each end (the terrain under the deck ends drops away; the deck carries the road)
          return u > -20 / L && u < 1 + 20 / L && Math.hypot(b.a.x + dx * u - pts[i].x, b.a.z + dz * u - pts[i].z) < 12;
        });
        if (onBridge) continue;
        worst = Math.max(worst, Math.abs(h(pts[i].x, pts[i].z) - h(pts[i - 1].x, pts[i - 1].z)) / 4);
      }
    }
    expect(worst).toBeLessThan(0.22); // ≈ 12° worst local grade over 4 m (junction blends), typical < 8.5 %
  });

  it('carves the river below sea level and raises bridge decks above it', () => {
    const pts = densify(layout.river.points, 25);
    for (const p of pts.slice(2, -2)) expect(h(p.x, p.z)).toBeLessThan(-0.3);
    for (const b of layout.bridges) {
      expect(t.bridgeDeck[b.id - 1]).toBeGreaterThanOrEqual(b.kind === 'channel' ? 10 : 6.5);
      const mx = (b.a.x + b.b.x) / 2, mz = (b.a.z + b.b.z) / 2;
      expect(h(mx, mz)).toBeLessThan(0); // water under the middle of every bridge
    }
  });

  it('keeps the quarry floor dry and the open sea deep', () => {
    expect(h(layout.quarry.x, layout.quarry.z)).toBeGreaterThan(3);
    expect(h(20, 20)).toBeLessThan(-10);
    expect(h(3060, 3060)).toBeLessThan(-10);
  });

  it('classifies roads, water and beaches', () => {
    const road = layout.roadDefs.find((r) => r.kind === 'asphalt')!;
    const p = densify(road.points, 50)[3];
    expect(t.roadMask[Math.floor(p.z / CELL) * M + Math.floor(p.x / CELL)]).toBe(1);
    const rp = layout.river.points[10];
    expect(t.surface[Math.floor(rp.z / CLS_CELL) * CLS + Math.floor(rp.x / CLS_CELL)]).toBe(Surf.Water);
    let sand = 0;
    for (let i = 0; i < t.surface.length; i++) if (t.surface[i] === Surf.Sand) sand++;
    expect(sand).toBeGreaterThan(1000);
  });

  it('resolves pond levels below their rims', () => {
    layout.ponds.forEach((p, i) => {
      const lvl = t.pondLevel[i];
      expect(Number.isFinite(lvl)).toBe(true);
      expect(h(p.x, p.z)).toBeLessThan(lvl - 1);
      // the bank just outside the water disc (radius + 6 m) stands above the water
      for (let a = 0; a < 8; a++) expect(h(p.x + Math.cos(a) * (p.radius + 8), p.z + Math.sin(a) * (p.radius + 8))).toBeGreaterThan(lvl - 0.45);
    });
  });
});
