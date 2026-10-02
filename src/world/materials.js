// Material table: how a surface maps textures, its footstep sound and lighting hints.
// Material ids are stored in Uint8 cell arrays, so keep the count < 256.

export const VF = { // per-vertex flags
  FULLBRIGHT: 1, WOBBLE: 2, VIBRATE: 4, ANIM: 8, NOFOG: 16, SCROLL: 32, SWAY: 64,
};

export const MATS = [null]; // id 0 = none
export const M = {};

function mat(name, tex, opts = {}) {
  const id = MATS.length;
  MATS.push({
    id, name,
    tex: Array.isArray(tex) ? tex : [tex],
    layers: null,
    su: opts.su ?? opts.s ?? 1.5,
    sv: opts.sv ?? opts.s ?? 1.5,
    surf: opts.surf ?? 'concrete',
    tint: opts.tint ?? [1, 1, 1],
    flags: opts.flags ?? 0,
    stain: opts.stain ?? 0,
    frames: opts.frames ?? 1,
  });
  M[name] = id;
  return id;
}

// --- yellow backrooms
mat('wp_stripe', 'wp_stripe', { s: 1.6, surf: 'drywall', stain: 0.16 });
mat('wp_stripe2', 'wp_stripe2', { s: 1.6, surf: 'drywall', stain: 0.14 });
mat('wp_plain', 'wp_plain', { s: 2.0, surf: 'drywall', stain: 0.18 });
mat('wp_damask', 'wp_damask', { s: 1.4, surf: 'drywall', stain: 0.14 });
mat('wp_stained', 'wp_stained', { su: 1.6, sv: 2.0, surf: 'drywall', stain: 0.2 });
mat('wp_old', 'wp_old', { s: 2.0, surf: 'drywall', stain: 0.22 });
mat('carpet_y', 'carpet_y', { s: 1.4, surf: 'carpet', stain: 0.12 });
mat('carpet_y2', 'carpet_y2', { s: 1.4, surf: 'carpet', stain: 0.12 });
mat('carpet_wet', 'carpet_wet', { s: 2.0, surf: 'wetcarpet', stain: 0.1 });
mat('ceil_tile', 'ceil_tile', { s: 1.2, surf: 'drywall', stain: 0.06 });
mat('ceil_tile_stain', 'ceil_tile_stain', { s: 1.2, surf: 'drywall' });
mat('ceil_tile_old', 'ceil_tile_old', { s: 1.2, surf: 'drywall', stain: 0.1 });
mat('ceil_tile_white', 'ceil_tile_white', { s: 1.2, surf: 'drywall' });
// --- generic
mat('white', 'white', { s: 1 });
mat('black', 'black', { s: 1 });
mat('dark', 'dark', { s: 2 });
mat('concrete', 'concrete', { s: 2.5, surf: 'concrete', stain: 0.15 });
mat('concrete_floor', 'concrete_floor', { s: 3, surf: 'concrete', stain: 0.12 });
mat('concrete_dark', 'concrete_dark', { s: 2.5, surf: 'concrete', stain: 0.15 });
mat('concrete_wet', 'concrete_wet', { s: 3, surf: 'wet', stain: 0.1 });
mat('cmu', 'cmu', { su: 1.6, sv: 0.8, surf: 'concrete', stain: 0.1 });
mat('cmu_green', 'cmu_green', { su: 1.6, sv: 0.8, surf: 'concrete', stain: 0.08 });
mat('paint_wall', 'paint_wall', { s: 2, surf: 'drywall', stain: 0.08 });
mat('paint_beige', 'paint_beige', { s: 2, surf: 'drywall', stain: 0.1 });
mat('paint_green', 'paint_green', { s: 2, surf: 'drywall', stain: 0.08 });
mat('paint_blue', 'paint_blue', { s: 2, surf: 'drywall', stain: 0.08 });
mat('paint_cream', 'paint_cream', { s: 2, surf: 'drywall', stain: 0.08 });
mat('paint_dirty', 'paint_dirty', { su: 2, sv: 2.6, surf: 'drywall', stain: 0.2 });
mat('drywall_raw', 'drywall_raw', { su: 2.4, sv: 2.4, surf: 'drywall', stain: 0.06 });
mat('plaster', 'plaster', { s: 2.5, surf: 'drywall', stain: 0.1 });
mat('wood', 'wood', { s: 1.2, surf: 'wood' });
mat('wood_dark', 'wood_dark', { s: 1.2, surf: 'wood' });
mat('wood_light', 'wood_light', { s: 1.2, surf: 'wood' });
mat('wood_floor', 'wood_floor', { s: 1.8, surf: 'wood', stain: 0.08 });
mat('wood_panel', 'wood_panel', { su: 1.6, sv: 2.4, surf: 'wood', stain: 0.06 });
mat('metal', 'metal', { s: 1.5, surf: 'metal' });
mat('metal_dark', 'metal_dark', { s: 1.5, surf: 'metal' });
mat('metal_green', 'metal_green', { s: 1.5, surf: 'metal' });
mat('metal_plate', 'metal_plate', { s: 1.2, surf: 'metal' });
mat('rust', 'rust', { s: 2, surf: 'metal' });
mat('grate', 'grate', { s: 0.8, surf: 'metal' });
mat('tile_white', 'tile_white', { s: 0.8, surf: 'tile', stain: 0.06 });
mat('tile_blue', 'tile_blue', { s: 0.8, surf: 'tile' });
mat('tile_check', 'tile_check', { s: 1.2, surf: 'tile', stain: 0.06 });
mat('lino_vct', 'lino_vct', { s: 1.2, surf: 'lino', stain: 0.08 });
mat('lino_green', 'lino_green', { s: 1.2, surf: 'lino', stain: 0.08 });
mat('gel_blue', 'gel_blue', { s: 2.4, surf: 'gel', flags: VF.WOBBLE });
mat('marble', 'marble', { s: 1.6, surf: 'tile' });
mat('carpet_office', 'carpet_office', { s: 1.2, surf: 'carpet', stain: 0.1 });
mat('carpet_gray', 'carpet_gray', { s: 1.4, surf: 'carpet', stain: 0.1 });
mat('carpet_blue', 'carpet_blue', { s: 1.4, surf: 'carpet', stain: 0.1 });
mat('carpet_green', 'carpet_green', { s: 1.4, surf: 'carpet', stain: 0.1 });
mat('carpet_red', 'carpet_red', { s: 1.4, surf: 'carpet', stain: 0.1 });
mat('carpet_brown', 'carpet_brown', { s: 1.4, surf: 'carpet', stain: 0.1 });
mat('carpet_hotel', 'carpet_hotel', { s: 1.0, surf: 'carpet', stain: 0.08 });
mat('carpet_teal', 'carpet_teal', { s: 1.4, surf: 'carpet', stain: 0.1 });
mat('shag', 'shag', { s: 1.2, surf: 'carpet' });
// --- fabrics, plastics, objects
mat('fabric_blue', 'fabric_blue', { s: 0.6, surf: 'carpet' });
mat('fabric_gray', 'fabric_gray', { s: 0.6, surf: 'carpet' });
mat('fabric_brown', 'fabric_brown', { s: 0.6, surf: 'carpet' });
mat('fabric_partition', 'fabric_partition', { s: 1.2, surf: 'carpet' });
mat('fabric_floral', 'fabric_floral', { s: 0.8, surf: 'carpet' });
mat('velvet_red', 'velvet_red', { s: 0.6, surf: 'carpet' });
mat('plastic_beige', 'plastic_beige', { s: 0.5, surf: 'plastic' });
mat('plastic_white', 'plastic_white', { s: 0.5, surf: 'plastic' });
mat('plastic_orange', 'plastic_orange', { s: 0.5, surf: 'plastic' });
mat('plastic_blue', 'plastic_blue', { s: 0.5, surf: 'plastic' });
mat('plastic_gray', 'plastic_gray', { s: 0.5, surf: 'plastic' });
mat('plastic_black', 'plastic_black', { s: 0.5, surf: 'plastic' });
mat('chair_mesh', 'chair_mesh', { s: 0.3, surf: 'plastic' });
mat('rubber', 'rubber', { s: 0.5, surf: 'carpet' });
mat('chrome', 'chrome', { s: 0.5, surf: 'metal' });
mat('cardboard', 'cardboard', { s: 1, surf: 'wood' });
mat('mattress', 'mattress', { s: 1, surf: 'carpet' });
mat('porcelain', 'porcelain', { s: 1, surf: 'tile' });
mat('stall', 'stall', { s: 1.5, surf: 'metal' });
mat('pipe', 'pipe', { s: 1, surf: 'metal' });
mat('pipe_red', 'pipe_red', { s: 1, surf: 'metal' });
mat('duct', 'duct', { s: 1.2, surf: 'metal' });
mat('hazard', 'hazard', { s: 0.8, surf: 'metal' });
mat('rack_orange', 'rack_orange', { s: 1.2, surf: 'metal' });
mat('rack_blue', 'rack_blue', { s: 1.2, surf: 'metal' });
mat('curtain', 'curtain', { s: 1.2, surf: 'carpet' });
mat('glass', 'glass', { s: 1.5, surf: 'tile' });
mat('mirror', 'mirror', { s: 1.5, surf: 'tile' });
mat('burnt', 'burnt', { s: 1.2, surf: 'concrete' });
mat('car_white', 'car_white', { s: 1.2, surf: 'metal' });
// --- exterior
mat('brick', 'brick', { su: 1.0, sv: 0.5, surf: 'concrete', stain: 0.08 });
mat('siding', 'siding', { su: 1.6, sv: 1.2, surf: 'wood', stain: 0.05 });
mat('siding_blue', 'siding_blue', { su: 1.6, sv: 1.2, surf: 'wood', stain: 0.05 });
mat('shingles', 'shingles', { s: 1.5, surf: 'wood' });
mat('asphalt', 'asphalt', { s: 3, surf: 'asphalt' });
mat('asphalt_line', 'asphalt_line', { su: 3, sv: 6, surf: 'asphalt' });
mat('sidewalk', 'sidewalk', { s: 1.5, surf: 'concrete' });
mat('grass_dead', 'grass_dead', { s: 2, surf: 'grass' });
// --- water
mat('water_black', 'water_black', { s: 3, surf: 'water', flags: VF.WOBBLE });
mat('water_dark', 'water_dark', { s: 2, surf: 'water', flags: VF.WOBBLE | VF.SCROLL });
mat('water_pool', 'water_pool', { s: 2, surf: 'water', flags: VF.WOBBLE | VF.SCROLL });

// --- portal vestibules: 1m texture repeats and no stains so every copy looks identical
mat('vest_wall', 'paint_cream', { s: 1, surf: 'drywall' });
mat('vest_floor', 'carpet_gray', { s: 1, surf: 'carpet' });
mat('vest_ceil', 'ceil_tile_white', { s: 1, surf: 'drywall' });

// Other modules may register extra materials before resolveMaterials() runs at boot.
export const defineMaterial = mat;

export function resolveMaterials(texIndex) {
  if (MATS.length > 65535) throw new Error('too many materials: ' + MATS.length);
  for (let i = 1; i < MATS.length; i++) {
    const m = MATS[i];
    m.layers = m.tex.map((t) => {
      if (texIndex[t] === undefined) throw new Error('missing texture ' + t + ' for material ' + m.name);
      return texIndex[t];
    });
  }
}

export function matLayer(id, variant = 0) {
  const m = MATS[id];
  return m.layers[variant % m.layers.length];
}
