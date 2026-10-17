// TEST MAP — exercises every map feature the engine supports (not part of the story).
//   Room A (classroom, past view), Room B (glass door, lamp, key pickup), Room C (locked restroom),
//   side door A↔B, hall with lockers (one hides), bench, wall props, decals, over props, trigger,
//   office (double doors) and storage (metal door), exits to test2 (fade east, seamless west),
//   period-group fluorescents, conditional objects, patrol graph.
//
//   x →  0         1         2         3         4
//        012345678901234567890123456789012345678901234567
export default {
  id: 'test',
  name: 'Engine Test Wing',
  floor: '1F',
  offset: [0, 0],
  ambience: 'hall',
  music: null,
  dark: 0.9,
  ambient: '#0b1020',
  tiles: [
    '                                                ', //  0
    ' ################################               ', //  1  rooms' north wall: top
    ' ##W#######W####W#####W######W###               ', //  2  face_high (windows)
    ' ##W#######W####W#####W######W###               ', //  3  face_low
    ' #...........#...........#______#               ', //  4  Room A | Room B | Room C
    ' #...........#...........#______#               ', //  5
    ' #...........#...........#______#               ', //  6
    ' #...........D...........#______#               ', //  7  side door A↔B
    ' #...........#...........#______#               ', //  8
    ' #...........#...........#______#               ', //  9
    ' ######D###########D########D################## ', // 10  hall north wall: top
    ' ######D###########D########D################## ', // 11  face_high
    ' ######D###########D########D################## ', // 12  face_low
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,, ', // 13  hall
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,, ', // 14
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,, ', // 15
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,, ', // 16
    ' ########DD###############D#################### ', // 17  office/storage north wall: top
    ' ########DD###############D#####                ', // 18  face_high
    ' ########DD###############D#####                ', // 19  face_low
    ' #"""""""""""""""""""#:::::::::#                ', // 20  office | storage
    ' #"""""""""""""""""""#:::::::::#                ', // 21
    ' #"""""""""""""""""""#:::::::::#                ', // 22
    ' #"""""""""""""""""""#:::::::::#                ', // 23
    ' ###############################                ', // 24  south wall
    '                                                ', // 25
  ],
  propLegend: { d: 'desk_student', L: 'locker' },
  propLayer: [
    '................................................',
    '................................................',
    '................................................',
    '................................................',
    '................................................',
    '................................................',
    '...d.d...d.d....................................',
    '...............d.d...d.d........................',
    '...d.d...d.d....................................',
    '................................................',
    '................................................',
    '................................................',
    '................................................',
    '..LLLL....LLLL........LLLL......................',
    '................................................',
    '................................................',
    '................................................',
    '................................................',
    '................................................',
    '................................................',
    '................................................',
    '................................................',
    '................................................',
    '................................................',
    '................................................',
    '................................................',
  ],
  objects: [
    // ---- Room A
    { id: 'test_chalkboard', type: 'chalkboard', x: 5, y: 3, state: 'text', text: 'TEST ROOM A' },
    { type: 'clock_wall', x: 9, y: 3 },
    { type: 'desk_teacher', x: 3, y: 4, examine: ['[n] A teacher\'s desk. Grade book, empty.', '[skeptical] Somebody carved "KR \'91" into it.'] },
    { type: 'desk_student', x: 3, y: 6, examine: '[n] Initials: D.W. + M.R. in a heart.' }, // merges with the prop-layer desk
    // ---- Room B
    { type: 'bulletin_board', x: 18, y: 3, state: 'bell_schedule', doc: 'bell_schedule', examine: '[curious] A bell schedule. 1979–80.' },
    { type: 'poster', x: 20, y: 3, state: 'periodic', examine: '[n] The periodic table, missing the bottom row.' },
    { id: 'test_teacher_desk', type: 'desk_teacher', x: 21, y: 4, script: 'test.teacher_desk' },
    { id: 'test_lamp', type: 'lamp_banker', x: 22, y: 4, light: { type: 'lamp_green', group: 'roomb' } },
    { id: 'test_keyring', type: 'pickup', x: 16, y: 5, item: 'keyring' },
    { type: 'bookshelf_low', x: 23, y: 9, examine: '[n] Textbooks. *Our Pennsylvania*, 1971 edition.' },
    // ---- Room C (restroom)
    { type: 'mirror', x: 26, y: 3, state: 'grimy', examine: '[worried] Too grimy to see much. That\'s fine.' },
    { type: 'mirror', x: 27, y: 3, state: 'cracked' },
    { type: 'sink', x: 26, y: 4 },
    { type: 'sink', x: 27, y: 4 },
    { type: 'stall', x: 30, y: 4 },
    { type: 'stall', x: 31, y: 4 },
    { type: 'decal_stain', x: 27, y: 7 },
    // ---- hall
    { id: 'test_locker_hide', type: 'locker', x: 4, y: 13, hide: 'locker', examine: '[n] A locker with vent slits. Big enough to hide in.' },
    { type: 'bulletin_board', x: 15, y: 12, state: 'generic', examine: '[n] Flyers for a 1979 bake sale.' },
    { type: 'clock_hall', x: 17, y: 12 },
    { type: 'poster', x: 21, y: 12, state: 'patrol' },
    { type: 'fire_extinguisher', x: 30, y: 12 },
    { id: 'test_exit_w', type: 'exit_sign', x: 35, y: 12, state: 'flicker' },
    { id: 'test_exit_e', type: 'exit_sign', x: 45, y: 12, state: 'on' },
    { id: 'test_bench', type: 'bench', x: 37, y: 13, examine: '[n] An oak bench, worn pale where people sat.' },
    { type: 'water_fountain', x: 40, y: 13, examine: '[n] Dry. A rust stain like a tongue.' },
    { type: 'trash_can', x: 41, y: 13 },
    { type: 'decal_papers', x: 24, y: 14 },
    { type: 'decal_stain', x: 8, y: 15 },
    { id: 'test_glass', type: 'decal_glass', x: 33, y: 15 },
    { type: 'decal_leaves', x: 43, y: 15 },
    { type: 'pipe_h', x: 33, y: 14 },
    { type: 'pipe_h', x: 34, y: 14 },
    { type: 'pipe_h', x: 35, y: 14 },
    { type: 'pipe_h', x: 36, y: 14 },
    { type: 'cobweb', x: 1, y: 13 },
    // Conditional objects (re-evaluated on refresh()).
    { id: 'test_note', type: 'note_paper', x: 40, y: 15, doc: 'sample_note', cond: (s) => !!s.flags.test_note },
    { id: 'test_backpack', type: 'backpack', x: 44, y: 14, item: 'bolt_cutters', cond: (s) => s.chapter >= 1,
      examine: "[n] Danny's backpack. Heavy." },
    // ---- office & storage
    { type: 'office_desk', x: 4, y: 21 },
    { id: 'test_office_chair', type: 'office_chair', x: 4, y: 20 },
    { type: 'counter', x: 12, y: 21, examine: '[n] A reception counter. The sliding window is stuck open.' },
    { type: 'mailboxes', x: 14, y: 19, examine: '[n] Pigeonholes. ADAIR. HAUPT. LUTZ.' },
    { type: 'filing_cabinet', x: 19, y: 20 },
    { type: 'plant_dead', x: 2, y: 20 },
    { type: 'shelf_metal', x: 23, y: 20 },
    { type: 'mop_bucket', x: 29, y: 20 },
    { id: 'test_battery', type: 'pickup', x: 28, y: 22, item: 'battery', count: 2 },
    { id: 'test_cage_bulb', type: 'cage_bulb', x: 24, y: 19, state: 'on' },
  ],
  doors: {
    '7,12': { label: 'ROOM A' },
    '19,12': { type: 'door_glass', label: 'ROOM B' },
    '28,12': { id: 'test_door_c', state: 'locked', lock: 'item:keyring', label: 'GIRLS',
      lockedText: ['[n] Locked. A hand-lettered sign: OUT OF ORDER.', '[skeptical] Since 1979, probably.'] },
    '9,19': { label: 'MAIN OFFICE' },
    '26,19': { type: 'door_metal', label: 'STORAGE' },
  },
  rooms: [
    { id: 'test_a', name: 'Room A', rect: [2, 4, 11, 6], kind: 'classroom' },
    { id: 'test_b', name: 'Room B', rect: [14, 4, 11, 6], kind: 'classroom' },
    { id: 'test_c', name: 'Restroom', rect: [26, 4, 6, 6], kind: 'restroom' },
    { id: 'test_hall', name: 'Test Hall', rect: [1, 13, 46, 4], kind: 'hall' },
    { id: 'test_office', name: 'Office', rect: [2, 20, 19, 4], kind: 'office' },
    { id: 'test_storage', name: 'Storage', rect: [22, 20, 9, 4], kind: 'basement' },
  ],
  anchors: {
    start: [20, 15, 'down'],
    from_test2: [45, 14, 'left'],
    loop_back: [2, 15, 'right'],
    in_a: [7, 8, 'up'],
    in_b: [19, 8, 'up'],
    in_c: [28, 7, 'up'],
    door_c: [28, 13, 'up'],
    keyring: [16, 6, 'up'],
    bench: [37, 14, 'up'],
    locker: [4, 14, 'up'],
    desk_a: [3, 7, 'up'],
    past_a: [7, 7, 'up'],
    teacher_b: [21, 5, 'up'],
    office: [10, 21, 'down'],
    office_chair: [5, 20, 'left'],
    storage: [26, 21, 'down'],
    battery: [28, 21, 'down'],
    note: [40, 14, 'down'],
    backpack: [44, 15, 'up'],
    trig_w: [26, 14, 'right'],
    trig_e: [32, 14, 'left'],
    danny_spot: [33, 15, 'left'],
    hall_east: [43, 15, 'right'],
  },
  exits: [
    { rect: [46, 13, 1, 4], to: 'test2', anchor: 'from_test', fade: true },
    { rect: [1, 13, 1, 4], to: 'test2', anchor: 'loop', fade: false }, // seamless (like the Ch1 loop)
  ],
  triggers: [
    { id: 'hall', rect: [29, 13, 2, 4], script: 'test.hall_trigger', once: true },
  ],
  lights: [
    { type: 'fluor', x: 6, y: 14, group: 'period' },
    { type: 'fluor', x: 18, y: 14, group: 'period' },
    { type: 'fluor', x: 30, y: 14, group: 'period' },
    { type: 'fluor', x: 42, y: 14, group: 'period' },
    { type: 'bulb', x: 11, y: 21 },
  ],
  patrol: {
    nodes: { w: [3, 15], mid: [20, 15], e: [44, 15] },
    edges: [['w', 'mid'], ['mid', 'e']],
    folds: [[24, 12]],
    peeks: [{ room: 'test_a', door: [7, 12], look: [7, 8] }],
  },
  past: [
    {
      id: 'test_room_a_1979', rect: [2, 4, 11, 6], hint: 'Rows of students. Somebody wrote on the board.',
      objects: [{ type: 'chalkboard', x: 5, y: 3, state: 'blank' }, { type: 'desk_student', x: 7, y: 6 }],
      hide: ['test_chalkboard', 'test_desk_student_11_8'],
      figures: [
        { sprite: 'figure79', x: 3, y: 6, anim: 'sit_up' },
        { sprite: 'figure79', x: 9, y: 8, anim: 'sit_up' },
        { sprite: 'figure79', x: 7, y: 6, anim: 'sit_up' },
      ],
      adair: { x: 10, y: 4, anim: 'point_left' },
      text: [{ x: 5, y: 3, text: 'ASSEMBLY 1:45', style: 'chalk' }],
      setFlag: 'test_saw_past',
    },
  ],
  onEnter: 'test.onEnter',
};
