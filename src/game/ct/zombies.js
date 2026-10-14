// Chinatown's zombies (walkers, runners, kids). They run on DOOM's own
// A_Look / A_Chase / A_FaceTarget / A_Pain / A_Scream / A_Fall (states in
// ct/info.js) and the modern AI layer's pathfinding; this adds their melee.
// Other zombie rules live where DOOM keeps the equivalents:
//   enemy.js  checkMeleeRange (reach from info.ct), groan/death variants
//   inter.js  no infighting (zombies never retarget other monsters)
//   weaponcfg.js HIT_ZONES (head shots x3), fx/effects.js HAS_HEAD,
//   vox/voxelize.js VOX_TYPES (3D models and ragdolls)

import { registerActions } from '../tables.js';
import { A_FaceTarget, checkMeleeRange } from '../enemy.js';

export function isZombie(mo) {
  return !!(mo && mo.info && mo.info.ct && mo.info.ct.zombie);
}

// Frame F: the claw or bite lands if the target is still in reach
// (damage per info.ct.damage, e.g. 4-12 for adults, 3-9 for kids).
export function A_ZombieAttack(w, actor) {
  if (!actor.target) return;
  A_FaceTarget(w, actor);
  if (!checkMeleeRange(w, actor)) return;
  const [lo, hi] = actor.info.ct.damage;
  const damage = lo + (w.rng.P() % (hi - lo + 1));
  w.sound(actor, 'zsbite');
  w.damageMobj(actor.target, actor, actor, damage, { melee: true });
}

registerActions({ A_ZombieAttack });
