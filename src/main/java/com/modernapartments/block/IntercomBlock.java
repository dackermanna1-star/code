package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/** Lobby intercom: buzzing in releases the nearby entrance doors for a few seconds, even if locked. */
public class IntercomBlock extends FurnitureBlock {
	public static final MapCodec<IntercomBlock> CODEC = simpleCodec(IntercomBlock::new);

	public IntercomBlock(Properties properties) {
		super(properties, true);
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (!level.isClientSide()) {
			level.playSound(null, pos, SoundEvents.NOTE_BLOCK_BIT.value(), SoundSource.BLOCKS, 0.8F, 0.5F);
			int doors = DoorAccess.release(level, pos, 5, 100);
			player.displayClientMessage(Component.translatable(doors > 0 ? "message.modernapartments.intercom_released"
				: "message.modernapartments.intercom_no_answer"), true);
		}
		return InteractionResult.SUCCESS;
	}
}
