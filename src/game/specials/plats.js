// Port of p_plats.c: lifts and raising platforms, with in-stasis handling
// for perpetual platforms.

import {
  CRUSHED, PASTDEST, movePlane, sectorSound, findSectorFromLineTag,
  findLowestFloorSurrounding, findHighestFloorSurrounding, findNextHighestFloor,
} from './util.js';

export const PLATWAIT = 3;
export const PLATSPEED = 1;

// plat_e
export const UP = 0;
export const DOWN = 1;
export const WAITING = 2;
export const IN_STASIS = 3;

export class Plat {
  constructor(sp, sector, type) {
    this.sp = sp;
    this.sector = sector;
    this.type = type;
    this.speed = PLATSPEED;
    this.low = sector.floorheight;
    this.high = sector.floorheight;
    this.wait = 0;
    this.count = 0;
    this.status = UP;
    this.oldstatus = UP;
    this.crush = false;
    this.tag = 0;
  }

  think(w) {
    const sec = this.sector;
    let res;
    switch (this.status) {
      case UP:
        res = movePlane(w, sec, this.speed, this.high, this.crush, 0, 1);
        if (this.type === 'raiseAndChange' || this.type === 'raiseToNearestAndChange') {
          if (!(w.leveltime & 7)) sectorSound(w, sec, 'stnmov');
        }
        if (res === CRUSHED && !this.crush) {
          this.count = this.wait;
          this.status = DOWN;
          sectorSound(w, sec, 'pstart');
        } else if (res === PASTDEST) {
          this.count = this.wait;
          this.status = WAITING;
          sectorSound(w, sec, 'pstop');
          switch (this.type) {
            case 'blazeDWUS':
            case 'downWaitUpStay':
            case 'raiseAndChange':
            case 'raiseToNearestAndChange':
              removeActivePlat(this.sp, this);
              break;
            default: break;
          }
        }
        break;
      case DOWN:
        res = movePlane(w, sec, this.speed, this.low, false, 0, -1);
        if (res === PASTDEST) {
          this.count = this.wait;
          this.status = WAITING;
          sectorSound(w, sec, 'pstop');
        }
        break;
      case WAITING:
        if (!--this.count) {
          this.status = sec.floorheight === this.low ? UP : DOWN;
          sectorSound(w, sec, 'pstart');
        }
        break;
      default: // IN_STASIS
        break;
    }
  }
}

// EV_DoPlat. `amount` is only used by raiseAndChange.
export function doPlat(sp, line, type, amount = 0) {
  const w = sp.w;
  const sectors = w.level.sectors;
  let secnum = -1;
  let rtn = false;

  // Activate all <type> plats that are in stasis
  if (type === 'perpetualRaise') activateInStasis(sp, line.tag);

  while ((secnum = findSectorFromLineTag(sectors, line, secnum)) >= 0) {
    const sec = sectors[secnum];
    if (sec.specialdata) continue;
    rtn = true;
    const plat = new Plat(sp, sec, type);
    w.addThinker(plat);
    sec.specialdata = plat;
    plat.crush = false;
    plat.tag = line.tag;
    const frontsec = line.front ? line.front.sector : line.frontsector;
    switch (type) {
      case 'raiseToNearestAndChange':
        plat.speed = PLATSPEED / 2;
        if (frontsec) sec.floorpic = frontsec.floorpic;
        plat.high = findNextHighestFloor(sec, sec.floorheight);
        plat.wait = 0;
        plat.status = UP;
        // No more damage, if applicable
        sec.special = 0;
        w.sectorChanged(sec);
        sectorSound(w, sec, 'stnmov');
        break;
      case 'raiseAndChange':
        plat.speed = PLATSPEED / 2;
        if (frontsec) sec.floorpic = frontsec.floorpic;
        plat.high = sec.floorheight + amount;
        plat.wait = 0;
        plat.status = UP;
        w.sectorChanged(sec);
        sectorSound(w, sec, 'stnmov');
        break;
      case 'downWaitUpStay':
        plat.speed = PLATSPEED * 4;
        plat.low = findLowestFloorSurrounding(sec);
        if (plat.low > sec.floorheight) plat.low = sec.floorheight;
        plat.high = sec.floorheight;
        plat.wait = 35 * PLATWAIT;
        plat.status = DOWN;
        sectorSound(w, sec, 'pstart');
        break;
      case 'blazeDWUS':
        plat.speed = PLATSPEED * 8;
        plat.low = findLowestFloorSurrounding(sec);
        if (plat.low > sec.floorheight) plat.low = sec.floorheight;
        plat.high = sec.floorheight;
        plat.wait = 35 * PLATWAIT;
        plat.status = DOWN;
        sectorSound(w, sec, 'pstart');
        break;
      case 'perpetualRaise':
        plat.speed = PLATSPEED;
        plat.low = findLowestFloorSurrounding(sec);
        if (plat.low > sec.floorheight) plat.low = sec.floorheight;
        plat.high = findHighestFloorSurrounding(sec);
        if (plat.high < sec.floorheight) plat.high = sec.floorheight;
        plat.wait = 35 * PLATWAIT;
        plat.status = w.rng.P() & 1; // UP or DOWN
        sectorSound(w, sec, 'pstart');
        break;
      default: break;
    }
    addActivePlat(sp, plat);
  }
  return rtn;
}

export function activateInStasis(sp, tag) {
  for (const plat of sp.activeplats) {
    if (plat && plat.tag === tag && plat.status === IN_STASIS) plat.status = plat.oldstatus;
  }
}

// EV_StopPlat
export function stopPlat(sp, line) {
  for (const plat of sp.activeplats) {
    if (plat && plat.status !== IN_STASIS && plat.tag === line.tag) {
      plat.oldstatus = plat.status;
      plat.status = IN_STASIS;
    }
  }
}

// The original has a fixed table of 30 plats; slots are reused the same way
// but the table grows instead of aborting the game.
export function addActivePlat(sp, plat) {
  const list = sp.activeplats;
  const i = list.indexOf(null);
  if (i >= 0) list[i] = plat;
  else list.push(plat);
}

export function removeActivePlat(sp, plat) {
  const list = sp.activeplats;
  const i = list.indexOf(plat);
  if (i < 0) return;
  plat.sector.specialdata = null;
  sp.w.removeThinker(plat);
  list[i] = null;
}
