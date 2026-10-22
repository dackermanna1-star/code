package com.ordnance.fire;

import com.mojang.serialization.MapCodec;
import com.ordnance.registry.ModBlocks;
import net.minecraft.block.BlockState;
import net.minecraft.block.PillarBlock;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.random.Random;
import net.minecraft.world.World;

/** What is left of a log after a fire: brittle, drops charcoal, smoulders for a while. */
public class CharredLogBlock extends PillarBlock {
	public static final MapCodec<CharredLogBlock> CODEC = createCodec(CharredLogBlock::new);

	public CharredLogBlock(Settings settings) {
		super(settings);
	}

	@Override
	public MapCodec<? extends PillarBlock> getCodec() {
		return CODEC;
	}

	/** Charred log with the same orientation as the given log. */
	public static BlockState charredFrom(BlockState log) {
		BlockState charred = ModBlocks.CHARRED_LOG.getDefaultState();
		return log.contains(AXIS) ? charred.with(AXIS, log.get(AXIS)) : charred;
	}

	@Override
	public void randomDisplayTick(BlockState state, World world, BlockPos pos, Random random) {
		if (random.nextInt(14) == 0 && world.isAir(pos.up())) {
			world.addParticleClient(
				ParticleTypes.SMOKE, pos.getX() + random.nextDouble(), pos.getY() + 1.02, pos.getZ() + random.nextDouble(), 0.0, 0.02, 0.0
			);
		}
	}
}
