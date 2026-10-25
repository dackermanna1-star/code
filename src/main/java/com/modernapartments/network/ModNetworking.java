package com.modernapartments.network;

import com.modernapartments.block.ElevatorHandler;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;

public final class ModNetworking {
	private ModNetworking() {
	}

	public static void init() {
		PayloadTypeRegistry.playS2C().register(ElevatorFloorsPayload.TYPE, ElevatorFloorsPayload.CODEC);
		PayloadTypeRegistry.playC2S().register(ElevatorTravelPayload.TYPE, ElevatorTravelPayload.CODEC);
		ServerPlayNetworking.registerGlobalReceiver(ElevatorTravelPayload.TYPE,
			(payload, context) -> ElevatorHandler.travelFromPanel(context.player(), payload.target()));
	}
}
