package com.ordnance.fire;

import com.mojang.serialization.MapCodec;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;

/** Blackened soil around blasts and fires. Smoulders briefly and slowly recovers to coarse dirt. */
public class ScorchedEarthBlock extends Block {
	public static final MapCodec<ScorchedEarthBlock> CODEC = createCodec(ScorchedEarthBlock::new);

	public ScorchedEarthBlock(Settings settings) {
		super(settings);
	}

	@Override
	protected MapCodec<? extends Block> getCodec() {
		return CODEC;
	}

	@Override
	protected void randomTick(BlockState state, ServerWorld world, BlockPos pos, Random random) {
		if (random.nextInt(48) == 0 && world.isAir(pos.up())) {
			world.setBlockState(pos, Blocks.COARSE_DIRT.getDefaultState(), Block.NOTIFY_ALL);
		}
	}

	@Override
	public void randomDisplayTick(BlockState state, World world, BlockPos pos, Random random) {
		if (random.nextInt(40) == 0 && world.isAir(pos.up())) {
			world.addParticleClient(
				ParticleTypes.SMOKE, pos.getX() + random.nextDouble(), pos.getY() + 1.02, pos.getZ() + random.nextDouble(), 0.0, 0.015, 0.0
			);
		}
	}
}
