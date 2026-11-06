// Shared helpers / constants for the world generator.
import { B, BLOCKS, SOLID, IS_DOOR, IS_CONTAINER } from '../blocks.js';
import { hash01, hash32 } from '../../core/rng.js';

export { B, BLOCKS, SOLID, IS_DOOR, IS_CONTAINER };

/** Canonical loot table names (docs/ARCHITECTURE.md). The generator must only use these. */
export const LOOT_TABLES = new Set([
  // furniture defaults
  'mailbox', 'trash', 'dumpster', 'vending', 'fridge', 'freezer', 'stove', 'kitchen', 'under_sink', 'couch',
  'wardrobe', 'dresser', 'bookshelf', 'desk', 'medicine_cabinet', 'laundry', 'workbench', 'garage', 'toolbox',
  'gun_cabinet', 'safe', 'store_food', 'store_general', 'pharmacy', 'store_looted', 'store_drinks', 'checkout',
  'clothing_store', 'office', 'locker', 'hospital', 'crate', 'military_crate', 'cardboard', 'bar', 'stash', 'barrel',
  // location overrides
  'hardware_store', 'gun_store', 'gun_store_backroom', 'sporting_goods', 'gas_station', 'liquor_store',
  'pharmacy_storage', 'diner_kitchen', 'police_locker', 'police_armory', 'police_evidence', 'police_desk',
  'hospital_storage', 'hospital_ward', 'hospital_pharmacy', 'school_locker', 'school_office', 'fire_station',
  'church', 'motel_room', 'warehouse', 'farm_barn', 'farm_shed', 'mechanic', 'hunting_cabin', 'ranger_station',
  'campsite', 'survivor_stash', 'military_tent', 'military_armory', 'military_medical', 'fema_supply',
  'trailer_home', 'library', 'electronics', 'construction', 'truck_cargo', 'airdrop', 'heli_crash',
  // vehicles
  'car_trunk', 'car_glovebox', 'police_car_trunk', 'ambulance', 'military_truck', 'pickup_bed',
  // zombie corpses
  'zombie_civilian', 'zombie_police', 'zombie_military', 'zombie_medic', 'zombie_firefighter', 'zombie_worker',
  'zombie_prisoner', 'zombie_farmer', 'zombie_hunter', 'zombie_patient', 'zombie_survivor',
  // dead survivors
  'corpse_civilian', 'corpse_survivor', 'corpse_police', 'corpse_military',
  // floor loot
  'floor_house', 'floor_store', 'floor_street', 'floor_office', 'floor_military', 'floor_hospital', 'floor_camp',
]);

export const ZOMBIE_TYPES = ['walker', 'runner', 'crawler', 'brute', 'screamer', 'bloater'];
export const OUTFITS = ['civilian', 'civilian_f', 'office', 'police', 'military', 'medic', 'patient', 'firefighter',
  'worker', 'prisoner', 'farmer', 'hunter', 'survivor'];
export const CAR_TYPES = ['sedan', 'hatchback', 'suv', 'pickup', 'van', 'police', 'ambulance', 'military_truck',
  'humvee', 'bus', 'semi', 'firetruck', 'tractor'];

/** Approximate half extents (x = half width, z = half length) used for placement checks. */
export const CAR_HALF = {
  sedan: [1.0, 2.3], hatchback: [0.95, 2.0], suv: [1.05, 2.5], pickup: [1.1, 2.8], van: [1.1, 2.7],
  police: [1.0, 2.4], ambulance: [1.2, 3.2], military_truck: [1.3, 4.0], humvee: [1.2, 2.5], bus: [1.4, 6.0],
  semi: [1.3, 8.0], firetruck: [1.3, 4.6], tractor: [1.0, 2.0],
};

export const CAR_COLORS = [0x8a1c1c, 0x1c3f8a, 0xdedede, 0x222222, 0x5a5a5a, 0x2f5f2f, 0x9a8a5a, 0x6a2a6a,
  0xb0b0b0, 0x7a3a1a, 0x103050, 0xc8a038, 0x405060, 0xf0f0f0, 0x602020, 0x3a3a48];

export const FACING_YAW = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

/** Deterministic per-position random in [0,1). */
export function h01(seed, x, z, salt = 0) { return hash01(seed, x, z, salt); }
export function h32(seed, x, z, salt = 0) { return hash32(seed, x, z, salt); }

export const isSolidId = (id) => SOLID[id] === 1;

/** Remove a block and everything registered at it (containers, doors, meta). */
export function clearCell(world, x, y, z, id = 0) {
  if (!world.inBounds(x, y, z)) return;
  const i = world.idx(x, y, z);
  world.blocks[i] = id;
  world.meta.delete(i);
  world.containers.delete(i);
  world.doors.delete(i);
}

/** Simple counters for stats. */
export function bump(stats, key, n = 1) { stats[key] = (stats[key] || 0) + n; }

/** Rectangle helpers (inclusive) */
export function rectOverlap(a, b, pad = 0) {
  return a.x0 - pad <= b.x1 && b.x0 - pad <= a.x1 && a.z0 - pad <= b.z1 && b.z0 - pad <= a.z1;
}
