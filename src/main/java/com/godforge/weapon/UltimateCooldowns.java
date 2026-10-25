package com.godforge.weapon;

import com.godforge.config.GodforgeConfig;
import com.godforge.network.CooldownPayload;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;

/**
 * Ultimate abilities have their own long cooldown so the weapon's normal modes stay usable meanwhile.
 * Server-authoritative; clients receive the state for their HUD.
 */
public final class UltimateCooldowns {
	private static final Map<UUID, long[]> READY_AT = new HashMap<>();

	private UltimateCooldowns() {
	}

	public static void init() {
		ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> resync(handler.getPlayer()));
		ServerLifecycleEvents.SERVER_STOPPED.register(server -> READY_AT.clear());
	}

	private static long now(MinecraftServer server) {
		return server.getTickCount();
	}

	public static boolean bypass(ServerPlayer player) {
		return player.isCreative() && GodforgeConfig.get().general.creativeBypassCooldowns;
	}

	public static int remaining(ServerPlayer player, WeaponType type) {
		if (bypass(player)) {
			return 0;
		}
		long[] ready = READY_AT.get(player.getUUID());
		if (ready == null) {
			return 0;
		}
		return (int) Math.max(0, ready[type.ordinal()] - now(player.level().getServer()));
	}

	public static boolean isReady(ServerPlayer player, WeaponType type) {
		return remaining(player, type) <= 0;
	}

	public static void start(ServerPlayer player, WeaponType type, int ticks) {
		if (bypass(player) || ticks <= 0) {
			return;
		}
		long[] ready = READY_AT.computeIfAbsent(player.getUUID(), id -> new long[WeaponType.values().length]);
		ready[type.ordinal()] = now(player.level().getServer()) + ticks;
		send(player, type, ticks, ticks);
	}

	public static void reset(ServerPlayer player) {
		READY_AT.remove(player.getUUID());
		for (WeaponType type : WeaponType.values()) {
			send(player, type, 0, 0);
		}
	}

	private static void resync(ServerPlayer player) {
		for (WeaponType type : WeaponType.values()) {
			int remaining = remaining(player, type);
			if (remaining > 0) {
				send(player, type, remaining, GodforgeConfig.get().tuning(type).ultimateCooldownTicks);
			}
		}
	}

	private static void send(ServerPlayer player, WeaponType type, int remaining, int total) {
		if (ServerPlayNetworking.canSend(player, CooldownPayload.TYPE)) {
			ServerPlayNetworking.send(player, new CooldownPayload(type.ordinal(), remaining, total));
		}
	}
}
