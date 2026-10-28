// Two-way bookshelf speaker: a 15 mm MDF box (glued butt joints, vinyl walnut wrap) with a
// woofer (stamped steel frame, paper cone, ferrite magnet + steel back plate behind the baffle),
// a soft-dome tweeter, a crossover board on the floor of the cabinet, binding-post plate on the
// back and a removable grille (MDF frame on press pegs + stretched fabric). Throw it and the
// grille pops off; smash it and the MDF crumbles open to show the magnet (which shatters — it
// is ceramic ferrite) and the crossover.
//
// Frame: origin on the floor at the centre, +Y up, baffle faces +Z. 0.165 × 0.285 × 0.25 m
// (with grille), ~4 kg, ~22 parts.

import { Builder } from "../lib/builder.ts";
import { frameBars, pcb } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { bondTouching } from "./lib.ts";

export interface SpeakerOpts {
  wrap?: SurfaceName;
  tint?: number;
  /** Grille fitted (default true). */
  grille?: boolean;
  seed?: number;
}

export const SPEAKER_DIMS = { w: 0.165, h: 0.285, d: 0.22, grilleDepth: 0.0275, feet: 0.005 } as const;

export function buildBookshelfSpeaker(o: SpeakerOpts = {}): AssemblyDef {
  const b = new Builder("bookshelfSpeaker", "Bookshelf Speaker", "electronics", 180, o.seed);
  const { w: W, d: D, feet } = SPEAKER_DIMS;
  const H = SPEAKER_DIMS.h - feet;
  const t = 0.015;
  const surf = o.wrap ?? "wood_walnut";
  const po = { tint: o.tint ?? 0xffffff };
  const y0 = feet;
  // feet
  const feetP: string[] = [];
  for (const [k, [x, z]] of [
    [-0.06, 0.08],
    [0.06, 0.08],
    [-0.06, -0.08],
    [0.06, -0.08],
  ].entries())
    feetP.push(b.cyl(`foot${k}`, "rubber", "rubber", 0.009, feet, [x, feet / 2, z], { segments: 8, tint: 0x151515 }));
  // cabinet: sides full size, top/bottom between them, baffle and back inset between all four
  const sideL = b.box("side_l", "mdf", surf, [t, H, D], [-W / 2 + t / 2, y0 + H / 2, 0], po);
  const sideR = b.box("side_r", "mdf", surf, [t, H, D], [W / 2 - t / 2, y0 + H / 2, 0], po);
  const iw = W - 2 * t;
  const top = b.box("top", "mdf", surf, [iw, t, D], [0, y0 + H - t / 2, 0], po);
  const bottom = b.box("bottom", "mdf", surf, [iw, t, D], [0, y0 + t / 2, 0], po);
  const ih = H - 2 * t;
  const baffle = b.box("baffle", "mdf", "metal_black", [iw, ih, t], [0, y0 + H / 2, D / 2 - t / 2]);
  const back = b.box("back", "mdf", surf, [iw, ih, t], [0, y0 + H / 2, -D / 2 + t / 2], po);
  for (const s of [sideL, sideR]) {
    b.glue(s, top, 70);
    b.glue(s, bottom, 70);
    b.glue(s, baffle, 60);
    b.glue(s, back, 60);
  }
  for (const p of [baffle, back]) {
    b.glue(p, top, 40);
    b.glue(p, bottom, 40);
  }
  for (const f of feetP) b.glue(f, bottom, 4);

  const zF = D / 2;
  // woofer: frame flange on the baffle, cone in front, ferrite magnet + back plate behind
  const wy = y0 + 0.105;
  const flange = b.cyl("woofer_frame", "steelSheet", "metal_black", 0.064, 0.004, [0, wy, zF + 0.002], { axis: "z", segments: 12, mass: 0.12, tess: 0 });
  const cone = b.cyl("woofer_cone", "paper", "paper", 0.022, 0.02, [0, wy, zF + 0.004 + 0.01], { axis: "z", rTop: 0.055, segments: 12, tint: 0x2a2a2a, mass: 0.012 });
  const magnet = b.cyl("magnet", "ceramic", "metal_black", 0.042, 0.016, [0, wy, zF - t - 0.008], { axis: "z", segments: 12, mass: 0.42 });
  const plate = b.cyl("magnet_plate", "steel", "metal_raw", 0.042, 0.005, [0, wy, zF - t - 0.016 - 0.0025], { axis: "z", segments: 12 });
  b.screw(flange, baffle, 4, 30);
  b.glue(cone, flange, 8);
  b.glue(magnet, baffle, 25);
  b.glue(plate, magnet, 40);
  // tweeter
  const ty = y0 + 0.222;
  const face = b.cyl("tweeter_plate", "plastic", "plastic", 0.03, 0.004, [0, ty, zF + 0.002], { axis: "z", segments: 12, tint: 0x1a1a1a });
  const dome = b.cyl("tweeter_dome", "fabric", "fabric_cotton", 0.012, 0.006, [0, ty, zF + 0.004 + 0.003], { axis: "z", rTop: 0.006, segments: 10, tint: 0x303030, mass: 0.002 });
  b.screw(face, baffle, 2, 15);
  b.glue(dome, face, 3);
  // crossover on the cabinet floor
  pcb(
    b,
    "xover",
    {
      w: 0.1,
      h: 0.08,
      components: [
        { kind: "cap", x: -0.025, y: 0.015, size: [0.016, 0.016, 0.03] },
        { kind: "transformer", x: 0.025, y: 0.0, size: [0.03, 0.03, 0.018] },
      ],
      mount: { to: bottom, screws: 2, each: 10 },
      sparks: 0.3,
    },
    [0, y0 + t + 0.0016, -0.03],
    [-90, 0, 0],
  );
  // binding-post plate on the back
  const term = b.box("terminals", "plastic", "plastic", [0.06, 0.06, 0.008], [0, y0 + 0.07, -D / 2 - 0.004], { tint: 0x111111 });
  b.screw(term, back, 2, 10);
  // grille: MDF frame on press pegs + stretched fabric
  if (o.grille !== false) {
    const gd = SPEAKER_DIMS.grilleDepth - 0.0015;
    const fr = frameBars(b, "grille", { w: W, h: H, bar: 0.012, depth: gd, mat: "mdf", surf: "metal_black" }, [0, y0 + H / 2, zF]);
    for (const bar of fr.all) bondTouching(b, bar, [baffle, sideL, sideR, top, bottom], "press", 3, 0.001);
    const cloth = b.box("grille_cloth", "fabric", "speaker_grille", [W, H, 0.0015], [0, y0 + H / 2, zF + gd + 0.00075], { mass: 0.02 });
    for (const bar of fr.all) b.glue(cloth, bar, 4);
  }
  return b.build();
}
