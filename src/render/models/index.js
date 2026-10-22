// Procedural model library: vehicles, aircraft and battlefield props.
// All geometry is generated at runtime from src/sim/specs.js dimensions,
// non-indexed with position / normal / color attributes (colours are linear,
// converted from sRGB hex through THREE.Color).

import { buildGroundParts } from './ground.js';
import { buildAirParts } from './air.js';
import { buildPropLods } from './props.js';
import { groundPalette, airPalette, MODEL_PALETTE } from './palette.js';

export { MODEL_PALETTE };

const EMISSIVE = {};
const GLOW = { ao: false };

// -> { parts: { hull, turret, gun, radar?, emissive? } }
export function buildVehicleModel(type, faction) {
  const f = faction ? 1 : 0;
  const p = buildGroundParts(type, f);
  const pal = groundPalette(f, type, p.camoScale ?? 1);
  const parts = {
    hull: p.hull.toGeometry(pal, { grime: [0.1, 1.15] }),
    turret: p.turret.toGeometry(pal, {}),
    gun: p.gun.toGeometry(pal, {}),
  };
  if (p.radar) parts.radar = p.radar.toGeometry(pal, {});
  if (p.emissive && p.emissive.count) parts.emissive = p.emissive.toGeometry(EMISSIVE, GLOW);
  return { parts };
}

// -> { parts: { body, rotor?, rotorBlur?, tailRotor?, tailRotorBlur?, propBlur?, emissive? } }
export function buildAircraftModel(type, faction) {
  const f = faction ? 1 : 0;
  const p = buildAirParts(type, f);
  const pal = airPalette(f, type);
  const parts = { body: p.body.toGeometry(pal, {}) };
  for (const k of ['rotor', 'tailRotor']) if (p[k]) parts[k] = p[k].toGeometry(pal, {});
  for (const k of ['rotorBlur', 'tailRotorBlur', 'propBlur']) if (p[k]) parts[k] = p[k].toGeometry(pal, { ao: false });
  if (p.emissive && p.emissive.count) parts.emissive = p.emissive.toGeometry(EMISSIVE, GLOW);
  return { parts };
}

// -> { lod0, lod1? }
export function buildPropModel(kind, variant = 0) {
  return buildPropLods(kind, variant | 0);
}
