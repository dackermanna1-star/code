// Port of p_lights.c: flickering, flashing, strobing and glowing sector
// lights plus the light-changing line actions.

import { findSectorFromLineTag, findMinSurroundingLight, getNextSector } from './util.js';

export const GLOWSPEED = 8;
export const STROBEBRIGHT = 5;
export const FASTDARK = 15;
export const SLOWDARK = 35;

export class FireFlicker {
  constructor(sector) {
    this.sector = sector;
    this.count = 4;
    this.maxlight = sector.lightlevel;
    this.minlight = findMinSurroundingLight(sector, sector.lightlevel) + 16;
  }

  think(w) {
    if (--this.count) return;
    const amount = (w.rng.P() & 3) * 16;
    if (this.sector.lightlevel - amount < this.minlight) this.sector.lightlevel = this.minlight;
    else this.sector.lightlevel = this.maxlight - amount;
    this.count = 4;
  }
}

export class LightFlash {
  constructor(sector) {
    this.sector = sector;
    this.count = 0;
    this.maxlight = sector.lightlevel;
    this.minlight = findMinSurroundingLight(sector, sector.lightlevel);
    this.maxtime = 64;
    this.mintime = 7;
  }

  think(w) {
    if (--this.count) return;
    if (this.sector.lightlevel === this.maxlight) {
      this.sector.lightlevel = this.minlight;
      this.count = (w.rng.P() & this.mintime) + 1;
    } else {
      this.sector.lightlevel = this.maxlight;
      this.count = (w.rng.P() & this.maxtime) + 1;
    }
  }
}

export class StrobeFlash {
  constructor(sector, fastOrSlow) {
    this.sector = sector;
    this.count = 0;
    this.darktime = fastOrSlow;
    this.brighttime = STROBEBRIGHT;
    this.maxlight = sector.lightlevel;
    this.minlight = findMinSurroundingLight(sector, sector.lightlevel);
    if (this.minlight === this.maxlight) this.minlight = 0;
  }

  think() {
    if (--this.count) return;
    if (this.sector.lightlevel === this.minlight) {
      this.sector.lightlevel = this.maxlight;
      this.count = this.brighttime;
    } else {
      this.sector.lightlevel = this.minlight;
      this.count = this.darktime;
    }
  }
}

export class Glow {
  constructor(sector) {
    this.sector = sector;
    this.minlight = findMinSurroundingLight(sector, sector.lightlevel);
    this.maxlight = sector.lightlevel;
    this.direction = -1;
  }

  think() {
    const sec = this.sector;
    switch (this.direction) {
      case -1:
        // Down
        sec.lightlevel -= GLOWSPEED;
        if (sec.lightlevel <= this.minlight) {
          sec.lightlevel += GLOWSPEED;
          this.direction = 1;
        }
        break;
      case 1:
        // Up
        sec.lightlevel += GLOWSPEED;
        if (sec.lightlevel >= this.maxlight) {
          sec.lightlevel -= GLOWSPEED;
          this.direction = -1;
        }
        break;
      default: break;
    }
  }
}

// The spawners clear the sector special: nothing special about it during
// gameplay.
export function spawnFireFlicker(sp, sector) {
  sector.special = 0;
  sp.w.addThinker(new FireFlicker(sector));
}

export function spawnLightFlash(sp, sector) {
  sector.special = 0;
  const flash = new LightFlash(sector);
  sp.w.addThinker(flash);
  flash.count = (sp.w.rng.P() & flash.maxtime) + 1;
}

export function spawnStrobeFlash(sp, sector, fastOrSlow, inSync) {
  const flash = new StrobeFlash(sector, fastOrSlow);
  sp.w.addThinker(flash);
  sector.special = 0;
  if (!inSync) flash.count = (sp.w.rng.P() & 7) + 1;
  else flash.count = 1;
}

export function spawnGlowingLight(sp, sector) {
  sp.w.addThinker(new Glow(sector));
  sector.special = 0;
}

// EV_StartLightStrobing
export function startLightStrobing(sp, line) {
  const sectors = sp.w.level.sectors;
  let secnum = -1;
  while ((secnum = findSectorFromLineTag(sectors, line, secnum)) >= 0) {
    const sec = sectors[secnum];
    if (sec.specialdata) continue;
    const special = sec.special;
    spawnStrobeFlash(sp, sec, SLOWDARK, 0);
    if (sec.special !== special) sp.w.sectorChanged(sec);
  }
}

// EV_TurnTagLightsOff
export function turnTagLightsOff(sp, line) {
  for (const sector of sp.w.level.sectors) {
    if (sector.tag !== line.tag) continue;
    let min = sector.lightlevel;
    for (const ln of sector.lines) {
      const tsec = getNextSector(ln, sector);
      if (tsec && tsec.lightlevel < min) min = tsec.lightlevel;
    }
    sector.lightlevel = min;
  }
}

// EV_LightTurnOn. bright = 0 searches for the brightest neighbour; like
// vanilla, the value found for the first tagged sector is reused for the rest.
export function lightTurnOn(sp, line, bright) {
  for (const sector of sp.w.level.sectors) {
    if (sector.tag !== line.tag) continue;
    if (!bright) {
      for (const ln of sector.lines) {
        const temp = getNextSector(ln, sector);
        if (temp && temp.lightlevel > bright) bright = temp.lightlevel;
      }
    }
    sector.lightlevel = bright;
  }
}
