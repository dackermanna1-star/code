// Geometric contract shared by the simulation and the procedural models.
//
// Units are meters and radians. Model space: +Y up, +Z forward, +X is the
// vehicle's LEFT side (right-handed, so right = -X).
//
// Ground vehicles: origin sits on the ground plane at the centre of the
//   footprint. `turretPivot` is relative to the hull origin, `gunPivot` is
//   relative to the turret pivot. The gun points along +Z of its own space;
//   the muzzle is at (0, 0, barrelLength) in gun space. Gun elevation `e`
//   (positive = barrel up) is applied as gun.rotation.x = -e. Turret yaw is
//   rotation.y about the turret pivot.
// Aircraft: origin at the centre of the airframe (roughly centre of mass).
//
// Every array is [x, y, z].

export const VEHICLE_SPECS = {
  // Main battle tank (Abrams/Leopard class vs T-90 class silhouettes).
  mbt: {
    kind: 'tracked',
    length: 7.9, width: 3.66, height: 2.45, hullHeight: 1.72,
    turretPivot: [0, 1.72, -0.35],
    gunPivot: [0, 0.42, 1.55],
    barrelLength: 5.3, gunRadius: 0.08,
    coaxOffset: [0.42, 0.0, 0.55],      // coaxial MG muzzle, gun space
    roofMgPivot: [-0.65, 0.95, -0.4],    // commander's MG, turret space
    smokeLaunchers: [[0.95, 0.55, 1.1], [-0.95, 0.55, 1.1]], // turret space
    exhaust: [0, 1.1, -3.95],
    tracks: { width: 0.64, offsetX: 1.5, wheels: 7 },
  },
  // Infantry fighting vehicle (Bradley/CV90 class vs BMP class).
  ifv: {
    kind: 'tracked',
    length: 6.6, width: 3.3, height: 2.95, hullHeight: 2.05,
    turretPivot: [0, 2.05, 0.35],
    gunPivot: [0, 0.38, 0.85],
    barrelLength: 2.75, gunRadius: 0.045,
    coaxOffset: [0.3, 0.0, 0.3],
    atgmLauncher: [0.95, 0.45, -0.1],    // turret space, launch tube front
    smokeLaunchers: [[0.8, 0.4, 0.7], [-0.8, 0.4, 0.7]],
    exhaust: [1.2, 1.6, 1.8],
    dismount: [0, 0.6, -3.6],            // rear ramp exit, hull space
    capacity: 7,
    tracks: { width: 0.5, offsetX: 1.4, wheels: 6 },
  },
  // Wheeled 8x8 armored personnel carrier (Stryker/Boxer class vs BTR class).
  apc: {
    kind: 'wheeled',
    length: 7.4, width: 2.9, height: 2.75, hullHeight: 2.2,
    turretPivot: [0, 2.2, 0.9],           // remote weapon station
    gunPivot: [0, 0.32, 0.15],
    barrelLength: 1.65, gunRadius: 0.03,
    smokeLaunchers: [[0.5, 0.3, 0.2], [-0.5, 0.3, 0.2]],
    exhaust: [-1.3, 1.7, 1.2],
    dismount: [0, 0.6, -3.9],
    capacity: 9,
    wheels: { count: 8, radius: 0.6, offsetX: 1.25, positionsZ: [2.3, 0.9, -0.9, -2.3] },
  },
  // 4x4 armored scout car with heavy MG (MRAP/JLTV class vs Tigr class).
  scout: {
    kind: 'wheeled',
    length: 5.5, width: 2.45, height: 2.65, hullHeight: 2.15,
    turretPivot: [0, 2.15, -0.35],
    gunPivot: [0, 0.38, 0.1],
    barrelLength: 1.45, gunRadius: 0.025,
    exhaust: [-1.0, 0.6, -2.5],
    wheels: { count: 4, radius: 0.55, offsetX: 1.0, positionsZ: [1.75, -1.65] },
  },
  // Self-propelled anti-aircraft gun (Gepard class vs Tunguska class).
  spaag: {
    kind: 'tracked',
    length: 7.6, width: 3.4, height: 3.1, hullHeight: 1.85,
    turretPivot: [0, 1.85, -0.3],
    gunPivot: [0, 0.75, 0.55],            // twin guns share one pivot
    barrelLength: 3.1, gunRadius: 0.04,
    twinGunOffsetX: 1.3,                  // guns at x = ±1.3 in gun space
    radarPivot: [0, 1.55, -1.05],         // search radar, turret space; spins about Y
    smokeLaunchers: [[1.1, 0.6, 0.9], [-1.1, 0.6, 0.9]],
    exhaust: [0, 1.1, -3.7],
    tracks: { width: 0.55, offsetX: 1.45, wheels: 6 },
  },
  // Self-propelled howitzer (M109/PzH2000 class vs 2S19 class).
  spg: {
    kind: 'tracked',
    length: 7.5, width: 3.4, height: 3.2, hullHeight: 1.75,
    turretPivot: [0, 1.75, -0.7],
    gunPivot: [0, 0.75, 1.85],
    barrelLength: 6.2, gunRadius: 0.1,
    exhaust: [1.1, 1.3, 2.6],
    tracks: { width: 0.55, offsetX: 1.45, wheels: 7 },
  },
  // Multiple launch rocket system on a 6x6 truck (HIMARS class vs BM-21 class).
  // The `turret` part is the rotating launcher base; the `gun` part is the
  // rocket pod, which elevates. Rockets leave from `tubes` (gun space, firing
  // along +Z of the pod).
  mlrs: {
    kind: 'wheeled',
    length: 7.8, width: 2.5, height: 3.0, hullHeight: 1.5,
    turretPivot: [0, 1.5, -1.9],
    gunPivot: [0, 0.35, -1.2],
    barrelLength: 3.6, gunRadius: 0.06,
    podSize: [2.1, 0.9, 3.6],             // width, height, length of the pod (pod starts at gun pivot, extends to +Z)
    tubes: { cols: 6, rows: 2, spacing: 0.3 }, // tube mouths on the pod's +Z face, centred
    exhaust: [-0.9, 2.5, 2.4],
    wheels: { count: 6, radius: 0.55, offsetX: 1.05, positionsZ: [2.7, -1.0, -2.4] },
  },
};

export const AIRCRAFT_SPECS = {
  // Attack helicopter (AH-64 class vs Mi-28 class). Rotor spins about +Y.
  attack_heli: {
    length: 17.7, width: 5.2, height: 3.9, radius: 6.5,
    rotorPivot: [0, 3.85, 0.4], rotorRadius: 7.3, rotorBlades: 4,
    tailRotorPivot: [-0.45, 3.1, -8.6], tailRotorRadius: 1.4, // spins about X
    gunPivot: [0, 0.75, 4.6],             // chin cannon turret
    rocketPods: [[2.05, 1.5, 0.5], [-2.05, 1.5, 0.5]],
    missileRails: [[2.65, 1.45, 0.5], [-2.65, 1.45, 0.5]],
    skidHeight: 0,                       // origin is at the wheels' ground contact
    cockpit: [0, 2.2, 3.4],
  },
  // Utility/transport helicopter (UH-60 class vs Mi-8 class).
  transport_heli: {
    length: 19.8, width: 2.6, height: 4.4, radius: 7.5,
    rotorPivot: [0, 4.35, 0.6], rotorRadius: 8.2, rotorBlades: 4,
    tailRotorPivot: [-0.4, 3.0, -10.6], tailRotorRadius: 1.6,
    doorGuns: [[1.3, 1.75, 2.1], [-1.3, 1.75, 2.1]],
    exits: [[1.7, 0, 0.6], [-1.7, 0, 0.6]],
    skidHeight: 1.2,                     // origin height above ground when landed
    capacity: 10,
    cockpit: [0, 2.3, 5.6],
  },
  // Strike fighter (F-16 class vs Su-25 class).
  jet: {
    length: 15.0, width: 10.0, height: 3.4, radius: 7.0,
    gun: [0.55, 0.55, 5.0],
    pylons: [[2.1, -0.55, -0.2], [-2.1, -0.55, -0.2], [3.4, -0.45, -0.7], [-3.4, -0.45, -0.7]],
    nozzle: [0, 0.15, -7.4], nozzleRadius: 0.55,
    cockpit: [0, 1.0, 3.9],
  },
  // Four-engine turboprop transport (C-130 class vs An-12 class).
  transport_plane: {
    length: 29.8, width: 40.4, height: 11.6, radius: 18,
    propPivots: [[5.2, 1.9, 4.2], [-5.2, 1.9, 4.2], [10.4, 1.8, 3.9], [-10.4, 1.8, 3.9]],
    propRadius: 2.05,                    // props spin about Z
    rampPivot: [0, -1.4, -7.2],          // rear cargo ramp hinge
    jumpDoors: [[2.2, -0.6, -6.2], [-2.2, -0.6, -6.2]],
    cockpit: [0, 1.6, 12.6],
  },
  // FPV kamikaze quadcopter with an RPG warhead slung underneath.
  fpv_drone: {
    length: 0.42, width: 0.42, height: 0.14, radius: 0.35,
    propPivots: [[0.15, 0.04, 0.15], [-0.15, 0.04, 0.15], [0.15, 0.04, -0.15], [-0.15, 0.04, -0.15]],
    propRadius: 0.09,
    camera: [0, 0.03, 0.12],
  },
  // Fixed-wing reconnaissance UAV with pusher prop (Orlan/Raven-ish, scaled up).
  recon_uav: {
    length: 3.6, width: 5.4, height: 0.9, radius: 3,
    propPivot: [0, 0.1, -1.85], propRadius: 0.4,
    camera: [0, -0.3, 0.9],
  },
};

// Soldier proportions (the soldier mesh itself is built by the infantry renderer).
export const INFANTRY_SPEC = {
  height: 1.8,
  eyeHeight: { stand: 1.65, crouch: 1.1, prone: 0.35 },
  hitRadius: 0.32,
  muzzleOffset: [-0.12, 1.42, 0.75],    // rifle muzzle while aiming, standing
};

// Static props built by the models module.
export const PROP_KINDS = [
  'tree_pine', 'tree_broadleaf', 'tree_dead', 'bush', 'rock',
  'sandbags', 'hesco', 'jersey_barrier', 'tank_trap', 'crates', 'fuel_drums',
  'fuel_tank', 'radio_mast', 'guard_tower', 'car', 'car_wreck', 'street_lamp',
  'power_pole', 'parachute', 'debris_concrete', 'debris_metal',
];
