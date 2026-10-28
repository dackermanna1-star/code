// Window coverings. WALL frame: origin on the finished wall face at the TOP centre of the
// covering (blinds: top of the brackets; curtains: rod centre line), front +Z into the room,
// everything hangs down along −Y. PURE MODULE.

import { Builder } from "../lib/builder.ts";
import { hingeAxis } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { ringX, BRONZE } from "./parts.ts";

// ============================================================================================
// Venetian blind
// ============================================================================================

export interface BlindOpts {
  /** Overall width (m) incl. the end brackets, default 1.7. */
  w?: number;
  /** Drop from the bracket tops to the underside of the bottom rail (m), default 1.35. */
  drop?: number;
  /** Slat width (m), default 0.05 (2" aluminium slats). */
  slat?: number;
  /** Slat tilt (deg) — 0 = horizontal/open, ~80 = closed. Default 35. */
  tilt?: number;
  tint?: number;
  seed?: number;
  validate?: "basic" | "full";
}

/** Distance of the slat stack's centre plane from the wall face. */
export const BLIND_Z = 0.033;

/**
 * Aluminium venetian blind (outside mount): steel end brackets screwed to the wall, aluminium
 * head rail, ~30 thin aluminium slats (tessellated → they dent and crumple) resting on three
 * fabric ladder tapes with WEAK clip bonds (slats bend, pop out and fall), a bottom rail, and a
 * clear tilt wand on a ball joint. The ladder tapes hang from the head rail on a hinge group, so
 * the whole slat stack swings away from the window when bumped. ~2–2.5 kg.
 */
export function buildVenetianBlind(opts: BlindOpts = {}): AssemblyDef {
  const W = opts.w ?? 1.7;
  const drop = opts.drop ?? 1.35;
  const sw = opts.slat ?? 0.05;
  const tilt = opts.tilt ?? 35;
  const tint = opts.tint ?? 0xeeeeea;
  const b = new Builder("venetianBlind", "Venetian Blind", "fixture", 60, opts.seed);
  const zc = BLIND_Z;
  // ---- brackets + head rail (static)
  const brW = 0.03,
    brH = 0.045,
    brD = 0.056;
  const brackets = [-1, 1].map((s) => {
    const br = b.box(`bracket${s < 0 ? "L" : "R"}`, "steelSheet", "metal_painted", [brW, brH, brD], [s * (W / 2 - brW / 2), -brH / 2, brD / 2], { mass: 0.03, tint, tess: 0 });
    b.world(br, "screw", 60, [s * (W / 2 - brW / 2), -brH / 2, 0]);
    return br;
  });
  const railL = W - 2 * brW;
  const hrTop = -0.01,
    hrH = 0.025,
    hrD = 0.026;
  const hrBot = hrTop - hrH;
  const head = b.box("headrail", "aluminum", "aluminum", [railL, hrH, hrD], [0, hrTop - hrH / 2, zc], { mass: 0.25 * railL, tint, tess: 0.08 });
  for (const br of brackets) b.clip(head, br, 20);
  // ---- bottom rail
  const brailH = 0.012;
  const slatL = W - 0.07;
  const brailY = -drop + brailH / 2;
  const brail = b.box("bottomrail", "aluminum", "aluminum", [slatL, brailH, sw], [0, brailY, zc], { mass: 0.12 * slatL, tint, tess: 0.08 });
  // ---- slats
  const pitch = sw * 0.86;
  const t = (tilt * Math.PI) / 180;
  const halfZ = (sw / 2) * Math.cos(t) + 0.00025 * Math.sin(t);
  const halfY = (sw / 2) * Math.sin(t) + 0.00025 * Math.cos(t);
  const yFirst = hrBot - 0.012 - halfY;
  const yLast = -drop + brailH + 0.012 + halfY;
  const n = Math.max(2, Math.floor((yFirst - yLast) / pitch) + 1);
  const slats: string[] = [];
  for (let i = 0; i < n; i++) {
    const y = yFirst - i * pitch;
    // positive rotation about X lifts the back (−Z) edge: open towards the room, light comes in
    slats.push(b.box(`slat${i}`, "aluminum", "aluminum", [slatL, 0.0005, sw], [0, y, zc], { rot: [tilt, 0, 0], mass: 0.027 * slatL, tint, tess: 0.05 }));
  }
  // ---- ladder tapes (front + back string per ladder) — hung from the head rail on hinges
  const nl = W > 1.2 ? 3 : 2;
  const xs: number[] = [];
  for (let k = 0; k < nl; k++) xs.push(-slatL / 2 + 0.12 + (k * (slatL - 0.24)) / (nl - 1));
  const sTop = hrBot,
    sBot = -drop + brailH;
  const sLen = sTop - sBot;
  const axis = hingeAxis([0, -1, 0], [0, 0, 1]);
  let group: string | undefined;
  xs.forEach((x, k) => {
    for (const side of [1, -1]) {
      const z = zc + side * (halfZ + 0.0006);
      const str = b.box(`ladder${k}${side > 0 ? "f" : "b"}`, "fabric", "fabric_cotton", [0.012, sLen, 0.0012], [x, (sTop + sBot) / 2, z], { tint });
      for (const s of slats) b.bond(s, str, "clip", { strength: 1.5 });
      b.glue(str, brail, 8);
      group = b.hinge(str, head, { pivots: [[x, sTop, zc]], axis, min: -6, max: 40, strength: 25, friction: 0.05, group });
    }
  });
  // ---- tilt wand (ball joint at the tilt gear)
  const wandL = Math.min(0.75, drop * 0.55);
  const wx = slatL / 2 - 0.05;
  const wz = zc + hrD / 2 + 0.016;
  const wand = b.cyl("wand", "acrylic", "plastic_glossy", 0.0045, wandL, [wx, hrBot - 0.004 - wandL / 2, wz], { segments: 8, tint: 0xdfe8ea });
  b.hinge(wand, head, { pivots: [[wx, hrBot - 0.002, wz]], axis: [1, 0, 0], min: -90, max: 90, strength: 10, friction: 0.02 });
  return b.build({ validate: opts.validate });
}

// ============================================================================================
// Curtains on a rod
// ============================================================================================

export interface CurtainPanelSpec {
  /** x of the first ring (local, along the rod). */
  x0: number;
  /** Direction in which the panel's rings continue along the rod (+1 / −1). */
  dir: 1 | -1;
  /** Number of fabric strips (= rings). */
  strips: number;
}

export interface CurtainOpts {
  /** Rod tube length between the finials (m). */
  rodLen: number;
  /** Bracket positions along the rod (local x). */
  brackets: number[];
  panels: CurtainPanelSpec[];
  /** Height of the rod centre above the floor (m) — sets the floor-length drop. */
  rodHeight: number;
  /** Gap left between the hem and the floor (m), default 0.015. */
  floorGap?: number;
  /** Mass of one panel (kg), default 1.2. */
  panelKg?: number;
  tint?: number;
  seed?: number;
  validate?: "basic" | "full";
}

/** Rod centre distance from the wall face. */
export const ROD_Z = 0.11;
const ROD_R = 0.0125;
const STRIP_W = 0.13;
const PLEAT = 30;
/** Spacing of the rings/strips along the rod (strip width projected through the pleat angle). */
export const RING_SPACING = STRIP_W * Math.cos((PLEAT * Math.PI) / 180);

/**
 * Floor-length curtains on a 25 mm steel rod: wall brackets (rose + arm, screwed to the wall),
 * rod with finials, steel rings (six fused tiles — they really encircle the rod, so a ring
 * whose friction grip breaks slides along it and cannot fall off past the finials), and
 * pleated fabric panels made of vertical strips glued edge to edge (they tear apart) and hinged
 * to their rings, so the panels swing when brushed. ~1.2 kg per panel.
 */
export function buildCurtains(o: CurtainOpts): AssemblyDef {
  const b = new Builder("curtains", "Curtains & Rod", "soft", 150, o.seed);
  const zr = ROD_Z;
  const L = o.rodLen;
  const rod = b.cyl("rod", "steel", "metal_black", ROD_R, L, [0, 0, zr], { axis: "x", segments: 12, mass: 0.6 * L });
  for (const s of [-1, 1]) {
    const fin = b.ellipsoid(`finial${s < 0 ? "L" : "R"}`, "steel", "metal_black", [0.03, 0.022, 0.022], [s * (L / 2 + 0.03), 0, zr], { segments: 10, rings: 6 });
    b.press(fin, rod, 15);
  }
  const armR = 0.007;
  const armY = -(ROD_R + armR);
  for (const [k, xb] of o.brackets.entries()) {
    const rose = b.cyl(`rose${k}`, "steel", "metal_black", 0.03, 0.012, [xb, armY, 0.006], { axis: "z", segments: 12 });
    b.world(rose, "screw", 60, [xb, armY, 0]);
    const armL = zr - 0.012;
    const arm = b.cyl(`arm${k}`, "steel", "metal_black", armR, armL, [xb, armY, 0.012 + armL / 2], { axis: "z", segments: 8 });
    b.weld(arm, rose, 150);
    b.screw(rod, arm, 1, 40);
  }
  // rings: centre below the rod axis so the top tile rests on the rod
  const R = 0.026,
    r = 0.0035,
    segs = 6;
  const inner = (R - r) * Math.cos(Math.PI / segs);
  const yc = ROD_R - inner;
  const ringBottom = yc - (R + r) * Math.sin((60 * Math.PI) / 180);
  const yTop = ringBottom - 0.006;
  const yBot = -(o.rodHeight - (o.floorGap ?? 0.015));
  const len = yTop - yBot;
  const panelKg = o.panelKg ?? 1.2;
  const axis = hingeAxis([0, -1, 0], [0, 0, 1]);
  const tint = o.tint ?? 0x8c6f5a;
  o.panels.forEach((p, pi) => {
    let prev: string | null = null;
    let group: string | undefined;
    for (let k = 0; k < p.strips; k++) {
      const x = p.x0 + p.dir * k * RING_SPACING;
      const ring = ringX(b, `ring${pi}_${k}`, { R, r, segs, mat: "steel", surf: "metal_black", seam: 80 }, [x, yc, zr]);
      b.friction(ring[0], rod, 3);
      const bottomTile = ring[segs / 2];
      const yaw = (k % 2 === 0 ? 1 : -1) * PLEAT;
      const strip = b.box(`strip${pi}_${k}`, "fabric", "fabric_upholstery", [STRIP_W, len, 0.006], [x, (yTop + yBot) / 2, zr], {
        rot: [0, yaw, 0],
        mass: panelKg / p.strips,
        tint,
      });
      if (prev) b.glue(prev, strip, 12);
      prev = strip;
      group = b.hinge(strip, bottomTile, { pivots: [[x, (ringBottom + yTop) / 2, zr]], axis, min: -3, max: 30, strength: 30, friction: 0.1, group });
    }
  });
  return b.build({ validate: o.validate });
}

void BRONZE;
