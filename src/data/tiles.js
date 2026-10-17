// TILE CATALOG — shared contract between maps (data/maps), the engine (engine/map.js),
// lighting (render/lighting.js) and art (art/tiles.js).
//
// Maps are authored as arrays of strings; each character maps to a tile key through LEGEND
// (a map may extend/override it with its own `legend`).
//
// kind:
//   'floor'  walkable ground. `surface` drives footstep sounds.
//   'wall'   solid + light-occluding block, AUTOTILED by the engine into
//            'top' | 'face_high' | 'face_low' (faces always look SOUTH, toward the camera).
//            A wall cell whose south neighbour is walkable becomes face_low; the cell above a
//            face_low whose 2-south neighbour is walkable becomes face_high; everything else is top.
//            => North walls of rooms/halls should be 3 cells thick (top + 2 face rows).
//   'window' a wall cell that renders a window when it is in a face position (else a top).
//            Face-position windows emit moonlight into the room and flash on lightning.
//   'door'   'D' — passable threshold cut through a wall. The engine auto-creates a door prop for
//            each vertical run of D cells (see TECH.md §Doors). Never place D in open floor.
//   'special' anything else (void, pit, railing, stage front, stairs).
//
// solid:  blocks movement.   opaque: blocks light & sight (Colonel vision, flashlight).
// surface: footstep surface id (see SURFACES).

export const SURFACES = [
  'lino', 'wood', 'tile', 'concrete', 'carpet', 'water',
  'coal', 'gravel', 'asphalt', 'grass', 'stone', 'metal',
];

export const TILES = {
  // ---------------------------------------------------------------- floors
  floor_lino:      { kind: 'floor', surface: 'lino',     desc: 'classroom linoleum, 9" checker in faded tan/green' },
  floor_lino_hall: { kind: 'floor', surface: 'lino',     desc: 'corridor linoleum, darker, long worn runner down the middle' },
  floor_wood:      { kind: 'floor', surface: 'wood',     desc: 'maple boards (gym, stage, auditorium aisles, library)' },
  floor_tile:      { kind: 'floor', surface: 'tile',     desc: 'small hex/square ceramic tile (restrooms, showers, kitchen)' },
  floor_concrete:  { kind: 'floor', surface: 'concrete', desc: 'stained poured concrete (basement)' },
  floor_carpet:    { kind: 'floor', surface: 'carpet',   desc: 'thin institutional carpet, rust/brown (offices, library reading area)' },
  floor_water:     { kind: 'floor', surface: 'water',    desc: 'shallow standing water over concrete/lino; animated ripples', animated: true },
  floor_coal:      { kind: 'floor', surface: 'coal',     desc: 'loose anthracite underfoot' },
  floor_gravel:    { kind: 'floor', surface: 'gravel',   desc: 'dirt, slate chips, mine floor' },
  floor_asphalt:   { kind: 'floor', surface: 'asphalt',  desc: 'cracked wet parking-lot asphalt, faded paint lines' },
  floor_grass:     { kind: 'floor', surface: 'grass',    desc: 'dead October grass and leaves' },
  floor_stone:     { kind: 'floor', surface: 'stone',    desc: 'worn granite steps / plaza flags' },
  floor_marble:    { kind: 'floor', surface: 'stone',    desc: 'black-and-white marble (Founder\'s Vault, lobby inlay)' },
  floor_planks:    { kind: 'floor', surface: 'wood',     desc: 'rough coal-black breaker planks with gaps' },
  floor_grate:     { kind: 'floor', surface: 'metal',    desc: 'iron grating / steel plate' },
  floor_debris:    { kind: 'floor', surface: 'gravel',   desc: 'fallen ceiling tile, plaster chunks, glass (walkable)' },
  floor_stairs_up:   { kind: 'special', surface: 'stone', desc: 'stair treads going up (visual; transfers via map exits)' },
  floor_stairs_down: { kind: 'special', surface: 'stone', desc: 'stair treads going down (visual; transfers via map exits)' },

  // ---------------------------------------------------------------- walls (autotiled)
  wall_plaster:  { kind: 'wall', solid: true, opaque: true, desc: 'painted cinderblock: institutional green below a chair rail, nicotine cream above; peeling' },
  wall_brick:    { kind: 'wall', solid: true, opaque: true, desc: 'red-brown brick (exterior facade, lobby, stairwells)' },
  wall_tile:     { kind: 'wall', solid: true, opaque: true, desc: 'glazed tile wainscot (restrooms, showers, kitchen)' },
  wall_panel:    { kind: 'wall', solid: true, opaque: true, desc: 'dark wood paneling (library, principal, auditorium)' },
  wall_concrete: { kind: 'wall', solid: true, opaque: true, desc: 'raw concrete, sweating, pipes (basement)' },
  wall_rock:     { kind: 'wall', solid: true, opaque: true, desc: 'rock and coal seam (deep passages, breaker cavern)' },
  wall_marble:   { kind: 'wall', solid: true, opaque: true, desc: 'veined marble (Founder\'s Vault)' },
  wall_timber:   { kind: 'wall', solid: true, opaque: true, desc: 'black tarred breaker timbers' },
  wall_gym:      { kind: 'wall', solid: true, opaque: true, desc: 'painted block with a green-and-gold stripe (gym, locker rooms)' },
  wall_rubble:   { kind: 'wall', solid: true, opaque: true, desc: 'collapsed ceiling/stair debris blocking a passage' },
  window_plaster:{ kind: 'window', solid: true, opaque: true, desc: 'tall wood-sash window in a painted wall; rain streaks; moonlight' },
  window_brick:  { kind: 'window', solid: true, opaque: true, desc: 'tall window set in brick (facade, stairwells)' },

  // ---------------------------------------------------------------- special
  void:        { kind: 'special', solid: true, opaque: true,  desc: 'nothing — outside the playable space; drawn black' },
  pit:         { kind: 'special', solid: true, opaque: false, desc: 'open drop (breaker abyss); dark with red glow far below' },
  railing:     { kind: 'special', solid: true, opaque: false, surface: 'metal', desc: 'balcony/walkway railing (iron or wood); see-through' },
  stage_front: { kind: 'special', solid: true, opaque: false, desc: 'front face of the raised stage (wood apron, ~1 tile tall)' },
  door:        { kind: 'door',    solid: false, opaque: false, surface: 'wood', desc: 'door threshold cell (engine creates the door prop)' },
};

// Default character legend. Maps may add `legend: { 'x': 'tile_key' }` to override/extend.
export const LEGEND = {
  ' ': 'void',
  '.': 'floor_lino',
  ',': 'floor_lino_hall',
  '=': 'floor_wood',
  '_': 'floor_tile',
  ':': 'floor_concrete',
  '"': 'floor_carpet',
  '~': 'floor_water',
  '%': 'floor_coal',
  ';': 'floor_gravel',
  'a': 'floor_asphalt',
  'g': 'floor_grass',
  's': 'floor_stone',
  'm': 'floor_marble',
  'p': 'floor_planks',
  'r': 'floor_grate',
  'd': 'floor_debris',
  '^': 'floor_stairs_up',
  'v': 'floor_stairs_down',
  '#': 'wall_plaster',
  'B': 'wall_brick',
  'T': 'wall_tile',
  'P': 'wall_panel',
  'C': 'wall_concrete',
  'R': 'wall_rock',
  'M': 'wall_marble',
  'K': 'wall_timber',
  'G': 'wall_gym',
  'X': 'wall_rubble',
  'W': 'window_plaster',
  'U': 'window_brick',
  'Z': 'pit',
  '|': 'railing',
  'F': 'stage_front',
  'D': 'door',
};

export function tileDef(key) {
  const t = TILES[key];
  if (!t) throw new Error(`Unknown tile key: ${key}`);
  return t;
}
