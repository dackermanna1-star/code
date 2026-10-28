// Acoustic guitar + floor stand.
//  * buildGuitar: figure-eight body — spruce top and rosewood back as two convex plate halves
//    each (lower/upper bout), bent rosewood ribs as arc-panel tiles plus straight waist ribs,
//    glued inside: neck and tail blocks, two ladder braces; mahogany neck (rounded back), dark
//    fingerboard, angled headstock with tuner housings, glued bridge, soundhole rosette.
//    Strings omitted. Everything is wood with real grain, so it splinters spectacularly.
//  * buildGuitarStand: steel A-frame floor stand (front bar, rear leg, padded cradle with a
//    front lip, mast, rubber-padded U yoke) whose yoke is placed exactly where the guitar's neck
//    rests (see guitarOnStand()).
// Guitar local frame: body in the XY plane, tail at y ≈ 0, neck towards +Y, top facing +Z.
// PURE MODULE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import { qeuler, qrot, v3, type Quat, type Vec3 } from "../../geom/vec.ts";
import { boxR, finish, mk, roundTubeKgPerM, PAL, type BaseOpts } from "./common.ts";

export interface GuitarOpts extends BaseOpts {
  /** Top finish tint (natural spruce by default). */
  topTint?: number;
}

const G = {
  cL: 0.19,
  rL: 0.19, // lower bout circle (centre y, radius); tail apex at y = cL - rL = 0
  cU: 0.43,
  rU: 0.14, // upper bout circle
  waist: { x: 0.115, y: 0.3 },
  lowArc: [-21.6 - 180, 21.6] as const, // degrees (from +X, counter-clockwise), passing through -90
  upArc: [-25, 205] as const, // passing through +90
  segL: 9,
  segU: 9,
  plate: 0.003,
  depth: 0.1,
  rib: 0.0025,
};

const D2R = Math.PI / 180;

/** Outline vertices of an arc (tile boundary angles), counter-clockwise from a0 to a1 (deg). */
function arcPts(cy: number, r: number, a0: number, a1: number, n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * D2R;
    out.push([r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

export interface GuitarGeom {
  /** Neck back line (local): heel and nut back points (x = 0). */
  neckBack: [Vec3, Vec3];
  /** Overall local extents. */
  height: number;
}

export function guitarGeom(): GuitarGeom {
  return { neckBack: [v3(0, NECK.y0, NECK.zTop - NECK.d0), v3(0, NECK.y1, NECK.zTop - NECK.d1)], height: NECK.y1 + 0.18 };
}

const NECK = { y0: 0.5665, y1: 1.0, w0: 0.056, w1: 0.044, d0: 0.026, d1: 0.022, zTop: 0.05 };

export function buildGuitar(o: GuitarOpts = {}): AssemblyDef {
  const b = mk("guitar", "Acoustic Guitar", "decor", 320, o);
  const zT = G.depth / 2; // top plate outer face
  const zR = zT - G.plate; // rib top / plate inner face
  const lower = arcPts(G.cL, G.rL, G.lowArc[0], G.lowArc[1], G.segL);
  const upper = arcPts(G.cU, G.rU, G.upArc[0], G.upArc[1], G.segU);
  const W = G.waist;
  // ---- plates (two convex halves each), split along the waist line
  const plate = (nm: string, pts2: Array<[number, number]>, z0: number, z1: number, mat: "softwood" | "hardwood", surf: "wood_pine" | "wood_walnut", tint: number): string => {
    const pts: Array<[number, number, number]> = [];
    for (const [x, y] of pts2) pts.push([x, y, z0], [x, y, z1]);
    for (const sx of [-1, 1]) pts.push([sx * W.x, W.y, z0], [sx * W.x, W.y, z1]);
    return b.hull(nm, mat, surf, pts, [0, 0, 0], { tint, grain: "y" });
  };
  const topTint = o.topTint ?? 0xf0d9a8;
  const topL = plate("top_lower", lower, zR, zT, "softwood", "wood_pine", topTint);
  const topU = plate("top_upper", upper, zR, zT, "softwood", "wood_pine", topTint);
  const backL = plate("back_lower", lower, -zT, -zR, "hardwood", "wood_walnut", 0xffffff);
  const backU = plate("back_upper", upper, -zT, -zR, "hardwood", "wood_walnut", 0xffffff);
  b.glue(topL, topU, 25); // centre-seam joint across the waist
  b.glue(backL, backU, 25);
  // ---- ribs: bent arc-panel tiles for both bouts (one convex tile per outline segment, grain
  // running around the body) + straight waist panels
  const ribTiles = (nm: string, cy: number, r: number, a0: number, a1: number, n: number): string[] => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const ta = (a0 + ((a1 - a0) * i) / n) * D2R,
        tb = (a0 + ((a1 - a0) * (i + 1)) / n) * D2R;
      const pts: Array<[number, number, number]> = [];
      for (const t of [ta, tb])
        for (const rr of [r, r - G.rib]) for (const z of [-zR, zR]) pts.push([rr * Math.cos(t), cy + rr * Math.sin(t), z]);
      const tm = (ta + tb) / 2;
      const tile = b.hull(`${nm}${i}`, "hardwood", "wood_walnut", pts, [0, 0, 0], { grain: [-Math.sin(tm), Math.cos(tm), 0] });
      if (out.length) b.glue(tile, out[out.length - 1], 20);
      out.push(tile);
    }
    return out;
  };
  const ribsL = ribTiles("rib_lower", G.cL, G.rL, G.lowArc[0], G.lowArc[1], G.segL);
  const ribsU = ribTiles("rib_upper", G.cU, G.rU, G.upArc[0], G.upArc[1], G.segU);
  const ribs: string[] = [...ribsL, ...ribsU];
  const lowEnd: [number, number] = lower[lower.length - 1]; // right end (angle lowArc[1])
  const upStart: [number, number] = upper[0]; // right start (angle upArc[0])
  const straight = (nm: string, a: [number, number], c: [number, number]): string => {
    // outer face along a→c, rib thickness inwards (towards x = 0)
    const dx = c[0] - a[0],
      dy = c[1] - a[1];
    const l = Math.hypot(dx, dy);
    let nx = -dy / l,
      ny = dx / l;
    if (nx * (a[0] + c[0]) > 0) {
      nx = -nx;
      ny = -ny;
    } // inward
    const pts: Array<[number, number, number]> = [];
    for (const [x, y] of [a, c]) for (const z of [-zR, zR]) pts.push([x, y, z], [x + nx * G.rib, y + ny * G.rib, z]);
    return b.hull(nm, "hardwood", "wood_walnut", pts, [0, 0, 0], { grain: [dx / l, dy / l, 0] });
  };
  const waistR: [number, number] = [W.x, W.y];
  const waistL: [number, number] = [-W.x, W.y];
  const wr0 = straight("rib_waist_r0", lowEnd, waistR);
  const wr1 = straight("rib_waist_r1", waistR, upStart);
  const wl0 = straight("rib_waist_l0", [-lowEnd[0], lowEnd[1]], waistL);
  const wl1 = straight("rib_waist_l1", waistL, [-upStart[0], upStart[1]]);
  ribs.push(wr0, wr1, wl0, wl1);
  // rib joints: waist panels to the bout tiles they meet, panel to panel at the waist
  const nearest = (part: string, pool: string[]): string => {
    let best = pool[0],
      bd = Infinity;
    for (const p of pool) {
      const c = b.contact(part, p, 0.01);
      const dd = c ? Math.max(0, c.sep) : Infinity;
      if (dd < bd) {
        bd = dd;
        best = p;
      }
    }
    return best;
  };
  b.glue(wr0, nearest(wr0, ribsL), 20);
  b.glue(wl0, nearest(wl0, ribsL), 20);
  b.glue(wr1, nearest(wr1, ribsU), 20);
  b.glue(wl1, nearest(wl1, ribsU), 20);
  b.glue(wr0, wr1, 15);
  b.glue(wl0, wl1, 15);
  // glue every rib to the plates it touches (kerfed linings)
  for (const r of ribs) {
    for (const p of [topL, topU, backL, backU]) {
      const c = b.contact(r, p, 0.002);
      if (c && (c.kind === "face" || c.penetrating)) b.glue(r, p, 12);
    }
  }
  // ---- blocks and braces inside
  const neckBlock = boxR(b, "neck_block", "hardwood", "wood_walnut", [-0.035, 0.035], [0.52, 0.561], [-zR, zR], { grain: "z" });
  b.glue(neckBlock, topU, 30);
  b.glue(neckBlock, backU, 30);
  const tailBlock = boxR(b, "tail_block", "hardwood", "wood_walnut", [-0.03, 0.03], [0.009, 0.035], [-zR, zR], { grain: "z" });
  b.glue(tailBlock, topL, 25);
  b.glue(tailBlock, backL, 25);
  const brace1 = boxR(b, "brace_lower", "softwood", "wood_pine", [-0.17, 0.17], [0.155, 0.165], [zR - 0.007, zR], { grain: "x" });
  const brace2 = boxR(b, "brace_upper", "softwood", "wood_pine", [-0.115, 0.115], [0.462, 0.47], [zR - 0.007, zR], { grain: "x" });
  b.glue(brace1, topL, 30);
  b.glue(brace2, topU, 30);
  // ---- neck (rounded back), fingerboard, headstock, tuners, bridge, rosette
  const neckPts: Array<[number, number, number]> = [];
  for (const [y, hw, dd] of [
    [NECK.y0, NECK.w0 / 2, NECK.d0],
    [NECK.y1, NECK.w1 / 2, NECK.d1],
  ]) {
    for (let k = 0; k <= 6; k++) {
      const a = (Math.PI * k) / 6;
      neckPts.push([hw * Math.cos(a), y, NECK.zTop - dd * Math.sin(a)]);
    }
  }
  const neck = b.hull("neck", "hardwood", "wood_walnut", neckPts, [0, 0, 0], { grain: "y", tint: 0xc98f5e, smooth: 1 });
  b.glue(neck, nearest(neck, ribsU), 60); // dovetail into the neck block through the top rib
  b.glue(neck, neckBlock, 60);
  const fbY0 = 0.448;
  const fb = b.hull(
    "fingerboard",
    "hardwood",
    "wood_walnut",
    [
      [-NECK.w0 / 2, fbY0, NECK.zTop],
      [NECK.w0 / 2, fbY0, NECK.zTop],
      [-NECK.w1 / 2, NECK.y1, NECK.zTop],
      [NECK.w1 / 2, NECK.y1, NECK.zTop],
      [-NECK.w0 / 2, fbY0, NECK.zTop + 0.006],
      [NECK.w0 / 2, fbY0, NECK.zTop + 0.006],
      [-NECK.w1 / 2, NECK.y1, NECK.zTop + 0.006],
      [NECK.w1 / 2, NECK.y1, NECK.zTop + 0.006],
    ],
    [0, 0, 0],
    { grain: "y", tint: 0x5a3d2b },
  );
  b.glue(fb, neck, 50);
  b.glue(fb, topU, 25);
  let head = "";
  b.group([0, NECK.y1 - 0.002, NECK.zTop - 0.011], [-13, 0, 0], "head_", () => {
    head = boxR(b, "plate", "hardwood", "wood_walnut", [-0.0425, 0.0425], [0, 0.18], [-0.008, 0.008], { grain: "y", tint: 0x6b4a33 });
    for (const sx of [-1, 1]) {
      const tun = boxR(b, sx < 0 ? "tuners_l" : "tuners_r", "steel", "chrome", sx < 0 ? [-0.0545, -0.0425] : [0.0425, 0.0545], [0.04, 0.165], [-0.008, 0.008], { mass: 0.12, tess: 0 });
      b.screw(tun, head, 3, 20);
    }
  });
  b.glue(head, neck, 45); // scarf joint
  const bridge = boxR(b, "bridge", "hardwood", "wood_walnut", [-0.075, 0.075], [0.1, 0.13], [zT, zT + 0.009], { grain: "x", tint: 0x4a3225 });
  b.glue(bridge, topL, 30); // bridges really do pop off
  const rosette = b.cyl("soundhole", "paper", "plastic", 0.043, 0.0006, [0, 0.4, zT + 0.0003], { axis: "z", segments: 16, tint: 0x0a0807, capSurf: "plastic" });
  b.glue(rosette, topU, 4);
  return finish(b, o);
}

// ------------------------------------------------------------------ stand

export interface GuitarStandOpts extends BaseOpts {
  /** Yoke contact height (centre of the pad) and z of the pad's front face (local). */
  yokeY?: number;
  yokeZ?: number;
  /** z of the mast axis (behind the guitar body) and of the cradle lip's back face. */
  mastZ?: number;
  lipZ?: number;
}

export const STAND = { shelfTop: 0.047, shelfZ: [-0.07, 0.04] as const, lean: 15, yokeY: 0.68, padH: 0.028 } as const;

export function buildGuitarStand(o: GuitarStandOpts = {}): AssemblyDef {
  const b = mk("guitarStand", "Guitar Stand", "misc", 30, o);
  const S = "metal_black" as const;
  const yokeY = o.yokeY ?? STAND.yokeY;
  const yokeZ = o.yokeZ ?? -0.17;
  const mastZ = Math.min(o.mastZ ?? yokeZ - 0.06, yokeZ - 0.05);
  const lipZ = o.lipZ ?? STAND.shelfZ[1];
  const barH = 0.022;
  const fz0 = Math.max(0.05, lipZ - 0.01);
  const front = boxR(b, "front_bar", "steel", S, [-0.17, 0.17], [0, barH], [fz0, fz0 + 0.022], { tess: 0, mass: 0.45 });
  const rear = boxR(b, "rear_leg", "steel", S, [-0.011, 0.011], [0, barH], [mastZ - 0.03, fz0], { tess: 0, mass: 0.45 });
  b.weld(rear, front, 80);
  for (const sx of [-1, 1]) {
    const cap = boxR(b, sx < 0 ? "cap_l" : "cap_r", "rubber", "rubber", sx < 0 ? [-0.19, -0.17] : [0.17, 0.19], [0, barH], [fz0, fz0 + 0.022], { tint: PAL.rubber });
    b.press(cap, front, 6);
  }
  // padded cradle on the bars with a front lip
  const shelf = boxR(b, "cradle", "rubber", "rubber", [-0.11, 0.11], [barH, STAND.shelfTop], [STAND.shelfZ[0], lipZ], { tint: 0x1c1c1e, mass: 0.25 });
  b.screw(shelf, front, 2, 30);
  b.screw(shelf, rear, 1, 30);
  const lip = boxR(b, "cradle_lip", "rubber", "rubber", [-0.11, 0.11], [barH, STAND.shelfTop + 0.02], [lipZ, lipZ + 0.02], { tint: 0x1c1c1e });
  b.glue(lip, shelf, 20);
  b.screw(lip, front, 1, 20);
  // mast behind the guitar body, arm forward to the U yoke
  const mast = b.cyl("mast", "steel", S, 0.0125, yokeY + 0.0125 - barH, [0, (barH + yokeY + 0.0125) / 2, mastZ], { segments: 10, mass: roundTubeKgPerM(0.025, 0.0015) * (yokeY - barH) });
  b.weld(mast, rear, 90);
  const padZ0 = yokeZ - 0.014;
  const armZ0 = mastZ + 0.0125;
  const arm = b.cyl("arm", "steel", S, 0.01, padZ0 - armZ0, [0, yokeY, (armZ0 + padZ0) / 2], { axis: "z", segments: 10, mass: roundTubeKgPerM(0.02, 0.0015) * (padZ0 - armZ0) });
  b.weld(arm, mast, 70);
  const pad = boxR(b, "yoke_pad", "rubber", "rubber", [-0.042, 0.042], [yokeY - STAND.padH / 2, yokeY + STAND.padH / 2], [padZ0, yokeZ], { tint: 0x1c1c1e, mass: 0.08 });
  b.weld(pad, arm, 60);
  for (const sx of [-1, 1]) {
    const prong = b.cyl(sx < 0 ? "prong_l" : "prong_r", "steel", "rubber", 0.006, 0.035, [sx * 0.036, yokeY, yokeZ + 0.0175], { axis: "z", segments: 8, mass: 0.025 });
    b.weld(prong, pad, 25);
  }
  return finish(b, o);
}

/** Rotate a local point by q and translate. */
function xf(q: Quat, p: Vec3, v: Vec3): Vec3 {
  const r = qrot(q, v);
  return v3(r.x + p.x, r.y + p.y, r.z + p.z);
}

/**
 * The guitar resting on its stand: the guitar leans back `STAND.lean` degrees, its lowest point
 * sits 0.5 mm above the cradle, the yoke pad is placed 0.5 mm behind the neck (measured at the
 * pad's top edge, where the leaning neck is furthest back), the mast 2 cm behind the deepest
 * point of the body below the yoke, and the cradle lip 3 mm in front of the body's foot.
 * Returns both defs and the guitar pose in the STAND's local frame.
 */
export function guitarOnStand(o: { seed?: number; room?: string; validate?: "basic" | "full" } = {}): { guitar: AssemblyDef; stand: AssemblyDef; guitarPose: { p: Vec3; q: Quat } } {
  const guitar = buildGuitar({ seed: o.seed, room: o.room, validate: o.validate });
  const q = qeuler(-STAND.lean * D2R, 0, 0);
  const verts: Vec3[] = [];
  for (const part of guitar.parts) for (const v of part.poly.verts) verts.push(qrot(q, v));
  let minY = Infinity,
    zAtMin = 0;
  for (const r of verts)
    if (r.y < minY - 1e-9) {
      minY = r.y;
      zAtMin = r.z;
    }
  const cradleMid = (STAND.shelfZ[0] + STAND.shelfZ[1]) / 2;
  const p = v3(0, STAND.shelfTop + 0.0005 - minY, cradleMid - zAtMin);
  let frontZ = -Infinity,
    backZ = Infinity;
  for (const r of verts) {
    const y = r.y + p.y,
      z = r.z + p.z;
    if (y < STAND.shelfTop + 0.03) frontZ = Math.max(frontZ, z);
    if (y < STAND.yokeY + STAND.padH) backZ = Math.min(backZ, z);
  }
  const [h0, h1] = guitarGeom().neckBack;
  const a = xf(q, p, h0),
    c = xf(q, p, h1);
  const yTopEdge = STAND.yokeY + STAND.padH / 2;
  const t = (yTopEdge - a.y) / (c.y - a.y);
  const zBack = a.z + (c.z - a.z) * t;
  const stand = buildGuitarStand({ seed: o.seed, room: o.room, validate: o.validate, yokeY: STAND.yokeY, yokeZ: zBack - 0.0005, mastZ: backZ - 0.02 - 0.0125, lipZ: frontZ + 0.003 });
  return { guitar, stand, guitarPose: { p, q } };
}
