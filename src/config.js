// Central tuning values. Gameplay feel lives here so it can be adjusted in one place.
export const CONFIG = {
  time: {
    startMinutes: 6 * 60,            // first day starts at 06:00
    minutesPerSecond: { slow: 1.0, normal: 1.5, fast: 3.0 },
    sleepMultiplier: 30,             // clock speed-up while the player sleeps
  },
  move: {
    walkSpeed: 1.7,
    runSpeed: 4.3,                   // default locomotion (analog stick scales this)
    sprintSpeed: 6.4,
    strafeSpeed: 3.4,                // while locked on
    carryHeavyMult: 0.78,
    accel: 16,                       // exponential approach rate when speeding up
    decel: 22,                       // when stopping: crisp, little sliding
    turnRate: 16,                    // facing smoothing (rad/s-ish lambda)
    pivotTurnRate: 26,               // sharp reversals turn faster
    radius: 0.34,
    playerPushWeight: 0.25,          // player is hard to shove around in crowds
  },
  stamina: { max: 100, regen: 22, regenDelay: 0.7, sprintCost: 9, dodgeCost: 16, blockHitCost: 10, exhaustedThreshold: 12 },
  combat: {
    magnetRange: 3.0,                // attacks steer toward an opponent in this radius
    magnetAngle: 70 * Math.PI / 180,
    lungeMax: 0.75,                  // max distance an attack closes toward the target
    blockArc: 120 * Math.PI / 180,
    blockReduction: 0.82,
    poiseMax: 100, poiseRegen: 28,
    knockdownTime: [1.1, 2.4],       // lying time range (toughness shortens it)
    getUpInvuln: 0.45,
    koMinutes: 45,                   // game minutes unconscious
    grabRange: 1.25,
    grappleMaxTime: 3.2,
    bufferWindow: 0.28,              // input buffering for chained actions
  },
  interact: {
    radius: 2.4,                     // candidates considered around the player
    reach: 1.35,                     // act immediately inside this distance
    approachMax: 3.2,                // short assisted approach up to this distance
    talkReach: 2.6,
    hysteresis: 0.12,
  },
  needs: {
    hungerPerHour: 4.2,              // fullness lost per game hour
    energyPerHour: 3.6,              // energy lost per waking game hour
    sleepEnergyPerHour: 14,
  },
  camera: {
    distance: 4.3, minDistance: 1.6, maxDistance: 7.5,
    height: 1.55, pitch: 0.32, minPitch: -0.35, maxPitch: 1.1,
    fov: 0.95, sensitivity: 0.0026,
  },
  ai: { thinkInterval: 0.25, perceptionInterval: 0.3 },
  population: { inmates: 30, guards: 8 },
};
