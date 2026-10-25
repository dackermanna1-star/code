package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import java.util.IdentityHashMap;
import java.util.Map;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.SimpleWaterloggedBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/** Table that joins with identical neighbours into one long table; legs only appear on outer corners. */
public class TableBlock extends Block implements SimpleWaterloggedBlock {
	public static final MapCodec<TableBlock> CODEC = simpleCodec(TableBlock::new);
	public static final BooleanProperty NORTH = BlockStateProperties.NORTH;
	public static final BooleanProperty EAST = BlockStateProperties.EAST;
	public static final BooleanProperty SOUTH = BlockStateProperties.SOUTH;
	public static final BooleanProperty WEST = BlockStateProperties.WEST;
	public static final BooleanProperty WATERLOGGED = BlockStateProperties.WATERLOGGED;

	private volatile Map<BlockState, VoxelShape> shapes;

	public TableBlock(Properties properties) {
		super(properties);
		this.registerDefaultState(this.stateDefinition.any().setValue(NORTH, false).setValue(EAST, false)
			.setValue(SOUTH, false).setValue(WEST, false).setValue(WATERLOGGED, false));
	}

	@Override
	protected MapCodec<? extends Block> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(NORTH, EAST, SOUTH, WEST, WATERLOGGED);
	}

	public static BooleanProperty property(Direction direction) {
		return switch (direction) {
			case NORTH -> NORTH;
			case EAST -> EAST;
			case SOUTH -> SOUTH;
			default -> WEST;
		};
	}

	@Override
	public BlockState getStateForPlacement(BlockPlaceContext context) {
		BlockState state = this.defaultBlockState()
			.setValue(WATERLOGGED, context.getLevel().getFluidState(context.getClickedPos()).getType() == Fluids.WATER);
		for (Direction d : Direction.Plane.HORIZONTAL) {
			state = state.setValue(property(d), context.getLevel().getBlockState(context.getClickedPos().relative(d)).is(this));
		}
		return state;
	}

	@Override
	protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos,
			Direction direction, BlockPos neighborPos, BlockState neighbor, RandomSource random) {
		if (state.getValue(WATERLOGGED)) {
			ticks.scheduleTick(pos, Fluids.WATER, Fluids.WATER.getTickDelay(level));
		}
		return direction.getAxis().isHorizontal() ? state.setValue(property(direction), neighbor.is(this)) : state;
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		Map<BlockState, VoxelShape> map = shapes;
		if (map == null) {
			synchronized (this) {
				if (shapes == null) {
					Map<BlockState, VoxelShape> built = new IdentityHashMap<>();
					String id = BuiltInRegistries.BLOCK.getKey(this).getPath();
					for (BlockState s : getStateDefinition().getPossibleStates()) {
						VoxelShape shape = FurnitureShapes.get(id, "top", Direction.NORTH);
						if (!s.getValue(NORTH) && !s.getValue(WEST)) shape = Shapes.or(shape, FurnitureShapes.get(id, "leg_nw", Direction.NORTH));
						if (!s.getValue(NORTH) && !s.getValue(EAST)) shape = Shapes.or(shape, FurnitureShapes.get(id, "leg_ne", Direction.NORTH));
						if (!s.getValue(SOUTH) && !s.getValue(WEST)) shape = Shapes.or(shape, FurnitureShapes.get(id, "leg_sw", Direction.NORTH));
						if (!s.getValue(SOUTH) && !s.getValue(EAST)) shape = Shapes.or(shape, FurnitureShapes.get(id, "leg_se", Direction.NORTH));
						built.put(s, shape);
					}
					shapes = built;
				}
				map = shapes;
			}
		}
		return map.get(state);
	}

	@Override
	protected FluidState getFluidState(BlockState state) {
		return state.getValue(WATERLOGGED) ? Fluids.WATER.getSource(false) : super.getFluidState(state);
	}

	@Override
	protected BlockState rotate(BlockState state, Rotation rotation) {
		BlockState out = state;
		for (Direction d : Direction.Plane.HORIZONTAL) {
			out = out.setValue(property(rotation.rotate(d)), state.getValue(property(d)));
		}
		return out;
	}

	@Override
	protected BlockState mirror(BlockState state, Mirror mirror) {
		BlockState out = state;
		for (Direction d : Direction.Plane.HORIZONTAL) {
			out = out.setValue(property(mirror.mirror(d)), state.getValue(property(d)));
		}
		return out;
	}
}
