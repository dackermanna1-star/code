package com.ordnance.client.mixin;

import com.ordnance.client.fx.VanillaExplosionVisuals;
import net.minecraft.client.network.ClientPlayNetworkHandler;
import net.minecraft.network.packet.s2c.play.ExplosionS2CPacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Replaces the particles and sound of vanilla explosions (works on any server, modded or not). */
@Mixin(ClientPlayNetworkHandler.class)
public abstract class ClientPlayNetworkHandlerMixin {
	@Inject(
		method = "onExplosion",
		at = @At(
			value = "INVOKE",
			target = "Lnet/minecraft/network/NetworkThreadUtils;forceMainThread(Lnet/minecraft/network/packet/Packet;Lnet/minecraft/network/listener/PacketListener;Lnet/minecraft/network/PacketApplyBatcher;)V",
			shift = At.Shift.AFTER
		),
		cancellable = true
	)
	private void ordnance$overhaulExplosion(ExplosionS2CPacket packet, CallbackInfo ci) {
		if (VanillaExplosionVisuals.handle(packet)) {
			ci.cancel();
		}
	}
}
