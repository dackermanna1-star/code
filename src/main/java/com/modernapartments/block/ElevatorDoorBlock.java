package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.block.state.properties.DoorHingeSide;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.phys.BlockHitResult;
import org.jspecify.annotations.Nullable;

/**
 * Sliding stainless elevator door panel (two blocks tall). A pair of panels (hinge left + right)
 * forms one opening; they slide apart together and close automatically after a few seconds.
 * {@code hinge = left} slides towards {@code facing.getCounterClockWise()}.
 */
public class ElevatorDoorBlock extends HorizontalDirectionalBlock {
	public static final MapCodec<ElevatorDoorBlock> CODEC = simpleCodec(ElevatorDoorBlock::new);
	public static final EnumProperty<DoubleBlockHalf> HALF = BlockStateProperties.DOUBLE_BLOCK_HALF;
	public static final EnumProperty<DoorHingeSide> HINGE = BlockStateProperties.DOOR_HINGE;
	public static final BooleanProperty OPEN = BlockStateProperties.OPEN;
	private static final int OPEN_TICKS = 80;

	private final ShapeProvider shapes;

	public ElevatorDoorBlock(Properties properties) {
		super(properties);
		this.registerDefaultState(this.stateDefinition.any().setValue(FACING, Direction.NORTH)
			.setValue(HALF, DoubleBlockHalf.LOWER).setValue(HINGE, DoorHingeSide.LEFT).setValue(OPEN, false));
		this.shapes = new ShapeProvider(this, s -> !s.getValue(OPEN) ? "closed"
			: s.getValue(HINGE) == DoorHingeSide.LEFT ? "open_left" : "open_right", s -> s.getValue(FACING));
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		builder.add(FACING, HALF, HINGE, OPEN);
	}

	@Override
	protected net.minecraft.world.phys.shapes.VoxelShape getShape(BlockState state, net.minecraft.world.level.BlockGetter level,
			BlockPos pos, net.minecraft.world.phys.shapes.CollisionContext context) {
		return shapes.get(state);
	}

	@Override
	public @Nullable BlockState getStateForPlacement(BlockPlaceContext context) {
		BlockPos pos = context.getClickedPos();
		Level level = context.getLevel();
		if (pos.getY() >= level.getMaxY() || !level.getBlockState(pos.above()).canBeReplaced(context)) {
			return null;
		}
		Direction facing = context.getHorizontalDirection().getOpposite();
		BlockState left = level.getBlockState(pos.relative(facing.getCounterClockWise()));
		DoorHingeSide hinge = left.is(this) && left.getValue(HINGE) == DoorHingeSide.LEFT ? DoorHingeSide.RIGHT : DoorHingeSide.LEFT;
		return this.defaultBlockState().setValue(FACING, facing).setValue(HINGE, hinge);
	}

	@Override
	public void setPlacedBy(Level level, BlockPos pos, BlockState state, @Nullable LivingEntity placer, ItemStack stack) {
		level.setBlock(pos.above(), state.setValue(HALF, DoubleBlockHalf.UPPER), Block.UPDATE_ALL);
	}

	@Override
	protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos,
			Direction direction, BlockPos neighborPos, BlockState neighbor, RandomSource random) {
		DoubleBlockHalf half = state.getValue(HALF);
		if (direction.getAxis() == Direction.Axis.Y && (half == DoubleBlockHalf.LOWER) == (direction == Direction.UP)) {
			return neighbor.is(this) && neighbor.getValue(HALF) != half
				? state.setValue(OPEN, neighbor.getValue(OPEN))
				: Blocks.AIR.defaultBlockState();
		}
		return state;
	}

	@Override
	public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
		if (!level.isClientSide() && player.preventsBlockDrops() && state.getValue(HALF) == DoubleBlockHalf.UPPER) {
			BlockPos below = pos.below();
			BlockState lower = level.getBlockState(below);
			if (lower.is(this)) {
				level.setBlock(below, Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL | Block.UPDATE_SUPPRESS_DROPS);
			}
		}
		return super.playerWillDestroy(level, pos, state, player);
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (!level.isClientSide()) {
			setOpen(level, pos, state, !state.getValue(OPEN));
		}
		return InteractionResult.SUCCESS;
	}

	/** Opens or closes this panel and its partner (both halves each). */
	public void setOpen(Level level, BlockPos pos, BlockState state, boolean open) {
		BlockPos lower = state.getValue(HALF) == DoubleBlockHalf.UPPER ? pos.below() : pos;
		Direction facing = state.getValue(FACING);
		Direction towardsPartner = state.getValue(HINGE) == DoorHingeSide.LEFT ? facing.getClockWise() : facing.getCounterClockWise();
		boolean changed = setPanel(level, lower, open);
		BlockPos partner = lower.relative(towardsPartner);
		BlockState ps = level.getBlockState(partner);
		if (ps.is(this) && ps.getValue(FACING) == facing && ps.getValue(HINGE) != state.getValue(HINGE)) {
			changed |= setPanel(level, partner, open);
		}
		if (changed) {
			level.playSound(null, pos, open ? SoundEvents.PISTON_EXTEND : SoundEvents.PISTON_CONTRACT, SoundSource.BLOCKS, 0.25F, 1.8F);
		}
		if (open) {
			level.scheduleTick(lower, this, OPEN_TICKS);
		}
	}

	private boolean setPanel(Level level, BlockPos lower, boolean open) {
		BlockState s = level.getBlockState(lower);
		if (!s.is(this) || s.getValue(OPEN) == open) {
			return false;
		}
		level.setBlock(lower, s.setValue(OPEN, open), Block.UPDATE_CLIENTS);
		BlockState up = level.getBlockState(lower.above());
		if (up.is(this)) {
			level.setBlock(lower.above(), up.setValue(OPEN, open), Block.UPDATE_CLIENTS);
		}
		return true;
	}

	@Override
	protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
		if (state.getValue(OPEN)) {
			setOpen(level, pos, state, false);
		}
	}
}
