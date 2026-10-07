package dev.visceral.client.mixin;

import dev.visceral.client.ragdoll.RagdollManager;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.game.ClientboundExplodePacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Explosions throw nearby corpses around. */
@Mixin(ClientPacketListener.class)
abstract class ClientPacketListenerMixin {
	@Inject(method = "handleExplosion", at = @At("TAIL"), require = 0)
	private void visceral$blastCorpses(ClientboundExplodePacket packet, CallbackInfo ci) {
		RagdollManager.get().onExplosion(packet.center(), packet.radius());
	}
}
