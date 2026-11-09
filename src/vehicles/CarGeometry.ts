/**
 * Wheel / suspension geometry shared by the visual model (CarModel) and the
 * raycast physics (Vehicle), so the wheels the player sees are exactly where
 * the suspension rays are cast.
 *
 * Frame: chassis-local, origin = center of `def.size` box, +Z forward, +Y up,
 * +X right (Babylon left-handed).
 */
import { Vector3 } from "@babylonjs/core";
import type { CarDef } from "../data/cars";

export interface WheelGeometry {
  /** Physical / visual tire radius (stats.wheelRadius: grows with the tire tier). */
  radius: number;
  /** Tire width. */
  width: number;
  /** Lateral offset of the wheel centers (|x|). */
  x: number;
  zFront: number;
  zRear: number;
  /** Local Y of the suspension top: the wheel center when fully compressed. */
  mountY: number;
  /** Suspension travel (= rest length of the spring). */
  rideHeight: number;
  /** Typical static rest length (spring sag under gravity) for visuals without physics. */
  restLength: number;
  /** Local Y of the ground under the car at static rest. */
  groundY: number;
  /** Suspension mount points FL, FR, RL, RR (chassis-local). */
  mounts: Vector3[];
}

/** Static sag fraction used for the garage / pre-physics pose. */
export const REST_COMPRESSION = 0.37;

export function wheelGeometry(def: CarDef, wheelRadius: number, tireTier: number): WheelGeometry {
  const H = def.size.height / 2;
  const W = def.size.width / 2;
  const base = def.wheelRadius;
  const radius = wheelRadius;
  // Chunky tires; bigger tiers get fatter rubber too.
  const width = Math.max(0.28, base * 0.78) * (1 + tireTier * 0.09);
  // Tires always poke out of the body a little for a toy look.
  const x = Math.max(def.track / 2, W - width * 0.28) + Math.max(0, radius - base) * 0.35;
  // Bigger tires lower the mount by the radius gain so the tire top stays in the
  // arch while the body gets lifted (monster-truck look).
  const mountY = -H + base * 0.95 - (radius - base);
  const rideHeight = def.rideHeight;
  const restLength = rideHeight * (1 - REST_COMPRESSION);
  const zFront = def.wheelBase / 2;
  const zRear = -def.wheelBase / 2;
  const mounts = [
    new Vector3(-x, mountY, zFront),
    new Vector3(x, mountY, zFront),
    new Vector3(-x, mountY, zRear),
    new Vector3(x, mountY, zRear),
  ];
  return { radius, width, x, zFront, zRear, mountY, rideHeight, restLength, groundY: mountY - restLength - radius, mounts };
}
