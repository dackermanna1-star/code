// GYMNASIUM (gym) · 44×40 · offset (152, 16) · CONTENT §2.6 · maps-C
//
// The Ch6 set piece. A dark, high, rain-drummed box: the court runs east–west (rows 4–24), the
// entrance is in the WEST wall (x 1, rows 21–22 = world 37–38, the same rows as east1's gym doors),
// so Tess walks in at the near (west) end and the far (east) hoop sits in the only corner the high
// windows never reach.
//
//   North wall: tall windows (x 6–7, 12–13, 18–19, 24–25) throw moonlight shafts across the
//     BLEACHERS (four 6-wide sections, x 8–31, rows 4–6). Denise sits on `gym_bleachers_denise`
//     (x 14–19) at its east end; `gym_bleachers_marcus` (x 20–25) is the section beside her.
//     GO COLLIERS banner (x 2–5), gym clock, the SCOREBOARD `gym_scoreboard` (x 34–36, dead → on)
//     over the dark east end.
//   Court: center circle (x 20–23, rows 14–17), sidelines, baselines, keys; hoop stands west (x 2–3)
//     and east (x 40–41); under the east hoop the dark heap `gym_heap` (a mat stack in the
//     Colonel's navy, cond !ch6_gym_lights) with anchor `colonel_hoop` in front of it. A real stack
//     of mats by the doors (the decoy you check first), the collapsed bleacher that jammed the doors,
//     dragged into the NW corner, two puddles where the roof leaks.
//   FOUR LIGHT BANKS (fluor, groups gym1..gym4, x 6 / 16 / 26 / 37, three tubes each, on:false):
//     near → far, the last one over the hoop.
//   South wall doors: GIRLS (x 11 — the chase goal), EQUIPMENT (x 26, locked), BOYS (x 35, jammed).
//   Girls' locker room (x 9–20): two banks of tall lockers (opaque: line of sight breaks behind
//     them). Bank A (row 31, x 9–16) is the privacy baffle in front of the door and ends in the one
//     locker hanging open, `gym_locker_tess` (x 16, hide:'locker', ch6.locker), facing the aisle
//     (row 32) he will walk, tapping; bank B (row 35, x 9–17) behind. A dying caged bulb over the
//     east aisle is the only light. Route: door → east along rows 28–30 → round the end of bank A →
//     the open locker (≈ 8 tiles inside the door, out of sight of the door and the court).
//   Showers (x 2–7, through the opening at x 8 rows 28–29): four sinks under `gym_mirror_1..4`,
//     a partition, gang showers behind it. Trigger → ch6.showers.
//
// Notes for scripts:
//   - Denise: spawn at anchor `denise` and seat her with HW.hiding.seatNpc(e, map.prop('gym_bleachers_denise'))
//     (she lands on the front tier at x 19); Marcus: anchor `beside_denise`, prop `gym_bleachers_marcus`
//     (one sitter per bleacher prop). Anchors cannot sit on solid seats (reachability check).
//   - The banks are map lights with on:false: setGroup('gymN', true, { mode: 'bang' }), 0.45 s apart.
//     Group state is not saved — after a reload with ch6_gym_lights set, re-light gym1..gym4.
//   - The way out (`gym_doors_w`/`_w2` + the exit rect) shuts while ch6_gym_lights && !denise_photo:
//     there is no leaving the chase except through the locker room.
//   - `gym_photo` (Denise's photo on the boards where Marcus was) shows from ch6_marcus_taken until
//     Tess holds denise_photo; ch6.after_locker should g.removeProp('gym_photo') or g.refresh() after the give.
//
//   x →  0         1         2         3         4
//        01234567890123456789012345678901234567890123

const F = (s) => s.flags || {};
const inv = (s, id) => ((s.inv && s.inv[id]) || 0) > 0;
const withMarcus = (s) => (s.party || []).includes('marcus');
const lit = (s) => !!F(s).ch6_gym_lights;
const alone = (s) => !!F(s).ch6_marcus_taken;
const shut = (s) => lit(s) && !inv(s, 'denise_photo');   // the gym holds her until she has the photo
// before the lights (with Marcus) → after (alone, literal)
const v = (before, after) => (after ? [{ cond: lit, text: after }, { text: before }] : before);
const M = (text) => ({ marcus: [{ cond: (s) => withMarcus(s) && !lit(s), text }] });

const doorsShutText = (s) => (F(s).roll2_done || alone(s)
  ? ['[sad] Not yet.', "[sad] Marcus's photo. It's still on the floor."]
  : ['[terrified] Shut. They shut. {p} Not this way—']);

const LOCKER_TEXT = (name) => [
  { cond: (s) => lit(s) && !F(s).roll2_done, text: '[terrified] Locked— locked—' },
  { text: `[n] Locked. A strip of masking tape: ${name}.` },
];

// court markings (decals): sidelines, baselines, both keys
const markings = () => {
  const out = [];
  for (let x = 4; x <= 39; x++) out.push({ type: 'court_line_h', x, y: 8 }, { type: 'court_line_h', x, y: 23 });
  for (let y = 9; y <= 22; y++) out.push({ type: 'court_line_v', x: 4, y }, { type: 'court_line_v', x: 39, y });
  for (const [x0, xl] of [[5, 9], [34, 34]]) {
    for (let x = x0; x < x0 + 5; x++) out.push({ type: 'court_line_h', x, y: 13 }, { type: 'court_line_h', x, y: 18 });
    for (let y = 14; y <= 17; y++) out.push({ type: 'court_line_v', x: xl, y });
  }
  return out;
};

export default {
  id: 'gym',
  name: 'Gymnasium',
  floor: '1F',
  offset: [152, 16],
  ambience: 'gym',
  music: null,
  dark: 0.95,
  ambient: '#0a0f1c',
  tiles: [
    '                                            ', //  0
    ' GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG ', //  1  north wall: top
    ' GGGGGUUGGGGGUUGGGGGUUGGGGGUUGGGGGGGGGGGGGG ', //  2  face_high — high windows, none over the east end
    ' GGGGGUUGGGGGUUGGGGGUUGGGGGUUGGGGGGGGGGGGGG ', //  3  face_low (banner, clock, scoreboard)
    ' G========================================G ', //  4  bleachers rows 4–6 (x 8–31)
    ' G========================================G ', //  5
    ' G========================================G ', //  6
    ' G========================================G ', //  7
    ' G========================================G ', //  8  sideline
    ' G========================================G ', //  9
    ' G========================================G ', // 10
    ' G=============================~~=========G ', // 11  roof leak
    ' G========================================G ', // 12
    ' G========================================G ', // 13  keys
    ' G========================================G ', // 14  center circle x 20–23
    ' G========================================G ', // 15  hoops · the heap (x 37–38)
    ' G========================================G ', // 16
    ' G========================================G ', // 17
    ' G========================================G ', // 18
    ' G==========~~============================G ', // 19  roof leak
    ' G========================================G ', // 20
    ' =========================================G ', // 21  ← east1 (door_side leaves at x 1)
    ' =========================================G ', // 22
    ' G========================================G ', // 23  sideline
    ' G========================================G ', // 24
    ' GTTTTTTTGGDGGGGGGGGGGGGGGDGGGGGGGGDGGGGGGG ', // 25  court south wall: GIRLS x 11 · EQUIPMENT x 26 · BOYS x 35
    ' GTTTTTTTGGDGGGGGGGGGGGGGGDGGGGGGGGDGGGGGGG ', // 26
    ' GTTTTTTTGGDGGGGGGGGGGGGGGDGGGGGGGGDGGGGGGG ', // 27  face_low (mirrors x 3–6)
    ' G_______............G::::::::G...........G ', // 28  showers | girls' LR | equipment | boys' LR
    ' G_______............G::::::::G...........G ', // 29
    ' G______T............G::::::::G...........G ', // 30
    ' GTTTTT_T............G::::::::G...........G ', // 31  shower partition (opening x 7) · locker bank A (x 9–16), the open one at x 16
    ' GTTTTT_T............G::::::::G...........G ', // 32
    ' GTTTTT_T............G::::::::G...........G ', // 33  shower heads on the partition face
    ' G______T............G::::::::G...........G ', // 34
    ' G______T............G::::::::G...........G ', // 35  locker bank B (x 9–17)
    ' G______T............G::::::::G...........G ', // 36
    ' G______T............G::::::::G...........G ', // 37
    ' GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG ', // 38
    '                                            ', // 39
  ],

  objects: [
    // ======================================================== the way back to east1 (west wall)
    { id: 'gym_doors_w', type: 'door_side', x: 1, y: 21, state: 'open', autoClose: false, label: 'EAST HALL', cond: (s) => !shut(s) },
    { id: 'gym_doors_w2', type: 'door_side', x: 1, y: 22, state: 'open', autoClose: false, label: 'EAST HALL', cond: (s) => !shut(s) },
    { id: 'gym_doors_shut', type: 'door_side', x: 1, y: 21, state: 'locked', lock: shut, lockedText: doorsShutText, label: 'EAST HALL', cond: shut },
    { id: 'gym_doors_shut2', type: 'door_side', x: 1, y: 22, state: 'locked', lock: shut, lockedText: doorsShutText, label: 'EAST HALL', cond: shut },

    // ======================================================== north wall
    { id: 'gym_banner', type: 'banner', x: 2, y: 3, state: 'colliers',
      examine: v(['[n] GO COLLIERS — DIG DEEP! Butcher paper, half of it hanging by one strip of tape.'], '[n] DIG DEEP.') },
    { id: 'gym_clock', type: 'clock_wall', x: 31, y: 3,
      examine: v('[n] The gym clock, in its wire cage. Twenty to two.', '[scared] Twenty to two. It never moved. The lights came on and it never moved.') },
    { id: 'gym_scoreboard', type: 'scoreboard', x: 34, y: 3, state: 'dead',
      examine: [
        { cond: lit, text: ['[n] HOME 19. GUEST 79.', "[scared] That's not a score."] },
        { text: ['[n] HOME. GUEST. PERIOD. Rows of dead bulbs.', "[worried] Nobody's keeping score. Good."] },
      ] },

    // ======================================================== bleachers (north side)
    { id: 'gym_bleachers_a', type: 'bleachers', x: 8, y: 4, state: 'out' },
    { id: 'gym_bleachers_denise', type: 'bleachers', x: 14, y: 4, state: 'out' },
    { id: 'gym_bleachers_marcus', type: 'bleachers', x: 20, y: 4, state: 'out' },
    { id: 'gym_bleachers_d', type: 'bleachers', x: 26, y: 4, state: 'out' },
    // the section that jammed the doors, dragged into the corner
    { id: 'gym_bleachers_fallen', type: 'bleachers', x: 2, y: 8, state: 'fallen',
      examine: v(['[n] A section of bleachers, collapsed. Two long scrapes in the floor run from the doors to here.',
        '[worried] Somebody dragged a ton of wood across a gym so we could get in.'], '[n] The scrape marks. From the doors to here.'),
      banter: M('[worried] It wanted us in here.') },
    { type: 'decal_stain', x: 4, y: 12 },
    { type: 'decal_stain', x: 3, y: 17 },
    { type: 'decal_tiles', x: 6, y: 14 },

    // ======================================================== the court
    { id: 'gym_circle', type: 'court_circle', x: 20, y: 14,
      examine: v("[n] Center court: a big green C with a coal pick through it. GO COLLIERS.", '[n] Center court.') },
    ...markings(),
    { id: 'gym_hoop_w', type: 'hoop_stand', x: 2, y: 15, dir: 'right',
      examine: v('[n] A rolling hoop stand. The net has rotted down to a few strings.', '[n] The near hoop.') },
    { id: 'gym_hoop_e', type: 'hoop_stand', x: 40, y: 15, dir: 'left',
      examine: v('[n] The far hoop. Somebody hung a crepe-paper streamer from the rim, green and gold.', '[terrified] The far hoop.') },
    // the dark heap under the far hoop — him, in the dark (exposure #12 waits for the lights)
    { id: 'gym_heap', type: 'mat_stack', x: 37, y: 15, cond: (s) => !lit(s),
      examine: '[worried] Gym mats. {p} ...Just gym mats.' },
    // the real mats, by the doors: the stack you check first
    { id: 'gym_mats', type: 'mat_stack', x: 3, y: 23,
      examine: v(['[n] Gym mats, folded and stacked. Blue vinyl split at the corners.', "[skeptical] Smells like every gym class I ever got out of."],
        "[scared] Mats. These are just mats. I checked. I checked."),
      banter: M('[neutral] Same ones at Tabor. Same smell.') },
    { id: 'gym_balls', type: 'ball_cart', x: 41, y: 23,
      examine: v('[n] A cart of basketballs, every one gone soft as fruit.', '[n] Soft basketballs.') },
    // Denise's photo, where Marcus sat (after he's taken, until Tess holds it)
    { id: 'gym_photo', type: 'note_paper', x: 19, y: 9, variant: 1, interact: false,
      cond: (s) => alone(s) && !inv(s, 'denise_photo') },
    // dance decorations that came down; the leaks
    { type: 'decal_papers', x: 9, y: 9 },
    { type: 'decal_papers', x: 27, y: 20 },
    { type: 'decal_papers', x: 33, y: 9 },
    { type: 'decal_tiles', x: 31, y: 12 },
    { type: 'decal_stain', x: 13, y: 21 },
    { type: 'decal_stain', x: 29, y: 11 },
    { type: 'decal_stain', x: 24, y: 7 },
    { type: 'cicada_shells', x: 7, y: 7 },

    // ======================================================== girls' locker room
    { id: 'gym_lr_exit', type: 'exit_sign', x: 12, y: 27, state: 'on' },
    { id: 'gym_lr_board', type: 'bulletin_board', x: 14, y: 27, state: 'generic',
      examine: v(["[n] GIRLS' PHYS. ED. — SHOWERS ARE REQUIRED — NO EXCEPTIONS. — MRS. KOWALCZYK",
        '[n] Under it: HOMECOMING DANCE DECORATING — SAT. 9 A.M. — BRING TAPE.'], '[n] BRING TAPE.') },
    { id: 'gym_lr_clock', type: 'clock_wall', x: 17, y: 27,
      examine: v('[n] Twenty to two.', '[scared] Twenty to two.') },
    { type: 'poster', x: 19, y: 27, state: 'read' },
    // bank A (row 31): the baffle in front of the door; the open one at its east end is the row he taps along
    { type: 'locker', x: 9, y: 31, opaque: true },
    { id: 'gym_locker_szalay', type: 'locker', x: 10, y: 31, opaque: true, examine: LOCKER_TEXT('SZALAY') },
    { type: 'locker', x: 11, y: 31, opaque: true },
    { type: 'locker', x: 12, y: 31, opaque: true, state: 'dented' },
    { id: 'gym_locker_gorski', type: 'locker', x: 13, y: 31, opaque: true, examine: LOCKER_TEXT('GORSKI — GO CHEER!') },
    { type: 'locker', x: 14, y: 31, opaque: true },
    { type: 'locker', x: 15, y: 31, opaque: true },
    { id: 'gym_locker_tess', type: 'locker', x: 16, y: 31, state: 'open', opaque: true, hide: 'locker', script: 'ch6.locker', verb: 'Hide',
      examine: '[n] The last locker in the row hangs open. Room enough inside for somebody small.' },
    { type: 'locker_bench', x: 10, y: 33 },
    // bank B (row 35): behind, more of the same
    { type: 'locker', x: 9, y: 35, opaque: true },
    { type: 'locker', x: 10, y: 35, opaque: true },
    { id: 'gym_locker_mrazek', type: 'locker', x: 11, y: 35, opaque: true, examine: LOCKER_TEXT('MRAZEK, C.A. — HOMECOMING COURT') },
    { type: 'locker', x: 12, y: 35, opaque: true },
    { id: 'gym_locker_webb', type: 'locker', x: 13, y: 35, opaque: true,
      examine: [{ cond: (s) => lit(s) && !F(s).roll2_done, text: '[terrified] Locked—' },
        { text: ['[n] WEBB, D. A clarinet sticker, peeling at one corner.', "[sad] I'm not opening it."] }] },
    { type: 'locker', x: 14, y: 35, opaque: true },
    { type: 'locker', x: 15, y: 35, opaque: true, state: 'dented' },
    { type: 'locker', x: 16, y: 35, opaque: true },
    { type: 'locker', x: 17, y: 35, opaque: true },
    { type: 'locker_bench', x: 11, y: 37 },
    { id: 'gym_battery', type: 'pickup', x: 20, y: 37, item: 'battery',
      examine: '[relieved] A battery, rolled into the corner under the bench. Somebody\'s Walkman money.' },
    { type: 'decal_papers', x: 16, y: 33 },
    { type: 'decal_stain', x: 19, y: 30 },
    { type: 'decal_stain', x: 10, y: 37 },
    { type: 'trash_can', x: 20, y: 28 },

    // ======================================================== showers
    { id: 'gym_mirror_1', type: 'mirror', x: 3, y: 27, state: 'grimy',
      examine: [{ cond: (s) => !!F(s).ch6_showers, text: "[sad] Just me now. She's gone back into the glass." },
        { text: ['[n] A mirror over a sink, fogged at the edges.', "[worried] My face. Too pale. The room behind me, dark."] }] },
    { id: 'gym_mirror_2', type: 'mirror', x: 4, y: 27, state: 'grimy',
      examine: [{ cond: (s) => !!F(s).ch6_showers, text: "[sad] Just me now. She's gone back into the glass." },
        { text: ['[n] A mirror over a sink, fogged at the edges.', "[worried] My face. Too pale. The room behind me, dark."] }] },
    { id: 'gym_mirror_3', type: 'mirror', x: 5, y: 27, state: 'grimy',
      examine: [{ cond: (s) => !!F(s).ch6_showers, text: "[sad] Just me now. She's gone back into the glass." },
        { text: ['[n] A mirror over a sink, fogged at the edges.', "[worried] My face. Too pale. The room behind me, dark."] }] },
    { id: 'gym_mirror_4', type: 'mirror', x: 6, y: 27, state: 'cracked',
      examine: [{ cond: (s) => !!F(s).ch6_showers, text: "[sad] Just me now. She's gone back into the glass." },
        { text: ['[n] A mirror over a sink, fogged at the edges.', "[worried] My face. Too pale. The room behind me, dark."] }] },
    { id: 'gym_sink_1', type: 'sink', x: 3, y: 28,
      examine: v('[n] A bobby pin in the drain. A comb with three teeth missing.', '[n] The bobby pin. The comb.') },
    { type: 'sink', x: 4, y: 28 },
    { type: 'sink', x: 5, y: 28 },
    { type: 'sink', x: 6, y: 28 },
    { type: 'hand_dryer', x: 7, y: 27 },
    { id: 'gym_shower_1', type: 'shower_head', x: 2, y: 33,
      examine: v(['[n] Gang showers. One head is dripping. Plink. Plink.', "[worried] The water's been off for twelve years."], '[n] Plink.') },
    { type: 'shower_head', x: 4, y: 33 },
    { type: 'shower_head', x: 6, y: 33 },
    { type: 'decal_stain', x: 4, y: 35 },
    { type: 'decal_stain', x: 2, y: 36 },
    { type: 'decal_tiles', x: 6, y: 36 },
    { type: 'decal_glass', x: 6, y: 29 },

    // ======================================================== equipment (locked) and boys' locker room (jammed): unseen
    { type: 'mat_stack', x: 22, y: 28 },
    { type: 'mat_stack', x: 22, y: 30 },
    { type: 'ball_cart', x: 28, y: 28 },
    { type: 'shelf_metal', x: 27, y: 33 },
    ...[31, 32, 33, 34, 36, 37, 38, 39, 40].map((x) => ({ type: 'locker', x, y: 28 })),
    { type: 'locker_bench', x: 32, y: 31 },
    { type: 'locker_bench', x: 37, y: 31 },
  ],

  doors: {
    '11,27': { id: 'gym_door_girls', label: 'GIRLS' },
    '26,27': { id: 'gym_door_equip', state: 'locked', label: 'EQUIPMENT',
      lockedText: v('[n] EQUIPMENT. Locked.', '[scared] Locked.') },
    '35,27': { id: 'gym_door_boys', state: 'jammed', label: 'BOYS',
      lockedText: v(["[n] BOYS. Jammed. Something's wedged under the handle on the other side."], '[scared] Jammed.') },
  },

  rooms: [
    { id: 'gym_court', name: 'Gymnasium', rect: [1, 4, 41, 21], kind: 'gym' },
    { id: 'gym_showers', name: 'Showers', rect: [2, 28, 6, 10], kind: 'restroom' },
    { id: 'gym_girls_lr', name: "Girls' Locker Room", rect: [8, 28, 13, 10], kind: 'special' },
    { id: 'gym_equipment', name: 'Equipment', rect: [22, 28, 8, 10], kind: 'special' },
    { id: 'gym_boys_lr', name: "Boys' Locker Room", rect: [31, 28, 11, 10], kind: 'special' },
  ],

  anchors: {
    from_east1: [3, 21, 'right'],      // first anchor (reachability root): just inside the west doors
    denise: [19, 7, 'down'],           // in front of her seat (x 19 of gym_bleachers_denise)
    beside_denise: [20, 7, 'down'],    // Marcus's seat (x 20 of gym_bleachers_marcus)
    tess_mark: [17, 10, 'up'],         // where Tess stops when Marcus walks on
    colonel_hoop: [37, 16, 'left'],    // under the far hoop, in front of the heap; he sits facing them
    center: [21, 15, 'down'],
    marcus_photo: [19, 10, 'up'],      // the photo lies on the boards just north of here (gym_photo at x 19 y 9)
    lr_door: [11, 24, 'down'],
    locker_room: [11, 29, 'down'],     // just inside the GIRLS door
    locker_tess: [16, 32, 'up'],       // in front of the open locker
    locker_row: [9, 32, 'right'],      // the far end of bank A's aisle (his tapping walk starts here)
    shower_mirrors: [4, 29, 'up'],
  },

  exits: [
    { id: 'east1', rect: [1, 21, 1, 2], to: 'east1', anchor: 'from_gym', lock: shut, lockedText: doorsShutText },
  ],

  triggers: [
    // Ch6: two steps in from the doors (the clarinet, Denise on the bleachers) → ch6.gym
    { id: 'gym_enter', rect: [5, 4, 1, 21], script: 'ch6.gym', cond: (s) => s.chapter === 6 && !lit(s) && !alone(s) },
    // Ch6: after the locker — every mirror holds Adair (DESIGN §6 VI.7)
    { id: 'showers', rect: [2, 28, 6, 3], script: 'ch6.showers',
      cond: (s) => !!(F(s).roll2_done || alone(s)) && !F(s).ch6_showers },
  ],

  lights: [
    // four banks, near (west) → far (east); off until ch6.gym bangs them on
    ...[['gym1', 6], ['gym2', 16], ['gym3', 26], ['gym4', 37]].flatMap(([group, x]) =>
      [9, 15, 21].map((y) => ({ type: 'fluor', x, y, group, on: false, flicker: false, radius: 5.5 }))),
    // the girls' locker room: one caged bulb on the dying side of alive
    { type: 'bulb', x: 19, y: 32, intensity: 0.45, radius: 3, flicker: true },
  ],
};
