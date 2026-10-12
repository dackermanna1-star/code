#!/usr/bin/env node
// Validates src/game/info.js and src/game/data.js: table sizes, cross
// references, a set of well-known values from the original source, and that the
// sprite frames / textures / lumps the tables reference exist in the bundled WADs.
//
// Usage: node tools/check-info.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import * as info from '../src/game/info.js';
import * as data from '../src/game/data.js';
import { Wad, WadStack } from '../src/wad/wad.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const notes = [];
let checks = 0;

function check(cond, msg) {
  checks++;
  if (!cond) errors.push(msg);
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(a === e, `${msg}: expected ${e}, got ${a}`);
}

const {
  SPRNAMES, STATE_DEFS, MOBJ_DEFS, SFX_DEFS, MUSIC_NAMES, WEAPON_DEFS, ACTION_NAMES,
  AMMO_TYPES, MAX_AMMO, CLIP_AMMO, MF, FF_FULLBRIGHT, FF_FRAMEMASK,
} = info;

// ---------------------------------------------------------------- counts
eq(SPRNAMES.length, 138, 'NUMSPRITES');
eq(STATE_DEFS.length, 967, 'NUMSTATES');
eq(MOBJ_DEFS.length, 137, 'NUMMOBJTYPES');
eq(SFX_DEFS.length, 109, 'NUMSFX');
eq(MUSIC_NAMES.length, 68, 'NUMMUSIC');
eq(WEAPON_DEFS.length, 9, 'NUMWEAPONS');
eq([FF_FULLBRIGHT, FF_FRAMEMASK], [0x8000, 0x7fff], 'frame flags');

// ---------------------------------------------------------------- states
const stateIndex = new Map();
STATE_DEFS.forEach((s, i) => {
  check(Array.isArray(s) && s.length === 8, `state ${i} malformed`);
  check(!stateIndex.has(s[0]), `duplicate state name ${s[0]}`);
  stateIndex.set(s[0], i);
});
const sprSet = new Set(SPRNAMES);
check(sprSet.size === SPRNAMES.length, 'duplicate sprite names');
for (const n of SPRNAMES) check(/^[A-Z0-9]{4}$/.test(n), `bad sprite name ${n}`);
const actionSet = new Set(ACTION_NAMES);
check(actionSet.size === ACTION_NAMES.length, 'duplicate ACTION_NAMES');
const usedActions = new Set();
for (const [name, spr, frame, tics, action, next, misc1, misc2] of STATE_DEFS) {
  check(sprSet.has(spr), `${name}: unknown sprite ${spr}`);
  check(Number.isInteger(frame) && (frame & ~(FF_FULLBRIGHT | FF_FRAMEMASK)) === 0, `${name}: bad frame ${frame}`);
  check((frame & FF_FRAMEMASK) < 29, `${name}: frame index ${frame & FF_FRAMEMASK} out of range`);
  check(Number.isInteger(tics) && tics >= -1, `${name}: bad tics ${tics}`);
  check(action === null || actionSet.has(action), `${name}: unknown action ${action}`);
  if (action) usedActions.add(action);
  check(stateIndex.has(next), `${name}: nextstate ${next} does not exist`);
  check(misc1 === 0 && misc2 === 0, `${name}: unexpected misc values`);
}
for (const a of ACTION_NAMES) check(usedActions.has(a), `ACTION_NAMES entry ${a} is never used`);
eq(STATE_DEFS[0], ['S_NULL', 'TROO', 0, -1, null, 'S_NULL', 0, 0], 'S_NULL');

// ---------------------------------------------------------------- mobjs
const stateFields = ['spawnstate', 'seestate', 'painstate', 'meleestate', 'missilestate',
  'deathstate', 'xdeathstate', 'raisestate'];
const soundFields = ['seesound', 'attacksound', 'painsound', 'deathsound', 'activesound'];
const mobjFields = ['name', 'doomednum', 'spawnstate', 'spawnhealth', 'seestate', 'seesound',
  'reactiontime', 'attacksound', 'painstate', 'painchance', 'painsound', 'meleestate',
  'missilestate', 'deathstate', 'xdeathstate', 'deathsound', 'speed', 'radius', 'height', 'mass',
  'damage', 'activesound', 'flags', 'raisestate'];
const sfxNames = new Set(SFX_DEFS.slice(1).map((s) => s.name));
const mobjByName = new Map();
const doomednums = new Map();
for (const m of MOBJ_DEFS) {
  eq(Object.keys(m), mobjFields, `${m.name} fields`);
  check(!mobjByName.has(m.name), `duplicate mobj ${m.name}`);
  mobjByName.set(m.name, m);
  for (const f of stateFields) check(stateIndex.has(m[f]), `${m.name}.${f}: unknown state ${m[f]}`);
  for (const f of soundFields) check(m[f] === null || sfxNames.has(m[f]), `${m.name}.${f}: unknown sound ${m[f]}`);
  for (const f of m.flags) check(f.startsWith('MF_') && f.slice(3) in MF, `${m.name}: unknown flag ${f}`);
  if (m.doomednum !== -1) {
    check(!doomednums.has(m.doomednum), `${m.name}: duplicate doomednum ${m.doomednum}`);
    doomednums.set(m.doomednum, m.name);
  }
  // Every missile (and only missiles) had a FRACUNIT speed in info.c.
  if (m.flags.includes('MF_MISSILE')) check(m.speed > 0, `${m.name}: missile without speed`);
}
eq(MOBJ_DEFS[0].name, 'MT_PLAYER', 'first mobj');
eq(MOBJ_DEFS[136].name, 'MT_MISC86', 'last mobj');

// ---------------------------------------------------------------- sounds / music / weapons
eq(SFX_DEFS[0].name, null, 'sfx_None');
for (const s of SFX_DEFS.slice(1)) {
  eq(Object.keys(s), ['name', 'singularity', 'priority', 'link', 'pitch', 'volume'], `sfx ${s.name} fields`);
  check(s.link === null || sfxNames.has(s.link), `sfx ${s.name}: unknown link ${s.link}`);
}
eq(SFX_DEFS.find((s) => s.name === 'chgun'), { name: 'chgun', singularity: false, priority: 64, link: 'pistol', pitch: 150, volume: 0 }, 'sfx chgun');
eq(MUSIC_NAMES[0], null, 'mus_None');
eq([MUSIC_NAMES[1], MUSIC_NAMES[28], MUSIC_NAMES[33], MUSIC_NAMES[67]], ['e1m1', 'inter', 'runnin', 'dm2int'], 'music names');
eq(AMMO_TYPES, ['am_clip', 'am_shell', 'am_cell', 'am_misl'], 'ammo types');
eq(MAX_AMMO, [200, 50, 300, 50], 'maxammo');
eq(CLIP_AMMO, [10, 4, 20, 1], 'clipammo');
for (const w of WEAPON_DEFS) {
  check(w.ammo === 'am_noammo' || AMMO_TYPES.includes(w.ammo), `${w.name}: bad ammo ${w.ammo}`);
  for (const f of ['upstate', 'downstate', 'readystate', 'atkstate', 'flashstate']) {
    check(stateIndex.has(w[f]), `${w.name}.${f}: unknown state ${w[f]}`);
  }
}
eq(WEAPON_DEFS.map((w) => w.name), ['wp_fist', 'wp_pistol', 'wp_shotgun', 'wp_chaingun', 'wp_missile',
  'wp_plasma', 'wp_bfg', 'wp_chainsaw', 'wp_supershotgun'], 'weapon order');
eq(MF, {
  SPECIAL: 0x1, SOLID: 0x2, SHOOTABLE: 0x4, NOSECTOR: 0x8, NOBLOCKMAP: 0x10, AMBUSH: 0x20,
  JUSTHIT: 0x40, JUSTATTACKED: 0x80, SPAWNCEILING: 0x100, NOGRAVITY: 0x200, DROPOFF: 0x400,
  PICKUP: 0x800, NOCLIP: 0x1000, SLIDE: 0x2000, FLOAT: 0x4000, TELEPORT: 0x8000, MISSILE: 0x10000,
  DROPPED: 0x20000, SHADOW: 0x40000, NOBLOOD: 0x80000, CORPSE: 0x100000, INFLOAT: 0x200000,
  COUNTKILL: 0x400000, COUNTITEM: 0x800000, SKULLFLY: 0x1000000, NOTDMATCH: 0x2000000,
  TRANSLATION: 0xc000000, TRANSSHIFT: 26,
}, 'MF');

// ---------------------------------------------------------------- spot checks (info.c)
const st = (name) => STATE_DEFS[stateIndex.get(name)];
const FB = FF_FULLBRIGHT;
const stateSpots = [
  ['S_LIGHTDONE', 'SHTG', 4, 0, 'A_Light0', 'S_NULL'],
  ['S_PUNCH2', 'PUNG', 2, 4, 'A_Punch', 'S_PUNCH3'],
  ['S_PISTOL1', 'PISG', 0, 4, null, 'S_PISTOL2'],
  ['S_PISTOL2', 'PISG', 1, 6, 'A_FirePistol', 'S_PISTOL3'],
  ['S_PISTOL4', 'PISG', 1, 5, 'A_ReFire', 'S_PISTOL'],
  ['S_PISTOLFLASH', 'PISF', 0 | FB, 7, 'A_Light1', 'S_LIGHTDONE'],
  ['S_SGUN1', 'SHTG', 0, 3, null, 'S_SGUN2'],
  ['S_SGUN2', 'SHTG', 0, 7, 'A_FireShotgun', 'S_SGUN3'],
  ['S_SGUN9', 'SHTG', 0, 7, 'A_ReFire', 'S_SGUN'],
  ['S_DSGUN2', 'SHT2', 0, 7, 'A_FireShotgun2', 'S_DSGUN3'],
  ['S_CHAIN1', 'CHGG', 0, 4, 'A_FireCGun', 'S_CHAIN2'],
  ['S_CHAIN3', 'CHGG', 1, 0, 'A_ReFire', 'S_CHAIN'],
  ['S_MISSILE2', 'MISG', 1, 12, 'A_FireMissile', 'S_MISSILE3'],
  ['S_PLASMA1', 'PLSG', 0, 3, 'A_FirePlasma', 'S_PLASMA2'],
  ['S_PLASMA2', 'PLSG', 1, 20, 'A_ReFire', 'S_PLASMA'],
  ['S_BFG1', 'BFGG', 0, 20, 'A_BFGsound', 'S_BFG2'],
  ['S_BFG3', 'BFGG', 1, 10, 'A_FireBFG', 'S_BFG4'],
  ['S_SAW', 'SAWG', 2, 4, 'A_WeaponReady', 'S_SAWB'],
  ['S_PLAY_ATK2', 'PLAY', 5 | FB, 6, null, 'S_PLAY_ATK1'],
  ['S_TROO_STND', 'TROO', 0, 10, 'A_Look', 'S_TROO_STND2'],
  ['S_TROO_RUN1', 'TROO', 0, 3, 'A_Chase', 'S_TROO_RUN2'],
  ['S_TROO_ATK3', 'TROO', 6, 6, 'A_TroopAttack', 'S_TROO_RUN1'],
  ['S_ROCKET', 'MISL', 0 | FB, 1, null, 'S_ROCKET'],
  ['S_TECH2LAMP4', 'TLP2', 3 | FB, 4, null, 'S_TECH2LAMP'],
];
for (const [name, spr, frame, tics, action, next] of stateSpots) {
  const s = st(name);
  eq(s && [s[1], s[2], s[3], s[4], s[5]], [spr, frame, tics, action, next], `spot ${name}`);
}
const mobjSpots = {
  MT_PLAYER: { radius: 16, height: 56, spawnhealth: 100, painchance: 255, mass: 100 },
  MT_POSSESSED: { doomednum: 3004, spawnhealth: 20, painchance: 200, speed: 8, attacksound: 'pistol' },
  MT_SHOTGUY: { doomednum: 9, spawnhealth: 30, painchance: 170 },
  MT_CHAINGUY: { doomednum: 65, spawnhealth: 70, painchance: 170 },
  MT_TROOP: { doomednum: 3001, speed: 8, radius: 20, height: 56, spawnhealth: 60, painchance: 200, seesound: 'bgsit1' },
  MT_SERGEANT: { doomednum: 3002, spawnhealth: 150, speed: 10, radius: 30, mass: 400, painchance: 180 },
  MT_HEAD: { doomednum: 3005, spawnhealth: 400, radius: 31, painchance: 128 },
  MT_BRUISER: { doomednum: 3003, spawnhealth: 1000, painchance: 50, radius: 24, height: 64, mass: 1000 },
  MT_KNIGHT: { doomednum: 69, spawnhealth: 500, painchance: 50 },
  MT_SKULL: { doomednum: 3006, spawnhealth: 100, damage: 3, mass: 50, painchance: 256 },
  MT_CYBORG: { doomednum: 16, spawnhealth: 4000, radius: 40, height: 110, speed: 16, painchance: 20 },
  MT_SPIDER: { doomednum: 7, spawnhealth: 3000, radius: 128, height: 100, speed: 12, painchance: 40 },
  MT_VILE: { doomednum: 64, spawnhealth: 700, speed: 15, painchance: 10, mass: 500 },
  MT_UNDEAD: { doomednum: 66, spawnhealth: 300, speed: 10, painchance: 100 },
  MT_FATSO: { doomednum: 67, spawnhealth: 600, radius: 48, height: 64, painchance: 80 },
  MT_BABY: { doomednum: 68, spawnhealth: 500, radius: 64, speed: 12, mass: 600 },
  MT_PAIN: { doomednum: 71, spawnhealth: 400, painchance: 128 },
  MT_ROCKET: { speed: 20, damage: 20, radius: 11, height: 8 },
  MT_PLASMA: { speed: 25, damage: 5, radius: 13, height: 8 },
  MT_BFG: { speed: 25, damage: 100, radius: 13, height: 8 },
  MT_TROOPSHOT: { speed: 10, damage: 3 },
  MT_HEADSHOT: { speed: 10, damage: 5 },
  MT_BRUISERSHOT: { speed: 15, damage: 8 },
  MT_TRACER: { speed: 10, damage: 10 },
  MT_BARREL: { doomednum: 2035, spawnhealth: 20, radius: 10, height: 42 },
};
for (const [name, fields] of Object.entries(mobjSpots)) {
  const m = mobjByName.get(name);
  for (const [k, v] of Object.entries(fields)) eq(m && m[k], v, `spot ${name}.${k}`);
}
eq(doomednums.get(2001), 'MT_SHOTGUN', 'doomednum 2001');
eq(doomednums.get(1), undefined, 'player starts are not mobj types');

// ---------------------------------------------------------------- data.js
const {
  ANIMDEFS, SWITCHES, LEVEL_NAMES, PAR_TIMES, FINALE, INTERMISSION, CAST, CHEATS,
  QUIT_MESSAGES, STRINGS, RNDTABLE,
} = data;
eq(ANIMDEFS.length, 22, 'animdefs count');
eq(ANIMDEFS[0], { istexture: false, endname: 'NUKAGE3', startname: 'NUKAGE1', speed: 8 }, 'animdefs[0]');
eq(SWITCHES.length, 40, 'switch count');
eq([1, 2, 3].map((e) => SWITCHES.filter((s) => s.episode === e).length), [19, 10, 11], 'switches per episode');
eq(Object.keys(LEVEL_NAMES.doom).length, 36, 'doom level names');
eq(Object.keys(LEVEL_NAMES.doom2).length, 32, 'doom2 level names');
eq(LEVEL_NAMES.doom.E1M1, 'E1M1: Hangar', 'E1M1 name');
eq(LEVEL_NAMES.doom2.MAP01, 'level 1: entryway', 'MAP01 name');
eq(Object.keys(PAR_TIMES.doom).length, 36, 'doom par count');
eq(Object.keys(PAR_TIMES.doom2).length, 32, 'doom2 par count');
eq([PAR_TIMES.doom.E1M1, PAR_TIMES.doom.E2M6, PAR_TIMES.doom.E3M9, PAR_TIMES.doom2.MAP17, PAR_TIMES.doom2.MAP32],
  [30, 360, 135, 420, 30], 'par spot checks');
eq(Object.keys(FINALE.doom), ['e1', 'e2', 'e3', 'e4'], 'doom finales');
eq(Object.values(FINALE.doom).map((f) => f.flat), ['FLOOR4_8', 'SFLR6_1', 'MFLR8_4', 'MFLR8_3'], 'doom finale flats');
eq(Object.values(FINALE.doom2).map((f) => f.afterMap), [6, 11, 20, 30, 15, 31], 'doom2 finale maps');
for (const mission of ['doom', 'doom2', 'tnt', 'plutonia']) {
  for (const [k, f] of Object.entries(FINALE[mission])) {
    check(typeof f.text === 'string' && f.text.length > 50, `FINALE.${mission}.${k} text missing`);
  }
}
check(FINALE.doom.e1.text.startsWith('Once you beat the big badasses and\nclean out'), 'E1TEXT start');
eq(INTERMISSION.lnodes.map((e) => e.length), [9, 9, 9], 'lnodes shape');
eq(INTERMISSION.anims.map((e) => e.length), [10, 9, 6], 'anims shape');
eq(INTERMISSION.lnodes[0][0], { x: 185, y: 164 }, 'lnodes[0][0]');
eq(CAST.length, 17, 'cast count');
for (const c of CAST) check(mobjByName.has(c.type), `cast: unknown type ${c.type}`);
eq(CHEATS.god.seq, 'iddqd', 'iddqd');
eq(CHEATS.powerup.map((p) => p.seq), ['idbeholdv', 'idbeholds', 'idbeholdi', 'idbeholdr', 'idbeholda', 'idbeholdl', 'idbehold'], 'idbehold');
eq([CHEATS.clev.seq, CHEATS.clev.params, CHEATS.mus.params, CHEATS.amap.seq], ['idclev', 2, 2, 'iddt'], 'param cheats');
eq([QUIT_MESSAGES.doom.length, QUIT_MESSAGES.doom2.length], [8, 8], 'quit messages');
eq(RNDTABLE.length, 256, 'rndtable length');
check(RNDTABLE.every((v) => Number.isInteger(v) && v >= 0 && v <= 255), 'rndtable range');
eq(RNDTABLE.slice(0, 10), [0, 8, 109, 220, 222, 241, 149, 107, 75, 248], 'rndtable head');
eq(RNDTABLE.slice(-4), [120, 163, 236, 249], 'rndtable tail');
eq(RNDTABLE.reduce((a, b) => a + b, 0), 32986, 'rndtable sum');
const requiredStrings = ['GOTARMOR', 'GOTMEGA', 'GOTHTHBONUS', 'GOTARMBONUS', 'GOTSTIM', 'GOTMEDINEED',
  'GOTMEDIKIT', 'GOTSUPER', 'GOTBLUECARD', 'GOTYELWCARD', 'GOTREDCARD', 'GOTBLUESKUL', 'GOTYELWSKUL',
  'GOTREDSKULL', 'GOTINVUL', 'GOTBERSERK', 'GOTINVIS', 'GOTSUIT', 'GOTMAP', 'GOTVISOR', 'GOTMSPHERE',
  'GOTCLIP', 'GOTCLIPBOX', 'GOTROCKET', 'GOTROCKBOX', 'GOTCELL', 'GOTCELLBOX', 'GOTSHELLS',
  'GOTSHELLBOX', 'GOTBACKPACK', 'GOTBFG9000', 'GOTCHAINGUN', 'GOTCHAINSAW', 'GOTLAUNCHER',
  'GOTPLASMA', 'GOTSHOTGUN', 'GOTSHOTGUN2', 'PD_BLUEO', 'PD_REDO', 'PD_YELLOWO', 'PD_BLUEK',
  'PD_REDK', 'PD_YELLOWK', 'STSTR_MUS', 'STSTR_NOMUS', 'STSTR_DQDON', 'STSTR_DQDOFF',
  'STSTR_KFAADDED', 'STSTR_FAADDED', 'STSTR_NCON', 'STSTR_NCOFF', 'STSTR_BEHOLD', 'STSTR_BEHOLDX',
  'STSTR_CHOPPERS', 'STSTR_CLEV', 'NIGHTMARE', 'QUITMSG', 'DOSY', 'PRESSKEY', 'PRESSYN', 'ENDGAME',
  'GGSAVED', 'MSGON', 'MSGOFF', 'E1TEXT', 'E2TEXT', 'E3TEXT', 'E4TEXT', 'C1TEXT', 'C2TEXT', 'C3TEXT',
  'C4TEXT', 'C5TEXT', 'C6TEXT', 'CC_ZOMBIE', 'CC_HERO', 'HUSTR_MSGU', 'AMSTR_FOLLOWON'];
for (const k of requiredStrings) check(typeof STRINGS[k] === 'string' && STRINGS[k].length > 0, `STRINGS.${k} missing`);
eq(STRINGS.NIGHTMARE, "are you sure? this skill level\nisn't even remotely fair.\n\npress y or n.", 'NIGHTMARE');

// ---------------------------------------------------------------- WAD cross-checks
function loadWad(file) {
  const buf = readFileSync(path.join(root, 'assets', 'wads', file));
  return new Wad(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), file);
}
const doom1 = loadWad('doom1.wad');
const extras = loadWad('doomx-extras.wad');

// Sprites: group lumps by 4-char prefix -> frame letter -> set of rotations.
function spriteFrames(wad) {
  const stack = new WadStack();
  stack.add(wad);
  const lumps = stack.namespace(['S_START', 'SS_START'], ['S_END', 'SS_END']);
  const sprites = new Map();
  const add = (prefix, frame, rot) => {
    if (!sprites.has(prefix)) sprites.set(prefix, new Map());
    const frames = sprites.get(prefix);
    if (!frames.has(frame)) frames.set(frame, new Set());
    frames.get(frame).add(rot);
  };
  for (const name of lumps.keys()) {
    const prefix = name.slice(0, 4);
    add(prefix, name[4], name[5]);
    if (name.length >= 8) add(prefix, name[6], name[7]);
  }
  return sprites;
}
const wadSprites = [['doom1.wad', spriteFrames(doom1)], ['doomx-extras.wad', spriteFrames(extras)]];
// Frames referenced by states. A state with 0 tics is never displayed (both
// P_SetMobjState and P_SetPsprite run straight through it), so a missing frame
// there is harmless: S_LIGHTDONE points at SHTG frame E, which no IWAD has.
const usedFrames = new Map();
const spawnStates = new Set(MOBJ_DEFS.map((m) => m.spawnstate));
for (const [name, spr, frame, tics] of STATE_DEFS) {
  if (!usedFrames.has(spr)) usedFrames.set(spr, new Map());
  const letter = String.fromCharCode(65 + (frame & FF_FRAMEMASK));
  const frames = usedFrames.get(spr);
  if (!frames.has(letter)) frames.set(letter, { states: [], visible: false });
  const entry = frames.get(letter);
  entry.states.push(name);
  if (tics !== 0 || spawnStates.has(name)) entry.visible = true;
}
const missingSprites = [];
const invisibleMissing = [];
let spriteFrameChecks = 0;
for (const spr of SPRNAMES) {
  const homes = wadSprites.filter(([, sprites]) => sprites.has(spr));
  if (!homes.length) {
    missingSprites.push(spr);
    continue;
  }
  for (const [letter, { states, visible }] of usedFrames.get(spr) || []) {
    for (const [wadName, sprites] of homes) {
      spriteFrameChecks++;
      const rots = sprites.get(spr).get(letter);
      if (!rots && !visible) {
        invisibleMissing.push(`${spr}${letter} (${states.join(', ')}; 0 tics) in ${wadName}`);
        continue;
      }
      check(rots, `${states[0]}: sprite ${spr} frame ${letter} has no lumps in ${wadName}`);
      if (!rots) continue;
      // R_InitSprites: a frame is either rotation 0 or all of rotations 1-8.
      const full = ['1', '2', '3', '4', '5', '6', '7', '8'].every((r) => rots.has(r));
      check(rots.has('0') || full, `${spr}${letter} in ${wadName}: incomplete rotations ${[...rots].sort().join('')}`);
    }
  }
}
notes.push(`sprite frames verified: ${spriteFrameChecks} (sprite/frame/WAD combinations)`);
for (const m of invisibleMissing) notes.push(`never-displayed frame without lumps: ${m}`);
notes.push(`sprites in neither WAD (DOOM II / registered only): ${missingSprites.length} - ${missingSprites.join(' ')}`);

// Textures / flats for switch and animation tables in the shareware IWAD.
function textureNames(wad) {
  const names = [];
  for (const lump of wad.lumps.filter((l) => /^TEXTURE[12]$/.test(l.name))) {
    const bytes = wad.data(lump);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getInt32(0, true);
    for (let i = 0; i < count; i++) {
      const off = view.getInt32(4 + i * 4, true);
      let s = '';
      for (let j = 0; j < 8 && bytes[off + j]; j++) s += String.fromCharCode(bytes[off + j]);
      names.push(s.toUpperCase());
    }
  }
  return names;
}
const textures = textureNames(doom1);
const flats = [];
{
  let inside = false;
  for (const l of doom1.lumps) {
    if (l.name === 'F_START' || l.name === 'FF_START') inside = true;
    else if (l.name === 'F_END' || l.name === 'FF_END') inside = false;
    else if (inside && l.size === 4096) flats.push(l.name);
  }
}
for (const s of SWITCHES.filter((sw) => sw.episode === 1)) {
  check(textures.includes(s.name1) && textures.includes(s.name2), `shareware switch ${s.name1}/${s.name2} missing from doom1.wad`);
}
let animsPresent = 0;
for (const a of ANIMDEFS) {
  const list = a.istexture ? textures : flats;
  const start = list.indexOf(a.startname);
  if (start < 0) continue;
  animsPresent++;
  const end = list.indexOf(a.endname);
  check(end - start + 1 >= 2, `animdef ${a.startname}..${a.endname}: bad cycle in doom1.wad`);
}
notes.push(`animdefs present in doom1.wad: ${animsPresent}/${ANIMDEFS.length}; shareware switches: ${SWITCHES.filter((s) => s.episode === 1).length}`);
check(flats.includes(FINALE.doom.e1.flat), 'E1 finale flat missing');

// Intermission animation lumps for episode 1 (the only one in shareware).
const stack = new WadStack();
stack.add(doom1);
stack.add(extras, { fallback: true });
INTERMISSION.anims[0].forEach((a, j) => {
  for (let i = 0; i < a.nanims; i++) {
    const lump = `WIA0${String(j).padStart(2, '0')}${String(i).padStart(2, '0')}`;
    check(stack.has(lump), `intermission lump ${lump} missing`);
  }
});
for (const lump of ['WIMAP0', 'WISPLAT', 'WIURH0', 'WIURH1']) check(stack.has(lump), `lump ${lump} missing`);

// Sounds and music available to the shareware build (informational).
const missingSfx = SFX_DEFS.slice(1).filter((s) => !s.link && !stack.has(`DS${s.name}`)).map((s) => s.name);
notes.push(`sfx lumps absent from doom1.wad + extras (DOOM II / registered only): ${missingSfx.length}`);
for (let m = 1; m <= 9; m++) check(stack.has(`D_E1M${m}`), `music D_E1M${m} missing`);

// ---------------------------------------------------------------- report
console.log(`check-info: ${checks} checks`);
for (const n of notes) console.log(`  note: ${n}`);
if (errors.length) {
  for (const e of errors) console.error(`  FAIL: ${e}`);
  console.error(`check-info: ${errors.length} problem(s)`);
  process.exit(1);
}
console.log('check-info: all OK');
