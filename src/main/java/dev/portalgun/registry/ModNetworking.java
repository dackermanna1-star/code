package dev.portalgun.registry;

import dev.portalgun.dimension.Destination;
import dev.portalgun.dimension.Destinations;
import dev.portalgun.item.PortalGunItem;
import dev.portalgun.net.SetDestinationPayload;
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
		PayloadTypeRegistry.playC2S().register(SetDestinationPayload.TYPE, SetDestinationPayload.CODEC);
		ServerPlayNetworking.registerGlobalReceiver(SetDestinationPayload.TYPE, (payload, context) -> {
			ServerPlayer player = context.player();
			ItemStack stack = player.getItemInHand(payload.offhand() ? InteractionHand.OFF_HAND : InteractionHand.MAIN_HAND);
			Destination d = Destinations.get(payload.destination());
			if (d == null || !(stack.getItem() instanceof PortalGunItem)) {
				return;
			}
			stack.set(ModComponents.DESTINATION, d.id());
			player.level().playSound(null, player.getX(), player.getY(), player.getZ(), ModSounds.GUN_DIAL, SoundSource.PLAYERS, 0.7F, 1.2F);
			player.displayClientMessage(Component.translatable("message.portalgun.dialed",
				Component.literal(d.code()).withStyle(ChatFormatting.GREEN),
				Component.literal(d.name()).withStyle(s -> s.withColor(d.color()))), true);
		});
	}
}
