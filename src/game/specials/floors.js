// Port of p_floor.c (T_MoveFloor, EV_DoFloor, EV_BuildStairs) and
// EV_DoDonut from p_spec.c.

import { ML } from '../mapdata.js';
import {
  PASTDEST, MAXINT_UNITS, movePlane, sectorSound, findSectorFromLineTag, getNextSector,
  findLowestFloorSurrounding, findHighestFloorSurrounding, findNextHighestFloor, findLowestCeilingSurrounding,
} from './util.js';

export const FLOORSPEED = 1;

// The stair builder never initialises floor->crush; Chocolate Doom models the
// garbage as a value that is truthy but not `true` (crunches, still stops).
const STAIRS_UNINITIALIZED_CRUSH = 10;

export class FloorMove {
  constructor(sector, type) {
    this.sector = sector;
    this.type = type;
    this.crush = false;
    this.direction = 0;
    this.newspecial = sector.special;
    this.texture = sector.floorpic;
    this.floordestheight = sector.floorheight;
    this.speed = FLOORSPEED;
  }

  think(w) {
    const sec = this.sector;
    const res = movePlane(w, sec, this.speed, this.floordestheight, this.crush, 0, this.direction);
    if (!(w.leveltime & 7)) sectorSound(w, sec, 'stnmov');
    if (res === PASTDEST) {
      sec.specialdata = null;
      if (this.direction === 1) {
        if (this.type === 'donutRaise') {
          sec.special = this.newspecial;
          sec.floorpic = this.texture;
          w.sectorChanged(sec);
        }
      } else if (this.direction === -1) {
        if (this.type === 'lowerAndChange') {
          sec.special = this.newspecial;
          sec.floorpic = this.texture;
          w.sectorChanged(sec);
        }
      }
      w.removeThinker(this);
      sectorSound(w, sec, 'pstop');
    }
  }
}

function textureHeight(w, num) {
  const tex = w.res.textures[num];
  return tex ? tex.height : 0;
}

// EV_DoFloor
export function doFloor(sp, line, floortype) {
  const w = sp.w;
  const sectors = w.level.sectors;
  let secnum = -1;
  let rtn = false;
  while ((secnum = findSectorFromLineTag(sectors, line, secnum)) >= 0) {
    const sec = sectors[secnum];
    // Already moving? If so, keep going...
    if (sec.specialdata) continue;
    rtn = true;
    const floor = new FloorMove(sec, floortype);
    w.addThinker(floor);
    sec.specialdata = floor;
    floor.crush = false;
    switch (floortype) {
      case 'lowerFloor':
        floor.direction = -1;
        floor.speed = FLOORSPEED;
        floor.floordestheight = findHighestFloorSurrounding(sec);
        break;
      case 'lowerFloorToLowest':
        floor.direction = -1;
        floor.speed = FLOORSPEED;
        floor.floordestheight = findLowestFloorSurrounding(sec);
        break;
      case 'turboLower':
        floor.direction = -1;
        floor.speed = FLOORSPEED * 4;
        floor.floordestheight = findHighestFloorSurrounding(sec);
        if (floor.floordestheight !== sec.floorheight) floor.floordestheight += 8;
        break;
      case 'raiseFloorCrush':
      case 'raiseFloor':
        if (floortype === 'raiseFloorCrush') floor.crush = true;
        floor.direction = 1;
        floor.speed = FLOORSPEED;
        floor.floordestheight = findLowestCeilingSurrounding(sec);
        if (floor.floordestheight > sec.ceilingheight) floor.floordestheight = sec.ceilingheight;
        if (floortype === 'raiseFloorCrush') floor.floordestheight -= 8;
        break;
      case 'raiseFloorTurbo':
        floor.direction = 1;
        floor.speed = FLOORSPEED * 4;
        floor.floordestheight = findNextHighestFloor(sec, sec.floorheight);
        break;
      case 'raiseFloorToNearest':
        floor.direction = 1;
        floor.speed = FLOORSPEED;
        floor.floordestheight = findNextHighestFloor(sec, sec.floorheight);
        break;
      case 'raiseFloor24':
        floor.direction = 1;
        floor.speed = FLOORSPEED;
        floor.floordestheight = sec.floorheight + 24;
        break;
      case 'raiseFloor512':
        floor.direction = 1;
        floor.speed = FLOORSPEED;
        floor.floordestheight = sec.floorheight + 512;
        break;
      case 'raiseFloor24AndChange':
        floor.direction = 1;
        floor.speed = FLOORSPEED;
        floor.floordestheight = sec.floorheight + 24;
        if (line.frontsector) {
          sec.floorpic = line.frontsector.floorpic;
          sec.special = line.frontsector.special;
          w.sectorChanged(sec);
        }
        break;
      case 'raiseToTexture': {
        // Vanilla counts "no texture" (0) too, as textureheight[0].
        let minsize = MAXINT_UNITS;
        floor.direction = 1;
        floor.speed = FLOORSPEED;
        for (const ln of sec.lines) {
          if (!(ln.flags & ML.TWOSIDED)) continue;
          if (ln.front) minsize = Math.min(minsize, textureHeight(w, ln.front.bottomtexture));
          if (ln.back) minsize = Math.min(minsize, textureHeight(w, ln.back.bottomtexture));
        }
        floor.floordestheight = sec.floorheight + minsize;
        break;
      }
      case 'lowerAndChange':
        floor.direction = -1;
        floor.speed = FLOORSPEED;
        floor.floordestheight = findLowestFloorSurrounding(sec);
        floor.texture = sec.floorpic;
        for (const ln of sec.lines) {
          if (!(ln.flags & ML.TWOSIDED)) continue;
          let other;
          if (ln.front && ln.front.sector === sec) other = ln.back ? ln.back.sector : null;
          else other = ln.front ? ln.front.sector : null;
          if (other && other.floorheight === floor.floordestheight) {
            floor.texture = other.floorpic;
            floor.newspecial = other.special;
            break;
          }
        }
        break;
      default: break;
    }
  }
  return rtn;
}

// EV_BuildStairs. Like vanilla, the outer tag search resumes from the last
// stair sector raised rather than from the tagged sector.
export function buildStairs(sp, line, type) {
  const w = sp.w;
  const sectors = w.level.sectors;
  let secnum = -1;
  let rtn = false;
  let speed, stairsize;
  if (type === 'turbo16') {
    speed = FLOORSPEED * 4;
    stairsize = 16;
  } else {
    speed = FLOORSPEED / 4;
    stairsize = 8;
  }
  while ((secnum = findSectorFromLineTag(sectors, line, secnum)) >= 0) {
    let sec = sectors[secnum];
    // Already moving? If so, keep going...
    if (sec.specialdata) continue;
    rtn = true;
    let floor = new FloorMove(sec, 'lowerFloor');
    w.addThinker(floor);
    sec.specialdata = floor;
    floor.direction = 1;
    floor.speed = speed;
    floor.crush = STAIRS_UNINITIALIZED_CRUSH;
    let height = sec.floorheight + stairsize;
    floor.floordestheight = height;
    const texture = sec.floorpic;

    // Find next sector to raise:
    // 1. Find 2-sided line with same sector side[0]
    // 2. Other side is the next sector to raise
    let ok;
    do {
      ok = false;
      for (const ln of sec.lines) {
        if (!(ln.flags & ML.TWOSIDED)) continue;
        if (ln.frontsector !== sec) continue;
        const tsec = ln.backsector;
        if (!tsec) continue;
        if (tsec.floorpic !== texture) continue;
        height += stairsize;
        if (tsec.specialdata) continue;
        sec = tsec;
        secnum = tsec.index;
        floor = new FloorMove(sec, 'lowerFloor');
        w.addThinker(floor);
        sec.specialdata = floor;
        floor.direction = 1;
        floor.speed = speed;
        floor.crush = STAIRS_UNINITIALIZED_CRUSH;
        floor.floordestheight = height;
        ok = true;
        break;
      }
    } while (ok);
  }
  return rtn;
}

// EV_DoDonut
export function doDonut(sp, line) {
  const w = sp.w;
  const sectors = w.level.sectors;
  let secnum = -1;
  let rtn = false;
  while ((secnum = findSectorFromLineTag(sectors, line, secnum)) >= 0) {
    const s1 = sectors[secnum];
    // Already moving? If so, keep going...
    if (s1.specialdata) continue;
    rtn = true;
    const s2 = s1.lines.length ? getNextSector(s1.lines[0], s1) : null;
    if (!s2) continue; // vanilla dereferences NULL here
    for (const ln of s2.lines) {
      // Vanilla's `(!flags & ML_TWOSIDED)` test is always false, so only the
      // back sector check is effective.
      if (ln.backsector === s1) continue;
      const s3 = ln.backsector;
      if (!s3) continue; // vanilla reads garbage here

      // Spawn rising slime
      let floor = new FloorMove(s2, 'donutRaise');
      w.addThinker(floor);
      s2.specialdata = floor;
      floor.crush = false;
      floor.direction = 1;
      floor.speed = FLOORSPEED / 2;
      floor.texture = s3.floorpic;
      floor.newspecial = 0;
      floor.floordestheight = s3.floorheight;

      // Spawn lowering donut-hole
      floor = new FloorMove(s1, 'lowerFloor');
      w.addThinker(floor);
      s1.specialdata = floor;
      floor.crush = false;
      floor.direction = -1;
      floor.speed = FLOORSPEED / 2;
      floor.floordestheight = s3.floorheight;
      break;
    }
  }
  return rtn;
}
