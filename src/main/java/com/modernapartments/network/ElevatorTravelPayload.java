package com.modernapartments.network;

import com.modernapartments.ModernApartments;
import net.minecraft.core.BlockPos;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Client → server: ride the elevator to the cab floor block at {@code target}. */
public record ElevatorTravelPayload(BlockPos target) implements CustomPacketPayload {
	public static final Type<ElevatorTravelPayload> TYPE = new Type<>(ModernApartments.id("elevator_travel"));
	public static final StreamCodec<RegistryFriendlyByteBuf, ElevatorTravelPayload> CODEC = StreamCodec.composite(
		BlockPos.STREAM_CODEC, ElevatorTravelPayload::target, ElevatorTravelPayload::new);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
