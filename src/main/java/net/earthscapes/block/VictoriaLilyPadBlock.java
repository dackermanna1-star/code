package net.earthscapes.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.vehicle.boat.AbstractBoat;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.VegetationBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * One ninth of a giant Amazon water lily (Victoria amazonica) pad. Nine parts form a 3x3 pad with
 * an upturned rim; breaking any part collapses the whole pad. Like lily pads, they can be walked on.
 */
public class VictoriaLilyPadBlock extends VegetationBlock {
	public static final MapCodec<VictoriaLilyPadBlock> CODEC = simpleCodec(VictoriaLilyPadBlock::new);
	/** Part index {@code (dz + 1) * 3 + (dx + 1)} relative to the pad centre (part 4). */
	public static final IntegerProperty PART = IntegerProperty.create("part", 0, 8);
	public static final int CENTRE = 4;
	private static final VoxelShape SHAPE = Block.column(16.0, 0.0, 1.5);

	public VictoriaLilyPadBlock(Properties properties) {
		super(properties);
		this.registerDefaultState(this.stateDefinition.any().setValue(PART, CENTRE));
	}

	@Override
	protected MapCodec<? extends VegetationBlock> codec() {
		return CODEC;
	}

	public static int dx(int part) {
		return part % 3 - 1;
	}

	public static int dz(int part) {
		return part / 3 - 1;
	}

	public static int part(int dx, int dz) {
		return (dz + 1) * 3 + (dx + 1);
	}

	@Override
	protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
		return SHAPE;
	}

	@Override
	protected boolean mayPlaceOn(BlockState state, BlockGetter level, BlockPos pos) {
		FluidState fluid = level.getFluidState(pos);
		FluidState above = level.getFluidState(pos.above());
		return fluid.getType() == Fluids.WATER && above.getType() == Fluids.EMPTY;
	}

	@Override
	protected BlockState updateShape(
		BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos, Direction direction, BlockPos neighborPos, BlockState neighbor, RandomSource random
	) {
		if (direction.getAxis().isHorizontal()) {
			int part = state.getValue(PART);
			int nx = dx(part) + direction.getStepX();
			int nz = dz(part) + direction.getStepZ();
			if (nx >= -1 && nx <= 1 && nz >= -1 && nz <= 1) {
				if (!neighbor.is(this) || neighbor.getValue(PART) != part(nx, nz)) {
					return Blocks.AIR.defaultBlockState();
				}
			}
		}
		return super.updateShape(state, level, ticks, pos, direction, neighborPos, neighbor, random);
	}

	@Override
	protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects, boolean intersects) {
		super.entityInside(state, level, pos, entity, effects, intersects);
		if (level instanceof ServerLevel && entity instanceof AbstractBoat) {
			level.destroyBlock(new BlockPos(pos), true, entity);
		}
	}

	/** Whether a full 3x3 pad centred on {@code centre} fits on open water. */
	public boolean canPlacePad(LevelReader level, BlockPos centre) {
		for (int dz = -1; dz <= 1; dz++) {
			for (int dx = -1; dx <= 1; dx++) {
				BlockPos p = centre.offset(dx, 0, dz);
				if (!level.getBlockState(p).isAir() || !this.mayPlaceOn(level.getBlockState(p.below()), level, p.below())) {
					return false;
				}
			}
		}
		return true;
	}

	public void placePad(LevelAccessor level, BlockPos centre, int flags) {
		for (int dz = -1; dz <= 1; dz++) {
			for (int dx = -1; dx <= 1; dx++) {
				level.setBlock(centre.offset(dx, 0, dz), this.defaultBlockState().setValue(PART, part(dx, dz)), flags);
			}
		}
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(PART);
	}
}
