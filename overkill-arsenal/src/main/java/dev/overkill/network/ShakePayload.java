package dev.overkill.network;

import dev.overkill.OverkillArsenal;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Screen shake: {@code strength} is roughly degrees of camera wobble, fading out over {@code ticks}. */
public record ShakePayload(float strength, int ticks) implements CustomPacketPayload {
	public static final CustomPacketPayload.Type<ShakePayload> TYPE = new CustomPacketPayload.Type<>(OverkillArsenal.id("shake"));
	public static final StreamCodec<RegistryFriendlyByteBuf, ShakePayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.FLOAT, ShakePayload::strength,
		ByteBufCodecs.VAR_INT, ShakePayload::ticks,
		ShakePayload::new
	);

	@Override
	public CustomPacketPayload.Type<ShakePayload> type() {
		return TYPE;
	}
}
