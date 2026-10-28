// Top-freezer refrigerator (0.84 × 1.78 × 0.76 m incl. doors, ~85 kg):
//  * 0.6 mm steel wrapper (sides, top, back) on a 1 mm base pan with feet/rollers; polyurethane
//    foam walls (soft, they absorb blows) behind 3 mm plastic liners that crack;
//  * fresh-food compartment: three tempered-glass shelves on liner ribs (friction — knock the
//    fridge over and they slide out and dice), two crisper drawers on sliders, a lamp (bulb part —
//    no light feature: the room switch would light it with the door shut), thermostat housing;
//  * freezer: wire shelf, ice tray; foam divider mullion;
//  * doors hinged on the right (local -X) with magnetic gaskets (latch 10 J): stainless skin, foam
//    core, liner, door dikes and bins (items rest in them), vertical bar handles;
//  * machine compartment at the back bottom: ~9 kg compressor (`hum` "fridge.hum", sparks from the
//    relay box) and a steel condenser coil.
// Origin: floor centre of the footprint (body + doors), front +Z. PURE MODULE (no Babylon).

import { Builder } from "../lib/builder.ts";
import { barHandle, hingeAxis } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { bondEachTouching, finish } from "./lib.ts";

export interface FridgeOpts {
  finish?: "stainless" | "white" | "black";
  seed?: number;
}

export const FRIDGE_DIM = {
  w: 0.84,
  h: 1.78,
  zBack: -0.38,
  bodyFront: 0.32,
  doorFront: 0.38,
  /** Shelf top faces and liner interior (fridge frame). */
  shelves: [0.484, 0.784, 1.004] as const,
  crisperTop: 0.47,
  linerX: 0.36,
  linerBackZ: -0.33,
  freezerFloor: 1.26,
  /** Door bin floors (top faces) on the fridge door, freezer door; bin depth range (z). */
  fridgeBins: [0.42, 0.75, 1.05] as const,
  freezerBins: [1.42] as const,
} as const;

export function buildFridge(o: FridgeOpts = {}): AssemblyDef {
  const b = new Builder("fridge", "Refrigerator", "appliance", 1400, o.seed);
  const D = FRIDGE_DIM;
  const W = D.w,
    hw = W / 2,
    ZB = D.zBack,
    ZF = D.bodyFront;
  const st = 0.0006;
  const skin = o.finish === "white" ? { surf: "metal_painted" as const, tint: 0xf3f2ee } : o.finish === "black" ? { surf: "metal_painted" as const, tint: 0x232427 } : { surf: "steel_brushed" as const, tint: 0xffffff };
  const sideFin = o.finish === "white" ? skin : { surf: "metal_painted" as const, tint: 0x8e9194 };
  const liner = { surf: "plastic_glossy" as const, tint: 0xf4f4f2 };
  // ------------------------------------------------------------------ cabinet
  const feet: string[] = [];
  [
    [-hw + 0.05, ZB + 0.06],
    [hw - 0.05, ZB + 0.06],
    [-hw + 0.05, ZF - 0.05],
    [hw - 0.05, ZF - 0.05],
  ].forEach(([x, z], k) => feet.push(b.cyl(`foot${k}`, "plastic", "plastic", 0.018, 0.02, [x, 0.01, z], { segments: 8, tint: 0x222222 })));
  const pan = b.box("basepan", "steelSheet", "metal_raw", [W, 0.001, ZF - ZB], [0, 0.0205, (ZB + ZF) / 2], { tint: 0x8d8e8b });
  for (const f of feet) b.screw(f, pan, 1, 40);
  const H = D.h;
  const sideL = b.box("side_l", "steelSheet", sideFin.surf, [st, H - 0.021, ZF - ZB], [-hw + st / 2, (0.021 + H) / 2, (ZB + ZF) / 2], { tint: sideFin.tint });
  const sideR = b.box("side_r", "steelSheet", sideFin.surf, [st, H - 0.021, ZF - ZB], [hw - st / 2, (0.021 + H) / 2, (ZB + ZF) / 2], { tint: sideFin.tint });
  const top = b.box("top", "steelSheet", sideFin.surf, [W - 2 * st, st, ZF - ZB], [0, H - st / 2, (ZB + ZF) / 2], { tint: sideFin.tint });
  const back = b.box("back", "steelSheet", "metal_raw", [W - 2 * st, H - 0.021 - st - 0.24, 0.0005], [0, (0.261 + H - st) / 2, ZB + 0.00025], { tint: 0x5a5c5e });
  b.weld(sideL, pan, 100);
  b.weld(sideR, pan, 100);
  b.weld(top, sideL, 120);
  b.weld(top, sideR, 120);
  b.weld(back, sideL, 60);
  b.weld(back, sideR, 60);
  b.weld(back, top, 60);
  // toe grille
  const grille = b.box("grille", "plastic", "vent_grille", [W - 2 * st, 0.08, 0.02], [0, 0.021 + 0.04, ZF - 0.01], { tint: 0x2a2b2d, mass: 0.3 });
  b.clip(grille, sideL, 6);
  b.clip(grille, sideR, 6);
  // ------------------------------------------------------------------ insulation + liners
  const LX = D.linerX,
    LZ = D.linerBackZ;
  const lt = 0.003;
  const yF0 = 0.24,
    yF1 = 1.2,
    yZ0 = D.freezerFloor,
    yZ1 = 1.72;
  const foamOpt = { tint: 0xe9e4c8 };
  const foamL = b.box("foam_l", "foam", "foam", [hw - st - LX - lt, H - st - 0.1, ZF - LZ - 0.0], [-(LX + lt + (hw - st - LX - lt) / 2), (0.1 + H - st) / 2, (LZ + ZF) / 2], foamOpt);
  const foamR = b.box("foam_r", "foam", "foam", [hw - st - LX - lt, H - st - 0.1, ZF - LZ - 0.0], [LX + lt + (hw - st - LX - lt) / 2, (0.1 + H - st) / 2, (LZ + ZF) / 2], foamOpt);
  const foamK = b.box("foam_k", "foam", "foam", [2 * (LX + lt), yZ1 + lt - yF0 + lt, LZ - lt - (ZB + 0.0005)], [0, (yF0 - lt + yZ1 + lt) / 2, (LZ - lt + ZB + 0.0005) / 2], foamOpt);
  const foamT = b.box("foam_t", "foam", "foam", [2 * (LX + lt), H - st - (yZ1 + lt), ZF - (ZB + 0.0005)], [0, (yZ1 + lt + H - st) / 2, (ZB + 0.0005 + ZF) / 2], foamOpt);
  const foamB = b.box("foam_b", "foam", "foam", [2 * (LX + lt), yF0 - lt - 0.1, ZF - (-0.18)], [0, (0.1 + yF0 - lt) / 2, (-0.18 + ZF) / 2], foamOpt);
  const div = b.box("divider", "foam", "plastic_glossy", [2 * LX, yZ0 - yF1, ZF - LZ], [0, (yF1 + yZ0) / 2, (LZ + ZF) / 2], { tint: 0xf4f4f2 });
  const lin = (nm: string, size: [number, number, number], pos: [number, number, number]): string => b.box(nm, "plastic", liner.surf, size, pos, { tint: liner.tint });
  const fl = lin("liner_l", [lt, yF1 - yF0, ZF - LZ], [-LX - lt / 2, (yF0 + yF1) / 2, (LZ + ZF) / 2]);
  const fr = lin("liner_r", [lt, yF1 - yF0, ZF - LZ], [LX + lt / 2, (yF0 + yF1) / 2, (LZ + ZF) / 2]);
  const fk = lin("liner_k", [2 * LX, yF1 - yF0, lt], [0, (yF0 + yF1) / 2, LZ - lt / 2]);
  const ff = lin("liner_f", [2 * LX + 2 * lt, lt, ZF - LZ + lt], [0, yF0 - lt / 2, (LZ - lt + ZF) / 2]);
  const zl = lin("fz_liner_l", [lt, yZ1 - yZ0, ZF - LZ], [-LX - lt / 2, (yZ0 + yZ1) / 2, (LZ + ZF) / 2]);
  const zr = lin("fz_liner_r", [lt, yZ1 - yZ0, ZF - LZ], [LX + lt / 2, (yZ0 + yZ1) / 2, (LZ + ZF) / 2]);
  const zk = lin("fz_liner_k", [2 * LX, yZ1 - yZ0, lt], [0, (yZ0 + yZ1) / 2, LZ - lt / 2]);
  const zt = lin("fz_liner_t", [2 * LX + 2 * lt, lt, ZF - LZ + lt], [0, yZ1 + lt / 2, (LZ - lt + ZF) / 2]);
  // foamed in place: everything touching is bonded (foam is the glue)
  const shellParts = [sideL, sideR, top, back, pan, foamL, foamR, foamK, foamT, foamB, div, fl, fr, fk, ff, zl, zr, zk, zt];
  b.autoBond("glue", (_a, _c, ct) => Math.max(15, Math.min(160, ct.area * 900)), 0.001, (a, c) => shellParts.includes(a) && shellParts.includes(c) && !(a.startsWith("side") && c.startsWith("side")));
  // ------------------------------------------------------------------ interior
  const shelves: string[] = [];
  D.shelves.forEach((y, k) => {
    const s = b.box(`shelf${k}`, "temperedGlass", "glass", [2 * LX - 0.002, 0.004, 0.55], [0, y - 0.002, LZ + 0.003 + 0.275], {
      faces: { px: { surf: "glass_edge" }, nx: { surf: "glass_edge" }, pz: { surf: "glass_edge" }, nz: { surf: "glass_edge" } },
    });
    b.friction(s, fl, 4);
    b.friction(s, fr, 4);
    shelves.push(s);
  });
  // crisper drawers (two, side by side, sliding on the liner floor)
  const cr = (k: number, x0: number, x1: number): void => {
    const w = x1 - x0,
      xc = (x0 + x1) / 2;
    const z0 = LZ + 0.01,
      z1 = 0.24;
    const y0 = yF0,
      y1 = D.crisperTop - 0.004;
    const pt = 0.003;
    const bot = b.box(`crisper${k}_bot`, "plastic", "plastic", [w, pt, z1 - z0], [xc, y0 + pt / 2, (z0 + z1) / 2], { tint: 0xe8ecee });
    const fr2 = b.box(`crisper${k}_front`, "plastic", "glass_frosted", [w, y1 - y0 - pt, pt], [xc, (y0 + pt + y1) / 2, z1 - pt / 2], { tint: 0xdfe8ea });
    const l = b.box(`crisper${k}_l`, "plastic", "plastic", [pt, y1 - y0 - pt, z1 - z0 - pt], [x0 + pt / 2, (y0 + pt + y1) / 2, (z0 + z1 - pt) / 2], { tint: 0xe8ecee });
    const r = b.box(`crisper${k}_r`, "plastic", "plastic", [pt, y1 - y0 - pt, z1 - z0 - pt], [x1 - pt / 2, (y0 + pt + y1) / 2, (z0 + z1 - pt) / 2], { tint: 0xe8ecee });
    const k2 = b.box(`crisper${k}_k`, "plastic", "plastic", [w - 2 * pt, y1 - y0 - pt, pt], [xc, (y0 + pt + y1) / 2, z0 + pt / 2], { tint: 0xe8ecee });
    b.autoBond("fused", undefined, 0.0004, (a, c) => a.startsWith(`crisper${k}_`) && c.startsWith(`crisper${k}_`));
    b.slider(bot, ff, { pivots: [[xc, y0, (z0 + z1) / 2]], axis: [0, 0, 1], min: 0, max: 0.3, strength: 25, friction: 0.3 });
    void fr2;
    void l;
    void r;
    void k2;
  };
  cr(0, -LX + 0.001, -0.002);
  cr(1, 0.002, LX - 0.001);
  const lamp = b.cyl("lamp", "glass", "bulb_off", 0.015, 0.03, [0.2, yF1 - 0.015, 0.1], { segments: 8 });
  b.clip(lamp, div, 4);
  const thermo = b.box("thermostat", "plastic", "plastic", [0.16, 0.05, 0.12], [-0.12, yF1 - 0.025, 0.12], { tint: 0xe3e4e5, mass: 0.25 });
  b.screw(thermo, div, 2, 15);
  const wire = b.box("fz_shelf", "steel", "vent_grille", [2 * LX - 0.002, 0.006, 0.5], [0, 1.49, LZ + 0.003 + 0.25], { mass: 0.6, tint: 0xe6e6e6, tess: 0 });
  b.friction(wire, zl, 4);
  b.friction(wire, zr, 4);
  const ice = b.box("ice_tray", "plastic", "plastic", [0.12, 0.035, 0.28], [-0.18, yZ0 + 0.0175, -0.1], { tint: 0xdfeaf0, mass: 0.15 });
  b.friction(ice, div, 2);
  // ------------------------------------------------------------------ machine compartment
  const comp = b.cyl("compressor", "steel", "metal_black", 0.075, 0.16, [0.17, 0.021 + 0.08, -0.29], { segments: 10, mass: 9, tint: 0x2e3033 });
  b.bolt(comp, pan, 120);
  b.hum(comp, "fridge.hum", true);
  const relay = b.box("relay_box", "plastic", "plastic", [0.06, 0.05, 0.04], [0.17, 0.205, -0.29], { tint: 0x1e1e1e, mass: 0.1 });
  b.clip(relay, comp, 6);
  b.sparks(relay, 0.7);
  const coil = b.box("condenser", "steel", "vent_grille", [0.34, 0.15, 0.06], [-0.18, 0.021 + 0.075, -0.3], { mass: 2.2, tint: 0x2a2a2a, tess: 0 });
  b.screw(coil, pan, 2, 30);
  const tube = b.tube("refrig_line", "copper", "copper", [[0.095, 0.12, -0.29], [-0.01, 0.12, -0.29]], 0.004, { kgPerM: 0.12, sides: 6, tess: 0 });
  b.bond(tube[0], comp, "weld", { strength: 30 });
  b.bond(tube[0], coil, "weld", { strength: 30 });
  // ------------------------------------------------------------------ doors
  const DZ0 = ZF,
    DZ1 = D.doorFront;
  const axis = hingeAxis([1, 0, 0], [0, 0, 1]);
  const door = (nm: string, y0: number, y1: number, bins: readonly number[], handleLen: number, latchTo: string): void => {
    const dw = W;
    const skinP = b.box(`${nm}_skin`, "steelSheet", skin.surf, [dw, y1 - y0, st], [0, (y0 + y1) / 2, DZ1 - st / 2], { tint: skin.tint });
    const core = b.box(`${nm}_foam`, "foam", skin.surf, [dw - 0.002, y1 - y0 - 0.002, 0.042], [0, (y0 + y1) / 2, DZ1 - st - 0.021], { tint: skin.tint });
    const lnr = b.box(`${nm}_liner`, "plastic", liner.surf, [dw - 0.06, y1 - y0 - 0.06, 0.003], [0, (y0 + y1) / 2, DZ1 - st - 0.042 - 0.0015], { tint: liner.tint });
    const zIn = DZ1 - st - 0.042 - 0.003;
    // magnetic gasket frame (rubber) around the liner
    const gk = 0.015;
    const g1 = b.box(`${nm}_gasket_l`, "rubber", "rubber", [0.025, y1 - y0 - 0.01, gk], [-dw / 2 + 0.0175, (y0 + y1) / 2, zIn - gk / 2 + 0.003], { tint: 0xd9d9d6, mass: 0.12 });
    const g2 = b.box(`${nm}_gasket_r`, "rubber", "rubber", [0.025, y1 - y0 - 0.01, gk], [dw / 2 - 0.0175, (y0 + y1) / 2, zIn - gk / 2 + 0.003], { tint: 0xd9d9d6, mass: 0.12 });
    const g3 = b.box(`${nm}_gasket_t`, "rubber", "rubber", [dw - 0.085, 0.025, gk], [0, y1 - 0.0175, zIn - gk / 2 + 0.003], { tint: 0xd9d9d6, mass: 0.12 });
    const g4 = b.box(`${nm}_gasket_b`, "rubber", "rubber", [dw - 0.085, 0.025, gk], [0, y0 + 0.0175, zIn - gk / 2 + 0.003], { tint: 0xd9d9d6, mass: 0.12 });
    // door dikes (bins hang between them)
    const dike = 0.085;
    const dkL = b.box(`${nm}_dike_l`, "plastic", liner.surf, [0.03, y1 - y0 - 0.12, dike], [-0.33, (y0 + y1) / 2, zIn - dike / 2], { tint: liner.tint, mass: 0.35 });
    const dkR = b.box(`${nm}_dike_r`, "plastic", liner.surf, [0.03, y1 - y0 - 0.12, dike], [0.33, (y0 + y1) / 2, zIn - dike / 2], { tint: liner.tint, mass: 0.35 });
    b.glue(skinP, core, 120);
    b.glue(lnr, core, 120);
    for (const g of [g1, g2, g3, g4]) b.clip(g, lnr, 6);
    b.fuse(g1, g3, 10);
    b.fuse(g1, g4, 10);
    b.fuse(g2, g3, 10);
    b.fuse(g2, g4, 10);
    b.screw(dkL, lnr, 3, 15);
    b.screw(dkR, lnr, 3, 15);
    const bw = 0.628;
    bins.forEach((by, k) => {
      const bb = b.box(`${nm}_bin${k}_bot`, "plastic", "plastic", [bw, 0.004, dike - 0.003], [0, by - 0.002, zIn - (dike - 0.003) / 2], { tint: 0xe9eef0 });
      const bf = b.box(`${nm}_bin${k}_lip`, "plastic", "glass_frosted", [bw, 0.07, 0.003], [0, by + 0.035 - 0.004, zIn - dike + 0.0015], { tint: 0xdfe8ea });
      b.fuse(bb, bf, 20);
      b.clip(bb, dkL, 8);
      b.clip(bb, dkR, 8);
      void bf;
    });
    barHandle(b, `${nm}_handle`, { on: skinP, len: handleLen, size: 0.018, standoff: 0.045, vertical: true, mat: "steel", surf: "steel_brushed", screw: 70 }, [dw / 2 - 0.05, y0 + (y1 - y0) * (nm === "fz" ? 0.4 : 0.72), DZ1]);
    // hinges on the -X edge at the door front face
    const px = -dw / 2;
    const gid = b.hinge(skinP, sideL, { pivots: [[px, y1 - 0.02, DZ1]], axis, min: 0, max: 100, strength: 110, friction: 0.15 });
    b.hinge(skinP, sideL, { pivots: [[px, y0 + 0.02, DZ1]], axis, min: 0, max: 100, strength: 110, friction: 0.15, group: gid, latch: 10, latchPos: [dw / 2 - 0.02, (y0 + y1) / 2, DZ0], latchPart: g2, latchFixed: latchTo });
  };
  door("fr", 0.1, 1.255, D.fridgeBins, 0.6, sideR);
  door("fz", 1.265, H, D.freezerBins, 0.3, sideR);
  void bondEachTouching;
  return finish(b);
}
