import { LIQUID, SOLID } from '../world/blocks';
import type { BlockAccess } from '../world/chunk';

/**
 * Shared, deterministic player movement simulation. The client runs it for
 * prediction, the server runs the exact same function on the client's input
 * commands (authoritative). Collision is axis-separated AABB vs voxel grid.
 */

export interface MoveParams {
  walkSpeed: number;
  sprintSpeed: number;
  crouchSpeed: number;
  swimSpeed: number;
  gravity: number;
  jumpVelocity: number;
  groundAccel: number;
  airAccel: number;
  terminalVelocity: number;
}

export const DEFAULT_MOVE: MoveParams = {
  walkSpeed: 4.3,
  sprintSpeed: 6.4,
  crouchSpeed: 1.9,
  swimSpeed: 2.6,
  gravity: 30,
  jumpVelocity: 9.2,
  groundAccel: 22,
  airAccel: 3.5,
  terminalVelocity: 60,
};

export const PLAYER_HALF_WIDTH = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_CROUCH_HEIGHT = 1.5;
export const EYE_HEIGHT = 1.62;
export const CROUCH_EYE_HEIGHT = 1.32;

export interface MoveState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  inWater: boolean;
  crouching: boolean;
}

export interface MoveInput {
  seq: number;
  /** -1..1 forward/back */
  f: number;
  /** -1..1 strafe right/left */
  s: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  yaw: number;
  pitch: number;
}

export interface MoveEvents {
  /** Downward speed at the moment of landing (>0) or 0. */
  landedSpeed: number;
  /** Horizontal distance travelled on ground this step (for footsteps/calories). */
  groundDist: number;
}

export function newMoveState(x: number, y: number, z: number): MoveState {
  return { x, y, z, vx: 0, vy: 0, vz: 0, onGround: false, inWater: false, crouching: false };
}

const EPS = 1e-4;

function overlapsSolid(w: BlockAccess, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
  const x0 = Math.floor(minX), x1 = Math.floor(maxX - EPS);
  const y0 = Math.floor(minY), y1 = Math.floor(maxY - EPS);
  const z0 = Math.floor(minZ), z1 = Math.floor(maxZ - EPS);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (SOLID[w.getBlock(x, y, z)]) return true;
  }
  return false;
}

export function playerHeight(s: MoveState) {
  return s.crouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
}

/** Does the player's AABB at its current position intersect solid blocks? */
export function isStuck(w: BlockAccess, s: MoveState): boolean {
  const hw = PLAYER_HALF_WIDTH;
  return overlapsSolid(w, s.x - hw, s.y, s.z - hw, s.x + hw, s.y + playerHeight(s), s.z + hw);
}

/** Move along one axis, stopping at the first solid voxel. Returns the distance actually moved. */
function sweep(w: BlockAccess, s: MoveState, axis: 0 | 1 | 2, d: number, h: number): number {
  if (d === 0) return 0;
  const hw = PLAYER_HALF_WIDTH;
  let minX = s.x - hw, maxX = s.x + hw, minY = s.y, maxY = s.y + h, minZ = s.z - hw, maxZ = s.z + hw;
  // Step in at most 0.9-block increments so fast movement cannot tunnel.
  const steps = Math.ceil(Math.abs(d) / 0.9);
  const inc = d / steps;
  let moved = 0;
  for (let i = 0; i < steps; i++) {
    if (axis === 0) {
      const nx0 = minX + inc, nx1 = maxX + inc;
      if (overlapsSolid(w, nx0, minY, minZ, nx1, maxY, maxZ)) {
        // snap to the block face
        const snap = inc > 0 ? Math.floor(nx1 - EPS) - maxX - EPS * 2 : Math.floor(nx0) + 1 - minX + EPS * 2;
        const lim = inc > 0 ? Math.max(0, Math.min(inc, snap)) : Math.min(0, Math.max(inc, snap));
        if (!overlapsSolid(w, minX + lim, minY, minZ, maxX + lim, maxY, maxZ)) moved += lim;
        return moved;
      }
      minX = nx0; maxX = nx1; moved += inc;
    } else if (axis === 1) {
      const ny0 = minY + inc, ny1 = maxY + inc;
      if (overlapsSolid(w, minX, ny0, minZ, maxX, ny1, maxZ)) {
        const snap = inc > 0 ? Math.floor(ny1 - EPS) - maxY - EPS * 2 : Math.floor(ny0) + 1 - minY;
        const lim = inc > 0 ? Math.max(0, Math.min(inc, snap)) : Math.min(0, Math.max(inc, snap));
        if (!overlapsSolid(w, minX, minY + lim, minZ, maxX, maxY + lim, maxZ)) moved += lim;
        return moved;
      }
      minY = ny0; maxY = ny1; moved += inc;
    } else {
      const nz0 = minZ + inc, nz1 = maxZ + inc;
      if (overlapsSolid(w, minX, minY, nz0, maxX, maxY, nz1)) {
        const snap = inc > 0 ? Math.floor(nz1 - EPS) - maxZ - EPS * 2 : Math.floor(nz0) + 1 - minZ + EPS * 2;
        const lim = inc > 0 ? Math.max(0, Math.min(inc, snap)) : Math.min(0, Math.max(inc, snap));
        if (!overlapsSolid(w, minX, minY, minZ + lim, maxX, maxY, maxZ + lim)) moved += lim;
        return moved;
      }
      minZ = nz0; maxZ = nz1; moved += inc;
    }
  }
  return moved;
}

function hasGroundBelow(w: BlockAccess, x: number, y: number, z: number): boolean {
  const hw = PLAYER_HALF_WIDTH;
  return overlapsSolid(w, x - hw, y - 0.05, z - hw, x + hw, y, z + hw);
}

/**
 * Advance one fixed step. Mutates `s`. `speedMul` lets the server apply
 * status effects (encumbrance, injuries) identically on both sides.
 */
export function stepMovement(s: MoveState, inp: MoveInput, w: BlockAccess, dt: number, p: MoveParams = DEFAULT_MOVE, speedMul = 1): MoveEvents {
  const ev: MoveEvents = { landedSpeed: 0, groundDist: 0 };
  // Crouch toggling: can't stand up under a ceiling.
  if (inp.crouch) s.crouching = true;
  else if (s.crouching) {
    const hw = PLAYER_HALF_WIDTH;
    if (!overlapsSolid(w, s.x - hw, s.y, s.z - hw, s.x + hw, s.y + PLAYER_HEIGHT, s.z + hw)) s.crouching = false;
  }
  const h = playerHeight(s);

  // Water: sample at waist height.
  const waist = w.getBlock(Math.floor(s.x), Math.floor(s.y + 0.6), Math.floor(s.z));
  const feet = w.getBlock(Math.floor(s.x), Math.floor(s.y + 0.1), Math.floor(s.z));
  s.inWater = LIQUID[waist] === 1;
  const feetWet = LIQUID[feet] === 1;

  // Desired horizontal velocity.
  let f = Math.max(-1, Math.min(1, inp.f || 0));
  let st = Math.max(-1, Math.min(1, inp.s || 0));
  const len = Math.hypot(f, st);
  if (len > 1) { f /= len; st /= len; }
  let speed = s.inWater ? p.swimSpeed : s.crouching ? p.crouchSpeed : inp.sprint && f > 0 ? p.sprintSpeed : p.walkSpeed;
  speed *= speedMul;
  const sy = Math.sin(inp.yaw), cy = Math.cos(inp.yaw);
  // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
  const tvx = (-sy * f + cy * st) * speed;
  const tvz = (-cy * f - sy * st) * speed;
  const accel = s.onGround || s.inWater ? p.groundAccel : p.airAccel;
  const k = Math.min(1, accel * dt);
  s.vx += (tvx - s.vx) * k;
  s.vz += (tvz - s.vz) * k;

  // Vertical.
  if (s.inWater) {
    s.vy -= p.gravity * 0.25 * dt;
    if (inp.jump) s.vy = Math.min(s.vy + 30 * dt, 3.2);
    s.vy *= Math.max(0, 1 - 2.5 * dt);
    if (s.vy < -4) s.vy = -4;
  } else {
    if (inp.jump && s.onGround) {
      s.vy = p.jumpVelocity;
      s.onGround = false;
    } else if (inp.jump && feetWet && s.vy <= 1) {
      // climb out of water onto a ledge
      s.vy = p.jumpVelocity * 0.75;
    }
    s.vy -= p.gravity * dt;
    if (s.vy < -p.terminalVelocity) s.vy = -p.terminalVelocity;
  }

  const wasOnGround = s.onGround;
  const preVy = s.vy;

  // Y first (so we land before sliding), then X, Z.
  const dy = s.vy * dt;
  const movedY = sweep(w, s, 1, dy, h);
  s.y += movedY;
  if (Math.abs(movedY - dy) > 1e-7) {
    if (dy < 0) {
      if (!wasOnGround && preVy < 0) ev.landedSpeed = -preVy;
      s.onGround = true;
    }
    s.vy = 0;
  } else {
    s.onGround = dy <= 0 && hasGroundBelow(w, s.x, s.y, s.z);
    if (s.onGround && !wasOnGround && preVy < 0) ev.landedSpeed = -preVy;
    if (s.onGround && s.vy < 0) s.vy = 0;
  }

  const dx = s.vx * dt;
  const mx = sweep(w, s, 0, dx, h);
  if (s.crouching && s.onGround && !hasGroundBelow(w, s.x + mx, s.y, s.z)) {
    s.vx = 0; // sneak edge protection
  } else {
    s.x += mx;
    if (Math.abs(mx - dx) > 1e-7) s.vx = 0;
  }
  const dz = s.vz * dt;
  const mz = sweep(w, s, 2, dz, h);
  if (s.crouching && s.onGround && !hasGroundBelow(w, s.x, s.y, s.z + mz)) {
    s.vz = 0;
  } else {
    s.z += mz;
    if (Math.abs(mz - dz) > 1e-7) s.vz = 0;
  }
  if (s.onGround) ev.groundDist = Math.hypot(mx, mz);
  return ev;
}

/** Fall damage from landing speed (blocks/s). ~4 block fall is free. */
export function fallDamage(landedSpeed: number): number {
  const SAFE = 15.5;
  if (landedSpeed <= SAFE) return 0;
  return Math.round((landedSpeed - SAFE) * 7);
}
