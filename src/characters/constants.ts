// Character tuning constants. Source of truth: docs/DESIGN.md §1 (freefall/parachute) and §3 (movement).
// Keep gameplay numbers here so they can be tuned in one place and unit-tested.

export const GRAVITY = 9.81;

/** Collider capsule. */
export const CAPSULE_RADIUS = 0.35;
export const PRONE_RADIUS = 0.3;
export const STANCE_HEIGHT = { stand: 1.8, crouch: 1.25, prone: 0.6 } as const;
/** Knocked (DBNO) characters kneel/crawl with this collider height. */
export const KNOCKED_HEIGHT = 1.0;
/** Prone body length along the facing direction (horizontal capsule). */
export const PRONE_LENGTH = 1.8;

/** Eye heights above the feet per stance (prone eye is also offset forward). */
export const EYE_HEIGHT = { stand: 1.62, crouch: 1.12, prone: 0.34 } as const;
export const PRONE_EYE_FORWARD = 0.62;
export const KNOCKED_EYE_HEIGHT = 0.85;

/** Movement speeds (m/s). */
export const SPEED = {
  walk: 1.9,
  run: 4.7,
  sprint: 6.3,
  crouchWalk: 1.6,
  crouchRun: 3.0,
  crouchSprint: 4.5,
  prone: 1.2,
  proneWalk: 0.8,
  swim: 2.8,
  swimFast: 4.2,
  swimDiveVertical: 1.6,
  knocked: 0.9,
  /** Healing items that allow walking (bandage/drinks/painkiller): walk speed cap. */
  healWalk: 1.9,
  /** First aid / med kit: slow walk only. */
  healSlow: 1.0,
} as const;

export const SPEED_MULT = {
  back: 0.65,
  strafe: 0.85,
  aim: 0.65,
  firing: 0.85,
  weaponHeld: 0.97,
  lmgHeld: 0.92,
  boost60: 1.025,
  boost90: 1.062,
} as const;

/** Ground acceleration / deceleration (m/s²). DESIGN says ~10 / 14; 12 gives ≈0.4 s to run speed. */
export const ACCEL = 12;
export const DECEL = 14;
/** Air control acceleration (m/s²). */
export const AIR_ACCEL = 2.5;
export const SWIM_ACCEL = 4;

/** Jump: 0.55 m apex. */
export const JUMP_HEIGHT = 0.55;
/**
 * Take-off speed reaching `h` with the fixed-tick integration GroundMotor uses (v -= g·dt, then y += v·dt), whose
 * apex is v²/2g − v·dt/2 + g·dt²/8 — the continuous √(2gh) peaks ~2.7 cm short at 60 Hz.
 */
export function jumpVelocityFor(h: number, dt = 1 / 60, g = GRAVITY): number {
  const a = 1 / (2 * g), b = -dt / 2, c = -(h - (g * dt * dt) / 8);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}
export const JUMP_VELOCITY = jumpVelocityFor(JUMP_HEIGHT);
/** Grace windows for jump input. */
export const COYOTE_TIME = 0.12;
export const JUMP_BUFFER = 0.12;

/** Stance transition durations (s). */
export const STANCE_TIME = {
  standCrouch: 0.3,
  crouchProne: 0.9,
  standProne: 0.9,
} as const;
/** Max ground slope (deg) where prone is allowed. */
export const PRONE_MAX_SLOPE_DEG = 35;
/**
 * Prone: max view yaw away from the body (rad). The body turns toward the view at a limited rate and can be
 * blocked by walls; the view (and so the shot direction) may lead it by at most this much, which keeps
 * bullets inside the arc the animated weapon can actually point (the spine aim offset is clamped at 1.4).
 */
export const PRONE_VIEW_YAW_LIMIT = 70 * (Math.PI / 180);
/** Ground steeper than this (deg) is not standable: characters slide off it (KCC climb limit is 50°). */
export const STEEP_SLOPE_DEG = 52;

/** KCC tuning. */
export const KCC = {
  offset: 0.02,
  maxSlopeClimbDeg: 50,
  minSlopeSlideDeg: 52,
  autostepHeight: 0.45,
  autostepMinWidth: 0.15,
  snapToGround: 0.45,
} as const;

/** Lean. */
export const LEAN_OFFSET = 0.35;
export const LEAN_TIME = 0.22;
export const LEAN_ROLL_DEG = 18;

/** Vault / climb (DESIGN §3). */
export const VAULT = {
  minHeight: 0.45,
  maxHeight: 1.1,
  maxThickness: 1.0,
  climbMaxHeight: 2.1,
  probeDistance: 0.95,
  vaultDuration: 0.62,
  climbDuration: 1.2,
  lowClimbDuration: 0.75,
} as const;

/** Fall damage: starts at impact speed > 9 m/s, dmg = (v-9)*10. */
export const FALL_DAMAGE_MIN_SPEED = 9;
export const FALL_DAMAGE_PER_MPS = 10;

/** Vehicle exit at speed (our design choice): dmg = (v - 8.3) * 4.5 for v in m/s. */
export const VEHICLE_EXIT_SAFE_SPEED = 8.3;
export const VEHICLE_EXIT_DMG_PER_MPS = 4.5;

/** Swimming. */
export const SWIM = {
  /** Enter swim when the water surface is this far above the feet. */
  enterDepth: 1.3,
  /** Leave swim (stand up) when the ground is less than this below the surface. */
  exitDepth: 1.15,
  /** Feet below the surface while floating at the surface (head above water). */
  floatDepth: 1.42,
  breathSeconds: 15,
  drownDps: 10,
  /** Head counts as underwater when the eye is this far below the surface. */
  eyeUnderwater: 0.05,
} as const;

/** Freefall / parachute (DESIGN §1). */
export const SKYDIVE = {
  freefallVertical: 45,
  freefallGlideForward: 25,
  diveVertical: 65,
  diveForward: 12,
  freefallNeutralForward: 6,
  freefallBrakeVertical: 40,
  freefallStrafe: 10,
  freefallAccel: 14,
  freefallTurnRate: 2.6, // rad/s body yaw follow
  autoDeployAgl: 120,
  /** Seconds of freefall before a manual deploy is allowed. */
  minFreefallBeforeDeploy: 0.5,
  chuteOpenTime: 1.6,
  chuteNeutralForward: 8,
  chuteNeutralDescent: 5.5,
  chuteForward: 14,
  chuteForwardDescent: 7,
  chuteBrakeForward: 3,
  chuteBrakeDescent: 4.5,
  chuteStrafe: 4,
  chuteAccel: 4,
  chuteTurnRate: 1.1,
} as const;

/** Footstep cadence: meters per step for each gait (steps sync with the animation cadence). */
export const STEP_LENGTH = {
  // half of each locomotion clip's metres-per-cycle (walk_f 1.49, jog/run ~2.3–3.1, sprint 3.1, crouch ~2.2,
  // crawl 1.1) so step events line up with the animation cadence
  walk: 0.75,
  run: 1.4,
  sprint: 1.55,
  crouch: 1.0,
  prone: 0.55,
  swim: 1.4,
  knocked: 0.5,
} as const;

/** AI hearing radii (DESIGN §8). */
export const FOOTSTEP_NOISE = {
  sprint: 35,
  run: 22,
  walk: 8,
  crouch: 6,
  prone: 4,
  swim: 15,
  land: 25,
  jump: 10,
} as const;

/** Vehicle seated: hips → feet offset (character feet are this far below the seat hips point). */
export const SEATED_HIP_HEIGHT = 0.5;
