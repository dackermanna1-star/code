// SCHOOL LIBRARY (library) · 28×36 · offset (-30, 18) · CONTENT §2.4 · maps-B
//
// One map, two floors, drawn the 3/4 way a gallery really looks from below:
//   NORTH = the MEZZANINE (2F; rooms[].floor '2F'), rows 3–10: tall windows in the paneled north
//     wall, wall shelves, one free-standing rank (row 7) with a dark aisle behind it, and a 3-wide
//     walkway along the gallery railing (row 11). Ch5 entry from west2 through the east door
//     (x 27, row 9 → anchor from_west2). A shelf has been dragged across the walkway at x 13–14, so
//     the way west runs through the aisle behind the stacks. The spiral's top opening is at the
//     west end (x 1–2, row 11, exit → spiral_bottom). From the walkway you look down on the lamp.
//   The balcony front (rows 12–13) is the reading room's north wall; the cast-iron spiral climbs it
//     at x 1–2 (prop solid:false over its walkable column so 1F and 2F stay linked for pathing; in
//     play the exit pair at rows 11 and 13 carries you between floors).
//   SOUTH = the READING ROOM (1F), rows 14–34: Leah's table under the only lit lamp (x 11–12,
//     rows 16–17), the KETTLE RUN HISTORICAL COLLECTION case under its plaque, the card catalog
//     (Mrs. Ostrowski's past view, drawer HA–HE), the circulation desk, then two ranks of stacks.
//     The east doors to west1 (x 27, rows 19–20, world 37–38 = west1's library doors) are
//     barricaded from this side with a reading table, chairs and a cart until `library_door_open`
//     (ch5.unbar after ch5.marcus_knock).
//
// Triggers: library_enter (mezzanine walkway, first look down at the green lamp) · leah (approach
// to her table) · marcus_knock / marcus_knock_s (anywhere in the reading room away from her table
// once ch5_leah_found, until the doors are open; the cond checks both once-flags).
// The 2F door sits ~11 rows north of west2's corridor in world space: the mezzanine has to sit north
// of the reading room in a single map, so the sketchbook shows it slightly offset.
//
//   x →  0         1         2
//        0123456789012345678901234567

const F = (s) => s.flags || {};
const from = (n) => (s) => s.chapter >= n;
const notOpen = (s) => !F(s).library_door_open;
const by = (c5, c6) => (c6 ? [{ cond: from(6), text: c6 }, { text: c5 }] : c5);
const knockReady = (s) => !!F(s).ch5_leah_found && notOpen(s)
  && !F(s).trig_library_marcus_knock && !F(s).trig_library_marcus_knock_s;

export default {
  id: 'library',
  name: 'School Library',
  floor: '1F',
  offset: [-30, 18],
  ambience: 'library',
  music: null,
  dark: 0.95,
  ambient: '#0b1020',
  // narrative-3: Leah in session at her table under the lamp (Ch5–6), writing.
  onEnter: 'ch5.enter_library',
  tiles: [
    'PPPPPPPPPPPPPPPPPPPPPPPPPPPP', //  0  mezzanine north wall (top)
    'PPPPPPWWPPPPPWWPPPPPWWPPPPPP', //  1  tall windows
    'PPPPPPWWPPPPPWWPPPPPWWPPPPPP', //  2
    'P==========================P', //  3  MEZZANINE (2F): wall shelves
    'P==========================P', //  4  aisle
    'P==========================P', //  5  aisle
    'P==========================P', //  6  aisle
    'P==========================P', //  7  stacks
    'P==========================P', //  8  walkway
    'P==========================D', //  9  walkway · door → west2
    'P==========================P', // 10  walkway
    'Pvv||||||||||||||||||||||||P', // 11  gallery railing · spiral top opening (x 1–2)
    'P^^PPPPPPPPPPPPPPPPPPPPPPPPP', // 12  balcony front (face_high) · spiral column
    'P^^PPPPPPPPPPPPPPPPPPPPPPPPP', // 13  balcony front (face_low) · spiral foot
    'P==========================P', // 14  READING ROOM (1F)
    'P==""""""""""""""""""======P', // 15  reading area carpet
    'P==""""""""""""""""""======P', // 16
    'P==""""""""""""""""""======P', // 17
    'P==""""""""""""""""""======P', // 18
    'P==""""""""""""""""""=======', // 19  east doors → west1 (door_side ×2 at x 27)
    'P===========================', // 20
    'P==========================P', // 21
    'P==========================P', // 22
    'P==========================P', // 23
    'P==========================P', // 24
    'P==========================P', // 25
    'P==========================P', // 26  stacks
    'P==========================P', // 27
    'P==========================P', // 28
    'P==========================P', // 29
    'P==========================P', // 30
    'P==========================P', // 31  stacks
    'P==========================P', // 32
    'P==========================P', // 33
    'P==========================P', // 34
    'PPPPPPPPPPPPPPPPPPPPPPPPPPPP', // 35
  ],

  // Stacks: bookshelf_tall (2×1, opaque) and the radiators under the mezzanine windows.
  propLegend: { S: 'bookshelf_tall', R: 'radiator' },
  propLayer: [
    '............................', //  0
    '............................', //  1
    '............................', //  2
    '.S.S..R....S.R.S.S..R.S.S...', //  3  wall shelves between the windows (x 9 is an object)
    '............................', //  4
    '............................', //  5
    '............................', //  6
    '.S..S.S.S.S.S.S.S.S...S.S...', //  7  free-standing rank; gaps at x 3, 20–21, 26 (the detour)
    '............................', //  8
    '............................', //  9
    '............................', // 10
    '............................', // 11
    '............................', // 12
    '............................', // 13
    '............................', // 14
    '............................', // 15
    '............................', // 16
    '............................', // 17
    '............................', // 18
    '............................', // 19
    '............................', // 20
    '............................', // 21
    '............................', // 22
    '............................', // 23
    '............................', // 24
    '............................', // 25
    '..S.S.S.....S.S...S.S.S.....', // 26  1F stacks (x 10 is an object)
    '............................', // 27
    '............................', // 28
    '............................', // 29
    '............................', // 30
    '.S.....S.S.S...S...S...S.S..', // 31  x 3, 17 are objects
    '............................', // 32
    '............................', // 33
    '............................', // 34
    '............................', // 35
  ],

  objects: [
    // ======================================================== MEZZANINE (2F)
    { id: 'lib_mezz_local', type: 'bookshelf_tall', x: 9, y: 3,
      examine: by('[n] 974.8 — PENNSYLVANIA. Coal. Coal. The Molly Maguires. Coal.', '[n] Coal. Coal. Coal.') },
    // the shelf dragged across the walkway (forces the way through the stacks)
    { id: 'lib_mezz_block', type: 'bookshelf_tall', x: 13, y: 8,
      examine: by("[n] A shelf's been dragged across the walkway. From this side.", '[n] Still across the walkway.') },
    { type: 'bookshelf_tall', x: 13, y: 9 },
    { type: 'bookshelf_low', x: 13, y: 10 },
    { type: 'decal_papers', x: 12, y: 9 },
    { type: 'decal_papers', x: 15, y: 10 },
    { type: 'decal_papers', x: 15, y: 8 },
    // the chair at the rail, turned to watch the room below
    { id: 'lib_watch_chair', type: 'chair_library', x: 8, y: 10, dir: 'down', noSit: true,
      examine: [
        { cond: (s) => !!(s.docs && s.docs.walt_log), text: ["[n] A chair pulled up to the railing, turned to face the room below.", "[sad] 'In the library every night since.' This is where she sat."] },
        { text: '[n] A chair pulled up to the railing, turned to face the room below. Somebody sat up here a long time.' },
      ] },
    { id: 'lib_mezz_sign', type: 'note_paper', x: 24, y: 8,
      examine: '[n] A sign, fallen off its stand: MEZZANINE CLOSED TO STUDENTS. —Mrs. O.' },
    { id: 'lib_mezz_cart', type: 'book_cart', x: 26, y: 10,
      examine: by("[n] Returns nobody reshelved. *Charlotte's Web*. *The Outsiders*. *Go Ask Alice*.", '[n] Returns. Nobody ever reshelved them.') },
    { id: 'lib_battery_mezz', type: 'pickup', x: 1, y: 4, item: 'battery',
      examine: '[relieved] A battery tucked behind the encyclopedias. Somebody hid it here on purpose.' },
    { type: 'cobweb', x: 26, y: 3 },
    { type: 'cobweb', x: 1, y: 8 },
    { type: 'decal_stain', x: 19, y: 4 },
    { type: 'decal_stain', x: 4, y: 6 },
    { type: 'book_cart', x: 10, y: 5 },
    { type: 'chair_library', x: 17, y: 4, dir: 'down' },

    // ======================================================== the spiral (1F foot, climbs the balcony)
    { id: 'lib_spiral', type: 'stair_spiral', x: 1, y: 12, solid: false,
      to: { map: 'library', anchor: 'spiral_top' },
      examine: '[n] A cast-iron spiral stair, up to the mezzanine.' },

    // ======================================================== READING ROOM (1F) — balcony face (row 13)
    { id: 'lib_read_poster', type: 'poster', x: 5, y: 13, state: 'read',
      examine: '[n] READ. A cat in glasses, asleep on a stack of books.' },
    { id: 'lib_collection_plaque', type: 'plaque', x: 15, y: 13,
      examine: '[n] KETTLE RUN HISTORICAL COLLECTION. The gift of the Hallowell Endowment, 1923.' },
    { id: 'lib_clock', type: 'clock_wall', x: 19, y: 13,
      examine: by('[worried] Twenty to two. Even in here.', '[scared] Twenty to two.') },
    { id: 'lib_exit', type: 'exit_sign', x: 25, y: 13, state: 'flicker',
      examine: by("[n] EXIT. Over doors somebody's barricaded shut.", '[n] EXIT.') },

    // the case and the catalog (CONTENT §2.4; scripts ch5.case / ch5.catalog)
    { id: 'lib_case', type: 'display_case', x: 15, y: 14, script: 'ch5.case' },
    { id: 'lib_catalog', type: 'card_catalog', x: 21, y: 14, variant: 1, script: 'ch5.catalog' }, // variant 1: the 1979 art shows HA–HE pulled out

    // Leah's table — the one lit lamp
    { id: 'lib_leah_chair', type: 'chair_library', x: 11, y: 15, dir: 'down', solid: false, noSit: true },
    { type: 'chair_library', x: 12, y: 15, dir: 'down' },
    { id: 'lib_leah_table', type: 'reading_table', x: 11, y: 16,
      examine: by('[n] A long oak table. Somebody has been sitting here a long time.', "[sad] Leah's table.") },
    { id: 'lib_leah_lamp', type: 'lamp_banker', x: 12, y: 16, state: 'on', light: { type: 'lamp_green', group: 'library' },
      examine: "[n] A green banker's lamp. The only light on in the whole library. {p} The cord isn't plugged into anything." },
    { id: 'lib_yearbook_79', type: 'yearbook_pile', x: 12, y: 17, doc: 'yearbook_1979',
      examine: [{ cond: (s) => !!F(s).ch5_leah_found, text: '[sad] The one Leah was reading.' }, { text: '[n] *The Collier*, 1979–80. The one that came out after.' }] },
    { id: 'lib_checkout_cards', type: 'note_paper', x: 11, y: 17, cond: (s) => !!F(s).ch5_leah_found,
      examine: by('[n] Checkout cards. Every one says LEAH BRANDT. No due dates.', '[sad] LEAH BRANDT. LEAH BRANDT. LEAH BRANDT.') },
    { type: 'chair_library', x: 12, y: 18, dir: 'up' },

    // the other tables (lamps dark)
    { type: 'chair_library', x: 5, y: 15, dir: 'down' },
    { type: 'chair_library', x: 6, y: 15, dir: 'down' },
    { type: 'reading_table', x: 5, y: 16 },
    { type: 'lamp_banker', x: 6, y: 16, state: 'off' },
    { id: 'lib_yearbook_45', type: 'yearbook_pile', x: 5, y: 17, doc: 'yearbook_1945', examine: '[n] *The Collier*, 1945–46.' },
    { type: 'chair_library', x: 5, y: 18, dir: 'up' },
    { type: 'chair_library', x: 6, y: 18, dir: 'up' },
    { type: 'chair_library', x: 17, y: 15, dir: 'down' },
    { type: 'chair_library', x: 18, y: 15, dir: 'down' },
    { type: 'reading_table', x: 17, y: 16 },
    { type: 'lamp_banker', x: 18, y: 16, state: 'off' },
    { id: 'lib_yearbook_62', type: 'yearbook_pile', x: 17, y: 17, doc: 'yearbook_1962', examine: '[n] *The Collier*, 1962–63.' },
    { type: 'chair_library', x: 17, y: 18, dir: 'up' },
    { type: 'chair_library', x: 18, y: 18, dir: 'up' },

    // circulation, microfiche, cart
    { type: 'chair_library', x: 21, y: 21, dir: 'down' },
    { id: 'lib_desk', type: 'librarian_desk', x: 20, y: 22,
      examine: by('[n] The circulation desk. The date stamp is still set: OCT 26 1979. A nameplate: MRS. E. OSTROWSKI.',
        '[n] OCT 26 1979. Due back in a week. Nobody came back.') },
    { id: 'lib_microfiche', type: 'microfiche', x: 3, y: 21,
      examine: '[n] A microfiche reader, a reel still threaded. The label: BOROUGH COUNCIL MINUTES, 1911–1923.' },
    { type: 'chair_library', x: 3, y: 22, dir: 'up' },
    { id: 'lib_cart', type: 'book_cart', x: 8, y: 21,
      examine: by('[n] A cart of books waiting to be shelved. Every spine is turned to the wall.', '[n] Every spine turned to the wall.') },

    // the barricade against the east doors (ch5.unbar removes it by flag)
    { id: 'lib_barricade', type: 'reading_table', x: 25, y: 19, script: 'ch5.unbar', cond: notOpen },
    { id: 'lib_barricade_c1', type: 'chair_library', x: 25, y: 18, dir: 'left', noSit: true, cond: notOpen },
    { id: 'lib_barricade_c2', type: 'chair_library', x: 26, y: 21, dir: 'up', noSit: true, cond: notOpen },
    { id: 'lib_barricade_cart', type: 'book_cart', x: 24, y: 18, cond: notOpen },
    // the east doors themselves (closed, never locked from this side)
    { id: 'lib_doors', type: 'door_side', x: 27, y: 19, label: 'WEST HALL', to: { map: 'west1', anchor: 'from_library' } },
    { id: 'lib_doors_b', type: 'door_side', x: 27, y: 20, label: 'WEST HALL', to: { map: 'west1', anchor: 'from_library' } },

    // 1F stacks: the three that talk
    { id: 'lib_stack_law', type: 'bookshelf_tall', x: 10, y: 26,
      examine: [
        { cond: (s) => !!F(s).bond_leah, text: ['[n] 379 — SCHOOL LAW. One gap, the width of a fat book.', '[determined] The School Code. Adair checked it out and never brought it back.'] },
        { text: '[n] 379 — SCHOOL LAW. One gap, the width of a fat book.' },
      ] },
    { id: 'lib_stack_fiction', type: 'bookshelf_tall', x: 17, y: 31,
      examine: by('[n] Fiction. I pull one out. The card in the back says DUE OCT 26 1979. I pull another. Same.', '[n] DUE OCT 26 1979. All of them.') },
    { id: 'lib_stack_papers', type: 'bookshelf_tall', x: 3, y: 31,
      examine: by("[n] Bound newspapers. *Pottsville Republican*, 1962. Somebody cut October out with a razor.", '[n] 1962. No October.') },
    { type: 'decal_papers', x: 9, y: 24 },
    { type: 'decal_papers', x: 14, y: 29 },
    { type: 'decal_papers', x: 8, y: 33 },
    { type: 'decal_stain', x: 21, y: 30 },
    { type: 'decal_stain', x: 2, y: 27 },
    { type: 'cobweb', x: 1, y: 34 },
    { type: 'cobweb', x: 26, y: 34 },
    { type: 'cobweb', x: 26, y: 14 },
  ],

  doors: {
    '27,9': { id: 'lib_mezz_door', label: 'WEST HALL — 2F', to: { map: 'west2', anchor: 'from_library' } },
  },

  rooms: [
    { id: 'lib_mezzanine', name: 'Library — Mezzanine', rect: [1, 3, 26, 9], kind: 'library', floor: '2F' },
    { id: 'lib_reading', name: 'Library', rect: [1, 14, 26, 21], kind: 'library' },
  ],

  anchors: {
    from_west1: [24, 20, 'left'],
    from_west2: [24, 9, 'left'],
    spiral_bottom: [3, 15, 'down'],
    spiral_top: [4, 9, 'right'],
    leah_table: [11, 15, 'down'],   // Leah's chair (lib_leah_chair, walkable, noSit) — she sits facing the room
    leah_talk: [11, 18, 'up'],      // across the table from her
    card_catalog: [21, 15, 'up'],
    display_case: [15, 15, 'up'],
    barricade: [24, 19, 'right'],
    gallery: [10, 10, 'down'],      // the walkway at the rail, over the lamp
  },

  exits: [
    { rect: [1, 13, 2, 1], to: 'library', anchor: 'spiral_top' },     // up the spiral (1F → 2F)
    { rect: [1, 11, 2, 1], to: 'library', anchor: 'spiral_bottom' },  // down the spiral (2F → 1F)
  ],

  triggers: [
    { id: 'library_enter', rect: [17, 8, 3, 3], script: 'ch5.library_enter', cond: (s) => s.chapter >= 5 && !F(s).ch5_leah_found },
    { id: 'leah', rect: [8, 14, 7, 6], script: 'ch5.leah', cond: (s) => s.chapter >= 5 && !F(s).ch5_leah_found },
    { id: 'marcus_knock', rect: [15, 14, 12, 5], script: 'ch5.marcus_knock', cond: knockReady },
    { id: 'marcus_knock_s', rect: [1, 19, 26, 16], script: 'ch5.marcus_knock', cond: knockReady },
  ],

  // Light: the mezzanine windows (automatic moonlight), the one green lamp on Leah's table (group
  // 'library'), and the EXIT over the barricaded doors. The reading room is otherwise left dark.
  lights: [],

  past: [
    { id: 'librarian', rect: [18, 14, 8, 5], setFlag: 'saw_catalog_past',
      hint: 'A librarian at the catalog. One drawer pulled all the way out.',
      figures: [{ sprite: 'figure79', x: 23, y: 14, dir: 'left', anim: 'idle_left' }],
      text: [{ x: 21, y: 14, dx: 30, dy: -27, text: 'HA-HE', color: '#f2e2a8' }] }, // on the paneling by the catalog's top corner (past text draws under floor props)
  ],
};
