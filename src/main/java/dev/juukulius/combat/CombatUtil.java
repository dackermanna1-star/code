package dev.juukulius.combat;

import dev.juukulius.config.JuliusServerConfig;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Predicate;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityReference;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Server-side hit detection and damage helpers shared by sword arts, spirit arts and projectiles.
 * Every damage call goes through {@link #damage} so config multipliers, PvP rules and team rules apply uniformly.
 */
public final class CombatUtil {
	private CombatUtil() {
	}

	/** Whether {@code attacker}'s arts may hurt {@code target}: respects teams, PvP, pets, spectators and markers. */
	public static boolean canHarm(Entity attacker, Entity target) {
		if (!(target instanceof LivingEntity living) || !living.isAlive() || target == attacker || target.isSpectator()) {
			return false;
		}

		if (target instanceof ArmorStand stand && stand.isMarker()) {
			return false;
		}

		if (!living.isAttackable() || attacker.isAlliedTo(target)) {
			return false;
		}

		if (target instanceof OwnableEntity ownable) {
			EntityReference<LivingEntity> owner = ownable.getOwnerReference();
			if (owner != null && owner.getUUID().equals(attacker.getUUID())) {
				return false;
			}
		}

		if (target instanceof Player targetPlayer) {
			if (targetPlayer.isCreative() || !JuliusServerConfig.get().artsDamagePlayers) {
				return false;
			}

			return !(attacker instanceof Player attackingPlayer) || attackingPlayer.canHarmPlayer(targetPlayer);
		}

		return true;
	}

	/**
	 * Applies art damage. Julius's damage types are tagged {@code bypasses_cooldown} (each art controls its own hit
	 * frequency) and {@code no_knockback} (each art applies its own directional knockback).
	 */
	public static boolean damage(ServerPlayer attacker, LivingEntity target, ResourceKey<DamageType> type, Entity direct, float amount) {
		if (!canHarm(attacker, target)) {
			return false;
		}

		ServerLevel level = attacker.level();
		DamageSource source = level.damageSources().source(type, direct, attacker);
		float scaled = amount * (float) JuliusServerConfig.get().damageMultiplier;
		return scaled > 0.0F && target.hurtServer(level, source, scaled);
	}

	/** Pushes {@code target} along the horizontal {@code direction}, optionally lifting it. */
	public static void knockback(LivingEntity target, Vec3 direction, double strength, double lift) {
		Vec3 horizontal = new Vec3(direction.x, 0.0, direction.z);
		if (horizontal.lengthSqr() < 1.0E-6) {
			horizontal = new Vec3(0.0, 0.0, 1.0);
		}

		horizontal = horizontal.normalize();
		if (strength > 0.0) {
			target.knockback(strength, -horizontal.x, -horizontal.z);
		}

		if (lift > 0.0) {
			double resistance = 1.0 - target.getAttributeValue(net.minecraft.world.entity.ai.attributes.Attributes.KNOCKBACK_RESISTANCE);
			Vec3 motion = target.getDeltaMovement();
			target.setDeltaMovement(motion.x, Math.max(motion.y, lift * Math.max(0.2, resistance)), motion.z);
		}

		target.hurtMarked = true;
	}

	/** Living targets inside a horizontal arc in front of the player, nearest first. */
	public static List<LivingEntity> targetsInArc(ServerPlayer player, double reach, double halfAngleDegrees, double verticalReach) {
		Vec3 eye = player.getEyePosition();
		Vec3 look = player.getLookAngle();
		Vec3 flatLook = new Vec3(look.x, 0.0, look.z);
		flatLook = flatLook.lengthSqr() < 1.0E-6 ? new Vec3(0.0, 0.0, 1.0) : flatLook.normalize();
		double cosLimit = Math.cos(Math.toRadians(halfAngleDegrees));
		AABB box = player.getBoundingBox().inflate(reach + 1.0, verticalReach + 1.0, reach + 1.0);
		List<LivingEntity> result = new ArrayList<>();

		for (LivingEntity candidate : player.level().getEntitiesOfClass(LivingEntity.class, box, entity -> canHarm(player, entity))) {
			Vec3 closest = closestPoint(candidate.getBoundingBox(), eye);
			Vec3 offset = closest.subtract(eye);
			double distance = offset.length();
			if (distance > reach) {
				continue;
			}

			if (Math.abs(offset.y) > verticalReach + candidate.getBbHeight() * 0.5 && distance > 1.2) {
				continue;
			}

			Vec3 flatOffset = new Vec3(offset.x, 0.0, offset.z);
			boolean inArc = flatOffset.lengthSqr() < 0.36 || flatOffset.normalize().dot(flatLook) >= cosLimit;
			if (inArc && hasLineOfSight(player, eye, candidate.getBoundingBox().getCenter())) {
				result.add(candidate);
			}
		}

		result.sort(Comparator.comparingDouble(entity -> entity.distanceToSqr(player)));
		return result;
	}

	/** The single target under the crosshair (with a small aim-assist margin), or null. */
	public static LivingEntity raycastTarget(ServerPlayer player, double reach, double margin) {
		Vec3 eye = player.getEyePosition();
		Vec3 look = player.getLookAngle();
		Vec3 end = eye.add(look.scale(reach));
		HitResult blockHit = player.level().clip(new ClipContext(eye, end, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, player));
		double maxDistance = blockHit.getType() == HitResult.Type.MISS ? reach : blockHit.getLocation().distanceTo(eye);
		LivingEntity best = null;
		double bestDistance = Double.MAX_VALUE;

		for (LivingEntity candidate : player.level().getEntitiesOfClass(LivingEntity.class,
			player.getBoundingBox().expandTowards(look.scale(reach)).inflate(margin + 1.0), entity -> canHarm(player, entity))) {
			AABB box = candidate.getBoundingBox().inflate(margin);
			var hit = box.clip(eye, end);
			double distance;
			if (box.contains(eye)) {
				distance = 0.0;
			} else if (hit.isPresent()) {
				distance = hit.get().distanceTo(eye);
			} else {
				continue;
			}

			if (distance <= maxDistance && distance < bestDistance) {
				bestDistance = distance;
				best = candidate;
			}
		}

		return best;
	}

	public static List<LivingEntity> targetsInSphere(ServerPlayer player, Vec3 center, double radius) {
		return targetsInSphere(player, center, radius, entity -> true);
	}

	public static List<LivingEntity> targetsInSphere(ServerPlayer player, Vec3 center, double radius, Predicate<LivingEntity> filter) {
		AABB box = new AABB(center, center).inflate(radius);
		List<LivingEntity> result = new ArrayList<>();
		for (LivingEntity candidate : player.level().getEntitiesOfClass(LivingEntity.class, box, entity -> canHarm(player, entity) && filter.test(entity))) {
			if (closestPoint(candidate.getBoundingBox(), center).distanceToSqr(center) <= radius * radius) {
				result.add(candidate);
			}
		}

		return result;
	}

	/** Targets inside a cone from {@code origin} along {@code direction}. */
	public static List<LivingEntity> targetsInCone(ServerPlayer player, Vec3 origin, Vec3 direction, double length, double halfAngleDegrees) {
		Vec3 dir = direction.normalize();
		double cosLimit = Math.cos(Math.toRadians(halfAngleDegrees));
		List<LivingEntity> result = new ArrayList<>();
		for (LivingEntity candidate : targetsInSphere(player, origin, length)) {
			Vec3 toTarget = candidate.getBoundingBox().getCenter().subtract(origin);
			double distance = toTarget.length();
			if (distance < 1.0 || toTarget.normalize().dot(dir) >= cosLimit) {
				if (hasLineOfSight(player, origin, candidate.getBoundingBox().getCenter())) {
					result.add(candidate);
				}
			}
		}

		return result;
	}

	public static boolean hasLineOfSight(Entity viewer, Vec3 from, Vec3 to) {
		HitResult hit = viewer.level().clip(new ClipContext(from, to, ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE, viewer));
		return hit.getType() == HitResult.Type.MISS;
	}

	public static Vec3 closestPoint(AABB box, Vec3 point) {
		return new Vec3(
			Mth.clamp(point.x, box.minX, box.maxX),
			Mth.clamp(point.y, box.minY, box.maxY),
			Mth.clamp(point.z, box.minZ, box.maxZ)
		);
	}

	/** Horizontal unit vector from {@code from} to {@code to}, falling back to {@code fallback}. */
	public static Vec3 horizontalDirection(Vec3 from, Vec3 to, Vec3 fallback) {
		Vec3 flat = new Vec3(to.x - from.x, 0.0, to.z - from.z);
		return flat.lengthSqr() < 1.0E-6 ? fallback : flat.normalize();
	}
}
