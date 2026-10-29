// Dishware: dinner/side plates, bowls, tumblers, wine glasses, mugs and a cutlery tray. Every
// vessel is a flat base disc + an open ring of thick-walled lathe tiles fused together (see
// lib.shell), so plates stack disc-on-disc, glass is real glass, and a dropped piece breaks along
// its seams and through its tiles. Each item is its own assembly (grab it, throw it).
// Origins: centre of the base on the surface (y = 0). PURE MODULE (no Babylon).

import { Builder, type V3 } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { finish, scoped, shell } from "./lib.ts";

export interface DishOpts {
  tint?: number;
  seed?: number;
}

const GLAZE = 0xf5f3ee;

/** Dinner plate Ø 26 cm (~0.55 kg). */
export function buildPlate(o: DishOpts = {}): AssemblyDef {
  const b = new Builder("plate", "Dinner Plate", "kitchenware", 12, o.seed);
  // the 8 mm disc stands for the foot ring + well (hollow underneath): real ceramic mass
  shell(b, "", { profile: [[0.085, 0], [0.13, 0.022]], t: 0.004, base: 0.008, segments: 10, tint: o.tint ?? GLAZE, baseKg: 0.22 });
  return finish(b);
}

/** Side plate Ø 20 cm (~0.3 kg). */
export function buildSidePlate(o: DishOpts = {}): AssemblyDef {
  const b = new Builder("sidePlate", "Side Plate", "kitchenware", 8, o.seed);
  shell(b, "", { profile: [[0.065, 0], [0.1, 0.018]], t: 0.0038, base: 0.007, segments: 10, tint: o.tint ?? GLAZE, baseKg: 0.12 });
  return finish(b);
}

/** Cereal bowl Ø 15.6 cm (~0.33 kg). */
export function buildBowl(o: DishOpts = {}): AssemblyDef {
  const b = new Builder("bowl", "Bowl", "kitchenware", 9, o.seed);
  shell(b, "", { profile: [[0.045, 0], [0.078, 0.068]], t: 0.0045, base: 0.007, segments: 8, tint: o.tint ?? GLAZE });
  return finish(b);
}

/** Tumbler (annealed glass, 300 ml, ~0.23 kg). */
export function buildTumbler(o: DishOpts = {}): AssemblyDef {
  const b = new Builder("tumbler", "Drinking Glass", "kitchenware", 6, o.seed);
  shell(b, "", { profile: [[0.031, 0], [0.036, 0.11]], t: 0.0028, base: 0.009, segments: 8, mat: "glass", tint: o.tint ?? 0xffffff });
  return finish(b);
}

/** Wine glass (foot, stem, solid bowl knob, thin tulip bowl; ~0.17 kg). */
export function buildWineGlass(o: DishOpts = {}): AssemblyDef {
  const b = new Builder("wineGlass", "Wine Glass", "kitchenware", 14, o.seed);
  const foot = b.cyl("foot", "glass", "glass", 0.036, 0.004, [0, 0.002, 0], { segments: 10, capSurf: "glass" });
  const stem = b.cyl("stem", "glass", "glass", 0.0045, 0.075, [0, 0.004 + 0.0375, 0], { segments: 6 });
  const knob = b.cyl("knob", "glass", "glass", 0.0055, 0.016, [0, 0.079 + 0.008, 0], { rTop: 0.024, segments: 8 });
  const bowl = b.lathe("bowl", "glass", "glass", "glass", {
    profile: [
      [0.024, 0.095],
      [0.043, 0.15],
      [0.036, 0.215],
    ],
    thickness: 0.0016,
    segments: 8,
    capBottom: false,
    edgeSurf: "glass_edge",
  });
  b.fuse(stem, foot);
  b.fuse(knob, stem);
  let n = 0;
  for (const t of bowl) {
    const c = b.contact(t, knob, 0.0015);
    if (c && (c.penetrating || c.kind === "face" || c.length > 0.003)) {
      b.fuse(t, knob);
      n++;
    }
  }
  if (n < 3) b.warn(`wine glass: bowl meets the knob with ${n} tiles`);
  return finish(b);
}

/** Ceramic mug (Ø 8.2 cm, 9.5 cm, ~0.33 kg) with a D handle sunk into the wall. */
export function buildKitchenMug(o: DishOpts & { handle?: boolean } = {}): AssemblyDef {
  const b = new Builder("kitchenMug", "Mug", "kitchenware", 7, o.seed);
  const tint = o.tint ?? 0xffffff;
  const s = shell(b, "", { profile: [[0.037, 0], [0.041, 0.095]], t: 0.0055, base: 0.007, segments: 8, tint, innerTint: 0xf6f3ec });
  if (o.handle !== false) {
    const pts: V3[] = [
      [0.035, 0.078, 0],
      [0.064, 0.076, 0],
      [0.072, 0.052, 0],
      [0.064, 0.026, 0],
      [0.034, 0.024, 0],
    ];
    const handle = b.tube("handle", "ceramic", "ceramic_glaze", pts, 0.0055, { sides: 6, tint });
    let n = 0;
    for (const e of [handle[0], handle[handle.length - 1]])
      for (const tile of s.wall) {
        const c = b.contact(e, tile, 0.001);
        if (c && (c.penetrating || c.kind === "face")) {
          b.fuse(e, tile);
          n++;
        }
      }
    if (n < 2) b.warn(`mug: handle ends meet the wall ${n} times`);
  }
  return finish(b);
}

/**
 * Plastic cutlery tray for a drawer (0.30 × 0.44 m) with forks, knives and spoons lying loose in
 * its compartments (each a separate body). Origin: bottom centre.
 */
export function buildCutleryTray(o: { w?: number; d?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("cutleryTray", "Cutlery Tray", "kitchenware", 40, o.seed);
  const w = o.w ?? 0.3,
    d = o.d ?? 0.44,
    h = 0.05,
    t = 0.003;
  const tint = 0xe8e8e4;
  b.box("bottom", "plastic", "plastic", [w, t, d], [0, t / 2, 0], { tint });
  b.box("wall_l", "plastic", "plastic", [t, h - t, d], [-w / 2 + t / 2, t + (h - t) / 2, 0], { tint });
  b.box("wall_r", "plastic", "plastic", [t, h - t, d], [w / 2 - t / 2, t + (h - t) / 2, 0], { tint });
  b.box("wall_f", "plastic", "plastic", [w - 2 * t, h - t, t], [0, t + (h - t) / 2, d / 2 - t / 2], { tint });
  b.box("wall_k", "plastic", "plastic", [w - 2 * t, h - t, t], [0, t + (h - t) / 2, -d / 2 + t / 2], { tint });
  const cw = (w - 2 * t) / 3;
  for (const k of [1, 2]) b.box(`div${k}`, "plastic", "plastic", [t, h - t - 0.005, d - 2 * t], [-w / 2 + t + k * cw, t + (h - t - 0.005) / 2, 0], { tint });
  b.autoBond("fused", undefined, 0.0004);
  // cutlery: loose stainless pieces in the three compartments
  const piece = (nm: string, x: number, z: number, kind: "fork" | "knife" | "spoon"): void => {
    scoped(b, nm, [x, t, z], undefined, () => {
      const L = kind === "knife" ? 0.215 : 0.19;
      const hd = kind === "spoon" ? 0.04 : kind === "fork" ? 0.026 : 0.02;
      const ht = kind === "spoon" ? 0.012 : 0.003;
      const pts: V3[] = [
        [-0.006, 0, -L / 2],
        [0.006, 0, -L / 2],
        [-0.009, 0.004, -L / 2 + 0.1],
        [0.009, 0.004, -L / 2 + 0.1],
        [-hd / 2, 0, L / 2 - 0.01],
        [hd / 2, 0, L / 2 - 0.01],
        [0, ht, L / 2 - hd * 0.4],
        [-0.004, 0, L / 2],
        [0.004, 0, L / 2],
        [0, 0.004, -L / 2 + 0.01],
      ];
      const p = b.hull("p", "steel", "steel_brushed", pts, [0, 0, 0], { tess: 0, mass: kind === "spoon" ? 0.05 : 0.045 });
      b.tag(p, "loose");
    });
  };
  const xs = [-w / 2 + t + cw / 2, -w / 2 + t + 1.5 * cw, -w / 2 + t + 2.5 * cw];
  piece("fork0", xs[0] - 0.02, 0, "fork");
  piece("fork1", xs[0] + 0.02, 0.005, "fork");
  piece("knife0", xs[1] - 0.015, 0, "knife");
  piece("knife1", xs[1] + 0.015, -0.005, "knife");
  piece("spoon0", xs[2] - 0.02, 0, "spoon");
  piece("spoon1", xs[2] + 0.022, 0.004, "spoon");
  return finish(b);
}

export type DishSurf = SurfaceName;
