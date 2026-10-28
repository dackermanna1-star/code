import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCity, CITY_CENTER, GROUND_Y, TOWER_FOOTPRINT } from "../../src/render/env/cityLayout.ts";
import { buildCityGeometry } from "../../src/render/env/cityGeometry.ts";
import { buildTowerGeometry } from "../../src/render/env/towerLayout.ts";
import { TO_SUN } from "../../src/render/env/sunModel.ts";
import type { MeshBuffer } from "../../src/render/env/meshBuffer.ts";

const city = generateCity();

test("city generation is deterministic and populated", () => {
  const again = generateCity();
  assert.equal(again.buildings.length, city.buildings.length);
  assert.deepEqual(again.buildings[10], city.buildings[10]);
  assert.ok(city.buildings.length >= 200 && city.buildings.length <= 3000, `buildings ${city.buildings.length}`);
  assert.ok(city.cars.length > 80, `cars ${city.cars.length}`);
  assert.ok(city.lights.length > 60, `lights ${city.lights.length}`);
  assert.ok(city.trees.length > 60, `trees ${city.trees.length}`);
  assert.equal(GROUND_Y, -93);
});

test("buildings respect the 60–900 m ring, stay out of the tower block and keep the sun visible", () => {
  const sunEl = Math.asin(TO_SUN.y);
  const sunAz = Math.atan2(TO_SUN.x, TO_SUN.z);
  let tall = 0;
  for (const b of city.buildings) {
    const base = b.tiers[0].rect;
    const cx = (base.x0 + base.x1) / 2;
    const cz = (base.z0 + base.z1) / 2;
    const dx = cx < base.x0 ? 0 : Math.max(base.x0 - CITY_CENTER.x, 0, CITY_CENTER.x - base.x1);
    const dz = Math.max(base.z0 - CITY_CENTER.z, 0, CITY_CENTER.z - base.z1);
    assert.ok(Math.hypot(dx, dz) >= 55, "inside the inner ring");
    assert.ok(b.dist <= 905, "beyond the outer ring");
    const overlapsTower = !(base.x1 < TOWER_FOOTPRINT.x0 || base.x0 > TOWER_FOOTPRINT.x1 || base.z1 < TOWER_FOOTPRINT.z0 || base.z0 > TOWER_FOOTPRINT.z1);
    assert.ok(!overlapsTower);
    for (const t of b.tiers) {
      assert.ok(t.y1 > t.y0 && Number.isFinite(t.y1));
      assert.ok(t.rect.x1 > t.rect.x0 && t.rect.z1 > t.rect.z0);
    }
    const top = Math.max(...b.tiers.map((t) => t.y1), ...b.extras.map((e) => e.y1));
    if (top - GROUND_Y > 150) tall++;
    // Sun line: any roof corner in the sun's azimuth band stays below the sun disc.
    for (const t of [...b.tiers, ...b.extras.map((e) => ({ rect: e.rect, y0: e.y0, y1: e.y1 }))]) {
      for (const [x, z] of [
        [t.rect.x0, t.rect.z0],
        [t.rect.x1, t.rect.z0],
        [t.rect.x0, t.rect.z1],
        [t.rect.x1, t.rect.z1],
      ]) {
        const ddx = x - CITY_CENTER.x;
        const ddz = z - CITY_CENTER.z;
        let dAz = Math.atan2(ddx, ddz) - sunAz;
        dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz));
        if (Math.abs(dAz) > (1.0 * Math.PI) / 180) continue;
        const el = Math.atan2(t.y1 - 1.6, Math.hypot(ddx, ddz));
        assert.ok(el < sunEl - (0.7 * Math.PI) / 180, `roof at ${x.toFixed(0)},${z.toFixed(0)} occludes the sun`);
      }
    }
  }
  assert.ok(tall >= 5, `downtown should have skyscrapers (${tall})`);
});

test("ground tiles exactly cover the street grid extent", () => {
  const e = city.extent;
  const area = (r: { x0: number; x1: number; z0: number; z1: number }) => (r.x1 - r.x0) * (r.z1 - r.z0);
  const total = city.blocks.reduce((s, r) => s + area(r), 0) + city.roads.reduce((s, r) => s + area(r), 0) + city.intersections.reduce((s, r) => s + area(r), 0);
  const expected = area(e);
  assert.ok(Math.abs(total - expected) / expected < 1e-9, `tiling ${total} vs ${expected}`);
  for (const r of [...city.blocks, ...city.roads, ...city.intersections]) assert.ok(r.x1 > r.x0 && r.z1 > r.z0);
});

function assertFinite(mb: MeshBuffer, label: string) {
  for (const v of mb.positions) assert.ok(Number.isFinite(v), label);
  for (const v of mb.normals) assert.ok(Number.isFinite(v), label);
  for (const v of mb.uvs) assert.ok(Number.isFinite(v), label);
  const n = mb.vertexCount;
  for (const i of mb.indices) assert.ok(i >= 0 && i < n, label);
}

test("city geometry stays within budget", () => {
  const g = buildCityGeometry(city);
  const verts = g.buildings.vertexCount + g.ground.vertexCount + g.props.vertexCount;
  assert.ok(verts < 400000, `vertices ${verts}`);
  assert.ok(g.buildings.vertexCount > 1000);
  assertFinite(g.buildings, "buildings");
  assertFinite(g.ground, "ground");
  assertFinite(g.props, "props");
});

test("tower geometry never intrudes into the apartment's own storey", () => {
  const t = buildTowerGeometry();
  for (const [label, mb] of Object.entries({ near: t.near, far: t.far, glass: t.glass })) {
    assertFinite(mb, label);
    const P = mb.positions;
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i],
        y = P[i + 1],
        z = P[i + 2];
      const inside = x > -0.2 + 1e-6 && x < 13.0 - 1e-6 && z > -1.6 + 1e-6 && z < 9.0 - 1e-6 && y > -0.27 + 1e-6 && y < 2.7 - 1e-6;
      assert.ok(!inside, `${label} vertex (${x}, ${y}, ${z}) intrudes`);
    }
  }
  assert.ok(t.near.vertexCount > 500 && t.far.vertexCount > 10000, `near ${t.near.vertexCount} far ${t.far.vertexCount}`);
  assert.ok(t.glass.vertexCount > 1000);
  assert.ok(t.corridor.vertexCount > 100);
});
