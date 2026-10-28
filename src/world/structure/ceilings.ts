// Suspended gypsum ceilings, one assembly per room: galvanised furring channels hung from the
// ceiling slab (direct-fix hangers = world bonds), 12.5 mm gypsum boards (≤ 1.2 × 2.4 m, rows
// staggered) screwed to every channel they cross, and a steel junction box + cable at every
// light position of the plan (the fixtures themselves are furniture). Finished underside at
// y = 2.7. World coordinates. PURE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { Builder, PartOpts } from "../../objects/lib/builder.ts";
import { roomById, type RoomId } from "../plan.ts";
import { CEILING_BOARD_T, CEILING_SLAB_Y, CEILING_Y, FURRING_H, FURRING_SPACING, FURRING_W } from "./levels.ts";
import { ceilingCoverage } from "./layout.ts";
import { Fixings, PAL, bondAt, fasteners, mid, newBuilder, worldAt } from "./common.ts";
import { clipToUnion, rectArea, rectsBounds, splitEven, type Rect2 } from "./rects.ts";
import type { MaterialId } from "../../destruction/model/materials.ts";
import type { SurfaceName } from "../../render/surfaces.ts";

const EPS = 1e-6;
const BOARD_Y0 = CEILING_Y;
const BOARD_Y1 = CEILING_Y + CEILING_BOARD_T; // 2.7125
const CH_Y0 = BOARD_Y1;
const CH_Y1 = BOARD_Y1 + FURRING_H; // 2.7345
/** Hat channel linear mass (kg/m). */
const CHANNEL_KG_M = 0.45;

function boxW(b: Builder, name: string, mat: MaterialId, surf: SurfaceName, x: [number, number], y: [number, number], z: [number, number], o: PartOpts = {}): string {
  return b.box(name, mat, surf, [x[1] - x[0], y[1] - y[0], z[1] - z[0]], [mid(x[0], x[1]), mid(y[0], y[1]), mid(z[0], z[1])], o);
}

interface Item extends Rect2 {
  name: string;
}

export function buildCeiling(id: RoomId): AssemblyDef {
  const room = roomById(id);
  const cov = ceilingCoverage(id);
  const area = cov.reduce((s, r) => s + rectArea(r), 0);
  const b = newBuilder("ceiling", `Ceiling — ${room.name}`, "structure", Math.round(area * 55));
  const bb = rectsBounds(cov);

  // ---- furring channels along x, every 400 mm in z; phased so the first light sits mid-bay
  const zRef = room.lights.length ? room.lights[0][1] + FURRING_SPACING / 2 : bb.z0 + 0.15;
  const kMin = Math.ceil((bb.z0 + 0.06 - zRef) / FURRING_SPACING - EPS);
  const channels: Item[] = [];
  let ck = 0;
  for (let k = kMin; ; k++) {
    const zc = zRef + k * FURRING_SPACING;
    if (zc > bb.z1 - 0.06) break;
    const strip: Rect2 = { x0: bb.x0, x1: bb.x1, z0: zc - FURRING_W / 2, z1: zc + FURRING_W / 2 };
    for (const p of clipToUnion(strip, cov)) {
      if (p.z1 - p.z0 < FURRING_W - 1e-4 || p.x1 - p.x0 < 0.15) continue;
      const xs = splitEven(p.x0, p.x1, 3.0);
      for (let i = 0; i + 1 < xs.length; i++) {
        const name = `channel_${ck++}`;
        const len = xs[i + 1] - xs[i];
        boxW(b, name, "steelSheet", "metal_raw", [xs[i], xs[i + 1]], [CH_Y0, CH_Y1], [p.z0, p.z1], { tint: PAL.galvanised, mass: CHANNEL_KG_M * len, tess: 0, tags: ["furring"] });
        // direct-fix hangers to the slab every ~1.2 m
        const hs = splitEven(xs[i], xs[i + 1], 1.2);
        const fx = new Fixings();
        for (let h = 0; h + 1 < hs.length; h++) fx.world(name, "screw", 40, [mid(hs[h], hs[h + 1]), CH_Y1, zc]);
        fx.flush(b);
        channels.push({ name, x0: xs[i], x1: xs[i + 1], z0: p.z0, z1: p.z1 });
      }
    }
  }

  // ---- boards: columns ≤ 1.2 m along x, rows ≤ 2.4 m along z, odd columns staggered half a row
  const cols = splitEven(bb.x0, bb.x1, 1.2);
  const rowsEven = splitEven(bb.z0, bb.z1, 2.4);
  const nRows = rowsEven.length - 1;
  const rowLen = (bb.z1 - bb.z0) / nRows;
  const boards: Item[] = [];
  let bk = 0;
  for (let i = 0; i + 1 < cols.length; i++) {
    let rows = rowsEven;
    if (i % 2 === 1 && nRows >= 2) {
      rows = [bb.z0];
      for (let k = 0; k < nRows; k++) rows.push(bb.z0 + (k + 0.5) * rowLen);
      rows.push(bb.z1);
    }
    for (let j = 0; j + 1 < rows.length; j++) {
      const cell: Rect2 = { x0: cols[i], x1: cols[i + 1], z0: rows[j], z1: rows[j + 1] };
      for (const p of clipToUnion(cell, cov)) {
        if (p.x1 - p.x0 < 0.005 || p.z1 - p.z0 < 0.005) continue;
        const name = `board_${bk++}`;
        boxW(b, name, "gypsum", "gypsum", [p.x0, p.x1], [BOARD_Y0, BOARD_Y1], [p.z0, p.z1], {
          faces: { ny: { surf: "plaster_ceiling", tint: PAL.ceiling }, py: { surf: "drywall_paper" } },
          supported: true,
          tags: ["drywall", "ceiling"],
        });
        boards.push({ name, ...p });
      }
    }
  }
  for (const bd of boards) {
    let n = 0;
    for (const ch of channels) {
      const ox0 = Math.max(bd.x0, ch.x0),
        ox1 = Math.min(bd.x1, ch.x1),
        oz0 = Math.max(bd.z0, ch.z0),
        oz1 = Math.min(bd.z1, ch.z1);
      if (ox1 - ox0 > 0.01 && oz1 - oz0 > 0.004) {
        bondAt(b, bd.name, ch.name, "screw", 25 * fasteners(ox1 - ox0, 0.2), [mid(ox0, ox1), BOARD_Y1, mid(oz0, oz1)]);
        n++;
      }
    }
    if (!n) worldAt(b, bd.name, "screw", 30, [mid(bd.x0, bd.x1), BOARD_Y1, mid(bd.z0, bd.z1)]);
  }
  // taped joints
  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      const a = boards[i],
        c = boards[j];
      if (Math.abs(a.x1 - c.x0) < 1e-5 || Math.abs(c.x1 - a.x0) < 1e-5) {
        const oz0 = Math.max(a.z0, c.z0),
          oz1 = Math.min(a.z1, c.z1);
        if (oz1 - oz0 > 0.05) bondAt(b, a.name, c.name, "glue", 5, [Math.abs(a.x1 - c.x0) < 1e-5 ? a.x1 : a.x0, BOARD_Y0, mid(oz0, oz1)]);
      } else if (Math.abs(a.z1 - c.z0) < 1e-5 || Math.abs(c.z1 - a.z0) < 1e-5) {
        const ox0 = Math.max(a.x0, c.x0),
          ox1 = Math.min(a.x1, c.x1);
        if (ox1 - ox0 > 0.05) bondAt(b, a.name, c.name, "glue", 5, [mid(ox0, ox1), BOARD_Y0, Math.abs(a.z1 - c.z0) < 1e-5 ? a.z1 : a.z0]);
      }
    }
  }

  // ---- junction boxes at the plan's light positions (fixtures bolt to the ceiling below)
  room.lights.forEach(([lx, lz], i) => {
    const bx: [number, number] = [lx - 0.05, lx + 0.05];
    let bz: [number, number] = [lz - 0.05, lz + 0.05];
    const hits = (z: [number, number]) => channels.some((c) => c.x1 > bx[0] && c.x0 < bx[1] && c.z1 > z[0] && c.z0 < z[1]);
    for (const dz of [0, 0.1, -0.1, 0.15, -0.15]) {
      const z: [number, number] = [lz - 0.05 + dz, lz + 0.05 + dz];
      if (!hits(z)) {
        bz = z;
        break;
      }
    }
    const jb = `jbox_${i}`;
    const top = CEILING_SLAB_Y - 0.0025;
    boxW(b, jb, "steelSheet", "metal_raw", bx, [BOARD_Y1, top], bz, { tint: PAL.galvanised, mass: 0.25, tess: 0, tags: ["electrical", "junction-box"] });
    worldAt(b, jb, "screw", 60, [lx, top, mid(bz[0], bz[1])]);
    const cable = `jbox_${i}_cable`;
    const cz = mid(bz[0], bz[1]);
    boxW(b, cable, "copper", "plastic", [bx[1], bx[1] + 0.45], [top - 0.0085, top - 0.0025], [cz - 0.004, cz + 0.004], { tint: PAL.cable, mass: 0.06, tess: 0, tags: ["cable", "electrical"] });
    bondAt(b, cable, jb, "clip", 8, [bx[1], top - 0.0055, cz]);
    worldAt(b, cable, "nail", 5, [bx[1] + 0.3, top - 0.0025, cz]);
    b.feature({ type: "sparks", part: jb, chance: 0.5 });
    b.feature({ type: "sparks", part: cable, chance: 0.6 });
  });

  const def = b.build();
  def.room = id;
  return def;
}
