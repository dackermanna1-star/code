package com.blademode.net;

import com.blademode.BladeMode;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.world.phys.Vec3;

/**
 * Server → clients: a creature was cut in two. Clients take the creature's current model apart
 * along the plane {@code normal · p = d} (world space) and let the pieces fall.
 *
 * @param bladeDirection where the blade was travelling when it passed through the creature (unit)
 */
public record MobSlicePayload(int entityId, Vec3 normal, double d, Vec3 bladeDirection) implements CustomPacketPayload {
	public static final Type<MobSlicePayload> TYPE = new Type<>(BladeMode.id("mob_slice"));
	public static final StreamCodec<RegistryFriendlyByteBuf, MobSlicePayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.VAR_INT, MobSlicePayload::entityId,
		Vec3.STREAM_CODEC, MobSlicePayload::normal,
		ByteBufCodecs.DOUBLE, MobSlicePayload::d,
		Vec3.STREAM_CODEC, MobSlicePayload::bladeDirection,
		MobSlicePayload::new);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
