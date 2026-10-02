/**
 * Minecraft (1.9+) melee combat: attack cooldown, crits, sweeping, knockback, sprint knockback.
 * Damage/knockback modifiers from enchantments are pluggable via hooks.
 */
import * as THREE from 'three';
import type { Player } from '../entity/player';
import type { Entity } from '../entity/entity';
import { LivingEntity } from '../entity/living';

export interface AttackHooks {
  /** Extra damage from enchantments (sharpness, smite, bane) for the target. */
  bonusDamage?(player: Player, target: Entity): number;
  /** Extra knockback level (knockback enchantment). */
  knockbackLevel?(player: Player): number;
  /** Fire aspect seconds. */
  fireAspect?(player: Player): number;
  /** Sweeping edge damage ratio. */
  sweepRatio?(player: Player): number;
  /** Called after a successful hit. */
  onHit?(player: Player, target: Entity, damage: number, crit: boolean): void;
}
export const ATTACK_HOOKS: AttackHooks[] = [];

/** Perform a melee attack from the player on an entity. */
export function playerAttack(player: Player, target: Entity, game: any): boolean {
  if (player.spectator) return false;
  const strength = player.attackStrength(0.5);
  const held = player.mainHand;
  let base = 1 + (held?.item.attackDamage ?? 0);
  base += 3 * player.effectLevel('strength');
  base -= 4 * player.effectLevel('weakness');
  let bonus = 0;
  for (const h of ATTACK_HOOKS) bonus += h.bonusDamage?.(player, target) ?? 0;
  let dmg = base * (0.2 + strength * strength * 0.8);
  bonus *= strength;
  if (dmg <= 0 && bonus <= 0) {
    player.resetAttack();
    return false;
  }
  const strong = strength > 0.9;
  let kbLevel = 0;
  for (const h of ATTACK_HOOKS) kbLevel += h.knockbackLevel?.(player) ?? 0;
  const sprintHit = player.sprinting && strong;
  if (sprintHit) kbLevel++;
  const crit = strong && player.fallDistance > 0 && !player.onGround && !player.onClimbable && !player.inWater && !player.hasEffect('blindness') && !player.sprinting;
  if (crit) dmg *= 1.5;
  dmg += bonus;
  const isSword = held?.item.tags.includes('swords') ?? false;
  const sweep = strong && !crit && !sprintHit && player.onGround && isSword && Math.hypot(player.vel.x, player.vel.z) < 0.5 * 20 * 0.1 * 4;
  const dir = new THREE.Vector3().subVectors(target.pos, player.pos).setY(0).normalize();
  const point = target.box ? new THREE.Vector3(
    THREE.MathUtils.clamp(player.pos.x + player.lookDir().x * 1.5, target.box.minX, target.box.maxX),
    THREE.MathUtils.clamp(player.pos.y + player.eyeHeight + player.lookDir().y * 1.5, target.box.minY, target.box.maxY),
    THREE.MathUtils.clamp(player.pos.z + player.lookDir().z * 1.5, target.box.minZ, target.box.maxZ)) : target.pos.clone();
  const weapon = held?.item.name ?? 'hand';
  const impulse = (0.6 + strength * 1.4) * (crit ? 1.4 : 1) * (sprintHit ? 1.3 : 1) * weaponMass(weapon);
  const ok = target.hurt({ type: 'player', attacker: player, direct: player, point, dir: dir.clone().setY(0.25).normalize(), impulse, weapon, crit }, dmg);
  if (ok) {
    if (target instanceof LivingEntity) {
      if (kbLevel > 0) {
        target.knockback(kbLevel * 0.5, dir.x, dir.z);
        player.vel.x *= 0.6;
        player.vel.z *= 0.6;
        player.sprinting = false;
      } else target.knockback(0.4, dir.x, dir.z);
      let fire = 0;
      for (const h of ATTACK_HOOKS) fire = Math.max(fire, h.fireAspect?.(player) ?? 0);
      if (fire > 0) target.fireTicks = Math.max(target.fireTicks, fire * 20);
    }
    if (sweep && game?.entities) {
      let ratio = 0;
      for (const h of ATTACK_HOOKS) ratio = Math.max(ratio, h.sweepRatio?.(player) ?? 0);
      const sweepDmg = 1 + ratio * dmg;
      for (const e of game.entities.query(target.box.grow(1).expand(0, 0.25, 0), (o: Entity) => o !== player && o !== target && o instanceof LivingEntity)) {
        if (player.pos.distanceToSquared(e.pos) > 9) continue;
        const d2 = new THREE.Vector3().subVectors(e.pos, player.pos).setY(0).normalize();
        if (e.hurt({ type: 'player', attacker: player, direct: player, dir: d2, impulse: 0.6, weapon }, sweepDmg)) (e as LivingEntity).knockback(0.4, d2.x, d2.z);
      }
      game.events.emit('sweepAttack', { player });
    }
    for (const h of ATTACK_HOOKS) h.onHit?.(player, target, dmg, crit);
    game?.events.emit('playerAttack', { player, target, damage: dmg, crit, sweep, strength, weapon, point });
    // tool durability (swords 1, tools 2)
    if (held && held.item.durability) player.damageItem(player.inventory.selected, held.item.tool && held.item.tool.type !== 'sword' ? 2 : 1);
    player.addExhaustion(0.1);
  } else {
    game?.events.emit('playerAttackMiss', { player, target, strength });
  }
  player.resetAttack();
  return ok;
}

/** Relative "mass" of a weapon for impact characteristics (hand 0.6 .. axe 1.5). */
export function weaponMass(name: string): number {
  if (name === 'hand') return 0.55;
  if (name.endsWith('_axe')) return 1.5;
  if (name.endsWith('_sword')) return 1.1;
  if (name.endsWith('_pickaxe')) return 1.25;
  if (name.endsWith('_shovel')) return 1.0;
  if (name === 'trident' || name === 'mace') return 1.6;
  return 0.8;
}
