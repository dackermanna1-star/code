// Vehicle seat: follow the seat transform each tick; exit placement + bail-out damage.
import * as THREE from 'three';
import { ctx } from '../../core/GameContext';
import type { IVehicle } from '../../core/contracts';
import type { Character } from '../Character';
import { capsuleFree, groundHeightAt } from './probes';
import { vehicleExitDamage } from './speed';
import { applyCharacterDamage } from '../damage';

const _local = new THREE.Vector3();
const _inv = new THREE.Quaternion();
const _cand = new THREE.Vector3();
const _side = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export function updateSeat(c: Character, _dt: number): void {
  const v = c.vehicle;
  if (!v) {
    c.mode = 'ground';
    return;
  }
  v.getSeatTransform(c.seatIndex, c.seatPos, c.seatQuat);
  c.updateSeatFeet();
  c.velocity.copy(v.velocity);
  c.moveState = 'vehicle';
  c.isGrounded = true;
  c.isSprinting = false;
  c.gait = 'idle';
  if (c.intent.switchSeat !== null && c.intent.switchSeat !== c.seatIndex) {
    try {
      v.switchSeat(c, c.intent.switchSeat);
    } catch (e) {
      console.warn('[characters] switchSeat failed', e);
    }
  }
}

/**
 * Place a character next to the vehicle after exiting: seat side first, then the other side, behind,
 * in front, and finally on the roof. Inherits the vehicle velocity; bailing out fast hurts.
 */
export function placeAfterVehicleExit(c: Character, v: IVehicle): void {
  const vq = v.quaternion;
  const vp = v.position;
  // Seat side from the seat position in vehicle space (+X is the vehicle's LEFT, assets face +Z).
  _inv.copy(vq).invert();
  _local.copy(c.seatPos).sub(vp).applyQuaternion(_inv);
  const sideSign = _local.x >= 0 ? 1 : -1;
  _side.set(1, 0, 0).applyQuaternion(vq).setY(0).normalize();
  _fwd.set(0, 0, 1).applyQuaternion(vq).setY(0).normalize();
  const halfWidth = 1.3;
  const halfLen = v.isBoat ? 3.2 : 2.6;
  const candidates: [number, number][] = [
    [sideSign * halfWidth, _local.z],
    [sideSign * halfWidth, _local.z - 0.8],
    [sideSign * halfWidth, _local.z + 0.8],
    [-sideSign * halfWidth, _local.z],
    [0, -halfLen],
    [0, halfLen],
    [sideSign * (halfWidth + 0.8), _local.z],
    [-sideSign * (halfWidth + 0.8), _local.z],
  ];
  let placed = false;
  for (const [sx, sz] of candidates) {
    _cand.copy(vp).addScaledVector(_side, sx).addScaledVector(_fwd, sz);
    const top = vp.y + 2.5;
    const g = groundHeightAt(ctx.physics, c.body.collider, _cand.x, top, _cand.z, 6);
    let y = g ?? vp.y;
    const water = ctx.world.getWaterHeight(_cand.x, _cand.z);
    if (water !== null && water > y) y = Math.max(y, water - 1.4);
    if (capsuleFree(ctx.physics, c.body.collider, _cand.x, y + 0.02, _cand.z, 1.8)) {
      c.position.set(_cand.x, y + 0.02, _cand.z);
      placed = true;
      break;
    }
  }
  if (!placed) {
    // Last resort: on the roof.
    c.position.set(vp.x, vp.y + 2.2, vp.z);
  }
  c.prevPosition.copy(c.position);
  c.body.setShape('stand', c.position);
  c.body.syncTo(c.position);
  c.bodyYaw = c.yaw;
  c.isGrounded = false;
  c.airTime = 0;
  c.fallStartY = c.position.y;
  // Inherit vehicle velocity; damage when bailing out at speed.
  const vel = v.velocity;
  const speed = Math.hypot(vel.x, vel.z);
  c.velocity.set(vel.x * 0.6, Math.max(0, vel.y), vel.z * 0.6);
  const dmg = vehicleExitDamage(speed);
  if (dmg > 0) applyCharacterDamage(c, { type: 'fall', amount: dmg, point: c.position.clone() });
}
