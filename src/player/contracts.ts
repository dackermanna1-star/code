// Contract between the player agent (movement, camera, grab/throw, interaction, HUD) and the
// tools agent (tool definitions, swings, sweeps → destruction.strike, viewmodel).
// The Player owns a ToolSystem: new ToolSystem(ctx) from src/player/tools/toolSystem.ts.

import type { PhysicsBody, Vector3 } from "@babylonjs/core";
import type { ToolId } from "../core/context.ts";

export interface ToolDef {
  id: ToolId;
  name: string;
  /** Effective striking mass (kg) at the head and peak head speed (m/s) for a normal swing. */
  mass: number;
  speed: number;
  /** Multiplier on speed for a fully charged swing (hold fire). */
  chargeSpeedMul: number;
  /** Seconds to full charge. */
  chargeTime: number;
  /** Swing durations (s): wind-up, strike window, recovery. */
  windup: number;
  strike: number;
  recover: number;
  /** Reach (m) from the eye and head sphere radius (m). */
  reach: number;
  headRadius: number;
  contactRadius: number;
  /** Sharpness multipliers. */
  sharpness: number;
  strikerMat: "steel" | "flesh" | "hardwood" | "aluminum";
  /** Has an alternate action (crowbar pry, extinguisher spray). */
  alt: "pry" | "spray" | null;
}

export interface ToolContext {
  /** Eye position and look direction (world, unit) for this fixed step. */
  eye: Vector3;
  forward: Vector3;
  right: Vector3;
  up: Vector3;
  /** Player velocity (m/s) — added to swing speed. */
  velocity: Vector3;
  /** Body the player is standing on (ignored by sweeps), the player's own body(s) to ignore. */
  ignore: PhysicsBody | null;
  /** True while the player holds an object (tools are lowered; fire = throw handled by the player). */
  holding: boolean;
}

export interface IToolSystem {
  readonly current: ToolId;
  readonly defs: Readonly<Record<ToolId, ToolDef>>;
  select(id: ToolId): void;
  /** Fixed-step logic: read input (fire/alt down/pressed/released via ctx.input), run swings & sweeps. */
  fixedUpdate(dt: number, tc: ToolContext): void;
  /** Per-frame viewmodel animation (bob, sway, swing pose). */
  update(dt: number, tc: ToolContext): void;
  /** Kick / stomp (body actions available with any tool). */
  kick(tc: ToolContext): void;
  stomp(tc: ToolContext): void;
  /** Debug: perform a swing now with power 0..1. */
  debugSwing(power: number, tc: ToolContext): void;
  /** True while a swing is in progress (player may slow down). */
  readonly busy: boolean;
}
