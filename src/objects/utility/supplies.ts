// Laundry-room supplies: detergent jugs, paint cans, a box of spare light bulbs, cardboard
// storage boxes, a steel toolbox and the hand tools that live in it. All loose (grab & throw).
//
// Frame: origin at the centre of the base, sitting on y = 0, front (label) +Z. Hand tools are
// built in their LYING pose (as they rest in the toolbox / on a shelf).

import { hingeAxis } from "../lib/kit.ts";
import { boxR, bondTouching, finish, mk, panelBox, roundedPrismPoints, roundedRectOutline, CHROME, type BaseOpts } from "./helpers.ts";
import type { V3 } from "../lib/builder.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";

// =============================================================================================
// Detergent jug
// =============================================================================================

export interface JugOpts extends BaseOpts {
  kind?: "detergent" | "softener" | "bleach";
}

/** 3 l laundry detergent jug: moulded body with a carry handle, measuring cap, liquid. ~3.3 kg. */
export function buildDetergentJug(o: JugOpts = {}): AssemblyDef {
  const kind = o.kind ?? "detergent";
  const look = { detergent: [0xf0702a, 0x2050b0, 0x3c78d8], softener: [0x8fd0e8, 0xf4f4f2, 0xbfe6f5], bleach: [0xf4f4f0, 0x2a8a3a, 0xe8f0d0] }[kind];
  const b = mk("detergentJug", kind === "bleach" ? "Bleach Jug" : kind === "softener" ? "Fabric Softener" : "Laundry Detergent", "misc", 12, o);
  const w = 0.16,
    d = 0.1,
    h = 0.24;
  // body: rounded block with a shoulder taper
  const pts: V3[] = [...roundedPrismPoints(w, h - 0.04, d, 0.025, 3, 0)];
  for (const p of roundedRectOutline(w * 0.4, d * 0.4, 0.02, 3)) pts.push([p.x + w * 0.18, h, p.z]);
  const body = b.hull("body", "plastic", "plastic_glossy", pts, [0, 0, 0], { tint: look[0], mass: 3.15 });
  const label = boxR(b, "label", "paper", "label_bottle", [-0.06, 0.06], [0.04, 0.15], [d / 2, d / 2 + 0.0006], { mass: 0.003 });
  b.glue(label, body, 4);
  const cap = b.cyl("cap", "plastic", "plastic_glossy", 0.032, 0.045, [w * 0.18, h + 0.0225, 0], { segments: 12, tint: look[1], mass: 0.04 });
  b.press(cap, body, 12);
  // carry handle: a moulded loop over the back shoulder; its end segments leave the sloped
  // shoulder along its normal, sunk 1.5 mm into it (fused like a moulding)
  const sx0 = -w / 2,
    sy0 = h - 0.04,
    sx1 = w * 0.18 - w * 0.4,
    sy1 = h; // shoulder line (back side)
  const sl = Math.hypot(sx1 - sx0, sy1 - sy0);
  const nx = -(sy1 - sy0) / sl,
    ny = (sx1 - sx0) / sl; // outward normal of the shoulder
  const on = (t: number, out: number): V3 => [sx0 + (sx1 - sx0) * t + nx * out, sy0 + (sy1 - sy0) * t + ny * out, 0];
  const handle = b.tube("handle", "plastic", "plastic_glossy", [on(0.3, -0.0015), on(0.3, 0.035), on(0.85, 0.035), on(0.85, -0.0015)], 0.0095, {
    sides: 6,
    tint: look[0],
    mass: 0.06,
  });
  for (const e of [handle[0], handle[handle.length - 1]]) bondTouching(b, e, [body], "fused", 40, 0.003);
  b.liquid(body, look[2], 3);
  return finish(b, o);
}

// =============================================================================================
// Paint can
// =============================================================================================

export interface PaintCanOpts extends BaseOpts {
  /** Paint colour (liquid + lid smear). */
  color?: number;
  /** 1 gallon (3.8 l) or 1 quart. */
  size?: "gallon" | "quart";
}

/** Steel paint can (tinplate, dentable) with a press-fit lid, wire bail and 3.8 l of paint. */
export function buildPaintCan(o: PaintCanOpts = {}): AssemblyDef {
  const gal = (o.size ?? "gallon") === "gallon";
  const b = mk("paintCan", gal ? "Paint Can (1 gal)" : "Paint Can (1 qt)", "misc", gal ? 35 : 15, o);
  const r = gal ? 0.084 : 0.054;
  const h = gal ? 0.19 : 0.12;
  const litres = gal ? 3.785 : 0.946;
  const color = o.color ?? 0xe8e4da;
  const body = b.cyl("body", "steelSheet", "label_bottle", r, h - 0.006, [0, (h - 0.006) / 2, 0], { segments: 14, capSurf: "metal_raw", mass: (gal ? 0.33 : 0.12) + litres * 1.25, tess: 0.03 });
  const lid = b.cyl("lid", "steelSheet", "metal_raw", r - 0.004, 0.006, [0, h - 0.003, 0], { segments: 14, mass: gal ? 0.05 : 0.02, tint: color });
  b.press(lid, body, 14); // pry it off with a screwdriver... or a sledgehammer
  // bail: wire handle hooked into two ears, standing over the lid
  const earY = h - 0.03;
  const ears: string[] = [];
  for (const sx of [-1, 1]) {
    ears.push(boxR(b, `ear_${sx < 0 ? "l" : "r"}`, "steel", "metal_raw", sx < 0 ? [-r - 0.006, -r] : [r, r + 0.006], [earY - 0.012, earY + 0.012], [-0.008, 0.008], { tess: 0, mass: 0.006 }));
    b.weld(ears[ears.length - 1], body, 25);
  }
  // wire bail: straight up from the ears, then an arc clear over the lid
  const R = r + 0.006 + 0.0018;
  const yArc = h + 0.006;
  const bail: V3[] = [[-R, earY, 0]];
  for (let k = 0; k <= 8; k++) {
    const a = (Math.PI * k) / 8;
    bail.push([-R * Math.cos(a), yArc + 0.06 * Math.sin(a), 0]);
  }
  bail.push([R, earY, 0]);
  const wire = b.tube("bail", "steel", "metal_raw", bail, 0.0018, { sides: 5, kgPerM: 0.08, jointStrength: 40, tess: 0 });
  b.bond(wire[0], ears[0], "clip", { strength: 20 });
  b.bond(wire[wire.length - 1], ears[1], "clip", { strength: 20 });
  b.liquid(body, color, litres);
  return finish(b, o);
}

// =============================================================================================
// Cardboard boxes
// =============================================================================================

export interface BulbBoxOpts extends BaseOpts {
  bulbs?: number;
}

/** Retail 4-pack of A19 light bulbs: printed cardboard box with the glass bulbs lying inside. */
export function buildBulbBox(o: BulbBoxOpts = {}): AssemblyDef {
  const b = mk("bulbBox", "Light Bulbs (4-pack)", "misc", 12, o);
  const n = Math.max(1, Math.min(4, o.bulbs ?? 4));
  const W = 0.25,
    H = 0.068,
    D = 0.125;
  const box = panelBox(b, "box", { w: W, h: H, d: D, t: 0.0012, mat: "cardboard", surf: "cardboard", tint: 0xf2efe6, faces: { top: true }, faceSurf: { front: "label_food", top: "label_food" }, bond: "glue", strength: 6, kg: 0.06 });
  for (let k = 0; k < n; k++) {
    const x = (k - 1.5) * 0.06;
    const yc = 0.0012 + 0.0302;
    // glass envelope (pear shape) towards +Z, aluminium cap towards −Z
    const pts: V3[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (2 * Math.PI * i) / 10;
      for (const [rr, z] of [
        [0.012, -0.022],
        [0.024, 0.0],
        [0.03, 0.02],
        [0.025, 0.04],
        [0.012, 0.052],
      ] as Array<[number, number]>)
        pts.push([x + rr * Math.cos(a), yc + rr * Math.sin(a), z]);
    }
    const glass = b.hull(`bulb${k}_glass`, "glass", "bulb_off", pts, [0, 0, 0], { mass: 0.028, smooth: 1 });
    const cap = b.cyl(`bulb${k}_cap`, "aluminum", "aluminum", 0.0128, 0.026, [x, yc, -0.022 - 0.013], { axis: "z", segments: 8, mass: 0.01, tess: 0 });
    b.glue(glass, cap, 5);
    b.friction(glass, box.bottom!, 1);
  }
  return finish(b, o);
}

export interface StorageBoxOpts extends BaseOpts {
  w?: number;
  h?: number;
  d?: number;
  /** Mass of the contents (kg); 0 = empty. */
  contents?: number;
  tint?: number;
}

/** Corrugated cardboard storage box with a lid flap and (optionally) soft contents. */
export function buildStorageBox(o: StorageBoxOpts = {}): AssemblyDef {
  const b = mk("storageBox", "Storage Box", "misc", 5, o);
  const w = o.w ?? 0.4,
    h = o.h ?? 0.26,
    d = o.d ?? 0.3;
  const t = 0.004;
  const box = panelBox(b, "box", { w, h, d, t, mat: "cardboard", surf: "cardboard", tint: o.tint ?? 0xc9a77c, faces: { top: true }, bond: "glue", strength: 15 });
  const kg = o.contents ?? 1.5;
  if (kg > 0) {
    // clothes / linens folded inside
    const c = b.pillow("contents", "fabric", "fabric_cotton", [w - 2 * t - 0.01, Math.min(h * 0.55, h - 2 * t - 0.01), d - 2 * t - 0.01], 0.3, [0, t + Math.min(h * 0.55, h - 2 * t - 0.01) / 2, 0], { tint: 0x8090a8, mass: kg });
    b.friction(c, box.bottom!, 2);
  }
  return finish(b, o);
}

// =============================================================================================
// Toolbox + hand tools
// =============================================================================================

export const TOOLBOX = { w: 0.46, h: 0.2, d: 0.22, t: 0.0008 } as const;

/** Steel cantilever-less toolbox: welded tray, hinged lid with two latches and a carry handle. ~3 kg. */
export function buildToolbox(o: BaseOpts & { tint?: number } = {}): AssemblyDef {
  const b = mk("toolbox", "Steel Toolbox", "tool", 40, o);
  const { w, d } = TOOLBOX;
  const t = TOOLBOX.t;
  const hTray = 0.15;
  const red = o.tint ?? 0xb3241f;
  const tray = panelBox(b, "tray", { w, h: hTray, d, t, mat: "steelSheet", surf: "metal_painted", tint: red, bond: "weld", strength: 90, tess: 0.04 });
  // lid: top plate with skirts, hinged along the back edge
  const lh = TOOLBOX.h - hTray;
  const lid = panelBox(b, "lid", { w, h: lh, d, t, mat: "steelSheet", surf: "metal_painted", tint: red, faces: { top: true, bottom: false }, bond: "weld", strength: 60, tess: 0.04 }, [0, hTray, 0]);
  const lidTop = lid.top!;
  const ax = hingeAxis([0, 0, 1], [0, 1, 0]); // free edge towards the front, opens upwards
  b.hinge(lid.back!, tray.back!, {
    pivots: [
      [-w / 2 + 0.04, hTray, -d / 2],
      [w / 2 - 0.04, hTray, -d / 2],
    ],
    axis: [ax.x, ax.y, ax.z],
    min: 0,
    max: 110,
    strength: 40,
    friction: 0.15,
    latch: 25,
    latchPos: [0, hTray, d / 2],
    latchFixed: tray.front!,
  });
  // latch clips on the front (visual + they are what the latch bond represents)
  for (const sx of [-1, 1]) {
    const clip = boxR(b, `latch_${sx < 0 ? "l" : "r"}`, "steel", "metal_raw", [sx * 0.15 - 0.015, sx * 0.15 + 0.015], [hTray - 0.025, hTray + 0.012], [d / 2, d / 2 + 0.004], { tess: 0, mass: 0.02 });
    b.weld(clip, tray.front!, 25);
  }
  // carry handle on the lid
  const hp = b.tube(
    "handle",
    "steel",
    "chrome",
    [
      [-0.09, TOOLBOX.h + 0.0004, 0],
      [-0.09, TOOLBOX.h + 0.03, 0],
      [0.09, TOOLBOX.h + 0.03, 0],
      [0.09, TOOLBOX.h + 0.0004, 0],
    ],
    0.006,
    { sides: 6, kgPerM: 0.18, jointStrength: 100, tess: 0 },
  );
  b.weld(hp[0], lidTop, 60);
  b.weld(hp[hp.length - 1], lidTop, 60);
  return finish(b, o);
}

/** Claw hammer lying on its side (handle along X, head at +X). ~0.6 kg. */
export function buildHammer(o: BaseOpts = {}): AssemblyDef {
  const b = mk("hammer", "Claw Hammer", "tool", 18, o);
  const handle = b.bevelBox("handle", "hardwood", "wood_oak", [0.3, 0.024, 0.03], 0.006, [-0.01, 0.012, 0], { grain: "x", tint: 0xd8b07a });
  const head = boxR(b, "head", "steel", "metal_raw", [0.14, 0.165], [0.0, 0.025], [-0.04, 0.032], { tess: 0 });
  const face = b.cyl("face", "steel", "metal_raw", 0.0125, 0.02, [0.1525, 0.0125, 0.042], { axis: "z", segments: 10 });
  const claw = b.hull(
    "claw",
    "steel",
    "metal_raw",
    [
      [0.14, 0.0, -0.04],
      [0.165, 0.0, -0.04],
      [0.14, 0.025, -0.04],
      [0.165, 0.025, -0.04],
      [0.146, 0.0, -0.085],
      [0.159, 0.0, -0.085],
      [0.146, 0.014, -0.085],
      [0.159, 0.014, -0.085],
    ],
    [0, 0, 0],
  );
  b.weld(face, head, 300);
  b.weld(claw, head, 300);
  b.bond(handle, head, "glue", { strength: 120 }); // wedged + epoxy in the eye
  return finish(b, o);
}

export interface ScrewdriverOpts extends BaseOpts {
  tint?: number;
  len?: number;
}

/** Screwdriver lying flat (axis along X, tip at +X). */
export function buildScrewdriver(o: ScrewdriverOpts = {}): AssemblyDef {
  const b = mk("screwdriver", "Screwdriver", "tool", 6, o);
  const len = o.len ?? 0.12;
  const handle = b.cyl("handle", "plastic", "plastic_glossy", 0.015, 0.1, [-0.05, 0.015, 0], { axis: "x", segments: 8, tint: o.tint ?? 0xd6282b, mass: 0.05 });
  const shaft = b.cyl("shaft", "steel", "chrome", 0.0032, len, [len / 2, 0.015, 0], { axis: "x", segments: 6 });
  b.press(shaft, handle, 80);
  return finish(b, o);
}

/** Adjustable wrench lying flat (handle along X, jaws at +X). ~0.3 kg. */
export function buildWrench(o: BaseOpts = {}): AssemblyDef {
  const b = mk("wrench", "Adjustable Wrench", "tool", 15, o);
  const handle = b.hull(
    "handle",
    "steel",
    "chrome",
    [
      [-0.11, 0, -0.009],
      [-0.11, 0, 0.009],
      [-0.11, 0.008, -0.009],
      [-0.11, 0.008, 0.009],
      [0.04, 0, -0.012],
      [0.04, 0, 0.012],
      [0.04, 0.009, -0.012],
      [0.04, 0.009, 0.012],
    ],
    [0, 0, 0],
  );
  const head = b.hull(
    "head",
    "steel",
    "chrome",
    [
      [0.04, 0, -0.012],
      [0.04, 0, 0.012],
      [0.04, 0.012, -0.012],
      [0.04, 0.012, 0.012],
      [0.085, 0, -0.028],
      [0.085, 0, 0.022],
      [0.085, 0.012, -0.028],
      [0.085, 0.012, 0.022],
      [0.1, 0, 0.0],
      [0.1, 0.012, 0.0],
    ],
    [0, 0, 0],
  );
  b.weld(head, handle, 400);
  return finish(b, o);
}

/** Slip-joint pliers lying flat: two forged halves on a pivot (hinge), plastic grips. */
export function buildPliers(o: BaseOpts = {}): AssemblyDef {
  const b = mk("pliers", "Pliers", "tool", 12, o);
  const y0 = 0,
    th = 0.009;
  const halves: string[] = [];
  for (const [k, s] of [
    ["a", 1],
    ["b", -1],
  ] as Array<[string, number]>) {
    const yb = k === "a" ? y0 : y0 + th; // stacked at the pivot
    const jaw = b.hull(
      `jaw_${k}`,
      "steel",
      "metal_raw",
      [
        [0.0, yb, 0],
        [0.0, yb + th, 0],
        [0.0, yb, s * 0.012],
        [0.0, yb + th, s * 0.012],
        [0.055, yb, s * 0.002],
        [0.055, yb + th, s * 0.002],
        [0.055, yb, s * 0.006],
        [0.055, yb + th, s * 0.006],
      ],
      [0, 0, 0],
    );
    const arm = b.hull(
      `arm_${k}`,
      "steel",
      "metal_raw",
      [
        [0.0, yb, 0],
        [0.0, yb + th, 0],
        [0.0, yb, s * 0.012],
        [0.0, yb + th, s * 0.012],
        [-0.03, yb, s * 0.0145],
        [-0.03, yb + th, s * 0.0145],
        [-0.03, yb, s * 0.0225],
        [-0.03, yb + th, s * 0.0225],
      ],
      [0, 0, 0],
    );
    b.weld(jaw, arm, 300);
    const grip = b.hull(
      `grip_${k}`,
      "rubber",
      "rubber",
      [
        [-0.03, yb, s * 0.0145],
        [-0.03, yb + th, s * 0.0145],
        [-0.03, yb, s * 0.0225],
        [-0.03, yb + th, s * 0.0225],
        [-0.12, yb, s * 0.022],
        [-0.12, yb + th, s * 0.022],
        [-0.12, yb, s * 0.031],
        [-0.12, yb + th, s * 0.031],
      ],
      [0, 0, 0],
      { tint: s > 0 ? 0xd83a2a : 0x2a5ad8, mass: 0.05 },
    );
    b.glue(grip, arm, 40); // rubber-dipped steel handle continues the forged arm
    halves.push(arm, jaw);
  }
  // rivet pivot: the two halves rotate about the vertical axis through the rivet
  b.hinge(halves[2], halves[0], { pivots: [[0.0, th, 0.006]], axis: [0, 1, 0], min: -25, max: 0, strength: 80, friction: 0.6 });
  // the lower half stands on a thin washer so both halves rest on y = 0
  const pad = boxR(b, "pad", "rubber", "rubber", [-0.11, -0.04], [0, th], [-0.03, -0.024], { tint: 0x2a5ad8, mass: 0.004 });
  b.glue(pad, `grip_b`, 4);
  void CHROME;
  return finish(b, o);
}
