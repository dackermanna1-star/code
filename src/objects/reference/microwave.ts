// Reference object: countertop microwave oven (0.9 cu ft / 25 l, 900 W). THE quality bar for
// content builders — it is built the way a real one is built, so it breaks the way a real one
// breaks:
//
//  * Casing: a bent 0.6 mm steel wrapper (top + sides, welded "bends") screwed to a 0.8 mm
//    galvanised base and a vented back panel. Hits dent it (tessellated sheet), drops pop the
//    casing screws, a sledgehammer folds it.
//  * Cavity: five 0.5 mm enamelled steel panels spot-welded into a box, held by a front flange
//    frame and two support rails welded to the base. A turntable motor hangs under its floor;
//    the tempered-glass turntable rests on a plastic roller ring and the motor coupling — shake
//    the oven and the plate rattles loose and dices when it lands.
//  * Electrics in the control compartment: magnetron (enamelled-steel yoke, aluminium cooling
//    fins, ceramic ferrite magnet that shatters), a ~4 kg high-voltage transformer (cast-iron
//    core with copper windings) bolted to the base, an HV capacitor, a cooling fan with
//    snap-off plastic blades, and the control PCB with soldered chips/relays (sparks).
//  * Front: a plastic control fascia with a green display (screen feature) and 14 press-fit
//    buttons that pop off; a door on two hinge pins with a latch (two plastic hooks): plastic
//    mitred frame, dark tempered outer glass, perforated steel Faraday screen, pull handle.
//    Yank it, kick it or hit the hinge side to rip it off.
//  * Rubber feet and a power cord (segments + moulded plug) lying on the counter.
//
// Frame: origin at the centre of the footprint on the counter, +Y up, door (+Z) front.
// Footprint 0.50 × 0.38 m (cord and plug trail behind/right to x 0.38, z -0.25), 0.30 m tall,
// ~13.5 kg, 78 parts.

import { Builder } from "../lib/builder.ts";
import { buttonGrid, cable, fastenSeam, glassPaneInFrame, hingeAxis, pcb, pullHandle, spokeRot } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { SurfaceName } from "../../render/surfaces.ts";

export interface MicrowaveOpts {
  /** Casing finish. */
  finish?: "black" | "white" | "steel";
  seed?: number;
}

const FINISH: Record<NonNullable<MicrowaveOpts["finish"]>, { casingSurf: SurfaceName; casing: number; trim: number }> = {
  black: { casingSurf: "metal_painted", casing: 0x27282b, trim: 0x141416 },
  white: { casingSurf: "metal_painted", casing: 0xefeee9, trim: 0xf2f2ef },
  steel: { casingSurf: "steel_brushed", casing: 0xffffff, trim: 0x141416 },
};

export function buildMicrowave(o: MicrowaveOpts = {}): AssemblyDef {
  const f = FINISH[o.finish ?? "black"];
  const b = new Builder("microwave", "Microwave Oven", "appliance", 120, o.seed);

  // ------------------------------------------------------------------ casing & base
  const ZB = -0.19; // back face
  const ZF = 0.15; // front plane of the body (door + fascia sit in front of it, to z = 0.19)
  const depth = ZF - ZB;
  const zc = (ZB + ZF) / 2;
  const feet: string[] = [];
  [
    [-0.21, -0.15],
    [0.21, -0.15],
    [-0.21, 0.11],
    [0.21, 0.11],
  ].forEach(([x, z], k) => feet.push(b.cyl(`foot_${k}`, "rubber", "rubber", 0.012, 0.01, [x, 0.005, z], { segments: 8, tint: 0x1b1b1b })));
  const base = b.box("base", "steelSheet", "metal_raw", [0.5, 0.0008, depth], [0, 0.0104, zc], { tint: 0xc8c9c6 });
  const caseL = b.box("case_l", "steelSheet", f.casingSurf, [0.0006, 0.2886, depth], [-0.2497, 0.1551, zc], { tint: f.casing });
  // the right wrapper side runs forward to the front face, enclosing the control fascia
  const caseR = b.box("case_r", "steelSheet", f.casingSurf, [0.0006, 0.2886, 0.38], [0.2497, 0.1551, 0], { tint: f.casing });
  const caseTop = b.box("case_top", "steelSheet", f.casingSurf, [0.5, 0.0006, depth], [0, 0.2997, zc], { tint: f.casing });
  const caseBack = b.box("case_back", "steelSheet", "metal_painted", [0.4988, 0.2886, 0.0006], [0, 0.1551, -0.1897], {
    tint: f.casing,
    faces: { nz: { surf: "vent_grille", tint: 0x3b3c3e } },
  });
  for (const ft of feet) b.glue(ft, base, 15);
  b.screw(caseL, base, 3, 30);
  b.screw(caseR, base, 3, 30);
  b.screw(caseBack, base, 3, 30);
  b.weld(caseTop, caseL, 150); // one bent sheet: the "bends" are very strong
  b.weld(caseTop, caseR, 150);
  b.screw(caseTop, caseBack, 3, 30);
  b.screw(caseL, caseBack, 2, 30);
  b.screw(caseR, caseBack, 2, 30);

  // ------------------------------------------------------------------ cavity (enamelled steel box)
  const cav = 0xdedad0;
  const cz = -0.01075; // cavity panels span z -0.1705 .. 0.149
  const cdz = 0.3195;
  const cavFloor = b.box("cav_floor", "steelSheet", "metal_painted", [0.331, 0.0005, cdz], [-0.07, 0.03475, cz], { tint: cav });
  const cavCeil = b.box("cav_ceil", "steelSheet", "metal_painted", [0.331, 0.0005, cdz], [-0.07, 0.25525, cz], { tint: cav });
  const cavL = b.box("cav_l", "steelSheet", "metal_painted", [0.0005, 0.22, cdz], [-0.23525, 0.145, cz], { tint: cav });
  const cavR = b.box("cav_r", "steelSheet", "metal_painted", [0.0005, 0.22, cdz], [0.09525, 0.145, cz], { tint: cav });
  const cavBack = b.box("cav_back", "steelSheet", "metal_painted", [0.33, 0.22, 0.0005], [-0.07, 0.145, -0.17025], { tint: cav });
  const cavity = [cavFloor, cavCeil, cavL, cavR, cavBack];
  for (let i = 0; i < cavity.length; i++)
    for (let j = i + 1; j < cavity.length; j++) {
      if (b.contact(cavity[i], cavity[j], 0.0003)) fastenSeam(b, cavity[i], cavity[j], "weld", { spacing: 0.06, each: 15, tol: 0.0003 });
    }
  // front flange frame around the cavity opening (1 mm steel, black)
  const fl = 0x1c1c1e;
  const flL = b.box("flange_l", "steelSheet", "metal_painted", [0.0144, 0.2886, 0.001], [-0.2422, 0.1551, 0.1495], { tint: fl });
  const flR = b.box("flange_r", "steelSheet", "metal_painted", [0.0045, 0.2886, 0.001], [0.09725, 0.1551, 0.1495], { tint: fl });
  const flT = b.box("flange_t", "steelSheet", "metal_painted", [0.33, 0.0444, 0.001], [-0.07, 0.2772, 0.1495], { tint: fl });
  const flB = b.box("flange_b", "steelSheet", "metal_painted", [0.33, 0.0242, 0.001], [-0.07, 0.0229, 0.1495], { tint: fl });
  b.weld(flL, cavL, 60);
  b.weld(flR, cavR, 60);
  b.weld(flT, cavCeil, 60);
  b.weld(flB, cavFloor, 60);
  for (const s of [flL, flR]) {
    b.weld(flT, s, 40);
    b.weld(flB, s, 40);
    b.screw(s, base, 1, 30);
    b.screw(s, caseTop, 1, 30);
  }
  b.screw(flL, caseL, 2, 30);
  b.screw(flT, caseTop, 2, 25);
  b.screw(flB, base, 2, 25);
  // support rails under the cavity floor
  for (const [k, x] of [
    ["l", -0.20025],
    ["r", 0.06025],
  ] as Array<[string, number]>) {
    const rail = b.box(`rail_${k}`, "steelSheet", "metal_raw", [0.0015, 0.0237, 0.305], [x, 0.02265, -0.0125], { tint: 0xbfc0bd });
    b.weld(rail, cavFloor, 60);
    b.weld(rail, base, 60);
  }

  // ------------------------------------------------------------------ turntable
  const TX = -0.07,
    TZ = -0.0105;
  const ttMotor = b.box("tt_motor", "plastic", "plastic", [0.05, 0.02, 0.05], [TX, 0.0245, TZ], { tint: 0xe8e4d8 });
  const coupling = b.cyl("tt_coupling", "plastic", "plastic", 0.012, 0.016, [TX, 0.043, TZ], { segments: 6, tint: 0xf4f1e8 });
  const ringPts: Array<[number, number, number]> = [90, 210, 330].map((a) => [TX + 0.085 * Math.cos((a * Math.PI) / 180), 0.043, TZ + 0.085 * Math.sin((a * Math.PI) / 180)]);
  const ring = b.tube("tt_ring", "plastic", "plastic", ringPts, 0.008, { closed: true, sides: 6, tint: 0xf4f1e8 });
  const plate = b.cyl("tt_plate", "temperedGlass", "glass", 0.1225, 0.006, [TX, 0.054, TZ], { segments: 16, capSurf: "glass", smooth: 0 });
  b.screw(ttMotor, cavFloor, 2, 15);
  b.press(coupling, ttMotor, 8); // the motor shaft pokes through the cavity floor
  b.friction(ring[0], cavFloor, 4);
  b.friction(plate, ring[0], 4);
  b.press(plate, coupling, 4); // the plate's hub keys onto the coupling

  // ------------------------------------------------------------------ magnetron (on the cavity's right wall)
  const magFins = b.box("mag_fins", "aluminum", "aluminum", [0.045, 0.069, 0.07], [0.118, 0.2025, -0.045], { mass: 0.12, tess: 0.02 });
  const magBody = b.box("mag_body", "steel", "metal_painted", [0.04, 0.075, 0.08], [0.1605, 0.2025, -0.045], { mass: 0.45, tint: 0x8f969c });
  const magnet = b.cyl("mag_magnet", "ceramic", "cast_iron", 0.028, 0.012, [0.1865, 0.2025, -0.045], { axis: "x", segments: 12, mass: 0.15, tint: 0x5a5a5a });
  b.screw(magFins, cavR, 4, 20);
  b.weld(magBody, magFins, 120);
  b.glue(magnet, magBody, 30);

  // ------------------------------------------------------------------ high-voltage transformer (bolted to the base)
  const trCore = b.box("tr_core", "castIron", "cast_iron", [0.08, 0.08, 0.065], [0.17, 0.0508, -0.025], { tint: 0x5b5e60 });
  const trPri = b.box("tr_primary", "copper", "copper", [0.06, 0.06, 0.018], [0.17, 0.0508, 0.0165], { tint: 0xc77b45 });
  const trSec = b.box("tr_secondary", "copper", "copper", [0.06, 0.06, 0.018], [0.17, 0.0508, -0.0665], { tint: 0xc77b45 });
  b.bolt(trCore, base, 200);
  b.press(trPri, trCore, 120);
  b.press(trSec, trCore, 120);
  b.sparks(trPri, 0.5);
  // HV capacitor clamped to the cavity wall
  const cap = b.cyl("hv_cap", "aluminum", "aluminum", 0.017, 0.065, [0.1125, 0.1175, 0.06], { axis: "z", segments: 10 });
  b.screw(cap, cavR, 2, 25);

  // ------------------------------------------------------------------ cooling fan (behind the magnetron)
  const fanMotor = b.box("fan_motor", "steel", "metal_raw", [0.042, 0.042, 0.024], [0.185, 0.195, -0.1774], { tint: 0x9a9690 });
  const hub = b.cyl("fan_hub", "plastic", "plastic", 0.012, 0.018, [0.185, 0.195, -0.1564], { axis: "z", segments: 10, tint: 0x2a2a2a });
  b.screw(fanMotor, caseBack, 2, 20);
  b.press(hub, fanMotor, 15);
  b.group([0.185, 0.195, -0.155], undefined, "fan_", () => {
    for (let k = 0; k < 4; k++) {
      const a = 45 + 90 * k;
      const r = 0.0285;
      const blade = b.box(`blade_${k}`, "plastic", "plastic", [0.035, 0.022, 0.002], [r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180), 0], {
        rot: spokeRot("z", a, 25),
        tint: 0x2a2a2a,
      });
      b.fuse(blade, hub, 8);
    }
  });

  // ------------------------------------------------------------------ control fascia (moulded plastic tray)
  const trim = f.trim;
  const cpFront = b.box("cp_front", "plastic", "plastic", [0.1289, 0.2892, 0.0025], [0.18495, 0.1554, 0.18875], {
    tint: trim,
    faces: { pz: { surf: "panel_microwave", tint: 0xffffff } },
  });
  const cpTop = b.box("cp_top", "plastic", "plastic", [0.1289, 0.0025, 0.0375], [0.18495, 0.29875, 0.16875], { tint: trim });
  const cpBot = b.box("cp_bot", "plastic", "plastic", [0.1289, 0.0025, 0.0375], [0.18495, 0.01205, 0.16875], { tint: trim });
  const cpLeft = b.box("cp_left", "plastic", "plastic", [0.0025, 0.2842, 0.0375], [0.12175, 0.1554, 0.16875], { tint: trim });
  b.fuse(cpFront, cpTop);
  b.fuse(cpFront, cpBot);
  b.fuse(cpFront, cpLeft);
  b.fuse(cpLeft, cpTop);
  b.fuse(cpLeft, cpBot);
  b.clip(cpTop, caseTop, 12);
  b.clip(cpFront, caseR, 12);
  b.clip(cpTop, caseR, 6);
  b.clip(cpBot, caseR, 6);
  b.screw(cpBot, base, 2, 20);
  // display (VFD glass behind a lens) and keypad
  const display = b.box("display", "lcd", "plastic", [0.08, 0.022, 0.002], [0.185, 0.262, 0.191], {
    tint: 0x101010,
    faces: { pz: { surf: "display_green", tint: 0xffffff } },
  });
  b.glue(display, cpFront, 8);
  b.screen(display, "microwave", { on: true, mains: true });
  buttonGrid(b, "key", { on: cpFront, rows: 4, cols: 3, size: [0.026, 0.014], pitch: [0.032, 0.022], tint: 0x2c2d30 }, [0.185, 0.165, 0.19]);
  buttonGrid(b, "startstop", { on: cpFront, rows: 1, cols: 2, size: [0.04, 0.016], pitch: [0.048, 0.02], tints: [0x2f8a3a, 0xb3261e] }, [0.185, 0.103, 0.19]);
  // control board behind the fascia (components face into the compartment)
  pcb(
    b,
    "ctrl",
    {
      w: 0.116,
      h: 0.26,
      components: [
        { kind: "chip", x: 0, y: 0.045 },
        { kind: "relay", x: 0.036, y: -0.075 },
        { kind: "relay", x: -0.014, y: -0.075 },
        { kind: "transformer", x: -0.034, y: -0.015 },
        { kind: "buzzer", x: 0.036, y: 0.095 },
      ],
      mount: { to: cpFront, screws: 4, each: 12 },
      sparks: 0.7,
    },
    [0.186, 0.155, 0.183],
    [0, 180, 0],
  );

  // ------------------------------------------------------------------ door
  const door = glassPaneInFrame(
    b,
    "door",
    {
      w: 0.3689,
      h: 0.2846,
      bar: { top: 0.035, bottom: 0.035, left: 0.035, right: 0.05 },
      depth: 0.04,
      mat: "plastic",
      surf: "plastic_glossy",
      tint: trim,
      glassT: 0.003,
      glassMat: "temperedGlass",
      glassSurf: "glass_dark",
      glassZ: 0.0345,
      glassBond: { kind: "glue", strength: 12 },
      corner: { kind: "fused" },
    },
    [-0.06495, 0.1551, 0.15],
  );
  const screen = b.box("door_screen", "steelSheet", "vent_grille", [0.2839, 0.2146, 0.0006], [-0.07245, 0.1551, 0.1548], { tint: 0x2b2b2b });
  for (const bar of [door.bars.top, door.bars.bottom, door.bars.left, door.bars.right]) b.screw(screen, bar, 2, 15);
  const hookT = b.box("door_hook_t", "plastic", "plastic", [0.01, 0.02, 0.02], [0.1055, 0.245, 0.14], { tint: 0xe6e3da });
  const hookB = b.box("door_hook_b", "plastic", "plastic", [0.01, 0.02, 0.02], [0.1055, 0.065, 0.14], { tint: 0xe6e3da });
  b.fuse(hookT, door.bars.right, 25);
  b.fuse(hookB, door.bars.right, 25);
  pullHandle(b, "door_handle", { on: door.bars.right, len: 0.15, vertical: true, depth: 0.018, width: 0.022, tint: trim }, [0.0945, 0.1551, 0.19]);
  b.hinge(door.bars.left, flL, {
    pivots: [
      [-0.2494, 0.03, 0.19],
      [-0.2494, 0.28, 0.19],
    ],
    axis: hingeAxis([1, 0, 0], [0, 0, 1]),
    min: 0,
    max: 100,
    strength: 40,
    friction: 0.05,
    latch: 35,
    latchPart: hookT,
    latchFixed: flR,
    latchPos: [0.1055, 0.155, 0.14],
  });

  // ------------------------------------------------------------------ power cord
  const relief = b.cyl("cord_relief", "rubber", "rubber", 0.006, 0.015, [0.2, 0.05, -0.1975], { axis: "z", segments: 8, tint: 0x1c1c1c });
  b.clip(relief, caseBack, 30);
  const cord = cable(b, "cord", [
    [0.2, 0.05, -0.205],
    [0.2, 0.03, -0.228],
    [0.235, 0.0035, -0.235],
    [0.34, 0.0035, -0.235],
  ], { r: 0.0035, kgPerM: 0.05, jointStrength: 40 });
  const plug = b.box("cord_plug", "plastic", "plastic", [0.04, 0.022, 0.03], [0.36, 0.011, -0.235], { tint: 0x1c1c1c });
  b.fuse(relief, cord[0], 40);
  b.press(plug, cord[cord.length - 1], 30);

  return b.build();
}
