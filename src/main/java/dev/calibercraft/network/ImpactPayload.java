package dev.calibercraft.network;

import dev.calibercraft.CaliberCraft;
import io.netty.buffer.ByteBuf;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Server → clients: batched bullet impacts of one tick near the receiver. */
public record ImpactPayload(List<Impact> impacts) implements CustomPacketPayload {
	public static final int MAX = 128;
	public static final Type<ImpactPayload> TYPE = new Type<>(CaliberCraft.id("impacts"));

	/**
	 * @param face      Direction ordinal of the surface normal (blocks) or -1
	 * @param blockState block state id (Block.getId) for debris particles, or 0
	 * @param kind      {@link Kind} ordinal
	 */
	public record Impact(double x, double y, double z, int face, int blockState, int kind) {
	}

	public enum Kind {
		BLOCK, RICOCHET, ENTITY, WATER, SHATTER
	}

	public static final StreamCodec<ByteBuf, ImpactPayload> CODEC = new StreamCodec<>() {
		@Override
		public ImpactPayload decode(ByteBuf b) {
			int n = Math.min(MAX, ByteBufCodecs.VAR_INT.decode(b));
			List<Impact> list = new ArrayList<>(n);
			for (int i = 0; i < n; i++) {
				list.add(new Impact(b.readDouble(), b.readDouble(), b.readDouble(), b.readByte(), ByteBufCodecs.VAR_INT.decode(b), b.readByte()));
			}
			return new ImpactPayload(list);
		}

		@Override
		public void encode(ByteBuf b, ImpactPayload p) {
			int n = Math.min(MAX, p.impacts.size());
			ByteBufCodecs.VAR_INT.encode(b, n);
			for (int i = 0; i < n; i++) {
				Impact im = p.impacts.get(i);
				b.writeDouble(im.x).writeDouble(im.y).writeDouble(im.z);
				b.writeByte(im.face);
				ByteBufCodecs.VAR_INT.encode(b, im.blockState);
				b.writeByte(im.kind);
			}
		}
	};

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
