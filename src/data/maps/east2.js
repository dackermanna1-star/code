// EAST HALL — SECOND FLOOR (east2) · 56×30 · offset (96, 22) · 2F · CONTENT §2.8 · maps-D
//
// Ch5 "Upstairs": Tess and Marcus come up the east stairs (east1's accordion gate) into a floor nobody
// has walked since 1979. The gate kept the trespassers out, so up here there is NO graffiti, no beer
// cans, no KR '91 — only decay and the things the Nine's classmates left on Friday, Oct 19, 1979.
// One corridor (local rows 13–17 = world 35–39) from the long-hall mouth (west, x 1) to a chained
// fire-escape door in the east wall (x 55).
//
//   NORTH (exterior wall, windows), west → east:
//     boys' RR 2F (x 2–6; stacked over the 1F boys' room — the plumbing runs up) · STAIR TOP (x 8–12 =
//     world 104–108, the east stair core; treads down at x 9–11 rows 3–5 → east1/from_east2; a tall
//     landing window; open to the hall between brick piers) · 205 English (x 14–26: Our Town, a 1979
//     seating chart, Danny's desk in Patty Szalay's seat, Tess's desk two over) · cloakroom door
//     205↔206 (x 27, row 5) · 206 biology (x 28–40: Mr. Lutz's BROOD II board, the specimen shelf with
//     a jar already labelled 1996, the wooden HALL PASS — RM 206 on its hook + the Ch5 battery) ·
//     207 computer lab (x 42–54: six TRS-80s that wake only in periods; e2_terminal; the printer).
//   SOUTH, west → east:
//     storage closet (x 2–7; optional battery) · teachers' workroom (x 9–20; the ditto machine, the
//     Founder's Day program, the chaperone sign-up) · 208 typing (x 22–35; a timed writing that
//     never finished) · guidance (x 37–45; the Navy pamphlet, the PERMANENT RECORD drawer) · the
//     wing's south facade steps back east of x 46 (plain wall: a rest for the eye).
//   WEST END (x 1): → longhall/from_east2, gated on ch5_danny_found (refuse: ch5.longhall_refuse).
//     A cold spill of gallery moonlight at the mouth pulls the eye west.
//   EAST END (x 55): FIRE ESCAPE door_side, chained from outside (R6: nobody leaves early).
//
// Beats: trigger room205_enter → ch5.danny (cond chapter ≥ 5 && !ch5_danny_found) · e2_hall_pass
// (script ch5.hall_pass gives item hall_pass) · e2_terminal (default sys.terminal) · free periods
// (patrol graph, folds, peeks for 205/206/207/RR + the two south classrooms; Kevin spots at both ends).
// Variants (CONTENT §4): e2_chalk_205 (+ second panel e2_chalk_205_b) = I WILL NOT LEAVE after
// ch5_danny_found; with bond_danny the second panel is e2_chalk_205_lea (…I WILL NOT LEA); before that
// e2_chalk_205_lesson + e2_205_board2 (Our Town, Emily's line). Danny's pages around
// e2_desk_danny after ch5_danny_found. Danny himself is an entity the Ch5 scripts seat at
// `danny_desk` (aisle cell south of e2_desk_danny; desk_205_tess likewise for e2_desk_205_tess).
//
//   x →  0         1         2         3         4         5
//        01234567890123456789012345678901234567890123456789012345

const F = (s) => s.flags || {};
const from = (n) => (s) => (s.chapter || 0) >= n;
const withMarcus = (s) => (s.party || []).includes('marcus');
const alone = (s) => !withMarcus(s);
const found = (s) => !!F(s).ch5_danny_found;

// Tess by stage: Ch5 with Marcus (tense, the odd dry line) → alone after the long hall → Ch6+ literal.
const by = (c5, solo, c6) => {
  const out = [];
  if (c6) out.push({ cond: from(6), text: c6 });
  if (solo) out.push({ cond: alone, text: solo });
  out.push({ text: c5 });
  return out;
};
// Marcus answers, briefly, while he's with her.
const M = (text) => ({ marcus: [{ cond: withMarcus, text }] });

// "No. Seats." — hall lockers are never hide spots (DESIGN §4); taught on e2_locker_a, terse from Ch6.
const LOCKER_RULE = { cond: from(6), text: '[scared] No. Seats.' };

const DANNY_DONE = '[n] A desk. Pages of it, both sides, in pencil: I WILL NOT LEAVE.';

export default {
  id: 'east2',
  name: 'East Hall — Second Floor',
  floor: '2F',
  offset: [96, 22],
  ambience: 'hall',
  music: null,
  dark: 0.94,
  ambient: '#0b1020',
  // narrative-3: Danny in session at his desk (Ch5–6), his pencil; resumes the 205 period after a reload.
  onEnter: 'ch5.enter_east2',
  tiles: [
    ' TTTTTTBBBBBBB##########################################', //  0  north exterior wall (top)
    ' TTTWTTBBBUBBBWW#########WW#WW#########WW#WW#########WW#', //  1  face_high · windows
    ' TTTWTTBBBUBBBWW#########WW#WW#########WW#WW#########WW#', //  2  face_low (boards, posters)
    ' T_____B|vvv|B.............#.............#.............#', //  3  RR | stair top | 205 | 206 | 207
    ' T_____B|vvv|B.............#.............#.............#', //  4  treads down → east1
    ' T_____B|vvv|B.............D.............#.............#', //  5  cloakroom door 205↔206
    ' T_____BsssssB.............#.............#.............#', //  6  landing
    ' T_____BsssssB.............#.............#.............#', //  7
    ' T_____BsssssB.............#.............#.............#', //  8
    ' T_____BsssssB.............#.............#.............#', //  9
    ' ###D##BBsssBB##D###############D###############D#######', // 10  hall north wall: top
    ' ###D##BBsssBB##D###############D###############D#######', // 11  face_high
    ' ###D##BBsssBB##D###############D###############D#######', // 12  face_low (hall props)
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#', // 13  corridor (world 35)
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#', // 14
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,D', // 15  fire escape (door_side, x 55)
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#', // 16
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#', // 17  (world 39)
    ' ####D########D#############D############D##############', // 18  south rooms' north wall: top
    ' ####D########D#############D############D##############', // 19  face_high
    ' ####D########D#############D############D##############', // 20  face_low
    ' #::::::#""""""""""""#..............#"""""""""#         ', // 21  storage | workroom | 208 | guidance
    ' #::::::#""""""""""""#..............#"""""""""#         ', // 22
    ' #::::::#""""""""""""#..............#"""""""""#         ', // 23
    ' #::::::#""""""""""""#..............#"""""""""#         ', // 24
    ' #::::::#""""""""""""#..............#"""""""""#         ', // 25
    ' #::::::#""""""""""""#..............#"""""""""#         ', // 26
    ' #::::::#""""""""""""#..............#"""""""""#         ', // 27
    ' #::::::#""""""""""""#..............#"""""""""#         ', // 28
    ' ##############################################         ', // 29
  ],

  // Lockers (never hide spots), 205's desks, 208's typing chairs.
  propLegend: { L: 'locker', d: 'desk_student' },
  propLayer: [
    '........................................................', //  0
    '........................................................', //  1
    '........................................................', //  2
    '........................................................', //  3
    '........................................................', //  4
    '...............d.d.d...d.d..............................', //  5  205 front row (x 21 is named)
    '........................................................', //  6
    '...............d.d...d...d..............................', //  7  205 back row (x 19 Danny, x 23 Tess)
    '........................................................', //  8
    '........................................................', //  9
    '........................................................', // 10
    '........................................................', // 11
    '........................................................', // 12
    '..................L.LL...............L.L.....LLL........', // 13  hall lockers (19, 34, 36 are objects)
    '........................................................', // 14
    '........................................................', // 15
    '........................................................', // 16
    '........................................................', // 17
    '........................................................', // 18
    '........................................................', // 19
    '........................................................', // 20
    '........................................................', // 21
    '........................................................', // 22
    '........................................................', // 23
    '........................................................', // 24
    '........................................................', // 25
    '........................................................', // 26
    '........................................................', // 27
    '........................................................', // 28
    '........................................................', // 29
  ],

  objects: [
    // ======================================================== corridor — north wall face (row 12) & floor
    { id: 'e2_bench_w', type: 'bench', x: 2, y: 13 },
    { type: 'cobweb', x: 1, y: 13 },
    { id: 'e2_fountain', type: 'water_fountain', x: 6, y: 13,
      examine: by('[n] I press it. The pipes knock all the way down to the basement.', '[n] The pipes knock. Something below knocks back.', '[n] Dry.'),
      banter: M("[worried] Don't. Everything hears that.") },
    { id: 'e2_exit_stair', type: 'exit_sign', x: 8, y: 12, state: 'on',
      examine: by(['[n] EXIT, with an arrow down the stairs.', "[skeptical] It wants us back downstairs. Everything here has an opinion."],
        '[n] EXIT. Down.', '[n] EXIT. Down. Down never helped.'),
      banter: M('[neutral] Battery backup. Still going. Like the clocks.') },
    { id: 'e2_patrol_poster', type: 'poster', x: 12, y: 12, state: 'patrol',
      examine: by(["[n] WALK — DON'T RUN. YOUR SAFETY PATROL.", "[worried] Upstairs too. They had posts up here too."],
        "[n] WALK — DON'T RUN.", "[scared] The belt. The same belt."),
      banter: M('[thoughtful] They put these on every floor. Like the kids needed reminding.') },
    { id: 'e2_bench_205', type: 'bench', x: 13, y: 13 },
    { id: 'e2_ourtown_poster', type: 'poster', x: 17, y: 12, state: 'ourtown',
      examine: by(["[n] OUR TOWN — a play by Thornton Wilder. Presented by the 9th grade. NOVEMBER 16 & 17, 1979.",
        '[sad] They had a month of rehearsals left.'], "[n] OUR TOWN. November 16 & 17, 1979.", "[sad] They never did the play."),
      banter: M("[soft_smile] We did it at Tabor. I was the milkman. Two lines.") },
    { id: 'e2_locker_a', type: 'locker', x: 19, y: 13,
      examine: [LOCKER_RULE, { cond: alone, text: ['[n] A gym bag still in it. Sneakers tied together by the laces.', '[worried] Not in a locker. If the bell goes, a seat.'] },
        { text: ["[n] This one's open a crack. A gym bag, sneakers tied together by the laces.", "[sad] Somebody had practice after the assembly.",
          '[worried] And no — not in a locker. If the bell goes, a seat.'] }],
      banter: M('[neutral] Leave it shut.') },
    { id: 'e2_clock_w', type: 'clock_hall', x: 22, y: 12,
      examine: by(['[n] Twenty to two. Up here too.', "[worried] Every clock in the building agrees. Nothing in this building should agree."],
        '[n] Twenty to two.', '[scared] Twenty to two. Quarter to is the bell.'),
      banter: M('[thoughtful] Five minutes. Every clock. Five minutes to the bell.') },
    { id: 'e2_dance_board', type: 'bulletin_board', x: 23, y: 12, state: 'generic',
      examine: by(["[n] HOMECOMING DANCE — SAT. OCT. 20 — GYM — $2. A sign-up sheet for the decorating committee. Nine names in different pens.",
        '[sad] Saturday. They had a dance the next night.'], '[n] HOMECOMING DANCE — SAT. OCT. 20.', '[sad] They had a dance the next night.'),
      banter: M("[sad] Saturday. {p} Grandma made her a dress for it.") },
    { id: 'e2_bench_mid', type: 'bench', x: 25, y: 13 },
    { id: 'e2_banner_hc', type: 'banner', x: 28, y: 12, state: 'homecoming79',
      examine: by(["[n] HOMECOMING '79, painted on butcher paper. Somebody's hand-print in green at the corner. Small hand.",
        "[worried] No graffiti up here. Not one tag. Nobody's been up here since." ], "[n] HOMECOMING '79.",
        "[n] HOMECOMING '79. The paint never finished drying."),
      banter: M("[thoughtful] The gate kept everybody out. Up here it's still that Friday.") },
    { id: 'e2_locker_b', type: 'locker', x: 34, y: 13, state: 'dented',
      examine: [LOCKER_RULE, { text: ['[n] A locker, dented at shoulder height. A combination taped inside the vent: 12-34-9.', "[skeptical] Security."] }] },
    { id: 'e2_locker_c', type: 'locker', x: 36, y: 13, state: 'open',
      examine: [LOCKER_RULE, { text: ['[n] Open and empty except for a mirror on the door. My face, gray in the flashlight.', "[worried] For a second it was somebody else's gray face. {p} No. Mine."] }] },
    { id: 'e2_extinguisher', type: 'fire_extinguisher', x: 37, y: 12,
      examine: by('[n] INSPECTED 6/79. Same as downstairs.', '[n] INSPECTED 6/79.') },
    { id: 'e2_bench_206', type: 'bench', x: 38, y: 13 },
    { id: 'e2_band_poster', type: 'poster', x: 42, y: 12, state: 'band',
      examine: by(["[n] COLLIERS MARCHING BAND — FOUNDER'S DAY ASSEMBLY — 1:45. A photo of the band on the front steps, too faded for faces.",
        '[worried] Marcus is looking for her in it. I can tell.'], "[n] COLLIERS MARCHING BAND.", "[sad] I looked for her in it. You can't see faces."),
      banter: M("[sad] Second row. Clarinets. {p} ...You can't really see.") },
    { id: 'e2_clock_e', type: 'clock_hall', x: 44, y: 12,
      examine: by('[n] Twenty to two. Ticking.', '[n] Twenty to two.', '[scared] Still twenty to two. I keep checking like it will help.') },
    { id: 'e2_computer_poster', type: 'poster', x: 49, y: 12, state: 'computer',
      examine: by("[n] COMPUTERS: THE FUTURE IS NOW! A cartoon robot with a mortarboard.", "[n] THE FUTURE IS NOW.",
        "[n] THE FUTURE IS NOW. {p} It isn't. It's nineteen seventy-nine in there."),
      banter: M("[neutral] Future's got a lot of dust on it.") },
    { id: 'e2_bench_207', type: 'bench', x: 50, y: 13 },
    { id: 'e2_banner_fd', type: 'banner', x: 50, y: 12, state: 'founders',
      examine: by(["[n] FOUNDER'S DAY. Navy and gold and a red border, like his sash.", "[worried] It's the only thing up here that doesn't look old."],
        "[n] FOUNDER'S DAY.", "[n] FOUNDER'S DAY. His colors."),
      banter: M("[worried] Same colors as the picture downstairs.") },
    { id: 'e2_exit_fire', type: 'exit_sign', x: 54, y: 12, state: 'flicker',
      examine: by(['[n] EXIT — FIRE ESCAPE. The sign is the only thing working on it.'], '[n] EXIT.', "[n] EXIT. It doesn't mean it.") },
    // the fire escape: chained outside — R6, nobody leaves before dismissal
    { id: 'e2_fire_door', type: 'door_side', x: 55, y: 15, state: 'locked', label: 'FIRE ESCAPE',
      lock: () => true,
      lockedText: [
        { cond: from(6), text: ["[n] FIRE ESCAPE. The bar goes down. The door doesn't move.", '[scared] Not before dismissal. I know. I know.'] },
        { cond: alone, text: ["[n] I hit the bar. It goes down. The door doesn't.", "[worried] Chained on the outside. Who chains a fire escape from the outside."] },
        { text: ["[n] FIRE ESCAPE. I hit the bar. The door gives a quarter inch and a chain rattles on the other side.",
          "[marcus:worried] Chained from outside. {p} We're not leaving without them anyway, Tess."] },
      ] },

    // corridor floor: no leaves (the windows are behind closed doors) — plaster, water, paper.
    { type: 'decal_stain', x: 3, y: 16 },
    { type: 'decal_tiles', x: 7, y: 15 },
    { type: 'decal_papers', x: 15, y: 16 },
    { type: 'decal_stain', x: 20, y: 17 },
    { type: 'decal_tiles', x: 27, y: 14 },
    { type: 'decal_stain', x: 31, y: 16 },
    { type: 'decal_papers', x: 33, y: 17 },
    { type: 'decal_glass', x: 47, y: 14 },
    { type: 'decal_tiles', x: 41, y: 16 },
    { type: 'decal_stain', x: 52, y: 15 },
    { type: 'trash_can', x: 21, y: 17, examine: '[n] A wastebasket. A carton of milk in it, dated OCT 19.' },
    { id: 'e2_dropped_dittos', type: 'note_paper', x: 12, y: 16,
      examine: by(["[n] A dropped stack of purple dittos. FOUNDER'S DAY ASSEMBLY — ORDER OF EXERCISES. The ink still smells like a test.",
        '[n] 1. Alma Mater. 2. Invocation. 3. Presentation of the Roll. {p} [worried] Presentation of the roll.'],
      ["[n] FOUNDER'S DAY ASSEMBLY — ORDER OF EXERCISES.", '[n] 3. Presentation of the Roll.'],
      "[n] 3. Presentation of the Roll. {p} [scared] Like it's a gift."),
      banter: M('[thoughtful] Grandma says they sang the alma mater twice that day. Once at the start. Once on the radio after.') },

    // ======================================================== boys' restroom 2F (no seats)
    { type: 'hand_dryer', x: 2, y: 2 },
    { id: 'e2_rr_mirror', type: 'mirror', x: 5, y: 2, state: 'grimy',
      examine: [
        { cond: (s) => !!F(s).adair_met, text: "[worried] Just me. I checked twice." },
        { text: ['[n] Grimy. My flashlight makes a white star in it.', "[worried] I don't want to look in mirrors up here. I don't know why I already know that."] },
      ],
      banter: M("[neutral] I'll watch the door.") },
    { type: 'mirror', x: 6, y: 2, state: 'cracked' },
    { type: 'sink', x: 5, y: 3 },
    { id: 'e2_rr_sink', type: 'sink', x: 6, y: 3,
      examine: by("[n] A bar of Lava soap worn into a canoe. Dry as a bone.", '[n] Lava soap. Dry.') },
    { type: 'urinal', x: 2, y: 3 },
    { type: 'urinal', x: 3, y: 3 },
    { type: 'stall', x: 2, y: 6 },
    { id: 'e2_rr_stall', type: 'stall', x: 3, y: 6,
      examine: by(["[n] Carved into the stall door: K.H. + M.Y. in a lopsided heart.", "[sad] Kevin Hoyt. Michelle Yancey. The Safety Patrol kids. Twelve and eleven."],
        '[n] K.H. + M.Y.', "[sad] K.H. + M.Y. He's still wearing the belt. She's still eleven."),
      banter: M("[sad] Hoyt and Yancey. They're on the memorial. Both of them.") },
    { type: 'decal_stain', x: 4, y: 8 },
    { type: 'decal_tiles', x: 2, y: 9 },
    { type: 'trash_can', x: 6, y: 9 },

    // ======================================================== stair top (east stair core, world x 104–108)
    { id: 'e2_stair_window_sill', type: 'cicada_shells', x: 10, y: 6,
      examine: by(["[n] Cicada shells on the landing, under the window. They got in somehow.", '[worried] All of them facing the stairs. Down.'],
        '[n] Shells. Facing down the stairs.', '[n] Empty shells. The things left behind.'),
      banter: M("[thoughtful] Seventeen years in the ground, Leah said. Then they climb.") },
    { id: 'e2_stair_bulb', type: 'cage_bulb', x: 9, y: 2, state: 'off',
      examine: '[n] A caged bulb. Dead.' },
    { type: 'cobweb', x: 12, y: 6 },
    { type: 'decal_leaves', x: 9, y: 8 },
    { type: 'decal_stain', x: 11, y: 7 },

    // ======================================================== 205 English (Our Town) — Danny
    { type: 'radiator', x: 14, y: 3 },
    { type: 'radiator', x: 25, y: 3 },
    { id: 'e2_ourtown_board', type: 'bulletin_board', x: 16, y: 2, state: 'ourtown',
      examine: by(["[n] OUR TOWN cast list. EMILY WEBB — C. MRAZEK. GEORGE GIBBS — T. DELVECCHIO. STAGE MANAGER — P. SZALAY.",
        "[worried] Three of the Nine, on one sheet of paper."], '[n] OUR TOWN cast list. Three of the Nine.', "[sad] Emily, George and the Stage Manager. Nobody understudied."),
      banter: M("[sad] Mrazek. Delvecchio. Szalay. {p} They're all on Grandma's list.") },
    // two board panels: the 1979 lesson + Emily's line until Danny is found; then his line across both
    // (CONTENT §4). Panel lines are hard-broken so the last word is always on the slate: with the bond
    // the writing stops at LEA.
    { id: 'e2_chalk_205_lesson', type: 'chalkboard', x: 18, y: 2, state: 'text', cond: (s) => !found(s),
      text: 'OUR TOWN — ACT III — READ FOR MON.', params: { text1979: 'OUR TOWN — ACT III — READ FOR MON.' },
      examine: "[n] OUR TOWN — ACT III — READ FOR MON. Monday never came for Act Three." },
    { id: 'e2_chalk_205', type: 'chalkboard', x: 18, y: 2, state: 'text', cond: found,
      text: 'I WILL NOT\nLEAVE I\nWILL NOT', params: { text1979: 'OUR TOWN — ACT III — READ FOR MON.' },
      examine: [
        { cond: (s) => !!F(s).bond_danny, text: by(["[n] I WILL NOT LEAVE, across both boards. Then it stops: I WILL NOT LEA—", '[determined] Watch me, Danny.'],
          '[n] I WILL NOT LEA—', "[determined] I WILL NOT LEA. He stopped. He's waiting.") },
        { text: by(["[n] I WILL NOT LEAVE, edge to edge, both boards. Fresh chalk.", "[angry] He can't spell 'present.' He spelled every one of these right."],
          '[n] I WILL NOT LEAVE.', '[n] I WILL NOT LEAVE. Over and over. Over and over.') },
      ] },
    { id: 'e2_205_board2', type: 'chalkboard', x: 21, y: 2, state: 'text', cond: (s) => !found(s),
      text: 'EMILY: "GOOD-BY, WORLD."', params: { text1979: 'EMILY: "GOOD-BY, WORLD."' },
      examine: ['[n] A line copied out for a quiz, in teacher handwriting. Emily, in Act Three, saying goodbye to everything.',
        "[sad] I always thought that part was corny."],
      banter: M("[thoughtful] She goes back for one day. Then she doesn't want to.") },
    { id: 'e2_chalk_205_b', type: 'chalkboard', x: 21, y: 2, state: 'text', cond: (s) => found(s) && !F(s).bond_danny,
      text: 'LEAVE\nI WILL NOT\nLEAVE', params: { text1979: 'EMILY: "GOOD-BY, WORLD."' },
      examine: by(["[n] He wrote right over Emily. Good-by, world, under I WILL NOT LEAVE.", "[sad] I'm taking back corny."],
        '[n] I WILL NOT LEAVE, over Emily.', '[n] Over Emily. Over everything.') },
    { id: 'e2_chalk_205_lea', type: 'chalkboard', x: 21, y: 2, state: 'text', cond: (s) => found(s) && !!F(s).bond_danny,
      text: 'LEAVE\nI WILL NOT\nLEA', params: { text1979: 'EMILY: "GOOD-BY, WORLD."' },
      examine: by(["[n] I WILL NOT LEA. The chalk is still on the tray, set down square, like he meant to come back to it.", '[determined] He will.'],
        '[n] I WILL NOT LEA.', "[determined] LEA. He stopped there. For me.") },
    { id: 'e2_205_clock', type: 'clock_wall', x: 24, y: 2 },
    { id: 'e2_205_chair', type: 'chair_teacher', x: 20, y: 3, dir: 'down' },
    { id: 'e2_205_desk', type: 'desk_teacher', x: 20, y: 4,
      examine: by(["[n] A seating chart under the blotter. Back row, third seat: SZALAY, P.", "[worried] That's where Danny's sitting. In Patty Szalay's seat."],
        '[n] The seating chart. SZALAY, P.', "[n] SZALAY, P. Danny's in her seat. He's keeping it warm."),
      banter: M("[worried] It put him in somebody's seat. Like he's filling in.") },
    { id: 'e2_205_books', type: 'bookshelf_low', x: 23, y: 4,
      examine: by('[n] A class set of *Our Town*, paperbacks, every spine uncracked past page ninety.', '[n] *Our Town*. Thirty copies.'),
      banter: M('[neutral] Nobody ever reads Act Three.') },
    // back row: Danny in the third seat (Patty Szalay's, per the 1979 chart), Tess two desks east of him
    { id: 'e2_desk_205_tess', type: 'desk_student', x: 23, y: 7 },
    { id: 'e2_desk_205_front', type: 'desk_student', x: 21, y: 5,
      examine: "[n] Carved in the desktop: WILDER IS A DRAG. Below it, in a different hand: SO ARE YOU." },
    { id: 'e2_desk_danny', type: 'desk_student', x: 19, y: 7, noSit: true,
      examine: [
        { cond: (s) => found(s) && !!F(s).bond_danny, text: ["[n] Pages and pages. The last one stops mid-word.", '[determined] I WILL NOT LEA. {p} Hang on, Danny.'] },
        { cond: found, text: DANNY_DONE },
        { text: "[n] Initials carved in the top: P.S. A tiny camera doodled next to them." },
      ] },
    { id: 'e2_danny_pages', type: 'decal_papers', x: 20, y: 8, cond: found },
    { id: 'e2_danny_pages_b', type: 'decal_papers', x: 18, y: 8, cond: found },
    { id: 'e2_danny_pencil', type: 'note_paper', x: 20, y: 7, cond: found,
      examine: by(["[n] A loose page. I WILL NOT LEAVE, forty times. His handwriting. The Ks lean backward like they're jogging.",
        "[sad] He jogs backward. That's his whole thing."], '[n] I WILL NOT LEAVE, forty times.', "[sad] His Ks lean backward. Like they're jogging.") },
    { type: 'trash_can', x: 14, y: 9 },
    { type: 'decal_leaves', x: 15, y: 4 },
    { type: 'decal_leaves', x: 26, y: 4 },
    { type: 'cicada_shells', x: 25, y: 4 },
    { type: 'decal_stain', x: 24, y: 8 },
    { type: 'decal_papers', x: 16, y: 6 },

    // ======================================================== 206 biology (Mr. Lutz) — the hall pass
    { id: 'e2_specimen_shelf', type: 'specimen_shelf', x: 28, y: 3,
      examine: by(["[n] Cicada nymphs in jars, one jar per emergence, labeled in Lutz's capitals. 1945. 1962. MAY 1979.",
        "[n] Next to them, an empty jar. Clean lid. A label already on it: 1996.", "[scared] He knew they'd come back. He just didn't know what else would."],
      ['[n] 1945. 1962. 1979.', '[n] And the empty one. 1996.'], '[n] 1996. Still empty. Still waiting.'),
      banter: M("[worried] He made a jar for this year. {p} That's not a science thing. That's a counting thing.") },
    { id: 'e2_brood_board', type: 'bulletin_board', x: 31, y: 2, state: 'brood', doc: 'brood',
      examine: by("[curious] Mr. Lutz's board. BROOD II, in big block capitals.", "[n] BROOD II.", "[n] Lutz's board. Every one a Founder's Day year."),
      banter: M("[thoughtful] Seventeen years. That's what Leah said on the steps.") },
    { id: 'e2_206_chalk', type: 'chalkboard', x: 33, y: 2, state: 'text', text: 'EXUVIAE: THE SHELLS THEY LEAVE BEHIND',
      params: { text1979: 'EXUVIAE: THE SHELLS THEY LEAVE BEHIND' },
      examine: by(["[n] EXUVIAE: THE SHELLS THEY LEAVE BEHIND. Underlined twice.", "[worried] The things left behind. He drew one. It looks like a little person sitting down."],
        '[n] EXUVIAE. The shells they leave behind.', '[scared] The shells they leave behind. The seats. The seats in the auditorium.'),
      banter: M("[worried] Grandma calls them locusts. She won't let them in the house.") },
    { id: 'e2_206_clock', type: 'clock_wall', x: 36, y: 2 },
    // the hook by the board, the pass, and the Ch5 battery beside it (DESIGN §9.5)
    { id: 'e2_pass_hooks', type: 'coat_hooks', x: 37, y: 2,
      examine: [
        { cond: (s) => !!F(s).longhall_cleared, text: ['[n] An empty hook. HALL PASS — RM. 206, in paint on the wall above it.', "[sad] He kept it. One pass."] },
        { cond: (s) => ((s.inv && s.inv.hall_pass) || 0) > 0, text: '[n] HALL PASS — RM. 206, painted over an empty hook. It\'s in my bag.' },
        { text: '[n] Coat hooks. One has a wooden paddle on a shoelace: HALL PASS — RM. 206.' },
      ],
      banter: M("[thoughtful] One pass. Per room. You had to wait your turn.") },
    { id: 'e2_hall_pass', type: 'pickup', x: 37, y: 3, item: 'hall_pass', script: 'ch5.hall_pass',
      examine: "[n] A wooden paddle, burned in with a hot nail: HALL PASS — RM. 206. Hundreds of kids' thumbs wore the varnish off." },
    { id: 'e2_battery_206', type: 'pickup', x: 38, y: 3, item: 'battery',
      examine: "[relieved] A battery, standing on the windowsill under the hooks. Like somebody left it for the next kid." },
    { id: 'e2_skeleton', type: 'skeleton', x: 40, y: 3,
      examine: by(["[n] The anatomy skeleton, wearing a green COLLIERS cap at an angle.", "[skeptical] Even he dressed up for homecoming."],
        '[n] The skeleton in his Colliers cap.', "[n] He's the only one in here who isn't waiting for something."),
      banter: M('[soft_smile] Every bio room has a guy in a hat.') },
    { id: 'e2_206_chair', type: 'chair_teacher', x: 34, y: 3, dir: 'down' },
    { id: 'e2_206_desk', type: 'desk_teacher', x: 34, y: 4,
      examine: by(["[n] Mr. Lutz's field notebook. Last entry, Oct. 18, 1979: 'Shells on the oak still intact after five months. Have never seen this. Will ask Walt about the boiler.'",
        "[worried] The day before. He noticed. Everybody noticed one thing."], "[n] 'Have never seen this.'", "[n] 'Will ask Walt about the boiler.' {p} Walt knew."),
      banter: M("[thoughtful] Walt. That's the janitor. The log.") },
    // three black benches, two stools each (seats; hide spots in periods)
    { type: 'lab_bench', x: 29, y: 6, examine: '[n] Black epoxy, gas taps, a sink. A frog diagram scratched into the top with a compass point.' },
    { type: 'lab_bench', x: 33, y: 6 },
    { type: 'lab_bench', x: 37, y: 6 },
    { type: 'lab_bench', x: 29, y: 8, examine: "[n] A dissecting tray, rinsed and left to dry. It's been drying a long time." },
    { type: 'lab_bench', x: 37, y: 8 },
    { type: 'lab_stool', x: 29, y: 7 },
    { type: 'lab_stool', x: 30, y: 7 },
    { type: 'lab_stool', x: 33, y: 7 },
    { type: 'lab_stool', x: 34, y: 7 },
    { type: 'lab_stool', x: 37, y: 7 },
    { type: 'lab_stool', x: 38, y: 7 },
    { type: 'lab_stool', x: 29, y: 9 },
    { type: 'lab_stool', x: 38, y: 9 },
    { type: 'cicada_shells', x: 29, y: 4 },
    { type: 'decal_leaves', x: 39, y: 4 },
    { type: 'decal_stain', x: 35, y: 8 },
    { type: 'trash_can', x: 40, y: 9 },

    // ======================================================== 207 computer lab (ROLLCALL.BAS)
    { id: 'e2_lab_board', type: 'bulletin_board', x: 44, y: 2, state: 'computers', doc: 'lab_memo',
      examine: by('[curious] A memo pinned over a Radio Shack poster. COMPUTER LITERACY — ROOM 207.', '[n] The computer memo.', '[n] ROLLCALL. Type RUN, then a name.'),
      banter: M("[thoughtful] An attendance program. In 1978. {p} Of course it was attendance.") },
    { id: 'e2_207_chalk', type: 'chalkboard', x: 47, y: 2, state: 'text', text: 'TYPE RUN. PRESS ENTER. DO NOT EAT AT THE MACHINES.',
      params: { text1979: 'TYPE RUN. PRESS ENTER. DO NOT EAT AT THE MACHINES.' },
      examine: by('[n] TYPE RUN. PRESS ENTER. DO NOT EAT AT THE MACHINES.', '[n] TYPE RUN.') },
    { id: 'e2_207_clock', type: 'clock_wall', x: 51, y: 2 },
    // six TRS-80s; the periods system switches them on. All six run sys.terminal (dead outside periods).
    { id: 'e2_terminal', type: 'computer_desk', x: 44, y: 5, state: 'off' },
    { id: 'e2_trs80_2', type: 'computer_desk', x: 47, y: 5, state: 'off' },
    { id: 'e2_trs80_3', type: 'computer_desk', x: 50, y: 5, state: 'off' },
    { id: 'e2_trs80_4', type: 'computer_desk', x: 44, y: 7, state: 'off' },
    { id: 'e2_trs80_5', type: 'computer_desk', x: 47, y: 7, state: 'off' },
    { id: 'e2_trs80_6', type: 'computer_desk', x: 50, y: 7, state: 'off' },
    // chairs pulled up to five of them (the terminal's chair is shoved back to the wall: the aisle in
    // front of it is anchor `terminal`)
    { type: 'office_chair', x: 47, y: 6, dir: 'up', sitDir: 'up' },
    { type: 'office_chair', x: 50, y: 6, dir: 'up', sitDir: 'up' },
    { type: 'office_chair', x: 44, y: 8, dir: 'up', sitDir: 'up' },
    { type: 'office_chair', x: 47, y: 8, dir: 'up', sitDir: 'up' },
    { type: 'office_chair', x: 50, y: 8, dir: 'up', sitDir: 'up' },
    { id: 'e2_terminal_chair', type: 'office_chair', x: 42, y: 6, dir: 'right', sitDir: 'right',
      examine: "[n] Somebody shoved this chair back from the first machine in a hurry. It's still turned toward the door." },
    { id: 'e2_207_desk', type: 'desk_teacher', x: 52, y: 4,
      examine: by(['[n] A box of cassette tapes labeled in marker: ROLLCALL 1923–49. 1950–69. 1970–.', "[worried] The whole school, on cassettes."],
        '[n] ROLLCALL, on cassettes.'),
      banter: M('[thoughtful] Every kid since 1923. On a tape.') },
    { type: 'chair_teacher', x: 53, y: 3, dir: 'down' },
    { id: 'e2_printer', type: 'printer', x: 54, y: 5,
      examine: by(["[n] A dot-matrix printer. A page hangs out of it: a list of surnames, and after each one, PROVISIONAL or PERMANENT.",
        '[worried] Mostly PERMANENT.'], '[n] PROVISIONAL. PERMANENT. PERMANENT.', '[scared] PERMANENT. PERMANENT. PERMANENT.'),
      banter: M("[worried] Pencil and ink. Walt's log said pencil and ink.") },
    { type: 'decal_papers', x: 53, y: 6 },
    { type: 'decal_stain', x: 45, y: 9 },
    { type: 'decal_leaves', x: 54, y: 4 },
    { type: 'trash_can', x: 42, y: 9 },

    // ======================================================== storage closet (optional battery)
    { id: 'e2_storage_shelf', type: 'shelf_metal', x: 2, y: 21,
      examine: by("[n] Crepe paper in green and gold, rolls of it. Boxes marked HOMECOMING — DO NOT CRUSH.", "[n] HOMECOMING — DO NOT CRUSH."),
      banter: M("[neutral] Decorations for the dance.") },
    { id: 'e2_storage_desks', type: 'desk_pile', x: 4, y: 25,
      examine: "[n] Desks stacked to the ceiling, legs up, like something trying to climb out." },
    { type: 'mop_bucket', x: 6, y: 22, examine: '[n] A mop bucket. Gray water, dried to a ring.' },
    { id: 'e2_battery_storage', type: 'pickup', x: 7, y: 21, item: 'battery',
      examine: '[relieved] A battery in a box of flashlight bulbs. Somebody stocked this closet for a blackout.' },
    { id: 'e2_storage_bulb', type: 'cage_bulb', x: 3, y: 20, state: 'off' },
    { type: 'decal_stain', x: 3, y: 24 },
    { type: 'cobweb', x: 7, y: 28 },

    // ======================================================== teachers' workroom (ditto, coffee, sign-ups)
    { id: 'e2_ditto', type: 'office_desk', x: 10, y: 21,
      examine: by(["[n] A spirit duplicator. The ditto master is still on the drum, purple: ASSEMBLY 1:45 — HOMEROOMS PROCEED IN ORDER — NO TALKING.",
        "[worried] 'Proceed in order.' Like a fire drill. The other way."], '[n] ASSEMBLY 1:45. PROCEED IN ORDER.', '[n] PROCEED IN ORDER. NO TALKING.'),
      banter: M("[neutral] Ditto fluid. My mom says she used to sniff the fresh ones.") },
    { id: 'e2_workroom_board', type: 'bulletin_board', x: 16, y: 20, state: 'generic',
      examine: by(["[n] CHAPERONES — HOMECOMING DANCE. Six blanks, five names. The last line, in green felt-tip: R. ADAIR (if I'm still here).",
        "[worried] If I'm still here."], '[n] R. ADAIR (if I\'m still here).', "[sad] 'If I'm still here.' She knew."),
      banter: M('[worried] Adair. That was the music teacher. She was on the news after.') },
    { id: 'e2_workroom_clock', type: 'clock_wall', x: 19, y: 20 },
    { type: 'reading_table', x: 13, y: 23, examine: "[n] A long table. Coffee rings overlapping like a Venn diagram of everyone who hated grading." },
    { type: 'office_chair', x: 12, y: 23, dir: 'right', sitDir: 'right' },
    { type: 'office_chair', x: 15, y: 23, dir: 'left', sitDir: 'left' },
    { type: 'office_chair', x: 12, y: 24, dir: 'right', sitDir: 'right' },
    { type: 'office_chair', x: 15, y: 24, dir: 'left', sitDir: 'left' },
    { id: 'e2_workroom_mug', type: 'note_paper', x: 14, y: 23,
      examine: by("[n] A mug that says WORLD'S OKAYEST TEACHER. No. It says WORLD'S GREATEST. The coffee in it turned to varnish.",
        "[n] WORLD'S GREATEST TEACHER. Varnish.") },
    { type: 'water_cooler', x: 9, y: 26, examine: '[n] A water cooler. The jug is dry and full of dead moths.' },
    { type: 'coat_rack', x: 19, y: 22, examine: "[n] A man's tweed jacket. Elbow patches. Chalk dust in the pockets." },
    { type: 'filing_cabinet', x: 20, y: 25 },
    { type: 'trash_can', x: 18, y: 28 },
    { type: 'decal_papers', x: 11, y: 27 },
    { type: 'decal_stain', x: 17, y: 26 },

    // ======================================================== 208 typing (a timed writing never finished)
    { id: 'e2_208_chalk', type: 'chalkboard', x: 25, y: 20, state: 'text', text: 'TIMED WRITING — 5 MIN — EYES ON COPY',
      params: { text1979: 'TIMED WRITING — 5 MIN — EYES ON COPY' },
      examine: by('[n] TIMED WRITING — 5 MIN — EYES ON COPY.', '[n] EYES ON COPY.') },
    { id: 'e2_208_clock', type: 'clock_wall', x: 29, y: 20 },
    { type: 'poster', x: 31, y: 20, state: 'read', examine: '[n] READ! A cartoon owl in glasses. The owl has seen some things.' },
    { id: 'e2_208_teacher', type: 'desk_teacher', x: 28, y: 22,
      examine: by("[n] A kitchen timer, wound to five minutes and stopped at two and a half.", "[n] Two and a half minutes. Then the bell."),
      banter: M('[thoughtful] Stopped halfway. Like somebody put a hand on it.') },
    { type: 'chair_teacher', x: 29, y: 21, dir: 'down' },
    // two rows of typing tables (office desks with typewriters) and chairs (seats)
    { id: 'e2_typewriter', type: 'office_desk', x: 23, y: 24,
      examine: by(["[n] A Smith-Corona with paper still in it: 'Now is the time for all good men to come to the aid of'", "[worried] Of what. Of the party. Say it."],
        "[n] 'Now is the time for all good men to come to the aid of'", "[n] 'to come to the aid of.' Nobody came."),
      banter: M('[neutral] My cousin learned on one of those. Says your pinkies never recover.') },
    { type: 'office_desk', x: 26, y: 24 },
    { type: 'office_desk', x: 30, y: 24 },
    { type: 'office_desk', x: 33, y: 24 },
    { type: 'office_desk', x: 23, y: 27 },
    { type: 'office_desk', x: 26, y: 27 },
    { type: 'office_desk', x: 30, y: 27 },
    { type: 'office_desk', x: 33, y: 27, examine: "[n] ASDF JKL; ASDF JKL; ASDF JKL; — and then a whole line of the same letter. Like someone kept their finger down." },
    { type: 'office_chair', x: 23, y: 25, dir: 'up', sitDir: 'up' },
    { type: 'office_chair', x: 26, y: 25, dir: 'up', sitDir: 'up' },
    { type: 'office_chair', x: 30, y: 25, dir: 'up', sitDir: 'up' },
    { type: 'office_chair', x: 33, y: 25, dir: 'up', sitDir: 'up' },
    { type: 'office_chair', x: 23, y: 28, dir: 'up', sitDir: 'up' },
    { type: 'office_chair', x: 26, y: 28, dir: 'up', sitDir: 'up' },
    { type: 'office_chair', x: 33, y: 28, dir: 'up', sitDir: 'up' },
    { type: 'decal_papers', x: 31, y: 26 },
    { type: 'decal_tiles', x: 35, y: 22 },
    { type: 'decal_stain', x: 24, y: 22 },

    // ======================================================== guidance (Danny's door out, in 1979 colors)
    { id: 'e2_college_board', type: 'bulletin_board', x: 39, y: 20, state: 'generic',
      examine: by("[n] Pennants. PENN STATE. BLOOMSBURG. KUTZTOWN. A flyer: SENIORS — APPLICATIONS DUE NOV. 1.", '[n] APPLICATIONS DUE NOV. 1.',
        "[sad] Carol Ann Mrazek was seventeen. She'd have had a pennant picked out."),
      banter: M("[thoughtful] Grandma wanted me at Bloomsburg. Close enough to come home Sundays.") },
    { id: 'e2_guidance_clock', type: 'clock_wall', x: 43, y: 20 },
    { id: 'e2_guidance_desk', type: 'office_desk', x: 41, y: 23,
      examine: by(["[n] A desk calendar flipped to FRI OCT 19. Appointments: 9:10 Mrazek — college. 11:00 Hoyt (patrol). 1:20 —",
        "[worried] The one-twenty line is blank. Somebody was going to come at one-twenty."], '[n] 1:20 — and nothing.', '[n] One-twenty. Nothing.'),
      banter: M("[worried] One-twenty. {p} Grandma signed Denise out at one-twenty.") },
    { type: 'office_chair', x: 41, y: 22, dir: 'down', sitDir: 'down' },
    { id: 'e2_navy_pamphlets', type: 'note_paper', x: 42, y: 23,
      examine: by(["[n] A rack of pamphlets fanned on the desk. PENN STATE. BLOOMSBURG. And a blue one: NAVY — IT'S NOT JUST A JOB. IT'S AN ADVENTURE.",
        "[sad] Danny would make fun of that one. Then he'd take it when nobody was looking. Fold it really small."],
      "[n] NAVY — IT'S AN ADVENTURE.", "[sad] He'd fold it really small. He'd carry it everywhere."),
      banter: M("[soft_smile] Danny'd do the salute. Badly.") },
    { type: 'office_chair', x: 41, y: 25, dir: 'up', sitDir: 'up' },
    { type: 'office_chair', x: 43, y: 25, dir: 'up', sitDir: 'up' },
    { id: 'e2_records', type: 'filing_cabinet', x: 45, y: 22,
      examine: by(["[n] A drawer labeled PERMANENT RECORDS. Empty. Every folder gone.", "[worried] Permanent. Somebody took them anyway."],
        '[n] PERMANENT RECORDS. Empty.', "[scared] Permanent. That's what ink means."),
      banter: M('[thoughtful] Permanent record. Everybody threatened you with it. Nobody ever saw one.') },
    { type: 'plant_dead', x: 37, y: 21 },
    { type: 'bookshelf_low', x: 37, y: 27, examine: "[n] *What Color Is Your Parachute?*, 1979 edition. *Careers in Coal*. A Lovejoy's college guide, dog-eared at Pittsburgh." },
    { type: 'decal_stain', x: 44, y: 27 },
    { type: 'decal_papers', x: 39, y: 25 },

    // ======================================================== west end: the mouth of the long hall
    { type: 'decal_leaves', x: 1, y: 14 },
    { type: 'cicada_shells', x: 2, y: 17 },
  ],

  doors: {
    '4,12': { id: 'e2_door_rr', label: 'BOYS' },
    '16,12': { id: 'e2_door_205', label: '205' },
    '32,12': { id: 'e2_door_206', label: '206' },
    '48,12': { id: 'e2_door_207', label: '207' },
    '27,5': { id: 'e2_cloak_door', label: 'CLOAKROOM' },
    '5,20': { id: 'e2_door_storage', type: 'door_metal', label: 'STORAGE' },
    '14,20': { id: 'e2_door_workroom', label: 'FACULTY' },
    '28,20': { id: 'e2_door_208', label: '208' },
    '41,20': { id: 'e2_door_guidance', type: 'door_glass', label: 'GUIDANCE' },
  },

  rooms: [
    { id: 'e2_hall', name: 'East Hall — 2F', rect: [1, 13, 55, 5], kind: 'hall' },
    { id: 'e2_boys_rr', name: "Boys' Room", rect: [2, 3, 5, 7], kind: 'restroom' },
    { id: 'e2_stair', name: 'East Stairs', rect: [8, 3, 5, 10], kind: 'stair' },
    { id: 'e2_room205', name: 'Room 205 — English', rect: [14, 3, 13, 7], kind: 'classroom' },
    { id: 'e2_room206', name: 'Room 206 — Biology', rect: [28, 3, 13, 7], kind: 'classroom' },
    { id: 'e2_room207', name: 'Room 207 — Computers', rect: [42, 3, 13, 7], kind: 'classroom' },
    { id: 'e2_storage', name: 'Storage', rect: [2, 21, 6, 8], kind: 'special' },
    { id: 'e2_workroom', name: "Teachers' Workroom", rect: [9, 21, 12, 8], kind: 'office' },
    { id: 'e2_room208', name: 'Room 208 — Typing', rect: [22, 21, 14, 8], kind: 'classroom' },
    { id: 'e2_guidance', name: 'Guidance', rect: [37, 21, 9, 8], kind: 'office' },
  ],

  anchors: {
    from_east1: [10, 8, 'down'],        // top of the east stairs (treads at rows 3–5 = the exit)
    from_longhall: [4, 15, 'right'],    // back from the long hall's east end
    balcony: [10, 6, 'up'],             // the stair landing, at the rail over the stairwell
    door_205: [16, 13, 'up'],
    in_205: [16, 8, 'up'],
    danny_desk: [19, 8, 'up'],          // aisle south of e2_desk_danny (Danny is seated on the desk by script)
    desk_205_tess: [23, 8, 'up'],       // aisle south of e2_desk_205_tess (two desks east of Danny)
    colonel_205: [16, 9, 'up'],         // just inside 205's door (scripted period entry)
    door_206: [32, 13, 'up'],
    in_206: [32, 8, 'up'],
    hall_pass: [37, 4, 'up'],           // facing the hook and the pass
    door_207: [48, 13, 'up'],
    terminal: [44, 6, 'up'],            // in front of e2_terminal
    in_207: [48, 8, 'up'],
    door_rr: [4, 13, 'up'],
    in_rr: [4, 8, 'up'],
    workroom: [14, 22, 'down'],
    room208: [28, 23, 'down'],
    guidance: [41, 21, 'down'],
    storage: [5, 22, 'down'],
    hall_west: [2, 15, 'right'],
    hall_east: [53, 15, 'left'],
    fire_escape: [54, 15, 'right'],
  },

  exits: [
    { rect: [9, 3, 3, 2], to: 'east1', anchor: 'from_east2' },
    // The long hall: not before 205 (DESIGN §9.2). Marcus: "Two-oh-five first. He's right there, Tess."
    { rect: [1, 13, 1, 5], to: 'longhall', anchor: 'from_east2',
      lock: (s) => !s.flags.ch5_danny_found, refuse: 'ch5.longhall_refuse',
      lockedText: [
        { cond: withMarcus, text: "[marcus:urgent] Two-oh-five first. He's right there, Tess." },
        { text: "[worried] Two-oh-five first. He's right there." },
      ] },
  ],

  triggers: [
    // Danny (DESIGN §6 V.1): the first step into 205 in Ch5
    { id: 'room205_enter', rect: [14, 6, 13, 4], script: 'ch5.danny', once: false,
      cond: (s) => (s.chapter || 0) >= 5 && !s.flags.ch5_danny_found },
  ],

  lights: [
    // hall fluorescents (period only); one tired tube outside 206
    { type: 'fluor', x: 4, y: 15, group: 'period' },
    { type: 'fluor', x: 12, y: 15, group: 'period' },
    { type: 'fluor', x: 20, y: 15, group: 'period' },
    { type: 'fluor', x: 28, y: 15, group: 'period' },
    { type: 'fluor', x: 36, y: 15, group: 'period', flicker: true },
    { type: 'fluor', x: 44, y: 15, group: 'period' },
    { type: 'fluor', x: 52, y: 15, group: 'period' },
    // classrooms & south rooms (period only)
    { type: 'fluor', x: 17, y: 6, group: 'period' },
    { type: 'fluor', x: 23, y: 6, group: 'period' },
    { type: 'fluor', x: 31, y: 6, group: 'period' },
    { type: 'fluor', x: 37, y: 6, group: 'period' },
    { type: 'fluor', x: 45, y: 6, group: 'period' },
    { type: 'fluor', x: 51, y: 6, group: 'period' },
    { type: 'fluor', x: 4, y: 6, group: 'period', flicker: true },
    { type: 'fluor', x: 14, y: 25, group: 'period' },
    { type: 'fluor', x: 25, y: 25, group: 'period' },
    { type: 'fluor', x: 32, y: 25, group: 'period' },
    { type: 'fluor', x: 41, y: 24, group: 'period' },
    // the long hall's mouth: cold gallery moonlight spilling in from the west (pulls the eye there)
    { type: 'spot', x: 1, y: 15, color: '#7f9cc4', intensity: 0.45, radius: 3.5, disc: 1.6, shadows: false },
  ],

  patrol: {
    nodes: {
      w: [3, 15], stair: [10, 15], landing: [10, 7], d205: [16, 15], board: [23, 15], d206: [32, 15],
      mid: [40, 15], d207: [48, 15], e: [53, 15], s_work: [14, 16], s_208: [28, 16],
    },
    edges: [['w', 'stair'], ['stair', 'landing'], ['stair', 'd205'], ['d205', 'board'], ['board', 'd206'], ['d206', 'mid'],
      ['mid', 'd207'], ['d207', 'e'], ['d205', 's_work'], ['board', 's_208'], ['s_208', 'd206']],
    // wall seams: 205|206 and 206|207 (north), workroom|208 and 208|guidance (south), the brick pier
    folds: [[27, 12], [41, 12], [21, 18], [36, 18], [13, 12]],
    peeks: [
      { room: 'e2_room205', door: [16, 12], look: [16, 8] },
      { room: 'e2_room206', door: [32, 12], look: [32, 8] },
      { room: 'e2_room207', door: [48, 12], look: [48, 8] },
      { room: 'e2_boys_rr', door: [4, 12], look: [4, 8] },
      { room: 'e2_workroom', door: [14, 20], look: [14, 22] },
      { room: 'e2_room208', door: [28, 20], look: [28, 23] },
    ],
    kevin: [[53, 15, 'left'], [2, 14, 'right']],
  },
};
