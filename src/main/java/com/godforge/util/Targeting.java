package com.godforge.util;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/** Long-range aiming helpers. */
public final class Targeting {
	private Targeting() {
	}

	/** What the entity is looking at within {@code range}: a creature, a block, or (if nothing) the far point. */
	public static Vec3 aimPoint(LivingEntity shooter, double range) {
		HitResult hit = aim(shooter, range);
		return hit.getLocation();
	}

	public static HitResult aim(LivingEntity shooter, double range) {
		ServerLevel level = (ServerLevel) shooter.level();
		Vec3 eye = shooter.getEyePosition();
		Vec3 look = shooter.getLookAngle();
		Vec3 far = eye.add(look.scale(range));
		BlockHitResult block = Loaded.clip(level, eye, far, ClipContext.Block.OUTLINE, ClipContext.Fluid.ANY, shooter);
		Vec3 limit = block.getLocation();
		EntityHitResult entity = ProjectileUtil.getEntityHitResult(
			shooter, eye, limit, new AABB(eye, limit).inflate(1.0), e -> e instanceof LivingEntity && e.isAlive() && e != shooter && !(e instanceof EffectEntity), eye.distanceToSqr(limit)
		);
		return entity != null ? entity : block;
	}

	/**
	 * The ground position under (or at) an aim point. Returns null unless the column is in an entity-ticking
	 * chunk, because whatever is sent there (asteroids, suns, rifts ...) has to be able to play out.
	 */
	public static @Nullable Vec3 ground(ServerLevel level, Vec3 point) {
		int x = (int) Math.floor(point.x);
		int z = (int) Math.floor(point.z);
		if (Loaded.chunk(level, x, z) == null || !level.isPositionEntityTicking(new BlockPos(x, 0, z))) {
			return null;
		}
		int top = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
		double y = point.y < top ? point.y : top;
		return new Vec3(point.x, y, point.z);
	}

	/**
	 * Where an area ability lands: the ground the player is aiming at, or — when they aim at the sky or past the
	 * active world — the ground {@code fallback} blocks ahead of them, or finally under their feet. Always a
	 * position inside entity-ticking chunks, so whatever is spawned there can play out.
	 */
	public static Vec3 groundTarget(ServerPlayer player, double range, double fallback) {
		ServerLevel level = player.level();
		HitResult hit = aim(player, range);
		if (hit.getType() != HitResult.Type.MISS) {
			Vec3 aimed = ground(level, hit.getLocation());
			if (aimed != null) {
				return aimed;
			}
		}
		Vec3 look = player.getLookAngle();
		Vec3 flat = new Vec3(look.x, 0, look.z);
		if (flat.lengthSqr() > 1.0E-4) {
			Vec3 ahead = ground(level, player.position().add(flat.normalize().scale(fallback)));
			if (ahead != null) {
				return ahead;
			}
		}
		Vec3 below = ground(level, player.position());
		return below != null ? below : player.position();
	}

	public static @Nullable Entity entityAt(HitResult hit) {
		return hit instanceof EntityHitResult e ? e.getEntity() : null;
	}
}
