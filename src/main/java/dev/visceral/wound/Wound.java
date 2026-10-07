package dev.visceral.wound;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.util.ExtraCodecs;
import org.joml.Vector3f;
import org.joml.Vector3fc;

/**
 * One injury on an entity.
 *
 * <p>The location is stored as a ray in the entity's <i>body frame</i> (origin at the entity's feet,
 * rotated so the body faces +Z, see {@link BodyFrame}). Clients cast that ray against the actual
 * model to find the exact cube face, so the server never needs to know about models.
 *
 * @param type     kind of wound
 * @param severity roughly damage / 6, in [0.1, 2.5]
 * @param origin   ray origin, body frame, blocks
 * @param dir      ray direction, body frame, normalized
 * @param roll     in-plane angle of the decal relative to horizontal, radians
 * @param seed     deterministic randomness for the client (texture variant, jitter)
 * @param time     game time the wound was inflicted
 */
public record Wound(WoundType type, float severity, Vector3fc origin, Vector3fc dir, float roll, int seed, long time) {
	public static final Codec<Wound> CODEC = RecordCodecBuilder.create(instance -> instance.group(
		WoundType.CODEC.fieldOf("type").forGetter(Wound::type),
		Codec.FLOAT.fieldOf("severity").forGetter(Wound::severity),
		ExtraCodecs.VECTOR3F.fieldOf("origin").forGetter(Wound::origin),
		ExtraCodecs.VECTOR3F.fieldOf("dir").forGetter(Wound::dir),
		Codec.FLOAT.fieldOf("roll").forGetter(Wound::roll),
		Codec.INT.fieldOf("seed").forGetter(Wound::seed),
		Codec.LONG.fieldOf("time").forGetter(Wound::time)
	).apply(instance, Wound::new));

	public static final StreamCodec<ByteBuf, Wound> STREAM_CODEC = new StreamCodec<>() {
		@Override
		public Wound decode(ByteBuf buf) {
			WoundType type = WoundType.byId(buf.readByte());
			float severity = buf.readFloat();
			Vector3fc origin = ByteBufCodecs.VECTOR3F.decode(buf);
			Vector3fc dir = ByteBufCodecs.VECTOR3F.decode(buf);
			float roll = buf.readFloat();
			int seed = buf.readInt();
			long time = buf.readLong();
			return new Wound(type, severity, origin, dir, roll, seed, time);
		}

		@Override
		public void encode(ByteBuf buf, Wound wound) {
			buf.writeByte(wound.type.ordinal());
			buf.writeFloat(wound.severity);
			ByteBufCodecs.VECTOR3F.encode(buf, wound.origin);
			ByteBufCodecs.VECTOR3F.encode(buf, wound.dir);
			buf.writeFloat(wound.roll);
			buf.writeInt(wound.seed);
			buf.writeLong(wound.time);
		}
	};

	public Wound {
		origin = new Vector3f(origin);
		dir = new Vector3f(dir);
	}

	/** Ticks this wound keeps bleeding (0 for non-bleeding wounds), including config scaling. */
	public int bleedTicks(float durationMultiplier) {
		return Math.round(this.type.bleedSeconds(this.severity) * 20.0F * durationMultiplier);
	}

	public boolean isBleeding(long gameTime, float durationMultiplier) {
		return this.type.bleeds() && gameTime - this.time < this.bleedTicks(durationMultiplier);
	}
}
