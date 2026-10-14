// Ladders (line special 902, tools/ct/SPEC.md section 5). Using an enabled
// ladder line plays a climb: the player steps up to the wall, rises at about
// 90 units/s with the view bobbing and the weapon lowered, then swings over
// onto the landing (the 9061 thing in the sector tagged like the line) or,
// when the landing is out of reach of a straight climb (a far ladder top, a
// low ceiling), fades out and comes up there. Input is locked meanwhile.
// The climb is plain player state (player.climb), so savegames keep it.

import { VIEWHEIGHT, normAngle, angleDiff } from '../defs.js';
import { setThingPosition, unsetThingPosition } from '../maputl.js';
import { teleportMove, checkPosition, mapState } from '../map.js';
import { bringUpWeapon, WEAPONBOTTOM, PS_FLASH, PS_WEAPON } from '../weapons.js';

export const LADDER = 902;
const CLIMB_SPEED = 90 / 35; // units per tic
const ALIGN_TICS = 6;
const OVER_TICS = 14;
export const FADE_TICS = 12;
const MAX_GLIDE = 192; // farthest landing reached by swinging over the top

// Starts climbing `line` to landing thing `dest`; false if already busy.
export function startClimb(w, player, line, dest) {
  const mo = player.mo;
  if (player.climb || !mo || player.playerstate !== 'live') return false;
  const len = line.length || Math.hypot(line.dx, line.dy) || 1;
  const ux = line.dx / len, uy = line.dy / len;
  // Foot of the ladder: in front of the line, level with the player.
  const r = mo.radius + 2;
  let t = (mo.x - line.v1.x) * ux + (mo.y - line.v1.y) * uy;
  t = Math.max(Math.min(r, len / 2), Math.min(len - Math.min(r, len / 2), t));
  const bx = line.v1.x + ux * t + uy * r, by = line.v1.y + uy * t - ux * r;
  const destSec = dest.subsector.sector;
  const front = line.frontsector;
  const topZ = destSec.floorheight;
  // Keep the eye under the ceiling of the room the ladder stands in.
  const riseTo = Math.max(mo.z, Math.min(topZ, front.ceilingheight - VIEWHEIGHT - 8));
  const glide = riseTo >= topZ - 1 && Math.hypot(dest.x - bx, dest.y - by) <= MAX_GLIDE;
  player.climb = {
    line, dest, phase: 'align', t: 0,
    sx: mo.x, sy: mo.y, sa: mo.angle, bx, by, z: mo.z, riseTo, glide,
    face: normAngle(Math.atan2(ux, -uy)), // looking into the wall
  };
  player.mods.ads = player.mods.adsTarget = 0;
  player.mods.reload = null;
  player.mods.melee = null;
  player.psprites[PS_FLASH].state = 0;
  w.sound(mo, 'ladder', { channel: 'body' });
  return true;
}

function placeAt(w, mo, x, y, z) {
  unsetThingPosition(w, mo);
  mo.x = x;
  mo.y = y;
  setThingPosition(w, mo);
  mo.z = z;
  mo.floorz = z;
  mo.ceilingz = Math.max(z + mo.height, mo.subsector.sector.ceilingheight);
  mo.momx = mo.momy = mo.momz = 0;
}

const ease = (f) => f * f * (3 - 2 * f);

// One tic of climbing (instead of moving, using and firing).
export function climbThink(w, player) {
  const c = player.climb;
  const mo = player.mo;
  c.t++;
  const psp = player.psprites[PS_WEAPON];
  psp.sy = Math.min(WEAPONBOTTOM, psp.sy + 10);
  let bob = 0;
  switch (c.phase) {
    case 'align': {
      const f = ease(Math.min(1, c.t / ALIGN_TICS));
      placeAt(w, mo, c.sx + (c.bx - c.sx) * f, c.sy + (c.by - c.sy) * f, c.z);
      mo.angle = normAngle(c.sa + angleDiff(c.sa, c.face) * f);
      if (c.t >= ALIGN_TICS) { c.phase = 'rise'; c.t = 0; }
      break;
    }
    case 'rise': {
      c.z = Math.min(c.riseTo, c.z + CLIMB_SPEED);
      placeAt(w, mo, c.bx, c.by, c.z);
      bob = Math.sin(c.t * 0.45) * 1.5;
      if (c.t % 24 === 0) w.sound(mo, 'ladder', { channel: 'body' });
      if (c.z >= c.riseTo) { c.phase = c.glide ? 'over' : 'fade'; c.t = 0; }
      break;
    }
    case 'over': {
      const f = ease(Math.min(1, c.t / OVER_TICS));
      const d = c.dest;
      placeAt(w, mo, c.bx + (d.x - c.bx) * f, c.by + (d.y - c.by) * f, c.riseTo + Math.sin(f * Math.PI) * 6);
      mo.angle = normAngle(c.face + angleDiff(c.face, d.angle) * f);
      if (c.t >= OVER_TICS) { finishClimb(w, player, false); return; }
      break;
    }
    case 'fade':
    default:
      placeAt(w, mo, c.bx, c.by, c.z);
      if (c.t >= FADE_TICS) { finishClimb(w, player, true); return; }
      break;
  }
  player.viewheight = player.baseViewHeight;
  player.deltaviewheight = 0;
  player.viewz = mo.z + player.viewheight + bob;
}

// Lands on the ladder top facing the landing's angle, weapon coming back up.
function finishClimb(w, player, snap) {
  const c = player.climb;
  const mo = player.mo;
  const d = c.dest;
  player.climb = null;
  teleportMove(w, mo, d.x, d.y);
  mo.z = mo.floorz;
  mo.momx = mo.momy = mo.momz = 0;
  mo.angle = d.angle;
  if (snap) mo.saveInterp();
  player.viewheight = player.baseViewHeight;
  player.deltaviewheight = 0;
  player.viewz = mo.z + player.viewheight;
  if (snap) player.prevViewz = player.viewz;
  player.pendingweapon = player.readyweapon;
  bringUpWeapon(w, player);
}

// Killed on the ladder: let go where the body is.
export function abortClimb(w, player) {
  const mo = player.mo;
  player.climb = null;
  checkPosition(w, mo, mo.x, mo.y);
  mo.floorz = mapState.floorz;
  mo.ceilingz = mapState.ceilingz;
}
