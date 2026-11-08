import * as THREE from 'three';

// =============================================================================
// TRIP STATE CONTRACT. The trip director (src/bus/trip/) owns and mutates this
// object every frame (priority 10); every other module only READS it, except
// `inCloud` (clouds module) and `weather.*` (weather module, see below).
//
// It is exposed as app.trip.state AND app.flight.state (the reused world
// modules — environment, clouds, city — read app.flight.state.position /
// quaternion / timeOfDay / windDir / windSpeed / velocity / heading / altitude).
// World-frame vectors use the world frame (x east, z south, y up).
// =============================================================================

export const PHASES = [
  { id: 'boarding', label: 'Boarding at Cedar Bay Central', weight: 0.05 },
  { id: 'town', label: 'Through Cedar Bay', weight: 0.05 },
  { id: 'highway', label: 'Highway 9', weight: 0.18 },
  { id: 'foothills', label: 'Ridgefield & the foothills', weight: 0.07 },
  { id: 'mountain', label: 'Climbing the Hollow Pass', weight: 0.12 },
  { id: 'reststop', label: 'Hollow Pass rest stop', weight: 0.07 },
  { id: 'valley', label: 'Down the Hollow valley', weight: 0.14 },
  { id: 'coast', label: 'The coast road', weight: 0.2 },
  { id: 'city', label: 'Into Port Solano', weight: 0.08 },
  { id: 'arrived', label: 'Arrived at Port Solano Central', weight: 0.04 },
];
export const PHASE_IDS = PHASES.map((p) => p.id);

export function createTripState() {
  return {
    // --- journey -------------------------------------------------------------
    phase: 'boarding', phaseIndex: 0, phaseTime: 0, phaseProgress: 0,
    missionProgress: 0, routeProgress: 0, simTime: 0,
    s: 0,                    // distance along the route (m)
    lat: 1.75,               // lateral offset of the bus centreline from the road centreline (+ = right)
    lane: 0,                 // 0 = our innermost lane
    segment: 'town',         // route segment type (ROAD_TYPES key)
    speedLimitKmh: 30,
    structure: null,         // { type: 'tunnel'|'bridge', name, s0, s1 } or null
    inTunnel: 0,             // 0..1 (smoothed, for light/audio)
    onBridge: false,
    nextStop: null,          // { id, name, kind, s, distance }
    atStop: null,            // stop id while stopped at a stop
    distanceToGoKm: 117, timeToGoSec: 6600,
    origin: { name: 'Cedar Bay Central', code: 'CBY' },
    destination: { name: 'Port Solano Central', code: 'PSX' },
    timeOfDay: 16.75,        // hours (drives the sun; ~sunset during the coast road)
    clock: 16.75,            // civil clock shown on screens

    // --- pose (world) — compatibility with the flight-sim world modules --------
    position: new THREE.Vector3(),     // bus origin (deck floor centreline, mid-length) in WORLD space
    quaternion: new THREE.Quaternion(),// body attitude (includes suspension pitch/roll)
    velocity: new THREE.Vector3(),
    acceleration: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(), // rad/s, bus axes (x pitch, y yaw, z roll)
    heading: 0, pitch: 0, roll: 0,
    altitude: 0, altitudeAGL: 1.32, verticalSpeed: 0,
    groundSpeed: 0, airspeed: 0,
    onGround: true, inCloud: 0,
    windDir: 260, windSpeed: 5,
    gForce: new THREE.Vector3(0, 1, 0),   // felt specific force in bus axes, g (x right, y up, z backward... + = pushed back)

    // --- vehicle -------------------------------------------------------------
    speed: 0,                // m/s along the road (signed; < 0 reversing)
    accel: 0,                // m/s² longitudinal
    latAccel: 0,             // m/s² lateral (+ = to the right)
    yawRate: 0,              // rad/s
    steer: 0,                // front road-wheel angle, rad (+ = right)
    steeringWheel: 0,        // steering-wheel angle, rad (≈ 18:1 ratio)
    throttle: 0, brake: 0, retarder: 0, parkingBrake: true,
    gear: 'N',               // 'R' | 'N' | 'D' (selector)  — see gearIndex for the ratio in use
    gearIndex: 0,            // 1..6 automatic gear in use, 0 = neutral
    shifting: 0,             // 0..1 during a gear change (torque dip)
    rpm: 650, engineLoad: 0, engineRunning: true, turbo: 0, fanClutch: 0,
    airPressure: 8.5,        // bar (compressor cycles; air-dryer purge sound when topped up)
    odometerKm: 412_876,
    fuel: 0.72,

    // body / chassis
    suspension: { pitch: 0, roll: 0, heave: 0 },   // body motion on the air springs (rad, rad, m)
    kneel: 0,                // 0 = ride height, 1 = knelt (right side lowered for boarding)
    wheelRpm: 0,
    surface: 'asphalt',      // 'asphalt' | 'concrete' | 'cobbles' | 'gravel' | 'bridgeJoint' | 'paint'
    roughness: 0.2,          // 0..1 current road roughness
    vibration: 0.05,         // 0..1 overall vibration level (engine + road)
    roadRumble: 0,           // 0..1
    bump: 0,                 // impulse (decays) from potholes / joints / kerbs

    // doors & equipment
    doors: { front: 1, mid: 0 },          // 0 closed .. 1 open
    lights: { low: false, high: false, fog: false, drl: true, indicatorL: false, indicatorR: false, hazard: false, brake: false, reverse: false, marker: false },
    indicatorPhase: false,   // true while the indicator lamps are lit (blink)
    wipers: 0,               // 0 off, 1 intermittent, 2 normal, 3 fast
    wiperAngle: 0,           // radians of the blade sweep (0 = parked)
    horn: false,

    // cabin
    cabin: {
      lightsMode: 'day',     // 'boarding' | 'day' | 'night' | 'dim' | 'off'
      lightLevel: 1,
      seatbeltSign: true,
      stopRequested: false,
      toiletOccupied: false,
      announcement: null,
      music: false,          // driver's radio / boarding music
      acTarget: 21,
    },

    // weather (WRITTEN by the weather module, read by everyone)
    weather: { rain: 0, wetness: 0, fog: 0, cloudCover: 0.3, windGust: 0 },

    driverMode: 'auto',      // 'auto' (the driver drives) | 'manual' (the player drives)
    playerAboard: true,      // false while the player walks around outside at a stop
  };
}
