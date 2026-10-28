// Joint-group helpers for doors, sashes and sliding panels: several hinge (or slider) bonds
// sharing one group id plus an optional latch bond in the same group whose anchor sits where
// the latch really is (the builder's own hinge() anchors latches at the first hinge). PURE.

import type { Builder } from "../../objects/lib/builder.ts";
import type { V3 } from "./common.ts";

const D2R = Math.PI / 180;

export interface LatchSpec {
  /** Part on the moving side that carries the latch/bolt. */
  part: string;
  /** Part on the fixed side (strike / jamb). */
  fixed: string;
  /** Anchor in the current frame. */
  at: V3;
  strength: number;
}

/**
 * Hinge group: one `hinge` bond per pivot (all on one axis) between `moving` and `fixed`, in the
 * builder's CURRENT frame. Limits in degrees relative to the built pose about `axis`
 * (right-hand rule: a positive angle turns the leaf as `axis × (pivot→leaf)` points).
 */
export function hingeGroup(
  b: Builder,
  group: string,
  moving: string,
  fixed: string,
  axis: V3,
  pivots: V3[],
  minDeg: number,
  maxDeg: number,
  strength: number,
  friction: number,
  latch?: LatchSpec,
): void {
  const ax = b.d(axis);
  const first = b.p(pivots[0]);
  for (const pv of pivots) {
    b.bond(moving, fixed, "hinge", { strength, anchor: pv, joint: { axis: ax, pivot: b.p(pv), min: minDeg * D2R, max: maxDeg * D2R, friction, group } });
  }
  if (latch) b.bond(latch.part, latch.fixed, "latch", { strength: latch.strength, anchor: latch.at, joint: { axis: ax, pivot: first, min: 0, max: 0, group } });
}

/** Slider group (metres along `axis`) with an optional latch holding it at 0. */
export function sliderGroup(
  b: Builder,
  group: string,
  moving: string,
  fixed: string,
  axis: V3,
  pivots: V3[],
  min: number,
  max: number,
  strength: number,
  friction: number,
  latch?: LatchSpec,
): void {
  const ax = b.d(axis);
  const first = b.p(pivots[0]);
  for (const pv of pivots) {
    b.bond(moving, fixed, "slider", { strength, anchor: pv, joint: { axis: ax, pivot: b.p(pv), min, max, friction, group } });
  }
  if (latch) b.bond(latch.part, latch.fixed, "latch", { strength: latch.strength, anchor: latch.at, joint: { axis: ax, pivot: first, min: 0, max: 0, group } });
}
