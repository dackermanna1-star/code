package dev.visceral.state;

import com.mojang.serialization.Codec;
import io.netty.buffer.ByteBuf;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.network.codec.StreamCodec;

/** Immutable list of wounds stored as an entity attachment (persistent and synced to trackers). */
public record WoundList(List<Wound> wounds) {
	public static final WoundList EMPTY = new WoundList(List.of());
	public static final Codec<WoundList> CODEC = Wound.CODEC.listOf().xmap(WoundList::new, WoundList::wounds);
	public static final StreamCodec<ByteBuf, WoundList> STREAM_CODEC = Wound.LIST_STREAM_CODEC.map(WoundList::new, WoundList::wounds);

	public WoundList {
		wounds = List.copyOf(wounds);
	}

	public boolean isEmpty() {
		return wounds.isEmpty();
	}

	/** Adds a wound, evicting the least severe/oldest when over capacity. */
	public WoundList with(Wound wound, int max) {
		List<Wound> list = new ArrayList<>(wounds);
		list.add(wound);
		while (list.size() > max && !list.isEmpty()) {
			int worst = 0;
			for (int i = 1; i < list.size(); i++) {
				Wound a = list.get(i), b = list.get(worst);
				if (a.type() == WoundType.SEVERED) continue;
				if (b.type() == WoundType.SEVERED || a.severity() < b.severity() || (a.severity() == b.severity() && a.time() < b.time())) worst = i;
			}
			list.remove(worst);
		}
		return new WoundList(list);
	}

	public WoundList withoutOldestHealable() {
		int idx = -1;
		for (int i = 0; i < wounds.size(); i++) {
			Wound w = wounds.get(i);
			if (w.type() == WoundType.SEVERED) continue;
			if (idx < 0 || w.time() < wounds.get(idx).time()) idx = i;
		}
		if (idx < 0) return this;
		List<Wound> list = new ArrayList<>(wounds);
		list.remove(idx);
		return new WoundList(list);
	}

	public float severity(BodyRegion region) {
		float s = 0;
		for (Wound w : wounds) if (w.region() == region) s += w.severity();
		return s;
	}

	public boolean isSevered(BodyRegion region) {
		for (Wound w : wounds) if (w.region() == region && w.type() == WoundType.SEVERED) return true;
		return false;
	}
}
