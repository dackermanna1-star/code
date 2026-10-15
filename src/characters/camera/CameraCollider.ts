// Sphere-cast camera collision against world geometry (terrain, buildings, props, vehicles, glass).
import * as THREE from 'three';
import { RAPIER, Mask, groups } from '../../core/Physics';
import { ctx } from '../../core/GameContext';
import type { IVehicle } from '../../core/contracts';

const CAM_GROUPS = groups(0xffff, Mask.World);
const _d = new THREE.Vector3();

export class CameraCollider {
  private readonly ball = new RAPIER.Ball(0.2);

  /**
   * Fraction (0..1) of the segment from→to the camera sphere can travel before touching geometry.
   * Ignores the followed character's collider and (optionally) the vehicle it sits in.
   */
  cast(from: THREE.Vector3, to: THREE.Vector3, radius: number, exclude: RAPIER.Collider | null, vehicle: IVehicle | null): number {
    _d.copy(to).sub(from);
    const len = _d.length();
    if (len < 1e-4) return 1;
    if (this.ball.radius !== radius) this.ball.radius = radius;
    const physics = ctx.physics;
    const hit = physics.world.castShape(
      { x: from.x, y: from.y, z: from.z },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: _d.x, y: _d.y, z: _d.z },
      this.ball,
      0,
      1,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      CAM_GROUPS,
      exclude ?? undefined,
      undefined,
      vehicle
        ? (c) => {
            const info = physics.getInfo(c);
            return !(info && info.kind === 'vehicle' && info.owner === vehicle);
          }
        : undefined,
    );
    if (!hit) return 1;
    // Keep a small margin in front of the surface.
    const t = hit.time_of_impact - 0.04 / len;
    return Math.max(0, Math.min(1, t));
  }
}
