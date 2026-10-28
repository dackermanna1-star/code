// Cleaning gear for the laundry room: mop standing in its bucket, a broom clipped into a wall
// rail, an upright vacuum cleaner and a folded ironing board hanging on two wall hooks.
//
// Frames: mopBucket / vacuumCleaner stand on the floor (origin at the base centre, front +Z).
// broomHolder / ironingBoard are wall-mounted: origin on the wall plane at floor level, +Z out
// of the wall, X along it.

import { hingeAxis } from "../lib/kit.ts";
import { boxR, bondOverlapping, bondTouching, finish, mk, panelBox, tubeKgPerM, CHROME, type BaseOpts } from "./helpers.ts";
import type { V3 } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

/** Plastic mop bucket (wire bail) with a cotton-strand mop standing in it. ~1.6 kg. */
export function buildMopBucket(o: BaseOpts & { tint?: number } = {}): AssemblyDef {
  const b = mk("mopBucket", "Mop & Bucket", "misc", 25, o);
  const tint = o.tint ?? 0x2f6fc0;
  const h = 0.27;
  const bucket = b.lathe("bucket", "plastic", "plastic_glossy", "plastic", {
    profile: [
      [0.125, 0],
      [0.152, h],
    ],
    thickness: 0.0035,
    segments: 8,
    capBottom: true,
    tint,
  });
  const base = bucket.reduce((best, p) => (b.get(p).poly.verts.every((v) => v.y < 0.006) ? p : best), bucket[0]);
  // bail: ears on the rim and a steel wire handle lying back over the rim
  const earY = h - 0.03;
  const rEar = 0.125 + (0.027 * earY) / h;
  const ears: string[] = [];
  for (const sx of [-1, 1]) {
    const ear = boxR(b, `ear_${sx < 0 ? "l" : "r"}`, "plastic", "plastic", sx < 0 ? [-rEar - 0.012, -rEar + 0.002] : [rEar - 0.002, rEar + 0.012], [earY - 0.015, earY + 0.015], [-0.012, 0.012], { tint, mass: 0.01 });
    bondOverlapping(b, ear, bucket, "fused", 30);
    ears.push(ear);
  }
  const R = rEar + 0.012 + 0.0022;
  const bail: V3[] = [[-R, earY, 0]];
  for (let k = 0; k <= 6; k++) {
    const a = (Math.PI * k) / 6;
    bail.push([-R * Math.cos(a), earY + 0.02, -R * Math.sin(a) * 0.98]);
  }
  bail.push([R, earY, 0]);
  const wire = b.tube("bail", "steel", "metal_raw", bail, 0.0022, { sides: 5, kgPerM: 0.12, jointStrength: 40, tess: 0 });
  b.clip(wire[0], ears[0], 15);
  b.clip(wire[wire.length - 1], ears[1], 15);
  // mop: cotton strand head on the bucket floor, aluminium handle standing up (slight lean)
  const head = b.pillow("mop_head", "fabric", "fabric_cotton", [0.2, 0.09, 0.2], 0.6, [0, 0.0035 + 0.045, 0], { tint: 0xe9e3d3, mass: 0.35 });
  b.friction(head, base, 3);
  const clamp = b.cyl("mop_clamp", "plastic", "plastic", 0.03, 0.04, [0, 0.0035 + 0.09 + 0.02, 0], { segments: 8, tint: 0x2a2a2a, mass: 0.05 });
  b.glue(clamp, head, 25);
  const lean = 4;
  const L = 1.2;
  const y0 = 0.0035 + 0.09 + 0.04;
  const c = (L / 2) * Math.cos((lean * Math.PI) / 180);
  const handle = b.cyl("mop_handle", "aluminum", "aluminum", 0.011, L, [0, y0 + c, -(L / 2) * Math.sin((lean * Math.PI) / 180)], {
    segments: 8,
    rot: [-lean, 0, 0],
    mass: tubeKgPerM(0.022, 0.0009, 2700) * L,
    tess: 0,
  });
  b.press(handle, clamp, 30);
  return finish(b, o);
}

export interface BroomHolderOpts extends BaseOpts {
  /** Height of the rail above the floor. */
  y?: number;
}

/** Aluminium wall rail with two spring grips; a push broom hangs in one of them. ~1.3 kg. */
export function buildBroomHolder(o: BroomHolderOpts = {}): AssemblyDef {
  const b = mk("broomHolder", "Broom & Holder", "misc", 20, o);
  const y = o.y ?? 1.25;
  const rail = boxR(b, "rail", "aluminum", "aluminum", [-0.2, 0.2], [y - 0.015, y + 0.015], [0, 0.018], { tess: 0, mass: 0.12 });
  b.world(rail, "screw", 60, [0, y, 0]);
  const r = 0.012; // broom handle radius
  const zc = 0.018 + 0.017;
  const jaws: string[] = [];
  for (const [k, xc] of [
    ["a", -0.09],
    ["b", 0.09],
  ] as Array<[string, number]>) {
    for (const s of [-1, 1]) {
      const j = boxR(b, `grip_${k}${s < 0 ? "l" : "r"}`, "plastic", "plastic", s < 0 ? [xc - r - 0.008, xc - r] : [xc + r, xc + r + 0.008], [y - 0.02, y + 0.02], [0.018, 0.018 + 0.034], { tint: 0x2a2a2a, mass: 0.008 });
      b.screw(j, rail, 1, 20);
      jaws.push(j);
    }
  }
  // the broom: wooden handle in grip "a", head hanging 4 cm above the floor
  const L = 1.25;
  const headY0 = 0.04;
  const handleY0 = headY0 + 0.06;
  const handle = b.cyl("broom_handle", "softwood", "wood_pine", r, L, [-0.09, handleY0 + L / 2, zc], { segments: 8, tint: 0xd9b98a });
  b.clip(handle, jaws[0], 8);
  b.clip(handle, jaws[1], 8);
  const block = boxR(b, "broom_block", "plastic", "plastic", [-0.09 - 0.15, -0.09 + 0.15], [headY0 + 0.03, handleY0], [zc - 0.025, zc + 0.025], { tint: 0xc0392b, mass: 0.18 });
  b.screw(handle, block, 1, 40);
  const bristles = boxR(b, "broom_bristles", "plastic", "carpet", [-0.09 - 0.145, -0.09 + 0.145], [headY0, headY0 + 0.03], [zc - 0.022, zc + 0.022], { tint: 0x3a3a3a, mass: 0.12 });
  b.glue(bristles, block, 40);
  return finish(b, o);
}

/** Upright vacuum cleaner: floor head with wheels, reclining body (hinge + upright lock), motor, clear bin, handle, wrapped cord. ~5.5 kg. */
export function buildVacuumCleaner(o: BaseOpts & { tint?: number } = {}): AssemblyDef {
  const b = mk("vacuumCleaner", "Upright Vacuum", "appliance", 160, o);
  const tint = o.tint ?? 0x7b2fa8;
  const dark = 0x2a2a2c;
  // floor head: hollow hood (open underneath) on two rear wheels and two front rollers, brush roll inside
  const hood = panelBox(b, "head", { w: 0.3, h: 0.063, d: 0.21, t: 0.004, mat: "plastic", surf: "plastic_glossy", tint, faces: { top: true, bottom: false }, bond: "fused", strength: 40, kg: 1.0 }, [0, 0.012, 0.055]);
  const head = hood.top!;
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? hood.left! : hood.right!;
    const wheel = b.cyl(`wheel_${sx < 0 ? "l" : "r"}`, "rubber", "rubber", 0.05, 0.025, [sx * (0.15 + 0.0125 + 0.001), 0.05, -0.05], { axis: "x", segments: 12, tint: dark, mass: 0.08 });
    b.clip(wheel, side, 25); // on the axle through the head's rear corners
    const roller = b.cyl(`roller_${sx < 0 ? "l" : "r"}`, "plastic", "plastic", 0.012, 0.03, [sx * 0.1305, 0.012, 0.13], { axis: "x", segments: 8, tint: dark, mass: 0.01 });
    b.clip(roller, side, 6);
  }
  const brush = b.cyl("brushroll", "plastic", "carpet", 0.022, 0.27, [0, 0.034, 0.07], { axis: "x", segments: 8, tint: 0x3a3a3a, mass: 0.12 });
  b.clip(brush, hood.left!, 5);
  b.clip(brush, hood.right!, 5);
  // body: motor housing (panels) with the motor inside, clear dust bin, filter cap
  const yB = 0.09;
  const housing = panelBox(b, "housing", { w: 0.22, h: 0.2, d: 0.17, t: 0.003, mat: "plastic", surf: "plastic_glossy", tint, faces: { top: true }, bond: "fused", strength: 40 }, [0, yB, -0.06]);
  const motor = b.cyl("motor", "copper", "copper", 0.05, 0.09, [0, yB + 0.003 + 0.045, -0.06], { segments: 10, mass: 1.3 });
  b.screw(motor, housing.bottom!, 2, 30);
  b.sparks(motor, 0.6);
  const binY0 = yB + 0.2;
  const bin = b.cyl("dust_bin", "acrylic", "glass", 0.075, 0.24, [0, binY0 + 0.12, -0.06], { segments: 12, mass: 0.35, capSurf: "plastic" });
  b.clip(bin, housing.top!, 12);
  const cap = b.cyl("bin_cap", "plastic", "plastic_glossy", 0.078, 0.03, [0, binY0 + 0.24 + 0.015, -0.06], { segments: 12, tint: dark, mass: 0.08 });
  b.clip(cap, bin, 8);
  // handle: steel tube up from the cap, grip at the top, cord hooks + wrapped cord on the back
  const tubeTop = 1.05;
  const tube = b.cyl("handle_tube", "steel", "metal_painted", 0.016, tubeTop - (binY0 + 0.27), [0, (binY0 + 0.27 + tubeTop) / 2, -0.06], { segments: 8, tint: dark, mass: 0.35, tess: 0 });
  b.press(tube, cap, 50);
  const grip = boxR(b, "handle_grip", "plastic", "plastic_glossy", [-0.02, 0.02], [tubeTop, tubeTop + 0.03], [-0.13, 0.02], { tint, mass: 0.08 });
  b.fuse(grip, tube, 60);
  const hooks: string[] = [];
  for (const [k, y] of [
    ["lo", 0.62],
    ["hi", 0.92],
  ] as Array<[string, number]>) {
    hooks.push(boxR(b, `cord_hook_${k}`, "plastic", "plastic", [-0.012, 0.012], [y - 0.01, y + 0.01], [-0.076 - 0.04, -0.076], { tint: dark, mass: 0.01 }));
    b.fuse(hooks[hooks.length - 1], tube, 20);
  }
  const coil = boxR(b, "cord_coil", "rubber", "rubber", [-0.03, 0.03], [0.6, 0.94], [-0.116 - 0.03, -0.116], { tint: 0x1b1b1b, mass: 0.45 });
  b.friction(coil, hooks[0], 4);
  b.friction(coil, hooks[1], 4);
  // the body reclines on its pivot; an upright lock holds it until knocked
  const ax = hingeAxis([0, 1, 0], [0, 0, 1]);
  b.hinge(housing.bottom!, head, { pivots: [[-0.1, yB, -0.06], [0.1, yB, -0.06]], axis: [ax.x, ax.y, ax.z], min: 0, max: 60, strength: 60, friction: 0.2, latch: 6 });
  void CHROME;
  return finish(b, o);
}

export interface IroningBoardOpts extends BaseOpts {
  /** Height of the hook arms above the floor. */
  hookY?: number;
}

/** Folded ironing board hanging on two wall hooks: steel deck, padded cover, folded tube legs. ~5 kg. */
export function buildIroningBoard(o: IroningBoardOpts = {}): AssemblyDef {
  const b = mk("ironingBoard", "Ironing Board", "misc", 45, o);
  const hookY = o.hookY ?? 1.3;
  const L = 1.22,
    W = 0.38;
  const bottom = hookY - 1.05; // the board's tail end (hangs nose up)
  // hooks: steel arms out of the wall with an up-turned tip
  const hooks: string[] = [];
  for (const sx of [-1, 1]) {
    // short arms cradling the leg bar; the up-turned tip sits between the bar and the deck
    const arm = boxR(b, `hook_${sx < 0 ? "l" : "r"}`, "steel", "metal_painted", [sx * 0.12 - 0.008, sx * 0.12 + 0.008], [hookY - 0.012, hookY], [0, 0.046], { tint: 0x2a2a2a, tess: 0, mass: 0.05 });
    const tip = boxR(b, `hook_${sx < 0 ? "l" : "r"}_tip`, "steel", "metal_painted", [sx * 0.12 - 0.008, sx * 0.12 + 0.008], [hookY, hookY + 0.03], [0.0385, 0.046], { tint: 0x2a2a2a, tess: 0, mass: 0.01 });
    b.weld(tip, arm, 60);
    b.world(arm, "screw", 40, [sx * 0.12, hookY - 0.006, 0]);
    hooks.push(arm);
  }
  // folded leg frames lie flat against the deck's underside (between the deck and the wall)
  const zLeg = 0.025;
  const yBar = hookY + 0.0125 + 0.0005; // frame A's crossbar rests on the hook arms
  const legR = 0.0125;
  const legKg = tubeKgPerM(0.025, 0.001, 7850);
  const legs: string[] = [];
  for (const [k, xs, yTop] of [
    ["a", 0.15, yBar - 0.0125],
    ["b", 0.11, bottom + 0.95],
  ] as Array<[string, number, number]>) {
    const y0 = bottom + 0.05;
    for (const sx of [-1, 1]) legs.push(b.cyl(`leg_${k}${sx < 0 ? "l" : "r"}`, "steel", "metal_painted", legR, yTop - y0, [sx * xs, (y0 + yTop) / 2, k === "a" ? zLeg : zLeg - 0.0 + 0.0], { segments: 8, tint: 0x9aa0a4, mass: legKg * (yTop - y0), tess: 0 }));
  }
  // the bars: frame A's crossbar rests on the hooks; feet bars with plastic caps at the tail
  const bar = b.cyl("leg_a_bar", "steel", "metal_painted", legR, 0.3 + 2 * legR, [0, yBar, zLeg], { axis: "x", segments: 8, tint: 0x9aa0a4, mass: legKg * 0.3, tess: 0 });
  b.weld(bar, legs[0], 80);
  b.weld(bar, legs[1], 80);
  const footA = b.cyl("leg_a_foot", "plastic", "plastic", legR + 0.002, 0.3 - 2 * legR, [0, bottom + 0.05 - legR - 0.002, zLeg], { axis: "x", segments: 8, tint: 0x2a2a2a, mass: 0.12 });
  b.weld(footA, legs[0], 60);
  b.weld(footA, legs[1], 60);
  const footB = b.cyl("leg_b_foot", "plastic", "plastic", legR + 0.002, 0.22 - 2 * legR, [0, bottom + 0.11, zLeg], { axis: "x", segments: 8, tint: 0x2a2a2a, mass: 0.1 });
  b.weld(footB, legs[2], 60);
  b.weld(footB, legs[3], 60);
  for (const h of hooks) b.friction(bar, h, 6);
  // deck: perforated steel with the classic nose (pointing up), padded cotton cover on top
  const zDeck = zLeg + legR + 0.011; // pivot brackets hold the deck 11 mm off the folded legs
  const nose = 0.36;
  const outline: Array<[number, number]> = [
    [-W / 2, 0],
    [W / 2, 0],
    [W / 2, L - nose],
    [W * 0.32, L - nose * 0.35],
    [0.05, L],
    [-0.05, L],
    [-W * 0.32, L - nose * 0.35],
    [-W / 2, L - nose],
  ];
  const deckPts: V3[] = [];
  const coverPts: V3[] = [];
  for (const [x, yy] of outline) {
    deckPts.push([x, bottom + yy, zDeck]);
    deckPts.push([x, bottom + yy, zDeck + 0.0012]);
    coverPts.push([x * 1.01, bottom + yy, zDeck + 0.0012]);
    coverPts.push([x * 1.01, bottom + yy, zDeck + 0.0112]);
  }
  const deck = b.hull("deck", "steelSheet", "vent_grille", deckPts, [0, 0, 0], { tint: 0xc9ccce, mass: 1.6, tess: 0.06 });
  const cover = b.hull("cover", "fabric", "fabric_cotton", coverPts, [0, 0, 0], { tint: 0x8fb4d0, mass: 0.35 });
  b.glue(cover, deck, 25);
  for (const l of legs) b.screw(l, deck, 1, 30); // through the pivot brackets
  return finish(b, o);
}
