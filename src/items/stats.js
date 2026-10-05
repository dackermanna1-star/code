// Aggregates every stat source (gear, relics, boons, buffs) into the player's live stats.
import { WEAPONS, AFFIXES, ARMORS, RELICS, UNIQUES } from './data.js';

export function computeStats(p) {
  const add = {};
  const put = (k, v) => { add[k] = (add[k] || 0) + v; };
  const putAll = (stats) => { for (const k in stats) put(k, stats[k]); };

  const weapon = p.weapon;
  const W = weapon ? WEAPONS[weapon.base] : WEAPONS.sword;
  if (weapon) for (const a of weapon.affixes) put(AFFIXES[a.id].stat, a.v);
  if (p.armor) {
    const A = ARMORS[p.armor.base];
    put('armor', p.armor.armor);
    if (A.speed) put('moveSpeed', A.speed);
    if (A.staminaRegen) put('staminaRegen', A.staminaRegen);
    if (A.cooldown) put('cooldown', A.cooldown);
    for (const a of p.armor.affixes) put(AFFIXES[a.id].stat, a.v);
  }
  for (const t of p.trinkets) if (t) for (const a of t.affixes) put(AFFIXES[a.id].stat, a.v);
  for (const id in p.relics) {
    const n = p.relics[id];
    const R = RELICS[id];
    if (!R) continue;
    for (const k in R.stats) put(k, R.stats[k] * n);
  }
  for (const b of p.boons) putAll(b.stats || {});
  for (const k in p.buffs) {
    const b = p.buffs[k];
    if (b.stats) putAll(b.stats);
  }

  const s = {};
  s.weaponDef = W;
  s.unique = weapon && weapon.unique ? UNIQUES[weapon.unique].on : {};
  s.maxHp = Math.max(20, Math.round((100 + (p.hpMod || 0) + (add.maxHp || 0)) * (1 + (add.maxHpMult || 0))));
  s.maxStamina = 100 + (add.maxStamina || 0);
  s.staminaRegen = 34 * (1 + (add.staminaRegen || 0));
  s.moveSpeed = 5.7 * Math.max(0.5, 1 + (add.moveSpeed || 0));
  s.damage = 1 + (add.damage || 0);
  s.weaponDamage = weapon ? weapon.dmg : 10;
  s.attackSpeed = Math.min(2.5, W.speed * (1 + (add.attackSpeed || 0)));
  s.crit = Math.min(0.9, W.crit + (add.crit || 0));
  s.critMult = 2 + (W.critMult || 0) + (add.critDamage || 0);
  s.reach = W.reach + (add.reach || 0);
  s.knockback = W.knock * (1 + (add.knockback || 0));
  s.stagger = W.stagger * (1 + (add.knockback || 0) * 0.7);
  s.lifesteal = add.lifesteal || 0;
  s.armor = Math.min(0.75, add.armor || 0);
  s.thorns = add.thorns || 0;
  s.burn = (add.burn || 0) + (s.unique.burnAlways ? 1 : 0);
  s.chill = (add.chill || 0) + (s.unique.chillAlways ? 1 : 0);
  s.shock = add.shock || 0;
  s.poison = add.poison || 0;
  s.bleed = (add.bleed || 0) + (W.bleed || 0);
  s.execute = add.execute || 0;
  s.healOnKill = (add.healOnKill || 0) + (s.unique.killHeal || 0);
  s.echoWave = add.echoWave || 0;
  s.regen = add.regen || 0;
  s.luck = add.luck || 0;
  s.goldFind = add.goldFind || 0;
  s.parryWindow = 0.2 * (1 + (add.parryWindow || 0));
  s.parrySlow = add.parrySlow || 0;
  s.kickPower = 1 + (add.kickPower || 0);
  s.wallSlam = add.wallSlam || 0;
  s.blockEff = Math.min(0.8, add.blockEff || 0);
  s.magnet = 1 + (add.magnet || 0);
  s.potionPower = 1 + (add.potionPower || 0);
  s.bombRegen = add.bombRegen || 0;
  s.critShock = add.critShock || 0;
  s.lowHpDamage = (add.lowHpDamage || 0) + (s.unique.lowHpDamage || 0);
  s.killFrenzy = add.killFrenzy || 0;
  s.executeThreshold = Math.min(0.3, add.executeThreshold || 0);
  s.parryNova = add.parryNova || 0;
  s.corpseBurst = Math.min(1, (add.corpseBurst || 0) + (s.unique.corpseBurst || 0));
  s.dodgeCrit = add.dodgeCrit || 0;
  s.orbitBlades = add.orbitBlades || 0;
  s.revealSecrets = add.revealSecrets || 0;
  s.reflect = add.reflect || 0;
  s.echoHit = Math.min(0.6, add.echoHit || 0);
  s.revive = add.revive || 0;
  s.damageTaken = 1 + (add.damageTaken || 0);
  s.knifeFan = add.knifeFan || 0;
  s.momentum = add.momentum || 0;
  s.eliteRage = add.eliteRage || 0;
  s.dodgeCost = 22 * Math.max(0.2, 1 + (add.dodgeCost || 0));
  s.chargeSpeed = 1 + (add.chargeSpeed || 0);
  s.heavyDamage = 1 + (add.heavyDamage || 0);
  s.riposte = 1 + (add.riposte || 0);
  s.potionCap = 5 + (add.potionCap || 0);
  s.cooldown = Math.min(0.6, add.cooldown || 0);
  s.infiniteStamina = !!(p.buffs.swift);
  return s;
}
