package com.jjkshowdown.combat;

import com.jjkshowdown.registry.ModDamageTypes;
import com.jjkshowdown.sorcerer.Mastery;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

/** Dealing technique damage and impulses. All damage passes through {@link CombatHandler} via the hurt mixin. */
public final class TechniqueDamage {
	private TechniqueDamage() {
	}

	/**
	 * Hurt a target with a technique.
	 *
	 * @param multiHit reset vanilla invulnerability frames so rapid multi-hit techniques connect every time
	 * @return true if damage was applied
	 */
	public static boolean hurt(LivingEntity target, ResourceKey<DamageType> type, @Nullable Entity direct, @Nullable LivingEntity attacker,
			float amount, boolean multiHit) {
		if (!(target.level() instanceof ServerLevel level) || amount <= 0 || !target.isAlive()) return false;
		DamageSource src = ModDamageTypes.source(level, type, direct != null ? direct : attacker, attacker);
		if (multiHit) target.invulnerableTime = 0;
		float before = target.getHealth();
		boolean hit = target.hurtServer(level, src, amount);
		if (multiHit) target.invulnerableTime = 0;
		if (hit && attacker != null) {
			float dealt = Math.max(0, before - target.getHealth());
			Mastery.addXp(attacker, dealt * 0.6f);
		}
		return hit;
	}

	/** Push an entity with an explicit velocity change and sync it to the client. */
	public static void impulse(Entity target, Vec3 velocity) {
		if (target instanceof LivingEntity le) {
			double resist = le.getAttributeValue(net.minecraft.world.entity.ai.attributes.Attributes.KNOCKBACK_RESISTANCE);
			velocity = velocity.scale(Math.max(0.15, 1.0 - resist * 0.7));
		}
		target.setDeltaMovement(target.getDeltaMovement().add(velocity));
		target.hurtMarked = true;
		target.needsSync = true;
	}

	/** Replace velocity entirely (launchers, spikes). */
	public static void setVelocity(Entity target, Vec3 velocity) {
		target.setDeltaMovement(velocity);
		target.hurtMarked = true;
		target.needsSync = true;
	}

	/** Knock {@code target} directly away from {@code from} with the given horizontal/vertical strength. */
	public static void knockAway(Entity target, Vec3 from, double horizontal, double vertical) {
		Vec3 d = target.position().subtract(from);
		Vec3 flat = new Vec3(d.x, 0, d.z);
		if (flat.lengthSqr() < 1.0E-4) flat = new Vec3(target.getRandom().nextGaussian(), 0, target.getRandom().nextGaussian());
		flat = flat.normalize();
		impulse(target, new Vec3(flat.x * horizontal, vertical, flat.z * horizontal));
	}
}
