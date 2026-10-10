package net.earthscapes.worldgen.density;

import net.minecraft.world.level.levelgen.DensityFunction;

/** Small, fast, deterministic hashing helpers for seeded per-cell randomness. */
public final class Hashing {
	private Hashing() {
	}

	/** SplitMix64 finaliser. */
	public static long mix(long z) {
		z += 0x9E3779B97F4A7C15L;
		z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L;
		z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL;
		return z ^ (z >>> 31);
	}

	public static long cell(long seed, int x, int z) {
		return mix(seed ^ (x * 0x632BE59BD9B4E019L) ^ (z * 0x85157AF5L + 0x5851F42D4C957F2DL));
	}

	/** Uniform double in [0, 1). */
	public static double unit(long h) {
		return (h >>> 11) * 0x1.0p-53;
	}

	/**
	 * Density functions are seeded indirectly: the world's {@code RandomState} instantiates the
	 * noises they reference. A seed is derived from such an instantiated noise so that custom
	 * functions vary per world while staying deterministic.
	 */
	public static long seedFrom(DensityFunction.NoiseHolder holder) {
		if (holder.noise() == null) {
			return 0L;
		}
		long a = Double.doubleToLongBits(holder.getValue(10.123, 20.456, 30.789));
		long b = Double.doubleToLongBits(holder.getValue(-41.5, 7.25, 93.125));
		long c = Double.doubleToLongBits(holder.getValue(77.7, -3.3, -55.5));
		return mix(mix(a) ^ Long.rotateLeft(mix(b), 21) ^ Long.rotateLeft(mix(c), 42));
	}
}
