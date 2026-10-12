package com.extremesports.block;

import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.physics.GrindSegment;
import com.extremesports.physics.SurfaceProvider;
import com.extremesports.sport.SurfaceType;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.level.block.state.properties.StairsShape;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.EntityCollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.jspecify.annotations.Nullable;

/**
 * Ramps, quarter pipes, bowl walls, kickers and dirt lips. The riding surface is an analytic height field that the
 * physics follows exactly; players and mobs collide with a stepped approximation. Neighbouring ramps join into
 * inner/outer corners like stairs, so bowls and pyramids build themselves.
 */
public class RampBlock extends Block implements SurfaceProvider, ParkSurface {
	public static final EnumProperty<Direction> FACING = BlockStateProperties.HORIZONTAL_FACING;
	public static final EnumProperty<StairsShape> SHAPE = BlockStateProperties.STAIRS_SHAPE;
	public static final IntegerProperty PART_2 = IntegerProperty.create("part", 0, 1);
	public static final IntegerProperty PART_4 = IntegerProperty.create("part", 0, 3);

	private final RampProfile profile;
	private final SurfaceType surface;
	private final boolean coping;
	private final Map<BlockState, VoxelShape> shapeCache = new ConcurrentHashMap<>();

	protected RampBlock(RampProfile profile, SurfaceType surface, boolean coping, Properties properties) {
		super(properties);
		this.profile = profile;
		this.surface = surface;
		this.coping = coping;
		BlockState state = stateDefinition.any().setValue(FACING, Direction.NORTH).setValue(SHAPE, StairsShape.STRAIGHT);
		if (partProperty() != null) {
			state = state.setValue(partProperty(), 0);
		}
		registerDefaultState(state);
	}

	public RampProfile profile() {
		return profile;
	}

	public boolean hasCoping() {
		return coping;
	}

	public @Nullable IntegerProperty partProperty() {
		return profileParts() == 2 ? PART_2 : profileParts() == 4 ? PART_4 : null;
	}

	// The profile is not yet assigned while the state definition is built, so read parts from a thread-local.
	private static final ThreadLocal<RampProfile> BUILDING = new ThreadLocal<>();

	public static RampBlock create(RampProfile profile, SurfaceType surface, boolean coping, Properties properties) {
		BUILDING.set(profile);
		try {
			return new RampBlock(profile, surface, coping, properties);
		} finally {
			BUILDING.remove();
		}
	}

	private int profileParts() {
		RampProfile p = profile != null ? profile : BUILDING.get();
		return p == null ? 1 : p.parts;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(FACING, SHAPE);
		int parts = profileParts();
		if (parts == 2) {
			builder.add(PART_2);
		} else if (parts == 4) {
			builder.add(PART_4);
		}
	}

	public int part(BlockState state) {
		IntegerProperty property = partProperty();
		return property == null ? 0 : state.getValue(property);
	}

	// ------------------------------------------------------------------ surface

	/** Distance uphill inside the block for a given uphill direction. */
	public static double uphill(Direction dir, double lx, double lz) {
		return switch (dir) {
			case NORTH -> 1.0 - lz;
			case SOUTH -> lz;
			case EAST -> lx;
			case WEST -> 1.0 - lx;
			default -> 0.0;
		};
	}

	/** Second uphill direction for corner shapes, or null for straight. */
	public static @Nullable Direction cornerDirection(Direction facing, StairsShape shape) {
		return switch (shape) {
			case INNER_LEFT, OUTER_LEFT -> facing.getCounterClockWise();
			case INNER_RIGHT, OUTER_RIGHT -> facing.getClockWise();
			default -> null;
		};
	}

	/** Effective uphill coordinate combining corner directions. */
	public static double effectiveU(Direction facing, StairsShape shape, double lx, double lz) {
		double u = uphill(facing, lx, lz);
		Direction second = cornerDirection(facing, shape);
		if (second == null) {
			return u;
		}
		double u2 = uphill(second, lx, lz);
		boolean inner = shape == StairsShape.INNER_LEFT || shape == StairsShape.INNER_RIGHT;
		return inner ? Math.max(u, u2) : Math.min(u, u2);
	}

	public double height(BlockState state, double lx, double lz) {
		double u = effectiveU(state.getValue(FACING), state.getValue(SHAPE), lx, lz);
		return profile.height(part(state), u);
	}

	@Override
	public double surfaceHeight(BlockState state, double localX, double localZ) {
		return height(state, localX, localZ);
	}

	@Override
	public boolean isRideThrough(BlockState state) {
		return true;
	}

	@Override
	public float lipAngle(BlockState state) {
		return profile.lipAngle();
	}

	@Override
	public SurfaceType surfaceType(BlockState state) {
		return surface;
	}

	@Override
	public void addGrindSegments(BlockGetter level, BlockState state, BlockPos pos, List<GrindSegment> out) {
		if (!coping) {
			return;
		}
		Direction facing = state.getValue(FACING);
		StairsShape shape = state.getValue(SHAPE);
		if (shape == StairsShape.OUTER_LEFT || shape == StairsShape.OUTER_RIGHT) {
			return;
		}
		double top = pos.getY() + profile.height(part(state), 1.0) + 0.05;
		out.add(copingEdge(pos, facing, top));
		Direction second = cornerDirection(facing, shape);
		if (second != null) {
			out.add(copingEdge(pos, second, top));
		}
	}

	private static GrindSegment copingEdge(BlockPos pos, Direction side, double top) {
		double x0 = pos.getX();
		double z0 = pos.getZ();
		return switch (side) {
			case NORTH -> new GrindSegment(new Vec3(x0, top, z0 + 0.04), new Vec3(x0 + 1, top, z0 + 0.04), GrindSegment.Type.COPING, true);
			case SOUTH -> new GrindSegment(new Vec3(x0, top, z0 + 0.96), new Vec3(x0 + 1, top, z0 + 0.96), GrindSegment.Type.COPING, true);
			case WEST -> new GrindSegment(new Vec3(x0 + 0.04, top, z0), new Vec3(x0 + 0.04, top, z0 + 1), GrindSegment.Type.COPING, true);
			default -> new GrindSegment(new Vec3(x0 + 0.96, top, z0), new Vec3(x0 + 0.96, top, z0 + 1), GrindSegment.Type.COPING, true);
		};
	}

	// ------------------------------------------------------------------ shapes

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return shapeCache.computeIfAbsent(state, this::buildShape);
	}

	@Override
	protected VoxelShape getCollisionShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		if (context instanceof EntityCollisionContext entityContext && entityContext.getEntity() instanceof SportEquipmentEntity) {
			return Shapes.empty();
		}
		return getShape(state, level, pos, context);
	}

	@Override
	protected VoxelShape getOcclusionShape(BlockState state) {
		return Shapes.empty();
	}

	@Override
	protected boolean propagatesSkylightDown(BlockState state) {
		return false;
	}

	private VoxelShape buildShape(BlockState state) {
		int cells = 4;
		VoxelShape shape = Shapes.empty();
		for (int i = 0; i < cells; i++) {
			for (int k = 0; k < cells; k++) {
				double x0 = (double) i / cells;
				double z0 = (double) k / cells;
				double x1 = (double) (i + 1) / cells;
				double z1 = (double) (k + 1) / cells;
				double h = 0.0;
				h = Math.max(h, height(state, x0, z0));
				h = Math.max(h, height(state, x1, z0));
				h = Math.max(h, height(state, x0, z1));
				h = Math.max(h, height(state, x1, z1));
				h = Math.max(1.0 / 16.0, Math.ceil(h * 16.0) / 16.0);
				shape = Shapes.or(shape, Shapes.box(x0, 0.0, z0, x1, Math.min(1.0, h), z1));
			}
		}
		return shape.optimize();
	}

	// ------------------------------------------------------------------ placement

	@Override
	public BlockState getStateForPlacement(BlockPlaceContext context) {
		Direction facing = context.getHorizontalDirection();
		BlockPos pos = context.getClickedPos();
		BlockState state = defaultBlockState().setValue(FACING, facing);
		IntegerProperty partProperty = partProperty();
		if (partProperty != null) {
			BlockState behind = context.getLevel().getBlockState(pos.relative(facing.getOpposite()));
			int part = 0;
			if (behind.is(this) && behind.getValue(FACING) == facing && behind.getValue(partProperty) < profileParts() - 1) {
				part = behind.getValue(partProperty) + 1;
			}
			state = state.setValue(partProperty, part);
		}
		return state.setValue(SHAPE, computeShape(state, context.getLevel(), pos));
	}

	@Override
	protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos, Direction direction,
									 BlockPos neighborPos, BlockState neighborState, RandomSource random) {
		if (direction.getAxis().isHorizontal()) {
			return state.setValue(SHAPE, computeShape(state, level, pos));
		}
		return state;
	}

	private boolean sameRamp(BlockState state, BlockState other) {
		return other.is(this) && part(other) == part(state);
	}

	/** Mirrors vanilla stair corner logic. */
	private StairsShape computeShape(BlockState state, BlockGetter level, BlockPos pos) {
		Direction facing = state.getValue(FACING);
		BlockState front = level.getBlockState(pos.relative(facing));
		if (sameRamp(state, front)) {
			Direction frontFacing = front.getValue(FACING);
			if (frontFacing.getAxis() != facing.getAxis() && canTakeShape(state, level, pos, frontFacing.getOpposite())) {
				return frontFacing == facing.getCounterClockWise() ? StairsShape.OUTER_LEFT : StairsShape.OUTER_RIGHT;
			}
		}
		BlockState back = level.getBlockState(pos.relative(facing.getOpposite()));
		if (sameRamp(state, back)) {
			Direction backFacing = back.getValue(FACING);
			if (backFacing.getAxis() != facing.getAxis() && canTakeShape(state, level, pos, backFacing)) {
				return backFacing == facing.getCounterClockWise() ? StairsShape.INNER_LEFT : StairsShape.INNER_RIGHT;
			}
		}
		return StairsShape.STRAIGHT;
	}

	private boolean canTakeShape(BlockState state, BlockGetter level, BlockPos pos, Direction direction) {
		BlockState other = level.getBlockState(pos.relative(direction));
		return !sameRamp(state, other) || other.getValue(FACING) != state.getValue(FACING);
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		IntegerProperty partProperty = partProperty();
		if (partProperty == null || !player.mayBuild()) {
			return InteractionResult.PASS;
		}
		if (!level.isClientSide()) {
			int next = (state.getValue(partProperty) + 1) % profileParts();
			level.setBlock(pos, state.setValue(partProperty, next), Block.UPDATE_ALL);
			player.displayClientMessage(Component.translatable("message.extremesports.ramp_part", next + 1, profileParts()), true);
		}
		return InteractionResult.SUCCESS;
	}

	@Override
	protected BlockState rotate(BlockState state, Rotation rotation) {
		return state.setValue(FACING, rotation.rotate(state.getValue(FACING)));
	}

	@Override
	protected BlockState mirror(BlockState state, Mirror mirror) {
		Direction facing = state.getValue(FACING);
		StairsShape shape = state.getValue(SHAPE);
		if (mirror == Mirror.NONE) {
			return state;
		}
		StairsShape mirrored = switch (shape) {
			case INNER_LEFT -> StairsShape.INNER_RIGHT;
			case INNER_RIGHT -> StairsShape.INNER_LEFT;
			case OUTER_LEFT -> StairsShape.OUTER_RIGHT;
			case OUTER_RIGHT -> StairsShape.OUTER_LEFT;
			default -> StairsShape.STRAIGHT;
		};
		return state.setValue(FACING, mirror.mirror(facing)).setValue(SHAPE, mirrored);
	}
}
