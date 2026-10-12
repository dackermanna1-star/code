// Port of p_mobj.c: map objects, state machine, movement and spawning.

import {
  MF, MAXMOVE, GRAVITY, FRICTION, STOPSPEED, FLOATSPEED, ONFLOORZ, ONCEILINGZ, VIEWHEIGHT,
  normAngle, pointToAngle, aproxDistance, SKILL, MTF, TAU,
} from './defs.js';
import {
  MOBJINFO, MT, S, stateSprite, stateFrame, stateTics, stateNext, stateAction, DOOMEDNUM,
} from './tables.js';
import { setThingPosition, unsetThingPosition } from './maputl.js';
import { tryMove, slideMove, aimLineAttack, mapState } from './map.js';

let nextId = 1;

// After loading a save, keep new ids clear of the restored mobjs' ids.
export function reserveMobjIds(maxId) {
  if (nextId <= maxId) nextId = maxId + 1;
}

export class Mobj {
  constructor(type) {
    this.id = nextId++;
    this.type = type;
    this.info = MOBJINFO[type];
    this.x = 0; this.y = 0; this.z = 0;
    this.px = 0; this.py = 0; this.pz = 0; this.pangle = 0;
    this.angle = 0;
    this.sprite = 0;
    this.frame = 0;
    this.tics = 0;
    this.state = 0;
    this.flags = this.info.flags;
    this.health = this.info.spawnhealth;
    this.radius = this.info.radius;
    this.height = this.info.height;
    this.momx = 0; this.momy = 0; this.momz = 0;
    this.floorz = 0; this.ceilingz = 0;
    this.subsector = null;
    this.sectorLink = null;
    this.blockLink = null;
    this.validcount = 0;
    this.movedir = 8;
    this.movecount = 0;
    this.reactiontime = 0;
    this.threshold = 0;
    this.target = null;
    this.tracer = null;
    this.lastlook = 0;
    this.player = null;
    this.spawnpoint = null;
    this.removed = false;
    this.isMobj = true;
    // Modern extensions (see gore.js / ai.js)
    this.ext = null;
  }

  get sector() { return this.subsector.sector; }

  saveInterp() {
    this.px = this.x; this.py = this.y; this.pz = this.z; this.pangle = this.angle;
  }

  think(w) { mobjThinker(w, this); }
}

export function setMobjState(w, mo, state) {
  do {
    if (state === S.S_NULL) {
      mo.state = S.S_NULL;
      removeMobj(w, mo);
      return false;
    }
    mo.state = state;
    mo.tics = stateTics[state];
    // -fast / nightmare: G_InitNew halves the demon's run/attack/pain tics.
    if (w.fastMonsters && state >= S.S_SARG_RUN1 && state <= S.S_SARG_PAIN2) mo.tics >>= 1;
    mo.sprite = stateSprite[state];
    mo.frame = stateFrame[state];
    const action = stateAction[state];
    if (action) {
      action(w, mo);
      if (mo.removed) return false;
    }
    state = stateNext[state];
  } while (!mo.tics);
  return true;
}

export function explodeMissile(w, mo) {
  mo.momx = mo.momy = mo.momz = 0;
  if (w.fx) w.fx.missileExplode(mo);
  if (!setMobjState(w, mo, mo.info.deathstate)) return;
  mo.tics -= w.rng.P() & 3;
  if (mo.tics < 1) mo.tics = 1;
  mo.flags &= ~MF.MISSILE;
  if (mo.info.deathsound) w.sound(mo, mo.info.deathsound);
}

export function xyMovement(w, mo) {
  if (!mo.momx && !mo.momy) {
    if (mo.flags & MF.SKULLFLY) {
      mo.flags &= ~MF.SKULLFLY;
      mo.momx = mo.momy = mo.momz = 0;
      setMobjState(w, mo, mo.info.spawnstate);
    }
    return;
  }
  const player = mo.player;
  mo.momx = Math.max(-MAXMOVE, Math.min(MAXMOVE, mo.momx));
  mo.momy = Math.max(-MAXMOVE, Math.min(MAXMOVE, mo.momy));
  let xmove = mo.momx;
  let ymove = mo.momy;
  do {
    let ptryx, ptryy;
    if (Math.abs(xmove) > MAXMOVE / 2 || Math.abs(ymove) > MAXMOVE / 2) {
      ptryx = mo.x + xmove / 2;
      ptryy = mo.y + ymove / 2;
      xmove /= 2;
      ymove /= 2;
    } else {
      ptryx = mo.x + xmove;
      ptryy = mo.y + ymove;
      xmove = ymove = 0;
    }
    if (!tryMove(w, mo, ptryx, ptryy)) {
      if (mo.player) {
        slideMove(w, mo);
      } else if (mo.flags & MF.MISSILE) {
        const cl = mapState.ceilingline;
        if (cl && cl.backsector && w.isSkyFlat(cl.backsector.ceilingpic)) {
          removeMobj(w, mo);
          return;
        }
        if (w.fx) w.fx.missileHitWall(mo, mapState.blockline);
        explodeMissile(w, mo);
      } else {
        // The effects layer may bounce physics corpses/gibs off the wall.
        if (!(w.fx && w.fx.blocked && w.fx.blocked(mo))) mo.momx = mo.momy = 0;
        xmove = ymove = 0;
      }
      if (mo.removed) return;
    }
  } while (xmove || ymove);

  if (player && player.cheats & 4) { mo.momx = mo.momy = 0; return; }
  if (mo.flags & (MF.MISSILE | MF.SKULLFLY)) return;
  if (mo.z > mo.floorz) return;
  if (mo.flags & MF.CORPSE) {
    if (Math.abs(mo.momx) > 0.25 || Math.abs(mo.momy) > 0.25) {
      if (mo.floorz !== mo.subsector.sector.floorheight) return;
    }
  }
  const fric = (player && player.slideFriction) ? player.slideFriction : FRICTION;
  if (Math.abs(mo.momx) < STOPSPEED && Math.abs(mo.momy) < STOPSPEED
    && (!player || (player.cmd.forwardmove === 0 && player.cmd.sidemove === 0))) {
    if (player && mo.state >= S.S_PLAY_RUN1 && mo.state <= S.S_PLAY_RUN4) setMobjState(w, mo, S.S_PLAY);
    mo.momx = 0;
    mo.momy = 0;
  } else {
    mo.momx *= fric;
    mo.momy *= fric;
  }
}

export function zMovement(w, mo) {
  if (mo.player && mo.z < mo.floorz) {
    mo.player.viewheight -= mo.floorz - mo.z;
    mo.player.deltaviewheight = (mo.player.baseViewHeight - mo.player.viewheight) / 8;
  }
  mo.z += mo.momz;
  if ((mo.flags & MF.FLOAT) && mo.target) {
    if (!(mo.flags & MF.SKULLFLY) && !(mo.flags & MF.INFLOAT)) {
      const dist = aproxDistance(mo.x - mo.target.x, mo.y - mo.target.y);
      const delta = (mo.target.z + mo.height / 2) - mo.z;
      if (delta < 0 && dist < -(delta * 3)) mo.z -= FLOATSPEED;
      else if (delta > 0 && dist < delta * 3) mo.z += FLOATSPEED;
    }
  }
  if (mo.z <= mo.floorz) {
    if (mo.flags & MF.SKULLFLY) mo.momz = -mo.momz;
    if (mo.momz < 0) {
      // A jump landing back at (or above) its take-off height is not a fall.
      const jumpLanding = mo.player && mo.player.jumpFloor != null && mo.floorz >= mo.player.jumpFloor - 1;
      if (mo.player) mo.player.jumpFloor = null;
      if (mo.player && mo.momz < -GRAVITY * 8 && !jumpLanding) {
        mo.player.deltaviewheight = mo.momz / 8;
        w.sound(mo, 'oof');
        if (w.fx && w.fx.playerLand) w.fx.playerLand(mo, mo.momz);
      } else if (mo.player && w.fx && w.fx.playerLand) {
        w.fx.playerLand(mo, mo.momz);
      }
      mo.momz = 0;
    }
    mo.z = mo.floorz;
    if ((mo.flags & MF.MISSILE) && !(mo.flags & MF.NOCLIP)) {
      if (w.fx) w.fx.missileHitPlane(mo, false);
      explodeMissile(w, mo);
      return;
    }
  } else if (!(mo.flags & MF.NOGRAVITY)) {
    const g = GRAVITY * (mo.gravityScale || 1);
    if (mo.momz === 0) mo.momz = -g * 2;
    else mo.momz -= g;
  }
  if (mo.z + mo.height > mo.ceilingz) {
    if (mo.momz > 0) mo.momz = 0;
    mo.z = mo.ceilingz - mo.height;
    if (mo.flags & MF.SKULLFLY) mo.momz = -mo.momz;
    if ((mo.flags & MF.MISSILE) && !(mo.flags & MF.NOCLIP)) {
      if (w.isSkyFlat(mo.subsector.sector.ceilingpic)) { removeMobj(w, mo); return; }
      if (w.fx) w.fx.missileHitPlane(mo, true);
      explodeMissile(w, mo);
    }
  }
}

function nightmareRespawn(w, mobj) {
  const sp = mobj.spawnpoint;
  if (!sp) return;
  const x = sp.x, y = sp.y;
  if (!w.checkPosition(mobj, x, y)) return;
  let mo = spawnMobj(w, mobj.x, mobj.y, mobj.subsector.sector.floorheight, MT.TFOG);
  w.sound(mo, 'telept');
  const ss = w.pointInSubsector(x, y);
  mo = spawnMobj(w, x, y, ss.sector.floorheight, MT.TFOG);
  w.sound(mo, 'telept');
  const z = (mobj.info.flags & MF.SPAWNCEILING) ? ONCEILINGZ : ONFLOORZ;
  mo = spawnMobj(w, x, y, z, mobj.type);
  mo.spawnpoint = mobj.spawnpoint;
  mo.angle = (sp.angle / 45 | 0) * Math.PI / 4;
  if (sp.options & MTF.AMBUSH) mo.flags |= MF.AMBUSH;
  mo.reactiontime = 18;
  removeMobj(w, mobj);
}

export function mobjThinker(w, mo) {
  if (mo.momx || mo.momy || (mo.flags & MF.SKULLFLY)) {
    xyMovement(w, mo);
    if (mo.removed) return;
  }
  if (mo.z !== mo.floorz || mo.momz) {
    zMovement(w, mo);
    if (mo.removed) return;
  }
  if (mo.tics !== -1) {
    mo.tics--;
    if (!mo.tics && (mo.flags & MF.CORPSE) && w.fx && w.fx.holdFrame && w.fx.holdFrame(mo)) mo.tics = 1;
    if (!mo.tics) setMobjState(w, mo, stateNext[mo.state]);
  } else {
    if (!(mo.flags & MF.COUNTKILL)) return;
    if (!w.respawnmonsters) return;
    mo.movecount++;
    if (mo.movecount < 12 * 35) return;
    if (w.leveltime & 31) return;
    if (w.rng.P() > 4) return;
    nightmareRespawn(w, mo);
  }
}

export function spawnMobj(w, x, y, z, type) {
  const mo = new Mobj(type);
  const info = mo.info;
  mo.x = x;
  mo.y = y;
  if (w.skill !== SKILL.NIGHTMARE) mo.reactiontime = info.reactiontime;
  mo.lastlook = w.rng.P() % 4;
  const st = info.spawnstate;
  mo.state = st;
  mo.tics = stateTics[st];
  mo.sprite = stateSprite[st];
  mo.frame = stateFrame[st];
  setThingPosition(w, mo);
  mo.floorz = mo.subsector.sector.floorheight;
  mo.ceilingz = mo.subsector.sector.ceilingheight;
  if (z === ONFLOORZ) mo.z = mo.floorz;
  else if (z === ONCEILINGZ) mo.z = mo.ceilingz - mo.height;
  else mo.z = z;
  mo.saveInterp();
  w.addThinker(mo);
  w.mobjs.add(mo);
  return mo;
}

export function removeMobj(w, mo) {
  if (mo.removed) return;
  unsetThingPosition(w, mo);
  mo.removed = true;
  w.mobjs.delete(mo);
  w.removeThinker(mo);
  if (w.stopSound) w.stopSound(mo);
}

export function spawnPuff(w, x, y, z, meleeRange = false) {
  z += w.rng.sub() / 64;
  const th = spawnMobj(w, x, y, z, MT.PUFF);
  th.momz = 1;
  th.tics -= w.rng.P() & 3;
  if (th.tics < 1) th.tics = 1;
  if (meleeRange) setMobjState(w, th, S.S_PUFF3);
  return th;
}

export function spawnBlood(w, x, y, z, damage, target) {
  z += w.rng.sub() / 64;
  const th = spawnMobj(w, x, y, z, MT.BLOOD);
  th.momz = 2;
  th.tics -= w.rng.P() & 3;
  if (th.tics < 1) th.tics = 1;
  if (damage <= 12 && damage >= 9) setMobjState(w, th, S.S_BLOOD2);
  else if (damage < 9) setMobjState(w, th, S.S_BLOOD3);
  if (target && w.fx && w.fx.bloodColorFor) th.bloodColor = w.fx.bloodColorFor(target);
  return th;
}

export function checkMissileSpawn(w, th) {
  th.tics -= w.rng.P() & 3;
  if (th.tics < 1) th.tics = 1;
  th.x += th.momx / 2;
  th.y += th.momy / 2;
  th.z += th.momz / 2;
  th.saveInterp();
  if (!tryMove(w, th, th.x, th.y)) explodeMissile(w, th);
}

export function spawnMissile(w, source, dest, type) {
  const th = spawnMobj(w, source.x, source.y, source.z + 32, type);
  if (th.info.seesound) w.sound(th, th.info.seesound);
  th.target = source;
  let an = pointToAngle(source.x, source.y, dest.x, dest.y);
  if (dest.flags & MF.SHADOW) an += w.rng.sub() * (TAU / 4096);
  an = normAngle(an);
  th.angle = an;
  const speed = missileSpeed(w, th);
  th.momx = speed * Math.cos(an);
  th.momy = speed * Math.sin(an);
  // Integer division like the original (fixed_t / fixed_t).
  let dist = Math.floor(aproxDistance(dest.x - source.x, dest.y - source.y) / speed);
  if (dist < 1) dist = 1;
  th.momz = (dest.z - source.z) / dist;
  checkMissileSpawn(w, th);
  return th;
}

export function missileSpeed(w, mo) {
  if (w.fastMonsters) {
    const fast = { [MT.BRUISERSHOT]: 20, [MT.HEADSHOT]: 20, [MT.TROOPSHOT]: 20 };
    if (fast[mo.type]) return fast[mo.type];
  }
  return mo.info.speed;
}

// Player missiles use the view pitch for free aim (with optional autoaim).
export function spawnPlayerMissile(w, source, type, opts = {}) {
  let an = source.angle + (opts.angleOffset || 0);
  let slope;
  const player = source.player;
  if (player && !w.settings.autoaim) {
    slope = Math.tan(player.lookPitch() + (opts.pitchOffset || 0));
  } else {
    slope = aimLineAttack(w, source, an, 16 * 64);
    if (!mapState.linetarget) {
      an += Math.PI / 32; // 1<<26
      slope = aimLineAttack(w, source, an, 16 * 64);
      if (!mapState.linetarget) {
        an -= Math.PI / 16; // 2<<26
        slope = aimLineAttack(w, source, an, 16 * 64);
      }
      if (!mapState.linetarget) {
        an = source.angle;
        slope = player ? Math.tan(player.lookPitch()) : 0;
      }
    }
  }
  const x = source.x, y = source.y;
  const z = source.z + (player ? player.shootHeight() : 32);
  const th = spawnMobj(w, x, y, z, type);
  if (th.info.seesound) w.sound(th, th.info.seesound);
  th.target = source;
  th.angle = normAngle(an);
  const speed = th.info.speed;
  // Keep total speed constant when aiming steeply.
  const cosP = 1 / Math.sqrt(1 + slope * slope);
  th.momx = speed * cosP * Math.cos(th.angle);
  th.momy = speed * cosP * Math.sin(th.angle);
  th.momz = speed * cosP * slope;
  checkMissileSpawn(w, th);
  return th;
}

export function spawnMapThing(w, mthing) {
  if (mthing.type === 11) return null;
  if (mthing.type >= 1 && mthing.type <= 4) {
    if (mthing.type === 1) w.playerStart = mthing;
    return null;
  }
  if (mthing.options & MTF.NOTSINGLE) return null;
  let bit;
  if (w.skill === SKILL.BABY) bit = 1;
  else if (w.skill === SKILL.NIGHTMARE) bit = 4;
  else bit = 1 << (w.skill - 1);
  if (!(mthing.options & bit)) return null;
  const type = DOOMEDNUM.get(mthing.type);
  if (type === undefined) return null;
  const info = MOBJINFO[type];
  if (w.nomonsters && (type === MT.SKULL || (info.flags & MF.COUNTKILL))) return null;
  // Sprites missing from the loaded WADs cannot be shown; skip such things.
  if (w.res && !w.res.sprites[stateSprite[info.spawnstate]]?.length) return null;
  const z = (info.flags & MF.SPAWNCEILING) ? ONCEILINGZ : ONFLOORZ;
  const mo = spawnMobj(w, mthing.x, mthing.y, z, type);
  mo.spawnpoint = mthing;
  if (mo.tics > 0) mo.tics = 1 + (w.rng.P() % mo.tics);
  if (mo.flags & MF.COUNTKILL) w.totalkills++;
  if (mo.flags & MF.COUNTITEM) w.totalitems++;
  mo.angle = ((mthing.angle / 45) | 0) * (Math.PI / 4);
  mo.saveInterp();
  if (mthing.options & MTF.AMBUSH) mo.flags |= MF.AMBUSH;
  return mo;
}

export { VIEWHEIGHT };
