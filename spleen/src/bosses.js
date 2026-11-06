/* TEMP stub — replaced by the real boss module */
"use strict";
function spawnBoss(id, x, y) {
  const def = BOSSES[id];
  const e = spawnEnemy('coccus', x, y, { hp: def.hp, r: def.r });
  e.isBoss = true; e.bossId = id; e.color = def.color; e.anchored = true;
  e.update = (e, dt, k) => { chase(e, 1.2 * k); e.cd -= dt; if (e.cd <= 0) { e.cd = 1.5; enemyRing(e.x, e.y, 12, 4); } };
  return e;
}
