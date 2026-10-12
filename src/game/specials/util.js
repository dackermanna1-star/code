// Shared helpers for the map specials (p_spec.c utilities and p_floor.c's
// T_MovePlane). Heights are floats in map units (FRACUNIT = 1).

import { ML } from '../mapdata.js';

// fixed_t MAXINT expressed in map units.
export const MAXINT_UNITS = 0x7fffffff / 65536;

// result_e
export const OK = 0;
export const CRUSHED = 1;
export const PASTDEST = 2;

// P_FindSectorFromLineTag: next sector index after `start` whose tag matches.
export function findSectorFromLineTag(sectors, line, start) {
  for (let i = start + 1; i < sectors.length; i++) {
    if (sectors[i].tag === line.tag) return i;
  }
  return -1;
}

// getNextSector: the sector on the other side of a two-sided line, or null.
export function getNextSector(line, sec) {
  if (!(line.flags & ML.TWOSIDED)) return null;
  if (line.frontsector === sec) return line.backsector;
  return line.frontsector;
}

export function findLowestFloorSurrounding(sec) {
  let floor = sec.floorheight;
  for (const line of sec.lines) {
    const other = getNextSector(line, sec);
    if (other && other.floorheight < floor) floor = other.floorheight;
  }
  return floor;
}

export function findHighestFloorSurrounding(sec) {
  let floor = -500;
  for (const line of sec.lines) {
    const other = getNextSector(line, sec);
    if (other && other.floorheight > floor) floor = other.floorheight;
  }
  return floor;
}

// Only the first 20 higher neighbours are considered, like linuxdoom.
const MAX_ADJOINING_SECTORS = 20;

export function findNextHighestFloor(sec, currentheight) {
  const heightlist = [];
  for (const line of sec.lines) {
    const other = getNextSector(line, sec);
    if (!other) continue;
    if (other.floorheight > currentheight) heightlist.push(other.floorheight);
    if (heightlist.length >= MAX_ADJOINING_SECTORS) break;
  }
  if (!heightlist.length) return currentheight;
  let min = heightlist[0];
  for (let i = 1; i < heightlist.length; i++) if (heightlist[i] < min) min = heightlist[i];
  return min;
}

export function findLowestCeilingSurrounding(sec) {
  let height = MAXINT_UNITS;
  for (const line of sec.lines) {
    const other = getNextSector(line, sec);
    if (other && other.ceilingheight < height) height = other.ceilingheight;
  }
  return height;
}

export function findHighestCeilingSurrounding(sec) {
  let height = 0;
  for (const line of sec.lines) {
    const other = getNextSector(line, sec);
    if (other && other.ceilingheight > height) height = other.ceilingheight;
  }
  return height;
}

export function findMinSurroundingLight(sector, max) {
  let min = max;
  for (const line of sector.lines) {
    const check = getNextSector(line, sector);
    if (check && check.lightlevel < min) min = check.lightlevel;
  }
  return min;
}

// Positional sector sound from the middle of the sector's current opening.
export function sectorSound(w, sector, name) {
  const org = sector.soundorg;
  org.z = (sector.floorheight + sector.ceilingheight) / 2;
  w.sound(org, name);
}

// T_MovePlane. `crush` is normally true/false; the stair builder passes a
// truthy non-true value (vanilla's uninitialised field) which crunches things
// but still stops the floor, so compare against true exactly where vanilla did.
export function movePlane(w, sector, speed, dest, crush, floorOrCeiling, direction) {
  const crunch = !!crush;
  let lastpos;
  if (floorOrCeiling === 0) {
    if (direction === -1) {
      // Floor down
      if (sector.floorheight - speed < dest) {
        lastpos = sector.floorheight;
        sector.floorheight = dest;
        if (w.changeSector(sector, crunch)) {
          sector.floorheight = lastpos;
          w.changeSector(sector, crunch);
        }
        return PASTDEST;
      }
      lastpos = sector.floorheight;
      sector.floorheight -= speed;
      if (w.changeSector(sector, crunch)) {
        sector.floorheight = lastpos;
        w.changeSector(sector, crunch);
        return CRUSHED;
      }
    } else if (direction === 1) {
      // Floor up
      if (sector.floorheight + speed > dest) {
        lastpos = sector.floorheight;
        sector.floorheight = dest;
        if (w.changeSector(sector, crunch)) {
          sector.floorheight = lastpos;
          w.changeSector(sector, crunch);
        }
        return PASTDEST;
      }
      // Could get crushed
      lastpos = sector.floorheight;
      sector.floorheight += speed;
      if (w.changeSector(sector, crunch)) {
        if (crush === true) return CRUSHED;
        sector.floorheight = lastpos;
        w.changeSector(sector, crunch);
        return CRUSHED;
      }
    }
  } else if (direction === -1) {
    // Ceiling down
    if (sector.ceilingheight - speed < dest) {
      lastpos = sector.ceilingheight;
      sector.ceilingheight = dest;
      if (w.changeSector(sector, crunch)) {
        sector.ceilingheight = lastpos;
        w.changeSector(sector, crunch);
      }
      return PASTDEST;
    }
    // Could get crushed
    lastpos = sector.ceilingheight;
    sector.ceilingheight -= speed;
    if (w.changeSector(sector, crunch)) {
      if (crush === true) return CRUSHED;
      sector.ceilingheight = lastpos;
      w.changeSector(sector, crunch);
      return CRUSHED;
    }
  } else if (direction === 1) {
    // Ceiling up
    if (sector.ceilingheight + speed > dest) {
      lastpos = sector.ceilingheight;
      sector.ceilingheight = dest;
      if (w.changeSector(sector, crunch)) {
        sector.ceilingheight = lastpos;
        w.changeSector(sector, crunch);
      }
      return PASTDEST;
    }
    sector.ceilingheight += speed;
    w.changeSector(sector, crunch);
  }
  return OK;
}
