// =============================================================================================
// KIT — reusable, realistic sub-assemblies for destructible objects (+ a short guide)
// =============================================================================================
//
// HOW TO BUILD A GOOD DESTRUCTIBLE OBJECT (read this before writing a builder)
//
//  1. Start from how the real thing is made. Picture a teardown: which panels, how thick, what
//     is inside, what holds it together? A microwave is a bent steel wrapper screwed to a base,
//     a spot-welded cavity, a magnetron, a 3 kg transformer, a PCB behind a plastic fascia...
//     A kitchen cabinet is 16-18 mm laminated particleboard with dowels/cams, a 3 mm hardboard
//     back stapled on, shelves resting on pins. Model THAT and the destruction comes for free.
//  2. Frame: origin at the base centre on the floor, +Y up, front faces +Z. Real dimensions in
//     metres. Hollow things are hollow: thin panels with their real thickness, not solid blocks.
//  3. Every part is convex. Curved shells = tiles (b.lathe / b.arcPanel / b.torus), rings and
//     handles = b.tube along a path, frames = mitred bars (frameBars below).
//  4. The material decides the behaviour: glass shatters, tempered glass dices, wood splinters
//     along its grain (set `grain` on odd shapes; boxes use their longest axis), MDF /
//     particleboard / drywall crumble, sheet metal dents (tessellated) and pops its welds,
//     plastic cracks, soft goods absorb and tear. Use the real material and tune the mass with
//     thickness, not magic numbers. `mass` overrides are only for hollow or stuffed parts
//     (honeycomb cores, pillows, cords, a magnetron's hollow yoke).
//  5. Bonds are the joinery: one bond per real joint, with the real fastener kind and a
//     strength from the fastener count (fastenSeam / screwGrid / glueByArea). Typical joules:
//     press-fit button 2, plastic clip 6, staple 6-8, wood screw 30-35, dowel 40, cam lock 45,
//     spot weld 15-20, solder joint 3-10, bolt 50-250, cabinet hinge 30, room-door hinge 90,
//     magnetic catch 3, door latch 40, deadbolt 400, picture nail 12, shelf pins 6.
//  6. Anchor to the building what is anchored in reality (b.world with an explicit anchor):
//     wall cabinets screwed through the rail into studs, toilets bolted down, pictures on a
//     nail, pipes clipped to studs. Free-standing furniture is not anchored.
//  7. Joints: doors/lids = b.hinge (pivots on the real hinge pins; latch at the lock side),
//     drawers = b.slider (one pivot per runner). hingeAxis() picks the axis sign so positive
//     angles open the door; hingedDoorPanel/drawer below do all of this for you.
//  8. Features make destruction feel alive: light (the bulb part), screen, water (pipes,
//     valves, tanks), sparks (PCBs, outlets, cables), stuffing (cushions), liquid (bottles),
//     soil (plant pots), power (the breaker panel), hum (fridge).
//  9. Budget: small objects 3-20 parts, furniture 10-40, appliances 20-80. Greebles such as
//     screws and labels are texture, not parts (parts under 0.2 g are flagged).
// 10. Check b.info() (mass, bbox, warnings) and run `node --test tests/unit/objects-*.test.ts`:
//     every registered object must build with no warnings and no substantial overlaps.
//
// Helper conventions: helper(b, name, opts, pos?, rot?) builds parts named `${name}_*` in a
// local frame placed at pos/rot (relative to the current group frame) and returns FULL part
// names you can bond to from anywhere. Part references passed in options (`on`, `fixed`...) may
// be local names of the CALLER's frame or full names.
//
// PURE MODULE (no Babylon imports).

import { v3, vcross, vnorm, vlen, vsub, vadd, vscale, vdot, vperp, qaxisAngle, qmul, type Vec3 } from "../../geom/vec.ts";
import { polyCentroid } from "../../geom/poly.ts";
import { MATERIALS, type MaterialId } from "../../destruction/model/materials.ts";
import type { BondKind } from "../../destruction/model/types.ts";
import { S, type SurfaceName } from "../../render/surfaces.ts";
import { Builder, vec, type V3, type Rot } from "./builder.ts";
import { frameBarPoints, arcPoints, type BarWidths } from "./shapes.ts";

export { frameBarPoints, arcPoints, tubeSegments } from "./shapes.ts";
export type { BarWidths } from "./shapes.ts";

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** Run `fn` in a group named `${name}_` placed at pos/rot. */
function scoped<T>(b: Builder, name: string, pos: V3, rot: Rot | undefined, fn: () => T): T {
  let out: T | undefined;
  b.group(pos, rot, name ? `${name}_` : "", () => {
    out = fn();
  });
  return out as T;
}

function need(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`kit: ${msg}`);
}

// =============================================================================================
// Joinery helpers
// =============================================================================================

/**
 * Hinge axis such that positive angles move the free edge (direction `freeEdge`, pointing from
 * the hinge line into the leaf) towards `opensTowards`: axis = cross(freeEdge, opensTowards).
 */
export function hingeAxis(freeEdge: V3, opensTowards: V3): Vec3 {
  const a = vcross(vec(freeEdge), vec(opensTowards));
  need(vlen(a) > 1e-9, "hingeAxis: directions are parallel");
  return vnorm(a);
}

/** Glue joint strength (J) from the glued area (m²). */
export function glueByArea(area: number, perM2 = 4000, min = 10, max = 400): number {
  return clamp(perM2 * Math.max(0, area), min, max);
}

export interface FastenOpts {
  /** Fastener spacing along the seam (m). Default 0.15. */
  spacing?: number;
  /** Strength per fastener (J). Default 35 (wood screw). */
  each?: number;
  /** Fasteners per m² of contact instead of spacing along the seam (sheet goods on studs/joists). */
  perM2?: number;
  min?: number;
  max?: number;
  /** Contact tolerance (m). Default 0.003. */
  tol?: number;
}

/**
 * Bond two touching parts with a row of fasteners along their seam (spot welds, screws, staples,
 * nails): count = seam length / spacing + 1 (clamped), strength = count × each. Returns the count.
 */
export function fastenSeam(b: Builder, a: string, c: string, kind: BondKind, o: FastenOpts = {}): number {
  const ct = b.contact(a, c, o.tol ?? 0.003);
  need(!!ct, `fastenSeam: '${a}' and '${c}' do not touch`);
  const contact = ct!;
  let n: number;
  if (o.perM2 !== undefined) n = Math.round(contact.area * o.perM2);
  else n = Math.round(contact.length / (o.spacing ?? 0.15)) + 1;
  n = clamp(n, o.min ?? 2, o.max ?? 60);
  b.bond(a, c, kind, { strength: n * (o.each ?? 35) });
  return n;
}

/** Screws through a sheet into a member (drywall on a stud, plywood on a joist): spacing 0.3 m by default. */
export function screwGrid(b: Builder, sheet: string, member: string, o: FastenOpts = {}): number {
  return fastenSeam(b, sheet, member, "screw", { spacing: 0.3, each: 30, ...o });
}

/** Glue `a` to every part of `others` it touches; strength from the contact area. Returns bond count. */
export function glueTouching(b: Builder, a: string, others: string[], perM2 = 4000, kind: BondKind = "glue", min = 10, max = 400): number {
  let n = 0;
  for (const o of others) {
    const c = b.contact(a, o, 0.002);
    if (!c || (c.kind !== "face" && !c.penetrating)) continue;
    b.bond(a, o, kind, { strength: glueByArea(c.area, perM2, min, max) });
    n++;
  }
  return n;
}

// =============================================================================================
// Hardware: handles, knobs, buttons
// =============================================================================================

export interface HardwareLook {
  mat?: MaterialId;
  surf?: SurfaceName;
  tint?: number;
}

/**
 * Bar handle: two posts screwed to `on` + a square bar. Local frame: mounting surface at z = 0,
 * handle protrudes along +Z, bar along X (vertical: along Y). `len` = hole spacing.
 */
export function barHandle(
  b: Builder,
  name: string,
  o: HardwareLook & { on: string; len?: number; size?: number; standoff?: number; vertical?: boolean; screw?: number },
  pos: V3 = [0, 0, 0],
  rot?: Rot,
): { bar: string; posts: [string, string]; all: string[] } {
  const on = b.resolve(o.on);
  const len = o.len ?? 0.128;
  const s = o.size ?? 0.011;
  const so = o.standoff ?? 0.026;
  const mat = o.mat ?? "aluminum";
  const surf = o.surf ?? "aluminum";
  const tint = o.tint ?? 0xffffff;
  return scoped(b, name, pos, rot, () => {
    let out!: { bar: string; posts: [string, string]; all: string[] };
    b.group([0, 0, 0], o.vertical ? [0, 0, 90] : undefined, "", () => {
      const pl = b.cyl("post_l", mat, surf, s * 0.42, so, [-len / 2, 0, so / 2], { axis: "z", segments: 8, tint });
      const pr = b.cyl("post_r", mat, surf, s * 0.42, so, [len / 2, 0, so / 2], { axis: "z", segments: 8, tint });
      const bar = b.box("bar", mat, surf, [len + 0.03, s, s], [0, 0, so + s / 2], { tint, tess: 0 });
      b.screw(pl, on, 1, o.screw ?? 35);
      b.screw(pr, on, 1, o.screw ?? 35);
      b.weld(bar, pl, 150);
      b.weld(bar, pr, 150);
      out = { bar, posts: [pl, pr], all: [bar, pl, pr] };
    });
    return out;
  });
}

/** One-piece pull handle / grip (cabinet pull, appliance door grip). Protrudes along +Z from z = 0. */
export function pullHandle(
  b: Builder,
  name: string,
  o: HardwareLook & { on: string; len?: number; depth?: number; width?: number; vertical?: boolean; screws?: number },
  pos: V3 = [0, 0, 0],
  rot?: Rot,
): string {
  const on = b.resolve(o.on);
  const len = o.len ?? 0.12;
  const depth = o.depth ?? 0.02;
  const width = o.width ?? 0.02;
  const size: V3 = o.vertical ? [width, len, depth] : [len, width, depth];
  let part = "";
  b.group(pos, rot, "", () => {
    part = b.bevelBox(name, o.mat ?? "plastic", o.surf ?? "plastic", size, Math.min(width, depth) * 0.25, [0, 0, depth / 2], { tint: o.tint ?? 0x202020 });
  });
  b.screw(part, on, o.screws ?? 2, 30);
  return part;
}

/** Round knob (cabinet knob, appliance dial): a frustum along +Z from z = 0. */
export function knob(b: Builder, name: string, o: HardwareLook & { on: string; r?: number; len?: number; strength?: number; kind?: BondKind }, pos: V3 = [0, 0, 0], rot?: Rot): string {
  const on = b.resolve(o.on);
  const r = o.r ?? 0.015;
  const len = o.len ?? 0.025;
  let part = "";
  b.group(pos, rot, "", () => {
    part = b.cyl(name, o.mat ?? "aluminum", o.surf ?? "aluminum", r * 0.6, len, [0, 0, len / 2], { axis: "z", rTop: r, segments: 10, tint: o.tint });
  });
  b.bond(part, on, o.kind ?? "screw", { strength: o.strength ?? 25 });
  return part;
}

/**
 * Door lever handle: rose (screwed to `on`), spindle neck and lever arm pointing towards
 * side·X. Protrudes along +Z from z = 0.
 */
export function leverHandle(
  b: Builder,
  name: string,
  o: HardwareLook & { on: string; side?: 1 | -1; len?: number },
  pos: V3 = [0, 0, 0],
  rot?: Rot,
): { rose: string; neck: string; lever: string; all: string[] } {
  const on = b.resolve(o.on);
  const side = o.side ?? 1;
  const len = o.len ?? 0.12;
  const mat = o.mat ?? "steel";
  const surf = o.surf ?? "steel_brushed";
  const tint = o.tint ?? 0xffffff;
  return scoped(b, name, pos, rot, () => {
    const rose = b.cyl("rose", mat, surf, 0.025, 0.008, [0, 0, 0.004], { axis: "z", segments: 12, tint });
    const neck = b.cyl("neck", mat, surf, 0.0095, 0.045, [0, 0, 0.008 + 0.0225], { axis: "z", segments: 8, tint });
    const lever = b.bevelBox("lever", mat, surf, [len, 0.018, 0.016], 0.004, [side * (len / 2 - 0.009), 0, 0.053 + 0.008], { tint });
    b.screw(rose, on, 2, 30);
    b.press(neck, rose, 40);
    b.weld(lever, neck, 120);
    return { rose, neck, lever, all: [rose, neck, lever] };
  });
}

export interface ButtonGridOpts extends HardwareLook {
  on: string;
  rows: number;
  cols: number;
  /** Key cap size [w, h] (m). */
  size: [number, number];
  /** Protrusion (m), default 0.0025. */
  depth?: number;
  /** Centre-to-centre pitch [x, y]; default size + 6 mm. */
  pitch?: [number, number];
  /** Per-button tints (row-major) — e.g. a green start key. */
  tints?: number[];
  /** Press-fit strength per button (J), default 2. */
  strength?: number;
}

/** Grid of press-fit plastic buttons on a panel face (local XY, protruding along +Z from z = 0). Row 0 is the top row. */
export function buttonGrid(b: Builder, name: string, o: ButtonGridOpts, pos: V3 = [0, 0, 0], rot?: Rot): string[] {
  const on = b.resolve(o.on);
  const depth = o.depth ?? 0.0025;
  const [w, h] = o.size;
  const [px, py] = o.pitch ?? [w + 0.006, h + 0.006];
  need(o.rows >= 1 && o.cols >= 1, "buttonGrid needs rows/cols >= 1");
  return scoped(b, name, pos, rot, () => {
    const out: string[] = [];
    for (let r = 0; r < o.rows; r++) {
      for (let c = 0; c < o.cols; c++) {
        const x = (c - (o.cols - 1) / 2) * px;
        const y = ((o.rows - 1) / 2 - r) * py;
        const k = r * o.cols + c;
        const btn = b.bevelBox(`r${r}c${c}`, o.mat ?? "plastic", o.surf ?? "plastic_glossy", [w, h, depth], Math.min(w, h, depth) * 0.3, [x, y, depth / 2], {
          tint: o.tints?.[k] ?? o.tint ?? 0x2a2b2e,
        });
        b.press(btn, on, o.strength ?? 2);
        out.push(btn);
      }
    }
    return out;
  });
}

// =============================================================================================
// Electronics
// =============================================================================================

export type PcbComponentKind = "chip" | "chipSmall" | "cap" | "relay" | "transformer" | "connector" | "buzzer" | "heatsink";

export interface PcbComponent {
  kind: PcbComponentKind;
  /** Centre on the board (local x, y). */
  x: number;
  y: number;
  /** Override size [w, h, height] (m). */
  size?: [number, number, number];
  tint?: number;
}

const PCB_PARTS: Record<PcbComponentKind, { size: [number, number, number]; mat: MaterialId; surf: SurfaceName; tint: number; solder: number; round?: boolean }> = {
  chip: { size: [0.02, 0.02, 0.0028], mat: "plastic", surf: "ic_chip", tint: 0xffffff, solder: 6 },
  chipSmall: { size: [0.014, 0.009, 0.003], mat: "plastic", surf: "ic_chip", tint: 0xffffff, solder: 3 },
  cap: { size: [0.01, 0.01, 0.013], mat: "aluminum", surf: "plastic_glossy", tint: 0x23345a, solder: 4, round: true },
  relay: { size: [0.019, 0.015, 0.016], mat: "plastic", surf: "plastic", tint: 0x2a4f9a, solder: 8 },
  transformer: { size: [0.028, 0.024, 0.022], mat: "steel", surf: "metal_raw", tint: 0xb8b0a0, solder: 20 },
  connector: { size: [0.02, 0.007, 0.009], mat: "plastic", surf: "plastic", tint: 0xf2efe4, solder: 6 },
  buzzer: { size: [0.014, 0.014, 0.009], mat: "plastic", surf: "plastic", tint: 0x151515, solder: 4, round: true },
  heatsink: { size: [0.022, 0.025, 0.016], mat: "aluminum", surf: "aluminum", tint: 0xffffff, solder: 10 },
};

/**
 * Printed circuit board with soldered components (local XY; board spans z ∈ [-t, 0], components
 * on +Z). `sparks` feature on the board. `mount.to` screws the board to a chassis part.
 */
export function pcb(
  b: Builder,
  name: string,
  o: { w: number; h: number; t?: number; components?: PcbComponent[]; mount?: { to: string; screws?: number; each?: number }; sparks?: number; tint?: number },
  pos: V3 = [0, 0, 0],
  rot?: Rot,
): { board: string; components: string[]; all: string[] } {
  const t = o.t ?? 0.0016;
  const mountTo = o.mount ? b.resolve(o.mount.to) : null;
  const comps: PcbComponent[] = o.components ?? [
    { kind: "chip", x: -o.w * 0.15, y: o.h * 0.1 },
    { kind: "chipSmall", x: o.w * 0.2, y: o.h * 0.25 },
    { kind: "cap", x: o.w * 0.3, y: -o.h * 0.25 },
    { kind: "relay", x: -o.w * 0.25, y: -o.h * 0.25 },
  ];
  return scoped(b, name, pos, rot, () => {
    const board = b.box("board", "pcb", "pcb", [o.w, o.h, t], [0, 0, -t / 2], { tint: o.tint ?? 0xffffff });
    const out: string[] = [];
    comps.forEach((c, k) => {
      const spec = PCB_PARTS[c.kind];
      const [w, h, ht] = c.size ?? spec.size;
      need(Math.abs(c.x) + w / 2 <= o.w / 2 + 1e-6 && Math.abs(c.y) + h / 2 <= o.h / 2 + 1e-6, `pcb '${name}': component ${k} (${c.kind}) hangs off the board`);
      const nm = `${c.kind}${k}`;
      const part = spec.round
        ? b.cyl(nm, spec.mat, spec.surf, Math.min(w, h) / 2, ht, [c.x, c.y, ht / 2], { axis: "z", segments: 10, tint: c.tint ?? spec.tint, capSurf: "aluminum" })
        : b.box(nm, spec.mat, spec.surf, [w, h, ht], [c.x, c.y, ht / 2], { tint: c.tint ?? spec.tint, tess: 0 });
      b.weld(part, board, spec.solder);
      out.push(part);
    });
    if (mountTo) b.screw(board, mountTo, o.mount!.screws ?? 4, o.mount!.each ?? 12);
    b.sparks(board, o.sparks ?? 0.6);
    return { board, components: out, all: [board, ...out] };
  });
}

/**
 * Flat screen panel: LCD glass (with `screen` feature), backlight/diffuser, 4 plastic bezel bars
 * and a back housing. Local XY centred; front face at z = 0, panel extends to z = -t.
 */
export function screenPanel(
  b: Builder,
  name: string,
  o: { w: number; h: number; t?: number; bezel?: number; content: "tv" | "monitor" | "laptop" | "phone" | "microwave"; housingMat?: MaterialId; housingSurf?: SurfaceName; tint?: number; on?: boolean; mains?: boolean },
  pos: V3 = [0, 0, 0],
  rot?: Rot,
): { lcd: string; backlight: string; bezel: string[]; back: string; all: string[] } {
  const t = o.t ?? 0.012;
  const bz = o.bezel ?? 0.012;
  const hm = o.housingMat ?? "plastic";
  const hs = o.housingSurf ?? "plastic";
  const tint = o.tint ?? 0x18191b;
  need(t > 0.009, "screenPanel: t must exceed 9 mm");
  return scoped(b, name, pos, rot, () => {
    const bars = frameBarPoints(o.w, o.h, bz, -0.008, 0);
    const top = b.hull("bezel_t", hm, hs, bars.top, [0, 0, 0], { tint });
    const bottom = b.hull("bezel_b", hm, hs, bars.bottom, [0, 0, 0], { tint });
    const left = b.hull("bezel_l", hm, hs, bars.left, [0, 0, 0], { tint });
    const right = b.hull("bezel_r", hm, hs, bars.right, [0, 0, 0], { tint });
    const iw = bars.inner.x1 - bars.inner.x0,
      ih = bars.inner.y1 - bars.inner.y0;
    const lcd = b.box("lcd", "lcd", "lcd_off", [iw, ih, 0.003], [0, 0, -0.0045], {
      faces: { nx: { surf: "plastic", tint }, px: { surf: "plastic", tint }, py: { surf: "plastic", tint }, ny: { surf: "plastic", tint } },
    });
    const backlight = b.box("backlight", "plastic", "plastic", [iw, ih, 0.002], [0, 0, -0.007], { tint: 0xe8e8e8 });
    const back = b.box("back", hm, hs, [o.w, o.h, t - 0.008], [0, 0, -0.008 - (t - 0.008) / 2], { tint });
    for (const bar of [top, bottom, left, right]) {
      b.clip(lcd, bar, 4);
      b.clip(bar, back, 8);
    }
    b.fuse(top, left);
    b.fuse(top, right);
    b.fuse(bottom, left);
    b.fuse(bottom, right);
    b.glue(lcd, backlight, 10);
    b.clip(backlight, back, 10);
    b.screen(lcd, o.content, { on: o.on, mains: o.mains });
    b.sparks(back, 0.4);
    const bezel = [top, bottom, left, right];
    return { lcd, backlight, bezel, back, all: [lcd, backlight, ...bezel, back] };
  });
}

// =============================================================================================
// Sheet metal
// =============================================================================================

export type BoxFace = "top" | "bottom" | "left" | "right" | "back" | "front";

/**
 * Box of sheet-metal panels (appliance casings, cabinets, ducts) joined by spot welds or screws
 * along every seam. Local frame: x ∈ ±w/2, y ∈ [0, h], z ∈ ±d/2. Panels never overlap: sides
 * are full size, top/bottom fit between the sides, back/front fit inside the rest.
 */
export function sheetMetalBox(
  b: Builder,
  name: string,
  o: { w: number; h: number; d: number; t?: number; mat?: MaterialId; surf?: SurfaceName; tint?: number; faces?: Partial<Record<BoxFace, boolean>>; join?: "weld" | "screw"; spacing?: number; each?: number; tess?: number; faceSurf?: Partial<Record<BoxFace, SurfaceName>> },
  pos: V3 = [0, 0, 0],
  rot?: Rot,
): Partial<Record<BoxFace, string>> & { all: string[] } {
  const t = o.t ?? 0.0008;
  const mat = o.mat ?? "steelSheet";
  const surf = o.surf ?? "metal_painted";
  const tint = o.tint ?? 0xffffff;
  const f: Record<BoxFace, boolean> = { top: true, bottom: true, left: true, right: true, back: true, front: false, ...(o.faces ?? {}) };
  const { w, h, d } = o;
  need(w > 4 * t && h > 4 * t && d > 4 * t, "sheetMetalBox: too small for the sheet thickness");
  return scoped(b, name, pos, rot, () => {
    const out: Partial<Record<BoxFace, string>> = {};
    const sx0 = f.left ? -w / 2 + t : -w / 2,
      sx1 = f.right ? w / 2 - t : w / 2;
    const ty0 = f.bottom ? t : 0,
      ty1 = f.top ? h - t : h;
    const sf = (face: BoxFace): SurfaceName => o.faceSurf?.[face] ?? surf;
    const po = { tint, tess: o.tess };
    if (f.left) out.left = b.box("left", mat, sf("left"), [t, h, d], [-w / 2 + t / 2, h / 2, 0], po);
    if (f.right) out.right = b.box("right", mat, sf("right"), [t, h, d], [w / 2 - t / 2, h / 2, 0], po);
    if (f.top) out.top = b.box("top", mat, sf("top"), [sx1 - sx0, t, d], [(sx0 + sx1) / 2, h - t / 2, 0], po);
    if (f.bottom) out.bottom = b.box("bottom", mat, sf("bottom"), [sx1 - sx0, t, d], [(sx0 + sx1) / 2, t / 2, 0], po);
    if (f.back) out.back = b.box("back", mat, sf("back"), [sx1 - sx0, ty1 - ty0, t], [(sx0 + sx1) / 2, (ty0 + ty1) / 2, -d / 2 + t / 2], po);
    if (f.front) out.front = b.box("front", mat, sf("front"), [sx1 - sx0, ty1 - ty0, t], [(sx0 + sx1) / 2, (ty0 + ty1) / 2, d / 2 - t / 2], po);
    const names = Object.values(out) as string[];
    const join = o.join ?? "weld";
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        if (!b.contact(names[i], names[j], 0.0005)) continue;
        fastenSeam(b, names[i], names[j], join, join === "weld" ? { spacing: o.spacing ?? 0.08, each: o.each ?? 18, tol: 0.0005 } : { spacing: o.spacing ?? 0.15, each: o.each ?? 25, tol: 0.0005 });
      }
    return { ...out, all: names };
  });
}

// =============================================================================================
// Casework: carcasses, drawers, doors, shelves
// =============================================================================================

export interface CarcassOpts {
  w: number;
  h: number;
  d: number;
  /** Panel thickness (m), default 0.018. */
  t?: number;
  mat?: MaterialId;
  surf?: SurfaceName;
  tint?: number;
  /** Back panel (3 mm HDF stapled on) or false. */
  back?: { t?: number; mat?: MaterialId; surf?: SurfaceName } | false;
  /** Recessed plinth for base cabinets (bottom raised by h). */
  toeKick?: { h?: number; setback?: number } | false;
  /** "full" top panel (wall/tall cabinets), "rails" (base cabinets under a worktop) or "none". */
  top?: "full" | "rails" | "none";
  /** Adjustable shelves on pins: heights of their TOP faces (m). */
  shelves?: number[];
  /** Fixed (doweled) shelves: heights of their top faces. */
  fixedShelves?: number[];
  joinery?: "dowel" | "screw";
  /** Shelf-pin hold (J per side), default 6. */
  pinStrength?: number;
}

export interface CarcassResult {
  left: string;
  right: string;
  bottom: string;
  top: string[];
  back?: string;
  toeKick?: string;
  shelves: string[];
  all: string[];
  /** Inner opening (local frame). */
  inner: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
}

/**
 * Cabinet carcass (kitchen base/wall cabinet, wardrobe, bookcase body): two sides, bottom, top
 * panel or rails, 3 mm hardboard back stapled on, optional recessed toe kick and shelves.
 * Local frame: x ∈ ±w/2, y ∈ [0, h], z ∈ ±d/2, front +Z.
 */
export function cabinetCarcass(b: Builder, name: string, o: CarcassOpts, pos: V3 = [0, 0, 0], rot?: Rot): CarcassResult {
  const t = o.t ?? 0.018;
  const mat = o.mat ?? "particleboard";
  const surf = o.surf ?? "laminate_white";
  const tint = o.tint ?? 0xffffff;
  const back = o.back === false ? null : { t: o.back?.t ?? 0.003, mat: o.back?.mat ?? ("mdf" as MaterialId), surf: o.back?.surf ?? ("mdf" as SurfaceName) };
  const toe = o.toeKick ? { h: o.toeKick.h ?? 0.1, setback: o.toeKick.setback ?? 0.05 } : null;
  const topMode = o.top ?? "full";
  const { w, h, d } = o;
  need(w > 2 * t + 0.05 && h > 2 * t + (toe ? toe.h : 0) + 0.05 && d > 0.1, `cabinetCarcass '${name}': dimensions too small`);
  return scoped(b, name, pos, rot, () => {
    const zb = -d / 2 + (back ? back.t : 0);
    const zf = d / 2;
    const dz = zf - zb,
      zc = (zb + zf) / 2;
    const toeH = toe ? toe.h : 0;
    const iw = w - 2 * t;
    const left = b.box("side_l", mat, surf, [t, h, dz], [-w / 2 + t / 2, h / 2, zc], { tint });
    const right = b.box("side_r", mat, surf, [t, h, dz], [w / 2 - t / 2, h / 2, zc], { tint });
    const bottom = b.box("bottom", mat, surf, [iw, t, dz], [0, toeH + t / 2, zc], { tint });
    const tops: string[] = [];
    if (topMode === "full") tops.push(b.box("top", mat, surf, [iw, t, dz], [0, h - t / 2, zc], { tint }));
    else if (topMode === "rails") {
      const rw = Math.min(0.1, dz / 3);
      tops.push(b.box("rail_f", mat, surf, [iw, t, rw], [0, h - t / 2, zf - rw / 2], { tint }));
      tops.push(b.box("rail_b", mat, surf, [iw, t, rw], [0, h - t / 2, zb + rw / 2], { tint }));
    }
    let backPart: string | undefined;
    if (back) backPart = b.box("back", back.mat, back.surf, [w, h - toeH, back.t], [0, toeH + (h - toeH) / 2, -d / 2 + back.t / 2], { supported: true });
    let toeKick: string | undefined;
    if (toe) toeKick = b.box("toe", mat, surf, [iw, toeH, t], [0, toeH / 2, zf - toe.setback - t / 2], { tint });

    const joint = (a: string, c: string, n: number): void => {
      if ((o.joinery ?? "dowel") === "dowel") b.dowel(a, c, n, 40);
      else b.screw(a, c, n, 30);
    };
    joint(left, bottom, 3);
    joint(right, bottom, 3);
    for (const tp of tops) {
      joint(left, tp, 2);
      joint(right, tp, 2);
    }
    const shelves: string[] = [];
    const innerTop = topMode === "full" ? h - t : h;
    (o.shelves ?? []).forEach((y, k) => {
      if (y - t <= toeH + t + 0.01 || y >= innerTop - 0.01) {
        b.warn(`cabinetCarcass '${name}': shelf at ${y} m is outside the carcass`);
        return;
      }
      const sd = dz - 0.022;
      const s = b.box(`shelf${k}`, mat, surf, [iw - 0.001, t, sd], [0, y - t / 2, zb + 0.002 + sd / 2], { tint });
      b.friction(s, left, o.pinStrength ?? 6);
      b.friction(s, right, o.pinStrength ?? 6);
      shelves.push(s);
    });
    (o.fixedShelves ?? []).forEach((y, k) => {
      if (y - t <= toeH + t + 0.01 || y >= innerTop - 0.01) {
        b.warn(`cabinetCarcass '${name}': fixed shelf at ${y} m is outside the carcass`);
        return;
      }
      const s = b.box(`fshelf${k}`, mat, surf, [iw, t, dz], [0, y - t / 2, zc], { tint });
      joint(s, left, 2);
      joint(s, right, 2);
      shelves.push(s);
    });
    if (backPart) {
      for (const p of [left, right, bottom, ...tops, ...shelves.filter((s) => s.includes("fshelf"))]) {
        if (b.contact(backPart, p, 0.001)) fastenSeam(b, backPart, p, "nail", { spacing: 0.1, each: 7, tol: 0.001 });
      }
    }
    if (toeKick) {
      b.screw(toeKick, left, 1, 30);
      b.screw(toeKick, right, 1, 30);
      b.clip(toeKick, bottom, 10);
    }
    const all = [left, right, bottom, ...tops, ...(backPart ? [backPart] : []), ...(toeKick ? [toeKick] : []), ...shelves];
    return {
      left,
      right,
      bottom,
      top: tops,
      back: backPart,
      toeKick,
      shelves,
      all,
      inner: { x0: -w / 2 + t, x1: w / 2 - t, y0: toeH + t, y1: innerTop, z0: zb, z1: zf },
    };
  });
}

export type HandleSpec =
  | (HardwareLook & { kind: "bar" | "pull" | "knob" | "lever"; len?: number; vertical?: boolean; x?: number; y?: number; both?: boolean })
  | false;

/** Place a handle on a panel face at local (x, y, z) facing +Z (or -Z when back). */
function placeHandle(b: Builder, name: string, spec: HandleSpec, on: string, at: Vec3, back = false, leverSide: 1 | -1 = 1): string[] {
  if (!spec) return [];
  const rot: Rot | undefined = back ? [0, 180, 0] : undefined;
  switch (spec.kind) {
    case "bar":
      return barHandle(b, name, { on, len: spec.len, vertical: spec.vertical, mat: spec.mat, surf: spec.surf, tint: spec.tint }, at, rot).all;
    case "pull":
      return [pullHandle(b, name, { on, len: spec.len, vertical: spec.vertical, mat: spec.mat, surf: spec.surf, tint: spec.tint }, at, rot)];
    case "knob":
      return [knob(b, name, { on, mat: spec.mat, surf: spec.surf, tint: spec.tint }, at, rot)];
    case "lever":
      return leverHandle(b, name, { on, side: back ? (-leverSide as 1 | -1) : leverSide, mat: spec.mat, surf: spec.surf, tint: spec.tint, len: spec.len }, at, rot).all;
  }
}

export interface DrawerOpts {
  /** Drawer box outer size (m). */
  w: number;
  h: number;
  d: number;
  front: { w: number; h: number; t?: number; mat?: MaterialId; surf?: SurfaceName; tint?: number; /** bottom of the front relative to the box bottom (default: centred) */ dy?: number };
  sideT?: number;
  bottomT?: number;
  backT?: number;
  mat?: MaterialId;
  surf?: SurfaceName;
  tint?: number;
  /** Carcass part(s) the runners are screwed to: one part or [left, right]. */
  fixed: string | [string, string];
  /** Max extension (m), default 0.85·d. */
  travel?: number;
  /** Runner strength (J per runner), default 50. */
  strength?: number;
  friction?: number;
  handle?: HandleSpec;
}

/**
 * Drawer: box (sides, back, bottom in grooves) + overlay front, on two slider runners grouped into
 * one constraint, with a handle. Local frame: origin at the bottom centre of the box's front
 * plane; the box extends to z = -d, the front panel occupies z ∈ [0, t].
 */
export function drawer(b: Builder, name: string, o: DrawerOpts, pos: V3 = [0, 0, 0], rot?: Rot): { front: string; sides: [string, string]; back: string; bottom: string; handle: string[]; group: string; all: string[] } {
  const sideT = o.sideT ?? 0.015,
    bottomT = o.bottomT ?? 0.004,
    backT = o.backT ?? 0.015;
  const mat = o.mat ?? "particleboard",
    surf = o.surf ?? "laminate_white",
    tint = o.tint ?? 0xffffff;
  const fr = o.front;
  const ft = fr.t ?? 0.018;
  const fdy = fr.dy ?? -(fr.h - o.h) / 2;
  const [fl, frt] = Array.isArray(o.fixed) ? [b.resolve(o.fixed[0]), b.resolve(o.fixed[1])] : [b.resolve(o.fixed), b.resolve(o.fixed)];
  const { w, h, d } = o;
  need(w > 2 * sideT + 0.02 && h > bottomT + 0.02 && d > backT + 0.05, `drawer '${name}': dimensions too small`);
  return scoped(b, name, pos, rot, () => {
    const left = b.box("side_l", mat, surf, [sideT, h, d], [-w / 2 + sideT / 2, h / 2, -d / 2], { tint });
    const right = b.box("side_r", mat, surf, [sideT, h, d], [w / 2 - sideT / 2, h / 2, -d / 2], { tint });
    const iw = w - 2 * sideT;
    const bottom = b.box("bottom", "mdf", "mdf", [iw, bottomT, d], [0, bottomT / 2, -d / 2]);
    const back = b.box("back", mat, surf, [iw, h - bottomT, backT], [0, bottomT + (h - bottomT) / 2, -d + backT / 2], { tint });
    const front = b.box("front", fr.mat ?? "mdf", fr.surf ?? surf, [fr.w, fr.h, ft], [0, fdy + fr.h / 2, ft / 2], { tint: fr.tint ?? tint });
    b.screw(left, front, 2, 30);
    b.screw(right, front, 2, 30);
    b.dowel(left, back, 2, 25);
    b.dowel(right, back, 2, 25);
    for (const p of [left, right, back]) fastenSeam(b, bottom, p, "nail", { spacing: 0.1, each: 6, tol: 0.001 });
    if (b.contact(bottom, front, 0.001)) b.glue(bottom, front, 20);
    const travel = o.travel ?? 0.85 * d;
    const group = b.slider(left, fl, { pivots: [[-w / 2, h / 2, -d / 2]], axis: [0, 0, 1], min: 0, max: travel, strength: o.strength ?? 50, friction: o.friction ?? 0.2 });
    b.slider(right, frt, { pivots: [[w / 2, h / 2, -d / 2]], axis: [0, 0, 1], min: 0, max: travel, strength: o.strength ?? 50, friction: o.friction ?? 0.2, group });
    const hs: HandleSpec = o.handle === undefined ? { kind: "bar" } : o.handle;
    const handle = hs ? placeHandle(b, "handle", hs, front, v3(hs.x ?? 0, hs.y ?? fdy + fr.h / 2, ft)) : [];
    return { front, sides: [left, right] as [string, string], back, bottom, handle, group, all: [front, left, right, back, bottom, ...handle] };
  });
}

export interface DoorPanelOpts {
  w: number;
  h: number;
  t?: number;
  /** Solid slab (cabinet doors, solid-core doors) or hollow core (interior doors). */
  kind?: "solid" | "hollow";
  /** Slab material (solid) or skin material (hollow). */
  mat?: MaterialId;
  surf?: SurfaceName;
  tint?: number;
  /** Hinge side as seen from the front (+Z). */
  hinge: "left" | "right";
  /** Opens towards +Z (front, default) or -Z (back). */
  swing?: "front" | "back";
  /** Part the hinges are fixed to (jamb, carcass side) or "world". */
  fixed: string;
  /** Number of hinges (default 3 for tall doors, else 2). */
  hinges?: number;
  /** Per-hinge strength (J): default 90 for tall doors, 30 for cabinet doors. */
  hingeStrength?: number;
  /** Top/bottom hinge distance from the edges (m). */
  hingeInset?: number;
  openDeg?: number;
  friction?: number;
  /** Latch / catch: strength (J) or { strength, fixed, pos (local) }; false = none. */
  latch?: number | { strength: number; fixed?: string; pos?: V3 } | false;
  /** Handle (default lever on both faces for tall doors, bar for cabinet doors). */
  handle?: HandleSpec;
  /** Handle height (m), default 1.0 for tall doors, else 0.85·h for cabinet doors. */
  handleHeight?: number;
  /** Visible steel hinge leaves on the door edge (default: tall doors). */
  hardware?: boolean;
  /** Knuckle offset beyond the face/edge (m), default 0. */
  axisOffset?: number;
}

export interface DoorPanelResult {
  /** Main slab (solid) or front skin (hollow). */
  slab: string;
  skins: string[];
  core: string[];
  leaves: string[];
  handle: string[];
  /** Joint group id. */
  group: string;
  /** Part the latch is on (lock block / slab). */
  lockPart: string;
  all: string[];
}

/**
 * Hinged door leaf: solid slab, or hollow-core (two 3 mm HDF skins glued to a softwood frame of
 * stiles and rails, a lock block, and a paper-honeycomb core) with 2-3 hinges, a latch/catch and
 * a handle. Local frame: slab x ∈ ±w/2, y ∈ [0, h], z ∈ ±t/2, front face +Z; hinge axis on the
 * hinge edge at the face it swings towards; positive angles open it.
 */
export function hingedDoorPanel(b: Builder, name: string, o: DoorPanelOpts, pos: V3 = [0, 0, 0], rot?: Rot): DoorPanelResult {
  const tall = o.h > 1.5;
  const kind = o.kind ?? (tall ? "hollow" : "solid");
  const t = o.t ?? (kind === "hollow" ? 0.035 : 0.018);
  const mat = o.mat ?? "mdf";
  const surf = o.surf ?? (kind === "hollow" ? "wood_painted" : "laminate_white");
  const tint = o.tint ?? 0xffffff;
  const hx = o.hinge === "left" ? -1 : 1; // hinge edge side in x
  const sz = (o.swing ?? "front") === "front" ? 1 : -1;
  const fixed = o.fixed === "world" ? "world" : b.resolve(o.fixed);
  const latchSpec = o.latch === undefined ? (tall ? { strength: 40 } : { strength: 3 }) : o.latch === false ? null : typeof o.latch === "number" ? { strength: o.latch } : o.latch;
  const latchFixed = latchSpec && "fixed" in latchSpec && latchSpec.fixed ? (latchSpec.fixed === "world" ? "world" : b.resolve(latchSpec.fixed)) : fixed;
  const hingeCount = o.hinges ?? (tall ? 3 : 2);
  const hw = o.hardware ?? tall;
  const off = o.axisOffset ?? 0;
  const hh = clamp(o.handleHeight ?? (tall ? 1.0 : o.h * 0.85), 0.05, o.h - 0.05);
  need(o.w > 0.1 && o.h > 0.1 && t > 0.008, `hingedDoorPanel '${name}': dimensions too small`);
  return scoped(b, name, pos, rot, () => {
    const skins: string[] = [];
    const core: string[] = [];
    let slab: string;
    let hingeMember: string; // part the hinge leaves / hinge bonds attach to
    let lockPart: string;
    if (kind === "solid") {
      slab = b.box("slab", mat, surf, [o.w, o.h, t], [0, o.h / 2, 0], { tint });
      hingeMember = slab;
      lockPart = slab;
    } else {
      const skinT = 0.003;
      const coreT = t - 2 * skinT;
      const stileW = 0.032,
        railTop = 0.06,
        railBot = 0.1;
      const front = b.box("skin_f", mat, surf, [o.w, o.h, skinT], [0, o.h / 2, t / 2 - skinT / 2], { tint, supported: true });
      const backSkin = b.box("skin_b", mat, surf, [o.w, o.h, skinT], [0, o.h / 2, -t / 2 + skinT / 2], { tint, supported: true });
      skins.push(front, backSkin);
      slab = front;
      const stileH = b.box("stile_h", "softwood", "wood_pine", [stileW, o.h, coreT], [hx * (o.w / 2 - stileW / 2), o.h / 2, 0], { grain: "y" });
      const stileL = b.box("stile_l", "softwood", "wood_pine", [stileW, o.h, coreT], [-hx * (o.w / 2 - stileW / 2), o.h / 2, 0], { grain: "y" });
      const iw = o.w - 2 * stileW;
      const railT = b.box("rail_t", "softwood", "wood_pine", [iw, railTop, coreT], [0, o.h - railTop / 2, 0], { grain: "x" });
      const railB = b.box("rail_b", "softwood", "wood_pine", [iw, railBot, coreT], [0, railBot / 2, 0], { grain: "x" });
      const lockW = 0.08,
        lockH = Math.min(0.5, o.h - railTop - railBot - 0.2);
      const lockY = clamp(hh, railBot + lockH / 2 + 0.05, o.h - railTop - lockH / 2 - 0.05);
      const xLockIn = -hx * (o.w / 2 - stileW); // inner face of the lock stile
      const lock = b.box("lock", "softwood", "wood_pine", [lockW, lockH, coreT], [xLockIn + hx * (lockW / 2), lockY, 0], { grain: "y" });
      core.push(stileH, stileL, railT, railB, lock);
      // honeycomb: 3 strips across the main field + the lock column above/below the lock block
      const y0 = railBot,
        y1 = o.h - railTop;
      const xa = hx < 0 ? -o.w / 2 + stileW : xLockIn + hx * lockW; // main field x-range [xa, xb]
      const xb = hx < 0 ? xLockIn + hx * lockW : o.w / 2 - stileW;
      const fieldL = Math.min(xa, xb),
        fieldR = Math.max(xa, xb);
      const strips = 3;
      const sw = (fieldR - fieldL) / strips;
      const comb = (nm: string, x0: number, x1: number, ya: number, yb: number): void => {
        if (x1 - x0 < 0.01 || yb - ya < 0.01) return;
        const vol = (x1 - x0) * (yb - ya) * coreT;
        core.push(b.box(nm, "cardboard", "cardboard", [x1 - x0, yb - ya, coreT], [(x0 + x1) / 2, (ya + yb) / 2, 0], { mass: Math.max(0.01, vol * 25) }));
      };
      for (let k = 0; k < strips; k++) comb(`comb${k}`, fieldL + k * sw, fieldL + (k + 1) * sw, y0, y1);
      const lx0 = Math.min(xLockIn, xLockIn + hx * lockW),
        lx1 = Math.max(xLockIn, xLockIn + hx * lockW);
      comb("comb_lo", lx0, lx1, y0, lockY - lockH / 2);
      comb("comb_hi", lx0, lx1, lockY + lockH / 2, y1);
      for (const s of skins) {
        for (const c of core) {
          const isComb = c.includes("comb");
          glueTouching(b, s, [c], isComb ? 300 : 4000, "glue", isComb ? 4 : 10, isComb ? 60 : 300);
        }
      }
      b.nail(railT, stileH, 2, 10);
      b.nail(railT, stileL, 2, 10);
      b.nail(railB, stileH, 2, 10);
      b.nail(railB, stileL, 2, 10);
      b.glue(lock, stileL, 40);
      hingeMember = stileH;
      lockPart = lock;
    }
    // hinges
    const inset = o.hingeInset ?? (tall ? 0.2 : Math.min(0.1, o.h * 0.15));
    const ys: number[] = [];
    for (let k = 0; k < hingeCount; k++) ys.push(hingeCount === 1 ? o.h / 2 : inset + ((o.h - 2 * inset) * k) / (hingeCount - 1));
    const leaves: string[] = [];
    const pivotX = hx * (o.w / 2 + off);
    const pivotZ = sz * (t / 2 + off);
    const axis = hingeAxis([-hx, 0, 0], [0, 0, sz]);
    const moving: string[] = [];
    ys.forEach((y, k) => {
      if (hw) {
        const leaf = b.box(`leaf${k}`, "steel", "steel_brushed", [0.002, 0.09, 0.022], [hx * (o.w / 2 + 0.001), y, sz * (t / 2 - 0.011)], { tess: 0 });
        b.screw(leaf, hingeMember, 3, 30);
        leaves.push(leaf);
        moving.push(leaf);
      } else moving.push(hingeMember);
    });
    const strength = o.hingeStrength ?? (tall ? 90 : 30);
    const openDeg = o.openDeg ?? (tall ? 100 : 110);
    let group = "";
    ys.forEach((y, k) => {
      group = b.hinge(moving[k], fixed, {
        pivots: [[pivotX, y, pivotZ]],
        axis,
        min: 0,
        max: openDeg,
        strength,
        friction: o.friction ?? (tall ? 0.15 : 0.05),
        group: k > 0 ? group : undefined,
      });
    });
    if (latchSpec) {
      const lp = latchSpec.pos ? latchSpec.pos : ([-hx * (o.w / 2), hh, 0] as V3);
      b.bond(lockPart, latchFixed, "latch", {
        strength: latchSpec.strength,
        anchor: lp,
        joint: { axis: b.d(axis), pivot: b.p([pivotX, ys[0], pivotZ]), min: 0, max: 0, group },
      });
    }
    // handle(s)
    const hs: HandleSpec = o.handle === undefined ? (tall ? { kind: "lever", both: true } : { kind: "bar", vertical: true }) : o.handle;
    const handle: string[] = [];
    if (hs) {
      const hxPos = hs.x ?? -hx * (o.w / 2 - (tall ? 0.065 : 0.04));
      const hyPos = hs.y ?? hh;
      const frontPart = kind === "solid" ? slab : skins[0];
      handle.push(...placeHandle(b, "handle_f", hs, frontPart, v3(hxPos, hyPos, t / 2), false, (hx as 1 | -1)));
      if (hs.both) {
        const backPart = kind === "solid" ? slab : skins[1];
        handle.push(...placeHandle(b, "handle_b", hs, backPart, v3(hxPos, hyPos, -t / 2), true, (hx as 1 | -1)));
      }
    }
    const all = [...(kind === "solid" ? [slab] : []), ...skins, ...core, ...leaves, ...handle];
    return { slab, skins, core, leaves, handle, group, lockPart, all };
  });
}

/**
 * Shelf board resting on pins/brackets or fixed with dowels between two supports. Local frame:
 * centred in x/z, TOP face at y = 0.
 */
export function shelfBoard(
  b: Builder,
  name: string,
  o: { w: number; d: number; t?: number; mat?: MaterialId; surf?: SurfaceName; tint?: number; support?: "pins" | "fixed" | "none"; between?: [string, string]; strength?: number; grain?: "x" | "z" },
  pos: V3 = [0, 0, 0],
  rot?: Rot,
): string {
  const t = o.t ?? 0.018;
  const supports = o.between ? [b.resolve(o.between[0]), b.resolve(o.between[1])] : [];
  let part = "";
  b.group(pos, rot, "", () => {
    part = b.box(name, o.mat ?? "particleboard", o.surf ?? "laminate_white", [o.w, t, o.d], [0, -t / 2, 0], { tint: o.tint, grain: o.grain });
  });
  const mode = o.support ?? "pins";
  for (const s of supports) {
    if (mode === "pins") b.friction(part, s, o.strength ?? 6);
    else if (mode === "fixed") b.dowel(part, s, 2, (o.strength ?? 80) / 2);
  }
  return part;
}

// =============================================================================================
// Furniture bases
// =============================================================================================

export interface TableBaseOpts {
  /** Footprint of the legs' outer faces (x, z) and leg height (= underside of the top). */
  w: number;
  d: number;
  h: number;
  /** Square leg size (m), default 0.045; `taper` = bottom size (inner faces taper). */
  leg?: number;
  taper?: number;
  /** Turned (round) legs. */
  round?: boolean;
  apronH?: number;
  apronT?: number;
  /** Apron face set back from the leg face (m), default 0.005. */
  apronInset?: number;
  mat?: MaterialId;
  surf?: SurfaceName;
  tint?: number;
  /** Stretchers between the legs at height y. */
  stretchers?: { y: number; size?: number; layout?: "box" | "H" | "sides" } | false;
  /** Leg-apron joint strength (J), default 100 (glued mortise/dowels). */
  joint?: number;
}

/**
 * Four legs + aprons (+ optional stretchers) of a table/desk/bench, glued and doweled.
 * Local frame: origin on the floor at the centre; legs' outer faces at x = ±w/2, z = ±d/2;
 * aprons' top at y = h (the top sits on them — bond it with attachTop()).
 */
export function tableBase(b: Builder, name: string, o: TableBaseOpts, pos: V3 = [0, 0, 0], rot?: Rot): { legs: string[]; aprons: string[]; stretchers: string[]; all: string[] } {
  const L = o.leg ?? 0.045;
  const tp = o.taper ?? L;
  const aH = o.apronH ?? 0.08,
    aT = o.apronT ?? 0.02,
    ins = o.apronInset ?? 0.005;
  const mat = o.mat ?? "hardwood",
    surf = o.surf ?? "wood_oak",
    tint = o.tint ?? 0xffffff;
  const { w, d, h } = o;
  need(w > 2 * L + 0.05 && d > 2 * L + 0.05 && h > aH + 0.05, `tableBase '${name}': dimensions too small`);
  return scoped(b, name, pos, rot, () => {
    const legs: string[] = [];
    const corners: Array<[number, number, string]> = [
      [-1, 1, "fl"],
      [1, 1, "fr"],
      [-1, -1, "bl"],
      [1, -1, "br"],
    ];
    const taperTop = h - aH; // taper only below the aprons
    for (const [sx, sz, nm] of corners) {
      if (o.round) {
        legs.push(b.cyl(`leg_${nm}`, mat, surf, tp / 2, h, [sx * (w / 2 - L / 2), h / 2, sz * (d / 2 - L / 2)], { rTop: L / 2, segments: 10, tint }));
        continue;
      }
      const ox = sx * (w / 2),
        oz = sz * (d / 2);
      const pts: V3[] = [];
      const sq = (y: number, s: number): void => {
        for (const [a, c] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ])
          pts.push([ox - sx * a * s, y, oz - sz * c * s]);
      };
      sq(0, tp);
      sq(taperTop, L);
      sq(h, L);
      legs.push(b.hull(`leg_${nm}`, mat, surf, pts, [0, 0, 0], { tint, grain: "y" }));
    }
    const [fl, fr, bl, br] = legs;
    const ax = w - 2 * L,
      az = d - 2 * L;
    const front = b.box("apron_f", mat, surf, [ax, aH, aT], [0, h - aH / 2, d / 2 - ins - aT / 2], { tint, grain: "x" });
    const back = b.box("apron_b", mat, surf, [ax, aH, aT], [0, h - aH / 2, -d / 2 + ins + aT / 2], { tint, grain: "x" });
    const left = b.box("apron_l", mat, surf, [aT, aH, az], [-w / 2 + ins + aT / 2, h - aH / 2, 0], { tint, grain: "z" });
    const right = b.box("apron_r", mat, surf, [aT, aH, az], [w / 2 - ins - aT / 2, h - aH / 2, 0], { tint, grain: "z" });
    const js = o.joint ?? 100;
    for (const [a, l1, l2] of [
      [front, fl, fr],
      [back, bl, br],
      [left, fl, bl],
      [right, fr, br],
    ] as Array<[string, string, string]>) {
      b.bond(a, l1, "dowel", { strength: js });
      b.bond(a, l2, "dowel", { strength: js });
    }
    const stretchers: string[] = [];
    if (o.stretchers) {
      const s = o.stretchers;
      const sS = s.size ?? 0.022;
      const layout = s.layout ?? "H";
      const legAt = (y: number): number => (y >= taperTop ? L : tp + ((L - tp) * y) / taperTop); // leg size at height y
      const ls = legAt(s.y);
      const zIn = d / 2 - ls,
        xIn = w / 2 - ls;
      const xMid = w / 2 - L / 2,
        zMid = d / 2 - L / 2;
      const sl = b.box("str_l", mat, surf, [sS, sS, 2 * zIn], [-xMid, s.y, 0], { tint, grain: "z" });
      const sr = b.box("str_r", mat, surf, [sS, sS, 2 * zIn], [xMid, s.y, 0], { tint, grain: "z" });
      b.dowel(sl, fl, 1, 60);
      b.dowel(sl, bl, 1, 60);
      b.dowel(sr, fr, 1, 60);
      b.dowel(sr, br, 1, 60);
      stretchers.push(sl, sr);
      if (layout === "H") {
        const cx = xMid - sS / 2;
        const sm = b.box("str_m", mat, surf, [2 * cx, sS, sS], [0, s.y, 0], { tint, grain: "x" });
        b.dowel(sm, sl, 1, 50);
        b.dowel(sm, sr, 1, 50);
        stretchers.push(sm);
      } else if (layout === "box") {
        const sf = b.box("str_f", mat, surf, [2 * xIn, sS, sS], [0, s.y + sS, zMid], { tint, grain: "x" });
        const sb = b.box("str_b", mat, surf, [2 * xIn, sS, sS], [0, s.y + sS, -zMid], { tint, grain: "x" });
        b.dowel(sf, fl, 1, 60);
        b.dowel(sf, fr, 1, 60);
        b.dowel(sb, bl, 1, 60);
        b.dowel(sb, br, 1, 60);
        stretchers.push(sf, sb);
      }
    }
    const aprons = [front, back, left, right];
    return { legs, aprons, stretchers, all: [...legs, ...aprons, ...stretchers] };
  });
}

/** Attach a top to every apron/rail it rests on (tabletop fasteners / screws through corner blocks). */
export function attachTop(b: Builder, top: string, supports: string[], o: { kind?: BondKind; count?: number; each?: number } = {}): number {
  let n = 0;
  for (const s of supports) {
    if (!b.contact(top, s, 0.002)) continue;
    b.bond(top, s, o.kind ?? "screw", { strength: (o.count ?? 2) * (o.each ?? 35) });
    n++;
  }
  return n;
}

// =============================================================================================
// Frames and glazing
// =============================================================================================

export interface FrameOpts {
  /** Outer size (local XY) and bar width(s). */
  w: number;
  h: number;
  bar: number | BarWidths;
  /** Depth along z: the frame spans z ∈ [0, depth]. */
  depth: number;
  mat?: MaterialId;
  surf?: SurfaceName;
  tint?: number;
  /** Corner joint kind/strength (default: aluminium screw 60, wood glue 45, plastic fused). */
  corner?: { kind: BondKind; strength?: number };
}

/** Four mitred bars of a rectangular frame (local XY centred, z ∈ [0, depth]). */
export function frameBars(b: Builder, name: string, o: FrameOpts, pos: V3 = [0, 0, 0], rot?: Rot): { top: string; bottom: string; left: string; right: string; all: string[]; inner: { x0: number; x1: number; y0: number; y1: number } } {
  const mat = o.mat ?? "softwood";
  const surf = o.surf ?? "wood_oak";
  const tint = o.tint ?? 0xffffff;
  const P = frameBarPoints(o.w, o.h, o.bar, 0, o.depth);
  return scoped(b, name, pos, rot, () => {
    const top = b.hull("top", mat, surf, P.top, [0, 0, 0], { tint, grain: "x" });
    const bottom = b.hull("bottom", mat, surf, P.bottom, [0, 0, 0], { tint, grain: "x" });
    const left = b.hull("left", mat, surf, P.left, [0, 0, 0], { tint, grain: "y" });
    const right = b.hull("right", mat, surf, P.right, [0, 0, 0], { tint, grain: "y" });
    const mode = MATERIALS[mat].mode;
    const corner = o.corner ?? (mat === "aluminum" || mat === "steel" ? { kind: "screw" as BondKind, strength: 60 } : mode === "splinter" || mat === "mdf" ? { kind: "glue" as BondKind, strength: 45 } : { kind: "fused" as BondKind });
    for (const [a, c] of [
      [top, left],
      [top, right],
      [bottom, left],
      [bottom, right],
    ])
      b.bond(a, c, corner.kind, { strength: corner.strength });
    return { top, bottom, left, right, all: [top, bottom, left, right], inner: P.inner };
  });
}


export interface GlassPaneOpts extends FrameOpts {
  glassT?: number;
  glassMat?: MaterialId;
  glassSurf?: SurfaceName;
  glassTint?: number;
  /** 2 = double glazing (two panes with an air gap). */
  glazing?: 1 | 2;
  gap?: number;
  /** Pane centre z within the frame depth (default depth/2). */
  glassZ?: number;
  /** Glass-to-bar bond (putty/beads/clips): kind and strength per bar. */
  glassBond?: { kind?: BondKind; strength?: number };
}

/**
 * Glass pane(s) held in a mitred frame (window sash, cabinet door, picture glass, oven door).
 * Panes fit the opening exactly and are held by WEAK bonds to each bar, so after shattering the
 * shards touching the frame stay in it. Local XY centred, frame z ∈ [0, depth].
 */
export function glassPaneInFrame(b: Builder, name: string, o: GlassPaneOpts, pos: V3 = [0, 0, 0], rot?: Rot): { bars: { top: string; bottom: string; left: string; right: string }; panes: string[]; all: string[] } {
  const glassT = o.glassT ?? 0.004;
  const gz = o.glassZ ?? o.depth / 2;
  const glazing = o.glazing ?? 1;
  const gap = o.gap ?? 0.012;
  return scoped(b, name, pos, rot, () => {
    const fr = frameBars(b, "", { ...o }, [0, 0, 0]);
    const iw = fr.inner.x1 - fr.inner.x0,
      ih = fr.inner.y1 - fr.inner.y0;
    const cx = (fr.inner.x0 + fr.inner.x1) / 2,
      cy = (fr.inner.y0 + fr.inner.y1) / 2;
    const zs = glazing === 2 ? [gz - gap / 2 - glassT / 2, gz + gap / 2 + glassT / 2] : [gz];
    for (const z of zs) need(z - glassT / 2 >= -1e-9 && z + glassT / 2 <= o.depth + 1e-9, `glassPaneInFrame '${name}': pane outside the frame depth`);
    const panes = zs.map((z, k) =>
      b.box(`pane${k}`, o.glassMat ?? "glass", o.glassSurf ?? "glass", [iw, ih, glassT], [cx, cy, z], {
        tint: o.glassTint,
        faces: { px: { surf: "glass_edge" }, nx: { surf: "glass_edge" }, py: { surf: "glass_edge" }, ny: { surf: "glass_edge" } },
      }),
    );
    const gk = o.glassBond?.kind ?? "clip";
    const gs = o.glassBond?.strength ?? 5;
    for (const p of panes) for (const bar of fr.all) b.bond(p, bar, gk, { strength: gs });
    return { bars: { top: fr.top, bottom: fr.bottom, left: fr.left, right: fr.right }, panes, all: [...fr.all, ...panes] };
  });
}

/**
 * Picture frame hanging on a nail: mitred frame, glass, printed art, hardboard backing. Local
 * frame: back face on the wall at z = 0, front +Z, centred in XY. `nail` = weak world bond at the
 * hanging point (false for a free-standing frame).
 */
export function pictureFrame(
  b: Builder,
  name: string,
  o: { w: number; h: number; bar?: number; depth?: number; mat?: MaterialId; surf?: SurfaceName; tint?: number; art?: SurfaceName; glass?: boolean; nail?: { strength?: number } | false },
  pos: V3 = [0, 0, 0],
  rot?: Rot,
): { bars: string[]; glass?: string; art: string; backing: string; all: string[] } {
  const bar = o.bar ?? 0.03;
  const depth = o.depth ?? 0.02;
  return scoped(b, name, pos, rot, () => {
    const fr = frameBars(b, "frame", { w: o.w, h: o.h, bar, depth, mat: o.mat ?? "softwood", surf: o.surf ?? "wood_walnut", tint: o.tint });
    const iw = fr.inner.x1 - fr.inner.x0,
      ih = fr.inner.y1 - fr.inner.y0;
    let glass: string | undefined;
    const zGlass = depth - 0.006;
    if (o.glass !== false) glass = b.box("glass", "glass", "glass", [iw, ih, 0.002], [0, 0, zGlass - 0.001], { faces: { px: { surf: "glass_edge" }, nx: { surf: "glass_edge" }, py: { surf: "glass_edge" }, ny: { surf: "glass_edge" } } });
    const zArt = zGlass - 0.002;
    const art = b.box("art", "paper", "paper", [iw, ih, 0.001], [0, 0, zArt - 0.0005], { faces: { pz: { surf: o.art ?? "painting_0" } } });
    const backing = b.box("backing", "mdf", "mdf", [iw, ih, 0.003], [0, 0, zArt - 0.001 - 0.0015], {});
    if (glass) {
      for (const p of fr.all) b.clip(glass, p, 4);
      b.friction(art, glass, 2);
    }
    b.glue(art, backing, 5);
    for (const p of fr.all) b.clip(backing, p, 6);
    if (o.nail !== false) b.world(fr.top, "nail", o.nail?.strength ?? 12, [0, o.h / 2 - bar / 2, 0]);
    return { bars: fr.all, glass, art, backing, all: [...fr.all, ...(glass ? [glass] : []), art, backing] };
  });
}

// =============================================================================================
// Soft goods
// =============================================================================================

/** Seat/back cushion: foam core in an upholstery cover (one soft part) with a stuffing feature. Sits on y = 0. */
export function cushion(
  b: Builder,
  name: string,
  o: { size: [number, number, number]; roundness?: number; mat?: MaterialId; surf?: SurfaceName; tint?: number; kg?: number; stuffing?: "foam" | "fiber" | "feathers" },
  pos: V3 = [0, 0, 0],
  rot?: Rot,
): string {
  const [w, h, d] = o.size;
  let part = "";
  b.group(pos, rot, "", () => {
    part = b.pillow(name, o.mat ?? "foam", o.surf ?? "fabric_upholstery", [w, h, d], o.roundness ?? 0.3, [0, h / 2, 0], { tint: o.tint, mass: o.kg });
  });
  b.stuffing(part, o.stuffing ?? "foam");
  return part;
}

/** Bed/sofa pillow (fibre or feather fill; light). Sits on y = 0. */
export function pillow(b: Builder, name: string, o: { size?: [number, number, number]; tint?: number; surf?: SurfaceName; kg?: number; fill?: "feathers" | "fiber" } = {}, pos: V3 = [0, 0, 0], rot?: Rot): string {
  const size = o.size ?? [0.7, 0.14, 0.5];
  const vol = size[0] * size[1] * size[2];
  return cushion(b, name, { size, roundness: 0.55, mat: "fabric", surf: o.surf ?? "fabric_cotton", tint: o.tint, kg: o.kg ?? clamp(vol * 18, 0.3, 2.5), stuffing: o.fill ?? "fiber" }, pos, rot);
}

/** Innerspring/foam mattress (one soft part, ~45 kg/m³ effective). Sits on y = 0. */
export function mattress(b: Builder, name: string, o: { w: number; l: number; h?: number; tint?: number; surf?: SurfaceName; kg?: number }, pos: V3 = [0, 0, 0], rot?: Rot): string {
  const h = o.h ?? 0.24;
  return cushion(b, name, { size: [o.w, h, o.l], roundness: 0.15, mat: "foam", surf: o.surf ?? "fabric_cotton", tint: o.tint ?? 0xf3f0ea, kg: o.kg ?? o.w * o.l * h * 45, stuffing: "fiber" }, pos, rot);
}

// =============================================================================================
// Books
// =============================================================================================

/**
 * Book standing upright: spine facing +Z, thickness along X, page depth along Z, on y = 0.
 * 4 parts (two covers, spine, page block — pages tear into paper scraps) or a single part.
 */
export function book(
  b: Builder,
  name: string,
  o: { w?: number; h?: number; t?: number; cover?: SurfaceName; tint?: number; hardcover?: boolean; parts?: 1 | 4 } = {},
  pos: V3 = [0, 0, 0],
  rot?: Rot,
): { pages: string; covers: string[]; spine?: string; all: string[] } {
  const w = o.w ?? 0.15,
    h = o.h ?? 0.23,
    t = o.t ?? 0.03;
  const cover = o.cover ?? "book_cover_0";
  const hard = o.hardcover ?? true;
  const ct = hard ? 0.0025 : 0.0006;
  const oh = hard ? 0.003 : 0;
  return scoped(b, name, pos, rot, () => {
    if ((o.parts ?? 4) === 1) {
      const p = b.box("book", "paper", "book_pages", [t, h, w], [0, h / 2, 0], {
        tint: 0xffffff,
        faces: { px: { surf: cover, tint: o.tint }, nx: { surf: cover, tint: o.tint }, pz: { surf: cover, tint: o.tint } },
      });
      b.stuffing(p, "paper");
      return { pages: p, covers: [], all: [p] };
    }
    const coverZ0 = -w / 2,
      coverZ1 = w / 2 - ct;
    const coverOpts = (outer: "px" | "nx") => ({ tint: 0xffffff, faces: { [outer]: { surf: cover, tint: o.tint } } as Partial<Record<"px" | "nx", { surf: SurfaceName; tint?: number }>> });
    const cl = b.box("cover_l", "paper", "paper", [ct, h, coverZ1 - coverZ0], [-t / 2 + ct / 2, h / 2, (coverZ0 + coverZ1) / 2], coverOpts("nx"));
    const cr = b.box("cover_r", "paper", "paper", [ct, h, coverZ1 - coverZ0], [t / 2 - ct / 2, h / 2, (coverZ0 + coverZ1) / 2], coverOpts("px"));
    const spine = b.box("spine", "paper", "paper", [t, h, ct], [0, h / 2, w / 2 - ct / 2], { faces: { pz: { surf: cover, tint: o.tint } } });
    const pz0 = -w / 2 + oh,
      pz1 = w / 2 - ct;
    const pages = b.box("pages", "paper", "book_pages", [t - 2 * ct, h - 2 * oh, pz1 - pz0], [0, h / 2, (pz0 + pz1) / 2], { faces: { px: { surf: "paper" }, nx: { surf: "paper" } } });
    b.glue(cl, spine, 30);
    b.glue(cr, spine, 30);
    b.glue(pages, spine, 40);
    b.glue(pages, cl, 15);
    b.glue(pages, cr, 15);
    b.stuffing(pages, "paper");
    return { pages, covers: [cl, cr], spine, all: [cl, cr, spine, pages] };
  });
}

// =============================================================================================
// Lathe vessels (ceramic & glass)
// =============================================================================================

export interface VesselOpts {
  /** Outer profile [radius, y] bottom → top; the first point should be at y = 0. */
  profile: Array<[number, number]>;
  /** Wall thickness (m). */
  t: number;
  segments?: number;
  mat?: MaterialId;
  surf?: SurfaceName;
  innerSurf?: SurfaceName;
  edgeSurf?: SurfaceName;
  /** Surface under the base (unglazed foot). */
  footSurf?: SurfaceName;
  tint?: number;
  innerTint?: number;
  /**
   * Bottom: "disc" (default) = one convex base part fitted inside the wall ring (fewest parts);
   * "tiles" = the lathe's pie-slice cap tiles; "none" = open (a ring, a lampshade).
   */
  cap?: "disc" | "tiles" | "none";
  /** Base thickness (m), default 1.2 × t. */
  baseT?: number;
  /** Total mass override (kg). */
  kg?: number;
}

/**
 * Thick-walled vessel of revolution: wall tiles fused into one shell plus a base. For steep walls
 * (mugs, glasses, bottles, vases) the base is ONE frustum part whose sides lie exactly in the
 * wall's inner facet planes (fused face-to-face to every wall tile); for strongly flared shapes
 * (plates, shallow bowls) the lathe's mitred cap tiles are used instead. Sits on y = 0.
 * Returns all part names; with a disc base the base is the LAST entry. `kg` = wall mass override.
 */
export function vessel(b: Builder, name: string, o: VesselOpts, pos: V3 = [0, 0, 0], rot?: Rot): string[] {
  const mat = o.mat ?? "ceramic";
  const glass = mat === "glass" || mat === "temperedGlass";
  const surf = o.surf ?? (glass ? "glass" : "ceramic_glaze");
  const segs = o.segments ?? 10;
  need(o.profile.length >= 2, `vessel '${name}': profile needs >= 2 points`);
  const [r0, y0] = o.profile[0];
  const [r1, y1] = o.profile[1];
  const dr = r1 - r0,
    dy = y1 - y0;
  const slope = dy > 1e-9 ? dr / dy : Infinity;
  const capMode = o.cap ?? (Math.abs(slope) < 0.5 ? "disc" : "tiles");
  const wall = b.lathe(name, mat, surf, o.innerSurf ?? surf, {
    profile: o.profile,
    thickness: o.t,
    segments: segs,
    capBottom: capMode === "tiles",
    tint: o.tint,
    innerTint: o.innerTint,
    edgeSurf: o.edgeSurf ?? (glass ? "glass_edge" : surf),
    pos,
    rot,
    mass: o.kg,
  });
  if (capMode !== "disc") return wall;
  need(Math.abs(y0) < 1e-9 && Number.isFinite(slope), `vessel '${name}': a disc base needs a profile starting at y = 0 and rising`);
  const l = Math.hypot(dr, dy);
  const nx = dy / l,
    ny = -dr / l; // outward normal of the first wall span (r, y)
  const yIn = -ny * o.t; // height where the inner wall surface starts
  const top = Math.min(Math.max(o.baseT ?? o.t * 1.2, yIn + 0.5 * o.t), dy * 0.6);
  const rIn = (y: number): number => r0 - nx * o.t + (y - yIn) * slope;
  need(rIn(0) > 0.002 && rIn(top) > 0.002, `vessel '${name}': wall too thick for a disc base`);
  let base = "";
  b.group(pos, rot, "", () => {
    base = b.cyl(`${name}_base`, mat, surf, rIn(0), top, [0, top / 2, 0], {
      rTop: rIn(top),
      segments: segs,
      tint: o.innerTint ?? o.tint,
      capSurf: o.innerSurf ?? surf,
      capTint: o.innerTint ?? o.tint,
    });
  });
  if (o.footSurf) {
    const foot = S[o.footSurf];
    const p = b.get(base);
    for (const f of p.poly.faces) if (f.n.y < -0.9) f.attr = { ...f.attr, surf: foot };
  }
  let fused = 0;
  for (const w of wall) {
    const c = b.contact(base, w, 0.001);
    if (c && (c.kind === "face" || c.penetrating)) {
      b.fuse(base, w);
      fused++;
    }
  }
  if (fused < wall.length) b.warn(`vessel '${name}': base touches only ${fused}/${wall.length} wall tiles`);
  return [...wall, base];
}

/** Lowest tile of a vessel (its base / cap) — where liquid features go. */
export function lowestPart(b: Builder, parts: string[]): string {
  let best = parts[0],
    by = Infinity;
  for (const p of parts) {
    const c = polyCentroid(b.get(p).poly);
    if (c.y < by - 1e-9) {
      by = c.y;
      best = p;
    }
  }
  return best;
}

/** Dinner plate (Ø 27 cm, ~0.55 kg). */
export function plate(b: Builder, name: string, o: { r?: number; h?: number; t?: number; segments?: number; surf?: SurfaceName; tint?: number } = {}, pos: V3 = [0, 0, 0], rot?: Rot): string[] {
  const r = o.r ?? 0.135,
    h = o.h ?? 0.022;
  return vessel(b, name, { profile: [[r * 0.55, 0], [r, h]], t: o.t ?? 0.0045, segments: o.segments ?? 10, surf: o.surf, tint: o.tint ?? 0xf7f5ef, innerTint: o.tint ?? 0xf7f5ef }, pos, rot);
}

/** Bowl (Ø 15 cm, ~0.35 kg). */
export function bowl(b: Builder, name: string, o: { r?: number; h?: number; t?: number; segments?: number; surf?: SurfaceName; tint?: number } = {}, pos: V3 = [0, 0, 0], rot?: Rot): string[] {
  const r = o.r ?? 0.075,
    h = o.h ?? 0.065;
  return vessel(b, name, { profile: [[r * 0.48, 0], [r * 0.86, h * 0.45], [r, h]], t: o.t ?? 0.005, segments: o.segments ?? 8, surf: o.surf, tint: o.tint ?? 0xf2efe6 }, pos, rot);
}

/**
 * Ceramic mug (Ø 8.2 cm, h 9.5 cm, ~0.35 kg) with a D-shaped handle on +X built as a mitred tube
 * whose ends are sunk into the wall and fused to it.
 */
export function mug(
  b: Builder,
  name: string,
  o: { r?: number; h?: number; t?: number; segments?: number; surf?: SurfaceName; tint?: number; innerTint?: number; handle?: boolean } = {},
  pos: V3 = [0, 0, 0],
  rot?: Rot,
): { body: string[]; handle: string[]; all: string[] } {
  const r = o.r ?? 0.041,
    h = o.h ?? 0.095,
    t = o.t ?? 0.0055;
  const rb = r * 0.9;
  return scoped(b, name, pos, rot, () => {
    const body = vessel(b, "body", {
      profile: [
        [rb, 0],
        [r, h],
      ],
      t,
      segments: o.segments ?? 8,
      surf: o.surf ?? "ceramic_glaze",
      innerSurf: "ceramic_glaze",
      footSurf: "ceramic_bisque",
      tint: o.tint ?? 0xffffff,
      innerTint: o.innerTint ?? 0xf6f3ec,
      cap: "disc",
    });
    const handle: string[] = [];
    if (o.handle !== false) {
      const rAt = (y: number): number => rb + ((r - rb) * y) / h;
      const yT = h * 0.81,
        yB = h * 0.24;
      const depth = Math.min(0.002, t * 0.4);
      const pts: V3[] = [
        [rAt(yT) - depth - t * 0.2, yT, 0],
        [r + 0.025, yT - 0.002, 0],
        [r + 0.032, (yT + yB) / 2, 0],
        [r + 0.025, yB + 0.002, 0],
        [rAt(yB) - depth - t * 0.2, yB, 0],
      ];
      handle.push(...b.tube("handle", "ceramic", o.surf ?? "ceramic_glaze", pts, 0.0055, { sides: 6, tint: o.tint ?? 0xffffff }));
      // fuse the handle ends to whichever wall tiles they are sunk into
      const ends = [handle[0], handle[handle.length - 1]];
      let fused = 0;
      for (const e of ends)
        for (const tile of body) {
          const c = b.contact(e, tile, 0.001);
          if (c && (c.penetrating || c.kind === "face")) {
            b.fuse(e, tile);
            fused++;
          }
        }
      if (fused < 2) b.warn(`mug '${name}': handle ends not embedded in the wall (${fused} joints)`);
    }
    return { body, handle, all: [...body, ...handle] };
  });
}

/** Drinking glass / tumbler (annealed glass, ~0.2 kg). */
export function drinkingGlass(b: Builder, name: string, o: { r?: number; h?: number; t?: number; segments?: number; tint?: number } = {}, pos: V3 = [0, 0, 0], rot?: Rot): string[] {
  const r = o.r ?? 0.036,
    h = o.h ?? 0.11;
  return vessel(b, name, { profile: [[r * 0.82, 0], [r, h]], t: o.t ?? 0.0028, segments: o.segments ?? 8, mat: "glass", surf: "glass", tint: o.tint }, pos, rot);
}

/**
 * Wine (0.75 l) or beer (0.33 l) bottle: hollow lathe body + shoulder, solid neck, `liquid`
 * feature on the base. Sits on y = 0.
 */
export function bottle(
  b: Builder,
  name: string,
  o: { kind?: "wine" | "beer"; tint?: number; liquid?: { color: number; litres: number } | false; segments?: number } = {},
  pos: V3 = [0, 0, 0],
  rot?: Rot,
): { shell: string[]; neck: string; base: string; all: string[] } {
  const wine = (o.kind ?? "wine") === "wine";
  const R = wine ? 0.038 : 0.031;
  const hb = wine ? 0.2 : 0.12; // body height
  const hs = wine ? 0.235 : 0.165; // shoulder top
  const rn = wine ? 0.0145 : 0.0135;
  const hn = wine ? 0.065 : 0.06; // neck length
  const t = wine ? 0.0035 : 0.003;
  const tint = o.tint ?? (wine ? 0x2f5a35 : 0x6b3d14);
  return scoped(b, name, pos, rot, () => {
    const shell = vessel(b, "shell", {
      profile: [
        [R, 0],
        [R, hb],
        [rn + 0.002, hs],
      ],
      t,
      segments: o.segments ?? 8,
      mat: "glass",
      surf: "glass_dark",
      innerSurf: "glass_dark",
      edgeSurf: "glass_edge",
      tint,
      innerTint: tint,
      cap: "disc",
      baseT: t * 1.6,
    });
    // solid neck sunk 4 mm into the shoulder ring so it fuses to the shoulder tiles
    const neck = b.cyl("neck", "glass", "glass_dark", rn, hn + 0.004, [0, hs - 0.004 + (hn + 0.004) / 2, 0], { segments: o.segments ?? 8, tint, capSurf: "glass_edge" });
    let fused = 0;
    for (const tile of shell) {
      const c = b.contact(neck, tile, 0.001);
      if (c && (c.penetrating || c.kind === "face")) {
        b.fuse(neck, tile);
        fused++;
      }
    }
    if (!fused) b.warn(`bottle '${name}': neck does not touch the shoulder`);
    const base = shell[shell.length - 1];
    const liq = o.liquid === undefined ? { color: wine ? 0x5a0f1e : 0xd9a441, litres: wine ? 0.75 : 0.33 } : o.liquid;
    if (liq) b.liquid(base, liq.color, liq.litres);
    return { shell, neck, base, all: [...shell, neck] };
  });
}

/** Flower vase (ceramic, bulbous). */
export function vase(b: Builder, name: string, o: { r?: number; h?: number; t?: number; segments?: number; tint?: number; surf?: SurfaceName } = {}, pos: V3 = [0, 0, 0], rot?: Rot): string[] {
  const r = o.r ?? 0.07,
    h = o.h ?? 0.26;
  return vessel(b, name, { profile: [[r * 0.6, 0], [r, h * 0.35], [r * 0.55, h]], t: o.t ?? 0.006, segments: o.segments ?? 8, surf: o.surf, tint: o.tint ?? 0x3d6f8c }, pos, rot);
}

// =============================================================================================
// Lighting
// =============================================================================================

/**
 * Light bulb (glass envelope with the `light` feature, aluminium screw base) in an optional
 * socket. Local frame: base on the origin, bulb pointing +Y (rotate 180° about X for pendants).
 */
export function lightBulb(
  b: Builder,
  name: string,
  o: { kind?: "a19" | "globe" | "candle"; on?: boolean; mains?: boolean; color?: number; intensity?: number; range?: number; castShadows?: boolean; socket?: boolean | HardwareLook; fixedTo?: string } = {},
  pos: V3 = [0, 0, 0],
  rot?: Rot,
): { glass: string; base: string; socket?: string; all: string[] } {
  const kind = o.kind ?? "a19";
  const R = kind === "globe" ? 0.045 : kind === "candle" ? 0.017 : 0.03;
  const stretch = kind === "candle" ? 1.9 : 1.1;
  const baseR = kind === "candle" ? 0.007 : 0.0135;
  const baseH = kind === "candle" ? 0.02 : 0.024;
  const neckR = baseR * 0.92;
  const fixedTo = o.fixedTo ? b.resolve(o.fixedTo) : null;
  const on = o.on ?? true;
  return scoped(b, name, pos, rot, () => {
    let socket: string | undefined;
    if (o.socket !== false && o.socket !== undefined) {
      const look: HardwareLook = typeof o.socket === "object" ? o.socket : {};
      socket = b.cyl("socket", look.mat ?? "plastic", look.surf ?? "plastic", baseR * 1.45, 0.03, [0, -0.015, 0], { segments: 10, tint: look.tint ?? 0xf0eee8 });
    }
    const base = b.cyl("base", "aluminum", "aluminum", baseR, baseH, [0, baseH / 2, 0], { segments: 10 });
    // envelope: neck ring + ellipsoidal globe samples
    const yc = baseH + R * stretch * 1.25;
    const pts: V3[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (2 * Math.PI * k) / 10;
      pts.push([neckR * Math.cos(a), baseH, neckR * Math.sin(a)]);
    }
    for (let ring = 0; ring < 6; ring++) {
      const phi = -Math.PI / 2 + 0.35 + ((Math.PI - 0.35) * ring) / 6;
      const rr = R * Math.cos(phi),
        yy = yc + R * stretch * Math.sin(phi);
      for (let k = 0; k < 10; k++) {
        const a = (2 * Math.PI * (k + 0.5 * (ring % 2))) / 10;
        pts.push([rr * Math.cos(a), yy, rr * Math.sin(a)]);
      }
    }
    pts.push([0, yc + R * stretch, 0]);
    const glass = b.hull("glass", "glass", on ? "bulb_on" : "bulb_off", pts, [0, 0, 0], { smooth: 1, mass: kind === "globe" ? 0.045 : kind === "candle" ? 0.015 : 0.028 });
    b.glue(glass, base, 6);
    if (socket) b.screw(base, socket, 1, 12);
    if (fixedTo) b.screw(socket ?? base, fixedTo, 2, 20);
    b.light({ part: glass, pos: [0, yc, 0], color: o.color, intensity: o.intensity, range: o.range, castShadows: o.castShadows, mains: o.mains, on });
    return { glass, base, socket, all: [glass, base, ...(socket ? [socket] : [])] };
  });
}

// =============================================================================================
// Cables and pipes
// =============================================================================================

export interface LineEnd {
  to: string;
  kind?: BondKind;
  strength?: number;
}

function attachEnds(b: Builder, segs: string[], start?: LineEnd, end?: LineEnd): void {
  if (start) b.bond(segs[0], b.resolve(start.to), start.kind ?? "clip", { strength: start.strength ?? 20 });
  if (end) b.bond(segs[segs.length - 1], b.resolve(end.to), end.kind ?? "clip", { strength: end.strength ?? 20 });
}

/**
 * Electrical cable along a polyline (current frame + pos): copper conductors in an insulating
 * jacket, as mitred segments that tear apart at their joints. Optional `sparks` on every segment.
 */
export function cable(
  b: Builder,
  name: string,
  points: V3[],
  o: { r?: number; sides?: number; surf?: SurfaceName; tint?: number; kgPerM?: number; jointStrength?: number; sparks?: number; start?: LineEnd; end?: LineEnd; pos?: V3 } = {},
): string[] {
  const segs = b.tube(name, "copper", o.surf ?? "rubber", points, o.r ?? 0.0035, {
    sides: o.sides ?? 6,
    tint: o.tint ?? 0x1c1c1c,
    kgPerM: o.kgPerM ?? 0.06,
    joint: "fused",
    jointStrength: o.jointStrength ?? 40,
    tess: 0,
    pos: o.pos,
  });
  attachEnds(b, segs, o.start, o.end);
  if (o.sparks !== undefined) for (const s of segs) b.sparks(s, o.sparks);
  return segs;
}

/** Mass per metre (kg/m) of a pipe of outer diameter od and wall thickness, optionally water-filled. */
export function pipeKgPerM(od: number, wall: number, density: number, full: boolean): number {
  const ro = od / 2,
    ri = Math.max(0, ro - wall);
  return Math.PI * (ro * ro - ri * ri) * density + (full ? Math.PI * ri * ri * 1000 : 0);
}

/**
 * Pipe along a polyline (copper supply by default, or PVC drain with mat "plastic"), as mitred
 * segments with soldered joints. `water` features go on alternating segments so a broken joint
 * always starts exactly one leak.
 */
export function pipe(
  b: Builder,
  name: string,
  points: V3[],
  o: { od?: number; wall?: number; mat?: MaterialId; surf?: SurfaceName; tint?: number; sides?: number; full?: boolean; jointStrength?: number; water?: { pressure?: number; litres?: number } | false; start?: LineEnd; end?: LineEnd; pos?: V3 } = {},
): string[] {
  const mat = o.mat ?? "copper";
  const od = o.od ?? 0.015;
  const wall = o.wall ?? (mat === "copper" ? 0.0008 : 0.0022);
  const density = mat === "copper" ? 8900 : mat === "plastic" ? 1400 : 7850;
  const full = o.full ?? o.water !== false;
  const segs = b.tube(name, mat, o.surf ?? (mat === "copper" ? "copper" : "plastic"), points, od / 2, {
    sides: o.sides ?? 8,
    tint: o.tint,
    kgPerM: pipeKgPerM(od, wall, density, full),
    joint: "fused",
    jointStrength: o.jointStrength ?? Math.round(clamp(od * 13000, 60, 600)),
    tess: mat === "copper" ? 0.05 : 0,
    pos: o.pos,
  });
  attachEnds(b, segs, o.start, o.end);
  if (o.water !== false) {
    const pressure = o.water?.pressure ?? 0.7;
    const P = points.map(vec);
    const off = o.pos ? vec(o.pos) : v3();
    segs.forEach((s, i) => {
      if (i % 2 !== 0 && segs.length > 1) return;
      const a = vadd(P[Math.min(i, P.length - 1)], off),
        c = vadd(P[Math.min(i + 1, P.length - 1)], off);
      const mid = vscale(vadd(a, c), 0.5);
      const dir = vnorm(vsub(c, a));
      // spray sideways/up out of the pipe wall
      let side = vsub(v3(0, 1, 0), vscale(dir, vdot(dir, v3(0, 1, 0))));
      if (vlen(side) < 0.2) side = vperp(dir);
      b.water(s, [mid.x, mid.y, mid.z], [side.x, side.y, side.z], pressure, o.water ? o.water.litres : undefined);
    });
  }
  return segs;
}

// =============================================================================================
// Misc geometry helpers for content builders
// =============================================================================================

/**
 * Rotation for radial parts (fan blades, spokes) built along local +X: first pitch about local X by
 * `pitchDeg`, then spin about the hub `axis` by `spokeDeg`.
 */
export function spokeRot(axis: "x" | "y" | "z", spokeDeg: number, pitchDeg = 0): Rot {
  const ax = axis === "x" ? v3(1, 0, 0) : axis === "y" ? v3(0, 1, 0) : v3(0, 0, 1);
  const q1 = qaxisAngle(ax, (spokeDeg * Math.PI) / 180);
  const q2 = qaxisAngle(v3(1, 0, 0), (pitchDeg * Math.PI) / 180);
  return qmul(q1, q2);
}
