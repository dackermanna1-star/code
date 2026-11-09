/**
 * Shared contracts between systems. Each gameplay module implements one of
 * these interfaces so `Run` can wire them together without knowing details.
 */
import type { AbstractMesh, Engine, HavokPlugin, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import type { CarDef } from "../data/cars";
import type { CarStats } from "../data/parts";
import type { LevelDef } from "../data/levels";
import type { EventBus } from "./Events";
import type { Input } from "./Input";
import type { Save } from "./Save";

/** Everything a system needs, passed into constructors. */
export interface GameContext {
  engine: Engine;
  scene: Scene;
  havok: HavokPlugin;
  input: Input;
  events: EventBus;
  save: Save;
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
}

/** Per-run counters the results screen pays out. */
export interface RunStats {
  distance: number; // furthest z reached (m)
  kills: number;
  killCash: number;
  stuntCash: number;
  stunts: string[];
  survivors: string[];
  airTime: number; // total seconds airborne
  topSpeed: number; // m/s
  flips: number;
  reachedEvac: boolean;
}

/** The player car as seen by other systems. Implemented by vehicles/Vehicle.ts. */
export interface IVehicle {
  readonly def: CarDef;
  readonly stats: CarStats;
  /** Chassis mesh (has the physics body). */
  readonly chassis: AbstractMesh;
  /** World-space position of the chassis center. */
  readonly position: Vector3;
  /** World-space linear velocity (m/s). */
  readonly velocity: Vector3;
  /** Signed speed along the car's forward axis (m/s). */
  readonly forwardSpeed: number;
  readonly forward: Vector3; // world forward unit vector
  readonly up: Vector3; // world up unit vector of chassis
  readonly airborne: boolean;
  fuel: number;
  boost: number; // seconds remaining
  health: number;
  /** True once health <= 0 or upside-down too long. */
  readonly wrecked: boolean;
  /** 0..1 visual damage level. */
  readonly damageLevel: number;
  /** Physics/control update; call from onBeforePhysics with scaled dt. */
  update(dt: number): void;
  /** Apply damage (health points) e.g. from impacts or explosions. */
  damage(amount: number, at?: Vector3): void;
  /** Slow the car (fraction 0..1 of forward speed lost), used by zombie hits. */
  applyDrag(fraction: number): void;
  /** Impulse at world point. */
  applyImpulse(impulse: Vector3, at: Vector3): void;
  /** Attach a mesh to the chassis (weapons, climbers, decals). */
  attach(node: TransformNode): void;
  dispose(): void;
}

/** Streamed world. Implemented by world/Level.ts. */
export interface ILevel {
  readonly def: LevelDef;
  /** Spawn transform for the car. Road runs along +Z. */
  readonly spawn: { position: Vector3; yaw: number };
  /** Road surface height at (x, z); used for placing zombies/props. */
  heightAt(x: number, z: number): number;
  /** Half-width of the drivable road at z (m). */
  roadHalfWidth(z: number): number;
  /** Lateral center of the road at z (road may curve slightly / fork). */
  roadCenterX(z: number): number;
  /** Stream chunks around the car. */
  update(dt: number, carPos: Vector3): void;
  dispose(): void;
}

/** Something weapons can aim at. Implemented by zombies. */
export interface ITarget {
  readonly position: Vector3; // world center of mass
  readonly alive: boolean;
  /** Damage from a weapon. `force` uses the same units as car impacts (m/s). */
  hit(force: number, direction: Vector3, kind: "bullet" | "fire" | "explosion"): void;
}

/** Zombie system as seen by others (weapons, HUD). */
export interface IZombies extends ISystem {
  /** Live targets within `range` of `from`, nearest first. */
  targetsNear(from: Vector3, range: number): ITarget[];
  /** Apply an explosion to all zombies/ragdolls in radius. */
  explode(center: Vector3, radius: number, power: number): void;
  readonly aliveCount: number;
}

/** Generic per-frame system. */
export interface ISystem {
  update(dt: number): void;
  dispose(): void;
}
