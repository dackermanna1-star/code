package net.abyssaldescent.network;

import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;

public final class ModNetworking {
	private ModNetworking() {
	}

	public static void init() {
		PayloadTypeRegistry.playS2C().register(CameraShakePayload.TYPE, CameraShakePayload.CODEC);
	}
}
