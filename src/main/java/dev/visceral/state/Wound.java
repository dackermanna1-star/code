package dev.visceral.state;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/**
 * A localised injury. {@code face} indexes the part face it is drawn on (0 front, 1 back,
 * 2 right, 3 left, 4 top, 5 bottom, in the part's own frame); {@code u,v} are in [0,1] on that
 * face. {@code time} is the game time it was inflicted, used for bleeding and healing.
 */
public record Wound(BodyRegion region, WoundType type, int face, float u, float v, float severity, int rotation, long time) {
	public static final Codec<Wound> CODEC = RecordCodecBuilder.create(i -> i.group(
		Codec.INT.fieldOf("region").forGetter(w -> w.region.ordinal()),
		Codec.INT.fieldOf("type").forGetter(w -> w.type.ordinal()),
		Codec.INT.fieldOf("face").forGetter(Wound::face),
		Codec.FLOAT.fieldOf("u").forGetter(Wound::u),
		Codec.FLOAT.fieldOf("v").forGetter(Wound::v),
		Codec.FLOAT.fieldOf("severity").forGetter(Wound::severity),
		Codec.INT.fieldOf("rotation").forGetter(Wound::rotation),
		Codec.LONG.fieldOf("time").forGetter(Wound::time)
	).apply(i, (r, t, f, u, v, s, rot, time) -> new Wound(BodyRegion.byId(r), WoundType.byId(t), f, u, v, s, rot, time)));

	public static final StreamCodec<ByteBuf, Wound> STREAM_CODEC = new StreamCodec<>() {
		@Override
		public Wound decode(ByteBuf buf) {
			BodyRegion region = BodyRegion.byId(buf.readByte());
			WoundType type = WoundType.byId(buf.readByte());
			int face = buf.readByte();
			float u = buf.readFloat();
			float v = buf.readFloat();
			float severity = buf.readFloat();
			int rotation = buf.readShort();
			long time = buf.readLong();
			return new Wound(region, type, face, u, v, severity, rotation, time);
		}

		@Override
		public void encode(ByteBuf buf, Wound w) {
			buf.writeByte(w.region.ordinal());
			buf.writeByte(w.type.ordinal());
			buf.writeByte(w.face);
			buf.writeFloat(w.u);
			buf.writeFloat(w.v);
			buf.writeFloat(w.severity);
			buf.writeShort(w.rotation);
			buf.writeLong(w.time);
		}
	};

	public static final StreamCodec<ByteBuf, java.util.List<Wound>> LIST_STREAM_CODEC = STREAM_CODEC.apply(ByteBufCodecs.list(64));

	/** Wounds still actively bleeding (fresh and penetrating). */
	public boolean isBleeding(long now) {
		return type.bleeds() && severity >= 0.35f && now - time < 20L * (6 + (long) (severity * 18));
	}
}
