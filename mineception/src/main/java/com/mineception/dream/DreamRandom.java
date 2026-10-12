package com.mineception.dream;

import java.util.List;

/**
 * Deterministic random numbers for world generation (SplitMix64). Pure integer arithmetic, so the server and every
 * client produce exactly the same sequence for a seed on any JVM.
 */
public final class DreamRandom {
	private long state;

	public DreamRandom(long seed) {
		this.state = seed;
	}

	/** A generator for one sub-task, independent of how many numbers this one has handed out since. */
	public DreamRandom fork(long salt) {
		return new DreamRandom(mix(state ^ mix(salt + 0x632BE59BD9B4E019L)));
	}

	public long nextLong() {
		state += 0x9E3779B97F4A7C15L;
		return mix(state);
	}

	/** Uniform in [0, bound). */
	public int nextInt(int bound) {
		if (bound <= 0) {
			throw new IllegalArgumentException("bound must be positive");
		}
		return (int) Long.remainderUnsigned(nextLong() >>> 1, bound);
	}

	/** Uniform in [min, max], both inclusive. */
	public int range(int min, int max) {
		return min + nextInt(max - min + 1);
	}

	/** Uniform in [0, 1). */
	public double nextDouble() {
		return (nextLong() >>> 11) * 0x1.0p-53;
	}

	public boolean chance(double probability) {
		return nextDouble() < probability;
	}

	public boolean nextBoolean() {
		return (nextLong() & 1L) != 0L;
	}

	/** -1 or +1. */
	public int sign() {
		return nextBoolean() ? 1 : -1;
	}

	@SafeVarargs
	public final <T> T pick(T... options) {
		return options[nextInt(options.length)];
	}

	public <T> T pick(List<T> options) {
		return options.get(nextInt(options.size()));
	}

	/** Stafford's variant 13 finalizer: a strong 64-bit mixing function. */
	public static long mix(long z) {
		z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L;
		z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL;
		return z ^ (z >>> 31);
	}

	/** A well-mixed hash of a seed and integer coordinates, for noise and per-cell decisions. */
	public static long hash(long seed, int a, int b, int c) {
		long h = mix(seed ^ 0x9E3779B97F4A7C15L);
		h = mix(h ^ (a * 0xC2B2AE3D27D4EB4FL));
		h = mix(h ^ (b * 0x165667B19E3779F9L));
		return mix(h ^ (c * 0x27D4EB2F165667C5L));
	}

	/** Uniform in [0, 1) from a hash of a seed and coordinates. */
	public static double hash01(long seed, int a, int b, int c) {
		return (hash(seed, a, b, c) >>> 11) * 0x1.0p-53;
	}
}
