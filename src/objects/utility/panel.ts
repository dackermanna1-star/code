// Apartment consumer unit / electrical panel (360 × 560 × 97 mm, surface mounted). A 1 mm steel
// enclosure screwed to the wall, two DIN rails with a 2-pole main breaker + 14 branch breakers
// clipped on (plastic, press-fit — they pop off), a copper comb bus bar feeding them, a neutral
// bar on insulators, a steel dead-front with the breaker windows, a hinged steel door with a
// latch and the circuit schedule card, and the supply/branch cables leaving through the top.
//
// The `power` feature sits on the MAIN BREAKER and on the BUS BAR: smash either (or rip the
// panel off the wall) and the whole apartment goes dark. Sparks everywhere.
//
// Wall-mounted frame: origin on the wall plane at floor level, x along the wall, +Z out of the
// wall; the box spans y ∈ [bottomY, bottomY + 0.56].

import { hingeAxis, sheetMetalBox, cable } from "../lib/kit.ts";
import { boxR, bondTouching, finish, mk, type BaseOpts } from "./helpers.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

export interface PanelOpts extends BaseOpts {
  bottomY?: number;
  tint?: number;
}

export const ELECTRICAL_PANEL = { w: 0.36, h: 0.56, d: 0.095, bottomY: 1.22 } as const;

export function buildElectricalPanel(o: PanelOpts = {}): AssemblyDef {
  const b = mk("electricalPanel", "Electrical Panel", "fixture", 600, o);
  const { w, h, d } = ELECTRICAL_PANEL;
  const y0 = o.bottomY ?? ELECTRICAL_PANEL.bottomY;
  const tint = o.tint ?? 0xe9e8e3;
  const t = 0.001;

  // ------------------------------------------------------------------ enclosure (open front)
  const box = sheetMetalBox(b, "box", { w, h, d, t, tint, faces: { front: false }, join: "weld", tess: 0.05 }, [0, y0, d / 2]);
  b.world(box.back!, "screw", 140, [0, y0 + h / 2, 0]); // four screws into wall plugs

  // ------------------------------------------------------------------ DIN rails + breakers
  const rows = [y0 + 0.36, y0 + 0.18]; // rail centre heights
  const zr0 = t,
    zr1 = t + 0.0075;
  const rails = rows.map((yr, k) => {
    const r = boxR(b, `din${k}`, "steel", "metal_raw", [-0.15, 0.15], [yr - 0.0175, yr + 0.0175], [zr0, zr1], { tess: 0, mass: 0.12 });
    b.screw(r, box.back!, 2, 25);
    return r;
  });
  const bh = 0.085,
    bd = 0.068;
  const zb0 = zr1,
    zb1 = zr1 + bd;
  const breakers: string[] = [];
  let main = "";
  // row 0: main breaker (2 modules) + 6 branch; row 1: 8 branch
  const layout: Array<{ row: number; x0: number; mods: number; main?: boolean }> = [];
  let x = -0.144;
  layout.push({ row: 0, x0: x, mods: 2, main: true });
  x += 0.036 + 0.004;
  for (let k = 0; k < 6; k++, x += 0.018) layout.push({ row: 0, x0: x, mods: 1 });
  x = -0.144;
  for (let k = 0; k < 8; k++, x += 0.018) layout.push({ row: 1, x0: x, mods: 1 });
  layout.forEach((l, k) => {
    const yr = rows[l.row];
    const bw = 0.018 * l.mods - 0.0004;
    const name = l.main ? "main_breaker" : `breaker${k}`;
    const part = boxR(b, name, "plastic", "plastic", [l.x0, l.x0 + bw], [yr - bh / 2, yr + bh / 2], [zb0, zb1], {
      tint: l.main ? 0xe23c2a : 0xf4f3ee,
      faces: { pz: { surf: "keycaps", tint: l.main ? 0xe23c2a : 0xf4f3ee } },
      mass: l.main ? 0.26 : 0.11,
    });
    b.press(part, rails[l.row], l.main ? 6 : 3);
    if (l.main) main = part;
    else breakers.push(part);
    b.sparks(part, 0.6);
  });
  // copper comb bus bar along the top of row 0, screwed into every breaker's line terminal
  const yBus = rows[0] + bh / 2;
  const bus = boxR(b, "bus_bar", "copper", "copper", [-0.144, -0.144 + 0.036 + 0.004 + 6 * 0.018], [yBus, yBus + 0.01], [zb0 + 0.02, zb0 + 0.034], { tint: 0xd08048, tess: 0 });
  b.screw(bus, main, 1, 20);
  for (const br of breakers.slice(0, 6)) b.screw(bus, br, 1, 8);
  // row 1 is fed by a jumper from the main breaker
  const jumper = cable(b, "jumper", [
    [-0.13, rows[0] - bh / 2 - 0.0008, zb0 + 0.027],
    [-0.13, rows[1] + bh / 2 + 0.0008, zb0 + 0.027],
  ], { r: 0.003, kgPerM: 0.08, sparks: 0.6 });
  bondTouching(b, jumper[0], [main], "screw", 15, 0.002);
  bondTouching(b, jumper[jumper.length - 1], breakers.slice(6), "screw", 15, 0.002);
  b.power(main);
  b.power(bus);
  b.sparks(bus, 0.9);
  // neutral bar on two insulators at the bottom
  const yN = y0 + 0.05;
  const insul: string[] = [];
  for (const sx of [-1, 1]) {
    insul.push(boxR(b, `insulator_${sx < 0 ? "l" : "r"}`, "plastic", "plastic", [sx * 0.07 - 0.008, sx * 0.07 + 0.008], [yN - 0.008, yN + 0.008], [t, t + 0.02], { tint: 0x2a2a2a, mass: 0.006 }));
    b.screw(insul[insul.length - 1], box.back!, 1, 15);
  }
  const neutral = boxR(b, "neutral_bar", "copper", "steel_brushed", [-0.09, 0.09], [yN - 0.006, yN + 0.006], [t + 0.02, t + 0.032], { tint: 0xd9b25e, tess: 0 });
  for (const i of insul) b.screw(neutral, i, 1, 20);

  // ------------------------------------------------------------------ dead-front with breaker windows
  const zf0 = zb1,
    zf1 = zb1 + 0.0012;
  const inX = w / 2 - t;
  const r0b = rows[0] - bh / 2,
    r0t = rows[0] + bh / 2,
    r1b = rows[1] - bh / 2,
    r1t = rows[1] + bh / 2;
  const xs0 = -0.146,
    xs1 = 0.146;
  const df = (n: string, xr: [number, number], yr: [number, number]) => boxR(b, `deadfront_${n}`, "steelSheet", "metal_painted", xr, yr, [zf0, zf1], { tint, tess: 0 });
  const dTop = df("top", [xs0, xs1], [r0t, y0 + h - t - 0.004]);
  const dMid = df("mid", [xs0, xs1], [r1t, r0b]);
  const dBot = df("bot", [xs0, xs1], [y0 + t + 0.004, r1b]);
  const dL = df("l", [-inX + 0.0005, xs0], [y0 + t + 0.004, y0 + h - t - 0.004]);
  const dR = df("r", [xs1, inX - 0.0005], [y0 + t + 0.004, y0 + h - t - 0.004]);
  for (const p of [dTop, dMid, dBot]) {
    b.weld(p, dL, 20);
    b.weld(p, dR, 20);
  }
  b.screw(dL, box.left!, 2, 15);
  b.screw(dR, box.right!, 2, 15);

  // ------------------------------------------------------------------ door (hinged left, latched right)
  const zd0 = d + 0.0005;
  const door = boxR(b, "door", "steelSheet", "metal_painted", [-w / 2, w / 2], [y0, y0 + h], [zd0, zd0 + 0.001], { tint, tess: 0.05 });
  const card = boxR(b, "schedule_card", "paper", "paper_printed", [-0.12, 0.12], [y0 + 0.12, y0 + 0.44], [zd0 - 0.0006, zd0], { mass: 0.004 });
  b.glue(card, door, 4);
  const knobL = b.cyl("door_latch", "plastic", "plastic", 0.012, 0.012, [w / 2 - 0.03, y0 + h / 2, zd0 + 0.001 + 0.006], { axis: "z", segments: 8, tint: 0x2a2a2a, mass: 0.006 });
  b.press(knobL, door, 6);
  const ax = hingeAxis([1, 0, 0], [0, 0, 1]); // free edge towards +X, opens out of the wall
  b.hinge(door, box.left!, {
    pivots: [
      [-w / 2, y0 + 0.07, zd0],
      [-w / 2, y0 + h - 0.07, zd0],
    ],
    axis: [ax.x, ax.y, ax.z],
    min: 0,
    max: 120,
    strength: 25,
    friction: 0.1,
    latch: 6,
    latchFixed: box.right!,
    latchPos: [w / 2 - 0.02, y0 + h / 2, zd0],
  });

  // ------------------------------------------------------------------ cables out through the top
  const yTop = y0 + h;
  [-0.1, -0.035, 0.035, 0.1].forEach((cx, k) => {
    const gl = b.cyl(`gland${k}`, "plastic", "plastic", 0.009, 0.014, [cx, yTop + 0.007, 0.04], { segments: 8, tint: 0x2a2a2a, mass: 0.005 });
    b.screw(gl, box.top!, 1, 15);
    const segs = cable(
      b,
      `cable${k}`,
      // up out of the gland, then bent back into the wall (through a hole above the box)
      [
        [cx, yTop + 0.014, 0.04],
        [cx, yTop + 0.15, 0.04],
        [cx, yTop + 0.19, 0.014],
        [cx, yTop + 0.19, 0.0005],
      ],
      { r: k === 0 ? 0.007 : 0.0045, kgPerM: k === 0 ? 0.25 : 0.12, sparks: 0.4, start: { to: gl, kind: "clip", strength: 25 } },
    );
    b.world(segs[segs.length - 1], "clip", 20, [cx, yTop + 0.19, 0]);
  });

  return finish(b, o);
}
