package com.godforge.block;

import com.godforge.registry.FxParticleOptions;
import com.godforge.registry.ModParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Glowing fissure left behind by Godfist impacts. Normally the destruction engine restores the
 * original block after a few seconds; if that bookkeeping was lost (e.g. a crash) the fissure
 * slowly cools into cobbled deepslate on random ticks.
 */
public class KineticFractureBlock extends Block {
	public KineticFractureBlock(Properties properties) {
		super(properties);
	}

	@Override
	protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		if (random.nextInt(3) == 0) {
			level.setBlock(pos, Blocks.COBBLED_DEEPSLATE.defaultBlockState(), Block.UPDATE_ALL);
		}
	}

	@Override
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		if (random.nextInt(3) != 0) {
			return;
		}
		double x = pos.getX() + random.nextDouble();
		double z = pos.getZ() + random.nextDouble();
		level.addParticle(
			FxParticleOptions.of(ModParticles.SPARK, 0x7FF6FF, 0x2A6BFF, 0.08F, 14 + random.nextInt(10), -0.2F, FxParticleOptions.F_ADDITIVE | FxParticleOptions.F_SHRINK),
			x, pos.getY() + 1.02, z, 0.0, 0.04 + random.nextDouble() * 0.05, 0.0
		);
	}
}
