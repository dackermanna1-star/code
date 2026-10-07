package com.laptopcraft.item.toy;

import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.Level;

/**
 * Ask it anything. Shake (right-click) and the answer floats up in the action bar: 10 yes, 5 maybe, 5 no — exactly
 * like the original, plus a few Minecraft-flavoured ones.
 */
public class Magic8BallItem extends Item {
	public static final int ANSWERS = 20;
	private static final int POSITIVE = 10;
	private static final int NEUTRAL = 5;

	public Magic8BallItem(Item.Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.BOTTLE_FILL, SoundSource.PLAYERS, 0.6F, 1.4F);
		level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.AMETHYST_BLOCK_CHIME, SoundSource.PLAYERS, 0.8F, 0.8F);
		if (!level.isClientSide()) {
			int answer = level.getRandom().nextInt(ANSWERS);
			ChatFormatting color = answer < POSITIVE ? ChatFormatting.GREEN : answer < POSITIVE + NEUTRAL ? ChatFormatting.YELLOW : ChatFormatting.RED;
			Component text = Component.translatable("item.laptopcraft.magic_8_ball.answer." + answer).withStyle(color, ChatFormatting.BOLD);
			player.displayClientMessage(Component.translatable("item.laptopcraft.magic_8_ball.says", text).withStyle(ChatFormatting.DARK_PURPLE), true);
		}
		player.getCooldowns().addCooldown(player.getItemInHand(hand), 20);
		return InteractionResult.SUCCESS;
	}
}
