// BREAKER — the Hallowell Breaker, 1894, still standing in the burning dark (maps-E).
// CONTENT §2.13 · DESIGN §2, §6 VIII.4–6, §5.8 (lamps) · 60×44, offset (45, -30), floor B3.
//
// A vast cavern over the mine fire. Everything not structure is a drop (`pit`): red far below, lit by
// `mine_fire` lights in the floor pits and the side voids, so the black timber reads in silhouette
// with a red rim. The breaker rises north as a stepped stack of picking floors (decks), each one
// narrower than the one below — a black pyramid with the weigh-master's office at the apex.
//
//   CAVERN FLOOR (rows 36–41): a gravel / coal ledge along the south, broken by fire pits. Arrival
//     `from_vault` at the SW tunnel mouth (exit back → vault/to_breaker). Trigger `breaker_enter`
//     (→ ch8.breaker: the shift whistle) two steps in. At the foot of the breaker's front face two
//     boys sit at the bottom chutes (lamps 1–2 bloom as soon as the whistle scene ends).
//   THE BREAKER — four plank decks (picking floors), each 3 rows: the north row holds the picking
//     benches, then a clear 2-wide lane, then an iron railing; under every deck an open 2-row drop,
//     red from the fire below (mine_fire lights in each drop), so the decks read as black bands over
//     red. Coal chutes hang across every drop to a bench where a boy's husk sits facing up the chute,
//     his back (split like a cicada shell) to the walkway. A timber head-house flanks the office and
//     feeds L4's chutes. Stairs bridge the drops, zig-zagging at alternating ends:
//       S1 floor → L1 at x 19–20 (anchor `stairs_1` at its top) · L1 walked east
//       S2 L1 → L2 at x 46–47 (anchor `stairs_2`)                · L2 walked west
//       S3 L2 → L3 at x 14–15                                     · L3 walked east
//       S4 L3 → L4 at x 42–43                                     · L4 walked west to the centre
//       S5 L4 → office at x 29–30 (centre)
//     L1's dead west end: the picking room's door, barred from the other side (1894).
//     Timber posts (`beam`) stand on the railings and in the voids; two sheave wheels hang overhead.
//   WEIGH-MASTER'S OFFICE (x 23–36, rows 5–8; timber), open to the breaker behind a balustrade: the
//     high weigh desk with THE REGISTER `br_register` (default interaction → sys.register; anchor
//     `register` in front of it), his split chair behind it (the hand comes from that side), payroll
//     ledgers `br_ledgers` (doc ledger_colonel), the 1894 inquest papers `br_inquiry` (doc
//     inquiry_1894) on a writing desk, the brass-check board, the whistle lever, two lit candles either
//     side of the book — the beacon at the top. Trigger `office_enter` (→ ch8.office, checkpoint),
//     anchor `office`.
//
// LAMPS: 17 husks (`husk_seated`, variant 'boy') each with a map light { type: 'lamp_miner', group:
// 'lamp_N', on: false }, numbered in climbing order along the route; `breaker.thresholds` makes each
// deck's lamps bloom one by one, in the direction she will walk, as she climbs the stair up to it
// (game/breaker.js). DISMISSED: they go out again from the top (HW.breaker.extinguish).
// ESCAPE (WITHDRAWN): office → S5 → L4 east → S4 → L3 west → S3 → L2 east → S2 → L1 west → S1 →
// floor west → exit. Every lane is 2 wide and clear; benches sit only on the north rows, posts only
// on the railings; no dead end lies on the line.
// Data extra `fx` (for an onEnter/system emitter): ember points over the fire pits, coal-dust points
// at chute feet.
const F = (s) => s.flags || {};
const AFTER = (s) => !!F(s).register_done;
const FREE = (s) => !!F(s).expelled;

// ---- the seventeen (climbing order) ------------------------------------------------------------
// [x, y (bench row), state, examine]
const BOYS = [
  // floor, at the foot of the front face
  [15, 36, 'intact', ['[n] A boy on a bench at the foot of a chute. Amber, hollow, split down the back like the shells on the oak.',
    '[n] His hands are out in front of him, cupped. Like the coal\'s still coming.']],
  [25, 36, 'intact', '[n] Another one. Smaller. The cap\'s too big for him.'],
  // L1 (walked east)
  [17, 30, 'intact', '[n] His lamp\'s lit. I didn\'t see anybody light it.'],
  [25, 30, 'intact', ['[n] Cut into the plank beside him: STASH. And a row of tally marks.', '[n] They stop.']],
  [33, 30, 'intact', '[n] He\'s leaning toward the chute. Like he\'s about to reach in for a piece of slate.'],
  [41, 30, 'intact', '[worried] Don\'t touch them. Don\'t touch them.'],
  // L2 (walked west)
  [43, 24, 'intact', '[n] Through the split in his back I can see the bench he\'s sitting on.'],
  [36, 24, 'intact', '[n] One boot\'s unlaced. The lace is amber too.'],
  [28, 24, 'intact', '[n] His head\'s down. Like he\'s dozing. Like he\'s waiting for the whistle.'],
  [20, 24, 'intact', ['[n] Scratched in the wood: DAI. 11.', '[worried] Eleven.']],
  // L3 (walked east)
  [19, 18, 'intact', '[n] Their caps all face the same way. Up the chutes. Toward the top.'],
  [26, 18, 'intact', '[worried] I keep counting the lamps. I keep getting the same number.'],
  [33, 18, 'turned', ['[scared] His face is turned toward me.', '[scared] The others are all looking at the coal.']],
  [39, 18, 'intact', '[n] A boy. Nine, maybe ten. His shell is so thin the lamp shows through it.'],
  // L4 (walked west to the office stair)
  [40, 12, 'intact', '[n] The last bench under the office. You could see this one from the desk.'],
  [34, 12, 'intact', ['[n] He\'s right under the office. His face is tipped up at the railing.',
    '[worried] He\'s the only one not looking at the coal.'], 'nochute'],
  [18, 12, 'turned', ['[n] Off on his own at the far end of the walk.', '[scared] He was facing the chute. I know he was.']],
];
const BOY_AFTER = [
  { cond: FREE, text: '[n] Just a shell now. Light as paper. Whatever was in it is gone.' },
  { cond: AFTER, text: '[scared] Don\'t look. Keep moving.' },
];
// Lamp N lights when Tess's tile row ≤ thresholds[N-1] (in N order, ≥ 0.35 s apart): the two at the
// foot as soon as she's in; each deck's four as she climbs the stair up to it.
const THRESHOLDS = [41, 41, 35, 34, 33, 33, 29, 28, 27, 27, 23, 22, 21, 21, 17, 16, 15];

const CHUTE_TEXT = [
  '[n] A wooden chute, worn smooth as glass. A lump of coal sits in it halfway down, stopped. Waiting.',
  '[n] The chute climbs up into the dark. Something shifts in it, up there, and settles.',
];
const boyProps = [];
BOYS.forEach(([x, y, state, text, nochute], i) => {
  const n = i + 1;
  const chutes = nochute ? [] : [
    { type: 'chute', x, y: y - 2, dir: 'down', variant: n },
    { type: 'chute', x, y: y - 1, dir: 'down', variant: n + 1 },
  ];
  boyProps.push(
    { id: `br_bench_${n}`, type: 'picking_bench', x: x - 1, y,
      examine: n === 4 ? '[n] A low bench, the plank polished where they sat. Somebody carved a name and gave up on the tally.'
        : undefined },
    { id: `br_boy_${n}`, type: 'husk_seated', x, y, dir: 'up', variant: 'boy', state, solid: false,
      examine: [...BOY_AFTER, { text }] },
    ...chutes,
  );
});
for (const p of boyProps) if (p.examine === undefined) delete p.examine;
const LAMPS = BOYS.map(([x, y], i) => ({ type: 'lamp_miner', x, y: y - 1.2, group: `lamp_${i + 1}`, on: false }));

// ---- timber posts: on the railings between benches, and standing in the voids --------------------
const POST_TEXT = '[n] A tarred timber, thick as I am. The fire\'s been licking it from underneath for thirty years. It hasn\'t burned.';
const POSTS = [
  [11, 33], [30, 33], [48, 33],                           // L1 railing: ends + middle
  [13, 27], [31, 27],                                     // L2 railing
  [23, 21], [37, 21],                                     // L3 railing
  [24, 15], [38, 15],                                     // L4 railing
  [9, 26], [11, 15], [50, 21], [52, 30], [48, 12], [6, 35], // legs standing up out of the voids
  [27, 37], [44, 36],                                     // floor
].map(([x, y], i) => ({ type: 'beam', x, y, variant: i % 2, ...(i === 0 || i === 15 ? { examine: POST_TEXT } : {}) }));

export default {
  id: 'breaker',
  name: 'The Breaker',
  floor: 'B3',
  offset: [45, -30],
  ambience: 'breaker',
  music: null,
  dark: 0.945,
  ambient: '#1c0806',
  moon: 0,
  //   x → 0         1         2         3         4         5
  //       012345678901234567890123456789012345678901234567890123456789
  tiles: [
    '                                                            ', //  0
    ' RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR ', //  1
    ' RRRRRRRRRRRRRRRRRRRRRKKKKKKKKKKKKKKKKRRRRRRRRRRRRRRRRRRRRR ', //  2
    ' RRRRRRRRRRRRRRRRRRRRRKKKKKKKKKKKKKKKKRRRRRRRRRRRRRRRRRRRRR ', //  3
    ' RRRRRRRRZZZZZZZZZZZZZKKKKKKKKKKKKKKKKZZZZZZZZZZZZRRRRRRRRR ', //  4
    ' RRRRZZZZZZZZZZZZZZZZZKppppppppppppppKZZZZZZZZZZZZZZZZZRRRR ', //  5
    ' RRRRZZZZZZZZZZZZZZZZZKppppppppppppppKZZZZZZZZZZZZZZZZZRRRR ', //  6
    ' RRZZZZZZZZZZZZZKKKKKKKppppppppppppppKKKKKKKZZZZZZZZZZZRRRR ', //  7
    ' RRZZZZZZZZZZZZZKKKKKKKppppppppppppppKKKKKKKZZZZZZZZZZZZZRR ', //  8
    ' RRZZZZZZZZZZZZZKKKKKKK||||||^^||||||KKKKKKKZZZZZZZZZZZZZRR ', //  9
    ' RRZZZZZZZZZZZZZZZZZZZZZZZZZ|^^|ZZZZZZZZZZZZZZZZZZZZZZZZZRR ', // 10
    ' RRZZZZZZZZZZZZZZZZZZZZZZZZZ|^^|ZZZZZZZZZZZZZZZZZZZZZZZZZRR ', // 11
    ' RRZZZZZZZZZZZZ|pppppppppppppppppppppppppppp|ZZZZZZZZZZZZRR ', // 12
    ' RZZZZZZZZZZZZZ|pppppppppppppppppppppppppppp|ZZZZZZZZZZZZRR ', // 13
    ' RZZZZZZZZZZZZZ|pppppppppppppppppppppppppppp|ZZZZZZZZZZZZRR ', // 14
    ' RZZZZZZZZZZZZZ|||||||||||||||||||||||||||^^|ZZZZZZZZZZZZRR ', // 15
    ' RZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ|^^|ZZZZZZZZZZZZRR ', // 16
    ' RZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ|^^|ZZZZZZZZZZZZZR ', // 17
    ' RZZZZZZZZZZZ|pppppppppppppppppppppppppppppppp|ZZZZZZZZZZZR ', // 18
    ' RZZZZZZZZZZZ|pppppppppppppppppppppppppppppppp|ZZZZZZZZZZZR ', // 19
    ' RZZZZZZZZZZZ|pppppppppppppppppppppppppppppppp|ZZZZZZZZZZZR ', // 20
    ' RZZZZZZZZZZZ|^^|||||||||||||||||||||||||||||||ZZZZZZZZZZZR ', // 21
    ' RZZZZZZZZZZZ|^^|ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZR ', // 22
    ' RZZZZZZZZZZZ|^^|ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZR ', // 23
    ' RZZZZZZZZZ|pppppppppppppppppppppppppppppppppppp|ZZZZZZZZZR ', // 24
    ' RZZZZZZZZZ|pppppppppppppppppppppppppppppppppppp|ZZZZZZZZZR ', // 25
    ' RZZZZZZZZZ|pppppppppppppppppppppppppppppppppppp|ZZZZZZZZZR ', // 26
    ' RZZZZZZZZZ|||||||||||||||||||||||||||||||||||^^|ZZZZZZZZZR ', // 27
    ' RZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ|^^|ZZZZZZZZZR ', // 28
    ' RZZZZZZKKZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ|^^|ZZZZZZZZZR ', // 29
    ' RZZZZZZKKpppppppppppppppppppppppppppppppppppppppp|ZZZZZZZR ', // 30
    ' RZZZZZZKDpppppppppppppppppppppppppppppppppppppppp|ZZZZZZZR ', // 31
    ' RZZZZZZKKpppppppppppppppppppppppppppppppppppppppp|ZZZZZZZR ', // 32
    ' RZZZZZZZ||||||||||^^||||||||||||||||||||||||||||||ZZZZZZZR ', // 33
    ' RZZZZZZZZZZZZZZZZ|^^|ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZR ', // 34
    ' RZZZZZZZZZZZZZZZZ|^^|ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZR ', // 35
    ' R%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%ZZZZZZZZZZR ', // 36
    ' R;;;;;;;;;;;;;;;;;%%%%%%%%%%%%ZZZ%%%%%%%%%ZZZZZZZZZZZZZZZR ', // 37
    ' %%%;;;;;;;;;;;;;;;;;;;;;;;;;;%ZZZ%%%ZZZZ%%ZZZZZZZZZZZZZZZR ', // 38
    ' %%%;;;;;;;;;;;;;;;;;;;;;;;;ZZZZZZ%%%ZZZZ%ZZZZZZZZZZZZZZZZR ', // 39
    ' %%%;;;;;;;;ZZZ;;;;;;;ZZZ;;;ZZZZZZ%%ZZZZZ%ZZZZZZZZZZZZZZZZR ', // 40
    ' R;;;;ZZZ;;;ZZZ;;;;;;;ZZZ;;;ZZZZZZ%%ZZZZZ%ZZZZZZZZZZZZZZZZR ', // 41
    ' RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR ', // 42
    '                                                            ', // 43
  ],
  objects: [
    // ================================================================ the seventeen
    ...boyProps,
    ...POSTS,
    // two chutes with nobody at their foot (reachable to examine): one spills onto the cavern floor,
    // one hangs from the head house over L4
    { type: 'chute', x: 34, y: 34, dir: 'down', variant: 1 },
    { type: 'chute', x: 34, y: 35, dir: 'down', variant: 2, examine: CHUTE_TEXT[0] },
    { type: 'chute', x: 21, y: 10, dir: 'down', variant: 0 },
    { type: 'chute', x: 21, y: 11, dir: 'down', variant: 1, examine: CHUTE_TEXT[1] },
    { type: 'pulley_wheel', x: 46, y: 6 },
    { type: 'pulley_wheel', x: 11, y: 10 },

    // ================================================================ cavern floor
    { type: 'decal_tiles', x: 9, y: 37,
      examine: ['[n] Slate. Thousands of flat gray chips, picked out of the coal by hand and thrown down here.',
        '[n] A hill of it. Years of it.'] },
    { type: 'decal_tiles', x: 17, y: 39 },
    { type: 'coal_heap', x: 3, y: 36, state: 'flat', interact: false },
    { type: 'coal_heap', x: 33, y: 36, state: 'flat', interact: false },
    { type: 'steam_vent', x: 11, y: 40,
      examine: [
        { cond: AFTER, text: '[scared] Don\'t look down. Go.' },
        { text: ['[n] The floor just stops. Red, a long way down. The heat comes up off it in a wall.',
          '[worried] It\'s burning under the whole town. It\'s been burning since 1962.'] },
      ] },
    { type: 'steam_vent', x: 21, y: 39 },
    { type: 'steam_vent', x: 27, y: 40 },
    { type: 'steam_vent', x: 35, y: 37 },
    { type: 'lamp_miner', x: 6, y: 39, state: 'out',
      examine: '[n] A cap-lamp somebody dropped. The wick\'s burned down to nothing.' },

    // ================================================================ L1 west end: the picking-room door
    { id: 'br_door', type: 'door_side', x: 9, y: 31, state: 'locked',
      lockedText: ['[n] A door. It gives an inch and stops against something heavy.',
        '[n] Through the gap: a timber bar, dropped into iron hooks. On the outside.',
        '[scared] They barred it from the outside.'] },

    // ================================================================ the weigh-master's office
    { id: 'br_whistle', type: 'lever', x: 25, y: 4, state: 'up',
      examine: ['[n] An iron pull on a chain that runs up through the roof. A brass tag: WHISTLE.',
        '[worried] I\'m not touching it.'] },
    { id: 'br_checks', type: 'pegboard', x: 31, y: 4, state: 'keys',
      examine: ['[n] A board of brass checks on numbered hooks, each one the size of a quarter.',
        '[n] Seventeen are still hanging.'] },
    { id: 'br_inquiry_desk', type: 'writing_desk', x: 23, y: 6,
      examine: '[n] A clerk\'s desk. Pen nibs rusted to the tray. Papers pinned under an iron weight.' },
    { id: 'br_inquiry', type: 'note_paper', x: 24, y: 6, doc: 'inquiry_1894',
      examine: '[n] INQUEST — HALLOWELL BREAKER — OCTOBER 1894. Testimony, in a clerk\'s copperplate.' },
    { id: 'br_chair', type: 'chair_teacher', x: 28, y: 5, dir: 'down', noSit: true,
      examine: ['[n] His chair, behind the weigh desk. The seat\'s split down the middle and the arms are splayed out.',
        '[scared] Something much too big sat here.'] },
    { id: 'br_weigh_desk', type: 'weigh_desk', x: 28, y: 6,
      examine: '[n] The weigh-master\'s desk, high, facing out over the picking floors. A brass beam-scale bolted to the side.' },
    { id: 'br_register', type: 'register_book', x: 28, y: 6 },
    { id: 'br_candle', type: 'candle', x: 30, y: 6, state: 'lit',
      examine: ['[n] A candle, burning. Down here.', '[scared] Somebody was expecting me.'] },
    { id: 'br_candle_2', type: 'candle', x: 27, y: 6, state: 'lit',
      examine: '[n] Two candles, one either side of the book. Like a church.' },
    { id: 'br_ledgers', type: 'shelf_ledgers', x: 34, y: 5, doc: 'ledger_colonel',
      examine: '[n] Payroll ledgers, black, one for every year the breaker ran. One\'s pulled halfway out.' },
    { type: 'cobweb', x: 23, y: 5, dir: 'left' },
    { type: 'cobweb', x: 36, y: 5, dir: 'right' },
    { type: 'decal_papers', x: 32, y: 7 },
  ],

  rooms: [
    { id: 'br_floor', name: 'Cavern Floor', rect: [2, 36, 46, 6], kind: 'special' },
    { id: 'br_picking', name: 'The Breaker', rect: [9, 12, 41, 24], kind: 'special' },
    { id: 'br_office', name: 'Weigh-master\'s Office', rect: [23, 5, 14, 4], kind: 'office' },
  ],

  anchors: {
    from_vault: [3, 39, 'right'],     // first anchor: SW tunnel mouth (exit is x 1)
    floor: [10, 38, 'up'],            // the cavern floor, looking up at the breaker
    stairs_1: [20, 31, 'right'],      // L1, top of the first stair
    stairs_2: [46, 25, 'left'],       // L2, top of the second stair
    landing_3: [15, 19, 'right'],     // L3, top of the third stair
    landing_4: [42, 13, 'left'],      // L4, top of the fourth stair
    barred_door: [10, 31, 'left'],
    chute_head: [34, 13, 'up'],       // L4 under the office: where the chutes come down from the top
    office: [32, 7, 'left'],          // inside the office, by the ledgers, facing the desk
    register: [28, 7, 'up'],          // in front of the weigh desk and the book
  },

  exits: [
    { id: 'vault', rect: [1, 38, 1, 3], to: 'vault', anchor: 'to_breaker' },
  ],

  triggers: [
    { id: 'breaker_enter', rect: [5, 36, 1, 6], script: 'ch8.breaker', once: true, cond: (s) => !AFTER(s) },
    { id: 'office_enter', rect: [29, 8, 2, 1], script: 'ch8.office', once: true, cond: (s) => !AFTER(s) },
  ],

  lights: [
    // the fire below: floor pits (the breaker is lit red from underneath)
    { type: 'mine_fire', x: 30.5, y: 40, radius: 7, intensity: 0.9 },
    { type: 'mine_fire', x: 38.5, y: 39.5, radius: 6, intensity: 0.8 },
    { type: 'mine_fire', x: 46, y: 39, radius: 7, intensity: 0.85 },
    { type: 'mine_fire', x: 13, y: 40.5, radius: 4, intensity: 0.6 },
    { type: 'mine_fire', x: 23, y: 40.5, radius: 4, intensity: 0.6 },
    { type: 'mine_fire', x: 7, y: 41, radius: 3, intensity: 0.5 },
    // the open drops between the picking floors: red bands under every deck
    ...[[34.5, [12, 28, 41]], [28.5, [16, 30, 43]], [22.5, [19, 31, 41]], [16.5, [21, 31, 39]], [10.5, [20, 39]]]
      .flatMap(([y, xs]) => xs.map((x) => ({ type: 'mine_fire', x, y, radius: 3.8, intensity: 0.95, shadows: false }))),
    // the voids either side: the deck ends in red silhouette
    { type: 'mine_fire', x: 5, y: 30, radius: 7, intensity: 0.6, shadows: false },
    { type: 'mine_fire', x: 7, y: 18, radius: 8, intensity: 0.5, shadows: false },
    { type: 'mine_fire', x: 10, y: 8, radius: 6, intensity: 0.35, shadows: false },
    { type: 'mine_fire', x: 54, y: 31, radius: 8, intensity: 0.65, shadows: false },
    { type: 'mine_fire', x: 52, y: 19, radius: 8, intensity: 0.5, shadows: false },
    { type: 'mine_fire', x: 49, y: 8, radius: 6, intensity: 0.35, shadows: false },
    // the seventeen cap-lamps, dark until the climb lights them
    ...LAMPS,
  ],

  breaker: { thresholds: THRESHOLDS },

  // For an ambient emitter (onEnter script or system): HW.fx.emit(type, x*16+8, y*16+8, …) at intervals.
  fx: {
    ember: [[30, 40], [38, 39], [45, 39], [13, 41], [23, 41], [7, 41], [5, 30], [53, 33], [52, 22], [7, 20]],
    coal_dust: [[15, 35], [25, 35], [25, 29], [33, 29], [36, 23], [28, 23], [26, 17], [34, 11]],
    steam: [[11, 40], [21, 39], [27, 40], [35, 37]],
  },
};
