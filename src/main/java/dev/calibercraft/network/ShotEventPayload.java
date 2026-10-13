package dev.calibercraft.network;

import dev.calibercraft.CaliberCraft;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

/**
 * Server → other clients: a shot was fired. Clients regenerate the exact pellet directions from
 * {@code seed}/{@code spread} for tracers and choose near/far/suppressed audio by distance.
 */
public record ShotEventPayload(int shooterId, Identifier weapon, double x, double y, double z, float yaw, float pitch, float spread,
		int pellets, long seed, int flags, float loudness, float flash, int tracerColor) implements CustomPacketPayload {
	public static final int SUPPRESSED = 1;
	public static final int TRACER = 2;

	public static final Type<ShotEventPayload> TYPE = new Type<>(CaliberCraft.id("shot_event"));
	public static final StreamCodec<ByteBuf, ShotEventPayload> CODEC = new StreamCodec<>() {
		@Override
		public ShotEventPayload decode(ByteBuf b) {
			return new ShotEventPayload(ByteBufCodecs.VAR_INT.decode(b), Identifier.STREAM_CODEC.decode(b), b.readDouble(), b.readDouble(),
				b.readDouble(), b.readFloat(), b.readFloat(), b.readFloat(), ByteBufCodecs.VAR_INT.decode(b), b.readLong(),
				ByteBufCodecs.VAR_INT.decode(b), b.readFloat(), b.readFloat(), b.readInt());
		}

		@Override
		public void encode(ByteBuf b, ShotEventPayload p) {
			ByteBufCodecs.VAR_INT.encode(b, p.shooterId);
			Identifier.STREAM_CODEC.encode(b, p.weapon);
			b.writeDouble(p.x).writeDouble(p.y).writeDouble(p.z);
			b.writeFloat(p.yaw).writeFloat(p.pitch).writeFloat(p.spread);
			ByteBufCodecs.VAR_INT.encode(b, p.pellets);
			b.writeLong(p.seed);
			ByteBufCodecs.VAR_INT.encode(b, p.flags);
			b.writeFloat(p.loudness).writeFloat(p.flash);
			b.writeInt(p.tracerColor);
		}
	};

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
