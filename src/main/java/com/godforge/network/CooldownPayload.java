package com.godforge.network;

import com.godforge.Godforge;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Server -> client: ultimate cooldown state of one weapon (for the HUD). */
public record CooldownPayload(int weapon, int remaining, int total) implements CustomPacketPayload {
	public static final CustomPacketPayload.Type<CooldownPayload> TYPE = new CustomPacketPayload.Type<>(Godforge.id("ultimate_cooldown"));
	public static final StreamCodec<RegistryFriendlyByteBuf, CooldownPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.VAR_INT, CooldownPayload::weapon,
		ByteBufCodecs.VAR_INT, CooldownPayload::remaining,
		ByteBufCodecs.VAR_INT, CooldownPayload::total,
		CooldownPayload::new
	);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
