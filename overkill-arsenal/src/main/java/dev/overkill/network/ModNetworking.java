package dev.overkill.network;

import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;

public final class ModNetworking {
	private ModNetworking() {
	}

	public static void init() {
		PayloadTypeRegistry.playS2C().register(FxPayload.TYPE, FxPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(ShakePayload.TYPE, ShakePayload.CODEC);
	}
}
