// Nominal footprints of world prop kinds (pure data, shared by the layout builder, isReserved and the props module).

/**
 * Nominal prop footprints: half extents along local X (length axis) / Z, height. Linear props
 * (fences/walls/guard rails) use `length` from the placement instead of hx. Origin = ground center.
 */
export const PROP_FOOTPRINTS: Record<string, { hx: number; hz: number; h: number; linear?: boolean }> = {
  fence_wood: { hx: 0, hz: 0.15, h: 1.3, linear: true },
  fence_metal: { hx: 0, hz: 0.1, h: 2.4, linear: true },
  wall_concrete: { hx: 0, hz: 0.3, h: 3.5, linear: true },
  wall_ruin: { hx: 0, hz: 0.35, h: 2.5, linear: true },
  guard_rail: { hx: 0, hz: 0.2, h: 0.8, linear: true },
  power_pole: { hx: 0.2, hz: 0.2, h: 9 },
  street_lamp: { hx: 0.15, hz: 0.15, h: 6 },
  container: { hx: 6.1, hz: 1.22, h: 2.6 },
  container_small: { hx: 3.05, hz: 1.22, h: 2.6 },
  car_wreck: { hx: 2.2, hz: 0.95, h: 1.4 },
  hay_bale: { hx: 0.8, hz: 0.6, h: 1.2 },
  barrier_concrete: { hx: 1.5, hz: 0.35, h: 0.9 },
  sandbags: { hx: 1.8, hz: 0.9, h: 1.0 },
  crane: { hx: 9, hz: 7, h: 32 },
  cooling_tower: { hx: 24, hz: 24, h: 48 },
  tank_industrial: { hx: 6, hz: 6, h: 10 },
  chimney: { hx: 3, hz: 3, h: 60 },
  radio_tower: { hx: 3, hz: 3, h: 55 },
  water_tower: { hx: 2.5, hz: 2.5, h: 14 },
  bus_stop: { hx: 2.5, hz: 1, h: 2.6 },
  pallet_stack: { hx: 0.6, hz: 0.5, h: 1.2 },
  barrel: { hx: 0.3, hz: 0.3, h: 0.9 },
  conveyor: { hx: 12, hz: 1.2, h: 6 },
};
