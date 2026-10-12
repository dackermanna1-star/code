package com.extremesports.trick;

import io.netty.buffer.ByteBuf;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/**
 * One segment of a combo: an air (with its flips, whips, grabs and spin), a grind, or a manual.
 *
 * @param tricks    trick ids performed in this segment
 * @param multiples per trick: 1 single, 2 double, 3 triple
 * @param spin      absolute spin in degrees, rounded down to a multiple of 180
 * @param spinSign  +1 frontside / -1 backside
 * @param ticks     air time, grind time or manual time in ticks
 * @param holdTicks total ticks spent holding grabs
 * @param distance  blocks travelled (grinds)
 */
public record ComboEntry(
	Kind kind,
	List<String> tricks,
	List<Integer> multiples,
	int spin,
	int spinSign,
	int ticks,
	int holdTicks,
	float distance,
	LandingQuality quality,
	boolean fakie,
	boolean nollie
) {
	public enum Kind {
		AIR,
		GRIND,
		MANUAL
	}

	public static final int MAX_TRICKS = 16;

	public static final StreamCodec<ByteBuf, ComboEntry> STREAM_CODEC = StreamCodec.of(
		(buf, entry) -> {
			buf.writeByte(entry.kind.ordinal());
			int count = Math.min(entry.tricks.size(), MAX_TRICKS);
			buf.writeByte(count);
			for (int i = 0; i < count; i++) {
				ByteBufCodecs.stringUtf8(64).encode(buf, entry.tricks.get(i));
				buf.writeByte(entry.multiples.get(i));
			}
			buf.writeShort(entry.spin);
			buf.writeByte(entry.spinSign);
			buf.writeShort(Math.min(entry.ticks, Short.MAX_VALUE));
			buf.writeShort(Math.min(entry.holdTicks, Short.MAX_VALUE));
			buf.writeFloat(entry.distance);
			buf.writeByte(entry.quality.ordinal());
			buf.writeBoolean(entry.fakie);
			buf.writeBoolean(entry.nollie);
		},
		buf -> {
			Kind kind = Kind.values()[Math.floorMod(buf.readByte(), Kind.values().length)];
			int count = Math.min(buf.readUnsignedByte(), MAX_TRICKS);
			List<String> tricks = new ArrayList<>(count);
			List<Integer> multiples = new ArrayList<>(count);
			for (int i = 0; i < count; i++) {
				tricks.add(ByteBufCodecs.stringUtf8(64).decode(buf));
				multiples.add(Math.max(1, Math.min(3, (int) buf.readByte())));
			}
			int spin = buf.readShort();
			int spinSign = buf.readByte();
			int ticks = buf.readShort();
			int holdTicks = buf.readShort();
			float distance = buf.readFloat();
			LandingQuality quality = LandingQuality.byOrdinal(buf.readByte());
			boolean fakie = buf.readBoolean();
			boolean nollie = buf.readBoolean();
			return new ComboEntry(kind, tricks, multiples, spin, spinSign, ticks, holdTicks, distance, quality, fakie, nollie);
		}
	);

	public ComboEntry {
		tricks = List.copyOf(tricks);
		multiples = List.copyOf(multiples);
	}

	public ComboEntry withQuality(LandingQuality newQuality) {
		return new ComboEntry(kind, tricks, multiples, spin, spinSign, ticks, holdTicks, distance, newQuality, fakie, nollie);
	}
}
