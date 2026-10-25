package com.godforge.network;

import com.godforge.config.GodforgeConfig;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.phys.Vec3;

/** Server-side helpers that broadcast effects to nearby clients. All gameplay stays on the server. */
public final class Fx {
	private Fx() {
	}

	public static void send(ServerLevel level, FxType type, Vec3 pos, Vec3 vec, float a, float b, int color) {
		send(level, type, pos, vec, a, b, color, GodforgeConfig.get().performance.effectRange);
	}

	public static void send(ServerLevel level, FxType type, Vec3 pos, Vec3 vec, float a, float b, int color, double range) {
		FxPayload payload = new FxPayload(
			type.ordinal(), pos.x, pos.y, pos.z, (float) vec.x, (float) vec.y, (float) vec.z, a, b, color, level.getRandom().nextInt()
		);
		for (ServerPlayer player : PlayerLookup.around(level, pos, range)) {
			if (ServerPlayNetworking.canSend(player, FxPayload.TYPE)) {
				ServerPlayNetworking.send(player, payload);
			}
		}
	}

	public static void at(ServerLevel level, FxType type, Vec3 pos, float a, int color) {
		send(level, type, pos, Vec3.ZERO, a, 0.0F, color);
	}

	/** Camera shake for everyone within {@code range}, fading with distance. */
	public static void shake(ServerLevel level, Vec3 pos, float intensity, int duration, double range) {
		send(level, FxType.SHAKE, pos, new Vec3(range, 0, 0), intensity, duration, 0, range);
	}

	public static void flash(ServerLevel level, Vec3 pos, int color, float intensity, int duration, double range) {
		send(level, FxType.FLASH, pos, new Vec3(range, 0, 0), intensity, duration, color, range);
	}

	public static void distort(ServerLevel level, Vec3 pos, float intensity, int duration, double range) {
		send(level, FxType.DISTORT, pos, new Vec3(range, 0, 0), intensity, duration, 0, range);
	}

	public static void skyFlash(ServerLevel level, Vec3 pos, int ticks, double range) {
		send(level, FxType.SKY_FLASH, pos, new Vec3(range, 0, 0), 1.0F, ticks, 0, range);
	}

	/** Plays a sound for everyone nearby; volume above 1 extends the audible range (16 blocks per unit). */
	public static void sound(ServerLevel level, Vec3 pos, SoundEvent sound, float volume, float pitch) {
		level.playSound(null, pos.x, pos.y, pos.z, sound, SoundSource.PLAYERS, volume, pitch);
	}

	/** Vanilla particle packet helper (forced so players can see big effects from far away). */
	public static void particles(ServerLevel level, ParticleOptions options, Vec3 pos, int count, double spread, double speed) {
		level.sendParticles(options, true, true, pos.x, pos.y, pos.z, count, spread, spread, spread, speed);
	}
}
