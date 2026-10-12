// Port of p_doors.c: vertical doors (raise, open, close, blazing variants,
// locked doors and the timed sector-special doors).

import { CARDS } from '../defs.js';
import { STRINGS } from '../data.js';
import {
  OK, CRUSHED, PASTDEST, movePlane, sectorSound, findSectorFromLineTag, findLowestCeilingSurrounding,
} from './util.js';
import { Plat } from './plats.js';

export const VDOORSPEED = 2;
export const VDOORWAIT = 150;

export class VerticalDoor {
  constructor(sector, type) {
    this.sector = sector;
    this.type = type;
    this.topheight = sector.ceilingheight;
    this.speed = VDOORSPEED;
    this.direction = 0; // 1 = up, 0 = waiting at top, -1 = down, 2 = initial wait
    this.topwait = VDOORWAIT;
    this.topcountdown = 0;
  }

  think(w) {
    const sec = this.sector;
    let res = OK;
    switch (this.direction) {
      case 0:
        // Waiting
        if (!--this.topcountdown) {
          switch (this.type) {
            case 'blazeRaise':
              this.direction = -1;
              sectorSound(w, sec, 'bdcls');
              break;
            case 'normal':
              this.direction = -1;
              sectorSound(w, sec, 'dorcls');
              break;
            case 'close30ThenOpen':
              this.direction = 1;
              sectorSound(w, sec, 'doropn');
              break;
            default: break;
          }
        }
        break;
      case 2:
        // Initial wait
        if (!--this.topcountdown) {
          if (this.type === 'raiseIn5Mins') {
            this.direction = 1;
            this.type = 'normal';
            sectorSound(w, sec, 'doropn');
          }
        }
        break;
      case -1:
        // Down
        res = movePlane(w, sec, this.speed, sec.floorheight, false, 1, this.direction);
        if (res === PASTDEST) {
          switch (this.type) {
            case 'blazeRaise':
            case 'blazeClose':
              sec.specialdata = null;
              w.removeThinker(this);
              sectorSound(w, sec, 'bdcls');
              break;
            case 'normal':
            case 'close':
              sec.specialdata = null;
              w.removeThinker(this);
              break;
            case 'close30ThenOpen':
              this.direction = 0;
              this.topcountdown = 35 * 30;
              break;
            default: break;
          }
        } else if (res === CRUSHED) {
          switch (this.type) {
            case 'blazeClose':
            case 'close': // Do not go back up!
              break;
            default:
              this.direction = 1;
              sectorSound(w, sec, 'doropn');
              break;
          }
        }
        break;
      case 1:
        // Up
        res = movePlane(w, sec, this.speed, this.topheight, false, 1, this.direction);
        if (res === PASTDEST) {
          switch (this.type) {
            case 'blazeRaise':
            case 'normal':
              this.direction = 0; // wait at top
              this.topcountdown = this.topwait;
              break;
            case 'close30ThenOpen':
            case 'blazeOpen':
            case 'open':
              sec.specialdata = null;
              w.removeThinker(this);
              break;
            default: break;
          }
        }
        break;
      default: break;
    }
  }
}

function lockMessage(w, player, msg) {
  player.message = msg;
  w.sound(null, 'oof');
}

// EV_DoLockedDoor: switch-operated locked doors (99, 133-137).
export function doLockedDoor(sp, line, type, thing) {
  const p = thing.player;
  if (!p) return false;
  switch (line.special) {
    case 99: // Blue lock
    case 133:
      if (!p.cards[CARDS.BLUECARD] && !p.cards[CARDS.BLUESKULL]) {
        lockMessage(sp.w, p, STRINGS.PD_BLUEO);
        return false;
      }
      break;
    case 134: // Red lock
    case 135:
      if (!p.cards[CARDS.REDCARD] && !p.cards[CARDS.REDSKULL]) {
        lockMessage(sp.w, p, STRINGS.PD_REDO);
        return false;
      }
      break;
    case 136: // Yellow lock
    case 137:
      if (!p.cards[CARDS.YELLOWCARD] && !p.cards[CARDS.YELLOWSKULL]) {
        lockMessage(sp.w, p, STRINGS.PD_YELLOWO);
        return false;
      }
      break;
    default: break;
  }
  return doDoor(sp, line, type);
}

// EV_DoDoor: tagged doors.
export function doDoor(sp, line, type) {
  const w = sp.w;
  const sectors = w.level.sectors;
  let secnum = -1;
  let rtn = false;
  while ((secnum = findSectorFromLineTag(sectors, line, secnum)) >= 0) {
    const sec = sectors[secnum];
    if (sec.specialdata) continue;
    rtn = true;
    const door = new VerticalDoor(sec, type);
    w.addThinker(door);
    sec.specialdata = door;
    switch (type) {
      case 'blazeClose':
        door.topheight = findLowestCeilingSurrounding(sec) - 4;
        door.direction = -1;
        door.speed = VDOORSPEED * 4;
        sectorSound(w, sec, 'bdcls');
        break;
      case 'close':
        door.topheight = findLowestCeilingSurrounding(sec) - 4;
        door.direction = -1;
        sectorSound(w, sec, 'dorcls');
        break;
      case 'close30ThenOpen':
        door.topheight = sec.ceilingheight;
        door.direction = -1;
        sectorSound(w, sec, 'dorcls');
        break;
      case 'blazeRaise':
      case 'blazeOpen':
        door.direction = 1;
        door.topheight = findLowestCeilingSurrounding(sec) - 4;
        door.speed = VDOORSPEED * 4;
        if (door.topheight !== sec.ceilingheight) sectorSound(w, sec, 'bdopn');
        break;
      case 'normal':
      case 'open':
        door.direction = 1;
        door.topheight = findLowestCeilingSurrounding(sec) - 4;
        if (door.topheight !== sec.ceilingheight) sectorSound(w, sec, 'doropn');
        break;
      default: break;
    }
  }
  return rtn;
}

// EV_VerticalDoor: manual (use) doors, acting on the sector behind the line.
export function verticalDoor(sp, line, thing) {
  const w = sp.w;
  const player = thing.player;
  // Check for locks
  switch (line.special) {
    case 26: // Blue lock
    case 32:
      if (!player) return;
      if (!player.cards[CARDS.BLUECARD] && !player.cards[CARDS.BLUESKULL]) {
        lockMessage(w, player, STRINGS.PD_BLUEK);
        return;
      }
      break;
    case 27: // Yellow lock
    case 34:
      if (!player) return;
      if (!player.cards[CARDS.YELLOWCARD] && !player.cards[CARDS.YELLOWSKULL]) {
        lockMessage(w, player, STRINGS.PD_YELLOWK);
        return;
      }
      break;
    case 28: // Red lock
    case 33:
      if (!player) return;
      if (!player.cards[CARDS.REDCARD] && !player.cards[CARDS.REDSKULL]) {
        lockMessage(w, player, STRINGS.PD_REDK);
        return;
      }
      break;
    default: break;
  }

  // Only front sides can be used, so the door is the back sector.
  if (!line.back) return;
  const sec = line.back.sector;

  // If the sector has an active thinker, use it.
  if (sec.specialdata) {
    const door = sec.specialdata;
    switch (line.special) {
      case 1: // Only for "raise" doors, not "open"s
      case 26:
      case 27:
      case 28:
      case 117:
        if (door instanceof VerticalDoor) {
          if (door.direction === -1) door.direction = 1; // go back up
          else {
            if (!thing.player) return; // JDC: bad guys never close doors
            door.direction = -1; // start going down immediately
          }
        } else if (door instanceof Plat) {
          // Vanilla writes door->direction into whatever thinker owns the
          // sector; for a plat that field is `wait` (as Chocolate Doom does).
          if (door.wait === -1) door.wait = 1;
          else if (thing.player) door.wait = -1;
        }
        return;
      default: break;
    }
  }

  // For proper sound
  switch (line.special) {
    case 117: // Blazing door raise
    case 118: // Blazing door open
      sectorSound(w, sec, 'bdopn');
      break;
    default: // Normal and locked door sound
      sectorSound(w, sec, 'doropn');
      break;
  }

  // New door thinker
  const door = new VerticalDoor(sec, 'normal');
  w.addThinker(door);
  sec.specialdata = door;
  door.direction = 1;
  door.speed = VDOORSPEED;
  door.topwait = VDOORWAIT;
  switch (line.special) {
    case 1:
    case 26:
    case 27:
    case 28:
      door.type = 'normal';
      break;
    case 31:
    case 32:
    case 33:
    case 34:
      door.type = 'open';
      line.special = 0;
      break;
    case 117: // Blazing door raise
      door.type = 'blazeRaise';
      door.speed = VDOORSPEED * 4;
      break;
    case 118: // Blazing door open
      door.type = 'blazeOpen';
      line.special = 0;
      door.speed = VDOORSPEED * 4;
      break;
    default: break;
  }
  // Find the top of the movement range
  door.topheight = findLowestCeilingSurrounding(sec) - 4;
}

// Sector special 10: door closes after 30 seconds.
export function spawnDoorCloseIn30(sp, sec) {
  const door = new VerticalDoor(sec, 'normal');
  sp.w.addThinker(door);
  sec.specialdata = door;
  sec.special = 0;
  door.direction = 0;
  door.speed = VDOORSPEED;
  door.topcountdown = 30 * 35;
}

// Sector special 14: door raises after 5 minutes.
export function spawnDoorRaiseIn5Mins(sp, sec) {
  const door = new VerticalDoor(sec, 'raiseIn5Mins');
  sp.w.addThinker(door);
  sec.specialdata = door;
  sec.special = 0;
  door.direction = 2;
  door.speed = VDOORSPEED;
  door.topheight = findLowestCeilingSurrounding(sec) - 4;
  door.topwait = VDOORWAIT;
  door.topcountdown = 5 * 60 * 35;
}
