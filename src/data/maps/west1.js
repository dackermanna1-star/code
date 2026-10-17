// WEST HALL — FIRST FLOOR (west1) · 62×30 · offset (-2, 22) · CONTENT §2.3 · maps-B
//
// The most-played map (Ch1 explore + vanish, Ch2 heads-down in 103, Ch4 office suite + roll call,
// Ch6 Haupt's safe). One long corridor (local rows 13–17 = world 35–39) from the library doors
// (west, jammed until `library_door_open`) to the lobby mouth (east, x 60–61).
//
//   NORTH (exterior wall, windows), west → east:
//     103 (x 2–14; Ch2 heads-down room, Leah/Tess/Marcus front row) · bell-schedule bulletin board
//     on the hall wall (Danny-vanish spot; `vanish` trigger x 14–19) · 102 (x 16–30; four-panel
//     board that fills with names; scattered ↔ rows desks) · cloakroom door 102↔101 · 101
//     kindergarten (x 32–44; tiny tables, cubbies, piano, story rug) · girls' RR (x 46–53) ·
//     custodian's closet (x 56–60) set into the brick of the lobby block.
//   SOUTH, west → east:
//     collapsed WEST STAIRWELL (x 2–13, open arch at x 6–7 opposite 103; rubble x 10–13; a cold
//     disc of moonlight on the puddle under the ceiling hole at x 3–5, seen from the hall through
//     the arch — west2's railed hole should sit over world x 0–11, the hole itself at world 1–4) ·
//     A.V. / SAFETY PATROL room (x 15–24; Kevin's empty belt hook, patrol posts) · MAIN OFFICE
//     SUITE: nurse (x 26–31) ↔ reception (x 33–42, glass door + interior window onto the hall at
//     x 36–38) ↔ P.A. closet (x 44–48, rows 21–24) and the outer-office strip (x 43–48, rows 26–28)
//     ↔ Haupt's paneled office (x 50–60). From the counter you cannot see the strip; from Haupt's
//     desk you can (Denise waited there in 1979 — the reception_1979 past view shows it).
//
// Key beats wired here: Ch1 room_enter_* / vanish / room102 triggers · Ch2 `ch2_103` → ch2.sit,
// door ids w1_door_101/102/103/rr for the slams · Ch4 office_first, colonel_fold_hall (a seam in
// the hall's SOUTH wall at x 25, framed by the reception glass from the waiting bench) · Ch6
// w1_haupt_portrait + `principal_safe` past view (its `cond: chapter >= 6` needs compact.js support).
//
// Notes for scripts:
//   - desk_103_* anchors stand in the aisle directly south of desks w1_desk_103_tess/_leah/_marcus.
//   - 102's board is four 3-wide panels (the art fits ~one roll line per panel). Text variants are
//     cond objects (CONTENT §4): w1_chalk_102 (DANIEL KOVACH — PRESENT, from ch1_102_rows),
//     w1_chalk_102_leah, w1_chalk_102_tess_a / _tess_p (by roll1_answered), w1_chalk_102_marcus.
//   - The office door gate is `chapter >= 1 && no keyring` (chapter 0 = no story context: debug
//     teleports / map tests); the trigger office_first → ch4.office_enter should set office_open.
//   - The vanish cond also accepts `flags.ch1_west1_t` (playtime when the party first entered west1),
//     if a Ch1 script records it, for DESIGN's "≥ 1 room and > 90 s" alternative.
//
//   x →  0         1         2         3         4         5         6
//        01234567890123456789012345678901234567890123456789012345678901

const F = (s) => s.flags || {};
const inParty = (id) => (s) => (s.party || []).includes(id);
const pre = (s) => s.chapter <= 1 && !F(s).ch1_danny_vanished;   // Ch1, the four of them
const post = (s) => s.chapter <= 1 && !!F(s).ch1_danny_vanished; // Ch1, after Danny
const from = (n) => (s) => s.chapter >= n;
const alone = (s) => !!F(s).ch6_marcus_taken;

// Tess, by act: Ch1 (dry) → Ch2–5 (tense) → Ch6+ (literal). A missing act falls back to the earlier one.
const by = (c1, c2, c6) => {
  const out = [];
  if (c6) out.push({ cond: from(6), text: c6 });
  if (c2) out.push({ cond: from(2), text: c2 });
  out.push({ text: c1 });
  return out;
};

// Ch1 company: one line each before the vanish; Leah and Marcus stay close and short after it.
const LEAH_POST = [
  '[worried] T. Can we just go?',
  '[scared] Keep your light where I can see it.',
  "[worried] Don't read things. Walk.",
  "[scared] He'd have a dumb joke about this. He'd have one right now.",
];
const MARCUS_POST = [
  '[urgent] Keep moving.',
  '[worried] Stay close, Tess.',
  '[neutral] Lobby. Front doors.',
  "[worried] Don't stop here.",
];
const B = (danny, leah, marcus, i = 0, extra = {}) => ({
  danny: [{ cond: pre, text: danny }],
  leah: [{ cond: pre, text: leah }, { cond: post, text: LEAH_POST[i % LEAH_POST.length] }, ...(extra.leah || [])],
  marcus: [{ cond: pre, text: marcus }, { cond: post, text: MARCUS_POST[i % MARCUS_POST.length] }, ...(extra.marcus || [])],
});
// Ch4/Ch6 office company (Marcus only).
const M = (text, cond = (s) => s.chapter >= 4 && !alone(s)) => ({ marcus: [{ cond, text }] });

// "No. Seats." — hall lockers are never hide spots (DESIGN §4).
const LOCKER_RULE = [
  { cond: alone, text: '[scared] No. Seats.' },
  { cond: from(3), text: 'No. Seats. Marcus said seats.' },
  { cond: from(2), text: '[worried] Not a locker. A room. Sitting down.' },
];

const libraryDoorsText = [
  { cond: pre, text: [
    "[n] It won't budge. Something's wedged against it on the other side.",
    { cond: inParty('danny'), text: "[danny:grin] Library's closed, Dolan. Overdue fines." },
    { cond: inParty('leah'), text: '[leah:deadpan] Wedged from the inside. So somebody was in there.' },
  ] },
  { cond: (s) => s.chapter <= 1 && !F(s).ch1_front_loop, text: [
    "[n] It won't budge. Something's wedged against it on the other side.",
    { cond: inParty('leah'), text: "[leah:scared] Danny? {p} If you're in there, it isn't funny." },
  ] },
  { cond: (s) => s.chapter <= 2, text: [
    "[n] It won't budge. Something's wedged against it on the other side.",
    '[scared] We walked out of these. I watched us walk out of these.',
  ] },
  { cond: (s) => !!F(s).roll1_done && !F(s).ch5_leah_found, text: [
    "[n] It won't budge.",
    '[worried] Leah? {p} ...Nothing. The crying on the intercom came from in there.',
    { cond: inParty('marcus'), text: "[marcus:thoughtful] Not from this side. There's a door upstairs too. There has to be." },
  ] },
  { text: "[n] It won't budge. Something heavy and patient is leaning on the other side." },
];

const officeDoorText = [
  { cond: pre, text: [
    '[n] MAIN OFFICE, in gold leaf. Locked.',
    "[curious] Through the glass, way in the back: one little red light. Something's still plugged in.",
    { cond: inParty('danny'), text: "[danny:grin] Principal's office. I've been in there more than the principal." },
    { cond: inParty('leah'), text: "[leah:talk] Power's been off twelve years. That light can't be on." },
    { cond: inParty('marcus'), text: '[marcus:worried] Leave it.' },
  ] },
  { cond: (s) => s.chapter <= 1, text: '[n] Locked. The red light is still on.' },
  { cond: (s) => s.chapter <= 2, text: ['[n] Locked.', '[worried] The intercom is in there. The voice came from in there.'] },
  { text: ['[n] Locked. MAIN OFFICE.', "[determined] The janitor's keys. Somewhere under the school."] },
];

export default {
  id: 'west1',
  name: 'West Hall — First Floor',
  floor: '1F',
  offset: [-2, 22],
  ambience: 'hall',
  music: null,
  dark: 0.94,
  ambient: '#0b1020',
  tiles: [
    ' #############################################TTTTTTTT#B#####B', //  0  north exterior wall (top)
    ' ##WW#######WW###W############W##WW#######WW##TTTTWTTT#B#####B', //  1  face_high, windows
    ' ##WW#######WW###W############W##WW#######WW##TTTTWTTT#B#####B', //  2  face_low
    ' #.............#...............#.............#________#B:::::B', //  3  103 | 102 | 101 | girls RR | custodian
    ' #.............#...............#.............#________#B:::::B', //  4
    ' #.............#...............D.............#________#B:::::B', //  5  cloakroom door 102↔101
    ' #.............#...............#.............#________#B:::::B', //  6
    ' #.............#...............#"""..........#________#B:::::B', //  7  101 story rug
    ' #.............#...............#"""..........#________#B:::::B', //  8
    ' #.............#...............#"""..........#________#B:::::B', //  9
    ' ##########D########D################D##########D######BBBBDBB', // 10  hall north wall: top
    ' ##########D########D################D##########D######BBBBDBB', // 11  face_high
    ' ##########D########D################D##########D######BBBBDBB', // 12  face_low (hall props)
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', // 13  corridor (world 35)
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', // 14
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', // 15  library doors at x 1 (door_side ×2)
    ' ,,,,,dd,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', // 16
    ' #,,,dddd,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', // 17  (world 39)
    ' #####dd###########D##############D###############PPPPPPPPPPP#', // 18  south rooms' north wall: top
    ' #####dd###########D##############D#WWW###########PPPPPPPPPPP#', // 19  face_high (reception window)
    ' #####dd###########D##############D#WWW###########PPPPPPPPPPP#', // 20  face_low
    ' #ssddddddXXXX#..........#......#""""""""""#.....#"""""""""""#', // 21  stair | A.V. | nurse | reception | P.A. | Haupt
    ' #d~~~ddddXXXX#..........#......#""""""""""#.....#"""""""""""#', // 22
    ' #sd~~ddddXXXX#..........#......#""""""""""D.....#"""""""""""#', // 23
    ' #dd~ddddd^^XX#..........#......D""""""""""#.....#"""""""""""#', // 24
    ' #sddddddd^^dX#..........#......#""""""""""#######"""""""""""#', // 25
    ' #sdddddss^^ss#..........#......#""""""""""""""""#"""""""""""#', // 26  outer-office strip
    ' #ssddssssssss#..........#......#""""""""""""""""D"""""""""""#', // 27
    ' #ssssssssssss#..........#......#""""""""""""""""#"""""""""""#', // 28
    ' #############################################################', // 29
  ],

  // Lockers (never hide spots) and the 103 / 102 / 101 seating that never changes.
  propLegend: { L: 'locker', d: 'desk_student', c: 'tiny_chair', s: 'desk_student' },
  propLayer: [
    '..............................................................', //  0
    '..............................................................', //  1
    '..............................................................', //  2
    '..............................................................', //  3
    '..............................................................', //  4
    '..............................................................', //  5
    '...d..........................................................', //  6  103 front row (x 5–13 are named objects)
    '..............................................................', //  7
    '...d.d.d.d...d................................................', //  8  103 back row (door aisle at x 11)
    '..............................................................', //  9
    '..............................................................', // 10
    '..............................................................', // 11
    '..............................................................', // 12
    '......................LLL.L...............L.L.................', // 13  hall lockers (x 25, 43 are examinable objects)
    '..............................................................', // 14
    '..............................................................', // 15
    '..............................................................', // 16
    '..............................................................', // 17
    '..............................................................', // 18
    '..............................................................', // 19
    '..............................................................', // 20
    '..............................................................', // 21
    '..............................................................', // 22
    '..............................................................', // 23
    '..............................................................', // 24
    '..............................................................', // 25
    '................s.s.s.s.......................................', // 26  A.V. club / patrol desks
    '..............................................................', // 27
    '..............................................................', // 28
    '..............................................................', // 29
  ],

  objects: [
    // ======================================================== corridor (north wall face, row 12)
    { id: 'w1_exit_lib', type: 'exit_sign', x: 2, y: 12, state: 'dead' },
    { id: 'w1_bench_w', type: 'bench', x: 4, y: 13 },
    { id: 'w1_exit_stair', type: 'exit_sign', x: 6, y: 12, state: 'flicker',
      examine: by(['[n] EXIT. The arrow points across the hall, at the west stairs.', '[skeptical] The west stairs are a pile.'],
        '[worried] Still pointing at the stairs. Still lying.', '[n] EXIT.'),
      banter: B('[grin] Exits in this town are more of a rumor.', "[talk] It's on a battery. Twelve years. Somebody should write to the company.",
        "[worried] Don't follow that one.", 0) },
    { id: 'w1_clock_w', type: 'clock_hall', x: 8, y: 12,
      examine: by(['[n] Twenty to two.', "[confused] ...It's ticking."], '[worried] Twenty to two. It only ever creeps toward quarter to.',
        '[scared] Twenty to two. Quarter to is the bell.'),
      banter: B('[grin] Clock says lunch. My stomach agrees.', "[deadpan] The power's been off since '84, Danny.", "[worried] Then what's winding it?", 1) },
    { id: 'w1_fountain', type: 'water_fountain', x: 9, y: 13,
      examine: by('[n] Dry. Somebody stuck gum under the spout in a year with a seven in it.', '[n] Dry.', '[n] Dry. So is my mouth.'),
      banter: B('[grin] Hollow Hell water. Cures everything except Hollow Hell.', "[deadpan] It's dry, Danny.", '[neutral] Still smells like pennies.', 2) },
    { id: 'w1_poster_patrol', type: 'poster', x: 13, y: 12, state: 'patrol',
      examine: [
        { cond: from(6), text: '[scared] The kid on the poster has the same belt. The exact same belt.' },
        { cond: (s) => s.chapter >= 2 || post(s), text: ["[n] WALK — DON'T RUN. YOUR SAFETY PATROL.", "[scared] He was jogging. That's all. He was just jogging."] },
        { text: "[n] A poster: a kid in an orange belt, one hand up like a crossing guard. WALK — DON'T RUN. YOUR SAFETY PATROL." },
      ],
      banter: B('[grin] Safety Patrol. Narcs with sashes.', '[smirk] You were Safety Patrol, Danny. Fourth grade.',
        '[soft_smile] The belts glowed in the dark. That was the whole appeal.', 3) },
    { id: 'w1_bulletin', type: 'bulletin_board', x: 15, y: 12, state: 'bell_schedule', doc: 'bell_schedule',
      examine: [
        { cond: from(6), text: "[exhausted] The bell schedule. I don't need to read it anymore." },
        { cond: from(2), text: '[worried] Four minutes passing. Then the bell. Then him.' },
        { cond: post, text: '[scared] He was right here. He was standing right here.' },
        { text: '[curious] A bell schedule. 1979.' },
      ],
      banter: B("[grin] Four minutes passing? I can't get to my locker in four minutes in *1996*.",
        '[talk] Look at the bottom. Founder\'s Day, early dismissal. They never got the early dismissal.',
        '[thoughtful] Assembly. One forty-five.', 0) },
    { id: 'w1_bench_board', type: 'bench', x: 17, y: 13 },
    { id: 'w1_locker_a', type: 'locker', x: 25, y: 13,
      examine: [...LOCKER_RULE, { text: '[n] Locked. Someone scratched a heart into the paint, then scratched it out.' }],
      banter: B("[grin] There's a 1979 Twinkie in one of these. Still good. Twinkies are forever.", "[deadpan] That's a myth, Danny.",
        '[neutral] Mine at Tabor still smells like valve oil.', 1) },
    { id: 'w1_extinguisher', type: 'fire_extinguisher', x: 27, y: 12,
      examine: by('[n] INSPECTED 6/79. Nobody came back to inspect it again.', '[n] INSPECTED 6/79.'),
      banter: B('[grin] In case of fire: extinguish.', '[deadpan] Profound.', "[neutral] Gauge is still in the green. Huh.", 2) },
    { id: 'w1_graffiti_hh', type: 'graffiti', x: 28, y: 12, state: 'hollowhell',
      examine: by("[skeptical] HOLLOW HELL, in spray paint. Somebody's older brother.", '[worried] HOLLOW HELL. {p} They had no idea.', '[n] HOLLOW HELL.'),
      banter: B("[grin] That's art, Dolan. That's the Sistine Chapel of Schuylkill County.", '[deadpan] They spelled both words right. Low bar. Cleared.',
        '[neutral] My cousin said kids used to dare each other just to touch the front doors.', 3) },
    { id: 'w1_bench_mid', type: 'bench', x: 29, y: 13 },
    { id: 'w1_hall_drawings', type: 'drawings_wall', x: 33, y: 12,
      examine: by('[n] Paper pumpkins taped up outside the door, one per kid, names in fat crayon.',
        '[sad] Paper pumpkins. They never got to take them home.', '[sad] They never got to take them home.'),
      banter: B('[grin] I made one of those. Mine had fangs. Mrs. Pellack called my mom.',
        '[deadpan] Halloween was twelve days off. They were ahead of schedule.',
        "[soft_smile] Somebody drew a cat. Or a horse. It's a horse-cat.", 0) },
    { id: 'w1_bench_101', type: 'bench', x: 40, y: 13 },
    { id: 'w1_locker_b', type: 'locker', x: 43, y: 13, state: 'dented',
      examine: [...LOCKER_RULE, { text: '[n] Dented in at knee height, like someone kicked it on the way out and kept walking.' }],
      banter: B("[talk] That's a Kovach kick. I know my family's work.", '[deadpan] Your family was kicking lockers in 1979?',
        '[thoughtful] Somebody was in a hurry.', 1) },
    { id: 'w1_graffiti_kr', type: 'graffiti', x: 50, y: 12, state: 'kr91',
      examine: by("[n] KR '91. A flattened Yuengling can under it, like a signature.", "[worried] KR '91 got this far and turned around. Smart.",
        "[sad] KR '91 went home."),
      banter: B("[talk] Class of '91. Legends. They made it as far as the girls' room.", '[smirk] Further than most.',
        "[soft_smile] Yuengling. Your Uncle Frank's been here, Danny.", 2) },
    { id: 'w1_bench_e', type: 'bench', x: 51, y: 13 },
    { id: 'w1_bench_lobby', type: 'bench', x: 56, y: 13 },
    { id: 'w1_clock_e', type: 'clock_hall', x: 53, y: 12,
      examine: by('[n] Twenty to two. Same as the other one.', '[worried] Twenty to two.', "[scared] Twenty to two. I can't stop checking."),
      banter: B("[talk] Maybe it's right and we're wrong. Like, cosmically.", '[deadpan] Put that on your SATs.',
        "[neutral] Both of them are ticking. Somebody's keeping them together.", 3) },
    { id: 'w1_banner', type: 'banner', x: 55, y: 12, state: 'founders',
      examine: by("[n] A painted paper banner: FOUNDER'S DAY — OCT. 19. The paint ran in the damp.",
        "[worried] October nineteenth. {p} I don't know if it's the nineteenth yet. I don't know what time it is.",
        "[n] FOUNDER'S DAY — OCT. 19."),
      banter: B("[grin] Founder's Day. When you find stuff. That's the holiday.", "[deadpan] It's homecoming, Danny. Same day every year.",
        "[thoughtful] ...That's tomorrow.", 0) },
    { id: 'w1_exit_lobby', type: 'exit_sign', x: 60, y: 12, state: 'on',
      examine: by('[n] EXIT. Toward the lobby and the front doors.', '[worried] It points at the front doors. The front doors point back here.',
        "[n] EXIT. It doesn't mean it."),
      banter: B('[talk] See? Exit. We can leave whenever we want.', '[deadpan] Comforting.', "[neutral] That one's steady, at least.", 2) },
    // corridor floor: decay, draughts, the seam's damp
    { type: 'cobweb', x: 2, y: 13 },
    { type: 'decal_leaves', x: 2, y: 16 },
    { type: 'decal_leaves', x: 3, y: 17 },
    { type: 'cicada_shells', x: 7, y: 18 },
    { type: 'decal_tiles', x: 13, y: 16 },
    { type: 'decal_glass', x: 19, y: 17 },
    { type: 'decal_papers', x: 21, y: 14 },
    { type: 'decal_stain', x: 25, y: 16 },
    { type: 'decal_stain', x: 24, y: 17 },
    { type: 'decal_tiles', x: 31, y: 15 },
    { type: 'decal_stain', x: 39, y: 16 },
    { type: 'decal_tiles', x: 46, y: 14 },
    { type: 'decal_papers', x: 47, y: 16 },
    { type: 'decal_leaves', x: 58, y: 17 },
    { type: 'decal_leaves', x: 60, y: 15 },

    // ======================================================== library doors (west wall, x 1)
    { id: 'w1_library_doors', type: 'door_side', x: 1, y: 15, state: 'jammed', label: 'LIBRARY',
      lock: (s) => !F(s).library_door_open, lockedText: libraryDoorsText, unlockSfx: 'door_creak_slow',
      to: { map: 'library', anchor: 'from_west1' } },
    { id: 'w1_library_doors_b', type: 'door_side', x: 1, y: 16, state: 'jammed', label: 'LIBRARY',
      lock: (s) => !F(s).library_door_open, lockedText: libraryDoorsText, unlockSfx: 'door_creak_slow',
      to: { map: 'library', anchor: 'from_west1' } },

    // ======================================================== 103 (Ch2 heads-down room)
    // two board panels: the 1979 view reads across them, FOUNDER'S DAY — | ASSEMBLY 1:45
    { id: 'w1_chalk_103', type: 'chalkboard', x: 6, y: 2, state: 'text', text: '', params: { text1979: "FOUNDER'S DAY —" },
      examine: by('[n] Wiped. The ghost of the last lesson is still there under the eraser swipes.', '[worried] Blank. Like nothing happened in here.',
        '[sad] Leah sat right there.'),
      banter: B("[grin] Detention. 'I will not haunt the school,' a hundred times.", '[deadpan] Somebody erased it in a hurry. Look at the swipes.',
        "[thoughtful] Feels like they're coming back after lunch.", 1) },
    { id: 'w1_chalk_103_b', type: 'chalkboard', x: 9, y: 2, state: 'text', text: '', params: { text1979: 'ASSEMBLY 1:45' },
      examine: by('[n] Wiped clean.', '[worried] Blank.') },
    { type: 'flag_us', x: 5, y: 2 },
    { id: 'w1_103_clock', type: 'clock_wall', x: 14, y: 2 },
    { type: 'radiator', x: 3, y: 3 },
    { type: 'radiator', x: 12, y: 3 },
    { id: 'w1_103_cardigan', type: 'chair_teacher', x: 7, y: 3, dir: 'down', noSit: true,
      examine: by("[n] A gray cardigan over the back of the teacher's chair. Moth holes like a map of somewhere.",
        '[sad] Somebody meant to come back for it.', "[sad] It looks like Leah's."),
      banter: B('[grin] Leah. Your sweater.', '[annoyed] Mine has *fewer* holes.', '[neutral] Somebody meant to come back for that.', 2) },
    { id: 'w1_103_desk', type: 'desk_teacher', x: 7, y: 4,
      examine: by('[n] A grade book. Attendance checked off every day through October 19th. After that, empty columns.',
        '[n] Attendance through the nineteenth. Then nothing.', '[n] Then nothing.'),
      banter: B('[grin] No grades after the nineteenth. Best semester ever.', '[talk] Danny.',
        "[thoughtful] In pen. They did attendance in pen. Couldn't erase it.", 3) },
    { id: 'w1_103_books', type: 'bookshelf_low', x: 10, y: 3,
      examine: by('[n] *Our Pennsylvania*, 1971 edition. Chapter one is anthracite. Somebody gave William Penn a mustache.',
        '[n] *Our Pennsylvania*. Chapter one: coal.'),
      banter: B('[grin] That was me. Retroactively.', '[deadpan] Penn had no mustache. Historically.', '[soft_smile] Suits him.', 0) },
    // front row: Leah · Tess · Marcus (anchors desk_103_* are the aisle cells right below)
    { id: 'w1_desk_103_leah', type: 'desk_student', x: 5, y: 6,
      examine: [
        { cond: (s) => !!F(s).ch2_leah_taken, text: '[sad] A clean rectangle in the dust, where the camcorder sat.' },
        { text: "[n] Carved in the desktop: CLASS OF '84 RULES." },
      ] },
    { id: 'w1_desk_103_tess', type: 'desk_student', x: 7, y: 6 },
    { id: 'w1_desk_103_marcus', type: 'desk_student', x: 9, y: 6 },
    { type: 'desk_student', x: 11, y: 6 },
    { type: 'desk_student', x: 13, y: 6 },
    { type: 'trash_can', x: 2, y: 9 },
    { type: 'decal_papers', x: 4, y: 7 },
    { type: 'decal_stain', x: 13, y: 4 },

    // ======================================================== 102 (scattered → rows; the board fills)
    { type: 'radiator', x: 16, y: 3 },
    { type: 'radiator', x: 29, y: 3 },
    // panel 1 — DANIEL KOVACH
    { id: 'w1_chalk_102_blank', type: 'chalkboard', x: 18, y: 2, state: 'blank', cond: (s) => !F(s).ch1_102_rows,
      examine: [{ cond: (s) => s.chapter <= 1, text: '[n] A long board, four panels, wiped clean.' }, { text: '[n] Wiped clean.' }],
      banter: B('[grin] Blank slate. Like my permanent record.', '[deadpan] Your permanent record is *not* blank, Danny.',
        '[thoughtful] Four boards for one room. Big class.', 1) },
    { id: 'w1_chalk_102', type: 'chalkboard', x: 18, y: 2, state: 'text', text: 'DANIEL KOVACH — PRESENT', cond: (s) => !!F(s).ch1_102_rows,
      examine: [
        { cond: from(6), text: '[n] DANIEL KOVACH — PRESENT.' },
        { cond: from(2), text: ["[n] DANIEL KOVACH — PRESENT.", "[sad] He can't spell present."] },
        { text: ['[n] DANIEL KOVACH — PRESENT.', "[scared] Fresh chalk. The dust's still falling off the tray."] },
      ] },
    // panel 2 — LEAH BRANDT
    { id: 'w1_chalk_102_p2', type: 'chalkboard', x: 21, y: 2, state: 'blank', cond: (s) => !F(s).ch2_leah_taken },
    { id: 'w1_chalk_102_leah', type: 'chalkboard', x: 21, y: 2, state: 'text', text: 'LEAH BRANDT — PRESENT', cond: (s) => !!F(s).ch2_leah_taken,
      examine: [
        { cond: from(6), text: '[n] LEAH BRANDT — PRESENT.' },
        { text: ['[n] LEAH BRANDT — PRESENT.', '[sad] They spelled Brandt right. Nobody spells Brandt right.'] },
      ] },
    // panel 3 — THERESA DOLAN (by her answer at roll #1)
    { id: 'w1_chalk_102_p3', type: 'chalkboard', x: 24, y: 2, state: 'blank', cond: (s) => !F(s).roll1_done },
    { id: 'w1_chalk_102_tess_a', type: 'chalkboard', x: 24, y: 2, state: 'text', text: 'THERESA DOLAN — ABSENT',
      cond: (s) => !!F(s).roll1_done && !F(s).roll1_answered,
      examine: [
        { cond: alone, text: ['[n] THERESA DOLAN — ABSENT.', '[scared] Good. Keep it that way.'] },
        { text: ['[n] THERESA DOLAN — ABSENT.', '[skeptical] Nobody calls me Theresa.'] },
      ] },
    { id: 'w1_chalk_102_tess_p', type: 'chalkboard', x: 24, y: 2, state: 'text', text: 'THERESA DOLAN — PRESENT',
      cond: (s) => !!F(s).roll1_done && !!F(s).roll1_answered,
      examine: [
        { cond: alone, text: ['[n] THERESA DOLAN — PRESENT.', "[scared] It's chalk. Chalk comes off. Chalk comes off."] },
        { text: ['[n] THERESA DOLAN — PRESENT.', '[horrified] I said here. I just— I said *here*.'] },
      ] },
    // panel 4 — MARCUS WEBB
    { id: 'w1_chalk_102_p4', type: 'chalkboard', x: 27, y: 2, state: 'blank', cond: (s) => !F(s).ch6_marcus_taken },
    { id: 'w1_chalk_102_marcus', type: 'chalkboard', x: 27, y: 2, state: 'text', text: 'MARCUS WEBB — PRESENT', cond: (s) => !!F(s).ch6_marcus_taken,
      examine: ['[n] MARCUS WEBB — PRESENT.', '[devastated] He never answered. Not once.'] },
    { id: 'w1_102_desk', type: 'desk_teacher', x: 22, y: 4,
      examine: by("[n] A lunch tray, fish sticks fossilized to it. Under it, spelling tests dated the nineteenth. All A's. Never handed back.",
        "[n] Spelling tests. All A's. Never handed back."),
      banter: B("[grin] All A's, never handed back. That's the saddest thing I've ever heard.", '[talk] They took a test the morning of. Then the assembly.',
        '[sad] Somebody got an A and never knew.', 2) },
    { id: 'w1_battery_102', type: 'pickup', x: 23, y: 4, item: 'battery', examine: "[relieved] A D-cell in the drawer. Still sealed." },
    { type: 'chair_teacher', x: 22, y: 3, dir: 'down' },
    { id: 'w1_102_globe', type: 'globe', x: 16, y: 9,
      examine: by('[n] A globe. The U.S.S.R. is still a big pink continent of its own.', '[n] A globe. It stopped on Pennsylvania.'),
      banter: B('[grin] Dolan. The U.S.S.R. Classic.', "[deadpan] Hasn't existed for five years.", '[soft_smile] Nobody told this room.', 3) },
    { type: 'trash_can', x: 30, y: 9 },
    // scattered set (Ch1 until the vanish rearranges the room)
    { id: 'w1_102_s1', type: 'desk_student', x: 17, y: 5, state: 'scattered', cond: (s) => !F(s).ch1_102_rows },
    { id: 'w1_102_s2', type: 'desk_student', x: 19, y: 7, state: 'overturned', noSit: true, cond: (s) => !F(s).ch1_102_rows },
    { id: 'w1_102_s3', type: 'desk_student', x: 21, y: 6, state: 'scattered', cond: (s) => !F(s).ch1_102_rows },
    { id: 'w1_102_s4', type: 'desk_student', x: 24, y: 5, state: 'scattered', cond: (s) => !F(s).ch1_102_rows },
    { id: 'w1_102_s5', type: 'desk_student', x: 25, y: 7, state: 'overturned', noSit: true, cond: (s) => !F(s).ch1_102_rows,
      examine: by('[skeptical] Desks everywhere, a couple knocked flat. Like everyone left at once.'),
      banter: B('[grin] Fire drill. Seventeen years long.', '[talk] Like they all stood up at the same time.', '[thoughtful] ...Yeah.', 0) },
    { id: 'w1_102_s6', type: 'desk_student', x: 27, y: 8, state: 'scattered', cond: (s) => !F(s).ch1_102_rows },
    { id: 'w1_102_s7', type: 'desk_student', x: 28, y: 5, state: 'scattered', cond: (s) => !F(s).ch1_102_rows },
    { id: 'w1_102_s8', type: 'desk_student', x: 18, y: 8, state: 'scattered', cond: (s) => !F(s).ch1_102_rows },
    { id: 'w1_102_s9', type: 'desk_student', x: 23, y: 8, state: 'scattered', cond: (s) => !F(s).ch1_102_rows },
    { id: 'w1_102_s10', type: 'desk_student', x: 29, y: 7, state: 'overturned', noSit: true, cond: (s) => !F(s).ch1_102_rows },
    { id: 'w1_102_s11', type: 'desk_student', x: 26, y: 6, state: 'scattered', cond: (s) => !F(s).ch1_102_rows },
    { type: 'decal_papers', x: 20, y: 6, cond: (s) => !F(s).ch1_102_rows },
    { type: 'decal_papers', x: 26, y: 8, cond: (s) => !F(s).ch1_102_rows },
    // rows set (from ch1_102_rows: two perfect rows of six, the door aisle kept clear)
    ...[18, 22, 24, 26, 28].flatMap((x) => [6, 8].map((y) => ({ id: `w1_102_r${x}_${y}`, type: 'desk_student', x, y, cond: (s) => !!F(s).ch1_102_rows }))),
    { id: 'w1_102_r20_6', type: 'desk_student', x: 20, y: 6, cond: (s) => !!F(s).ch1_102_rows },

    // ======================================================== 101 kindergarten
    { type: 'radiator', x: 33, y: 3 },
    { id: 'w1_drawings', type: 'drawings_wall', x: 36, y: 2, doc: 'kinder_drawings',
      examine: by('[n] Crayon drawings, under a paper sign: WHEN I GROW UP.', "[worried] The drawings. 'He knows my name.'", '[scared] He knows all their names.'),
      banter: B("[grin] 'Nap and milk and kickball.' Melissa K. had it figured out.", "[worried] Who's the big man with the medals?",
        "[sad] She crossed out 'go home.'", 1) },
    { type: 'alphabet_strip', x: 38, y: 2 },
    { id: 'w1_101_clock', type: 'clock_wall', x: 41, y: 2 },
    { id: 'w1_cubbies', type: 'cubbies', x: 35, y: 3,
      examine: by("[n] Cubbies. Name strips: JASON. AMY. MELISSA K. There's a mitten in one, and it's damp.", "[worried] The mitten's still damp.",
        '[sad] JASON. AMY. MELISSA K.'),
      banter: B('[grin] Frank peaked in a cubby, Dolan. Peaked.',
        '[talk] These kids would be twenty-two now.', '[thoughtful] Hope they got out of Kettle Run.', 2) },
    { type: 'cubbies', x: 37, y: 3 },
    { id: 'w1_battery_101', type: 'pickup', x: 38, y: 3, item: 'battery', examine: "[relieved] A battery in the last cubby, under a mitten. Somebody's flashlight money." },
    { id: 'w1_piano', type: 'piano', x: 42, y: 3,
      examine: by('[n] An upright piano, lid up. On the stand, in marker: ALMA MATER — FOR THE LITTLE ONES.', '[worried] The alma mater, still open on the stand.',
        "[scared] Still open on the stand. Like they're coming back to sing it."),
      banter: B("[grin] I can play Chopsticks. That's my whole range.", "[deadpan] We've heard your range.", '[thoughtful] My grandmother still sings that one.', 3) },
    { id: 'w1_tiny_table', type: 'tiny_table', x: 35, y: 5,
      examine: by('[n] A low table. Crayon wax ground into every groove.', '[n] A table for very small people.'),
      banter: B('[talk] Dolan. Look how tiny everything is. *Look* at it.', '[smirk] You were tiny once, Danny. Allegedly.', '[soft_smile] Bet you were a biter.', 0) },
    { type: 'tiny_chair', x: 35, y: 6 },
    { type: 'tiny_chair', x: 36, y: 6 },
    { type: 'tiny_table', x: 39, y: 5 },
    { type: 'tiny_chair', x: 39, y: 6 },
    // Danny wedges into this one (Ch1 only); afterwards it's an ordinary tiny chair.
    { id: 'w1_tiny_chair', type: 'tiny_chair', x: 40, y: 6, script: 'ch1.tiny_chair',
      cond: (s) => s.chapter <= 1 && !F(s).ch1_danny_vanished && !F(s).ch1_danny_stuck },
    { id: 'w1_tiny_chair_after', type: 'tiny_chair', x: 40, y: 6,
      cond: (s) => !(s.chapter <= 1 && !F(s).ch1_danny_vanished && !F(s).ch1_danny_stuck),
      examine: [{ cond: (s) => !!F(s).ch1_danny_stuck, text: "[sad] The chair Danny got stuck in. He wasn't stuck. He was a little stuck." }, { text: '[n] A tiny chair.' }] },
    { type: 'tiny_table', x: 35, y: 8 },
    { type: 'tiny_chair', x: 35, y: 9 },
    { type: 'tiny_chair', x: 36, y: 9 },
    { type: 'tiny_table', x: 40, y: 8 },
    { type: 'tiny_chair', x: 40, y: 9 },
    { type: 'tiny_chair', x: 41, y: 9 },
    { type: 'chair_teacher', x: 33, y: 7, dir: 'down' },
    { type: 'decal_papers', x: 38, y: 7 },
    { type: 'decal_leaves', x: 44, y: 5 },

    // ======================================================== girls' restroom (no seats)
    { type: 'hand_dryer', x: 46, y: 2 },
    { id: 'w1_rr_mirror', type: 'mirror', x: 47, y: 2, state: 'grimy',
      examine: [
        { cond: (s) => !!F(s).adair_met, text: "[sad] Just me. She isn't in this one." },
        { cond: from(2), text: "[worried] I don't look in mirrors in here. I look anyway." },
        { text: '[n] Grimy. My face is a smudge with hair.' },
      ],
      banter: B("[grin] I've never been in here. This is a big moment for me.", '[deadpan] Out, Danny.', "[neutral] I'll be in the hall.", 1) },
    { type: 'mirror', x: 48, y: 2, state: 'cracked' },
    { type: 'sink', x: 47, y: 3 },
    { id: 'w1_rr_sink', type: 'sink', x: 48, y: 3,
      examine: by('[n] Rust rings. The tap coughs once and gives up.', '[n] The basin is wet. The tap is dry.'),
      banter: B('[talk] Five stars. Would haunt again.', "[deadpan] Water's been off since the buyout.", "[worried] Then why's the basin wet?", 2) },
    { type: 'stall', x: 51, y: 3 },
    { id: 'w1_rr_stall', type: 'stall', x: 52, y: 3,
      examine: by("[n] Names on the stall door, decades of them. One's cut in deep: SIT DOWN WHEN THE BELL GOES.",
        '[scared] SIT DOWN WHEN THE BELL GOES. {p} Somebody knew.', '[n] SIT DOWN WHEN THE BELL GOES.'),
      banter: B('[grin] Bathroom wisdom. Timeless.', '[talk] Somebody really wanted that one to last.', '[thoughtful] ...Huh.', 3) },
    { type: 'stall', x: 53, y: 3 },
    { type: 'trash_can', x: 46, y: 8 },
    { type: 'decal_stain', x: 49, y: 6 },
    { type: 'decal_glass', x: 48, y: 4 },
    { type: 'decal_papers', x: 51, y: 6 },
    { type: 'decal_stain', x: 51, y: 8 },

    // ======================================================== collapsed west stairwell
    { id: 'w1_stair_pentagram', type: 'graffiti', x: 3, y: 20, state: 'pentagram',
      examine: by('[skeptical] A pentagram. Badly drawn. One of the points is a smiley face.',
        '[worried] Somebody thought this place needed help being scary.', '[n] A pentagram. Paint. Just paint.'),
      banter: B("[grin] Satan's got awful penmanship.", '[deadpan] It has six points.', '[neutral] My grandmother would have a fit.', 0) },
    { id: 'w1_stair_exit', type: 'exit_sign', x: 8, y: 20, state: 'dead',
      examine: by('[n] EXIT. {p} Not anymore.'),
      banter: B("[talk] Emergency exit. As in, it's an emergency, and there's no exit.", "[smirk] That's going on the next cover of STATIC.",
        '[worried] This whole side could come down. Stay off the pile.', 1) },
    { id: 'w1_stair_foot', type: 'decal_tiles', x: 11, y: 27,
      examine: by("[n] The stairs go up three steps. Then they're the ceiling.", '[n] Three steps. Then ceiling.'),
      banter: B('[grin] Stairway to heaven. Partial.', "[talk] The landing came down in '84. Mom said nobody got hurt.",
        "[thoughtful] It went up to the same spot on two. There'd be a hole up there.", 2) },
    { id: 'w1_stair_shells', type: 'cicada_shells', x: 3, y: 25,
      examine: by('[n] Cicada shells, washed in through the hole. Dozens. All facing the same way.',
        '[worried] All facing the same way. Toward the hall.', '[n] Empty shells. Facing the hall.'),
      banter: B('[nervous] Bugs. Dead bugs. Cool. Cool cool cool.', "[talk] Not dead. Empty. They climb out and leave the shell.",
        "[neutral] Every one's pointed at the door.", 3) },
    { type: 'graffiti', x: 5, y: 20, state: 'names' },
    { type: 'decal_glass', x: 8, y: 22 },
    { type: 'decal_leaves', x: 6, y: 27 },
    { type: 'decal_leaves', x: 2, y: 23 },
    { type: 'decal_tiles', x: 7, y: 24 },
    { type: 'decal_tiles', x: 9, y: 26 },
    { type: 'cobweb', x: 2, y: 21 },

    // ======================================================== A.V. / Safety Patrol
    { id: 'w1_patrol_hooks', type: 'coat_hooks', x: 15, y: 20,
      examine: [
        { cond: from(6), text: "[scared] HOYT — CAPT. Still empty. He's still wearing it." },
        { cond: (s) => s.chapter >= 2 || post(s), text: ['[n] Name tags over the hooks. Orange belts on most. Two empty: YANCEY. HOYT — CAPT.', '[scared] Orange. Down the hall, right before— it was orange.'] },
        { text: '[n] Hooks with name tags. Orange Safety Patrol belts hang on most of them. Two hooks are empty: YANCEY. HOYT — CAPT.' },
      ],
      banter: B('[grin] Safety Patrol HQ. I wanted a belt so bad.', '[talk] Hoyt. Yancey. Those are on the memorial. Two of the Nine.',
        "[worried] They never hung them back up.", 0) },
    { id: 'w1_patrol_posts', type: 'bulletin_board', x: 21, y: 20, state: 'generic',
      examine: by("[n] PATROL POSTS — FOUNDER'S DAY ASSEMBLY. Under WEST HALL, one name: K. HOYT.",
        "[scared] WEST HALL — K. HOYT. {p} He's still at his post.", "[scared] He's still at his post."),
      banter: B('[talk] Posts. Like guards. Fourth graders with *posts*.', '[deadpan] Give a kid a belt, Danny.', "[thoughtful] West hall. That's this one.", 1) },
    { id: 'w1_av_projector', type: 'projector', x: 16, y: 23,
      examine: by("[n] An overhead projector. A transparency still on the glass: FIRE DRILL — WEST STAIRS — WALK, DON'T RUN.",
        "[n] FIRE DRILL — WEST STAIRS — WALK, DON'T RUN."),
      banter: B("[grin] Walk, don't run. Even the fires were strict.", "[talk] The A.V. club would've killed for my dad's camcorder.",
        '[neutral] West stairs. Not anymore.', 2) },
    { type: 'desk_teacher', x: 20, y: 23 },
    { id: 'w1_av_films', type: 'shelf_metal', x: 23, y: 22,
      examine: by('[n] Film cans. DUCK AND COVER. ANTHRACITE: OUR BLACK DIAMOND. YOUR TEETH AND YOU.', "[n] Film cans. Nobody's watching anything anymore."),
      banter: B('[grin] *Your Teeth and You.* The horror.', "[smirk] I'd screen *Black Diamond* for the zine. Ironically.",
        '[neutral] We watched the anthracite one every year at Tabor. Every year.', 3) },
    { id: 'w1_av_slickers', type: 'coat_rack', x: 24, y: 27,
      examine: by('[n] Yellow rain slickers. PATROL stenciled on the backs. Small sizes.', '[sad] Small sizes.'),
      banter: B('[talk] Rain gear for crossing guards. In a school.', "[deadpan] There's a road out front, Danny. Route 61.", "[sad] They're so small.", 0) },
    { type: 'trash_can', x: 15, y: 28 },
    { type: 'decal_glass', x: 19, y: 21 },
    { type: 'decal_papers', x: 21, y: 25 },

    // ======================================================== nurse
    { id: 'w1_eye_chart', type: 'eye_chart', x: 27, y: 20,
      examine: "[n] E. F P. T O Z. The bottom line's too small for anyone." },
    { id: 'w1_nurse_shelf', type: 'shelf_med', x: 29, y: 21, script: 'ch4.jar' },
    { type: 'sink', x: 31, y: 21 },
    { id: 'w1_nurse_cot', type: 'cot', x: 26, y: 24,
      examine: by("[n] A cot. The paper sheet is folded down like somebody's coming back to lie on it.") },
    { type: 'office_chair', x: 29, y: 25 },
    { type: 'office_desk', x: 29, y: 26 },
    { id: 'w1_clipping', type: 'note_paper', x: 29, y: 26, doc: 'clipping',
      examine: '[n] A newspaper clipping, tucked under the blotter.',
      banter: M("[sad] 'Rose in the dark to help.' {p} Grandma says that's what Denise would do.") },
    { type: 'trash_can', x: 31, y: 28 },

    // ======================================================== reception (main office)
    { id: 'w1_mailboxes', type: 'mailboxes', x: 39, y: 20, script: 'ch4.mailbox' },
    { id: 'w1_reception_clock', type: 'clock_wall', x: 42, y: 20,
      examine: by('[n] The office clock.', '[worried] Twenty to two. In here too.') },
    { type: 'plant_dead', x: 33, y: 21 },
    { id: 'w1_office_bench', type: 'bench', x: 36, y: 21 },
    { type: 'office_chair', x: 38, y: 21 },
    { id: 'w1_counter', type: 'counter', x: 36, y: 24,
      examine: [
        { cond: (s) => !!F(s).safe_open, text: "[determined] The empty hook. WITHDRAWN. It's in my bag." },
        { text: "[n] A brass bell and a rack of rubber stamps: PRESENT. ABSENT. TARDY. EXCUSED. One hook's empty." },
      ],
      banter: M('[thoughtful] Somebody took one.') },
    { id: 'w1_signout', type: 'note_paper', x: 37, y: 24, doc: 'signout', script: 'ch4.signout' },
    { id: 'w1_cooler', type: 'water_cooler', x: 33, y: 22, examine: "[n] The jug's empty. A ring of green at the bottom." },
    { id: 'w1_records', type: 'filing_cabinet', x: 33, y: 27, doc: 'denise_file',
      examine: [{ cond: alone, text: "[sad] Her file. 'Somebody has to.'" }, { text: '[n] STUDENT RECORDS, A–Z. The W drawer is already open.' }],
      banter: M("[sad] 'Says somebody has to.' {p} Grandma says that. Every time she does something nobody asked her to.") },
    { type: 'filing_cabinet', x: 34, y: 27 },
    { id: 'w1_secretary_desk', type: 'office_desk', x: 37, y: 26,
      examine: by("[n] A typewriter, a letter still in it: 'Dear Parents, In observance of Founder's Day, all students will'— and it stops.",
        null, "[n] 'All students will.'"),
      banter: M('[neutral] ...Will what.') },
    { id: 'w1_secretary_chair', type: 'office_chair', x: 37, y: 27, dir: 'up', sitDir: 'up' },
    { type: 'coat_rack', x: 42, y: 25 },
    { id: 'w1_lost_found', type: 'bookshelf_low', x: 40, y: 27,
      examine: [
        { cond: alone, text: '[sad] A clarinet reed, in a paper sleeve.' },
        { text: '[n] LOST & FOUND, in marker on masking tape. A mitten. A retainer case. One tap shoe. A clarinet reed in a paper sleeve.' },
      ],
      banter: M('[thoughtful] A reed. Somebody in band.') },
    { id: 'w1_battery_office', type: 'pickup', x: 41, y: 27, item: 'battery', examine: '[relieved] A battery in the lost and found. Somebody lost it in 1979. I found it.' },
    // the outer-office strip: the in-trouble chair outside Haupt's door (Denise, 1:20 p.m.)
    { id: 'w1_waiting_chair', type: 'office_chair', x: 46, y: 26, noSit: true,
      examine: [
        { cond: (s) => !!(s.docs && s.docs.haupt_letter), text: '[sad] He could see her shoes from his desk. From right there.' },
        { text: "[n] A chair outside the principal's door. The in-trouble chair." },
      ],
      banter: M("[soft_smile] I've sat in a few of those.") },
    { type: 'plant_dead', x: 43, y: 28 },
    { type: 'decal_papers', x: 44, y: 27 },

    // ======================================================== P.A. closet
    { id: 'w1_master_clock', type: 'master_clock', x: 44, y: 21,
      examine: by(['[n] The master clock. It rings every bell in the building.', "[worried] The pendulum isn't moving."]),
      banter: M("[worried] Then what's ringing them?") },
    { id: 'w1_pa', type: 'pa_console', x: 45, y: 21, examine: '[n] The intercom console. One red light: POWER.' },
    { id: 'w1_pa_chair', type: 'office_chair', x: 46, y: 22, dir: 'up', sitDir: 'up' },
    { id: 'w1_pa_map', type: 'poster', x: 47, y: 20, state: 'pa_map',
      examine: '[n] A floor plan with a little switch drawn next to every room. Even BOILER RM.' },
    { id: 'w1_pa_tubes', type: 'shelf_metal', x: 47, y: 24,
      examine: '[n] Spare fluorescent tubes, still in their sleeves.',
      banter: M('[thoughtful] For when it wakes up.') },

    // ======================================================== custodian's closet
    { type: 'cage_bulb', x: 57, y: 2, state: 'off' },
    { id: 'w1_valve', type: 'valve_wheel', x: 59, y: 2,
      examine: by("[n] A red valve wheel. Somebody painted SHUT on it, then OPEN, then SHUT.", '[n] A red valve wheel. SHUT.'),
      banter: B("[grin] Don't touch it. That's how you flood a school.", "[deadpan] Water's off, Danny.", "[neutral] Then why's the pipe sweating?", 0) },
    { id: 'w1_custodian_shelf', type: 'shelf_metal', x: 56, y: 3,
      examine: [
        { cond: (s) => !!(s.docs && s.docs.walt_log), text: ['[n] Work gloves, W.P. inked inside the cuffs.', '[sad] Walt. He kept his gloves here. Labeled.'] },
        { text: '[n] Light tubes. A can of floor wax. A pair of work gloves, W.P. inked inside the cuffs.' },
      ],
      banter: B('[talk] Janitor stuff. The janitor saw everything, man. Janitors always know.', "[deadpan] That's a movie, Danny.",
        "[thoughtful] He kept it neat. Labeled everything.", 1) },
    { id: 'w1_mop', type: 'mop_bucket', x: 59, y: 6,
      examine: by('[n] A mop bucket. The mop dried standing up, the shape of the bucket.', '[n] The mop. Still standing up.') },
    { type: 'pipe_v', x: 60, y: 4 },
    { type: 'pipe_v', x: 60, y: 5 },
    { type: 'pipe_v', x: 60, y: 6 },
    { type: 'decal_stain', x: 57, y: 7 },
    { type: 'cobweb', x: 56, y: 9 },

    // ======================================================== principal (Haupt)
    { type: 'flag_us', x: 51, y: 20 },
    { id: 'w1_haupt_portrait', type: 'portrait_small', x: 55, y: 20, script: 'ch6.portrait' },
    { id: 'w1_haupt_diploma', type: 'plaque', x: 58, y: 20,
      examine: '[n] A diploma. Bloomsburg State Teachers College, 1951. Gerald Robert Haupt.' },
    { id: 'w1_haupt_coat', type: 'coat_rack', x: 50, y: 21,
      examine: by('[n] A gray overcoat. G.R.H. stitched inside the collar. He left without it.', null, "[n] His coat. He never came back for it.") },
    { id: 'w1_haupt_chair', type: 'office_chair', x: 54, y: 22 },
    { id: 'w1_haupt_desk', type: 'office_desk', x: 54, y: 23,
      examine: by('[n] GERALD R. HAUPT, PRINCIPAL. A blotter, a dry fountain pen, a framed photo turned face down.', null,
        '[n] The blotter. The dry pen. The photo, still face down.'),
      banter: M('[neutral] Leave it face down.') },
    { id: 'w1_battery_haupt', type: 'pickup', x: 55, y: 23, item: 'battery', cond: from(6),
      examine: '[relieved] A battery in the desk drawer, behind the letterhead.' },
    { id: 'w1_discipline', type: 'filing_cabinet', x: 59, y: 21, doc: 'discipline',
      examine: '[n] DISCIPLINE, top drawer. Pink slips, rubber-banded by year.',
      banter: M("[scared] Tess. The last one. That's tonight.") },
    { type: 'plant_dead', x: 60, y: 21 },
    { type: 'office_chair', x: 53, y: 25, dir: 'up', sitDir: 'up' },
    { type: 'office_chair', x: 56, y: 25, dir: 'up', sitDir: 'up' },
    { id: 'w1_haupt_books', type: 'bookshelf_low', x: 58, y: 27,
      examine: [
        { cond: (s) => !!F(s).bond_leah, text: ['[n] *Pennsylvania School Code*, 1949.', '[determined] Withdrawals. Leah was right.'] },
        { text: "[n] *Pennsylvania School Code*, 1949. *Robert's Rules of Order*. A hymnal." },
      ] },
    { type: 'decal_stain', x: 51, y: 27 },
  ],

  doors: {
    '11,12': { id: 'w1_door_103', label: '103' },
    '20,12': { id: 'w1_door_102', label: '102' },
    '37,12': { id: 'w1_door_101', label: '101 — KINDERGARTEN' },
    '48,12': { id: 'w1_door_rr', label: 'GIRLS' },
    '31,5': { id: 'w1_cloak_door', label: 'CLOAKROOM' },
    '19,20': { id: 'w1_door_av', label: 'A.V. — SAFETY PATROL' },
    '34,20': { id: 'w1_office_door', type: 'door_glass', state: 'locked', label: 'MAIN OFFICE',
      lock: (s) => s.chapter >= 1 && !((s.inv && s.inv.keyring) > 0), lockedText: officeDoorText, unlockSfx: 'key_unlock' },
    '32,24': { id: 'w1_nurse_door', label: 'NURSE' },
    '43,23': { id: 'w1_pa_door', label: 'P.A.' },
    '49,27': { id: 'w1_haupt_door', label: 'PRINCIPAL' },
    '59,12': { id: 'w1_door_custodian', type: 'door_metal', label: 'CUSTODIAN' },
  },

  rooms: [
    { id: 'w1_hall', name: 'West Hall', rect: [1, 13, 61, 5], kind: 'hall' },
    { id: 'w1_room103', name: 'Room 103', rect: [2, 3, 13, 7], kind: 'classroom' },
    { id: 'w1_room102', name: 'Room 102', rect: [16, 3, 15, 7], kind: 'classroom' },
    { id: 'w1_room101', name: 'Room 101 — Kindergarten', rect: [32, 3, 13, 7], kind: 'classroom' },
    { id: 'w1_girls_rr', name: "Girls' Room", rect: [46, 3, 8, 7], kind: 'restroom' },
    { id: 'w1_custodian', name: 'Custodian', rect: [56, 3, 5, 7], kind: 'special' },
    { id: 'w1_stairwell', name: 'West Stairs (collapsed)', rect: [2, 18, 12, 11], kind: 'stair' },
    { id: 'w1_av', name: 'A.V. / Safety Patrol', rect: [15, 21, 10, 8], kind: 'special' },
    { id: 'w1_nurse', name: 'Nurse', rect: [26, 21, 6, 8], kind: 'office' },
    { id: 'w1_reception', name: 'Main Office', rect: [33, 21, 10, 8], kind: 'office' },
    { id: 'w1_outer', name: 'Outer Office', rect: [43, 26, 6, 3], kind: 'office' },
    { id: 'w1_pa_room', name: 'P.A. Room', rect: [44, 21, 5, 4], kind: 'office' },
    { id: 'w1_principal', name: "Principal's Office", rect: [50, 21, 11, 8], kind: 'office' },
  ],

  anchors: {
    from_lobby: [57, 15, 'left'],
    from_library: [3, 15, 'right'],
    library_end: [3, 15, 'right'],      // Ch1 seamless loop arrival (2 tiles out of the library doors)
    kevin_far: [2, 14, 'right'],        // Ch1: "far down the hall" in Tess's beam from the bulletin board
    danny_vanish: [17, 15, 'right'],
    bulletin: [15, 13, 'up'],
    door_103: [11, 13, 'up'],
    in_103: [11, 8, 'up'],
    desk_103_leah: [5, 7, 'up'],
    desk_103_tess: [7, 7, 'up'],
    desk_103_marcus: [9, 7, 'up'],
    door_102: [20, 13, 'up'],
    in_102: [20, 8, 'up'],
    in_101: [37, 8, 'up'],
    tiny_chair: [40, 7, 'up'],
    in_rr: [48, 8, 'up'],
    stairwell: [7, 22, 'down'],
    av_room: [19, 22, 'down'],
    door_office: [34, 17, 'down'],
    in_office: [34, 22, 'down'],
    office_bench: [36, 22, 'up'],
    counter: [37, 23, 'down'],
    kevin_glass: [22, 14, 'right'],    // "at the far end of the hall" as framed from the waiting bench
    nurse: [28, 23, 'down'],
    outer_office: [45, 27, 'right'],
    pa_console: [45, 22, 'up'],
    principal_portrait: [55, 21, 'up'],
    principal_desk: [55, 24, 'up'],
    colonel_fold_hall: [25, 17, 'right'], // in front of the seam in the hall's south wall (fold [25, 18])
  },

  exits: [
    { rect: [60, 13, 2, 5], to: 'lobby', anchor: 'from_west1' },
  ],

  triggers: [
    // Ch1 exploration (Leah's one line per room; the count gates the vanish)
    { id: 'room_enter_103', rect: [2, 3, 13, 7], script: 'ch1.room_enter', cond: pre },
    { id: 'room_enter_102', rect: [16, 3, 15, 7], script: 'ch1.room_enter', cond: pre },
    { id: 'room_enter_101', rect: [32, 3, 13, 7], script: 'ch1.room_enter', cond: pre },
    { id: 'room_enter_rr', rect: [46, 3, 8, 7], script: 'ch1.room_enter', cond: pre },
    // Danny breaks R3 by the bell schedule (DESIGN §6 I.4)
    { id: 'vanish', rect: [14, 13, 6, 5], script: 'ch1.danny_vanish',
      cond: (s) => {
        if (!pre(s) || !inParty('danny')(s)) return false;
        const n = F(s).ch1_rooms_entered || 0;
        const t0 = F(s).ch1_west1_t;
        return n >= 2 || (n >= 1 && typeof t0 === 'number' && (s.playtime || 0) - t0 > 90);
      } },
    // Desks in rows, DANIEL KOVACH — PRESENT
    { id: 'room102', rect: [16, 3, 15, 7], script: 'ch1.room102', cond: post },
    // Ch2: "Get in a room. Sit down. Now." — 103 is the only door left open
    { id: 'ch2_103', rect: [2, 3, 13, 7], script: 'ch2.sit', cond: (s) => s.chapter === 2 && !F(s).ch2_bell1 },
    // Ch4: the main office with the janitor's OFFICE key
    { id: 'office_first', rect: [33, 21, 10, 3], script: 'ch4.office_enter', cond: from(4) },
  ],

  lights: [
    // hall fluorescents (period only)
    { type: 'fluor', x: 4, y: 15, group: 'period' },
    { type: 'fluor', x: 12, y: 15, group: 'period' },
    { type: 'fluor', x: 20, y: 15, group: 'period' },
    { type: 'fluor', x: 28, y: 15, group: 'period' },
    { type: 'fluor', x: 36, y: 15, group: 'period' },
    { type: 'fluor', x: 44, y: 15, group: 'period' },
    { type: 'fluor', x: 52, y: 15, group: 'period', flicker: true },
    { type: 'fluor', x: 59, y: 15, group: 'period' },
    // rooms (period only)
    { type: 'fluor', x: 5, y: 6, group: 'period' },
    { type: 'fluor', x: 11, y: 6, group: 'period' },
    { type: 'fluor', x: 19, y: 6, group: 'period' },
    { type: 'fluor', x: 27, y: 6, group: 'period' },
    { type: 'fluor', x: 35, y: 6, group: 'period' },
    { type: 'fluor', x: 41, y: 6, group: 'period' },
    { type: 'fluor', x: 49, y: 6, group: 'period', flicker: true },
    { type: 'fluor', x: 19, y: 24, group: 'period' },
    { type: 'fluor', x: 28, y: 24, group: 'period' },
    { type: 'fluor', x: 37, y: 24, group: 'period' },
    { type: 'fluor', x: 46, y: 23, group: 'period' },
    { type: 'fluor', x: 55, y: 25, group: 'period' },
    // moonlight falling through the hole where the west stair landing was (a cold disc on the puddle)
    { type: 'spot', x: 4, y: 22, color: '#7f9cc4', intensity: 0.85, radius: 3.5, disc: 1.8, shadows: false },
  ],

  patrol: {
    nodes: {
      w: [3, 15], d103: [11, 15], board: [16, 15], d102: [20, 15], seam: [26, 15], off: [34, 15],
      d101: [37, 15], rr: [48, 15], e: [58, 15], rec: [34, 22], rec2: [39, 22],
    },
    edges: [['w', 'd103'], ['d103', 'board'], ['board', 'd102'], ['d102', 'seam'], ['seam', 'off'], ['off', 'd101'],
      ['d101', 'rr'], ['rr', 'e'], ['off', 'rec'], ['rec', 'rec2']],
    // wall seams: stair|A.V. (south), 103|102 behind the bulletin board, A.V.|nurse (south, seen from the
    // reception glass = colonel_fold_hall), 101|girls RR, girls RR|lobby pier
    folds: [[14, 18], [15, 12], [25, 18], [45, 12], [54, 12]],
    peeks: [
      { room: 'w1_room103', door: [11, 12], look: [11, 8] },
      { room: 'w1_room102', door: [20, 12], look: [20, 8] },
      { room: 'w1_room101', door: [37, 12], look: [37, 8] },
      { room: 'w1_girls_rr', door: [48, 12], look: [48, 7] },
      { room: 'w1_reception', door: [34, 20], look: [34, 22] },
    ],
  },

  past: [
    { id: 'principal_safe', rect: [50, 21, 11, 8], cond: from(6), setFlag: 'safe_seen_past',
      hint: "The portrait's swung open. There's a safe behind it.",
      objects: [{ type: 'portrait_small', x: 55, y: 20, state: 'open' }],
      hide: ['w1_haupt_portrait'],
      figures: [{ sprite: 'figure79', x: 54, y: 22, dir: 'down', anim: 'sit_down' }] }, // Haupt at his desk, the safe open behind him
    { id: 'reception_1979', rect: [33, 21, 16, 8],
      hint: "Twenty after one. Someone's signing the sheet.",
      objects: [{ type: 'clock_wall', x: 42, y: 20, params: { time: 1 + 20 / 60 } }],
      hide: ['w1_reception_clock'],
      figures: [
        { sprite: 'figure79', x: 37, y: 23, dir: 'down', anim: 'idle_down' },  // a woman at the counter, signing
        { sprite: 'figure79', x: 46, y: 26, dir: 'down', anim: 'sit_down' },   // around the corner, waiting
      ] },
    { id: 'room103_1979', rect: [2, 3, 13, 7],
      hint: "Every desk is taken. Except that one.",
      figures: [
        ...[[3, 6], [5, 6], [9, 6], [11, 6], [13, 6], [3, 8], [5, 8], [7, 8], [9, 8], [13, 8]].map(([x, y]) => ({ sprite: 'figure79', x, y, dir: 'up', anim: 'sit_up' })),
        { sprite: 'figure79', x: 8, y: 3, dir: 'down', anim: 'idle_down' },
      ] },
  ],
};
