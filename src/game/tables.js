// Compiles the info.js tables (string references) into fast index-based
// arrays and holds the action function registry.

// Chinatown's sprites, states, things and sounds are appended to the info.js
// tables first (see ct/install.js), so they compile with the rest.
import './ct/install.js';
import { SPRNAMES, STATE_DEFS, MOBJ_DEFS, SFX_DEFS, WEAPON_DEFS, FF_FULLBRIGHT, FF_FRAMEMASK } from './info.js';
import { flagsOf } from './defs.js';

export const S = {};
export const MT = {};
export const SPR = {};

SPRNAMES.forEach((n, i) => { SPR[n] = i; });
STATE_DEFS.forEach((d, i) => { S[d[0]] = i; });
MOBJ_DEFS.forEach((d, i) => { MT[d.name.replace(/^MT_/, '')] = i; });

export const NUMSTATES = STATE_DEFS.length;

export const stateSprite = new Int16Array(NUMSTATES);
export const stateFrame = new Int32Array(NUMSTATES);
export const stateTics = new Int32Array(NUMSTATES);
export const stateNext = new Int32Array(NUMSTATES);
export const stateActionName = new Array(NUMSTATES);
export const stateAction = new Array(NUMSTATES).fill(null);
export const stateName = new Array(NUMSTATES);

STATE_DEFS.forEach((d, i) => {
  stateName[i] = d[0];
  stateSprite[i] = SPR[d[1]];
  stateFrame[i] = d[2];
  stateTics[i] = d[3];
  stateActionName[i] = d[4];
  stateNext[i] = S[d[5]];
});

export const FULLBRIGHT = FF_FULLBRIGHT;
export const FRAMEMASK = FF_FRAMEMASK;

export const MOBJINFO = MOBJ_DEFS.map((d, i) => ({
  type: i,
  name: d.name,
  doomednum: d.doomednum,
  spawnstate: S[d.spawnstate],
  spawnhealth: d.spawnhealth,
  seestate: S[d.seestate],
  seesound: d.seesound,
  reactiontime: d.reactiontime,
  attacksound: d.attacksound,
  painstate: S[d.painstate],
  painchance: d.painchance,
  painsound: d.painsound,
  meleestate: S[d.meleestate],
  missilestate: S[d.missilestate],
  deathstate: S[d.deathstate],
  xdeathstate: S[d.xdeathstate],
  deathsound: d.deathsound,
  speed: d.speed,
  radius: d.radius,
  height: d.height,
  mass: d.mass,
  damage: d.damage,
  activesound: d.activesound,
  flags: flagsOf(d.flags),
  raisestate: S[d.raisestate],
  ct: d.ct || null,
}));

export const DOOMEDNUM = new Map();
MOBJINFO.forEach((m) => { if (m.doomednum > 0) DOOMEDNUM.set(m.doomednum, m.type); });

export const SFX = SFX_DEFS;

export const WEAPONINFO = WEAPON_DEFS.map((w) => ({
  name: w.name,
  ammo: { am_clip: 0, am_shell: 1, am_cell: 2, am_misl: 3, am_noammo: 5 }[w.ammo],
  upstate: S[w.upstate],
  downstate: S[w.downstate],
  readystate: S[w.readystate],
  atkstate: S[w.atkstate],
  flashstate: S[w.flashstate],
}));

// Action registry: modules register their functions by original name.
const registry = {};
export function registerActions(obj) {
  Object.assign(registry, obj);
  for (let i = 0; i < NUMSTATES; i++) {
    const n = stateActionName[i];
    if (n && registry[n]) stateAction[i] = registry[n];
  }
}

export function missingActions() {
  const missing = new Set();
  for (let i = 0; i < NUMSTATES; i++) {
    const n = stateActionName[i];
    if (n && !registry[n]) missing.add(n);
  }
  return [...missing];
}
