package com.chaosunleashed.network;

import com.chaosunleashed.ChaosUnleashed;
import net.minecraft.network.PacketByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;

/** Server -> client: shake the camera with the given strength (degrees-ish) for the given number of ticks. */
public record ScreenShakePayload(float strength, int ticks) implements CustomPayload {
	public static final Id<ScreenShakePayload> ID = new Id<>(ChaosUnleashed.id("shake"));
	public static final PacketCodec<PacketByteBuf, ScreenShakePayload> CODEC = CustomPayload.codecOf(
		(payload, buf) -> {
			buf.writeFloat(payload.strength);
			buf.writeVarInt(payload.ticks);
		},
		buf -> new ScreenShakePayload(buf.readFloat(), buf.readVarInt()));

	@Override
	public Id<? extends CustomPayload> getId() {
		return ID;
	}
}
