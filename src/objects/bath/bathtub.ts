// Built-in acrylic bathtub (1700 × 720 mm, rim 560 mm) the way it is really made:
//
//  * Shell: a vacuum-formed 6 mm acrylic basin (glass-fibre backed) — sloped walls between a
//    rounded-rectangle opening and a flat bottom, the backrest end sloping ~34°, plus a 12 mm
//    reinforced flat rim deck. Built as convex tiles that share real faces (fused), so a heavy
//    hit cracks out a wall tile or splits the rim instead of the whole tub vanishing at once.
//  * Under the bottom: an 18 mm chipboard base board bonded to the shell, two steel cradle rails
//    and four adjustable steel feet with plastic pads standing on the floor.
//  * Two steel wall brackets under the back rim screwed into the wall (the tub is static until
//    they are ripped out), a chrome drain flange and overflow cover, a PVC waste trap running
//    into the floor, and clip-on acrylic front + end aprons hiding all of it.
//
// Frame: origin at the floor centre of the footprint, length along X (+X = drain / shower end),
// apron front +Z, back (wall) side −Z. Footprint 1.70 × 0.72 m, rim top y = 0.56. ~33 kg.

import { basinShell, boxR, bondTouching, finish, mk, CHROME, type BaseOpts } from "../utility/helpers.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

export interface BathtubOpts extends BaseOpts {
  /** Shell colour (white acrylic by default). */
  tint?: number;
  /** End apron on the −X end (open end of the tub). Default true. */
  endApron?: boolean;
}

/** Key dimensions other builders / the furnisher rely on. */
export const BATHTUB = {
  length: 1.7,
  width: 0.72,
  rimY: 0.56,
  /** Rim deck inner edge distances from the outer edge (back, front, +X end, −X end). */
  rimBack: 0.05,
  rimFront: 0.07,
  rimDrainEnd: 0.06,
  rimFootEnd: 0.07,
} as const;

export function buildBathtub(o: BathtubOpts = {}): AssemblyDef {
  const b = mk("bathtub", "Acrylic Bathtub", "fixture", 450, o);
  const tint = o.tint ?? 0xfbfbf8;
  const L = BATHTUB.length,
    W = BATHTUB.width;
  const yRim = BATHTUB.rimY;
  const deckT = 0.012;
  const yTop = yRim - deckT; // wall tops / deck underside (0.548)
  const yBot = 0.1; // inner bottom surface
  const tb = 0.008;

  // ------------------------------------------------------------------ acrylic shell
  // opening: back rim 5 cm, front rim 7 cm, drain end 6 cm, backrest end 7 cm
  const ox0 = -L / 2 + BATHTUB.rimFootEnd,
    ox1 = L / 2 - BATHTUB.rimDrainEnd,
    oz0 = -W / 2 + BATHTUB.rimBack,
    oz1 = W / 2 - BATHTUB.rimFront;
  const shell = basinShell(b, "shell", {
    top: { hx: (ox1 - ox0) / 2, hz: (oz1 - oz0) / 2, r: 0.12, y: yTop, cx: (ox0 + ox1) / 2, cz: (oz0 + oz1) / 2 },
    // flat bottom: the backrest (−X) end slopes far more than the drain end
    bottom: { hx: 0.59, hz: 0.23, r: 0.08, y: yBot, cx: 0.11, cz: -0.01 },
    t: 0.006,
    tb,
    corner: 2,
    deck: { hx: L / 2, hz: W / 2, t: deckT },
    mat: "acrylic",
    surf: "acrylic_white",
    tint,
  });

  // ------------------------------------------------------------------ base board, cradle, feet
  const yb0 = yBot - tb; // underside of the bottom slab (0.092)
  const board = boxR(b, "base_board", "particleboard", "particleboard", [-0.45, 0.55], [yb0 - 0.018, yb0], [-0.2, 0.18]);
  b.glue(board, shell.bottom, 120);
  const railY0 = yb0 - 0.018 - 0.02;
  const rails: string[] = [];
  for (const [k, x] of [
    ["a", -0.35],
    ["b", 0.42],
  ] as Array<[string, number]>) {
    const rail = boxR(b, `rail_${k}`, "steel", "metal_painted", [x - 0.02, x + 0.02], [railY0, railY0 + 0.02], [-0.3, 0.3], { tint: 0x55585c, mass: 0.42 });
    b.screw(rail, board, 2, 30);
    rails.push(rail);
    for (const z of [-0.26, 0.26]) {
      const zk = z < 0 ? "b" : "f";
      const rod = b.cyl(`foot_${k}${zk}_rod`, "steel", "metal_raw", 0.006, railY0 - 0.012, [x, 0.012 + (railY0 - 0.012) / 2, z], { segments: 8 });
      const pad = b.cyl(`foot_${k}${zk}_pad`, "plastic", "plastic", 0.022, 0.012, [x, 0.006, z], { segments: 10, tint: 0x2b2b2b });
      b.bolt(rod, rail, 90);
      b.press(pad, rod, 25);
    }
  }

  // ------------------------------------------------------------------ wall brackets (the anchor)
  const deckBack = shell.deck;
  for (const [k, x] of [
    ["l", -0.55],
    ["r", 0.55],
  ] as Array<[string, number]>) {
    const br = boxR(b, `bracket_${k}`, "steel", "metal_raw", [x - 0.025, x + 0.025], [yTop - 0.06, yTop], [-W / 2, -W / 2 + 0.03], { tess: 0, mass: 0.25 });
    bondTouching(b, br, deckBack, "screw", 60, 0.0015);
    b.world(br, "screw", 70, [x, yTop - 0.03, -W / 2]);
  }

  // ------------------------------------------------------------------ drain, overflow, waste trap
  const drainX = 0.62;
  const drain = b.cyl("drain", CHROME.mat, CHROME.surf, 0.034, 0.004, [drainX, yBot + 0.002, 0], { segments: 12, mass: 0.12 });
  b.screw(drain, shell.bottom, 1, 40);
  const waste = b.cyl("waste_body", "plastic", "plastic", 0.026, 0.03, [drainX, yb0 - 0.015, 0], { segments: 10, tint: 0xe9e9e4 });
  b.screw(waste, shell.bottom, 1, 40);
  const trap = b.tube(
    "waste_trap",
    "plastic",
    "plastic",
    [
      [drainX, yb0 - 0.0305, 0],
      [drainX, 0.046, 0],
      [drainX, 0.032, -0.05],
      [drainX, 0.024, -0.3],
    ],
    0.02,
    { sides: 8, tint: 0xe9e9e4, kgPerM: 0.35, jointStrength: 40 },
  );
  b.bond(trap[0], waste, "glue", { strength: 40 });
  // the waste runs back into the floor / wall stack under the drain end
  b.world(trap[trap.length - 1], "press", 25, [drainX, 0.024, -0.3]);
  // overflow cover on the drain-end wall, tilted with the wall's slope
  const slope = Math.atan2(0.09, yTop - yBot); // drain-end wall: 0.79 at the top → 0.70 at the bottom
  const yOv = 0.45;
  const xWall = 0.7 + (0.09 * (yOv - yBot)) / (yTop - yBot);
  const nx = Math.cos(slope),
    ny = -Math.sin(slope);
  const overflow = b.cyl("overflow", CHROME.mat, CHROME.surf, 0.028, 0.006, [xWall - nx * 0.003, yOv - ny * 0.003, 0], {
    axis: "x",
    rot: [0, 0, (-slope * 180) / Math.PI],
    segments: 12,
    mass: 0.08,
  });
  bondTouching(b, overflow, shell.walls, "screw", 20, 0.002);

  // ------------------------------------------------------------------ aprons (clipped on)
  const apron = boxR(b, "apron_front", "acrylic", "acrylic_white", [-L / 2 + (o.endApron === false ? 0 : 0.005), L / 2], [0, yTop], [W / 2 - 0.008, W / 2 - 0.003], { tint });
  bondTouching(b, apron, shell.deck, "clip", 32, 0.0015);
  if (o.endApron !== false) {
    const end = boxR(b, "apron_end", "acrylic", "acrylic_white", [-L / 2, -L / 2 + 0.005], [0, yTop], [-W / 2, W / 2 - 0.003], { tint });
    bondTouching(b, end, shell.deck, "clip", 16, 0.0015);
    b.clip(end, apron, 8);
  }

  return finish(b, o);
}
