// Laptop: aluminium bottom shell + side walls + top deck, keyboard and glass touchpad on the deck,
// battery pack, mainboard (sparks) and cooling fan inside, rubber feet; the lid (aluminium back
// cover, LCD with `screen`, plastic bezel bars) rides on two friction hinges at the back edge,
// built open at 115°. Rip the lid off, crack the screen, stomp the deck.
// Local frame: origin at the centre of the underside, touchpad side (front) at +Z. PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import { frameBarPoints } from "../lib/kit.ts";
import { boxR, finish, mk, type BaseOpts } from "./common.ts";

export interface LaptopOpts extends BaseOpts {
  tint?: number;
  on?: boolean;
  /** Opening angle of the lid (degrees from closed), default 115. */
  open?: number;
}

export const LAPTOP = { w: 0.31, d: 0.215, baseH: 0.017 } as const;

export function buildLaptop(o: LaptopOpts = {}): AssemblyDef {
  const b = mk("laptop", "Laptop", "electronics", 1300, o);
  const { w, d } = LAPTOP;
  const tint = o.tint ?? 0xb9bcc2;
  const A = { tint, tess: 0 };
  const foot = 0.002,
    shellT = 0.0015,
    deckT = 0.0015,
    wallT = 0.0015;
  const y0 = foot,
    y1 = y0 + shellT; // bottom shell
  const yD0 = 0.0145,
    yD1 = yD0 + deckT; // top deck
  const bottom = boxR(b, "bottom", "aluminum", "aluminum", [-w / 2, w / 2], [y0, y1], [-d / 2, d / 2], A);
  const wf = boxR(b, "wall_f", "aluminum", "aluminum", [-w / 2, w / 2], [y1, yD0], [d / 2 - wallT, d / 2], A);
  const wb = boxR(b, "wall_b", "aluminum", "aluminum", [-w / 2, w / 2], [y1, yD0], [-d / 2, -d / 2 + wallT], A);
  const wl = boxR(b, "wall_l", "aluminum", "aluminum", [-w / 2, -w / 2 + wallT], [y1, yD0], [-d / 2 + wallT, d / 2 - wallT], A);
  const wr = boxR(b, "wall_r", "aluminum", "aluminum", [w / 2 - wallT, w / 2], [y1, yD0], [-d / 2 + wallT, d / 2 - wallT], A);
  for (const p of [wf, wb, wl, wr]) b.screw(p, bottom, 3, 8);
  const deck = boxR(b, "deck", "aluminum", "aluminum", [-w / 2, w / 2], [yD0, yD1], [-d / 2, d / 2], A);
  for (const p of [wf, wb, wl, wr]) b.clip(deck, p, 10);
  const kb = boxR(b, "keyboard", "plastic", "keycaps", [-0.135, 0.135], [yD1, yD1 + 0.0015], [-0.088, 0.012], { tint: 0x2a2b2e });
  b.clip(kb, deck, 10);
  const pad = boxR(b, "touchpad", "glass", "plastic_glossy", [-0.055, 0.055], [yD1, yD1 + 0.001], [0.03, 0.098], { tint: 0x9a9da3 });
  b.glue(pad, deck, 6);
  // internals between shell and deck
  const batt = boxR(b, "battery", "plastic", "metal_black", [-0.12, 0.12], [y1, y1 + 0.007], [0.01, 0.095], { mass: 0.3, tint: 0x2f3033 });
  b.screw(batt, bottom, 4, 6);
  // the board lies on the shell (insulating Mylar sheet between them, not modelled)
  const board = boxR(b, "mainboard", "pcb", "pcb", [-0.1, 0.06], [y1, y1 + 0.0016], [-0.098, -0.008], { tint: 0x1f3326 });
  b.screw(board, bottom, 4, 5);
  b.sparks(board, 0.8);
  const fan = b.cyl("fan", "plastic", "plastic", 0.028, 0.007, [0.105, y1 + 0.0035, -0.07], { segments: 12, tint: 0x222222, mass: 0.02 });
  b.screw(fan, bottom, 2, 4);
  for (const [sx, nm] of [
    [-1, "l"],
    [1, "r"],
  ] as Array<[number, string]>) {
    const f = boxR(b, `foot_${nm}`, "rubber", "rubber", [sx * 0.13 - 0.01, sx * 0.13 + 0.01], [0, foot], [-d / 2 + 0.012, d / 2 - 0.012], {});
    b.glue(f, bottom, 3);
  }
  // ---- lid on two friction hinges at the back edge (built open)
  const open = o.open ?? 115;
  const hingeY = yD1 + 0.001,
    hingeZ = -d / 2 + 0.003;
  const lidW = w - 0.004,
    lidH = d - 0.006;
  const lidParts: string[] = [];
  let lidBack = "";
  b.group([0, hingeY, hingeZ], [-(open - 90), 0, 0], "lid_", () => {
    // local frame: lid standing up from the hinge (+Y), screen facing +Z
    const yl0 = 0.004;
    lidBack = boxR(b, "back", "aluminum", "aluminum", [-lidW / 2, lidW / 2], [yl0, yl0 + lidH], [-0.006, -0.004], A);
    const bz = 0.008;
    const bars = frameBarPoints(lidW, lidH, bz, -0.004, -0.0005);
    const cy = yl0 + lidH / 2;
    const bt = b.hull("bezel_t", "plastic", "plastic", bars.top, [0, cy, 0], { tint: 0x111111 });
    const bb = b.hull("bezel_b", "plastic", "plastic", bars.bottom, [0, cy, 0], { tint: 0x111111 });
    const bl = b.hull("bezel_l", "plastic", "plastic", bars.left, [0, cy, 0], { tint: 0x111111 });
    const br = b.hull("bezel_r", "plastic", "plastic", bars.right, [0, cy, 0], { tint: 0x111111 });
    const iw = lidW - 2 * bz,
      ih = lidH - 2 * bz;
    const lcd = boxR(b, "lcd", "lcd", "lcd_off", [-iw / 2, iw / 2], [cy - ih / 2, cy + ih / 2], [-0.004, -0.001], {
      faces: { px: { surf: "plastic", tint: 0x111111 }, nx: { surf: "plastic", tint: 0x111111 }, py: { surf: "plastic", tint: 0x111111 }, ny: { surf: "plastic", tint: 0x111111 } },
    });
    for (const bar of [bt, bb, bl, br]) {
      b.clip(bar, lidBack, 5);
      b.clip(lcd, bar, 3);
    }
    b.glue(lcd, lidBack, 8);
    b.screen(lcd, "laptop", { on: o.on ?? true, mains: false });
    lidParts.push(lidBack, lcd, bt, bb, bl, br);
  });
  // closing rotates the top of the lid towards +Z (positive about +X)
  for (const x of [-0.12, 0.12]) {
    b.hinge(lidBack, wb, { pivots: [[x, hingeY, hingeZ]], axis: [1, 0, 0], min: -20, max: open - 3, friction: 1.5, strength: 35, group: "lid" });
  }
  return finish(b, o);
}
