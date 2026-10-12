// Port of p_ceilng.c: moving ceilings and crushers, with in-stasis handling.

import {
  PASTDEST, CRUSHED, movePlane, sectorSound, findSectorFromLineTag, findHighestCeilingSurrounding,
} from './util.js';

export const CEILSPEED = 1;
export const CEILWAIT = 150;

export class Ceiling {
  constructor(sp, sector, type) {
    this.sp = sp;
    this.sector = sector;
    this.type = type;
    this.bottomheight = sector.floorheight;
    this.topheight = sector.ceilingheight;
    this.speed = CEILSPEED;
    this.crush = false;
    this.direction = 0; // 1 = up, 0 = in stasis, -1 = down
    this.tag = 0;
    this.olddirection = 0;
  }

  think(w) {
    const sec = this.sector;
    let res;
    switch (this.direction) {
      case 0:
        // In stasis
        break;
      case 1:
        // Up
        res = movePlane(w, sec, this.speed, this.topheight, false, 1, this.direction);
        if (!(w.leveltime & 7) && this.type !== 'silentCrushAndRaise') sectorSound(w, sec, 'stnmov');
        if (res === PASTDEST) {
          switch (this.type) {
            case 'raiseToHighest':
              removeActiveCeiling(this.sp, this);
              break;
            case 'silentCrushAndRaise':
              sectorSound(w, sec, 'pstop');
              // fallthrough
            case 'fastCrushAndRaise':
            case 'crushAndRaise':
              this.direction = -1;
              break;
            default: break;
          }
        }
        break;
      case -1:
        // Down
        res = movePlane(w, sec, this.speed, this.bottomheight, this.crush, 1, this.direction);
        if (!(w.leveltime & 7) && this.type !== 'silentCrushAndRaise') sectorSound(w, sec, 'stnmov');
        if (res === PASTDEST) {
          switch (this.type) {
            case 'silentCrushAndRaise':
              sectorSound(w, sec, 'pstop');
              // fallthrough
            case 'crushAndRaise':
              this.speed = CEILSPEED;
              // fallthrough
            case 'fastCrushAndRaise':
              this.direction = 1;
              break;
            case 'lowerAndCrush':
            case 'lowerToFloor':
              removeActiveCeiling(this.sp, this);
              break;
            default: break;
          }
        } else if (res === CRUSHED) {
          switch (this.type) {
            case 'silentCrushAndRaise':
            case 'crushAndRaise':
            case 'lowerAndCrush':
              this.speed = CEILSPEED / 8;
              break;
            default: break;
          }
        }
        break;
      default: break;
    }
  }
}

// EV_DoCeiling
export function doCeiling(sp, line, type) {
  const w = sp.w;
  const sectors = w.level.sectors;
  let secnum = -1;
  let rtn = false;

  // Reactivate in-stasis ceilings... for certain types.
  switch (type) {
    case 'fastCrushAndRaise':
    case 'silentCrushAndRaise':
    case 'crushAndRaise':
      activateInStasisCeiling(sp, line);
      break;
    default: break;
  }

  while ((secnum = findSectorFromLineTag(sectors, line, secnum)) >= 0) {
    const sec = sectors[secnum];
    if (sec.specialdata) continue;
    rtn = true;
    const ceiling = new Ceiling(sp, sec, type);
    w.addThinker(ceiling);
    sec.specialdata = ceiling;
    ceiling.crush = false;
    switch (type) {
      case 'fastCrushAndRaise':
        ceiling.crush = true;
        ceiling.topheight = sec.ceilingheight;
        ceiling.bottomheight = sec.floorheight + 8;
        ceiling.direction = -1;
        ceiling.speed = CEILSPEED * 2;
        break;
      case 'silentCrushAndRaise':
      case 'crushAndRaise':
      case 'lowerAndCrush':
      case 'lowerToFloor':
        if (type === 'silentCrushAndRaise' || type === 'crushAndRaise') {
          ceiling.crush = true;
          ceiling.topheight = sec.ceilingheight;
        }
        ceiling.bottomheight = sec.floorheight;
        if (type !== 'lowerToFloor') ceiling.bottomheight += 8;
        ceiling.direction = -1;
        ceiling.speed = CEILSPEED;
        break;
      case 'raiseToHighest':
        ceiling.topheight = findHighestCeilingSurrounding(sec);
        ceiling.direction = 1;
        ceiling.speed = CEILSPEED;
        break;
      default: break;
    }
    ceiling.tag = sec.tag;
    addActiveCeiling(sp, ceiling);
  }
  return rtn;
}

export function addActiveCeiling(sp, c) {
  const list = sp.activeceilings;
  const i = list.indexOf(null);
  if (i >= 0) list[i] = c;
  else list.push(c);
}

export function removeActiveCeiling(sp, c) {
  const list = sp.activeceilings;
  const i = list.indexOf(c);
  if (i < 0) return;
  c.sector.specialdata = null;
  sp.w.removeThinker(c);
  list[i] = null;
}

// Restart a ceiling that's in stasis.
export function activateInStasisCeiling(sp, line) {
  for (const c of sp.activeceilings) {
    if (c && c.tag === line.tag && c.direction === 0) c.direction = c.olddirection;
  }
}

// EV_CeilingCrushStop: stop a ceiling from crushing!
export function ceilingCrushStop(sp, line) {
  let rtn = false;
  for (const c of sp.activeceilings) {
    if (c && c.tag === line.tag && c.direction !== 0) {
      c.olddirection = c.direction;
      c.direction = 0; // in stasis
      rtn = true;
    }
  }
  return rtn;
}
