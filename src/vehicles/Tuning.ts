/**
 * Global handling knobs for the raycast vehicle. Per-car numbers live in
 * data/cars.ts; these are multipliers / feel constants shared by every car and
 * exposed to the debug panel (backquote) for live tuning.
 */
import { Debug } from "../core/Debug";

export const Tuning = {
  /** Suspension spring multiplier on def.suspensionStiffness (per unit mass per wheel). */
  stiffness: 1.25,
  /** Damper multiplier on def.suspensionDamping. */
  damping: 1.1,
  /** Extra progressive spring in the last part of the travel (bump stop). */
  bumpStop: 6,
  /** Tire friction coefficient (multiplied by car/upgrade grip). */
  grip: 1.25,
  /** 0..1 fraction of lateral slip velocity killed per step (before the grip clamp). */
  lateralStiffness: 0.55,
  /** Grip left on the rear wheels while the handbrake is held. */
  handbrakeGrip: 0.35,
  /** Max steering angle at standstill / minimum at any speed (radians). */
  steerLow: 0.6,
  steerHigh: 0.07,
  /** Steering lock at speed asks for this multiple of the tires' lateral grip. */
  steerGripRatio: 1.7,
  /** Steering input slew rates (1/s). */
  steerRate: 5,
  steerReturn: 8,
  /** Yaw-rate assist toward the steering-implied rate (1/s). */
  yawStability: 2.2,
  /** Anti-roll bar strength (fraction of spring rate). */
  antiRoll: 0.6,
  /** 0..1: how far tire forces are lifted from the contact point toward the COM (less body roll). */
  forceLift: 0.72,
  /** Downforce as a fraction of weight at top speed. */
  downforce: 0.35,
  /** Engine force multiplier. */
  power: 1,
  /** Brake deceleration (m/s^2 at full pedal). */
  brakeDecel: 11,
  /** Reverse top speed (m/s) and power fraction. */
  reverseSpeed: 11,
  reversePower: 0.55,
  /** Rolling resistance + engine braking deceleration when coasting (m/s^2). */
  coastDecel: 1.1,
  /** Quadratic air drag coefficient (per unit mass). */
  airDrag: 0.0009,
  /** Air control: target rotation rate (rad/s) and response gain (1/s). */
  airPitchRate: 2.6,
  airRollRate: 3.2,
  airGain: 3.0,
  /** Nose-up attitude held while W (throttle) is pressed in the air (rad). */
  airNoseUp: 0.45,
  /** Lean held while steering in the air (rad). */
  airLean: 0.4,
  /** Attitude-hold stiffness in the air (1/s). */
  airLevel: 2.2,
  /** 0..1 strength of the auto-leveling just before touchdown. */
  landingAssist: 1,
  /** Air yaw damping (1/s). */
  airYawDamp: 1.6,
  /** Inertia multiplier vs. a solid box (bigger = calmer). */
  inertia: 1.35,
  /** Impact speed (m/s) below which hits deal no damage. */
  damageThreshold: 7,
  /** Damage multiplier for (v - threshold)^1.5. */
  damageScale: 1.0,
};

let registered = false;

/** Register sliders once (Debug.reset clears them between runs, so call per Vehicle). */
export function registerTuning(): void {
  void registered;
  registered = true;
  const t = Tuning as unknown as Record<string, number>;
  Debug.tune("car: spring", t, "stiffness", 0.3, 3, 0.05);
  Debug.tune("car: damper", t, "damping", 0.3, 3, 0.05);
  Debug.tune("car: grip", t, "grip", 0.3, 3, 0.05);
  Debug.tune("car: lat stiff", t, "lateralStiffness", 0.1, 1, 0.05);
  Debug.tune("car: handbrake grip", t, "handbrakeGrip", 0, 1, 0.05);
  Debug.tune("car: steer low", t, "steerLow", 0.1, 1, 0.02);
  Debug.tune("car: steer min", t, "steerHigh", 0.02, 0.6, 0.01);
  Debug.tune("car: steer grip ratio", t, "steerGripRatio", 0.5, 4, 0.05);
  Debug.tune("car: yaw stability", t, "yawStability", 0, 8, 0.1);
  Debug.tune("car: anti-roll", t, "antiRoll", 0, 2, 0.05);
  Debug.tune("car: force lift", t, "forceLift", 0, 1, 0.02);
  Debug.tune("car: downforce", t, "downforce", 0, 1.5, 0.05);
  Debug.tune("car: power", t, "power", 0.2, 3, 0.05);
  Debug.tune("car: brake", t, "brakeDecel", 2, 25, 0.5);
  Debug.tune("car: air pitch", t, "airPitchRate", 0, 8, 0.1);
  Debug.tune("car: air roll", t, "airRollRate", 0, 8, 0.1);
  Debug.tune("car: air gain", t, "airGain", 0, 12, 0.1);
  Debug.tune("car: air level", t, "airLevel", 0, 6, 0.1);
  Debug.tune("car: air nose-up", t, "airNoseUp", 0, 1.5, 0.05);
  Debug.tune("car: landing assist", t, "landingAssist", 0, 1, 0.05);
  Debug.tune("car: inertia", t, "inertia", 0.5, 3, 0.05);
  Debug.tune("car: dmg scale", t, "damageScale", 0, 4, 0.05);
}
