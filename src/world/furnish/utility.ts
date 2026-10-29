// Placements for the bathroom, laundry, foyer and balcony (content-utility area). PURE MODULE.
//
// Yaw convention (checked in tests/unit/content-utility-place.test.ts): an object's front (+Z in
// its own frame) is turned by qeuler(0, yaw, 0) to (sin yaw, 0, cos yaw):
//   yaw 0 → faces +Z (north), π/2 → +X (east), π → −Z (south), −π/2 → −X (west).
// Under the same rotation the object's local +X goes to (cos yaw, 0, −sin yaw), so e.g. a
// fixture facing east (yaw π/2) has its local +X pointing south.
//
// Wall-mounted builders have their origin on the wall plane (y = 0 at the floor, +Z out of the
// wall); they are placed with the origin ON the finished face they are screwed to (the glazed
// tile face where tiled). Free-standing items keep ≥ 1.5 cm from finished faces. Loose items
// that sit on something are dropped onto the measured surface of their support (vertical rays
// through the support's actual parts), never onto guessed heights.
//
// Layout notes (see docs/briefs/content-utility.md):
//  * Bathroom: tub along the north wall (drain end and shower at the west wall), hinged glass
//    screen on the tub's front rim at the shower end, toilet on the west wall facing east, vanity
//    on the east wall centred on its plumbing stub-out (SERVICE_POINTS.vanity, north of the door
//    swing) with the mirror cabinet above the mirror outlet, accessories around.
//  * Laundry: washer + dryer side by side against the north wall (washer hoses to the washer
//    stub-out, dryer plugged into the dryer outlet), a two-tier wire shelf on the wall above
//    them carrying the supplies, the water heater on its stub-out on the west wall, ironing
//    board + mop bucket on the west wall, broom rail behind the door.
//  * Foyer: coat closet in the NE corner (the vacuum cleaner lives in it — the laundry has no
//    floor space left once the door swing and the heater are kept clear), electrical panel on
//    the east wall south of the closet, console + mirror + intercom west of the front door,
//    shoe rack / bench / umbrella stand along the west wall.
//  * Balcony: bistro set in front of the fixed slider panel, AC condenser against the facade
//    under the living-room window, three planters.

import { qeuler, qrot, v3, vadd, type Vec3, type Xform } from "../../geom/vec.ts";
import { polyClip, polyTransform, type ConvexPoly } from "../../geom/poly.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { RoomId } from "../plan.ts";
import { BALCONY_FLOOR_Y, CEILING_Y, SERVICE_POINTS, WALL_TILE_T, roomFaces } from "../structure/levels.ts";
import { ELECTRICAL } from "../structure/services.ts";
import type { Placement } from "./types.ts";

import { buildBathtub, BATHTUB } from "../../objects/bath/bathtub.ts";
import { buildShowerScreen, buildShowerSet, SHOWER_SCREEN } from "../../objects/bath/shower.ts";
import { buildToilet, TOILET } from "../../objects/bath/toilet.ts";
import { buildVanity, VANITY } from "../../objects/bath/vanity.ts";
import { buildMirrorCabinet, MIRROR_CABINET } from "../../objects/bath/mirrorCabinet.ts";
import {
  buildBathBin,
  buildBathMat,
  buildBathScale,
  buildExhaustFan,
  buildHairDryer,
  buildShampooBottle,
  buildSoapDispenser,
  buildToiletPaperHolder,
  buildToiletryBottle,
  buildToothbrushCup,
  buildTowelRack,
  buildTowelRing,
} from "../../objects/bath/accessories.ts";
import { buildDryer, buildWasher, LAUNDRY } from "../../objects/utility/laundry.ts";
import { buildWaterHeater, WATER_HEATER } from "../../objects/utility/waterHeater.ts";
import { buildWallWireShelf, WALL_WIRE_SHELF } from "../../objects/utility/shelving.ts";
import { buildBulbBox, buildDetergentJug, buildHammer, buildPaintCan, buildPliers, buildScrewdriver, buildStorageBox, buildToolbox, buildWrench } from "../../objects/utility/supplies.ts";
import { buildBroomHolder, buildIroningBoard, buildMopBucket, buildVacuumCleaner } from "../../objects/utility/cleaning.ts";
import { buildElectricalPanel } from "../../objects/utility/panel.ts";
import { buildCoatCloset, COAT_CLOSET } from "../../objects/utility/closet.ts";
import { buildConsoleTable, buildFoyerBench, buildFoyerMirror, buildIntercom, buildKeyBowl, buildKeyRing, buildPhotoFrame, buildShoe, buildShoeRack, buildUmbrellaStand, KEY_BOWL } from "../../objects/utility/foyer.ts";
import { buildAcCondenser, buildBistroTable, buildPatioChair, buildTerracottaPlant } from "../../objects/utility/balcony.ts";

export type MountKind = "floor" | "wall" | "ceiling" | "on";

/** A placement plus the facts the tests need. */
export interface UtilityItem extends Placement {
  /** Unique id within this area. */
  id: string;
  mount: MountKind;
  yaw: number;
  /** "on": the item it rests on / stands inside (its id). */
  on?: string;
  /**
   * Free-form tags: "inside" (contained in its support, e.g. tools in the toolbox),
   * "inside:<id>" (stands inside another item without resting on it, e.g. the vacuum in the
   * closet), "service:<id>" (connected to a plumbing stub-out), "outlet:<id>" (plugged in).
   */
  tags?: string[];
}

// =============================================================================================
// Geometry helpers
// =============================================================================================

/** Rotation about +Y by `yaw` radians (front +Z → (sin yaw, 0, cos yaw)). */
export function yawQ(yaw: number) {
  return qeuler(0, yaw, 0);
}

/** Yaw that turns an object's front (+Z) towards the horizontal direction (dx, dz). */
export function yawFacing(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

export function xfAt(x: number, y: number, z: number, yaw: number): Xform {
  return { p: v3(x, y, z), q: yawQ(yaw) };
}

/** Local point of a placed object → world. */
export function toWorld(xf: Xform, x: number, y: number, z: number): Vec3 {
  return vadd(qrot(xf.q, v3(x, y, z)), xf.p);
}

/** World → local point of an object placed with a pure yaw (inverse of toWorld). */
export function toLocal(xf: Xform, p: Vec3): Vec3 {
  const d = v3(p.x - xf.p.x, p.y - xf.p.y, p.z - xf.p.z);
  return qrot({ x: -xf.q.x, y: -xf.q.y, z: -xf.q.z, w: xf.q.w }, d);
}

const polyCache = new WeakMap<AssemblyDef, Map<string, ConvexPoly[]>>();
const xfKey = (xf: Xform) => `${xf.p.x},${xf.p.y},${xf.p.z},${xf.q.x},${xf.q.y},${xf.q.z},${xf.q.w}`;

/** World-space polyhedra of every part of a placed assembly (cached per def + transform). */
export function worldPolys(def: AssemblyDef, xf: Xform): ConvexPoly[] {
  let m = polyCache.get(def);
  if (!m) polyCache.set(def, (m = new Map()));
  const k = xfKey(xf);
  let polys = m.get(k);
  if (!polys) m.set(k, (polys = def.parts.map((p) => polyTransform(p.poly, xf))));
  return polys;
}

export interface Box3 {
  min: Vec3;
  max: Vec3;
}

/** World AABB of a placed assembly (optionally only the parts passing `filter`). */
export function worldAabb(def: AssemblyDef, xf: Xform, filter?: (partIndex: number) => boolean): Box3 {
  const min = v3(Infinity, Infinity, Infinity),
    max = v3(-Infinity, -Infinity, -Infinity);
  worldPolys(def, xf).forEach((p, i) => {
    if (filter && !filter(i)) return;
    for (const v of p.verts) {
      if (v.x < min.x) min.x = v.x;
      if (v.y < min.y) min.y = v.y;
      if (v.z < min.z) min.z = v.z;
      if (v.x > max.x) max.x = v.x;
      if (v.y > max.y) max.y = v.y;
      if (v.z > max.z) max.z = v.z;
    }
  });
  return { min, max };
}

/**
 * Highest top surface of the polyhedra crossed by the vertical line through (x, z), not above
 * `below` (so a shelf under another shelf can be found). −Infinity when the line misses them.
 */
export function surfaceTop(polys: readonly ConvexPoly[], x: number, z: number, below = Infinity): number {
  let best = -Infinity;
  for (const p of polys) {
    let lo = -Infinity,
      hi = Infinity;
    let miss = false;
    for (const f of p.faces) {
      const rhs = f.d - f.n.x * x - f.n.z * z;
      if (Math.abs(f.n.y) < 1e-9) {
        if (rhs < -1e-9) {
          miss = true;
          break;
        }
      } else if (f.n.y > 0) hi = Math.min(hi, rhs / f.n.y);
      else lo = Math.max(lo, rhs / f.n.y);
    }
    if (miss || hi < lo - 1e-9) continue;
    if (hi <= below + 1e-6 && hi > best) best = hi;
  }
  return best;
}

/** Bottom footprint of an assembly (local): AABB in x/z of the vertices within 3 mm of its lowest point. */
function baseFootprint(def: AssemblyDef): { x0: number; x1: number; z0: number; z1: number; y: number } {
  let y = Infinity;
  for (const p of def.parts) for (const v of p.poly.verts) y = Math.min(y, v.y);
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const p of def.parts)
    for (const v of p.poly.verts)
      if (v.y <= y + 0.003) {
        x0 = Math.min(x0, v.x);
        x1 = Math.max(x1, v.x);
        z0 = Math.min(z0, v.z);
        z1 = Math.max(z1, v.z);
      }
  // a round thing lying on its side touches along a line: give the footprint a minimum width
  const minW = 0.012;
  if (x1 - x0 < minW) [x0, x1] = [(x0 + x1) / 2 - minW / 2, (x0 + x1) / 2 + minW / 2];
  if (z1 - z0 < minW) [z0, z1] = [(z0 + z1) / 2 - minW / 2, (z0 + z1) / 2 + minW / 2];
  return { x0, x1, z0, z1, y };
}

/**
 * Height at which an assembly placed at plan (x, z) with `yaw` rests on `support`: the highest
 * point of the support's parts inside the item's base footprint (each part clipped exactly to
 * the footprint prism, shrunk by 2 mm), ignoring parts reaching above `below` (so an item can be
 * put on a lower shelf), minus the item's own lowest local y. Throws if nothing supports it.
 */
export function restHeight(def: AssemblyDef, x: number, z: number, yaw: number, support: UtilityItem, below = Infinity): number {
  const fp = baseFootprint(def);
  const xf = xfAt(x, 0, z, yaw);
  const e = 0.002;
  const ax = qrot(xf.q, v3(1, 0, 0)),
    az = qrot(xf.q, v3(0, 0, 1));
  const dot = (n: Vec3, p: Vec3) => n.x * p.x + n.y * p.y + n.z * p.z;
  const at = (lx: number, lz: number) => toWorld(xf, lx, 0, lz);
  const planes: Array<{ n: Vec3; d: number }> = [
    { n: ax, d: dot(ax, at(fp.x1 - e, 0)) },
    { n: v3(-ax.x, -ax.y, -ax.z), d: -dot(ax, at(fp.x0 + e, 0)) },
    { n: az, d: dot(az, at(0, fp.z1 - e)) },
    { n: v3(-az.x, -az.y, -az.z), d: -dot(az, at(0, fp.z0 + e)) },
  ];
  // plan AABB of the footprint for a cheap reject
  let fx0 = Infinity,
    fx1 = -Infinity,
    fz0 = Infinity,
    fz1 = -Infinity;
  for (const [lx, lz] of [
    [fp.x0, fp.z0],
    [fp.x1, fp.z0],
    [fp.x0, fp.z1],
    [fp.x1, fp.z1],
  ]) {
    const w = at(lx, lz);
    fx0 = Math.min(fx0, w.x);
    fx1 = Math.max(fx1, w.x);
    fz0 = Math.min(fz0, w.z);
    fz1 = Math.max(fz1, w.z);
  }
  let top = -Infinity;
  for (const poly of worldPolys(support.def, support.xf)) {
    let px0 = Infinity,
      px1 = -Infinity,
      pz0 = Infinity,
      pz1 = -Infinity,
      py0 = Infinity;
    for (const v of poly.verts) {
      px0 = Math.min(px0, v.x);
      px1 = Math.max(px1, v.x);
      pz0 = Math.min(pz0, v.z);
      pz1 = Math.max(pz1, v.z);
      py0 = Math.min(py0, v.y);
    }
    if (px1 < fx0 || px0 > fx1 || pz1 < fz0 || pz0 > fz1 || py0 > below) continue;
    let P: ConvexPoly | null = poly;
    for (const pl of planes) {
      P = polyClip(P, pl.n, pl.d, null);
      if (!P) break;
    }
    if (!P) continue;
    let y = -Infinity;
    for (const v of P.verts) y = Math.max(y, v.y);
    if (y <= below + 1e-6 && y > top) top = y;
  }
  if (!Number.isFinite(top)) throw new Error(`furnishUtility: nothing under ${def.type} on ${support.id} at (${x.toFixed(3)}, ${z.toFixed(3)})`);
  return top - fp.y;
}

// =============================================================================================
// Reference faces (finished wall faces, tile faces)
// =============================================================================================

const BATH = roomFaces("bath");
const UTIL = roomFaces("utility");
const FOYER = roomFaces("foyer");
/** Bathroom faces of the glazed wall tiles (wainscot on every wall, full height around the tub). */
const BATH_TILE = { x0: BATH.x0 + WALL_TILE_T, x1: BATH.x1 - WALL_TILE_T, z0: BATH.z0 + WALL_TILE_T, z1: BATH.z1 - WALL_TILE_T } as const;
/** Clearance of free-standing items from finished faces. */
const GAP = 0.015;

const SP = (id: "vanity" | "washer" | "waterHeater") => SERVICE_POINTS.find((s) => s.id === id)!;
const OUTLET = (id: string) => ELECTRICAL.find((e) => e.id === id)!;
/** Valve body geometry of the structure's stub-outs (see world/structure/partition.ts). */
const VALVE = { r: 0.011, z0: 0.005, z1: 0.045 } as const;
/** Drain stub-out: PVC Ø40 mm from 8 to 58 mm proud of the face. */
const DRAIN_STUB_END = 0.058;
/** Outlet plate + rocker proud of the wall face. */
const OUTLET_PROUD = 0.014;

// =============================================================================================
// Layout
// =============================================================================================

class Layout {
  readonly items: UtilityItem[] = [];
  private byId = new Map<string, UtilityItem>();

  add(id: string, type: string, def: AssemblyDef, room: RoomId, mount: MountKind, x: number, y: number, z: number, yaw: number, extra: { on?: string; tags?: string[] } = {}): UtilityItem {
    if (this.byId.has(id)) throw new Error(`furnishUtility: duplicate id ${id}`);
    const it: UtilityItem = { id, type, def: { ...def, room }, xf: xfAt(x, y, z, yaw), room, mount, yaw };
    if (extra.on) it.on = extra.on;
    if (extra.tags?.length) it.tags = extra.tags.slice();
    this.items.push(it);
    this.byId.set(id, it);
    return it;
  }

  get(id: string): UtilityItem {
    const it = this.byId.get(id);
    if (!it) throw new Error(`furnishUtility: unknown item ${id}`);
    return it;
  }

  /** Loose item resting on `supportId` at plan (x, z) (surface measured, optionally below `below`). */
  on(id: string, type: string, def: AssemblyDef, supportId: string, x: number, z: number, yaw: number, o: { below?: number; tags?: string[] } = {}): UtilityItem {
    const sup = this.get(supportId);
    const y = restHeight(def, x, z, yaw, sup, o.below);
    return this.add(id, type, def, sup.room, "on", x, y, z, yaw, { on: supportId, tags: o.tags });
  }

  /** Same as on(), with (lx, lz) given in the support's local frame and the item's yaw relative to it. */
  onLocal(id: string, type: string, def: AssemblyDef, supportId: string, lx: number, lz: number, relYaw: number, o: { below?: number; tags?: string[] } = {}): UtilityItem {
    const sup = this.get(supportId);
    const w = toWorld(sup.xf, lx, 0, lz);
    return this.on(id, type, def, supportId, w.x, w.z, sup.yaw + relYaw, o);
  }
}

// ------------------------------------------------------------------------------------ bathroom

/**
 * Inward swing limit (degrees) for the bath screen hinged at plan (hx, hz) with its panel running
 * east (+X) and swinging north (+Z) into the tub: the largest whole angle at which the panel's
 * inner side (glass + clamp plates + inner knob, ≤ 3 cm from the hinge line) still keeps 1 cm
 * from every part of the shower set within the glass height and from the back-wall tile face,
 * less a 2° margin. So the joint limit stops the glass, not the chrome mixer.
 */
export function screenInwardLimit(set: UtilityItem, hx: number, hz: number, y0: number, wallZ: number): number {
  const reach = 0.03 + 0.01;
  const w = SHOWER_SCREEN.w + 0.035; // panel + gap to the channel, measured from the hinge axis
  const yTop = y0 + SHOWER_SCREEN.seal + SHOWER_SCREEN.h;
  const pts: Array<[number, number]> = [];
  for (const poly of worldPolys(set.def, set.xf))
    for (const v of poly.verts) if (v.y > y0 && v.y < yTop) pts.push([v.x - hx, v.z - hz]);
  const clear = (deg: number): boolean => {
    const a = (deg * Math.PI) / 180;
    const ux = Math.cos(a),
      uz = Math.sin(a);
    // free edge vs the back wall (its inner corner reaches furthest north)
    if (hz + w * uz + reach * ux > wallZ) return false;
    for (const [dx, dz] of pts) {
      const s = dx * ux + dz * uz; // along the panel
      const n = -dx * uz + dz * ux; // north of the panel line
      if (s > -reach && s < w + reach && n > -reach && n < reach) return false;
    }
    return true;
  };
  let deg = 0;
  while (deg < 60 && clear(deg + 1)) deg++;
  return Math.max(0, deg - 2);
}

function bathroom(L: Layout): void {
  const room: RoomId = "bath";
  // ---- bathtub along the north wall, drain end (+X local) at the west wall: yaw π
  const tubX0 = BATH_TILE.x0 + GAP;
  const tubZ1 = BATH_TILE.z1 - GAP;
  const tubC = { x: tubX0 + BATHTUB.length / 2, z: tubZ1 - BATHTUB.width / 2 };
  L.add("bathtub", "bathtub", buildBathtub({ seed: 11, room }), room, "floor", tubC.x, 0, tubC.z, Math.PI);

  // ---- shower mixer set on the west wall above the drain end (tile face), facing east
  const showerZ = tubC.z;
  L.add("showerSet", "showerSet", buildShowerSet({ seed: 12, room }), room, "wall", BATH_TILE.x0, 0, showerZ, Math.PI / 2, { tags: ["water"] });

  // ---- hinged glass screen on the tub's front rim at the shower end: channel on the west wall,
  //      panel running east along the rim; local +X (opening side) → south, out of the tub.
  const rimFrontZ = tubC.z - BATHTUB.width / 2 + BATHTUB.rimFront / 2;
  const inward = screenInwardLimit(L.get("showerSet"), BATH_TILE.x0 + SHOWER_SCREEN.profileD, rimFrontZ, BATHTUB.rimY, BATH_TILE.z1);
  L.add("showerScreen", "showerScreen", buildShowerScreen({ seed: 13, room, inward }), room, "wall", BATH_TILE.x0, BATHTUB.rimY, rimFrontZ, Math.PI / 2, { on: "bathtub" });

  // ---- toilet against the west wall at z ≈ 7.0, facing east; its supply valve sits on the wall
  //      plane (local z = TOILET.wallZ, 1.5 cm behind the overhanging tank lid)
  const toiletZ = 7.0;
  const toiletX = BATH_TILE.x0 - TOILET.wallZ;
  L.add("toilet", "toilet", buildToilet({ seed: 14, room }), room, "floor", toiletX, 0, toiletZ, Math.PI / 2);

  // ---- vanity on the east wall, centred on its stub-out (cold at the smaller z = local −x)
  const sv = SP("vanity");
  // facing west (yaw −π/2) world x = x0 − local z; the vanity's wall plane is local z = −d/2 − gap
  const vanityX = sv.face + (-VANITY.d / 2 - VANITY.wallGap);
  const vanity = L.add(
    "vanity",
    "bathVanity",
    buildVanity({ seed: 15, room, valveX: [-0.1, 0.1], valveY: sv.valveY, drainY: sv.drainY ?? 0.45 }),
    room,
    "floor",
    vanityX,
    0,
    sv.along,
    -Math.PI / 2,
    { tags: ["service:vanity"] },
  );

  // ---- mirror cabinet above it, on the drywall above the wainscot, bottom clear above the
  //      shaver/mirror outlet (o_bath_mirror at y 1.4 under the cabinet)
  const mo = OUTLET("o_bath_mirror");
  const mirrorBottom = Math.max(MIRROR_CABINET.bottomY, mo.y + 0.115 / 2 + 0.015);
  const mirrorFace = BATH.x1; // drywall face (tiles stop at 1.25 m)
  const mc = L.add("mirrorCabinet", "mirrorCabinet", buildMirrorCabinet({ seed: 16, room, bottomY: mirrorBottom }), room, "wall", mirrorFace, 0, sv.along, -Math.PI / 2);
  // toiletries inside: two on the cabinet floor, one on the first glass shelf
  const shelfZ = (MIRROR_CABINET.innerZ[0] + MIRROR_CABINET.innerZ[1]) / 2;
  const inMc = (k: number, lx: number, shelf: number, kind: "pills" | "perfume" | "cream") => {
    const below = mirrorBottom + MIRROR_CABINET.shelfTops[shelf] + 0.002;
    L.onLocal(`toiletry${k}`, "toiletryBottle", buildToiletryBottle({ seed: 170 + k, room, kind }), mc.id, lx, shelfZ, 0, { below, tags: ["inside"] });
  };
  inMc(0, -0.17, 0, "pills");
  inMc(1, -0.05, 0, "perfume");
  inMc(2, 0.12, 1, "cream");

  // ---- on the vanity's side decks: toothbrush cup (south side) and soap dispenser (north side)
  L.onLocal("toothbrushCup", "toothbrushCup", buildToothbrushCup({ seed: 18, room }), vanity.id, -0.315, 0.0, 0);
  L.onLocal("soapDispenser", "soapDispenser", buildSoapDispenser({ seed: 19, room }), vanity.id, 0.315, 0.0, 0);
  // hair dryer stored inside the vanity cabinet, on its bottom panel beside the trap
  L.onLocal("hairDryer", "hairDryer", buildHairDryer({ seed: 20, room }), vanity.id, 0.32, 0.0, Math.PI / 2, { below: 0.3, tags: ["inside"] });

  // ---- towel ring with a hand towel on the east wall south of the vanity (wainscot tiles)
  L.add("towelRing", "towelRing", buildTowelRing({ seed: 21, room }), room, "wall", BATH_TILE.x1, 0, 6.8, -Math.PI / 2);
  // ---- bath towel rack on the east wall beside the tub's open end
  L.add("towelRack", "towelRack", buildTowelRack({ seed: 22, room }), room, "wall", BATH_TILE.x1, 0, 8.42, -Math.PI / 2);
  // ---- toilet paper holder on the west wall beside the cistern (roll towards the south)
  L.add("toiletPaperHolder", "toiletPaperHolder", buildToiletPaperHolder({ seed: 23, room }), room, "wall", BATH_TILE.x0, 0, toiletZ - 0.31, Math.PI / 2);
  // ---- pedal bin under it
  L.add("bathBin", "bathBin", buildBathBin({ seed: 24, room }), room, "floor", BATH_TILE.x0 + GAP + 0.13, 0, toiletZ - 0.58, Math.PI / 2);
  // ---- bath scale against the south wall west of the door (outside the swing)
  L.add("bathScale", "bathScale", buildBathScale({ seed: 25, room }), room, "floor", 0.9, 0, BATH_TILE.z0 + GAP + 0.15 + 0.01, 0);
  // ---- bath mat in front of the tub
  L.add("bathMat", "bathMat", buildBathMat({ seed: 26, room }), room, "floor", tubC.x + 0.05, 0, tubC.z - BATHTUB.width / 2 - 0.03 - 0.25, 0);
  // ---- shampoo + shower gel on the back rim near the shower end (labels to the room)
  const rimBackZ = tubZ1 - BATHTUB.rimBack / 2;
  L.on("shampoo0", "shampooBottle", buildShampooBottle({ seed: 27, room, kind: "shampoo" }), "bathtub", tubX0 + 0.3, rimBackZ, Math.PI);
  L.on("shampoo1", "shampooBottle", buildShampooBottle({ seed: 28, room, kind: "gel" }), "bathtub", tubX0 + 0.42, rimBackZ, Math.PI);
  // ---- extractor fan in the ceiling above the tub
  L.add("exhaustFan", "exhaustFan", buildExhaustFan({ seed: 29, room }), room, "ceiling", tubC.x, CEILING_Y, tubC.z, 0);
}

// ------------------------------------------------------------------------------------- laundry

function laundry(L: Layout): void {
  const room: RoomId = "utility";
  const halfW = LAUNDRY.w / 2 + 0.004; // bbox half width incl. side seams/door
  // machine footprint behind the back panel: hoses/cord need ~13.5 cm (bbox back at −0.435)
  const backReach = 0.435;
  const zM = UTIL.z1 - GAP - backReach;
  const xWasher = UTIL.x0 + GAP + halfW;
  const xDryer = xWasher + 2 * halfW + 0.02;

  // ---- washer: cold hose up into the underside of the washer stub-out's cold valve, drain hose
  //      straight into the drain stub-out (arrives along −X world = +X local for yaw π)
  const sw = SP("washer");
  const wxf = xfAt(xWasher, 0, zM, Math.PI);
  const inlet = toLocal(wxf, v3(sw.face + (VALVE.z0 + VALVE.z1) / 2, sw.valveY - VALVE.r - 0.009 - 0.0005, sw.along - 0.1));
  const drain = toLocal(wxf, v3(sw.face + DRAIN_STUB_END + 0.002, sw.drainY ?? 0.95, sw.along));
  L.add("washer", "washer", buildWasher({ seed: 31, room, hoses: { inlet: [inlet.x, inlet.y, inlet.z], drain: [drain.x, drain.y, drain.z], drainDir: [1, 0, 0] } }), room, "floor", xWasher, 0, zM, Math.PI, {
    tags: ["service:washer"],
  });

  // ---- dryer: plug pushed into the dryer outlet on the east wall (top of the plug given)
  const od = OUTLET("o_utility_dryer");
  const dxf = xfAt(xDryer, 0, zM, Math.PI);
  // the 40 mm plug body is centred on the outlet (its top 20 mm above the outlet centre)
  const plugTop = toLocal(dxf, v3(UTIL.x1 - OUTLET_PROUD - 0.02, od.y + 0.04, od.at!));
  L.add("dryer", "dryer", buildDryer({ seed: 32, room, plug: [plugTop.x, plugTop.y + 0.0, plugTop.z] }), room, "floor", xDryer, 0, zM, Math.PI, { tags: ["outlet:o_utility_dryer"] });

  // ---- two-tier wire shelf on the north wall above the machines
  const shelfX = (UTIL.x0 + UTIL.x1) / 2;
  const shelf = L.add("wallShelf", "wallWireShelf", buildWallWireShelf({ seed: 33, room }), room, "wall", shelfX, 0, UTIL.z1, Math.PI);
  const [tLo, tHi] = WALL_WIRE_SHELF.tops;
  const zs = WALL_WIRE_SHELF.d / 2 + 0.01; // item centres, local z out of the wall
  // lower tier: detergent + softener, two paint cans (local x runs west→east reversed: yaw π)
  const lower = { below: tLo + 0.002 };
  L.onLocal("detergent0", "detergentJug", buildDetergentJug({ seed: 34, room, kind: "detergent" }), shelf.id, 0.42, zs, 0, lower);
  L.onLocal("detergent1", "detergentJug", buildDetergentJug({ seed: 35, room, kind: "softener" }), shelf.id, 0.21, zs, 0, lower);
  L.onLocal("paintCan0", "paintCan", buildPaintCan({ seed: 36, room, color: 0xd9d2c0 }), shelf.id, -0.02, zs, 0, lower);
  L.onLocal("paintCan1", "paintCan", buildPaintCan({ seed: 37, room, color: 0x6f8fa8 }), shelf.id, -0.24, zs, 0.6, lower);
  // upper tier: toolbox (with the tools inside), light bulbs, pliers
  const upper = { below: tHi + 0.002 };
  const tb = L.onLocal("toolbox", "toolbox", buildToolbox({ seed: 38, room }), shelf.id, 0.26, zs, 0, upper);
  L.onLocal("bulbBox", "bulbBox", buildBulbBox({ seed: 39, room }), shelf.id, -0.12, zs, 0, upper);
  // pliers lie across the deck wires (they would rock lying along one)
  L.onLocal("pliers", "pliers", buildPliers({ seed: 40, room }), shelf.id, -0.42, zs, Math.PI / 2, upper);
  // tools lying on the toolbox tray floor (below the lid)
  const inTray = { below: 0.05 + tb.xf.p.y, tags: ["inside"] };
  L.onLocal("hammer", "hammer", buildHammer({ seed: 41, room }), tb.id, 0, -0.02, 0, inTray);
  L.onLocal("screwdriver", "screwdriver", buildScrewdriver({ seed: 42, room }), tb.id, -0.115, 0.07, 0, inTray);
  L.onLocal("wrench", "wrench", buildWrench({ seed: 43, room }), tb.id, 0.115, 0.07, 0, inTray);

  // ---- water heater on its stub-out (west wall), access covers to the room: yaw π/2.
  //      Local x → world −z: cold (local +0.1) lands on the cold valve at along − 0.1.
  const sh = SP("waterHeater");
  const hx = sh.face + WATER_HEATER.r + WATER_HEATER.wallGap;
  const hxf = xfAt(hx, 0, sh.along, Math.PI / 2);
  const pipeY = sh.valveY + VALVE.r + 0.0075 + 0.0005; // OD 15 mm pipe resting on the valve body
  const cold = toLocal(hxf, v3(sh.face + (VALVE.z0 + VALVE.z1) / 2, pipeY, sh.along - 0.1));
  const hot = toLocal(hxf, v3(sh.face + (VALVE.z0 + VALVE.z1) / 2, pipeY, sh.along + 0.1));
  L.add(
    "waterHeater",
    "waterHeater",
    buildWaterHeater({ seed: 44, room, supply: { cold: [cold.x, cold.y, cold.z], hot: [hot.x, hot.y, hot.z] } }),
    room,
    "floor",
    hx,
    0,
    sh.along,
    Math.PI / 2,
    { tags: ["service:waterHeater"] },
  );

  // ---- ironing board on the west wall between the door corner and the heater; mop bucket below
  //      the heater's relief pipe; broom rail on the east wall behind the open door
  L.add("ironingBoard", "ironingBoard", buildIroningBoard({ seed: 45, room }), room, "wall", UTIL.x0, 0, 5.92, Math.PI / 2);
  L.add("mopBucket", "mopBucket", buildMopBucket({ seed: 46, room }), room, "floor", UTIL.x0 + GAP + 0.166, 0, 6.45, Math.PI / 2);
  L.add("broomHolder", "broomHolder", buildBroomHolder({ seed: 47, room }), room, "wall", UTIL.x1, 0, 6.0, -Math.PI / 2);
}

// --------------------------------------------------------------------------------------- foyer

function foyer(L: Layout): void {
  const room: RoomId = "foyer";
  // ---- coat closet in the NE corner, doors south, its −X side screwed to the east wall
  const cw = COAT_CLOSET.w;
  const closetX = FOYER.x1 - GAP - cw / 2;
  const closetZ = FOYER.z1 - GAP - 0.34; // bbox back at local z −0.34
  const closet = L.add("coatCloset", "coatCloset", buildCoatCloset({ seed: 51, room, coats: 2, sideWall: "l" }), room, "floor", closetX, 0, closetZ, Math.PI);
  // storage boxes on its shelf, the vacuum cleaner on its floor at the coat-free (+X local) end
  const shelfBelow = COAT_CLOSET.shelfTop + 0.002;
  L.onLocal("closetBox0", "storageBox", buildStorageBox({ seed: 52, room }), closet.id, -0.27, -0.165, 0, { below: shelfBelow, tags: ["inside"] });
  L.onLocal("closetBox1", "storageBox", buildStorageBox({ seed: 53, room, w: 0.36, h: 0.22 }), closet.id, 0.22, -0.165, 0, { below: shelfBelow, tags: ["inside"] });
  const vac = toWorld(closet.xf, 0.36, 0, -0.03);
  L.add("vacuum", "vacuumCleaner", buildVacuumCleaner({ seed: 54, room }), room, "floor", vac.x, 0, vac.z, Math.PI, { tags: [`inside:${closet.id}`] });

  // ---- electrical panel on the east wall south of the closet
  L.add("electricalPanel", "electricalPanel", buildElectricalPanel({ seed: 55, room }), room, "wall", FOYER.x1, 0, 7.6, -Math.PI / 2, { tags: ["power"] });

  // ---- console table against the north wall west of the front door, mirror above, intercom
  //      between the mirror and the light switch beside the door
  const consoleX = 9.7;
  const consoleZ = FOYER.z1 - GAP - 0.165; // bbox back at local z −0.165
  const cons = L.add("consoleTable", "consoleTable", buildConsoleTable({ seed: 56, room }), room, "floor", consoleX, 0, consoleZ, Math.PI);
  L.add("foyerMirror", "foyerMirror", buildFoyerMirror({ seed: 57, room }), room, "wall", consoleX, 0, FOYER.z1, Math.PI);
  const sw = OUTLET("sw_foyer");
  L.add("intercom", "intercom", buildIntercom({ seed: 58, room }), room, "wall", sw.at! - 0.035 - 0.015 - 0.07, 0, FOYER.z1, Math.PI);
  // key bowl (with the keys in it) and a photo frame on the console top
  const bowl = L.onLocal("keyBowl", "keyBowl", buildKeyBowl({ seed: 59, room }), cons.id, -0.2, 0.0, 0);
  L.add("keys", "keyRing", buildKeyRing({ seed: 60, room }), room, "on", bowl.xf.p.x, bowl.xf.p.y + KEY_BOWL.floorY, bowl.xf.p.z, Math.PI * 0.8, { on: bowl.id, tags: ["inside"] });
  L.onLocal("photoFrame", "photoFrame", buildPhotoFrame({ seed: 61, room }), cons.id, 0.25, 0.02, 0.25);

  // ---- along the west wall (facing east): shoe rack with two pairs, bench, umbrella stand
  const wx = FOYER.x0 + GAP;
  const rack = L.add("shoeRack", "shoeRack", buildShoeRack({ seed: 62, room }), room, "floor", wx + 0.15, 0, 6.35, Math.PI / 2);
  const shoes: Array<[string, "sneaker" | "leather" | "runner", "left" | "right", number, number, number]> = [
    ["shoe0", "sneaker", "left", -0.25, 0.25, 0xe9e9e4],
    ["shoe1", "sneaker", "right", -0.14, 0.25, 0xe9e9e4],
    ["shoe2", "leather", "left", 0.13, 0.06, 0x5a3a22],
    ["shoe3", "leather", "right", 0.24, 0.06, 0x5a3a22],
  ];
  shoes.forEach(([id, kind, side, lx, tier, tint], k) => {
    L.onLocal(id, "shoe", buildShoe({ seed: 63 + k, room, kind, side, tint }), rack.id, lx, 0.0, 0, { below: tier + 0.002 });
  });
  // bench: back 2 cm clear of the outlet plate behind it (o_foyer_west at y 0.3)
  L.add("foyerBench", "foyerBench", buildFoyerBench({ seed: 67, room }), room, "floor", FOYER.x0 + OUTLET_PROUD + 0.02 + 0.175, 0, 7.35, Math.PI / 2);
  L.add("umbrellaStand", "umbrellaStand", buildUmbrellaStand({ seed: 68, room }), room, "floor", wx + 0.115, 0, 8.06, Math.PI / 2);
}

// ------------------------------------------------------------------------------------- balcony

function balcony(L: Layout): void {
  const room: RoomId = "balcony";
  const y0 = BALCONY_FLOOR_Y;
  const wallZ = -0.2; // exterior face of the south wall
  // ---- AC condenser against the facade under the living-room window, line set into the wall
  //      on its east side (local −X → world +X for yaw π)
  L.add("acCondenser", "acCondenser", buildAcCondenser({ seed: 71, room }), room, "floor", 8.3, y0, wallZ - 0.17, Math.PI, { tags: ["lineSet"] });
  // ---- bistro set in front of the fixed (west) slider panel
  L.add("bistroTable", "bistroTable", buildBistroTable({ seed: 72, room }), room, "floor", 5.05, y0, -1.18, 0);
  L.add("patioChair0", "patioChair", buildPatioChair({ seed: 73, room }), room, "floor", 5.05, y0, -0.57, Math.PI);
  L.add("patioChair1", "patioChair", buildPatioChair({ seed: 74, room }), room, "floor", 5.65, y0, -1.18, -Math.PI / 2);
  // ---- planters: shrub in the SE corner, snake plant beside the AC, herbs in the SW corner
  L.add("planterShrub", "terracottaPlant", buildTerracottaPlant({ seed: 75, room, plant: "bush" }), room, "floor", 8.7, y0, -1.3, 0.4);
  L.add("planterSnake", "terracottaPlant", buildTerracottaPlant({ seed: 76, room, plant: "snake" }), room, "floor", 7.62, y0, -0.43, 0);
  L.add("planterHerb", "terracottaPlant", buildTerracottaPlant({ seed: 77, room, plant: "herb" }), room, "floor", 4.62, y0, -1.37, 0);
}

// =============================================================================================
// Entry points
// =============================================================================================

/** Every placement of the area with the metadata the tests use. Deterministic. */
export function furnishUtilityItems(): UtilityItem[] {
  const L = new Layout();
  bathroom(L);
  laundry(L);
  foyer(L);
  balcony(L);
  return L.items;
}

export function furnishUtility(): Placement[] {
  return furnishUtilityItems().map(({ type, def, xf, room }) => ({ type, def, xf, room }));
}

/** Reference faces used by the layout (bathroom glazed-tile faces) and the free-standing clearance. */
export const UTILITY_LAYOUT = { BATH_TILE, GAP } as const;
