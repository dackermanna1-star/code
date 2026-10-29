// Gaming PC tower (mid-tower ATX), everything a separate part that sparks and scatters:
//  chassis — 0.8 mm steel tray/top/bottom/back/front frame, PSU shroud, mesh front bezel with an
//  LED strip, 4 mm tempered-glass side panel (dices), power button, rubber feet;
//  motherboard — PCB on brass standoffs with IO block, VRM/chipset heatsinks, M.2 drive,
//  capacitors, 24-pin header, PCIe slot, CPU under a tower cooler (copper base, mounting posts +
//  crossbar, heat pipes, aluminium fin stack, fan), four RAM sticks;
//  GPU — PCB, backplate, fin block, shroud with two fans, PCIe bracket screwed to the case;
//  PSU — steel box with its own board (transformer, bulk capacitor, heatsink) and fan hum;
//  3.5" HDD, 2.5" SSD on the shroud, front intake fans, rear exhaust fan, power cables.
// Local frame: origin on the floor at the centre, front bezel at +Z, glass side at +X.
// PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import { cable, pcb, sheetMetalBox } from "../lib/kit.ts";
import { boxR, finish, mk, PAL, type BaseOpts } from "./common.ts";

export interface PcTowerOpts extends BaseOpts {
  /** Case colour (painted steel). */
  tint?: number;
  /** Front LED strip colour surface. */
  led?: "led_blue" | "led_green" | "led_red";
}

/** Case outer size (body, feet excluded) and foot height. */
export const PC = { w: 0.21, h: 0.46, d: 0.44, foot: 0.012 } as const;

export function buildPcTower(o: PcTowerOpts = {}): AssemblyDef {
  const b = mk("pcTower", "Gaming PC", "electronics", 1800, o);
  const t = 0.0008;
  const tint = o.tint ?? 0xffffff;
  const S = "metal_black" as const;
  const xR = -PC.w / 2,
    xG = PC.w / 2; // right panel / glass side
  const yB = PC.foot,
    yT = PC.foot + PC.h;
  const zBk = -PC.d / 2,
    zFr = PC.d / 2 - 0.01,
    zBz = PC.d / 2;
  const glassT = 0.004;
  const xGi = xG - glassT; // inner face of the glass
  const sheet = { tint, tess: 0.04 };

  // ---------------------------------------------------------------- chassis
  const tray = boxR(b, "tray", "steelSheet", S, [xR, xR + t], [yB, yT], [zBk, zFr], sheet);
  const bottom = boxR(b, "bottom", "steelSheet", S, [xR + t, xG], [yB, yB + t], [zBk, zFr], sheet);
  const top = boxR(b, "top", "steelSheet", "vent_grille", [xR + t, xG], [yT - t, yT], [zBk, zFr], { tint: 0x2a2b2e, tess: 0.04 });
  const back = boxR(b, "back", "steelSheet", S, [xR + t, xGi], [yB + t, yT - t], [zBk, zBk + t], sheet);
  const front = boxR(b, "front_frame", "steelSheet", S, [xR + t, xGi], [yB + t, yT - t], [zFr - t, zFr], sheet);
  for (const p of [bottom, top]) b.weld(p, tray, 60);
  for (const p of [back, front]) {
    b.weld(p, tray, 50);
    b.screw(p, bottom, 3, 20);
    b.screw(p, top, 3, 20);
  }
  const glass = boxR(b, "glass", "temperedGlass", "glass", [xGi, xG], [yB + t, yT - t], [zBk, zFr], {
    tint: 0x9aa4ad,
    faces: { py: { surf: "glass_edge" }, ny: { surf: "glass_edge" }, pz: { surf: "glass_edge" }, nz: { surf: "glass_edge" } },
  });
  b.screw(glass, back, 2, 15); // thumbscrews
  b.clip(glass, top, 6);
  b.clip(glass, bottom, 6);
  const bezel = boxR(b, "bezel", "plastic", "plastic", [xR, xG], [yB, yT], [zFr, zBz], { tint: 0x1d1e21, mass: 0.45, faces: { pz: { surf: "speaker_grille", tint: 0x2a2a2a } } });
  b.clip(bezel, front, 30);
  const strip = boxR(b, "led_strip", "plastic", o.led ?? "led_blue", [xR + 0.03, xG - 0.03], [yT - 0.012, yT - 0.008], [zBz, zBz + 0.003], {});
  b.glue(strip, bezel, 3);
  const btn = b.cyl("power_button", "plastic", "plastic_glossy", 0.008, 0.004, [0.05, yT + 0.002, zFr - 0.02], { segments: 10, tint: 0x111111 });
  b.press(btn, top, 2);
  const shroudY = 0.112;
  const shroud = boxR(b, "psu_shroud", "steelSheet", S, [xR + t, xGi], [shroudY, shroudY + t], [zBk + t, 0.15], sheet);
  b.screw(shroud, tray, 3, 20);
  b.screw(shroud, back, 2, 20);
  for (const [sx, sz, nm] of [
    [-1, -1, "bl"],
    [1, -1, "br"],
    [-1, 1, "fl"],
    [1, 1, "fr"],
  ] as Array<[number, number, string]>) {
    const f = boxR(b, `foot_${nm}`, "rubber", "rubber", [sx * 0.08 - 0.015, sx * 0.08 + 0.015], [0, yB], [sz * 0.17 - 0.02, sz * 0.17 + 0.02], { tint: PAL.rubber });
    b.glue(f, bottom, 6);
  }

  // ---------------------------------------------------------------- motherboard (ATX, components facing the glass)
  const boardX = xR + t + 0.006; // 6 mm standoffs
  const mbY = 0.2825,
    mbZ = -0.0932;
  const mb = pcb(
    b,
    "mobo",
    {
      w: 0.244,
      h: 0.305,
      components: [
        { kind: "connector", x: 0.104, y: 0.08, size: [0.033, 0.13, 0.035], tint: 0x3a3c40 }, // rear IO block
        { kind: "heatsink", x: 0.045, y: 0.1325, size: [0.08, 0.025, 0.022], tint: 0x2c2d30 }, // VRM (top)
        { kind: "heatsink", x: 0.077, y: 0.065, size: [0.018, 0.09, 0.022], tint: 0x2c2d30 }, // VRM (rear)
        { kind: "heatsink", x: -0.07, y: -0.128, size: [0.04, 0.04, 0.012], tint: 0x2c2d30 }, // chipset
        { kind: "chipSmall", x: 0.0, y: -0.02, size: [0.08, 0.022, 0.004], tint: 0x2a2a2a }, // M.2 SSD
        { kind: "cap", x: 0.09, y: 0.0 },
        { kind: "cap", x: 0.09, y: -0.02 },
        { kind: "connector", x: -0.112, y: 0.04, size: [0.015, 0.052, 0.02], tint: 0x111111 }, // 24-pin header
        { kind: "connector", x: 0.0068, y: -0.0515, size: [0.085, 0.01, 0.0066], tint: 0x1a1a1a }, // PCIe x16 slot
      ],
      sparks: 0.7,
      tint: 0x2a3a2e,
    },
    [boardX + 0.0016, mbY, mbZ],
    [0, 90, 0],
  );
  const boardFront = boardX + 0.0016;
  // brass standoffs screwed into the tray, the board screwed onto them (9 screws in reality; the
  // four corner standoffs carry their strength)
  const offs: Array<[number, number]> = [
    [mbY - 0.1425, mbZ + 0.112],
    [mbY - 0.1425, mbZ - 0.112],
    [mbY + 0.1425, mbZ + 0.112],
    [mbY + 0.1425, mbZ - 0.112],
  ];
  offs.forEach(([y, z], k) => {
    const so = b.cyl(`standoff${k}`, "copper", "copper", 0.0028, boardX - (xR + t), [(xR + t + boardX) / 2, y, z], { axis: "x", segments: 6, tint: PAL.brass });
    b.screw(so, tray, 1, 12);
    b.screw(mb.board, so, 1, 22);
  });
  // CPU + tower cooler (copper base, heat pipes, fin stack, fan)
  const cpuY = 0.38,
    cpuZ = -0.115;
  const cpu = boxR(b, "cpu", "pcb", "ic_chip", [boardFront, boardFront + 0.004], [cpuY - 0.01875, cpuY + 0.01875], [cpuZ - 0.01875, cpuZ + 0.01875], { tint: 0xc8c8c8 });
  b.press(cpu, mb.board, 20); // socket retention
  const baseX0 = boardFront + 0.004;
  const cBase = boxR(b, "cooler_base", "copper", "copper", [baseX0, baseX0 + 0.01], [cpuY - 0.02, cpuY + 0.02], [cpuZ - 0.02, cpuZ + 0.02], {});
  b.glue(cBase, cpu, 5); // thermal paste
  // mounting: two steel posts screwed through the board into the backplate, a crossbar over the
  // copper base (above the heat pipes) held down by spring screws
  const mountY0 = cpuY + 0.006,
    mountY1 = cpuY + 0.018;
  const baseTop = baseX0 + 0.01;
  const xbar = boxR(b, "cooler_mount", "steel", "metal_raw", [baseTop, baseTop + 0.003], [mountY0, mountY1], [cpuZ - 0.042, cpuZ + 0.042], { tess: 0 });
  b.bolt(xbar, cBase, 40);
  for (const [k, z] of [
    [0, cpuZ - 0.036],
    [1, cpuZ + 0.036],
  ] as Array<[number, number]>) {
    const post = boxR(b, `cooler_post${k}`, "steel", "metal_raw", [boardFront, baseTop], [mountY0, mountY1], [z - 0.004, z + 0.004], { tess: 0 });
    b.screw(post, mb.board, 1, 30);
    b.screw(post, xbar, 1, 25);
  }
  const finX0 = -0.06;
  const pipes = [-0.105, -0.125].map((z, k) => {
    // 1 mm into the base and into the fin stack (soldered)
    const p = b.cyl(`heatpipe${k}`, "copper", "copper", 0.003, finX0 - (baseX0 + 0.01) + 0.002, [(baseX0 + 0.01 + finX0) / 2, cpuY, z], { axis: "x", segments: 8 });
    b.weld(p, cBase, 20);
    return p;
  });
  const fins = boxR(b, "cooler_fins", "aluminum", "aluminum", [finX0, 0.075], [0.32, 0.445], [-0.13, -0.08], { mass: 0.5, tess: 0 });
  for (const p of pipes) b.weld(p, fins, 15);
  const cFan = boxR(b, "cooler_fan", "plastic", "speaker_grille", [-0.06, 0.06], [0.3225, 0.4425], [-0.08, -0.055], { tint: 0x2a2a2d, mass: 0.13 });
  b.clip(cFan, fins, 8);
  // RAM sticks clipped into their slots
  for (let k = 0; k < 4; k++) {
    const z = -0.06 + 0.01 * k;
    const r = boxR(b, `ram${k}`, "pcb", "metal_black", [boardFront, boardFront + 0.032], [0.3, 0.433], [z - 0.0035, z + 0.0035], { tint: k % 2 ? 0x3a3a3e : 0x2c2c30 });
    b.clip(r, mb.board, 6);
    if (k === 0) b.sparks(r, 0.3);
  }

  // ---------------------------------------------------------------- GPU (fans facing down)
  const gx0 = -0.09,
    gx1 = 0.025;
  const gz0 = -0.2152,
    gz1 = 0.06;
  const gpuPcb = boxR(b, "gpu_pcb", "pcb", "pcb", [gx0, gx1], [0.23, 0.2316], [gz0, gz1], { tint: 0x1f2a22 });
  const gBack = boxR(b, "gpu_backplate", "aluminum", "metal_black", [gx0, gx1], [0.2316, 0.2346], [gz0, gz1], { tess: 0 });
  const gSink = boxR(b, "gpu_heatsink", "aluminum", "aluminum", [gx0 + 0.002, gx1 - 0.002], [0.2, 0.23], [gz0 + 0.01, gz1 - 0.005], { mass: 0.6, tess: 0 });
  const gShroud = boxR(b, "gpu_shroud", "plastic", "plastic", [gx0, gx1], [0.19, 0.2], [gz0 + 0.005, gz1], { tint: 0x26272b, mass: 0.22 });
  b.screw(gBack, gpuPcb, 4, 8);
  b.screw(gSink, gpuPcb, 4, 12);
  b.screw(gShroud, gSink, 4, 10);
  for (const [k, z] of [
    [0, -0.13],
    [1, -0.02],
  ] as Array<[number, number]>) {
    const fan = b.cyl(`gpu_fan${k}`, "plastic", "plastic", 0.044, 0.01, [(gx0 + gx1) / 2, 0.185, z], { segments: 12, tint: 0x18181a, mass: 0.03 });
    b.press(fan, gShroud, 4);
  }
  const bracket = boxR(b, "gpu_bracket", "steel", "metal_raw", [gx0, 0.03], [0.17, 0.25], [zBk + t, zBk + t + 0.002], { tess: 0 });
  b.screw(bracket, back, 2, 25);
  b.screw(bracket, gpuPcb, 2, 15);
  b.clip(gpuPcb, mb.components[8], 15); // edge connector in the PCIe slot (latch)
  b.sparks(gpuPcb, 0.8);

  // ---------------------------------------------------------------- PSU (steel box + board) under the shroud
  const psuW = 0.15,
    psuH = 0.086,
    psuD = 0.14;
  const psuX = xR + t + 0.005 + psuW / 2;
  const psuZ = zBk + t + 0.0002 + psuD / 2;
  const psu = sheetMetalBox(b, "psu", { w: psuW, h: psuH, d: psuD, t, surf: S, faces: { front: true }, join: "screw", faceSurf: { bottom: "vent_grille" } }, [psuX, yB + t, psuZ]);
  b.screw(psu.back!, back, 4, 25);
  const psuBoard = pcb(
    b,
    "psu_pcb",
    {
      w: 0.13,
      h: 0.12,
      components: [
        { kind: "transformer", x: -0.03, y: 0.02 },
        { kind: "cap", x: 0.035, y: -0.03, size: [0.025, 0.025, 0.04] },
        { kind: "heatsink", x: 0.03, y: 0.035, size: [0.05, 0.004, 0.03] },
      ],
      mount: { to: psu.bottom!, screws: 4, each: 8 },
      sparks: 0.9,
    },
    [psuX, yB + 2 * t + 0.0016, psuZ],
    [-90, 0, 0],
  );
  b.hum(psuBoard.board, "fanhum", true);

  // ---------------------------------------------------------------- drives, fans
  const hdd = boxR(b, "hdd", "aluminum", "metal_raw", [xR + t + 0.005, xR + t + 0.005 + 0.1016], [yB + t, yB + t + 0.026], [0.03, 0.177], { mass: 0.6, tess: 0 });
  b.screw(hdd, bottom, 4, 10);
  const ssd = boxR(b, "ssd", "aluminum", "metal_black", [-0.02, 0.05], [shroudY + t, shroudY + t + 0.007], [0.03, 0.13], { mass: 0.05, tess: 0 });
  b.screw(ssd, shroud, 2, 8);
  for (const [k, y] of [
    [0, 0.21],
    [1, 0.34],
  ] as Array<[number, number]>) {
    const f = boxR(b, `front_fan${k}`, "plastic", "speaker_grille", [-0.06, 0.06], [y - 0.06, y + 0.06], [zFr - t - 0.025, zFr - t], { tint: 0x2a2a2d, mass: 0.13 });
    b.screw(f, front, 4, 6);
  }
  const rear = boxR(b, "rear_fan", "plastic", "speaker_grille", [-0.055, 0.065], [0.32, 0.44], [zBk + t, zBk + t + 0.025], { tint: 0x2a2a2d, mass: 0.13 });
  b.screw(rear, back, 4, 6);

  // ---------------------------------------------------------------- cables (24-pin ATX, PCIe power)
  const psuFront = psuZ + psuD / 2 + 0.0002;
  // 24-pin plug enters the header from the front edge of the board
  const headerZ = mbZ + 0.112 + 0.0075 + 0.0002;
  cable(
    b,
    "atx_cable",
    [
      [-0.085, 0.06, psuFront],
      [-0.085, 0.06, 0.165],
      [-0.085, 0.32, 0.165],
      [-0.085, 0.32, headerZ],
    ],
    { r: 0.007, sides: 6, kgPerM: 0.12, jointStrength: 30, sparks: 0.3, start: { to: psu.front!, kind: "clip", strength: 12 }, end: { to: mb.components[7], kind: "clip", strength: 10 } },
  );
  cable(
    b,
    "pcie_cable",
    [
      [0.02, 0.06, psuFront],
      [0.02, 0.06, 0.165],
      [0.02, 0.2308, 0.165],
      [0.02, 0.2308, gz1 + 0.0002], // 8-pin plug on the card's front edge
    ],
    { r: 0.006, sides: 6, kgPerM: 0.08, jointStrength: 25, sparks: 0.3, start: { to: psu.front!, kind: "clip", strength: 10 }, end: { to: gpuPcb, kind: "clip", strength: 8 } },
  );
  return finish(b, o);
}
