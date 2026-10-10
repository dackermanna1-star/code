package net.earthscapes.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.VegetationBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * A plant that perches on branches, logs, leaves and rock as well as soil (bromeliads,
 * orchids), which lets world generation drape the rainforest canopy with epiphytes.
 */
public class EpiphyteBlock extends VegetationBlock {
	public static final MapCodec<EpiphyteBlock> CODEC = simpleCodec(EpiphyteBlock::new);
	private static final VoxelShape SHAPE = Block.column(12.0, 0.0, 10.0);

	public EpiphyteBlock(Properties properties) {
		super(properties);
	}

	@Override
	protected MapCodec<? extends VegetationBlock> codec() {
		return CODEC;
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return SHAPE;
	}

	@Override
	protected boolean mayPlaceOn(BlockState state, BlockGetter level, BlockPos pos) {
		return state.is(EsTags.EPIPHYTE_SUPPORT) || state.isFaceSturdy(level, pos, Direction.UP);
	}
}
