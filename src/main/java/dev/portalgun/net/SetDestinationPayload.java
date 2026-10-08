package dev.portalgun.net;

import dev.portalgun.PortalGunMod;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

/** Client -> server: the player picked a destination on the portal gun dial. */
public record SetDestinationPayload(Identifier destination, boolean offhand) implements CustomPacketPayload {
	public static final Type<SetDestinationPayload> TYPE = new Type<>(PortalGunMod.id("set_destination"));
	public static final StreamCodec<RegistryFriendlyByteBuf, SetDestinationPayload> CODEC = StreamCodec.composite(
		Identifier.STREAM_CODEC, SetDestinationPayload::destination,
		ByteBufCodecs.BOOL, SetDestinationPayload::offhand,
		SetDestinationPayload::new);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
