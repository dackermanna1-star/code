// THE LONG HALL (longhall) · 90×16 · offset (31, 28) · 2F · CONTENT §2.9 · maps-D
//
// The 2F corridor over the lobby that the school makes too long (rule R4, DESIGN §6 V.4). One straight
// 5-tall corridor on local rows 7–11 (= world rows 35–39, like every hall).
//   NORTH: the gallery — an iron railing (row 6) over the dark two-storey lobby. Beyond it there is
//     nothing to see but black, except, near the east end, across the void, the lobby portrait in a
//     cold thread of skylight: the carved chair is EMPTY (lh_portrait; examine ch5.gallery through the
//     reachable hotspot lh_gallery on the railing in front of it).
//   SOUTH: painted doors 201 / 202 in real doorframes (door_class, locked, "It's painted on."; the
//     voice beat uses lh_voice_door), lockers set into the wall, clocks, Safety Patrol posters, a red
//     EXIT sign over every second door.
//   EAST END (x 81–89): the brick archway into the lobby block — the HALL PASS REQUIRED sign
//     (lh_archway_sign + lh_archway_plaque) — and the way back to east2 (x 89). Anchors from_east2,
//     start, gallery, loop_reset; trigger longhall_enter → ch5.longhall_enter (once).
//   WEST END (x 1–6): Kevin under a red EXIT sign (anchor `kevin`), the way on to west2 (x 1).
//
// THE LOOP (src/game/longhall.js): data field `longhall: { loopFromX: 24, loopToX: 56, kevinStopX: 7 }`.
//   Without the pass, crossing x 24 westward teleports Tess (and camera, followers) 32 tiles east.
//   To make that invisible, x 7..72 is ONE 32-tile section repeated (tiles, props with fixed
//   `variant`s, decals, lights) — see hallSection() — and:
//     · the period is 32 because floor and wall-face textures repeat every 32 tiles (art/tiles.js);
//       tops (4), door thresholds (4) and railings (mask-only) divide it;
//     · the camera is never clamped at either x (24 ≥ 16 and 56 ≤ 90 − 16), and everything that is
//       NOT periodic (the piers, rail ends, Kevin, the portrait and its light) lies more than 16 tiles
//       from both loop x's: the view at x 24 spans ~9..40 and at x 56 ~41..72;
//     · no windows (their glass varies per cell), no flickering lights, no cond objects in the section.
//   With the pass, nothing loops: reaching x ≤ 7 runs ch5.kevin_pass (Kevin stands at x 4).
//   Why 90 tiles and not the 40 of DESIGN §12: seamlessness needs 32 (texture period) + 30 (view) +
//   both distinct ends out of view. The hall is longer than the building — the sketchbook will show
//   it running into both wings, which is the point (offset centred on the 40-tile physical span).
//
//   x →  0         1         2         3         4         5         6         7         8
//        012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789

const F = (s) => s.flags || {};
const loops = (s) => Number(F(s).longhall_loops) || 0;
const cleared = (s) => !!F(s).longhall_cleared;
const from = (n) => (s) => (s.chapter || 0) >= n;

const P = 32;                 // the section period (tiles)
const SECTIONS = [7, 39, 71]; // section starts; 71 only contributes its first columns (the map ends the hall)
const LOOP = { loopFromX: 24, loopToX: 56, kevinStopX: 7 };

// "It's painted on." — reads stranger the more times she has walked past it.
const PAINTED = [
  { cond: cleared, text: ["[n] It's painted on.", "[n] A picture of a door, in a real frame. That's all it ever was."] },
  { cond: (s) => loops(s) >= 3, text: ["[n] It's painted on.", '[scared] The same drip under the knob. The same drip. The same drip.'] },
  { cond: (s) => loops(s) >= 1, text: ["[n] It's painted on.", "[worried] I know this door. I know that drip of paint under the knob."] },
  { text: ["[n] It's painted on.", '[n] The frame is real oak. The door is paint on plaster — knob, wired glass, number plate, all of it.',
    '[skeptical] Somebody spent a long time on this.'] },
];
const VOICE_DOOR = [
  { cond: cleared, text: ["[n] It's painted on.", "[scared] She said Theresa. Leah doesn't say Theresa."] },
  { cond: (s) => loops(s) >= 4, text: ["[n] It's painted on. There's nothing behind it. There's nothing behind paint.",
    "[scared] She said Theresa. {p} Leah doesn't say Theresa."] },
  ...PAINTED,
];
// The pink slips Kevin left: the same one, every section.
const SLIP = [
  { cond: (s) => loops(s) >= 2, text: ['[n] The pink slip again. NO HALL PASS. Reported by K. Hoyt, Safety Patrol.', "[scared] Same tear. Same footprint. It's the same one."] },
  { cond: (s) => loops(s) >= 1, text: ['[n] Another pink slip. NO HALL PASS.', '[worried] Same name. Same date. Same tear in the corner.'] },
  { text: ['[n] A pink slip on the floor. DISCIPLINARY REFERRAL — Infraction: NO HALL PASS — Reported by: K. Hoyt, Safety Patrol.',
    '[worried] The date is today. {p} The date is October 19, 1979.'] },
];
const SHELLS = [
  { cond: (s) => loops(s) >= 2, text: '[scared] Shells. All facing west. Like they know where the end is.' },
  { text: ['[n] Cicada shells along the foot of the railing, split down the back.', '[worried] All of them facing west. Down the hall.'] },
];
const RAIL = [
  { cond: (s) => loops(s) >= 3, text: "[scared] Over the rail there's nothing. Not dark. Nothing. The lobby's down there. It has to be." },
  { cond: (s) => loops(s) >= 1, text: "[worried] Over the rail, the dark goes a long way down. Further than one floor." },
  { text: ['[n] The gallery rail. Over it, the lobby, two stories of dark.', "[skeptical] I can't see the floor. I can hear the rain on the skylight."] },
];

/** One 32-tile section of hall, at x = bx (section k). Every prop has a fixed variant. */
function hallSection(bx, k) {
  const at = (c) => bx + c;
  const out = [];
  const locker = (c, v, state = 'closed') => out.push({ id: `lh_locker_${k}_${c}`, type: 'locker', x: at(c), y: 14, variant: v, state });
  // south wall, west → east
  locker(2, 0); locker(3, 2); locker(4, 1);
  out.push({ id: `lh_patrol_${k}`, type: 'poster', x: at(6), y: 14, state: 'patrol', variant: 3 });
  out.push({ id: k === 1 ? 'lh_voice_door' : `lh_door201_${k}`, type: 'door_class', x: at(8), y: 13, state: 'locked', label: '201',
    variant: 1, lockedText: k === 1 ? VOICE_DOOR : PAINTED });
  locker(11, 3); locker(12, 0, 'dented'); locker(13, 2); locker(14, 1);
  out.push({ id: `lh_clock_${k}`, type: 'clock_hall', x: at(16), y: 14, variant: 0 });
  locker(18, 1); locker(19, 3); locker(20, 0);
  out.push({ id: `lh_extinguisher_${k}`, type: 'fire_extinguisher', x: at(22), y: 14, variant: 2 });
  out.push({ id: `lh_door202_${k}`, type: 'door_class', x: at(24), y: 13, state: 'locked', label: '202', variant: 2, lockedText: PAINTED });
  out.push({ id: `lh_exit_${k}`, type: 'exit_sign', x: at(25), y: 14, state: 'on', variant: 0 });
  locker(27, 2); locker(28, 1); locker(29, 0); locker(30, 3);
  // floor and rail (examinable where Tess can reach)
  out.push({ id: `lh_stain_a_${k}`, type: 'decal_stain', x: at(5), y: 10, variant: 1 });
  out.push({ id: `lh_slip_${k}`, type: 'decal_papers', x: at(13), y: 8, variant: 2, examine: SLIP });
  out.push({ id: `lh_shells_${k}`, type: 'cicada_shells', x: at(18), y: 7, variant: 0, examine: SHELLS });
  out.push({ id: `lh_tiles_${k}`, type: 'decal_tiles', x: at(21), y: 11, variant: 0 });
  out.push({ id: `lh_stain_b_${k}`, type: 'decal_stain', x: at(28), y: 9, variant: 3 });
  out.push({ id: `lh_rail_${k}`, type: 'cobweb', x: at(30), y: 6, variant: 1, examine: RAIL });
  // keep only what lies inside the periodic span (the last section is cut off by the archway)
  return out.filter((o) => o.x < 73);
}

export default {
  id: 'longhall',
  name: 'The Long Hall',
  floor: '2F',
  offset: [31, 28],
  ambience: 'hall',
  music: null,
  dark: 0.96,
  ambient: '#0a0d1a',
  longhall: LOOP,
  tiles: [
    '                                                                                          ', //  0  the void over the lobby
    '                                                                                          ', //  1  (the portrait hangs in it, x 77–79)
    '                                                                                          ', //  2
    '                                                                                          ', //  3
    ' ######                                                                          BBBBBB###', //  4  west pier · archway pier (brick) · east wall
    ' ######                                                                          BBBBBB###', //  5
    ' ######||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||BBBBBB###', //  6  gallery railing x 7–80
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', //  7  corridor (world 35)
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', //  8
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', //  9
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', // 10
    ' ,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,', // 11  (world 39)
    ' ##############D###############D###############D###############D#################BBBBBB###', // 12  south wall: top · painted-door recesses
    ' ##############D###############D###############D###############D#################BBBBBB###', // 13  face_high
    ' ##############D###############D###############D###############D#################BBBBBB###', // 14  face_low (doors, lockers, clocks)
    ' .........................................................................................', // 15  the far side of the paint (unreachable)
  ],

  objects: [
    // ======================================================== the repeating hall (x 7–72)
    ...SECTIONS.flatMap((bx, k) => hallSection(bx, k)),

    // ======================================================== west end: Kevin's post
    { id: 'lh_exit_west', type: 'exit_sign', x: 3, y: 6, state: 'on',
      examine: [{ cond: cleared, text: "[n] EXIT. The west hall. He's still standing under it." }, { text: '[n] EXIT.' }] },
    { id: 'lh_west_poster', type: 'poster', x: 5, y: 6, state: 'patrol',
      examine: [{ cond: cleared, text: "[n] WALK — DON'T RUN. YOUR SAFETY PATROL. {p} [sad] Yours truly." }, { text: "[n] WALK — DON'T RUN. YOUR SAFETY PATROL." }] },
    { id: 'lh_west_clock', type: 'clock_hall', x: 2, y: 6 },
    { type: 'locker', x: 2, y: 14, variant: 1 },
    { type: 'locker', x: 3, y: 14, variant: 3 },
    { type: 'locker', x: 4, y: 14, variant: 0 },
    { type: 'decal_stain', x: 2, y: 10, variant: 2 },
    { type: 'cicada_shells', x: 5, y: 7, variant: 1 },

    // ======================================================== east end: the gallery view and the archway
    // the lobby portrait, across the void, the chair empty (state follows the lobby's: uniform after expelled)
    { id: 'lh_portrait', type: 'portrait_colonel', x: 77, y: 2, state: 'empty', script: 'ch5.gallery', cond: (s) => !F(s).expelled },
    { id: 'lh_portrait_uniform', type: 'portrait_colonel', x: 77, y: 2, state: 'uniform', cond: (s) => !!F(s).expelled,
      examine: '[n] Across the dark, the portrait. Only his coat, slumped in the chair.' },
    // reachable hotspot on the rail in front of it (wall-mounted art across a void can't be reached)
    { id: 'lh_gallery', type: 'cobweb', x: 78, y: 6, variant: 2, script: 'ch5.gallery' },
    { type: 'cobweb', x: 80, y: 6, variant: 0 },
    // the archway: HALL PASS REQUIRED BEYOND THIS POINT — BY ORDER OF THE PRINCIPAL (DESIGN §6 V.4)
    { id: 'lh_archway_sign', type: 'chalkboard', x: 81, y: 6, state: 'text', text: 'HALL PASS REQUIRED',
      params: { text1979: 'HALL PASS REQUIRED' },
      examine: [
        { cond: cleared, text: ['[n] HALL PASS REQUIRED BEYOND THIS POINT.', '[sad] He kept it. One pass. One student.'] },
        { cond: (s) => loops(s) >= 1, text: ['[n] HALL PASS REQUIRED BEYOND THIS POINT.', '[worried] Rule four. Like the bell is rule one. It has rules.'] },
        { text: ['[n] Lettered on two slates set into the brick of the arch, in chalk that never smudged: HALL PASS REQUIRED BEYOND THIS POINT.',
          "[skeptical] Or what. {p} ...Don't answer that."] },
      ] },
    { id: 'lh_archway_sign_b', type: 'chalkboard', x: 84, y: 6, state: 'text', text: 'BEYOND THIS POINT',
      params: { text1979: 'BEYOND THIS POINT' },
      examine: [
        { cond: cleared, text: '[n] BEYOND THIS POINT.' },
        { text: ['[n] BEYOND THIS POINT.', '[n] Under the chalk, a brass plate: BY ORDER OF THE PRINCIPAL. Somebody scratched under it, small: + K.H.'] },
      ] },
    { id: 'lh_archway_plaque', type: 'plaque', x: 87, y: 6,
      examine: ['[n] A brass plate: BY ORDER OF THE PRINCIPAL.', "[worried] Haupt. Haupt's name is on everything."] },
    { id: 'lh_exit_east', type: 'exit_sign', x: 88, y: 6, state: 'on',
      examine: ['[n] EXIT, back toward the east stairs.', "[worried] The way back is always the easy way. That's how you know."] },
    { id: 'lh_fountain', type: 'water_fountain', x: 88, y: 7,
      examine: '[n] Dry. A paper cone cup jammed in the drain, with lipstick on it. Coral. 1979 coral.' },
    { type: 'fire_extinguisher', x: 83, y: 14 },
    { type: 'decal_leaves', x: 86, y: 10, variant: 0 },
    { type: 'decal_stain', x: 82, y: 9, variant: 1 },
    { type: 'cicada_shells', x: 79, y: 7, variant: 2, examine: SHELLS },
  ],

  rooms: [
    { id: 'lh_hall', name: 'The Long Hall', rect: [1, 7, 89, 5], kind: 'hall' },
  ],

  anchors: {
    from_east2: [86, 9, 'left'],
    start: [78, 9, 'left'],             // long hall start (checkpoint): just inside the arch, the portrait across the void
    gallery: [78, 7, 'up'],             // at the rail, facing the portrait (lh_gallery hotspot ahead)
    loop_reset: [77, 9, 'left'],        // where the whistle-blackout puts her back
    kevin: [4, 9, 'right'],             // Kevin, under the west EXIT (never on screen while the hall loops)
    from_west2: [3, 11, 'right'],
    kevin_stop: [7, 9, 'left'],         // where Tess stands when he holds out his hand (kevinStopX)
    marcus_far: [30, 9, 'left'],        // "Marcus tiny at the far end" (pan the camera to frame Kevin's hand between them)
    kevin_glimpse: [10, 9, 'right'],    // optional: a far glimpse inside the loop span (only spawn him between loops)
    voice_door: [47, 11, 'down'],       // in front of lh_voice_door (section 1's painted 201)
  },

  exits: [
    { rect: [89, 7, 1, 5], to: 'east2', anchor: 'from_longhall' },
    { rect: [1, 7, 1, 5], to: 'west2', anchor: 'from_longhall' },
  ],

  triggers: [
    // first step under the arch (DESIGN §6 V.4): the sign, the gallery, the empty chair
    { id: 'longhall_enter', rect: [80, 7, 1, 5], script: 'ch5.longhall_enter', once: true, cond: (s) => !cleared(s) },
  ],

  lights: [
    // red EXIT over every second painted door: one per section, attached to the lh_exit_* props, steady.
    // Cold light coming up out of the atrium (the lobby skylight, two floors down) catches the rail:
    // three pools per section at fixed offsets, steady, so x and x + 32 light the same.
    ...SECTIONS.flatMap((bx) => [4, 15, 26].map((c) => bx + c)).filter((x) => x < 70)
      .map((x) => ({ type: 'spot', x, y: 6, color: '#6f88b0', intensity: 0.4, radius: 3, disc: 2.2, shadows: false, glow: null })),
    // the portrait: a thread of cold skylight across the void (kept > 16 tiles from both loop x's)
    { type: 'spot', x: 78, y: 2, color: '#8aa4c8', intensity: 0.8, radius: 2.4, disc: 1.6, shadows: false },
  ],
};
