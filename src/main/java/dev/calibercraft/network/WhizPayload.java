package dev.calibercraft.network;

import dev.calibercraft.CaliberCraft;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Server → player: a bullet passed close by at this position. */
public record WhizPayload(double x, double y, double z) implements CustomPacketPayload {
	public static final Type<WhizPayload> TYPE = new Type<>(CaliberCraft.id("whiz"));
	public static final StreamCodec<ByteBuf, WhizPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.DOUBLE, WhizPayload::x,
		ByteBufCodecs.DOUBLE, WhizPayload::y,
		ByteBufCodecs.DOUBLE, WhizPayload::z,
		WhizPayload::new);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
