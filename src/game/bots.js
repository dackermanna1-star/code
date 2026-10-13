// Bots: a take on the Condition Zero / CS 1.6 bots for de_dust2.
//
// BotManager is the team brain. Each round the Terrorists pick a plan (long or
// short A, B tunnels, mid-to-B, splits, fakes, rushes, or a default spread with
// a mid-round call), move in groups that wait for each other at the entry,
// throw their utility and execute together; lurkers watch for rotations. The
// CTs pick a setup (A long / A site / mid / B), every bot holds its own spot
// facing the likely entries, intel (sightings, deaths, gunfire) makes them
// rotate, and after the plant they regroup, retake together and defuse.
//
// Bot is one player: perception (field of view, line of sight, smoke, reaction
// time, hearing, memory of the last known enemy position), aim (settling error,
// recoil control, head-height crosshair placement, corner pre-aim), weapon
// handling (taps / bursts / spray, counter-strafe, crouch-spray, AWP holds and
// quick-scopes, reloading in cover), grenades (throws simulated with the real
// grenade physics), navigation (A* + string pulling, teammate avoidance,
// unstuck logic, crouch-jumps) and buying (team economy, AWPer, drops).

import { TEAM_T, TEAM_CT } from './player.js';
import { initGenericKnowledge, planGeneric, genericObjective } from './botsgeneric.js';
import { zombieRadio, zombieFallBack, zombieOrderInFight, zombieMayStepTo } from './zorders.js';
import { Player } from './player.js';
import { IN_JUMP, IN_DUCK, IN_WALK } from '../engine/pmove.js';
import { angleVectors, DEG } from '../engine/coords.js';
import { TraceResult, MASK_SHOT } from '../engine/collision.js';
import { PLAYER_SKINS } from '../assets/playermodels.js';
import * as WS from './weaponsys.js';
import * as CR from './combatrules.js';
import { GAS_R } from './zroster.js';

const BTN_ATTACK = 1, BTN_ATTACK2 = 2, BTN_RELOAD = 4, BTN_USE = 8;

export const BOT_NAMES = [
  'Albert', 'Allen', 'Bert', 'Bob', 'Cecil', 'Clarence', 'Elliot', 'Elmer', 'Ernie', 'Eugene', 'Fergus', 'Ferris',
  'Frank', 'Frasier', 'Fred', 'George', 'Graham', 'Harvey', 'Irwin', 'Jerry', 'Joe', 'Josh', 'Kurt', 'Lars',
  'Larry', 'Leonard', 'Lionel', 'Louis', 'Maxwell', 'Moe', 'Morris', 'Neil', 'Oscar', 'Oswald', 'Pete', 'Quentin',
  'Ray', 'Rich', 'Rock', 'Sergio', 'Seth', 'Shark', 'Stan', 'Steve', 'Ted', 'Tim', 'Ulric', 'Vinny', 'Wade', 'Walt',
  'Xavier', 'Yanni', 'Zach', 'Gunner', 'Hank', 'Grunt', 'Ringo', 'Rabbit', 'Wolf', 'Vitaliy',
];

// reaction: seconds before a newly seen enemy is engaged; err: initial aim error
// (degrees) that settles over `settle` seconds; turn: max turn rate (deg/s);
// head: chance to go for the head; spray: burst discipline 0..1; recoil: share
// of the recoil (punch) compensated; stop: chance to counter-strafe before
// shooting; nades: grenade usage 0..1; hearing: hearing range multiplier; lag:
// tracking lag on moving targets (s); scope: AWP scope-in settle time (s);
// dodge: chance to turn away from an enemy flashbang seen about to pop.
export const DIFFICULTY = {
  easy: { reaction: 0.65, err: 5.5, turn: 260, head: 0.08, spray: 0.4, name: 'Easy', settle: 0.5, recoil: 0.35, stop: 0.15, nades: 0.15, hearing: 0.7, lag: 0.16, scope: 0.45, aggression: 0.3, dodge: 0.15 },
  normal: { reaction: 0.42, err: 3.2, turn: 420, head: 0.2, spray: 0.6, name: 'Normal', settle: 0.38, recoil: 0.7, stop: 0.55, nades: 0.4, hearing: 0.85, lag: 0.11, scope: 0.3, aggression: 0.45, dodge: 0.35 },
  hard: { reaction: 0.27, err: 2.0, turn: 620, head: 0.35, spray: 0.75, name: 'Hard', settle: 0.28, recoil: 0.88, stop: 0.85, nades: 0.65, hearing: 1, lag: 0.07, scope: 0.2, aggression: 0.55, dodge: 0.55 },
  expert: { reaction: 0.17, err: 1.1, turn: 900, head: 0.5, spray: 0.9, name: 'Expert', settle: 0.2, recoil: 0.96, stop: 1, nades: 0.8, hearing: 1.1, lag: 0.045, scope: 0.14, aggression: 0.6, dodge: 0.75 },
};

const EYE = 53; // eye height above the feet when standing (VEC_VIEW 17 above the hull centre)

// ---------------------------------------------------------------------------
// de_dust2 knowledge. Feet positions (GoldSrc units); they are snapped to the
// navigation graph at startup. Watch points are where an enemy's feet would be.

// Callout boxes [name, site, x0, y0, x1, y1, zMin, zMax] - first match wins.
const ZONES = [
  ['A Short', 'A', 256, 1596, 520, 2528, 40, 400],
  ['A Ramp', 'A', 1268, 2304, 1610, 2812, -60, 400],
  ['A Site', 'A', 264, 2400, 1610, 3100, 60, 400],
  ['Under A', 'A', 512, 2040, 1276, 2420, -200, 60],
  ['Long A', 'A', 1236, 1220, 1800, 2304, -100, 200],
  ['Long A', 'A', 516, 800, 1610, 1220, -100, 200],
  ['Pit', 'A', 1236, 0, 1610, 800, -300, 200],
  ['Long A', 'A', 1600, 300, 1800, 1100, -100, 200],
  ['Long Doors', 'A', 516, 192, 1236, 800, -100, 200],
  ['CT Spawn', 'CT', -290, 1980, 544, 2560, -200, 40],
  ['Catwalk', 'A', -262, 768, 520, 1800, -40, 200],
  ['CT Mid', 'mid', -620, 1676, -256, 2048, -200, 100],
  ['Mid', 'mid', -620, 516, -256, 1676, -200, 100],
  ['Top Mid', 'mid', -780, -620, 128, 516, -100, 200],
  ['Outside Long', 'A', -10, -1030, 800, 300, -100, 200],
  ['T Spawn', 'T', -2300, -1100, 0, -124, -100, 400],
  ['Outside Tunnels', 'B', -2100, -124, -1390, 700, -100, 300],
  ['B Tunnels', 'B', -2070, 1420, -1900, 1860, -50, 300],
  ['Upper Tunnels', 'B', -2200, 680, -1050, 1460, 0, 300],
  ['Lower Tunnels', 'B', -1200, 1000, -520, 1560, -200, 0],
  ['B Doors', 'B', -1370, 2040, -1140, 2310, -50, 200],
  ['B Window', 'B', -1300, 2560, -1000, 2760, 100, 300],
  ['B Site', 'B', -2130, 1540, -1340, 3300, -50, 300],
  ['CT B Road', 'mid', -1300, 2040, -256, 2900, -200, 300],
];

export function zoneOf(pos) {
  for (const z of ZONES) {
    if (pos[0] >= z[2] && pos[0] <= z[4] && pos[1] >= z[3] && pos[1] <= z[5] && pos[2] >= z[6] && pos[2] <= z[7]) return z;
  }
  return null;
}
export function calloutOf(pos) { return zoneOf(pos)?.[0] || '?'; }

const H = (n, p, w, o = {}) => ({ n, p, w, ...o });

export const MAPDATA = {
  sites: {
    A: { center: [1150, 2560, 96], plant: [[1150, 2525, 96], [1110, 2600, 96], [1210, 2600, 96], [1170, 2360, 96]], flash: [1180, 2560, 250] },
    B: { center: [-1550, 2650, 0], plant: [[-1560, 2620, 0], [-1520, 2760, 0], [-1650, 2700, 0], [-1450, 2540, 0]], flash: [-1620, 2480, 200] },
  },
  // T routes from spawn to a site. `gather`: where the group waits for each
  // other; util: grenades thrown from route point `at` during the execute (or
  // during the setup with when: 'setup').
  routes: {
    long: {
      site: 'A',
      pts: [[-600, -770, 128], [-220, -760, 56], [180, -720, 0], [420, -260, 0], { p: [430, 110, 0], gather: 1 },
        [646, 330, 0], [646, 770, 0], [840, 980, 0], [1380, 1350, 0], [1420, 1950, 0], [1580, 2220, 20], [1400, 2480, 45]],
      util: [
        { at: 7, type: 'smokegrenade', target: [1540, 2260, 20], from: [1232, 976, 0] },
        { at: 8, type: 'flashbang', target: [1420, 2620, 230], from: [1392, 1616, 0] },
        { at: 8, type: 'hegrenade', target: [1420, 2760, 110], from: [1424, 1744, 0] },
      ],
    },
    short: {
      site: 'A',
      pts: [[-600, -770, 128], [-220, -760, 56], [60, -560, 0], [-440, -480, 0], [-440, -120, 0], [-390, 200, 0], [-250, 420, 0], [-190, 700, 0],
        { p: [-190, 1150, 0], gather: 1 }, [-120, 1480, 0], [320, 1680, 40], [380, 1950, 96], [400, 2350, 96], [760, 2620, 96]],
      util: [
        { at: 6, type: 'smokegrenade', target: [-380, 1660, -128], from: [-304, 432, 0], when: 'setup' },
        { at: 9, type: 'smokegrenade', target: [720, 2660, 96], from: [304, 1520, 0] },
        { at: 9, type: 'flashbang', target: [420, 2250, 250], from: [240, 1520, 0] },
        { at: 10, type: 'hegrenade', target: [430, 2000, 96], from: [304, 1680, 48] },
      ],
    },
    tunnels: {
      site: 'B',
      pts: [[-700, -770, 128], [-940, -770, 128], [-1500, -650, 128], [-1920, -640, 128], [-1920, -330, 70], [-1880, -60, 0], [-1700, 250, 0],
        [-1676, 620, 32], [-1676, 900, 32], [-1600, 1070, 32], [-1800, 1220, 32], { p: [-1880, 1360, 32], gather: 1 }, [-1996, 1500, 32],
        [-1976, 1830, 16], [-1850, 2080, 0], [-1600, 2550, 0]],
      util: [
        { at: 12, type: 'smokegrenade', target: [-1330, 2190, 0], from: [-2000, 1776, 32] },
        { at: 12, type: 'smokegrenade', target: [-1330, 2680, 140], from: [-2000, 1744, 32] },
        { at: 13, type: 'flashbang', target: [-1760, 2200, 220], from: [-2000, 1648, 32] },
        { at: 12, type: 'hegrenade', target: [-1900, 2560, 32], from: [-2000, 1552, 32] },
      ],
    },
    midB: {
      site: 'B',
      pts: [[-600, -770, 128], [-220, -760, 56], [60, -560, 0], [-440, -480, 0], [-440, -120, 0], [-390, 200, 0], [-390, 600, 0], [-390, 1000, -50],
        [-400, 1420, -128], [-560, 1420, -112], [-850, 1440, -112], [-1100, 1400, -112], [-1096, 1200, -90], [-1076, 1080, -48], [-1200, 1080, 0],
        [-1450, 1080, 32], [-1800, 1220, 32], { p: [-1880, 1360, 32], gather: 1 }, [-1996, 1500, 32], [-1976, 1830, 16], [-1850, 2080, 0], [-1600, 2550, 0]],
      util: [
        { at: 17, type: 'smokegrenade', target: [-1330, 2190, 0], from: [-2000, 1776, 32] },
        { at: 18, type: 'flashbang', target: [-1760, 2200, 220], from: [-2000, 1648, 32] },
        { at: 17, type: 'hegrenade', target: [-1900, 2560, 32], from: [-2000, 1552, 32] },
      ],
    },
    midDoors: {
      site: 'B',
      pts: [[-600, -770, 128], [-220, -760, 56], [60, -560, 0], [-440, -480, 0], [-440, -120, 0], [-390, 200, 0], [-390, 600, 0], [-390, 1000, -50],
        [-400, 1420, -128], { p: [-620, 1420, -112], gather: 1 }, [-400, 1450, -128], [-380, 1640, -128], [-420, 1900, -128], [-650, 2170, -128], [-1000, 2170, -50], [-1240, 2180, 0],
        [-1330, 2185, 0], [-1520, 2300, 0], [-1560, 2600, 0]],
      util: [
        { at: 10, type: 'flashbang', target: [-400, 1900, -20], from: [-368, 1552, -128] },
      ],
    },
  },
  // CT hold spots by role. w: watch points; awp: good AWP angle; agg: aggressive.
  holds: {
    longA: [
      H('ramp top', [1424, 2736, 113], [[1440, 1700, 0], [1600, 2200, 25]], { awp: 1, long: 1 }),
      H('long corner', [1712, 2279, 48], [[1400, 1350, 0]], { agg: 1 }),
      H('A plat edge', [1168, 2320, 96], [[1420, 2050, 0], [1550, 2250, 20]]),
      H('blue', [743, 1168, 0], [[646, 760, 0]], { agg: 1, awp: 1, long: 1 }),
    ],
    siteA: [
      H('goose', [1488, 2864, 128], [[1420, 2450, 40], [500, 2650, 96]]),
      H('short hold', [720, 2672, 96], [[390, 1950, 96], [400, 2400, 96]]),
      H('bridge end', [400, 2672, 96], [[390, 1900, 96]], { duck: 1 }),
      H('A crates', [1232, 2704, 96], [[1420, 2450, 40], [400, 2450, 96]]),
    ],
    mid: [
      H('CT mid', [-400, 2000, -128], [[-390, 900, -40]], { awp: 1, long: 1 }),
      H('short top', [432, 1872, 96], [[320, 1650, 40], [100, 1500, 0]]),
      H('short stairs', [368, 1648, 48], [[-150, 1420, 0], [100, 1500, 0]], { agg: 1 }),
      H('mid doors', [-400, 1776, -128], [[-390, 800, 0]], { agg: 1 }),
    ],
    B: [
      H('B site', [-1650, 2460, 0], [[-1976, 1830, 16], [-1700, 2150, 0]], { awp: 1 }),
      H('B doors', [-1440, 2260, 0], [[-1976, 1850, 16], [-1700, 2050, 0]]),
      H('B back', [-1640, 2780, 0], [[-1700, 2150, 0], [-1850, 2080, 0]]),
      H('B crates', [-1456, 2544, 0], [[-1976, 1840, 16], [-1700, 2150, 0]], { duck: 1 }),
      H('B tunnel', [-1808, 1968, 0], [[-1976, 1820, 16]], { agg: 1 }),
    ],
  },
  rotate: {
    A: ['A crates', 'A plat edge', 'goose', 'short hold', 'ramp top'],
    B: ['B back', 'B doors', 'B crates', 'B site'],
  },
  postPlant: {
    A: [
      H('goose', [1488, 2864, 128], [[1420, 2400, 30], [500, 2650, 96]]),
      H('site west', [816, 2640, 96], [[400, 2300, 96]]),
      H('A crates', [1232, 2704, 96], [[1420, 2420, 40], [1500, 2250, 20]]),
      H('bridge', [592, 2704, 96], [[380, 2100, 96]]),
      H('long corner', [1648, 2192, 32], [[1100, 2180, 0]], { agg: 1 }),
    ],
    B: [
      H('back plat', [-2000, 2960, 32], [[-1420, 2185, 0]]),
      H('B main', [-1808, 2000, 0], [[-1420, 2185, 0]]),
      H('back site', [-1584, 2855, 0], [[-1420, 2185, 0]]),
      H('tunnel', [-2023, 1744, 32], [[-1700, 2200, 0], [-1420, 2185, 0]]),
      H('plat', [-1872, 2544, 32], [[-1420, 2185, 0]]),
    ],
  },
  // T lurk spots by attacked site (the lurker watches the other side)
  lurk: {
    A: [H('B tunnel lurk', [-1880, 1370, 32], [[-2000, 1420, 32], [-1700, 1180, 32]]), H('upper tunnels', [-1552, 1104, 32], [[-1080, 1100, -40], [-1996, 1500, 32]])],
    B: [H('long doors lurk', [592, 784, 0], [[840, 1000, 0], [1100, 1100, 0]]), H('top mid lurk', [-272, 432, 0], [[-390, 1400, -128], [-190, 900, 0]])],
  },
  fake: {
    B: { p: [-1990, 1760, 32], shoot: [-1760, 2250, 40], nade: [-1800, 2300, 0] },
    A: { p: [700, 760, 0], shoot: [1000, 1150, 40], nade: [1100, 1100, 0] },
  },
  control: [
    H('long doors', [560, 688, 0], [[840, 1000, 0]]),
    H('catwalk', [-176, 1040, 0], [[-150, 1450, 0]]),
    H('top mid', [-272, 432, 0], [[-390, 1640, -128]]),
    H('B tunnel', [-1880, 1370, 32], [[-2000, 1420, 32], [-1700, 1180, 32]]),
    H('upper tunnel', [-1712, 1104, 32], [[-1676, 900, 32], [-1100, 1080, -48]]),
  ],
  retake: {
    A: { gather: [480, 2250, -128] },
    B: { gather: [-1000, 2170, -50] },
  },
  // where a site's CTs fall back to when the site is overrun
  fallback: {
    A: [[700, 2230, -80], [480, 2250, -128]],
    B: [[-1050, 2180, -40], [-1180, 2120, 0]],
  },
  ctSpawn: [250, 2250, -128],
  // where Terrorists show up (CTs pre-aim these)
  tDanger: [[646, 770, 0], [840, 980, 0], [1420, 1500, 0], [1580, 2220, 20], [1400, 2480, 45], [-120, 1480, 0], [320, 1680, 40], [390, 1950, 96],
    [400, 2350, 96], [-390, 1000, -50], [-380, 1640, -128], [-560, 1420, -112], [-1976, 1830, 16], [-1330, 2185, 0], [-1850, 2080, 0],
    [-1996, 1620, 32], [-1676, 900, 32], [-280, 420, 0], [1100, 2180, 0], [480, 2250, -128], [-1150, 1250, 40], [700, 2650, 96]],
};

// T plans. Groups take a share of the bots (or a fixed n for lurk/fake roles).
const T_PLANS = [
  { name: 'rush A long', weight: 2, site: 'A', rush: true, groups: [{ route: 'long', share: 1 }] },
  { name: 'A long', weight: 3, site: 'A', groups: [{ route: 'long', share: 1 }, { route: 'tunnels', role: 'lurk', n: 1 }] },
  { name: 'A short', weight: 2, site: 'A', groups: [{ route: 'short', share: 1 }, { route: 'long', role: 'lurk', n: 1 }] },
  { name: 'A split', weight: 3, site: 'A', groups: [{ route: 'long', share: 0.6 }, { route: 'short', share: 0.4 }] },
  { name: 'rush B', weight: 3, site: 'B', rush: true, groups: [{ route: 'tunnels', share: 1 }] },
  { name: 'B tunnels', weight: 2, site: 'B', groups: [{ route: 'tunnels', share: 1 }, { route: 'long', role: 'lurk', n: 1 }] },
  { name: 'B split', weight: 2, site: 'B', groups: [{ route: 'tunnels', share: 0.6 }, { route: 'midDoors', share: 0.4 }] },
  { name: 'mid to B', weight: 2, site: 'B', groups: [{ route: 'midB', share: 0.6 }, { route: 'tunnels', share: 0.4 }] },
  { name: 'fake B, hit A', weight: 1, site: 'A', groups: [{ route: 'tunnels', role: 'fake', n: 1 }, { route: 'long', share: 0.5 }, { route: 'short', share: 0.5 }] },
  { name: 'fake A, hit B', weight: 1, site: 'B', groups: [{ route: 'long', role: 'fake', n: 1 }, { route: 'tunnels', share: 1 }] },
  { name: 'default', weight: 2, site: null, default: true },
];

// CT setups by team size (roles from MAPDATA.holds)
const CT_SETUPS = {
  1: [[['mid'], 1], [['siteA'], 1], [['B'], 1]],
  2: [[['siteA', 'B'], 2], [['longA', 'B'], 1], [['mid', 'B'], 1]],
  3: [[['longA', 'mid', 'B'], 2], [['siteA', 'mid', 'B'], 1], [['longA', 'B', 'B'], 1]],
  4: [[['longA', 'siteA', 'mid', 'B'], 3], [['longA', 'siteA', 'B', 'B'], 2]],
  5: [[['longA', 'siteA', 'mid', 'B', 'B'], 5], [['longA', 'siteA', 'siteA', 'mid', 'B'], 1], [['longA', 'mid', 'B', 'B', 'B'], 1], [['longA', 'siteA', 'mid', 'mid', 'B'], 1]],
};
const ROLE_SITE = { longA: 'A', siteA: 'A', mid: 'mid', B: 'B' };

const RADIO = {
  spotted: 'Enemy spotted.', backup: 'Need backup.', fire: 'Taking fire, need assistance!', clear: 'Sector clear.', position: "I'm in position.",
  reporting: 'Reporting in.', go: 'Go go go!', storm: 'Storm the front!', together: 'Stick together, team.', regroup: 'Regroup team.',
  follow: 'Follow me.', cover: 'Cover me!', affirm: 'Affirmative.', negative: 'Negative.', down: 'Enemy down.', blow: "Get out of there, it's gonna blow!",
  planted: 'Bomb has been planted.', hold: 'Hold this position.', fallback: 'Team, fall back!', wait: 'Get in position and wait for my go.',
};

// ---------------------------------------------------------------------------
const tr = new TraceResult();
const _f = [0, 0, 0], _eye = [0, 0, 0], _feet = [0, 0, 0], _ee = [0, 0, 0];
const ZERO = [0, 0, 0];

function angleTo(from, to) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return [-Math.atan2(dz, Math.hypot(dx, dy)) / DEG, Math.atan2(dy, dx) / DEG];
}
const HEAL_SAFE = 330; // bots take a medkit out only with no zombie this close
// a revive is safe with no zombie this close to the reviver: bolder for you (the human) than
// for a bot, and once under way a little closer still. Taking one on (considerRevive) and
// giving it up (runRevive) use the same numbers, or a zombie in between would have the bot
// take it and drop it every second
const reviveClear = (q, prog) => (q.isBot ? 160 : 110) - (prog > 0 ? 30 : 0);
function angDiff(a, b) { return ((a - b) % 360 + 540) % 360 - 180; }
function dist2(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function dist3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function eyeAt(p) { return [p[0], p[1], p[2] + EYE]; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function weightedPick(arr, wf = (x) => x.weight) {
  const total = arr.reduce((s, r) => s + wf(r), 0);
  let x = Math.random() * total;
  for (const r of arr) { x -= wf(r); if (x <= 0) return r; }
  return arr[arr.length - 1];
}
const isSniper = (w) => !!w && (w.id === 'awp' || w.id === 'scout' || w.id === 'g3sg1' || w.id === 'sg550');
const isBolt = (w) => !!w && (w.id === 'awp' || w.id === 'scout');
const isGun = (w) => !!w && w.def.clip > 0;
const hasAmmo = (w) => isGun(w) && (w.clip > 0 || w.ammo > 0);
const teamKey = (t) => (t === TEAM_T ? 'T' : 'CT');

// ---------------------------------------------------------------------------
// Map knowledge prepared against the navigation graph.
class Knowledge {
  constructor(game) {
    this.g = game;
    this.nav = game.nav;
    this.throwCache = new Map();
    this.slotCache = new Map();
    // original BSP maps have no hand-made bot data: derive it (botsgeneric.js)
    if (game.map?.source === 'bsp') { initGenericKnowledge(this, game); return; }
    const D = MAPDATA;
    const S = (p) => this.snap(p);
    const HS = (h) => ({ ...h, pos: S(h.p), watch: h.w.map(eyeAt) });
    this.sites = {};
    for (const [k, s] of Object.entries(D.sites)) this.sites[k] = { name: k, center: S(s.center), plant: s.plant.map(S), flash: s.flash.slice() };
    this.routes = {};
    for (const [name, r] of Object.entries(D.routes)) {
      const pts = r.pts.map((q) => (Array.isArray(q) ? { p: S(q) } : { ...q, p: S(q.p) }));
      this.routes[name] = { name, site: r.site, pts, gather: Math.max(0, pts.findIndex((q) => q.gather)), util: (r.util || []).map((u, i) => ({ ...u, id: `${name}:${i}`, from: u.from ? S(u.from) : null })) };
    }
    this.holds = {};
    const byName = {};
    for (const [role, list] of Object.entries(D.holds)) {
      this.holds[role] = list.map((h) => { const o = HS(h); o.role = role; byName[h.n] = o; return o; });
    }
    this.rotate = { A: D.rotate.A.map((n) => byName[n]).filter(Boolean), B: D.rotate.B.map((n) => byName[n]).filter(Boolean) };
    this.postPlant = { A: D.postPlant.A.map(HS), B: D.postPlant.B.map(HS) };
    this.lurk = { A: D.lurk.A.map(HS), B: D.lurk.B.map(HS) };
    this.fake = { A: { ...D.fake.A, pos: S(D.fake.A.p) }, B: { ...D.fake.B, pos: S(D.fake.B.p) } };
    this.control = D.control.map(HS);
    this.retake = { A: { gather: S(D.retake.A.gather) }, B: { gather: S(D.retake.B.gather) } };
    this.fallback = { A: D.fallback.A.map(S), B: D.fallback.B.map(S) };
    this.ctSpawn = S(D.ctSpawn);
    const ctSpots = [];
    for (const list of Object.values(this.holds)) for (const h of list) ctSpots.push(eyeAt(h.pos));
    this.dangerForT = ctSpots.concat([eyeAt(this.sites.A.center), eyeAt(this.sites.B.center)]);
    this.dangerForCT = D.tDanger.map((p) => eyeAt(S(p))).concat(this.postPlant.A.map((h) => eyeAt(h.pos)), this.postPlant.B.map((h) => eyeAt(h.pos)));
    this.throwCache = new Map();
    this.slotCache = new Map();
  }

  snap(pt) {
    const n = this.nav.nearestXY(pt, 220, 110) || this.nav.nearest(pt, 400);
    return n ? [n.x, n.y, n.z] : pt.slice();
  }

  // Up to k standable spots around a point, at least 56 units apart; with
  // `hidden`, only spots none of those eye positions can see (T gathers).
  slots(pt, k = 6, hidden = null) {
    const key = `${pt[0] | 0},${pt[1] | 0},${pt[2] | 0}${hidden ? 'h' : ''}`;
    let s = this.slotCache.get(key);
    if (s) return s;
    s = [pt.slice()];
    const g = this.g;
    const seen = (q) => {
      if (!hidden) return false;
      const e = eyeAt(q);
      return hidden.some((h) => dist3(h, e) < 2800 && g.visible(h, e));
    };
    const start = this.nav.nearestXY(pt, 100, 60);
    for (const { node } of this.nav.around(start, 260, 400)) {
      if (s.length >= k) break;
      const q = [node.x, node.y, node.z];
      if (node.edges.length < 6) continue; // not hugging walls / ledges
      if (s.every((o) => dist2(o, q) >= 56) && !seen(q)) s.push(q);
    }
    this.slotCache.set(key, s);
    return s;
  }

  // Throw angles that put a grenade of `type` (thrown from `eye`) closest to `target`,
  // using the real throw (grenadeThrow) and grenade physics (updateGrenade).
  throwSolution(eye, target, type) {
    const key = `${type}|${Math.round(eye[0] / 24)},${Math.round(eye[1] / 24)},${Math.round(eye[2] / 16)}|${target[0] | 0},${target[1] | 0},${target[2] | 0}`;
    if (this.throwCache.has(key)) return this.throwCache.get(key);
    const yaw = Math.atan2(target[1] - eye[1], target[0] - eye[0]) / DEG;
    let best = null;
    const tryPitch = (pitch) => {
      const end = this.simulateThrow(eye, pitch, yaw, type);
      const err = type === 'flashbang' ? Math.hypot(end[0] - target[0], end[1] - target[1], (end[2] - target[2]) * 0.5) : dist3(end, target);
      if (!best || err < best.err) best = { pitch, yaw, err, end };
    };
    for (let pitch = -64; pitch <= 40; pitch += 6) tryPitch(pitch);
    const p0 = best.pitch;
    for (let pitch = p0 - 5; pitch <= p0 + 5; pitch += 1.25) if (pitch !== p0) tryPitch(pitch);
    if (this.throwCache.size > 400) this.throwCache.clear();
    this.throwCache.set(key, best);
    return best;
  }

  simulateThrow(eye, pitch, yaw, type) {
    const th = CR.grenadeThrow([pitch, yaw, 0], ZERO, eye, ZERO);
    const gr = CR.createGrenade(type, th.origin, th.velocity, 0, null);
    gr.random = () => 0.5;
    const trace = (a, b) => this.g.grenades.trace(a, b);
    for (let t = 0, i = 0; i < 500; i++, t += 0.01) {
      const r = CR.updateGrenade(gr, t, 0.01, trace);
      if (r || gr.removed) break;
      if (type === 'smokegrenade' && gr.onGround && t > 1.6 && Math.hypot(...gr.velocity) < 5) break;
    }
    return gr.origin.slice();
  }
}

// ---------------------------------------------------------------------------
export class BotManager {
  constructor(game) {
    this.game = game;
    this.bots = [];
    this._difficulty = 'normal';
    this.usedNames = new Set();
    this.plan = { route: null };
    this.T = null;
    this.CT = null;
    this.econ = { T: 'full', CT: 'full' };
    this.awper = { T: null, CT: null };
    this.stats = { stuck: 0, errors: 0, nades: 0, radio: 0 };
    this.know = null;
    this.lastPlan = null;
    this.radioClock = { T: 0, CT: 0 };
    this.thinkClock = 0;
  }

  get difficulty() { return this._difficulty; }
  set difficulty(d) {
    this._difficulty = DIFFICULTY[d] ? d : 'normal';
    for (const b of this.bots) b.skill = DIFFICULTY[this._difficulty];
  }

  get time() { return this.game.time; }
  K() { return this.know || (this.know = new Knowledge(this.game)); }

  name() {
    const free = BOT_NAMES.filter((n) => !this.usedNames.has(n));
    const n = free.length ? pick(free) : 'Bot' + (this.bots.length + 1);
    this.usedNames.add(n);
    return n;
  }

  populate(opts) {
    this.bots = [];
    this.usedNames = new Set();
    this.difficulty = opts.difficulty || 'normal';
    this.opts = opts;
    this.awper = { T: null, CT: null };
  }

  // Fill teams up to the configured size (called after the human picks a team).
  fillTeams(perTeam) {
    const g = this.game;
    // zombie survival: perTeam bot teammates on the CT side, the zombies are no bots of ours
    if (g.zombies?.enabled) {
      let have = g.players.filter((p) => p.team === TEAM_CT && p.isBot).length;
      while (have < perTeam) { this.addBot(TEAM_CT); have++; }
      return;
    }
    for (const team of [TEAM_T, TEAM_CT]) {
      let have = g.players.filter((p) => p.team === team).length;
      while (have < perTeam) {
        this.addBot(team);
        have++;
      }
    }
  }

  addBot(team) {
    const g = this.game;
    const p = new Player({ name: this.name(), isBot: true });
    g.addPlayer(p);
    const bot = new Bot(this, p, DIFFICULTY[this.difficulty] || DIFFICULTY.normal);
    p.bot = bot;
    this.bots.push(bot);
    g.joinTeam(p, team, pick(team === TEAM_T ? PLAYER_SKINS.t : PLAYER_SKINS.ct));
    return p;
  }

  think(dt) {
    this.bots = this.bots.filter((b) => this.game.players.includes(b.p));
    for (const b of this.bots) {
      if (!b.p.alive) { b.p.cmd = null; continue; }
      try {
        b.update(dt);
      } catch (e) {
        this.stats.errors++;
        if (this.stats.errors <= 5) console.error('bot error', e);
        b.p.cmd = null;
      }
    }
    this.thinkClock -= dt;
    if (this.thinkClock <= 0) {
      this.thinkClock = 0.25;
      try { this.teamThink(); } catch (e) { this.stats.errors++; if (this.stats.errors <= 5) console.error('bot team error', e); }
    }
  }

  alive(team) { return this.bots.filter((b) => b.p.alive && b.p.team === team); }

  // Radio from a bot, rate limited per team so the HUD doesn't drown in chatter.
  radio(bot, text, { force = false, gap = 2.5 } = {}) {
    const k = teamKey(bot.p.team);
    if (!force && this.time < this.radioClock[k]) return false;
    if (!force && this.time < bot.radioCooldown) return false;
    this.radioClock[k] = this.time + gap;
    bot.radioCooldown = this.time + 8 + Math.random() * 8;
    this.stats.radio++;
    this.game.rounds.radio(bot.p, text);
    this.onRadio(bot.p, text, true);
    return true;
  }

  // ------------------------------------------------------------------ round flow
  onRoundStart() {
    this.K();
    const R = this.game.rounds;
    this.liveAt = R.freezeEnd ?? this.time;
    this.econ = { T: this.decideEconomy(TEAM_T), CT: this.decideEconomy(TEAM_CT) };
    this.chooseAwpers();
    for (const b of this.bots) b.roundStart();
    if (this.K().generic) { this.T = null; this.CT = null; planGeneric(this); return; }
    this.planT();
    this.planCT();
    this.dropsDone = false;
  }

  onRoundEnd(winner) {
    for (const b of this.bots) b.onRoundEnd(winner);
  }

  onBombPlanted(bomb) {
    const K = this.K();
    if (K.generic) return;
    const site = bomb.site === 'A' || bomb.site === 'B' ? bomb.site : (dist2(bomb.pos, K.sites.A.center) < dist2(bomb.pos, K.sites.B.center) ? 'A' : 'B');
    if (this.T) this.T.phase = 'planted';
    // Terrorists: post-plant spots, nearest bots take the nearest spots
    const ts = this.alive(TEAM_T);
    const spots = K.postPlant[site].slice();
    const order = ts.slice().sort((a, b) => dist2(a.p.pm.origin, bomb.pos) - dist2(b.p.pm.origin, bomb.pos));
    for (const b of order) {
      if (!spots.length) { b.postSpot = pick(K.postPlant[site]); continue; }
      let bi = 0, bd = Infinity;
      spots.forEach((s, i) => { const d = dist2(s.pos, b.p.pm.origin) + (s.agg ? 400 : 0); if (d < bd) { bd = d; bi = i; } });
      b.postSpot = spots.splice(bi, 1)[0];
    }
    // CTs: regroup and retake
    this.CT = this.CT || this.newCTState();
    this.CT.retake = { site, gather: K.retake[site].gather, go: false, start: this.time, defuser: null, bomb };
    for (const b of this.bots) b.onBombPlanted(bomb, site);
  }

  onDefuseStarted(p) {
    if (this.T) this.T.defuseAlert = this.time;
    for (const b of this.bots) if (b.p.team === TEAM_T && b.p.alive) b.hear(p.pm.origin, 1, 'defuse', p);
  }

  onNoise(src, pos, radius) {
    if (!src) return;
    const gun = radius > 1000;
    for (const b of this.bots) {
      if (!b.p.alive || b.p === src || src.team === b.p.team) continue;
      const d = Math.hypot(pos[0] - b.p.pm.origin[0], pos[1] - b.p.pm.origin[1], pos[2] - b.p.pm.origin[2]);
      if (d < radius * b.skill.hearing) b.hear(pos, 1 - d / radius, gun ? 'gun' : 'step', src);
    }
    // gunfire heard by the CT team is intel about where the Terrorists are
    if (gun && src.team === TEAM_T && this.CT && this.bots.some((b) => b.p.alive && b.p.team === TEAM_CT && dist3(b.p.pm.origin, pos) < 2200)) {
      this.intel(TEAM_CT, src, pos, 'gun');
    }
  }

  onHurt(victim, attacker) {
    victim.bot?.onHurt(attacker);
  }

  onDeath(victim, attacker) {
    for (const b of this.bots) {
      if (b.target === victim) b.loseTarget(true);
      if (b.p === victim) b.onDead();
      b.forget(victim);
    }
    // a teammate died here: intel for his team; a kill for the attackers
    if (victim.team === TEAM_CT || victim.team === TEAM_T) {
      this.intel(victim.team, attacker, victim.pm.origin, 'death');
      const killer = attacker?.bot;
      if (killer && attacker.team !== victim.team && Math.random() < 0.2) this.radio(killer, RADIO.down, { gap: 4 });
      if (victim.team === TEAM_CT && this.T) {
        const z = zoneOf(victim.pm.origin);
        if (z && (z[1] === 'A' || z[1] === 'B')) this.T.picks[z[1]] = (this.T.picks[z[1]] || 0) + 1;
      }
    }
  }

  onFlashed(p, dur) { if (p.bot) p.bot.flashed(dur); }

  // Radio from anybody (the human via the radio menu, or a bot).
  onRadio(p, text, fromBot = false) {
    if (!p || (p.team !== TEAM_T && p.team !== TEAM_CT)) return;
    const mates = this.bots.filter((b) => b.p.alive && b.p.team === p.team && b.p !== p);
    if (!mates.length) return;
    if (this.game.zombies?.enabled && !fromBot && zombieRadio(this, p, text, mates)) return; // zombie survival: the squad's orders (zorders.js)
    const near = (r) => mates.filter((b) => dist3(b.p.pm.origin, p.pm.origin) < r);
    const reply = (list, txt) => { const b = list.sort((a, c) => dist3(a.p.pm.origin, p.pm.origin) - dist3(c.p.pm.origin, p.pm.origin))[0]; if (b) b.queueRadio(txt, rand(0.6, 1.4)); };
    switch (text) {
      case RADIO.spotted: case RADIO.fire: case RADIO.backup:
        if (!fromBot) this.intel(p.team, null, p.pm.origin, 'call');
        if (text !== RADIO.spotted && !fromBot) for (const b of near(1400)) b.follow = { p, until: this.time + 12 };
        break;
      case RADIO.go: case RADIO.storm:
        if (!fromBot && p.team === TEAM_T) { this.tExecute('radio'); if (this.T) this.T.waitForGo = 0; reply(mates.slice(), RADIO.affirm); }
        break;
      case RADIO.follow: case RADIO.regroup: case RADIO.together: case RADIO.cover:
        if (!fromBot) {
          const list = text === RADIO.follow || text === RADIO.cover ? near(1200).slice(0, text === RADIO.cover ? 1 : 2) : mates;
          for (const b of list) b.follow = { p, until: this.time + (text === RADIO.cover ? 10 : 25) };
          reply(list.slice(), list.length ? RADIO.affirm : RADIO.negative);
        }
        break;
      case RADIO.hold:
        if (!fromBot) { const list = near(700); for (const b of list) b.holdHere = { pos: b.p.feet(), until: this.time + 20 }; reply(list.slice(), RADIO.affirm); }
        break;
      case RADIO.fallback:
        if (!fromBot) for (const b of mates) b.fallback = { until: this.time + 12 };
        break;
      case RADIO.wait:
        if (!fromBot && p.team === TEAM_T && this.T) { this.T.waitForGo = this.time + 45; reply(mates.slice(), RADIO.affirm); }
        break;
      case 'Report in, team.':
        if (!fromBot) mates.forEach((b, i) => b.queueRadio(b.reportText(), 0.8 + i * 1.1, true));
        break;
      default:
    }
  }

  // ------------------------------------------------------------------ intel
  // Something about the enemy (seen / heard / a teammate died) happened at pos.
  intel(team, enemy, pos, kind) {
    const z = zoneOf(pos);
    const site = z ? z[1] : null;
    if (team === TEAM_CT && this.CT) {
      const I = this.CT.intel;
      if (site === 'A' || site === 'B' || site === 'mid') {
        const s = I[site];
        if (kind === 'seen' && enemy) { s.seen.set(enemy, this.time); if (enemy.weapons?.[5]) s.carrier = this.time; }
        else if (kind === 'death') s.deaths.push(this.time);
        else if (kind === 'gun') s.guns.push(this.time);
        else if (kind === 'call') s.calls.push(this.time);
        s.last = this.time;
      }
    } else if (team === TEAM_T && this.T) {
      if (site === 'A' || site === 'B' || site === 'mid') {
        if (kind === 'seen' && enemy) this.T.ctSeen[site].set(enemy, this.time);
        this.T.contact[site] = this.time;
        if (kind === 'death') this.T.losses[site] = (this.T.losses[site] || 0) + 1;
      }
    }
  }

  // ------------------------------------------------------------------ economy
  decideEconomy(team) {
    const g = this.game, R = g.rounds;
    const ps = g.players.filter((p) => p.team === team);
    if (!ps.length || g.zombies?.enabled) return 'full';
    if (R.roundNumber <= 1) return 'pistol';
    const T = team === TEAM_T;
    const full = T ? 3800 : 4300;
    const ready = ps.filter((p) => (p.alive && p.weapons[1] && p.money >= 650) || p.money >= full).length;
    if (ready >= Math.ceil(ps.length * 0.6)) return 'full';
    const avg = ps.reduce((s, p) => s + p.money, 0) / ps.length;
    const losses = T ? R.eco?.consecutiveTLoses ?? 0 : R.eco?.consecutiveCTLoses ?? 0;
    const nextBonus = Math.min(3400, 1400 + 500 * losses);
    if (avg + nextBonus >= full + 400 && avg < full - 300) return 'eco';
    if (avg >= 2200) return 'force';
    return 'eco';
  }

  chooseAwpers() {
    for (const team of [TEAM_T, TEAM_CT]) {
      const k = teamKey(team);
      const cur = this.awper[k];
      if (cur && this.bots.includes(cur) && cur.p.team === team) continue;
      const list = this.bots.filter((b) => b.p.team === team);
      this.awper[k] = list.length >= 3 ? pick(list) : null;
    }
  }

  // Rich bots buy a rifle for teammates who can't afford one (thrown at their feet).
  teamDrops(team) {
    const g = this.game, R = g.rounds;
    if (this.econ[teamKey(team)] !== 'full' || !R.freeze) return;
    const T = team === TEAM_T;
    const rifle = T ? 'ak47' : 'm4a1', price = WS.WEAPON_DEFS[rifle].price;
    const poor = this.bots.filter((b) => b.p.alive && b.p.team === team && !b.p.weapons[1] && g.inBuyZone(b.p));
    for (const b of poor) {
      const rich = this.bots.filter((r) => r !== b && r.p.alive && r.p.team === team && r.p.weapons[1] && r.p.money >= price + 1500 && g.inBuyZone(r.p))
        .sort((x, y) => y.p.money - x.p.money)[0];
      if (!rich || Math.random() < 0.25) continue;
      const own = rich.p.weapons[1];
      if (isSniper(own)) continue;
      // throw the current primary to the teammate and buy another one
      const from = rich.p.eyePos();
      from[2] -= 12;
      const to = b.p.feet();
      const t = 0.6;
      const vel = [(to[0] - from[0]) / t, (to[1] - from[1]) / t, (to[2] + 8 - from[2] + 0.5 * 800 * t * t) / t];
      g.dropWeapon(rich.p, own, false, vel);
      R.buy(rich.p, rifle);
      for (let i = 0; i < 3; i++) R.buy(rich.p, 'primammo');
      this.stats.drops = (this.stats.drops || 0) + 1;
      this.radio(rich, 'Here, take this.', { gap: 1 });
    }
  }

  // ------------------------------------------------------------------ T team
  newTState() {
    return {
      plan: null, site: 'A', groups: [], phase: 'setup', executeAt: Infinity, executed: 0, utilUsed: new Set(), utilClaim: new Map(),
      contact: { A: -99, B: -99, mid: -99 }, ctSeen: { A: new Map(), B: new Map(), mid: new Map() }, picks: {}, losses: {},
      defaultCall: Infinity, fakeDone: 0, defuseAlert: -99, waitForGo: 0,
    };
  }

  planT() {
    const K = this.K();
    const T = this.T = this.newTState();
    const ts = this.alive(TEAM_T);
    T.size = ts.length;
    if (!ts.length) return;
    const eco = this.econ.T === 'eco';
    const plans = T_PLANS.filter((p) => p !== this.lastPlan);
    const plan = weightedPick(plans, (p) => p.weight * (eco && p.rush ? 2.5 : 1) * (ts.length <= 2 && !p.rush && !p.default ? 0.5 : 1));
    this.lastPlan = plan;
    T.plan = plan;
    this.plan = { route: plan.groups?.[0] ? K.routes[plan.groups[0].route] : null, name: plan.name };
    if (plan.default) {
      T.site = null;
      T.defaultCall = this.liveAt + rand(18, 32);
      const spots = shuffle(K.control.slice());
      // spread over the map-control spots (long doors, catwalk, top mid, tunnels)
      ts.forEach((b, i) => { b.tTask = { kind: 'control', spot: spots[i % spots.length] }; });
      return;
    }
    T.site = plan.site;
    T.executeAt = this.liveAt + (plan.rush ? 22 : rand(40, 60));
    T.patience = plan.rush ? 0 : rand(1, 12);
    this.assignGroups(plan.groups, ts);
  }

  assignGroups(specs, ts) {
    const K = this.K(), T = this.T;
    const carrier = ts.find((b) => b.p.weapons[5]);
    let pool = shuffle(ts.slice());
    const groups = [];
    // fixed-size roles first (lurk / fake) - never the bomb carrier, only with 3+ players
    for (const s of specs.filter((s) => s.role)) {
      if (pool.length < 3) continue;
      const cand = pool.filter((b) => b !== carrier);
      const take = cand.slice(0, s.n || 1);
      pool = pool.filter((b) => !take.includes(b));
      groups.push({ route: K.routes[s.route], role: s.role, members: take, arrived: new Map(), firstArrive: 0 });
    }
    const mains = specs.filter((s) => !s.role);
    const total = mains.reduce((s, g) => s + g.share, 0);
    let left = pool.length;
    const mainGroups = mains.map((s, i) => {
      const n = i === mains.length - 1 ? left : Math.max(1, Math.round(pool.length * s.share / total));
      const c = Math.min(left, n);
      left -= c;
      return { spec: s, n: c };
    }).filter((x) => x.n > 0);
    // the carrier goes with the biggest main group
    if (carrier && pool.includes(carrier)) {
      pool = [carrier, ...pool.filter((b) => b !== carrier)];
      mainGroups.sort((a, b) => b.n - a.n);
    }
    for (const mg of mainGroups) {
      const take = pool.splice(0, mg.n);
      groups.push({ route: K.routes[mg.spec.route], role: 'main', members: take, arrived: new Map(), firstArrive: 0 });
    }
    T.groups = groups;
    for (const gr of groups) {
      gr.members.forEach((b, i) => {
        b.tTask = { kind: gr.role === 'main' ? 'route' : gr.role, group: gr, slot: i };
        b.routeIdx = b.nearestRouteIdx(gr.route);
      });
    }
  }

  // Default plan: the team calls a site after gathering information.
  callSite() {
    const T = this.T, K = this.K();
    const now = this.time;
    const score = (s) => {
      let v = Math.random() * 1.5;
      v += (T.picks[s] || 0) * 2.5;
      for (const t of T.ctSeen[s].values()) if (now - t < 20) v -= 1;
      v -= (T.losses[s] || 0) * 1.5;
      return v;
    };
    const site = score('A') >= score('B') ? 'A' : 'B';
    T.site = site;
    T.plan = { ...T.plan, called: site };
    const routes = Object.values(K.routes).filter((r) => r.site === site && r.name !== 'midDoors');
    const ts = this.alive(TEAM_T);
    const groups = new Map();
    for (const b of ts) {
      // nearest route (by distance to the route's gather point)
      let best = null, bd = Infinity;
      for (const r of routes) { const d = dist2(b.p.pm.origin, r.pts[r.gather].p); if (d < bd) { bd = d; best = r; } }
      if (!groups.has(best)) groups.set(best, { route: best, role: 'main', members: [], arrived: new Map(), firstArrive: 0 });
      groups.get(best).members.push(b);
    }
    T.groups = [...groups.values()];
    for (const gr of T.groups) {
      gr.members.forEach((b, i) => {
        b.tTask = { kind: 'route', group: gr, slot: i };
        b.routeIdx = b.nearestRouteIdx(gr.route);
        b.pastGather = b.routeIdx > gr.route.gather;
      });
    }
    T.executeAt = now + 16;
    const speaker = ts[0];
    if (speaker) this.radio(speaker, site === 'A' ? 'Go A!' : 'Go B!', { force: true });
  }

  tExecute(reason) {
    const T = this.T;
    if (!T || T.phase !== 'setup') return;
    if (T.plan?.default && !T.plan.called) this.callSite();
    T.phase = 'execute';
    T.executed = this.time;
    T.executeReason = reason;
    const lead = T.groups.find((g) => g.role === 'main')?.members.find((b) => b.p.alive);
    if (lead && reason !== 'contact') this.radio(lead, T.plan?.rush ? RADIO.go : pick([RADIO.go, RADIO.storm, RADIO.go]), { force: true });
  }

  teamThinkT() {
    const T = this.T, R = this.game.rounds, now = this.time;
    if (!T || R.state !== 'live') return;
    if (R.bomb) { T.phase = 'planted'; return; }
    const timeLeft = R.timeLeft();
    if (T.phase !== 'setup') {
      return;
    }
    if (T.waitForGo > now) return;
    if (T.plan?.default && !T.plan.called) {
      const picked = T.picks.A || T.picks.B;
      if (now >= T.defaultCall || picked || timeLeft < 55) this.callSite();
      return;
    }
    // groups at their gather points?
    let ready = true, anyContact = false;
    for (const gr of T.groups) {
      const alive = gr.members.filter((b) => b.p.alive);
      if (gr.role === 'lurk') continue;
      if (gr.role === 'fake') { if (alive.length && !T.fakeDone) ready = false; continue; }
      if (!alive.length) continue;
      const at = alive.filter((b) => b.atGather);
      if (at.length && !gr.firstArrive) gr.firstArrive = now;
      const waited = gr.firstArrive ? now - gr.firstArrive : 0;
      const need = T.plan?.rush ? Math.ceil(alive.length * 0.6) : alive.length;
      if (at.length >= need && !gr.allAt) gr.allAt = now;
      if (at.length < need) gr.allAt = 0;
      const patient = gr.allAt && now - gr.allAt >= (T.patience || 0);
      if (!(patient || waited > (T.plan?.rush ? 3 : 14 + (T.patience || 0)))) ready = false;
      if (alive.some((b) => b.target && b.targetVisible)) anyContact = true;
    }
    if (T.fakeDone && now - T.fakeDone < 5) ready = false; // let the fake pull rotations
    if (ready || anyContact || now >= T.executeAt || timeLeft < 45) this.tExecute(anyContact ? 'contact' : ready ? 'ready' : 'time');
  }

  // ------------------------------------------------------------------ CT team
  newCTState() {
    const mk = () => ({ seen: new Map(), deaths: [], guns: [], calls: [], carrier: -99, last: -99 });
    return { roles: [], intel: { A: mk(), B: mk(), mid: mk() }, rotateTo: null, rotateAt: -99, retake: null, used: new Set(), regroup: null, fellBack: {} };
  }

  planCT() {
    const K = this.K(), g = this.game;
    const C = this.CT = this.newCTState();
    const cts = this.alive(TEAM_CT);
    C.size = cts.length;
    if (!cts.length) return;
    const total = g.players.filter((p) => p.team === TEAM_CT && p.alive).length;
    const n = clamp(total, 1, 5);
    let roles = weightedPick(CT_SETUPS[n], (s) => s[1])[0].slice();
    while (roles.length < total) roles.push(pick(['B', 'siteA', 'mid', 'longA']));
    roles = shuffle(roles);
    // humans take a role too; bots get the rest (the AWPer prefers an AWP role)
    const awp = cts.find((b) => isSniper(b.p.weapons[1]));
    const order = awp ? [awp, ...cts.filter((b) => b !== awp)] : cts;
    for (const b of order) {
      let i = 0;
      if (b === awp) { const k = roles.findIndex((r) => K.holds[r].some((h) => h.awp)); i = k >= 0 ? k : 0; }
      const role = roles.splice(i, 1)[0] || pick(['B', 'siteA', 'mid', 'longA']);
      b.ctRole = role;
      b.ctHold = this.pickHold(role, b === awp);
      b.rotating = false;
    }
    C.roles = cts.map((b) => b.ctRole);
  }

  pickHold(role, awp, list = null) {
    const K = this.K(), C = this.CT;
    const all = list || K.holds[role] || K.holds.mid;
    let cand = all.filter((h) => !C.used.has(h.n));
    if (!cand.length) cand = all;
    // AWPers take the long angles; riflemen mostly hold closer ones
    const h = weightedPick(cand, (h) => (awp ? (h.awp ? 4 : 0.3) : h.long ? 0.3 : 1) * (h.agg ? 0.35 : 1));
    C.used.add(h.n);
    return h;
  }

  ctRotate(site, reason) {
    const C = this.CT, K = this.K();
    if (!C || C.rotateTo === site || C.retake) return;
    C.rotateTo = site;
    C.rotateAt = this.time;
    const cts = this.alive(TEAM_CT);
    const holder = cts.find((b) => ROLE_SITE[b.ctRole] === site);
    const others = cts.filter((b) => ROLE_SITE[b.ctRole] !== site);
    // keep one anchor on the other site when it has two players
    const away = others.filter((b) => ROLE_SITE[b.ctRole] !== 'mid');
    const anchor = away.length >= 2 && Math.random() < 0.7 ? pick(away) : null;
    C.used = new Set(cts.filter((b) => ROLE_SITE[b.ctRole] === site || b === anchor).map((b) => b.ctHold?.n));
    let caller = null;
    for (const b of others) {
      if (b === anchor) continue;
      b.rotating = true;
      b.ctRole = site === 'A' ? 'siteA' : 'B';
      b.ctHold = this.pickHold(null, isSniper(b.p.weapons[1]), K.rotate[site]);
      b.inPosition = false;
      caller = caller || b;
    }
    // when the site is being given up, rotators meet outside it and go in together
    C.regroup = reason === 'fallback' ? { site, pos: K.retake[site].gather, start: this.time, go: false } : null;
    if (holder && reason !== 'call') this.radio(holder, Math.random() < 0.5 ? RADIO.backup : RADIO.spotted, { force: true });
    else if (caller) this.radio(caller, RADIO.affirm);
  }

  teamThinkCT() {
    const C = this.CT, R = this.game.rounds, now = this.time;
    if (!C || R.state !== 'live') return;
    if (C.retake) { this.thinkRetake(); return; }
    // rotation from intel
    let best = null, bestScore = 0;
    for (const site of ['A', 'B']) {
      const I = C.intel[site];
      let s = 0;
      for (const t of I.seen.values()) if (now - t < 7) s += 1;
      if (now - I.carrier < 8) s += 2;
      s += I.deaths.filter((t) => now - t < 10).length * 1.5;
      s += Math.min(2.5, I.guns.filter((t) => now - t < 4).length * 0.35);
      s += I.calls.filter((t) => now - t < 6).length * 2.5;
      if (s > bestScore) { bestScore = s; best = site; }
    }
    if (best && bestScore >= 2.4 && C.rotateTo !== best && now - C.rotateAt > 6) this.ctRotate(best, 'intel');
    // a lone anchor sometimes falls back (to retake with the rotators) when he
    // sees four or more Terrorists coming
    for (const site of ['A', 'B']) {
      if (C.fellBack[site]) continue;
      let n = 0;
      for (const t of C.intel[site].seen.values()) if (now - t < 8) n++;
      if (n < 4) continue;
      const mine = this.alive(TEAM_CT).filter((b) => ROLE_SITE[b.ctRole] === site && !b.rotating);
      C.fellBack[site] = now;
      if (mine.length !== 1 || Math.random() < 0.5) continue;
      const K = this.K();
      mine.forEach((b, i) => { b.ctFallback = { pos: K.fallback[site][i % K.fallback[site].length], until: now + 25 }; b.inPosition = false; });
      this.radio(mine[0], RADIO.fallback, { force: true });
      if (C.rotateTo !== site) this.ctRotate(site, 'fallback');
    }
    // regrouped rotators go in together
    const rg = C.regroup;
    if (rg && !rg.go) {
      const rot = this.alive(TEAM_CT).filter((b) => b.rotating);
      const there = rot.filter((b) => dist2(b.p.pm.origin, rg.pos) < 450).length;
      if (!rot.length || there >= rot.length || (there >= 2 && now - rg.start > 6) || now - rg.start > 14) rg.go = true;
    }
  }

  thinkRetake() {
    const C = this.CT, R = this.game.rounds, now = this.time;
    const rt = C.retake;
    const bomb = R.bomb;
    if (!bomb || bomb.defused || bomb.exploded) return;
    const cts = this.alive(TEAM_CT);
    if (!cts.length) return;
    const left = bomb.explodeTime - now;
    // defuser: kit first, then the nearest
    if (!rt.defuser || !rt.defuser.p.alive) {
      const kit = cts.filter((b) => b.p.defuser);
      const pool = kit.length && left > 6 ? kit : cts;
      rt.defuser = pool.sort((a, b) => dist2(a.p.pm.origin, bomb.pos) - dist2(b.p.pm.origin, bomb.pos))[0];
    }
    if (!rt.go) {
      const ready = cts.filter((b) => dist2(b.p.pm.origin, rt.gather) < 500 || dist2(b.p.pm.origin, bomb.pos) < 1000).length;
      const kitTime = cts.some((b) => b.p.defuser) ? 5 : 10;
      const tAlive = this.game.players.filter((p) => p.team === TEAM_T && p.alive).length;
      if (ready >= cts.length || (ready >= 2 && ready > tAlive) || now - rt.start > 9 || left < kitTime + 16) {
        rt.go = true;
        const lead = cts.find((b) => dist2(b.p.pm.origin, rt.gather) < 600) || cts[0];
        this.radio(lead, cts.length > 1 ? pick([RADIO.go, RADIO.together, RADIO.storm]) : RADIO.go, { force: true });
      }
    }
  }

  teamThink() {
    const R = this.game.rounds;
    if (R.freeze && !this.dropsDone && R.freezeEnd - this.time < 1.2 && (R.freezeTime || 0) > 2.5) {
      this.dropsDone = true;
      this.teamDrops(TEAM_T);
      this.teamDrops(TEAM_CT);
    }
    if (this.K().generic) {
      // bots that joined during the freeze get their tasks too
      if (R.freeze && this.bots.some((b) => b.p.alive && b.gTask === undefined)) planGeneric(this);
      return;
    }
    if (!this.T || (R.freeze && this.alive(TEAM_T).length !== this.T.size)) this.planT();
    if (!this.CT || (R.freeze && this.alive(TEAM_CT).length !== this.CT.size)) this.planCT();
    this.teamThinkT();
    this.teamThinkCT();
  }
}

// ---------------------------------------------------------------------------
class Bot {
  constructor(mgr, p, skill) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.p = p;
    this.skill = skill;
    this.scanClock = Math.random() * 0.1;
    this.lookClock = 0;
    this.radioCooldown = 0;
    this.pendingRadio = [];
    this.memory = new Map();
    this.blindUntil = 0;
    this.noise = [0, 0];
    this.noiseCur = [0, 0];
    this.noiseT = 0;
    this.roundStart();
  }

  get time() { return this.game.time; }
  get K() { return this.mgr.K(); }

  roundStart() {
    this.target = null;
    this.targetVisible = false;
    this.targetSeen = -99;
    this.lastKnown = null;
    this.lastKnownT = -99;
    this.lastKnownEnemy = null;
    this.memory.clear();
    this.heard = null;
    this.path = null;
    this.goal = null;
    this.buyDone = false;
    this.buyAt = this.time + 0.2 + Math.random() * 0.9;
    this.tTask = null;
    this.ctRole = null;
    this.ctHold = null;
    this.ctFallback = null;
    this.rotating = false;
    this.postSpot = null;
    this.routeIdx = 0;
    this.atGather = false;
    this.pastGather = false;
    this.saidPos = false;
    this.saidClear = false;
    this.saidBlow = false;
    this.saidBomb = false;
    this.flashedSite = false;
    this.siteSpot = null;
    this.siteLatch = null;
    this.utilJob = null;
    this.utilThrown = false;
    this.plantSpot = null;
    this.plantProg = null;
    this.zoneName = null;
    this.c4Prog = null;
    this.c4Direct = null;
    this.wayClear = null;
    this.nearEnough = null;
    this.coverSpot = null;
    this.coverPos = null;
    this.inPositionSince = 0;
    this.investigate = null;
    this.investigator = Math.random() < this.skill.aggression * 0.5;
    this.nade = null;
    this.nadeClock = this.time + 4;
    this.follow = null;
    this.pickupTry = null;
    this.skipPickup = new Set();
    this.holdHere = null;
    this.fallback = null;
    this.cleared = new Map();
    this.watchIdx = 0;
    this.watchClock = 0;
    this.inPosition = false;
    this.progT = this.time;
    this.progPos = null;
    this.stuckLevel = 0;
    this.badNodes = new Map();
    this.wander = null;
    this.nearEnough = null;
    this.stuckGrace = 0;
    this.replanBelow = 0;
    this.lastStuckJump = -9;
    this.yieldUntil = -9;
    this.navMoving = false;
    this.sideStep = 0;
    this.jumpHold = 0;
    this.prevJump = false;
    this.planting = false;
    this.fight = null;
    this.retreatTo = null;
    this.searchUntil = 0;
    this.burst = 0;
    this.nextFire = 0;
    this.tapRelease = false;
    this.zoomClock = 0;
    this.scopedAt = 0;
    this.mode = 'idle';
    this.blindUntil = 0;
    this.avoidFlash = null;
    this.dodged = null;
    this.fakeStage = 0;
    this.pendingRadio = [];
  }

  onRoundEnd() { this.nade = null; this.heal = null; }
  onDead() { this.target = null; this.path = null; this.nade = null; this.heal = null; }
  onBombPlanted() { this.path = null; this.goal = null; this.inPosition = false; }

  onHurt(attacker) {
    if (!attacker || attacker.team === this.p.team) return;
    const pos = attacker.eyePos();
    if (!this.target || !this.targetVisible) this.hear(pos, 1, 'hurt', attacker);
    this.lastKnown = attacker.feet();
    this.lastKnownT = this.time;
    this.lastKnownEnemy = attacker;
    if (this.p.health < 45 && Math.random() < 0.35) this.mgr.radio(this, Math.random() < 0.5 ? RADIO.fire : RADIO.backup);
  }

  hear(pos, strength, kind, src) {
    const h = this.heard;
    if (h && this.time - h.t < 0.4 && h.strength > strength + 0.2) return;
    this.heard = { pos: pos.slice(), t: this.time, strength, kind, src };
  }

  flashed(dur) {
    this.blindUntil = Math.max(this.blindUntil, this.time + dur);
    if (Math.random() < 0.4) this.mgr.radio(this, RADIO.fire);
  }

  forget(p) { this.memory.delete(p); if (this.lastKnownEnemy === p) { this.lastKnown = null; this.lastKnownEnemy = null; } }

  loseTarget(dead = false) {
    if (dead && this.target) { this.lastKnown = null; this.lastKnownEnemy = null; }
    this.target = null;
    this.targetVisible = false;
    this.burst = 0;
    this.fight = null;
  }

  queueRadio(text, delay, force = false) { this.pendingRadio.push({ text, at: this.time + delay, force }); }

  reportText() {
    if (this.time - this.targetSeen < 4) return RADIO.spotted;
    if (this.inPosition) return RADIO.clear;
    return RADIO.reporting;
  }

  // ------------------------------------------------------------------ buying
  buy() {
    const g = this.game, p = this.p, R = g.rounds;
    if (g.zombies?.enabled) { g.zombies.economy.botBuy(this); return; } // zombie survival: on a budget, in the breaks (zeconomy.js)
    if (!g.inBuyZone(p) || !R.buyTimeLeft()) return;
    const T = p.team === TEAM_T;
    const mode = this.mgr.econ[teamKey(p.team)] || 'full';
    const b = (id) => R.buy(p, id);
    const price = (id) => WS.WEAPON_DEFS[id]?.price ?? 0;
    const full = T ? 3800 : 4300;
    const rifle = T ? 'ak47' : 'm4a1';
    const awper = this.mgr.awper[teamKey(p.team)] === this;
    const teamHasAwp = g.players.some((q) => q !== p && q.team === p.team && q.weapons[1]?.id === 'awp');
    const armor = () => { if (p.money >= 1000 && (p.armor < 100 || !p.helmet)) b('vesthelm'); else if (p.money >= 650 && p.armor < 60) b('vest'); };
    const nades = (budget) => {
      const want = [];
      if (Math.random() < 0.75) want.push('flashbang');
      if (Math.random() < (T ? 0.6 : 0.45)) want.push('smokegrenade');
      if (Math.random() < 0.65) want.push('hegrenade');
      if (Math.random() < 0.3) want.push('flashbang');
      for (const n of want) if (p.money - price(n) >= budget) b(n);
    };
    let prim = p.weapons[1];
    if (mode === 'pistol') {
      const r = Math.random();
      if (T) {
        if (r < 0.55) b('vest');
        else if (r < 0.75) { b('deagle'); b('secammo'); }
        else { b('hegrenade'); b('flashbang'); b('flashbang'); }
      } else {
        if (r < 0.45) b('vest');
        else if (r < 0.7) { b('defuser'); b('flashbang'); b('hegrenade'); }
        else { b('deagle'); b('secammo'); }
      }
    } else {
      const rich = p.money >= full + 1200;
      const m = rich ? 'full' : mode;
      if (m === 'full') {
        if (!prim) {
          if ((awper || p.money > 9000) && !teamHasAwp && p.money >= price('awp') + 1650 && Math.random() < 0.8) b('awp');
          else if (p.money >= price(rifle) + 650) b(rifle);
          else if (p.money >= price(T ? 'galil' : 'famas') + 650) b(T ? 'galil' : 'famas');
          else if (p.money >= 1500 + 650) b(T ? 'mac10' : 'mp5');
        }
        armor();
        if (!T && !p.defuser && p.money >= 200 && Math.random() < 0.85) b('defuser');
        nades(0);
      } else if (m === 'force') {
        if (!prim) {
          if (p.money >= price(T ? 'galil' : 'famas') + 650) b(T ? 'galil' : 'famas');
          else if (p.money >= (T ? 1400 : 1500) + 650) b(T ? 'mac10' : 'mp5');
          else if (p.money >= 1250 + 650 && !T) b('tmp');
          else if (p.money >= 650 + 650 && !p.weapons[2]?.id?.match(/deagle/)) { b('deagle'); }
        }
        armor();
        if (!T && !p.defuser && p.money >= 400 && Math.random() < 0.4) b('defuser');
        if (p.money >= 400) nades(200);
      } else { // eco: save, maybe a cheap upgrade
        if (!prim && p.money >= 1700 && Math.random() < 0.3) { b(Math.random() < 0.5 ? 'deagle' : (T ? 'p228' : 'fiveseven')); }
        if (p.weapons[1] && p.armor < 50 && p.money >= 650) b('vest');
      }
    }
    prim = p.weapons[1];
    if (prim) for (let i = 0; i < 4; i++) if (!b('primammo')) break;
    for (let i = 0; i < 2; i++) if (!b('secammo')) break;
    const best = p.weapons[1] || p.weapons[2];
    if (best && p.active !== best) g.selectWeapon(p, best);
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    const g = this.game, p = this.p, R = g.rounds;
    const cmd = p.cmd || (p.cmd = { forwardmove: 0, sidemove: 0, upmove: 0, buttons: 0, wbuttons: 0 });
    cmd.forwardmove = 0; cmd.sidemove = 0; cmd.upmove = 0; cmd.buttons = 0; cmd.wbuttons = 0;
    this.dt = dt;
    if (R.freeze) {
      if (!this.buyDone && this.time >= this.buyAt) { this.buy(); this.buyDone = true; }
      this.freezeLook(dt);
      return;
    }
    if (!this.buyDone) { this.buy(); this.buyDone = true; }
    if (this.pendingRadio.length && this.time >= this.pendingRadio[0].at) {
      const r = this.pendingRadio.shift();
      this.mgr.radio(this, r.text, { force: r.force, gap: 0.8 });
    }

    this.countShots();
    this.scanClock -= dt;
    if (this.scanClock <= 0) { this.scanClock = 0.1; this.scan(); this.watchFlashes(); }
    if (this.target && !this.targetVisible && this.time - this.targetSeen > 1.0) this.loseTarget();

    const it = this.it || (this.it = {});
    it.move = null; it.walk = false; it.duck = false; it.look = null; it.lookAngles = null; it.fire = false; it.use = false;
    it.stop = false; it.strafe = 0; it.jump = false; it.combat = false; it.tol = 32; it.zoom = 0; it.attack = false; it.attack2 = false; it.final = false;

    const blind = this.time < this.blindUntil;
    const fighting = this.target && !blind && (this.targetVisible || this.time - this.targetSeen < 0.6);
    // defusing: keep at it when it's nearly done or there's no time to fight first
    const bomb = R.bomb;
    let keepDefuse = false;
    if (p.defusing && bomb && bomb.defuser === p) {
      const remain = bomb.defuseEnd - this.time, left = bomb.explodeTime - this.time;
      keepDefuse = !fighting || remain < 2 || left < remain + 2.5;
    }
    // planting: finish it when the C4 is nearly armed
    const c4 = p.weapons[5];
    const keepPlant = this.planting && c4 && c4.startedArming && c4.armedTime - this.time < 1.2;
    if (this.nade && fighting && this.nade.phase !== 'pull') this.nade = null;
    if (g.zombies?.enabled && !this.revive && !this.heal && !this.nade) this.considerRevive(fighting); // a teammate down (zdowned.js)
    if (g.zombies?.enabled && !this.heal && !this.nade) this.considerHeal(fighting);
    if (keepPlant) {
      this.mode = 'plant';
      it.attack = true; it.duck = true; it.stop = true;
    } else if (keepDefuse) {
      this.mode = 'defuse';
      it.use = true; it.duck = true; it.stop = true;
      it.look = [bomb.pos[0], bomb.pos[1], bomb.pos[2]];
    } else if (this.revive) this.runRevive(it, fighting);
    else if (this.heal) this.runHeal(it);
    else if (this.nade) this.runGrenade(it);
    else if (fighting) this.combat(it);
    else {
      this.mode = 'task';
      this.objective(it);
      this.searchAndListen(it);
    }
    if (blind) this.blinded(it);
    if (this.avoidFlash && this.time < this.avoidFlash.until) { it.lookAngles = [10, this.avoidFlash.yaw]; it.look = null; it.fire = false; it.combat = false; }

    if (g.zombies?.enabled) this.dodgeGoo(it);
    this.manageWeapon(cmd, it);
    // movement
    if (it.move && !p.planting && !p.defusing) this.navigate(it.move, cmd, it);
    else { this.navMoving = false; this.trackStuck(false); if (it.stop || this.p.pm.onground) this.counterStrafe(cmd, it.stop ? 1 : 0.6); }
    if (it.strafe) this.applyStrafe(cmd, it.strafe);
    // aim & shoot
    this.aim(it, dt);
    if (it.fire) this.fire(cmd, it);
    if (it.attack) cmd.wbuttons |= BTN_ATTACK;
    if (it.attack2) cmd.wbuttons |= BTN_ATTACK2;
    if (it.use) cmd.wbuttons |= BTN_USE;
    if (it.duck) cmd.buttons |= IN_DUCK;
    if (it.walk && !it.duck) cmd.buttons |= IN_WALK;
    // jumps: one-tick presses (no pogo), crouch while airborne (crouch-jump)
    if (it.jump && !this.prevJump && p.pm.onground) { cmd.buttons |= IN_JUMP; this.jumpHold = this.time + 0.55; }
    this.prevJump = !!(cmd.buttons & IN_JUMP);
    if (this.time < this.jumpHold && !p.pm.onground) cmd.buttons |= IN_DUCK;
  }

  freezeLook(dt) {
    const p = this.p;
    const pts = this.tTask?.group?.route?.pts;
    const tgt = pts ? pts[Math.min(pts.length - 1, 1)].p : this.ctHold?.pos;
    if (tgt) {
      const [, yaw] = angleTo(p.pm.origin, tgt);
      const d = angDiff(yaw, p.pm.angles[1]);
      p.pm.angles[1] += clamp(d, -90 * dt, 90 * dt);
      p.pm.angles[0] += (0 - p.pm.angles[0]) * Math.min(1, dt * 3);
    } else p.pm.angles[1] += Math.sin(this.time * 0.7 + p.id) * dt * 20;
  }

  // ------------------------------------------------------------------ perception
  los(a, b) {
    const g = this.game;
    g.collision.trace(a, b, ZERO, ZERO, MASK_SHOT, tr);
    if (tr.fraction < 1) return false;
    return !g.grenades.blocksVision(a, b);
  }

  // head / chest points of a player (from the hitbox layout: head 60..72 above the feet)
  bodyPoints(e) {
    if (e.model?.crawl) return this.game.zombies.roster.bodyPoints(e); // (a crawler: knee height, zroster.js)
    const o = e.pm.origin, duck = e.pm.ducking;
    const feet = o[2] + (duck ? -18 : -36);
    const fwd = e.pm.angles[1] * DEG;
    const hx = o[0] + Math.cos(fwd) * 2, hy = o[1] + Math.sin(fwd) * 2;
    return { head: [hx, hy, feet + (duck ? 44 : 65)], chest: [o[0], o[1], feet + (duck ? 28 : 46)], belly: [o[0], o[1], feet + (duck ? 20 : 36)] };
  }

  scan() {
    const g = this.game, p = this.p;
    if (this.time < this.blindUntil) { this.targetVisible = false; return; }
    const eye = p.eyePos(_eye);
    angleVectors(p.pm.angles[0], p.pm.angles[1], _f, null, null);
    let best = null, bestScore = Infinity, bestParts = null;
    for (const e of g.players) {
      if (!e.alive || e.team === p.team || (e.team !== TEAM_T && e.team !== TEAM_CT)) continue;
      const ee = e.eyePos(_ee);
      const dx = ee[0] - eye[0], dy = ee[1] - eye[1], dz = ee[2] - eye[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > 4200) continue;
      const cos = (dx * _f[0] + dy * _f[1] + dz * _f[2]) / (d || 1);
      const known = e === this.target && this.time - this.targetSeen < 2;
      // ~140° field of view; anything very close is noticed
      if (cos < (known ? -0.3 : d < 220 ? -0.6 : 0.34)) continue;
      const parts = this.bodyPoints(e);
      const vh = this.los(eye, parts.head);
      const vc = this.los(eye, parts.chest);
      const vb = !vh && !vc && d < 1500 && this.los(eye, parts.belly);
      if (!vh && !vc && !vb) continue;
      // far, barely visible targets are noticed less reliably
      if (!known && d > 2600 && !(vh && vc) && Math.random() < 0.5) continue;
      const m = this.memory.get(e);
      if (!m || this.time - m.t > 3) this.mgr.intel(p.team, e, e.pm.origin, 'seen');
      this.memory.set(e, { t: this.time, pos: e.feet(), first: m && this.time - m.t < 3 ? m.first : this.time });
      const aimingAtMe = this.aimedAtBy(e, eye);
      let score = d * (known ? 0.55 : 1) * (aimingAtMe ? 0.6 : 1) * (e.weapons[5] || e.defusing || e.planting ? 0.7 : 1) * (e.target?.downed ? 0.5 : 1); // (zombie survival: the ones on a downed teammate first)
      if (e.isZombie && g.zombies?.enabled) score *= g.zombies.squad.targetWeight(this, e, d); // (zombie survival: a Focus order, the roles - zsquad.js)
      if (score < bestScore) { bestScore = score; best = e; bestParts = { vh, vc, vb, cos, d }; }
    }
    if (best) {
      if (best !== this.target) this.acquire(best, bestParts);
      this.targetVisible = true;
      this.targetSeen = this.time;
      this.visHead = bestParts.vh;
      this.visChest = bestParts.vc;
      this.visBelly = bestParts.vb;
      this.lastKnown = best.feet();
      this.lastKnownT = this.time;
      this.lastKnownEnemy = best;
    } else this.targetVisible = false;
  }

  // A flashbang in view that is about to pop: turn away (always for a teammate's,
  // by skill for an enemy's).
  watchFlashes() {
    const g = this.game, p = this.p;
    if (this.avoidFlash && this.time < this.avoidFlash.until) return;
    this.avoidFlash = null;
    const eye = p.eyePos(_eye);
    angleVectors(p.pm.angles[0], p.pm.angles[1], _f, null, null);
    for (const n of g.grenades.list) {
      if (n.type !== 'flashbang' || n.removed || n.detonated || this.dodged?.has(n)) continue;
      const left = n.dmgtime + 0.1 - this.time;
      if (left > 0.9 || left < -0.2) continue;
      const dx = n.origin[0] - eye[0], dy = n.origin[1] - eye[1], dz = n.origin[2] - eye[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > 1500 || (dx * _f[0] + dy * _f[1] + dz * _f[2]) / (d || 1) < 0.2) continue;
      if (!this.los(eye, n.origin)) continue;
      (this.dodged || (this.dodged = new Set())).add(n);
      const mate = n.owner && n.owner.team === p.team;
      if (Math.random() > (mate ? 0.9 : this.skill.dodge)) continue;
      this.avoidFlash = { until: this.time + Math.max(0.2, left) + 0.3, yaw: Math.atan2(dy, dx) / DEG + 180 };
      return;
    }
  }

  aimedAtBy(e, eye) {
    const ee = e.eyePos();
    const [pp, py] = angleTo(ee, eye);
    return Math.abs(angDiff(py, e.pm.angles[1])) < 12 && Math.abs(pp - e.pm.angles[0]) < 15;
  }

  acquire(e, parts) {
    const first = !this.target;
    this.target = e;
    const off = Math.acos(clamp(parts.cos, -1, 1)) / DEG;
    let r = this.skill.reaction * rand(0.8, 1.25);
    if (off < 10) r *= 0.75; else if (off > 50) r *= 1.3;
    r *= 1 + Math.min(0.6, parts.d / 3500);
    const mySpeed = Math.hypot(this.p.pm.velocity[0], this.p.pm.velocity[1]);
    if (this.inPosition && mySpeed < 40) r *= 0.85; else if (mySpeed > 160) r *= 1.15;
    if (this.time - this.targetSeen < 1.5) r *= 0.5; // switching between enemies already in the fight
    if (this.heard && this.time - this.heard.t < 1.5 && dist3(this.heard.pos, e.pm.origin) < 400) r *= 0.85;
    this.reactAt = this.time + r;
    this.acquiredAt = this.time;
    const mag = this.skill.err * rand(0.6, 1.4) * (1 + Math.min(1.5, off / 40));
    const a = Math.random() * Math.PI * 2;
    this.aimErr = [Math.sin(a) * mag * 0.6, Math.cos(a) * mag];
    this.aimHead = Math.random() < this.skill.head;
    this.aimPick = this.time + rand(1, 2);
    this.burst = 0;
    this.nextFire = Math.max(this.nextFire, this.time);
    this.fight = null;
    if (e.special && this.game.zombies?.enabled && this.game.zombies.threats.spotted(this, e)) return; // a special: called out by name (zthreats.js)
    if (first && Math.random() < 0.35 && this.time - (this.mgr.lastSpot?.[teamKey(this.p.team)] || -99) > 10) {
      (this.mgr.lastSpot || (this.mgr.lastSpot = {}))[teamKey(this.p.team)] = this.time;
      this.mgr.radio(this, RADIO.spotted);
    }
  }

  // ------------------------------------------------------------------ combat
  combat(it) {
    const p = this.p, e = this.target, w = p.active;
    this.mode = 'combat';
    it.combat = true;
    const eye = p.eyePos(_eye);
    const parts = this.bodyPoints(e);
    if (this.time > this.aimPick) { this.aimHead = Math.random() < this.skill.head; this.aimPick = this.time + rand(1, 2); }
    let head = this.aimHead;
    const auto = w && w.def.auto && !isSniper(w) && w.def.kind !== 'shotgun';
    if (auto && dist3(p.pm.origin, e.pm.origin) < 500) head = false; // spray: centre mass, the recoil walks it up
    if (this.targetVisible) { if (!this.visChest) head = true; else if (!this.visHead) head = false; }
    const pt = !this.targetVisible ? eyeAt(this.lastKnown || e.feet()) : this.visBelly && !this.visHead && !this.visChest ? parts.belly : head ? parts.head : parts.chest;
    this.aimPt = pt;
    this.aimingHead = head;
    it.look = pt;
    const d = dist3(eye, pt);
    const reacted = this.time >= this.reactAt;
    const cls = this.weaponClass(w);
    // pick how to fight this enemy
    if (!this.fight) {
      const r = Math.random();
      const crouch = (cls === 'rifle' || cls === 'mg') && d > 300 && d < 1600 && r < 0.3 * this.skill.spray + 0.08;
      this.fight = { crouch, strafeDir: Math.random() < 0.5 ? -1 : 1, strafeT: 0, since: this.time };
    }
    const F = this.fight;
    // low on health: back off out of sight (keep shooting while backing up)
    if (p.health <= 30 && d > 350 && !this.isCommitted() && this.targetVisible && Math.random() < 0.02) this.retreatTo = this.findCover(e, 500);
    if (this.retreatTo && dist2(p.pm.origin, this.retreatTo) > 40 && this.time - F.since < 6) { it.move = this.retreatTo; it.tol = 24; }
    else this.retreatTo = null;
    // empty / reloading with the enemy at range: get to cover
    const reloading = w && isGun(w) && (w.inReload || w.clip === 0);
    if (reloading && d > 400 && !it.move) {
      if (!this.coverPos || this.time - this.coverAt > 3) { this.coverPos = this.findCover(e, 450); this.coverAt = this.time; }
      if (this.coverPos) { it.move = this.coverPos; it.tol = 20; }
    }
    if (!this.targetVisible) {
      // just lost sight: hold the angle, a little peek
      if (!it.move && this.time - this.targetSeen > 0.3 && this.isAggressive()) { it.move = this.lastKnown; it.walk = true; }
      return;
    }
    if (!reacted) { if (cls === 'bolt' && this.isHolding()) it.stop = true; return; }
    if (cls === 'knife') { it.move = e.feet(); it.tol = 8; if (d < 70) it.attack = Math.random() < 0.5; return; }
    it.fire = true;
    if (e.isZombie && this.game.zombies.shove.bot(this, e, d)) return; // zombie survival: shove them off / free a pinned teammate (shove.js)
    // zombie survival: they can only claw, so keep them at arm's length - back off while
    // shooting (sideways if there's no room behind)
    if (e.isZombie && d < (e.boss ? 380 : 280)) {
      if (this.time >= (this.backAt || 0)) { this.backTo = this.backOff(e); this.backAt = this.time + 0.25; }
      if (this.backTo) { it.move = this.backTo; it.tol = 12; return; }
    }
    if (e.isZombie && zombieOrderInFight(this, it)) return; // radio orders hold in a fight too (zorders.js)
    if (it.move) return;
    // movement while shooting
    const precise = cls === 'rifle' || cls === 'mg' || cls === 'autosniper' ? d > 380 : cls === 'bolt' ? true : cls === 'pistol' ? d > 220 : cls === 'smg' ? d > 600 : false;
    if (F.crouch && d > 250) it.duck = true;
    if (precise || it.duck) {
      // stop for accuracy; jiggle between taps/bursts at range
      const waiting = this.nextFire - this.time;
      if (this.skill.stop >= Math.random() * 1.02 || it.duck) {
        if (waiting > 0.22 && cls !== 'bolt' && !it.duck && d > 600) it.strafe = F.strafeDir * 0.6;
        else it.stop = true;
      }
    } else {
      // close range: strafe (ADAD) while spraying, a jump now and then
      if (this.time > F.strafeT) { F.strafeT = this.time + rand(0.25, 0.6); F.strafeDir = -F.strafeDir; }
      it.strafe = F.strafeDir;
      if (cls === 'rifle' && Math.random() < 0.5 * this.skill.spray) it.strafe = 0, it.stop = true;
    }
  }

  /** A spot a step away from zombie e that can be walked to and isn't into another one, or null. */
  backOff(e) {
    const g = this.game, f = this.p.feet(), o = this.p.pm.origin;
    const dx = o[0] - e.pm.origin[0], dy = o[1] - e.pm.origin[1], l = Math.hypot(dx, dy) || 1;
    for (const a of [0, 0.7, -0.7, 1.4, -1.4]) {
      const c = Math.cos(a), sn = Math.sin(a);
      const ux = (dx * c - dy * sn) / l, uy = (dx * sn + dy * c) / l;
      const to = [f[0] + ux * 120, f[1] + uy * 120, f[2]];
      if (!g.nav.canWalk(f, to) || !zombieMayStepTo(this, to)) continue; // (radio orders: not off a held spot, nor away from the human - zorders.js)
      if (g.zombies.pool.some((z) => z.alive && z !== e && Math.hypot(z.pm.origin[0] - to[0], z.pm.origin[1] - to[1]) < 100)) continue;
      return to;
    }
    return null;
  }

  isCommitted() { return this.p.planting || this.p.defusing || this.p.weapons[5] && this.mgr.T?.phase === 'execute'; }
  isHolding() { return this.inPosition; }
  isAggressive() {
    if (this.p.team === TEAM_T) return this.mgr.T?.phase === 'execute' && this.tTask?.kind === 'route' && !this.inPosition;
    return !!this.mgr.CT?.retake?.go && !this.inPosition;
  }

  weaponClass(w) {
    if (!w) return 'none';
    if (isBolt(w)) return 'bolt';
    if (isSniper(w)) return 'autosniper';
    return w.def.kind;
  }

  // nearest standable spot within radius (path) that the enemy can't see
  findCover(e, radius) {
    const nav = this.game.nav, p = this.p;
    const start = nav.nearest(p.feet(_feet), 200);
    if (!start) return null;
    const ee = e.eyePos();
    let n = 0;
    for (const { node, dist } of nav.around(start, radius, 250)) {
      if (dist < 48 || node.edges.length < 5) continue;
      if (++n > 60) break;
      const q = [node.x, node.y, node.z + EYE];
      if (!this.los(ee, q) && !this.los(ee, [node.x, node.y, node.z + 30])) return [node.x, node.y, node.z];
    }
    return null;
  }

  // shoot at the current target
  fire(cmd, it) {
    const p = this.p, w = p.active, e = this.target;
    if (!w || !e || !this.aimPt) return;
    const cls = this.weaponClass(w);
    if (cls === 'grenade' || cls === 'c4' || cls === 'knife' || cls === 'none') return;
    if (w.clip === 0) { if (!w.inReload && w.ammo > 0) cmd.wbuttons |= BTN_RELOAD; return; }
    if (w.inReload || w.nextAttack > this.time) return;
    const eye = p.eyePos(_eye);
    const d = dist3(eye, this.aimPt);
    // where the shot would go (view + punch) vs where the bot believes the target is
    const [tp, ty] = this.percAng || angleTo(eye, this.aimPt);
    const a = p.pm.angles, pu = p.pm.punch;
    const err = Math.hypot(angDiff(ty, a[1] + pu[1]), tp - (a[0] + pu[0]));
    const radius = this.aimingHead ? 5.5 : 10;
    const spraying = this.burst > 0 && (cls === 'rifle' || cls === 'smg' || cls === 'mg') && d < 900;
    const tol = Math.max(0.35, Math.atan2(radius, d) / DEG) * (spraying ? (d < 350 ? 2.6 : 1.6) : 1.25) + (d < 200 ? 2 : 0);
    if (this.friendlyInLine(eye, this.aimPt, d)) { this.burst = 0; it.strafe = it.strafe || 1; return; }
    const speed = Math.hypot(p.pm.velocity[0], p.pm.velocity[1]);
    if (cls === 'bolt') {
      if (w.resumeZoom || w.nextPrimary > this.time) return;
      const zoomed = p.fov < 90;
      if (!zoomed) {
        if (this.time > this.zoomClock && w.nextSecondary <= this.time) { cmd.wbuttons |= BTN_ATTACK2; this.zoomClock = this.time + 0.35; this.scopedAt = this.time; }
        return;
      }
      if (this.time - this.scopedAt < this.skill.scope && this.scopedAt > this.acquiredAt) return;
      if (speed > (w.id === 'awp' ? 12 : 60) || err > tol * 0.9) return;
      if (this.time < this.nextFire) return;
      cmd.wbuttons |= BTN_ATTACK;
      this.nextFire = this.time + 0.3;
      return;
    }
    if (err > tol) { if (this.burst > 0 && !spraying) this.burst = 0; return; }
    if (this.time < this.nextFire) return;
    const stopSpeed = cls === 'rifle' || cls === 'autosniper' ? 120 : cls === 'pistol' ? 170 : cls === 'smg' ? 180 : cls === 'mg' ? 110 : 999;
    if (it.stop && speed > stopSpeed && d > 380 && this.skill.stop > 0.3) return; // still counter-strafing
    if (cls === 'pistol' || cls === 'shotgun' || cls === 'autosniper') {
      if (this.tapRelease) { this.tapRelease = false; return; }
      if (cls === 'shotgun' && d > 1100) return;
      cmd.wbuttons |= BTN_ATTACK;
      this.tapRelease = true;
      const base = cls === 'shotgun' ? 0.2 : cls === 'autosniper' ? 0.35 : w.id === 'deagle' ? 0.42 : 0.16;
      this.nextFire = this.time + base * (d > 1200 ? 1.9 : d > 600 ? 1.35 : 1) * (1.25 - this.skill.spray * 0.35) + Math.random() * 0.06;
      return;
    }
    // automatic: taps at long range, bursts at mid range, spray up close
    const sp = this.skill.spray;
    const maxBurst = d > 1400 ? 1 : d > 900 ? 2 : d > 550 ? Math.round(2 + sp * 1.5) : d > 300 ? Math.round(4 + sp * 4) : 30;
    if (this.burst >= maxBurst) {
      this.burst = 0;
      this.nextFire = this.time + (d > 900 ? rand(0.3, 0.45) : rand(0.2, 0.32)) * (1.35 - sp * 0.45);
      return;
    }
    // between bursts at range: let the view kick settle first
    if (this.burst === 0 && d > 300 && Math.hypot(pu[0], pu[1]) > 1.2 + (1 - sp) * 1.5) return;
    cmd.wbuttons |= BTN_ATTACK;
  }

  // bullets fired since the last tick (bursts are counted in rounds, not ticks)
  countShots() {
    const w = this.p.active;
    if (!w || !isGun(w)) { this.lastClipW = null; return; }
    if (this.lastClipW !== w) { this.lastClipW = w; this.lastClip = w.clip; return; }
    if (w.clip < this.lastClip) this.burst += this.lastClip - w.clip;
    this.lastClip = w.clip;
  }

  friendlyInLine(eye, tgt, d) {
    if (this.game.zombies?.enabled && !this.game.rounds.friendlyFire) return false; // (shots go past teammates there)
    const dx = (tgt[0] - eye[0]) / d, dy = (tgt[1] - eye[1]) / d, dz = (tgt[2] - eye[2]) / d;
    for (const q of this.game.players) {
      if (q === this.p || !q.alive || q.team !== this.p.team) continue;
      const o = q.pm.origin;
      const t = (o[0] - eye[0]) * dx + (o[1] - eye[1]) * dy + (o[2] - eye[2]) * dz;
      if (t < 0 || t > d) continue;
      const cx = eye[0] + dx * t - o[0], cy = eye[1] + dy * t - o[1], cz = eye[2] + dz * t - o[2];
      if (Math.hypot(cx, cy) < 22 && cz > -40 && cz < 40) return true;
    }
    return false;
  }

  blinded(it) {
    // flashed: back off and spray at the last known position now and then
    it.look = this.lastKnown && this.time - this.lastKnownT < 2 ? eyeAt(this.lastKnown) : null;
    it.move = null;
    it.strafe = Math.sin(this.time * 2 + this.p.id) > 0 ? 1 : -1;
    if (this.lastKnown && this.time - this.lastKnownT < 1.5 && Math.random() < 0.15 && this.target) it.fire = true;
  }

  // ------------------------------------------------------------------ aim
  aim(it, dt) {
    const p = this.p, a = p.pm.angles;
    let tp, ty;
    const eye = p.eyePos(_eye);
    if (it.lookAngles) [tp, ty] = it.lookAngles;
    else if (it.look) [tp, ty] = angleTo(eye, it.look);
    else return;
    const sk = this.skill;
    const enemy = it.combat && it.look && this.targetVisible && this.target;
    if (enemy) {
      // where the bot thinks the target is: noise that grows with range and
      // with movement (a far, moving head is hard to place exactly)
      const ev = this.target.pm.velocity;
      const d = Math.max(64, dist3(eye, it.look));
      const lat = ((ev[0] - p.pm.velocity[0]) * -Math.sin(ty * DEG) + (ev[1] - p.pm.velocity[1]) * Math.cos(ty * DEG));
      const angVel = Math.atan2(lat, d) / DEG; // deg/s
      const myV = Math.hypot(p.pm.velocity[0], p.pm.velocity[1]) / 250;
      if (this.time > this.noiseT) {
        this.noiseT = this.time + rand(0.12, 0.28);
        const amp = sk.err * (0.14 + myV * 0.2) * (1 + d / 1500);
        const g1 = (Math.random() + Math.random() + Math.random() - 1.5) * 1.4, g2 = (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;
        this.noise = [g1 * amp * 0.5, g2 * amp];
      }
      const nk = Math.min(1, dt * 9);
      this.noiseCur[0] += (this.noise[0] - this.noiseCur[0]) * nk;
      this.noiseCur[1] += (this.noise[1] - this.noiseCur[1]) * nk;
      tp += this.noiseCur[0];
      ty += this.noiseCur[1] - angVel * sk.lag;
      this.percAng = [tp, ty];
      // the flick toward a new target settles over time
      const k = Math.exp(-dt / sk.settle);
      this.aimErr[0] *= k; this.aimErr[1] *= k;
      tp += this.aimErr[0];
      ty += this.aimErr[1];
      // recoil control: pull against the punch
      const pu = p.pm.punch;
      tp -= pu[0] * sk.recoil;
      ty -= pu[1] * sk.recoil;
    } else this.percAng = null;
    const zoomed = p.fov < 90;
    const rate = sk.turn * (it.combat ? 1 : this.inPosition ? 0.45 : 0.6) * (zoomed ? 0.55 : 1);
    const maxStep = rate * dt;
    const dy = angDiff(ty, a[1]), dp = tp - a[0];
    const gain = it.combat ? 0.3 : 0.12;
    const sy = Math.sign(dy) * Math.min(Math.abs(dy), Math.max(maxStep * 0.12, Math.abs(dy) * gain), maxStep);
    const sp = Math.sign(dp) * Math.min(Math.abs(dp), Math.max(maxStep * 0.12, Math.abs(dp) * gain), maxStep);
    a[1] = ((a[1] + sy) % 360 + 360) % 360;
    a[0] = clamp(a[0] + sp, -89, 89);
  }

  // ------------------------------------------------------------------ weapons
  bestGun() {
    const p = this.p;
    if (hasAmmo(p.weapons[1])) return p.weapons[1];
    if (hasAmmo(p.weapons[2])) return p.weapons[2];
    return p.weapons[3] || p.weapons[1] || p.weapons[2];
  }

  manageWeapon(cmd, it) {
    const g = this.game, p = this.p, w = p.active;
    if (p.downed) { if (w && isGun(w) && !w.inReload && w.ammo > 0 && (w.clip === 0 || (w.clip < WS.clipSize(w) * 0.5 && !this.zombieNear(260)))) cmd.wbuttons |= BTN_RELOAD; return; } // down: the pistol only
    if (this.nade || this.planting || this.heal) return;
    const best = this.bestGun();
    if (!w) { if (best) g.selectWeapon(p, best); return; }
    if ((w.def.kind === 'grenade' && !w.pinPulled) || (w.id === 'c4' && !this.planting) || (w.def.kind === 'medkit' && !w.healEnd)) { if (best && best !== w) g.selectWeapon(p, best); return; }
    const fightRecent = this.time - this.targetSeen < 2.5;
    const e = this.target;
    const d = e ? dist3(p.pm.origin, e.pm.origin) : 9999;
    // out of ammo in the gun in hand
    if (isGun(w) && !hasAmmo(w)) { if (best && best !== w) g.selectWeapon(p, best); return; }
    if (w.id === 'knife' && best !== w && (fightRecent || !this.knifeRun)) { g.selectWeapon(p, best); return; }
    // zombie survival: the fight never really ends, so "quiet" means no zombie close by
    // (otherwise a bot whose rifle ran dry would be stuck on its pistol all game)
    const zm = !!g.zombies?.enabled;
    const quiet = !fightRecent || (zm && !this.zombieNear(450, 600));
    // empty primary with an enemy close: pistol is faster than reloading
    if (e && w === p.weapons[1] && w.clip === 0 && d < (zm ? 350 : 800) && p.weapons[2]?.clip > 0) { g.selectWeapon(p, p.weapons[2]); return; }
    // AWP at point blank: pistol
    if (e && isBolt(w) && d < 260 && this.targetVisible && p.weapons[2]?.clip > 0) { g.selectWeapon(p, p.weapons[2]); return; }
    // back to the primary after the fight
    if (quiet && w === p.weapons[2] && hasAmmo(p.weapons[1])) { g.selectWeapon(p, p.weapons[1]); return; }
    // reload when it's quiet
    if (quiet && isGun(w) && !w.inReload && w.ammo > 0 && w.clip < WS.clipSize(w) * (this.inPosition || this.mode === 'task' ? 0.7 : 0.35)) cmd.wbuttons |= BTN_RELOAD;
    // snipers: scoped while holding an angle, unscoped while running
    if (isSniper(w) && !it.combat) {
      const zoomed = p.fov < 90;
      const wantZoom = this.inPosition && !it.move;
      if (zoomed !== wantZoom && this.time > this.zoomClock && w.nextSecondary <= this.time && !w.inReload) {
        cmd.wbuttons |= BTN_ATTACK2;
        this.zoomClock = this.time + (zoomed ? 0.35 : 0.6);
        if (!zoomed) this.scopedAt = this.time;
      }
      // second click would go to x10 zoom; step back out to unzoomed
      if (zoomed && p.fov < 20 && this.time > this.zoomClock && w.nextSecondary <= this.time) { cmd.wbuttons |= BTN_ATTACK2; this.zoomClock = this.time + 0.35; }
    } else if (isSniper(w) && it.combat && p.fov < 20 && this.time > this.zoomClock && w.nextSecondary <= this.time) {
      cmd.wbuttons |= BTN_ATTACK2; this.zoomClock = this.time + 0.35;
    }
  }

  // ------------------------------------------------------------------ acid (zombie survival)
  /** Get clear of acid: where a glob is about to land, out of a pool already burning or a gas cloud. */
  dodgeGoo(it) {
    const g = this.game, p = this.p, o = p.pm.origin;
    if (p.pinnedBy || p.tonguedBy) return;
    const feetZ = o[2] - 36;
    let away = null, worst = 0;
    const flee = (c, r) => {
      const d = Math.hypot(o[0] - c[0], o[1] - c[1]);
      if (d > r || Math.abs(feetZ - c[2]) > 80) return;
      const k = 1 - d / r;
      if (k > worst) { worst = k; away = c; }
    };
    for (const pr of g.projectiles?.list || []) {
      if (pr.type !== 'acid') continue;
      // where it comes down (at our feet's height)
      const G = 800 * (pr.def.gravity ?? 1), vz = pr.vel[2], h = pr.pos[2] - feetZ;
      const disc = vz * vz + 2 * G * h;
      if (disc < 0 || !G) continue;
      const T = (vz + Math.sqrt(disc)) / G;
      flee([pr.pos[0] + pr.vel[0] * T, pr.pos[1] + pr.vel[1] * T, feetZ], 190);
    }
    for (const pa of g.fire?.patches || []) if (pa.kind === 'acid' && g.time < pa.end) flee(pa.center, pa.radius + 50);
    // and out of a bloater's gas cloud
    for (const c of g.zombies.roster?.clouds || []) if (g.time < c.until) flee(c.pos, GAS_R + 50);
    if (!away) return;
    // straight out of it (sideways if it's right on us), shooting all the while
    let dx = o[0] - away[0], dy = o[1] - away[1], l = Math.hypot(dx, dy);
    if (l < 8) { const y = p.pm.angles[1] * DEG; dx = -Math.sin(y); dy = Math.cos(y); l = 1; }
    it.move = [o[0] + dx / l * 260, o[1] + dy / l * 260, feetZ];
    it.stop = false; it.walk = false; it.duck = false; it.tol = 40;
    this.dodging = this.time;
  }

  // ------------------------------------------------------------------ medkits (zombie survival)
  /** A zombie within r units of us (the boss: within rb)? */
  zombieNear(r, rb = r * 1.5) {
    const o = this.p.pm.origin;
    return this.game.zombies.pool.some((z) => z.alive && dist3(z.pm.origin, o) < r) || (this.game.bosses?.alive() && dist3(this.game.bosses.boss.pm.origin, o) < rb);
  }

  /**
   * Hurt and it's quiet: patch myself up, or a hurt teammate close by (the human first).
   * Never with zombies close (taking the kit out and the use leave ~2 s without a gun).
   */
  considerHeal(fighting) {
    const p = this.p, g = this.game;
    if (this.time < (this.healClock || 0) || p.downed || this.revive) return; // (down: pistol only; picking somebody up first)
    this.healClock = this.time + 0.5;
    const kit = p.weapons[4].find((x) => x.id === 'medkit' && (x.count ?? 1) > 0);
    if (!kit) return;
    // the human about to go down close by: run over and save him unless something is right on us
    const me = g.local;
    if (me && me !== p && me.alive && !me.downed && me.team === p.team && me.health < 35 && dist3(p.pm.origin, me.pm.origin) < 350 && !this.zombieNear(140, 0)) {
      this.heal = { kit, target: me, phase: 'select', t: this.time, urgent: true };
      return;
    }
    if (this.zombieNear(HEAL_SAFE, 280)) return;
    // badly hurt: patch up even mid-fight while the closest one is still a second away
    if (p.health < 40 || (p.health < 60 && !fighting && this.time - this.targetSeen > 1.5)) { this.heal = { kit, target: p, phase: 'select', t: this.time }; return; }
    if (fighting || this.time - this.targetSeen < 1.5) return;
    let best = null, bs = Infinity;
    for (const q of g.players) {
      if (q === p || !q.alive || q.downed || q.team !== p.team || q.isZombie || q.health >= 55) continue;
      const d = dist3(p.pm.origin, q.pm.origin);
      if (d > 450) continue;
      const sc = d + q.health * 4 - (q.isBot ? 0 : 400);
      if (sc < bs) { bs = sc; best = q; }
    }
    if (best) this.heal = { kit, target: best, phase: 'select', t: this.time };
  }

  runHeal(it) {
    const h = this.heal, p = this.p, g = this.game, kit = h.kit, q = h.target;
    this.mode = 'heal';
    const done = (wait = 2) => {
      this.heal = null;
      this.healClock = this.time + wait;
      const best = this.bestGun();
      if (best && p.active !== best) g.selectWeapon(p, best);
    };
    if (!p.weapons[4].includes(kit) || !q.alive || q.downed || this.time - h.t > 8) { done(); return; }
    const chest = [q.pm.origin[0], q.pm.origin[1], q.pm.origin[2] + 10];
    if (h.phase === 'using') {
      if (q !== p) { it.look = chest; it.stop = true; }
      if (!kit.healEnd) done(); // landed (or was cut short)
      return;
    }
    if (q.health >= (q.maxHealth || 100)) { done(); return; }
    if (h.urgent ? this.zombieNear(90, 0) : this.zombieNear(HEAL_SAFE * 0.6, 200)) { done(4); return; } // they're here: guns
    if (p.active !== kit) { g.selectWeapon(p, kit); return; }
    const ready = kit.nextAttack <= this.time && kit.nextPrimary <= this.time && kit.nextSecondary <= this.time;
    if (q === p) {
      if (ready) { it.attack = true; h.phase = 'using'; }
      return;
    }
    // walk up to the teammate, face him, patch him up
    it.look = chest;
    const d = dist3(p.pm.origin, q.pm.origin);
    if (d > 64) { it.move = q.feet(); it.tol = 36; return; }
    it.stop = true;
    const e = p.eyePos();
    const yaw = Math.atan2(chest[1] - e[1], chest[0] - e[0]) / DEG;
    const pitch = -Math.atan2(chest[2] - e[2], Math.hypot(chest[0] - e[0], chest[1] - e[1])) / DEG;
    if (ready && Math.abs(angDiff(yaw, p.pm.angles[1])) < 15 && Math.abs(pitch - p.pm.angles[0]) < 20) { it.attack2 = true; h.phase = 'using'; }
  }

  // ------------------------------------------------------------------ revives (zombie survival)
  /**
   * A teammate is down: go and pick him up (the human first), never with a zombie right on
   * us (a revive is seconds of holding still with no gun). Down myself with a Second Wind:
   * use it when it's quiet, or before I bleed out.
   */
  considerRevive(fighting) {
    const p = this.p, g = this.game, D = g.zombies.downed;
    if (this.time < (this.reviveClock || 0)) return;
    this.reviveClock = this.time + 0.4;
    if (p.downed) {
      if (p.secondWind && !p.downed.by && (!this.zombieNear(220, 320) || D.left(p) < 8)) this.revive = { target: p, t: this.time };
      return;
    }
    const q = D.reviveTarget(p, fighting ? 900 : 1800);
    if (!q || this.zombieNear(reviveClear(q, 0), q.isBot ? 400 : 320)) return;
    this.takeRevive(q);
  }

  takeRevive(q) {
    this.revive = { target: q, t: this.time, check: this.time + 0.4 };
    if (!q.isBot) this.mgr.radio(this, Math.random() < 0.5 ? "Hang on, I'm coming!" : "I've got you, stay down!");
  }

  runRevive(it, fighting) {
    const r = this.revive, p = this.p, q = r.target, g = this.game;
    const done = (wait = 1) => { this.revive = null; this.reviveClock = this.time + wait; };
    const D = q.downed;
    if (!q.alive || !D || (D.by && D.by !== p) || this.time - r.t > 20 || (p.downed && q !== p)) { done(0.5); return; }
    if (q === p) {
      // my own Second Wind: hold use (shooting back instead while one's on top of me and there's time)
      if (this.zombieNear(110, 200) && g.zombies.downed.left(p) > 5 && !D.by) { done(1.5); return; }
      this.mode = 'revive';
      it.use = true; it.stop = true; it.fire = false;
      return;
    }
    // on my way to a bot and the human goes down (you first: reviveTarget): him instead,
    // unless I'm well into picking this one up
    if (q.isBot && this.time >= r.check && !(D.by === p && D.prog > 0.5)) {
      r.check = this.time + 0.4;
      const h = g.zombies.downed.reviveTarget(p, fighting ? 900 : 1800);
      if (h && !h.isBot && !this.zombieNear(reviveClear(h, 0), 320)) {
        if (D.by === p) g.zombies.downed.stopRevive(p);
        if (D.claim === p) D.claim = null; // (free for the others again)
        this.takeRevive(h);
        return;
      }
    }
    D.claim = p; D.claimT = this.time; // (the other bots leave him to me and cover)
    const d = Math.hypot(q.pm.origin[0] - p.pm.origin[0], q.pm.origin[1] - p.pm.origin[1]);
    if (d > 56 || Math.abs(q.pm.origin[2] - p.pm.origin[2]) > 60) {
      // on the way: shoot what's in the way and keep going, but zombies on him get shot off
      // him from where we are first (walking into that is how the reviver goes down too)
      if (fighting) this.combat(it);
      this.mode = 'revive';
      if (fighting && d < 600 && g.zombies.downed.danger(q, 220, 420)) return;
      it.move = q.feet(); it.tol = 24; it.walk = false; it.duck = false; it.stop = false; it.strafe = 0;
      return;
    }
    this.mode = 'revive';
    // a zombie about to claw us (their reach is ~80) early on: guns first, then try again
    // (no closer than considerRevive took it on at, or it'd be taken and dropped every second)
    if (this.zombieNear(reviveClear(q, D.prog), 220) && D.prog < 0.7) { if (fighting) this.combat(it); done(1); return; }
    it.use = true; it.stop = true; it.fire = false;
    it.look = [q.pm.origin[0], q.pm.origin[1], q.pm.origin[2]];
  }

  // ------------------------------------------------------------------ grenades
  // Plan a throw of `type` at `target`; false when we don't have one or can't reach it.
  startGrenade(type, target, { tol = 220, after = null } = {}) {
    const p = this.p;
    if (this.nade || p.planting || p.defusing || p.downed) return false;
    const w = p.weapons[4].find((x) => x.id === type && (x.count ?? 1) > 0);
    if (!w) return false;
    const sol = this.K.throwSolution(p.eyePos(), target, type);
    if (!sol || sol.err > tol) return false;
    this.nade = { w, type, target, sol, phase: 'select', t: this.time, after };
    this.mgr.stats.nades++;
    return true;
  }

  runGrenade(it) {
    const n = this.nade, p = this.p, g = this.game;
    this.mode = 'grenade';
    it.stop = true;
    if (n.phase === 'pull' && (!p.weapons[4].includes(n.w) || p.active !== n.w)) { n.phase = 'thrown'; n.tt = this.time; }
    if (this.time - n.t > 5 || (!p.weapons[4].includes(n.w) && n.phase !== 'thrown')) { this.nade = null; return; }
    it.lookAngles = [n.sol.pitch, n.sol.yaw];
    switch (n.phase) {
      case 'select':
        if (p.active !== n.w) g.selectWeapon(p, n.w);
        n.phase = 'ready';
        break;
      case 'ready': {
        if (p.active !== n.w) { g.selectWeapon(p, n.w); break; }
        const a = p.pm.angles;
        const err = Math.hypot(angDiff(n.sol.yaw, a[1]), n.sol.pitch - a[0]);
        if (n.w.nextAttack <= this.time && n.w.nextPrimary <= this.time && err < 1.5) { it.attack = true; n.phase = 'pull'; n.tp = this.time; }
        break;
      }
      case 'pull':
        // released; the throw happens 0.5 s after the pin pull with the current view angles
        if (!n.w.startThrow || n.w.spent || !p.weapons[4].includes(n.w) || p.active !== n.w) { n.phase = 'thrown'; n.tt = this.time; }
        break;
      case 'thrown':
        if (n.type === 'flashbang' && this.time - n.tt < 1.3) it.lookAngles = [0, n.sol.yaw + 180];
        else {
          this.nade = null;
          const best = this.bestGun();
          if (best && p.active !== best && !(p.active?.def.kind === 'grenade' && p.active.pinPulled)) g.selectWeapon(p, best);
          if (n.after) n.after();
        }
        break;
      default: this.nade = null;
    }
  }

  // ------------------------------------------------------------------ hearing / search
  searchAndListen(it) {
    const p = this.p, now = this.time;
    // recently lost contact: pre-aim the last known position, maybe push it or nade it
    if (this.lastKnown && now - this.lastKnownT < 7 && this.lastKnownEnemy?.alive) {
      const age = now - this.lastKnownT;
      const lk = eyeAt(this.lastKnown);
      const d = dist3(p.pm.origin, this.lastKnown);
      if (age < 4) { it.look = lk; this.mode = 'search'; }
      if (age > 0.6 && age < 4 && d > 300 && d < 1300 && now > this.nadeClock && Math.random() < 0.02 * this.skill.nades && !this.los(p.eyePos(_eye), lk)) {
        this.nadeClock = now + 8;
        if (!this.startGrenade('hegrenade', this.lastKnown, { tol: 200 }) && this.isAggressive()) this.startGrenade('flashbang', [lk[0], lk[1], lk[2] + 60], { tol: 300 });
      }
      if (age < 2.5 && !this.isAggressive() && !this.p.weapons[5] && d < 1500) { it.move = null; it.stop = true; }
      return;
    }
    // footsteps / gunfire / a defuse: turn toward the noise
    const h = this.heard;
    if (h && now - h.t < (h.kind === 'step' ? 2.5 : 3.5) && h.src?.alive) {
      const d = dist3(p.pm.origin, h.pos);
      if (d < 1600) {
        it.look = h.kind === 'step' ? eyeAt([h.pos[0], h.pos[1], h.pos[2]]) : h.pos;
        this.mode = 'listen';
        // some holders go and check footsteps close by, quietly
        if (h.kind === 'step' && this.investigator && d > 160 && d < 700 && Math.abs(h.pos[2] - p.feet(_feet)[2]) < 64 && !this.isCommitted() && !this.game.rounds.bomb) {
          if (this.inPosition && (!this.investigate || this.investigate.src !== h.src)) this.investigate = { src: h.src, until: now + rand(2, 3.5) };
          if (this.investigate && now < this.investigate.until) { it.move = [h.pos[0], h.pos[1], h.pos[2]]; it.walk = true; it.tol = 120; this.mode = 'investigate'; }
        }
        if (h.kind === 'step' && d < 500 && this.inPosition) it.duck = it.duck || Math.random() < 0.3;
        // CTs holding a site: nade the footsteps at a choke
        if (p.team === TEAM_CT && h.kind === 'step' && this.inPosition && d > 350 && d < 1200 && now > this.nadeClock && Math.random() < 0.015 * this.skill.nades) {
          this.nadeClock = now + 10;
          if (!this.los(p.eyePos(_eye), eyeAt(h.pos))) this.startGrenade(Math.random() < 0.6 ? 'hegrenade' : 'flashbang', h.kind === 'step' ? h.pos : h.pos, { tol: 250 });
        }
      }
    }
  }

  // ------------------------------------------------------------------ objectives
  objective(it) {
    const g = this.game, p = this.p, R = g.rounds;
    // the carrier plants whenever he is in a bomb zone, whatever a teammate radioed
    if (p.team === TEAM_T && p.weapons[5] && R.state === 'live' && !R.bomb && this.tryPlant(it)) return;
    // zombie survival: "fall back" is back to the one who called it (zorders.js)
    if (g.zombies?.enabled && this.fallback && zombieFallBack(this, it)) { this.watchDanger(it); return; }
    // radio-driven behaviour (human teammates)
    if (this.fallback && this.time < this.fallback.until) {
      it.move = p.team === TEAM_T ? (this.K.generic ? this.K.tSpawn : this.K.routes.long.pts[1].p) : this.K.ctSpawn;
      return;
    }
    if (this.follow && this.time < this.follow.until && this.follow.p.alive && !R.bomb) {
      const q = this.follow.p;
      const d = dist2(p.pm.origin, q.pm.origin);
      if (d > 140) { it.move = q.feet(); it.walk = d < 400 && !!(q.cmd?.buttons & IN_WALK); }
      it.look = this.pathLook || eyeAt(q.feet());
      this.watchDanger(it);
      return;
    }
    if (this.holdHere && this.time < this.holdHere.until && !R.bomb) {
      this.hold(it, { pos: this.holdHere.pos, watch: [], n: 'here' });
      return;
    }
    // zombie survival: stick with the human (once his radio orders above have run out)
    if (g.zombies?.enabled && g.zombies.allyObjective(this, it)) { this.watchDanger(it); return; }
    // pick up a primary lying close by
    if (!p.weapons[1] && !this.isCommitted()) {
      const dw = g.dropped.find((d) => d.weapon?.def.slot === 1 && d.rest && dist2(d.pos, p.pm.origin) < 450 && Math.abs(d.pos[2] - p.pm.origin[2]) < 100 && !this.skipPickup.has(d));
      if (dw) {
        if (this.pickupTry?.d !== dw) this.pickupTry = { d: dw, until: this.time + 6 };
        if (this.time > this.pickupTry.until) this.skipPickup.add(dw);
        else { it.move = [dw.pos[0], dw.pos[1], dw.pos[2]]; it.tol = 4; this.watchDanger(it); return; }
      }
    }
    if (this.K.generic) genericObjective(this, it);
    else if (p.team === TEAM_T) this.objectiveT(it);
    else this.objectiveCT(it);
  }

  // ---------------------------------------------------------------- terrorists
  objectiveT(it) {
    const g = this.game, p = this.p, R = g.rounds, T = this.mgr.T;
    const bomb = R.bomb && !R.bomb.exploded && !R.bomb.defused ? R.bomb : null;
    if (bomb) return this.tPostPlant(it, bomb);
    // the bomb is on the ground: the nearest terrorist fetches it
    const dropped = g.dropped.find((d) => d.weapon?.id === 'c4');
    if (dropped && !R.bombCarrier && T) {
      // one terrorist (the nearest, re-picked only when he dies) fetches it
      if (!T.fetcher || !T.fetcher.p.alive || T.fetchDrop !== dropped) {
        const ts = this.mgr.alive(TEAM_T).filter((b) => !(b.target && b.targetVisible));
        T.fetcher = ts.sort((a, b) => dist2(a.p.pm.origin, dropped.pos) - dist2(b.p.pm.origin, dropped.pos))[0] || null;
        T.fetchDrop = dropped;
      }
      if (T.fetcher === this) {
        it.move = dropped.pos.slice(); it.tol = 4;
        this.watchDanger(it);
        if (!this.saidBomb) { this.saidBomb = true; this.mgr.radio(this, RADIO.cover); }
        return;
      }
    }
    if (!T) return;
    const task = this.tTask || (this.tTask = this.defaultTTask());
    const late = R.timeLeft() < 30;
    // the carrier never idles: when time runs short, his group is gone, or he has
    // made no progress for a while outside a planned wait, he heads straight for a site
    if (p.weapons[5] && R.state === 'live') {
      const o = p.pm.origin;
      if (!this.c4Prog || dist2(o, this.c4Prog.pos) > 140) this.c4Prog = { pos: o.slice(), t: this.time };
      const waiting = T.phase === 'setup' && (this.atGather || this.inPosition || task.kind === 'control');
      if (waiting) this.c4Prog.t = this.time;
      const mates = (task.group?.members || []).filter((b) => b !== this && b.p.alive).length;
      const stalled = this.time - this.c4Prog.t > 9;
      if (!this.c4Direct && (R.timeLeft() < 38 || stalled || (T.phase === 'execute' && task.kind === 'route' && !mates && this.time - T.executed > 6))) {
        this.c4Direct = this.pickPlantSite(T.site);
      }
      if (this.c4Direct) { this.goSite(it, this.c4Direct); return; }
    }
    if (task.kind === 'control' && T.phase === 'setup') {
      this.hold(it, task.spot, { quiet: true });
      return;
    }
    const main = T.groups.find((x) => x.role === 'main' && x.members.some((b) => b.p.alive));
    if (task.kind === 'lurk' || task.kind === 'fake') {
      if (!late && main && !p.weapons[5]) return task.kind === 'lurk' ? this.tLurk(it, task) : this.tFake(it, task);
      return this.goSite(it, T.site || task.group.route.site);
    }
    // follow the group's route
    const gr = (task.kind === 'route' && task.group) || main;
    if (!gr) { this.goSite(it, T.site || 'A'); return; }
    this.followRoute(it, gr);
  }

  defaultTTask() {
    const T = this.mgr.T;
    const gr = T?.groups.find((x) => x.role === 'main');
    if (gr) { gr.members.push(this); this.routeIdx = this.nearestRouteIdx(gr.route); return { kind: 'route', group: gr, slot: gr.members.length - 1 }; }
    return { kind: 'control', spot: pick(this.K.control) };
  }

  nearestRouteIdx(route) {
    const o = this.p.pm.origin;
    let bi = 0, bd = Infinity;
    route.pts.forEach((q, i) => { const d = dist2(o, q.p) + Math.abs(o[2] - 36 - q.p[2]) * 2; if (d < bd) { bd = d; bi = i; } });
    // already between this point and the next one: aim for the next
    if (bi < route.pts.length - 1) {
      const a = route.pts[bi].p, b = route.pts[bi + 1].p;
      if (dist2(o, b) < dist2(a, b)) bi++;
    }
    return bi;
  }

  followRoute(it, gr) {
    const p = this.p, T = this.mgr.T, route = gr.route, pts = route.pts;
    const feet = p.feet(_feet);
    const setup = T.phase === 'setup';
    const limit = setup ? route.gather : pts.length - 1;
    if (!setup) this.pastGather = false;
    // advance along the route
    while (this.routeIdx < limit && dist2(feet, pts[this.routeIdx].p) < 150 && Math.abs(feet[2] - pts[this.routeIdx].p[2]) < 90) this.routeIdx++;
    if (this.routeIdx > limit && setup) this.routeIdx = limit;
    const idx = this.routeIdx;
    const here = pts[idx];
    // utility: claim a throw whose lineup spot is close, walk there and throw it
    if (this.utilJob && (T.utilUsed.has(this.utilJob.id) || (this.utilJob.when === 'setup') !== setup)) this.utilJob = null;
    if (!this.utilJob && !this.nade && !this.utilThrown) {
      for (const u of route.util) {
        if (T.utilUsed.has(u.id) || T.utilClaim.has(u.id) || (u.when === 'setup') !== setup) continue;
        if (!p.weapons[4].some((w) => w.id === u.type)) continue;
        const from = u.from || pts[u.at].p;
        if (dist2(feet, from) > 450 || Math.abs(feet[2] - from[2]) > 100) continue;
        if (Math.random() > 0.35 + this.skill.nades) { T.utilUsed.add(u.id); continue; }
        T.utilClaim.set(u.id, this);
        this.utilJob = u;
        this.utilJobT = this.time;
        break;
      }
    }
    if (this.utilJob) {
      const u = this.utilJob, from = u.from || pts[u.at].p;
      if (this.time - this.utilJobT > 8) { T.utilUsed.add(u.id); this.utilJob = null; }
      else if (dist2(feet, from) > 12 && !(this.time - this.progT > 1.2 && this.time - this.utilJobT > 1.5)) { it.move = from; it.tol = 6; this.watchDanger(it); return; }
      else {
        T.utilUsed.add(u.id);
        this.utilJob = null;
        if (this.startGrenade(u.type, u.target, { tol: u.type === 'flashbang' ? 320 : 220 })) { this.utilThrown = true; return; }
      }
    }
    if (setup && this.pastGather) {
      // already beyond the gather point (default plan call): hold here until the go
      this.atGather = true;
      this.inPosition = true;
      it.look = eyeAt(pts[Math.min(pts.length - 1, idx + 1)].p);
      this.watchDanger(it);
      return;
    }
    if (setup && idx >= route.gather) {
      // wait for the group at the gather point: spread over a few spots, quiet
      const slots = this.K.slots(pts[route.gather].p, 6, this.K.dangerForT);
      const slot = slots[(this.tTask?.slot || 0) % slots.length];
      const d = dist2(feet, slot);
      this.atGather = d < 200 || this.closeEnough(slot, d);
      if (this.makeWay(it, feet)) return;
      if (!this.closeEnough(slot, d)) { it.move = slot; it.final = true; it.walk = d < 350 && !T.plan?.rush; it.tol = 20; }
      else this.inPosition = true;
      const nxt = pts[Math.min(pts.length - 1, route.gather + 1)].p;
      it.look = eyeAt(nxt);
      this.watchDanger(it);
      return;
    }
    this.atGather = false;
    this.inPosition = false;
    if (this.siteLatch === route.site || (idx >= pts.length - 1 && dist2(feet, here.p) < 300)) {
      // on the site: take a spot and cover the plant
      this.siteLatch = route.site;
      this.onSite(it, route.site);
      return;
    }
    it.move = here.p;
    it.tol = 48;
    // walk the last stretch before the gather point (quiet approach)
    if (setup && !T.plan?.rush && idx === route.gather && dist2(feet, here.p) < 500) it.walk = true;
    this.watchDanger(it);
  }

  // the site to plant at: the planned one, unless the other is much closer
  pickPlantSite(planned) {
    const o = this.p.pm.origin, S = this.K.sites;
    const dA = dist2(o, S.A.center), dB = dist2(o, S.B.center);
    if (planned === 'A' && dB < dA * 0.55) return 'B';
    if (planned === 'B' && dA < dB * 0.55) return 'A';
    return planned || (dA < dB ? 'A' : 'B');
  }

  goSite(it, site) {
    const s = this.K.sites[site];
    if (dist2(this.p.pm.origin, s.center) < 450) { this.onSite(it, site); return; }
    it.move = s.center;
    this.watchDanger(it);
  }

  onSite(it, site) {
    const p = this.p;
    if (p.weapons[5]) { this.goPlant(it, site); return; }
    if (!this.siteSpot || this.siteSpotSite !== site) {
      // the nearest free spot on the site (taken by no teammate yet)
      const taken = new Set(this.mgr.alive(TEAM_T).filter((b) => b !== this && b.siteSpot).map((b) => b.siteSpot));
      const c = this.K.sites[site].center;
      const spots = this.K.postPlant[site].filter((h) => !h.agg && dist2(h.pos, c) < 800);
      const free = spots.filter((h) => !taken.has(h));
      const list = free.length ? free : spots;
      this.siteSpot = list.sort((a, b) => dist2(a.pos, p.pm.origin) - dist2(b.pos, p.pm.origin))[0] || pick(this.K.postPlant[site]);
      this.siteSpotSite = site;
    }
    this.hold(it, this.siteSpot);
  }

  goPlant(it, site) {
    const s = this.K.sites[site], p = this.p;
    if (!this.plantSpot || this.plantSite !== site) { this.plantSpot = pick(s.plant); this.plantSite = site; this.plantProg = null; }
    // no progress toward the spot for a while (a teammate or a prop in the way): take another one
    const d = dist2(p.pm.origin, this.plantSpot);
    if (!this.plantProg || d < this.plantProg.d - 24) this.plantProg = { d, t: this.time };
    else if (this.time - this.plantProg.t > 2.5) {
      const others = s.plant.filter((q) => q !== this.plantSpot);
      this.plantSpot = others.length ? pick(others) : this.plantSpot;
      this.plantProg = null;
      this.nearEnough = null;
    }
    it.move = this.plantSpot;
    it.tol = 16;
    this.watchDanger(it);
  }

  tryPlant(it) {
    const g = this.game, p = this.p;
    const zone = g.bombZoneOf(p);
    if (!zone) { this.planting = false; this.zoneName = null; return false; }
    const enemiesClose = this.target && this.targetVisible && this.time >= this.reactAt;
    const w = p.weapons[5];
    // in a zone: walk to a plant spot inside it (out of the open), then plant
    const site = zone.name;
    if (this.zoneName !== site) { this.zoneName = site; this.zoneEnter = this.time; }
    if (!this.plantSpot || this.plantSite !== site) { this.plantSpot = pick(this.K.sites[site].plant); this.plantSite = site; }
    const alone = !this.mgr.alive(TEAM_T).some((b) => b !== this && dist2(b.p.pm.origin, p.pm.origin) < 900);
    const near = dist2(p.pm.origin, this.plantSpot) < 40;
    const hurry = this.time - this.zoneEnter > 2.5 || g.rounds.timeLeft() < 20 || alone && this.time - this.zoneEnter > 1;
    if (!this.planting && !near && !hurry) { it.move = this.plantSpot; it.tol = 16; this.watchDanger(it); return true; }
    if (enemiesClose && !(w.startedArming && this.time - this.plantStart > 1.8)) { this.planting = false; return false; }
    // plant
    if (p.active !== w) { g.selectWeapon(p, w); this.planting = true; this.plantStart = this.time + 0.8; return true; }
    if (!this.planting) { this.planting = true; this.plantStart = this.time; }
    if (w.nextAttack <= this.time) it.attack = true;
    it.duck = true;
    it.stop = true;
    it.look = [p.pm.origin[0] + 40 * Math.cos(p.pm.angles[1] * DEG), p.pm.origin[1] + 40 * Math.sin(p.pm.angles[1] * DEG), p.pm.origin[2] - 60];
    this.mode = 'plant';
    return true;
  }

  tPostPlant(it, bomb) {
    const p = this.p, T = this.mgr.T;
    this.planting = false;
    if (this.plantedRadio !== bomb && bomb.planter === p) { this.plantedRadio = bomb; this.mgr.radio(this, RADIO.planted, { force: true }); }
    // a defuse started: go stop it
    if (T && this.time - T.defuseAlert < 6 || bomb.defuser) {
      const d = dist2(p.pm.origin, bomb.pos);
      if (d < 1600) {
        if (d > 350 && this.time > this.nadeClock && Math.random() < 0.2) { this.nadeClock = this.time + 6; if (!this.startGrenade('hegrenade', bomb.pos, { tol: 200 })) this.startGrenade('smokegrenade', bomb.pos, { tol: 200 }); }
        it.move = bomb.pos; it.tol = 120;
        it.look = eyeAt(bomb.pos);
        this.watchDanger(it);
        return;
      }
    }
    const spot = this.postSpot || (this.postSpot = pick(this.K.postPlant[bomb.site === 'B' ? 'B' : 'A']));
    // far away (lurker): come back toward the site quietly
    this.hold(it, spot, { quiet: true });
  }

  tLurk(it, task) {
    const T = this.mgr.T, site = T.site || 'A';
    if (!task.spot) task.spot = pick(this.K.lurk[site]);
    const route = task.group.route;
    const feet = this.p.feet(_feet);
    // go along the route quietly, then hold the lurk spot
    if (dist2(feet, task.spot.pos) > 700 && this.routeIdx < route.gather) {
      while (this.routeIdx < route.gather && dist2(feet, route.pts[this.routeIdx].p) < 150) this.routeIdx++;
      it.move = route.pts[this.routeIdx].p;
      it.walk = this.routeIdx >= route.gather - 1;
      this.watchDanger(it);
      return;
    }
    this.hold(it, task.spot, { quiet: true });
  }

  tFake(it, task) {
    const T = this.mgr.T, site = task.group.route.site;
    const F = this.K.fake[site];
    const p = this.p;
    const d = dist2(p.pm.origin, F.pos);
    if (this.fakeStage === 0) {
      if (d > 60) { it.move = F.pos; this.watchDanger(it); return; }
      this.fakeStage = 1;
      this.fakeT = this.time;
      if (!this.startGrenade('hegrenade', F.nade, { tol: 300 })) this.startGrenade('flashbang', [F.nade[0], F.nade[1], F.nade[2] + 150], { tol: 400 });
      return;
    }
    if (this.fakeStage === 1) {
      // make noise toward the site
      it.look = F.shoot;
      it.stop = true;
      const w = p.active;
      if (w && isGun(w) && w.clip > 0 && this.time - this.fakeT < 1.4) { if (Math.random() < 0.5) it.attack = true; }
      if (this.time - this.fakeT > 1.6) { this.fakeStage = 2; T.fakeDone = this.time; }
      return;
    }
    this.hold(it, { pos: F.pos, watch: [eyeAt(F.shoot)], n: 'fake' }, { quiet: true });
  }

  // ---------------------------------------------------------------- counter-terrorists
  objectiveCT(it) {
    const g = this.game, p = this.p, R = g.rounds, C = this.mgr.CT;
    const bomb = R.bomb && !R.bomb.exploded && !R.bomb.defused ? R.bomb : null;
    if (bomb && C?.retake) return this.ctRetake(it, bomb, C.retake);
    if (!this.ctHold) {
      if (!this.mgr.CT) this.mgr.CT = this.mgr.newCTState();
      this.ctRole = this.ctRole || pick(['B', 'siteA', 'mid', 'longA']);
      this.ctHold = this.mgr.pickHold(this.ctRole, isSniper(p.weapons[1]));
    }
    const fb = this.ctFallback;
    if (fb && this.time < fb.until) { this.hold(it, { pos: fb.pos, watch: [eyeAt(this.K.sites[ROLE_SITE[this.ctRole] === 'A' ? 'A' : 'B'].center)], n: 'fallback' }, { quiet: false }); return; }
    const rg = this.mgr.CT?.regroup;
    if (this.rotating && rg && !rg.go) {
      const slots = this.K.slots(rg.pos, 6);
      this.hold(it, { pos: slots[this.mgr.bots.indexOf(this) % slots.length], watch: [eyeAt(this.K.sites[rg.site].center)], n: 'regroup' }, { quiet: false });
      return;
    }
    const h = this.ctHold;
    const wasIn = this.inPosition;
    this.hold(it, h, { quiet: !this.rotating });
    if (this.inPosition && !wasIn) {
      this.inPositionSince = this.time;
      if (!this.saidPos && Math.random() < 0.25) { this.saidPos = true; this.mgr.radio(this, RADIO.position, { gap: 4 }); }
    }
    if (this.inPosition && !this.saidClear && this.time - this.inPositionSince > 30 && this.time - this.targetSeen > 30 && Math.random() < 0.002) {
      this.saidClear = true;
      this.mgr.radio(this, RADIO.clear, { gap: 5 });
    }
  }

  ctRetake(it, bomb, rt) {
    const p = this.p, now = this.time;
    const left = bomb.explodeTime - now;
    const kitTime = p.defuser ? 5 : 10;
    const d = dist2(p.pm.origin, bomb.pos);
    // hopeless: run
    if (left < kitTime - 0.3 && bomb.defuser !== p) {
      if (!this.saidBlow) { this.saidBlow = true; this.mgr.radio(this, RADIO.blow); }
      const away = this.K.ctSpawn;
      it.move = d < 1800 ? (dist2(away, bomb.pos) > 1200 ? away : this.K.sites[bomb.site === 'A' ? 'B' : 'A'].center) : null;
      return;
    }
    if (bomb.defuser === p) {
      // keep defusing unless somebody is shooting at us and there's time to fight
      it.use = true; it.duck = true; it.stop = true;
      it.look = [bomb.pos[0], bomb.pos[1], bomb.pos[2]];
      this.mode = 'defuse';
      return;
    }
    if (!rt.go) {
      if (d < 1000) { this.hold(it, { pos: p.feet(), watch: [eyeAt(bomb.pos)], n: 'wait' }); return; }
      const slots = this.K.slots(rt.gather, 6);
      const slot = slots[this.mgr.bots.indexOf(this) % slots.length];
      if (dist2(p.pm.origin, slot) > 40) { it.move = slot; this.watchDanger(it); }
      else { it.look = eyeAt(bomb.pos); this.watchDanger(it); this.inPosition = true; }
      return;
    }
    // go: utility on the way in - a smoke on the bomb, flashes over the site
    const C = this.mgr.CT;
    if (d < 1100 && d > 280 && now > this.nadeClock && now > (C.retakeNade || 0)) {
      const site = this.K.sites[bomb.site === 'B' ? 'B' : 'A'];
      if (!C.retakeSmoke && this.startGrenade('smokegrenade', bomb.pos, { tol: 160 })) { C.retakeSmoke = now; C.retakeNade = now + 1.5; this.nadeClock = now + 3; return; }
      if (now - (C.retakeFlash || -9) > 2.5 && this.startGrenade('flashbang', site.flash, { tol: 350 })) { C.retakeFlash = now; C.retakeNade = now + 1.2; this.nadeClock = now + 3; return; }
      this.nadeClock = now + 2;
    }
    // the defuser heads for the bomb, the others clear the site and cover
    const threat = this.time - this.targetSeen < 2.5 || this.mgr.bots.some((b) => b.p.team === TEAM_CT && b.p.alive && b.target && b.targetVisible && dist2(b.p.pm.origin, bomb.pos) < 1200);
    if (rt.defuser === this) {
      if (d > 40) {
        it.move = bomb.pos; it.tol = 20;
        this.watchDanger(it);
        if (d < 260 && threat && left > kitTime + 4) { it.move = null; it.stop = true; }
        return;
      }
      const smoked = C.retakeSmoke && now - C.retakeSmoke > 1.5 && now - C.retakeSmoke < 18;
      if (!threat || smoked || left < kitTime + 1.5) { it.use = true; it.duck = true; it.stop = true; it.look = [bomb.pos[0], bomb.pos[1], bomb.pos[2]]; this.mode = 'defuse'; }
      else { it.stop = true; this.watchDanger(it); }
      return;
    }
    // cover: clear the T post-plant spots near the bomb, then watch
    if (!this.coverSpot || this.coverBomb !== bomb) {
      this.coverBomb = bomb;
      const list = this.K.postPlant[bomb.site === 'B' ? 'B' : 'A'];
      this.coverSpot = list[(this.mgr.bots.indexOf(this) + 1) % list.length];
    }
    if (d > 1300) { it.move = bomb.pos; this.watchDanger(it); return; }
    const cs = this.coverSpot;
    if (dist2(p.pm.origin, cs.pos) > 40) { it.move = cs.pos; this.watchDanger(it); return; }
    if (!this.coverWatch || this.coverWatchBomb !== bomb) {
      this.coverWatchBomb = bomb;
      this.coverWatch = this.K.dangerForCT.filter((q) => dist2(q, bomb.pos) < 1500 && dist2(q, cs.pos) > 300).slice(0, 3);
      if (!this.coverWatch.length) this.coverWatch = [eyeAt(bomb.pos)];
    }
    this.hold(it, { pos: cs.pos, watch: this.coverWatch, n: 'cover' });
  }

  // ---------------------------------------------------------------- holding
  // Walk to a spot (quietly near the end), then hold it: watch the entries in turn.
  closeEnough(pos, d) {
    const n = this.nearEnough;
    return d <= 30 || (n && this.time < n.until + 30 && dist2(n.pos, pos) < 8 && d < 230);
  }

  // a teammate is trying to get past (pressing into us, not progressing): step
  // off his line for a moment
  makeWay(it, feet) {
    const p = this.p;
    if (!(this.wayClear && this.time < this.wayClear.until)) {
      this.wayClear = null;
      for (const b of this.mgr.bots) {
        if (b === this || !b.p.alive || b.p.team !== p.team || !b.navMoving || b.time - b.progT < 0.5 || !b.path) continue;
        const o = b.p.pm.origin;
        const ox = feet[0] - o[0], oy = feet[1] - o[1], od = Math.hypot(ox, oy);
        if (od > 64 || od < 0.1 || Math.abs(p.pm.origin[2] - o[2]) > 64) continue;
        const pt = b.path[Math.min(b.pathIdx, b.path.length - 1)];
        let dx = pt[0] - o[0], dy = pt[1] - o[1];
        const dl = Math.hypot(dx, dy);
        if (dl < 1) continue;
        dx /= dl; dy /= dl;
        if ((ox * dx + oy * dy) / od < 0.2) continue; // not in his way
        const side = ox * -dy + oy * dx >= 0 ? 1 : -1;
        this.wayClear = { pos: [feet[0] - dy * side * 72 + dx * 16, feet[1] + dx * side * 72 + dy * 16, feet[2]], until: this.time + 1.4 };
        break;
      }
    }
    if (!this.wayClear) return false;
    it.move = this.wayClear.pos;
    it.tol = 10;
    this.inPosition = false;
    this.watchDanger(it);
    return true;
  }

  hold(it, h, { quiet = true } = {}) {
    const p = this.p;
    const feet = p.feet(_feet);
    if (this.makeWay(it, feet)) return;
    const d = dist2(feet, h.pos);
    if (!this.closeEnough(h.pos, d) || Math.abs(feet[2] - h.pos[2]) > 60) {
      it.move = h.pos;
      it.final = true;
      it.tol = 14;
      it.walk = quiet && d < 420 && d > 0;
      this.inPosition = false;
      this.watchDanger(it);
      return;
    }
    this.inPosition = true;
    if (h.duck) it.duck = true;
    const w = h.watch && h.watch.length ? h.watch : null;
    if (w) {
      if (this.time > this.watchClock) { this.watchIdx = (this.watchIdx + 1) % w.length; this.watchClock = this.time + rand(3, 7) * (this.watchIdx === 0 ? 1.5 : 1); }
      const q = w[this.watchIdx % w.length];
      // a slow sweep around the watched entry
      const sw = Math.sin(this.time * 0.5 + p.id) * 0.06;
      const dx = q[0] - feet[0], dy = q[1] - feet[1];
      it.look = [feet[0] + dx * Math.cos(sw) - dy * Math.sin(sw), feet[1] + dx * Math.sin(sw) + dy * Math.cos(sw), q[2]];
    } else this.watchDanger(it);
  }

  // Crosshair placement while moving: pre-aim visible danger spots ahead
  // (where enemies usually hold), otherwise look down the path at head height.
  watchDanger(it) {
    const p = this.p, now = this.time;
    if (now > this.lookClock) {
      this.lookClock = now + 0.25 + Math.random() * 0.1;
      const eye = p.eyePos(_eye);
      const list = p.team === TEAM_T ? this.K.dangerForT : this.K.dangerForCT;
      const v = p.pm.velocity;
      const sp = Math.hypot(v[0], v[1]);
      const mdx = sp > 30 ? v[0] / sp : Math.cos(p.pm.angles[1] * DEG), mdy = sp > 30 ? v[1] / sp : Math.sin(p.pm.angles[1] * DEG);
      const cands = [];
      for (const q of list) {
        const dx = q[0] - eye[0], dy = q[1] - eye[1];
        const d = Math.hypot(dx, dy);
        if (d < 200 || d > 1900) continue;
        const c = (dx * mdx + dy * mdy) / d;
        if (c < 0.1) continue;
        const cl = this.cleared.get(q);
        if (cl && now - cl < 8) continue;
        cands.push({ q, s: d * (1.6 - c) });
      }
      cands.sort((a, b) => a.s - b.s);
      // a spot visible now, or one that comes into view a few steps ahead (pre-aim the peek);
      // keep checking the current one until it's cleared or out of view
      const peek = sp > 60 ? [eye[0] + mdx * 90, eye[1] + mdy * 90, eye[2]] : null;
      const peekOk = peek && this.los(eye, peek);
      const cur = this.dangerLook;
      const ok = (q) => this.los(eye, q) || (peekOk && this.los(peek, q));
      if (!(cur && cands.some((c) => c.q === cur) && ok(cur))) {
        this.dangerLook = null;
        for (let i = 0; i < Math.min(3, cands.length); i++) {
          if (cands[i].q !== cur && ok(cands[i].q)) { this.dangerLook = cands[i].q; break; }
        }
      }
    }
    if (this.dangerLook) {
      const q = this.dangerLook;
      const eye = p.eyePos(_eye);
      const [tp, ty] = angleTo(eye, q);
      if (Math.abs(angDiff(ty, p.pm.angles[1])) < 6 && Math.abs(tp - p.pm.angles[0]) < 8) {
        this.clearT = this.clearT || now;
        if (now - this.clearT > 0.4) { this.cleared.set(q, now); this.dangerLook = null; this.clearT = 0; }
      } else this.clearT = 0;
      if (this.dangerLook) { it.look = q; return; }
    }
    if (!it.look && this.pathLook) it.look = this.pathLook;
  }

  // ------------------------------------------------------------------ navigation
  navigate(target, cmd, it) {
    const g = this.game, p = this.p;
    const feet = p.feet(_feet);
    if (this.wander && this.time < this.wander.until) target = this.wander.pos;
    else this.wander = null;
    const goalMoved = !this.goal || dist2(this.goal, target) > 48 || Math.abs(this.goal[2] - target[2]) > 64;
    if (goalMoved || !this.path || this.time > this.repathAt) this.planPath(target);
    const path = this.path;
    // advance along the path: reached the waypoint, or walked past it along the segment
    while (this.pathIdx < path.length - 1) {
      const pt = path[this.pathIdx], nx = path[this.pathIdx + 1];
      const prev = this.pathIdx > 0 ? path[this.pathIdx - 1] : this.pathStart;
      const dz = pt[2] - feet[2];
      const d = dist2(feet, pt);
      const passed = d < 64 && nx[3] === 'walk' && pt[3] === 'walk' && Math.abs(nx[2] - feet[2]) < 40 &&
        (feet[0] - pt[0]) * (pt[0] - prev[0]) + (feet[1] - pt[1]) * (pt[1] - prev[1]) > 0;
      if ((d < 22 && dz < 40 && dz > -90) || passed) this.pathIdx++;
      else break;
    }
    let pt = path[this.pathIdx];
    if (pt[2] - feet[2] > 60 && p.pm.onground && this.time > this.replanBelow) {
      this.replanBelow = this.time + 1;
      this.planPath(target);
      return this.navigate(target, cmd, it);
    }
    pt = this.path[this.pathIdx];
    const last = this.pathIdx >= this.path.length - 1;
    let dx = pt[0] - feet[0], dy = pt[1] - feet[1];
    let d = Math.hypot(dx, dy);
    if (last && d < (it.tol ?? 24)) { this.navMoving = false; this.trackStuck(false); this.counterStrafe(cmd, 1); this.pathLook = null; return true; }
    this.navMoving = true;
    // stay on the planned (collision-checked) segment: steer back onto it when off it
    const prev = this.pathIdx > 0 ? path[this.pathIdx - 1] : this.pathStart;
    const segx = pt[0] - prev[0], segy = pt[1] - prev[1], sl = Math.hypot(segx, segy);
    if (sl > 24 && pt[3] === 'walk') {
      const t = clamp(((feet[0] - prev[0]) * segx + (feet[1] - prev[1]) * segy) / (sl * sl), 0, 1);
      const px = prev[0] + segx * t, py = prev[1] + segy * t;
      if (Math.hypot(feet[0] - px, feet[1] - py) > 6) {
        const ahead = Math.min(1, t + 40 / sl);
        dx = prev[0] + segx * ahead - feet[0]; dy = prev[1] + segy * ahead - feet[1];
        d = Math.hypot(dx, dy);
      }
    }
    let mx = dx / (d || 1), my = dy / (d || 1);
    // keep clear of teammates (separation + sidestep around a blocker; in a
    // doorway the higher id backs off for a moment)
    let sx = 0, sy = 0;
    const speed2 = Math.hypot(p.pm.velocity[0], p.pm.velocity[1]);
    for (const q of g.players) {
      if (q === p || !q.alive || q.team !== p.team) continue;
      const ox = q.pm.origin[0] - p.pm.origin[0], oy = q.pm.origin[1] - p.pm.origin[1];
      const od = Math.hypot(ox, oy);
      if (od > 80 || Math.abs(q.pm.origin[2] - p.pm.origin[2]) > 64 || od < 1) continue;
      const w = (80 - od) / 80;
      sx -= ox / od * w * 0.7; sy -= oy / od * w * 0.7;
      const ahead = (ox * mx + oy * my) / od;
      if (ahead > 0.5 && od < 64) {
        const side = p.id < q.id ? 1 : -1;
        sx += -my * side * w; sy += mx * side * w;
      }
      if (od < 56 && ahead > -0.2 && speed2 < 60 && this.time - this.progT > 0.5) {
        // blocked by a teammate: close to a hold spot is good enough (never for a
        // waypoint or a plant spot); else the one without right of way steps
        // aside for a moment (the bomb carrier first, then the lowest id)
        const gd = dist2(feet, target);
        if (gd < 220 && it.final && Math.hypot(q.pm.velocity[0], q.pm.velocity[1]) < 40) { this.nearEnough = { pos: target.slice(), until: this.time + 4 }; this.navMoving = false; this.counterStrafe(cmd, 1); return true; }
        const mine = (p.weapons[5] ? 1000 : 0) - p.id, theirs = (q.weapons[5] ? 1000 : 0) - q.id;
        if (mine < theirs && this.time > this.yieldUntil + 1.2) { this.yieldUntil = this.time + rand(0.5, 0.9); this.yieldDir = [-ox / od, -oy / od]; }
      }
    }
    if (sx || sy) { mx += sx; my += sy; const l = Math.hypot(mx, my) || 1; mx /= l; my /= l; }
    if (this.time < this.yieldUntil && this.yieldDir) {
      // step away from the blocker, sideways to our own path
      const yx = this.yieldDir[0] - my * 0.6, yy = this.yieldDir[1] + mx * 0.6, yl = Math.hypot(yx, yy) || 1;
      mx = yx / yl; my = yy / yl;
    }
    // unstuck side step
    if (this.time < this.sideStep) { const s = this.sideDir || 1; const ox = mx; mx = mx * 0.4 - my * s; my = my * 0.4 + ox * s; }
    const yaw = p.pm.angles[1] * DEG;
    const fx = Math.cos(yaw), fy = Math.sin(yaw);
    const rx = Math.sin(yaw), ry = -Math.cos(yaw);
    const speed = 400;
    cmd.forwardmove += (mx * fx + my * fy) * speed;
    cmd.sidemove += (mx * rx + my * ry) * speed;
    // jump edges: jump and crouch in the air
    if (pt[3] === 'jump' && d < 48 && pt[2] - feet[2] > 12) it.jump = true;
    // look ahead along the path at head height
    const ahead = path[Math.min(this.pathIdx + 1, path.length - 1)];
    const la = d > 220 || last ? pt : ahead;
    this.pathLook = [la[0], la[1], Math.max(la[2], feet[2] - 40) + EYE];
    this.trackStuck(true, feet);
    if (this.stuckJump) { it.jump = true; this.stuckJump = false; }
    return false;
  }

  planPath(target) {
    const nav = this.game.nav, p = this.p;
    const feet = p.feet(_feet);
    this.goal = target.slice();
    this.repathAt = this.time + 7 + Math.random() * 3;
    const a = nav.nearest(feet, 200) || nav.nearestXY(feet, 260, 90);
    const b = nav.nearestXY(target, 260, 140) || nav.nearest(target, 300);
    const now = this.time;
    const bad = this.badNodes;
    const avoid = bad.size ? (m) => { for (const [id, t] of bad) { if (now - t > 8) { bad.delete(id); continue; } const n = nav.nodes[id]; if (Math.abs(n.x - m.x) < 48 && Math.abs(n.y - m.y) < 48) return 600; } return 0; } : null;
    const raw = a && b ? nav.findPath(a, b, { avoid }) : null;
    const pts = raw ? nav.smooth(raw, feet) : null;
    this.path = pts && pts.length ? pts : [[target[0], target[1], target[2], 'walk']];
    this.pathStart = feet.slice();
    const lp = this.path[this.path.length - 1];
    if (dist2(lp, target) > 12 && Math.abs(lp[2] - target[2]) < 40) this.path.push([target[0], target[1], target[2], 'walk']);
    this.pathIdx = 0;
  }

  // progress watchdog: jump (unless a teammate is the obstacle), side-step,
  // re-path avoiding the spot, wander a little
  trackStuck(moving, feet) {
    if (!moving || this.p.planting || this.p.defusing) { this.progT = this.time; this.progPos = null; this.stuckLevel = 0; return; }
    if (!this.progPos || dist2(feet, this.progPos) > 24 || Math.abs(feet[2] - this.progPos[2]) > 52) {
      this.progPos = feet.slice(); this.progT = this.time; this.stuckLevel = 0;
      return;
    }
    if (this.time < this.stuckGrace) return; // landing slowdown after a jump
    const s = this.time - this.progT;
    if (s > 0.9 && this.stuckLevel < 1) {
      this.stuckLevel = 1;
      const mate = this.game.players.some((q) => q !== this.p && q.alive && q.team === this.p.team && dist2(q.pm.origin, this.p.pm.origin) < 70);
      if (!mate && this.time - this.lastStuckJump > 2) { this.stuckJump = true; this.lastStuckJump = this.time; this.stuckGrace = this.time + 1.2; }
    }
    if (s > 1.6 && this.stuckLevel < 2) { this.stuckLevel = 2; this.sideStep = this.time + 0.5; this.sideDir = Math.random() < 0.5 ? -1 : 1; }
    if (s > 2.5 && this.stuckLevel < 3) {
      this.stuckLevel = 3;
      this.mgr.stats.stuck++;
      const pt = this.path?.[this.pathIdx];
      if (pt && pt[4] != null) this.badNodes.set(pt[4], this.time);
      this.path = null;
      this.stuckJump = true;
    }
    if (s > 4 && this.stuckLevel < 4) {
      this.stuckLevel = 4;
      const nav = this.game.nav;
      const around = nav.around(nav.nearest(feet, 200), 300, 120).filter((x) => x.dist > 100);
      if (around.length) { const n = pick(around).node; this.wander = { pos: [n.x, n.y, n.z], until: this.time + 1.5 }; this.path = null; }
    }
    if (s > 7) { this.progT = this.time; this.stuckLevel = 0; }
  }

  // brake: push against the current velocity (counter-strafe)
  counterStrafe(cmd, k = 1) {
    const p = this.p, v = p.pm.velocity;
    const sp = Math.hypot(v[0], v[1]);
    if (sp < 25) return;
    const yaw = p.pm.angles[1] * DEG;
    const mx = -v[0] / sp, my = -v[1] / sp;
    const f = mx * Math.cos(yaw) + my * Math.sin(yaw), s = mx * Math.sin(yaw) - my * Math.cos(yaw);
    cmd.forwardmove = f * 400 * k;
    cmd.sidemove = s * 400 * k;
  }

  applyStrafe(cmd, dir) {
    cmd.sidemove = 400 * dir;
    if (!this.it.move) cmd.forwardmove = 0;
  }
}
