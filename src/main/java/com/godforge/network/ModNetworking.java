package com.godforge.network;

import com.godforge.registry.ModComponents;
import com.godforge.registry.ModSounds;
import com.godforge.weapon.GodWeaponItem;
import com.godforge.weapon.WeaponMode;
import com.godforge.weapon.WeaponSettings;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;

public final class ModNetworking {
	private ModNetworking() {
	}

	public static void init() {
		PayloadTypeRegistry.playS2C().register(FxPayload.TYPE, FxPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(CooldownPayload.TYPE, CooldownPayload.CODEC);
		PayloadTypeRegistry.playC2S().register(SettingsPayload.TYPE, SettingsPayload.CODEC);
		PayloadTypeRegistry.playC2S().register(CycleModePayload.TYPE, CycleModePayload.CODEC);

		ServerPlayNetworking.registerGlobalReceiver(SettingsPayload.TYPE, (payload, context) -> {
			ServerPlayer player = context.player();
			InteractionHand hand = payload.hand() == 1 ? InteractionHand.OFF_HAND : InteractionHand.MAIN_HAND;
			ItemStack stack = player.getItemInHand(hand);
			if (stack.getItem() instanceof GodWeaponItem && !player.isUsingItem()) {
				GodWeaponItem.applySettings(stack, payload.settings());
				player.level().playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.MODE_SWITCH, SoundSource.PLAYERS, 0.5F, 1.3F);
			}
		});

		ServerPlayNetworking.registerGlobalReceiver(CycleModePayload.TYPE, (payload, context) -> {
			ServerPlayer player = context.player();
			if (player.isUsingItem()) {
				return;
			}
			InteractionHand hand = player.getMainHandItem().getItem() instanceof GodWeaponItem ? InteractionHand.MAIN_HAND : InteractionHand.OFF_HAND;
			ItemStack stack = player.getItemInHand(hand);
			if (!(stack.getItem() instanceof GodWeaponItem weapon)) {
				return;
			}
			WeaponSettings settings = GodWeaponItem.settings(stack);
			int count = weapon.type().modes().size();
			int next = Math.floorMod(settings.mode() + (payload.forward() ? 1 : -1), count);
			GodWeaponItem.applySettings(stack, settings.with(WeaponSettings.Field.MODE, next));
			WeaponMode mode = weapon.type().mode(next);
			player.displayClientMessage(
				Component.translatable("message.godforge.mode", Component.translatable(mode.translationKey()).withStyle(mode.ultimate() ? ChatFormatting.GOLD : ChatFormatting.AQUA)),
				true
			);
			player.level().playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.MODE_SWITCH, SoundSource.PLAYERS, 0.7F, mode.ultimate() ? 0.7F : 1.1F);
			stack.remove(ModComponents.TARGET);
		});
	}
}
