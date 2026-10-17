// TEST MAP 2 — a library and corridor connected to `test` both ways (fade west, seamless east),
// with opaque bookshelves, a glass door, double doors, a transfer prop (spiral stair), a mirror,
// a script prop and a repeatable (non-once) trigger.
//
//   x →  0         1         2         3
//        01234567890123456789012345678901
export default {
  id: 'test2',
  name: 'Engine Test Library',
  floor: '1F',
  offset: [48, 0],
  ambience: 'library',
  music: null,
  dark: 0.92,
  ambient: '#0b1020',
  tiles: [
    '                                ', //  0
    ' ############################## ', //  1
    ' ####W######W######W######W#### ', //  2
    ' ####W######W######W######W#### ', //  3
    ' #============================# ', //  4  library
    ' #============================# ', //  5
    ' #============================# ', //  6
    ' #============================# ', //  7
    ' #########D#########DD######### ', //  8  corridor north wall (glass door, double doors)
    ' #########D#########DD######### ', //  9
    ' #########D#########DD######### ', // 10
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,, ', // 11  corridor
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,, ', // 12
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,, ', // 13
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,, ', // 14
    ' ############################## ', // 15
    '                                ', // 16
  ],
  objects: [
    { type: 'bookshelf_tall', x: 2, y: 4, examine: '[n] Encyclopaedias, A through Z, minus H.' },
    { type: 'bookshelf_tall', x: 4, y: 4 },
    { type: 'bookshelf_tall', x: 6, y: 4 },
    { type: 'chair_library', x: 14, y: 4 },
    { type: 'chair_library', x: 15, y: 4 },
    { type: 'reading_table', x: 14, y: 5, examine: '[n] A long oak table. Yearbooks, stacked by decade.' },
    { id: 'test2_lamp', type: 'lamp_banker', x: 15, y: 5, light: { type: 'lamp_green', group: 'library' } },
    { id: 'test2_catalog', type: 'card_catalog', x: 23, y: 4, script: 'test.catalog' },
    { type: 'mirror', x: 27, y: 3, state: 'fogged', examine: '[worried] Fogged. Like someone breathed on it from the inside.' },
    { id: 'test2_stair', type: 'stair_spiral', x: 27, y: 5, to: { map: 'test', anchor: 'start' },
      examine: '[n] A cast-iron spiral stair.' },
    { type: 'decal_papers', x: 9, y: 6 },
    { type: 'cobweb', x: 29, y: 4 },
    { id: 'test2_bench', type: 'bench', x: 12, y: 11 },
    { type: 'clock_hall', x: 15, y: 10 },
    { type: 'exit_sign', x: 2, y: 10, state: 'on' },
    { type: 'exit_sign', x: 29, y: 10, state: 'dead' },
    { type: 'decal_leaves', x: 25, y: 13 },
  ],
  doors: {
    '10,10': { type: 'door_glass', label: 'LIBRARY' },
  },
  rooms: [
    { id: 'test2_library', name: 'Library', rect: [2, 4, 28, 4], kind: 'library' },
    { id: 'test2_corridor', name: 'Corridor', rect: [1, 11, 30, 4], kind: 'hall' },
  ],
  anchors: {
    from_test: [2, 12, 'right'],
    loop: [29, 12, 'left'],
    start2: [15, 12, 'down'],
    lib: [12, 6, 'up'],
    table: [14, 7, 'up'],
    catalog: [23, 5, 'up'],
    stair: [27, 7, 'up'],
    t2_w: [14, 12, 'right'],
    t2_e: [18, 12, 'left'],
  },
  exits: [
    { rect: [1, 11, 1, 4], to: 'test', anchor: 'from_test2' },
    // Seamless loop, gated: refuses (in voice) while the flag holds it shut.
    { rect: [30, 11, 1, 4], to: 'test', anchor: 'loop_back', fade: false,
      lock: (s) => !!s.flags.test_block_loop, lockedText: "[n] The door won't open. Something on the other side is holding it." },
  ],
  triggers: [
    { id: 'count', rect: [16, 11, 1, 4], script: 'test.t2_trigger', once: false, blocking: false },
  ],
  lights: [
    { type: 'fluor', x: 8, y: 12, group: 'period' },
    { type: 'fluor', x: 22, y: 12, group: 'period' },
    { type: 'bulb', x: 24, y: 6, intensity: 0.6 },
  ],
};
