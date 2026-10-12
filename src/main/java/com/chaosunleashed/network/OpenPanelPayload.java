package com.chaosunleashed.network;

import com.chaosunleashed.ChaosUnleashed;
import net.minecraft.network.PacketByteBuf;
import net.minecraft.network.codec.PacketCodec;
import net.minecraft.network.packet.CustomPayload;
import net.minecraft.util.math.BlockPos;

/** Server -> client: open the Chaos Control Panel screen for the panel at {@code pos}. */
public record OpenPanelPayload(BlockPos pos, boolean canEdit) implements CustomPayload {
	public static final Id<OpenPanelPayload> ID = new Id<>(ChaosUnleashed.id("open_panel"));
	public static final PacketCodec<PacketByteBuf, OpenPanelPayload> CODEC = CustomPayload.codecOf(
		(payload, buf) -> {
			buf.writeBlockPos(payload.pos);
			buf.writeBoolean(payload.canEdit);
		},
		buf -> new OpenPanelPayload(buf.readBlockPos(), buf.readBoolean()));

	@Override
	public Id<? extends CustomPayload> getId() {
		return ID;
	}
}
