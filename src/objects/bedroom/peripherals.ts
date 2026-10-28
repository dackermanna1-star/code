// Desk peripherals.
//  * buildMonitor: 24" LCD — plastic bezel bars, LCD glass (`screen`), diffuser, steel backlight
//    tray, main + power boards (sparks), rear cover (back plate + rim walls), VESA plate,
//    aluminium neck and weighted steel base.
//  * buildKeyboard: tenkeyless mechanical keyboard — bottom shell, rim walls, PCB, steel switch
//    plate and 87 individual press-fit keycaps (they fly off when the board is smashed).
//  * buildMouse: base plate, shell, two buttons, wheel on a wheel block.
//  * buildSpeaker: MDF cabinet (6 panels), paper woofer cone, tweeter dome, ferrite magnet.
// Local frames: origin at the centre of the underside; the screen / near edge / buttons face +Z.
// PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { Builder } from "../lib/builder.ts";
import { frameBarPoints, pcb } from "../lib/kit.ts";
import { boxR, finish, mk, PAL, type BaseOpts } from "./common.ts";

// ------------------------------------------------------------------ monitor

export interface MonitorOpts extends BaseOpts {
  on?: boolean;
}

export const MONITOR = { w: 0.545, h: 0.325, panelY0: 0.1, baseW: 0.25, baseZ: [-0.125, 0.085] as const, zFront: 0.035 } as const;

export function buildMonitor(o: MonitorOpts = {}): AssemblyDef {
  const b = mk("monitor", "24\" Monitor", "electronics", 220, o);
  const { w: W, h: H, panelY0, zFront: zF } = MONITOR;
  const bz = 0.01;
  const yc = panelY0 + H / 2;
  const dark = { tint: 0x17181a };
  let backPlate = "";
  b.group([0, yc, 0], undefined, "panel_", () => {
    const bars = frameBarPoints(W, H, bz, zF - 0.009, zF);
    const bt = b.hull("bezel_t", "plastic", "plastic", bars.top, [0, 0, 0], dark);
    const bb = b.hull("bezel_b", "plastic", "plastic", bars.bottom, [0, 0, 0], dark);
    const bl = b.hull("bezel_l", "plastic", "plastic", bars.left, [0, 0, 0], dark);
    const br = b.hull("bezel_r", "plastic", "plastic", bars.right, [0, 0, 0], dark);
    b.fuse(bt, bl, 20);
    b.fuse(bt, br, 20);
    b.fuse(bb, bl, 20);
    b.fuse(bb, br, 20);
    const iw = W - 2 * bz,
      ih = H - 2 * bz;
    const lcd = boxR(b, "lcd", "lcd", "lcd_off", [-iw / 2, iw / 2], [-ih / 2, ih / 2], [zF - 0.004, zF - 0.001], {
      faces: { px: { surf: "plastic", ...dark }, nx: { surf: "plastic", ...dark }, py: { surf: "plastic", ...dark }, ny: { surf: "plastic", ...dark } },
    });
    const diff = boxR(b, "diffuser", "plastic", "plastic", [-iw / 2, iw / 2], [-ih / 2, ih / 2], [zF - 0.007, zF - 0.004], { tint: 0xe8e8e8 });
    const tray = boxR(b, "tray", "steelSheet", "metal_raw", [-iw / 2, iw / 2], [-ih / 2, ih / 2], [zF - 0.0076, zF - 0.007], { tess: 0.06 });
    for (const bar of [bt, bb, bl, br]) {
      b.clip(lcd, bar, 4);
      b.clip(tray, bar, 6);
    }
    b.glue(lcd, diff, 8);
    b.clip(diff, tray, 6);
    b.screen(lcd, "monitor", { on: o.on ?? true });
    // rear cover: rim walls + back plate
    const z0 = zF - 0.032,
      z1 = zF - 0.009;
    const rt = boxR(b, "rim_t", "plastic", "plastic", [-W / 2, W / 2], [H / 2 - 0.002, H / 2], [z0, z1], dark);
    const rb = boxR(b, "rim_b", "plastic", "plastic", [-W / 2, W / 2], [-H / 2, -H / 2 + 0.002], [z0, z1], dark);
    const rl = boxR(b, "rim_l", "plastic", "plastic", [-W / 2, -W / 2 + 0.002], [-H / 2 + 0.002, H / 2 - 0.002], [z0, z1], dark);
    const rr = boxR(b, "rim_r", "plastic", "plastic", [W / 2 - 0.002, W / 2], [-H / 2 + 0.002, H / 2 - 0.002], [z0, z1], dark);
    b.clip(rt, bt, 6);
    b.clip(rb, bb, 6);
    b.clip(rl, bl, 6);
    b.clip(rr, br, 6);
    backPlate = boxR(b, "back", "plastic", "plastic", [-W / 2, W / 2], [-H / 2, H / 2], [zF - 0.0345, z0], dark);
    for (const r of [rt, rb, rl, rr]) b.clip(backPlate, r, 8);
    // boards on the back of the backlight tray (components facing the rear cover)
    pcb(
      b,
      "main_board",
      {
        w: 0.16,
        h: 0.08,
        components: [
          { kind: "chip", x: -0.03, y: 0.01 },
          { kind: "chipSmall", x: 0.04, y: 0.02 },
          { kind: "connector", x: 0.05, y: -0.028 },
        ],
        mount: { to: tray, screws: 4, each: 6 },
        sparks: 0.6,
      },
      [0.1, -0.06, zF - 0.0092],
      [0, 180, 0],
    );
    pcb(
      b,
      "power_board",
      {
        w: 0.12,
        h: 0.07,
        components: [
          { kind: "transformer", x: -0.02, y: 0.0 },
          { kind: "cap", x: 0.035, y: 0.015 },
          { kind: "cap", x: 0.035, y: -0.015 },
        ],
        mount: { to: tray, screws: 4, each: 6 },
        sparks: 0.8,
      },
      [-0.12, -0.06, zF - 0.0092],
      [0, 180, 0],
    );
  });
  // stand: VESA plate, neck, weighted base
  const vesa = boxR(b, "vesa", "steel", "metal_raw", [-0.05, 0.05], [yc - 0.05, yc + 0.05], [zF - 0.0375, zF - 0.0345], { tess: 0 });
  b.screw(vesa, backPlate, 4, 15);
  const zN0 = zF - 0.0575,
    zN1 = zF - 0.0375;
  const baseT = 0.012;
  const neck = boxR(b, "neck", "aluminum", "aluminum", [-0.025, 0.025], [baseT, yc + 0.05], [zN0, zN1], { mass: 0.45, tess: 0, tint: 0x3b3d42 });
  b.bolt(neck, vesa, 60);
  const base = boxR(b, "base", "steel", "metal_black", [-MONITOR.baseW / 2, MONITOR.baseW / 2], [0, baseT], [MONITOR.baseZ[0], MONITOR.baseZ[1]], { mass: 1.3, tess: 0 });
  b.screw(neck, base, 3, 30);
  return finish(b, o);
}

// ------------------------------------------------------------------ keyboard

export interface KeyboardOpts extends BaseOpts {
  tint?: number;
}

export const KEYBOARD = { w: 0.362, d: 0.135, h: 0.0315 } as const;

const U = 0.01905;
/** TKL rows (back → front): [width in u | negative = gap] for the main block, then the nav cluster keys present (3 columns). */
const ROWS: Array<{ main: number[]; nav: Array<0 | 1> }> = [
  { main: [1, -1, 1, 1, 1, 1, -0.5, 1, 1, 1, 1, -0.5, 1, 1, 1, 1], nav: [1, 1, 1] },
  { main: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2], nav: [1, 1, 1] },
  { main: [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5], nav: [1, 1, 1] },
  { main: [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25], nav: [0, 0, 0] },
  { main: [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75], nav: [0, 1, 0] },
  { main: [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25], nav: [1, 1, 1] },
];
/** Row centre z (back → front). */
const ROW_Z = [-0.05, -0.0262, -0.0071, 0.0119, 0.031, 0.05];

/** One sculpted keycap: hull of the bottom rectangle and a smaller, slightly rear-shifted top. */
function keycap(b: Builder, name: string, cx: number, cz: number, wu: number, y0: number, tint: number, on: string): string {
  const w = wu * U - 0.001,
    d = U - 0.001;
  const h = 0.008;
  const tw = w - 0.006,
    td = d - 0.0055;
  const pts: Array<[number, number, number]> = [];
  for (const [a, c] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    pts.push([cx + (a * w) / 2, y0, cz + (c * d) / 2]);
    pts.push([cx + (a * tw) / 2, y0 + h, cz - 0.0008 + (c * td) / 2]);
  }
  const k = b.hull(name, "plastic", "keycaps", pts, [0, 0, 0], { tint });
  b.press(k, on, 2);
  return k;
}

export function buildKeyboard(o: KeyboardOpts = {}): AssemblyDef {
  const b = mk("keyboard", "Mechanical Keyboard", "electronics", 120, o);
  const { w, d } = KEYBOARD;
  const tint = o.tint ?? 0x232427;
  const C = { tint };
  const footH = 0.004;
  const yB0 = footH,
    yB1 = footH + 0.0025;
  const wallT = 0.0025,
    yW1 = 0.022;
  const bottom = boxR(b, "case_bottom", "plastic", "plastic", [-w / 2, w / 2], [yB0, yB1], [-d / 2, d / 2], C);
  const walls = [
    boxR(b, "wall_f", "plastic", "plastic", [-w / 2, w / 2], [yB1, yW1], [d / 2 - wallT, d / 2], C),
    boxR(b, "wall_b", "plastic", "plastic", [-w / 2, w / 2], [yB1, yW1], [-d / 2, -d / 2 + wallT], C),
    boxR(b, "wall_l", "plastic", "plastic", [-w / 2, -w / 2 + wallT], [yB1, yW1], [-d / 2 + wallT, d / 2 - wallT], C),
    boxR(b, "wall_r", "plastic", "plastic", [w / 2 - wallT, w / 2], [yB1, yW1], [-d / 2 + wallT, d / 2 - wallT], C),
  ];
  for (const wl of walls) b.clip(wl, bottom, 10);
  b.fuse(walls[2], walls[0], 8);
  b.fuse(walls[2], walls[1], 8);
  b.fuse(walls[3], walls[0], 8);
  b.fuse(walls[3], walls[1], 8);
  const board = boxR(b, "pcb", "pcb", "pcb", [-w / 2 + wallT + 0.002, w / 2 - wallT - 0.002], [0.0105, 0.0121], [-d / 2 + wallT + 0.002, d / 2 - wallT - 0.002], { tint: 0x1d2b4a });
  b.screw(board, bottom, 6, 4);
  b.sparks(board, 0.4);
  const plate = boxR(b, "plate", "steel", "metal_black", [-w / 2 + wallT, w / 2 - wallT], [0.0175, 0.019], [-d / 2 + wallT, d / 2 - wallT], { tess: 0 });
  for (const wl of walls) b.clip(plate, wl, 8);
  b.screw(plate, board, 4, 6); // through the switches
  // keycaps
  const yK = 0.019 + 0.0045;
  const x0 = -(18.25 * U) / 2;
  const alpha = 0xd9d6cf,
    mod = 0x8f9093,
    accent = 0xc4523b;
  let n = 0;
  ROWS.forEach((row, r) => {
    let x = x0;
    row.main.forEach((wu, i) => {
      if (wu < 0) {
        x -= wu * U;
        return;
      }
      const cx = x + (wu * U) / 2;
      const isMod = wu > 1.01 || (r === 0 && i > 0) || r === 5;
      const tintK = r === 0 && i === 0 ? accent : isMod ? mod : alpha;
      keycap(b, `key_r${r}_${n}`, cx, ROW_Z[r], wu, yK, tintK, plate);
      n++;
      x += wu * U;
    });
    const nx0 = x0 + 15.25 * U;
    row.nav.forEach((has, c) => {
      if (!has) return;
      keycap(b, `key_r${r}_${n}`, nx0 + (c + 0.5) * U, ROW_Z[r], 1, yK, mod, plate);
      n++;
    });
  });
  for (const [sx, sz, nm] of [
    [-1, -1, "bl"],
    [1, -1, "br"],
    [-1, 1, "fl"],
    [1, 1, "fr"],
  ] as Array<[number, number, string]>) {
    const f = boxR(b, `foot_${nm}`, "rubber", "rubber", [sx * (w / 2 - 0.035) - 0.015, sx * (w / 2 - 0.035) + 0.015], [0, footH], [sz * (d / 2 - 0.015) - 0.006, sz * (d / 2 - 0.015) + 0.006], { tint: PAL.rubber });
    b.glue(f, bottom, 4);
  }
  return finish(b, o);
}

// ------------------------------------------------------------------ mouse

export interface MouseOpts extends BaseOpts {
  tint?: number;
}

export const MOUSE = { w: 0.064, l: 0.118, h: 0.039 } as const;

export function buildMouse(o: MouseOpts = {}): AssemblyDef {
  const b = mk("mouse", "Mouse", "electronics", 40, o);
  const tint = o.tint ?? 0x1e1f22;
  const L = MOUSE.l,
    HW = MOUSE.w / 2;
  const y0 = 0.004;
  const base = boxR(b, "base", "plastic", "plastic", [-HW + 0.002, HW - 0.002], [0, y0], [-L / 2 + 0.003, L / 2 - 0.003], { tint: 0x111111 });
  // dome profile: half-width and height as functions of z
  const hw = (z: number): number => HW * (0.82 + 0.18 * Math.cos((z / (L / 2)) * 1.3));
  const ht = (z: number): number => y0 + 0.035 * Math.max(0.35, 1 - Math.pow((z + 0.012) / (L / 2 + 0.012), 2));
  const section = (z: number, xa: number, xb: number, out: Array<[number, number, number]>): void => {
    const n = 6;
    for (let k = 0; k <= n; k++) {
      const a = (Math.PI * k) / n; // 0..π across the dome
      const x = -Math.cos(a) * hw(z);
      if (x < xa - 1e-9 || x > xb + 1e-9) continue;
      out.push([x, y0 + (ht(z) - y0) * Math.sin(a) + 0.001, z]);
    }
    out.push([Math.max(xa, -hw(z)), y0, z], [Math.min(xb, hw(z)), y0, z]);
    // keep the cut edges of the buttons exact
    if (xa > -hw(z)) out.push([xa, y0, z], [xa, y0 + (ht(z) - y0) * Math.sqrt(Math.max(0, 1 - (xa / hw(z)) ** 2)), z]);
    if (xb < hw(z)) out.push([xb, y0, z], [xb, y0 + (ht(z) - y0) * Math.sqrt(Math.max(0, 1 - (xb / hw(z)) ** 2)), z]);
  };
  const shellPts: Array<[number, number, number]> = [];
  for (const z of [-L / 2, -0.04, -0.02, 0.0]) section(z, -1, 1, shellPts);
  const shell = b.hull("shell", "plastic", "plastic", shellPts, [0, 0, 0], { tint, mass: 0.04, smooth: 1 });
  b.clip(shell, base, 8);
  const btns: string[] = [];
  for (const [nm, xa, xb] of [
    ["button_l", 0.006, 1],
    ["button_r", -1, -0.006],
  ] as Array<[string, number, number]>) {
    const pts: Array<[number, number, number]> = [];
    for (const z of [0.0, 0.025, L / 2 - 0.004]) section(z, xa, xb, pts);
    const bt = b.hull(nm, "plastic", "plastic", pts, [0, 0, 0], { tint, mass: 0.008, smooth: 1 });
    b.clip(bt, shell, 3);
    b.press(bt, base, 2);
    btns.push(bt);
  }
  const block = boxR(b, "wheel_block", "plastic", "plastic", [-0.005, 0.005], [y0, ht(0.02) - 0.016], [0.006, 0.034], { tint: 0x111111 });
  b.clip(block, base, 5);
  const wheel = b.cyl("wheel", "rubber", "rubber", 0.01, 0.008, [0, ht(0.02) - 0.006, 0.02], { axis: "x", segments: 12 });
  b.press(wheel, block, 2);
  void btns;
  return finish(b, o);
}

// ------------------------------------------------------------------ speaker

export interface SpeakerOpts extends BaseOpts {
  tint?: number;
}

export const SPEAKER = { w: 0.1, h: 0.17, d: 0.13 } as const;

export function buildSpeaker(o: SpeakerOpts = {}): AssemblyDef {
  const b = mk("speaker", "Desktop Speaker", "electronics", 45, o);
  const { w, h, d } = SPEAKER;
  const t = 0.008,
    bt = 0.01;
  const tint = o.tint ?? 0x25262a;
  const C = { tint };
  const top = boxR(b, "top", "mdf", "metal_black", [-w / 2, w / 2], [h - t, h], [-d / 2, d / 2], C);
  const bottom = boxR(b, "bottom", "mdf", "metal_black", [-w / 2, w / 2], [0, t], [-d / 2, d / 2], C);
  const sl = boxR(b, "side_l", "mdf", "metal_black", [-w / 2, -w / 2 + t], [t, h - t], [-d / 2, d / 2], C);
  const sr = boxR(b, "side_r", "mdf", "metal_black", [w / 2 - t, w / 2], [t, h - t], [-d / 2, d / 2], C);
  const back = boxR(b, "back", "mdf", "metal_black", [-w / 2 + t, w / 2 - t], [t, h - t], [-d / 2, -d / 2 + t], C);
  const baffle = boxR(b, "baffle", "mdf", "speaker_grille", [-w / 2 + t, w / 2 - t], [t, h - t], [d / 2 - bt, d / 2], { tint: 0x2e2f33 });
  for (const s of [sl, sr]) {
    b.glue(s, top, 25);
    b.glue(s, bottom, 25);
  }
  for (const p of [back, baffle]) for (const q of [top, bottom, sl, sr]) b.glue(p, q, 12);
  // woofer cone (paper) proud of the baffle, ferrite magnet behind it, tweeter dome above
  const coneY = 0.065;
  const cone = b.cyl("woofer", "paper", "paper", 0.036, 0.012, [0, coneY, d / 2 + 0.006], { axis: "z", rTop: 0.014, segments: 12, tint: 0x1a1a1a });
  b.glue(cone, baffle, 8);
  const magnet = b.cyl("magnet", "ceramic", "metal_raw", 0.024, 0.014, [0, coneY, d / 2 - bt - 0.007], { axis: "z", segments: 12, tint: 0x5a5a5a });
  b.glue(magnet, baffle, 15);
  const tweeter = b.cyl("tweeter", "plastic", "plastic", 0.013, 0.006, [0, 0.135, d / 2 + 0.003], { axis: "z", rTop: 0.008, segments: 10, tint: 0x111111 });
  b.glue(tweeter, baffle, 6);
  b.sparks(magnet, 0.2);
  return finish(b, o);
}
