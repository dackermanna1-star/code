package com.ordnance.explosion;

import com.ordnance.config.ConfigManager;
import com.ordnance.entity.DebrisEntity;
import it.unimi.dsi.fastutil.longs.LongOpenHashSet;
import it.unimi.dsi.fastutil.longs.LongSet;
import java.util.List;
import net.minecraft.entity.Entity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.explosion.Explosion;
import net.minecraft.world.explosion.ExplosionImpl;
import org.jspecify.annotations.Nullable;

/** Server-side upgrades for vanilla explosions (TNT, creepers, beds, end crystals...): debris and scorch marks. */
public final class VanillaExplosions {
	private VanillaExplosions() {
	}

	public static boolean enabled(ExplosionImpl explosion) {
		return ConfigManager.get().general.enhanceVanillaExplosions
			&& explosion.getDestructionType().destroysBlocks()
			&& explosion.getPower() >= 1.5F;
	}

	/** Called before vanilla destroys the blocks, while their states are still readable. */
	public static List<DebrisEntity.Seed> sampleDebris(ExplosionImpl explosion, ServerWorld world, List<BlockPos> positions) {
		if (!enabled(explosion) || !ConfigManager.get().explosions.flyingDebris || positions.isEmpty()) {
			return List.of();
		}

		LongSet set = new LongOpenHashSet(positions.size());
		for (BlockPos pos : positions) {
			set.add(pos.asLong());
		}

		int count = Math.min(ConfigManager.get().explosions.maxDebrisPerExplosion, MathHelper.ceil(explosion.getPower() * 4.0F * ConfigManager.get().explosions.debrisMultiplier));
		return DebrisEntity.sample(world, set, count, world.getRandom());
	}

	public static void afterExplosion(ExplosionImpl explosion, ServerWorld world, List<DebrisEntity.Seed> debris) {
		if (!enabled(explosion)) {
			return;
		}

		Vec3d pos = explosion.getPosition();
		float power = explosion.getPower();
		@Nullable Entity owner = explosion.getCausingEntity();
		DebrisEntity.launch(world, debris, pos, power * 1.6F, power / 2.4F, 0.0F, owner);
		boolean underwater = !world.getFluidState(BlockPos.ofFloored(pos)).isEmpty();
		if (!underwater && ConfigManager.get().explosions.scorchMarks) {
			TerrainEffects.scorch(world, pos, power * 0.75F, world.getRandom(), owner, 0.8F);
		}
	}

	public static boolean isVanilla(Explosion explosion) {
		return explosion instanceof ExplosionImpl;
	}
}
