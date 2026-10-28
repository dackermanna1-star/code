// Balcony: cantilevered concrete slab (world-anchored cells, top at BALCONY_FLOOR_Y), aluminium
// posts on bolted steel base plates, tempered glass railing panels clamped between the posts,
// an aluminium handrail at 1.05 m (fixed to the facade at its wall ends) and a cast-iron drain
// grate. World coordinates. PURE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { Builder, PartOpts } from "../../objects/lib/builder.ts";
import type { MaterialId } from "../../destruction/model/materials.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { BALCONY } from "../plan.ts";
import { BALCONY_FLOOR_Y, BALCONY_RAIL_H, BALCONY_SLAB_T } from "./levels.ts";
import { PAL, bondAt, mid, newBuilder, worldAt } from "./common.ts";
import { splitEven } from "./rects.ts";

function boxW(b: Builder, name: string, mat: MaterialId, surf: SurfaceName, x: [number, number], y: [number, number], z: [number, number], o: PartOpts = {}): string {
  return b.box(name, mat, surf, [x[1] - x[0], y[1] - y[0], z[1] - z[0]], [mid(x[0], x[1]), mid(y[0], y[1]), mid(z[0], z[1])], o);
}

const POST = 0.05;
const BASE = 0.1;
const BASE_T = 0.006;
const RAIL_W = 0.06;
const RAIL_T = 0.04;
const GLASS_T = 0.01;

export function buildBalcony(): AssemblyDef {
  const B = BALCONY;
  const b = newBuilder("balcony", "Balcony", "structure", 9000);
  const yTop = BALCONY_FLOOR_Y,
    yBot = BALCONY_FLOOR_Y - BALCONY_SLAB_T;
  // ---- slab cells
  const xs = splitEven(B.x0, B.x1, 1.2),
    zs = splitEven(B.z0, B.z1, 0.75);
  const cells: string[][] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    cells.push([]);
    for (let j = 0; j + 1 < zs.length; j++) {
      const name = `slab_${i}_${j}`;
      boxW(b, name, "concrete", "concrete", [xs[i], xs[i + 1]], [yBot, yTop], [zs[j], zs[j + 1]], { tint: 0xe2ddd4, tags: ["concrete"], uvOffset: [xs[i], zs[j]] });
      worldAt(b, name, "fused", 30000, [mid(xs[i], xs[i + 1]), yBot, mid(zs[j], zs[j + 1])]);
      cells[i].push(name);
    }
  }
  for (let i = 0; i < cells.length; i++) {
    for (let j = 0; j < cells[i].length; j++) {
      if (i + 1 < cells.length) b.bond(cells[i][j], cells[i + 1][j], "fused", { anchor: [xs[i + 1], mid(yBot, yTop), mid(zs[j], zs[j + 1])] });
      if (j + 1 < cells[i].length) b.bond(cells[i][j], cells[i][j + 1], "fused", { anchor: [mid(xs[i], xs[i + 1]), mid(yBot, yTop), zs[j + 1]] });
    }
  }
  const cellAt = (x: number, z: number): string => {
    let i = xs.findIndex((v, k) => k + 1 < xs.length && x >= v && x <= xs[k + 1]);
    let j = zs.findIndex((v, k) => k + 1 < zs.length && z >= v && z <= zs[k + 1]);
    if (i < 0) i = 0;
    if (j < 0) j = 0;
    return cells[Math.min(i, cells.length - 1)][Math.min(j, cells[0].length - 1)];
  };

  // ---- posts: along the outer (south) edge and both short edges up to the facade
  const inset = 0.04;
  const xW = B.x0 + inset,
    xE = B.x1 - inset,
    zS = B.z0 + inset,
    zWall = B.z1 - 0.05;
  const south = splitEven(xW, xE, 1.2);
  const side = splitEven(zS, zWall, 0.7);
  const posts: Array<{ name: string; x: number; z: number }> = [];
  const yPost0 = yTop + BASE_T;
  const yPost1 = yTop + BALCONY_RAIL_H - RAIL_T;
  const addPost = (x: number, z: number) => {
    const k = posts.length;
    const base = `post${k}_base`,
      post = `post${k}`;
    boxW(b, base, "steel", "metal_painted", [x - BASE / 2, x + BASE / 2], [yTop, yPost0], [z - BASE / 2, z + BASE / 2], { tint: PAL.frameCharcoal, tags: ["railing"] });
    // 50×50×3 mm aluminium tube ≈ 1.5 kg/m
    boxW(b, post, "aluminum", "metal_painted", [x - POST / 2, x + POST / 2], [yPost0, yPost1], [z - POST / 2, z + POST / 2], { tint: PAL.frameCharcoal, tess: 0.05, tags: ["railing"], mass: 1.5 * (yPost1 - yPost0) });
    bondAt(b, base, cellAt(x, z), "bolt", 300, [x, yTop, z]);
    bondAt(b, post, base, "weld", 220, [x, yPost0, z]);
    posts.push({ name: post, x, z });
  };
  for (const x of south) addPost(x, zS);
  for (const z of side.slice(1)) addPost(xW, z);
  for (const z of side.slice(1)) addPost(xE, z);

  // ---- tempered glass panels clamped between neighbouring posts
  const gy0 = yTop + 0.1,
    gy1 = yPost1 - 0.06;
  const panel = (name: string, a: { name: string; x: number; z: number }, c: { name: string; x: number; z: number }) => {
    const alongX = Math.abs(a.z - c.z) < 1e-6;
    if (alongX) {
      const x0 = Math.min(a.x, c.x) + POST / 2 + 0.015,
        x1 = Math.max(a.x, c.x) - POST / 2 - 0.015;
      boxW(b, name, "temperedGlass", "glass", [x0, x1], [gy0, gy1], [a.z - GLASS_T / 2, a.z + GLASS_T / 2], { tags: ["railing", "glass"] });
      for (const [p, x] of [
        [a, x0],
        [c, x1],
      ] as Array<[{ name: string }, number]>) {
        // two glass clamps per post → one bond with the summed strength
        bondAt(b, name, p.name, "clip", 60, [x, mid(gy0, gy1), a.z]);
      }
    } else {
      const z0 = Math.min(a.z, c.z) + POST / 2 + 0.015,
        z1 = Math.max(a.z, c.z) - POST / 2 - 0.015;
      boxW(b, name, "temperedGlass", "glass", [a.x - GLASS_T / 2, a.x + GLASS_T / 2], [gy0, gy1], [z0, z1], { tags: ["railing", "glass"] });
      for (const [p, z] of [
        [a, z0],
        [c, z1],
      ] as Array<[{ name: string }, number]>) {
        bondAt(b, name, p.name, "clip", 60, [a.x, mid(gy0, gy1), z]);
      }
    }
  };
  const southPosts = posts.filter((p) => Math.abs(p.z - zS) < 1e-6).sort((p, q) => p.x - q.x);
  for (let i = 0; i + 1 < southPosts.length; i++) panel(`glass_s${i}`, southPosts[i], southPosts[i + 1]);
  for (const [tag, x] of [
    ["w", xW],
    ["e", xE],
  ] as Array<[string, number]>) {
    const ps = posts.filter((p) => Math.abs(p.x - x) < 1e-6).sort((p, q) => p.z - q.z);
    for (let i = 0; i + 1 < ps.length; i++) panel(`glass_${tag}${i}`, ps[i], ps[i + 1]);
  }

  // ---- handrail: two pieces along the front, one per side (fixed to the facade bracket)
  const ry: [number, number] = [yPost1, yPost1 + RAIL_T];
  const railOn = (name: string, x: [number, number], z: [number, number]) => {
    // hollow 60×40 mm handrail profile ≈ 1.3 kg/m
    boxW(b, name, "aluminum", "metal_painted", x, ry, z, { tint: PAL.frameCharcoal, tess: 0.05, tags: ["railing", "handrail"], mass: 1.3 * Math.max(x[1] - x[0], z[1] - z[0]) });
    for (const p of posts) {
      if (p.x >= x[0] - 1e-6 && p.x <= x[1] + 1e-6 && p.z >= z[0] - 1e-6 && p.z <= z[1] + 1e-6) bondAt(b, name, p.name, "screw", 70, [p.x, ry[0], p.z]);
    }
  };
  const xm = southPosts[Math.floor(southPosts.length / 2)].x;
  const fz: [number, number] = [zS - RAIL_W / 2, zS + RAIL_W / 2];
  railOn("rail_s0", [xW - RAIL_W / 2, xm], fz);
  railOn("rail_s1", [xm, xE + RAIL_W / 2], fz);
  bondAt(b, "rail_s0", "rail_s1", "screw", 40, [xm, mid(ry[0], ry[1]), zS]);
  for (const [n, x] of [
    ["rail_w", xW],
    ["rail_e", xE],
  ] as Array<[string, number]>) {
    railOn(n, [x - RAIL_W / 2, x + RAIL_W / 2], [zS + RAIL_W / 2, B.z1]);
    bondAt(b, n, x === xW ? "rail_s0" : "rail_s1", "screw", 40, [x, mid(ry[0], ry[1]), zS + RAIL_W / 2]);
    worldAt(b, n, "screw", 80, [x, mid(ry[0], ry[1]), B.z1]);
  }

  // ---- drain grate near the facade corner (slab falls towards it)
  const dg = "drainGrate";
  const dx = B.x0 + 0.25,
    dz = B.z1 - 0.25;
  b.cyl(dg, "castIron", "cast_iron", 0.06, 0.006, [dx, yTop + 0.003, dz], { segments: 14, tags: ["drain"] });
  bondAt(b, dg, cellAt(dx, dz), "bolt", 80, [dx, yTop, dz]);

  const def = b.build();
  def.room = "balcony";
  return def;
}
