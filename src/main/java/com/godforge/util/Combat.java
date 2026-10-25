package com.godforge.util;

import com.godforge.config.GodforgeConfig;
import java.util.List;
import java.util.function.Predicate;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.boss.enderdragon.EnderDragonPart;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/** Area damage, knockback and friend-or-foe rules shared by every weapon. */
public final class Combat {
	private Combat() {
	}

	/** Whether {@code owner}'s ability may affect {@code target} at all. */
	public static boolean canAffect(ServerLevel level, @Nullable Entity owner, Entity target) {
		if (!target.isAlive() || target.isSpectator()) {
			return false;
		}
		if (owner != null) {
			if (target == owner || target.isPassengerOfSameVehicle(owner) || owner.isPassenger() && owner.getVehicle() == target) {
				return GodforgeConfig.get().general.damageOwner;
			}
			if (target instanceof Player victim && owner instanceof Player attacker) {
				if (!level.getGameRules().get(GameRules.PVP) || !attacker.canHarmPlayer(victim)) {
					return false;
				}
			}
			if (target.isAlliedTo(owner)) {
				return false;
			}
		}
		return true;
	}

	public static float scaled(float damage, Entity target) {
		GodforgeConfig.General g = GodforgeConfig.get().general;
		float scaled = (float) (damage * g.damageScale);
		if (target instanceof Player) {
			scaled *= (float) g.playerDamageScale;
		}
		return scaled;
	}

	/** Deals scaled damage; returns true if the target was hurt. */
	public static boolean hurt(ServerLevel level, Entity target, DamageSource source, float damage) {
		float amount = scaled(damage, target);
		if (amount <= 0.0F) {
			return false;
		}
		if (target instanceof EnderDragonPart part) {
			return part.parentMob.hurt(level, part, source, amount);
		}
		return target.hurtServer(level, source, amount);
	}

	/** Adds velocity and makes sure clients (including the victim if it is a player) receive it. */
	public static void launch(Entity entity, Vec3 velocity) {
		Vec3 current = entity.getDeltaMovement();
		entity.setDeltaMovement(current.add(velocity));
		entity.hurtMarked = true;
		entity.needsSync = true;
		if (entity instanceof LivingEntity living) {
			living.resetFallDistance();
		}
	}

	/** Pushes everything near a point outward (no damage). Items and other loose entities are included. */
	public static void blast(ServerLevel level, @Nullable Entity owner, Vec3 center, double radius, double strength, double lift) {
		AABB box = new AABB(center, center).inflate(radius);
		for (Entity e : level.getEntities((Entity) null, box, e -> e.isAlive() && !(e instanceof EnderDragonPart) && !(e instanceof EffectEntity))) {
			if (owner != null && e == owner && !GodforgeConfig.get().general.damageOwner) {
				continue;
			}
			double dist = e.position().distanceTo(center);
			if (dist > radius) {
				continue;
			}
			double falloff = 1.0 - dist / radius;
			Vec3 dir = e.position().add(0, e.getBbHeight() * 0.5, 0).subtract(center);
			dir = dir.lengthSqr() < 1.0E-4 ? new Vec3(0, 1, 0) : dir.normalize();
			launch(e, dir.scale(strength * falloff).add(0, lift * falloff, 0));
		}
	}

	/**
	 * Damages and knocks back every valid target inside a sphere.
	 *
	 * @param falloff exponent for damage drop-off towards the edge (0 = uniform)
	 * @return number of entities hit
	 */
	public static int sphere(
		ServerLevel level, DamageSource source, @Nullable Entity owner, Vec3 center, double radius, float damage, double falloff, double knockback, double lift
	) {
		return area(level, source, owner, center, radius, damage, falloff, knockback, lift, e -> true);
	}

	public static int area(
		ServerLevel level, DamageSource source, @Nullable Entity owner, Vec3 center, double radius, float damage, double falloff, double knockback, double lift,
		Predicate<Entity> filter
	) {
		AABB box = new AABB(center, center).inflate(radius);
		List<Entity> list = level.getEntities((Entity) null, box, e -> e.isAlive() && filter.test(e));
		int hits = 0;
		for (Entity e : list) {
			if (e instanceof EnderDragonPart) {
				continue;
			}
			Vec3 mid = e.getBoundingBox().getCenter();
			double dist = Math.max(0.0, mid.distanceTo(center) - e.getBbWidth() * 0.5);
			if (dist > radius) {
				continue;
			}
			double f = falloff <= 0.0 ? 1.0 : Math.pow(1.0 - dist / radius, falloff);
			Vec3 dir = mid.subtract(center);
			dir = dir.lengthSqr() < 1.0E-4 ? new Vec3(0, 1, 0) : dir.normalize();
			if (e instanceof EffectEntity) {
				continue;
			}
			if (e instanceof ItemEntity || e instanceof ExperienceOrb) {
				launch(e, dir.scale(knockback * f).add(0, lift * f, 0));
				continue;
			}
			if (!canAffect(level, owner, e)) {
				continue;
			}
			boolean hurt = damage > 0.0F && hurt(level, e, source, (float) (damage * f));
			if (knockback > 0.0 || lift > 0.0) {
				launch(e, dir.scale(knockback * f).add(0, lift * f, 0));
			}
			if (hurt) {
				hits++;
			}
		}
		return hits;
	}
}
