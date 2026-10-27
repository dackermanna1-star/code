package com.realweather.network;

import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.level.ServerPlayer;

public final class RealWeatherNetworking {
	private RealWeatherNetworking() {
	}

	public static void registerPayloads() {
		PayloadTypeRegistry.playS2C().register(WeatherSyncPayload.TYPE, WeatherSyncPayload.CODEC);
		PayloadTypeRegistry.playS2C().register(LightningPayload.TYPE, LightningPayload.CODEC);
	}

	/**
	 * Sends only to players whose client has RealWeather installed; vanilla clients keep working with the
	 * vanilla rain/thunder flags that the simulator keeps in sync.
	 */
	public static void sendIfSupported(ServerPlayer player, CustomPacketPayload payload) {
		if (ServerPlayNetworking.canSend(player, payload.type())) {
			ServerPlayNetworking.send(player, payload);
		}
	}
}
