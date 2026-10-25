package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;

/** Wall jet for hot tubs: bubbles rise from it while it is underwater. */
public class HotTubJetBlock extends FurnitureBlock {
	public static final MapCodec<HotTubJetBlock> CODEC = simpleCodec(HotTubJetBlock::new);

	public HotTubJetBlock(Properties properties) {
		super(properties, true);
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		if (!state.getValue(WATERLOGGED)) {
			return;
		}
		for (int i = 0; i < 6; i++) {
			level.addParticle(ParticleTypes.BUBBLE_COLUMN_UP, pos.getX() + random.nextDouble(), pos.getY() + random.nextDouble() * 0.5,
				pos.getZ() + random.nextDouble(), 0, 0.04, 0);
		}
	}
}
