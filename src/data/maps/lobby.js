// LOBBY — the hub (maps-A). CONTENT §2.2 · DESIGN §6 I, VI.3, VII.1, VIII.6, §9.2, §12.
// 30×30 tiles, offset (60, 22), 1F. World axis of the building = local x 15 (front doors 14–15).
//
//   North hall (rows 4–12): the two-storey atrium under the long-hall gallery. North wall, west→east:
//     water fountain · memorial board `lobby_memorial` (x 3–5, flag-driven Polaroids, see
//     lobby_memorial.js) · scratched names · dead EXIT · auditorium doors `lobby_aud_doors` (x 9–10,
//     chained; script ch7.aud_doors (may set flag aud_chain_cut after the bolt cutters for the 'Old
//     keyhole' line); → aud/from_lobby) · hall clock · THE PORTRAIT `lobby_portrait`
//     (x 14–16, seated/empty/uniform by flags) · plaque `lobby_plaque` · dead EXIT · the second pair
//     of auditorium doors `lobby_aud_doors_e` (chained for good) · bad pentagram · FOUNDER'S DAY
//     banner. Bench `lobby_bench` on the axis facing away from the painting, Danny's backpack
//     `lobby_backpack` beside it. A skylight leaks: a puddle and a pale pool of moonlight.
//     NE corner: stage door `lobby_stage_door` (east wall, x 28 y 6; barred from the aud side).
//   Corridor band (rows 13–17 = world 35–39): open archway west → west1/from_lobby; east double
//     doors `lobby_east_doors` (two door_side leaves at x 27, jammed until east_doors_open) →
//     east1/from_lobby.
//   Vestibule (rows 21–24): inner double doors, two trophy cases on its north wall (`lobby_trophy_w`
//     carries ch1.trophy — Adair in the glass), a dying red EXIT, the outer doorway (gap x 14–15).
//     The outer front doors (door_front in the doorway, x 14–15 rows 25–26), by state:
//       before ch1_danny_vanished → `lobby_front_doors_shut`: bumping them runs ch1.vestibule_refuse
//                                   (Leah: "We've been here four minutes..."); they never open.
//                                   (A trigger in the doorway runs the same script, as a net.)
//       after the vanish           → `lobby_front_doors`: plain heavy doors (stay where pushed).
//         1st time through         → trigger ch1.front_loop. The scene owns the SEAMLESS transfer:
//                                   g.transfer('west1', 'library_end', { fade: false }), then the
//                                   2-tile walk out of the library doors. If the script leaves Tess
//                                   standing in the doorway, the exit below takes her anyway.
//         every time after         → exit, seamless (fade:false) → west1/library_end. It names
//                                   `script: 'gen.front_loop'` (the one-line repeat) for the engine
//                                   to run on arrival — exits don't run scripts yet (see report).
//       after register_done        → exit → exterior/dawn_steps (endings swing the doors open).
//
// Script-or-examine split: props whose Ch1 behaviour is a party scene carry the CONTENT script only
// while chapter ≤ 1 (`lobby_portrait`, `lobby_plaque`, `lobby_memorial`, `lobby_trophy_w`,
// `lobby_east_doors`); a twin at the same cell carries Tess's examine text for later chapters.
// Triggers: enter_lobby (Ch1, crossing into the hall from the vestibule) → ch1.enter_lobby ·
// ch7_start_w/e (cond ch6_marcus_taken && !ch7_started) → ch7.start · ch6_breather_w/e (cond
// safe_open && !ch6_breather_done) → ch6.breather. The w/e strips (x 5 and x 23, rows 4–17) catch
// Tess coming in from either wing or from the stage door.
// Lights: period fluorescents; skylight moon pool; the doorway's cold light; one dying EXIT in the
// vestibule (the only colour in the room); a warm leak under the auditorium doors in group 'assembly'.
// Patrol: hall loop + the vestibule; folds at the portrait wall (13,3) and in the vestibule (16,20).
import { memorialVariants, memorialExamine } from './lobby_memorial.js';

const CH1 = (s) => (s.chapter || 0) <= 1;
const LATER = (s) => (s.chapter || 0) >= 2;
const has = (s, id) => (s.party || []).includes(id);
const portraitState = (s) => s.flags.portrait_state
  || (s.flags.expelled ? 'uniform' : s.flags.ch5_danny_found ? 'empty' : 'seated');
const bagDown = (s) => !!(s.flags.trig_lobby_enter_lobby || s.flags.danny_bag_dropped
  || s.flags.ch1_danny_vanished || (s.chapter || 0) >= 2);
const eastOpen = (s) => !!s.flags.east_doors_open;
const stageDoorOpen = (s) => !!(s.flags.stage_door_open || s.mapState?.aud?.aud_stage_door?.state === 'open');

// Ch1 company. Before the vanish all three answer; after it Leah and Marcus stay short and tense.
const PRE = (s) => CH1(s) && !s.flags.ch1_danny_vanished;
const POST = (s) => CH1(s) && !!s.flags.ch1_danny_vanished;
const LEAH_POST = [
  '[scared] T. The doors. Let\'s just go.',
  '[worried] Don\'t read things. Walk.',
  '[scared] He\'d have a joke about that. He\'d have one right now.',
  '[crying] I\'m still recording. I don\'t know why I\'m still recording.',
];
const MARCUS_POST = [
  '[urgent] Front doors. Keep moving.',
  '[worried] Stay where I can see you.',
  '[neutral] Later, Tess. Doors.',
  '[worried] Don\'t touch anything else.',
];
// Ch2–6: Marcus is Tess's only company until the gym (`later` = his line then).
const WITH_MARCUS = (s) => (s.chapter || 0) >= 2 && !s.flags.ch6_marcus_taken;
const B = (danny, leah, marcus, i = 0, later = null) => ({
  danny: [{ cond: PRE, text: danny }],
  leah: [{ cond: PRE, text: leah }, { cond: POST, text: LEAH_POST[i % LEAH_POST.length] }],
  marcus: [{ cond: PRE, text: marcus }, { cond: POST, text: MARCUS_POST[i % MARCUS_POST.length] },
    ...(later ? [{ cond: WITH_MARCUS, text: later }] : [])],
});
const M = (text) => ({ marcus: [{ cond: WITH_MARCUS, text }] });

const EXIT_DEAD = [
  { cond: CH1, text: '[n] EXIT. The letters are dead gray glass.' },
  { text: '[n] A dead EXIT sign. Pointing at nothing.' },
];

export default {
  id: 'lobby',
  name: 'Lobby',
  floor: '1F',
  offset: [60, 22],
  ambience: 'hall',
  music: null,
  dark: 0.94,
  ambient: '#0b1020',
  //   x → 0         1         2
  //       012345678901234567890123456789
  tiles: [
    '                              ', //  0
    ' BBBBBBBBDDBBBBBBBBBDDBBBBBBB ', //  1  north wall: top (aud doors cut through)
    ' BBBBBBBBDDBBBBBBBBBDDBBBBBBB ', //  2  face_high
    ' BBBBBBBBDDBBBBBBBBBDDBBBBBBB ', //  3  face_low: memorial, portrait, plaque, banner
    ' BssssssssssssssssssssssssssB ', //  4  north hall (two storeys; the gallery is above)
    ' BssssssssmmmmmmmmmmssssssssB ', //  5  marble inlay before the portrait
    ' BssssssssmmmmmmmmmmssssssssD ', //  6  · stage door (x28)
    ' Bssssssssmmmmm~~mmmssssssssB ', //  7  skylight leak: rain pooling under the portrait
    ' BssssssssmmmmmmmmmmssssssssB ', //  8
    ' BssssssssmmmmmmmmmmssssssssB ', //  9
    ' BssssssssmmmmmmmmmmssssssdsB ', // 10
    ' BssssssssmmmmmmmmmmsssssddsB ', // 11  fallen plaster
    ' BssssssssssssssssssssssssssB ', // 12
    ' ssssssssssssssssssssssssssBB ', // 13  corridor band (world rows 35-39)
    ' ssssssssssssssssssssssssssBB ', // 14
    ' ssssssssssssssssssssssssss,, ', // 15  east doors (door_side x27) → east1
    ' ssssssssssssssssssssssssss,, ', // 16
    ' ssssssssssssssssssssssssssBB ', // 17
    ' BBBBBBBBBBBBBDDBBBBBBBBBBBBB ', // 18  vestibule north wall: top
    '       BBBBBBBDDBBBBBBB       ', // 19  face_high
    '       BBBBBBBDDBBBBBBB       ', // 20  face_low: trophy cases in front, red EXIT
    '       BssssssssssssssB       ', // 21  vestibule
    '       BssssssssssssssB       ', // 22
    '       BssssssssssssssB       ', // 23
    '       BssssssssssssssB       ', // 24
    '       BBBBBBBssBBBBBBB       ', // 25  outer doorway (triggers / dawn exit)
    '       BBBBBBBssBBBBBBB       ', // 26
    '                              ', // 27
    '                              ', // 28
    '                              ', // 29
  ],
  objects: [
    // ------------------------------------------------------------------ north wall (faces, row 3)
    { id: 'lobby_fountain', type: 'water_fountain', x: 2, y: 4,
      examine: [
        { cond: CH1, text: ['[n] A porcelain drinking fountain. I press the button.', '[n] Somewhere deep in the building the pipes knock. Nothing comes out.'] },
        { cond: (s) => (s.chapter || 0) >= 5, text: ['[n] I press the button. The pipes knock.', '[scared] Something knocks back. Further off.'] },
        { text: '[n] The pipes knock. Nothing comes out.' },
      ],
      banter: B('[grin] Dibs.', '[deadpan] On tetanus.', '[worried] Don\'t drink anything in here. Seriously.', 0, '[worried] Don\'t. Something heard that.') },
    { type: 'cobweb', x: 2, y: 4 },
    // The memorial: interactive boards underneath, flag-driven looks on top (lobby_memorial.js).
    { id: 'lobby_memorial', type: 'memorial_board', x: 3, y: 3, script: 'ch1.memorial', cond: CH1, hideInPast: true },
    { id: 'lobby_memorial_later', type: 'memorial_board', x: 3, y: 3, cond: LATER, hideInPast: true, examine: memorialExamine,
      banter: M('[sad] Top row, first one. That\'s her. Grandma has the same picture on the fridge.') },
    ...memorialVariants(3, 3),
    { id: 'lobby_names', type: 'graffiti', x: 6, y: 3, state: 'names',
      examine: [
        { cond: CH1, text: ['[n] Names scratched into the paint beside the board, years of them. CLASS OF \'77. S.K. + B.M.', '[n] Low down, pressed hard enough to go through to the plaster: MISS YOU D.'] },
        { text: '[n] MISS YOU D. Somebody pressed hard enough to go through the paint.' },
      ],
      banter: B('[nervous] ...Okay. That one\'s not funny.', '[talk] People used to come in here. After. Like a shrine. Then they stopped.', '[thoughtful] ...D.', 1) },
    { id: 'lobby_exit_w', type: 'exit_sign', x: 8, y: 3, state: 'dead', examine: EXIT_DEAD,
      banter: B('[grin] Even the sign gave up.', '[deadpan] Fire code violation. I\'m writing it down.', '[neutral] We came in the front. We go out the front.', 2) },
    { id: 'lobby_clock', type: 'clock_hall', x: 12, y: 3,
      examine: [
        { cond: CH1, text: ['[n] The hall clock says twenty to two.', '[skeptical] It\'s almost ten at night.'] },
        { text: '[worried] One forty-something. It\'s always one forty-something in here.' },
      ],
      banter: B('[grin] Spooky. Stopped the second the ghosts showed up.', '[deadpan] Stopped when they cut the power, Danny. In 1984.', '[worried] It\'s not stopped. Watch the minute hand.', 3) },
    // THE PORTRAIT (exposure #1). One look per state; only the Ch1 one carries the scene script.
    { id: 'lobby_portrait', type: 'portrait_colonel', x: 14, y: 3, state: 'seated', script: 'ch1.portrait',
      cond: (s) => CH1(s) && portraitState(s) === 'seated' },
    { id: 'lobby_portrait_seated', type: 'portrait_colonel', x: 14, y: 3, state: 'seated',
      cond: (s) => LATER(s) && portraitState(s) === 'seated',
      examine: [
        { cond: (s) => !!s.flags.colonel_named, text: ['[n] Colonel Cyrus Hallowell, in oils, in his carved chair.', '[scared] That\'s the face from the tape. Same little smile. Like he\'s being polite about it.'] },
        { text: ['[n] Colonel Cyrus Hallowell, in oils. A carved chair, a red sash, a great deal of man.', '[worried] He\'s sitting like he\'s about to get up.'] },
      ],
      banter: M('[worried] Don\'t look at it too long.') },
    { id: 'lobby_portrait_empty', type: 'portrait_colonel', x: 14, y: 3, state: 'empty',
      cond: (s) => portraitState(s) === 'empty',
      examine: [
        { cond: (s) => !!s.flags.ch7_started, text: ['[n] The painted chair is still empty.', '[scared] He\'s at the lectern. He\'s waiting on me.'] },
        { text: ['[n] The carved chair. The painted curtain. The painted rug.', '[terrified] He isn\'t in it.'] },
      ],
      banter: M('[scared] Where\'d he go, Tess.') },
    { id: 'lobby_portrait_uniform', type: 'portrait_colonel', x: 14, y: 3, state: 'uniform',
      cond: (s) => portraitState(s) === 'uniform',
      examine: ['[n] Just the coat now, slumped in the painted chair. The sash hangs off the arm.', '[relieved] Dismissed.'] },
    { id: 'lobby_plaque', type: 'plaque', x: 18, y: 3, doc: 'plaque', script: 'ch1.plaque', cond: CH1 },
    { id: 'lobby_plaque_later', type: 'plaque', x: 18, y: 3, doc: 'plaque', cond: LATER,
      examine: [
        { cond: (s) => (s.chapter || 0) >= 6 && !s.flags.safe_open, text: '[n] Brass, going green. Leah read it out loud, before. FIRST KEPT IN 1894.' },
        { cond: (s) => !!s.flags.safe_open, text: '[sad] The day the boys burned. He had it cast in brass.' },
        { text: '[n] Brass, going green. Somebody kept his name polished and let the rest go.' },
      ] },
    { id: 'lobby_exit_e', type: 'exit_sign', x: 19, y: 3, state: 'dead', examine: EXIT_DEAD,
      banter: B('[grin] Dead. Like the town.', '[deadpan] Like most of the town. Some of it\'s just on fire.', '[neutral] Come on.', 3) },
    { id: 'lobby_pentagram', type: 'graffiti', x: 23, y: 3, state: 'pentagram',
      examine: [
        { cond: CH1, text: ['[n] A pentagram in red marker. One of the points is way too long.', '[skeptical] Satan is going to have notes.'] },
        { text: '[n] The bad pentagram. Somebody was scared enough in here to try.' },
      ],
      banter: B('[grin] Not mine. I\'d have used a ruler.', '[deadpan] That\'s a star with a cramp.', '[soft_smile] Somebody was scared and had a marker.', 0) },
    { id: 'lobby_banner', type: 'banner', x: 24, y: 3, state: 'founders',
      examine: [
        { cond: CH1, text: ['[n] A paper banner, navy and gold, torn at one end: FOUNDER\'S DAY.', '[skeptical] Somebody forgot to take down the decorations. In 1979.'] },
        { cond: (s) => (s.chapter || 0) >= 6, text: '[scared] FOUNDER\'S DAY. It\'s for today. It was always going to be for today.' },
        { text: '[n] FOUNDER\'S DAY. October nineteenth. Tomorrow. Today, by now.' },
      ],
      banter: B('[grin] Founder\'s Day. Free cake and a speech.', '[talk] And Homecoming. Same day, every year, since forever.', '[neutral] My grandma never goes.', 1) },
    { type: 'cobweb', x: 27, y: 4 },
    // Two dead palms in brass pots flank the painting like a shrine.
    { type: 'plant_dead', x: 13, y: 4, examine: '[n] A palm in a brass pot, dead so long the fronds have gone to paper.' },
    { type: 'plant_dead', x: 17, y: 4 },

    // ------------------------------------------------------------------ north hall floor
    { type: 'decal_papers', x: 10, y: 5 },          // mimeographed assembly programs, trodden flat
    { type: 'decal_papers', x: 8, y: 7 },
    { type: 'decal_papers', x: 21, y: 5 },
    { type: 'decal_stain', x: 14, y: 7 },           // under the skylight
    { type: 'decal_stain', x: 17, y: 8 },
    { type: 'decal_tiles', x: 24, y: 10 },          // the plaster came down in the NE corner
    { type: 'decal_tiles', x: 26, y: 12 },
    { type: 'decal_leaves', x: 6, y: 12 },
    { id: 'lobby_bench', type: 'bench', x: 14, y: 10,
      examine: [
        { cond: CH1, text: '[n] An oak bench, worn pale where people sat waiting for rides.' },
        { text: '[exhausted] Just for a second. Just sit.' },
      ] },
    { id: 'lobby_backpack', type: 'backpack', x: 16, y: 10, script: 'ch1.backpack', cond: bagDown },
    { id: 'lobby_bench_w', type: 'bench', x: 3, y: 9,
      examine: '[n] Another bench. Somebody carved a heart into the seat and then, later, scratched it out.' },
    { id: 'lobby_bench_e', type: 'bench', x: 24, y: 8,
      examine: '[n] A bench, gritty with fallen plaster. I brush it off. More comes down.' },
    { id: 'lobby_trash', type: 'trash_can', x: 27, y: 12,
      examine: [
        { cond: CH1, text: '[n] A wastebasket. Inside: a program, FOUNDER\'S DAY ASSEMBLY, folded into a paper football.' },
        { text: '[n] The paper football. Somebody was bored at the assembly. Then they weren\'t anything.' },
      ],
      banter: B('[grin] Field goal. Kid had a future.', '[deadpan] Somebody was bored at an assembly. Groundbreaking.', '[neutral] Put it back, man.', 2) },

    // ------------------------------------------------------------------ corridor band
    { id: 'lobby_exit_east', type: 'exit_sign', x: 27, y: 14, state: 'dead', examine: EXIT_DEAD,
      banter: B('[grin] East wing. Cafeteria. Mystery meat, 1979 vintage.', '[deadpan] That\'s the jammed door, Danny.', '[neutral] Gym\'s down that way too.', 0) },
    { type: 'fire_extinguisher', x: 1, y: 12, examine: '[n] A fire extinguisher in a wall bracket, its hose cracked like an old garden hose.' },
    // East double doors: jammed (Ch1–2, carries ch1.east_jammed) → hanging open (east_doors_open).
    { id: 'lobby_east_doors', type: 'door_side', x: 27, y: 15, state: 'jammed', script: 'ch1.east_jammed',
      label: 'EAST HALL', cond: (s) => !eastOpen(s), lock: (s) => !eastOpen(s),
      lockedText: (s) => (CH1(s) ? ['[n] The doors to the east hall. They give an inch and stop, like something\'s leaning on them.',
        { cond: (st) => has(st, 'danny'), text: '[danny:grin] Shoulder it. Kovach style.' },
        { cond: (st) => has(st, 'leah') && !st.flags.ch1_danny_vanished, text: '[leah:deadpan] Please don\'t.' },
        { cond: (st) => has(st, 'marcus'), text: '[marcus:neutral] Swollen. Rain gets in the frames.' }]
        : '[n] Still jammed. Something on the other side is leaning on them.') },
    { id: 'lobby_east_doors_2', type: 'door_side', x: 27, y: 16, state: 'jammed', script: 'ch1.east_jammed',
      label: 'EAST HALL', cond: (s) => !eastOpen(s), lock: (s) => !eastOpen(s) },
    { id: 'lobby_east_doors_open', type: 'door_side', x: 27, y: 15, state: 'open', autoClose: false, label: 'EAST HALL', cond: eastOpen },
    { id: 'lobby_east_doors_open_2', type: 'door_side', x: 27, y: 16, state: 'open', autoClose: false, label: 'EAST HALL', cond: eastOpen },
    { id: 'lobby_bench_sw', type: 'bench', x: 8, y: 17, examine: '[n] A bench against the vestibule wall. Somebody\'s gum, petrified, on the underside.' },
    { id: 'lobby_bench_se', type: 'bench', x: 20, y: 17 },
    { type: 'decal_leaves', x: 12, y: 17 },
    { type: 'decal_leaves', x: 17, y: 16 },
    { type: 'decal_papers', x: 4, y: 14 },
    { type: 'decal_stain', x: 9, y: 15 },

    // ------------------------------------------------------------------ vestibule (faces, row 20)
    { id: 'lobby_trophy_w', type: 'trophy_case', x: 9, y: 21, script: 'ch1.trophy', cond: CH1 },
    { id: 'lobby_trophy_w_later', type: 'trophy_case', x: 9, y: 21, cond: LATER,
      examine: [
        { cond: (s) => !!s.flags.adair_met, text: ['[n] Trophies under dust. My own face in the glass.', '[worried] I keep checking behind me for her. It\'s just me.'] },
        { text: ['[n] Bowling trophies, a debate plaque, and on green felt, a little enamel clarinet: ALL-COUNTY BAND 1979.', '[worried] My face in the glass. Nobody behind it. I checked.'] },
      ],
      banter: { marcus: [{ cond: (s) => !!s.flags.ch2_marcus_told, text: '[sad] Clarinet.' }] } },
    { id: 'lobby_trophy_e', type: 'trophy_case', x: 18, y: 21,
      examine: [
        { cond: CH1, text: '[n] Tarnished trophies, a cracked team photo, a pennant: DISTRICT XI — 1978 — RUNNERS-UP.' },
        { text: '[n] Runners-up, 1978. The boys in the photo would be about forty now. Some of them.' },
      ],
      banter: B('[grin] Runners-up. Story of Kettle Run.', '[deadpan] Says the man who got cut from JV.', '[thoughtful] Colliers. They named the team after the miners.', 3) },
    { id: 'lobby_exit_vest', type: 'exit_sign', x: 12, y: 20, state: 'flicker',
      examine: [
        { cond: (s) => !s.flags.ch1_danny_vanished, text: ['[n] A red EXIT sign beside the inner doors. The only light in here that works.', '[skeptical] Mixed messages.'] },
        { cond: (s) => !s.flags.register_done, text: '[scared] EXIT. Sure.' },
        { text: '[n] EXIT. For once.' },
      ],
      banter: B('[grin] Look, it\'s on. The school wants us out. Very polite school.', '[deadpan] It\'s on a battery from 1979. That\'s not how batteries work.', '[worried] Then why\'s it on?', 0) },
    { id: 'lobby_extinguisher', type: 'fire_extinguisher', x: 17, y: 20,
      examine: '[n] A fire extinguisher. INSPECTED 9/79, says the tag.',
      banter: B('[grin] Good through the Carter administration.', '[deadpan] We\'re not lighting anything, Danny.', '[thoughtful] September \'79.', 1) },
    { type: 'plant_dead', x: 8, y: 21, examine: '[n] A potted fern, dead so long it\'s just the outline of a fern.',
      banter: B('[grin] Relatable.', '[deadpan] Danny relates to the fern.', '[soft_smile] Water it, Danny.', 2) },
    { type: 'plant_dead', x: 21, y: 21 },
    { id: 'lobby_bench_vw', type: 'bench', x: 9, y: 24, examine: '[n] A bench by the doors, for waiting on rides.' },
    { id: 'lobby_bench_ve', type: 'bench', x: 19, y: 24 },
    { type: 'decal_leaves', x: 14, y: 24 },
    { type: 'decal_leaves', x: 15, y: 23 },
    { type: 'decal_leaves', x: 12, y: 24 },
    { type: 'decal_leaves', x: 16, y: 22 },
    { type: 'decal_glass', x: 17, y: 24 },          // a pane out of the outer doors
    // The outer front doors. Until Danny vanishes they are a refusal (ch1.vestibule_refuse runs on
    // the bump: Leah's line); after, ordinary heavy doors that stay where they are pushed. Scripts
    // swing `lobby_front_doors` open/closed for the endings (DISMISSED, PRESENT).
    { id: 'lobby_front_doors_shut', type: 'door_front', x: 14, y: 25, state: 'closed', script: 'ch1.vestibule_refuse',
      verb: 'Open', label: 'FRONT DOORS', cond: (s) => !s.flags.ch1_danny_vanished && !s.flags.register_done,
      lock: () => true,
      lockedText: (s) => (has(s, 'leah') ? '[leah:deadpan] We\'ve been here four minutes. Danny\'ll never let us live it down.'
        : '[worried] Not yet.') },
    { id: 'lobby_front_doors', type: 'door_front', x: 14, y: 25, state: 'closed', autoClose: false, label: 'FRONT DOORS',
      cond: (s) => !!(s.flags.ch1_danny_vanished || s.flags.register_done) },
    { type: 'decal_stain', x: 11, y: 22 },          // wet footprints, drying
  ],
  doors: {
    // Auditorium doors: chained; ch7.aud_doors handles chain / bolt cutters / key. The lock and
    // lockedText below are the DESIGN §9.2 gate, for the script to reuse (g.examine(prop.inst.lockedText)).
    '9,3': {
      id: 'lobby_aud_doors', type: 'door_double', state: 'chained', label: 'AUDITORIUM', script: 'ch7.aud_doors',
      lock: (s) => !(s.inv.aud_key && s.flags.ch6_marcus_taken),
      lockedText: (s) => {
        if (s.inv.aud_key && !s.flags.ch6_marcus_taken) return '[determined] Marcus went toward the gym. I\'m not doing this without him.';
        if (s.flags.aud_chain_cut) return '[n] Chain\'s off. Doors are still locked. Old keyhole.';
        if (CH1(s)) {
          return ['[n] AUDITORIUM. A chain through both push bars, and a padlock gone orange with rust.',
            { cond: (st) => has(st, 'danny'), text: '[danny:grin] This is it. The Nine walked in here and never walked out.' },
            { cond: (st) => has(st, 'leah'), text: '[leah:deadpan] Somebody really didn\'t want an encore.' },
            { cond: (st) => has(st, 'marcus'), text: '[marcus:neutral] Come on.' }];
        }
        return ['[n] Chained. On the other side, very faint, something like a crowd settling into seats.', '[scared] There\'s nobody in there. There can\'t be.'];
      },
      to: { map: 'aud', anchor: 'from_lobby' },
    },
    // The second pair never opens (the key fits the first pair only).
    '20,3': {
      id: 'lobby_aud_doors_e', type: 'door_double', state: 'chained', label: 'AUDITORIUM', lock: () => true,
      lockedText: (s) => {
        if (s.inv.aud_key) return '[n] The key doesn\'t fit this pair. It\'s for the other doors.';
        if (CH1(s)) {
          return ['[n] The other pair. Chained, same as the first.',
            { cond: (st) => has(st, 'danny'), text: '[danny:grin] Chained from the outside. So whatever\'s in there stays in there. Cool. Cool cool.' },
            { cond: (st) => has(st, 'leah'), text: '[leah:deadpan] That\'s how chains work, Danny.' },
            { cond: (st) => has(st, 'marcus'), text: '[marcus:worried] Let\'s not.' }];
        }
        return '[n] Chained. The padlock\'s rusted solid.';
      },
    },
    // Inner double doors between the vestibule and the lobby.
    '14,20': { id: 'lobby_inner_doors', label: 'LOBBY' },
    // Stage door, NE corner: barred from the aud side until ch7.stage_door unbars it.
    '28,6': {
      id: 'lobby_stage_door', type: 'door_side', state: 'locked', label: 'STAGE', autoClose: false,
      lock: (s) => !stageDoorOpen(s), unlockSfx: 'door_open_metal',
      lockedText: (s) => ['[n] A steel door in the corner, painted the same green as the wall. STAGE — NO ADMITTANCE.',
        '[n] It doesn\'t even rattle. Barred from the other side.',
        { cond: (st) => CH1(st) && has(st, 'danny'), text: '[danny:grin] Backstage pass. Dolan, we\'re VIPs.' },
        { cond: (st) => CH1(st) && has(st, 'leah'), text: '[leah:deadpan] Barred from the stage side. So somebody was on the stage side.' },
        { cond: (st) => CH1(st) && has(st, 'marcus'), text: '[marcus:neutral] Leave it.' }],
      to: { map: 'aud', anchor: 'stage_door' },
    },
  },
  rooms: [
    { id: 'lobby_hall', name: 'Lobby', rect: [1, 4, 27, 14], kind: 'hall' },
    { id: 'lobby_vestibule', name: 'Vestibule', rect: [8, 21, 14, 6], kind: 'special' },
  ],
  anchors: {
    from_exterior: [14, 23, 'up'],  // first anchor (reachability root): just inside the front doors
    from_west1: [4, 15, 'right'],
    from_east1: [24, 15, 'left'],
    from_aud: [10, 5, 'down'],      // out of the auditorium doors
    aud_doors: [9, 4, 'up'],
    portrait: [15, 4, 'up'],
    memorial: [4, 4, 'up'],
    plaque: [18, 4, 'up'],
    danny_bag: [16, 11, 'up'],
    bench: [14, 11, 'up'],
    trophy: [10, 22, 'up'],
    stage_door: [26, 6, 'left'],
  },
  exits: [
    { id: 'west', rect: [1, 13, 1, 5], to: 'west1', anchor: 'from_lobby' },
    { id: 'east', rect: [28, 15, 1, 2], to: 'east1', anchor: 'from_lobby' },
    { id: 'aud', rect: [9, 1, 2, 2], to: 'aud', anchor: 'from_lobby' },          // when the doors stand open
    { id: 'stage', rect: [28, 6, 1, 1], to: 'aud', anchor: 'stage_door' },       // when the stage door stands open
    // The Ch1 loop, every time after the first (the first is the ch1.front_loop trigger below).
    { id: 'front_loop', rect: [14, 25, 2, 2], to: 'west1', anchor: 'library_end', fade: false, dir: 'right', script: 'gen.front_loop',
      cond: (s) => !!(s.flags.ch1_front_loop || s.flags.trig_lobby_front_loop) && !s.flags.register_done },
    { id: 'dawn', rect: [14, 25, 2, 2], to: 'exterior', anchor: 'dawn_steps', cond: (s) => !!s.flags.register_done },
  ],
  triggers: [
    { id: 'enter_lobby', rect: [12, 17, 6, 1], script: 'ch1.enter_lobby', once: true, cond: CH1 },
    // The outer doorway (DESIGN §9.2: vestibule exit refused until Danny vanishes).
    { id: 'vestibule_refuse', rect: [14, 25, 2, 2], script: 'ch1.vestibule_refuse', once: false,
      cond: (s) => !s.flags.ch1_danny_vanished },
    { id: 'front_loop', rect: [14, 25, 2, 2], script: 'ch1.front_loop', once: true,
      cond: (s) => !!s.flags.ch1_danny_vanished && !s.flags.ch1_front_loop && !s.flags.register_done },
    // Ch6 breather / Ch7 start: whichever side Tess comes in from.
    { id: 'ch6_breather_w', rect: [5, 4, 1, 14], script: 'ch6.breather', once: true,
      cond: (s) => !!s.flags.safe_open && !s.flags.ch6_breather_done },
    { id: 'ch6_breather_e', rect: [23, 4, 1, 14], script: 'ch6.breather', once: true,
      cond: (s) => !!s.flags.safe_open && !s.flags.ch6_breather_done },
    { id: 'ch7_start_w', rect: [5, 4, 1, 14], script: 'ch7.start', once: true,
      cond: (s) => !!s.flags.ch6_marcus_taken && !s.flags.ch7_started },
    { id: 'ch7_start_e', rect: [23, 4, 1, 14], script: 'ch7.start', once: true,
      cond: (s) => !!s.flags.ch6_marcus_taken && !s.flags.ch7_started },
    // Ch8 PRESENT (narrative-5): first step into the vestibule on the way out — the friends cross into the
    // dawn; she doesn't.
    { id: 'ch8_vestibule', rect: [8, 21, 14, 1], script: 'ch8.vestibule', once: false,
      cond: (s) => !!s.flags.register_done && s.flags.ending === 'present' && !s.flags.ch8_doors_shut },
  ],
  lights: [
    { type: 'fluor', x: 9, y: 8, group: 'period' },
    { type: 'fluor', x: 21, y: 8, group: 'period' },
    { type: 'fluor', x: 5, y: 15, group: 'period' },
    { type: 'fluor', x: 15, y: 15, group: 'period' },
    { type: 'fluor', x: 24, y: 15, group: 'period', flicker: true },
    { type: 'fluor', x: 15, y: 22, group: 'period' },
    // Moonlight through the leaking skylight over the atrium: a pale pool on the inlay, under the portrait.
    { type: 'bulb', x: 15.5, y: 6.6, color: '#7f9cc4', radius: 4.6, intensity: 0.38, cage: false, glow: null },
    // The night through the outer doorway.
    { type: 'bulb', x: 14.5, y: 25.6, color: '#6f88b4', radius: 3.2, intensity: 0.3, cage: false, glow: null },
    // Ch7: warm light leaking under the auditorium doors once the Assembly is in session.
    { type: 'bulb', x: 9.5, y: 4.2, color: '#e9b277', radius: 2.4, intensity: 0.32, cage: false, glow: null, group: 'assembly', on: false },
  ],
  patrol: {
    nodes: { w: [3, 15], c: [15, 15], e: [25, 15], nw: [5, 7], n: [12, 6], ne: [22, 6], gate: [15, 17], vest: [15, 22] },
    edges: [['w', 'c'], ['c', 'e'], ['w', 'nw'], ['nw', 'n'], ['n', 'ne'], ['ne', 'e'], ['n', 'c'], ['c', 'gate'], ['gate', 'vest']],
    folds: [[13, 3], [16, 20]],
    peeks: [{ room: 'lobby_vestibule', door: [14, 20], look: [15, 22] }],
  },
  past: [
    {
      id: 'lobby_1979', rect: [2, 4, 26, 14], hint: 'One forty-four. Everybody\'s filing in.',
      objects: [{ type: 'portrait_colonel', x: 14, y: 3, state: 'seated' }],
      hide: ['lobby_portrait_empty', 'lobby_portrait_uniform', 'lobby_backpack'],
      figures: [
        { sprite: 'figure79', x: 9, y: 5, anim: 'idle_up', dir: 'up' },
        { sprite: 'figure79', x: 10, y: 6, anim: 'idle_up', dir: 'up' },
        { sprite: 'figure79', x: 9, y: 7, anim: 'idle_up', dir: 'up' },
        { sprite: 'figure79', x: 10, y: 8, anim: 'idle_left', dir: 'left' },
        { sprite: 'figure79', x: 11, y: 10, anim: 'idle_up', dir: 'up' },
        { sprite: 'figure79', x: 7, y: 9, anim: 'idle_right', dir: 'right' },
        { sprite: 'figure79', x: 13, y: 13, anim: 'walk_up', dir: 'up' },
        { sprite: 'figure79', x: 16, y: 6, anim: 'idle_down', dir: 'down' },
      ],
      setFlag: 'saw_lobby_past',
    },
  ],
};
