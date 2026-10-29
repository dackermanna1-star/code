// Stride-based footsteps. The stride phase advances π per step (foot strikes at multiples of π)
// in proportion to the horizontal distance walked on the ground, with a speed-dependent step
// length (≈0.75 m crouching, 1.1 m walking at 3.6 m/s, 1.6 m sprinting). The camera head-bob
// reads the same phase so bob and footstep sounds stay in sync.
//
// Each foot strike emits a `footstep` event with the material under the foot: the destruction
// system's material of the support body/part, else the room's floor material from plan.ts.
// Stepping on small loose bodies (debris, a fallen appliance) also presses them with a light
// "stomp" strike so walking over shards crunches them.

import { Vector3, type PhysicsBody } from "@babylonjs/core";
import { Layer, type GameContext } from "../core/context.ts";
import type { MaterialId } from "../destruction/model/materials.ts";
import { roomAt } from "../world/plan.ts";

/** What is under the player's feet (from a downward ray / the controller's contacts). */
export interface SupportProbe {
  body: PhysicsBody;
  point: Vector3;
  normal: Vector3;
  childIndex: number;
}

/** Step length (m) as a function of horizontal speed (m/s). */
export function stepLength(speed: number): number {
  return Math.min(1.65, Math.max(0.55, 0.45 + 0.19 * speed));
}

/** Loose bodies lighter than this are pressed underfoot with a light strike on each step. */
const CRUSH_MAX_MASS = 30;
/**
 * …except the body the player stands on, unless it is this light (a mug, a shard on top of a
 * board): a rug, a door lying flat or a mattress carries the player's weight already (see
 * PlayerCore.pressSupport), and a 22 kg heel strike on a 7.8 kg rug at every step bounced it off
 * the floor and shook what stands on it (the glass coffee table broke).
 */
const CRUSH_SUPPORT_MAX_MASS = 2;

export class Footsteps {
  /** Stride phase (radians). */
  phase = 0;
  /** Footsteps emitted (stats/tests). */
  count = 0;
  private readonly ctx: GameContext;
  private readonly tmpPos = { x: 0, y: 0, z: 0 };

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  /**
   * Advance the stride by `distance` metres walked on the ground at `speed` m/s.
   * Returns true when a foot strike happened during this advance.
   */
  advance(distance: number, speed: number): boolean {
    if (!(distance > 0) || !Number.isFinite(distance)) return false;
    const before = Math.floor(this.phase / Math.PI);
    this.phase += (Math.PI * distance) / stepLength(speed);
    // keep the phase bounded (multiples of 2π keep the bob continuous)
    if (this.phase > 2000 * Math.PI) this.phase -= 1998 * Math.PI;
    return Math.floor(this.phase / Math.PI) !== before;
  }

  /** Re-align the stride so the next strike comes after a full step (after landing). */
  resetToStrike(): void {
    this.phase = Math.ceil(this.phase / Math.PI) * Math.PI;
  }

  /** Material under the feet: destruction material of the support body, else the room floor. */
  materialAt(x: number, y: number, z: number, support: SupportProbe | null): MaterialId | null {
    if (support) {
      try {
        const m = this.ctx.destruction.materialAt(support.body, support.point, support.childIndex);
        if (m) return m;
      } catch {
        /* non-destruction body (test floor) → room fallback */
      }
    }
    const room = roomAt(x, z);
    if (room) return room.floorMat;
    return y < -0.01 ? "concrete" : null;
  }

  /**
   * Emit a foot strike at the foot position (world) and press loose bodies under the stepping
   * foot (left/right alternate, ~10 cm either side of the body axis; foot ≈ 11 cm sphere sweep).
   */
  step(footX: number, footY: number, footZ: number, speed: number, support: SupportProbe | null, right: Vector3 | null, ignore: PhysicsBody | null): void {
    this.count++;
    const mat = this.materialAt(footX, footY, footZ, support);
    const p = this.tmpPos;
    p.x = footX;
    p.y = support ? support.point.y : footY;
    p.z = footZ;
    this.ctx.events.emit("footstep", { pos: { x: p.x, y: p.y, z: p.z }, mat, speed });
    const side = this.count & 1 ? 0.1 : -0.1;
    const fx = footX + (right ? right.x * side : 0);
    const fz = footZ + (right ? right.z * side : 0);
    this.sweepFrom.set(fx, footY + 0.3, fz);
    this.sweepTo.set(fx, footY - 0.03, fz);
    let hit = null;
    try {
      hit = this.ctx.physics.sphereSweep(this.sweepFrom, this.sweepTo, 0.11, Layer.DEBRIS | Layer.DYNAMIC, ignore);
    } catch {
      hit = null;
    }
    if (hit) this.crush({ body: hit.body, point: hit.point, normal: hit.normal, childIndex: hit.childIndex }, speed, support ? support.body : null);
  }

  private readonly sweepFrom = new Vector3();
  private readonly sweepTo = new Vector3();
  private readonly crushPoint = new Vector3();
  private readonly crushDir = new Vector3(0, -1, 0);

  /** Light strike on a loose (dynamic, light) body under the foot. */
  private crush(target: SupportProbe, speed: number, standingOn: PhysicsBody | null = null): void {
    const d = this.ctx.destruction;
    let mass: number | null = null;
    try {
      if (d.isStatic(target.body)) return;
      mass = d.massOf(target.body);
    } catch {
      return;
    }
    if (mass === null || !(mass > 0) || mass > CRUSH_MAX_MASS) return;
    if (target.body === standingOn && mass > CRUSH_SUPPORT_MAX_MASS) return;
    // (strike copies point/dir: scratch vectors are safe)
    d.strike({
      point: this.crushPoint.copyFrom(target.point),
      dir: this.crushDir.set(0, -1, 0),
      body: target.body,
      childIndex: target.childIndex,
      // part of the body weight comes down through one foot at heel strike
      mass: 22,
      speed: Math.min(1.6, 0.6 + 0.15 * speed),
      sharpness: 1,
      contactRadius: 0.05,
      strikerMat: "flesh",
      source: "stomp",
    });
  }
}
