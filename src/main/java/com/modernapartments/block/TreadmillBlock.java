package com.modernapartments.block;

import com.mojang.serialization.MapCodec;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.HorizontalDirectionalBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/** Usable gym equipment: a quick workout grants a short Speed boost. */
public class TreadmillBlock extends TwoPartFurnitureBlock {
	public static final MapCodec<TreadmillBlock> CODEC = simpleCodec(TreadmillBlock::new);

	public TreadmillBlock(Properties properties) {
		super(properties, -1);
	}

	@Override
	protected MapCodec<? extends HorizontalDirectionalBlock> codec() {
		return CODEC;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (!level.isClientSide()) {
			player.addEffect(new MobEffectInstance(MobEffects.SPEED, 20 * 45, 0));
			player.causeFoodExhaustion(1.5F);
			level.playSound(null, pos, SoundEvents.WOOL_STEP, SoundSource.BLOCKS, 0.8F, 0.7F);
			player.displayClientMessage(Component.translatable("message.modernapartments.workout"), true);
		}
		return InteractionResult.SUCCESS;
	}
}
