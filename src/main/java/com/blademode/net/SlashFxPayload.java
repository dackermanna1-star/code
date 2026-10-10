package com.blademode.net;

import com.blademode.BladeMode;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.world.phys.Vec3;

/** Server → clients: draw the glowing trail of a slash. */
public record SlashFxPayload(Vec3 eye, Vec3 dirA, Vec3 dirB, float reach) implements CustomPacketPayload {
	public static final Type<SlashFxPayload> TYPE = new Type<>(BladeMode.id("slash_fx"));
	public static final StreamCodec<RegistryFriendlyByteBuf, SlashFxPayload> CODEC = StreamCodec.composite(
		Vec3.STREAM_CODEC, SlashFxPayload::eye,
		Vec3.STREAM_CODEC, SlashFxPayload::dirA,
		Vec3.STREAM_CODEC, SlashFxPayload::dirB,
		ByteBufCodecs.FLOAT, SlashFxPayload::reach,
		SlashFxPayload::new);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
