package com.modernapartments.block;

import com.modernapartments.block.ModProperties.SofaShape;
import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;

/**
 * Modular sectional sofa. Pieces facing the same way join into a row (arms only on the ends) and a
 * piece whose front neighbour faces sideways becomes an L-shaped corner, like stairs.
 */
public class SofaBlock extends SeatBlock {
	public static final MapCodec<SofaBlock> CODEC = simpleCodec(SofaBlock::new);

	public SofaBlock(Properties properties) {
		super(properties, 0.5F);
		this.registerDefaultState(this.defaultBlockState().setValue(ModProperties.SOFA_SHAPE, SofaShape.SINGLE));
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		super.createBlockStateDefinition(builder);
		builder.add(ModProperties.SOFA_SHAPE);
	}

	@Override
	protected String shapeKey(BlockState state) {
		return state.getValue(ModProperties.SOFA_SHAPE).getSerializedName();
	}

	@Override
	public BlockState getStateForPlacement(BlockPlaceContext context) {
		BlockState state = super.getStateForPlacement(context);
		return state == null ? null : withShape(state, context.getLevel(), context.getClickedPos());
	}

	@Override
	protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos,
			Direction direction, BlockPos neighborPos, BlockState neighbor, RandomSource random) {
		BlockState updated = super.updateShape(state, level, ticks, pos, direction, neighborPos, neighbor, random);
		return direction.getAxis().isHorizontal() ? withShape(updated, level, pos) : updated;
	}

	@Override
	protected BlockState mirror(BlockState state, Mirror mirror) {
		BlockState rotated = super.mirror(state, mirror);
		return mirror == Mirror.NONE ? rotated
			: rotated.setValue(ModProperties.SOFA_SHAPE, rotated.getValue(ModProperties.SOFA_SHAPE).mirrored());
	}

	/** Computes the connected shape for a sofa at {@code pos} (also used by the structure builder). */
	public static BlockState withShape(BlockState state, BlockGetter level, BlockPos pos) {
		return state.setValue(ModProperties.SOFA_SHAPE, computeShape(state.getValue(FACING), pos, level::getBlockState));
	}

	public static SofaShape computeShape(Direction facing, BlockPos pos, java.util.function.Function<BlockPos, BlockState> lookup) {
		BlockState front = lookup.apply(pos.relative(facing));
		if (front.getBlock() instanceof SofaBlock) {
			Direction frontFacing = front.getValue(FACING);
			if (frontFacing == facing.getClockWise()) {
				return SofaShape.CORNER_LEFT;
			}
			if (frontFacing == facing.getCounterClockWise()) {
				return SofaShape.CORNER_RIGHT;
			}
		}
		boolean left = connects(lookup, pos, facing.getCounterClockWise(), facing);
		boolean right = connects(lookup, pos, facing.getClockWise(), facing);
		if (left && right) {
			return SofaShape.MIDDLE;
		}
		if (left) {
			return SofaShape.RIGHT;
		}
		return right ? SofaShape.LEFT : SofaShape.SINGLE;
	}

	private static boolean connects(java.util.function.Function<BlockPos, BlockState> lookup, BlockPos pos, Direction side, Direction facing) {
		BlockPos neighborPos = pos.relative(side);
		BlockState neighbor = lookup.apply(neighborPos);
		if (!(neighbor.getBlock() instanceof SofaBlock)) {
			return false;
		}
		Direction neighborFacing = neighbor.getValue(FACING);
		if (neighborFacing == facing) {
			return true;
		}
		// the neighbour is the corner piece of an L whose second leg starts with this sofa
		return neighborPos.relative(neighborFacing).equals(pos)
			&& (neighborFacing.getClockWise() == facing || neighborFacing.getCounterClockWise() == facing);
	}
}
