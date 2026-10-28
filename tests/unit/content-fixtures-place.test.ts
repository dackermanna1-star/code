// Fixture placements: inside their rooms, mounted flush on the right surface (ceiling at 2.7 /
// wall face / floor at 0) without penetrating it, ≥ 1.5 cm from every other wall face, no
// overlaps between fixtures, door swings and doorways clear, windows covered, deterministic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { qeuler, qrot, v3, xapply } from "../../src/geom/vec.ts";
import { Builder } from "../../src/objects/lib/builder.ts";
import { fixtureLayout, furnishFixtures, yawFacing, openingSpan, CURTAIN_ROD_Y, type FixtureItem } from "../../src/world/furnish/fixtures.ts";
import { ROOMS, WALLS, roomById } from "../../src/world/plan.ts";
import { roomFaces, JAMB_T, FRONT_JAMB_T, SHIM } from "../../src/world/structure/levels.ts";

Builder.warnMode = "throw";

interface Box {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

function worldBox(it: FixtureItem, filter?: (name: string) => boolean): Box {
  const min = { x: Infinity, y: Infinity, z: Infinity },
    max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of it.def.parts) {
    if (filter && !filter(p.name)) continue;
    for (const v of p.poly.verts) {
      const w = xapply(it.xf, v);
      min.x = Math.min(min.x, w.x);
      min.y = Math.min(min.y, w.y);
      min.z = Math.min(min.z, w.z);
      max.x = Math.max(max.x, w.x);
      max.y = Math.max(max.y, w.y);
      max.z = Math.max(max.z, w.z);
    }
  }
  return { min, max };
}

const L = fixtureLayout();
const boxes = L.map((it) => worldBox(it));
const EPS = 0.002;

test("yaw convention: qeuler(0, yaw, 0) turns +Z to (sin yaw, 0, cos yaw); yawFacing inverts it", () => {
  for (const [dx, dz] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ]) {
    const f = qrot(qeuler(0, yawFacing(dx, dz), 0), v3(0, 0, 1));
    assert.ok(Math.abs(f.x - dx) < 1e-9 && Math.abs(f.z - dz) < 1e-9, `facing ${dx},${dz}`);
  }
  const e = qrot(qeuler(0, Math.PI / 2, 0), v3(0, 0, 1));
  assert.ok(Math.abs(e.x - 1) < 1e-9, "yaw +π/2 faces +X (east)");
});

test("one ceiling fixture per plan light position (fan in the living room), all at the ceiling", () => {
  const ceil = L.filter((it) => it.mount === "ceiling" && it.type !== "smokeDetector");
  const want = ROOMS.flatMap((r) => r.lights.map(([x, z]) => ({ room: r.id, x, z })));
  assert.equal(ceil.length, want.length);
  for (const w of want) {
    const it = ceil.find((c) => Math.abs(c.xf.p.x - w.x) < 1e-9 && Math.abs(c.xf.p.z - w.z) < 1e-9);
    assert.ok(it, `fixture at ${w.x},${w.z}`);
    assert.equal(it!.room, w.room);
    if (w.room === "living") assert.equal(it!.type, "ceilingFan");
  }
  const types = new Set(ceil.map((c) => c.type));
  for (const t of ["flushMountLight", "pendantLight", "trackLight", "schoolhouseLight", "battenLight", "ceilingFan"]) assert.ok(types.has(t), t);
});

test("every fixture lies in its room, flush on its mount surface and ≥ 1.5 cm from other wall faces", () => {
  L.forEach((it, i) => {
    const b = boxes[i];
    const r = roomFaces(it.room);
    const name = `${it.type}@${it.room}`;
    // inside the clear rectangle (touching allowed only on the mount side)
    assert.ok(b.min.x >= r.x0 - EPS && b.max.x <= r.x1 + EPS && b.min.z >= r.z0 - EPS && b.max.z <= r.z1 + EPS, `${name} inside ${it.room}: ${JSON.stringify(b)}`);
    assert.ok(b.min.y >= -EPS && b.max.y <= 2.7 + 1e-6, `${name} between floor and ceiling`);
    let mountSide: "x0" | "x1" | "z0" | "z1" | null = null;
    const isWall = it.mount === "wall" || it.type === "baseboardHeater";
    if (isWall) {
      // back of a wall fixture faces −front
      const f = qrot(it.xf.q, v3(0, 0, 1));
      mountSide = Math.abs(f.x) > 0.5 ? (f.x > 0 ? "x0" : "x1") : f.z > 0 ? "z0" : "z1";
      const face = r[mountSide];
      const back = mountSide === "x0" ? b.min.x : mountSide === "x1" ? b.max.x : mountSide === "z0" ? b.min.z : b.max.z;
      assert.ok(Math.abs(back - face) < EPS, `${name} flush on its wall (${back} vs ${face})`);
    }
    if (it.mount === "ceiling") assert.ok(Math.abs(b.max.y - 2.7) < EPS, `${name} touches the ceiling`);
    if (it.mount === "floor" && it.type === "doorStop") assert.ok(Math.abs(b.min.y) < 1e-6, `${name} on the floor`);
    const gap: Record<string, number> = { x0: b.min.x - r.x0, x1: r.x1 - b.max.x, z0: b.min.z - r.z0, z1: r.z1 - b.max.z };
    for (const [side, g] of Object.entries(gap)) if (side !== mountSide) assert.ok(g >= 0.015 - 1e-9, `${name}: ${(g * 100).toFixed(1)} cm from the ${side} wall`);
  });
});

test("fixtures do not overlap each other", () => {
  for (let i = 0; i < L.length; i++)
    for (let j = i + 1; j < L.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      const ov = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > 0.001 && Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > 0.001 && Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > 0.001;
      assert.ok(!ov, `${L[i].type}@${L[i].room} overlaps ${L[j].type}@${L[j].room}`);
    }
});

test("head clearance: hanging fixtures stay above 1.9 m", () => {
  L.forEach((it, i) => {
    if (it.mount === "ceiling") assert.ok(boxes[i].min.y >= 1.9, `${it.type} bottom at ${boxes[i].min.y.toFixed(2)} m`);
  });
});

test("door swings and doorways stay clear; door stops sit just past each leaf's 90° position", () => {
  for (const wall of WALLS) {
    for (const op of wall.openings) {
      if (op.kind === "window") continue;
      const s = openingSpan(wall, op);
      // doorway passage: the opening span × 0.6 m either side of the wall, up to the head
      const pass: Box =
        s.along === "x"
          ? { min: { x: s.lo, y: 0, z: s.line - 0.6 }, max: { x: s.hi, y: op.head, z: s.line + 0.6 } }
          : { min: { x: s.line - 0.6, y: 0, z: s.lo }, max: { x: s.line + 0.6, y: op.head, z: s.hi } };
      L.forEach((it, i) => {
        const b = boxes[i];
        if (it.opening === op.id && it.type === "curtains") return; // curtains frame the slider (checked below)
        const ov = Math.min(b.max.x, pass.max.x) > Math.max(b.min.x, pass.min.x) && Math.min(b.max.y, pass.max.y) > Math.max(b.min.y, pass.min.y) && Math.min(b.max.z, pass.max.z) > Math.max(b.min.z, pass.min.z);
        assert.ok(!ov, `${it.type}@${it.room} blocks ${op.id}`);
      });
      if ((op.kind !== "door" && op.kind !== "frontDoor") || !op.into) continue;
      // swing disc: hinge at the jamb, leaf radius, quadrant inside the room it swings into
      const jamb = op.kind === "frontDoor" ? FRONT_JAMB_T : JAMB_T;
      const leaf = s.hi - s.lo - 2 * (SHIM + jamb);
      const aEnd = Math.sign(wall.b[0] - wall.a[0]) >= 0 ? s.lo : s.hi;
      const hingeEnd = op.hinge === "a" ? aEnd : aEnd === s.lo ? s.hi : s.lo;
      const toHinge = Math.sign(hingeEnd - (s.lo + s.hi) / 2);
      const xh = hingeEnd - toHinge * (SHIM + jamb);
      const into = roomById(op.into);
      const sz = (into.z0 + into.z1) / 2 > s.line ? 1 : -1;
      const inQuadrant = (x: number, z: number): boolean => {
        const dx = (x - xh) * -toHinge,
          dz = (z - s.line) * sz;
        return dx >= -0.005 && dz >= 0 && Math.hypot(dx, dz) <= leaf + 0.08;
      };
      L.forEach((it, i) => {
        const b = boxes[i];
        if (b.min.y > 2.05) return; // above the door
        for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) assert.ok(!inQuadrant(x, z), `${it.type}@${it.room} in the swing of ${op.id}`);
      });
      const stop = L.find((it) => it.type === "doorStop" && it.opening === op.id);
      assert.ok(stop, `door stop for ${op.id}`);
      const d = Math.hypot(stop!.xf.p.x - xh, stop!.xf.p.z - s.line);
      assert.ok(d < leaf + 0.05 && d > leaf * 0.6, `${op.id} stop within reach of the leaf (${d.toFixed(2)} m, leaf ${leaf.toFixed(2)})`);
    }
  }
});

test("windows: blinds cover each bedroom window above the sill board; curtains frame the living openings", () => {
  for (const it of L.filter((x) => x.type === "venetianBlind")) {
    const { wall, op } = (() => {
      for (const w of WALLS) for (const o of w.openings) if (o.id === it.opening) return { wall: w, op: o };
      throw new Error("no opening");
    })();
    const s = openingSpan(wall, op);
    const b = worldBox(it);
    const lo = s.along === "x" ? b.min.x : b.min.z,
      hi = s.along === "x" ? b.max.x : b.max.z;
    assert.ok(lo <= s.lo - 0.02 && hi >= s.hi + 0.02, `${op.id} covered`);
    assert.ok(b.min.y >= op.sill + 0.05 && b.max.y >= op.head, `${op.id} hangs from above the head to above the board`);
  }
  const slider = L.find((x) => x.type === "curtains" && x.opening === "slider_living")!;
  const s = openingSpan(WALLS.find((w) => w.id === "south")!, WALLS.find((w) => w.id === "south")!.openings.find((o) => o.id === "slider_living")!);
  // clear passage between the two drawn panels
  const strips = slider.def.parts.filter((p) => p.name.startsWith("strip"));
  const xs = strips.map((p) => p.poly.verts.map((v) => xapply(slider.xf, v).x));
  const left = Math.max(...xs.filter((a) => Math.max(...a) < (s.lo + s.hi) / 2).flat());
  const right = Math.min(...xs.filter((a) => Math.min(...a) > (s.lo + s.hi) / 2).flat());
  assert.ok(right - left >= 1.0, `slider clear width ${(right - left).toFixed(2)} m`);
  assert.ok(Math.abs(slider.xf.p.y - CURTAIN_ROD_Y) < 1e-9);
});

test("area budget, room tags and determinism", () => {
  const parts = L.reduce((n, it) => n + it.def.parts.length, 0);
  assert.ok(parts <= 900, `fixture parts ${parts}`);
  for (const it of L) assert.equal(it.def.room, it.room);
  const P = furnishFixtures();
  assert.equal(P.length, L.length);
  assert.equal(JSON.stringify(furnishFixtures()), JSON.stringify(P));
});
