package dev.visceral.client.wound;

import dev.visceral.wound.Wound;
import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import it.unimi.dsi.fastutil.ints.Int2ObjectOpenHashMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectMap;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import java.util.function.IntPredicate;

/** Client cache of where each wound landed on its entity's model. */
public final class ClientWounds {
	private static final Int2ObjectMap<Long2ObjectMap<WoundPlacement>> PLACEMENTS = new Int2ObjectOpenHashMap<>();

	private ClientWounds() {
	}

	public static long key(Wound wound) {
		return ((long) wound.seed() << 32) ^ wound.time();
	}

	public static WoundPlacement get(int entityId, Wound wound) {
		Long2ObjectMap<WoundPlacement> map = PLACEMENTS.get(entityId);
		return map == null ? null : map.get(key(wound));
	}

	public static void put(int entityId, Wound wound, WoundPlacement placement) {
		PLACEMENTS.computeIfAbsent(entityId, id -> new Long2ObjectOpenHashMap<>()).put(key(wound), placement);
	}

	/** Drops placements of entities for which {@code alive} returns false. */
	public static void retain(IntPredicate alive) {
		PLACEMENTS.int2ObjectEntrySet().removeIf(entry -> !alive.test(entry.getIntKey()));
	}

	public static void clear() {
		PLACEMENTS.clear();
	}
}
