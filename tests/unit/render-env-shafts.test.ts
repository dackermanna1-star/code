import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeShafts,
  clipPolyhedron,
  clipToBox,
  parallelepipedFaces,
  polyhedronVolume,
  triangulate,
  insideShaft,
  shaftCoords,
  exitDistance,
  roomClipBox,
} from "../../src/render/env/shaftGeom.ts";
import { SUN_LIGHT_DIR, TO_SUN, dirFromAngles } from "../../src/render/env/sunModel.ts";
import { roomById } from "../../src/world/plan.ts";

const unitCube = () => parallelepipedFaces({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });

test("sun model: west-south-west, low, unit length", () => {
  assert.ok(Math.abs(Math.hypot(TO_SUN.x, TO_SUN.y, TO_SUN.z) - 1) < 1e-12);
  assert.ok(TO_SUN.x < 0 && TO_SUN.z < 0, "sun in the south-west quadrant");
  assert.ok(Math.abs(TO_SUN.x) > Math.abs(TO_SUN.z), "more west than south");
  const el = (Math.asin(TO_SUN.y) * 180) / Math.PI;
  assert.ok(el >= 12 && el <= 15, `elevation ${el}`);
  const n = dirFromAngles(90, 0);
  assert.ok(Math.abs(n.x - 1) < 1e-12 && Math.abs(n.z) < 1e-12, "azimuth 90° = +X (east)");
});

test("polyhedron clipping keeps exact volumes", () => {
  const cube = unitCube();
  assert.ok(Math.abs(polyhedronVolume(cube) - 1) < 1e-9);
  const half = clipPolyhedron(cube, { x: 1, y: 0, z: 0 }, 0.5);
  assert.ok(Math.abs(polyhedronVolume(half) - 0.5) < 1e-9);
  // Diagonal plane through the centre removes half.
  const n = { x: 1 / Math.sqrt(3), y: 1 / Math.sqrt(3), z: 1 / Math.sqrt(3) };
  const diag = clipPolyhedron(cube, n, n.x * 1.5);
  assert.ok(Math.abs(polyhedronVolume(diag) - 0.5) < 1e-9);
  // Clip that removes everything / nothing.
  assert.equal(clipPolyhedron(cube, { x: 1, y: 0, z: 0 }, -0.1).length, 0);
  assert.ok(Math.abs(polyhedronVolume(clipPolyhedron(cube, { x: 1, y: 0, z: 0 }, 2)) - 1) < 1e-9);
  const boxed = clipToBox(cube, { x: 0.25, y: 0.25, z: 0.25 }, { x: 0.75, y: 2, z: 2 });
  assert.ok(Math.abs(polyhedronVolume(boxed) - 0.5 * 0.75 * 0.75) < 1e-9);
});

test("triangulation uses Babylon's front-face winding (RH cross points inward)", () => {
  const { positions, indices } = triangulate(unitCube());
  assert.equal(indices.length, 6 * 2 * 3);
  for (let t = 0; t < indices.length; t += 3) {
    const p = (i: number) => ({ x: positions[indices[i] * 3], y: positions[indices[i] * 3 + 1], z: positions[indices[i] * 3 + 2] });
    const a = p(t),
      b = p(t + 1),
      c = p(t + 2);
    const e1 = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const e2 = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const n = { x: e1.y * e2.z - e1.z * e2.y, y: e1.z * e2.x - e1.x * e2.z, z: e1.x * e2.y - e1.y * e2.x };
    const m = { x: (a.x + b.x + c.x) / 3 - 0.5, y: (a.y + b.y + c.y) / 3 - 0.5, z: (a.z + b.z + c.z) / 3 - 0.5 };
    assert.ok(n.x * m.x + n.y * m.y + n.z * m.z < 0, "triangle should face outward for Babylon");
  }
});

test("golden-hour shafts enter through the south openings only", () => {
  const shafts = computeShafts(SUN_LIGHT_DIR);
  const ids = shafts.map((s) => s.id).sort();
  assert.deepEqual(ids, ["slider_living", "win_bed2_s", "win_living", "win_master"].sort());
  for (const s of shafts) {
    assert.ok(s.volume > 0.05, `${s.id} volume ${s.volume}`);
    assert.ok(s.apertureArea > 0.1, `${s.id} aperture ${s.apertureArea}`);
    assert.ok(Math.abs(s.origin.z) < 1e-9, `${s.id} starts on the interior face of the south wall`);
    for (let i = 0; i < s.positions.length; i += 3) {
      const x = s.positions[i],
        y = s.positions[i + 1],
        z = s.positions[i + 2];
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
      assert.ok(x >= s.clipMin.x - 1e-6 && x <= s.clipMax.x + 1e-6, `${s.id} x ${x}`);
      assert.ok(y >= s.clipMin.y - 1e-6 && y <= s.clipMax.y + 1e-6, `${s.id} y ${y}`);
      assert.ok(z >= s.clipMin.z - 1e-6 && z <= s.clipMax.z + 1e-6, `${s.id} z ${z}`);
    }
    // inverse basis maps the corners correctly
    const c = shaftCoords(s, { x: s.origin.x + s.U.x + s.D.x * 0.5, y: s.origin.y + s.U.y + s.D.y * 0.5, z: s.origin.z + s.U.z + s.D.z * 0.5 });
    assert.ok(Math.abs(c.x - 1) < 1e-9 && Math.abs(c.y) < 1e-9 && Math.abs(c.z - 0.5) < 1e-9);
  }
  // The 0.2 m reveal shades part of the 1.0 m living window at this grazing angle.
  const win = shafts.find((s) => s.id === "win_living")!;
  const w = Math.hypot(win.U.x, win.U.y, win.U.z);
  assert.ok(w < 0.9 && w > 0.3, `effective width ${w}`);
  // A point just inside the slider beam is inside; the room centre far from beams is not.
  const sl = shafts.find((s) => s.id === "slider_living")!;
  const p = { x: sl.origin.x + sl.U.x * 0.5 + sl.V.x * 0.5 + 0.3 * SUN_LIGHT_DIR.x * 2, y: sl.origin.y + sl.V.y * 0.5 + SUN_LIGHT_DIR.y * 0.6, z: sl.origin.z + SUN_LIGHT_DIR.z * 0.6 };
  assert.ok(insideShaft(sl, p), "point in the beam");
  assert.ok(!insideShaft(sl, { x: 5.0, y: 1.5, z: 4.5 }), "point outside the beam");
});

test("only openings facing the sun get shafts; none when the sun is below the horizon", () => {
  // Morning sun in the north-east: light travels south-west, entering only the east window.
  const ne = dirFromAngles(45, 20);
  const ids = computeShafts({ x: -ne.x, y: -ne.y, z: -ne.z }).map((s) => s.id);
  assert.deepEqual(ids, ["win_bed2_e"]);
  assert.equal(computeShafts({ x: 0.9, y: 0.2, z: 0.4 }).length, 0, "light going upwards");
});

test("exit distance and clip boxes", () => {
  const d = exitDistance({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
  assert.ok(Math.abs(d - 0.5) < 1e-12);
  const living = roomClipBox(roomById("living"));
  // open plan: living extends over the kitchen (same x span, no wall at z = 5.0)
  assert.ok(living.max.z > 8.0, `living clip box should extend into the kitchen (${living.max.z})`);
  // partition face inset on the bedroom-2 side (x = 9.2 − 0.0575)
  assert.ok(Math.abs(living.max.x - (9.2 - 0.0575 - 0.004)) < 1e-9);
  // concrete shell face stays on the boundary (z = 0)
  assert.ok(Math.abs(living.min.z - 0.004) < 1e-9);
});
