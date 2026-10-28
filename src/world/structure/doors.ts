// Doors (one assembly per opening, frame + leaf): interior hollow-core doors (HDF skins on a
// pine stile/rail frame with lock blocks and a cardboard honeycomb core, lever handles through
// a latch) on 3 hinges with a latch, in painted pine jambs with stops and MDF casings; the front
// door is solid core (walnut-veneered HDF skins, hardwood stiles/rails, laminated pine staves),
// 3 heavy hinges, a deadbolt (strong latch), peephole, oak threshold. Frames are nailed /
// screwed to the building (world bonds), leaves hang on hinge joints. PURE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { Builder } from "../../objects/lib/builder.ts";
import type { MaterialId } from "../../destruction/model/materials.ts";
import type { SurfaceName } from "../../render/surfaces.ts";
import { roomById } from "../plan.ts";
import { CASING_REVEAL, CASING_T, CASING_W, DOOR_T, FRONT_DOOR_T, FRONT_JAMB_T, HANDLE_Y, JAMB_T, SHIM } from "./levels.ts";
import type { ConcreteRun, PartitionRun, RunOpening } from "./layout.ts";
import { Fixings, PAL, bondAt, boxR, mid, newBuilder, worldAt, type Interval, type V3 } from "./common.ts";
import { clearOpening } from "./openings.ts";
import { hingeGroup } from "./joints.ts";
import { hingedDoorPanel } from "../../objects/lib/kit.ts";
import { inFrame } from "./concrete.ts";
import { splitEven } from "./rects.ts";

const rng = (a: number, c: number): Interval => [Math.min(a, c), Math.max(a, c)];

interface LeafSpec {
  s0: number;
  s1: number;
  yb: number;
  yt: number;
  /** Swing-side face plane (w) and swing side. */
  wS: number;
  sw: number;
  hingeAtLow: boolean;
  thick: number;
  skinT: number;
  skinMat: MaterialId;
  skinSurf: SurfaceName;
  skinTint: number;
  stileMat: MaterialId;
  stileSurf: SurfaceName;
  stileW: number;
  railH: number;
  core: "honeycomb" | "staves";
  handleY: number;
  /** Deadbolt height (front door). */
  boltY?: number;
  /** Peephole height (front door). */
  peepY?: number;
}

interface LeafParts {
  hingeStile: string;
  latch: string;
  bolt: string | null;
  skinS: string;
  skinB: string;
  wCore: Interval;
}

/** Door leaf construction (local wall frame, u along the wall). */
function addLeaf(b: Builder, sp: LeafSpec): LeafParts {
  const { s0, s1, yb, yt, wS, sw, hingeAtLow, thick, skinT, stileW, railH } = sp;
  const wB = wS - sw * thick;
  const L = (d: number) => (hingeAtLow ? s1 - d : s0 + d); // measured from the latch edge
  const H = (d: number) => (hingeAtLow ? s0 + d : s1 - d); // measured from the hinge edge
  const wSkinS = rng(wS, wS - sw * skinT),
    wSkinB = rng(wB, wB + sw * skinT),
    wCore = rng(wB + sw * skinT, wS - sw * skinT);
  const hy = sp.handleY;
  const skinS = "skinSwing",
    skinB = "skinBack";
  const skinOpts = { tint: sp.skinTint, supported: true, tags: ["door"] };
  boxR(b, skinS, sp.skinMat, sp.skinSurf, [s0, s1], [yb, yt], wSkinS, skinOpts);
  boxR(b, skinB, sp.skinMat, sp.skinSurf, [s0, s1], [yb, yt], wSkinB, skinOpts);

  // ---- frame of the core: hinge stile, latch stile split around latch (+ deadbolt), rails
  const stOpts = { tags: ["door"] };
  const hingeStile = "stileHinge";
  boxR(b, hingeStile, sp.stileMat, sp.stileSurf, rng(H(0), H(stileW)), [yb, yt], wCore, stOpts);
  const latchY: Array<[number, number]> = [[hy - 0.0175, hy + 0.0175]];
  if (sp.boltY !== undefined) latchY.push([sp.boltY - 0.02, sp.boltY + 0.02]);
  latchY.sort((p, q) => p[0] - q[0]);
  const latchStiles: Array<{ name: string; y0: number; y1: number }> = [];
  let yCur = yb;
  latchY.forEach(([a, c], i) => {
    latchStiles.push({ name: `stileLatch${i}`, y0: yCur, y1: a });
    yCur = c;
  });
  latchStiles.push({ name: `stileLatch${latchY.length}`, y0: yCur, y1: yt });
  for (const s of latchStiles) boxR(b, s.name, sp.stileMat, sp.stileSurf, rng(L(0), L(stileW)), [s.y0, s.y1], wCore, stOpts);
  const railB = "railBottom",
    railT = "railTop";
  boxR(b, railB, sp.stileMat, sp.stileSurf, rng(H(stileW), L(stileW)), [yb, yb + railH], wCore, { ...stOpts, grain: "x" });
  boxR(b, railT, sp.stileMat, sp.stileSurf, rng(H(stileW), L(stileW)), [yt - railH, yt], wCore, { ...stOpts, grain: "x" });
  const jk = sp.core === "staves" ? "dowel" : "nail";
  const jJ = sp.core === "staves" ? 80 : 30;
  bondAt(b, railB, hingeStile, jk, jJ, [H(stileW), yb + railH / 2, mid(wCore[0], wCore[1])]);
  bondAt(b, railT, hingeStile, jk, jJ, [H(stileW), yt - railH / 2, mid(wCore[0], wCore[1])]);
  bondAt(b, railB, latchStiles[0].name, jk, jJ, [L(stileW), yb + railH / 2, mid(wCore[0], wCore[1])]);
  bondAt(b, railT, latchStiles[latchStiles.length - 1].name, jk, jJ, [L(stileW), yt - railH / 2, mid(wCore[0], wCore[1])]);

  // ---- latch (and deadbolt) bodies in the latch stile
  const latchDepth = sp.core === "staves" ? stileW : 0.08;
  const latch = "latch";
  boxR(b, latch, "steel", "chrome", rng(L(0), L(latchDepth)), [hy - 0.0175, hy + 0.0175], wCore, { mass: 0.25, tags: ["door", "latch"] });
  let bolt: string | null = null;
  if (sp.boltY !== undefined) {
    bolt = "deadbolt";
    boxR(b, bolt, "steel", "chrome", rng(L(0), L(stileW)), [sp.boltY - 0.02, sp.boltY + 0.02], wCore, { mass: 0.35, tags: ["door", "lock"] });
  }
  for (const s of latchStiles) {
    for (const body of [latch, bolt]) {
      if (!body) continue;
      const by = body === latch ? hy : sp.boltY!;
      const half = body === latch ? 0.0175 : 0.02;
      if (Math.abs(s.y1 - (by - half)) < 1e-6) bondAt(b, body, s.name, "screw", 20, [L(stileW / 2), by - half, mid(wCore[0], wCore[1])]);
      if (Math.abs(s.y0 - (by + half)) < 1e-6) bondAt(b, body, s.name, "screw", 20, [L(stileW / 2), by + half, mid(wCore[0], wCore[1])]);
    }
  }

  // ---- core
  const coreY0 = yb + railH,
    coreY1 = yt - railH;
  const coreParts: Array<{ name: string; u: Interval; y: Interval }> = [];
  if (sp.core === "honeycomb") {
    // pine lock blocks beside the latch stile, around the latch
    const lbLo = "lockBlockLow",
      lbHi = "lockBlockHigh";
    const lbU = rng(L(stileW), L(0.1));
    boxR(b, lbLo, "softwood", "wood_pine", lbU, [hy - 0.15, hy - 0.0175], wCore, stOpts);
    boxR(b, lbHi, "softwood", "wood_pine", lbU, [hy + 0.0175, hy + 0.15], wCore, stOpts);
    bondAt(b, latch, lbLo, "screw", 20, [mid(lbU[0], lbU[1]), hy - 0.0175, mid(wCore[0], wCore[1])]);
    bondAt(b, latch, lbHi, "screw", 20, [mid(lbU[0], lbU[1]), hy + 0.0175, mid(wCore[0], wCore[1])]);
    for (const lb of [lbLo, lbHi]) {
      const y = lb === lbLo ? hy - 0.08 : hy + 0.08;
      const st = latchStiles.find((s) => y > s.y0 && y < s.y1)!;
      bondAt(b, lb, st.name, "glue", 20, [L(stileW), y, mid(wCore[0], wCore[1])]);
      bondAt(b, lb, skinS, "glue", 15, [mid(lbU[0], lbU[1]), y, wSkinS[sw > 0 ? 0 : 1]]);
      bondAt(b, lb, skinB, "glue", 15, [mid(lbU[0], lbU[1]), y, wSkinB[sw > 0 ? 1 : 0]]);
    }
    // cardboard honeycomb: 3 strips across the field + the lock lane above/below the blocks
    const fieldU = rng(H(stileW), L(0.1));
    const us = splitEven(fieldU[0], fieldU[1], (fieldU[1] - fieldU[0]) / 3 + 1e-9);
    for (let i = 0; i + 1 < us.length; i++) coreParts.push({ name: `honeycomb${i}`, u: [us[i], us[i + 1]], y: [coreY0, coreY1] });
    coreParts.push({ name: "honeycombLaneLow", u: lbU, y: [coreY0, hy - 0.15] });
    coreParts.push({ name: "honeycombLaneHigh", u: lbU, y: [hy + 0.15, coreY1] });
    const totalArea = coreParts.reduce((s, p) => s + (p.u[1] - p.u[0]) * (p.y[1] - p.y[0]), 0);
    for (const p of coreParts) {
      const a = (p.u[1] - p.u[0]) * (p.y[1] - p.y[0]);
      boxR(b, p.name, "cardboard", "cardboard", p.u, p.y, wCore, { mass: (1.2 * a) / totalArea, tags: ["door", "honeycomb"] });
      bondAt(b, p.name, skinS, "glue", 3, [mid(p.u[0], p.u[1]), mid(p.y[0], p.y[1]), wSkinS[sw > 0 ? 0 : 1]]);
      bondAt(b, p.name, skinB, "glue", 3, [mid(p.u[0], p.u[1]), mid(p.y[0], p.y[1]), wSkinB[sw > 0 ? 1 : 0]]);
    }
  } else {
    // laminated pine staves (solid core), edge glued
    const fieldU = rng(H(stileW), L(stileW));
    const us = splitEven(fieldU[0], fieldU[1], 0.105);
    let prev: string | null = null;
    for (let i = 0; i + 1 < us.length; i++) {
      const name = `stave${i}`;
      const vol = (us[i + 1] - us[i]) * (coreY1 - coreY0) * (wCore[1] - wCore[0]);
      boxR(b, name, "softwood", "wood_pine", [us[i], us[i + 1]], [coreY0, coreY1], wCore, { mass: vol * 420, tags: ["door"] });
      coreParts.push({ name, u: [us[i], us[i + 1]], y: [coreY0, coreY1] });
      const len = coreY1 - coreY0;
      bondAt(b, name, skinS, "glue", 40 * len * 0.5, [mid(us[i], us[i + 1]), mid(coreY0, coreY1), wSkinS[sw > 0 ? 0 : 1]]);
      bondAt(b, name, skinB, "glue", 40 * len * 0.5, [mid(us[i], us[i + 1]), mid(coreY0, coreY1), wSkinB[sw > 0 ? 1 : 0]]);
      bondAt(b, name, railB, "glue", 15, [mid(us[i], us[i + 1]), coreY0, mid(wCore[0], wCore[1])]);
      bondAt(b, name, railT, "glue", 15, [mid(us[i], us[i + 1]), coreY1, mid(wCore[0], wCore[1])]);
      if (prev) bondAt(b, name, prev, "glue", 30 * len, [us[i], mid(coreY0, coreY1), mid(wCore[0], wCore[1])]);
      prev = name;
    }
  }

  // ---- skins glued to the frame members
  const members: Array<{ name: string; u: Interval; y: Interval }> = [
    { name: hingeStile, u: rng(H(0), H(stileW)), y: [yb, yt] },
    ...latchStiles.map((s) => ({ name: s.name, u: rng(L(0), L(stileW)), y: [s.y0, s.y1] as Interval })),
    { name: railB, u: rng(H(stileW), L(stileW)), y: [yb, yb + railH] },
    { name: railT, u: rng(H(stileW), L(stileW)), y: [yt - railH, yt] },
  ];
  for (const m of members) {
    const len = Math.max(m.u[1] - m.u[0], m.y[1] - m.y[0]);
    bondAt(b, m.name, skinS, "glue", 40 * len + 5, [mid(m.u[0], m.u[1]), mid(m.y[0], m.y[1]), wSkinS[sw > 0 ? 0 : 1]]);
    bondAt(b, m.name, skinB, "glue", 40 * len + 5, [mid(m.u[0], m.u[1]), mid(m.y[0], m.y[1]), wSkinB[sw > 0 ? 1 : 0]]);
  }
  return { hingeStile, latch, bolt, skinS, skinB, wCore };
}

/** Lever handle sets on both faces (rose + neck + grip pointing to the hinge side). */
function addLevers(b: Builder, sp: LeafSpec, parts: LeafParts, heavy: boolean): void {
  const { s0, s1, wS, sw, hingeAtLow, thick } = sp;
  const wB = wS - sw * thick;
  const hu = hingeAtLow ? s1 - 0.06 : s0 + 0.06;
  const hy = sp.handleY;
  const toHinge = hingeAtLow ? -1 : 1;
  for (const f of [sw, -sw]) {
    const wF = f === sw ? wS : wB;
    const sfx = f === sw ? "S" : "B";
    const rose = `rose${sfx}`,
      neck = `neck${sfx}`,
      grip = `lever${sfx}`;
    const rr = heavy ? 0.03 : 0.026;
    b.cyl(rose, "steel", "chrome", rr, 0.008, [hu, hy, wF + f * 0.004], { axis: "z", segments: 16, tags: ["door", "handle"] });
    b.cyl(neck, "steel", "chrome", 0.009, 0.045, [hu, hy, wF + f * 0.0305], { axis: "z", segments: 10, tags: ["door", "handle"] });
    const g0 = hu + toHinge * 0.009,
      g1 = hu + toHinge * (0.009 + (heavy ? 0.125 : 0.11));
    boxR(b, grip, "steel", "chrome", rng(g0, g1), [hy - 0.008, hy + 0.008], rng(wF + f * 0.035, wF + f * 0.053), { tags: ["door", "handle"] });
    bondAt(b, rose, f === sw ? parts.skinS : parts.skinB, "screw", 30, [hu, hy, wF]);
    bondAt(b, rose, parts.latch, "screw", 40, [hu, hy, mid(parts.wCore[0], parts.wCore[1])]);
    bondAt(b, neck, rose, "press", 25, [hu, hy, wF + f * 0.008]);
    bondAt(b, grip, neck, "weld", 60, [g0, hy, wF + f * 0.044]);
  }
}

/**
 * Hinge barrels: visual-only (noCollide) cylinders hugging the leaf's hinge edge on the swing
 * face (where real knuckles show), screwed to the leaf so they swing with it.
 */
function addKnuckles(b: Builder, ys: number[], uH: number, inward: number, wS: number, sw: number, r: number, h: number, parts: LeafParts, tint: number): void {
  const uc = uH + inward * (r + 0.0001),
    wc = wS + sw * (r + 0.0001);
  ys.forEach((y, i) => {
    const k = `hingeKnuckle${i}`;
    b.cyl(k, "steel", "chrome", r, h, [uc, y, wc], { segments: 10, noCollide: true, tint, tags: ["door", "hinge"] });
    bondAt(b, k, parts.skinS, "screw", 60, [uc, y, wS]);
    bondAt(b, k, parts.hingeStile, "screw", 60, [uH + inward * 0.005, y, wS - sw * 0.003]);
  });
}

/** Casings (MDF, painted) on one face around a frame (local u/y, face plane at w = side*faceW). */
function addCasings(b: Builder, prefix: string, c0: number, c1: number, top: number, side: number, faceW: number, jambs: { L: string; R: string; H: string }, jambIn: { l: number; r: number }): void {
  const wc = rng(side * faceW, side * (faceW + CASING_T));
  const yTop = top + CASING_REVEAL;
  const front = { [side > 0 ? "pz" : "nz"]: { surf: "wood_painted" as SurfaceName, tint: PAL.trimWhite } };
  const cl = `${prefix}L`,
    cr = `${prefix}R`,
    ch = `${prefix}H`;
  boxR(b, cl, "mdf", "mdf", [c0 - CASING_REVEAL - CASING_W, c0 - CASING_REVEAL], [0, yTop], wc, { faces: front, tags: ["trim"] });
  boxR(b, cr, "mdf", "mdf", [c1 + CASING_REVEAL, c1 + CASING_REVEAL + CASING_W], [0, yTop], wc, { faces: front, tags: ["trim"] });
  boxR(b, ch, "mdf", "mdf", [c0 - CASING_REVEAL - CASING_W, c1 + CASING_REVEAL + CASING_W], [yTop, yTop + CASING_W], wc, { faces: front, tags: ["trim"], grain: "x" });
  const wf = side * faceW;
  bondAt(b, cl, jambs.L, "nail", 45, [mid(jambIn.l, c0 - CASING_REVEAL), yTop / 2, wf]);
  bondAt(b, cr, jambs.R, "nail", 45, [mid(c1 + CASING_REVEAL, jambIn.r), yTop / 2, wf]);
  bondAt(b, ch, jambs.H, "nail", 30, [mid(c0, c1), yTop, wf]);
  bondAt(b, ch, cl, "glue", 10, [c0 - CASING_REVEAL - CASING_W / 2, yTop, mid(wc[0], wc[1])]);
  bondAt(b, ch, cr, "glue", 10, [c1 + CASING_REVEAL + CASING_W / 2, yTop, mid(wc[0], wc[1])]);
  // finish nails through the drywall into the framing / plugs in the concrete
  worldAt(b, cl, "nail", 60, [c0 - CASING_REVEAL - CASING_W * 0.75, yTop / 2, wf]);
  worldAt(b, cr, "nail", 60, [c1 + CASING_REVEAL + CASING_W * 0.75, yTop / 2, wf]);
  worldAt(b, ch, "nail", 40, [mid(c0, c1), yTop + CASING_W / 2, wf]);
}

// ===================================================================== interior door
export function buildInteriorDoor(run: PartitionRun, o: RunOpening): AssemblyDef {
  const into = o.op.into ? roomById(o.op.into) : null;
  const b = newBuilder("door_interior", `${into?.name ?? "Interior"} Door`, "fixture", 280);
  const T = 2 * run.half;
  const sw = o.swingSide,
    hs = o.hingeSide;
  const hingeAtLow = hs < 0;
  const { c0, c1, top } = clearOpening(o, JAMB_T);
  inFrame(b, run, () => {
    const full: Interval = [-T / 2, T / 2];
    const trim = { tint: PAL.trimWhite, tags: ["door-frame"] };
    const jL = "jambL",
      jR = "jambR",
      jH = "jambHead";
    boxR(b, jL, "softwood", "wood_painted", [o.r0 + SHIM, c0], [0, o.head - SHIM], full, trim);
    boxR(b, jR, "softwood", "wood_painted", [c1, o.r1 - SHIM], [0, o.head - SHIM], full, trim);
    boxR(b, jH, "softwood", "wood_painted", [c0, c1], [top, o.head - SHIM], full, { ...trim, grain: "x" });
    bondAt(b, jH, jL, "nail", 40, [c0, mid(top, o.head - SHIM), 0]);
    bondAt(b, jH, jR, "nail", 40, [c1, mid(top, o.head - SHIM), 0]);
    // nailed through the shims into the jack studs at three heights (one bond per jamb)
    const fx = new Fixings();
    for (const y of [0.3, 1.0, 1.75]) {
      fx.world(jL, "nail", 60, [o.r0 + SHIM, y, 0]);
      fx.world(jR, "nail", 60, [o.r1 - SHIM, y, 0]);
    }
    fx.flush(b);
    worldAt(b, jH, "nail", 60, [mid(o.r0, o.r1), o.head - SHIM, 0]);

    const wS = sw * (T / 2 - 0.005);
    const wB = wS - sw * DOOR_T;
    // stops behind the leaf (non-swing side)
    const stopW = rng(wB, wB - sw * 0.032);
    const stops: Array<[string, Interval, Interval, string]> = [
      ["stopL", [c0, c0 + 0.01], [0, top], jL],
      ["stopR", [c1 - 0.01, c1], [0, top], jR],
      ["stopHead", [c0 + 0.01, c1 - 0.01], [top - 0.01, top], jH],
    ];
    for (const [n, u, y, j] of stops) {
      boxR(b, n, "softwood", "wood_painted", u, y, stopW, { ...trim, grain: n === "stopHead" ? "x" : "y" });
      bondAt(b, n, j, "nail", 20, [mid(u[0], u[1]), mid(y[0], y[1]), mid(stopW[0], stopW[1])]);
    }
    addCasings(b, "casingP", c0, c1, top, 1, T / 2, { L: jL, R: jR, H: jH }, { l: o.r0 + SHIM, r: o.r1 - SHIM });
    addCasings(b, "casingN", c0, c1, top, -1, T / 2, { L: jL, R: jR, H: jH }, { l: o.r0 + SHIM, r: o.r1 - SHIM });

    // ---- leaf: the kit's hollow-core panel (HDF skins on pine stiles/rails + lock block,
    // honeycomb core, steel hinge leaves, levers both sides, latch on the lock block)
    const s0 = c0 + 0.003,
      s1 = c1 - 0.003,
      yb = 0.01,
      yt = top - 0.003;
    const latchJamb = hingeAtLow ? jR : jL,
      hingeJamb = hingeAtLow ? jL : jR;
    // kit frame: slab centred in x/z, y up from its bottom, opens towards +Z
    const flip = sw < 0;
    hingedDoorPanel(
      b,
      "leaf",
      {
        w: s1 - s0,
        h: yt - yb,
        t: DOOR_T,
        kind: "hollow",
        mat: "mdf",
        surf: "wood_painted",
        tint: PAL.doorWhite,
        hinge: hingeAtLow !== flip ? "left" : "right",
        swing: "front",
        fixed: hingeJamb,
        hinges: 3,
        hingeStrength: 120,
        hingeInset: 0.22,
        openDeg: 105,
        friction: 0.4,
        latch: { strength: 40, fixed: latchJamb },
        handleHeight: HANDLE_Y - yb,
        hardware: true,
      },
      [mid(s0, s1), yb, wS - sw * (DOOR_T / 2)],
      flip ? [0, 180, 0] : undefined,
    );
    const cEdge = hingeAtLow ? c1 : c0;
    const strike = "strikePlate";
    const wc = wS - sw * (DOOR_T / 2);
    boxR(b, strike, "steel", "chrome", rng(cEdge, cEdge + (hingeAtLow ? -0.0015 : 0.0015)), [HANDLE_Y - 0.035, HANDLE_Y + 0.035], [wc - 0.0125, wc + 0.0125], { noCollide: true, tags: ["door-frame"] });
    bondAt(b, strike, latchJamb, "screw", 30, [cEdge, HANDLE_Y, wc]);
  });
  const def = b.build();
  def.room = o.op.into;
  return def;
}

// ===================================================================== front door
export function buildFrontDoor(run: ConcreteRun, o: RunOpening): AssemblyDef {
  const b = newBuilder("door_front", "Front Door", "fixture", 1400);
  const half = run.half;
  const sw = o.swingSide,
    hs = o.hingeSide;
  const hingeAtLow = hs < 0;
  const { c0, c1, top } = clearOpening(o, FRONT_JAMB_T);
  const TH = 0.012; // threshold height
  inFrame(b, run, () => {
    const fw: Interval = [half - 0.12, half];
    const wood = { tags: ["door-frame"] };
    // oak threshold across the full wall depth
    const thr = "threshold";
    boxR(b, thr, "hardwood", "wood_oak", [o.r0, o.r1], [0, TH], [-half, half], { ...wood, grain: "x", tint: 0xc9b08a });
    worldAt(b, thr, "glue", 80, [mid(o.r0, o.r1), 0, 0]);
    worldAt(b, thr, "screw", 60, [mid(o.r0, o.r1), 0, half * 0.5]);
    const jL = "jambL",
      jR = "jambR",
      jH = "jambHead";
    boxR(b, jL, "hardwood", "wood_walnut", [o.r0 + SHIM, c0], [TH, o.head - SHIM], fw, wood);
    boxR(b, jR, "hardwood", "wood_walnut", [c1, o.r1 - SHIM], [TH, o.head - SHIM], fw, wood);
    boxR(b, jH, "hardwood", "wood_walnut", [c0, c1], [top, o.head - SHIM], fw, { ...wood, grain: "x" });
    bondAt(b, jH, jL, "screw", 70, [c0, mid(top, o.head - SHIM), mid(fw[0], fw[1])]);
    bondAt(b, jH, jR, "screw", 70, [c1, mid(top, o.head - SHIM), mid(fw[0], fw[1])]);
    bondAt(b, jL, thr, "screw", 40, [mid(o.r0 + SHIM, c0), TH, mid(fw[0], fw[1])]);
    bondAt(b, jR, thr, "screw", 40, [mid(c1, o.r1 - SHIM), TH, mid(fw[0], fw[1])]);
    // frame anchors into the concrete at three heights (one bond per jamb)
    const fx = new Fixings();
    for (const y of [0.35, 1.05, 1.8]) {
      fx.world(jL, "screw", 120, [o.r0, y, mid(fw[0], fw[1])]);
      fx.world(jR, "screw", 120, [o.r1, y, mid(fw[0], fw[1])]);
    }
    fx.flush(b);
    worldAt(b, jH, "screw", 120, [mid(o.r0, o.r1), o.head, mid(fw[0], fw[1])]);
    const wS = sw * (half - 0.005);
    const wB = wS - sw * FRONT_DOOR_T;
    const stopW = rng(wB, wB - sw * 0.04);
    const stops: Array<[string, Interval, Interval, string]> = [
      ["stopL", [c0, c0 + 0.012], [TH, top], jL],
      ["stopR", [c1 - 0.012, c1], [TH, top], jR],
      ["stopHead", [c0 + 0.012, c1 - 0.012], [top - 0.012, top], jH],
    ];
    for (const [n, u, y, j] of stops) {
      boxR(b, n, "hardwood", "wood_walnut", u, y, stopW, { ...wood, grain: n === "stopHead" ? "x" : "y" });
      bondAt(b, n, j, "screw", 40, [mid(u[0], u[1]), mid(y[0], y[1]), mid(stopW[0], stopW[1])]);
    }
    // interior casings only (the corridor side is not modelled)
    addCasings(b, "casing", c0, c1, top, 1, half, { L: jL, R: jR, H: jH }, { l: o.r0 + SHIM, r: o.r1 - SHIM });

    const spec: LeafSpec = {
      s0: c0 + 0.002,
      s1: c1 - 0.002,
      yb: TH + 0.006,
      yt: top - 0.003,
      wS,
      sw,
      hingeAtLow,
      thick: FRONT_DOOR_T,
      skinT: 0.0025,
      skinMat: "mdf",
      skinSurf: "wood_walnut",
      skinTint: 0xffffff,
      stileMat: "hardwood",
      stileSurf: "wood_walnut",
      stileW: 0.04,
      railH: 0.09,
      core: "staves",
      handleY: HANDLE_Y,
      boltY: HANDLE_Y + 0.15,
      peepY: 1.55,
    };
    const parts = addLeaf(b, spec);
    addLevers(b, spec, parts, true);
    // deadbolt: thumb turn inside (swing side = interior), key cylinder outside
    const lu = hingeAtLow ? spec.s1 - 0.06 : spec.s0 + 0.06;
    const by = spec.boltY!;
    for (const f of [sw, -sw]) {
      const wF = f === sw ? wS : wB;
      const sfx = f === sw ? "In" : "Out";
      const rose = `boltRose${sfx}`;
      b.cyl(rose, "steel", "chrome", 0.03, 0.008, [lu, by, wF + f * 0.004], { axis: "z", segments: 16, tags: ["door", "lock"] });
      bondAt(b, rose, f === sw ? parts.skinS : parts.skinB, "screw", 30, [lu, by, wF]);
      bondAt(b, rose, parts.bolt!, "screw", 60, [lu, by, mid(parts.wCore[0], parts.wCore[1])]);
      if (f === sw) {
        const turn = "thumbTurn";
        boxR(b, turn, "steel", "chrome", [lu - 0.006, lu + 0.006], [by - 0.018, by + 0.018], rng(wF + f * 0.008, wF + f * 0.024), { tags: ["door", "lock"] });
        bondAt(b, turn, rose, "press", 8, [lu, by, wF + f * 0.008]);
      } else {
        const cyl = "keyCylinder";
        b.cyl(cyl, "steel", "chrome", 0.012, 0.005, [lu, by, wF + f * 0.0105], { axis: "z", segments: 12, tint: 0xe8c878, tags: ["door", "lock"] });
        bondAt(b, cyl, rose, "press", 20, [lu, by, wF + f * 0.008]);
      }
    }
    // peephole: eyepiece inside, lens outside, connected through the door
    const pu = mid(spec.s0, spec.s1),
      py = spec.peepY!;
    const eye = "peepholeEyepiece",
      lens = "peepholeLens";
    b.cyl(eye, "steel", "chrome", 0.012, 0.008, [pu, py, wS + sw * 0.004], { axis: "z", segments: 12, tags: ["door"] });
    b.cyl(lens, "glass", "glass", 0.009, 0.003, [pu, py, wB - sw * 0.0015], { axis: "z", segments: 12, tags: ["door", "glass"] });
    bondAt(b, eye, parts.skinS, "screw", 15, [pu, py, wS]);
    bondAt(b, lens, parts.skinB, "glue", 10, [pu, py, wB]);

    const latchJamb = hingeAtLow ? jR : jL,
      hingeJamb = hingeAtLow ? jL : jR;
    const uH = hingeAtLow ? spec.s0 : spec.s1;
    const cEdge = hingeAtLow ? c1 : c0;
    const strike = "strikePlate";
    boxR(b, strike, "steel", "chrome", rng(cEdge, cEdge + (hingeAtLow ? -0.0015 : 0.0015)), [HANDLE_Y - 0.04, by + 0.04], parts.wCore, { noCollide: true, tags: ["door-frame"] });
    bondAt(b, strike, latchJamb, "screw", 60, [cEdge, mid(HANDLE_Y, by), mid(parts.wCore[0], parts.wCore[1])]);
    const ys = [spec.yb + 0.25, mid(spec.yb + 0.25, spec.yt - 0.2), spec.yt - 0.2];
    const pw = wS + sw * 0.005;
    addKnuckles(b, ys, uH, hingeAtLow ? 1 : -1, wS, sw, 0.008, 0.1, parts, 0xe2c27a);
    hingeGroup(
      b,
      `${o.op.id}#hinge`,
      parts.hingeStile,
      hingeJamb,
      [0, sw * hs, 0],
      ys.map((y): V3 => [uH, y, pw]),
      0,
      100,
      250,
      0.6,
      { part: parts.bolt!, fixed: latchJamb, at: [hingeAtLow ? spec.s1 : spec.s0, by, mid(parts.wCore[0], parts.wCore[1])], strength: 400 },
    );
  });
  const def = b.build();
  def.room = o.op.into ?? "foyer";
  return def;
}
