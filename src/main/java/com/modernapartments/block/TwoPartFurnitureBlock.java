package com.modernapartments.block;

import com.modernapartments.entity.SeatEntity;
import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
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
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.phys.BlockHitResult;
import org.jspecify.annotations.Nullable;

/**
 * Two-block-long furniture (bathtub, pool table, lounger, treadmill...). Like a bed, {@code facing}
 * points from the foot to the head and the head is placed in the direction the player looks.
 */
public class TwoPartFurnitureBlock extends FurnitureBlock {
	public static final MapCodec<TwoPartFurnitureBlock> CODEC = simpleCodec(p -> new TwoPartFurnitureBlock(p, -1));
	public static final EnumProperty<BedPart> PART = BlockStateProperties.BED_PART;

	private final float seatHeight;

	/** @param seatHeight sitting height, or a negative value if the piece cannot be sat on */
	public TwoPartFurnitureBlock(Properties properties, float seatHeight) {
		super(properties);
		this.seatHeight = seatHeight;
		this.registerDefaultState(this.defaultBlockState().setValue(PART, BedPart.FOOT));
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
		super.createBlockStateDefinition(builder);
		builder.add(PART);
	}

	@Override
	protected String shapeKey(BlockState state) {
		return state.getValue(PART) == BedPart.HEAD ? "head" : "foot";
	}

	private static Direction towardsOther(BedPart part, Direction facing) {
		return part == BedPart.FOOT ? facing : facing.getOpposite();
	}

	@Override
	public @Nullable BlockState getStateForPlacement(BlockPlaceContext context) {
		Direction facing = context.getHorizontalDirection();
		BlockPos head = context.getClickedPos().relative(facing);
		Level level = context.getLevel();
		if (!level.getBlockState(head).canBeReplaced(context) || !level.getWorldBorder().isWithinBounds(head)) {
			return null;
		}
		return this.defaultBlockState().setValue(FACING, facing);
	}

	@Override
	public void setPlacedBy(Level level, BlockPos pos, BlockState state, @Nullable LivingEntity placer, ItemStack stack) {
		if (!level.isClientSide()) {
			level.setBlock(pos.relative(state.getValue(FACING)), state.setValue(PART, BedPart.HEAD), Block.UPDATE_ALL);
		}
	}

	@Override
	protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos,
			Direction direction, BlockPos neighborPos, BlockState neighbor, RandomSource random) {
		BedPart part = state.getValue(PART);
		if (direction == towardsOther(part, state.getValue(FACING))) {
			return neighbor.is(this) && neighbor.getValue(PART) != part ? state : Blocks.AIR.defaultBlockState();
		}
		return super.updateShape(state, level, ticks, pos, direction, neighborPos, neighbor, random);
	}

	@Override
	public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
		if (!level.isClientSide() && player.preventsBlockDrops() && state.getValue(PART) == BedPart.FOOT) {
			BlockPos other = pos.relative(state.getValue(FACING));
			BlockState head = level.getBlockState(other);
			if (head.is(this) && head.getValue(PART) == BedPart.HEAD) {
				level.setBlock(other, Blocks.AIR.defaultBlockState(), Block.UPDATE_ALL | Block.UPDATE_SUPPRESS_DROPS);
				level.levelEvent(player, 2001, other, Block.getId(head));
			}
		}
		return super.playerWillDestroy(level, pos, state, player);
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (seatHeight < 0 || player.isSecondaryUseActive()) {
			return InteractionResult.PASS;
		}
		if (!level.isClientSide()) {
			SeatEntity.trySit(level, pos, player, seatHeight);
		}
		return InteractionResult.SUCCESS;
	}
}
