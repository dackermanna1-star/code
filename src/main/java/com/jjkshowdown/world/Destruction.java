package com.jjkshowdown.world;

import com.jjkshowdown.config.JjkConfig;
import com.jjkshowdown.entity.FlyingDebrisEntity;
import com.jjkshowdown.entity.boss.SorcererBoss;
import com.jjkshowdown.registry.ModBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.phys.Vec3;
import org.jetbrains.annotations.Nullable;

import java.util.UUID;

/**
 * Environmental destruction with safety rails: never touches block entities, unbreakable/protected blocks,
 * fluids or domain blocks, respects spawn protection, world border, mobGriefing for bosses, a per-tick budget,
 * and journals every change for later restoration.
 */
public final class Destruction {
	private static long budgetTick = -1;
	private static int budgetUsed;

	private Destruction() {
	}

	public static boolean enabledFor(ServerLevel level, @Nullable Entity cause) {
		JjkConfig.Destruction cfg = JjkConfig.get().destruction;
		if (!cfg.enabled) return false;
		if (cause instanceof SorcererBoss && !cfg.bossIgnoresMobGriefing && !level.getGameRules().get(GameRules.MOB_GRIEFING)) return false;
		return true;
	}

	private static boolean takeBudget(ServerLevel level) {
		long now = level.getGameTime();
		if (now != budgetTick) {
			budgetTick = now;
			budgetUsed = 0;
		}
		if (budgetUsed >= JjkConfig.get().destruction.blocksPerTickBudget) return false;
		budgetUsed++;
		return true;
	}

	public static boolean canDestroy(ServerLevel level, BlockPos pos, BlockState state, @Nullable Entity cause, float maxHardness) {
		if (state.isAir()) return false;
		if (!level.isInWorldBounds(pos) || !level.getWorldBorder().isWithinBounds(pos)) return false;
		if (state.hasBlockEntity()) return false;
		if (!state.getFluidState().isEmpty()) return false;
		if (ModBlocks.isDomainBlock(state.getBlock())) return false;
		if (state.is(BlockTags.WITHER_IMMUNE) || state.is(BlockTags.DRAGON_IMMUNE)) return false;
		float hardness = state.getDestroySpeed(level, pos);
		if (hardness < 0 || hardness > Math.min(maxHardness, JjkConfig.get().destruction.maxBlockHardness)) return false;
		if (cause instanceof Player p && !level.mayInteract(p, pos)) return false;
		return true;
	}

	/**
	 * Destroy one block (no drops). Returns true if the block was removed.
	 *
	 * @param holder domain that owns this destruction (restored when the domain is released) or null
	 */
	public static boolean destroy(ServerLevel level, BlockPos pos, @Nullable Entity cause, float maxHardness, float debrisChance,
			@Nullable Vec3 debrisOrigin, @Nullable UUID holder) {
		BlockState state = level.getBlockState(pos);
		if (!canDestroy(level, pos, state, cause, maxHardness)) return false;
		if (!takeBudget(level)) return false;
		JjkConfig.Destruction cfg = JjkConfig.get().destruction;
		boolean ok;
		if (holder != null || cfg.restoreTerrain) {
			ok = TerrainJournal.get(level).replace(level, pos, Blocks.AIR.defaultBlockState(),
					level.getGameTime() + cfg.restoreDelayTicks, holder);
		} else {
			ok = TerrainJournal.replacePermanent(level, pos, Blocks.AIR.defaultBlockState());
		}
		if (!ok) return false;
		RandomSource rnd = level.getRandom();
		if (cfg.flyingDebris && debrisOrigin != null && rnd.nextFloat() < debrisChance) {
			Vec3 c = Vec3.atCenterOf(pos);
			Vec3 away = c.subtract(debrisOrigin);
			if (away.lengthSqr() < 1.0E-4) away = new Vec3(rnd.nextGaussian(), 1, rnd.nextGaussian());
			Vec3 vel = away.normalize().scale(0.6 + rnd.nextDouble() * 0.9).add(rnd.nextGaussian() * 0.15, 0.35 + rnd.nextDouble() * 0.4, rnd.nextGaussian() * 0.15);
			FlyingDebrisEntity.spawn(level, c, state, vel);
		} else if (rnd.nextInt(4) == 0) {
			level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, state), pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5,
					3, 0.3, 0.3, 0.3, 0.05);
		}
		return true;
	}

	/** Carve a sphere. Returns blocks removed. */
	public static int carveSphere(ServerLevel level, Vec3 center, double radius, @Nullable Entity cause, float maxHardness, float debrisChance,
			@Nullable UUID holder) {
		if (!enabledFor(level, cause)) return 0;
		int r = (int) Math.ceil(radius);
		BlockPos c = BlockPos.containing(center);
		double r2 = radius * radius;
		int n = 0;
		BlockPos.MutableBlockPos m = new BlockPos.MutableBlockPos();
		for (int dy = r; dy >= -r; dy--) {
			for (int dx = -r; dx <= r; dx++) {
				for (int dz = -r; dz <= r; dz++) {
					double d2 = dx * dx + dy * dy + dz * dz;
					if (d2 > r2) continue;
					// ragged edge so craters look natural
					if (d2 > r2 * 0.72 && level.getRandom().nextFloat() < 0.35f) continue;
					m.set(c.getX() + dx, c.getY() + dy, c.getZ() + dz);
					if (destroy(level, m.immutable(), cause, maxHardness, debrisChance, center, holder)) n++;
				}
			}
		}
		return n;
	}

	/** Carve a capsule along a segment (Hollow Purple's path). */
	public static int carveCapsule(ServerLevel level, Vec3 from, Vec3 to, double radius, @Nullable Entity cause, float maxHardness,
			float debrisChance) {
		if (!enabledFor(level, cause)) return 0;
		double len = from.distanceTo(to);
		int steps = Math.max(1, (int) Math.ceil(len / Math.max(0.5, radius * 0.5)));
		int n = 0;
		for (int i = 0; i <= steps; i++) {
			Vec3 p = from.lerp(to, (double) i / steps);
			n += carveSphere(level, p, radius, cause, maxHardness, debrisChance, null);
		}
		return n;
	}

	/**
	 * Cut a thin plane: origin, forward direction (cut travel) and the "edge" direction (blade width).
	 * Used by Dismantle (small) and the World-Cutting Slash (huge).
	 */
	public static int cutPlane(ServerLevel level, Vec3 origin, Vec3 forward, Vec3 edge, double length, double halfWidth, double thickness,
			@Nullable Entity cause, float maxHardness, float debrisChance) {
		if (!enabledFor(level, cause)) return 0;
		Vec3 f = forward.normalize();
		Vec3 e = edge.normalize();
		Vec3 nrm = f.cross(e).normalize();
		int n = 0;
		java.util.HashSet<Long> seen = new java.util.HashSet<>();
		for (double t = 0; t <= length; t += 0.5) {
			for (double w = -halfWidth; w <= halfWidth; w += 0.5) {
				for (double k = -thickness; k <= thickness; k += 0.5) {
					Vec3 p = origin.add(f.scale(t)).add(e.scale(w)).add(nrm.scale(k));
					BlockPos bp = BlockPos.containing(p);
					if (seen.add(bp.asLong()) && destroy(level, bp, cause, maxHardness, debrisChance, origin.add(f.scale(t)), null)) n++;
				}
			}
		}
		return n;
	}
}
