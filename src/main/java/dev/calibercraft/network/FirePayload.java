package dev.calibercraft.network;

import dev.calibercraft.CaliberCraft;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/**
 * Client → server: one shot. {@code seq} is strictly increasing per session (duplicate protection and
 * deterministic spread seed), {@code pullId} identifies the trigger pull (semi/burst enforcement),
 * {@code spread} is the cone the client used (the server bounds it), {@code slot} the selected hotbar slot.
 */
public record FirePayload(int seq, int pullId, float yaw, float pitch, float spread, int slot) implements CustomPacketPayload {
	public static final Type<FirePayload> TYPE = new Type<>(CaliberCraft.id("fire"));
	public static final StreamCodec<ByteBuf, FirePayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.VAR_INT, FirePayload::seq,
		ByteBufCodecs.VAR_INT, FirePayload::pullId,
		ByteBufCodecs.FLOAT, FirePayload::yaw,
		ByteBufCodecs.FLOAT, FirePayload::pitch,
		ByteBufCodecs.FLOAT, FirePayload::spread,
		ByteBufCodecs.VAR_INT, FirePayload::slot,
		FirePayload::new);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
