// Kitchen furnishing: built-in runs, island, wall cabinets, appliances and everything on/in them.
// Every resting height is measured from the built assemblies (worktop, shelves, racks, bins),
// never guessed. Containers are placed first; their contents are composed in the container's
// frame (plates in a cabinet move with the cabinet's placement).
//
// `kitchenLayout()` also reports, per placement, the index of the placement it rests on or in
// (-1 = the floor / a wall), which the tests use to tell intended contact from collisions.

import { qaxisAngle, qrot, v3, xapply, xmul, type Quat, type Xform } from "../../geom/vec.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { buildMicrowave } from "../../objects/reference/microwave.ts";
import { KITCHEN_OBJECTS as K } from "../../objects/kitchen/index.ts";
import { yawXf } from "../../objects/kitchen/lib.ts";
import { COUNTER_Y, DISHWASHER, FRIDGE, HOOD, ISLAND_XF, KF, NORTH_XF, RANGE, UPPERS, UPPER_BACK_Z, WALL_CAB, WEST, WEST_XF } from "../../objects/kitchen/layout.ts";
import { RANGE_BURNERS, RANGE_DIM, RANGE_TOP_Y } from "../../objects/kitchen/range.ts";
import { DW_DIM, DW_RACKS } from "../../objects/kitchen/dishwasher.ts";
import { FRIDGE_DIM } from "../../objects/kitchen/fridge.ts";
import { DISH_RACK, FRUIT_BOWL_FLOOR, KNIFE_BLADE, KNIFE_SLOTS, KNIFE_SLOT_FLOOR, KNIFE_SLOT_LEN, KNIFE_TILT, SPICE_SLOTS } from "../../objects/kitchen/items.ts";
import { polyTransform, type ConvexPoly } from "../../geom/poly.ts";
import { aabbOf, polyContact } from "../../objects/lib/contact.ts";
import type { Placement } from "./types.ts";

/** Gap left under resting items (m) so nothing starts interpenetrating. */
const REST_GAP = 0.0005;

export interface KitchenLayout {
  placements: Placement[];
  /** Index of the placement each one rests on / sits in (-1: floor or wall). */
  on: number[];
}

interface Box3 {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** World AABB of one named part of a placed def. */
export function partBox(def: AssemblyDef, xf: Xform, name: string): Box3 {
  const p = def.parts.find((q) => q.name === name);
  if (!p) throw new Error(`furnishKitchen: ${def.type} has no part '${name}'`);
  const mn = { x: Infinity, y: Infinity, z: Infinity },
    mx = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const v of p.poly.verts) {
    const w = xapply(xf, v);
    mn.x = Math.min(mn.x, w.x);
    mn.y = Math.min(mn.y, w.y);
    mn.z = Math.min(mn.z, w.z);
    mx.x = Math.max(mx.x, w.x);
    mx.y = Math.max(mx.y, w.y);
    mx.z = Math.max(mx.z, w.z);
  }
  return { min: mn, max: mx };
}

/** Lowest point of a def after rotating it by q (local frame). */
function minYRotated(def: AssemblyDef, q: Quat): number {
  let y = Infinity;
  for (const p of def.parts) for (const v of p.poly.verts) y = Math.min(y, qrot(q, v).y);
  return y;
}

/**
 * Vertical pitch at which identical copies of `def` nest, each resting on the one below (plates,
 * bowls): the smallest upward shift at which the copy clears the original by `gap` everywhere,
 * found by bisection on the exact convex separation of every part pair. Real stacks rest foot-on-
 * slope, so the pitch is set by the geometry, never guessed.
 */
export function nestPitch(def: AssemblyDef, gap = REST_GAP): number {
  const polys = def.parts.map((p) => p.poly);
  const boxes = polys.map(aabbOf);
  let y0 = Infinity,
    y1 = -Infinity;
  for (const b of boxes) {
    y0 = Math.min(y0, b.min.y);
    y1 = Math.max(y1, b.max.y);
  }
  const clear = (dy: number): boolean => {
    const up: ConvexPoly[] = polys.map((p) => polyTransform(p, { p: v3(0, dy, 0), q: { x: 0, y: 0, z: 0, w: 1 } }));
    for (let i = 0; i < polys.length; i++)
      for (let j = 0; j < up.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        // shifted copy's bounds overlap the original's (with the gap as margin)?
        if (a.max.x + gap < b.min.x || b.max.x + gap < a.min.x || a.max.z + gap < b.min.z || b.max.z + gap < a.min.z) continue;
        if (a.max.y + gap < b.min.y + dy || b.max.y + dy + gap < a.min.y) continue;
        const c = polyContact(polys[i], up[j], gap);
        if (c && c.sep < gap) return false;
      }
    return true;
  };
  let lo = 0,
    hi = y1 - y0 + gap;
  for (let it = 0; it < 22; it++) {
    const mid = (lo + hi) / 2;
    if (clear(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Local transform placing an item on a surface at height y (container frame), yaw in radians. */
function onSurf(x: number, y: number, z: number, yaw = 0): Xform {
  return yawXf(x, y + REST_GAP, z, yaw);
}

export function kitchenLayout(seed = 1): KitchenLayout {
  const placements: Placement[] = [];
  const on: number[] = [];
  let s = seed * 7919;
  const nextSeed = (): number => (s = (s * 48271) % 2147483647);
  const put = (type: string, def: AssemblyDef, xf: Xform, support = -1): number => {
    placements.push({ type, def, xf, room: "kitchen" });
    on.push(support);
    return placements.length - 1;
  };
  /** Place `type` in the frame of placement `parent` (local xf), resting on it. */
  const putIn = (parent: number, type: string, def: AssemblyDef, local: Xform): number => put(type, def, xmul(placements[parent].xf, local), parent);
  const top = (idx: number, part: string): number => partBox(placements[idx].def, placements[idx].xf, part).max.y;
  const localTop = (idx: number, part: string): number => {
    const def = placements[idx].def;
    const p = def.parts.find((q) => q.name === part);
    if (!p) throw new Error(`furnishKitchen: ${def.type} has no part '${part}'`);
    return Math.max(...p.poly.verts.map((v) => v.y));
  };

  /** One plate on each side of a tine row (container frame): leaning 12° onto the tines. */
  const leanPlates = (parent: number, gridY: number, tineZ: number): void => {
    const lean = (12 * Math.PI) / 180;
    for (const side of [1, -1]) {
      const q = qaxisAngle(v3(1, 0, 0), side * (Math.PI / 2 - lean));
      const def = K.plate({ seed: nextSeed() });
      let zmin = Infinity,
        zmax = -Infinity;
      for (const p of def.parts)
        for (const v of p.poly.verts) {
          const r = qrot(q, v);
          zmin = Math.min(zmin, r.z);
          zmax = Math.max(zmax, r.z);
        }
      const y = gridY - minYRotated(def, q) + REST_GAP;
      const z = side > 0 ? tineZ + 0.004 - zmin : tineZ - 0.004 - zmax;
      putIn(parent, "plate", def, { p: v3(0, y, z), q });
    }
  };

  // ------------------------------------------------------------------ built-ins
  const north = put("kitchenNorthRun", K.kitchenNorthRun({ seed: nextSeed() }), NORTH_XF);
  const west = put("kitchenWestRun", K.kitchenWestRun({ seed: nextSeed() }), WEST_XF);
  const island = put("kitchenIsland", K.kitchenIsland({ seed: nextSeed() }), ISLAND_XF);
  const uppers: Record<string, number> = {};
  for (const u of UPPERS) {
    const w = u.x1 - u.x0;
    uppers[u.id] = put("kitchenWallCabinet", K.kitchenWallCabinet({ w, doors: u.doors, hinge: u.hinge, seed: nextSeed() }), yawXf((u.x0 + u.x1) / 2, WALL_CAB.bottom, UPPER_BACK_Z - WALL_CAB.d / 2, Math.PI));
  }
  // ------------------------------------------------------------------ appliances
  const range = put("range", K.range({ seed: nextSeed() }), yawXf(RANGE.x, 0, RANGE.backZ + RANGE_DIM.zBack, Math.PI));
  const dw = put("dishwasher", K.dishwasher({ seed: nextSeed() }), yawXf(DISHWASHER.x, 0, DISHWASHER.frontZ + DW_DIM.zFront, Math.PI));
  const fridge = put("fridge", K.fridge({ seed: nextSeed() }), yawXf(FRIDGE.x, 0, FRIDGE.backZ + FRIDGE_DIM.zBack, Math.PI));
  put("rangeHood", K.rangeHood({ seed: nextSeed() }), yawXf(HOOD.x, HOOD.bottomY, HOOD.backZ - 0.25, Math.PI));

  // ------------------------------------------------------------------ north worktop
  const ctop = top(north, "top_w");
  if (Math.abs(ctop - COUNTER_Y) > 1e-6) throw new Error(`furnishKitchen: worktop at ${ctop}`);
  // microwave in the corner (its cord trails behind/right: keep it on the stone)
  put("microwave", buildMicrowave({ finish: "steel", seed: nextSeed() }), yawXf(4.48, ctop + REST_GAP, 8.52, Math.PI), north);
  put("wineBottle", K.wineBottle({ kind: "whiteWine", seed: nextSeed() }), yawXf(4.92, ctop + REST_GAP, 8.66, Math.PI), north);
  // dish rack over the dishwasher, left of the sink, with two plates and two mugs
  const rack = put("dishRack", K.dishRack({ seed: nextSeed() }), yawXf(5.43, ctop + REST_GAP, 8.47, Math.PI), north);
  {
    leanPlates(rack, DISH_RACK.gridY, DISH_RACK.tineZ);
    // two mugs upside down on the grid in front of the plates
    const flip = qaxisAngle(v3(1, 0, 0), Math.PI);
    for (const x of [-0.1, 0.08]) {
      const def = K.kitchenMug({ seed: nextSeed() });
      putIn(rack, "kitchenMug", def, { p: v3(x, DISH_RACK.gridY - minYRotated(def, flip) + REST_GAP, 0.08), q: flip });
    }
  }
  // knife block + knives, cutting board, oil bottle on the stone right of the sink
  const kb = put("knifeBlock", K.knifeBlock({ seed: nextSeed() }), yawXf(6.8, ctop + REST_GAP, 8.63, Math.PI), north);
  {
    const kinds = ["chef", "bread", "utility", "paring"] as const;
    const a = (-KNIFE_TILT * Math.PI) / 180;
    const tilt = qaxisAngle(v3(1, 0, 0), a);
    KNIFE_SLOTS.forEach((x, i) => {
      // knife frame: tip at the origin, blade up +Y. It hangs in its slot by the handle, which sits
      // 6 mm above the top of the block (the bolster rests on the block when it settles).
      const ax = KNIFE_SLOT_LEN - KNIFE_BLADE[kinds[i]] + 0.006;
      const p = v3(x, KNIFE_SLOT_FLOOR.y + Math.cos(-a) * ax, KNIFE_SLOT_FLOOR.z - 0.022 + Math.sin(a) * ax);
      putIn(kb, "knife", K.knife({ kind: kinds[i], seed: nextSeed() }), { p, q: tilt });
    });
  }
  put("cuttingBoard", K.cuttingBoard({ seed: nextSeed() }), yawXf(6.765, ctop + REST_GAP, 8.355, Math.PI / 2), north);
  put("oilBottle", K.oilBottle({ seed: nextSeed() }), yawXf(6.935, ctop + REST_GAP, 8.7, Math.PI), north);
  // right-hand worktop by the fridge: spice rack with jars, blender
  const rtop = top(north, "top_r");
  const spice = put("spiceRack", K.spiceRack({ seed: nextSeed() }), yawXf(8.015, rtop + REST_GAP, 8.72, Math.PI), north);
  const spices = [0xa4522a, 0x7d8a2e, 0xc8a13a, 0x5c2e1a];
  SPICE_SLOTS.xs.forEach((x, i) => putIn(spice, "spiceJar", K.spiceJar({ spice: spices[i], seed: nextSeed() }), onSurf(x, SPICE_SLOTS.y, SPICE_SLOTS.z)));
  put("blender", K.blender({ seed: nextSeed() }), yawXf(8.04, rtop + REST_GAP, 8.4, Math.PI), north);

  // ------------------------------------------------------------------ west worktop
  const wtop = top(west, "top");
  const wx = (b: number) => WEST.topBackX + b; // distance from the wall-side edge of the worktop
  const cm = put("coffeeMaker", K.coffeeMaker({ seed: nextSeed() }), yawXf(wx(0.134), wtop + REST_GAP, 7.85, Math.PI / 2), west);
  putIn(cm, "carafe", K.carafe({ seed: nextSeed() }), onSurf(0, localTop(cm, "warming_plate"), 0.07));
  put("kettle", K.kettle({ seed: nextSeed() }), yawXf(wx(0.24), wtop + REST_GAP, 7.36, Math.PI / 2), west);
  put("toaster", K.toaster({ seed: nextSeed() }), yawXf(wx(0.22), wtop + REST_GAP, 6.86, Math.PI / 2), west);
  put("paperTowelHolder", K.paperTowelHolder({ seed: nextSeed() }), yawXf(wx(0.15), wtop + REST_GAP, 6.5, 0), west);

  // ------------------------------------------------------------------ island
  const itop = top(island, "top");
  const fb = put("fruitBowl", K.fruitBowl({ seed: nextSeed() }), yawXf(6.45, itop + REST_GAP, 6.6, 0), island);
  for (const [kind, x, z] of [
    ["apple", -0.035, 0.0],
    ["lemon", 0.04, 0.0],
  ] as const)
    putIn(fb, "fruit", K.fruit({ kind, seed: nextSeed() }), onSurf(x, FRUIT_BOWL_FLOOR, z, 0));
  put("fruit", K.fruit({ kind: "orange", seed: nextSeed() }), yawXf(6.62, itop + REST_GAP, 6.5, 0), island);
  put("fruit", K.fruit({ kind: "banana", seed: nextSeed() }), yawXf(6.72, itop + REST_GAP, 6.66, 0.4), island);
  put("wineBottle", K.wineBottle({ seed: nextSeed() }), yawXf(7.3, itop + REST_GAP, 6.7, 0), island);
  put("wineBottle", K.wineBottle({ seed: nextSeed() }), yawXf(7.4, itop + REST_GAP, 6.6, 1.3), island);

  // ------------------------------------------------------------------ range top
  const rt = top(range, "cooktop");
  if (Math.abs(rt - RANGE_TOP_Y) > 1e-6) throw new Error(`furnishKitchen: cooktop at ${rt}`);
  {
    const [fx, fz] = RANGE_BURNERS[1]; // front-right burner (local), handle towards the hood centre
    putIn(range, "skillet", K.skillet({ seed: nextSeed() }), onSurf(fx, RANGE_TOP_Y, fz, 0));
    const [bx, bz] = RANGE_BURNERS[2]; // back-left burner, handle pointing over the range
    putIn(range, "saucepan", K.saucepan({ seed: nextSeed() }), onSurf(bx, RANGE_TOP_Y, bz, Math.PI));
  }

  // ------------------------------------------------------------------ wall cabinets
  {
    const u = uppers;
    const floor = (i: number) => localTop(i, "car_bottom");
    const shelf = (i: number) => localTop(i, "car_shelf0");
    // U2: dinner plates + side plates below, bowls on the shelf (stacks nest at the exact pitch)
    const stack = (type: "plate" | "sidePlate" | "bowl", n: number, x: number, y: number, z: number): void => {
      let pitch = 0;
      for (let k = 0; k < n; k++) {
        const def = K[type]({ seed: nextSeed() });
        if (k === 0) pitch = nestPitch(def);
        putIn(u.u2, type, def, onSurf(x, y + k * pitch, z));
      }
    };
    stack("plate", 5, -0.19, floor(u.u2), 0.0);
    stack("sidePlate", 4, 0.2, floor(u.u2), 0.0);
    stack("bowl", 3, -0.18, shelf(u.u2), -0.005);
    stack("bowl", 2, 0.18, shelf(u.u2), -0.005);
    // U3 (over the sink): tumblers below, wine glasses on the shelf
    for (const [x, z] of [
      [-0.27, -0.06],
      [-0.18, -0.06],
      [-0.27, 0.05],
      [-0.18, 0.05],
      [0.18, -0.06],
      [0.27, -0.06],
    ])
      putIn(u.u3, "tumbler", K.tumbler({ seed: nextSeed() }), onSurf(x, floor(u.u3), z));
    for (const x of [-0.24, -0.1, 0.1]) putIn(u.u3, "wineGlass", K.wineGlass({ seed: nextSeed() }), onSurf(x, shelf(u.u3), -0.03));
    // U4: mugs below (handles turned), two jars on the shelf
    const mugTints = [0xffffff, 0x2f4f6f, 0xc9483e, 0xe8c27a];
    [-0.24, -0.12, 0.05, 0.17].forEach((x, k) => putIn(u.u4, "kitchenMug", K.kitchenMug({ tint: mugTints[k], seed: nextSeed() }), onSurf(x, floor(u.u4), -0.02, -Math.PI / 2)));
    putIn(u.u4, "jar", K.jar({ seed: nextSeed() }), onSurf(-0.15, shelf(u.u4), -0.02));
    putIn(u.u4, "jar", K.jar({ tint: 0xd88a1e, seed: nextSeed() }), onSurf(0.12, shelf(u.u4), -0.02));
    // U1: cereal boxes below, canned goods on the shelf
    putIn(u.u1, "cerealBox", K.cerealBox({ seed: nextSeed() }), onSurf(-0.12, floor(u.u1), -0.06));
    putIn(u.u1, "cerealBox", K.cerealBox({ tint: 0xd8e4ff, seed: nextSeed() }), onSurf(0.11, floor(u.u1), -0.06));
    [-0.18, -0.09, 0.0, 0.09].forEach((x, k) => putIn(u.u1, "can", K.can({ tint: [0xffffff, 0xffd0c0, 0xd0ffd8, 0xfff0b0][k], seed: nextSeed() }), onSurf(x, shelf(u.u1), -0.02)));
    // U5: flour-ish tubs
    putIn(u.u5, "foodTub", K.foodTub({ w: 0.15, d: 0.11, h: 0.1, tint: 0xd04a3a, seed: nextSeed() }), onSurf(0, floor(u.u5), -0.02));
  }

  // ------------------------------------------------------------------ base cabinets
  {
    const [sx, sz] = nLocalXZ(4.96, 8.48);
    putIn(north, "stockPot", K.stockPot({ seed: nextSeed() }), onSurf(sx, localTop(north, "n1_car_bottom"), sz));
  }
  putIn(north, "cutleryTray", K.cutleryTray({ seed: nextSeed() }), onSurf(nLocalXZ(6.8, 8.4325)[0], localTop(north, "n3_drw0_bottom"), nLocalXZ(6.8, 8.4325)[1]));

  // ------------------------------------------------------------------ dishwasher contents
  {
    leanPlates(dw, DW_RACKS.lowerY, -0.07);
    const flip = qaxisAngle(v3(1, 0, 0), Math.PI);
    const bowl = K.bowl({ seed: nextSeed() });
    putIn(dw, "bowl", bowl, { p: v3(0.0, DW_RACKS.lowerY - minYRotated(bowl, flip) + REST_GAP, 0.1), q: flip });
    for (const x of [-0.17, -0.07]) {
      const t = K.tumbler({ seed: nextSeed() });
      putIn(dw, "tumbler", t, { p: v3(x, DW_RACKS.upperY - minYRotated(t, flip) + REST_GAP, -0.05), q: flip });
    }
    const m = K.kitchenMug({ seed: nextSeed() });
    putIn(dw, "kitchenMug", m, { p: v3(0.12, DW_RACKS.upperY - minYRotated(m, flip) + REST_GAP, -0.04), q: flip });
  }

  // ------------------------------------------------------------------ fridge contents
  {
    const sh = FRIDGE_DIM.shelves;
    putIn(fridge, "juiceBottle", K.juiceBottle({ seed: nextSeed() }), onSurf(-0.24, sh[0], -0.12));
    putIn(fridge, "foodTub", K.foodTub({ seed: nextSeed() }), onSurf(0.1, sh[0], -0.08));
    putIn(fridge, "jar", K.jar({ seed: nextSeed() }), onSurf(0.22, sh[1], 0.05));
    putIn(fridge, "foodTub", K.foodTub({ w: 0.2, d: 0.14, h: 0.09, tint: 0x3a8a4a, seed: nextSeed() }), onSurf(-0.12, sh[1], -0.06));
    putIn(fridge, "jar", K.jar({ tint: 0xb85a1e, seed: nextSeed() }), onSurf(-0.05, sh[2], -0.02));
    const crisper = localTop(fridge, "crisper0_bot");
    putIn(fridge, "fruit", K.fruit({ kind: "apple", seed: nextSeed() }), onSurf(-0.2, crisper, -0.05));
    putIn(fridge, "fruit", K.fruit({ kind: "lemon", seed: nextSeed() }), onSurf(0.18, crisper, 0.0));
    // door bins (door frame = fridge frame while the door is closed)
    const binZ = 0.2939;
    putIn(fridge, "milkCarton", K.milkCarton({ seed: nextSeed() }), onSurf(-0.2, localTop(fridge, "fr_bin0_bot"), binZ));
    for (const x of [-0.07, 0.01]) putIn(fridge, "beerBottle", K.beerBottle({ seed: nextSeed() }), onSurf(x, localTop(fridge, "fr_bin0_bot"), binZ, 0.6));
    putIn(fridge, "jar", K.jar({ tint: 0x6a1a2a, seed: nextSeed() }), onSurf(0.15, localTop(fridge, "fr_bin1_bot"), binZ));
    // freezer: a tub of leftovers on the wire shelf
    putIn(fridge, "foodTub", K.foodTub({ tint: 0xe8e8e8, seed: nextSeed() }), onSurf(0.15, localTop(fridge, "fz_shelf"), -0.1));
    // cereal on top of the fridge
    putIn(fridge, "cerealBox", K.cerealBox({ tint: 0xfff0c8, seed: nextSeed() }), onSurf(-0.15, FRIDGE_DIM.h, -0.05));
    putIn(fridge, "cerealBox", K.cerealBox({ w: 0.21, h: 0.3, tint: 0xffd8d8, seed: nextSeed() }), onSurf(0.12, FRIDGE_DIM.h, -0.05));
  }

  // ------------------------------------------------------------------ floor items, stools, clock
  put("pedalBin", K.pedalBin({ seed: nextSeed() }), yawXf(KF.x0 + 0.03 + 0.145, 0, 6.2, Math.PI / 2));
  put("recyclingBin", K.recyclingBin({ seed: nextSeed() }), yawXf(KF.x0 + 0.03 + 0.14, 0, 5.85, Math.PI / 2));
  for (const x of [6.08, 6.8, 7.52]) put("barStool", K.barStool({ seed: nextSeed() }), yawXf(x, 0, 5.98, 0));
  put("wallClock", K.wallClock({ seed: nextSeed() }), yawXf(KF.x1 - 0.015, 1.95, 6.9, -Math.PI / 2));

  return { placements, on };
}

/** World (x, z) → north-run local (x, z) (the run is rotated 180°). */
function nLocalXZ(wx: number, wz: number): [number, number] {
  return [NORTH_XF.p.x - wx, NORTH_XF.p.z - wz];
}

export function furnishKitchen(): Placement[] {
  return kitchenLayout().placements;
}
