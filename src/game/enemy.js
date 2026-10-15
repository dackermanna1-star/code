// Port of p_enemy.c: monster thinking and attacks. Movement goal selection
// goes through ai.js, which adds navigation, flanking and evasive moves on
// top of the original chase logic while keeping its rhythm.

import {
  MF, MELEERANGE, MISSILERANGE, SKILL, ANG90, ANG180, ANG270, TAU,
  normAngle, pointToAngle, aproxDistance, FLOATSPEED,
} from './defs.js';
import { MT, S, MOBJINFO, stateTics, registerActions } from './tables.js';
import { ML } from './mapdata.js';
import { lineOpening, opening, blockThingsIterator } from './maputl.js';
import { tryMove, mapState, checkPosition, aimLineAttack, lineAttack, radiusAttack, teleportMove } from './map.js';
import { setMobjState, spawnMobj, spawnMissile, spawnPuff, removeMobj } from './mobj.js';
import * as ai from './ai.js';

export const DI = { EAST: 0, NORTHEAST: 1, NORTH: 2, NORTHWEST: 3, WEST: 4, SOUTHWEST: 5, SOUTH: 6, SOUTHEAST: 7, NODIR: 8 };
const opposite = [DI.WEST, DI.SOUTHWEST, DI.SOUTH, DI.SOUTHEAST, DI.EAST, DI.NORTHEAST, DI.NORTH, DI.NORTHWEST, DI.NODIR];
const diags = [DI.NORTHWEST, DI.NORTHEAST, DI.SOUTHWEST, DI.SOUTHEAST];
const XS = 47000 / 65536;
export const xspeed = [1, XS, 0, -XS, -1, -XS, 0, XS];
export const yspeed = [0, XS, 1, XS, 0, -XS, -1, -XS];

// --- Sound propagation --------------------------------------------------

function recursiveSound(w, sec, soundblocks, target) {
  if (sec.validcount === w.validcount && sec.soundtraversed <= soundblocks + 1) return;
  sec.validcount = w.validcount;
  sec.soundtraversed = soundblocks + 1;
  sec.soundtarget = target;
  for (const check of sec.lines) {
    if (!(check.flags & ML.TWOSIDED) || !check.backsector) continue;
    lineOpening(check);
    if (opening.range <= 0) continue;
    let other = check.frontsector === sec ? check.backsector : check.frontsector;
    // Through a Chinatown portal the sound comes out past the partner line.
    if (check.special === 900 && w.ct) other = w.ct.portalExitSector(check, sec) || other;
    if (check.flags & ML.SOUNDBLOCK) {
      if (!soundblocks) recursiveSound(w, other, 1, target);
    } else {
      recursiveSound(w, other, soundblocks, target);
    }
  }
}

export function noiseAlert(w, target, emitter) {
  w.validcount++;
  recursiveSound(w, emitter.subsector.sector, 0, target);
}

// --- Range checks -------------------------------------------------------

export function checkMeleeRange(w, actor) {
  const pl = actor.target;
  if (!pl) return false;
  const dist = aproxDistance(pl.x - actor.x, pl.y - actor.y);
  // Chinatown's zombies give their reach (centre to centre against a
  // 16-radius player); DOOM's monsters use MELEERANGE.
  const reach = actor.info.ct && actor.info.ct.reach;
  if (dist >= (reach ? reach - 16 : MELEERANGE - 20) + pl.info.radius) return false;
  // Can't bite what's far above or below (relevant once players can jump).
  if (pl.z > actor.z + actor.height + 24 || pl.z + pl.height < actor.z - 24) return false;
  // Nor through Chinatown's intact gates, boards and glass (see-through,
  // but they stop the player's shots too).
  if (w.ct && w.ct.meleeBlocked(actor, pl)) return false;
  return w.checkSight(actor, pl);
}

export function checkMissileRange(w, actor) {
  if (!w.checkSight(actor, actor.target)) return false;
  if (actor.flags & MF.JUSTHIT) {
    actor.flags &= ~MF.JUSTHIT;
    return true;
  }
  if (actor.reactiontime) return false;
  let dist = aproxDistance(actor.x - actor.target.x, actor.y - actor.target.y) - 64;
  if (!actor.info.meleestate) dist -= 128;
  dist = Math.floor(dist);
  if (actor.type === MT.VILE && dist > 14 * 64) return false;
  if (actor.type === MT.UNDEAD) {
    if (dist < 196) return false;
    dist >>= 1;
  }
  if (actor.type === MT.CYBORG || actor.type === MT.SPIDER || actor.type === MT.SKULL) dist >>= 1;
  if (dist > 200) dist = 200;
  if (actor.type === MT.CYBORG && dist > 160) dist = 160;
  if (w.rng.P() < dist) return false;
  return true;
}

// --- Movement -----------------------------------------------------------

export function move(w, actor) {
  if (actor.movedir === DI.NODIR) return false;
  const speed = actor.info.speed * (actor.ext && actor.ext.speedScale ? actor.ext.speedScale : 1);
  const tryx = actor.x + speed * xspeed[actor.movedir];
  const tryy = actor.y + speed * yspeed[actor.movedir];
  if (!tryMove(w, actor, tryx, tryy)) {
    if ((actor.flags & MF.FLOAT) && mapState.floatok) {
      if (actor.z < mapState.floorz) actor.z += FLOATSPEED;
      else actor.z -= FLOATSPEED;
      actor.flags |= MF.INFLOAT;
      return true;
    }
    const spechit = mapState.spechit.slice();
    if (!spechit.length) return false;
    actor.movedir = DI.NODIR;
    let good = false;
    for (let i = spechit.length - 1; i >= 0; i--) {
      if (w.useSpecialLine(actor, spechit[i], 0)) good = true;
    }
    return good;
  }
  actor.flags &= ~MF.INFLOAT;
  if (!(actor.flags & MF.FLOAT)) actor.z = actor.floorz;
  return true;
}

function tryWalk(w, actor) {
  if (!move(w, actor)) return false;
  actor.movecount = w.rng.P() & 15;
  return true;
}

export function newChaseDir(w, actor) {
  if (!actor.target) return;
  const olddir = actor.movedir;
  const turnaround = opposite[olddir];
  const goal = ai.chaseGoal(w, actor);
  const deltax = goal.x - actor.x;
  const deltay = goal.y - actor.y;
  const d = [0, DI.NODIR, DI.NODIR];
  if (deltax > 10) d[1] = DI.EAST;
  else if (deltax < -10) d[1] = DI.WEST;
  if (deltay < -10) d[2] = DI.SOUTH;
  else if (deltay > 10) d[2] = DI.NORTH;
  if (d[1] !== DI.NODIR && d[2] !== DI.NODIR) {
    actor.movedir = diags[((deltay < 0) ? 2 : 0) + (deltax > 0 ? 1 : 0)];
    if (actor.movedir !== turnaround && tryWalk(w, actor)) return;
  }
  if (w.rng.P() > 200 || Math.abs(deltay) > Math.abs(deltax)) {
    const t = d[1]; d[1] = d[2]; d[2] = t;
  }
  if (d[1] === turnaround) d[1] = DI.NODIR;
  if (d[2] === turnaround) d[2] = DI.NODIR;
  if (d[1] !== DI.NODIR) {
    actor.movedir = d[1];
    if (tryWalk(w, actor)) return;
  }
  if (d[2] !== DI.NODIR) {
    actor.movedir = d[2];
    if (tryWalk(w, actor)) return;
  }
  if (olddir !== DI.NODIR) {
    actor.movedir = olddir;
    if (tryWalk(w, actor)) return;
  }
  if (w.rng.P() & 1) {
    for (let tdir = DI.EAST; tdir <= DI.SOUTHEAST; tdir++) {
      if (tdir !== turnaround) {
        actor.movedir = tdir;
        if (tryWalk(w, actor)) return;
      }
    }
  } else {
    for (let tdir = DI.SOUTHEAST; tdir !== DI.EAST - 1; tdir--) {
      if (tdir !== turnaround) {
        actor.movedir = tdir;
        if (tryWalk(w, actor)) return;
      }
    }
  }
  if (turnaround !== DI.NODIR) {
    actor.movedir = turnaround;
    if (tryWalk(w, actor)) return;
  }
  actor.movedir = DI.NODIR;
  ai.noteStuck(w, actor);
}

export function lookForPlayers(w, actor, allaround) {
  const player = w.player;
  if (!player || !player.mo) return false;
  if (player.health <= 0) return false;
  if (player.cheats & 8) return false; // notarget
  if (!w.checkSight(actor, player.mo)) return false;
  if (!allaround) {
    const an = normAngle(pointToAngle(actor.x, actor.y, player.mo.x, player.mo.y) - actor.angle);
    if (an > ANG90 && an < ANG270) {
      const dist = aproxDistance(player.mo.x - actor.x, player.mo.y - actor.y);
      if (dist > MELEERANGE) return false;
    }
  }
  actor.target = player.mo;
  return true;
}

// --- Actions ------------------------------------------------------------

// Chinatown's zombie groans come in three takes, like the posit/bgsit sounds.
function zombieGroan(w, sound) {
  return sound === 'zsgrn1' ? 'zsgrn' + (1 + w.rng.P() % 3) : sound;
}

function seeSound(w, actor) {
  let sound = actor.info.seesound;
  if (!sound) return;
  if (sound === 'posit1' || sound === 'posit2' || sound === 'posit3') sound = 'posit' + (1 + w.rng.P() % 3);
  else if (sound === 'bgsit1' || sound === 'bgsit2') sound = 'bgsit' + (1 + w.rng.P() % 2);
  else sound = zombieGroan(w, sound);
  if (actor.type === MT.SPIDER || actor.type === MT.CYBORG) w.sound(null, sound);
  else w.sound(actor, sound, { channel: 'voice' });
}

export function A_Look(w, actor) {
  actor.threshold = 0;
  const targ = actor.subsector.sector.soundtarget;
  let see = false;
  if (targ && (targ.flags & MF.SHOOTABLE)) {
    actor.target = targ;
    if (actor.flags & MF.AMBUSH) {
      if (w.checkSight(actor, actor.target)) see = true;
    } else {
      see = true;
    }
  }
  if (!see && !lookForPlayers(w, actor, false)) return;
  seeSound(w, actor);
  ai.onWake(w, actor);
  setMobjState(w, actor, actor.info.seestate);
}

export function A_Chase(w, actor) {
  if (actor.reactiontime) actor.reactiontime--;
  if (actor.threshold) {
    if (!actor.target || actor.target.health <= 0) actor.threshold = 0;
    else actor.threshold--;
  }
  if (actor.movedir < 8) {
    // Turn towards movement direction in 45 degree steps.
    let snapped = Math.floor(normAngle(actor.angle) / (Math.PI / 4) + 1e-6) & 7;
    const delta = (snapped - actor.movedir) & 7;
    if (delta !== 0) snapped += delta < 4 ? -1 : 1;
    actor.angle = (snapped & 7) * (Math.PI / 4);
  }
  if (!actor.target || !(actor.target.flags & MF.SHOOTABLE)) {
    if (lookForPlayers(w, actor, true)) return;
    setMobjState(w, actor, actor.info.spawnstate);
    return;
  }
  if (actor.flags & MF.JUSTATTACKED) {
    actor.flags &= ~MF.JUSTATTACKED;
    if (w.skill !== SKILL.NIGHTMARE && !w.fastMonsters) {
      if (!ai.afterAttack(w, actor)) newChaseDir(w, actor);
    }
    return;
  }
  if (actor.info.meleestate && checkMeleeRange(w, actor)) {
    if (actor.info.attacksound) w.sound(actor, actor.info.attacksound);
    setMobjState(w, actor, actor.info.meleestate);
    return;
  }
  if (actor.info.missilestate) {
    if (!(w.skill < SKILL.NIGHTMARE && !w.fastMonsters && actor.movecount)) {
      if (checkMissileRange(w, actor)) {
        setMobjState(w, actor, actor.info.missilestate);
        actor.flags |= MF.JUSTATTACKED;
        return;
      }
    }
  }
  if (ai.evade(w, actor)) {
    // evasive step taken
  } else if (--actor.movecount < 0 || !move(w, actor)) {
    newChaseDir(w, actor);
  }
  if (actor.info.activesound && w.rng.P() < 3) w.sound(actor, zombieGroan(w, actor.info.activesound), { channel: 'voice' });
}

export function A_FaceTarget(w, actor) {
  if (!actor.target) return;
  actor.flags &= ~MF.AMBUSH;
  actor.angle = pointToAngle(actor.x, actor.y, actor.target.x, actor.target.y);
  if (actor.target.flags & MF.SHADOW) actor.angle = normAngle(actor.angle + w.rng.sub() * (TAU / 2048));
}

// Monster hitscan aimed at the target's body, honouring height.
function monsterAim(w, actor, angle) {
  return aimLineAttack(w, actor, angle, MISSILERANGE);
}

function monsterShot(w, actor, angle, slope, damage) {
  lineAttack(w, actor, angle, MISSILERANGE, slope, damage);
  if (w.fx) w.fx.monsterFire(actor, angle, slope);
}

export function A_PosAttack(w, actor) {
  if (!actor.target) return;
  A_FaceTarget(w, actor);
  let angle = actor.angle;
  const slope = monsterAim(w, actor, angle);
  w.sound(actor, 'pistol', { channel: 'weapon' });
  angle += w.rng.sub() * (TAU / 4096);
  const damage = ((w.rng.P() % 5) + 1) * 3;
  monsterShot(w, actor, angle, slope, damage);
}

export function A_SPosAttack(w, actor) {
  if (!actor.target) return;
  w.sound(actor, 'shotgn', { channel: 'weapon' });
  A_FaceTarget(w, actor);
  const bangle = actor.angle;
  const slope = monsterAim(w, actor, bangle);
  for (let i = 0; i < 3; i++) {
    const angle = bangle + w.rng.sub() * (TAU / 4096);
    const damage = ((w.rng.P() % 5) + 1) * 3;
    monsterShot(w, actor, angle, slope, damage);
  }
}

export function A_CPosAttack(w, actor) {
  if (!actor.target) return;
  w.sound(actor, 'shotgn', { channel: 'weapon' });
  A_FaceTarget(w, actor);
  const bangle = actor.angle;
  const slope = monsterAim(w, actor, bangle);
  const angle = bangle + w.rng.sub() * (TAU / 4096);
  const damage = ((w.rng.P() % 5) + 1) * 3;
  monsterShot(w, actor, angle, slope, damage);
}

export function A_CPosRefire(w, actor) {
  A_FaceTarget(w, actor);
  if (w.rng.P() < 40) return;
  if (!actor.target || actor.target.health <= 0 || !w.checkSight(actor, actor.target)) {
    setMobjState(w, actor, actor.info.seestate);
  }
}

export function A_SpidRefire(w, actor) {
  A_FaceTarget(w, actor);
  if (w.rng.P() < 10) return;
  if (!actor.target || actor.target.health <= 0 || !w.checkSight(actor, actor.target)) {
    setMobjState(w, actor, actor.info.seestate);
  }
}

export function A_BspiAttack(w, actor) {
  if (!actor.target) return;
  A_FaceTarget(w, actor);
  spawnMissile(w, actor, actor.target, MT.ARACHPLAZ);
}

export function A_TroopAttack(w, actor) {
  if (!actor.target) return;
  A_FaceTarget(w, actor);
  if (checkMeleeRange(w, actor)) {
    w.sound(actor, 'claw');
    const damage = (w.rng.P() % 8 + 1) * 3;
    w.damageMobj(actor.target, actor, actor, damage, { melee: true });
    return;
  }
  spawnMissile(w, actor, actor.target, MT.TROOPSHOT);
}

export function A_SargAttack(w, actor) {
  if (!actor.target) return;
  A_FaceTarget(w, actor);
  if (checkMeleeRange(w, actor)) {
    const damage = ((w.rng.P() % 10) + 1) * 4;
    w.damageMobj(actor.target, actor, actor, damage, { melee: true });
  }
}

export function A_HeadAttack(w, actor) {
  if (!actor.target) return;
  A_FaceTarget(w, actor);
  if (checkMeleeRange(w, actor)) {
    const damage = (w.rng.P() % 6 + 1) * 10;
    w.damageMobj(actor.target, actor, actor, damage, { melee: true });
    return;
  }
  spawnMissile(w, actor, actor.target, MT.HEADSHOT);
}

export function A_CyberAttack(w, actor) {
  if (!actor.target) return;
  A_FaceTarget(w, actor);
  spawnMissile(w, actor, actor.target, MT.ROCKET);
}

export function A_BruisAttack(w, actor) {
  if (!actor.target) return;
  if (checkMeleeRange(w, actor)) {
    w.sound(actor, 'claw');
    const damage = (w.rng.P() % 8 + 1) * 10;
    w.damageMobj(actor.target, actor, actor, damage, { melee: true });
    return;
  }
  spawnMissile(w, actor, actor.target, MT.BRUISERSHOT);
}

export function A_SkelMissile(w, actor) {
  if (!actor.target) return;
  A_FaceTarget(w, actor);
  actor.z += 16;
  const mo = spawnMissile(w, actor, actor.target, MT.TRACER);
  actor.z -= 16;
  mo.x += mo.momx;
  mo.y += mo.momy;
  mo.saveInterp();
  mo.tracer = actor.target;
}

const TRACEANGLE = 0xc000000 * (TAU / 4294967296);

export function A_Tracer(w, actor) {
  if (w.gametic & 3) return;
  spawnPuff(w, actor.x, actor.y, actor.z);
  const th = spawnMobj(w, actor.x - actor.momx, actor.y - actor.momy, actor.z, MT.SMOKE);
  th.momz = 1;
  th.tics -= w.rng.P() & 3;
  if (th.tics < 1) th.tics = 1;
  const dest = actor.tracer;
  if (!dest || dest.health <= 0) return;
  const exact = pointToAngle(actor.x, actor.y, dest.x, dest.y);
  let diff = normAngle(exact - actor.angle);
  if (diff !== 0) {
    if (diff > Math.PI) {
      actor.angle = normAngle(actor.angle - TRACEANGLE);
      if (normAngle(exact - actor.angle) < Math.PI) actor.angle = exact;
    } else {
      actor.angle = normAngle(actor.angle + TRACEANGLE);
      if (normAngle(exact - actor.angle) > Math.PI) actor.angle = exact;
    }
  }
  actor.momx = actor.info.speed * Math.cos(actor.angle);
  actor.momy = actor.info.speed * Math.sin(actor.angle);
  let dist = Math.floor(aproxDistance(dest.x - actor.x, dest.y - actor.y) / actor.info.speed);
  if (dist < 1) dist = 1;
  const slope = (dest.z + 40 - actor.z) / dist;
  if (slope < actor.momz) actor.momz -= 1 / 8;
  else actor.momz += 1 / 8;
}

export function A_SkelWhoosh(w, actor) {
  if (!actor.target) return;
  A_FaceTarget(w, actor);
  w.sound(actor, 'skeswg');
}

export function A_SkelFist(w, actor) {
  if (!actor.target) return;
  A_FaceTarget(w, actor);
  if (checkMeleeRange(w, actor)) {
    const damage = ((w.rng.P() % 10) + 1) * 6;
    w.sound(actor, 'skepch');
    w.damageMobj(actor.target, actor, actor, damage, { melee: true });
  }
}

export function A_VileChase(w, actor) {
  if (actor.movedir !== DI.NODIR) {
    const tryx = actor.x + actor.info.speed * xspeed[actor.movedir];
    const tryy = actor.y + actor.info.speed * yspeed[actor.movedir];
    const bm = w.level.blockmap;
    const xl = Math.floor((tryx - bm.originx - 64) / 128);
    const xh = Math.floor((tryx - bm.originx + 64) / 128);
    const yl = Math.floor((tryy - bm.originy - 64) / 128);
    const yh = Math.floor((tryy - bm.originy + 64) / 128);
    let corpsehit = null;
    for (let bx = xl; bx <= xh && !corpsehit; bx++) {
      for (let by = yl; by <= yh && !corpsehit; by++) {
        blockThingsIterator(w, bx, by, (thing) => {
          if (!(thing.flags & MF.CORPSE)) return true;
          if (thing.tics !== -1) return true;
          if (thing.info.raisestate === S.S_NULL) return true;
          if (thing.ext && thing.ext.gibbed) return true;
          const maxdist = thing.info.radius + MOBJINFO[MT.VILE].radius;
          if (Math.abs(thing.x - tryx) > maxdist || Math.abs(thing.y - tryy) > maxdist) return true;
          thing.momx = thing.momy = 0;
          thing.height *= 4;
          const check = checkPosition(w, thing, thing.x, thing.y);
          thing.height /= 4;
          if (!check) return true;
          corpsehit = thing;
          return false;
        });
      }
    }
    if (corpsehit) {
      const temp = actor.target;
      actor.target = corpsehit;
      A_FaceTarget(w, actor);
      actor.target = temp;
      setMobjState(w, actor, S.S_VILE_HEAL1);
      w.sound(corpsehit, 'slop');
      const info = corpsehit.info;
      if (w.fx && w.fx.resurrect) w.fx.resurrect(corpsehit);
      setMobjState(w, corpsehit, info.raisestate);
      corpsehit.height = info.height;
      corpsehit.radius = info.radius;
      corpsehit.flags = info.flags;
      corpsehit.health = info.spawnhealth;
      corpsehit.target = null;
      return;
    }
  }
  A_Chase(w, actor);
}

export function A_VileStart(w, actor) { w.sound(actor, 'vilatk'); }

export function A_Fire(w, actor) {
  const dest = actor.tracer;
  if (!dest) return;
  if (!actor.target || !w.checkSight(actor.target, dest)) return;
  w.unsetThingPosition(actor);
  actor.x = dest.x + 24 * Math.cos(dest.angle);
  actor.y = dest.y + 24 * Math.sin(dest.angle);
  actor.z = dest.z;
  w.setThingPosition(actor);
}

export function A_StartFire(w, actor) { w.sound(actor, 'flamst'); A_Fire(w, actor); }
export function A_FireCrackle(w, actor) { w.sound(actor, 'flame'); A_Fire(w, actor); }

export function A_VileTarget(w, actor) {
  if (!actor.target) return;
  A_FaceTarget(w, actor);
  const fog = spawnMobj(w, actor.target.x, actor.target.y, actor.target.z, MT.FIRE);
  actor.tracer = fog;
  fog.target = actor;
  fog.tracer = actor.target;
  A_Fire(w, fog);
}

export function A_VileAttack(w, actor) {
  if (!actor.target) return;
  A_FaceTarget(w, actor);
  if (!w.checkSight(actor, actor.target)) return;
  w.sound(actor, 'barexp');
  w.damageMobj(actor.target, actor, actor, 20);
  actor.target.momz = 1000 / actor.target.info.mass;
  const fire = actor.tracer;
  if (!fire) return;
  fire.x = actor.target.x - 24 * Math.cos(actor.angle);
  fire.y = actor.target.y - 24 * Math.sin(actor.angle);
  radiusAttack(w, fire, actor, 70);
}

const FATSPREAD = ANG90 / 8;

function relaunch(mo, angle) {
  mo.angle = normAngle(angle);
  mo.momx = mo.info.speed * Math.cos(mo.angle);
  mo.momy = mo.info.speed * Math.sin(mo.angle);
}

export function A_FatRaise(w, actor) { A_FaceTarget(w, actor); w.sound(actor, 'manatk'); }

export function A_FatAttack1(w, actor) {
  A_FaceTarget(w, actor);
  actor.angle = normAngle(actor.angle + FATSPREAD);
  spawnMissile(w, actor, actor.target, MT.FATSHOT);
  const mo = spawnMissile(w, actor, actor.target, MT.FATSHOT);
  relaunch(mo, mo.angle + FATSPREAD);
}

export function A_FatAttack2(w, actor) {
  A_FaceTarget(w, actor);
  actor.angle = normAngle(actor.angle - FATSPREAD);
  spawnMissile(w, actor, actor.target, MT.FATSHOT);
  const mo = spawnMissile(w, actor, actor.target, MT.FATSHOT);
  relaunch(mo, mo.angle - FATSPREAD * 2);
}

export function A_FatAttack3(w, actor) {
  A_FaceTarget(w, actor);
  let mo = spawnMissile(w, actor, actor.target, MT.FATSHOT);
  relaunch(mo, mo.angle - FATSPREAD / 2);
  mo = spawnMissile(w, actor, actor.target, MT.FATSHOT);
  relaunch(mo, mo.angle + FATSPREAD / 2);
}

const SKULLSPEED = 20;

export function A_SkullAttack(w, actor) {
  if (!actor.target) return;
  const dest = actor.target;
  actor.flags |= MF.SKULLFLY;
  w.sound(actor, actor.info.attacksound);
  A_FaceTarget(w, actor);
  actor.momx = SKULLSPEED * Math.cos(actor.angle);
  actor.momy = SKULLSPEED * Math.sin(actor.angle);
  let dist = Math.floor(aproxDistance(dest.x - actor.x, dest.y - actor.y) / SKULLSPEED);
  if (dist < 1) dist = 1;
  actor.momz = (dest.z + dest.height / 2 - actor.z) / dist;
}

function painShootSkull(w, actor, angle) {
  let count = 0;
  for (const mo of w.mobjs) if (mo.type === MT.SKULL) count++;
  if (count > 20) return;
  const prestep = 4 + 3 * (actor.info.radius + MOBJINFO[MT.SKULL].radius) / 2;
  const x = actor.x + prestep * Math.cos(angle);
  const y = actor.y + prestep * Math.sin(angle);
  const z = actor.z + 8;
  const newmobj = spawnMobj(w, x, y, z, MT.SKULL);
  if (!tryMove(w, newmobj, newmobj.x, newmobj.y)) {
    w.damageMobj(newmobj, actor, actor, 10000);
    return;
  }
  newmobj.target = actor.target;
  A_SkullAttack(w, newmobj);
}

export function A_PainAttack(w, actor) {
  if (!actor.target) return;
  A_FaceTarget(w, actor);
  painShootSkull(w, actor, actor.angle);
}

export function A_PainDie(w, actor) {
  A_Fall(w, actor);
  painShootSkull(w, actor, actor.angle + ANG90);
  painShootSkull(w, actor, actor.angle + ANG180);
  painShootSkull(w, actor, actor.angle + ANG270);
}

export function A_Scream(w, actor) {
  let sound = actor.info.deathsound;
  if (!sound) return;
  if (/^podth[123]$/.test(sound)) sound = 'podth' + (1 + w.rng.P() % 3);
  else if (/^bgdth[12]$/.test(sound)) sound = 'bgdth' + (1 + w.rng.P() % 2);
  else if (sound === 'zsdth1') sound = 'zsdth' + (1 + w.rng.P() % 2);
  if (actor.type === MT.SPIDER || actor.type === MT.CYBORG) w.sound(null, sound);
  else w.sound(actor, sound, { channel: 'voice' });
}

export function A_XScream(w, actor) { w.sound(actor, 'slop', { channel: 'voice' }); }

export function A_Pain(w, actor) {
  if (actor.info.painsound) w.sound(actor, actor.info.painsound, { channel: 'voice' });
}

export function A_Fall(w, actor) {
  actor.flags &= ~MF.SOLID;
}

export function A_Explode(w, thingy) {
  if (w.fx && w.fx.barrelOrRocketBlast) w.fx.barrelOrRocketBlast(thingy);
  radiusAttack(w, thingy, thingy.target, 128);
}

export function A_BossDeath(w, mo) {
  const ep = w.episode, map = w.map;
  if (w.commercial) {
    if (map !== 7) return;
    if (mo.type !== MT.FATSO && mo.type !== MT.BABY) return;
  } else {
    switch (ep) {
      case 1: if (map !== 8 || mo.type !== MT.BRUISER) return; break;
      case 2: if (map !== 8 || mo.type !== MT.CYBORG) return; break;
      case 3: if (map !== 8 || mo.type !== MT.SPIDER) return; break;
      case 4:
        if (map === 6) { if (mo.type !== MT.CYBORG) return; } else if (map === 8) { if (mo.type !== MT.SPIDER) return; } else return;
        break;
      default: if (map !== 8) return;
    }
  }
  if (!w.player || w.player.health <= 0) return;
  for (const mo2 of w.mobjs) {
    if (mo2 !== mo && mo2.type === mo.type && mo2.health > 0) return;
  }
  const junk = { tag: 666 };
  if (w.commercial) {
    if (map === 7) {
      if (mo.type === MT.FATSO) { w.specials.doFloor(junk, 'lowerFloorToLowest'); return; }
      if (mo.type === MT.BABY) { junk.tag = 667; w.specials.doFloor(junk, 'raiseToTexture'); return; }
    }
  } else if (ep === 1) {
    w.specials.doFloor(junk, 'lowerFloorToLowest');
    return;
  } else if (ep === 4) {
    if (map === 6) { w.specials.doDoor(junk, 'blazeOpen'); return; }
    if (map === 8) { w.specials.doFloor(junk, 'lowerFloorToLowest'); return; }
  }
  w.exitLevel(false);
}

export function A_KeenDie(w, mo) {
  A_Fall(w, mo);
  for (const mo2 of w.mobjs) {
    if (mo2 !== mo && mo2.type === mo.type && mo2.health > 0) return;
  }
  w.specials.doDoor({ tag: 666 }, 'open');
}

export function A_Hoof(w, mo) { w.sound(mo, 'hoof'); A_Chase(w, mo); }
export function A_Metal(w, mo) { w.sound(mo, 'metal'); A_Chase(w, mo); }
export function A_BabyMetal(w, mo) { w.sound(mo, 'bspwlk'); A_Chase(w, mo); }

export function A_BrainAwake(w) {
  w.brainTargets = [];
  w.brainTargetOn = 0;
  for (const m of w.mobjs) if (m.type === MT.BOSSTARGET) w.brainTargets.push(m);
  w.sound(null, 'bossit');
}

export function A_BrainPain(w) { w.sound(null, 'bospn'); }

export function A_BrainScream(w, mo) {
  for (let x = mo.x - 196; x < mo.x + 320; x += 8) {
    const y = mo.y - 320;
    const z = 128 / 65536 + w.rng.P() * 2; // the original's 128 is raw fixed_t
    const th = spawnMobj(w, x, y, z, MT.ROCKET);
    th.momz = w.rng.P() * 512 / 65536;
    setMobjState(w, th, S.S_BRAINEXPLODE1);
    th.tics -= w.rng.P() & 7;
    if (th.tics < 1) th.tics = 1;
  }
  w.sound(null, 'bosdth');
}

export function A_BrainExplode(w, mo) {
  const x = mo.x + w.rng.sub() * 2048 / 65536;
  const y = mo.y;
  const z = 128 / 65536 + w.rng.P() * 2; // the original's 128 is raw fixed_t
  const th = spawnMobj(w, x, y, z, MT.ROCKET);
  th.momz = w.rng.P() * 512 / 65536;
  setMobjState(w, th, S.S_BRAINEXPLODE1);
  th.tics -= w.rng.P() & 7;
  if (th.tics < 1) th.tics = 1;
}

export function A_BrainDie(w) { w.exitLevel(false); }

export function A_BrainSpit(w, mo) {
  w.brainEasy = (w.brainEasy || 0) ^ 1;
  if (w.skill <= SKILL.EASY && !w.brainEasy) return;
  if (!w.brainTargets || !w.brainTargets.length) return;
  const targ = w.brainTargets[w.brainTargetOn];
  w.brainTargetOn = (w.brainTargetOn + 1) % w.brainTargets.length;
  const newmobj = spawnMissile(w, mo, targ, MT.SPAWNSHOT);
  newmobj.target = targ;
  newmobj.reactiontime = Math.floor(((targ.y - mo.y) / (newmobj.momy || 1)) / stateTics[newmobj.state]);
  w.sound(null, 'bospit');
}

export function A_SpawnFly(w, mo) {
  if (--mo.reactiontime > 0) return;
  const targ = mo.target;
  if (!targ) { removeMobj(w, mo); return; }
  const fog = spawnMobj(w, targ.x, targ.y, targ.z, MT.SPAWNFIRE);
  w.sound(fog, 'telept');
  const r = w.rng.P();
  let type;
  if (r < 50) type = MT.TROOP;
  else if (r < 90) type = MT.SERGEANT;
  else if (r < 120) type = MT.SHADOWS;
  else if (r < 130) type = MT.PAIN;
  else if (r < 160) type = MT.HEAD;
  else if (r < 162) type = MT.VILE;
  else if (r < 172) type = MT.UNDEAD;
  else if (r < 192) type = MT.BABY;
  else if (r < 222) type = MT.FATSO;
  else if (r < 246) type = MT.KNIGHT;
  else type = MT.BRUISER;
  const newmobj = spawnMobj(w, targ.x, targ.y, targ.z, type);
  if (lookForPlayers(w, newmobj, true)) setMobjState(w, newmobj, newmobj.info.seestate);
  teleportMove(w, newmobj, newmobj.x, newmobj.y);
  removeMobj(w, mo);
}

export function A_SpawnSound(w, mo) {
  w.sound(mo, 'boscub');
  A_SpawnFly(w, mo);
}

export function A_PlayerScream(w, mo) {
  let sound = 'pldeth';
  if (w.commercial && mo.health < -50) sound = 'pdiehi';
  w.sound(mo, sound, { channel: 'voice' });
}

registerActions({
  A_Look, A_Chase, A_FaceTarget, A_PosAttack, A_SPosAttack, A_CPosAttack, A_CPosRefire, A_SpidRefire,
  A_BspiAttack, A_TroopAttack, A_SargAttack, A_HeadAttack, A_CyberAttack, A_BruisAttack, A_SkelMissile,
  A_Tracer, A_SkelWhoosh, A_SkelFist, A_VileChase, A_VileStart, A_StartFire, A_FireCrackle, A_Fire,
  A_VileTarget, A_VileAttack, A_FatRaise, A_FatAttack1, A_FatAttack2, A_FatAttack3, A_SkullAttack,
  A_PainAttack, A_PainDie, A_Scream, A_XScream, A_Pain, A_Fall, A_Explode, A_BossDeath, A_KeenDie,
  A_Hoof, A_Metal, A_BabyMetal, A_BrainAwake, A_BrainPain, A_BrainScream, A_BrainExplode, A_BrainDie,
  A_BrainSpit, A_SpawnFly, A_SpawnSound, A_PlayerScream,
});
