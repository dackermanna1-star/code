package net.abyssaldescent.block;

import com.mojang.serialization.MapCodec;
import net.abyssaldescent.registry.ModParticles;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

/**
 * The swirling floor of the descent chamber. When every living party member stands on the rift, the run descends (see
 * {@code RunManager}); the block itself only provides the spectacle.
 */
public class DescentRiftBlock extends Block {
	public static final MapCodec<DescentRiftBlock> CODEC = simpleCodec(DescentRiftBlock::new);

	public DescentRiftBlock(Properties properties) {
		super(properties);
	}

	@Override
	protected MapCodec<? extends Block> codec() {
		return CODEC;
	}

	@Override
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		if (random.nextInt(3) == 0) {
			level.addParticle(ModParticles.RIFT_MOTE, pos.getX() + random.nextDouble(), pos.getY() + 1.0, pos.getZ() + random.nextDouble(), 0.0,
				0.04 + random.nextDouble() * 0.05, 0.0);
		}
		if (random.nextInt(8) == 0) {
			level.addParticle(ParticleTypes.REVERSE_PORTAL, pos.getX() + random.nextDouble(), pos.getY() + 1.0, pos.getZ() + random.nextDouble(), 0.0,
				0.05, 0.0);
		}
	}
}
