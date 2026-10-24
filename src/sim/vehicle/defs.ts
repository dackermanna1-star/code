// Vehicle definitions: body shape, mass, structure strength, powertrain,
// suspension, tires and paint for every drivable car.

import type { ShapeParams } from './shape.ts';

export interface EngineDef {
  name: string;
  /** Full-throttle torque curve: [rpm, Nm]. */
  torque: [number, number][];
  idleRpm: number;
  redline: number;
  maxRpm: number;
  inertia: number;
  /** Engine braking torque at redline (Nm). */
  friction: number;
  cylinders: number;
  /** Mass of the engine block (kg). */
  mass: number;
  /** Sound character 0 = smooth, 1 = rough/burbly. */
  roughness: number;
  /** Turbo/supercharger whine amount. */
  forcedInduction: number;
}

export interface TransmissionDef {
  gears: number[];
  reverse: number;
  final: number;
  shiftTime: number;
  efficiency: number;
}

export interface SuspensionDef {
  spring: number;
  bump: number;
  rebound: number;
  travel: number;
  /** Fraction of travel compressed at rest (sets preload). */
  rideFraction: number;
  arb: number;
  camber: number;
  toe: number;
  /** Height of mount above wheel center at rest. */
  mountHeight: number;
}

export interface TireDef {
  mu: number;
  stiffness: number;
  damping: number;
  kappaPeak: number;
  alphaPeak: number;
  relaxLong: number;
  relaxLat: number;
  shapeC: number;
  shapeE: number;
  rolling: number;
}

export interface StructureDef {
  /** Global multiplier on beam yield forces. */
  strength: number;
  /** Global multiplier on beam stiffness. */
  stiffness: number;
  /** Multiplier for crumple zones vs cabin. */
  crumple: number;
  /** Roof/pillar multiplier. */
  roof: number;
  /** Panel (door, hood) multiplier. */
  panels: number;
}

export interface PaintDef {
  color: number;
  metalness: number;
  roughness: number;
  clearcoat: number;
}

export interface VehicleDef {
  id: string;
  name: string;
  category: string;
  description: string;
  shape: ShapeParams;
  mass: number;
  structure: StructureDef;
  engine: EngineDef;
  trans: TransmissionDef;
  drive: 'FWD' | 'RWD' | 'AWD';
  /** Front torque share for AWD. */
  awdFront: number;
  diff: 'open' | 'lsd' | 'locked';
  lsdPreload: number;
  lsdRatio: number;
  brakes: { front: number; rear: number; handbrake: number; abs: boolean };
  steering: { maxAngle: number; ackermann: number };
  suspFront: SuspensionDef;
  suspRear: SuspensionDef;
  tire: TireDef;
  unsprungMass: number;
  aero: { cd: number; area: number; lift: number };
  paint: PaintDef;
  colors: number[];
  features: {
    spoiler?: boolean;
    hoodScoop?: boolean;
    roofRack?: boolean;
    bullbar?: boolean;
    stripes?: boolean;
    exhaustCount?: number;
    rimStyle?: 'spoke5' | 'spoke6' | 'mesh' | 'steel' | 'offroad' | 'turbine';
    tireProfile?: number;
  };
}

const baseTire: TireDef = {
  mu: 1.05,
  stiffness: 230000,
  damping: 1200,
  kappaPeak: 0.11,
  alphaPeak: 0.15,
  relaxLong: 0.12,
  relaxLat: 0.32,
  shapeC: 1.45,
  shapeE: -0.4,
  rolling: 0.012,
};

const baseStructure: StructureDef = { strength: 1, stiffness: 1, crumple: 1, roof: 1, panels: 1 };

// ---------------------------------------------------------------------------

const sedan: VehicleDef = {
  id: 'meridian',
  name: 'Meridian Sedan',
  category: 'Sedan',
  description: 'Mid-size family sedan. Predictable handling, front crumple zones engineered for 50 km/h barrier tests.',
  shape: {
    style: 'sedan',
    length: 4.7,
    width: 1.83,
    zFrontAxle: 1.42,
    zRearAxle: -1.36,
    track: 1.56,
    wheelRadius: 0.33,
    wheelWidth: 0.225,
    archRadius: 0.39,
    wheelY: 0.32,
    top: [[2.35, 0.64], [2.3, 0.74], [2.15, 0.8], [1.5, 0.88], [0.95, 0.94], [0.25, 1.41], [-0.2, 1.45], [-0.7, 1.41], [-1.42, 1.05], [-2.05, 1.03], [-2.27, 0.99], [-2.35, 0.88]],
    shoulder: [[2.35, 0.62], [2.2, 0.77], [1.5, 0.84], [0.95, 0.9], [0.0, 0.93], [-1.0, 0.97], [-1.5, 0.99], [-2.2, 0.97], [-2.35, 0.86]],
    bottom: [[2.35, 0.3], [2.2, 0.25], [1.9, 0.23], [1.0, 0.21], [-1.0, 0.21], [-1.9, 0.24], [-2.2, 0.28], [-2.35, 0.34]],
    zWindshieldBase: 0.95,
    zRoofFront: 0.25,
    zRoofRear: -0.7,
    zRearWindowBase: -1.42,
    roofHalfWidth: 0.64,
    frontFaceHalfWidth: 0.74,
    rearFaceHalfWidth: 0.8,
    frontCornerLen: 0.34,
    rearCornerLen: 0.26,
    shoulderInset: 0.045,
    sillInset: 0.04,
    hoodCrown: 0.035,
    roofCrown: 0.05,
    doors: [[0.98, -0.12], [-0.12, -0.92]],
    bumperTopFront: 0.55,
    bumperTopRear: 0.62,
    bumperLen: 0.34,
  },
  mass: 1480,
  structure: { ...baseStructure },
  engine: {
    name: '2.5L I4',
    torque: [[800, 165], [1500, 205], [2500, 238], [4000, 250], [5000, 242], [6000, 218], [6800, 180], [7200, 150]],
    idleRpm: 800,
    redline: 6800,
    maxRpm: 7200,
    inertia: 0.16,
    friction: 55,
    cylinders: 4,
    mass: 165,
    roughness: 0.25,
    forcedInduction: 0,
  },
  trans: { gears: [3.6, 2.2, 1.52, 1.16, 0.92, 0.76], reverse: 3.4, final: 3.9, shiftTime: 0.22, efficiency: 0.9 },
  drive: 'FWD',
  awdFront: 0.5,
  diff: 'open',
  lsdPreload: 0,
  lsdRatio: 0,
  brakes: { front: 2600, rear: 1500, handbrake: 2400, abs: true },
  steering: { maxAngle: 0.6, ackermann: 0.8 },
  suspFront: { spring: 36000, bump: 2600, rebound: 3800, travel: 0.2, rideFraction: 0.42, arb: 16000, camber: -0.01, toe: 0.002, mountHeight: 0.36 },
  suspRear: { spring: 32000, bump: 2300, rebound: 3400, travel: 0.2, rideFraction: 0.4, arb: 8000, camber: -0.012, toe: 0.003, mountHeight: 0.36 },
  tire: { ...baseTire },
  unsprungMass: 38,
  aero: { cd: 0.29, area: 2.25, lift: 0.05 },
  paint: { color: 0x2c5c9a, metalness: 0.55, roughness: 0.32, clearcoat: 1 },
  colors: [0x2c5c9a, 0x9b1b1e, 0xd8d8d6, 0x1c1c1e, 0x6b7a83, 0x2f5d3a],
  features: { exhaustCount: 1, rimStyle: 'spoke5', tireProfile: 0.45 },
};

const hatch: VehicleDef = {
  id: 'pico',
  name: 'Pico Hatch',
  category: 'Compact',
  description: 'Light front-wheel-drive city hatchback. Nimble, cheap, and folds like paper at speed.',
  shape: {
    style: 'hatch',
    length: 4.0,
    width: 1.73,
    zFrontAxle: 1.2,
    zRearAxle: -1.3,
    track: 1.49,
    wheelRadius: 0.305,
    wheelWidth: 0.195,
    archRadius: 0.36,
    wheelY: 0.296,
    top: [[2.0, 0.62], [1.96, 0.72], [1.84, 0.79], [1.3, 0.87], [0.82, 0.94], [0.12, 1.43], [-0.6, 1.49], [-1.5, 1.45], [-1.93, 1.06], [-2.0, 0.96]],
    shoulder: [[2.0, 0.6], [1.85, 0.76], [1.3, 0.84], [0.82, 0.9], [-0.5, 0.95], [-1.5, 1.0], [-1.93, 0.99], [-2.0, 0.92]],
    bottom: [[2.0, 0.3], [1.82, 0.23], [1.0, 0.2], [-1.0, 0.2], [-1.8, 0.25], [-2.0, 0.33]],
    zWindshieldBase: 0.82,
    zRoofFront: 0.12,
    zRoofRear: -1.5,
    zRearWindowBase: -1.93,
    roofHalfWidth: 0.6,
    frontFaceHalfWidth: 0.7,
    rearFaceHalfWidth: 0.76,
    frontCornerLen: 0.3,
    rearCornerLen: 0.18,
    shoulderInset: 0.04,
    sillInset: 0.035,
    hoodCrown: 0.03,
    roofCrown: 0.045,
    doors: [[0.8, -0.28], [-0.28, -0.95]],
    bumperTopFront: 0.54,
    bumperTopRear: 0.62,
    bumperLen: 0.3,
  },
  mass: 1120,
  structure: { ...baseStructure, strength: 0.82 },
  engine: {
    name: '1.4L I4',
    torque: [[800, 105], [1500, 122], [2500, 135], [3500, 140], [4500, 136], [5500, 124], [6300, 104], [6700, 90]],
    idleRpm: 850,
    redline: 6300,
    maxRpm: 6700,
    inertia: 0.11,
    friction: 38,
    cylinders: 4,
    mass: 120,
    roughness: 0.35,
    forcedInduction: 0,
  },
  trans: { gears: [3.45, 1.95, 1.3, 0.98, 0.8], reverse: 3.2, final: 4.1, shiftTime: 0.25, efficiency: 0.9 },
  drive: 'FWD',
  awdFront: 0.5,
  diff: 'open',
  lsdPreload: 0,
  lsdRatio: 0,
  brakes: { front: 2000, rear: 1100, handbrake: 1900, abs: true },
  steering: { maxAngle: 0.62, ackermann: 0.8 },
  suspFront: { spring: 29000, bump: 2100, rebound: 3100, travel: 0.19, rideFraction: 0.42, arb: 11000, camber: -0.01, toe: 0.002, mountHeight: 0.34 },
  suspRear: { spring: 25000, bump: 1900, rebound: 2800, travel: 0.19, rideFraction: 0.4, arb: 6000, camber: -0.015, toe: 0.003, mountHeight: 0.34 },
  tire: { ...baseTire, mu: 1.0 },
  unsprungMass: 32,
  aero: { cd: 0.32, area: 2.1, lift: 0.08 },
  paint: { color: 0xc9a227, metalness: 0.35, roughness: 0.35, clearcoat: 1 },
  colors: [0xc9a227, 0xe25822, 0x4aa3c2, 0xf2f2ef, 0x8b2252, 0x3b3b3b],
  features: { exhaustCount: 1, rimStyle: 'steel', tireProfile: 0.55 },
};

const coupe: VehicleDef = {
  id: 'vortex',
  name: 'Vortex GT',
  category: 'Sports',
  description: 'Rear-drive twin-turbo sports coupe with a limited-slip differential. Handle the throttle with care.',
  shape: {
    style: 'coupe',
    length: 4.45,
    width: 1.9,
    zFrontAxle: 1.36,
    zRearAxle: -1.26,
    track: 1.62,
    wheelRadius: 0.34,
    wheelWidth: 0.265,
    archRadius: 0.39,
    wheelY: 0.333,
    top: [[2.225, 0.52], [2.18, 0.61], [2.0, 0.67], [1.4, 0.76], [0.7, 0.86], [-0.05, 1.23], [-0.35, 1.27], [-0.65, 1.23], [-1.55, 0.98], [-2.1, 0.95], [-2.225, 0.84]],
    shoulder: [[2.225, 0.5], [2.0, 0.64], [1.4, 0.73], [0.7, 0.82], [0.0, 0.85], [-1.2, 0.93], [-1.6, 0.94], [-2.1, 0.93], [-2.225, 0.8]],
    bottom: [[2.225, 0.21], [2.0, 0.16], [1.0, 0.14], [-1.0, 0.14], [-2.0, 0.18], [-2.225, 0.26]],
    zWindshieldBase: 0.7,
    zRoofFront: -0.05,
    zRoofRear: -0.65,
    zRearWindowBase: -1.55,
    roofHalfWidth: 0.57,
    frontFaceHalfWidth: 0.7,
    rearFaceHalfWidth: 0.82,
    frontCornerLen: 0.4,
    rearCornerLen: 0.3,
    shoulderInset: 0.05,
    sillInset: 0.05,
    hoodCrown: 0.04,
    roofCrown: 0.05,
    doors: [[0.75, -0.62]],
    bumperTopFront: 0.45,
    bumperTopRear: 0.58,
    bumperLen: 0.32,
  },
  mass: 1490,
  structure: { ...baseStructure, strength: 1.1, stiffness: 1.15 },
  engine: {
    name: '3.0L Twin-Turbo I6',
    torque: [[900, 260], [1600, 420], [2200, 520], [4500, 540], [5500, 515], [6500, 450], [7200, 380], [7600, 320]],
    idleRpm: 900,
    redline: 7200,
    maxRpm: 7600,
    inertia: 0.18,
    friction: 70,
    cylinders: 6,
    mass: 190,
    roughness: 0.2,
    forcedInduction: 0.6,
  },
  trans: { gears: [3.3, 2.1, 1.55, 1.2, 1.0, 0.84, 0.69], reverse: 3.0, final: 3.55, shiftTime: 0.12, efficiency: 0.92 },
  drive: 'RWD',
  awdFront: 0.4,
  diff: 'lsd',
  lsdPreload: 120,
  lsdRatio: 0.35,
  brakes: { front: 3600, rear: 2200, handbrake: 3000, abs: true },
  steering: { maxAngle: 0.56, ackermann: 0.7 },
  suspFront: { spring: 62000, bump: 4200, rebound: 6000, travel: 0.15, rideFraction: 0.4, arb: 30000, camber: -0.025, toe: 0.001, mountHeight: 0.31 },
  suspRear: { spring: 58000, bump: 3900, rebound: 5600, travel: 0.15, rideFraction: 0.4, arb: 18000, camber: -0.02, toe: 0.003, mountHeight: 0.31 },
  tire: { ...baseTire, mu: 1.18, stiffness: 270000, kappaPeak: 0.1, alphaPeak: 0.13 },
  unsprungMass: 40,
  aero: { cd: 0.31, area: 2.05, lift: -0.15 },
  paint: { color: 0xb3121b, metalness: 0.6, roughness: 0.28, clearcoat: 1 },
  colors: [0xb3121b, 0xf0f0ee, 0x111114, 0xe2b007, 0x1f6fbf, 0x3fa34d],
  features: { spoiler: true, exhaustCount: 4, rimStyle: 'spoke6', tireProfile: 0.32 },
};

const muscle: VehicleDef = {
  id: 'brute',
  name: 'Brute V8',
  category: 'Muscle',
  description: 'Long-hood muscle car with a big-block V8, an open diff and a body-on-frame heft.',
  shape: {
    style: 'muscle',
    length: 4.85,
    width: 1.92,
    zFrontAxle: 1.48,
    zRearAxle: -1.37,
    track: 1.6,
    wheelRadius: 0.345,
    wheelWidth: 0.255,
    archRadius: 0.4,
    wheelY: 0.335,
    top: [[2.425, 0.7], [2.38, 0.8], [2.25, 0.86], [1.5, 0.92], [0.45, 0.96], [-0.25, 1.32], [-0.6, 1.36], [-0.95, 1.32], [-1.55, 1.04], [-2.3, 1.02], [-2.425, 0.92]],
    shoulder: [[2.425, 0.68], [2.25, 0.82], [1.5, 0.88], [0.45, 0.92], [-0.5, 0.95], [-1.55, 1.0], [-2.3, 0.99], [-2.425, 0.9]],
    bottom: [[2.425, 0.3], [2.25, 0.25], [1.9, 0.22], [1.0, 0.2], [-1.0, 0.2], [-1.9, 0.23], [-2.3, 0.28], [-2.425, 0.34]],
    zWindshieldBase: 0.45,
    zRoofFront: -0.25,
    zRoofRear: -0.95,
    zRearWindowBase: -1.55,
    roofHalfWidth: 0.62,
    frontFaceHalfWidth: 0.78,
    rearFaceHalfWidth: 0.78,
    frontCornerLen: 0.22,
    rearCornerLen: 0.2,
    shoulderInset: 0.03,
    sillInset: 0.035,
    hoodCrown: 0.03,
    roofCrown: 0.04,
    doors: [[0.42, -0.88]],
    bumperTopFront: 0.58,
    bumperTopRear: 0.6,
    bumperLen: 0.28,
  },
  mass: 1690,
  structure: { ...baseStructure, strength: 1.2, stiffness: 1.1 },
  engine: {
    name: '6.4L V8',
    torque: [[700, 380], [1500, 520], [2500, 610], [3800, 640], [4800, 620], [5600, 560], [6200, 490], [6500, 420]],
    idleRpm: 750,
    redline: 6200,
    maxRpm: 6500,
    inertia: 0.28,
    friction: 95,
    cylinders: 8,
    mass: 230,
    roughness: 0.85,
    forcedInduction: 0,
  },
  trans: { gears: [2.97, 2.07, 1.43, 1.0, 0.84, 0.56], reverse: 2.9, final: 3.55, shiftTime: 0.2, efficiency: 0.9 },
  drive: 'RWD',
  awdFront: 0.4,
  diff: 'open',
  lsdPreload: 0,
  lsdRatio: 0,
  brakes: { front: 3400, rear: 2000, handbrake: 2800, abs: true },
  steering: { maxAngle: 0.58, ackermann: 0.7 },
  suspFront: { spring: 46000, bump: 3200, rebound: 4600, travel: 0.18, rideFraction: 0.42, arb: 20000, camber: -0.012, toe: 0.002, mountHeight: 0.35 },
  suspRear: { spring: 40000, bump: 2900, rebound: 4200, travel: 0.18, rideFraction: 0.4, arb: 9000, camber: 0, toe: 0.002, mountHeight: 0.35 },
  tire: { ...baseTire, mu: 1.08, stiffness: 250000 },
  unsprungMass: 45,
  aero: { cd: 0.36, area: 2.3, lift: 0.1 },
  paint: { color: 0x1d6b3a, metalness: 0.5, roughness: 0.3, clearcoat: 1 },
  colors: [0x1d6b3a, 0xdd6b0c, 0x0e0e10, 0x2155a8, 0xc4c4c2, 0x8a0f13],
  features: { hoodScoop: true, stripes: true, exhaustCount: 2, rimStyle: 'turbine', tireProfile: 0.45 },
};

const pickup: VehicleDef = {
  id: 'atlas',
  name: 'Atlas Pickup',
  category: 'Truck',
  description: 'Full-size crew-cab 4x4 pickup. Heavy, tall and tough, with a locking rear differential.',
  shape: {
    style: 'pickup',
    length: 5.5,
    width: 2.0,
    zFrontAxle: 1.85,
    zRearAxle: -1.6,
    track: 1.72,
    wheelRadius: 0.41,
    wheelWidth: 0.27,
    archRadius: 0.48,
    wheelY: 0.4,
    top: [[2.75, 0.95], [2.7, 1.1], [2.55, 1.15], [1.7, 1.22], [1.05, 1.27], [0.4, 1.83], [-0.2, 1.88], [-0.78, 1.85], [-0.88, 1.32], [-0.95, 1.26], [-2.7, 1.26], [-2.75, 1.2]],
    shoulder: [[2.75, 0.93], [2.55, 1.12], [1.7, 1.18], [1.05, 1.22], [0.0, 1.24], [-0.9, 1.25], [-2.7, 1.24], [-2.75, 1.18]],
    bottom: [[2.75, 0.5], [2.55, 0.45], [2.1, 0.43], [1.0, 0.45], [-1.0, 0.45], [-2.3, 0.48], [-2.75, 0.55]],
    zWindshieldBase: 1.05,
    zRoofFront: 0.4,
    zRoofRear: -0.78,
    zRearWindowBase: -0.88,
    roofHalfWidth: 0.78,
    frontFaceHalfWidth: 0.86,
    rearFaceHalfWidth: 0.95,
    frontCornerLen: 0.24,
    rearCornerLen: 0.06,
    shoulderInset: 0.035,
    sillInset: 0.04,
    hoodCrown: 0.03,
    roofCrown: 0.04,
    zCabRear: -0.9,
    bedFloorY: 0.92,
    doors: [[1.0, 0.02], [0.02, -0.82]],
    bumperTopFront: 0.82,
    bumperTopRear: 0.75,
    bumperLen: 0.3,
  },
  mass: 2350,
  structure: { ...baseStructure, strength: 1.45, stiffness: 1.25 },
  engine: {
    name: '5.7L V8',
    torque: [[650, 420], [1500, 540], [2500, 590], [3600, 600], [4500, 570], [5200, 520], [5800, 450], [6100, 380]],
    idleRpm: 650,
    redline: 5600,
    maxRpm: 6100,
    inertia: 0.32,
    friction: 100,
    cylinders: 8,
    mass: 260,
    roughness: 0.7,
    forcedInduction: 0,
  },
  trans: { gears: [4.2, 2.6, 1.6, 1.25, 1.0, 0.8], reverse: 3.8, final: 3.73, shiftTime: 0.26, efficiency: 0.88 },
  drive: 'AWD',
  awdFront: 0.42,
  diff: 'locked',
  lsdPreload: 0,
  lsdRatio: 0,
  brakes: { front: 4800, rear: 3200, handbrake: 3600, abs: true },
  steering: { maxAngle: 0.58, ackermann: 0.8 },
  suspFront: { spring: 62000, bump: 4400, rebound: 6200, travel: 0.25, rideFraction: 0.42, arb: 18000, camber: 0, toe: 0.002, mountHeight: 0.42 },
  suspRear: { spring: 70000, bump: 4800, rebound: 6600, travel: 0.25, rideFraction: 0.36, arb: 6000, camber: 0, toe: 0, mountHeight: 0.42 },
  tire: { ...baseTire, mu: 0.98, stiffness: 300000, relaxLat: 0.4, rolling: 0.015 },
  unsprungMass: 62,
  aero: { cd: 0.45, area: 3.4, lift: 0.1 },
  paint: { color: 0x7d1d18, metalness: 0.4, roughness: 0.35, clearcoat: 0.8 },
  colors: [0x7d1d18, 0xf2f2f0, 0x262a2e, 0x3c5a7e, 0x7b6d4f, 0x5d6d3a],
  features: { bullbar: false, exhaustCount: 1, rimStyle: 'offroad', tireProfile: 0.65 },
};

const suv: VehicleDef = {
  id: 'summit',
  name: 'Summit SUV',
  category: 'SUV',
  description: 'All-wheel-drive family SUV. High center of gravity: corner too hard and it will roll.',
  shape: {
    style: 'suv',
    length: 4.75,
    width: 1.93,
    zFrontAxle: 1.45,
    zRearAxle: -1.4,
    track: 1.66,
    wheelRadius: 0.37,
    wheelWidth: 0.245,
    archRadius: 0.43,
    wheelY: 0.36,
    top: [[2.375, 0.88], [2.33, 0.98], [2.2, 1.03], [1.5, 1.08], [0.95, 1.14], [0.28, 1.7], [-1.0, 1.75], [-2.02, 1.72], [-2.31, 1.24], [-2.375, 1.12]],
    shoulder: [[2.375, 0.86], [2.2, 1.0], [1.5, 1.05], [0.95, 1.1], [0.0, 1.13], [-1.5, 1.17], [-2.31, 1.18], [-2.375, 1.08]],
    bottom: [[2.375, 0.42], [2.2, 0.36], [1.9, 0.33], [1.0, 0.31], [-1.0, 0.31], [-1.9, 0.34], [-2.2, 0.38], [-2.375, 0.44]],
    zWindshieldBase: 0.95,
    zRoofFront: 0.28,
    zRoofRear: -2.02,
    zRearWindowBase: -2.31,
    roofHalfWidth: 0.74,
    frontFaceHalfWidth: 0.72,
    rearFaceHalfWidth: 0.8,
    frontCornerLen: 0.32,
    rearCornerLen: 0.2,
    shoulderInset: 0.04,
    sillInset: 0.04,
    hoodCrown: 0.03,
    roofCrown: 0.04,
    doors: [[0.93, -0.18], [-0.18, -1.0]],
    bumperTopFront: 0.7,
    bumperTopRear: 0.72,
    bumperLen: 0.32,
  },
  mass: 1960,
  structure: { ...baseStructure, strength: 1.2, stiffness: 1.1 },
  engine: {
    name: '3.5L V6',
    torque: [[750, 260], [1500, 310], [2500, 340], [4000, 355], [5000, 340], [6000, 305], [6500, 270], [6800, 240]],
    idleRpm: 750,
    redline: 6400,
    maxRpm: 6800,
    inertia: 0.2,
    friction: 70,
    cylinders: 6,
    mass: 190,
    roughness: 0.35,
    forcedInduction: 0,
  },
  trans: { gears: [4.0, 2.4, 1.6, 1.2, 1.0, 0.8], reverse: 3.4, final: 3.6, shiftTime: 0.24, efficiency: 0.88 },
  drive: 'AWD',
  awdFront: 0.45,
  diff: 'open',
  lsdPreload: 0,
  lsdRatio: 0,
  brakes: { front: 3800, rear: 2400, handbrake: 3000, abs: true },
  steering: { maxAngle: 0.6, ackermann: 0.8 },
  suspFront: { spring: 46000, bump: 3300, rebound: 4700, travel: 0.22, rideFraction: 0.42, arb: 22000, camber: -0.008, toe: 0.002, mountHeight: 0.4 },
  suspRear: { spring: 42000, bump: 3000, rebound: 4400, travel: 0.22, rideFraction: 0.4, arb: 11000, camber: -0.01, toe: 0.002, mountHeight: 0.4 },
  tire: { ...baseTire, mu: 1.0, stiffness: 270000, relaxLat: 0.36 },
  unsprungMass: 50,
  aero: { cd: 0.36, area: 2.8, lift: 0.08 },
  paint: { color: 0x51585e, metalness: 0.55, roughness: 0.3, clearcoat: 1 },
  colors: [0x51585e, 0xeeeeec, 0x15161a, 0x6e2a2a, 0x2a4e6e, 0x8c7a56],
  features: { roofRack: true, exhaustCount: 2, rimStyle: 'spoke6', tireProfile: 0.55 },
};

const van: VehicleDef = {
  id: 'courier',
  name: 'Courier Van',
  category: 'Van',
  description: 'Rear-drive panel van. Tall, top-heavy and very easy to tip over in a crash.',
  shape: {
    style: 'van',
    length: 5.2,
    width: 2.0,
    zFrontAxle: 1.85,
    zRearAxle: -1.45,
    track: 1.72,
    wheelRadius: 0.36,
    wheelWidth: 0.225,
    archRadius: 0.42,
    wheelY: 0.35,
    top: [[2.6, 0.95], [2.55, 1.05], [2.32, 1.12], [1.78, 1.22], [0.95, 2.1], [0.0, 2.2], [-2.5, 2.18], [-2.6, 2.02]],
    shoulder: [[2.6, 0.93], [2.32, 1.08], [1.78, 1.18], [0.95, 1.2], [0.0, 1.22], [-2.5, 1.22], [-2.6, 1.15]],
    bottom: [[2.6, 0.42], [2.35, 0.36], [2.1, 0.33], [1.0, 0.33], [-1.0, 0.33], [-2.2, 0.36], [-2.6, 0.42]],
    zWindshieldBase: 1.78,
    zRoofFront: 0.95,
    zRoofRear: -2.5,
    zRearWindowBase: -2.57,
    roofHalfWidth: 0.9,
    frontFaceHalfWidth: 0.8,
    rearFaceHalfWidth: 0.95,
    frontCornerLen: 0.3,
    rearCornerLen: 0.08,
    shoulderInset: 0.03,
    sillInset: 0.035,
    hoodCrown: 0.03,
    roofCrown: 0.04,
    doors: [[1.42, 0.62]],
    bumperTopFront: 0.66,
    bumperTopRear: 0.66,
    bumperLen: 0.26,
  },
  mass: 2150,
  structure: { ...baseStructure, strength: 1.05, roof: 0.8 },
  engine: {
    name: '2.2L Turbodiesel',
    torque: [[750, 220], [1250, 330], [1750, 380], [2750, 380], [3500, 330], [4200, 250], [4600, 180]],
    idleRpm: 750,
    redline: 4300,
    maxRpm: 4600,
    inertia: 0.26,
    friction: 80,
    cylinders: 4,
    mass: 210,
    roughness: 0.9,
    forcedInduction: 0.35,
  },
  trans: { gears: [4.4, 2.6, 1.6, 1.2, 1.0, 0.82], reverse: 3.9, final: 3.9, shiftTime: 0.28, efficiency: 0.88 },
  drive: 'RWD',
  awdFront: 0.5,
  diff: 'open',
  lsdPreload: 0,
  lsdRatio: 0,
  brakes: { front: 4000, rear: 2600, handbrake: 3200, abs: true },
  steering: { maxAngle: 0.62, ackermann: 0.8 },
  suspFront: { spring: 50000, bump: 3500, rebound: 5000, travel: 0.2, rideFraction: 0.42, arb: 15000, camber: 0, toe: 0.002, mountHeight: 0.38 },
  suspRear: { spring: 56000, bump: 3800, rebound: 5400, travel: 0.2, rideFraction: 0.35, arb: 6000, camber: 0, toe: 0, mountHeight: 0.38 },
  tire: { ...baseTire, mu: 0.97, stiffness: 290000, rolling: 0.014 },
  unsprungMass: 52,
  aero: { cd: 0.38, area: 3.9, lift: 0.1 },
  paint: { color: 0xe9e9e4, metalness: 0.15, roughness: 0.42, clearcoat: 0.6 },
  colors: [0xe9e9e4, 0x2f2f33, 0x1b4f8c, 0xd23b1e, 0x707a5c, 0xf1c40f],
  features: { exhaustCount: 1, rimStyle: 'steel', tireProfile: 0.6 },
};

export const VEHICLES: VehicleDef[] = [sedan, hatch, coupe, muscle, suv, pickup, van];

export function getVehicleDef(id: string): VehicleDef {
  return VEHICLES.find((v) => v.id === id) ?? sedan;
}
