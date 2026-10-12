// A running level: map data, thinkers, objects and the glue API that the
// ported subsystems call (the equivalent of DOOM's level globals).

import { Random, MF, SKILL, ONFLOORZ, normAngle } from './defs.js';
import { MT } from './tables.js';
import { loadMapData, pointInSubsector } from './mapdata.js';
import { setThingPosition, unsetThingPosition } from './maputl.js';
import {
  spawnMobj, removeMobj, setMobjState, spawnPuff, spawnBlood, spawnMapThing, explodeMissile,
} from './mobj.js';
import { checkPosition, tryMove, changeSector } from './map.js';
import { checkSight } from './sight.js';
import { damageMobj, touchSpecialThing } from './inter.js';
import { move as enemyMove } from './enemy.js';
import { playerThink, spawnPlayerSetup, STAND_HEIGHT } from './player.js';
import { Specials } from './specials/specials.js';

export class World {
  constructor(opts) {
    this.game = opts.game || null;
    this.res = opts.res;
    this.settings = opts.settings;
    this.mapName = opts.mapName;
    this.episode = opts.episode;
    this.map = opts.map;
    this.commercial = !!opts.commercial;
    this.gamemode = opts.gamemode || 'shareware';
    this.skill = opts.skill;
    this.fastMonsters = opts.skill === SKILL.NIGHTMARE || !!opts.fast;
    this.respawnmonsters = opts.skill === SKILL.NIGHTMARE || !!opts.respawn;
    this.nomonsters = !!opts.nomonsters;
    this.rng = new Random();
    this.modSeed = 0; // state of modRandom() (defs.js), separate from P_Random
    this.leveltime = 0;
    this.gametic = 0;
    this.validcount = 1;
    this.thinkers = [];
    this.pendingThinkers = [];
    this.mobjs = new Set();
    this.totalkills = 0;
    this.totalitems = 0;
    this.totalsecret = 0;
    this.player = opts.player;
    this.playerStart = null;
    this.exitRequest = null;
    this.fx = null;
    this.audio = opts.audio || null;
    this.hooks = { sideChanged: null, sectorChanged: null };
    this.level = loadMapData(opts.lumps, this.res);
    this.skyFlatIndex = this.res.skyFlat ? this.res.skyFlat.index : -1;
    this.specials = new Specials(this);
  }

  // --- Setup --------------------------------------------------------------

  start() {
    for (const mt of this.level.mapthings) spawnMapThing(this, mt);
    this.spawnPlayer();
    this.specials.spawnSpecials();
  }

  spawnPlayer() {
    const mt = this.playerStart || { x: 0, y: 0, angle: 0 };
    const p = this.player;
    if (p.playerstate === 'reborn') p.reborn();
    const mo = spawnMobj(this, mt.x, mt.y, ONFLOORZ, MT.PLAYER);
    mo.angle = normAngle(((mt.angle / 45) | 0) * (Math.PI / 4));
    mo.saveInterp();
    mo.player = p;
    mo.health = p.health;
    p.mo = mo;
    spawnPlayerSetup(this, p);
    if (this.fx && this.fx.playerSpawned) this.fx.playerSpawned(p);
  }

  // --- Thinkers -------------------------------------------------------------

  addThinker(t) {
    t.removed = false;
    this.thinkers.push(t);
  }

  removeThinker(t) {
    t.removed = true;
  }

  tick() {
    const p = this.player;
    for (const s of this.level.sectors) {
      s.prevFloor = s.floorheight;
      s.prevCeil = s.ceilingheight;
    }
    for (const mo of this.mobjs) mo.saveInterp();
    if (p && p.mo) {
      p.prevPitch = p.pitch;
      p.prevViewz = p.viewz;
    }
    if (p && p.mo && p.playerstate !== 'reborn') playerThink(this, p);
    // Run thinkers; like vanilla's linked list, thinkers added during the
    // loop are appended and still run this tic.
    const list = this.thinkers;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (!t.removed) t.think(this);
    }
    if (list.some((t) => t.removed)) this.thinkers = list.filter((t) => !t.removed);
    this.specials.updateSpecials();
    if (this.fx) this.fx.tick();
    this.leveltime++;
    this.gametic++;
  }

  // --- Glue API used by ported code ---------------------------------------

  pointInSubsector(x, y) { return pointInSubsector(this.level, x, y); }
  isSkyFlat(pic) { return pic === this.skyFlatIndex; }
  checkSight(a, b) { return checkSight(this, a, b); }
  checkPosition(mo, x, y) { return checkPosition(this, mo, x, y); }
  tryMove(mo, x, y) { return tryMove(this, mo, x, y); }
  changeSector(sector, crunch) { return changeSector(this, sector, crunch); }
  spawnMobj(x, y, z, type) { return spawnMobj(this, x, y, z, type); }
  removeMobj(mo) { removeMobj(this, mo); }
  setMobjState(mo, st) { return setMobjState(this, mo, st); }
  explodeMissile(mo) { explodeMissile(this, mo); }
  spawnPuff(x, y, z, melee) { return spawnPuff(this, x, y, z, melee); }
  spawnBlood(x, y, z, damage, target) { return spawnBlood(this, x, y, z, damage, target); }
  damageMobj(target, inflictor, source, damage, hit) { damageMobj(this, target, inflictor, source, damage, hit); }
  touchSpecialThing(special, toucher) { touchSpecialThing(this, special, toucher); }
  setThingPosition(mo) { setThingPosition(this, mo); }
  unsetThingPosition(mo) { unsetThingPosition(this, mo); }
  enemyMove(actor) { return enemyMove(this, actor); }

  crossSpecialLine(line, side, thing) { this.specials.crossSpecialLine(line, side, thing); }
  useSpecialLine(thing, line, side) { return this.specials.useSpecialLine(thing, line, side); }
  shootSpecialLine(thing, line) { this.specials.shootSpecialLine(thing, line); }

  sideChanged(side) { if (this.hooks.sideChanged) this.hooks.sideChanged(side); }
  sectorChanged(sector) { if (this.hooks.sectorChanged) this.hooks.sectorChanged(sector); }

  sound(origin, name, opts) {
    if (this.audio && name) this.audio.start(origin, name, opts);
  }

  stopSound(origin) {
    if (this.audio) this.audio.stopOrigin(origin);
  }

  exitLevel(secret = false) {
    if (!this.exitRequest) this.exitRequest = { secret };
  }

  // Compatibility rule: jumping can be disabled per map/sector.
  jumpAllowedAt(mo) {
    const compat = this.compat;
    if (!compat) return true;
    if (compat.noJump === true) return false;
    if (compat.noJumpSectors && compat.noJumpSectors.includes(mo.subsector.sector.index)) return false;
    return true;
  }
}

export { STAND_HEIGHT, MF };
