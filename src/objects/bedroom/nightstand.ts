// Nightstand: 16 mm veneered particleboard carcass (sides, bottom, fixed shelf, 3 mm HDF back
// nailed on) on four tapered hardwood legs, an overhanging top board screwed to the sides, one
// inset drawer on two slider runners (box: sides, back, bottom in grooves; MDF front, bar pull)
// above an open shelf. Particleboard crumbles, the HDF back pops its nails, legs splinter.
// Local frame: origin on the floor at the centre, front (drawer) at +Z. PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { cabinetCarcass, drawer } from "../lib/kit.ts";
import { boxR, finish, mk, type BaseOpts } from "./common.ts";

export interface NightstandOpts extends BaseOpts {
  style?: "walnut" | "white";
}

const N = {
  w: 0.48,
  d: 0.4,
  legH: 0.12,
  caseH: 0.42,
  topT: 0.02,
  t: 0.016,
  drawerOpening: 0.135,
};

export interface NightstandDims {
  w: number;
  d: number;
  /** Top surface height. */
  h: number;
  /** Top board extent (x0..x1, z0..z1) in the local frame. */
  top: { x0: number; x1: number; z0: number; z1: number };
  /** Open shelf: floor height (top of the bottom panel), clear height, inner x/z range. */
  shelf: { y: number; clear: number; x0: number; x1: number; z0: number; z1: number };
}

export function nightstandDims(): NightstandDims {
  const h = N.legH + N.caseH + N.topT;
  const iw = N.w - 2 * N.t;
  const shelfTop = N.caseH - N.drawerOpening; // carcass frame
  return {
    w: N.w + 0.02,
    d: N.d + 0.015,
    h,
    top: { x0: -N.w / 2 - 0.01, x1: N.w / 2 + 0.01, z0: -N.d / 2, z1: N.d / 2 + 0.015 },
    shelf: { y: N.legH + N.t, clear: shelfTop - N.t - 2 * N.t, x0: -iw / 2, x1: iw / 2, z0: -N.d / 2 + 0.003, z1: N.d / 2 },
  };
}

export function buildNightstand(o: NightstandOpts = {}): AssemblyDef {
  const white = o.style === "white";
  const b = mk("nightstand", "Nightstand", "furniture", 140, o);
  const surf: SurfaceName = white ? "laminate_white" : "wood_walnut";
  const tint = white ? 0xf3f1ec : 0xffffff;
  const { w, d, legH, caseH, topT, t } = N;

  const shelfTop = caseH - N.drawerOpening;
  const c = cabinetCarcass(b, "case", { w, h: caseH, d, t, mat: "particleboard", surf, tint, top: "none", fixedShelves: [shelfTop], joinery: "dowel" }, [0, legH, 0]);

  // overhanging top board screwed down into the sides (and the HDF back's top edge)
  const top = boxR(b, "top", "particleboard", surf, [-w / 2 - 0.01, w / 2 + 0.01], [legH + caseH, legH + caseH + topT], [-d / 2, d / 2 + 0.015], { tint });
  b.screw(top, c.left, 2, 30);
  b.screw(top, c.right, 2, 30);
  if (c.back) b.nail(top, c.back, 3, 6);

  // tapered hardwood legs screwed to the bottom panel
  const legTop = 0.04,
    legBot = 0.026,
    inset = 0.006;
  for (const [sx, sz, nm] of [
    [-1, -1, "bl"],
    [1, -1, "br"],
    [-1, 1, "fl"],
    [1, 1, "fr"],
  ] as Array<[number, number, string]>) {
    const ox = sx * (w / 2 - inset),
      oz = sz * (d / 2 - inset - 0.004);
    const pts: Array<[number, number, number]> = [];
    for (const [a, cc] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      pts.push([ox - sx * a * legBot, 0, oz - sz * cc * legBot]);
      pts.push([ox - sx * a * legTop, legH, oz - sz * cc * legTop]);
    }
    const leg = b.hull(`leg_${nm}`, "hardwood", "wood_walnut", pts, [0, 0, 0], { grain: "y", tint: white ? 0xd9c3a3 : 0xffffff });
    b.screw(leg, c.bottom, 2, 30);
  }

  // inset drawer above the shelf: box on runners, front flush with the carcass face
  const iw = w - 2 * t;
  const openY0 = legH + shelfTop,
    openY1 = legH + caseH;
  const fh = N.drawerOpening - 0.004,
    fw = iw - 0.004;
  const boxH = 0.105,
    boxD = 0.34,
    boxW = iw - 0.025;
  const boxY0 = openY0 + 0.012;
  drawer(
    b,
    "drawer",
    {
      w: boxW,
      h: boxH,
      d: boxD,
      front: { w: fw, h: fh, t: 0.018, mat: "mdf", surf, tint, dy: openY0 + 0.002 - boxY0 },
      mat: "particleboard",
      surf: white ? "laminate_white" : "particleboard",
      fixed: [c.left, c.right],
      travel: 0.28,
      strength: 40,
      friction: 0.6,
      handle: { kind: "bar", len: 0.096, mat: "aluminum", surf: "steel_brushed" },
    },
    [0, boxY0, d / 2 - 0.018],
  );
  void openY1;
  return finish(b, o);
}
