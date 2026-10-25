package com.godforge.util;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;

/** Temporarily cancels fall damage for players propelled by their own abilities (leaps, slams). */
public final class FallGuard {
	private static final Map<UUID, Integer> GUARDED = new HashMap<>();

	private FallGuard() {
	}

	public static void init() {
		ServerTickEvents.END_SERVER_TICK.register(FallGuard::tick);
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> GUARDED.clear());
	}

	public static void protect(ServerPlayer player, int ticks) {
		GUARDED.merge(player.getUUID(), ticks, Math::max);
		player.resetFallDistance();
	}

	private static void tick(MinecraftServer server) {
		if (GUARDED.isEmpty()) {
			return;
		}
		GUARDED.entrySet().removeIf(entry -> {
			ServerPlayer player = server.getPlayerList().getPlayer(entry.getKey());
			if (player != null) {
				player.resetFallDistance();
			}
			entry.setValue(entry.getValue() - 1);
			return player == null || entry.getValue() <= 0;
		});
	}
}
