package com.modernapartments.network;

import com.modernapartments.ModernApartments;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Server → client: the floors served by an elevator column, so the client can show the floor panel. */
public record ElevatorFloorsPayload(BlockPos column, int currentY, List<Floor> floors) implements CustomPacketPayload {
	public static final Type<ElevatorFloorsPayload> TYPE = new Type<>(ModernApartments.id("elevator_floors"));

	public record Floor(int y, String label) {
		public static final StreamCodec<RegistryFriendlyByteBuf, Floor> STREAM_CODEC = StreamCodec.composite(
			ByteBufCodecs.VAR_INT, Floor::y,
			ByteBufCodecs.STRING_UTF8, Floor::label,
			Floor::new);
	}

	public static final StreamCodec<RegistryFriendlyByteBuf, ElevatorFloorsPayload> CODEC = StreamCodec.composite(
		BlockPos.STREAM_CODEC, ElevatorFloorsPayload::column,
		ByteBufCodecs.VAR_INT, ElevatorFloorsPayload::currentY,
		Floor.STREAM_CODEC.apply(ByteBufCodecs.list(256)), ElevatorFloorsPayload::floors,
		ElevatorFloorsPayload::new);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
