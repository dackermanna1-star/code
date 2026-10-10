package com.blademode.net;

import com.blademode.BladeMode;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Client → server: the player entered or left blade mode (used for the slow-motion effect). */
public record BladeModePayload(boolean active) implements CustomPacketPayload {
	public static final Type<BladeModePayload> TYPE = new Type<>(BladeMode.id("blade_mode"));
	public static final StreamCodec<RegistryFriendlyByteBuf, BladeModePayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.BOOL, BladeModePayload::active,
		BladeModePayload::new);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
