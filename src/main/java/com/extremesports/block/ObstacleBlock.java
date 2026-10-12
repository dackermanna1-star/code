package com.extremesports.block;

import com.extremesports.physics.GrindFinder;
import com.extremesports.physics.GrindSegment;
import com.extremesports.physics.SurfaceProvider;
import com.extremesports.sport.SurfaceType;
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
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Solid obstacles you ride on top of and grind along: grind boxes, ledges and manual pads.
 * Adjacent pieces of the same obstacle merge into one long grind edge.
 */
public class ObstacleBlock extends Block implements SurfaceProvider, ParkSurface {
	public static final EnumProperty<Direction.Axis> AXIS = BlockStateProperties.HORIZONTAL_AXIS;

	private final double height;
	private final boolean metalEdges;
	private final boolean allSides;
	private final SurfaceType surface;
	private final VoxelShape shape;

	public ObstacleBlock(double height, boolean metalEdges, boolean allSides, SurfaceType surface, Properties properties) {
		super(properties);
		this.height = height;
		this.metalEdges = metalEdges;
		this.allSides = allSides;
		this.surface = surface;
		this.shape = Block.box(0, 0, 0, 16, height * 16.0, 16);
		registerDefaultState(stateDefinition.any().setValue(AXIS, Direction.Axis.Z));
	}

	public double height() {
		return height;
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
		return shape;
	}

	@Override
	protected boolean useShapeForLightOcclusion(BlockState state) {
		return true;
	}

	@Override
	public SurfaceType surfaceType(BlockState state) {
		return surface;
	}

	@Override
	public void addGrindSegments(BlockGetter level, BlockState state, BlockPos pos, List<GrindSegment> out) {
		Direction.Axis axis = state.getValue(AXIS);
		double top = pos.getY() + height;
		for (Direction side : Direction.Plane.HORIZONTAL) {
			if (!allSides && side.getAxis() == axis) {
				continue;
			}
			// Edges shared with a neighbouring piece of the same obstacle are interior, not grindable
			if (level.getBlockState(pos.relative(side)).is(this)) {
				continue;
			}
			out.add(GrindFinder.edgeSegment(pos, side, top, metalEdges));
		}
	}
}
