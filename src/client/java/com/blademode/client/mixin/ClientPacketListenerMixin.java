package com.blademode.client.mixin;

import com.blademode.client.gore.CorpseManager;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.game.ClientboundExplodePacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Explosions throw corpses around. */
@Mixin(ClientPacketListener.class)
public abstract class ClientPacketListenerMixin {
	@Inject(method = "handleExplosion", at = @At("TAIL"))
	private void blademode$blastCorpses(ClientboundExplodePacket packet, CallbackInfo ci) {
		CorpseManager.onExplosion(packet.center(), packet.radius());
	}
}
