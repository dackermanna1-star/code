package dev.overkill.network;

import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.phys.Vec3;

/** Server-side helpers for broadcasting effects and screen shake to nearby players. */
public final class Fx {
	/** Most effects are visible from this far away. */
	public static final double DEFAULT_RANGE = 160.0;

	private Fx() {
	}

	public static void send(ServerLevel level, Vec3 near, double range, int kind, Vec3 a, Vec3 b, float scale, int seed) {
		FxPayload payload = new FxPayload(kind, a, b, scale, seed);
		for (ServerPlayer player : PlayerLookup.around(level, near, range)) {
			ServerPlayNetworking.send(player, payload);
		}
	}

	public static void send(ServerLevel level, int kind, Vec3 a, Vec3 b, float scale, int seed) {
		send(level, a, DEFAULT_RANGE, kind, a, b, scale, seed);
	}

	public static void send(ServerLevel level, int kind, Vec3 a, float scale) {
		send(level, a, DEFAULT_RANGE, kind, a, Vec3.ZERO, scale, level.random.nextInt());
	}

	/** Shakes the camera of every player within {@code range}, weaker with distance. */
	public static void shake(ServerLevel level, Vec3 center, double range, float strength, int ticks) {
		for (ServerPlayer player : PlayerLookup.around(level, center, range)) {
			float falloff = (float) (1.0 - player.position().distanceTo(center) / range);
			float s = strength * falloff * falloff;
			if (s > 0.08F) {
				ServerPlayNetworking.send(player, new ShakePayload(s, ticks));
			}
		}
	}

	public static void shake(ServerPlayer player, float strength, int ticks) {
		ServerPlayNetworking.send(player, new ShakePayload(strength, ticks));
	}
}
