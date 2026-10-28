// Placements of the apartment-wide fixtures & electrics: a ceiling light per plan light
// position (style per room), the living-room ceiling fan, window coverings for every window,
// smoke detectors, thermostat, baseboard heaters, mini-split, door chime, wall clock, door
// stops, robe hooks and a full-length mirror. PURE MODULE (no Babylon).
//
// Yaw convention (verified in tests/unit/content-fixtures-place.test.ts): an object's front
// (+Z in its own frame) is turned by qeuler(0, yaw, 0) to (sin yaw, 0, cos yaw), so
//   yaw 0 → faces +Z (north), π/2 → +X (east), π → −Z (south), −π/2 → −X (west).
// `yawFacing(dx, dz)` returns the yaw for a desired facing direction.

import { qeuler, v3, type Xform } from "../../geom/vec.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { CEILING_H, ROOMS, WALLS, roomAt, roomById, type Opening, type RoomId, type Wall } from "../plan.ts";
import { FRONT_JAMB_T, JAMB_T, PARTITION_FACE, SHIM } from "../structure/levels.ts";
import {
  buildBaseboardHeater,
  buildBatten,
  buildCeilingFan,
  buildCurtains,
  buildDoorChime,
  buildDoorStop,
  buildFlushMount,
  buildFullLengthMirror,
  buildMiniSplit,
  buildPendant,
  buildRobeHooks,
  buildSchoolhouse,
  buildSmokeDetector,
  buildThermostat,
  buildTrackLight,
  buildVenetianBlind,
  buildWallClock,
} from "../../objects/fixtures/index.ts";
import type { Placement } from "./types.ts";

export type MountKind = "ceiling" | "wall" | "floor";

/** A placement plus the facts the tests need (mount surface, facing). */
export interface FixtureItem extends Placement {
  mount: MountKind;
  yaw: number;
  /** Opening this item serves (window coverings, door stops). */
  opening?: string;
}

/** Yaw that turns an object's front (+Z) towards the horizontal direction (dx, dz). */
export function yawFacing(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

function xfOf(x: number, y: number, z: number, yaw: number): Xform {
  return { p: v3(x, y, z), q: qeuler(0, yaw, 0) };
}

/** World x-range (walls along x) or z-range (walls along z) of an opening. */
export function openingSpan(w: Wall, o: Opening): { along: "x" | "z"; lo: number; hi: number; line: number } {
  const alongX = Math.abs(w.b[1] - w.a[1]) < 1e-6;
  const dir = alongX ? Math.sign(w.b[0] - w.a[0]) : Math.sign(w.b[1] - w.a[1]);
  const start = alongX ? w.a[0] : w.a[1];
  const p0 = start + dir * o.from,
    p1 = start + dir * o.to;
  return { along: alongX ? "x" : "z", lo: Math.min(p0, p1), hi: Math.max(p0, p1), line: alongX ? w.a[1] : w.a[0] };
}

function findOpening(id: string): { wall: Wall; op: Opening } {
  for (const wall of WALLS) for (const op of wall.openings) if (op.id === id) return { wall, op };
  throw new Error(`furnishFixtures: unknown opening ${id}`);
}

/** Finished wall face on the room side of a wall (concrete faces lie on the plan boundary). */
function roomFace(wall: Wall, roomSign: 1 | -1): number {
  const line = Math.abs(wall.b[1] - wall.a[1]) < 1e-6 ? wall.a[1] : wall.a[0];
  return line + roomSign * wall.thickness / 2;
}

// --------------------------------------------------------------------------- layout constants

/** Ceiling light style per room (plan light positions; the living room gets the fan). */
const CEILING_STYLE: Partial<Record<RoomId, "flush" | "pendant" | "track" | "schoolhouse" | "batten">> = {
  master: "pendant",
  bed2: "schoolhouse",
  hallW: "flush",
  bath: "flush",
  utility: "batten",
  kitchen: "track",
  foyer: "flush",
};

/** Window coverings: blinds in the bedrooms, curtains in the living room. */
const BLIND_WINDOWS = ["win_master", "win_bed2_s", "win_bed2_e"];
/** Blind head (top of brackets) above the window head, and hem clearance above the sill. */
const BLIND_ABOVE_HEAD = 0.12;
const BLIND_ABOVE_SILL = 0.07;
/** Curtain rod centre height. */
export const CURTAIN_ROD_Y = 2.42;

export const SMOKE_DETECTORS: ReadonlyArray<{ room: RoomId; x: number; z: number }> = [
  { room: "hallW", x: 0.9, z: 5.0 },
  { room: "master", x: 3.0, z: 3.6 },
  { room: "bed2", x: 10.2, z: 3.6 },
  { room: "kitchen", x: 8.6, z: 5.6 },
];

// --------------------------------------------------------------------------- builders

function ceilingLights(out: FixtureItem[]): void {
  for (const room of ROOMS) {
    if (room.outdoor) continue;
    room.lights.forEach(([x, z], k) => {
      if (room.id === "living") {
        out.push({ type: "ceilingFan", def: buildCeilingFan({ seed: 7101 }), xf: xfOf(x, CEILING_H, z, 0), room: room.id, mount: "ceiling", yaw: 0 });
        return;
      }
      const style = CEILING_STYLE[room.id] ?? "flush";
      const seed = 7200 + ROOMS.indexOf(room) * 10 + k;
      let type: string, def: AssemblyDef;
      switch (style) {
        case "pendant":
          [type, def] = ["pendantLight", buildPendant({ seed })];
          break;
        case "track":
          [type, def] = ["trackLight", buildTrackLight({ seed })];
          break;
        case "schoolhouse":
          [type, def] = ["schoolhouseLight", buildSchoolhouse({ seed })];
          break;
        case "batten":
          [type, def] = ["battenLight", buildBatten({ seed })];
          break;
        default:
          [type, def] = ["flushMountLight", buildFlushMount({ seed })];
      }
      // track bars run north–south (local Z) so the end heads aim at the counter and the peninsula
      out.push({ type, def, xf: xfOf(x, CEILING_H, z, 0), room: room.id, mount: "ceiling", yaw: 0 });
    });
  }
}

function windowCoverings(out: FixtureItem[]): void {
  for (const id of BLIND_WINDOWS) {
    const { wall, op } = findOpening(id);
    const s = openingSpan(wall, op);
    const mid = (s.lo + s.hi) / 2;
    const width = s.hi - s.lo + 0.1;
    const top = op.head + BLIND_ABOVE_HEAD;
    const drop = top - (op.sill + BLIND_ABOVE_SILL);
    // exterior walls: the room lies on the interior side of the plan boundary
    let x: number, z: number, nx: number, nz: number;
    if (s.along === "x") {
      nz = wall.a[1] < 1 ? 1 : -1;
      nx = 0;
      z = roomFace(wall, nz as 1 | -1);
      x = mid;
    } else {
      nx = wall.a[0] > 6 ? -1 : 1;
      nz = 0;
      x = roomFace(wall, nx as 1 | -1);
      z = mid;
    }
    const yaw = yawFacing(nx, nz);
    const room = roomAt(x + nx * 0.3, z + nz * 0.3)!.id;
    out.push({ type: "venetianBlind", def: buildVenetianBlind({ w: width, drop, seed: 7300 + out.length }), xf: xfOf(x, top, z, yaw), room, mount: "wall", yaw, opening: id });
  }
  // living room: slider (two 5-strip panels drawn to the sides) and window (two 3-strip panels)
  const slider = openingSpan(findOpening("slider_living").wall, findOpening("slider_living").op);
  const win = openingSpan(findOpening("win_living").wall, findOpening("win_living").op);
  const sets: Array<{ id: string; x0: number; x1: number; strips: number }> = [
    { id: "slider_living", x0: slider.lo - 0.15, x1: slider.hi + 0.15, strips: 5 },
    { id: "win_living", x0: win.lo - 0.1, x1: win.hi + 0.15, strips: 3 },
  ];
  for (const st of sets) {
    const L = st.x1 - st.x0;
    const cx = (st.x0 + st.x1) / 2;
    const brk = L > 2 ? [-L / 2 + 0.05, 0, L / 2 - 0.05] : [-L / 2 + 0.05, L / 2 - 0.05];
    const first = L / 2 - 0.05 - 0.06; // first ring 6 cm inside the end bracket
    const def = buildCurtains({
      rodLen: L,
      brackets: brk,
      panels: [
        { x0: -first, dir: 1, strips: st.strips },
        { x0: first, dir: -1, strips: st.strips },
      ],
      rodHeight: CURTAIN_ROD_Y,
      seed: 7400 + out.length,
    });
    out.push({ type: "curtains", def, xf: xfOf(cx, CURTAIN_ROD_Y, 0, 0), room: "living", mount: "wall", yaw: 0, opening: st.id });
  }
}

function heaters(out: FixtureItem[]): void {
  for (const id of BLIND_WINDOWS) {
    const { wall, op } = findOpening(id);
    const s = openingSpan(wall, op);
    const mid = (s.lo + s.hi) / 2;
    const len = Math.min(1.5, s.hi - s.lo - 0.4);
    const def = buildBaseboardHeater({ len, seed: 7500 + out.length });
    if (s.along === "x") out.push({ type: "baseboardHeater", def, xf: xfOf(mid, 0, 0, 0), room: roomAt(mid, 0.5)!.id, mount: "floor", yaw: 0, opening: id });
    else out.push({ type: "baseboardHeater", def, xf: xfOf(12.8, 0, mid, yawFacing(-1, 0)), room: roomAt(12.3, mid)!.id, mount: "floor", yaw: yawFacing(-1, 0), opening: id });
  }
}

function electrics(out: FixtureItem[]): void {
  SMOKE_DETECTORS.forEach((d, k) => out.push({ type: "smokeDetector", def: buildSmokeDetector({ seed: 7600 + k }), xf: xfOf(d.x, CEILING_H, d.z, 0), room: d.room, mount: "ceiling", yaw: 0 }));
  // thermostat: hall south wall (partition z = 4.4, hall side), 1.5 m up
  out.push({ type: "thermostat", def: buildThermostat({ seed: 7610 }), xf: xfOf(1.3, 1.5, 4.4 + PARTITION_FACE, 0), room: "hallW", mount: "wall", yaw: 0 });
  // mini-split: high on the living room east wall (partition x = 9.2), facing west
  out.push({ type: "miniSplitAC", def: buildMiniSplit({ seed: 7620 }), xf: xfOf(9.2 - PARTITION_FACE, 2.24, 2.2, yawFacing(-1, 0)), room: "living", mount: "wall", yaw: yawFacing(-1, 0) });
  // door chime: foyer west wall near the front door, above head height
  out.push({ type: "doorChime", def: buildDoorChime({ seed: 7630 }), xf: xfOf(9.2 + PARTITION_FACE, 2.05, 7.9, yawFacing(1, 0)), room: "foyer", mount: "wall", yaw: yawFacing(1, 0) });
  // wall clock: end wall of the west hall (concrete, x = 0), facing east down the hall
  out.push({ type: "wallClock", def: buildWallClock({ seed: 7640 }), xf: xfOf(0, 1.95, 5.0, yawFacing(1, 0)), room: "hallW", mount: "wall", yaw: yawFacing(1, 0) });
}

/** Floor dome stop just past the 90° position of every hinged door's free edge. */
function doorStops(out: FixtureItem[]): void {
  for (const wall of WALLS) {
    for (const op of wall.openings) {
      if ((op.kind !== "door" && op.kind !== "frontDoor") || !op.into || !op.hinge) continue;
      const s = openingSpan(wall, op);
      if (s.along !== "x") throw new Error(`furnishFixtures: door ${op.id} on a wall along z is not supported`);
      const jamb = op.kind === "frontDoor" ? FRONT_JAMB_T : JAMB_T;
      const aEnd = Math.sign(wall.b[0] - wall.a[0]) >= 0 ? s.lo : s.hi; // the opening end nearer endpoint a
      const hingeEnd = op.hinge === "a" ? aEnd : aEnd === s.lo ? s.hi : s.lo;
      const toHinge = Math.sign(hingeEnd - (s.lo + s.hi) / 2);
      const xh = hingeEnd - toHinge * (SHIM + jamb); // hinge axis (jamb face)
      const leaf = s.hi - s.lo - 2 * (SHIM + jamb);
      const into = roomById(op.into);
      const sz = (into.z0 + into.z1) / 2 > s.line ? 1 : -1;
      const face = roomFace(wall, sz as 1 | -1);
      const x = xh + toHinge * 0.03; // dome edge ~8 mm past the leaf plane at 90°
      const z = face + sz * (leaf - 0.07);
      out.push({ type: "doorStop", def: buildDoorStop({ seed: 7700 + out.length }), xf: xfOf(x, 0, z, 0), room: op.into, mount: "floor", yaw: 0, opening: op.id });
    }
  }
}

function hardware(out: FixtureItem[]): void {
  // robe hooks in the bathroom, on the south wall west of the door, above the wainscot tiles
  out.push({ type: "robeHooks", def: buildRobeHooks({ seed: 7800 }), xf: xfOf(0.65, 1.7, 5.6 + PARTITION_FACE, 0), room: "bath", mount: "wall", yaw: 0 });
  // full-length mirror: master bedroom north wall, west of the door (bottom 0.3 m above the floor)
  out.push({ type: "fullLengthMirror", def: buildFullLengthMirror({ seed: 7810 }), xf: xfOf(1.9, 0.3, 4.4 - PARTITION_FACE, yawFacing(0, -1)), room: "master", mount: "wall", yaw: yawFacing(0, -1) });
}

/** Every fixture placement with its mount kind (used by the tests). Deterministic. */
export function fixtureLayout(): FixtureItem[] {
  const out: FixtureItem[] = [];
  ceilingLights(out);
  windowCoverings(out);
  heaters(out);
  electrics(out);
  doorStops(out);
  hardware(out);
  for (const it of out) it.def = { ...it.def, room: it.room };
  return out;
}

export function furnishFixtures(): Placement[] {
  return fixtureLayout().map(({ type, def, xf, room }) => ({ type, def, xf, room }));
}
