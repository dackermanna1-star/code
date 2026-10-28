// Building corridor stub outside the front door: concrete floor slab with carpet tiles, the
// corridor's far (north) wall, a closing end wall to the west, the east end wall and the
// ceiling slab — so the front door opens onto something solid and walkable. The render
// module draws a long baked visual corridor (src/render/env/towerLayout.ts CORRIDOR: z 9.0–10.8,
// h 2.6); this stub sits 1–2 cm inside its surfaces so the destructible geometry is what you
// see (no z-fighting) and closes it at x = 8.0. World coordinates. PURE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { Builder, PartOpts } from "../../objects/lib/builder.ts";
import type { MaterialId } from "../../destruction/model/materials.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { CONCRETE_T, INTERIOR } from "../plan.ts";
import { SLAB_BOTTOM_Y } from "./levels.ts";
import { bondAt, mid, newBuilder, worldAt } from "./common.ts";
import { splitEven } from "./rects.ts";

function boxW(b: Builder, name: string, mat: MaterialId, surf: SurfaceName, x: [number, number], y: [number, number], z: [number, number], o: PartOpts = {}): string {
  return b.box(name, mat, surf, [x[1] - x[0], y[1] - y[0], z[1] - z[0]], [mid(x[0], x[1]), mid(y[0], y[1]), mid(z[0], z[1])], o);
}

/** Corridor stub extents (inside faces). */
export const CORRIDOR_STUB = {
  x0: 8.0,
  x1: INTERIOR.maxX - 0.01, // 12.79: just inside the visual end wall at 12.8
  z0: INTERIOR.maxZ + CONCRETE_T, // 9.0: our party wall's corridor face
  z1: 10.78, // visual far wall at 10.8
  floorY: 0.005, // carpet tiles 5 mm above the visual floor
  ceilingY: 2.58, // below the visual ceiling (2.6) and its light panels (2.59)
} as const;

/** Corridor wall paint and carpet tints (matched to the render module's baked corridor). */
export const CORRIDOR_PAINT = 0xa89f8f;
const CARPET = 0x5a4337;

const T = 0.2;
const CELL = 0.95;

export function buildCorridor(): AssemblyDef {
  const C = CORRIDOR_STUB;
  const b = newBuilder("corridor", "Building Corridor", "structure", 6000);
  const yTop = C.ceilingY + 0.25;
  const cells: string[] = [];
  const cell = (name: string, x: [number, number], y: [number, number], z: [number, number], paintFace: "px" | "nx" | "pz" | "nz" | "ny" | null) => {
    const o: PartOpts = { tags: ["concrete"], uvOffset: [x[0], y[0]] };
    if (paintFace) o.faces = { [paintFace]: { surf: paintFace === "ny" ? "plaster_ceiling" : "paint_wall", tint: paintFace === "ny" ? 0xd8d6d0 : CORRIDOR_PAINT } };
    boxW(b, name, "concrete", "concrete", x, y, z, o);
    worldAt(b, name, "fused", 20000, [mid(x[0], x[1]), mid(y[0], y[1]), mid(z[0], z[1])]);
    cells.push(name);
    return name;
  };
  // ---- floor slab (top 5 mm below the carpet top) and carpet tiles
  const slabTop = C.floorY - 0.01;
  const fx = splitEven(C.x0, C.x1, 1.7);
  const floor: string[] = [];
  for (let i = 0; i + 1 < fx.length; i++) floor.push(cell(`floor_${i}`, [fx[i], fx[i + 1]], [SLAB_BOTTOM_Y, slabTop], [C.z0, C.z1], null));
  for (let i = 0; i + 1 < floor.length; i++) b.bond(floor[i], floor[i + 1], "fused", { anchor: [fx[i + 1], mid(SLAB_BOTTOM_Y, slabTop), mid(C.z0, C.z1)] });
  const tx = splitEven(C.x0, C.x1, 0.6),
    tz = splitEven(C.z0, C.z1, 0.6);
  const tiles: string[][] = [];
  for (let i = 0; i + 1 < tx.length; i++) {
    tiles.push([]);
    for (let j = 0; j + 1 < tz.length; j++) {
      const name = `carpet_${i}_${j}`;
      boxW(b, name, "fabric", "carpet", [tx[i], tx[i + 1]], [slabTop, C.floorY], [tz[j], tz[j + 1]], { tint: CARPET, tags: ["carpet", "floor"] });
      worldAt(b, name, "glue", 6, [mid(tx[i], tx[i + 1]), slabTop, mid(tz[j], tz[j + 1])]);
      tiles[i].push(name);
    }
  }
  for (let i = 0; i < tiles.length; i++) {
    for (let j = 0; j < tiles[i].length; j++) {
      if (i + 1 < tiles.length) bondAt(b, tiles[i][j], tiles[i + 1][j], "friction", 2, [tx[i + 1], C.floorY - 0.005, mid(tz[j], tz[j + 1])]);
      if (j + 1 < tiles[i].length) bondAt(b, tiles[i][j], tiles[i][j + 1], "friction", 2, [mid(tx[i], tx[i + 1]), C.floorY - 0.005, tz[j + 1]]);
    }
  }
  // ---- walls (full storey height like the shell), corridor faces painted
  const wallGrid = (prefix: string, along: "x" | "z", a0: number, a1: number, fixed: [number, number], face: "px" | "nx" | "pz" | "nz") => {
    const as = splitEven(a0, a1, CELL),
      ys = splitEven(SLAB_BOTTOM_Y, yTop, CELL);
    const grid: string[][] = [];
    for (let i = 0; i + 1 < as.length; i++) {
      grid.push([]);
      for (let j = 0; j + 1 < ys.length; j++) {
        const x: [number, number] = along === "x" ? [as[i], as[i + 1]] : fixed;
        const z: [number, number] = along === "x" ? fixed : [as[i], as[i + 1]];
        grid[i].push(cell(`${prefix}_${i}_${j}`, x, [ys[j], ys[j + 1]], z, face));
      }
    }
    for (let i = 0; i < grid.length; i++) {
      for (let j = 0; j < grid[i].length; j++) {
        const m = mid(fixed[0], fixed[1]);
        if (j + 1 < grid[i].length) b.bond(grid[i][j], grid[i][j + 1], "fused", { anchor: along === "x" ? [mid(as[i], as[i + 1]), ys[j + 1], m] : [m, ys[j + 1], mid(as[i], as[i + 1])] });
        if (i + 1 < grid.length) b.bond(grid[i][j], grid[i + 1][j], "fused", { anchor: along === "x" ? [as[i + 1], mid(ys[j], ys[j + 1]), m] : [m, mid(ys[j], ys[j + 1]), as[i + 1]] });
      }
    }
  };
  wallGrid("wallN", "x", C.x0 - T, C.x1 + T, [C.z1, C.z1 + T], "nz");
  wallGrid("wallW", "z", C.z0, C.z1, [C.x0 - T, C.x0], "px");
  wallGrid("wallE", "z", C.z0, C.z1, [C.x1, C.x1 + T], "nx");
  // ---- ceiling slab (painted soffit)
  const cx = splitEven(C.x0, C.x1, 1.7);
  const ceil: string[] = [];
  for (let i = 0; i + 1 < cx.length; i++) ceil.push(cell(`ceiling_${i}`, [cx[i], cx[i + 1]], [C.ceilingY, yTop], [C.z0, C.z1], "ny"));
  for (let i = 0; i + 1 < ceil.length; i++) b.bond(ceil[i], ceil[i + 1], "fused", { anchor: [cx[i + 1], mid(C.ceilingY, yTop), mid(C.z0, C.z1)] });
  return b.build();
}
