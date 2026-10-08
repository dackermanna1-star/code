package dev.portalgun.world.density;

import net.minecraft.world.level.levelgen.DensityFunction;

/** Deterministic per-cell randomness for the cellular density functions. */
final class CellHash {
	private CellHash() {
	}

	static long mix(long z) {
		z = (z ^ (z >>> 33)) * 0xff51afd7ed558ccdL;
		z = (z ^ (z >>> 33)) * 0xc4ceb9fe1a85ec53L;
		return z ^ (z >>> 33);
	}

	static long hash(long seed, int x, int y, int z) {
		long h = mix(seed ^ (x * 0x9E3779B97F4A7C15L));
		h = mix(h ^ (y * 0xC2B2AE3D27D4EB4FL));
		return mix(h ^ (z * 0x165667B19E3779F9L));
	}

	/** Next value of a hash chain. */
	static long next(long h) {
		return mix(h + 0x9E3779B97F4A7C15L);
	}

	/** Uniform [0, 1). */
	static double unit(long h) {
		return (h >>> 11) * 0x1.0p-53;
	}

	/**
	 * A world-seed dependent seed: the noise holder is seeded from the world seed once the RandomState wires it, so a
	 * few fixed samples identify it. Unwired holders (codec round trips, data validation) get a constant.
	 */
	static long seedOf(DensityFunction.NoiseHolder noise, int salt) {
		if (noise.noise() == null) {
			return 0x5DEECE66DL + salt;
		}
		double a = noise.getValue(0.1234, 5.678, 9.1011);
		double b = noise.getValue(-31.7, 2.25, 77.3);
		double c = noise.getValue(1000.5, -3.3, -250.1);
		long h = mix(Double.doubleToLongBits(a) * 31L + Double.doubleToLongBits(b));
		h = mix(h ^ Double.doubleToLongBits(c));
		return mix(h + salt * 0x27D4EB2F165667C5L);
	}

	static double smoothstep(double edge0, double edge1, double x) {
		double t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
		return t * t * (3.0 - 2.0 * t);
	}

	static double clampD(double v, double lo, double hi) {
		return v < lo ? lo : (v > hi ? hi : v);
	}
}
