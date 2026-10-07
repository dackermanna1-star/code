package dev.visceral.wound;

import com.mojang.serialization.Codec;
import io.netty.buffer.ByteBuf;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;

/** Immutable list of wounds attached to an entity. Always replaced, never mutated, so attachment sync triggers. */
public record WoundData(List<Wound> wounds) {
	public static final WoundData EMPTY = new WoundData(List.of());
	public static final Codec<WoundData> CODEC = Wound.CODEC.listOf().xmap(WoundData::new, WoundData::wounds);
	public static final StreamCodec<ByteBuf, WoundData> STREAM_CODEC = Wound.STREAM_CODEC
		.apply(ByteBufCodecs.list(64))
		.map(WoundData::new, WoundData::wounds);

	public WoundData {
		wounds = List.copyOf(wounds);
	}

	/** Returns a copy with {@code wound} appended, dropping healed wounds and the oldest ones beyond {@code max}. */
	public WoundData with(Wound wound, int max, long gameTime, long healTicks) {
		List<Wound> list = new ArrayList<>(this.wounds.size() + 1);
		for (Wound existing : this.wounds) {
			if (gameTime - existing.time() < healTicks) {
				list.add(existing);
			}
		}
		list.add(wound);
		while (list.size() > max) {
			list.removeFirst();
		}
		return new WoundData(list);
	}

	public WoundData pruned(long gameTime, long healTicks) {
		List<Wound> list = new ArrayList<>(this.wounds.size());
		for (Wound existing : this.wounds) {
			if (gameTime - existing.time() < healTicks) {
				list.add(existing);
			}
		}
		return list.size() == this.wounds.size() ? this : new WoundData(list);
	}

	public boolean isEmpty() {
		return this.wounds.isEmpty();
	}
}
