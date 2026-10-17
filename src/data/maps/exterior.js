// EXTERIOR — Hallowell Consolidated School, front lot, Friday Oct 18 1996, 9:47 PM, rain (maps-A).
// CONTENT §2.1 · DESIGN §6 Prologue, §12 · 50×34 tiles, offset (50, 52), floor EXT.
//
//   North  the brick facade, 3–4 rows: the west and east wings show their faces at rows 3–4, the
//          central entrance pavilion (x 16–33, the lobby block) projects two rows further south
//          (faces at rows 5–6). Front doors `ext_front_doors` (door_front, x 24–25) atop two
//          rows of granite steps; NEMO RELINQUATUR (`ext_motto`) on the stone right of the doors,
//          HOLLOW HELL sprayed on the left; a caged bulb over the doors is the only lit thing on
//          the building (it guides the eye from the car to the doors).
//   West   lawn: the dead oak `ext_oak` (trunk + canopy, cicada shells on the bark and in the
//          grass), the flagpole on the plaza. The wagon's headlights rake across it.
//   East   lawn: the coal-chute hatch `ext_coal_chute` on the east wing's face (x 45–46), anchor
//          `chute_exit` below it (TRUANT arrival).
//   South  sidewalk → wet lot (puddles, steam cracks, three lamp posts: one burning, one dying,
//          one dead; a dumpster) with Leah's wagon `ext_wagon` parked nose-west (headlights ON),
//          chain-link fence with the lot entrance at x 38–41, the school sign and the DANGER
//          sign on the verge, then Route 61 (steam) and a guardrail. Walking off either end of
//          the road is refused in voice.
//
// Beats: party of four in the Prologue. Scripts: oak → pro.oak · sign → pro.sign · DANGER →
// pro.danger · motto → pro.motto · wagon → pro.car · trigger `approach_doors` on the top step →
// pro.doors (once; Danny's bolt cutters; the script sets `pro_doors_cut`). The front doors carry
// no script: they are a condition gate (locked while !pro_doors_cut, and again after
// register_done) that transfers to lobby/from_exterior when bumped once unlocked; an exit rect
// over the doorway does the same if a script leaves them standing open.
// Data extra: `weather` — systems/scripts: rain on (HW.fx.rain(true, weather.rain)) while this
// map is loaded, and steam particles at every `steam_vent` prop (HW.fx.emit('steam', ...)).
const PRO = (s) => (s.chapter || 0) === 0;                         // Prologue: Danny, Leah, Marcus present
const DAWN = (s) => !!(s.flags.register_done || s.flags.dawn);     // the endings
const has = (s, id) => (s.party || []).includes(id);
// Prologue banter: one line each, in party order (Danny, Leah, Marcus).
const B = (danny, leah, marcus) => {
  const b = {};
  if (danny) b.danny = [{ cond: PRO, text: danny }];
  if (leah) b.leah = [{ cond: PRO, text: leah }];
  if (marcus) b.marcus = [{ cond: PRO, text: marcus }];
  return b;
};

const STEAM = [
  { cond: DAWN, text: '[n] Steam, coming up gray into the gray morning. It doesn\'t care what time it is.' },
  { cond: PRO, text: ['[n] Steam threads up out of a crack in the asphalt. It smells like struck matches.', '[skeptical] Kettle Run. The only town where the ground has a fever.'] },
  { text: '[n] Steam, out of the crack. Warm on my hands. The fire under the town never went out.' },
];
const STEAM_BANTER = B('[grin] Free heat. Kettle Run\'s one amenity.',
  '[talk] The mine fire. It\'s been burning under the valley since \'62. That\'s why they bought everybody out.',
  '[neutral] Don\'t stand on the cracks. Ground\'s hollow under there.');
const vent = (x, y, variant) => ({ type: 'steam_vent', x, y, variant, examine: STEAM, banter: STEAM_BANTER });

const FENCE_SIDES = [];
for (let y = 11; y <= 19; y++) {
  FENCE_SIDES.push({ type: 'fence', x: 1, y, state: 'v' }, { type: 'fence', x: 48, y, state: 'v' });
}

export default {
  id: 'exterior',
  name: 'Hallowell School — Front Lot',
  floor: 'EXT',
  offset: [50, 52],
  ambience: 'exterior_rain',
  music: null,
  dark: 0.8,
  ambient: '#1a2438',
  moon: 0,                       // overcast: no moon shafts outdoors
  weather: { rain: 1, steam: true },
  //   x → 0         1         2         3         4
  //       01234567890123456789012345678901234567890123456789
  tiles: [
    '                                                  ', //  0
    ' BBBBBBBBBBBBBBBBBBBBBBBDDBBBBBBBBBBBBBBBBBBBBBBB ', //  1  roof line
    ' BBBBBBBBBBBBBBBBBBBBBBBDDBBBBBBBBBBBBBBBBBBBBBBB ', //  2
    ' BBUBBUBBUBBUBBBBBBBBBBBDDBBBBBBBBBBBUBBUBBBBBBUB ', //  3  wings: face_high (tall windows)
    ' BBUBBUBBUBBUBBBBBBBBBBBDDBBBBBBBBBBBUBBUBBBBBBUB ', //  4  wings: face_low (coal chute x45-46)
    ' gggggggggggggggBBUUBBBBDDBBBBUUBBggggggggggggggg ', //  5  pavilion face_high
    ' gggggggggggggggBBUUBBBBDDBBBBUUBBggggggggggggggg ', //  6  pavilion face_low: doors, motto
    ' ggggggggggggggggsssss^^^^^^sssssgggggggggggggggg ', //  7  granite steps
    ' ggggggggggggggggsssss^^^^^^sssssgggggggggggggggg ', //  8
    ' ggggggggggggggggssssssssssssssssgggggggggggggggg ', //  9  plaza
    ' ssssssssssssssssssssssssssssssssssssssssssssssss ', // 10  sidewalk
    ' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ', // 11  lot
    ' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa;;aaa ', // 12
    ' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa;aa ', // 13
    ' aaaaaaaa~~aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa~~aaaaaa ', // 14
    ' aaaaaaaaaaaaaaaaaaaaaaaaaaaa~~aaaaaaaaaaaaaaaaaa ', // 15
    ' aaaaaaaaaaaaaaaaaaaaaaaaaaaaa~aaaaaaaaaaaaaaaaaa ', // 16
    ' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ', // 17
    ' aa;aaaaaaaaaa~aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ', // 18
    ' a;aaaaaaaaaaaaaaaaaaa;;aaaaaaaaaaaaaaaaaaaaaaaaa ', // 19
    ' gggggggggggggggggggggggggggggggggggggaaaaggggggg ', // 20  fence (lot entrance x38-41)
    ' gggggggggggggggggggggggggggggggggggggaaaaggggggg ', // 21  verge: signs
    ' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ', // 22  Route 61
    ' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa~~aaaaaaaaaaa ', // 23
    ' aaaa~~aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ', // 24
    ' aaaaaaaaaaaaaaaaaaa~aaaaaaaaaaaaaaaaaaaaaaaa~aaa ', // 25
    ' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ', // 26
    ' gggggggggggggggggggggggggggggggggggggggggggggggg ', // 27  guardrail
    ' gggggggggggggggggggggggggggggggggggggggggggggggg ', // 28  scrub, dark
    ' gggggggggggggggggggggggggggggggggggggggggggggggg ', // 29
    ' gggggggggggggggggggggggggggggggggggggggggggggggg ', // 30
    ' gggggggggggggggggggggggggggggggggggggggggggggggg ', // 31
    ' gggggggggggggggggggggggggggggggggggggggggggggggg ', // 32
    '                                                  ', // 33
  ],
  propLegend: { f: 'fence', b: 'bush_dead' },
  propLayer: [
    '..................................................', //  0
    '..................................................', //  1
    '..................................................', //  2
    '..................................................', //  3
    '..................................................', //  4
    '.b..b..b.....b......................b.....b...b.b.', //  5
    '.b..............................................b.', //  6
    '.b..............................................b.', //  7
    '.b..............................................b.', //  8
    '.b..............................................b.', //  9
    '.b..............................................b.', // 10
    '..................................................', // 11
    '..................................................', // 12
    '..................................................', // 13
    '..................................................', // 14
    '..................................................', // 15
    '..................................................', // 16
    '..................................................', // 17
    '..................................................', // 18
    '..................................................', // 19
    '.fffffffffffffffffffffffffffffffffffff....fffffff.', // 20
    '..................................................', // 21
    '..................................................', // 22
    '..................................................', // 23
    '..................................................', // 24
    '..................................................', // 25
    '..................................................', // 26
    '.ffffffffffffffffffffffffffffffffffffffffffffffff.', // 27
    '..bb.......bb...........bbb...........b......bb...', // 28
    '...b........b.b..........b...........bb.......b...', // 29
    '.b.............b.....................b.bb.....bb..', // 30
    '..b...b...........b.........bb............b.......', // 31
    '.bb..........b......bb...........b...b........b...', // 32
    '..................................................', // 33
  ],
  objects: [
    // ------------------------------------------------------------------ facade (wall faces)
    { id: 'ext_motto', type: 'motto_stone', x: 26, y: 6, script: 'pro.motto' },
    { id: 'ext_door_lamp', type: 'cage_bulb', x: 23, y: 6, state: 'flicker',
      light: { type: 'bulb', radius: 3.6, intensity: 0.72 },
      examine: [
        { cond: DAWN, text: '[n] The bulb over the doors is out. Daylight doesn\'t need it.' },
        { cond: PRO, text: ['[n] A bare bulb in a wire cage over the doors. It\'s on.', '[suspicious] The only thing on this whole building that is.'] },
        { text: '[n] The bulb over the doors, still buzzing. Waiting for somebody to come in.' },
      ],
      banter: B('[nervous] Okay. Who\'s paying the electric on this place?',
        '[talk] Nobody. They cut the power here in \'84. I looked it up.',
        '[neutral] Then it\'s not on.') },
    { id: 'ext_graffiti_hh', type: 'graffiti', x: 21, y: 6, state: 'hollowhell',
      examine: [
        { cond: PRO, text: ['[n] HOLLOW HELL, sprayed across the brick in letters a foot high.', '[smirk] Somebody brought a whole can for this.'] },
        { text: '[n] HOLLOW HELL. Whoever wrote it thought they were being funny.' },
      ],
      banter: B('[grin] That\'s the name. That\'s the brand.',
        '[deadpan] Kids have been calling it that since before we were born. It\'s not even a good pun.',
        '[neutral] My grandma hates that name.') },
    { id: 'ext_graffiti_kr', type: 'graffiti', x: 42, y: 4, state: 'kr91',
      examine: [
        { cond: PRO, text: ['[n] KR \'91, in silver paint.', '[neutral] Whoever KR was, they came, they sprayed, they left. In that order.'] },
        { text: '[n] KR \'91. They left. It\'s possible to leave.' },
      ],
      banter: B('[grin] Kenny Rusnak. Same dare, five years ago. Now he works the register at Turkey Hill.',
        '[smirk] So the dare\'s a career path.',
        '[soft_smile] At least he signed it.') },
    { id: 'ext_coal_chute', type: 'coal_chute', x: 45, y: 4, state: 'locked',
      examine: [
        { cond: (s) => s.flags.ending === 'truant' || s.flags.truant, text: '[n] The hatch hangs open behind me. Coal dust on my jeans, on my hands.' },
        { cond: PRO, text: '[n] An iron hatch at the foot of the wall. COAL, cast in the lid. A padlock, rusted shut.' },
        { text: '[n] The coal hatch. Padlocked from in here, too.' },
      ],
      banter: B('[grin] Back door. Noted.',
        '[deadpan] You\'d fit. Barely. And then you\'d be the guy who got stuck in the coal chute.',
        '[neutral] Every house in Kettle Run had one of those.') },

    // ------------------------------------------------------------------ front lawns & plaza
    { id: 'ext_oak', type: 'oak_dead', x: 11, y: 8, script: 'pro.oak' },
    { id: 'ext_oak_canopy', type: 'oak_canopy', x: 9, y: 5 },
    { id: 'ext_shells', type: 'cicada_shells', x: 10, y: 8,
      examine: [
        { cond: PRO, text: '[n] Cicada shells in the grass under the oak, hundreds of them, every one split down the back.' },
        { text: '[n] The shells under the oak. Split down the back. Empty. Kept.' },
      ],
      banter: B('[nervous] That is... a lot of bugs.', '[deadpan] It\'s just their skins, Danny. The bugs left.', '[thoughtful] They hang on even after they\'re empty.') },
    { type: 'cicada_shells', x: 12, y: 8 },
    { type: 'cicada_shells', x: 11, y: 9 },
    { type: 'decal_leaves', x: 9, y: 9 },
    { type: 'decal_leaves', x: 13, y: 7 },
    { type: 'decal_leaves', x: 14, y: 9 },
    { type: 'decal_leaves', x: 6, y: 8 },
    { id: 'ext_hedge', type: 'bush_dead', x: 4, y: 9,
      examine: [
        { cond: PRO, text: '[n] A hedge, dead since about the Carter administration. Somebody threw a Yuengling bottle into it, and the hedge just kept it.' },
        { text: '[n] The dead hedge. The bottle\'s still in it.' },
      ],
      banter: B('[grin] That\'s Uncle Frank\'s brand. Not that he\'d ever come out here. Not even four deep.',
        '[deadpan] The hedge has better taste than your uncle.', '[neutral] Leave it, man.') },
    { id: 'ext_flagpole', type: 'flagpole', x: 18, y: 8,
      examine: [
        { cond: DAWN, text: '[n] The rope\'s gone still. First time all night.' },
        { cond: PRO, text: ['[n] A flagpole with no flag. The rope keeps knocking against the pole.', '[skeptical] Clank. Clank. Clank. Somebody should really fix that. In 1979.'] },
        { text: '[n] The rope knocking against the pole. Same rhythm as before. Exactly the same.' },
      ],
      banter: B('[grin] Somebody stole the flag. Respect.',
        '[deadpan] Nobody stole it. You take it down at night. It\'s called etiquette.',
        '[thoughtful] Half-mast, last time. Nobody came back to raise it.') },
    { type: 'decal_leaves', x: 17, y: 9 },
    { type: 'decal_leaves', x: 29, y: 7 },
    { type: 'decal_leaves', x: 31, y: 9 },
    { type: 'decal_leaves', x: 21, y: 10 },
    { type: 'decal_glass', x: 19, y: 7 },             // a pane gone from the paired window above
    { type: 'decal_leaves', x: 38, y: 7 },
    { type: 'decal_leaves', x: 44, y: 8 },
    { type: 'cicada_shells', x: 45, y: 5 },           // they came up everywhere in May
    { type: 'decal_leaves', x: 4, y: 10 },
    { type: 'decal_leaves', x: 35, y: 10 },

    // ------------------------------------------------------------------ the lot
    { id: 'ext_wagon', type: 'car_wagon', x: 18, y: 11, dir: 'left', state: 'on', script: 'pro.car',
      // Headlights at the nose, angled up-left across the west lawn to catch the dead oak.
      light: { type: 'headlights', x: 17.6, y: 11.7, angle: -2.72, radius: 16, intensity: 1, twin: 7, cone: 46 } },
    { id: 'ext_lamp_east', type: 'lamp_post', x: 40, y: 12, state: 'flicker',
      light: { type: 'streetlamp', flicker: false, radius: 6.5 },
      examine: [
        { cond: DAWN, text: '[n] The sodium lamp is a dull pink smudge against the morning.' },
        { cond: PRO, text: ['[n] A sodium lamp, still burning over an empty lot.', '[skeptical] Somebody\'s paying for that. Probably not on purpose.'] },
        { text: '[n] The lamp by the entrance. Still on. It\'s the most normal thing out here.' },
      ],
      banter: B('[grin] The town forgot about this one. Don\'t tell \'em.',
        '[deadpan] Lighting the way for all the traffic.',
        '[neutral] At least we\'ll find the car.') },
    { id: 'ext_lamp_west', type: 'lamp_post', x: 6, y: 15, state: 'flicker',
      examine: [
        { cond: PRO, text: '[n] This one can\'t decide. On. Buzzing. Off. On.' },
        { text: '[n] The lamp still can\'t make up its mind.' },
      ],
      banter: B('[grin] Disco.', '[deadpan] Seizure warning.', '[neutral] Ballast\'s going.') },
    { id: 'ext_lamp_dead', type: 'lamp_post', x: 28, y: 19, state: 'dead',
      examine: '[n] Dead. The glass is gone, and there\'s a bird\'s nest in the head.',
      banter: B('[grin] Bird\'s got a place of its own. Living the dream.', '[deadpan] Had. Past tense. Look at it.', '[soft_smile] Leave the bird alone.') },
    { id: 'ext_dumpster', type: 'dumpster', x: 45, y: 17,
      examine: [
        { cond: PRO, text: ['[n] A dumpster rusted through at the corners. Leaves, a lunch tray, one brown loafer.', '[worried] Just the one.'] },
        { text: '[n] The dumpster. The loafer\'s still in there. Kid-sized.' },
      ],
      banter: B('[nervous] Okay, the single shoe is a choice.',
        '[deadpan] Kids lose shoes. It\'s their main hobby.',
        '[worried] Let\'s go in before I change my mind.') },
    vent(25, 16, 0),
    vent(35, 12, 1),
    vent(12, 17, 1),
    { type: 'decal_glass', x: 3, y: 15 },              // a bottle, a long time ago
    { type: 'decal_papers', x: 33, y: 14 },            // a soggy flyer: Kettle Run Fire Co. — Founders Day Bingo
    { type: 'decal_leaves', x: 15, y: 11 },
    { type: 'decal_leaves', x: 26, y: 11 },
    { type: 'decal_leaves', x: 46, y: 19 },
    { type: 'decal_leaves', x: 9, y: 19 },
    { type: 'decal_stain', x: 21, y: 15 },             // oil where the buses used to idle
    ...FENCE_SIDES,
    { type: 'fence', x: 37, y: 20, state: 'post' },
    { type: 'fence', x: 42, y: 20, state: 'post',
      examine: [
        { cond: PRO, text: '[n] Chain-link, sagging. Somebody cut a hole in it years ago; somebody else wired it shut.' },
        { text: '[n] Chain-link. The hole somebody cut, wired shut.' },
      ],
      banter: B('[grin] Amateurs. Real ones use the entrance.', '[deadpan] The entrance is literally right there.', '[neutral] The patch is newer than the fence.') },

    // ------------------------------------------------------------------ verge & Route 61
    { id: 'ext_sign_school', type: 'sign_school', x: 32, y: 21, script: 'pro.sign' },
    { id: 'ext_bus_bench', type: 'bench', x: 8, y: 21,
      examine: [
        { cond: PRO, text: '[n] A bus-stop bench, facing the road. KETTLE RUN AREA SCHOOLS painted on the back, mostly gone.' },
        { text: '[n] The bus bench. Nobody\'s waited here since the buyout.' },
      ],
      banter: B('[grin] Last bus left in 1984. We missed it.', '[deadpan] The 6:50 to Pottsville. It stopped coming the year everybody left.', '[neutral] Sit for a sec if you want.') },
    { id: 'ext_sign_danger', type: 'sign_danger', x: 43, y: 21, script: 'pro.danger' },
    vent(8, 23, 0),
    vent(17, 24, 1),
    vent(28, 23, 0),
    vent(40, 25, 1),
    vent(46, 23, 0),
    { type: 'decal_leaves', x: 22, y: 26 },
    { type: 'decal_leaves', x: 3, y: 22 },
  ],
  doors: {
    // The front doors: a condition gate (CONTENT §1). TRUE = locked.
    '24,6': {
      id: 'ext_front_doors', type: 'door_front', state: 'chained', label: 'HALLOWELL',
      lock: (s) => !s.flags.pro_doors_cut || !!s.flags.register_done,
      unlockSfx: 'chain_rattle',
      lockedText: (s) => (s.flags.register_done
        ? ['[n] The doors stand open on the dark lobby.', '[exhausted] No. Not back in there.']
        : ['[n] A chain through both push bars, and a padlock the size of a fist.',
          { cond: (st) => has(st, 'danny'), text: '[danny:grin] Relax. I came prepared.' }]),
      to: { map: 'lobby', anchor: 'from_exterior' },
    },
  },
  rooms: [
    { id: 'ext_steps', name: 'Front Steps', rect: [16, 5, 18, 5], kind: 'outside' },
    { id: 'ext_lawn_w', name: 'West Lawn', rect: [1, 5, 15, 5], kind: 'outside' },
    { id: 'ext_lawn_e', name: 'East Lawn', rect: [34, 5, 15, 5], kind: 'outside' },
    { id: 'ext_lot', name: 'Parking Lot', rect: [1, 10, 48, 12], kind: 'outside' },
    { id: 'ext_road', name: 'Route 61', rect: [1, 22, 48, 5], kind: 'outside' },
  ],
  anchors: {
    start: [22, 11, 'up'],          // the party piles out of the wagon, the school straight ahead
    car: [19, 13, 'up'],            // driver's side
    oak: [11, 9, 'up'],
    front_doors: [24, 9, 'up'],     // foot of the steps
    chute_exit: [46, 6, 'down'],    // under the coal hatch (TRUANT)
    dawn_steps: [24, 8, 'down'],    // on the steps, looking out at the lot
    dawn_lot: [23, 13, 'up'],       // beside the wagon
  },
  exits: [
    // Fallback if a script leaves the front doors standing open: walking in = entering.
    { id: 'front_doors', rect: [24, 1, 2, 5], to: 'lobby', anchor: 'from_exterior', cond: (s) => !s.flags.register_done },
    { id: 'front_doors_dawn', rect: [24, 1, 2, 5], to: 'lobby', anchor: 'from_exterior', cond: (s) => !!s.flags.register_done,
      lock: () => true, lockedText: '[exhausted] No. I\'m done with in there.' },
    // Route 61 runs off into the dark both ways: refused in voice.
    { id: 'road_west', rect: [1, 21, 1, 6], to: 'exterior', anchor: 'start', lock: () => true,
      lockedText: (s) => (has(s, 'leah') ? '[leah:deadpan] T. The car is the other way. We are not walking to Pottsville.'
        : '[n] Route 61 runs off into the dark. Nobody\'s coming. Nobody\'s been coming for years.') },
    { id: 'road_east', rect: [48, 21, 1, 6], to: 'exterior', anchor: 'start', lock: () => true,
      lockedText: (s) => (has(s, 'danny') ? '[danny:grin] Dolan. The school\'s *that* way. Don\'t chicken out on me now.'
        : '[n] The road just goes on into the dark. There\'s nothing that way but Pottsville, and nobody there knows.') },
  ],
  triggers: [
    { id: 'approach_doors', rect: [22, 7, 6, 1], script: 'pro.doors', once: true, cond: (s) => !s.flags.pro_doors_cut },
  ],
  lights: [],
};
