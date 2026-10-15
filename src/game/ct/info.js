// Chinatown content tables: sprite names, states, thing types and sounds for
// the nmo_chinatown rebuild (tools/ct/SPEC.md sections 3 and 4), in the same
// shapes as info.js. install.js appends them to the DOOM tables before
// tables.js compiles those, so the original indices never move: every DOOM
// sprite, state, thing and sound keeps its number and Chinatown's come after.
//
// Pure data (plus the generators below), safe to import from Node tools.

import { FF_FULLBRIGHT } from '../info.js';

// The custom map this content belongs to.
export const CT_MAP = 'CHINATWN';

// Wall textures and flats whose names start with these render fullbright
// (neon signs, light panels).
export const FULLBRIGHT_TEXTURE_PREFIX = 'CTN';
export const FULLBRIGHT_FLAT_PREFIX = 'CFN';

// Animated flats, cycled like ANIMDEFS (kept out of data.js so its counts stay
// those of the original animdefs[]).
export const CT_ANIMDEFS = [
  { istexture: false, endname: 'CFSEW3', startname: 'CFSEW1', speed: 8 },
  { istexture: false, endname: 'CFBAY3', startname: 'CFBAY1', speed: 8 },
];

// --- Zombies (SPEC section 7) ---------------------------------------------
//
// Speeds are map units per tic as the spec gives them; A_Chase moves
// `info.speed` once per state, so info.speed = speed * tics per run state.
// Frames: A-D walk, E reach, F strike, G pain (all 8 rotations), H-L death
// (rotation 0, L lying). Melee only, so missilestate is S_NULL.
export const CT_ZOMBIES = [
  { spr: 'ZCV1', doomednum: 9000, kind: 'shambler', health: 60, speed: 4, tics: 4, radius: 16, height: 56, painchance: 80, damage: [4, 12] },
  { spr: 'ZCV2', doomednum: 9001, kind: 'shambler', health: 60, speed: 4, tics: 4, radius: 16, height: 56, painchance: 80, damage: [4, 12] },
  { spr: 'ZCV3', doomednum: 9002, kind: 'shambler', health: 60, speed: 4, tics: 4, radius: 16, height: 56, painchance: 80, damage: [4, 12] },
  { spr: 'ZCV4', doomednum: 9003, kind: 'shambler', health: 60, speed: 4, tics: 4, radius: 16, height: 56, painchance: 80, damage: [4, 12] },
  { spr: 'ZRUN', doomednum: 9004, kind: 'runner', health: 40, speed: 13, tics: 2, radius: 16, height: 56, painchance: 120, damage: [4, 12] },
  { spr: 'ZKID', doomednum: 9005, kind: 'kid', health: 25, speed: 11, tics: 2, radius: 12, height: 40, painchance: 160, damage: [3, 9] },
];

// Melee reach (centre to centre against a 16-radius player) and sounds.
const ZOMBIE_REACH = 56;
const ZOMBIE_SOUNDS = {
  shambler: { see: 'zsgrn1', active: 'zsgrn1' },
  runner: { see: 'zrscrm', active: 'zsgrn1' },
  kid: { see: 'zkscrm', active: 'zkscrm' },
};
// Attack timing per kind: reach (E) and strike (F) frame tics.
const ZOMBIE_ATTACK = {
  shambler: { reach: 8, strike: 6, recover: 6 },
  runner: { reach: 5, strike: 4, recover: 4 },
  kid: { reach: 4, strike: 3, recover: 3 },
};

// --- Decorations, markers and items (SPEC section 4) -------------------------
//
// rot: whether the art has 8 rotations (it may be voxelized) or one (0).
// Vehicles are not solid: the map draws a blocking outline around them.
export const CT_DECORATIONS = [
  { spr: 'VPOL', doomednum: 9100, what: 'police car', solid: false, radius: 32, height: 64, rot: 8 },
  { spr: 'VAMB', doomednum: 9101, what: 'ambulance', solid: false, radius: 32, height: 96, rot: 8 },
  { spr: 'VTAX', doomednum: 9102, what: 'taxi', solid: false, radius: 32, height: 64, rot: 8 },
  { spr: 'VVAN', doomednum: 9103, what: 'van', solid: false, radius: 32, height: 88, rot: 8 },
  { spr: 'VPCK', doomednum: 9104, what: 'pickup truck', solid: false, radius: 32, height: 72, rot: 8 },
  { spr: 'VSED', doomednum: 9105, what: 'sedan', solid: false, radius: 32, height: 60, rot: 8 },
  { spr: 'VSUV', doomednum: 9106, what: 'SUV', solid: false, radius: 32, height: 76, rot: 8 },
  { spr: 'VTRK', doomednum: 9107, what: 'box truck', solid: false, radius: 32, height: 120, rot: 8 },
  { spr: 'VFTR', doomednum: 9108, what: 'fire truck', solid: false, radius: 32, height: 120, rot: 8 },
  { spr: 'VGRB', doomednum: 9109, what: 'garbage truck', solid: false, radius: 32, height: 120, rot: 8 },
  { spr: 'VMIL', doomednum: 9110, what: 'military truck', solid: false, radius: 32, height: 96, rot: 8 },
  { spr: 'PBAR', doomednum: 9120, what: 'concrete road barrier', solid: true, radius: 24, height: 32, rot: 8 },
  { spr: 'PSAW', doomednum: 9121, what: 'sawhorse barricade', solid: true, radius: 20, height: 40, rot: 8 },
  { spr: 'PCON', doomednum: 9122, what: 'traffic cone', solid: true, radius: 8, height: 24, rot: 0 },
  { spr: 'PGEN', doomednum: 9123, what: 'generator trailer', solid: false, radius: 32, height: 56, rot: 8 },
  { spr: 'PRAD', doomednum: 9124, what: 'radio on a table', solid: true, radius: 16, height: 48, rot: 8 },
  { spr: 'PWLD', doomednum: 9125, what: 'welding cart', solid: true, radius: 16, height: 48, rot: 8 },
  { spr: 'PTRA', doomednum: 9126, what: 'trash can', solid: true, radius: 12, height: 40, rot: 0 },
  { spr: 'PHYD', doomednum: 9127, what: 'fire hydrant', solid: true, radius: 8, height: 32, rot: 0 },
  { spr: 'PPHN', doomednum: 9128, what: 'payphone', solid: true, radius: 12, height: 72, rot: 8 },
  { spr: 'PBEN', doomednum: 9129, what: 'bench', solid: true, radius: 16, height: 32, rot: 8 },
  { spr: 'PLMP', doomednum: 9130, what: 'street lamp', solid: true, radius: 8, height: 128, rot: 0 },
  // Hangs from the ceiling: its top is info.height above its origin.
  { spr: 'PLNT', doomednum: 9131, what: 'paper lantern', solid: false, hanging: true, bright: true, radius: 8, height: 40, rot: 0 },
  { spr: 'PCRT', doomednum: 9132, what: 'wooden crate', solid: true, radius: 20, height: 40, rot: 0 },
  { spr: 'PPAL', doomednum: 9133, what: 'pallet stack', solid: true, radius: 24, height: 48, rot: 0 },
];

// Key items (objective pickups), in player.keyItems order.
export const CT_KEY_ITEMS = [
  { spr: 'IGAS', doomednum: 9040, name: 'gas', icon: 'CTIGAS', message: 'Picked up a gas can.' },
  { spr: 'IPLG', doomednum: 9041, name: 'plug', icon: 'CTIPLG', message: 'Picked up a power plug.' },
  { spr: 'ITOR', doomednum: 9042, name: 'torch', icon: 'CTITOR', message: 'Picked up a blowtorch.' },
];

// Invisible map markers. The raw THINGS angle (a group id or an order, not
// a direction) stays readable as mobj.spawnpoint.angle.
export const CT_MARKERS = [
  { name: 'MT_CT_ZSPAWN', doomednum: 9010 }, // zombie spawn marker, angle = group id
  { name: 'MT_CT_LADDERTOP', doomednum: 9061 }, // ladder landing destination
  { name: 'MT_CT_HELINODE', doomednum: 9062 }, // helicopter path node, angle = order
];

// --- Sounds (SPEC section 3.4) -----------------------------------------------
// 'radio' is already DOOM II's sfx_radio, so it is not repeated here.
const sfx = (name, priority) => ({ name, singularity: false, priority, link: null, pitch: -1, volume: -1 });
export const CT_SFX_DEFS = [
  sfx('zsgrn1', 98), sfx('zsgrn2', 98), sfx('zsgrn3', 98),
  sfx('zsatk', 70), sfx('zsbite', 70), sfx('zspain', 96),
  sfx('zsdth1', 70), sfx('zsdth2', 70), sfx('zrscrm', 90), sfx('zkscrm', 90),
  sfx('genstr', 60), sfx('genrun', 60), sfx('rollgt', 60), sfx('weld', 60),
  sfx('crank', 60), sfx('heli', 60), sfx('glasbk', 60), sfx('woodbk', 60),
  sfx('chainb', 60), sfx('splash', 60), sfx('ladder', 60), sfx('plugin', 60),
];

// Actions the Chinatown states use beyond the original ACTION_NAMES.
export const CT_ACTION_NAMES = ['A_ZombieAttack'];

// --- Table generation ----------------------------------------------------------

const mobj = (o) => ({
  name: o.name,
  doomednum: o.doomednum ?? -1,
  spawnstate: o.spawnstate,
  spawnhealth: o.spawnhealth ?? 1000,
  seestate: o.seestate || 'S_NULL',
  seesound: o.seesound || null,
  reactiontime: 8,
  attacksound: o.attacksound || null,
  painstate: o.painstate || 'S_NULL',
  painchance: o.painchance || 0,
  painsound: o.painsound || null,
  meleestate: o.meleestate || 'S_NULL',
  missilestate: 'S_NULL',
  deathstate: o.deathstate || 'S_NULL',
  xdeathstate: 'S_NULL',
  deathsound: o.deathsound || null,
  speed: o.speed || 0,
  radius: o.radius ?? 20,
  height: o.height ?? 16,
  mass: o.mass ?? 100,
  damage: 0,
  activesound: o.activesound || null,
  flags: o.flags || [],
  raisestate: 'S_NULL',
  // Chinatown-only behaviour (MOBJINFO[type].ct): zombie melee etc.
  ...(o.ct ? { ct: o.ct } : {}),
});

const A = 0, B = 1, C = 2, D = 3, E = 4, F = 5, G = 6, H = 7, I = 8, J = 9, K = 10, L = 11;

function zombieTables(z) {
  const p = z.spr;
  const s = (n) => `S_${p}_${n}`;
  const t = z.tics;
  const atk = ZOMBIE_ATTACK[z.kind];
  const states = [
    [s('STND'), p, A, 10, 'A_Look', s('STND2'), 0, 0],
    [s('STND2'), p, B, 10, 'A_Look', s('STND'), 0, 0],
  ];
  const walk = [A, A, B, B, C, C, D, D];
  walk.forEach((f, i) => states.push([s(`RUN${i + 1}`), p, f, t, 'A_Chase', s(`RUN${((i + 1) % 8) + 1}`), 0, 0]));
  states.push(
    [s('ATK1'), p, E, atk.reach, 'A_FaceTarget', s('ATK2'), 0, 0],
    [s('ATK2'), p, F, atk.strike, 'A_ZombieAttack', s('ATK3'), 0, 0],
    [s('ATK3'), p, F, atk.recover, null, s('RUN1'), 0, 0],
    [s('PAIN'), p, G, 3, null, s('PAIN2'), 0, 0],
    [s('PAIN2'), p, G, 3, 'A_Pain', s('RUN1'), 0, 0],
    [s('DIE1'), p, H, 5, null, s('DIE2'), 0, 0],
    [s('DIE2'), p, I, 5, 'A_Scream', s('DIE3'), 0, 0],
    [s('DIE3'), p, J, 5, 'A_Fall', s('DIE4'), 0, 0],
    [s('DIE4'), p, K, 5, null, s('DIE5'), 0, 0],
    [s('DIE5'), p, L, -1, null, 'S_NULL', 0, 0],
  );
  const snd = ZOMBIE_SOUNDS[z.kind];
  const def = mobj({
    name: `MT_CT_${p}`,
    doomednum: z.doomednum,
    spawnstate: s('STND'),
    spawnhealth: z.health,
    seestate: s('RUN1'),
    seesound: snd.see,
    attacksound: 'zsatk',
    painstate: s('PAIN'),
    painchance: z.painchance,
    painsound: 'zspain',
    meleestate: s('ATK1'),
    deathstate: s('DIE1'),
    deathsound: 'zsdth1',
    speed: z.speed * t,
    radius: z.radius,
    height: z.height,
    activesound: snd.active,
    flags: ['MF_SOLID', 'MF_SHOOTABLE', 'MF_COUNTKILL'],
    ct: { zombie: z.kind, reach: ZOMBIE_REACH, damage: z.damage },
  });
  return { states, def };
}

function build() {
  const sprnames = [];
  const states = [];
  const mobjs = [];
  for (const z of CT_ZOMBIES) {
    sprnames.push(z.spr);
    const t = zombieTables(z);
    states.push(...t.states);
    mobjs.push(t.def);
  }
  for (const m of CT_MARKERS) {
    mobjs.push(mobj({ name: m.name, doomednum: m.doomednum, spawnstate: 'S_NULL', flags: ['MF_NOBLOCKMAP', 'MF_NOSECTOR'] }));
  }
  for (const it of CT_KEY_ITEMS) {
    sprnames.push(it.spr);
    states.push([`S_CT_${it.spr}`, it.spr, A, -1, null, 'S_NULL', 0, 0]);
    mobjs.push(mobj({ name: `MT_CT_${it.spr}`, doomednum: it.doomednum, spawnstate: `S_CT_${it.spr}`, flags: ['MF_SPECIAL'] }));
  }
  for (const d of CT_DECORATIONS) {
    sprnames.push(d.spr);
    states.push([`S_CT_${d.spr}`, d.spr, A | (d.bright ? FF_FULLBRIGHT : 0), -1, null, 'S_NULL', 0, 0]);
    const flags = [];
    if (d.solid) flags.push('MF_SOLID');
    if (d.hanging) flags.push('MF_SPAWNCEILING', 'MF_NOGRAVITY');
    mobjs.push(mobj({ name: `MT_CT_${d.spr}`, doomednum: d.doomednum, spawnstate: `S_CT_${d.spr}`, radius: d.radius, height: d.height, flags }));
  }
  // The rescue helicopter: spawned and flown by the map script (no
  // doomednum); frames A and B alternate the rotor blur. Drawn fullbright
  // (its lights on), so it reads as the way out over the dark bay.
  sprnames.push('VHEL');
  states.push(
    ['S_CT_VHEL', 'VHEL', A | FF_FULLBRIGHT, 2, null, 'S_CT_VHEL2', 0, 0],
    ['S_CT_VHEL2', 'VHEL', B | FF_FULLBRIGHT, 2, null, 'S_CT_VHEL', 0, 0],
  );
  mobjs.push(mobj({ name: 'MT_CT_VHEL', spawnstate: 'S_CT_VHEL', radius: 64, height: 96, flags: ['MF_NOBLOCKMAP', 'MF_NOGRAVITY'] }));
  return { sprnames, states, mobjs };
}

const tables = build();
export const CT_SPRNAMES = tables.sprnames;
export const CT_STATE_DEFS = tables.states;
export const CT_MOBJ_DEFS = tables.mobjs;
