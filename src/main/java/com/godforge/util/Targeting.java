package com.godforge.util;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
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

	public static @Nullable Entity entityAt(HitResult hit) {
		return hit instanceof EntityHitResult e ? e.getEntity() : null;
	}
}
