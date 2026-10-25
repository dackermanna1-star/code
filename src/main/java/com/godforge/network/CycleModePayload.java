package com.godforge.network;

import com.godforge.Godforge;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Client -> server: switch the held weapon to its next (or previous) firing mode. */
public record CycleModePayload(boolean forward) implements CustomPacketPayload {
	public static final CustomPacketPayload.Type<CycleModePayload> TYPE = new CustomPacketPayload.Type<>(Godforge.id("cycle_mode"));
	public static final StreamCodec<RegistryFriendlyByteBuf, CycleModePayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.BOOL, CycleModePayload::forward,
		CycleModePayload::new
	);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
