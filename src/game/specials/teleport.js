// Port of p_telept.c: EV_Teleport.

import { MF } from '../defs.js';
import { MT } from '../tables.js';
import { teleportMove } from '../map.js';

export function teleport(sp, line, side, thing) {
  const w = sp.w;
  // Don't teleport missiles
  if (thing.flags & MF.MISSILE) return false;
  // Don't teleport if hit back of line, so you can get out of teleporter.
  if (side === 1) return false;
  const tag = line.tag;
  const sectors = w.level.sectors;
  for (let i = 0; i < sectors.length; i++) {
    if (sectors[i].tag !== tag) continue;
    for (const m of w.mobjs) {
      // Not a teleportman, or wrong sector
      if (m.type !== MT.TELEPORTMAN) continue;
      if (m.subsector.sector !== sectors[i]) continue;
      const oldx = thing.x;
      const oldy = thing.y;
      const oldz = thing.z;
      if (!teleportMove(w, thing, m.x, m.y)) return false;
      thing.z = thing.floorz;
      const player = thing.player;
      if (player) player.viewz = thing.z + player.viewheight;
      // Spawn teleport fog at source and destination
      let fog = w.spawnMobj(oldx, oldy, oldz, MT.TFOG);
      w.sound(fog, 'telept');
      fog = w.spawnMobj(m.x + 20 * Math.cos(m.angle), m.y + 20 * Math.sin(m.angle), thing.z, MT.TFOG);
      w.sound(fog, 'telept');
      // Don't move for a bit
      if (player) thing.reactiontime = 18;
      thing.angle = m.angle;
      thing.momx = thing.momy = thing.momz = 0;
      // Don't interpolate across the jump.
      thing.saveInterp();
      if (player) player.prevViewz = player.viewz;
      w.fx?.teleported?.(thing);
      return true;
    }
  }
  return false;
}
