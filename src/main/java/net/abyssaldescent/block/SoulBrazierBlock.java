package net.abyssaldescent.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.pathfinder.PathComputationType;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/** A wrought-iron basin of cold soul fire: bright, harmless, and the main light source of the deep halls. */
public class SoulBrazierBlock extends Block {
	public static final MapCodec<SoulBrazierBlock> CODEC = simpleCodec(SoulBrazierBlock::new);
	private static final VoxelShape SHAPE = Shapes.or(Block.box(5, 0, 5, 11, 2, 11), Block.box(6.5, 2, 6.5, 9.5, 8, 9.5), Block.box(2, 8, 2, 14, 12, 14));

	public SoulBrazierBlock(Properties properties) {
		super(properties);
	}

	@Override
	protected MapCodec<? extends Block> codec() {
		return CODEC;
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return SHAPE;
	}

	@Override
	protected boolean isPathfindable(BlockState state, PathComputationType type) {
		return false;
	}

	@Override
	public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
		double x = pos.getX() + 0.5;
		double y = pos.getY() + 0.8;
		double z = pos.getZ() + 0.5;
		for (int i = 0; i < 2; i++) {
			level.addParticle(ParticleTypes.SOUL_FIRE_FLAME, x + (random.nextDouble() - 0.5) * 0.5, y + random.nextDouble() * 0.3,
				z + (random.nextDouble() - 0.5) * 0.5, 0.0, 0.02 + random.nextDouble() * 0.02, 0.0);
		}
		if (random.nextInt(3) == 0) {
			level.addParticle(ParticleTypes.SMOKE, x, y + 0.6, z, 0.0, 0.04, 0.0);
		}
		if (random.nextInt(24) == 0) {
			level.playLocalSound(x, y, z, SoundEvents.SOUL_ESCAPE.value(), SoundSource.BLOCKS, 0.25F, 0.6F + random.nextFloat() * 0.3F, false);
		}
		if (random.nextInt(10) == 0) {
			level.playLocalSound(x, y, z, SoundEvents.CAMPFIRE_CRACKLE, SoundSource.BLOCKS, 0.4F, 0.7F + random.nextFloat() * 0.3F, false);
		}
	}
}
