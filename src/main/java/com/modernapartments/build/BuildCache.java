package com.modernapartments.build;

import com.modernapartments.ModernApartments;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Generated buildings are cached so world generation can copy one chunk-sized slice at a time
 * without regenerating the whole complex for every chunk. Thread-safe; at most a few buildings are kept.
 */
public final class BuildCache {
	private static final int MAX_ENTRIES = 4;
	private static final Map<String, BlockBuffer> CACHE = new LinkedHashMap<>(8, 0.75F, true) {
		@Override
		protected boolean removeEldestEntry(Map.Entry<String, BlockBuffer> eldest) {
			return size() > MAX_ENTRIES;
		}
	};
	private static final Map<String, Object> LOCKS = new ConcurrentHashMap<>();

	private BuildCache() {
	}

	public static BlockBuffer get(ComplexType type, long seed) {
		String key = type.id() + "#" + seed;
		synchronized (CACHE) {
			BlockBuffer cached = CACHE.get(key);
			if (cached != null) {
				return cached;
			}
		}
		Object lock = LOCKS.computeIfAbsent(key, k -> new Object());
		synchronized (lock) {
			synchronized (CACHE) {
				BlockBuffer cached = CACHE.get(key);
				if (cached != null) {
					return cached;
				}
			}
			long start = System.nanoTime();
			BlockBuffer buffer = generate(type, seed);
			ModernApartments.LOGGER.info("Generated {} (seed {}) in {} ms: {} block states, {} palette entries",
				type.id(), seed, (System.nanoTime() - start) / 1_000_000, buffer.volume(), buffer.paletteSize());
			synchronized (CACHE) {
				CACHE.put(key, buffer);
			}
			LOCKS.remove(key);
			return buffer;
		}
	}

	/** Builds without caching (validation, tests). */
	public static BlockBuffer generate(ComplexType type, long seed) {
		BlockBuffer buffer = type.newBuilder().build(seed);
		if (buffer.sizeX != type.sizeX() || buffer.sizeY != type.sizeY() || buffer.sizeZ != type.sizeZ()) {
			throw new IllegalStateException("Builder for " + type.id() + " produced a buffer of the wrong size");
		}
		ConnectionResolver.resolve(buffer);
		return buffer;
	}
}
