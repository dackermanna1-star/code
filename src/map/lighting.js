// de_dust2 light_environment equivalent: warm afternoon sun from the west-southwest,
// pale blue skylight, one bounce off the sand.

export const DUST2_LIGHTING = {
  sunDir: [-0.59, -0.245, 0.766],
  sunColor: [1.0, 0.9, 0.72],
  skyColor: [0.40, 0.42, 0.48],
  ambientMin: [0.07, 0.065, 0.06],
  bounce: 0.6,
};

// Approximate texture albedo (average colour / 255) for the bounce pass.
const ALBEDO = {
  ground_sand: [0.76, 0.62, 0.42],
  ground_stone: [0.72, 0.6, 0.44],
  ground_dirt: [0.6, 0.48, 0.34],
  wall_stone: [0.78, 0.7, 0.55],
  wall_stone_big: [0.76, 0.68, 0.53],
  wall_tunnel: [0.66, 0.6, 0.5],
  wall_plaster: [0.78, 0.7, 0.58],
  trim_band: [0.78, 0.7, 0.55],
  trim_cap: [0.78, 0.7, 0.55],
  rock: [0.6, 0.45, 0.33],
  crate: [0.6, 0.47, 0.3],
  crate_b: [0.55, 0.45, 0.32],
  crate_green: [0.42, 0.5, 0.38],
  door: [0.47, 0.41, 0.35],
  shutter: [0.36, 0.28, 0.2],
  wood_beam: [0.4, 0.31, 0.23],
  wood_planks: [0.5, 0.41, 0.29],
  metal: [0.43, 0.45, 0.43],
};

export function albedoOf(name) {
  return ALBEDO[name] || [0.6, 0.52, 0.4];
}
