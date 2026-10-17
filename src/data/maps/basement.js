// BASEMENT (basement) · 60×32 · offset (92, 22) · floor B · CONTENT §2.7 · maps-C
//
// Under the east wing. Concrete, sweating walls, standing water, pipes along the ceiling, every caged
// bulb dead. The only steady light is the boiler — which is lit, and nobody has fed it since 1984.
// The maintenance corridor runs at local rows 13–17 (world 35–39), like every corridor upstairs.
//
//   NORTH, west → east:
//     JANITOR'S OFFICE (x 2–10; padlocked `b_jan_door` x 7; the ledge spot `b_jan_ledge` — cobwebs
//     thick on the doorframe — just west of it): Walt's desk (battery in the drawer), the workbench
//     under the pegboard (key ring + the log in its sleeve), the calendar, his cot, one dirty
//     window · STAIRS up to east1 (x 12–16 = world 104–108: the flight x 15–16 under east1's down
//     flight, a newel wall x 14, an alcove x 12–13 under east1's up flight; a cold wash of light
//     falls down the stairs) · STORAGE
//     (x 18–31: desks stacked to the ceiling, band uniforms, one desk set apart — Joey's) ·
//     ELECTRICAL (x 33–39, the breaker panel `b_panel`) · FALLOUT SHELTER (x 41–52, 1962: rows of
//     cots, the small ones in front).
//   SOUTH, west → east:
//     COAL BIN (x 2–14, the SW): the chute `b_chute` on its north wall (x 3–4 = world 95–96, under
//     the exterior hatch), THE HEAP `b_coal_heap` (x 8–11, rows 22–24) just inside the open doorway
//     (x 13–14) · BOILER ROOM (x 16–31; the boiler x 17–20 rows 23–25 sits square behind the open
//     double doors x 18–19, so its glow spills red into the corridor; the side door x 15 row 24
//     stands open in line with the firebox, so a wedge of firelight falls across the heap's flank) ·
//     KITCHEN STORES (x 33–44) with the bottom of the dumbwaiter shaft (x 36 = east1 x 38).
//   EAST END: the corridor floods past x 44 (warm water — the mine fire is under the town) and stops
//     at a cave-in.
//
// The stir rule (game/basement.js) measures from the heap's centre (≈ x 10, row 23.5): running in
// the corridor's west half (x ≈ 4–16, rows 15–17) or in the bin stirs him; running along row 13
// does not. The janitor's door is 10.1 tiles away (DESIGN: ≥ 10; bolt cutters there don't stir),
// the stair foot ≈ 12. The ambience ducks within 10 tiles of the heap:
// the west corridor goes quiet except for the breathing. The anchor `coal_heap` stands in the
// doorway looking at the heap (deliberately outside the anchor-as-centre window in basement.js).
// No patrol here (the Colonel is asleep in the coal). Escape route when he rises: up the stairs, 4
// tiles from the doorway, under the only EXIT sign.
//
// Notes for scripts:
//   - `b_coal_heap` (occupied, script ch3.heap) shows while !coalbin_empty; `b_coal_heap_hollow`
//     after. Both are solid (nobody walks across him).
//   - Caged bulbs are dead props `b_bulb_*` (state 'off'); matching map lights in group 'bsmt'
//     (on:false) light only if a script calls g.lights('bsmt', true) (e.g. after the panel's CLUNK);
//     set the props to 'on' at the same time if you do.
//   - The key ring `b_keyring` and the log `b_walt_log` sit on the workbench under `b_pegboard`;
//     the battery `b_battery_jan` on Walt's desk.
//
//   x →  0         1         2         3         4         5
//        012345678901234567890123456789012345678901234567890123456789

const F = (s) => s.flags || {};
const inv = (s, id) => ((s.inv && s.inv[id]) || 0) > 0;
const withMarcus = (s) => (s.party || []).includes('marcus');
const alone = (s) => !!F(s).ch6_marcus_taken;
const readLog = (s) => !!(s.docs && s.docs.walt_log);
const hollow = (s) => !!F(s).coalbin_empty;
const v = (early, late) => (late ? [{ cond: alone, text: late }, { text: early }] : early);
const M = (text) => ({ marcus: [{ cond: (s) => withMarcus(s) && !alone(s), text }] });

const janDoorText = (s) => [
  "[n] JANITOR — W. PRUSZYNSKI, stenciled on a steel door. A hasp, a brass padlock gone green.",
  inv(s, 'bolt_cutters') ? "[worried] Danny's bolt cutters would go through it. Loud." : '[worried] Locked.',
  { cond: withMarcus, text: "[marcus:thoughtful] My grandpa kept a spare over the door. Every janitor does." },
];

const BULBS = [[3, 12], [24, 12], [38, 12], [48, 12], [3, 2], [19, 2], [34, 2], [42, 2], [7, 20], [26, 20], [40, 20]];

export default {
  id: 'basement',
  name: 'Basement',
  floor: 'B',
  offset: [92, 22],
  ambience: 'basement',
  music: null,
  dark: 0.96,
  ambient: '#0c0d14',
  tiles: [
    ' CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC ', //  0  north foundation wall (top)
    ' CCCCCCCCWCCCCCCCCCCCCCWCCCCWCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC ', //  1  face_high (grade windows)
    ' CCCCCCCCWCCCCCCCCCCCCCWCCCCWCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC ', //  2  face_low (pegboard, calendar, panel)
    ' C:::::::::C::C^^C::::::::::::::C:::::::C::::::::::::CCCCCC ', //  3  janitor | alcove · stairs | storage | electrical | shelter
    ' C:::::::::C::C^^C::::::::::::::C:::::::C::::::::::::CCCCCC ', //  4
    ' C:::::::::C::C^^C::::::::::::::C:::::::C::::::::::::CCCCCC ', //  5
    ' C:::::::::C::C^^C::::::::::::::C:::::::C::::::::::::CCCCCC ', //  6
    ' C:::::::::C::C^^C::::::::::::::C:::::::C::::::::::::CCCCCC ', //  7
    ' C:::::::::C::C^^C::::::::::::::C:::::::C::::::::::::CCCCCC ', //  8
    ' C:::::::::C::C^^C::::::::::::::C:::::::C::::::::::::CCCCCC ', //  9
    ' CCCCCCDCCCC:::::CCCDCCCCCCCCCCCCCCDCCCCCCCDCCCCCCCCCCCCCCC ', // 10  corridor north wall (landing open x 12–16)
    ' CCCCCCDCCCC:::::CCCDCCCCCCCCCCCCCCDCCCCCCCDCCCCCCCCCCCCCCC ', // 11
    ' CCCCCCDCCCC:::::CCCDCCCCCCCCCCCCCCDCCCCCCCDCCCCCCCCCCCCCCC ', // 12  face_low (ledge cobweb x 6, EXIT x 17)
    ' C::::::::::::::::::::::::::::::::::::::::::::~~~~XXCCCCCCC ', // 13  maintenance corridor (world 35)
    ' C:::::::::::::::::::::::::::::::::::~~::::::~~~~~:XCCCCCCC ', // 14
    ' C:::::::::::::::::::~~:::::::::::::::::::::~~~~~~:XCCCCCCC ', // 15
    ' C:::::::~~:::::::::::::::::::::::::::::::::~~~~~~:XCCCCCCC ', // 16
    ' C::::::::::::::::::::::::::::~~::::::::::::~~~~~~XXCCCCCCC ', // 17  (world 39) · the flood, the cave-in
    ' CCCCCCCCCCCC%%CCCDDCCCCCCCCCCCCCCCDCCCCCCCCCCCCCCCCCCCCCCC ', // 18  coal bin doorway x 13–14 · boiler doors x 18–19 · stores x 35
    ' CCCCCCCCCCCC%%CCCDDCCCCCCCCCCCCCCCDCCCCCCCCCCCCCCCCCCCCCCC ', // 19
    ' CCCCCCCCCCCC%%CCCDDCCCCCCCCCCCCCCCDCCCCCCCCCCCCCCCCCCCCCCC ', // 20  face_low (chute x 3–4, dumbwaiter x 36)
    ' C%%%%%%%%%%%%%C::::::::::::::::C::::::::::::CCCCCCCCCCCCCC ', // 21  coal bin | boiler room | kitchen stores
    ' C%%%%%%%%%%%%%C::::::::::::::::C::::::::::::CCCCCCCCCCCCCC ', // 22
    ' C%%%%%%%%%%%%%C::::::::::::::::C::::::::::::CCCCCCCCCCCCCC ', // 23
    ' C%%%%%%%%%%%%%D::::::::::::::::C::::::::::::CCCCCCCCCCCCCC ', // 24  side door coal bin ↔ boiler room (open, in line with the firebox)
    ' C%%%%%%%%%%%%%C::::::::::::::::C::::::::::::CCCCCCCCCCCCCC ', // 25
    ' C%%%%%%%%%%%%%C::::::::::::::::C::::::::::::CCCCCCCCCCCCCC ', // 26
    ' C%%%%%%%%%%%%%C::::::::::::::::C::::::::::::CCCCCCCCCCCCCC ', // 27
    ' C%%%%%%%%%%%%%C::::::::::::::::C::::::::::::CCCCCCCCCCCCCC ', // 28
    ' C%%%%%%%%%%%%%C::::::::::::::::C::::::::::::CCCCCCCCCCCCCC ', // 29
    ' CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC ', // 30
    '                                                            ', // 31
  ],

  objects: [
    // ======================================================== the coal bin (SW)
    { id: 'b_coal_heap', type: 'coal_heap', x: 8, y: 22, state: 'occupied', solid: true, script: 'ch3.heap',
      cond: (s) => !hollow(s),
      examine: ['[worried] Old gym mats? {p} ...It\'s breathing.'] },
    { id: 'b_coal_heap_hollow', type: 'coal_heap', x: 8, y: 22, state: 'hollow', solid: true, cond: hollow, script: 'ch3.heap',
      examine: v(['[n] A dent in the coal, the shape of something lying down. Something huge.', '[scared] The coal at the bottom of it is still warm.'],
        ['[n] The hollow in the coal.', "[scared] He isn't in it. That's worse."]) },
    { id: 'b_coal_spread', type: 'coal_heap', x: 3, y: 26, state: 'flat', interact: false },
    { id: 'b_chute', type: 'coal_chute', x: 3, y: 20, state: 'locked', script: 'ch6.chute',
      examine: [
        { cond: alone, text: ["[n] The coal chute. A grate, a padlock, and above it, the dark of the chute going up.", "[exhausted] Coal goes in this way."] },
        { text: ['[n] An iron coal chute in the wall. A rusted grate, padlocked.', "[curious] There's air coming down it. Cold. Outside air."] },
      ] },
    { type: 'cobweb', x: 2, y: 21 },
    { type: 'decal_stain', x: 12, y: 21 },
    { type: 'decal_stain', x: 6, y: 24 },
    { type: 'decal_stain', x: 12, y: 27 },
    { type: 'decal_papers', x: 10, y: 28 },
    { type: 'decal_tiles', x: 2, y: 29 },

    // ======================================================== boiler room
    { id: 'b_boiler', type: 'boiler', x: 17, y: 23, light: { type: 'boiler', radius: 9.5 },
      examine: v(['[n] The boiler. Rivets as big as my thumb. The firebox door is glowing at the seams.',
        "[scared] It's lit. Nobody's fed this thing since they shut the school. It's lit."], '[n] Still lit. Still nobody feeding it.'),
      banter: M("[worried] Don't touch it. Don't— just don't.") },
    { type: 'valve_wheel', x: 21, y: 20 },
    { id: 'b_boiler_valve', type: 'valve_wheel', x: 28, y: 20,
      examine: '[n] A red valve wheel. BOILER FEED — DO NOT CLOSE. Under it, in pencil: never did.' },
    { id: 'b_water_heater', type: 'water_heater', x: 30, y: 21, examine: '[n] A water heater. Cold to the touch. The only cold thing in here.' },
    { id: 'b_boiler_tools', type: 'shelf_metal', x: 28, y: 27,
      examine: v(["[n] Pipe wrenches, a box of gaskets, a coal shovel with the handle worn pale.", "[sad] Worn to the shape of somebody's hands."], '[n] The shovel.') },
    { id: 'b_ash_can', type: 'trash_can', x: 16, y: 29, examine: '[n] An ash can, full to the brim. The ash on top is fresh.' },
    { type: 'mop_bucket', x: 31, y: 29 },
    { type: 'decal_stain', x: 16, y: 21 },
    { type: 'decal_stain', x: 21, y: 27 },
    { type: 'decal_papers', x: 25, y: 26 },
    { type: 'decal_stain', x: 23, y: 23 },
    ...[21, 22, 25, 26, 27, 28, 29, 30, 31].map((x) => ({ type: 'pipe_h', x, y: 21 })),
    ...[22, 23, 24, 25, 26, 27, 28].map((y) => ({ type: 'pipe_v', x: 24, y })),

    // ======================================================== kitchen stores (under the kitchen)
    { id: 'b_dumbwaiter', type: 'dumbwaiter', x: 36, y: 20, state: 'open',
      examine: v(['[n] The bottom of the dumbwaiter shaft. The car is down here, its hatch open. Empty.', "[worried] The rope's still swinging."],
        '[n] The dumbwaiter. Empty. The rope hangs still now.'),
      banter: M("[worried] There's nobody down here, Tess. There never was.") },
    { id: 'b_stores_shelf', type: 'shelf_pantry', x: 38, y: 21,
      examine: v('[n] Potatoes in burlap, gone black and soft. Cans of cream corn, bulging.', '[n] Bulging cans.') },
    { type: 'shelf_pantry', x: 41, y: 21 },
    { type: 'shelf_pantry', x: 34, y: 24 },
    { type: 'shelf_pantry', x: 37, y: 24 },
    { type: 'shelf_pantry', x: 40, y: 24 },
    { type: 'shelf_pantry', x: 43, y: 24 },
    { type: 'shelf_pantry', x: 34, y: 27 },
    { id: 'b_flour', type: 'shelf_pantry', x: 38, y: 27,
      examine: "[n] Flour sacks, gnawed through. Little tracks in the spill, going everywhere, then nowhere." },
    { type: 'shelf_pantry', x: 42, y: 27 },
    { type: 'decal_papers', x: 36, y: 22 },
    { type: 'decal_stain', x: 41, y: 26 },
    { type: 'decal_stain', x: 39, y: 29 },

    // ======================================================== the corridor (north face row 12)
    { id: 'b_jan_ledge', type: 'cobweb', x: 6, y: 12, script: 'ch3.ledge', verb: 'Look',
      examine: ['[n] Cobwebs, thick, all along the top of the doorframe.', '[curious] The frame sticks out at the top. Like a little shelf.'] },
    { id: 'b_exit_stairs', type: 'exit_sign', x: 17, y: 12, state: 'on',
      examine: v(['[n] EXIT. Up the stairs.', "[worried] It's the only color down here."], '[scared] Up. Up is out of here.') },
    { id: 'b_valve_hall', type: 'valve_wheel', x: 27, y: 12 },
    { id: 'b_cd_notice', type: 'bulletin_board', x: 28, y: 12, state: 'generic',
      examine: v(['[n] IN CASE OF ATTACK: PROCEED TO FALLOUT SHELTER, BASEMENT EAST. TEACHERS WILL COUNT THEIR STUDENTS. WALK — DO NOT RUN.',
        '[worried] Walk. Do not run. {p} They had it on every wall.'], '[n] TEACHERS WILL COUNT THEIR STUDENTS.'),
      banter: M('[thoughtful] Teachers will count their students.') },
    { id: 'b_shelter_sign', type: 'plaque', x: 45, y: 12,
      examine: v("[n] The yellow-and-black sign: FALLOUT SHELTER. Three triangles in a circle, the paint gone chalky.", '[n] FALLOUT SHELTER.') },
    // the floor: coal tracked out of the bin, the flood, the cave-in
    { type: 'decal_stain', x: 13, y: 17 },
    { type: 'decal_stain', x: 15, y: 16 },
    { type: 'decal_stain', x: 11, y: 14 },
    { type: 'decal_papers', x: 18, y: 15 },
    { type: 'decal_tiles', x: 33, y: 13 },
    { type: 'decal_stain', x: 34, y: 15 },
    { type: 'decal_papers', x: 40, y: 16 },
    { id: 'b_flood', type: 'decal_stain', x: 43, y: 15,
      examine: v(['[n] The floor goes under water from here. I put my hand in.', "[worried] It's warm. {p} The mine fire's down there somewhere, under all of it."],
        "[scared] Warm water. The town's been on fire underneath for thirty years."),
      banter: M("[neutral] Route 61's like that in January. The snow won't stay on it.") },
    { id: 'b_cavein', type: 'decal_tiles', x: 49, y: 16,
      examine: '[n] The ceiling came down here. Past the rubble, the water keeps going into the dark.' },
    { type: 'cobweb', x: 2, y: 13 },
    { type: 'cobweb', x: 50, y: 14 },
    // pipes along the ceiling
    ...Array.from({ length: 48 }, (_, i) => ({ type: 'pipe_h', x: 2 + i, y: 13 })),
    ...[14, 15, 16, 17].map((y) => ({ type: 'pipe_v', x: 19, y })),

    // ======================================================== stairs + the alcove under east1's up flight
    { id: 'b_alcove', type: 'shelf_metal', x: 12, y: 3,
      examine: v("[n] Under the stairs: sweeping compound, a tree stand, a box of tinsel marked XMAS — CAF.", '[n] XMAS — CAF.') },
    { type: 'mop_bucket', x: 13, y: 8 },
    { type: 'cobweb', x: 12, y: 9 },
    { type: 'decal_stain', x: 15, y: 9 },

    // ======================================================== janitor's office (Walt)
    { id: 'b_pegboard', type: 'pegboard', x: 5, y: 2, state: 'keys',
      examine: [
        { cond: (s) => inv(s, 'keyring'), text: ["[n] Every hook labeled in block capitals: BOILER. COAL. GYM. ROOF. AUD. LIB. TOWER.", '[sad] He took the rest with him. He left us two.'] },
        { text: ['[n] A pegboard over the workbench, every hook labeled in block capitals: BOILER. COAL. GYM. ROOF. AUD. LIB. TOWER.', '[curious] Almost all of them empty.'] },
      ] },
    { id: 'b_calendar', type: 'calendar', x: 8, y: 2, script: 'ch3.calendar',
      examine: '[n] A hardware-store calendar. OCTOBER 1979. The 19th is circled so hard the pen went through.' },
    { id: 'b_jan_desk', type: 'janitor_desk', x: 2, y: 3,
      examine: v(["[n] Walt's desk. A transistor radio still tuned to the polka station out of Pottsville. A coffee can of screws, sorted by size.",
        '[curious] A school photo in a dime-store frame, face down. I leave it face down.'], "[n] The radio. The screws. The photo, face down.") },
    { id: 'b_battery_jan', type: 'pickup', x: 2, y: 3, item: 'battery',
      examine: "[relieved] A battery in the desk drawer, rubber-banded to a note: FOR THE BIG LIGHT." },
    { type: 'office_chair', x: 2, y: 4, dir: 'up', sitDir: 'up' },
    // the workbench under the pegboard: the key ring, and the log in its plastic sleeve
    { id: 'b_workbench', type: 'desk_teacher', x: 5, y: 3,
      examine: '[n] A workbench. A vise, a coffee can of fuses, a mug that says WORLD\'S BEST POP-POP.' },
    { id: 'b_walt_log', type: 'note_paper', x: 5, y: 3, doc: 'walt_log',
      examine: '[n] A ledger in a plastic sleeve, hanging under the last hook. LOG, in black marker.' },
    { id: 'b_keyring', type: 'pickup', x: 6, y: 3, item: 'keyring', script: 'ch3.keyring',
      examine: "[n] A key ring on the workbench, right under its hook. Two tags: OFFICE. 2F GATE." },
    { id: 'b_cot', type: 'cot', x: 8, y: 5,
      examine: [
        { cond: readLog, text: ["[n] Walt's cot. The blanket folded square.", "[sad] He slept down here. Next to it. For seventeen years."] },
        { text: ["[n] A cot under the window, the gray blanket folded square, army style.", '[curious] Somebody slept down here. A lot.'] },
      ],
      banter: M('[thoughtful] Who sleeps at work?') },
    { id: 'b_jan_shelf', type: 'shelf_metal', x: 2, y: 8,
      examine: '[n] Paint cans, all one color: institutional green. Rat traps, unset.' },
    { type: 'mop_bucket', x: 5, y: 8 },
    { id: 'b_jan_coat', type: 'coat_rack', x: 10, y: 8,
      examine: v(['[n] A work jacket on the hook. PRUSZYNSKI on the name tape. A pocket flashlight in the breast pocket, dead.',
        '[sad] He left his coat. In October.'], '[sad] His coat.') },
    { type: 'decal_stain', x: 6, y: 6 },
    { type: 'decal_papers', x: 9, y: 9 },

    // ======================================================== storage
    { id: 'b_desks', type: 'desk_pile', x: 18, y: 3,
      examine: v("[n] Old desks stacked to the ceiling, the wooden kind with inkwells. Initials going back to the twenties.", '[n] Desks to the ceiling.') },
    { type: 'desk_pile', x: 22, y: 6 },
    { type: 'desk_pile', x: 26, y: 3 },
    { id: 'b_piano', type: 'piano', x: 30, y: 3,
      examine: '[n] An upright piano under a drop cloth. I press middle C through the cloth. It sticks.' },
    { id: 'b_uniforms', type: 'coat_rack', x: 26, y: 8,
      examine: "[n] Band uniforms in dry-cleaner plastic, green and gold, a whole rack. The shakos in a box underneath, plumes crushed flat." },
    { id: 'b_joey_desk', type: 'desk_student', x: 29, y: 8, noSit: true,
      examine: [
        { cond: readLog, text: ["[n] The desk set apart. J.P. '62 in the corner. DON'T THROW OUT — W.P.", '[sad] Joey. He kept Joey\'s desk.'] },
        { text: ["[n] One desk set apart from the pile, wiped clean. Masking tape on the lid: DON'T THROW OUT — W.P.", "[curious] Carved in the corner: J.P. '62."] },
      ] },
    { id: 'b_storage_shelf', type: 'shelf_metal', x: 29, y: 6,
      examine: '[n] Light tubes in sleeves. Rolls of butcher paper, green and gold. A crate of chalk.' },
    { id: 'b_battery_storage', type: 'pickup', x: 30, y: 6, item: 'battery',
      examine: '[relieved] A battery behind the chalk crate.' },
    { type: 'decal_stain', x: 21, y: 8 },
    { type: 'decal_papers', x: 25, y: 5 },
    { type: 'cobweb', x: 31, y: 9 },

    // ======================================================== electrical
    { id: 'b_panel', type: 'breaker_panel', x: 36, y: 2, script: 'ch3.panel',
      examine: '[n] The main panel. Rows of breakers, every one labeled. MAIN is thrown to OFF.' },
    { id: 'b_fuses', type: 'shelf_metal', x: 33, y: 3,
      examine: '[n] Boxes of fuses. Tubes for the P.A. amplifier, still in their cartons. RAULAND — HANDLE WITH CARE.' },
    { type: 'water_heater', x: 39, y: 3 },
    { type: 'decal_stain', x: 37, y: 7 },

    // ======================================================== fallout shelter (1962)
    { id: 'b_shelter_drums', type: 'shelf_metal', x: 41, y: 7,
      examine: v(["[n] Drums stenciled WATER — DRINKING — CIVIL DEFENSE 1962. Tins of ALL-PURPOSE SURVIVAL CRACKERS.",
        '[skeptical] They had a plan for the end of the world. Just not this one.'], '[n] Water for four hundred. Crackers.') },
    { id: 'b_shelter_cot', type: 'cot', x: 44, y: 4,
      examine: v(['[n] Army cots in rows, blankets folded at the feet. The ones near the door are small.', '[sad] Kid-sized.'], '[sad] Kid-sized.') },
    ...[[47, 4], [50, 4], [44, 7], [47, 7], [50, 7]].map(([x, y]) => ({ type: 'cot', x, y })),
    { type: 'decal_papers', x: 49, y: 9 },
    { type: 'decal_stain', x: 46, y: 6 },
    { type: 'cobweb', x: 52, y: 3 },

    // ======================================================== dead caged bulbs (props) — lights in group 'bsmt'
    ...BULBS.map(([x, y], i) => ({ id: `b_bulb_${i + 1}`, type: 'cage_bulb', x, y, state: 'off' })),
  ],

  doors: {
    '7,12': { id: 'b_jan_door', type: 'door_metal', state: 'locked', label: 'JANITOR', script: 'ch3.jan_door',
      // (chapter 0 = no story context: debug teleports / map tests walk straight in)
      lock: (s) => (s.chapter || 0) >= 1 && !F(s).ch3_jan_key, lockedText: janDoorText, unlockSfx: 'key_unlock' },
    '20,12': { id: 'b_door_storage', type: 'door_metal', label: 'STORAGE' },
    '35,12': { id: 'b_door_elec', type: 'door_metal', label: 'ELECTRICAL — DANGER' },
    '43,12': { id: 'b_door_shelter', type: 'door_metal', label: 'FALLOUT SHELTER' },
    '18,20': { id: 'b_boiler_doors', state: 'open', label: 'BOILER ROOM' },
    '35,20': { id: 'b_door_stores', type: 'door_metal', label: 'KITCHEN STORES' },
    '15,24': { id: 'b_coal_door', state: 'open', autoClose: false, label: 'COAL' },
  },

  rooms: [
    { id: 'b_corridor', name: 'Maintenance Corridor', rect: [2, 13, 50, 5], kind: 'basement' },
    { id: 'b_stairs', name: 'Basement Stairs', rect: [12, 3, 5, 10], kind: 'stair' },
    { id: 'b_janitor', name: "Janitor's Office", rect: [2, 3, 9, 7], kind: 'office' },
    { id: 'b_storage', name: 'Storage', rect: [18, 3, 14, 7], kind: 'basement' },
    { id: 'b_electrical', name: 'Electrical', rect: [33, 3, 7, 7], kind: 'basement' },
    { id: 'b_shelter', name: 'Fallout Shelter', rect: [41, 3, 12, 7], kind: 'basement' },
    { id: 'b_coal_bin', name: 'Coal Bin', rect: [2, 18, 13, 12], kind: 'basement' },
    { id: 'b_boiler_room', name: 'Boiler Room', rect: [16, 21, 16, 9], kind: 'basement' },
    { id: 'b_stores', name: 'Kitchen Stores', rect: [33, 21, 12, 9], kind: 'basement' },
  ],

  anchors: {
    from_east1: [15, 10, 'down'],      // first anchor (reachability root): the foot of the stairs
    stair_foot: [15, 12, 'down'],
    coal_heap: [13, 23, 'left'],       // inside the bin's doorway, looking at the heap (x 8–11, rows 22–24)
    coal_bin: [13, 19, 'down'],
    coal_chute: [3, 21, 'up'],
    janitor_door: [7, 13, 'up'],
    janitor_ledge: [6, 13, 'up'],
    in_janitor: [7, 8, 'up'],
    keyring: [6, 4, 'up'],
    calendar: [8, 3, 'up'],
    walt_log: [5, 4, 'up'],
    boiler: [18, 26, 'up'],            // the firebox side
    boiler_doors: [18, 16, 'down'],
    breaker_panel: [36, 3, 'up'],
    storage: [20, 8, 'up'],
    shelter: [43, 8, 'up'],
    dumbwaiter_bottom: [36, 21, 'up'],
    flood: [43, 15, 'right'],
  },

  exits: [
    { id: 'up', rect: [15, 3, 2, 1], to: 'east1', anchor: 'from_basement' },
  ],

  triggers: [
    // Ch3: off the bottom step (checkpoint, "Walk. Don't run.")
    { id: 'basement_enter', rect: [12, 12, 5, 1], script: 'ch3.basement', cond: (s) => s.chapter === 3 },
  ],

  lights: [
    // the cold wash falling down the stairwell from the landing windows above
    { type: 'spot', x: 15.5, y: 5, color: '#7f9cc4', intensity: 0.45, radius: 2.6, disc: 1.4, shadows: false },
    // firelight spilling through the open side door onto the heap's flank (no fixture: no glow sprite)
    { type: 'mine_fire', x: 14, y: 24, radius: 5, intensity: 0.45 },
    // the boiler's glow leaking out of the open double doors onto the corridor floor (the beacon from the stairs)
    { type: 'mine_fire', x: 18.5, y: 19, radius: 3.5, intensity: 0.4 },
    // the caged bulbs: dead until something throws the main (group 'bsmt')
    ...BULBS.map(([x, y]) => ({ type: 'bulb', x, y, group: 'bsmt', on: false, flicker: true, intensity: 0.7 })),
  ],

  past: [
    { id: 'janitor_1979', rect: [2, 3, 9, 7],
      hint: 'Every hook has a key on it. Somebody at the desk, writing.',
      objects: [{ type: 'pegboard', x: 5, y: 2, state: 'keys' }],
      hide: ['b_pegboard'],
      figures: [{ sprite: 'figure79', x: 2, y: 4, dir: 'up', anim: 'sit_up' }] },
  ],
};
