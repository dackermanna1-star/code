package com.jjkshowdown.util;

/**
 * Client particle-quality factor, readable from common entity code that spawns local client particles.
 * Set by the client config (LOW 0.3, MEDIUM 0.6, HIGH 1.0, ULTRA 1.6). Unused on dedicated servers.
 */
public final class ParticleDensity {
	public static volatile float factor = 1.0f;

	private ParticleDensity() {
	}

	/** Scale a particle count, keeping at least one when {@code base > 0}. */
	public static int scale(int base) {
		if (base <= 0) return 0;
		return Math.max(1, Math.round(base * factor));
	}

	/** Probability-based thinning for per-tick single particles. */
	public static boolean roll(java.util.function.DoubleSupplier rnd) {
		return rnd.getAsDouble() < factor;
	}
}
