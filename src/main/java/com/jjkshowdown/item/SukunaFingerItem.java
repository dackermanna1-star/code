package com.jjkshowdown.item;

import com.jjkshowdown.entity.boss.BossSpawner;
import com.jjkshowdown.network.JjkNetwork;
import com.jjkshowdown.network.Payloads;
import com.jjkshowdown.registry.ModParticles;
import com.jjkshowdown.registry.ModSounds;
import com.jjkshowdown.sorcerer.CharacterType;
import com.jjkshowdown.sorcerer.Characters;
import com.jjkshowdown.sorcerer.CursedEnergy;
import com.jjkshowdown.sorcerer.Mastery;
import com.jjkshowdown.sorcerer.SorcererData;
import com.jjkshowdown.sorcerer.SorcererStats;
import com.jjkshowdown.sorcerer.Sorcerers;
import com.jjkshowdown.util.Fx;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
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
 * One of the twenty fingers of Ryomen Sukuna. Swallowed by a non-sorcerer it makes them his vessel; Sukuna grows
 * stronger with every finger; held up by Gojo it calls the King of Curses himself.
 */
public class SukunaFingerItem extends Item {
	public SukunaFingerItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		if (!(level instanceof ServerLevel sl) || !(player instanceof ServerPlayer sp)) return InteractionResult.SUCCESS;
		ItemStack stack = player.getItemInHand(hand);
		CharacterType c = Sorcerers.character(sp);
		SorcererData d = Sorcerers.data(sp);
		switch (c) {
			case GOJO -> {
				if (BossSpawner.summonRival(sp, CharacterType.SUKUNA) != null) {
					stack.consume(1, player);
					player.getCooldowns().addCooldown(stack, 100);
				}
			}
			case NONE -> {
				Characters.set(sp, CharacterType.SUKUNA, true);
				d.setFingers(Math.max(1, d.fingers()));
				consumeFx(sl, sp);
				stack.consume(1, player);
				JjkNetwork.notify(sp, Payloads.Notify.CALLOUT, Component.translatable("message.jjkshowdown.vessel"), CharacterType.SUKUNA.energyColor);
			}
			case SUKUNA -> {
				if (d.fingers() >= SorcererData.MAX_FINGERS) {
					JjkNetwork.notify(sp, Payloads.Notify.WARN, Component.translatable("message.jjkshowdown.all_fingers"), 0xFF6060);
					return InteractionResult.FAIL;
				}
				d.setFingers(d.fingers() + 1);
				Mastery.addXp(sp, 150);
				SorcererStats.apply(sp);
				CursedEnergy.fill(sp);
				consumeFx(sl, sp);
				stack.consume(1, player);
				JjkNetwork.notify(sp, Payloads.Notify.CALLOUT, Component.translatable("message.jjkshowdown.finger", d.fingers(), SorcererData.MAX_FINGERS),
						CharacterType.SUKUNA.energyColor);
			}
		}
		return InteractionResult.SUCCESS;
	}

	private static void consumeFx(ServerLevel level, ServerPlayer p) {
		Fx.sound(p, SoundEvents.GENERIC_EAT.value(), 1.0f, 0.7f);
		Fx.sound(p, ModSounds.AMPLIFICATION_ON, 1.5f, 0.6f);
		Fx.burst(level, ModParticles.CE_WISP_RED, p.position().add(0, 1, 0), 60, 0.5);
		Fx.particles(level, ModParticles.DOMAIN_EMBER, p.position().add(0, 1, 0), 30, 0.6, 1.0, 0.6, 0.05);
		JjkNetwork.screenEffect(p, Payloads.ScreenEffect.FLASH, 0.8f, 16, 0xA00010);
		JjkNetwork.shakeAround(level, p.position(), 24, 0.5f, 12);
	}

	@Override
	public void appendHoverText(ItemStack stack, Item.TooltipContext ctx, TooltipDisplay display, Consumer<Component> out, TooltipFlag flag) {
		out.accept(Component.translatable("item.jjkshowdown.sukuna_finger.desc").withStyle(ChatFormatting.DARK_RED));
		out.accept(Component.translatable("item.jjkshowdown.sukuna_finger.desc2").withStyle(ChatFormatting.GRAY));
	}
}
