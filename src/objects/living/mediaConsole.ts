// Media console / TV stand: 1.8 m walnut-veneered particleboard cabinet on six turned hardwood
// legs. Built like the flat-pack original:
//  * 18 mm particleboard carcass (veneer on every visible face, chipboard inside when it breaks):
//    full-height sides, top and bottom between them, two doweled dividers → three bays,
//  * 3 mm HDF back nailed on (pops off in sheets), legs screwed through mounting plates,
//  * left/right bays: 5 mm TEMPERED glass doors on two clamp hinges each with a magnetic catch
//    and a small brass knob (they dice spectacularly), an adjustable shelf on pins inside,
//  * middle bay: open device compartment above a doweled fixed shelf, a drawer on two runners
//    below it (slides out with the use key, rips out when yanked).
//
// Frame: origin on the floor at the cabinet's centre, +Y up, long side along X, front +Z.
// 1.80 × 0.42 × 0.48 m, ~40 kg, ~30 parts. Devices sit on the shelves (see `MEDIA_CONSOLE_DIMS`).

import { Builder } from "../lib/builder.ts";
import { drawer, fastenSeam, hingeAxis, knob } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { BRASS } from "./lib.ts";

export interface MediaConsoleOpts {
  /** Overall width (m), 1.6–1.9. */
  w?: number;
  veneer?: SurfaceName;
  tint?: number;
  seed?: number;
}

/** Key levels of the default console (for placing devices and decor). */
export const MEDIA_CONSOLE_DIMS = {
  w: 1.8,
  d: 0.42,
  h: 0.48,
  legH: 0.1,
  t: 0.018,
  /** Top faces of the shelves inside the bays (y, m). */
  sideShelfTop: 0.3,
  middleShelfTop: 0.268,
  /** Divider centre lines (± x). */
  dividerX: 0.33,
} as const;

export function buildMediaConsole(o: MediaConsoleOpts = {}): AssemblyDef {
  const b = new Builder("mediaConsole", "Media Console", "furniture", 420, o.seed);
  const W = Math.min(1.9, Math.max(1.4, o.w ?? MEDIA_CONSOLE_DIMS.w));
  const { d: D, h: H, legH, t, sideShelfTop, middleShelfTop } = MEDIA_CONSOLE_DIMS;
  const dX = Math.min(MEDIA_CONSOLE_DIMS.dividerX, W * 0.2);
  const surf: SurfaceName = o.veneer ?? "wood_walnut";
  const tint = o.tint ?? 0xffffff;
  const po = { tint };
  const backT = 0.003;
  const zb = -D / 2 + backT,
    zf = D / 2;
  const dz = zf - zb,
    zc = (zb + zf) / 2;
  const iw = W - 2 * t;

  // ---- carcass
  const sideL = b.box("side_l", "particleboard", surf, [t, H - legH, dz], [-W / 2 + t / 2, (legH + H) / 2, zc], po);
  const sideR = b.box("side_r", "particleboard", surf, [t, H - legH, dz], [W / 2 - t / 2, (legH + H) / 2, zc], po);
  const top = b.box("top", "particleboard", surf, [iw, t, dz], [0, H - t / 2, zc], po);
  const bottom = b.box("bottom", "particleboard", surf, [iw, t, dz], [0, legH + t / 2, zc], po);
  const yIn0 = legH + t,
    yIn1 = H - t;
  const divL = b.box("div_l", "particleboard", surf, [t, yIn1 - yIn0, dz], [-dX, (yIn0 + yIn1) / 2, zc], po);
  const divR = b.box("div_r", "particleboard", surf, [t, yIn1 - yIn0, dz], [dX, (yIn0 + yIn1) / 2, zc], po);
  for (const s of [sideL, sideR]) {
    b.dowel(s, top, 3, 40);
    b.dowel(s, bottom, 3, 40);
  }
  for (const dv of [divL, divR]) {
    b.dowel(dv, top, 2, 40);
    b.dowel(dv, bottom, 2, 40);
  }
  const back = b.box("back", "mdf", "mdf", [W, H - legH, backT], [0, (legH + H) / 2, -D / 2 + backT / 2], { supported: true });
  for (const p of [sideL, sideR, top, bottom, divL, divR]) fastenSeam(b, back, p, "nail", { spacing: 0.12, each: 6, tol: 0.001 });

  // ---- legs: tapered turned hardwood, screwed into mounting plates under the bottom
  const legX = W / 2 - 0.07,
    legZ = D / 2 - 0.06;
  let li = 0;
  for (const x of [-legX, 0, legX])
    for (const z of [legZ, -legZ]) {
      const leg = b.cyl(`leg${li++}`, "hardwood", surf, 0.013, legH, [x, legH / 2, z], { rTop: 0.021, segments: 10, tint });
      b.screw(leg, bottom, 2, 30);
    }

  // ---- side bays: adjustable shelves on pins
  const bayShelf = (nm: string, x0: number, x1: number, a: string, c: string): string => {
    const sd = dz - 0.03;
    const s = b.box(nm, "particleboard", surf, [x1 - x0 - 0.002, t, sd], [(x0 + x1) / 2, sideShelfTop - t / 2, zb + 0.004 + sd / 2], po);
    b.friction(s, a, 6);
    b.friction(s, c, 6);
    return s;
  };
  bayShelf("shelf_l", -W / 2 + t, -dX - t / 2, sideL, divL);
  bayShelf("shelf_r", dX + t / 2, W / 2 - t, divR, sideR);

  // ---- middle bay: fixed shelf + drawer below it
  const midShelf = b.box("shelf_m", "particleboard", surf, [2 * dX - t, t, dz], [0, middleShelfTop - t / 2, zc], po);
  b.dowel(midShelf, divL, 2, 40);
  b.dowel(midShelf, divR, 2, 40);
  const mid = 2 * dX - t; // clear width between the dividers
  const runnerGap = 0.0127;
  const boxBottom = yIn0 + 0.012;
  const frontBot = yIn0 + 0.003,
    frontTop = middleShelfTop - t - 0.005;
  drawer(
    b,
    "drawer",
    {
      w: mid - 2 * runnerGap,
      h: 0.1,
      d: 0.36,
      front: { w: mid - 0.006, h: frontTop - frontBot, t: 0.018, mat: "particleboard", surf, tint, dy: frontBot - boxBottom },
      mat: "particleboard",
      surf: "laminate_white",
      fixed: [divL, divR],
      travel: 0.3,
      handle: { kind: "pull", len: 0.16, mat: "aluminum", surf: BRASS.surf, tint: BRASS.tint },
    },
    [0, boxBottom, zf],
  );

  // ---- tempered glass doors on the side bays (overlay, 2 mm proud of the carcass front)
  const doorT = 0.005;
  const gap = 0.002;
  const dy0 = legH + 0.003,
    dy1 = H - 0.003;
  const glassDoor = (nm: string, x0: number, x1: number, hingeSide: -1 | 1, fixed: string, catchOn: string): void => {
    const door = b.box(nm, "temperedGlass", "glass", [x1 - x0, dy1 - dy0, doorT], [(x0 + x1) / 2, (dy0 + dy1) / 2, zf + gap + doorT / 2], {
      tint: 0x8f9a98,
      faces: { px: { surf: "glass_edge" }, nx: { surf: "glass_edge" }, py: { surf: "glass_edge" }, ny: { surf: "glass_edge" } },
    });
    const xh = hingeSide < 0 ? x0 : x1;
    const free: [number, number, number] = [-hingeSide, 0, 0];
    b.hinge(door, fixed, {
      pivots: [
        [xh, dy0 + 0.06, zf + gap],
        [xh, dy1 - 0.06, zf + gap],
      ],
      axis: hingeAxis(free, [0, 0, 1]),
      min: 0,
      max: 105,
      strength: 25,
      friction: 0.08,
      latch: 3,
      latchPos: [hingeSide < 0 ? x1 : x0, (dy0 + dy1) / 2, zf + gap],
      latchFixed: catchOn,
    });
    knob(b, `${nm}_knob`, { on: door, r: 0.011, len: 0.02, mat: "aluminum", surf: BRASS.surf, tint: BRASS.tint, kind: "bolt", strength: 15 }, [hingeSide < 0 ? x1 - 0.035 : x0 + 0.035, (dy0 + dy1) / 2, zf + gap + doorT]);
  };
  glassDoor("door_l", -W / 2 + 0.003, -dX - 0.003 - t / 2 + t / 2, -1, sideL, divL);
  glassDoor("door_r", dX + 0.003, W / 2 - 0.003, 1, sideR, divR);

  return b.build();
}
