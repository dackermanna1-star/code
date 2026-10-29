// Named camera poses (eye position + look-at point) per room, for screenshots and tests.
// Positions are inside the furnished rooms, clear of furniture (taken from the content probes).

import type { Vec3 } from "../geom/vec.ts";

export interface CameraPose {
  pos: Vec3;
  /** Yaw (rad, 0 = +Z, +π/2 = +X) and pitch (rad, positive looks down) — player.teleport convention. */
  yaw: number;
  pitch: number;
  target: Vec3;
}

const P = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** Yaw/pitch of the view from `pos` towards `target` (left-handed, pitch > 0 looks down). */
export function lookAngles(pos: Vec3, target: Vec3): { yaw: number; pitch: number } {
  const dx = target.x - pos.x,
    dy = target.y - pos.y,
    dz = target.z - pos.z;
  const h = Math.hypot(dx, dz);
  return { yaw: Math.atan2(dx, dz), pitch: Math.max(-1.55, Math.min(1.55, Math.atan2(-dy, h || 1e-6))) };
}

function pose(pos: Vec3, target: Vec3): CameraPose {
  return { pos, target, ...lookAngles(pos, target) };
}

export const SCREENSHOT_POSES: Readonly<Record<string, CameraPose>> = {
  living: pose(P(8.6, 1.6, 0.35), P(4.3, 0.9, 2.6)),
  livingSofa: pose(P(4.7, 1.5, 1.4), P(8.6, 0.8, 2.6)),
  dining: pose(P(7.9, 1.6, 3.2), P(6.2, 0.75, 4.2)),
  kitchen: pose(P(6.6, 1.65, 3.6), P(6.6, 0.9, 7.6)),
  kitchenFridge: pose(P(7.6, 1.5, 6.4), P(8.8, 1.0, 8.3)),
  bathroom: pose(P(1.85, 1.6, 5.85), P(0.7, 0.8, 8.4)),
  laundry: pose(P(3.35, 1.6, 5.85), P(3.1, 0.9, 8.6)),
  master: pose(P(3.3, 1.6, 4.0), P(0.8, 0.6, 2.0)),
  bedroom2: pose(P(10.0, 1.65, 4.0), P(11.5, 0.8, 0.8)),
  bedroom2Desk: pose(P(11.15, 1.4, 0.75), P(12.5, 0.85, 1.6)),
  foyer: pose(P(9.55, 1.6, 5.1), P(11.6, 1.0, 8.3)),
  hall: pose(P(4.4, 1.65, 4.85), P(0.6, 1.0, 5.0)),
  balcony: pose(P(6.8, 1.65, 0.6), P(5.6, 0.35, -1.0)),
  balconyView: pose(P(6.4, 1.6, -0.9), P(2.0, 0.0, -12.0)),
};
