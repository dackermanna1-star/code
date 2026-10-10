package com.blademode.net;

import com.blademode.BladeMode;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.world.phys.Vec3;

/** Client → server: the player finished drawing a cut line. Directions are the view rays through its ends. */
public record SlashPayload(Vec3 eye, Vec3 dirA, Vec3 dirB) implements CustomPacketPayload {
	public static final Type<SlashPayload> TYPE = new Type<>(BladeMode.id("slash"));
	public static final StreamCodec<RegistryFriendlyByteBuf, SlashPayload> CODEC = StreamCodec.composite(
		Vec3.STREAM_CODEC, SlashPayload::eye,
		Vec3.STREAM_CODEC, SlashPayload::dirA,
		Vec3.STREAM_CODEC, SlashPayload::dirB,
		SlashPayload::new);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
