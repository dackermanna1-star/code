package com.extremesports.block;

import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.physics.GrindSegment;
import com.extremesports.physics.SurfaceProvider;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.EntityCollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Handrail rising one block over one block toward FACING; pairs with flat rails at both ends and runs down stair sets.
 */
public class InclinedRailBlock extends Block implements SurfaceProvider {
	public static final EnumProperty<Direction> FACING = BlockStateProperties.HORIZONTAL_FACING;

	public InclinedRailBlock(Properties properties) {
		super(properties);
		registerDefaultState(stateDefinition.any().setValue(FACING, Direction.NORTH));
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(FACING);
	}

	@Override
	public BlockState getStateForPlacement(BlockPlaceContext context) {
		return defaultBlockState().setValue(FACING, context.getHorizontalDirection());
	}

	@Override
	protected BlockState rotate(BlockState state, Rotation rotation) {
		return state.setValue(FACING, rotation.rotate(state.getValue(FACING)));
	}

	@Override
	protected BlockState mirror(BlockState state, Mirror mirror) {
		return state.setValue(FACING, mirror.mirror(state.getValue(FACING)));
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		Direction facing = state.getValue(FACING);
		VoxelShape shape = Shapes.empty();
		for (int i = 0; i < 4; i++) {
			double u0 = i / 4.0;
			double u1 = (i + 1) / 4.0;
			double top = Math.min(1.0, RailBlock.TOP + u1);
			double bottom = Math.max(0.0, RailBlock.TOP - 2.0 / 16.0 + u0);
			if (bottom >= 1.0) {
				continue;
			}
			shape = Shapes.or(shape, box(facing, u0, u1, bottom, top));
		}
		return shape.optimize();
	}

	private static VoxelShape box(Direction facing, double u0, double u1, double y0, double y1) {
		double w0 = 7.0 / 16.0;
		double w1 = 9.0 / 16.0;
		return switch (facing) {
			case NORTH -> Shapes.box(w0, y0, 1.0 - u1, w1, y1, 1.0 - u0);
			case SOUTH -> Shapes.box(w0, y0, u0, w1, y1, u1);
			case EAST -> Shapes.box(u0, y0, w0, u1, y1, w1);
			default -> Shapes.box(1.0 - u1, y0, w0, 1.0 - u0, y1, w1);
		};
	}

	@Override
	protected VoxelShape getCollisionShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		if (context instanceof EntityCollisionContext entityContext && entityContext.getEntity() instanceof SportEquipmentEntity) {
			return Shapes.empty();
		}
		return getShape(state, level, pos, context);
	}

	@Override
	public boolean isRideThrough(BlockState state) {
		return true;
	}

	@Override
	public void addGrindSegments(BlockGetter level, BlockState state, BlockPos pos, List<GrindSegment> out) {
		Direction facing = state.getValue(FACING);
		Vec3 center = Vec3.atBottomCenterOf(pos);
		Vec3 half = new Vec3(facing.getStepX() * 0.5, 0.0, facing.getStepZ() * 0.5);
		Vec3 low = center.subtract(half).add(0.0, RailBlock.TOP, 0.0);
		Vec3 high = center.add(half).add(0.0, RailBlock.TOP + 1.0, 0.0);
		out.add(new GrindSegment(low, high, GrindSegment.Type.RAIL, true));
	}
}
