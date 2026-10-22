package com.ordnance.fire;

import com.mojang.serialization.MapCodec;
import net.minecraft.block.Block;
import net.minecraft.block.BlockState;
import net.minecraft.block.Blocks;
import net.minecraft.block.ShapeContext;
import net.minecraft.particle.ParticleTypes;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Direction;
import net.minecraft.util.math.random.Random;
import net.minecraft.util.shape.VoxelShape;
import net.minecraft.util.shape.VoxelShapes;
import net.minecraft.world.BlockView;
import net.minecraft.world.World;
import net.minecraft.world.WorldView;
import net.minecraft.world.tick.ScheduledTickView;

/** A thin, non-solid film of ash left behind by fires; blown away by anything that replaces it. */
public class AshLayerBlock extends Block {
	public static final MapCodec<AshLayerBlock> CODEC = createCodec(AshLayerBlock::new);
	private static final VoxelShape SHAPE = Block.createColumnShape(16.0, 0.0, 1.0);

	public AshLayerBlock(Settings settings) {
		super(settings);
	}

	@Override
	protected MapCodec<? extends Block> getCodec() {
		return CODEC;
	}

	@Override
	protected VoxelShape getOutlineShape(BlockState state, BlockView world, BlockPos pos, ShapeContext context) {
		return SHAPE;
	}

	@Override
	protected VoxelShape getCollisionShape(BlockState state, BlockView world, BlockPos pos, ShapeContext context) {
		return VoxelShapes.empty();
	}

	@Override
	protected boolean canPlaceAt(BlockState state, WorldView world, BlockPos pos) {
		BlockPos below = pos.down();
		return world.getBlockState(below).isSideSolidFullSquare(world, below, Direction.UP);
	}

	@Override
	protected BlockState getStateForNeighborUpdate(
		BlockState state,
		WorldView world,
		ScheduledTickView tickView,
		BlockPos pos,
		Direction direction,
		BlockPos neighborPos,
		BlockState neighborState,
		Random random
	) {
		return direction == Direction.DOWN && !this.canPlaceAt(state, world, pos) ? Blocks.AIR.getDefaultState() : state;
	}

	@Override
	public void randomDisplayTick(BlockState state, World world, BlockPos pos, Random random) {
		if (random.nextInt(10) == 0) {
			world.addParticleClient(ParticleTypes.WHITE_ASH, pos.getX() + random.nextDouble(), pos.getY() + 0.1, pos.getZ() + random.nextDouble(), 0.0, 0.0, 0.0);
		}
	}
}
