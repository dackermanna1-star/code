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
 * Flat grind rail running along X or Z. Equipment passes through it; riders snap onto its top line to grind.
 */
public class RailBlock extends Block implements SurfaceProvider {
	public static final EnumProperty<Direction.Axis> AXIS = BlockStateProperties.HORIZONTAL_AXIS;
	/** Top of the bar in block units. */
	public static final double TOP = 9.0 / 16.0;
	private static final VoxelShape SHAPE_X = Shapes.or(Block.box(0, 7, 7, 16, 9, 9), Block.box(7, 0, 7, 9, 7, 9));
	private static final VoxelShape SHAPE_Z = Shapes.or(Block.box(7, 7, 0, 9, 9, 16), Block.box(7, 0, 7, 9, 7, 9));

	public RailBlock(Properties properties) {
		super(properties);
		registerDefaultState(stateDefinition.any().setValue(AXIS, Direction.Axis.Z));
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(AXIS);
	}

	@Override
	public BlockState getStateForPlacement(BlockPlaceContext context) {
		return defaultBlockState().setValue(AXIS, context.getHorizontalDirection().getAxis());
	}

	@Override
	protected BlockState rotate(BlockState state, Rotation rotation) {
		if (rotation == Rotation.CLOCKWISE_90 || rotation == Rotation.COUNTERCLOCKWISE_90) {
			return state.setValue(AXIS, state.getValue(AXIS) == Direction.Axis.X ? Direction.Axis.Z : Direction.Axis.X);
		}
		return state;
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return state.getValue(AXIS) == Direction.Axis.X ? SHAPE_X : SHAPE_Z;
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
		double y = pos.getY() + TOP;
		double cx = pos.getX() + 0.5;
		double cz = pos.getZ() + 0.5;
		if (state.getValue(AXIS) == Direction.Axis.X) {
			out.add(new GrindSegment(new Vec3(pos.getX(), y, cz), new Vec3(pos.getX() + 1, y, cz), GrindSegment.Type.RAIL, true));
		} else {
			out.add(new GrindSegment(new Vec3(cx, y, pos.getZ()), new Vec3(cx, y, pos.getZ() + 1), GrindSegment.Type.RAIL, true));
		}
	}
}
