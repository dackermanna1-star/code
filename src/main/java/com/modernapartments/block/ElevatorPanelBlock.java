package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/** Elevator floor-select panel / call button: opens a screen listing every floor of the nearest cab. */
public class ElevatorPanelBlock extends FurnitureBlock {
	public static final MapCodec<ElevatorPanelBlock> CODEC = simpleCodec(ElevatorPanelBlock::new);

	public ElevatorPanelBlock(Properties properties) {
		super(properties, true);
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (player instanceof ServerPlayer serverPlayer) {
			ElevatorHandler.openPanel(serverPlayer, pos);
		}
		return InteractionResult.SUCCESS;
	}
}
