// Props A preview — mock rooms composed from real tiles + props (+ a few character sprites to check
// scale and seat readability). 30×17 tiles each. Doors are listed explicitly (the engine would
// auto-create them from the D runs).
const W30 = (s) => s.padEnd(30, s[s.length - 1]).slice(0, 30);

function actor(sprite, anim, tx, ty, { dx = 0, dy = 0, seat = false } = {}) {
  // feet point = (tx*16+8, ty*16+12); seated actors sort just after their seat
  return (getSprite) => {
    const sh = getSprite(sprite);
    const a = sh.anims[anim] || sh.anims.idle_down;
    const f = a.frames[0];
    const fx = tx * 16 + 8 + dx, fy = ty * 16 + 12 + dy;
    return { sortY: seat ? (ty + 1) * 16 + 0.25 : fy, draw: (ctx) => ctx.drawImage(f, fx - sh.ax, fy - sh.ay) };
  };
}

// ---------------------------------------------------------------------------------- classroom
const classroom = {
  id: 'sc_classroom', name: 'Room 102 — classroom (desks in rows, teacher desk, chalkboard, clock, flag, door, radiator under the window)',
  rows: [
    '#############D################',
    '##WW##WW#####D################',
    '##WW##WW#####D################',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '##############################',
  ],
  props: [
    { type: 'door_class', x: 13, y: 1, state: 'closed', label: 'Room 102' },
    { type: 'radiator', x: 2, y: 3 }, { type: 'radiator', x: 6, y: 3, variant: 1 },
    { type: 'coat_hooks', x: 10, y: 2 },
    { type: 'alphabet_strip', x: 16, y: 2 },
    { type: 'chalkboard', x: 16, y: 2, params: { text: 'DANIEL KOVACH — PRESENT' } },
    { type: 'clock_wall', x: 20, y: 2, params: { time: 1.74 } },
    { type: 'flag_us', x: 21, y: 2 },
    { type: 'bulletin_board', x: 23, y: 2, state: 'generic' },
    { type: 'poster', x: 26, y: 2, state: 'read' }, { type: 'poster', x: 27, y: 2, state: 'foodgroups' },
    { type: 'chair_teacher', x: 17, y: 4, dir: 'down', sitDir: 'down' },
    { type: 'desk_teacher', x: 16, y: 5, dir: 'down' },
    { type: 'trash_can', x: 19, y: 5 },
    { type: 'globe', x: 26, y: 4 },
    { type: 'bookshelf_low', x: 26, y: 6, variant: 1 },
    { type: 'projector', x: 4, y: 6 },
    ...[8, 10, 12, 14].flatMap((y, r) => [7, 10, 13, 16, 19, 22].map((x, c) => ({ type: 'desk_student', x, y, variant: (r * 7 + c * 3) % 6,
      state: r === 3 && c === 5 ? 'overturned' : r === 2 && c === 0 ? 'scattered' : 'default' }))),
    { type: 'trash_can', x: 2, y: 14, variant: 1 },
  ],
  actors: [actor('tess', 'sit_up', 13, 12, { seat: true }), actor('leah', 'sit_up', 16, 12, { seat: true }), actor('danny', 'idle_down', 4, 11)],
  lights: [{ x: 13 * 16 + 8, y: 12 * 16, r: 150, cone: [-2.2, -0.9] }, { x: 4 * 16, y: 2 * 16, r: 70, color: 'rgba(127,156,196,0.55)' }],
};

// ---------------------------------------------------------------------------------- corridor
const corridor = {
  id: 'sc_corridor', name: 'West hall — corridor (locker row, fountain, trophy case, exit sign, bulletin board, doors)',
  rows: [
    '#########D####D############DD#',
    '#########D####D############DD#',
    '#########D####D############DD#',
    W30(','), W30(','), W30(','), W30(','), W30(','), W30(','), W30(','), W30(','),
    '##############################', '##############################', '#....#####......#####........#', '#....#####......#####........#', '##############################',
  ].map((r, i) => (i >= 3 && i <= 10 ? '#' + r.slice(1, 29) + '#' : r)),
  props: [
    ...[1, 2, 3, 4, 5, 6, 7].map((x, i) => ({ type: 'locker', x, y: 3, variant: i % 4, state: i === 2 ? 'open' : i === 5 ? 'dented' : 'closed' })),
    { type: 'door_class', x: 9, y: 1, state: 'closed', label: 'Room 103' },
    { type: 'exit_sign', x: 8, y: 2, state: 'on' },
    { type: 'bulletin_board', x: 11, y: 2, state: 'bell_schedule' },
    { type: 'door_class', x: 14, y: 1, state: 'open', label: 'Room 102' },
    { type: 'poster', x: 13, y: 2, state: 'patrol' },
    { type: 'clock_hall', x: 16, y: 2, params: { time: 1.72 } },
    { type: 'trophy_case', x: 17, y: 3 },
    { type: 'water_fountain', x: 21, y: 3 }, { type: 'trash_can', x: 22, y: 3 },
    { type: 'fire_extinguisher', x: 23, y: 2 },
    { type: 'poster', x: 24, y: 2, state: 'homecoming79' },
    { type: 'exit_sign', x: 25, y: 2, state: 'flicker' },
    { type: 'bench', x: 24, y: 9, dir: 'up', sitDir: 'up' },
    { type: 'door_double', x: 27, y: 1, state: 'chained' },
    { type: 'locker', x: 2, y: 9, variant: 1 },
  ],
  actors: [actor('tess', 'idle_up', 12, 6), actor('marcus', 'idle_left', 15, 7), actor('kevin', 'idle_down', 26, 6)],
  lights: [{ x: 12 * 16 + 8, y: 6 * 16, r: 170, cone: [-2.4, -0.7] }],
};

// ---------------------------------------------------------------------------------- lobby
const lobby = {
  id: 'sc_lobby', name: 'Lobby — the portrait, memorial board, plaque, bench, auditorium doors',
  rows: [
    'BBBBBBBBBBBBBBBBBBBBBBBBDDBBBB',
    'BBBBBBBBBBBBBBBBBBBBBBBBDDBBBB',
    'BBBBBBBBBBBBBBBBBBBBBBBBDDBBBB',
    'B' + 'm'.repeat(28) + 'B', 'B' + 'm'.repeat(28) + 'B', 'B' + 'm'.repeat(28) + 'B', 'B' + 'm'.repeat(28) + 'B',
    'B' + 'm'.repeat(28) + 'B', 'B' + 'm'.repeat(28) + 'B', 'B' + 'm'.repeat(28) + 'B', 'B' + 'm'.repeat(28) + 'B',
    'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  ],
  props: [
    { type: 'banner', x: 2, y: 2, state: 'colliers' },
    { type: 'memorial_board', x: 7, y: 2, params: { polaroids: { danny: true, leah: 'pencil', marcus: true }, tessFrame: 1 } },
    { type: 'portrait_colonel', x: 12, y: 2, state: 'seated' },
    { type: 'plaque', x: 16, y: 2 },
    { type: 'memorial_board', x: 18, y: 2 },
    { type: 'door_double', x: 24, y: 1, state: 'locked' },
    { type: 'exit_sign', x: 23, y: 2, state: 'dead' },
    { type: 'bench', x: 7, y: 6, dir: 'down', sitDir: 'down' },
    { type: 'trophy_case', x: 2, y: 8 },
    { type: 'plant_dead', x: 26, y: 8 },
  ],
  actors: [actor('tess', 'idle_up', 13, 6), actor('leah', 'sit_down', 8, 6, { seat: true })],
  lights: [{ x: 13 * 16 + 8, y: 6 * 16, r: 170, cone: [-2.3, -0.8] }],
};

// ---------------------------------------------------------------------------------- office
const office = {
  id: 'sc_office', name: 'Main office — counter, PA console, mailboxes, small portrait, waiting chairs',
  rows: [
    '##############################',
    '##############################',
    '##############################',
    '#"""""""""""""""""""""""""""""#'.slice(0, 30),
    ...Array(11).fill('#' + '"'.repeat(28) + '#'),
    '#############D################'.replace('D', '#'),
    '##############################',
  ],
  props: [
    { type: 'mailboxes', x: 2, y: 2 },
    { type: 'portrait_small', x: 6, y: 2, state: 'closed' },
    { type: 'eye_chart', x: 8, y: 2 },
    { type: 'master_clock', x: 10, y: 3 },
    { type: 'clock_wall', x: 12, y: 2, params: { time: 1.75 } },
    { type: 'pa_console', x: 13, y: 3 },
    { type: 'filing_cabinet', x: 16, y: 3 }, { type: 'filing_cabinet', x: 17, y: 3, variant: 1 },
    { type: 'water_cooler', x: 19, y: 3 },
    { type: 'portrait_small', x: 21, y: 2, state: 'open' },
    { type: 'coat_rack', x: 23, y: 3 },
    { type: 'shelf_med', x: 25, y: 3 },
    { type: 'cot', x: 25, y: 6 },
    { type: 'office_chair', x: 6, y: 6, dir: 'down', sitDir: 'down' },
    { type: 'office_desk', x: 5, y: 7, dir: 'down' },
    { type: 'office_chair', x: 17, y: 7, dir: 'left', sitDir: 'left', variant: 1 },
    { type: 'counter', x: 2, y: 11 },
    { type: 'counter', x: 5, y: 11 },
    ...[10, 11, 12, 13].map((x, i) => ({ type: 'office_chair', x, y: 12, dir: 'up', sitDir: 'up', variant: i % 3 })),
    { type: 'plant_dead', x: 15, y: 12 },
    { type: 'office_desk', x: 20, y: 9, dir: 'up', variant: 1 },
    { type: 'office_chair', x: 21, y: 10, dir: 'up', sitDir: 'up' },
  ],
  actors: [actor('marcus', 'sit_up', 11, 12, { seat: true }), actor('tess', 'idle_up', 14, 5)],
  lights: [{ x: 14 * 16 + 8, y: 5 * 16, r: 170, cone: [-2.3, -0.8] }, { x: 13 * 16 + 30, y: 3 * 16 - 4, r: 20, color: 'rgba(255,42,26,0.8)' }],
};

// ---------------------------------------------------------------------------------- library
const library = {
  id: 'sc_library', name: 'Library — tall stacks, card catalog, reading table + chairs + banker lamp, circulation desk, display case, spiral',
  rows: [
    'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
    'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
    ...Array(13).fill('P' + '='.repeat(28) + 'P'),
    'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
  ],
  props: [
    { type: 'bookshelf_tall', x: 1, y: 3 }, { type: 'bookshelf_tall', x: 3, y: 3, variant: 1 }, { type: 'bookshelf_tall', x: 5, y: 3, variant: 2 },
    { type: 'bookshelf_tall', x: 1, y: 7, variant: 2 }, { type: 'bookshelf_tall', x: 3, y: 7 }, { type: 'bookshelf_tall', x: 5, y: 7, variant: 1 },
    { type: 'bookshelf_tall', x: 1, y: 11, variant: 1 }, { type: 'bookshelf_tall', x: 3, y: 11, variant: 2 }, { type: 'bookshelf_tall', x: 5, y: 11 },
    { type: 'card_catalog', x: 9, y: 3, variant: 1 },
    { type: 'clock_wall', x: 12, y: 2, params: { time: 1.75 } },
    { type: 'microfiche', x: 13, y: 3 },
    { type: 'display_case', x: 15, y: 3, state: 'locked' },
    { type: 'stair_spiral', x: 25, y: 4 },
    { type: 'chair_library', x: 11, y: 7, dir: 'down', sitDir: 'down' }, { type: 'chair_library', x: 12, y: 7, dir: 'down', sitDir: 'down' },
    { type: 'reading_table', x: 11, y: 8 },
    { type: 'lamp_banker', x: 12, y: 8, state: 'on' },
    { type: 'yearbook_pile', x: 11, y: 9 },
    { type: 'chair_library', x: 11, y: 10, dir: 'up', sitDir: 'up' }, { type: 'chair_library', x: 12, y: 10, dir: 'up', sitDir: 'up' },
    { type: 'chair_library', x: 17, y: 7, dir: 'down', sitDir: 'down' },
    { type: 'reading_table', x: 17, y: 8 },
    { type: 'lamp_banker', x: 18, y: 8, state: 'off' },
    { type: 'chair_library', x: 19, y: 9, dir: 'left', sitDir: 'left' },
    { type: 'librarian_desk', x: 13, y: 13 },
    { type: 'book_cart', x: 17, y: 13 },
    { type: 'poster', x: 20, y: 2, state: 'read' },
    { type: 'door_glass', x: 22, y: 1, state: 'closed', label: 'LIBRARY' },
  ],
  actors: [actor('leah_e', 'sit_down', 12, 7, { seat: true }), actor('tess', 'idle_left', 15, 10)],
  lights: [{ x: 12 * 16 + 8, y: 8 * 16 - 8, r: 48, color: 'rgba(158,214,154,0.9)' }, { x: 15 * 16 + 8, y: 10 * 16, r: 150, cone: [2.6, 3.9] }],
};

// ---------------------------------------------------------------------------------- restroom
const restroom = {
  id: 'sc_restroom', name: "Girls' restroom — stalls, sinks + mirrors (grimy / clean / fogged / cracked), urinals, showers",
  rows: [
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ...Array(12).fill('T' + '_'.repeat(28) + 'T'),
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', 'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  ],
  props: [
    { type: 'stall', x: 1, y: 3 }, { type: 'stall', x: 2, y: 3, variant: 1 }, { type: 'stall', x: 3, y: 3, variant: 2 }, { type: 'stall', x: 4, y: 3, variant: 3 },
    ...['grimy', 'clean', 'fogged', 'cracked'].map((st, i) => ({ type: 'mirror', x: 8 + i, y: 2, state: st })),
    ...[8, 9, 10, 11].map((x) => ({ type: 'sink', x, y: 3 })),
    { type: 'hand_dryer', x: 13, y: 2 }, { type: 'trash_can', x: 13, y: 3 },
    { type: 'urinal', x: 15, y: 3 }, { type: 'urinal', x: 16, y: 3 },
    ...[20, 22, 24, 26].map((x) => ({ type: 'shower_head', x, y: 2 })),
    { type: 'poster', x: 18, y: 2, state: 'foodgroups' },
  ],
  actors: [actor('tess', 'idle_up', 10, 5)],
  lights: [{ x: 10 * 16 + 8, y: 5 * 16, r: 160, cone: [-2.4, -0.7] }],
};

// ---------------------------------------------------------------------------------- doors & passages
const passages = {
  id: 'sc_passages', name: 'Doors & passages — side doors in a vertical wall, basement steel door + coal chute, stair gate, trapdoor, spiral, front doors',
  rows: [
    '###########CCCCCCCCCCCCCCCCCCC',
    '#####D#####CCCCDCCCCCCCCCCCCCC',
    '#####D#####CCCCDCCCCCCCCCCCCCC',
    '#.........#::::::::::::::::::C',
    '#.........#::::::::::::::::::C',
    '#.........D::::::::::::::::::C',
    '#.........#::::::::::::::::::C',
    '#.........#::::::::::::::::::C',
    '#####D#####CCCCCCCCCCCCCCCCCCC',
    '#.........#==================P',
    '#.........D==================P',
    '#.........#==================P',
    '#.........#==================P',
    '#.........#==================P',
    '#.........#==================P',
    '#.........#==================P',
    '##############################',
  ],
  props: [
    { type: 'door_class', x: 5, y: 1, state: 'locked', label: 'Room 101' },
    { type: 'door_side', x: 10, y: 5, state: 'closed' },
    { type: 'door_side', x: 10, y: 10, state: 'open' },
    { type: 'door_metal', x: 15, y: 1, state: 'locked' },
    { type: 'coal_chute', x: 18, y: 2, state: 'locked' },
    { type: 'coal_chute', x: 23, y: 2, state: 'open' },
    { type: 'gate_accordion', x: 2, y: 5, state: 'locked' },
    { type: 'gate_accordion', x: 6, y: 5, state: 'open' },
    { type: 'trapdoor', x: 13, y: 11, state: 'closed' }, { type: 'trapdoor', x: 17, y: 11, state: 'open' },
    { type: 'stair_spiral', x: 24, y: 12 },
  ],
  actors: [actor('tess', 'idle_right', 8, 5), actor('marcus', 'idle_down', 12, 6)],
  lights: [{ x: 8 * 16 + 8, y: 5 * 16, r: 150, cone: [-0.6, 0.6] }],
};

export const SCENES = [classroom, corridor, lobby, office, library, restroom, passages];
