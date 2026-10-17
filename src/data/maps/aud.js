// AUDITORIUM — the Assembly (maps-A). CONTENT §2.11 · DESIGN §6 VII, VIII · 44×42, offset (53, -20).
// Centre axis = x 22 (between columns 21 and 22) = the lobby axis (world x 75).
//
//   North (rows 1–13): the stage block.
//     Music room (x 2–9, rows 4–11): Adair's room, behind the west wing. Chalkboard, practice
//       mirror `aud_music_mirror` (ch7.mirror), Adair's desk (sheet music doc alma_mater, the Ch7
//       battery `aud_battery`), eight band chairs facing the board, the phonograph
//       `aud_phonograph` (ch7.phonograph), Denise's clarinet case `aud_clarinet` (ch7.clarinet),
//       an upright piano. Two tall windows: the only moonlight in the building's back half.
//     West wing (x 11–13) — a bare work bulb burns here, the only steady light backstage.
//     Upstage crossover (rows 4–6, x 11–32): behind the curtain line (row 7, opaque velvet),
//       linking the wings: stage_left (west) ↔ stage_right (east). Old stage flats on the wall.
//     Stage (x 14–29, rows 8–13): the lectern `aud_lectern` dead centre (anchor `lectern` behind
//       it), the 1979 band's chairs and stands still set out, curtain legs, the spotlight (group
//       'assembly', off until the Assembly). Stage front (row 14) with steps at both ends; a small
//       door through the proscenium on each side (x 12, x 31) lets the front aisle reach the wings
//       without climbing onto the stage — still under his eyes, but further from the lectern.
//     Trap room (x 34–41, behind the east wing): lever `aud_lever` (ch7.lever), the trapdoor
//       `aud_trapdoor` / `aud_trapdoor_open` (by flag trapdoor_open; open → exit vault/from_aud),
//       fly-rail ropes, a work bulb (group 'assembly'), EXIT over the stage door `aud_stage_door`
//       (east wall; barred; ch7.stage_door unbars it; → lobby/stage_door).
//   House (rows 15–32): 8 rows × 2 banks of 13 seats (aud_seats.js), carpeted centre aisle (x 21–22)
//     and side aisles, front aisle (row 15) under the stage, back aisle (row 32). Ch7: ≈70% of the
//     seats hold husks; the friends' seats and the empty seats beside them are in row 1.
//   Foyer (rows 36–39): behind the house doors; south openings: x 16–17 → lobby/from_aud (the
//     lobby's working pair), x 27–28 refused (that pair is chained on the lobby side).
//
// Triggers: aud_enter (crossing into the house through either pair of house doors, once
// ch7_started) → ch7.aud_enter. Roll call #3 / front-row scenes / the READ–SCAN cycle are the
// Assembly system's: seats carry `row`; the friends' neighbour seats carry `front`.
// Past views: music_1979 (band call; Adair at the board, Denise practising), wings_1979 (the
// stamps changing hands in the wings while the band played).
import { audSeats } from './aud_seats.js';

const has = (s, id) => (s.party || []).includes(id);
const trapOpen = (s) => !!(s.flags.trapdoor_open || s.mapState?.aud?.aud_trapdoor?.state === 'open');
const ALONE = (s) => !(s.party || []).length;

export default {
  id: 'aud',
  name: 'Auditorium',
  floor: '1F',
  offset: [53, -20],
  ambience: 'auditorium',
  music: null,
  dark: 0.95,
  ambient: '#0a0d18',
  //   x → 0         1         2         3         4
  //       01234567890123456789012345678901234567890123
  tiles: [
    '                                            ', //  0
    ' ##########BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB ', //  1  back wall: top
    ' #W######W#BBBBBBBBBBBBBBBBBBBBBBBBUBBBBBBB ', //  2  face_high
    ' #W######W#BBBBBBBBBBBBBBBBBBBBBBBBUBBBBBBB ', //  3  face_low: chalkboard, mirror | work bulb | lever, ropes, EXIT
    ' #........#======================B::::::::D ', //  4  music room | crossover | trap room · stage door
    ' #........#======================B::::::::B ', //  5
    ' #........D======================D::::::::B ', //  6  wing doors (x10, x33)
    ' #........#======================B::::::::B ', //  7  curtain line (props, x14-29)
    ' #........#======================B::::::::B ', //  8  stage
    ' #........#======================B::::::::B ', //  9
    ' #........#======================B::::::::B ', // 10
    ' #........#======================BBBBBBBBBB ', // 11
    ' ####PPPPPPPDP================PDPPPPPPP     ', // 12  proscenium wall: top · wing doors x12, x31
    '     PPPPPPPDP================PDPPPPPPP     ', // 13  face_high
    '     PPPPPPPDP^FFFFFFFFFFFFFF^PDPPPPPPP     ', // 14  face_low · stage front + steps
    '     P""""""""""""""""""""""""""""""""P     ', // 15  front aisle
    '     P""=============""=============""P     ', // 16  row 1
    '     P""=============""=============""P     ', // 17
    '     P""=============""=============""P     ', // 18  row 2
    '     P""=============""=============""P     ', // 19
    '     P""=============""=============""P     ', // 20  row 3
    '     P""=============""=============""P     ', // 21
    '     P""=============""=============""P     ', // 22  row 4
    '     P""=============""=============""P     ', // 23
    '     P""=============""=============""P     ', // 24  row 5
    '     P""=============""=============""P     ', // 25
    '     P""=============""=============""P     ', // 26  row 6
    '     P""=============""=============""P     ', // 27
    '     P""=============""=============""P     ', // 28  row 7
    '     P""=============""=============""P     ', // 29
    '     P""=============""=============""P     ', // 30  row 8
    '     P""=============""=============""P     ', // 31
    '     P""""""""""""""""""""""""""""""""P     ', // 32  back aisle
    '     PPPPPPPPPPPDDPPPPPPPPPDDPPPPPPPPPP     ', // 33  house back wall: top (house doors)
    '     PPPPPPPPPPPDDPPPPPPPPPDDPPPPPPPPPP     ', // 34  face_high (seen from the foyer)
    '     PPPPPPPPPPPDDPPPPPPPPPDDPPPPPPPPPP     ', // 35  face_low
    '     BssssssssssssssssssssssssssssssssB     ', // 36  foyer
    '     BssssssssssssssssssssssssssssssssB     ', // 37
    '     BssssssssssssssssssssssssssssssssB     ', // 38
    '     BssssssssssssssssssssssssssssssssB     ', // 39
    '     BBBBBBBBBBBssBBBBBBBBBssBBBBBBBBBB     ', // 40  openings to the lobby's two door pairs
    '                                            ', // 41
  ],
  objects: [
    // ================================================================== music room (x 2–9)
    { id: 'aud_chalk_music', type: 'chalkboard', x: 3, y: 3, state: 'text', text: 'ALMA MATER  m.1-16',
      examine: ['[n] A chalkboard, almost clean. Staff lines drawn with a five-chalk holder, and in neat cursive: ALMA MATER, mm. 1–16.',
        '[n] Under it, smaller, a different hand: DON\'T RUSH THE HELD NOTE.'] },
    { id: 'aud_music_mirror', type: 'mirror', x: 6, y: 3, state: 'grimy', script: 'ch7.mirror' },
    { id: 'aud_music_clock', type: 'clock_wall', x: 7, y: 3, params: { time: 1 + 46 / 60 },
      examine: '[n] One forty-six. In here it\'s always just after the assembly started.' },
    { type: 'poster', x: 8, y: 3, state: 'band',
      examine: '[n] HALLOWELL COLLIERS MARCHING BAND — FALL 1979. Thirty kids in green and gold on the football field, squinting.' },
    { id: 'aud_adair_chair', type: 'chair_teacher', x: 3, y: 4, dir: 'down',
      examine: '[n] Her chair. A cushion somebody stitched for her, with a felt treble clef, gone flat.' },
    { id: 'aud_adair_desk', type: 'desk_teacher', x: 3, y: 5, dir: 'down', doc: 'alma_mater',
      examine: [
        { cond: (s) => !!s.docs?.alma_mater, text: '[n] Her desk. The sheet music, a red pen-cap, a mug with a ring of something dried in it.' },
        { text: ['[n] Adair\'s desk. A grade book, a red pen-cap with no pen, a stack of sheet music.', '[n] The top copy: HALLOWELL ALMA MATER, arr. R. Adair.'] },
      ] },
    { id: 'aud_battery', type: 'pickup', x: 4, y: 5, item: 'battery',
      examine: '[n] A battery in her desk drawer, rolled to the back. Like she kept a spare for somebody.' },
    { type: 'music_stand', x: 5, y: 6 },
    { type: 'music_stand', x: 7, y: 6 },
    { type: 'chair_library', x: 4, y: 7, dir: 'up', sitDir: 'up' },
    { type: 'chair_library', x: 5, y: 7, dir: 'up', sitDir: 'up' },
    { type: 'chair_library', x: 6, y: 7, dir: 'up', sitDir: 'up' },
    { type: 'chair_library', x: 7, y: 7, dir: 'up', sitDir: 'up' },
    { type: 'music_stand', x: 4, y: 8 },
    { type: 'music_stand', x: 6, y: 8 },
    { type: 'chair_library', x: 4, y: 9, dir: 'up', sitDir: 'up' },
    { type: 'chair_library', x: 5, y: 9, dir: 'up', sitDir: 'up' },
    { type: 'chair_library', x: 6, y: 9, dir: 'up', sitDir: 'up',
      examine: '[n] Somebody\'s initials scratched in the seat: D.W. A little treble clef after them.' },
    { type: 'chair_library', x: 7, y: 9, dir: 'up', sitDir: 'up' },
    { id: 'aud_clarinet', type: 'instrument_case', x: 2, y: 7, script: 'ch7.clarinet' },
    { id: 'aud_phonograph', type: 'phonograph', x: 9, y: 9, script: 'ch7.phonograph' },
    { id: 'aud_piano', type: 'piano', x: 2, y: 11,
      examine: ['[n] An upright piano, keys gone the yellow of old teeth.', '[n] I press middle C. It\'s in tune. It shouldn\'t be in tune.'] },
    { type: 'bookshelf_low', x: 8, y: 11,
      examine: '[n] Method books. RUBANK ELEMENTARY METHOD — CLARINET, six copies, one with a name inked on the edge: WEBB.' },
    { type: 'decal_papers', x: 5, y: 10 },           // sheet music on the floor
    { type: 'decal_papers', x: 8, y: 7 },
    { type: 'cobweb', x: 9, y: 4 },

    // ================================================================== west wing + crossover
    { id: 'aud_worklight_w', type: 'cage_bulb', x: 12, y: 3, state: 'on',
      light: { type: 'bulb', radius: 3.4, intensity: 0.5, flicker: 'brownout' },
      examine: ['[n] A bare work bulb in a cage, left burning on the back wall.', '[sad] Theater people leave one burning so nobody walks off the stage in the dark. Leah told me that.'] },
    { type: 'music_stand', x: 13, y: 10, examine: '[n] A music stand, folded half shut, like somebody dropped it and left in a hurry.' },
    { type: 'decal_papers', x: 12, y: 9 },
    { type: 'decal_papers', x: 13, y: 11 },
    { id: 'aud_flat_1928', type: 'stage_flat', x: 15, y: 4, label: 'HOMECOMING 1928',
      examine: ['[n] A painted flat leaning on the back wall: HOMECOMING 1928. Bunting, a big gold sun, the paint flaking off the sun.', '[worried] Nineteen twenty-eight. Seventeen years after he died.'] },
    { type: 'cobweb', x: 11, y: 4 },
    { type: 'cobweb', x: 32, y: 4 },
    { type: 'decal_stain', x: 20, y: 5 },

    // ================================================================== stage
    // The curtain line: upstage traveler, closed for good — the crossover runs behind it.
    ...Array.from({ length: 16 }, (_, i) => ({ type: 'curtain', x: 14 + i, y: 7, state: 'closed' })),
    { type: 'curtain', x: 14, y: 8, state: 'closed' },   // legs masking the wings
    { type: 'curtain', x: 14, y: 9, state: 'closed' },
    { type: 'curtain', x: 29, y: 8, state: 'closed' },
    { type: 'curtain', x: 29, y: 9, state: 'closed',
      examine: '[n] Red velvet, worn to the weave. Up close it smells like wet wool. And pennies.' },
    // The 1979 band, chairs still set out facing the house.
    { type: 'chair_library', x: 16, y: 9, dir: 'down' },
    { type: 'chair_library', x: 17, y: 9, dir: 'down' },
    { type: 'chair_library', x: 18, y: 9, dir: 'down' },
    { type: 'music_stand', x: 16, y: 10 },
    { type: 'music_stand', x: 18, y: 10 },
    { type: 'chair_library', x: 25, y: 9, dir: 'down' },
    { type: 'chair_library', x: 26, y: 9, dir: 'down',
      examine: '[n] A band chair. A clarinet reed on the seat, split down the middle.' },
    { type: 'chair_library', x: 27, y: 9, dir: 'down' },
    { type: 'music_stand', x: 25, y: 10 },
    { type: 'music_stand', x: 27, y: 10 },
    { id: 'aud_lectern', type: 'lectern',
      x: 21, y: 12,
      examine: [
        { cond: (s) => !!s.flags.register_done, text: '[n] The lectern. Nobody behind it.' },
        { text: ['[n] An oak lectern with a gooseneck lamp. A long roll of paper hangs over the front of it, down to the boards.', '[scared] Names. Hundreds. The top line is in red.'] },
      ] },
    { type: 'decal_papers', x: 22, y: 13 },          // the roll, trailing off the front of the lectern

    // ================================================================== east wing + trap room
    { id: 'aud_flat_1979', type: 'stage_flat', x: 31, y: 11, label: 'HOMECOMING 1979',
      examine: ['[n] A flat painted for the assembly: HOMECOMING 1979. The gold\'s still bright.', '[sad] They only ever got to use it once.'] },
    { type: 'decal_papers', x: 31, y: 8 },
    { id: 'aud_wing_chair', type: 'chair_library', x: 32, y: 8, dir: 'left', sitDir: 'left',
      examine: '[n] A folding chair turned toward the stage. Somebody sat here to watch the assembly from the wings.' },
    { id: 'aud_lever', type: 'lever', x: 36, y: 3, state: 'up', script: 'ch7.lever' },
    { id: 'aud_worklight_e', type: 'cage_bulb', x: 37, y: 3, state: 'on',
      light: { type: 'bulb', radius: 3.6, intensity: 0.6, group: 'assembly' } },     // on with the Assembly
    { id: 'aud_ropes', type: 'rope_rail', x: 39, y: 3,
      examine: ['[n] The fly rail. Ropes tied off to iron pins, sandbags hanging in the dark overhead.', '[worried] One rope is still swinging. Very slightly.'] },
    { id: 'aud_exit_stage', type: 'exit_sign', x: 41, y: 3, state: 'on',
      examine: [
        { cond: (s) => s.mapState?.aud?.aud_stage_door?.state === 'open', text: '[n] EXIT. The stage door\'s open. It comes out in the lobby.' },
        { text: '[n] EXIT, over the stage door. It\'s the only sign back here that still lights.' },
      ] },
    { id: 'aud_trapdoor', type: 'trapdoor', x: 37, y: 7, state: 'closed', cond: (s) => !trapOpen(s),
      examine: ['[n] A square cut in the boards, with an iron ring. It doesn\'t budge.', '[n] Warm air breathes up through the cracks. It smells like a coal stove.'] },
    { id: 'aud_trapdoor_open', type: 'trapdoor', x: 37, y: 7, state: 'open', cond: trapOpen },
    { type: 'shelf_metal', x: 40, y: 10,
      examine: '[n] Paint cans, a coil of cable, colored gels gone brittle. A box labelled XMAS PAGEANT.' },
    { type: 'mop_bucket', x: 34, y: 10 },
    { type: 'decal_stain', x: 35, y: 8 },

    // ================================================================== proscenium (house side faces, row 14)
    { id: 'aud_banner_founders', type: 'banner', x: 7, y: 14, state: 'founders',
      examine: '[n] FOUNDER\'S DAY, in gold on navy. Hung for the assembly. Nobody ever took it down.' },
    { id: 'aud_exit_w', type: 'exit_sign', x: 11, y: 14, state: 'flicker',
      examine: '[n] EXIT, buzzing red over the little door to the wings. It\'s the only way out that isn\'t past him.' },
    { type: 'flag_us', x: 13, y: 14, examine: '[n] A flag on a short pole, faded to pink and gray. The stars have gone the color of the stripes.' },
    { id: 'aud_clock', type: 'clock_wall', x: 30, y: 14, params: { time: 1 + 45 / 60 },
      examine: [
        { cond: (s) => !!s.flags.register_done, text: '[n] The clock\'s hands have moved. For the first time.' },
        { text: '[n] One forty-five. It\'s been one forty-five in here for seventeen years.' },
      ] },
    { id: 'aud_exit_e', type: 'exit_sign', x: 32, y: 14, state: 'dead', examine: '[n] EXIT, dead, over the stage-right door.' },
    { id: 'aud_banner_hc', type: 'banner', x: 33, y: 14, state: 'homecoming79',
      examine: '[n] HOMECOMING \'79, in green on butcher paper. Somebody worked hard on the letters.' },

    // ================================================================== house
    ...audSeats(),
    { type: 'decal_papers', x: 21, y: 25 },          // programs dropped in the aisles
    { type: 'decal_papers', x: 6, y: 21 },
    { type: 'decal_papers', x: 37, y: 28 },
    { id: 'aud_aisle_shell', type: 'cicada_shells', x: 22, y: 19,
      examine: ['[n] A cicada shell on the carpet, split down the back.', '[worried] There aren\'t any trees in here.'] },
    { type: 'decal_stain', x: 36, y: 17 },
    { type: 'decal_stain', x: 7, y: 30 },

    // ================================================================== foyer
    { type: 'poster', x: 10, y: 35, state: 'band' },
    { id: 'aud_foyer_board', type: 'bulletin_board', x: 21, y: 35, state: 'generic',
      examine: ['[n] FOUNDER\'S DAY ASSEMBLY — FRIDAY 1:45 — ALL STUDENTS, ALL GRADES.', '[n] And under it, typed: ATTENDANCE WILL BE TAKEN.'] },
    { type: 'clock_wall', x: 32, y: 35, params: { time: 1 + 45 / 60 } },
    { id: 'aud_program', type: 'note_paper', x: 20, y: 37,
      examine: ['[n] A mimeographed program, purple ink. FOUNDER\'S DAY ASSEMBLY, OCTOBER 19, 1979.',
        '[n] Invocation. Pledge. Remarks — Principal G. Haupt. Presentation of the Roll. Alma Mater — Hallowell Band, arr. R. Adair.',
        '[worried] Presentation of the Roll. Like it was a prize.'] },
    { type: 'decal_papers', x: 12, y: 37 },
    { type: 'decal_papers', x: 30, y: 38 },
    { type: 'decal_stain', x: 26, y: 39 },
    { id: 'aud_coat_rack', type: 'coat_rack', x: 36, y: 36,
      examine: ['[n] A bentwood coat rack. One raincoat, kid-size, yellow, with a name tag sewn in the collar.', '[sad] Nobody came back for it.'] },
    { type: 'trash_can', x: 25, y: 36 },
    { type: 'plant_dead', x: 6, y: 36 },
    { id: 'aud_foyer_bench_w', type: 'bench', x: 8, y: 39 },
    { id: 'aud_foyer_bench_e', type: 'bench', x: 33, y: 39 },
  ],
  doors: {
    '10,6': { id: 'aud_music_door', label: 'MUSIC' },
    '33,6': { id: 'aud_trap_door_room', label: 'STAGE CREW ONLY' },
    '12,14': { id: 'aud_wing_door_w', label: 'STAGE LEFT' },     // house ↔ west wing (the quieter way up)
    '31,14': { id: 'aud_wing_door_e', label: 'STAGE RIGHT' },    // house ↔ east wing
    '16,35': { id: 'aud_house_doors_w', label: 'AUDITORIUM' },
    '27,35': { id: 'aud_house_doors_e', label: 'AUDITORIUM' },
    // Stage door → lobby NE corner. Barred on this side; ch7.stage_door unbars it (sets it 'open').
    '42,4': {
      id: 'aud_stage_door', type: 'door_side', state: 'locked', label: 'STAGE DOOR', script: 'ch7.stage_door',
      autoClose: false, to: { map: 'lobby', anchor: 'stage_door' },
      lockedText: '[n] A steel door with a bar dropped across it, in iron brackets. It lets out into the lobby.',
    },
  },
  rooms: [
    { id: 'aud_music', name: 'Music Room', rect: [2, 4, 8, 8], kind: 'classroom' },
    { id: 'aud_trap', name: 'Trap Room', rect: [34, 4, 8, 7], kind: 'special' },
    { id: 'aud_crossover', name: 'Crossover', rect: [11, 4, 22, 3], kind: 'special' },
    { id: 'aud_wing_w', name: 'Stage Left', rect: [11, 7, 3, 5], kind: 'special' },
    { id: 'aud_wing_e', name: 'Stage Right', rect: [30, 7, 3, 5], kind: 'special' },
    { id: 'aud_stage', name: 'Stage', rect: [14, 7, 16, 8], kind: 'auditorium' },
    { id: 'aud_house', name: 'Auditorium', rect: [6, 15, 32, 18], kind: 'auditorium' },
    { id: 'aud_foyer', name: 'Auditorium Foyer', rect: [6, 36, 32, 4], kind: 'hall' },
  ],
  anchors: {
    from_lobby: [16, 38, 'up'],        // first anchor: in the foyer, through the lobby's working pair
    back_row: [21, 31, 'up'],          // centre aisle behind row 8
    lectern: [21, 11, 'down'],         // where he stands, behind the lectern
    // Front row: anchors stand on the front aisle just north of each seat (seat ids in aud_seats.js).
    front_row_danny: [10, 15, 'down'],
    beside_danny: [11, 15, 'down'],
    front_row_leah: [17, 15, 'down'],
    beside_leah: [18, 15, 'down'],
    denise_husk: [26, 15, 'down'],
    front_row_marcus: [27, 15, 'down'],
    beside_marcus: [28, 15, 'down'],
    music_room: [8, 6, 'left'],
    music_mirror: [6, 4, 'up'],
    clarinet_case: [3, 7, 'left'],
    trap_room: [35, 6, 'right'],
    trapdoor: [37, 10, 'up'],          // arrival from vault (beside the hatch, not on it)
    stage_left: [12, 5, 'right'],
    stage_right: [31, 5, 'left'],
    stage_door: [40, 5, 'left'],       // arrival from the lobby's stage door
  },
  exits: [
    { id: 'lobby', rect: [16, 40, 2, 1], to: 'lobby', anchor: 'from_aud' },
    { id: 'lobby_east', rect: [27, 40, 2, 1], to: 'lobby', anchor: 'from_aud', lock: () => true,
      lockedText: '[n] The other pair of doors. Chained on the lobby side.' },
    { id: 'stage_door', rect: [42, 4, 1, 1], to: 'lobby', anchor: 'stage_door' },   // once it stands open
    { id: 'trapdoor', rect: [37, 7, 2, 2], to: 'vault', anchor: 'from_aud', cond: trapOpen },
  ],
  triggers: [
    { id: 'aud_enter', rect: [16, 33, 13, 1], script: 'ch7.aud_enter', once: true, cond: (s) => !!s.flags.ch7_started },
  ],
  lights: [
    // The Assembly: one spotlight on the lectern (the system drifts it on the telegraph).
    { type: 'spot', x: 21, y: 11.3, group: 'assembly', on: false },
    // Warm light seeping around the house doors into the foyer while the Assembly is in session.
    { type: 'bulb', x: 16.5, y: 36, color: '#e9b277', radius: 2.4, intensity: 0.3, cage: false, glow: null, group: 'assembly', on: false },
    { type: 'bulb', x: 27.5, y: 36, color: '#e9b277', radius: 2.4, intensity: 0.3, cage: false, glow: null, group: 'assembly', on: false },
  ],
  past: [
    {
      id: 'music_1979', rect: [2, 4, 8, 8], hint: 'Band call. She\'s counting them in.',
      objects: [{ type: 'chair_library', x: 8, y: 8, dir: 'down' }],
      hide: ['aud_battery'],
      figures: [
        { sprite: 'denise', x: 8, y: 8, anim: 'sit_play', dir: 'down' },
        { sprite: 'figure79', x: 5, y: 7, anim: 'sit_up', dir: 'up' },
        { sprite: 'figure79', x: 7, y: 9, anim: 'sit_up', dir: 'up' },
      ],
      adair: { x: 5, y: 4, anim: 'idle_down', dir: 'down' },
      text: [{ x: 3, y: 3, text: 'BAND CALL 1:15', style: 'chalk' }],
      setFlag: 'saw_music_past',
    },
    {
      id: 'wings_1979', rect: [11, 7, 3, 5], hint: 'He wants something back. She won\'t let go.',
      figures: [{ sprite: 'figure79', x: 12, y: 8, anim: 'idle_left', dir: 'left' }],
      adair: { x: 11, y: 8, anim: 'idle_right', dir: 'right' },
      setFlag: 'saw_wings_past',
    },
  ],
};
