import * as THREE from 'three';

// =============================================================================
// FLIGHT STATE CONTRACT.  The flight director owns and mutates this object every
// frame (priority 10).  Every other module only READS it (app.flight.state).
// World-frame vectors use the world frame of core/constants.js.
// =============================================================================

/** Ordered phases of the journey. `label` is user-facing; `weight` is used by the progress bar. */
export const PHASES = [
  { id: 'gate', label: 'At the gate', weight: 0.08 },
  { id: 'pushback', label: 'Pushback', weight: 0.04 },
  { id: 'taxi_out', label: 'Taxi', weight: 0.08 },
  { id: 'lineup', label: 'Line up', weight: 0.02 },
  { id: 'takeoff', label: 'Takeoff', weight: 0.03 },      // roll + rotation + initial climb to 400 ft
  { id: 'climb', label: 'Climb', weight: 0.12 },
  { id: 'cruise', label: 'Cruise', weight: 0.33 },
  { id: 'descent', label: 'Descent', weight: 0.12 },
  { id: 'approach', label: 'Approach', weight: 0.08 },    // final approach from ~3000 ft down to the flare
  { id: 'landing', label: 'Landing', weight: 0.03 },      // flare, touchdown, rollout to taxi speed
  { id: 'taxi_in', label: 'Taxi to gate', weight: 0.05 },
  { id: 'arrived', label: 'Arrived', weight: 0.02 },
];
export const PHASE_IDS = PHASES.map((p) => p.id);
export function phaseIndex(id) { return PHASE_IDS.indexOf(id); }

export function createFlightState() {
  return {
    // --- journey -----------------------------------------------------------
    phase: 'gate',
    phaseIndex: 0,
    phaseTime: 0,             // seconds since the phase started
    phaseProgress: 0,         // 0..1 within the phase (best estimate)
    missionProgress: 0,       // 0..1 overall, for the progress bar
    simTime: 0,               // seconds since the flight (re)started
    region: 'departure',      // 'departure' | 'enroute' | 'arrival' : which airport/terrain region matters

    // --- pose (world frame, metres / radians) --------------------------------
    position: new THREE.Vector3(),          // aircraft origin (floor centreline, wing quarter-chord)
    quaternion: new THREE.Quaternion(),     // attitude (aircraft-local -> world)
    velocity: new THREE.Vector3(),          // m/s world
    acceleration: new THREE.Vector3(),      // m/s² world (excluding gravity)
    angularVelocity: new THREE.Vector3(),   // rad/s in aircraft-local axes (x = pitch rate, y = yaw rate, z = roll rate)
    heading: 0,               // compass degrees (0 = north)
    pitch: 0,                 // radians, nose up positive
    roll: 0,                  // radians, right wing down positive
    // felt specific force in aircraft-local axes, in g (x lateral, y vertical, z longitudinal; 1g level = (0,1,0))
    gForce: new THREE.Vector3(0, 1, 0),

    // --- air data ------------------------------------------------------------
    altitude: 0,              // metres MSL (aircraft origin)
    altitudeAGL: 0,           // metres above ground/runway (wheels ~ origin - groundHeight)
    airspeed: 0,              // m/s indicated-ish
    groundSpeed: 0,           // m/s
    verticalSpeed: 0,         // m/s
    mach: 0,
    outsideTempC: 15,
    windDir: 250, windSpeed: 6,   // degrees / m/s (for the IFE map)

    // --- configuration ------------------------------------------------------
    onGround: true,
    gear: 1,                  // 0 = up & locked, 1 = down & locked (animated in between)
    gearDoorsOpen: 0,         // 0..1
    flaps: 0,                 // 0..1 normalised (0, 1, 5, 15, 25, 30, 40 deg detents)
    flapsDeg: 0,
    slats: 0,                 // 0..1 (leading-edge devices)
    spoilers: 0,              // 0..1 ground spoilers / speedbrake deployment
    speedbrakeArmed: false,
    aileron: 0,               // -1..1 (right aileron up positive)
    elevator: 0, rudder: 0,
    reverser: 0,              // 0..1 thrust-reverser sleeve translation
    brakes: 0,                // 0..1
    nosewheelSteer: 0,        // radians
    wheelRpm: 0,              // main wheel revolutions per minute
    engines: [
      { running: false, n1: 0, n2: 0, egt: 0, starting: false, fuelFlow: 0 },
      { running: false, n1: 0, n2: 0, egt: 0, starting: false, fuelFlow: 0 },
    ],
    apuRunning: true,
    thrust: 0,                // 0..1 commanded thrust lever (for sound pitch)

    // --- exterior lights -----------------------------------------------------
    lights: { beacon: false, strobe: false, nav: true, landing: false, taxi: false, logo: true, wing: false, runwayTurnoff: false },

    // --- cabin ---------------------------------------------------------------
    cabin: {
      seatbelt: true,         // fasten seatbelt sign
      noSmoking: true,
      lightsMode: 'boarding', // 'boarding' | 'bright' | 'dim' | 'night' | 'cruise'
      lightLevel: 1.0,        // 0..1 master level for cabin ceiling/sidewall wash
      moodColor: new THREE.Color('#fff4e6'),
      doorsArmed: false,
      doorsClosed: false,
      bridgeConnected: true,
      boardingMusic: true,
      announcement: null,     // id of the announcement currently playing, if any
    },

    // --- feel --------------------------------------------------------------
    vibration: 0.05,          // 0..1 overall airframe vibration level (camera shake / rattle)
    runwayRumble: 0,          // 0..1 rolling on pavement (strength)
    turbulence: 0,            // 0..1 current turbulence intensity
    inCloud: 0,               // 0..1 (provided by the clouds module via app.clouds.densityAtAircraft)
    buffet: 0,                // 0..1 (speedbrake / gear buffet)

    // --- journey info (for the IFE map / HUD) ---------------------------------
    origin: { code: 'CBY', name: 'Cedar Bay International', city: 'Cedar Bay' },
    destination: { code: 'PSX', name: 'Port Solano International', city: 'Port Solano' },
    routeProgress: 0,         // 0..1 along the (compressed) great-circle route
    routeDistanceKm: 1480,    // nominal route length shown in the IFE
    distanceFlownKm: 0,
    distanceToGoKm: 1480,
    timeToGoSec: 3 * 3600,    // estimated (presented) time remaining
    localTimeOrigin: 16.5,    // hours (decimal) at origin
    localTimeDestination: 17.5,
    timeOfDay: 16.5,          // hours (decimal) driving the sun position
    mapLat: 37.6, mapLon: -122.4,   // fictional map coordinates for the IFE moving map
  };
}
