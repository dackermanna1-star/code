package com.chaosunleashed.network;

import com.chaosunleashed.ChaosUnleashed;
import net.minecraft.network.PacketByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.math.BlockPos;

/**
 * Client -> server: a button press in the Chaos Control Panel GUI. Everything is validated on the server:
 * the player must be near an actual Chaos Control Panel at {@code pos} and have permission.
 */
public record PanelActionPayload(BlockPos pos, Action action, int eventType, int intensity) implements CustomPayload {
	public static final Id<PanelActionPayload> ID = new Id<>(ChaosUnleashed.id("panel_action"));
	public static final PacketCodec<PacketByteBuf, PanelActionPayload> CODEC = CustomPayload.codecOf(
		(payload, buf) -> {
			buf.writeBlockPos(payload.pos);
			buf.writeEnumConstant(payload.action);
			buf.writeVarInt(payload.eventType);
			buf.writeVarInt(payload.intensity);
		},
		buf -> new PanelActionPayload(buf.readBlockPos(), buf.readEnumConstant(Action.class), buf.readVarInt(), buf.readVarInt()));

	public enum Action {
		ENABLE,
		DISABLE,
		START,
		STOP_EVENT,
		STOP_ALL,
		RANDOM_ON,
		RANDOM_OFF
	}

	@Override
	public Id<? extends CustomPayload> getId() {
		return ID;
	}
}
