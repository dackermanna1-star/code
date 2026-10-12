package com.chaosunleashed.mixin;

import com.chaosunleashed.command.ChaosCommand;
import net.minecraft.network.packet.c2s.common.CustomClickActionC2SPacket;
import net.minecraft.server.network.ServerCommonNetworkHandler;
import net.minecraft.server.network.ServerPlayNetworkHandler;
import net.minecraft.server.network.ServerPlayerEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Handles clicks on the buttons of {@code /chaos menu}. The payload is a {@code chaos ...} command which is run
 * as the clicking player, so all normal permission checks apply. Injected at TAIL, i.e. after vanilla has moved
 * the packet to the server thread.
 */
@Mixin(ServerCommonNetworkHandler.class)
public abstract class ServerCommonNetworkHandlerMixin {
	@Inject(method = "onCustomClickAction", at = @At("TAIL"))
	private void chaosunleashed$handleMenuClick(CustomClickActionC2SPacket packet, CallbackInfo ci) {
		if (!packet.id().equals(ChaosCommand.MENU_CLICK_ID) || !((Object) this instanceof ServerPlayNetworkHandler handler)) {
			return;
		}
		ServerPlayerEntity player = handler.player;
		packet.payload().flatMap(nbt -> nbt.asString()).ifPresent(command -> {
			if (command.equals("chaos") || command.startsWith("chaos ")) {
				player.getEntityWorld().getServer().getCommandManager().parseAndExecute(player.getCommandSource(), command);
			}
		});
	}
}
