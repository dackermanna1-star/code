// Block registry. Block ids are Uint8 (0..255). Look blocks up by name with B.<name>.
//
// Orientation ("facing") lives in the world's sparse meta map (world.getMeta / setMeta):
//   meta bits 0-1 : facing. 0 = +Z (south), 1 = -X (west), 2 = -Z (north), 3 = +X (east).
//                   For oriented furniture the "front" texture points in the facing direction.
//                   Boxes are authored for facing 0 (front toward +Z, back against z=0) and rotated.
//   doors:   bit 2 = open, bit 3 = top half, bit 4 = barricaded
//   signs:   bits 2-7 = character index into SIGN_CHARS
//
// Render kinds:
//   'cube'   - full block, 6 faces
//   'boxes'  - list of axis aligned boxes [x0,y0,z0,x1,y1,z1] in 0..1 block space (facing 0)
//   'cross'  - two diagonal quads (plants, fire)
//   'liquid' - water
//   'none'   - air
// Passes: 'opaque' | 'cutout' (alpha tested) | 'translucent' (blended)

export const SIGN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -+!&.\'#';

const DEFAULTS = {
  render: 'cube',
  pass: 'opaque',
  solid: true,
  opaque: true,
  light: 0,
  lightFilter: 15, // light lost passing through (15 = blocks all light). Non-opaque blocks default 0.
  mat: 'stone', // sound / impact material: stone wood metal glass dirt grass sand gravel cloth leaves water plant
  hp: 0, // 0 = cannot be broken by player / zombies. Otherwise damage needed to break.
  breakWith: null, // null = anything, or array of tool tags that can damage it: 'chop','blunt','dig','pry','heavy'
  drops: null, // [[itemId, min, max, chance]]
  becomes: 0, // block name that replaces it when broken (default air)
  container: null, // default loot table name if this block is a container
  slots: 0, // container capacity
  oriented: false,
  door: null, // {hp, lockable}
  slow: 1, // movement multiplier when inside
  damage: 0, // damage per second when inside
  sway: false, // foliage wind sway
  climbable: false,
  interact: null, // 'bed' | 'sink' | 'toilet' | 'water_pump' | 'rain_barrel' | 'gas_pump' | 'campfire' | 'workbench' | 'radio' | 'forage' | 'vending'
  hides: false, // player inside is harder to see (bushes, corn)
  flammable: false,
  stepSound: null, // footstep material override
};

const defs = [];
function def(name, props = {}) {
  const d = { ...DEFAULTS, name, ...props };
  if (d.render !== 'cube' && props.opaque === undefined) d.opaque = false;
  if (!d.opaque && props.lightFilter === undefined) d.lightFilter = 0;
  if (typeof d.tex === 'string') d.tex = { all: d.tex };
  if (!d.tex) d.tex = { all: name };
  defs.push(d);
  return d;
}

// Common box shapes (facing 0: front = +Z, back = z0)
const BOX = {
  slab: [[0, 0, 0, 1, 0.5, 1]],
  topSlab: [[0, 0.5, 0, 1, 1, 1]],
  stairs: [[0, 0, 0, 1, 0.5, 1], [0, 0.5, 0, 1, 1, 0.5]], // rises toward -Z (back); walk up from front (+Z)
  panelCenter: [[0, 0, 0.4375, 1, 1, 0.5625]],
  panelBack: [[0, 0, 0, 1, 1, 0.125]],
  fencePost: [[0.375, 0, 0.375, 0.625, 1, 0.625]],
  pole: [[0.4, 0, 0.4, 0.6, 1, 0.6]],
  thickPole: [[0.32, 0, 0.32, 0.68, 1, 0.68]],
  table: [[0, 0.8125, 0, 1, 1, 1], [0.05, 0, 0.05, 0.2, 0.8125, 0.2], [0.8, 0, 0.05, 0.95, 0.8125, 0.2], [0.05, 0, 0.8, 0.2, 0.8125, 0.95], [0.8, 0, 0.8, 0.95, 0.8125, 0.95]],
  chair: [[0.15, 0.45, 0.15, 0.85, 0.55, 0.85], [0.15, 0.55, 0.15, 0.85, 1.05, 0.25], [0.17, 0, 0.17, 0.27, 0.45, 0.27], [0.73, 0, 0.17, 0.83, 0.45, 0.27], [0.17, 0, 0.73, 0.27, 0.45, 0.83], [0.73, 0, 0.73, 0.83, 0.45, 0.83]],
  couch: [[0, 0, 0, 1, 0.5, 1], [0, 0.5, 0, 1, 1, 0.3]],
  bed: [[0, 0, 0, 1, 0.5625, 1]],
  low: [[0, 0, 0, 1, 0.85, 1]],
  barrel: [[0.1, 0, 0.1, 0.9, 1, 0.9]],
  cone: [[0.3, 0, 0.3, 0.7, 0.15, 0.7], [0.38, 0.15, 0.38, 0.62, 0.7, 0.62]],
  smallBox: [[0.15, 0, 0.15, 0.85, 0.7, 0.85]],
  hydrant: [[0.3, 0, 0.3, 0.7, 0.75, 0.7], [0.2, 0.4, 0.4, 0.8, 0.55, 0.6]],
  mailbox: [[0.42, 0, 0.42, 0.58, 0.75, 0.58], [0.25, 0.75, 0.15, 0.75, 1.0, 0.85]],
  toilet: [[0.25, 0, 0.3, 0.75, 0.45, 0.9], [0.2, 0.45, 0.25, 0.8, 0.55, 0.95], [0.2, 0.45, 0, 0.8, 1, 0.25]],
  bathtub: [[0, 0, 0, 1, 0.6, 1]],
  wallCabinet: [[0.1, 0.1, 0, 0.9, 0.9, 0.3]],
  tv: [[0.05, 0, 0.35, 0.95, 0.65, 0.65]],
  bench: [[0, 0.4, 0.2, 1, 0.5, 0.8], [0, 0.5, 0.7, 1, 0.95, 0.8], [0.05, 0, 0.3, 0.15, 0.4, 0.7], [0.85, 0, 0.3, 0.95, 0.4, 0.7]],
  pallet: [[0, 0, 0, 1, 0.15, 1]],
  rubble: [[0, 0, 0, 1, 0.4, 1]],
  gravestone: [[0.2, 0, 0.4, 0.8, 0.9, 0.6]],
  jersey: [[0, 0, 0.2, 1, 0.35, 0.8], [0, 0.35, 0.35, 1, 0.9, 0.65]],
  guardrail: [[0, 0.35, 0.42, 1, 0.75, 0.52], [0.45, 0, 0.5, 0.55, 0.7, 0.6]],
  lantern: [[0.35, 0, 0.35, 0.65, 0.45, 0.65]],
  pump: [[0.38, 0, 0.38, 0.62, 0.9, 0.62], [0.42, 0.65, 0.62, 0.58, 0.75, 0.95], [0.3, 0.8, 0.3, 0.7, 1, 0.7]],
  awning: [[0, 0.75, 0, 1, 0.875, 1]],
  register: [[0.2, 0, 0.25, 0.8, 0.4, 0.75]],
  ladder: [[0, 0, 0, 1, 1, 0.125]],
  campfire: [[0.1, 0, 0.1, 0.9, 0.2, 0.9]],
  streetLamp: [[0.4, 0, 0.4, 0.6, 0.6, 0.6], [0.2, 0.6, 0.2, 0.8, 0.8, 0.8]],
  sign: [[0, 0, 0, 1, 1, 0.1]],
  stopSign: [[0.45, 0, 0.45, 0.55, 0.3, 0.55], [0.15, 0.3, 0.45, 0.85, 1, 0.55]],
};
export { BOX as SHAPES };

const WOOD = { mat: 'wood', hp: 60, breakWith: null, flammable: true };
const LOG_DROPS = [['log', 1, 1, 1]];
const PLANK_DROPS = [['plank', 1, 2, 1]];

// ---------------------------------------------------------------------------
// NATURAL
def('air', { render: 'none', solid: false, opaque: false, mat: 'none' });
def('bedrock', { tex: 'bedrock' });
def('stone', { tex: 'stone' });
def('cobblestone', { tex: 'cobblestone' });
def('dirt', { tex: 'dirt', mat: 'dirt', hp: 25, breakWith: ['dig'] });
def('grass', { tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, mat: 'grass', hp: 25, breakWith: ['dig'], becomes: 'dirt' });
def('dry_grass', { tex: { top: 'dry_grass_top', bottom: 'dirt', side: 'dry_grass_side' }, mat: 'grass', hp: 25, breakWith: ['dig'], becomes: 'dirt' });
def('forest_floor', { tex: { top: 'forest_floor_top', bottom: 'dirt', side: 'forest_floor_side' }, mat: 'grass', stepSound: 'leaves', hp: 25, breakWith: ['dig'], becomes: 'dirt' });
def('sand', { tex: 'sand', mat: 'sand', hp: 20, breakWith: ['dig'] });
def('gravel', { tex: 'gravel', mat: 'gravel', hp: 25, breakWith: ['dig'] });
def('mud', { tex: 'mud', mat: 'dirt', slow: 0.8, hp: 25, breakWith: ['dig'] });
def('water', { tex: 'water', render: 'liquid', pass: 'translucent', solid: false, opaque: false, lightFilter: 2, mat: 'water', slow: 0.55 });
def('log_oak', { tex: { top: 'log_oak_top', bottom: 'log_oak_top', side: 'log_oak' }, ...WOOD, hp: 90, breakWith: ['chop', 'heavy'], drops: LOG_DROPS });
def('log_birch', { tex: { top: 'log_birch_top', bottom: 'log_birch_top', side: 'log_birch' }, ...WOOD, hp: 80, breakWith: ['chop', 'heavy'], drops: LOG_DROPS });
def('log_pine', { tex: { top: 'log_pine_top', bottom: 'log_pine_top', side: 'log_pine' }, ...WOOD, hp: 90, breakWith: ['chop', 'heavy'], drops: LOG_DROPS });
const LEAVES = { pass: 'cutout', opaque: false, lightFilter: 1, mat: 'leaves', sway: true, hp: 6, drops: [['stick', 0, 1, 0.3]], flammable: true };
def('leaves_oak', { tex: 'leaves_oak', ...LEAVES });
def('leaves_birch', { tex: 'leaves_birch', ...LEAVES });
def('leaves_pine', { tex: 'leaves_pine', ...LEAVES });
def('leaves_autumn', { tex: 'leaves_autumn', ...LEAVES });
def('leaves_autumn_red', { tex: 'leaves_autumn_red', ...LEAVES });
const PLANT = { render: 'cross', pass: 'cutout', solid: false, opaque: false, mat: 'plant', sway: true, hp: 1 };
def('tall_grass', { tex: 'tall_grass', ...PLANT, slow: 0.95 });
def('fern', { tex: 'fern', ...PLANT });
def('flower_red', { tex: 'flower_red', ...PLANT });
def('flower_yellow', { tex: 'flower_yellow', ...PLANT });
def('flower_white', { tex: 'flower_white', ...PLANT });
def('dead_bush', { tex: 'dead_bush', ...PLANT, sway: false, drops: [['stick', 0, 1, 0.5]] });
def('reeds', { tex: 'reeds', ...PLANT });
def('wheat', { tex: 'wheat', ...PLANT, slow: 0.85, drops: [['wheat', 1, 1, 0.5]] });
def('corn', { tex: 'corn_bottom', ...PLANT, slow: 0.75, hides: true });
def('corn_top', { tex: 'corn_top', ...PLANT, slow: 0.75, hides: true, drops: [['corn', 1, 2, 0.6]] });
def('bush', { tex: 'bush', pass: 'cutout', solid: false, opaque: false, lightFilter: 1, mat: 'leaves', sway: true, slow: 0.5, hides: true, hp: 10, drops: [['stick', 1, 2, 0.6]] });
def('berry_bush', { tex: 'berry_bush', pass: 'cutout', solid: false, opaque: false, lightFilter: 1, mat: 'leaves', sway: true, slow: 0.5, hides: true, interact: 'forage', hp: 10, becomes: 'bush' });
def('pumpkin', { tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side' }, mat: 'plant', hp: 10, drops: [['pumpkin', 1, 1, 1]] });
def('hay_bale', { tex: { top: 'hay_top', bottom: 'hay_top', side: 'hay_side' }, mat: 'grass', hp: 15, flammable: true });

// ---------------------------------------------------------------------------
// ROADS & GROUND
def('asphalt', { tex: 'asphalt', stepSound: 'stone' });
def('asphalt_cracked', { tex: 'asphalt_cracked' });
def('road_yellow_x', { tex: { top: 'road_yellow_x', bottom: 'asphalt', side: 'asphalt' } });
def('road_yellow_z', { tex: { top: 'road_yellow_z', bottom: 'asphalt', side: 'asphalt' } });
def('road_white_x', { tex: { top: 'road_white_x', bottom: 'asphalt', side: 'asphalt' } });
def('road_white_z', { tex: { top: 'road_white_z', bottom: 'asphalt', side: 'asphalt' } });
def('crosswalk_x', { tex: { top: 'crosswalk_x', bottom: 'asphalt', side: 'asphalt' } });
def('crosswalk_z', { tex: { top: 'crosswalk_z', bottom: 'asphalt', side: 'asphalt' } });
def('parking_line_x', { tex: { top: 'parking_line_x', bottom: 'asphalt', side: 'asphalt' } });
def('parking_line_z', { tex: { top: 'parking_line_z', bottom: 'asphalt', side: 'asphalt' } });
def('manhole', { tex: { top: 'manhole', bottom: 'asphalt', side: 'asphalt' }, mat: 'metal' });
def('sidewalk', { tex: { top: 'sidewalk', bottom: 'concrete', side: 'concrete' } });
def('concrete', { tex: 'concrete' });
def('concrete_dark', { tex: 'concrete_dark' });
def('concrete_white', { tex: 'concrete_white' });
def('dirt_path', { tex: { top: 'dirt_path_top', bottom: 'dirt', side: 'dirt' }, mat: 'dirt' });

// ---------------------------------------------------------------------------
// BUILDING EXTERIOR
def('brick_red', { tex: 'brick_red', hp: 400, breakWith: ['heavy'], drops: [['brick', 1, 2, 1]] });
def('brick_brown', { tex: 'brick_brown', hp: 400, breakWith: ['heavy'], drops: [['brick', 1, 2, 1]] });
def('brick_white', { tex: 'brick_white', hp: 400, breakWith: ['heavy'], drops: [['brick', 1, 2, 1]] });
def('stone_brick', { tex: 'stone_brick' });
const SIDING = { mat: 'wood', hp: 150, breakWith: ['chop', 'heavy'], drops: PLANK_DROPS };
def('siding_white', { tex: 'siding_white', ...SIDING });
def('siding_blue', { tex: 'siding_blue', ...SIDING });
def('siding_yellow', { tex: 'siding_yellow', ...SIDING });
def('siding_grey', { tex: 'siding_grey', ...SIDING });
def('siding_green', { tex: 'siding_green', ...SIDING });
def('siding_red', { tex: 'siding_red', ...SIDING });
def('planks_oak', { tex: 'planks_oak', ...WOOD, hp: 120, breakWith: ['chop', 'heavy', 'pry'], drops: PLANK_DROPS });
def('planks_dark', { tex: 'planks_dark', ...WOOD, hp: 120, breakWith: ['chop', 'heavy', 'pry'], drops: PLANK_DROPS });
def('planks_light', { tex: 'planks_light', ...WOOD, hp: 120, breakWith: ['chop', 'heavy', 'pry'], drops: PLANK_DROPS });
def('planks_white', { tex: 'planks_white', ...WOOD, hp: 120, breakWith: ['chop', 'heavy', 'pry'], drops: PLANK_DROPS });
def('barn_red', { tex: 'barn_red', ...WOOD, hp: 120, breakWith: ['chop', 'heavy', 'pry'], drops: PLANK_DROPS });
def('roof_dark', { tex: 'roof_dark', mat: 'wood' });
def('roof_red', { tex: 'roof_red', mat: 'wood' });
def('roof_brown', { tex: 'roof_brown', mat: 'wood' });
def('roof_tar', { tex: 'roof_tar', mat: 'gravel' });
def('roof_metal', { tex: 'roof_metal', mat: 'metal' });
def('roof_dark_stairs', { tex: 'roof_dark', render: 'boxes', boxes: BOX.stairs, oriented: true, mat: 'wood' });
def('roof_red_stairs', { tex: 'roof_red', render: 'boxes', boxes: BOX.stairs, oriented: true, mat: 'wood' });
def('roof_brown_stairs', { tex: 'roof_brown', render: 'boxes', boxes: BOX.stairs, oriented: true, mat: 'wood' });
def('roof_dark_slab', { tex: 'roof_dark', render: 'boxes', boxes: BOX.slab, mat: 'wood' });
def('roof_red_slab', { tex: 'roof_red', render: 'boxes', boxes: BOX.slab, mat: 'wood' });
def('roof_brown_slab', { tex: 'roof_brown', render: 'boxes', boxes: BOX.slab, mat: 'wood' });
def('metal_wall', { tex: 'metal_wall', mat: 'metal' });
def('corrugated_metal', { tex: 'corrugated_metal', mat: 'metal' });
def('garage_door', { tex: 'garage_door', mat: 'metal', hp: 300, breakWith: ['heavy'] });
def('glass', { tex: 'glass', pass: 'translucent', opaque: false, lightFilter: 0, mat: 'glass', hp: 8, becomes: 'glass_broken' });
def('glass_shop', { tex: 'glass_shop', pass: 'translucent', opaque: false, lightFilter: 0, mat: 'glass', hp: 10, becomes: 'glass_broken' });
def('glass_broken', { tex: 'glass_broken', pass: 'cutout', solid: false, opaque: false, mat: 'glass', slow: 0.6, damage: 1.5 });
def('awning_red', { tex: 'awning_red', render: 'boxes', boxes: BOX.awning, mat: 'cloth' });
def('awning_green', { tex: 'awning_green', render: 'boxes', boxes: BOX.awning, mat: 'cloth' });
def('awning_blue', { tex: 'awning_blue', render: 'boxes', boxes: BOX.awning, mat: 'cloth' });
def('sign_letter', { tex: { front: 'sign_A', side: 'sign_back', top: 'sign_back', bottom: 'sign_back' }, render: 'boxes', boxes: BOX.sign, oriented: true, mat: 'metal', solid: false });
def('sign_cross_red', { tex: { front: 'sign_cross_red', side: 'sign_back' }, render: 'boxes', boxes: BOX.sign, oriented: true, mat: 'metal', solid: false });
def('sign_cross_green', { tex: { front: 'sign_cross_green', side: 'sign_back' }, render: 'boxes', boxes: BOX.sign, oriented: true, mat: 'metal', solid: false });
def('stairs_wood', { tex: 'planks_oak', render: 'boxes', boxes: BOX.stairs, oriented: true, mat: 'wood' });
def('stairs_concrete', { tex: 'concrete', render: 'boxes', boxes: BOX.stairs, oriented: true });
def('slab_wood', { tex: 'planks_oak', render: 'boxes', boxes: BOX.slab, mat: 'wood' });
def('slab_concrete', { tex: 'concrete', render: 'boxes', boxes: BOX.slab });

// ---------------------------------------------------------------------------
// INTERIOR SURFACES
const WALL = { hp: 200, breakWith: ['heavy'], mat: 'stone' };
def('wall_white', { tex: 'wall_white', ...WALL });
def('wall_beige', { tex: 'wall_beige', ...WALL });
def('wall_green', { tex: 'wall_green', ...WALL });
def('wall_blue', { tex: 'wall_blue', ...WALL });
def('wallpaper_floral', { tex: 'wallpaper_floral', ...WALL });
def('wallpaper_stripe', { tex: 'wallpaper_stripe', ...WALL });
def('wall_tile', { tex: 'wall_tile', ...WALL });
def('wall_wood_panel', { tex: 'wall_wood_panel', ...WALL, mat: 'wood' });
def('floor_wood', { tex: 'floor_wood', mat: 'wood' });
def('floor_tile', { tex: 'floor_tile' });
def('floor_checker', { tex: 'floor_checker' });
def('floor_linoleum', { tex: 'floor_linoleum' });
def('floor_hospital', { tex: 'floor_hospital' });
def('carpet_red', { tex: 'carpet_red', mat: 'cloth' });
def('carpet_blue', { tex: 'carpet_blue', mat: 'cloth' });
def('carpet_beige', { tex: 'carpet_beige', mat: 'cloth' });
def('carpet_grey', { tex: 'carpet_grey', mat: 'cloth' });

// ---------------------------------------------------------------------------
// DOORS (two cells; meta bit3 marks top half). Material decides texture/hp.
const DOOR = { render: 'boxes', boxes: BOX.panelCenter, oriented: true, opaque: false, lightFilter: 0, pass: 'cutout' };
def('door_wood', { tex: { front: 'door_wood', back: 'door_wood', side: 'planks_dark', topTex: 'door_wood_top' }, ...DOOR, mat: 'wood', door: { hp: 140 }, drops: PLANK_DROPS });
def('door_white', { tex: { front: 'door_white', back: 'door_white', side: 'planks_white', topTex: 'door_white_top' }, ...DOOR, mat: 'wood', door: { hp: 110 }, drops: PLANK_DROPS });
def('door_metal', { tex: { front: 'door_metal', back: 'door_metal', side: 'metal_wall', topTex: 'door_metal_top' }, ...DOOR, mat: 'metal', door: { hp: 450 } });
def('door_glass', { tex: { front: 'door_glass', back: 'door_glass', side: 'metal_wall', topTex: 'door_glass_top' }, ...DOOR, mat: 'glass', door: { hp: 60 } });
def('door_cell', { tex: { front: 'iron_bars', back: 'iron_bars', side: 'iron_bars', topTex: 'iron_bars' }, ...DOOR, mat: 'metal', door: { hp: 800 } });
def('barricade', { tex: 'barricade', pass: 'cutout', opaque: false, mat: 'wood', hp: 160, drops: PLANK_DROPS });
def('iron_bars', { tex: 'iron_bars', pass: 'cutout', opaque: false, mat: 'metal' });
def('ladder', { tex: 'ladder', render: 'boxes', boxes: BOX.ladder, oriented: true, pass: 'cutout', solid: false, climbable: true, mat: 'wood' });

// ---------------------------------------------------------------------------
// OUTDOOR PROPS
const FENCE = { render: 'boxes', boxes: BOX.panelCenter, oriented: true, pass: 'cutout', opaque: false };
def('fence_picket', { tex: 'fence_picket', ...FENCE, mat: 'wood', hp: 50, drops: PLANK_DROPS });
def('fence_wood', { tex: 'fence_wood', ...FENCE, mat: 'wood', hp: 70, drops: PLANK_DROPS });
def('fence_chainlink', { tex: 'fence_chainlink', ...FENCE, mat: 'metal' });
def('fence_post', { tex: 'planks_dark', render: 'boxes', boxes: BOX.fencePost, mat: 'wood' });
def('barbed_wire', { tex: 'barbed_wire', render: 'cross', pass: 'cutout', solid: false, opaque: false, mat: 'metal', slow: 0.3, damage: 4 });
def('sandbags', { tex: 'sandbags', mat: 'sand' });
def('hesco', { tex: { top: 'hesco_top', bottom: 'hesco_top', side: 'hesco_side' }, mat: 'sand' });
def('jersey_barrier', { tex: 'jersey_barrier', render: 'boxes', boxes: BOX.jersey, oriented: true });
def('guardrail', { tex: 'guardrail', render: 'boxes', boxes: BOX.guardrail, oriented: true, mat: 'metal' });
def('traffic_cone', { tex: 'traffic_cone', render: 'boxes', boxes: BOX.cone, mat: 'cloth' });
def('street_pole', { tex: 'metal_pole', render: 'boxes', boxes: BOX.pole, mat: 'metal' });
def('street_lamp', { tex: { top: 'metal_pole', side: 'metal_pole', bottom: 'street_lamp_bottom' }, render: 'boxes', boxes: BOX.streetLamp, mat: 'metal' });
def('utility_pole', { tex: { top: 'log_pine_top', bottom: 'log_pine_top', side: 'utility_pole' }, render: 'boxes', boxes: BOX.thickPole, mat: 'wood' });
def('traffic_light', { tex: { front: 'traffic_light', back: 'traffic_light_back', side: 'traffic_light_back' }, render: 'boxes', boxes: [[0.3, 0, 0.3, 0.7, 1, 0.7]], oriented: true, mat: 'metal' });
def('stop_sign', { tex: { front: 'stop_sign', back: 'sign_back', side: 'metal_pole' }, render: 'boxes', boxes: BOX.stopSign, oriented: true, mat: 'metal' });
def('mailbox', { tex: 'mailbox', render: 'boxes', boxes: BOX.mailbox, mat: 'metal', container: 'mailbox', slots: 3 });
def('fire_hydrant', { tex: 'fire_hydrant', render: 'boxes', boxes: BOX.hydrant, mat: 'metal' });
def('bench', { tex: 'planks_oak', render: 'boxes', boxes: BOX.bench, oriented: true, mat: 'wood' });
def('trash_can', { tex: { top: 'trash_can_top', bottom: 'trash_can_top', side: 'trash_can' }, render: 'boxes', boxes: BOX.barrel, mat: 'metal', container: 'trash', slots: 4 });
def('dumpster', { tex: { top: 'dumpster_top', bottom: 'dumpster_top', side: 'dumpster' }, mat: 'metal', container: 'dumpster', slots: 10 });
def('vending_machine', { tex: { front: 'vending_front', side: 'vending_side', top: 'vending_side' }, oriented: true, mat: 'metal', container: 'vending', slots: 8 });
def('gas_pump', { tex: { front: 'gas_pump_front', side: 'gas_pump_side', top: 'gas_pump_side' }, oriented: true, mat: 'metal', interact: 'gas_pump' });
def('water_pump', { tex: 'water_pump', render: 'boxes', boxes: BOX.pump, mat: 'metal', interact: 'water_pump' });
def('rain_barrel', { tex: { top: 'rain_barrel_top', bottom: 'barrel_rust_top', side: 'rain_barrel' }, render: 'boxes', boxes: BOX.barrel, mat: 'metal', interact: 'rain_barrel' });
def('gravestone', { tex: 'gravestone', render: 'boxes', boxes: BOX.gravestone, oriented: true });
def('tent_green', { tex: 'tent_green', mat: 'cloth', opaque: true });
def('tent_orange', { tex: 'tent_orange', mat: 'cloth', opaque: true });
def('tent_white', { tex: 'tent_white', mat: 'cloth', opaque: true });
def('camo_net', { tex: 'camo_net', pass: 'cutout', solid: false, opaque: false, lightFilter: 2, mat: 'cloth' });
def('rubble', { tex: 'rubble', render: 'boxes', boxes: BOX.rubble, mat: 'gravel' });
def('trash_bags', { tex: 'trash_bags', render: 'boxes', boxes: BOX.rubble, mat: 'cloth', container: 'trash', slots: 4 });
def('pallet', { tex: 'pallet', render: 'boxes', boxes: BOX.pallet, mat: 'wood', drops: PLANK_DROPS, hp: 20 });
def('barrel_rust', { tex: { top: 'barrel_rust_top', bottom: 'barrel_rust_top', side: 'barrel_rust' }, render: 'boxes', boxes: BOX.barrel, mat: 'metal', container: 'barrel', slots: 4 });
def('barrel_burning', { tex: { top: 'barrel_fire_top', bottom: 'barrel_rust_top', side: 'barrel_rust' }, render: 'boxes', boxes: BOX.barrel, mat: 'metal', light: 14, interact: 'campfire' });
def('campfire', { tex: { top: 'campfire_top', bottom: 'campfire_top', side: 'campfire_side' }, render: 'boxes', boxes: BOX.campfire, solid: false, mat: 'wood', light: 15, interact: 'campfire', damage: 3 });
def('campfire_out', { tex: { top: 'campfire_out', bottom: 'campfire_out', side: 'campfire_side' }, render: 'boxes', boxes: BOX.campfire, solid: false, mat: 'wood', interact: 'campfire_out' });
def('fire', { tex: 'fire', render: 'cross', pass: 'cutout', solid: false, opaque: false, light: 15, damage: 8, mat: 'none' });
def('lantern', { tex: 'lantern', render: 'boxes', boxes: BOX.lantern, solid: false, light: 13, mat: 'metal', pass: 'cutout' });

// ---------------------------------------------------------------------------
// FURNITURE & CONTAINERS
def('fridge', { tex: { front: 'fridge_front', side: 'metal_white', top: 'metal_white' }, oriented: true, mat: 'metal', container: 'fridge', slots: 8 });
def('freezer', { tex: { front: 'freezer_front', side: 'metal_white', top: 'metal_white' }, oriented: true, mat: 'metal', container: 'freezer', slots: 6 });
def('stove', { tex: { front: 'stove_front', side: 'metal_white', top: 'stove_top' }, oriented: true, mat: 'metal', container: 'stove', slots: 4 });
def('kitchen_cabinet', { tex: { front: 'cabinet_front', side: 'cabinet_side', top: 'counter_top' }, oriented: true, mat: 'wood', container: 'kitchen', slots: 8 });
def('kitchen_sink', { tex: { front: 'cabinet_front', side: 'cabinet_side', top: 'sink_top' }, oriented: true, mat: 'wood', container: 'under_sink', slots: 4, interact: 'sink' });
def('table', { tex: { top: 'table_top', bottom: 'planks_oak', side: 'planks_oak' }, render: 'boxes', boxes: BOX.table, mat: 'wood', ...{ hp: 40, drops: PLANK_DROPS } });
def('chair', { tex: 'planks_dark', render: 'boxes', boxes: BOX.chair, oriented: true, mat: 'wood', hp: 20, drops: [['plank', 1, 1, 1]] });
def('couch', { tex: 'couch', render: 'boxes', boxes: BOX.couch, oriented: true, mat: 'cloth', container: 'couch', slots: 3 });
def('couch_blue', { tex: 'couch_blue', render: 'boxes', boxes: BOX.couch, oriented: true, mat: 'cloth', container: 'couch', slots: 3 });
def('bed_head', { tex: { top: 'bed_head_top', side: 'bed_side', bottom: 'planks_oak' }, render: 'boxes', boxes: BOX.bed, oriented: true, mat: 'cloth', interact: 'bed' });
def('bed_foot', { tex: { top: 'bed_foot_top', side: 'bed_side', bottom: 'planks_oak' }, render: 'boxes', boxes: BOX.bed, oriented: true, mat: 'cloth', interact: 'bed' });
def('hospital_bed', { tex: { top: 'hospital_bed_top', side: 'hospital_bed_side', bottom: 'metal_white' }, render: 'boxes', boxes: BOX.bed, oriented: true, mat: 'metal', interact: 'bed' });
def('wardrobe', { tex: { front: 'wardrobe_front', side: 'planks_dark', top: 'planks_dark' }, oriented: true, mat: 'wood', container: 'wardrobe', slots: 10 });
def('dresser', { tex: { front: 'dresser_front', side: 'planks_oak', top: 'planks_oak' }, render: 'boxes', boxes: BOX.low, oriented: true, mat: 'wood', container: 'dresser', slots: 6 });
def('bookshelf', { tex: { front: 'bookshelf_front', side: 'planks_dark', top: 'planks_dark' }, oriented: true, mat: 'wood', container: 'bookshelf', slots: 6 });
def('desk', { tex: { front: 'desk_front', side: 'planks_dark', top: 'desk_top' }, render: 'boxes', boxes: BOX.low, oriented: true, mat: 'wood', container: 'desk', slots: 5 });
def('tv', { tex: { front: 'tv_front', side: 'tv_side', top: 'tv_side' }, render: 'boxes', boxes: BOX.tv, oriented: true, mat: 'metal' });
def('toilet', { tex: 'toilet', render: 'boxes', boxes: BOX.toilet, oriented: true, mat: 'glass', interact: 'toilet' });
def('bathtub', { tex: { top: 'bathtub_top', side: 'ceramic', bottom: 'ceramic' }, render: 'boxes', boxes: BOX.bathtub, oriented: true, mat: 'glass' });
def('medicine_cabinet', { tex: { front: 'medicine_cabinet_front', side: 'metal_white', top: 'metal_white' }, render: 'boxes', boxes: BOX.wallCabinet, oriented: true, mat: 'metal', container: 'medicine_cabinet', slots: 4 });
def('washing_machine', { tex: { front: 'washer_front', side: 'metal_white', top: 'washer_top' }, oriented: true, mat: 'metal', container: 'laundry', slots: 5 });
def('workbench', { tex: { top: 'workbench_top', side: 'workbench_side', bottom: 'planks_oak' }, mat: 'wood', container: 'workbench', slots: 6, interact: 'workbench' });
def('metal_shelf', { tex: { front: 'metal_shelf', side: 'metal_shelf_side', top: 'metal_shelf_side' }, oriented: true, mat: 'metal', container: 'garage', slots: 8 });
def('toolbox', { tex: { top: 'toolbox_top', side: 'toolbox' }, render: 'boxes', boxes: [[0.2, 0, 0.3, 0.8, 0.35, 0.7]], mat: 'metal', container: 'toolbox', slots: 4 });
def('gun_cabinet', { tex: { front: 'gun_cabinet_front', side: 'planks_dark', top: 'planks_dark' }, oriented: true, mat: 'wood', container: 'gun_cabinet', slots: 6 });
def('safe', { tex: { front: 'safe_front', side: 'safe_side', top: 'safe_side' }, oriented: true, mat: 'metal', container: 'safe', slots: 6 });
def('store_shelf', { tex: { front: 'store_shelf_food', side: 'metal_shelf_side', top: 'metal_shelf_side' }, oriented: true, mat: 'metal', container: 'store_food', slots: 10 });
def('store_shelf_misc', { tex: { front: 'store_shelf_misc', side: 'metal_shelf_side', top: 'metal_shelf_side' }, oriented: true, mat: 'metal', container: 'store_general', slots: 10 });
def('store_shelf_meds', { tex: { front: 'store_shelf_meds', side: 'metal_shelf_side', top: 'metal_shelf_side' }, oriented: true, mat: 'metal', container: 'pharmacy', slots: 10 });
def('store_shelf_empty', { tex: { front: 'store_shelf_empty', side: 'metal_shelf_side', top: 'metal_shelf_side' }, oriented: true, mat: 'metal', container: 'store_looted', slots: 10 });
def('cooler', { tex: { front: 'cooler_front', side: 'metal_white', top: 'metal_white' }, oriented: true, mat: 'glass', container: 'store_drinks', slots: 10 });
def('checkout', { tex: { front: 'checkout_front', side: 'checkout_front', top: 'counter_top' }, oriented: true, mat: 'wood', container: 'checkout', slots: 4 });
def('cash_register', { tex: { front: 'cash_register', side: 'tv_side', top: 'cash_register_top' }, render: 'boxes', boxes: BOX.register, oriented: true, mat: 'metal' });
def('clothing_rack', { tex: 'clothing_rack', pass: 'cutout', opaque: false, oriented: true, mat: 'cloth', container: 'clothing_store', slots: 8 });
def('filing_cabinet', { tex: { front: 'filing_cabinet', side: 'metal_grey', top: 'metal_grey' }, oriented: true, mat: 'metal', container: 'office', slots: 6 });
def('locker', { tex: { front: 'locker_front', side: 'metal_grey', top: 'metal_grey' }, oriented: true, mat: 'metal', container: 'locker', slots: 6 });
def('medical_cabinet', { tex: { front: 'medical_cabinet_front', side: 'metal_white', top: 'metal_white' }, oriented: true, mat: 'metal', container: 'hospital', slots: 8 });
def('crate_wood', { tex: 'crate_wood', mat: 'wood', container: 'crate', slots: 8, hp: 40, drops: PLANK_DROPS });
def('crate_military', { tex: { top: 'crate_military_top', bottom: 'crate_military_top', side: 'crate_military' }, mat: 'wood', container: 'military_crate', slots: 10 });
def('cardboard_box', { tex: { top: 'cardboard_top', bottom: 'cardboard_top', side: 'cardboard_box' }, render: 'boxes', boxes: BOX.smallBox, mat: 'cloth', container: 'cardboard', slots: 4 });
def('bar_counter', { tex: { front: 'bar_counter_front', side: 'bar_counter_front', top: 'counter_wood_top' }, oriented: true, mat: 'wood', container: 'bar', slots: 6 });
def('pew', { tex: 'planks_dark', render: 'boxes', boxes: BOX.bench, oriented: true, mat: 'wood' });
def('chalkboard', { tex: { front: 'chalkboard', side: 'planks_dark' }, render: 'boxes', boxes: BOX.panelBack, oriented: true, mat: 'wood', solid: false });
def('radio', { tex: { front: 'radio_front', side: 'tv_side', top: 'tv_side' }, render: 'boxes', boxes: BOX.register, oriented: true, mat: 'metal', interact: 'radio' });
def('floorboard_loose', { tex: 'floor_wood', mat: 'wood', container: 'stash', slots: 4 }); // hidden stash: looks like floor
def('hollow_log', { tex: { top: 'log_oak_top', bottom: 'log_oak_top', side: 'log_oak' }, mat: 'wood', container: 'stash', slots: 4 });

// ---------------------------------------------------------------------------
export const BLOCKS = defs;
/** name -> id */
export const B = {};
defs.forEach((d, i) => {
  d.id = i;
  B[d.name] = i;
});
if (defs.length > 255) throw new Error('Too many block types: ' + defs.length);

// Resolve 'becomes' names to ids
for (const d of defs) {
  d.becomesId = typeof d.becomes === 'string' ? B[d.becomes] : 0;
}

export function blockByName(name) {
  const id = B[name];
  if (id === undefined) throw new Error('Unknown block: ' + name);
  return defs[id];
}

// Fast lookup tables (indexed by id)
export const SOLID = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256); // full opaque cube: hides neighbor faces and blocks light
export const LIGHT_EMIT = new Uint8Array(256);
export const LIGHT_FILTER = new Uint8Array(256);
export const IS_CONTAINER = new Uint8Array(256);
export const IS_DOOR = new Uint8Array(256);
export const IS_FULL_CUBE = new Uint8Array(256); // collision is a full unit cube
for (const d of defs) {
  SOLID[d.id] = d.solid ? 1 : 0;
  OPAQUE[d.id] = d.opaque && d.render === 'cube' ? 1 : 0;
  LIGHT_EMIT[d.id] = d.light;
  LIGHT_FILTER[d.id] = OPAQUE[d.id] ? 15 : d.lightFilter;
  IS_CONTAINER[d.id] = d.container ? 1 : 0;
  IS_DOOR[d.id] = d.door ? 1 : 0;
  IS_FULL_CUBE[d.id] = d.solid && (d.render === 'cube' || d.render === 'liquid') ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Shapes / rotation helpers (shared by mesher and physics)

/** Rotate a facing-0 box by facing f around block center. */
export function rotateBox(b, f) {
  const [x0, y0, z0, x1, y1, z1] = b;
  switch (f & 3) {
    case 0: return [x0, y0, z0, x1, y1, z1];
    // (cx,cz) -> (-cz, cx) : x' = 1 - z, z' = x
    case 1: return [1 - z1, y0, x0, 1 - z0, y1, x1];
    case 2: return [1 - x1, y0, 1 - z1, 1 - x0, y1, 1 - z0];
    // (cx,cz) -> (cz, -cx) : x' = z, z' = 1 - x
    case 3: return [z0, y0, 1 - x1, z1, y1, 1 - x0];
  }
  return b;
}

const DOOR_CLOSED = [[0, 0, 0.40625, 1, 1, 0.59375]];
const DOOR_OPEN = [[0, 0, 0, 0.1875, 1, 1]];
const DOOR_BARRICADE = [[0, 0, 0.40625, 1, 1, 0.59375], [0, 0, 0.59375, 1, 1, 0.71875]];
const FULL = [[0, 0, 0, 1, 1, 1]];
const rotCache = new Map();

/**
 * Collision / render boxes for a block given its meta. Returns array of [x0,y0,z0,x1,y1,z1].
 * Full cubes return FULL.
 */
export function getBoxes(id, meta = 0) {
  const d = defs[id];
  if (d.render === 'cube' || d.render === 'liquid') return FULL;
  if (d.render === 'cross' || d.render === 'none') return null;
  let base = d.boxes;
  if (d.door) {
    base = meta & 4 ? DOOR_OPEN : meta & 16 ? DOOR_BARRICADE : DOOR_CLOSED;
  }
  const f = d.oriented ? meta & 3 : 0;
  const key = id * 64 + (meta & 31);
  let r = rotCache.get(key);
  if (!r) {
    r = f === 0 ? base : base.map((b) => rotateBox(b, f));
    rotCache.set(key, r);
  }
  return r;
}

/** Collision boxes (null = not solid). Doors: open doors still collide with the thin panel. */
export function getCollisionBoxes(id, meta = 0) {
  const d = defs[id];
  if (!d.solid) return null;
  return getBoxes(id, meta);
}

/** Facing direction vectors */
export const FACING_DIR = [
  [0, 0, 1], // 0 +Z south
  [-1, 0, 0], // 1 -X west
  [0, 0, -1], // 2 -Z north
  [1, 0, 0], // 3 +X east
];

/** facing index whose front points toward the given (dx,dz) direction */
export function facingFromDir(dx, dz) {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 3 : 1;
  return dz > 0 ? 0 : 2;
}

/**
 * Texture name for a face. face: 0 +X,1 -X,2 +Y,3 -Y,4 +Z,5 -Z. meta for oriented / sign blocks.
 */
const FACE_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export function faceTexture(d, face, meta = 0) {
  const t = d.tex;
  if (d.door && (face === 2 || face === 3)) return t.side;
  if (face === 2) return t.top || t.all || t.side;
  if (face === 3) return t.bottom || t.top || t.all || t.side;
  if (d.oriented) {
    const fd = FACING_DIR[meta & 3];
    const n = FACE_DIRS[face];
    if (n[0] === fd[0] && n[2] === fd[2]) {
      if (d.name === 'sign_letter') return 'sign_' + signCharName(meta >> 2);
      if (d.door && meta & 8) return t.topTex || t.front;
      return t.front || t.all || t.side;
    }
    if (n[0] === -fd[0] && n[2] === -fd[2]) {
      if (d.door && meta & 8) return t.topTex || t.back;
      return t.back || t.side || t.all;
    }
    // Open doors are rotated 90deg: their broad faces point sideways
    if (d.door && meta & 4) return meta & 8 ? t.topTex || t.front : t.front;
  }
  return t.side || t.all;
}

export function signCharName(i) {
  const c = SIGN_CHARS[i] || ' ';
  if (/[A-Z0-9]/.test(c)) return c;
  return { ' ': 'blank', '-': 'dash', '+': 'plus', '!': 'excl', '&': 'amp', '.': 'dot', "'": 'apos', '#': 'hash' }[c] || 'blank';
}

/** Every texture name referenced by any block (plus extras used by FX / sky). */
export function allTextureNames() {
  const set = new Set();
  for (const d of defs) {
    if (d.render === 'none') continue;
    for (const k of Object.keys(d.tex)) set.add(d.tex[k]);
  }
  for (const c of SIGN_CHARS) set.add('sign_' + signCharName(SIGN_CHARS.indexOf(c)));
  for (const extra of EXTRA_TEXTURES) set.add(extra);
  return [...set];
}

/** Non-block textures that must also be generated into the texture array. */
export const EXTRA_TEXTURES = [
  'destroy_1', 'destroy_2', 'destroy_3', 'destroy_4', // block crack overlay stages (alpha)
];
