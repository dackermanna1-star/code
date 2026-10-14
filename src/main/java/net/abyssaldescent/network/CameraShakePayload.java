package net.abyssaldescent.network;

import io.netty.buffer.ByteBuf;
import net.abyssaldescent.AbyssalDescent;
import net.fabricmc.fabric.api.networking.v1.PlayerLookup;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.phys.Vec3;

/** Asks nearby clients for a brief camera shake (heavy boss impacts). Clients can disable it in options. */
public record CameraShakePayload(float intensity, int duration) implements CustomPacketPayload {
	public static final CustomPacketPayload.Type<CameraShakePayload> TYPE = new CustomPacketPayload.Type<>(AbyssalDescent.id("camera_shake"));
	public static final StreamCodec<ByteBuf, CameraShakePayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.FLOAT, CameraShakePayload::intensity,
		ByteBufCodecs.VAR_INT, CameraShakePayload::duration,
		CameraShakePayload::new
	);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}

	public static void send(ServerLevel level, Vec3 at, double radius, float intensity, int duration) {
		if (radius <= 0) {
			return;
		}
		for (ServerPlayer player : PlayerLookup.around(level, at, radius)) {
			float falloff = (float) (1.0 - player.position().distanceTo(at) / radius);
			ServerPlayNetworking.send(player, new CameraShakePayload(intensity * Math.max(0.2F, falloff), duration));
		}
	}
}
