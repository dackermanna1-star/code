// WEST HALL — SECOND FLOOR (west2) · 58×30 · offset (-2, 22) · 2F · CONTENT §2.10 · maps-D
//
// Ch5, Tess alone (Marcus "went around"). She comes out of the long hall at the EAST end (x 57) and
// hears it before she sees it: a faucet running at the far west end, by the library's mezzanine
// door. Same footprint and offset as west1, so every x here sits over the same x downstairs. Like
// east2, the upper floor was sealed (the gate, the collapsed stair): no graffiti, only 1979.
// Corridor on local rows 13–17 (world 35–39).
//
//   NORTH (exterior wall, windows), west → east:
//     girls' RR 2F (x 2–8; door x 3 left ajar; fogged mirror w2_mirror over the running tap —
//     trigger mirror_2f → ch5.mirror: Adair, the compact) · 201 (x 10–22: the False Leah's desk with
//     its back to the door, desk_201_tess beside it, a bare NW corner where the 1979 view shows the
//     mound; the hold-shut door w2_door_201; board DO NOT ERASE) · 202 history (x 24–36: OUR PROUD
//     HERITAGE, the Pennsylvania map; the Charter excerpt + brass placard hang in the corridor outside)
//     · cloakroom door 202↔203 (x 37, row 5) · 203 chemistry (x 38–49: benches, fume hood, eyewash,
//     the dark window, the 1979 board) · 204 prep (x 51–56, through 203 only: chem cabinets, battery).
//   SOUTH, west → east:
//     the collapsed WEST STAIR landing (x 2–13): a railed hole at x 3–6 (world 1–4) right over
//     west1's moonlit puddle, the broken top flight filled with rubble (world 8–10, over west1's
//     pile); moonlight falls through the roof and the hole · teachers' lounge (x 15–26: Adair's
//     cardigan, the duty roster, ashtrays) · supply closet (x 28–32) · BOARD ROOM (x 34–46: where the
//     endowment was confirmed every October; the minutes) · then the brick of the lobby block.
//   WEST END: library mezzanine door w2_mezz_door (x 1, row 15; lock !compact_unlocked, "Locked.
//     Behind me, a faucet is running.") → library/from_west2; arrival from_library.
//   EAST END (x 57): → longhall/from_west2; arrival from_longhall.
//
// Beats: mirror_2f → ch5.mirror (cond !adair_met) · room202 → ch5.room202 (first entry) · 201 threshold
// → ch5.false_leah (cond adair_met && !false_leah_done; checkpoint there) · past views rr2f_1979 (the
// compact tutorial), room201_1979 (her chair empty; the mound in the far corner), room202_1979,
// chem_1979 (FOUNDER'S DAY — NO CLASSES AFTER 1:30 — ASSEMBLY 1:45) · free periods: patrol graph,
// folds, peeks (201/202/203 + RR, lounge, board room), Kevin spots at both ends.
// Sound: the running tap wants a positional `faucet` loop at anchor `faucet` while !adair_met — see
// the `sounds` field below (engine support requested; scripts can do it on load meanwhile).
//
//   x →  0         1         2         3         4         5
//        0123456789012345678901234567890123456789012345678901234567

const F = (s) => s.flags || {};
const from = (n) => (s) => (s.chapter || 0) >= n;
const met = (s) => !!F(s).adair_met;
const leahDone = (s) => !!F(s).false_leah_done;

// Tess in Ch5 alone (scared, the odd dry line left) → Ch6+ literal.
const by = (c5, c6) => (c6 ? [{ cond: from(6), text: c6 }, { text: c5 }] : c5);

const MEZZ_TEXT = [
  { cond: (s) => !met(s), text: '[n] Locked. Behind me, a faucet is running.' },
  { text: ['[n] Locked.', '[worried] The tap stopped. When did the tap stop.'] },
];

export default {
  id: 'west2',
  name: 'West Hall — Second Floor',
  floor: '2F',
  offset: [-2, 22],
  ambience: 'hall',
  music: null,
  dark: 0.95,
  ambient: '#0b1020',
  tiles: [
    ' TTTTTTTTT################################################', //  0  north exterior wall (top)
    ' TTTTTTWTTWW#########WW#WW#########WW#WW########WW####W###', //  1  face_high · windows
    ' TTTTTTWTTWW#########WW#WW#########WW#WW########WW####W###', //  2  face_low (boards, mirrors)
    ' T_______T.............#.............#............#......#', //  3  girls RR | 201 | 202 | 203 | 204
    ' T_______T.............#.............#............D......#', //  4  203 → 204 prep
    ' T_______T.............#.............D............#......#', //  5  cloakroom 202 ↔ 203
    ' T_______T.............#.............#............#......#', //  6
    ' T_______T.............#.............#............#......#', //  7
    ' T_______T.............#.............#............#......#', //  8
    ' T_______T.............#.............#............#......#', //  9
    ' ##D################D#########D#############D#############', // 10  hall north wall: top
    ' ##D################D#########D#############D#############', // 11  face_high
    ' ##D################D#########D#############D#############', // 12  face_low (hall props)
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', // 13  corridor (world 35)
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', // 14
    ' D,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', // 15  mezzanine door (x 1) · → longhall (x 57)
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', // 16
    ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', // 17  (world 39)
    ' #######dd###########D########D########DD#######BBBBBBBBBB', // 18  south rooms' north wall: top
    ' #######dd###########D########D########DD#######BBBBBBBBBB', // 19  face_high
    ' #######dd###########D########D########DD#######BBBBBBBBBB', // 20  face_low
    ' #||||||ddssss#""""""""""""#:::::#"""""""""""""#          ', // 21  stair landing | lounge | supply | board room
    ' #|~~~d|dsvvss#""""""""""""#:::::#"""""""""""""#          ', // 22  the hole (world x 1–4) · broken top flight
    ' #|d~~d|ssvvds#""""""""""""#:::::#"""""""""""""#          ', // 23
    ' #|d~dd|dsXXXs#""""""""""""#:::::#"""""""""""""#          ', // 24  rubble over west1's pile
    ' #|dddd|sdXXdd#""""""""""""#:::::#"""""""""""""#          ', // 25
    ' #||||||sddsss#""""""""""""#:::::#"""""""""""""#          ', // 26
    ' #ssdssdsssdss#""""""""""""#:::::#"""""""""""""#          ', // 27
    ' #sssssssdssss#""""""""""""#:::::#"""""""""""""#          ', // 28
    ' ###############################################          ', // 29
  ],

  propLegend: { L: 'locker', d: 'desk_student', t: 'lab_stool' },
  propLayer: [
    '..........................................................', //  0
    '..........................................................', //  1
    '..........................................................', //  2
    '..........................................................', //  3
    '..........................................................', //  4
    '..........................................................', //  5
    '.............d.d.d.d.d...d.d.d.d.d.d.....tt....tt.........', //  6  201 front row · 202 front row · 203 stools
    '..........................................................', //  7
    '...........d.d.....d.....d.d.d.d.d.d.....tt....tt.........', //  8  201 back row (15 Leah, 17 Tess named) · 202 · 203 stools
    '..........................................................', //  9
    '..........................................................', // 10
    '..........................................................', // 11
    '..........................................................', // 12
    '...........L.LL.........L.L...........L.LL................', // 13  hall lockers (x 12, 25, 39 are objects)
    '..........................................................', // 14
    '..........................................................', // 15
    '..........................................................', // 16
    '..........................................................', // 17
    '..........................................................', // 18
    '..........................................................', // 19
    '..........................................................', // 20
    '..........................................................', // 21
    '..........................................................', // 22
    '..........................................................', // 23
    '..........................................................', // 24
    '..........................................................', // 25
    '..........................................................', // 26
    '..........................................................', // 27
    '..........................................................', // 28
    '..........................................................', // 29
  ],

  objects: [
    // ======================================================== corridor (north wall face row 12, floor)
    { id: 'w2_exit_lib', type: 'exit_sign', x: 2, y: 12, state: 'on',
      examine: by(['[n] EXIT, and an arrow at the library door.', "[skeptical] The library has a door up here. Of course it does. It's never the door you want."],
        '[n] EXIT. The library.') },
    { id: 'w2_bench_w', type: 'bench', x: 5, y: 13 },
    { id: 'w2_fountain', type: 'water_fountain', x: 7, y: 13,
      examine: by(["[n] Dry. Then I hear the tap down the hall still running, and the fountain's dry, and that's worse."], '[n] Dry.') },
    { id: 'w2_clock_w', type: 'clock_hall', x: 8, y: 12,
      examine: by(['[n] Twenty to two.', "[worried] I counted the clocks from the stairs. This one's the same. They're all the same."], '[n] Twenty to two.') },
    { id: 'w2_locker_a', type: 'locker', x: 12, y: 13,
      examine: by(["[n] A locker with a name strip: SZALAY. A yearbook-club sticker. A camera drawn in ballpoint.",
        "[worried] Not a hiding place. Marcus said seats. Marcus isn't here, and he's still right."], '[scared] No. Seats.') },
    { id: 'w2_retakes', type: 'bulletin_board', x: 15, y: 12, state: 'generic',
      examine: by(["[n] PICTURE RETAKES — MON. OCT. 22. Bring your form. A stack of forms is still pinned under the tack.",
        "[sad] Patty Szalay was on yearbook. She'd have been taking them."], '[n] PICTURE RETAKES — MON. OCT. 22.') },
    { id: 'w2_bench_201', type: 'bench', x: 17, y: 13 },
    { id: 'w2_poster_patrol', type: 'poster', x: 22, y: 12, state: 'patrol',
      examine: by(["[n] WALK — DON'T RUN. The kid on the poster has his hand up like he's stopping traffic.",
        "[scared] Like he's stopping me."], "[scared] Same belt.") },
    { id: 'w2_locker_b', type: 'locker', x: 25, y: 13, state: 'open',
      examine: by(['[n] Open. A Trapper Keeper, a lunch bag gone to paper, a photo of Shaun Cassidy taped inside the door.',
        "[sad] Somebody's whole Friday in one locker."], '[n] A Friday in a locker.') },
    // the Charter excerpt and its placard, outside 202 (CONTENT §2.10)
    { id: 'w2_charter_excerpt', type: 'plaque', x: 28, y: 12, doc: 'charter_excerpt',
      examine: by("[n] A page in a frame behind glass. FROM THE FOUNDER'S CHARTER. A little brass placard screwed to the frame.",
        "[n] The Charter excerpt. The rest is in the library."),
    },
    // a bench against the south wall, facing the Charter (seats within ~8 tiles of every hall tile)
    { id: 'w2_bench_s', type: 'bench', x: 25, y: 17, dir: 'up', sitDir: 'up' },
    { id: 'w2_clock_e', type: 'clock_hall', x: 32, y: 12,
      examine: by(['[n] Twenty to two.', '[worried] Downstairs, Marcus is looking at a clock like this. I hope.'], '[n] Twenty to two.') },
    { id: 'w2_banner_fd', type: 'banner', x: 33, y: 12, state: 'founders',
      examine: by(["[n] FOUNDER'S DAY, in navy and gold. Somebody painted the D's backwards and fixed them.",
        '[worried] Every kid in this hall helped paint his holiday.'], "[n] FOUNDER'S DAY.") },
    { id: 'w2_bench_mid', type: 'bench', x: 34, y: 13 },
    { id: 'w2_locker_c', type: 'locker', x: 39, y: 13, state: 'dented',
      examine: by(['[n] Dented in, a fist-sized dent. Then a smaller one beside it. Somebody tried again with the other hand.'], '[n] Dented.') },
    { id: 'w2_extinguisher', type: 'fire_extinguisher', x: 45, y: 12, examine: by('[n] INSPECTED 6/79.', '[n] INSPECTED 6/79.') },
    { id: 'w2_bench_203', type: 'bench', x: 46, y: 13 },
    { id: 'w2_periodic', type: 'poster', x: 48, y: 12, state: 'periodic',
      examine: by("[n] The periodic table. Somebody circled Pb in pencil and wrote LEAD = PENCIL? NO. Under it, in the teacher's red: SEE ME.",
        '[n] LEAD = PENCIL? NO.') },
    { id: 'w2_trophy', type: 'trophy_case', x: 51, y: 13,
      examine: by(["[n] SCIENCE FAIR — DISTRICT — 1978. A ribbon, a plaster volcano, a jar of Brood II nymphs with a blue ribbon on it.",
        "[worried] My face in the glass. Just mine. I wait to make sure."], '[n] The glass. Just me.') },
    { id: 'w2_bench_e', type: 'bench', x: 55, y: 13 },
    { id: 'w2_exit_long', type: 'exit_sign', x: 55, y: 12, state: 'on',
      examine: by(['[n] EXIT. It points back at the long hall.', "[scared] I'm not going back in there. Not without a pass. Not with one."], '[n] EXIT. No.') },
    { type: 'trash_can', x: 16, y: 17, examine: '[n] A wastebasket. A tardy slip, balled up: SZALAY, P. — 8:04 A.M. — EXCUSED.' },
    { type: 'decal_stain', x: 4, y: 16 },
    { type: 'decal_tiles', x: 10, y: 14 },
    { type: 'decal_papers', x: 18, y: 16 },
    { type: 'decal_stain', x: 23, y: 15 },
    { type: 'decal_tiles', x: 29, y: 17 },
    { type: 'decal_stain', x: 36, y: 16 },
    { type: 'decal_papers', x: 41, y: 14 },
    { type: 'decal_tiles', x: 49, y: 16 },
    { type: 'decal_stain', x: 54, y: 14 },
    { type: 'cobweb', x: 2, y: 13 },

    // ======================================================== library mezzanine door (west wall)
    { id: 'w2_mezz_door', type: 'door_side', x: 1, y: 15, state: 'locked', label: 'LIBRARY',
      lock: (s) => !F(s).compact_unlocked, lockedText: MEZZ_TEXT, unlockSfx: 'key_unlock',
      to: { map: 'library', anchor: 'from_west2' } },

    // ======================================================== girls' restroom 2F (no seats) — Adair
    { type: 'hand_dryer', x: 2, y: 2 },
    { id: 'w2_mirror', type: 'mirror', x: 4, y: 2, state: 'fogged',
      examine: [
        { cond: from(6), text: ['[n] The fog has gone out of it.', '[sad] Just me. She was here.'] },
        { cond: met, text: ['[n] Fogged again. No words this time. A handprint, low on the glass, like someone leaned on it to get up.', "[determined] Okay. The compact. I've got the compact."] },
        { text: ['[n] Fogged, like somebody ran a hot shower in here. Nobody ran a hot shower in here.', "[worried] I'm not wiping it. I'm not."] },
      ] },
    { type: 'mirror', x: 3, y: 2, state: 'grimy' },
    { type: 'mirror', x: 5, y: 2, state: 'cracked' },
    { type: 'sink', x: 3, y: 3 },
    { id: 'w2_faucet', type: 'sink', x: 4, y: 3,
      examine: [
        { cond: met, text: ['[n] The tap is shut. Bone dry. A ring of rust where the water would hit.', "[scared] It was running. I heard it from the long hall."] },
        { text: ["[n] The tap's running. A thin cold rope of water. The building's had no water since the buyout.", '[worried] I turn it. It keeps running.'] },
      ] },
    { type: 'sink', x: 5, y: 3 },
    { type: 'stall', x: 6, y: 6 },
    { id: 'w2_rr_stall', type: 'stall', x: 7, y: 6,
      examine: by(['[n] A stall door. Lipstick on the inside: C.A.M. + T.D. 4-EVER. And a date: 10/19/79 — HOMECOMING!!',
        '[sad] Carol Ann Mrazek and Tommy Delvecchio. Forever was a Friday.'], '[n] C.A.M. + T.D. 4-EVER.') },
    { type: 'stall', x: 8, y: 6 },
    { type: 'trash_can', x: 2, y: 9 },
    { type: 'decal_stain', x: 4, y: 5 },
    { type: 'decal_stain', x: 3, y: 7 },
    { type: 'decal_papers', x: 6, y: 9 },

    // ======================================================== 201 — the False Leah
    { type: 'radiator', x: 21, y: 3 },
    { id: 'w2_chalk_201', type: 'chalkboard', x: 14, y: 2, state: 'text', text: 'DO NOT ERASE', params: { text1979: 'DO NOT ERASE — ASSEMBLY NOTES' },
      examine: [
        { cond: leahDone, text: ['[n] DO NOT ERASE. Over nothing.', "[scared] I'm not going to. I'm not touching anything in here."] },
        { text: ["[n] DO NOT ERASE, in the corner of a board that's been erased.", '[worried] Then what was on it.'] },
      ] },
    { type: 'flag_us', x: 13, y: 2 },
    { id: 'w2_201_clock', type: 'clock_wall', x: 19, y: 2 },
    { id: 'w2_201_chair', type: 'chair_teacher', x: 17, y: 3, dir: 'down' },
    { id: 'w2_201_desk', type: 'desk_teacher', x: 17, y: 4,
      examine: by(["[n] An attendance folder. Period 6. Every name has a check mark through the nineteenth. Every one.",
        "[worried] The check marks are in pen. Then pencil. Then pen again, over the pencil."], '[n] Pen over pencil.') },
    // her desk (back row) with its back to the door; Tess's beside it. Anchors are the aisle cells south.
    { id: 'w2_desk_false_leah', type: 'desk_student', x: 15, y: 8, noSit: true,
      examine: [
        { cond: leahDone, text: ["[n] Her desk. The seat is warm. {p} It's warm.", "[scared] Leah's in the library. Leah's in the library. That wasn't her."] },
        { text: "[n] A desk in the back row. Somebody drew a little TV with rabbit ears in the corner, in pen, very carefully." },
      ] },
    { id: 'w2_desk_201_tess', type: 'desk_student', x: 17, y: 8,
      examine: [{ cond: leahDone, text: "[scared] I almost sat here. She asked me to. She asked me nicely." }] },
    // the bare corner (NW): nothing here now. In the compact, the mound.
    { id: 'w2_201_corner', type: 'decal_stain', x: 11, y: 4,
      examine: by(['[n] A wide dark stain in the corner, like something heavy sat there in the damp for a long time.', "[worried] Nothing's in the corner. Nothing's in the corner."],
        "[n] The stain in the corner.") },
    { type: 'cicada_shells', x: 10, y: 3 },
    { type: 'decal_leaves', x: 22, y: 4 },
    { type: 'decal_papers', x: 20, y: 6 },
    { type: 'trash_can', x: 22, y: 9 },

    // ======================================================== 202 — history (OUR PROUD HERITAGE)
    { id: 'w2_pa_poster', type: 'poster', x: 26, y: 2, state: 'pa_map',
      examine: by(['[n] A map of Pennsylvania. A red dot for Kettle Run, and a hand-lettered arrow: YOU ARE HERE.', '[skeptical] Thanks.'], '[n] YOU ARE HERE.') },
    { id: 'w2_heritage', type: 'bulletin_board', x: 27, y: 2, state: 'heritage', doc: 'heritage',
      examine: by('[curious] OUR PROUD HERITAGE. An eighth-grade board: cut-out letters, a coal lump glued to cardboard, a photo of boys on benches.',
        "[n] OUR PROUD HERITAGE. The boys on the benches."),
    },
    { id: 'w2_chalk_202', type: 'chalkboard', x: 29, y: 2, state: 'text', text: "FOUNDER'S DAY: WHY WE REMEMBER",
      params: { text1979: "FOUNDER'S DAY: WHY WE REMEMBER — 1 PAGE, DUE MON." },
      examine: by(["[n] FOUNDER'S DAY: WHY WE REMEMBER.", "[angry] They made the kids write essays about it."], "[n] WHY WE REMEMBER.") },
    { id: 'w2_202_clock', type: 'clock_wall', x: 33, y: 2 },
    { type: 'flag_us', x: 34, y: 2 },
    { type: 'radiator', x: 24, y: 3 },
    { id: 'w2_202_chair', type: 'chair_teacher', x: 32, y: 3, dir: 'down' },
    { id: 'w2_202_desk', type: 'desk_teacher', x: 31, y: 4,
      examine: by(["[n] A stack of essays, graded. The top one: 'He loved the boys who worked for him so much he gave us a school.' B+. 'Cite sources.'",
        '[sad] B plus.'], "[n] 'He loved the boys.' B plus.") },
    { id: 'w2_202_globe', type: 'globe', x: 35, y: 4, examine: '[n] A globe. Somebody stuck a gold star on Petersburg, Virginia.' },
    { type: 'bookshelf_low', x: 24, y: 4, examine: '[n] *Pennsylvania: Our Heritage*. *The Molly Maguires*. *Coal Country*, 1977. All the spines say the same thing.' },
    { type: 'decal_papers', x: 28, y: 7 },
    { type: 'decal_leaves', x: 35, y: 3 },
    { type: 'cicada_shells', x: 25, y: 3 },
    { type: 'trash_can', x: 36, y: 9 },

    // ======================================================== 203 — chemistry (and the dark window)
    { id: 'w2_periodic_203', type: 'poster', x: 40, y: 2, state: 'periodic' },
    { id: 'w2_fume_hood', type: 'fume_hood', x: 40, y: 3,
      examine: by("[n] A fume hood, sash half down. Inside, a ring stand and a beaker with a dry purple crust.", '[n] The fume hood.') },
    // two board panels: MOLE / QUIZ now; in 1979 they read across — FOUNDER'S DAY — NO CLASSES AFTER 1:30 | ASSEMBLY 1:45
    { id: 'w2_chalk_203', type: 'chalkboard', x: 41, y: 2, state: 'text', text: 'MOLE = 6.02 x 10^23',
      params: { text1979: "FOUNDER'S DAY — NO CLASSES AFTER 1:30" },
      examine: by(["[n] MOLE = 6.02 × 10²³, and a cartoon mole in safety goggles.", '[worried] Somebody wrote over something. The old chalk is still under it.'],
        "[n] Something's under the mole. I can't read it. Not like this.") },
    { id: 'w2_chalk_203_b', type: 'chalkboard', x: 44, y: 2, state: 'text', text: '', params: { text1979: 'ASSEMBLY 1:45' },
      examine: by(['[n] Wiped. A ghost of numbers under the swipes: 1:4-something.', "[worried] Quarter to. It's always quarter to."], '[n] Wiped.') },
    { id: 'w2_eyewash', type: 'eyewash', x: 47, y: 2, examine: '[n] EYEWASH. Pull the handle. I pull it. Nothing.' },
    { id: 'w2_chem_cabinet', type: 'chem_cabinet', x: 49, y: 3,
      examine: by('[n] FLAMMABLE. CORROSIVE. Padlocked. Through the vents, brown bottles in rows.', '[n] FLAMMABLE.') },
    { id: 'w2_demo_bench', type: 'lab_bench', x: 43, y: 4,
      examine: by("[n] The demonstration bench. A burner, a tripod, a beaker of something that evaporated in 1979 and left a ring.",
        "[n] The demonstration bench.") },
    { type: 'lab_bench', x: 41, y: 5 },
    { type: 'lab_bench', x: 47, y: 5 },
    { type: 'lab_bench', x: 41, y: 7, examine: '[n] Somebody scratched the periodic table into the top. They gave up at sodium.' },
    { type: 'lab_bench', x: 47, y: 7 },
    { type: 'decal_glass', x: 45, y: 7 },
    { type: 'decal_stain', x: 39, y: 8 },
    { type: 'trash_can', x: 38, y: 9 },
    // ======================================================== 204 — prep room (through 203)
    { id: 'w2_prep_shelf', type: 'shelf_metal', x: 51, y: 3,
      examine: by("[n] Reagent bottles with Mr. Kerr's labels. A box of safety goggles. A shoebox: CONFISCATED — lighters, a slingshot, a cassette of Kiss Alive!",
        '[n] CONFISCATED.') },
    { type: 'chem_cabinet', x: 53, y: 3 },
    { id: 'w2_prep_sink', type: 'sink', x: 55, y: 3, examine: '[n] A deep sink with a gooseneck tap. Dry. Thank God.' },
    { id: 'w2_battery_204', type: 'pickup', x: 52, y: 7, item: 'battery',
      examine: '[relieved] A battery on the prep counter, next to a dead flashlight. Somebody did a battery check in 1979.' },
    { id: 'w2_prep_desk', type: 'desk_teacher', x: 51, y: 6,
      examine: "[n] An order form for next year's chemicals, half filled. FALL 1980 — QTY —. Nobody finished the quantities." },
    { type: 'decal_stain', x: 54, y: 8 },
    { type: 'cobweb', x: 56, y: 3 },

    // ======================================================== collapsed west stair (2F landing)
    { id: 'w2_stair_exit', type: 'exit_sign', x: 11, y: 20, state: 'dead',
      examine: by(['[n] EXIT — STAIRS. The arrow points down.', "[skeptical] Down's a long way, right now."], '[n] EXIT. Down.') },
    { id: 'w2_hole_rail', type: 'note_paper', x: 7, y: 22,
      examine: by(["[n] Somebody made the rail out of the old banister and baling wire. A cardboard sign hangs off it: DANGER — DO NOT USE — W.P.",
        '[sad] W.P. Walt. He put the rail up himself.'], '[n] DANGER — DO NOT USE — W.P.') },
    { id: 'w2_hole_edge', type: 'decal_tiles', x: 8, y: 23,
      examine: by(["[n] The landing just stops. Joists sticking out like broken ribs, then air. Way down there, the moon on water.",
        "[worried] That's the downstairs puddle. I stood next to that. Leah filmed it."], "[n] The moon on the water downstairs.") },
    { id: 'w2_top_flight', type: 'decal_glass', x: 12, y: 23,
      examine: by('[n] The top of the stairs. Four treads, then a pile of plaster and lath where the rest of the flight used to be.', '[n] Four treads. Then nothing.') },
    { type: 'decal_leaves', x: 9, y: 27 },
    { type: 'decal_leaves', x: 3, y: 28 },
    { type: 'cicada_shells', x: 12, y: 27 },
    { type: 'decal_tiles', x: 10, y: 21 },
    { type: 'decal_tiles', x: 5, y: 27 },
    { type: 'cobweb', x: 13, y: 21 },

    // ======================================================== teachers' lounge (Adair's cardigan)
    { id: 'w2_duty_roster', type: 'bulletin_board', x: 16, y: 20, state: 'generic',
      examine: by(["[n] DUTY ROSTER — WEEK OF OCT. 15. Bus, lunch, hall. Friday's ASSEMBLY row has one name crossed out and written back in, harder: ADAIR.",
        "[worried] Somebody tried to take her off it."], '[n] ASSEMBLY — ADAIR.') },
    { id: 'w2_lounge_clock', type: 'clock_wall', x: 19, y: 20 },
    { type: 'plant_dead', x: 15, y: 21 },
    { type: 'reading_table', x: 18, y: 23,
      examine: by("[n] A Formica table. Two ashtrays, full. A coffee mug with a lipstick print. A deck of cards dealt for solitaire, mid-game.",
        "[n] Solitaire, mid-game.") },
    { id: 'w2_adair_cardigan', type: 'chair_teacher', x: 17, y: 23, dir: 'right', noSit: true,
      examine: [
        { cond: from(6), text: ['[n] Her cardigan. R.A. on the name tape.', "[sad] She was cold. She was always cold, I bet. She left it so she'd come back for it."] },
        { cond: met, text: ['[n] A mustard cardigan, hand-knit, over the back of a chair. R. ADAIR on a name tape in the collar.',
          "[n] A red ink stain on the pocket. The pen's gone.", '[sad] Cat-eye glasses in the other pocket. Folded. Like she just took them off to rub her eyes.'] },
        { text: ['[n] A mustard cardigan, hand-knit, over the back of a chair. R. ADAIR on a name tape in the collar.', "[n] A red ink stain on the pocket. The pen's gone."] },
      ] },
    { type: 'office_chair', x: 20, y: 23, dir: 'left', sitDir: 'left' },
    { type: 'office_chair', x: 20, y: 24, dir: 'left', sitDir: 'left' },
    { type: 'office_chair', x: 17, y: 24, dir: 'right', sitDir: 'right' },
    { id: 'w2_lounge_cooler', type: 'water_cooler', x: 25, y: 21, examine: '[n] A Bunn coffee maker on the cooler. The pot has a brown line at the very bottom. Dry since Friday.' },
    { type: 'coat_rack', x: 26, y: 23, examine: "[n] A man's raincoat. An umbrella. Nobody's walking home in them." },
    { id: 'w2_lounge_books', type: 'bookshelf_low', x: 22, y: 27,
      examine: by("[n] Paperbacks. Michener's *Chesapeake*. *The Thorn Birds*. A hymnal with sheet music stuck in it: ALMA MATER — arr. R. Adair.",
        "[n] ALMA MATER — arr. R. Adair.") },
    { type: 'bench', x: 15, y: 27 },
    { type: 'decal_stain', x: 23, y: 25 },
    { type: 'decal_papers', x: 19, y: 26 },
    { type: 'trash_can', x: 26, y: 28 },

    // ======================================================== supply closet
    { id: 'w2_supply_shelf', type: 'shelf_metal', x: 28, y: 21,
      examine: by('[n] Reams of mimeo paper gone soft. A box of chalk, a box of erasers, a carton of blank attendance cards.', '[n] Blank attendance cards.') },
    { id: 'w2_supply_mop', type: 'mop_bucket', x: 31, y: 24, examine: '[n] A mop bucket. W.P. stenciled on the side.' },
    { id: 'w2_supply_bulb', type: 'cage_bulb', x: 29, y: 20, state: 'off' },
    { type: 'desk_pile', x: 28, y: 26, examine: '[n] Spare desks, stacked. Enough for a whole class to come back.' },
    { type: 'cobweb', x: 32, y: 21 },

    // ======================================================== board room (the endowment)
    { id: 'w2_board_plaque', type: 'plaque', x: 37, y: 20,
      examine: by("[n] HALLOWELL ENDOWMENT — BOARD OF TRUSTEES. Twelve names in brass. Room for more.", '[n] Room for more.') },
    { type: 'flag_us', x: 42, y: 20 },
    { id: 'w2_board_clock', type: 'clock_wall', x: 44, y: 20 },
    // the long table (three reading tables end to end) and its chairs
    { id: 'w2_board_table', type: 'reading_table', x: 37, y: 23,
      examine: by(["[n] The board table. A gavel, water glasses, a typed agenda: 'Item 4. Founder's Day Assembly — Presentation of the Roll (per Charter).'",
        "[worried] Per Charter. Item four. Between the bus contract and the roof."], "[n] Item 4. Presentation of the Roll.") },
    { type: 'reading_table', x: 39, y: 23 },
    { id: 'w2_board_minutes', type: 'reading_table', x: 41, y: 23,
      examine: by(["[n] The minutes book, open to October 1979. 'Mr. Haupt reports the roll will be presented as required. Endowment payment confirmed for the coming year.'",
        "[n] The next page is blank. So is every page after it.", '[angry] They paid him. Every year they paid him and he paid the school.'],
      "[n] 'Endowment payment confirmed.' Then nothing.") },
    { type: 'chair_library', x: 37, y: 22 },
    { type: 'chair_library', x: 38, y: 22 },
    { type: 'chair_library', x: 40, y: 22 },
    { type: 'chair_library', x: 41, y: 22 },
    { type: 'chair_library', x: 37, y: 25, dir: 'up', sitDir: 'up' },
    { type: 'chair_library', x: 39, y: 25, dir: 'up', sitDir: 'up' },
    { type: 'chair_library', x: 42, y: 25, dir: 'up', sitDir: 'up' },
    { id: 'w2_board_head', type: 'chair_teacher', x: 43, y: 23, dir: 'left', noSit: true,
      examine: by("[n] The chair at the head of the table is bigger than the rest. Carved. The seat is worn into a deep dish, wider than any of the others.",
        "[n] The big chair. Worn wide."),
    },
    { id: 'w2_board_cabinet', type: 'filing_cabinet', x: 46, y: 21,
      examine: by('[n] ENDOWMENT — ANNUAL REPORTS, 1923–1979. Fifty-six folders, one a year, every one the same thickness.', '[n] Fifty-six years.') },
    { type: 'plant_dead', x: 34, y: 21 },
    { type: 'decal_stain', x: 35, y: 27 },
    { type: 'decal_papers', x: 44, y: 27 },
  ],

  doors: {
    '3,12': { id: 'w2_door_rr', label: 'GIRLS', state: 'open', autoClose: false },
    '20,12': { id: 'w2_door_201', label: '201' },
    '30,12': { id: 'w2_door_202', label: '202' },
    '44,12': { id: 'w2_door_203', label: '203' },
    '37,5': { id: 'w2_cloak_door', label: 'CLOAKROOM' },
    '50,4': { id: 'w2_prep_door', label: '204' },
    '21,20': { id: 'w2_door_lounge', label: 'FACULTY' },
    '30,20': { id: 'w2_door_supply', type: 'door_metal', label: 'SUPPLY' },
    '39,20': { id: 'w2_door_board', label: 'BOARD' },
  },

  rooms: [
    { id: 'w2_hall', name: 'West Hall — 2F', rect: [1, 13, 57, 5], kind: 'hall' },
    { id: 'w2_girls_rr', name: "Girls' Room — 2F", rect: [2, 3, 7, 7], kind: 'restroom' },
    { id: 'w2_room201', name: 'Room 201', rect: [10, 3, 13, 7], kind: 'classroom' },
    { id: 'w2_room202', name: 'Room 202 — History', rect: [24, 3, 13, 7], kind: 'classroom' },
    { id: 'w2_room203', name: 'Room 203 — Chemistry', rect: [38, 3, 12, 7], kind: 'classroom' },
    { id: 'w2_room204', name: '204 — Prep', rect: [51, 3, 6, 7], kind: 'special' },
    { id: 'w2_stair', name: 'West Stairs (collapsed)', rect: [2, 18, 12, 11], kind: 'stair' },
    { id: 'w2_lounge', name: "Teachers' Lounge", rect: [15, 21, 12, 8], kind: 'office' },
    { id: 'w2_supply', name: 'Supply', rect: [28, 21, 5, 8], kind: 'special' },
    { id: 'w2_board', name: 'Board Room', rect: [34, 21, 13, 8], kind: 'office' },
  ],

  anchors: {
    from_longhall: [54, 15, 'left'],
    from_library: [3, 15, 'right'],
    mirror_2f: [4, 5, 'up'],            // before the fogged mirror over the running tap
    faucet: [4, 4, 'up'],               // at the running tap (the loop itself sits on the sink cell 4,3)
    in_rr: [3, 8, 'up'],
    door_201: [20, 13, 'up'],
    in_201: [20, 8, 'left'],
    false_leah: [15, 9, 'up'],          // aisle south of w2_desk_false_leah (she sits with her back to the door)
    desk_201_tess: [17, 9, 'up'],       // aisle south of w2_desk_201_tess, beside her
    door_hold: [20, 13, 'up'],          // corridor side of 201's door: where Tess holds it shut
    corner_201: [11, 4],                // the bare corner (the mound in 1979)
    door_202: [30, 13, 'up'],
    in_202: [30, 8, 'up'],
    history_board: [27, 3, 'up'],
    charter_excerpt: [28, 13, 'up'],
    door_203: [44, 13, 'up'],
    in_203: [44, 8, 'up'],
    chem_window: [48, 3, 'up'],         // the dark window in 203's north wall (x 48–49)
    prep: [53, 5, 'down'],
    stair_hole: [9, 22, 'left'],
    lounge: [21, 22, 'down'],
    cardigan: [16, 23, 'right'],
    board_room: [39, 21, 'down'],
    hall_west: [3, 16, 'right'],
    hall_east: [55, 15, 'left'],
  },

  exits: [
    { rect: [57, 13, 1, 5], to: 'longhall', anchor: 'from_west2' },
  ],

  triggers: [
    // the Reflection (DESIGN §6 V.5): stepping up to the fogged mirror
    { id: 'mirror_2f', rect: [2, 4, 5, 3], script: 'ch5.mirror', once: false, cond: (s) => !F(s).adair_met },
    // the compact lull: 202 history, first time in
    { id: 'room202', rect: [24, 7, 13, 3], script: 'ch5.room202', once: true, cond: (s) => (s.chapter || 0) >= 5 },
    // THE FALSE LEAH (DESIGN §6 V.7): the threshold of 201, only after Adair; checkpoint inside the script
    { id: 'false_leah', rect: [19, 8, 3, 2], script: 'ch5.false_leah', once: false,
      cond: (s) => !!F(s).adair_met && !F(s).false_leah_done },
  ],

  lights: [
    // hall fluorescents (period only)
    { type: 'fluor', x: 5, y: 15, group: 'period' },
    { type: 'fluor', x: 13, y: 15, group: 'period' },
    { type: 'fluor', x: 21, y: 15, group: 'period', flicker: true },
    { type: 'fluor', x: 29, y: 15, group: 'period' },
    { type: 'fluor', x: 37, y: 15, group: 'period' },
    { type: 'fluor', x: 45, y: 15, group: 'period' },
    { type: 'fluor', x: 53, y: 15, group: 'period' },
    // rooms (period only)
    { type: 'fluor', x: 5, y: 6, group: 'period', flicker: true },
    { type: 'fluor', x: 13, y: 6, group: 'period' },
    { type: 'fluor', x: 19, y: 6, group: 'period' },
    { type: 'fluor', x: 27, y: 6, group: 'period' },
    { type: 'fluor', x: 33, y: 6, group: 'period' },
    { type: 'fluor', x: 41, y: 6, group: 'period' },
    { type: 'fluor', x: 47, y: 6, group: 'period' },
    { type: 'fluor', x: 53, y: 6, group: 'period' },
    { type: 'fluor', x: 20, y: 25, group: 'period' },
    { type: 'fluor', x: 40, y: 25, group: 'period' },
    // moonlight through the roof and down the stair hole (the same shaft west1 sees on its puddle)
    { type: 'spot', x: 4, y: 23, color: '#7f9cc4', intensity: 0.9, radius: 3.5, disc: 2, shadows: false },
  ],

  // Positional loops (engine support requested — see header): the running tap until Adair.
  sounds: [
    { loop: 'faucet', at: [4, 3], radius: 22, cond: (s) => !(s.flags || {}).adair_met },
  ],

  patrol: {
    nodes: {
      w: [3, 15], stair: [8, 15], d201: [20, 15], d202: [30, 15], mid: [37, 15], d203: [44, 15], e: [55, 15],
      s_lounge: [21, 16], s_board: [39, 16], landing: [9, 23],
    },
    edges: [['w', 'stair'], ['stair', 'd201'], ['stair', 'landing'], ['d201', 's_lounge'], ['d201', 'd202'], ['d202', 'mid'],
      ['mid', 's_board'], ['mid', 'd203'], ['d203', 'e']],
    // wall seams: RR|201, 201|202, 202|203, 203|204 (north); lounge|supply, supply|board, board|lobby brick (south)
    folds: [[9, 12], [23, 12], [37, 12], [50, 12], [27, 18], [33, 18], [47, 18]],
    peeks: [
      { room: 'w2_room201', door: [20, 12], look: [20, 8] },
      { room: 'w2_room202', door: [30, 12], look: [30, 8] },
      { room: 'w2_room203', door: [44, 12], look: [44, 8] },
      { room: 'w2_girls_rr', door: [3, 12], look: [3, 8] },
      { room: 'w2_lounge', door: [21, 20], look: [21, 22] },
      { room: 'w2_board', door: [39, 20], look: [39, 22] },
    ],
    kevin: [[2, 14, 'right'], [56, 15, 'left']],
  },

  past: [
    // the compact tutorial: the restroom as it was that Friday
    { id: 'rr2f_1979', rect: [2, 3, 7, 7], hint: "Clean. Warm light. Somebody's fixing her hair for the assembly.",
      figures: [{ sprite: 'figure79', x: 4, y: 4, dir: 'up', anim: 'idle_up' }] },
    // 201: her chair is empty in 1979 — and in the far corner, the mound
    { id: 'room201_1979', rect: [10, 3, 13, 7], hint: "Her chair is empty. There's something in the corner.",
      objects: [{ type: 'coal_heap', x: 10, y: 3, state: 'occupied' }],
      hide: ['w2_201_corner'],
      figures: [
        ...[[13, 6], [15, 6], [19, 6], [21, 6], [11, 8], [13, 8], [19, 8]].map(([x, y]) => ({ sprite: 'figure79', x, y, dir: 'up', anim: 'sit_up' })),
      ] },
    // 202: the essays, the board in the morning
    { id: 'room202_1979', rect: [24, 3, 13, 7], hint: 'Everyone writing. Why we remember.',
      figures: [
        ...[[25, 6], [27, 6], [29, 6], [33, 6], [25, 8], [29, 8], [31, 8], [35, 8]].map(([x, y]) => ({ sprite: 'figure79', x, y, dir: 'up', anim: 'sit_up' })),
        { sprite: 'figure79', x: 31, y: 3, dir: 'down', anim: 'idle_down' },
      ] },
    // 203: the board under the mole
    { id: 'chem_1979', rect: [38, 3, 12, 7], hint: "The board. Founder's Day — no classes after one-thirty.",
      figures: [{ sprite: 'figure79', x: 44, y: 3, dir: 'down', anim: 'idle_down' }] },
  ],
};
