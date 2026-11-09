/**
 * Car definitions. All physical numbers are SI (meters, kg, m/s, N).
 * Upgrade tiers add on top of these base stats (see parts.ts).
 */
export type CarId = "hatchback" | "pickup" | "bus" | "coupe" | "armored";

export interface CarDef {
  id: CarId;
  name: string;
  blurb: string;
  price: number; // cash cost to buy (0 for starter)
  unlockLevel: number; // level index (0-based) that must be reached/cleared to unlock
  // Body / chassis
  mass: number;
  size: { width: number; height: number; length: number }; // chassis box
  wheelRadius: number;
  wheelBase: number; // front-rear axle distance
  track: number; // left-right wheel distance
  rideHeight: number; // suspension rest length
  // Base stats (tier 0)
  enginePower: number; // drive force in N at low speed
  topSpeed: number; // m/s
  fuel: number; // liters (abstract units)
  fuelPerSecond: number; // base consumption at full throttle
  health: number;
  grip: number; // tire lateral grip multiplier
  suspensionStiffness: number; // spring constant per wheel N/m (scaled by mass at runtime)
  suspensionDamping: number;
  boostForce: number; // N
  boostCapacity: number; // seconds of boost
  airControl: number; // torque multiplier in air
  zombieResistance: number; // 0..1 how much speed is kept when plowing zombies
  // Look
  colors: { body: string; trim: string; accent: string };
}

export const CARS: CarDef[] = [
  {
    id: "hatchback",
    name: "Rustbucket",
    blurb: "A tired little hatchback. Light, nimble, falls apart easily.",
    price: 0,
    unlockLevel: 0,
    mass: 1000,
    size: { width: 1.7, height: 0.9, length: 3.8 },
    wheelRadius: 0.38,
    wheelBase: 2.5,
    track: 1.55,
    rideHeight: 0.55,
    enginePower: 9000,
    topSpeed: 30,
    fuel: 60,
    fuelPerSecond: 2.4,
    health: 100,
    grip: 1.0,
    suspensionStiffness: 38,
    suspensionDamping: 4.2,
    boostForce: 9000,
    boostCapacity: 3,
    airControl: 1.0,
    zombieResistance: 0.55,
    colors: { body: "#d9822b", trim: "#3a2f2a", accent: "#e8d8b0" },
  },
  {
    id: "pickup",
    name: "Workhorse",
    blurb: "Farm pickup. Balanced, tough, takes a beating.",
    price: 6000,
    unlockLevel: 1,
    mass: 1800,
    size: { width: 2.0, height: 1.1, length: 5.0 },
    wheelRadius: 0.48,
    wheelBase: 3.2,
    track: 1.8,
    rideHeight: 0.65,
    enginePower: 17000,
    topSpeed: 34,
    fuel: 85,
    fuelPerSecond: 2.6,
    health: 180,
    grip: 1.05,
    suspensionStiffness: 40,
    suspensionDamping: 4.5,
    boostForce: 16000,
    boostCapacity: 3.5,
    airControl: 0.9,
    zombieResistance: 0.7,
    colors: { body: "#3d6f8a", trim: "#202a30", accent: "#f2c14e" },
  },
  {
    id: "bus",
    name: "Big Yellow",
    blurb: "A school bus. Slow, thirsty, unstoppable.",
    price: 15000,
    unlockLevel: 2,
    mass: 5500,
    size: { width: 2.5, height: 2.4, length: 9.0 },
    wheelRadius: 0.55,
    wheelBase: 6.0,
    track: 2.2,
    rideHeight: 0.7,
    enginePower: 52000,
    topSpeed: 28,
    fuel: 140,
    fuelPerSecond: 3.2,
    health: 380,
    grip: 1.0,
    suspensionStiffness: 36,
    suspensionDamping: 5.0,
    boostForce: 50000,
    boostCapacity: 3,
    airControl: 0.55,
    zombieResistance: 0.93,
    colors: { body: "#f4c430", trim: "#1d1d1d", accent: "#c0392b" },
  },
  {
    id: "coupe",
    name: "Viper GT",
    blurb: "Sports coupe. Blistering speed, huge air, paper armor.",
    price: 28000,
    unlockLevel: 3,
    mass: 1300,
    size: { width: 1.9, height: 0.8, length: 4.4 },
    wheelRadius: 0.4,
    wheelBase: 2.7,
    track: 1.7,
    rideHeight: 0.5,
    enginePower: 19000,
    topSpeed: 48,
    fuel: 75,
    fuelPerSecond: 2.5,
    health: 120,
    grip: 1.25,
    suspensionStiffness: 48,
    suspensionDamping: 5.0,
    boostForce: 20000,
    boostCapacity: 4,
    airControl: 1.35,
    zombieResistance: 0.6,
    colors: { body: "#c0392b", trim: "#111111", accent: "#ecf0f1" },
  },
  {
    id: "armored",
    name: "Bulwark",
    blurb: "Armored cash truck. The end-game tank.",
    price: 50000,
    unlockLevel: 4,
    mass: 4200,
    size: { width: 2.4, height: 1.9, length: 6.4 },
    wheelRadius: 0.6,
    wheelBase: 4.0,
    track: 2.1,
    rideHeight: 0.75,
    enginePower: 48000,
    topSpeed: 38,
    fuel: 160,
    fuelPerSecond: 3.0,
    health: 600,
    grip: 1.1,
    suspensionStiffness: 42,
    suspensionDamping: 5.2,
    boostForce: 45000,
    boostCapacity: 4,
    airControl: 0.7,
    zombieResistance: 0.95,
    colors: { body: "#5b6b4f", trim: "#2a2f25", accent: "#d4a017" },
  },
];

export function getCar(id: CarId): CarDef {
  const c = CARS.find((c) => c.id === id);
  if (!c) throw new Error(`Unknown car ${id}`);
  return c;
}
