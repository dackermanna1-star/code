// The vehicle catalogue of Vice City: every car, bike, boat, helicopter and
// plane you can drive, with its handling. Plain data; vehicles.js derives the
// rest (size, wheels, suspension, inertia) from the model at load time.
//
//   kind     'car' | 'bike' | 'boat' | 'heli' | 'plane'
//   model    a Kenney model (assets/models.js) or 'proc:<builder>' (models.js)
//   scale    model units -> studs (Kenney cars are x5.4: a sedan is 8 wide, 14 long)
//   mass     kg (collisions trade momentum by mass)
//   power    kW at the wheels (constant-power engine: punchy low down, fading up top)
//   top      top speed, studs/s (about 0.73 mph each)
//   grip     tyre grip in real-world g (1.0 = a good road car)
//   brake    braking strength (x grip)
//   steer    full-lock steering angle, radians (less at speed)
//   drift    how easily the rear lets go (handbrake turns, lift-off oversteer) 0..1
//   drive    'rwd' | 'fwd' | 'awd'
//   gears    forward gears (for the rev counter and the engine sound)
//   tough    damage taken is divided by this
//   seats    [x, y, z] in model units, the point the rider's hips sit on (+x is the vehicle's LEFT)
//   paints   body colours to pick from (sRGB hex); null keeps the model's own livery
//   siren    has a light bar and a siren
//   cls      'compact' | 'sedan' | 'sports' | 'super' | 'suv' | 'van' | 'truck' | 'emergency' | 'bike' | 'boat' | 'air' (for traffic mixes and the HUD)

const CIVIL = ['#e9e6df', '#1b1d22', '#a7adb5', '#6f1d2a', '#2c4f84', '#38634a', '#d8c7a0', '#5a5f66', '#8c2f39', '#3d6f8f'];
const PASTEL = ['#f4a6c8', '#7fe0d8', '#ffe28a', '#ffb38a', '#b8a6f4', '#9fe3a6', '#f5f1e8', '#7fb8ff'];
const NEON = ['#ff2a6d', '#05d9e8', '#ffd23f', '#ff6b1a', '#16161a', '#f6f6f6', '#7b2cbf', '#21e07a', '#d41e2b', '#1f6bff'];
const WORK = ['#f2f0ea', '#2f5d9b', '#c63b2f', '#3f7a4c', '#e8c547', '#6b7077'];

export const TYPES = {
  // ---- cars ------------------------------------------------------------------------------------------------
  sedan: {
    name: 'Bayside', kind: 'car', cls: 'sedan', model: 'sedan', scale: 5.4,
    mass: 1400, power: 125, top: 120, grip: 1.0, brake: 1.0, steer: 0.62, drift: 0.5, drive: 'rwd', gears: 5,
    seats: [[0.32, 0.42, 0.05], [-0.32, 0.42, 0.05], [0.32, 0.42, -0.62], [-0.32, 0.42, -0.62]], paints: [...CIVIL, ...PASTEL.slice(0, 3)],
  },
  sports: {
    name: 'Marlin GT', kind: 'car', cls: 'sports', model: 'sedan-sports', scale: 5.4,
    mass: 1450, power: 255, top: 158, grip: 1.12, brake: 1.15, steer: 0.6, drift: 0.62, drive: 'rwd', gears: 6,
    seats: [[0.28, 0.36, -0.05], [-0.28, 0.36, -0.05]], paints: NEON,
  },
  hatch: {
    name: 'Gecko', kind: 'car', cls: 'compact', model: 'hatchback-sports', scale: 5.4,
    mass: 1150, power: 160, top: 140, grip: 1.12, brake: 1.1, steer: 0.66, drift: 0.4, drive: 'fwd', gears: 6,
    seats: [[0.28, 0.36, 0.0], [-0.28, 0.36, 0.0], [0.28, 0.36, -0.6], [-0.28, 0.36, -0.6]], paints: [...NEON.slice(0, 4), ...PASTEL],
  },
  suv: {
    name: 'Everglade', kind: 'car', cls: 'suv', model: 'suv', scale: 5.4,
    mass: 2100, power: 185, top: 122, grip: 0.95, brake: 0.95, steer: 0.6, drift: 0.4, drive: 'awd', gears: 5, tough: 1.25,
    seats: [[0.32, 0.45, 0.1], [-0.32, 0.45, 0.1], [0.32, 0.45, -0.55], [-0.32, 0.45, -0.55]], paints: CIVIL,
  },
  luxury: {
    name: 'Monarch', kind: 'car', cls: 'suv', model: 'suv-luxury', scale: 5.4,
    mass: 2300, power: 290, top: 138, grip: 1.0, brake: 1.05, steer: 0.6, drift: 0.4, drive: 'awd', gears: 6, tough: 1.3,
    seats: [[0.32, 0.45, 0.15], [-0.32, 0.45, 0.15], [0.32, 0.45, -0.55], [-0.32, 0.45, -0.55]], paints: ['#16161a', '#f2f0ea', '#3a3f47', '#5b1420', '#1d2f4f', '#c9b48a'],
  },
  taxi: {
    name: 'Sunshine Cab', kind: 'car', cls: 'sedan', model: 'taxi', scale: 5.4,
    mass: 1500, power: 135, top: 118, grip: 1.0, brake: 1.0, steer: 0.62, drift: 0.55, drive: 'rwd', gears: 5,
    seats: [[0.32, 0.42, 0.05], [-0.32, 0.42, 0.05], [0.32, 0.42, -0.62], [-0.32, 0.42, -0.62]], paints: null,
  },
  police: {
    name: 'VCPD Cruiser', kind: 'car', cls: 'emergency', model: 'police', scale: 5.4,
    mass: 1650, power: 270, top: 152, grip: 1.1, brake: 1.15, steer: 0.62, drift: 0.55, drive: 'rwd', gears: 6, tough: 1.4,
    seats: [[0.32, 0.42, 0.1], [-0.32, 0.42, 0.1], [0.32, 0.42, -0.6], [-0.32, 0.42, -0.6]], paints: null, siren: true,
    // the light bar on the roof and the flashers in the grille (model units)
    sirenBoxes: [[-0.5, 1.05, -0.2, 0.5, 1.45, 0.4], [-0.6, 0.4, 1.35, 0.6, 0.7, 1.6]],
  },
  ambulance: {
    name: 'Paramedic', kind: 'car', cls: 'emergency', model: 'ambulance', scale: 5.4,
    mass: 3200, power: 230, top: 112, grip: 0.92, brake: 0.88, steer: 0.58, drift: 0.3, drive: 'rwd', gears: 5, tough: 1.6,
    seats: [[0.32, 0.5, 0.75], [-0.32, 0.5, 0.75], [0.3, 0.6, -0.6], [-0.3, 0.6, -0.6]], paints: null, siren: true,
    lightBar: [0, 1.8, 0.62, 0.9], // procedural bar: x, y (roof), z, width (model units)
  },
  firetruck: {
    name: 'Engine 9', kind: 'car', cls: 'emergency', model: 'firetruck', scale: 5.4,
    mass: 9000, power: 470, top: 102, grip: 0.86, brake: 0.78, steer: 0.55, drift: 0.25, drive: 'rwd', gears: 6, tough: 3,
    seats: [[0.32, 0.55, 0.95], [-0.32, 0.55, 0.95], [0.32, 0.6, 0.45], [-0.32, 0.6, 0.45]], paints: null, siren: true,
    lightBar: [0, 1.5, 1.2, 1.0],
  },
  garbage: {
    name: 'Compactor', kind: 'car', cls: 'truck', model: 'garbage-truck', scale: 5.4,
    mass: 9500, power: 380, top: 90, grip: 0.86, brake: 0.72, steer: 0.55, drift: 0.2, drive: 'rwd', gears: 6, tough: 3,
    seats: [[0.32, 0.6, 1.1], [-0.32, 0.6, 1.1]], paints: null,
  },
  boxtruck: {
    name: 'Courier', kind: 'car', cls: 'truck', model: 'delivery', scale: 5.4,
    mass: 4500, power: 220, top: 102, grip: 0.88, brake: 0.82, steer: 0.56, drift: 0.3, drive: 'rwd', gears: 5, tough: 2,
    seats: [[0.32, 0.55, 1.0], [-0.32, 0.55, 1.0]], paints: WORK,
  },
  flatbed: {
    name: 'Stakebed', kind: 'car', cls: 'truck', model: 'delivery-flat', scale: 5.4,
    mass: 4000, power: 210, top: 104, grip: 0.88, brake: 0.82, steer: 0.56, drift: 0.3, drive: 'rwd', gears: 5, tough: 2,
    seats: [[0.32, 0.55, 1.0], [-0.32, 0.55, 1.0]], paints: WORK,
  },
  van: {
    name: 'Sunvan', kind: 'car', cls: 'van', model: 'van', scale: 5.4,
    mass: 2200, power: 140, top: 112, grip: 0.92, brake: 0.9, steer: 0.6, drift: 0.4, drive: 'rwd', gears: 5, tough: 1.4,
    seats: [[0.32, 0.45, 0.45], [-0.32, 0.45, 0.45], [0.3, 0.45, -0.3], [-0.3, 0.45, -0.3]], paints: [...WORK, ...PASTEL.slice(0, 4)],
  },
  pickup: {
    name: 'Gator', kind: 'car', cls: 'truck', model: 'truck', scale: 5.4,
    mass: 2000, power: 210, top: 126, grip: 0.96, brake: 0.95, steer: 0.6, drift: 0.58, drive: 'rwd', gears: 5, tough: 1.5,
    seats: [[0.32, 0.45, 0.3], [-0.32, 0.45, 0.3]], paints: [...CIVIL, '#e8c547', '#c63b2f'],
  },
  hauler: {
    name: 'Hauler', kind: 'car', cls: 'truck', model: 'truck-flat', scale: 5.4,
    mass: 3000, power: 200, top: 110, grip: 0.9, brake: 0.86, steer: 0.58, drift: 0.35, drive: 'rwd', gears: 5, tough: 1.8,
    seats: [[0.32, 0.45, 0.45], [-0.32, 0.45, 0.45]], paints: WORK,
  },
  supercar: {
    name: 'Vortex', kind: 'car', cls: 'super', model: 'race', scale: 5.4,
    mass: 1300, power: 470, top: 176, grip: 1.28, brake: 1.3, steer: 0.56, drift: 0.62, drive: 'rwd', gears: 7, downforce: 1.6,
    seats: [[0.22, 0.2, -0.15], [-0.22, 0.2, -0.15]], paints: NEON,
  },
  concept: {
    name: 'Aurora', kind: 'car', cls: 'super', model: 'race-future', scale: 5.4,
    mass: 1250, power: 520, top: 184, grip: 1.32, brake: 1.35, steer: 0.55, drift: 0.5, drive: 'awd', gears: 7, downforce: 2,
    seats: [[0.22, 0.22, -0.1], [-0.22, 0.22, -0.1]], paints: ['#05d9e8', '#f6f6f6', '#ff2a6d', '#16161a', '#b8ff3d', '#7b2cbf'],
  },
  tractor: {
    name: 'Tiller', kind: 'car', cls: 'truck', model: 'tractor', scale: 5.4,
    mass: 3500, power: 75, top: 48, grip: 1.0, brake: 0.85, steer: 0.7, drift: 0.2, drive: 'awd', gears: 4, tough: 2,
    seats: [[0, 0.95, -0.35]], paints: ['#3f8a3c', '#c63b2f', '#e8c547', '#2f5d9b'],
  },

  // ---- two wheels --------------------------------------------------------------------------------------------
  motorbike: {
    name: 'Razorback 1000', kind: 'bike', cls: 'bike', model: 'proc:sportbike', scale: 1,
    mass: 230, power: 120, top: 172, grip: 1.2, brake: 1.2, steer: 0.5, drift: 0.3, drive: 'rwd', gears: 6, tough: 1,
    seats: [[0, 2.55, -0.6], [0, 2.85, -2.0]], paints: NEON,
  },
  scooter: {
    name: 'Mojito 50', kind: 'bike', cls: 'bike', model: 'proc:scooter', scale: 1,
    mass: 120, power: 10, top: 64, grip: 1.0, brake: 0.95, steer: 0.6, drift: 0.2, drive: 'rwd', gears: 1, tough: 0.8,
    seats: [[0, 2.2, -0.9], [0, 2.4, -1.9]], paints: PASTEL,
  },

  // ---- boats ---------------------------------------------------------------------------------------------------
  speedboat: {
    name: 'Barracuda', kind: 'boat', cls: 'boat', model: 'boat-speed-a', scale: 6,
    mass: 1800, power: 420, top: 140, grip: 1, brake: 1, steer: 1, drift: 0.5, gears: 1, tough: 1.2,
    seats: [[0.3, 0.55, 0.1], [-0.3, 0.55, 0.1]], paints: ['#5f75cb', '#16161a', '#f6f6f6', '#ff2a6d', '#05d9e8', '#ffd23f'],
  },
  cigarette: {
    name: 'Tarpon', kind: 'boat', cls: 'boat', model: 'boat-speed-c', scale: 6,
    mass: 1700, power: 460, top: 150, grip: 1, brake: 1, steer: 1, drift: 0.5, gears: 1, tough: 1.2,
    seats: [[0.3, 0.55, 0.0], [-0.3, 0.55, 0.0]], paints: NEON,
  },
  cruiser: {
    name: 'Wahoo', kind: 'boat', cls: 'boat', model: 'boat-speed-e', scale: 6,
    mass: 2400, power: 360, top: 118, grip: 1, brake: 1, steer: 0.9, drift: 0.5, gears: 1, tough: 1.4,
    seats: [[0.3, 0.6, -0.2], [-0.3, 0.6, -0.2]], paints: ['#f0663f', '#2c4f84', '#1b1d22', '#3d8f6f', '#ffd23f'],
  },
  runabout: {
    name: 'Bonito', kind: 'boat', cls: 'boat', model: 'boat-speed-g', scale: 6,
    mass: 1500, power: 330, top: 132, grip: 1, brake: 1, steer: 1.05, drift: 0.5, gears: 1,
    seats: [[0.3, 0.5, -0.3], [-0.3, 0.5, -0.3]], paints: ['#6488d3', '#ff6b1a', '#21e07a', '#f6f6f6'],
  },
  mako: {
    name: 'Mako', kind: 'boat', cls: 'boat', model: 'boat-speed-i', scale: 6,
    mass: 2100, power: 400, top: 128, grip: 1, brake: 1, steer: 0.95, drift: 0.5, gears: 1, tough: 1.3,
    seats: [[0.3, 0.6, -0.3], [-0.3, 0.6, -0.3]], paints: ['#d7815b', '#2c4f84', '#7b2cbf', '#16161a'],
  },
  swordfish: {
    name: 'Swordfish', kind: 'boat', cls: 'boat', model: 'boat-speed-j', scale: 6,
    mass: 2000, power: 520, top: 156, grip: 1, brake: 1, steer: 0.9, drift: 0.5, gears: 1, tough: 1.2,
    seats: [[0.3, 0.5, -0.5], [-0.3, 0.5, -0.5]], paints: ['#46be84', '#ff2a6d', '#05d9e8', '#f6f6f6'],
  },
  fishing: {
    name: 'Grouper', kind: 'boat', cls: 'boat', model: 'boat-fishing-small', scale: 6.5,
    mass: 4200, power: 260, top: 84, grip: 1, brake: 1, steer: 0.75, drift: 0.5, gears: 1, tough: 2,
    seats: [[0.0, 0.6, 0.3], [0.4, 0.6, -0.8]], paints: ['#6487d3', '#2f7a4c', '#c63b2f', '#e8c547'],
  },
  tug: {
    name: 'Bulldog', kind: 'boat', cls: 'boat', model: 'boat-tug-a', scale: 7,
    mass: 12000, power: 700, top: 66, grip: 1, brake: 1, steer: 0.6, drift: 0.5, gears: 1, tough: 4,
    seats: [[0.0, 1.0, 0.2], [0.4, 0.6, -0.9]], paints: null,
  },
  sailboat: {
    name: 'Key Breeze', kind: 'boat', cls: 'boat', model: 'boat-sail-a', scale: 7,
    mass: 3500, power: 110, top: 52, grip: 1, brake: 1, steer: 0.7, drift: 0.5, gears: 1, tough: 2,
    seats: [[0.0, 0.55, -1.2], [0.4, 0.55, -0.6]], paints: null,
  },

  // ---- aircraft ------------------------------------------------------------------------------------------------
  policeheli: {
    name: 'VCPD Hawk', kind: 'heli', cls: 'air', model: 'proc:heli', scale: 1, livery: 'police',
    mass: 2200, power: 600, top: 105, grip: 1, brake: 1, steer: 1, drift: 0, gears: 1, tough: 1.4, siren: true,
    seats: [[-1.5, 2.2, 2.2], [1.5, 2.2, 2.2], [-1.5, 2.2, -0.6], [1.5, 2.2, -0.6]], paints: null,
  },
  newsheli: {
    name: 'Skyeye 6', kind: 'heli', cls: 'air', model: 'proc:heli', scale: 1, livery: 'news',
    mass: 2000, power: 560, top: 100, grip: 1, brake: 1, steer: 1, drift: 0, gears: 1, tough: 1.2,
    seats: [[-1.5, 2.2, 2.2], [1.5, 2.2, 2.2], [-1.5, 2.2, -0.6], [1.5, 2.2, -0.6]], paints: ['#f6f6f6', '#ffd23f', '#ff2a6d', '#1f6bff'],
  },
  plane: {
    name: 'Albatross', kind: 'plane', cls: 'air', model: 'proc:plane', scale: 1,
    mass: 1100, power: 180, top: 170, grip: 1, brake: 1, steer: 0.5, drift: 0, gears: 1, tough: 1,
    seats: [[1.1, 2.6, 4.2], [-1.1, 2.6, 4.2], [1.1, 2.6, 1.8], [-1.1, 2.6, 1.8]], paints: ['#c63b2f', '#2c4f84', '#e8c547', '#2f7a4c', '#16161a'],
  },
};

// shorthand ids that read like the Kenney model names, for callers that think in models
export const ALIASES = {
  'sedan-sports': 'sports', 'hatchback-sports': 'hatch', 'suv-luxury': 'luxury', 'garbage-truck': 'garbage', delivery: 'boxtruck',
  'delivery-flat': 'flatbed', truck: 'pickup', 'truck-flat': 'hauler', race: 'supercar', 'race-future': 'concept', heli: 'policeheli',
  helicopter: 'policeheli', bike: 'motorbike', moped: 'scooter', boat: 'speedboat', 'boat-speed-a': 'speedboat', seaplane: 'plane',
};

/** What traffic, parking and the police draw from (weights). */
export const MIX = {
  traffic: { sedan: 10, taxi: 4, hatch: 4, suv: 4, van: 3, pickup: 3, sports: 2, luxury: 2, boxtruck: 2, flatbed: 1, hauler: 1, garbage: 0.6, supercar: 0.5, concept: 0.2, scooter: 1.5, motorbike: 1 },
  parked: { sedan: 10, hatch: 5, suv: 5, van: 3, pickup: 3, sports: 2, luxury: 2, taxi: 1, supercar: 0.6, motorbike: 1, scooter: 2 },
  boats: { speedboat: 3, cigarette: 2, cruiser: 2, runabout: 3, mako: 2, swordfish: 1, fishing: 3, tug: 1, sailboat: 2 },
};
