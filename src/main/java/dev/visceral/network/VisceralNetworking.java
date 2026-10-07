package dev.visceral.network;

import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;

public final class VisceralNetworking {
	private VisceralNetworking() {
	}

	public static void init() {
		PayloadTypeRegistry.playS2C().register(HitFxPayload.TYPE, HitFxPayload.CODEC);
	}

	/** Sends to everyone who can see {@code entity}, including the entity itself when it is a player. */
	public static void sendToTrackingAndSelf(Entity entity, CustomPacketPayload payload) {
		for (ServerPlayer player : PlayerLookup.tracking(entity)) {
			if (ServerPlayNetworking.canSend(player, HitFxPayload.TYPE)) {
				ServerPlayNetworking.send(player, payload);
			}
		}
		if (entity instanceof ServerPlayer self && ServerPlayNetworking.canSend(self, HitFxPayload.TYPE)) {
			ServerPlayNetworking.send(self, payload);
		}
	}
}
