// AI TEST MAP — exercises the game systems (src/game/*): periods, the Colonel, Kevin, the assembly
// cycle, the basement stir rule and (with an injected `longhall` field) the looping hall. Not part of
// the story; used by tests/systems.mjs.
//
//   North: Room A (classroom, desks) · cloakroom side door · Room B (classroom, desks, a computer) ·
//          Room C "aud" (stage + lectern, three rows of aud_seat with `row` 1 / 4 / 5, centre aisle).
//   Hall (rows 15–19) with period fluorescents, two benches, hall clocks, exit signs; patrol graph
//   w–a–b–m–c–d–e along it; folds (wall seams) at x 34 and 56 in the north wall and at the west end;
//   peeks into A, B and C; a Kevin spot at the east end.
//   South: a storage room behind a door with a coal heap that exists only while flag ai_heap is set.
//
//   x →  0         1         2         3         4         5         6
//        0123456789012345678901234567890123456789012345678901234567890123
const desks = [];
for (const [x0, y] of [[3, 6], [3, 9], [16, 6], [16, 9]]) {
  for (const dx of [0, 2]) desks.push({ type: 'desk_student', x: x0 + dx, y });
}
for (const [x0, y] of [[10, 6], [10, 9], [22, 6], [22, 9]]) {
  for (const dx of [0, 2]) desks.push({ type: 'desk_student', x: x0 + dx, y });
}

// Auditorium-like block: rows at y 7 / 9 / 11 numbered 1 / 4 / 5 (front → back), aisle x 42–47.
const seats = [];
const ROWS = [[7, 1], [9, 4], [11, 5]];
for (const [y, row] of ROWS) {
  for (let x = 31; x <= 58; x++) {
    if (x >= 42 && x <= 47) continue;
    const occupied = (x + row) % 4 === 0;
    seats.push({
      id: `ai_seat_${x}_${y}`, type: 'aud_seat', x, y, row,
      state: occupied ? 'occupied' : 'empty', occupant: occupied ? ['husk_a', 'husk_b', 'husk_c'][x % 3] : undefined,
    });
  }
}

export default {
  id: 'test_ai',
  name: 'AI Test Wing',
  floor: '1F',
  offset: [0, 40],
  ambience: 'hall',
  music: null,
  dark: 0.92,
  ambient: '#0b1020',
  tiles: [
    '                                                                ', //  0
    ' ############################################################## ', //  1
    ' ####W####W#######W####W#########W######W#########W######W##### ', //  2
    ' ####W####W#######W####W#########W######W#########W######W##### ', //  3
    ' #............#............#==================================# ', //  4
    ' #............#............#==================================# ', //  5
    ' #............#............#==================================# ', //  6
    ' #............#............#==================================# ', //  7
    ' #............D............#==================================# ', //  8
    ' #............#............#==================================# ', //  9
    ' #............#............#==================================# ', // 10
    ' #............#............#==================================# ', // 11
    ' #######D###########D#######################DD################# ', // 12
    ' #######D###########D#######################DD################# ', // 13
    ' #######D###########D#######################DD################# ', // 14
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,# ', // 15
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,# ', // 16
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,# ', // 17
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,# ', // 18
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,# ', // 19
    ' #####D######################################################## ', // 20
    ' #####D#########                                                ', // 21
    ' #####D#########                                                ', // 22
    ' #:::::::::::::#                                                ', // 23
    ' #:::::::::::::#                                                ', // 24
    ' #:::::::::::::#                                                ', // 25
    ' #:::::::::::::#                                                ', // 26
    ' #:::::::::::::#                                                ', // 27
    ' ###############                                                ', // 28
    '                                                                ', // 29
  ],
  objects: [
    ...desks,
    ...seats,
    { id: 'ai_chalk_a', type: 'chalkboard', x: 6, y: 3, state: 'text', text: 'ROOM A' },
    { id: 'ai_chalk_b', type: 'chalkboard', x: 18, y: 3, state: 'text', text: 'ROOM B' },
    { id: 'ai_computer', type: 'computer_desk', x: 25, y: 4, state: 'off' },
    { id: 'ai_lectern', type: 'lectern', x: 44, y: 5 },
    { id: 'ai_bench_w', type: 'bench', x: 30, y: 15 },
    { id: 'ai_bench_e', type: 'bench', x: 52, y: 15 },
    { id: 'ai_clock_w', type: 'clock_hall', x: 12, y: 14 },
    { id: 'ai_clock_e', type: 'clock_hall', x: 38, y: 14 },
    { id: 'ai_exit_w', type: 'exit_sign', x: 2, y: 14, state: 'on' },
    { id: 'ai_exit_e', type: 'exit_sign', x: 61, y: 14, state: 'on' },
    { id: 'ai_coal_heap', type: 'coal_heap', x: 5, y: 24, state: 'occupied', cond: (s) => !!s.flags.ai_heap },
  ],
  doors: {
    '8,14': { label: 'ROOM A' },
    '20,14': { label: 'ROOM B' },
    '6,22': { label: 'STORAGE' },
  },
  rooms: [
    { id: 'ai_a', name: 'Room A', rect: [2, 4, 12, 8], kind: 'classroom' },
    { id: 'ai_b', name: 'Room B', rect: [15, 4, 12, 8], kind: 'classroom' },
    { id: 'ai_c', name: 'Auditorium', rect: [28, 4, 34, 8], kind: 'auditorium' },
    { id: 'ai_hall', name: 'AI Hall', rect: [2, 15, 60, 5], kind: 'hall' },
    { id: 'ai_store', name: 'Storage', rect: [2, 23, 13, 5], kind: 'basement' },
  ],
  anchors: {
    start: [30, 17, 'down'],
    hall_w: [4, 17, 'right'],
    hall_mid: [32, 17, 'down'],
    hall_e: [58, 17, 'left'],
    in_a: [8, 10, 'up'],
    in_b: [20, 10, 'up'],
    below_desk_a: [10, 10, 'up'],    // facing the Room A desk at (10, 9)
    below_desk_b: [22, 10, 'up'],
    lectern: [44, 4, 'down'],        // the Colonel stands behind the lectern prop
    aud_aisle: [44, 8, 'down'],
    aud_row1: [33, 6, 'down'],       // facing the row-1 seat at (33, 7)
    aud_row4: [33, 8, 'down'],       // facing the row-4 seat at (33, 9)
    aud_row5: [33, 10, 'down'],      // facing the row-5 seat at (33, 11)
    kevin: [61, 17, 'left'],
    coal_heap: [7, 25],
    store: [10, 25, 'left'],
    store_door: [6, 19, 'down'],
    loop_reset: [50, 17, 'left'],
  },
  lights: [
    ...[5, 11, 17, 23, 29, 35, 41, 47, 53, 59].map((x) => ({ type: 'fluor', x, y: 16, group: 'period', flicker: false })),
    { type: 'fluor', x: 7, y: 7, group: 'period', flicker: false },
    { type: 'fluor', x: 20, y: 7, group: 'period', flicker: false },
    { type: 'fluor', x: 36, y: 8, group: 'period', flicker: false },
    { type: 'fluor', x: 53, y: 8, group: 'period', flicker: false },
    { type: 'bulb', x: 8, y: 24, intensity: 0.5 },
  ],
  patrol: {
    nodes: { w: [3, 17], a: [8, 17], b: [20, 17], m: [32, 17], c: [44, 17], d: [52, 17], e: [60, 17] },
    edges: [['w', 'a'], ['a', 'b'], ['b', 'm'], ['m', 'c'], ['c', 'd'], ['d', 'e']],
    folds: [[34, 14], [56, 14], [1, 16]],
    peeks: [
      { room: 'ai_a', door: [8, 14], look: [8, 10] },
      { room: 'ai_b', door: [20, 14], look: [20, 10] },
      { room: 'ai_c', door: [44, 14], look: [44, 10] },
    ],
    kevin: [[61, 17, 'left']],
  },
};
