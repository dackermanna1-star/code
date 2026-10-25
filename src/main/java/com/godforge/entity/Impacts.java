package com.godforge.entity;

import com.godforge.config.GodforgeConfig;
import com.godforge.destruction.BlockOps;
import com.godforge.network.Fx;
import com.godforge.network.FxType;
import com.godforge.registry.ModSounds;
import com.godforge.util.Combat;
import com.godforge.util.EffectEntity;
import com.godforge.util.Loaded;
import com.godforge.util.Scheduler;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.jspecify.annotations.Nullable;

/** Reusable pieces of big impact sequences. */
public final class Impacts {
	private Impacts() {
	}

	/**
	 * Flings real blocks from around an impact outward. Blocks are sampled before the crater job removes
	 * them, so the debris matches the terrain that was hit.
	 */
	public static int debris(ServerLevel level, Vec3 center, double radius, int requested, double speed, double lift) {
		int count = Math.min(requested, GodforgeConfig.get().performance.maxDebrisPerEvent);
		RandomSource random = level.getRandom();
		int spawned = 0;
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		for (int attempt = 0; attempt < count * 4 && spawned < count; attempt++) {
			double angle = random.nextDouble() * Math.PI * 2;
			double dist = Math.sqrt(random.nextDouble()) * radius;
			double dy = -random.nextDouble() * radius * 0.5;
			pos.set(center.x + Math.cos(angle) * dist, center.y + dy, center.z + Math.sin(angle) * dist);
			BlockState state = Loaded.state(level, pos);
			if (state == null || state.isAir() || !state.isSolid() || BlockOps.isProtected(level, pos, state) || state.hasBlockEntity()) {
				continue;
			}
			Vec3 out = new Vec3(Math.cos(angle), 0, Math.sin(angle));
			double s = speed * (0.5 + random.nextDouble());
			Vec3 velocity = out.scale(s).add(0, lift * (0.6 + random.nextDouble() * 0.8), 0);
			if (FlyingDebrisEntity.spawn(level, Vec3.atCenterOf(pos).add(0, radius * 0.3 + 1.0, 0), state, velocity, 0.7F + random.nextFloat() * 0.6F) != null) {
				spawned++;
			}
		}
		return spawned;
	}

	/**
	 * A sequence of expanding shockwave rings. Each ring damages and knocks back everything inside its
	 * annulus when it passes.
	 */
	public static void shockwaves(
		ServerLevel level, Vec3 center, int rings, double maxRadius, int interval, int color, float damage, DamageSource source, @Nullable Entity owner
	) {
		for (int i = 0; i < rings; i++) {
			double outer = maxRadius * (i + 1) / rings;
			double inner = outer - maxRadius / rings;
			int delay = i * interval;
			float ringDamage = damage * (1.0F - i / (float) (rings + 1));
			Scheduler.later(level, delay, () -> {
				Fx.send(level, FxType.SHOCKWAVE, center, Vec3.ZERO, (float) outer, 14.0F, color, Math.max(256, outer * 6));
				Fx.sound(level, center, ModSounds.SHOCKWAVE, (float) Math.min(16.0, 2.0 + outer / 8.0), 0.7F + level.getRandom().nextFloat() * 0.2F);
				ring(level, center, inner, outer, ringDamage, source, owner);
			});
		}
	}

	private static void ring(ServerLevel level, Vec3 center, double inner, double outer, float damage, DamageSource source, @Nullable Entity owner) {
		AABB box = new AABB(center, center).inflate(outer, Math.max(8.0, outer * 0.4), outer);
		for (Entity e : level.getEntities((Entity) null, box, e -> e.isAlive() && !(e instanceof EffectEntity))) {
			Vec3 rel = e.position().subtract(center);
			double h = Math.sqrt(rel.x * rel.x + rel.z * rel.z);
			if (h < inner || h > outer) {
				continue;
			}
			Vec3 dir = h < 1.0E-3 ? new Vec3(1, 0, 0) : new Vec3(rel.x / h, 0, rel.z / h);
			if (owner != null && e == owner) {
				continue;
			}
			if (Combat.canAffect(level, owner, e)) {
				Combat.hurt(level, e, source, damage);
			}
			double push = Mth.clamp(2.2 - h / Math.max(1.0, outer) * 1.2, 0.6, 2.2);
			Combat.launch(e, dir.scale(push).add(0, 0.7, 0));
		}
	}

	/** Standard visual + audio package for a big impact. */
	public static void blastFx(ServerLevel level, Vec3 at, float radius, int color, float flash, float shake) {
		Fx.send(level, FxType.EXPLOSION, at, Vec3.ZERO, radius, 0.0F, color, Math.max(256, radius * 12));
		Fx.send(level, FxType.DEBRIS_RING, at, Vec3.ZERO, radius, 0.0F, color, Math.max(192, radius * 8));
		if (flash > 0) {
			Fx.flash(level, at, color, flash, (int) (10 + radius), radius * 10);
		}
		if (shake > 0) {
			Fx.shake(level, at, shake, (int) (20 + radius * 2), radius * 10);
		}
	}
}
