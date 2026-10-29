// Lamps.
//  * buildTableLamp: glazed ceramic ginger-jar base (hollow lathe shell, shatters), brass neck
//    cap, threaded steel rod, harp saddle, brass socket with an A19 bulb (`light`), steel harp,
//    empire fabric shade on a wire spider with a finial. The bulb pops and the light dies when it
//    breaks; the shade tears, the base shatters into glazed shards.
//  * buildDeskLamp: articulated task lamp — weighted steel base, swivel turret, two steel arm
//    pairs on friction hinges (shoulder, elbow, head), spun-steel shade (lathe tiles) with an
//    E14 bulb (`light`, spot) — every joint is a real hinge, so it flops when knocked.
// Local frames: origin at the centre of the base underside; desk lamp reaches towards +Z.
// PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import { hingeAxis, lightBulb } from "../lib/kit.ts";
import type { Builder } from "../lib/builder.ts";
import { boxR, finish, mk, PAL, type BaseOpts } from "./common.ts";

// ------------------------------------------------------------------ table lamp

export interface TableLampOpts extends BaseOpts {
  /** Glaze colour of the ceramic base. */
  tint?: number;
  shadeTint?: number;
  on?: boolean;
}

export const TABLE_LAMP_H = 0.49;

export function buildTableLamp(o: TableLampOpts = {}): AssemblyDef {
  const b = mk("bedsideLamp", "Bedside Lamp", "decor", 85, o);
  const glaze = o.tint ?? 0x5d7f8f;
  // ---- hollow ceramic base (glazed outside, bisque inside), closed bottom
  const base = b.lathe("base", "ceramic", "ceramic_glaze", "ceramic_bisque", {
    profile: [
      [0.05, 0],
      [0.078, 0.085],
      [0.032, 0.2],
    ],
    thickness: 0.008,
    segments: 7,
    capBottom: true,
    tint: glaze,
    innerTint: 0xe8e0d0,
  });
  // ---- brass neck cap on the rim, threaded rod, harp saddle, socket
  // pressed brass parts are thin shells: mass overrides
  const cap = b.cyl("neck_cap", "copper", "copper", 0.034, 0.012, [0, 0.206, 0], { segments: 12, tint: PAL.brass, mass: 0.12 });
  let rimBonds = 0;
  for (const tile of base) {
    const c = b.contact(cap, tile, 0.002);
    if (!c) continue;
    b.bond(cap, tile, "glue", { strength: 5 });
    rimBonds++;
  }
  if (!rimBonds) b.warn("tableLamp: neck cap does not touch the base rim");
  const rod = b.cyl("rod", "steel", "steel_brushed", 0.005, 0.06, [0, 0.242, 0], { segments: 8 });
  b.screw(rod, cap, 1, 30);
  const saddle = boxR(b, "saddle", "steel", "steel_brushed", [-0.062, 0.062], [0.272, 0.28], [-0.007, 0.007], { tess: 0 });
  b.screw(saddle, rod, 1, 25);
  const socket = b.cyl("socket", "copper", "copper", 0.017, 0.04, [0, 0.3, 0], { segments: 12, tint: PAL.brass, mass: 0.08 });
  b.screw(socket, saddle, 1, 20);
  lightBulb(b, "bulb", { kind: "a19", socket: false, fixedTo: socket, color: 0xffc98f, intensity: 0.8, range: 4, on: o.on ?? true }, [0, 0.32, 0]);
  // ---- harp: its feet stand in the saddle's sleeves (end faces on the saddle top), clipped
  const harp = b.tube(
    "harp",
    "steel",
    "steel_brushed",
    [
      [-0.06, 0.28 + 0.0003, 0],
      [-0.06, 0.465, 0],
      [0.06, 0.465, 0],
      [0.06, 0.28 + 0.0003, 0],
    ],
    0.003,
    { sides: 6, joint: "weld", jointStrength: 40, tess: 0 },
  );
  b.clip(harp[0], saddle, 15);
  b.clip(harp[harp.length - 1], saddle, 15);
  // ---- empire shade (fabric tiles over a wire frame) on a spider bar + finial
  const shade = b.lathe("shade", "fabric", "fabric_cotton", "fabric_cotton", {
    profile: [
      [0.155, 0.27],
      [0.115, 0.47],
    ],
    thickness: 0.0025,
    segments: 8,
    tint: o.shadeTint ?? 0xf1e9d8,
    seam: "fused",
    seamStrength: 12,
    mass: 0.16,
  });
  const spider = boxR(b, "spider", "steel", "steel_brushed", [-0.003, 0.003], [0.468, 0.472], [-0.111, 0.111], { tess: 0 });
  b.friction(spider, harp[1], 6);
  let spiderBonds = 0;
  for (const tile of shade) {
    const c = b.contact(spider, tile, 0.004);
    if (!c) continue;
    b.bond(spider, tile, "glue", { strength: 3 });
    spiderBonds++;
  }
  if (!spiderBonds) b.warn("tableLamp: shade spider does not reach the shade");
  const finial = b.cyl("finial", "copper", "copper", 0.012, 0.018, [0, 0.481, 0], { segments: 10, tint: PAL.brass });
  b.screw(finial, spider, 1, 10);
  return finish(b, o);
}

// ------------------------------------------------------------------ desk lamp

export interface DeskLampOpts extends BaseOpts {
  tint?: number;
  on?: boolean;
}

/** E14 candle bulb (glass envelope + aluminium base) with a SPOT light along local +Y. */
function spotBulb(b: Builder, name: string, socketPart: string, pos: [number, number, number], o: { on: boolean; intensity: number; range: number; angle: number }): string {
  const [px, py, pz] = pos;
  const baseH = 0.02,
    baseR = 0.007,
    R = 0.016,
    stretch = 1.7;
  const base = b.cyl(`${name}_base`, "aluminum", "aluminum", baseR, baseH, [px, py + baseH / 2, pz], { segments: 10 });
  const yc = py + baseH + R * stretch;
  const pts: Array<[number, number, number]> = [];
  for (let k = 0; k < 8; k++) {
    const a = (2 * Math.PI * k) / 8;
    pts.push([px + baseR * 0.92 * Math.cos(a), py + baseH, pz + baseR * 0.92 * Math.sin(a)]);
  }
  for (let ring = 0; ring < 5; ring++) {
    const phi = -Math.PI / 2 + 0.4 + ((Math.PI - 0.4) * ring) / 5;
    const rr = R * Math.cos(phi),
      yy = yc + R * stretch * Math.sin(phi);
    for (let k = 0; k < 8; k++) {
      const a = (2 * Math.PI * (k + 0.5 * (ring % 2))) / 8;
      pts.push([px + rr * Math.cos(a), yy, pz + rr * Math.sin(a)]);
    }
  }
  pts.push([px, yc + R * stretch, pz]);
  const glass = b.hull(`${name}_glass`, "glass", o.on ? "bulb_on" : "bulb_off", pts, [0, 0, 0], { smooth: 1, mass: 0.014 });
  b.glue(glass, base, 5);
  b.screw(base, socketPart, 1, 10);
  b.light({ part: glass, pos: [px, yc, pz], kind: "spot", dir: [0, 1, 0], angle: o.angle, color: 0xfff0d8, intensity: o.intensity, range: o.range, on: o.on });
  return glass;
}

/**
 * Articulated desk lamp. Built pose: lower arm leaning 10° back, upper arm reaching forward 25°
 * below horizontal, shade aimed 30° forward of straight down; the centre of mass stays over the
 * cast-iron base. Pure friction hinges hold the pose (no return springs: a spring whose rest angle
 * differs from the gravity equilibrium keeps torquing forever, so the lamp never sleeps and walks
 * the desk it stands on). The turret swivel is stiff too, so it does not wander.
 */
export function buildDeskLamp(o: DeskLampOpts = {}): AssemblyDef {
  const b = mk("deskLamp", "Desk Lamp", "electronics", 60, o);
  const tint = o.tint ?? 0x2b2d31;
  const S = "metal_painted" as const;
  // ---- weighted base: rubber ring, cast-iron disc, pressed steel cover
  const ring = b.cyl("base_ring", "rubber", "rubber", 0.085, 0.004, [0, 0.002, 0], { segments: 14 });
  const weight = b.cyl("base_weight", "castIron", "cast_iron", 0.078, 0.012, [0, 0.004 + 0.006, 0], { segments: 14 });
  const cover = b.cyl("base_cover", "steelSheet", S, 0.088, 0.005, [0, 0.016 + 0.0025, 0], { segments: 16, rTop: 0.082, tint, tess: 0, mass: 0.25 });
  b.glue(ring, weight, 10);
  b.screw(cover, weight, 3, 25);
  // ---- swivel turret (free vertical hinge with friction) + shoulder knuckle
  const yT0 = 0.021;
  const turret = b.cyl("turret", "steel", S, 0.016, 0.03, [0, yT0 + 0.015, 0], { segments: 10, tint });
  // two bearing points on the turret axis (a single pivot would be a ball joint)
  b.hinge(turret, cover, { pivots: [[0, yT0, 0], [0, yT0 + 0.025, 0]], axis: [0, 1, 0], min: -180, max: 180, friction: 2.5, strength: 60 });
  const yS = yT0 + 0.03 + 0.012; // shoulder pivot height
  const knuckle = boxR(b, "shoulder", "steel", S, [-0.016, 0.016], [yS - 0.012, yS + 0.012], [-0.012, 0.012], { tint });
  b.weld(knuckle, turret, 80);
  const fwd = hingeAxis([0, 1, 0], [0, 0, 1]); // positive angle tips the arms forward

  // ---- lower arm: two flat bars + spreader
  // lower arm leans BACK and the upper arm reaches forward, keeping the centre of mass over the
  // base (like a balanced task lamp); the shade ends up ~0.33 m in front of the turret
  const L1 = 0.36,
    L2 = 0.38;
  const lean = -10;
  const a1 = (lean * Math.PI) / 180;
  const elbow: [number, number, number] = [0, yS + L1 * Math.cos(a1), L1 * Math.sin(a1)];
  const mid1: [number, number, number] = [0, (yS + elbow[1]) / 2, elbow[2] / 2];
  // the lower pair straddles the shoulder knuckle (bars at x ±0.016..0.020); the upper pair nests
  // INSIDE it at the elbow (x ±0.012..0.016) so the two pairs pass each other face to face
  const X1 = 0.018,
    X2 = 0.014;
  const arm1 = [-1, 1].map((sx) => b.box(sx < 0 ? "arm1_l" : "arm1_r", "steel", S, [0.004, L1, 0.012], [sx * X1, mid1[1], mid1[2]], { rot: [lean, 0, 0], tint, tess: 0 }));
  const sp1 = b.box("arm1_spreader", "steel", S, [2 * X1 - 0.004, 0.02, 0.012], mid1, { rot: [lean, 0, 0], tint });
  for (const a of arm1) b.weld(a, sp1, 60);
  b.hinge(arm1[0], knuckle, { pivots: [[-X1, yS, 0]], axis: [fwd.x, fwd.y, fwd.z], min: -40, max: 45, friction: 5, strength: 50, group: "lamp_shoulder" });
  b.hinge(arm1[1], knuckle, { pivots: [[X1, yS, 0]], axis: [fwd.x, fwd.y, fwd.z], min: -40, max: 45, friction: 5, strength: 50, group: "lamp_shoulder" });

  // ---- elbow knuckle + upper arm, 15° below horizontal
  const ek = boxR(b, "elbow", "steel", S, [-(X2 - 0.002), X2 - 0.002], [elbow[1] - 0.012, elbow[1] + 0.012], [elbow[2] - 0.012, elbow[2] + 0.012], { tint });
  b.hinge(ek, arm1, { pivots: [[-X1, elbow[1], elbow[2]], [X1, elbow[1], elbow[2]]], axis: [fwd.x, fwd.y, fwd.z], min: -60, max: 70, friction: 4, strength: 45 });
  const drop = 25;
  const a2 = (-drop * Math.PI) / 180;
  const head: [number, number, number] = [0, elbow[1] + L2 * Math.sin(a2), elbow[2] + L2 * Math.cos(a2)];
  const mid2: [number, number, number] = [0, (elbow[1] + head[1]) / 2, (elbow[2] + head[2]) / 2];
  const pitch2 = 90 + drop; // bar axis (+Y) rotated to point forward, below horizontal
  const arm2 = [-1, 1].map((sx) => b.box(sx < 0 ? "arm2_l" : "arm2_r", "steel", S, [0.004, L2, 0.012], [sx * X2, mid2[1], mid2[2]], { rot: [pitch2, 0, 0], tint, tess: 0 }));
  for (const a of arm2) b.weld(a, ek, 70);
  const sp2 = b.box("arm2_spreader", "steel", S, [2 * X2 - 0.004, 0.02, 0.012], mid2, { rot: [pitch2, 0, 0], tint });
  for (const a of arm2) b.weld(a, sp2, 60);

  // ---- head knuckle, stem, shade (spun steel lathe) aimed down/forward, socket + spot bulb
  const hk = boxR(b, "head_knuckle", "steel", S, [-(X2 - 0.002), X2 - 0.002], [head[1] - 0.012, head[1] + 0.012], [head[2] - 0.012, head[2] + 0.012], { tint });
  b.hinge(hk, arm2, { pivots: [[-X2, head[1], head[2]], [X2, head[1], head[2]]], axis: [fwd.x, fwd.y, fwd.z], min: -50, max: 50, friction: 1.5, strength: 40 });
  const tilt = 30;
  const ax = (180 - tilt) * (Math.PI / 180);
  const dir: [number, number, number] = [0, Math.cos(ax), Math.sin(ax)]; // shade axis (local +Y of the head frame)
  const stemLen = 0.03;
  const stemTop: [number, number, number] = [0, head[1] - 0.012, head[2]];
  const stem = b.cyl("stem", "steel", S, 0.006, stemLen, [stemTop[0], stemTop[1] + (dir[1] * stemLen) / 2, stemTop[2] + (dir[2] * stemLen) / 2], { rot: [180 - tilt, 0, 0], segments: 8, tint });
  b.weld(stem, hk, 50);
  const shadeOrigin: [number, number, number] = [0, stemTop[1] + dir[1] * stemLen, stemTop[2] + dir[2] * stemLen];
  let shade: string[] = [];
  let socket = "";
  b.group(shadeOrigin, [180 - tilt, 0, 0], "head_", () => {
    shade = b.lathe("shade", "steelSheet", S, "metal_painted", {
      profile: [
        [0.022, 0.0],
        [0.075, 0.14],
      ],
      thickness: 0.0008,
      segments: 8,
      capBottom: true,
      tint,
      innerTint: 0xf2f0ea,
      mass: 0.34,
      tess: 0.03,
    });
    socket = b.cyl("socket", "plastic", "plastic", 0.013, 0.03, [0, 0.0008 + 0.015, 0], { segments: 10, tint: PAL.black });
    spotBulb(b, "bulb", socket, [0, 0.0308, 0], { on: o.on ?? true, intensity: 0.9, range: 3.5, angle: 1.4 });
  });
  let stemBonds = 0;
  for (const tile of shade) {
    const c = b.contact(stem, tile, 0.001);
    if (!c) continue;
    b.weld(tile, stem, 6);
    stemBonds++;
    if (!b.contact(socket, tile, 0.001)) continue;
    b.screw(socket, tile, 1, 6);
  }
  if (!stemBonds) b.warn("deskLamp: shade does not touch its stem");
  return finish(b, o);
}
