// Small living-room electronics, each a separate grabbable/throwable assembly:
//  * game console  — glossy plastic shell screwed together, steel chassis tray, mainboard with an
//    APU heatsink and RAM, slot-loading optical drive, PSU can, blower fan, power button, LED,
//  * game controller — two hollow shell halves sandwiching the PCB, grips, thumbsticks, face
//    buttons, D-pad, triggers and light bar all press-fit (they pop off when it is smashed),
//  * cable/satellite box — steel sheet cover, plastic fascia with a green VFD display, PCB,
//  * Wi-Fi router — shell halves around a PCB, LED strip, four snap-off antennas,
//  * soundbar — plastic enclosure, internal baffle with two drivers (cone + magnet), fabric-look
//    grille, amplifier board,
//  * TV remote — shell halves around the PCB, rubber keypad, press-fit buttons and a battery bay
//    whose door and two AAA cells fly out when it is stomped.
//
// Frames: origin at the floor contact centre, +Y up, front (ports/slot/IR window) faces +Z.

import { Builder } from "../lib/builder.ts";
import { pcb, sheetMetalBox } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { bondTouching } from "./lib.ts";

// =============================================================================================
// Game console (0.29 × 0.065 × 0.24 m, ~2 kg)
// =============================================================================================

export interface GameConsoleOpts {
  tint?: number;
  seed?: number;
}

export function buildGameConsole(o: GameConsoleOpts = {}): AssemblyDef {
  const b = new Builder("gameConsole", "Game Console", "electronics", 400, o.seed);
  const tint = o.tint ?? 0x141416;
  const W = 0.29,
    H = 0.065,
    D = 0.24,
    feet = 0.004,
    t = 0.002;
  // rubber feet strips
  const feetL = b.box("foot_f", "rubber", "rubber", [0.2, feet, 0.012], [0, feet / 2, 0.08], { tint: 0x111111 });
  const feetR = b.box("foot_b", "rubber", "rubber", [0.2, feet, 0.012], [0, feet / 2, -0.08], { tint: 0x111111 });
  const shell = sheetMetalBox(b, "shell", { w: W, h: H - feet, d: D, t, mat: "plastic", surf: "plastic_glossy", tint, faces: { front: true }, join: "screw", spacing: 0.1, each: 12 }, [0, feet, 0]);
  b.glue(feetL, shell.bottom!, 6);
  b.glue(feetR, shell.bottom!, 6);
  const floorY = feet + t; // top of the bottom panel
  const chassis = b.box("chassis", "steelSheet", "metal_raw", [W - 2 * t - 0.006, 0.0005, D - 2 * t - 0.01], [0, floorY + 0.00025, 0], { tint: 0xb0b4b8 });
  b.screw(chassis, shell.bottom!, 4, 12);
  const deck = floorY + 0.0005;
  // mainboard (back-left), horizontal, components up
  pcb(
    b,
    "board",
    {
      w: 0.135,
      h: 0.1,
      components: [
        { kind: "heatsink", x: 0.0, y: 0.0, size: [0.06, 0.06, 0.024] },
        { kind: "chipSmall", x: -0.05, y: 0.035 },
        { kind: "chipSmall", x: -0.05, y: -0.035 },
        { kind: "connector", x: 0.05, y: -0.04 },
      ],
      mount: { to: chassis, screws: 4, each: 10 },
      sparks: 0.7,
    },
    [-0.065, deck + 0.0016, -0.058],
    [-90, 0, 0],
  );
  // slot-loading optical drive (front-left), hollow steel can
  const odd = b.box("drive", "steelSheet", "metal_raw", [0.13, 0.02, 0.1], [-0.065, deck + 0.01, 0.058], { mass: 0.26, tint: 0xa8acb0 });
  b.screw(odd, chassis, 4, 12);
  // PSU can (back-right)
  const psu = b.box("psu", "steelSheet", "metal_raw", [0.1, 0.034, 0.1], [0.08, deck + 0.017, -0.058], { mass: 0.6, tint: 0x9ea2a6 });
  b.screw(psu, chassis, 3, 15);
  b.sparks(psu, 0.6);
  // blower fan (front-right): frame plate + impeller on its bearing
  const fanBase = b.box("fan_frame", "plastic", "plastic", [0.075, 0.004, 0.075], [0.075, deck + 0.002, 0.055], { tint: 0x202020 });
  const rotor = b.cyl("fan_rotor", "plastic", "plastic", 0.033, 0.018, [0.075, deck + 0.004 + 0.009, 0.055], { segments: 10, tint: 0x2a2a2a, mass: 0.018 });
  b.screw(fanBase, chassis, 2, 10);
  b.press(rotor, fanBase, 4);
  // front: power button + LED light strip
  const btn = b.box("power_btn", "plastic", "plastic_glossy", [0.02, 0.006, 0.003], [0.1, H * 0.55, D / 2 + 0.0015], { tint });
  const led = b.box("led", "plastic", "led_blue", [0.12, 0.002, 0.0015], [-0.05, H - 0.006, D / 2 + 0.00075]);
  b.press(btn, shell.front!, 2);
  b.glue(led, shell.front!, 2);
  return b.build();
}

// =============================================================================================
// Game controller (0.165 × 0.047 × 0.11 m, ~0.2 kg)
// =============================================================================================

export function buildGameController(o: { tint?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("gameController", "Game Controller", "electronics", 60, o.seed);
  const tint = o.tint ?? 0x1b1c20;
  const yb0 = 0.007,
    hb = 0.013,
    pcbT = 0.0016;
  const yp = yb0 + hb,
    yt0 = yp + pcbT,
    yt1 = yt0 + hb;
  const bodyB = b.bevelBox("body_b", "plastic", "plastic", [0.11, hb, 0.06], 0.004, [0, yb0 + hb / 2, 0.005], { tint, mass: 0.045 });
  const board = b.box("pcb", "pcb", "pcb", [0.1, pcbT, 0.055], [0, yp + pcbT / 2, 0.005]);
  const bodyT = b.bevelBox("body_t", "plastic", "plastic", [0.11, hb, 0.06], 0.004, [0, yt0 + hb / 2, 0.005], { tint, mass: 0.05 });
  b.screw(bodyB, board, 2, 8);
  b.screw(bodyT, board, 2, 8);
  b.sparks(board, 0.4);
  const grips: string[] = [];
  for (const sx of [-1, 1]) {
    const pts: Array<[number, number, number]> = [];
    for (const x of [0.055, 0.08]) for (const z of [-0.02, 0.032]) for (const y of [yb0, yt1]) pts.push([sx * x, y, z]);
    for (const x of [0.06, 0.082]) for (const z of [-0.072, -0.058]) for (const y of [0, 0.02]) pts.push([sx * x, y, z]);
    const g = b.hull(sx < 0 ? "grip_l" : "grip_r", "plastic", "plastic", pts, [0, 0, 0], { tint, mass: 0.03, smooth: 1 });
    b.clip(g, bodyB, 10);
    b.clip(g, bodyT, 10);
    grips.push(g);
  }
  // thumbsticks
  for (const sx of [-1, 1]) {
    const st = b.cyl(sx < 0 ? "stick_l" : "stick_r", "rubber", "rubber", 0.009, 0.012, [sx * 0.025, yt1 + 0.006, -0.01], { segments: 10, tint: 0x222222 });
    b.press(st, bodyT, 3);
  }
  // face buttons (right) and D-pad (left)
  const fb: Array<[number, number, number]> = [
    [0.04, 0.003, 0x3fae5a],
    [0.049, 0.012, 0xc23b3b],
    [0.031, 0.012, 0x3a68c4],
    [0.04, 0.021, 0xd7b437],
  ];
  fb.forEach(([x, z, c], k) => {
    const p = b.cyl(`btn${k}`, "plastic", "plastic_glossy", 0.005, 0.004, [x, yt1 + 0.002, z], { segments: 8, tint: c });
    b.press(p, bodyT, 2);
  });
  const dpad = b.box("dpad", "plastic", "plastic_glossy", [0.022, 0.004, 0.022], [-0.04, yt1 + 0.002, 0.012], { tint: 0x2a2a2e });
  b.press(dpad, bodyT, 2);
  // triggers on the front edge + light bar
  for (const sx of [-1, 1]) {
    const tr = b.box(sx < 0 ? "trig_l" : "trig_r", "plastic", "plastic", [0.02, 0.012, 0.012], [sx * 0.04, yp, 0.035 + 0.006], { tint });
    bondTouching(b, tr, [bodyB, bodyT, board], "clip", 5);
  }
  const bar = b.box("lightbar", "plastic", "led_blue", [0.05, 0.004, 0.003], [0, yt0 + 0.006, 0.0365]);
  b.glue(bar, bodyT, 3);
  return b.build();
}

// =============================================================================================
// Cable / satellite receiver box (0.24 × 0.045 × 0.18 m, ~0.75 kg)
// =============================================================================================

export function buildCableBox(o: { seed?: number } = {}): AssemblyDef {
  const b = new Builder("cableBox", "Cable Box", "electronics", 120, o.seed);
  const W = 0.24,
    H = 0.045,
    D = 0.18,
    feet = 0.004,
    t = 0.0006,
    ft = 0.008;
  const f1 = b.box("foot_l", "rubber", "rubber", [0.012, feet, 0.14], [-0.09, feet / 2, -0.01], { tint: 0x111111 });
  const f2 = b.box("foot_r", "rubber", "rubber", [0.012, feet, 0.14], [0.09, feet / 2, -0.01], { tint: 0x111111 });
  const case_ = sheetMetalBox(b, "case", { w: W, h: H - feet, d: D - ft, t, surf: "metal_black", join: "screw", spacing: 0.1, each: 15 }, [0, feet, -ft / 2]);
  b.glue(f1, case_.bottom!, 5);
  b.glue(f2, case_.bottom!, 5);
  const zFront = D / 2 - ft;
  const fascia = b.box("fascia", "plastic", "plastic_glossy", [W, H - feet, ft], [0, feet + (H - feet) / 2, zFront + ft / 2], { tint: 0x101010 });
  bondTouching(b, fascia, case_.all, "clip", 20, 0.001, 3);
  const disp = b.box("display", "plastic", "display_green", [0.05, 0.014, 0.001], [0.05, feet + (H - feet) / 2, D / 2 + 0.0005]);
  b.glue(disp, fascia, 2);
  for (const [k, x] of [-0.07, -0.05].entries()) {
    const btn = b.box(`btn${k}`, "plastic", "plastic", [0.012, 0.006, 0.003], [x, feet + (H - feet) / 2, D / 2 + 0.0015], { tint: 0x2a2a2a });
    b.press(btn, fascia, 2);
  }
  pcb(
    b,
    "board",
    {
      w: 0.2,
      h: 0.13,
      components: [
        { kind: "chip", x: 0.02, y: 0.0 },
        { kind: "chipSmall", x: -0.05, y: 0.04 },
        { kind: "cap", x: -0.07, y: -0.03 },
        { kind: "transformer", x: 0.07, y: -0.035 },
        { kind: "connector", x: 0.0, y: 0.055 },
      ],
      mount: { to: case_.bottom!, screws: 4, each: 10 },
      sparks: 0.7,
    },
    [0, feet + t + 0.0016, -ft / 2 - 0.005],
    [-90, 0, 0],
  );
  return b.build();
}

// =============================================================================================
// Wi-Fi router (0.22 × 0.12 × 0.16 m incl. antennas, ~0.35 kg)
// =============================================================================================

export function buildWifiRouter(o: { seed?: number } = {}): AssemblyDef {
  const b = new Builder("wifiRouter", "Wi-Fi Router", "electronics", 90, o.seed);
  const tint = 0x1e1f22;
  const W = 0.22,
    D = 0.15,
    feet = 0.006;
  const feetP: string[] = [];
  for (const [k, [x, z]] of [
    [-0.09, 0.055],
    [0.09, 0.055],
    [-0.09, -0.055],
    [0.09, -0.055],
  ].entries())
    feetP.push(b.cyl(`foot${k}`, "rubber", "rubber", 0.008, feet, [x, feet / 2, z], { segments: 8, tint: 0x111111 }));
  const hb = 0.013,
    ht = 0.017,
    pt = 0.0016;
  const bot = b.bevelBox("shell_b", "plastic", "plastic", [W, hb, D], 0.003, [0, feet + hb / 2, 0], { tint, mass: 0.11 });
  const board = b.box("pcb", "pcb", "pcb", [W - 0.01, pt, D - 0.01], [0, feet + hb + pt / 2, 0]);
  const top = b.bevelBox("shell_t", "plastic", "plastic", [W, ht, D], 0.004, [0, feet + hb + pt + ht / 2, 0], { tint, mass: 0.1 });
  for (const f of feetP) b.glue(f, bot, 3);
  b.screw(bot, board, 3, 8);
  b.clip(top, board, 12);
  b.sparks(board, 0.5);
  const led = b.box("led", "plastic", "led_green", [0.11, 0.004, 0.003], [0, feet + hb + pt + ht * 0.45, D / 2 + 0.0015]);
  b.glue(led, top, 3);
  for (const [k, x] of [-0.08, -0.027, 0.027, 0.08].entries()) {
    const ant = b.bevelBox(`ant${k}`, "plastic", "plastic", [0.012, 0.11, 0.007], 0.002, [x, feet + 0.004 + 0.055, -D / 2 - 0.0035], { tint, mass: 0.009 });
    b.press(ant, top, 3);
    b.press(ant, bot, 2);
  }
  return b.build();
}

// =============================================================================================
// Soundbar (0.9 × 0.065 × 0.095 m, ~1.4 kg)
// =============================================================================================

export function buildSoundbar(o: { w?: number; seed?: number } = {}): AssemblyDef {
  const b = new Builder("soundbar", "Soundbar", "electronics", 200, o.seed);
  const W = o.w ?? 0.9,
    H = 0.065,
    D = 0.095,
    feet = 0.006,
    t = 0.0025,
    gt = 0.003;
  const tint = 0x1a1a1c;
  const fl = b.box("foot_l", "rubber", "rubber", [0.04, feet, 0.06], [-W * 0.4, feet / 2, -0.005], { tint: 0x111111 });
  const fr = b.box("foot_r", "rubber", "rubber", [0.04, feet, 0.06], [W * 0.4, feet / 2, -0.005], { tint: 0x111111 });
  const sd = D - gt;
  const shell = sheetMetalBox(b, "shell", { w: W, h: H - feet, d: sd, t, mat: "plastic", surf: "plastic", tint, join: "screw", spacing: 0.15, each: 10 }, [0, feet, -gt / 2]);
  b.glue(fl, shell.bottom!, 5);
  b.glue(fr, shell.bottom!, 5);
  const zF = -gt / 2 + sd / 2; // shell front plane
  const yIn0 = feet + t,
    yIn1 = H - t;
  const grille = b.box("grille", "plastic", "speaker_grille", [W, H - feet, gt], [0, feet + (H - feet) / 2, zF + gt / 2], { tint: 0x2a2a2c });
  bondTouching(b, grille, shell.all, "clip", 24, 0.001, 3);
  // internal baffle carrying the drivers
  const bt = 0.004;
  const baffle = b.box("baffle", "plastic", "plastic", [W - 2 * t, yIn1 - yIn0, bt], [0, (yIn0 + yIn1) / 2, zF - 0.008 - bt / 2], { tint: 0x222222 });
  bondTouching(b, baffle, [shell.top!, shell.bottom!, shell.left!, shell.right!], "glue", 30, 0.001, 2);
  for (const [k, x] of [-W * 0.28, W * 0.28].entries()) {
    const cone = b.cyl(`cone${k}`, "paper", "paper", 0.022, 0.006, [x, (yIn0 + yIn1) / 2, zF - 0.008 + 0.003], { axis: "z", segments: 10, tint: 0x2b2b2b, mass: 0.006 });
    const mag = b.cyl(`magnet${k}`, "steel", "metal_raw", 0.015, 0.01, [x, (yIn0 + yIn1) / 2, zF - 0.008 - bt - 0.005], { axis: "z", segments: 10 });
    b.glue(cone, baffle, 6);
    b.screw(mag, baffle, 2, 12);
  }
  pcb(
    b,
    "amp",
    {
      w: 0.15,
      h: 0.05,
      components: [
        { kind: "heatsink", x: -0.03, y: 0.0, size: [0.03, 0.03, 0.02] },
        { kind: "cap", x: 0.025, y: 0.0 },
        { kind: "connector", x: 0.06, y: 0.0 },
      ],
      mount: { to: shell.bottom!, screws: 3, each: 10 },
      sparks: 0.6,
    },
    [0.0, yIn0 + 0.0016, -0.012],
    [-90, 0, 0],
  );
  return b.build();
}

// =============================================================================================
// TV remote control (0.045 × 0.028 × 0.17 m, ~0.11 kg)
// =============================================================================================

export function buildRemoteControl(o: { seed?: number } = {}): AssemblyDef {
  const b = new Builder("remoteControl", "TV Remote", "electronics", 25, o.seed);
  const tint = 0x1c1c1e;
  const W = 0.045,
    L = 0.17,
    hb = 0.0135,
    door = 0.0015,
    wall = 0.0025,
    pcbT = 0.0012,
    ht = 0.01;
  const bayZ0 = -L / 2,
    bayZ1 = -0.005;
  const front = b.bevelBox("shell_b", "plastic", "plastic", [W, hb, L / 2 + 0.005], 0.003, [0, hb / 2, (bayZ1 + L / 2) / 2], { tint, mass: 0.016 });
  const board = b.box("pcb", "pcb", "pcb", [W - 0.005, pcbT, L - 0.01], [0, hb + pcbT / 2, 0]);
  const top = b.bevelBox("shell_t", "plastic", "plastic", [W, ht, L], 0.004, [0, hb + pcbT + ht / 2, 0], { tint, mass: 0.025 });
  b.clip(top, board, 5);
  b.clip(front, board, 5);
  // battery bay: two side walls + end wall fused to the shell, a clip-on door below
  const bayL = bayZ1 - bayZ0;
  const wl = b.box("bay_wall_l", "plastic", "plastic", [wall, hb - door, bayL], [-W / 2 + wall / 2, door + (hb - door) / 2, (bayZ0 + bayZ1) / 2], { tint });
  const wr = b.box("bay_wall_r", "plastic", "plastic", [wall, hb - door, bayL], [W / 2 - wall / 2, door + (hb - door) / 2, (bayZ0 + bayZ1) / 2], { tint });
  const we = b.box("bay_wall_e", "plastic", "plastic", [W - 2 * wall, hb - door, wall], [0, door + (hb - door) / 2, bayZ0 + wall / 2], { tint });
  b.fuse(wl, front, 20);
  b.fuse(wr, front, 20);
  b.fuse(we, wl, 10);
  b.fuse(we, wr, 10);
  for (const w of [wl, wr, we]) b.glue(w, board, 4);
  const doorP = b.box("bay_door", "plastic", "plastic", [W, door, bayL], [0, door / 2, (bayZ0 + bayZ1) / 2], { tint });
  b.clip(doorP, wl, 3);
  b.clip(doorP, wr, 3);
  const zb = (bayZ0 + wall + bayZ1) / 2;
  for (const [k, x] of [-0.0065, 0.0065].entries()) {
    const cell = b.cyl(`battery${k}`, "steel", "aluminum", 0.00525, 0.0445, [x, door + 0.00525, zb], { axis: "z", segments: 8, tint: k ? 0x2a6a3a : 0x2a6a3a, mass: 0.0115, capSurf: "metal_raw" });
    b.friction(cell, doorP, 2);
  }
  // rubber keypad and a few hard buttons
  const yTop = hb + pcbT + ht;
  const pad = b.box("keypad", "rubber", "keycaps", [0.034, 0.0015, 0.1], [0, yTop + 0.00075, -0.015], { tint: 0xdddddd });
  b.glue(pad, top, 6);
  const pwr = b.box("btn_power", "plastic", "plastic_glossy", [0.01, 0.003, 0.007], [-0.01, yTop + 0.0015, 0.075], { tint: 0xc0302a });
  const ok = b.cyl("btn_nav", "plastic", "plastic_glossy", 0.009, 0.003, [0, yTop + 0.0015, 0.055], { segments: 10, tint: 0x3a3a3e });
  b.press(pwr, top, 1.5);
  b.press(ok, top, 2);
  return b.build();
}
