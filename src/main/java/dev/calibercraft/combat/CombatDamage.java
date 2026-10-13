package dev.calibercraft.combat;

import dev.calibercraft.core.Ballistics;
import dev.calibercraft.network.HitConfirmPayload;
import dev.calibercraft.registry.ModTags;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.phys.Vec3;

/**
 * Applies bullet damage. The bullet damage type bypasses vanilla armour so the armour formula can be
 * re-applied here with partial armour penetration ({@link Ballistics#afterArmor}); armour still takes
 * durability damage. Invulnerability frames are bypassed (damage type tag) so automatic fire works.
 */
public final class CombatDamage {
	private CombatDamage() {
	}

	public static DamageSource bulletSource(ServerLevel level, ServerPlayer shooter) {
		return new DamageSource(level.registryAccess().lookupOrThrow(Registries.DAMAGE_TYPE).getOrThrow(ModTags.BULLET), shooter, shooter);
	}

	static void apply(ServerLevel level, ShotGroup group, Entity target, ShotGroup.Hit hit) {
		if (!target.isAlive()) {
			return;
		}
		DamageSource source = bulletSource(level, group.shooter);
		double damage = hit.damage;
		if (target instanceof LivingEntity living) {
			double armor = living.getArmorValue();
			double toughness = living.getAttributeValue(Attributes.ARMOR_TOUGHNESS);
			if (armor > 0) {
				living.hurtArmor(source, (float) damage);
			}
			damage = Ballistics.afterArmor(damage, armor, toughness, group.armorPenetration);
		}
		boolean wasAlive = target.isAlive();
		boolean hurt = target.hurtServer(level, source, (float) damage);
		if (!hurt) {
			return;
		}
		if (target instanceof LivingEntity living) {
			if (group.knockback > 0 && hit.dir != null) {
				living.knockback(group.knockback, -hit.dir.x, -hit.dir.z);
			}
			if (group.fireSeconds > 0) {
				living.igniteForSeconds(group.fireSeconds);
			}
		}
		boolean killed = wasAlive && !target.isAlive();
		int kind = killed ? HitConfirmPayload.KILL : (hit.headshot ? HitConfirmPayload.HEADSHOT : HitConfirmPayload.HIT);
		Vec3 at = hit.at != null ? hit.at : target.position();
		ServerPlayNetworking.send(group.shooter, new HitConfirmPayload(kind, (float) damage, at.x, at.y, at.z));
	}
}
