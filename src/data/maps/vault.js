// VAULT — under the stage, the iron spiral, the descent, the Founder's Vault (maps-E).
// CONTENT §2.12 · DESIGN §6 VIII.1–3, §9.2 (vault → breaker gate), §14 (descent: no music,
// footsteps brick → stone → coal) · 36×36, offset (57, -20), floor B2.
// World alignment: the trapdoor in aud's trap room (aud 37–38, 7–8) is vault (33–34, 7–8); the lectern
// (aud 21, 11) is vault (17, 11). The crawl runs under the stage at the same x, so the roll is loudest
// (and the floorboard light leaks) right under the lectern.
//
//   UNDER THE STAGE (rows 4–7, x 2–33; brick foundation walls, dusty boards). Arrival `from_aud` at the
//     foot of the steep trap-room steps (x 32–33, rows 2–3: exit back up → aud/trapdoor, LOCKED until
//     register_done — the trapdoor is the point of no return). A low, linear crawl west: stored stage
//     flats HOMECOMING 1928 / 1945 / 1962 leaning on the brick, a box of old Founder's Day programs,
//     a retired piano, stacked desks, cobwebs. Halfway, light seeps down through the boards under the
//     lectern (a soft pool) — trigger `last_roll` (x 16–17) → ch8.last_roll: the roll through the floor.
//     West end: the IRON SPIRAL — a railed well (glowing faintly red far below) with treads curling
//     down round it; stepping on them → exit → `stair_bottom` (conceptually several storeys).
//   IRON STAIR (rows 11–13, x 2–8): the spiral's foot in a brick niche, rising into the dark (walk back
//     into the niche → `spiral_top`). Brass maker's plate (1911), a dead bulb cage, puddles, drips.
//   THE DESCENT — no music, the floor changes under her feet (concrete → stone → gravel → coal):
//     brick tunnel (rows 11–13, x 9–29; puddles, dead bulb cages; Walt's note to Joey, 10-21-62) →
//     stairs down (x 27–29) → rock passage west (rows 17–19; stone; Adair's trodden 1979 program,
//     CHARTER. STAMPS. BOOK.) → stairs down (x 3–5) → gravel landing (Walt's last note, 10-23-62: too
//     hot — where he turned back) → stairs down (x 8–10) → the coal landing (rows 28–33): PRESENT
//     scratched over and over into the rock face, an L-shaped crack glowing with the mine fire, steam.
//   FOUNDER'S VAULT (x 13–26, rows 23–33; marble): entered through its west archway (trigger
//     `vault_enter` → ch8.vault, checkpoint). North wall: name walls 1894 · 1911–1945 · 1962–1979, the
//     regimental flag centred over the burst sarcophagus `v_sarcophagus` (→ ch8.sarcophagus), dead
//     wreaths, unlit candles, cicada shells round the split lid. SE: Adair's husk `v_adair_husk`
//     kneeling at a writing desk (→ ch8.adair: red pen + adair_note). The east wall is broken outward
//     into the coal.
//   COAL PASSAGE (rows 29–31, x 28–33 → stairs down x 31–33): red glow climbing from below. Exit →
//     breaker/from_vault, LOCKED until Tess has `red_pen` (refusal script ch8.no_light). Anchor
//     `to_breaker` = arrival back from the breaker.
// Escape (WITHDRAWN) runs it all in reverse: passage → vault → landings → rock passage → tunnel →
// spiral → crawl → steps → aud. No dead ends on that line; nothing narrower than 2 tiles.
// Past view `vault_1979` (optional, compact; not in CONTENT): Adair alive at the desk, head down, writing.
// The 1979 view also shows the sarcophagus sealed and the 1979 panel not yet carved (the art's clean set).
// Data extra `fx` (for an onEnter/system emitter): drip / ember / steam points in tile coords.
const F = (s) => s.flags || {};
const AFTER = (s) => !!F(s).register_done;
const FREE = (s) => !!F(s).expelled; // DISMISSED: he is gone; the building is quiet

const flat = (x, year, examine) => ({ type: 'stage_flat', x, y: 4, label: `HOMECOMING ${year}`, examine });
const web = (x, y, dir, examine) => ({ type: 'cobweb', x, y, dir, ...(examine ? { examine } : {}) });

export default {
  id: 'vault',
  name: 'Under the Stage',
  floor: 'B2',
  offset: [57, -20],
  ambience: 'vault',
  music: null,
  dark: 0.975,
  ambient: '#0c0a0e',
  moon: 0,
  //   x → 0         1         2         3
  //       012345678901234567890123456789012345
  tiles: [
    '                                    ', //  0
    ' BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB ', //  1  stage-house foundation: top
    ' BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB^^B ', //  2  face_high · trap-room steps (x 32–33)
    ' BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB^^B ', //  3  face_low  · stage flats lean here
    ' B||||============================B ', //  4  under the stage (low) · well railing
    ' B|ZZv============================B ', //  5  the spiral well (pit) · treads
    ' B|ZZv============================B ', //  6
    ' B|vvv============================B ', //  7
    ' BBvvBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB ', //  8  crawl south wall = tunnel north wall: top
    ' BBvvBBBBBBBBBBBBBBBBBBBBBBBBBBRRRR ', //  9  face_high · spiral niche (x 3–4)
    ' BBvvBBBBBBBBBBBBBBBBBBBBBBBBBBRRRR ', // 10  face_low  · maker's plate, bulb cages
    ' B~:::::::::::::::::::::::::::BRRRR ', // 11  iron stair foot (x 2–8) · brick tunnel (x 9–29)
    ' B::::~~::::::::::::::~:::::::BRRRR ', // 12
    ' B:::::::::~::::::::~~::::::::BRRRR ', // 13
    ' BBBBBBBBBBBBBBBBBBBBBBBBBBvvvBRRRR ', // 14  tunnel south wall · stairs down (x 27–29)
    ' RRRRRRRRRRRRRRRRRRRRRRRRRRvvvRRRRR ', // 15  rock passage north wall: face_high
    ' RRRRRRRRRRRRRRRRRRRRRRRRRRvvvRRRRR ', // 16  face_low
    ' RRsssssssssssssssssssssssssssRRRRR ', // 17  rock passage (stone), walked west
    ' RRsssss~sssssssssssssssssssssRRRRR ', // 18
    ' RRs;;sssssssssssss~ssssssssssRRRRR ', // 19
    ' RRvvvRRRRRRMMMMMMMMMMMMMMMMRRRRRRR ', // 20  stairs down (x 3–5) · vault north wall: top
    ' RRvvvRRRRRRMMMMMMMMMMMMMMMMRRRRRRR ', // 21  face_high
    ' RRvvvRRRRRRMMMMMMMMMMMMMMMMRRRRRRR ', // 22  face_low: name walls, flag, plaque
    ' R;;;;;;;;;RMmmmmmmmmmmmmmmMRRRRRRR ', // 23  gravel landing | FOUNDER'S VAULT
    ' R;;;;;;;;;RMmmmmmmmmmmmmmmMRRRRRRR ', // 24
    ' R;;;%;;;;;RMmmmmmmmmmmmmmmMRRRRRRR ', // 25
    ' RRRRRRRvvvRMmmmmmmmmmmmmmmMRRRRRRR ', // 26  ledge face (PRESENT scratched, row 27) · stairs down (x 8–10)
    ' RRRRRRRvvvRMmmmmmmmmmmmmmmMRRRRRRR ', // 27
    ' R%%%%%%%%%RMmmmmmmmmmmmmmmMRRRRRRR ', // 28  coal landing (the crack: x 3 rows 30–32, row 32 x 3–6)
    ' R%%%%%%%%%%mmmmmmmmmmmmmmmd%%%%%%R ', // 29  west archway (x 11–12) · east breach (x 27) · coal passage
    ' R%Z%%%%%%%%mmmmmmmmmmmmmmmd%%%%%%R ', // 30
    ' R%Z%%%%%%%%mmmmmmmmmmmmmmmd%%%%%%R ', // 31
    ' R%ZZZZ%%%%RMmmmmmmmmmmmmmmMRRRvvvR ', // 32  stairs down into the dark (x 31–33)
    ' R%%%%%%%%%RMmmmmmmmmmmmmmmMRRRvvvR ', // 33
    ' RRRRRRRRRRRMMMMMMMMMMMMMMMMRRRvvvR ', // 34  exit → breaker (gated: red pen)
    '                                    ', // 35
  ],
  objects: [
    // ================================================================ under the stage
    flat(10, 1928, ['[n] A painted flat leaning on the brick. HOMECOMING 1928. A colliery tipple against a sunset.',
      '[worried] 1928. The first one after the school opened.']),
    flat(21, 1945, ['[n] HOMECOMING 1945. Same tipple, same sunset. Gold letters gone brown.',
      '[worried] 1945. That\'s one of Lutz\'s years.']),
    flat(24, 1962, ['[n] HOMECOMING 1962. The year\'s painted over an older one. You can see the ghost of it underneath.',
      '[worried] Every seventeen years somebody painted a new one. Nobody asked why.']),
    { type: 'shelf_metal', x: 28, y: 4,
      examine: ['[n] Steel shelves. Rolled bunting, a box of crepe-paper streamers, green and gold.',
        '[n] A coffee can of bobby pins. A tin crown for the homecoming court.'] },
    { type: 'decal_papers', x: 19, y: 6,
      examine: ['[n] A box of programs burst open, gone soft with damp.',
        '[n] FOUNDER\'S DAY ASSEMBLY — ORDER OF EXERCISES. Processional. Alma Mater. Remarks.',
        '[n] PRESENTATION OF THE ROLL — The Principal.',
        '[worried] Every year. Printed. Like it was a fire drill.'] },
    { type: 'piano', x: 26, y: 6,
      examine: ['[n] An upright piano, shoved under here and left. Somebody grease-penciled the lid:',
        '[n] TUNE BEFORE FOUNDER\'S DAY.'] },
    { type: 'desk_pile', x: 11, y: 6,
      examine: ['[n] Old desks stacked up to the boards. The kind with inkwell holes and iron feet.',
        '[worried] They kept every desk. Every single one.'] },
    { type: 'music_stand', x: 15, y: 7 },
    { type: 'music_stand', x: 31, y: 7,
      examine: '[n] A music stand with one leg bent. A band folder still clipped to it: CLARINET 2.' },
    { type: 'aud_seat', x: 7, y: 7, dir: 'up', noSit: true,
      examine: '[n] A seat unbolted from the house, red velvet worn to the weave. No row number.' },
    { type: 'decal_stain', x: 14, y: 5 },
    { type: 'decal_stain', x: 29, y: 6 },
    { type: 'decal_tiles', x: 23, y: 7,
      examine: '[n] Plaster and sawdust, sifted down through the boards. Little drifts of it everywhere.' },
    web(2, 4, 'left'),
    web(9, 4, 'right'),
    web(13, 4, 'left'),
    web(33, 4, 'right', '[n] Cobwebs, thick as gauze, strung between the joists and the brick.'),
    web(20, 7, 'left'),
    web(7, 4, 'right', ['[n] A curtain of cobweb by the well, torn through at about my height.',
      '[worried] A long time ago. Somebody else came this way.']),
    // the well: a web strung on the railing's corner post is the examine spot (from x 6 facing west;
    // stepping on the treads goes down)
    { id: 'v_well', type: 'cobweb', x: 5, y: 4, dir: 'right', verb: 'Look',
      examine: [
        { cond: AFTER, text: '[n] The well. Warm air pouring up it. Up is the way out.' },
        { text: ['[n] An iron spiral, going down round a black well. Warm air comes up it, and a smell like a struck match.',
          '[worried] The basement isn\'t this deep. Nothing\'s this deep.'] },
      ] },

    // ================================================================ iron stair (spiral foot)
    { id: 'v_spiral', type: 'stair_spiral', x: 3, y: 9, solid: false, verb: 'Look',
      examine: [
        { cond: AFTER, text: '[n] Up. All the way up.' },
        { text: ['[n] The spiral goes up into the dark. I stopped counting the turns.', '[worried] I can\'t hear them anymore. The roll. It\'s too far up.'] },
      ] },
    { type: 'plaque', x: 6, y: 10,
      examine: ['[n] A brass plate on the brick, green with damp: HALLOWELL COAL & IRON CO. — SCHUYLKILL WORKS — 1911.',
        '[worried] 1911. He built the stairs before there was a school on top of them.'] },
    { type: 'cage_bulb', x: 2, y: 10, state: 'off',
      examine: '[n] A bulb cage with no bulb in it. Cloth-wrapped wire, rotted through.' },
    { type: 'cobweb', x: 8, y: 11, dir: 'right' },

    // ================================================================ brick tunnel (descent 1)
    // Walt, October 1962: he came down after Joey with a light and left notes for him.
    { id: 'v_walt_note_1', type: 'note_paper', x: 14, y: 13,
      examine: ['[n] A sheet of paper folded small, weighted down with a brick end. Carpenter\'s pencil, block capitals:',
        '[n] JOEY — STAY WHERE YOU ARE. I AM COMING BACK WITH A LIGHT. DAD.',
        '[n] 10-21-62.',
        '[worried] Walt. His dad came down here after him.'] },
    { type: 'cage_bulb', x: 22, y: 10, state: 'off' },
    { type: 'cage_bulb', x: 12, y: 10, state: 'off' },
    { type: 'decal_stain', x: 17, y: 13 },
    { type: 'decal_stain', x: 24, y: 11 },
    { type: 'decal_tiles', x: 26, y: 13 },
    { type: 'cobweb', x: 29, y: 11, dir: 'right',
      examine: '[n] Warmer here. The bricks are sweating.' },

    // ================================================================ rock passage (descent 2)
    { id: 'v_program', type: 'note_paper', x: 13, y: 19,
      examine: ['[n] A Founder\'s Day program. 1979. Trodden flat into the wet.',
        '[n] Down the margin, in red pen: CHARTER. STAMPS. BOOK.',
        '[n] The first two are crossed out.',
        '[worried] She came down here with nothing.'] },
    { type: 'decal_stain', x: 20, y: 18 },
    { type: 'decal_tiles', x: 10, y: 17,
      examine: '[n] Rock fallen from the roof. Old breaks, furred with black dust.' },
    { type: 'steam_vent', x: 6, y: 18,
      examine: ['[n] Steam threading out of a crack in the floor. The rock is warm to touch.'] },

    // ================================================================ gravel landing → coal landing
    { id: 'v_walt_note_2', type: 'note_paper', x: 7, y: 23,
      examine: ['[n] Another note, under a lump of slate. Same pencil. The letters shake.',
        '[n] TOO HOT TO GO ON. JOEY IF YOU READ THIS GO BACK UP AND WAIT BY THE BOILER. 10-23-62.',
        '[worried] He turned around here. He had to.'] },
    { type: 'steam_vent', x: 4, y: 24 },
    // the ledge face over the coal landing: the school's writing, or the kept children's
    { type: 'graffiti', x: 3, y: 27, state: 'present',
      examine: ['[n] Scratched into the rock, small, over and over, like with a fingernail: PRESENT. PRESENT. PRESENT.',
        '[worried] Somebody down here kept answering.'] },
    { type: 'cobweb', x: 2, y: 23, dir: 'left' },
    // the crack in the coal (pit cells x 3 rows 30–32, x 3–6 row 32): the fire showing through
    { type: 'steam_vent', x: 4, y: 31,
      examine: ['[n] The coal\'s split open here. It glows down inside, orange, like an oven seen through a crack.',
        '[worried] The mine fire. It\'s right under me.'] },
    { type: 'steam_vent', x: 7, y: 32 },
    { type: 'steam_vent', x: 5, y: 29 },
    { type: 'coal_heap', x: 6, y: 29, state: 'flat', interact: false },

    // ================================================================ the Founder's Vault
    // north wall (face_low row 22): the rolls, the colour, the founder's plate
    { id: 'v_names_1894', type: 'name_wall', x: 13, y: 22, label: '1894',
      examine: ['[n] Names cut into the marble under a year. 1894.',
        '[n] Seventeen of them. Polish. Welsh. Slovak. Irish. Boys\' names.'] },
    { id: 'v_names_1911', type: 'name_wall', x: 16, y: 22, label: '1911',
      examine: ['[n] 1911. One line, cut deeper than the rest, and filled with red:',
        '[n] HALLOWELL, CYRUS — ENROLLED.',
        '[n] Then 1928. Two names. 1945. Five.'] },
    { id: 'v_flag', type: 'flag_regimental', x: 19, y: 22,
      examine: ['[n] A regimental flag, eaten down to the stitching. 48 P.V. on what\'s left of the scroll.',
        '[n] The only battle I can still read is PETERSBURG.'] },
    { id: 'v_names_1962', type: 'name_wall', x: 21, y: 22, label: '1962',
      examine: [
        { cond: AFTER, text: '[n] Room under 1979. A whole wall of room.' },
        { text: ['[n] 1962. Four names. PRUSZYNSKI, JOSEPH.',
          '[n] 1979. Nine. WEBB, DENISE.',
          '[worried] There\'s room under it. A lot of room.'] },
      ] },
    { id: 'v_plaque', type: 'plaque', x: 25, y: 22,
      examine: ['[n] A brass plate: CYRUS HALLOWELL · 1841–1911 · FIRST SCHOLAR OF HALLOWELL SCHOOL.',
        '[n] Under it, smaller: AND THE LAST TO LEAVE IT.'] },
    // the tomb
    { id: 'v_sarcophagus', type: 'sarcophagus', x: 18, y: 25, state: 'burst', script: 'ch8.sarcophagus',
      examine: [
        { cond: FREE, text: '[n] Empty. It was always going to be empty.' },
        { text: ['[n] The lid is split. Not pried — split, from inside, the pieces pushed outward.',
          '[n] The hollow in it is too big. Much too big for a man.'] },
      ] },
    { type: 'cicada_shells', x: 20, y: 27,
      examine: ['[n] Shells. Little amber shells, split down the back, all round the foot of it.',
        '[worried] Like the oak. Like something climbed out.'] },
    { type: 'cicada_shells', x: 17, y: 26 },
    { type: 'wreath', x: 15, y: 24, variant: 0,
      examine: ['[n] A funeral wreath on an iron stand, gone to brown wire and paper ribbon.',
        '[n] The ribbon says FROM A GRATEFUL TOWN.'] },
    { type: 'wreath', x: 24, y: 24, variant: 1,
      examine: '[n] Another wreath. KETTLE RUN BAND — 1911. The flowers are dust in the wire.' },
    { type: 'candle', x: 16, y: 26, state: 'out',
      examine: ['[n] An iron candle stand. The candle burned down to a stub and went out.', '[worried] Somebody kept these lit. For a long time.'] },
    { type: 'candle', x: 23, y: 26, state: 'out' },
    { type: 'candle', x: 14, y: 29, state: 'out' },
    { type: 'candle', x: 25, y: 29, state: 'out',
      examine: '[n] Wax run down the stand and hardened in a beard. Cold.' },
    { type: 'wreath', x: 14, y: 32, variant: 1 },
    // Miss Adair: kneeling at a writing desk near the broken wall, facing the room
    { id: 'v_adair_husk', type: 'husk_kneeling', x: 22, y: 29, dir: 'down', script: 'ch8.adair',
      examine: ['[n] Her. Kneeling at the desk, in a cardigan gone to amber. Glasses. Hair still pinned up.',
        '[n] There\'s a pen in her hand. Red.'] },
    { id: 'v_adair_desk', type: 'writing_desk', x: 22, y: 30, script: 'ch8.adair',   // (narrative-5: the desk is what faces her anchor)
      examine: ['[n] A writing desk with a crust of dried ink in the well. Pages under her hands.',
        '[n] A flashlight lies by her knee, the switch still pushed forward. Dead.'] },
    { type: 'coal_heap', x: 24, y: 30, state: 'flat', interact: false },
    { type: 'decal_tiles', x: 26, y: 29,
      examine: ['[n] Chunks of marble, and the coal behind where the wall should be.',
        '[worried] It broke outward. From in here.'] },
    { type: 'decal_stain', x: 15, y: 31 },

    // ================================================================ coal passage
    { type: 'beam', x: 29, y: 29, variant: 0,
      examine: '[n] A timber, charred. The heat comes up the stairs past it in a wall.' },
    { type: 'steam_vent', x: 30, y: 31,
      examine: [
        { cond: (s) => !(s.inv && s.inv.red_pen > 0), text: ['[n] Steps, going down into a red dark. I can hear something down there.', '[worried] Wood. Creaking. Something huge, made of wood.'] },
        { text: '[n] The steps go down toward the noise. Wood, groaning, like a ship.' },
      ] },
  ],

  rooms: [
    { id: 'vault_crawl', name: 'Under the Stage', rect: [2, 4, 32, 4], kind: 'special' },
    { id: 'vault_spiral', name: 'Iron Stair', rect: [2, 11, 7, 3], kind: 'stair' },
    { id: 'vault_tunnel', name: 'Brick Tunnel', rect: [9, 11, 21, 3], kind: 'special' },
    { id: 'vault_passage', name: 'Rock Passage', rect: [3, 17, 27, 3], kind: 'special' },
    { id: 'vault_landing', name: 'Coal Landing', rect: [2, 23, 10, 11], kind: 'special' },
    { id: 'vault_main', name: 'Founder\'s Vault', rect: [12, 23, 16, 11], kind: 'special' },
    { id: 'vault_coal', name: 'Coal Passage', rect: [28, 29, 6, 6], kind: 'special' },
  ],

  anchors: {
    from_aud: [32, 5, 'left'],          // first anchor: foot of the trap-room steps (exit is rows 2)
    under_lectern: [17, 5, 'up'],       // the floorboard light; where the roll is loudest
    spiral_top: [7, 6, 'right'],        // back up the spiral (arrival from the iron stair)
    stair_bottom: [4, 12, 'right'],     // the spiral's foot
    tunnel: [20, 12, 'right'],
    rock_passage: [16, 18, 'left'],
    coal_landing: [9, 30, 'right'],
    vault_door: [13, 30, 'right'],      // inside the west archway
    sarcophagus: [19, 27, 'up'],
    adair: [22, 31, 'up'],
    breach: [27, 30, 'right'],
    to_breaker: [30, 30, 'left'],       // arrival back from the breaker (exit is row 34)
  },

  exits: [
    // up the steps to the trap room — the point of no return until the book is closed
    { id: 'trapdoor', rect: [32, 2, 2, 1], to: 'aud', anchor: 'trapdoor', lock: (s) => !AFTER(s),
      lockedText: ['[n] The steps, back up to the trap room. Up there they\'re still calling names.', '[worried] Not yet. Not without them.'] },
    // the iron spiral (same map; conceptually several storeys)
    { id: 'spiral_down', rect: [3, 5, 3, 3], to: 'vault', anchor: 'stair_bottom' },
    { id: 'spiral_up', rect: [3, 9, 2, 2], to: 'vault', anchor: 'spiral_top' },
    // down to the breaker — her light won't reach without Adair's pen (DESIGN §9.2)
    { id: 'breaker', rect: [31, 34, 3, 1], to: 'breaker', anchor: 'from_vault',
      lock: (s) => !(s.inv && s.inv.red_pen > 0), refuse: 'ch8.no_light',
      lockedText: '[worried] My light won\'t reach. Not without— no. Her pen.' },
  ],

  triggers: [
    { id: 'last_roll', rect: [16, 4, 2, 4], script: 'ch8.last_roll', once: true, cond: (s) => !AFTER(s) },
    { id: 'vault_enter', rect: [12, 29, 1, 3], script: 'ch8.vault', once: true, cond: (s) => !AFTER(s) },
  ],

  lights: [
    // light spilling down the trap-room steps from the open hatch (no fixture, no halo)
    { type: 'bulb', x: 32.5, y: 3.2, color: '#d8b57c', radius: 3.2, intensity: 0.34, cage: false, glow: null },
    // the Assembly's light seeping down between the boards right under the lectern. Group
    // 'floorboards' (on by default): ch8.last_roll should fade it out when the roll moves on
    // (g.lights('floorboards', false)) — the camera at the spiral foot can still see this row.
    { type: 'spot', x: 17, y: 5.6, color: '#e2cf9e', radius: 2.4, disc: 1.3, intensity: 0.3, shadows: false, glow: null,
      group: 'floorboards' },
    // the well: a red breath from very far below
    { type: 'mine_fire', x: 3.5, y: 5.5, radius: 2.4, intensity: 0.42 },
    // the crack across the coal landing (fire preset: a hot glow in the crack; mine-fire red)
    { type: 'fire', x: 3, y: 31, color: '#d03a12', radius: 3.2, intensity: 0.95 },
    { type: 'fire', x: 5.5, y: 32, color: '#d03a12', radius: 3, intensity: 0.9 },
    // the vault's broken east wall and the stairs to the breaker: red from below, pulling east
    { type: 'mine_fire', x: 27.5, y: 30, radius: 3.4, intensity: 0.45 },
    { type: 'mine_fire', x: 32, y: 34, radius: 4.2, intensity: 0.75 },
  ],

  past: [
    {
      id: 'vault_1979', rect: [19, 27, 7, 6], hint: '1979. She got this far. She\'s still writing.',
      hide: ['v_adair_husk'],
      adair: { x: 22, y: 29, anim: 'heads_down', dir: 'down' },
      setFlag: 'saw_vault_past',
    },
  ],

  // For an ambient emitter (onEnter script or system): HW.fx.emit(type, x*16+8, y*16+8, …) at intervals.
  fx: {
    drip: [[5, 12], [12, 13], [20, 12], [21, 13], [8, 18], [18, 19]],
    ember: [[3, 30], [3, 32], [5, 32], [27, 30], [32, 33]],
    steam: [[6, 18], [4, 24], [4, 31], [7, 32], [5, 29], [30, 31]],
  },
};
