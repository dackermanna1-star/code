package com.jjkshowdown.item;

import com.jjkshowdown.entity.boss.BossSpawner;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.Characters;
import com.jjkshowdown.sorcerer.Sorcerers;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.component.TooltipDisplay;
import net.minecraft.world.level.Level;

import java.util.function.Consumer;

/**
 * Gojo's blindfold. Wearable. A non-sorcerer who puts it on awakens the Six Eyes; Sukuna holding it calls
 * Satoru Gojo to battle.
 */
public class BlindfoldItem extends Item {
	public BlindfoldItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		if (player instanceof ServerPlayer sp) {
			CharacterType c = Sorcerers.character(sp);
			if (c == CharacterType.SUKUNA) {
				ItemStack stack = player.getItemInHand(hand);
				if (BossSpawner.summonRival(sp, CharacterType.GOJO) != null) {
					stack.consume(1, player);
				}
				return InteractionResult.SUCCESS;
			}
			if (c == CharacterType.NONE) {
				Characters.set(sp, CharacterType.GOJO, true);
				JjkNetwork.notify(sp, Payloads.Notify.CALLOUT, Component.translatable("message.jjkshowdown.six_eyes"), CharacterType.GOJO.energyColor);
			}
		}
		return super.use(level, player, hand);
	}

	@Override
	public void appendHoverText(ItemStack stack, Item.TooltipContext ctx, TooltipDisplay display, Consumer<Component> out, TooltipFlag flag) {
		out.accept(Component.translatable("item.jjkshowdown.gojo_blindfold.desc").withStyle(ChatFormatting.AQUA));
		out.accept(Component.translatable("item.jjkshowdown.gojo_blindfold.desc2").withStyle(ChatFormatting.GRAY));
	}
}
