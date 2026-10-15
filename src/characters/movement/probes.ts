// Physics probes used by movement: obstacle analysis for vault/climb, lean clearance, ground sampling.
// All functions are allocation-light and use module-level temporaries.
import * as THREE from 'three';
import { RAPIER, type Physics } from '../../core/Physics';
import { CAPSULE_RADIUS, VAULT } from '../constants';
import { WORLD_MOVE_GROUPS, CHAR_MOVE_GROUPS } from './CharacterBody';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);

export interface ObstacleInfo {
  kind: 'vault' | 'climb';
  /** Obstacle top height above the feet. */
  height: number;
  /** World Y of the top surface. */
  topY: number;
  /** Horizontal distance from the feet to the obstacle's front face. */
  faceDist: number;
  /** Thickness if known (vault), else 0. */
  thickness: number;
  /** Feet position where the move ends. */
  end: THREE.Vector3;
  /** Stance at the end (climb onto a low ceiling ledge may end crouched). */
  endStance: 'stand' | 'crouch';
}

type Ray = (o: THREE.Vector3, d: THREE.Vector3, max: number) => { distance: number; point: THREE.Vector3; normal: THREE.Vector3 } | null;

function rayFn(physics: Physics, self: RAPIER.Collider): Ray {
  return (o, d, max) => {
    const h = physics.raycast(o, d, max, { mask: 0xffff, excludeCollider: self, predicate: worldOnlyPredicate(physics) });
    return h ? { distance: h.distance, point: h.point, normal: h.normal } : null;
  };
}

let predPhysics: Physics | null = null;
let predFn: ((c: RAPIER.Collider) => boolean) | null = null;

/** Accept colliders that block movement (not characters, water, sensors, foliage). One closure per physics. */
function worldOnlyPredicate(physics: Physics): (c: RAPIER.Collider) => boolean {
  if (predFn && predPhysics === physics) return predFn;
  predPhysics = physics;
  predFn = (c) => {
    if (c.isSensor()) return false;
    const info = physics.getInfo(c);
    if (!info) return true;
    return info.kind !== 'character' && info.kind !== 'water' && info.kind !== 'dynamic';
  };
  return predFn;
}

/** Is a vertical capsule (radius r, from feetY to feetY+height) free at (x, feetY, z)? */
export function capsuleFree(physics: Physics, self: RAPIER.Collider, x: number, feetY: number, z: number, height: number, r = CAPSULE_RADIUS - 0.03, withChars = true): boolean {
  const hh = Math.max(0.01, height / 2 - r);
  const s = new RAPIER.Capsule(hh, r);
  const hit = physics.world.intersectionWithShape(
    { x, y: feetY + height / 2 + 0.04, z },
    { x: 0, y: 0, z: 0, w: 1 },
    s,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    withChars ? CHAR_MOVE_GROUPS : WORLD_MOVE_GROUPS,
    self,
  );
  return hit === null;
}

/**
 * Analyse the obstacle in front of a character (feet at `feet`, facing `fwd` horizontal unit vector).
 * Returns a vault/climb plan or null (nothing vaultable: regular jump).
 */
export function analyseObstacle(physics: Physics, self: RAPIER.Collider, feet: THREE.Vector3, fwd: THREE.Vector3): ObstacleInfo | null {
  const ray = rayFn(physics, self);
  const reach = VAULT.probeDistance + CAPSULE_RADIUS;
  // 1) Front face: nearest hit among low/mid horizontal rays.
  let face = Infinity;
  for (const h of [0.3, 0.55, 0.8, 1.05]) {
    _o.set(feet.x, feet.y + h, feet.z);
    const hit = ray(_o, fwd, reach);
    if (hit && Math.abs(hit.normal.y) < 0.6 && hit.distance < face) face = hit.distance;
  }
  if (!isFinite(face)) {
    // Something higher (a ledge at chest/head height) can still be climbed.
    for (const h of [1.35, 1.65, 1.95]) {
      _o.set(feet.x, feet.y + h, feet.z);
      const hit = ray(_o, fwd, reach);
      if (hit && Math.abs(hit.normal.y) < 0.6 && hit.distance < face) face = hit.distance;
    }
    if (!isFinite(face)) return null;
  }
  // 2) Top height: cast down just beyond the front face.
  const probeIn = face + 0.18;
  const startY = feet.y + VAULT.climbMaxHeight + 0.6;
  _o.set(feet.x + fwd.x * probeIn, startY, feet.z + fwd.z * probeIn);
  // The start point must be in free space (otherwise the wall is taller than climbable).
  if (!pointFree(physics, self, _o)) return null;
  const top = ray(_o, _down, VAULT.climbMaxHeight + 0.6 + 0.3);
  if (!top || top.normal.y < 0.65) return null;
  const topY = top.point.y;
  const height = topY - feet.y;
  if (height < VAULT.minHeight || height > VAULT.climbMaxHeight + 0.02) return null;

  // 3) Head clearance on the approach: nothing between the feet column and the top above the obstacle.
  _o.set(feet.x, topY + 0.25, feet.z);
  const over = ray(_o, fwd, probeIn + 0.1);
  if (over) return null;

  // 4) Thickness: scan forward for the back edge (ground drops below top - 0.3).
  if (height <= VAULT.maxHeight) {
    let backEdge = -1;
    for (let k = 1; k <= 6; k++) {
      const dist = probeIn + k * 0.2;
      _o.set(feet.x + fwd.x * dist, topY + 0.3, feet.z + fwd.z * dist);
      const hit = ray(_o, _down, 0.6);
      if (!hit) {
        backEdge = dist;
        break;
      }
      // a wall continues upward on the far side → not vaultable here
      if (hit.point.y > topY + 0.25) break;
    }
    const thickness = backEdge > 0 ? backEdge - face : Infinity;
    if (backEdge > 0 && thickness <= VAULT.maxThickness + 0.05) {
      // Landing point beyond the back edge.
      const landDist = backEdge + CAPSULE_RADIUS + 0.25;
      _o.set(feet.x + fwd.x * landDist, topY + 0.2, feet.z + fwd.z * landDist);
      const ground = ray(_o, _down, height + 3.5);
      const landY = ground ? ground.point.y : topY - height - 3;
      // Body must pass over the obstacle (crouched capsule above the top) and fit at the landing spot.
      const midDist = (face + backEdge) / 2;
      const midFree = capsuleFree(physics, self, feet.x + fwd.x * midDist, topY + 0.05, feet.z + fwd.z * midDist, 1.0, 0.28, false);
      const landFree = capsuleFree(physics, self, _o.x, landY + 0.02, _o.z, 1.7, CAPSULE_RADIUS - 0.04);
      if (midFree && landFree) {
        return {
          kind: 'vault',
          height,
          topY,
          faceDist: face,
          thickness,
          end: new THREE.Vector3(_o.x, landY, _o.z),
          endStance: 'stand',
        };
      }
    }
  }

  // 5) Climb onto the top: the body must fit standing (or crouched) on the ledge.
  const onDist = face + CAPSULE_RADIUS + 0.12;
  const ex = feet.x + fwd.x * onDist;
  const ez = feet.z + fwd.z * onDist;
  _o.set(ex, topY + 0.3, ez);
  const onTop = ray(_o, _down, 0.6);
  if (!onTop || onTop.normal.y < 0.65) return null;
  const endY = onTop.point.y;
  let endStance: 'stand' | 'crouch' | null = null;
  if (capsuleFree(physics, self, ex, endY + 0.02, ez, 1.8)) endStance = 'stand';
  else if (capsuleFree(physics, self, ex, endY + 0.02, ez, 1.25)) endStance = 'crouch';
  if (!endStance) return null;
  return { kind: 'climb', height, topY, faceDist: face, thickness: 0, end: new THREE.Vector3(ex, endY, ez), endStance };
}

/** True if a point is not inside any movement-blocking collider. */
export function pointFree(physics: Physics, self: RAPIER.Collider, p: THREE.Vector3): boolean {
  const s = new RAPIER.Ball(0.05);
  return (
    physics.world.intersectionWithShape(
      { x: p.x, y: p.y, z: p.z },
      { x: 0, y: 0, z: 0, w: 1 },
      s,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      WORLD_MOVE_GROUPS,
      self,
    ) === null
  );
}

/**
 * How far (0..1 of the full lean offset) a character can lean to `side` (±1) before the head hits a wall.
 * `neck` is the un-leaned neck/eye point, `right` the character's right vector.
 */
export function leanClearance(physics: Physics, self: RAPIER.Collider, neck: THREE.Vector3, right: THREE.Vector3, side: number, offset: number): number {
  _d.copy(right).multiplyScalar(side);
  const r = 0.14;
  const s = new RAPIER.Ball(r);
  const hit = physics.world.castShape(
    { x: neck.x, y: neck.y, z: neck.z },
    { x: 0, y: 0, z: 0, w: 1 },
    { x: _d.x, y: _d.y, z: _d.z },
    s,
    0,
    offset + 0.08,
    true,
    RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    WORLD_MOVE_GROUPS,
    self,
  );
  if (!hit) return 1;
  return Math.max(0, Math.min(1, (hit.time_of_impact - 0.06) / offset));
}

/** Ground height under (x, z) searching down from `fromY` (physics, includes buildings). */
export function groundHeightAt(physics: Physics, self: RAPIER.Collider, x: number, fromY: number, z: number, maxDrop: number): number | null {
  _o.set(x, fromY, z);
  const h = physics.raycast(_o, _down, maxDrop, { mask: 0xffff, excludeCollider: self, predicate: worldOnlyPredicate(physics) });
  return h ? h.point.y : null;
}

/** Ground hit (point + normal) below a point. */
export function groundHit(physics: Physics, self: RAPIER.Collider, x: number, fromY: number, z: number, maxDrop: number) {
  _o.set(x, fromY, z);
  return physics.raycast(_o, _down, maxDrop, { mask: 0xffff, excludeCollider: self, predicate: worldOnlyPredicate(physics) });
}
