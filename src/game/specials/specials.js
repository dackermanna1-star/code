// Port of p_spec.c / p_switch.c dispatch: sector and line specials, animated
// textures, scrolling walls and switch buttons. The movers live in the
// sibling modules (doors, plats, floors, ceilings, lights, teleport).

import { PW } from '../defs.js';
import { MT } from '../tables.js';
import { ML } from '../mapdata.js';
import { doDoor, doLockedDoor, verticalDoor, spawnDoorCloseIn30, spawnDoorRaiseIn5Mins } from './doors.js';
import { doPlat, stopPlat } from './plats.js';
import { doFloor, buildStairs, doDonut } from './floors.js';
import { doCeiling, ceilingCrushStop } from './ceilings.js';
import {
  spawnLightFlash, spawnStrobeFlash, spawnGlowingLight, spawnFireFlicker,
  startLightStrobing, turnTagLightsOff, lightTurnOn, FASTDARK, SLOWDARK,
} from './lights.js';
import { initSwitchList, changeSwitchTexture, updateButtons } from './switches.js';
import { initPicAnims, applyAnim, updateAnims } from './anims.js';
import { teleport } from './teleport.js';

const CF_GODMODE = 2;

// Missiles that never trigger walk-over lines (vanilla's explicit list).
const NO_CROSS_TYPES = new Set([MT.ROCKET, MT.PLASMA, MT.BFG, MT.TROOPSHOT, MT.HEADSHOT, MT.BRUISERSHOT]);

export class Specials {
  constructor(w) {
    this.w = w;
    this.activeplats = [];
    this.activeceilings = [];
    this.buttons = [];
    this.linespecials = [];
    this.anims = [];
    this.switchlist = [];
  }

  // --- Level setup (P_SpawnSpecials, P_InitPicAnims, P_InitSwitchList) ------

  // Tables that don't depend on game state (also used when loading a save).
  initStatic() {
    const w = this.w;
    this.anims = initPicAnims(w.res);
    this.switchlist = initSwitchList(w);
    this.linespecials = w.level.lines.filter((line) => line.special === 48);
  }

  spawnSpecials() {
    const w = this.w;
    this.initStatic();
    this.activeplats = [];
    this.activeceilings = [];
    this.buttons = [];

    // Init special sectors
    for (const sector of w.level.sectors) {
      const special = sector.special;
      if (!special) continue;
      switch (special) {
        case 1: // Flickering lights
          spawnLightFlash(this, sector);
          break;
        case 2: // Strobe fast
          spawnStrobeFlash(this, sector, FASTDARK, 0);
          break;
        case 3: // Strobe slow
          spawnStrobeFlash(this, sector, SLOWDARK, 0);
          break;
        case 4: // Strobe fast / death slime
          spawnStrobeFlash(this, sector, FASTDARK, 0);
          sector.special = 4;
          break;
        case 8: // Glowing light
          spawnGlowingLight(this, sector);
          break;
        case 9: // Secret sector
          w.totalsecret++;
          break;
        case 10: // Door close in 30 seconds
          spawnDoorCloseIn30(this, sector);
          break;
        case 12: // Sync strobe slow
          spawnStrobeFlash(this, sector, SLOWDARK, 1);
          break;
        case 13: // Sync strobe fast
          spawnStrobeFlash(this, sector, FASTDARK, 1);
          break;
        case 14: // Door raise in 5 minutes
          spawnDoorRaiseIn5Mins(this, sector);
          break;
        case 17:
          spawnFireFlicker(this, sector);
          break;
        default: break;
      }
      if (sector.special !== special) w.sectorChanged(sector);
    }

    // Init line effects
    this.linespecials = w.level.lines.filter((line) => line.special === 48);

    // Show the right animation frames from the first rendered frame.
    for (const anim of this.anims) applyAnim(w.res, anim, w.leveltime);
  }

  // --- Per-tic update (P_UpdateSpecials) -------------------------------------

  updateSpecials() {
    const w = this.w;
    // Animate flats and textures globally
    updateAnims(w.res, this.anims, w.leveltime);
    // Animate line specials
    for (const line of this.linespecials) {
      if (line.special === 48 && line.front) {
        // Effect firstcol scroll +
        line.front.textureoffset += 1;
        w.sideChanged(line.front);
      }
    }
    // Do buttons
    if (this.buttons.length) updateButtons(this);
  }

  // --- EV_ actions -----------------------------------------------------------

  doDoor(line, type) { return doDoor(this, line, type); }
  doLockedDoor(line, type, thing) { return doLockedDoor(this, line, type, thing); }
  verticalDoor(line, thing) { verticalDoor(this, line, thing); }
  doFloor(line, type) { return doFloor(this, line, type); }
  buildStairs(line, type) { return buildStairs(this, line, type); }
  doDonut(line) { return doDonut(this, line); }
  doCeiling(line, type) { return doCeiling(this, line, type); }
  ceilingCrushStop(line) { return ceilingCrushStop(this, line); }
  doPlat(line, type, amount = 0) { return doPlat(this, line, type, amount); }
  stopPlat(line) { stopPlat(this, line); }
  lightTurnOn(line, bright) { lightTurnOn(this, line, bright); }
  turnTagLightsOff(line) { turnTagLightsOff(this, line); }
  startLightStrobing(line) { startLightStrobing(this, line); }
  // Generic light entry point: 'turnOn' (bright 0 = brightest neighbour),
  // 'turnOff' or 'strobe'.
  doLight(line, type, bright = 0) {
    if (type === 'turnOff') this.turnTagLightsOff(line);
    else if (type === 'strobe') this.startLightStrobing(line);
    else this.lightTurnOn(line, bright);
  }
  teleport(line, side, thing) { return teleport(this, line, side, thing); }
  changeSwitchTexture(line, useAgain) { changeSwitchTexture(this, line, useAgain); }

  // --- P_CrossSpecialLine ------------------------------------------------------

  crossSpecialLine(line, side, thing) {
    const w = this.w;
    // Triggers that other things can activate
    if (!thing.player) {
      // Things that should NOT trigger specials...
      if (NO_CROSS_TYPES.has(thing.type)) return;
      switch (line.special) {
        case 39: // Teleport trigger
        case 97: // Teleport retrigger
        case 125: // Teleport monsteronly trigger
        case 126: // Teleport monsteronly retrigger
        case 4: // Raise door
        case 10: // Plat down-wait-up-stay trigger
        case 88: // Plat down-wait-up-stay retrigger
          break;
        default:
          return;
      }
    }

    switch (line.special) {
      // Triggers (W1): all from here to the retriggers.
      case 2: this.doDoor(line, 'open'); line.special = 0; break;
      case 3: this.doDoor(line, 'close'); line.special = 0; break;
      case 4: this.doDoor(line, 'normal'); line.special = 0; break;
      case 5: this.doFloor(line, 'raiseFloor'); line.special = 0; break;
      case 6: this.doCeiling(line, 'fastCrushAndRaise'); line.special = 0; break;
      case 8: this.buildStairs(line, 'build8'); line.special = 0; break;
      case 10: this.doPlat(line, 'downWaitUpStay', 0); line.special = 0; break;
      case 12: this.lightTurnOn(line, 0); line.special = 0; break;
      case 13: this.lightTurnOn(line, 255); line.special = 0; break;
      case 16: this.doDoor(line, 'close30ThenOpen'); line.special = 0; break;
      case 17: this.startLightStrobing(line); line.special = 0; break;
      case 19: this.doFloor(line, 'lowerFloor'); line.special = 0; break;
      case 22: this.doPlat(line, 'raiseToNearestAndChange', 0); line.special = 0; break;
      case 25: this.doCeiling(line, 'crushAndRaise'); line.special = 0; break;
      case 30: this.doFloor(line, 'raiseToTexture'); line.special = 0; break;
      case 35: this.lightTurnOn(line, 35); line.special = 0; break;
      case 36: this.doFloor(line, 'turboLower'); line.special = 0; break;
      case 37: this.doFloor(line, 'lowerAndChange'); line.special = 0; break;
      case 38: this.doFloor(line, 'lowerFloorToLowest'); line.special = 0; break;
      case 39: this.teleport(line, side, thing); line.special = 0; break;
      case 40:
        this.doCeiling(line, 'raiseToHighest');
        this.doFloor(line, 'lowerFloorToLowest');
        line.special = 0;
        break;
      case 44: this.doCeiling(line, 'lowerAndCrush'); line.special = 0; break;
      case 52: w.exitLevel(false); break;
      case 53: this.doPlat(line, 'perpetualRaise', 0); line.special = 0; break;
      case 54: this.stopPlat(line); line.special = 0; break;
      case 56: this.doFloor(line, 'raiseFloorCrush'); line.special = 0; break;
      case 57: this.ceilingCrushStop(line); line.special = 0; break;
      case 58: this.doFloor(line, 'raiseFloor24'); line.special = 0; break;
      case 59: this.doFloor(line, 'raiseFloor24AndChange'); line.special = 0; break;
      case 104: this.turnTagLightsOff(line); line.special = 0; break;
      case 108: this.doDoor(line, 'blazeRaise'); line.special = 0; break;
      case 109: this.doDoor(line, 'blazeOpen'); line.special = 0; break;
      case 100: this.buildStairs(line, 'turbo16'); line.special = 0; break;
      case 110: this.doDoor(line, 'blazeClose'); line.special = 0; break;
      case 119: this.doFloor(line, 'raiseFloorToNearest'); line.special = 0; break;
      case 121: this.doPlat(line, 'blazeDWUS', 0); line.special = 0; break;
      case 124: w.exitLevel(true); break;
      case 125:
        // Teleport monster only
        if (!thing.player) {
          this.teleport(line, side, thing);
          line.special = 0;
        }
        break;
      case 130: this.doFloor(line, 'raiseFloorTurbo'); line.special = 0; break;
      case 141: this.doCeiling(line, 'silentCrushAndRaise'); line.special = 0; break;

      // Retriggers (WR): all from here till end.
      case 72: this.doCeiling(line, 'lowerAndCrush'); break;
      case 73: this.doCeiling(line, 'crushAndRaise'); break;
      case 74: this.ceilingCrushStop(line); break;
      case 75: this.doDoor(line, 'close'); break;
      case 76: this.doDoor(line, 'close30ThenOpen'); break;
      case 77: this.doCeiling(line, 'fastCrushAndRaise'); break;
      case 79: this.lightTurnOn(line, 35); break;
      case 80: this.lightTurnOn(line, 0); break;
      case 81: this.lightTurnOn(line, 255); break;
      case 82: this.doFloor(line, 'lowerFloorToLowest'); break;
      case 83: this.doFloor(line, 'lowerFloor'); break;
      case 84: this.doFloor(line, 'lowerAndChange'); break;
      case 86: this.doDoor(line, 'open'); break;
      case 87: this.doPlat(line, 'perpetualRaise', 0); break;
      case 88: this.doPlat(line, 'downWaitUpStay', 0); break;
      case 89: this.stopPlat(line); break;
      case 90: this.doDoor(line, 'normal'); break;
      case 91: this.doFloor(line, 'raiseFloor'); break;
      case 92: this.doFloor(line, 'raiseFloor24'); break;
      case 93: this.doFloor(line, 'raiseFloor24AndChange'); break;
      case 94: this.doFloor(line, 'raiseFloorCrush'); break;
      case 95: this.doPlat(line, 'raiseToNearestAndChange', 0); break;
      case 96: this.doFloor(line, 'raiseToTexture'); break;
      case 97: this.teleport(line, side, thing); break;
      case 98: this.doFloor(line, 'turboLower'); break;
      case 105: this.doDoor(line, 'blazeRaise'); break;
      case 106: this.doDoor(line, 'blazeOpen'); break;
      case 107: this.doDoor(line, 'blazeClose'); break;
      case 120: this.doPlat(line, 'blazeDWUS', 0); break;
      case 126:
        // Teleport monster only
        if (!thing.player) this.teleport(line, side, thing);
        break;
      case 128: this.doFloor(line, 'raiseFloorToNearest'); break;
      case 129: this.doFloor(line, 'raiseFloorTurbo'); break;
      default: break;
    }
  }

  // --- P_UseSpecialLine ----------------------------------------------------------

  useSpecialLine(thing, line, side) {
    const w = this.w;
    // Use the back sides of VERY SPECIAL lines... (only the unused 124)
    if (side && line.special !== 124) return false;

    // Switches that other things can activate.
    if (!thing.player) {
      // Never open secret doors
      if (line.flags & ML.SECRET) return false;
      switch (line.special) {
        case 1: // Manual door raise
        case 32: // Manual blue
        case 33: // Manual red
        case 34: // Manual yellow
          break;
        default:
          return false;
      }
    }

    const sw = (activated, useAgain) => { if (activated) this.changeSwitchTexture(line, useAgain); };
    switch (line.special) {
      // Manuals
      case 1: // Vertical door
      case 26: // Blue door / locked
      case 27: // Yellow door / locked
      case 28: // Red door / locked
      case 31: // Manual door open
      case 32: // Blue locked door open
      case 33: // Red locked door open
      case 34: // Yellow locked door open
      case 117: // Blazing door raise
      case 118: // Blazing door open
        this.verticalDoor(line, thing);
        break;

      // Switches (S1)
      case 7: sw(this.buildStairs(line, 'build8'), false); break;
      case 9: sw(this.doDonut(line), false); break;
      case 11:
        // Exit level
        this.changeSwitchTexture(line, false);
        w.exitLevel(false);
        break;
      case 14: sw(this.doPlat(line, 'raiseAndChange', 32), false); break;
      case 15: sw(this.doPlat(line, 'raiseAndChange', 24), false); break;
      case 18: sw(this.doFloor(line, 'raiseFloorToNearest'), false); break;
      case 20: sw(this.doPlat(line, 'raiseToNearestAndChange', 0), false); break;
      case 21: sw(this.doPlat(line, 'downWaitUpStay', 0), false); break;
      case 23: sw(this.doFloor(line, 'lowerFloorToLowest'), false); break;
      case 29: sw(this.doDoor(line, 'normal'), false); break;
      case 41: sw(this.doCeiling(line, 'lowerToFloor'), false); break;
      case 71: sw(this.doFloor(line, 'turboLower'), false); break;
      case 49: sw(this.doCeiling(line, 'crushAndRaise'), false); break;
      case 50: sw(this.doDoor(line, 'close'), false); break;
      case 51:
        // Secret exit
        this.changeSwitchTexture(line, false);
        w.exitLevel(true);
        break;
      case 55: sw(this.doFloor(line, 'raiseFloorCrush'), false); break;
      case 101: sw(this.doFloor(line, 'raiseFloor'), false); break;
      case 102: sw(this.doFloor(line, 'lowerFloor'), false); break;
      case 103: sw(this.doDoor(line, 'open'), false); break;
      case 111: sw(this.doDoor(line, 'blazeRaise'), false); break;
      case 112: sw(this.doDoor(line, 'blazeOpen'), false); break;
      case 113: sw(this.doDoor(line, 'blazeClose'), false); break;
      case 122: sw(this.doPlat(line, 'blazeDWUS', 0), false); break;
      case 127: sw(this.buildStairs(line, 'turbo16'), false); break;
      case 131: sw(this.doFloor(line, 'raiseFloorTurbo'), false); break;
      case 133: // Blazing open door blue
      case 135: // Blazing open door red
      case 137: // Blazing open door yellow
        sw(this.doLockedDoor(line, 'blazeOpen', thing), false);
        break;
      case 140: sw(this.doFloor(line, 'raiseFloor512'), false); break;

      // Buttons (SR)
      case 42: sw(this.doDoor(line, 'close'), true); break;
      case 43: sw(this.doCeiling(line, 'lowerToFloor'), true); break;
      case 45: sw(this.doFloor(line, 'lowerFloor'), true); break;
      case 60: sw(this.doFloor(line, 'lowerFloorToLowest'), true); break;
      case 61: sw(this.doDoor(line, 'open'), true); break;
      case 62: sw(this.doPlat(line, 'downWaitUpStay', 1), true); break;
      case 63: sw(this.doDoor(line, 'normal'), true); break;
      case 64: sw(this.doFloor(line, 'raiseFloor'), true); break;
      case 66: sw(this.doPlat(line, 'raiseAndChange', 24), true); break;
      case 67: sw(this.doPlat(line, 'raiseAndChange', 32), true); break;
      case 65: sw(this.doFloor(line, 'raiseFloorCrush'), true); break;
      case 68: sw(this.doPlat(line, 'raiseToNearestAndChange', 0), true); break;
      case 69: sw(this.doFloor(line, 'raiseFloorToNearest'), true); break;
      case 70: sw(this.doFloor(line, 'turboLower'), true); break;
      case 114: sw(this.doDoor(line, 'blazeRaise'), true); break;
      case 115: sw(this.doDoor(line, 'blazeOpen'), true); break;
      case 116: sw(this.doDoor(line, 'blazeClose'), true); break;
      case 123: sw(this.doPlat(line, 'blazeDWUS', 0), true); break;
      case 132: sw(this.doFloor(line, 'raiseFloorTurbo'), true); break;
      case 99: // Blazing open door blue
      case 134: // Blazing open door red
      case 136: // Blazing open door yellow
        sw(this.doLockedDoor(line, 'blazeOpen', thing), true);
        break;
      case 138: // Light turn on
        this.lightTurnOn(line, 255);
        this.changeSwitchTexture(line, true);
        break;
      case 139: // Light turn off
        this.lightTurnOn(line, 35);
        this.changeSwitchTexture(line, true);
        break;
      default: break;
    }
    return true;
  }

  // --- P_ShootSpecialLine (impact specials) ----------------------------------------

  shootSpecialLine(thing, line) {
    // Impacts that other things can activate.
    if (!thing.player && line.special !== 46) return;
    switch (line.special) {
      case 24: // Raise floor
        this.doFloor(line, 'raiseFloor');
        this.changeSwitchTexture(line, false);
        break;
      case 46: // Open door
        this.doDoor(line, 'open');
        this.changeSwitchTexture(line, true);
        break;
      case 47: // Raise floor near and change
        this.doPlat(line, 'raiseToNearestAndChange', 0);
        this.changeSwitchTexture(line, false);
        break;
      default: break;
    }
  }

  // --- P_PlayerInSpecialSector ---------------------------------------------------

  playerInSpecialSector(player) {
    const w = this.w;
    const mo = player.mo;
    const sector = mo.subsector.sector;
    // Falling, not all the way down yet?
    if (mo.z !== sector.floorheight) return;
    // Has hit ground.
    switch (sector.special) {
      case 5: // Hellslime damage
        if (!player.powers[PW.IRONFEET] && !(w.leveltime & 0x1f)) w.damageMobj(mo, null, null, 10);
        break;
      case 7: // Nukage damage
        if (!player.powers[PW.IRONFEET] && !(w.leveltime & 0x1f)) w.damageMobj(mo, null, null, 5);
        break;
      case 16: // Super hellslime damage
      case 4: // Strobe hurt
        if (!player.powers[PW.IRONFEET] || w.rng.P() < 5) {
          if (!(w.leveltime & 0x1f)) w.damageMobj(mo, null, null, 20);
        }
        break;
      case 9: // Secret sector
        player.secretcount++;
        sector.special = 0;
        w.sectorChanged(sector);
        if (w.settings?.secretMessages !== false) {
          player.message = 'A secret is revealed!';
          w.sound(null, 'getpow');
        }
        break;
      case 11: // Exit super damage (for E1M8 finale)
        player.cheats &= ~CF_GODMODE;
        if (!(w.leveltime & 0x1f)) w.damageMobj(mo, null, null, 20);
        if (player.health <= 10) w.exitLevel(false);
        break;
      default:
        // Vanilla aborts with "unknown special"; ignore instead.
        break;
    }
  }
}
