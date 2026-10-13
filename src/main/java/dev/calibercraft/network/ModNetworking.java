package dev.calibercraft.network;

import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;

/** Payload type registration (both sides). Handlers are registered by the server/client initialisers. */
public final class ModNetworking {
	private ModNetworking() {
	}

	public static void registerTypes() {
		PayloadTypeRegistry.playC2S().register(FirePayload.TYPE, FirePayload.CODEC);
		PayloadTypeRegistry.playC2S().register(GunActionPayload.TYPE, GunActionPayload.CODEC);
		PayloadTypeRegistry.playC2S().register(GunsmithPayload.TYPE, GunsmithPayload.CODEC);

		PayloadTypeRegistry.playS2C().register(SyncDataPayload.TYPE, SyncDataPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(ShotEventPayload.TYPE, ShotEventPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(ImpactPayload.TYPE, ImpactPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(HitConfirmPayload.TYPE, HitConfirmPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(GunFeedbackPayload.TYPE, GunFeedbackPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(OpenGunsmithPayload.TYPE, OpenGunsmithPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(WhizPayload.TYPE, WhizPayload.CODEC);
	}
}
