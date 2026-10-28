// Bookshelf: 18 mm particleboard carcass (sides, top, bottom on a recessed plinth, HDF back nailed
// on), four adjustable shelves on pins, and an anti-tip strap screwed into the wall stud (weak
// world bond at the top back: pull hard or hit it and it breaks loose and topples). Books are
// separate assemblies placed on the shelves by the furnisher (see bookshelfDims().levels).
// Local frame: origin on the floor at the centre, open front at +Z. PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { cabinetCarcass } from "../lib/kit.ts";
import { finish, mk, type BaseOpts } from "./common.ts";

export interface BookshelfOpts extends BaseOpts {
  style?: "white" | "oak";
  /** Anchor to the wall with an anti-tip strap (default true). */
  strap?: boolean;
}

const B = { w: 0.8, h: 1.8, d: 0.3, t: 0.018, plinth: 0.06, shelves: 4 };

export interface BookshelfDims {
  w: number;
  h: number;
  d: number;
  /** Surfaces books can stand on: y of the surface, clear height above it, inner x/z range. */
  levels: Array<{ y: number; clear: number }>;
  inner: { x0: number; x1: number; z0: number; z1: number };
}

export function bookshelfDims(): BookshelfDims {
  const { w, h, d, t, plinth, shelves } = B;
  const y0 = plinth + t,
    y1 = h - t;
  const gap = (y1 - y0 - shelves * t) / (shelves + 1);
  const levels: Array<{ y: number; clear: number }> = [];
  for (let k = 0; k <= shelves; k++) levels.push({ y: y0 + k * (gap + t), clear: gap });
  return { w, h, d, levels, inner: { x0: -w / 2 + t, x1: w / 2 - t, z0: -d / 2 + 0.003 + 0.002, z1: d / 2 - 0.022 } };
}

export function buildBookshelf(o: BookshelfOpts = {}): AssemblyDef {
  const b = mk("bookshelf", "Bookshelf", "furniture", 120, o);
  const oak = o.style === "oak";
  const surf: SurfaceName = oak ? "wood_oak" : "laminate_white";
  const tint = oak ? 0xe9cfa6 : 0xf3f1ec;
  const { w, h, d, t, plinth } = B;
  const dims = bookshelfDims();
  const shelfTops = dims.levels.slice(1).map((l) => l.y);
  const c = cabinetCarcass(b, "case", { w, h, d, t, mat: "particleboard", surf, tint, top: "full", toeKick: { h: plinth, setback: 0.02 }, shelves: shelfTops, pinStrength: 6, joinery: "dowel" });
  if (o.strap !== false) b.world(c.top[0], "screw", 40, [0, h - t / 2, -d / 2 + 0.003]);
  return finish(b, o);
}
