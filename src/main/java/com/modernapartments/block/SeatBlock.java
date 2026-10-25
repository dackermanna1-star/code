package com.modernapartments.block;

import com.modernapartments.entity.SeatEntity;
import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/** Furniture the player can sit on (right-click; sneak to interact normally). */
public class SeatBlock extends FurnitureBlock {
	public static final MapCodec<SeatBlock> CODEC = simpleCodec(p -> new SeatBlock(p, 0.5F));

	private final float seatHeight;

	public SeatBlock(Properties properties, float seatHeight) {
		super(properties);
		this.seatHeight = seatHeight;
	}

	public float seatHeight() {
		return seatHeight;
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (player.isSecondaryUseActive()) {
			return InteractionResult.PASS;
		}
		if (!level.isClientSide()) {
			SeatEntity.trySit(level, pos, player, seatHeight);
		}
		return InteractionResult.SUCCESS;
	}
}
