// EAST HALL — FIRST FLOOR (east1) · 62×30 · offset (90, 22) · CONTENT §2.5 · maps-C
//
// The service wing: where the school ate, cleaned and played. One corridor (local rows 13–17 =
// world 35–39) from the lobby's east doors (west end, x 1) to the gym doors (east end, x 59).
//
//   NORTH (exterior wall, windows), west → east:
//     boys' room 1F (x 2–11) · EAST STAIRWELL (x 13–19, core x 14–18 = world 104–108; open brick arch
//     onto the hall): up flight x 14–15 behind the accordion gate `e1_gate` (row 9) → east2, a brick
//     newel wall x 16, down flight x 17–18 → basement; two tall landing windows throw moonlight down
//     the stairs, the brightest thing in the hall · custodian's closet (x 20–22, keyring) · ROOM 104,
//     seventh-grade homeroom (x 24–36; MR. H SAYS HI) · cloakroom door 104↔105 · ROOM 105, typing
//     (x 38–49) · coaches' office (x 51–58).
//   SOUTH, west → east:
//     CAFETERIA (x 2–29; double doors x 15–16 straight across from the stairs; GO COLLIERS!
//     HOMECOMING '79 banner) ↔ loop door (x 30) ↔ KITCHEN (x 31–48; own hall door x 41; mixer,
//     dumbwaiter x 38 — its shaft drops to the basement kitchen stores at the same world x —
//     and the WALK-IN, x 44–48 rows 21–22, warm and full of cicada shells) ↔ kitchen office (x 50–58).
//   EAST END: the gym doors (two door_side leaves in the end wall, like the lobby's east doors):
//     jammed by a fallen bleacher until `gym_open`, hanging open after → gym/from_east1.
//
// Beats: Ch3 `ch3_east` (first step in from the lobby) · gym doors jammed · dumbwaiter / mixer /
// freezer scripts · down to the basement · `first_period` at the top of the basement flight (cond
// ch3_keyring && !ch3_period_done; Marcus: "Cafeteria. Go." — the cafeteria doors are straight across the hall)
// · Ch5 the gate (`ch5.gate`) · Ch6 to the gym and back alone (Kevin spots in `patrol.kevin`; a
// PRESENT scratching appears by the gym doors once Marcus is taken).
//
// Notes for scripts:
//   - `e1_gate` (locked, script ch5.gate) is swapped for `e1_gate_open` when gate_2f_open is set
//     (g.set + g.refresh()); g.setProp('e1_gate', 'open') also works.
//   - `e1_gym_doors`/`_2` (jammed) ↔ `e1_gym_doors_open`/`_2` by flag gym_open.
//   - The anchor `from_east2` is on the landing just south of the gate (anchors behind a locked gate
//     fail the reachability check); `from_basement` is on the down flight, outside `first_period`.
//   - Cafeteria seats for the guided period: the eight caf_tables (one sitter each).
//
//   x →  0         1         2         3         4         5         6
//        01234567890123456789012345678901234567890123456789012345678901

const F = (s) => s.flags || {};
const inv = (s, id) => ((s.inv && s.inv[id]) || 0) > 0;
const withMarcus = (s) => (s.party || []).includes('marcus');
const alone = (s) => !!F(s).ch6_marcus_taken;
const readLog = (s) => !!(s.docs && s.docs.walt_log);
// Tess, by act: Ch3–5 tense and dry → alone (Ch6+) literal and frightened.
const v = (early, late) => (late ? [{ cond: alone, text: late }, { text: early }] : early);
// Marcus, while he's with her.
const M = (text, cond = (s) => withMarcus(s) && !alone(s)) => ({ marcus: [{ cond, text }] });
// "No. Seats." — hall lockers are never hide spots (DESIGN §4).
const LOCKER_RULE = [
  { cond: alone, text: '[scared] No. Seats.' },
  { cond: (s) => (s.chapter || 0) >= 3, text: '[worried] Not a locker. Seats. Marcus said seats.' },
];

const gymDoorsText = (s) => {
  if ((s.chapter || 0) >= 6) {
    return ["[n] The gym doors. Shut tight.", '[worried] The clarinet stopped.'];
  }
  return [
    '[n] GYMNASIUM. The doors give an inch and stop. Something heavy is lying against them on the inside.',
    "[curious] Through the gap: wood. The corner of a bleacher, on its side.",
    { cond: withMarcus, text: "[marcus:thoughtful] Bleachers came down. Somebody would've had to be in there to push 'em." },
  ];
};

const gateText = (s) => {
  if (!inv(s, 'keyring')) {
    return [
      '[n] A steel accordion gate across the stairs up. A tin sign: SECOND FLOOR CLOSED — BY ORDER OF THE DISTRICT.',
      "[skeptical] There's no padlock. The lock's built into the gate.",
      { cond: withMarcus, text: "[marcus:neutral] Janitor's keys. Whatever opens this, he had it." },
    ];
  }
  if (!F(s).roll1_done) {
    return [{ cond: withMarcus, text: "[marcus:worried] Not up. We don't even know where they are." }, '[tess:determined] The intercom.'];
  }
  return '[n] The key turns.';
};

export default {
  id: 'east1',
  name: 'East Hall — First Floor',
  floor: '1F',
  offset: [90, 22],
  ambience: 'hall',
  music: null,
  dark: 0.94,
  ambient: '#0b1020',
  tiles: [
    ' #TTTTTTTTTT#BBBBBBB########################################  ', //  0  north exterior wall (top)
    ' #TTTWWTTTTT#BBUBUBB#####WW#######WW##WW#######WW####WW#####  ', //  1  face_high (windows)
    ' #TTTWWTTTTT#BBUBUBB#####WW#######WW##WW#######WW####WW#####  ', //  2  face_low
    ' #__________#B^^BvvB:::#.............#............#........#  ', //  3  boys RR | stairs | closet | 104 | 105 | coaches
    ' #__________#B^^BvvB:::#.............#............#........#  ', //  4
    ' #__________#B^^BvvB:::#.............D............#........#  ', //  5  cloakroom 104↔105
    ' #__________#B^^BvvB:::#.............#............#........#  ', //  6
    ' #__________#B^^BvvB:::#.............#............#........#  ', //  7
    ' #__________#B^^BvvB:::#.............#............#........#  ', //  8
    ' #__________#BssBvvB:::#.............#............#........#  ', //  9  the gate (x 14–15)
    ' #######D####BsssssB#D####D###################D########D####  ', // 10  hall north wall: top (stair arch open)
    ' #######D####BsssssB#D####D###################D########D####  ', // 11  face_high
    ' #######D####BsssssB#D####D###################D########D####  ', // 12  face_low (hall props)
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#  ', // 13  corridor (world 35)
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#  ', // 14
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,  ', // 15  ← lobby (x 1) · gym doors (x 59) →
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,  ', // 16
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#  ', // 17  (world 39)
    ' ##############DD##############TTTTTTTTTTDTTTTTTTT##########  ', // 18  south rooms' north wall: top
    ' ##############DD##############TTTTTTTTTTDTTTTTTTT##########  ', // 19  face_high
    ' ##############DD##############TTTTTTTTTTDTTTTTTTT##########  ', // 20  face_low (banner, dumbwaiter)
    ' #............................#____________TrrrrrT.........#  ', // 21  cafeteria | kitchen + walk-in | office
    ' #............................#____________TrrrrrT.........#  ', // 22
    ' #............................#____________TTTDTTT.........#  ', // 23  walk-in front (freezer door x 46)
    ' #............................#____________TTTDTTT.........#  ', // 24
    ' #............................D__________________T.........#  ', // 25  loop door caf↔kitchen
    ' #............................#__________________D.........#  ', // 26  kitchen ↔ office
    ' #............................#__________________T.........#  ', // 27
    ' #............................#__________________T.........#  ', // 28
    ' ###########################################################  ', // 29
  ],

  objects: [
    // ======================================================== corridor (north wall face row 12, floor row 13)
    { id: 'e1_exit_lobby', type: 'exit_sign', x: 2, y: 12, state: 'flicker',
      examine: v(['[n] EXIT, back toward the lobby and the front doors.', '[skeptical] Sure.'], '[exhausted] EXIT. {p} Liar.') },
    { id: 'e1_bench_w', type: 'bench', x: 3, y: 13 },
    { id: 'e1_graffiti_names', type: 'graffiti', x: 5, y: 12, state: 'names',
      examine: v(["[n] Names in marker, decades deep. DK+LB in a lopsided heart. MIKE C '88. STACY. Under all of it, cut into the paint: RO 79.",
        "[worried] R.O. Raymond Oakes was nine. He's on the board in the lobby."],
      "[sad] RO 79. He was nine. He carved it with something he wasn't supposed to have."),
      banter: M("[thoughtful] Grandma knew all nine families. She still sends the Oakeses a Christmas card.") },
    { id: 'e1_fountain', type: 'water_fountain', x: 7, y: 13,
      examine: v('[n] Dry. A wad of Bazooka on the spout, the little comic still folded beside it.', '[n] Dry.') },
    { id: 'e1_bench_rr', type: 'bench', x: 9, y: 13 },
    { id: 'e1_locker_a', type: 'locker', x: 11, y: 13,
      examine: [...LOCKER_RULE, { text: '[n] Locked. A Steelers sticker, sun-bleached to pink.' }] },
    { id: 'e1_extinguisher', type: 'fire_extinguisher', x: 12, y: 12,
      examine: [{ cond: readLog, text: ['[n] INSPECTED 6/79 — W.P.', '[sad] Walt checked every one. Every June.'] },
        { text: '[n] INSPECTED 6/79, initialed W.P.' }] },
    { id: 'e1_exit_stair', type: 'exit_sign', x: 13, y: 12, state: 'on',
      examine: v(['[n] EXIT, over the stairs.', "[curious] Down's the basement. Up's the gate."],
        "[scared] Up is everybody. Down is the coal.") },
    { id: 'e1_poster_stairs', type: 'poster', x: 19, y: 12, state: 'patrol',
      examine: v(["[n] ONE STEP AT A TIME! WALK ON THE STAIRS. — YOUR SAFETY PATROL", '[worried] Walk. Got it.'],
        '[scared] Walk. Walk walk walk.') },
    { id: 'e1_locker_b', type: 'locker', x: 20, y: 13, state: 'open',
      examine: [...LOCKER_RULE, { text: '[n] Hanging open. A mirror inside the door, and a school photo taped to it: a girl with a feathered perm, mid-laugh.' }] },
    { id: 'e1_bench_stair', type: 'bench', x: 22, y: 13 },
    { id: 'e1_clock_w', type: 'clock_hall', x: 22, y: 12,
      examine: v(['[n] Twenty to two.', "[worried] Every clock in here agrees. That's the part I don't like."],
        "[scared] Twenty to two. Quarter to is the bell.") },
    { id: 'e1_bulletin', type: 'bulletin_board', x: 24, y: 12, state: 'generic',
      examine: v(["[n] SPIRIT WEEK! Mon. PAJAMA DAY · Tue. HAT DAY · Wed. TWIN DAY · Thu. BACKWARDS DAY · Fri. GREEN & GOLD!",
        "[n] At the bottom: HOMECOMING DANCE — SAT. OCT. 20 — GYM — $2.", '[sad] Saturday.'],
      '[sad] HOMECOMING DANCE — SAT. OCT. 20. {p} Nobody went.'),
      banter: M('[neutral] Backwards Day. My mom says that was the best one.') },
    { id: 'e1_bench_104', type: 'bench', x: 27, y: 13 },
    { id: 'e1_poster_food', type: 'poster', x: 30, y: 12, state: 'foodgroups',
      examine: v("[n] THE BASIC FOUR. Milk, Meat, Vegetable-Fruit, Bread-Cereal. Somebody drew fangs on the milk.", '[n] THE BASIC FOUR.') },
    { type: 'locker', x: 31, y: 13 },
    { type: 'locker', x: 32, y: 13 },
    { id: 'e1_locker_c', type: 'locker', x: 33, y: 13, state: 'dented',
      examine: [...LOCKER_RULE, { text: "[n] Somebody's combination lock is still on it. The dial stopped on 19." }] },
    { type: 'locker', x: 34, y: 13 },
    { id: 'e1_bench_105', type: 'bench', x: 38, y: 13 },
    { id: 'e1_poster_band', type: 'poster', x: 40, y: 12, state: 'band',
      examine: v(['[n] HALFTIME SPECTACULAR! THE HALLOWELL BAND — HOMECOMING — FRI. OCT. 19 — 7:30 P.M.',
        '[curious] Little drawings of shakos with plumes. Green and gold.'],
      "[sad] Seven-thirty. They never got to seven-thirty."),
      banter: M("[sad] She'd have been on that field. Grandma had a seat on the fifty.") },
    { id: 'e1_clock_e', type: 'clock_hall', x: 43, y: 12,
      examine: v('[n] Twenty to two. Same as the other one.', '[scared] Twenty to two.') },
    { type: 'locker', x: 44, y: 13 },
    { type: 'locker', x: 45, y: 13 },
    { id: 'e1_bench_coach', type: 'bench', x: 49, y: 13 },
    { id: 'e1_poster_hc', type: 'poster', x: 51, y: 12, state: 'homecoming79',
      examine: v(["[n] HOMECOMING '79 — CROWN YOUR QUEEN! VOTE BY THURSDAY.", "[curious] In the margin, in pen: CAROL ANN!!, and a heart."],
        "[sad] Carol Ann. She's on the board in the lobby. Third from the left.") },
    { id: 'e1_trophy', type: 'trophy_case', x: 52, y: 13,
      examine: v(["[n] Football, track, a wrestling plaque from '71. In front, a game ball: HOMECOMING '78 — COLLIERS 21, BLACK CREEK 14.",
        "[skeptical] My reflection's the only thing in there that moves."],
      ["[n] HOMECOMING '78.", "[scared] Just me in the glass. {p} Just me."]),
      banter: M("[thoughtful] Team picture. Number twenty-two, front row. Delvecchio. He's on the board too.") },
    { id: 'e1_bench_e', type: 'bench', x: 56, y: 13 },
    { id: 'e1_present', type: 'graffiti', x: 56, y: 12, state: 'present', cond: alone,
      examine: ['[n] PRESENT. Scratched into the paint, row under row, like with a fingernail.',
        "[scared] That wasn't there. I walked right past here with Marcus. That wasn't there."] },
    // corridor floor: a draught from the lobby, a ceiling leak, a party that left in a hurry
    { type: 'decal_leaves', x: 2, y: 16 },
    { type: 'decal_leaves', x: 3, y: 17 },
    { id: 'e1_cans', type: 'decal_papers', x: 10, y: 17,
      examine: v(["[n] Two Yuengling cans and a Herr's bag. The cans are still full.", "[skeptical] Nobody in Kettle Run leaves a full Yuengling."],
        '[n] Two full cans. Whoever brought them left fast.'),
      banter: M("[neutral] Somebody's older brother. There's always somebody's older brother.") },
    { type: 'cicada_shells', x: 17, y: 10 },
    { type: 'cicada_shells', x: 14, y: 11 },
    { type: 'decal_leaves', x: 18, y: 12 },
    { type: 'decal_tiles', x: 24, y: 15 },
    { type: 'decal_stain', x: 25, y: 16 },
    { type: 'decal_stain', x: 23, y: 17 },
    { type: 'decal_papers', x: 33, y: 16 },
    { type: 'decal_stain', x: 45, y: 17 },
    { type: 'decal_tiles', x: 47, y: 15 },
    { type: 'decal_glass', x: 57, y: 15 },
    { type: 'decal_glass', x: 58, y: 17 },
    { type: 'decal_papers', x: 54, y: 16 },

    // ======================================================== gym doors (east end wall, x 59)
    { id: 'e1_gym_doors', type: 'door_side', x: 59, y: 15, state: 'jammed', label: 'GYMNASIUM', lockedText: gymDoorsText,
      cond: (s) => !F(s).gym_open },
    { id: 'e1_gym_doors_2', type: 'door_side', x: 59, y: 16, state: 'jammed', label: 'GYMNASIUM', lockedText: gymDoorsText,
      cond: (s) => !F(s).gym_open },
    { id: 'e1_gym_doors_open', type: 'door_side', x: 59, y: 15, state: 'open', autoClose: false, label: 'GYMNASIUM',
      cond: (s) => !!F(s).gym_open },
    { id: 'e1_gym_doors_open_2', type: 'door_side', x: 59, y: 16, state: 'open', autoClose: false, label: 'GYMNASIUM',
      cond: (s) => !!F(s).gym_open },

    // ======================================================== east stairwell (x 14–18)
    { id: 'e1_gate', type: 'gate_accordion', x: 14, y: 9, state: 'locked', label: '2ND FLOOR', script: 'ch5.gate',
      lock: (s) => !(inv(s, 'keyring') && F(s).roll1_done), lockedText: gateText, unlockSfx: 'key_unlock',
      cond: (s) => !F(s).gate_2f_open },
    { id: 'e1_gate_open', type: 'gate_accordion', x: 14, y: 9, state: 'open', label: '2ND FLOOR', interact: false,
      cond: (s) => !!F(s).gate_2f_open },
    { id: 'e1_stair_bulb', type: 'cage_bulb', x: 16, y: 9, state: 'off',
      examine: v('[n] A caged bulb on the newel wall. Dead. The cage is bent like somebody grabbed it going by.', '[n] Dead bulb. Bent cage.') },
    { type: 'decal_stain', x: 17, y: 7 },
    { type: 'decal_leaves', x: 15, y: 9 },

    // ======================================================== boys' room 1F (no seats)
    { id: 'e1_rr_mirror', type: 'mirror', x: 2, y: 2, state: 'grimy',
      examine: [
        { cond: alone, text: "[scared] Just me. I keep checking. Just me." },
        { cond: (s) => !!F(s).adair_met, text: "[worried] Not this one. She's not in this one." },
        { text: '[n] Grimy. Somebody wrote WASH ME in the dirt, and later, under it, in a different hand: WHY.' },
      ] },
    { type: 'mirror', x: 3, y: 2, state: 'cracked' },
    { id: 'e1_rr_sink', type: 'sink', x: 2, y: 3,
      examine: v("[n] A cake of pink soap, gone hard as a rock. Somebody's class ring on the drain.", '[n] The ring is still on the drain.'),
      banter: M("[thoughtful] Class of '80. They never got the year printed on it.") },
    { type: 'sink', x: 3, y: 3 },
    { type: 'hand_dryer', x: 4, y: 2 },
    { id: 'e1_rr_graffiti', type: 'graffiti', x: 7, y: 2, state: 'hollowhell',
      examine: v(['[n] HOLLOW HELL, sprayed over the tile.', "[skeptical] Same guy as the west hall. He gets around. He doesn't get far."],
        '[n] HOLLOW HELL.') },
    { type: 'urinal', x: 7, y: 3 },
    { id: 'e1_urinal', type: 'urinal', x: 8, y: 3,
      examine: v("[n] A urinal. Somebody's taped a sign over it: OUT OF ORDER — W.P.", "[n] OUT OF ORDER — W.P.") },
    { type: 'stall', x: 10, y: 3 },
    { id: 'e1_rr_stall', type: 'stall', x: 11, y: 3,
      examine: v(["[n] Initials all over the stall door. FOR A GOOD TIME CALL, and a number, scratched out. Under it, small, in pencil: DON'T ANSWER WHEN IT CALLS.",
        "[skeptical] Bathroom wisdom. {p} I'll keep it in mind."],
      "[scared] DON'T ANSWER WHEN IT CALLS.") },
    { type: 'trash_can', x: 2, y: 9 },
    { type: 'decal_glass', x: 3, y: 5 },
    { type: 'decal_stain', x: 6, y: 6 },
    { type: 'decal_tiles', x: 9, y: 7 },
    { type: 'decal_papers', x: 5, y: 8 },

    // ======================================================== custodian's closet (keyring)
    { id: 'e1_closet_shelf', type: 'shelf_metal', x: 20, y: 3,
      examine: v(['[n] Floor wax. Sweeping compound. A box of light tubes, every one labeled in pencil: 1F E.',
        '[curious] Even the tubes have a place.'], '[n] Every tube labeled. 1F E.') },
    { type: 'valve_wheel', x: 22, y: 2 },
    { id: 'e1_closet_rounds', type: 'note_paper', x: 22, y: 5,
      examine: [{ cond: readLog, text: ['[n] ROUNDS — 1F EAST. Every night for years, initialed W.P.', "[sad] He walked this hall every night. He knew what was in the walls and he walked it anyway."] },
        { text: ['[n] A clipboard on a nail: ROUNDS — 1F EAST. A column of initials, W.P., W.P., W.P., all the way down.', '[curious] The last one is October 18, 1979.'] }] },
    { id: 'e1_closet_mop', type: 'mop_bucket', x: 22, y: 8,
      examine: '[n] A mop bucket. The water dried to a gray ring years ago.' },
    { type: 'cobweb', x: 20, y: 9 },

    // ======================================================== Room 104 (7th grade homeroom)
    { id: 'e1_chalk_104', type: 'chalkboard', x: 29, y: 2, state: 'text', text: 'MR. H SAYS HI', doc: 'room104_board',
      params: { text1979: 'NO HOMEWORK!' },
      examine: [
        { cond: alone, text: '[scared] MR. H SAYS HI.' },
        { cond: (s) => !!F(s).colonel_named, text: ['[n] MR. H SAYS HI, in fresh chalk.', "[scared] Mr. H. {p} Hallowell. He's saying hi."] },
        { text: ['[n] MR. H SAYS HI, in fresh chalk.', "[worried] Fresh. The dust's still on the tray."] },
      ],
      banter: M("[worried] Don't touch it. {p} Let's go.") },
    { type: 'flag_us', x: 27, y: 2 },
    { id: 'e1_104_clock', type: 'clock_wall', x: 32, y: 2,
      examine: v('[n] The classroom clock. Twenty to two.', '[scared] Twenty to two.') },
    { type: 'radiator', x: 25, y: 3 },
    { type: 'radiator', x: 34, y: 3 },
    { type: 'chair_teacher', x: 30, y: 3, dir: 'down' },
    { id: 'e1_104_desk', type: 'desk_teacher', x: 29, y: 4,
      examine: v(["[n] A seating chart under the blotter. Twenty-six seventh graders. One name's circled in pencil: BURDICK, A. — 'chess club, ask about tourn.'",
        '[curious] The teacher meant to ask him something.'], "[sad] BURDICK, A. She never got to ask.") },
    { id: 'e1_battery_104', type: 'pickup', x: 30, y: 4, item: 'battery',
      examine: '[relieved] A battery in the top drawer, next to a confiscated yo-yo.' },
    ...[25, 27, 29, 33, 35].map((x) => ({ type: 'desk_student', x, y: 6 })),
    { id: 'e1_104_chess', type: 'desk_student', x: 31, y: 6,
      examine: v(['[n] A travel chess set in the desk, magnetic, still mid-game. A.B. scratched into the lid.', '[curious] White to move.'],
        "[sad] White to move. Still white to move."),
      banter: M('[thoughtful] Burdick. Chess club. {p} He was thirteen.') },
    ...[28, 30, 32, 34].map((x) => ({ type: 'desk_student', x, y: 8 })),
    { type: 'bookshelf_low', x: 35, y: 9 },
    { type: 'trash_can', x: 24, y: 9 },
    { type: 'decal_leaves', x: 27, y: 4 },
    { type: 'decal_papers', x: 27, y: 7 },
    { type: 'decal_stain', x: 33, y: 4 },
    { type: 'decal_papers', x: 31, y: 9 },

    // ======================================================== Room 105 (typing)
    { id: 'e1_chalk_105', type: 'chalkboard', x: 41, y: 2, state: 'text', text: 'TIMED WRITING — EYES ON COPY',
      examine: v('[n] TIMED WRITING — 5 MIN. — EYES ON COPY. Under it: F J F J F J, like a heartbeat.', '[n] EYES ON COPY.') },
    { id: 'e1_105_clock', type: 'clock_wall', x: 44, y: 2,
      examine: v('[n] Twenty to two. In here too.', '[scared] Twenty to two.') },
    { type: 'radiator', x: 38, y: 3 },
    { type: 'radiator', x: 47, y: 3 },
    { type: 'chair_teacher', x: 45, y: 3, dir: 'down' },
    { id: 'e1_105_desk', type: 'desk_teacher', x: 44, y: 4,
      examine: v(["[n] Timed writings from Friday morning, already graded. Top score circled in red: P. SZALAY — 52 WPM — 1 ERROR.",
        '[curious] Fifty-two. I do maybe twenty. With errors.'], '[sad] P. SZALAY. 52 WPM. She never got it back.') },
    ...[[38, 6], [44, 6], [38, 8], [41, 8], [44, 8]].map(([x, y]) => ({ type: 'office_desk', x, y })),
    ...[38, 41, 44].flatMap((x) => [7, 9].map((y) => ({ type: 'office_chair', x, y, dir: 'up', sitDir: 'up' }))),
    { id: 'e1_105_typewriter', type: 'office_desk', x: 41, y: 6,
      examine: [
        { cond: alone, text: ["[n] The sheet in the Royal has one more word on it now. COUNTRY.", "[terrified] I didn't hear it. I'd have heard the bell."] },
        { text: ["[n] A Royal typewriter. A sheet still rolled in: NOW IS THE TIME FOR ALL GOOD MEN TO COME TO THE AID OF THEIR", "[curious] The bell's waiting at the end of the line."] },
      ],
      banter: M("[neutral] Don't touch the keys.") },
    { type: 'trash_can', x: 49, y: 9 },
    { type: 'decal_papers', x: 48, y: 6 },
    { type: 'decal_stain', x: 40, y: 4 },
    { type: 'decal_leaves', x: 39, y: 4 },

    // ======================================================== coaches' office
    { id: 'e1_coach_hooks', type: 'coat_hooks', x: 51, y: 2,
      examine: v(["[n] A green-and-gold jersey on a hook. 22. DELVECCHIO. Never washed, by the look of it.", "[sad] Game night. He was supposed to wear it tonight. {p} Their tonight."],
        '[n] 22. DELVECCHIO.'),
      banter: M('[thoughtful] Grandma says the whole town went to that game anyway. Sat in the dark. Nobody played.') },
    { id: 'e1_coach_board', type: 'bulletin_board', x: 56, y: 2, state: 'generic',
      examine: v(["[n] HOMECOMING — COLLIERS vs. BLACK CREEK — FRI. 10/19 — 7:30. Under it, chalk X's and O's, and: 'BEAT THEM BY 3 TDs OR RUN STAIRS.'",
        "[skeptical] Football. Even the threats are about stairs."], '[n] FRI. 10/19 — 7:30.') },
    { type: 'clock_wall', x: 58, y: 2 },
    { type: 'office_chair', x: 52, y: 4 },
    { id: 'e1_coach_desk', type: 'office_desk', x: 52, y: 5,
      examine: v(["[n] A whistle on a lanyard, a stopwatch stopped at 0:00, a coffee mug: WORLD'S OKAYEST COACH.", "[smirk] Somebody's kid had a sense of humor."],
        "[n] The stopwatch. 0:00.") },
    { type: 'filing_cabinet', x: 58, y: 4 },
    { id: 'e1_coach_balls', type: 'ball_cart', x: 57, y: 8,
      examine: '[n] Footballs, gone soft. One has signatures all over it in silver marker.' },
    { id: 'e1_coach_jacket', type: 'coat_rack', x: 51, y: 8,
      examine: v('[n] A Colliers windbreaker. COACH stitched on the chest. Car keys still in the pocket.', '[sad] He left his car keys. Where did he think he was going?') },
    { type: 'decal_papers', x: 54, y: 7 },
    { type: 'decal_stain', x: 56, y: 5 },

    // ======================================================== cafeteria
    { id: 'e1_banner', type: 'banner', x: 4, y: 20, state: 'homecoming79',
      examine: [
        { cond: alone, text: "[n] GO COLLIERS! HOMECOMING '79." },
        { text: ["[n] GO COLLIERS! HOMECOMING '79, painted on butcher paper, sagging in the middle.", "[sad] Somebody stayed late to paint this. The G's are perfect."] },
      ],
      banter: M("[soft_smile] Tabor's colors are maroon and white. Ugliest uniforms in the county. I'd still take them.") },
    { id: 'e1_caf_clock', type: 'clock_wall', x: 11, y: 20,
      examine: v('[n] Twenty to two. Lunch was over a long time ago.', '[scared] Twenty to two.') },
    { id: 'e1_exit_caf', type: 'exit_sign', x: 17, y: 20, state: 'on' },
    { id: 'e1_caf_menu', type: 'bulletin_board', x: 27, y: 20, state: 'generic',
      examine: v("[n] LUNCH — FRI. OCT. 19: FISH STICKS · TATER TOTS · BUTTERED CORN · MILK · HOMECOMING CAKE!", "[n] HOMECOMING CAKE!") },
    { id: 'e1_vending', type: 'vending_machine', x: 2, y: 21,
      examine: v(["[n] Tab, Fresca, Mr. Pibb. Thirty-five cents.", "[skeptical] A Tab is still in the slot. Nobody comes back for a Tab."], '[n] The Tab is still in the slot.') },
    { type: 'tray_rack', x: 19, y: 21 },
    { id: 'e1_serving', type: 'serving_line', x: 20, y: 21,
      examine: v(['[n] The steam table. One pan still has a skin of something on it, gone hard and gray.', '[disgusted] Corn. That was corn.'],
        '[n] The steam table. Still set for lunch.') },
    { id: 'e1_milk', type: 'milk_cooler', x: 24, y: 21,
      examine: v(['[n] Half-pints of milk, two rows deep.', '[curious] SELL BY OCT 24 1979. They were five days from going bad.'], '[n] SELL BY OCT 24 1979.') },
    ...[[3, 23], [8, 23], [19, 23], [24, 23], [3, 26], [19, 26], [24, 26]].map(([x, y]) => ({ type: 'caf_table', x, y })),
    { id: 'e1_caf_tray', type: 'caf_table', x: 8, y: 26,
      examine: v(['[n] A tray left at the end of the table. Fish sticks, a bite out of one. A milk carton, still folded open.',
        "[sad] Somebody got up to go to the assembly and figured they'd clean up after."], '[sad] One bite out of the fish stick.'),
      banter: M('[neutral] Fish sticks on Friday. Some things never change.') },
    { type: 'trash_can', x: 13, y: 28 },
    { type: 'trash_can', x: 29, y: 28 },
    { type: 'decal_papers', x: 14, y: 24 },
    { type: 'decal_tiles', x: 16, y: 27 },
    { type: 'decal_stain', x: 17, y: 27 },
    { type: 'decal_stain', x: 6, y: 22 },
    { type: 'decal_papers', x: 22, y: 25 },

    // ======================================================== kitchen
    { type: 'clock_wall', x: 37, y: 20 },
    { type: 'fire_extinguisher', x: 34, y: 20 },
    { id: 'e1_dumbwaiter', type: 'dumbwaiter', x: 38, y: 20, script: 'ch3.dumbwaiter',
      examine: '[n] A small hatch in the wall on a rope lift. It goes down.' },
    { type: 'hand_dryer', x: 40, y: 20 },
    { id: 'e1_pantry', type: 'shelf_pantry', x: 31, y: 21,
      examine: v("[n] Number ten cans, rusted together. CREAM CORN. PEACHES IN HEAVY SYRUP. A whole shelf of ketchup.", "[n] Cans. Rusted shut.") },
    { id: 'e1_sink', type: 'sink_big', x: 33, y: 21,
      examine: v('[n] A deep steel sink. A stack of trays soaking in a few inches of black water.', "[worried] The water's moving. There's no drip. It's just moving.") },
    { type: 'stove', x: 35, y: 21 },
    { id: 'e1_mixer', type: 'mixer', x: 39, y: 21, script: 'ch3.mixer',
      examine: '[n] A Hobart mixer taller than me. Dough still crusted in the bowl.' },
    { id: 'e1_stove', type: 'stove', x: 34, y: 24,
      examine: v(['[n] An eight-burner range. A sheet pan on top, and on it, under a towel—', '[sad] A cake. Green frosting. HOMECOMING \'79. Nobody ever cut it.'],
        "[sad] The cake. Nobody ever cut it.") },
    { type: 'stove', x: 36, y: 24 },
    { type: 'shelf_pantry', x: 31, y: 28 },
    { type: 'shelf_pantry', x: 33, y: 28 },
    { type: 'tray_rack', x: 36, y: 28 },
    { type: 'trash_can', x: 38, y: 28 },
    { type: 'mop_bucket', x: 47, y: 28 },
    { type: 'decal_stain', x: 40, y: 26 },
    { type: 'decal_papers', x: 44, y: 27 },
    { type: 'decal_stain', x: 32, y: 24 },
    // the walk-in: warm, and full of shells
    { id: 'e1_freezer', type: 'freezer_door', x: 46, y: 23, label: 'WALK-IN', opaque: true },
    { id: 'e1_freezer_shells', type: 'cicada_shells', x: 46, y: 21, script: 'ch3.freezer',
      examine: '[n] Cicada shells. The whole floor.' },
    { id: 'e1_freezer_shelf', type: 'shelf_metal', x: 47, y: 21,
      examine: '[n] Steel shelves. No food on them. Shells, on every rack, packed in rows like jars.' },
    { type: 'cicada_shells', x: 44, y: 21 },
    { type: 'cicada_shells', x: 45, y: 22 },
    { id: 'e1_freezer_shells_b', type: 'cicada_shells', x: 47, y: 22,
      examine: v(["[n] They crunch. There's no stepping around them. The walls are sweating.", '[worried] A freezer should not be warm.'],
        '[n] Shells. Warm air. The smell of pennies.') },
    { type: 'cicada_shells', x: 44, y: 22 },

    // ======================================================== kitchen office & dry stores
    { id: 'e1_cook_board', type: 'bulletin_board', x: 51, y: 20, state: 'generic',
      examine: '[n] Health inspection, 9/79: PASSED. A recipe card for Sloppy Joes, quantities for six hundred.' },
    { type: 'clock_wall', x: 54, y: 20 },
    { id: 'e1_cook_desk', type: 'office_desk', x: 52, y: 22,
      examine: v(["[n] An order slip: 40 LB FLOUR · 12 DOZ EGGS · GREEN FOOD COLORING (LOTS). Signed by somebody named Dot.",
        "[smirk] 'Lots' is a real quantity in a school kitchen."], '[n] GREEN FOOD COLORING (LOTS).') },
    { id: 'e1_battery_kitchen', type: 'pickup', x: 53, y: 22, item: 'battery',
      examine: '[relieved] A battery in the desk drawer, rolling around with a hairnet and a church bulletin.' },
    { type: 'office_chair', x: 52, y: 23, dir: 'up', sitDir: 'up' },
    { type: 'shelf_pantry', x: 56, y: 21 },
    { type: 'filing_cabinet', x: 58, y: 21 },
    { type: 'shelf_pantry', x: 56, y: 25 },
    { id: 'e1_cook_coat', type: 'coat_rack', x: 50, y: 27,
      examine: v('[n] A white apron, a hairnet, a pair of nurse shoes lined up underneath. DOT on the apron in laundry marker.', "[sad] Dot's shoes. Lined up for Monday.") },
    { type: 'decal_stain', x: 55, y: 27 },
    { type: 'decal_papers', x: 57, y: 23 },
  ],

  doors: {
    '8,12': { id: 'e1_door_rr', label: 'BOYS' },
    '21,12': { id: 'e1_door_closet', type: 'door_metal', state: 'locked', label: 'CUSTODIAN', lock: 'item:keyring',
      lockedText: [{ cond: (s) => (s.chapter || 0) >= 6, text: '[n] CUSTODIAN. Locked.' },
        { text: ['[n] CUSTODIAN. Locked. A card in the little window: SEE W. PRUSZYNSKI — BOILER RM.',
          { cond: withMarcus, text: "[marcus:neutral] Boiler room. That's the basement." }] }] },
    '26,12': { id: 'e1_door_104', label: '104' },
    '46,12': { id: 'e1_door_105', label: '105 — TYPING' },
    '55,12': { id: 'e1_door_coach', label: 'COACHES' },
    '37,5': { id: 'e1_cloak_door', label: 'CLOAKROOM' },
    '15,20': { id: 'e1_caf_doors', label: 'CAFETERIA' },
    '41,20': { id: 'e1_door_kitchen', label: 'KITCHEN — STAFF ONLY' },
    '30,25': { id: 'e1_loop_door', label: 'KITCHEN' },
    '49,26': { id: 'e1_door_cook', label: 'OFFICE' },
  },

  rooms: [
    { id: 'e1_hall', name: 'East Hall', rect: [1, 13, 59, 5], kind: 'hall' },
    { id: 'e1_boys_rr', name: "Boys' Room", rect: [2, 3, 10, 7], kind: 'restroom' },
    { id: 'e1_stairs', name: 'East Stairs', rect: [14, 3, 5, 10], kind: 'stair' },
    { id: 'e1_closet', name: 'Custodian', rect: [20, 3, 3, 7], kind: 'special' },
    { id: 'e1_room104', name: 'Room 104', rect: [24, 3, 13, 7], kind: 'classroom' },
    { id: 'e1_room105', name: 'Room 105 — Typing', rect: [38, 3, 12, 7], kind: 'classroom' },
    { id: 'e1_coaches', name: "Coaches' Office", rect: [51, 3, 8, 7], kind: 'office' },
    { id: 'e1_cafeteria', name: 'Cafeteria', rect: [2, 21, 28, 8], kind: 'cafeteria' },
    { id: 'e1_walkin', name: 'Walk-in', rect: [44, 21, 5, 2], kind: 'kitchen' },
    { id: 'e1_kitchen', name: 'Kitchen', rect: [31, 21, 18, 8], kind: 'kitchen' },
    { id: 'e1_kitchen_office', name: 'Kitchen Office', rect: [50, 21, 9, 8], kind: 'office' },
  ],

  anchors: {
    from_lobby: [3, 15, 'right'],        // first anchor (reachability root): in from the lobby's east doors
    from_basement: [17, 6, 'down'],      // on the down flight, coming up; first_period fires on the next steps
    from_east2: [15, 11, 'down'],        // the landing, just through the gate
    from_gym: [57, 16, 'left'],
    stair_gate: [14, 10, 'up'],
    stair_down: [17, 10, 'up'],
    dumbwaiter: [38, 21, 'up'],
    gym_doors: [57, 15, 'right'],
    caf_doors: [15, 17, 'down'],
    in_caf: [15, 22, 'down'],
    caf_bench: [14, 25, 'left'],         // beside the table Marcus takes in the guided period
    kitchen: [41, 22, 'down'],
    freezer: [46, 25, 'up'],
    mixer: [39, 22, 'up'],
    door_104: [26, 13, 'up'],
    in_104: [26, 8, 'up'],
    chalk_104: [30, 7, 'up'],
    kevin_west: [3, 14, 'right'],        // Ch6 walk back: the far (west) end of the hall
    kevin_east: [57, 14, 'left'],
  },

  exits: [
    { id: 'lobby', rect: [1, 15, 1, 2], to: 'lobby', anchor: 'from_east1' },
    { id: 'gym', rect: [59, 15, 1, 2], to: 'gym', anchor: 'from_east1' },
    { id: 'up', rect: [14, 3, 2, 1], to: 'east2', anchor: 'from_east1' },
    { id: 'down', rect: [17, 3, 2, 1], to: 'basement', anchor: 'from_east1' },
  ],

  triggers: [
    // Ch3: first step into the east hall (DESIGN §6 III.1)
    { id: 'ch3_east', rect: [5, 13, 1, 5], script: 'ch3.east_hall', cond: (s) => s.chapter === 3 },
    // Ch3: coming up from the basement with the keys — the guided period (Marcus: "Cafeteria. Go.")
    { id: 'first_period', rect: [17, 8, 2, 2], script: 'ch3.first_period', once: false,
      cond: (s) => !!F(s).ch3_keyring && !F(s).ch3_period_done },
    // Ch6: at the gym doors behind Marcus — checkpoint 'gym doors' (DESIGN §9.3); he goes in first (narrative-4)
    { id: 'ch6_gym_doors', rect: [55, 13, 1, 5], script: 'ch6.gym_doors', once: false,
      cond: (s) => s.chapter === 6 && !!F(s).ch6_breather_done && !F(s).ch6_gym_lights && !F(s).ch6_marcus_taken },
  ],

  lights: [
    // the landing windows: a cold wash of moonlight down both flights — the brightest thing in the hall
    { type: 'spot', x: 16, y: 6, color: '#7f9cc4', intensity: 0.5, radius: 3.2, disc: 2.2, shadows: false },
    // hall fluorescents (period only)
    { type: 'fluor', x: 4, y: 15, group: 'period' },
    { type: 'fluor', x: 11, y: 15, group: 'period' },
    { type: 'fluor', x: 16, y: 11, group: 'period' },
    { type: 'fluor', x: 22, y: 15, group: 'period' },
    { type: 'fluor', x: 30, y: 15, group: 'period' },
    { type: 'fluor', x: 38, y: 15, group: 'period' },
    { type: 'fluor', x: 46, y: 15, group: 'period', flicker: true },
    { type: 'fluor', x: 54, y: 15, group: 'period' },
    // rooms (period only)
    { type: 'fluor', x: 6, y: 6, group: 'period', flicker: true },
    { type: 'fluor', x: 27, y: 6, group: 'period' },
    { type: 'fluor', x: 33, y: 6, group: 'period' },
    { type: 'fluor', x: 41, y: 6, group: 'period' },
    { type: 'fluor', x: 46, y: 6, group: 'period' },
    { type: 'fluor', x: 55, y: 6, group: 'period' },
    { type: 'fluor', x: 6, y: 25, group: 'period' },
    { type: 'fluor', x: 13, y: 25, group: 'period' },
    { type: 'fluor', x: 20, y: 25, group: 'period' },
    { type: 'fluor', x: 26, y: 25, group: 'period', flicker: true },
    { type: 'fluor', x: 36, y: 23, group: 'period' },
    { type: 'fluor', x: 43, y: 26, group: 'period' },
    { type: 'fluor', x: 54, y: 25, group: 'period' },
  ],

  patrol: {
    nodes: {
      w: [3, 15], rr: [8, 15], st: [16, 15], land: [16, 11], cl: [21, 15], d104: [26, 15], mid: [33, 15],
      k: [41, 15], d105: [46, 15], co: [55, 15], e: [57, 15],
    },
    edges: [['w', 'rr'], ['rr', 'st'], ['st', 'land'], ['st', 'cl'], ['cl', 'd104'], ['d104', 'mid'], ['mid', 'k'],
      ['k', 'd105'], ['d105', 'co'], ['co', 'e']],
    // wall seams: RR|stair, closet|104, 104|105, 105|coaches (north); cafeteria|kitchen (south)
    folds: [[12, 12], [23, 12], [37, 12], [50, 12], [30, 18]],
    peeks: [
      { room: 'e1_cafeteria', door: [15, 19], look: [15, 23] },
      { room: 'e1_boys_rr', door: [8, 11], look: [8, 6] },
      { room: 'e1_room104', door: [26, 11], look: [26, 7] },
      { room: 'e1_room105', door: [46, 11], look: [46, 7] },
      { room: 'e1_kitchen', door: [41, 19], look: [41, 23] },
      { room: 'e1_coaches', door: [55, 11], look: [55, 6] },
    ],
    // Safety Patrol sentinel spots (HW.patrol.enable picks one off screen at load): the far ends of the hall
    kevin: [[3, 14, 'right'], [57, 14, 'left']],
  },

  past: [
    { id: 'cafeteria_1979', rect: [2, 21, 28, 8],
      hint: "Lunch. Fish sticks. Somebody's saving a seat.",
      objects: [{ type: 'clock_wall', x: 11, y: 20, params: { time: 12 + 10 / 60 } }],
      hide: ['e1_caf_clock'],
      figures: [
        { sprite: 'figure79', x: 21, y: 20, dir: 'down', anim: 'idle_down' },   // lunch ladies behind the line
        { sprite: 'figure79', x: 23, y: 20, dir: 'down', anim: 'idle_down' },
        ...[[4, 25], [6, 25], [9, 22], [10, 25], [20, 22], [22, 25], [25, 25], [26, 22], [4, 28]]
          .map(([x, y]) => ({ sprite: 'figure79', x, y, dir: 'up', anim: 'sit_up' })),
        { sprite: 'figure79', x: 16, y: 23, dir: 'right', anim: 'idle_right' },  // in line, tray in hand
      ],
      text: [{ x: 27, y: 20, text: 'FISH STICKS', style: 'chalk' }] },
    { id: 'kitchen_1979', rect: [31, 21, 18, 8],
      hint: 'Somebody frosting a sheet cake. Green.',
      figures: [
        { sprite: 'figure79', x: 35, y: 25, dir: 'up', anim: 'idle_up' },      // Dot, at the cake
        { sprite: 'figure79', x: 32, y: 22, dir: 'up', anim: 'idle_up' },      // at the sink
      ] },
    { id: 'room104_1979', rect: [24, 3, 13, 7],
      hint: 'Seventh grade. Friday. No homework.',
      figures: [
        ...[[25, 6], [27, 6], [29, 6], [31, 6], [33, 6], [28, 8], [30, 8], [32, 8], [34, 8]]
          .map(([x, y]) => ({ sprite: 'figure79', x, y, dir: 'up', anim: 'sit_up' })),
        { sprite: 'figure79', x: 30, y: 3, dir: 'down', anim: 'sit_down' },   // the teacher
      ] },
  ],
};
