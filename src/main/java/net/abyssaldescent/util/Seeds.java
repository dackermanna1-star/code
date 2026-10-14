package net.abyssaldescent.util;

/** Stateless seed mixing (SplitMix64 finaliser) so every derived seed is well distributed and order independent. */
public final class Seeds {
	private Seeds() {
	}

	public static long mix(long a, long b) {
		return finalise(a * 0x9E3779B97F4A7C15L + finalise(b + 0x632BE59BD9B4E019L));
	}

	public static long finalise(long z) {
		z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L;
		z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL;
		return z ^ (z >>> 31);
	}

	public static long floorSeed(long worldSeed, int slot, int floor) {
		return mix(mix(worldSeed ^ 0x41B7A55D3E5CE17L, slot), floor);
	}

	/** Deterministic per-block hash in [0, 1), used for material variation independent of paint order. */
	public static float hash01(long salt, int x, int y, int z) {
		long h = finalise(salt ^ (x * 0x1F1F1F1FL) ^ ((long) y << 21) ^ (z * 0x5DEECE66DL));
		return (h >>> 40) / (float) (1L << 24);
	}

	public static int hashInt(long salt, int x, int y, int z, int bound) {
		return Math.min(bound - 1, (int) (hash01(salt, x, y, z) * bound));
	}
}
