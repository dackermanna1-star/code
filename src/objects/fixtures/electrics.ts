// Apartment electrics: smoke detector (CEILING frame), thermostat, door chime and mini-split
// indoor unit (WALL frame: back on the wall face z = 0, front +Z, origin at the BOTTOM centre
// for the AC unit and the CENTRE for the small boxes), baseboard heater (FLOOR frame: origin on
// the floor at the wall face, wall at z = 0). PURE MODULE.

import { Builder } from "../lib/builder.ts";
import { hingeAxis } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { WHITE_PAINT } from "./parts.ts";

interface Common {
  seed?: number;
  validate?: "basic" | "full";
}

// ============================================================================================

/**
 * Ionisation smoke detector: mounting plate screwed to the ceiling, PCB (sparks), twist-lock
 * cover (solid hull = cover + chamber + 9 V battery, mass-corrected) with an `alarm` feature
 * that chirps when it is hit, and a press-fit test button. Ø 0.13 m, ~0.22 kg.
 */
export function buildSmokeDetector(o: Common = {}): AssemblyDef {
  const b = new Builder("smokeDetector", "Smoke Detector", "electronics", 25, o.seed);
  const base = b.cyl("plate", "plastic", "plastic", 0.06, 0.008, [0, -0.004, 0], { segments: 14, tint: 0xf4f4f0 });
  b.world(base, "screw", 50, [0, 0, 0]);
  const pcb = b.box("pcb", "pcb", "pcb", [0.07, 0.0016, 0.07], [0, -0.0088, 0]);
  b.screw(pcb, base, 2, 4);
  const bodyH = 0.034;
  const body = b.cyl("cover", "plastic", "plastic", 0.058, bodyH, [0, -0.0096 - bodyH / 2, 0], { rTop: 0.066, segments: 16, mass: 0.11, tint: 0xf6f6f2, capSurf: "vent_grille", capTint: 0xf6f6f2 });
  b.clip(body, base, 6);
  b.clip(body, pcb, 2);
  const btn = b.cyl("button", "plastic", "plastic_glossy", 0.012, 0.004, [0.025, -0.0096 - bodyH - 0.002, 0], { segments: 10, tint: 0xe8e8e2 });
  b.press(btn, body, 2);
  b.alarm(body, "smokeChirp");
  b.sparks(pcb, 0.5);
  return b.build({ validate: o.validate });
}

// ============================================================================================

/**
 * Programmable thermostat: back plate screwed to the wall, control PCB (sparks), clip-on cover,
 * backlit seven-segment LCD (breakable `lcd` part with the printed `display_blue` readout — no
 * `screen` feature: the screen contents available are TV/phone/microwave UIs, none of which
 * reads as a thermostat) and three press-fit buttons. 12 × 9 cm, ~0.2 kg.
 */
export function buildThermostat(o: Common = {}): AssemblyDef {
  const b = new Builder("thermostat", "Thermostat", "electronics", 60, o.seed);
  const back = b.box("backplate", "plastic", "plastic", [0.12, 0.09, 0.008], [0, 0, 0.004], { tint: 0xf2f2ee });
  b.world(back, "screw", 40, [0, 0, 0]);
  const pcb = b.box("pcb", "pcb", "pcb", [0.1, 0.07, 0.0016], [0, 0, 0.0088]);
  b.screw(pcb, back, 2, 4);
  const cover = b.bevelBox("cover", "plastic", "plastic", [0.124, 0.094, 0.018], 0.004, [0, 0, 0.0096 + 0.009], { mass: 0.06, tint: 0xf6f6f2 });
  b.clip(cover, back, 8);
  b.clip(cover, pcb, 2);
  // display_blue tiles every 0.08 m; the +Z face maps u = −x + u0, v = y + v0, so this offset
  // puts the texture centre (the digits) on the LCD centre (0, 0.012).
  const lcd = b.box("lcd", "lcd", "display_blue", [0.064, 0.032, 0.002], [0, 0.012, 0.0276 + 0.001], {
    faces: { px: { surf: "plastic" }, nx: { surf: "plastic" }, py: { surf: "plastic" }, ny: { surf: "plastic" }, nz: { surf: "plastic" } },
    uvOffset: [0.04, 0.04 - 0.012],
  });
  b.glue(lcd, cover, 4);
  [-0.025, 0, 0.025].forEach((x, k) => {
    const btn = b.bevelBox(`btn${k}`, "plastic", "plastic_glossy", [0.016, 0.009, 0.003], 0.001, [x, -0.026, 0.0276 + 0.0015], { tint: 0xdadad4 });
    b.press(btn, cover, 2);
  });
  b.sparks(pcb, 0.5);
  return b.build({ validate: o.validate });
}

// ============================================================================================

/**
 * Two-note door chime: plastic base screwed to the wall, two steel tone bars on clips, a
 * solenoid plunger, and a clip-on cover (front plate + two side rails). 21 × 13 cm, ~0.4 kg.
 */
export function buildDoorChime(o: Common = {}): AssemblyDef {
  const b = new Builder("doorChime", "Door Chime", "electronics", 30, o.seed);
  const base = b.box("base", "plastic", "plastic", [0.2, 0.12, 0.006], [0, 0, 0.003], { tint: 0xeeece6 });
  b.world(base, "screw", 30, [0, 0, 0]);
  for (const [k, y] of [0.03, 0.005].entries()) {
    const bar = b.box(`tonebar${k}`, "steel", "steel_brushed", [0.16 - k * 0.02, 0.012, 0.003], [0, y, 0.0075]);
    b.clip(bar, base, 6);
  }
  const sol = b.cyl("solenoid", "copper", "copper", 0.009, 0.04, [0, -0.035, 0.015], { axis: "x", segments: 10 });
  b.screw(sol, base, 1, 10);
  b.sparks(sol, 0.4);
  const rails = [-1, 1].map((s) => {
    const r = b.box(`rail${s < 0 ? "L" : "R"}`, "plastic", "plastic", [0.004, 0.12, 0.038], [s * 0.098, 0, 0.006 + 0.019], { tint: 0xf6f4ee });
    b.clip(r, base, 6);
    return r;
  });
  const front = b.bevelBox("cover", "plastic", "plastic", [0.21, 0.13, 0.004], 0.0015, [0, 0, 0.044 + 0.002], { tint: 0xf6f4ee });
  for (const r of rails) b.clip(front, r, 5);
  return b.build({ validate: o.validate });
}

// ============================================================================================

export interface HeaterOpts extends Common {
  /** Length (m), default 1.2. */
  len?: number;
}

/**
 * Electric baseboard heater: painted steel back panel on two wall spacers (world screws),
 * end caps, front panel and top louvre (screwed), heating element (steel sheathed tube, sparks)
 * on two brackets with four aluminium fin packs, a junction box (sparks) and a bimetal
 * thermostat with knob. Mounted 25 mm above the floor, 0.175 m tall, 0.09 m deep. 4–6 kg.
 */
export function buildBaseboardHeater(o: HeaterOpts = {}): AssemblyDef {
  // spacers sit 0.15 m in from each end, fins/junction box/thermostat need ~0.6 m: clamp
  const L = Number.isFinite(o.len) ? Math.min(3, Math.max(0.6, o.len as number)) : 1.2;
  const b = new Builder("baseboardHeater", "Baseboard Heater", "appliance", 90, o.seed);
  const y0 = 0.025,
    H = 0.175,
    D = 0.075,
    gap = 0.015,
    t = 0.0008;
  const zb = gap; // back panel back face
  const paint = { tint: WHITE_PAINT };
  const spacers = [-1, 1].map((s) => {
    const sp = b.box(`spacer${s < 0 ? "L" : "R"}`, "steel", "metal_raw", [0.03, 0.06, gap], [s * (L / 2 - 0.15), y0 + 0.1, gap / 2], { tess: 0 });
    b.world(sp, "screw", 70, [s * (L / 2 - 0.15), y0 + 0.1, 0]);
    return sp;
  });
  const back = b.box("back", "steelSheet", "metal_painted", [L, H, t], [0, y0 + H / 2, zb + t / 2], paint);
  for (const sp of spacers) b.screw(back, sp, 2, 35);
  const zIn = zb + t; // inner face of the back
  const capD = D - t;
  const caps = [-1, 1].map((s) => {
    const c = b.box(`endcap${s < 0 ? "L" : "R"}`, "steelSheet", "metal_painted", [0.0015, H, capD], [s * (L / 2 - 0.00075), y0 + H / 2, zIn + capD / 2], paint);
    b.screw(c, back, 2, 20);
    return c;
  });
  const zFront = zb + D; // outer front face
  const fw = L - 0.003;
  const frontY0 = y0 + 0.03;
  const front = b.box("front", "steelSheet", "metal_painted", [fw, y0 + H - frontY0, t], [0, (frontY0 + y0 + H) / 2, zFront - t / 2], paint);
  for (const c of caps) b.screw(front, c, 2, 20);
  const top = b.box("louvre", "steelSheet", "vent_grille", [fw, t, D - 2 * t], [0, y0 + H - t / 2, zIn + (D - 2 * t) / 2], { tint: 0xe9e8e3 });
  b.screw(top, front, 3, 15);
  for (const c of caps) b.screw(top, c, 1, 15);
  // heating element + fins
  const ye = y0 + 0.055,
    ze = zb + 0.035,
    er = 0.008;
  const el = b.cyl("element", "steel", "metal_raw", er, L - 0.06, [0, ye, ze], { axis: "x", segments: 10, mass: 0.37 * (L - 0.06) });
  b.sparks(el, 0.5);
  for (const s of [-1, 1]) {
    const bl = ze - er - zIn;
    const br = b.box(`elbracket${s < 0 ? "L" : "R"}`, "steel", "metal_raw", [0.004, 0.02, bl], [s * (L / 2 - 0.1), ye, zIn + bl / 2], { tess: 0 });
    b.screw(br, back, 1, 25);
    b.clip(br, el, 30);
  }
  const finX0 = -L / 2 + 0.11,
    finX1 = L / 2 - 0.11;
  const nf = 4;
  const fl = (finX1 - finX0) / nf - 0.012;
  for (let k = 0; k < nf; k++) {
    const x = finX0 + (k + 0.5) * ((finX1 - finX0) / nf);
    const fin = b.box(`fins${k}`, "aluminum", "vent_grille", [fl, 0.05, 0.045], [x, ye + er + 0.025, ze], { mass: 0.4 * fl, tint: 0xc8c8c4, tess: 0 });
    b.press(fin, el, 20);
  }
  // junction box (left) + thermostat (right)
  const jb = b.box("junction", "steelSheet", "metal_raw", [0.08, 0.06, 0.05], [-L / 2 + 0.055, y0 + 0.115, zIn + 0.025], { mass: 0.25, tess: 0 });
  b.screw(jb, back, 2, 20);
  b.sparks(jb, 0.6);
  const th = b.box("thermostat", "plastic", "plastic", [0.06, 0.05, 0.04], [L / 2 - 0.055, y0 + 0.12, zIn + 0.02], { tint: 0xf0efe8 });
  b.screw(th, back, 2, 12);
  const knob = b.cyl("knob", "plastic", "plastic_glossy", 0.014, 0.016, [L / 2 + 0.008, y0 + 0.12, zIn + 0.035], { axis: "x", segments: 12, tint: 0xf2f1ea });
  b.press(knob, caps[1], 3);
  return b.build({ validate: o.validate });
}

// ============================================================================================

/**
 * Ductless mini-split indoor unit (9–12 kBTU): steel mounting plate screwed to the wall, plastic
 * chassis hooked on it, evaporator coil (aluminium fins + copper, 2.8 kg), drain pan, cross-flow
 * blower wheel press-fitted on its motor shaft (rigid: the wheel's inertia is far too small for
 * the motor feature's fixed-gain speed loop, which would jitter it every step and keep it awake
 * inside a casing where nobody sees it spin), control box + PCB
 * (sparks), end caps, top intake grille, filters, a front panel that lifts on hinges (magnetic
 * catch), a motorised-style louvre on a hinge and a blue status display. 0.8 × 0.28 × 0.2 m,
 * ~10 kg.
 */
export function buildMiniSplit(o: Common = {}): AssemblyDef {
  const b = new Builder("miniSplitAC", "Mini-Split AC (indoor)", "appliance", 900, o.seed);
  const W = 0.8,
    H = 0.28,
    D = 0.2;
  const white = { tint: 0xf7f7f4 };
  const plate = b.box("plate", "steelSheet", "metal_raw", [0.6, 0.24, 0.002], [0, H / 2, 0.001], { mass: 1.0, tess: 0 });
  b.world(plate, "screw", 240, [0, H / 2, 0]);
  const chassis = b.box("chassis", "plastic", "plastic", [W - 0.02, 0.26, 0.006], [0, H / 2, 0.005], white);
  b.clip(chassis, plate, 80);
  const capD = D - 0.008;
  const caps = [-1, 1].map((s) => {
    const c = b.box(`endcap${s < 0 ? "L" : "R"}`, "plastic", "plastic", [0.01, H, capD], [s * (W / 2 - 0.005), H / 2, 0.008 + capD / 2], white);
    b.screw(c, chassis, 2, 15);
    return c;
  });
  const iw = W - 0.02;
  const grille = b.box("grille", "plastic", "vent_grille", [iw, 0.003, capD], [0, H - 0.0015, 0.008 + capD / 2], white);
  for (const c of caps) b.clip(grille, c, 10);
  const bottom = b.box("bottom", "plastic", "plastic", [iw, 0.003, 0.09], [0, 0.0015, 0.008 + 0.045], white);
  for (const c of caps) b.clip(bottom, c, 10);
  b.clip(bottom, chassis, 10);
  const coil = b.box("coil", "aluminum", "vent_grille", [0.7, 0.17, 0.05], [0, 0.175, 0.008 + 0.025], { mass: 2.8, tint: 0xbfc4c6, tess: 0 });
  b.screw(coil, chassis, 4, 25);
  const header = b.cyl("header", "copper", "copper", 0.008, 0.16, [0.36, 0.175, 0.033], { segments: 8, mass: 0.3 });
  b.weld(header, coil, 60);
  const pan = b.box("drainpan", "plastic", "plastic", [0.7, 0.015, 0.052], [0, 0.0825, 0.008 + 0.026], { mass: 0.3, tint: 0xd9d9d4 });
  b.clip(pan, chassis, 10);
  b.clip(pan, coil, 10);
  const filters = [-0.19, 0.19].map((x, k) => {
    const f = b.box(`filter${k}`, "plastic", "vent_grille", [0.36, 0.17, 0.003], [x, 0.175, 0.058 + 0.0015], { tint: 0xe8ecef });
    b.clip(f, coil, 1);
    return f;
  });
  void filters;
  // blower motor + wheel
  const motor = b.cyl("blowermotor", "steel", "metal_raw", 0.04, 0.055, [0.3575, 0.07, 0.11], { axis: "x", segments: 12, mass: 0.8 });
  b.screw(motor, caps[1], 2, 25);
  const wheel = b.cyl("blower", "plastic", "vent_grille", 0.045, 0.66, [0, 0.07, 0.11], { axis: "x", segments: 12, mass: 0.4, tint: 0x9aa0a4 });
  b.press(wheel, motor, 40);
  b.sparks(motor, 0.4);
  // control box + PCB
  const ctrl = b.box("ctrlbox", "plastic", "plastic", [0.06, 0.09, 0.05], [0.355, 0.18, 0.1], { tint: 0xdedcd6 });
  b.screw(ctrl, caps[1], 2, 12);
  const pcb = b.box("pcb", "pcb", "pcb", [0.05, 0.075, 0.0016], [0.355, 0.18, 0.1258]);
  b.screw(pcb, ctrl, 2, 6);
  b.sparks(pcb, 0.7);
  // front panel: lifts on two hinges along its top edge (magnetic catch)
  const fpW = 0.768;
  const front = b.box("front", "plastic", "plastic_glossy", [fpW, 0.2, 0.003], [0, 0.17, D - 0.0015], white);
  b.hinge(front, grille, {
    pivots: [
      [-0.3, 0.27, D],
      [0.3, 0.27, D],
    ],
    axis: hingeAxis([0, -1, 0], [0, 0, 1]),
    min: 0,
    max: 70,
    strength: 15,
    friction: 0.1,
    latch: 4,
    latchPos: [0, 0.07, D],
    latchFixed: bottom,
  });
  const disp = b.box("display", "plastic", "display_blue", [0.06, 0.012, 0.002], [0.25, 0.1, D + 0.001], {});
  b.glue(disp, front, 3);
  // louvre vane at the outlet
  const louvre = b.box("louvre", "plastic", "plastic", [0.7, 0.004, 0.06], [0, 0.03, 0.17], white);
  b.hinge(louvre, bottom, {
    pivots: [
      [-0.34, 0.03, 0.15],
      [0.34, 0.03, 0.15],
    ],
    axis: [1, 0, 0],
    min: -45,
    max: 45,
    strength: 10,
    friction: 0.3,
  });
  return b.build({ validate: o.validate });
}
