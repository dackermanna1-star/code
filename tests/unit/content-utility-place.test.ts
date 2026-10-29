// Bathroom / laundry / foyer / balcony placements: inside their rooms, ≥ 1.5 cm from finished
// wall faces (glazed-tile faces where tiled) except the parts that really go into the wall
// (hose/pipe/cable ends world-anchored at stub-outs), wall items flush on their mounting face,
// floor items on the floor, loose items resting exactly on their support (± 2 mm, no
// interpenetration), no intersections between unrelated items (AABB) or related ones (exact
// part-vs-part), door swings ≥ 90° and 0.85 m doorway paths clear, plumbing/electrical
// connections landing on the structure's stub-outs and outlets, budget, determinism.
// Run: node --test tests/unit/content-utility-*.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { qrot, v3, type Vec3 } from "../../src/geom/vec.ts";
import { aabbOf, polyContact, type Aabb } from "../../src/objects/lib/contact.ts";
import type { ConvexPoly } from "../../src/geom/poly.ts";
import { BALCONY, ROOMS, WALLS, type RoomId } from "../../src/world/plan.ts";
import { BALCONY_FLOOR_Y, CEILING_Y, FRONT_JAMB_T, JAMB_T, PARTITION_FACE, SERVICE_POINTS, SHIM, WALL_TILE_T, roomFaces, type Rect2 } from "../../src/world/structure/levels.ts";
import { ELECTRICAL } from "../../src/world/structure/services.ts";
import { fixtureLayout } from "../../src/world/furnish/fixtures.ts";
import { furnishUtility, furnishUtilityItems, toWorld, worldAabb, worldPolys, yawQ, type UtilityItem } from "../../src/world/furnish/utility.ts";

const items = furnishUtilityItems();
const byId = new Map(items.map((i) => [i.id, i]));
const MY_ROOMS: RoomId[] = ["bath", "utility", "foyer", "balcony"];
const TILE_H = ROOMS.find((r) => r.id === "bath")!.wallTiles; // 1.25

const fmt = (v: number) => v.toFixed(3);

/** Wall a wall-mounted item hangs on, from its facing (front +Z turned by yaw). */
function mountSide(yaw: number): "w" | "e" | "s" | "n" {
  const fx = Math.sin(yaw),
    fz = Math.cos(yaw);
  if (Math.abs(fx) > 0.5) return fx > 0 ? "w" : "e";
  return fz > 0 ? "s" : "n";
}

/** Parts of a placed item that are anchored to the building (they may enter the wall). */
function anchoredParts(it: UtilityItem): Set<number> {
  const names = new Set(it.def.bonds.filter((b) => b.b === "world").map((b) => b.a));
  const out = new Set<number>();
  it.def.parts.forEach((p, i) => {
    if (names.has(p.name)) out.add(i);
  });
  return out;
}

/** Finished wall faces for a part AABB in a room (bath: tile faces below the wainscot and in the tub zone). */
function facesFor(room: RoomId, b: Aabb): Rect2 {
  if (room === "balcony") {
    // railing posts/base plates inset 4 cm + 5 cm from the slab edges; the facade at z = −0.2
    return { x0: BALCONY.x0 + 0.09, x1: BALCONY.x1 - 0.09, z0: BALCONY.z0 + 0.09, z1: BALCONY.z1 };
  }
  const f = { ...roomFaces(room) };
  if (room === "bath") {
    const low = b.min.y < TILE_H;
    const tubWest = b.max.z > 8.05; // full-height tiles on the west wall around the tub
    const tubNorth = b.min.x < 1.7; // and on the north wall along the tub
    if (low || tubWest) f.x0 += WALL_TILE_T;
    if (low) f.x1 -= WALL_TILE_T;
    if (low) f.z0 += WALL_TILE_T;
    if (low || tubNorth) f.z1 -= WALL_TILE_T;
  }
  return f;
}

const partBoxes = new Map<string, Aabb[]>();
function boxesOf(it: UtilityItem): Aabb[] {
  let b = partBoxes.get(it.id);
  if (!b) partBoxes.set(it.id, (b = worldPolys(it.def, it.xf).map(aabbOf)));
  return b;
}

function boxOverlap(a: Aabb, b: Aabb, pad = 0): boolean {
  return a.min.x < b.max.x - pad && b.min.x < a.max.x - pad && a.min.y < b.max.y - pad && b.min.y < a.max.y - pad && a.min.z < b.max.z - pad && b.min.z < a.max.z - pad;
}

/** Items this one rests on / is contained in, transitively. */
function ancestors(it: UtilityItem, out = new Set<string>()): Set<string> {
  const direct = [...(it.on ? [it.on] : []), ...(it.tags ?? []).filter((t) => t.startsWith("inside:")).map((t) => t.slice(7))];
  for (const id of direct) {
    if (out.has(id)) continue;
    out.add(id);
    ancestors(byId.get(id)!, out);
  }
  return out;
}
function related(a: UtilityItem, b: UtilityItem): boolean {
  const A = ancestors(a),
    B = ancestors(b);
  if (A.has(b.id) || B.has(a.id)) return true;
  for (const x of A) if (B.has(x)) return true;
  return false;
}

/** Deepest interpenetration (m) between any two parts of two placed items. */
function maxPenetration(a: UtilityItem, b: UtilityItem): { depth: number; what: string } {
  const pa = worldPolys(a.def, a.xf),
    pb = worldPolys(b.def, b.xf);
  const ba = boxesOf(a),
    bb = boxesOf(b);
  let depth = 0,
    what = "";
  for (let i = 0; i < pa.length; i++)
    for (let j = 0; j < pb.length; j++) {
      if (!boxOverlap(ba[i], bb[j])) continue;
      const c = polyContact(pa[i], pb[j], 0);
      if (c && -c.sep > depth) {
        depth = -c.sep;
        what = `${a.def.parts[i].name} × ${b.def.parts[j].name}`;
      }
    }
  return { depth, what };
}

/** Smallest gap (m) between any two parts of two placed items (≤ tol), else Infinity. */
function minGap(a: UtilityItem, b: UtilityItem, tol: number): number {
  const pa = worldPolys(a.def, a.xf),
    pb = worldPolys(b.def, b.xf);
  const ba = boxesOf(a),
    bb = boxesOf(b);
  let g = Infinity;
  for (let i = 0; i < pa.length; i++)
    for (let j = 0; j < pb.length; j++) {
      if (!boxOverlap(ba[i], bb[j], -tol)) continue;
      const c = polyContact(pa[i], pb[j], tol);
      if (c) g = Math.min(g, c.sep);
    }
  return g;
}

// ---------------------------------------------------------------------------------------------

test("yaw convention: front +Z turns to (sin yaw, 0, cos yaw); local +X to (cos yaw, 0, −sin yaw)", () => {
  const e = 1e-9;
  const f = (yaw: number) => qrot(yawQ(yaw), v3(0, 0, 1));
  const r = (yaw: number) => qrot(yawQ(yaw), v3(1, 0, 0));
  assert.ok(Math.abs(f(Math.PI / 2).x - 1) < e, "π/2 → east");
  assert.ok(Math.abs(f(-Math.PI / 2).x + 1) < e, "−π/2 → west");
  assert.ok(Math.abs(f(Math.PI).z + 1) < e, "π → south");
  assert.ok(Math.abs(r(Math.PI / 2).z + 1) < e, "facing east, local +X points south");
});

test("ids unique, rooms tagged, defs carry their room, budget ≤ 1600 parts, deterministic", () => {
  assert.equal(byId.size, items.length);
  let parts = 0;
  for (const it of items) {
    assert.ok(MY_ROOMS.includes(it.room), `${it.id} room ${it.room}`);
    assert.equal(it.def.room, it.room, `${it.id} def.room`);
    parts += it.def.parts.length;
  }
  assert.ok(parts <= 1600, `area uses ${parts} parts`);
  const again = furnishUtilityItems();
  assert.equal(JSON.stringify(again), JSON.stringify(items));
  assert.equal(furnishUtility().length, items.length);
  for (const p of furnishUtility()) assert.deepEqual(Object.keys(p).sort(), ["def", "room", "type", "xf"]);
});

test("brief coverage: every required item is placed", () => {
  const types = new Map<string, number>();
  for (const it of items) types.set(it.type, (types.get(it.type) ?? 0) + 1);
  const need: Array<[string, number]> = [
    ["bathtub", 1], ["showerSet", 1], ["showerScreen", 1], ["toilet", 1], ["bathVanity", 1], ["mirrorCabinet", 1],
    ["towelRing", 1], ["towelRack", 1], ["toiletPaperHolder", 1], ["toothbrushCup", 1], ["soapDispenser", 1],
    ["shampooBottle", 2], ["hairDryer", 1], ["bathBin", 1], ["bathScale", 1], ["bathMat", 1], ["exhaustFan", 1],
    ["washer", 1], ["dryer", 1], ["waterHeater", 1], ["detergentJug", 2], ["paintCan", 2], ["toolbox", 1],
    ["hammer", 1], ["mopBucket", 1], ["broomHolder", 1], ["vacuumCleaner", 1], ["ironingBoard", 1], ["bulbBox", 1],
    ["electricalPanel", 1], ["coatCloset", 1], ["consoleTable", 1], ["foyerMirror", 1], ["keyBowl", 1], ["keyRing", 1],
    ["photoFrame", 1], ["shoeRack", 1], ["shoe", 4], ["umbrellaStand", 1], ["intercom", 1], ["foyerBench", 1],
    ["patioChair", 2], ["bistroTable", 1], ["terracottaPlant", 3], ["acCondenser", 1],
  ];
  for (const [t, n] of need) assert.ok((types.get(t) ?? 0) >= n, `${t}: ${types.get(t) ?? 0} < ${n}`);
});

test("inside their rooms and ≥ 1.5 cm from finished faces (anchored connection parts excepted)", () => {
  for (const it of items) {
    const anchored = anchoredParts(it);
    const boxes = boxesOf(it);
    boxes.forEach((b, i) => {
      const f = facesFor(it.room, b);
      const name = `${it.id}/${it.def.parts[i].name}`;
      if (anchored.has(i)) {
        // anchored parts may enter the wall a little (pipe into a stub-out, line set into the facade)
        const tol = 0.012;
        assert.ok(b.min.x >= f.x0 - tol && b.max.x <= f.x1 + tol && b.min.z >= f.z0 - tol && b.max.z <= f.z1 + tol, `${name} deep in a wall`);
        return;
      }
      const need = it.mount === "wall" ? -0.0005 : 0.015;
      const gaps = { w: b.min.x - f.x0, e: f.x1 - b.max.x, s: b.min.z - f.z0, n: f.z1 - b.max.z };
      for (const [side, g] of Object.entries(gaps)) {
        // a wall item sits flush on its own wall but keeps the full clearance from the others
        const own = it.mount === "wall" && side === mountSide(it.yaw);
        const req = own ? -0.0005 : it.mount === "wall" ? 0.015 : need;
        assert.ok(g >= req - 1e-9, `${name}: ${fmt(g)} m from the ${side} face (need ≥ ${req})`);
      }
    });
  }
});

test("wall items are flush on their mounting face, ceiling items under the ceiling, floor items on the floor", () => {
  for (const it of items) {
    const b = worldAabb(it.def, it.xf);
    if (it.mount === "wall") {
      const f = facesFor(it.room, b);
      const side = mountSide(it.yaw);
      const face = { w: f.x0, e: f.x1, s: f.z0, n: f.z1 }[side];
      const coord = side === "w" || side === "e" ? it.xf.p.x : it.xf.p.z;
      assert.ok(Math.abs(coord - face) < 1e-3, `${it.id} mounted at ${fmt(coord)} but the face is at ${fmt(face)}`);
    } else if (it.mount === "ceiling") {
      assert.ok(Math.abs(b.max.y - CEILING_Y) < 1e-3, `${it.id} top ${fmt(b.max.y)}`);
    } else if (it.mount === "floor") {
      const fy = it.room === "balcony" ? BALCONY_FLOOR_Y : 0;
      assert.ok(Math.abs(b.min.y - fy) < 1e-3, `${it.id} base at ${fmt(b.min.y)} (floor ${fy})`);
      assert.ok(Math.abs(it.xf.p.y - fy) < 1e-9, `${it.id} origin on the floor`);
    }
  }
});

test("loose items rest on their support (contact within 2 mm, no interpenetration)", () => {
  for (const it of items) {
    if (it.mount !== "on") continue;
    const sup = byId.get(it.on!)!;
    assert.ok(sup, `${it.id} support ${it.on}`);
    const pen = maxPenetration(it, sup);
    assert.ok(pen.depth <= 0.0015, `${it.id} sinks ${fmt(pen.depth)} m into ${sup.id} (${pen.what})`);
    const gap = minGap(it, sup, 0.004);
    assert.ok(gap <= 0.002, `${it.id} floats ${Number.isFinite(gap) ? fmt(gap) : "> 4 mm"} above ${sup.id}`);
  }
});

test("no intersections: unrelated items' AABBs are disjoint, related items do not interpenetrate", () => {
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i],
        b = items[j];
      if (a.room !== b.room) continue;
      if (related(a, b)) {
        const pen = maxPenetration(a, b);
        assert.ok(pen.depth <= 0.0015, `${a.id} and ${b.id} interpenetrate ${fmt(pen.depth)} m (${pen.what})`);
        continue;
      }
      const A = worldAabb(a.def, a.xf),
        B = worldAabb(b.def, b.xf);
      assert.ok(!boxOverlap(A, B), `${a.id} and ${b.id} overlap`);
    }
});

test("no intersections with the other agents' fixtures in these rooms (lights, door stops, hooks, chime)", () => {
  for (const fx of fixtureLayout()) {
    if (!MY_ROOMS.includes(fx.room)) continue;
    const F = worldAabb(fx.def, fx.xf);
    for (const it of items) {
      if (it.room !== fx.room) continue;
      assert.ok(!boxOverlap(F, worldAabb(it.def, it.xf)), `${it.id} overlaps the ${fx.type}`);
    }
  }
});

// ------------------------------------------------------------------ doors and paths

interface DoorSwing {
  id: string;
  room: RoomId;
  hinge: { x: number; z: number };
  /** Unit vectors: along the closed leaf (hinge → latch) and into the room. */
  along: number;
  into: number;
  leaf: number;
  head: number;
}

function doorSwings(): DoorSwing[] {
  const out: DoorSwing[] = [];
  for (const wall of WALLS)
    for (const op of wall.openings) {
      if ((op.kind !== "door" && op.kind !== "frontDoor") || !op.into || !op.hinge || !MY_ROOMS.includes(op.into)) continue;
      const alongX = Math.abs(wall.b[1] - wall.a[1]) < 1e-6;
      assert.ok(alongX, "doors on walls along x only");
      const dir = Math.sign(wall.b[0] - wall.a[0]);
      const p0 = wall.a[0] + dir * op.from,
        p1 = wall.a[0] + dir * op.to;
      const lo = Math.min(p0, p1),
        hi = Math.max(p0, p1);
      const aEnd = dir >= 0 ? lo : hi;
      const hingeEnd = op.hinge === "a" ? aEnd : aEnd === lo ? hi : lo;
      const toHinge = Math.sign(hingeEnd - (lo + hi) / 2);
      const jamb = op.kind === "frontDoor" ? FRONT_JAMB_T : JAMB_T;
      const room = ROOMS.find((r) => r.id === op.into)!;
      const into = (room.z0 + room.z1) / 2 > wall.a[1] ? 1 : -1;
      const face = wall.a[1] + into * (wall.thickness / 2);
      out.push({ id: op.id, room: op.into, hinge: { x: hingeEnd - toHinge * (SHIM + jamb), z: face }, along: -toHinge, into, leaf: hi - lo - 2 * (SHIM + jamb), head: op.head });
    }
  return out;
}

/** True when a plan rectangle intersects the door's 0–90° swept quarter disc (+ the open leaf with handles). */
function hitsSwing(d: DoorSwing, b: Aabb): boolean {
  if (b.min.y > d.head || b.max.y < 0.005) return false;
  // local plan coords: u along the closed leaf, w into the room
  const corners = [
    [b.min.x, b.min.z],
    [b.max.x, b.min.z],
    [b.min.x, b.max.z],
    [b.max.x, b.max.z],
  ].map(([x, z]) => [(x - d.hinge.x) * d.along, (z - d.hinge.z) * d.into]);
  const u0 = Math.min(...corners.map((c) => c[0])),
    u1 = Math.max(...corners.map((c) => c[0])),
    w0 = Math.min(...corners.map((c) => c[1])),
    w1 = Math.max(...corners.map((c) => c[1]));
  const R = d.leaf + 0.02;
  // quarter disc u ≥ 0, w ≥ 0, r ≤ R: closest point of the clipped rectangle to the hinge
  const cu0 = Math.max(u0, 0),
    cw0 = Math.max(w0, 0);
  if (cu0 <= u1 && cw0 <= w1 && Math.hypot(cu0, cw0) <= R) return true;
  // the leaf standing open at 90° with its handles: u ∈ [−0.10, 0.10], w ∈ [0, R]
  return u0 < 0.1 && u1 > -0.1 && w1 > 0 && w0 < R;
}

test("door swings: bathroom, laundry and front doors open ≥ 90° (nothing in the swept area)", () => {
  const swings = doorSwings();
  assert.deepEqual(swings.map((s) => s.id).sort(), ["door_bath", "door_utility", "front_door"]);
  for (const d of swings) {
    for (const it of items) {
      if (it.room !== d.room) continue;
      boxesOf(it).forEach((b, i) => assert.ok(!hitsSwing(d, b), `${it.id}/${it.def.parts[i].name} blocks ${d.id}`));
    }
  }
  // the vanity in particular (the structure review moved its stub-out north of the swing)
  const bath = swings.find((s) => s.id === "door_bath")!;
  const v = worldAabb(byId.get("vanity")!.def, byId.get("vanity")!.xf);
  assert.ok(Math.hypot(v.min.x - bath.hinge.x, v.min.z - bath.hinge.z) > bath.leaf + 0.1, "vanity well clear of the bathroom door");
});

test("0.85 m clear paths through the doorways (0.6 m deep into each room)", () => {
  const paths: Array<{ id: string; room: RoomId; x0: number; x1: number; z0: number; z1: number }> = [];
  const half = (w: number) => Math.min(0.85, w) / 2;
  const B = roomFaces("bath"),
    U = roomFaces("utility"),
    F = roomFaces("foyer");
  paths.push({ id: "door_bath", room: "bath", x0: 1.8 - half(0.8), x1: 1.8 + half(0.8), z0: B.z0, z1: B.z0 + 0.6 });
  paths.push({ id: "door_utility", room: "utility", x0: 3.25 - half(0.8), x1: 3.25 + half(0.8), z0: U.z0, z1: U.z0 + 0.6 });
  paths.push({ id: "front_door", room: "foyer", x0: 10.9 - half(1), x1: 10.9 + half(1), z0: F.z1 - 0.6, z1: F.z1 });
  paths.push({ id: "door_bed2", room: "foyer", x0: 10.05 - half(0.9), x1: 10.05 + half(0.9), z0: F.z0, z1: F.z0 + 0.6 });
  paths.push({ id: "arch_foyer", room: "foyer", x0: F.x0, x1: F.x0 + 0.6, z0: 5.2 - half(1.2), z1: 5.2 + half(1.2) });
  // balcony: in front of the sliding panel (east half of the slider, x 6.2–7.4)
  paths.push({ id: "slider_living", room: "balcony", x0: 6.8 - 0.425, x1: 6.8 + 0.425, z0: -0.2 - 0.6, z1: -0.2 });
  for (const p of paths) {
    const zone: Aabb = { min: v3(p.x0, 0.02, p.z0), max: v3(p.x1, 2.0, p.z1) };
    for (const it of items) {
      if (it.room !== p.room) continue;
      boxesOf(it).forEach((b, i) => assert.ok(!boxOverlap(b, zone), `${it.id}/${it.def.parts[i].name} in the ${p.id} path`));
    }
  }
});

test("switches and outlets in these rooms stay uncovered (≥ 1 cm around the plates)", () => {
  for (const e of ELECTRICAL) {
    if (e.at === undefined || !MY_ROOMS.includes(e.room)) continue;
    const wall = WALLS.find((w) => w.id === e.wall)!;
    const alongX = Math.abs(wall.b[1] - wall.a[1]) < 1e-6;
    const line = alongX ? wall.a[1] : wall.a[0];
    const room = ROOMS.find((r) => r.id === e.room)!;
    const mid = alongX ? (room.z0 + room.z1) / 2 : (room.x0 + room.x1) / 2;
    const s = mid > line ? 1 : -1;
    const face = wall.kind === "partition" || wall.kind === "plumbing" ? line + s * PARTITION_FACE : alongX ? (s > 0 ? 0 : 8.8) : s > 0 ? 0 : 12.8;
    const tiled = e.room === "bath" && e.y < TILE_H;
    const f0 = face + s * (tiled ? WALL_TILE_T : 0);
    const n0 = Math.min(f0, f0 + s * 0.024),
      n1 = Math.max(f0, f0 + s * 0.024);
    const plate: Aabb = alongX
      ? { min: v3(e.at - 0.045, e.y - 0.0675, n0), max: v3(e.at + 0.045, e.y + 0.0675, n1) }
      : { min: v3(n0, e.y - 0.0675, e.at - 0.045), max: v3(n1, e.y + 0.0675, e.at + 0.045) };
    for (const it of items) {
      if (it.room !== e.room) continue;
      const tag = it.tags?.find((t) => t === `outlet:${e.id}`);
      boxesOf(it).forEach((b, i) => {
        const name = it.def.parts[i].name;
        if (tag && /plug|cord/.test(name)) return; // the plug that is plugged in
        assert.ok(!boxOverlap(b, plate), `${it.id}/${name} covers ${e.id}`);
      });
    }
  }
});

// ------------------------------------------------------------------ service connections

/** World anchors of the world bonds of an item whose part names match `re`. */
function anchorsOf(it: UtilityItem, re: RegExp): Vec3[] {
  return it.def.bonds.filter((b) => b.b === "world" && re.test(b.a) && b.anchor).map((b) => toWorld(it.xf, b.anchor!.x, b.anchor!.y, b.anchor!.z));
}
const near = (p: Vec3, q: Vec3, tol: number) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) <= tol;

test("plumbing lands on the structure's stub-outs; the dryer is plugged into its outlet", () => {
  const sp = (id: string) => SERVICE_POINTS.find((s) => s.id === id)!;
  // direction from the stub-out wall face into its room
  const into = (id: string) => {
    const p = sp(id);
    const r = ROOMS.find((q) => q.id === p.room)!;
    return (r.x0 + r.x1) / 2 > p.face ? 1 : -1;
  };
  // vanity: hoses on top of both valves, trap into the drain stub
  const v = sp("vanity");
  const van = byId.get("vanity")!;
  const hoses = anchorsOf(van, /^hose_/);
  const sv = into("vanity");
  for (const dz of [-0.1, 0.1]) assert.ok(hoses.some((h) => near(h, v3(v.face + sv * 0.025, v.valveY + 0.016, v.along + dz), 0.01)), `vanity hose on the valve at ${v.along + dz}`);
  assert.ok(anchorsOf(van, /^trap_/).some((p) => near(p, v3(v.face, v.drainY!, v.along), 0.012)), "vanity trap at the drain stub");
  // washer: inlet under the cold valve, drain at the stub's mouth
  const w = sp("washer");
  const wa = byId.get("washer")!;
  const sw = into("washer");
  assert.ok(anchorsOf(wa, /^inlet_hose/).some((p) => near(p, v3(w.face + sw * 0.025, w.valveY - 0.02, w.along - 0.1), 0.01)), "washer inlet on the cold valve");
  assert.ok(anchorsOf(wa, /^drain_hose/).some((p) => near(p, v3(w.face + sw * 0.06, w.drainY!, w.along), 0.01)), "washer drain into the stub-out");
  // water heater: both pipes soldered onto the valve tops
  const h = sp("waterHeater");
  const wh = byId.get("waterHeater")!;
  for (const [re, dz] of [
    [/^pipe_cold/, -0.1],
    [/^pipe_hot/, 0.1],
  ] as Array<[RegExp, number]>)
    assert.ok(anchorsOf(wh, re).some((p) => near(p, v3(h.face + into("waterHeater") * 0.025, h.valveY + 0.019, h.along + dz), 0.01)), `heater ${re} on its valve`);
  // dryer plug in the outlet
  const od = ELECTRICAL.find((e) => e.id === "o_utility_dryer")!;
  const plug = anchorsOf(byId.get("dryer")!, /^plug/);
  assert.ok(plug.some((p) => near(p, v3(roomFaces("utility").x1 - 0.034, od.y, od.at!), 0.005)), "dryer plug in the outlet");
});

test("bathroom specifics: vanity centred on its stub-out, mirror cabinet clear above the outlet, screen on the rim", () => {
  const v = SERVICE_POINTS.find((s) => s.id === "vanity")!;
  const van = byId.get("vanity")!;
  assert.ok(Math.abs(van.xf.p.z - v.along) < 1e-9);
  const mc = worldAabb(byId.get("mirrorCabinet")!.def, byId.get("mirrorCabinet")!.xf);
  const outlet = ELECTRICAL.find((e) => e.id === "o_bath_mirror")!;
  assert.ok(mc.min.y >= outlet.y + 0.0575 + 0.01, `mirror cabinet bottom ${fmt(mc.min.y)} clears the outlet plate`);
  const vb = worldAabb(van.def, van.xf);
  assert.ok(mc.min.y > vb.max.y + 0.3, "room above the tap");
  const scr = worldAabb(byId.get("showerScreen")!.def, byId.get("showerScreen")!.xf);
  const tub = worldAabb(byId.get("bathtub")!.def, byId.get("bathtub")!.xf);
  assert.ok(Math.abs(scr.min.y - tub.max.y) < 1e-3, "screen stands on the rim");
  assert.ok(scr.min.z >= tub.min.z && scr.max.z <= tub.min.z + 0.07 + 1e-3, "screen within the front rim deck");
});
