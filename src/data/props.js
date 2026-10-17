// PROP CATALOG — shared contract between maps (objects / prop layers), the engine (collision,
// interaction, hiding, y-sort), lighting (opaque props, attached lights) and art (art/props.js).
//
// Footprint: w×h in tiles, anchored at the object's (x,y) = top-left footprint cell.
// Art may draw beyond the footprint (tall things extend upward); y-sort key = bottom edge of footprint.
//
// Fields
//   w,h          footprint in tiles (default 1×1)
//   solid        blocks movement (default true)
//   opaque       blocks light/sight (default false)
//   mount        'floor' (default) | 'wall' (drawn on a wall FACE, before entities, never y-sorted;
//                place it on the face_low cell row of a north wall, x = leftmost cell) |
//                'decal' (drawn on the floor layer, under everything) | 'over' (drawn above entities:
//                overhead pipes, cobwebs, tree canopy)
//   seat         interact → Tess sits here (hide spot; "seated & still" rule R2). `sitDir` = facing.
//   hide         'locker' → Tess climbs inside (hide spot; locker overlay).
//   reflective   mirror/glass: the compact & Adair can appear here; dark CRTs count.
//   interact     default interaction kind: 'examine' | 'door' | 'pickup' | 'terminal' | 'pa' | 'safe' |
//                'register' | 'lever' | 'switch' | 'transfer' | 'script'
//   states       allowed state names (first = default)
//   light        attached light preset id (see TECH.md §Lighting presets)
//   dynamic      art draws it every frame with live params (clock hands, chalk text, memorial board)
//   frames       number of animation frames (art provides; engine cycles at `fps`)
//   examine      default examine line (maps override per instance)
//   desc         art brief

export const PROPS = {
  // ================================================================ doors & passages
  door_class:   { w: 1, h: 2, solid: true, opaque: true, interact: 'door', states: ['closed', 'open', 'locked', 'jammed'],
                  desc: 'oak classroom door, narrow wired-glass window at head height, brass knob, room number plate' },
  door_double:  { w: 2, h: 2, solid: true, opaque: true, interact: 'door', states: ['closed', 'open', 'locked', 'chained', 'jammed'],
                  desc: 'pair of steel-framed doors w/ small windows and push bars (lobby, gym, cafeteria, auditorium)' },
  door_metal:   { w: 1, h: 2, solid: true, opaque: true, interact: 'door', states: ['closed', 'open', 'locked'],
                  desc: 'painted steel door, dented, stenciled (basement, boiler, electrical)' },
  door_glass:   { w: 1, h: 2, solid: true, opaque: false, interact: 'door', states: ['closed', 'open', 'locked'],
                  desc: 'office door with frosted glass and gold-leaf lettering (MAIN OFFICE / PRINCIPAL / NURSE)' },
  door_side:    { w: 1, h: 1, solid: true, opaque: true, interact: 'door', states: ['closed', 'open', 'locked'],
                  desc: 'door in a vertical (east/west) wall, seen edge-on' },
  door_front:   { w: 2, h: 2, solid: true, opaque: true, interact: 'door', states: ['chained', 'closed', 'open'],
                  desc: 'the school\'s heavy oak front double doors with iron strap hinges; chain + padlock state' },
  gate_accordion:{ w: 2, h: 1, solid: true, opaque: false, interact: 'door', states: ['locked', 'open'],
                  desc: 'steel accordion security gate across a stair opening, padlocked' },
  trapdoor:     { w: 2, h: 2, solid: false, mount: 'decal', interact: 'script', states: ['closed', 'open'],
                  desc: 'stage trapdoor: plank square with iron ring; open = black square, ladder rungs' },
  stair_spiral: { w: 2, h: 2, solid: true, interact: 'transfer', desc: 'cast-iron spiral stair (library, vault)' },
  coal_chute:   { w: 2, h: 1, mount: 'wall', interact: 'script', states: ['locked', 'cut', 'open'],
                  desc: 'iron coal-chute hatch in the basement wall, rusted grate, padlock; gray predawn light when open' },

  // ================================================================ classroom
  desk_student: { seat: true, sitDir: 'up', states: ['default', 'scattered', 'overturned'],
                  desc: '1970s combo chair-desk, tan laminate top, tubular legs, carved initials; scattered = rotated/askew' },
  desk_teacher: { w: 2, desc: 'steel teacher desk, green-gray, papers, apple-shaped paperweight' },
  chair_teacher:{ seat: true, sitDir: 'down', desc: 'wooden swivel chair' },
  tiny_chair:   { seat: true, sitDir: 'up', desc: 'kindergarten chair, primary colors faded' },
  tiny_table:   { w: 2, desc: 'low kindergarten table, crayon marks' },
  chalkboard:   { w: 3, mount: 'wall', dynamic: true, states: ['blank', 'text'],
                  desc: 'slate chalkboard w/ wooden tray, ghost of erased writing; dynamic chalk text param `text`' },
  bulletin_board:{ w: 2, mount: 'wall', states: ['generic', 'bell_schedule', 'brood', 'heritage', 'ourtown', 'computers', 'kinder'],
                  desc: 'cork board with curling papers; state picks the content' },
  clock_wall:   { mount: 'wall', dynamic: true, desc: 'round institutional wall clock, cage guard; hands drawn live' },
  flag_us:      { mount: 'wall', desc: 'small faded US flag on a wall bracket' },
  poster:       { mount: 'wall', states: ['read', 'homecoming79', 'periodic', 'foodgroups', 'pa_map', 'alphabet', 'ourtown', 'patrol', 'computer', 'band'],
                  desc: 'curling 1970s school poster' },
  cubbies:      { w: 2, desc: 'kindergarten cubbies with name strips and a forgotten mitten' },
  drawings_wall:{ w: 2, mount: 'wall', desc: 'crayon drawings taped to the wall, "WHEN I GROW UP"' },
  alphabet_strip:{ w: 3, mount: 'wall', desc: 'cursive alphabet strip above the chalkboard' },
  bookshelf_low:{ w: 2, desc: 'low classroom bookshelf, textbooks fallen over' },
  globe:        { desc: 'desk globe on a stand (pre-1990 borders)' },
  projector:    { desc: 'overhead projector on a rolling cart' },
  trash_can:    { desc: 'dented metal wastebasket' },
  radiator:     { w: 2, desc: 'cast-iron radiator under a window, painted over many times' },
  coat_hooks:   { w: 2, mount: 'wall', desc: 'row of coat hooks; one old scarf' },

  // ================================================================ hallway
  locker:       { hide: null, states: ['closed', 'open', 'dented'],
                  desc: 'tall olive steel locker w/ vent slits; place directly in front of a north-wall face; ' +
                        'set instance `hide: "locker"` to make it a hiding spot' },
  water_fountain:{ desc: 'porcelain wall drinking fountain, rust stain' },
  trophy_case:  { w: 3, reflective: true, desc: 'oak and glass trophy case; tarnished trophies, a 1978 district banner' },
  fire_extinguisher:{ mount: 'wall', desc: 'red extinguisher in a wall cabinet' },
  exit_sign:    { mount: 'wall', light: 'exit_sign', states: ['on', 'flicker', 'dead'], desc: 'red EXIT sign over a door' },
  bench:        { w: 2, seat: true, sitDir: 'down', desc: 'oak hallway/lobby bench' },
  memorial_board:{ w: 3, mount: 'wall', dynamic: true, desc: '"THE HOMECOMING NINE — FOREVER IN OUR HEARTS": nine faded photos; ' +
                  'dynamic params: polaroids (danny/leah/marcus booleans), tessFrame (bool)' },
  portrait_colonel:{ w: 3, h: 1, mount: 'wall', states: ['seated', 'empty', 'uniform'],
                  desc: 'huge gilt-framed oil portrait of Col. Cyrus Hallowell seated in a carved chair; ' +
                        'empty = the chair is empty; uniform = only his coat slumped on the chair' },
  plaque:       { mount: 'wall', desc: 'brass dedication plaque, verdigris' },
  banner:       { w: 4, mount: 'wall', states: ['colliers', 'homecoming79', 'founders'], desc: 'painted paper banner, torn' },
  motto_stone:  { w: 4, mount: 'wall', desc: 'carved limestone lintel: NEMO RELINQUATUR' },
  clock_hall:   { mount: 'wall', dynamic: true, desc: 'double-faced hall clock (same as clock_wall art acceptable)' },

  // ================================================================ office
  counter:      { w: 3, desc: 'reception counter with a sliding glass window, bell, sign-in clipboard' },
  office_desk:  { w: 2, desc: 'wooden office desk, blotter, typewriter or phone' },
  office_chair: { seat: true, sitDir: 'down', desc: 'vinyl office/waiting chair' },
  filing_cabinet:{ desc: '4-drawer steel filing cabinet, one drawer open' },
  mailboxes:    { w: 3, mount: 'wall', desc: 'teachers\' wooden pigeonhole mailboxes with name labels' },
  cot:          { w: 2, desc: 'nurse\'s / janitor\'s cot, thin mattress, gray blanket' },
  eye_chart:    { mount: 'wall', desc: 'Snellen eye chart' },
  pa_console:   { w: 2, interact: 'pa', light: 'led_red', desc: 'Rauland-style intercom console: toggles per room, VU meter, mic on gooseneck, red power LED' },
  master_clock: { desc: 'tall wooden master-clock/bell-program cabinet, brass pendulum window' },
  portrait_small:{ mount: 'wall', states: ['closed', 'open'], interact: 'script',
                  desc: 'small framed portrait of the Colonel; open = swung on hinges revealing a gray wall safe' },
  coat_rack:    { desc: 'bentwood coat rack, one raincoat' },
  water_cooler: { desc: 'office water cooler, empty jug' },
  plant_dead:   { desc: 'dead potted plant' },
  shelf_med:    { w: 2, desc: 'nurse\'s shelf: gauze, a jar of cicada shells labeled BROOD II — 1979' },

  // ================================================================ library
  bookshelf_tall:{ w: 2, opaque: true, desc: 'tall oak bookshelf, packed, sagging; blocks light (stacks)' },
  card_catalog: { w: 2, interact: 'script', desc: 'oak card catalog, 30 small drawers with brass label frames' },
  reading_table:{ w: 2, h: 2, desc: 'long oak reading table' },
  chair_library:{ seat: true, sitDir: 'down', desc: 'oak library chair' },
  librarian_desk:{ w: 3, desc: 'circulation desk with date stamp, card trays' },
  display_case: { w: 2, reflective: true, interact: 'script', states: ['locked', 'open', 'empty'],
                  desc: 'glass display case "KETTLE RUN HISTORICAL COLLECTION": a miner\'s lamp, a breaker boy\'s cap, a document' },
  lamp_banker:  { solid: false, light: 'lamp_green', states: ['on', 'off'], desc: 'green-shaded banker\'s lamp (sits on a table cell)' },
  microfiche:   { desc: 'microfiche reader, dark screen' },
  book_cart:    { desc: 'rolling book cart' },
  yearbook_pile:{ solid: false, desc: 'stack of HALLOWELL COLLIER yearbooks on a table' },

  // ================================================================ computer lab / science
  computer_desk:{ interact: 'terminal', reflective: true, states: ['off', 'on'], frames: 2, fps: 2,
                  desc: 'desk with TRS-80 Model I: monitor, keyboard, cassette deck; on = green-gray glow' },
  printer:      { desc: 'dot-matrix printer, paper hanging out' },
  lab_bench:    { w: 2, desc: 'black epoxy lab bench, sink, gas taps' },
  lab_stool:    { seat: true, sitDir: 'up', desc: 'wooden lab stool' },
  fume_hood:    { w: 2, desc: 'fume hood with sash window' },
  eyewash:      { mount: 'wall', desc: 'eyewash station, yellow sign' },
  specimen_shelf:{ w: 2, desc: 'shelf of specimen jars; a cicada nymph collection' },
  chem_cabinet: { desc: 'chemical cabinet, hazard diamonds' },
  skeleton:     { desc: 'anatomy skeleton on a stand' },

  // ================================================================ cafeteria & kitchen
  caf_table:    { w: 4, h: 2, seat: true, sitDir: 'up', desc: 'folding cafeteria table with attached bench seats, trays left out' },
  serving_line: { w: 4, desc: 'stainless serving line, sneeze guard, empty steam pans' },
  tray_rack:    { desc: 'stack of brown fiberglass trays' },
  stove:        { w: 2, desc: 'industrial range' },
  mixer:        { interact: 'script', desc: 'tall industrial stand mixer (Hobart)' },
  freezer_door: { w: 1, h: 2, interact: 'door', states: ['closed', 'open'], desc: 'walk-in freezer door, chrome latch' },
  dumbwaiter:   { mount: 'wall', interact: 'script', states: ['closed', 'open'], desc: 'small wall hatch on a rope lift' },
  sink_big:     { w: 2, desc: 'deep stainless kitchen sink' },
  shelf_pantry: { w: 2, desc: 'pantry shelf: #10 cans, rusted' },
  vending_machine:{ desc: 'dead vending machine, faded Tab and Fresca' },
  milk_cooler:  { w: 2, desc: 'milk cooler, half-pint cartons' },

  // ================================================================ restrooms & showers
  stall:        { h: 2, desc: 'restroom stall partition + door (place in a row)' },
  sink:         { desc: 'porcelain sink' },
  mirror:       { mount: 'wall', reflective: true, states: ['grimy', 'clean', 'fogged', 'cracked'],
                  desc: 'rectangular mirror above a sink; Adair appears here' },
  urinal:       { desc: 'wall urinal' },
  hand_dryer:   { mount: 'wall', desc: 'paper towel dispenser / hand dryer' },
  shower_head:  { mount: 'wall', desc: 'gang shower head, rust drip' },

  // ================================================================ gym
  bleachers:    { w: 6, h: 3, seat: true, sitDir: 'down', states: ['out', 'folded', 'fallen'],
                  desc: 'wooden telescoping bleachers; fallen = collapsed against the doors' },
  hoop:         { w: 2, mount: 'wall', desc: 'basketball backboard and rim on a wall bracket' },
  hoop_stand:   { w: 2, desc: 'free-standing hoop base (for the south end)' },
  scoreboard:   { w: 3, mount: 'wall', states: ['dead', 'on'], desc: 'HOME/GUEST scoreboard; on = digits lit "HOME 19 / GUEST 79"' },
  mat_stack:    { w: 2, desc: 'stack of blue gym mats' },
  ball_cart:    { desc: 'cart of deflated basketballs' },
  locker_bench: { w: 3, seat: true, sitDir: 'up', desc: 'locker-room bench' },
  court_circle: { w: 4, h: 4, solid: false, mount: 'decal', desc: 'center-court circle and Colliers "C" logo, faded' },
  court_line_h: { solid: false, mount: 'decal', desc: 'painted court line segment (horizontal)' },
  court_line_v: { solid: false, mount: 'decal', desc: 'painted court line segment (vertical)' },

  // ================================================================ basement
  boiler:       { w: 4, h: 3, light: 'boiler', frames: 4, fps: 6, desc: 'huge riveted coal boiler, firebox door glowing, gauges, pipes' },
  pipe_h:       { solid: false, mount: 'over', desc: 'overhead pipe run (horizontal), drips' },
  pipe_v:       { solid: false, mount: 'over', desc: 'overhead pipe run (vertical)' },
  breaker_panel:{ mount: 'wall', interact: 'switch', desc: 'gray electrical panel, labeled switches' },
  coal_heap:    { w: 4, h: 3, solid: false, mount: 'decal', states: ['occupied', 'hollow', 'flat'], frames: 8, fps: 2,
                  desc: 'great heap of anthracite; occupied = a vast motionless shape half-buried (breathing); hollow = a body-shaped dent' },
  janitor_desk: { w: 2, desc: 'scarred desk, transistor radio, coffee can of screws' },
  pegboard:     { w: 2, mount: 'wall', states: ['keys', 'empty'], desc: 'pegboard with labeled key hooks' },
  mop_bucket:   { desc: 'mop bucket on casters' },
  shelf_metal:  { w: 2, desc: 'steel utility shelving: paint cans, light tubes, cleaning drums' },
  desk_pile:    { w: 3, h: 2, desc: 'old desks stacked to the ceiling' },
  water_heater: { desc: 'water heater tank' },
  valve_wheel:  { mount: 'wall', desc: 'red valve wheel on a pipe' },
  calendar:     { mount: 'wall', desc: 'pinup-free hardware-store calendar, OCTOBER 1979, 19th circled' },
  cage_bulb:    { mount: 'wall', light: 'bulb', states: ['off', 'on', 'flicker'], desc: 'caged work-light bulb' },
  cobweb:       { solid: false, mount: 'over', desc: 'corner cobweb' },

  // ================================================================ auditorium
  aud_seat:     { seat: true, sitDir: 'up', states: ['empty', 'occupied'],
                  desc: 'folding wooden auditorium seat, red velvet worn to the weave; occupied = a husk sits in it ' +
                        '(instance param `occupant`: husk variant id)' },
  curtain:      { opaque: true, states: ['closed', 'open'], desc: 'heavy red velvet stage curtain segment, moth-eaten' },
  lectern:      { desc: 'oak lectern with a gooseneck lamp' },
  piano:        { w: 2, desc: 'upright piano, keys yellowed' },
  music_stand:  { desc: 'black folding music stand' },
  phonograph:   { interact: 'script', desc: 'portable record player (Califone), a 78 on the platter' },
  instrument_case:{ interact: 'script', states: ['closed', 'open'], desc: 'clarinet case with a WEBB name tag' },
  stage_flat:   { w: 2, h: 1, desc: 'painted stage flat leaning on the wall (HOMECOMING 1945 / 1962 ...)' },
  lever:        { mount: 'wall', interact: 'lever', states: ['up', 'down'], desc: 'iron stage-machinery lever' },
  rope_rail:    { w: 2, mount: 'wall', desc: 'fly-rail ropes and sandbags' },

  // ================================================================ vault & breaker
  sarcophagus:  { w: 4, h: 2, states: ['closed', 'burst'], desc: 'marble sarcophagus; burst = lid cracked outward, cavity far too large' },
  wreath:       { solid: false, desc: 'dead funeral wreath on a stand' },
  flag_regimental:{ w: 2, mount: 'wall', desc: 'tattered Civil War regimental flag, PA coat of arms' },
  name_wall:    { w: 3, mount: 'wall', desc: 'marble panel carved with rows of names and years' },
  writing_desk: { w: 2, desc: 'Victorian writing desk, ink well' },
  candle:       { solid: false, light: 'candle', states: ['lit', 'out'], frames: 4, fps: 8, desc: 'tall iron candle stand' },
  husk_seated:  { states: ['intact', 'turned', 'crumbled'],
                  desc: 'translucent amber child-husk sitting upright (instance `variant` a–f for size/pose, `dir`); ' +
                        'turned = head rotated toward the player; crumbled = small pile of amber flakes' },
  husk_kneeling:{ desc: 'Miss Adair\'s husk, kneeling at the desk, red pen in hand' },
  chute:        { solid: true, desc: 'slanted wooden coal chute section (breaker), worn smooth' },
  picking_bench:{ w: 3, desc: 'low plank bench along a chute where breaker boys sat' },
  beam:         { desc: 'massive tarred timber post' },
  lamp_miner:   { solid: false, light: 'lamp_miner', states: ['lit', 'out'], frames: 3, fps: 6, desc: 'miner\'s oil cap-lamp glowing on a bench' },
  weigh_desk:   { w: 2, desc: 'weigh-master\'s high desk' },
  register_book:{ solid: false, interact: 'register', desc: 'THE REGISTER: an enormous leather ledger, open (sits on the weigh desk cell)' },
  shelf_ledgers:{ w: 2, desc: 'shelves of black payroll ledgers' },
  pulley_wheel: { w: 2, h: 2, solid: false, mount: 'over', desc: 'huge iron sheave wheel overhead' },

  // ================================================================ exterior
  car_wagon:    { w: 4, h: 2, light: 'headlights', states: ['on', 'off'], desc: 'Leah\'s mom\'s 1986 Ford Taurus wagon, fake wood panel, wet' },
  oak_dead:     { w: 1, h: 1, desc: 'dead oak trunk; cicada shells cling to the bark (canopy is a separate `oak_canopy`)' },
  oak_canopy:   { w: 5, h: 4, solid: false, mount: 'over', desc: 'bare oak branches overhead' },
  sign_school:  { w: 4, desc: 'brick-base sign: HALLOWELL CONSOLIDATED SCHOOL — HOME OF THE COLLIERS (letters missing)' },
  sign_danger:  { desc: 'yellow sign: DANGER — UNDERGROUND MINE FIRE — WALKING OR DRIVING IN THIS AREA COULD RESULT IN SERIOUS INJURY OR DEATH' },
  steam_vent:   { solid: false, mount: 'decal', desc: 'crack in the ground venting steam (fx emits steam particles here)' },
  flagpole:     { desc: 'flagpole, no flag, rope clanking' },
  fence:        { states: ['h', 'v', 'post'], desc: 'chain-link fence segment' },
  lamp_post:    { light: 'streetlamp', states: ['dead', 'flicker'], desc: 'parking-lot lamp post' },
  dumpster:     { w: 2, desc: 'rusted dumpster' },
  bush_dead:    { desc: 'dead hedge clump' },

  // ================================================================ items, notes, decals
  pickup:       { solid: false, interact: 'pickup', frames: 4, fps: 3, desc: 'small item on floor/desk; instance `item` = item id; sparkles faintly' },
  note_paper:   { solid: false, interact: 'examine', desc: 'loose paper / document; instance `doc` = doc id' },
  backpack:     { solid: false, interact: 'pickup', desc: 'Danny\'s black JanSport backpack' },
  decal_leaves: { solid: false, mount: 'decal', desc: 'drift of dead leaves' },
  decal_papers: { solid: false, mount: 'decal', desc: 'scattered papers / worksheets' },
  decal_glass:  { solid: false, mount: 'decal', desc: 'broken glass' },
  decal_stain:  { solid: false, mount: 'decal', desc: 'water stain / mold bloom' },
  decal_tiles:  { solid: false, mount: 'decal', desc: 'fallen ceiling tiles' },
  graffiti:     { mount: 'wall', states: ['hollowhell', 'kr91', 'pentagram', 'names', 'present'], desc: 'spray paint / marker graffiti on a wall face' },
  cicada_shells:{ solid: false, mount: 'decal', desc: 'cluster of amber cicada shells (floor/sill)' },
};

export function propDef(type) {
  const p = PROPS[type];
  if (!p) throw new Error(`Unknown prop type: ${type}`);
  return {
    w: 1, h: 1, solid: true, opaque: false, mount: 'floor', seat: false, hide: null,
    reflective: false, interact: 'examine', states: ['default'], dynamic: false, frames: 1,
    ...p,
  };
}
