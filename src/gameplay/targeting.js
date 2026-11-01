// Target selection for combat and interaction. Scores candidates by distance and by how well
// they line up with where the player is steering (or facing), with hysteresis so the choice
// does not flicker between nearby candidates.
import { CONFIG } from '../config.js';
import { angleDiff, yawTo } from '../core/mathutil.js';

export function pickCombatTarget(c, chars, prefDirYaw, current) {
  let best = null, bestScore = Infinity;
  for (const o of chars) {
    if (o === c || o.state === 'ko' || o.state === 'spot' && !o.flags.hostileTo?.[c.id]) continue;
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
    if (d > 4.2) continue;
    const ang = Math.abs(angleDiff(prefDirYaw, yawTo(dx, dz)));
    if (ang > 1.45 && d > 1.4) continue;
    let score = d * 0.9 + ang * 1.6;
    if (o.combatTarget === c && o.combatTimer > 0) score -= 1.2;   // people fighting me first
    if (o.lastHitBy === c && o.combatTimer > 0) score -= 0.8;
    if (o.isDown) score += 1.5;
    if (o === current) score -= 0.6;                                // hysteresis
    if (score < bestScore) { bestScore = score; best = o; }
  }
  return best;
}

/**
 * Interaction candidates around the player: people to talk to, items to pick up, furniture to
 * use and special interactables. Returns sorted list [{kind, ref, d, score, label}].
 */
export function interactionCandidates(game, p, prefYaw) {
  const out = [];
  const R = CONFIG.interact.radius + 0.6;
  const fighting = p.combatTimer > 0 && p.combatTarget && !p.combatTarget.isDown && Math.hypot(p.combatTarget.x - p.x, p.combatTarget.z - p.z) < 5;
  for (const o of game.characters) {
    if (fighting || o === p || o.isDown || o.state === 'grappled') continue;
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    if (d > CONFIG.interact.talkReach + 0.6) continue;
    out.push({ kind: 'talk', ref: o, d, x: o.x, z: o.z, pri: 0.25 });
  }
  for (const { item, d } of game.items.near(p.x, p.z, R)) {
    if (item.y > 1.6) continue;
    out.push({ kind: 'item', ref: item, d, x: item.x, z: item.z, pri: 0.15 });
  }
  for (const s of game.world.spots) {
    if (s.staffOnly && !p.isStaff) continue;
    const d = Math.hypot(s.ax - p.x, s.az - p.z);
    if (d > R || (s.occupant && s.occupant !== p)) continue;
    if (Math.abs(s.y - p.y) > 2.5) continue;
    out.push({ kind: 'spot', ref: s, d: Math.min(d, Math.hypot(s.x - p.x, s.z - p.z)), x: s.x, z: s.z, pri: 0 });
  }
  for (const x of game.specialInteractables?.(p) || []) out.push(x);
  for (const c of out) {
    const ang = Math.abs(angleDiff(prefYaw, yawTo(c.x - p.x, c.z - p.z)));
    c.ang = ang;
    c.score = c.d * 0.75 + ang * 0.9 - c.pri + (c.d < 0.9 ? -0.3 : 0);
  }
  out.sort((a, b) => a.score - b.score);
  return out.filter((c) => c.ang < 2.2 || c.d < 1.0);
}
