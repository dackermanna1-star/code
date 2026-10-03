/**
 * Animation state shared by all mob animators + small helpers (springs, gait, look).
 * Rotation conventions on joints (ZYX Euler, rest space: +Y up, front = -Z, mob's right = +X):
 *   +x swings a hanging limb FORWARD / pitches the head UP;
 *   +y turns toward the mob's LEFT (same sign as entity yaw);
 *   +z rolls a hanging limb toward +X (the mob's right).
 */
import type { Rig } from '../rig';

export interface AnimState {
  /** Seconds (continuous), for idle motion. */
  time: number;
  /** Walk cycle driver (distance based) and amount (0..1). */
  limbSwing: number;
  limbAmount: number;
  /** Horizontal speed (b/s). */
  speed: number;
  /** Head yaw relative to the body (+ = left) and pitch (+ = up), radians. */
  headYaw: number;
  headPitch: number;
  /** Attack swing progress 0..1, or -1. */
  attack: number;
  onGround: boolean;
  inWater: boolean;
  aggressive: boolean;
  /** 0..1 hurt flinch amount and impulse direction in model space (x right, z back). */
  hurt: number;
  impactX: number;
  impactZ: number;
  /** Vertical velocity (b/s). */
  vy: number;
  /** Body yaw rate (rad/s, + = turning left). */
  turnRate: number;
  baby: boolean;
  /** Per-mob extras (creeper swell, sheep eating, enderman carrying ...). */
  [k: string]: any;
}

export function newAnimState(): AnimState {
  return { time: 0, limbSwing: 0, limbAmount: 0, speed: 0, headYaw: 0, headPitch: 0, attack: -1, onGround: true, inWater: false, aggressive: false, hurt: 0, impactX: 0, impactZ: 0, vy: 0, turnRate: 0, baby: false };
}

export type Animator = (rig: Rig, st: AnimState, dt: number, mem: Record<string, any>) => void;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const sstep = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Critically damped-ish spring toward target (per-instance state in mem[key]). */
export function spring(mem: Record<string, any>, key: string, target: number, dt: number, freq = 8, damp = 0.6): number {
  let s = mem[key] as { x: number; v: number } | undefined;
  if (!s) mem[key] = s = { x: target, v: 0 };
  const w = freq * Math.PI * 2;
  const k = w * w, c = 2 * damp * w;
  const h = Math.min(dt, 1 / 30);
  const steps = Math.max(1, Math.ceil(dt / h));
  const sd = dt / steps;
  for (let i = 0; i < steps; i++) {
    const a = k * (target - s.x) - c * s.v;
    s.v += a * sd;
    s.x += s.v * sd;
  }
  return s.x;
}

/** Exponential smoothing toward a target. */
export function follow(mem: Record<string, any>, key: string, target: number, dt: number, rate = 10): number {
  const cur = mem[key] ?? target;
  const v = cur + (target - cur) * (1 - Math.exp(-rate * dt));
  mem[key] = v;
  return v;
}

/** Head look with limits, applied to a head bone (relative to its parent). */
export function look(rig: Rig, bone: string, yaw: number, pitch: number, maxYaw = 1.3, minPitch = -0.7, maxPitch = 0.75, extraX = 0, extraY = 0, extraZ = 0) {
  if (!rig.has(bone)) return;
  rig.bone(bone).rot(clamp(pitch, minPitch, maxPitch) + extraX, clamp(yaw, -maxYaw, maxYaw) + extraY, extraZ);
}

/** Minecraft-like arm bob (idle sway). */
export function armBob(t: number, side: number): [number, number] {
  return [Math.sin(t * 1.34 + side) * 0.04, (Math.cos(t * 1.8 + side) * 0.04 + 0.05) * side];
}
