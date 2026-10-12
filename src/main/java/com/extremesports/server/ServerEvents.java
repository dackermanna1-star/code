package com.extremesports.server;

import com.extremesports.entity.SportEquipmentEntity;
import com.extremesports.network.ModNetworking;
import net.fabricmc.fabric.api.entity.event.v1.ServerEntityWorldChangeEvents;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.server.level.ServerPlayer;

public final class ServerEvents {
	private ServerEvents() {
	}

	public static void init() {
		ServerTickEvents.END_SERVER_TICK.register(server -> {
			ChallengeManager.tick(server);
			if (server.getTickCount() % 200 == 0) {
				// Periodically bank distance so long cruises count toward stats and unlocks
				for (ServerPlayer player : server.getPlayerList().getPlayers()) {
					if (player.getVehicle() instanceof SportEquipmentEntity && ServerRideTracker.get(player).pendingDistance > 1.0) {
						ScoreService.saveAndAnnounce(player, PlayerSportData.get(player));
					}
				}
			}
		});
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> {
			ServerRideTracker.remove(handler.getPlayer().getUUID());
			ChallengeManager.remove(handler.getPlayer().getUUID());
			ModNetworking.forget(handler.getPlayer());
		});
		ServerEntityWorldChangeEvents.AFTER_PLAYER_CHANGE_WORLD.register((player, origin, destination) -> ChallengeManager.stop(player));
		ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> {
			if (entity instanceof ServerPlayer player) {
				ChallengeManager.stop(player);
			}
		});
	}
}
