// Chinatown's line and sector specials on a running level (tools/ct/SPEC.md
// sections 5 and 6), and the host of the map script (ct/chinatown.js).
// World creates one when the map uses any of them (or is CHINATWN), so the
// DOOM maps never touch this code. The specials themselves are generic:
//   900 portal       ct/portal.js (moved through in map.js tryMove)
//   902 ladder       ct/ladder.js (use; the script may disable a ladder)
//   903 breakable    ct/breakable.js (shot, hit, blasted)
//   904 objective use, 905 objective trigger: passed to the map script; a
//       script can mark 904 lines as "hold use" (weld, crank) and is then
//       told every tic use is held while facing one
//   906 lethal fall  (walk: falls into the bay)
//   sector 64 sewer water, 65 deep water, 66 extraction zone
// All state is in `this.s`, a plain object of numbers, arrays and object
// references that savegame.js stores and restores whole.

import { MF, PW, USERANGE } from '../defs.js';
import { MT } from '../tables.js';
import { pathTraverse, PT_ADDLINES, lineOpening, opening, pointOnLineSide } from '../maputl.js';
import { CT_MAP } from './info.js';
import { buildPortals, portalCrossed, portalMove, portalExitSector, portalEdges, PORTAL } from './portal.js';
import { Breakables, BREAKABLE } from './breakable.js';
import { startClimb, LADDER } from './ladder.js';
import { ChinatownScript } from './chinatown.js';

export const OBJECTIVE_USE = 904;
export const OBJECTIVE_TRIGGER = 905;
export const LETHAL_FALL = 906;
export const SEWER_WATER = 64;
export const DEEP_WATER = 65;
export const EXTRACTION_ZONE = 66;

const WATER_MESSAGE = 'THE WATER BURNS YOUR SKIN';

// Does this level need the Chinatown specials?
export function wantsCtLevel(level, mapName) {
  if (mapName === CT_MAP) return true;
  if (level.lines.some((l) => l.special >= PORTAL && l.special <= LETHAL_FALL)) return true;
  return level.sectors.some((s) => s.special >= SEWER_WATER && s.special <= EXTRACTION_ZONE);
}

export class CtLevel {
  constructor(w) {
    this.w = w;
    this.portals = buildPortals(w.level);
    this.portalLines = [...this.portals.keys()];
    this.s = CtLevel.freshState();
    this.breakables = new Breakables(this);
    this.script = w.mapName === CT_MAP ? new ChinatownScript(this) : null;
    if (this.script) this.s.script = this.script.freshState();
  }

  static freshState() {
    return {
      lineHp: {}, // breakable line index -> hit points left
      ladderOff: [], // tags of ladders that can't be used yet
      holdLine: -1, // 904 line index use is held on, else -1
      holdTics: 0,
      inWater: false,
      waterMessage: false,
      script: null,
    };
  }

  // --- Level start, saves -----------------------------------------------------

  start() {
    if (this.script) this.script.start();
  }

  // State from a savegame (already dereferenced).
  restore(state) {
    this.s = Object.assign(CtLevel.freshState(), state);
    if (this.script) this.s.script = Object.assign(this.script.freshState(), this.s.script || {});
  }

  // After a savegame is fully restored: restart looping sounds.
  loaded() {
    if (this.script && this.script.loaded) this.script.loaded();
  }

  // --- Per tic ----------------------------------------------------------------

  tick() {
    const w = this.w;
    const p = w.player;
    if (p && p.mo) {
      this.tickHold(p);
      this.tickWater(p);
    }
    if (this.script) this.script.tick();
  }

  // The special line the player would use now (front side, within reach),
  // or null; like useLines without activating anything.
  useTarget(player) {
    const mo = player.mo;
    const x2 = mo.x + USERANGE * Math.cos(mo.angle);
    const y2 = mo.y + USERANGE * Math.sin(mo.angle);
    let found = null;
    pathTraverse(this.w, mo.x, mo.y, x2, y2, PT_ADDLINES, (ic) => {
      const li = ic.line;
      if (!li.special) {
        lineOpening(li);
        return opening.range > 0;
      }
      if (pointOnLineSide(mo.x, mo.y, li) === 0) found = li;
      return false;
    });
    return found;
  }

  // Hold-use: every tic use is held while facing a hold line (weld, crank).
  tickHold(p) {
    const script = this.script;
    const s = this.s;
    let line = null;
    if (script && p.playerstate === 'live' && !p.climb && p.cmd.use) {
      const li = this.useTarget(p);
      if (li && li.special === OBJECTIVE_USE && script.holdable(li)) line = li;
    }
    const lines = this.w.level.lines;
    // Lines of one tag are one target (a padlock drawn as a niche).
    const old = s.holdLine >= 0 ? lines[s.holdLine] : null;
    if (old && (!line || line.tag !== old.tag)) {
      s.holdLine = -1;
      s.holdTics = 0;
      script.holdEnd(old, p);
    }
    if (!line) return;
    s.holdLine = line.index;
    s.holdTics++;
    script.hold(line, p, s.holdTics);
  }

  // Splash when stepping into sewer or bay water.
  tickWater(p) {
    const mo = p.mo;
    const sec = mo.subsector.sector;
    const wet = (sec.special === SEWER_WATER || sec.special === DEEP_WATER) && mo.z <= sec.floorheight;
    if (wet && !this.s.inWater && p.playerstate === 'live') {
      this.w.sound(mo, 'splash', { channel: 'body' });
      if (this.w.fx && this.w.fx.splash) this.w.fx.splash(mo.x, mo.y, sec.floorheight, sec);
    }
    this.s.inWater = wet;
  }

  // --- Portals (map.js tryMove) -------------------------------------------------

  // A move of `thing` to (x, y) that passes a portal: true/false as tryMove
  // would return after moving it through; null when no portal is crossed.
  portalTry(thing, x, y) {
    if (!this.portalLines.length) return null;
    const line = portalCrossed(this, thing, x, y);
    return line ? portalMove(this.w, thing, line, x, y) : null;
  }

  portalExitSector(line, sec) { return portalExitSector(this.w, line, sec); }

  // Sector graph edges through the portals, for the AI's path search.
  navEdges() { return portalEdges(this.w); }

  // --- Breakables (map.js lineAttack / radiusAttack) ----------------------------

  blocksShot(line, z) { return this.breakables.blocksShot(line, z); }

  // Does an intact breakable stand between a melee attacker and its target
  // at the height they share (enemy.js checkMeleeRange)?
  meleeBlocked(actor, target) {
    if (!this.breakables.lines.length) return false;
    let lo = Math.max(actor.z, target.z), hi = Math.min(actor.z + actor.height, target.z + target.height);
    if (lo > hi) [lo, hi] = [hi, lo];
    let blocked = false;
    pathTraverse(this.w, actor.x, actor.y, target.x, target.y, PT_ADDLINES, (ic) => {
      const li = ic.line;
      if (li.special !== BREAKABLE || !this.breakables.intact(li)) return true;
      const [b, t] = this.breakables.span(li);
      if (b > hi + 1 || t < lo - 1) return true;
      blocked = true;
      return false;
    });
    return blocked;
  }

  damageLine(line, damage, source, at) { this.breakables.damage(line, damage, source, at); }
  radiusDamage(spot, source, damage) { if (this.breakables.lines.length) this.breakables.radius(spot, source, damage); }

  // --- Line specials (specials.js) ------------------------------------------------

  // Walk-over: 905 objective triggers (players), 906 falls. 900 portals are
  // handled in tryMove, so crossing one never gets here.
  crossLine(line, side, thing) {
    const w = this.w;
    switch (line.special) {
      case OBJECTIVE_TRIGGER:
        if (thing.player && this.script) this.script.cross(line, side, thing);
        break;
      case LETHAL_FALL:
        if (thing.health > 0 && (thing.player || (thing.flags & MF.SHOOTABLE))) {
          w.sound(thing, 'splash');
          if (thing.player) thing.player.message = 'You fell into the bay.';
          w.damageMobj(thing, null, null, 10000, { fall: true });
        }
        break;
      default: break;
    }
  }

  // Use: 902 ladders, 904 objective lines. Returns true like useSpecialLine.
  useLine(thing, line) {
    const player = thing.player;
    if (!player) return false;
    if (line.special === LADDER) {
      if (this.s.ladderOff.includes(line.tag)) {
        player.message = 'The ladder is out of reach.';
        this.w.sound(thing, 'noway');
        return true;
      }
      const dest = this.ladderTop(line.tag);
      if (dest) startClimb(this.w, player, line, dest);
      return true;
    }
    if (line.special === OBJECTIVE_USE && this.script) this.script.use(line, thing);
    return true;
  }

  // The landing (thing 9061) in the sector tagged `tag`.
  ladderTop(tag) {
    let best = null;
    for (const m of this.w.mobjs) {
      if (m.type !== MT.CT_LADDERTOP || m.subsector.sector.tag !== tag) continue;
      if (!best || m.id < best.id) best = m;
    }
    return best;
  }

  enableLadder(tag, on = true) {
    const off = this.s.ladderOff.filter((t) => t !== tag);
    if (!on) off.push(tag);
    this.s.ladderOff = off;
  }

  // --- Sector specials (specials.js playerInSpecialSector) ------------------------

  playerInSector(player, sector) {
    const w = this.w;
    const mo = player.mo;
    switch (sector.special) {
      case SEWER_WATER:
        if (!this.s.waterMessage) {
          this.s.waterMessage = true;
          player.message = WATER_MESSAGE;
        }
        if (!player.powers[PW.IRONFEET] && !(w.leveltime & 0x1f)) w.damageMobj(mo, null, null, 4);
        break;
      case DEEP_WATER:
        if (player.health > 0) {
          player.message = 'You drowned in the bay.';
          w.damageMobj(mo, null, null, 10000, { fall: true });
        }
        break;
      case EXTRACTION_ZONE: // the script checks for the player itself
      default:
        break;
    }
  }

  inExtractionZone(mo) {
    const sec = mo.subsector.sector;
    return sec.special === EXTRACTION_ZONE || sec.tag === 160;
  }

  // --- HUD / debug -------------------------------------------------------------------

  // What the HUD shows (see ui/ct-hud.js); null without a map script.
  hud() { return this.script ? this.script.hud() : null; }

  musicOverride() { return this.script ? this.script.music() : null; }
}
