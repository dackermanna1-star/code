// North base run of the kitchen: four base units (blind door unit, sink base, cutlery drawers,
// pot drawers) along the concrete party wall, bays for the dishwasher and the range, a 30 mm
// stone worktop cut around an under-mount double sink and the faucet hole, the sink itself
// (1.2 mm stainless, dentable), a gooseneck faucet (`water`, toggles with the use key) and the
// copper supply / PVC drain lines that run in the service void behind the carcasses to the
// stub-outs on the plumbing wall (`water` features: break a joint and it sprays).
//
// The dead corner where the west run meets this run is bridged by two softwood ledgers screwed
// to the walls; the stub-out valves live in that corner. Everything is one assembly so the joints
// are real: units screwed to the wall and to each other, the worktop siliconed down, the sink
// epoxied under the stone, the faucet clamped through it, pipes clipped to the wall.
//
// Built for the kitchen layout: origin at the worktop footprint centre (NORTH_XF), front +Z.
// PURE MODULE (no Babylon).

import { Builder, type V3 } from "../lib/builder.ts";
import { pipe } from "../lib/kit.ts";
import type { AssemblyDef } from "../../destruction/model/types.ts";
import { KPAL, LocalFrame, bondEachTouching, bondTouching, centerOf, finish, frontFinish, scoped, type Finish, type FrontColor } from "./lib.ts";
import { baseCabinet, glueTop, type CabinetLook } from "./cabinets.ts";
import { CARCASS_H, COUNTER_Y, NORTH, NORTH_TOP, NORTH_XF, SINK_SERVICE } from "./layout.ts";

export interface NorthRunOpts {
  color?: FrontColor;
  counter?: Finish;
  seed?: number;
}

const ST = 0.0012; // sink sheet thickness

export function buildKitchenNorthRun(o: NorthRunOpts = {}): AssemblyDef {
  const b = new Builder("kitchenNorthRun", "Kitchen Base Cabinets & Sink", "furniture", 3200, o.seed);
  const lf = new LocalFrame(NORTH_XF);
  const look: CabinetLook = { front: frontFinish(o.color, KPAL.lowerFront), carcass: KPAL.carcass, handle: KPAL.brass };
  const counter = o.counter ?? KPAL.counter;
  const zMid = (NORTH.carcassBackZ + NORTH.carcassFrontZ) / 2;
  const unit = (x0: number, x1: number): { w: number; pos: V3 } => {
    const c = lf.p((x0 + x1) / 2, 0, zMid);
    return { w: x1 - x0, pos: [c[0], 0, c[2]] };
  };
  // ------------------------------------------------------------------ base units
  // (local +X points west: hinge "right" = the corner side)
  const u1 = unit(NORTH.n1[0], NORTH.n1[1]);
  const us = unit(NORTH.sinkBase[0], NORTH.sinkBase[1]);
  const u3 = unit(NORTH.n3[0], NORTH.n3[1]);
  const u4 = unit(NORTH.n4[0], NORTH.n4[1]);
  const n1 = baseCabinet(b, "n1", { w: u1.w, fronts: { kind: "door", hinge: "right" }, shelf: 0.45, look }, u1.pos);
  const sink = baseCabinet(b, "sinkbase", { w: us.w, fronts: { kind: "doors" }, top: "none", back: false, look }, us.pos);
  const n3 = baseCabinet(b, "n3", { w: u3.w, fronts: { kind: "drawers", heights: [0.157, 0.307, 0.307] }, look }, u3.pos);
  const n4 = baseCabinet(b, "n4", { w: u4.w, fronts: { kind: "drawers", heights: [0.307, 0.467] }, look }, u4.pos);
  // sink base and drawer unit share a side: screw them together
  for (const a of [sink.carcass.left, sink.carcass.right])
    for (const c of [n3.carcass.left, n3.carcass.right]) {
      const ct = b.contact(a, c, 0.001);
      if (ct && ct.kind === "face") b.screw(a, c, 2, 30);
    }
  // wall fixing: through the back rails (concrete anchors), the sink base via its sides
  for (const u of [n1, n3, n4]) {
    const rail = u.carcass.top.find((p) => p.endsWith("rail_b"))!;
    b.world(rail, "screw", 2 * 50, centerOf(b, rail));
  }
  for (const s of [sink.carcass.left, sink.carcass.right]) {
    const c = centerOf(b, s);
    const back = lf.p(0, CARCASS_H - 0.05, NORTH.carcassBackZ - 0.005);
    b.world(s, "screw", 50, [c[0], back[1], back[2]]);
  }

  // ------------------------------------------------------------------ dead-corner ledgers
  const lnB = lf.box(NORTH.topX0, NORTH.n1[0] - 0.0025, CARCASS_H - 0.04, CARCASS_H, NORTH.topBackZ - 0.04, NORTH.topBackZ);
  const lwB = lf.box(SINK_SERVICE.face + 0.015, SINK_SERVICE.face + 0.055, CARCASS_H - 0.04, CARCASS_H, NORTH.carcassFrontZ, NORTH.topBackZ - 0.04);
  const ledgerN = b.box("ledger_n", "softwood", "wood_pine", lnB.size, lnB.pos);
  const ledgerW = b.box("ledger_w", "softwood", "wood_pine", lwB.size, lwB.pos);
  b.screw(ledgerN, ledgerW, 1, 30);
  {
    const a = lf.p((NORTH.topX0 + NORTH.n1[0]) / 2, CARCASS_H - 0.02, NORTH.topBackZ);
    const c = lf.p(SINK_SERVICE.face + 0.015, CARCASS_H - 0.02, (NORTH.carcassFrontZ + NORTH.topBackZ) / 2);
    b.world(ledgerN, "screw", 2 * 50, a);
    b.world(ledgerW, "screw", 2 * 40, c);
  }

  // ------------------------------------------------------------------ stone worktop
  const pieces: Record<string, string> = {};
  for (const [nm, [x0, x1, z0, z1]] of Object.entries(NORTH_TOP)) {
    const bx = lf.box(x0, x1, CARCASS_H, COUNTER_Y, z0, z1);
    // big slabs rest on carcasses along their length (fail locally); the strips around the
    // sink and the tap hole are free spans that crack and snap
    const big = (x1 - x0) * (z1 - z0) > 0.2;
    pieces[nm] = b.box(nm, "stone", counter.surf, bx.size, bx.pos, { tint: counter.tint, supported: big });
  }
  const left = ["top_w", "top_sink_f", "top_sink_bl", "top_sink_br", "top_tap_f", "top_tap_b", "top_e"].map((k) => pieces[k]);
  b.fuseTouching(left, "fused");
  glueTop(b, Object.values(pieces), [...n1.support, ...sink.support, ...n3.support, ...n4.support, ledgerN, ledgerW], 25);

  // ------------------------------------------------------------------ under-mount sink
  const sinkParts = undermountSink(b, lf);
  for (const fl of sinkParts.flange) bondEachTouching(b, fl, left, "glue", 30, 0.001);

  // ------------------------------------------------------------------ faucet
  const fct = faucet(b, lf, left);

  // ------------------------------------------------------------------ plumbing
  plumbing(b, lf, sinkParts.strainers, fct.nut);

  return finish(b);
}

// ============================================================================ sink

/** Double-bowl under-mount sink hung from the stone by its flange (world-coordinate layout). */
function undermountSink(b: Builder, lf: LocalFrame): { flange: string[]; strainers: [string, string]; all: string[] } {
  const C = NORTH.cutout;
  const yTop = CARCASS_H; // flange top = worktop underside
  const yF = yTop - ST; // flange bottom
  const yB = 0.688; // bowl bottom underside
  const yDiv = 0.87; // divider cap underside
  const xm = (C.x0 + C.x1) / 2;
  const half = 0.008; // half gap between the bowls' inner walls
  const fw = 0.015; // flange width beyond the cut-out
  return scoped(b, "sink", [0, 0, 0], undefined, () => {
    const box = (nm: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: "steelSheet" | "steel" = "steelSheet", mass?: number): string => {
      const bx = lf.box(x0, x1, y0, y1, z0, z1);
      return b.box(nm, mat, "steel_brushed", bx.size, bx.pos, { tint: 0xf4f4f4, mass, tess: mat === "steelSheet" ? 0.05 : 0 });
    };
    const flange = [
      box("fl_s", C.x0 - fw, C.x1 + fw, yF, yTop, C.z0 - fw, C.z0 + ST),
      box("fl_n", C.x0 - fw, C.x1 + fw, yF, yTop, C.z1 - ST, C.z1 + fw),
      box("fl_w", C.x0 - fw, C.x0 + ST, yF, yTop, C.z0 + ST, C.z1 - ST),
      box("fl_e", C.x1 - ST, C.x1 + fw, yF, yTop, C.z0 + ST, C.z1 - ST),
    ];
    const bowl = (nm: string, x0: number, x1: number, innerAtX1: boolean): string[] => {
      const out: string[] = [];
      out.push(box(`${nm}_bot`, x0, x1, yB, yB + ST, C.z0, C.z1));
      const y0 = yB + ST;
      out.push(box(`${nm}_s`, x0, x1, y0, yF, C.z0, C.z0 + ST));
      out.push(box(`${nm}_n`, x0, x1, y0, yF, C.z1 - ST, C.z1));
      // outer side wall reaches the flange, the inner one stops under the divider cap
      out.push(box(`${nm}_w`, x0, x0 + ST, y0, innerAtX1 ? yF : yDiv, C.z0 + ST, C.z1 - ST));
      out.push(box(`${nm}_e`, x1 - ST, x1, y0, innerAtX1 ? yDiv : yF, C.z0 + ST, C.z1 - ST));
      return out;
    };
    const west = bowl("bw", C.x0, xm - half, true);
    const east = bowl("be", xm + half, C.x1, false);
    const cap = box("divider", xm - half - ST, xm + half + ST, yDiv, yF, C.z0 + ST, C.z1 - ST, "steelSheet", 0.15);
    // one stamped/welded unit: weld every touching pair inside the sink
    b.autoBond("weld", 60, 0.0004, b.within(""));
    const strainer = (nm: string, x: number): string => {
      const c = lf.p(x, yB - 0.01, (C.z0 + C.z1) / 2);
      return b.cyl(nm, "steel", "steel_brushed", 0.045, 0.02, c, { segments: 10, mass: 0.35, tint: 0xe0e0e0 });
    };
    const sw = strainer("strainer_w", (C.x0 + xm - half) / 2);
    const se = strainer("strainer_e", (xm + half + C.x1) / 2);
    b.bolt(sw, west[0], 60);
    b.bolt(se, east[0], 60);
    return { flange, strainers: [sw, se] as [string, string], all: [...flange, ...west, ...east, cap, sw, se] };
  });
}

// ============================================================================ faucet

/** Gooseneck single-lever faucet clamped through the stone (world-coordinate layout). */
function faucet(b: Builder, lf: LocalFrame, stone: string[]): { nut: string; all: string[] } {
  const F = NORTH.faucet;
  return scoped(b, "fct", [0, 0, 0], undefined, () => {
    const esc = b.cyl("base", "steel", "chrome", 0.03, 0.012, lf.p(F.x, COUNTER_Y + 0.006, F.z), { segments: 12 });
    const body = b.cyl("body", "steel", "chrome", 0.021, 0.17, lf.p(F.x, COUNTER_Y + 0.012 + 0.085, F.z), { segments: 10 });
    const yTopB = COUNTER_Y + 0.012 + 0.17;
    const path: V3[] = [
      lf.p(F.x, yTopB, F.z),
      lf.p(F.x, 1.19, F.z - 0.015),
      lf.p(F.x, 1.225, F.z - 0.08),
      lf.p(F.x, 1.205, F.z - 0.165),
      lf.p(F.x, 1.13, F.z - 0.21),
    ];
    const spout = b.tube("spout", "steel", "chrome", path, 0.0105, { sides: 8, joint: "fused", jointStrength: 120, tess: 0 });
    for (const s of spout) b.tag(s, "faucet");
    const tip = spout[spout.length - 1];
    b.weld(spout[0], body, 150);
    // single lever on the east side of the body
    const lvB = lf.box(F.x + 0.021, F.x + 0.096, 1.054, 1.066, F.z - 0.007, F.z + 0.007);
    const lever = b.box("lever", "steel", "chrome", lvB.size, lvB.pos, { tess: 0 });
    b.press(lever, body, 12);
    // shank through the hole and the clamping nut under the stone
    const shank = b.cyl("shank", "steel", "metal_raw", 0.016, COUNTER_Y - CARCASS_H, lf.p(F.x, (COUNTER_Y + CARCASS_H) / 2, F.z), { segments: 8 });
    const nut = b.cyl("nut", "steel", "metal_raw", 0.028, 0.012, lf.p(F.x, CARCASS_H - 0.006, F.z), { segments: 8 });
    b.weld(esc, body, 200);
    b.weld(esc, shank, 150);
    b.bolt(shank, nut, 150);
    bondTouching(b, nut, stone, "friction", 40, 0.001, 2);
    bondTouching(b, esc, stone, "friction", 10, 0.001, 2);
    // mains water: the spout (use key toggles it; break it and it sprays) and the cartridge body
    b.water(tip, lf.p(F.x, 1.125, F.z - 0.21), lf.d(0, -1, 0), 0.45);
    b.water(body, lf.p(F.x, COUNTER_Y + 0.1, F.z), lf.d(0, 1, 0), 0.8);
    return { nut, all: [esc, body, ...spout, lever, shank, nut] };
  });
}

// ============================================================================ plumbing

/**
 * Copper hot/cold supplies from the angle stops on the plumbing wall to the faucet tails, and the
 * PVC drain (tailpieces, P-trap with ~0.4 l of standing water, trap arm) back to the drain stub,
 * run in the 60 mm service void behind the carcasses and clipped to the wall.
 */
function plumbing(b: Builder, lf: LocalFrame, strainers: [string, string], nut: string): void {
  const S = SINK_SERVICE;
  const zv = 8.772; // supply lines in the void
  const zd = 8.765; // drain in the void
  const P = (x: number, y: number, z: number): V3 => lf.p(x, y, z);
  const yS = S.valveTopY + 0.003;
  const cold = pipe(
    b,
    "cold",
    [P(4.105, yS, S.coldZ), P(4.105, 0.56, S.coldZ), P(4.105, 0.56, zv), P(6.23, 0.56, zv), P(6.23, 0.76, zv), P(6.212, 0.8, 8.722), P(6.212, CARCASS_H - 0.012, 8.722)],
    { od: 0.015, wall: 0.0008, water: { pressure: 0.75 } },
  );
  const hot = pipe(
    b,
    "hot",
    [P(4.08, yS, S.hotZ), P(4.08, 0.64, S.hotZ), P(4.08, 0.64, zv), P(6.17, 0.64, zv), P(6.17, 0.76, zv), P(6.188, 0.8, 8.722), P(6.188, CARCASS_H - 0.012, 8.722)],
    { od: 0.015, wall: 0.0008, water: { pressure: 0.7 } },
  );
  const C = NORTH.cutout;
  const xm = (C.x0 + C.x1) / 2;
  const xw = (C.x0 + xm - 0.008) / 2,
    xe = (xm + 0.008 + C.x1) / 2;
  const zs = (C.z0 + C.z1) / 2;
  const yStr = 0.668; // strainer underside
  const drain = pipe(
    b,
    "drain",
    [
      P(xe, yStr, zs),
      P(xe, 0.56, zs),
      P(xw, 0.56, zs),
      P(xw, 0.46, zs),
      P(xw, 0.415, zs + 0.04),
      P(xw, 0.43, zs + 0.09),
      P(xw, 0.475, zs + 0.115),
      P(xw, 0.475, zd),
      P(4.2, 0.43, zd),
      P(4.2, 0.425, S.drainZ),
      P(S.drainEndX + 0.002, S.drainY, S.drainZ),
    ],
    { od: 0.038, wall: 0.0025, mat: "plastic", surf: "plastic", tint: 0xe9e9e4, sides: 8, jointStrength: 90, full: false, water: { pressure: 0.12, litres: 0.4 } },
  );
  const tail = pipe(b, "tail", [P(xw, yStr, zs), P(xw, 0.581, zs)], { od: 0.038, wall: 0.0025, mat: "plastic", surf: "plastic", tint: 0xe9e9e4, sides: 8, full: false, water: false });
  // slip-joint nuts on the strainers, the tailpiece into the tee
  b.bond(drain[0], strainers[1], "press", { strength: 30 });
  b.bond(tail[0], strainers[0], "press", { strength: 30 });
  b.bond(tail[tail.length - 1], drain[2], "glue", { strength: 40 });
  // supply tails into the faucet nut
  b.bond(cold[cold.length - 1], nut, "press", { strength: 30 });
  b.bond(hot[hot.length - 1], nut, "press", { strength: 30 });
  // compression fittings on the angle stops / trap adapter on the stub (the wall side is the building)
  b.world(cold[0], "press", 40, P(4.105, yS, S.coldZ));
  b.world(hot[0], "press", 40, P(4.08, yS, S.hotZ));
  b.world(drain[drain.length - 1], "press", 40, P(S.drainEndX + 0.002, S.drainY, S.drainZ));
  // pipe clips on the long runs
  const clipMid = (seg: string): void => b.world(seg, "clip", 15, centerOf(b, seg));
  clipMid(cold[3]);
  clipMid(hot[3]);
  clipMid(drain[8]);
}
