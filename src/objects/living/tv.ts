// 55" LED flat-screen TV on a pedestal stand, built for destruction like the real layer stack:
//  * 1.6 mm front glass (shatters first, radial web) over a 1.2 mm LCD cell (`screen` feature,
//    lcd material → spiderweb cracks, glitch, death) over a 2 mm acrylic diffuser,
//  * a steel middle frame (two side rails) and a 0.5 mm steel backlight chassis (dents, folds)
//    carrying three aluminium LED strips on the front and the power + main boards (PCBs with
//    soldered parts, `sparks`) and two speaker modules on the back,
//  * a mitred plastic bezel that doubles as the side walls, clipped to a thin plastic back cover,
//  * an aluminium pedestal: neck bolted through the back cover, base plate bolted to the neck.
// Knock it off the console and the glass/LCD shatter on impact, the cover cracks open and the
// boards spark; club it and the bezel clips pop and the chassis dents.
//
// Frame: origin at the centre of the stand's base plate (rests on y = 0), screen faces +Z.
// Panel 1.235 × 0.715 × 0.055 m (diagonal 55"), overall height ~0.79 m, ~17 kg, ~30 parts.

import { Builder } from "../lib/builder.ts";
import { frameBars, pcb } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

export interface TvOpts {
  /** Bezel/back colour. */
  tint?: number;
  /** Screen initially on. */
  on?: boolean;
  seed?: number;
}

/** Overall dimensions (m) of the default TV (for placement). */
export const TV_DIMS = { w: 1.235, h: 0.715, depth: 0.055, panelBottom: 0.075, baseW: 0.38, baseD: 0.24 } as const;

export function buildTv(o: TvOpts = {}): AssemblyDef {
  const b = new Builder("tv55", '55" LED TV', "electronics", 650, o.seed);
  const tint = o.tint ?? 0x16171a;
  const { w: W, h: H, depth: DP, panelBottom: yb } = TV_DIMS;
  const zf = 0.04,
    zb = zf - DP;
  const yc = yb + H / 2;

  // ---- bezel (side walls of the shell)
  const bezel = frameBars(b, "bezel", { w: W, h: H, bar: { top: 0.008, left: 0.008, right: 0.008, bottom: 0.016 }, depth: DP, mat: "plastic", surf: "plastic", tint }, [0, yc, zb]);
  const { x0, x1, y0, y1 } = bezel.inner;
  const iw = x1 - x0,
    ih = y1 - y0;
  const cx = (x0 + x1) / 2,
    cy = yc + (y0 + y1) / 2;
  const bars = bezel.all;
  const edge = { px: { surf: "glass_edge" as const }, nx: { surf: "glass_edge" as const }, py: { surf: "glass_edge" as const }, ny: { surf: "glass_edge" as const } };

  // ---- optical stack (front to back)
  const glass = b.box("glass", "glass", "glass", [iw, ih, 0.0014], [cx, cy, zf - 0.0007], { tint: 0xc9d4d2, faces: edge });
  const lcd = b.box("lcd", "lcd", "lcd_off", [iw, ih, 0.0012], [cx, cy, zf - 0.002], {
    faces: { px: { surf: "plastic", tint }, nx: { surf: "plastic", tint }, py: { surf: "plastic", tint }, ny: { surf: "plastic", tint } },
  });
  const diffuser = b.box("diffuser", "acrylic", "acrylic_white", [iw, ih, 0.002], [cx, cy, zf - 0.0038], { tint: 0xf2f2ef });
  const zCh = zf - 0.0198; // chassis front face
  const railZ0 = zCh,
    railZ1 = zf - 0.0048;
  const rail = (nm: string, x: number): string => b.box(nm, "steel", "metal_raw", [0.01, ih, railZ1 - railZ0], [x, cy, (railZ0 + railZ1) / 2], { tint: 0xb8bcc0, tess: 0 });
  const railL = rail("rail_l", x0 + 0.005);
  const railR = rail("rail_r", x1 - 0.005);
  const chassis = b.box("chassis", "steelSheet", "metal_raw", [iw, ih, 0.0005], [cx, cy, zCh - 0.00025], { tint: 0xc4c8cc });
  const strips: string[] = [];
  for (let k = 0; k < 3; k++) {
    const y = cy + (k - 1) * ih * 0.28;
    strips.push(b.box(`led${k}`, "aluminum", "aluminum", [iw - 0.03, 0.012, 0.002], [cx, y, zCh + 0.001], { tess: 0 }));
  }
  const back = b.box("back", "plastic", "plastic", [iw, ih, 0.0015], [cx, cy, zb + 0.00075], { tint });

  // ---- electronics on the back of the chassis (components face the back cover)
  const zMount = zCh - 0.0005; // chassis back face
  const power = pcb(
    b,
    "psu",
    {
      w: 0.24,
      h: 0.15,
      components: [
        { kind: "transformer", x: -0.07, y: 0.02 },
        { kind: "cap", x: 0.0, y: 0.04, size: [0.018, 0.018, 0.025] },
        { kind: "cap", x: 0.04, y: 0.04 },
        { kind: "heatsink", x: 0.07, y: -0.03 },
        { kind: "connector", x: -0.05, y: -0.055 },
      ],
      mount: { to: chassis, screws: 4, each: 12 },
      sparks: 0.8,
    },
    [cx - 0.3, cy - 0.12, zMount - 0.0016],
    [0, 180, 0],
  );
  const main = pcb(
    b,
    "main",
    {
      w: 0.2,
      h: 0.12,
      components: [
        { kind: "heatsink", x: 0.02, y: 0.01, size: [0.03, 0.03, 0.012] }, // over the SoC
        { kind: "cap", x: 0.07, y: -0.03 },
        { kind: "chipSmall", x: -0.06, y: 0.035 },
        { kind: "connector", x: -0.05, y: -0.045 },
      ],
      mount: { to: chassis, screws: 4, each: 12 },
      sparks: 0.7,
    },
    [cx + 0.28, cy - 0.13, zMount - 0.0016],
    [0, 180, 0],
  );
  const speakers: string[] = [];
  for (const sx of [-1, 1]) {
    const sp = b.box(sx < 0 ? "spk_l" : "spk_r", "plastic", "plastic", [0.12, 0.03, 0.02], [cx + sx * 0.45, y0 + yc + 0.03, zMount - 0.01], { tint: 0x222222 });
    b.screw(sp, chassis, 2, 12);
    speakers.push(sp);
  }

  // ---- joinery
  for (const bar of bars) {
    b.clip(glass, bar, 4);
    b.clip(lcd, bar, 3);
    b.clip(back, bar, 8);
    b.screw(chassis, bar, 2, 15);
  }
  b.glue(glass, lcd, 15);
  b.glue(lcd, diffuser, 8);
  for (const r of [railL, railR]) {
    b.clip(diffuser, r, 6);
    b.screw(r, chassis, 3, 20);
  }
  for (const s of strips) b.glue(s, chassis, 8);
  b.screen(lcd, "tv", { on: o.on ?? true, mains: true });
  b.sparks(chassis, 0.3);

  // ---- pedestal stand
  const neckTop = yb + 0.15;
  const neck = b.box("neck", "aluminum", "aluminum", [0.06, neckTop - 0.008, 0.02], [0, 0.008 + (neckTop - 0.008) / 2, zb - 0.01], { tint: 0x3a3b3e, tess: 0 });
  const base = b.box("base", "aluminum", "aluminum", [TV_DIMS.baseW, 0.008, TV_DIMS.baseD], [0, 0.004, 0], { tint: 0x3a3b3e, tess: 0 });
  b.bolt(neck, back, 160);
  b.bolt(neck, base, 220);
  void power;
  void main;
  return b.build();
}
