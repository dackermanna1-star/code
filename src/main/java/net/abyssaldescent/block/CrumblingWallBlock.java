package net.abyssaldescent.block;

import com.mojang.serialization.MapCodec;
import net.abyssaldescent.registry.ModSounds;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Looks like the surrounding masonry, but dust trickles from its seams. Breaking one block brings the whole false wall
 * down in a short cascade, revealing what lies behind.
 */
public class CrumblingWallBlock extends Block {
	public static final MapCodec<CrumblingWallBlock> CODEC = simpleCodec(CrumblingWallBlock::new);

	public CrumblingWallBlock(Properties properties) {
		super(properties);
	}

	@Override
	protected MapCodec<? extends Block> codec() {
		return CODEC;
	}

	@Override
	protected void affectNeighborsAfterRemoval(BlockState state, ServerLevel level, BlockPos pos, boolean movedByPiston) {
		for (Direction direction : Direction.values()) {
			BlockPos neighbour = pos.relative(direction);
			if (level.getBlockState(neighbour).is(this) && !level.getBlockTicks().hasScheduledTick(neighbour, this)) {
				level.scheduleTick(neighbour, this, 2 + level.random.nextInt(4));
			}
		}
		level.sendParticles(new BlockParticleOption(ParticleTypes.BLOCK, Blocks.CRACKED_STONE_BRICKS.defaultBlockState()), pos.getX() + 0.5,
			pos.getY() + 0.5, pos.getZ() + 0.5, 18, 0.35, 0.35, 0.35, 0.05);
	}

	@Override
	protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		level.destroyBlock(pos, false);
		if (random.nextInt(3) == 0) {
			level.playSound(null, pos, ModSounds.WALL_CRUMBLE, SoundSource.BLOCKS, 0.8F, 0.8F + random.nextFloat() * 0.3F);
		}
	}

	@Override
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		if (random.nextInt(14) != 0) {
			return;
		}
		// Dust sifts out of the seams on whichever face is exposed: the tell for observant delvers.
		Direction side = Direction.Plane.HORIZONTAL.getRandomDirection(random);
		if (level.getBlockState(pos.relative(side)).isAir()) {
			double x = pos.getX() + 0.5 + side.getStepX() * 0.52 + (side.getStepX() == 0 ? random.nextDouble() - 0.5 : 0);
			double z = pos.getZ() + 0.5 + side.getStepZ() * 0.52 + (side.getStepZ() == 0 ? random.nextDouble() - 0.5 : 0);
			level.addParticle(new BlockParticleOption(ParticleTypes.FALLING_DUST, Blocks.GRAVEL.defaultBlockState()), x, pos.getY() + random.nextDouble(), z,
				0.0, 0.0, 0.0);
		}
	}
}
