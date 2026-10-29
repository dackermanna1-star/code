// Soft goods: mattress (foam core in ticking + quilted pillow top), duvet (quilted slab, folded
// hem, side drapes hanging over the mattress edges), bed pillows (feather fill), folded and
// crumpled clothes. All soft parts carry `stuffing` features so sharp tools burst them.
// Origins: mattress / pillow / clothes at the centre of their underside; the duvet at the centre
// of the main slab's underside (its drapes hang BELOW the origin, over the mattress sides).
// PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { finish, mk, softBlock, softSlab, PAL, type BaseOpts } from "./common.ts";

// ------------------------------------------------------------------ mattress

export interface MattressOpts extends BaseOpts {
  w?: number;
  l?: number;
  /** Total height incl. the pillow top (m). */
  h?: number;
  /** Total mass (kg); default ≈ 32.5 kg/m³ of the envelope (queen ≈ 26 kg). */
  kg?: number;
  tint?: number;
}

/** Pillow-top thickness (m). */
const TOP_H = 0.05;

export function mattressDims(o: MattressOpts = {}): { w: number; l: number; h: number } {
  return { w: o.w ?? 1.6, l: o.l ?? 2.0, h: o.h ?? 0.25 };
}

export function buildMattress(o: MattressOpts = {}): AssemblyDef {
  const { w, l, h } = mattressDims(o);
  const b = mk("mattress", w >= 1.55 ? "Queen Mattress" : "Double Mattress", "soft", w >= 1.55 ? 700 : 450, o);
  const kg = o.kg ?? w * l * h * 32.5;
  const tint = o.tint ?? 0xf3f0ea;
  const coreH = h - TOP_H;
  // high-density foam core in a woven ticking cover (one soft part)
  const core = softSlab(b, "core", "foam", "fabric_cotton", [w, coreH, l], 0.025, [0, coreH / 2, 0], { tint, mass: kg * 0.8 });
  // quilted pillow top (fibre batting), slightly inset
  const top = softSlab(b, "pillow_top", "fabric", "fabric_cotton", [w - 0.02, TOP_H, l - 0.02], 0.03, [0, coreH + TOP_H / 2, 0], { tint: 0xfbfaf6, mass: kg * 0.2 });
  b.bond(top, core, "fused", { strength: 80 }); // stitched border tape
  b.stuffing(core, "foam");
  b.stuffing(top, "fiber");
  return finish(b, o);
}

// ------------------------------------------------------------------ duvet

export interface DuvetOpts extends BaseOpts {
  /** Width of the main slab = mattress width + 2 × overhang (m). */
  w?: number;
  /** Length of the main slab (m). */
  l?: number;
  /** Slab thickness (m). */
  t?: number;
  /** Drape depth below the mattress top (m); 0 = no drapes. */
  drop?: number;
  /** Folded-back hem length at the head end (m); 0 = none. */
  fold?: number;
  tint?: number;
  kg?: number;
  surf?: SurfaceName;
}

/** Thickness of the drape panels (m). */
export const DRAPE_T = 0.025;

export function buildDuvet(o: DuvetOpts = {}): AssemblyDef {
  const w = o.w ?? 1.67,
    l = o.l ?? 1.45,
    t = o.t ?? 0.055;
  const drop = o.drop ?? 0.19;
  const fold = o.fold ?? 0.28;
  const tint = o.tint ?? PAL.duvetSage;
  const surf = o.surf ?? "fabric_cotton";
  const kg = o.kg ?? 2.2 * (w * l) / (1.67 * 1.45);
  const b = mk("duvet", "Duvet", "soft", 120, o);
  // main quilted slab (origin at the centre of its underside; the head end is -Z)
  const area = w * l + (fold > 0 ? w * fold : 0) + (drop > 0 ? 2 * drop * (l - 0.04) : 0);
  const main = softSlab(b, "main", "fabric", surf, [w, t, l], 0.02, [0, t / 2, 0], { tint, mass: (kg * w * l) / area });
  b.stuffing(main, "feathers");
  if (fold > 0) {
    const ft = t * 0.75;
    // the folded-back hem lies flat on the slab at its head end (seam stitched)
    const hem = softSlab(b, "hem", "fabric", surf, [w, ft, fold], 0.02, [0, t + ft / 2, -l / 2 + fold / 2], { tint: 0xf4f1ea, mass: (kg * w * fold) / area });
    b.bond(hem, main, "fused", { strength: 30 });
    b.stuffing(hem, "feathers");
  }
  if (drop > 0) {
    for (const sx of [-1, 1]) {
      const nm = sx < 0 ? "drape_l" : "drape_r";
      // hangs straight down from under the slab's chamfered edge (its top tucks 6 mm up against
      // the chamfer, so the sewn edge really joins the two), outside the mattress
      const top = 0.006;
      const dh = drop + top;
      const d = softSlab(b, nm, "fabric", surf, [DRAPE_T, dh, l - 0.04], 0.008, [sx * (w / 2 - DRAPE_T / 2), top - dh / 2, 0], {
        tint,
        mass: (kg * drop * (l - 0.04)) / area,
      });
      b.bond(d, main, "fused", { strength: 25 });
      b.stuffing(d, "feathers");
    }
  }
  return finish(b, o);
}

// ------------------------------------------------------------------ pillows

export interface PillowOpts extends BaseOpts {
  /** [w, h, d] (m): sleeping pillow 0.7 × 0.14 × 0.5, decorative 0.45 × 0.15 × 0.45. */
  size?: [number, number, number];
  kind?: "sleep" | "deco";
  tint?: number;
  fill?: "feathers" | "fiber";
}

export function buildBedPillow(o: PillowOpts = {}): AssemblyDef {
  const deco = o.kind === "deco";
  const size = o.size ?? (deco ? [0.45, 0.15, 0.45] : [0.7, 0.14, 0.5]);
  const b = mk(deco ? "decoPillow" : "bedPillow", deco ? "Decorative Pillow" : "Bed Pillow", "soft", deco ? 25 : 40, o);
  const vol = size[0] * size[1] * size[2];
  const kg = deco ? Math.max(0.3, vol * 16) : Math.max(0.5, vol * 17); // ≈ 0.85 kg feather pillow
  const p = b.pillow("pillow", "fabric", deco ? "fabric_upholstery" : "fabric_cotton", size, deco ? 0.45 : 0.55, [0, size[1] / 2, 0], {
    tint: o.tint ?? (deco ? 0x7d8f74 : 0xf6f4ee),
    mass: kg,
  });
  b.stuffing(p, o.fill ?? "feathers");
  return finish(b, o);
}

// ------------------------------------------------------------------ clothes

export interface ClothesOpts extends BaseOpts {
  /** folded: neat stack item (shirt/sweater/towel); crumpled: laundry lump. */
  style?: "folded" | "crumpled";
  /** [w, h, d] (m). */
  size?: [number, number, number];
  tint?: number;
  kg?: number;
}

const CLOTH_TINTS = [0x41597a, 0xb34a3c, 0xe8e2d4, 0x5d6b4e, 0x2c2c30, 0xc9a66b, 0x8a5a83, 0x9db7c9];

export function buildClothes(o: ClothesOpts = {}): AssemblyDef {
  const folded = (o.style ?? "folded") === "folded";
  const size = o.size ?? (folded ? [0.3, 0.06, 0.25] : [0.34, 0.12, 0.26]);
  const b = mk(folded ? "foldedClothes" : "laundryPile", folded ? "Folded Clothes" : "Laundry", "soft", folded ? 30 : 15, o);
  const tint = o.tint ?? CLOTH_TINTS[Math.abs(Math.floor(o.seed ?? 0)) % CLOTH_TINTS.length];
  const kg = o.kg ?? (folded ? 0.35 : 0.45);
  // folded stacks get a flat-topped slab (they are stacked); laundry is a crumpled lump
  const p = folded
    ? softSlab(b, "cloth", "fabric", "fabric_cotton", size, 0.015, [0, size[1] / 2, 0], { tint, mass: kg })
    : softBlock(b, "cloth", "fabric", "fabric_upholstery", size, 0.75, [0, size[1] / 2, 0], { tint, mass: kg }, 4);
  b.stuffing(p, "fiber");
  return finish(b, o);
}
