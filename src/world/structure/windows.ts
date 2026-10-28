// Windows and the balcony sliding door (one assembly each), set in the concrete openings:
// powder-coated aluminium frames screwed to the concrete, double glazing (two annealed 4 mm
// panes on an aluminium spacer, weakly clipped into the frame so shards hang in it), one
// inward-opening casement sash with a handle/latch where the window is wide enough; the
// sliding door has a fixed and a sliding tempered-glass panel (slider joint + latch). PURE.

import type { AssemblyDef } from "../../destruction/model/types.ts";
import type { Builder } from "../../objects/lib/builder.ts";
import type { MaterialId } from "../../destruction/model/materials.ts";
import { roomAt } from "../plan.ts";
import { WINDOW_FRAME_DEPTH, WINDOW_FRAME_FACE, WINDOW_REVEAL } from "./levels.ts";
import type { ConcreteRun, RunOpening } from "./layout.ts";
import { PAL, bondAt, boxR, mid, newBuilder, worldAt, type Interval, type V3 } from "./common.ts";
import { hingeGroup, sliderGroup } from "./joints.ts";
import { inFrame } from "./concrete.ts";

const PANE_T = 0.004;
const SPACER = 0.016;
const SPACER_W = 0.008;
const ALU = { tint: PAL.frameCharcoal, tess: 0.05 };

interface Bar {
  name: string;
  u: Interval;
  y: Interval;
  w: Interval;
}

function bar(b: Builder, name: string, u: Interval, y: Interval, w: Interval, tags: string[], tess = ALU.tess): Bar {
  const horiz = u[1] - u[0] >= y[1] - y[0];
  boxR(b, name, "aluminum", "metal_painted", u, y, w, { tint: ALU.tint, tess, tags, grain: horiz ? "x" : "y" });
  return { name, u, y, w };
}

/**
 * Insulated glass unit filling [u]×[y] centred at depth wc: two panes + 4 spacer bars.
 * Returns the pane names (outer, inner).
 */
function addIGU(b: Builder, prefix: string, u: Interval, y: Interval, wc: number, mat: MaterialId, tags: string[]): { outer: string; inner: string; spacers: string[] } {
  const g = SPACER / 2;
  const outer = `${prefix}paneOut`,
    inner = `${prefix}paneIn`;
  const gl = { tags: [...tags, "glass"] };
  boxR(b, outer, mat, "glass", u, y, [wc - g - PANE_T, wc - g], gl);
  boxR(b, inner, mat, "glass", u, y, [wc + g, wc + g + PANE_T], gl);
  const sw: Interval = [wc - g, wc + g];
  const sp = { tint: 0x9a9da0, tess: 0, tags: [...tags, "spacer"] };
  const sT = `${prefix}spacerT`,
    sB = `${prefix}spacerB`,
    sL = `${prefix}spacerL`,
    sR = `${prefix}spacerR`;
  boxR(b, sT, "aluminum", "aluminum", u, [y[1] - SPACER_W, y[1]], sw, { ...sp, grain: "x" });
  boxR(b, sB, "aluminum", "aluminum", u, [y[0], y[0] + SPACER_W], sw, { ...sp, grain: "x" });
  boxR(b, sL, "aluminum", "aluminum", [u[0], u[0] + SPACER_W], [y[0] + SPACER_W, y[1] - SPACER_W], sw, { ...sp, grain: "y" });
  boxR(b, sR, "aluminum", "aluminum", [u[1] - SPACER_W, u[1]], [y[0] + SPACER_W, y[1] - SPACER_W], sw, { ...sp, grain: "y" });
  const um = mid(u[0], u[1]),
    ym = mid(y[0], y[1]);
  const at: Record<string, [number, number]> = {
    [sT]: [um, y[1] - SPACER_W / 2],
    [sB]: [um, y[0] + SPACER_W / 2],
    [sL]: [u[0] + SPACER_W / 2, ym],
    [sR]: [u[1] - SPACER_W / 2, ym],
  };
  // butyl / silicone seal between panes and spacer
  for (const s of [sT, sB, sL, sR]) {
    bondAt(b, outer, s, "glue", 12, [at[s][0], at[s][1], wc - g]);
    bondAt(b, inner, s, "glue", 12, [at[s][0], at[s][1], wc + g]);
  }
  bondAt(b, sL, sT, "glue", 4, [u[0] + SPACER_W / 2, y[1] - SPACER_W, wc]);
  bondAt(b, sR, sT, "glue", 4, [u[1] - SPACER_W / 2, y[1] - SPACER_W, wc]);
  bondAt(b, sL, sB, "glue", 4, [u[0] + SPACER_W / 2, y[0] + SPACER_W, wc]);
  bondAt(b, sR, sB, "glue", 4, [u[1] - SPACER_W / 2, y[0] + SPACER_W, wc]);
  return { outer, inner, spacers: [sT, sB, sL, sR] };
}

/** Clip each pane of an IGU to the four surrounding bars (glazing gaskets: weak). */
function glaze(b: Builder, igu: { outer: string; inner: string }, u: Interval, y: Interval, wc: number, bars: { top: Bar; bottom: Bar; left: Bar; right: Bar }, strength: number): void {
  const um = mid(u[0], u[1]),
    ym = mid(y[0], y[1]);
  const g = SPACER / 2;
  for (const [pane, w] of [
    [igu.outer, wc - g - PANE_T / 2],
    [igu.inner, wc + g + PANE_T / 2],
  ] as Array<[string, number]>) {
    bondAt(b, pane, bars.top.name, "clip", strength, [um, y[1], w]);
    bondAt(b, pane, bars.bottom.name, "clip", strength, [um, y[0], w]);
    bondAt(b, pane, bars.left.name, "clip", strength, [u[0], ym, w]);
    bondAt(b, pane, bars.right.name, "clip", strength, [u[1], ym, w]);
  }
}

/** Screw a frame bar to the concrete reveal (two frame anchors → one bond, summed). */
function anchorBar(b: Builder, br: Bar, outerU: number | null, outerY: number | null, strength: number): void {
  const wm = mid(br.w[0], br.w[1]);
  if (outerY !== null) worldAt(b, br.name, "screw", 2 * strength, [mid(br.u[0], br.u[1]), outerY, wm]);
  else if (outerU !== null) worldAt(b, br.name, "screw", 2 * strength, [outerU, mid(br.y[0], br.y[1]), wm]);
}

export function buildWindow(run: ConcreteRun, o: RunOpening): AssemblyDef {
  const half = run.half;
  const um = mid(o.r0, o.r1);
  const pt = run.frame.toWorld(um, 0, half + 0.3);
  const room = roomAt(pt.x, pt.z);
  const width = o.r1 - o.r0;
  const area = width * (o.head - o.sill);
  const b = newBuilder("window", `Window — ${room?.name ?? "?"}`, "fixture", Math.round(650 + 450 * area));
  const F = WINDOW_FRAME_FACE;
  const wIn = half - WINDOW_REVEAL;
  const fw: Interval = [wIn - WINDOW_FRAME_DEPTH, wIn];
  const wc = mid(fw[0], fw[1]);
  inFrame(b, run, () => {
    const u0 = o.r0 + 0.005,
      u1 = o.r1 - 0.005,
      y0 = o.sill + 0.005,
      y1 = o.head - 0.005;
    const tags = ["window-frame"];
    const head = bar(b, "frameHead", [u0, u1], [y1 - F, y1], fw, tags);
    const sill = bar(b, "frameSill", [u0, u1], [y0, y0 + F], fw, tags);
    const left = bar(b, "frameL", [u0, u0 + F], [y0 + F, y1 - F], fw, tags);
    const right = bar(b, "frameR", [u1 - F, u1], [y0 + F, y1 - F], fw, tags);
    for (const [j, uu] of [
      [left, u0 + F / 2],
      [right, u1 - F / 2],
    ] as Array<[Bar, number]>) {
      bondAt(b, j.name, head.name, "screw", 70, [uu, y1 - F, wc]);
      bondAt(b, j.name, sill.name, "screw", 70, [uu, y0 + F, wc]);
    }
    anchorBar(b, head, null, o.head, 60);
    anchorBar(b, sill, null, o.sill, 60);
    anchorBar(b, left, o.r0, null, 60);
    anchorBar(b, right, o.r1, null, 60);

    // lights: wide windows get a mullion with a fixed light + a casement, narrow ones one casement
    const lights: Array<{ u: Interval; casement: boolean; hingeAtLow: boolean; lb: Bar; rb: Bar }> = [];
    if (width >= 1.4) {
      const m = um;
      const mul = bar(b, "mullion", [m - F / 2, m + F / 2], [y0 + F, y1 - F], fw, tags);
      bondAt(b, mul.name, head.name, "screw", 70, [m, y1 - F, wc]);
      bondAt(b, mul.name, sill.name, "screw", 70, [m, y0 + F, wc]);
      lights.push({ u: [u0 + F, m - F / 2], casement: false, hingeAtLow: true, lb: left, rb: mul });
      lights.push({ u: [m + F / 2, u1 - F], casement: true, hingeAtLow: false, lb: mul, rb: right });
    } else {
      lights.push({ u: [u0 + F, u1 - F], casement: true, hingeAtLow: true, lb: left, rb: right });
    }
    const ly: Interval = [y0 + F, y1 - F];
    lights.forEach((L, i) => {
      const pfx = `light${i}_`;
      if (!L.casement) {
        const gu: Interval = [L.u[0] + 0.002, L.u[1] - 0.002],
          gy: Interval = [ly[0] + 0.002, ly[1] - 0.002];
        const igu = addIGU(b, pfx, gu, gy, wc, "glass", ["window"]);
        glaze(b, igu, gu, gy, wc, { top: head, bottom: sill, left: L.lb, right: L.rb }, 10);
        return;
      }
      // casement sash (inward opening, side hung)
      const SF = 0.045;
      const sw: Interval = [wc - 0.03, wc + 0.03];
      const su: Interval = [L.u[0] + 0.002, L.u[1] - 0.002],
        sy: Interval = [ly[0] + 0.002, ly[1] - 0.002];
      const st = ["window-sash"];
      const sT = bar(b, `${pfx}sashTop`, su, [sy[1] - SF, sy[1]], sw, st);
      const sB = bar(b, `${pfx}sashBottom`, su, [sy[0], sy[0] + SF], sw, st);
      const sL = bar(b, `${pfx}sashL`, [su[0], su[0] + SF], [sy[0] + SF, sy[1] - SF], sw, st);
      const sR = bar(b, `${pfx}sashR`, [su[1] - SF, su[1]], [sy[0] + SF, sy[1] - SF], sw, st);
      for (const [s, uu] of [
        [sL, su[0] + SF / 2],
        [sR, su[1] - SF / 2],
      ] as Array<[Bar, number]>) {
        bondAt(b, s.name, sT.name, "screw", 60, [uu, sy[1] - SF, wc]);
        bondAt(b, s.name, sB.name, "screw", 60, [uu, sy[0] + SF, wc]);
      }
      const gu: Interval = [su[0] + SF + 0.002, su[1] - SF - 0.002],
        gy: Interval = [sy[0] + SF + 0.002, sy[1] - SF - 0.002];
      const igu = addIGU(b, pfx, gu, gy, wc, "glass", ["window"]);
      glaze(b, igu, gu, gy, wc, { top: sT, bottom: sB, left: sL, right: sR }, 10);
      // handle on the latch stile, interior face
      const latchStile = L.hingeAtLow ? sR : sL;
      const hu = mid(latchStile.u[0], latchStile.u[1]);
      const hy = mid(sy[0], sy[1]);
      const base = `${pfx}handleBase`,
        lever = `${pfx}handle`;
      boxR(b, base, "aluminum", "aluminum", [hu - 0.0125, hu + 0.0125], [hy - 0.035, hy + 0.035], [sw[1], sw[1] + 0.01], { tint: 0xe6e6e2, tess: 0, tags: ["window", "handle"] });
      boxR(b, lever, "aluminum", "aluminum", [hu - 0.006, hu + 0.006], [hy - 0.11, hy + 0.01], [sw[1] + 0.01, sw[1] + 0.022], { tint: 0xe6e6e2, tess: 0, tags: ["window", "handle"] });
      bondAt(b, base, latchStile.name, "screw", 30, [hu, hy, sw[1]]);
      bondAt(b, lever, base, "press", 15, [hu, hy, sw[1] + 0.01]);
      // hinges on the outer stile, axis vertical, opening into the room (+w)
      const hingeStile = L.hingeAtLow ? sL : sR;
      const fixedBar = L.hingeAtLow ? L.lb : L.rb;
      const latchBar = L.hingeAtLow ? L.rb : L.lb;
      const uH = L.hingeAtLow ? su[0] : su[1];
      const hs = L.hingeAtLow ? -1 : 1;
      const pw = sw[1] + 0.003;
      const pivots: V3[] = [
        [uH, sy[0] + 0.12, pw],
        [uH, sy[1] - 0.12, pw],
      ];
      hingeGroup(b, `${o.op.id}_${i}#hinge`, hingeStile.name, fixedBar.name, [0, hs, 0], pivots, 0, 90, 150, 0.5, {
        part: latchStile.name,
        fixed: latchBar.name,
        at: [hu, hy, mid(sw[0], sw[1])],
        strength: 60,
      });
    });
  });
  const def = b.build();
  def.room = room?.id;
  return def;
}

// ===================================================================== sliding door
export function buildSlidingDoor(run: ConcreteRun, o: RunOpening): AssemblyDef {
  const half = run.half;
  const pt = run.frame.toWorld(mid(o.r0, o.r1), 0, half + 0.3);
  const room = roomAt(pt.x, pt.z);
  const b = newBuilder("door_sliding", "Balcony Sliding Door", "fixture", 2600);
  inFrame(b, run, () => {
    const fw: Interval = [-0.0125, half]; // flush with the interior face
    const tags = ["door-frame"];
    const u0 = o.r0 + 0.005,
      u1 = o.r1 - 0.005;
    const TR = 0.03; // sill track height
    const HF = 0.05,
      JF = 0.05;
    const yh = o.head - 0.005;
    const track = bar(b, "track", [u0, u1], [0, TR], fw, tags);
    const head = bar(b, "frameHead", [u0, u1], [yh - HF, yh], fw, tags);
    const left = bar(b, "frameL", [u0, u0 + JF], [TR, yh - HF], fw, tags);
    const right = bar(b, "frameR", [u1 - JF, u1], [TR, yh - HF], fw, tags);
    for (const j of [left, right]) {
      const uu = mid(j.u[0], j.u[1]);
      bondAt(b, j.name, head.name, "screw", 70, [uu, yh - HF, mid(fw[0], fw[1])]);
      bondAt(b, j.name, track.name, "screw", 70, [uu, TR, mid(fw[0], fw[1])]);
    }
    anchorBar(b, head, null, o.head, 70);
    anchorBar(b, track, null, 0, 90);
    anchorBar(b, left, o.r0, null, 70);
    anchorBar(b, right, o.r1, null, 70);

    const ou0 = u0 + JF,
      ou1 = u1 - JF;
    const m = mid(ou0, ou1);
    const OV = 0.025; // meeting stiles overlap
    const py: Interval = [TR + 0.004, yh - HF - 0.004];
    const outerW: Interval = [-0.0075, 0.0375],
      innerW: Interval = [0.0475, 0.0925];
    const PF = 0.06;
    const panel = (pfx: string, u: Interval, w: Interval) => {
      const st = ["door", "slider-panel"];
      const pT = bar(b, `${pfx}top`, u, [py[1] - PF, py[1]], w, st);
      const pB = bar(b, `${pfx}bottom`, u, [py[0], py[0] + PF], w, st);
      const pL = bar(b, `${pfx}L`, [u[0], u[0] + PF], [py[0] + PF, py[1] - PF], w, st);
      const pR = bar(b, `${pfx}R`, [u[1] - PF, u[1]], [py[0] + PF, py[1] - PF], w, st);
      const wcP = mid(w[0], w[1]);
      for (const [s, uu] of [
        [pL, u[0] + PF / 2],
        [pR, u[1] - PF / 2],
      ] as Array<[Bar, number]>) {
        bondAt(b, s.name, pT.name, "screw", 70, [uu, py[1] - PF, wcP]);
        bondAt(b, s.name, pB.name, "screw", 70, [uu, py[0] + PF, wcP]);
      }
      const gu: Interval = [u[0] + PF + 0.002, u[1] - PF - 0.002],
        gy: Interval = [py[0] + PF + 0.002, py[1] - PF - 0.002];
      const igu = addIGU(b, pfx, gu, gy, wcP, "temperedGlass", ["door"]);
      glaze(b, igu, gu, gy, wcP, { top: pT, bottom: pB, left: pL, right: pR }, 14);
      return { pT, pB, pL, pR };
    };
    // fixed panel on the outer track (low-u half), sliding panel on the inner track
    const fixed = panel("fixed_", [ou0, m + OV], outerW);
    const slide = panel("slide_", [m - OV, ou1], innerW);
    bondAt(b, fixed.pL.name, left.name, "screw", 140, [ou0, mid(py[0], py[1]), mid(outerW[0], outerW[1])]);
    bondAt(b, fixed.pT.name, head.name, "screw", 140, [mid(ou0, m), py[1], mid(outerW[0], outerW[1])]);
    bondAt(b, fixed.pB.name, track.name, "screw", 140, [mid(ou0, m), py[0], mid(outerW[0], outerW[1])]);
    // pull handle on the sliding panel's interior face near the latch stile
    const hu = ou1 - PF / 2,
      hy0 = 0.95,
      hy1 = 1.2;
    const handle = "pullHandle";
    boxR(b, handle, "aluminum", "aluminum", [hu - 0.011, hu + 0.011], [hy0, hy1], [innerW[1], innerW[1] + 0.018], { tint: 0xd8d8d4, tess: 0, tags: ["door", "handle"] });
    bondAt(b, handle, slide.pR.name, "screw", 40, [hu, mid(hy0, hy1), innerW[1]]);
    const wcI = mid(innerW[0], innerW[1]);
    sliderGroup(
      b,
      `${o.op.id}#slide`,
      slide.pB.name,
      track.name,
      [-1, 0, 0],
      [
        [m - OV + 0.12, py[0], wcI],
        [ou1 - 0.12, py[0], wcI],
      ],
      0,
      ou1 - (m - OV) - 0.06,
      120,
      0.25,
      { part: slide.pR.name, fixed: right.name, at: [ou1, 1.05, wcI], strength: 60 },
    );
  });
  const def = b.build();
  def.room = room?.id;
  return def;
}
