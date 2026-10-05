// Damage resolution, status effects, on-hit / on-kill hooks and melee tracing.
import * as THREE from 'three';
import { rand, chance } from '../core/math.js';

const _v = new THREE.Vector3();

// Trace a set of rays (from origin) against all melee targets; returns sorted hits per ray.
// walls stop rays. Returns { hits: [{target, dist, point, part, dir}], wall: {dist, point, normal}|null }
export function traceRay(game, origin, dir, reach, pad = 0.18) {
  const world = game.world;
  const wh = world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, reach + 0.5);
  let maxD = reach;
  let wall = null;
  if (wh && wh.dist < reach) {
    maxD = wh.dist;
    wall = wh;
  }
  const hits = [];
  for (const t of game.level.meleeTargets) {
    if (!t.meleeRay) continue;
    const r = t.meleeRay(origin, dir, maxD, pad);
    if (r) hits.push({ target: t, dist: r.dist, part: r.part, point: origin.clone().addScaledVector(dir, r.dist), dir: dir.clone() });
  }
  // static obstacles act as walls
  const oh = game.level.rayObstacles(origin, dir, maxD);
  if (oh && (!wall || oh.dist < wall.dist)) {
    wall = { dist: oh.dist, x: oh.x, y: oh.y, z: oh.z, nx: oh.nx, ny: 0, nz: oh.nz, obstacle: oh.obstacle };
    for (let i = hits.length - 1; i >= 0; i--) if (hits[i].dist > oh.dist) hits.splice(i, 1);
  }
  hits.sort((a, b) => a.dist - b.dist);
  return { hits, wall };
}

// Applies a player melee/kick/projectile hit to an enemy. info: see player.js
export function playerHitsEnemy(game, enemy, info) {
  const p = game.player;
  const s = p.stats;
  if (enemy.dead) return { killed: false, damage: 0 };
  let dmg = info.base;
  let crit = false;
  // vulnerable (parried / staggered) enemies take riposte damage
  const vulnerable = enemy.vulnerable > 0;
  if (vulnerable && !info.kick) dmg *= 1.5 * s.riposte;
  // backstab
  if (info.melee && s.weaponDef.backstab && enemy.isBehind(info.dir)) {
    dmg *= s.weaponDef.backstab;
    info.backstab = true;
  }
  // execute affix
  if (s.execute && enemy.hp / enemy.maxHp < 0.35) dmg *= 1 + s.execute;
  // low hp scaling
  if (s.lowHpDamage) dmg *= 1 + s.lowHpDamage * (1 - p.hp / s.maxHp);
  // momentum
  if (s.momentum) dmg *= 1 + s.momentum * Math.min(1, p.horizSpeed() / 7);
  // crushing weapons vs bony / armored
  if (s.weaponDef.crushing && (enemy.def.armored || enemy.def.blood === 'bone')) dmg *= s.weaponDef.crushing;
  if (info.head) dmg *= 1.25;
  let critChance = s.crit + (info.critBonus || 0);
  if (p.dodgeCritReady > 0 && s.dodgeCrit) critChance = 1;
  if (s.unique.critVulnerable && (vulnerable || enemy.status.burn > 0)) critChance = 1;
  if (info.kick) critChance = 0;
  if (vulnerable && !info.kick) critChance += 0.5;
  if (Math.random() < critChance) {
    crit = true;
    dmg *= s.critMult;
    p.dodgeCritReady = 0;
  }
  dmg *= s.damage;
  dmg = Math.max(1, Math.round(dmg * rand(0.93, 1.07)));

  // execution relic
  if (s.executeThreshold && !enemy.def.boss && (enemy.hp - dmg) / enemy.maxHp < s.executeThreshold) dmg = enemy.hp + 1;

  info.crit = crit;
  info.amount = dmg;
  const res = enemy.takeDamage(game, info);
  game.stats.damageDealt += res.damage;

  // life steal
  if (s.lifesteal > 0 && res.damage > 0 && !info.noLeech) p.heal(res.damage * s.lifesteal, true);

  // statuses
  if (!res.killed && info.melee) applyStatuses(game, enemy, info, s);
  if (crit && s.critShock) chainLightning(game, enemy, Math.round(dmg * 0.5), 3);
  if (!res.killed && info.melee && s.shock && Math.random() < s.shock) chainLightning(game, enemy, Math.round(info.base * 0.8 * s.damage), 3);

  // numbers
  const numPos = enemy.headPos();
  game.fx.numbers.add(numPos, String(res.damage), crit ? 'crit big' : info.heavy ? 'heavy' : '');
  return { ...res, crit };
}

export function applyStatuses(game, enemy, info, s) {
  if (s.burn && Math.random() < s.burn) enemy.ignite(game, Math.max(3, Math.round(info.base * 0.18 * s.damage)), 3.5);
  if (s.chill && Math.random() < s.chill) enemy.chill(game, 2.5);
  if (s.poison && Math.random() < s.poison) enemy.poison(game, Math.max(2, Math.round(info.base * 0.12 * s.damage)), 5);
  if (s.bleed && Math.random() < s.bleed) enemy.bleed(game, Math.max(2, Math.round(info.base * 0.15 * s.damage)), 4);
}

export function chainLightning(game, from, damage, jumps, color = 0x9ad8ff) {
  let cur = from;
  const hit = new Set([from]);
  game.audio.zap(cur.pos);
  for (let i = 0; i < jumps; i++) {
    let best = null, bd = 8 * 8;
    for (const e of game.level.enemies) {
      if (e.dead || hit.has(e)) continue;
      const d = e.pos.distanceToSquared(cur.pos);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) break;
    hit.add(best);
    game.fx.lightning(cur.chestPos(), best.chestPos(), color);
    const dir = _v.subVectors(best.pos, cur.pos).normalize().clone();
    best.takeDamage(game, { amount: damage, dir, type: 'shock', knockback: 1.5, stagger: 15, point: best.chestPos(), source: 'player' });
    game.fx.numbers.add(best.headPos(), String(damage), 'shock');
    cur = best;
  }
}

// Area damage (bombs, explosions, slams). Hits enemies, player (if hurtsPlayer), props and corpses.
export function explode(game, pos, radius, damage, opts = {}) {
  const { hurtsPlayer = true, source = 'player', color = 0xff8030, knock = 12, fire = false } = opts;
  game.fx.explosion(pos, radius, color);
  game.audio.explosion(pos, radius / 3);
  game.player.addTrauma(Math.max(0, 0.8 - game.player.pos.distanceTo(pos) / (radius * 4)));
  for (const e of game.level.enemies) {
    if (e.dead) continue;
    const d = e.pos.distanceTo(pos);
    if (d > radius + e.radius) continue;
    const f = 1 - Math.min(1, d / (radius + e.radius));
    const dir = _v.subVectors(e.pos, pos).setY(0).normalize().clone();
    dir.y = 0.6;
    dir.normalize();
    const amount = Math.round(damage * (0.4 + f * 0.6));
    const res = e.takeDamage(game, { amount, dir, type: 'explosion', knockback: knock * (0.5 + f), stagger: 80, point: e.chestPos(), source, explosion: true, gore: 2 });
    if (fire && !res.killed) e.ignite(game, Math.round(damage * 0.1), 3);
    game.fx.numbers.add(e.headPos(), String(res.damage), 'heavy');
    if (source === 'player') game.stats.damageDealt += res.damage;
  }
  if (hurtsPlayer) {
    const d = game.player.pos.distanceTo(pos);
    if (d < radius + 0.4) {
      const f = 1 - d / (radius + 0.4);
      const dir = _v.subVectors(game.player.pos, pos).setY(0).normalize().clone();
      game.player.takeDamage({ amount: Math.round(damage * 0.45 * (0.4 + f * 0.6)), dir, type: 'explosion', unblockable: true, knock: 8 * f, source: 'explosion' });
    }
  }
  game.level.impulseArea(pos, radius * 1.6, knock * 1.2);
}

// Enemy killed by anything.
export function onEnemyKilled(game, enemy, info) {
  const p = game.player;
  const s = p.stats;
  game.stats.kills++;
  if (enemy.elite) game.stats.elites++;
  p.gainXp(enemy.def.xp * (1 + enemy.elite * 0.8) * (enemy.miniboss ? 3 : 1));
  if (info.source === 'player' || info.source === 'reflect') {
    if (s.healOnKill) p.heal(s.healOnKill, true);
    if (s.killFrenzy) p.addBuff('frenzy', 6, { attackSpeed: 0.06 }, 5);
    if (s.unique.killHaste) p.addBuff('haste', 2, { moveSpeed: 0.3, attackSpeed: 0.2 });
    if (s.eliteRage && (enemy.elite || enemy.miniboss)) p.addBuff('rage', 10, { damage: 0.3, moveSpeed: 0.2 });
  }
  const burst = s.corpseBurst && Math.random() < s.corpseBurst && info.source !== 'corpseburst';
  if (burst || (s.unique.shatter && enemy.status.chill > 0)) {
    const pos = enemy.chestPos();
    setTimeout(() => {
      if (!game.level) return;
      if (s.unique.shatter && enemy.status.chill > 0) {
        game.fx.magic(pos, 0x99eeff, 30, 6);
        game.audio.freeze(pos);
      }
      explode(game, pos, 2.6, 18 + game.floor * 6, { hurtsPlayer: false, source: 'corpseburst', color: s.unique.shatter ? 0x88ddff : 0xff6633 });
    }, 120);
  }
  game.onEnemyKilled(enemy, info);
}

export function rollChance(p) {
  return chance(p);
}
