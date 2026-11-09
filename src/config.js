// Global tuning constants. Everything physical is in metres / kilograms / seconds, y-up.

export const PHYS = {
  gravity: -11,
  dt: 1 / 120,          // fixed physics step
  velIters: 10,
  posIters: 4,
  maxStepsPerFrame: 10, // avoid the spiral of death on slow frames
};

// Collision categories (bit flags).
export const CAT = {
  TERRAIN: 0x0001,
  RIDER: 0x0002,
  VEHICLE: 0x0004,
  OBJECT: 0x0008,
  DEBRIS: 0x0010,
  SENSOR: 0x0020,
  PROJECTILE: 0x0040,
};

export const MASK = {
  TERRAIN: 0xffff,
  RIDER: CAT.TERRAIN | CAT.OBJECT | CAT.PROJECTILE | CAT.SENSOR | CAT.VEHICLE | CAT.RIDER,
  VEHICLE: CAT.TERRAIN | CAT.OBJECT | CAT.PROJECTILE | CAT.SENSOR | CAT.VEHICLE | CAT.RIDER | CAT.DEBRIS,
  OBJECT: 0xffff,
  DEBRIS: CAT.TERRAIN | CAT.OBJECT | CAT.DEBRIS | CAT.VEHICLE,
  SENSOR: CAT.RIDER | CAT.VEHICLE | CAT.OBJECT | CAT.PROJECTILE,
  PROJECTILE: CAT.TERRAIN | CAT.OBJECT | CAT.RIDER | CAT.VEHICLE,
};

export const VIEW = {
  baseHeight: 11,     // metres of world visible vertically at rest
  speedZoom: 0.25,    // extra metres of view per m/s of speed
  maxExtra: 6,
};

export const SAVE_KEY = 'brittle-bones-save-v1';
