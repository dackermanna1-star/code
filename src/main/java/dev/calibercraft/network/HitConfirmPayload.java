package dev.calibercraft.network;

import dev.calibercraft.CaliberCraft;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Server → shooter: confirmed damage for hit markers and optional damage numbers. */
public record HitConfirmPayload(int kind, float damage, double x, double y, double z) implements CustomPacketPayload {
	public static final int HIT = 0;
	public static final int HEADSHOT = 1;
	public static final int KILL = 2;

	public static final Type<HitConfirmPayload> TYPE = new Type<>(CaliberCraft.id("hit_confirm"));
	public static final StreamCodec<ByteBuf, HitConfirmPayload> CODEC = StreamCodec.composite(
		ByteBufCodecs.VAR_INT, HitConfirmPayload::kind,
		ByteBufCodecs.FLOAT, HitConfirmPayload::damage,
		ByteBufCodecs.DOUBLE, HitConfirmPayload::x,
		ByteBufCodecs.DOUBLE, HitConfirmPayload::y,
		ByteBufCodecs.DOUBLE, HitConfirmPayload::z,
		HitConfirmPayload::new);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
