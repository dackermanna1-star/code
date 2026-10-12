package com.mineception.dream;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Everything a laptop remembers: the seed its dream levels are generated from, and the blocks players changed in each
 * level (stored as edits on top of the generated terrain so the data stays small).
 */
public final class LaptopData {
	public static final int MAX_EDITS_PER_DEPTH = 16384;

	private final long seed;
	/** Per depth (index depth - 1): world cell index -> block id. Insertion ordered for stable serialization. */
	private final List<Map<Integer, Byte>> edits = new ArrayList<>(Theme.DEPTHS);

	public LaptopData(long seed) {
		this.seed = seed;
		for (int i = 0; i < Theme.DEPTHS; i++) {
			edits.add(new LinkedHashMap<>());
		}
	}

	public long seed() {
		return seed;
	}

	/** Read-only view of a level's edits (depth 1..4). */
	public Map<Integer, Byte> edits(int depth) {
		return Collections.unmodifiableMap(edits.get(depth - 1));
	}

	public int editCount(int depth) {
		return edits.get(depth - 1).size();
	}

	/**
	 * Records a block change. Returns false (and changes nothing) when the index or depth is out of range, or the level
	 * already holds the maximum number of edits and this cell has not been edited before.
	 */
	public boolean putEdit(int depth, int index, MiniBlock block) {
		if (depth < 1 || depth > Theme.DEPTHS || index < 0 || index >= MiniWorld.VOLUME) {
			return false;
		}
		Map<Integer, Byte> map = edits.get(depth - 1);
		if (!map.containsKey(index) && map.size() >= MAX_EDITS_PER_DEPTH) {
			return false;
		}
		map.put(index, (byte) block.id);
		return true;
	}

	/** Generates a level and applies its edits. */
	public MiniWorld build(int depth) {
		MiniWorld world = WorldGen.generate(seed, depth);
		applyEdits(world);
		return world;
	}

	/** Applies this laptop's edits for the world's depth onto an already generated world. */
	public void applyEdits(MiniWorld world) {
		for (Map.Entry<Integer, Byte> entry : edits.get(world.depth - 1).entrySet()) {
			world.set(entry.getKey(), MiniBlock.byId(entry.getValue() & 0xFF));
		}
	}

	public LaptopData copy() {
		LaptopData copy = new LaptopData(seed);
		for (int i = 0; i < Theme.DEPTHS; i++) {
			copy.edits.get(i).putAll(edits.get(i));
		}
		return copy;
	}

	@Override
	public boolean equals(Object o) {
		return o instanceof LaptopData other && other.seed == seed && other.edits.equals(edits);
	}

	@Override
	public int hashCode() {
		return Objects.hash(seed, edits);
	}

	@Override
	public String toString() {
		return "LaptopData[seed=" + seed + ", edits=" + edits.stream().map(Map::size).toList() + "]";
	}
}
